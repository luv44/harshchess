import { Chess } from "chess.js";
import { legalPvSans, legalUci } from "./legal";
import { parseInfoLine } from "./parse";
import { strengthProfile } from "./strength";
import { ENGINE_LOAD_TIMEOUT_MS, ENGINE_SEARCH_GRACE_MS, ENGINE_STOP_TIMEOUT_MS, type SearchRequest, type WorkerRequest, type WorkerResponse } from "./protocol";

export type UciTransport = {
  send: (command: string) => void;
  post: (message: WorkerResponse) => void;
  terminate: () => void;
};

type Search = SearchRequest & { depth: number; multiPv: number; nodes: number; moveTimeMs: number };
const bounded = (n: number | undefined, fallback: number, min: number, max: number) =>
  Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n!))) : fallback;

/** UCI has no request IDs. Keep the old owner until bestmove, then an isready
 * barrier. Never issue position/go (or settings) while an old search can speak. */
export class UciSession {
  private phase: "new" | "loading" | "barrier" | "idle" | "searching" | "stopping" | "dead" = "new";
  private initialized = false;
  private active: Search | null = null;
  private pending: Search | null = null;
  private options = new Set<string>();
  private deferredOptions = new Map<string, string>();
  private deadline: ReturnType<typeof setTimeout> | undefined;

  constructor(private transport: UciTransport) {}

  private arm(ms: number, message: string) {
    clearTimeout(this.deadline);
    this.deadline = setTimeout(() => this.fail(message), ms);
  }

  fail(message: string) {
    if (this.phase === "dead") return;
    this.dispose();
    this.transport.post({ type: "error", message });
  }

  dispose() {
    clearTimeout(this.deadline);
    this.phase = "dead";
    this.active = this.pending = null;
    this.transport.terminate();
  }

  private send(command: string) {
    if (this.phase === "dead") return;
    try { this.transport.send(command); }
    catch (error) { this.fail(`Stockfish transport failed: ${String(error)}`); }
  }

  private option(name: string, value: string | number | boolean) {
    if (this.options.has(name)) this.send(`setoption name ${name} value ${value}`);
  }

  request(message: WorkerRequest) {
    if (this.phase === "dead") return;
    switch (message.type) {
      case "init":
        if (this.phase !== "new") return;
        this.phase = "loading";
        this.arm(ENGINE_LOAD_TIMEOUT_MS, "Stockfish initialization timed out — rules-only fallback.");
        this.send("uci");
        return;
      case "go": {
        try { new Chess(message.fen); }
        catch { this.fail("Invalid FEN refused by Stockfish adapter."); return; }
        if (!Number.isSafeInteger(message.positionId)) { this.fail("Invalid search request ID."); return; }
        const profile = message.purpose === "opponent" ? strengthProfile(message.strength) : null;
        this.pending = {
          ...message,
          depth: profile?.depth ?? bounded(message.depth, 12, 1, 18),
          multiPv: profile ? 1 : bounded(message.multiPv, 3, 1, 3),
          nodes: profile?.nodes ?? bounded(message.nodes, 300_000, 1, 500_000),
          moveTimeMs: profile?.moveTimeMs ?? bounded(message.moveTimeMs, 1_500, 20, 3_000),
        };
        if (this.phase === "new") this.request({ type: "init" });
        if (this.phase === "searching") this.drain();
        else if (this.phase === "idle") this.barrier();
        return;
      }
      case "stop":
      case "position":
        // Legacy position messages invalidate only; go always supplies its own FEN.
        this.pending = null;
        if (this.phase === "searching") this.drain();
        return;
      case "setOption":
        // Legacy API: whitelist simple known settings; apply only between searches.
        if (["Hash", "MultiPV", "Skill Level", "UCI_LimitStrength", "UCI_ShowWDL"].includes(message.name) &&
            /^(?:true|false|\d{1,3})$/.test(message.value)) {
          this.deferredOptions.set(message.name, message.value);
          if (this.phase === "idle") this.barrier();
        }
        return;
      case "quit": this.dispose(); return;
    }
  }

  private drain() {
    this.phase = "stopping"; // invalidate output immediately; do NOT change active's ID/FEN
    this.arm(ENGINE_STOP_TIMEOUT_MS, "Stockfish did not finish its cancelled search.");
    this.send("stop");
  }

  private barrier() {
    this.phase = "barrier";
    this.arm(ENGINE_LOAD_TIMEOUT_MS, "Stockfish readiness timed out.");
    this.send("isready");
  }

  line(raw: string) {
    if (this.phase === "dead") return;
    const line = raw.trim();
    const option = /^option name (.+?) type /.exec(line);
    if (option) { this.options.add(option[1]); return; }
    if (line === "uciok" && this.phase === "loading") {
      this.option("Threads", 1);
      this.option("Hash", 16);
      this.option("Ponder", false);
      this.option("UCI_ShowWDL", false);
      this.barrier();
      return;
    }
    if (line === "readyok" && this.phase === "barrier") {
      clearTimeout(this.deadline);
      this.phase = "idle";
      if (!this.initialized) {
        this.initialized = true;
        this.transport.post({ type: "ready" });
      }
      for (const [name, value] of this.deferredOptions) this.option(name, value);
      this.deferredOptions.clear();
      if (this.pending) this.start();
      return;
    }
    if (!this.active) return;
    if (line.startsWith("info ") && this.phase === "searching") {
      const parsed = parseInfoLine(line);
      if (!parsed || !legalPvSans(this.active.fen, parsed.pv)) return;
      this.transport.post({ type: "info", positionId: this.active.positionId, fen: this.active.fen, line });
    }
    if (/^bestmove\s/.test(line) && (this.phase === "searching" || this.phase === "stopping")) {
      clearTimeout(this.deadline);
      const active = this.active;
      const publish = this.phase === "searching";
      this.active = null;
      this.phase = "idle";
      if (publish) {
        const [, move, , ponder] = line.split(/\s+/);
        this.transport.post({ type: "bestmove", positionId: active.positionId, fen: active.fen,
          uci: legalUci(active.fen, move) ? move : null, ponder: ponder ?? null, raw: line });
      }
      // Drain all old output before accepting another owner, including duplicate bestmove.
      this.barrier();
    }
  }

  private start() {
    const search = this.pending!;
    this.pending = null;
    const opponent = search.purpose === "opponent";
    // Reset every time: opponent weakening cannot contaminate coach analysis.
    this.option("UCI_LimitStrength", false);
    this.option("Skill Level", opponent ? strengthProfile(search.strength).skill : 20);
    this.option("MultiPV", search.multiPv);
    this.option("Hash", 16);
    if (opponent) this.send("ucinewgame"); // no hash carry-over between profile comparisons
    this.send(`position fen ${search.fen}`);
    if (this.phase === "dead") return;
    this.active = search;
    this.phase = "searching";
    this.arm(search.moveTimeMs + ENGINE_SEARCH_GRACE_MS, "Stockfish search timed out — rules-only fallback.");
    this.send(`go depth ${search.depth} nodes ${search.nodes} movetime ${search.moveTimeMs}`);
  }
}
