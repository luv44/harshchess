/**
 * PracticeSession — the adaptive, stepped practice player.
 * 5 positions per session. Each position: goal → your move. Stuck? Hint steps
 * walk you there one nudge at a time (where to look → what to see). Wrong
 * answers release the next hint automatically. The engine steps the difficulty
 * up/down live based on your last two results, and a summary sets your level.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import ChessBoard from "../chess/ChessBoard";
import { MOTIF_LABEL, SKILL_FOR_MOTIF2, type BankItem, type Motif } from "./practiceBank";
import {
  loadPractice, savePractice, getLevel, pickItem, liveLevel, planLevelAfter,
  mixedMotifOrder, type SessionOutcome, type PracticeStore,
} from "./adaptive";
import { recordAttempt, type SkillId } from "./learnerModel";
import { loadLearner, saveLearner, loadReviews, saveReviews } from "./learnerStorage";
import { isDue, scheduleAfterAttempt, createReviewItem } from "./spaced";

const SESSION_LENGTH = 5;

function uciOf(from: Square, to: Square, promo?: "q" | "r" | "b" | "n") {
  return `${from}${to}${promo ?? ""}`;
}

/** does `played` match any accepted solution (promotion-aware)? */
function matches(played: string, solutions: string[]) {
  return solutions.some((best) => played.slice(0, 4) === best.slice(0, 4) && (best.length === 4 || played === best));
}

function sanOf(item: BankItem): string {
  try {
    const sol = item.solutions[0];
    const c = new Chess(item.fen);
    const mv = c.move({ from: sol.slice(0, 2), to: sol.slice(2, 4), promotion: (sol.slice(4) || undefined) as never });
    return mv?.san ?? sol;
  } catch {
    return item.solutions[0];
  }
}

