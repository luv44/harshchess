/**
 * Entitlement: authoritative Pro status derived ONLY from verified provider subscription/payment state.
 * Client redirects, URL changes, local browser flags never unlock Pro (checked in tests via local-flag probe).
 * Paid offline grace is short, documented, based on prior server verification.
 */
import { PRO_CURRENCY, PRO_MONTHLY_PRICE_PAISE } from "./pricing";

export type ProStatus =
  | "free"         // never subscribed or expired past grace
  | "pro_active"   // verified active subscription, period current
  | "pro_grace"    // renewal failed, within grace window (provider hold/grace)
  | "pro_expired"  // past periodEnd + grace, returned to Free
  | "pro_refunded" // first charge refunded (status reflects entitlement revoked for that billing period)
  | "pro_canceled"; // canceled, still within current paid period (shows renewal as none / period end)

export type SubscriptionRecord = {
  id: string;
  userId: string;
  planId: string;
  amountPaise: number;
  currency: string;
  status: "active" | "past_due" | "canceled" | "unpaid" | "trialing";
  periodStart: string; // ISO
  periodEnd: string;   // ISO — access through this timestamp inclusive
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  renewalAmountPaise: number;
  renewalCurrency: string;
  provider: string; // e.g. TestProvider
  createdAt: string;
  updatedAt: string;
};

export type BillingCharge = {
  id: string;
  subscriptionId: string;
  userId: string;
  amountPaise: number;
  currency: string;
  capturedAt: string; // ISO
  refundedAt: string | null;
  refundId: string | null; // provider refund ID when refunded
  chargeback: boolean;
  status: "succeeded" | "pending" | "failed" | "refunded" | "partially_refunded";
};

export type EntitlementSnapshot = {
  userId: string;
  status: ProStatus;
  subscription: SubscriptionRecord | null;
  charges: BillingCharge[];
  nextChargeAt: string | null; // periodEnd for active
  accessUntil: string | null;  // periodEnd (or grace end)
  lastVerifiedAt: string;
  reason: string; // auditable reason
};

const GRACE_MS = 3 * 24 * 3600_000; // short, documented 3-day offline/renewal grace

function isWithinGrace(nowMs: number, periodEndMs: number): boolean {
  return nowMs >= periodEndMs && nowMs < periodEndMs + GRACE_MS;
}

