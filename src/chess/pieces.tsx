import type { JSX } from "react";
import { useId } from "react";

/**
 * Chessworkermind — original cohesive vector piece family.
 * One family for all 12 pieces, 45x45 viewBox, consistent scale/baseline/weight.
 * White: warm ivory fill (#FFFBF0) with espresso stroke; Black: espresso fill (#2B1B0E) with ivory stroke.
 * No Unicode glyphs, no emoji — same family on board, promotion, mini-boards.
 * Licensed as part of this project (original vectors, no external asset dependency).
 */
type PieceColor = "w" | "b";
type PieceKind = "k" | "q" | "r" | "b" | "n" | "p";

const W_FILL = "#FFFBF0";
const W_STROKE = "#2B1B0E";
const B_FILL = "#2B1B0E";
const B_STROKE = "#FFF1D6";
const W_ACCENT = "#E8D9C0";
const B_ACCENT = "#8C6B3A";

/**
 * Piece height hierarchy — a real chess set is readable at a glance because a
 * pawn is clearly shorter than a king. Measured bbox heights in the 45x45 box
 * were nearly equal (pawn 35.4 vs king 38.5), so every piece is scaled about a
 * shared baseline anchor. Heights come out at roughly:
 *   king 1.00  queen 0.95  bishop 0.90  knight 0.84  rook 0.79  pawn 0.72
 */
const BASE = { x: 22.5, y: 40.7 };
const atBase = (scale: number) =>
  `translate(${BASE.x} ${BASE.y}) scale(${scale}) translate(${-BASE.x} ${-BASE.y})`;

function PieceFrame({ children, color }: { children: JSX.Element; color: PieceColor }) {
  const isW = color === "w";
  const fid = useId().replace(/:/g, "_");
  const filterId = `ps-${color}-${fid}`;
  return (
    <svg viewBox="0 0 45 45" role="img" aria-hidden="true" className={`piece-svg piece-svg--${color}`} width="100%" height="100%" style={{ display: "block", overflow: "visible" }}>
      <defs>
        <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.2" stdDeviation="0.9" floodOpacity={isW ? 0.18 : 0.28} />
        </filter>
      </defs>
      <g filter={`url(#${filterId})`} strokeLinejoin="round" strokeLinecap="round">
        {children}
      </g>
    </svg>
  );
}

