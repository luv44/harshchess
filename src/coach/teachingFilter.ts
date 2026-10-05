/**
 * TeachingOpportunityFilter (step 13) + abstention guards (steps 14,16).
 * Decides whether to coach or give concise move feedback.
 */
import type { FactPacket } from "./factPacket";
import type { Diagnosis } from "./diagnosis";

export type FilterDecision = {
  shouldCoach: boolean;
  reason: string;
  rankWeightHint?: number; // nudges ranking when worthwhile
};

const RECENT_LESSONS_MAX = 8;

export function teachingOpportunityFilter(
  packet: FactPacket,
  diagnosis: Diagnosis,
  ctx: {
    hasTrustedTranslation: boolean;
    recentMotifs: string[]; // last N motifs
    recentPackets: string[]; // last N packet ids
    timeBudgetMs?: number;
    deviceClass?: "phone" | "desktop";
  },
): FilterDecision {
  // 1) clear, engine-verified learning point?
  if (packet.confidence < 0.35) {
    return { shouldCoach: false, reason: "Low confidence — show concise move feedback." };
  }
  if (diagnosis.kind === "UNKNOWN") {
    return { shouldCoach: false, reason: "No supported diagnosis — concise feedback." };
  }
  if (!packet.best || packet.candidates.length === 0) {
    return { shouldCoach: false, reason: "No verified candidate to teach." };
  }
  // 2) trustworthy explanation for chosen language?
  if (!ctx.hasTrustedTranslation) {
    return { shouldCoach: false, reason: "Low translation confidence — concise feedback in fallback." };
  }
  // 3) differs from recent lessons? diversity guard
  const sameMotifRecently = ctx.recentMotifs.slice(-3).filter((m) => m === packet.motif).length >= 2;
  if (sameMotifRecently) {
    return { shouldCoach: false, reason: "Same motif repeated — concise feedback to avoid nagging." };
  }
  const duplicatePacket = ctx.recentPackets.includes(packet.id);
  if (duplicatePacket) {
    return { shouldCoach: false, reason: "Duplicate position lesson recently shown." };
  }
  // 4) distinguish forced tactic vs stylistic preference — require gap or mate
  const gap = (() => {
    if (packet.candidates.length < 2) return null;
    const a = packet.candidates[0], b = packet.candidates[1];
    if (typeof a.scoreCp === "number" && typeof b.scoreCp === "number") return Math.abs(a.scoreCp - b.scoreCp);
    return null;
  })();
  if (gap != null && gap < 60 && diagnosis.confidence < 0.6) {
    return { shouldCoach: false, reason: "Stylistic preference — not a forced tactic." };
  }
  // 5) time/device budget
  if (ctx.timeBudgetMs != null && ctx.timeBudgetMs < 800) {
    return { shouldCoach: false, reason: "Time budget too tight — concise feedback." };
  }

  return { shouldCoach: true, reason: "Verified learning point with trusted translation and diversity.", rankWeightHint: 0.08 };
}

export function conciseMoveFeedback(packet: FactPacket): string {
  // language-neutral; renderer translates surrounding wrapper but move stays canonical
  return `${packet.played.san} played.`;
}
