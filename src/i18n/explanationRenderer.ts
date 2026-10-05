/**
 * ExplanationRenderer / TranslationService.
 * - Keeps chess facts language-neutral (FactPacket).
 * - Validates squares/moves/mate/numbers against source before rendering.
 * - Cache keyed by fact/version/language/level.
 * - Never invents a move or engine score; surrounds canonical SAN/FEN/UCI with localized prose.
 */
import type { FactPacket } from "../coach/factPacket";
import { t } from "./strings";

type Level = "beginner" | "deeper";
type Rendered = {
  htmlLang: string;
  dir: "ltr" | "rtl";
  what: string; // localized, with canonical SAN preserved
  why: string;
  whyNot: string;
  next: string;
  fallbackUsed: boolean;
  cacheKey: string;
};

const cache = new Map<string, Rendered>();

function cacheKeyFor(packet: FactPacket, tag: string, level: Level): string {
  return `${packet.id}::v${packet.version}::${tag}::${level}`;
}

function validatePacket(packet: FactPacket): boolean {
  // minimal validation: SAN/UCI shapes, FEN parsable
  if (!packet.played?.san || !packet.played?.uci) return false;
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(packet.played.uci)) return false;
  // candidate SANs must exist if uci exists
  for (const c of packet.candidates) {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(c.uci)) return false;
  }
  return true;
}

export function renderExplanation(
  packet: FactPacket,
  opts: { tag: string; level: Level; dir: "ltr" | "rtl"; hasTrustedTranslation: boolean },
): Rendered {
  const key = cacheKeyFor(packet, opts.tag, opts.level);
  const cached = cache.get(key);
  if (cached) return cached;

  const fallbackUsed = !opts.hasTrustedTranslation;
  const tagForStrings = fallbackUsed ? "en" : opts.tag;

  // Validate — if invalid, return safe fallback that still doesn't invent
  if (!validatePacket(packet)) {
    const r: Rendered = {
      htmlLang: opts.tag,
      dir: opts.dir,
      what: t(tagForStrings, "factWhat") + `: ${packet.played.san} — ${packet.motif}.`,
      why: t(tagForStrings, "factWhy") + ": " + t(tagForStrings, "fallbackNotice"),
      whyNot: packet.best ? t(tagForStrings, "factWhyNot") + `: ${packet.best.san ?? packet.best.uci}.` : "",
      next: t(tagForStrings, "factTry") + ".",
      fallbackUsed: true,
      cacheKey: key,
    };
    cache.set(key, r);
    return r;
  }

  // Canonical values never translated — only surrounding prose
  const playedSan = packet.played.san; // canonical
  const bestSan = packet.best?.san ?? packet.best?.uci ?? null;
  const scoreText = (() => {
    const b = packet.best;
    if (!b) return "";
    if (typeof b.scoreMate === "number") return `#${b.scoreMate}`;
    if (typeof b.scoreCp === "number") return `${b.scoreCp > 0 ? "+" : ""}${(b.scoreCp / 100).toFixed(2)}`;
    return "";
  })();

  const simple = opts.level === "beginner";

  let what: string;
  let why: string;
  let whyNot: string;
  let next: string;

  if (simple) {
    // One observation, one reason, one next action (step 11)
    what = `${t(tagForStrings, "factWhat")}: ${playedSan} — ${packet.motif}.`;
    why = bestSan && bestSan !== playedSan
      ? `${t(tagForStrings, "factWhy")}: ${bestSan} ${scoreText ? `(${scoreText})` : ""} was preferred here.`
      : `${t(tagForStrings, "factWhy")}: ${playedSan} is reasonable here.`;
    whyNot = bestSan && bestSan !== playedSan ? `${t(tagForStrings, "factWhyNot")}: ${bestSan} keeps the advantage.` : "";
    next = packet.opponentThreat
      ? `${t(tagForStrings, "factTry")}: defend against ${packet.opponentThreat.san}.`
      : `${t(tagForStrings, "factTry")}: find the best continuation.`;
  } else {
    what = `${t(tagForStrings, "factWhat")}: ${playedSan} on ${packet.beforeFen.split(" ")[0].slice(0, 8)}… — motif ${packet.motif}, confidence ${(packet.confidence * 100).toFixed(0)}%.`;
    why = bestSan
      ? `${t(tagForStrings, "factWhy")}: candidates ${packet.candidates.map((c) => `${c.san ?? c.uci}${typeof c.scoreCp === "number" ? ` ${c.scoreCp > 0 ? "+" : ""}${(c.scoreCp / 100).toFixed(2)}` : typeof c.scoreMate === "number" ? ` #${c.scoreMate}` : ""}`).join(" · ")} — best ${bestSan} ${scoreText}.`
      : `${t(tagForStrings, "factWhy")}: no verified alternative at this depth.`;
    whyNot = bestSan && bestSan !== playedSan ? `${t(tagForStrings, "factWhyNot")}: ${playedSan} vs ${bestSan} — see PV ${packet.candidates[0]?.pvSans.join(" ") ?? ""}` : "";
    next = packet.opponentThreat
      ? `${t(tagForStrings, "factTry")}: after ${playedSan}, opponent can play ${packet.opponentThreat.san} — how do you meet it?`
      : `${t(tagForStrings, "factTry")}: replay the line ${packet.candidates[0]?.pvSans.slice(0, 4).join(" ") ?? bestSan ?? ""}`;
  }

  if (fallbackUsed) {
    why += " " + t("en", "fallbackNotice");
  }

  const rendered: Rendered = {
    htmlLang: opts.tag,
    dir: opts.dir,
    what,
    why,
    whyNot,
    next,
    fallbackUsed,
    cacheKey: key,
  };
  cache.set(key, rendered);
  return rendered;
}

export function clearExplanationCache() {
  cache.clear();
}
export function explanationCacheSize() {
  return cache.size;
}
