# Fix report — 2026-10-04

## The reported problem

> "when computer is on it takes too much time to respond with chess piece — this is a problem with all the functionality — fix all, and fix the UI of the chess pieces and everything"

Reproduced and diagnosed on the real app (headless Chromium against `vite dev` and `vite preview`).

## Root cause — the engine could never load in the redesigned UI build

The Oct-4 UI redesign (`Chessworkermind_UI_Updated.zip`) was built from the older
milestone-5 source and **lost the entire working engine stack** that existed in the
Oct-2 checkpoint (`Chessworkermind_Latest_Checkpoint.zip`):

1. `useEngine` created the protocol worker as a **module worker**
   (`new Worker(..., { type: "module" })`), but `engineWorker.ts` used
   `importScripts("/stockfish/stockfish.js")` — **`importScripts` is not available
   in module workers**, so engine boot threw immediately.
2. Even in a classic worker, Stockfish 19's shipped script is **not an
   `importScripts` factory** — it self-boots as the worker script and fetches the
   `.wasm` **adjacent to its own URL**. The old code looked up a `Stockfish()`
   global that does not exist in workers, and the wasm would have resolved to the
   wrong path anyway.
3. The UI then sat in "Analyzing…" until an 8-second timeout flipped it to
   "Rules-only fallback" — the user saw the computer take forever and never move.
4. When the computer *did* finally have a best move, the Play page played it for
   **both colours** (no side/mode gating), so games turned into computer-vs-computer.

## What was fixed (this repo now contains the merged, working app)

### Engine / computer opponent (functionality)
- Ported the checkpoint's proven engine stack into the redesigned UI:
  - `src/engine/engineWorker.ts` — module protocol worker that spawns the shipped
    Stockfish script as a **nested classic worker** (it owns its `onmessage` and
    finds its own `.wasm`).
  - `src/engine/uciSession.ts` — phase-machine UCI session: `isready` barriers,
    bounded searches, stale-output guards, load/stop watchdogs.
  - `src/engine/createEngineWorker.ts` — base-URL-aware worker factory (works in
    sub-folder deploys), created lazily only when the engine is actually needed.
  - `src/engine/strength.ts` — ten reproducible strength profiles
    (skill/depth/nodes/move-time), **not** fake "difficulty delays".
  - `src/engine/legal.ts`, `protocol.ts`, `src/engine/useEngine.ts` (coach
    analysis: every candidate/PV legally replayed with chess.js before display).
- Ported `src/chess/useComputerOpponent.ts` — one bounded, independent search per
  computer turn; deterministic rules-only reply if WASM ever fails (never stalls).
- Ported `src/chess/session.ts` + `useChessGame` (v2 save format): **solo /
  vs Computer / Watch** modes, "You play White/Black", generation counters that
  cancel in-flight computer work on undo/new game/mode switch, undo takes back
  computer reply + your move, PGN-first save recovery.

### Play page (App.tsx)
- New **Opponent** setup: mode segmented control, side picker, strength 1–10
  slider (persisted), truthful status ("Computer replies with Stockfish" /
  "rules-only fallback").
- The computer now moves **only its own colour**, exactly once per turn; the
  human's pieces are locked while it thinks; Watch mode is the only place the
  computer plays both sides (clearly labelled).
- Removed the misleading red "threat" ring that always marked the engine's
  suggested destination; hints/teaching copy now only use analysis that matches
  the position actually on the board.
- Coach analysis pauses while the computer searches (the two Stockfish searches
  never compete), and runs on the human's turn or after game over for review.
- "Play best" is disabled while it is the computer's turn (no racing the reply).

### Chess piece UI
- Measured every piece's rendered bbox: the pawn was **92 % of the king's
  height** (rook 84 %) — no size hierarchy, board was hard to read.
  All pieces are now scaled about a shared baseline so heights follow a real
  chess set: king 1.00, queen 0.95, bishop 0.90, knight 0.84, rook 0.79,
  pawn 0.72 (verified via `getBBox` in the browser).
- Fixed the "thinking" indicator animation (`@keyframes pulse` did not exist).
- Check highlight, last-move wash, legal dots and suggestion rings kept their
  distinct treatments; Games review board is now fully inert; promotion dialog
  uses the same (re-proportioned) piece family.

