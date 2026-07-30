/* =========================== TRAVERSAL ============================ */
/* The authored traversal slice: its fixture data, the movement-decision
   functions that drive ledge catches and wall contacts, and the pure
   camera/reachability helpers the harness asserts against. No three.js,
   no DOM — runtime geometry arrives through an isSolid callback.      */

import { CONFIG } from '../config.js';

/* Small, DOM-free traversal decisions. Runtime geometry is supplied as an
   isSolid cell callback so authored rectangles and ground use one contract. */
export function traversalLedgeProbe(state, geometry, cfg = CONFIG.player) {
  if (state.grounded || state.vy >= 0 || state.down ||
      state.now < state.recatchUntil) return null;

  const toward = Math.sign(state.hInput || state.vx);
  if (!toward) return null;
  const side = toward;
  const cellX = Math.floor(state.x + side * (state.hw + cfg.ledgeReachX));
  if (cellX < geometry.minCellX || cellX >= geometry.maxCellX) return null;

  const faceX = side > 0 ? cellX : cellX + 1;
  const gap = side > 0
    ? faceX - (state.x + state.hw)
    : (state.x - state.hw) - faceX;
  if (gap < -0.03 || gap > cfg.ledgeReachX) return null;

  const handY = state.y + cfg.ledgeGrabHeight;
  const topY = Math.round(handY);
  if (Math.abs(handY - topY) > cfg.ledgeReachY ||
      !geometry.isSolid(cellX, topY - 1) ||
      geometry.isSolid(cellX, topY)) return null;

  const snapX = faceX - side * (state.hw + 0.001);
  const snapY = topY - cfg.ledgeGrabHeight;
  if (snapX - state.hw < geometry.minPlayerX) return null;
  if (geometry.allowsGrab && !geometry.allowsGrab(cellX, snapY, state.h)) return null;

  // The hanging body and head must both fit on the approach side.
  const outsideX = cellX - side;
  for (let j = Math.floor(snapY + 0.02);
       j <= Math.floor(snapY + state.h - 0.02); j++) {
    if (geometry.isSolid(outsideX, j)) return null;
  }
  return { side, cellX, topY, snapX, snapY };
}

function ledgeLaunch(state, cfg, auto) {
  const entrySpeed = Math.abs(state.entryVx || 0);
  return {
    kind: 'launch',
    auto: !!auto,
    vx: state.side * Math.max(cfg.ledgeLaunchX, entrySpeed),
    vy: cfg.ledgeLaunchY,
    recatchUntil: state.now + cfg.traversalRecatchMs,
  };
}

export function traversalLedgeDecision(state, cfg = CONFIG.player) {
  if (state.down) {
    return { kind: 'release', recatchUntil: state.now + cfg.traversalRecatchMs };
  }
  if (state.jumpBuffered) return ledgeLaunch(state, cfg, false);
  if (state.now >= state.until) {
    // ledgeAutoLaunch (the surge pace): dwell expiry throws you off the ledge
    // instead of dropping you, so a catch can never become a pause. Down still
    // releases and jump still launches early — the player keeps both intents.
    return cfg.ledgeAutoLaunch
      ? ledgeLaunch(state, cfg, true)
      : { kind: 'release', recatchUntil: state.now + cfg.traversalRecatchMs };
  }
  return { kind: 'hang', vx: 0, vy: 0 };
}

export function traversalWallDecision(state, geometry, cfg = CONFIG.player) {
  const side = Math.sign(state.side);
  let touchesWall = false;
  for (let j = Math.floor(state.y + 0.02);
       side !== 0 && !state.grounded &&
       state.cellX >= geometry.minCellX && state.cellX < geometry.maxCellX &&
       j <= Math.floor(state.y + state.h - 0.02); j++) {
    if (geometry.isSolid(state.cellX, j)) { touchesWall = true; break; }
  }
  if (!touchesWall || state.down) {
    return { kind: 'release', recatchUntil: state.now + cfg.traversalRecatchMs };
  }
  if (state.jumpBuffered) {
    return {
      kind: 'jump',
      vx: -side * cfg.wallJumpX,
      vy: cfg.wallJumpY,
      recatchUntil: state.now + cfg.traversalRecatchMs,
    };
  }
  if (state.hInput === -side || state.now >= state.until) {
    return { kind: 'release', recatchUntil: state.now + cfg.traversalRecatchMs };
  }
  return { kind: 'slide', vx: 0, vy: Math.max(state.vy, -cfg.wallSlideSpeed) };
}

