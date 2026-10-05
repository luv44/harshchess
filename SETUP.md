# Chessworkermind — Setup & Source Guide (Milestone 5)

## Prereqs
Node 18+ / npm 9+, modern browsers (Chromium/Firefox/Safari), HTTPS for PWA install.

## Install & run
```bash
# from this folder (app/)
npm install --ignore-scripts
npm run build        # typecheck + vite build → dist/
npm run preview -- --host --port 4173
npm test             # vitest run (if needed: node --max-old-space-size=4096 ./node_modules/vitest/dist/cli.js run)
npm run typecheck    # tsc --noEmit
```

D: exFAT note: bare `npm install` fails on esbuild postinstall (EFTYPE). Use `--ignore-scripts`. Stockfish assets are already in `public/stockfish/`; no download needed.

## Deploy
- Host `dist/` on any static host with HTTPS. Ensure `public/manifest.webmanifest`, `public/sw.js`, `public/icons/*`, `public/stockfish/*` are served at those paths.
- Service worker is at `/sw.js` (scope `/`); manifest at `/manifest.webmanifest`. Both are registered from `index.html` / `src/main.tsx`.
- No secrets in repo. `.env.example` is the template; provider keys stay server-side in deployment env, never committed.

## Source ZIP
- ZIP is at the location recorded in `RUN_RECOVERY.json` `zip` (e.g., `D:\chessworkermind web\chessworkermind-web-milestone5-20260927.zip`).
- Contents: full source including `MASTER_PROMPT.txt`, `public/stockfish/Copying.txt`, manifest/icons/sw, docs; excludes `node_modules/`, `dist/`, `.env`.
- To recreate: `Compress-Archive -Path app\* -DestinationPath <out>.zip` (PowerShell) or recreate via instructions in `RUN_RECOVERY.json`.

## iPhone/Android quirks
- Safari iPhone: Add to Home Screen creates separate storage from the Safari tab. Advise guest players to **Account → sync / export** before switching contexts, then sign in in the installed app to restore.
- Notch / safe-area: layout uses `env(safe-area-inset-*)`.
- Engine WASM (~1.7MB) downloads on first analysis; metered connections should see loading indicator; retry via Re-analyze.

## Tests that exist
`npm test` runs 77 tests: smoke + milestone1 legality/storage + engineWorker guards + milestone3 (FactPacket/diagnosis/learner/ranking/spaced/i18n) + milestone4 (pricing/webhook/lifecycle/refund/sync). Browser QA beyond automated tests is manual — see `PREVIEW.md` and Status tab.
