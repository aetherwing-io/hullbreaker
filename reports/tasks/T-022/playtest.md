PASS

# T-022 — earned pace escalation (`?momentum=1`) — playtest gate

Tree under test: `task/T-022` @ `e6e188a` in
`/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-022`, pinned behind
`python3 -m http.server 8998` (cwd = that worktree) for every run below. The
harness is the **main checkout's** copy (`tools/playtest/run.mjs`), driven with
`--base-url`/`--url` so nothing under test moved mid-batch. A `main` checkout was
served in parallel on 8999 as an in-session control for the flag-off A/B.
`node tools/pathcheck.mjs` in the worktree: **1600 passed, 0 failed**.

Verdict is about the CONTRACT (floor / ceiling / earned / determinism / flag
scoping / frozen constants), not about whether escalation is fun. Feel is routed
to the operator questions at the bottom.

## 1. Required smoke set — both `completed`, exit 0, no bootError, no retry needed

```sh
cd /Users/scottmeyer/projects/hullbreaker/tools/playtest
node run.mjs scripts/mid-route.json      --deterministic --max-runtime-ms 15000 \
  --base-url http://127.0.0.1:8998 --out runs/gate-T-022-mid
node run.mjs scripts/transform-slice.json --deterministic --max-runtime-ms 20000 \
  --base-url http://127.0.0.1:8998 --out runs/gate-T-022-transform
```

| run | `outcome.result` | bootError | pageErrors / consoleErrors |
| --- | --- | --- | --- |
| `runs/gate-T-022-mid` | **completed** | null | 0 / 0 |
| `runs/gate-T-022-transform` | **completed** | null | 0 / 0 |

## 2. FLOOR — a struggling run is still carried, and escalation cannot make it worse

Two independent probes, neither of them a code reading.

**(a) The worst possible player: no input at all.** Own Playwright probe, six-face
run at `?momentum=1&testapi=1`, 1440x900, **zero keypresses for 25 s**
(`scratchpad/t022-ceiling/ceiling.json` → `idleFloor`): `pursuitSpeed` = **4.300
t/s on every sample, max drive 0.000**, HUD `MOMENTUM ▱▱▱ ×1.00` throughout — and
the HUD's own distance readout reaches **75 m** without a key ever being pressed.
A player who does nothing is conveyed forward at exactly the shipped speed and is
never escalated at.

**(b) Same weak policy, flag ON vs flag OFF, same build** (`momentum-weak.json`,
`--deterministic`, 1440x900, 62 s cap; flag-off runs use
`--url http://127.0.0.1:8998/index.html`):

| run | pursuitSpeed median / peak | drive max | samples above floor | maxX | maxScroll | lives spent |
| --- | --- | --- | --- | --- | --- | --- |
| `gate-T-022-weak-1` (flag on) | 4.300 / 4.336 (×1.008) | 0.021 | 2/300 (0.7 %) | 59.6 | 75.0 | 3 |
| `gate-T-022-weak-2` (flag on) | 4.300 / 4.406 (×1.025) | 0.062 | 35/301 (11.6 %) | 59.6 | 75.0 | 3 |
| `gate-T-022-weak-noflag-1` | 4.300 / 4.300 (×1.000) | 0.000 | 0/363 | 59.6 | 75.0 | 3 |
| `gate-T-022-weak-noflag-2` | 4.300 / 4.300 (×1.000) | 0.000 | 0/301 | 59.6 | 75.0 | 3 |

Escalation does **not** shorten a struggling run: reach (`maxX` 59.6, `maxScroll`
75.0) and stock spent (3) are identical on all four, flag on or off. The weak
policy never once passed the ×1.12 combat-only bound the packet gates on
(`aboveX1.12 = 0` in both flag-on runs) — the daylight deadband held.

**Setback behaviour, measured in-run** (`gate-T-022-strong-1/-2` traces): on every
hit where drive was above `hitDrive`, the next sample (≤ 75 ms, one poll) reads
**exactly 4.902 t/s = drive 0.350** (e.g. strong-1 `5503:5.154 → 5654:4.902`);
where drive was already below it, the value **freezes flat** for the mercy window
(strong-2 `30118..30425: 4.706` unchanged) — capped, not cleared, as specified.
After each life loss the trace returns to **exactly 4.300**. One apparent rise
inside a mercy window (strong-2, +0.003 t/s at 33393 ms, 1450 ms after the observed
hp drop) is poll granularity, not a leak: the hp drop is observable up to one
75 ms interval after the frame it landed on, so the 1500 ms window had already
expired — and the magnitude is one frame of `risePerSec`.

