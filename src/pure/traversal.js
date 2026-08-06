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
    // The chimney walls start one row higher than the shaft floor on purpose.
    // Rows 5-10 put their underside 2.0 tiles over the low route's y:3 deck at
    // x 39 and 44, which left a 1.7-tall RIG a 0.3-tile threading window: run
    // the low line a fraction high (a hop, a landing bounce) and you bonked an
    // invisible underside and got dragged into a wall slide. Rows 6-10 give
    // 3.0 tiles of clearance (1.3 of slack, asserted) and still present four
    // solid rows to wall-kick off from the chimney floor at y 5.35.
    { id: 'chimney-left', role: 'wall', x0: 39, x1: 40, y0: 6, y1: 10 },
    { id: 'chimney-right', role: 'wall', x0: 44, x1: 45, y0: 6, y1: 10 },
    { id: 'dare-overhang', role: 'overhang', x0: 48, x1: 56, y0: 5, y1: 6 },
    // Flush with the overhang roof, not one tile above it: a 1-tile lip there
    // is too short to ledge-catch, too tall to walk over, and not grabbable,
    // so a held-jump policy parked against it for 9.6 s doing nothing
    // (adversarial F11). Rows 1-5 still seal the pocket for anyone inside it.
    { id: 'dare-dead-end', role: 'wall', grabbable: false, x0: 56, x1: 57, y0: 1, y1: 6 },
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
  /* ---------------------- SNAP HOOK anchors (?hook=1) ------------------ *
   * Authored, clearly marked tether points. Pure data: inert unless ?hook=1
   * arms src/sim/hook.js, and identical in every pace so an A/B still
   * compares pacing only.
   *
   * `arc` is [centerDeg, halfWidthDeg] measured from the ANCHOR toward the
   * player (270 = straight below, 180 = directly behind), which is how the
   * concept boards read: a bracket accepts the line RIG throws from below or
   * behind it, never from ahead. Every anchor is asserted acquirable from at
   * least one taught connector, non-embedded, and line-of-sight clear
   * (tools/pathcheck.mjs).
   *
   * Placement follows board 03 (a tether spanning a gap between two route
   * bands) and boards 09/10/12 (RIG dangling under machinery):
   *   entry-lift   — teaches the verb on the first fork: one press replaces
   *                  jump + air-jump onto the upper entry.
   *   shaft-lift   — the chimney in one input instead of a wall pump.
   *   pocket-span  — the roof line's price. The y:10 roof is the degenerate
   *                  fast route (adversarial F1/F10); this anchor makes
   *                  LEAVING it attractive: grabbed from the chimney top it
   *                  is a fast diagonal drop-forward that lands on the armed
   *                  mid line, beating a roof run on time.
   *   post-lift    — reachable in mid-air off pocket-span's whip: the first
   *                  hook→hook link, the "chained aerial movement" of the art.
   *   exit-lift    — the last link: the high exit band into the rejoin.       */
  hookAnchors: [
    { id: 'entry-lift', x: 33.5, y: 7.2, arc: [215, 80],
      teaches: 'entry', note: 'first fork: deck → upper entry in one press' },
    // arc kept narrow and downward on purpose: a shallow grab from the left at
    // roof height clips the chimney wall with the BODY even though the tether
    // line is clear (the bot found it), and while a clipped zip converts to a
    // launch rather than sticking, a mis-grab is not what should teach the verb.
    { id: 'shaft-lift', x: 42.0, y: 11.0, arc: [262, 58],
      teaches: 'chimney-base', note: 'the chimney shaft without the wall pump' },
    { id: 'pocket-span', x: 51.5, y: 7.6, arc: [180, 62],
      teaches: 'chimney-top', note: 'roof → mid transfer over the dare pocket' },
    { id: 'post-lift', x: 61.5, y: 10.6, arc: [230, 70],
      teaches: 'post-mid', note: 'mid-air link off pocket-span; post band' },
    { id: 'exit-lift', x: 65.0, y: 11.2, arc: [210, 72],
      teaches: 'post-high', note: 'high exit band into the rejoin' },
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
    maxConsecutive: 2,        // ceiling before the fixture retries (tier 2 unbuilt).
                              //   Two free dislodges per 4-12 s pass: enough for a
                              //   real mercy chain, tight enough that total
                              //   inaction reaches a terminal state inside the
                              //   fixture's own timescale rather than at ~16 s.
    recoverTiles: 8,          // advancing this far past a fallback clears the streak
  },
};

