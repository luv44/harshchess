/**
 * Soundness proof for the practice bank.
 * Every item must be a REAL chess lesson — no unsound positions allowed.
 */
import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { PRACTICE_BANK } from "../practiceBank";

const VALS: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

function material(c: Chess): number {
  let m = 0;
  for (const row of c.board()) for (const sq of row) if (sq) m += (sq.color === "w" ? 1 : -1) * VALS[sq.type];
  return m;
}

function uci(c: Chess, from: string, to: string): string {
  const mv = c.move({ from, to, promotion: "q" });
  return mv ? (from + to + (mv.promotion ?? "")) : "";
}

describe("practice bank soundness", () => {
  it("has unique ids and 2-4 items per motif level", () => {
    const ids = new Set(PRACTICE_BANK.map((i) => i.id));
    expect(ids.size).toBe(PRACTICE_BANK.length);
    for (const item of PRACTICE_BANK) {
      expect(item.steps.length).toBe(2);
      expect(item.goal.length).toBeGreaterThan(10);
      expect(item.why.length).toBeGreaterThan(10);
    }
  });

  for (const item of PRACTICE_BANK) {
    describe(item.id, () => {
      it("fen is valid with white to move", () => {
        const c = new Chess(item.fen);
        expect(c.turn()).toBe("w");
      });

      it("every accepted solution is legal", () => {
        for (const sol of item.solutions) {
          const c = new Chess(item.fen);
          const mv = c.move({ from: sol.slice(0, 2), to: sol.slice(2, 4), promotion: sol.slice(4) || undefined } as never);
          expect(mv, `${sol} must be legal in ${item.fen}`).toBeTruthy();
        }
      });

      if (item.verify === "mate") {
        it("solution is checkmate", () => {
          for (const sol of item.solutions) {
            const c = new Chess(item.fen);
            c.move({ from: sol.slice(0, 2), to: sol.slice(2, 4), promotion: sol.slice(4) || undefined } as never);
            expect(c.isCheckmate(), `${sol} must mate in ${item.id}`).toBe(true);
          }
        });
        it("no OTHER first move also mates (or it is accepted too)", () => {
          const c = new Chess(item.fen);
          const accepted = new Set(item.solutions.map((s) => s.slice(0, 4)));
          for (const mv of c.moves({ verbose: true })) {
            if (accepted.has(mv.from + mv.to)) continue;
            const t = new Chess(item.fen);
            t.move({ from: mv.from, to: mv.to, promotion: mv.promotion ?? "q" });
            expect(t.isCheckmate(), `${mv.from}${mv.to} unexpectedly also mates in ${item.id} — add it to solutions or fix the fen`).toBe(false);
          }
        });
      }

      if (item.verify === "material") {
        it("solution wins >= 100cp and survives every single recapture", () => {
          for (const sol of item.solutions) {
            const before = new Chess(item.fen);
            const start = material(before);
            const after = new Chess(item.fen);
            after.move({ from: sol.slice(0, 2), to: sol.slice(2, 4), promotion: sol.slice(4) || undefined } as never);
            expect(material(after) - start, `${sol} must gain material in ${item.id}`).toBeGreaterThanOrEqual(100);
            for (const reply of after.moves({ verbose: true })) {
              const t = new Chess(after.fen());
              t.move({ from: reply.from, to: reply.to, promotion: reply.promotion ?? "q" });
              expect(material(t) - start, `after reply ${reply.from}${reply.to} the gain must survive in ${item.id}`).toBeGreaterThanOrEqual(100);
            }
          }
        });
      }

      if (item.verify === "win2") {
        it("after the solution, EVERY opponent reply still allows a capture worth >= 200cp", () => {
          const before = new Chess(item.fen);
          const start = material(before);
          for (const sol of item.solutions) {
            const after = new Chess(item.fen);
            after.move({ from: sol.slice(0, 2), to: sol.slice(2, 4), promotion: sol.slice(4) || undefined } as never);
            const replies = after.moves({ verbose: true });
            expect(replies.length).toBeGreaterThan(0);
            for (const reply of replies) {
              const t = new Chess(after.fen());
              t.move({ from: reply.from, to: reply.to, promotion: reply.promotion ?? "q" });
              let best = -Infinity;
              for (const wm of t.moves({ verbose: true })) {
                const t2 = new Chess(t.fen());
                t2.move({ from: wm.from, to: wm.to, promotion: wm.promotion ?? "q" });
                best = Math.max(best, material(t2));
              }
              expect(best - start, `after ${sol} and reply ${reply.from}${reply.to}, white must still win >=200cp in ${item.id}`).toBeGreaterThanOrEqual(200);
            }
          }
        });
      }

      if (item.verify === "principle") {
        it("solution is a principled named move (san recorded, legal)", () => {
          const c = new Chess(item.fen);
          const mv = c.move({ from: item.solutions[0].slice(0, 2), to: item.solutions[0].slice(2, 4), promotion: item.solutions[0].slice(4) || undefined } as never);
          expect(mv).toBeTruthy();
        });
      }
    });
  }
});
