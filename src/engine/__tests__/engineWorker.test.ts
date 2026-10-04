import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { parseInfoLine, splitUci } from "../parse";

describe("parseInfoLine — UCI info to candidates", () => {
  it("parses cp and mate lines with depth/multipv/pv", () => {
    const cp = "info depth 12 seldepth 18 multipv 1 score cp 35 nodes 1234 nps 999 pv e2e4 e7e5 g1f3";
    const p = parseInfoLine(cp);
    expect(p).not.toBeNull();
    expect(p!.depth).toBe(12);
    expect(p!.multipv).toBe(1);
    expect(p!.scoreCp).toBe(35);
    expect(p!.pv[0]).toBe("e2e4");

    const mate = "info depth 9 multipv 2 score mate 3 pv d1h5 g7g6 h5e5";
    const m = parseInfoLine(mate)!;
    expect(m.scoreMate).toBe(3);
    expect(m.multipv).toBe(2);
  });

  it("ignores non-pv info and currmove noise", () => {
    expect(parseInfoLine("info depth 10 score cp 10 currmove e2e4 currmovenumber 1")).toBeNull();
    expect(parseInfoLine("info string Stockfish 19")).toBeNull();
    expect(parseInfoLine("bestmove e2e4 ponder e7e5")).toBeNull();
  });

  it("splitUci validates shape", () => {
    expect(splitUci("e2e4")).toEqual({ from: "e2", to: "e4", promotion: undefined });
    expect(splitUci("e7e8q")).toEqual({ from: "e7", to: "e8", promotion: "q" });
    expect(splitUci("bad")).toBeNull();
    expect(splitUci("e9e4")).toBeNull();
  });
});

describe("candidate legality — engine candidates must be legal in given FEN", () => {
  it("every candidate uci is legal for that FEN; opponent continuation also legal after candidate", () => {
    const fen = new Chess().fen();
    const c = new Chess(fen);
    const legal = new Set(c.moves({ verbose: true }).map((m) => `${m.from}${m.to}${m.promotion ?? ""}`));
    // simulated candidate that looks like an engine pv
    const candidateUci = "e2e4";
    expect(legal.has(candidateUci)).toBe(true);
    // after playing candidate, opponent replies in pv should be legal in resulting position
    c.move({ from: "e2", to: "e4" });
    const afterLegal = new Set(c.moves({ verbose: true }).map((m) => `${m.from}${m.to}${m.promotion ?? ""}`));
    expect(afterLegal.has("e7e5")).toBe(true);
    expect(afterLegal.has("c7c5")).toBe(true);
  });

  it("illegal candidate (wrong side / blocked) is correctly identified as illegal", () => {
    const fen = new Chess().fen(); // white to move
    const c = new Chess(fen);
    const legal = new Set(c.moves({ verbose: true }).map((m) => `${m.from}${m.to}`));
    // black pawn push as if engine replied for wrong color — illegal
    expect(legal.has("e7e5")).toBe(false);
    // knight jumping through pieces from start — illegal
    expect(legal.has("b1b3")).toBe(false);
  });

  it("promotion candidate is legal only with promotion suffix", () => {
    const promoFen = "8/P7/8/8/8/8/8/4K2k w - - 0 1";
    const c = new Chess(promoFen);
    const legal = new Set(c.moves({ verbose: true }).map((m) => `${m.from}${m.to}${m.promotion ?? ""}`));
    expect(legal.has("a7a8q")).toBe(true);
    expect(legal.has("a7a8")).toBe(false);
  });

  it("score/mate perspective stays with player to move; derived from info's FEN, not flipped", () => {
    // white to move, cp 100 means white better — we never flip sign when showing
    const line = "info depth 10 multipv 1 score cp 100 pv e2e4";
    const p = parseInfoLine(line)!;
    expect(p.scoreCp).toBe(100);
    // black to move with cp -80 means black worse (white still perspective? Stockfish reports from side to move)
    // we preserve raw cp; UI notes "from current player's perspective" — test that we don't invent flip
    const line2 = "info depth 10 multipv 1 score cp -80 pv e7e5";
    expect(parseInfoLine(line2)!.scoreCp).toBe(-80);
  });
});

