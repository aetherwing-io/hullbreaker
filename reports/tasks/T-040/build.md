# T-040 — RIG silhouette: five boxes to a real 30 px outline with three value zones

Worktree `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-040`,
branch `task/T-040`. Implements look-direction packet §3 item S8, including
the "corrections carried from adversarial review" printed in the packet.

## What changed and why

RIG's box list moved out of `src/render/player.js` into a new pure module,
`src/pure/rig.js`, so the silhouette's ENVELOPE (does every box stay inside
the frozen 0.7 × 1.7 collision box, laterally and vertically?) is gated by
`pathcheck` instead of trusted from review — same precedent as
`src/pure/shell.js`'s `compositionViolations`.

Two boxes were added to the table:
- **visor** (0.30 × 0.10 × 0.30, head front) — the helmet/visor break.
- **pack** (0.22 × 0.34 × 0.16, torso back) — the pack mass.

Three value zones now split the six body boxes (was four: torso/head/legL/
legR):
- **bright** — head + visor + gun arm → `PAL.player` (unchanged token: the read)
- **dark** — torso + pack → new `PAL.playerDark`
- **mid** — legs → new `PAL.playerMid`

`src/render/player.js` now builds every body mesh from `RIG_BOXES` in a loop
(one `THREE.Mesh` per box, material picked by `zone`), and builds the gun
mesh from a `GUN_BOX` constant in the same module, instead of six/seven
hand-written literal calls. `sync()` (crouch squash, flow lean, i-frame
blink) is untouched — it still operates on the whole `rig` group.

`src/render/palette.js` gained `playerDark`/`playerMid` in **both** `CLASSIC`
and `CONCEPT`, each inside a delimited `/* ==== T-040 RIG silhouette ==== */`
block at its insertion point (two insertion points — one per table — since
the two tables are separate object literals; each is clearly delimited).
CLASSIC's pair are hand-authored neutral greys (not derived from any CONCEPT
role, matching CLASSIC's own byte-faithful-to-grey-box character). CONCEPT's
pair are darker steps down the *same* warm-neutral family as `PAL.player`
(low channel spread, `r >= g >= b`) — a hue change would be a new color role
per the packet's correction, so none was introduced.

`tools/pathcheck.mjs` gained one delimited block
(`T-040: RIG silhouette (pure + guards)`) appended immediately before the
final summary print (an ES module's `import` is hoisted regardless of its
textual position, so this is legal at the literal end of the file, which is
what the dispatch asked for).

### The adversarial-review correction, honored explicitly

The packet flagged an earlier draft's claim — "the silhouette can never lie
about where RIG is" — as false: `src/render/player.js`'s gun sweeps a
0.75-long box through 8-way aim every frame and already reaches `|x| =
0.825`, more than double the 0.35 collision half-width. I did not try to
narrow the gun (out of scope, and it's an aim-pose fact, not a silhouette
defect). Instead:

- `rigEnvelopeViolations()` in `src/pure/rig.js` is asserted over **body**
  boxes only (`RIG_BOXES` — head/visor/torso/pack/legL/legR); the gun is
  never passed to it.
