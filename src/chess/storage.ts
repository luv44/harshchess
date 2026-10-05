const KEY = "chessworkermind:freeGame:v1";

export type SavedGame = {
  fen: string;
  pgn: string;
  orientation: "w" | "b";
  updatedAt: string;
};

export function loadSavedGame(): SavedGame | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedGame;
    if (typeof parsed.fen !== "string" || typeof parsed.pgn !== "string") return null;
    if (parsed.orientation !== "w" && parsed.orientation !== "b") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveGame(game: SavedGame): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(game));
  } catch {
    // storage full or blocked (e.g. private mode) — non-fatal for Free board
  }
}

export function clearSavedGame(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export const STORAGE_KEY = KEY;
