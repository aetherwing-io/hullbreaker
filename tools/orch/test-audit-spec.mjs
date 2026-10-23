// test-audit-spec.mjs — T-108's HAND classification of the pathcheck suite.
//
// This file is data. tools/orch/test-census.mjs joins it with the mechanical
// call-site census (tools/orch/lib/callsites.mjs), the per-call-site runtime
// counts (tools/orch/evidence/callsite-counts.json) and the timing run, and
// writes tools/orch/test-audit.json. Nothing here is imported by the game or
// by the gate.
//
// THE RUBRIC (docs/proposals/2026-10-test-audit.md § "Classes"):
//   CORE            the subject is something a player would notice in the build
//                   it targets, or a hard rule (layer purity, determinism,
//                   frozen movement constants + their physical reasoning, the
//                   frozen FAR camera, ?hook=1 inert, static anatomy, palette
//                   tokens, safe asset degradation, boot/no page errors,
//                   reachability/no softlock, frame budget).
//   PURE-INVARIANT  a cheap, correct property of pure logic or authored data that
//                   any reasonable implementation keeps (continuity, clamping,
//                   monotonicity, schema integrity, fairness arithmetic,
//                   static reachability of AUTHORED geometry — which CLAUDE.md
//                   says is not evidence about play).
//   PIN             the subject is an implementation detail: source text / regex
//                   over code, call order inside a function body, a golden hash,
//                   an exact count, or an exact constant no decision protects.
//                   A PIN whose INTENT is a CORE property is marked `core` — it
//                   is a REWRITE candidate (replace with a behaviour test), not
//                   a plain deletion.
//   RETIRED         guards a superseded design; the note cites the entry.
//   TAUTOLOGY       cannot fail, or checks data against itself / against a
//                   stale or foreign result file / a checker's own printed count.
//   SLOW-ENV        needs a real browser or wall-clock timing; its verdict moves
//                   with host load.
//
// SCOPE is separate from class: `shipped` = the default six-face run (or the
// page shell) a player gets with no query string; `flag:<x>` = an opt-in fixture
// or prototype. A CORE assertion about a flag-only fixture is behaviour-level
// but does not guard what a player of the shipped game notices; the proposal
// keeps CORE∩shipped in the core gate and moves CORE∩flag to the deep suite.
//
// SITES (end of file): label-keyed entries for single call sites; they outrank
// ranges and survive line drift (test-census.mjs, SITE IDENTITY).
//
// RANGES: [fromLine, toLine, CLASS, note, marks?] — matched against each call
// site's START line (lib/callsites.mjs). Lines not covered by a SITES entry or a
// range take the domain's `default`. marks: 'core' (PIN/TAUTOLOGY with CORE
// intent), 'scope:shipped' / 'scope:flag:<x>' (overrides the domain scope),
// 'fixture' (asserts authored fixture data rather than the shipped run),
// 'split' (keep the property, drop its pinned conjuncts) and 'with:T-121' (goes
// with hook v1 / the zip corner, entry 25) — see the SITES header.
//
// VERDICT per domain says where the domain LIVES: CORE-GATE (fast gate), DEEP
// (optional suite), REWRITE (intent worth keeping, mechanism is a pin — replace
// with a behaviour test, then delete), DELETE (nothing kept), SPLIT (kept lines
// go to more than one tier). PIN/RETIRED/TAUTOLOGY lines inside a kept domain
// are still deleted line by line; test-census.mjs reports a verdict its own
// sites contradict.

