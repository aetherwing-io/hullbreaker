# T-038 build report — warm-white seam pips and route-lip lights (S5)

worktree `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-038`,
branch `task/T-038`, commit `aa822fe`.

## Lead numbers (per the dispatch: luminance change first, then draw-call delta)

**Luminance >L200 share** (perceptual luma `0.299R+0.587G+0.114B`, 1280x800,
shipped FAR default, concept palette), gameplay pair (both sides: boot →
hold right 4s, identical seed/script):

| | pixels > L200 | share |
|---|---|---|
| baseline | 989 / 1,024,000 | 0.097% |
| `?seams=1` | 3,406 / 1,024,000 | 0.333% |

**~3.4x increase.** Still a small fraction of the frame — this adds
highlight *specks* along route edges, not a wash — but it is the first
nonzero answer this codebase has produced to the packet's "0.0% of playfield
pixels exceed L200 in all fifteen gameplay captures" finding, and none of it
comes from existing geometry: nothing in the baseline frame carries an
unlit/emissive warm-white material this bright.

**Draw-call/instance delta**, clean pair (no input, so bullet/hostile counts
cannot drift the two runs apart — this is the number to trust for the delta,
not the gameplay pair, which fluctuates ±a few calls run to run same as
main does today):

| | calls | triangles | InstancedMesh | instances |
|---|---|---|---|---|
| baseline | 94 | 50,196 | 13 | 2,969 |
| `?seams=1` | 96 | 56,336 | 15 | 3,583 |
| delta | **+2** | +6,140 | **+2** | +614 |

Exactly matches the packet's own "+1 to +2" estimate. +6,140 triangles is
exactly 307 pips × 12-tri box + 307 halos × 8-tri octahedron; +614 instances
is exactly 307 + 307. **Honesty note:** the packet cites 101/50,276/13/2,969
for "the" baseline; this rig's own re-measurement of the same unmodified
boot frame reads 94/50,196/13/2,969 — InstancedMesh and instance counts
match exactly, calls/tris are a handful off (almost certainly a slightly
different HUD/overlay or wave-gate state at the captured instant, not a
regression). Per the lane brief's evidence standard I did not inherit the
packet's number across a change that could move it — the delta above is
from a **paired** measurement this rig took itself, both sides shot by the
same script at the same instant after load.

Full methodology, more frames, and the reproduction rig:
`artifacts/t038-seams/README.md` and `artifacts/t038-seams/capture.mjs`.

## What changed and why

**`src/pure/seams.js` (new).** THREE-free, deterministic. Derives pip
"runs" from level data that already defines a route:

- `deckEdgeRuns(groundH)` — contiguous `[s0,s1)` spans of real ground
  (`groundH[s] > -100`, the same predicate `src/pure/limb.js`'s kerb loop
  uses).
- `deckSeamRuns` / `platformSeamRuns` — evenly spaced pip centres inside
  each qualifying deck run / catwalk platform, `s0`/`s1` copied **verbatim**
  from the source data (never authored, never padded) so a pip line can
  never advertise a ledge that does not exist.
- `resolveSeams(value)` — the `?seams=1` opt-in resolver, same shape as
  `resolvePaletteId`/`resolveLegibility`.
- `SEAMS` — local tuning table (see "Scope and fence notes" for why it
  isn't in `CONFIG`).

**`src/render/seams.js` (new).** Bakes two fixed `InstancedMesh`es ONCE at
module load and never touches them again — no update function exists and
none is wired anywhere. A small opaque box (`PAL.seamPip`) is the core; an
additive halo pool (`PAL.seamHalo`) copies the merged T-011 idiom verbatim
from `src/render/fx.js:106-135` (`AdditiveBlending`, `depthWrite:false`,
`fog:false`, `renderOrder 2`, no material `color` so `instanceColor` is the
identity multiplier — the pool stays one draw call). Placement mirrors
`src/render/level.js`'s own tile-bake math (per-column heading rotation,
outward depth offset) rather than `src/render/tower.js`'s `towerPose`, to
avoid the transform-slice branch entirely (see scope note below). Gated on
`SEAMS_ENABLED && !IS_TRANSFORM_SLICE`; builds nothing under either
condition.

