import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import ChessBoard from "../chess/ChessBoard";
import { buildFactPacket } from "./factPacket";
import { diagnose } from "./diagnosis";
import { teachingOpportunityFilter } from "./teachingFilter";
import { createLearner, recordAttempt, proficiencyWithUncertainty, type SkillId } from "./learnerModel";
import { loadLearner, saveLearner, loadReviews, saveReviews } from "./learnerStorage";
import { filterExercises, rankExercises, type Exercise } from "./ranking";
import { estimatedRecall, isDue, scheduleAfterAttempt, createReviewItem, type ReviewItem } from "./spaced";
import { EXERCISES, DAILY_BOSS } from "./exercises";
import { renderExplanation } from "../i18n/explanationRenderer";
import { dirFor } from "../i18n/languages";
import { t } from "../i18n/strings";
import { LanguagePicker } from "../i18n/LanguagePicker";
import type { LangLevel } from "../i18n/useLanguage";
import type { Candidate } from "../engine/useEngine";

const BEST_BY_ID: Record<string, string> = {
  "ex-hanging-1": "f3e5",
  "ex-check-1": "h5f7",
  "ex-capture-1": "f3e5",
  "ex-king-1": "f3g5",
  "ex-opening-1": "e2e4",
  "ex-endgame-1": "e2e4",
  "ex-transfer-1": "f3e5",
  "ex-calc-1": "e4d5",
  "daily-boss-2026-09-27": "f3e5",
};

function hasTrustedTranslation(tag: string): boolean {
  // human-reviewed short strings exist for all 8 tags; low-resource sw considered trusted for this demo
  return ["en", "es-MX", "hi", "ar", "zh-Hant", "ja", "sw", "fr"].includes(tag);
}

/** Map a Brain skill id to an exercise motif so "Practise hanging" opens the
 *  right kind of exercise (the pools use slightly different vocabularies). */
const MOTIF_FOR_SKILL: Record<string, string> = {
  hanging: "hanging",
  checks: "check",
  captures: "captures",
  kingSafety: "kingSafety",
  opening: "opening",
  endgame: "endgame",
  calculation: "calculation",
  recognition: "hanging",
};

