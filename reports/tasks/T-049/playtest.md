PASS

**UPDATE (re-gate at moved HEAD):** the integrator flagged that `task/T-049`
moved to `4f74259` (merge with `main`) and then `d41d002` while the section
below was written against `89f145f`. `d41d002`'s diff from `4f74259` is
docs-only (11 lines in `preload.js`'s own comments, 20 in `build.md`,
"Documentation only, no behaviour change" per the commit message, confirmed
by `git diff 4f74259..d41d002 -- src/render/preload.js`), and `4f74259` is
the merge-with-main commit itself. Everything below the original section
was re-run fresh against **HEAD `d41d002`** — pathcheck, both smoke scripts,
the task's own `sprite-fallback-check.mjs`/`preload-concurrency-check.mjs`,
and the vsync-off perf probe all reconfirmed clean at the new commit (see
the inline notes below each section). The one genuinely new thing the merge
introduced — **RIG's own sprite (`src/render/player.js`, `rig-marine.png`)
now shares the same `preload.js` gate with this lane's 5 hostile sprites,
the first build where two different owners register through it** — gets
its own new §6 below, per the integrator's specific ask: cross-owner
asset-failure testing, looking for silent starvation. None found. Verdict
is unchanged: **PASS.**

**UPDATE 2 (fresh re-verification, same HEAD, no drift):** re-dispatched to
gate this task a second time; before redoing the ~45 minutes of Playwright
work above, confirmed the worktree HEAD had not moved (`d41d002`, `git status
--short` clean) and spot-re-ran the highest-value claims independently, from
a brand-new `git archive d41d002 | tar -x` scratch copy on a fresh port
(8795, killed after use, never 8741/8742):

- **pathcheck:** `2829 passed, 0 failed` — exact match to the number already
  claimed above for `d41d002`.
- **Both smoke scripts, `--deterministic` against the fresh scratch copy:**
  `mid-route.json` → `completed`, 0 deaths; `transform-slice.json` →
  `completed`, 0 deaths. Matches §2 above.
- **The cross-owner asset-failure test (§6, the point of this task) —
  reran the same four-condition probe against the new scratch copy/port,
  independently:** baseline 6/6 `ready` (35ms); all 5 hostile sprites
  aborted → RIG's sprite still reaches `ready` (21ms), all 5 hostiles
  correctly `failed`, each named in console; RIG's sprite aborted → all 5
  hostile sprites still reach `ready`, RIG correctly shows its named
  procedural-fallback console line; mixed in one run (hound aborted + RIG
  delayed past budget) → hound fails immediately (named), the other 4
  hostile sprites still reach `ready` despite the gate staying open, RIG
  times out at its budget (`2516ms` of `2500ms`, this run vs. `2513ms`
  originally — noise, not drift). `HB.state` stayed `PLAYING` and
  `failsafe` stayed `faults:0 uncaught:0` in all four conditions, both
  times. No silent starvation, no wedge, reproduced independently on a
  second scratch copy and port. Verdict is unchanged: **PASS.**

Playtest gate for `task/T-049` (hostile sprites + `src/render/preload.js`
shared boot-time texture gate). Worktree
`/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-049`, branch
`task/T-049`, current HEAD `d41d002` (originally gated at `89f145f`, see the
update note above). Review already `APPROVE` at `d992d28`
(`reports/tasks/T-049/review.md`); the diff from `d992d28` to `89f145f` is
docs-only (32 lines added to `build.md`, confirmed via
`git diff d992d28..89f145f --stat`), so the reviewed code is exactly what
this gate ran against.

I-039 is out of scope per the dispatch (ruled a harness-determinism finding,
not a gameplay defect) and nothing below relies on `--fixeddt` or treats a
`gameMsMax` spread as evidence of anything. Distributions are reported
throughout, never means (decisions entry 19).

## Worktree hygiene — pinned via `git archive`, not served live

