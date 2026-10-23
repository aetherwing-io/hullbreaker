// _tiers.mjs — which tier each pathcheck domain belongs to (T-120, from T-108's
// audit: docs/proposals/2026-10-test-audit.md §7.1-§7.3, §7.6 rule 5).
//
// manifest.mjs stays the ONE ordered list of every domain (lanes keep appending
// to it exactly as before). This file only says which of those domains are NOT
// part of the per-change CORE gate, and which CORE domains are independent
// enough to run in a parallel lane. A domain that is in neither list below is a
// CORE domain that runs in the main process, in manifest order — so a lane that
// adds a domain and touches nothing here gets the safe default: it gates every
// change.
//
//   node tools/pathcheck.mjs            CORE  (per-edit hook, merge gate)
//   node tools/pathcheck.mjs --deep     CORE + DEEP (every headless domain)
//   node tools/pathcheck.mjs --tier all CORE + DEEP + PLAY (the pre-T-120 suite)
//
// The runner refuses to start if a name here is not a manifest domain (a stale
// tier map would otherwise silently re-tier nothing).

// DEEP — flag fixtures and prototypes (?slice=traversal paces, ?ribrun=1,
// ?score=1 slice wiring, ?hook=1 / ?flow=1, the fallback-exploit fixture) and the
// playtest harness's self-tests. Correct and kept; never merge-blocking (§7.3).
// Every listed domain has zero call sites in the audit's fast tier and zero
// REWRITE-pending pins (tools/orch/test-audit.json: tier counts per domain).
// The SHARED producers (pathcheck-suite, view-scale-experiment,
// world-transitions) are NOT listed even where their content is mostly deep:
// later CORE domains destructure their values (§7.6 rule 5).
export const DEEP_ONLY = Object.freeze([
  'pacing-variants',
  'movement-verb-prototypes',
  'authored-slope-rib-run',
  'rib-run-driven-through-real-sim',
  'headroom-over-every-authored-ground-run',
  'pursuit-model',
  'score-wiring-sim-layer',
  'snap-hook-driven-through-real-sim',
  'hull-fallback-cannot-pay-itself',
  't-018-bot-harness-relative-geometry',
  't-027-bot-harness-deterministic-dispatch',
  't-025-harness-may-not-report',
  't-029-runtime-truth-three-debug',
]);

// PLAY — needs a real browser. Not run by the headless tiers; the PLAY gate
// (tools/orch/play-gate.mjs) runs it, gated on a GPU host and reported only on
// a GPU-less one (integrator call on the audit's operator question 1).
export const PLAY_ONLY = Object.freeze([
  'render-submission-contract',
]);

