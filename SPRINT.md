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

## T-006 | feature | done | P3

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

## T-008 | feature | done | P2

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

## T-009 | feature | doing | P1

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

## T-010 | art | done | P1

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

## T-011 | juice | done | P1

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

## T-012 | audio | done | P2

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

## T-013 | shell | done | P2

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

## T-014 | feature | done | P2

goal: spore mortar (Seed-Pod Tripod, boards 06/07) — delayed landing-zone
denial per DESIGN's enemy table (line 233: "Denies intended landing zones
after a readable delay"; counter = redirect in the air or choose a different
connector; combine = hound punishes a panicked return to the floor).
Last enemy role in DESIGN's table; teach-then-combine after the polyp.
accept:
- [ ] solo stage behind a flag (e.g. `?mortar=1`) in the traversal slice, off
      by default; lob → marked landing zone → readable delay → detonation,
      all legible at the default FAR view
- [ ] the denial is a *movement* problem: the marked zone is on a route the
      player wants, and an alternate connector or an air redirect answers it
      (pillar 2 — combat happens through movement)
- [ ] placement-over-stats doctrine (decisions.md entry 6): threat comes from
      where it lands, never from hp/damage inflation
- [ ] materialize/depth-theater rules respected (no hitbox until solid);
      static-anatomy rule untouched (entry 3)
- [ ] one two-enemy combination stage (mortar + hound, per DESIGN's combine
      column) only after the solo stage reads clean
- [ ] pathcheck green incl. spawn/placement + telegraph-timing assertions;
      feel questions queued for the operator — do not self-judge fun
owner: gameplay-engineer
verify: node tools/pathcheck.mjs; a named tools/playtest script (policy mode ok) exercising the mortar solo stage and the combination stage

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

## T-016 | feature | done | P3

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

## T-017 | harness | done | P3

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
- **RIB RUN vs FLOW (T-006, the movement lane's two live candidates —
  decisions.md entry 5):** play these three back to back, same fixture
  window, same spawn, same pursuing edge, frozen jump constants in all of
  them:
  1. `index.html?slice=traversal&ribrun=1` — the authored slope: one
     ascending ribline, 6 risers of 2 tiles over treads of 7, 12 tiles of
     climb, no hostiles (the pursuing edge is the pressure). Hold right and
     hop; the tread is authored so a constant cadence rides it.
  2. `index.html?slice=traversal&ribrun=1&flow=1` — the same rib with the
     momentum spine on, which makes a mistimed hop's ledge catch auto-launch
     with no press.
  3. `index.html?slice=traversal&flow=1` — FLOW on the shipped lattice, the
     incumbent, for the A/B.
  (`&pace=surge` and `&view=near` both compose if you want the crescendo or
  the tighter framing.)
  Questions: (1) Does 1 read as "a long straight up a ribline" — one
  continuous ascent — or as a staircase climbed one step at a time?
  (2) Does the one-hop-per-rib cadence feel like sustained momentum, or does
  the per-riser press feel like work? (3) When you mistime a hop, the rib
  answers with a flange landing, a ledge catch, or a wall slide, in that
  order — does that read as the rib handing the run back to you, or as the
  rib eating it? (4) Against 3, which one better serves "every grab wants to
  become another launch", and should the rib CARRY flow by default rather
  than being a second flag? (5) The rib is deliberately one line, no route
  choice and no hostiles — is a pure movement bench the right shape to keep
  iterating on, or does it need a second line (or a contested plate) before
  the feel can be judged? Note for 1-2: RIG climbs 12 tiles while the camera
  holds its altitude (the traversal camera follows x only), so the crest
  plays high in frame — the transformation slice already has an
  altitude-following camera if that turns out to be the answer.
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
- **Palette v1 (T-010):** default (concept palette) vs `?palette=classic`, at
  FAR — the six-face run (`/index.html`), `?slice=traversal`,
  `?slice=traversal&polyp=1` (the enemy-color frames), `?g1=1`, and
  `?slice=transform`. Side-by-side pairs in `artifacts/palette-v1/` —
  `sixface-boot/sixface-action`, `traversal-action`, `polyp-tell`,
  `polyp-beam`, `g1-limb`, `transform-boot`, each
  `--classic/--concept/--pair.png` (judge against boards 01/06/10/13). The
  acid-green hostile ecology is LIVE on every enemy mesh this pass, the Iris
  Polyp included; only the tells and the polyp's spent vent stay warm amber,
  in both modes. The polyp is TWO stills, not one: a single emplacement wears
  exactly one emissive per iris state, so `polyp-tell` is the dilating bulb
  under its warm blink (RIG grounded on the walk at x≈54, hp 3, un-hit) and
  `polyp-beam` is the committed hot-acid bar from the same cycle under a
  second later (RIG caught in the lane at x≈61, knocked off its feet by the
  volley, hp 2). Both are state-triggered and pixel-verified by the rig
  (concept/classic: 542/796 px brightened on the blink — the kept ON frame
  against the dark half of the same blink, measurable only at capture — and
  2497/2650 px of hot acid the tell frame does not have, which anyone can
  recompute from the two committed stills); the closed → tell → fire → vent
  rhythm itself is a moving read and has to be judged live at the URL, not
  from stills. Questions: (1) does teal-air/rust-body read as the boards'
  Meridian, or does the rust drift toward terracotta? (2) do threats and
  capsules still pop at FAR on the rust deck? (3) is the deck still the
  obvious route surface (brightest large shape)? (4) does the G1 limb
  backdrop separate from the facet RIG runs on? (5) at FAR, do the acid
  bodies and their warm-amber tells stay two separate reads against boards
  01/06/10 — including the rooted polyp against the flying wasp?