function King({ color }: { color: PieceColor }) {
  const f = color === "w" ? W_FILL : B_FILL;
  const s = color === "w" ? W_STROKE : B_STROKE;
  const sw = 1.35;
  return (
    <PieceFrame color={color}>
      <g transform={atBase(1)}>
      <g fill={f} stroke={s} strokeWidth={sw}>
        {/* cross */}
        <rect x={21} y={2.5} width={3} height={8} rx={1} />
        <rect x={18} y={4.6} width={9} height={3} rx={1} />
        {/* crown */}
        <path d="M12 15 L15.2 7.5 L19 11.5 L22.5 5.8 L26 11.5 L29.8 7.5 L33 15 Z" />
        <rect x={14.2} y={15} width={16.6} height={2.7} rx={1.2} />
        {/* collar + body */}
        <path d="M16.5 18.2 H28.5 L27 22.2 H18 Z" fill={color === "w" ? W_ACCENT : B_ACCENT} stroke={s} />
        <path d="M15.5 22.2 L18.8 31.2 L16.2 34.6 H28.8 L26.2 31.2 L29.5 22.2 Z" />
        {/* base */}
        <rect x={13.2} y={34.6} width={18.6} height={3.4} rx={1.4} />
        <ellipse cx={22.5} cy={39.2} rx={11.2} ry={1.8} fill={f} stroke={s} strokeWidth={1.1} />
        {/* detail dot */}
        <circle cx={22.5} cy={10.2} r={1.1} fill={s} stroke="none" />
      </g>
      </g>
    </PieceFrame>
  );
}
function Queen({ color }: { color: PieceColor }) {
  const f = color === "w" ? W_FILL : B_FILL;
  const s = color === "w" ? W_STROKE : B_STROKE;
  return (
    <PieceFrame color={color}>
      <g transform={atBase(0.97)}>
      <g fill={f} stroke={s} strokeWidth={1.35}>
        <circle cx={22.5} cy={5.2} r={2.2} />
        <path d="M13.5 13.5 L16 7 L20.2 11.2 L22.5 5.5 L24.8 11.2 L29 7 L31.5 13.5 Z" />
        <rect x={14.8} y={13.5} width={15.4} height={2.6} rx={1.2} />
        <path d="M17 16.4 H28 L26.4 20.8 H18.6 Z" fill={color === "w" ? W_ACCENT : B_ACCENT} stroke={s} />
        <path d="M15.8 20.8 L19.2 30.2 L16.4 34.2 H28.6 L25.8 30.2 L29.2 20.8 Z" />
        <rect x={13.6} y={34.2} width={17.8} height={3.4} rx={1.4} />
        <ellipse cx={22.5} cy={39} rx={10.8} ry={1.7} fill={f} stroke={s} strokeWidth={1.1} />
      </g>
      </g>
    </PieceFrame>
  );
}
function Rook({ color }: { color: PieceColor }) {
  const f = color === "w" ? W_FILL : B_FILL;
  const s = color === "w" ? W_STROKE : B_STROKE;
  return (
    <PieceFrame color={color}>
      <g transform={atBase(0.95)}>
      <g fill={f} stroke={s} strokeWidth={1.35}>
        {/* crenellations */}
        <path d="M13 8.5 H15.8 V12 H18.2 V8.5 H21 V12 H24 V8.5 H26.8 V12 H29.2 V8.5 H32 V14.5 H13 Z" />
        <rect x={15.5} y={14.5} width={14} height={3.2} rx={1} />
        {/* body taper */}
        <path d="M16.8 17.7 L16 27.5 L18.2 30.8 L17 34.2 H28 L25.8 30.8 L28 27.5 L27.2 17.7 Z" />
        <rect x={14} y={34.2} width={17} height={3.4} rx={1.4} />
        <ellipse cx={22.5} cy={39} rx={10.5} ry={1.7} fill={f} stroke={s} strokeWidth={1.1} />
        {/* horizontal lines */}
        <path d="M16.2 21.5 H28.8" strokeWidth={0.9} opacity={0.9} />
        <path d="M15.8 27 H29.2" strokeWidth={0.9} opacity={0.9} />
      </g>
      </g>
    </PieceFrame>
  );
}
function Bishop({ color }: { color: PieceColor }) {
  const f = color === "w" ? W_FILL : B_FILL;
  const s = color === "w" ? W_STROKE : B_STROKE;
  return (
    <PieceFrame color={color}>
      <g transform={atBase(0.92)}>
      <g fill={f} stroke={s} strokeWidth={1.35}>
        <circle cx={22.5} cy={5} r={2} />
        {/* mitre */}
        <path d="M18.2 7.8 L22.5 12.2 L26.8 7.8 L27.6 14.2 L22.5 16.8 L17.4 14.2 Z" />
        <path d="M18.6 14.2 L22.5 16.8 L26.4 14.2 L24.6 18.4 H20.4 Z" fill={color === "w" ? W_ACCENT : B_ACCENT} stroke={s} />
        {/* body */}
        <path d="M17.5 18.4 L15.6 28.6 L18.4 31.2 L16.6 34.2 H28.4 L26.6 31.2 L29.4 28.6 L27.5 18.4 Z" />
        <rect x={14.2} y={34.2} width={16.6} height={3.4} rx={1.4} />
        <ellipse cx={22.5} cy={39} rx={10.4} ry={1.7} fill={f} stroke={s} strokeWidth={1.1} />
        {/* slit */}
        <path d="M22.5 13.6 V27.2" strokeWidth={0.9} opacity={0.95} />
      </g>
      </g>
    </PieceFrame>
  );
}
function Knight({ color }: { color: PieceColor }) {
  const f = color === "w" ? W_FILL : B_FILL;
  const s = color === "w" ? W_STROKE : B_STROKE;
  return (
    <PieceFrame color={color}>
      <g transform={atBase(0.97)}>
      <g fill={f} stroke={s} strokeWidth={1.35}>
        {/* horse head profile — must be unmistakable */}
        <path d="M15.2 14.8 L17 9.2 L19.8 7.2 L22.2 9.6 L26.2 10.2 L29.6 13.8 L30.4 18.6 L28.8 22.2 L26 24.8 L21.8 26.2 L19.2 27.8 L16.4 26.6 L15 22.8 L15.2 14.8 Z" />
        {/* snout */}
        <path d="M27.8 16.2 L30.6 17.4 L29.4 19.8 L27 19.2 Z" fill={color === "w" ? W_ACCENT : B_ACCENT} stroke={s} />
        {/* ear */}
        <path d="M18.8 8.8 L19.6 11.2 L17.6 11 Z" fill={s} stroke="none" />
        {/* eye */}
        <circle cx={23.4} cy={13.8} r={1.15} fill={s} stroke="none" />
        <circle cx={23.7} cy={13.6} r={0.38} fill={f} stroke="none" />
        {/* mane */}
        <path d="M16.2 12.2 C14.6 14.6 15 18.2 16.8 21" fill="none" stroke={s} strokeWidth={1.05} />
        <path d="M17.2 14.2 C16 15.8 16.2 18 17.6 19.6" fill="none" stroke={s} strokeWidth={0.8} opacity={0.85} />
        {/* neck / base */}
        <path d="M16.4 26.6 L19.6 31.4 L17.8 34.2 H28.2 L26.6 31.4 L28.8 26.8 L26 24.8 L21.8 26.2 Z" />
        <rect x={14.6} y={34.2} width={15.8} height={3.3} rx={1.4} />
        <ellipse cx={22.5} cy={39} rx={10.2} ry={1.7} fill={f} stroke={s} strokeWidth={1.1} />
      </g>
      </g>
    </PieceFrame>
  );
}
function Pawn({ color }: { color: PieceColor }) {
  const f = color === "w" ? W_FILL : B_FILL;
  const s = color === "w" ? W_STROKE : B_STROKE;
  return (
    <PieceFrame color={color}>
      <g transform={atBase(0.78)}>
      <g fill={f} stroke={s} strokeWidth={1.35}>
        <circle cx={22.5} cy={9.4} r={4.2} />
        <rect x={20.2} y={13.2} width={4.6} height={2.8} rx={1} />
        <path d="M17.8 16 L19.6 22.6 L15.8 28.2 L17.4 31.6 L15 34.2 H30 L27.6 31.6 L29.2 28.2 L25.4 22.6 L27.2 16 Z" />
        <rect x={15.2} y={34.2} width={14.6} height={3.2} rx={1.4} />
        <ellipse cx={22.5} cy={39} rx={9.4} ry={1.6} fill={f} stroke={s} strokeWidth={1.1} />
      </g>
      </g>
    </PieceFrame>
  );
}

const MAP: Record<string, (props: { color: PieceColor }) => JSX.Element> = {
  "w:k": King, "b:k": King,
  "w:q": Queen, "b:q": Queen,
  "w:r": Rook, "b:r": Rook,
  "w:b": Bishop, "b:b": Bishop,
  "w:n": Knight, "b:n": Knight,
  "w:p": Pawn, "b:p": Pawn,
};

export function PieceSvg({ color, type, size }: { color: PieceColor; type: PieceKind; size?: number }) {
  const Key = `${color}:${type}`;
  const C = MAP[Key];
  if (!C) return null;
  return <span className="piece-svg-wrap" style={{ width: size ?? "100%", height: size ?? "100%", display: "block" }}><C color={color} /></span>;
}

export function pieceKey(color: PieceColor, type: PieceKind) { return `${color}:${type}` as const; }