// Deterministic traversal showcase, overlaid only by buildTraversalLevel.
// Bounds are half-open and stay wholly on straight face 1 (columns 24..78).
// Route metadata is deliberately explicit so the headless harness can inspect
// topology and timing without reverse-engineering it from render geometry.
export const TRAVERSAL_FIXTURE = {
  id: 'traversal-v1',
  bounds: { x0: 24, x1: 79 },
  targetPlaySeconds: { min: 4, max: 12 },
  run: {
    startScroll: 19,
    endScroll: 73,
    minimumScrollSpeed: 2.6,
    followLeadTiles: 16,
    lookAheadTiles: 2.5,
    portraitMinAspect: 0.9,
    playerSpawn: { x: 27.5, y: 3 },
  },
  movement: {
    runSpeed: 10.8,
    accelGround: 150,
    accelAir: 84,
    jumpVel: 16.5,
    gravity: -42,
    fallGravityMult: 1.6,
    terminalVel: -36,
    jumpCutMult: 0.58,
    airJumpVel: 15.5,
    ledgeHangMs: 240,
    ledgeLaunchX: 10.8,
    ledgeLaunchY: 15.5,
    wallSlideSpeed: 7.5,
    wallSlideMs: 300,
    wallJumpX: 13.5,
    wallJumpY: 16,
    traversalLaunchControlMs: 100,
  },
  entry: 'entry',
  exit: 'rejoin',
  immediateChoiceCap: 3,
  firstFork: { connector: 'entry', choices: ['low-approach', 'mid-entry', 'upper-entry'] },
  groundRuns: [
    { x0: 24, x1: 32, y: 3 },
    { x0: 32, x1: 39, y: 2 },
    { x0: 39, x1: 47, y: 3 },
    { x0: 47, x1: 57, y: 1 },
    { x0: 57, x1: 64, y: 3 },
    { x0: 64, x1: 79, y: 4 },
  ],
  solidRects: [
    { id: 'chimney-left', role: 'wall', x0: 39, x1: 40, y0: 5, y1: 10 },
    { id: 'chimney-right', role: 'wall', x0: 44, x1: 45, y0: 5, y1: 10 },
    { id: 'dare-overhang', role: 'overhang', x0: 48, x1: 56, y0: 5, y1: 6 },
    { id: 'dare-dead-end', role: 'wall', grabbable: false, x0: 56, x1: 57, y0: 1, y1: 7 },
  ],
  platforms: [
    { id: 'mid-entry', x0: 29, x1: 38, y: 5.35 },
    { id: 'upper-entry', x0: 34, x1: 39, y: 8.35 },
    { id: 'chimney-floor', x0: 40, x1: 44, y: 5.35 },
    { id: 'recovery-ledge', x0: 43, x1: 48, y: 3.6 },
    { id: 'mid-bridge', x0: 45, x1: 49, y: 5.35 },
    { id: 'post-mid', x0: 57, x1: 65, y: 5.35 },
    { id: 'post-high', x0: 58, x1: 66, y: 8.35 },
    { id: 'exit-mid', x0: 64, x1: 73, y: 6.35 },
    { id: 'exit-high', x0: 66, x1: 72, y: 9.35 },
  ],
  connectors: [
    { id: 'entry', kind: 'entry', x: 27.5, y: 3 },
    { id: 'low-approach', kind: 'floor', x: 34, y: 2 },
    { id: 'mid-entry', kind: 'ledge', x: 33, y: 5.35 },
    { id: 'upper-entry', kind: 'ledge', x: 36, y: 8.35 },
    { id: 'low-step', kind: 'floor', x: 43, y: 3 },
    { id: 'chimney-base', kind: 'chimney', x: 42, y: 5.35 },
    { id: 'chimney-top', kind: 'chimney', x: 44.5, y: 10 },
    { id: 'recovery', kind: 'ledge', x: 46, y: 3.6 },
    { id: 'pocket-commit', kind: 'dare-commit', x: 48, y: 1 },
    { id: 'pocket-reward', kind: 'reward', x: 54, y: 1 },
    { id: 'pocket-wall', kind: 'wall', x: 55.6, y: 3.4 },
    { id: 'overhang-top', kind: 'solid-top', x: 52, y: 6 },
    { id: 'post-low', kind: 'floor', x: 59, y: 3 },
    { id: 'post-mid', kind: 'ledge', x: 60, y: 5.35 },
    { id: 'post-high', kind: 'ledge', x: 61, y: 8.35 },
    { id: 'exit-mid', kind: 'ledge', x: 68, y: 6.35 },
    { id: 'exit-high', kind: 'ledge', x: 68, y: 9.35 },
    { id: 'rejoin', kind: 'rejoin', x: 75, y: 4 },
  ],
  edges: [
    { routeId: 'lower-service', from: 'entry', to: 'low-approach', verb: 'run' },
    { routeId: 'lower-service', from: 'low-approach', to: 'low-step', verb: 'run-jump' },
    { routeId: 'lower-service', from: 'low-step', to: 'recovery', verb: 'jump' },
    { routeId: 'lower-service', from: 'recovery', to: 'overhang-top', verb: 'ledge-catch' },
    { routeId: 'lower-service', from: 'overhang-top', to: 'post-low', verb: 'wall-jump' },
    { routeId: 'lower-service', from: 'post-low', to: 'rejoin', verb: 'run-jump' },

    { routeId: 'mid-catwalk', from: 'entry', to: 'mid-entry', verb: 'jump' },
    { routeId: 'mid-catwalk', from: 'mid-entry', to: 'chimney-base', verb: 'run-jump' },
    { routeId: 'mid-catwalk', from: 'chimney-base', to: 'overhang-top', verb: 'ledge-chain' },
    { routeId: 'mid-catwalk', from: 'overhang-top', to: 'post-mid', verb: 'wall-jump' },
    { routeId: 'mid-catwalk', from: 'post-mid', to: 'exit-mid', verb: 'run' },
    { routeId: 'mid-catwalk', from: 'exit-mid', to: 'rejoin', verb: 'drop' },

    { routeId: 'upper-chimney', from: 'entry', to: 'mid-entry', verb: 'jump' },
    { routeId: 'upper-chimney', from: 'mid-entry', to: 'upper-entry', verb: 'air-jump' },
    { routeId: 'upper-chimney', from: 'upper-entry', to: 'chimney-top', verb: 'wall-jump' },
    { routeId: 'upper-chimney', from: 'chimney-top', to: 'overhang-top', verb: 'long-drop' },
    { routeId: 'upper-chimney', from: 'overhang-top', to: 'post-high', verb: 'run-air-jump' },
    { routeId: 'upper-chimney', from: 'post-high', to: 'exit-high', verb: 'run' },
    { routeId: 'upper-chimney', from: 'exit-high', to: 'rejoin', verb: 'drop' },

    { routeId: 'wall-launch', from: 'entry', to: 'mid-entry', verb: 'jump' },
    { routeId: 'wall-launch', from: 'mid-entry', to: 'chimney-base', verb: 'jump' },
    { routeId: 'wall-launch', from: 'chimney-base', to: 'chimney-top', verb: 'wall-slide-jump' },
    { routeId: 'wall-launch', from: 'chimney-top', to: 'overhang-top', verb: 'long-drop' },
    { routeId: 'wall-launch', from: 'overhang-top', to: 'post-high', verb: 'run-air-jump' },
    { routeId: 'wall-launch', from: 'post-high', to: 'exit-high', verb: 'run' },
    { routeId: 'wall-launch', from: 'exit-high', to: 'rejoin', verb: 'drop' },

    { routeId: 'dare-pocket', from: 'entry', to: 'low-approach', verb: 'run' },
    { routeId: 'dare-pocket', from: 'low-approach', to: 'pocket-commit', verb: 'run-drop' },
    { routeId: 'dare-pocket', from: 'pocket-commit', to: 'pocket-reward', verb: 'run' },
    { routeId: 'dare-pocket', from: 'pocket-reward', to: 'pocket-wall', verb: 'turn' },
    { routeId: 'dare-pocket', from: 'pocket-wall', to: 'pocket-commit', verb: 'run-left' },
    { routeId: 'dare-pocket', from: 'pocket-commit', to: 'recovery', verb: 'jump-left' },
    { routeId: 'dare-pocket', from: 'recovery', to: 'overhang-top', verb: 'ledge-catch' },
    { routeId: 'dare-pocket', from: 'overhang-top', to: 'post-mid', verb: 'wall-jump' },
    { routeId: 'dare-pocket', from: 'post-mid', to: 'exit-mid', verb: 'run' },
    { routeId: 'dare-pocket', from: 'exit-mid', to: 'rejoin', verb: 'drop' },

    { routeId: 'recovery-scramble', from: 'entry', to: 'mid-entry', verb: 'jump' },
    { routeId: 'recovery-scramble', from: 'mid-entry', to: 'upper-entry', verb: 'air-jump' },
    { routeId: 'recovery-scramble', from: 'upper-entry', to: 'recovery', verb: 'fall-catch' },
    { routeId: 'recovery-scramble', from: 'recovery', to: 'overhang-top', verb: 'jump' },
    { routeId: 'recovery-scramble', from: 'overhang-top', to: 'post-low', verb: 'drop' },
    { routeId: 'recovery-scramble', from: 'post-low', to: 'rejoin', verb: 'run-jump' },
  ],
  routes: [
    { id: 'lower-service', connectorIds: ['entry', 'low-approach', 'low-step', 'recovery', 'overhang-top', 'post-low', 'rejoin'] },
    { id: 'mid-catwalk', connectorIds: ['entry', 'mid-entry', 'chimney-base', 'overhang-top', 'post-mid', 'exit-mid', 'rejoin'] },
    { id: 'upper-chimney', connectorIds: ['entry', 'mid-entry', 'upper-entry', 'chimney-top', 'overhang-top', 'post-high', 'exit-high', 'rejoin'] },
    { id: 'wall-launch', connectorIds: ['entry', 'mid-entry', 'chimney-base', 'chimney-top', 'overhang-top', 'post-high', 'exit-high', 'rejoin'] },
    { id: 'dare-pocket', connectorIds: ['entry', 'low-approach', 'pocket-commit', 'pocket-reward', 'pocket-wall', 'pocket-commit', 'recovery', 'overhang-top', 'post-mid', 'exit-mid', 'rejoin'] },
    { id: 'recovery-scramble', connectorIds: ['entry', 'mid-entry', 'upper-entry', 'recovery', 'overhang-top', 'post-low', 'rejoin'] },
  ],
  darePocket: {
    commit: 'pocket-commit',
    rewardConnector: 'pocket-reward',
    rejoin: 'recovery',
    bounds: { x0: 48, x1: 57 },
    retreatPath: ['pocket-reward', 'pocket-wall', 'pocket-commit', 'recovery'],
    reward: { kind: 'letter', letter: 'H', mode: 'fixed', x: 54, y: 2 },
    timing: { retreatSeconds: 1.5, entryEdgeMarginTiles: 18, minExitMarginTiles: 8 },
  },
  rejoin: { connector: 'rejoin', x0: 72, x1: 79, y: 4 },
  enemies: [
    { id: 'entry-wasp', kind: 'wasp', x: 37, y: 8.4, delayMs: 0 },
    { id: 'rejoin-wasp', kind: 'wasp', x: 63, y: 8.8, delayMs: 600 },
  ],
  // HULL FALLBACK tier 1 (proposal B.1): losing drops RIG to the next route
  // down instead of stopping the world with a modal. Forward position is kept.
  fallback: {
    minDropTiles: 1.2,        // a "lower route" has to be genuinely lower
    dropAboveTiles: 1.2,      // dislodged: placed above the catch, falling onto it
    tossVx: 5.0, tossVy: -3.0, // thrown forward and down — never a dead stop
    groundKnockTiles: 1.5,    // already lowest: you pay margin instead of altitude
    iframesMs: 1400,
    messageMs: 1100,
    maxConsecutive: 3,        // ceiling before the fixture retries (tier 2 unbuilt)
    recoverTiles: 8,          // advancing this far past a fallback clears the streak
  },
};

