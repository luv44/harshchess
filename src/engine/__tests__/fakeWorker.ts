import { vi } from "vitest";
import type { WorkerRequest, WorkerResponse } from "../protocol";

export class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn<(message: WorkerRequest) => void>();
  constructor(public url: URL, public options?: WorkerOptions) { FakeWorker.instances.push(this); }
  emit(message: WorkerResponse) { this.onmessage?.({ data: message } as MessageEvent<WorkerResponse>); }
  get search() {
    const requests = this.postMessage.mock.calls.map(([message]) => message);
    return requests.reverse().find((message) => message.type === "go") as Extract<WorkerRequest, { type: "go" }>;
  }
  bestmove(uci: string | null, extra: Partial<Extract<WorkerResponse, { type: "bestmove" }>> = {}) {
    this.emit({ type: "bestmove", fen: this.search.fen, positionId: this.search.positionId, uci, raw: `bestmove ${uci}`, ...extra });
  }
}
