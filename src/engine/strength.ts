/** Reproducible settings, NOT calibrated Elo or a promise of move-by-move ordering. */
export type StrengthProfile = Readonly<{
  strength: number;
  skill: number;
  depth: number;
  nodes: number;
  moveTimeMs: number;
}>;

export const STRENGTH_PROFILES: readonly StrengthProfile[] = Object.freeze([
  { strength: 1, skill: 0, depth: 4, nodes: 2_000, moveTimeMs: 80 },
  { strength: 2, skill: 2, depth: 5, nodes: 5_000, moveTimeMs: 120 },
  { strength: 3, skill: 4, depth: 6, nodes: 10_000, moveTimeMs: 180 },
  { strength: 4, skill: 6, depth: 7, nodes: 20_000, moveTimeMs: 250 },
  { strength: 5, skill: 8, depth: 8, nodes: 40_000, moveTimeMs: 350 },
  { strength: 6, skill: 10, depth: 9, nodes: 80_000, moveTimeMs: 500 },
  { strength: 7, skill: 12, depth: 10, nodes: 120_000, moveTimeMs: 700 },
  { strength: 8, skill: 15, depth: 12, nodes: 180_000, moveTimeMs: 950 },
  { strength: 9, skill: 18, depth: 14, nodes: 260_000, moveTimeMs: 1_250 },
  { strength: 10, skill: 20, depth: 16, nodes: 400_000, moveTimeMs: 1_600 },
].map((profile) => Object.freeze(profile)));

export function normalizeStrength(strength: number | undefined): number {
  return Number.isFinite(strength) ? Math.max(1, Math.min(10, Math.round(strength!))) : 5;
}

export function strengthProfile(strength?: number): StrengthProfile {
  return STRENGTH_PROFILES[normalizeStrength(strength) - 1];
}

export function legacyStrength(level?: "gentle" | "steady" | "sharp"): number {
  return level === "gentle" ? 2 : level === "sharp" ? 9 : 5;
}
