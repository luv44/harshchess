import { useMemo, useState } from "react";
import { SUPPORTED_LANGUAGES } from "./languages";

export function LanguagePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (tag: string) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return SUPPORTED_LANGUAGES;
    return SUPPORTED_LANGUAGES.filter(
      (l) => l.tag.toLowerCase().includes(needle) || l.nameOwn.toLowerCase().includes(needle) || l.nameEn.toLowerCase().includes(needle),
    );
  }, [q]);

  return (
    <div className="lang-picker" role="region" aria-label="Language picker">
      <label className="lang-picker__label" htmlFor="lang-search">
        Choose your learning language
      </label>
      <input
        id="lang-search"
        className="lang-picker__search"
        placeholder="Search language… (e.g. हिन्दी, العربية, Español)"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search languages"
      />
      <div className="lang-picker__grid" role="listbox" aria-label="Supported languages">
        {filtered.map((l) => (
          <button
            key={l.tag}
            role="option"
            aria-selected={value === l.tag}
            className={`lang-picker__item ${value === l.tag ? "lang-picker__item--active" : ""}`}
            onClick={() => onChange(l.tag)}
          >
            <span className="lang-picker__name" lang={l.tag} dir={l.dir}>
              {l.nameOwn}
            </span>
            <span className="lang-picker__meta">
              {l.tag} · {l.script} · {l.dir.toUpperCase()}
            </span>
          </button>
        ))}
        {filtered.length === 0 && <p className="lang-picker__empty">No match — try English, हिन्दी, العربية, 日本語…</p>}
      </div>
      <p className="lang-picker__hint">Language names shown in their own scripts. Your choice is saved locally and with your account when sync lands. Move coordinates, FEN/UCI and engine scores stay canonical.</p>
    </div>
  );
}
