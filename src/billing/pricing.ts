/** Billing pricing — global rule. One ₹599/month INR base price for every eligible customer. No silent discounts, no annual plan unless separately approved. */
export const PRO_MONTHLY_PRICE_PAISE = 59900; // 599.00 INR in paise
export const PRO_MONTHLY_PRICE_RUPEES = 599;
export const PRO_CURRENCY = "INR" as const;
export const PRO_INTERVAL = "month" as const;
export const PRO_PLAN_ID = "pro-monthly-inr-599" as const;
export const PRO_PRICE_DISPLAY = "₹599/month" as const;

// For unsupported markets: checkout stays unavailable, Free remains usable.
export const CHECKOUT_ENABLED = false; // labeled "Pro coming soon" until merchant + lifecycle tests pass — never flip without owner approval

export function formatINR(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

// Validate that server/provider totals agree; never accept client-supplied amounts.
export function isValidProAmount(amountPaise: number, currency: string): boolean {
  return amountPaise === PRO_MONTHLY_PRICE_PAISE && currency === PRO_CURRENCY;
}

export function priceSummary(withTaxNote = true): string {
  const base = `Charge: ${PRO_PRICE_DISPLAY} (INR), auto-renewing monthly. Cancel anytime; access through current paid period.`;
  if (!withTaxNote) return base;
  return `${base} Any local-currency estimate is labelled approximate and dated; actual charge is ${PRO_PRICE_DISPLAY} INR. Bank may convert and add fees.`;
}

// If charging in another supported currency later: must use owner-approved conversion rule, never country discounts.
// This file intentionally has no conversion table — charging only in INR until owner approves otherwise.