export const DOMAINS = {
  'pathcheck-suite': {
    scope: 'shipped',
    mechanism: 'pure calls over CONFIG/src/pure + one child-process sim probe (FAIR-GAP)',
    verdict: 'SPLIT',
    default: 'PURE-INVARIANT',
    note: 'The best domain in the suite: the FAIR-GAP probe drives the real player loop at the scroll floor ' +
      'with its own negative control (and tools/gatecheck.mjs proves it can fail). Around it sit exact ' +
      'choreography timings, a golden level fingerprint and dare-wager fixture checks.',
    ranges: [
      [33, 118, 'PURE-INVARIANT', 'path/segment/heading/yaw/face-index arithmetic'],
      [124, 124, 'PIN', 'corner ritual total pinned to exactly 1100 ms; no decision protects the number'],
      [125, 126, 'PURE-INVARIANT', 'yaw delta is zero before the event'],
      [127, 130, 'PIN', 'exact wind-up/snap/hold values at exact milliseconds (220/350/770)'],
      [131, 132, 'PURE-INVARIANT', 'the ritual settles on the geometric 60-degree turn and clamps'],
      [136, 153, 'PIN', 'overshoot magnitudes (~1.4 deg) and flat-hold windows at exact ms'],
      [156, 157, 'PURE-INVARIANT', 'easeOutBack endpoints'],
      [161, 161, 'PIN', 'easeOutBack overshoot ~5%'],
      [165, 167, 'PIN', 'scroll frozen until exactly t=900; quadratic midpoint value'],
      [169, 170, 'PURE-INVARIANT', 'scroll returns to full speed and clamps'],
      [197, 197, 'PIN', 'wave sizes exactly 4..9'],
      [218, 220, 'PURE-INVARIANT', 'wave composition valid and escalating; lane mapping'],
      [227, 227, 'CORE', 'frozen movement constants (hard rule); NB it also pins scrollSpeed 4.3, which entry 11 names a lever, not a frozen constant'],
      [229, 239, 'CORE', 'jump tune frozen + the physical reasoning CLAUDE.md requires alongside it'],
      [242, 242, 'CORE', 'frozen FAR camera pose (entries 7/17) — pins numbers, not the framing'],
      [246, 246, 'PURE-INVARIANT', 'analytic RIG height bound (< 9% of screen)'],
      [248, 252, 'PIN', 'scroll-per-screen fraction, fog near/far 30/74, tracer radius 0.16, wasp radii 0.5/0.55 — no decision protects these'],
      [259, 305, 'PURE-INVARIANT', 'generator column invariants (gap width, landing strip, step height)'],
      [598, 601, 'CORE', 'FAIR-GAP probe boots the real player loop and saw every generated gap'],
      [608, 700, 'CORE', 'FAIR-GAP: every face-1 gap crossable at the SCROLL FLOOR, with speed meter + negative control (I-021/I-024)'],
      [702, 702, 'PIN', 'the first gap is still columns 29-31 at h=2 — pins generator output'],
      [704, 732, 'CORE', 'FAIR-GAP: first gap jumpable both ways, coyote grace, every gap crossable with the taught verbs'],
      [742, 769, 'PURE-INVARIANT', 'chunk variety, height band, flat corner aprons, catwalk cap'],
      [771, 771, 'PIN', 'Vertical Assault final apex pinned at 17'],
      [773, 773, 'PURE-INVARIANT', 'every catwalk within double-jump reach — static, authored-geometry reachability'],
      [782, 798, 'PIN', 'golden generator shape 583/90/79 and fingerprint 10d82694: fails on every intentional level change', ['core']],
      [805, 805, 'CORE', 'fixture build is deterministic (determinism hard rule)'],
      [807, 871, 'PURE-INVARIANT', 'traversal fixture schema / half-open solids / no mutation', ['fixture']],
      [874, 874, 'RETIRED', 'dare dead-end wall adhesion — the dare wager (entries 9/10; entry 21 names it)'],
      [884, 971, 'PURE-INVARIANT', 'traversal slice fixture: overhang, connectors, route graph, fork cap', ['fixture']],
      [982, 993, 'RETIRED', 'dare reward confined to its route + directed retreat path (dare wager, entries 9/10/21)'],
      [996, 996, 'PURE-INVARIANT', 'slice sprint inside its own declared target window', ['fixture']],
      [1002, 1002, 'RETIRED', 'dare entry margin covers the backtrack (dare wager, entries 9/10/21)'],
      [1018, 1038, 'PURE-INVARIANT', 'camera follow / look-ahead / portrait pullback arithmetic'],
    ],
  },

  'view-scale-experiment': {
    scope: 'flag:slice=traversal (+ ?view, hound/polyp trial stages)',
    mechanism: 'pure calls: closed-form fairness arithmetic + decision functions',
    verdict: 'SPLIT',
    default: 'PURE-INVARIANT',
    note: 'Closed-form fairness arithmetic tying hound/polyp tells to player physics, plus unit tests ' +
      'of the ledge/wall/assist/crouch decision functions. Cheap and correct. The domain is filed under the ' +
      'traversal slice, but the hound/polyp rows read the SHIPPED CONFIG.hound / CONFIG.polyp with the frozen ' +
      'six-face tune as their first row, and aim assist is on by default in the normal run: those ranges carry ' +
      'scope:shipped (invariant tier — M19 is caught there), as do the RIG screen fraction (76-82), the polyp ' +
      'ENEMY row (553) and the LOOK-row regex (559, rewrite). Fixture-only rows (paces, trial stages, crouch, ' +
      'traversal decisions) stay deep (review finding 5).',
    ranges: [
      [47, 52, 'PURE-INVARIANT', 'view-scale table shape'],
      [76, 82, 'CORE', 'analytic RIG screen fraction per view: near ~7%, far ~3.5-4% (concept-art invariant, entry 7/17) — analytic, not measured', ['scope:shipped']],
      [91, 101, 'PIN', 'slice tune ranges (apex 3-3.5, dwell budgets) — no decision protects the slice tune', ['fixture']],
      [314, 320, 'PIN', 'exactly one stage claims the exemption and it is stage 2; default composition is two wasps', ['fixture']],
      [553, 553, 'PURE-INVARIANT', 'sim ENEMY table carries the polyp as configured', ['scope:shipped']],
      // review finding 5: the hound/polyp fairness arithmetic reads the SHIPPED CONFIG.hound /
      // CONFIG.polyp (both spawn in the default lattice: src/pure/lattice.js, src/sim/spawner.js) and
      // its first tune row is the frozen six-face player tune, so these rows guard the shipped run
      [159, 186, 'PURE-INVARIANT', 'hound tell vs reaction cost, per tune — row one is the shipped normal tune', ['scope:shipped']],
      [217, 217, 'PURE-INVARIANT', 'the hound commit coil is a distinct final beat of the tell (shipped CONFIG.hound)', ['scope:shipped']],
      [224, 224, 'PURE-INVARIANT', 'tightest hound telegraph headroom across all tunes, the shipped one included', ['scope:shipped']],
      [243, 253, 'PURE-INVARIANT', 'shipped hound sweep / substep tunnelling / hit circle / no HP sponge / floor denied temporarily', ['scope:shipped']],
      [263, 269, 'PURE-INVARIANT', 'shipped i-frames vs the hound cycle (one pass costs one point; facetanking bounded)', ['scope:shipped']],
      [297, 297, 'PURE-INVARIANT', 'hound lane band reaches a full generator step below the plate', ['scope:shipped']],
      [565, 609, 'PURE-INVARIANT', 'shipped polyp rhythm, hit circle, sight march and tell vs the slowest escape, per tune (row one shipped)', ['scope:shipped']],
      [614, 633, 'PURE-INVARIANT', 'polyp beam/clamp pure functions the shipped sim uses', ['scope:shipped']],
      [792, 798, 'PURE-INVARIANT', 'the standing muzzle vs the shipped hound circle (the aim gap assist closes)', ['scope:shipped']],
      [832, 870, 'PURE-INVARIANT', 'aim assist (ON by default in the normal run, src/mode.js AIM_ASSIST_ENABLED) — pure cone/range/target tests', ['scope:shipped']],
      [559, 559, 'PIN', 'every ENEMY kind has a LOOK row — checked by regex over render/hostiles.js source', ['core', 'scope:shipped']],
      [954, 954, 'RETIRED', 'non-grabbable dare wall (dare wager, entries 9/10/21)'],
      [924, 953, 'PURE-INVARIANT', 'ledge probe decision function'],
      [968, 1034, 'PURE-INVARIANT', 'ledge/wall decision functions'],
    ],
  },

  'world-transitions': {
    scope: 'flag:slice=transform',
    mechanism: 'pure calls over the transform fixture + 3 regex guards over render/sim source',
    verdict: 'DEEP',
    default: 'PURE-INVARIANT',
    note: 'The opt-in ?slice=transform demo. Static-anatomy guards are the valuable part; the ritual is ' +
      'pinned to exact millisecond beats.',
    ranges: [
      [52, 155, 'PURE-INVARIANT', 'one static path: continuity, unit steps, exact detents, climbing grade, silhouettes', ['fixture']],
      [164, 164, 'CORE', 'no transition constant drives an assembly (static anatomy, entry 3)'],
      [175, 175, 'PIN', 'ritual total exactly 990 ms'],
      [176, 176, 'PURE-INVARIANT', 'ritual inside its 0.8-1.2 s budget'],
      [177, 202, 'PIN', 'beats at 90/250/550/690/810 ms, exact snap values, overshoot peaks'],
      [206, 236, 'PIN', 'scroll freeze / seam pull / resume ramp at exact values', ['fixture']],
      [226, 226, 'PURE-INVARIANT', 'the ritual never scrolls the world backwards'],
      [251, 373, 'PIN', 'cover / plate / vent choreography curves at exact beats (the sanctioned moving parts)', ['fixture']],
      [310, 314, 'PURE-INVARIANT', 'the plate never swings back past its settle; relocks flush and stays'],
      [382, 382, 'PURE-INVARIANT', 'a chamfer grants at most a stride of altitude'],
      [394, 394, 'CORE', 'no sim file reads the cover choreography (sim/render separation) — regex over sim source'],
      [400, 400, 'CORE', 'render/transform.js never calls assembly choreography (static anatomy, entry 3) — regex'],
      [402, 402, 'PIN', 'no debris system in the transition render (no decision forbids debris)'],
      [405, 406, 'PIN', 'atmosphere mix starts/ends at exact beats'],
      [407, 581, 'PURE-INVARIANT', 'fixture integrity, gate geometry order, reachability, ecology', ['fixture']],
      [524, 524, 'CORE', 'the fixture overrides no movement constant (frozen movement constants)'],
      [564, 564, 'PIN', 'ecology stays exactly as simple as authored'],
    ],
  },

  'g2-neck-access-plate-flip-gate': {
    scope: 'flag:g2=1 (lines 489-673: shipped six-face physics)',
    mechanism: 'pure calls over the G2 fixture; the tail drives the real sim player against synthetic platforms',
    verdict: 'SPLIT',
    default: 'PURE-INVARIANT',
    note: 'Two domains in one file. 57-468 defends an opt-in fixture and the greybox proposal\'s own numbers. ' +
      '489-673 is unrelated, shipped-run physics: tunneling budgets and a driven one-way-platform / discrete ' +
      'apex check — the most valuable lines here, mislabelled under "G2".',
    ranges: [
      [57, 79, 'CORE', 'G2 is opt-in: every shipped URL keeps v1 byte-identical'],
      [85, 95, 'PIN', 'the proposal\'s own numbers: halt 140 / pivot 154 / 14-tile apron / s119-161', ['fixture']],
      [99, 132, 'PURE-INVARIANT', 'gate ordering and pull arithmetic', ['fixture']],
      [142, 211, 'PURE-INVARIANT', 'G2 path/altitude/surfaces', ['fixture']],
      [178, 178, 'PIN', 'P2 starts at exactly the proposal +12 altitude', ['fixture']],
      [224, 226, 'PURE-INVARIANT', 'G2 gaps jumpable, landing strips', ['fixture']],
      [227, 227, 'CORE', 'the G2 fixture overrides no movement constant'],
      [242, 444, 'PURE-INVARIANT', 'routes, chimney, plate, connectors, pocket, hound placement', ['fixture']],
      [246, 246, 'PIN', 'all five proposal routes exist by name', ['fixture']],
      [294, 294, 'PIN', 'access plate is the proposal 10-12 tiles', ['fixture']],
      [309, 309, 'PIN', 'connectors near local y 3, 6 and 9', ['fixture']],
      [382, 385, 'PIN', 'ecology exactly as simple as authored; exactly one hound', ['fixture']],
      [455, 455, 'PIN', 'G2 event extra keys are exactly gate,haltOffset,plateRamp,seamPullTiles'],
      [464, 464, 'PURE-INVARIANT', 'G2 plate reuses the v1 flip curve bit-for-bit'],
      [468, 468, 'CORE', 'no sim file reads the render-only gate fields (sim/render separation; name-based regex)'],
      [489, 496, 'PURE-INVARIANT', 'ledge probe reach/overlap epsilon boundaries', ['scope:shipped']],
      [502, 531, 'PURE-INVARIANT', 'shipped ambient spawn table: sorted, corner-clear, in range, escalating density', ['scope:shipped']],
      [548, 548, 'PIN', 'main.js dt clamp has the exact Math.min(N, t - last) spelling', ['core', 'scope:shipped']],
      [555, 571, 'CORE', 'no configured speed or bullet substep crosses a tile in one clamped frame (anti-tunneling)', ['scope:shipped']],
      [602, 624, 'CORE', 'driven sim: fast fall lands on a one-way platform, rising passes through, 300 frames rest without chatter', ['scope:shipped']],
      [667, 668, 'PIN', 'discrete apex equals the documented 2.61 / 2.49 figures', ['scope:shipped']],
      [669, 673, 'CORE', 'driven sim: discrete single/double jump apex clears the lane offsets at the dt-clamp floor (movement envelope)', ['scope:shipped']],
    ],
  },

  'pacing-variants': {
    scope: 'flag:slice=traversal&pace=',
    mechanism: 'pure calls over the pace table',
    verdict: 'DEEP',
    default: 'PURE-INVARIANT',
    note: 'CP1 pace A/B for the traversal slice. Dare-pocket wager checks are retired; the tunneling budgets are the part worth keeping.',
    ranges: [
      [110, 123, 'RETIRED', 'dare retreat margin / pocket as a tighter wager per pace (dare wager, entries 9/10/21)'],
      [197, 199, 'RETIRED', 'pocket dead end vs overhang roof (dare wager, entries 9/10/21)'],
      [260, 260, 'PIN', 'every pace keeps apex/dwell/launch inside hand-picked ranges'],
      [285, 288, 'CORE', 'no pace (chain included) crosses a tile in one clamped frame (anti-tunneling) — reads the dt clamp from main.js source'],
    ],
  },

  'movement-verb-prototypes': {
    scope: 'flag:hook=1 / flow=1',
    mechanism: 'pure calls over hook/flow tables',
    verdict: 'SPLIT',
    default: 'RETIRED',
    note: 'Snap hook v1 was judged and rejected (entry 5: keep it inert). Only the "flags off is the shipped game" check guards a live rule; FLOW is still an unjudged experiment.',
    ranges: [
      [66, 66, 'CORE', '?hook/?flow off: every pace resolves exactly as shipped (?hook=1 must stay inert — CLAUDE.md)'],
      [86, 254, 'RETIRED', 'snap-hook anchors/tether/zip/whip mechanics (hook v1: rejected by entry 5, released for deletion by entry 25) — deleted with the feature by T-121; :86/:208/:212 are flow bounds (SITES)', ['with:T-121']],
      [169, 169, 'RETIRED', 'dare pocket cannot hook out (hook v1, entries 5/25; dare wager, entries 9/10) — deleted with the feature by T-121', ['with:T-121']],
      [260, 315, 'PURE-INVARIANT', 'FLOW momentum-chain arithmetic (?flow=1, unjudged experiment)'],
    ],
  },

  'authored-slope-rib-run': {
    scope: 'flag:slice=traversal&ribrun=1',
    mechanism: 'pure calls over the rib-run overlay',
    verdict: 'DEEP',
    default: 'PURE-INVARIANT',
    note: 'Analytic climbability of an opt-in rib-run overlay; the driven twin is the next domain.',
    ranges: [
      [49, 72, 'PURE-INVARIANT', 'overlay never touches the shipped fixture'],
      [126, 126, 'CORE', 'the rib run inherits the frozen tune untouched'],
      [251, 251, 'RETIRED', 'a single line has no dare pocket (dare wager, entries 9/10/21)'],
    ],
  },

  'rib-run-driven-through-real-sim': {
    scope: 'flag:slice=traversal&ribrun=1',
    mechanism: 'child process drives the real sim at 60 Hz / 30 Hz / dt-clamp floor',
    verdict: 'DEEP',
    default: 'CORE',
    note: 'A genuine behaviour test (hold right + jump climbs the whole rib at three frame rates) — of an opt-in prototype.',
    ranges: [
      [130, 130, 'PIN', 'pass duration inside a 4-12 s window'],
      [140, 144, 'PIN', 'average speed share and "never held still" thresholds'],
    ],
  },

  'headroom-over-every-authored-ground-run': {
    scope: 'flag:slice=traversal',
    mechanism: 'pure calls over authored ground',
    verdict: 'DEEP',
    default: 'PURE-INVARIANT',
    note: 'Static clearance of the traversal fixture.',
    ranges: [],
  },

  'pursuit-model': {
    scope: 'flag:slice=traversal&pace=',
    mechanism: 'pure step math',
    verdict: 'DEEP',
    default: 'PURE-INVARIANT',
    note: 'Pursuit-speed step math for the slice paces.',
    ranges: [[69, 69, 'RETIRED', 'entering the dare pocket drops the edge to pocketSpeed (dare wager, entries 9/10/21)']],
  },

  'hull-fallback-tier-1': {
    scope: 'shipped (fallback rule) + flag fixture data',
    mechanism: 'pure calls',
    verdict: 'CORE-GATE',
    default: 'PURE-INVARIANT',
    note: 'The fallback-target rule the shipped HULL FALLBACK uses.',
    ranges: [[48, 48, 'PURE-INVARIANT', 'every authored platform resolves to a lower route or the knock', ['fixture']]],
  },

  'charge-threat-prototype': {
    scope: 'shipped (score/overdrive is default) + slice tune',
    mechanism: 'pure calls over SCORE tables',
    verdict: 'SPLIT',
    default: 'PURE-INVARIANT',
    note: 'CHARGE/THREAT meter arithmetic. Several lines pin the proposal\'s exact table shape.',
    ranges: [
      [25, 25, 'TAUTOLOGY', 'SCORE === CONFIG.score — an alias of itself'],
      [29, 29, 'PIN', 'exactly two notches'],
      [61, 61, 'PIN', 'stall threshold equals the A.5 number exactly'],
      [89, 89, 'CORE', 'same event script, same notch timeline (determinism)'],
      [104, 104, 'PIN', 'notch glyphs never collide with hp pips — glyph table shape'],
      [147, 147, 'PIN', 'reclaim/link/launch windows and ring buffer equal the proposal values'],
    ],
  },

  'cp4-promotion-full-run-tune': {
    scope: 'shipped',
    mechanism: 'pure calls over SCORE_RUN / RUN_FALLBACK',
    verdict: 'SPLIT',
    default: 'PIN',
    note: 'Pins the run tune as "exactly the slice table halved" and the fallback as "exactly the slice values" — a retune must edit both tables and these lines, which is the definition of a pin. Keep the five pure lines (44-55, 67-71: the run tune is accepted, the fallback mercy chain is real) in the invariant tier; delete the rest.',
    ranges: [
      [44, 55, 'PURE-INVARIANT', 'the pure functions accept the run tune; WARM airborne kill worth the same THREAT; run horizon slower'],
      [67, 71, 'PURE-INVARIANT', 'fallback mercy chain is real; the shared fallback-target rule'],
    ],
  },

  'score-wiring-sim-layer': {
    scope: 'flag:slice=traversal&pace=surge&score=1',
    mechanism: 'child process drives sim/score.js',
    verdict: 'DEEP',
    default: 'CORE',
    note: 'Driven score emission rules (wall kick links, air jump never links) on the slice.',
    ranges: [[87, 87, 'PIN', 'A.5 envelope shipped verbatim for airborne_kill']],
  },

  'cp4-promotion-wiring-default-run-score': {
    scope: 'shipped',
    mechanism: 'child process drives the DEFAULT run sim',
    verdict: 'CORE-GATE',
    default: 'CORE',
    note: 'Driven: a lethal hit in the default run becomes a HULL FALLBACK, never a stop; the streak ceiling hands over to stock lives (no free fall loop).',
    ranges: [[128, 128, 'PIN', 'exact per-event pricing of the run tune']],
  },

  'snap-hook-driven-through-real-sim': {
    scope: 'flag:hook=1&flow=1',
    mechanism: 'child process drives the real sim with ?hook=1&flow=1',
    verdict: 'SPLIT',
    default: 'RETIRED',
    note: 'Sections 1-3 prove the rejected hook v1 works when armed (entry 5; entry 25 releases it for deletion): those 14 sites go WITH the feature (T-121). Section 4 drives the live, unjudged ?flow=1 momentum chain into the damage plane (no-clip, no grind, terminal pocket, dislodging setback): 7 sites, CORE/PURE-INVARIANT on a flag, DEEP — T-121 must keep that child section running when it removes the hook imports (review finding 3). Every site is label-keyed in SITES.',
    ranges: [],
  },

  'damage-plane-never-leaves-geometry-behind': {
    scope: 'shipped',
    mechanism: 'drives the real sim against a real step in the shipped level',
    verdict: 'CORE-GATE',
    default: 'CORE',
    note: 'No-softlock / no-clip: a plane-pinned player never ends a frame inside terrain and the pin resolves within an hp bar.',
    ranges: [[45, 45, 'PURE-INVARIANT', 'the shipped level contains a step to pin against (precondition)']],
  },

  'hull-fallback-cannot-pay-itself': {
    scope: 'flag:slice=traversal',
    mechanism: 'child process drives the fixture sim',
    verdict: 'DEEP',
    default: 'CORE',
    note: 'Driven: a zero-input run cannot reset the fallback streak with conveyed displacement (a real exploit, I-0xx).',
    ranges: [],
  },

  'g1-limb-read-tower-bend-cull': {
    scope: 'shipped',
    mechanism: 'pure calls over the limb bake plan + bend boundaries; 2 regex guards',
    verdict: 'SPLIT',
    default: 'PURE-INVARIANT',
    note: 'Static-anatomy plan invariants and the bend cull ("bullets don\'t turn corners" is entry 7 canon).',
    ranges: [
      [41, 48, 'PURE-INVARIANT', 'the bake fills the opening frustum and stays behind the combat plane'],
      [54, 54, 'CORE', 'the bake plan is deterministic'],
      [57, 61, 'CORE', 'pure/limb.js takes no time/rng argument; render/limb.js installs no view hook (static anatomy, entry 3) — regex over source'],
      [102, 102, 'PIN', 'facet 0 is the untinted reference tone'],
      [153, 199, 'CORE', 'bend cull: a shot never crosses a bend, both directions, no substep skips a boundary (entry 7: bullets don\'t turn corners)'],
    ],
  },

  'bend-cull-driven-through-real-bullet': {
    scope: 'shipped',
    mechanism: 'child process drives the real bullet loop',
    verdict: 'CORE-GATE',
    default: 'CORE',
    note: 'Driven twin of the bend cull, with a positive control (the same bolt still kills on this side of the bend).',
    ranges: [],
  },

  'g1-1-render-only-proved-sim': {
    scope: 'shipped',
    mechanism: 'two child processes (default vs ?zip=1) compared frame by frame',
    verdict: 'CORE-GATE',
    default: 'CORE',
    note: 'A render-only flag cannot change the simulation — the shape every "art may fail, gameplay may not change" claim (entry 16) should take — and, as two processes compared frame by frame, the only killer of M05 (Math.random in the sim). Its flag is ?zip=1, which entry 25 deletes (T-121): an unknown query is ignored, so the test keeps passing as a two-process determinism check; re-point it at a surviving render-only switch (e.g. ?limbs=legacy) and relabel it rather than deleting it, or land §7.4 #7 first.',
    ranges: [],
  },

  't-002-ritual-decision-trace-frame': {
    scope: 'shipped (palette rule; the twin-run determinism check uses ?slice=transform)',
    mechanism: 'child process drives the transform slice twice; pure palette tables; palette literal scan',
    verdict: 'SPLIT',
    default: 'PURE-INVARIANT',
    note: 'Twin-run determinism (byte-identical input -> bit-identical sim) is the CORE part; the palette hue-family checks guard the concept-art colour roles at token level.',
    ranges: [
      [118, 136, 'CORE', 'driven: the ritual decision trace orders halt/trigger/arm/start'],
      [156, 162, 'CORE', 'driven twin runs: byte-identical frame input -> bit-identical simulation (determinism)'],
      [173, 177, 'PURE-INVARIANT', '?palette resolution'],
      [198, 199, 'PURE-INVARIANT', 'classic palette is byte-faithful to CONFIG (the A/B instrument)'],
      [305, 308, 'CORE', 'no scattered CONFIG.palette reads / raw colour literals in tokenized render files (palette hard rule)'],
      [313, 313, 'PIN', 'scene background and fog built from the same token — regex over scene.js'],
    ],
  },

  't-003-far-view-legibility-compensation': {
    scope: 'shipped',
    mechanism: 'pure legibility arithmetic + source scans',
    verdict: 'SPLIT',
    default: 'PURE-INVARIANT',
    note: 'Analytic: the FAR capsule letter falls under the legibility floor without compensation (the negative control) and clears it with. Several lines re-derive previously measured pixel figures.',
    ranges: [
      [81, 83, 'PIN', 'arithmetic reproduces the previously measured 7.0 / 5.0 / 3.7 % RIG fractions'],
      [84, 84, 'CORE', 'the FAR default keeps RIG inside the 3-5 % invariant (entry 7 is law) — analytic'],
      [88, 88, 'PIN', 'reproduces T-015\'s measured 9.6 px capsule'],
      [169, 172, 'PIN', 'legibility.js imports only config/mode and is Node-safe (harness convenience, not a hard rule)'],
      [178, 183, 'PIN', 'no readability gain on damage volumes; capsule box authored at sim size — regex over render source', ['core']],
      [188, 188, 'CORE', 'sim/pure layers do not know the pass exists (name scan; sim/render separation)'],
    ],
  },

  't-012-audio-layer-static-guards': {
    scope: 'shipped',
    mechanism: 'regex over ui/audio.js, main.js and sim files',
    verdict: 'SPLIT',
    default: 'PIN',
    note: 'Import-shape and call-count pins on the audio module. The one real rule (sim imports nothing upward) is already enforced by _context.mjs guardLayer before any domain runs. Keep the snap-impact ordering lines (79-82) in the invariant tier; delete the rest.',
    ranges: [
      [56, 56, 'PIN', 'the word "audio" never appears in a sim file (name scan; the import rule is already guardLayer\'s)'],
      [79, 82, 'PURE-INVARIANT', 'snap impact frames are ordered inside the ritual'],
    ],
  },

  't-014-spore-mortar': {
    scope: 'flag:mortar= trial stages (the ENEMY row at line 47 is shipped)',
    mechanism: 'pure fairness arithmetic over mortar/hound/polyp constants',
    verdict: 'SPLIT',
    default: 'PURE-INVARIANT',
    note: 'Telegraph-vs-answer fairness for the mortar. Correct and cheap; mostly about opt-in trial stages. The shipped ENEMY row (47) goes to the invariant tier; the trial-stage lines are deep.',
    ranges: [
      [47, 47, 'PURE-INVARIANT', 'sim ENEMY table carries the mortar as configured', ['scope:shipped']],
      [155, 160, 'PIN', 'the trial is exactly teach-then-combo; exactly one mortar', ['fixture']],
      [193, 193, 'CORE', 'no ?mortar=: every plan is byte-identical to today (opt-in stays inert)'],
      [209, 209, 'PIN', 'fields exactly one mortar', ['fixture']],
      [283, 283, 'PIN', 'exactly one authored connector inside the denial', ['fixture']],
      [294, 298, 'PIN', 'combo is exactly two enemies, mortar + hound', ['fixture']],
    ],
  },

  't-011-juice-feedback-pass': {
    scope: 'shipped',
    mechanism: 'pure juice math + regex over render/sim/main source',
    verdict: 'SPLIT',
    default: 'PURE-INVARIANT',
    note: 'Hit-stop / shake / crush-warning math is solid pure-invariant work (a freeze can only slow a frame; stacked freezes are capped). The back half pins frame-loop wiring by regex.',
    ranges: [
      [48, 57, 'PURE-INVARIANT', 'CONFIG.juice schema: one block per effect, every burst spec valid (count/speed/ms/size > 0, finite gravity), pools sized for four simultaneous deaths — validity, not exact constants (DELETE-bucket spot check, review pass)'],
      [245, 245, 'CORE', 'bursts are seeded and never touch the sim rng stream (determinism)'],
      [272, 277, 'PIN', 'crush-warning signage removed / telemetry zero — regex'],
      [283, 283, 'TAUTOLOGY', 'sim imports no render module — already enforced by _context.mjs guardLayer (exits before any domain), so this line can never be the one that fails'],
      [286, 286, 'PIN', 'sim/time.js owns the hit-stop decision — regex'],
      [288, 288, 'CORE', 'no render module can write the hit-stop clock (render must not write sim state)'],
      [291, 336, 'PIN', 'frame-loop wiring order spelled by regex (hit-stop sampled once, CHRONO composition, shake after pose)', ['core']],
      [340, 342, 'CORE', 'juice modules carry no colour literals; roles resolve from PAL (palette hard rule)'],
      [348, 357, 'PIN', 'import existence, wrapper order, ?juice=0 kill flag'],
      [363, 379, 'PIN', 'pool allocation shape (free-stack pop) — regex', ['core']],
    ],
  },

  't-013-game-shell': {
    scope: 'shipped',
    mechanism: 'pure shell data/intent functions + regex over shell/main/index.html',
    verdict: 'SPLIT',
    default: 'PURE-INVARIANT',
    note: 'Keyboard intent routing and stats formatting are good pure tests — and every one assumes a keyboard. Nothing here, or anywhere in the suite, looks at the title on a touch device or at a phone viewport.',
    ranges: [
      [35, 39, 'PIN', 'board 05 offers exactly three directions in board order; middle panel is default'],
      [41, 44, 'PIN', 'start screen inside an 8-colour budget; every colour role is a literal hex'],
      [65, 65, 'PURE-INVARIANT', 'title composition keeps RIG at 3-5 % (visual invariant, composition data)'],
      [134, 189, 'PURE-INVARIANT', 'keyboard intent routing (keyboard stays supported, entry 20) — no touch equivalent exists'],
      [249, 250, 'PIN', 'shell imports nothing from render (ui/ importing render is not a hard rule)'],
      [266, 270, 'PIN', 'sanctioned sim read surface / shell never drives the run — regex'],
      [273, 273, 'PIN', 'the word "shell" never appears in a sim file (name scan)'],
      [278, 278, 'PIN', 'index.html names title-meridian-ascent-v1.webp'],
      [283, 283, 'PURE-INVARIANT', 'title key art under a 200 kB mobile delivery ceiling (statSync)'],
      [287, 315, 'PIN', 'markup/CSS/overlay ordering by regex'],
      [320, 336, 'PIN', 'auto-start, ?shell=0, title keypress not consumed / never also restarts — regex over main.js', ['core']],
    ],
  },

  't-009-six-face-lattice': {
    scope: 'shipped',
    mechanism: 'pure lattice build + 3 regex checks',
    verdict: 'SPLIT',
    default: 'PURE-INVARIANT',
    note: 'Route density 3-5 (a concept-art invariant) and static reachability of the shipped lattice. CLAUDE.md is explicit that authored-geometry reachability is not evidence about play; the driven twins are t-009-whole-run-crossable-driven and t-009-pocket-route-works-driven.',
    ranges: [
      [69, 69, 'CORE', 'the lattice is deterministic across builds'],
      [87, 91, 'PIN', 'one pocket per face; built pockets are exactly the authored sites'],
      [161, 161, 'PIN', 'every pocket chasm is exactly N columns'],
      [169, 169, 'PIN', 'shelf sits exactly one generator tier over its mid lane'],
      [241, 251, 'PIN', 'pickup sphere / bob / body-box / spawn — regex over sim source', ['core']],
    ],
  },

  't-009-static-anatomy-reveal-default': {
    scope: 'shipped',
    mechanism: 'child process resolves mode flags + regex',
    verdict: 'SPLIT',
    default: 'PIN',
    note: 'Static anatomy is the default corner (entry 3) — kept; the rest pins that the retired zipper is still installed.',
    ranges: [
      [47, 47, 'CORE', 'the default six-face run renders the static limb with no flag (entry 3, entry 16)'],
      [53, 53, 'PURE-INVARIANT', 'fixtures keep their own transitions'],
      [63, 63, 'CORE', 'the default reveal cannot be animated (static anatomy, entry 3) — regex'],
    ],
  },

  't-009-houndframe-stations-six-face': {
    scope: 'shipped',
    mechanism: 'pure spawn-table build',
    verdict: 'CORE-GATE',
    default: 'PURE-INVARIANT',
    note: 'Station placement fairness on the shipped lattice (catwalk answer within one jump, outside gate arenas).',
    ranges: [
      [33, 38, 'PIN', 'one station per face from N on, on consecutive faces'],
      [85, 85, 'PIN', 'spawn table built from the run\'s own level — regex'],
    ],
  },

  't-009-non-gating-station-cannot': {
    scope: 'shipped',
    mechanism: 'drives the gate runtime',
    verdict: 'CORE-GATE',
    default: 'CORE',
    note: 'Softlock guard: a non-gating station cannot hold a cleared wave gate shut, with a positive control.',
    ranges: [],
  },

  't-009-whole-run-crossable-driven': {
    scope: 'shipped',
    mechanism: 'child process drives the whole six-face run with a held-jump policy',
    verdict: 'CORE-GATE',
    default: 'CORE',
    note: 'The single most important assertion family in the suite: the shipped run is crossable end to end by a simple policy, and no pocket swallows it.',
    ranges: [],
  },

  't-009-pocket-route-works-driven': {
    scope: 'shipped',
    mechanism: 'child process drives the pocket climb at every pocket',
    verdict: 'CORE-GATE',
    default: 'CORE',
    note: 'Reward reachability proved by play, the exact lesson of entry 10.',
    ranges: [],
  },

  't-018-bot-harness-relative-geometry': {
    scope: 'harness',
    mechanism: 'pure calls into tools/playtest/lib + regex over harness and sim source',
    verdict: 'DEEP',
    default: 'PURE-INVARIANT',
    note: 'Self-tests of the playtest instrument (grammar, threat rays, script lint). Worth keeping with the harness, not in the game gate.',
    ranges: [
      [136, 144, 'PIN', 'computeAim exists; aim is the discrete h/v pair; probes read groundH — regex'],
      [211, 219, 'PIN', 'wave 2 is exactly five slots with lane mix low/mid/low/mid/high'],
    ],
  },

  't-027-bot-harness-deterministic-dispatch': {
    scope: 'harness',
    mechanism: 'pure calls into the harness',
    verdict: 'DEEP',
    default: 'PURE-INVARIANT',
    note: 'Harness honesty: a deterministic run that never dispatched is FATAL.',
    ranges: [[80, 85, 'PIN', 'immutable timeline install / tap settlement — regex over harness source']],
  },

  't-025-harness-may-not-report': {
    scope: 'harness',
    mechanism: 'pure calls into the harness report builder + regex',
    verdict: 'DEEP',
    default: 'PURE-INVARIANT',
    note: 'Harness honesty: reports may not claim what the run did not do (I-006/I-013/I-026).',
    ranges: [[50, 63, 'PIN', 'fixture.mjs imports no game source; sampler whitelists fields; main.js publishes hp/lives — regex']],
  },

  'momentum-earned-pace-escalation': {
    scope: 'shipped',
    mechanism: 'pure momentum math + child processes driving the six-face scroll',
    verdict: 'SPLIT',
    default: 'PURE-INVARIANT',
    note: 'Entry 11 made pace escalate at the player\'s momentum; the WIRING block drives the shipped scroll and proves a struggling player is carried at the floor while a good one escalates.',
    ranges: [
      [277, 277, 'CORE', 'the escalation curve is a pure function (determinism)'],
      [283, 283, 'CORE', 'momentum/pace read no wall clock or unseeded random (determinism hard rule) — regex'],
      [286, 286, 'PIN', 'momentum module has no elapsed-time/face input — signature regex'],
      [439, 541, 'CORE', 'WIRING: driven six-face scroll — floor carried exactly, earned escalation, mercy window, determinism at 30/60 Hz, ceiling'],
      [549, 551, 'PIN', 'live scroll speed leaves through momentumClampSpeed — regex', ['core']],
    ],
  },

  't-029-runtime-truth-three-debug': {
    scope: 'harness/telemetry',
    mechanism: 'regex over main.js/audio.js/hud + one child process',
    verdict: 'DEEP',
    default: 'PIN',
    note: 'Debug/telemetry surfaces the harness reads. Useful to the instrument, invisible to a player.',
    ranges: [
      [97, 104, 'PURE-INVARIANT', 'fixture turn counts chain in band order'],
      [130, 142, 'PURE-INVARIANT', 'speed inversion saturates; tier equals HUD glyphs'],
      [192, 207, 'PURE-INVARIANT', 'driven: published drive/peakDrive are live and reset per run (instrument truth)'],
    ],
  },

  'pathcheck-suite-2': {
    scope: 'shipped',
    mechanism: 'pure fault policy + regex over index.html / main.js / ui/failsafe.js',
    verdict: 'SPLIT',
    default: 'PIN',
    note: 'T-032 durability. The pure fault policy is good. The rest spells the frame loop and the inline bootstrap by regex — and line 146 REQUIRES the keyboard-only recovery copy ("Press R, or click the button") that is wrong on a phone.',
    ranges: [
      [49, 119, 'PURE-INVARIANT', 'fault-streak policy: one bad frame never costs a run; storms restart bounded times then stop legibly'],
      [133, 133, 'PURE-INVARIANT', 'every failure kind has a title, explanation and way back'],
      [142, 142, 'PURE-INVARIANT', 'every player-facing failure line passes the plain-language rule'],
      [146, 146, 'RETIRED', 'panel must name "R" and "button" — the keyboard-only device assumption entry 20 superseded; it pins the touch-device copy defect'],
      [149, 158, 'PURE-INVARIANT', 'not-your-fault copy; the plain-language rule can fail'],
      [174, 174, 'PURE-INVARIANT', 'the inline failsafe handler parses (new Function)'],
      [263, 269, 'PIN', 'dt clamp spelled Math.min(N, t - last) / Math.max(0, Math.min(50, ...)) in main.js', ['core']],
      [231, 256, 'PIN', 'frame loop structure (halt check first, rAF before work, try/catch around update and draw) by regex', ['core']],
    ],
  },

  't-041-impact-language': {
    scope: 'shipped',
    mechanism: 'pure stretch math + regex',
    verdict: 'CORE-GATE',
    default: 'PURE-INVARIANT',
    note: 'Bullet travel-stretch bounds (drawn nose never claims reach the sim did not give).',
    ranges: [
      [47, 50, 'PIN', 'the REJECTED lifetime bound reproduces its old measured smear'],
      [133, 137, 'PIN', 'bullets.js never uses legibility gains — regex', ['core']],
    ],
  },

  't-043-wasp-aim-lock-squad': {
    scope: 'shipped',
    mechanism: 'pure dive math + child processes driving wasps',
    verdict: 'CORE-GATE',
    default: 'CORE',
    note: 'Driven: a wasp shows its committed dive pose and does not move until the lock elapses; a squad staggers. A fairness tell a player sees.',
    ranges: [
      [47, 58, 'PURE-INVARIANT', 'diveVelocity / lock / stagger pure helpers'],
      [65, 69, 'PURE-INVARIANT', 'aim-lock covers a buffered jump\'s reaction cost'],
    ],
  },

  't-039-contact-shadows': {
    scope: 'shipped',
    mechanism: 'pure contact-shadow math + regex over contact.js/hostiles.js/capsules.js',
    verdict: 'SPLIT',
    default: 'PURE-INVARIANT',
    note: 'Surface-selection and falloff math is a clean pure test. The back half is regex.',
    ranges: [
      [167, 172, 'CORE', 'shadow colour through the palette token; no raw literal (palette hard rule)'],
      [175, 175, 'CORE', 'contact.js has no randomness or wall-clock read (determinism)'],
      [190, 194, 'PIN', '?shadow= default-on flag shape; no opt-in branch survives'],
      [213, 213, 'PIN', 'every ENEMY kind has a footprint radius — table parsed from source', ['core']],
    ],
  },

  'pathcheck-suite-3': {
    scope: 'shipped',
    mechanism: 'pure limb/backdrop plan arithmetic + regex',
    verdict: 'SPLIT',
    default: 'PURE-INVARIANT',
    note: 'Scale cues (door-sized doors, climbable ladders) and play-band clearance — entry 17 "sell the scale" at plan level.',
    ranges: [
      [121, 121, 'PIN', 'still exactly the joint buttress and cup'],
      [206, 221, 'PIN', 'material buckets parsed from render/limb.js; no new draw call', ['core']],
      [224, 231, 'PIN', '?scale=0 escape hatch shape'],
      [236, 238, 'CORE', 'the scale pass bake has no clock/rng and is deterministic'],
    ],
  },

  't-035-value-ladder': {
    scope: 'shipped',
    mechanism: 'pure shade bake arithmetic + regex over limb.js/level.js/camera.js',
    verdict: 'SPLIT',
    default: 'PURE-INVARIANT',
    note: 'Entry 14 approved the half dose. Luminance-ladder arithmetic is measured on the bake plan, not on pixels; several lines restate "LIMIT" numbers as assertions.',
    ranges: [
      [67, 67, 'CORE', 'shipped dose is the operator-approved 0.5 (entry 14)'],
      [70, 91, 'PURE-INVARIANT', '?shade= resolution, escape hatch exact, default is the approved dose'],
      [99, 104, 'CORE', 'shade.js draws randomness only through the seeded rng and takes no time argument (determinism / static anatomy)'],
      [113, 113, 'CORE', 'same seed, identical arrays (determinism)'],
      [142, 142, 'PIN', 'the limb material map was parsed out of the shipped renderer source'],
      [194, 194, 'PIN', 'LIMIT restated as an assertion: share of instances below 0.55x at the shipped dose'],
      [261, 268, 'PIN', 'LIMIT restated as assertions at the shipped dose'],
      [292, 292, 'PIN', 'asserts a property is NOT true on the shipped default (documents a gap as a gate)'],
      [321, 329, 'PIN', 'exactly one InstancedMesh per material; one tile InstancedMesh; reused scratch Color — regex', ['core']],
      [377, 391, 'PIN', 'haze band pinned at 24/52; camera.js selects it under IS_G1 — regex'],
      [429, 429, 'PIN', 'LIMIT restated as an assertion (play-band edge haze)'],
    ],
  },

  't-038-seam-pips': {
    scope: 'shipped',
    mechanism: 'pure seam-run arithmetic + regex over render/seams.js',
    verdict: 'SPLIT',
    default: 'PURE-INVARIANT',
    note: 'A pip can never advertise a ledge that does not exist — a real, cheap invariant. The render half is regex.',
    ranges: [
      [78, 78, 'PIN', 'the shipped level bakes N housed fixtures'],
      [117, 123, 'CORE', 'pure/seams.js has no time/rng argument; render/seams.js installs no view hook and reads no clock (static anatomy) — regex'],
      [131, 137, 'CORE', 'no scattered CONFIG.palette reads; no raw colour literal (palette hard rule)'],
      [147, 166, 'PIN', 'material flags (fog:true), pool names, flag resolution — regex'],
      [181, 181, 'PIN', 'slot < housing < spill brightness order'],
    ],
  },

  't-047-light-rig': {
    scope: 'shipped',
    mechanism: 'pure light-rig arithmetic (lightrig.js is Node-safe) + regex',
    verdict: 'SPLIT',
    default: 'PURE-INVARIANT',
    note: 'Entry 18 authorised shadows/tone mapping; the irradiance-ranking arithmetic (deck brightest on every face, entry 14 no re-darkening) is plan-level, not pixels.',
    ranges: [
      [43, 49, 'PURE-INVARIANT', '?light= resolution; shadows ON in the shipped rig (entry 16/18)'],
      [63, 74, 'PIN', 'the flat escape-hatch rig is "scene.js line 26-27 verbatim": HemisphereLight(…, 1.1), DirectionalLight(…, 1.6) at (6,12,8)'],
      [151, 154, 'CORE', 'the deck is brighter than it shipped; nothing re-darkens (entry 14 / entry 18 condition)'],
      [188, 191, 'PIN', 'shadow texel size / one 2048 map'],
      [201, 201, 'PIN', 'acne/peter-panning trim values'],
      [252, 255, 'CORE', 'render rig reads no clock (static anatomy) and has no unseeded randomness'],
      [258, 258, 'CORE', 'no raw colour literal in light modules (palette hard rule)'],
      [263, 263, 'PIN', 'lightrig.js free of three.js/DOM (harness convenience)'],
      [290, 307, 'PIN', 'lights.js is the ONLY light constructor; enrollment hooks Object3D.prototype.add; aim order — regex', ['core']],
    ],
  },

  't-048-post-pass': {
    scope: 'shipped',
    mechanism: 'pure tone-map/post arithmetic + regex over post.js/materials.js/main.js',
    verdict: 'SPLIT',
    default: 'PURE-INVARIANT',
    note: 'The tone-map round trip and "a failed composer retires itself" intent are good; the draw-path checks are regex.',
    ranges: [
      [36, 56, 'PURE-INVARIANT', '?bloom/?aa resolution; ON by default (entry 16/18)'],
      [178, 200, 'PIN', 'addons loaded dynamically; renderFrame is the one draw; composer throw retires it — regex', ['core']],
      [205, 225, 'PIN', 'status published on read channels; postGain wiring; fx.js reads once per frame — regex'],
      [237, 239, 'CORE', 'post.js / materials.js hold no raw colour literal (palette hard rule)'],
      [242, 246, 'PIN', 'environment built from the rig\'s own tokens; generated not fetched — regex', ['core']],
    ],
  },

  't-042-audio-punch': {
    scope: 'shipped',
    mechanism: 'regex over ui/audio.js + child processes driving the real audio module against a fake AudioContext',
    verdict: 'SPLIT',
    default: 'PURE-INVARIANT',
    note: 'The fake-AudioContext children are real behaviour tests of the mix (voice cap, prio, ducking). The unlock test fires a KEYDOWN only — iOS Safari (entry 20) unlocks on a touch gesture, which nothing tests.',
    ranges: [
      [56, 110, 'PIN', 'recipe/prio/import shapes by regex over ui/audio.js'],
      [270, 270, 'CORE', 'a real keydown unlocks audio (keyboard only — no touch/pointer gesture is tested)'],
      [273, 465, 'PURE-INVARIANT', 'driven mix behaviour: voice cap holds, prio bypasses load scaling, ducks compose, pressure curve tracks the visual haze'],
    ],
  },

  't-050-shipped-plan-carries-the-scale-pass': {
    scope: 'shipped',
    mechanism: 'pure limb plan over the real level + regex',
    verdict: 'SPLIT',
    default: 'PURE-INVARIANT',
    note: 'I-037: the shipped plan really carries the scale pass. Plan-level, not pixels.',
    ranges: [
      [82, 86, 'PIN', '?scale=0 is smaller by a floor of 200 pieces / is exactly the pre-T-045 build'],
      [143, 156, 'PIN', 'renderer bakes from the real level; HB.g1.pieces published; verify-served compares — regex'],
    ],
  },

  't-040-rig-sprite': {
    scope: 'shipped',
    mechanism: 'pure RIG sprite/envelope data + regex over render/player.js and sim/player.js',
    verdict: 'SPLIT',
    default: 'PURE-INVARIANT',
    note: 'Guards that RIG\'s drawn envelope stays inside the frozen collision box. It asserts the gun geometry equals its own exported constants — nothing checks that the weapon sits in RIG\'s hands in the rendered sprite (entry 20 defect "guns don\'t align to hands").',
    ranges: [
      [55, 57, 'CORE', 'sprite body equals the frozen collision width/height (frozen movement constants)'],
      [110, 111, 'TAUTOLOGY', 'gun inner/outer x "matches the exported constant" — the value is computed from that constant'],
      [112, 112, 'PIN', 'gun reach at horizontal aim is exactly the packet\'s 0.825'],
      [143, 143, 'PURE-INVARIANT', 'RIG_SPRITE_PATH resolves to a file that exists'],
      [156, 220, 'PIN', 'player.js consumes tables / atlas UV planes / preload gate registration order — regex', ['core']],
      [230, 230, 'CORE', 'sim/player.js never references the sprite/fallback split (sim cannot branch on asset load, entry 16)'],
      [244, 260, 'PURE-INVARIANT', 'RIG value ladder tokens (bright > mid > dark, desaturated)'],
      [271, 280, 'PIN', 'exactly five construction sites / ten meshes / at most six draws — regex', ['core']],
    ],
  },

  't-044-corner-setpieces': {
    scope: 'shipped',
    mechanism: 'pure lattice data + child process driving the six-face run',
    verdict: 'SPLIT',
    default: 'PURE-INVARIANT',
    note: 'Arrival/arena set pieces: static placement checks plus a driven terrain proof (held-jump policy crosses the lattice with the set pieces installed).',
    ranges: [
      [77, 81, 'PIN', 'exactly one ARRIVAL/ARENA per face 2-6'],
      [96, 96, 'RETIRED', 'ARRIVAL ends before the pocket "the fork/dare territory T-021 owns" (dare wager framing, entries 9/10)'],
      [118, 118, 'PIN', 'arena tier count escalates exactly 1,2,3,3,3'],
      [126, 126, 'PIN', 'arena tier widths 7-N tiles'],
      [234, 242, 'CORE', 'driven: the six-face run with set pieces installed is crossable end to end and reaches the outro'],
    ],
  },

  't-049-hostile-sprites': {
    scope: 'shipped',
    mechanism: 'pure sprite-table data + PNG decode of shipped art + regex over preload.js/sprites.js',
    verdict: 'SPLIT',
    default: 'PURE-INVARIANT',
    note: 'Entry 16\'s "sim never branches on whether art loaded" is CORE. The safe-degradation behaviour (error callback -> fallback, no T-032 panel) is asserted by regex here; the behavioural version lives in tools/playtest/sprite-fallback-check.mjs, which no gate runs.',
    ranges: [
      [89, 101, 'CORE', 'sim/pure layers never name the sprite/load path (sim cannot branch on asset load, entry 16)'],
      [111, 111, 'PIN', 'sprite-table.js stays Node-safe (harness convenience)'],
      [123, 126, 'PURE-INVARIANT', 'runtime WebPs exist; five gameplay atlases under a 1.5 MB mobile ceiling'],
      [134, 254, 'PIN', 'loader construction site, top-level await, initTexture upload, budget equality, warm-up readback — regex', ['core']],
      [258, 284, 'PIN', 'late texture disposed; error callback routes to fallback; try/catch; missing art never raises the panel — regex', ['core']],
      [294, 305, 'PURE-INVARIANT', 'recorded canvas/ink boxes match the decoded files'],
      [324, 376, 'PURE-INVARIANT', 'drawn ink inside the primitive envelope; feet on mount lines; nose never past contactRadius'],
      [381, 400, 'PURE-INVARIANT', 'sprites ON by default (entry 16) with ?sprites=0 hatch; ?spritevar resolution'],
    ],
  },

  't-052-hull-texture': {
    scope: 'shipped',
    mechanism: 'pure hulltiles arithmetic + PNG reads + regex over limb.js/materials.js',
    verdict: 'SPLIT',
    default: 'PURE-INVARIANT',
    note: 'Texture repeat arithmetic. Per the LANE-BRIEF "bound is not visible" lesson, none of this measures whether the texture is visible.',
    ranges: [
      [64, 64, 'PIN', 'hulltiles.js stays Node-safe (harness convenience)'],
      [157, 171, 'PIN', 'exact 256x256 tile, 20-colour budget, exact grid'],
      [183, 236, 'PIN', 'SURFACE_FOR / MATERIAL_FOR / finishHullTex tables parsed from source; bakeLimb call shapes — regex'],
    ],
  },

  't-051-backdrop': {
    scope: 'shipped',
    mechanism: 'pure backdrop placement arithmetic + PNG reads + regex',
    verdict: 'SPLIT',
    default: 'PURE-INVARIANT',
    note: 'Play-band clearance fence for backdrop plates is a real readability invariant (plan-level).',
    ranges: [
      [104, 104, 'PIN', 'clearance margin is "deliberately small"'],
      [161, 166, 'PURE-INVARIANT', 'backdrop ON by default (entry 16), ?backdrop=flat hatch'],
      [179, 237, 'PIN', 'loader/gate/await/import-edge shapes — regex', ['core']],
      [251, 251, 'CORE', 'sim/pure layers cannot tell whether the backdrop loaded (entry 16)'],
    ],
  },

  't-054-hull-contrast': {
    scope: 'shipped',
    mechanism: 'pure texture compositing over decoded PNGs',
    verdict: 'CORE-GATE',
    default: 'PURE-INVARIANT',
    note: 'Measures the composited tile\'s contrast in linear light — the closest the suite gets to "is the detail visible", still pre-raster.',
    ranges: [
      [69, 72, 'PIN', 'tile lands at its declared span / above 80 CSS px'],
    ],
  },

  't-057-hull-shimmer': {
    scope: 'shipped',
    mechanism: 'regex over materials.js',
    verdict: 'DELETE',
    default: 'PIN',
    note: 'Pins the anisotropy call sites and "still 3x3 copies, still non-power-of-two" — implementation shape.',
    ranges: [],
  },

  'fold-handoff-player-ownership': {
    scope: 'shipped',
    mechanism: 'pure corner/fold functions + regex over wavegate/player/scroll/render',
    verdict: 'SPLIT',
    default: 'PURE-INVARIANT',
    note: 'The corner-turn ownership rules (entry 20 "turns don\'t quite work right") are asserted on pure functions with the regression\'s own constants; nothing drives a real turn in a browser or through the full sim frame loop.',
    ranges: [
      [26, 26, 'PIN', 'the regression exercises the configured halt/bend'],
      [113, 128, 'PIN', 'live player/scroll/render compose the corner rules — regex over sim and render source', ['core']],
    ],
  },

  'future-facet-render-ownership': {
    scope: 'shipped',
    mechanism: 'pure route-visibility functions + regex over render modules',
    verdict: 'SPLIT',
    default: 'PURE-INVARIANT',
    note: 'Future-face rows stay invisible before the turn — a static-anatomy reveal invariant on pure ownership functions. :37 is the behavioural conclusion (CORE, review finding 1); :89 keeps its laterVisible conjunct (SPLIT). T-102 edits this domain.',
    ranges: [
      [87, 87, 'PIN', 'handoff pinned to the live 690->1100 ms interval'],
      [108, 131, 'PIN', 'render modules wire the ownership gate — regex', ['core']],
    ],
  },

  'mod-route-visibility': {
    scope: 'shipped',
    mechanism: 'regex over render/mods.js',
    verdict: 'DELETE',
    default: 'PIN',
    note: 'Three regexes that spell exact statement sequences (`cm.visible = false; if (!p || !routeRenderable(p.x)) continue;`). Any reformat fails them; a logic bug elsewhere passes them.',
    ranges: [],
  },

  'limb-fold-bridge-locality': {
    scope: 'shipped',
    mechanism: 'pure fold-bridge predicate over the real plan + regex',
    verdict: 'SPLIT',
    default: 'PURE-INVARIANT',
    note: 'Bend-local bridge pieces only — a reveal invariant.',
    ranges: [
      [37, 37, 'PIN', 'exactly four bend-local incoming pieces, not all 73'],
      [62, 62, 'PIN', 'exactly six seam pieces survive'],
      [68, 71, 'PIN', 'behindFold uses the predicate; old exemption absent — regex'],
    ],
  },

  'catwalk-built-prefix-visibility': {
    scope: 'shipped',
    mechanism: 'extracts render/level.js platformBuildSegments() SOURCE and evals it in Node; regex',
    verdict: 'SPLIT',
    default: 'PIN',
    note: 'Tests real render arithmetic by extracting the function text and eval-ing it — clever, but a refactor that splits the function breaks the extraction.',
    ranges: [
      [41, 44, 'PURE-INVARIANT', 'the extracted splitter appends half-open segments in sim-column order'],
      [67, 67, 'PIN', 'handoff pinned at exactly 690 ms and a specific face-3 shelf'],
      [71, 79, 'PURE-INVARIANT', 'partial prefix drawn exactly at the frontier; fractional ends gap-free'],
      [91, 108, 'PIN', 'geometry-row and draw-gate statements spelled by regex', ['core']],
    ],
  },

  'vertical-assault-geometry': {
    scope: 'shipped',
    mechanism: 'pure Vertical Assault data',
    verdict: 'CORE-GATE',
    default: 'PURE-INVARIANT',
    note: 'Six-face geometry contract (3-5 routes, drop/recovery lane, ladders join walkable surfaces, gate apron free). Static.',
    ranges: [
      [24, 24, 'CORE', 'same config, byte-stable assault geometry (determinism)'],
      [41, 44, 'PIN', 'preserves named arena/pocket ids'],
      [62, 62, 'PIN', 'play-space span escalates exactly 10 -> 15 tiles'],
      [84, 84, 'PIN', 'frozen ladder schema'],
    ],
  },

  'gate-prelude-runtime': {
    scope: 'shipped',
    mechanism: 'fresh child processes driving wavegate/scroll/hostiles',
    verdict: 'CORE-GATE',
    default: 'CORE',
    note: 'Driven softlock guard: gate state always has a visible or entering gating body; a prelude kill is not repopulated.',
    ranges: [
      [95, 95, 'PIN', 'attack readiness follows the authored three-beat cohort score'],
      [168, 180, 'PURE-INVARIANT', 'CONTAIN authors two Iris bodies flanking its socket'],
    ],
  },

  'capsule-reliquary-contract': {
    scope: 'shipped',
    mechanism: 'spawns tools/capsule-reliquary-check.mjs (a regex "fast source contract") and greps its printed count',
    verdict: 'DELETE',
    default: 'PIN',
    note: 'Wrapper: line 1 = the checker exits 0 (the checker is regex over capsules.js); line 2 = its stdout says exactly "27 focused contracts".',
    ranges: [[21, 21, 'TAUTOLOGY', 'greps the checker\'s own printed count — adding a contract fails it, weakening one does not']],
  },

  'projectile-presentation-contract': {
    scope: 'shipped',
    mechanism: 'spawns four checkers and greps their printed counts',
    verdict: 'SPLIT',
    default: 'PIN',
    note: 'projectile-terminal-check and cindermouth-ground-fire-check drive the real bullet loop (behaviour); projectile-presentation and destruction-flourish are mostly regex/alpha proxies.',
    ranges: [
      [24, 24, 'PIN', 'presentation checker exits 0 (regex + alpha proxy)'],
      [26, 26, 'TAUTOLOGY', 'greps "25/25 contracts passed"'],
      [34, 34, 'CORE', 'real bullet loop terminal-reason contract exits 0'],
      [36, 36, 'TAUTOLOGY', 'greps "19/19 contracts passed"'],
      [44, 44, 'CORE', 'Cindermouth deck-transformation regression (driven) exits 0'],
      [46, 46, 'TAUTOLOGY', 'greps "36/36 contracts passed"'],
      [54, 54, 'PIN', 'destruction flourish checker exits 0 (regex-heavy)'],
      [56, 56, 'TAUTOLOGY', 'greps "17/17 contracts passed"'],
    ],
  },

  'limb-silhouette-production': {
    scope: 'shipped',
    mechanism: 'regex over render/limb.js + pure plan',
    verdict: 'SPLIT',
    default: 'PIN',
    note: '16 of 19 call sites are regex over the renderer\'s source.',
    ranges: [
      [35, 35, 'PURE-INVARIANT', 'the production renderer consumes the unchanged static plan'],
      [81, 81, 'PURE-INVARIANT', 'each facet carries connected near body, far mass and links (connected-hull invariant)'],
      [88, 88, 'CORE', 'the pure plan retains its static-anatomy contract'],
      [91, 91, 'TAUTOLOGY', 'contract resolves the shared source root'],
    ],
  },

  'actor-motion-contract': {
    scope: 'shipped',
    mechanism: 'spawns tools/actor-motion-check.mjs and greps its count',
    verdict: 'CORE-GATE',
    default: 'PURE-INVARIANT',
    note: 'The checker validates atlas alpha boxes, clips and sockets against PNG data.',
    ranges: [[16, 16, 'TAUTOLOGY', 'greps "ACTOR MOTION: N/N contracts passed"']],
  },

  'crown-command-architecture': {
    scope: 'shipped',
    mechanism: 'pure Crown plan + regex over render/crown.js, crown-art.js, finale.js, main.js',
    verdict: 'SPLIT',
    default: 'PIN',
    note: 'Exact part counts (31 parts, per-kind counts) and 19 regexes over the Crown renderer. Keep the ten pure placement/dormancy lines (55-58, 60-67, 76-90) in the invariant tier; delete the counts and regexes.',
    ranges: [
      [55, 58, 'PURE-INVARIANT', 'broad buried shoulder; every Crown surface behind the play plane'],
      [60, 67, 'PURE-INVARIANT', 'mechanical groups dormant without events; bounded envelopes; turbine caps resumed-tab steps'],
      [76, 90, 'PURE-INVARIANT', 'organs at distinct depths; roots continue below the deck'],
    ],
  },

  'enemy-ecology-render-contract': {
    scope: 'shipped',
    mechanism: 'spawns tools/enemy-ecology-render-check.mjs and greps exact JSON numbers',
    verdict: 'DELETE',
    default: 'PIN',
    note: 'The checker is mostly regex over render source; the wrapper pins "componentGeometries": 192 / "visualStates": 768 / "quadsPerEnemy": 2.',
    ranges: [[16, 16, 'PIN', 'exact counts 192 / 768 / 2 from the checker\'s stdout']],
  },

  'hostile-presenter-contract': {
    scope: 'shipped',
    mechanism: 'spawns tools/hostile-presenter-check.mjs and greps its count',
    verdict: 'DELETE',
    default: 'PIN',
    note: 'The checker pins the presenter priority list by regex over index.js plus a small registry behaviour test.',
    ranges: [[16, 16, 'TAUTOLOGY', 'greps "5 lifecycle owners registered"']],
  },

  'boot-registry-contract': {
    scope: 'shipped',
    mechanism: 'spawns tools/boot-registry-check.mjs (regex over main.js / boot/*.js) and greps counts',
    verdict: 'DELETE',
    default: 'PIN',
    note: 'The checker asserts the exact ordered id list of the view/reset registries from source text; the wrapper pins "13 views, 31 reset owners". Adding a view fails it. Deleting it is right on the evidence (M34, a retry that no longer resets the hostile RNG, is green), but only after the retry-replay test replaces the property it proxied (§7.4 #9, review finding 8).',
    ranges: [],   // both sites are label-keyed in SITES (review finding 8)
  },

  'adaptive-fidelity-contract': {
    scope: 'shipped',
    mechanism: 'spawns tools/adaptive-fidelity-check.mjs (behaviour of the pure controller) and greps a phrase',
    verdict: 'CORE-GATE',
    default: 'PURE-INVARIANT',
    note: 'The checker drives the pure adaptive-fidelity controller (sustained misses step down, no oscillation) — real behaviour, in service of the frame budget.',
    ranges: [[16, 16, 'TAUTOLOGY', 'greps "3 stable degradation rungs" from the checker\'s stdout']],
  },

  'render-submission-contract': {
    scope: 'shipped',
    mechanism: 'boots a REAL browser (tools/playtest/perf-probe.mjs, SwiftShader) into a private mkdtemp output dir; HB_GATE_SKIP_BROWSER_PROBE=1 skips it loudly',
    verdict: 'REWRITE',
    default: 'SLOW-ENV',
    note: 'The only browser boot inside pathcheck. At T-108\'s base (38d0409) it was 89-93% of gate wall time, TIMED OUT (300 s) in both timed runs, and then read a result.json another run had left at a fixed shared path, so three assertions "passed" on stale data. Main fixed the plumbing after the base (e29665b: private mkdtemp dir per run; 1a3a400: an explicit, counted-as-not-run skip on GPU-less hosts, which this host now sets in ~/.hullbreaker-host.env). Its four probe assertions are boot plus frame-budget hygiene (material passes, idle uploads, MSAA): they move to the PLAY gate, gated on a GPU host.',
    ranges: [
      [21, 21, 'PIN', 'skip branch: the probe source still contains --throttle / --profile / gl.finish'],
      [41, 41, 'SLOW-ENV', 'the probe boots the shipped scene (real browser; host-load dependent) — PLAY gate'],
      [43, 47, 'SLOW-ENV', 'frame-budget hygiene (material passes, idle uploads, MSAA) — PLAY gate, gated on a GPU host (§7.2 item 9); no longer stale since e29665b'],
      [53, 53, 'PIN', 'the probe source still contains --throttle / --profile / gl.finish'],
    ],
  },

  'frame-input-contract': {
    scope: 'shipped (deterministic playtest input)',
    mechanism: 'pure frame-input ledger + regex over main.js / sim/player.js',
    verdict: 'SPLIT',
    default: 'PURE-INVARIANT',
    note: 'The frame-scoped input ledger is what makes deterministic playtests replay; worth keeping with determinism.',
    ranges: [
      [14, 46, 'CORE', 'frame-scoped input resolves on exact ticks; reset restores held state; page freezes before the terminal update (determinism of playtests)'],
      [62, 65, 'PIN', 'main drains before update; testapi read-only — regex', ['core']],
      [70, 70, 'PIN', 'Shift-release self-heal — regex over sim/player.js', ['core']],
    ],
  },

  'gilded-chassis': {
    scope: 'shipped (Konami easter egg)',
    mechanism: 'pure Konami detector + regex over main.js / gilded-aura.js / player.js / sim',
    verdict: 'SPLIT',
    default: 'PURE-INVARIANT',
    note: 'A presentation-only easter egg. The detector tests are fine; the rest pins construction-site counts.',
    ranges: [
      [100, 107, 'PIN', 'keydown listener / toggle / ordering — regex'],
      [115, 115, 'PIN', 'aura exports the latch'],
      [117, 117, 'CORE', 'aura colour from the palette token, no raw literal (palette hard rule)'],
      [120, 125, 'PIN', 'exactly five frozen construction sites; two sites making four meshes'],
      [129, 129, 'CORE', 'shimmer tints from PAL.gildedGold, not a literal (palette hard rule)'],
      [134, 134, 'CORE', 'sim never learns the chassis is gold (presentation cannot change gameplay)'],
    ],
  },

  'power-feedback-contract': {
    scope: 'shipped',
    mechanism: 'pure power-feedback math + regex over power-aura/player/bullets/mods',
    verdict: 'SPLIT',
    default: 'PURE-INVARIANT',
    note: 'Cadence bounds (RAGE <= 3 beats/s, no continuing screen flash) are pillar-5 readability arithmetic.',
    ranges: [
      [49, 84, 'PIN', 'mesh/pool/identity wiring by regex', ['core']],
      [88, 88, 'CORE', 'sim files have no presentation dependency (presentation cannot change gameplay)'],
    ],
  },

  'depth-layer-contract': {
    scope: 'shipped',
    mechanism: 'pure depth-layer policy + regex over limb/level/contact/hostiles/scene',
    verdict: 'SPLIT',
    default: 'PURE-INVARIANT',
    note: 'Depth-lane separation (no z-fighting between adjacent hull chunks) at policy level.',
    ranges: [
      [28, 28, 'PIN', 'the audited 0.002-unit quantum'],
      [75, 91, 'PIN', 'modules consume the shared layer policy — regex', ['core']],
    ],
  },
};