At the start of this gate `.claude/worktrees/T-049`'s `git status --short`
showed **174 lines of staged changes from unrelated tasks** (T-040 and T-044
evidence files, `src/pure/rig.js`, etc.) sitting in its index — a live
instance of the exact "a worktree directory reused across lanes can present
a stray diff" hazard T-049's own build report already filed (`build.md`
§"PROPOSED INBOX ISSUES", second entry). I did not touch the worktree at
all: every test below ran against `git archive 89f145f | tar -x -C <scratch>`
(the pinned-worktree recipe in `tools/playtest/README.md`), served from a
port the team lead didn't reserve. By the time I finished, the worktree's
`git status --short` had gone clean on its own (someone else's cleanup, not
mine) — `git diff --cached --stat` empty, confirmed. No new inbox entry
needed; this corroborates the one already filed rather than adding a
duplicate.

Ports used: 8790 and 8792 (serving two scratch copies against `89f145f`),
then 8793 (a third scratch copy pinned at `d41d002` for the re-gate below).
All killed before finishing. Never touched 8741/8742.

## 1. pathcheck

`node tools/pathcheck.mjs` on the pinned copy: **2748 passed, 0 failed**,
matching `build.md`/`review.md`'s own count. Full output:
`playtest-evidence/qa-pathcheck.log`.

**Re-run at `d41d002`: 2829 passed, 0 failed** — matches the integrator's
own number for the moved HEAD exactly (the merge with `main` absorbed
T-040's RIG sprite and T-044's setpieces, +81 assertions over `89f145f`'s
2748, consistent with `main` moving from 2469 to 2548 while this lane sat in
review).

## 2. Smoke scripts

Both completed on the pinned build, 0 deaths:

| script | outcome | deaths | dispatched | fatal |
| --- | --- | --- | --- | --- |
| `mid-route.json --deterministic` | completed | 0 | 19 | null |
| `transform-slice.json --deterministic` | completed | 0 | 52 | null |

Reports: `playtest-evidence/qa-mid-route-{report.json,summary.md}`,
`playtest-evidence/qa-transform-slice-{report.json,summary.md}`.

**Re-run at `d41d002`** (`--base-url` against the new pinned copy on port
8793): both scripts completed again, 0 deaths both times (`mid-route.json`
dispatched 19/26 same as before; `transform-slice.json` dispatched 52/58).
Reports not separately committed (identical outcome shape to the table
above; the interesting new evidence for this commit is §6 below).

## 3. Durability + the asset-failure path (the point of this task)

Independently reproduced the task's own `sprite-fallback-check.mjs` on my
pinned copy (not inherited from `build.md`): **29 checks, all PASS** — sim
traces identical sample-for-sample (48/48) between art-loaded and
art-network-aborted runs, every kind fails to `'failed'` and still draws a
visibly non-blank primitive body, no failure panel, zero faults, zero
uncaught errors both ways. Full output: `playtest-evidence/qa-sprite-fallback-check.log`.

Then I broke it myself, three ways the dispatch specifically asked for,
against **scratch copies only** (never the worktree):

1. **Physically deleted both hound sprite files** (`hound-brace-{a,b}.png`)
   from a scratch copy. `pathcheck` went red exactly where it should (2
   failures, both the existence assertions, 2742/2 — `playtest-evidence/qa-break-tests.log`).
   Loaded the broken build in a real browser (Playwright/CDP, not synthetic
   DOM events): `hound` reports `state:"failed"`, the other four kinds
   `"ready"`; `HB.state === "PLAYING"`, hostiles still spawn (`hound` and
   `wasp` both present in the roster); `failsafe` shows
   `showing:null halted:false faults:0 uncaught:0`; console names the exact
   file and says "drawing the primitive body instead." Screenshot
   `playtest-evidence/qa-hound-files-removed-fallback.png`: three green
   primitive slabs draw where hounds stand, while the unaffected wasp kind
   still draws as a sprite in the same frame. Nothing blank, nothing wedged.