**What this cannot show, honestly:** *no bot has ever finished the six-face run*
(`docs/playtests/2026-08-victory-box.md`: every reflex policy dies in wave gate 2
at scroll 140 of 415), so "a struggling player can still **finish**" is not
falsifiable by this harness in either direction. What is shown is the falsifiable
half: a struggling run's world is the shipped world — same pace, same reach, same
deaths — so escalation cannot be what makes it unfinishable. Routed as an operator
question below.

## 3. CEILING / RUNAWAY — the top is exactly ×1.4, and the frame budget does not move

Own probe (`scratchpad/t022-ceiling2.mjs`), which drives the **shipped live
modules** (`import('/src/sim/pace.js')` in page context resolves to the same module
instance the sim uses) rather than a reimplementation: it over-drives the earned
drive 20:1 against the sim's own per-frame call with an ideal-player ctx (pinned to
the right clamp, killing every step, unhurt) while the 256-slot projectile pool is
saturated by the same injection `tools/playtest/juice-stress.mjs` uses.

- **`pursuitSpeed` saturates at exactly 6.0200 t/s = ×1.4000** and never exceeds it,
  with the drive pushed far past what play can produce.
- **The world really moves at it:** measured `d(scrollX)/d(gameMs)` over the
  saturated window = **6.014 t/s**, independent of the telemetry field and the HUD.
- **Hard-ceiling chokepoint, read off the live page:** `momentumClampSpeed(999)` =
  **7.31** (= `hardCeilMult` × 4.3), `momentumClampSpeed(0.1)` = **4.30**,
  headroom **1.29 t/s** left above escalation's own ceiling for T-023.
- **Frame budget at the ceiling with 256 concurrent projectiles**, read from the
  game's own wall-clock sampler `HB.perf()` (180-frame ring):
  **fps 120 (vsync-capped panel), avgMs 8.33, worstMs 9.3–9.4, over20ms 0** in
  steady state — *identical* to the flag-off control under the same injected load
  (worstMs 9.3, over20ms 0). The 116–125 ms `worstMs` both sides show for the first
  ~1.4 s is the page-load frame ageing out of the ring, not escalation.
  Per `juice-stress.mjs`'s own honesty note: rAF is vsync-locked, so `worstMs` and
  `over20ms` are the load-bearing numbers, and this is a dev machine in headless
  Chrome, not a device claim.
- **No entity runaway in real play:** concurrent hostiles peak at 9 (p90 7) in the
  escalated strong runs vs 6–7 (p90 6–7) in weak/flag-off — consistent with the
  ×1.4 cadence scale, nowhere near a readability cliff.

Probe artifact worth stating: after the first life loss my injected ctx and the
sim's real ctx disagree about `lives`, which re-triggers the death reset every
frame, so the saturated window is the ~3 s before that. That window is what the
numbers above are taken from.

## 4. EARNED — a strong and a weak policy diverge on the same build and the same URL

Both scripts are the branch's own operator packet, run from the main harness
against the pinned worktree, `--deterministic`, 1440x900, `--max-runtime-ms 62000`,
both at `index.html?momentum=1`:

| run | pursuitSpeed median / p90 / peak | drive max | above floor | above ×1.12 | edgeMargin median | kills | maxScroll |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `gate-T-022-strong-1` | 4.435 / 5.083 / 5.439 (**×1.265**) | 0.662 | 275/452 (60.8 %) | 130 | 36.2 | 8 | 118.4 |
| `gate-T-022-strong-2` | 4.580 / 5.156 / 5.504 (**×1.280**) | 0.700 | 485/605 (80.2 %) | 176 | 43.4 | 11 | 140.0 |
| `gate-T-022-weak-1` | 4.300 / 4.300 / 4.336 (×1.008) | 0.021 | 2/300 (0.7 %) | 0 | 11.9 | 2 | 75.0 |
| `gate-T-022-weak-2` | 4.300 / 4.312 / 4.406 (×1.025) | 0.062 | 35/301 (11.6 %) | 0 | 11.9 | 3 | 75.0 |

