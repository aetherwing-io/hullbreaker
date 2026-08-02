PASS

## What was gated, and why this supersedes the committed report

Fresh gate of `task/T-044` at worktree
`/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-044`, **HEAD
`3cbc015` (confirmed via `git rev-parse HEAD` before and after every test
batch)**. The previously committed `reports/tasks/T-044/playtest.md` (PASS,
gated at `03b775e`) predates HEAD and is **not** inherited — this is an
independent pass against the current commit, per the dispatching
instruction and per LANE-BRIEF's "never inherit a measured number across a
change that could move it."

**What actually changed between `03b775e` and `3cbc015`, checked by diff, not
assumed:** `git diff 03b775e..3cbc015 -- src/pure/lattice.js
src/pure/generator.js` is **empty** — T-044's own terrain code is
byte-identical to what the prior gate tested. The non-empty part of the
range is `a73e028` ("WIP merge main into task/T-044") pulling in six lanes
that landed on `main` after `03b775e` (T-042 audio, T-043 wasp aim-lock +
squad stagger, T-045/T-050 scale pass, T-047 light rig + shadows, T-048
bloom + materials — all independently gated and merged before this branch
picked them up) plus `3cbc015` fixing two pathcheck-migration-only failures
(a dropped `execFileSync` import and a duplicate platform-count pin,
per `reports/tasks/T-044/review.md`'s own re-review, independently
re-verified by me: `node tools/pathcheck.mjs` reproduces `2502 passed, 0
failed`). Of that incoming set, **`src/sim/hostiles.js` (T-043) is the one
gameplay-relevant file that changed** (`git diff 03b775e..3cbc015 --stat --
src/sim/hostiles.js` → 35 lines: the wasp dive now aim-locks 220ms before
launch and staggers within a squad). This means the difficulty-distribution
numbers in `build.md` and the prior `playtest.md` were measured **without**
T-043's wasp telegraph on either side of the base/branch comparison — see
the proposed docs issue below. Nothing else gameplay-relevant moved;
`src/config.js`'s 396-line diff is entirely the already-operator-reviewed
T-035/045/047/048/050 render/lighting config (fog bands, scale-pass
backdrop/mark tables, shade experiment) landing via the same merge.

**Pinning.** Served the worktree with `node tools/serve.mjs 8792 --root
.../worktrees/T-044 --quiet` (port 8792; 8741 was already bound by the
operator's own session, confirmed via `lsof` and left untouched; 8742 never
touched). Ran the main checkout's `tools/playtest` harness against it with
`--base-url http://127.0.0.1:8792 --deterministic` for every `run.mjs`
script. For the two dev-tool capture rigs that don't take `--base-url`
(`t044-capture.mjs`, `lightrig-capture.mjs --perf`), ran them **from inside
the pinned worktree itself** so their built-in ephemeral server (which
sends the same `no-store` headers as `tools/serve.mjs`, `lib/server.mjs`)
serves that exact tree — the worktree was not touched by me at any point
during testing (`git rev-parse HEAD` identical before/after). Server killed
after (`pkill -f "serve.mjs 8792"`, confirmed dead via a failed `curl`).

**Note on a concurrent process in this same worktree:** `git status
--short` showed `reports/tasks/T-044/review.md` modified (not by me — I
only ever `Read` it) throughout my session, evidently a concurrent re-review
agent's in-progress edit. I never touched it, and confirmed it did not
correspond to any change in `HEAD` or in `src/`. Flagging for transparency,
not as a defect.

## 1. Regression: pathcheck, selftest

- `node tools/pathcheck.mjs` in the worktree: **2502 passed, 0 failed**,
  reproduced fresh (`reports/tasks/T-044/qa-evidence-fresh-3cbc015/pathcheck.log`)
  — matches build.md/review.md's post-fix count exactly.
