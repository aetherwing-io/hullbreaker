# T-044 — corner reveal set pieces (ARRIVAL + ARENA)

**Worktree:** `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-044`
**Branch:** `task/T-044` (never merged here — integrator's call)
**Lane:** authored data in `src/pure/` only (lattice/generator/pathcheck). No
`src/render/**`, `src/sim/hostiles.js`, `src/ui/**`, `src/main.js`,
`index.html`, `src/config.js`, `SPRINT.md`, `CLAUDE.md` touched.

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
  the battleground's own silhouette. **`CONFIG.waves` is untouched** —
  wave size, composition, and gated-hostile tuning don't move, so this is a
  placement change, not a difficulty one, per the operator's "make it
  memorable, not harder" directive.

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
- **Held-jump policy, full six-face run, hostiles LIVE (this task's new
  assertion):** state PLAYING/VICTORY at the outro, and — without ever
  trying to gain altitude for its own sake — naturally mounts 4 of the 17
  new platforms along the way (`arena-f5-mid`, `arena-f6-mid`,
  `arrival-f4`, `arrival-f6`), i.e. real contact with real physics, not
  just "reachable on paper."
- **Crush-margin / pocket-timing assertions:** untouched, still green
  (nothing here touches `CONFIG.spawner`, pocket timing, or the pursuing
  edge).

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

1. Does the face-2 ARENA screenshot read as "the ship's fighting me here on
   purpose" rather than just "busier platforms" — does the escalating
   tier stack across faces 2→6 (1→2→3→3→3, widening each time) land as the
   Meridian's response intensifying, per STORY's six-stage ladder?
2. The ARRIVAL catwalk (first screenshot) sits right where the corner
   ritual's reveal lands — is that beat legible as "the world already
   existed, revealed" rather than just "another platform," at a glance,
   at speed?
3. Faces 3-6 are unverified by screenshot (see above) — worth a manual
   playtest pass (or a stronger bot) before judging the full escalation,
   since face 2 alone under-represents the target (the biggest, most
   vertical arena is face 6, which nobody has seen rendered yet)?
4. Given entries 9-12 (the pocket is a free pickup, priced by pressure not
   reach/height), should the ARENA's added verticality also stay entirely
   optional footing (never the only path through a gate), or is some
   arena tier allowed to be the *only* safe ground during a wave — I built
   it as pure additional route choice, never a forced climb, but have not
   separately proven "never the only path" the way the pocket's
   reachability is proven.
5. Is escalating by structure (tier count, width) rather than raw height
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
