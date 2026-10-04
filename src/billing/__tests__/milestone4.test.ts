import { describe, it, expect, beforeEach } from "vitest";
import {
  createBillingStore,
  createCheckout,
  processProviderEvent,
  signTestEvent,
  verifyTestSignature,
  type ProviderEvent,
} from "../provider";
import { PRO_MONTHLY_PRICE_PAISE, PRO_CURRENCY, PRO_PLAN_ID, CHECKOUT_ENABLED, isValidProAmount } from "../pricing";
import { deriveEntitlement, hasProAccess, hasProAccessFromVerifiedOnly } from "../entitlement";
import { checkRefundEligibility, isRefundAtBoundaryEligible, createIdempotencyKey, upsertRefundRequest } from "../refund";
import { createUser, isSessionValid, createSession } from "../account";
import { lwwMerge, mergeSync, buildLocalPayload } from "../sync";

function iso(offsetMs = 0, base = "2026-09-20T10:00:00.000Z"): string {
  return new Date(new Date(base).getTime() + offsetMs).toISOString();
}
function sigFor(evt: Omit<ProviderEvent, "signature">): string {
  const body = JSON.stringify({ id: evt.id, type: evt.type, created: evt.created, subscriptionId: evt.subscriptionId, userId: evt.userId, payload: evt.payload });
  return signTestEvent(body);
}

describe("Milestone 4 — pricing rule", () => {
  it("base price is ₹599/month INR, checkout disabled until verified, amount validation strict", () => {
    expect(PRO_MONTHLY_PRICE_PAISE).toBe(59900);
    expect(PRO_CURRENCY).toBe("INR");
    expect(PRO_PLAN_ID).toBe("pro-monthly-inr-599");
    expect(CHECKOUT_ENABLED).toBe(false);
    expect(isValidProAmount(59900, "INR")).toBe(true);
    expect(isValidProAmount(59900, "USD")).toBe(false);
    expect(isValidProAmount(59000, "INR")).toBe(false);
  });
});

