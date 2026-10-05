/**
 * Small, permitted/original exercise pool with attribution.
 * Store stable IDs, FEN, verified analysis provenance.
 */
import type { Exercise } from "./ranking";

export const EXERCISES: Exercise[] = [
  { id: "ex-hanging-1", fen: "r1bqkbnr/ppp2ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3", motif: "hanging", source: "original: hanging awareness", difficulty: 0.35, quality: 0.9 },
  { id: "ex-check-1", fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4", motif: "check", source: "original: mate in 1 (Scholar)", difficulty: 0.25, quality: 0.9 },
  { id: "ex-capture-1", fen: "rnbqkbnr/ppp1pppp/8/3p4/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 2", motif: "captures", source: "original: central tension", difficulty: 0.4, quality: 0.85 },
  { id: "ex-king-1", fen: "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 4 4", motif: "kingSafety", source: "original: king safety", difficulty: 0.55, quality: 0.88 },
  { id: "ex-opening-1", fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", motif: "opening", opening: "start", source: "original: opening principles", difficulty: 0.2, quality: 0.9 },
  { id: "ex-endgame-1", fen: "8/5k2/8/8/8/5K2/4P3/8 w - - 0 1", motif: "endgame", endgame: true, source: "original: king+pawn endgame", difficulty: 0.45, quality: 0.9 },
  { id: "ex-transfer-1", fen: "r1bqkb1r/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKBNR w KQkq - 2 3", motif: "hanging", source: "original: transfer — same idea new position", difficulty: 0.45, quality: 0.88 },
  { id: "ex-calc-1", fen: "r2qkb1r/ppp2ppp/2n1bn2/3pp3/3PP3/2N2N2/PPP2PPP/R1BQKB1R w KQkq - 4 5", motif: "calculation", source: "original: forcing line", difficulty: 0.65, quality: 0.85 },
];

export const DAILY_BOSS: Exercise = {
  id: "daily-boss-2026-09-27",
  fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
  motif: "tactic",
  source: "original: daily boss",
  difficulty: 0.6,
  quality: 0.92,
};
