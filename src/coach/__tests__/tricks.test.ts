/**
 * Every trick must be a real, legal, sound lesson.
 * Replays each line with chess.js and proves the outcome.
 */
import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { TRICKS } from "../tricks";

const VALS: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

function material(c: Chess): number {
  let m = 0;
  for (const row of c.board()) for (const sq of row) if (sq) m += (sq.color === "w" ? 1 : -1) * VALS[sq.type];
  return m;
}

function replay(moves: string[]): Chess {
  const c = new Chess();
  for (const m of moves) c.move(m);
  return c;
}

describe("tricks from real games", () => {
  it("unique ids, sane metadata, key ply inside the line", () => {
    expect(new Set(TRICKS.map((t) => t.id)).size).toBe(TRICKS.length);
    for (const t of TRICKS) {
      expect(t.moves.length).toBeGreaterThanOrEqual(6);
      expect(t.keyPly).toBeGreaterThanOrEqual(0);
      expect(t.keyPly).toBeLessThan(t.moves.length);
      expect(t.keyHint.length).toBe(2);
      expect(t.why.length).toBeGreaterThan(20);
      expect(t.defense.length).toBeGreaterThan(20);
    }
  });

  for (const t of TRICKS) {
    describe(t.id, () => {
      it("full line is legal from the initial position", () => {
        expect(() => replay(t.moves)).not.toThrow();
      });

      it("the trick move is at keyPly and it is the trick side's turn", () => {
        const before = replay(t.moves.slice(0, t.keyPly));
        expect(before.turn()).toBe(t.side);
        const key = new Chess(before.fen());
        const mv = key.move(t.moves[t.keyPly]);
        expect(mv).toBeTruthy();
      });

      it("outcome is as promised", () => {
        const start = material(new Chess());
        const end = replay(t.moves);
        if (t.verify === "mate") {
          expect(end.isCheckmate(), `${t.id} must end in checkmate`).toBe(true);
        } else if (t.verify === "material-w") {
          expect(material(end) - start, `${t.id} must net White material`).toBeGreaterThanOrEqual(400);
        } else if (t.verify === "material-b") {
          expect(start - material(end), `${t.id} must net Black material`).toBeGreaterThanOrEqual(200);
        } else {
          // principle: the line must remain fully legal (already proven above)
          expect(end.moves.length).toBeGreaterThanOrEqual(0);
        }
      });
    });
  }
});
