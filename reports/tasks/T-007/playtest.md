PASS

# T-007 playtest gate — docs drift sweep

- Worktree: `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-007`
  (branch `task/T-007`, HEAD `c0c1dbf`, merge-base with main `15de009`, clean
  working tree)
- Gate agent: playtester; harness run from the MAIN checkout
  (`/Users/scottmeyer/projects/hullbreaker/tools/playtest`) against the pinned
  worktree.

## Docs-only verification (primary check for this task)

`git diff --name-status main...HEAD` in the worktree shows exactly four files,
all Markdown — no code, no fixtures, no tuning:

```
M  README.md
M  docs/FLEET-PLAN.md
M  docs/HANDOFF.md
M  tools/playtest/README.md
```

A `grep -v '\.md$'` over the changed paths returns nothing. Docs-only
confirmed; the smoke suite below therefore doubles as a **no-regression
check** — a docs-only branch cannot change runtime behavior, and both smoke
runs completing cleanly against this exact worktree confirms nothing else
leaked in.

## Smoke runs (both exit 0, `"result": "completed"`, no retry needed)

Server pinned to the worktree: `python3 -m http.server 8783` (cwd =
worktree), killed after the runs.

```
node run.mjs scripts/mid-route.json --deterministic --max-runtime-ms 15000 \
  --base-url http://127.0.0.1:8783 --out runs/gate-T-007-mid
node run.mjs scripts/transform-slice.json --deterministic --max-runtime-ms 20000 \
  --base-url http://127.0.0.1:8783 --out runs/gate-T-007-transform
```

| Run | result | fidelity | bootError | pageErrors | consoleErrors | notes |
| --- | --- | --- | --- | --- | --- | --- |
| gate-T-007-mid | completed | testapi | none | 0 | 0 | idle fraction 0.024, minEdgeMargin 35.43, protoScore 83.8 (proxy), 1 attempt, 0 deaths |
| gate-T-007-transform | completed | testapi | none | 0 | 0 | 2/2 transformations, BREACH CLEAR, 0 deaths, protoScore 326.5 (proxy) |

Evidence: `/Users/scottmeyer/projects/hullbreaker/tools/playtest/runs/gate-T-007-mid/`
and `/Users/scottmeyer/projects/hullbreaker/tools/playtest/runs/gate-T-007-transform/`
(report.json + summary.md + screenshot.png each). Metrics are consistent with
the committed deterministic demo baselines (mid-route minEdgeMargin 35.4x,
zero idle regression) — trends in family, no anomaly.

## Spot-checks of corrected claims (5, vs code in the worktree)

1. **`?testapi=1` now carries `hostiles[]`** (playtest README hook request #2
   marked done, limitation #7 narrowed): `src/main.js` `telemetry()` publishes
   `hostiles: hostiles.map((e) => ({id, kind, state, dir, x, y, hp,
   materialized}))` — exact field set the doc claims. The commit pin was
   verified by archaeology: at `e7b2952^` the only `hostiles: hostiles.map`
   occurrence sits inside `window.HB.snapshot()`; at `e7b2952` it sits inside
   `telemetry()` — so "merged `e7b2952`" is precisely right.
2. **`HB.score` surface has landed** (hook request #3 reworded): `src/main.js`
   publishes `score: {enabled: SCORE_ENABLED, events: scoreEvents, snapshot:
   scoreSnapshot, reset: resetScore}` with the comment "Inert unless
   ?score=1"; ring-buffered events with `CONFIG.score.eventCap` live in
   `src/sim/score.js`. The doc's caveat that the harness has NOT switched over
   (protoScore still proxy-derived) matches `lib/metrics.mjs` reality and the
   run reports above (both carry the proxy `note`).
3. **Ritual telemetry landed** (hook request #8 marked landed): the
   `transform` block carries `tMs`/`progress`/`frontierX`/`sealX` plus the
   T-002 `decisions` trace (`src/main.js` `transformTelemetry()`, comment
   explicitly tags the T-002 addition), and `cornerTelemetry()` reports the
   six-face ritual's `state`/`tMs`/`progress` — all as the doc states.
4. **Sampler still enriches hostiles from `window.HB.snapshot()`** (the doc's
   "harness-side half still open" claim): `tools/playtest/lib/sampler.mjs`
   merges `hbSnap.hostiles` as the enrichment layer — accurate.
5. **FLEET-PLAN's merge-gate description**: `tools/orch/merge-task.sh`
   enforces reviewer APPROVE + playtester PASS (first-line checks), pathcheck
   in the worktree, deterministic smoke against the pinned worktree,
   `merge --no-ff`, and post-merge pathcheck with `git reset --hard HEAD~1`
   auto-revert — matches the added text exactly.

The HANDOFF/FLEET-PLAN entry-8 additions quote the operator's verbatim
directive character-for-character as recorded in `docs/decisions.md` entry 8;
no invented decisions found, entries 1–7 correctly stated as standing.

## Screenshot judgment (per standing orders)

- `gate-T-007-mid/screenshot.png` — TRAVERSAL CLEAR end frame. RIG reads at
  roughly 3% of screen height (FAR default per decisions entry 7, in board
  13's 3–5% band). Connected hull silhouettes, readable platform edges,
  magenta pocket + green accents present. Grey-box palette is the expected
  current state (T-010 palette pass unmerged — not a T-007 concern). No
  glitches, no assembling anatomy. Small capsule glyphs at FAR remain the
  known accepted cost (entry 7) with T-003 already queued — not a new defect.
- `gate-T-007-transform/screenshot.png` — BREACH CLEAR end frame, 2/2
  transformations, monumental static silhouettes with vapor streaks, RIG
  small against the body. No geometry assembling, slamming, or articulating in
  frame; static-anatomy rule (entry 3) holds. No visual regression vs main —
  as expected for a docs-only branch.

## Feel

Nothing to route — a docs sweep raises no feel questions; the visuals judged
are unchanged runtime behavior.

## Issues filed

- One S3 docs nit (stale code comment in `tools/playtest/lib/sampler.mjs`,
  outside this task's docs-only lane) filed to SPRINT.md's Inbox as I-001.
