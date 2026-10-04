/** UCI info parsing — kept tiny and testable; never invents moves/scores. */

export type ParsedInfo = {
  depth: number;
  multipv: number;
  scoreCp?: number;
  scoreMate?: number;
  pv: string[]; // UCI moves like e2e4, e7e5, g1f3 ... first is candidate
  raw: string;
};

const INFO_RE = /info\s+depth\s+(\d+).*score\s+(cp|mate)\s+(-?\d+).*pv\s+(.+)$/;
const SIMPLE_SCORE_RE = /score\s+(cp|mate)\s+(-?\d+)/;
const MULTIPV_RE = /multipv\s+(\d+)/;
const DEPTH_RE = /depth\s+(\d+)/;
const PV_RE = /\bpv\s+(.+)$/;

export function parseInfoLine(line: string): ParsedInfo | null {
  if (!line.startsWith("info ")) return null;
  if (line.includes(" string ") || line.includes(" currmove ") || line.includes(" currmovenumber ")) return null;
  // minimal filter — we only care about lines with pv
  if (!line.includes(" pv ")) return null;
  const scoreM = line.match(SIMPLE_SCORE_RE);
  const depthM = line.match(DEPTH_RE);
  const mvM = line.match(MULTIPV_RE);
  const pvM = line.match(PV_RE);
  if (!scoreM || !depthM || !pvM) return null;
  const depth = Number(depthM[1]);
  const multipv = mvM ? Number(mvM[1]) : 1;
  const pv = pvM[1].trim().split(/\s+/).filter(Boolean);
  if (pv.length === 0) return null;
  if (scoreM[1] === "cp") {
    return { depth, multipv, scoreCp: Number(scoreM[2]), pv, raw: line };
  }
  return { depth, multipv, scoreMate: Number(scoreM[2]), pv, raw: line };
}

export function scoreToText(info: ParsedInfo): string {
  if (typeof info.scoreMate === "number") {
    return info.scoreMate > 0 ? `#${info.scoreMate}` : `#${info.scoreMate}`;
  }
  if (typeof info.scoreCp === "number") {
    const sign = info.scoreCp > 0 ? "+" : "";
    return `${sign}${(info.scoreCp / 100).toFixed(2)}`;
  }
  return "—";
}

/** UCI move like e2e4 or e7e8q -> {from,to,promotion} — caller validates legality via chess.js */
export function splitUci(uci: string): { from: string; to: string; promotion?: string } | null {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null;
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4) || undefined };
}