- The gun's own local x-span is a separate exported fact
  (`GUN_INNER_X`/`GUN_OUTER_X`, computed from `GUN_BOX`, not a hand-copied
  literal), and `tools/pathcheck.mjs`'s new block asserts `GUN_OUTER_X ===
  0.825` (the packet's own measured figure) and `GUN_OUTER_X > 2 *
  BODY_HALF_WIDTH` **by name**, so the gate documents the true, wider-than-
  the-body state instead of passing green over a violated property.
- Both `src/pure/rig.js`'s header comment and `tools/pathcheck.mjs`'s new
  block restate this in words, not just in code.

Also carried: the two shipped per-frame transforms (`rig.scale.y = squash`
for `?crouch=1`, `rig.rotation.z = lean` for `?flow=1`) are noted in
`rig.js`'s header as blind spots this table cannot see — it gates the REST
pose only, applied to the whole assembled group, so it can't break any
individual box's envelope.

## Files touched

- `src/pure/rig.js` — **new**. `RIG_BOXES`, `GUN_BOX`, `BODY_HALF_WIDTH`,
  `BODY_HEIGHT`, `ZONES`, `gunLocalXSpan()`, `GUN_INNER_X`/`GUN_OUTER_X`,
  `rigEnvelopeViolations()`.
- `src/render/player.js` — box list replaced by a loop over `RIG_BOXES` +
  `GUN_BOX`; three zone materials instead of one shared material;
  `sync()` unchanged.
- `src/render/palette.js` — `playerDark`/`playerMid` added to `CLASSIC` and
  `CONCEPT`, each in a delimited T-040 block.
- `tools/pathcheck.mjs` — one delimited block appended at the end (before
  the summary print).

Nothing else was touched — confirmed with `git status --short` /
`git diff --stat` showing exactly these four paths throughout.

## Collision box / movement: unchanged (verified, not just claimed)

`BODY_HALF_WIDTH = CONFIG.player.width / 2` and `BODY_HEIGHT =
CONFIG.player.height` are **read** from `CONFIG.player`, never written —
`src/pure/rig.js` has no assignment into `CONFIG` anywhere. `tools/
pathcheck.mjs`'s new block asserts `BODY_HALF_WIDTH === 0.35` and
`BODY_HEIGHT === 1.7` explicitly, so a future change to either constant
fails loudly here rather than silently deriving a new envelope. `sync()`'s
crouch/flow logic is byte-identical to before this task.

## Draw-call delta

Before: 4 body meshes (torso/head/legL/legR) + 1 gun mesh = **5**.
After: 6 body meshes (+ visor, + pack) + 1 gun mesh = **7**.
Delta: **+2**, matching the packet's budget exactly. Asserted in
`tools/pathcheck.mjs` (`RIG_BOXES.length + 1 === 7`).

## Verification

**`node tools/pathcheck.mjs`: `1767 passed, 0 failed`.**

Evidence the new assertions actually bind (LANE-BRIEF's evidence standard —
a gate proven only by going green is not evidence): I broke each of the two
load-bearing new checks in turn and confirmed the exact expected failure,
then restored and reconfirmed green + a clean `git status --short`/`git diff
HEAD --stat`:

1. Widened `torso`'s `x` from `0` to `0.6` in `src/pure/rig.js` →
   `node tools/pathcheck.mjs` → `1766 passed, 1 failed`, with:
   `FAIL T-040: the shipped RIG body table is inside its own envelope —
   torso: x-extent [0.360,0.840] reaches 0.840, past the 0.350 collision
   half-width`. Restored → `1767 passed, 0 failed`.
2. Changed `CONCEPT.playerMid` to `0xe5e2d9` (near-identical to `player`) in
   `src/render/palette.js` → `1766 passed, 1 failed`, with:
   `FAIL T-040: concept RIG zones clear a 100/765 luminance floor between
   every pair (12, 332)` (the 12 is exactly the packet's failure mode: two
   tokens landing only 2% apart). Restored → `1767 passed, 0 failed`.

Also exercised, inline in the same pathcheck block (not just "prove it
breaks" — the synthetic cases run every time): a box escaping the lateral
half-width, a box topping out above the collision height, an undeclared
zone name, and a table missing a zone are all separately constructed and
asserted to produce the matching violation message.

**Browser smoke** (`?selftest=1`, served locally on a scratch port, killed
after): `SELFTEST PASS (29 checks)`.

**Bot playtest** (`tools/playtest/run.mjs scripts/mid-route.json
--deterministic`): `outcome: completed`, `deaths: 0`. No behavior change was
expected (render-only), and none appeared.

**Worktree hygiene**: `git status --short` shows exactly
`src/pure/rig.js` (new) + the three modified files, no stray artifacts, both
before and after every capture/break/restore cycle in this session.

## Evidence

Captured via a scratch Playwright script (not committed, not under
`tools/playtest/**`) against a temporary local server, killed afterward.
**First attempt was invalidated and redone**: port 8753 turned out to be
squatted by an unrelated stray `python -m http.server` from earlier in this
shared session (my `node tools/serve.mjs 8753` failed to bind and logged
"already in use," which I didn't check before capturing) — both "before" and
"after" shots from that attempt were silently served from the stale
process's own tree and were identical. Re-verified the server identity via
`curl -I` (`Server:` header) before recapturing on a genuinely free port,
and confirmed in-page (via a temporary, since-removed console.log) that all
three zone materials resolve to the correct, distinct hex values before
trusting any screenshot.

- `reports/tasks/T-040/evidence/before-far-default.png` /
  `after-far-default.png` — full 1280×800 frame at the shipped FAR default
  (`?deterministic=1`, no other flags), RIG mid-run.
- `reports/tasks/T-040/evidence/before-5x-crop.png` /
  `after-5x-crop.png` — a 140×170 native-resolution crop around RIG, scaled
  5× with point (nearest-neighbor) sampling, no interpolation.

Native-resolution (1×, un-scaled) pixel read at RIG's on-screen size — the
actual thing a player sees, not the 5× magnification — sampled straight down
a column through the figure in the "after" crop:
- head/visor band (`y=76..81`): RGB ≈ (167,165,151), sum 483
- torso/pack band (`y=82..96`): RGB ≈ (69,64,51), sum 184
- leg band (`y=97..104`): RGB ≈ (121,116,95), sum 332

Three distinct, ordered bands (bright > mid > dark) are genuinely present at
true on-screen scale, not only in the 5× crop.

## Open feel questions for the operator

Never judged here — machine gates don't judge fun or look. For the exact
URL: `index.html` (shipped default, no query flags) at the FAR camera.

1. Does the three-zone split (bright head/visor/gun, dark torso/pack, mid
   legs) read as a *figure* at the true on-screen size (~30 px tall), or
   does it still read as "one blob with a smudge"?
2. Is the visor/helmet break legible as a helmet, or does it just look like
   a slightly wider head at this distance?
3. Does the pack read as a pack (a silhouette bump behind the torso), given
   it's on the far side of the body from the camera and partially
   self-occluded at some aim angles?
4. Is the dark torso value now reading as "armor in shadow" (intended) or as
   "a hole in the sprite" at a glance?
5. Should the gun-arm's own bright value be reconsidered given it now sits
   next to a much darker torso (higher local contrast than before), or does
   that contrast help the aim-pose read (pillar 2)?

## Best next action

Send to review/playtest per the loop protocol (`reports/tasks/T-040/
review.md`, `reports/tasks/T-040/playtest.md`); if both are green, merge via
`tools/orch/merge-task.sh T-040` from the main checkout, then route the five
questions above to the operator's checkpoint queue with the URL above.