- (new packets append here as tasks land: juice, shell, six-face run)

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

**RESOLVED — closed at the T-010 merge.** The fix-cycle wired
`src/render/hostiles.js` to the palette tokens (`PAL.wasp/carrier/hound/polyp`
plus tells, beam and vent), removed the pathcheck exemption, and added a
structural guard: every kind in the sim `ENEMY` roster must carry a body token
in **both** tables, so the T-004/T-010 collision cannot recur. The acid ecology
is live on every enemy mesh, the Iris Polyp included; tells and the spent vent
stay warm amber in both modes by design. Whether the acid bodies and warm
tells hold as two separate reads at FAR is now an operator question, answerable
from `artifacts/palette-v1/polyp-tell--*.png` / `polyp-beam--*.png` (packet
question 5), not an open defect.

## I-005 | bug | S3 | repro: on task/T-012 26de15f, boot any URL and evaluate `window.HB.audio`/`audioSnapshot` in the console or a page.evaluate — undefined; grep shows src/ui/audio.js:545 exports it and nothing imports it | evidence: reports/tasks/T-012/playtest.md; tools/playtest/runs/gate-T-012-audio-probe/layer-probe.json

Found while gating T-012 (WebAudio synth layer, PASS): `audioSnapshot()`
is exported from `src/ui/audio.js` and its own comment calls it a
"read-only debug surface (browser console)", but nothing imports it and it
is never attached to `window`/`HB`. With no build step and ES-module
scoping, an exported-but-unimported symbol is unreachable from a console
or a harness probe, so the documented debug surface does not exist in
practice. Zero player-facing impact; the cost is on QA and on the operator
debugging ambience — to get the layer count this gate had to wrap
`AudioParam.prototype.linearRampToValueAtTime` and infer engaged layers
from ramp batches, evidence that `audioSnapshot()` already computes
exactly (`enabled/unlocked/contextState/dead/layers/voices`). Fix is one
line — publish it on the existing debug handle (`HB.audio =
audioSnapshot`, alongside the other read-only getters in src/main.js) —
or drop the "browser console" claim from the comment. Prefer publishing:
it would also let a future harness policy predicate gate on ambience
state.

## I-006 | bug | S1 | repro: any default-run (non-fixture) playtest trace, e.g. `node run.mjs .../scripts/scored-run-baseline.json --deterministic --base-url <pinned task/T-016 da29e86>` — report says `deaths: 0, attempts: 0` while the run spent 2 stock lives | evidence: tools/playtest/runs/gate-T-016-scored-baseline/{report.json,screenshot.png}; reports/tasks/T-016/playtest.md

