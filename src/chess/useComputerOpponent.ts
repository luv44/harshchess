/** One bounded, independent Stockfish search per computer turn. Coach analysis
 * is never borrowed: it has different settings and no opponent request token. */
import { useCallback, useEffect, useRef, useState } from "react";
import { type Square } from "chess.js";
import { shouldComputerMove, type Color, type SessionState } from "./session";
import { pickReply, type OpponentLevel } from "./opponentWorker";
import { createEngineWorker } from "../engine/createEngineWorker";
import { legalUci } from "../engine/legal";
import { legacyStrength, normalizeStrength, strengthProfile } from "../engine/strength";
import { ENGINE_LOAD_TIMEOUT_MS, ENGINE_SEARCH_GRACE_MS, ENGINE_STOP_TIMEOUT_MS, type WorkerRequest, type WorkerResponse } from "../engine/protocol";

export type { OpponentLevel };
export { STRENGTH_PROFILES } from "../engine/strength";
export const OPPONENT_LEVELS: Array<{ id: OpponentLevel; labelKey: string }> = [
  { id: "gentle", labelKey: "gentle" },
  { id: "steady", labelKey: "steady" },
  { id: "sharp", labelKey: "sharp" },
];
export type OpponentSource = "stockfish" | "rules-only" | null;
export type OpponentStatus = "idle" | "loading" | "thinking" | "ready" | "fallback";

