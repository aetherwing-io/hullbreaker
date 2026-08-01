# Sprint — wave 4: delivery push

Queue for the orchestrated push toward the **delivery target** below.
Governed by `CLAUDE.md`'s loop protocol; mission mandate in
`docs/decisions.md` entry 8 (autonomous merges, asset lane open, loop until
delivered); prior verdicts in entries 1–7 are law. Schema at the bottom.

## Delivery target (definition of "delivered")

The default six-face run, start → summit → victory, playable end-to-end with:
- every DESIGN enemy role shipped (wasp ✓, carrier ✓, hound ✓, polyp, mortar)
  and taught teach-then-combine;
- transformations obeying the static-anatomy rule (CP3 v2 + G1 grammar);
- the concept-art palette applied (deep teal / rust-orange / acid-green /
  hot-magenta / warm-white), fog-matched, FAR-readable tells and glyphs;
- a full juice pass (hit-stop, shake, flashes, particles) and WebAudio synth
  SFX + layered ambience — restrained per DESIGN, but present;
- a game shell: start screen, pause/options, death/restart flow, run stats;
- 60fps with 200+ projectiles, no console errors, `?selftest=1` green,
  pathcheck green, smoke suite green, boot-to-victory ≈ 4–5 min;
- operator checkpoint packets posted for every feel question raised en route.

## Queue

## T-001 | feature | done | P1

goal: CP3 second pass — rework the transform slice (`?slice=transform`) to the
static-anatomy render rule, so flip and breach read as RIG ascending around a
monstrous, prebuilt body (decisions.md entry 3; G2/G4 fixtures in
`docs/proposals/2026-07-meridian-monster-greybox-map.md` are the target shape).
accept:
- [ ] no geometry assembles, slams, or articulates during the flip or breach;
      the upcoming band is pre-built wherever sightlines could expose it
- [ ] only the access plate / vent cover moves; two-snap chunkiness lives in
      the camera's ratchet curve (the G1 limb-turn bake is prior art:
      `src/render/limb.js`, `artifacts/g1-limbturn/`)
- [ ] sim untouched or provably equivalent (pathcheck trace-compare, as G1 did)
- [ ] `node tools/pathcheck.mjs` green, incl. any new choreography assertions
- [ ] `tools/playtest` `transform-slice.json --deterministic` still completes
- [ ] screenshot sequence in `artifacts/cp3-transform-v3/` + operator packet
      (URL + 3–5 questions) queued below
owner: gameplay-engineer
verify: node tools/pathcheck.mjs; cd tools/playtest && node run.mjs scripts/transform-slice.json --deterministic --max-runtime-ms 20000

## T-002 | investigation | done | P1

goal: close the t2-transform-seam-rush divergence question (playtest README
"single best next action"): instrument the ritual-arming check in
`src/sim/transform.js` to determine whether one-frame input-arrival alignment
flips the outcome fork (first-death divergence up to ~6.5s of gameMs under
fully deterministic injection + fixeddt).
accept:
- [ ] instrumentation or a targeted assertion demonstrates (or refutes) the
      frame-alignment sensitivity at the suspected decision point
