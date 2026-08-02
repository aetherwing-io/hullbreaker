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

---

## Fix cycle (commit `2bf379d`, after decisions.md entries 14/15/16 and an
independent review landed)

Three things changed since the report above, in response to real new
information rather than self-review. Everything above this line describes
`aa822fe` and is now superseded where it conflicts with this section;
`artifacts/t038-seams/` was regenerated in place (old frames/numbers not
kept — see that directory's README for why).

### 1. Recalibrated against decisions.md entry 14 (half-dose value ladder)

The team lead flagged that entry 14 makes T-035's half-dose value ladder
the shipped default, and that this report's numbers were measured against
the pre-ladder world. T-035 has not merged to `main` yet, so I built a
**scratch merge of `task/T-038` + `task/T-035`** (one textual conflict in
`tools/pathcheck.mjs`, both lanes appending at the same end-of-file
location — kept both blocks; `palette.js` merged cleanly since both lanes
used the delimited-block convention) in a throwaway clone, confirmed the
ladder is genuinely active by a plumbing sanity check (mean frame luma:
68.29 at `&shade=0`, 58.28 absent/shipped, 46.82 at the rejected `&shade=1`
— monotonic and clearly separated), then re-ran `capture.mjs` against that
merge.

**Result: the numbers barely moved** (0.097%→0.333% became 0.097%→0.332%;
draw calls identical). This is not a wasted re-measurement — it is now a
verified, not assumed, fact, and it has an explanation: T-035's own ladder
targets a 52-81 display-level range (crushing shadows/mid-tones), while
this pass's tokens and the packet's ">L200" metric live entirely above
that range. The two passes occupy non-overlapping parts of the histogram
by construction. Full writeup in `artifacts/t038-seams/README.md`'s "Why
the ladder barely moved the number".

### 2. Shipped ON by default (decisions.md entry 16)

Entry 16, recorded the same day, retires the blanket "prototypes ship
behind query flags, off by default" rule and **names this exact pass**
("the value ladder, the seam pips and the RIG pass all landed invisible
behind flags he never typed") as the motivating example. I did not wait to
be told to apply it to my own item — `resolveSeams` now resolves ON for
absent/''/junk; `?seams=0` is the escape hatch, same shape as
`resolveLegibility`. `tools/pathcheck.mjs`'s resolver assertion updated to
match. This is a bigger call than the calibration fix (it changes what a
bare URL renders once wired in), so flagging it explicitly rather than
folding it in silently: if this was premature or should have been
sequenced with the other look lanes, it is one line to revert.

### 3. Fixed the halo's fog handling (independent review finding)

A reviewer (`reports/tasks/T-038/review.md`, `REQUEST_CHANGES`) caught a
real gap in my own risk analysis. I had written off the packet's "distant
pips must be pre-attenuated by depth at bake time" risk as inapplicable to
my scope because I was only reasoning about the OUTWARD/depth axis (all my
pips sit at one of two fixed near-depths). The reviewer's point is sharper:
this is the first STATIC, whole-level bake using `AdditiveBlending` —
307 pips scattered across all 445 tiles of `s`, and the camera scrolls
past every one of them over a run, so distance-from-camera varies
continuously along the axis I hadn't considered. Copying `fx.js`'s
`fog:false` verbatim (fx.js's own pools are short-lived and
player-proximate, so it never mattered there) reintroduced exactly the
risk the packet named.

**Fix:** both materials now set `fog: true` instead of `fog: false`. A pip
recedes into the haze in lockstep with the deck/limb surface it rides,
using the engine's existing fog band rather than a hand-baked constant
(which would need re-tuning any time S2 retunes the fog band elsewhere).
New pathcheck assertions (`fog:false` banned in the file; both materials
must say `fog:true`) proven to bind by break/restore, same as every other
guard in this pass. `+2` assertions (1770→1772).

### Open question back to the team lead: is `src/main.js` actually fenced?

The reviewer independently checked the three sibling lanes running
concurrently this cycle (T-039 `c80926c`, T-040 `3c1c14e`/`7a48f27`, T-041
`0132aa2`) and found none of them touch `src/main.js` either — casting
doubt on whether it is genuinely contended right now, as opposed to a
standing caution that has outlived its cause. I have **not** added the
wiring line myself: the original dispatch was an explicit "do not touch,"
and I don't have visibility into every other in-flight lane or the
integrator's own plans for that file, so overriding an explicit
instruction on my own read of three grep results felt like the wrong kind
of unilateral call. Asking directly: if `src/main.js` is actually free, I
can add the one line (`import './render/seams.js';` after
`import './render/level.js';`) and re-verify in under five minutes: say
so and I will. Otherwise the integrator adding it at merge stays the plan.

### Verification, this cycle

| command | result |
|---|---|
| `node tools/pathcheck.mjs` (real worktree) | **1772 passed, 0 failed** |
| new `fog:true` guard, broken (`fog: false` reintroduced) then restored | FAILs naming both assertions, then green; `git status --short` empty after |
| `node tools/pathcheck.mjs` (scratch merge, task/T-038 + task/T-035) | **1817 passed, 0 failed** (1772 + T-035's own 45) |
| `capture.mjs --root <scratch merge>` | numbers in `artifacts/t038-seams/README.md` and `results.json` |
| mean-luma sanity check (`&shade=0/absent/1`, same merge) | 68.29 / 58.28 / 46.82 — monotonic, confirms the ladder is live in the merge |

Worktree is clean (`git status --short` empty) after every step; the scratch
merge clone and its throwaway wired copies live only under the scratchpad
and were never pushed anywhere.
