import { useCallback, useEffect, useMemo, useState } from "react";
import { createUser, createSession, isSessionValid, isValidEmail, normalizeEmail, type Session, type User } from "./account";
import { loadSessionJson, saveSessionJson, clearSession, syncToAccount, loadAccountPayload, exportAccountData, deleteAccountData, saveLanguageTag, loadLanguageTag } from "./accountStorage";
import { createBillingStore, createCheckout, processProviderEvent, signTestEvent, type BillingStore, type ProviderEvent } from "./provider";
import { PRO_CURRENCY, PRO_MONTHLY_PRICE_PAISE, PRO_PLAN_ID, priceSummary } from "./pricing";
import { deriveEntitlement, hasProAccess, type EntitlementSnapshot } from "./entitlement";
import { checkRefundEligibility, createIdempotencyKey } from "./refund";

// Single in-memory test-mode billing store (would be server DB in production)
const billingStore: BillingStore = createBillingStore();

export function getBillingStore(): BillingStore {
  return billingStore;
}

export function useAccount() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [entitlement, setEntitlement] = useState<EntitlementSnapshot | null>(null);
  const [syncInfo, setSyncInfo] = useState<string | null>(null);

  const refreshEntitlement = useCallback((u: User | null, nowIso: string) => {
    if (!u) { setEntitlement(null); return; }
    const sub = [...billingStore.subscriptions.values()].find((s) => s.userId === u.id) ?? null;
    const charges = [...billingStore.charges.values()].filter((c) => c.userId === u.id);
    const snap = deriveEntitlement({ userId: u.id, subscription: sub, charges, nowIso });
    setEntitlement(snap);
  }, []);

  // Restore session on mount
  useEffect(() => {
    try {
      const raw = loadSessionJson();
      if (raw) {
        const sess = JSON.parse(raw) as Session;
        const nowIso = new Date().toISOString();
        if (isSessionValid(sess, nowIso)) {
          // rehydrate user
          const u: User = { id: sess.userId, email: sess.email, createdAt: sess.issuedAt, linkedAt: sess.issuedAt };
          setUser(u);
          setSession(sess);
          refreshEntitlement(u, nowIso);
        } else {
          clearSession();
        }
      }
    } catch {}
  }, [refreshEntitlement]);

  const login = useCallback((emailInput: string) => {
    if (!isValidEmail(emailInput)) { setNotice("Enter a valid email."); return false; }
    const email = normalizeEmail(emailInput);
    const nowIso = new Date().toISOString();
    const u = createUser(email, nowIso);
    if (!u) { setNotice("Invalid email."); return false; }
    const sess = createSession(u, nowIso);
    setUser({ ...u, linkedAt: nowIso });
    setSession(sess);
    saveSessionJson(JSON.stringify(sess));
    try { saveLanguageTag(loadLanguageTag() ?? "en"); } catch {}
    // Merge guest progress into account (idempotent)
    const merged = syncToAccount(u.id, nowIso);
    setSyncInfo(`Synced ${merged.games.length} game(s) to account. Idempotent merge — nothing deleted.`);
    refreshEntitlement({ ...u, linkedAt: nowIso }, nowIso);
    setNotice(`Signed in as ${email}. Progress synced.`);
    setTimeout(() => setNotice(null), 2200);
    return true;
  }, [refreshEntitlement]);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
    setSession(null);
    setEntitlement(null);
    setNotice("Signed out. Local guest progress kept. Sign in on another device to sync.");
    setTimeout(() => setNotice(null), 2200);
  }, []);

  const syncNow = useCallback(() => {
    if (!user) { setNotice("Sign in first to sync."); return; }
    const nowIso = new Date().toISOString();
    const merged = syncToAccount(user.id, nowIso);
    refreshEntitlement(user, nowIso);
    setSyncInfo(`Sync complete: ${merged.games.length} game(s). Language: ${merged.languageTag ?? "—"}. Updated ${new Date(merged.updatedAt).toLocaleString()}.`);
  }, [user, refreshEntitlement]);

  const reconnect = useCallback(() => {
    if (!user) { setNotice("Sign in first."); return; }
    const nowIso = new Date().toISOString();
    // reconciliation: re-derive entitlement from authoritative store
    refreshEntitlement(user, nowIso);
    syncNow();
    setNotice("Reconnected — subscription status re-verified with provider (authoritative check).");
    setTimeout(() => setNotice(null), 2200);
  }, [user, refreshEntitlement, syncNow]);

  const checkoutTestMode = useCallback(() => {
    if (!user || !session) { setNotice("Login/link account before checkout."); return; }
    const nowIso = new Date().toISOString();
    const res = createCheckout(billingStore, { userId: user.id, email: user.email, planId: PRO_PLAN_ID, amountPaise: PRO_MONTHLY_PRICE_PAISE, currency: PRO_CURRENCY, nowIso });
    if (!res.ok) { setNotice(res.error); return; }
    refreshEntitlement(user, nowIso);
    setNotice("Test-mode subscription created — no live charge. Pro active in test mode.");
  }, [user, session, refreshEntitlement]);

  const cancelAtPeriodEnd = useCallback(() => {
    if (!user) return;
    const sub = [...billingStore.subscriptions.values()].find((s) => s.userId === user.id);
    if (!sub) { setNotice("No subscription to cancel."); return; }
    const nowIso = new Date().toISOString();
    // Simulate provider event subscription.updated cancelAtPeriodEnd=true
    const evt: ProviderEvent = {
      id: `evt_cancel_${Date.now()}`,
      type: "subscription.updated",
      created: nowIso,
      subscriptionId: sub.id,
      userId: user.id,
      payload: { status: sub.status, periodEnd: sub.periodEnd, cancelAtPeriodEnd: true, canceledAt: null },
    };
    const bodyForSig = JSON.stringify({ id: evt.id, type: evt.type, created: evt.created, subscriptionId: evt.subscriptionId, userId: evt.userId, payload: evt.payload });
    processProviderEvent(billingStore, { ...evt, signature: signTestEvent(bodyForSig) }, { nowIso, verifySignature: true });
    refreshEntitlement(user, nowIso);
    setNotice("Subscription will cancel at period end. Pro remains until expiry; then Free (history kept).");
  }, [user, refreshEntitlement]);

  const requestRefund = useCallback(() => {
    if (!user) { setNotice("Sign in first."); return; }
    const charges = [...billingStore.charges.values()].filter((c) => c.userId === user.id).sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());
    if (charges.length === 0) { setNotice("No charges to refund."); return; }
    const first = charges[0];
    const nowIso = new Date().toISOString();
    const eligible = checkRefundEligibility({
      chargeCapturedAt: first.capturedAt,
      requestedAt: nowIso,
      isFirstCharge: true,
      hasPriorRefundForUser: billingStore.refunds.some((r) => r.userId === user.id),
      alreadyRefunded: !!first.refundedAt,
    });
    if (!eligible.eligible) { setNotice(`Refund not eligible: ${eligible.reason}.`); return; }
    const idem = createIdempotencyKey(user.id, first.id, nowIso);
    const providerRefundId = `re_${first.id}_${Date.now().toString(36)}`;
    const evt: ProviderEvent = {
      id: `evt_refund_${Date.now()}`,
      type: "charge.refunded",
      created: nowIso,
      subscriptionId: first.subscriptionId,
      userId: user.id,
      payload: { chargeId: first.id, providerRefundId, idempotencyKey: idem },
    };
    const bodyForSig = JSON.stringify({ id: evt.id, type: evt.type, created: evt.created, subscriptionId: evt.subscriptionId, userId: evt.userId, payload: evt.payload });
    processProviderEvent(billingStore, { ...evt, signature: signTestEvent(bodyForSig) }, { nowIso, verifySignature: true });
    // Also cancel renewal per spec when refund approved
    const sub = billingStore.subscriptions.get(first.subscriptionId);
    if (sub) {
      const cancelEvt: ProviderEvent = {
        id: `evt_cancel_after_refund_${Date.now()}`,
        type: "subscription.updated",
        created: nowIso,
        subscriptionId: sub.id,
        userId: user.id,
        payload: { status: sub.status, periodEnd: sub.periodEnd, cancelAtPeriodEnd: true, canceledAt: null },
      };
      const body2 = JSON.stringify({ id: cancelEvt.id, type: cancelEvt.type, created: cancelEvt.created, subscriptionId: cancelEvt.subscriptionId, userId: cancelEvt.userId, payload: cancelEvt.payload });
      processProviderEvent(billingStore, { ...cancelEvt, signature: signTestEvent(body2) }, { nowIso, verifySignature: true });
    }
    refreshEntitlement(user, nowIso);
    setNotice("Refund requested — test-mode full refund for first charge within 7 days. Renewal canceled; charge marked refunded.");
  }, [user, refreshEntitlement]);

  const hasPro = useMemo(() => entitlement ? hasProAccess(entitlement) : false, [entitlement]);

  const exportData = useCallback(() => {
    if (!user) return null;
    return exportAccountData(user.id);
  }, [user]);

  const deleteData = useCallback(() => {
    if (!user) return;
    deleteAccountData(user.id);
    setNotice("Account synced data deleted. Local boards kept. Use export before deleting.");
  }, [user]);

  return {
    user, session, entitlement, hasPro, notice, syncInfo,
    billingStore, priceSummary,
    login, logout, syncNow, reconnect, checkoutTestMode, cancelAtPeriodEnd, requestRefund, exportData, deleteData, refreshEntitlement,
  };
}