Found while gating T-016 (score/setback promotion, FAIL): the harness has
no working death counter for default six-face runs, and T-016's new
README honesty note directs readers to the broken one. `metrics.deaths`
and `outcome.attempts` both derive from `sliceStats.attempts`, which
`src/main.js:193` increments only inside `if (ACTIVE_FIXTURE)` — so every
default-run report reads zero regardless of what happened. The note added
at `tools/playtest/README.md` ("the default run counts `resetGame` calls,
not deaths — use `metrics.deaths`/`metrics.score.setbacks` for failure
counts") is wrong on both halves: the run counts nothing, and
`metrics.deaths` is the same blind counter. Verified against a real trace:
`gate-T-016-scored-baseline` shows two respawn signatures (t=19080 and
t=27412 ms, hp 1→3 with x snapping 89.3→51.6, `setbacks` unchanged) and
ends at HUD `×1` (two of three lives spent), while the report says
`deaths: 0`. S1 because default-run scripts are new with T-016 and every
future gate that follows this note will report zero deaths for runs that
died. Fix: correct the note to say no death counter exists on default-run
traces, and name what does work — `score.setbacks` on fallback-armed runs,
or a lives read (`lives` is on `HB.snapshot()` but not on the frozen
`testapi` channel, so publishing it there is the clean follow-up hook
request).

**RESOLVED (harness half) — verified by the T-016 re-gate at `a08753b`.**
`metrics.lives` now derives stock deaths from the HUD `×N` readout on every
default-run trace (my fresh baseline run: `deaths: 0` but `lives.spent: 2`,
losses at 19.1 s / 27.4 s with `x 89.25 → 51.58`), every report carries
`deathsScope` warning that `deaths`/`outcome.attempts` are fixture-only, and
the README note now points at `lives.spent` + `score.setbacks` instead of the
blind counter. Game-side `sliceStats.attempts` is still fixture-only by
design; publishing `player.lives`/`hp` on the frozen `?testapi` channel is
filed as playtest README hook request #9. **Residual, S3:** `outcome.result`
still cannot read `died` on a default-run trace — `computeOutcome`
(`tools/playtest/lib/metrics.mjs:285`) keys off the same fixture-only
`attempts`, so a run that spent two lives is labeled `not-completed` on the
first line of its `summary.md`, and the corrected note does not name
`outcome.result` among the fixture-only fields. One clause in that note, or
deriving `died` from `lives.spent` when attempts are unavailable, closes it.

## I-007 | docs | S2 | repro: compare `docs/proposals/2026-07-cp4-default-run-score-setback.md` §Evidence baseline row against its own artifact `tools/playtest/runs/scored-run-baseline-1785557898457/` at task/T-016 da29e86 | evidence: reports/tasks/T-016/playtest.md; tools/playtest/runs/gate-T-016-scored-baseline/screenshot.png

Found while gating T-016 (FAIL): the CP4 recommendation's A/B table says
the flags-off baseline ran "0 setbacks, 4 hits, 0 deaths". It died twice.
The builder's own committed baseline artifact shows hp 3→2→1→3 twice with
the position snapping backward each time, and its screenshot ends at HUD
`RIG ▰▰▰ ×1` — two of three stock lives spent; an independent gate run
reproduced it exactly. Root cause is I-006 (the report's `deaths` field is
structurally 0 outside fixtures), so this is a propagation, not an
invention. The correction makes the packet stronger, not weaker: the real
contrast is flags-off losing 2 lives and 13.6 tiles of ground (x 89.25 →
75.65) versus flags-on losing 0 lives and no forward progress (final x =
max x = 89.25, 3 setbacks absorbed) — which is also concrete evidence for
the packet's own question 2 about whether a setback that costs no forward
ground punishes enough.

**RESOLVED — verified by the T-016 re-gate at `a08753b`.** The baseline row
now reads "died twice, 2 of 3 stock lives spent (19.1 s / 27.3 s), each
respawn snapping x 89.25 → ~51.6, ends HUD ×1, final x 75.48 vs max x 89.25,
4 hits survived", and a correction box states the cause. I recomputed every
number in both headline rows straight from the committed traces
(`tools/playtest/reports/cp4/scored-run{,-baseline}/report.json`) — all agree,
and both rows now cite committed artifacts instead of gitignored `runs/`
paths. Reproduced independently: `tools/playtest/runs/gate2-T-016-baseline-wtharness/`.

## I-008 | docs | S3 | repro: compare `docs/proposals/2026-07-cp4-default-run-score-setback.md` §Evidence rows 3–5 against their only committed artifacts (`tools/playtest/reports/cp4/{scored-run-nojump,ceiling-score-only,fallback-only}/summary.md`) at task/T-016 a08753b | evidence: reports/tasks/T-016/playtest.md; tools/playtest/runs/gate2-T-016-nojump/report.json

Found while re-gating T-016 (PASS): rows 1–2 of the CP4 evidence table are
now fully checkable against committed `report.json` traces, but rows 3–5
still cite setback timestamps (3.2 / 22.4 / 27.4 / 27.8 s), final x (59.65,
31.65) and the `GAME_OVER` / "SIGNAL LOST" terminal state, none of which
appear in the only artifact committed for those runs — their `summary.md`
carries lives, stall and score lines but neither final x nor setback times,
and no `report.json` is committed for them. **This is checkability, not
accuracy:** an independent gate run of row 3's script reproduced it within
the documented variance (stalled; setbacks 3.2 / 22.4 / 27.1 s; 1 life spent
at 15.9 s; final x 59.649; protoScore −16.5 real). Committing
`scored-run-nojump/report.json`, or adding final x + setback times to those
three summaries, makes the whole table checkable — worth doing before CP4 is
judged, since evidence honesty is this packet's whole point. Non-blocking.

## I-009 | bug | S3 | repro: serve task/T-008 66b13d0 and open `index.html?g2=1` — HUD reads "0/2 TURNS" before the flip, "1/2 TURNS" after, and the clear overlay reads "1 of 2 transformations", for a fixture with one event | evidence: reports/tasks/T-008/playtest.md; .claude/worktrees/T-008/tools/playtest/runs/g2-neck-flip/{02-plate-armed-ajar,07-interior-exits,09-neck-clear}.png

Found while gating T-008 (PASS). `src/ui/hud.js:114` and `src/ui/overlay.js:77`
hardcode the v1 demo's two-turn copy, so the G2 fixture — which authors a single
`neck-plate-flip` event — advertises a second transformation that does not exist.
Visible in every committed and freshly captured G2 frame, including the BREACH
CLEAR overlay. Cosmetic only: no sim, gating or telemetry effect, and the ritual
itself completes correctly. The builder flagged it in
`artifacts/g2-neck-flip/README.md` and the reviewer carried it as a MINOR, but it
was never filed, so filing it here. `ACTIVE_FIXTURE.events.length` is the fix once
both files are out from under the in-flight lanes that own them (T-011 juice,
T-013 shell).

## I-010 | art | S3 | repro: any `?g2=1` run with enemies live at task/T-008 66b13d0 — compare `.claude/worktrees/T-008/tools/playtest/runs/g2-neck-flip/00-approach-ribline.png` (fresh capture) against `artifacts/g2-neck-flip/00-approach-ribline.png` (committed) at the same beat | evidence: reports/tasks/T-008/playtest.md

Pre-existing render nit, not T-008's doing (both lines predate this branch), found
while judging G2 frames at the default FAR view. A hostile in its hit-flash renders
with `glow = 0xffffff` (`src/render/hostiles.js:197`), which at FAR erases the
wasp's green-diamond silhouette entirely — it becomes a featureless ~13px white
quad. Independently, RIG blinks during iframes (`src/render/player.js:55`). In the
fresh `00` frame the two coincide, so the frame contains a white square and no
visible player, while the committed capture of the same beat shows RIG plus the
white quad at his muzzle. Cost real time in this gate before it was identified as
a shot wasp rather than a player-render bug, and it will mislead any future
screenshot gate the same way. Suggest the flash tint the existing silhouette
rather than replace it, and fold into T-003's FAR-tells readability pass (same
scope as I-003).

