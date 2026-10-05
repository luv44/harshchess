/**
 * Account — minimal auth surface (test-mode / local). No secrets, no live charging.
 * Real provider will supply sessions; here we model user, login, linkage guest->account,
 * and reconciliation hook.
 */
export type User = {
  id: string;
  email: string; // lowercased, validated
  createdAt: string;
  linkedAt: string | null;
};

export type Session = {
  userId: string;
  email: string;
  issuedAt: string;
  expiresAt: string; // ISO
};

const SESSION_TTL_MS = 24 * 3600_000;

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createUser(email: string, atIso: string): User | null {
  if (!isValidEmail(email)) return null;
  const norm = normalizeEmail(email);
  const id = `user:${norm}`; // deterministic id for tests (real: uuid/db)
  return { id, email: norm, createdAt: atIso, linkedAt: null };
}

export function createSession(user: User, nowIso: string): Session {
  const now = new Date(nowIso).getTime();
  return {
    userId: user.id,
    email: user.email,
    issuedAt: nowIso,
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
  };
}

export function isSessionValid(session: Session | null, nowIso: string): boolean {
  if (!session) return false;
  return new Date(nowIso).getTime() < new Date(session.expiresAt).getTime();
}