That is a **12–13×** separation in "fraction of the run spent above the shipped
pace" between two policies on one build. It is also not a ramp in disguise: within
a single strong run the 5-second drive buckets go
`0.165 → 0.392 → 0.414 → 0.023 → 0.096 → 0.079 → 0` — escalation *falls back* when
the play falls off, at the same elapsed times where the weak run reads 0 flat. An
elapsed-time ramp cannot do that. (Cross-checked structurally, not by decimals:
see the spread note in §7.)

## 5. Determinism, and no wall-clock input

Closed-loop policies cannot answer this (their inputs are a function of the run), so
I wrote a **fixed-timeline** script with no policy at all — hold right + hold fire
for 30 s at `?momentum=1`, identical bytes every run
(`scratchpad/t022-fixed-hold.json`):

| pair | peak pursuitSpeed | drive max | samples above floor | maxX / maxScroll |
| --- | --- | --- | --- | --- |
| `--deterministic` + `&fixeddt=16.667` ×2 | 4.545 / 4.545 | 0.142 / 0.142 | 25/66 / 25/66 | 31.6 / 42.5 both |
| `--deterministic`, shipped variable dt ×2 | 4.526 / 4.529 | 0.131 / 0.133 | 53/132 / 52/132 | 31.6 / 43.1 both |

Sim-time-locked input at a fixed step reproduces the escalation curve **exactly**;
at the shipped variable timestep it reproduces to 0.07 % on peak speed — i.e. the
residual is the frame-cadence noise the harness README already documents (honesty
items 4 and 8), not a wall-clock term. Confirmed independently: no `Date.now`,
`performance.now`, `new Date` or `Math.random` in `src/pure/momentum.js`,
`src/sim/pace.js`, `src/sim/scroll.js`, `src/sim/level.js` — the drive's `nowMs` is
`gameMs`, the sim clock. Pathcheck also asserts an in-process byte-identical replay.

## 6. Flag off by default — every other URL is unchanged

- **Fixture scoping, probed in a browser** (not read off `mode.js`): with
  `?momentum=1` explicitly present, `?slice=traversal` still reads
  `pursuitSpeed 2.600` and `?slice=transform` still reads `3.200`, and neither HUD
  carries a MOMENTUM readout. Six-face with the flag: 4.511 and
  `· MOMENTUM ▱▱▱ ×1.05`. Six-face without it: **4.300** and no readout.
- **Committed demo metrics unchanged.** `mid-route` ×3 on the worktree vs ×3 on a
  `main` checkout served in parallel: `minEdgeMargin` 35.39–35.41 (WT) vs
  35.41–35.42 (main) vs 35.44 committed; final x 72.04–72.08 vs 72.03–72.09 vs
  72.05; routes/kills identical. `transform-slice`: completed, minEdge 30.07 vs
  30.13 committed, final x 146.08 vs 146.01, same route ids.
  `protoScore` moves 86.2–92.9 on the worktree and **70.9–92.6 on `main` in the same
  session** — the spread is the game's own (airborne time on a hop-timed script),
  demonstrably not this branch's, which is why the control tree was run at all.
- Flag-off six-face runs read `pursuitSpeed` **exactly 4.300 on 100 % of 664
  PLAYING samples** across the two `weak-noflag` runs.

## 7. Frozen movement/jump constants

`git diff main...HEAD -- src/config.js` is **additions only — zero deletion or
modification lines**. The new `momentum:` block sits above the `player:` block;
`runSpeed`, the accels and the jump tune are untouched, and the worktree's own
pathcheck (which asserts the frozen tune) is green at 1600/1600.

## 8. Screenshots — judged at the shipped FAR default, 1440x900

`scratchpad/t022-shots/` (also `tools/playtest/runs/gate-T-022-*/screenshot.png`):

- `t022-far-flagoff.png` vs `t022-far-momentum-inplay.png` — same seed, same 3 s
  point: **visually identical** apart from the HUD suffix `· MOMENTUM ▱▱▱ ×1.05`
  and the small scroll offset escalation itself produces. No new render elements,
  no palette change, no camera change.
