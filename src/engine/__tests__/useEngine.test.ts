import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Chess } from "chess.js";
import { useEngine } from "../useEngine";
import { FakeWorker } from "./fakeWorker";
import { ENGINE_LOAD_TIMEOUT_MS, ENGINE_SEARCH_GRACE_MS, ENGINE_STOP_TIMEOUT_MS } from "../protocol";

const START = new Chess().fen();
const board = new Chess(); board.move("e4"); const BLACK = board.fen();
beforeEach(() => { vi.useFakeTimers(); FakeWorker.instances = []; vi.stubGlobal("Worker", FakeWorker); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("coaching engine hook production guards", () => {
  it("does not download on mount; uses a base-aware classic-script URL on demand", () => {
    const { result, unmount } = renderHook(() => useEngine());
    expect(FakeWorker.instances).toHaveLength(0);
    vi.stubEnv("BASE_URL", "./"); // Vite dev/test normalizes the relative production base to '/'.
    const base = document.createElement("base"); base.href = "http://localhost/chessworkermind/"; document.head.append(base);
    act(() => { result.current.analyze(START); });
    expect(FakeWorker.instances).toHaveLength(1);
    const worker = FakeWorker.instances[0];
    expect(worker.postMessage.mock.calls[0][0]).toEqual({ type: "init", engineUrl: "http://localhost/chessworkermind/stockfish/stockfish-19-lite-single.js" });
    expect(worker.search).toMatchObject({ purpose: "analysis", depth: 12, multiPv: 3 });
    base.remove(); unmount(); expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("requires BOTH exact FEN and request ID, and drops the whole illegal PV", () => {
    const { result } = renderHook(() => useEngine());
    act(() => { result.current.analyze(START); });
    const worker = FakeWorker.instances[0];
    const emit = (line: string, fen = START, positionId = worker.search.positionId) =>
      act(() => worker.emit({ type: "info", fen, positionId, line }));
    emit("info depth 8 score cp 15 pv e2e4 e7e5", BLACK);
    emit("info depth 8 score cp 15 pv e2e4 e7e5", START, 0);
    emit("info depth 8 score cp 15 pv e2e4 e7e4");
    emit("info depth 8 score cp 15 pv e2e4q");
    expect(result.current.analysis).toBeNull();
    emit("info depth 8 score cp 15 pv e2e4 e7e5");
    expect(result.current.analysis?.candidates[0].pvSans).toEqual(["e4", "e5"]);
    act(() => worker.bestmove("e2e4", { fen: BLACK }));
    expect(result.current.playBestMove(START)).toBeNull();
    act(() => worker.bestmove("e2e4"));
    expect(result.current.playBestMove(START)).toEqual({ from: "e2", to: "e4", promotion: undefined });
    act(() => worker.bestmove("d2d4"));
    expect(result.current.analysis?.bestUci).toBe("e2e4");
    act(() => result.current.stop());
    expect(result.current.analysis).toBeNull();
    expect(result.current.playBestMove(START)).toBeNull();
    act(() => worker.bestmove("e2e4"));
    expect(result.current.analysis).toBeNull();
  });

  it("accepts bestmove without info but invalidates completed moves on reanalysis and stop", () => {
    const { result } = renderHook(() => useEngine());
    act(() => { result.current.analyze(START, { depth: 8, multiPv: 1 }); });
    const worker = FakeWorker.instances[0];
    const old = worker.search;
    act(() => worker.bestmove("g1f3"));
    expect(result.current.playBestMove(START)?.to).toBe("f3");
    act(() => { result.current.analyze(BLACK); });
    act(() => worker.bestmove("e2e4", { positionId: old.positionId, fen: old.fen }));
    expect(result.current.analysis).toBeNull();
    expect(result.current.playBestMove(START)).toBeNull();
    act(() => worker.bestmove("e7e5"));
    expect(result.current.playBestMove(BLACK)?.from).toBe("e7");
  });

  it("reports worker failure/timeout honestly and terminates the failed transport", () => {
    const { result } = renderHook(() => useEngine());
    act(() => { result.current.analyze(START); });
    act(() => vi.advanceTimersByTime(ENGINE_LOAD_TIMEOUT_MS + ENGINE_SEARCH_GRACE_MS + ENGINE_STOP_TIMEOUT_MS + 2_000));
    expect(result.current.fallbackVisible).toBe(true);
    expect(result.current.engineState.kind).toBe("error");
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
    act(() => { result.current.analyze(START); });
    expect(FakeWorker.instances).toHaveLength(2);
    act(() => FakeWorker.instances[1].onerror?.());
    expect(result.current.fallbackVisible).toBe(true);
  });

  it("does not manufacture a promotion suffix", () => {
    const { result } = renderHook(() => useEngine());
    act(() => { result.current.analyze("8/P7/8/8/8/8/8/4K2k w - - 0 1"); });
    act(() => FakeWorker.instances[0].bestmove("a7a8"));
    expect(result.current.playBestMove("8/P7/8/8/8/8/8/4K2k w - - 0 1")).toBeNull();
    expect(result.current.fallbackVisible).toBe(true);
  });
});
