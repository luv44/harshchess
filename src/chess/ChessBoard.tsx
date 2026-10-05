import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { Chess, type Square, type Piece } from "chess.js";
import { PieceSvg } from "./pieces";

type Props = {
  fen: string;
  orientation: "w" | "b";
  lastMove: { from: string; to: string } | null;
  getLegalTargets: (from: Square) => Square[];
  isPromotionMove: (from: Square, to: Square) => boolean;
  tryMove: (from: Square, to: Square, promotion?: "q" | "r" | "b" | "n") => boolean;
  // Optional overlays for teaching states (verified — never invent)
  suggestFrom?: string | null;
  suggestTo?: string | null;
  threatSquare?: string | null;
  inspectSquare?: string | null;
  hideLegend?: boolean;
  /** Who is allowed to pick up a piece of this colour right now. Defaults to
   *  the side to move (two-player local). Pass a session-aware predicate for
   *  vs-computer / watch modes so the human can never move the engine's pieces. */
  canPickUp?: (color: "w" | "b") => boolean;
  /** Optional override for the line under the board (defaults to the tap/drag hint). */
  hintText?: string;
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"] as const;

const PROMOTION_CHOICES: Array<{ p: "q" | "r" | "b" | "n"; label: string }> = [
  { p: "q", label: "Queen" },
  { p: "r", label: "Rook" },
  { p: "b", label: "Bishop" },
  { p: "n", label: "Knight" },
];

function pieceLabel(piece?: Piece | null): string {
  if (!piece) return "empty";
  const names: Record<string, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
  const color = piece.color === "w" ? "White" : "Black";
  return `${color} ${names[piece.type] ?? piece.type}`;
}

export default function ChessBoard({ fen, orientation, lastMove, getLegalTargets, isPromotionMove, tryMove, suggestFrom, suggestTo, threatSquare, inspectSquare, hideLegend, canPickUp, hintText }: Props) {
  const chess = useMemo(() => {
    try { return new Chess(fen); } catch { return new Chess(); }
  }, [fen]);

  const turn = chess.turn();
  const inCheck = chess.isCheck();
  const displayRanks = orientation === "w" ? RANKS : [...RANKS].reverse();
  const displayFiles = orientation === "w" ? FILES : [...FILES].reverse();
  const mayMove = useCallback((color: "w" | "b") => (canPickUp ? canPickUp(color) : color === turn), [canPickUp, turn]);

  const [selected, setSelected] = useState<Square | null>(null);
  const [legal, setLegal] = useState<Square[]>([]);
  const [pendingPromo, setPendingPromo] = useState<{ from: Square; to: Square } | null>(null);
  const dragFromRef = useRef<Square | null>(null);
  const [dragOver, setDragOver] = useState<Square | null>(null);

  // Clear selection when position changes (move, undo, new game) so stale highlights never linger
  useEffect(() => {
    setSelected(null);
    setLegal([]);
    setDragOver(null);
    setPendingPromo(null);
  }, [fen]);

  const turnLabel = turn === "w" ? "White to move" : "Black to move";

  const clearSelection = useCallback(() => { setSelected(null); setLegal([]); }, []);
  const selectSquare = useCallback((sq: Square) => {
    const piece = chess.get(sq);
    if (!piece || !mayMove(piece.color as "w" | "b")) return false;
    const targets = getLegalTargets(sq);
    setSelected(sq); setLegal(targets); return true;
  }, [chess, getLegalTargets, mayMove]);

  const attemptMove = useCallback((from: Square, to: Square) => {
    if (isPromotionMove(from, to)) { setPendingPromo({ from, to }); return; }
    const ok = tryMove(from, to);
    if (ok) clearSelection();
  }, [isPromotionMove, tryMove, clearSelection]);

  const onSquareClick = useCallback((sq: Square) => {
    if (pendingPromo) return;
    const piece = chess.get(sq);
    if (selected) {
      if (sq === selected) { clearSelection(); return; }
      if (legal.includes(sq)) { attemptMove(selected, sq); return; }
      if (piece && mayMove(piece.color as "w" | "b")) { selectSquare(sq); return; }
      clearSelection(); return;
    }
    if (piece && mayMove(piece.color as "w" | "b")) selectSquare(sq);
  }, [pendingPromo, chess, selected, legal, mayMove, clearSelection, attemptMove, selectSquare]);

  const onKeyDown = useCallback((e: React.KeyboardEvent, sq: Square) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSquareClick(sq); }
    else if (e.key === "Escape") { clearSelection(); setPendingPromo(null); }
  }, [onSquareClick, clearSelection]);

  const onDragStart = (sq: Square) => (e: React.DragEvent) => {
    if (pendingPromo) { e.preventDefault(); return; }
    const piece = chess.get(sq);
    if (!piece || !mayMove(piece.color as "w" | "b")) { e.preventDefault(); return; }
    dragFromRef.current = sq;
    const targets = getLegalTargets(sq);
    setSelected(sq); setLegal(targets);
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", sq); } catch { /* ignore */ }
  };
  const onDragOver = (sq: Square) => (e: React.DragEvent) => { e.preventDefault(); if (dragOver !== sq) setDragOver(sq); };
  const onDragLeave = () => setDragOver(null);
  const onDrop = (sq: Square) => (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(null);
    const from = dragFromRef.current; dragFromRef.current = null;
    if (!from || from === sq) return;
    if (isPromotionMove(from, sq)) { setPendingPromo({ from, to: sq }); return; }
    const ok = tryMove(from, sq);
    if (ok) clearSelection();
  };
  const onDragEnd = () => { dragFromRef.current = null; setDragOver(null); };

  const handlePromotion = (choice: "q" | "r" | "b" | "n") => {
    if (!pendingPromo) return;
    const { from, to } = pendingPromo; setPendingPromo(null);
    const ok = tryMove(from, to, choice);
    if (ok) clearSelection();
  };
  const promoTurnColor = useMemo(() => {
    if (!pendingPromo) return turn;
    const p = chess.get(pendingPromo.from);
    return p?.color ?? turn;
  }, [pendingPromo, chess, turn]);

  const kingSq = useMemo(() => findKing(chess, turn), [chess, turn]);

  return (
    <div className="board-wrap">
      <div className="board-meta">
        <span className={`pill ${inCheck ? "pill--danger" : "pill--ok"}`} aria-live="polite">
          {turnLabel}{inCheck ? " · Check!" : ""}
        </span>
        {inCheck && <span className="pill pill--danger">King in check — must get out of check</span>}
        <span className="pill pill--brass" style={{ marginLeft: 2 }}>{orientation === "w" ? "White at bottom" : "Black at bottom"}</span>
      </div>

      <div className="board-frame">
        <div
          className="board"
          role="grid"
          aria-label={`Chess board, ${turnLabel}${inCheck ? ", check" : ""}. ${orientation === "w" ? "White at bottom" : "Black at bottom"}.`}
        >
          {displayRanks.map((rank) =>
            displayFiles.map((file) => {
              const sq = `${file}${rank}` as Square;
              const piece = chess.get(sq);
              const canonicalLight = chess.squareColor(sq) === "light";
              const selectedHere = selected === sq;
              const isLegal = legal.includes(sq);
              const isLast = lastMove != null && (lastMove.from === sq || lastMove.to === sq);
              const isKingInCheckHere = Boolean(piece && piece.type === "k" && piece.color === turn && inCheck && sq === kingSq);
              const isDragOver = dragOver === sq;
              const isSuggestFrom = suggestFrom === sq;
              const isSuggestTo = suggestTo === sq;
              const isThreat = threatSquare === sq;
              const isInspect = inspectSquare === sq;

              return (
                <button
                  key={sq}
                  role="gridcell"
                  aria-label={`${sq} ${pieceLabel(piece)}${selectedHere ? " selected" : ""}${isLegal ? " legal move" : ""}${isLast ? " last move" : ""}${isKingInCheckHere ? " king in check" : ""}${isSuggestTo ? " suggested destination" : ""}${isSuggestFrom ? " suggested origin" : ""}${isThreat ? " threat" : ""}`}
                  aria-selected={selectedHere}
                  className={[
                    "board__square",
                    canonicalLight ? "board__square--light" : "board__square--dark",
                    selectedHere ? "board__square--selected" : "",
                    isLast && !isKingInCheckHere ? "board__square--last" : "",
                    isKingInCheckHere ? "board__square--check" : "",
                    isSuggestFrom ? "board__square--suggest-from" : "",
                    isSuggestTo ? "board__square--suggest-to" : "",
                    isThreat ? "board__square--threat" : "",
                    isInspect ? "board__square--inspect" : "",
                    isLegal ? "board__square--target" : "",
                    isDragOver ? "board__square--dragover" : "",
                  ].join(" ")}
                  onClick={() => onSquareClick(sq)}
                  onKeyDown={(e) => onKeyDown(e, sq)}
                  draggable={Boolean(piece && mayMove(piece.color as "w" | "b") && !pendingPromo)}
                  onDragStart={onDragStart(sq)}
                  onDragOver={onDragOver(sq)}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop(sq)}
                  onDragEnd={onDragEnd}
                  tabIndex={0}
                  type="button"
                >
                  {displayFiles[displayFiles.length - 1] === file && <span className="board__rank" aria-hidden="true">{rank}</span>}
                  {displayRanks[displayRanks.length - 1] === rank && <span className="board__file" aria-hidden="true">{file}</span>}

                  {piece && (
                    <span className="piece-svg-wrap" aria-hidden="true" draggable={false} style={{ cursor: mayMove(piece.color as "w" | "b") ? "grab" : "default" }}>
                      <PieceSvg color={piece.color as "w" | "b"} type={piece.type as "k" | "q" | "r" | "b" | "n" | "p"} />
                    </span>
                  )}
                  {isLegal && <span className={`board__dot ${piece ? "board__dot--capture" : ""}`} aria-hidden="true" />}
                  {selectedHere && <span className="board__ring" aria-hidden="true" />}
                </button>
              );
            }),
          )}
        </div>
      </div>

      {!hideLegend && (
        <details className="board-legend" style={{ marginTop: 2 }}>
          <summary style={{ cursor: "pointer", fontWeight: 700, color: "var(--muted)" }}>What do the highlights mean?</summary>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8, alignItems: "center" }}>
            <span><i className="board-legend__swatch" style={{ background: "var(--brass)" }} /> Selected piece</span>
            <span><i className="board-legend__swatch" style={{ background: "rgba(43,27,14,.72)", borderRadius: 999 }} /> Legal move · <i className="board-legend__swatch" style={{ borderColor: "#9B2C2C", background: "transparent", borderWidth: 2 }} /> Capture</span>
            <span><i className="board-legend__swatch" style={{ background: "#FFF3D6", borderColor: "#E8D0A0" }} /> Opponent’s last move</span>
            <span><i className="board-legend__swatch" style={{ background: "#FCE8E8", borderColor: "#E8B8B8" }} /> King in check</span>
            <span><i className="board-legend__swatch" style={{ background: "#FFC107", borderColor: "#B0894A", borderWidth: 2 }} /> Suggested move (gold pulse)</span>
          </div>
        </details>
      )}

      {pendingPromo && (
        <div className="promo" role="dialog" aria-modal="true" aria-label="Choose promotion piece">
          <div className="promo__card">
            <p className="promo__title">Pawn promotion — choose piece for {pendingPromo.to}</p>
            <div className="promo__choices">
              {PROMOTION_CHOICES.map((c) => (
                <button key={c.p} type="button" className="promo__btn" onClick={() => handlePromotion(c.p)} aria-label={`Promote to ${c.label}`}>
                  <span className="promo__glyph" aria-hidden="true"><PieceSvg color={promoTurnColor as "w" | "b"} type={c.p} /></span>
                  <span className="promo__label">{c.label}</span>
                </button>
              ))}
            </div>
            <button type="button" className="btn btn--ghost" onClick={() => setPendingPromo(null)}>Cancel</button>
          </div>
        </div>
      )}

      <p className="board__hint">{hintText ?? "Tap a piece then a highlighted square — or drag. Illegal moves are ignored. Board uses chess.js for all rules."}</p>
    </div>
  );
}

function findKing(chess: Chess, color: "w" | "b"): Square | null {
  const found = chess.findPiece({ type: "k", color });
  return (found[0] as Square) ?? null;
}