### PWA / storage
- `public/sw.js` v9: relative-scope, precaches the **Stockfish engine files**
  (instant + offline computer opponent), atomic `offline-assets.json` precache
  from the build manifest, previous cache survives a failed install.
- Service worker now registers **only in production builds** (dev preview can
  no longer serve a stale shell — one of the original "hangs forever" triggers).
- `vite.config.ts`: relative `base` (sub-folder deploys work), offline-asset
  manifest plugin, preview binds `0.0.0.0` + `allowedHosts`.
- Home/Games pages read the **v2 session store** (they previously read the old
  key and never saw saved games).

## Verification (all run against this checkout, not claimed from logs)

- `npx vitest run` — **10 files, 131 tests passed** (rules, session, opponent
  legality at all levels, UCI session, engine hook, billing, coach, i18n).
- `npm run build` + `npm run preview` — real headless-Chromium loops:
  - dev: first computer reply **~0.7–1.0 s** (was: never / 8 s timeout),
    subsequent replies **~0.5–0.8 s**, strength-9 reply ~0.6 s;
  - prod + service worker: reply ~1.0 s, reload restores game + mode + side
    with **no phantom computer move**, offline reload serves the cached shell;
  - vs Computer as Black: computer opens as White in ~1 s, board auto-flips;
  - Watch mode plays both sides; undo restores your own turn; hints 1–3 reveal
    with suggested squares; no horizontal overflow at 390 px; **zero console
    errors** in all runs.

---

# Fix report 2 — 2026-10-04 (Learn / Brain / hints / Home)

> "learn tab and brain tab is not working… after hint 3 it displays position but it's not visible that much… make ui home page more better"

(The attached screenshot did not reach the sandbox, so every issue below was
reproduced live in headless Chromium and verified the same way.)

## What was actually broken

1. **Learn "Practice" looked dead.** Clicking any Practice button opened the
   exercise 1 700+ px below the fold — nothing scrolled, so the board (and the
   move feedback after it) was invisible. The pieces were playable all along;
   they were just never on screen.
2. **Hint 3 was nearly invisible.** The suggested from/to squares used a thin
   2.5 px brass inset with a ~10 % background wash — easy to miss. The Learn
   exercise board never received suggested squares at all (text-only hint).
3. **Brain tab buttons went nowhere useful.** "Practise hanging" / "Start a
   practice" only switched to the Learn tab — no exercise opened, no scroll.
4. Minor: duplicate React key warning in the candidate list when you play the
   best move (best == played).

## Fixes

- **Learn tab**
  - Opening a practice now scrolls the card into view (`scroll-margin-top`,
    smooth scroll) — the board is on screen the moment you click Practice.
  - After every move, a colour-coded **verdict banner** appears directly under
    the board (green "✓ Correct!" / red "✗ Not quite — best was Nxe5") and
    scrolls into view; "Reset position" also clears the previous verdict.
  - Hint 3 now highlights the move's from → to squares on the board itself.
  - Fixed the duplicate-key warning (`uci + index` composite key).
- **Brain tab**
  - "Practise {skill}" and "Start a practice" deep-link into Learn: the right
    exercise opens immediately and scrolls into view
    (skill → motif mapping, e.g. `checks → check`).
- **Hint suggestion visibility (Play + Learn)**
  - Suggested move is now an unmissable gold treatment: 55 % amber wash on the
    destination, thick glowing ring (`inset 5px #FFB020` + outer glow), a
    dashed white inner border, and a gentle `suggestPulse` animation.
    The legend swatch matches, and hint 3's text says "follow the gold squares".
- **Home page**
  - Split hero: headline + primary CTA + live stats chips (moves saved, reviews
    due, languages, price) on the left; a decorative wooden **mini chessboard**
    (real FEN, same piece family) on the right, with soft page background washes.
  - Quick-action cards (Guided game / Play the computer / Learn a skill) are now
    real hover-lifting action cards with explicit "→" affordances.

## Verification

- `vitest` 131/131, `tsc` clean, production build clean.
- Headless Chromium on dev + production builds: Practice click scrolls board
  into view (boardTop 231 px), wrong move → red verdict visible, correct move →
  green verdict, hint 3 shows pulsing gold f3→e5 (Play e2→e4), Brain
  "Practise hanging" opens `ex-hanging-1` scrolled into view, home hero board
  renders 64 squares / 32 pieces, no horizontal overflow at 390 px, and the
  computer opponent still replies in ~0.9 s — all with zero console errors.