/* ======================= SNAP HOOK tuning (?hook=1) ================== *
 * One physics model, tuned once. The verb is a three-beat state machine that
 * deliberately mirrors the ledge catch the player already knows —
 * grab → brief dangle → launch — because DESIGN's governing rule is "every
 * grab wants to become another launch", and a verb that reads like the
 * existing ones needs no new lesson:
 *
 *   ZIP   the tether is taut and pulls RIG along it at zipSpeed, faster than
 *         a sprint, substepped so it cannot cross a wall. Gravity is off, the
 *         way it is off during a ledge hang.
 *   HANG  a 110 ms dangle at the anchor (the boards' dangling RIG, board 09).
 *         Long enough to read, far too short to become a pause. Jump launches
 *         out of it early; down releases and drops.
 *   WHIP  forward launch, entry speed preserved, air jump refunded — so the
 *         very next thing you can do is another grab.
 *
 * Rejected models are recorded in the completion report: an instant impulse
 * (no tether to read, no dangle) and a full pendulum swing (a swing is a WAIT,
 * which the pursuing edge makes lethal and pillar 1 forbids).             */
export const TRAVERSAL_HOOK = {
  id: 'hook-v1',
  range: 8.6,               // acquisition radius, tiles (hand to anchor)
  minRange: 1.6,            // …and a floor: you cannot grab what you stand under
  handHeight: 1.2,          // where the line leaves the body
  behindTiles: 0.9,         // an anchor may sit barely behind and still take
  behindPenalty: 1.7,       // …but a candidate ahead always wins the tie
  losStepTiles: 0.35,       // tether sight sampling: finer than the 1-tile walls
  bufferMs: 140,            // press buffering, exactly like the jump buffer
  // Cooldown and zip speed are the two constants that keep the verb from
  // becoming a shortcut past the whole fixture. At zipSpeed 21 / cooldown 240
  // the headless bot cleared the slice in 3.7 s — faster than sprinting the
  // level in a straight line (4.1 s at runSpeed 10.8), i.e. the tether beat the
  // pursuing edge by existing, which is not a route choice. At 16 / 420 the zip
  // is still clearly quicker than a sprint over the same span but the win comes
  // from ALTITUDE and the whip, and each further grab has to be flown to.
  cooldownMs: 420,          // between grabs
  sameAnchorLockMs: 900,    // no instant re-grab of the anchor you just left
  zipSpeed: 16.0,           // tiles/s along the line (run speed is 10.8)
  zipMaxMs: 520,            // hard ceiling: a zip can never become a ride
  zipSubstepTiles: 0.3,     // collision safety per substep
  arriveRadius: 0.28,
  hangMs: 110,              // the dangle. Auto-whips on expiry, always.
  launchX: 11.6, launchY: 14.6,
  // A whip preserves the speed you arrived with (the way a ledge launch does),
  // and that is a compounding path: launch at 13.5 → grab inside the 100 ms
  // control window → whip at max(11.6, 13.5)×chain → grab again… The headless
  // bot reached 14.9 t/s this way before the ceiling existed, and nothing in the
  // controller bounded it, because the drive that normally pulls speed back to
  // runSpeed is suspended for exactly that window. This ceiling is the bound the
  // endpoint-only wall check depends on: 15.9 × the 50 ms dt clamp = 0.795 of a
  // tile, asserted in tools/pathcheck.mjs.
  launchCeiling: 15.9,
  releaseVy: -2.0,          // down: let go and fall, keeping drift
  refundAirJump: true,
};

/* ==================== MOMENTUM SPINE tuning (?flow=1) ================ *
 * Generalizes surge's launch chain into a flag that composes with any pace.
 * The cap is the load-bearing constant: maxTotalMult bounds the product of a
 * pace's own chain and flow's, which is what keeps every attainable speed
 * inside the dt-clamp displacement budget asserted in tools/pathcheck.mjs.  */
