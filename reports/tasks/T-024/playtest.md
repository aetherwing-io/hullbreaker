PASS

Worktree: `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-024`, branch
`task/T-024`, commit `0fbbdbd`. This is a **harness** task — no `src/` diff
(confirmed independently: `git diff main...HEAD --name-only | grep '^src/'` → 0
matches) — so the gate below concentrates on the CLAUDE.md harness/tooling
definition of done: zero effect on the shipped game, and the defect the task
claims to fix being genuinely fixed, not just header-plausible.

Ports: 8741/8742/8753 (operator's) were left untouched throughout. Pinned
server for the worktree ran on **8811**; the independent A/B repro used
**8821** (python control) and **8822** (`tools/serve.mjs`). All three killed
at the end of this session; verified clear with `lsof`.

## 1. Zero effect on the shipped game

- `node tools/pathcheck.mjs` on the worktree → **1674 passed, 0 failed**,
  matching both the build and review reports.
- `node tools/serve.mjs --selftest` (own machine gate) → **14/14 passed**.
- Started `node tools/serve.mjs 8811` from the worktree and confirmed by hand
  (not taken from the reports): `curl -sI http://127.0.0.1:8811/index.html`
  and `curl -sI http://localhost:8811/src/sim/pace.js` both 200 with
  `Cache-Control: no-store, no-cache, must-revalidate, max-age=0`, `Pragma:
  no-cache`, `Expires: 0`, no `ETag`/`Last-Modified` — dual-stack confirmed. A
  conditional GET (`If-Modified-Since`/`If-None-Match`) against
  `/src/sim/pace.js` → `status=200 size=5741`, never 304.
- Smoke set, run from the **main checkout's** harness against the pinned
  worktree server (`--base-url http://127.0.0.1:8811 --deterministic`):
  - `node run.mjs scripts/mid-route.json …` → `outcome: completed`
    (fidelity `testapi`), `meta.bootError: null`, `consoleErrors: []`,
    `pageErrors: []`. Screenshot shows a clean `TRAVERSAL CLEAR` overlay, no
    rendering glitches.
  - `node run.mjs scripts/transform-slice.json …` → `outcome: completed`,
    `meta.bootError: null`, `consoleErrors: []`, `pageErrors: []`. Screenshot
    shows a clean `BREACH CLEAR` overlay, geometry and rain/atmosphere intact,
    no anatomy assembling mid-frame.
  - Reports/screenshots: `/private/tmp/claude-501/-Users-scottmeyer-projects-hullbreaker/c3d9d3c6-20d5-4194-9407-9c10d4ab6a1e/scratchpad/runs/t024-midroute/`,
    `.../t024-transform/` (scratch, not committed — paths given for
    reproducibility, not as a claim they persist).
- Additionally exercised the edited `tools/playtest/lib/server.mjs` file
  directly (not via `--base-url`, which bypasses it): symlinked the main
  checkout's `tools/playtest/node_modules` into the worktree (gitignored,
  removed afterward — worktree is clean, `git status --short` shows nothing
  but the pre-existing untracked `review.md`) and ran `mid-route.json`
  through the worktree's own built-in ephemeral server. First run reported
  `outcome: not-completed` (no `bootError`, no console/page errors — the
  script window simply ended before the heuristic policy finished the
  route). To rule out a server regression I re-ran it 3× more on the
  worktree (**3/3 completed**) and 3× on an untouched `main` checkout's own
  built-in server for comparison (**3/3 completed**) — the single
  non-completion reproduces at the same low rate on unmodified `main`, so
  it's pre-existing dispatch/frame-alignment variance the harness's own
  README already documents as an open question (`--deterministic` narrows
  jitter, it doesn't eliminate it), not something this diff introduced. No
  regression found in `lib/server.mjs`.

## 2. The defect it claims to fix — reproduced independently, not taken on header inspection

Built a minimal, separate repro (not reusing the builder's scratch script,
which wasn't committed): two-file ES-module page
(`index.html` importing `./mod.js`, `mod.js` exporting a `VALUE` string) in
`<scratchpad>/cachelab/{python-site,node-site}/`, `mod.js` backdated 20 days
(`touch -t`) so Chrome's heuristic freshness window is on the order of two
days — comfortably past this test's runtime. Served `python-site` with
`python3 -m http.server 8821` and `node-site` with the worktree's
`node tools/serve.mjs 8822 --root node-site`. Drove **real Chrome** (not
Chromium) via `playwright-core`'s `chromium.launchPersistentContext({channel:
'chrome', headless: true})` — the same driver mechanism `tools/playtest`
itself uses — one persistent profile per server. For each: loaded
`index.html?v=1`, read the page title (`LOADED:OLD`), rewrote `mod.js` on disk
to `VALUE='NEW'` while pinning the mtime back to the same backdated value
(`fs.utimes`), then navigated the **same persistent context** to
`index.html?v=2` (a different document URL, so only the module's cache entry
is in question) and read the title again:

```
python3 -m http.server: first=LOADED:OLD secondAfterEdit=LOADED:OLD -> STALE
node tools/serve.mjs   : first=LOADED:OLD secondAfterEdit=LOADED:NEW -> FRESH
```

This independently confirms the exact python-STALE / `serve.mjs`-FRESH result
the build report claims, in a real Chrome instance, with a fresh repro rather
than re-running the builder's own script. Script kept at
`<scratchpad>/cachelab/ab.mjs` (scratch, not committed).

Caveat, same one the build report already states honestly: this uses a
backdated mtime to force the heuristic window deterministically rather than
sitting through a real multi-hour freshness window — a faithful model of the
incident, not the incident replayed at real wall-clock speed.

## 3. Other claims checked independently

- `tools/orch/merge-task.sh` still pins with `python3 -m http.server`
  (`grep -n "http.server" tools/orch/merge-task.sh` → line 103, unchanged) —
  matches both reports' claim that it was deliberately left alone.
- `git diff main...HEAD --name-only` → `.claude/agents/playtester.md`,
  `CLAUDE.md`, `README.md`, `docs/ORCHESTRATION.md`,
  `reports/tasks/T-024/build.md`, `tools/playtest/README.md`,
  `tools/playtest/lib/server.mjs`, `tools/serve.mjs`. Zero `src/` files.
  README's new `### tools/serve.mjs` section carries an honesty/limitations
  block (binds-all-interfaces default, `no-store` refetch cost, three.js CDN
  caching untouched, single-range-only, pre-existing favicon 404, and the
  stale-module repro summarized) — satisfies the harness/tooling definition
  of done.

## What this doesn't cover (feel/fun)

Nothing here needs an operator verdict — this task never touches gameplay,
pacing, or anything a fixed screenshot judgment applies to. No new Inbox
entries filed; nothing defective was found (highest existing entry remains
I-032).

## Verdict

**PASS.** Zero effect on the shipped game (pathcheck green, both smoke
scripts complete cleanly with no boot/console/page errors, no regression
found in the edited harness file after ruling out a one-off flake against an
unmodified-`main` baseline), and the caching defect this task exists to fix
was independently reproduced and independently confirmed fixed in real
Chrome, not accepted on header inspection alone.