2. **Delayed the wasp sprite response 4000ms** via Playwright route
   interception (no file changes, on the unmodified pinned tree) — past
   `PRELOAD_BUDGET_MS` (2500ms). The gate closed **at its budget**
   (`costMs: 2512`), did not wait out the full artificial delay, wasp
   reports `state:"failed"` with `"still loading after 2512ms of the 2500ms
   boot budget"`, the other four kinds resident and ready, game stayed
   `PLAYING`, zero faults/errors. Screenshot
   `playtest-evidence/qa-wasp-slow-load-timeout-fallback.png`. This is the
   one shared wall-clock-budget contract (`preload.js`'s own header, point
   3) demonstrated under an actual slow response, not just a 404.
3. **Reverted `settle()` to a private snapshot raced at entry** — the exact
   pre-review regression the file's own header names — and reran
   `preload-concurrency-check.mjs`: 8 of 14 checks flip red, including
   `awaits-first` going fully `refused/refused/refused` (3/3), matching the
   shape `build.md`/`review.md` already documented. Restored; diffed
   byte-identical against the pre-break backup; `pathcheck` clean again
   (2748/0) afterward. Full before/after/restore transcript:
   `playtest-evidence/qa-preload-concurrency-check.log`.

All three break tests land on the same verdict entry 16 asks for: a failed
or slow asset degrades to the primitive body, gameplay does not branch on
it, and nothing wedges. Untested (as `build.md` already discloses): a file
that arrives *corrupt* rather than missing/slow/aborted — same code path in
principle (the loader's error callback) but not separately exercised by me
either.

**Re-run at `d41d002`:** both official tools re-ran clean on the new pinned
copy — `sprite-fallback-check.mjs` all PASS (per-body draw percentages
shifted a few points from the `89f145f` run, e.g. hound 83%→89%, expected
run-to-run noise in the heuristic, not a regression) and
`preload-concurrency-check.mjs` all 14 PASS again, now genuinely exercising
a tree where a real second owner (RIG) shares the gate rather than only the
tool's own synthetic fixtures. See §6 for the real-module version of this
test.

## 4. Hostile readability at true size

Not a fun/looks verdict — evidence for the operator's already-queued
questions in `build.md` (§"QUESTIONS FOR THE OPERATOR", not duplicated
here).

Reran the task's own `sprite-capture.mjs` on my pinned copy (independent of
the committed `artifacts/sprites-v1/` frames): all five kinds spawn and
report `ready` sprite state in the default mode.
`playtest-evidence/qa-lineup-true-size.png` (sprites / primitives / variant
a, stacked) and per-role 1x+4x panels (`qa-role-{hound,wasp,polyp,mortar,carrier}.png`).
At true 1x size every one of the five is a distinct, non-blank silhouette —
I could pick out shape and rough pose (quadruped hound, flying wasp, boxy
hover carrier, iris polyp, tripod mortar) without the 4x blow-up.

A second, non-injected capture: all five kinds spawned at a realistic
spread and distance, RIG firing the real rifle (not injected VFX),
screenshotted mid-fight — `qa-mid-fight-clean-full.png`, with a cropped
region at 1x (`qa-mid-fight-clean-1x-cluster.png`) and 4x
(`qa-mid-fight-clean-4x-cluster.png`). At 1x, all five are findable but read
as small dark silhouettes against a dark teal background — recognizing
*that something is there* is easy, telling *which kind* apart at a glance
(especially the polyp and mortar planted close together) takes more
attention than the old flat-color primitives did. This matches — and is
independent corroboration of — `build.md` §1's own measured finding (sprite
bodies run mean luminance 39–65 against a 44 background vs. the primitives'
94–112) and is exactly the tradeoff the report's operator question 1
already asks about. I am not answering that question; the operator is the
only oracle for whether the tradeoff is acceptable.

One more capture, disclosed rather than hidden: `qa-mid-fight-vfx-occlusion.png`
is a worse-case frame where I deliberately placed an injected death-burst
FX directly over the hostile cluster (a scripting choice on my part, not a
realistic muzzle position) — it substantially occludes the bodies
underneath. This is a known, already-filed class of finding (I-040's
muzzle-flash/dark-panel occlusion item, about RIG rather than hostiles) and
I am not filing it as new; it is here only so the frame that produced it is
traceable rather than quietly discarded.

