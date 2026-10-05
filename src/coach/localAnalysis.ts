/**
 * Verified local analysis — PURE functions over an exact FEN.
 *
 * Everything this module returns is CHECKED by legal replay with chess.js.
 * It never invents a move, a threat or a score. It is deliberately small and
 * bounded so a phone can run it on every turn without a cloud call and without
 * waiting for the Stockfish WASM download.
 *
 * Stockfish (when it loads) is used to RANK; this module is used to VERIFY.
 *
 * PERFORMANCE NOTE (measured on this runner, not guessed):
 *   chess.js `moves({verbose:true})` ≈ 2.4 ms per call — it builds a full Move
 *   object (with before/after FEN) for every move.
 *   chess.js `moves()` ≈ 0.18 ms per call.
 * So the hot capture search uses SAN strings + incremental material, and only
 * the root uses verbose moves. That is the difference between a coach card in
 * ~2.5 s and one in well under 100 ms.
 */

import { Chess, type Color, type Square } from "chess.js";

export const PIECE_VALUE: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0, // the king is never counted as material
};

export type LegalMove = {
  from: Square;
  to: Square;
  san: string;
  uci: string;
  piece: string;
  color: Color;
  captured?: string;
  promotion?: string;
  isCapture: boolean;
  isCheck: boolean;
  isMate: boolean;
  isCastle: boolean;
  isEnPassant: boolean;
};

export function safeChess(fen: string): Chess | null {
  try {
    return new Chess(fen);
  } catch {
    return null;
  }
}

function toLegalMove(m: {
  from: string;
  to: string;
  san: string;
  piece: string;
  color: string;
  captured?: string;
  promotion?: string;
  flags: string;
}): LegalMove {
  return {
    from: m.from as Square,
    to: m.to as Square,
    san: m.san,
    uci: `${m.from}${m.to}${m.promotion ?? ""}`,
    piece: m.piece,
    color: m.color as Color,
    captured: m.captured,
    promotion: m.promotion,
    isCapture: m.flags.includes("c") || m.flags.includes("e"),
    isCheck: m.san.includes("+") || m.san.includes("#"),
    isMate: m.san.includes("#"),
    isCastle: m.flags.includes("k") || m.flags.includes("q"),
    isEnPassant: m.flags.includes("e"),
  };
}

export function legalMoves(fen: string): LegalMove[] {
  const c = safeChess(fen);
  if (!c) return [];
  return c.moves({ verbose: true }).map(toLegalMove);
}

/** Is this exact move legal in this exact position? Used before ANY claim. */
export function isLegal(fen: string, from: string, to: string, promotion?: string): boolean {
  return legalMoves(fen).some(
    (m) => m.from === from && m.to === to && (!promotion || m.promotion === promotion),
  );
}

/** Material from `color`'s point of view, in centipawns. */
export function material(fen: string, color: Color): number {
  const c = safeChess(fen);
  if (!c) return 0;
  let score = 0;
  for (const row of c.board()) {
    for (const sq of row) {
      if (!sq) continue;
      const v = PIECE_VALUE[sq.type] ?? 0;
      score += sq.color === color ? v : -v;
    }
  }
  return score;
}

const CENTER: string[] = ["d4", "e4", "d5", "e5"];
const WIDE_CENTER: string[] = [
  "c3", "d3", "e3", "f3", "c4", "d4", "e4", "f4",
  "c5", "d5", "e5", "f5", "c6", "d6", "e6", "f6",
];

/** Small, explainable positional bonus — kept tiny so material dominates. */
function positional(c: Chess, color: Color): number {
  let s = 0;
  for (const row of c.board()) {
    for (const sq of row) {
      if (!sq) continue;
      const sign = sq.color === color ? 1 : -1;
      if (CENTER.includes(sq.square)) s += sign * 12;
      else if (WIDE_CENTER.includes(sq.square)) s += sign * 4;
      if (sq.type === "n" || sq.type === "b") {
        const backRank = sq.color === "w" ? "1" : "8";
        if (sq.square[1] !== backRank) s += sign * 10; // developed
      }
    }
  }
  return s;
}

/**
 * MATERIAL-ONLY evaluation. Used for every tactical claim ("is my piece safe?",
 * "is this capture free?"). Positional taste must never change a statement
 * about material, otherwise the coach tells beginners a free pawn is not free.
 */
