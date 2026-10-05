/**
 * TrickPlayer — a trick from a real game, played out like the Games tab:
 * step move-by-move (◀ Prev / Next ▶ / Latest / click any move), or watch it
 * unfold. At the KEY moment the board hands control to YOU — find the trick
 * move yourself, with step hints. Then see the punishment and how to defend.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import ChessBoard from "../chess/ChessBoard";
import type { Trick } from "./tricks";
import { recordAttempt, type SkillId } from "./learnerModel";
import { loadLearner, saveLearner, loadReviews, saveReviews } from "./learnerStorage";
import { scheduleAfterAttempt, createReviewItem } from "./spaced";

type Feedback = { ok: boolean; text: string } | null;

export default function TrickPlayer({
  trick,
  solvedAlready,
  onSolved,
  onExit,
  onNextTrick,
}: {
  trick: Trick;
  solvedAlready: boolean;
  onSolved: (hinted: boolean) => void;
  onExit: () => void;
  onNextTrick: () => void;
}) {
  const [ply, setPly] = useState(0);
  const [mode, setMode] = useState<"watch" | "drill">("watch");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [hintStep, setHintStep] = useState(0);
  const [solved, setSolved] = useState(solvedAlready);
  const [revealed, setRevealed] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [auto, setAuto] = useState(false);
  const timerRef = useRef<number | null>(null);

  /* ------- replay helpers (a 15-move line replays instantly) ------- */
  const position = useMemo(() => {
    const c = new Chess();
    for (let i = 0; i < ply; i++) c.move(trick.moves[i]);
    return c;
  }, [trick, ply]);

  const keyMoveInfo = useMemo(() => {
    const before = new Chess();
    for (let i = 0; i < trick.keyPly; i++) before.move(trick.moves[i]);
    const k = new Chess(before.fen());
    const mv = k.move(trick.moves[trick.keyPly]);
    return { from: mv?.from as Square, to: mv?.to as Square, promotion: mv?.promotion, san: trick.moves[trick.keyPly] };
  }, [trick]);

  const fen = position.fen();
  const lastMove = useMemo(() => {
    if (ply === 0) return null;
    const c = new Chess();
    for (let i = 0; i < ply - 1; i++) c.move(trick.moves[i]);
    const mv = new Chess(c.fen()).move(trick.moves[ply - 1]);
    return mv ? { from: mv.from, to: mv.to } : null;
  }, [trick, ply]);

  const finished = ply >= trick.moves.length;
  const atKey = ply === trick.keyPly && !solved;
  const isCheck = position.isCheck();
  const isMate = position.isCheckmate();
  const statusLine = isMate
    ? "Checkmate — game over"
    : finished
      ? "Line complete"
      : `Move ${Math.floor(ply / 2) + 1} of ${Math.ceil(trick.moves.length / 2)} · ${position.turn() === "w" ? "White" : "Black"} to move${isCheck ? " — CHECK" : ""}`;

  /* ------------------------------ autoplay ------------------------------ */
  useEffect(() => {
    if (!auto) return;
    if (ply >= trick.moves.length) { setAuto(false); return; }
    if (ply === trick.keyPly && !solved) { setMode("drill"); setAuto(false); return; }
    timerRef.current = window.setTimeout(() => setPly((p) => Math.min(trick.moves.length, p + 1)), 1000);
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current); };
  }, [auto, ply, trick.keyPly, trick.moves.length, solved]);

  /* ------------------------------ stepping ------------------------------ */
  const goto = useCallback((target: number) => {
    setAuto(false);
    if (target > trick.keyPly && !solved) {
      // can't step past the key moment without playing it
      setPly(trick.keyPly);
      setMode("drill");
      setNote("This is the key moment — find the trick move first!");
      return;
    }
    setPly(target);
    setMode("watch");
    setNote(null);
    setFeedback(null);
  }, [trick.keyPly, solved]);

  const next = useCallback(() => {
    if (ply === trick.keyPly && !solved) { setMode("drill"); setNote(null); return; }
    goto(Math.min(trick.moves.length, ply + 1));
  }, [ply, solved, trick, goto]);

  /* --------------------------- drill move handling --------------------------- */
  const recordOutcome = useCallback((correct: boolean, hinted: boolean) => {
    const at = new Date().toISOString();
    try {
      saveLearner(recordAttempt(loadLearner(), { skillId: trick.skill as SkillId, at, correct, hinted, difficulty: trick.difficulty }));
    } catch { /* session continues */ }
    try {
      const reviews = loadReviews();
      const base = reviews.find((r) => r.skillId === trick.skill) ?? createReviewItem(trick.skill, at);
      const updated = scheduleAfterAttempt(base, { correct, hinted, at });
      saveReviews([...reviews.filter((r) => r.skillId !== trick.skill), updated]);
    } catch { /* session continues */ }
  }, [trick]);

  const onMove = useCallback((from: Square, to: Square, promo?: "q" | "r" | "b" | "n") => {
    if (mode !== "drill" || ply !== trick.keyPly || solved) return false;
    const c = new Chess(fen);
    const legal = c.moves({ verbose: true, square: from }).some((m) => m.to === to);
    if (!legal) return false;
    const matches =
      from === keyMoveInfo.from && to === keyMoveInfo.to && (keyMoveInfo.promotion ?? promo ?? "q") === (promo ?? keyMoveInfo.promotion ?? "q");
    if (!matches) {
      const nextHint = Math.min(2, hintStep + 1);
      setHintStep(nextHint);
      setFeedback({ ok: false, text: `Not the trick move. Nudge: ${nextHint >= 2 ? trick.keyHint[1] : trick.keyHint[0]}` });
      return false;
    }
    const res = c.move({ from, to, promotion: promo });
    if (!res) return false;
    setPly(trick.keyPly + 1);
    setMode("watch");
    setSolved(true);
    setFeedback({ ok: true, text: `That's the trick! ${trick.result}` });
    recordOutcome(true, hintStep > 0);
    onSolved(hintStep > 0);
    return true;
  }, [mode, ply, trick, solved, fen, keyMoveInfo, hintStep, recordOutcome, onSolved]);

  const reveal = useCallback(() => {
    if (solved) return;
    setSolved(true);
    setRevealed(true);
    setPly(trick.keyPly + 1);
    setMode("watch");
    setHintStep(2);
    setFeedback({ ok: false, text: `The trick was ${keyMoveInfo.san}. Watch what it leads to — then read how to defend below.` });
    recordOutcome(false, true);
    onSolved(true);
  }, [solved, trick, keyMoveInfo, recordOutcome, onSolved]);

  /* ------------------------------ board helpers ------------------------------ */
  const getLegalTargets = useCallback((from: Square) => {
    if (mode !== "drill" || ply !== trick.keyPly || solved) return [];
    try { return new Chess(fen).moves({ verbose: true, square: from }).map((m) => m.to as Square); } catch { return []; }
  }, [mode, ply, trick.keyPly, solved, fen]);

  const isPromotionMove = useCallback((from: Square, to: Square) => {
    if (mode !== "drill" || ply !== trick.keyPly || solved) return false;
    try {
      const c = new Chess(fen);
      const piece = c.get(from);
      if (!piece || piece.type !== "p") return false;
      return c.moves({ verbose: true, square: from }).some((m) => m.to === to && m.promotion);
    } catch { return false; }
  }, [mode, ply, trick.keyPly, solved, fen]);

  /* ------------------------------ render ------------------------------ */
  const movePairs = Math.ceil(trick.moves.length / 2);
  const canPickUp = mode === "drill" && ply === trick.keyPly && !solved
    ? (color: "w" | "b") => color === trick.side
    : () => false;

  return (
    <div className="card practice-card" style={{ marginBottom: 16, scrollMarginTop: 84 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h3>{trick.title}</h3>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span className="pill">{trick.opening}</span>
          {solved && <span className="pill pill--ok">learned ✓</span>}
          <button className="btn btn--ghost btn--sm" onClick={onExit}>Close</button>
        </div>
      </div>
      <p style={{ color: "var(--muted)", fontSize: ".88rem", marginTop: 6 }}>
        You play <b>{trick.side === "w" ? "White" : "Black"}</b> · key moment at move {Math.floor(trick.keyPly / 2) + 1} · {trick.minutes} min
      </p>

      {mode === "drill" && !solved ? (
        <div className="drill__goal" style={{ marginTop: 8 }}>
          <span className="pill pill--brass">★ The trick — your move</span>
          <strong>{trick.keyGoal}</strong>
        </div>
      ) : (
        <p style={{ marginTop: 8, fontSize: ".9rem" }}><span className="pill" style={{ marginRight: 6 }}>{statusLine}</span></p>
      )}

      <div style={{ maxWidth: 380, margin: "10px auto" }}>
        <ChessBoard
          fen={fen}
          orientation={trick.side}
          lastMove={lastMove}
          getLegalTargets={getLegalTargets}
          isPromotionMove={isPromotionMove}
          tryMove={onMove}
          canPickUp={canPickUp}
          hintText={mode === "drill" && !solved ? `Your move — play it like a real game. You are ${trick.side === "w" ? "White" : "Black"}.` : undefined}
        />
      </div>

      {note && <div className="practice-verdict practice-verdict--bad" role="status">{note}</div>}

      {hintStep > 0 && !solved && (
        <div className="hint-step" role="status"><span className="pill">Hint · step 1</span> {trick.keyHint[0]}</div>
      )}
      {hintStep > 1 && !solved && (
        <div className="hint-step" role="status"><span className="pill">Hint · step 2</span> {trick.keyHint[1]}</div>
      )}

      {feedback && (
        <div className={`practice-verdict ${feedback.ok ? "practice-verdict--ok" : "practice-verdict--bad"}`} role="status">
          {feedback.ok ? <><strong>✓ Trick found!</strong> {feedback.text}</> : <><strong>✗ Not yet.</strong> {feedback.text}</>}
        </div>
      )}

      {/* controls — like the Games tab review */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 8 }}>
        <button className="btn btn--sm" disabled={ply <= 0} onClick={() => goto(Math.max(0, ply - 1))}>◀ Prev</button>
        {mode === "drill" && !solved ? (
          <>
            <button className="btn btn--quiet btn--sm" onClick={() => setHintStep((h) => Math.min(2, h + 1))}>
              {hintStep === 0 ? "Show hint step 1" : hintStep === 1 ? "Show hint step 2" : "Hint shown"}
            </button>
            <button className="btn btn--ghost btn--sm" onClick={reveal}>Show me the move</button>
            <button className="btn btn--ghost btn--sm" onClick={() => { setPly(0); setMode("watch"); setFeedback(null); setHintStep(0); setNote(null); }}>Replay from start</button>
          </>
        ) : (
          <>
            {!auto && !finished && !(ply === trick.keyPly && !solved) && <button className="btn btn--quiet btn--sm" onClick={() => setAuto(true)}>▶ Watch it unfold</button>}
            {auto && <button className="btn btn--quiet btn--sm" onClick={() => setAuto(false)}>❚❚ Pause</button>}
            <button className="btn btn--sm btn--primary" disabled={finished} onClick={next}>
              {ply === trick.keyPly && !solved ? "Play the trick move →" : "Next ▶"}
            </button>
            <button className="btn btn--ghost btn--sm" disabled={finished} onClick={() => goto(trick.moves.length)}>Latest</button>
          </>
        )}
      </div>

      {/* full clickable move list — exactly like the Games tab */}
      <div className="review-moves" style={{ marginTop: 12 }} aria-label="All moves of this trick">
        {Array.from({ length: movePairs }, (_, i) => (
          <span key={i} className="review-moves__row">
            <span className="review-moves__num">{i + 1}.</span>
            {[0, 1].map((j) => {
              const p = i * 2 + j;
              const san = trick.moves[p];
              if (!san) return null;
              const isKey = p === trick.keyPly;
              const locked = p > trick.keyPly && !solved;
              const cur = p + 1 === ply;
              return (
                <button
                  key={p}
                  className={`review-moves__san${isKey ? " review-moves__key" : ""}${cur ? " review-moves__san--cur" : ""}${locked ? " review-moves__san--locked" : ""}`}
                  onClick={() => goto(p + 1)}
                  title={isKey ? "The trick move" : undefined}
                >
                  {isKey ? "★ " : ""}{san}
                </button>
              );
            })}
          </span>
        ))}
      </div>

      {/* end-of-line summary: what happened + how to defend */}
      {finished && (
        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          <div className="practice-verdict practice-verdict--ok" role="status"><strong>{trick.result}</strong></div>
          <div className="hint-step"><span className="pill pill--brass">What just happened</span> {trick.why}</div>
          <div className="hint-step"><span className="pill">If it happens to YOU</span> {trick.defense}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn--primary btn--sm" onClick={onNextTrick}>Next trick →</button>
            <button className="btn btn--ghost btn--sm" onClick={() => { setPly(0); setMode("watch"); setFeedback(null); setHintStep(0); setRevealed(false); }}>Replay this trick</button>
          </div>
          {revealed && <p style={{ fontSize: ".8rem", color: "var(--muted)" }}>Recorded as "with help" — find it yourself next time to score it clean.</p>}
        </div>
      )}
    </div>
  );
}