## 5. Perf — vsync off, 200+ projectiles, distribution not mean

`tools/playtest/sprite-stress.mjs` (the task's own perf tool) is
**vsync-locked by its own honesty notes**, so I wrote an independent probe
(`qa-perf-vsync-off-probe.mjs`) that launches Chrome with
`--disable-gpu-vsync --disable-frame-rate-limit`, saturates the 256-slot
bullet pool via the game's own `fireWeapon()` (12 calls/frame) with a full
five-kind, 10-hostile roster kept alive, and samples raw per-frame ms
directly via `requestAnimationFrame` timestamps (independent of the game's
own aggregated `HB.perf()`). Run twice, ~2 minutes apart, same pinned
build:

| condition | run | live proj. | frames | p50 | p90 | p99 | worst | >16.7ms | >20ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| primitives | 1 | 238 | 3449 | 0.80ms | 3.10ms | 4.20ms | 112.80ms | 2 (0.1%) | 2 (0.1%) |
| sprites | 1 | 237 | 3442 | 0.90ms | 3.10ms | 4.40ms | 127.00ms | 2 (0.1%) | 2 (0.1%) |
| primitives | 2 | 236 | 3751 | 0.90ms | 3.10ms | 3.70ms | 111.80ms | 2 (0.1%) | 2 (0.1%) |
| sprites | 2 | 219 | 3474 | 0.80ms | 3.10ms | 4.10ms | 132.20ms | 2 (0.1%) | 2 (0.1%) |

Full output including the game's own `HB.perf()` cross-read:
`playtest-evidence/qa-perf-vsync-off.log`. 60fps holds comfortably at
230-240 live projectiles with the full hostile roster alive, both ways,
across both independent runs — no distributional difference between
primitives and sprites at any reported percentile.

**Disclosed, not hidden:** both conditions, in both runs, show exactly ONE
frame in the ~110-135ms band that the game's own rolling 180-frame
`HB.perf()` window doesn't capture. It reproduces at nearly the same
magnitude in the **`?sprites=0` control with zero texture loads**, so it is
not attributable to T-049's change — most likely a one-time artifact of
this ad hoc probe's own `page.evaluate()` setup path (a GC pause or a
compositor catch-up after the round trip), not a game defect. Filed here as
a measurement caveat, not a proposed inbox issue, because it does not
differ between the build under test and its own control.

**Re-run at `d41d002`** (RIG's own sprite is now also resident via the
shared gate; `?sprites=0` still only toggles the *hostile* sprites, RIG's
sprite/fallback state is identical in both columns below):

| condition | live proj. | frames | p50 | p90 | p99 | worst | >16.7ms | >20ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| primitives | 237 | 3406 | 1.00ms | 3.10ms | 3.90ms | 112.80ms | 2 (0.1%) | 2 (0.1%) |
| sprites | 242 | 3409 | 0.90ms | 3.10ms | 3.80ms | 132.80ms | 2 (0.1%) | 2 (0.1%) |

Same shape as the `89f145f` numbers above, including the same single-frame
outlier in the same ~110-135ms band in both conditions — reconfirms it is
not new and not attributable to this commit either.

## 6. Cross-owner asset-failure test (the integrator's specific ask)

The merge to `4f74259`/`d41d002` produced the first build where **two
different modules register through the one shared `preload.js` gate**:
`src/render/player.js` (RIG's own 256x256 `rig-marine.png`, one asset) and
this lane's `src/render/sprites.js` via `src/render/hostiles.js` (5 hostile
sprites) — and `main.js` imports `hostiles.js` **before** `player.js`, so
the two owners' registrations land in a real, not-synthetic import-order
relationship. Baseline confirmed first: all 6 assets register and reach
`"ready"`, gate cost 37ms (`playtest-evidence/qa2-cross-owner-break.log`,
condition A) — matches the integrator's own "six assets ready, 33ms" figure
closely.

The specific risk named was **silent starvation**: one owner's asset never
arriving because the other owner's registration closed the gate first, with
no error printed. Tested it four ways, via Playwright route interception
(no file edits, all against the `d41d002` pinned copy on port 8793):

