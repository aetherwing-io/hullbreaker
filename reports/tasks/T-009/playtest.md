FAIL

Gate: playtester, task T-009 (six-face integration — lattice route density,
dare pockets, hound-2.5 stations, static-anatomy corner reveal as default).
Worktree `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-009`
(branch `task/T-009`, HEAD `770ea6b`; `main` = `16099f6`, which is the branch's
merge base — the branch contains main's tip). This lane was BLOCKED and never
had a first gate, so the whole diff was reviewed, not only the merge.

**One defect fails this gate, and it is the task's own headline feature: the
dare pockets are free.** The authored reward is collected by the deck-line
crossing jump every player has to make anyway — no climb, no shelf, no
retreat. Everything else in the task (route density, static-anatomy default,
`?zip=1` restoration, non-gating stations, 60fps, smoke suite, selftest) is
green and independently verified below. Not failed for feel, and NOT failed
for the full-run script not reaching victory (split to T-018 by integrator
decision) — but the integrator's A/B evidence for that split does not
reproduce, and that is reported loudly under "A/B" below.

## Pinning and runs

Worktree served by `python3 -m http.server 8951` with cwd set to the worktree;
a pristine `git archive main | tar -x` snapshot served on 8952 for the A/B
(no `git worktree add`, so the main checkout's git state was untouched). All
runs used the MAIN checkout's harness at
`/Users/scottmeyer/projects/hullbreaker/tools/playtest`.

```sh
node run.mjs scripts/mid-route.json --deterministic --max-runtime-ms 15000 \
  --base-url http://127.0.0.1:8951 --out runs/gate-T-009-mid
node run.mjs scripts/transform-slice.json --deterministic --max-runtime-ms 20000 \
  --base-url http://127.0.0.1:8951 --out runs/gate-T-009-transform
# A/B, 3 runs per side, identical flags, both trees pinned:
node run.mjs <worktree>/tools/playtest/scripts/six-face-full-run.json --deterministic \
  --max-runtime-ms 150000 --base-url http://127.0.0.1:8951 --out runs/gate-T-009-fullrun-branch[-2,-3]
node run.mjs <worktree>/tools/playtest/scripts/six-face-full-run.json --deterministic \
  --max-runtime-ms 150000 --base-url http://127.0.0.1:8952 --out runs/gate-T-009-fullrun-main[-2,-3]
# ?zip=1 playability (same script, URL override):
node run.mjs <worktree>/tools/playtest/scripts/six-face-full-run.json --deterministic \
  --max-runtime-ms 150000 --url "http://127.0.0.1:8951/index.html?zip=1&testapi=1" \
  --out runs/gate-T-009-zip-[1,2]
node tools/pathcheck.mjs            # in the worktree: 1448 passed, 0 failed
```

Required smoke set — both exit 0, `"result": "completed"`, `testapi` fidelity,
`bootError: null`, zero page/console errors, no retry needed:

| run | result | notes |
| --- | --- | --- |
| `runs/gate-T-009-mid/report.json` | completed | 1 attempt, 0 falls, 0 deaths, dare pocket entered, protoScore 86.6 (proxy) |
| `runs/gate-T-009-transform/report.json` | completed | `BREACH CLEAR`, 1 attempt, 0 deaths |

## What I judged

**1. Default six-face run boots clean and plays — PASS.** `?selftest=1` on the
pinned worktree: title `SELFTEST PASS (29 checks)`. Default run boots to
`PLAYING` with `window.HB` present and no page errors; both smoke scripts
complete (above); six full-run sessions and two `?zip=1` sessions all booted
with `bootError: null` and empty `pageErrors`. Pathcheck in the worktree:
**1448 passed, 0 failed**.

**2. Static-anatomy reveal is genuinely the default; `?zip=1` restores the
zipper intact and playable — PASS.** At runtime with no flags,
`window.HB.g1.pieces === 829` (the static limb bake is on, the zipper's three
render hooks no-op); under `?zip=1`, `HB.g1 === null`. The zipper is not just
resolvable but *played*: both `?zip=1` full-runs cleared wave gate 1 and ran
the corner ritual through to the scroll resuming — `gate-T-009-zip-1` reached
maxX 154.25 / scroll 140 / 10 kills, `gate-T-009-zip-2` maxX 113.40 / scroll 99
/ 8 kills, no errors either time. On the default side, `gate-T-009-fullrun-
branch-3` crossed the same corner (maxX 110.65 / scroll 112). Frames judged for
the rule itself: `artifacts/t009-lattice/merged/02-corner1-static-anatomy.png`
(mid-ritual, `CLEAR` up) shows the next facet already present in haze behind
the joint mass — nothing arrives, nothing slams; `.../06-ab-gate1-default.png`
vs `07-ab-gate1-zip.png` is the same simulated moment with the body present
vs void. I saw **no assembling anatomy** in any default-mode frame I captured
or reviewed. (Honesty: a still cannot prove a 1.1 s ritual; the behavioural
half is pathcheck's whole-trace equivalence between the two modes plus the
zip/default runs above.)

**3. Do the dare pockets cost a measured retreat? — NO. This is the failure.**
Detail and repro in I-019 below. Two independent demonstrations:
- *Shipped sim, headless* (`--input-type=module` child driving
  `src/sim/*` from the worktree, scratch probe): a pure deck-line policy —
  hold right, hold one grounded jump whenever the deck 1.2 tiles ahead is a
  hole or a step, the exact policy pathcheck's own "the run reaches the outro
  scroll end" assertion uses — collects **all six** pocket rewards, with
  `airJumpsLeft` never decrementing (zero air jumps, zero climbs, zero
  leftward movement). Face-1 trace: the crossing jump peaks at y ≈ 5.61 from
  the deck at y = 3, the capsule sits at y = 8.05 ± 0.15 bob, and RIG is 1.7
  tall with a 0.95 pickup radius, so the pickup fires at x = 46.07 / y = 5.44
  while still *ascending*. The geometry is systematic, not seed luck: reward
  height is always `deckY + 5.05` and a held jump reaches `deckY + 2.72`, i.e.
  head at `deckY + 4.42` — 0.48 tiles short of the capsule's bob floor, well
  inside 0.95.
- *Shipped browser build* (`runs/gate-T-009-fullrun-branch/report.json`): the
  bot takes pocket 1's `S` at x = 45.94, airborne, moving right, at 7 908 ms —
  it never turns around.

The wager the design documents (`src/pure/lattice.js` header, `docs/DESIGN.md`
"The lattice", SPRINT accept box 1) therefore does not exist in play. The
pathcheck assertions are all true and all miss it: they prove the *shelf* is
unreachable from the deck (`shelf.y - landingY > doubleApex`) and that the
reward sits within pickup range *of the shelf*, but never that the reward is
out of reach of a jump from the deck. `retreat.seconds` is also a lower bound
(horizontal round trip only, no climb), which was the reviewer's MINOR — that
is a second, smaller issue and is subsumed by this one.

**4. Are the hound stations non-gating? — PASS.** Verified independently of
pathcheck, using the *real* spawn-table rows the shipped run generates: 5
stations, faces 2–6, one per face, every row `gating: false`, each on its own
pocket landing (`owns: pocket-fN-landing`, `deck` matching `landingY`). Driven
through the real gate runtime: with a station alive and the wave killed, corner
1 goes to `turning`; the kind's own default is `gating: true`, so the opt-out is
what changed the outcome. `src/ui/hud.js` counts gaters per-body now, so the
"N HOSTILES" number matches what actually holds the gate. Every hostile in the
codebase is created through `spawnHostile`, so no body can miss the field.

**5. Does 60 fps hold with instancing intact? — PASS (re-measured, not
inherited).** Live `window.HB.perf()` on the pinned worktree, default run,
~35 s of play at 1440×900: **fps 120.2, avgMs 8.32, worstMs 10.4, over20ms 0**
(worst across all polls: 10.4 ms). `?zip=1` on the same machine: fps 119.9,
avgMs 8.34, worstMs 10.3, over20ms 0. HONESTY, per the harness README's
`juice-stress` note: rAF is vsync-locked, so `fps` is capped by this display's
120 Hz refresh and proves only that no frame was late — the load-bearing
numbers are `worstMs` 10.4 ms (against a 16.7 ms 60 fps budget) and zero frames
over 20 ms, on this dev machine, not a target-device claim. Instancing intact:
tiles, the limb bake (829 instanced pieces), bullets, sparks and flashes are
all `THREE.InstancedMesh`; the lattice adds 13 catwalks (49 → 62 platforms) to
the existing tile instance buffer, no new draw path.

**Route density (accept box 1's other half) — PASS, and the DESIGN numbers
check out.** Recomputed both trees myself through the lattice module's own
exports: branch **246/246** face-interior windows read 3–5 routes (histogram
3:119, 4:52, 5:75; per-face averages 3.46–4.22); pinned main scores **149/246**
with face 2 averaging 2.17 (branch 3.46). That matches `docs/DESIGN.md`'s
"149/246 → 246/246, face 2 2.17 → 3.5" exactly.

## A/B — the integrator's stage-4 claim does NOT reproduce (read this)

SPRINT's SCOPE SPLIT and `six-face-full-run.json`'s own `description` record a
one-run-per-side A/B: branch maxX 154.2 / scroll 140 / 11 kills / 48.5 s vs
main 89.2 / 75 / 8 / 27.4 s, i.e. "the lattice tree gets ~1.7× further". Three
runs per side, same script, same flags, both trees pinned:

| | maxX | scroll | kills | end |
| --- | --- | --- | --- | --- |
| branch | 89.25 / 89.25 / **110.65** | 75 / 75 / 112 | 8 / 5 / 9 | GAME_OVER ×3 |
| main | 89.25 / 89.25 / 89.25 | 75 / 75 / 75 | 6 / 7 / 7 | GAME_OVER ×3 |

Both trees fail — that half of the claim holds, and no run of either reached
VICTORY. But 2 of 3 branch runs land on *exactly* main's number (89.25 / 75,
dead in wave gate 1), and the branch's best is 1.24×, not 1.7×. For scale on
the noise: the same branch under `?zip=1` — a render-only flag whose sim
pathcheck proves identical — produced 154.25 and 113.40, i.e. the whole claimed
"lattice effect" is inside the spread of a flag that cannot affect the
simulation. This is the harness's documented multi-modal outcome (README
"Honesty / limitations" #2 and #8), and a single run per side cannot separate
it from a real effect.

The split's *conclusion* survives and is arguably strengthened: both trees die
in the same wave-gate fight at the same x, so the lattice is not what stops the
bot, and stages 1–3 do stand on their own. The *numbers* published as evidence
do not, and they are quoted in a committed script description and in SPRINT.
Filed as I-020.

## Screenshots judged (FAR default view, 1440×900)

- `artifacts/t009-lattice/merged/01-pocket-face1.png`, `03`, `04`, `05` and my
  own in-play captures at the face-1 pocket
  (`<scratch>/shots/play-default-x{44,47,60}.png`,
  `default-six-face.png`, `zip-six-face.png`).
- Board 13/14 invariants hold: RIG measures ~30 px in a 900 px frame ≈ 3.3–3.5 %
  of screen height (board 13's 3–5 %, entry 7's shipped 3.7 % FAR default);
  surfaces read as one connected hull slab with the joint columns and buttress
  as anatomy, not scaffolding; the T-010 palette separates rust deck / teal
  body / acid-green threat / magenta pickup cleanly at distance.
- Nothing visibly assembles in any default frame.
- Known-and-already-queued readability cost, not a new defect: catwalk lanes
  are 2–3 px lines and the capsule glyph is a smudge at FAR — that is the
  operator-queue "Glyph scale at FAR" item plus I-003/I-004, unchanged by this
  task. Routed as an operator question, not a gate finding.

## Feel questions for the operator (never judged here)

1. At FAR, can you *read* the 3–5 route bands as a choice while moving, or do
   they read as texture? (Lanes are 2–3 px at this camera.)
2. Does one houndframe per face on the pocket landing read as "coming for me"
   (entry 6) or as a speed bump, now that it cannot hold a gate?
3. Wave gate 1 stops a reflex bot on both trees; every run here ended in
   GAME_OVER inside a gate. Is gate 1's load right for that point in the run?
   (T-018 owns the harness-vs-difficulty question; the feel call is yours.)
4. Once the pocket wager actually costs something (I-019), is a two-column
   chasm plus a backward shelf enough of a dare, or should the tip hang
   further out?

## Issues filed

- **I-019 | fairness | S1** — dare-pocket rewards are collected by the
  mandatory deck-line crossing jump; the measured retreat never happens.
- **I-020 | docs | S2** — the T-009 → T-018 scope-split A/B does not reproduce
  (3v3 above); direction holds, magnitude does not.

Not filed, already covered elsewhere: the reviewer's `spawner.js`
double-`buildLevel` MINOR (content-identical, asserted deterministic) and the
FAR glyph/lane readability cost (existing operator-queue item).
