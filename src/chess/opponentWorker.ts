/**
 * Opponent worker — picks ONE legal reply, off the main thread.
 *
 * Every reply is tagged with the generation + FEN it was asked for, so the
 * caller can discard it after an undo, a new game or a mode switch.
 */

import { scoreMoves } from "../coach/localAnalysis";
import { legacyStrength, normalizeStrength } from "../engine/strength";

export type OpponentLevel = "gentle" | "steady" | "sharp";

export type OpponentRequest = {
  type: "pick";
  fen: string;
  generation: number;
  requestId: number;
  level: OpponentLevel;
  strength?: number;
};

export type OpponentResponse = {
  type: "picked";
  generation: number;
  requestId: number;
  fen: string;
  uci: string | null;
  san: string | null;
};

/** Rules-only fallback, not Stockfish and not calibrated strength. Same inputs
 * always yield the same legal move, including tie breaks (no Math.random). */
export function pickReply(fen: string, level: OpponentLevel = "steady", strength?: number): { uci: string; san: string } | null {
  const moves = scoreMoves(fen);
  if (moves.length === 0) return null;
  const best = moves[0];
  // Always take a forced mate — a coach that misses mate teaches nothing.
  if (best.isMate) return { uci: best.uci, san: best.san };

  const value = normalizeStrength(strength ?? legacyStrength(level));
  const slack = Math.round((10 - value) * 35);
  const pool = moves.filter((m) => best.score - m.score <= slack).sort((a, b) => a.uci.localeCompare(b.uci));
  let hash = 2166136261;
  for (const ch of `${fen}|${value}`) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
  const chosen = pool[hash % pool.length] ?? best;
  return { uci: chosen.uci, san: chosen.san };
}

// Importing pickReply on the main thread must NEVER overwrite window.onmessage.
if (typeof self !== "undefined" && typeof document === "undefined") self.onmessage = (e: MessageEvent<OpponentRequest>) => {
  const req = e.data;
  if (!req || req.type !== "pick") return;
  let picked: { uci: string; san: string } | null = null;
  try {
    picked = pickReply(req.fen, req.level, req.strength);
  } catch {
    picked = null;
  }
  const res: OpponentResponse = {
    type: "picked",
    generation: req.generation,
    requestId: req.requestId,
    fen: req.fen,
    uci: picked?.uci ?? null,
    san: picked?.san ?? null,
  };
  (self as unknown as Worker).postMessage(res);
};
