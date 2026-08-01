# T-017 playtest gate

PASS

Task: harness/tooling nit-batch (I-001 sampler channel + stale comment, I-002
check.mjs failure-path mislabel, T-015 review MINOR blend census).
Worktree under test: `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-017`
at `0059363` (branch `task/T-017`, clean tree; merge base `14910dc`).

## Pinning

```sh
# served the worktree, not the moving main checkout:
(cd /Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-017 && python3 -m http.server 8783 &)
# harness invoked from the MAIN checkout (tools/playtest) against that origin
```

## Run commands (all exit 0, no retries needed — zero bootErrors)

```sh
cd /Users/scottmeyer/projects/hullbreaker/tools/playtest
node run.mjs scripts/mid-route.json --deterministic --max-runtime-ms 15000 \
  --base-url http://127.0.0.1:8783 --out runs/gate-T-017-mid
node run.mjs scripts/transform-slice.json --deterministic --max-runtime-ms 20000 \
  --base-url http://127.0.0.1:8783 --out runs/gate-T-017-transform
```

| run | result | fidelity | errors / consoleErrors / bootError | notes |
| --- | --- | --- | --- | --- |
| `gate-T-017-mid` | **completed** | testapi | 0 / 0 / none | attempt 1, 0 falls, 1 hit survived, dare entered, minEdgeMargin 35.46, idle fraction 0.044, 97 samples |
| `gate-T-017-transform` | **completed** | testapi | 0 / 0 / none | 2 of 2 transformations, 15.6s, 0 lives spent, idle fraction 0, minEdgeMargin 30.12, 213 samples |

Evidence:
- `tools/playtest/runs/gate-T-017-mid/{report.json,summary.md,screenshot.png}`
- `tools/playtest/runs/gate-T-017-transform/{report.json,summary.md,screenshot.png}`

## What I judged

### 1. Shipped game untouched (the primary gate for this lane)

`git diff 14910dc task/T-017 --stat` = 5 files, **all under `tools/`**:
`tools/assets/README.md`, `tools/assets/check.mjs`, `tools/playtest/README.md`,
`tools/playtest/lib/policy.mjs`, `tools/playtest/lib/sampler.mjs`. No `src/`,
no `index.html`, no fixture, no asset. `node tools/pathcheck.mjs` in the
worktree: **775 passed, 0 failed** (exit 0).

### 2. Harness metrics unchanged by the sampler channel switch (I-001)

The change is provably content-equivalent by construction, not just by
observation: `src/main.js`'s `HB.snapshot()` spreads `telemetry()`, and
`hostiles` is produced inside `telemetry()` — so the "primary channel" rows
the new code reads and the `window.HB` rows the old code read are literally
the same object mapping. Confirmed in the traces: the hostile row field set is
identical in both harnesses (`dir,hp,id,kind,materialized,state,x,y`), and
`gate-T-017-mid` carries populated rows on 97/97 samples.

A/B, same script, same `--deterministic` flags, same pinned server, main
checkout's harness (pre-change sampler) vs the worktree's harness (post-change):

| harness | result | playMs | airMs | idleFrac | minEdgeMargin | protoScore | links |
| --- | --- | --- | --- | --- | --- | --- | --- |
| main (gate run) | completed | 6862 | 5497 | 0.044 | 35.46 | 138.5 | 3 |
| main (repeat 1) | completed | 6372 | 4931 | 0.024 | 35.41 | 83.0 | 1 |
| main (repeat 2) | completed | 6405 | 5036 | 0.024 | 35.39 | 84.2 | 1 |
| **worktree (post-change)** | completed | 6419 | 5208 | 0.024 | **35.44** | **86.3** | 1 |

Read this honestly: the *unchanged* harness's own three repeats spread
protoScore 83.0–138.5 and airMs 4931–5497 against a byte-identical pinned
build. That is README honesty items 2 and 8 (deterministic injection does not
make a run reproducible), not a harness delta. The post-change run lands
inside that band on every field, and every structural outcome is identical
across all four runs (completed, attempt 1, 0 falls, 0 deaths, 1 hit, dare
entered, testapi fidelity). Verdict: no measurable change, with the honest
caveat that this script's variance band is wide enough that it could hide a
sub-3% metric shift — the code-level equivalence above is the stronger
evidence, and the builder's own in-page dual-channel probe (both channels read
inside one `page.evaluate`, 10/10 identical) is stronger still.

