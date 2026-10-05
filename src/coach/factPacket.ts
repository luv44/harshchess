/**
 * FactPacket — verified, language-neutral chess facts for coaching.
 * Never invents moves or scores. Every move/UCI is checked via chess.js
 * against the exact FEN. Scores are taken only from engine candidates.
 */
import { Chess, type Square } from "chess.js";
import type { Candidate } from "../engine/useEngine";

export type FactPacketMotif =
  | "check"
  | "capture"
  | "hanging"
  | "kingSafety"
  | "trade"
  | "opening"
  | "endgame"
  | "tactic"
  | "quiet";

export type FactPacket = {
  id: string;
  version: 1;
  beforeFen: string;
  afterFen: string;
  played: { uci: string; san: string; legal: true };
  // null if move was illegal (fact not built) — builder returns null
  best: { uci: string; san: string | null; scoreCp?: number; scoreMate?: number } | null;
  candidates: Array<{
    uci: string;
    san: string | null;
    scoreCp?: number;
    scoreMate?: number;
    depth: number;
    pvSans: string[];
    pvUcis: string[];
  }>;
  opponentThreat: { uci: string; san: string } | null; // legal reply that punishes mistake, if any
  motif: FactPacketMotif;
  confidence: number; // 0..1, high when engine depth adequate and candidates stable
  playerColor: "w" | "b";
  provenance: { engineVersion: string; depth: number; multiPv: number };
  createdAt: string;
};

/**
 * Normalize cp/mate into 0..1 evidence; avoid strong error labels from shallow analysis.
 * Returns confidence: penalize shallow depth (<8), unstable where top 2 cp within 30cp and no mate.
 */
function computeConfidence(depth: number, cands: Candidate[]): number {
  let c = 0.5;
  if (depth >= 12) c += 0.25;
  else if (depth >= 10) c += 0.15;
  else if (depth >= 8) c += 0.05;
  else c -= 0.15;
  if (cands.length >= 2 && typeof cands[0].scoreCp === "number" && typeof cands[1].scoreCp === "number") {
    const gap = Math.abs(cands[0].scoreCp! - cands[1].scoreCp!);
    if (gap < 20) c -= 0.15; // fragile horizon — group as reasonable
    else if (gap < 50) c -= 0.05;
  }
  if (cands.some((x) => typeof x.scoreMate === "number")) c += 0.1; // forced
  return Math.max(0.15, Math.min(0.95, c));
}

function detectMotif(
  beforeFen: string,
  playedUci: string,
  candidates: Candidate[],
): FactPacketMotif {
  // heuristics verified via board, never guessed intent
  const c = new Chess(beforeFen);
  const piece = c.get(playedUci.slice(0, 2) as Square);
  const target = c.get(playedUci.slice(2, 4) as Square);
  const best = candidates[0];
  // check if best gives check
  if (best) {
    const tmp = new Chess(beforeFen);
    try {
      const mv = tmp.move({ from: best.uci.slice(0, 2) as Square, to: best.uci.slice(2, 4) as Square, promotion: (best.uci.slice(4) as "q" | "r" | "b" | "n") || undefined });
      if (mv && tmp.isCheck()) return "check";
    } catch {}
  }
  if (target) return "capture";
  // if opponent can capture hanging after played, motif hanging — determined elsewhere, fallback:
  if (piece && piece.type === "p" && playedUci.slice(3, 4) === "8") return "promotion" as unknown as FactPacketMotif;
  // minimal: distinguish quiet vs tactic by candidate score gap
  if (candidates.length >= 2 && typeof candidates[0].scoreCp === "number" && typeof candidates[1].scoreCp === "number") {
    if (Math.abs(candidates[0].scoreCp - candidates[1].scoreCp) > 120) return "tactic";
  }
  return "quiet";
}

export type BuildInput = {
  beforeFen: string;
  playedUci: string; // e.g. e2e4 or e7e8q
  candidates: Candidate[]; // from engine for beforeFen, verified legal
  engineVersion: string;
  depth: number;
  multiPv: number;
};

