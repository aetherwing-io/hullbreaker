# T-041 build report — S10: directional impact and travel language

worktree `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-041`,
branch `task/T-041`, base commit `d3f6628` (= `main` at dispatch time).

## Frame time at 200+ live projectiles: before vs after

`tools/playtest/juice-stress.mjs` (256-slot bullet pool saturated + 224-slot
spark pool saturated, 1280x800 headless Chrome, right key held, five-second
sustained read of the last 180 real frames). Full JSON: `tools/playtest/runs/
T-041-before/07-stress-perf.json` (unmodified worktree) and `tools/playtest/
runs/T-041-after/07-stress-perf.json` (this branch).

| reading (stress case, `?juice=1`) | before | after |
|---|---|---|
| fps (vsync-capped, see caveat) | 119.9 | 120.1 |
| avgMs | 8.34 | 8.33 |
| **worstMs** | 9.3 | 9.4 |
| over20ms (dropped-frame count) | 0 | 0 |
| liveProjectiles | 256 | 256 |
| live sparks / cap | 224 / 224 | 224 / 224 |

The panel this ran on is 120Hz, so `fps` is vsync-locked (per the tool's own
honesty note) and the load-bearing fields are `worstMs`/`over20ms`. Both are
within measurement noise of the unmodified tree (0.1ms) and `over20ms` stayed
at 0 in both readings — no dropped frame under saturated load, before or
after. Draw calls, triangles, geometries and textures at boot are also
unchanged: `94 calls / 50,196 tris / 58 geometries / 5 textures` at
1280x800 for both trees (measured live via `renderer.info` through
`src/render/scene.js`'s exported `renderer`, one throwaway script, not
committed). No new pool, material, geometry, or `scene.add()` call exists in
the diff — every change is inside the matrix/quaternion math for instances
that were already being uploaded every frame.

## What changed and why

Per `docs/proposals/2026-08-look-direction.md` §3 item S10, plus its two
corrections carried from adversarial review (both implemented, see below).

**`src/pure/juice.js`** — two new pure functions, Node-testable, no
`Math`.random/Date.now/performance.now, no imports beyond what was already
there (none):

- `travelStretch(speed)` → `speed / 60`: one frame of a thing's own motion,
  in tiles. Takes `speed` only — no `ms`/lifetime parameter exists to
  reintroduce the design the review rejected (bounding a burst's streak by
  `speed * lifetime`, which on the shipped impact tune (speed 5.5, ms 240)
  produces 1.32 tiles / an 11x elongation of the 0.12-tile spark / 23 screen
  px at the shipped FAR default — the "grotesque smear" the correction named).
- `bulletNoseTiles(baseRadiusTiles, speed, ceilingTiles)` → `min(baseRadiusTiles
  + travelStretch(speed), ceilingTiles)`: the nose a travelling shot may draw
  ahead of its own center, clamped unconditionally. `src/sim/weapons.js:161`
  collides every bullet as a **point** (no bullet radius exists in the sim at
  all), so a drawn nose past the ceiling is a claimed hit the sim never gave —
  the same lie `waspDiveStretch()` (`src/render/legibility.js`) exists to
  prevent for the wasp's dive dart. `bullets.js` calls this exact function
  (not a re-derivation) to compose its matrix, and pathcheck calls the same
  function to gate it, so the two can't drift apart.

**`src/config.js`** — one delimited block (`/* ==== T-041 impact language
==== */`, appended after the existing `WEAPON_LETTERS` derivation, nothing
else in the file touched):
```
export const BULLET_NOSE_CEILING_TILES = CONFIG.rifle.radius * CONFIG.weapons.L.scale[0];
```
= `0.16 * 7 = 1.12` tiles — the shipped laser bolt's own nose, already green
under pathcheck today. Derived rather than duplicated so a future retune of
either value can't drift the two apart silently.

**`src/render/fx.js`** — the spark pool (`sparks`/`sparkMesh`, the octahedra
that draw every impact/death/hurt/pickup burst) no longer composes
`_m.makeScale(s, s, s)`. Each live row now orients a quaternion onto its own
**current** velocity (post-gravity, recomputed every frame — the same
velocity the row already integrates against for position) and stretches the
aligned axis by `size + travelStretch(currentSpeed)`, leaving the other two
axes at `size`. The flash pool (muzzle/kill/pickup pops, a different mesh)
is untouched — it stays a uniform-scaled sphere; S10 only names the burst
sparks. No new scratch objects are allocated per frame (five reused
`THREE.Quaternion`/`THREE.Vector3` instances, matching the existing
hot-loop convention in this file).

