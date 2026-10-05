/**
 * Spaced revision (step 9) — interval scheduling from actual attempts.
 * No punitive streak logic. Allow breaks.
 */

export type ReviewItem = {
  id: string;
  skillId: string;
  lastUnaidedSuccessAt: string | null; // ISO
  confidence: number; // 0..1 at last success
  intervalDays: number; // current interval
  recallThreshold: number; // configurable, e.g. 0.6
  dueAt: string; // ISO, next review
};

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function daysBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 86400000;
}

/** Estimated recall decays exponentially from last success; higher confidence => slower decay. */
export function estimatedRecall(item: ReviewItem, nowIso: string): number {
  if (!item.lastUnaidedSuccessAt) return 0.9; // never succeeded unaided => not due until interval elapses (dueAt governs)
  const elapsed = Math.max(0, daysBetween(item.lastUnaidedSuccessAt, nowIso));
  // half-life scales with interval and confidence; simple model
  const halfLife = Math.max(1, item.intervalDays * (0.6 + item.confidence));
  return Math.pow(0.5, elapsed / halfLife);
}

export function isDue(item: ReviewItem, nowIso: string): boolean {
  return estimatedRecall(item, nowIso) < item.recallThreshold || new Date(nowIso) >= new Date(item.dueAt);
}

export function scheduleAfterAttempt(
  item: ReviewItem,
  attempt: { correct: boolean; hinted: boolean; at: string },
): ReviewItem {
  if (attempt.correct && !attempt.hinted) {
    // lengthen only after independent success
    const nextInterval = Math.min(60, Math.max(1, Math.round(item.intervalDays * 1.8)));
    return {
      ...item,
      lastUnaidedSuccessAt: attempt.at,
      confidence: Math.min(0.95, item.confidence + 0.08),
      intervalDays: nextInterval,
      dueAt: addDays(attempt.at, nextInterval),
    };
  }
  if (attempt.correct && attempt.hinted) {
    // hinted correct: don't lengthen
    return { ...item, dueAt: addDays(attempt.at, Math.max(1, Math.round(item.intervalDays * 0.9))) };
  }
  // failure: shorten interval, lower confidence
  return {
    ...item,
    confidence: Math.max(0.2, item.confidence - 0.12),
    intervalDays: Math.max(1, Math.round(item.intervalDays * 0.5)),
    dueAt: addDays(attempt.at, Math.max(1, Math.round(item.intervalDays * 0.5))),
  };
}

export function createReviewItem(skillId: string, nowIso: string, intervalDays = 2): ReviewItem {
  return {
    id: `${skillId}::${nowIso}`,
    skillId,
    lastUnaidedSuccessAt: null,
    confidence: 0.5,
    intervalDays,
    recallThreshold: 0.6,
    dueAt: addDays(nowIso, intervalDays),
  };
}
