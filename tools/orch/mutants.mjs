// mutants.mjs — the T-108 binding mutation sample (data for mutation-sample.mjs).
//
// Each mutant: { id, targetClass, kind, site, why, file, from, to, count?,
// expect?, domains? } or `edits: [{file, from, to, count}]` for multi-file ones.
//   targetClass  the class (tools/orch/test-audit-spec.mjs) of the assertion aimed at
//   kind         property  — break the guarded property the way a real regression could
//                evasion   — a property mutant deliberately placed where a pin's regex
//                            does not read (red = the pin saw the property after
//                            all); an existence proof that a pin can miss what it
//                            names, never a kill rate (T-108 review finding 13)
//                refactor  — semantics-preserving rewrite (red = FALSE ALARM)
//                intended  — an intentional design change a decision allows (red = OBSTRUCTION)
//                fix       — the fix for a real, observed defect (red = the gate blocks the fix)
//                blind     — reproduce an entry-20 / integrator-observed defect (red = not blind)
//   site         the aimed-at assertion (tools/pathcheck/<file>:<line>), or 'none'
//   expect       substring of that assertion's FAIL message (targetHit in the results)
//   domains      domain basenames to run; default = every domain except the browser one
//
// Anchors are exact text and their occurrence count is asserted before applying.

export const MUTANTS = [
  /* ------------------------------ CORE ------------------------------ */
  {
    id: 'M01', targetClass: 'CORE', kind: 'property',
    site: 'tools/pathcheck/pathcheck-suite.mjs:708',
    why: 'coyote time silently stops being granted on landing (a late press no longer forgives)',
    file: 'src/sim/player.js',
    from: '    player.coyoteUntil = gameMs + P.coyoteMs;', to: '    player.coyoteUntil = gameMs;',
    expect: 'frames late (one coyote window) still crosses',
  },
  {
    id: 'M02', targetClass: 'CORE', kind: 'property',
    site: 'tools/pathcheck/damage-plane-never-leaves-geometry-behind.mjs:80',
    why: 'the six-face wall stops holding a plane-pinned player (the adversarial F4 shove-through-a-wall regression)',
    file: 'src/sim/player.js',
    from: '        player.x = Math.floor(player.x + player.hw) - player.hw - 0.001;\n', to: '',
    expect: 'a plane-pinned player never ends a frame inside terrain',
  },
  {
    id: 'M03', targetClass: 'CORE', kind: 'property',
    site: 'tools/pathcheck/bend-cull-driven-through-real-bullet.mjs:90',
    why: 'bullets turn corners again (entry 7: they must not)',
    file: 'src/sim/weapons.js',
    from: '      if (crossesBend(BENDS, x0, b.x)) {', to: '      if (false && crossesBend(BENDS, x0, b.x)) {',
    expect: 'one shot fired across a bend, one cull',
  },
  {
    // Kept on purpose as a lesson, excluded from kill rates: the station the
    // test spawns carries no encounterKey, so it is never in gateRows() and this
    // edit changes nothing in the tested scenario — an EQUIVALENT mutant.
    id: 'M04', targetClass: 'CORE', kind: 'equivalent',
    site: 'tools/pathcheck/t-009-non-gating-station-cannot.mjs:66',
    why: 'intended: any surviving body holds the gate. Actually equivalent here: ambient stations are never gate rows',
    file: 'src/sim/wavegate.js',
    from: "  if (c && c.state === 'gate' && !gateRows(c).some(e => e.gating)) {",
    to: "  if (c && c.state === 'gate' && !gateRows(c).length) {",
    expect: 'a non-gating station does not hold the cleared approach',
  },
  {
    id: 'M04b', targetClass: 'CORE', kind: 'property',
    site: 'tools/pathcheck/t-009-non-gating-station-cannot.mjs:69',
    why: 'the wave gate opens while a gating houndframe is still alive (players skip the fight the gate exists for)',
    file: 'src/sim/wavegate.js',
    from: "  if (c && c.state === 'gate' && !gateRows(c).some(e => e.gating)) {",
    to: "  if (c && c.state === 'gate' && !gateRows(c).some(e => e.gating && e.kind !== 'hound')) {",
    expect: 'a gating hound still holds it',
  },
  {
    id: 'M05', targetClass: 'CORE', kind: 'property',
    site: 'tools/pathcheck/g1-1-render-only-proved-sim.mjs:138',
    why: 'determinism: Math.random() enters the sim (wasp dive lock jitter, lengthen-only so no fairness bound moves)',
    file: 'src/sim/hostiles.js',
    from: '        e.lockUntil = gameMs + WASP_DIVE_LOCK_MS;',
    to: '        e.lockUntil = gameMs + WASP_DIVE_LOCK_MS * (1 + 0.2 * Math.random());',
    expect: 'every simulated value is identical',
  },
  {
    id: 'M06', targetClass: 'CORE', kind: 'property',
    site: 'tools/pathcheck/t-043-wasp-aim-lock-squad.mjs:132',
    why: 'a wasp dives the frame it commits — the aim-lock tell is gone',
    file: 'src/sim/hostiles.js',
    from: '      const launched = diveLaunched(gameMs, e.lockUntil);', to: '      const launched = true;',
    expect: 'it never moves before the lock elapses',
  },
  {
    id: 'M07', targetClass: 'CORE', kind: 'property',
    site: 'tools/pathcheck/movement-verb-prototypes.mjs:66',
    why: '?hook=1 stops being inert: the rejected hook arms by default in the traversal slice (CLAUDE.md: keep it inert)',
    file: 'src/mode.js',
    from: "export const HOOK_ENABLED = IS_TRAVERSAL_SLICE && QUERY.get('hook') === '1';",
    to: "export const HOOK_ENABLED = IS_TRAVERSAL_SLICE && QUERY.get('hook') !== '0';",
    expect: 'no ?hook / ?flow: every pace resolves exactly as it shipped',
  },
  {
    id: 'M08', targetClass: 'CORE', kind: 'property',
    site: 'tools/pathcheck/_context.mjs guardLayer(sim)',
    why: 'layer purity: the sim imports the renderer',
    file: 'src/sim/time.js',
    from: "import { JUICE_ENABLED } from '../mode.js';",
    to: "import { JUICE_ENABLED } from '../mode.js';\nimport { renderer } from '../render/scene.js';",
  },
  {
    id: 'M09', targetClass: 'CORE', kind: 'property',
    site: 'tools/pathcheck/t-038-seam-pips.mjs:137',
    why: 'palette rule: a raw hex literal lands in a tokenized render file',
    file: 'src/render/seams.js',
    from: "import { CONFIG } from '../config.js';",
    to: "import { CONFIG } from '../config.js';\nconst DEBUG_PIP_TINT = 0xff3366;",
    expect: 'carries no raw color literal',
  },
  {
    id: 'M10', targetClass: 'CORE', kind: 'property',
    site: 'tools/pathcheck/t-049-hostile-sprites.mjs:89',
    why: 'entry 16: the sim branches on whether art loaded (wasp hitbox grows when a render-set global says the art is ready)',
    file: 'src/sim/hostiles.js',
    from: 'hitR: CONFIG.wasp.contactRadius, shotR: CONFIG.wasp.shotRadius, gating: true },',
    to: 'hitR: CONFIG.wasp.contactRadius * (globalThis.__HB_ART_READY__ ? 1.2 : 1), shotR: CONFIG.wasp.shotRadius, gating: true },',
    expect: 'must not be able to tell whether the art loaded',
  },
  {
    id: 'M11', targetClass: 'CORE', kind: 'property',
    site: 'tools/pathcheck/g2-neck-access-plate-flip-gate.mjs:673',
    why: 'the air jump is never restored on landing (double jump lost after the first one)',
    file: 'src/sim/player.js',
    from: '    player.coyoteUntil = gameMs + P.coyoteMs;\n    player.airJumpsLeft = P.airJumps;',
    to: '    player.coyoteUntil = gameMs + P.coyoteMs;\n    player.airJumpsLeft = 0;',
    expect: 'double-jump apex clears the +3 high-lane offset',
  },
  {
    id: 'M12', targetClass: 'CORE', kind: 'property',
    site: 'tools/pathcheck/render-submission-contract.mjs:22 (and every headless domain)',
    why: 'the game no longer boots: src/main.js throws during module evaluation (blank page + failsafe panel)',
    file: 'src/main.js',
    from: 'installFailsafe({ restart: () => resetGame() });',
    to: "installFailsafe({ restart: () => resetGame() });\nif (!globalThis.__HB_NO_BOOT_BUG__) throw new Error('boot regression (T-108 mutant)');",
  },
  {
    id: 'M13', targetClass: 'SLOW-ENV', kind: 'property',
    site: 'tools/pathcheck/render-submission-contract.mjs:22',
    why: 'same boot-breaking throw, run against the ONE browser domain (perf probe) — does it go red, and for which assertions?',
    file: 'src/main.js',
    from: 'installFailsafe({ restart: () => resetGame() });',
    to: "installFailsafe({ restart: () => resetGame() });\nif (!globalThis.__HB_NO_BOOT_BUG__) throw new Error('boot regression (T-108 mutant)');",
    domains: ['render-submission-contract'],
    expect: 'boots the shipped scene',
  },

  /* ------------------------- PURE-INVARIANT ------------------------- */
  {
    id: 'M14', targetClass: 'PURE-INVARIANT', kind: 'property',
    site: 'tools/pathcheck/t-011-juice-feedback-pass.mjs:127',
    why: 'outside a hit-stop freeze the world runs 25% fast',
    file: 'src/pure/juice.js',
    from: '  return gameMs < until ? J.scale : 1;', to: '  return gameMs < until ? J.scale : 1.25;',
    expect: 'an uneventful frame leaves the world running',
  },
  {
    id: 'M15', targetClass: 'PURE-INVARIANT', kind: 'property',
    site: 'tools/pathcheck/t-039-contact-shadows.mjs:123',
    why: 'contact shadow keeps drawing (with negative opacity) above its configured ceiling',
    file: 'src/pure/contactShadow.js',
    from: '  if (h >= cfg.ceiling) return { opacity: 0, radiusMult: cfg.minRadiusMult };',
    to: '  if (h >= cfg.ceiling * 2) return { opacity: 0, radiusMult: cfg.minRadiusMult };',
    expect: 'opacity reaches EXACTLY 0 at the configured ceiling',
  },
  {
    id: 'M16', targetClass: 'PURE-INVARIANT', kind: 'property',
    site: 'tools/pathcheck/t-038-seam-pips.mjs:63',
    why: 'deck seam pips run three tiles past the ledge they advertise',
    file: 'src/pure/seams.js',
    from: '      run.s0, run.s1, cfg.pipEvery, cfg.edgeMargin, cfg.clusterGap || 0,',
    to: '      run.s0, run.s1 + 3, cfg.pipEvery, cfg.edgeMargin, cfg.clusterGap || 0,',
    expect: 'every pip sits inside its own run',
  },
  {
    id: 'M17', targetClass: 'PURE-INVARIANT', kind: 'property',
    site: 'tools/pathcheck/pathcheck-suite-2.mjs:51',
    why: 'durability: ONE bad frame restarts the run',
    file: 'src/pure/failsafe.js',
    from: '  if (next.faults >= policy.minFaults && t - next.firstMs >= policy.recoverAfterMs) {',
    to: '  if (next.faults >= 1) {',
    expect: 'ONE bad frame is a blip',
  },
  {
    id: 'M18', targetClass: 'PURE-INVARIANT', kind: 'property',
    site: 'tools/pathcheck/momentum-earned-pace-escalation.mjs:69',
    why: 'entry 11: a struggling player (drive 0) is pushed 5% faster than the shipped floor',
    file: 'src/pure/momentum.js',
    from: '  return baseSpeed * (1 + (cfg.ceilMult - 1) * clamp01(drive));',
    to: '  return baseSpeed * (1.05 + (cfg.ceilMult - 1) * clamp01(drive));',
    expect: 'FLOOR: drive 0 is the shipped scroll speed EXACTLY',
  },
  {
    id: 'M19', targetClass: 'PURE-INVARIANT', kind: 'property',
    site: 'tools/pathcheck/view-scale-experiment.mjs:159',
    why: 'a hound retune shortens its telegraph below twice the reaction cost',
    file: 'src/config.js',
    from: '    tellMs: 460,               // compact reaction window; the final local coil is the lock',
    to: '    tellMs: 200,               // compact reaction window; the final local coil is the lock',
    expect: 'hound telegraph is at least twice the reaction cost',
  },

  /* ------------------------------- PIN ------------------------------ */
  {
    id: 'M20', targetClass: 'PIN', kind: 'evasion',
    site: 'tools/pathcheck/mod-route-visibility.mjs:14',
    why: 'ghost-squad clones are drawn 40 tiles ahead, on an unbuilt facet — the property the regex claims to guard',
    file: 'src/render/mods.js',
    from: '      placeOnTower(cm, p.x, p.y + 0.85, 0);', to: '      placeOnTower(cm, p.x + 40, p.y + 0.85, 0);',
    expect: 'each clone slot clears stale art',
  },
  {
    id: 'M21', targetClass: 'PIN', kind: 'refactor',
    site: 'tools/pathcheck/mod-route-visibility.mjs:14',
    why: 'rename the loop local `cm` to `clone` (no behaviour change)',
    file: 'src/render/mods.js',
    from: '      const cm = cloneMeshes[d];\n      cm.visible = false;\n      if (!p || !routeRenderable(p.x)) continue;\n      cm.visible = true;\n      placeOnTower(cm, p.x, p.y + 0.85, 0);',
    to: '      const clone = cloneMeshes[d];\n      clone.visible = false;\n      if (!p || !routeRenderable(p.x)) continue;\n      clone.visible = true;\n      placeOnTower(clone, p.x, p.y + 0.85, 0);',
    expect: 'each clone slot clears stale art',
  },
  {
    id: 'M22', targetClass: 'PIN', kind: 'refactor',
    site: 'tools/pathcheck/pathcheck-suite-2.mjs:245',
    why: 'rename the frame loop\'s catch binding `err` to `e` (no behaviour change)',
    file: 'src/main.js',
    from: "      } catch (err) {\n        if (reportFault('update', err) === 'stop') return;",
    to: "      } catch (e) {\n        if (reportFault('update', e) === 'stop') return;",
    expect: 'a simulation fault is caught and handed to the policy',
  },
  {
    id: 'M23', targetClass: 'PIN', kind: 'evasion',
    site: 'tools/pathcheck/pathcheck-suite-2.mjs:291',
    why: 'durability: a fault storm that should RESTART the run halts it instead (the recover branch is dead) — ui/failsafe.js',
    file: 'src/ui/failsafe.js',
    from: "  if (next.action === 'recover') {\n    log('restarting the run after a broken frame",
    to: "  if (next.action === 'recover' && false) {\n    log('restarting the run after a broken frame",
    expect: 'uncaught errors AND broken frames run through the same fault streak',
  },
  {
    id: 'M24', targetClass: 'PIN', kind: 'refactor',
    site: 'tools/pathcheck/boot-registry-contract.mjs:14',
    why: 'add one space inside a registry entry (whitespace only)',
    file: 'src/boot/view-init.js',
    from: "  Object.freeze({ id: 'camera', init: initCameraView }),",
    to: "  Object.freeze({ id: 'camera',  init: initCameraView }),",
    expect: 'boot bridge ownership and run teardown are explicit ordered registries',
  },
  {
    id: 'M25', targetClass: 'PIN', kind: 'refactor',
    site: 'tools/pathcheck/catwalk-built-prefix-visibility.mjs:108',
    why: 'swap the operands of one catwalk-overlap comparison in sim/player.js (identical semantics)',
    file: 'src/sim/player.js',
    from: '          if (player.x + player.hw > pl.x0 && player.x - player.hw < pl.x1 &&',
    to: '          if (pl.x0 < player.x + player.hw && player.x - player.hw < pl.x1 &&',
    expect: 'player collision still consumes the original authored catwalk extents',
  },
  {
    id: 'M26', targetClass: 'CORE', kind: 'refactor',
    site: 'driven domains (control)',
    why: 'swap two independent statements in the landing branch of sim/player.js (no behaviour change) — driven tests should stay green',
    file: 'src/sim/player.js',
    from: '    player.coyoteUntil = gameMs + P.coyoteMs;\n    player.airJumpsLeft = P.airJumps;',
    to: '    player.airJumpsLeft = P.airJumps;\n    player.coyoteUntil = gameMs + P.coyoteMs;',
  },
  {
    id: 'M33', targetClass: 'PIN', kind: 'evasion',
    site: 'tools/pathcheck/catwalk-built-prefix-visibility.mjs:108',
    why: 'the last half tile of every catwalk stops being solid (players drop off early); the regex still matches its prefix',
    file: 'src/sim/player.js',
    from: '          if (player.x + player.hw > pl.x0 && player.x - player.hw < pl.x1 &&',
    to: '          if (player.x + player.hw > pl.x0 && player.x - player.hw < pl.x1 - 0.5 &&',
    expect: 'player collision still consumes the original authored catwalk extents',
  },
  {
    id: 'M34', targetClass: 'PIN', kind: 'evasion',
    site: 'tools/pathcheck/boot-registry-contract.mjs:16',
    why: 'run teardown: the hostile RNG owner stays registered but no longer resets (a retry no longer replays the same run)',
    file: 'src/boot/run-reset.js',
    from: "  { id: 'hostile-rng', reset: resetHostileRng },",
    to: "  { id: 'hostile-rng', reset: () => {} },",
    expect: 'registry manifests retain every declared owner',
  },
  {
    id: 'M35', targetClass: 'PIN', kind: 'evasion',
    site: 'tools/pathcheck/pathcheck-suite-2.mjs:263',
    why: 'durability: a resumed tab advances the whole gap again (catch-up multiplier) while the regexed Math.min(50, t - last) text stays',
    file: 'src/main.js',
    from: '    : Math.max(0, Math.min(50, t - last)) / 1000;',
    to: '    : Math.max(0, Math.min(50, t - last)) / 1000 * (t - last > 50 ? (t - last) / 50 : 1);',
    expect: 'the frame loop clamps dt',
  },
  {
    id: 'M27', targetClass: 'PIN', kind: 'intended',
    site: 'tools/pathcheck/pathcheck-suite.mjs:774,790',
    why: 'entry 20 "the sides are a little short": lengthen every face by 20% (88 -> 106 tiles, levelLength 583 -> 691 to match) — a change the operator asked for',
    edits: [
      { file: 'src/config.js', count: 1,
        from: '  levelLength: 583,            // tiles = 24 intro + 6 faces × 88 + 31 outro',
        to: '  levelLength: 691,            // tiles = 24 intro + 6 faces × 106 + 31 outro' },
      { file: 'src/config.js', count: 1,
        from: '    faces: 6, faceTiles: 88, introTiles: 24, outroTiles: 31,',
        to: '    faces: 6, faceTiles: 106, introTiles: 24, outroTiles: 31,' },
    ],
    expect: 'normal generator shape pinned',
  },
  {
    // Kept as a robustness finding, excluded from rates: the same edit made
    // INCOMPLETELY (faceTiles without levelLength) does not fail the gate, it
    // HANGS it — pathcheck-suite.mjs's gap-run scan never advances over the
    // undefined columns past levelLength. Run with --timeout-ms 120000.
    id: 'M27h', targetClass: 'PIN', kind: 'robustness',
    site: 'tools/pathcheck/pathcheck-suite.mjs:280-300 (gap-run scan)',
    why: 'an incomplete config edit (faceTiles 88 -> 106 without levelLength) — the gate should go red; it hangs instead',
    file: 'src/config.js',
    from: '    faces: 6, faceTiles: 88, introTiles: 24, outroTiles: 31,',
    to: '    faces: 6, faceTiles: 106, introTiles: 24, outroTiles: 31,',
  },

  /* ----------------------------- RETIRED ---------------------------- */
  {
    id: 'M28', targetClass: 'RETIRED', kind: 'fix',
    site: 'tools/pathcheck/pathcheck-suite-2.mjs:146',
    why: 'fix the integrator-observed touch defect: the failsafe panel says "Press R, or click the button" on a phone',
    file: 'index.html',
    from: '"hint": "Press R, or click the button, to play again.",',
    to: '"hint": "Tap the button to play again.",',
    expect: 'the panel names BOTH ways back in',
  },
  {
    id: 'M29', targetClass: 'RETIRED', kind: 'intended',
    site: 'tools/pathcheck/pathcheck-suite.mjs:994',
    why: 'retune the retired dare pocket: shrink its entry margin 18 -> 12 tiles (entries 9/10/21 retired the wager)',
    file: 'src/pure/traversal.js',
    from: 'timing: { retreatSeconds: 1.5, entryEdgeMarginTiles: 18, minExitMarginTiles: 8 },',
    to: 'timing: { retreatSeconds: 1.5, entryEdgeMarginTiles: 12, minExitMarginTiles: 8 },',
    expect: 'dare entry margin covers backtrack',
  },
  {
    id: 'M30', targetClass: 'RETIRED', kind: 'intended',
    site: 'tools/pathcheck/snap-hook-driven-through-real-sim.mjs:207',
    why: 'touch the rejected hook v1 (entry 5): lengthen its dangle 110 -> 160 ms',
    file: 'src/pure/traversal.js',
    from: '  hangMs: 110,              // the dangle. Auto-whips on expiry, always.',
    to: '  hangMs: 160,              // the dangle. Auto-whips on expiry, always.',
    expect: 'dangle',
  },

  /* ---------------------------- TAUTOLOGY --------------------------- */
  {
    id: 'M31', targetClass: 'TAUTOLOGY', kind: 'property',
    site: 'tools/pathcheck/t-040-rig-sprite.mjs:110',
    why: 'the gun box is lifted 0.3 tiles off RIG\'s hand axis; the assertion compares the gun span to the constant it is computed from',
    file: 'src/pure/rig.js',
    from: 'export const GUN_BOX = { w: 0.75, h: 0.14, d: 0.14, x: 0.45, y: 0, z: 0 };',
    to: 'export const GUN_BOX = { w: 0.75, h: 0.14, d: 0.14, x: 0.45, y: 0.3, z: 0 };',
    expect: 'gun inner x matches the exported constant',
  },
  {
    id: 'M32', targetClass: 'TAUTOLOGY', kind: 'property',
    site: 'tools/pathcheck/t-011-juice-feedback-pass.mjs:283',
    why: 'the sim imports a render module — the domain\'s own guard vs. the prelude guard that runs first',
    file: 'src/sim/time.js',
    from: "import { JUICE_ENABLED } from '../mode.js';",
    to: "import { JUICE_ENABLED } from '../mode.js';\nimport { JUICE } from '../render/juice.js';",
    expect: 'sim layer imports no render module',
  },

  /* ------------------------ BLIND (entry 20) ------------------------ */
  {
    id: 'B1', targetClass: 'NONE', kind: 'blind',
    site: 'none', why: 'entry 20 "guns don\'t align to hands": draw the gun 0.35 tiles above and 0.12 ahead of the hand socket (render only)',
    file: 'src/render/player.js',
    from: '  gunGroup.position.set(0, player.muzzleY, 0.25);',
    to: '  gunGroup.position.set(0.12, player.muzzleY + 0.35, 0.25);',
  },
  {
    id: 'B2', targetClass: 'NONE', kind: 'blind',
    site: 'none', why: 'integrator: portrait title clips "HULLBREAKER" — force the title wider than a 390-px viewport',
    file: 'index.html',
    from: '    font-size: clamp(42px, 7vw, 94px); line-height: .9; letter-spacing: .115em;',
    to: '    font-size: clamp(84px, 7vw, 94px); line-height: .9; letter-spacing: .115em;',
  },
  {
    id: 'B3', targetClass: 'NONE', kind: 'blind',
    site: 'none', why: 'integrator: HUD covers the top-left of 844x390 — make every HUD panel 60% of the viewport',
    file: 'index.html',
    from: '    position: fixed; z-index: 10; user-select: none; pointer-events: none;',
    to: '    position: fixed; z-index: 10; user-select: none; pointer-events: none; min-width: 60vw; min-height: 45vh;',
  },
  {
    id: 'B4', targetClass: 'NONE', kind: 'blind',
    site: 'tools/pathcheck/fold-handoff-player-ownership.mjs:47',
    why: 'entry 20 "turns don\'t quite work right": the sim starts the corner ritual 1.5 tiles before RIG physically reaches the joint',
    file: 'src/sim/wavegate.js',
    from: '  if (!c || !cornerApproachReady(c.state, playerX, BEND_S[c.k - 1])) return false;',
    to: '  if (!c || !cornerApproachReady(c.state, playerX + 1.5, BEND_S[c.k - 1])) return false;',
    expect: 'the ritual starts on physical arrival',
  },
  {
    id: 'B5', targetClass: 'NONE', kind: 'blind',
    site: 'none', why: 'integrator: preload images fetched twice (crossorigin mismatch) — make it worse: a sixth uncredentialed preload',
    file: 'index.html',
    from: '<link rel="preload" as="image" type="image/webp" href="assets/generated/environment/meridian-component-atlas-v1.webp">',
    to: '<link rel="preload" as="image" type="image/webp" href="assets/generated/environment/meridian-component-atlas-v1.webp">\n<link rel="preload" as="image" type="image/webp" href="assets/generated/ui/title-meridian-ascent-v1.webp">',
  },
  /* ------------- review pass (2026-10-23): falsifiers for the rewrite list ------------- */
  // Each breaks a property whose CURRENT check is a PIN marked for rewrite, or a
  // check this pass reclassified. Run against today's gate they show what the
  // existing line catches; the replacement test must turn the same mutant red
  // before the old line is deleted (proposal §7.6).
  {
    id: 'M36', targetClass: 'PIN', kind: 'property',
    site: 'tools/pathcheck/pathcheck-suite-2.mjs:195',
    why: 'T-032: the boot watchdog never tells the player a boot that never finished (the slow-boot panel is dead)',
    file: 'index.html',
    from: "setTimeout(function () { if (!booted) show('slow')", to: "setTimeout(function () { if (false) show('slow')",
    expect: 'a boot that never finishes is told to the player',
  },
  {
    id: 'M37', targetClass: 'PIN', kind: 'property',
    site: 'tools/pathcheck/pathcheck-suite-2.mjs:191',
    why: 'T-032: the failsafe listens in the bubble phase, so a game module that never loaded (its error fires at the <script>, not the page) shows no panel',
    file: 'index.html',
    from: "  addEventListener('error', caught, true);", to: "  addEventListener('error', caught, false);",
    expect: 'it listens in the CAPTURE phase for errors',
  },
  {
    id: 'M38', targetClass: 'CORE', kind: 'property',
    site: 'tools/pathcheck/future-facet-render-ownership.mjs:37',
    why: 'static anatomy (entry 3): route-bound art on the NEXT face becomes visible before the turn',
    file: 'src/pure/path.js',
    from: '    worldFacetAt(s, cfg, bends) === activeWorldFacet(scroll, cameraFacet, cfg);',
    to: '    worldFacetAt(s, cfg, bends) <= activeWorldFacet(scroll, cameraFacet, cfg) + 1;',
    expect: 'pre-turn render ownership exposes zero future rows',
  },
  {
    id: 'M39', targetClass: 'CORE', kind: 'property',
    site: 'tools/pathcheck/snap-hook-driven-through-real-sim.mjs:257',
    why: '?flow=1: a hit no longer un-earns the momentum chain (the chain survives the damage path)',
    file: 'src/sim/player.js',
    from: '  if (FLOW_ENABLED) flowBreak();\n  player.hp -= amount;', to: '  player.hp -= amount;',
    expect: 'a lethal hit mid-chain also un-earns the chain',
  },
  {
    id: 'M39b', targetClass: 'CORE', kind: 'property',
    site: 'tools/pathcheck/snap-hook-driven-through-real-sim.mjs:244',
    why: '?flow=1: neither a hit nor a lost life un-earns the momentum chain (both flowBreak calls removed — M39 removed only the hit one, and a lethal hit still breaks the chain through loseLife)',
    edits: [
      { file: 'src/sim/player.js', count: 1, from: '  if (FLOW_ENABLED) flowBreak();\n  player.hp -= amount;', to: '  player.hp -= amount;' },
      { file: 'src/sim/player.js', count: 1, from: '  if (FLOW_ENABLED) flowBreak();\n  if (ACTIVE_FIXTURE) {', to: '  if (ACTIVE_FIXTURE) {' },
    ],
    expect: 'dies on the crush frame',
  },
  {
    id: 'M40', targetClass: 'PIN', kind: 'property',
    site: 'tools/pathcheck/t-039-contact-shadows.mjs:162',
    why: 'frame budget: contact shadows add a second instanced draw call to the scene',
    file: 'src/render/contact.js',
    from: '  scene.add(mesh);\n}', to: '  scene.add(mesh);\n  scene.add(new THREE.InstancedMesh(geo, mat, POOL_MAX));\n}',
    expect: 'exactly one InstancedMesh',
  },
];