**`src/render/palette.js`** — one delimited block (`/* ==== T-038 seam pips
==== */`) adding `seamPip`/`seamHalo` to both `CLASSIC` and `CONCEPT`,
appended after the two table literals rather than edited into them, so a
concurrent edit to either table's body composes trivially.

**`src/render/legibility.js`** — `SHARE.pip = 1` (full share, same as
`glyph`/`cue`: a pip is a message about a ledge, not a body) and the
derived `PIP_GAIN` constant, same shape as `GLYPH_GAIN`/`CUE_GAIN`.

**`tools/pathcheck.mjs`** — one delimited block at the end of the file (own
`import`, own assertions), so it never touches the existing shared
`tokenized` array or any other section. 1741 → 1770 assertions.

## Scope and fence notes (read before merging)

The team-lead dispatch's file list differs from the packet's own "Files:"
line for S5 in one place: the packet names `src/render/level.js` as a file
this item touches (for the scute/kerb `limbBakePlan` seam input); the
dispatch explicitly assigns `src/render/level.js`, `src/render/limb.js` and
`src/config.js` to T-035 this cycle. Per the dispatch and
`docs/LANE-BRIEF.md` ("if this file and your task block disagree, the task
block wins for scope... if your work genuinely needs a fenced file, report
what is needed and why — do not edit it"), **this build does not touch any
of those three files**, and therefore does not implement the `?g1=1` limb's
scute/kerb seam pips — only the deck-edge and catwalk-lip inputs, which are
live in every mode (not just `?g1=1`, which is itself the shipped default
since T-009, so this still covers the default game). If the operator wants
the limb-seam pips too, that is follow-up work sequenced behind T-035.

**`src/main.js` is also fenced and also untouched.** `src/render/seams.js`
therefore has **no import site in this diff** — nothing currently loads it,
so `?seams=1` has no effect on the committed tree as-is. **The integrator
needs to add one line** to wire it in:

```js
import './render/level.js';
import './render/seams.js';   // <-- this line, right after level.js
```

(anywhere in the render-module import block works; next to `level.js` is
thematic since both draw the route). Every measurement and screenshot in
this report and in `artifacts/t038-seams/` was taken against a **throwaway
temp copy** with that exact line added — never against the real worktree,
which stays byte-identical to `main` plus this diff. `artifacts/t038-seams/
capture.mjs` does this itself, automatically, each time it runs, and never
writes back to the worktree it's pointed at.

**No CONFIG.seams table.** `src/config.js` is fenced this cycle, so the
tuning constants (`pipEvery`, sizes, depth offsets) live as an exported
`SEAMS` table inside `src/pure/seams.js` itself instead — flagged in that
file's own header comment to move into `CONFIG.seams` at the next
opportunity that touches `config.js` without a lane conflict.

**Ships `?seams=1`, default off.** Per CLAUDE.md's "prototypes ship behind
query flags, off by default" — this has not had an operator checkpoint, and
S5's own packet text says any pixel-changing item needs one before it
becomes the judged default.

## Verification

| command | result |
|---|---|
| `node tools/pathcheck.mjs` | **1770 passed, 0 failed** (was 1741 before this branch) |
| `index.html?selftest=1` (real worktree, ephemeral port) | **SELFTEST PASS (29 checks)**, no page errors — confirms the palette/legibility edits don't break anything even though seams.js has no import site yet |
| `index.html?selftest=1&seams=1` (throwaway wired copy) | **SELFTEST PASS (29 checks)**, no page errors — confirms the module itself boots clean once wired |
| `node run.mjs scripts/mid-route.json --deterministic` (real worktree) | outcome `completed`, unaffected (unchanged files this run touches) |
| `node run.mjs scripts/mid-route.json --deterministic --url '…&seams=1'` (wired copy) | outcome `completed` — identical to the unwired run |
| `node run.mjs scripts/six-face-aimed-run.json --deterministic --stop-on-game-over` (real worktree) | outcome `not-completed`, 0 deaths, 34 tap fires |
| same, `--url '…&seams=1'` (wired copy) | **identical**: outcome `not-completed`, 0 deaths, 34 tap fires — the pass changes zero sim behavior |

Servers: `tools/serve.mjs` on port 8934 for the playtest runs (killed after),
`startStaticServer(dir, {port:0})` (ephemeral) for every capture/selftest.
8741/8742 never touched. `tools/playtest/npm install` was run once in this
worktree (gitignored `node_modules`, no tracked-file change) so the harness
could run at all — confirmed with `git status --short tools/playtest`
showing nothing.

### Every new falsifying-test assertion proven to bind (break → red → restore → green)

Per `docs/LANE-BRIEF.md`'s evidence standard, each guard below was broken in
place, confirmed to fail pathcheck, then restored — `git status --short` /
`git diff HEAD --stat` were empty after every restore, and the whole diff
sat clean before the final commit.

| guard | break | result |
|---|---|---|
| (a) derived-not-authored run boundary | padded a deck run's `s1` by 1 column past the real ledge | 2 assertions FAIL, naming the exact run |
| (b) hue family + luminance ordering | set `CONCEPT.seamPip` to `houndTell`'s exact hex | both the hue-shape and the luminance-cap assertions FAIL |
| (c) static-anatomy / no view hook | added a dummy `installView` reference to `src/render/seams.js` | the mirrored guard FAILs, naming the file |
| (e) tokenization opt-in | put a raw `0x...` literal in `src/render/seams.js` | the raw-literal assertion FAILs and echoes the exact literal found |
| projected-pixel floor | shrank `SEAMS.pipSize` to 0.01 | all three view-id assertions FAIL, each reporting the actual measured px (0.33) |

## What is NOT covered (say so plainly)

- **The `?g1=1` limb's scute/kerb seam pips** — out of scope per the fence
  above; `src/pure/limb.js`/`src/render/limb.js` untouched.
- **Draw-call delta is not pathcheck-gated** — pathcheck has no renderer;
  the delta is measured by the browser rig in `artifacts/t038-seams/`, same
  as S6's own falsifying test (d) says draw-call/perf numbers belong in
  `tools/playtest`, not pathcheck. The pathcheck suite does assert the
  *deterministic instance count* (307, bounded under 400) headlessly, which
  is the part that can be.
- **Fog pre-attenuation for distant pips** (a risk the packet names) does
  not apply to this build's scope: every pip here sits at one of two fixed,
  near depths (flush with the tile lip or the catwalk slat, both essentially
  at the play-plane depth already drawn there), never in the receding
  backdrop the risk was written about (that's the limb-seam application,
  out of scope above). Flagging this explicitly rather than silently
  dropping the risk note.
- **Not wired into `src/main.js`** — see above; this is a report, not an
  oversight to be found later.

## Operator questions (feel — not mine to judge)

Serve the wired build on a free port (never 8741/8742) after the
integrator adds the one import line, e.g. from this worktree:
`node artifacts/t038-seams/capture.mjs --root <this worktree>` writes fresh
frames, or serve directly with `node tools/serve.mjs 8799 --root <worktree
with the import added>`.

Frames to look at first: `artifacts/t038-seams/gameplay-baseline.png` vs
`artifacts/t038-seams/gameplay-seams.png`.

1. Do the pip rows read as lights on the route's edges, or as clutter/noise
   against the existing checker and catwalk slats?
2. The halo (additive glow) currently dominates the box core's silhouette
   at this camera angle, reading as a small diamond rather than a cube —
   intended or worth a squarer/flatter halo shape?
3. Density: 307 pips at one every 3 tiles, over the whole 445-tile level.
   Too sparse, too busy, or about right at the shipped FAR view?
4. Is a plain warm-white (muzzle-family, deliberately dimmer than the
   player's own fire and every hostile tell) the right read, or does it
   need to sit closer to `PAL.muzzle`'s brightness to register as "the
   frame's only highlight" the way the packet frames it?
5. Should this sequence ahead of or behind S1 (the value-ladder bake)? The
   packet's own sequencing table puts S1 first and S5 "after T-030" (already
   merged) — nothing here depends on S1 having landed, but the two are
   visually compounding (a darker world would make these pips read
   brighter by contrast).

## Single best next action

Gate this branch (reviewer + playtester) and, if approved, have the
integrator add the one `import './render/seams.js';` line to `src/main.js`
in the same merge pass — the diff is otherwise inert without it. Then route
the five questions above to the operator checkpoint queue with the exact
served URL.
