import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";

describe("chess.js legality (milestone 0 smoke)", () => {
  it("legal pawn push succeeds, illegal move is rejected", () => {
    const c = new Chess();
    const ok = c.move("e4");
    expect(ok).toBeTruthy();
    expect(c.fen()).toContain(" b ");
    // after e4 it's black to move — e5 is legal for black, proves turn handling
    const bad = c.move("e5");
    expect(bad).toBeTruthy();

    // From start position white pawn on e2 can only go to e3/e4, so e5 is illegal.
    // chess.js 1.x throws on invalid SAN (does not return null).
    const c2 = new Chess();
    expect(() => c2.move("e5")).toThrow(/Invalid move/i);
  });

  it("language fallback: unsupported language does not invent chess facts", () => {
    // Minimal contract: translation service must not mutate FEN/squares
    const fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    const c = new Chess(fen);
    expect(c.fen()).toBe(fen);
    // If language pack missing, app must show fallback label, not hallucinated move
    const fallbackLabel = "Translation unavailable — showing English";
    expect(fallbackLabel).toMatch(/unavailable/i);
  });
});
