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

export function traversalLedgeDecision(state, cfg = CONFIG.player) {
  if (state.down) {
    return { kind: 'release', recatchUntil: state.now + cfg.traversalRecatchMs };
  }
  if (state.jumpBuffered) {
    const entrySpeed = Math.abs(state.entryVx || 0);
    return {
      kind: 'launch',
      vx: state.side * Math.max(cfg.ledgeLaunchX, entrySpeed),
      vy: cfg.ledgeLaunchY,
      recatchUntil: state.now + cfg.traversalRecatchMs,
    };
  }
  if (state.now >= state.until) {
    return { kind: 'release', recatchUntil: state.now + cfg.traversalRecatchMs };
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
};

/* ===================== HOUNDFRAME TRIAL (opt-in) ==================== *
 * DESIGN's teach → test rule for the floor-denial enemy, laid over the same
 * fixture and reached only through ?hound=. Stage data lives outside
 * TRAVERSAL_FIXTURE.enemies on purpose: the slice's default composition (and
 * any retune of it) stays untouched, and traversalEnemyPlan picks exactly one
 * authored list per attempt.
 *
 * `deck` is the authored ground height the hound owns — the spawn height is
 * derived from CONFIG.hound.rideY so the frame always sits on that plate, and
 * `patrol` keeps each hound pacing one ground run of the fixture instead of
 * wandering the level. Every authored beat sits on a floor the player would
 * otherwise sprint across without a decision.
 *
 * `contests` names the fixture route each hostile is assigned to, because the
 * placement pattern is per-route threat assignment (docs/concept-art shows the
 * quadruped standing on one route's platform while wasps work another):
 * choosing a route chooses a matchup. Hounds take the floor routes; the
 * upper-chimney and wall-launch routes stay a pure air problem, and the
 * harness asserts that separation so it cannot quietly erode.            */
export const HOUND_TRIAL = {
  id: 'hound-trial-v1',
  stages: {
    // teach: floor pressure only. Three plates the low route needs, each one
    // temporarily wrong to stand on. Answer: jump, wall-launch, or drop behind.
    solo: {
      label: 'HOUND SOLO',
      replacesFixtureEnemies: true,
      enemies: [
        { id: 'hound-teach', kind: 'hound', contests: 'lower-service',
          deck: 3, x: 45.5, dir: -1, delayMs: 0, patrol: { x0: 39.5, x1: 46.5 } },
        { id: 'hound-pocket', kind: 'hound', contests: 'dare-pocket',
          deck: 1, x: 54.5, dir: -1, delayMs: 400, patrol: { x0: 48.5, x1: 55.5 } },
        { id: 'hound-rejoin', kind: 'hound', contests: 'lower-service',
          deck: 3, x: 63.5, dir: -1, delayMs: 800, patrol: { x0: 57.5, x1: 63.5 } },
      ],
    },
    // test: the documented combination — "hound forces the jump that the wasp
    // contests". The wasp cruises the arc directly over the hound's plate, so
    // the movement answer to the charge is the one the air threat punishes.
    combo: {
      label: 'HOUND + WASP',
      replacesFixtureEnemies: true,
      enemies: [
        { id: 'hound-squeeze', kind: 'hound', contests: 'lower-service',
          deck: 3, x: 45.5, dir: -1, delayMs: 0, patrol: { x0: 39.5, x1: 46.5 } },
        { id: 'squeeze-wasp', kind: 'wasp', contests: 'lower-service',
          x: 44, y: 7.6, delayMs: 300 },
        { id: 'hound-rejoin', kind: 'hound', contests: 'lower-service',
          deck: 3, x: 63.5, dir: -1, delayMs: 900, patrol: { x0: 57.5, x1: 63.5 } },
      ],
    },
  },
};

export function houndTrialStage(name) {
  return (name && HOUND_TRIAL.stages[name]) || null;
}

// One attempt's authored hostiles. With no trial selected this returns the
// fixture's own list unchanged, so the default slice stays byte-identical.
export function traversalEnemyPlan(fixture, trialName, cfg = CONFIG) {
  if (!fixture) return [];
  const stage = houndTrialStage(trialName);
  if (!stage) return fixture.enemies;
  const authored = stage.enemies.map(function (e) {
    return e.deck === undefined ? { ...e } : { ...e, y: e.deck + cfg.hound.rideY };
  });
  return stage.replacesFixtureEnemies ? authored : fixture.enemies.concat(authored);
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
