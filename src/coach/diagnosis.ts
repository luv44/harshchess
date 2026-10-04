/** Diagnosis — only supported labels, never guess intent. */
import type { FactPacket } from "./factPacket";

export type DiagnosisKind =
  | "missedCheck"
  | "missedCapture"
  | "missedThreat"
  | "hanging"
  | "shallowCalc"
  | "poorTrade"
  | "kingSafety"
  | "openingGap"
  | "endgameGap"
  | "UNKNOWN";

export type Diagnosis = {
  kind: DiagnosisKind;
  confidence: number;
  reason: string;
  reasonableGroup: string[]; // ucis grouped as reasonable (when applicable)
};

export function diagnose(packet: FactPacket): Diagnosis {
  // Rule: avoid strong error labels from shallow analysis — require confidence.
  const gap = (() => {
    if (packet.candidates.length < 2) return null;
    const a = packet.candidates[0], b = packet.candidates[1];
    if (typeof a.scoreCp === "number" && typeof b.scoreCp === "number") return Math.abs(a.scoreCp - b.scoreCp);
    if (typeof a.scoreMate === "number" && typeof b.scoreMate === "number") return Math.abs(a.scoreMate - b.scoreMate) * 300;
    return null;
  })();

  // was the played move among reasonable? If grouped, not an error.
  const reasonable = (() => {
    if (packet.candidates.length < 2) return [packet.candidates[0]?.uci].filter(Boolean) as string[];
    const top = packet.candidates[0];
    if (typeof top.scoreCp === "number" && typeof packet.candidates[1].scoreCp === "number") {
      if (Math.abs(top.scoreCp - packet.candidates[1].scoreCp!) < 35 && packet.confidence < 0.6) {
        return packet.candidates.slice(0, 2).map((c) => c.uci);
      }
    }
    return [top.uci];
  })();

  const playedIsReasonable = reasonable.some(
    (uci) => uci.slice(0, 4) === packet.played.uci.slice(0, 4),
  );
  if (playedIsReasonable) {
    return { kind: "UNKNOWN", confidence: packet.confidence, reason: "Played move is within reasonable alternatives; not marking as error.", reasonableGroup: reasonable };
  }

  // Need a clear loss to label at all — require mate swing or cp drop > 120 at adequate confidence
  const playedBestGapCp = (() => {
    const best = packet.candidates.find((c) => c.uci === packet.best?.uci);
    const played = packet.candidates.find((c) => c.uci.slice(0, 4) === packet.played.uci.slice(0, 4));
    if (best && played && typeof best.scoreCp === "number" && typeof played.scoreCp === "number") {
      return best.scoreCp - played.scoreCp;
    }
    // fallback: if played not in candidates at all, estimate via best gap to second
    if (best && typeof best.scoreCp === "number" && gap != null) return gap;
    return null;
  })();

  const materialLoss = packet.motif === "capture" || packet.motif === "hanging" || packet.motif === "tactic";
  const isForcedMate = typeof packet.best?.scoreMate === "number";

  if ((gap != null && gap < 50) || packet.confidence < 0.35) {
    return { kind: "UNKNOWN", confidence: packet.confidence, reason: "Unstable evaluation; abstaining from diagnosis.", reasonableGroup: reasonable };
  }

  if (packet.motif === "check" && playedBestGapCp != null && playedBestGapCp > 80) {
    return { kind: "missedCheck", confidence: Math.min(0.85, packet.confidence + 0.1), reason: "A checking move was available and preferred by the engine.", reasonableGroup: reasonable };
  }
  if (packet.motif === "capture" && playedBestGapCp != null && playedBestGapCp > 100) {
    return { kind: "missedCapture", confidence: packet.confidence, reason: "A capture was the engine's top choice.", reasonableGroup: reasonable };
  }
  if (materialLoss && playedBestGapCp != null && playedBestGapCp > 140) {
    return { kind: "hanging", confidence: packet.confidence, reason: "Position suggests hanging/defence motif with material swing.", reasonableGroup: reasonable };
  }
  if (isForcedMate) {
    return { kind: "shallowCalc", confidence: Math.min(0.9, packet.confidence + 0.15), reason: "Forced mate line available.", reasonableGroup: reasonable };
  }
  if (packet.motif === "opening" || packet.motif === "quiet") {
    // only label quiet as trade/kingSafety if gap large
    if (playedBestGapCp != null && playedBestGapCp > 160) {
      return { kind: "poorTrade", confidence: packet.confidence * 0.9, reason: "Trade evaluation favored an alternative.", reasonableGroup: reasonable };
    }
  }

  // default: UNKNOWN — never guess intent, require evidence
  return { kind: "UNKNOWN", confidence: packet.confidence, reason: "No supported diagnosis reached the confidence threshold for this position.", reasonableGroup: reasonable };
}
