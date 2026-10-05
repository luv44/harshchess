import { useCallback, useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import { parseInfoLine } from "./parse";
import { legalPvSans, legalUci } from "./legal";
import { createEngineWorker } from "./createEngineWorker";
import { ENGINE_LOAD_TIMEOUT_MS, ENGINE_SEARCH_GRACE_MS, ENGINE_VERSION, type WorkerRequest, type WorkerResponse } from "./protocol";

export type EngineState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "analyzing"; positionId: number; fen: string }
  | { kind: "error"; message: string };

export type Candidate = {
  multipv: number;
  uci: string;
  san: string | null;
  scoreCp?: number;
  scoreMate?: number;
  depth: number;
  pvSans: string[]; // entire PV replayed legally, never a repaired/truncated line
  raw: string;
};

export type Analysis = {
  positionId: number;
  fen: string;
  depth: number;
  candidates: Candidate[];
  bestUci: string | null;
  engineVersion: string;
};

type Context = { positionId: number; fen: string; complete: boolean; candidates: Map<number, Candidate> };

/** Coaching analysis is intentionally independent of the opponent's strength. */
export function useEngine() {
  const workerRef = useRef<Worker | null>(null);
  const positionIdRef = useRef(0);
  const contextRef = useRef<Context | null>(null);
  const currentAnalysisRef = useRef<Analysis | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [engineState, setEngineState] = useState<EngineState>({ kind: "idle" });
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [fallbackVisible, setFallbackVisible] = useState(false);
  const [computerOn, setComputerOn] = useState(false);
  const [computerLevel] = useState<"easy" | "medium" | "strong">("medium");

  const fail = useCallback((message: string) => {
    clearTimeout(timeoutRef.current);
    contextRef.current = null;
    currentAnalysisRef.current = null;
    workerRef.current?.terminate();
    workerRef.current = null;
    setAnalysis(null);
    setEngineState({ kind: "error", message });
    setFallbackVisible(true);
  }, []);

  const initWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;
    try {
      const worker = createEngineWorker();
      workerRef.current = worker;
      setEngineState({ kind: "loading" });
      worker.onmessage = ({ data: msg }: MessageEvent<WorkerResponse>) => {
        if (workerRef.current !== worker) return;
        if (msg.type === "error") { fail(msg.message); return; }
        if (msg.type === "ready") {
          if (!contextRef.current) setEngineState({ kind: "ready" });
          return;
        }
        const ctx = contextRef.current;
        if (!ctx || ctx.complete || msg.positionId !== ctx.positionId || msg.fen !== ctx.fen) return;
        if (msg.type === "info") {
          const parsed = parseInfoLine(msg.line);
          if (!parsed || parsed.multipv < 1 || parsed.multipv > 3) return;
          const pvSans = legalPvSans(ctx.fen, parsed.pv);
          if (!pvSans) return;
          const previous = ctx.candidates.get(parsed.multipv);
          if (previous && previous.depth > parsed.depth) return;
          ctx.candidates.set(parsed.multipv, {
            multipv: parsed.multipv, uci: parsed.pv[0], san: pvSans[0], pvSans,
            depth: parsed.depth, scoreCp: parsed.scoreCp, scoreMate: parsed.scoreMate, raw: parsed.raw,
          });
        } else {
          if (msg.uci && !legalUci(ctx.fen, msg.uci)) { fail("Stockfish returned an illegal move — rules-only fallback."); return; }
          ctx.complete = true;
          clearTimeout(timeoutRef.current);
          setEngineState({ kind: "ready" });
        }
        const candidates = [...ctx.candidates.values()].sort((a, b) => a.multipv - b.multipv);
        const next: Analysis = {
          positionId: ctx.positionId, fen: ctx.fen, depth: Math.max(0, ...candidates.map((c) => c.depth)),
          candidates, bestUci: msg.type === "bestmove" ? msg.uci : null, engineVersion: ENGINE_VERSION,
        };
        currentAnalysisRef.current = next;
        setAnalysis(next);
      };
      worker.onerror = () => { if (workerRef.current === worker) fail("Stockfish worker failed — rules-only fallback."); };
      worker.onmessageerror = () => { if (workerRef.current === worker) fail("Unreadable Stockfish output — rules-only fallback."); };
      return worker;
    } catch (error) {
      fail(`Stockfish unavailable — rules-only fallback. ${String(error)}`);
      return null;
    }
  }, [fail]);

  // No worker/download just because a screen mounts (including StrictMode).
  useEffect(() => () => {
    clearTimeout(timeoutRef.current);
    positionIdRef.current += 1;
    contextRef.current = null;
    currentAnalysisRef.current = null;
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  const analyze = useCallback((fen: string, opts?: { depth?: number; multiPv?: number }) => {
    const positionId = ++positionIdRef.current;
    clearTimeout(timeoutRef.current);
    contextRef.current = null;
    currentAnalysisRef.current = null;
    setAnalysis(null);
    try {
      workerRef.current?.postMessage({ type: "stop" } satisfies WorkerRequest);
      new Chess(fen);
    } catch { fail("Invalid position or unavailable worker — rules-only fallback."); return positionId; }
    const worker = initWorker();
    if (!worker) return positionId;
    contextRef.current = { positionId, fen, complete: false, candidates: new Map() };
    setEngineState({ kind: "analyzing", positionId, fen });
    setFallbackVisible(false);
    timeoutRef.current = setTimeout(() => fail("Stockfish analysis timed out — rules-only fallback."),
      ENGINE_LOAD_TIMEOUT_MS + 3_000 + ENGINE_SEARCH_GRACE_MS);
    try {
      worker.postMessage({ type: "go", fen, positionId, depth: opts?.depth ?? 12, multiPv: opts?.multiPv ?? 3,
        purpose: "analysis" } satisfies WorkerRequest);
    } catch { fail("Stockfish search could not start — rules-only fallback."); }
    return positionId;
  }, [fail, initWorker]);

  const stop = useCallback(() => {
    ++positionIdRef.current;
    clearTimeout(timeoutRef.current);
    contextRef.current = null;
    currentAnalysisRef.current = null;
    setAnalysis(null);
    setEngineState({ kind: workerRef.current ? "ready" : "idle" });
    try { workerRef.current?.postMessage({ type: "stop" } satisfies WorkerRequest); }
    catch { fail("Stockfish could not stop — rules-only fallback."); }
  }, [fail]);

  const playBestMove = useCallback((fen: string): { from: string; to: string; promotion?: string } | null => {
    const ctx = contextRef.current;
    const cur = currentAnalysisRef.current;
    if (!ctx?.complete || !cur || cur.positionId !== positionIdRef.current || cur.fen !== fen || ctx.fen !== fen || !legalUci(fen, cur.bestUci)) return null;
    const uci = cur.bestUci!;
    return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4) || undefined };
  }, []);

  return { engineState, analysis, fallbackVisible, computerOn, setComputerOn, computerLevel,
    analyze, stop, playBestMove, currentPositionId: positionIdRef.current, engineVersion: ENGINE_VERSION };
}