- `t022-far-ceiling-inplay.png` — pinned at ×1.40: deck silhouette connected,
  catwalk lanes separable, RIG legible at roughly 3.4–3.8 % of screen height
  (invariant: 3–5 %).
- `t022-far-ceiling-256proj.png` — ceiling pace **plus a saturated 256-projectile
  pool**: the screen still reads. Projectiles stay small dots against the teal
  ground, RIG's silhouette and the deck edges survive the load.
- **No assembling anatomy** in any frame: the only thing this task moves is a scalar
  pace/spawn-cadence value; nothing in `src/render/` changed (decisions.md entry 3
  untouched). Style matches `docs/concept-art/` boards 13/14 as before — this branch
  adds no art.

## 9. Evidence paths

- `tools/playtest/runs/gate-T-022-mid`, `-mid-2`, `-mid-3`, `-mid-MAIN`, `-mid-MAIN-2`, `-mid-MAIN-3`
- `tools/playtest/runs/gate-T-022-transform`
- `tools/playtest/runs/gate-T-022-strong-1`, `-strong-2`
- `tools/playtest/runs/gate-T-022-weak-1`, `-weak-2`, `-weak-noflag-1`, `-weak-noflag-2`
- `tools/playtest/runs/gate-T-022-det-1`, `-det-2`, `-det-fdt-1`, `-det-fdt-2`
- probes + screenshots (scratchpad, not committed):
  `/private/tmp/claude-501/-Users-scottmeyer-projects-hullbreaker/474930e2-7e23-4651-9683-c17c797cb579/scratchpad/`
  → `t022-ceiling.mjs`, `t022-ceiling2.mjs`, `t022-shots.mjs`, `t022-fixed-hold.json`,
  `t022-an.mjs`, `t022-ceiling/{ceiling.json,ceiling2.json,ceiling2-stress.json}`,
  `t022-shots/*.png`

## 10. Honesty notes on this gate

- Two runs per policy is a small sample; run-to-run spread on this build is real.
  My independent repeats landed outside some bands quoted in the two packet script
  descriptions (weak "above the floor on 11.6 % / 24.2 %" vs my 0.7 % / 11.6 %;
  strong GAME_OVER "43.9 / 42.7 s" vs my 34.2 / 46.0 s). The **structural** gap the
  descriptions tell you to read held in every pair, which is what §4 argues from;
  filed as **I-029** so a later gate does not read those decimals as a baseline.
- Drive is recoverable from a trace only by inverting `pursuitSpeed`, which is
  exact today and stops being exact once T-023's boosts share the same clamp —
  filed as **I-030** (forward-looking, no impact on this verdict).
- The ceiling was reached by injecting an ideal-player ctx into the shipped module,
  because no available bot policy earns drive 1.0 in play. That proves the clamp and
  the scroll response; it does not prove a human can hold ×1.4 for long.
- Frame numbers are from headless Chrome on this dev machine at 1440x900 with a
  vsync-capped 120 Hz reading; `worstMs`/`over20ms` are the meaningful fields.

## 11. Operator questions (feel — not gated here)

Suggested checkpoint entry, URL `index.html?momentum=1` (compare against plain
`index.html`), with `momentum-strong.json` / `momentum-weak.json` as the packet:

1. At a good run's measured band (×1.2–×1.28, peaking ×1.27–×1.4) does the pursuit
   read as *the run answering you*, or just as "the screen got faster"?
2. Is the ×1.12 bound on a struggling player's own escalation (kills only, no
   daylight) generous enough to feel like a reward, or so small it reads as nothing?
3. Relief is tuned faster than escalation (2.2 s to shed, 6.25 s to earn) and a hit
   caps drive at 0.35 rather than clearing it. Does backing off after a hit read as
   mercy, or as the game losing interest?
4. A struggling player is carried at exactly the shipped 4.30 t/s forever. Is "the
   floor is the shipped run" the right floor, or should falling behind *slow* the
   plane (the bot cannot answer this; it is the entry-11 "pushed along while they
   learn" half that no machine gate can verify).
5. At the ceiling a clamped RIG crosses ground at 6.02 t/s instead of 4.30. Does
   anything you land on feel like it needs a re-tune at that speed (overshoot on
   short ledges), or does the extra reach feel earned?
