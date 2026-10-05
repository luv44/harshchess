/**
 * Adaptive practice engine.
 * - Every motif (skill type) has a level 1..3, saved on the device.
 * - A session is 5 positions. As you play, the engine picks each NEXT position
 *   at a level that matches how you're doing: two clean solves in a row steps UP,
 *   two misses step DOWN. Nothing is static.
 */
import { PRACTICE_BANK, type BankItem, type Motif } from "./practiceBank";

const KEY = "cwm:practice:v2";

export type PracticeStore = {
  version: 2;
  levels: Record<string, number>;
  seen: Record<string, number>;
  sessions: number;
  updatedAt: string;
};

export function loadPractice(): PracticeStore {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as PracticeStore;
      if (p && p.version === 2) return p;
    }
  } catch { /* fresh */ }
  return { version: 2, levels: {}, seen: {}, sessions: 0, updatedAt: new Date().toISOString() };
}

export function savePractice(p: PracticeStore) {
  try {
    p.updatedAt = new Date().toISOString();
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch { /* storage full/blocked — practice still works this session */ }
}

export function getLevel(p: PracticeStore, motif: string): number {
  return Math.min(3, Math.max(1, p.levels[motif] ?? 1));
}

/** motifs ordered weakest-first for mixed sessions (by recent accuracy) */
export function mixedMotifOrder(p: PracticeStore, accuracy: (motif: Motif) => number | null): Motif[] {
  const motifs: Motif[] = ["mate", "hanging", "captures", "calculation", "endgame", "opening"];
  return [...motifs].sort((a, b) => (accuracy(a) ?? 0.34) - (accuracy(b) ?? 0.34) || getLevel(p, a) - getLevel(p, b));
}

/** Pick the next position: least-seen item at the wanted level, falling back to nearby levels. */
export function pickItem(motif: Motif, wantedLevel: number, store: PracticeStore, avoidIds: string[]): BankItem | null {
  for (const lv of [wantedLevel, wantedLevel - 1, wantedLevel + 1, wantedLevel - 2, wantedLevel + 2]) {
    if (lv < 1 || lv > 3) continue;
    const pool = PRACTICE_BANK.filter((i) => i.motif === motif && i.level === lv && !avoidIds.includes(i.id));
    if (pool.length === 0) continue;
    pool.sort((a, b) => (store.seen[a.id] ?? 0) - (store.seen[b.id] ?? 0));
    // least-seen; tie-break deterministic-ish by id to avoid always the same
    const least = pool.filter((i) => (store.seen[i.id] ?? 0) === (store.seen[pool[0].id] ?? 0));
    return least[Math.floor(Math.random() * least.length)];
  }
  // absolute fallback: any unseen item of the motif, then any at all
  const rest = PRACTICE_BANK.filter((i) => i.motif === motif && !avoidIds.includes(i.id));
  return rest.length ? rest[Math.floor(Math.random() * rest.length)] : PRACTICE_BANK.find((i) => i.motif === motif) ?? null;
}

export type SessionOutcome = { correct: boolean; hinted: boolean };

/** Live level during a session: streaks move you up/down between positions. */
export function liveLevel(baseLevel: number, results: SessionOutcome[]): number {
  let lvl = baseLevel;
  const recent = results.slice(-2);
  const allClean = recent.length === 2 && recent.every((r) => r.correct && !r.hinted);
  const allMiss = recent.length === 2 && recent.every((r) => !r.correct);
  if (allClean) lvl = Math.min(3, lvl + 1);
  else if (allMiss) lvl = Math.max(1, lvl - 1);
  return lvl;
}

/** Level change after a finished session — saved for next time. */
export function planLevelAfter(startLevel: number, results: SessionOutcome[]): { next: number; message: string } {
  const clean = results.filter((r) => r.correct && !r.hinted).length;
  const correct = results.filter((r) => r.correct).length;
  if (clean >= 4 && startLevel < 3) {
    return { next: startLevel + 1, message: `Excellent — ${clean} clean solves. Stepping you UP to level ${startLevel + 1}.` };
  }
  if (correct >= 4 && startLevel < 3) {
    return { next: startLevel + 1, message: `Strong — ${correct} of 5 solved. Moving you up to level ${startLevel + 1}.` };
  }
  if (correct <= 2 && startLevel > 1) {
    return { next: startLevel - 1, message: `Tough round — easing you back to level ${startLevel - 1} to rebuild the pattern. No shame in it.` };
  }
  if (correct <= 2 && startLevel === 1) {
    return { next: 1, message: "Tough round — level 1 it is. Use the step hints, they walk you to the answer." };
  }
  return { next: startLevel, message: `Solid — staying at level ${startLevel}. Solve more clean (no hints) to step up.` };
}