## I-011 | bug | S3 | repro: any policy-mode script that ends at `--max-runtime-ms` with a `tap` in flight, e.g. `node run.mjs runs/gate-T-008-scripts/g2-pressure-PREFIX.json --deterministic --max-runtime-ms 22000 --base-url <pinned tree>` — `report.json` `pageErrors` gains `key up failed for Space: keyboard.up: Target page, context or browser has been closed` | evidence: tools/playtest/runs/gate-T-008-g2press-PREFIX-{2,3}/report.json; reports/tasks/T-008/playtest.md

Harness-side only, zero game impact. A policy `tap`'s release is a fire-and-forget
timer by design (documented in `tools/playtest/README.md`'s policy section), so a
tap whose `holdMs` outlives context teardown records its failed keyup in
`pageErrors` — the same channel a gate reads to decide whether the *game* threw.
Both affected runs still exited 0 and their metrics are sound; the entry is noise,
but it is noise in an error channel, which is exactly where noise is expensive.
Fix is to swallow (or bucket separately) keyboard failures raised after teardown
has begun, so `pageErrors` stays a game-error channel. Filed rather than fixed
here: the playtester lane does not edit harness `lib/`.

## I-012 | fairness | S3 | repro: `node run.mjs <worktree>/tools/playtest/scripts/g2-neck-flip-pressure.json --deterministic --max-runtime-ms 22000 --base-url <pinned task/T-008 66b13d0>` — hp 3→2 lands at x ≈ 112 and hp 2→1 at x = 129.65 in all 3 runs; the pre-fix control's every fall traces back to the same first hit at x ≈ 102 | evidence: tools/playtest/runs/gate-T-008-g2press-{1,2,3}/report.json; tools/playtest/runs/gate-T-008-g2press-PREFIX-{2,3}/report.json; reports/tasks/T-008/playtest.md

Test-coverage gap, filed so triage can decide, **not** a fairness verdict — that is
the operator's call and is queued as a packet question. The reviewer raised this at
`tools/pathcheck.mjs:2581`: the new authored-pressure section asserts spawn
ordering, seam-clear distance, apex-lane proximity and hound patrol containment,
but nothing binds ambient spawn placement to the *mandatory* gaps. This gate
measured the relation the assertion is missing: the x106 lane-4.2 wasp's dive
envelope reaches back across the required 100–102 teach gap, the hit there is
deterministic enough to land within 13 ms across runs, and in the pre-fix control
it is the event that starts every fall (five deaths at x = 101.65). The fixture is
crossable and the shipped script clears it 3/3 with a life in hand, so nothing is
broken today — but a future spawn-table retune could move that contest without any
assertion noticing. Suggest pairing each mandatory gap with the wasps whose
authored lane can reach its crossing arc.

## I-013 | bug | S3 | repro: `node run.mjs <worktree>/tools/playtest/scripts/ribrun-climb.json --deterministic --max-runtime-ms 15000 --base-url <pinned task/T-006 470bc14>` — the summary reports "Route coverage: [mid-catwalk, upper-chimney, wall-launch, recovery-scramble]" and "Dare pocket: entered=true" for a fixture that contains none of them | evidence: tools/playtest/runs/gate-T-006-ribrun/summary.md; tools/playtest/runs/gate-T-006-ribrun-policyonly/summary.md; reports/tasks/T-006/playtest.md

Harness metric contamination under any fixture *overlay*, surfaced by
`?ribrun=1` and documented honestly by the T-006 builder in
`tools/playtest/README.md` (limitation 3's new second caveat) — filed here so
it is tracked rather than only described. `lib/fixture.mjs` re-exports the
lattice `TRAVERSAL_FIXTURE` unconditionally, so route coverage, route
inference and the dare-pocket columns are computed against connectors the
served build replaced: a rib run that climbs one straight ribline is credited
with four lattice routes and a dare-pocket entry, purely because its x/y trace
passes through the coordinate ranges those features used to occupy. Everything
derived from the run itself (outcome, attempts, falls, hp, `airMs`, `stallMs`,
vertical range, `minEdgeMargin`, input density) is unaffected and was what this
gate judged on. Fix is to teach `lib/fixture.mjs` to resolve the same overlay
the game resolves from the URL; scope will grow as more overlays land (T-008's
`?g2=1` has the same shape). Filed rather than fixed here: the playtester lane
does not edit harness `lib/`.

## I-014 | bug | S3 | repro: `node tools/assets/check.mjs --root <tree whose src/ file contains `import {\n x,\n} from '../assets/generated/foo.png';`>` — exits **0**, PASS, and lists the specifier line under "game references to assets/ (runtime, not imports)" | evidence: reports/tasks/T-017/playtest.md; tools/assets/README.md §"Limitation of the import scan, measured"

Found while gating T-017 (harness nit-batch, PASS): `checkGameIndependence`
only detects a static import when the module specifier sits on the *same line*
as the `import` keyword. A specifier pushed onto a later line evades the gate
completely — on a throwaway fixture whose only asset reference is that import,
`check.mjs` exits 0 and reports the import as a *runtime* reference, so the
"the game must boot with every asset file missing" invariant would pass while
being violated. Reproduced identically on `task/T-017 0059363` and on `main
59a6501`: **pre-existing, not a T-017 regression** — T-017 documented the gap
honestly in `tools/assets/README.md` and its commit message asked for triage,
which this files. Nothing in `src/` writes that shape today (every import in
the tree is single-line), so the exposure is future-shaped, not current. Fix is
deliberately non-obvious and worth a moment's thought rather than a quick
regex widen: the README's own note explains that a naive newline-crossing
pattern can swallow a whole file between an `import` and an unrelated
`'assets/…'` string literal and start failing legal runtime code. A bounded
lookahead (specifier within the next N lines of an `import` with no
intervening `;`) or a tiny statement-level scan are the sane options.

## I-015 | docs | S3 | repro: read `tools/playtest/palette-capture.mjs:312-341` (verification) against `:440-441` (the `shot()` closure) at `task/T-010 67314a6`, or run `node tools/playtest/palette-capture.mjs polyp-cycle` on a tree where the iris never verifies — `artifacts/palette-v1/polyp-{tell,beam}--<pal>.png` are already overwritten when it throws | evidence: reports/tasks/T-010/playtest.md; reports/tasks/T-010/review.md

Found while gating T-010 (palette pass, PASS): the rig's own prose is one
notch stronger than its code. `palette-capture.mjs`'s header (lines 22-25) and
`tools/playtest/README.md` (the `palette-capture.mjs` entry) both say a frame
that does not carry the warm blink or the live beam "is retried, and the rig
throws rather than write evidence that does not show what its name claims."
The `shot()` closure writes each screenshot **straight to its final artifact
path** and `captureIrisCycle` verifies afterwards, so an unverified frame is
written first and merely superseded on a retry — and on total failure the rig
throws loudly with the last unverified frames still on disk (the pair PNG is
not composed, which is the only on-disk tell). **The committed evidence is
unaffected**: this gate re-derived the packet's own recomputable claim from
the committed stills (beam minus tell = 2497 px concept / 2650 px classic,
exactly as stated, 0 in the tell frames), so what shipped did verify. This is
about the next run, and about a lane whose two previous cycles failed on
exactly this class of gap between text and artifact. Cheap fix either way:
screenshot to a buffer or a `.pending` path and rename on verification, or
reword both places to "throws rather than *keep*". Also raised as MINOR in
`reports/tasks/T-010/review.md`; filed here so it survives the merge.

## I-016 | docs | S3 | repro: read `src/render/juice.js:27`, `src/mode.js:110` and `docs/DESIGN.md:461` at `task/T-011 14ade6b`, against the corrected wording in `README.md:36` | evidence: reports/tasks/T-011/playtest.md; reports/tasks/T-011/review.md

Three stale doc strings found while gating T-011 (juice, PASS), all still in
the tree at the branch head and all already raised as MINOR in T-011's
review — filed here so they survive the merge. (1) `src/render/juice.js:27`
still says colours are "role names resolved by fx.js (optional lazy palette
import)"; the lazy `import('./palette.js')` is exactly what the fix commit
deleted, so the next agent goes looking for an import that must not come
back. (2) `src/mode.js:110` and (3) `docs/DESIGN.md:461` both promise
`?juice=0` gives a "byte-identical pre-juice build", where `README.md:36` was
corrected to "simulation-identical" — the accurate claim, since `samplePerf`
still samples every frame and `telemetry()` still carries the added
`juice`/`perf` keys under the flag. This gate's A/B supports the README's
wording and not the stronger one: `juice=0` matched pre-juice `main` on
attempts/falls/hits, `minEdgeMargin` within 0.03 tiles and final x within
0.02 tiles, which is simulation-identical evidence, not byte-identity. No
runtime impact; prefer the README's phrasing in all three places.

## I-017 | docs | S3 | repro: `cd <task/T-014 9dd13b1>/tools/playtest && node run.mjs scripts/mortar-zone-deny.json --deterministic --max-runtime-ms 17000 --base-url <pinned task/T-014 9dd13b1>` — the bot pauses ≈150 ms at the lip (x 57.60 → 57.64, vx 2.9 → 0.0 across two samples) and crosses the marked strip during `fuse`/`burst`, clearing the slab at x = 62.21, not inside `cool` | evidence: tools/playtest/runs/gate-T-014-mortar-solo/report.json; reports/tasks/T-014/playtest.md

Found while gating T-014 (spore mortar, PASS — the run itself is fine:
completed, 1 attempt, 0 falls, hp 3/3, full `aim → lob → fuse → burst → cool`
cycle). The committed script's own `description` field states its load-bearing
beat as measured fact — "Measured 3/3 on this tree: … one full lob -> fuse ->
burst cycle observed with the bot held at the lip through it and crossing the
strip inside the reload window" — and then lists "Regression signals", which
invites the next agent to read that beat as a contract. It is not one: a fresh
deterministic run on the same tree took the *other* branch of the same policy
(arrived late in the cycle, barely waited, crossed while the mark was still
lit) and still passed every stated regression signal. The sibling evidence
README already hedges this correctly ("Arrival timing is not identical run to
run … a bot that arrives late in a cycle barely waits at all"), and the
harness README's honesty items 2/4/8 explain why. Fix is wording only: move
the flat 3/3 claim into the same hedge the README uses, and keep the
regression signals (stall short of the rejoin, hp < 3, no mortar state change)
as the actual contract, since those are what held. No runtime impact, no
change to the policy rules.

## I-018 | bug | S3 | repro: `cd tools/playtest && node run.mjs <any script whose FIRST event is at t>0> --deterministic --max-runtime-ms 9000 --url "http://127.0.0.1:<pinned task/T-013 d3c8d28>/index.html?slice=traversal&shell=title"` — zero events dispatch, `meta.dispatchJitterMsAvg: null`, no `actualDispatchMs` on any event record, every sample `state: "MENU"` with `gameMs: 0`, outcome `not-completed`, exit 0 | evidence: tools/playtest/runs/gate-T-013-title-det-probe/report.json; reports/tasks/T-013/playtest.md

Found while gating T-013 (game shell, PASS — the shell itself is clean: no
committed script's input is eaten, first-input latency and F7 retry recovery
are unchanged against a merge-base control). New dead state for
`--deterministic`: the mode dispatches an event at the first tick where
`sample.gameMs >= t`, and the shell's `MENU` state holds a built-but-frozen
run, so `gameMs` stays at 0 until a key starts the run — but the key that
would start it is itself gated on that clock. A script whose first event is at
`t = 0` fires on the first tick and everything proceeds normally (proved:
`mid-route` completes from the title screen, `runs/gate-T-013-mid-fromtitle`),
so this only bites a script with a non-zero first event. The harness README
already documents the *benign* half of this behaviour ("an event scheduled
during a pause/retry freeze correctly waits for gameplay to resume"); MENU is
the case where waiting never ends. S3, not S2: `?shell=title` is a
capture-only flag and every committed script autostarts under `?testapi=1`, so
nothing shipped can reach it — but the failure is quiet (exit 0, plausible-
looking `not-completed`) and would read as a game bug to the next agent who
forces the title for a screenshot. Cheapest fixes, for triage: treat a
`MENU`-state sample as "clock not started" and dispatch the pending head event
by wall clock, or note the constraint in the harness README's deterministic
section next to the pause/retry paragraph it already has.

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