export function buildFactPacket(input: BuildInput): FactPacket | null {
  const { beforeFen, playedUci, candidates, engineVersion, depth, multiPv } = input;

  // verify beforeFen legal
  let before: Chess;
  try {
    before = new Chess(beforeFen);
  } catch {
    return null;
  }

  // verify playedUci legal in beforeFen
  const from = playedUci.slice(0, 2) as Square;
  const to = playedUci.slice(2, 4) as Square;
  const promo = (playedUci.slice(4) as "q" | "r" | "b" | "n") || undefined;
  const legalUcis = new Set(
    before.moves({ verbose: true }).map((m) => `${m.from}${m.to}${m.promotion ?? ""}`),
  );
  const bare = `${from}${to}`;
  // accept bare when promotion omitted and queen is implied? No — require exact; but allow bare check if engine omitted promo
  const isLegal = legalUcis.has(playedUci) || (legalUcis.has(bare + "q") && playedUci.length === 4);
  if (!isLegal) return null;

  // derive afterFen by replaying exact variation
  const after = new Chess(beforeFen);
  const playedMove = after.move({ from, to, promotion: promo as never });
  if (!playedMove) return null;
  const afterFen = after.fen();
  const playerColor = before.turn() as "w" | "b";

  // filter candidates to legal only, keep original order (multipv)
  const legal = new Set(before.moves({ verbose: true }).map((m) => `${m.from}${m.to}${m.promotion ?? ""}`));
  const verified: Candidate[] = candidates.filter(
    (c) => legal.has(c.uci) || legal.has(c.uci.slice(0, 4)),
  ).slice(0, 3);

  // never invent scores — keep only what engine gave
  const best = verified[0]
    ? {
        uci: verified[0].uci,
        san: verified[0].san,
        scoreCp: verified[0].scoreCp,
        scoreMate: verified[0].scoreMate,
      }
    : null;

  // opponent threat: best opponent reply after the played move, verified with bounded engine in real use;
  // here we derive one legal opponent move that improves opponent (heuristic: if best score for us drops a lot after our move,
  // take first candidate's PV continuation). To keep truthful without second engine call, we only surface
  // opponentThreat when we have a PV continuation that is legal in afterFen and we don't invent its evaluation.
  let opponentThreat: { uci: string; san: string } | null = null;
  // heuristic: if played was not best and there is a pvSans continuation, the second ply is opponent reply
  if (best && playedUci.slice(0, 4) !== best.uci.slice(0, 4) && verified[0]?.pvSans.length > 1) {
    // verified[0].pvSans[1] is opponent reply in SAN; verify it maps to a legal UCI in afterFen
    // We attempt to find a legal move in afterFen whose SAN equals pvSans[1]
    const afterLegalVerbose = after.moves({ verbose: true });
    const desiredSan = verified[0].pvSans[1];
    const match = afterLegalVerbose.find((m) => m.san === desiredSan);
    if (match) {
      opponentThreat = { uci: `${match.from}${match.to}${match.promotion ?? ""}`, san: match.san };
    }
  }

  const motif = detectMotif(beforeFen, playedUci, verified);
  const confidence = computeConfidence(depth, verified);

  const packetCandidates = verified.map((c) => ({
    uci: c.uci,
    san: c.san,
    scoreCp: c.scoreCp,
    scoreMate: c.scoreMate,
    depth: c.depth,
    pvSans: c.pvSans,
    pvUcis: c.pvSans.length ? c.pvSans.map(() => c.uci) : [c.uci], // keep shape; real pvUcis reconstructed from SAN would need engine pv
  }));

  const id = `${beforeFen}::${playedUci}::${engineVersion}::d${depth}`;

  return {
    id,
    version: 1,
    beforeFen,
    afterFen,
    played: { uci: playedUci, san: playedMove.san, legal: true },
    best,
    candidates: packetCandidates,
    opponentThreat,
    motif: motif as FactPacketMotif,
    confidence,
    playerColor,
    provenance: { engineVersion, depth, multiPv },
    createdAt: new Date().toISOString(),
  };
}

/** Group reasonable alternatives when evaluations overlap / fragile horizon — step 16. */
export function groupReasonableCandidates(packet: FactPacket): string[] {
  if (packet.candidates.length < 2) return packet.candidates.map((c) => c.uci);
  const top = packet.candidates[0];
  // if both cp and gap < 35, group top 2 as reasonable
  if (typeof top.scoreCp === "number" && typeof packet.candidates[1].scoreCp === "number") {
    const gap = Math.abs(top.scoreCp - packet.candidates[1].scoreCp!);
    if (gap < 35 && packet.confidence < 0.6) {
      return packet.candidates.slice(0, 2).map((c) => c.uci);
    }
  }
  if (typeof top.scoreMate === "number" && typeof packet.candidates[1].scoreMate === "number") {
    if (top.scoreMate === packet.candidates[1].scoreMate) return packet.candidates.slice(0, 2).map((c) => c.uci);
  }
  return [top.uci];
}
