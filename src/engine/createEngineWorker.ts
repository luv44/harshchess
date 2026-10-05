import type { WorkerRequest } from "./protocol";

/** Called only when an analysis or computer turn actually needs the engine. */
export function createEngineWorker(): Worker {
  const engineUrl = new URL(`${import.meta.env.BASE_URL}stockfish/stockfish-19-lite-single.js`, document.baseURI).href;
  const worker = new Worker(new URL("./engineWorker.ts", import.meta.url), { type: "module" });
  try {
    worker.postMessage({ type: "init", engineUrl } satisfies WorkerRequest);
    return worker;
  } catch (error) {
    worker.terminate();
    throw error;
  }
}