/* ---------------------- pacing variants (CP1) ------------------------ *
 * Three sharply different pacing arguments over ONE fixture. The geometry,
 * seed, and route graph are identical in every variant, so the operator can
 * A/B them back to back and the only thing that moved is pacing: the pursuit
 * model, where the threats sit, what the routes pay, and how crisp the verbs
 * are. Selected with ?slice=traversal&pace=<id>; `base` is exactly what
 * 15f66d2 shipped and stays the default.
 *
 * Every pursuit model answers one question the DESIGN doc leaves open — "does
 * the pursuing edge maintain constant speed through dare pockets?" — the same
 * way: no. Inside the pocket bounds the edge drops to `pocketSpeed`
 * immediately (not rate-limited), which is what keeps the wager provably
 * escapable at any variant's speed while still advancing, so dawdling in the
 * pocket is never safe.                                                     */
export const TRAVERSAL_PACES = {
  base: {
    id: 'base', label: 'BASE',
    hypothesis:
      'Control: the 15f66d2 accelerated pass unchanged — constant 2.6 edge, ' +
      'two wasps, one pocket reward. If a variant is not clearly better than ' +
      'this, the variant is wrong.',
    pursuit: {
      mode: 'constant', cruiseSpeed: 2.6, minSpeed: 2.6, maxSpeed: 2.6,
      pocketSpeed: 2.6, accel: 0, decel: 0,
    },
  },

  hunt: {
    id: 'hunt', label: 'HUNT',
    // Pressure clock. Same content, same verbs: only the edge changes kind.
    hypothesis:
      'The slice is boring because banked margin never expires: once you are ' +
      'ahead, nothing is timed. A hunting edge that charges (6.8) whenever you ' +
      'are comfortable and eases (2.4) when it is about to crush you removes ' +
      'safe coasting and makes every vertical detour cost measurable ground.',
    pursuit: {
      mode: 'hunt',
      cruiseSpeed: 3.6,       // the neutral band between mercy and comfort
      minSpeed: 2.6,          // mercy: pinned players get room to recover, but
                              //   never LESS pressure than the shipped pass —
                              //   bot runs showed a 2.4 floor made total
                              //   inaction softer in hunt than in base
      maxSpeed: 6.8,          // the charge: standing still is now expensive
      comfortTiles: 11,       // above this much daylight the ship closes
      mercyTiles: 5,          // below this it backs off — fair, and legible
      accel: 4.0, decel: 6.0, // tiles/s² — audible acceleration, no snapping
      pocketSpeed: 2.6,
    },
    enemies: [               // both wasps contest the FAST low line, not the air
      { id: 'low-contest', kind: 'wasp', x: 35, y: 4.9, delayMs: 0,
        tune: { diveRange: 8.5, diveCooldownMs: 900 } },
      { id: 'pocket-mouth', kind: 'wasp', x: 50, y: 6.6, delayMs: 300,
        tune: { cruiseSpeed: 0.5, diveRange: 7.0, diveCooldownMs: 1100 } },
    ],
  },

  swarm: {
    id: 'swarm', label: 'SWARM',
    // Contested space. Pursuit stays near baseline; the routes stop being equal.
    hypothesis:
      'Route choice only matters when routes carry different threats. Six ' +
      'placed hostiles (five wasps + one carrier, no new kinds) give each line ' +
      'its own matchup: the low line is fastest and dive-contested, the mid ' +
      'catwalk is safe but slow, the upper chimney is hardest and the only one ' +
      'that pays a weapon. Geometry becomes a combat decision.',
    pursuit: {
      mode: 'constant', cruiseSpeed: 2.9, minSpeed: 2.6, maxSpeed: 2.9,
      pocketSpeed: 2.6, accel: 0, decel: 0,
    },
    enemies: [
      { id: 'low-contest-a', kind: 'wasp', x: 35, y: 4.8, delayMs: 0,
        tune: { diveRange: 8.5, diveCooldownMs: 900 } },
      { id: 'low-contest-b', kind: 'wasp', x: 46, y: 4.4, delayMs: 500,
        tune: { diveRange: 8.0, diveCooldownMs: 950 } },
      { id: 'pocket-guard', kind: 'wasp', x: 51, y: 6.8, delayMs: 200,
        tune: { cruiseSpeed: 0.4, diveRange: 6.0, diveCooldownMs: 1200 } },
      { id: 'chimney-hold', kind: 'wasp', x: 44, y: 10.6, delayMs: 0,
        tune: { cruiseSpeed: 0.5, diveRange: 7.5, diveCooldownMs: 1000 } },
      { id: 'rejoin-wasp', kind: 'wasp', x: 63, y: 8.8, delayMs: 600 },
      // the lure: killing it arms you, and it only flies over the high line
      { id: 'upper-lure', kind: 'carrier', x: 64, y: 10.6, delayMs: 0,
        tune: { hp: 5 } },
    ],
  },

  surge: {
    id: 'surge', label: 'SURGE',
    // Crescendo + verb crispness. The clock escalates and the verbs compound.
    hypothesis:
      'Intensity should be a crescendo the player answers with skill, not a ' +
      'constant. The edge ramps 2.6 → 7.0 across the pass while every contact ' +
      'auto-converts to a launch and chained launches amplify each other and ' +
      'refund the air jump — so the only way to stay ahead of the ship late in ' +
      'the pass is to keep the chain alive, and the two hardest routes are the ' +
      'ones that pay.',
    pursuit: {
      mode: 'ramp',
      cruiseSpeed: 2.6, minSpeed: 2.6, maxSpeed: 7.0,
      // 6 s, not the 12 s ceiling: bot runs clear this fixture in 6.5-9 s, and a
      // 9 s ramp meant the crescendo never arrived before the exit
      rampMs: 6000,
      accel: 5.0, decel: 6.0,
      pocketSpeed: 3.0,       // the wager gets tighter here, provably still escapable
    },
    pocketTiming: { minExitMarginTiles: 7.0 },
    movement: {               // verbs: no dwell, harder launches
      ledgeHangMs: 90, ledgeAutoLaunch: true,
      wallSlideMs: 160,
      ledgeLaunchX: 11.2, ledgeLaunchY: 16.0,
      wallJumpX: 13.5, wallJumpY: 16.4,
    },
    // Consecutive launches compound FORWARD, never upward: the ceiling check in
    // sim/player.js is endpoint-only, so a chained vertical launch could cross a
    // one-tile overhang in a single clamped 50 ms frame. Forward speed is also
    // the thing that actually beats a pursuing edge, so the restriction costs
    // the design nothing.
    chain: {
      windowMs: 900, step: 0.06, max: 3, refundAirJump: true,
    },
    enemies: [                // placed on the launch arcs: chain fuel, not walls
      { id: 'entry-wasp', kind: 'wasp', x: 37, y: 8.4, delayMs: 0 },
      { id: 'mid-arc-wasp', kind: 'wasp', x: 46, y: 7.2, delayMs: 300,
        tune: { diveRange: 7.5, diveCooldownMs: 1000 } },
      { id: 'rejoin-wasp', kind: 'wasp', x: 63, y: 8.8, delayMs: 600 },
    ],
    rewards: [                // stakes: the high line is armed
      { kind: 'letter', letter: 'S', mode: 'fixed', x: 61, y: 9.9 },
    ],
  },
};