export function materialEval(c: Chess, color: Color): number {
  let s = 0;
  for (const row of c.board()) {
    for (const sq of row) {
      if (!sq) continue;
      s += (sq.color === color ? 1 : -1) * (PIECE_VALUE[sq.type] ?? 0);
    }
  }
  return s;
}

/** Material + a small positional bonus. Used only for ranking/among-equals. */
export function evaluate(c: Chess, color: Color): number {
  return materialEval(c, color) + positional(c, color);
}

/* ------------------------------------------------------------------ */
/* Bounded capture search (quiescence)                                 */
/* ------------------------------------------------------------------ */

const SAN_DEST = /([a-h][1-8])(?:=([QRBN]))?[+#]?$/;
/**
 * Capture-search depth. 4 plies resolves every normal exchange on one square
 * (take, take back, take back again) while keeping a sharp middlegame position
 * under ~100ms on a phone. Deeper claims are left to Stockfish, and anything
 * we show is replay-verified anyway.
 */
const MAX_Q_PLY = 4;
const MATE_SCORE = 100000;

type QMove = { san: string; gain: number };

/**
 * Captures (and promotions) for the side to move, with the material change
 * expressed from `color`'s point of view. Built from SAN strings for speed.
 */
function captureList(c: Chess, color: Color): QMove[] {
  const sign = c.turn() === color ? 1 : -1;
  const out: QMove[] = [];
  for (const san of c.moves()) {
    const isCap = san.includes("x");
    const isPromo = san.includes("=");
    if (!isCap && !isPromo) continue;
    const m = SAN_DEST.exec(san);
    if (!m) continue;
    let gain = 0;
    if (isCap) {
      const victim = c.get(m[1] as Square);
      // nothing on the destination square => en passant, so the victim is a pawn
      gain += victim ? PIECE_VALUE[victim.type] ?? 0 : PIECE_VALUE.p;
    }
    if (m[2]) gain += (PIECE_VALUE[m[2].toLowerCase()] ?? 0) - PIECE_VALUE.p;
    if (gain === 0) continue;
    out.push({ san, gain: gain * sign });
  }
  out.sort((a, b) => Math.abs(b.gain) - Math.abs(a.gain)); // most valuable victim first
  return out;
}

/**
 * Quiescence on MATERIAL ONLY, relative to where it started.
 * `mat` is the running material difference in centipawns for `color`.
 */
function quiesceMat(c: Chess, color: Color, alpha: number, beta: number, mat: number, ply: number): number {
  if (ply >= MAX_Q_PLY) return mat;
  const maximizing = c.turn() === color;
  // "stand pat" — the side to move may simply decline to capture
  if (maximizing) {
    if (mat >= beta) return beta;
    if (mat > alpha) alpha = mat;
  } else {
    if (mat <= alpha) return alpha;
    if (mat < beta) beta = mat;
  }
  for (const cap of captureList(c, color)) {
    let ok = false;
    try {
      ok = !!c.move(cap.san);
    } catch {
      ok = false;
    }
    if (!ok) continue;
    const score = quiesceMat(c, color, alpha, beta, mat + cap.gain, ply + 1);
    c.undo();
    if (maximizing) {
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    } else {
      if (score <= alpha) return alpha;
      if (score < beta) beta = score;
    }
  }
  return maximizing ? alpha : beta;
}

/**
 * How much material `color` wins (+) or loses (-) from this exact position
 * after every worthwhile capture is played out. 0 means "nothing hangs".
 */
export function materialSwing(c: Chess, color: Color): number {
  return quiesceMat(c, color, -Infinity, Infinity, 0, 0);
}

export type ScoredMove = LegalMove & { score: number };

/**
 * Score every legal move for the side to move, from that side's perspective.
 * Material truth first; the small positional term only breaks ties.
 */
/**
 * Cheap static ordering used only to DECIDE WHICH MOVES TO SEARCH when a
 * caller asks for a bounded search. Every capture, check and promotion is
 * always kept, so tactics are never pruned away — only quiet moves are.
 */
/**
 * How far up the board a square is from the MOVER's own side: 1 is their
 * home rank, 8 is promotion. Needed because ordering must not depend on
 * colour — a white move to e4 and the mirrored black move to e5 are the
 * same idea and have to sort the same way.
 */
function advancement(square: string, color: Color): number {
  const r = Number(square[1]);
  return color === "w" ? r : 9 - r;
}

/**
 * Deterministic tie-break for equally ranked moves.
 *
 * Without this, ties fell through to chess.js's move-generation order,
 * which walks the board a8 -> h1 for BOTH colours. That is not a mirror,
 * so a bounded search kept a different set of quiet moves for Black than
 * for White and could return a worse suggestion for the same position seen
 * from the other side. Found by metamorphic testing.
 */
function tieBreak(a: LegalMove, b: LegalMove, color: Color): number {
  const toAdv = advancement(b.to, color) - advancement(a.to, color);
  if (toAdv !== 0) return toAdv;
  if (a.to[0] !== b.to[0]) return a.to[0] < b.to[0] ? -1 : 1;
  const fromAdv = advancement(b.from, color) - advancement(a.from, color);
  if (fromAdv !== 0) return fromAdv;
  if (a.from[0] !== b.from[0]) return a.from[0] < b.from[0] ? -1 : 1;
  if (a.piece !== b.piece) return a.piece < b.piece ? -1 : 1;
  return (a.promotion ?? "").localeCompare(b.promotion ?? "");
}

function staticOrder(m: LegalMove): number {
  let s = 0;
  if (m.isCapture) s += 1000 + (PIECE_VALUE[m.captured ?? "p"] ?? 0);
  if (m.promotion) s += 800;
  if (m.isCheck) s += 500;
  if (m.isCastle) s += 70;
  if (CENTER.includes(m.to)) s += 60;
  else if (WIDE_CENTER.includes(m.to)) s += 25;
  if (m.piece === "n" || m.piece === "b") s += 30;
  return s;
}

export type ScoreOpts = {
  /**
   * Search at most this many quiet moves (captures/checks/promotions are
   * always searched). Used for the "what might happen next" lines, where we
   * need a good legal reply rather than an exhaustive ranking.
   */
  limit?: number;
};

export function scoreMoves(fen: string, opts: ScoreOpts = {}): ScoredMove[] {
  const c = safeChess(fen);
  if (!c) return [];
  const color = c.turn();
  const out: ScoredMove[] = [];
  let pool = c.moves({ verbose: true }).map(toLegalMove);
  if (opts.limit && pool.length > opts.limit) {
    const forced = pool.filter((m) => m.isCapture || m.isCheck || m.promotion);
    const quiet = pool
      .filter((m) => !(m.isCapture || m.isCheck || m.promotion))
      .sort((a, b) => staticOrder(b) - staticOrder(a) || tieBreak(a, b, color))
      .slice(0, opts.limit);
    pool = [...forced, ...quiet];
  }
  for (const m of pool) {
    let gain = 0;
    if (m.isCapture) gain += PIECE_VALUE[m.captured ?? "p"] ?? 0;
    if (m.promotion) gain += (PIECE_VALUE[m.promotion] ?? 0) - PIECE_VALUE.p;

    let ok = false;
    try {
      ok = !!c.move(m.san);
    } catch {
      ok = false;
    }
    if (!ok) continue;

    let score: number;
    if (m.isMate) {
      score = MATE_SCORE;
    } else if (c.moves().length === 0) {
      score = 0; // stalemate is a draw — never scored as if we kept the material
    } else {
      score = quiesceMat(c, color, -Infinity, Infinity, gain, 0) + positional(c, color);
    }
    c.undo();
    out.push({ ...m, score });
  }
  out.sort((a, b) => b.score - a.score || tieBreak(a, b, color));
  return out;
}

/** Material the side to move can win right now, verified by capture search. */
export function tacticalSwing(fen: string): number {
  const c = safeChess(fen);
  if (!c) return 0;
  return materialSwing(c, c.turn());
}

/* ------------------------------------------------------------------ */
/* Threats, hanging pieces, safe captures — all replay-verified        */
/* ------------------------------------------------------------------ */

/**
 * Null-move "what could the opponent do if I did nothing?".
 * Only valid when the side to move is NOT in check (you cannot pass a check).
 */
export function nullMoveFen(fen: string): string | null {
  const c = safeChess(fen);
  if (!c) return null;
  if (c.isCheck()) return null;
  const parts = fen.split(" ");
  if (parts.length < 4) return null;
  parts[1] = parts[1] === "w" ? "b" : "w";
  parts[3] = "-"; // the en passant right disappears after a pass
  const swapped = parts.join(" ");
  const test = safeChess(swapped);
  if (!test) return null;
  return swapped;
}

export type Threat = {
  /**
   * CAREFUL — this has two shapes, told apart by `immediate`.
   *
   *  immediate === false  from -> to is a real opponent move, legal in
   *                       `threatFen`, and `san` is real SAN.
   *  immediate === true   you are ALREADY in check. `from` is the piece
   *                       giving it and `to` is your own king's square.
   *                       That is NOT a playable move — you cannot capture
   *                       a king, and it is your turn, not theirs — and
   *                       `san` is the placeholder "check".
   *
   * Use `threatIsReplayable` rather than remembering this. The old comment
   * claimed the move was always legal in `threatFen`, which fuzzing showed
   * is false for every in-check position.
   */
  from: Square;
  to: Square;
  san: string;
  kind: "mate" | "capture" | "check";
  /** Centipawns that would be lost. */
  materialAtRisk: number;
  capturedPiece?: string;
  /** The position the threat was verified in (null-moved, or the real FEN). */
  threatFen: string;
  /** True when it is already happening (you are in check right now). */
  immediate: boolean;
};

/** Is this threat an opponent move you can replay, or an existing check? */
export function threatIsReplayable(threat: Threat): boolean {
  return !threat.immediate && threat.kind !== "check";
}

/**
 * Find a REAL, verified threat against the side to move.
 * Returns null when there is no concrete threat — we then say so honestly
 * instead of manufacturing drama.
 */
export function findThreat(fen: string): Threat | null {
  const c = safeChess(fen);
  if (!c) return null;

  // Already in check — that is the threat, no speculation needed.
  if (c.isCheck()) {
    const src = lastCheckSource(fen);
    return {
      from: src?.from ?? ("a1" as Square),
      to: src?.to ?? ("a1" as Square),
      san: "check",
      kind: "check",
      materialAtRisk: 0,
      threatFen: fen,
      immediate: true,
    };
  }

  const nf = nullMoveFen(fen);
  if (!nf) return null;
  const opp = safeChess(nf);
  if (!opp) return null;
  const myColor = c.turn();

  // 1. Mate in one for the opponent — taken straight from SAN, then replayed.
  for (const san of opp.moves()) {
    if (!san.includes("#")) continue;
    const verbose = opp.moves({ verbose: true }).find((m) => m.san === san);
    if (!verbose) continue;
    return {
      from: verbose.from as Square,
      to: verbose.to as Square,
      san,
      kind: "mate",
      materialAtRisk: 0,
      threatFen: nf,
      immediate: false,
    };
  }

  // 2. A capture that actually WINS material after the whole exchange.
  //    Ties are broken deterministically and from the OPPONENT's own side
  //    of the board, so the same threat is reported whichever colour is
  //    facing it. Before this, equal threats were picked by chess.js's
  //    generation order and a mirrored position named a different one.
  let best: Threat | null = null;
  let bestMove: LegalMove | null = null;
  let bestLoss = 0;
  const oppColor: Color = myColor === "w" ? "b" : "w";
  for (const raw of opp.moves({ verbose: true })) {
    const m = toLegalMove(raw);
    if (!m.isCapture) continue;
    const victimValue = PIECE_VALUE[m.captured ?? "p"] ?? 0;
    let ok = false;
    try {
      ok = !!opp.move(m.san);
    } catch {
      ok = false;
    }
    if (!ok) continue;
    // after they grab it, can I take back? quiescence answers honestly
    const after = quiesceMat(opp, myColor, -Infinity, Infinity, -victimValue, 0);
    opp.undo();
    const loss = -after;
    const better =
      loss >= 100 && (loss > bestLoss || (loss === bestLoss && bestMove && tieBreak(m, bestMove, oppColor) < 0));
    if (better) {
      bestLoss = loss;
      bestMove = m;
      best = {
        from: m.from,
        to: m.to,
        san: m.san,
        kind: "capture",
        materialAtRisk: loss,
        capturedPiece: m.captured,
        threatFen: nf,
        immediate: false,
      };
    }
  }
  return best;
}

/** Which enemy piece is giving check right now (for highlighting the path). */
export function lastCheckSource(fen: string): { from: Square; to: Square } | null {
  const c = safeChess(fen);
  if (!c || !c.isCheck()) return null;
  const me = c.turn();
  let kingSq: string | null = null;
  for (const row of c.board()) {
    for (const sq of row) {
      if (sq && sq.type === "k" && sq.color === me) kingSq = sq.square;
    }
  }
  if (!kingSq) return null;
  const parts = fen.split(" ");
  parts[1] = me === "w" ? "b" : "w";
  parts[3] = "-";
  const enemy = safeChess(parts.join(" "));
  if (!enemy) return null;
  for (const m of enemy.moves({ verbose: true })) {
    if (m.to === kingSq) return { from: m.from as Square, to: m.to as Square };
  }
  return null;
}

/** Pieces of `color` the opponent can profitably take. Verified by replay. */
export function hangingPieces(
  fen: string,
  color: Color,
): Array<{ square: Square; type: string; loss: number }> {
  const c = safeChess(fen);
  if (!c) return [];
  const oppFen = c.turn() === color ? nullMoveFen(fen) : fen;
  if (!oppFen) return [];
  const opp = safeChess(oppFen);
  if (!opp) return [];

  const bySquare = new Map<string, { square: Square; type: string; loss: number }>();
  for (const raw of opp.moves({ verbose: true })) {
    const m = toLegalMove(raw);
    if (!m.isCapture) continue;
    const victim = c.get(m.to);
    if (!victim || victim.color !== color) continue;
    const victimValue = PIECE_VALUE[m.captured ?? "p"] ?? 0;
    let ok = false;
    try {
      ok = !!opp.move(m.san);
    } catch {
      ok = false;
    }
    if (!ok) continue;
    const after = quiesceMat(opp, color, -Infinity, Infinity, -victimValue, 0);
    opp.undo();
    const loss = -after;
    if (loss >= 100) {
      const prev = bySquare.get(m.to);
      if (!prev || loss > prev.loss) bySquare.set(m.to, { square: m.to, type: victim.type, loss });
    }
  }
  // Equal losses used to keep Map insertion order, which follows the
  // opponent's move generation and is NOT a mirror. Callers take [0] as
  // "the worst piece", so White and Black rescued different pieces in the
  // same position. Break the tie from the OWNER's side of the board.
  return [...bySquare.values()].sort(
    (a, b) =>
      b.loss - a.loss ||
      (PIECE_VALUE[b.type] ?? 0) - (PIECE_VALUE[a.type] ?? 0) ||
      advancement(b.square, color) - advancement(a.square, color) ||
      (a.square[0] < b.square[0] ? -1 : a.square[0] > b.square[0] ? 1 : 0),
  );
}

/** Captures the side to move can make that do NOT lose material. Verified. */
export function safeCaptures(fen: string): ScoredMove[] {
  const c = safeChess(fen);
  if (!c) return [];
  const color = c.turn();
  const out: ScoredMove[] = [];
  for (const raw of c.moves({ verbose: true })) {
    const m = toLegalMove(raw);
    if (!m.isCapture) continue;
    const gain = PIECE_VALUE[m.captured ?? "p"] ?? 0;
    let ok = false;
    try {
      ok = !!c.move(m.san);
    } catch {
      ok = false;
    }
    if (!ok) continue;
    const after = quiesceMat(c, color, -Infinity, Infinity, gain, 0);
    c.undo();
    if (after >= 0) out.push({ ...m, score: after });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Squares a piece covers from where it stands — for "protects this square". */
export function squaresCoveredFrom(fen: string, square: Square): Square[] {
  const c = safeChess(fen);
  if (!c) return [];
  const piece = c.get(square);
  if (!piece) return [];
  const useFen = c.turn() === piece.color ? fen : nullMoveFen(fen);
  if (!useFen) return [];
  const view = safeChess(useFen);
  if (!view) return [];
  return view.moves({ verbose: true, square }).map((m) => m.to as Square);
}

export const PIECE_NAME: Record<string, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};
