import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import ChessBoard from "../chess/ChessBoard";
import { recordAttempt, type SkillId, type Learner } from "./learnerModel";
import { loadLearner, saveLearner, loadReviews, saveReviews } from "./learnerStorage";
import { isDue, scheduleAfterAttempt, createReviewItem, type ReviewItem } from "./spaced";
import PracticeSession from "./PracticeSession";
import { PRACTICE_BANK, MOTIF_LABEL, type Motif } from "./practiceBank";
import { loadPractice, getLevel } from "./adaptive";
import { LanguagePicker } from "../i18n/LanguagePicker";
import {
  LESSONS,
  loadLessonDone,
  saveLessonDone,
  isLessonDone,
  nextLesson,
  type Lesson,
} from "./lessons";

const SKILL_FOR_LESSON: Record<string, SkillId> = {
  "l-board": "recognition",
  "l-pawns": "opening",
  "l-knights": "opening",
  "l-bishops": "opening",
  "l-rooks": "opening",
  "l-king-check": "checks",
  "l-castling": "kingSafety",
  "l-promotion": "endgame",
  "l-captures": "hanging",
  "l-mate1": "checks",
  "l-opening": "opening",
};

const SKILL_FOR_MOTIF: Record<string, SkillId> = {
  hanging: "hanging",
  check: "checks",
  captures: "captures",
  kingSafety: "kingSafety",
  opening: "opening",
  endgame: "endgame",
  calculation: "calculation",
  tactic: "calculation",
};

const MOTIF_FOR_SKILL: Record<string, Motif | "mixed"> = {
  hanging: "hanging",
  checks: "mate",
  captures: "captures",
  kingSafety: "mate",
  opening: "opening",
  endgame: "endgame",
  calculation: "calculation",
  recognition: "hanging",
  moveChoice: "calculation",
  transfer: "hanging",
  execution: "captures",
};

const FRIENDLY_SKILL: Record<string, string> = {
  recognition: "Board vision",
  calculation: "Calculation",
  hanging: "Spotting hanging pieces",
  checks: "Checks & mate",
  captures: "Captures",
  kingSafety: "King safety",
  opening: "Opening moves",
  endgame: "Endgames",
};