export function useComputerOpponent(args: {
  fen: string;
  turn: Color;
  session: SessionState;
  generation: number;
  statusKind: "active" | "checkmate" | "stalemate" | "draw" | "other";
  paused: boolean;
  level?: OpponentLevel;
  /** Numeric profile takes precedence over legacy gentle/steady/sharp. */
  strength?: number;
  applyMove: (from: Square, to: Square, promotion?: "q" | "r" | "b" | "n") => boolean;
  /** Legacy compatibility only; intentionally ignored (not a tagged opponent search). */
  engineBestUci?: string | null;
  delayMs?: number;
}) {
  const { fen, turn, session, generation, statusKind, paused, level = "steady", delayMs = 450 } = args;
  const strength = normalizeStrength(args.strength ?? legacyStrength(level));
  const profile = strengthProfile(strength);
  const workerRef = useRef<Worker | null>(null);
  const readyRef = useRef(false);
  const requestIdRef = useRef(0);
  const cleanupRef = useRef<(() => void) | null>(null);
  const committedRef = useRef<string | null>(null);
  const latest = useRef({ ...args, strength });
  latest.current = { ...args, strength };
  const [thinking, setThinking] = useState(false);
  const [source, setSource] = useState<OpponentSource>(null);
  const [status, setStatus] = useState<OpponentStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const cancelPending = useCallback(() => {
    ++requestIdRef.current;
    cleanupRef.current?.();
    cleanupRef.current = null;
    setThinking(false);
    setStatus("idle");
  }, []);

  useEffect(() => () => {
    ++requestIdRef.current;
    cleanupRef.current?.();
    workerRef.current?.terminate();
    workerRef.current = null;
    readyRef.current = false;
  }, []);

  useEffect(() => {
    const turnKey = `${generation}|${fen}|${session.mode}|${session.humanSide}`;
    if (!shouldComputerMove({ session, turn, status: statusKind, paused }) || committedRef.current === turnKey) {
      setThinking(false);
      setStatus("idle");
      return;
    }
    const requestId = ++requestIdRef.current;
    let cancelled = false;
    let settled = false;
    let delay: ReturnType<typeof setTimeout> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let worker: Worker | null = null;

    // Check render-time values too, not only effect cleanup (which is asynchronous).
    const valid = () => {
      const cur = latest.current;
      return !cancelled && requestIdRef.current === requestId && cur.generation === generation &&
        cur.fen === fen && cur.turn === turn && cur.strength === strength && cur.paused === paused &&
        cur.session.mode === session.mode && cur.session.humanSide === session.humanSide &&
        cur.statusKind === statusKind &&
        shouldComputerMove({ session: cur.session, turn: cur.turn, status: cur.statusKind, paused: cur.paused });
    };

    const detach = () => {
      if (!worker) return;
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
    };

    const schedule = (uci: string | null, used: OpponentSource, reason: string | null) => {
      if (settled || !valid()) return;
      settled = true; // duplicates/errors cannot schedule a second reply
      clearTimeout(timeout);
      detach();
      setSource(used);
      setMessage(reason);
      setStatus(used === "stockfish" ? "ready" : "fallback");
      if (!uci || !legalUci(fen, uci)) { setThinking(false); return; }
      delay = setTimeout(() => {
        if (!valid() || committedRef.current === turnKey || !legalUci(latest.current.fen, uci)) return;
        committedRef.current = turnKey; // consume BEFORE applyMove triggers a render
        setThinking(false);
        latest.current.applyMove(uci.slice(0, 2) as Square, uci.slice(2, 4) as Square,
          (uci.slice(4) || undefined) as "q" | "r" | "b" | "n" | undefined);
      }, Math.max(0, Number.isFinite(delayMs) ? delayMs : 450));
    };

    const fallback = (reason: string) => {
      if (settled || !valid()) return;
      detach();
      workerRef.current?.terminate();
      workerRef.current = null;
      readyRef.current = false;
      let uci: string | null = null;
      try { uci = pickReply(fen, level, strength)?.uci ?? null; } catch { /* invalid/terminal FEN */ }
      schedule(uci, "rules-only", reason);
    };

    const cleanup = () => {
      cancelled = true;
      ++requestIdRef.current;
      clearTimeout(timeout);
      clearTimeout(delay);
      detach();
      try { workerRef.current?.postMessage({ type: "stop" } satisfies WorkerRequest); }
      catch { workerRef.current?.terminate(); workerRef.current = null; readyRef.current = false; }
    };
    cleanupRef.current = cleanup;
    setThinking(true);
    setSource(null);
    setMessage(null);

    try {
      worker = workerRef.current ?? createEngineWorker();
      workerRef.current = worker;
      setStatus(readyRef.current ? "thinking" : "loading");
      const budget = profile.moveTimeMs + ENGINE_SEARCH_GRACE_MS + ENGINE_STOP_TIMEOUT_MS;
      timeout = setTimeout(() => fallback("Stockfish timed out — deterministic rules-only reply."),
        budget + (readyRef.current ? 0 : ENGINE_LOAD_TIMEOUT_MS));
      worker.onmessage = ({ data: msg }: MessageEvent<WorkerResponse>) => {
        if (!valid() || settled) return;
        if (msg.type === "error") { fallback(msg.message); return; }
        if (msg.type === "ready") {
          readyRef.current = true;
          setStatus("thinking");
          clearTimeout(timeout);
          timeout = setTimeout(() => fallback("Stockfish search timed out — deterministic rules-only reply."), budget);
          return;
        }
        if (msg.type !== "bestmove" || msg.positionId !== requestId || msg.fen !== fen) return;
        if (!legalUci(fen, msg.uci)) { fallback("Stockfish returned no legal reply — rules-only fallback."); return; }
        schedule(msg.uci, "stockfish", null);
      };
      worker.onerror = () => fallback("Stockfish worker failed — deterministic rules-only reply.");
      worker.onmessageerror = () => fallback("Unreadable Stockfish output — deterministic rules-only reply.");
      worker.postMessage({ type: "go", fen, positionId: requestId, purpose: "opponent", strength } satisfies WorkerRequest);
    } catch {
      fallback("Stockfish unavailable — deterministic rules-only reply.");
    }
    return cleanup;
  }, [fen, turn, generation, statusKind, paused, strength, level, delayMs, session.mode, session.humanSide, profile]);

  return { thinking, cancelPending, source, status, message, strength, profile, fallbackVisible: source === "rules-only" };
}
