/**
 * Turn-state / session rules — PURE logic, no React, fully unit-testable.
 *
 * This module is the single source of truth for "who is allowed to move now".
 * It exists because the previous build let the engine move for BOTH colours
 * (the computer effect never checked which side was to move).
 *
 * It is still pure and React-free. It imports chess.js only to answer one
 * question honestly — "is this saved position one a board can be built
 * from?" — which cannot be decided by looking at the string.
 */

import { Chess } from "chess.js";

export type Color = "w" | "b";

export type GameMode =
  /** Two humans on one phone. Engine never moves a piece. */
  | "solo"
  /** Human plays one colour, computer answers with exactly ONE reply. */
  | "vsComputer"
  /** Explicit, clearly-labelled demo. Engine moves both colours ON PURPOSE. */
  | "watch";

export type StatusKind = "active" | "checkmate" | "stalemate" | "draw" | "other";

export type SessionState = {
  mode: GameMode;
  /** The colour the HUMAN plays. White by default. */
  humanSide: Color;
};

export const DEFAULT_SESSION: SessionState = { mode: "solo", humanSide: "w" };

/** The colour the computer is allowed to move in this mode. */
export function computerSide(s: SessionState): Color | "both" | "none" {
  if (s.mode === "solo") return "none";
  if (s.mode === "watch") return "both";
  return s.humanSide === "w" ? "b" : "w";
}

/**
 * Core guard. Returns true ONLY when the computer is entitled to move right now.
 * Never returns true for the human's colour unless the user explicitly chose
 * "watch" (Computer vs Computer), which is a separate, clearly named mode.
 */
export function shouldComputerMove(args: {
  session: SessionState;
  turn: Color;
  status: StatusKind;
  /** Computer moves are suspended while a modal/onboarding/promotion is open. */
  paused?: boolean;
}): boolean {
  const { session, turn, status, paused } = args;
  if (paused) return false;
  if (status !== "active") return false;
  const side = computerSide(session);
  if (side === "none") return false;
  if (side === "both") return true;
  return side === turn;
}

/** True when the human is allowed to pick up a piece of `pieceColor`. */
export function humanCanMove(args: {
  session: SessionState;
  turn: Color;
  pieceColor: Color;
  status: StatusKind;
}): boolean {
  const { session, turn, pieceColor, status } = args;
  if (status !== "active") return false;
  if (pieceColor !== turn) return false;
  if (session.mode === "watch") return false; // demo only, hands off
  if (session.mode === "solo") return true; // both colours are human
  return turn === session.humanSide;
}

/**
 * Every action that invalidates in-flight computer work bumps a generation
 * counter. A queued computer move is only allowed to land if its generation
 * still matches — this is what stops an undo from "immediately replaying a
 * stale move" and stops pending work from moving pieces in a NEW game.
 */
export function isComputerMoveStillValid(args: {
  queuedGeneration: number;
  currentGeneration: number;
  queuedFen: string;
  currentFen: string;
}): boolean {
  return (
    args.queuedGeneration === args.currentGeneration && args.queuedFen === args.currentFen
  );
}

/* ------------------------------------------------------------------ */
/* Persistence (v2) — survives refresh, migrates the old v1 save.      */
/* ------------------------------------------------------------------ */

export const SESSION_KEY = "chessworkermind:game:v2";
export const LEGACY_KEY = "chessworkermind:freeGame:v1";

export type SavedSession = {
  fen: string;
  pgn: string;
  orientation: Color;
  mode: GameMode;
  humanSide: Color;
  updatedAt: string;
};

function isMode(v: unknown): v is GameMode {
  return v === "solo" || v === "vsComputer" || v === "watch";
}
function isColor(v: unknown): v is Color {
  return v === "w" || v === "b";
}


/**
 * Is this string a position a board can actually be built from?
 *
 * A save can be corrupted by a half-finished write, a browser clearing
 * storage mid-flight, an older build, or someone editing it by hand. Found
 * by fuzzing: parseSaved only checked `typeof fen === "string"`, so a value
 * like "nonsense" came back as a usable session and every consumer had to
 * remember to wrap it in a try/catch.
 */
export function isUsableFen(fen: unknown): fen is string {
  if (typeof fen !== "string" || fen.trim().length === 0) return false;
  try {
    new Chess(fen);
    return true;
  } catch {
    return false;
  }
}

/** The position a PGN ends in, or null if the PGN cannot be read. */
export function fenFromPgn(pgn: unknown): string | null {
  if (typeof pgn !== "string" || pgn.trim().length === 0) return null;
  try {
    const c = new Chess();
    c.loadPgn(pgn);
    return c.fen();
  } catch {
    return null;
  }
}

export function parseSaved(raw: string | null, legacyRaw?: string | null): SavedSession | null {
  if (raw) {
    try {
      const p = JSON.parse(raw) as Partial<SavedSession>;
      if (typeof p.fen === "string" && typeof p.pgn === "string" && isColor(p.orientation)) {
        // A broken FEN does not mean a lost game: the move list usually
        // still reads, and it carries the history as well as the position.
        const fen = isUsableFen(p.fen) ? p.fen : fenFromPgn(p.pgn);
        if (!fen) return null;
        return {
          fen,
          pgn: p.pgn,
          orientation: p.orientation,
          mode: isMode(p.mode) ? p.mode : "solo",
          humanSide: isColor(p.humanSide) ? p.humanSide : "w",
          updatedAt: typeof p.updatedAt === "string" ? p.updatedAt : new Date(0).toISOString(),
        };
      }
    } catch {
      /* corrupt — fall through to legacy */
    }
  }
  if (legacyRaw) {
    try {
      const p = JSON.parse(legacyRaw) as { fen?: string; pgn?: string; orientation?: unknown };
      if (typeof p.fen === "string" && typeof p.pgn === "string") {
        // migrate: old saves had no mode/side. Never destroy the saved game.
        const fen = isUsableFen(p.fen) ? p.fen : fenFromPgn(p.pgn);
        if (!fen) return null;
        return {
          fen,
          pgn: p.pgn,
          orientation: isColor(p.orientation) ? p.orientation : "w",
          mode: "solo",
          humanSide: "w",
          updatedAt: new Date(0).toISOString(),
        };
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function loadSession(): SavedSession | null {
  try {
    return parseSaved(localStorage.getItem(SESSION_KEY), localStorage.getItem(LEGACY_KEY));
  } catch {
    return null;
  }
}

export function saveSession(s: SavedSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* private mode / quota — non fatal, board keeps working */
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
