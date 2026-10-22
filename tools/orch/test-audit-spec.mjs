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
// RANGES: [fromLine, toLine, CLASS, note, marks?] — matched against each call
// site's START line (lib/callsites.mjs). Lines not covered by a range take the
// domain's `default`. marks: 'core' (PIN/TAUTOLOGY with CORE intent), 'scope:shipped' / 'scope:flag'
// (overrides the domain scope for that range), 'fixture'
// (asserts authored fixture data rather than the shipped run).
//
// VERDICT per domain: CORE-GATE (keep in the fast gate), DEEP (keep, optional
// suite), REWRITE (intent worth keeping, mechanism is a pin — replace with a
// behaviour test, then delete), DELETE, SPLIT (assertion-level: see ranges).

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
      [173, 189, 'PIN', 'zipper column timings at exact ms (16 ms stagger, 820 ms last slam)'],
      [192, 192, 'PURE-INVARIANT', 'every next-face column is locked (collidable) before the scroll resumes — gameplay-relevant'],
      [197, 197, 'PIN', 'wave sizes exactly 4..9'],
      [218, 220, 'PURE-INVARIANT', 'wave composition valid and escalating; lane mapping'],
      [227, 227, 'CORE', 'frozen movement constants (hard rule); NB it also pins scrollSpeed 4.3, which entry 11 names a lever, not a frozen constant'],
      [229, 239, 'CORE', 'jump tune frozen + the physical reasoning CLAUDE.md requires alongside it'],
      [242, 242, 'CORE', 'frozen FAR camera pose (entries 7/17) — pins numbers, not the framing'],
      [246, 246, 'PURE-INVARIANT', 'analytic RIG height bound (< 9% of screen)'],
      [248, 252, 'PIN', 'scroll-per-screen fraction, fog near/far 30/74, tracer radius 0.16, wasp radii 0.5/0.55 — no decision protects these'],
      [259, 300, 'PURE-INVARIANT', 'generator column invariants (gap width, landing strip, step height)'],
      [590, 593, 'CORE', 'FAIR-GAP probe boots the real player loop and saw every generated gap'],
      [600, 692, 'CORE', 'FAIR-GAP: every face-1 gap crossable at the SCROLL FLOOR, with speed meter + negative control (I-021/I-024)'],
      [694, 694, 'PIN', 'the first gap is still columns 29-31 at h=2 — pins generator output'],
      [696, 724, 'CORE', 'FAIR-GAP: first gap jumpable both ways, coyote grace, every gap crossable with the taught verbs'],
      [734, 761, 'PURE-INVARIANT', 'chunk variety, height band, flat corner aprons, catwalk cap'],
      [763, 763, 'PIN', 'Vertical Assault final apex pinned at 17'],
      [765, 765, 'PURE-INVARIANT', 'every catwalk within double-jump reach — static, authored-geometry reachability'],
      [774, 790, 'PIN', 'golden generator shape 583/90/79 and fingerprint 10d82694: fails on every intentional level change', ['core']],
      [797, 797, 'CORE', 'fixture build is deterministic (determinism hard rule)'],
      [799, 863, 'PURE-INVARIANT', 'traversal fixture schema / half-open solids / no mutation', ['fixture']],
      [866, 866, 'RETIRED', 'dare dead-end wall adhesion — the dare wager (entries 9/10; entry 21 names it)'],
      [876, 963, 'PURE-INVARIANT', 'traversal slice fixture: overhang, connectors, route graph, fork cap', ['fixture']],
      [974, 985, 'RETIRED', 'dare reward confined to its route + directed retreat path (dare wager, entries 9/10/21)'],
      [988, 988, 'PURE-INVARIANT', 'slice sprint inside its own declared target window', ['fixture']],
      [994, 994, 'RETIRED', 'dare entry margin covers the backtrack (dare wager, entries 9/10/21)'],
      [1010, 1030, 'PURE-INVARIANT', 'camera follow / look-ahead / portrait pullback arithmetic'],
      [1035, 1035, 'PIN', 'portrait multipliers pinned to exactly 1.15 / 1.5 and a 4-6% RIG band; entry 20 makes landscape the phone tuning target'],
    ],
  },

  'view-scale-experiment': {
    scope: 'flag:slice=traversal (+ ?view, hound/polyp trial stages)',
    mechanism: 'pure calls: closed-form fairness arithmetic + decision functions',
    verdict: 'SPLIT',
    default: 'PURE-INVARIANT',
    note: 'Mostly closed-form fairness arithmetic tying hound/polyp tells to player physics, plus unit tests ' +
      'of the ledge/wall/assist/crouch decision functions. Cheap and correct; almost all of it is about the ' +
      'traversal slice and opt-in trial stages, not the shipped run. Its three scope:shipped lines (RIG screen fraction 76-82, the polyp ENEMY row 553, the LOOK-row regex 559) go to the CORE gate / rewrite; everything else is deep.',
    ranges: [
      [47, 52, 'PURE-INVARIANT', 'view-scale table shape'],
      [76, 82, 'CORE', 'analytic RIG screen fraction per view: near ~7%, far ~3.5-4% (concept-art invariant, entry 7/17) — analytic, not measured', ['scope:shipped']],
      [91, 101, 'PIN', 'slice tune ranges (apex 3-3.5, dwell budgets) — no decision protects the slice tune', ['fixture']],
      [314, 320, 'PIN', 'exactly one stage claims the exemption and it is stage 2; default composition is two wasps', ['fixture']],
      [553, 553, 'PURE-INVARIANT', 'sim ENEMY table carries the polyp as configured', ['scope:shipped']],
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
      [161, 161, 'PIN', 'assembly choreography code is retained (entry 3 addendum asks for extractable code, not a test)'],
      [164, 164, 'CORE', 'no transition constant drives an assembly (static anatomy, entry 3)'],
      [168, 168, 'PIN', 'the reserved assembly curve still settles'],
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
      [86, 254, 'RETIRED', 'snap-hook anchors/tether/zip/whip mechanics (hook v1 rejected, entry 5)'],
      [169, 169, 'RETIRED', 'dare pocket cannot hook out (hook v1, entry 5; dare wager, entries 9/10)'],
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
    mechanism: 'child process drives the real sim with ?hook=1',
    verdict: 'DELETE',
    default: 'RETIRED',
    note: 'Proves the rejected hook v1 works when armed (entry 5: inert, no further investment). Keep the code extractable; the test guards nothing a player gets.',
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
    note: 'A render-only flag cannot change the simulation — the shape every "art may fail, gameplay may not change" claim (entry 16) should take.',
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
      [48, 57, 'PIN', 'CONFIG.juice carries exactly the declared blocks and pool sizes'],
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
      [50, 64, 'PIN', 'tune-table shape (weights sum to 1, tiers inside (0,1))'],
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
    note: 'Future-face rows stay invisible before the turn — a static-anatomy reveal invariant on pure ownership functions.',
    ranges: [
      [87, 87, 'PIN', 'handoff pinned to the live 690->1100 ms interval'],
      [89, 89, 'PIN', 'handoff frame retains exactly 19 built arrival columns'],
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
    note: 'The checker asserts the exact ordered id list of the view/reset registries from source text; the wrapper pins "13 views, 31 reset owners". Adding a view fails it.',
    ranges: [[16, 16, 'PIN', 'exact "13 views, 31 reset owners"']],
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
    mechanism: 'boots a REAL browser (tools/playtest/perf-probe.mjs, SwiftShader) and reads its result.json from a FIXED /private/tmp path',
    verdict: 'REWRITE',
    default: 'SLOW-ENV',
    note: 'The only browser boot inside pathcheck — 92% of gate wall time in T-108\'s timed run, and it TIMED OUT (300 s) there. On timeout it still read a result.json written an hour earlier (by another run) from the shared fixed path, so three assertions "passed" on stale data. Its subject (material passes, idle uploads, MSAA) is perf hygiene, not boot.',
    ranges: [
      [22, 22, 'SLOW-ENV', 'the probe boots the shipped scene (real browser; host-load dependent)'],
      [24, 28, 'TAUTOLOGY', 'read from a fixed shared /private/tmp/…/result.json: passes on a stale or foreign result when the probe fails'],
      [32, 32, 'PIN', 'the probe source still contains --throttle / --profile / gl.finish'],
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
