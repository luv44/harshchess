import { Chess } from "chess.js";
import { splitUci } from "./parse";

/** Exact UCI match: a missing/extra promotion suffix is never silently repaired. */
export function legalUci(fen: string, uci: string | null | undefined): boolean {
  if (!uci || !splitUci(uci)) return false;
  try {
    return new Chess(fen).moves({ verbose: true }).some((m) => `${m.from}${m.to}${m.promotion ?? ""}` === uci);
  } catch {
    return false;
  }
}

/** Refuse the WHOLE line on an illegal ply rather than displaying a trusted prefix. */
export function legalPvSans(fen: string, pv: readonly string[]): string[] | null {
  if (!pv.length) return null;
  try {
    const board = new Chess(fen);
    const sans: string[] = [];
    for (const uci of pv) {
      if (!splitUci(uci)) return null;
      const move = board.moves({ verbose: true }).find((m) => `${m.from}${m.to}${m.promotion ?? ""}` === uci);
      if (!move) return null;
      sans.push(board.move(move).san);
    }
    return sans;
  } catch {
    return null;
  }
}