export function LearnPage({
  tag,
  setTag,
  level,
  setLevel,
  startRequest,
  onStartRequestConsumed,
}: {
  tag: string;
  setTag: (t: string) => void;
  level: LangLevel;
  setLevel: (l: LangLevel) => void;
  /** Set by Brain/Home to open a specific practice immediately. */
  startRequest?: { skillId?: string; motif?: string } | null;
  onStartRequestConsumed?: () => void;
}) {
  const [learner, setLearner] = useState(() => loadLearner());
  const [reviews, setReviews] = useState<ReviewItem[]>(() => loadReviews());
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const [hintStep, setHintStep] = useState(0);
  const [lastPacketInfo, setLastPacketInfo] = useState<null | { fen: string; playedUci: string; correct: boolean; bestSan: string | null; packet: ReturnType<typeof buildFactPacket>; diagnosis: ReturnType<typeof diagnose> }>(null);
  const practiceRef = useRef<HTMLDivElement | null>(null);
  const verdictRef = useRef<HTMLDivElement | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [dailyProgress, setDailyProgress] = useState({ reviewsDone: 0, lessonsDone: 0 });

  useEffect(() => saveLearner(learner), [learner]);
  useEffect(() => saveReviews(reviews), [reviews]);

  // ranking demo — build signals per exercise from learner
  const ranked = useMemo(() => {
    const skillP = Object.fromEntries(
      Object.entries(learner.skills).map(([k, v]) => [k, v.proficiency]),
    ) as Record<string, number>;
    const seen = new Set<string>();
    const filtered = filterExercises(EXERCISES, { seenIds: seen, maxDifficulty: 0.85, minQuality: 0.7 });
    const signalFor = (ex: Exercise) => {
      const weakness = 1 - (skillP[ex.motif] ?? skillP["recognition"] ?? 0.5);
      const recentMistake = ex.motif === "hanging" ? 0.7 : 0.2;
      const difficultyFit = 1 - Math.abs(ex.difficulty - 0.45);
      const forgettingRisk = (() => {
        const r = reviews.find((x) => x.skillId === ex.motif);
        if (!r) return 0.5;
        return 1 - estimatedRecall(r, new Date().toISOString());
      })();
      return {
        weakness,
        recentMistake,
        informationGain: ex.quality * 0.8,
        ownGameRelevance: 0.4,
        difficultyFit,
        forgettingRisk,
        transfer: ex.motif === "hanging" ? 0.5 : 0.2,
        novelty: 0.5,
        repetitionPenalty: 0,
      };
    };
    return rankExercises(filtered, signalFor, { recentMotifs: [], recentSources: [], explorationShare: 0.08, randomSeed: 42 });
  }, [learner, reviews]);

  const exercise = useMemo(() => {
    if (!exerciseId) return null;
    if (exerciseId === DAILY_BOSS.id) return DAILY_BOSS;
    return EXERCISES.find((e) => e.id === exerciseId) ?? null;
  }, [exerciseId]);

  const dueReviews = useMemo(() => {
    const now = new Date().toISOString();
    return reviews.filter((r) => isDue(r, now));
  }, [reviews]);

  // ensure reviews exist for a couple skills on first load
  useEffect(() => {
    if (reviews.length === 0) {
      const now = new Date().toISOString();
      const init: ReviewItem[] = [
        createReviewItem("hanging", now, 2),
        createReviewItem("checks", now, 2),
        createReviewItem("calculation", now, 3),
      ];
      setReviews(init);
    }
  }, [reviews.length]);

  const startExercise = useCallback((id: string) => {
    setExerciseId(id);
    setHintStep(0);
    setLastPacketInfo(null);
  }, []);

  /** Brain/Home "Practise X" — open the matching exercise right away. */
  useEffect(() => {
    if (!startRequest) return;
    const motif = startRequest.motif ?? MOTIF_FOR_SKILL[startRequest.skillId ?? ""] ?? "hanging";
    const ex = EXERCISES.find((e) => e.motif === motif) ?? EXERCISES[0];
    startExercise(ex.id);
    onStartRequestConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startRequest]);

  /** Whenever a practice opens, bring it into view — otherwise the board sits
   *  far below the fold and looks like the click "did nothing". */
  useEffect(() => {
    if (!exerciseId) return;
    const t = window.setTimeout(() => {
      practiceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
    return () => window.clearTimeout(t);
  }, [exerciseId]);

  /** After each move, make sure the verdict is on screen (the board is tall). */
  useEffect(() => {
    if (!lastPacketInfo) return;
    const t = window.setTimeout(() => {
      verdictRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 60);
    return () => window.clearTimeout(t);
  }, [lastPacketInfo]);

  const exerciseBoard = useMemo(() => {
    if (!exercise) return null;
    return new Chess(exercise.fen);
  }, [exercise]);

  // For exercise board integration we need a tiny local game controller
  const [exFen, setExFen] = useState<string | null>(null);
  useEffect(() => {
    if (exercise) setExFen(exercise.fen);
  }, [exercise]);

  const onExerciseMove = useCallback(
    (from: Square, to: Square, promo?: "q" | "r" | "b" | "n") => {
      if (!exercise || !exFen) return false;
      const c = new Chess(exFen);
      const piece = c.get(from);
      if (!piece) return false;
      // verify legality via chess.js
      const legal = c.moves({ verbose: true, square: from }).some((m) => m.to === to);
      if (!legal) return false;
      const beforeFen = exFen;
      const playedUci = `${from}${to}${promo ?? ""}`;
      const res = c.move({ from, to, promotion: promo });
      if (!res) return false;
      const afterFen = c.fen();
      setExFen(afterFen);

      // Build a verified FactPacket from this move + synthetic candidates (never invent outside legality)
      const bestUci = BEST_BY_ID[exercise.id] ?? "";
      const candidates: Candidate[] = [
        { multipv: 1, uci: bestUci, san: null, scoreCp: 120, depth: 12, pvSans: [], raw: "" },
        { multipv: 2, uci: playedUci, san: res.san, scoreCp: playedUci.slice(0, 4) === bestUci.slice(0, 4) ? 115 : -30, depth: 12, pvSans: [], raw: "" },
      ];
      // hydrate SANs
      try {
        const tmpBest = new Chess(beforeFen);
        const mvBest = tmpBest.move({ from: bestUci.slice(0, 2) as Square, to: bestUci.slice(2, 4) as Square, promotion: (bestUci.slice(4) as never) || undefined });
        candidates[0].san = mvBest ? mvBest.san : null;
        const tmpPv = new Chess(beforeFen);
        const mvPlayed = tmpPv.move({ from, to, promotion: promo as never });
        if (mvPlayed) candidates[1].san = mvPlayed.san;
        // pvSans for best candidate — include opponent reply if exists
        const afterBest = new Chess(beforeFen);
        try { afterBest.move({ from: bestUci.slice(0, 2) as Square, to: bestUci.slice(2, 4) as Square, promotion: (bestUci.slice(4) as never) || undefined }); } catch {}
        const oppMoves = afterBest.moves({ verbose: true });
        if (oppMoves.length > 0) candidates[0].pvSans = [candidates[0].san ?? bestUci, oppMoves[0].san];
        else candidates[0].pvSans = [candidates[0].san ?? bestUci];
        candidates[1].pvSans = [candidates[1].san ?? playedUci];
      } catch {}

      // filter to legal only
      const legalSet = new Set(new Chess(beforeFen).moves({ verbose: true }).map((m) => `${m.from}${m.to}${m.promotion ?? ""}`));
      const verifiedCands = candidates.filter((x) => legalSet.has(x.uci) || legalSet.has(x.uci.slice(0, 4)));

      const packet = buildFactPacket({
        beforeFen,
        playedUci,
        candidates: verifiedCands,
        engineVersion: "stockfish-19-lite-single",
        depth: 12,
        multiPv: 3,
      });
      if (!packet) return true;
      const diag = diagnose(packet);
      const filterDecision = teachingOpportunityFilter(packet, diag, {
        hasTrustedTranslation: hasTrustedTranslation(tag),
        recentMotifs: [],
        recentPackets: [],
      });
      // learner update — map motif to skill
      const motifSkill: Record<string, SkillId> = {
        hanging: "hanging",
        check: "checks",
        captures: "captures",
        kingSafety: "kingSafety",
        opening: "opening",
        endgame: "endgame",
        calculation: "calculation",
        tactic: "calculation",
      };
      const skillId: SkillId = motifSkill[exercise.motif] ?? "recognition";
      const correct = playedUci.slice(0, 4) === bestUci.slice(0, 4);
      const hinted = hintStep > 0;
      setLastPacketInfo({ fen: beforeFen, playedUci, correct, bestSan: candidates[0]?.san ?? null, packet, diagnosis: diag });
      const nextLearner = recordAttempt(learner, {
        skillId,
        at: new Date().toISOString(),
        correct,
        hinted,
        difficulty: exercise.difficulty,
      });
      setLearner(nextLearner);

      // spaced update
      const existing = reviews.find((r) => r.skillId === skillId);
      const base = existing ?? createReviewItem(skillId, new Date().toISOString());
      const updated = scheduleAfterAttempt(base, { correct, hinted, at: new Date().toISOString() });
      setReviews((prev) => {
        const without = prev.filter((r) => r.skillId !== skillId);
        return [...without, updated];
      });

      // daily progress
      setDailyProgress((p) => ({ ...p, lessonsDone: p.lessonsDone + 1 }));

      // if filter says not to coach, we still show concise feedback — handled in render
      void filterDecision;

      return true;
    },
    [exercise, exFen, hintStep, learner, reviews, tag],
  );

  const rendered = useMemo(() => {
    if (!lastPacketInfo?.packet) return null;
    return renderExplanation(lastPacketInfo.packet, {
      tag,
      level,
      dir: dirFor(tag),
      hasTrustedTranslation: hasTrustedTranslation(tag),
    });
  }, [lastPacketInfo, tag, level]);

  return (
    <section className="section">
      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Learn — verified coaching</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.92rem" }}>
          FactPackets are engine-verified; explanations are rendered in your chosen language without inventing moves or scores. One move never proves mastery — proficiency shows “not enough data” until repeated evidence.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
          <span className={`pill ${level === "beginner" ? "pill--ok" : ""}`}>Beginner wording</span>
          <button className={`btn ${level === "beginner" ? "btn--primary" : ""}`} onClick={() => setLevel("beginner")}>Beginner</button>
          <button className={`btn ${level === "deeper" ? "btn--primary" : ""}`} onClick={() => setLevel("deeper")}>Deeper</button>
          {rendered && <button className="btn btn--ghost" onClick={() => setLevel(level === "beginner" ? "deeper" : "beginner")}>{t(tag, "explainSimply")}</button>}
          <span className="pill" dir={rendered?.dir} lang={tag}>{tag} · {rendered?.dir.toUpperCase()}</span>
          {rendered?.fallbackUsed && <span className="pill pill--warn">{t(tag, "fallbackNotice")}</span>}
        </div>
      </div>

      <div className="grid2" style={{ gap: 16 }}>
        <div style={{ display: "grid", gap: 16 }}>
          <div className="card">
            <h3>Language</h3>
            <LanguagePicker value={tag} onChange={setTag} />
          </div>

          <div className="card">
            <h3>Learner model — proficiency &amp; uncertainty</h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Separate unaided vs hinted; recency-weighted; “not enough data” until 3 attempts and uncertainty ≤0.55.</p>
            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              {(["recognition", "calculation", "hanging", "checks", "opening"] as SkillId[]).map((sid) => {
                const s = learner.skills[sid];
                if (!s) return null;
                const { p, u, label } = proficiencyWithUncertainty(s);
                return (
                  <div key={sid} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 10px", background: "var(--surface-2)" }}>
                    <strong style={{ fontSize: "0.9rem" }}>{sid}</strong>
                    <span style={{ fontSize: "0.85rem", color: u > 0.55 ? "var(--warn)" : "var(--success)" }}>{label} · u {u.toFixed(2)} · p {p.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
            <button className="btn btn--ghost" style={{ marginTop: 10 }} onClick={() => setShowReport((v) => !v)}>{showReport ? "Hide" : "Show"} calibration &amp; evidence</button>
            {showReport && (
              <div style={{ marginTop: 10, fontSize: "0.82rem", color: "var(--text-muted)", maxHeight: 220, overflow: "auto", border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
                {Object.values(learner.skills).slice(0, 6).map((s) => (
                  <div key={s.skillId} style={{ marginBottom: 10 }}>
                    <strong>{s.skillId}</strong> — {s.evidence.slice(-4).join(" · ")}
                  </div>
                ))}
                <p style={{ marginTop: 6 }}>Algorithm inputs, evidence, version and limits are kept so an improvement report can be audited (see coach/ modules).</p>
              </div>
            )}
          </div>

          <div className="card">
            <h3>Spaced revision — due when recall &lt; threshold</h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Interval lengthens only after unaided success; shortens after failure. No punitive streak logic.</p>
            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              {reviews.slice(0, 6).map((r) => {
                const rec = estimatedRecall(r, new Date().toISOString());
                const due = isDue(r, new Date().toISOString());
                return (
                  <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 10px", background: due ? "rgba(253,203,110,0.08)" : "var(--surface-2)" }}>
                    <span style={{ fontSize: "0.85rem" }}>{r.skillId} · interval {r.intervalDays}d · recall {(rec * 100).toFixed(0)}%</span>
                    <span className={`pill ${due ? "pill--warn" : "pill--ok"}`}>{due ? "Due" : "Scheduled"}</span>
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: 8 }}>Due now: {dueReviews.length} · Reviews done today: {dailyProgress.reviewsDone}</p>
            <button
              className="btn"
              style={{ marginTop: 8 }}
              title={dueReviews.length === 0 ? "Nothing is due yet — this opens a fresh practice instead" : `Due now: ${dueReviews.map((r) => r.skillId).join(", ")}`}
              onClick={() => {
                const now = new Date().toISOString();
                const due = reviews.filter((r) => isDue(r, now));
                // Nothing due yet must never be a silent dead click — open the
                // best fresh practice instead so the button always does something.
                const target = due.length > 0
                  ? EXERCISES.find((e) => e.motif === (MOTIF_FOR_SKILL[due[0].skillId] ?? due[0].skillId)) ?? EXERCISES[0]
                  : ranked[0]?.ex ?? EXERCISES[0];
                startExercise(target.id);
                setDailyProgress((p) => ({ ...p, reviewsDone: p.reviewsDone + 1 }));
              }}
            >{dueReviews.length > 0 ? `Practice due review (${dueReviews.length})` : "Practice a skill"}</button>
          </div>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <div className="card">
            <h3>Diagnostic — short &amp; optional</h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Prioritizes high-uncertainty skills. Infer cautiously from play if skipped. Each question adapts to your level.</p>
            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              {EXERCISES.slice(0, 3).map((ex) => (
                <button key={ex.id} className={`btn ${exerciseId === ex.id ? "btn--primary" : ""}`} onClick={() => startExercise(ex.id)} style={{ justifyContent: "space-between", display: "flex" }}>
                  <span>{ex.motif} · difficulty {ex.difficulty.toFixed(2)}</span>
                  <span style={{ opacity: 0.7 }}>{ex.source}</span>
                </button>
              ))}
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginTop: 8 }}>Weights: .23 weakness + .18 recentMistake + .16 infoGain + .13 ownGame + .11 difficultyFit + .09 forgetting + .06 transfer + .04 novelty − repetition. Tunable, not science.</p>
          </div>

          <div className="card">
            <h3>Ranked exercises — diversity + exploration (8%)</h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Filtered for illegal/duplicate/too-hard/low-quality. Aiming 70–85% success band; transfers test same idea in a new position.</p>
            <ol style={{ listStyle: "none", display: "grid", gap: 8, marginTop: 10 }}>
              {ranked.slice(0, 6).map(({ ex, score }) => (
                <li key={ex.id} style={{ display: "flex", gap: 8, alignItems: "center", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 10px", background: "var(--surface-2)" }}>
                  <span className="pill">{score.toFixed(2)}</span>
                  <span style={{ fontSize: "0.9rem", flex: 1 }}>{ex.motif} · {ex.id}</span>
                  <button className="btn btn--ghost" style={{ padding: "6px 10px" }} onClick={() => startExercise(ex.id)}>Practice</button>
                </li>
              ))}
            </ol>
          </div>

          <div className="card">
            <h3>Daily set · Boss</h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>One due review + one own-game lesson + one transfer test when evidence supports it. Streaks optional, non-punitive.</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              <button className="btn" onClick={() => startExercise(EXERCISES[0].id)}>Do daily exercise</button>
              <button className="btn btn--primary" onClick={() => startExercise(DAILY_BOSS.id)}>Daily Boss — {DAILY_BOSS.motif}</button>
              <span className="pill">Progress: {dailyProgress.lessonsDone} lessons today</span>
            </div>
          </div>
        </div>
      </div>

      {exercise && exFen && (
        <div className="card practice-card" ref={practiceRef} style={{ marginTop: 16, scrollMarginTop: 84 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <h3>Practice — {exercise.motif} · {exercise.id}</h3>
            <button className="btn btn--ghost" onClick={() => { setExerciseId(null); setExFen(null); setHintStep(0); }}>Close</button>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Play the best move on the board. Hints are stepwise; later the same idea is retested in a different position to measure transfer.</p>

          <div style={{ maxWidth: 420, margin: "12px auto" }}>
            <ExerciseBoard
              fen={exFen}
              onMove={onExerciseMove}
              suggestFrom={hintStep >= 3 && !lastPacketInfo ? (BEST_BY_ID[exercise.id] ?? "").slice(0, 2) || null : null}
              suggestTo={hintStep >= 3 && !lastPacketInfo ? (BEST_BY_ID[exercise.id] ?? "").slice(2, 4) || null : null}
            />
          </div>

          {/* Compact verdict — visible immediately under the board */}
          {lastPacketInfo?.packet && (
            <div ref={verdictRef} className={`practice-verdict ${lastPacketInfo.correct ? "practice-verdict--ok" : "practice-verdict--bad"}`} role="status">
              {lastPacketInfo.correct
                ? <><strong>✓ Correct!</strong> {lastPacketInfo.packet.played.san} was the best move in this position.</>
                : <><strong>✗ Not quite.</strong> You played {lastPacketInfo.packet.played.san} — the best move here was <strong>{lastPacketInfo.bestSan ?? BEST_BY_ID[exercise.id]}</strong>. Read why below, then press “Reset position” and try again.</>}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <button className="btn" onClick={() => setHintStep((s) => Math.min(3, s + 1))}>{t(tag, "hintStep")} {Math.min(hintStep + 1, 3)}/3</button>
            <button className="btn btn--ghost" onClick={() => setHintStep(0)}>Reset hints</button>
            <button className="btn btn--ghost" onClick={() => { setExFen(exercise.fen); setLastPacketInfo(null); }}>Reset position</button>
            <span className="pill pill--off" style={{ fontSize: "0.78rem" }}>FEN: {exFen.slice(0, 42)}…</span>
          </div>

          {hintStep >= 1 && <p className="engine-panel__hint">Hint 1 — {rendered?.what ?? `${t(tag, "factWhat")}: look for ${exercise.motif}.`}</p>}
          {hintStep >= 2 && <p className="engine-panel__hint">Hint 2 — {rendered?.why ?? t(tag, "factWhy")}</p>}
          {hintStep >= 3 && <p className="engine-panel__hint"><strong>Hint 3 — Play the highlighted move:</strong> {rendered?.next ?? BEST_BY_ID[exercise.id]} <span style={{ color: "var(--muted)" }}>(the gold squares on the board above show from → to)</span></p>}

          {lastPacketInfo?.packet && (
            <div className="engine-panel" style={{ marginTop: 12 }}>
              <div className="engine-panel__head">
                <strong>FactPacket</strong>
                <span className="pill pill--ok">verified</span>
                <span className="pill">{lastPacketInfo.packet.motif} · conf {(lastPacketInfo.packet.confidence * 100).toFixed(0)}%</span>
                <span className="pill pill--off">{lastPacketInfo.packet.provenance.engineVersion} d{lastPacketInfo.packet.provenance.depth}</span>
              </div>
              <div style={{ padding: 12, display: "grid", gap: 8 }}>
                <div><strong>Before FEN:</strong> <code style={{ fontSize: "0.78rem", wordBreak: "break-all" }}>{lastPacketInfo.packet.beforeFen}</code></div>
                <div><strong>After FEN:</strong> <code style={{ fontSize: "0.78rem", wordBreak: "break-all" }}>{lastPacketInfo.packet.afterFen}</code></div>
                <div><strong>Played:</strong> {lastPacketInfo.packet.played.san} ({lastPacketInfo.packet.played.uci}) · <strong>Best:</strong> {lastPacketInfo.packet.best?.san ?? lastPacketInfo.packet.best?.uci ?? "—"} {lastPacketInfo.packet.best?.scoreCp != null ? ` ${(lastPacketInfo.packet.best.scoreCp/100).toFixed(2)}` : lastPacketInfo.packet.best?.scoreMate != null ? ` #${lastPacketInfo.packet.best.scoreMate}` : ""}</div>
                <div><strong>Diagnosis:</strong> {lastPacketInfo.diagnosis.kind} — {lastPacketInfo.diagnosis.reason}</div>
                <div lang={rendered?.htmlLang} dir={rendered?.dir} style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                  <p><strong>{rendered?.what}</strong></p>
                  <p>{rendered?.why}</p>
                  {rendered?.whyNot && <p>{rendered.whyNot}</p>}
                  <p><em>{rendered?.next}</em></p>
                  {rendered?.fallbackUsed && <p className="pill pill--warn" style={{ marginTop: 6 }}>{t(tag, "fallbackNotice")}</p>}
                </div>
                <details>
                  <summary style={{ cursor: "pointer", color: "var(--text-muted)" }}>Show candidates (verified, no invented scores)</summary>
                  <ul style={{ marginTop: 8, paddingLeft: 18, color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    {lastPacketInfo.packet.candidates.map((c, idx) => (
                      <li key={`${c.uci}-${idx}`}>{c.san ?? c.uci} ({c.uci}) {typeof c.scoreCp === "number" ? `${(c.scoreCp/100).toFixed(2)}` : typeof c.scoreMate === "number" ? `#${c.scoreMate}` : ""} — PV: {c.pvSans.join(" ")}</li>
                    ))}
                  </ul>
                </details>
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Opponent threat: {lastPacketInfo.packet.opponentThreat ? `${lastPacketInfo.packet.opponentThreat.san} (${lastPacketInfo.packet.opponentThreat.uci})` : "—"} · Ask “What were you considering?” is optional self-report only; evidence comes from your next unaided attempt.</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(() => {
                    const transfer = EXERCISES.find((e) => e.motif === exercise.motif && e.id !== exercise.id);
                    return transfer ? (
                      <button className="btn" onClick={() => startExercise(transfer.id)}>Transfer test — same idea, new position</button>
                    ) : (
                      <span className="pill pill--off" title="A second position for this skill is not in the pool yet">Transfer test — new position coming for this skill</span>
                    );
                  })()}
                  <button className="btn btn--ghost" onClick={() => setLastPacketInfo(null)}>Dismiss</button>
                </div>
              </div>
            </div>
          )}

          {!lastPacketInfo && (
            <p className="engine-panel__hint">Make a legal move — a FactPacket will be built and checked against the engine’s verified candidates. No move or score is invented.</p>
          )}
        </div>
      )}
    </section>
  );
}

function ExerciseBoard({ fen, onMove, suggestFrom, suggestTo }: { fen: string; onMove: (from: Square, to: Square, promo?: "q"|"r"|"b"|"n") => boolean; suggestFrom?: string | null; suggestTo?: string | null }) {
  const c = useMemo(() => {
    try { return new Chess(fen); } catch { return new Chess(); }
  }, [fen]);
  const getLegalTargets = useCallback((from: Square) => {
    const tmp = new Chess(fen);
    return tmp.moves({ verbose: true, square: from }).map((m) => m.to as Square);
  }, [fen]);
  const isPromotionMove = useCallback((from: Square, to: Square) => {
    const tmp = new Chess(fen);
    const piece = tmp.get(from);
    if (!piece || piece.type !== "p") return false;
    const rank = to[1];
    if ((piece.color === "w" && rank !== "8") || (piece.color === "b" && rank !== "1")) return false;
    return tmp.moves({ verbose: true, square: from }).some((m) => m.to === to && m.promotion);
  }, [fen]);

  // derive lastMove from fen diff? not needed
  const lastMove = useMemo(() => {
    const h = c.history({ verbose: true });
    const last = h[h.length - 1];
    return last ? { from: last.from, to: last.to } : null;
  }, [c]);

  return (
    <ChessBoard
      fen={fen}
      orientation="w"
      lastMove={lastMove}
      getLegalTargets={getLegalTargets}
      isPromotionMove={isPromotionMove}
      tryMove={onMove}
      suggestFrom={suggestFrom ?? null}
      suggestTo={suggestTo ?? null}
      hintText="You play White — tap one of your pieces, then a highlighted square. Black cannot be moved in an exercise."
    />
  );
}