Fallback path checked by inspection: `result.hostiles == null && hbSnap` only
fires for `dom` fidelity or a page with `window.HB` but no `?testapi=1`; an
empty `hostiles: []` from the primary channel (e.g. `&enemies=0`, which is what
`transform-slice.json` runs) correctly stays `[]` rather than falling through —
matches the pre-change behavior, where `HB` also reported `[]`.

### 3. `check.mjs --selftest` green, and the I-002 failure path actually fixed

```sh
cd /Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-017
node tools/assets/check.mjs --selftest   # exit 0 — "selftest PASS — 23 palette cases (14 must-pass, 9 must-fail)"
```

Before/after on a throwaway tree (`src/thing.js` with one static import of an
asset plus one runtime string reference), same fixture both sides:

- main: `game references to assets/ (runtime, not imports): 2` — and lists the
  `import ... from '../assets/generated/foo.png'` line as a runtime reference
  (the I-002 self-contradiction). Exit 1.
- worktree: `game references to assets/ (runtime, not imports): 1 (1 static
  import rejected below, not counted here)`. Same error text, same exit 1.

Errors and exit codes are unchanged; only the info listing is corrected.

### 4. Blend-census correction (T-015 review MINOR) re-derived, not taken on trust

Ran the README's own re-derivation snippet in the worktree
(`rasterize.mjs … --size 100`, then `histogram` + `classify`):
31 unique colors; **5** blends at/above the 0.5% coverage gate
(1.21 / 1.19 / 1.02 / 0.72 / 0.72%), **all `hot-magenta`**; `#ffdcc5` measures
**0.44%** and classifies `rust-orange` — below the gate. That is exactly what
the corrected item 4 now claims. The generated PNG was removed afterwards
(`tools/assets/runs/` is gitignored; worktree left clean).

### 5. Screenshots

- `gate-T-017-mid/screenshot.png` — traversal-slice TRAVERSAL CLEAR overlay
  over the greybox lattice. Clean render, no z-fighting or torn geometry, HUD
  and overlay legible at the capture size. This slice is the deliberate grey
  testbed, so concept-art palette judgment does not apply to it.
- `gate-T-017-transform/screenshot.png` — BREACH CLEAR at ALT 31m, 2/2 turns.
  Deep-teal/near-black hull masses with rust-orange accent strips, connected
  hull surfaces, monumental static forms behind falling vapor streaks; reads
  as one continuous body, consistent with boards 13/14. **Nothing assembling**:
  no floating fragments, no half-built geometry, no seams mid-articulation in
  the frame.
- Honesty: these are single end-of-run frames. They cannot judge the
  static-anatomy rule across the *choreography* of a flip/breach — that is what
  `artifacts/cp3-transform-v3/` and the queued CP3 v3 operator packet are for.
  Nothing in T-017 touches render code, so neither screenshot can regress here.

## Not judged / routed elsewhere

- **Feel:** nothing in this task changes what a player experiences (zero
  shipped-game files). No feel question raised, none routed.
- For the operator/integrator, one note that is bookkeeping, not a defect:
  the task's second accept box ("I-001/I-002 marked resolved in the Inbox") is
  **not** satisfied by the branch — the diff contains no `SPRINT.md` change, so
  both issues still read open. That is arguably correct builder behavior (a
  worktree edit to `SPRINT.md` collides with concurrent gate appends), but it
  means the strike/annotation is the integrator's to make at merge time.
- **Rebase needed before merge** (integrator, not a gate failure): the branch
  is based on `14910dc`; `main` has since moved to `59a6501` (T-016), which
  also edited `tools/playtest/lib/sampler.mjs` — both changes insert into
  `fromTelemetryLike()` immediately after the `setbacks:` line, so expect a
  small textual conflict there. Keep both fields (`score:` from T-016,
  `hostiles:` from T-017); they are independent.

## Issue filed

- **I-014** (bug, S3) — `check.mjs`'s game-independence scan misses a
  multi-line static import, exiting 0 on a tree that hard-depends on an asset.
  Reproduced on both the worktree and `main`, so it is pre-existing, not a
  T-017 regression; T-017's README documents the gap honestly and the commit
  message asks for triage, which this files.
