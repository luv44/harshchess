import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import {
  DEFAULT_SESSION,
  clearSession,
  humanCanMove,
  loadSession,
  saveSession,
  type Color,
  type GameMode,
  type SessionState,
} from "./session";

type Promotion = "q" | "r" | "b" | "n";

export type GameStatus =
  | { kind: "active"; turn: Color; inCheck: boolean }
  | { kind: "checkmate"; winner: Color }
  | { kind: "stalemate" }
  | { kind: "draw"; reason: "fifty" | "repetition" | "insufficient" | "draw" }
  | { kind: "other" };

export type RawMove = {
  color: string;
  piece: string;
  from: string;
  to: string;
  san: string;
  flags: string;
  captured?: string;
  promotion?: string;
};

function deriveStatus(c: Chess): GameStatus {
  if (c.isCheckmate()) return { kind: "checkmate", winner: c.turn() === "w" ? "b" : "w" };
  if (c.isStalemate()) return { kind: "stalemate" };
  if (c.isDrawByFiftyMoves()) return { kind: "draw", reason: "fifty" };
  if (c.isThreefoldRepetition()) return { kind: "draw", reason: "repetition" };
  if (c.isInsufficientMaterial()) return { kind: "draw", reason: "insufficient" };
  if (c.isDraw()) return { kind: "draw", reason: "draw" };
  if (c.isGameOver()) return { kind: "other" };
  return { kind: "active", turn: c.turn(), inCheck: c.isCheck() };
}

