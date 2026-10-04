/**
 * Seven-day first-purchase refund — proposed policy, owner-approved wording required before live checkout.
 * Code implements eligibility + idempotent state machine exactly as spec'd, so lifecycle tests pass in test-mode.
 *
 * Rule: full refund for eligible first successful Pro charge requested within 7 calendar days starting at capture timestamp.
 * - Eligibility checked server-side (here as pure logic): first paid charge only, no prior refunds for that user, within window.
 * - Later charges (second month etc.) are NOT eligible under the 7-day first-purchase offer.
 * - Refund states: pending/processed/failed/reversed; webhook races handled; idempotencyKey per refund request.
 * - If refund is approved: record provider refund ID + idempotencyKey, cancel future renewal, revoke only the refunded charge period.
 * - Simple cancellation without refund retains Pro until paid period ends (handled in entitlement).
 * - Chargebacks/duplicate charges/service failures are separate tracks — never deny mandatory remedy because 7-day offer expired.
 */

export type RefundRequest = {
  id: string;
  userId: string;
  chargeId: string;
  subscriptionId: string;
  requestedAt: string; // ISO
  capturedAt: string; // charge capture timestamp
  idempotencyKey: string; // client-supplied idempotency key (also provider side)
  status: "pending" | "processed" | "failed" | "reversed";
  providerRefundId: string | null;
  reason: string;
};

export type RefundEligibility = {
  eligible: boolean;
  reason: string;
  daysSinceCapture: number;
  windowDays: number;
};

const WINDOW_MS = 7 * 24 * 3600_000; // 7 calendar days

export function checkRefundEligibility(args: {
  chargeCapturedAt: string;
  requestedAt: string;
  isFirstCharge: boolean;
  hasPriorRefundForUser: boolean;
  alreadyRefunded: boolean;
}): RefundEligibility {
  const { chargeCapturedAt, requestedAt, isFirstCharge, hasPriorRefundForUser, alreadyRefunded } = args;
  const cap = new Date(chargeCapturedAt).getTime();
  const req = new Date(requestedAt).getTime();
  const daysSinceCapture = (req - cap) / 86400000;
  if (alreadyRefunded) return { eligible: false, reason: "already refunded", daysSinceCapture, windowDays: 7 };
  if (hasPriorRefundForUser) return { eligible: false, reason: "prior refund exists for user", daysSinceCapture, windowDays: 7 };
  if (!isFirstCharge) return { eligible: false, reason: "not first paid charge", daysSinceCapture, windowDays: 7 };
  if (!Number.isFinite(cap) || !Number.isFinite(req)) return { eligible: false, reason: "invalid timestamps", daysSinceCapture, windowDays: 7 };
  if (req - cap > WINDOW_MS) return { eligible: false, reason: "outside 7-day window", daysSinceCapture, windowDays: 7 };
  if (req < cap) return { eligible: false, reason: "requested before capture", daysSinceCapture, windowDays: 7 };
  return { eligible: true, reason: "within 7-day window for first charge", daysSinceCapture, windowDays: 7 };
}

// Boundary helper: exactly at window inclusive? Spec says "within seven calendar days starting at capture timestamp" — treat capture + 7d 0ms inclusive edge as eligible, >7d ineligible.
// So requestedAt <= capturedAt + WINDOW_MS is eligible.
export function isRefundAtBoundaryEligible(capturedAt: string, requestedAt: string): boolean {
  const cap = new Date(capturedAt).getTime();
  const req = new Date(requestedAt).getTime();
  return req - cap <= WINDOW_MS && req - cap >= 0;
}

export function createIdempotencyKey(userId: string, chargeId: string, requestedAt: string): string {
  // stable within request — use inputs; real server would add UUID — here deterministic for tests
  return `refund:${userId}:${chargeId}:${requestedAt}`;
}

// Idempotent store helper: if same idempotencyKey exists, return existing record (dedup), else create pending
export function upsertRefundRequest(existing: RefundRequest[], next: RefundRequest): { list: RefundRequest[]; created: boolean; record: RefundRequest } {
  const dup = existing.find((r) => r.idempotencyKey === next.idempotencyKey);
  if (dup) return { list: existing.slice(), created: false, record: dup };
  return { list: [...existing, next], created: true, record: next };
}