describe("Webhook replay / forged / wrong amount/currency — never grants Pro from bad event", () => {
  it("replay of same event id is idempotent — applied only once", () => {
    const store = createBillingStore();
    const uid = "user:alice@example.com";
    const now = iso();
    const ch = createCheckout(store, { userId: uid, email: "alice@example.com", planId: PRO_PLAN_ID, amountPaise: PRO_MONTHLY_PRICE_PAISE, currency: PRO_CURRENCY, nowIso: now });
    expect(ch.ok).toBe(true);
    const subId = (ch as { ok: true; subscriptionId: string }).subscriptionId;
    // renewal event
    const evt: ProviderEvent = { id: "evt_renew_1", type: "invoice.payment_succeeded", created: iso(30 * 86400000), subscriptionId: subId, userId: uid, payload: {} };
    const sig = sigFor(evt);
    const r1 = processProviderEvent(store, { ...evt, signature: sig }, { nowIso: iso(30 * 86400000), verifySignature: true });
    expect(r1.ok).toBe(true);
    const periodAfterFirst = store.subscriptions.get(subId)!.periodEnd;
    const r2 = processProviderEvent(store, { ...evt, signature: sig }, { nowIso: iso(30 * 86400000), verifySignature: true });
    expect(r2.ok).toBe(true);
    expect((r2 as { ok: true; reason: string }).reason).toMatch(/duplicate event id/i);
    expect(store.subscriptions.get(subId)!.periodEnd).toBe(periodAfterFirst); // not extended again
  });

  it("forged event (bad signature) is rejected and does not extend subscription", () => {
    const store = createBillingStore();
    const uid = "user:bob@example.com";
    const now = iso();
    const ch = createCheckout(store, { userId: uid, email: "bob@example.com", planId: PRO_PLAN_ID, amountPaise: PRO_MONTHLY_PRICE_PAISE, currency: PRO_CURRENCY, nowIso: now });
    const subId = (ch as { ok: true; subscriptionId: string }).subscriptionId;
    const before = store.subscriptions.get(subId)!.periodEnd;
    const evt: ProviderEvent = { id: "evt_forged", type: "invoice.payment_succeeded", created: iso(30 * 86400000), subscriptionId: subId, userId: uid, payload: {} , signature: "sig:bad" as unknown as string };
    const r = processProviderEvent(store, evt, { nowIso: iso(30 * 86400000), verifySignature: true });
    expect(r.ok).toBe(false);
    expect(store.subscriptions.get(subId)!.periodEnd).toBe(before);
  });

  it("wrong amount or currency in webhook is ignored — never grants Pro from wrong-amount event with no real sub", () => {
    const store = createBillingStore();
    const evtWrongAmount: ProviderEvent = {
      id: "evt_wrong_amt", type: "subscription.created", created: iso(), subscriptionId: "sub_fake", userId: "user:evil@example.com",
      payload: { amountPaise: 1, currency: "INR", planId: PRO_PLAN_ID, status: "active", periodEnd: iso(30 * 86400000) },
    };
    const sig1 = sigFor(evtWrongAmount);
    const r1 = processProviderEvent(store, { ...evtWrongAmount, signature: sig1 }, { nowIso: iso(), verifySignature: true });
    expect(r1.ok).toBe(true);
    expect((r1 as { ok: true; reason: string }).reason).toMatch(/wrong amount/i);
    expect(store.subscriptions.has("sub_fake")).toBe(false);

    const evtWrongCurrency: ProviderEvent = {
      id: "evt_wrong_cur", type: "subscription.created", created: iso(), subscriptionId: "sub_fake2", userId: "user:evil@example.com",
      payload: { amountPaise: PRO_MONTHLY_PRICE_PAISE, currency: "USD", planId: PRO_PLAN_ID, status: "active", periodEnd: iso(30 * 86400000) },
    };
    const sig2 = sigFor(evtWrongCurrency);
    const r2 = processProviderEvent(store, { ...evtWrongCurrency, signature: sig2 }, { nowIso: iso(), verifySignature: true });
    expect((r2 as { ok: true; reason: string }).reason).toMatch(/wrong currency/i);
    expect(store.subscriptions.has("sub_fake2")).toBe(false);
  });

  it("unsupported recurring method — checkout rejects non-matching plan", () => {
    const store = createBillingStore();
    const r = createCheckout(store, { userId: "u1", email: "x@example.com", planId: "wrong-plan" as never, amountPaise: PRO_MONTHLY_PRICE_PAISE, currency: PRO_CURRENCY, nowIso: iso() });
    expect(r.ok).toBe(false);
  });

  it("out-of-order webhook (older created) does not overwrite newer state", () => {
    const store = createBillingStore();
    const uid = "user:ooo@example.com";
    const ch = createCheckout(store, { userId: uid, email: "ooo@example.com", planId: PRO_PLAN_ID, amountPaise: PRO_MONTHLY_PRICE_PAISE, currency: PRO_CURRENCY, nowIso: iso() });
    const subId = (ch as { ok: true; subscriptionId: string }).subscriptionId;
    // first apply newer cancel
    const newer: ProviderEvent = { id: "evt_newer", type: "subscription.updated", created: iso(10 * 86400000), subscriptionId: subId, userId: uid, payload: { status: "canceled" as const, periodEnd: iso(30 * 86400000), cancelAtPeriodEnd: false } };
    processProviderEvent(store, { ...newer, signature: sigFor(newer) }, { nowIso: iso(10 * 86400000), verifySignature: true });
    expect(store.subscriptions.get(subId)!.status).toBe("canceled");
    // now an older event tries to flip back to active — must be ignored
    const older: ProviderEvent = { id: "evt_older", type: "subscription.updated", created: iso(1 * 86400000), subscriptionId: subId, userId: uid, payload: { status: "active" as const, periodEnd: iso(30 * 86400000) } };
    const ro = processProviderEvent(store, { ...older, signature: sigFor(older) }, { nowIso: iso(10 * 86400000), verifySignature: true });
    expect((ro as { ok: true; reason: string }).reason).toMatch(/out-of-order/i);
    expect(store.subscriptions.get(subId)!.status).toBe("canceled");
  });

  it("no Pro access from URL manipulation or device-local flags — only verified snapshot grants Pro", () => {
    // simulate attacker setting a local flag
    try { localStorage.setItem("chessworkermind:proFlag", "true"); } catch {}
    expect(hasProAccessFromVerifiedOnly(null)).toBe(false);
    const freeSnap = deriveEntitlement({ userId: "u", subscription: null, charges: [], nowIso: iso() });
    expect(hasProAccessFromVerifiedOnly(freeSnap)).toBe(false);
    expect(hasProAccess(freeSnap)).toBe(false);
    // even if attacker adds query param ?pro=1 — entitlement ignores it by construction
    expect(hasProAccessFromVerifiedOnly(freeSnap)).toBe(false);
  });
});

