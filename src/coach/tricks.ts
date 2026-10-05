/**
 * Tricks from real games — "what to do when this happens".
 * Every line is replayed and verified by __tests__/tricks.test.ts:
 * legality of all moves, side to move at the key moment, and the outcome
 * (mate really mates / material really is won). No invented lines.
 */
import type { SkillId } from "./learnerModel";

export type Trick = {
  id: string;
  title: string;
  opening: string;
  teaser: string;
  side: "w" | "b"; // the side that plays the trick (you, at the key moment)
  skill: SkillId;
  difficulty: number; // 0..1
  minutes: number;
  moves: string[]; // full SAN line from the initial position
  keyPly: number; // index in moves — the trick move YOU must find
  keyGoal: string;
  keyHint: [string, string]; // step 1: where to look, step 2: what to see
  why: string;
  defense: string; // how NOT to fall for it
  result: string; // human summary of the outcome
  verify: "mate" | "material-w" | "material-b" | "principle";
};

export const TRICKS: Trick[] = [
  {
    id: "t-legal",
    title: "Légal's Mate — the queen is poisoned",
    opening: "Philidor Defence",
    teaser: "Black pins your knight and grabs space — the pinned piece can still move.",
    side: "w",
    skill: "checks",
    difficulty: 0.45,
    minutes: 3,
    moves: ["e4", "e5", "Nf3", "d6", "Bc4", "Bg4", "Nc3", "g6", "Nxe5", "Bxd1", "Bxf7+", "Ke7", "Nd5#"],
    keyPly: 8,
    keyGoal: "Black just pinned your knight to your queen. Break the pin with a sacrifice — win the game.",
    keyHint: [
      "A pinned piece is only pinned to what's behind it. What does your knight on f3 really attack — and is the e5 pawn actually defended?",
      "Play Nxe5! If Black grabs your queen, the king is exposed. Give the queen away on purpose.",
    ],
    why: "5.Nxe5! ignores the pin: if Black takes the queen, 6.Bxf7+ and 7.Nd5# — three minor pieces checkmate faster than a queen can save the king. If Black doesn't take, you've won a clean pawn.",
    defense: "As Black: never rely on the g4-pin before castling. After Nxe5 just take the knight (Nxe5) — you lose a pawn, not the game. Never grab the queen.",
    result: "Checkmate in 7 moves — a whole game won with 2 knights and a bishop.",
    verify: "mate",
  },
  {
    id: "t-elephant",
    title: "The Elephant Trap — the pawn was bait",
    opening: "Queen's Gambit Declined",
    teaser: "White 'wins' a pawn in the opening — and loses a knight to a between-the-moves check.",
    side: "b",
    skill: "calculation",
    difficulty: 0.5,
    minutes: 4,
    moves: ["d4", "d5", "c4", "e6", "Nc3", "Nf6", "Bg5", "Nbd7", "cxd5", "exd5", "Nxd5", "Nxd5", "Bxd8", "Bb4+", "Qd2", "Bxd2+", "Kxd2", "Kxd8"],
    keyPly: 11,
    keyGoal: "White's knight just grabbed your d5 pawn. It LOOKS like he wins a pawn — take the knight anyway!",
    keyHint: [
      "Count what happens after you take: his bishop will take your queen — but then it's YOUR move. What check do you have?",
      "Play Nxd5! After Bxd8, Bb4+ wins the queen back with a discovered attack — you come out a whole knight ahead.",
    ],
    why: "The capture order wins for Black: Nxd5 (win a knight), Bb4+ (check!), and Black regains the queen while White's pieces hang. Net: Black wins a knight for a pawn.",
    defense: "As White: never grab the d5 pawn with the knight while your queen sits on d1 and Black's bishop can check on b4. Play 6.Nf3 or 6.e3 instead — small edges, no traps.",
    result: "Black wins a knight for a pawn straight out of the opening.",
    verify: "material-b",
  },
  {
    id: "t-shilling",
    title: "The Blackburne Shilling Gambit — punish greed",
    opening: "Italian Game",
    teaser: "Black plays a dubious-looking knight move. If White grabs the pawn, mate follows.",
    side: "b",
    skill: "checks",
    difficulty: 0.6,
    minutes: 4,
    moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nd4", "Nxe5", "Qg5", "Nxf7", "Qxg2", "Rf1", "Qxe4+", "Be2", "Nf3#"],
    keyPly: 7,
    keyGoal: "White just grabbed your e5 pawn with the knight. Attack TWO weak squares at once — the pawn on g2 and the knight on e5.",
    keyHint: [
      "Which move hits two targets: something of White's on e5 AND the g2 pawn (which guards the rook's corner)?",
      "Play Qg5! The queen attacks e5 and g2. If White saves the knight, Qxg2 smashes the castle.",
    ],
    why: "4...Qg5! is the point of the 'shilling': the queen hits e5 and g2. Greedy 5.Nxf7?? loses to Qxg2 and the king can never get safe — mate arrives on f3 by the knight that was 'captured' into the attack.",
    defense: "As White: don't take the e5 pawn (Nxe5?) after 3...Nd4. Play 4.Nxd4 or 4.O-O and you're simply better. Free pawns in the opening are often priced in tricks.",
    result: "Checkmate with the humble knight — after the queen did all the damage.",
    verify: "mate",
  },
  {
    id: "t-fried-liver",
    title: "The Fried Liver — sacrifice on f7",
    opening: "Two Knights Defence",
    teaser: "f7 is the weakest square in the opening. A knight sac opens the king.",
    side: "w",
    skill: "kingSafety",
    difficulty: 0.65,
    minutes: 5,
    moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6", "Ng5", "d5", "exd5", "Nxd5", "Nxf7", "Kxf7", "Qf3+", "Ke6", "Nc3"],
    keyPly: 10,
    keyGoal: "Black's knight grabbed d5. Give up your knight on the weakest square on the board — for a raging attack.",
    keyHint: [
      "Only Black's king defends f7. Which piece can land there, and what follows with your queen?",
      "Play Nxf7! After Kxf7, Qf3+ drags the king to e6 and every white piece joins the hunt.",
    ],
    why: "5.Nxf7!? is the Fried Liver: the king must take, and then Qf3+ forces Ke6 — a king in the centre with White's whole army arriving. Black's extra piece can't defend forever.",
    defense: "As Black: don't play Nxd5 — block with Bd6 or counter with d5 properly (the safe line is 5...Na5 or 5...Bd6). Keep f7 guarded by more than the king.",
    result: "A knight for two pawns — but the exposed king usually costs Black the game.",
    verify: "principle",
  },
  {
    id: "t-petrov",
    title: "The Petrov Trap — a discovered check wins the queen",
    opening: "Russian Game",
    teaser: "Black grabs a pawn and copies moves. One discovered check takes the queen.",
    side: "w",
    skill: "calculation",
    difficulty: 0.5,
    minutes: 3,
    moves: ["e4", "e5", "Nf3", "Nf6", "Nxe5", "Nxe4", "Qe2", "Nf6", "Nc6+", "Be7", "Nxd8", "Kxd8"],
    keyPly: 8,
    keyGoal: "Black moved his knight BACK — away from your queen's file. Find the knight move that checks AND attacks the queen at the same time.",
    keyHint: [
      "Your queen on e2 stares down the e-file at the king on e8 — blocked only by your own knight on e5. Where can that knight go with check?",
      "Play Nc6+! It's a DISCOVERED check from the queen, and the knight lands attacking the queen on d8.",
    ],
    why: "5.Nc6+ is a discovered check: the knight clears the e-file and attacks d8 at once. Black must block with Be7, and Nxd8 wins the queen. Black's 'free pawn' cost the queen for a knight.",
    defense: "As Black: after Qe2 don't retreat the knight — play d5 or d6 to block the file, or 5...Qe7. Copy-cat moves in the opening invite exactly this.",
    result: "White wins the queen for a knight by move six.",
    verify: "material-w",
  },
  {
    id: "t-scholar",
    title: "Scholar's Mate — the 4-move checkmate",
    opening: "King's Pawn",
    teaser: "The most famous beginner trap: queen and bishop gang up on f7.",
    side: "w",
    skill: "checks",
    difficulty: 0.2,
    minutes: 2,
    moves: ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"],
    keyPly: 6,
    keyGoal: "Your queen and bishop both aim at the weakest square on Black's side. End the game in one move.",
    keyHint: [
      "f7 is defended only by the king. Which of your pieces attacks it right now?",
      "Play Qxf7# — the queen lands supported by the bishop on c4. Checkmate.",
    ],
    why: "Qxf7# works because the bishop on c4 protects the queen — the king can't take and has no escape. Two pieces attacking one weak square is the simplest mating pattern in chess.",
    defense: "As Black: 3...Nf6?? walks into it — defend f7 first with Qe7, g6, or play Nc6 and be ready with Qe7. If someone tries this on you, one calm move and YOU are better.",
    result: "Checkmate in four moves — and how to stop it cold.",
    verify: "mate",
  },
];

/* ------------------------------ persistence ------------------------------ */

const KEY = "cwm:tricks:v1";

export type TrickDone = { id: string; completedAt: string };

export function loadTrickDone(): TrickDone[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as { version: 1; done: TrickDone[] };
      if (p && p.version === 1 && Array.isArray(p.done)) return p.done;
    }
  } catch { /* fresh */ }
  return [];
}

export function saveTrickDone(done: TrickDone[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, done }));
  } catch { /* storage blocked — progress lives for this session */ }
}

export function isTrickDone(done: TrickDone[], id: string): boolean {
  return done.some((d) => d.id === id);
}

export function nextTrick(done: TrickDone[]): Trick {
  return TRICKS.find((t) => !isTrickDone(done, t.id)) ?? TRICKS[0];
}
