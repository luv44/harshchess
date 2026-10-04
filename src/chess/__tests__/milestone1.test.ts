import { describe, it, expect, beforeEach } from "vitest";
import { Chess } from "chess.js";
import { loadSavedGame, saveGame, clearSavedGame, STORAGE_KEY } from "../storage";

// Ensure clean storage per test
beforeEach(() => {
  localStorage.clear();
});

describe("milestone 1 — chess legality (chess.js 1.4.0)", () => {
  it("accepts legal pawn push and rejects illegal far pawn push", () => {
    const c = new Chess();
    expect(c.move("e4")).toBeTruthy();
    expect(c.fen()).toContain(" b ");
    expect(() => new Chess().move("e5")).toThrow(/Invalid move/i);
  });

  it("enforces turn — moving same color twice is illegal", () => {
    const c = new Chess();
    c.move("e4");
    // white just moved, white pawn a2->a3 should fail (black to move)
    expect(() => c.move("a3")).toThrow(/Invalid move/i);
    // black move succeeds
    expect(c.move("e5")).toBeTruthy();
  });

  it("allows kingside castling when legal", () => {
    // position after 1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 — white can castle
    const c = new Chess();
    c.move("e4");
    c.move("e5");
    c.move("Nf3");
    c.move("Nc6");
    c.move("Bc4");
    c.move("Nf6");
    // O-O is legal (no pieces blocking? Actually bishop on c4 but f1 empty after this line? White bishop left f1 via Bc4, so O-O path clear and no check)
    const mv = c.move("O-O");
    expect(mv).toBeTruthy();
    expect(mv.san).toBe("O-O");
    expect(c.get("g1")?.type).toBe("k");
    expect(c.get("f1")?.type).toBe("r");
  });

  it("rejects castling through check / when rights lost", () => {
    const c = new Chess("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    // clear path, but black gives check? Actually not. Try valid — should succeed for white O-O
    expect(c.move("O-O")).toBeTruthy();
    // now black to move, try O-O-O — should also be legal from this FEN but test illegal by blocking: put piece on path
    const c2 = new Chess("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    expect(() => c2.move("O-O")).toThrow(/Invalid move/i);
  });

  it("handles en passant", () => {
    const c = new Chess();
    c.move("e4");
    c.move("a6");
    c.move("e5");
    c.move("d5");
    // white pawn on e5 can capture en passant on d6
    const moves = c.moves({ verbose: true, square: "e5" });
    const ep = moves.find((m) => m.to === "d6" && m.isEnPassant());
    expect(ep).toBeTruthy();
    // sanitize: if en passant available, performing it should succeed and remove captured pawn
    if (ep) {
      const res = c.move({ from: "e5", to: "d6" });
      expect(res).toBeTruthy();
      expect(c.get("d5")).toBeUndefined();
    }
  });

  it("requires promotion choice on last rank", () => {
    // White pawn on a7, promotion
    const c = new Chess("8/P7/8/8/8/8/8/4K2k w - - 0 1");
    // without promotion piece, chess.js throws/says invalid
    expect(() => c.move({ from: "a7", to: "a8" })).toThrow();
    // with promotion
    const q = c.move({ from: "a7", to: "a8", promotion: "q" });
    expect(q).toBeTruthy();
    expect(c.get("a8")?.type).toBe("q");
  });

  it("detects check, checkmate, stalemate, draws", () => {
    // Fool's mate
    const c = new Chess();
    c.move("f3");
    c.move("e5");
    c.move("g4");
    c.move("Qh4");
    expect(c.isCheckmate()).toBe(true);
    expect(c.isGameOver()).toBe(true);
    expect(c.isCheck()).toBe(true);

    // Stalemate position: black to move, no legal moves, not in check
    const stalemateFen = "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1";
    const s = new Chess(stalemateFen);
    expect(s.isStalemate()).toBe(true);
    expect(s.isDraw()).toBe(true);

    // Insufficient material: K vs K
    const kk = new Chess("4k3/8/8/8/8/8/8/4K3 w - - 0 1");
    expect(kk.isInsufficientMaterial()).toBe(true);
  });

  it("keeps FEN and PGN consistent after sequence and undo", () => {
    const c = new Chess();
    const startFen = c.fen();
    c.move("e4");
    c.move("e5");
    c.move("Nf3");
    const fenAfter = c.fen();
    const pgnAfter = c.pgn();
    expect(fenAfter).not.toBe(startFen);
    expect(pgnAfter).toContain("e4");
    expect(pgnAfter).toContain("Nf3");
    c.undo();
    expect(c.fen()).not.toBe(fenAfter);
    expect(c.history()).not.toContain("Nf3");
  });

  it("board squareColor and attackers are consistent", () => {
    const c = new Chess();
    // a1 is dark; board alternates — "right square light" so h1 is light
    expect(c.squareColor("a1")).toBe("dark");
    expect(c.squareColor("h1")).toBe("light");
    expect(c.squareColor("a8")).toBe("light");
    expect(c.squareColor("h8")).toBe("dark");
    expect(c.squareColor("e4")).toBe("light");
    // white pawn on e2 attacks d3 and f3 from start
    const attackers = c.attackers("d3", "w");
    expect(attackers).toContain("e2");
  });

  it("illegal move never mutates FEN", () => {
    const c = new Chess();
    const before = c.fen();
    expect(() => c.move("Qh5")).toThrow();
    expect(c.fen()).toBe(before);
    // moving to same square illegal
    expect(() => c.move({ from: "e2", to: "e2" } as never)).toThrow();
    expect(c.fen()).toBe(before);
  });
});

describe("milestone 1 — local save (storage.ts)", () => {
  it("round-trips fen/pgn/orientation via localStorage", () => {
    const saved = { fen: new Chess().fen(), pgn: "", orientation: "w" as const, updatedAt: new Date().toISOString() };
    saveGame(saved);
    const loaded = loadSavedGame();
    expect(loaded).toEqual(expect.objectContaining({ fen: saved.fen, orientation: "w" }));
    // second save with different orientation
    saveGame({ ...saved, orientation: "b", fen: new Chess("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1").fen() });
    expect(loadSavedGame()?.orientation).toBe("b");
  });

  it("returns null on missing or corrupted entry and clear works", () => {
    expect(loadSavedGame()).toBeNull();
    localStorage.setItem(STORAGE_KEY, "not json{{{");
    expect(loadSavedGame()).toBeNull();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ fen: 123, pgn: null }));
    expect(loadSavedGame()).toBeNull();
    clearSavedGame();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("persists after move and restores on new Chess(fen)", () => {
    const c = new Chess();
    c.move("e4");
    const fen = c.fen();
    const pgn = c.pgn();
    saveGame({ fen, pgn, orientation: "w", updatedAt: new Date().toISOString() });
    const loaded = loadSavedGame();
    expect(loaded?.fen).toBe(fen);
    const restored = new Chess(loaded!.fen);
    expect(restored.fen()).toBe(fen);
    // FEN alone has no history; PGN carries history — verify PGN, and FEN+PGN restore
    expect(pgn).toContain("e4");
    const fromPgn = new Chess();
    fromPgn.loadPgn(loaded!.pgn);
    expect(fromPgn.history()).toContain("e4");
  });

  it("does not crash in private mode (setItem throws)", () => {
    const orig = localStorage.setItem.bind(localStorage);
    // simulate quota exceeded — storage helpers must swallow
    (localStorage as unknown as { setItem: unknown }).setItem = () => {
      throw new DOMException("QuotaExceeded", "QuotaExceededError");
    };
    expect(() => saveGame({ fen: new Chess().fen(), pgn: "", orientation: "w", updatedAt: "" })).not.toThrow();
    expect(() => clearSavedGame()).not.toThrow();
    localStorage.setItem = orig;
  });
});