**`src/render/bullets.js`** — R/S/H previously drew as plain uniform-scale
spheres (no orientation at all); only L and F composed an anisotropic scale.
`syncSlot()` is now one branch for every type: base scale (`crawlScale` for a
crawling F, `scale` otherwise) plus a nose computed by `bulletNoseTiles()`
from the shot's **live** speed (`Math.hypot(b.vx, b.vy)`, or `F.crawlSpeed`
while crawling, since a crawler's stored `vx/vy` go stale the instant it
starts hugging terrain — position advances by `dir * crawlSpeed` instead,
`src/sim/weapons.js`), oriented onto heading exactly as L/F already did
(`Euler('YZX', 0, yaw, atan2(vy, vx))`). Measured against the shipped
weapon table:

| type | base nose (tiles) | drawn nose after S10 (tiles) | vs ceiling (1.12) |
|---|---|---|---|
| R | 0.160 | 0.593 | under |
| S | 0.128 | 0.511 | under |
| L | 1.120 | 1.120 (unchanged — already the ceiling) | **at** |
| H | 0.112 | 0.412 | under |
| F (flying) | 0.176 | 0.393 | under |
| F (crawling) | 0.240 | 0.407 | under |

L is untouched by construction: it was already at the ceiling before this
pass (`7 * 0.16 = 1.12` exactly), so `min(...)` clamps it straight back to
itself. Every other type gets a real, previously-absent travel stretch, still
comfortably under the same ceiling at every shipped speed — including F's
worst-case in-flight speed once gravity has been accelerating it for the rest
of its 1.5s lifetime (checked by hand up to ~73 tiles/s equivalent; the
`Math.min` clamp holds regardless of how fast a future retune makes any shot
move, which is what the pathcheck gate below actually proves, not just the
current numbers).

## `tools/pathcheck.mjs`

One delimited block appended at the very end (`/* ==== T-041 impact language
(S10) ==== */` … `/* ==== end … ==== */`), plus two necessarily-surgical
one-line additions to existing `import` statements (ESM imports must be
top-of-file; both are additions-only to imports from files in my own list —
`../src/config.js` and `../src/pure/juice.js` — so risk to other lanes'
hunks in this heavily-shared file should be effectively zero). Nothing
between those two import lines and the end of the file was touched.

Assertions added (24 new `ok()`/`near()` calls):
- `travelStretch` arity is exactly 1 (structurally blocks reintroducing an
  `ms` parameter through this call site) and `travelStretch(60) === 1`.
- The rejected lifetime-bound design, computed directly from
  `CONFIG.juice.impact`, reproduces the cited 1.32-tile / 11x-of-size figure
  — proving the corrected reasoning is reproducible, not just asserted.
- The shipped one-frame stretch stays under 1.5x of size for **every**
  `CONFIG.juice` burst spec with a `speed`/`size` pair (impact/death/hurt/
  pickup), not just the cited one, guarding future retunes too.
- **The load-bearing gate:** `bulletNoseTiles()` never exceeds
  `BULLET_NOSE_CEILING_TILES`, checked (a) as an unconditional property (a
  synthetic absurd speed and a synthetic oversized base are both clamped —
  proving the gate holds independent of today's tuning) and (b) for every
  shipped weapon/state through the exact formula `bullets.js` calls. Also
  asserts L is unchanged (still exactly at the ceiling) and that R (the
  fastest non-laser shot, previously a bare uniform sphere) now draws a real
  stretch rather than a no-op — so the "extends every shot" claim in the
  proposal is checked, not assumed.
- Extends the existing damage-prop `GAIN` guard's file coverage (previously
  `hostiles.js` only, per the correction) to `bullets.js`: no line drawing a
  bullet may scale a `beam|blast|mark` token by a legibility `GAIN` constant,
  plus a same-purpose assertion that `bullets.js` doesn't reference the
  legibility gains at all (the nose stretch is speed-only, never a
  readability pull-back boost).

