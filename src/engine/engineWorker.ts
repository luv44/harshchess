/** Module protocol worker -> CLASSIC Stockfish worker. The shipped Stockfish 19
 * script owns its onmessage handler and fetches its adjacent .wasm; it is not a
 * module/importScripts factory. Single-thread WASM needs no COOP/COEP headers. */
import { UciSession } from "./uciSession";
import type { WorkerRequest, WorkerResponse } from "./protocol";
export type { WorkerRequest, WorkerResponse } from "./protocol";

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: WorkerResponse) => void;
  close: () => void;
  location: Location;
};
let engine: Worker | null = null;
let session: UciSession | null = null;

scope.onmessage = ({ data }) => {
  if (data.type === "quit") {
    session?.dispose();
    engine?.terminate();
    scope.close();
    return;
  }
  if (!session && (data.type === "init" || data.type === "go")) {
    try {
      // Main thread supplies a base-aware absolute URL, including subpath deploys.
      const url = data.type === "init" && data.engineUrl
        ? data.engineUrl
        : new URL(`${import.meta.env.BASE_URL}stockfish/stockfish-19-lite-single.js`, scope.location.origin).href;
      engine = new Worker(url); // deliberately classic, NOT { type: "module" }
      const transport = engine;
      session = new UciSession({
        send: (command) => transport.postMessage(command),
        post: (message) => scope.postMessage(message),
        terminate: () => transport.terminate(),
      });
      engine.onmessage = (event: MessageEvent<unknown>) => {
        if (typeof event.data !== "string") return;
        for (const line of event.data.split(/\r?\n/)) session?.line(line);
      };
      engine.onerror = () => session?.fail("Stockfish WASM failed to load — rules-only fallback.");
      engine.onmessageerror = () => session?.fail("Stockfish sent unreadable output — rules-only fallback.");
    } catch (error) {
      scope.postMessage({ type: "error", message: `Stockfish worker unavailable: ${String(error)}` });
      return;
    }
  }
  session?.request(data);
};