// SITES — label-keyed hand entries (T-108 review pass, 2026-10-23). Each entry
// names ONE call site by its domain and a prefix of its message label (see
// tools/orch/test-census.mjs, SITE IDENTITY), so it survives a lane shifting
// the domain's lines; `nth` picks among repeated labels. An entry outranks
// every line range. The trailing // :N comment is the line on the tree the
// entry was written against (c80dad0, whose tools/pathcheck/ equals main
// 2fa58bb), for a reader only — the census never reads it.
//
// marks (in addition to the DOMAINS ones):
//   'split'       the assertion conjoins a property worth keeping with pinned
//                 conjuncts: keep it in its tier, drop only the pinned
//                 conjuncts when the domain is next edited (SPLIT-ASSERTION)
//   'with:T-121'  guards hook v1 or the zip-assembly corner, which entry 25
//                 releases for deletion: T-121 deletes the assertion together
//                 with the code (DELETE-WITH-FEATURE), not T-120's batches
export const SITES = [
  // pathcheck-suite
  { domain: 'pathcheck-suite', label: 'column 0 hidden before impact frame', cls: 'RETIRED',
    note: 'zip-assembly corner (entry 3 addendum, released for deletion by entry 25): deleted together with the feature by T-121 — brick-zipper column timeline',
    marks: ['with:T-121'] }, // :173
  { domain: 'pathcheck-suite', label: 'column 0 starts 2.75 above', cls: 'RETIRED',
    note: 'zip-assembly corner (entry 3 addendum, released for deletion by entry 25): deleted together with the feature by T-121 — brick-zipper column timeline',
    marks: ['with:T-121'] }, // :174
  { domain: 'pathcheck-suite', label: 'gravity ease: u=0.5 -> 75 percent of dro', cls: 'RETIRED',
    note: 'zip-assembly corner (entry 3 addendum, released for deletion by entry 25): deleted together with the feature by T-121 — brick-zipper column timeline',
    marks: ['with:T-121'] }, // :175
  { domain: 'pathcheck-suite', label: 'column 1 starts exactly 16 ms later', cls: 'RETIRED',
    note: 'zip-assembly corner (entry 3 addendum, released for deletion by entry 25): deleted together with the feature by T-121 — brick-zipper column timeline',
    marks: ['with:T-121'] }, // :177
  { domain: 'pathcheck-suite', label: 'one-beat dip after landing', cls: 'RETIRED',
    note: 'zip-assembly corner (entry 3 addendum, released for deletion by entry 25): deleted together with the feature by T-121 — brick-zipper column timeline',
    marks: ['with:T-121'] }, // :181
  { domain: 'pathcheck-suite', label: 'column locks to base after dip', cls: 'RETIRED',
    note: 'zip-assembly corner (entry 3 addendum, released for deletion by entry 25): deleted together with the feature by T-121 — brick-zipper column timeline',
    marks: ['with:T-121'] }, // :185
  { domain: 'pathcheck-suite', label: 'last slam column lands at 820 ms, before', cls: 'RETIRED',
    note: 'zip-assembly corner (entry 3 addendum, released for deletion by entry 25): deleted together with the feature by T-121 — brick-zipper column timeline',
    marks: ['with:T-121'] }, // :189
  { domain: 'pathcheck-suite', label: 'zipper fully locked ( … ms) before scrol', cls: 'RETIRED',
    note: 'zip-assembly corner (entry 3 addendum, released for deletion by entry 25): deleted together with the feature by T-121 — brick-zipper column timeline',
    marks: ['with:T-121'] }, // :192
  // T-120 step 0 (main 630a489, after the audit): a new generator invariant
  { domain: 'pathcheck-suite', label: 'every generated ground column is a finite height', cls: 'PURE-INVARIANT',
    note: 'schema integrity of the generated level: a half-made level-length edit leaves holes, and this turns M27h\'s hang into a red (630a489, T-108 re-gate QA)' }, // :263
  { domain: 'pathcheck-suite', label: 'portrait pullback preserves retreat room', cls: 'PURE-INVARIANT',
    note: 'portrait pullback keeps retreat room and preview — NOTE it reads TF.darePocket.timing.entryEdgeMarginTiles (retired dare fixture data): re-point it before the RETIRED batch removes that data (review finding 9)' }, // :1030
  { domain: 'pathcheck-suite', label: 'responsive portrait composition keeps de', cls: 'CORE',
    note: 'keep the desktop-FAR identity conjuncts (desktopViewMult === far.depthMult, desktopActorGain === 1: entries 7/17/20); drop the portrait 1.15 / 24-30 tiles / 4-6 % pins — split only after T-107 lands its byte-identical projection proof (review finding 9)',
    marks: ['split'] }, // :1035
  // world-transitions
  { domain: 'world-transitions', label: 'the assembly choreography is retained fo', cls: 'RETIRED',
    note: 'zip-assembly corner (entry 3 addendum, released for deletion by entry 25): deleted together with the feature by T-121 — asserts the retained assembly code exists (recoverable at bb8e4df)',
    marks: ['with:T-121'] }, // :161
  { domain: 'world-transitions', label: 'the reserved assembly curve still settle', cls: 'RETIRED',
    note: 'zip-assembly corner (entry 3 addendum, released for deletion by entry 25): deleted together with the feature by T-121 — asserts the retained assembly curve still settles',
    marks: ['with:T-121'] }, // :168
  // g2-neck-access-plate-flip-gate
  { domain: 'g2-neck-access-plate-flip-gate', label: 'the default-arg level build follows the ', cls: 'PURE-INVARIANT',
    note: 'the default-arg level build follows the live selection — flag plumbing, not behaviour (review finding 14)' }, // :71
  // movement-verb-prototypes
  { domain: 'movement-verb-prototypes', label: 'arming both verbs adds the two tuning ta', cls: 'PURE-INVARIANT',
    note: 'the ?flow=1 overlay adds its table and exactly one movement override (ledgeAutoLaunch); drop the hook half with T-121',
    marks: ['split', 'scope:flag:flow=1'] }, // :86
  { domain: 'movement-verb-prototypes', label: 'hook + flow + every pace chain keeps hor', cls: 'PURE-INVARIANT',
    note: 'dt-clamp tunnelling bound for every flow-armed pace — their only one (pacing-variants.mjs covers paces without flow); drop the hook candidate with T-121',
    marks: ['split', 'scope:flag:flow=1'] }, // :208
  { domain: 'movement-verb-prototypes', label: 'no verb raises an upward launch into the', cls: 'PURE-INVARIANT',
    note: 'upward-launch tunnelling bound for every flow-armed pace; drop the hook launchY candidate with T-121',
    marks: ['split', 'scope:flag:flow=1'] }, // :212
  // authored-slope-rib-run
  { domain: 'authored-slope-rib-run', label: 'the rib run inherits the fixture tune un', cls: 'PURE-INVARIANT',
    note: 'the rib run inherits the fixture tune untouched — config equality, not behaviour (review finding 14)' }, // :126
  { domain: 'authored-slope-rib-run', label: 'the fixture fields exactly those flanges', cls: 'PIN',
    note: 'the fixture fields exactly the flanges it was built from — data checked against itself (author\'s own spot check + review finding 14)' }, // :214
  // rib-run-driven-through-real-sim
  { domain: 'rib-run-driven-through-real-sim', label: ': the rib is a … s pass, inside the fixt', cls: 'CORE',
    note: 'driven pass time inside the fixture\'s 4-12 s window (review finding 14)' }, // :130
  { domain: 'rib-run-driven-through-real-sim', label: ': the whole climb averages … t/s, … % of', cls: 'CORE',
    note: 'driven climb keeps 85 % of run speed (momentum pillar; review finding 14)' }, // :140
  { domain: 'rib-run-driven-through-real-sim', label: ': the rib never holds RIG still for long', cls: 'CORE',
    note: 'driven climb never holds RIG under 2 t/s for 600 ms (momentum pillar; review finding 14)' }, // :144
  // snap-hook-driven-through-real-sim
  { domain: 'snap-hook-driven-through-real-sim', label: 'sim/hook.js drives the real player loop ', cls: 'RETIRED',
    note: 'hook v1 (entry 5, released for deletion by entry 25): deleted together with the feature by T-121',
    marks: ['with:T-121'] }, // :199
  { domain: 'snap-hook-driven-through-real-sim', label: 'pressing hook at the fixture spawn grabs', cls: 'RETIRED',
    note: 'hook v1 (entry 5, released for deletion by entry 25): deleted together with the feature by T-121',
    marks: ['with:T-121'] }, // :201
  { domain: 'snap-hook-driven-through-real-sim', label: 'while the tether is taut the player carr', cls: 'RETIRED',
    note: 'hook v1 (entry 5, released for deletion by entry 25): deleted together with the feature by T-121',
    marks: ['with:T-121'] }, // :204
  { domain: 'snap-hook-driven-through-real-sim', label: 'the zip arrives and dangles before it th', cls: 'RETIRED',
    note: 'hook v1 (entry 5, released for deletion by entry 25): deleted together with the feature by T-121',
    marks: ['with:T-121'] }, // :207
  { domain: 'snap-hook-driven-through-real-sim', label: 'the dangle always converts: one grab, on', cls: 'RETIRED',
    note: 'hook v1 (entry 5, released for deletion by entry 25): deleted together with the feature by T-121',
    marks: ['with:T-121'] }, // :208
  { domain: 'snap-hook-driven-through-real-sim', label: 'the whip throws forward at a bounded spe', cls: 'RETIRED',
    note: 'hook v1 (entry 5, released for deletion by entry 25): deleted together with the feature by T-121',
    marks: ['with:T-121'] }, // :213
  { domain: 'snap-hook-driven-through-real-sim', label: 'the whip refunds the air jump, so a grab', cls: 'RETIRED',
    note: 'hook v1 (entry 5, released for deletion by entry 25): deleted together with the feature by T-121',
    marks: ['with:T-121'] }, // :219
  { domain: 'snap-hook-driven-through-real-sim', label: 'the grab gained real altitude: … tiles', cls: 'RETIRED',
    note: 'hook v1 (entry 5, released for deletion by entry 25): deleted together with the feature by T-121',
    marks: ['with:T-121'] }, // :221
  { domain: 'snap-hook-driven-through-real-sim', label: 'the cooldown and the anchor lock refuse ', cls: 'RETIRED',
    note: 'hook v1 (entry 5, released for deletion by entry 25): deleted together with the feature by T-121',
    marks: ['with:T-121'] }, // :223
  { domain: 'snap-hook-driven-through-real-sim', label: 'a hook launch is a momentum-chain link', cls: 'RETIRED',
    note: 'hook v1 (entry 5, released for deletion by entry 25): deleted together with the feature by T-121',
    marks: ['with:T-121'] }, // :224
  { domain: 'snap-hook-driven-through-real-sim', label: 'the launch that followed the grab pays a', cls: 'RETIRED',
    note: 'hook v1 (entry 5, released for deletion by entry 25): deleted together with the feature by T-121',
    marks: ['with:T-121'] }, // :226
  { domain: 'snap-hook-driven-through-real-sim', label: 'and the A.5 event stream carries it, wit', cls: 'RETIRED',
    note: 'hook v1 (entry 5, released for deletion by entry 25): deleted together with the feature by T-121',
    marks: ['with:T-121'] }, // :229
  { domain: 'snap-hook-driven-through-real-sim', label: 'down releases the tether and drops, exac', cls: 'RETIRED',
    note: 'hook v1 (entry 5, released for deletion by entry 25): deleted together with the feature by T-121',
    marks: ['with:T-121'] }, // :231
  { domain: 'snap-hook-driven-through-real-sim', label: 'a press with no valid anchor is simply a', cls: 'RETIRED',
    note: 'hook v1 (entry 5, released for deletion by entry 25): deleted together with the feature by T-121',
    marks: ['with:T-121'] }, // :234
  { domain: 'snap-hook-driven-through-real-sim', label: 'crush case: two contact launches armed a', cls: 'PURE-INVARIANT',
    note: 'precondition of the flow-chain crush case (?flow=1 is live and unjudged)',
    marks: ['scope:flag:flow=1'] }, // :243
  { domain: 'snap-hook-driven-through-real-sim', label: 'a live chain carried into the plane\'s wa', cls: 'CORE',
    note: 'a live ?flow=1 chain dies on the crush frame (setback un-earns momentum); drop the hookPhase conjunct with T-121',
    marks: ['split', 'scope:flag:flow=1'] }, // :244
  { domain: 'snap-hook-driven-through-real-sim', label: 'and no frame left RIG behind the damage ', cls: 'CORE',
    note: 'no frame leaves RIG behind the damage plane with a live ?flow=1 chain (no-clip hard rule)',
    marks: ['scope:flag:flow=1'] }, // :247
  { domain: 'snap-hook-driven-through-real-sim', label: 'the crush still resolves in its own fram', cls: 'CORE',
    note: 'the crush resolves in its own frame, not grinding, under ?flow=1 (no softlock)',
    marks: ['scope:flag:flow=1'] }, // :248
  { domain: 'snap-hook-driven-through-real-sim', label: 'and the sealed pocket stays terminal: th', cls: 'CORE',
    note: 'the sealed pocket stays terminal: the ?flow=1 momentum spine cannot buy a rescue the fallback rule denies',
    marks: ['scope:flag:flow=1'] }, // :251
  { domain: 'snap-hook-driven-through-real-sim', label: 'a lethal hit mid-chain also un-earns the', cls: 'CORE',
    note: 'a lethal hit mid ?flow=1 chain un-earns the chain; drop the hookPhase conjunct with T-121',
    marks: ['split', 'scope:flag:flow=1'] }, // :257
  { domain: 'snap-hook-driven-through-real-sim', label: 'and the setback is still a dislodging, n', cls: 'CORE',
    note: 'a lethal hit is a dislodging, not a stop, under ?flow=1 (play continues on a lower route)',
    marks: ['scope:flag:flow=1'] }, // :260
  // t-012-audio-layer-static-guards
  { domain: 't-012-audio-layer-static-guards', label: 'T-012: audio module declares imports', cls: 'PIN',
    note: 'regex / import shape over the audio wiring (hand pass of the mechanical rule: confirmed PIN)' }, // :31
  { domain: 't-012-audio-layer-static-guards', label: 'T-012: ui/audio.js imports nothing from ', cls: 'PIN',
    note: 'regex / import shape over the audio wiring (hand pass of the mechanical rule: confirmed PIN)' }, // :32
  { domain: 't-012-audio-layer-static-guards', label: 'T-012: audio sim import is a sanctioned ', cls: 'PIN',
    note: 'regex / import shape over the audio wiring (hand pass of the mechanical rule: confirmed PIN)' }, // :50
  { domain: 't-012-audio-layer-static-guards', label: 'T-012/T-029: main.js touches the audio m', cls: 'PIN',
    note: 'regex / import shape over the audio wiring (hand pass of the mechanical rule: confirmed PIN)' }, // :66
  { domain: 't-012-audio-layer-static-guards', label: 'T-012: audio hook wrappers call the prio', cls: 'PIN',
    note: 'regex / import shape over the audio wiring (hand pass of the mechanical rule: confirmed PIN)' }, // :72
  { domain: 't-012-audio-layer-static-guards', label: 'T-012: ?audio=0 gates all wiring off', cls: 'PIN',
    note: 'regex / import shape over the audio wiring (hand pass of the mechanical rule: confirmed PIN)' }, // :75
  { domain: 't-012-audio-layer-static-guards', label: 'T-012: onCornerFinished recounts ambienc', cls: 'PIN',
    note: 'regex / import shape over the audio wiring (hand pass of the mechanical rule: confirmed PIN)' }, // :89
  { domain: 't-012-audio-layer-static-guards', label: 'T-012: onFaceRevealed does not recount l', cls: 'PIN',
    note: 'regex / import shape over the audio wiring (hand pass of the mechanical rule: confirmed PIN)' }, // :91
  { domain: 't-012-audio-layer-static-guards', label: 'T-012: wavegate.finishCorner commits sta', cls: 'PIN',
    note: 'regex / import shape over the audio wiring (hand pass of the mechanical rule: confirmed PIN)' }, // :96
  // t-013-game-shell
  { domain: 't-013-game-shell', label: 'T-013: " … " carries its board-05 brand ', cls: 'PURE-INVARIANT',
    note: 'every title direction carries its board-05 copy (schema of the title-direction data)' }, // :68
  { domain: 't-013-game-shell', label: 'T-013: the six-face stats screen reports', cls: 'PURE-INVARIANT',
    note: 'runStatRows is a pure function: the shipped six-face stats screen (review finding 6)' }, // :212
  { domain: 't-013-game-shell', label: 'T-013: time leads the stats screen', cls: 'PURE-INVARIANT',
    note: 'runStatRows is a pure function: the shipped six-face stats screen (review finding 6)' }, // :215
  { domain: 't-013-game-shell', label: 'T-013: no stats row is empty or undefine', cls: 'PURE-INVARIANT',
    note: 'runStatRows is a pure function: the shipped six-face stats screen (review finding 6)' }, // :217
  { domain: 't-013-game-shell', label: 'T-013: the fixture stats screen counts a', cls: 'PURE-INVARIANT',
    note: 'runStatRows for the traversal fixture (pure)',
    marks: ['scope:flag:slice=traversal'] }, // :221
  { domain: 't-013-game-shell', label: 'T-013: the transform stats screen report', cls: 'PURE-INVARIANT',
    note: 'runStatRows for the transform fixture (pure)',
    marks: ['scope:flag:slice=transform'] }, // :225
  { domain: 't-013-game-shell', label: 'T-013: the score prototype adds no rows ', cls: 'PURE-INVARIANT',
    note: 'runStatRows is a pure function: the shipped six-face stats screen (review finding 6)' }, // :228
  { domain: 't-013-game-shell', label: 'T-013: ?score=1 folds the protoScore fie', cls: 'PURE-INVARIANT',
    note: 'runStatRows with the ?score=1 prototype (pure)',
    marks: ['scope:flag:score=1'] }, // :233
  { domain: 't-013-game-shell', label: 'T-013: hull fallbacks appear only when t', cls: 'PURE-INVARIANT',
    note: 'runStatRows is a pure function: the shipped six-face stats screen (review finding 6)' }, // :238
  // t-009-static-anatomy-reveal-default
  { domain: 't-009-static-anatomy-reveal-default', label: 'T-009: ?zip=1 restores the brick-slam re', cls: 'RETIRED',
    note: 'zip-assembly corner (entry 3 addendum, released for deletion by entry 25): deleted together with the feature by T-121 — ?zip=1 restores the brick-slam reveal',
    marks: ['with:T-121'] }, // :49
  { domain: 't-009-static-anatomy-reveal-default', label: 'T-009: ?g1=0 is the same escape hatch, f', cls: 'RETIRED',
    note: 'zip-assembly corner (entry 3 addendum, released for deletion by entry 25): deleted together with the feature by T-121 — ?g1=0 is the same escape hatch',
    marks: ['with:T-121'] }, // :51
  { domain: 't-009-static-anatomy-reveal-default', label: 'T-009: the zipper hook is still written ', cls: 'RETIRED',
    note: 'zip-assembly corner (entry 3 addendum, released for deletion by entry 25): deleted together with the feature by T-121',
    marks: ['with:T-121'] }, // :57
  { domain: 't-009-static-anatomy-reveal-default', label: 'T-009: the gate runtime still drives the', cls: 'RETIRED',
    note: 'zip-assembly corner (entry 3 addendum, released for deletion by entry 25): deleted together with the feature by T-121',
    marks: ['with:T-121'] }, // :60
  // t-018-bot-harness-relative-geometry
  { domain: 't-018-bot-harness-relative-geometry', label: 'T-018: … never reaches for eval()/new Fu', cls: 'PURE-INVARIANT',
    note: 'static honesty lint of the bot grammar: no eval/new Function (a rule, like the layer guard)' }, // :116
  { domain: 't-018-bot-harness-relative-geometry', label: 'T-018: … declares no module-level mutabl', cls: 'PURE-INVARIANT',
    note: 'static honesty lint of the bot grammar: no module-level mutable state' }, // :121
  { domain: 't-018-bot-harness-relative-geometry', label: 'T-019: … is driven by relative geometry ', cls: 'PURE-INVARIANT',
    note: 'six-face script honesty lint (relative geometry only) — keep with its four negative controls (review finding 6)' }, // :320
  { domain: 't-018-bot-harness-relative-geometry', label: 'T-019: the guard catches a clause naming', cls: 'PURE-INVARIANT',
    note: 'negative control of the six-face script honesty lint — without it the lint cannot fail' }, // :332
  { domain: 't-018-bot-harness-relative-geometry', label: 'T-019: …a timed movement `move`', cls: 'PURE-INVARIANT',
    note: 'negative control of the six-face script honesty lint — without it the lint cannot fail' }, // :334
  { domain: 't-018-bot-harness-relative-geometry', label: 'T-019: …and a timed movement in the RAW ', cls: 'PURE-INVARIANT',
    note: 'negative control of the six-face script honesty lint — without it the lint cannot fail' }, // :336
  { domain: 't-018-bot-harness-relative-geometry', label: 'T-019: …and a six-face script with no po', cls: 'PURE-INVARIANT',
    note: 'negative control of the six-face script honesty lint — without it the lint cannot fail' }, // :339
  // momentum-earned-pace-escalation
  { domain: 'momentum-earned-pace-escalation', label: 'momentum: the two earn weights sum to ex', cls: 'PURE-INVARIANT',
    note: 'relational validity of the shipped momentum tune (weights sum to 1; the bank interval guards the divide in momentumBank; ceilings ordered; relief faster than escalation — entry 11; tiers ascending) — review finding 7' }, // :50
  { domain: 'momentum-earned-pace-escalation', label: 'momentum: the bank ramp is a real interv', cls: 'PURE-INVARIANT',
    note: 'relational validity of the shipped momentum tune (weights sum to 1; the bank interval guards the divide in momentumBank; ceilings ordered; relief faster than escalation — entry 11; tiers ascending) — review finding 7' }, // :53
  { domain: 'momentum-earned-pace-escalation', label: 'momentum: escalation ceiling is above th', cls: 'PURE-INVARIANT',
    note: 'relational validity of the shipped momentum tune (weights sum to 1; the bank interval guards the divide in momentumBank; ceilings ordered; relief faster than escalation — entry 11; tiers ascending) — review finding 7' }, // :55
  { domain: 'momentum-earned-pace-escalation', label: 'momentum: drive sheds faster than it ear', cls: 'PURE-INVARIANT',
    note: 'relational validity of the shipped momentum tune (weights sum to 1; the bank interval guards the divide in momentumBank; ceilings ordered; relief faster than escalation — entry 11; tiers ascending) — review finding 7' }, // :57
  { domain: 'momentum-earned-pace-escalation', label: 'momentum: a hit caps the drive at a real', cls: 'PURE-INVARIANT',
    note: 'relational validity of the shipped momentum tune (weights sum to 1; the bank interval guards the divide in momentumBank; ceilings ordered; relief faster than escalation — entry 11; tiers ascending) — review finding 7' }, // :60
  { domain: 'momentum-earned-pace-escalation', label: 'momentum: the kill streak saturates at a', cls: 'PURE-INVARIANT',
    note: 'relational validity of the shipped momentum tune (weights sum to 1; the bank interval guards the divide in momentumBank; ceilings ordered; relief faster than escalation — entry 11; tiers ascending) — review finding 7' }, // :62
  { domain: 'momentum-earned-pace-escalation', label: 'momentum: the HUD tiers are an ascending', cls: 'PURE-INVARIANT',
    note: 'relational validity of the shipped momentum tune (weights sum to 1; the bank interval guards the divide in momentumBank; ceilings ordered; relief faster than escalation — entry 11; tiers ascending) — review finding 7' }, // :64
  // t-029-runtime-truth-three-debug
  { domain: 't-029-runtime-truth-three-debug', label: 'T-029/I-005: src/ui/audio.js still expor', cls: 'PIN',
    note: 'regex over the HUD/overlay/audio source (hand pass: confirmed PIN)' }, // :45
  { domain: 't-029-runtime-truth-three-debug', label: 'T-029/I-009: the HUD turn counter reads ', cls: 'PIN',
    note: 'regex over the HUD/overlay/audio source (hand pass: confirmed PIN)' }, // :79
  { domain: 't-029-runtime-truth-three-debug', label: 'T-029/I-009: …and so does the clear over', cls: 'PIN',
    note: 'regex over the HUD/overlay/audio source (hand pass: confirmed PIN)' }, // :82
  // pathcheck-suite-2
  { domain: 'pathcheck-suite-2', label: 'T-032: index.html carries the failure te', cls: 'PIN',
    note: 'T-032 failure-panel wiring (boot / safe degradation, CLAUDE.md + entry 21 never-delete list) checked by regex: keep until the PLAY-gate failsafe case (§7.2 item 3) is green and shown red on M12/M36/M37, then delete',
    marks: ['core'] }, // :126
  { domain: 'pathcheck-suite-2', label: 'T-032: …and that table is literal data, ', cls: 'PIN',
    note: 'T-032 failure-panel wiring (boot / safe degradation, CLAUDE.md + entry 21 never-delete list) checked by regex: keep until the PLAY-gate failsafe case (§7.2 item 3) is green and shown red on M12/M36/M37, then delete',
    marks: ['core'] }, // :129
  { domain: 'pathcheck-suite-2', label: 'T-032: the failure handler is an INLINE ', cls: 'PIN',
    note: 'T-032 failure-panel wiring (boot / safe degradation, CLAUDE.md + entry 21 never-delete list) checked by regex: keep until the PLAY-gate failsafe case (§7.2 item 3) is green and shown red on M12/M36/M37, then delete',
    marks: ['core'] }, // :165
  { domain: 'pathcheck-suite-2', label: 'T-032: …and it imports nothing, so nothi', cls: 'PIN',
    note: 'T-032 failure-panel wiring (boot / safe degradation, CLAUDE.md + entry 21 never-delete list) checked by regex: keep until the PLAY-gate failsafe case (§7.2 item 3) is green and shown red on M12/M36/M37, then delete',
    marks: ['core'] }, // :170
  { domain: 'pathcheck-suite-2', label: 'T-032: …and it is installed BEFORE the g', cls: 'PIN',
    note: 'T-032 failure-panel wiring (boot / safe degradation, CLAUDE.md + entry 21 never-delete list) checked by regex: keep until the PLAY-gate failsafe case (§7.2 item 3) is green and shown red on M12/M36/M37, then delete',
    marks: ['core'] }, // :176
  { domain: 'pathcheck-suite-2', label: 'T-032: the inline watchdog numbers are t', cls: 'PIN',
    note: 'T-032 failure-panel wiring (boot / safe degradation, CLAUDE.md + entry 21 never-delete list) checked by regex: keep until the PLAY-gate failsafe case (§7.2 item 3) is green and shown red on M12/M36/M37, then delete',
    marks: ['core'] }, // :180
  { domain: 'pathcheck-suite-2', label: 'T-032: the keys that put a player back i', cls: 'PIN',
    note: 'T-032 failure-panel wiring (boot / safe degradation, CLAUDE.md + entry 21 never-delete list) checked by regex: keep until the PLAY-gate failsafe case (§7.2 item 3) is green and shown red on M12/M36/M37, then delete',
    marks: ['core'] }, // :188
  { domain: 'pathcheck-suite-2', label: 'T-032: it listens in the CAPTURE phase f', cls: 'PIN',
    note: 'T-032 failure-panel wiring (boot / safe degradation, CLAUDE.md + entry 21 never-delete list) checked by regex: keep until the PLAY-gate failsafe case (§7.2 item 3) is green and shown red on M12/M36/M37, then delete',
    marks: ['core'] }, // :191
  { domain: 'pathcheck-suite-2', label: 'T-032: a boot that never finishes is tol', cls: 'PIN',
    note: 'T-032 failure-panel wiring (boot / safe degradation, CLAUDE.md + entry 21 never-delete list) checked by regex: keep until the PLAY-gate failsafe case (§7.2 item 3) is green and shown red on M12/M36/M37, then delete',
    marks: ['core'] }, // :195
  { domain: 'pathcheck-suite-2', label: 'T-032: the freeze watchdog knows a backg', cls: 'PIN',
    note: 'T-032 failure-panel wiring (boot / safe degradation, CLAUDE.md + entry 21 never-delete list) checked by regex: keep until the PLAY-gate failsafe case (§7.2 item 3) is green and shown red on M12/M36/M37, then delete',
    marks: ['core'] }, // :197
  { domain: 'pathcheck-suite-2', label: 'T-032: the panel markup carries # … , wh', cls: 'PIN',
    note: 'T-032 failure-panel wiring (boot / safe degradation, CLAUDE.md + entry 21 never-delete list) checked by regex: keep until the PLAY-gate failsafe case (§7.2 item 3) is green and shown red on M12/M36/M37, then delete',
    marks: ['core'] }, // :202
  { domain: 'pathcheck-suite-2', label: 'T-032: the failure panel sits above the ', cls: 'PIN',
    note: 'T-032 failure-panel wiring (boot / safe degradation, CLAUDE.md + entry 21 never-delete list) checked by regex: keep until the PLAY-gate failsafe case (§7.2 item 3) is green and shown red on M12/M36/M37, then delete',
    marks: ['core'] }, // :214
  { domain: 'pathcheck-suite-2', label: 'T-032: every .fail-plain line lives insi', cls: 'PIN',
    note: 'T-032 failure-panel wiring (boot / safe degradation, CLAUDE.md + entry 21 never-delete list) checked by regex: keep until the PLAY-gate failsafe case (§7.2 item 3) is green and shown red on M12/M36/M37, then delete',
    marks: ['core'] }, // :223
  { domain: 'pathcheck-suite-2', label: 'T-032: the one repair the game can make ', cls: 'PIN',
    note: 'T-032 failure-panel wiring (boot / safe degradation, CLAUDE.md + entry 21 never-delete list) checked by regex: keep until the PLAY-gate failsafe case (§7.2 item 3) is green and shown red on M12/M36/M37, then delete',
    marks: ['core'] }, // :272
  { domain: 'pathcheck-suite-2', label: 'T-032: a lost drawing surface — nothing ', cls: 'PIN',
    note: 'T-032 failure-panel wiring (boot / safe degradation, CLAUDE.md + entry 21 never-delete list) checked by regex: keep until the PLAY-gate failsafe case (§7.2 item 3) is green and shown red on M12/M36/M37, then delete',
    marks: ['core'] }, // :274
  { domain: 'pathcheck-suite-2', label: 'T-032: window.HB publishes the failsafe ', cls: 'PIN',
    note: 'T-032 failure-panel wiring (boot / safe degradation, CLAUDE.md + entry 21 never-delete list) checked by regex: keep until the PLAY-gate failsafe case (§7.2 item 3) is green and shown red on M12/M36/M37, then delete',
    marks: ['core'] }, // :278
  { domain: 'pathcheck-suite-2', label: 'T-032: boot is signalled by the LAST sta', cls: 'PIN',
    note: 'T-032 failure-panel wiring (boot / safe degradation, CLAUDE.md + entry 21 never-delete list) checked by regex: keep until the PLAY-gate failsafe case (§7.2 item 3) is green and shown red on M12/M36/M37, then delete',
    marks: ['core'] }, // :280
  { domain: 'pathcheck-suite-2', label: 'T-032: ?selftest=1 paints the real panel', cls: 'PIN',
    note: 'T-032 failure-panel wiring (boot / safe degradation, CLAUDE.md + entry 21 never-delete list) checked by regex: keep until the PLAY-gate failsafe case (§7.2 item 3) is green and shown red on M12/M36/M37, then delete',
    marks: ['core'] }, // :283
  { domain: 'pathcheck-suite-2', label: 'T-032: the view layer takes its decision', cls: 'PIN',
    note: 'T-032 failure-panel wiring (boot / safe degradation, CLAUDE.md + entry 21 never-delete list) checked by regex: keep until the PLAY-gate failsafe case (§7.2 item 3) is green and shown red on M12/M36/M37, then delete',
    marks: ['core'] }, // :289
  { domain: 'pathcheck-suite-2', label: 'T-032: uncaught errors AND broken frames', cls: 'PIN',
    note: 'T-032 failure-panel wiring (boot / safe degradation, CLAUDE.md + entry 21 never-delete list) checked by regex: keep until the PLAY-gate failsafe case (§7.2 item 3) is green and shown red on M12/M36/M37, then delete',
    marks: ['core'] }, // :291
  { domain: 'pathcheck-suite-2', label: 'T-032: the halt flag and the browser sel', cls: 'PIN',
    note: 'T-032 failure-panel wiring (boot / safe degradation, CLAUDE.md + entry 21 never-delete list) checked by regex: keep until the PLAY-gate failsafe case (§7.2 item 3) is green and shown red on M12/M36/M37, then delete',
    marks: ['core'] }, // :294
  // t-039-contact-shadows
  { domain: 't-039-contact-shadows', label: 'T-039: contact.js builds one bounded rad', cls: 'PIN',
    note: 'regex over contact.js / its callers (hand pass: confirmed PIN)' }, // :151
  { domain: 't-039-contact-shadows', label: 'T-039: contact.js uses MultiplyBlending ', cls: 'PIN',
    note: 'regex over contact.js / its callers (hand pass: confirmed PIN)' }, // :155
  { domain: 't-039-contact-shadows', label: 'T-039: the material keeps fog:true — a m', cls: 'PIN',
    note: 'regex over contact.js / its callers (hand pass: confirmed PIN)' }, // :159
  { domain: 't-039-contact-shadows', label: 'T-039: exactly one InstancedMesh — the +', cls: 'PIN',
    note: 'headless frame-budget proxy (draw calls / per-frame allocation / instancing): keep until a GATED frame budget exists (§7.7 operator question 1) — exactly one InstancedMesh, the +1 draw call',
    marks: ['core'] }, // :162
  { domain: 't-039-contact-shadows', label: 'T-039: feathering is fixed vertex/instan', cls: 'PIN',
    note: 'regex over contact.js / its callers (hand pass: confirmed PIN)' }, // :164
  { domain: 't-039-contact-shadows', label: 'T-039: contact.js reads the raw groundTo', cls: 'PIN',
    note: 'regex over contact.js / its callers (hand pass: confirmed PIN)' }, // :177
  { domain: 't-039-contact-shadows', label: 'T-039: contact.js is guarded off under t', cls: 'PIN',
    note: 'regex over contact.js / its callers (hand pass: confirmed PIN)' }, // :180
  { domain: 't-039-contact-shadows', label: 'T-039: the flag is ?shadow= (QUERY.get(\'', cls: 'PIN',
    note: 'regex over contact.js / its callers (hand pass: confirmed PIN)' }, // :182
  { domain: 't-039-contact-shadows', label: 'T-039: RIG calls syncContactShadow every', cls: 'PIN',
    note: 'regex over contact.js / its callers (hand pass: confirmed PIN)' }, // :205
  { domain: 't-039-contact-shadows', label: 'T-039: hostiles.js both places and relea', cls: 'PIN',
    note: 'regex over contact.js / its callers (hand pass: confirmed PIN)' }, // :208
  { domain: 't-039-contact-shadows', label: 'T-039: hostiles.js defines a CONTACT_FOO', cls: 'PIN',
    note: 'regex over contact.js / its callers (hand pass: confirmed PIN)' }, // :212
  { domain: 't-039-contact-shadows', label: 'T-039: capsules.js both places and relea', cls: 'PIN',
    note: 'regex over contact.js / its callers (hand pass: confirmed PIN)' }, // :218
  // t-035-value-ladder
  { domain: 't-035-value-ladder', label: 'T-035: gain 0 is exactly 1.0 for every p', cls: 'PURE-INVARIANT',
    note: 'computed bake: gain 0 is exactly 1.0, so ?shade=0 / ?palette=classic reproduce the old bake bit for bit (review finding 6)' }, // :117
  { domain: 't-035-value-ladder', label: 'T-035: the row ramp has one entry per de', cls: 'PIN',
    note: 'CONFIG row ramp vs VISUAL_DEPTH parsed from source text (hand pass: confirmed PIN)' }, // :130
  { domain: 't-035-value-ladder', label: 'T-035/S2: …and every one of them sits in', cls: 'PURE-INVARIANT',
    note: 'computed against the live band: every value inside T-045\'s [0.25, 0.85] fence (review finding 6)' }, // :413
  // t-047-light-rig
  { domain: 't-047-light-rig', label: 'T-047: …and the pre-T-047 world-fixed ri', cls: 'PIN',
    note: 'asserts that the ESCAPE-HATCH rig keeps its old defect (first-pass spot check, applied in the review pass)' }, // :134
  { domain: 't-047-light-rig', label: 'T-047: the flat rig\'s horizontal surface', cls: 'PIN',
    note: 'asserts that the ESCAPE-HATCH rig keeps its old property (first-pass spot check, applied in the review pass)' }, // :139
  { domain: 't-047-light-rig', label: 'T-047: one 2048-max map. Bigger buys tex', cls: 'PIN',
    note: 'headless frame-budget proxy (draw calls / per-frame allocation / instancing): keep until a GATED frame budget exists (§7.7 operator question 1) — one shadow map, 2048 max',
    marks: ['core'] }, // :191
  { domain: 't-047-light-rig', label: 'T-047: userData.shadow=\' … \' overrides t', cls: 'PURE-INVARIANT',
    note: 'the shadow policy function honours a userData override (review finding 6)' }, // :238
  // t-048-post-pass
  { domain: 't-048-post-pass', label: 'T-048: every hostile kind names a surfac', cls: 'PIN',
    note: 'surface-family names counted out of hostile source text (hand pass: confirmed PIN)' }, // :166
  { domain: 't-048-post-pass', label: 'T-048: …and every family a mesh names ex', cls: 'PIN',
    note: 'surface-family names read out of hostile source text (hand pass: confirmed PIN)' }, // :168
  { domain: 't-048-post-pass', label: 'T-048: …and fx.js reads it ONCE per fram', cls: 'PIN',
    note: 'headless frame-budget proxy (draw calls / per-frame allocation / instancing): keep until a GATED frame budget exists (§7.7 operator question 1) — fx.js reads postGain once per frame, not per particle',
    marks: ['core'] }, // :225
  // t-044-corner-setpieces
  { domain: 't-044-corner-setpieces', label: 'T-044: every ARRIVAL ends before that fa', cls: 'PURE-INVARIANT',
    note: 'no arrival set-piece overlaps its face\'s pocket — pockets still exist in the shipped level; a geometry non-overlap invariant, not the retired wager (review finding 14)' }, // :96
  // t-052-hull-texture
  { domain: 't-052-hull-texture', label: 'T-054: one authored copy of the … bucket', cls: 'TAUTOLOGY',
    note: 're-derives the placement formula it tests (first-pass spot check, applied in the review pass)' }, // :97
  // t-051-backdrop
  { domain: 't-051-backdrop', label: 'center y is derived from yBottom + half ', cls: 'TAUTOLOGY',
    note: 're-derives the placement formula it tests (first-pass spot check, applied in the review pass)' }, // :137
  // t-057-hull-shimmer
  { domain: 't-057-hull-shimmer', label: 'T-057: materials.js reads the device\'s o', cls: 'PIN',
    note: 'regex over materials.js anisotropy (hand pass: confirmed PIN)' }, // :46
  { domain: 't-057-hull-shimmer', label: 'T-057: no remaining hardcoded numeric an', cls: 'PIN',
    note: 'regex over materials.js anisotropy (hand pass: confirmed PIN)' }, // :53
  { domain: 't-057-hull-shimmer', label: 'T-057: `anisotropy` is set at both place', cls: 'PIN',
    note: 'regex over materials.js anisotropy (hand pass: confirmed PIN)' }, // :56
  // future-facet-render-ownership
  { domain: 'future-facet-render-ownership', label: 'pre-turn render ownership exposes zero f', cls: 'CORE',
    note: 'static anatomy (entry 3): runs the real routeRenderOwned over every column — zero future-face rows visible before the turn (review finding 1; the mechanical rule matched a variable name)' }, // :37
  { domain: 'future-facet-render-ownership', label: 'handoff frame retains its 19 built arriv', cls: 'CORE',
    note: 'keep `laterVisible === 0` (static anatomy at the handoff frame); drop the 19-column prefix pin when the line is split (review finding 1)',
    marks: ['split'] }, // :89
  // mod-route-visibility
  { domain: 'mod-route-visibility', label: 'modifier presentation uses the shared bu', cls: 'PIN',
    note: 'mods.js imports the shared visibility contract — regex (hand pass: confirmed PIN)' }, // :12
  { domain: 'mod-route-visibility', label: 'each clone slot clears stale art before ', cls: 'PIN',
    note: 'render ownership by regex (nothing renders on an unbuilt or off-camera facet, entry 3): replace with the PLAY-gate ownership probe (§7.2 item 4), falsifier M20, then delete',
    marks: ['core'] }, // :14
  { domain: 'mod-route-visibility', label: 'the orbital-lance telegraph cannot be pl', cls: 'PIN',
    note: 'render ownership by regex (nothing renders on an unbuilt or off-camera facet, entry 3): replace with the PLAY-gate ownership probe (§7.2 item 4), falsifier M20, then delete',
    marks: ['core'] }, // :16
  // vertical-assault-geometry
  { domain: 'vertical-assault-geometry', label: 'authored route decisions need no anonymo', cls: 'PURE-INVARIANT',
    note: 'authored route decisions need no density-repair bars — a content signal M27 turned red (review finding 6)' }, // :29
  { domain: 'vertical-assault-geometry', label: 'route ownership is normal-run topology, ', cls: 'PIN',
    note: 'regex over the route/ladder builders (hand pass: confirmed PIN)' }, // :139
  { domain: 'vertical-assault-geometry', label: 'both normal-run reveal styles build the ', cls: 'PIN',
    note: 'regex over the route/ladder builders (hand pass: confirmed PIN)' }, // :143
  { domain: 'vertical-assault-geometry', label: 'ladder pools apply facet/build culling b', cls: 'PIN',
    note: 'render ownership by regex (nothing renders on an unbuilt or off-camera facet, entry 3): replace with the PLAY-gate ownership probe (§7.2 item 4), falsifier M20, then delete',
    marks: ['core'] }, // :146
  // capsule-reliquary-contract
  { domain: 'capsule-reliquary-contract', label: 'all twenty-seven capsule reliquary prese', cls: 'PIN',
    note: 'count ratchet ("27 focused contracts") of a checker that is itself deleted (review finding 11)' }, // :21
  // projectile-presentation-contract
  { domain: 'projectile-presentation-contract', label: 'all twenty-five projectile presentation ', cls: 'PIN',
    note: 'count ratchet ("25/25 contracts passed") of a checker that is itself deleted — goes with it (review finding 11)' }, // :26
  { domain: 'projectile-presentation-contract', label: 'all nineteen exact endpoint and reason c', cls: 'PIN',
    note: 'anti-weakening count ratchet of a CORE checker (terminal 19/19): move a contract-count floor into the checker, then drop this grep (review finding 11; §7.7 operator question 2)',
    marks: ['core'] }, // :36
  { domain: 'projectile-presentation-contract', label: 'all thirty-six ignition, platform, PHASE', cls: 'PIN',
    note: 'anti-weakening count ratchet of a CORE checker (cindermouth 36/36): move a contract-count floor into the checker, then drop this grep (review finding 11; §7.7 operator question 2)',
    marks: ['core'] }, // :46
  { domain: 'projectile-presentation-contract', label: 'all seventeen destruction geometry, pool', cls: 'PIN',
    note: 'count ratchet ("17/17") of a checker that is itself deleted — goes with it (review finding 11)' }, // :56
  // limb-silhouette-production
  { domain: 'limb-silhouette-production', label: 'production is the default and ?limbs=leg', cls: 'PIN',
    note: 'regex / routing maps read out of the limb renderer source (hand pass: confirmed PIN)' }, // :37
  { domain: 'limb-silhouette-production', label: 'every large body, backdrop and joint kin', cls: 'PIN',
    note: 'regex / routing maps read out of the limb renderer source (hand pass: confirmed PIN)' }, // :39
  { domain: 'limb-silhouette-production', label: 'the A/B retains the former implicit box ', cls: 'PIN',
    note: 'regex / routing maps read out of the limb renderer source (hand pass: confirmed PIN)' }, // :41
  { domain: 'limb-silhouette-production', label: 'omitted distance cards require no extra ', cls: 'PIN',
    note: 'regex / routing maps read out of the limb renderer source (hand pass: confirmed PIN)' }, // :44
  { domain: 'limb-silhouette-production', label: 'under-deck contact line, sister lip and ', cls: 'PIN',
    note: 'regex / routing maps read out of the limb renderer source (hand pass: confirmed PIN)' }, // :47
  { domain: 'limb-silhouette-production', label: 'legacy lip data needs no extra productio', cls: 'PIN',
    note: 'regex / routing maps read out of the limb renderer source (hand pass: confirmed PIN)' }, // :50
  { domain: 'limb-silhouette-production', label: 'production omits the duplicate brown lip', cls: 'PIN',
    note: 'regex / routing maps read out of the limb renderer source (hand pass: confirmed PIN)' }, // :53
  { domain: 'limb-silhouette-production', label: 'far-side reference marks leave with thei', cls: 'PIN',
    note: 'regex / routing maps read out of the limb renderer source (hand pass: confirmed PIN)' }, // :56
  { domain: 'limb-silhouette-production', label: 'omitted accents allocate no replacement ', cls: 'PIN',
    note: 'regex / routing maps read out of the limb renderer source (hand pass: confirmed PIN)' }, // :58
  { domain: 'limb-silhouette-production', label: 'large anatomy uses a beveled polygon ext', cls: 'PIN',
    note: 'regex / routing maps read out of the limb renderer source (hand pass: confirmed PIN)' }, // :60
  { domain: 'limb-silhouette-production', label: 'front, back and contact bevels carry an ', cls: 'PIN',
    note: 'regex / routing maps read out of the limb renderer source (hand pass: confirmed PIN)' }, // :64
  { domain: 'limb-silhouette-production', label: 'three bucket-reused under-deck roots and', cls: 'PIN',
    note: 'regex / routing maps read out of the limb renderer source (hand pass: confirmed PIN)' }, // :67
  { domain: 'limb-silhouette-production', label: 'the fold callback creates no Three.js va', cls: 'PIN',
    note: 'headless frame-budget proxy (draw calls / per-frame allocation / instancing): keep until a GATED frame budget exists (§7.7 operator question 1) — the fold callback allocates nothing per frame',
    marks: ['core'] }, // :74
  { domain: 'limb-silhouette-production', label: 'every fixed pool exposes its silhouette ', cls: 'PIN',
    note: 'regex / routing maps read out of the limb renderer source (hand pass: confirmed PIN)' }, // :76
  { domain: 'limb-silhouette-production', label: 'limb cleanup remains independent of the ', cls: 'PIN',
    note: 'regex / routing maps read out of the limb renderer source (hand pass: confirmed PIN)' }, // :86
  // crown-command-architecture
  { domain: 'crown-command-architecture', label: 'four art organs, buried anatomy, shell h', cls: 'PIN',
    note: 'exact per-kind part counts over the pure Crown plan (not source text — review finding 6 — but an exact count no decision protects)' }, // :53
  { domain: 'crown-command-architecture', label: 'production is default, legacy is a same-', cls: 'PIN',
    note: 'headless frame-budget proxy (draw calls / per-frame allocation / instancing): keep until a GATED frame budget exists (§7.7 operator question 1) — repeated fixed Crown parts are instanced',
    marks: ['core'] }, // :94
  { domain: 'crown-command-architecture', label: 'one atlas upload supplies three independ', cls: 'PIN',
    note: 'regex over the Crown renderer / art / finale source (hand pass: confirmed PIN)' }, // :98
  { domain: 'crown-command-architecture', label: 'the payoff moves six physical shutters a', cls: 'PIN',
    note: 'regex over the Crown renderer / art / finale source (hand pass: confirmed PIN)' }, // :102
  { domain: 'crown-command-architecture', label: 'the debug snapshot exposes modular-art, ', cls: 'PIN',
    note: 'regex over the Crown renderer / art / finale source (hand pass: confirmed PIN)' }, // :105
  { domain: 'crown-command-architecture', label: 'root, core, antenna, shell and turbine a', cls: 'PIN',
    note: 'regex over the Crown renderer / art / finale source (hand pass: confirmed PIN)' }, // :108
  { domain: 'crown-command-architecture', label: 'the Crown obeys the shared built-prefix/', cls: 'PIN',
    note: 'render ownership by regex (nothing renders on an unbuilt or off-camera facet, entry 3): replace with the PLAY-gate ownership probe (§7.2 item 4), falsifier M20, then delete',
    marks: ['core'] }, // :114
  { domain: 'crown-command-architecture', label: 'energy walks only staged nerves, iris an', cls: 'PIN',
    note: 'regex over the Crown renderer / art / finale source (hand pass: confirmed PIN)' }, // :124
  { domain: 'crown-command-architecture', label: 'action projection mutates existing mecha', cls: 'PIN',
    note: 'headless frame-budget proxy (draw calls / per-frame allocation / instancing): keep until a GATED frame budget exists (§7.7 operator question 1) — the Crown mechanics allocate no meshes or textures per frame',
    marks: ['core'] }, // :130
  { domain: 'crown-command-architecture', label: 'the boot owner exposes two palette-appro', cls: 'PIN',
    note: 'regex over the Crown renderer / art / finale source (hand pass: confirmed PIN)' }, // :137
  { domain: 'crown-command-architecture', label: 'all four reusable organs publish stable ', cls: 'PIN',
    note: 'regex over the Crown renderer / art / finale source (hand pass: confirmed PIN)' }, // :142
  { domain: 'crown-command-architecture', label: 'approach, occupation, exposed, rupture a', cls: 'PIN',
    note: 'regex over the Crown renderer / art / finale source (hand pass: confirmed PIN)' }, // :147
  { domain: 'crown-command-architecture', label: 'the two textures settle at the shared ea', cls: 'PIN',
    note: 'regex over the Crown renderer / art / finale source (hand pass: confirmed PIN)' }, // :151
  { domain: 'crown-command-architecture', label: 'desktop and portrait share the same phys', cls: 'PIN',
    note: 'regex over the Crown renderer / art / finale source (hand pass: confirmed PIN)' }, // :156
  { domain: 'crown-command-architecture', label: 'the private payoff clock wakes only for ', cls: 'PIN',
    note: 'regex over the Crown renderer / art / finale source (hand pass: confirmed PIN)' }, // :159
  { domain: 'crown-command-architecture', label: 'real packet, committed attack, Warden ru', cls: 'PIN',
    note: 'regex over the Crown renderer / art / finale source (hand pass: confirmed PIN)' }, // :164
  { domain: 'crown-command-architecture', label: 'the architecture and art owners contain ', cls: 'PIN',
    note: 'regex over the Crown renderer / art / finale source (hand pass: confirmed PIN)' }, // :169
  // hostile-presenter-contract
  { domain: 'hostile-presenter-contract', label: 'ecology, modular, actor, sprite, and pri', cls: 'PIN',
    note: 'count ratchet ("5 lifecycle owners") of a checker that is itself deleted (review finding 11)' }, // :16
  // boot-registry-contract
  { domain: 'boot-registry-contract', label: 'boot bridge ownership and run teardown a', cls: 'PIN',
    note: 'proxy for "a retry replays the same run": replace with the retry-replay test (§7.4 #9, falsifier M34) before the domain goes (review finding 8)',
    marks: ['core'] }, // :14
  { domain: 'boot-registry-contract', label: 'registry manifests retain every declared', cls: 'PIN',
    note: 'exact "13 views, 31 reset owners" — proxy for the retry-replay property: replace (§7.4 #9, falsifier M34) before deleting',
    marks: ['core'] }, // :16
  // adaptive-fidelity-contract
  { domain: 'adaptive-fidelity-contract', label: 'supersample, bloom, and shadow resolutio', cls: 'PIN',
    note: 'anti-weakening ratchet ("3 stable degradation rungs") of a kept checker: move it into the checker (review finding 11; §7.7 operator question 2)',
    marks: ['core'] }, // :16
];
