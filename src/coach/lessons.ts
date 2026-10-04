/**
 * Chessworkermind — beginner course.
 * Real, playable lessons: each has explanation steps (with a live board) and
 * most end with a drill the learner must actually play on the board.
 * Completion is stored locally — no invented progress.
 */

export type LessonStep = {
  heading: string;
  text: string;
  /** Optional board shown for this step (defaults to the previous step's fen). */
  fen?: string;
  /** Squares to point out on the board (soft highlight). */
  highlight?: string[];
};

export type Drill = {
  fen: string;
  goal: string;
  /** The move that completes the drill, in UCI (e2e4, e1g1, a7a8q…). */
  bestUci: string;
  hint: string;
  /** Plain-language reason, shown after success. */
  why: string;
};

export type Lesson = {
  id: string;
  title: string;
  blurb: string;
  minutes: number;
  steps: LessonStep[];
  drill?: Drill;
};

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const LESSONS: Lesson[] = [
  {
    id: "l-board",
    title: "The chessboard",
    blurb: "Files, ranks, and how every square got its name.",
    minutes: 2,
    steps: [
      {
        heading: "8 by 8",
        text: "The board is a grid of 64 squares, set up so each player has a light square in the bottom-right corner. White pieces always start on ranks 1 and 2; Black on ranks 7 and 8.",
        fen: START_FEN,
      },
      {
        heading: "Files are columns",
        text: "The vertical columns are called files, named a to h from left to right (from White's side). The e-file runs through both kings.",
        fen: START_FEN,
        highlight: ["e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8"],
      },
      {
        heading: "Ranks are rows",
        text: "The horizontal rows are ranks, numbered 1 to 8 from White's side. Every square has a name: file letter + rank number. The White king starts on e1, the Black king on e8.",
        fen: START_FEN,
        highlight: ["e1", "e8"],
      },
    ],
  },
  {
    id: "l-pawns",
    title: "How pawns move",
    blurb: "Forward one (or two), capture diagonally.",
    minutes: 3,
    steps: [
      {
        heading: "The foot soldier",
        text: "Pawns move straight forward one square. From their starting rank they may advance two squares at once — a favourite way to grab space in the centre.",
        fen: START_FEN,
      },
      {
        heading: "Pawns capture sideways",
        text: "Pawns never capture straight ahead — they take diagonally, one square forward-left or forward-right. That shape is why pawn structures create 'chains'.",
        fen: "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2",
        highlight: ["e4", "d5"],
      },
    ],
    drill: {
      fen: START_FEN,
      goal: "Push your e-pawn two squares forward — from e2 to e4.",
      bestUci: "e2e4",
      hint: "Tap the pawn in front of your king (e2), then tap the highlighted square e4.",
      why: "1.e4 opens lines for your bishop and queen and stakes a claim in the centre — the classic first move.",
    },
  },
  {
    id: "l-knights",
    title: "How knights move",
    blurb: "The L-shape that jumps over everything.",
    minutes: 3,
    steps: [
      {
        heading: "Two and one",
        text: "A knight moves two squares in one direction and then one square sideways — an L-shape. From g1 a knight can reach f3, h3, or e2.",
        fen: START_FEN,
        highlight: ["g1", "f3", "h3", "e2"],
      },
      {
        heading: "It jumps",
        text: "The knight is the only piece that jumps over other pieces. That makes it especially good in crowded positions — and it always lands on the opposite colour from where it started.",
        fen: START_FEN,
        highlight: ["g1", "f3"],
      },
    ],
    drill: {
      fen: START_FEN,
      goal: "Develop your king's knight to f3.",
      bestUci: "g1f3",
      hint: "Tap the horse-shaped piece next to your king (g1), then tap f3.",
      why: "Nf3 develops a piece toward the centre and attacks e5 — every move should either develop or fight for the centre.",
    },
  },
  {
    id: "l-bishops",
    title: "Bishops and the queen",
    blurb: "Diagonal runners and the strongest piece.",
    minutes: 3,
    steps: [
      {
        heading: "Bishops slide diagonally",
        text: "Bishops move any number of squares diagonally, but only on their starting colour. You have one for the light squares and one for the dark.",
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        highlight: ["f1", "c4"],
      },
      {
        heading: "The queen does everything",
        text: "The queen combines rook and bishop: any distance, straight or diagonal. Because she is so strong, bringing her out too early invites attacks — develop minor pieces first.",
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        highlight: ["d1"],
      },
    ],
    drill: {
      fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
      goal: "Develop your bishop onto the strong c4 diagonal (f1 to c4).",
      bestUci: "f1c4",
      hint: "After 1.e4 e5 2.Nf3 Nc6, the f1-bishop can slide to c4.",
      why: "Bc4 develops a piece, points at Black's weakest square (f7) and prepares castling — three goals in one move.",
    },
  },
  {
    id: "l-rooks",
    title: "Rooks",
    blurb: "Straight-line power — files are highways.",
    minutes: 2,
    steps: [
      {
        heading: "Rows and columns",
        text: "Rooks move any number of squares horizontally or vertically. They love open files — columns with no pawns in the way.",
        fen: "4k3/8/8/8/8/8/8/R3K3 w - - 0 1",
        highlight: ["a1", "a8"],
      },
      {
        heading: "Rooks belong in the game",
        text: "In the opening, rooks are hard to use — their own pawns block them. They shine in the middlegame and endgame, especially on open files and the seventh rank.",
        fen: "4k3/8/8/8/8/8/8/R3K3 w - - 0 1",
        highlight: ["a7", "a8"],
      },
    ],
    drill: {
      fen: "4k3/8/8/8/8/8/8/R3K3 w - - 0 1",
      goal: "Move your rook from a1 to the centre of the first rank — to d1.",
      bestUci: "a1d1",
      hint: "Tap the rook on a1, then tap d1.",
      why: "Rd1 centralises the rook and connects it with the king — rooks are strongest when they can reach the action.",
    },
  },
  {
    id: "l-king-check",
    title: "The king and check",
    blurb: "What check means and the three ways out.",
    minutes: 3,
    steps: [
      {
        heading: "The king, one square at a time",
        text: "The king moves exactly one square in any direction. He can never move into check — never onto a square an enemy piece attacks.",
        fen: "4k3/8/8/8/8/8/8/4K3 w - - 0 1",
        highlight: ["e1"],
      },
      {
        heading: "Check!",
        text: "When your king is attacked you are 'in check' and must respond immediately. There are only three ways out: move the king, block the attack, or capture the attacker.",
        fen: "4k3/8/8/8/8/8/4r3/4K3 w - - 0 1",
        highlight: ["e2", "e1"],
      },
    ],
    drill: {
      fen: "4k3/8/8/8/8/8/4r3/4K3 w - - 0 1",
      goal: "You are in check from the rook on e2 — capture it with your king.",
      bestUci: "e1e2",
      hint: "The rook on e2 is giving check and is undefended. Tap your king, then tap e2.",
      why: "Kxe2 removes the check by capturing the attacker — always check whether the checking piece is defended before you grab it.",
    },
  },
  {
    id: "l-castling",
    title: "Castling",
    blurb: "Get your king to safety in one special move.",
    minutes: 3,
    steps: [
      {
        heading: "King and rook, together",
        text: "Once per game you may castle: the king moves two squares toward a rook and the rook jumps to the other side. Kingside castling puts the king on g1 and the rook on f1.",
        fen: "r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1",
        highlight: ["e1", "g1", "h1", "f1"],
      },
      {
        heading: "The rules",
        text: "You cannot castle out of, through, or into check, and neither piece may have moved before. The squares between king and rook must be empty. Castling early is a core opening goal.",
        fen: "r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1",
      },
    ],
    drill: {
      fen: "r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1",
      goal: "Castle kingside — move your king from e1 two squares to g1.",
      bestUci: "e1g1",
      hint: "Tap your king on e1, then tap g1. The rook jumps over automatically.",
      why: "Castling tucks the king behind a pawn wall and activates the rook — safety and development in a single move.",
    },
  },
  {
    id: "l-promotion",
    title: "Pawn promotion",
    blurb: "A pawn that reaches the last rank becomes a queen.",
    minutes: 2,
    steps: [
      {
        heading: "The pawn's reward",
        text: "When a pawn reaches the far end of the board it must promote: it becomes a queen, rook, bishop or knight — your choice. Usually the queen is best.",
        fen: "4k3/P7/8/8/8/8/8/4K3 w - - 0 1",
        highlight: ["a7", "a8"],
      },
    ],
    drill: {
      fen: "4k3/P7/8/8/8/8/8/4K3 w - - 0 1",
      goal: "Push the a7-pawn to a8 and choose a queen.",
      bestUci: "a7a8q",
      hint: "Tap the pawn on a7, then tap a8 — a chooser appears; pick the queen.",
      why: "A promoted queen turns a tiny pawn into the strongest piece on the board — endgames are often decided by exactly this.",
    },
  },
  {
    id: "l-captures",
    title: "Captures and hanging pieces",
    blurb: "Take what's free — don't leave your own gifts.",
    minutes: 4,
    steps: [
      {
        heading: "A hanging piece",
        text: "A piece is 'hanging' when it can be captured for free — it is undefended and something more valuable isn't going to be lost in return. Before every move, ask: does my opponent have anything hanging? Do I?",
        fen: "r1bqkbnr/ppp2ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
        highlight: ["e5", "f3"],
      },
    ],
    drill: {
      fen: "r1bqkbnr/ppp2ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
      goal: "Black's e5-pawn is undefended — capture it with your knight.",
      bestUci: "f3e5",
      hint: "The knight on f3 attacks the pawn on e5. Tap the knight, then e5.",
      why: "Nxe5 wins a clean pawn: the e5 pawn was defended by nothing that can recapture favourably.",
    },
  },
  {
    id: "l-mate1",
    title: "Checkmate in one",
    blurb: "Spot the move that ends the game.",
    minutes: 4,
    steps: [
      {
        heading: "Check vs checkmate",
        text: "Checkmate is check with no way out — the king is attacked and no move saves it. The game ends immediately. Beginners can win many games just by noticing undefended pieces near the enemy king.",
        fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
        highlight: ["h5", "f7"],
      },
    ],
    drill: {
      fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
      goal: "Deliver checkmate — the f7 square is weak. Play the queen from h5 to f7.",
      bestUci: "h5f7",
      hint: "Your queen on h5 and bishop on c4 both aim at f7. Tap the queen, then f7.",
      why: "Qxf7# is checkmate: the queen is supported by the c4-bishop, and no black piece can capture her or block. This pattern is called Scholar's Mate.",
    },
  },
  {
    id: "l-opening",
    title: "Opening principles",
    blurb: "Centre, development, safety — in that order.",
    minutes: 3,
    steps: [
      {
        heading: "Three rules for the first 10 moves",
        text: "1) Fight for the centre (e4, d4, e5, d5). 2) Develop your knights and bishops early — every move should bring a new piece into the game. 3) Castle early to protect your king.",
        fen: START_FEN,
        highlight: ["e4", "d4", "e5", "d5"],
      },
      {
        heading: "What NOT to do",
        text: "Don't move the same piece twice without reason, don't bring the queen out early, and don't grab pawns while your king sits in the centre. The player who develops fastest usually seizes the initiative.",
        fen: START_FEN,
      },
    ],
    drill: {
      fen: START_FEN,
      goal: "Make the classic opening move — push the e-pawn to e4.",
      bestUci: "e2e4",
      hint: "Same as the pawn lesson: e2, then e4.",
      why: "1.e4 takes the centre, opens the bishop and queen, and follows every opening principle at once.",
    },
  },
];

