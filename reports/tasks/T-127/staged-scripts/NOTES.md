# T-121 working notes
- Integrator msg 1: hook v1 + zip released (entry 25, e5ce7d4). Delete whole features incl. hook-only/zip-only pathcheck
  assertions (list each removed label). Fenced files (main.js, sim/player.js, sim/input.js, ui/hud.js, pure/traversal.js,
  pure/frame-input.js, boot/*, render/level.js, render/limb.js, render/route-visibility.js): prepare exact edit list, WAIT for
  go message (after T-101/T-102/T-103 merge), then merge main and finish. ?hook=1/?zip=1 must be inert. Note entry 25 (operator
  liked the corner-building aesthetic; recoverable at bb8e4df).
- Integrator msg 2: tools/pathcheck/g1-1-render-only-proved-sim.mjs (~l.122) is CORE determinism: baseline runs ?zip=1.
  Do NOT delete; re-base baseline onto default reveal; compare vs render-only flags; mutation proof (render-only flag perturbs
  sim -> red). Main hardened gap loops in pathcheck-suite.mjs + g2-neck-access-plate-flip-gate.mjs: merge main before touching.
- Base: e5ce7d4 (src == bb8e4df). pathcheck base 3985/0. smoke mid-route fp final 437a69ce6c9040fa ledger af91377183458396
  (reproduced twice). race lab check --every 8: 29/29 ok digest 8ea94ef8.
- Integrator msg 3 (zip scope split): delete zip RENDER side + ?zip=1 parsing (mode.js), zipper choreography in src/render/*
  (level.js zipper view hooks; route-visibility.js zip branch WAIT until told), zip-only test sites. Do NOT remove SIM-side zipper
  state (wavegate updateZipper, sim/level built/unbuilt + slamSets, routeColumnBuilt, pure/waves zipper rules) — gameplay (I-105).
  If render deletion leaves a sim export with no render consumer, leave it & list it. Hook v1 entirely mine.
- Integrator msg 4 (T-108 8d80f10): g1-1 = only Math.random catcher (M05) -> re-point, never delete. Keep flow halves of mixed
  assertions (snap-hook crush section; mvp :86 :208 :212). Checklist = T-108 test-audit.json DELETE-WITH-FEATURE (50 sites,
  keyed by domain+label). Reconciliation: pathcheck-suite L173-192 (zipperOffset timing, 8 sites) + t-009 L60 test the SIM
  zipper that integrator msg 3 keeps -> KEEP, report. world-transitions L161/L168 (band-slam reserved curve) -> delete with
  pure/transform.js bandSlamOffset/bandSlamLockMs + CONFIG.transform.assembly (fenced: T-102 area + T-101).
- Hook prep verified in scratch clone: pathcheck 3916/0 (69 evals = 31 sites deleted, 5 rewritten, rest loop iterations),
  movement matrix --against base: EQUIVALENT 44/44.
- Integrator msg 5: keep a "flow child ran" guard (relabelled) — DONE in flow-chain-crush-contract.mjs; mutation (child throws)
  -> "FAIL the momentum spine drives the real player loop headlessly with ?flow=1", 0 passed 1 failed; restored.
- Batch 4 labels vs base: g1-1 2 relabelled, t-009 2 converted (inert), 1 removed (zipper hook installed). Batch 3: no label change.