export const TRAVERSAL_FLOW = {
  id: 'flow-v1',
  windowMs: 1200,           // airborne grace between chain links
  step: 0.05, max: 4,       // +5% forward per link, four links
  maxTotalMult: 1.22,       // composed with a pace chain (surge tops at 1.18)
  speedMultCap: 1.22,       // sustained drive target while the chain lives
  // …and the same absolute bound the hook carries, applied to the amplified
  // launch itself, because a launch inherits the speed it arrived with: no
  // chain of any length can put a horizontal launch past this.
  launchCeiling: 16.5,
  groundGraceMs: 220,       // a bounce through the floor keeps the chain…
  groundDecayMs: 140,       // …standing on it sheds one link per this
  refundAirJump: true,
  autoLaunch: true,         // surge's ledgeAutoLaunch, generalized to any pace
  linkVerbs: ['ledge', 'wall', 'hook'],
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
      'two wasps, one pocket reward, and a crush clock bounded by screen width ' +
      'rather than by seconds. If a variant is not clearly better than this, ' +
      'the variant is wrong.',
    pursuit: {
      mode: 'constant', cruiseSpeed: 2.6, minSpeed: 2.6, maxSpeed: 2.6,
      pocketSpeed: 2.6, accel: 0, decel: 0,
      crushSlackSeconds: 0,   // 0 = unbounded: the shipped screen-width clock
      edgePinDamageMs: 0,     // 0 = the shipped free conveyor. Consequence, kept
                              //   deliberately so the control stays the control:
                              //   a zero-input run in `base` takes one crush
                              //   fallback and then rides the plane instead of
                              //   reaching a terminal state. The three variants
                              //   all retire an idler in 11-15 s. Flip this to
                              //   600 if the A/B should compare fixed-to-fixed.
    },
  },

  hunt: {
    id: 'hunt', label: 'HUNT',
    // Pressure clock. Same content, same verbs: only the edge changes kind.
    hypothesis:
      'The slice is boring because banked margin never expires: once you are ' +
      'ahead, nothing is timed. A hunting edge that charges (6.8, 2.6x the ' +
      'shipped speed) whenever you are comfortable and eases back to the ' +
      'shipped 2.6 when it is about to crush you removes safe coasting and ' +
      'makes every vertical detour cost measurable ground.',
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
      pocketSpeed: 1.3,       // the pocket release, re-derived for the tighter clock
      crushSlackSeconds: 2.6, // 2.6 s of standing still at cruise, 1.4 s while
                              //   charging — and identical on every aspect ratio
      edgePinDamageMs: 600,   // the plane is no longer a free ride
    },
    pocketTiming: { minExitMarginTiles: 4.0 },
    pocketReward: { x: 51 },  // shallower wager: it has to fit the tighter clock
    enemies: [               // the wasps contest the FAST low line…
      { id: 'low-contest', kind: 'wasp', x: 35, y: 4.9, delayMs: 0,
        tune: { diveRange: 8.5, diveCooldownMs: 900 } },
      { id: 'pocket-mouth', kind: 'wasp', x: 50, y: 6.6, delayMs: 300,
        tune: { cruiseSpeed: 0.5, diveRange: 7.0, diveCooldownMs: 1100 } },
      // …and two cruise the ROOF band head-on. A wasp only dives when the player
      // is below it, so every wasp authored at y 8-9 left the y:10 chimney-top
      // roof — the fastest and safest line in the fixture — uncontested
      // (adversarial F1/F10). Station-keepers there did nothing either: a dive
      // leads a 10.8 t/s sprinter by 7 tiles. Cruising left at 3.2 through the
      // y 11.8-12.4 jump band means a mash-forward policy closes on them at
      // 14 t/s and has to either shoot or change line.
      { id: 'roof-hunter-a', kind: 'wasp', x: 47, y: 11.9, delayMs: 150,
        tune: { cruiseSpeed: 3.2, diveRange: 9.0, diveCooldownMs: 800 } },
      { id: 'roof-hunter-b', kind: 'wasp', x: 60, y: 12.3, delayMs: 300,
        tune: { cruiseSpeed: 3.2, diveRange: 9.0, diveCooldownMs: 800 } },
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
      pocketSpeed: 2.0, accel: 0, decel: 0,
      crushSlackSeconds: 4.0, // the threats are the pressure here, but the clock
                              //   is still bounded in seconds, not screen widths
      edgePinDamageMs: 600,
    },
    pocketTiming: { minExitMarginTiles: 3.5 },
    pocketReward: { x: 53 },
    enemies: [
      { id: 'low-contest-a', kind: 'wasp', x: 35, y: 4.8, delayMs: 0,
        tune: { diveRange: 8.5, diveCooldownMs: 900 } },
      { id: 'low-contest-b', kind: 'wasp', x: 46, y: 4.4, delayMs: 500,
        tune: { diveRange: 8.0, diveCooldownMs: 950 } },
      { id: 'pocket-guard', kind: 'wasp', x: 51, y: 6.8, delayMs: 200,
        tune: { cruiseSpeed: 0.4, diveRange: 6.0, diveCooldownMs: 1200 } },
      // above the chimney top, so it contests the wall-pump exit itself
      { id: 'chimney-hold', kind: 'wasp', x: 44, y: 11.6, delayMs: 0,
        tune: { cruiseSpeed: 0.5, diveRange: 7.5, diveCooldownMs: 1000 } },
      { id: 'roof-hunter-a', kind: 'wasp', x: 52, y: 12.0, delayMs: 300,
        tune: { cruiseSpeed: 3.4, diveRange: 9.0, diveCooldownMs: 850 } },
      { id: 'roof-hunter-b', kind: 'wasp', x: 66, y: 12.4, delayMs: 500,
        tune: { cruiseSpeed: 3.0, diveRange: 9.0, diveCooldownMs: 850 } },
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
      pocketSpeed: 1.6,       // the wager gets tighter here, provably still escapable
      crushSlackSeconds: 3.2, // 3.2 s at the opening cruise, 1.2 s once the ramp
                              //   tops out: the clock itself is the crescendo
      edgePinDamageMs: 600,
    },
    pocketTiming: { minExitMarginTiles: 3.0 },
    pocketReward: { x: 50.5 },
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
      // the roof is the fastest line, so it has to cost something here too
      { id: 'roof-hunter-a', kind: 'wasp', x: 50, y: 11.8, delayMs: 200,
        tune: { cruiseSpeed: 3.2, diveRange: 9.0, diveCooldownMs: 850 } },
      { id: 'roof-hunter-b', kind: 'wasp', x: 64, y: 12.2, delayMs: 400,
        tune: { cruiseSpeed: 3.2, diveRange: 9.0, diveCooldownMs: 850 } },
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
   reads the resolved object, so a variant cannot leak into another.

   `opts` carries the movement-verb prototype flags (?hook=1 / ?flow=1). With
   no opts — every shipped URL — the result is byte-for-byte what it was
   before those verbs existed: `hook` and `flow` resolve to null and no
   movement field moves. That equivalence is asserted both as data
   (tools/pathcheck.mjs) and as behavior (trace fingerprints, per pace). */