**Proved every new assertion binds, not just that the gate is green** (per
the lane's evidence standard): removed the `Math.min` clamp in
`bulletNoseTiles()` — 4 assertions went red, including the load-bearing
per-weapon nose check, correctly reporting L's nose grown to 1.7867 tiles.
Restored, reverified green. Separately, changed `travelStretch`'s signature
to `(speed, ms)` and had it multiply by `ms/1000` (literally reintroducing
the rejected design) — the arity assertion and every downstream numeric
assertion (now computing `NaN`, since callers still pass one argument) went
red, 15 failures. Restored, reverified green. Separately, added a real
(non-comment) `const blast = GLYPH_GAIN;` line to `bullets.js` — both
extended damage-prop-guard assertions caught it. Restored. After each
break/restore: `git status --short` and `git diff --stat` confirmed the
worktree returned to exactly the intended diff (verified byte-for-byte via
`git diff` output, not just file existence).

`node tools/pathcheck.mjs` → **1763 passed, 0 failed** (final, clean
worktree).

## Other verification

- `?selftest=1` (via a throwaway Playwright script, not committed): **SELFTEST
  PASS (29 checks)**, zero console/response errors.
- `tools/playtest/mid-route.json --deterministic`: completed, 0 deaths, as
  before.
- `tools/playtest/hound-facetank-solo.json --deterministic`: outcome
  `stalled` — that label is the harness's idle-fraction pacing metric and is
  expected for this specific script (a facetank test intentionally holds
  position; idle fraction 0.782 over 14.9s), not a functional regression.
  The report shows 1 kill / 1 hit survived / 0 lives spent, i.e. the
  bullet-hit → `hitHostile` → hit-stop → impact-burst pipeline this task
  touches ran correctly end to end.
- `npm install` was run once in `tools/playtest/` for this worktree (per its
  own README) to get `playwright-core`; Chrome (`channel: 'chrome'`) was
  already installed on this machine.
- Draw-call/geometry/texture counts measured live (not inherited) before and
  after via a throwaway script reading `src/render/scene.js`'s exported
  `renderer.info`, using `git stash` to isolate "before" — restored with
  `git stash pop` and reverified `git diff --stat` matched exactly.

## Scope discipline

Files touched: `src/pure/juice.js`, `src/render/fx.js`, `src/render/bullets.js`,
`src/config.js` (one delimited block), `tools/pathcheck.mjs` (one delimited
block at the end, plus the two import-line additions noted above). Nothing
in `src/main.js`, `src/ui/**`, `index.html`, `tools/playtest/**`, `SPRINT.md`,
`CLAUDE.md`, or `README.md` was changed. No port was bound; `juice-stress.mjs`
and the ad hoc scripts each pick an ephemeral port (`port: 0`) via the
existing `startStaticServer` helper. No jump/movement/damage/knockback
constant was touched — this pass is visuals only, riding the existing
`?juice=0` A/B.

## Open feel questions for the operator

Machine gates can't judge this — they only prove the numbers stay inside the
sim's collision model and don't smear. At the shipped FAR default during
real combat:

1. Does the rifle round (R) reading noticeably "faster"/more elongated than
   before feel right, given it's now the most-stretched non-laser shot
   (relative to its own base size) because it's the fastest common weapon?
   Or does it read as a different weapon than before?
2. Does the impact-spark burst (now stretched per-particle along each
   particle's own flight direction) read as "which way it hit" at a glance,
   or does the per-particle fan (already jittered by the golden-angle burst
   shape) make individual streak directions hard to parse at FAR distance?
3. Is the laser bolt (unchanged) now visually *less* distinct from the other
   shots, since R/S/H/F all gained some stretch of their own where they had
   none before?
4. Should death/hurt/pickup bursts (which also now stretch, since they share
   the one spark pool) read differently from impact, or is one shared
   travel-language treatment across all burst kinds the right call?

## Best next action

Hand to the reviewer/playtester pair for this lane; if the operator wants a
capture at the shipped FAR default to answer the feel questions above, the
smoke scripts already exercised above (`hound-facetank-solo.json`,
`mid-route.json`) are reasonable candidates for a screenshot pass.
