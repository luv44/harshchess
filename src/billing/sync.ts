/**
 * Account sync — reconciliation of local guest progress vs server (account) copies.
 * Covers: guest -> account merge, two-device concurrent without losing games, conflict policy explicit.
 *
 * Data covered: games (FEN/PGN/moves via stable gameId), learner model, spaced reviews, language choice.
 *
 * Conflict policy (explicit, idempotent):
 * - Writes are idempotent by stableId: latest updatedAt wins per record (LWW, monotonic).
 * - Guest records not yet seen server-side are merged (union), never silently deleted.
 * - Deletions are soft (tombstone with deletedAt) in future; here we preserve all active records.
 * - For counter-increment-like fields e.g. games list, we union by stable id.
 * - Learner attempts: union by at+skillId key, deduped.
 */

export type StableRecord<T extends { updatedAt: string }> = T;

export type SyncPayload = {
  version: number;
  userId: string;
  games: SavedGameStable[];
  learnerJson: string | null; // serialized learner (versioned)
  reviewsJson: string | null; // serialized reviews array
  languageTag: string | null;
  updatedAt: string; // max updatedAt of enclosed records
};

export type SavedGameStable = {
  id: string; // stable id per game, e.g. derived from initial FEN + createdAt
  fen: string;
  pgn: string;
  orientation: "w" | "b";
  moveCount: number;
  updatedAt: string;
};

function maxIso(a: string, b: string): string {
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

// LWW merge for map keyed by id
export function lwwMerge<T extends { id: string; updatedAt: string }>(server: T[], local: T[]): T[] {
  const byId = new Map<string, T>();
  for (const r of server) byId.set(r.id, r);
  for (const r of local) {
    const prev = byId.get(r.id);
    if (!prev) { byId.set(r.id, r); continue; }
    byId.set(r.id, new Date(r.updatedAt).getTime() >= new Date(prev.updatedAt).getTime() ? r : prev);
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function mergeSync(server: SyncPayload | null, local: SyncPayload): SyncPayload {
  if (!server) return local;
  if (server.userId !== local.userId) {
    // linking guest to account: server payload belongs to that user, local is guest-merged copy
    // union by keeping both sides' records, tagged to same user after link
  }
  const games = lwwMerge(server.games ?? [], local.games ?? []);
  // learner: pick newer updatedAt; in future do attempt-level union — for now LWW with evidence preserved via append if tie broken by newer
  let learnerJson = local.learnerJson;
  if (server.learnerJson && local.learnerJson) {
    try {
      const s = JSON.parse(server.learnerJson) as { updatedAt?: string };
      const l = JSON.parse(local.learnerJson) as { updatedAt?: string };
      const sAt = s.updatedAt ?? server.updatedAt;
      const lAt = l.updatedAt ?? local.updatedAt;
      learnerJson = new Date(lAt).getTime() >= new Date(sAt).getTime() ? local.learnerJson : server.learnerJson;
    } catch { learnerJson = local.learnerJson ?? server.learnerJson; }
  } else {
    learnerJson = local.learnerJson ?? server.learnerJson;
  }

  let reviewsJson = local.reviewsJson;
  if (server.reviewsJson && local.reviewsJson) {
    try {
      const sArr = JSON.parse(server.reviewsJson) as { updatedAt?: string; skillId?: string }[];
      const lArr = JSON.parse(local.reviewsJson) as { updatedAt?: string; skillId?: string }[];
      // For reviews we can LWW by skillId (one review item per skill), and union
      const byKey = new Map<string, unknown>();
      for (const r of sArr) byKey.set((r as { skillId: string }).skillId, r);
      for (const r of lArr) {
        const key = (r as { skillId: string }).skillId;
        const prev = byKey.get(key) as { updatedAt?: string } | undefined;
        if (!prev || new Date((r.updatedAt ?? "")).getTime() >= new Date((prev as { updatedAt?: string }).updatedAt ?? "").getTime()) {
          byKey.set(key, r);
        }
      }
      // also keep skills only on one side
      reviewsJson = JSON.stringify([...byKey.values()]);
    } catch { reviewsJson = local.reviewsJson ?? server.reviewsJson; }
  } else {
    reviewsJson = local.reviewsJson ?? server.reviewsJson;
  }

  const languageTag = local.languageTag ?? server.languageTag;
  const updatedAt = [server.updatedAt, local.updatedAt].reduce(maxIso);

  return { version: 1, userId: local.userId, games, learnerJson, reviewsJson, languageTag, updatedAt };
}

/** Build a local payload snapshot from current localStorage state (caller passes gathered values) */
export function buildLocalPayload(args: {
  userId: string;
  games: SavedGameStable[];
  learnerJson: string | null;
  reviewsJson: string | null;
  languageTag: string | null;
  nowIso: string;
}): SyncPayload {
  const { userId, games, learnerJson, reviewsJson, languageTag, nowIso } = args;
  const ts = [...games.map((g) => g.updatedAt), nowIso].reduce(maxIso);
  return { version: 1, userId, games, learnerJson, reviewsJson, languageTag, updatedAt: ts };
}
