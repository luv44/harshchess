import { useState } from "react";
import { useAccount } from "./useAccount";
import { CHECKOUT_ENABLED, priceSummary } from "./pricing";

export function AccountPage() {
  const a = useAccount();
  const [emailInput, setEmailInput] = useState("");
  const ent = a.entitlement;
  const sub = ent?.subscription ?? null;
  const charges = ent?.charges ?? [];

  return (
    <section className="section">
      <div className="card">
        <h2>Account &amp; Billing</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.92rem", marginTop: 6 }}>
          {priceSummary(true)} Guest progress is saved locally and merged into your account on sign-in (no silent deletion). Reconnect re-verifies subscription with the provider.
        </p>

        <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span className="pill" title="Base price rule">Pro plan: ₹599/month INR</span>
          <span className={`pill ${a.hasPro ? "pill--ok" : "pill--off"}`}>{a.hasPro ? "Pro access: yes (verified)" : "Pro access: Free"}</span>
          {!CHECKOUT_ENABLED && <span className="pill pill--warn">Pro checkout disabled — coming soon</span>}
          {CHECKOUT_ENABLED && <span className="pill pill--ok">Checkout enabled</span>}
        </div>

        <div className="grid2" style={{ marginTop: 16 }}>
          <div className="card" style={{ margin: 0 }}>
            <h3>Sign in / sync</h3>
            {a.user ? (
              <>
                <p style={{ marginTop: 8 }}>Signed in as <strong>{a.user.email}</strong></p>
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>User ID: <code>{a.user.id}</code></p>
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: 6 }}>
                  Language + learner + reviews + game are merged by stable ID (LWW, union) — no games deleted on merge. Two devices: latest <code>updatedAt</code> per record wins.
                </p>
                {a.syncInfo && <p role="status" style={{ marginTop: 8, fontSize: "0.9rem" }}>{a.syncInfo}</p>}
                {a.notice && <p role="status" style={{ marginTop: 8, fontSize: "0.9rem", fontWeight: 600 }}>{a.notice}</p>}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  <button className="btn" onClick={a.syncNow}>Sync now</button>
                  <button className="btn" onClick={a.reconnect}>Reconnect &amp; re-verify</button>
                  <button className="btn btn--ghost" onClick={a.logout}>Sign out</button>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  <button
                    className="btn btn--ghost"
                    onClick={() => {
                      const data = a.exportData();
                      if (!data) { alert("No synced data yet."); return; }
                      const blob = new Blob([data], { type: "application/json" });
                      const url = URL.createObjectURL(blob);
                      const el = document.createElement("a");
                      el.href = url; el.download = "chessworkermind-export.json"; el.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    Export data
                  </button>
                  <button className="btn btn--ghost" onClick={a.deleteData}>Delete synced data</button>
                </div>
                <p style={{ marginTop: 8, fontSize: "0.82rem", color: "var(--text-muted)" }}>
                  Offline: guest play works after assets load. Login/purchase/sync need network. Paid offline grace is 3 days, based on prior server verification.
                </p>
              </>
            ) : (
              <>
                <p style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>Guest: progress stored locally. Sign in to sync across devices. Login is required before checkout.</p>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <input
                    aria-label="Email for account sync"
                    placeholder="you@example.com"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    style={{ flex: 1, minWidth: 0, padding: "8px 10px", borderRadius: 10, border: "1px solid var(--border, #ddd)" }}
                  />
                  <button className="btn btn--primary" onClick={() => a.login(emailInput)}>Sign in &amp; sync</button>
                </div>
                {a.notice && <p role="status" style={{ marginTop: 8, fontSize: "0.9rem" }}>{a.notice}</p>}
                <p style={{ marginTop: 8, fontSize: "0.82rem", color: "var(--text-muted)" }}>
                  We store stable IDs, FEN/PGN/moves, verified provenance, attempts, mastery and review dates. Never trust a local Pro flag — entitlement is verified server-side.
                </p>
              </>
            )}
          </div>

          <div className="card" style={{ margin: 0 }}>
            <h3>Billing status</h3>
            {ent ? (
              <>
                <p style={{ marginTop: 8 }}>
                  Status: <strong>{ent.status}</strong> <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>({ent.reason})</span>
                </p>
                {sub ? (
                  <>
                    <p style={{ fontSize: "0.9rem", marginTop: 6 }}>Plan: <code>{sub.planId}</code> — {sub.amountPaise / 100} {sub.currency} / {PRICE_LABEL}</p>
                    <p style={{ fontSize: "0.9rem" }}>Period: {new Date(sub.periodStart).toLocaleDateString()} → {new Date(sub.periodEnd).toLocaleDateString()} {sub.cancelAtPeriodEnd ? "(cancels at period end)" : "(auto-renews)"}</p>
                    {ent.nextChargeAt && <p style={{ fontSize: "0.9rem" }}>Next charge/renewal: {new Date(ent.nextChargeAt).toLocaleString()} — amount verified server-side (client amounts not trusted).</p>}
                    {ent.accessUntil && <p style={{ fontSize: "0.9rem" }}>Access until: {new Date(ent.accessUntil).toLocaleString()}</p>}
                    <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: 6 }}>
                      If country/tax display needs it, an approximate local-currency estimate would be shown separately, dated and never as the final charge.
                    </p>
                  </>
                ) : (
                  <p style={{ marginTop: 8, color: "var(--text-muted)" }}>No subscription. {priceSummary(false)}</p>
                )}

                {charges.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <h4 style={{ fontSize: "0.95rem" }}>Receipts / payment history</h4>
                    <ul style={{ marginTop: 6, fontSize: "0.9rem" }}>
                      {charges.map((c) => (
                        <li key={c.id}>
                          <code>{c.id.slice(0, 18)}…</code> — ₹{(c.amountPaise / 100).toFixed(2)} {c.currency} · {c.status}
                          {c.refundedAt ? ` · refunded ${new Date(c.refundedAt).toLocaleDateString()} (${c.refundId ?? ""})` : ""}
                          {c.chargeback ? " · chargeback" : ""} · {new Date(c.capturedAt).toLocaleDateString()}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                  <button
                    className="btn"
                    disabled={!CHECKOUT_ENABLED}
                    title={!CHECKOUT_ENABLED ? "Checkout disabled until merchant & tests approved" : "Create subscription"}
                    onClick={a.checkoutTestMode}
                    aria-disabled={!CHECKOUT_ENABLED}
                  >
                    {CHECKOUT_ENABLED ? "Subscribe Pro (test mode)" : "Subscribe — disabled (coming soon)"}
                  </button>
                  {/* Always-visible test-mode helper for milestone-4 verification; does not enable live charging */}
                  <button className="btn btn--ghost" onClick={a.checkoutTestMode} title="Test-mode only — no live charge">
                    Test helper: create/renew in test mode
                  </button>
                </div>
                <p style={{ marginTop: 6, fontSize: "0.82rem", color: "var(--text-muted)" }}>
                  Live checkout stays disabled and labelled above until merchant eligibility, fees, tax/invoicing and owner approval are complete. Test helper above uses provider test mode.
                </p>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  <button className="btn btn--ghost" onClick={a.cancelAtPeriodEnd} disabled={!sub}>Cancel at period end</button>
                  <button className="btn btn--ghost" onClick={a.requestRefund} disabled={!sub}>Request 7-day first-purchase refund</button>
                </div>
                <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: 6 }}>
                  Refund rule (proposed, owner-approved wording required before live): full refund for eligible first successful charge within 7 calendar days of capture. After refund, renewal is canceled; only that charge's period is revoked. Cancellation without refund keeps Pro until period end. Grace on failed renewal: 3 days.
                </p>
              </>
            ) : (
              <p style={{ marginTop: 8, color: "var(--text-muted)" }}>Sign in to see subscription status. Free costs ₹0 forever; no annual plan.</p>
            )}
          </div>
        </div>

        <p style={{ marginTop: 12, fontSize: "0.85rem", color: "var(--text-muted)" }}>
          Provider: <code>TestProvider</code> (provider-neutral adapter). Webhooks verified by signature + authoritative amount/currency/plan/user checks, idempotent on event ID, handling duplicate/late/out-of-order, pending auth (no Pro), renewal, failed charge/grace, cancellation, expiry, refund/chargeback and restore on another device.
        </p>
      </div>
    </section>
  );
}

const PRICE_LABEL = "month";
