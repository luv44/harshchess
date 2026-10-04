import { useCallback, useEffect, useState } from "react";
import { dirFor, isSupported, suggestBrowserLanguage } from "./languages";

const LS_KEY = "chessworkermind:lang:v1";
const LS_LEVEL = "chessworkermind:langLevel:v1";

export type LangLevel = "beginner" | "deeper";

export function useLanguage() {
  const [tag, setTagState] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved && isSupported(saved)) return saved;
    } catch {}
    return suggestBrowserLanguage();
  });
  const [level, setLevelState] = useState<LangLevel>(() => {
    try {
      const v = localStorage.getItem(LS_LEVEL);
      if (v === "beginner" || v === "deeper") return v;
    } catch {}
    return "beginner";
  });

  const setTag = useCallback((next: string) => {
    if (!isSupported(next)) return;
    setTagState(next);
    try {
      localStorage.setItem(LS_KEY, next);
    } catch {}
    document.documentElement.lang = next;
    document.documentElement.dir = dirFor(next);
  }, []);

  const setLevel = useCallback((next: LangLevel) => {
    setLevelState(next);
    try {
      localStorage.setItem(LS_LEVEL, next);
    } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.lang = tag;
    document.documentElement.dir = dirFor(tag);
  }, [tag]);

  return { tag, dir: dirFor(tag), setTag, level, setLevel };
}
