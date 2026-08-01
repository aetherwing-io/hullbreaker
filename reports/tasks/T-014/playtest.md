PASS

# T-014 playtest gate — Spore Mortar (`?mortar=1` / `?mortar=2`)

Worktree under test: `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-014`
(branch `task/T-014`, head `9dd13b1`; merge-base with `main` = `910f239`, and
`main` carries **no** `src/` or `index.html` commits since that base, so the
runtime delta under test is exactly this branch's 24-file diff).

Pinned for every run: `python3 -m http.server 8782` with cwd set to the
worktree (and `8783` on the main checkout, for the default-off A/B only).
Both servers killed at the end of the gate.

## Runs

Required smoke set (MAIN checkout's harness, `/Users/scottmeyer/projects/hullbreaker/tools/playtest`):

```sh
node run.mjs scripts/mid-route.json       --deterministic --max-runtime-ms 15000 \
  --base-url http://127.0.0.1:8782 --out runs/gate-T-014-mid
node run.mjs scripts/transform-slice.json --deterministic --max-runtime-ms 20000 \
  --base-url http://127.0.0.1:8782 --out runs/gate-T-014-transform
```

Both exited 0, first try, no retry needed — no `bootError`, zero page errors,
zero console errors, `testapi` fidelity, and `"result": "completed"` in each
`report.json`.

| run | result | attempts | idle fraction | minEdgeMargin | protoScore (proxy) |
| --- | --- | --- | --- | --- | --- |
| `runs/gate-T-014-mid` | completed | 1 | 0.024 | 35.41 | 84.6 |
| `runs/gate-T-014-transform` | completed | 1 | — | — | 288.0 |

Task-named scripts. These live on the branch and use the `mortarMarked` /
`mortarLob` / `mortarFuse` / `mortarBurst` predicates that `main`'s
`lib/policy.mjs` does not have yet, so they were run with the **worktree's**
harness copy against the same pinned server (same tree serving and computing,
per the harness README's `--base-url` caveat #3):

```sh
cd /Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-014/tools/playtest
node run.mjs scripts/mortar-zone-deny.json   --deterministic --max-runtime-ms 17000 \
  --base-url http://127.0.0.1:8782 --out <main>/tools/playtest/runs/gate-T-014-mortar-solo
node run.mjs scripts/mortar-hound-stack.json --deterministic --max-runtime-ms 17000 \
  --base-url http://127.0.0.1:8782 --out <main>/tools/playtest/runs/gate-T-014-mortar-combo
```

- **solo (`?mortar=1`)** — completed (TRAVERSAL CLEAR), 1 attempt, 0 falls,
  hp 3/3, x 27.50 → 72.02. The emplacement walked its whole machine on its own
  clock: `aim`(63ms) → `lob`(2555) → `fuse`(3463) → `burst`(4146) → `cool`(4371).
- **combo (`?mortar=2`)** — completed, 1 attempt, 0 falls, hp 3/3, 0 hull
  fallbacks, x 27.50 → 72.05. Both threats engaged off one decision: mortar
  `lob@2564 → fuse@3472 → burst@4163 → cool@4385` while the hound ran
  `prowl → tell@3855 → charge@4385 → skid@4618`.

`node tools/pathcheck.mjs` in the worktree: **1048 passed, 0 failed**.

## What I judged

**The movement answer is real, not just marked.** The zone is authored at
x = 59.5, y = 5.35 on `platform:post-mid`, slab x ∈ [58.0, 61.0]. In the solo
trace the bot's *own* chosen route runs straight across it — grounded at
y = 5.35 from x = 58.07 through x = 64.63 — so the denial sits on a line the
bot wants, not on a decoration. The answers exist and are exercised:

- **crossing / landing long** — the bot crossed during `fuse` and was clear at
  x = 62.21 when the slab went live: 0 damage. `pathcheck` asserts the same
  catwalk keeps ≥ 2 tiles past the mark, that one full jump from the shared
  roof lip clears the whole patch, and that one jump outlasts the whole
  `burstMs` — for the normal tune *and* every pace tune.
- **a different connector** — `post-high` (the tripod's own catwalk) and
  `post-low` (the floor below) are asserted to be real connectors on real
  routes and outside the slab, and exactly one authored connector is ever
  inside the denial.
- **standing in it is what costs.** I wrote a gate-only script
  (`<scratchpad>/gate-mortar-stand.json`, not committed) that reuses the
  committed approach skeleton but parks the bot mid-strip: it stopped at
  x = 60.02 and hp went **3 → 2** on the `burst` sample. The mechanic denies
  what it says it denies.

**The flag is off by default and inert elsewhere.** Same-instant probe of both
servers (`<scratchpad>/gate-t014-probe.mjs`):

| URL | worktree (8782) | main (8783) |
| --- | --- | --- |
| `?slice=traversal` | 2 wasps, `BASE · 2 HOSTILES` | identical |
| `?slice=traversal&hound=1` | 3 hounds + 2 wasps, `BASE + HOUND SOLO · 5` | identical |
| default six-face | 2 wasps | identical |
| `?mortar=1` on the six-face run | 2 wasps (flag ignored off-slice) | n/a |
| `?slice=traversal&mortar=0` | back to the 2-wasp base plan | n/a |

`mid-route --deterministic` run against **main** for the same comparison came
back structurally identical: completed / 1 attempt / 0 falls / 0 kills / 1 hit
survived, idle fraction 0.022 vs 0.024, `minEdgeMargin` 35.44 vs 35.41, same
route inference. `airMs` (5.6s vs 5.1s) and `protoScore` (90.8 vs 84.6) differ
inside the band the harness README documents for repeat deterministic runs
(honesty items 2/4/8), so I read that as noise, not behavior.

**The combination exists only after the solo teach.** `?mortar=1` fields
exactly one hostile (`mortar@64.60,9.40:aim`) so every point of damage in the
teach stage is attributable; `?mortar=2` fields exactly two
(`mortar@64.60,9.40` + `hound@58.24,3.45` — the hound on the floor directly
under the marked patch, which is DESIGN's combine column played literally).
Any unrecognized value (`?mortar=x`) resolves to **solo**, never to the
combination, and `pathcheck` asserts the trial is exactly teach-then-one-pair.

**Screenshots — FAR readability, style, static anatomy.** I did not rely on
the builder's frames alone; I captured my own at the shipped default view
(no `?view=`, so FAR) with `<scratchpad>/gate-t014-capture.mjs`, one frame per
beat, 1280×800: `<scratchpad>/gate-far/solo-{lob,fuse,burst}.png` plus 3×
crops `zoom-solo-*.png`.

- The tell reads at FAR. The marked pad (amber) is the loudest element of the
  group and sits on the landing surface; the warning column above it is warm
  and deliberately dim during `fuse`, then goes bright for exactly the burst
  frames. Lob → fuse → burst is legible as three different states without the
  HUD. RIG measures ≈ 3.5% of screen height in these frames, inside board 13's
  3–5% and consistent with entry 7.
- The denial field sits behind the combat plane (`warnDepth`), and in the
  burst frame RIG's silhouette stays fully readable in front of it — pillar 5
  holds at the one moment it matters.
- Style is consistent with `docs/concept-art/06-enemy-form-language.png`
  row 3, centre (the Seed-Pod Tripod: squat launch tube on three legs, acid-
  green ecology). The shipped primitive is far simpler than the painted board,
  which is the established shipped idiom for every hostile kind, not a break
  introduced here.
- **No assembling anatomy.** In all frames the creature's geometry is static;
  the only things that move are the emplacement's own props (pod, mark, blast,
  tube recoil). Entry 3 explicitly reserves assembly-style motion for things
  the ship *builds*, which is what this is.
- No glitches, z-fighting, orphaned meshes, or leaked props across the runs;
  end-of-run screenshots are clean (`runs/gate-T-014-mortar-combo/screenshot.png`
  → TRAVERSAL CLEAR, 0 falls, 0 hull fallbacks).

**Materialize / hitbox gating** rides the existing shared gates rather than a
new path: `updateMortar` returns early while `gameMs < e.enterUntil` (no arming,
no pod, no blast), contact damage and every bullet-hit test already gate on the
same field (`src/sim/hostiles.js:514`, `src/sim/weapons.js:67,104,159`).

## Not defects (checked, dismissed)

- A console `404` appeared in two ad-hoc captures. It reproduces **identically
  against main** and did not reproduce in a targeted request/response probe of
  either tree — pre-existing environment noise (favicon-class), not T-014.
- My gate-only stand-still script reports `outcome: stalled`. That is the
  script doing what I built it to do (stop on the mark), not a game defect.

## Filed

- **I-017 | docs | S3** — `scripts/mortar-zone-deny.json`'s own `description`
  states its load-bearing beat as measured fact ("held at the lip through it
  and crossing the strip inside the reload window"); on a fresh deterministic
  run of the same script on the same tree the bot paused ≈ 150 ms at the lip
  and crossed during `fuse`/`burst`, not inside `cool`. The sibling evidence
  README hedges this correctly; the script's own text does not, and it also
  lists "Regression signals", which invites a future agent to read the beat as
  a contract. Detail in `SPRINT.md`'s Inbox.

## For the operator (feel — not judged here, questions only)

1. `index.html?slice=traversal&mortar=1` — with the warning at 1.54 s
   (900 ms flight + 640 ms fuse), a runner at full pace can simply cross the
   marked strip and never be denied anything. Is the tell generous in the right
   way (readable, answerable) or generous enough to be ignorable?
2. Same URL, stand on the mark on purpose: the burst's knockback deposits RIG
   just outside the slab (x ≈ 61.4), after which a stationary player is never
   hit again while the emplacement keeps bombarding the empty patch on its own
   rhythm. Correct — the mortar denies a place and never chases — or does the
   "shell it forever, nothing happens" read need a nudge?
3. `?mortar=2` — does the hound under the marked strip make the panicked drop
   feel *priced*, or *punished*? The bot took the panicked line and finished at
   hp 3/3, so the combination is currently cheap to the machine.
4. At FAR: is the amber landing pad loud enough as the primary warning, or
   should the dim warning column carry more of the read before the burst?
5. Does going up to `post-high` — the reroute that also puts the tripod on
   your firing line — read as the *interesting* answer, or as the obvious one?
