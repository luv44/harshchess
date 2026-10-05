import type { JSX } from "react";
export function Icon({ d, size = 18, label }: { d: string; size?: number; label?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden={label ? undefined : true} aria-label={label} role={label ? "img" : undefined} style={{ flexShrink: 0 }}>
      <path d={d} stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
export const Paths = {
  home: "M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z",
  board: "M4 4h16v16H4z M4 8h16 M4 12h16 M4 16h16 M8 4v16 M12 4v16 M16 4v16",
  play: "M8 5.5l10 6.5-10 6.5z M4 4h2v16H4z",
  book: "M5 5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v14l-5-2.5L8 19V5a2 2 0 0 0-2 2v10",
  brain: "M12 3a7 7 0 0 0-4 12.7V20h8v-4.3A7 7 0 0 0 12 3Z M9 8h6 M9 12h6",
  games: "M6 7h12 M6 12h12 M6 17h12 M9 7l-1 10 M15 7l1 10",
  flip: "M7 7h10l-3-3 M17 17H7l3 3 M7 7a5 5 0 0 0 0 10 M17 17a5 5 0 0 0 0-10",
  undo: "M9 8H5V4 M5 8a7 7 0 1 0 2-5",
  plus: "M12 5v14 M5 12h14",
  hint: "M12 7a3 3 0 0 1 2.5 4.7c-.5.7-1 1-1.5 1.8-.4.6-.5 1-.5 1.5 M12 17h.01",
  check: "M5 13l4 4L19 7",
  warn: "M12 7v7 M12 17h.01 M10.3 3.3l-7 12A1 1 0 0 0 4.2 17h15.6a1 1 0 0 0 .9-1.7l-7-12a1 1 0 0 0-1.8 0Z",
};