export const TRAVERSAL_PACE_IDS = Object.keys(TRAVERSAL_PACES);

/* Resolve one pace into a complete fixture. Never mutates TRAVERSAL_PACES or
   TRAVERSAL_FIXTURE: every consumer (level build, player tune, HUD, harness)
   reads the resolved object, so a variant cannot leak into another. */
export function resolveTraversalPace(name, fixture = TRAVERSAL_FIXTURE) {
  const pace = TRAVERSAL_PACES[name] || TRAVERSAL_PACES.base;
  return {
    ...fixture,
    pace: { id: pace.id, label: pace.label, hypothesis: pace.hypothesis },
    pursuit: { ...pace.pursuit },
    run: {
      ...fixture.run, ...(pace.run || {}),
      minimumScrollSpeed: pace.pursuit.cruiseSpeed,
    },
    movement: { ...fixture.movement, ...(pace.movement || {}) },
    chain: pace.chain ? { ...pace.chain } : null,
    enemies: (pace.enemies || fixture.enemies).map((e) => ({ ...e })),
    rewards: [fixture.darePocket.reward, ...(pace.rewards || [])]
      .map((r) => ({ ...r })),
    darePocket: {
      ...fixture.darePocket,
      timing: { ...fixture.darePocket.timing, ...(pace.pocketTiming || {}) },
    },
  };
}