// INDEPENDENT — CORE domains that read nothing from SHARED and leave nothing a
// later domain reads, so they may run in a parallel lane process instead of the
// main one. Evidence (T-120, 2026-10-23): each was run ALONE in a fresh process
// (prelude + that domain, empty SHARED) and produced exactly the pass/fail
// counts it produces inside the full serial run; the 16 SHARED consumers and
// producers all differed (they threw) and are therefore not listed. Re-check
// with `node tools/pathcheck.mjs --check-lanes` after adding a domain here.
// A lane is only about wall time: `--serial` runs the same domains in one
// process, in manifest order, exactly like the pre-T-120 runner.
export const INDEPENDENT = Object.freeze([
  'cp4-promotion-full-run-tune',
  'cp4-promotion-wiring-default-run-score',
  'damage-plane-never-leaves-geometry-behind',
  'g1-limb-read-tower-bend-cull',
  'bend-cull-driven-through-real-bullet',
  'g1-1-render-only-proved-sim',
  't-002-ritual-decision-trace-frame',
  't-003-far-view-legibility-compensation',
  't-012-audio-layer-static-guards',
  't-011-juice-feedback-pass',
  't-013-game-shell',
  't-009-static-anatomy-reveal-default',
  't-009-non-gating-station-cannot',
  't-009-pocket-route-works-driven',
  'momentum-earned-pace-escalation',
  'pathcheck-suite-2',
  't-041-impact-language',
  't-039-contact-shadows',
  'pathcheck-suite-3',
  't-035-value-ladder',
  't-038-seam-pips',
  't-047-light-rig',
  't-048-post-pass',
  't-042-audio-punch',
  't-050-shipped-plan-carries-the-scale-pass',
  't-040-rig-sprite',
  't-049-hostile-sprites',
  't-052-hull-texture',
  't-051-backdrop',
  't-054-hull-contrast',
  'fold-handoff-player-ownership',
  'future-facet-render-ownership',
  'mod-route-visibility',
  'limb-fold-bridge-locality',
  'catwalk-built-prefix-visibility',
  'vertical-assault-geometry',
  'gate-prelude-runtime',
  'projectile-presentation-contract',
  'limb-silhouette-production',
  'actor-motion-contract',
  'crown-command-architecture',
  'hostile-presenter-contract',
  'adaptive-fidelity-contract',
  'render-submission-contract',
  'frame-input-contract',
  'gilded-chassis',
  'power-feedback-contract',
  'depth-layer-contract',
  // merged lanes, adopted as they landed (T-120 on each merge of main):
  // T-102's turn proof plays every run in its own fresh child; T-101's deck
  // contract is pure + one child (both read and leave nothing in SHARED)
  't-102-corner-turns',
  'touch-deck-contract',
  // T-120 behaviour tests: each runs its own fresh child processes
  't-120-input-forgiveness',
  't-120-retry-replays-the-run',
  't-120-determinism-and-art-blind-sim',
  't-120-prototype-flags-inert',
]);

// Wall-time hints (ms, each domain run alone at load ~40 on the 4-core cloud
// host, 2026-10-23) used only to balance the lanes (longest first). A missing
// entry counts as 500 ms. Wrong hints cost wall time, never correctness.
export const COST_MS = Object.freeze({
  'g1-1-render-only-proved-sim': 7600,
  't-042-audio-punch': 9100,
  'momentum-earned-pace-escalation': 6300,
  'gate-prelude-runtime': 4300,
  't-049-hostile-sprites': 3800,
  'projectile-presentation-contract': 3800,
  't-035-value-ladder': 2900,
  'actor-motion-contract': 2800,
  't-009-pocket-route-works-driven': 2400,
  't-002-ritual-decision-trace-frame': 2300,
  't-009-static-anatomy-reveal-default': 2200,
  't-054-hull-contrast': 1800,
  'cp4-promotion-wiring-default-run-score': 1400,
  'bend-cull-driven-through-real-bullet': 1400,
  't-009-non-gating-station-cannot': 1200,
  'vertical-assault-geometry': 1050,
  'g1-limb-read-tower-bend-cull': 560,
  'limb-silhouette-production': 540,
  'catwalk-built-prefix-visibility': 480,
  'hostile-presenter-contract': 440,
  't-039-contact-shadows': 350,
  't-041-impact-language': 350,
  't-050-shipped-plan-carries-the-scale-pass': 350,
  't-051-backdrop': 290,
  'limb-fold-bridge-locality': 220,
  't-038-seam-pips': 170,
  't-052-hull-texture': 150,
  't-047-light-rig': 110,
  'pathcheck-suite-3': 100,
  'adaptive-fidelity-contract': 80,
  'gilded-chassis': 40,
  't-048-post-pass': 40,
  // T-102's played matrix: 4 runs under HB_GATE_FAST=1 (23.0 s alone, load ~34),
  // all 41 without it (~380 s alone per T-102's report): a lane of its own
  't-102-corner-turns': process.env.HB_GATE_FAST === '1' ? 23000 : 380000,
  'touch-deck-contract': 1400,
  't-120-retry-replays-the-run': 9000,
  't-120-determinism-and-art-blind-sim': 8000,
  't-120-input-forgiveness': 6000,
  't-120-prototype-flags-inert': 1500,
});
