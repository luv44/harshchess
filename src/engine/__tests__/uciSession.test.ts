import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Chess } from "chess.js";
import { UciSession } from "../uciSession";
import { STRENGTH_PROFILES, strengthProfile } from "../strength";
import { ENGINE_LOAD_TIMEOUT_MS, ENGINE_STOP_TIMEOUT_MS, type WorkerResponse } from "../protocol";
import { legalPvSans, legalUci } from "../legal";

const START = new Chess().fen();
const board = new Chess(); board.move("e4");
const BLACK = board.fen();
const options = ["Threads", "Hash", "Ponder", "UCI_ShowWDL", "UCI_LimitStrength", "Skill Level", "MultiPV"];
function harness() {
  const commands: string[] = [];
  const messages: WorkerResponse[] = [];
  const terminate = vi.fn();
  const session = new UciSession({ send: (c) => commands.push(c), post: (m) => messages.push(m), terminate });
  const init = () => {
    session.request({ type: "init" });
    options.forEach((name) => session.line(`option name ${name} type spin`));
    session.line("uciok");
    session.line("readyok");
  };
  const go = (positionId: number, fen = START) => session.request({ type: "go", positionId, fen });
  return { session, commands, messages, terminate, init, go };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe("real UCI state machine", () => {
  it("initializes once and defers queued searches until readyok", () => {
    const h = harness();
    h.go(1);
    h.go(2, BLACK);
    expect(h.commands).toEqual(["uci"]);
    h.session.line("uciok");
    expect(h.commands).toEqual(["uci", "isready"]);
    h.session.line("readyok");
    expect(h.commands.filter((c) => c.startsWith("position"))).toEqual([`position fen ${BLACK}`]);
    h.session.request({ type: "init" });
    expect(h.commands.filter((c) => c === "uci")).toHaveLength(1);
  });

  it("drains A bestmove then waits for readyok before B, never retagging delayed A output", () => {
    const h = harness(); h.init(); h.go(1); h.session.line("readyok");
    h.session.line("info depth 6 score cp 10 pv e2e4 e7e5");
    h.go(2, BLACK);
    h.session.line("info depth 7 score cp 20 pv d2d4 d7d5");
    expect(h.commands.slice(-1)[0]).toBe("stop");
    expect(h.commands.filter((c) => c.startsWith("go "))).toHaveLength(1);
    h.session.line("bestmove e2e4");
    expect(h.commands.slice(-1)[0]).toBe("isready");
    h.session.line("info depth 8 score cp 30 pv g1f3");
    h.session.line("bestmove d2d4");
    expect(h.messages.filter((m) => m.type === "bestmove")).toHaveLength(0);
    h.session.line("readyok");
    h.session.line("info depth 6 score cp 2 pv e7e5 g1f3");
    h.session.line("bestmove e7e5");
    expect(h.messages.filter((m) => m.type === "info")).toEqual([
      { type: "info", positionId: 1, fen: START, line: "info depth 6 score cp 10 pv e2e4 e7e5" },
      { type: "info", positionId: 2, fen: BLACK, line: "info depth 6 score cp 2 pv e7e5 g1f3" },
    ]);
    expect(h.messages.filter((m) => m.type === "bestmove")).toEqual([
      { type: "bestmove", positionId: 2, fen: BLACK, uci: "e7e5", ponder: null, raw: "bestmove e7e5" },
    ]);
  });

  it("coalesces rapid replacements and stop invalidates both active and pre-ready work", () => {
    const h = harness(); h.init(); h.go(1); h.session.line("readyok");
    h.go(2); h.go(3, BLACK);
    expect(h.commands.filter((c) => c === "stop")).toHaveLength(1);
    h.session.line("bestmove e2e4"); h.session.line("readyok");
    h.session.request({ type: "stop" });
    h.session.line("bestmove e7e5"); h.session.line("readyok");
    expect(h.messages.some((m) => m.type === "bestmove")).toBe(false);
    expect(h.commands.filter((c) => c.startsWith("go "))).toHaveLength(2);
    const queued = harness(); queued.go(1); queued.session.request({ type: "stop" });
    queued.session.line("uciok"); queued.session.line("readyok");
    expect(queued.commands.some((c) => c.startsWith("go "))).toBe(false);
  });

  it("times out failed initialization, cancelled searches and hung active searches", () => {
    const loading = harness(); loading.go(1);
    vi.advanceTimersByTime(ENGINE_LOAD_TIMEOUT_MS);
    expect(loading.terminate).toHaveBeenCalledOnce();
    expect(loading.messages.slice(-1)[0]?.type).toBe("error");
    const stopping = harness(); stopping.init(); stopping.go(1); stopping.session.line("readyok"); stopping.go(2);
    vi.advanceTimersByTime(ENGINE_STOP_TIMEOUT_MS);
    expect(stopping.terminate).toHaveBeenCalledOnce();
    expect(stopping.commands.filter((c) => c.startsWith("go "))).toHaveLength(1);
    const active = harness(); active.init(); active.go(1); active.session.line("readyok");
    vi.advanceTimersByTime(3_500);
    expect(active.terminate).toHaveBeenCalledOnce();
    active.session.line("bestmove e2e4");
    expect(active.messages.some((m) => m.type === "bestmove")).toBe(false);
  });

  it("rejects illegal complete PVs and exact promotion mistakes", () => {
    const h = harness(); h.init(); h.go(1); h.session.line("readyok");
    h.session.line("info depth 6 score cp 10 pv e2e4 e7e9");
    h.session.line("info depth 6 score cp 10 pv e2e4q");
    h.session.line("bestmove e2e4q");
    expect(h.messages.filter((m) => m.type === "info")).toHaveLength(0);
    expect(h.messages.find((m) => m.type === "bestmove")).toMatchObject({ uci: null });
    const promo = "8/P7/8/8/8/8/8/4K2k w - - 0 1";
    expect(legalUci(promo, "a7a8")).toBe(false);
    expect(legalUci(promo, "a7a8q")).toBe(true);
    expect(legalPvSans(START, ["e2e4", "e2e3"])).toBeNull();
  });

  it("applies ten bounded distinct profiles and resets weakening for coaching", () => {
    expect(STRENGTH_PROFILES).toHaveLength(10);
    expect(new Set(STRENGTH_PROFILES.map((p) => p.skill)).size).toBe(10);
    for (const profile of STRENGTH_PROFILES) {
      const h = harness(); h.init();
      h.session.request({ type: "go", positionId: 1, fen: BLACK, purpose: "opponent", strength: profile.strength });
      h.session.line("readyok");
      expect(h.commands).toContain(`setoption name Skill Level value ${profile.skill}`);
      expect(h.commands).toContain("setoption name UCI_LimitStrength value false");
      expect(h.commands.slice(-1)[0]).toBe(`go depth ${profile.depth} nodes ${profile.nodes} movetime ${profile.moveTimeMs}`);
      h.session.line("bestmove e7e5");
      h.go(2); h.session.line("readyok");
      expect(h.commands.slice(-6)).toContain("setoption name Skill Level value 20");
      expect(h.commands.slice(-6)).toContain("setoption name MultiPV value 3");
      h.session.dispose();
    }
    expect(strengthProfile(NaN).strength).toBe(5);
    expect(strengthProfile(-8).strength).toBe(1);
    expect(strengthProfile(80).strength).toBe(10);
  });

  it("holds legacy options until idle and rejects command injection/invalid FEN", () => {
    const h = harness(); h.init(); h.go(1); h.session.line("readyok");
    const before = h.commands.length;
    h.session.request({ type: "setOption", name: "Hash", value: "32" });
    h.session.request({ type: "setOption", name: "Hash", value: "16\ngo infinite" });
    expect(h.commands).toHaveLength(before);
    h.session.line("bestmove e2e4"); h.session.line("readyok");
    expect(h.commands).toContain("setoption name Hash value 32");
    h.go(2, "not a fen");
    expect(h.messages.slice(-1)[0]?.type).toBe("error");
  });
});
