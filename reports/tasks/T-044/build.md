# T-044 — corner reveal set pieces (ARRIVAL + ARENA)

**Worktree:** `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-044`
**Branch:** `task/T-044` (never merged here — integrator's call)
**Lane:** authored data in `src/pure/` only (lattice/generator/pathcheck). No
`src/render/**`, `src/sim/hostiles.js`, `src/ui/**`, `src/main.js`,
`index.html`, `src/config.js`, `SPRINT.md`, `CLAUDE.md` touched.

## Revision note (review response)

The reviewer's `REQUEST_CHANGES` found two real problems in the first
version of this report and the pathcheck block it described, both fixed
below rather than argued with:

1. This report originally claimed "`CONFIG.waves` is untouched... this is
   a placement change, not a difficulty one." The first half is true; the
   second half was an unmeasured assertion the reviewer measured and
   disproved (the terrain measurably raises face 2's wave-gate clear rate
   for an identical scripted policy). See "Difficulty measurement" below —
   corrected, and routed to the operator rather than decided here.
2. The new pathcheck assertion's messages and comments said the held-jump
   policy "survives... with ARRIVAL/ARENA installed" and did so with
   "hostiles LIVE." That framing was false: the harness removes every
   hostile at the top of every frame (`while (HO.hostiles.length)
   HO.removeHostile(0, false)`), the same idiom the T-009 section already
   uses and honestly labels "route, not fight" — a hostile destroyed one
   frame after spawning never reaches `CONFIG.wasp.enterMs` (900ms) and
   can never materialize or take/deal damage. The assertion itself is
   still worth having (it proves terrain reachability with the new
   geometry installed, plus genuine `onOneWay` contact on 4 platforms);
   only the description was wrong. Fixed in `tools/pathcheck.mjs`'s T-044
   block — messages and comments now say "terrain only, hostiles removed
   every frame" throughout, matching what the code actually does.

## What this is

The ask was setpiece moments — a scale reveal, a near-miss, and a place
where the Meridian visibly notices RIG — built inside the static-anatomy
rule (nothing assembles; the world is baked at boot, camera/player reveal
it). Two authored zones now flank every corner ritual, in
`src/pure/lattice.js`, wired into `buildLevel` in `src/pure/generator.js`:

- **ARRIVAL** — one guaranteed catwalk in the narrow gap between a corner's
  flat apron and that face's own pocket approach (faces 2-6; face 1 has no
  preceding corner and stays the plain baseline). Before this, the first
  thing a player stood on after a corner ritual's reveal was whatever the
  seeded chunk stream happened to roll there — often nothing distinctive.
  Now there is always one.
- **ARENA** — the wave gate's own fighting ground (the ~23-column box
  inside the gate's halt + frustum, clear of the corner apron) is composed
  per face instead of left to the chunk stream and the probabilistic
  Contra-tier loop. Tier count escalates face 2 → 6: **1, 2, 3, 3, 3**
  (mid; mid+high; mid+high+perch; full mid+high+third; full stack widened).
  The widest tier per arena also escalates monotonically: **13, 15, 19, 21,
  23 columns**. This reads STORY.md's six-stage escalation
  (Observe→Intercept→Contain→Quarantine→Sterilize→Scuttle) directly into
  the battleground's own silhouette. **`CONFIG.waves` is untouched** — wave
  size, composition, and gated-hostile tuning don't move, so no combat
  NUMBER changed. That is not the same as "difficulty is unaffected" —
  see "Difficulty measurement" below, which the operator's "make it
  memorable, not harder" directive means is his call, not mine to assert.

Both zones only ever ADD platforms; neither writes `groundH` or clears
existing procedural platforms before installing (see below for why that
matters). Everything is deterministic — same seed, same result — verified
against the shipped `cfg.gen.seed`/`cfg.gen.tierSeed`, not assumed.

## The regression this task found and fixed

First implementation cleared each set piece's whole footprint (mirroring
the pocket's own two-column chasm-clearing precedent) before installing.
That precedent didn't transfer: a pocket only ever clears a span nothing
legitimate stands over, but an arena footprint is up to 23 columns wide and
can contain a procedural catwalk that is the *only* bridge across a raw
ground gap the chunk stream rolled inside it.

