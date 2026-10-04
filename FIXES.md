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

---

# Fix report 3 — 2026-10-04 ("still not working" pass)

Swept **every button on every tab** in headless Chromium with a fresh profile
(Home 8, Learn 23, Brain, Games, plus every exercise-card control) and fixed
the remaining dead clicks:

- **"Practice due review" was a silent no-op on a fresh profile** (nothing is
  due on day one, so the click did literally nothing). It now always opens a
  practice — due skill first, otherwise the best fresh exercise — and the label
  honestly reads "Practice a skill" / "Practice due review (N)".
- **"Transfer test" was a silent no-op for most skills** (only "hanging" has a
  second position in the pool). It now shows a clear "new position coming for
  this skill" pill instead of a button that does nothing. Where a sibling
  exists (hanging) it correctly switches exercises (verified ex-hanging-1 →
  ex-transfer-1).
- **Exercise board instruction** now says exactly what to do: "You play White —
  tap one of your pieces, then a highlighted square." (Black pieces are
  intentionally not movable in exercises — White is the side to move.)
- The only remaining "no-change" clicks in the sweep are correct behaviour:
  clicking the already-active Beginner level and the already-selected language.

Also: the production preview (port 4173) had been stopped after testing — if
that was the URL being tried, it now runs again alongside the dev preview.

## Verified this pass

- Full button sweep: no dead clicks remain on Home/Learn/Brain/Games.
- Exercise card: Hint 1→3 (gold f3→e5 squares), Reset hints, Reset position
  (clears verdict + restores FEN), Transfer test, Dismiss, Close — all produce
  their expected visible change; Scholar's-mate exercise gives
  "✓ Correct! Qxf7# was the best move in this position."
- 131/131 unit tests, tsc clean, production build clean, zero page errors.

---

# Fix report 4 — 2026-10-04 ("pieces not responding" — root cause found)

> "brain tab inside when u r selecting its chess piece r not responding"

(The attached screenshot again did not reach the sandbox; everything below was
reproduced with **real mouse clicks and real touch taps** — previous tests used
DOM `.click()`, which bypasses hit-testing and hid these bugs.)

## Root cause — the board broke on phones

`.board__square` had `aspect-ratio:1` **plus** `min-height:44px`. On any board
narrower than 352 px (every phone), min-height won: cells rendered **44×44 px
inside ~35–35.5 px grid columns**. Measured at 390 px: board 284 px wide ×
354 px tall (not square), squares overlapping each other and overflowing the
frame, so **taps landed on the wrong square** — pieces appeared "not
responding". Desktop was unaffected, which is why earlier tests passed.

### Fix
- Removed the conflicting `min-height` (cells are now perfectly square at every
  size: verified 284×284 @390, 254×254 @360) and added
  `touch-action:manipulation` to kill double-tap-zoom delay on the squares.

## Also found with real input

1. **Play board below the fold on laptops.** At 1280×1000 the bottom half of
   the board (all White pieces!) was off-screen — e2 was at y=1241. Clicking
   the visible Black pieces does nothing (they're the computer's), which also
   reads as "pieces not responding".
   - The board is now **first** on the Play page (right after the one-line
     status banner); coaching cards moved below it.
   - The opponent setup is a compact single row on wide screens.
   - If the board still wouldn't fit (short windows), the page auto-scrolls it
     into view on mount.
2. **SPA kept the old scroll position when switching tabs** — you could land
   mid-page on the new tab. Tab changes now scroll to the top.
3. **Brain "Genuine skills" rows were plain divs** — tapping "hanging" /
   "checks" did nothing. They are now real buttons ("Practise →") that open
   that skill's practice immediately (due rows highlighted).

## Verified with real input (mouse + touchscreen emulation)

- 390 px & 360 px phones: square boards/cells, tap f3 → 4 legal dots, tap e5 →
  "✓ Correct! Nxe5…", Black correctly locked, Brain row tap → "Practice —
  check · ex-check-1" opened + scrolled, vs Computer tap-move → reply in
  ~0.9–1.0 s, 0 px horizontal overflow, zero page errors.
- Desktop 1280×1000: real mouse e2→e4, computer replied in ~0.97 s, board
  fully on screen, hit-test at e2 returns the square.
- 131/131 unit tests, `tsc` clean, production build clean.

*(If something still looks wrong: hard-refresh once — Ctrl+Shift+R — so the
browser drops the previously cached version.)*

---

## Report 5 — Learn & Brain rebuilt as real, working features (App build 2026.10.04-4)

You said Learn and Brain still weren't adding functionality. You were right — the old Learn page
showed text cards with buttons that led nowhere, and the old Brain page invented skill ratings you
never earned. Both pages are now **rebuilt from scratch and verified end-to-end**.

