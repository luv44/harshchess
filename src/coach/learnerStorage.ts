import { createLearner, deserializeLearner, serializeLearner, type Learner } from "./learnerModel";
import { createReviewItem, type ReviewItem } from "./spaced";

const LEARNER_KEY = "chessworkermind:learner:v1";
const REVIEWS_KEY = "chessworkermind:reviews:v1";
const PROGRESS_KEY = "chessworkermind:progress:v1";

export function loadLearner(): Learner {
  try {
    const raw = localStorage.getItem(LEARNER_KEY);
    if (raw) {
      const l = deserializeLearner(raw);
      if (l) return l;
    }
  } catch {}
  return createLearner();
}

export function saveLearner(l: Learner): void {
  try {
    localStorage.setItem(LEARNER_KEY, serializeLearner(l));
  } catch {}
}

export function loadReviews(): ReviewItem[] {
  try {
    const raw = localStorage.getItem(REVIEWS_KEY);
    if (raw) return JSON.parse(raw) as ReviewItem[];
  } catch {}
  return [];
}

export function saveReviews(items: ReviewItem[]): void {
  try {
    localStorage.setItem(REVIEWS_KEY, JSON.stringify(items));
  } catch {}
}

export function ensureReviewForSkill(skillId: string, nowIso: string): ReviewItem {
  const items = loadReviews();
  const found = items.find((r) => r.skillId === skillId);
  if (found) return found;
  const created = createReviewItem(skillId, nowIso);
  saveReviews([...items, created]);
  return created;
}

export type DailyProgress = {
  date: string; // YYYY-MM-DD
  reviewsDone: number;
  lessonsDone: number;
  transferDone: number;
};

export function loadDailyProgress(): DailyProgress | null {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw) return JSON.parse(raw) as DailyProgress;
  } catch {}
  return null;
}
export function saveDailyProgress(p: DailyProgress): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {}
}