/* ---------------------- pursuit (the damage edge) -------------------- *
 * One pure step function for every pace. `constant` is the shipped behavior,
 * `hunt` rubber-bands off the player's own margin, `ramp` escalates with
 * elapsed pass time. The pocket clamp is applied first and is never
 * rate-limited downward, which is what makes the dare retreat provable.   */
export function traversalPaceTargetSpeed(p, ctx) {
  if (ctx.inPocket) return p.pocketSpeed;
  if (p.mode === 'ramp') {
    const u = Math.max(0, Math.min(1, (ctx.elapsedMs || 0) / p.rampMs));
    return p.cruiseSpeed + (p.maxSpeed - p.cruiseSpeed) * u;
  }
  if (p.mode === 'hunt') {
    if (ctx.marginTiles <= p.mercyTiles) return p.minSpeed;
    if (ctx.marginTiles >= p.comfortTiles) return p.maxSpeed;
    return p.cruiseSpeed;
  }
  return p.cruiseSpeed;
}

export function traversalPaceStep(p, current, ctx, dt) {
  const target = traversalPaceTargetSpeed(p, ctx);
  // Committing to the pocket releases pressure on the same frame; leaving it
  // re-accelerates at the pace's own rate, so the release cannot be farmed.
  if (ctx.inPocket) return Math.min(current, target);
  const rate = (target > current ? p.accel : p.decel) * dt;
  const next = target > current
    ? Math.min(target, current + rate)
    : Math.max(target, current - rate);
  return Math.max(p.minSpeed, Math.min(p.maxSpeed, next));
}