- `index.html?selftest=1` against the pinned server: **SELFTEST PASS (39
  checks)**, zero real console errors (one `favicon.ico` 404, the same
  known non-issue `juice-stress.mjs` itself filters out).
  `reports/tasks/T-044/qa-evidence-fresh-3cbc015/smoke/selftest.log`.

## 2. Route invariants: smoke set + a fresh distribution sanity batch

Smoke set, main checkout's harness, `--deterministic --base-url
http://127.0.0.1:8792`:

- `scripts/mid-route.json` — `outcome: completed`, `stopReason: victory`,
  `pageErrors: []`, `consoleErrors: []`, `teardownErrors: []`.
- `scripts/transform-slice.json` — `outcome: completed`, `stopReason:
  victory`, `pageErrors: []`, `consoleErrors: []`, `teardownErrors: []`.

Both under `reports/tasks/T-044/qa-evidence-fresh-3cbc015/smoke/`.

**Fresh n=5 / n=3 sanity batch at HEAD** (not a re-litigation of the
ceiling/floor question decisions.md entry 19 already assigns to the
operator — a route-invariant/regression check that the terrain plus the
newly-combined T-043 wasp behavior didn't break or trivialize anything).
`six-face-aimed-run.json`/`six-face-full-run.json`, `--deterministic
--stop-on-game-over --max-runtime-ms 245000`, single tree (this branch),
not interleaved against a comparison tree (that comparison already has
extensive prior data; this batch's job is "still works," not "how much
better"). Distribution reported, not a mean (decisions.md entry 19):

| policy | n | final scrollX values | floor | ceiling | gate-2 clears (>154) |
| --- | --- | --- | --- | --- | --- |
| aimed (competent) | 5 | 109.79, 153.33, 154.15, 205, 205 | 109.79 | 205 | 2/5 |
| full-run (weak) | 3 | 75, 140, 165.09 | 75 | 165.09 | 1/3 |

All 8 runs: `outcome.result: died`, `stopReason: game-over` (none hit the
245s cap — none reproduced the previously-filed I-038 gate-1 wedge in this
small sample, which is expected since I-038 was itself reported as
intermittent, 3/5 and 1/5, not universal), `idleTimeFraction` 0.010-0.060
(low — no pacing dead spot by this proxy), `pageErrors: []`,
`consoleErrors: []`, `teardownErrors: []` on every run. Floor (dies at gate
1, scrollX 75) and ceiling (full six-face run to 205) both match the
ranges build.md/the prior playtest.md already established; nothing here
moves the qualitative picture, and I am not claiming it does. Raw reports:
`reports/tasks/T-044/qa-evidence-fresh-3cbc015/dist/{aimed,full}-{1..5,1..3}/`.

## 3. Durability — the actual mandate for this pass

Reused the *only* policy in this repo documented to reliably reach face-2
ARRIVAL/ARENA (the reflex `six-face-aimed-run.json`/`t044-capture.mjs`
already use — not re-derived) to get RIG onto the new terrain, then ran a
scripted **abuse phase** at each reachable checkpoint: rapid left/right
reversal every ~55-60ms, `down+jump` drop-through spam on the one-way
catwalks, jump-into-ceiling mash, for 40-60 cycles, then released all keys
and let physics settle 500-600ms before reading position. Ran this **3
times** end to end (new browser each time):

- **ARRIVAL checkpoint** (x≈94-96): after abuse, RIG always landed
  `grounded: true`, `vx≈0, vy≈0`, on solid ground (y 3.00-4.04) — at a
  slightly lower x than the approach (net leftward drift from the
  alternating holds, not a wedge: velocity is genuinely zero, not "stuck
  airborne with residual motion"). No anomaly on any of 3 runs.
- **ARENA checkpoint** (x≈124-126): same — always settles `grounded: true`,
  zero velocity. hp/lives moved between before/after in a way consistent
  with ordinary combat damage and, once, a death+respawn (hp resets to
  full and lives decrements, matching a legitimate life loss, not a stuck
  state) — checked explicitly, not just asserted.
- **Post-abuse responsiveness**: resumed the normal reflex for 6s after
  every abuse phase; RIG kept moving and taking input every time (never
  frozen, never unresponsive).
- **Sanity check** on every sample throughout (x/y/vx/vy finite, `y` inside
  [-50, 200]): **zero anomalies flagged across all 3 runs, 2 checkpoints
  each.**
- `pageErrors: []`, `consoleErrors: []` on all 3 runs.

This covers the terrain a bot can actually reach live (face 2, the same
wave-gate-2 ceiling build.md and the prior playtest.md both already
documented and I did not find a way past either). For faces 3-6, unreached
by any policy in this repo, the durability claim rests on the same static
evidence the prior two gates used and I re-verified rather than re-derived:
`node tools/pathcheck.mjs`'s `latticeUnreachable`/`latticeStranded` sweep
covers all 17 new platforms at 0/0 (reproduced in this run's `2502/0`), and
reading `src/pure/lattice.js` directly, the ARRIVAL/ARENA code path is
uniform across faces 2-6 (one function, a per-face data table — no
face-specific branching that would make faces 3-6 behave differently in
kind), additive-only (`latticeInstallSite` only ever pushes), and gated by
a `laneCapY` skip-not-clamp guard that pathcheck asserts never actually
fires for the shipped seed (i.e., no authored tier can be tall enough to
risk a camera-framing problem the way an unclamped one could). This is the
same limitation build.md and the prior playtest.md both disclosed plainly;
I did not find a new way to close it, and I'm not presenting the static
evidence as equivalent to a live run.

Probe script (QA scratch, not committed to either checkout — reproduction
only): `reports/tasks/T-044/qa-evidence-fresh-3cbc015/durability/qa-t044-durability-probe.mjs`,
run logs alongside it.

## 4. Perf — 60fps at 200+ projectiles (decisions.md entry 18)

Two independent measurements, both against the pinned worktree, both from
inside it (these dev tools don't take `--base-url`):

**Vsync DISABLED** (`lightrig-capture.mjs --perf`, `--disable-gpu-vsync
--disable-frame-rate-limit`, 256 live projectiles via the game's own
`fireWeapon`), 3 repeats:

| run | control avgMs/worstMs/over20ms | stress avgMs/worstMs/over20ms (256 live) |
| --- | --- | --- |
| 1 | 1.46 / 4.5 / 0 | 1.54 / 4 / 0 |
| 2 | (not separately re-read) | 1.36 / 4.2 / 0 |
| 3 | (not separately re-read) | 1.37 / 4 / 0 |

`worstMs`/`over20ms` are the load-bearing fields at vsync-disabled per this
tool's own honesty notes (avg/worst well under the 16.67ms/60fps budget,
`over20ms: 0` — zero dropped frames — in every reading, both with and
without the injected load). No bimodality across the 3 repeats. Draw calls
~162 mean / 171 max, ~107k mean triangles, unaffected by the projectile
count (matches the pooled-instancing design). Full JSON:
`reports/tasks/T-044/qa-evidence-fresh-3cbc015/perf/perf-run{1,2,3}.json`.

**Vsync-locked, the canonical gate** (`juice-stress.mjs`, this dev
machine's panel caps rAF at ~120Hz so `fps`/`avgMs` read against that
ceiling, not 60): control 120.6fps/8.29ms, stress (256 live)
120.4fps/8.31ms, stress-with-`juice=0` 126.4fps/7.91ms — `over20ms: 0` in
all three, `errors: []` in all three.
`reports/tasks/T-044/qa-evidence-fresh-3cbc015/perf/juice-stress-vsync-locked.json`.

Both readings agree: the combined build (T-044's 77-platform lattice plus
the now-merged T-047 shadows / T-048 bloom / T-050 scale-pass backdrop
layers) holds 60fps at 200+ projectiles with large headroom, not a
knife-edge pass.

## 5. Screenshots — judged against boards 13/14 and the visual invariants list

Fresh captures (not re-viewing the pre-merge ones the prior gate took —
these are the first screenshots of this terrain WITH T-047/048/050's
lighting, bloom and scale-pass backdrop merged in), via `t044-capture.mjs`
run from inside the pinned worktree: `f2-arrival.png` (x=94.4, the face-2
ARRIVAL catwalk right after corner 1) and `f2-arena.png` (x=124.1, mid-fight
inside the face-2 ARENA). Both at
`reports/tasks/T-044/qa-evidence-fresh-3cbc015/screenshots/`.

What is visible, checked against `docs/concept-art/README.md`'s "Visual
invariants" list:

- **RIG's silhouette** — found and cropped (4x zoom,
  `screenshots/crops/f2-arrival-rig-crop2.png`): a small pale head-sphere +
  box body standing on the ARRIVAL catwalk edge with the rifle extended,
  muzzle-flash diamond visible, sharing the same pale value family the
  invariants list and T-040 both call for. Measured height in that crop is
  consistent with the ~3.7% figure the invariants doc cites for the
  shipped default. In `f2-arena.png` I could not locate RIG's own body in
  the frame (tried several crop regions; only bullet trails and a weapon
  capsule are clearly identifiable there) — reporting this as "not found by
  me," not as "absent," since he may simply be occluded or off the cropped
  regions I tried at that exact captured instant.
- **Connected-hull surfaces, not floating platforms** — both screenshots
  show the checkered deck as one contiguous structure with catwalk bands
  layered above it and ladders/access panels on the vertical face below;
  matches the prior gate's independent read of the same claim (I did not
  simply re-assert it).
- **Readable route bands** — 2-3 distinct catwalk/deck bands visible at
  once in `f2-arena.png`, consistent with "three-to-five immediately
  readable routes."
- **Macro creature silhouette** — a hazy blue-gray anatomy silhouette
  occupies the upper third of both frames (the T-045/T-050 scale-pass
  backdrop now merged into this build), consistent with "a creature-ship
  macro silhouette visible often enough."
- **Color roles** — deep teal atmosphere, rust-orange deck/catwalk
  structure, a hot-magenta `H` capsule in both frames, warm-white
  muzzle/bullet fire. No acid-green hostile was in either exact frame; a
  green hostile marker (wasp) is visible just outside the crops I pulled.
- No visual glitches, z-fighting, or seams found in either capture at
  normal or 4x zoom.

I am reporting what is visible, not whether it looks good — that judgment
is the operator's, per the six open questions already routed to the
checkpoint queue by build.md (carried below).

## Verdict: PASS

Every hard-gate item is green, reproduced fresh against HEAD `3cbc015`, not
inherited from the stale committed report: pathcheck (2502/0), selftest (39
checks), both smoke scripts (`completed`/`victory`, zero errors), an 8-run
route-invariant sanity batch (zero technical failures, floor/ceiling
unchanged in kind from prior evidence), a targeted durability abuse probe
at both live-reachable checkpoints (3 runs, 2 checkpoints each, zero
wedges/anomalies), and perf held at 200+ projectiles by two independent
measurements (vsync on and off) with large headroom on the now-combined
T-044+T-047+T-048+T-050 build. No softlock, blank page, crash, or
camera-loses-RIG was found or reproduced. The one thing I could not do —
verify faces 3-6 live — is the same, disclosed limitation build.md and the
prior gate both already carried (no policy in this repo clears wave gate
2), and I did not paper over it.

## Operator checkpoint items (feel — not decided here; carried from build.md, unresolved)

URL: `index.html` (default six-face run, no query flags).

1. Does the measured shape (ceiling sometimes reachable, floor mostly
   holds, large run-to-run variance) match "sometimes two or three faces,
   sometimes I can't pass the first" (decisions.md entry 19)?
2. Does the face-2 ARENA read as "the ship is fighting me here on purpose"
   rather than "busier platforms"?
3. Is the ARRIVAL catwalk legible as "the world already existed, revealed"
   at a glance, at speed?
4. Faces 3-6 remain unverified by screenshot by every gate so far (the
   wave-gate-2 bot ceiling) — worth a manual pass before judging the full
   escalation.
5. Should ARENA verticality stay strictly optional footing, or may a tier
   ever be the only safe ground during a wave?
6. Is escalating by structure (tier count, width) rather than literal
   height the right read, given face 6's peak sits slightly lower than
   face 5's for this seed?

## Commands run (for reproduction)

```
# pin + regression
node tools/serve.mjs 8792 --root /Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-044 --quiet
cd .claude/worktrees/T-044 && node tools/pathcheck.mjs

# smoke set, from the MAIN checkout, against the pinned worktree
cd tools/playtest
node run.mjs scripts/mid-route.json --deterministic --base-url http://127.0.0.1:8792
node run.mjs scripts/transform-slice.json --deterministic --base-url http://127.0.0.1:8792

# distribution sanity (n=5 aimed, n=3 full), single tree, --stop-on-game-over
node run.mjs scripts/six-face-aimed-run.json --deterministic --stop-on-game-over --max-runtime-ms 245000 --base-url http://127.0.0.1:8792
node run.mjs scripts/six-face-full-run.json  --deterministic --stop-on-game-over --max-runtime-ms 245000 --base-url http://127.0.0.1:8792

# durability probe (QA scratch script, see evidence dir) and screenshots — run FROM INSIDE the worktree
cd .claude/worktrees/T-044/tools/playtest
node t044-capture.mjs
node lightrig-capture.mjs --tag <tag> --perf
node juice-stress.mjs <outdir>
```

## Evidence paths

- `reports/tasks/T-044/qa-evidence-fresh-3cbc015/pathcheck.log`
- `reports/tasks/T-044/qa-evidence-fresh-3cbc015/smoke/` — selftest log, both smoke script reports
- `reports/tasks/T-044/qa-evidence-fresh-3cbc015/dist/` — all 8 distribution runs, raw `report.json`
- `reports/tasks/T-044/qa-evidence-fresh-3cbc015/durability/` — probe script + 3 run logs
- `reports/tasks/T-044/qa-evidence-fresh-3cbc015/perf/` — 3 vsync-disabled perf.json + 1 vsync-locked juice-stress.json
- `reports/tasks/T-044/qa-evidence-fresh-3cbc015/screenshots/` — f2-arrival.png, f2-arena.png, crops/

## PROPOSED INBOX ISSUES

## I-??? | docs | S3 | repro: `git merge-base --is-ancestor <T-043 commit a2e6d97> 03b775e` (false) and `... 69e1f906262cdebd4bbc7f83f0dd27885e8baa92` (also false), computed at HEAD `3cbc015` | evidence: this report's "What actually changed" section above; `reports/tasks/T-044/build.md`'s "Difficulty measurement" section
`build.md`'s and the previously-committed `playtest.md`'s difficulty-distribution numbers (the ceiling/floor comparison decisions.md entry 19 routes to the operator) were measured entirely before T-043's wasp aim-lock + squad-stagger change (`src/sim/hostiles.js`) merged into this branch — confirmed both arms of that comparison (this branch at `03b775e` and the merge-base `69e1f90`) predate T-043, so the base-vs-branch terrain comparison itself is not confounded by it. But the branch's current HEAD (`3cbc015`, what actually ships if merged) now combines T-044's terrain WITH T-043's wasp changes for the first time, a combination nobody has distribution-tested. Not a defect — my own small fresh sanity batch (this report, §2) found nothing broken — but the existing distribution numbers should be read as "terrain-only, pre-T-043" evidence, not extrapolated as still describing the build that would actually ship. Fix direction: when this or a similar terrain lane next needs a difficulty read, annotate which hostile-behavior commit the measurement was taken against, per LANE-BRIEF's "never inherit a measured number across a change that could move it."
