/**
 * Ranking (step 5) + concept graph (step 8).
 * Filters illegal/duplicate/too-hard/low-quality, scores by weighted signals,
 * diversity-reranks by motif/opening/endgame/source, keeps exploration share,
 * aims for 70-85% expected success band.
 */

export type Exercise = {
  id: string;
  fen: string;
  motif: string;
  opening?: string;
  endgame?: boolean;
  source: string; // attribution
  difficulty: number; // 0 easy ..1 hard
  quality: number; // 0..1
};

export type RankSignals = {
  weakness: number; // 0..1
  recentMistake: number;
  informationGain: number;
  ownGameRelevance: number;
  difficultyFit: number;
  forgettingRisk: number;
  transfer: number;
  novelty: number;
  repetitionPenalty: number; // 0..1 to subtract
};

export const RANK_WEIGHTS = {
  weakness: 0.23,
  recentMistake: 0.18,
  informationGain: 0.16,
  ownGameRelevance: 0.13,
  difficultyFit: 0.11,
  forgettingRisk: 0.09,
  transfer: 0.06,
  novelty: 0.04,
} as const;

export function scoreExercise(signals: RankSignals): number {
  const w = RANK_WEIGHTS;
  const s =
    w.weakness * signals.weakness +
    w.recentMistake * signals.recentMistake +
    w.informationGain * signals.informationGain +
    w.ownGameRelevance * signals.ownGameRelevance +
    w.difficultyFit * signals.difficultyFit +
    w.forgettingRisk * signals.forgettingRisk +
    w.transfer * signals.transfer +
    w.novelty * signals.novelty -
    signals.repetitionPenalty;
  return Math.max(0, Math.min(1, s));
}

/** Concept graph — prerequisites must be understood before advanced combos. */
export const CONCEPT_PREREQS: Record<string, string[]> = {
  defendingThreats: ["noticingChecks"],
  calculatingForcing: ["defendingThreats", "noticingChecks"],
  combinations: ["calculatingForcing", "hangingAwareness"],
  kingSafety: ["noticingChecks", "defendingThreats"],
};

/** Returns true if lesson's required prereqs are satisfied by skill proficiency.
 * If an entry is a concept key in CONCEPT_PREREQS, its prereqs are checked instead.
 */
export function prereqsSatisfied(
  required: string[],
  skillProficiency: Record<string, number>,
  threshold = 0.45,
): boolean {
  for (const r of required) {
    const prereqs = CONCEPT_PREREQS[r];
    if (prereqs) {
      for (const p of prereqs) {
        if ((skillProficiency[p] ?? 0) < threshold) return false;
      }
    } else {
      if ((skillProficiency[r] ?? 0) < threshold) return false;
    }
  }
  return true;
}

export function filterExercises(
  exercises: Exercise[],
  opts: {
    seenIds: Set<string>;
    maxDifficulty: number; // above is too-hard for this learner
    minQuality: number;
  },
): Exercise[] {
  return exercises.filter((e) => {
    if (opts.seenIds.has(e.id)) return false; // duplicate
    if (e.difficulty > opts.maxDifficulty) return false;
    if (e.quality < opts.minQuality) return false;
    return true;
  });
}

/** Diversity rerank: penalize recent motif/source repetition. */
export function diversityRerank(
  scored: Array<{ ex: Exercise; score: number }>,
  recentMotifs: string[],
  recentSources: string[],
): Array<{ ex: Exercise; score: number }> {
  return scored
    .map((item) => {
      let penalty = 0;
      const motifCount = recentMotifs.filter((m) => m === item.ex.motif).length;
      if (motifCount >= 2) penalty += 0.06;
      if (motifCount >= 3) penalty += 0.06;
      const srcCount = recentSources.filter((s) => s === item.ex.source).length;
      if (srcCount >= 2) penalty += 0.04;
      return { ...item, score: Math.max(0, item.score - penalty) };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Rank with exploration share (small random-ish boost) while keeping 70-85% band.
 * Exploration picks a high-uncertainty item that would otherwise be just below top.
 */
export function rankExercises(
  exercises: Exercise[],
  signalFor: (ex: Exercise) => RankSignals,
  ctx: {
    recentMotifs: string[];
    recentSources: string[];
    explorationShare: number; // e.g. 0.08
    randomSeed?: number; // deterministic for tests; if omitted, uses Math.random
  },
): Array<{ ex: Exercise; score: number }> {
  const scored = exercises.map((ex) => ({ ex, score: scoreExercise(signalFor(ex)) }));
  const reranked = diversityRerank(scored, ctx.recentMotifs, ctx.recentSources);
  // exploration: with probability share, swap in a lower-ranked high-novelty item
  const r = ctx.randomSeed != null ? pseudoRandom(ctx.randomSeed) : Math.random();
  if (r < ctx.explorationShare && reranked.length >= 3) {
    // find candidate with high novelty (signalFor) that is rank 3..5
    const window = reranked.slice(2, 6);
    let bestNovelty = -1;
    let bestIdx = -1;
    window.forEach((item, i) => {
      const nov = signalFor(item.ex).novelty;
      if (nov > bestNovelty) {
        bestNovelty = nov;
        bestIdx = i;
      }
    });
    if (bestIdx >= 0 && bestNovelty > 0.6) {
      const picked = window[bestIdx];
      const rest = reranked.filter((x) => x.ex.id !== picked.ex.id);
      // place picked near top (position 1) to ensure exposure but still ordered mostly
      return [rest[0], picked, ...rest.slice(1)];
    }
  }
  return reranked;
}

function pseudoRandom(seed: number): number {
  // simple deterministic 0..1
  const x = Math.sin(seed * 9999) * 10000;
  return x - Math.floor(x);
}