/* ---------------- completion storage (local, honest) ---------------- */

const DONE_KEY = "cwm:lessons:v1";

export type LessonDone = { id: string; completedAt: string };

export function loadLessonDone(): LessonDone[] {
  try {
    const raw = localStorage.getItem(DONE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LessonDone[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((d) => d && typeof d.id === "string" && typeof d.completedAt === "string");
  } catch {
    return [];
  }
}

export function saveLessonDone(done: LessonDone[]): void {
  try {
    localStorage.setItem(DONE_KEY, JSON.stringify(done));
  } catch {
    /* private mode — progress stays in memory for this session */
  }
}

export function isLessonDone(done: LessonDone[], id: string): boolean {
  return done.some((d) => d.id === id);
}

export function nextLesson(done: LessonDone[]): Lesson {
  return LESSONS.find((l) => !isLessonDone(done, l.id)) ?? LESSONS[LESSONS.length - 1];
}

/** Friendly labels for the puzzle practice section (audience wording). */
export const PUZZLE_INFO: Record<string, { goal: string; why: string }> = {
  "ex-hanging-1": { goal: "Capture the undefended pawn on e5.", why: "Nxe5 wins a clean pawn — nothing recaptures favourably." },
  "ex-check-1": { goal: "Find checkmate in one — aim at f7.", why: "Qxf7# — the bishop on c4 supports the queen. Scholar's Mate." },
  "ex-capture-1": { goal: "Win the d5 pawn.", why: "exd5 takes the pawn while keeping the centre tension under control." },
  "ex-king-1": { goal: "Get your king to safety.", why: "Castling is the fastest route to safety." },
  "ex-opening-1": { goal: "Make the best opening move.", why: "1.e4 fights for the centre and opens pieces." },
  "ex-endgame-1": { goal: "Push the pawn toward promotion.", why: "The passed pawn races to a8 while the enemy king is too far." },
  "ex-transfer-1": { goal: "Spot the hanging piece.", why: "The knight takes the free pawn on e5." },
  "ex-calc-1": { goal: "Find the strongest central move.", why: "A well-chosen central break opens the position." },
  "daily-boss-2026-09-27": { goal: "Daily challenge — win the e5 pawn.", why: "The knight grabs the undefended pawn." },
};