Driving the shipped sim headlessly with the project's own held-jump policy
(hold right, jump on a gap or a denied step — the exact evidence standard
LANE-BRIEF asks for, not a claim about authored geometry) caught it
immediately: **GAME_OVER**, 3 lives lost, two of them at the same spot on
face 5 (x≈324, twice, after two respawns). Traced to the exact frame: the
clear step deleted a procedural catwalk at `x[319,326) y=4.35` that bridged
a 5-column ground gap at `x[321,325)`; the authored replacement
(`arena-f5-mid`, `y=5.35`) sat too high for a jump launched from the
gap-mouth's real ground height (2, not the tier's own locally-measured
base of 3) to reach. The fix — add, never clear-then-add — is what
shipped. **Proven by breaking it twice** (LANE-BRIEF's evidence standard):
reintroducing the clear-before-install bug reproduces the exact
GAME_OVER and fails 9 assertions including 4 new T-044 ones (the named
bridge-survival check, the held-jump-survives check, the scroll-end check,
the "mounts ≥3 set-piece platforms" check); a second break (dropping face
4's `perch` tier) fails the tier-escalation assertion with `[1,2,2,3,3]`.
Both restores verified byte-identical (`diff` clean) before moving on.

## Metrics

- **Platform count:** 62 → 77 (pinned in `tools/pathcheck.mjs`; +17
  authored, −2 from the pre-existing patch/thin fixpoint reading the
  raised local route density and thinning 2 procedural catwalks that were
  no longer needed to hit `minRoutes` — `thinIsSafe` still gates every
  removal, so nothing load-bearing was touched). Chunk stream itself is
  byte-identical (59 chunks, same seed, same rng draws — the lattice pass
  consumes none).
- **pathcheck:** 1741 → **1759 passed, 0 failed** (18 new assertions, all
  in one delimited block at the end of `tools/pathcheck.mjs`).
- **Route-density invariant (T-009, 3-5 bands):** unaffected — the
  interior windows this checks explicitly exclude the corner-clear +
  lookahead band, which is where both new zones live.
- **Reachability/stranding (T-009's own `latticeUnreachable`/
  `latticeStranded`):** 0 orphans, 0 strands among the 17 new platforms —
  same invariant every other catwalk in the game is held to.
- **Held-jump policy, full six-face run, hostiles removed (T-009's
  reachability proof, terrain only):** still reaches the outro end with 2
  lives — unchanged from before this task started.
- **Held-jump policy, full six-face run, with ARRIVAL/ARENA installed
  (this task's new assertion — TERRAIN ONLY, hostiles removed every frame,
  same idiom T-009 uses):** state PLAYING/VICTORY at the outro, and —
  without ever trying to gain altitude for its own sake — takes genuine
  `onOneWay` contact on 4 of the 17 new platforms along the way
  (`arena-f5-mid`, `arena-f6-mid`, `arrival-f4`, `arrival-f6`). This is a
  route/reachability fact plus real physics contact with the new
  geometry; it says nothing about surviving combat with the new terrain —
  see "Difficulty measurement" below for the number that actually answers
  that.
- **Crush-margin / pocket-timing assertions:** untouched, still green
  (nothing here touches `CONFIG.spawner`, pocket timing, or the pursuing
  edge).

## Difficulty measurement — distribution, not mean (decisions.md entry 19)

Entry 19 (operator, unprompted, after playing): *"i feel like i can do
better each time... sometimes i clear two or three faces, sometimes I
can't pass the first — that's a good start."* The wide outcome spread is
the feature. So the question this section answers is not "did the mean
move" but **did the ceiling rise while the floor held** (good, matches
entry 19) **or did the whole distribution shift up together** (bad — that
flattens the spread he named as good)? A single reflex policy has no skill
axis, so the reviewer's original 0/3-vs-2/3 comparison can't tell those two
shapes apart by itself. Two things fix that: more samples, and two
policies of different strength standing in for a weaker/newer player and a
more practiced one (`scripts/six-face-full-run.json`, no vertical aim at
all — level shots only — vs `scripts/six-face-aimed-run.json`, which tilts
the gun at elevated targets; T-018's own finding is that the aim-less
policy cannot damage anything above the standing firing line without a
dive, so it is a genuinely worse player, not just a different script).

All runs: `node run.mjs <script> --deterministic --stop-on-game-over
--max-runtime-ms 245000`, pinned worktrees (`69e1f90` for merge-base, this
branch for the other side), `tools/playtest/README.md`'s "Pinned-worktree
capture" recipe, identical `node_modules`. `CONFIG.waves`,
`src/sim/hostiles.js` and `src/sim/weapons.js` are byte-identical between
trees (`git diff main...HEAD --stat` touches none of them) — terrain is the
only variable. Reference marks: a run dying at scroll 75/140/205 died AT
that gate's halt (failed the wave); a value in between means it cleared
that gate and died from something else in the face beyond it, before the
next gate armed.

**Raw values, every run, nothing dropped** (scroll reached, ties to km/m
readout in-game):

| policy | tree | n | values (scroll) | floor (worst) | ceiling (best) | cleared gate 2 |
| --- | --- | --- | --- | --- | --- | --- |
| aimed (competent) | base | 5+5+3=13 | 140,205,140,140,140 · 96.9,109.3,99.5,140,140 · 140,140,140 (reviewer, 3 exact values not itemized in the review) | 96.9 | 205 | 1/13 (7.7%) |
| aimed (competent) | branch | 5+5+3=13 | 205,140,205,166.9,140 · 140,140,140,140,140 · 205,205,140 (reviewer) | 140 | 205 | 5/13 (38.5%) |
| full-run (weak) | base | 5 | 140,75,75,75,75 | 75 | 140 | 0/5 (0%) |
| full-run (weak) | branch | 5 | 171.7,75,75,98.2,140 | 75 | 171.7 | 1/5 (20%) |

Three sessions of aimed-policy data are folded in: the reviewer's original
n=3, my first reproduction (n=5, reported in the previous revision of this
report), and a second n=5 batch run for this revision — all real, none
discarded, because the honest picture is the full spread across sessions,
not whichever single batch looked best. Run-to-run variance is genuinely
large (my two aimed-branch batches alone ranged from 3/5 cleared to 0/5
cleared) — this is not a stable percentage, and I am not presenting it as
one.

**What the shape actually shows:**

- **Floor, weak policy:** both trees bottom out identically at scroll 75 —
  dying in wave gate 1 — in the majority of runs (4/5 base, 2/5 branch).
  The worst case is the same on both trees: a weak run still fails at the
  very first gate. **The floor holds.**
- **Ceiling, weak policy:** base's best run ever observed is 140 (reaches
  gate 2's halt, never clears it); branch's best is 171.7 — past corner 2
  (154), a genuine gate-2 clear, something no weak-policy base run did in
  this data. **The ceiling is higher on branch, even for the weak policy.**
- **Aimed policy:** base's absolute best (205, one run out of 13) ties
  branch's best (also 205) — the ceiling's ABSOLUTE height is the same —
  but branch reaches it roughly 5x more often (38.5% vs 7.7% gate-2-clear
  rate across 13 runs each). Base's floor (96.9) is slightly worse than
  branch's floor (140) for this policy specifically, so the floor read is
  less clean here than the weak-policy comparison above — worth flagging
  rather than smoothing over.

Net: the evidence leans toward **"raises the ceiling, mostly holds the
floor"** — the shape entry 19 said is good — more clearly for the weak
policy (cleaner floor match) than the aimed one. It is not a clean, fully
resolved case either way with n this small. I am not undoing the terrain;
I am presenting the distribution and routing the read to the operator, per
his own standing instruction that this project reports spread, not a
single average, going forward.

## Screenshots — what I judged by, and what I could not get

Real browser captures via `tools/playtest/t044-capture.mjs` (new,
committed — same shape as the existing `viewscale-capture.mjs`/
`palette-capture.mjs` dev rigs: reuses the harness's own
`lib/sampler.mjs`/`lib/threat.mjs`, no game code imported). It replays the
best documented reflex for this run (`scripts/six-face-aimed-run.json`'s
rules — hold right, aim up at an elevated target, jump on a gap/hound
tell/pinned) and screenshots the first time RIG's x crosses each of the 10
authored landmarks.

Committed under `artifacts/t044-corner-reveal/`:

- `f2-arrival.png` — RIG standing on the face-2 ARRIVAL catwalk right
  after corner 1, the pink `H` capsule and a hound ahead on the deck below.
- `f2-arena.png` — mid-fight in wave 2, inside the face-2 ARENA: several
  catwalk bands visible at once, a wasp and bullets in frame, the deck read
  as one connected checkered structure rather than floating rectangles.
- `f2-arena-wave-death.png` — the death overlay from a `run.mjs
  --deterministic` pass of the existing `six-face-aimed-run.json` script
  (unmodified), for cross-reference (13 kills, died in "WAVE 2/6").

**What I could not get, and why, stated plainly rather than papered over:**
no scripted policy available in this repo reliably clears wave gate 2 —
every run of both the full and the aimed reflex scripts, on this branch
and on `main`, dies at the same spot (x≈152-154, corner 2), a documented,
pre-existing combat-AI ceiling (`six-face-aimed-run.json`'s own
description cites the same wall on `main`). That means I have **no live
screenshots for faces 3-6** (arrival/arena for Contain, Quarantine,
Sterilize, Scuttle). What stands in for them: the same reachability/
escalation math verified above, computed from the identical `buildLevel()`
output the game ships, plus the fact that every new platform uses the
exact rendering path already visually confirmed for face 2 (same tile/
catwalk primitives, same palette resolution — nothing in `src/render/` was
touched, so there is no reason to expect faces 3-6 to render differently
in kind, only in the composed shape). That is an inference, not an
observation, and I am flagging it as one rather than presenting it as
verified. Fixing the harness's combat ceiling is out of this lane's
scope (touches `src/sim/hostiles.js`, T-043's territory, or a much
stronger bot policy).

## Lane-fence note for the integrator

`src/pure/generator.js` and `src/pure/lattice.js` are also named as
T-021's surface (currently `blocked`/escalated on `main`, unmerged). I did
not touch the pocket/fork machinery at all — my additions live in a new
section (ARRIVAL/ARENA), added functions, and one `latticeThinPass`
exemption line (`p.pocket || p.arrival || p.arena`). Diff is otherwise
additive. Worth a careful three-way look if T-021 resolves and merges
before this does; I kept my footprint changes as narrow and named as I
could to make that merge legible.

## Open questions for the operator

**URL: `index.html` (the default six-face run, no query flags — serve with
`node tools/serve.mjs <port>`, not python).**

1. **Ceiling vs. floor (entry 19), measured as a distribution, not a mean:**
   a weak (no-vertical-aim) and a competent (aim-assisted) scripted policy
   were each run 5-13 times per tree — see "Difficulty measurement" above
   for every raw value. Shape observed: the WEAK policy's floor is
   identical on both trees (dies at gate 1, scroll 75, most runs) while its
   ceiling is higher on this branch (171.7 vs 140 — a genuine gate-2 clear
   that never happened on `main` in this data); the COMPETENT policy's
   absolute ceiling ties (205 both trees) but is reached ~5x more often on
   this branch (38.5% vs 7.7% across 13 runs each), with a noisier floor
   read. Read together that leans "ceiling raises, floor mostly holds" —
   the shape you named as good — but it is not a clean, fully resolved
   case at this sample size. Does this match what you want from "sometimes
   I clear two or three faces, sometimes I can't pass the first," or does
   the floor need to be pinned down harder before this is acceptable —
   and if the latter, should the fix be narrower arena footing, or
   something else? This is explicitly your call, not mine or the
   integrator's to make silently.
2. Does the face-2 ARENA screenshot read as "the ship's fighting me here on
   purpose" rather than just "busier platforms" — does the escalating
   tier stack across faces 2→6 (1→2→3→3→3, widening each time) land as the
   Meridian's response intensifying, per STORY's six-stage ladder?
3. The ARRIVAL catwalk (first screenshot) sits right where the corner
   ritual's reveal lands — is that beat legible as "the world already
   existed, revealed" rather than just "another platform," at a glance,
   at speed?
4. Faces 3-6 are unverified by screenshot (see above) — worth a manual
   playtest pass (or a stronger bot) before judging the full escalation,
   since face 2 alone under-represents the target (the biggest, most
   vertical arena is face 6, which nobody has seen rendered yet)?
5. Given entries 9-12 (the pocket is a free pickup, priced by pressure not
   reach/height), should the ARENA's added verticality also stay entirely
   optional footing (never the only path through a gate), or is some
   arena tier allowed to be the *only* safe ground during a wave — I built
   it as pure additional route choice, never a forced climb, but have not
   separately proven "never the only path" the way the pocket's
   reachability is proven.
6. Is escalating by structure (tier count, width) rather than raw height
   the right read? Face 6's peak platform (10.35) is technically LOWER
   than face 5's (11.35) because face 6's local ground happens to sit a
   tile lower in that footprint for this seed — width and tier count both
   still escalate cleanly (23 cols vs 21, full 3-tier stack both faces),
   but if "tallest yet" needs to be literal-Y-monotonic rather than
   structural, that is a design call, not a bug I can fix without forcing
   ground height (which I deliberately avoided — see the "no ground
   writes" note in `lattice.js`).

## Verification

- `node tools/pathcheck.mjs` — 1759 passed, 0 failed.
- Break/restore proof for 2 of the new assertions (documented above),
  worktree left clean afterward (`git status --short` / `git diff HEAD
  --stat` both clean before these final edits).
- `index.html?selftest=1` — SELFTEST PASS (29 checks), served via
  `node tools/serve.mjs 8799` (not python), port killed after.
- Real browser playtest evidence gathered on an ephemeral OS-assigned
  port via `tools/playtest`'s own server (never 8741/8742).
- Difficulty measurement: 5 runs per side (branch served on `127.0.0.1:8750`,
  merge-base `69e1f90` checked out to a scratch `git worktree` and served on
  `127.0.0.1:8749`, both via `node tools/serve.mjs`, both ports killed and
  the scratch worktree removed after) — see "Difficulty measurement" above.
