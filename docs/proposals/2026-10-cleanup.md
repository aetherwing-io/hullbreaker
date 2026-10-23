# T-121 — cleanup inventory: what the shipped game reaches, what it carries, and what can go (2026-10)

Lane T-121 (branch `task/T-121`, base `e5ce7d4`, whose `src/` is identical to
`bb8e4df`). Answers `decisions.md` entry 24 — *"it felt like the game was a
house of cards barely keeping it together"* — with measurements. Entry 25
(the operator released hook v1 and the zip-assembly corner for deletion)
arrived during the lane and is covered in §7. What was actually deleted, and
the proof for each batch, is in `reports/tasks/T-121/build.md`; this document
is the inventory and the proposals.

Every number below comes from a command in "How to reproduce", run against the
base commit unless it says otherwise. Host: 4-core GPU-less container, 1-minute
load average 30–48 during the runs; nothing here depends on load except the
browser timings, which are labelled.

## Summary

| | count | size | reachable from the default URL |
|---|---:|---:|---|
| tracked files (whole repo) | 1,975 | 439.0 MiB | — |
| `src/` modules | 159 | 57,177 lines, 2.24 MiB | **158** statically (56,746 lines); 1 unreachable (`src/pure/track-archetypes.js`, 431 lines) |
| `src/` exports | 1,154 | — | 805 imported by reachable src · 258 internal-only · 69 imported only by tools/tests · 22 imported by nothing |
| `assets/` | 322 | 174.5 MiB | **35 files, 13.1 MiB** are fetched by the default URL (desktop 1280x720 and phone 844x390 alike) |
| query flags | 62 parameters | read at 85 sites in 33 files (83 `QUERY.get/has` in 32 files, plus `touch-controls.js`'s own parser) | 10 operator-judged escape hatches · 22 integrator-default escape hatches · 11 unjudged experiments · 6 dev-bench · 9 diagnostic/harness · 4 released for deletion (entry 25) · 0 otherwise dead |
| `artifacts/` | 425 | 63.1 MiB | none (not shipped) |
| `reports/` | 611 | 160.6 MiB | none (not shipped; outside this lane) |
| `docs/` | 45 | 29.9 MiB (28.8 MiB of it the 14 concept boards) | — |
| `tools/` | 387 | 8.2 MiB | — |

Five findings, in order of weight:

1. **Almost nothing in `src/` is unreachable; the weight is behind flags and in
   generated data.** 158 of 159 modules load at the default URL. What the
   shipped game does not *execute* is code behind flags that are off by
   default (whole fixture modules, legacy branches), plus 7,868 lines (13.8 %
   of `src/`) of machine-generated JSON stored as pretty-printed JS. Deleting
   dead modules buys little; consolidating flags and compacting generated data
   buys a lot (§2, §6).
2. **The repository is 439 MiB, and the game needs 13 MiB of it.** The default
   URL fetches 35 asset files (13.1 MiB) and 158 modules (2.2 MiB).
   `reports/` (160.6 MiB, 104.3 MiB of it raw `report.json` traces under
   `reports/tasks/T-044/`) and `artifacts/` (63.1 MiB) are the bulk; neither
   ships. `artifacts/` is this lane's; `reports/` is the integrator's (§4).
3. **Flag sprawl is the real "house of cards".** 62 query parameters are
   read at 85 sites across 33 files, each render module reading its own;
   nothing lists them in one place, and `README.md` / `docs/ENGINEERING.md`
   had drifted (both still described `?momentum=1` as opt-in when momentum
   has been the default since `979e27b`). §2 inventories them; §6 proposes one
   declarative registry.
4. **Seven sim modules form one import cycle**
   (`player ↔ weapons ↔ hostiles ↔ capsules ↔ mods ↔ wavegate ↔ ecology-tactics`).
   ES modules tolerate it today; a single new top-level read of an imported
   binding during evaluation turns it into a boot-time TDZ crash whose site
   depends on import order (§6).
5. **Hook v1 costs ~1,140 lines; the zip corner's render side ~100** (§7, net).
   Both deletions are prepared and verified in isolation; most of their edit
   sites are in files in-flight lanes own, so they land after those merges.

## How to reproduce every number

| what | command | notes |
|---|---|---|
| module graph, export use, asset classes | `node tools/cleanup/graph.mjs` (`--json`, `--dead`) | acorn AST, walks `src/main.js`'s static + dynamic imports |
| lines behind each flag | `node tools/cleanup/flag-lines.mjs` | defaults imported from `src/mode.js` headlessly; render defaults read off their resolvers |
| default-URL boot, errors, request ledger, frozen-tick frame | `node tools/serve.mjs 8772 --root <tree> --quiet` then `node tools/cleanup/boot-probe.mjs --base-url http://127.0.0.1:8772 --out <dir> [--viewport 844x390 --touch]` | the request ledger is the runtime truth for "reachable assets" |
| tracked sizes | `git ls-tree -r -l e5ce7d4 -- <dir> \| awk '{s+=$4} END {print s}'` | |
| flag parse sites | `git grep -c -E "QUERY\.(get\|has)\(" -- src` | 83 in 32 files |
| default six-face sim fingerprints | `node tools/simlab/race/lab.mjs check --every 8` | 29 committed runs; all reproduce at the base (digest `8ea94ef8`) |
| traversal-slice sim fingerprints | `node tools/movement/matrix.mjs --grid baseline --against <base src dir>` | 44 runs |

Honesty notes for the three new tools are in `tools/cleanup/README.md`.

## 1. The dependency graph of the shipped game

**Entry point.** `index.html` loads one module script, `src/main.js`, after an
inline failsafe bootstrap and an import map pointing `three` and
`three/addons/` at jsDelivr (three 0.170.0). It also preloads five WebP
derivatives (the title plate and four world atlases) and links the favicon.

**Modules.** From `src/main.js`, the static import graph reaches **158 of 159
modules (56,746 of 57,177 lines)**. The only dynamic imports are the four
three.js post-processing addons in `src/render/post.js`, taken when bloom is
on — which it is by default. The one unreachable module is
`src/pure/track-archetypes.js` (431 lines): design data for levels 2/3
(`docs/TRACK-ARCHETYPES.md`), imported only by `tools/track-archetypes-check.mjs`
and cited by the queued T-207/T-209. It is not dead weight; it is unwired
future data — keep.

**Exports.** 22 exports nothing imports or uses (`graph.mjs --dead`). Of those,
the ones outside every fence and absent from every tool's source text were
deleted in batch 3 (~59 lines). The rest are fenced (`src/pure/rig.js`,
`src/pure/transform.js`, `src/sim/transform.js`) or pinned by a pathcheck
source-text assertion (e.g. `CRITICAL_GAMEPLAY_REQUESTS`,
`defenseVfxComponent`). 69 exports exist only for tests (`responseSocketViolations`,
`hostileGenomeSnapshot`, `solidAt`, …); whether they stay is T-120's call.

**Runtime-fetched files.** The default URL requests, on both desktop
1280x720 and phone 844x390 (touch): `index.html`, 158 modules, and 35 asset
files totalling 13.1 MiB — 4 backdrop/environment WebPs, the title WebP, the
favicon, 18 sprite files (RIG's three atlases, the enemy bodies, action poses
and motion atlases, the Warden), the capsule and enemy-ecology atlases, 2 hull
textures, the projectile, weapon and mutation atlases, 2 VFX atlases, and the
two Crown runtime atlases (which on this loaded host routinely miss the 2.5 s
boot budget and arrive after the game starts — the documented degrade path,
not an error).

**Flag-only reach.** A further 45 asset files (30.8 MiB) are named by `src/`
but not fetched at the default URL: WebP sources' PNG masters that pathcheck
re-measures (`sourceFile`), the painted backdrop plates `BACKDROP_TUNE`
(`src/config.js`) still names, the legacy Crown art (`?crown=legacy`), the
A-variant sprites (`?spritevar=a`), the modular wasp atlas (`?waspmod=1`), the
painted hull tile (`?tex=painted`), and the per-weapon v1 sheets
`src/pure/rig.js` still names. Deleting any of them is
deleting its flag; that is §2's decision, not a cleanup.

## 2. Flag inventory

Classes: **ESCAPE-HATCH** — a judged default plus its A/B control, keep;
split into *operator-judged* (a decision entry ruled on the feature) and
*integrator default* (shipped ON under entries 8/16 with no recorded operator
verdict on the feature itself). **UNJUDGED** — an experiment or A/B still
awaiting the operator. **DEV-BENCH** — fixtures and their knobs (entry 13
keeps the slice as a bench). **DIAGNOSTIC** — measurement or harness controls.
**RELEASED** — judged and released for deletion (entry 25). "Off-default
lines" is `tools/cleanup/flag-lines.mjs`'s count of branch lines the default
URL never takes; "whole modules" are files only that flag puts to work, added
by reading the code.

| class | parameter (where read) | what it switches · off-default lines | decision |
|---|---|---|---|
| ESCAPE-HATCH (operator) | `view` (mode.js) | near/mid camera pull-back · 10 | 7, 17 |
| | `shade` (palette.js) | value-ladder dose · a resolved number, no branch | 14 |
| | `juice` (mode.js, contact.js) | hit-stop, shake, particles; sim hit-stop too · 16 | 15 |
| | `bloom` (scene.js, post.js) | composer bloom on/strength · resolved values, no measured branch | 18 |
| | `light` (lightrig.js) | light rig `flat`/`noshadow`/… · table data | 18 |
| | `tex` (materials.js) | hull texture `pixel`/`painted`/`flat` · table lookup, no branch; plus the painted tile asset | 18 |
| | `shadow` (contact.js) | contact shadows · 3 | 17 |
| | `seams` (seams.js) | seam-pip highlights · 0 (one guard) | 17 |
| | `rig` (player.js) | `canvas` = shapes fallback instead of the sprite · 0 (shared fallback path) | 17 |
| | `touch` (touch-controls.js) | touch deck on/off (`legacy` arrives with T-101) | 20 |
| ESCAPE-HATCH (integrator) | `momentum`, `score`, `fallback`, `aim` (mode.js) | earned pace, CHARGE/overdrive, HULL FALLBACK, aim assist in the six-face run · 4 / 14 / 0 / 1 | 10–12 (themes), not the defaults |
| | `legibility` (legibility.js) | FAR readability compensation · 13 | 7 asked for it |
| | `audio` (audio.js, shell.js) | WebAudio synth layer · 0 (gated at one site) | — |
| | `shell` (mode.js) | `0` = pre-shell boot, `title` = force title under automation | — |
| | `world`, `detail`, `pack`, `components`, `defensevfx` (level.js and the *-art.js owners) | foreground dressing and its art layers · 0–11 each | — |
| | `sprites`, `actormotion`, `enemyecology`, `actionvfx`, `capsules` (sprite/art owners) | `0` = primitive bodies; also the asset-failure path entry 16 requires · 1–2 each | 16 (degrade path) |
| | `crown`=legacy, `limbs`=legacy, `scale`=0, `backdrop`=flat (crown*.js, limb.js, backdrop.js) | pre-pass looks · 3 / 8 / 0 / 5, plus the legacy Crown art (3.6 MiB of PNG) | — |
| | `palette`=classic (palette.js) | byte-faithful pre-T-035 grey box: control for the still-unjudged Palette v1 · 1 + the CLASSIC table | 14 (keeps it) |
| UNJUDGED | `flow`, `ribrun`, `autobounce`, `crouch` (mode.js) | movement prototypes in the slice · 12 / 1 / 2 / 1, plus `src/sim/flow.js` + `src/pure/flow.js` (193) and `src/pure/ribrun.js` (258) | 4, 5 ("still unjudged") |
| | `g2` (mode.js) | the G2 neck-plate flip fixture on the transform machinery · 3 | — |
| | `waspmod` (wasp-modular-art.js) | modular wasp v2 vs the shipped pixel wasp · 3 + `wasp-modular-spec.js` (909) + 4 small modules (203) | — |
| | `adaptive` (adaptive-fidelity.js) | adaptive fidelity ladder, opt-in until judged · 0 + two modules (114) | — |
| | `spritevar` (sprites.js) | A-variant sprites ("the operator's A/B") | — |
| | `title` (shell.js) | three title directions; `wake` ships | — |
| | `pixelworld` (backdrop.js), `atmos`=tone (post.js) | style probe; sky/haze tone A/B "an operator verdict, not a lane's" · 0 / 1 | — |
| DEV-BENCH | `slice`=traversal\|transform, `pace`, `hound`, `polyp`, `mortar`, `enemies` (mode.js) | the traversal and transform fixtures · 74 + 100 off-default branch lines; the transform fixture alone is three whole modules, 1,487 lines (`src/{pure,sim,render}/transform.js`), and the traversal fixture, paces and trials are lines 104–892 of `src/pure/traversal.js` (~790 of its 1,030) | 13 (keep the slice) |
| DIAGNOSTIC | `testapi`, `selftest`, `fixeddt` (main.js) | harness channels (T-120's) | — |
| | `warm`, `renderbudget`, `canvasaa`, `aa`, `postreport`, `fixtureart` | measurement A/Bs kept falsifiable by perf/art lanes · 0–7 each | — |
| RELEASED | `hook`, `hookinput`, `zip`, `g1` | §7 | 5, 3 → 25 |

**No flag outside entry 25's four is provably dead.** Nine parameters
(`atmos`, `postreport`, `pixelworld`, `fixtureart`, `capsules`, `enemyecology`,
`actionvfx`, `components`, `pack`) are named by no tool, doc or decision —
candidates for the registry pass to retire with an operator yes/no, not for a
cleanup lane to remove on its own: every one of them is someone's A/B control.

## 3. Assets

`graph.mjs` classifies every tracked file under `assets/` by who names it, by
basename (the way every src table names its files):

| class | files | MiB | of which ship in the deploy bundle |
|---|---:|---:|---|
| runtime-named (src or index.html names it) | 80 | 43.88 | 79 files, 43.83 MiB |
| tools-only (a pipeline script or a check reads it) | 77 | 73.06 | 38 files, 14.20 MiB |
| provenance-only (only another asset's prompt/manifest/README names it) | 129 | 44.96 | 91 files, 14.06 MiB |
| unreferenced | 36 | 12.58 | 25 files, 9.81 MiB |

The deploy bundle (`tools/deploy/build-bundle.mjs`) ships `assets/generated/**`
minus `review*`/`source*`/`*-sources` directories: 393 files, 80.8 MiB at the
base. Players fetch only what the page requests (35 files, 13.1 MiB), so the
bundle's extra weight costs host storage and upload, not load time.

Of the 36 unreferenced files, **three are outside every fence and named by
nothing anywhere** (not src, tools, provenance, docs, reports or artifacts):
`backdrops/backdrop-meridian-coils-v2.png`, `sprites/sprite-atlas-action-v2.png`,
`sprites/sprite-atlas-production-v2.png` — 5.46 MiB, all shipped in the bundle.
Batch 2 deleted them. The other 33 are not deletable by this lane alone:

- 7 old RIG sprites (`rig-aim-*-v1`, `rig-idle-gunless-v1`, `rig-run-*-v1`,
  1.4 MiB) are under T-103's `assets/generated/sprites/rig-*` fence.
- The wasp-modular source sheets are explicitly retained as rejected-crop
  evidence by `docs/WASP-MODULAR-MOTION.md`; the projectile `pixel-v1/` cells
  and source by `assets/generated/projectiles/README.md`; the defense-VFX
  source sheets feed `tools/assets/pack-defense-vfx.mjs`. They are provenance
  of live atlases.
- `ui/title-meridian-ascent-v1.png` is the reviewed master of the runtime WebP.

Of the provenance-only class, the 27 review boards under
`assets/generated/enemy-ecology/review/` (17.3 MiB, already pruned from the
bundle) are committed review screenshots by any reading of entry 24, but
`tools/level1-enemy-ecology-check.mjs` asserts each one exists and measures
it — **needs T-120** before they can go. The 68 files only
`assets/manifest.json` names (390 KiB of glyph/HUD/SVG/recipe outputs) need
manifest edits, and the manifest is T-103's fence.

## 4. `artifacts/` and `reports/`

`artifacts/` held 425 files (63.1 MiB) in 27 entries. Nothing reads them
except `tools/simlab/race/lab.mjs check`, which compares against
`artifacts/t104-race/baseline.json`; every other mention is a capture script's
*output* path or a citation in a doc or a gate record.

- **Kept — decision evidence:** `cp3-transform` (entry 3), `look-v1` (entry 18),
  and the look-direction audit captures behind entries 14/18 (`palette-v1`,
  `legibility-v1`, `shell-v1`, `t009-lattice`).
- **Kept — referenced by files outside this lane:** `cp3-transform-v3` and
  `g1-limbturn` (named as the packet format by the postprocessing skill's
  guardrail); **kept — live input:** `t104-race`.
- **Removed (batch 1): 18 entries, 244 files, 35.3 MiB** — one-off review
  evidence for merged tasks, cited only by their own gate records or by
  nothing. Recovery index with sizes, citations and regenerating scripts:
  `docs/archive/2026-10-artifacts-index.md`.

`reports/` (611 files, 160.6 MiB) is the largest tracked directory and is the
integrator's gate record, so this lane did not touch it. 104.3 MiB is raw
`report.json` playtest traces under `reports/tasks/T-044/`; in all, 371
non-markdown evidence files make up 158.8 MiB and the 225 markdown records
1.8 MiB. **Proposal (integrator):** keep every markdown record and delete the
raw traces and screenshots of merged tasks, recording the commit to restore
them from — the same pattern as `docs/archive/2026-10-artifacts-index.md`.
That alone would take the tracked tree from 398 MiB (after this lane's
batches) to about 240 MiB. Some of those files are cited by docs (e.g.
`reports/demo/`, `reports/t019/`), so the cut needs a citation pass first.

## 5. Non-test tools

| directory | status | finding |
|---|---|---|
| `tools/serve.mjs` | live | the dev server CLAUDE.md names |
| `tools/assets/` | live pipeline | generators of five `src/render/*spec*.js` files and the PNG/palette libs pathcheck imports. `extract-level1-enemy-ecology-provenance.mjs` is named by nothing and could only run on the operator's laptop (paths under `/Users/.../.codex/`) — a one-off, but it documents how a committed provenance file was made; listed, not deleted. `codex/` spec templates serve the retired codex workflow (entry 22 replaced it) yet a skill guardrail still points at them — the integrator's call. |
| `tools/deploy/` | live | `build-bundle`, `build-pages-site`, `asset-union-selftest` run in the Pages workflow; the verifiers are T-120's |
| `tools/durability/` | live | the abuse harness `src/main.js` and the deploy verifier reference |
| `tools/movement/` | live, partly hook-only | `simrun.mjs` (headless slice runner) and `matrix.mjs --against` (the traversal-slice equivalence proof this lane used) are live; `evidence.mjs` is the hook/flow A/B and goes with the hook (§7); `timestep-reachability.mjs` reproduces `docs/playtests/2026-08-timestep-reachability.md` |
| `tools/perf/`, `tools/vertical-assault/` | checks | standalone checks — T-120's (T-108 classified them) |
| `tools/simlab/`, `tools/art/` | fenced | T-102/T-104 and T-109 |
| `tools/cleanup/` | new | this lane's inventory and neutrality probes |

## 6. The fragility map — five refactors, proposed only

Each one is its own task, sequenced after the lanes it conflicts with. Size is
the lane's own estimate from the code read for this document.

### 6.1 Split `src/render/level.js` (2,632 lines) — the iteration-cost centre

**Evidence.** §5.7 of the race proposal measured it: ~4,250 lines of
procedural render geometry, and this file is the bulk — view hooks (lines
138–204), procedural dressing (206–1,712, ~1,500 lines, 227 `dress*`
references), the continuous hull skin and panel pools (1,713–2,400), and the
tile bake (2,400–2,632). Every corner/facet rule (`routeRenderable`,
`currentWorldFacet`, draw ranges) threads through all three.
**Proposal.** `level.js` keeps the bake and view hook;
`level-dressing.js` takes the `dress*` builders and pools; `level-panels.js`
takes panel geometry/UVs/draw ranges. Pure placement math moves to `src/pure/`
where pathcheck can call it instead of regexing it.
**Risk.** Medium, render-only: prove with the frozen-tick frame diff
(`boot-probe.mjs --compare`), the race-lab fingerprints, and draw-call/frame
budget before/after.
**Conflicts.** T-102 (route visibility), T-204 (per-side rise), T-205 (176-tile
sides), T-208 (kit pieces). Sequence it after T-205 and before T-208, which
it makes cheaper. **Size:** M–L.

### 6.2 Compact the generated data (7,868 lines → a few hundred)

**Evidence.** `src/render/defense-vfx-pack.js` (5,381 lines; 2,050 of them a
lone number), `foreground-component-spec.generated.js` (1,578) and
`wasp-modular-spec.js` (909) are `JSON.stringify(…, null, 2)` output wrapped
in `deepFreeze`. They are 13.8 % of `src/` by line count and dominate every
"largest files" list, which is part of why the codebase *reads* fragile.
**Proposal.** Their generators (`tools/assets/pack-defense-vfx.mjs`,
`pack-foreground-components.mjs`, `pack-wasp-modular-v2.mjs`) emit one
component per line. Same frozen objects; prove with a deep-equal of the
exported values before/after. (JSON module imports would need Safari 17.2+;
not worth the risk on the iPhone target.)
**Risk.** Low. **Conflicts.** `tools/defense-vfx-pack-check.mjs` regexes the
module text (T-120). **Size:** S.

### 6.3 Break the seven-module sim import cycle

**Evidence.** `graph.mjs`'s edge list: `player → weapons, mods, capsules,
wavegate`; `weapons → player, hostiles, mods`; `hostiles → player, weapons,
capsules, wavegate, ecology-tactics`; `capsules → player, weapons, mods`;
`mods → player, weapons, hostiles`; `wavegate → hostiles`;
`ecology-tactics → player`. Cycles are legal ESM until one module reads
another's binding at top level during evaluation; then boot dies with a TDZ
error that depends on which module was imported first.
**Proposal.** A leaf `src/sim/world.js` that owns the shared rows (`player`,
`hostiles`, `capsules`, `mods`, `kills`) and nothing else; behaviour modules
import state downward and call each other only from functions. No behaviour
change; prove with the race-lab fingerprints (29/29) and the traversal
matrix (44/44).
**Risk.** Medium (touches every sim module). **Conflicts.** T-102
(`player.js`, `wavegate.js`), T-201–T-203 (`wavegate.js`), T-206 (levels as
data). Sequence after T-206. **Size:** M.

### 6.4 One flag registry

**Evidence.** §2: 62 parameters, 85 read sites, 33 files; two docs had
drifted from the code; nine parameters are named by nothing outside their
own module.
**Proposal.** A pure, Node-safe `src/flags.js`: one row per flag (name,
values, default, class, decision entry, owner); `mode.js` and every render
owner read resolved values from it; `?flags=1` prints the table; pathcheck
asserts every `QUERY.get` site is registered. The table becomes the docs.
Retire the nine unnamed parameters with an operator yes/no.
**Risk.** Low–medium (every default must resolve identically — provable with
the boot probe's frozen-tick snapshot and the race lab). **Conflicts.** T-101
(`?touch=`), T-107 (`?view=`), T-201/T-206 (`mode.js`). **Size:** M.

### 6.5 Take the self-test and the debug surface off the boot path

**Evidence.** `src/main.js` is 1,155 lines: the self-test is 284 of them
(872–1,155) and loads on every boot although only `?selftest=1` uses it;
`window.HB` is another 116; and 34 `__HB_*` debug globals are installed
unconditionally by render modules.
**Proposal.** `src/boot/selftest.js` behind a dynamic `import()` under
`?selftest=1`; the `__HB_*` diagnostics registered into one debug registry
published under `?testapi=1`.
**Risk.** Low for the game; the capture scripts and verifiers that read the
globals must move with it. **Conflicts.** T-101 (`main.js`), T-120 (owns the
self-test and the readers). **Size:** S–M.

**Also noted, not ranked:** `src/render/hostiles.js` (3,922 lines; ~1,300 of
them Crown evolution + wasp articulation) wants the per-kind presenters
`hostile-presenters/` already started — after T-109's `?art=v2` lands;
`src/config.js` (1,548 lines, imported by 63 modules) mixes frozen movement
constants with art tables and could split by domain once T-120's gate stops
regexing it.

## 7. Hook v1 and the zip-assembly corner (entries 5, 3 → 25)

Entry 24 told this lane to measure, not delete, these two; entry 25 then
released both. Both deletions are written as exact-match patch scripts and
verified in an isolated clone (`reports/tasks/T-121/build.md` has the
commands and results). Most of their edit sites are in files in-flight lanes
own, so they apply after T-101/T-102/T-103 merge.

| | hook v1 (`?hook=1`, `?hookinput=`) | zip corner render side (`?zip=1`, `?g1=0`) |
|---|---|---|
| whole files | `src/sim/hook.js` 271, `src/pure/hook.js` 137, `src/render/hook.js` 86; `tools/movement/evidence.mjs` 172; the snap-hook pathcheck domain (its flow/crush half kept, renamed) | none |
| src | 18 files, −717 / +47 lines | 9 files, −143 / +52 (including the transform slice's reserved band-slam curve and its `CONFIG.transform.assembly`, dead since it was reserved) |
| tools | 12 files, −692 / +219 | 3 pathcheck files, −50 / +38 |
| flags, tokens, hooks | 2 flags; 3 palette tokens; 2 reset-registry owners; 1 view hook; the `L`/`E` gameplay keys | 2 flags; the `zipperColumn`/`faceRevealed` render implementations |
| pathcheck call sites | 36 hook-only deleted (T-108's DELETE-WITH-FEATURE list, 22 + 14), 5 mixed hook+flow assertions split with the flow half kept, 2 registry counts updated; −69 evaluations in all | 3 deleted, 2 rewritten as inertness checks, `g1-1-render-only-proved-sim` re-based off `?zip=1` (it is the gate's only `Math.random`-in-sim catcher, and still catches it) |
| what stays | `TRAVERSAL_FLOW.linkVerbs` keeps an inert `'hook'` entry because a flow assertion pins its length (T-120) | the SIM half: `wavegate.updateZipper`, the built-column state machine, `pure/waves.js` zipper timing — gameplay (I-105), owned by the race lane |

The operator liked the corner-building aesthetic (entry 25). It is
recoverable intact from git at `bb8e4df`; entry 3's addendum reserves it for
things the ship builds.

## 8. Not decided here

- Whether the nine unnamed flags in §2 stay (an operator yes/no each).
- Whether `reports/` drops its raw traces (integrator).
- Whether the traversal/transform fixtures are still wanted (T-108 §7.7 asked
  the same; if not, ~2,500 lines of fixture code and 467 deep-suite assertion
  sites go together).