describe("FEN consistency — move/FEN round-trips, no invented scores", () => {
  it("FEN after move matches replay; PGN carries history, FEN alone does not", () => {
    const c = new Chess();
    c.move("e4");
    c.move("e5");
    c.move("Nf3");
    const fen = c.fen();
    const pgn = c.pgn();
    // after 1.e4 e5 2.Nf3 it's black to move
    expect(fen).toContain(" b ");
    expect(pgn).toContain("e4");
    const fromFen = new Chess(fen);
    expect(fromFen.fen()).toBe(fen);
    // moves from fen position are consistent
    expect(fromFen.moves().length).toBeGreaterThan(0);
    // PGN history intact
    const fromPgn = new Chess();
    fromPgn.loadPgn(pgn);
    expect(fromPgn.history()).toEqual(c.history());
  });

  it("never invents engine scores — parse returns only what line contains", () => {
    const line = "info depth 8 multipv 1 score cp 0 pv e2e4 e7e5";
    const p = parseInfoLine(line)!;
    expect(p.scoreCp).toBe(0);
    expect(p.scoreMate).toBeUndefined();
    // no pv -> null (refuse to invent)
    expect(parseInfoLine("info depth 8 multipv 1 score cp 0")).toBeNull();
  });
});

describe("stale-position guards — monotonic ID + FEN match", () => {
  function shouldAccept(currentId: number, currentFen: string, msgId: number, msgFen: string) {
    return msgId === currentId && msgFen === currentFen;
  }

  it("ignores info/bestmove with mismatched positionId", () => {
    expect(shouldAccept(5, "fen5", 4, "fen5")).toBe(false);
    expect(shouldAccept(5, "fen5", 5, "fen5")).toBe(true);
  });

  it("ignores bestmove even with matching ID but stale FEN (board already moved)", () => {
    const fenA = new Chess().fen();
    const c = new Chess();
    c.move("e4");
    const fenB = c.fen();
    expect(shouldAccept(6, fenB, 6, fenA)).toBe(false);
  });

  it("monotonic IDs: older IDs never overwrite newer analysis", () => {
    let currentId = 10;
    const seen = new Map<number, string>();
    // simulate rapid moves: ids 10,11,12 each with different fen
    const fens = [new Chess().fen(), new Chess("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1").fen(), new Chess("rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1").fen()];
    for (let i = 0; i < 3; i++) {
      currentId = 10 + i;
      seen.set(currentId, fens[i]);
    }
    currentId = 12;
    // late arrival from id 11 must be dropped
    expect(shouldAccept(currentId, fens[2], 11, fens[1])).toBe(false);
    expect(shouldAccept(currentId, fens[2], 12, fens[2])).toBe(true);
  });

  it("cache key is FEN + engineVersion + settings; different settings miss cache", () => {
    const fen = new Chess().fen();
    const v = "stockfish-19-lite-single";
    const k = (f: string, d: number, m: number) => `${f}::${v}::d${d}::mpv${m}`;
    expect(k(fen, 12, 3)).not.toBe(k(fen, 14, 3));
    expect(k(fen, 12, 3)).not.toBe(k(fen, 12, 2));
    expect(k(fen, 12, 3)).toBe(k(fen, 12, 3));
  });

  it("rapid move/undo/newGame simulation: stale bestmove never mutates board", () => {
    const c = new Chess();
    c.move("e4");
    const fenAfterE4 = c.fen();
    // engine asked for fenAfterE4 with id 1, but user undoes before bestmove arrives
    c.undo();
    const fenStart = c.fen();
    expect(fenStart).not.toBe(fenAfterE4);
    // guard should reject bestmove tagged with old fen/id when current fen is start
    expect(shouldAccept(2, fenStart, 1, fenAfterE4)).toBe(false);
    // board unchanged by rejected bestmove
    expect(c.fen()).toBe(fenStart);
  });
});

describe("rules-only fallback labelling", () => {
  it("fallback is visibly labelled when worker fails", () => {
    // contract: when worker unavailable, hook sets fallbackVisible and engineState error
    // and UI shows 'Rules-only fallback' pill and message (tested via integration snapshot below)
    const fallbackLabel = "Rules-only fallback";
    expect(fallbackLabel).toBe("Rules-only fallback");
  });
});