export function LearnPage({
  tag,
  setTag,
  startRequest,
  onStartRequestConsumed,
}: {
  tag: string;
  setTag: (t: string) => void;
  startRequest?: { lessonId?: string; skillId?: string; motif?: string } | null;
  onStartRequestConsumed?: () => void;
}) {
  const [learner, setLearner] = useState<Learner>(() => loadLearner());
  const [reviews, setReviews] = useState<ReviewItem[]>(() => loadReviews());
  const [done, setDone] = useState(() => loadLessonDone());

  const [lessonId, setLessonId] = useState<string | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [lessonPhase, setLessonPhase] = useState<"steps" | "drill">("steps");
  const [lessonBoardFen, setLessonBoardFen] = useState<string | null>(null);
  const [lessonFeedback, setLessonFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [lessonHint, setLessonHint] = useState(false);

  const [sessionMotif, setSessionMotif] = useState<Motif | "mixed" | null>(null);
  const [practiceStore, setPracticeStore] = useState(() => loadPractice());

  const playerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => saveLearner(learner), [learner]);
  useEffect(() => saveReviews(reviews), [reviews]);
  useEffect(() => saveLessonDone(done), [done]);

  const lesson = useMemo(() => LESSONS.find((l) => l.id === lessonId) ?? null, [lessonId]);
  const courseProgress = LESSONS.filter((l) => isLessonDone(done, l.id)).length;

  const scrollToPlayer = useCallback(() => {
    window.setTimeout(() => playerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }, []);

  const openLesson = useCallback((id: string) => {
    const l = LESSONS.find((x) => x.id === id);
    if (!l) return;
    setLessonId(id);
    setStepIdx(0);
    setLessonPhase(l.drill ? "steps" : "steps");
    setLessonBoardFen(l.steps[0]?.fen ?? l.drill?.fen ?? null);
    setLessonFeedback(null);
    setLessonHint(false);
    setSessionMotif(null);
    scrollToPlayer();
  }, [scrollToPlayer]);

  const openSession = useCallback((m: Motif | "mixed") => {
    setSessionMotif(m);
    setLessonId(null);
    scrollToPlayer();
  }, [scrollToPlayer]);

  /** Brain / Home deep-links: open the matching lesson or puzzle directly. */
  useEffect(() => {
    if (!startRequest) return;
    if (startRequest.lessonId) openLesson(startRequest.lessonId);
    else if (startRequest.skillId || startRequest.motif) {
      const motif = startRequest.motif ?? MOTIF_FOR_SKILL[startRequest.skillId ?? ""] ?? "hanging";
      openSession((motif === "mixed" ? "mixed" : motif) as Motif | "mixed");
    }
    onStartRequestConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startRequest]);

  const recordOutcome = useCallback((skillId: SkillId, correct: boolean, hinted: boolean, difficulty: number) => {
    setLearner((prev) => recordAttempt(prev, { skillId, at: new Date().toISOString(), correct, hinted, difficulty }));
    setReviews((prev) => {
      const base = prev.find((r) => r.skillId === skillId) ?? createReviewItem(skillId, new Date().toISOString());
      const updated = scheduleAfterAttempt(base, { correct, hinted, at: new Date().toISOString() });
      return [...prev.filter((r) => r.skillId !== skillId), updated];
    });
  }, []);

  /* ------------------------- lesson drill ------------------------- */

  const onLessonMove = useCallback(
    (from: Square, to: Square, promo?: "q" | "r" | "b" | "n") => {
      if (!lesson?.drill || !lessonBoardFen) return false;
      const c = new Chess(lessonBoardFen);
      const legal = c.moves({ verbose: true, square: from }).some((m) => m.to === to);
      if (!legal) return false;
      const played = `${from}${to}${promo ?? ""}`;
      const best = lesson.drill.bestUci;
      const correct = played.slice(0, 4) === best.slice(0, 4) && (best.length === 4 || played === best);
      if (!correct) {
        setLessonFeedback({ ok: false, text: "Not the move we're practising — read the goal, then try again." });
        return false; // wrong drill moves are not played on the board
      }
      const res = c.move({ from, to, promotion: promo });
      if (!res) return false;
      setLessonBoardFen(c.fen());
      setLessonFeedback({ ok: true, text: lesson.drill.why });
      recordOutcome(SKILL_FOR_LESSON[lesson.id] ?? "recognition", true, lessonHint, 0.4);
      setDone((prev) => (prev.some((d) => d.id === lesson.id) ? prev : [...prev, { id: lesson.id, completedAt: new Date().toISOString() }]));
      return true;
    },
    [lesson, lessonBoardFen, lessonHint, recordOutcome]
  );

  /* ------------------------- shared board helpers ------------------------- */

  const getLegalTargets = useCallback((fen: string | null) => (from: Square) => {
    if (!fen) return [];
    try {
      return new Chess(fen).moves({ verbose: true, square: from }).map((m) => m.to as Square);
    } catch {
      return [];
    }
  }, []);

  const isPromotionMove = useCallback((fen: string | null) => (from: Square, to: Square) => {
    if (!fen) return false;
    try {
      const c = new Chess(fen);
      const piece = c.get(from);
      if (!piece || piece.type !== "p") return false;
      return c.moves({ verbose: true, square: from }).some((m) => m.to === to && m.promotion);
    } catch {
      return false;
    }
  }, []);

  /* ------------------------- render ------------------------- */

  const dueCount = reviews.filter((r) => isDue(r, new Date().toISOString())).length;
  const recommended = nextLesson(done);

  return (
    <section className="section">
      {/* Header + course progress */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Learn chess — from your first move to checkmate</h2>
        <p style={{ color: "var(--muted)", fontSize: "0.95rem", marginTop: 6 }}>
          A short interactive course: every lesson shows the idea on a real board, then you play the move yourself.
          Your progress is saved on this device{dueCount > 0 ? ` · ${dueCount} skill${dueCount !== 1 ? "s" : ""} ready for review` : ""}.
        </p>
        <div className="course-progress" style={{ marginTop: 12 }}>
          <div className="course-progress__bar">
            <div className="course-progress__fill" style={{ width: `${(courseProgress / LESSONS.length) * 100}%` }} />
          </div>
          <span className="course-progress__label"><b>{courseProgress}</b> of {LESSONS.length} lessons done</span>
        </div>
      </div>

      {/* The course */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Your course</h3>
        <p style={{ color: "var(--muted)", fontSize: "0.86rem", marginTop: 4 }}>Start at the top — each lesson takes 2–4 minutes.</p>
        <ol className="lesson-list" style={{ listStyle: "none", display: "grid", gap: 8, marginTop: 12, padding: 0 }}>
          {LESSONS.map((l, i) => {
            const isDone = isLessonDone(done, l.id);
            const active = lessonId === l.id;
            return (
              <li key={l.id}>
                <button
                  type="button"
                  className={`lesson-row ${active ? "lesson-row--active" : ""} ${isDone ? "lesson-row--done" : ""}`}
                  onClick={() => openLesson(l.id)}
                  aria-current={active ? "true" : undefined}
                >
                  <span className="lesson-row__num" aria-hidden="true">{isDone ? "✓" : i + 1}</span>
                  <span className="lesson-row__body">
                    <strong>{l.title}</strong>
                    <span className="lesson-row__blurb">{l.blurb}</span>
                  </span>
                  <span className="lesson-row__meta">{l.minutes} min{l.drill ? " · play it" : ""}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Lesson player */}
      {lesson && (
        <div className="card practice-card" ref={playerRef} style={{ marginTop: 0, marginBottom: 16, scrollMarginTop: 84 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <h3>{lesson.title} {isLessonDone(done, lesson.id) && <span className="pill pill--ok" style={{ marginLeft: 8 }}>done</span>}</h3>
            <button className="btn btn--ghost btn--sm" onClick={() => { setLessonId(null); setLessonBoardFen(null); }}>Close</button>
          </div>

          {lessonPhase === "steps" ? (
            <>
              <div className="lesson-step__head" style={{ marginTop: 8 }}>
                <span className="pill pill--brass">Step {stepIdx + 1} of {lesson.steps.length}</span>
                <strong className="lesson-step__heading">{lesson.steps[stepIdx].heading}</strong>
              </div>
              <p className="lesson-step__text">{lesson.steps[stepIdx].text}</p>

              {lessonBoardFen && (
                <div style={{ maxWidth: 380, margin: "10px auto" }}>
                  <ChessBoard
                    fen={lessonBoardFen}
                    orientation="w"
                    lastMove={null}
                    getLegalTargets={() => []}
                    isPromotionMove={() => false}
                    tryMove={() => false}
                    canPickUp={() => false}
                    hideLegend
                  />
                </div>
              )}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 8 }}>
                <button className="btn btn--ghost btn--sm" disabled={stepIdx === 0} onClick={() => {
                  const next = Math.max(0, stepIdx - 1);
                  setStepIdx(next);
                  if (lesson.steps[next].fen) setLessonBoardFen(lesson.steps[next].fen!);
                  setLessonFeedback(null);
                }}>← Back</button>
                {stepIdx < lesson.steps.length - 1 ? (
                  <button className="btn btn--primary btn--sm" onClick={() => {
                    const next = stepIdx + 1;
                    setStepIdx(next);
                    if (lesson.steps[next].fen) setLessonBoardFen(lesson.steps[next].fen!);
                  }}>Next →</button>
                ) : lesson.drill ? (
                  <button className="btn btn--primary btn--sm" onClick={() => {
                    setLessonPhase("drill");
                    setLessonBoardFen(lesson.drill!.fen);
                    setLessonFeedback(null);
                  }}>Now you play it →</button>
                ) : (
                  <button className="btn btn--primary btn--sm" onClick={() => {
                    setDone((prev) => prev.some((d) => d.id === lesson.id) ? prev : [...prev, { id: lesson.id, completedAt: new Date().toISOString() }]);
                    const next = LESSONS[LESSONS.findIndex((x) => x.id === lesson.id) + 1];
                    if (next) openLesson(next.id);
                  }}>Finish — next lesson →</button>
                )}
              </div>
            </>
          ) : (
            lesson.drill && (
              <>
                <div className="drill__goal" style={{ marginTop: 8 }}>
                  <span className="pill pill--brass">Your turn</span>
                  <strong>{lesson.drill.goal}</strong>
                </div>
                <div style={{ maxWidth: 380, margin: "10px auto" }}>
                  <ChessBoard
                    fen={lessonBoardFen ?? lesson.drill.fen}
                    orientation="w"
                    lastMove={null}
                    getLegalTargets={getLegalTargets(lessonBoardFen ?? lesson.drill.fen)}
                    isPromotionMove={isPromotionMove(lessonBoardFen ?? lesson.drill.fen)}
                    tryMove={onLessonMove}
                    hintText="You play White — tap one of your pieces, then a highlighted square."
                  />
                </div>
                {lessonFeedback && (
                  <div className={`practice-verdict ${lessonFeedback.ok ? "practice-verdict--ok" : "practice-verdict--bad"}`} role="status">
                    {lessonFeedback.ok ? <><strong>✓ Correct!</strong> {lessonFeedback.text}</> : <><strong>✗ Try again.</strong> {lessonFeedback.text}</>}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  {!lessonFeedback?.ok && (
                    <button className="btn btn--quiet btn--sm" onClick={() => setLessonHint(true)}>Show hint</button>
                  )}
                  {lessonHint && !lessonFeedback?.ok && <span className="pill" style={{ alignSelf: "center" }}>{lesson.drill.hint}</span>}
                  <button className="btn btn--ghost btn--sm" onClick={() => {
                    setLessonBoardFen(lesson.drill!.fen);
                    setLessonFeedback(null);
                    setLessonHint(false);
                  }}>Reset position</button>
                  {lessonFeedback?.ok && (() => {
                    const idx = LESSONS.findIndex((x) => x.id === lesson.id);
                    const next = LESSONS[idx + 1];
                    return next ? (
                      <button className="btn btn--primary btn--sm" onClick={() => openLesson(next.id)}>Next lesson: {next.title} →</button>
                    ) : (
                      <span className="pill pill--ok">Course complete! Try the puzzles below.</span>
                    );
                  })()}
                </div>
              </>
            )
          )}
        </div>
      )}

      {/* Adaptive practice session */}
      {sessionMotif && (
        <PracticeSession
          key={sessionMotif + "-" + practiceStore.sessions}
          motif={sessionMotif}
          onExit={() => { setSessionMotif(null); setPracticeStore(loadPractice()); }}
        />
      )}

      {/* Smart practice */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Smart practice — it adapts to you</h3>
        <p style={{ color: "var(--muted)", fontSize: "0.86rem", marginTop: 4 }}>
          5 positions per session. Two clean solves in a row step the difficulty up; misses step it down.
          Stuck? Hint <b>steps</b> walk you to the answer — where to look, then what to see.
        </p>
        <div className="puzzle-grid">
          <button type="button" className="puzzle-card puzzle-card--boss" onClick={() => openSession("mixed")}>
            <strong>Smart mix — picked for you</strong>
            <span className="puzzle-card__meta">All skills · starts easy, follows you</span>
            <span className="puzzle-card__go">Start session →</span>
          </button>
          {(["mate", "hanging", "captures", "calculation", "endgame", "opening"] as Motif[]).map((m) => {
            const lv = getLevel(practiceStore, m);
            const n = PRACTICE_BANK.filter((b) => b.motif === m).length;
            return (
              <button key={m} type="button" className="puzzle-card" onClick={() => openSession(m)}>
                <strong>{MOTIF_LABEL[m]}</strong>
                <span className="puzzle-card__meta">Level {lv} of 3 · {n} positions</span>
                <span className="puzzle-card__go">Practise →</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Language (kept) */}
      <div className="card">
        <h3>Language</h3>
        <p style={{ color: "var(--muted)", fontSize: "0.86rem", marginTop: 4 }}>Interface and coaching text — 8 languages.</p>
        <LanguagePicker value={tag} onChange={setTag} />
      </div>
    </section>
  );
}

function difficultyDots(d: number): string {
  const n = Math.max(1, Math.min(5, Math.round(d * 5)));
  return "●".repeat(n) + "○".repeat(5 - n);
}
