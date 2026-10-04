export type SearchRequest = {
  type: "go";
  fen: string;
  positionId: number;
  depth?: number;
  multiPv?: number;
  nodes?: number;
  moveTimeMs?: number;
  purpose?: "analysis" | "opponent";
  strength?: number;
};

export type WorkerRequest =
  | { type: "init"; engineUrl?: string }
  | { type: "setOption"; name: string; value: string }
  | { type: "position"; fen: string; positionId: number }
  | SearchRequest
  | { type: "stop" }
  | { type: "quit" };

export type WorkerResponse =
  | { type: "ready" }
  | { type: "info"; positionId: number; fen: string; line: string }
  | { type: "bestmove"; positionId: number; fen: string; uci: string | null; ponder?: string | null; raw: string }
  | { type: "error"; message: string };

export const ENGINE_VERSION = "stockfish-19-lite-single";
// First module + WASM download can exceed ten seconds on slow storage/network.
// This is a loading watchdog, not the (much smaller) per-move search budget.
export const ENGINE_LOAD_TIMEOUT_MS = 30_000;
export const ENGINE_SEARCH_GRACE_MS = 2_000;
export const ENGINE_STOP_TIMEOUT_MS = 1_500;
