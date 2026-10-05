import { Chess } from "chess.js";
import { describe, it, expect } from "vitest";
import {
  DEFAULT_SESSION,
  computerSide,
  shouldComputerMove,
  humanCanMove,
  isComputerMoveStillValid,
  parseSaved,
  type SessionState,
  isUsableFen,
} from "../session";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("turn ownership — the computer must never play White by itself", () => {
  const vsComputer: SessionState = { mode: "vsComputer", humanSide: "w" };

  it("defaults to a human White player in two-player mode", () => {
    expect(DEFAULT_SESSION.humanSide).toBe("w");
    expect(DEFAULT_SESSION.mode).toBe("solo");
    expect(computerSide(DEFAULT_SESSION)).toBe("none");
  });

  it("never lets the engine move in solo (two humans) mode", () => {
    for (const turn of ["w", "b"] as const) {
      expect(shouldComputerMove({ session: DEFAULT_SESSION, turn, status: "active" })).toBe(false);
    }
  });

  it("does NOT move for White when the human is White", () => {
    expect(shouldComputerMove({ session: vsComputer, turn: "w", status: "active" })).toBe(false);
  });

  it("moves exactly for Black when the human is White", () => {
    expect(shouldComputerMove({ session: vsComputer, turn: "b", status: "active" })).toBe(true);
  });

  it("mirrors correctly when the human chooses Black", () => {
    const s: SessionState = { mode: "vsComputer", humanSide: "b" };
    expect(shouldComputerMove({ session: s, turn: "w", status: "active" })).toBe(true);
    expect(shouldComputerMove({ session: s, turn: "b", status: "active" })).toBe(false);
  });

  it("only plays both colours in the explicit Watch mode", () => {
    const s: SessionState = { mode: "watch", humanSide: "w" };
    expect(computerSide(s)).toBe("both");
    expect(shouldComputerMove({ session: s, turn: "w", status: "active" })).toBe(true);
    expect(shouldComputerMove({ session: s, turn: "b", status: "active" })).toBe(true);
  });

  it("stops once the game is over or while a dialog is open", () => {
    expect(shouldComputerMove({ session: vsComputer, turn: "b", status: "checkmate" })).toBe(false);
    expect(shouldComputerMove({ session: vsComputer, turn: "b", status: "draw" })).toBe(false);
    expect(shouldComputerMove({ session: vsComputer, turn: "b", status: "active", paused: true })).toBe(false);
  });

  it("lets the human touch only their own colour against the computer", () => {
    expect(humanCanMove({ session: vsComputer, turn: "w", pieceColor: "w", status: "active" })).toBe(true);
    expect(humanCanMove({ session: vsComputer, turn: "b", pieceColor: "b", status: "active" })).toBe(false);
    // two humans on one phone: both colours are touchable
    expect(humanCanMove({ session: DEFAULT_SESSION, turn: "b", pieceColor: "b", status: "active" })).toBe(true);
    // watch mode is hands-off
    expect(
      humanCanMove({ session: { mode: "watch", humanSide: "w" }, turn: "w", pieceColor: "w", status: "active" }),
    ).toBe(false);
  });
});

describe("pending computer work can never land on the wrong board", () => {
  it("rejects a queued move after undo / new game (generation changed)", () => {
    expect(
      isComputerMoveStillValid({
        queuedGeneration: 4,
        currentGeneration: 5,
        queuedFen: START,
        currentFen: START,
      }),
    ).toBe(false);
  });

  it("rejects a queued move if the position moved on", () => {
    expect(
      isComputerMoveStillValid({
        queuedGeneration: 4,
        currentGeneration: 4,
        queuedFen: START,
        currentFen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
      }),
    ).toBe(false);
  });

  it("accepts only when generation AND position still match", () => {
    expect(
      isComputerMoveStillValid({
        queuedGeneration: 7,
        currentGeneration: 7,
        queuedFen: START,
        currentFen: START,
      }),
    ).toBe(true);
  });
});

describe("refresh keeps the right side and position", () => {
  it("restores mode and human side from a v2 save", () => {
    const raw = JSON.stringify({
      fen: START,
      pgn: "",
      orientation: "b",
      mode: "vsComputer",
      humanSide: "b",
      updatedAt: "2026-09-30T00:00:00Z",
    });
    const s = parseSaved(raw);
    expect(s?.mode).toBe("vsComputer");
    expect(s?.humanSide).toBe("b");
    expect(s?.orientation).toBe("b");
    expect(s?.fen).toBe(START);
  });

  it("migrates an old v1 save instead of deleting progress", () => {
    const legacy = JSON.stringify({ fen: START, pgn: "1. e4", orientation: "w" });
    const s = parseSaved(null, legacy);
    expect(s?.fen).toBe(START);
    expect(s?.pgn).toBe("1. e4");
    expect(s?.mode).toBe("solo");
    expect(s?.humanSide).toBe("w");
  });

  it("falls back safely on corrupt data", () => {
    expect(parseSaved("{not json", null)).toBeNull();
    expect(parseSaved(JSON.stringify({ fen: 42 }), null)).toBeNull();
  });

  it("defaults an unknown mode to the safe two-player mode", () => {
    const raw = JSON.stringify({ fen: START, pgn: "", orientation: "w", mode: "hack", humanSide: "x" });
    const s = parseSaved(raw);
    expect(s?.mode).toBe("solo");
    expect(s?.humanSide).toBe("w");
  });
});

describe("regression: a corrupt save must not cost you the game", () => {
  it("rebuilds the position from the move list when the FEN is unreadable", () => {
    // Found by fuzzing: parseSaved only checked `typeof fen === "string"`,
    // so "nonsense" came back as a usable session.
    const raw = JSON.stringify({
      fen: "nonsense",
      pgn: "1. e4 e5 2. Nf3 *",
      orientation: "w",
      mode: "vsComputer",
      humanSide: "w",
      updatedAt: new Date().toISOString(),
    });
    const saved = parseSaved(raw);
    expect(saved, "a readable move list means the game is recoverable").not.toBeNull();
    expect(() => new Chess(saved!.fen)).not.toThrow();
    // and it really is the position after 1.e4 e5 2.Nf3
    const c = new Chess(saved!.fen);
    expect(c.get("f3")).toMatchObject({ type: "n", color: "w" });
    expect(c.get("e4")).toMatchObject({ type: "p", color: "w" });
  });

  it("gives up only when the position AND the move list are both unreadable", () => {
    const raw = JSON.stringify({ fen: "nonsense", pgn: "also nonsense", orientation: "w" });
    expect(parseSaved(raw)).toBeNull();
  });

  it("never hands back a position a board cannot be built from", () => {
    for (const fen of ["", "   ", "nonsense", "8/8/8/8/8/8/8/8 w - - 0 1", "rnbq w", "{}"]) {
      const saved = parseSaved(JSON.stringify({ fen, pgn: "", orientation: "w" }));
      if (saved) expect(() => new Chess(saved.fen), `${fen} slipped through`).not.toThrow();
    }
  });

  it("isUsableFen tells a real position from a string that merely looks like one", () => {
    expect(isUsableFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")).toBe(true);
    expect(isUsableFen("nonsense")).toBe(false);
    expect(isUsableFen("")).toBe(false);
    expect(isUsableFen(null)).toBe(false);
    expect(isUsableFen(42)).toBe(false);
    // right shape, impossible board: no kings
    expect(isUsableFen("8/8/8/8/8/8/8/8 w - - 0 1")).toBe(false);
  });
});