### What Learn is now — a real beginner course
- **11 interactive lessons** ("The chessboard", "How pawns move", "How knights move", bishops,
  rooks, "Check & getting out of check", "Castling", "Promotion", "Captures", "Checkmate in one",
  "A simple opening"). Every lesson first *shows* the idea on a live board step by step
  ("Next →"), then makes **you** play the move yourself ("Now you play it →").
- **Real drills with move validation**: you must play the move the lesson teaches. Wrong move →
  the piece doesn't move, you get "✗ Try again — not the move we're practising". Right move →
  "✓ Correct!" plus *why* the move matters. Hints available ("Show hint").
- **Progress is saved** (localStorage) — the course list shows ✓ on finished lessons and a
  progress bar ("3 of 11 lessons done"). Your last position is kept if you leave mid-lesson.
- **9 puzzle practice cards** (captures, hanging pieces, checks, castling, promotion, endgame,
  calculation, transfer + a **Daily challenge**) — each opens a real solvable position with a
  goal, hint and verdict. "Another puzzle →" gives you a fresh one.

### What Brain is now — an honest coach
- **One clear recommendation ("Up next")**: your next unfinished lesson → or a skill due for
  review → or today's puzzle. Its button actually opens that exact lesson/practice (verified).
- **Course progress** and **recent activity** from your real attempts only.
- **7 skill bars with friendly names** (Spotting chances, Calculation, Choosing moves, Touch
  precision, Using ideas in games, Checks & captures, King safety). A skill you've never
  practised shows "—" — the app never invents a score. Each bar has a working **Practise →**
  button that opens the matching exercise.

### Verified in a real browser (both desktop 1280px and phone 390px)
| Check | Result |
|---|---|
| Course shows 11 lessons + 9 puzzles + progress bar | ✅ |
| Lesson steps → drill transition (knights: g1→f3) | ✅ |
| Wrong move rejected with feedback, board unchanged | ✅ |
| Correct move → "✓ Correct!" + saved ✓ on lesson + "1 of 11 done" | ✅ |
| Promotion drill with piece chooser (a7→a8 Queen) | ✅ |
| Castling drill (e1→g1) | ✅ |
| Brain recommendation → deep-links to the right lesson | ✅ |
| Brain skill "Practise →" → opens that skill's exercise | ✅ |
| Puzzle (f3xe5) → "✓ Solved!" + Another puzzle button | ✅ |
| Phone 390px: drill on screen, real finger-taps e2→e4 → "✓ Correct!" | ✅ |
| Phone 390px: Brain tap → lesson opens, zero sideways overflow, zero console errors | ✅ |
| Footer stamp | **App build 2026.10.04-4** ✅ |
| Unit tests | 131/131 ✅ |

If your screen still shows the old Learn/Brain, do one hard refresh (**Ctrl+Shift+R**, or on
phone: pull-to-refresh / clear site data) — the build number at the bottom must read
**2026.10.04-4**.

---

## Report 6 — journal page cleaned up (App build 2026.10.04-5)

You pointed at the part in/above the Games journal that still looked unfinished. I found the
offenders and removed them:

| Removed / fixed | Why |
|---|---|
| ❌ Raw PGN dump (`[Event "?"] [Site "?"] [Date "????.??.??"]…`) | Looked like broken debug text — question marks everywhere. Replaced with a clean move list ("1. e4 e5 …"). |
| ❌ "About this journal" card + two mini boards with FEN strings | Developer leftovers ("the journal title is not a hash", `rnbqkbnr/pppp…`). Removed entirely. |
| ❌ Always-on status strip above the journal ("PWA shell cached. Unsaved browser storage may be evicted…") | Technical noise at the top of every page. Now the strip only appears when you're actually **offline** (with a friendly message). |
| 🐛 "White to move · White to move · 2 moves" | The status was printed twice. Now: "White to move · 2 moves · date". |
| 🐛 Review pill showed `[Event "?"]…` too | Now shows the first moves ("1. e4 e5"). |

**What stays and still works** (verified on phone width 390px): your game auto-saves and appears
in the journal ("Current saved game — White to move · 2 moves"), **Resume / Review / New game**
all work, Review steps move-by-move (◀ Prev / Next ▶ / Latest), zero layout overflow, zero
console errors, offline banner appears only when truly offline.

If you meant a *different* part (or want the whole Games tab removed), tell me which — your
screenshots still don't reach me, so describe it in words (what the text says) and I'll take it out.
Footer must now read **App build 2026.10.04-5** (hard refresh once: Ctrl+Shift+R).