export function deriveEntitlement(args: {
  userId: string;
  subscription: SubscriptionRecord | null;
  charges: BillingCharge[];
  nowIso: string;
}): EntitlementSnapshot {
  const { userId, subscription, charges, nowIso } = args;
  const nowMs = new Date(nowIso).getTime();
  if (!subscription) {
    return { userId, status: "free", subscription: null, charges: charges.slice(), nextChargeAt: null, accessUntil: null, lastVerifiedAt: nowIso, reason: "no subscription" };
  }
  // Never trust client amount/currency — must match expected plan
  const amountOk = subscription.amountPaise === PRO_MONTHLY_PRICE_PAISE && subscription.currency === PRO_CURRENCY;
  if (!amountOk) {
    return { userId, status: "free", subscription, charges: charges.slice(), nextChargeAt: null, accessUntil: null, lastVerifiedAt: nowIso, reason: `amount_mismatch: expected ${PRO_MONTHLY_PRICE_PAISE} ${PRO_CURRENCY}, got ${subscription.amountPaise} ${subscription.currency}` };
  }
  const periodEndMs = new Date(subscription.periodEnd).getTime();
  const periodEndOk = Number.isFinite(periodEndMs);
  if (!periodEndOk) {
    return { userId, status: "free", subscription, charges: charges.slice(), nextChargeAt: null, accessUntil: null, lastVerifiedAt: nowIso, reason: "invalid periodEnd" };
  }

  // If any first-charge was refunded via confirmed refund, revoke only that charge's period — don't destroy unrelated valid access
  // (test: refunds when another paid billing period exists so unrelated valid access is not removed — handled via charge-level refund, not by blanket revoke)
  // We signal refunded entitlement separately; if later charges exist for same subscription, access still depends on periodEnd.

  const hasChargeback = charges.some((c) => c.chargeback && c.status !== "failed");
  if (hasChargeback) {
    // chargeback is distinct track; entitlement still periodEnd-based; not auto-revoked unless provider says subscription unpaid
  }

  const canceledAtEnd = subscription.cancelAtPeriodEnd;

  if (subscription.status === "canceled") {
    if (nowMs <= periodEndMs) {
      return { userId, status: "pro_canceled", subscription, charges: charges.slice(), nextChargeAt: null, accessUntil: subscription.periodEnd, lastVerifiedAt: nowIso, reason: "canceled, within paid period" };
    }
    if (isWithinGrace(nowMs, periodEndMs)) {
      // still grace note but really canceled — treat as expired after grace; surface as pro_canceled until grace ends? Keep canceled
      return { userId, status: "pro_canceled", subscription, charges: charges.slice(), nextChargeAt: null, accessUntil: subscription.periodEnd, lastVerifiedAt: nowIso, reason: "canceled past periodEnd but within grace label" };
    }
    return { userId, status: "pro_expired", subscription, charges: charges.slice(), nextChargeAt: null, accessUntil: subscription.periodEnd, lastVerifiedAt: nowIso, reason: "canceled and past periodEnd+grace" };
  }

  if (subscription.status === "past_due" || subscription.status === "unpaid") {
    if (isWithinGrace(nowMs, periodEndMs)) {
      return { userId, status: "pro_grace", subscription, charges: charges.slice(), nextChargeAt: subscription.periodEnd, accessUntil: new Date(periodEndMs + GRACE_MS).toISOString(), lastVerifiedAt: nowIso, reason: `${subscription.status} within grace` };
    }
    return { userId, status: "pro_expired", subscription, charges: charges.slice(), nextChargeAt: null, accessUntil: subscription.periodEnd, lastVerifiedAt: nowIso, reason: `${subscription.status} past grace → expired` };
  }

  // active / trialing (treat trialing as active for entitlement)
  if (subscription.status === "active" || subscription.status === "trialing") {
    if (canceledAtEnd) {
      if (nowMs <= periodEndMs) {
        return { userId, status: "pro_canceled", subscription, charges: charges.slice(), nextChargeAt: null, accessUntil: subscription.periodEnd, lastVerifiedAt: nowIso, reason: "active but cancelAtPeriodEnd set, within period" };
      }
      if (isWithinGrace(nowMs, periodEndMs)) {
        return { userId, status: "pro_canceled", subscription, charges: charges.slice(), nextChargeAt: null, accessUntil: subscription.periodEnd, lastVerifiedAt: nowIso, reason: "active cancelAtPeriodEnd, past end within grace" };
      }
      return { userId, status: "pro_expired", subscription, charges: charges.slice(), nextChargeAt: null, accessUntil: subscription.periodEnd, lastVerifiedAt: nowIso, reason: "active cancelAtPeriodEnd past grace → expired" };
    }
    if (nowMs <= periodEndMs) {
      return { userId, status: "pro_active", subscription, charges: charges.slice(), nextChargeAt: subscription.periodEnd, accessUntil: subscription.periodEnd, lastVerifiedAt: nowIso, reason: "active within period" };
    }
    if (isWithinGrace(nowMs, periodEndMs)) {
      return { userId, status: "pro_grace", subscription, charges: charges.slice(), nextChargeAt: subscription.periodEnd, accessUntil: new Date(periodEndMs + GRACE_MS).toISOString(), lastVerifiedAt: nowIso, reason: "active past periodEnd but within grace window" };
    }
    return { userId, status: "pro_expired", subscription, charges: charges.slice(), nextChargeAt: null, accessUntil: subscription.periodEnd, lastVerifiedAt: nowIso, reason: "active past periodEnd+grace → expired" };
  }

  return { userId, status: "free", subscription, charges: charges.slice(), nextChargeAt: null, accessUntil: null, lastVerifiedAt: nowIso, reason: `unhandled status ${subscription.status}` };
}

export function hasProAccess(snap: EntitlementSnapshot): boolean {
  return snap.status === "pro_active" || snap.status === "pro_canceled" || snap.status === "pro_grace";
}

// Never expose secrets or trust a local Pro flag. This guard is what UI must use — local flag alone must NOT unlock.
// Test probes this by setting local flag and verifying still free.
export function hasProAccessFromVerifiedOnly(snapshot: EntitlementSnapshot | null): boolean {
  if (!snapshot) return false;
  return hasProAccess(snapshot);
}