| break | result |
| --- | --- |
| all 5 hostile sprites aborted at the network | **RIG's sprite still reached `"ready"`** (19ms). All 5 hostile kinds correctly `"failed"`, each named in the console, each drawing its primitive body. |
| RIG's sprite aborted at the network | **all 5 hostile sprites still reached `"ready"`** (22ms each). RIG correctly shows `"RIG sprite did not load (error); showing the procedural fallback instead."`, named in console, not silent. |
| mixed in ONE run: hound sprite aborted + RIG's sprite delayed 4000ms (past the 2500ms budget) | hound fails immediately (named); **the other 4 hostile sprites still reached `"ready"` (20ms) despite the gate staying open 2513ms waiting on RIG**; RIG times out at exactly its budget (`costMs: 2513`, message states the real elapsed time), never waits the full artificial 4000ms. |
| (baseline, no break) | 6/6 ready, 37ms. |

**No silent starvation in either direction, and no case where a fast asset
was held back by a slow one beyond the shared budget's own design.** Every
non-ready outcome (failed or timeout) printed a console line naming the
exact file — I grepped for any state that reached `failed`/`timeout`
without a matching console line and found none in any of the four runs.

Visual confirmation, not just state strings: cropped RIG at 6x in the
"hostiles broken" run shows RIG's real textured sprite (helmet, pack,
articulated limbs) — `playtest-evidence/qa2-cross-owner-B-hostiles-aborted-rig-6x.png`
— versus the "RIG broken" run showing RIG's plain flat-shaded procedural
fallback body — `playtest-evidence/qa2-cross-owner-C-rig-aborted-rig-6x.png`
— confirming the mesh swap actually happened, not just that the snapshot
said so. Full frames: `qa2-cross-owner-{B,C}-*-full.png`. Full transcript
of all four conditions (preload snapshot, sprites snapshot, `HB.state`,
`failsafe`, console lines, `pageErrors`): `playtest-evidence/qa2-cross-owner-break.log`.
Probe script: `playtest-evidence/qa2-cross-owner-break-probe.mjs`.

This is the most load-bearing new result of this re-gate: the shared-gate
design (one registry keyed by URL, `GRACE_TURNS`-quieted settlement, one
deadline) holds up under a real cross-module import-order relationship, not
just the tool's own synthetic three-fixture test.

## Verdict

**PASS**, reconfirmed at the moved HEAD `d41d002`. No blank page, softlock,
crash, or lost-progress path found under break-testing beyond what the
task's own report already disclosed and I independently reproduced. The
asset-failure path (missing file, slow load, concurrency race, and now
**cross-owner** — RIG's sprite vs. this lane's 5 hostile sprites sharing one
gate) degrades to the primitive/procedural body every time, on both sides
independently, without the sim branching on it, without silent starvation,
and without wedging. Smoke scripts complete on both commits. 60fps holds at
219-242 live projectiles vsync-off with the full hostile roster (plus RIG's
own sprite) alive, on both commits, with the same single-frame measurement
artifact reproducing identically in the control both times. Hostile
readability at true size is legible but dimmer than the primitives it
replaces — a real tradeoff, already surfaced to the operator in `build.md`,
not a durability defect.

## PROPOSED INBOX ISSUES

(none — no new defect found. The worktree-hygiene hazard and the sprite
contrast/readability finding are both already filed by this task's own
build report and are corroborated, not duplicated, above. The cross-owner
silent-starvation risk the integrator specifically asked about (§6) was
tested four ways and not found — nothing to file.)

## Open questions for the operator

None new. `reports/tasks/T-049/build.md`'s existing "QUESTIONS FOR THE
OPERATOR" section (5 questions, exact URLs against
`http://127.0.0.1:8749` once the integrator serves this worktree) already
covers what my evidence above bears on — sprite-vs-primitive readability,
candidate variant, the drone specifically, and the mortar's stance. I have
additional true-size and mid-fight crops above if they help answer those
same questions; I am not adding new ones.
