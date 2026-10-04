/**
 * Practice bank — every position verified by __tests__/practiceBank.test.ts:
 *  - mate items: the solution really is checkmate (chess.js)
 *  - material items: the move really wins material and survives any single recapture
 *  - fork items ("win2"): after the solution, EVERY opponent reply still leaves a capture worth >= 200cp
 *  - principle items: the move is legal and is the named principled move
 * Levels 1..3 per motif. White to move in all items.
 */

export type Motif = "mate" | "hanging" | "captures" | "calculation" | "endgame" | "opening";

export type BankItem = {
  id: string;
  motif: Motif;
  level: 1 | 2 | 3;
  fen: string;
  goal: string;
  /** every accepted solution, UCI (e.g. ["h1h7","h1a8"]) */
  solutions: string[];
  /** progressive hint ladder — step 1: where to look, step 2: what to see */
  steps: [string, string];
  why: string;
  verify: "mate" | "material" | "win2" | "principle";
};

export const PRACTICE_BANK: BankItem[] = [
  // ---------- MATE (checks & king safety) ----------
  {
    id: "mate-l1-backrank",
    motif: "mate", level: 1,
    fen: "7k/5ppp/8/8/8/8/8/R6K w - - 0 1",
    goal: "Checkmate in one — the black king is trapped on the back rank.",
    solutions: ["a1a8"],
    steps: [
      "Look at the black king on h8. Which squares can it run to? Its own pawns on f7, g7, h7 block three of them.",
      "The king has no escape along the 8th rank — bring your rook to it: a1 to a8.",
    ],
    why: "Ra8# is the classic back-rank mate — the pawns are the king's own prison.",
    verify: "mate",
  },
  {
    id: "mate-l1-queen-king",
    motif: "mate", level: 1,
    fen: "7k/8/6K1/8/8/8/8/7Q w - - 0 1",
    goal: "Checkmate in one — queen and king work together.",
    solutions: ["h1h7", "h1a8", "g6f7"],
    steps: [
      "Your king on g6 already guards g7, h7 and f7. The black king on h8 has almost nowhere to go.",
      "Mate here three ways: queen protected next to the king (Qh7), along the diagonal to a8 — or even walking your own king to f7.",
    ],
    why: "Qh7# (or Qa8#) — a queen supported by its own king can mate alone.",
    verify: "mate",
  },
  {
    id: "mate-l2-ladder",
    motif: "mate", level: 2,
    fen: "7k/R7/8/8/8/8/8/1R5K w - - 0 1",
    goal: "Checkmate in one — use both rooks.",
    solutions: ["b1b8"],
    steps: [
      "One rook on a7 guards the whole 7th rank — the black king can never step down to h7 or g7.",
      "Now cut the 8th rank with the other rook: b1 to b8.",
    ],
    why: "Rb8# is the two-rook ladder — each rook cuts one rank, the king has no air.",
    verify: "mate",
  },
  {
    id: "mate-l3-smothered",
    motif: "mate", level: 3,
    fen: "6rk/6pp/7N/8/8/8/8/6K1 w - - 0 1",
    goal: "Checkmate in one — the black king is smothered by its own army.",
    solutions: ["h6f7"],
    steps: [
      "The black king on h8 is completely blocked by its OWN pieces: rook on g8, pawns on g7 and h7. It cannot move at all.",
      "A knight on f7 would check h8 and nothing could take it. Jump: h6 to f7.",
    ],
    why: "Nf7# — the smothered mate: the knight checks and no piece can capture it or block it.",
    verify: "mate",
  },

  // ---------- HANGING (spotting free material) ----------
  {
    id: "hang-l1-e5",
    motif: "hanging", level: 1,
    fen: "r1bqk1nr/ppppbppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
    goal: "Black pushed the e-pawn and played a passive bishop — nobody defends e5. Win a clean pawn.",
    solutions: ["f3e5"],
    steps: [
      "Ask of every enemy piece and pawn: who defends it? Look at the pawn on e5.",
      "Nothing defends e5 — and your knight on f3 is already pointing at it.",
    ],
    why: "Nxe5 wins a clean pawn — nothing recaptures. Always check what a pawn is defended by before and after you move.",
    verify: "material",
  },
  {
    id: "hang-l2-knight-f5",
    motif: "hanging", level: 2,
    fen: "6k1/5ppp/8/5n2/8/4N3/5PPP/6K1 w - - 0 1",
    goal: "A black piece is wandering without support. Take it.",
    solutions: ["e3f5"],
    steps: [
      "The black knight on f5 has no friendly pawn or piece near it. Trace every black piece — can any of them recapture on f5?",
      "No — the g7 pawn only guards f6 and h6. Your knight on e3 can hop to f5.",
    ],
    why: "Nxf5 wins a whole knight for free. A knight on the rim or far from its pawns is often a target.",
    verify: "material",
  },
  {
    id: "hang-l3-choose",
    motif: "hanging", level: 3,
    fen: "6k1/p4ppp/3p4/r1b5/1B6/8/5PPP/6K1 w - - 0 1",
    goal: "Two black pieces sit on the light squares. Only ONE is really hanging — take the right one.",
    solutions: ["b4a5"],
    steps: [
      "Your bishop on b4 attacks both the rook on a5 and the bishop on c5. Check the defenders of each, square by square.",
      "The d6 pawn defends c5 — so capturing there just trades. Nothing at all defends a5.",
    ],
    why: "Bxa5 wins a rook! Bxc5 dxc5 would only trade. 'It looks takeable' is never enough — count the defenders.",
    verify: "material",
  },

  // ---------- CAPTURES ----------
  {
    id: "cap-l1-centre",
    motif: "captures", level: 1,
    fen: "rnbqkbnr/ppp1pppp/8/3p4/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 2",
    goal: "Black's d-pawn and your e-pawn face each other in the centre. Capture toward the centre.",
    solutions: ["e4d5"],
    steps: [
      "In the opening, when pawns face each other in the centre, look at who captures toward the centre.",
      "exd5 opens the e-file for your queen and bishop and takes space — play it.",
    ],
    why: "exd5 is the standard central capture — it opens your lines and fights for the middle.",
    verify: "principle",
  },
  {
    id: "cap-l2-pawn-takes-knight",
    motif: "captures", level: 2,
    fen: "6k1/3p1ppp/1n6/P7/8/8/5PPP/6K1 w - - 0 1",
    goal: "Your smallest piece can win a big one. Find the capture.",
    solutions: ["a5b6"],
    steps: [
      "The black knight on b6 has no a-pawn or c-pawn beside it — nothing recaptures there.",
      "Your a5 pawn attacks b6. A pawn for a knight is the best trade on the board.",
    ],
    why: "axb6 wins a knight for a pawn — 3 points for 1. Always scan for undefended enemy pieces your pawns attack.",
    verify: "material",
  },
  {
    id: "cap-l3-family-fork",
    motif: "captures", level: 3,
    fen: "4k3/ppr1qppp/8/2PP4/8/8/5PPP/3R2K1 w - - 0 1",
    goal: "One quiet pawn move attacks BOTH the black rook and the black queen at once.",
    solutions: ["d5d6"],
    steps: [
      "Look at your d5 pawn. If it stepped forward one square, which two squares would it attack?",
      "A pawn on d6 attacks c7 (rook) and e7 (queen). Whichever Black saves, you take the other — and c5 backs up d6.",
    ],
    why: "d6! is a family fork. If the queen takes on d6, cxd6 wins it; if the rook takes, cxd6 wins; if they run, you take one of them.",
    verify: "win2",
  },

  // ---------- CALCULATION (forks & forcing lines) ----------
  {
    id: "calc-l1-tension",
    motif: "calculation", level: 1,
    fen: "r2qkb1r/ppp2ppp/2n1bn2/3pp3/3PP3/2N2N2/PPP2PPP/R1BQKB1R w KQkq - 4 5",
    goal: "Pawns clash in the centre. Calculate the simplest strong capture.",
    solutions: ["e4d5"],
    steps: [
      "Count attackers and defenders of the d5 pawn — every piece that can capture, and every one that can recapture.",
      "exd5 grabs the pawn and keeps tension favourable for you.",
    ],
    why: "exd5 is the principled capture — it fixes the centre on your terms and opens lines.",
    verify: "principle",
  },
  {
    id: "calc-l2-knight-fork",
    motif: "calculation", level: 2,
    fen: "2q3k1/5ppp/8/5N2/8/8/5PPP/6K1 w - - 0 1",
    goal: "Find the knight move that attacks the black king AND the black queen at the same time.",
    solutions: ["f5e7"],
    steps: [
      "A knight fork hits two valuable targets from one square. Black king g8, black queen c8 — which square touches both?",
      "e7! From e7 a knight attacks g8 and c8. Play Ne7+ and the queen falls next move.",
    ],
    why: "Ne7+ forks king and queen. Black must answer the check — then Nxc8 wins the queen.",
    verify: "win2",
  },

  // ---------- ENDGAME ----------
  {
    id: "end-l1-promote",
    motif: "endgame", level: 1,
    fen: "8/6P1/8/8/8/8/1k6/6K1 w - - 0 1",
    goal: "Your pawn is one step from the last rank. Make a queen.",
    solutions: ["g7g8q"],
    steps: [
      "A pawn that reaches the 8th rank becomes any piece you choose — almost always a queen.",
      "The black king is on the other side of the board. Push g7 to g8 and promote.",
    ],
    why: "g8=Q turns 1 point into 9. Passed pawns far from enemy kings are gold in endgames.",
    verify: "material",
  },
  {
    id: "end-l2-rook-mate",
    motif: "endgame", level: 2,
    fen: "k7/8/1K6/8/8/8/8/7R w - - 0 1",
    goal: "Checkmate in one — king and rook against a lone king.",
    solutions: ["h1h8"],
    steps: [
      "Your king on b6 takes away a7 and b7. The black king on a8 only has the 8th rank left.",
      "Slide the rook to h8 — check along the whole rank, with no escape.",
    ],
    why: "Rh8# — the rook cuts the rank your king doesn't cover. King + rook mate by taking away squares.",
    verify: "mate",
  },
  {
    id: "end-l3-promote-mate",
    motif: "endgame", level: 3,
    fen: "7k/5Ppp/8/8/8/8/8/6K1 w - - 0 1",
    goal: "Checkmate in one — by promoting! The black king is boxed in by its own pawns.",
    solutions: ["f7f8q", "f7f8r"],
    steps: [
      "The black king on h8 is blocked by its own pawns g7 and h7 — only g8 is free.",
      "Promote on f8 with the queen (or rook!) and the whole 8th rank — including g8 — is covered. Mate.",
    ],
    why: "f8=Q# (or f8=R#) — promotion with mate. When the enemy king is smothered, a fresh queen ends it.",
    verify: "mate",
  },

  // ---------- OPENING ----------
  {
    id: "open-l1-first-move",
    motif: "opening", level: 1,
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    goal: "Make the strongest first move — fight for the centre and open lines at once.",
    solutions: ["e2e4"],
    steps: [
      "The best first moves do two jobs: claim a central square AND free a piece.",
      "1.e4 grabs e4, opens the bishop on f1 and the queen on d1.",
    ],
    why: "1.e4 opens two pieces at once and stakes a claim in the centre — the classical first move.",
    verify: "principle",
  },
  {
    id: "open-l2-develop-knight",
    motif: "opening", level: 2,
    fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
    goal: "Black answered 1.e4 with 1...e5. Develop a knight and attack the pawn you just fought for.",
    solutions: ["g1f3"],
    steps: [
      "After 1.e4 e5, don't push more pawns — bring a piece out. Which knight helps most?",
      "Nf3 develops toward the centre and attacks Black's e5 pawn.",
    ],
    why: "2.Nf3 develops a knight, fights for the centre, and puts a question to the e5 pawn.",
    verify: "principle",
  },
  {
    id: "open-l3-italian",
    motif: "opening", level: 3,
    fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
    goal: "Black defended e5 with the knight. Develop your bishop on the most active diagonal.",
    solutions: ["f1c4"],
    steps: [
      "Knights before bishops, but now the f1 bishop has a famous diagonal — the one pointing at the weakest square in Black's camp.",
      "Bc4 eyes f7, the square only Black's king defends.",
    ],
    why: "Bc4 (the Italian) develops with a threat — the f7 square. Every opening move should develop or fight for the centre.",
    verify: "principle",
  },
];

export const MOTIF_LABEL: Record<Motif, string> = {
  mate: "Checkmate patterns",
  hanging: "Spotting hanging pieces",
  captures: "Winning captures",
  calculation: "Calculation & forks",
  endgame: "Endgames",
  opening: "Opening principles",
};

export const SKILL_FOR_MOTIF2: Record<Motif, SkillIdLike> = {
  mate: "checks",
  hanging: "hanging",
  captures: "captures",
  calculation: "calculation",
  endgame: "endgame",
  opening: "opening",
};

/** minimal structural type to avoid a circular import with learnerModel */
type SkillIdLike = "checks" | "hanging" | "captures" | "calculation" | "endgame" | "opening";
