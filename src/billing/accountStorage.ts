/**
 * Account sync storage — local IndexedDB-like via localStorage for test portability; same merge policy works with real server.
 * Holds per-user synced payload; supports export/delete per spec.
 */
const ACCOUNT_KEY_PREFIX = "chessworkermind:account:";
const SESSION_KEY = "chessworkermind:session:v1";
const LEGACY_GUEST_KEY = "chessworkermind:freeGame:v1";
const LANGUAGE_KEY = "chessworkermind:langTag:v1";

import { mergeSync, buildLocalPayload, type SyncPayload, type SavedGameStable } from "./sync";

function accountKey(userId: string): string {
  return `${ACCOUNT_KEY_PREFIX}${userId}:payload:v1`;
}

export function saveAccountPayload(payload: SyncPayload): void {
  try { localStorage.setItem(accountKey(payload.userId), JSON.stringify(payload)); } catch {}
}
export function loadAccountPayload(userId: string): SyncPayload | null {
  try {
    const raw = localStorage.getItem(accountKey(userId));
    if (raw) return JSON.parse(raw) as SyncPayload;
  } catch {}
  return null;
}
export function deleteAccountData(userId: string): void {
  try { localStorage.removeItem(accountKey(userId)); } catch {}
}

export function exportAccountData(userId: string): string | null {
  const p = loadAccountPayload(userId);
  if (!p) return null;
  return JSON.stringify(p, null, 2);
}

export function saveSessionJson(raw: string): void {
  try { localStorage.setItem(SESSION_KEY, raw); } catch {}
}
export function loadSessionJson(): string | null {
  try { return localStorage.getItem(SESSION_KEY); } catch { return null; }
}
export function clearSession(): void {
  try { localStorage.removeItem(SESSION_KEY); } catch {}
}

export function loadLanguageTag(): string | null {
  try { return localStorage.getItem(LANGUAGE_KEY); } catch { return null; }
}
export function saveLanguageTag(tag: string): void {
  try { localStorage.setItem(LANGUAGE_KEY, tag); } catch {}
}

// Build local payload helpers from current localStorage state (called from UI/sync hook).
export function snapshotLocalPayload(userId: string, nowIso: string): SyncPayload {
  // Collect minimal local state: one saved game + learner + reviews + language
  let games: SavedGameStable[] = [];
  try {
    const raw = localStorage.getItem(LEGACY_GUEST_KEY);
    if (raw) {
      const g = JSON.parse(raw) as { fen: string; pgn: string; orientation: "w" | "b"; updatedAt: string };
      if (g?.fen) {
        // Derive stable id from updatedAt + fen prefix
        const id = `game:${(g.updatedAt ?? nowIso).slice(0, 16)}:${g.fen.slice(0, 24).replace(/\s/g, "_")}`;
        games = [{ id, fen: g.fen, pgn: g.pgn ?? "", orientation: g.orientation === "b" ? "b" : "w", moveCount: (g.pgn ?? "").split(/\s+/).filter(Boolean).length, updatedAt: g.updatedAt ?? nowIso }];
      }
    }
  } catch {}
  // Learner/reviews are under chessworkermind:learner:v1 and chessworkermind:reviews:v1
  let learnerJson: string | null = null;
  let reviewsJson: string | null = null;
  try {
    learnerJson = localStorage.getItem("chessworkermind:learner:v1");
    reviewsJson = localStorage.getItem("chessworkermind:reviews:v1");
  } catch {}
  const languageTag = loadLanguageTag();
  return buildLocalPayload({ userId, games, learnerJson, reviewsJson, languageTag, nowIso });
}

// Full sync: local snapshot merged into server payload, then persisted to account key, returns merged.
export function syncToAccount(userId: string, nowIso: string): SyncPayload {
  const server = loadAccountPayload(userId);
  const local = snapshotLocalPayload(userId, nowIso);
  const merged = mergeSync(server, local);
  saveAccountPayload(merged);
  return merged;
}
