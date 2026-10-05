import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { pickReply } from "../opponentWorker";
import { isLegal } from "../../coach/localAnalysis";
import { shouldComputerMove, isComputerMoveStillValid, type SessionState } from "../session";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
const MATE_AVAILABLE = "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1";
const MATED = "R5k1/5ppp/8/8/8/8/5PPP/6K1 b - - 1 1";

describe("the computer's reply", () => {
  const levels = ["gentle", "steady", "sharp"] as const;

  it("is always a legal move, at every level", () => {
    for (const level of levels) {
      for (const fen of [START, AFTER_E4, MATE_AVAILABLE]) {
        for (let i = 0; i < 12; i++) {
          const reply = pickReply(fen, level);
          expect(reply, `${level} found no reply for ${fen}`).not.toBeNull();
          expect(
            isLegal(fen, reply!.uci.slice(0, 2), reply!.uci.slice(2, 4), reply!.uci.slice(4) || undefined),
            `${level} produced an illegal move ${reply!.san}`,
          ).toBe(true);
        }
      }
    }
  });

  it("never misses a forced mate, even at the gentle level", () => {
    for (const level of levels) {
      const reply = pickReply(MATE_AVAILABLE, level)!;
      const c = new Chess(MATE_AVAILABLE);
      c.move(reply.san);
      expect(c.isCheckmate(), `${level} missed mate, played ${reply.san}`).toBe(true);
    }
  });

  it("returns nothing when the game is already over", () => {
    expect(pickReply(MATED, "steady")).toBeNull();
  });

  it("repeats the same deterministic fallback for identical inputs", () => {
    for (const level of levels) {
      const first = pickReply(AFTER_E4, level);
      expect(pickReply(AFTER_E4, level)).toEqual(first);
      expect(pickReply(AFTER_E4, level)).toEqual(first);
    }
  });

  it("accepts all ten numeric profiles without pretending fallback is Stockfish", () => {
    for (let strength = 1; strength <= 10; strength++) {
      const reply = pickReply(AFTER_E4, "steady", strength)!;
      expect(new Chess(AFTER_E4).moves()).toContain(reply.san);
      expect(pickReply(AFTER_E4, "steady", strength)).toEqual(reply);
    }
  });
});

describe("a full human-vs-computer turn cycle", () => {
  const session: SessionState = { mode: "vsComputer", humanSide: "w" };

  it("gives White to the human, then exactly ONE Black reply, then stops", () => {
    const c = new Chess();
    // 1. It is White's turn — the computer must not touch it.
    expect(shouldComputerMove({ session, turn: c.turn() as "w", status: "active" })).toBe(false);

    // 2. The human plays.
    c.move("e4");
    expect(c.turn()).toBe("b");
    expect(shouldComputerMove({ session, turn: "b", status: "active" })).toBe(true);

    // 3. The computer answers once.
    const reply = pickReply(c.fen(), "steady")!;
    c.move(reply.san);
    expect(c.history()).toHaveLength(2);

    // 4. It is White's turn again — the computer must stop.
    expect(c.turn()).toBe("w");
    expect(shouldComputerMove({ session, turn: "w", status: "active" })).toBe(false);
  });

  it("drops a reply that was computed before an undo", () => {
    const c = new Chess();
    c.move("e4");
    const fenWhenAsked = c.fen();
    const generationWhenAsked = 1;
    // learner hits undo before the reply arrives
    c.undo();
    const stillValid = isComputerMoveStillValid({
      queuedGeneration: generationWhenAsked,
      currentGeneration: 2, // undo bumped the generation
      queuedFen: fenWhenAsked,
      currentFen: c.fen(),
    });
    expect(stillValid).toBe(false);
  });

  it("drops a reply that was computed for a previous game", () => {
    const old = new Chess();
    old.move("e4");
    const queuedFen = old.fen();
    const fresh = new Chess(); // New game pressed
    expect(
      isComputerMoveStillValid({
        queuedGeneration: 5,
        currentGeneration: 6,
        queuedFen,
        currentFen: fresh.fen(),
      }),
    ).toBe(false);
  });
});
