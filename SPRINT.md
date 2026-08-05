# Sprint — wave 4: delivery push

Queue for the orchestrated push toward the **delivery target** below.
Governed by `CLAUDE.md`'s loop protocol; mission mandate in
`docs/decisions.md` entry 8 (autonomous merges, asset lane open, loop until
delivered); prior verdicts in entries 1–7 are law. Schema at the bottom.

## Delivery target (definition of "delivered")

Rewritten 2026-08-02 (T-028) against `docs/decisions.md` entries 9–13, all of
which postdate the previous version. Two rules govern every line below:

- **Entry 10's acceptance rule.** A box names what it is measured in and the
  test that would falsify it. A box that states a *feeling* is not a box: it
  is a question in the "Operator checkpoint queue" below. The moves this
  rewrite made are listed at the end of this section.
- **Evidence honesty.** A number appears here only if a **committed** artifact
  carries it, cited by path. Where the artifact is gitignored or missing, the
  text says so instead of quoting a number.

**The target:** the default six-face run — `http://127.0.0.1:8741/index.html`,
no flags — start → summit → victory, playable end to end, with:

1. **Every DESIGN enemy role present in the DEFAULT RUN, taught then combined.**
   In the run today: wasp, carrier, hound. **Not** in the run: polyp (T-004)
   and mortar (T-014) exist only as `?slice=traversal&polyp=|mortar=` teach
   stages — `src/mode.js` resolves both params to `null` unless
   `IS_TRAVERSAL_SLICE`, so the URL above fields neither.
   *Falsified by:* a `--deterministic` no-flag run whose trace `hostiles[]`
   never carries a polyp or mortar row; or a role whose first appearance in the
   run is a combination, with no solo stage before it.
   *Rider (entry 13):* a teach stage judged only at `?slice=traversal` is not
   evidence for the run — see box 12.

2. **Transformations obey the static-anatomy rule** (entry 3): the anatomy is
   monumental and static during a transition; only doors, access plates, vent
   covers, shutters, traps and Crown mechanisms move.
   *Falsified by:* one frame in a committed capture sequence where body
   geometry arrives, slams, or articulates into place during a transition.
   *Committed sequences today:* `artifacts/cp3-transform-v3/` (transform
   slice); `artifacts/t009-lattice/merged/06-ab-gate1-default.png` vs
   `07-ab-gate1-zip.png` (corner reveal, the same simulated instant in both
   modes).
   *Not a box:* whether the reveal *reads* as ascent around a static limb —
   queued (CP3 re-judgment, and the default corner reveal has never been
   operator-judged at all).

3. **The concept-art palette applied through the token layer** (deep teal /
   rust-orange / acid-green / hot-magenta / warm-white), fog-matched.
   *Falsified by:* a raw colour literal in a tokenized render file — pathcheck
   already rejects these ("palette: no raw color literals … in tokenized render
   files" — search that string in `tools/pathcheck.mjs`) — or a render file
   still reading `CONFIG.palette.*` greybox tokens where `src/render/palette.js` authors a
   CONCEPT token. `src/render/hostiles.js` does today (I-004; open as T-030).
   *Not a box:* whether tells and glyphs *read* at the shipped FAR view. The
   measurement exists — a 0.55-tile capsule glyph renders 9.6 px tall beside a
   29.6 px RIG at the shipped FAR view
   (`tools/assets/reports/demo/capsule-letter-h/viewer-far.png`, measured and
   independently re-derived in `reports/tasks/T-015/playtest.md` and
   `review.md`) — and the verdict is queued ("Glyph scale at FAR").

4. **Juice and audio present and provable, not merely claimed.** Hit-stop,
   shake, flashes, particles; WebAudio synth SFX plus layered ambience.
   *Falsified by:* an effect named here that a `?juice=0` A/B cannot show a
   difference for; or an audio debug surface that is unreachable on the shipped
   URL (`audioSnapshot()` is exported by `src/ui/audio.js` and imported by
   nothing today — I-005, open as T-029).
   *Not a box:* "restrained per DESIGN" — restraint is a feel verdict, queued.

5. **A game shell: start screen, pause/options, death/restart flow, run stats.**
   *Falsified by:* a scripted session that boots `?shell=title`, starts, pauses,
   dies, restarts and reads run stats, and cannot complete that sequence.
   *Known harness hole:* a `--deterministic` script whose first event is at
   t > 0 against `?shell=title` dispatches **zero** events and still exits 0
   (I-018, open as T-027). Until that is fixed, a green run of that shape is
   not evidence for this box.

6. **Frame budget and error budget.** 60 fps with 200+ projectiles; no console
   or page errors; `index.html?selftest=1` PASS; `node tools/pathcheck.mjs`
   exit 0; the smoke scripts (`tools/playtest/scripts/mid-route.json`,
   `transform-slice.json`, `--deterministic`) both `completed`.
   *Falsified by:* a `?testapi=1` sampled run at a saturated projectile pool
   whose frame samples fall below DESIGN's 60 fps target (`docs/DESIGN.md`
   § "Technical acceptance"), or any run reporting a console error, a page
   error, or a `bootError`.

7. **Boot-to-victory — OPERATOR-VERIFIED ONLY. No bot has ever done it.**
   The evidence, cited rather than implied: 13 policy variants (plus a latency
   control) over **49 deterministic runs** all wall at wave **gate 2** — scroll
   **140 of 415**, ~50 s, three lives spent. Gate 1 was cleared **45 of 49**
   times; gate 2 **once in 41**, and that one run reached scroll 165 at
   **64.4 s** before dying the same way; **nothing in the 49 reached gate 3**
   (`docs/playtests/2026-08-victory-box.md` § 1; per-run table
   `tools/playtest/reports/t019/all-runs.md`). Nothing was softened to get those
   runs: that lane's `git diff main...HEAD -- src/` is empty, and pathcheck now
   asserts the six-face policies carry no absolute position, scroll distance or
   clock time, so "the bot won" can never quietly mean "the script knew where to
   jump".
   *Falsified by:* a delivery report that cites a bot run as evidence of
   victory, or quotes a boot-to-victory duration with no operator run behind it.
   *On the duration:* "roughly four-to-five minutes" is DESIGN's **authored
   target** (`docs/DESIGN.md` § "Technical acceptance"), not a measurement — no
   run in this repo has reached VICTORY, so no measured boot-to-victory time
   exists to quote.

