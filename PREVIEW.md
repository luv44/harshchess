# Chessworkermind — Preview Instructions (Milestone 5)

## Run locally
```bash
npm install --ignore-scripts   # D: is exFAT — standard postinstall EFTYPE fails; this runner uses --ignore-scripts
npm run build                  # tsc -b && vite build
npm run preview -- --host --port 4173
# open http://localhost:4173
# alternative dev: npm run dev
```

Notes for this runner: exFAT `D:` needs `npm install --ignore-scripts` plus manual stockfish fetch is already in `public/stockfish/`; do not run bare `npm install`. Build is `tsc -b && vite build`.

## What to click
- **Sales** tab: hero, Free vs Pro comparison (₹599/month INR base), FAQ/Privacy, Install card.
- **Play** tab: Free board — tap or drag, flip, undo, move history, FEN/PGN copy, engine panel (Stockfish WASM loads ~1.7MB; if it fails you see “Rules-only fallback” and board stays playable), Computer toggle, Re-analyze/Play best.
- **Learn** tab: language picker (8 languages, names in own scripts), ranked exercises, revision queue, hints stepwise, FactPacket panel.
- **Account** tab: sign in (mock), sync now, reconnect (re-verifies provider), export/delete, billing status (Pro checkout disabled — coming soon pill, test helper only).
- **Status** tab: honest feature matrix, Browser QA notes, install steps.

## Offline / PWA check
- After first load: DevTools → Application → Service Workers + Cache Storage (cwm-v5-…) should appear.
- Toggle **Offline** in DevTools → reload → board + saved game still open; Account sync/purchase will show offline banner and require network.
- Hard refresh after `npm run build` updates cache via `sw.js` version `cwm-v5-2026-09-27` (old caches purged on activate).

## Install (optional enhancement only)
- If browser shows install prompt: click **Install Chessworkermind** (Sales or Status tab).
- Otherwise: iPhone Safari Share → Add to Home Screen; Android Chrome Menu → Install app; Desktop Chrome/Edge address bar install icon.
- Installed app is still a website (not IPA/APK). Updates do not delete saved games. On iPhone, tab storage and Home Screen storage are separate — sync your account or export before switching contexts.
