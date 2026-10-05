/**
 * Learner model — per micro-skill proficiency + uncertainty.
 * Steps 4,7,9,11. One move never proves mastery. Evidence kept.
 */

export type SkillId =
  | "recognition"
  | "calculation"
  | "moveChoice"
  | "execution"
  | "transfer"
  | "checks"
  | "captures"
  | "hanging"
  | "kingSafety"
  | "opening"
  | "endgame";

export type Attempt = {
  skillId: SkillId;
  at: string; // ISO
  correct: boolean; // unaided correct?
  hinted: boolean; // if hinted, weaker evidence
  difficulty: number; // 0..1 (item difficulty)
  timeMs?: number; // not equated to understanding alone
};

export type SkillState = {
  skillId: SkillId;
  proficiency: number; // 0..1
  uncertainty: number; // 0..1, high = uncertain
  attempts: Attempt[];
  lastUnaidedSuccessAt: string | null;
  evidence: string[]; // human-readable audit trail
};

export type Learner = {
  version: 1;
  skills: Record<SkillId, SkillState>;
  updatedAt: string;
};

const DEFAULT_SKILLS: SkillId[] = [
  "recognition",
  "calculation",
  "moveChoice",
  "execution",
  "transfer",
  "checks",
  "captures",
  "hanging",
  "kingSafety",
  "opening",
  "endgame",
];

export function createLearner(): Learner {
  const skills = {} as Record<SkillId, SkillState>;
  for (const id of DEFAULT_SKILLS) {
    skills[id] = {
      skillId: id,
      proficiency: 0.5,
      uncertainty: 0.85, // start uncertain
      attempts: [],
      lastUnaidedSuccessAt: null,
      evidence: [`init: p=0.50 u=0.85`],
    };
  }
  return { version: 1, skills, updatedAt: new Date().toISOString() };
}

/**
 * Update with recency-weighted evidence, separating hinted vs unaided.
 * - unaided correct: +0.08*(1-difficulty)* (1-uncertainty factor), uncertainty -=0.07
 * - hinted correct: +0.03, uncertainty -=0.03
 * - incorrect: proficiency -=0.06, uncertainty +=0.04 (shorten interval)
 * Never equates fast moves alone with understanding.
 */
export function recordAttempt(learner: Learner, attempt: Attempt): Learner {
  const next: Learner = {
    ...learner,
    skills: { ...learner.skills },
    updatedAt: new Date().toISOString(),
  };
  const s = next.skills[attempt.skillId];
  if (!s) return learner;
  const ns: SkillState = { ...s, attempts: [...s.attempts, attempt], evidence: [...s.evidence] };

  if (attempt.correct && !attempt.hinted) {
    const gain = 0.08 * (1 - attempt.difficulty * 0.5) * (0.6 + ns.uncertainty * 0.4);
    ns.proficiency = clamp01(ns.proficiency + gain);
    ns.uncertainty = clamp01(ns.uncertainty - 0.11);
    ns.lastUnaidedSuccessAt = attempt.at;
    ns.evidence.push(`unaided correct d=${attempt.difficulty.toFixed(2)} p→${ns.proficiency.toFixed(2)} u→${ns.uncertainty.toFixed(2)}`);
  } else if (attempt.correct && attempt.hinted) {
    ns.proficiency = clamp01(ns.proficiency + 0.03);
    ns.uncertainty = clamp01(ns.uncertainty - 0.04);
    ns.evidence.push(`hinted correct p→${ns.proficiency.toFixed(2)} u→${ns.uncertainty.toFixed(2)}`);
  } else {
    ns.proficiency = clamp01(ns.proficiency - 0.06);
    ns.uncertainty = clamp01(ns.uncertainty + 0.04);
    ns.evidence.push(`incorrect p→${ns.proficiency.toFixed(2)} u→${ns.uncertainty.toFixed(2)}`);
  }

  next.skills[attempt.skillId] = ns;
  return next;
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

export function proficiencyWithUncertainty(s: SkillState): { p: number; u: number; label: string } {
  if (s.attempts.length < 3 || s.uncertainty > 0.55) {
    return { p: s.proficiency, u: s.uncertainty, label: "not enough data" };
  }
  return { p: s.proficiency, u: s.uncertainty, label: `${Math.round(s.proficiency * 100)}%` };
}

export function serializeLearner(l: Learner): string {
  return JSON.stringify(l);
}
export function deserializeLearner(raw: string): Learner | null {
  try {
    const j = JSON.parse(raw) as Learner;
    if (!j.skills || j.version !== 1) return null;
    return j;
  } catch {
    return null;
  }
}