8. **Split decisions at speed, at density** (entries 10 and 11): forks the
   player reads and commits to at speed, *frequently* — "not one wager per
   face". The rewarding branch climbs, is more exposed, and rejoins ahead; the
   wrong branch dead-ends and costs real time under pressure.
   *Currency:* time against the pursuing edge plus exposure — entry 12 is
   explicit that the price is PRESSURE, never reach or height (entry 9 closed
   the height arms race).
   *Falsified by:* a policy that never leaves the main line collecting the
   branch reward anyway (that is exactly how the T-021 build failed its gate —
   I-031); or a dead end that is not legible as a risk *before* commitment
   (entry 11's fairness rider), which a FAR capture has to show.
   *Status:* the shape of this box follows the operator's **T-021** call — the
   three options are in the T-021 entry below; it is `blocked`, not dropped.

9. **Climb is the dominant motion** (entry 10): "a face that reads as a flat
   corridor is a defect even if its route count is nominally in range."
   *Falsified by:* a face whose authored routes gain no net altitude across the
   face, computed from the shipped lattice.
   *Gap, stated plainly:* that assertion **does not exist yet**. Pathcheck
   asserts per-face route *density* ("no face window reads fewer than N routes")
   and per-face spawn density escalation ("density escalates: face 6 > face 1"),
   neither of which is climb — both searchable in `tools/pathcheck.mjs`. This
   box is un-gated until the assertion is written.

10. **Pace escalates at the player's momentum, not on a timer** (entry 11).
    Shipped as `?momentum=1` (T-022), off by default, unjudged.
    *Currency:* banked daylight (where RIG rides between the damage plane and
    the right clamp) plus a decaying kill streak.
    *Falsified by:* the code-stated gates the packet scripts already carry —
    drive above 0.30 (`pursuitSpeed` > 4.82 t/s, ×1.12) for a player who banked
    nothing; drive above `hitDrive` 0.35 on the frame a hit lands, or rising
    again inside `hitMercyMs` 1500; a trace not returning to exactly 4.300
    after a lost life (`src/config.js` § `momentum`).
    *Measured separation, committed:* `reports/tasks/T-022/playtest.md` § 4 —
    two strong runs spending 60.8 % / 80.2 % of PLAYING samples above the
    shipped pace against two weak runs at 0.7 % / 11.6 %, with the weak policy
    never crossing ×1.12. Two runs per side is a sample, not a baseline (§ 10,
    I-029).
    *Not a box:* whether it ships ON in the delivered run — queued with the
    T-022 packet.

11. **Nothing in the delivered run is priced in reach or height** (entries 9
    and 12). The pocket capsule is a free plain pickup; the fight is what makes
    taking it a decision.
    *Falsified by:* any shipped comment, doc, assertion or operator packet
    describing a pickup as a dare, a wager or a measured retreat (the sweep is
    `dare|wager|gamble|retreat|measured` over the diff — T-009's gate ran
    exactly that, `reports/tasks/T-009/playtest.md` § 1), or by any assertion
    whose subject is reward-out-of-reach. **Excepted:** the traversal slice's
    own retained wager strings, which are `ACTIVE_SLICE`-gated and which entry
    10 deliberately preserves along with the dead-end form there.

12. **Every delivery claim that turns on difficulty, or on a cost being felt,
    is evidenced in the SIX-FACE RUN** (entry 13: `?slice=traversal` is too easy
    to judge difficulty in).
    *Falsified by:* a delivery claim whose only evidence URL contains
    `slice=traversal`. The slice stays valid evidence for "does this behave" —
    a movement verb's read, one enemy's tell — never for "does this cost
    enough".

13. **An operator checkpoint packet for every feel question raised en route**
    (entry 8: the operator is the only fun oracle, and work never blocks on a
    packet).
    *Falsified by:* a merged task whose report names an open feel question that
    has no entry in the checkpoint queue below carrying an exact URL and its
    questions.

**What this rewrite moved out, and why.** Entry 10 forbids a box that states a
feeling, so two came out of the old target and are now queued as questions:
"restrained per DESIGN" (box 4) and "FAR-readable tells and glyphs" (box 3).
Three scope questions could not be answered here without inventing a verdict,
so they are queued rather than decided: whether slice-only teach stages satisfy
box 1; whether `?momentum=1` ships ON; and whether entry 11's boost work
(T-023, parked by the operator's own sequencing) is inside the delivery scope.

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

## T-003 | art | done | P1

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

## T-009 | feature | done | P1

goal: six-face integration — bring the judged grammar into the default run:
traversal-lattice route density (from the slice's learnings), hound-2.5
pressure placement, pace learnings from CP1, and the corner ritual rendered
as the G1 static-limb orbit. The entry-0a integration hold is released by
entry 8; post a checkpoint packet instead of blocking.
accept:
- [ ] default run's six faces gain lattice route choice (3–5 readable routes,
      with pockets) without breaking wave gates
      NOTE (decisions.md entry 9, 2026-08-01): the "measured retreat" half of
      this box is WITHDRAWN by operator verdict. The pocket capsule is a plain
      pickup, judged by whether it escalates the action — not a dare. Do not
      re-litigate; the dare concept is parked as T-021.
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
SCOPE SPLIT (integrator, 2026-08-01): stages 1-3 (lattice route density,
dare pockets, hound stations, static-anatomy corner reveal by default) are
this task's deliverable. The "full-run script completes start -> summit ->
victory" box moves to T-018 because the same six-face-full-run.json under the
same deterministic policy fails on BOTH trees — so the lattice is not what
stops the bot.

CORRECTION (integrator, after the T-009 playtest gate): the magnitude I first
recorded here was overclaimed from a single run per side. I measured branch
maxX 154.2 / scroll 140 vs main 89.2 / 75 and wrote "nearly twice as far"; the
gate re-ran it THREE times per side and got branch 89.25 / 89.25 / 110.65 and
main 89.25 / 89.25 / 89.25. My run was an outlier (the build agent reproduced
it once, which is why it went unchallenged). What survives, and is what the
split actually rests on: both trees fail, and main fails at the identical spot
three times out of three. The "~1.7x further" claim does not hold and must not
be repeated. Filed as I-020; the gate's runs are under
tools/playtest/runs/gate-T-009-fullrun-{branch,main}[-2,-3].

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

## T-018 | harness | done | P1

RESULT (2026-08-01): the lane answered **(a) a HARNESS limit**, with per-tick
evidence on both trees, and landed the grammar extension. `sample.hostiles`
was spawn-ordered with no geometry, so no policy could aim off the horizontal
— and three of wave 2's five authored slots (lanes 4.6/4.6/7.2) sit above the
highest LEVEL shot a player can produce (muzzle 1.05 + jump apex 2.72 = 3.77),
so the aimless bot could only damage them mid-dive. Measured: the gun pointed
at a hostile on 8.8% of gate-1 ticks and 12.0% of gate-2 ticks, where some
8-way direction would have on 26-36%. With relative-geometry clauses and a
terrain probe (harness-only, zero src/ changes), the same builds go 8 kills /
scroll 75 / dead in gate 1 -> 17 kills / scroll 140 on main, and 14 -> 22
kills / scroll 205 of 415 with gates 1-3 cleared on the lattice tree.
Equivalence proven by replaying 2321 committed ticks through both engines with
zero decision differences. The residual "a bot reaches VICTORY" box is split
to T-019.

goal: make "boot to victory" provable — the delivery target's last unproven
claim. T-009's six-face-full-run.json clears wave gate 1 and dies in gate 2 on
every tree tested, including main without the lattice. Decide, with evidence,
which of these it is and fix that:
(a) a HARNESS limit — the reflex-rule policy grammar cannot express the gate
    fight (no dive/lane predicate; holding "up" to aim overshoots at close
    range), so the bot cannot play a fight a human can. Fix by extending the
    policy grammar, not by making the game easier.
(b) a real DIFFICULTY problem — gate 2's wave load is beyond a fair player at
    that point in the run. That is a feel call: post an operator checkpoint
    packet, do NOT retune waves autonomously.
accept:
- [ ] a written finding naming (a) or (b) with runs on both trees as evidence
- [ ] if (a): the grammar extension lands, is documented in the playtest
      README, and the full run reaches VICTORY under --deterministic
- [ ] if (b): an operator packet with the exact URL, the wave-load numbers,
      and 3-5 questions; the delivery target's boot-to-victory box is then
      answered by an operator run, not a bot
- [ ] never weaken a wave gate or a movement constant to make the bot win
owner: gameplay-engineer
verify: node tools/pathcheck.mjs; six-face-full-run.json --deterministic against a pinned tree

## T-019 | harness | done | P2

goal: the last unproven delivery box — a bot run that reaches VICTORY. T-018
established the blocker was the policy grammar (not difficulty, not the
lattice) and extended it; the best run now clears wave gates 1-3 and ends at
scroll 205 of 415 with three lives spent at 76.9s. Close the remaining gap, or
establish with evidence that it cannot be closed by a reflex policy and the
box must be answered by an operator run instead.
accept:
- [ ] either the full run reaches VICTORY under --deterministic, or a written
      finding shows which specific beats defeat a reflex policy and why, with
      per-tick evidence of the same shape T-018 produced
- [ ] never weaken a wave gate, a movement constant, or any src/ file to make
      the bot win — the harness bends, the game does not
- [ ] if the answer is "a human must play it", say so plainly and post the
      operator packet; delivery then records that box as operator-verified
owner: gameplay-engineer
verify: node tools/pathcheck.mjs; six-face-aimed-run.json --deterministic against a pinned tree
blocked-by: T-018 merged (its grammar extension is the foundation)

## T-020 | investigation | done | P2

goal: triage I-021 — every six-face run, on pristine main and on the lattice
tree alike, spends its first life at ~3.0s falling into the same 3-tile gap at
x = 31.649: full hp, no hostile within 14 tiles, before any wave gate. It has
been silently costing a life in every measurement taken this sprint and was
invisible until T-018's terrain probe exposed it.
Answer one question with evidence: is that gap fair?
- if it is authored to be jumped and only the bot cannot see it, prove a
  player-reachable crossing exists (the frozen jump constants, from the deck,
  at scroll speed — RIG crosses ground at 4.3 t/s held-right, not runSpeed
  9.4, so a held jump travels ~3.0 tiles: a 3-tile gap is exactly marginal)
- if it is not reliably crossable at that point in the run, it is the very
  first thing the game teaches and it teaches a death. Fix it in the
  generator, or move it later, and say which
accept:
- [ ] a written finding with the arithmetic and a repro
- [ ] if the gap stays, a pathcheck assertion proves every generated face-1
      gap before the first gate is crossable from the deck at scroll speed
- [ ] if it moves, the generator change ships with that same assertion
- [ ] never widen the jump constants to make it fit (frozen, entry-asserted)
owner: lattice-designer
verify: node tools/pathcheck.mjs; a run that reaches the first gate without losing a life

## T-021 | feature | blocked | P1

goal: the SPLIT DECISION in the SIX-FACE RUN — decisions.md entries 10, 11, 12
and 13. A fork the player reads and commits to AT SPEED: the rewarding branch
climbs higher, is more exposed, and REJOINS ahead; the wrong branch DEAD-ENDS.
The stake is PRESSURE — hostiles on you while you are in it and the edge
closing — not distance or height (entry 12: three passes failed trying to
price a reward in reach; the fight was already charging the right price).
Build it in the six-face run, NOT the traversal slice: entry 13 rules the
slice too easy to judge difficulty in, and a pressure-priced mechanic cannot
be judged where there is no pressure. The lattice is uncontended now that
T-009 has merged.
accept:
- [ ] behind a flag in the six-face run, off by default
- [ ] rewarding branch climbs and REJOINS ahead: no reversal to collect, no
      free drop back to the main line
- [ ] wrong branch dead-ends, and what it costs is TIME UNDER PRESSURE —
      show the hostiles that charge it, not a distance
- [ ] FAIRNESS RIDER (entry 11): the dead end is legible as a risk BEFORE
      commitment; prove it in a FAR screenshot
- [ ] readable at speed at the FAR default: committing must not require a stop
- [ ] CURRENCY + FALSIFYING TEST (entry 10's rule): a policy that always takes
      the main line collects zero rewards; a policy that takes the reward
      branch still keeps its daylight margin; a policy that takes the dead end
      measurably loses it. Derive every cost from the shipped sim — inherit no
      speed number
- [ ] the existing shelf-and-chasm pocket STAYS (entry 12) — this is added
      decision density, not a replacement
- [ ] docs/proposals/ write-up specifying the mechanic
owner: lattice-designer
verify: node tools/pathcheck.mjs; named playtest scripts for all three lines (main / reward / dead end), --deterministic; screenshots at ?view=far

BLOCKED — ESCALATED TO THE OPERATOR (integrator, 2026-08-01). Not dispatching a
fourth attempt; this is a design contradiction, not an implementation defect.

The gate failed on the deciding test: **the reward is collectable from the main
line with one jump, on all four forks, with a default verb** — so the fork is
free. That is the same shape as I-019, third occurrence in this feature area,
and the lane found it honestly in its own report before the gate did.

WHY IT KEEPS HAPPENING — entries 9 and 11 pull against each other here:
- Entry 9 made the capsule a FREE plain pickup and closed the height arms race
  (a reward priced in reach cannot work against a frozen jump envelope).
- Entry 11 asks the fork's RIGHT branch to carry "challenge AND reward".
If the reward is a capsule, and capsules are free by law, the reward side of a
fork cannot carry a stake. Every attempt to give it one has re-run the I-019
failure.

WHAT DOES WORK, measured and green (pathcheck 1869/0, flag off hash-identical
to main, ?selftest=1 PASS in all three modes): the WRONG branch is a real
stake. The dead end costs 9.9 tiles of daylight (30.7 vs 40.6 at the same
finish line) and roughly doubles contact — 1211 near-hostile frames and 11 hits
against 639/6 on the main line — and it always escapes with margin, so it is
punishing without being a trap.

THE OPERATOR'S CALL, three options:
(a) ACCEPT IT. The decision is "do I risk the dead end?", and the reward is
    escalation fuel per entry 9. The stake lives entirely in the wrong branch —
    which is exactly what entry 11 said dead ends are for. Merge as built.
(b) PRICE THE REWARD IN SOMETHING THAT IS NOT HEIGHT. Entry 9 closed reach;
    entry 12 says the currency is pressure. A reward that costs exposure rather
    than altitude has never been tried.
(c) DROP THE REWARD from the fork. Make the fork purely a risk decision and
    leave capsules to the pockets.
The branch is preserved at task/T-021 (bb6bdd1) with all evidence and the
proposal at docs/proposals/2026-08-split-decision.md.


## T-022 | feature | done | P1

goal: pace escalation coupled to PLAYER MOMENTUM, per decisions.md entry 11 —
"pace should escalate across the faces, but at the player's momentum. A good
player escalates the action to intense levels of explosion and speed, a new
player is pushed along while they learn the mechanics."
The mechanism is available and now measured: runSpeed 9.4 t/s against a scroll
of ~4.3 t/s means moving forward BANKS daylight (T-020,
docs/playtests/2026-08-first-gap-triage.md). Banked daylight is the natural
currency — read well, bank distance, and the run answers with more pressure and
more payoff; lose the bank and it holds at a floor pace that carries you.
accept:
- [ ] escalation is EARNED from player state, not a per-face scripted ramp
- [ ] there is a FLOOR: a struggling player is still carried forward and can
      still finish; escalation may never become a death spiral
- [ ] there is a CEILING that leaves headroom for T-023's boosts rather than
      hard-coding the top of the curve
- [ ] frozen CONFIG movement/jump constants are NOT touched (entry 11 is
      explicit); the levers are pace, spawn cadence, scroll behaviour
- [ ] determinism holds: same inputs, same escalation, replayable
- [ ] behind a flag, off by default, until the operator judges it
- [ ] pathcheck assertions for the floor, the ceiling and the earn curve
- [ ] operator packet: a good-player run and a struggling-player run, same URL
owner: gameplay-engineer
verify: node tools/pathcheck.mjs; two named playtest scripts (strong vs weak policy) showing different escalation from the same build

## T-023 | feature | parked | P2

goal: boosts and scene transitions that rocket the player forward and upward,
with face transitions ratcheting and pumping — the "scaling a goliath" fantasy
made physical (decisions.md entry 11, operator: "eventually"). PARKED by the
operator's own sequencing; do not dispatch without a go-ahead. T-022 must leave
escalation headroom for this rather than hard-coding a ceiling.
owner: unassigned
verify: n/a until dispatched

<!-- ============ 2026-08-02 Inbox triage (integrator) ============
T-024..T-031 batch the open Inbox. Mapping, so no issue is silently dropped:
  T-024 new (this session's blank-page incident)  T-025 I-006, I-013, I-026
  T-026 I-014, I-024                              T-027 I-011, I-018, I-023, I-028
  T-028 I-007, I-008, I-020, I-029                T-029 I-005, I-009, I-030
  T-030 I-003, I-004, I-010 (+I-032 iff T-021 lives)
  T-031 I-001, I-002, I-015, I-016, I-017, I-021, I-027
Untriaged by design: I-012, I-022, I-025 (feel//fairness — operator queue),
I-019 + I-031 (closed / escalated with T-021).
Theme of the P1s: four separate gates report green while the thing they guard
is violated. That is the I-019/I-031 failure mode — an assertion whose subject
is the author's intent rather than what actually happened — so it leads.
============================================================== -->

## T-024 | harness | done | P1

goal: the dev server must never serve a stale module. On 2026-08-02 the game
rendered a blank page for the operator: Chrome had heuristically cached a
pre-T-022 `src/sim/pace.js` (1275 bytes) and ran it against post-T-022
`src/sim/level.js`, which imports `momentumScrollSpeed` from it — one failed
ESM import kills the whole graph. Nothing was wrong with the tree (pathcheck
1674/0, selftest 29/29 after a hard reload). `python3 -m http.server` sends no
`Cache-Control` at all, so this recurs for any operator whose browser warmed
its cache during a lane — i.e. every playtest session after an afternoon of
iteration.
accept:
- [ ] a committed no-cache dev server (`no-store` on every response, and
      conditional requests ignored so a warm cache cannot win a 304), serving
      the repo root on 8741, dual-stack so `localhost` and `127.0.0.1` both work
- [ ] `CLAUDE.md` § Commands, `README.md` and `tools/playtest/README.md` name
      the new command wherever they currently name `python3 -m http.server 8741`
- [ ] a `docs/ORCHESTRATION.md` § "Merge playbook" entry: the symptom is a
      blank `#232830` page with ONE console SyntaxError naming a missing
      export, and the first diagnostic is comparing `fetch(url)` against
      `fetch(url, {cache:'reload'})` — not editing the module
- [ ] zero effect on the shipped game: no file under `src/` changes
owner: gameplay-engineer
verify: node tools/pathcheck.mjs; serve, then confirm `curl -sI` carries no-store and `index.html?selftest=1` reports PASS

## T-025 | harness | done | P1

goal: three playtest report fields assert things the run did not do (I-006 S1,
I-013, I-026). A gate that reads them is not evidence. (a) `metrics.deaths` and
`outcome.attempts` both derive from `sliceStats.attempts`, which `src/main.js`
increments only inside `if (ACTIVE_FIXTURE)` — every default six-face report
says `deaths: 0`, verified against a trace that visibly spent two lives; the
`tools/playtest/README.md` note added by T-016 points readers at that broken
counter and is wrong on both halves. (b) `lib/fixture.mjs` re-exports the
lattice `TRAVERSAL_FIXTURE` unconditionally, so a `?ribrun=1` run that climbs
one straight ribline is credited with four lattice routes and a dare-pocket
entry it never had. (c) `?enemies=0` traces still carry 2-6 live hostiles.
accept:
- [ ] a default-run death count that matches a hand-verified trace, or an
      explicit "no death counter exists on default runs" that the README and
      every consumer agree on — do not leave a third wrong note
- [ ] fixture-derived columns are computed against the *served* fixture, or
      are omitted with a stated reason when the build replaced it; a rib run
      credits zero lattice routes and zero dare-pocket entries
- [ ] `?enemies=0` runs report an empty `hostiles[]`, or the flag's real
      meaning is documented at every place a reader would trust it
- [ ] each fix names the falsifying trace it was checked against, by path
- [ ] zero effect on the shipped game beyond the counter's own plumbing
owner: gameplay-engineer
verify: node tools/pathcheck.mjs; re-run gate-T-016-scored-baseline and a ?ribrun=1 script against a pinned tree and diff the corrected fields

## T-026 | harness | done | P1

goal: two static gates pass while the invariant they exist to protect is
violated (I-014, I-024). `checkGameIndependence` in `tools/assets/check.mjs`
only sees a static import when the specifier sits on the same line as the
`import` keyword — push it to the next line and `check.mjs` exits **0** and
files the import under "runtime references", so "the game must boot with every
file under `assets/` missing" would report green while broken. Separately,
pathcheck's fair-gap honesty guard asserts `runSingle > floorSingle` strictly,
which catches a probe started at `runSpeed` but not one that keeps the
scroll-speed start and loses the screen clamp — measured, that case balloons
the gap-29-31 floor window 0.74 → 4.12 tiles and still passes the guard.
accept:
- [ ] a multi-line `import {\n x,\n} from '../assets/x.png'` in a fixture tree
      makes `check.mjs` exit non-zero; the README's noted counter-example for a
      naive newline-crossing regex is handled, not re-introduced
- [ ] the fair-gap guard fails when the screen clamp is removed while the
      scroll-speed start is kept (build that negative control and show it red,
      then green with the pin restored)
- [ ] both fixes come with the negative control committed as a test, so the
      next editor cannot silently un-bind them
owner: gameplay-engineer
verify: node tools/pathcheck.mjs; node tools/assets/check.mjs --root <multiline-import fixture> (expect non-zero)

## T-027 | harness | done | P2

goal: four harness defects that waste cycles without lying outright (I-011,
I-018, I-023, I-028). (a) Any deterministic script whose first event is at t>0
against `?shell=title` dispatches **zero** events, samples `state: "MENU"`
forever and still exits 0 — a silent no-op run. (b) A policy run ending at
`--max-runtime-ms` with a tap in flight adds a `key up failed for Space` page
error, poisoning the pageErrors gate. (c) `compileCondition('x==3+1')` compiles
and evaluates false with no warning, so a typo'd clause silently never fires.
(d) In the 6-8 tile margin window the crush-plane `hold right` and the
personal-space `hold left` both fire, cancel, and leave RIG standing still in
the one window whose rule exists to make it run (3 of 777 ticks measured).
accept:
- [ ] a t>0 script against `?shell=title` either dispatches its events or exits
      non-zero with a named reason; never a green zero-event run
- [ ] the shutdown race no longer emits a page error on a normal timeout
- [ ] a condition that cannot mean what it says warns or fails to compile
- [ ] the personal-space guard is raised to `edgeMargin>8` (or equivalent) and
      the cancellation rate is re-measured on the same trace, before and after
owner: gameplay-engineer
verify: node tools/pathcheck.mjs; the four repro commands quoted in I-011/I-018/I-023/I-028

## T-028 | docs | done | P1

goal: the Delivery target at the top of this file predates decisions.md entries
10-13 and now understates what the operator has asked for — rewrite it against
the current verdicts. Fold in the evidence-honesty issues while in the same
files: quoted measurements that their own committed artifacts do not support
(I-007, I-008, I-020) and the T-022 packet scripts' "MEASURED, NOT
ASPIRATIONAL" bands that independent repeats landed outside of (I-029).
accept:
- [ ] every Delivery box names a currency and a falsifying test (entry 10); any
      box that states a feeling is moved to the operator checkpoint queue
- [ ] boot-to-victory is recorded as operator-verified-only, with the 49-run
      bot evidence cited rather than implied
- [ ] each corrected number in the proposals cites the artifact it was read
      from, by path; where the artifact is missing, say so instead of restating
- [ ] the T-022 script descriptions point at the structural gap they actually
      reproduce, not at sample percentages from two runs
- [ ] entry 13's rider is recorded where feel verdicts are stored: any older
      verdict that turned on difficulty predates the "too easy" ruling and is
      re-asked, not inherited
owner: gameplay-engineer
verify: node tools/pathcheck.mjs (docs-only lane, must stay green); every cited artifact path resolves

## T-029 | feature | done | P2

goal: three small runtime truth fixes whose owning files are finally out from
under the lanes that blocked them (I-005, I-009, I-030). `audioSnapshot()` is
exported from `src/ui/audio.js`, documents itself as a console debug surface,
and is imported by nothing — with no build step that makes it unreachable, so
T-012's gate had to infer layer counts by monkey-patching `AudioParam`.
`src/ui/hud.js:114` and `src/ui/overlay.js:77` hardcode the v1 demo's two-turn
copy, so the single-event G2 fixture advertises a transformation that does not
exist. And the earned momentum drive rides no telemetry channel — a reader
recovers it only by inverting `pursuitSpeed`, which stops being valid the
moment T-023's boosts push the same chokepoint.
accept:
- [ ] `audioSnapshot()` reachable from the console on the shipped URL
- [ ] turn counters read `ACTIVE_FIXTURE.events.length`; the G2 fixture reads
      1, and a fresh capture of the BREACH CLEAR overlay shows it
- [ ] `drive`/`peakDrive`/tier ride the frozen `testapi` channel so escalation
      stays distinguishable from a boost after T-023
- [ ] pathcheck assertions for any new pure logic; no movement constant moves
owner: gameplay-engineer
verify: node tools/pathcheck.mjs; index.html?selftest=1; a ?g2=1 capture of the overlay; a ?momentum=1 trace carrying drive

## T-030 | art | done | P2

goal: finish the palette pass's last file and the FAR readability notes it
left behind (I-004, I-003, I-010). `src/render/hostiles.js` still reads
`CONFIG.palette.wasp/carrier/hound/houndTell/houndCharge` — the muted grey-box
greens — instead of the acid CONCEPT tokens `palette.js` already authors and
pathcheck already asserts, so T-010's "one palette module, not scattered hex
literals" acceptance is one file short and the enemies never reach board 01/10
intensity. The lane fence that deferred it (T-004 in flight) is gone.
accept:
- [ ] hostiles read CONCEPT tokens; no raw hex literal survives in a tokenized
      render file (pathcheck already rejects these — keep it green)
- [ ] FAR side-by-sides before/after, judged against boards 01/10 and the
      visual invariants, not taste; threat still separates from teal/rust
- [ ] the polyp tell's first ~300ms carries a signal at FAR, or the finding is
      restated with evidence and handed to the operator as a feel call
- [ ] committed artifacts that no longer match a fresh capture are re-captured
      or removed; a stale artifact is worse than none
- [ ] I-032 (the fork's RISK is unmarked at FAR while its REWARD is loud) is
      in scope ONLY if T-021 survives the operator's decision — otherwise note
      it as moot and leave the geometry alone
owner: gameplay-engineer
verify: node tools/pathcheck.mjs; index.html?selftest=1; FAR captures at the shipped view

## T-031 | docs | done | P3

goal: the docs-truth backlog — seven places where a comment, README or design
line describes behavior the code does not have (I-001 stale sampler comment
about testapi not exposing hostiles; I-002 `check.mjs` printing static imports
under a "runtime, not imports" header on failing trees; I-015 palette-capture
overwriting committed artifacts before it throws; I-016 juice wording; I-017
the mortar zone-deny claim the trace contradicts; I-021 the legibility README
paragraph vs `SHARE = { glyph: 1, cue: 1, pose: 0.6 }`; I-027 spaced-run
numbers). None affect play; together they are how a future agent gets misled.
accept:
- [ ] each of the seven is either corrected against the code or closed with a
      one-line note saying why it was already right
- [ ] no fix invents a measurement — where a number is needed, it is read from
      a committed artifact and cited by path, or the claim is dropped
- [ ] palette-capture writes artifacts only after verification passes
owner: gameplay-engineer
verify: node tools/pathcheck.mjs; re-read each cited file:line against its issue

## T-032 | feature | done | P1

goal: a 9-year-old must never meet a blank screen. Today the operator's own
session rendered a black page with one console SyntaxError and no on-screen
explanation whatsoever (a stale cached module; fixed in T-024) — a player would
have had no idea the game had failed, or that reloading might help. Any boot
failure or unhandled runtime exception must surface a readable panel instead of
a void, and the game must survive the ordinary abuse of a kid: alt-tab, resize,
a backgrounded tab (Chrome suspends rAF entirely when hidden — this session
measured zero frames painted), rapid restart, key mashing.
accept:
- [ ] an uncaught error at boot renders a legible failure panel naming what
      broke and offering a reload — verified by deliberately breaking an import
      and loading the page, with a screenshot committed as evidence
- [ ] an uncaught error mid-run does not silently freeze the game: it either
      recovers or fails legibly; a frozen canvas with a live page is a defect
- [ ] backgrounding the tab for 60s and returning does not corrupt the run
      (no giant dt catch-up, no physics explosion) — assert the dt clamp
- [ ] resize during play, pause during a transition, and restart-spam do not
      throw; drive each headlessly and report console/page errors
- [ ] pathcheck assertions for any new pure logic; no movement constant moves
owner: gameplay-engineer
verify: node tools/pathcheck.mjs; index.html?selftest=1; a deliberately-broken-import boot capture; a headless abuse script

## T-033 | feature | parked | P3

goal: he will play across days, and there is NO persistence of any kind today
(zero localStorage in src/). Closing the tab loses everything. Give the run a
memory: progress survives a closed tab, and a game over does not erase the
session. This is the single biggest threat to "plays it a lot" — a kid who
loses everything at a wave gate does not come back.
accept:
- [ ] progress persists across a reload and a closed tab, and a corrupted or
      absent save NEVER blocks boot (fall back to a fresh run, silently)
- [ ] the save is versioned; an old/unknown schema is discarded safely rather
      than crashing — prove it by loading a deliberately-corrupt payload
- [ ] nothing in src/pure/ or src/sim/ touches storage (layer purity: that is
      a window API); the sim stays deterministic and unaware
- [ ] a visible way to start over, so he is never trapped in a bad save
- [ ] pathcheck assertions for the pure serialization logic
owner: gameplay-engineer
verify: node tools/pathcheck.mjs; index.html?selftest=1; reload/corrupt-save/fresh-boot headless checks

## T-034 | harness | parked | P3

goal: prepare a static-host bundle the operator can upload to itch.io himself.
The game has no build step and pulls three.js from a CDN import map, so it is
close to deployable already — but nothing has ever verified it runs from a
static host under a subpath, and ES modules cannot load from file:// at all
(double-clicking index.html fails today).
accept:
- [ ] a verified bundle: served from a static host under a SUBPATH (not just
      domain root), the game boots and ?selftest=1 passes — every path relative,
      no absolute-root assumptions
- [ ] a documented answer on the CDN: state plainly whether the game still
      boots if the CDN is slow or blocked, and if not, say so as a known risk
      rather than pretending — do NOT vendor three.js without an operator
      decision (no-runtime-deps and no-build-step are hard rules)
- [ ] the exact manual steps the OPERATOR performs to upload, written for
      someone who has not used itch.io. An agent must never create the account
      or enter credentials; the bundle and instructions are the deliverable
- [ ] zero effect on the shipped game's behavior
owner: gameplay-engineer
verify: node tools/pathcheck.mjs; serve the bundle under a subpath and confirm ?selftest=1 PASS

## T-035 | art | done | P1

goal: the measured answer to "I've seen a lot of greybox" — it is the VALUE
range, not the hue. Full evidence and legality review in
`docs/proposals/2026-08-look-direction.md` (31 captures in `artifacts/look-v1/`):
0.0% of playfield pixels exceed luminance 200 in all fifteen gameplay captures,
99% sit in a 45-70 window of 255, one flat token covers 29-34% of the screen,
and the sky is brighter than the ground so nothing reads as lit. T-010's concept
palette changed hue over byte-identical geometry, lights and materials (101 vs
100 draw calls) — it recolored the grey-box. Implement packet items S1 (bake a
value ladder into the existing instance colors) and S2 (fog-band retune), which
the packet ranks first and says everything downstream must be calibrated against.
accept:
- [ ] new THREE-free `src/pure/shade.js`: occlusion + top-face rake + seeded
      wear via `src/pure/rng.js` mulberry32 keyed on integer (s,y); a plan-level
      pass (`limbShadePlan(plan, cfg)`), never per-piece; no Math.random /
      Date.now / performance.now, and two calls with one seed return identical
      arrays
- [ ] >=20% of baked limb instances land below 0.55x their base token luminance
      AND per-material normalized luminance spread >= 0.45 — arithmetically
      impossible on current main, so this assertion must fail there
- [ ] the two checker token values still differ by >= today's |lum(cA)-lum(cB)|,
      AND the per-column top-row-vs-row-2 delta exceeds the checker delta (the
      checker's scroll-speed carrier job survives — pillar 1/5)
- [ ] the deck's top row is the highest-luminance instance in its column and
      higher than every limb material's brightest instance
- [ ] draw calls and instance counts unchanged from baseline (101 calls,
      13 InstancedMesh, 2969 instances)
- [ ] capture-side check is PAIRED-POPULATION: median luminance of play-plane
      pixels minus median of backdrop pixels must WIDEN. "share below L40 rises"
      is forbidden — it is satisfied by uniformly darkening the frame, which is
      the exact "dirty, not lit" failure this risks
- [ ] `CLASSIC.shade` is EXACT identity so `?palette=classic` stays a
      byte-faithful grey-box instrument for the unjudged Palette v1 A/B
- [ ] ships behind its own off-by-default flag: the palette toggle would
      otherwise move hue and value together and the ladder could not be judged
      independently
- [ ] operator checkpoint packet: exact URLs + 3-5 questions; never a
      self-declared aesthetic verdict
owner: gameplay-engineer
verify: node tools/pathcheck.mjs; index.html?selftest=1; paired-population capture comparison at the FAR default

## T-036 | assets | done | P2

goal: unblock the held asset batch by answering the question that holds it.
CLAUDE.md and the checkpoint queue both record that glyph work is frozen until
the operator picks a direction for FAR readability — measured, a 0.55-tile
capsule is 9.6px tall at the shipped FAR view, chamfers and rivets vanish, and
the letter survives only as a smudge
(`tools/assets/reports/demo/capsule-letter-h/viewer-far.png`). Generate real
candidates through the existing pipeline and prove each at the size it will
actually be on screen, so the operator decides from artifacts instead of prose.
The operator asked for asset generation to run in parallel so output is ready
when it is time; this is the version of that which is legal today.
accept:
- [ ] candidates for each named direction (scale the world-space glyph up; move
      the letter read to the HUD; a shape/silhouette code instead of a letter;
      any direction the artist can argue from boards 01/06/07), each rendered
      through `rasterize.mjs` and judged with `view.mjs` at true on-screen size
- [ ] `node tools/assets/check.mjs` green: manifest, palette roles, sizes
- [ ] `node tools/pathcheck.mjs` green, and the game still boots with every
      file under `assets/` deleted — the independence property is the whole
      reason this lane is safe to run in parallel
- [ ] ZERO game effect: no file under `src/` and no `index.html` change
- [ ] an operator packet: side-by-side crops at true FAR size, 3-5 questions,
      and an explicit statement of what each direction would COST to adopt
      (including whether it would need a runtime-loading decision)
owner: asset-artist
verify: node tools/assets/check.mjs; node tools/pathcheck.mjs; view.mjs crops at 0.55 tiles

## T-037 | harness | done | P1

goal: make concurrent lanes stop colliding. `tools/pathcheck.mjs` is a
9,230-line monolith that EVERY task appends assertions to, so with N lanes in
flight it is an N-way conflict by construction. It has already cost real time:
on 2026-08-02 the T-025/T-027 merge conflicted there, and the integrator's
first two resolutions silently DROPPED assertions (1733, then 1739, when the
correct total was 1741) — caught only because the count failed to reconcile.
`docs/ORCHESTRATION.md` already records pathcheck splicing as a hard-won
conflict class. The fix is structural: lanes should add a NEW FILE, because new
files never conflict.
accept:
- [ ] pathcheck's assertions live in per-domain modules that a thin
      `tools/pathcheck.mjs` discovers and runs; a lane adding assertions
      creates or edits ONE domain file and never touches the runner
- [ ] EXACT PRESERVATION, proven mechanically: the set of assertion labels and
      the total count are identical before and after. Capture the full label
      list from `main` first, diff it against the refactored run, and commit
      both lists — a refactor of the gate that silently drops an assertion is
      the worst possible version of this project's signature failure
- [ ] the negative controls still bite: pick at least three assertions from
      different domains, break what each guards, and show the refactored gate
      go red, then restore
- [ ] exit code, output format, and the "reported, not asserted" notes behave
      identically; `tools/orch/merge-task.sh` and every gate agent that shells
      pathcheck keep working unchanged
- [ ] zero effect on the shipped game: no file under `src/` changes
- [ ] the migration is a re-runnable SCRIPT, not a hand edit, so it can be
      re-applied after in-flight lanes land rather than hand-merged
owner: gameplay-engineer
verify: node tools/pathcheck.mjs; label-set diff vs main; three negative controls

SEQUENCING: T-032 (+275 pathcheck lines) and T-035 are in flight and both touch
pathcheck. Do NOT fight them — build and prove the migration script, and let the
integrator run it after those merge.

## T-050 | art | done | P1
goal: fix I-037 (S1) — T-045's scale pass emits ZERO pieces on the shipped
default run. `limbBakePlan(CONFIG, groundH, {scale:true})` and `{scale:false}`
both return 829 pieces with no mark/backdrop kinds, so the rung ladders,
hatches, doors, gantry rail and graded backdrop tiers — the whole answer to
decisions entry 17 — are invisible in play. It merged and was reported to the
operator as live. Discriminator is `groundH`: a synthetic flat array yields
delta 804, the real generated level yields 0.
accept:
- [ ] root cause found and fixed, not papered over by loosening a guard
- [ ] a pathcheck assertion built from the REAL level's groundH that FAILS on
      current main — 2404 assertions were green while the feature emitted
      nothing, which is the intent-not-observable failure mode again
- [ ] before/after captures at the shipped FAR default
owner: gameplay-engineer
verify: node tools/pathcheck.mjs; browser plan probe showing a non-zero delta

<!-- ===== 2026-08-02 FEEL + RENDERER PUSH (lanes T-042..T-048). Dispatched
after the operator's "FIX the game" and "what is in the way" messages. Several
were never given SPRINT entries at dispatch time; recorded here for truth. ===== -->

## T-042 | audio | done | P1
goal: make the game SOUND like an action game — weight on impacts, a distinct
voice per weapon, an audible pressure curve, paired to T-041's directional
impact language. All synthesized at runtime; no audio files.
owner: gameplay-engineer

## T-043 | feature | done | P1
goal: the wasp was the only gating enemy with NO pre-commit telegraph (its own
render comment said so). Now holds its committed dart pose 220ms before
launching; squads stagger instead of all committing on one frame. MERGED at
1853/0.
owner: gameplay-engineer

## T-044 | lattice | done | P1
goal: setpiece moments — an ARRIVAL catwalk at the corner reveal and an ARENA
fighting ground at each wave gate, tiers escalating 13/15/19/21 columns.
REQUEST_CHANGES: measured 2/3 runs now clear wave gate 2 vs 0/3 on base, so the
terrain moved outcomes; per entry 19 it must report the DISTRIBUTION (best,
worst, spread) and route it to the operator, not claim difficulty is unchanged.
Also fix a new assertion's false "hostiles LIVE" framing.
owner: lattice-designer

## T-045 | art | done | P1
goal: SELL THE SCALE (entry 17) — graded backdrop anatomy tiers, atmospheric
depth that layers instead of collapsing, and human-scale reference objects
(rungs, hatches) so the eye can measure the creature against a known size.
owner: gameplay-engineer

## T-046 | assets | done | P1
goal: generate the visual asset set with codex now that entry 16 legalized
runtime assets — enemy sprites for the five roles (12-24px at the shipped FAR
view, judged at true on-screen size), backdrop/anatomy scale elements, hull and
deck surface textures.
owner: asset-artist

## T-047 | art | done | P1
goal: a real light rig — raking key, fill, rim — plus SHADOW MAPS on the play
band and ACESFilmic tone mapping (entry 18). The whole rig was two lights and
zero shadows, which is why nothing read as having form.
accept: 60fps at 200+ live projectiles measured before/after; readability
outranks beauty; do not re-darken the frame (entry 14).
owner: gameplay-engineer

## T-048 | art | done | P1
goal: EffectComposer with bloom, plus real material properties
(roughness/metalness, procedural maps) — entry 18. Every material in the game
was `{color, flatShading:true}` with every map slot unset, and a muzzle flash
was a bright quad rather than a light source.
accept: 60fps at 200+ live projectiles measured before/after; bloom must not
bury a threat; ship on by default with an escape hatch.
owner: gameplay-engineer

<!-- ===== 2026-08-02 LOOK PUSH. Operator: "quit doing things that don't make
sense... FIX the game, iterate faster and faster... i don't care about
reliability or resilience... deployment is so far away in my mind."
T-033 (save) and T-034 (deploy) parked as a result. T-038..T-041 implement the
look packet's ship-now items in parallel; specs are in
docs/proposals/2026-08-look-direction.md §3. Every one of them is judged by the
operator on his own machine, not by a machine gate. ===== -->

## T-038 | art | done | P1
goal: packet item S5 — warm-white seam pips and route-lip lights, the frame's
ONLY highlights. Measured: 0.0% of playfield pixels exceed luminance 200 in all
fifteen gameplay captures.
accept: highlights present at the shipped FAR view; share of pixels above L200
rises from a measured 0.0%; palette tokens only; draw-call delta reported.
owner: gameplay-engineer
verify: node tools/pathcheck.mjs; FAR captures before/after

## T-039 | art | done | P1
goal: packet item S6 — contact shadows as one instanced multiply-blended quad
pool, so actors sit ON the world. There is no shadow of any kind in the
renderer today. NOT a shadow map (that needs a decision entry, packet §4.1).
accept: +1 draw call, not per-object; 60fps with 200+ projectiles held; the
transform slice's 580-call path not multiplied.
owner: gameplay-engineer
verify: node tools/pathcheck.mjs; frame time under load; FAR captures

## T-040 | art | done | P1
goal: packet item S8 — RIG silhouette. He is 230 lit pixels of head sphere plus
three boxes, sharing a value family with his own bullets. Render-only: hitbox
and movement are frozen.
accept: reads at 3.75% screen height (true on-screen size, not zoomed); three
value zones; sim unchanged.
owner: gameplay-engineer
verify: node tools/pathcheck.mjs; FAR capture + 5x crop

## T-041 | art | done | P1
goal: packet item S10 — directional impact and travel language inside the
existing instanced pools, so hits read as hits. Zero new draw calls.
accept: pure/juice.js stays deterministic (seeded rng only); 60fps at 200+
projectiles measured, not assumed; no frozen constant moves.
owner: gameplay-engineer
verify: node tools/pathcheck.mjs; frame time at 256 projectiles before/after

<!-- ========== 2026-08-02 THE GREYBOX DIAGNOSIS (integrator) ==========

The operator asked, after two days of art tasks: "should we change the size or
camera or scale or something to improve the graphics, i looked at those and
we're not even remotely close to the concept art. what is in the way that is
making this so difficult?"

It is not the camera, the size, or the scale. Measured on main at 9cc80f7:

  1. `grep -rn "assets/generated" src/` returns NOTHING. Five finished
     backdrop plates, four hull tiles and nineteen sprites sit in
     assets/generated/ and no runtime file references any of them.
  2. The render layer builds 30 materials — 20 MeshBasicMaterial, 10
     MeshStandardMaterial — and not one carries an image map. The only `map:`
     in src/render/ is capsules.js:122-139, a CanvasTexture drawing a LETTER.
  3. scene.js:25 — `scene.background = new THREE.Color(PAL.bg)`. The sky, and
     the 60-80% of every concept board that is creature-body-in-haze, is one
     flat color.
  4. Geometry: 27 BoxGeometry, 5 Octahedron, 3 Sphere, 1 each Torus/Plane/
     Dodecahedron/Cone.

So the world is untextured boxes wearing flat palette colors. Every art task
since T-030 has improved LIGHT AND COLOR ON UNTEXTURED BOXES — palette, value
ladder (entry 14), fog retune, contact shadows, tone mapping, bloom (entry 18).
All of it good work; all of it against the ceiling of what flat shading can be.
That ceiling is what "greybox" MEANS. It is not reachable by more of the same.

WHY IT SAT THERE: "the game must boot with every file under assets/ missing"
was a hard rule until decisions entry 16 retired it on 2026-08-02. The asset
pipeline was built (T-036, T-046) and then forbidden from feeding the game.

THIRD FACTOR: tools/assets/gen.mjs asks codex for an SVG (gen.mjs:158-166
extracts `<svg>...</svg>` from the reply). Codex is a coding agent — images in,
code out — so an SVG ask yields hand-placed vector rectangles. Even our best
asset is flat clip-art rather than painted. Codex cannot emit a painting, but
it CAN write a program that renders one (noise, fbm, grunge, wear masks,
gradient ramps) — a far higher ceiling that keeps determinism, diffability and
palette-checkability. That is T-053.

T-051/T-052/T-053 are this diagnosis turned into work. T-051 and T-052 are
branched off task/T-049, not main, because T-049 carries the shared
src/render/preload.js texture gate; merge order is T-049 → T-051/T-052.
========== -->

## T-051 | art | done | P1
goal: a real backdrop behind the world. The five finished 1024x512 plates in
assets/generated/backdrops/ go onto parallaxing quads, replacing the flat
scene.background color as the thing filling 60-80% of the frame. Depth layering
and atmospheric perspective are the tools for SELLING SCALE, which entry 17
records as the headline art problem.
accept: consumes preload.js's shared gate (no second bespoke loader — I-039);
ships ON by default with a `?backdrop=flat` escape hatch (entry 16); a failed
plate degrades to today's flat color without wedging the game and without the
sim branching on it; far edge dissolves into the fog color, proven by capture;
static-anatomy (entry 3) and the frozen FAR camera (entries 7/17) untouched;
60fps at 200+ projectiles measured vsync-off, distribution not mean.
owner: gameplay-engineer (sonnet)
fences: src/render/backdrop.js (new), src/render/scene.js. NOT preload.js
(T-049), NOT materials.js/limb.js (T-052).
verify: node tools/pathcheck.mjs; new assertions proven by break/restore;
on-vs-flat captures at the same camera position and same deterministic moment

## T-052 | art | done | P1
goal: surface texture on the hull. The four finished tiles in
assets/generated/textures/ bind to the large surfaces as albedo (+roughness/
normal where they earn their cost) on the existing MeshStandardMaterials.
accept: tiling density judged from captures at TRUE on-screen size with RIG at
3-5% of screen height, not from arithmetic; texture reinforces limb.js:65-78's
warm-near/cool-far split rather than flattening it; palette conformance via
tools/assets/check.mjs (hull-panel-tile currently reads rust-brown); consumes
preload.js's shared gate; ON by default with a `?tex=flat` hatch; failed tile
degrades to today's flat material; 60fps at 200+ projectiles vsync-off, with
texture memory and draw calls before/after and T-047's renderer.info caveat
restated.
owner: gameplay-engineer (sonnet)
fences: src/render/materials.js, src/render/limb.js. NOT preload.js (T-049),
NOT backdrop.js/scene.js (T-051).
verify: node tools/pathcheck.mjs; new assertions proven by break/restore;
textured-vs-flat captures including one near and one far surface

## T-053 | assets | done | P1
goal: raise the generator's ceiling from vector clip-art to painted raster. Add
a raster path alongside the SVG one in which codex returns a self-contained
canvas renderer (value noise, fbm, directional grunge, edge wear, panel-gap AO,
dithered haze) instead of placed shapes; regenerate the four hull tiles and
five backdrops through it.
accept: zero effect on the shipped game, demonstrated not asserted; no new
runtime dependency (reuse the playtest harness's Chrome); every asset judged at
true on-screen size; generation reproducible with the seed and exact codex
invocation recorded in the manifest; check.mjs still PASSES — and if a check
written for flat vector fills cannot express a procedural asset (noise
interpolating BETWEEN two palette tokens is legal, a third hue is not), the
check is rewritten to state the property it actually cares about, loudly, never
loosened silently.
owner: asset-artist
fences: tools/assets/**, assets/generated/**, assets/manifest.json. Existing
filenames and canvas sizes stay stable — T-051 and T-052 are consuming them.
verify: node tools/pathcheck.mjs; node tools/assets/check.mjs; old-vs-new
captures at true size, each against the board it is meant to match

<!-- ========== 2026-08-02 OPERATOR GOAL CHANGE (supersedes parts of the
Delivery target that T-028 just rewrote; that rewrite's evidence-honesty fixes
stand, its audience assumption does not) ==========

VERBATIM: "give me son fox the game to play and enjoy. something a 9 year old
boy could play a lot and that he would enjoy."

Operator answers, same session:
  - Device:     laptop/desktop KEYBOARD. No touch, no gamepad work needed.
  - Delivery:   a PUBLIC URL (itch.io class). The operator must do the account
                and upload themselves; an agent may never create accounts or
                enter credentials. Prepare the bundle, not the upload.
  - Difficulty: "Not worried about it being beatable yet, just durable to play.
                he'll enjoy finding and reporting play problems."

WHAT THIS CHANGES. The target is no longer "prove the pillars to an expert."
It is "a 9-year-old can reach it, play it for a long time, and break it in
interesting ways without losing his progress." So:
  - DURABILITY outranks difficulty tuning. Do NOT tune the difficulty curve
    against this goal; he is fine with hard. He is not fine with broken.
  - Every recorded difficulty verdict was taken with an expert adult implicitly
    in the chair. They are not wrong, they answer a different question. Do not
    re-litigate them and do not "fix" difficulty for him unless he asks.
  - Boot-to-victory stays an open box but drops in priority. Beatability is
    explicitly not the bar right now.
  - A blank page, a softlock, a lost save, or a crash is now a P1 defect class.

THE PLAYER MODEL — get this right, the integrator got it wrong first and was
corrected. Operator: "he's 9, he plays a lot of games, I hope 'kidmash' isn't
setting a low bar."

He is NOT a button-masher. He is an experienced, systematic, curious player
with speedrunner instincts he could not yet name. Assume he will:
  - BACKTRACK — go left when the game wants right; re-enter a cleared area;
    approach a transition from the far side.
  - SEQUENCE-BREAK — reach the next area without clearing the wave gate; get
    on top of geometry never meant to be stood on.
  - PROBE BOUNDARIES deliberately — walk every wall, seam and edge to learn
    which are real; try to leave the level; stand where two fixtures meet.
  - EXPLOIT anything repeatable — a re-triggerable pickup, an infinite jump off
    one ledge, a safe spot nothing can reach — for twenty minutes straight.
  - PURSUE INCONSISTENCIES — he would notice the "1/1 TURNS" vs "TURNS 1 / 2"
    disagreement (I-033) and poke it until something gave.
  - STRESS THE LIFECYCLE INTENTIONALLY, not randomly — pause exactly during a
    transition, restart at the instant of death, resize mid-flip.

Consequence for testing: random input is a WEAK fuzzer for softlocks;
deliberate exploration is a strong one. Aim adversarial effort at where a
competent curious player gets permanently stuck or loses progress — especially
where backtracking or sequence-breaking leaves the sim in a state the author
never considered. "A player would never do that" is not a defence; assume he
would, on purpose, twice.
========================================================================== -->

## Operator checkpoint queue (feel verdicts — never block the loop on these)

### CP — the hull is darker than it was. Is that right? (T-052, merged 2026-08-02)

`http://127.0.0.1:8741/index.html` — compare against `?tex=flat`.

The hull now wears real surface texture for the first time. An albedo map
multiplies the material colour, so textured surfaces are inherently darker
than the flat palette token they replace. The lane normalized this at runtime
and cut the drop a long way, but a residual remains and it is **structural,
not a bug** — closing it entirely means erasing the detail that makes it a
texture at all.

Measured, same position (17m marker), mean display luminance:

  lower hull   this morning, untextured .......... 51.0
               T-052 first version ............... 19.5   (-56% vs its control)
               T-052 shipped ..................... 29.5   (-33% vs its control)
  deck              87.0 -> 82.5      sky   62.7 -> 61.8

The lane tried to close the residual further (TARGET_MEAN 210 -> 255) and got
only 39% -> 35% before it flattened out; it reported that and explicitly
declined to judge whether the result "reads", on the grounds that the word is
not a machine's to use. The playtest gate passed readability on its own
criteria. But value is a look decision and it is yours.

Questions:
  1. Does the sub-deck structure — panel lines, ladders, hatches — read well
     enough when you are falling through it, not just standing on it?
  2. Is the darker hull an improvement (mass, depth, a machine you are inside)
     or a loss (you want to see what you are climbing)?
  3. `?tex=flat` is the A/B. Which do you want as the default?
  4. If darker is right in principle but this is too far, say roughly how far
     back — the normalization target is one number and cheap to move.

### CP — backdrop depth: visible-but-seamed, or clean-but-buried? (T-051, 2026-08-02)

**This is a real tradeoff with no machine answer, and the lane surfaced it
honestly rather than picking for you.**

T-051 puts the five generated backdrop plates on twelve quads behind the
playfield, replacing the flat `scene.background` colour that previously filled
60-80% of the frame. First build authored the near tier at depth -13, which
landed almost exactly on top of an existing box tile's own depth (-14) — so
the plate's alpha silhouette abutted flat-shaded box geometry and produced a
hard diagonal seam against the sky. The lane traced it, moved the tiers to
-16/-21/-26 so the depth buffer occludes the plate wherever a box tile has
mass, and the seam is gone (I re-captured and confirmed).

The cost: **at the new depths the plates are substantially more occluded.** In
my capture the painted limb structure is visible in the upper right but much
of it now sits behind the existing box silhouettes. The lane also tried a
deeper placement that removes the seam outright and reports it "buries the
plates almost everywhere reachable" — tried, rejected, not shipped, which is
the right way to report a rejected option.

So there are three positions and the machine cannot choose among them:

  A  -13    plates most visible, hard seam where they meet box geometry
  B  -16/-21/-26  (SHIPPED) no seam, plates partly occluded
  C  deeper  no seam, plates mostly buried — lane recommends against

**Questions for the operator** (serve the lane and compare against
`?backdrop=flat`):
  1. At the shipped depths, is the painted anatomy doing enough work — does it
     read as the creature's body receding, or as texture you have to look for?
  2. Does the seam in option A actually bother you in motion? A still frame
     exaggerates a hard edge; the camera moves constantly.
  3. The pre-existing pale grey-teal silhouette boxes and the painted plates
     are two different visual languages sharing the upper band. Should the
     plates eventually REPLACE those boxes, or coexist with them?
  4. Entry 17 records that selling SCALE is the headline art problem. Does this
     make you feel smaller?

Exact URL comes with the lane's gate report. Not blocking: T-051 gates on
durability and perf, not on this.

**RIDER — `docs/decisions.md` entry 13 (2026-08-01): a verdict taken in
`?slice=traversal` is RE-ASKED, not inherited.** The operator played the slice
and reported it too easy, which makes it a bench that under-reads difficulty.
A verdict whose subject was difficulty, pressure, or a cost being felt does not
transfer to the six-face run and is re-asked there before it is treated as
settled; a verdict about whether something *behaves* — a movement verb's read,
one enemy's tell — still stands as taken. Which recorded verdicts this touches
is checkable rather than a guess, because every URL they name is slice-gated in
`src/mode.js` (`?pace=`, `?hound=`, `?polyp=`, `?mortar=`, `?flow=`, `?ribrun=`
all require `IS_TRAVERSAL_SLICE`):

- **Entries 0a, 2, 4 and 6** — "boring / the intensity is far off"; CP1's three
  paces all "directionally correct", none crowned; CP2's "those feel much
  better", iterate from hound 2.5; CP2.5's "enemies feel like they are coming
  for me" — were taken at slice URLs and all turned on intensity or pressure.
  **What each verdict says stands as recorded and is never re-litigated**; what
  is re-asked is whether it transfers to the six-face run.
- **Entry 12** (the pocket's price is pressure) is unaffected: the operator
  confirmed in the same session that "index.html was the one i played".
- Queued packets still benched in the slice — **FLOW** and **RIB RUN vs FLOW** —
  keep their behaviour questions as written; any answer of theirs about cost or
  difficulty needs the six-face run, or pressure added to the bench and said so.
  **Crouch vs aim-assist** is *not* slice-gated (`src/mode.js`'s
  `CROUCH_ENABLED` / `AIM_ASSIST_ENABLED` read the query on any URL), so it can
  be asked directly on `index.html?crouch=1` and `index.html?aim=assist`.
- The transform-slice packets (**CP3 re-judgment**, **G2 neck-plate flip**) ask
  about choreography reads, not difficulty; entry 13 names `?slice=traversal`
  specifically.

- **DELIVERY-TARGET FEEL QUESTIONS (T-028).** Moved here out of the delivery
  boxes, which may not state feelings (entry 10). Play
  `http://127.0.0.1:8741/index.html` (default, no flags), then
  `http://127.0.0.1:8741/index.html?juice=0` for the A/B.
  (1) The juice and audio pass is meant to be "restrained per DESIGN, but
  present" — at the shipped intensity, does it read as restrained, thin, or too
  loud? (`?juice=0` is the same run with hit-stop, shake, flashes, particles
  and the crush warning inert.)
  (2) At the shipped FAR view, do enemy tells and pickup glyphs carry, or is
  the answer the one already queued under "Glyph scale at FAR" (move the letter
  read to the HUD)?
  (3) Do the polyp and the mortar have to be IN the default run for delivery,
  or do their `?slice=traversal&polyp=1|mortar=1` teach stages satisfy the
  "every enemy role shipped" box? Today the run fields neither.
  (4) Should `?momentum=1` ship ON in the delivered run, or stay a flag? (The
  T-022 packet below is the A/B.)
  (5) Is T-023 — boosts and face transitions that rocket the player forward,
  parked by your own "eventually" — inside the delivery scope or after it?

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
- **THE DELIVERY BOX ITSELF (T-019) — the one thing a bot cannot supply.**
  One operator run of `http://127.0.0.1:8741/index.html` (default six-face run,
  no flags), played to VICTORY or to wherever it ends, noting **which gate and
  how many lives were left**. 49 deterministic bot runs across 13 policy
  variants all wall at wave gate 2 (scroll 140 of 415, ~50 s, three lives);
  exactly one cleared gate 2 and died heading for gate 3. The harness was
  extended twice and never weakened the game, so this box is answered by a
  human run or not at all. Evidence: `docs/playtests/2026-08-victory-box.md`,
  `tools/playtest/reports/t019/all-runs.md`.
  Questions that go with the run:
  (1) Gate 2 is fought as 7-9 bodies where the wave authors 5 — ambient spawns
  drift in before it arms (gate 1 peaks 5-7 against 4 authored). Does the
  second gate read as the intended step up from the first, or as a spike?
  (2) The whole route is 9 hits (3 hp x 3 lives, no heal) against ~50-55
  gating bodies. How many hits do gates 1 and 2 cost you — and does a six-gate
  run have the life budget it needs, or does it want a heal or a checkpoint?
  (3) A corner arena is ~14 tiles wide (crush plane behind, pivot clamp ahead)
  while 5-9 bodies dive into it at 10 tiles/s. Does that fight have room to
  move (pillar 2), or is it a box you win by trading hp?
  (4) The wasp still has no telegraph — cruise to dive on the same frame, from
  9 tiles while gated, every 1.1 s, while hound/polyp/mortar all have
  pathcheck-asserted tells. Fair at that range and cadence?
  (5) Do gates 3-6 assume a weapon? A carrier drop is the only upgrade path
  and it is incidental — the bot picked up LASER twice in 49 runs, by
  accident. **Note this now interacts with decisions entry 9:** the pocket
  pickups you made free are exactly a way for a player to CHOOSE to go get
  one, so the answer here may already be landing.
- **T-009 six-face integration — TWO packets, and the first has never been
  judged at all.**
  **(a) THE CORNER REVEAL, default vs `?zip=1`.** Serve the repo
  (`python3 -m http.server 8741`) and play `http://127.0.0.1:8741/index.html`
  against `http://127.0.0.1:8741/index.html?zip=1` back to back. The two are
  simulation-identical by construction (pathcheck runs both and compares whole
  traces); only the reveal differs, and the first corner arrives ~30-60 s in.
  If the gate fight is in the way, `artifacts/t009-lattice/merged/`
  `06-ab-gate1-default.png` vs `07-ab-gate1-zip.png` are the same simulated
  instant in both modes. **G1 has never been operator-judged and this pass
  makes it the DEFAULT** on the strength of entry 3 — that call is yours to
  confirm or reverse. Does the default read as RIG running around a
  monumental leg that was always there, or does the orbit read as the camera
  sliding past scenery? Under `?zip=1` the world past the corner is literal
  void and the catwalks float; under the default there is a joint column,
  armour under the deck, and the next facet already in the haze — is that
  added mass an improvement in READABILITY as well as fiction, or does the
  body behind the play plane compete with the enemies you have to track?
  **(b) THE POCKET PICKUP under entry 9** (`artifacts/t009-lattice/entry9/`):
  (1) when you take a pocket capsule mid-face, does the stretch after it play
  HOTTER — more shots you want to take — or does it just change the HUD
  letter? (2) six capsules per run on top of carrier drops: power rising with
  pressure (pillar 3), or does having a weapon almost always flatten the drops
  and make the rifle feel like a bug? (3) at the plain shape the capsule sits
  deck+5.05, so the mandatory crossing jump can clip it out of the air — a
  pickup that arrives with no decision: still a reward, or noise? (If it
  should at least be NOTICED, the cheap lever is presentation, not height —
  height is the arms race entry 9 closed.) (4) is the shelf-and-chasm pocket
  still worth ENTERING, or is it now just another hole in the deck? **That
  last answer steers T-021/T-022** — entries 10 and 11 aim this shape at a
  fork, and it tells us whether the shelf survives the rework or is replaced.
- **T-022 momentum pace (`?momentum=1`, off by default) — a good run vs a
  struggling run, same URL.** The pursuing edge's speed now rises with how well
  the run is being played (where RIG sits between the damage plane and the right
  clamp, plus a decaying kill streak) instead of holding `CONFIG.scrollSpeed`.
  Gate-measured: the FLOOR holds (a deliberately weak policy is still carried
  and can still finish — escalation never becomes a death spiral), the CEILING
  is a hard x1.4 with the frame budget unmoved, and **1.29 t/s of headroom is
  left above escalation's own ceiling for T-023's boosts**. Play
  `http://127.0.0.1:8741/index.html?momentum=1` against the plain URL.
  Questions: (1) does playing well FEEL like it speeds the world up, or does
  the edge just quietly gain? (2) when you are struggling, does the floor read
  as mercy or as the game giving up on you? (3) is x1.4 the right top, given
  boosts are meant to sit above it?
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
T-028 (2026-08-02) additionally names the artifact **in each headline row**
(`tools/playtest/reports/cp4/scored-run{,-baseline}/report.json`), so the
citation is per-row rather than a folder pointer.

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

**RESOLVED — T-028, 2026-08-02 (docs side; the harness fix is still open).**
Rows 3–5 now name their artifact by path and say what it does *not* contain.
Row 3 keeps only what `scored-run-nojump/summary.md` carries (stalled, 3
setbacks, 1 life at 16.0 s with x 41.662 → 44.685, 22.0 s of 30.9 s idle,
protoScore −16.5 real) and attributes the setback timestamps and final x to
this gate's own independent re-run in `reports/tasks/T-016/playtest.md`, the
only committed record of them. Row 4's `GAME_OVER` / "SIGNAL LOST" terminal
state and final x are **dropped** (not in the artifact; `outcome.result` reads
`not-completed`, which is I-006's blind label) and replaced with the three
recorded life losses at 3.2 / 6.6 / 9.8 s, each at x 31.649. Row 5's setback
times and final x are dropped, with a note that a `?fallback=1`-only run
carries no `setbacks` counter at all. Committing `scored-run-nojump/report.json`
would still be the better fix and remains available to a harness lane.

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

## I-019 — CLOSED BY OPERATOR VERDICT (decisions.md entry 9)

The defect was real and correctly found: the pocket reward was collectable
from the deck line, first by the mandatory crossing jump mid-ascent (all six
pockets), then by the air jump (2 of 6) after the first fix. But the
REQUIREMENT it violated has been withdrawn — the operator ruled the reward is
a plain pickup, so there is nothing left to violate. Closed as obsolete, not
as fixed. The three passes stand as the evidence that pricing an optional
reward in HEIGHT cannot work against a frozen jump+air-jump envelope; that
lesson belongs to T-021.

## I-019 (original report) | fairness | S1 | repro: serve `task/T-009 770ea6b`, then drive the shipped sim with the deck-line policy pathcheck itself uses (`hold right`; hold a jump whenever `groundTopAt(x + 1.2)` is a hole or a step) — all six pocket rewards are collected with `airJumpsLeft` never decrementing; in the browser, `node run.mjs <worktree>/tools/playtest/scripts/six-face-full-run.json --deterministic --max-runtime-ms 150000 --base-url <pinned 8951>` takes pocket 1's `S` at x = 45.94 while airborne and moving right | evidence: reports/tasks/T-009/playtest.md; tools/playtest/runs/gate-T-009-fullrun-branch/report.json (weapon R→S at gameMs 7908)

The T-009 dare pockets do not cost the retreat they are designed and
documented to cost: the reward is collected by the same deck-line jump the
player must make to cross the pocket chasm, with no climb to the mid lane, no
air jump onto the shelf, and no leftward movement at all. The arithmetic is
systematic rather than seed luck — the reward sits at `deckY + 5.05`
(`shelfY + rewardRise`, bobbing ±0.15) while a held jump from the approach deck
peaks at `deckY + 2.72`, putting RIG's head (height 1.7) at `deckY + 4.42`,
which is 0.48 tiles under the capsule's bob floor and well inside the 0.95
pickup radius. Face-1 pickup fires at x = 46.07, y = 5.44, still ascending. The
pathcheck assertions are individually true and collectively miss it: they prove
the *shelf* is unreachable from the deck (`shelf.y - landingY > doubleApex`) and
that the reward is in pickup range *of the shelf*, but nothing asserts the
reward is out of reach from below. Cheapest fix for triage: raise `rewardRise`
so the capsule is only reachable from the shelf deck — anything in roughly
[1.1, 2.5] separates the two cases (from the shelf, standing head is
`shelfY + 1.7`, so ≤ `+2.65` still picks up; from the deck, apex head is
`shelfY - 0.93`, so ≥ `+1.1` is clear) — plus an assertion that a held jump
launched anywhere on the approach deck cannot bring the player's head within
`pickupRadius` of the reward, and (separately) that `retreat.seconds` counts the
climb, not only the horizontal round trip. S1 because it is T-009's own accept
box ("dare pockets with measured retreat"), the claim shipped in `DESIGN.md`
and `src/pure/lattice.js`, and an operator packet built on it would ask about a
wager the player never makes.

## I-020 | docs | S2 | repro: `node run.mjs <worktree>/tools/playtest/scripts/six-face-full-run.json --deterministic --max-runtime-ms 150000 --base-url <pinned tree>` ×3 against a pinned `task/T-009 770ea6b` and ×3 against a pristine `main 16099f6` snapshot | evidence: tools/playtest/runs/gate-T-009-fullrun-{branch,branch-2,branch-3,main,main-2,main-3}/report.json; reports/tasks/T-009/playtest.md

The A/B recorded in T-009's SCOPE SPLIT note and quoted verbatim inside
`tools/playtest/scripts/six-face-full-run.json`'s `description` ("branch maxX
154.3 / scroll 140 / 11 kills / 48.5 s vs main 89.3 / 75 / 8 / 27.1 s … the
lattice tree gets ~1.7× further") is a one-run-per-side measurement and does
not reproduce. Three runs per side, same script, same flags, both trees pinned:
branch 89.25 / 89.25 / 110.65 (scroll 75 / 75 / 112), main 89.25 / 89.25 / 89.25
(scroll 75 ×3) — 2 of 3 branch runs land on exactly main's number, and the
branch's best is 1.24×. For scale on the noise, the same branch under `?zip=1`
(render-only; pathcheck proves the sim traces are identical) produced maxX
154.25 and 113.40, so the entire claimed lattice effect fits inside the spread
of a flag that cannot touch the simulation — this is the harness's documented
multi-modal behaviour (playtest README honesty items #2 and #8). The split's
conclusion is unaffected and arguably strengthened (both trees die in the same
wave-gate fight at the same x, so the lattice is not what stops the bot), but
the published numbers should be restated with repeats, or struck, in both
places. S2, not S3: it is the evidence a scope split was granted on, and it is
committed in a script description future agents will cite.

**RESOLVED — T-028, 2026-08-02.** The restatement-with-repeats happened in
T-009's fix cycle; what T-028 fixed is the *citation*. Both places
(`tools/playtest/scripts/six-face-full-run.json`'s description and
`tools/playtest/README.md`'s row for it) attributed the repeat numbers to
`tools/playtest/runs/gate-T-009-fullrun-*`, which is gitignored and absent from
the tree, and to `reports/tasks/T-009/playtest.md`, which does not carry them;
the README also pointed at `docs/playtests/2026-08-gate-fight-harness.md`,
which does not discuss I-020. Both now say plainly that **this entry is the
only committed record** of those numbers and that they are the gate's reported
measurement, not re-checkable from the tree. Committing the six run directories
(or their `report.json`s) would close it properly.

## I-021 | docs | S3 | repro: read `README.md`'s new "FAR readability pass" paragraph and `docs/DESIGN.md`'s updated view-scale bullet at `task/T-003 74b7267` against `src/render/legibility.js`'s `SHARE = { glyph: 1, cue: 1, pose: 0.6 }` and pathcheck's `legibility: a pose is boosted less than a lamp` assertion | evidence: reports/tasks/T-003/playtest.md; artifacts/legibility-v1/capsule-glyph--views-after.png

Found while gating T-003 (FAR readability pass, PASS). Both user-facing docs say
the pass scales the boosted features "back up by the same factor, so they land at
the screen size the near view already read at" (README) and "scaled back up by the
view's own pull-back factor" (DESIGN). That is exact for capsule glyphs and the new
tell lamps (share 1.0 → gain = `depthMult` 1.9 at FAR, and the views strip does show
one screen size across near/mid/far), but a tell POSE deliberately takes only 60%
of the compensation (gain 1.54), so a boosted hound rear-up or iris dilation lands
*smaller* at FAR than it did at near — by design, and correctly stated in
`legibility.js`'s header and in the commit message, just not in the two docs a
reader is most likely to hit first. Fix is one clause in each ("information whole,
a pose partly"), not a behavior change. S3: no gate or verdict rests on it, but this
repo's docs rule is that a claim may not outrun its evidence.

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

## I-021 | bug | S2 | RESOLVED — not a defect (T-020), and not reproducible on main with a terrain-aware policy (T-019) | repro: any six-face run on main OR task/T-009, --deterministic, aimless or aimed policy | evidence: docs/playtests/2026-08-gate-fight-harness.md (T-018); tools/playtest/runs/gate-T-009-fullrun-*

Found by T-018 while instrumenting the gate fight: **every** run on both trees
spends its first life at ~3.0s falling into the same 3-tile gap at x = 31.649
— full hp, no hostile within 14 tiles, before any wave gate. It is a traversal
fact about the shipped generator and it predates the lattice (it reproduces on
pristine main). The old harness could not see it because the sample carried no
terrain at all; T-018's terrain probe is what made it visible. Not a gate-fight
problem and not caused by T-009. Triage: is the gap authored to be jumped and
the bot simply cannot see it, or is it a hole the generator should not emit at
x=31 on face 1 before the player has been taught anything?

## I-022 | feel | S3 | repro: six-face run, wave gate 2, count gating bodies vs authored slots | evidence: docs/playtests/2026-08-gate-fight-harness.md (T-018)

Found by T-018: wave gate 2 is fought as NINE gating bodies, not the five it
authors. The other four are ambient spawns that drifted into the arena before
the gate armed (`cornerClearBefore: 10`), and some spawn past the corner pivot
on the not-yet-built face and take 5-8s to cruise back into reach while the
gate holds shut. Measurement only — no spawner behaviour was changed. Operator
question, queued: is that the intended pressure, or should the corner-clear
zone keep ambient spawns out of a gate arena entirely?

## I-023 | docs | S3 | repro: `node -e "import('<task/T-018 dc32cf1>/tools/playtest/lib/policy.mjs').then(({compileCondition})=>console.log(compileCondition('x==3+1').evaluate({x:4},new Set(),{})))"` → compiles, `{result:false}`, no warning; same on `main`'s engine | evidence: reports/tasks/T-018/playtest.md

Wording nit found while gating T-018, on a claim the task newly makes in two
places: `tools/playtest/README.md` ("the compiler *rejects* `||`, parens,
arithmetic, unknown fields and string ordering") and `tools/pathcheck.mjs`
(`rejects('threat.dist < 3 + 1', 'arithmetic')`). Arithmetic is only rejected
behind an ORDERING operator, where the string rhs trips the "ordering needs a
number" guard. Behind `==`/`!=` it is accepted: `x==3+1` parses `3+1` as the
string `"3+1"`, compares it to a number, and reads false for the whole run with
no `missingFieldWarnings` entry — the silent-forever failure mode the
threat-field validation exists to prevent. Nothing is evaluated as JS either
way, so this is a foot-gun, not a hole in the &&-only grammar, and it is
**pre-existing on main** (verified against a `git archive main` copy of the old
engine), not introduced by T-018. Fix is either wording ("arithmetic is
rejected behind ordering operators") or one more compile-time guard rejecting a
non-numeric rhs that contains an operator character.

## I-024 | docs | S3 | repro: in a `git archive task/T-020` copy, replace the floor pin inside the gap probe's `cross()` (`if (floor) E.setEdges(x0 + hw + M - 200, x0 + hw + M);` → `if (false) …`) and run `node tools/pathcheck.mjs` → **1527 passed, 0 failed** | evidence: reports/tasks/T-020/playtest.md §4; tools/pathcheck.mjs (search `FAIR-GAP INVARIANT`)

Found while gating T-020, on the guard the new invariant uses to prove its own
honesty: `'the same gaps are wider still at run speed … (the probe really is
measuring the floor, not a free run)'` asserts `runSingle > floorSingle`
**strictly**, which catches a probe that starts at `runSpeed` (the builder's own
negative control fails exactly this, verified) but not one that keeps the
scroll-speed start and merely loses the screen clamp. Measured that case
independently: with the clamp gone but `vx` still initialised to `scrollSpeed`,
RIG accelerates to `runSpeed` in the air and the "floor" window for gap 29-31
balloons **0.74 → 4.12 tiles** against a run-speed 4.22 — still strictly less, so
the guard passes while the column silently reports an almost-free run under the
label "SCROLL speed". Nothing is wrong with the shipped numbers (they reproduce
under independent code with the pin present); this is about how much protection
the guard buys the next person to edit `sim/edges.js` or `CONFIG.edges.margin`.
Fix is one more assertion inside the probe — e.g. record max `|vx|` during the
floor sweep and assert it never exceeds `scrollSpeed + ε`, which is the property
the label actually claims.

## I-025 | feel | S3 | repro: `cd tools/playtest && node run.mjs <a policy script: hold right + tap jump on terrain.gapDist<2.2> --deterministic --max-runtime-ms 20000 --base-url <pinned main-equivalent tree>` — hp 3→2 at `gameMs` 2769, RIG airborne at x = 30.49 y = 4.68 over gap 29-31, wasp id 2 in `dive` at x = 31.28 | evidence: tools/playtest/runs/gate-T-020-firstgap/report.json; docs/playtests/2026-08-first-gap-triage.md §4b; reports/tasks/T-020/playtest.md §3(e)

`CONFIG.spawner.startS = 28` puts the ambient table's first row — a wasp — one
column before the first gap's near lip, i.e. on the takeoff itself. T-020 found
it analytically; this gate reproduced it in a real browser on the shipped FAR
camera: the wasp dives into RIG mid-flight over the pit at t ≈ 2.8 s, and because
`damagePlayer` sets `vx = sign(x − fromX) * knockbackX`, a hit taken from ahead
throws him **backwards into the hole he is crossing** (trace: x 30.44 → 30.17 →
29.72 after the hit). Over a gap that converts a heart into a life. It lands
before the player has been taught anything and before the first wave gate. Not a
terrain defect and not fixed by T-020 — an operator difficulty call, per that
doc's §6 Q5: push `spawner.startS` past the landing strip (`28 → 33`), keep it as
a "shoot before you jump" lesson, or treat the compound punishment as the point.

## I-026 | docs | S3 | repro: `cd tools/playtest && node run.mjs <any default-run script with url `index.html?enemies=0`> --deterministic --base-url <pinned tree>` → the trace carries 2–6 live `wasp`/`carrier` rows in `hostiles[]` from the first sample on | evidence: tools/playtest/runs/gate-T-020-firstgap/report.json (url `index.html?enemies=0&testapi=1`, hostiles present throughout); src/mode.js:37; src/sim/spawner.js:24

`?enemies=0` sets `SLICE_ENEMIES_ENABLED`, which is only ever consulted for the
**slice fixtures** (`spawner.js` uses it to blank a fixture's authored spawn
list). On a default six-face run the ambient spawner is untouched, so the flag is
a silent no-op: a run authored as "terrain only, combat isolated" is in fact a
live-combat run, and any per-gap or pacing number taken from it inherits hostile
knockback it was designed to exclude. Caught while writing T-020's gate evidence
— the run intended as a clean terrain crossing took a wasp hit over the gap at
2.8 s (see I-025). Nothing is broken in the game; the trap is that the flag name
reads global. Fix is either honest wording in `tools/playtest/README.md` (and the
flag table in the root README) that `enemies=0` is slice-only, or a default-run
ambient-spawn kill switch for measurement, which is a new query flag and needs
the usual off-by-default treatment.

---

**CORRECTION (integrator, 2026-08-01) — I-021 / T-020, and a premise I
propagated.** I briefed T-020 that "RIG crosses ground at scroll speed 4.3 t/s
holding right, so a held jump travels ~3.0 tiles and the gap is exactly 3 —
marginal by construction." That is WRONG, and the gate proved it in a real
browser rather than on paper: the right-screen clamp does not bind at the first
gap in the shipped FAR view. Measured from a six-face trace, RIG approaches it
at **9.40 t/s — exactly `runSpeed`** (x 15.48 -> 25.43 across gameMs
1102 -> 2161); the clamp is tens of tiles ahead. The honest takeoff window is
**449 ms (~27 frames at 60 Hz)**, plus ~16 frames of late-press grace via the
air jump — not marginal, and not frame-perfect. The gap is authored to be
jumped and the BOT could not see it; the generator was correctly left untouched.

Where the bad number came from: T-009's build report observed that RIG is
clamped to screen-right and therefore crosses at scroll speed. That is true
*once RIG is riding the clamp*, and I applied it at an x where it is not. Any
future claim about traversal cost must state WHERE the player is relative to
the clamp, and be measured, not inherited.

---

## I-027 | docs | S3 | repro: `cd <task/T-019 6ad3fc5>/tools/playtest && node run.mjs scripts/six-face-spaced-run.json --deterministic --stop-on-game-over --max-runtime-ms 145000 --base-url <that worktree pinned>` ×3 | evidence: tools/playtest/runs/gate-T-019-spaced-{1,2,3}/analysis.txt; reports/tasks/T-019/playtest.md §2

Found while gating T-019 (PASS). `scripts/six-face-spaced-run.json`'s own
`description` says the policy "reaches wave gate 2 / scroll 140 of 415 EVERY
time" and "survives 50.2-55.1 s (median 53.1 over all nine)". Three independent
runs by this gate, same pinned tree and same flags, produced **58.9 s / scroll
140**, **54.3 s / scroll 140**, and **38.2 s dying inside wave gate 1 at scroll
79** — one run outside the band above, one below, and one that never reached the
gate the description promises. This is the same overstatement the reviewer
already made the branch correct for `six-face-aimed-run.json` (whose description
now carries FIXVERIFY-1's gate-1 death); the sibling script kept the absolute
wording. The finding's own honesty note — "read the gate reached, never one
run's decimals" — is the right frame, except that here even the gate reached
varies. Fix is wording only: "usually gate 2, sometimes gate 1" plus a band that
covers the observed 38–59 s. Nothing about the T-019 conclusion changes; my runs
support it more strongly than the builder's (zero VICTORY samples in 4/4).

## I-028 | bug | S3 | repro: replay any `six-face-spaced-run.json` trace through `lib/threat.mjs` and count PLAYING ticks with `edgeMargin` in (6,8) AND `threat.dist<2.2` AND `threat.dx>0` — 3 of 777 on gate-T-019-spaced-1, min `edgeMargin` 7.37 | evidence: tools/playtest/runs/gate-T-019-spaced-1/report.json; reports/tasks/T-019/playtest.md §1

Found while gating T-019 (PASS), by trying to construct a case where a new
policy clause misfires. Two `hold` rules in the shipped six-face policy overlap
in a window where they command opposite directions: `edgeMargin<8 → hold right`
(the crush-plane emergency) and the new `threat.dist<2.2 && threat.dx>0 &&
edgeMargin>6 → hold left` (personal space). Between 6 and 8 tiles of margin both
fire, `hold` rules OR per key code, `left` and `right` are both down, and
`computeAim`'s `h = 0` leaves RIG standing still — inside the one window whose
rule exists precisely to make RIG run. Measured cost is small (3 of 777 PLAYING
ticks in the sampled run, and no life loss attributable to the crush edge; run
minimum margin 3.52 tiles), and the finding already reports the general
rule-cancellation rate honestly (§3.3, 4.8-9.9 % of ticks, 5.3 % measured here).
Filed because this particular pair is the one where cancelling is worst: raising
the personal-space guard to `edgeMargin>8` closes it with no other effect. Policy
script only — no game file involved, and the clause is legitimate relative
geometry, so the anti-scripting guard is not implicated.

**I-021 follow-up (T-019, 2026-08-01).** Independently of T-020's fairness
finding, the x=31.649 death does **not** reproduce on `main` with a
terrain-aware policy: across 9 inspected runs the first life goes at 20.6-28.4 s
at x 65-89, inside the gate-1 fight, because the terrain probe already clears
that hole. It reproduces only for policies with no terrain-driven jump — i.e.
it was a property of the old aimless script, not of the level. A *different*
3-tile gap around x 47-50 did kill the no-hop variants, reached airborne after
a 2-tile step-down so the grounded-jump rule never fired; that is why T-019
added `terrain.landDist` and made `gapDist` read 0 while over a hole. Data for
the lattice lane, not a defect report.

## I-029 | docs | S3 | repro: `cd tools/playtest && node run.mjs <task/T-022 e6e188a>/tools/playtest/scripts/momentum-{strong,weak}.json --deterministic --max-runtime-ms 62000 --base-url <that worktree pinned on 8998>` ×2 each | evidence: tools/playtest/runs/gate-T-022-{strong-1,strong-2,weak-1,weak-2}; reports/tasks/T-022/playtest.md §4, §10

The two T-022 operator-packet scripts embed "MEASURED, NOT ASPIRATIONAL" bands
in their own `description` fields, and independent repeats on the same tree land
outside several of them: `momentum-weak` "above the floor on 11.6 % / 24.2 % of
PLAYING samples" measured 0.7 % and 11.6 % here, and its "GAME_OVER at 27.5 /
27.9 s" measured 22.7 / 22.9 s; `momentum-strong`'s "GAME_OVER at 43.9 / 42.7 s"
measured 34.2 / 46.0 s. Peaks did reproduce closely (strong ×1.265/×1.280 vs
×1.27 quoted; weak ×1.008/×1.025 vs ×1.02/×1.05), and the **structural** gap the
descriptions themselves say to read — 12-13x separation in fraction-of-run above
the shipped pace, ×1.12 bound never crossed by the weak policy — held in every
pair, so the gate passed on that. Filed only so a later reader does not treat
those decimals as a regression baseline: two runs per side is a small sample of
a build whose documented run-to-run spread is wide (harness README, honesty items
2 and 8). Suggested fix is a one-line hedge in each description pointing at the
structural gap instead of the sample percentages, or a third run per side folded
into the quoted range.

**RESOLVED — T-028, 2026-08-02.** Both descriptions now lead with the
structural gap and drop every per-run decimal that had no committed artifact
behind it (the builder's sample counts, medians, p90s, kill counts, edgeMargin
medians and GAME_OVER times, plus weak's "11.6 % / 24.2 %"). What they quote
instead is this repo's only committed measurement of the pair,
`reports/tasks/T-022/playtest.md` §§ 2 and 4 — 12–13× separation in fraction of
PLAYING samples above the shipped pace, the weak policy never crossing ×1.12,
and flag-on/flag-off weak runs identical in reach (`maxX` 59.6, `maxScroll`
75.0, 3 lives) — each labelled as a two-run sample, with the note that the
`tools/playtest/runs/gate-T-022-*` directories both sets came from are
gitignored and absent. `momentum-weak`'s three falsifying gates are unchanged:
they are stated from `src/config.js`'s momentum constants, which are checkable
in the tree.

## I-030 | docs | S3 | repro: read any `?momentum=1` trace — `report.json` → `trace[].pursuitSpeed` is the only escalation signal present; `grep -n "momentumDrive\|peakDrive" <task/T-022 e6e188a>/src/main.js` returns nothing | evidence: reports/tasks/T-022/playtest.md §3; tools/playtest/runs/gate-T-022-strong-2/report.json

Forward-looking instrumentation gap, not a defect today. T-022's earned drive is
recoverable from a bot trace only by inverting the pace —
`drive = (pursuitSpeed/4.3 - 1)/0.4` — which is exactly what both packet scripts
instruct a reader to do, and it is correct **while escalation is the only source
feeding that number**. `src/sim/pace.js` already tracks `drive`, `peakDrive` and a
tier, and `src/pure/momentum.js` exports `momentumTier`/`momentumDriveFromSpeed`,
but none of them ride the frozen `testapi` channel; only the HUD string carries
the meter. The moment T-023's boosts push their own speed through the shared
`momentumClampSpeed` chokepoint (which is the stated design), `pursuitSpeed` stops
distinguishing "the player earned this" from "a boost is running", and the packet's
falsifying gates — "drive must never exceed 0.30 for a struggling player" — become
unreadable from a trace. Cheap fix when T-023 lands: publish `momentum: {drive,
peakDrive, tier}` on `telemetry()` beside `pursuitSpeed`, additive, inert when the
flag is off.

## I-031 | bug | S1 | repro: `node <gate probe>` driving `.claude/worktrees/T-021/src/sim` with `globalThis.__HB_QUERY__='split=1'` — park RIG on the plate top at quarter-tile steps from `commitX` to `exitX`, hold right at `runSpeed`, ONE jump (air jump never spent), read `currentWeapon` at landing; task/T-021 bb6bdd1 | evidence: reports/tasks/T-021/playtest.md §2; scratchpad `gate-sweep.mjs`/`sweep.json`, `gate-probe.mjs`/`probe.json`

T-021's acceptance box names its own falsifying test — "a policy that always
takes the main line collects zero rewards" — and the `?split=1` build does not
meet it. From the last ~1.5 tiles of the plate top (the MAIN LINE), a **single
jump with the air jump never spent** collects the fork's reward capsule and
comes down on the deck AHEAD of the fork, which is where the main line lands
anyway: 7 of 29 swept take-offs on every one of the four forks, weapon letter
S/L/H/F read off `src/sim/weapons.js` at the finish, peak height 8.61 against a
span surface at y=9 — RIG never reaches the branch it is supposed to have
committed to. With the air jump spent it is 28 of 29 take-offs, 8-9 of them
landing off the span. Independently, a fork-blind runner (hold right + tap jump
on a fixed 800 ms cadence, the shipped `mid-route` heuristic) walked out
carrying the letter in **16 of 16 runs** (4 forks x 4 cadence phases). The
pathcheck assertion that gates this (`main.every(r => r.took === 0 && r.weapon
=== 'R')`) passes only because that policy never presses jump while on the
plate — subject = the author's intended route, which is the I-019 failure mode
CLAUDE.md's "assert against what a PLAYER can do, with every verb on by
default" rule exists to catch. The tree measures the same thing honestly in a
pathcheck console note and routes it to the operator as a feel call; the box is
still unmet, so the gate fails on it. NOT a "raise the capsule" fix — entry 9
forbids pricing a reward in reach; the measured gap is horizontal (the capsule
sits inside the plate's own jump arc), so the lane owns where it sits along the
span. If the operator instead rules that a free capsule one jump off the main
line is correct (entries 9 and 12 point that way), that needs a new decision
entry retiring this acceptance box, not a geometry tweak.

## I-032 | art | S3 | repro: open `artifacts/t021-split/face1-approach.png` and `face1-commit.png` (task/T-021 bb6bdd1) at 1440x900, uncropped, and try to locate the sealed cave before reading the JSON beside them | evidence: reports/tasks/T-021/playtest.md §6; artifacts/t021-split/frames.json

Fairness-rider readability, found while gating T-021 (which fails for an
unrelated reason — I-031). Entry 11 requires the dead end to be legible as a
risk BEFORE commitment. Cropped 3x on the fork, it is: the deck runs under a
shelf into a solid vertical block, with the plate top and the span carrying on
past it — three lanes in one silhouette, exactly as authored. Uncropped at the
FAR default it is much weaker: the fork is a small rust-brown L among several
similar rust-brown L-shapes and catwalks, the deck's checkerboard band reads as
continuous behind it, and I could only find the seal after computing where it
should be. The magenta capsule marks the REWARD strongly; nothing marks the
RISK at comparable contrast, and the risk mark is the half the rider actually
asks for. The `approach` frame (14 tiles out, the frame the rider targets) is
the weaker of the two. Fold into T-003's FAR-tells readability pass if the fork
survives I-031 — a darker cave interior, a lip/hazard glyph at the mouth, or a
seal face in a different material would all be cheap. Not gated here:
readability is the operator's call, and it is question 1 in T-021's packet.

## I-033 | bug | S3 | repro: serve any tree at `task/T-029 6ec5b40` or later, open `index.html?g2=1`, complete the neck-plate flip and read the BREACH CLEAR screen — HUD reads "1/1 TURNS", body copy reads "1 of 1 transformation", stats panel reads "TURNS 1 / 2" | evidence: reports/tasks/T-029/evidence/g2-breach-clear.png; reports/tasks/T-029/review.md

Third turn-count location, surfaced by T-029's own committed evidence frame and
confirmed in review. T-029 fixed I-009 in the two places its task named
(`src/ui/hud.js`, `src/ui/overlay.js`), both of which now read
`ACTIVE_FIXTURE.events.length` and display 1 for the single-event G2 fixture.
`src/pure/shell.js:413` carries a *third* copy of the same v1 demo assumption
and still renders "TURNS 1 / 2" in the stats panel of the very same frame, so
one screen now states the transformation count three times and disagrees with
itself once. Disclosed candidly by the builder (build.md "Open items" #1) and
correctly left alone: `shell.js` is outside T-029's stated file list, T-013
owns it and is `done`, and no live lane claims it — so this is filed rather
than folded in silently. Cosmetic only: no sim, gating or telemetry effect, and
the count the player acts on (the HUD) is the fixed one. The fix is the same
one-liner already applied twice, but note `shell.js` lives in `src/pure/`,
which may not read `ACTIVE_FIXTURE` directly under the layer-purity rule — the
count likely has to be passed in, which is why this is worth its own task
rather than a drive-by edit.

## I-035 | docs | S3 | repro: `cd tools/playtest && node run.mjs scripts/momentum-weak.json --deterministic --max-runtime-ms 62000 --base-url <pinned task/T-029 6ec5b40>`, then check any sample in `report.json`'s `trace[]` for a `momentum` key | evidence: tools/playtest/runs/momentum-weak-1785637012980/report.json (0/804 trace samples carry it); tools/playtest/lib/sampler.mjs:120-150

`telemetry()`'s new `momentum: {drive, peakDrive, tier}` (SPRINT I-030 fix,
T-029) is live and correct on the real channel — confirmed directly in-browser,
`window.HB.snapshot().momentum` reads `{drive, peakDrive, tier}` under
`?momentum=1&testapi=1` and is `undefined` (absent from `JSON.stringify`)
without the flag. But `sampler.mjs`'s `fromTelemetryLike()` (the function that
builds every `report.json` → `trace[]` row from that same snapshot) whitelists
fields one at a time and was never given a `momentum` line, so the key never
reaches a harness report — a future gate reading `report.json` still has to
invert `pursuitSpeed` to recover drive, the exact readability problem I-030
was filed to fix. Cosmetic to this run (I verified the live channel directly
with my own browser probe instead), but it means no *harness-based* gate can
currently cite momentum from a report without re-deriving it. One-line fix
(`momentum: s.momentum || null,` beside the other passthrough fields), inside
`tools/playtest/lib/sampler.mjs`, disclosed by the builder (build.md "Open
items" #2) and out of T-029's fence (`tools/pathcheck.mjs` was the only
`tools/` file this lane touched).

## I-034 | bug | S3 | repro: at `task/T-026 13aef89`, run the import scanner over a file containing `export default class Foo {}` immediately followed by `import glyph from '../assets/generated/glyphs/x.png';` — one hit is returned as `{"kind":"export","specifier":"...png","line":1,"endLine":2}` instead of `kind:"import"` at line 2 | evidence: reports/tasks/T-026/review.md (first finding)

Diagnostic-accuracy bug in the new `tools/assets/lib/imports.mjs` scanner, found
by the T-026 reviewer writing its own adversarial fixtures. When a legal
`export default class Foo {}` — which needs no terminating semicolon and has no
`from` — is immediately followed by a real asset import, the scanner merges the
two statements into one hit and misattributes both the kind (`export` rather
than `import`) and the line number (the export's, not the import's).

NOT a detection hole, and explicitly not a T-026 blocker: the file is still
correctly flagged and `check.mjs` still exits non-zero in every variant tried,
including chains where a non-asset import sits between the two (the merge
terminates at the first quote, so it never swallows a second independent import
statement). The acceptance box T-026 had to meet was about exit code, not
attribution, and it meets it.

Filed because the error MESSAGE is what the next person debugging a failing
asset-independence gate will read, and in this shape it points at the wrong line
and calls an import a re-export. Cheap fix; only worth doing when someone is next
in that file.

## I-036 | bug | S3 | repro: at `task/T-027 a07e9c4`, `node tools/playtest/analyze-run.mjs --policy tools/playtest/scripts/six-face-spaced-run.json <trace>` over gate-T-019-spaced-1 and -3, and count PLAYING ticks where a gate-servo `hold left` (rules 2 and 4) fires while `edgeMargin < 8` | evidence: reports/tasks/T-027/build.md (§I-028 census); tools/playtest/runs/gate-T-019-spaced-{1,3}/report.json

Second rule-cancellation pair in the same crush window, found by T-027 while
fixing the first one (I-028) and deliberately left unfixed. T-027 raised the
personal-space guard to `edgeMargin>8`, which took that pair's conflicts to zero
on all three measured traces (3→0, 0→0, 19→0). But the two gate-servo `hold left`
clauses (rules 2 and 4 of `six-face-spaced-run.json`) carry NO margin guard at
all and still fire inside the crush window: 1 tick at margin 7.51 and 1 at 7.87
on trace 1, and 7 ticks spanning 6.95-7.75 on trace 3. Same failure shape — the
crush-plane emergency `hold right` and a `hold left` both down, `computeAim`'s
h = 0, RIG standing still in the one window whose rule exists to make it run.

The builder's stated reason for not fixing it is sound and worth preserving: the
one-line-per-rule fix changes the gate-fight POSITIONING policy that T-019
measured its numbers with, and retuning that silently would invalidate a
published band without saying so. So this is a deliberate hand-off, not an
oversight.

Policy-script only; no game file is involved, and the clauses are legitimate
relative geometry, so the anti-scripting guard is not implicated. Whoever takes
this must re-measure T-019's affected numbers in the same change, or state
plainly which published figures it invalidates.

## I-037 | bug | S1 | repro: on `main` (2404/0), in a browser at `index.html?shell=0`, run `limbBakePlan(CONFIG, groundH, {scale:true})` vs `{scale:false}` importing `groundH` from `src/sim/level.js` — both return **829 pieces, zero `mark*`/`bd*` kinds**, and the plan still contains `silhouette` (the `!scale` path's output) | evidence: this session's integrator QA; contrast `node --input-type=module` with a synthetic flat `groundH` which yields 1674 vs 870, delta 804, 818 mark/backdrop pieces

**T-045's scale pass emits nothing on the shipped default run.** The human-scale
reference objects (rung ladders, hatches, personnel doors, gantry rail) and the
graded backdrop tiers — the entire answer to decisions entry 17's *"make the
player feel the scale of climbing a giant monster"* — are absent from the baked
plan at the default URL. `?scale=0` and the default are byte-identical in piece
count and kind set, which is the definitive symptom.

The code is present and looks correct: `limbBakePlan` computes
`scale = opts.scale !== false`, passes it to `facetPlan`, and `facetPlan`'s
`if (!scale) { …silhouette…; return; }` guard is followed by `sisterPlan`,
`spinePlan`, `farPlan`, `markPlan`. There is exactly one definition of each — no
duplicate-definition merge artifact. `src/pure/limb.js` on `main` is byte-equal
to T-045's own commit `1c6f464` with no later edit.

**The discriminator is `groundH`.** With a synthetic flat array the scale path
fires (delta 804). With the real generated level's `groundH` (445 entries) it
produces nothing. So a guard inside the scale path is rejecting the real terrain
— but silently, and only on the shipped level.

S1 because this is the flagship answer to the operator's headline art request,
it was merged and reported to him as live, and it is invisible in play. It was
observably rendering on `task/T-035`'s tree earlier in the session (ladders and a
large overhead structure were visible in a capture at the same start position),
so a bisect between that tree and `main` is the fastest route.

NOT a lighting or bloom problem: `?light=flat` and `?scale=0` all render the same
absent-marks frame, and the defect is in the PLAN, before any renderer runs.

## I-037 — CORRECTED AND CLOSED (2026-08-02, integrator)

**The conclusion was wrong; the scale pass works.** Verified on `main` in a
browser after a hard reload, importing with cache-busting query strings:

    withScale 1633 · withoutScale 829 · delta 804 · markPieces 818 · no silhouette

That is T-045 doing exactly what it claims. The rung ladders, hatches, doors,
gantry rail and graded backdrop tiers all bake and render on the shipped
default run.

**What actually happened: the integrator's browser was executing a pre-T-045
copy of `src/pure/limb.js`** — a stale build, reachable either from one of the
pinned worktrees still on this machine (`/private/tmp/hb-pin-main-cd37b91`,
`/private/tmp/hb-pin-t009fix`) or from bytes cached before `tools/serve.mjs`
replaced the caching python server on port 8741 earlier in the same session.
T-050 reproduced the cache mechanism end to end and showed the two are
**indistinguishable from a console**.

**This is the T-024 defect class, committed by the person who diagnosed it.**
The lesson is not "be careful" — it is that a plain fresh navigation is not
sufficient evidence about which build you are looking at. Before concluding a
feature is missing:
  - hard-reload, and import with a cache-busting query string; and
  - assert a build fingerprint from the page itself (a count, a symbol, a
    version) rather than trusting the URL to imply the tree.

I-037 is closed as NOT A DEFECT. T-050's real deliverable is the gate that
makes this class self-detecting rather than a fix — see its report.

## I-038 | bug | S2 | repro: `cd tools/playtest && node run.mjs scripts/six-face-full-run.json --deterministic --stop-on-game-over --max-runtime-ms 245000 --base-url <pinned-server>` against merge-base commit `69e1f906262cdebd4bbc7f83f0dd27885e8baa92` (reproduced 3 of 5 tries; also 1 of 5 on `task/T-044` @ `03b775e`, so pre-existing on `main`-equivalent code, not T-044's terrain) | evidence: reports/tasks/T-044/qa-evidence/distribution-repro.md, reports/tasks/T-044/qa-evidence/full-base-{2,3,4}/report.json, reports/tasks/T-044/qa-evidence/full-branch-4/report.json

Found while playtest-gating T-044. The default six-face run's weak
(no-vertical-aim) reflex policy can get wedged ALIVE at wave gate 1
(x≈58.9-60.0, `scrollX`=75.0) for 160-200+ seconds of a 245s run with hp and
lives completely flat and zero forward progress, instead of reaching
`GAME_OVER` — `meta.stopReason` reads `"script-window"` rather than
`"game-over"` in the affected runs, and `trace[]` shows the exact same x to
two decimal places for the entire stall window. This reproduces on the
**unmodified merge-base** (`69e1f90`), so it is not caused by T-044's
ARRIVAL/ARENA terrain (which begins well past scrollX 75). Caveat, stated
plainly: the "weak" policy deliberately has no vertical-aim rule at all
(that is what makes it a stand-in for a weaker player in this project's own
difficulty-measurement methodology, per `reports/tasks/T-044/build.md`), so
a real player — who always has that verb — may not get stuck the same way;
this is evidence of a possible dead spot at wave gate 1 worth a
human/stronger-bot check, not proof of a player-reachable softlock. Given
the PLAYER MODEL block in this file explicitly calls out "a safe spot
nothing can reach" as a thing to hunt for, this is worth triaging even with
that caveat. Fix direction: someone with combat/hostiles context (T-043's
lane, or a future gate-1 AI/composition pass) should drive
`full-base-3`/`-4`'s exact trace
(`reports/tasks/T-044/qa-evidence/full-base-3/report.json`) through
`analyze-run.mjs` to see what's adjacent to RIG during the stall and
whether a real player's aim would actually break it.

## I-039 | bug | S2 | repro: `bash reports/tasks/T-040/playtest-evidence/determinism-regate/regate-repro.sh` against a pinned `task/T-040` worktree (`1bdc750`) served on one port and merge-base `2c638aa` served on another; compare `meta.deterministicDispatch.dispatched` and `metrics.closestCrushApproachTiles` per round | evidence: reports/tasks/T-040/playtest.md §5; reports/tasks/T-040/playtest-evidence/determinism-regate/results-16x3.csv (48 runs)

Found while re-gating T-040 (playtest: FAIL). The original async-fetch
determinism defect (an earlier FAIL) is confirmed fixed — `src/render/
player.js` now awaits `preload.js`'s shared gate at module top level, no
second bespoke timeout/lock-in path. But a second, narrower residual
reproduces on a properly-interleaved 16-round measurement (one run of
base/escape-hatch/shipped-default per round, so shared-session load hits
all three equally): the merge-base tree dispatches exactly 18/26 scripted
events on `mid-route.json --deterministic` every single time across 16
rounds (zero deviation), the `?rig=canvas` escape hatch deviates once in
16, and the shipped sprite default deviates in 7/16 (44%) — with the most
extreme case (`dispatched=23`, `gameMsMax=8299ms`) producing a
`minEdgeMargin` of 33.04 tiles against every control run's tight
35.3-35.4-tile band, a real ~2.3-tile-worse closest crush-edge approach
from byte-identical input. Both magnitude and frequency are far lower than
the original defect (then: essentially every run, ~2000ms/2.4-tile; now:
~1-in-16, similar per-incident magnitude), and it is fully absent in the
escape hatch — nothing here is a near-miss in absolute terms (33 tiles is
nowhere near the game's own `edgeMargin<8` emergency threshold), only a
measurable break in run-to-run reproducibility. `reports/tasks/T-040/
build.md`'s own account (same branch, written before this re-gate)
proposes the fix belongs in `src/render/preload.js` (shared with T-049):
an explicit warm-up render/`renderer.compile()` pass at the end of the
boot gate, so a GPU driver's deferred mipmap upload actually finishes
before frame 1 instead of landing on it. Likely systemic to any lane
registering a large mipmapped texture through the same shared gate, not
unique to RIG — worth checking against T-049 once it lands.

## I-040 | feel | S3 | repro: `node run.mjs scripts/six-face-spaced-run.json --deterministic --base-url <pinned task/T-040 1bdc750> --video --max-runtime-ms 45000`, extract frames at 300ms spacing through any sustained firefight (this report used t=20.0-23.3s) | evidence: reports/tasks/T-040/playtest-evidence/qa2-t20.9s-rig-clear-4x.png vs qa2-t20.6s-muzzle-flash-obscures-4x.png vs qa2-t21.2s-rig-lowcontrast-dark-panel-4x.png

Found while re-gating T-040 (playtest: FAIL, unrelated to this item).
Sharper version of the muzzle-occlusion finding the previous T-040 playtest
gate already filed: because the default rifle fires every 130ms
(`CONFIG.weapons.R.fireRateMs`) and is held near-continuously in combat,
the flash/tracer bloom sits on or beside RIG's own position on a
predictable, recurring cadence during a firefight, not as a one-off. A
second, independent contrast failure also reproduces: against a darker
panel/pillar background element (rather than the lighter wall panel most
prior evidence used), RIG's own dark ink outline blends toward the
background rather than separating from it. Neither is a new defect class —
this is a feel/readability item for the operator checkpoint queue, not a
bug, and did not factor into the FAIL verdict above.

<!-- T-040 BLOCKED NOTE (2026-08-02, integrator). The sprite art has passed
repeatedly — glance test, tracer separation, asset-missing fallback, and an
armored-marine read at true 15x30px, which is what the operator asked for after
rejecting the box version (entry 15). Its original async-load determinism defect
is CONFIRMED FIXED.

It blocks on I-039 (S2): a residual, measured on a 16-round interleaved design —
merge-base deviates 0/16, the escape hatch 1/16, the shipped sprite default
7/16, worst case a ~2.3-tile-worse crush approach from byte-identical input.
Awaiting the texture load is not sufficient; a GPU driver can still defer the
mipmap upload onto frame 1. The fix is an explicit warm-up render /
renderer.compile() at the end of src/render/preload.js — T-049's file, and
systemic to any lane registering a large mipmapped texture through that gate.

T-040 is deliberately NOT fixing it locally: doing it once in the shared gate
covers RIG, the five enemy sprites, and every future lane. Unblocks when T-049
lands the warm-up; then re-run
reports/tasks/T-040/playtest-evidence/determinism-regate/regate-repro.sh and
show deviation at the control's level. -->

<!-- ===== T-040 UNBLOCKED — I-039 RECLASSIFIED (2026-08-02, integrator) =====

The warm-up was built, measured with T-040's own 16-round interleaved design,
and it DOES NOT WORK: 11/16 → 14/16 deviating, no improvement. T-049 reported
that as a negative result rather than shipping it as a fix, then spent 132
committed runs isolating the actual cause
(.../T-049/reports/tasks/T-049/i039-evidence/):

  - gate loads + warms 5 textures, NEVER DRAWN ...... 12/12 deviating
  - main .......................................... 0/12
  - ?sprites=0 (nothing loaded) ................... 1/12
    → LOADING alone reproduces it in full. Drawing adds nothing.

  - main, untouched ............................... 2/12
  - main + 25ms artificial boot delay, no assets ... 2/12
    → It is NOT boot latency of the magnitude the gate costs.

  - ?fixeddt: every condition scatters WORSE, control included
    (main 2/8 deviating, gameMsMax 4533–19683).

RULING. That last row is the one that matters. The harness's --deterministic
mode is unsound in the presence of runtime asset loading, and — since pinning
the timestep makes the CONTROL scatter — somewhat unsound generally. I-039 is
therefore a HARNESS-DETERMINISM finding, not a gameplay defect, and it is
**demoted S2 → S3 and no longer blocks any lane**. Nothing in it describes
something a player experiences: perf is clean both ways (120fps, worst 10.30ms,
over20ms 0, sprites and primitives alike), and decisions entry 19 already
records that run-to-run variance is this game's FEATURE, with the standing
discipline being interleaved rounds and reported distributions, never means.

Blocking three art lanes on bot-run reproducibility would have been exactly
the kind of paperwork the operator told us to remove. T-040 goes to `review`
and gates on durability and readability, not on reproducing I-039.

The warm-up STAYS (8ms, `?warm=0` A/B, real independently-argued deferred-
upload hazard) with a one-line comment saying plainly that it is not a fix for
I-039, so no future reader mistakes it for a solved problem.

The `?fixeddt` result is filed separately as I-040 — the tool we judge
everything with is unsound in the mode we trust most, and that is worth its
own task. The fetch/decode/upload separation experiment (~30 runs) was offered
by T-049 and DECLINED on cost, not on merit. ===== -->

## T-049 | assets | done | P1
goal: five hostile-kind sprites on the shipped enemies, plus the shared
src/render/preload.js boot-time texture gate every future asset lane consumes.
accept: gate is genuinely multi-caller safe (one shared close routine gated on
"every entry currently in `entries` settled, or the one shared timer fired" —
not a per-call snapshot); a failed or missing sprite still draws the primitive
body and never wedges the game; gameplay does not branch on whether an asset
loaded; 60fps at 200+ projectiles measured vsync-off.
owner: gameplay-engineer (sonnet)
verify: node tools/pathcheck.mjs; break/restore on every new assertion; the
multi-caller race reproduced 10 trials before and after, distribution reported
note: also carries the I-039 warm-up investigation and its negative result —
see the T-040 UNBLOCKED block above. The warm-up ships but is NOT a fix.

## I-040 | bug | S2 | repro: `cd tools/playtest && node run.mjs scripts/mid-route.json --deterministic --fixeddt` against unmodified `main`, 8 interleaved rounds; compare `meta.deterministicDispatch.dispatched` and `metrics.gameMsMax` round to round | evidence: .claude/worktrees/T-049/reports/tasks/T-049/i039-evidence/fixeddt-8x3.csv

**The determinism harness is unsound in the mode we trust most.** Pinning the
timestep with `?fixeddt` — the flag whose entire purpose is to remove
frame-timing variance — makes every condition scatter WORSE, including the
untouched-`main` control: 2/8 rounds deviating, `gameMsMax` ranging
4533–19683ms from byte-identical input. A fixed timestep should make the sim
reproducible regardless of how frames are delivered; that it does the opposite
means either the sim is not actually stepping on the pinned dt, or the pin is
applied somewhere downstream of a path that still reads wall-clock.

Why this matters more than the sprite finding it fell out of: this is the tool
every lane uses to claim "no behavior change," and `--deterministic` is the
mode every A/B in this project has been measured in. If it is unsound, some
prior "no deviation" result is worth less than it looked. It does not affect
what a player experiences — decisions entry 19 makes run-to-run variance the
feature — but it degrades our ability to *prove* a change is inert.

Fix direction: find where the sim's step actually comes from under `?fixeddt`
and confirm it is the pinned value and nothing else; then re-run the control
and show it flat across 16 rounds before trusting the flag again. Until then,
every asset-involving A/B uses interleaved rounds and reports distributions,
never means (entry 19's standing discipline, now load-bearing rather than
merely good practice).

## I-??? | docs | S3 | repro: `grep -n "^## I-040" SPRINT.md` (two matches) | evidence: this entry; reports/tasks/T-040/playtest-evidence/qa-parallel-1bdc750/

**Two independent QA passes gated `task/T-040` concurrently this session**
against the same pinned HEAD (`1bdc750`) — a coordination gap worth naming so
it isn't repeated: the one that landed (`7649e27`, merged) is sound and I
independently reached the same `PASS` verdict, but my own pass turned up two
things worth folding in that the merged report doesn't carry, since my copy
of `reports/tasks/T-040/playtest.md` was overwritten in the shared worktree
before I could commit it (the worktree was pruned by the merge before I
noticed).

1. **SPRINT.md's Inbox currently has an ID collision: two unrelated entries
   are both numbered `I-040`** — the muzzle-flash/dark-panel RIG readability
   entry above (`feel`/S3) and the `?fixeddt`-scatters-the-control harness
   entry a few lines below it (`bug`/S2). Whoever triages next should
   renumber one.
2. **Strengthened evidence for the muzzle-flash/dark-panel entry** (whichever
   number it ends up with): a **lossless, non-video** PNG capture (not
   ffmpeg-extracted, so free of video-compression artifacts) at a **second,
   different in-level location** — an early, quiet moment with **no combat,
   no muzzle flash** (x≈11m, 0 kills, an unrelated attempt) — shows RIG
   blending into the *same* recurring dark hull-pillar architecture piece
   already seen in the entry's own `t20.6–21.2s` evidence, cropped to its true
   on-screen scale (140×70px of an 800px-tall viewport). This shows the
   effect is a genuine value clash between RIG's dark ink outline and that
   specific hull element, independent of combat VFX timing, and that it
   recurs at more than one point in the level rather than being a single
   unlucky frame. Also re-confirmed the same effect at a fresh combat moment
   (`t≈24.1s`, kills=6/hp=2, a 10fps montage across ~1.3s showing RIG readable
   for two frames then losing distinctness for roughly a second while
   passing the pillar). Files: `glance-quiet-{full,crop-6x,crop-1x-true-
   size}-pillar-recurrence.png`, `glance-t24.1s-{full,crop-4x}-pillar-
   occlusion.png`, `glance-t25.0-26.3s-montage-pillar-fade.png`, all under
   the evidence path above. Does not change any verdict — feel/readability,
   routed to the operator checkpoint queue, not a bug.

## I-041 | docs | S3 | repro: `git stash list` at repo root | evidence: reports/tasks/T-040/playtest.md §I-??? (triaged here)

Six stashes survive from lanes that have all merged and whose worktrees are
gone: `stash@{0}` (T-040, the uncommitted preload warm-up experiment the
playtest agent parked in order to gate the actually-committed `1bdc750` tree —
T-049 later built, measured and shipped that same idea properly), plus WIP
stashes on T-050, T-042, T-048, T-047 and T-038. Every one of them is inert:
the corresponding work is in `main`.

Why it is filed rather than swept: `git stash drop` is irreversible, six
stashes cost nothing, and the T-040 playtester's actual point was not "delete
these" but that **a worktree directory reused across lanes can present a
stray diff that a later agent mistakes for part of the branch under test** —
that agent said it nearly did. That hazard is real and now partly closed
(merged worktrees are pruned at merge time, so `.claude/worktrees/<id>` no
longer outlives its task). The stashes are listed here so nobody reads them
as pending work. If a future cycle wants them gone, that is an operator call,
not a tidy-up.

## I-042 | docs | S3 | repro: `git merge-base --is-ancestor <T-043 commit a2e6d97> 03b775e` → false, at T-044's HEAD 3cbc015 | evidence: reports/tasks/T-044/playtest.md; reports/tasks/T-044/build.md "Difficulty measurement"

T-044's committed difficulty-distribution numbers (the ceiling/floor read that
entry 19 routes to the operator) were measured entirely **before** T-043's
wasp aim-lock + squad-stagger landed in that branch. The base-vs-branch
terrain comparison itself is not confounded — the playtester confirmed both
arms predate T-043 — but the tree that actually merged combines T-044 terrain
WITH T-043 hostile behaviour for the first time, and nobody has
distribution-tested that combination. The numbers are honest as
**terrain-only, pre-T-043** evidence and must not be read as describing the
shipped build.

Fix direction: annotate every difficulty measurement with the hostile-behaviour
commit it was taken against, per LANE-BRIEF's "never inherit a measured number
across a change that could move it." Nothing is known broken — the playtester's
own fresh sanity batch found nothing — this is a provenance label, not a bug.

## I-043 | docs | S3 | repro: read `src/render/level.js:107-114` against `src/render/palette.js:295-307` and `src/config.js:742` on `main` | evidence: this Inbox entry; docs/decisions.md entry 14

`src/render/level.js`'s deck-shade comment is **stale and says the opposite of
what ships**: it calls the T-035 value ladder "`?shade=`, off by default" and
claims "SHADE_GAIN 0 makes every factor exactly 1.0, so the shipped build's
instance colors are unchanged bit for bit." Neither is true since decisions
entry 14. `CONFIG.shade.dose` is `0.5` and `palette.js:295-307` has it right —
"(absent) the approved dose", "With the ladder now on by default".

Found while verifying that the operator's own verdict ("C on the ladder feels
better, shade=0.5 the other is too dark") is actually in the shipped build. **It
is** — this is a comment defect only, zero runtime effect. Filed rather than
fixed in place because editing a runtime file outside a lane is against this
repo's own merge discipline, even for a comment. Fold it into whichever lane
next touches `level.js`.

## I-044 | bug | S2 | repro: measure the alpha channel of `assets/generated/backdrops/backdrop-limb-segment.png` on `main` vs `task/T-053` — main is 50.2% alpha=0 / 49.3% alpha=255 / 0.48% partial; T-053's is 0.0% / 100.0% / 0.00% | evidence: this entry; reports/tasks/T-051/review.md (root-cause section)

**T-053's regenerated backdrops stopped being cutouts.** The procedural raster
route bakes the background into the image, so all five plates are now fully
opaque rectangles where main's were silhouettes with half the image
transparent.

T-051 places these on **twelve quads at three depth tiers**, two per facet,
layered for parallax. That design requires transparency: a 100%-opaque plate
occludes everything behind it, so the mid and far tiers would never be visible
and every plate would read as a hard rectangle. Merging T-053 as-is silently
breaks the only lane that consumes its output.

**Why both lanes' gates missed it.** T-053's review APPROVE and playtest PASS
are both correct — they gated "zero effect on the shipped game," which is true
of that tree in isolation and stops being true the moment T-051 lands. The
integrator's brief said keep filenames and canvas dimensions stable and never
said keep the alpha semantics stable, so nothing was watching the property that
actually matters to the consumer. **Lesson for future asset lanes: name the
properties the CONSUMER depends on, not just the ones a file listing shows.**

Related and larger: T-051's reviewer established with PIL that even main's
plate is too hard-edged — 0.48% partial alpha — and that because the quad is a
flat camera-facing plane, `fog: true` tints the whole face uniformly rather
than softening its boundary. **No depth or fog tuning can make a hard alpha
cutout dissolve**; T-051's depth retune hides the seam behind box geometry
rather than closing its acceptance box. The dissolve must be authored into the
asset as a feathered silhouette edge. That is T-053's file, not T-051's, which
makes this one fix serving two lanes.

Fix direction: T-053 restores cutout alpha for the five backdrop plates with a
genuinely feathered receding edge (tens of pixels, not a 1px cut); T-051 writes
the spec for what its layering requires; hull tiles stay fully opaque, they are
tiled surface textures and want no alpha.

<!-- ===== T-051 BLOCKED ON T-053 (2026-08-02, integrator) =====

Both gates agree and both are right: durability, the asset-failure path and
perf all PASS; the single failing item is the acceptance box "far edge
dissolves into the fog color, proven by capture."

It is not fixable in this lane. Three independent measurements say so:
  - reviewer, via PIL: backdrop-limb-segment.png is ~99.5% pure 0/255 alpha,
    0.48% partial — an effectively hard cutout.
  - the lane, across all five plates: every one is >=98.2% exactly 0 or 255.
  - playtester, at the flagged position: a one-pixel-wide, ZERO-gradient step
    from plate tone straight to flat sky.

The constraint underneath: **a flat camera-facing quad's material can only
tint a pixel's COLOR toward the fog — it can never make an already-opaque
pixel transparent.** No depth, fog or tint tuning produces a dissolve. The
lane's depth retune (-13 -> -16/-21/-26) is a real improvement and hides the
seam wherever a box tile has mass, but it occludes rather than dissolves, and
the lane says so itself rather than claiming the box.

The fix is in the ASSET and belongs to T-053. T-051 has written the spec
(commit 2e36f90, build.md):
  1. a real alpha-cutout silhouette must survive — T-053's regenerated plates
     are currently 100% opaque, which would kill the three-tier layering
     outright (I-044);
  2. an 8-12 texel graduated ramp around the whole silhouette contour, sized
     from this task's own plateSize() math per tier and canvas;
  3. no render-side change needed — backdrop.js's alphaTest 0.02 + fog: true
     is already correct once the asset supplies the ramp.

UNBLOCKS when T-053 lands feathered cutout alpha. Then re-run T-051's gates
against the new plates; the depth retune and the feathering fix two different
problems and both are wanted. ===== -->

## I-045 | bug | S4 | repro: run `node tools/playtest/backdrop-capture.mjs` twice without `--out` against a tree with committed evidence in `reports/tasks/T-051/evidence/` | evidence: T-051's re-gate playtest report

`backdrop-capture.mjs`'s default `--out` is the shared `evidence/` root, so a
re-gate run silently overwrites the BUILD's own committed-intent screenshots
with the gate's fresh ones. It happened during T-051's re-gate: the playtester
caught it via `git status`, restored with `git checkout --`, and re-ran into
`evidence/regate/` instead. Nothing was lost.

Filed because the near-miss is the point. Committed evidence is the record of
what a lane claimed at the moment it claimed it; a tool whose default action
is to overwrite that record makes "the before/after pair proves X" unfalsifiable
after any later run. Every sibling capture tool in `tools/playtest/` should be
audited for the same default, not just this one.

Fix direction: default `--out` to a per-run subdirectory, or refuse to write
into a directory that has tracked files unless `--force` is passed.

## I-046 | art | S3 | repro: `node tools/assets/view.mjs assets/generated/backdrops/backdrop-crown-horizon.png` at true on-screen size, over the shipped game-teal background | evidence: T-053's re-gate playtest report

At true on-screen width (~1045px) over the actual game background,
`backdrop-crown-horizon`'s silhouette is legible but **low-contrast** — read
mainly through about five magenta spire-tip accents rather than through the
ridge shape itself. Over a magenta/checkerboard test field the same alpha data
resolves a sharp, detailed crenellated silhouette, so the shape is genuinely
authored and present; it is the VALUE contrast against the shipped sky that is
low, by design (the recipe caps every pixel at alpha 0.94 and the manifest note
says why: "no pixel fully opaque anywhere — it is the most distant thing in the
game").

So this is not a defect and not a bug: it is a deliberate art choice whose
result the operator has not seen judged at true size against the real
background. Routed as a look question, not a fix. It pairs with the backdrop
depth checkpoint already in the queue — if the plates end up more occluded than
visible, this plate in particular may never register at all.

## I-047 | docs | S4 | repro: `node tools/assets/check.mjs` and read the alpha census line for `vent-louver-plate` | evidence: T-053's re-gate playtest report

`vent-louver-plate` measures **5.35% transparent against the 5% cutout floor**
that `check.mjs`'s new alpha contract enforces. It passes, legitimately — but by
0.35 points, the thinnest margin of any asset in the set.

Recorded so the next regeneration of that plate is not surprised by a gate that
has always been green. The alpha contract is new (T-053) and this is the one
asset sitting close enough to its threshold that ordinary variation in a
repaint could cross it.

## T-054 | art | done | P1
goal: the hull texture is invisible in play — make it read. OPERATOR-FOUND, and
the observation was "the thing floating in the background seems to have more
detail, while that in the foreground has less." That is exactly backwards from
atmospheric perspective and it is measurably true.

MEASURED (same position, default vs `?tex=flat`, 300x90 hull band, mean
absolute neighbour-difference along rows = fine surface detail):

    default (textured)   mean 22.8   contrast sd 16.5   fine detail 0.61
    ?tex=flat            mean 25.4   contrast sd 17.7   fine detail 0.37

The texture delivers **0.24 luminance levels**. The deck checker beside it
delivers ~30 (`src/config.js:738-807` measures its delta at 11.9% of display
luminance). At 3x magnification the panel seams are barely present; at true
size they are gone. The operator could not tell the two builds apart, and
neither could the integrator without probing the scene graph.

ROOT CAUSE — two independently-correct fixes that cancelled:
  1. T-052 fixed a real 56% darkening with `grayscale()` then a brightness
     normalization toward TARGET_MEAN. Grayscale removes hue variation;
     normalizing the mean upward compresses the tile's range toward white.
     Both were right for the darkening and both cost contrast.
  2. T-053's procedural repaint took `hull-panel-tile` from 24 colours at
     sd 32.4 to 458 colours at sd 17.2 — smoother and better-formed, but
     lower contrast than the flat-vector tile it replaced.
Neither lane erred. The product is a texture with nothing left to see.

accept: fine detail in the hull band rises to a stated, measured target well
above the 0.37 flat-build floor, WITHOUT reintroducing the darkening T-052
closed (lower-hull mean must stay within ~10% of the `?tex=flat` control, and
the 3-band measurement — lower hull / deck / sky — goes in the report). The
hue-preservation property T-052's reviewer proved by construction (grayscale →
R=G=B → a multiply can only scale, never shift hue) must survive whatever
replaces it: if grayscale goes, prove hue is still preserved some other way, or
state plainly that it is not. Judged from captures at TRUE on-screen size and
at 3x, both committed.
owner: gameplay-engineer + asset-artist (this spans both layers)
fences: `src/render/materials.js`, `src/render/hulltiles.js`, `limb.js` for the
render half; `assets/generated/textures/**` + `tools/assets/**` for the asset
half. Coordinate — do not have both halves chase the same 0.24 independently.
verify: node tools/pathcheck.mjs; node tools/assets/check.mjs; the 3-band
luminance table and the fine-detail metric before/after; captures at true size

NOTE FOR WHOEVER TAKES THIS: normalizing the MEAN is not the same as
compressing the RANGE. A tile can be brought to the right average brightness
while keeping (or restoring) its own contrast — that is likely the whole fix on
the render side. On the asset side, the question is whether a tiled surface
texture wants the same smoothness a painted backdrop wants; the evidence here
says it does not.

## I-048 | bug | S1 | repro: read `tools/deploy/build-bundle.mjs:86` on `task/T-034` — `git archive --format=zip --output=… <ref> -- index.html src` — then count `git ls-files assets/generated | grep -c '\.png$'` on main (39) | evidence: this entry

**The deploy bundle would ship the game with none of its art, and nothing
would look wrong.**

`build-bundle.mjs` archives exactly `index.html` + `src/`. That was correct
when T-034 was written: the game shipped zero binary assets and the hard rule
was that it must boot with every file under `assets/` missing. Decisions entry
16 retired that rule on 2026-08-02, and main now loads **39 tracked PNGs** at
runtime — RIG's sprite, five hostile sprites, four hull tiles, five backdrop
plates and the rest.

**Why this is S1 and not S3:** entry 16's replacement condition is that a
failed or missing asset degrades visibly-and-safely and never wedges the game.
It works. Every asset falls back cleanly — RIG to canvas shapes, hostiles to
primitives, hull to flat material, backdrop to flat colour. So the uploaded
build would **run flawlessly and look exactly like the pre-2026-08-02
grey-box**, with no error, no console warning beyond a per-asset note, and
nothing for the player or the operator to notice. A silent, total loss of a
day's art, disguised as a working game. The safety property that makes the
game durable is precisely what makes this failure invisible.

Fix direction: add `assets` to the archive pathspec, and — this is the part
that matters — make the bundle's acceptance test *unzip it into a clean
directory, serve THAT, and assert the art actually renders*, rather than
asserting the zip contains files. A file-count check would have passed this
bundle every day since entry 16.

Also stale on that branch and worth correcting in the same pass:
`tools/deploy/README.md` §3 frames the CDN risk as fully open ("no fallback and
no visible error state today"), which T-032 closed before it merged — a blocked
CDN now raises the failure panel within ~250ms rather than showing a silent
black screen.

## T-055 | harness | done | P1
goal: revive T-034's deploy bundle against current main and fix I-048 — the
bundle omits `assets/`, so uploading it would silently ship a game with none of
its art. This is the path Fox actually receives the game by, so it is the last
thing that should be wrong.
accept: the bundle contains every runtime asset the shipped game loads; **the
falsifying test unzips the bundle into a clean directory, serves THAT, and
asserts the art renders** — RIG's sprite present (not the canvas fallback),
hostile sprites present (not primitives), hull textured, backdrop plates drawn
— rather than asserting the zip contains N files, which would have passed the
broken bundle every day since entry 16. Bundle size reported (the backdrops
alone are ~1.7MB; that is fine for a public URL, but state it). Subpath hosting
still works (T-034 proved this originally under a synthetic
`/html/999999/…` path — keep that test). Zero effect on the shipped game.
`tools/deploy/README.md` §3's CDN framing corrected: T-032 closed the
silent-blank-screen half before it merged, so a blocked CDN now raises the
failure panel in ~250ms.
owner: gameplay-engineer
note: `task/T-034` is unmerged and based on much older main (it predates every
art lane). Its three files are `tools/deploy/{README.md,build-bundle.mjs}` +
its build report, with **no `src/` changes**, so conflict risk is low — but
re-verify rather than inherit, and treat its "the game ships zero binary
assets" claims as historical.
verify: node tools/pathcheck.mjs; build the bundle, unzip to a clean dir, serve
it, capture the art rendering; report bundle size and file count

## T-056 | art | done | P2
UNBLOCKED 2026-08-02: T-054 merged. Note the collision I blocked this on never
materialized — T-054's final diff does not touch `src/render/limb.js` at all
(it landed entirely in `hulltiles.js`/`materials.js`). The block cost nothing
and was the right call on the information available, but record it: the fence
list in a dispatch is a PREDICTION of what a lane will touch, not a fact, and
this one over-predicted.
goal: land T-035b's fog-band reconciliation. Main ships two lanes' intent and
one lane's behaviour: `src/render/camera.js:80` selects
`CONFIG.limb.shadeFog` (26.5/54.5) whenever `SHADE_GAIN > 0`, which is the
default since the operator's approved dose of 0.5 — while T-045's backdrop
tiers were authored against `CONFIG.limb.fog` (24/52).
accept: T-035b measured the three variants on the merged tree and concluded the
band should be T-045's — the shift buys the ladder nothing (separation -34.5 vs
-34.7, noise), costs a point of dark share against the frame the operator
approved (5.8% vs 4.8% under L25.5), and drops each T-045 tier ~0.09 so the far
body carries 31% of its own contrast instead of the ~20% it was sized for.
Re-verify that measurement against CURRENT main before landing it — that
branch predates several merges. The operator's approved dose (0.5) must not
move; only the haze band does. Retiring `shadeFog` also retires the
out-of-fence `camera.js` line granted to T-035.
owner: gameplay-engineer
note: `task/T-035b` @ 204075b is unmerged, 4 files, 231+/104-. Its own report
flags one recorded LIMIT: at T-045's band the play band's screen-edge column
carries 3.3% haze at FAR / 4.6% at `?view=near`.
verify: node tools/pathcheck.mjs; the three-variant measurement re-run on
current main; captures at the approved dose

<!-- T-034 RETIRED, SUPERSEDED BY T-055 (2026-08-02, integrator).
T-034 built the itch.io deploy bundle and never merged; its branch sat unmerged
long enough that decisions entry 16 invalidated its central premise (the game
shipped zero binary assets when it was written). T-055 brought tools/deploy/
onto current main, fixed I-048, and added the falsifying render test T-034 had
no reason to need.

Its build report is preserved at reports/tasks/T-034/build.md — it carries the
original subpath-hosting verification and the CDN-behaviour measurements, which
are real evidence and were not re-derived by T-055. The branch itself is
retired; nothing else on it is wanted. -->

## I-049 | bug | S2 | repro: serve main, drive right at constant speed, compare consecutive frames in the lower-hull band (y 620-720) between the default build and `?tex=flat`, counting pixels whose luminance delta REVERSES sign frame-to-frame | evidence: this entry

**OPERATOR-FOUND: "a lot of flicker on the bottom portions."** He is right, it
is real, and it is texture aliasing rather than fog.

Measured on main at 3195/0, 8 frames captured while scrolling right, counting
high-amplitude pixels (|delta| > 6) that reverse direction between consecutive
frames — a pixel that reverses is shimmering, not translating:

    band          textured                    ?tex=flat
    lower hull    67,502 px  83.7% reversing  10,333 px  54.5%
    mid           146,537 px 82.6%            79,320 px  71.2%

**6.5x more shimmering pixels in the lower hull**, exactly where the operator
said. T-054 made the texture visible by correcting its density; the same
correction put high-frequency authored detail (panel lines, rivets) at a
minification ratio where it aliases.

MECHANISM, measured not guessed — probed the live scene graph:

    composed hull tile canvases:  104x216 and 104x104   powerOfTwo: FALSE
    generateMipmaps: true         anisotropy: 8         GPU max anisotropy: 16

Two concrete suspects, both cheap to test:

1. **The composed canvas is non-power-of-two.** A 104px canvas halves to
   52 -> 26 -> 13 -> 6.5, so the mip chain rounds at every level. The source
   tile is 128px, meaning the compositor also resamples 128 -> 104 at a
   non-integer ratio before any mip is built. Composing at a power-of-two size
   (128/256/512) makes the chain exact.
2. **Anisotropy is hardcoded to 8 while this GPU reports 16.** The FAR camera
   views the hull at a grazing angle, which is precisely where anisotropic
   filtering earns its keep. Read `renderer.capabilities.getMaxAnisotropy()`
   rather than pinning a constant — and note the backdrop plates and RIG's
   sprite are running at 4, with one sprite at 1.

**Do not fix this by making the texture invisible again.** T-054's density
correction is what the operator asked for and it measurably worked (near-hull
fine detail 0.416 -> 1.648 vs the flat control). The shimmer is a filtering
problem, not an argument for retreating to a smaller tile.

Note for the gate: the T-054 playtest brief explicitly asked for this — "a
texture that reads as noise or shimmers while the camera moves is worse than
flat... judge it moving" — and the gate passed it anyway. A still frame cannot
show shimmer, so the metric above (sign-reversal rate under motion, against
the lane's own escape hatch) belongs in the art-lane evidence standard.

## T-057 | art | done | P1
goal: kill the lower-hull shimmer (I-049) WITHOUT undoing T-054's density fix.
accept: sign-reversal shimmer rate in the lower-hull band (y 620-720), measured
under motion against the lane's own `?tex=flat` control, falls to near the flat
build's own level — currently 67,502 changing px at 83.7% reversing vs flat's
10,333 at 54.5%. Fine detail must STAY at T-054's level (near-hull 1.648 vs
flat 0.416); a fix that restores calm by making the texture invisible again is
a regression, not a fix, and the gate must be able to tell those apart.
Darkening must not return (hull mean within ~1.5% of the flat control).
owner: gameplay-engineer
fences: `src/render/hulltiles.js`, `src/render/materials.js`, plus a new
pathcheck domain appended LAST. NOT `limb.js`, NOT `config.js`/`camera.js`
(T-056 is in those right now).
verify: the shimmer metric before/after; the fine-detail metric before/after;
node tools/pathcheck.mjs; captures judged MOVING, not from stills

## I-049 — CORRECTED MEASUREMENT AND STATUS (2026-08-02, integrator)

**My original figure was a single sample and it was wrong.** I reported 67,502
shimmering px at 83.7% reversal, a 6.5x gap over `?tex=flat`, from ONE run
taken while a dozen agents were loading this machine. Decisions entry 19's own
discipline — report distributions, never a mean, never a single run — is a rule
I have been enforcing on lanes all day and did not apply to myself.

Re-measured properly, three interleaved rounds on a quiet machine, lower-hull
band under motion:

    condition            samples (3 rounds)          reversal rate
    main, textured       40,721 / 40,586 / 41,058    68.0 - 69.1%
    main, ?tex=flat       9,213 /  9,397 /  9,294    48.2 - 49.2%
    T-057 (aniso fix)    41,636 / 41,888 / 41,268    68.9 - 70.3%

Spread within a condition is 1-2%, so the metric is sound; it was the *single
sample* that was not. **The honest gap is 4.4x, not 6.5x.** The operator's
observation stands unchanged — the flicker is real and large.

**T-057 does not fix it.** Its anisotropy change (hardcoded 8 -> the GPU's
actual max) is correct on its own merits and costs nothing, but it moves the
shimmer metric by less than the noise floor, in the wrong direction if
anything. That lane reported this as a null result rather than claiming a win,
and it was right to.

**T-057 also killed my hypothesis, with evidence.** I proposed the composited
canvas being non-power-of-two as the likely mechanism. The lane built and
measured EIGHT variants of that idea; every one scored equal or worse, none
shipped. That is a real negative result and it is worth more than my guess was.

**What is still true and still unexplained:** a textured hull shimmers ~4.4x
more than the same hull flat, concentrated in the lower band, under motion
only. Fix directions not yet tried, cheapest first:
  1. **Distance-based texture fade** — attenuate map strength as a surface
     recedes, so near surfaces carry detail and far ones go flat. This is the
     standard production answer to minification aliasing, and it would ALSO
     address the operator's separate observation that the background reads as
     more detailed than the foreground, since it restores the atmospheric
     ordering directly.
  2. Reduce high-frequency content in the tile itself at authoring time — but
     carefully: this is the lever that, over-applied, produced the original
     invisibility (T-054).
  3. An explicit mip LOD bias toward blurrier levels under motion.

<!-- I-049 REMAINS OPEN AFTER T-057 (2026-08-02, integrator).

T-057 shipped a correct anisotropy fix, two real race fixes in its own rig,
and eight measured-and-rejected variants of my non-power-of-two hypothesis.
It did NOT reduce the shimmer, and it says so in its own report rather than
dressing a null result as a win.

The operator's finding therefore stands, with a corrected number: a textured
hull shimmers ~4.4x more than the same hull flat (40,788 vs 9,301 changing px
in the lower band under motion; 68% vs 48% direction-reversal rate), three
interleaved rounds, 1-2% spread within a condition.

Untried, in the order I would try them:
 1. DISTANCE-BASED TEXTURE FADE — attenuate map strength as a surface recedes.
    This is the standard production answer to minification aliasing AND it
    addresses the operator's separate observation that the background reads as
    more detailed than the foreground, because it restores the atmospheric
    ordering directly. One fix, two findings.
 2. Lower the tile's high-frequency content at authoring time — with care:
    over-applied, this is exactly what produced the original invisibility.
 3. An explicit mip LOD bias toward blurrier levels under motion.

NOT a fix: shrinking the tile back down. T-054's density correction is what
made the texture visible at all (near-hull fine detail 0.416 -> 1.648 vs the
flat control) and the operator asked for it. Any candidate must hold that
number while moving the shimmer one. -->

## I-050 | bug | S2 | repro: hold a port with any HTTP server, then run `node tools/deploy/verify-bundle.mjs` on that port — `waitForServer` accepts the 200 and the art checks pass against content the tool never served | evidence: T-055 review

**The bundle verifier can pass against the wrong bytes.** `verify-bundle.mjs`'s
`waitForServer` only checks that *something* answers 200 on the port — not that
the responder is the process it just spawned. T-055's reviewer hit this live: a
scratch port already held by a concurrent agent's server produced a **false
PASS**. A genuinely free port then reproduced correct red/green both ways, so
the shipped binding proof is real — but the tool that proves the itch.io bundle
contains its art can, under port contention, prove it about someone else's
tree.

This is S2 rather than S3 because of what it guards: I-048 was an S1 whose
whole signature was *invisible success* — a bundle that runs perfectly while
missing every asset. The verifier is the only thing standing between that
failure and an upload, and a false PASS is precisely the failure mode it exists
to prevent, reproduced one level up.

Fix direction: have the server emit a nonce (a unique token on a known path)
and have `waitForServer` require that token, not just a status code. Bind to
port 0 and read back the assigned port rather than guessing one. The same
pattern is worth auditing in every sibling rig that spawns a server — several
were written this cycle.

## I-051 | tooling | S3 | repro: `cd tools/playtest && node fogband-capture.mjs shots` on current main | evidence: T-056 playtest

`fogband-capture.mjs` throws immediately on the tree that ships it. Its
`SHIPPED_LINE` constant is the two-way `shadeFog`/`limb.fog` conditional that
T-056's own commit deletes from `camera.js`, so the rig cannot regenerate the
evidence it produced. It fails loudly rather than silently wrong, and has zero
effect on the shipped game — but a measurement rig that cannot be re-run has
become a historical artifact rather than a tool, and this project's evidence
standard leans on being able to re-derive numbers.

## I-052 | docs | S3 | repro: re-derive `probe()`/`factor()` from `t-035-value-ladder.mjs` at aspect 1.7778 vs the asserted 1.6 | evidence: T-056 playtest

T-056's recorded LIMIT — play-band screen-edge haze of 3.31% at FAR / 4.60% at
`?view=near` — is **16:10-only**. At 16:9 it is 4.21% / 5.60%, about a point
higher, and 16:9 is reachable: `main.js` tracks `camera.aspect` to the live
window, so a player's window shape decides which number applies. No visible
legibility cost was found at either. Either restate the LIMIT as "at 16:10" or
widen the assertion's aspect loop to match the S2(iii) assertion it replaced.

Related, same report: T-056's `build.md` sky-band table cannot be reproduced by
a single committed command — the reviewer got the exact numbers by combining
two committed conventions by hand. The figures are genuine; the citation path
is not. Worth a `--top` flag next time that method is reused.

## I-049 — A REAL LEAD, UNCHASED (2026-08-02, from T-057's report)

T-057 found one result it could not explain and could not pursue, and it is the
best lead on the operator's flicker that exists:

**Bumping hull/wall `copies` 3 -> 4 while holding `cellPx` fixed moved the
shimmer metric substantially worse — 7,804 -> 10,050 changing px — even though
the on-screen world-space density is provably unchanged** (guaranteed by
`worldPerTileCopy`'s own invariant, which pathcheck asserts).

Why that matters more than it looks: if the world-space size of a texel on
screen is identical and the shimmer still moves by 29%, then **the shimmer is
not purely a minification-ratio problem**. Something about how UVs are
distributed across instances changed. That points at `src/render/limb.js`'s
instanced UV assignment — which was fenced from T-057 this cycle, so it went
uninvestigated rather than unnoticed.

This reframes the fix directions already recorded above. Before reaching for a
distance-based fade (which treats the symptom), it is worth asking whether
neighbouring instances are sampling the tile at offsets that beat against each
other under motion — a per-instance UV or mip-selection artifact rather than a
filtering one. If so, the fade would mask it rather than fix it, and the real
repair would be cheaper and more correct.

Whoever takes this: `limb.js` is the file, the invariant to hold is T-054's
fine-detail gain (near-hull 1.648 vs the flat control's 0.416), and
`tools/playtest/hulltex-shimmer.mjs` is the rig — with the caveat that it is
bimodal across cold launches (~0.24% noise floor) and must be run as a
distribution over separate process launches, never one sample. Its headless
harness also runs SwiftShader, which reports a generic "WebKit" vendor string
and probably cannot validate anisotropic filtering at all, so a real-GPU check
belongs in any conclusion about filtering.

## PERFORMANCE AUDIT — baseline and findings (2026-08-04, operator-requested)

The operator reported the game "runs pretty sluggish at times" and attributed
it to concurrent playtests. Measured rather than accepted. **The steady state is
not slow; the hitches are real.** Everything T-058..T-064 below cites comes from
this one measurement session, and the numbers are stated with their environment
because most of them are machine-dependent and one of the conclusions is
explicitly that this machine cannot answer the question that matters most.

**Environment (read this before quoting any millisecond below).** Headless
system Chrome via the harness's own `playwright-core` (`channel: 'chrome'`),
viewport 1280x800 at `deviceScaleFactor: 2` -> drawing buffer 2880x1800
(pixelRatio 2.25, 5.18M px), post `active` with composer `samples: 2`,
`glRenderer` = `ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Max)`. Real GPU,
not SwiftShader — unlike the shimmer rig I-049 warns about. rAF is vsync-locked
at 120Hz here, so `fps: 120` means "no frame was late", never "this is the
ceiling"; `worstMs` and `over20ms` are the load-bearing fields, exactly as
`juice-stress.mjs`'s honesty note already says.

**Steady state, default six-face run, 100 seconds:** 143 draw calls, 192,636
triangles, direct draw 0.657ms, composed 0.757ms, of which the shadow pass is
0.16ms and the whole bloom chain 0.10-0.23ms. 120fps locked, `over20ms: 0` for
the entire run after the first six seconds. Under `juice-stress`-class load
(224 sparks, 72 fragments, saturated projectile pool) the CPU profile is still
**77.9% idle**. At **6x CDP CPU throttle** — a crude stand-in for a low-end
laptop's CPU, though NOT its GPU — the steady state still holds ~105fps.

**The hitches, which are what "sluggish at times" actually is:**

    when     worst frame (1x)   worst frame (6x throttle)
    t ~1s        100.1 ms            124.8 ms
    t ~6s         24.5 ms             58.4 ms

Both land exactly on resource first-use: `renderer.info.memory.geometries`
climbs 70 -> 132 and `info.programs` 50 -> 56 across the first ~18s of a run,
then plateaus. See T-059.

**No leak.** Six `resetGame()` cycles held flat at 673 scene nodes / 623 meshes
/ 224 materials / 49 textures / 55 programs; heap settled at ~51MB and stopped.
The pooling, the free-lists, the stamp-gated cull passes and the substepped
collision are all doing their job — this section is not a criticism of them.

**One caveat on coverage, stated rather than buried:** the bot stalled at a gate
around scrollX 75 in every long run, so the later defense phases, the Crown and
the finale were NEVER measured. The heaviest content in the game is unaudited.

**Method, for re-derivation** (the probes were scratchpad-only and are gone;
T-064 exists to fix that, and I-051 is the standing complaint about exactly this
failure mode). Each finding was produced by driving the shipped page with the
harness's browser and reading the game's own surfaces:
  - frame cost: `renderer.render` / `renderFrame()` in a loop bracketed by
    `gl.finish()`, and `renderer.info.reset()` before a single draw for
    PER-FRAME counters (`autoReset` is false — `post.js` owns the reset, so an
    unbracketed read accumulates and reports ~6,500 calls for a 143-call frame).
  - hitch attribution: sample `info.memory.geometries` / `info.programs` once a
    second and diff `info.programs[].cacheKey`; wrap `THREE.Object3D.prototype.add`
    to capture a stack per mesh added after boot.
  - material churn: trap `Material.version` with a `defineProperty` setter and
    record the stack — this is what named `renderObject` in T-058.
  - upload volume: diff `instanceMatrix.version` across N frames (note
    `BufferAttribute.needsUpdate` is a SETTER ONLY; reading it returns
    `undefined` and a probe that reads it silently reports zero).

## T-058 | art | done | P1

BLOCKED 2026-08-04 (tree, not doctrine): two of this task's fence files are
UNCOMMITTED in the operator's working tree right now — `src/render/fx.js` and
`src/render/bullets.js` are modified, and `src/render/action-vfx-runtime.js` is
untracked — by the concurrent action-vfx-v2 lane. A worktree branched from HEAD
would not contain those edits, so this lane would be written against a version
of `fx.js` that no longer exists and merged on top of work nobody reviewed
together. Unblocks the moment that lane commits or lands; nothing about the
finding itself is in doubt.

goal: stop paying three.js's double-sided-transparent TWO-PASS path on 69 live
materials. `renderObject` (three.module.js:30481/30485) draws any material with
`transparent: true` + `side: DoubleSide` + `forceSinglePass: false` twice per
frame AND sets `material.needsUpdate = true` on each pass, which forces a full
`getParameters()` + program-cache-key rebuild every frame, per material. That
re-resolution was the single largest non-idle CPU cost in BOTH profiles taken
(normal play and 200+ projectile stress), above every line of game code.
Measured: 30 sampled unnamed `MeshBasicMaterial`s took 13,440 version bumps in
120 frames. The fix is already house style in nine places
(`hostiles.js:944`, `capsules.js:391`, `meridian-defense-vfx.js:114` — which
carries the explanatory comment — plus six more); it was simply never applied
to the ~26 other `DoubleSide` sites, notably every `fx.js` pool (sparks,
flashes, rings, cores, vapor: 408-520) and several `bullets.js` pools.
accept:
- [x] every `transparent + DoubleSide` material in the shipped scene either
      carries `forceSinglePass: true`, or is `side: FrontSide`, or has a
      one-line comment naming the geometry that genuinely needs two-sided
      transparent sorting. A new pathcheck domain asserts the invariant by
      WALKING THE BUILT SCENE, not by grepping constructors — the grep passes
      today and the defect is live.
- [x] draw calls and triangles per composed frame fall, measured with
      `info.reset()` bracketing a single draw. Runtime A/B on the shipped tree
      measured **157 -> 131 calls (-17%), 192,650 -> 163,568 tris (-15%),
      0.678 -> 0.555ms (-18%)**; land within noise of that or explain the gap.
- [x] zero visual change, demonstrated not asserted: matched-frame captures at
      the same sim instant, per-pixel diff, on the six-face combat frame AND on
      a frame with sparks/flashes/fragments live. A quad that is only ever
      camera-facing cannot tell the difference; anything that CAN must be
      caught here rather than by the operator.
landed 2026-08-04: `materialSubmissionSnapshot()` walks the live built scene;
152+ flat transparent materials use one pass and the one closed additive shard
keeps a named two-pass exception. The shipped stress frame fell to 132/133
calls and ~162.5k triangles. `render-equivalence.mjs` compares frozen combat
and live-action frames both ways and gates deltas against same-frame render
noise; the final run passed with no visual delta beyond that noise.
owner: gameplay-engineer
fences: `src/render/fx.js`, `src/render/bullets.js`, `src/render/level.js`,
`src/render/capsules.js`, `src/render/atmosphere.js`,
`src/render/action-vfx-runtime.js`, plus a new pathcheck domain appended LAST.
Coordinate before touching `hostiles.js` or `juice.js` — inflight work is there.
verify: node tools/pathcheck.mjs; per-frame draw-call/triangle A/B; matched
frame diffs both ways

## T-059 | feature | done | P1

BLOCKED 2026-08-04 (tree, not doctrine): `src/render/hostiles.js` — where
`spawnedEnemyEcology` lives, the exact function this task prewarms — is
uncommitted in the working tree, as is `src/render/juice.js`, which wraps its
spawn bridge. Same unblock condition as T-058.

goal: kill the two measured mid-run hitches by pre-warming what the game
currently compiles and uploads on first sight. `spawnedEnemyEcology`
(`src/render/hostiles.js:1939`) builds two materials and two meshes per hostile
spawn, and the ecology geometries upload to the GPU on their first draw —
so the first appearance of each enemy variant costs a shader compile plus a
buffer upload, mid-play. Nothing in the tree calls `renderer.compile()` or
`compileAsync()`. `post.js` already establishes the pattern this needs
(`prewarmComposer()` + `gl.finish()` inside a bounded boot fence that
`main.js` cannot start frame one without); it was just never extended past the
composer.
accept:
- [ ] `info.memory.geometries` and `info.programs` are FLAT from the first
      played frame onward — sample once a second across a 60s run and assert no
      growth after boot. Today: geometries 70 -> 132, programs 50 -> 56 across
      the first ~18s.
- [x] the falsifying test is a frame-interval trace, not a boot assertion: no
      frame in the first 30s of a default run exceeds 20ms on an unthrottled
      machine, and none exceeds 33ms at 6x CDP CPU throttle. Today: 100.1ms and
      124.8ms respectively at t~1s, 24.5ms and 58.4ms at t~6s.
- [x] boot cost is bounded and reported. A prewarm that moves a 125ms hitch out
      of play and into a 3-second black boot has moved the defect, not fixed
      it — state the measured boot delta, and if it exceeds ~400ms, budget it
      the way `POST_BOOT_BUDGET_MS` is budgeted and fall through rather than
      hold the boot open.
- [x] degrades safely per entry 16: a prewarm that throws leaves the game
      booting and playing exactly as it does today.
landed 2026-08-04: boot mounts the immutable hostile pose inventory, compiles
the scene, draws the resident buffers through a 1x1 target, waits on the GPU,
then removes every temporary node. Normal boot warm cost measured 237-247ms;
the first 6s trace had 0 frames over 20ms (worst 17.6ms), and 6x CPU throttle
had 0 over 33ms (worst 17.7ms), replacing the measured 100-125ms hitches.
The strict memory counter is not literally flat: the first Diveclaw presenter
still registers three shared plane geometries during its first second, then
plateaus, with no frame hitch. At 6x throttle the 400ms warm fence deliberately
falls through and the direct renderer remains playable. This deviation is
named rather than hiding it behind a boot assertion; the actual hitch goal is
closed.
owner: gameplay-engineer
note: the warm pass must not violate the static-anatomy rule or leave a warm
mesh in the scene — build, draw once offscreen, remove. Verify `HB.snapshot()`
hostile counts are untouched at frame one.
verify: node tools/pathcheck.mjs; 60s geometry/program growth trace; frame
interval trace at 1x and 6x CPU throttle; boot-time before/after

## T-060 | investigation | done | P1

BLOCKED 2026-08-04 (operator, NOT the tree): this task touches no fence that is
dirty — it changes no runtime code at all. It is parked for two honest reasons.
(1) The operator opened this session as a review while stalled on usage and has
not released the loop to spend cycles; an investigation of this size is a
deliberate spend, not a spare-moment task. (2) Its acceptance needs a policy
that can drive Level 1 END TO END, and every long bot run in the audit above
stalled at a gate around scrollX 75 — so building that policy is a prerequisite
of the task, not a detail inside it. Release this one first if you want the loop
moving before the codex lane lands; it cannot collide with anything.

goal: settle whether RIG's jump is frame-rate dependent enough to matter, and
if so, what it costs a player at 60Hz. `update(dt)` runs a variable timestep
with semi-implicit Euler (`src/sim/player.js:388`), so the integration — not
the constants — decides the apex. CLAUDE.md freezes and asserts the jump
CONSTANTS; nothing asserts what a player actually gets. Measured on the shipped
sim via `?fixeddt=`, same input, everything else held:

    fixeddt    effective rate    apex Y
     4.000 ms      250 fps       5.6943
     8.333 ms      120 Hz        5.6642
    16.667 ms       60 Hz        5.6067
    33.333 ms       30 fps       5.4933
    50.000 ms    the dt clamp    5.3800

0.058 tiles between 120Hz and 60Hz; 0.31 tiles across the range. RIG is 1.9
tiles tall, so the 60/120 delta is ~3% of his own height. The dev machine is
120Hz. Fox's laptop is almost certainly 60Hz, and a struggling frame rate walks
further down that column. Collision is already substepped correctly
(`weapons.js:366`, `hostiles.js:623`, `ecology-tactics.js:167`) — this is the
integration only.
accept:
- [x] the finding is stated as REACHABILITY, not as apex height: drive the
      shipped sim headlessly at 16.667ms and at 8.333ms with a policy that uses
      every movement verb, over every authored gap, ledge and pocket in Level
      1, and report whether any target reachable at 120Hz is unreachable at
      60Hz (or at 33ms). An apex number is not evidence about play; a gap that
      closes is. If nothing closes, say so plainly and the finding downgrades.
- [x] a written recommendation in `docs/playtests/` with repro commands: fixed-
      step accumulator with render interpolation, internal substepping of the
      player integrator at a fixed rate, or accept-and-document. Include what
      each would cost in determinism, in existing pathcheck assertions, and in
      the frozen `?fixeddt` verification hook.
- [x] no gameplay change lands in this task. If a fix is warranted it becomes
      its own task with its own gates, because retuning the integrator changes
      every jump constant's meaning and those are frozen by hard rule.
landed 2026-08-04: the real Level 1 terrain-only policy clears all 17 gaps at
120Hz and 60Hz with no falls, but stalls at scroll 335 at 30Hz. The permanent
three-rate harness intentionally exits nonzero on that closure and the written
finding recommends accepting/documenting for the current 60fps target; a
fixed-step accumulator becomes its own task if the target laptop sustains only
30fps. No movement constants or runtime integration changed.
owner: gameplay-engineer
verify: node tools/pathcheck.mjs; the reachability sweep at 3 timesteps; the
written finding

## T-061 | art | done | P2

BLOCKED 2026-08-04 (operator, NOT the tree): `src/render/scene.js` and
`src/render/post.js` are both CLEAN, so this one could be built and gated today.
It is parked only because landing it means putting a runtime change on `main`
through `merge-task.sh` while another lane holds uncommitted work across
`src/render/` — a merge the operator has not asked for and cannot currently
review. Smallest of the seven; release it whenever the loop should move.

goal: stop allocating 4x MSAA on a canvas that cannot use it. Verified on the
shipped page with the composer active: `gl.getContextAttributes().antialias` is
`true` and `gl.getParameter(gl.SAMPLES)` on the default framebuffer reads **4**,
at 2880x1800 — while the composer resolves its OWN 2-sample target and the
canvas only ever receives OutputPass's full-screen quad. That is roughly 83MB
of framebuffer and a full-screen resolve every frame for zero visual benefit.
`post.js:260` already records that the canvas AA "only ever applied to the
canvas"; the conclusion was never carried back to `scene.js:20`.
accept:
- [x] with bloom ON, the default framebuffer reports `SAMPLES` 0 (or 1) — read
      from the live page, not inferred from the constructor argument.
- [x] with `?bloom=0`, canvas antialiasing is UNCHANGED from today. The direct
      path is the fallback the durability work depends on and it is the one
      path where canvas MSAA is doing real work.
- [x] matched-frame per-pixel diff with bloom on, before vs after, showing the
      composed image is byte-identical or explaining any delta.
- [x] while in here, evaluate `alpha: false` and `powerPreference:
      'high-performance'` on the same context and report measured deltas —
      land them only if they measure, and say so if they do not.
landed 2026-08-04: live context truth is `antialias:false, SAMPLES:0` with the
composer and `antialias:true, SAMPLES:4` on `?bloom=0`; `?canvasaa=1` recreates
the old double-AA context for the matched-frame proof. The M4 context offered
no measured reason to change alpha or request a power preference, so both stay
at their established defaults instead of adding speculative context policy.
owner: gameplay-engineer
note: `POST.on` is resolved in `post.js`, which imports `scene.js`; the flag
must be read from `QUERY` in `scene.js` rather than by importing upward. Do not
create a cycle to get at it.
fences: `src/render/scene.js`, `src/render/post.js`
verify: node tools/pathcheck.mjs; live `gl.getParameter(gl.SAMPLES)` on both
paths; matched-frame diff

## T-062 | feature | done | P3

BLOCKED 2026-08-04: same dirty fences as T-058 (`bullets.js`, `fx.js`), and it
should follow T-058 regardless — both rewrite the same submit path, and doing
them in one lane is one review instead of two conflicting ones.

goal: stop re-uploading instance buffers that did not change. `flush()`
(`src/render/bullets.js:1156`) marks `instanceMatrix.needsUpdate = true` on ~30
pools every frame unconditionally, live rows or not. Measured across the whole
scene during ordinary play with essentially no projectiles alive: **586.6 KB
re-uploaded per frame across 46 dirty buffers — 34.4 MB/s at 60fps.** Cheap on
this machine (`bufferSubData` ~0.03ms/frame) and P3 for that reason, but it is
pure waste and it is exactly the class of cost that scales worst on the target
device. Related and in scope: `fx.js:832-836` sets `mesh.count = live ?
POOL_MAX : 0`, so one live spark submits all 224 instances.
accept:
- [x] per-frame instance upload volume, measured by diffing
      `instanceMatrix.version` across 60 frames, falls to ~0 KB when no
      projectile or effect row moved, and is proportional to live rows when
      they do. Report the before/after KB figure.
- [x] projectile and effect rendering is unchanged: matched-frame captures with
      a saturated pool, plus the existing juice/bullet pathcheck domains green.
- [x] no dirty-flag bug: a slot that IS written always uploads. The falsifying
      test fires one shot per frame for 120 frames and asserts every one of
      them is visible on the frame it was spawned.
landed 2026-08-04: bullet matrices now upload only touched pools, retired rows
stop receiving hidden matrices every frame, and FX instance counts use the
live high-water mark. The permanent probe measures exactly 0 KB/frame while
paused versus the prior 586.6 KB/frame unconditional path; active play remains
proportional to rows touched. Projectile/action/destruction contracts are
25/25, 38/38, 19/19 and 17/17.
owner: gameplay-engineer
fences: `src/render/bullets.js`, `src/render/fx.js`
verify: node tools/pathcheck.mjs; upload-volume diff before/after; saturated
pool captures

## T-063 | feature | parked | P2

BLOCKED 2026-08-04: `src/main.js` (which owns the `HB.perf()` sampler this
controller reads) is uncommitted in the working tree. Sequencing reason too:
T-058 and T-059 both move the frame budget this controller reacts to, so tuning
its thresholds before they land would tune them against a frame that is about
to change. Its own acceptance also ends at an operator checkpoint.

goal: give the frame rate somewhere to go on a machine this session could not
test. `resolveRenderPixelRatio` lands on 2.25x -> 2880x1800 = 5.18M drawing
pixels, and the scene, the bloom mip chain and the output pass all run over it.
This machine is NOT fill-bound — rendering at pixel ratio 1 measured no faster
than 2.25 (0.725 vs 0.657ms, i.e. noise), because the frame is draw-call bound
here — so I cannot measure what this knob is worth on an Intel iGPU, and I am
not going to guess. What is certain is that it is the largest single lever
available if 60fps ever fails on Fox's laptop, and that entry 18 binds the
project to 60fps at 200+ live projectiles.
accept:
- [x] a resolution controller behind a flag, OFF by default, that steps the
      renderer pixel ratio down when frames go late and back up when they do
      not. It reads the sampler that already exists (`HB.perf()`'s `over20ms`
      ring, `src/main.js:606`) rather than adding a second clock.
- [x] hysteresis proven, not asserted: the falsifying test drives the page
      under injected load and asserts the ratio does not oscillate — no more
      than N changes in a 30s window, and never a change on consecutive
      seconds. A controller that pumps resolution up and down is more visible
      than the dropped frames it is fixing.
- [x] `composer.setPixelRatio` + `setSize` follow every step (`syncPostSize`
      already speaks these units) and the MSAA ceiling in
      `resolveRuntimeSamples` re-resolves at the new pixel count.
- [ ] measured evidence at three fixed ratios (1.0 / 1.5 / 2.25) on this rig:
      frame cost and a matched-frame capture at each, so the operator's
      checkpoint has real pictures to judge rather than a description.
- [x] the decision to ship it ON is the OPERATOR's, not the lane's — it trades
      sharpness for smoothness and entry 17 makes RIG's legibility at FAR the
      whole fantasy. Queue a checkpoint with the three captures.
ready 2026-08-04, parked at the named operator checkpoint: `?adaptive=1` is
opt-in. Two sustained bad windows step through supersample 0.80, bloom bypass,
and 1024 shadows; six good windows restore one rung at a time. The asymmetric
controller cannot change on adjacent windows and its pure falsifying gate
drives all three rungs down and back up. Fixed 1.0/1.5/2.25 judgement captures
remain the only unchecked acceptance item, so shipped/default presentation is
unchanged.
owner: gameplay-engineer
note: this is the one finding whose importance I could not measure. Say so in
the report rather than inheriting my framing.
verify: node tools/pathcheck.mjs; oscillation test under injected load; three
fixed-ratio captures + frame costs

## T-064 | harness | done | P2

BLOCKED 2026-08-04 (operator, NOT the tree): a new file under
`tools/playtest/` collides with nothing, and this task has zero effect on the
shipped game — it is the safest of the seven to run while the codex lane is
open. Parked only on the operator's go-ahead to spend cycles. If exactly one
task should be released first, the argument for this one is that it makes the
other six re-derivable instead of quoting a session whose probes are gone.

goal: land the performance probes this audit used, so its numbers can be
re-derived instead of quoted. Every figure in T-058..T-063 came from
throwaway scripts that no longer exist — the exact failure mode I-051 files
against `fogband-capture.mjs`, committed here by the integrator rather than
found in someone else's lane.
accept:
- [x] one committed rig (suggested `tools/playtest/perf-probe.mjs`, reusing
      `lib/isolated-browser.mjs` and `lib/server.mjs`) that reports, for a given
      URL and viewport: per-frame draw calls and triangles with correct
      `info.reset()` bracketing; direct vs composed vs shadowless frame cost
      with `gl.finish()` fences; geometry/program growth over time; instance
      upload volume; and the `glRenderer` string.
- [x] a `--throttle <n>` flag wiring CDP `Emulation.setCPUThrottlingRate`, and
      a `--profile` flag emitting the V8 self-time ranking by function and by
      file. Both are how the hitches above were attributed.
- [x] an honesty note in `tools/playtest/README.md` covering, at minimum: rAF
      is vsync-locked so `fps` cannot exceed the panel and `worstMs`/`over20ms`
      are the real signals; CPU throttling does not throttle the GPU; and
      `BufferAttribute.needsUpdate` is setter-only, so a probe that READS it
      reports zero and looks like a clean result.
- [x] zero effect on the shipped game.
owner: playtester
verify: node tools/pathcheck.mjs; run the rig on current main and reproduce the
baseline block above within noise

landed 2026-08-04: `perf-probe.mjs` owns an isolated server/browser and reports
correctly fenced draw paths, cadence, resource growth, instance upload volume,
context truth, built-scene material submission and optional V8 rankings. The
idle path is now a permanent final pathcheck domain rather than a scratchpad.

## T-065 | render | done | P1

goal: remove the opening-face population pop reported in the live Chrome
session, where frame zero showed a sparse flat strip and crossing the intro
boundary suddenly revealed the whole platform lattice and enemies.

root cause: `worldFacetAt()` treated the arbitrary `introTiles=24` content
boundary as if it were a physical fold. Render ownership therefore withheld
the coplanar first face until scroll crossed 24 even though the hull had not
turned.

landed 2026-08-04: intro and face one now share facet zero; only authored bend
coordinates advance render ownership. The future-facet contract still proves
zero around-the-corner leakage and now also asserts that frame one owns at
least the complete intro plus first face. Live Chrome restart at 0-1m showed
the dense first-face route immediately.

verify: node tools/pathcheck.mjs; restart the live preview before crossing 24m

## T-066 | harness | done | P1

goal: remove CDP/browser-event latency and sample-stop drift from static bot
playtests without weakening the real keyboard path.

landed 2026-08-05: `--deterministic` installs one immutable gameplay schedule
before navigation, maps timestamps to fixed-step ticks, drains edges through
the same canonical jump/hook/key semantics immediately before `update()`, and
freezes the simulation at the exact terminal tick. The page authors the event
ledger; retries restore held inputs as repeat edges; shell controls remain
real-browser-only and closed-loop policy remains explicitly external.

proof: three `mid-route.json` Chrome runs produced the same SHA-256 over final
sim state, outcome and all 26 ledger rows: tick 594, gameMs 9900.198,
x 55.649, scrollX 56.084655, one kill, two HP, zero falls. Every actual tick
equaled its scheduled tick; no page or console errors.

verify: node tools/pathcheck.mjs; run `mid-route.json --deterministic` three
times and compare final sim + ledger fingerprints
