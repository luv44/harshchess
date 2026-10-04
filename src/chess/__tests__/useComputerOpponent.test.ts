import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Chess } from "chess.js";
import { useComputerOpponent } from "../useComputerOpponent";
import { FakeWorker } from "../../engine/__tests__/fakeWorker";
import { legalUci } from "../../engine/legal";
import { pickReply } from "../opponentWorker";
import { ENGINE_LOAD_TIMEOUT_MS, ENGINE_SEARCH_GRACE_MS, ENGINE_STOP_TIMEOUT_MS } from "../../engine/protocol";

const START = new Chess().fen();
const board = new Chess(); board.move("e4"); const BLACK = board.fen();
type Args = Parameters<typeof useComputerOpponent>[0];
const props = (extra: Partial<Args> = {}): Args => ({
  fen: BLACK, turn: "b", generation: 1, session: { mode: "vsComputer", humanSide: "w" },
  statusKind: "active", paused: false, strength: 5, delayMs: 50, applyMove: vi.fn(() => true), ...extra,
});
beforeEach(() => { vi.useFakeTimers(); FakeWorker.instances = []; vi.stubGlobal("Worker", FakeWorker); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("computer opponent hook", () => {
  it("stays lazy on the human's White turn, then plays at most one Black reply", () => {
    const chess = new Chess();
    const applyMove = vi.fn((from, to, promotion) => { chess.move({ from, to, promotion }); return true; });
    const { result, rerender } = renderHook((p: Args) => useComputerOpponent(p), {
      initialProps: props({ fen: START, turn: "w", applyMove }),
    });
    expect(FakeWorker.instances).toHaveLength(0);
    chess.move("e4"); rerender(props({ applyMove }));
    const worker = FakeWorker.instances[0];
    expect(worker.search).toMatchObject({ fen: BLACK, purpose: "opponent", strength: 5 });
    act(() => { worker.bestmove("e7e5"); worker.bestmove("c7c5"); vi.advanceTimersByTime(50); });
    expect(applyMove).toHaveBeenCalledOnce();
    expect(chess.turn()).toBe("w");
    expect(chess.history()).toEqual(["e4", "e5"]);
    expect(result.current.source).toBe("stockfish");
    rerender(props({ fen: chess.fen(), turn: "w", generation: 2, applyMove }));
    act(() => vi.advanceTimersByTime(20_000));
    expect(applyMove).toHaveBeenCalledOnce();
    expect(result.current.thinking).toBe(false);
  });

  it.each([
    ["undo/reset", { fen: START, turn: "w", generation: 2 }],
    ["new generation, same FEN", { generation: 2 }],
    ["strength", { strength: 10 }],
    ["mode", { session: { mode: "solo", humanSide: "w" } }],
    ["human side", { session: { mode: "vsComputer", humanSide: "b" } }],
    ["paused", { paused: true }],
    ["game over", { statusKind: "draw" }],
  ] as Array<[string, Partial<Args>]>) ("invalidates a scheduled reply after %s changes", (_, changed) => {
    const original = props();
    const { rerender } = renderHook((p: Args) => useComputerOpponent(p), { initialProps: original });
    const worker = FakeWorker.instances[0];
    act(() => worker.bestmove("e7e5"));
    rerender({ ...original, ...changed });
    act(() => vi.advanceTimersByTime(100));
    expect(original.applyMove).not.toHaveBeenCalled();
  });

  it("rejects stale request IDs and wrong FEN, even when their move is legal", () => {
    const original = props();
    const { result, rerender } = renderHook((p: Args) => useComputerOpponent(p), { initialProps: original });
    const worker = FakeWorker.instances[0]; const oldRequest = worker.search;
    rerender({ ...original, strength: 8 });
    act(() => worker.bestmove("e7e5", { positionId: oldRequest.positionId }));
    act(() => worker.bestmove("e7e5", { fen: START }));
    act(() => vi.advanceTimersByTime(50));
    expect(original.applyMove).not.toHaveBeenCalled();
    act(() => { worker.bestmove("c7c5"); vi.advanceTimersByTime(50); });
    expect(original.applyMove).toHaveBeenCalledOnce();
    expect(result.current.strength).toBe(8);
    expect(result.current.source).toBe("stockfish");
  });

  it("cancelPending and unmount invalidate answers and remove handlers/timers", () => {
    const original = props();
    const { result, unmount } = renderHook(() => useComputerOpponent(original));
    const worker = FakeWorker.instances[0]; const oldHandler = worker.onmessage!; const search = worker.search;
    act(() => result.current.cancelPending());
    act(() => oldHandler({ data: { type: "bestmove", positionId: search.positionId, fen: BLACK, uci: "e7e5", raw: "" } } as never));
    act(() => vi.advanceTimersByTime(30_000));
    expect(original.applyMove).not.toHaveBeenCalled();
    expect(worker.onmessage).toBeNull();
    expect(result.current.thinking).toBe(false);
    unmount(); expect(worker.terminate).toHaveBeenCalled();
  });

  it.each(["error", "timeout", "illegal", "missing worker"])("uses one deterministic legal, honestly labelled fallback on %s", (failure) => {
    if (failure === "missing worker") vi.stubGlobal("Worker", undefined);
    const original = props();
    const { result } = renderHook(() => useComputerOpponent(original));
    const worker = FakeWorker.instances[0];
    act(() => {
      if (failure === "error") worker.onerror?.();
      if (failure === "illegal") worker.bestmove("e2e4");
      if (failure === "timeout") vi.advanceTimersByTime(ENGINE_LOAD_TIMEOUT_MS + ENGINE_SEARCH_GRACE_MS + ENGINE_STOP_TIMEOUT_MS + 500);
      vi.advanceTimersByTime(50);
    });
    expect(original.applyMove).toHaveBeenCalledOnce();
    const expected = pickReply(BLACK, "steady", 5)!.uci;
    const [from, to, promo] = vi.mocked(original.applyMove).mock.calls[0];
    const uci = `${from}${to}${promo ?? ""}`;
    expect(uci).toBe(expected);
    expect(legalUci(BLACK, uci)).toBe(true);
    expect(result.current.source).toBe("rules-only");
    expect(result.current.fallbackVisible).toBe(true);
    expect(result.current.message).toBeTruthy();
  });

  it("does not borrow untagged coach moves and preserves legacy level mapping", () => {
    const original = props({ strength: undefined, level: "sharp", engineBestUci: "e7e5" });
    const { result } = renderHook(() => useComputerOpponent(original));
    expect(FakeWorker.instances[0].search).toMatchObject({ strength: 9, purpose: "opponent" });
    act(() => vi.advanceTimersByTime(100));
    expect(original.applyMove).not.toHaveBeenCalled();
    expect(result.current.source).toBeNull();
  });
});