export default function PracticeSession({ motif, onExit }: { motif: Motif | "mixed"; onExit: () => void }) {
  const [store, setStore] = useState<PracticeStore>(() => loadPractice());
  const storeRef = useRef(store);
  storeRef.current = store;

  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState<SessionOutcome[]>([]);
  const [current, setCurrent] = useState<BankItem | null>(null);
  const [usedIds, setUsedIds] = useState<string[]>([]);
  const [hintStep, setHintStep] = useState(0); // 0 none, 1 first nudge, 2 full nudge
  const [answered, setAnswered] = useState(false); // solved OR answer revealed
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [fen, setFen] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [finalLevel, setFinalLevel] = useState<{ next: number; message: string } | null>(null);
  const startLevel = useMemo(() => (motif === "mixed" ? 1 : getLevel(store, motif)), [motif]); // eslint-disable-line react-hooks/exhaustive-deps

  /** pick the first / next position when idx changes */
  const pick = useCallback((nextIdx: number, prevResults: SessionOutcome[], prevIds: string[]) => {
    const s = storeRef.current;
    let m: Motif;
    if (motif === "mixed") {
      const order = mixedMotifOrder(s, () => null);
      m = order[nextIdx % order.length];
    } else {
      m = motif;
    }
    const lvl = motif === "mixed" ? getLevel(s, m) : liveLevel(getLevel(s, m), prevResults);
    const item = pickItem(m, lvl, s, prevIds);
    if (!item) { onExit(); return; }
    setUsedIds((u) => [...u, item.id]);
    setCurrent(item);
    setFen(item.fen);
    setHintStep(0);
    setAnswered(false);
    setFeedback(null);
    setStore((prev) => {
      const next = { ...prev, seen: { ...prev.seen, [item.id]: (prev.seen[item.id] ?? 0) + 1 } };
      savePractice(next);
      return next;
    });
  }, [motif, onExit]);

  // start the session exactly once (ref guard survives StrictMode double-effects)
  const startedRef = useRef(false);
  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      pick(0, [], []);
    }
  }, [pick]);

  const restart = useCallback(() => {
    const fresh = loadPractice();
    storeRef.current = fresh;
    setStore(fresh);
    setIdx(0);
    setResults([]);
    setUsedIds([]);
    setDone(false);
    setFinalLevel(null);
    pick(0, [], []);
  }, [pick]);

  const recordOutcome = useCallback((skillId: SkillId, correct: boolean, hinted: boolean, difficulty: number) => {
    const at = new Date().toISOString();
    try {
      const learner = recordAttempt(loadLearner(), { skillId, at, correct, hinted, difficulty });
      saveLearner(learner);
    } catch { /* keep session alive */ }
    try {
      const reviews = loadReviews();
      const base = reviews.find((r) => r.skillId === skillId) ?? createReviewItem(skillId, at);
      const updated = scheduleAfterAttempt(base, { correct, hinted, at });
      saveReviews([...reviews.filter((r) => r.skillId !== skillId), updated]);
    } catch { /* keep session alive */ }
  }, []);

  const onMove = useCallback(
    (from: Square, to: Square, promo?: "q" | "r" | "b" | "n") => {
      if (!current || !fen || feedback?.ok) return false;
      const c = new Chess(fen);
      const legal = c.moves({ verbose: true, square: from }).some((m) => m.to === to);
      if (!legal) return false;
      const played = uciOf(from, to, promo);
      if (!matches(played, current.solutions)) {
        // wrong move: not played; the next hint step unlocks as a nudge
        const nextHint = Math.min(2, hintStep + 1);
        setHintStep(nextHint);
        const nudge = nextHint >= 2 ? current.steps[1] : current.steps[0];
        setFeedback({ ok: false, text: `Not the move we're practising. Nudge: ${nudge}` });
        return false;
      }
      const res = c.move({ from, to, promotion: promo });
      if (!res) return false;
      setFen(c.fen());
      setFeedback({ ok: true, text: current.why });
      setAnswered(true);
      recordOutcome(SKILL_FOR_MOTIF2[current.motif], true, hintStep > 0, current.level / 3);
      return true;
    },
    [current, fen, feedback, hintStep, recordOutcome]
  );

  const advance = useCallback(() => {
    const nextIdx = idx + 1;
    if (nextIdx >= SESSION_LENGTH) {
      // finish
      const baseLevel = motif === "mixed" ? 1 : getLevel(storeRef.current, motif);
      const plan = planLevelAfter(baseLevel, results);
      if (motif !== "mixed") {
        const nextStore = { ...storeRef.current, levels: { ...storeRef.current.levels, [motif]: plan.next }, sessions: storeRef.current.sessions + 1 };
        savePractice(nextStore);
        setStore(nextStore);
      } else {
        const nextStore = { ...storeRef.current, sessions: storeRef.current.sessions + 1 };
        savePractice(nextStore);
        setStore(nextStore);
      }
      setFinalLevel(plan);
      setDone(true);
      setCurrent(null);
      return;
    }
    setIdx(nextIdx);
    pick(nextIdx, results, usedIds);
  }, [idx, results, usedIds, pick, motif]);

  const skip = useCallback(() => {
    if (!current || feedback?.ok) return;
    recordOutcome(SKILL_FOR_MOTIF2[current.motif], false, true, current.level / 3);
    setResults((r) => [...r, { correct: false, hinted: true }]);
    setFeedback({ ok: false, text: `Skipped — the answer was ${sanOf(current)}. Read why, then move on: ${current.why}` });
    setHintStep(2);
    setAnswered(true);
    // advance() will be pressed manually after reading
  }, [current, feedback, recordOutcome]);

  // record result the moment a position is solved correctly
  const onSolvedRegister = useCallback(() => {
    setResults((r) => [...r, { correct: true, hinted: hintStep > 0 }]);
  }, [hintStep]);

  const boardHelpers = {
    getLegalTargets: (f: string | null) => (from: Square) => {
      if (!f) return [];
      try { return new Chess(f).moves({ verbose: true, square: from }).map((m) => m.to as Square); } catch { return []; }
    },
    isPromotionMove: (f: string | null) => (from: Square, to: Square) => {
      if (!f) return false;
      try {
        const c = new Chess(f);
        const piece = c.get(from);
        if (!piece || piece.type !== "p") return false;
        return c.moves({ verbose: true, square: from }).some((m) => m.to === to && m.promotion);
      } catch { return false; }
    },
  };

  if (done && finalLevel) {
    const shown = results.length || SESSION_LENGTH;
    const correct = results.filter((r) => r.correct).length;
    const clean = results.filter((r) => r.correct && !r.hinted).length;
    return (
      <div className="card practice-card" style={{ marginBottom: 16 }}>
        <h3>Session complete — {motif === "mixed" ? "Smart mix" : MOTIF_LABEL[motif]}</h3>
        <div className="session-dots" style={{ margin: "12px 0" }} aria-label="Session results">
          {results.map((r, i) => (
            <span key={i} className={`session-dot ${r.correct ? (r.hinted ? "session-dot--hint" : "session-dot--ok") : "session-dot--bad"}`}>
              {r.correct ? (r.hinted ? "✔" : "✓") : "✗"}
            </span>
          ))}
        </div>
        <p><b>{correct} of {SESSION_LENGTH}</b> solved · <b>{clean}</b> clean (no hints)</p>
        <div className="practice-verdict practice-verdict--ok" role="status" style={{ marginTop: 8 }}>{finalLevel.message}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <button className="btn btn--primary" onClick={restart}>Practise again</button>
          <button className="btn btn--ghost" onClick={onExit}>Back to practice</button>
        </div>
        <p style={{ marginTop: 10, fontSize: ".8rem", color: "var(--muted)" }}>
          Clean solves (no hint) step you up; misses step you down. Your level is saved on this device.
        </p>
      </div>
    );
  }

  if (!current) return null;

  return (
    <div className="card practice-card" style={{ marginBottom: 16, scrollMarginTop: 84 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h3>
          {motif === "mixed" ? MOTIF_LABEL[current.motif] : MOTIF_LABEL[motif]} — position {idx + 1} of {SESSION_LENGTH}
        </h3>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span className="pill pill--brass">Level {current.level}</span>
          <button className="btn btn--ghost btn--sm" onClick={onExit}>Exit</button>
        </div>
      </div>

      <div className="session-dots" style={{ margin: "10px 0" }} aria-label="Progress">
        {Array.from({ length: SESSION_LENGTH }, (_, i) => {
          const r = results[i];
          return (
            <span key={i} className={`session-dot ${r ? (r.correct ? (r.hinted ? "session-dot--hint" : "session-dot--ok") : "session-dot--bad") : i === idx ? "session-dot--now" : ""}`}>
              {i + 1}
            </span>
          );
        })}
      </div>

      <div className="drill__goal" style={{ marginTop: 4 }}>
        <span className="pill pill--brass">Your turn</span>
        <strong>{current.goal}</strong>
      </div>

      <div style={{ maxWidth: 380, margin: "10px auto" }}>
        <ChessBoard
          fen={fen ?? current.fen}
          orientation="w"
          lastMove={null}
          getLegalTargets={boardHelpers.getLegalTargets(fen)}
          isPromotionMove={boardHelpers.isPromotionMove(fen)}
          tryMove={(from, to, promo) => {
            const ok = onMove(from, to, promo);
            if (ok) onSolvedRegister();
            return ok;
          }}
          hintText="You play White — tap one of your pieces, then a highlighted square."
        />
      </div>

      {/* step hints — revealed one at a time */}
      {hintStep > 0 && (
        <div className="hint-step" role="status">
          <span className="pill">Hint · step 1</span> {current.steps[0]}
        </div>
      )}
      {hintStep > 1 && (
        <div className="hint-step" role="status">
          <span className="pill">Hint · step 2</span> {current.steps[1]}
        </div>
      )}

      {feedback && (
        <div className={`practice-verdict ${feedback.ok ? "practice-verdict--ok" : "practice-verdict--bad"}`} role="status">
          {feedback.ok ? <><strong>✓ Correct!</strong> {feedback.text}</> : <><strong>✗ Not yet.</strong> {feedback.text}</>}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        {!feedback?.ok && hintStep < 2 && (
          <button className="btn btn--quiet btn--sm" onClick={() => setHintStep((h) => Math.min(2, h + 1))}>
            Show step {hintStep + 1} of 2
          </button>
        )}
        {!feedback?.ok && (
          <button className="btn btn--ghost btn--sm" onClick={skip}>Show me the answer</button>
        )}
        {!feedback?.ok && (
          <button className="btn btn--ghost btn--sm" onClick={() => { setFen(current.fen); setFeedback(null); }}>Reset board</button>
        )}
        {answered && (
          <button className="btn btn--primary btn--sm" onClick={advance}>
            {idx + 1 >= SESSION_LENGTH ? "Finish session →" : "Next position →"}
          </button>
        )}
      </div>
    </div>
  );
}
