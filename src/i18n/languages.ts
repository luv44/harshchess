/**
 * Supported languages — names in own scripts, BCP47 tags, direction.
 * Adding a language does not change chess logic (FactPacket is language-neutral).
 */
export type SupportedLanguage = {
  tag: string; // BCP47
  nameOwn: string; // shown in picker in its own script
  nameEn: string;
  dir: "ltr" | "rtl";
  script: "Latin" | "Devanagari" | "Arabic" | "CJK" | "Other";
};

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { tag: "en", nameOwn: "English", nameEn: "English", dir: "ltr", script: "Latin" },
  { tag: "es-MX", nameOwn: "Español — México", nameEn: "Spanish (Mexico)", dir: "ltr", script: "Latin" },
  { tag: "hi", nameOwn: "हिन्दी", nameEn: "Hindi", dir: "ltr", script: "Devanagari" },
  { tag: "ar", nameOwn: "العربية", nameEn: "Arabic", dir: "rtl", script: "Arabic" },
  { tag: "zh-Hant", nameOwn: "中文（繁體）", nameEn: "Chinese (Traditional)", dir: "ltr", script: "CJK" },
  { tag: "ja", nameOwn: "日本語", nameEn: "Japanese", dir: "ltr", script: "CJK" },
  { tag: "sw", nameOwn: "Kiswahili", nameEn: "Swahili", dir: "ltr", script: "Latin" },
  { tag: "fr", nameOwn: "Français", nameEn: "French", dir: "ltr", script: "Latin" },
];

export function isSupported(tag: string): boolean {
  return SUPPORTED_LANGUAGES.some((l) => l.tag === tag);
}

export function getLanguage(tag: string): SupportedLanguage | null {
  return SUPPORTED_LANGUAGES.find((l) => l.tag === tag) ?? null;
}

export function dirFor(tag: string): "ltr" | "rtl" {
  return getLanguage(tag)?.dir ?? "ltr";
}

export function suggestBrowserLanguage(): string {
  if (typeof navigator === "undefined") return "en";
  const cand = navigator.language || (navigator as unknown as { userLanguage?: string }).userLanguage || "en";
  // exact match or base language fallback
  if (isSupported(cand)) return cand;
  const base = cand.split("-")[0];
  const match = SUPPORTED_LANGUAGES.find((l) => l.tag.split("-")[0] === base);
  return match ? match.tag : "en";
}
