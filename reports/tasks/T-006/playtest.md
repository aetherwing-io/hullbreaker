PASS

T-006 — rib run, the authored slope (`?ribrun=1`, `src/pure/ribrun.js`).
Gate run 2026-08-01 against a pinned worktree; every number below comes from
a run committed under `tools/playtest/runs/gate-T-006-*`.

## Pin

Worktree under test: `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-006`
at `470bc14` (merge of `main` @ `04b6a65` into `task/T-006`), served with
`python3 -m http.server 8806` from that worktree, killed after the batch.
Control tree: the merge base `04b6a65` extracted with `git archive` into the
session scratchpad and served on `8807` — this is the "flag absent" reference
for the no-op claim, and it is the *right* control rather than current `main`,
because `main` moved past the merge base during this gate (`src/main.js`,
`src/mode.js`, `src/pure/score.js`, `src/sim/{player,score}.js` all changed
with T-016's CP4 score/setback merge).

Harness: the main checkout's `tools/playtest`. **Honesty note:** `main` merged
T-016 at 10:31 local, mid-batch, which changed `lib/{metrics,report,sampler}.mjs`
underneath my first two runs (exactly the moving-tree hazard the harness README
warns about). Both required smoke runs were **re-run after that merge**, so
every capture reported here was produced by one harness version (`main` @
`59a6501`, verified unchanged before and after the re-runs).

## Required runs — both green

```sh
cd /Users/scottmeyer/projects/hullbreaker/tools/playtest
node run.mjs scripts/mid-route.json --deterministic --max-runtime-ms 15000 \
  --base-url http://127.0.0.1:8806 --out runs/gate-T-006-mid            # exit 0
node run.mjs scripts/transform-slice.json --deterministic --max-runtime-ms 20000 \
  --base-url http://127.0.0.1:8806 --out runs/gate-T-006-transform      # exit 0
```

| run | `outcome.result` | bootError | pageErrors | console errors |
| --- | --- | --- | --- | --- |
| `gate-T-006-mid` | **completed** | none | 0 | 0 |
| `gate-T-006-transform` | **completed** | none | 0 | 0 |

No retry was needed — no transient `bootError` in the batch.

## The task's own script, and the sustained-momentum claim

```sh
node run.mjs /Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-006/tools/playtest/scripts/ribrun-climb.json \
  --deterministic --max-runtime-ms 15000 --base-url http://127.0.0.1:8806 \
  --out runs/gate-T-006-ribrun                                          # exit 0
```

**completed / VICTORY at 4.4s**, attempt 1, **0 falls, 0 hull fallbacks, 0 hits
taken**, idle fraction **0.0**, airborne 3.7s of 4.4s PLAYING (**84%**), crush
margin 35.44 tiles, vertical range y 3.35 → 16.97 (span 13.62 — the authored
12-tile climb plus the arc). Inside the script's own stated EXPECTED band
(completed 4.5–5.5s, hp 3, 0 falls, crest y 15+); it came in slightly *faster*
than the band's floor, which is the harmless direction.

**Zero-timed-jump check.** The builder's acceptance script is not zero-timed-
jump: it fires 12 metronome taps at the tread period and uses policy only for
`hold right` + a `pinned` backstop (which fired **0 times** — the geometry never
handed the run back). So I wrote the missing control myself and ran it:
`ribrun-policy-only.json` (scratchpad copy: `runs/gate-T-006-ribrun-policyonly/`
carries the `report.json`; the script body is quoted in that report's
`script.description`) — **zero scripted events**, all input reflexive:
`x<80 → hold right`, `grounded → tap jump` (hop on the landing edge, no clock),
`pinned → tap jump` backstop.

Result: **completed**, 0 scripted events / 8 policy taps, attempt 1, **0 falls,
0 hits**, idle fraction 0.015, airborne 4.4s of 4.9s (**90%**), **0 air jumps
spent**, crest reached (y max 18.17). The rib climbs on a purely reactive
land-and-hop with no route knowledge and no timing table, which is the strongest
machine evidence available for "the slope makes the momentum, not a memorised
cadence." Note the small honest wrinkle: the *metronome* variant spends 1 air
jump, the reactive variant spends 0 — the script description's headline
"air jump never spent" is a headless-sim measurement and holds for the reactive
policy, not for every browser run of the timed one.

## Flag off by default — verified as a no-op, not asserted

`src/mode.js` gates `RIBRUN_ENABLED` on `IS_TRAVERSAL_SLICE && ribrun=1`, but the
task also edits `resolveTraversalPace` in `src/pure/traversal.js` (reward cull +
`hostileFree` roster), which is on the *shipped* path for every pace. So I ran
the same script against both trees:

```sh
node run.mjs scripts/mid-route.json --deterministic --max-runtime-ms 15000 \
  --base-url http://127.0.0.1:8807 --out runs/gate-T-006-mid-BASE       # exit 0, control
```

`gate-T-006-mid-BASE` (base) vs `gate-T-006-mid` (worktree): **protoScore 84.4
in both**, idle 151ms in both, crush margin 35.44 in both, same route coverage,
same dare-pocket columns, vertical span 8.69 in both; the only differences are
`airMs` 5047 vs 5054 and y-max 12.10 vs 12.11 — sampling-noise scale.

Because the base pace exercises neither a pace roster nor pace rewards, I also
A/B'd a loaded configuration, 3 runs a side, `--url .../index.html?slice=traversal&pace=surge&hound=2.5&testapi=1`
(`runs/gate-T-006-surge-{WT,BASE}[-2,-3]`):

| side | crush margin | hits | protoScore |
| --- | --- | --- | --- |
| worktree | 5.49 / 6.84 / 6.83 | 1 / 0 / 0 | 76.6 / 69.5 / 71.1 |
| base | 6.83 / 6.83 / 6.82 | 0 / 0 / 0 | 72.0 / 68.5 / 68.6 |

Two of three worktree runs land on the base's exact crush-margin value with the
same hit count; the third is an outlier *within the worktree side's own spread*,
consistent with the documented hostile-contact knife-edge non-determinism, not a
systematic shift. Conclusion: the shipped path is behaviorally unchanged with the
flag absent. `node tools/pathcheck.mjs` in the worktree: **832 passed, 0 failed**
(exit 0).

## Screenshots — what I actually looked at

- `runs/gate-T-006-ribrun-early/screenshot.png` (~0.6s) and
  `runs/gate-T-006-ribrun-midclimb/screenshot.png` (~2.4s): purpose-cut captures
  so the end-of-run frame lands *mid-ribline* instead of under the victory
  overlay, at the shipped FAR default.
- `runs/gate-T-006-ribrun/screenshot.png`: the TRAVERSAL CLEAR frame (4.4s ·
  0 kills · 1 air jump · margin 35.4 · 0 falls · 0 hull fallbacks).
- `runs/gate-T-006-mid/screenshot.png`, `runs/gate-T-006-transform/screenshot.png`:
  the smoke runs, for style comparison against the shipped lattice.

**Static-anatomy rule (decisions.md entry 3): holds.** The upper treads and the
crest are already present in the 0.6s frame, several risers ahead of RIG, and the
2.4s frame shows the same geometry with RIG and the camera advanced across it.
Nothing assembles, slams, or articulates into place — the rib pre-exists and is
revealed by motion, which is exactly the rule.

**FAR readability: the ascent reads, the anatomy does not (yet).** RIG measures
~3.5% of frame height, inside the 3–5% invariant and matching the shipped FAR
default. The riser/tread rhythm is legible at distance — the next tread is always
visible before the hop, which is what a movement bench needs. Against boards 10
and 13, though, the long diagonal reads as a *staircase of separated slabs*, not
the continuous armored limb those boards draw: no scute rhythm, no rust-orange
plating against the teal, and the one-way rib flanges render as faint 2px dashes
hanging under each lip. Two things keep this out of the FAIL column: it is the
project's existing traversal greybox convention rather than a new style break —
the default-lattice smoke screenshot shows the same slab-and-floating-dash
vocabulary — and the flag is off by default, so nothing ships this look. It is
also *already* the operator packet's question 1 ("does 1 read as one continuous
ascent, or as a staircase climbed one step at a time?"), which is the correct
place for it. No glitches, no z-fighting, no clipped HUD, no dead spots (idle
fraction 0.0/0.015 across the two rib runs).

## Not judged here

Whether the rib is *fun*, whether it beats FLOW, whether the per-riser press
reads as momentum or as work, and whether the crest playing high in frame
(traversal camera follows x only, disclosed by the builder in the packet) is
acceptable — all feel, all queued in SPRINT's operator checkpoint queue as the
RIB RUN vs FLOW packet. See notes below for the questions this gate would add.

## Issues filed

`I-013` (harness, S3) — route/dare-pocket metric columns are wrong under
`?ribrun=1`. Documented honestly by the builder in the playtest README, but
untracked until now.