export function resolveTraversalPace(name, fixture = TRAVERSAL_FIXTURE, opts = {}) {
  const pace = TRAVERSAL_PACES[name] || TRAVERSAL_PACES.base;
  const reward = { ...fixture.darePocket.reward, ...(pace.pocketReward || {}) };
  // A pace authors its stakes and its roster against the LATTICE. A fixture
  // overlay may not have that lattice (the rib run, src/pure/ribrun.js,
  // climbs straight through the heights those letters sit at), so two
  // honesty rules apply to any fixture, not just that one: a reward buried
  // inside the fixture's own ground is not a choice and is culled, and a
  // fixture that declares itself hostile-free fields no pace roster. Both
  // are no-ops for the shipped fixture — every authored reward already sits
  // above its deck and nothing declares hostileFree — asserted in
  // tools/pathcheck.mjs as byte-equality against the pre-rib resolution.
  const rewards = [reward, ...(pace.rewards || [])]
    .filter(function (r) { return !traversalRewardBuried(fixture, r); })
    .map(function (r) { return { ...r }; });
  const roster = fixture.hostileFree ? [] : (pace.enemies || fixture.enemies);
  const flow = opts.flow ? { ...TRAVERSAL_FLOW } : null;
  const hook = opts.hook ? { ...TRAVERSAL_HOOK } : null;
  // flow's one movement override: surge's "dwell expiry throws you off instead
  // of dropping you", generalized to whichever pace is running underneath.
  const flowMovement = flow && flow.autoLaunch ? { ledgeAutoLaunch: true } : null;
  return {
    ...fixture,
    hook,
    flow,
    pace: { id: pace.id, label: pace.label, hypothesis: pace.hypothesis },
    pursuit: {
      ...pace.pursuit,
      // Crush slack authored in SECONDS becomes a margin cap in tiles at the
      // pace's cruise speed: a fixed distance (so the camera never jitters as
      // the edge accelerates), a fixed clock at cruise, and — because it no
      // longer derives from the frustum — the same clock at every aspect ratio.
      // 0 keeps the shipped screen-width behavior.
      marginCapTiles: pace.pursuit.crushSlackSeconds
        ? pace.pursuit.crushSlackSeconds * pace.pursuit.cruiseSpeed
        : 0,
    },
    run: {
      ...fixture.run, ...(pace.run || {}),
      minimumScrollSpeed: pace.pursuit.cruiseSpeed,
    },
    movement: { ...fixture.movement, ...(pace.movement || {}), ...(flowMovement || {}) },
    chain: pace.chain ? { ...pace.chain } : null,
    enemies: roster.map((e) => ({ ...e })),
    rewards,
    darePocket: {
      ...fixture.darePocket,
      reward,
      timing: { ...fixture.darePocket.timing, ...(pace.pocketTiming || {}) },
    },
  };
}