// Worst-case tiles the edge can advance during a pocket retreat: the clamp is
// immediate, so it is exactly pocketSpeed × seconds. Stated as a function so
// the harness asserts the same arithmetic the runtime performs.
export function traversalPocketAdvanceTiles(p, seconds) {
  return p.pocketSpeed * seconds;
}

// Launch chaining (surge): consecutive contacts inside the window amplify the
// next launch's FORWARD speed only. Never touches runSpeed, gravity, jumpVel or
// any vertical launch — the frozen movement contract stays frozen, and the
// endpoint-only ceiling check keeps its full one-tile-per-frame budget.
export function traversalChainMult(chain, cfg) {
  if (!cfg) return 1;
  return 1 + cfg.step * Math.max(0, Math.min(chain, cfg.max));
}

/* ------------------- HULL FALLBACK tier 1 (B.1) --------------------- *
 * Pick the route RIG is dislodged onto: the highest surface that is still
 * genuinely below them. `null` means there is nothing lower — the caller
 * pays margin instead of altitude.                                       */
export function traversalFallbackTarget(surfaces, fromY, cfg) {
  let best = null;
  for (const s of surfaces) {
    if (s > fromY - cfg.minDropTiles) continue;
    if (best === null || s > best) best = s;
  }
  return best;
}

export function traversalSolidAllowsGrab(fixture, cellX, y, h) {
  if (!fixture) return true;
  const y0 = Math.floor(y + 0.02);
  const y1 = Math.floor(y + h - 0.02);
  return !(fixture.solidRects || []).some(function (rect) {
    return rect.grabbable === false &&
      cellX >= rect.x0 && cellX < rect.x1 &&
      y1 >= rect.y0 && y0 < rect.y1;
  });
}

export function traversalFollowTarget(scroll, playerRight, screenLeadTiles, run) {
  const lead = Math.max(0, Math.min(run.followLeadTiles, screenLeadTiles));
  return Math.max(scroll, playerRight - lead);
}

export function traversalCameraDepth(baseDepth, aspect, run) {
  return baseDepth * Math.max(1, run.portraitMinAspect / aspect);
}
