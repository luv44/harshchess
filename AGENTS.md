# Chessworkermind local agent rules

The full product specification is `MASTER_PROMPT.txt` in this project. Build a real TypeScript website/PWA with chess legality, verified coaching, selected-language explanations, account sync and the owner-approved subscription lifecycle, one working milestone at a time. The master prompt always decides product scope.

## Work loop and token discipline

- On milestone 0 read the master prompt once. Thereafter use `PROJECT_STATE.json`, `RUN_RECOVERY.json`, the relevant master-prompt sections and relevant source files. Keep prompts, diffs and test output focused; do not repeatedly reread the complete master spec.
- Do the implementation, run the focused checks, fix actual errors, then update both state files. `PROJECT_STATE.json` must retain `next_milestone` (integer 0 to 6), `completed_milestones` (integer array), `verified_features` (array), `blocker` and `next_step`. Increment `next_milestone` by exactly one only when that milestone really works. Never mark a planned or stubbed feature as verified.
- If credits stop, a package install fails, or time runs out, write a truthful short `RUN_RECOVERY.json` and leave the current milestone unfinished. Continue from the same files on the next run. Avoid an unbounded repeat/test loop.
- Work exclusively inside this `app` directory. Preserve existing code and unrelated Android projects. Never touch D: root or controller folders. Do not publish, initiate live charges, enable ads, or claim those actions happened. Merchant/account/price/legal signoff remains with the owner.
- Keep paid AI optional, capped, server-side and out of basic move interactions. Prefer verified chess facts, cache, short prompts and bounded analysis. The language renderer must not invent a move or engine score.

## Milestone acceptance

0. Inspect and preserve existing work; create an honest feature inventory, installable project plan and state files. If the project is new, start a real TypeScript web scaffold and clearly label unbuilt features.
1. A playable, responsive, legal Free board and short sales page, with local save and a successful `npm run build`.
2. Real worker-driven Stockfish analysis/opponent with stale-position guards and targeted chess tests (`npm test` exits). Rules-only fallback must be visibly labelled.
3. Verified FactPackets, practice and revision, teaching algorithm and supported-language explanations with meaningful learner-model tests.
4. Account sync and real provider test-mode monthly subscription adapter, ₹599 INR base pricing, refund/cancel/reconnect/expiry tests. Paid checkout must stay disabled until verified.
5. Browser QA, source/export guide, truthful feature matrix and preview instructions. `next_milestone=6` only when the independently testable work is completed; mark owner-only tests and merchant setup pending.

Before reporting any milestone complete, test the actual behavior, run the build, and record exact commands and failures. Tests and a ZIP are evidence only if they actually ran/exist. Keep `MASTER_PROMPT.txt` in the source export; keep any production keys out of project files.