/* ===================== HOUNDFRAME TRIAL (opt-in) ==================== *
 * DESIGN's teach → test → remix rule for the floor-denial enemy, laid over the
 * same fixture and reached only through ?hound=. It is ORTHOGONAL to the pace:
 * a stage composes with whatever pace resolved, so the pace always keeps its
 * pursuit model, movement overrides, and stakes, and the operator can ask "does
 * floor denial still read at surge's clock and chained launches?" directly.
 *
 * Composition rule, declared per stage and asserted in tools/pathcheck.mjs:
 *   replace — the stage's authored hostiles are the whole roster. Teaching a
 *             new enemy happens under low pressure (DESIGN phase rhythm), and
 *             it keeps a bot damage measurement attributable to the charge.
 *   add     — the stage's hounds are appended to the pace's own plan. That is
 *             the remix beat and the honest preview of a real phase.
 * With no stage selected the plan IS the pace's list, so every ordinary URL —
 * including each ?pace= variant — is byte-identical to what it fields today.
 *
 * `deck` is the authored surface height the hound owns — the spawn height is
 * derived from CONFIG.hound.rideY so the frame always sits on that plate. A
 * `surface: 'solid-top'` row rides the top of an authored solid rectangle
 * instead of the ground run (see updateHound): the same enemy, one tier up.
 *
 * `contests` names the fixture route each hostile is assigned to, and `owns`
 * names the CONNECTOR it stands over, because CP2's verdict was that a hound
 * on open plate is scenery: "one hound doesn't pose any threat." A patrol span
 * is therefore short and centred on something the route cannot skip — a
 * landing, a pocket mouth, the one segment every route shares — so the frame
 * is always near the decision instead of pacing eight tiles away from it. The
 * harness asserts the span is tight, contains the owned connector, and that a
 * charge from either end of it still sweeps that connector.
 *
 * Threat assignment stays per-route (docs/concept-art shows the quadruped
 * standing on one route's platform while wasps work another): choosing a route
 * chooses a matchup, and at least two routes stay a pure air problem.      */

// Each beat owns one thing the low line cannot skip: the step-up landing at
// x=43, the pocket mouth at x=48, and the drop-down landing at x=59.
const HOUND_FLOOR_BEATS = [
  { id: 'hound-teach', kind: 'hound', contests: 'lower-service', owns: 'low-step',
    deck: 3, x: 44.2, dir: -1, delayMs: 0, patrol: { x0: 41.6, x1: 44.6 } },
  { id: 'hound-pocket', kind: 'hound', contests: 'dare-pocket', owns: 'pocket-commit',
    deck: 1, x: 49.8, dir: -1, delayMs: 400, patrol: { x0: 47.6, x1: 50.4 } },
  { id: 'hound-rejoin', kind: 'hound', contests: 'lower-service', owns: 'post-low',
    deck: 3, x: 60.2, dir: -1, delayMs: 800, patrol: { x0: 57.8, x1: 60.6 } },
];

// The overhang roof (solid rect `dare-overhang`, top y=6, x 48..56) is the one
// segment EVERY authored route crosses — `overhang-top` appears in all six. A
// hound pacing it turns the fixture's shared rejoin into a timed lane, and
// overcommitting drops it into the pocket, where it keeps hunting on the floor.
const HOUND_ROOF_BEAT = {
  id: 'hound-roof', kind: 'hound', contests: 'mid-catwalk', owns: 'overhang-top',
  surface: 'solid-top', deck: 6, x: 52.4, dir: -1, delayMs: 500,
  patrol: { x0: 50.4, x1: 53.4 },
};