- [ ] written finding in `docs/playtests/` with repro commands
- [ ] a recommendation: build the synchronous frame-scoped input hook
      (playtest README hook request #5), or a cheaper sim-side fix, or accept
- [ ] no gameplay behavior change in this task; instrumentation dev-only
owner: gameplay-engineer
verify: node tools/pathcheck.mjs; repro per tools/playtest/README.md §Deterministic injection mode

## T-003 | art | todo | P1

goal: FAR-camera readability pass — the accepted follow-up from the view-scale
verdict (decisions.md entry 7): scale up enemy tells, capsule letter glyphs,
and hound telegraph cues so they read at the default FAR view (RIG ≈ 3.7% of
screen height) without enlarging RIG.
accept:
- [ ] render/ui-side only; no sim or hitbox changes (pathcheck layer guards prove it)
- [ ] capsule glyphs and wasp/hound tells legible in screenshots at ?view=far
      (compare near/mid/far captures side by side)
- [ ] concept-art color roles preserved (acid-green danger, hot-magenta reward)
- [ ] before/after screenshots attached for the operator packet
owner: gameplay-engineer
verify: node tools/pathcheck.mjs; tools/playtest run at ?view=far with screenshots
notes: sequenced after T-004 merges (both touch render/hostiles). Use
T-015's scale-true viewer (`tools/assets/view.mjs`) and its measured
finding (capsule = 9.6px at FAR; see checkpoint queue) as the evidence
base; the operator's direction pick (world-space scale-up vs HUD read)
steers the implementation.

## T-004 | feature | done | P1

goal: polyp turret v1 (Iris Polyp, boards 06/07) — next enemy in DESIGN's
teach-then-combine order: locks a connector/sightline, creates target
priority; side-facing barrel per board 07's note.
accept:
- [ ] solo stage behind a flag (e.g. `?polyp=1`) in the traversal slice, off
      by default; tell → reaction window → movement answer all readable
- [ ] placement-over-stats doctrine (decisions.md entry 6): it threatens by
      position on routes the player needs, not by hp/damage inflation
- [ ] materialize/depth-theater rules respected (no hitbox until solid)
- [ ] one two-enemy combination stage only after solo reads clean
- [ ] pathcheck green incl. spawn/placement assertions; feel questions queued
      for the operator — do not self-judge fun
owner: gameplay-engineer
verify: node tools/pathcheck.mjs; a named tools/playtest script (policy mode ok) exercising the turret

## T-005 | harness | done | P3

goal: replace `tools/playtest/lib/fixture.mjs`'s hand-copied
TRAVERSAL_FIXTURE snapshot with a real import from `src/pure/traversal.js`
(playtest README hook request #6 — documented zero-drift, low-risk cleanup).
accept:
- [ ] fixture.mjs imports the real module; hand-copy deleted
- [ ] route-coverage metrics unchanged on the committed demo scripts
- [ ] playtest README limitations section updated (staleness risk removed)
owner: gameplay-engineer
verify: cd tools/playtest && node run.mjs scripts/mid-route.json --deterministic --out /tmp/t005-check

## T-006 | feature | doing | P3

goal: rib-run authored-slope movement prototype — the costed-but-unstarted
movement-lane candidate (decisions.md entry 5): a long diagonal ribline run
(boards 10/13 "long straight up a ribline") testing sustained ascending
momentum, marker-less and button-less per the hook-v1 rejection.
accept:
- [ ] behind a flag (e.g. `?ribrun=1`), off by default
- [ ] no new input: emerges from geometry + existing verbs (run/jump/launch)
- [ ] pathcheck reachability + slope-contract assertions
- [ ] operator packet queued (URL + questions vs FLOW `?flow=1`)
owner: gameplay-engineer
verify: node tools/pathcheck.mjs; named playtest script completing the rib-run

## T-007 | docs | done | P3

goal: docs drift sweep — `tools/playtest/README.md` still lists "add hostiles
to ?testapi=1" as an open hook request but the root README documents
`hostiles[]` as shipped in that snapshot; reconcile, and sweep
HANDOFF/README/FLEET-PLAN for post-G1 and post-entry-8 drift (mission,
autonomous merges, asset lane).
accept:
- [ ] playtest README hook-request list matches shipped telemetry
- [ ] HANDOFF/FLEET-PLAN reflect decisions.md entry 8's mandate
- [ ] no invented decisions; record only what's shipped/decided
owner: docs
verify: grep the claims against src/main.js telemetry + README

## T-008 | feature | doing | P2

goal: G2 neck access-plate flip gate fixture per the greybox-map proposal
(`docs/proposals/2026-07-meridian-monster-greybox-map.md` §G2), building on
T-001's landed static-anatomy grammar (relock-on-detent plate beat, see
`artifacts/cp3-transform-v3/README.md`).
accept:
- [ ] G2 fixture implemented per the proposal's spec, behind a flag, off by
      default; static-anatomy rule holds (only the plate moves)
- [ ] sim gating stays inert-until-crossed and deterministic; pathcheck
      green incl. new gate assertions
- [ ] capture sequence (screenshots per beat) committed under artifacts/
- [ ] operator packet queued (URL + questions per the proposal's own test
      questions)
owner: gameplay-engineer
verify: node tools/pathcheck.mjs; deterministic playtest script crossing G2

## T-009 | feature | todo | P1

goal: six-face integration — bring the judged grammar into the default run:
traversal-lattice route density (from the slice's learnings), hound-2.5
pressure placement, pace learnings from CP1, and the corner ritual rendered
as the G1 static-limb orbit. The entry-0a integration hold is released by
entry 8; post a checkpoint packet instead of blocking.
accept:
- [ ] default run's six faces gain lattice route choice (3–5 readable routes,
      dare pockets with measured retreat) without breaking wave gates
- [ ] hound placement per entry 6's doctrine on at least faces 2+
- [ ] corner ritual uses the static-anatomy render path by default (G1
      grammar); zipper assembly retired from world reveals (kept extractable)
- [ ] pathcheck green (generator invariants extended); full-run playtest
      script completes; 60fps hold with instancing intact
- [ ] operator packet: full-run URL + questions
owner: lattice-designer
verify: node tools/pathcheck.mjs; a new full-run playtest script (policy mode)
notes: biggest task in the queue — split into sub-worktrees if needed;
sequenced after T-001/T-004 merge to integrate their landings.

## T-010 | art | review | P1

goal: palette pass — replace the neutral grey-box palette with DESIGN's ≤8
color roles (deep teal environment, rust-orange metal, acid-green enemy
glow, hot-magenta pickups, warm-white muzzle light), fog matched to
background, per boards 01/10/13.
accept:
- [ ] render/ui-side only; color tokens centralized (one palette module, not
      scattered hex literals)
- [ ] fog/background/tile/enemy/pickup/muzzle roles match DESIGN §Concept
- [ ] silhouettes and threat readability improve or hold in FAR screenshots
      (side-by-side vs grey-box baseline)
- [ ] screenshots vs boards 01/10/13 attached; operator packet queued
owner: asset-artist
verify: node tools/pathcheck.mjs; tools/playtest screenshots at ?view=far

## T-011 | juice | todo | P1

goal: baseline feedback pass (DESIGN dev-sequence item 4, unlocked by entry
8): hit-stop, screen shake, muzzle flashes, impact/death particles, pickup
flash, crush-edge warning intensification, ritual/transform rumble —
restrained, readability-first.
accept:
- [ ] sim/render boundary respected: timing decisions that affect gameplay
      (hit-stop) live sim-side behind bridge hooks; visuals render-side
- [ ] every effect has an intensity constant in one juice config block
- [ ] 60fps holds with 200+ projectiles + effects (measure, don't assume)
- [ ] pathcheck green; smoke suite green; before/after capture for packet
owner: gameplay-engineer
verify: node tools/pathcheck.mjs; smoke suite; fps sampled via ?testapi=1
notes: DESIGN's caveat stands — after this lands, re-ask any "boring"
verdicts, since some perceived intensity is feedback.

## T-012 | audio | doing | P2

goal: WebAudio synth layer — procedural SFX (hit, hurt, jump, launch, pickup,
warning, ritual snaps, weapon-per-type fire) plus wave-layered mechanical
ambience that gains a layer per face (DESIGN §altitude perception). No audio
files, no deps: synthesized in a render/ui-layer module.
accept:
- [ ] sim emits events via existing bridge hooks only; audio module is
      render/ui-side and boot-optional (mutes cleanly, no autoplay errors)
- [ ] per-face ambience layering audible across corner rituals
- [ ] pathcheck green (layer guards prove sim untouched); smoke green
owner: gameplay-engineer
verify: node tools/pathcheck.mjs; smoke suite; manual listen note in report

## T-013 | shell | todo | P2

goal: game shell — start screen (board 05's three directions are unjudged:
build the middle "The Ship Wakes" composition as default, keep it swappable),
pause/options overlay upgrade, death/restart flow, end-of-run stats screen
(time, kills, falls, protoScore fields already in telemetry).
accept:
- [ ] ui-layer only; boots to title, enters run on input, restarts cleanly
- [ ] selftest still passes (it exercises pause/resume/restart)
- [ ] run-stats screen fed from existing telemetry, no new sim state
- [ ] operator packet: which board-05 direction should be canon
owner: gameplay-engineer
verify: node tools/pathcheck.mjs; smoke suite; ?selftest=1 via harness

## T-014 | feature | blocked | P2

goal: spore mortar (Seed-Pod Tripod, boards 06/07) — delayed landing-zone
denial per DESIGN's enemy table, teach-then-combine after polyp.
blocked-by: T-004 (polyp) merged and reading clean solo.
owner: gameplay-engineer

## T-015 | assets | done | P2

goal: codex asset pipeline bootstrap — `tools/assets/`: a `codex exec`
wrapper spec template, SVG→PNG rasterizer using the harness's Chrome
(playwright-core already vendored), palette-compliance checker (≤8 roles,
per DESIGN), `assets/manifest.json` validator, and a viewer scene/flag for
screenshotting an asset at in-game scale.
accept:
- [ ] `node tools/assets/check.mjs` validates manifest + palette + PoT sizes
- [ ] rasterizer round-trips a sample SVG glyph; viewer screenshot works
- [ ] zero effect on the shipped game; dev-deps only under tools/
- [ ] README with honesty section per harness convention
owner: asset-artist
verify: node tools/assets/check.mjs; sample round-trip committed as demo

## T-016 | feature | doing | P3

goal: score/setback convergence toward CP4 — promote the CHARGE/THREAT
prototype (`?score=1`) and Hull Fallback (`?fallback`) from slice prototypes
to a defended default-run proposal; the operator picks at CP4 (stock
lives/checkpoints remain unwanted, entry 0a).
accept:
- [ ] both prototypes run in the default six-face run behind flags
- [ ] one written recommendation w/ playtest evidence (protoScore now real
      per A.5 once HB.score events land — include that hook if cheap)
- [ ] CP4 operator packet queued
owner: gameplay-engineer
verify: node tools/pathcheck.mjs; scored-run playtest script

## T-017 | harness | todo | P3

goal: nit-batch cleanup triaged from the Inbox + T-015's review MINOR:
(1) I-001 — stale hostiles/capsules enrichment comment in
`tools/playtest/lib/sampler.mjs` (~43-48), plus the harness-side follow-up
it references (read `hostiles` from the primary testapi channel now that it
ships there); (2) I-002 — `tools/assets/check.mjs` failure-path info header
mislabels static imports as runtime references (~186-190); (3) T-015 review
MINOR — `tools/assets/README.md` honesty item 4 miscounts the 100x100 blend
census (5 blends, all hot-magenta; #ffdcc5 is below the 0.5% gate).
accept:
- [ ] all three fixed; harness demo run unchanged; check.mjs selftest green
- [ ] I-001/I-002 marked resolved in the Inbox (strike or annotate)
owner: gameplay-engineer
verify: cd tools/playtest && node run.mjs scripts/mid-route.json --deterministic; node tools/assets/check.mjs --selftest

## Operator checkpoint queue (feel verdicts — never block the loop on these)

- **G1 limb-turn:** default vs `?g1=1` (and `?g1=1&view=near`) on the six-face
  run — does the camera-orbit corner read as turning around a static limb?
  Frames in `artifacts/g1-limbturn/`. (Questions per greybox proposal §G1.)
- **FLOW:** `?slice=traversal&flow=1` — does the momentum spine read without
  explanation, and does it serve "every grab wants to become another launch"?
- **Crouch vs aim-assist:** `?crouch=1` vs `?aim=assist` — keep one, both, or
  neither (decisions.md entry 4's open question).
- **CP3 re-judgment (v3, T-001):** `?slice=transform` (default far view;
  `&enemies=0` to watch choreography, `&view=near` for the old framing).
  Frames + webm + equivalence report in `artifacts/cp3-transform-v3/`.
  Questions: (1) Does the flip now read as running into a pre-existing
  opening — the plate relocking flush during the hold — rather than
  geometry arriving? (2) Does the breach read as pressure escaping the
  body (cover caught on its stop, vapor clearing by the second snap)
  instead of the cover shattering into debris? (3) Chunkiness now lives
  only in the camera detents plus the covers clacking with them — still
  chonky enough, or too smooth? (4) At the far default, does the interior
  passage read at the right compression now that its fog rides the camera
  pull-back? (5) Does the altitude still feel earned on foot, with the
  breach only *revealing* it?
- **Glyph scale at FAR (T-015 finding — decide before any glyph batch):**
  measured at rendered scale, a 0.55-tile capsule is 9.6px tall at the
  shipped FAR view — chamfers and rivets vanish, the letter survives as a
  smudge (`tools/assets/reports/demo/capsule-letter-h/viewer-far.png`).
  This is the concrete evidence for entry 7's accepted readability
  follow-up. Candidate directions: scale world-space glyphs up, or move
  the letter read to the HUD. Asset batches are held until this is picked;
  T-003 implements whichever direction wins.
- **G2 neck-plate flip (T-008):** `?g2=1` (default far view; `&enemies=0` to
  watch choreography without the houndframe/wasps, `&view=near` for the old
  framing). Frames + beat clock in `artifacts/g2-neck-flip/`. Questions per
  the proposal's own G2 test: (1) Does the flip read as the plate carrying
  you into a neck interior that already existed — or does anything still
  read as the neck assembling? (2) Relocked on the hold, the plate rakes to
  the interior grade — does it read as the same plate becoming an interior
  ramp, or as a new object appearing? (3) After the turn, do the low deck
  and the two catwalks read as continuations of the routes you entered on
  (two-plus recognizable exits)? (4) The proposal's 14-tile apron makes the
  ritual pull travel 16 tiles in the same 990 ms (v1 pulled 11) — does the
  dive into the mouth feel committed-chunky or rushed? (5) At the FAR
  default, do five routes plus hound-low/wasp-apex stay readable through
  the gate window, or is the approach lattice too busy?
- (new packets append here as tasks land: palette, juice, shell, six-face run)

## Inbox (playtester/adversarial file here; integrator triages each cycle)

<!-- issue schema:
## I-### | bug|feel|fairness|art|docs | S1|S2|S3 | repro: <script + flags + seed/commit> | evidence: <path>
one-paragraph description; S1 = blocks a checkpoint or corrupts a gate,
S2 = real defect with workaround, S3 = polish/nit.
-->

## I-001 | docs | S3 | repro: read tools/playtest/lib/sampler.mjs lines 43-48 at main (post-e7b2952) | evidence: reports/tasks/T-007/playtest.md

Stale code comment found while gating T-007 (docs drift sweep): the
hostiles/capsules enrichment comment in `tools/playtest/lib/sampler.mjs`
still says "testapi does not expose hostiles/capsules at all as of this
writing ... this is currently the only source for them." Half-stale since
merge `e7b2952`: `?testapi=1`'s `telemetry()` now publishes `hostiles[]`
(capsules remains HB-only, so that half is still true). T-007's playtest
README correctly documents the real state and the open harness-side
follow-up (read hostiles from the primary channel); the comment lives in
harness *code*, so the docs-only T-007 lane rightly could not touch it.
Fold the comment fix into that harness-side follow-up when it lands. Nit,
no behavioral impact — the enrichment still works.

## I-002 | bug | S3 | repro: node tools/assets/check.mjs --root <fixture tree with a static `import ... from "../assets/x.png"` in src/> at task/T-015 28b8ba2 | evidence: reports/tasks/T-015/playtest.md

Cosmetic mislabel on check.mjs's failure path, found while gating T-015:
`checkGameIndependence` (tools/assets/check.mjs ~lines 186-190) collects
every `src/` line matching `assets/` into the info list, including lines
that are static imports — so a static import is correctly raised as a
problem (exit 1, right message) but is *also* printed under the header
"game references to assets/ (runtime, not imports)", which contradicts
itself. Fix is either filtering import-matched lines out of the info list
or renaming the header ("all references"). Verdict unaffected: errors fire
and exit codes are correct; the mislabel only appears on trees that are
already failing.

## I-003 | art | S3 | repro: polyp-facetank.json variant with durationMs 3300 --tail-ms 100 --deterministic --base-url <pinned task/T-004 32df995>, screenshot at first tell onset | evidence: tools/playtest/runs/gate-T-004-cap-tell-approach/screenshot.png (vs gate-T-004-cap-tell-parked/)

Found while gating T-004 (polyp turret, PASS): the Iris Polyp's tell is a
two-stage escalation — acid-green bulb dilating to a pale fully-open iris
— and the pale phase is excellent at the default FAR view (highest-contrast
object on screen). But the first ~300ms of the ~800ms tell reads as only a
small notch in the green bulb at FAR; nearly a third of the reaction window
carries little visual signal at the shipped camera. Not a blocker (the
pale phase plus the 450ms beam make the cycle readable, and operator
question 5 in the T-004 evidence packet already asks about silhouette
legibility) — fold into T-003's FAR-tells readability pass, whose scope
predates the polyp and currently names only wasp/hound tells and capsule
glyphs. T-003 is already sequenced after T-004's merge, so this is a
scope note, not new work.

## I-004 | art | S3 | repro: any run at default palette on task/T-010 0c4c003; compare src/render/hostiles.js color reads vs src/render/palette.js CONCEPT.wasp/carrier/hound tokens, or board 01's wasps vs artifacts/palette-v1/sixface-action--pair.png | evidence: reports/tasks/T-010/playtest.md; artifacts/palette-v1/sixface-action--pair.png

Found while gating T-010 (palette pass, PASS): the ENEMY acid-green role
lands only partially — `src/render/hostiles.js` still reads
`CONFIG.palette.wasp/carrier/hound/houndTell/houndCharge` directly (the
muted grey-box greens, e.g. wasp 0x7cc47c), not the brighter acid tokens
palette.js's CONCEPT table authors (wasp 0x9ce23e, enemyGlow 0x9dff3a).
Deliberate lane fence, documented in palette.js's FOLLOW-UP header note:
hostiles.js was in-flight under T-004 when T-010 branched, so the repoint
is deferred to after that merge. Threat readability holds in the FAR
side-by-sides (green still separates from teal/rust), but the enemies do
not yet reach board 01/10's acid intensity, and the "one palette module,
not scattered hex literals" acceptance is one file short. One-line repoint
per the palette.js note (tokens already authored and pathcheck-asserted);
fold into the post-T-004 integration or T-003's FAR-tells pass.

---

## Task schema

```
## T-### | type | status | priority
type:     feature | investigation | lattice | harness | docs | art | juice | audio | shell | assets
status:   todo | doing | review | operator | blocked | done
priority: P1 | P2 | P3
goal:     one sentence, with doc pointers
accept:   checkboxes an agent can verify (machine gates) + what goes to the
          operator (feel) — never a self-declared fun verdict
owner:    agent name (.claude/agents/)
verify:   exact commands
```

Status flow: todo → doing → review → done; `operator` parks a task on a feel
verdict; `blocked` parks it on a dependency or two failed attempts (note
why). The Stop-hook flywheel only counts todo/doing/review as open work.