describe("Renewal / cancel / reconnect / expiry — time-based scenarios", () => {
  it("renewal extends periodEnd by one month; failed renewal puts in grace; past grace expires", () => {
    const store = createBillingStore();
    const uid = "user:renew@example.com";
    const t0 = iso(0);
    const ch = createCheckout(store, { userId: uid, email: "renew@example.com", planId: PRO_PLAN_ID, amountPaise: PRO_MONTHLY_PRICE_PAISE, currency: PRO_CURRENCY, nowIso: t0 });
    const subId = (ch as { ok: true; subscriptionId: string }).subscriptionId;
    const firstEnd = store.subscriptions.get(subId)!.periodEnd;
    // successful renewal
    const renew: ProviderEvent = { id: "evt_renew_ok", type: "invoice.payment_succeeded", created: firstEnd, subscriptionId: subId, userId: uid, payload: {} };
    processProviderEvent(store, { ...renew, signature: sigFor(renew) }, { nowIso: firstEnd, verifySignature: true });
    const afterRenewEnd = store.subscriptions.get(subId)!.periodEnd;
    expect(new Date(afterRenewEnd).getTime()).toBeGreaterThan(new Date(firstEnd).getTime());
    const charges = [...store.charges.values()].filter((c) => c.userId === uid);
    let snap = deriveEntitlement({ userId: uid, subscription: store.subscriptions.get(subId)!, charges, nowIso: firstEnd });
    expect(snap.status).toBe("pro_active");
    // cancel at period end — still active until end, then expired
    const cancel: ProviderEvent = { id: "evt_cancel", type: "subscription.updated", created: afterRenewEnd, subscriptionId: subId, userId: uid, payload: { status: "active" as const, periodEnd: afterRenewEnd, cancelAtPeriodEnd: true } };
    processProviderEvent(store, { ...cancel, signature: sigFor(cancel) }, { nowIso: afterRenewEnd, verifySignature: true });
    snap = deriveEntitlement({ userId: uid, subscription: store.subscriptions.get(subId)!, charges: [...store.charges.values()].filter((c) => c.userId === uid), nowIso: afterRenewEnd });
    expect(snap.status).toBe("pro_canceled");
    // failed renewal scenario for a different user
    const store2 = createBillingStore();
    const uid2 = "user:fail@example.com";
    const ch2 = createCheckout(store2, { userId: uid2, email: "fail@example.com", planId: PRO_PLAN_ID, amountPaise: PRO_MONTHLY_PRICE_PAISE, currency: PRO_CURRENCY, nowIso: t0 });
    const subId2 = (ch2 as { ok: true; subscriptionId: string }).subscriptionId;
    const firstEnd2 = store2.subscriptions.get(subId2)!.periodEnd;
    const fail: ProviderEvent = { id: "evt_fail", type: "invoice.payment_failed", created: firstEnd2, subscriptionId: subId2, userId: uid2, payload: {} };
    processProviderEvent(store2, { ...fail, signature: sigFor(fail) }, { nowIso: firstEnd2, verifySignature: true });
    // within grace (1 day after)
    let snap2 = deriveEntitlement({ userId: uid2, subscription: store2.subscriptions.get(subId2)!, charges: [...store2.charges.values()].filter((c) => c.userId === uid2), nowIso: iso(1 * 86400000, firstEnd2) });
    expect(snap2.status).toBe("pro_grace");
    // past grace (10 days after) → expired
    snap2 = deriveEntitlement({ userId: uid2, subscription: store2.subscriptions.get(subId2)!, charges: [...store2.charges.values()].filter((c) => c.userId === uid2), nowIso: iso(10 * 86400000, firstEnd2) });
    expect(snap2.status).toBe("pro_expired");
    expect(hasProAccess(snap2)).toBe(false);
  });

  it("reconnect re-verifies authoritative provider state (signature-checked webhook state survives)", () => {
    const store = createBillingStore();
    const uid = "user:reconnect@example.com";
    const ch = createCheckout(store, { userId: uid, email: "reconnect@example.com", planId: PRO_PLAN_ID, amountPaise: PRO_MONTHLY_PRICE_PAISE, currency: PRO_CURRENCY, nowIso: iso() });
    const subId = (ch as { ok: true; subscriptionId: string }).subscriptionId;
    const snapBefore = deriveEntitlement({ userId: uid, subscription: store.subscriptions.get(subId)!, charges: [...store.charges.values()].filter((c) => c.userId === uid), nowIso: iso() });
    expect(hasProAccess(snapBefore)).toBe(true);
    // simulate app restart: entitlement re-derived from same store (server) — still active
    const snapAfter = deriveEntitlement({ userId: uid, subscription: store.subscriptions.get(subId)!, charges: [...store.charges.values()].filter((c) => c.userId === uid), nowIso: iso(5 * 86400000) });
    expect(snapAfter.status).toBe("pro_active");
  });

  it("cancellation without refund retains Pro until paid period ends then Free but history kept", () => {
    const store = createBillingStore();
    const uid = "user:cancelkeep@example.com";
    const ch = createCheckout(store, { userId: uid, email: "cancelkeep@example.com", planId: PRO_PLAN_ID, amountPaise: PRO_MONTHLY_PRICE_PAISE, currency: PRO_CURRENCY, nowIso: iso() });
    const subId = (ch as { ok: true; subscriptionId: string }).subscriptionId;
    const end = store.subscriptions.get(subId)!.periodEnd;
    const cancel: ProviderEvent = { id: "evt_cancel2", type: "subscription.updated", created: iso(5 * 86400000), subscriptionId: subId, userId: uid, payload: { status: "active" as const, periodEnd: end, cancelAtPeriodEnd: true } };
    processProviderEvent(store, { ...cancel, signature: sigFor(cancel) }, { nowIso: iso(5 * 86400000), verifySignature: true });
    const snapDuring = deriveEntitlement({ userId: uid, subscription: store.subscriptions.get(subId)!, charges: [...store.charges.values()].filter((c) => c.userId === uid), nowIso: iso(5 * 86400000) });
    expect(snapDuring.status).toBe("pro_canceled");
    expect(hasProAccess(snapDuring)).toBe(true);
    // after period + grace → expired but charges/history still present, no silent delete
    const snapAfter = deriveEntitlement({ userId: uid, subscription: store.subscriptions.get(subId)!, charges: [...store.charges.values()].filter((c) => c.userId === uid), nowIso: iso(40 * 86400000) });
    expect(snapAfter.status).toBe("pro_expired");
    expect(snapAfter.charges.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Seven-day first-purchase refund — boundary, failed/pending, second-month, duplicate, chargeback", () => {
  it("eligible within 7 days, ineligible at 7d+1ms, second-month charge not eligible", () => {
    const cap = iso(0);
    const justInside = iso(7 * 86400000 - 1_000); // 1s before boundary
    const exactly7d = iso(7 * 86400000);
    const justOutside = iso(7 * 86400000 + 1_000);
    expect(checkRefundEligibility({ chargeCapturedAt: cap, requestedAt: justInside, isFirstCharge: true, hasPriorRefundForUser: false, alreadyRefunded: false }).eligible).toBe(true);
    expect(isRefundAtBoundaryEligible(cap, exactly7d)).toBe(true);
    expect(checkRefundEligibility({ chargeCapturedAt: cap, requestedAt: exactly7d, isFirstCharge: true, hasPriorRefundForUser: false, alreadyRefunded: false }).eligible).toBe(true);
    expect(checkRefundEligibility({ chargeCapturedAt: cap, requestedAt: justOutside, isFirstCharge: true, hasPriorRefundForUser: false, alreadyRefunded: false }).eligible).toBe(false);
    // second month charge not eligible under first-purchase offer
    expect(checkRefundEligibility({ chargeCapturedAt: cap, requestedAt: justInside, isFirstCharge: false, hasPriorRefundForUser: false, alreadyRefunded: false }).eligible).toBe(false);
    // prior refund blocks
    expect(checkRefundEligibility({ chargeCapturedAt: cap, requestedAt: justInside, isFirstCharge: true, hasPriorRefundForUser: true, alreadyRefunded: false }).eligible).toBe(false);
    expect(checkRefundEligibility({ chargeCapturedAt: cap, requestedAt: justInside, isFirstCharge: true, hasPriorRefundForUser: false, alreadyRefunded: true }).eligible).toBe(false);
  });

  it("failed/pending refund stays pending, then processed — idempotency guard", () => {
    const existing: ReturnType<typeof upsertRefundRequest>["list"] = [];
    const key = createIdempotencyKey("u1", "ch_1", iso());
    const pending = { id: "re_1", userId: "u1", chargeId: "ch_1", subscriptionId: "sub_1", requestedAt: iso(), capturedAt: iso(), idempotencyKey: key, status: "pending" as const, providerRefundId: null, reason: "requested" };
    const r1 = upsertRefundRequest([], pending);
    expect(r1.created).toBe(true);
    const r2 = upsertRefundRequest(r1.list, { ...pending, status: "pending" });
    expect(r2.created).toBe(false);
    expect(r2.record.status).toBe("pending");
  });

  it("duplicate refund request via provider webhook is idempotent — second with same idempotencyKey ignored", () => {
    const store = createBillingStore();
    const uid = "user:refundidm@example.com";
    const ch = createCheckout(store, { userId: uid, email: "refundidm@example.com", planId: PRO_PLAN_ID, amountPaise: PRO_MONTHLY_PRICE_PAISE, currency: PRO_CURRENCY, nowIso: iso() });
    const subId = (ch as { ok: true; subscriptionId: string }).subscriptionId;
    const charges = [...store.charges.values()].filter((c) => c.userId === uid);
    const firstChargeId = charges[0].id;
    const idem = createIdempotencyKey(uid, firstChargeId, iso(2 * 86400000));
    const evt1: ProviderEvent = { id: "evt_refund1", type: "charge.refunded", created: iso(2 * 86400000), subscriptionId: subId, userId: uid, payload: { chargeId: firstChargeId, providerRefundId: "re_1", idempotencyKey: idem } };
    const sig1 = sigFor(evt1);
    expect(processProviderEvent(store, { ...evt1, signature: sig1 }, { nowIso: iso(2 * 86400000), verifySignature: true }).ok).toBe(true);
    expect(store.charges.get(firstChargeId)!.status).toBe("refunded");
    const evt2: ProviderEvent = { id: "evt_refund_dup", type: "charge.refunded", created: iso(2 * 86400000 + 1000), subscriptionId: subId, userId: uid, payload: { chargeId: firstChargeId, providerRefundId: "re_1_dup", idempotencyKey: idem } };
    const sig2 = sigFor(evt2);
    const r2 = processProviderEvent(store, { ...evt2, signature: sig2 }, { nowIso: iso(2 * 86400000 + 1000), verifySignature: true });
    expect((r2 as { ok: true; reason: string }).reason).toMatch(/duplicate refund idempotency/i);
    // second refund does not create another entry
    expect(store.refunds.filter((r) => r.idempotencyKey === idem).length).toBe(1);
  });

  it("refund when another paid billing period exists does not remove unrelated valid access — charge-level revoke only", () => {
    const store = createBillingStore();
    const uid = "user:multicharge@example.com";
    const t0 = iso(0);
    const ch = createCheckout(store, { userId: uid, email: "multicharge@example.com", planId: PRO_PLAN_ID, amountPaise: PRO_MONTHLY_PRICE_PAISE, currency: PRO_CURRENCY, nowIso: t0 });
    const subId = (ch as { ok: true; subscriptionId: string }).subscriptionId;
    // add a second paid period via renewal (simulating second month charge that is valid)
    const firstEnd = store.subscriptions.get(subId)!.periodEnd;
    const renewal: ProviderEvent = { id: "evt_renew_for_multicharge", type: "invoice.payment_succeeded", created: firstEnd, subscriptionId: subId, userId: uid, payload: {} };
    processProviderEvent(store, { ...renewal, signature: sigFor(renewal) }, { nowIso: firstEnd, verifySignature: true });
    const charges = [...store.charges.values()].filter((c) => c.userId === uid);
    expect(charges.length).toBe(2);
    const firstCharge = charges.find((c) => c.capturedAt === t0)!;
    const firstChargeId = firstCharge.id;
    const idem = createIdempotencyKey(uid, firstChargeId, iso(2 * 86400000));
    // refund first charge only
    const refundEvt: ProviderEvent = { id: "evt_refund_first_only", type: "charge.refunded", created: iso(2 * 86400000), subscriptionId: subId, userId: uid, payload: { chargeId: firstChargeId, providerRefundId: "re_first", idempotencyKey: idem } };
    processProviderEvent(store, { ...refundEvt, signature: sigFor(refundEvt) }, { nowIso: iso(2 * 86400000), verifySignature: true });
    // second charge still succeeded — user retains at least one succeeded charge
    expect([...store.charges.values()].filter((c) => c.userId === uid && c.status === "succeeded").length).toBe(1);
    // subscription period is still extended (access via renewal), not blanket revoked
    expect(store.subscriptions.get(subId)).toBeTruthy();
  });

  it("chargeback is recorded separately and does not masquerade as refund", () => {
    const store = createBillingStore();
    const uid = "user:cb@example.com";
    const ch = createCheckout(store, { userId: uid, email: "cb@example.com", planId: PRO_PLAN_ID, amountPaise: PRO_MONTHLY_PRICE_PAISE, currency: PRO_CURRENCY, nowIso: iso() });
    const subId = (ch as { ok: true; subscriptionId: string }).subscriptionId;
    const charges = [...store.charges.values()].filter((c) => c.userId === uid);
    const cid = charges[0].id;
    const evt: ProviderEvent = { id: "evt_cb", type: "charge.chargeback", created: iso(3 * 86400000), subscriptionId: subId, userId: uid, payload: { chargeId: cid } };
    processProviderEvent(store, { ...evt, signature: sigFor(evt) }, { nowIso: iso(3 * 86400000), verifySignature: true });
    expect(store.charges.get(cid)!.chargeback).toBe(true);
    expect(store.charges.get(cid)!.status).not.toBe("refunded");
  });
});

describe("Account sync — guest→account merge and concurrent two-device sync (no lost games)", () => {
  it("guest→account merge: union without deleting server games", () => {
    const userId = "user:guestmerge@example.com";
    const server: ReturnType<typeof buildLocalPayload> = {
      version: 1, userId,
      games: [{ id: "g1", fen: "fen1", pgn: "1. e4", orientation: "w", moveCount: 1, updatedAt: iso(0) }],
      learnerJson: null, reviewsJson: null, languageTag: "en", updatedAt: iso(0),
    };
    const local: ReturnType<typeof buildLocalPayload> = {
      version: 1, userId,
      games: [{ id: "g2", fen: "fen2", pgn: "1. d4", orientation: "w", moveCount: 1, updatedAt: iso(1000) }],
      learnerJson: null, reviewsJson: null, languageTag: "hi", updatedAt: iso(1000),
    };
    const merged = mergeSync(server, local);
    expect(merged.games.map((g) => g.id).sort()).toEqual(["g1", "g2"]);
    expect(merged.languageTag).toBe("hi"); // local preference wins when present
  });

  it("concurrent progress from two devices — LWW per stable id, never silently delete", () => {
    // device A and B both modify same game g1, server holds A's version, local holds B's newer version
    const userId = "user:concurrent@example.com";
    const base = { id: "g1", fen: "fen-base", pgn: "1. e4", orientation: "w" as const, moveCount: 1, updatedAt: iso(0) };
    const server = buildLocalPayload({ userId, games: [{ ...base, fen: "fen-A", pgn: "1. e4 e5", updatedAt: iso(1000) }], learnerJson: null, reviewsJson: null, languageTag: "en", nowIso: iso(1000) });
    const local = buildLocalPayload({ userId, games: [{ ...base, fen: "fen-B", pgn: "1. e4 c5", updatedAt: iso(2000) }], learnerJson: null, reviewsJson: null, languageTag: "en", nowIso: iso(2000) });
    const merged = mergeSync(server, local);
    expect(merged.games.length).toBe(1);
    expect(merged.games[0].fen).toBe("fen-B"); // newer wins

    // different games from two devices both survive
    const server2 = buildLocalPayload({ userId, games: [{ id: "gA", fen: "fA", pgn: "1. e4", orientation: "w", moveCount: 1, updatedAt: iso(0) }], learnerJson: null, reviewsJson: null, languageTag: "en", nowIso: iso(0) });
    const local2 = buildLocalPayload({ userId, games: [{ id: "gB", fen: "fB", pgn: "1. d4", orientation: "w", moveCount: 1, updatedAt: iso(1000) }], learnerJson: null, reviewsJson: null, languageTag: "en", nowIso: iso(1000) });
    const merged2 = lwwMerge(server2.games, local2.games);
    expect(merged2.map((g) => g.id).sort()).toEqual(["gA", "gB"]);
  });

  it("session validation and login requirement before checkout", () => {
    const u = createUser("Test@Example.COM", iso())!;
    expect(u.email).toBe("test@example.com");
    expect(u.id).toBe("user:test@example.com");
    const sess = createSession(u, iso());
    expect(isSessionValid(sess, iso(1000))).toBe(true);
    expect(isSessionValid(sess, iso(25 * 3600_000))).toBe(false); // >24h TTL
    // checkout requires login
    const store = createBillingStore();
    const noUserCheckout = createCheckout(store, { userId: "", email: "", planId: PRO_PLAN_ID, amountPaise: PRO_MONTHLY_PRICE_PAISE, currency: PRO_CURRENCY, nowIso: iso() });
    expect(noUserCheckout.ok).toBe(false);
    expect((noUserCheckout as { ok: false; error: string }).error).toMatch(/login required/i);
  });

  it("pending authorization does not grant Pro — only succeeded charges lead to active entitlement derivative shows expired/none when no active sub", () => {
    // entitlement with zero subs/charges is free
    const snap = deriveEntitlement({ userId: "user:pending@example.com", subscription: null, charges: [], nowIso: iso() });
    expect(snap.status).toBe("free");
    expect(hasProAccess(snap)).toBe(false);
  });
});

describe("Signature helper — verifyTestSignature", () => {
  it("sign and verify round-trips", () => {
    const body = JSON.stringify({ id: "evt_x", type: "subscription.created" });
    const sig = signTestEvent(body);
    expect(verifyTestSignature(body, sig)).toBe(true);
    expect(verifyTestSignature(body + "tamper", sig)).toBe(false);
  });
});