// Adversarial's p4 mash policy clears the slice untouched by flying the y 9.5-13
// band: nothing authored below y 9 can reach it, and a hound never will. Wasps
// only dive at a player BELOW them, so contesting that lane needs wasps parked
// above it — these two cruise the ceiling head-on and make the freeway a lane.
// Height is a fairness constraint, not a taste call: a dive travels 7 tiles, so
// parking them at 15.6+ keeps the deepest reach (8.6) ABOVE the apex of a jump
// made from the floor plus a standing body — clearing a hound is never punished
// from above — while still crossing the 9.5-13 flight band a chained mash policy
// lives in. Both bounds are asserted.
const CEILING_WASPS = [
  { id: 'ceiling-a', kind: 'wasp', contests: 'upper-chimney', x: 47, y: 15.6, delayMs: 200,
    tune: { cruiseSpeed: 3.0, diveRange: 9.0, diveCooldownMs: 850 } },
  { id: 'ceiling-b', kind: 'wasp', contests: 'wall-launch', x: 62, y: 15.9, delayMs: 500,
    tune: { cruiseSpeed: 3.0, diveRange: 9.0, diveCooldownMs: 850 } },
];

export const HOUND_TRIAL = {
  id: 'hound-trial-v1',
  stages: {
    // teach: floor pressure only. Three chokepoints the low line needs, each
    // one temporarily wrong to stand on. Answer: jump, wall-launch, or drop
    // behind. The ceiling pair is here because a stage that only threatens the
    // floor teaches "fly over everything" instead of teaching the hound.
    solo: {
      id: 'solo', label: 'HOUND SOLO', compose: 'replace',
      enemies: HOUND_FLOOR_BEATS.concat(CEILING_WASPS),
    },
    // test: the documented combination — "hound forces the jump that the wasp
    // contests". The wasp cruises the arc directly over the hound's plate, so
    // the movement answer to the charge is the one the air threat punishes.
    combo: {
      id: 'combo', label: 'HOUND + WASP', compose: 'replace',
      // FROZEN: this is the roster the operator judged at CP2 ("those feel much
      // better"), kept byte-identical as the A/B baseline for 2.5. It predates
      // the chokepoint placement contract and is deliberately exempt from it —
      // the harness asserts that exactly one stage claims this exemption.
      frozen: true,
      enemies: [
        { id: 'hound-squeeze', kind: 'hound', contests: 'lower-service',
          deck: 3, x: 45.5, dir: -1, delayMs: 0, patrol: { x0: 39.5, x1: 46.5 } },
        { id: 'squeeze-wasp', kind: 'wasp', contests: 'lower-service',
          x: 44, y: 7.6, delayMs: 300 },
        { id: 'hound-rejoin', kind: 'hound', contests: 'lower-service',
          deck: 3, x: 63.5, dir: -1, delayMs: 900, patrol: { x0: 57.5, x1: 63.5 } },
      ],
    },
    // CP2's iteration point ("3 was a little busy"): stage 2's squeeze, plus one
    // more route contested and the flight lane closed. Four bodies instead of
    // stage 3's five-to-eight, and every one of them owns a different decision —
    // the low landing, the arc that answers it, the roof segment all six routes
    // share, and the ceiling. Stage 2 is left untouched as the comparison.
    squeezePlus: {
      id: 'squeezePlus', label: 'HOUND 2.5', compose: 'replace',
      enemies: [
        { id: 'hound-squeeze', kind: 'hound', contests: 'lower-service', owns: 'low-step',
          deck: 3, x: 44.2, dir: -1, delayMs: 0, patrol: { x0: 41.6, x1: 44.6 } },
        { id: 'squeeze-wasp', kind: 'wasp', contests: 'lower-service',
          x: 44, y: 7.6, delayMs: 300 },
        HOUND_ROOF_BEAT,
        // the EARLY ceiling watcher: the flight lane has to be contested while
        // the player is still climbing into it, or a fast pass simply outruns
        // the contest (measured: the late watcher alone let 2 of 3 mash runs
        // reach the exit untouched)
        CEILING_WASPS[0],
      ],
    },
    // remix: the floor beats on top of the pace's own air pressure. Nothing is
    // re-authored — whatever the pace fields keeps its ids, positions, and
    // tunes, and the floor simply stops being free. The ceiling watcher comes
    // too: adversarial measured this stage's whole roster as costing a roof
    // policy 0.0 tiles of margin at base, because no pace parks anything in the
    // flight band, and a stage that a degenerate route ignores teaches nothing.
    mix: {
      id: 'mix', label: 'HOUND MIX', compose: 'add',
      enemies: HOUND_FLOOR_BEATS.concat([CEILING_WASPS[0]]),
    },
    // Test bench, not a feel stage: ONE houndframe deep in the pocket with its
    // fuse pulled (tune.senseRange 0 — it paces and never telegraphs, so it is
    // a target, not a fight). Standing anywhere on the pocket floor puts the
    // player on its deck, perfectly lined up and in no danger — and 8-way aim
    // still cannot reach it, which is exactly the operator's complaint. Used by
    // the crouch/assist A/B scripts, and by the operator to feel both answers
    // with nothing else going on.
    aim: {
      id: 'aim', label: 'AIM BENCH', compose: 'replace',
      bench: true,
      enemies: [
        { id: 'hound-bench', kind: 'hound', contests: 'dare-pocket', owns: 'pocket-reward',
          deck: 1, x: 54.6, dir: -1, delayMs: 0, patrol: { x0: 53.8, x1: 55.2 },
          tune: { senseRange: 0 } },
      ],
    },
  },
};