export function useChessGame() {
  const chessRef = useRef<Chess>(new Chess());
  const hydratedRef = useRef(false);
  const initialRef = useRef<{ orientation: Color; session: SessionState }>({
    orientation: "w",
    session: DEFAULT_SESSION,
  });

  // Prime from storage synchronously on first render so a refresh restores the
  // exact position AND the side/mode the player was using.
  if (!hydratedRef.current) {
    hydratedRef.current = true;
    const saved = loadSession();
    if (saved) {
      // Each step is guarded on its own. A single try/catch around the lot
      // meant a corrupt FEN threw away a perfectly readable move list, so a
      // recoverable game was lost. Found by fuzzing.
      const restored = new Chess();

      // 1. The move list first: it carries the position AND the history, so
      //    undo keeps working after a refresh. A PGN that holds only headers
      //    loads without error but gives us nothing, so count the moves.
      let movesRecovered = 0;
      if (saved.pgn && saved.pgn.trim().length > 0) {
        try {
          restored.loadPgn(saved.pgn);
          movesRecovered = restored.history().length;
        } catch {
          /* unreadable move list — the FEN may still be good */
        }
      }

      // 2. The saved position wins when it is real and says something
      //    different, because it is the newer of the two. When it is
      //    corrupt we keep whatever the move list recovered instead of
      //    starting from nothing.
      if (saved.fen && restored.fen() !== saved.fen) {
        try {
          restored.load(saved.fen);
        } catch {
          if (movesRecovered === 0) chessRef.current = new Chess();
        }
      }

      chessRef.current = restored;
      initialRef.current = {
        orientation: saved.orientation,
        session: { mode: saved.mode, humanSide: saved.humanSide },
      };
    }
  }

  const c = chessRef.current;

  const [fen, setFen] = useState(() => c.fen());
  const [pgn, setPgn] = useState(() => c.pgn());
  const [orientation, setOrientation] = useState<Color>(initialRef.current.orientation);
  const [session, setSession] = useState<SessionState>(initialRef.current.session);
  /**
   * Bumped by EVERY action that invalidates in-flight computer/engine work:
   * a move, undo, new game, side switch or mode switch. A queued computer move
   * whose generation no longer matches is discarded.
   */
  const [generation, setGeneration] = useState(0);
  const [lastRawMove, setLastRawMove] = useState<RawMove | null>(() => {
    const h = c.history({ verbose: true });
    return (h[h.length - 1] as RawMove | undefined) ?? null;
  });

  const persist = useCallback(
    (o: Color, s: SessionState) => {
      saveSession({
        fen: chessRef.current.fen(),
        pgn: chessRef.current.pgn(),
        orientation: o,
        mode: s.mode,
        humanSide: s.humanSide,
        updatedAt: new Date().toISOString(),
      });
    },
    [],
  );

  const sync = useCallback(() => {
    const cur = chessRef.current;
    setFen(cur.fen());
    setPgn(cur.pgn());
    const h = cur.history({ verbose: true });
    setLastRawMove((h[h.length - 1] as RawMove | undefined) ?? null);
    setGeneration((g) => g + 1);
    persist(orientation, session);
  }, [orientation, session, persist]);

  useEffect(() => {
    persist(orientation, session);
  }, [orientation, session, persist]);

  const status: GameStatus = useMemo(() => {
    try {
      return deriveStatus(chessRef.current);
    } catch {
      return { kind: "other" };
    }
  }, [fen, generation]);

  const view = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return new Chess();
    }
  }, [fen]);

  const board = useMemo(() => view.board(), [view]);
  const historyVerbose = useMemo(() => c.history({ verbose: true }), [c, fen]);
  const historySan = useMemo(() => c.history(), [c, fen]);
  const lastMove = useMemo(
    () => (lastRawMove ? { from: lastRawMove.from, to: lastRawMove.to } : null),
    [lastRawMove],
  );

  const getLegalTargets = useCallback(
    (from: Square): Square[] => view.moves({ verbose: true, square: from }).map((m) => m.to as Square),
    [view],
  );

  const isPromotionMove = useCallback(
    (from: Square, to: Square): boolean => {
      const piece = view.get(from);
      if (!piece || piece.type !== "p") return false;
      return view.moves({ verbose: true, square: from }).some((m) => m.to === to && m.promotion);
    },
    [view],
  );

  /** Apply a move that has already been decided. Returns false if illegal. */
  const tryMove = useCallback(
    (from: Square, to: Square, promotion?: Promotion): boolean => {
      const cur = chessRef.current;
      if (cur.isGameOver()) return false;
      const legal = cur.moves({ verbose: true, square: from }).some((m) => m.to === to);
      if (!legal) return false;
      try {
        const res = cur.move({ from, to, promotion });
        if (!res) return false;
        sync();
        return true;
      } catch {
        return false;
      }
    },
    [sync],
  );

  /** A move attempted by the PERSON. Refuses to move the computer's colour. */
  const tryHumanMove = useCallback(
    (from: Square, to: Square, promotion?: Promotion): boolean => {
      const current = chessRef.current;
      const piece = current.get(from);
      if (!piece) return false;
      if (
        !humanCanMove({
          session,
          turn: current.turn() as Color,
          pieceColor: piece.color as Color,
          status: deriveStatus(current).kind,
        })
      ) {
        return false;
      }
      return tryMove(from, to, promotion);
    },
    [session, status.kind, tryMove, view],
  );

  /** Can the person pick up this piece right now? Drives board interactivity. */
  const canPickUp = useCallback(
    (pieceColor: Color): boolean =>
      humanCanMove({
        session,
        turn: view.turn() as Color,
        pieceColor,
        status: status.kind === "active" ? "active" : status.kind,
      }),
    [session, status.kind, view],
  );

  /**
   * Undo. Against the computer this takes back the computer's reply AND your
   * move, so you get your own turn back — and the bumped generation makes sure
   * the pending engine reply for the old position can never land afterwards.
   */
  const undo = useCallback(() => {
    const cur = chessRef.current;
    const first = cur.undo();
    if (!first) return false;
    if (session.mode === "vsComputer" && cur.turn() !== session.humanSide) {
      cur.undo();
    }
    sync();
    return true;
  }, [session.mode, session.humanSide, sync]);

  const newGame = useCallback(() => {
    chessRef.current = new Chess();
    clearSession();
    setFen(chessRef.current.fen());
    setPgn(chessRef.current.pgn());
    setLastRawMove(null);
    setGeneration((g) => g + 1);
    persist(orientation, session);
  }, [orientation, session, persist]);

  const reset = newGame;

  const flip = useCallback(() => setOrientation((o) => (o === "w" ? "b" : "w")), []);

  /** Switching mode cancels any pending computer work via the generation bump. */
  const setMode = useCallback((mode: GameMode) => {
    setSession((s) => ({ ...s, mode }));
    setGeneration((g) => g + 1);
  }, []);

  const setHumanSide = useCallback((humanSide: Color) => {
    setSession((s) => ({ ...s, humanSide }));
    setOrientation(humanSide);
    setGeneration((g) => g + 1);
  }, []);

  /** Start a fresh game in a chosen mode/side in one atomic step. */
  const startGame = useCallback(
    (mode: GameMode, humanSide: Color) => {
      chessRef.current = new Chess();
      const next = { mode, humanSide };
      setSession(next);
      setOrientation(humanSide);
      setFen(chessRef.current.fen());
      setPgn(chessRef.current.pgn());
      setLastRawMove(null);
      setGeneration((g) => g + 1);
      persist(humanSide, next);
    },
    [persist],
  );

  return {
    fen,
    pgn,
    board,
    orientation,
    lastMove,
    lastRawMove,
    status,
    historyVerbose,
    historySan,
    getLegalTargets,
    isPromotionMove,
    tryMove,
    tryHumanMove,
    canPickUp,
    undo,
    reset,
    newGame,
    startGame,
    flip,
    canUndo: historyVerbose.length > 0,
    chess: c,
    // session
    mode: session.mode,
    humanSide: session.humanSide,
    session,
    setMode,
    setHumanSide,
    generation,
    turn: (status.kind === "active" ? status.turn : view.turn()) as Color,
  };
}