export function houndTrialStage(name) {
  return (name && HOUND_TRIAL.stages[name]) || null;
}

/* ===================== IRIS POLYP TRIAL (opt-in) ==================== *
 * DESIGN's next enemy in the teach-then-combine order, reached only through
 * ?polyp= and carrying the hound trial's placement contract forward: a polyp
 * threatens by POSITION on a route the player actually needs (decisions.md
 * entry 6), never by stats. It is rooted, so `owns` is everything: the beam
 * has to cover the owned connector, the fixture's own geometry has to clamp
 * the beam (cover is real), and the tiers above and below the lane have to
 * stay clean (a sightline locks one band, the reroutes stay visible — board
 * 07's "locking one connector while alternatives remain visible").
 *
 * The chosen station is the RIGHT end of the post-mid catwalk, barrel facing
 * left down the lane: post-mid is the natural walk-on continuation every
 * player sees after the shared overhang segment. The beam rides the standing
 * firing line of that catwalk, its span stops short of the shared
 * overhang-top CONNECTOR (the fork's decision point stays free — asserted),
 * post-low runs directly below the lane (drop reroute) and post-high
 * directly above it (jump reroute) — the alternatives are visible before
 * the tell ever fires, which is board 07's exact panel. The span's tail
 * does brush the roof walk behind the pocket wall, deliberately: the roof
 * freeway pays a toll here, and the answer (hop, or drop into the pocket)
 * is asserted fair. `deck` is the mounted surface height; the spawn y
 * derives from CONFIG.polyp.rootY the way a hound's derives from rideY, so
 * the bulb always sits on its catwalk.                                   */
const POLYP_POST_BEAT = {
  id: 'polyp-post', kind: 'polyp', contests: 'mid-catwalk', owns: 'post-mid',
  mount: 'platform:post-mid', deck: 5.35, x: 63.2, dir: -1, delayMs: 0,
};

export const POLYP_TRIAL = {
  id: 'polyp-trial-v1',
  stages: {
    // teach: ONE polyp, nothing else. The tell → beam → vent cycle has to be
    // attributable before anything contests the answers to it, and a solo
    // roster keeps every point of bot damage explained by the beam.
    solo: {
      id: 'solo', label: 'POLYP SOLO', compose: 'replace',
      enemies: [POLYP_POST_BEAT],
    },
    // combine (exactly two bodies): the polyp locks the mid lane and a hound
    // prices the drop reroute directly below it — DESIGN's "mortar can
    // pressure the alternate route" combination, played with the enemy that
    // exists. The hound row is the judged hound-2.5 rejoin beat verbatim
    // (same station, span, and owned connector), so the combination tests
    // the POLYP, not a new hound placement.
    combo: {
      id: 'combo', label: 'POLYP + HOUND', compose: 'replace',
      enemies: [
        POLYP_POST_BEAT,
        { id: 'hound-rejoin', kind: 'hound', contests: 'lower-service', owns: 'post-low',
          deck: 3, x: 60.2, dir: -1, delayMs: 400, patrol: { x0: 57.8, x1: 60.6 } },
      ],
    },
  },
};

export function polypTrialStage(name) {
  return (name && POLYP_TRIAL.stages[name]) || null;
}

// One authored stage's rows with spawn heights derived per kind: a hound
// rides its deck, a polyp is rooted on it. Rows without a deck pass through.
function stagePlanRows(stage, cfg) {
  return stage.enemies.map(function (e) {
    if (e.deck === undefined) return { ...e };
    const ride = e.kind === 'polyp' ? cfg.polyp.rootY : cfg.hound.rideY;
    return { ...e, y: e.deck + ride };
  });
}

function composeStage(stage, baseRows, cfg) {
  const authored = stagePlanRows(stage, cfg);
  return stage.compose === 'add'
    ? baseRows.map(function (e) { return { ...e }; }).concat(authored)
    : authored;
}

// One attempt's authored hostiles, for the pace that resolved. With no trial
// stage this returns the pace's own list unchanged, so every ordinary URL is
// byte-identical; a stage either replaces that list or appends to it. The
// polyp trial composes AFTER the hound trial (both flags set, the polyp
// stage's rule reads the hound-composed plan as its base), and with no
// ?polyp= the result is byte-for-byte the pre-polyp behavior.
export function traversalEnemyPlan(fixture, trialName, polypName, cfg = CONFIG) {
  if (!fixture) return [];
  const stage = houndTrialStage(trialName);
  const base = stage ? composeStage(stage, fixture.enemies, cfg) : fixture.enemies;
  const polyp = polypTrialStage(polypName);
  return polyp ? composeStage(polyp, base, cfg) : base;
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

// The scroll cursor at which the player's crush margin equals capTiles.
// edgeLeftOffset is the calibrated left-frustum offset from the scroll cursor
// (negative), so bounding the margin here bounds the clock in seconds on every
// aspect ratio — the shipped screen-width lead varies 2x between 1600x600 and
// 800x1000, which is why the same fixture read as two different games.
export function traversalMarginCapScroll(playerLeft, edgeLeftOffset, capTiles) {
  return playerLeft - edgeLeftOffset - capTiles;
}

// The daylight a pace actually grants at the dare pocket: the authored screen
// -width figure, or the pace's own margin cap when it bounds slack in seconds.
export function traversalPocketEntryMargin(fixture) {
  const cap = fixture.pursuit.marginCapTiles;
  const authored = fixture.darePocket.timing.entryEdgeMarginTiles;
  return cap > 0 ? Math.min(cap, authored) : authored;
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

// The authored deck height at x, or null outside the fixture's own ground
// runs. Shared by the reward cull above and by the rib run's assertions.
export function traversalGroundYAt(fixture, x) {
  if (!fixture) return null;
  for (const run of fixture.groundRuns || [])
    if (x >= run.x0 && x < run.x1) return run.y;
  return null;
}

export function traversalRewardBuried(fixture, reward) {
  const g = traversalGroundYAt(fixture, reward.x);
  return g !== null && reward.y < g;
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

/* Responsive composition for the production run. The portrait pullback above
   protects horizontal reaction room, but stacking the full FAR multiplier on
   top of it made a two-tile RIG collapse to roughly 16 CSS pixels on an
   iPhone. Ease the view multiplier toward a compact-screen value as portrait
   framing reaches full strength. This moves the camera, so the actor, weapon,
   contact shadow and collision silhouette remain one honest world object. */
export function portraitViewDepthMult(baseMult, aspect, {
  startAspect = 0.9,
  fullAspect = 0.56,
  compactMult = 1.15,
} = {}) {
  if (!Number.isFinite(baseMult) || baseMult <= 0) return 1;
  if (!Number.isFinite(aspect) || aspect <= 0 || aspect >= startAspect) return baseMult;
  const span = Math.max(1e-6, startAspect - fullAspect);
  const u = Math.min(1, Math.max(0, (startAspect - aspect) / span));
  const target = Math.min(baseMult, Math.max(1, compactMult));
  return baseMult + (target - baseMult) * u;
}

/* A portrait phone has fewer physical pixels for the primary actor even after
   responsive camera composition. Give only RIG's presentation a bounded
   screen-readability gain; collision and movement remain untouched. */
export function portraitActorVisualGain(aspect, {
  startAspect = 0.9,
  fullAspect = 0.56,
  maxGain = 1.5,
} = {}) {
  if (!Number.isFinite(aspect) || aspect <= 0 || aspect >= startAspect) return 1;
  const span = Math.max(1e-6, startAspect - fullAspect);
  const u = Math.min(1, Math.max(0, (startAspect - aspect) / span));
  return 1 + (Math.max(1, maxGain) - 1) * u;
}
