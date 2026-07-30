/* ======================== ENTITIES: PLAYER ======================== */

import { CONFIG } from '../config.js';
import {
  traversalLedgeProbe, traversalLedgeDecision, traversalWallDecision,
  traversalSolidAllowsGrab, traversalChainMult, traversalFallbackTarget,
} from '../pure/traversal.js';
import {
  ACTIVE_FIXTURE, ACTIVE_SLICE, IS_TRAVERSAL_SLICE, SLICE_FALLBACK_ENABLED,
} from '../mode.js';
import { view, host } from './bridge.js';
import { gameMs, sliceStats, approach } from './time.js';
import { sLeftEdge, sRightEdge } from './edges.js';
import { keys, jumpBufferedUntil, clearJumpBuffer, releaseAllKeys } from './input.js';
import {
  LEVEL_LEN, groundH, groundTopAt, platforms, isSolid, activeScrollSpeed,
} from './level.js';
import { state, setState } from './state.js';
import { currentWeapon, setWeapon, weaponDef, fireWeapon } from './weapons.js';
import { mods, clearMods } from './mods.js';
import { CAP, spawnCapsule } from './capsules.js';
import {
  scoreContact, scoreFireMult, scoreLaunch, scoreRunEnd, scoreSetback,
} from './score.js';
import { activeCorner, cornerBusy } from './wavegate.js';
import { transformBusy, transformFrontierX, transformSealX } from './transform.js';

// The vertical slice is allowed to prove a more forceful controller without
// silently changing the shipped six-face run. Every omitted field inherits the
// frozen base tune.
export const P = ACTIVE_SLICE
  ? { ...CONFIG.player, ...ACTIVE_SLICE.movement }
  : CONFIG.player;
// launch chaining and hull fallback are pacing-variant data, absent by default
const CHAIN = ACTIVE_SLICE ? ACTIVE_SLICE.chain : null;
const FALLBACK = ACTIVE_SLICE ? ACTIVE_SLICE.fallback : null;
const EDGE_PIN_MS = ACTIVE_SLICE ? ACTIVE_SLICE.pursuit.edgePinDamageMs : 0;
// aim is a plain 2-vector, not a THREE.Vector2: the sim stays renderer-free
// and the renderer only reads .x/.y off it.
export const player = {
  x: 6, y: 3, vx: 0, vy: 0,
  hw: P.width / 2, h: P.height,
  facing: 1, aim: { x: 1, y: 0, set(x, y) { this.x = x; this.y = y; } },
  grounded: false, onOneWay: null, airJumpsLeft: P.airJumps,
  coyoteUntil: 0, dropUntil: 0, jumpCutDone: true,
  traversalState: 'free', traversalSide: 0,
  traversalCellX: 0, traversalTopY: 0,
  traversalSnapX: 0, traversalSnapY: 0,
  traversalUntil: 0, traversalRecatchUntil: 0, traversalEntryVx: 0,
  traversalControlUntil: 0,
  traversalChain: 0, traversalChainUntil: 0,
  fallbackStreak: 0, fallbackRecoverX: -Infinity, edgePinnedMs: 0,
  hp: P.maxHealth, lives: P.lives,
  iframesUntil: 0, hitstunUntil: 0,
  nextFireAt: 0,
};

function computeAim() {
  const h = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  const v = (keys.up ? 1 : 0) - (keys.down ? 1 : 0);
  if (h !== 0) player.facing = h;
  if (keys.strafe) return;                        // strafe-lock: aim frozen
  let ax, ay;
  if (h === 0 && v === 0)      { ax = player.facing; ay = 0; }
  else if (h === 0 && v > 0)   { ax = 0; ay = 1; }
  else if (h === 0 && v < 0)   { ax = player.grounded ? player.facing : 0; ay = -1; }
  else                         { ax = h; ay = v; }
  const n = Math.hypot(ax, ay);
  player.aim.set(ax / n, ay / n);
}

// circle vs the player's AABB — shared by contact damage and capsule pickup
export function circleHitsPlayer(x, y, r) {
  const cx = Math.max(player.x - player.hw, Math.min(x, player.x + player.hw));
  const cy = Math.max(player.y, Math.min(y, player.y + player.h));
  return (x - cx) ** 2 + (y - cy) ** 2 < r * r;
}

function playerOverlapsSolid() {
  const x0 = Math.floor(player.x - player.hw + 0.02), x1 = Math.floor(player.x + player.hw - 0.02);
  const y0 = Math.floor(player.y + 0.02), y1 = Math.floor(player.y + player.h - 0.02);
  for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) if (isSolid(i, j)) return true;
  return false;
}

const playerTraversalGeometry = {
  isSolid,
  allowsGrab: (cellX, y, h) =>
    traversalSolidAllowsGrab(ACTIVE_SLICE, cellX, y, h),
  minCellX: 1,
  maxCellX: LEVEL_LEN - 1,
  minPlayerX: -Infinity,
};

export function clearPlayerTraversal(recatchUntil = player.traversalRecatchUntil) {
  player.traversalState = 'free';
  player.traversalSide = 0;
  player.traversalCellX = 0;
  player.traversalTopY = 0;
  player.traversalSnapX = 0;
  player.traversalSnapY = 0;
  player.traversalUntil = 0;
  player.traversalEntryVx = 0;
  player.traversalRecatchUntil = recatchUntil;
}

// Consecutive contextual launches inside the chain window amplify the next
// one's FORWARD speed (the surge pace) and refund the air jump, so a chain can
// be kept alive. Deliberately scoped to horizontal launch speed: runSpeed,
// gravity, jumpVel and every vertical launch stay frozen, so the endpoint-only
// wall/ceiling checks keep their full sub-tile-per-frame budget.
function chainLaunchMult() {
  if (!CHAIN) return 1;
  player.traversalChain = gameMs < player.traversalChainUntil
    ? Math.min(player.traversalChain + 1, CHAIN.max)
    : 0;
  player.traversalChainUntil = gameMs + CHAIN.windowMs;
  if (CHAIN.refundAirJump && player.traversalChain > 0) player.airJumpsLeft = P.airJumps;
  return traversalChainMult(player.traversalChain, CHAIN);
}

export function updatePlayer(dt) {
  computeAim();

  const h = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  let ledgeHanging = false;
  let wallSliding = false;

  // Contextual traversal launches happen before the ordinary jump branch so
  // they neither consume nor refill the player's remaining air jump.
  if (!IS_TRAVERSAL_SLICE && player.traversalState !== 'free') clearPlayerTraversal(0);
  if (IS_TRAVERSAL_SLICE && player.traversalState === 'ledge') {
    const action = traversalLedgeDecision({
      side: player.traversalSide,
      down: keys.down,
      jumpBuffered: jumpBufferedUntil > gameMs || keys.jump,
      entryVx: player.traversalEntryVx,
      now: gameMs,
      until: player.traversalUntil,
    }, P);
    if (action.kind === 'launch') {
      const side = player.traversalSide;
      const faceX = side > 0 ? player.traversalCellX : player.traversalCellX + 1;
      player.x = faceX + side * (player.hw + P.ledgeMantleInset);
      player.y = player.traversalTopY + 0.001;
      clearPlayerTraversal(action.recatchUntil);
      clearJumpBuffer();
      player.vx = action.vx * chainLaunchMult(); player.vy = action.vy;
      player.grounded = false; player.onOneWay = null;
      player.coyoteUntil = 0; player.jumpCutDone = true;
      player.traversalControlUntil = gameMs + P.traversalLaunchControlMs;
      scoreLaunch('ledge', player.x, player.y);
    } else if (action.kind === 'release') {
      const side = player.traversalSide;
      clearPlayerTraversal(action.recatchUntil);
      player.x -= side * P.ledgeReleaseNudge;
      player.vy = Math.min(player.vy, -0.01);
      player.jumpCutDone = true;
    } else {
      player.x = player.traversalSnapX;
      player.y = player.traversalSnapY;
      player.vx = 0; player.vy = 0;
      player.grounded = false; player.onOneWay = null;
      player.jumpCutDone = true;
      ledgeHanging = true;
    }
  } else if (IS_TRAVERSAL_SLICE && player.traversalState === 'wall') {
    const action = traversalWallDecision({
      side: player.traversalSide,
      cellX: player.traversalCellX,
      x: player.x, y: player.y, h: player.h,
      vy: player.vy, grounded: player.grounded,
      down: keys.down, hInput: h,
      jumpBuffered: jumpBufferedUntil > gameMs || keys.jump,
      now: gameMs, until: player.traversalUntil,
    }, playerTraversalGeometry, P);
    if (action.kind === 'jump') {
      clearPlayerTraversal(action.recatchUntil);
      clearJumpBuffer();
      player.vx = action.vx * chainLaunchMult(); player.vy = action.vy;
      player.grounded = false; player.onOneWay = null;
      player.coyoteUntil = 0; player.jumpCutDone = true;
      player.traversalControlUntil = gameMs + P.traversalLaunchControlMs;
      scoreLaunch('wall', player.x, player.y);
    } else if (action.kind === 'release') {
      const side = player.traversalSide;
      clearPlayerTraversal(action.recatchUntil);
      player.x -= side * P.ledgeReleaseNudge;
    } else {
      player.x = player.traversalSnapX;
      player.vx = action.vx; player.vy = action.vy;
      wallSliding = true;
    }
  }

  // -- horizontal drive (locked out during hitstun and contextual contact)
  if (!ledgeHanging && !wallSliding &&
      gameMs >= player.hitstunUntil && gameMs >= player.traversalControlUntil) {
    const accel = player.grounded ? P.accelGround : P.accelAir;
    player.vx = approach(player.vx, h * P.runSpeed, accel * dt);
  }

  // -- jump: buffer + coyote + one air jump; down+jump on a catwalk = drop-through
  if (player.traversalState === 'free' && jumpBufferedUntil > gameMs) {
    if (player.grounded || player.coyoteUntil > gameMs) {
      clearJumpBuffer();
      if (player.grounded && player.onOneWay && keys.down) {
        player.dropUntil = gameMs + P.dropThroughMs;
        player.y -= 0.05;
        player.grounded = false;
      } else {
        player.vy = P.jumpVel;
        player.grounded = false;
        player.jumpCutDone = false;
        player.coyoteUntil = 0;
      }
    } else if (player.airJumpsLeft > 0) {
      clearJumpBuffer();
      player.airJumpsLeft--;
      if (IS_TRAVERSAL_SLICE) sliceStats.airJumps++;
      player.vy = P.airJumpVel;
      player.jumpCutDone = false;
      scoreLaunch('air', player.x, player.y);
    }
  }
  // variable jump height: releasing jump cuts upward velocity once
  if (!keys.jump && player.vy > 0 && !player.jumpCutDone) {
    player.vy *= P.jumpCutMult;
    player.jumpCutDone = true;
  }

  // -- gravity
  if (!ledgeHanging) {
    const g = P.gravity * (player.vy < 0 ? P.fallGravityMult : 1);
    player.vy = Math.max(P.terminalVel, player.vy + g * dt);
    if (wallSliding) player.vy = Math.max(player.vy, -P.wallSlideSpeed);
  }

  // -- integrate X, resolve against solids (dt clamp keeps moves < 1 tile)
  let wallHit = null;
  const collisionVx = player.vx;
  if (!ledgeHanging && !wallSliding) {
    player.x += player.vx * dt;
    if (player.vx > 0) {
      const ci = Math.floor(player.x + player.hw);
      for (let j = Math.floor(player.y + 0.02); j <= Math.floor(player.y + player.h - 0.02); j++) {
        if (isSolid(ci, j)) {
          player.x = ci - player.hw - 0.001; player.vx = 0;
          wallHit = { side: 1, cellX: ci, snapX: player.x };
          break;
        }
      }
    } else if (player.vx < 0) {
      const ci = Math.floor(player.x - player.hw);
      for (let j = Math.floor(player.y + 0.02); j <= Math.floor(player.y + player.h - 0.02); j++) {
        if (isSolid(ci, j)) {
          player.x = ci + 1 + player.hw + 0.001; player.vx = 0;
          wallHit = { side: -1, cellX: ci, snapX: player.x };
          break;
        }
      }
    }
  }

  // -- integrate Y, resolve against solids + one-way catwalks
  const prevY = player.y;
  const wasGrounded = player.grounded;
  if (!ledgeHanging) {
    player.y += player.vy * dt;
    player.grounded = false;
    player.onOneWay = null;
    if (player.vy <= 0) {
      const i0 = Math.floor(player.x - player.hw + 0.02), i1 = Math.floor(player.x + player.hw - 0.02);
      let landY = null, landPl = null;
      for (let j = Math.floor(prevY); j >= Math.floor(player.y); j--) {
        if (j + 1 > prevY + 0.001) continue;             // feet started below this surface
        if (isSolid(i0, j) || isSolid(i1, j)) { landY = j + 1; break; }
      }
      if (player.dropUntil <= gameMs) {
        for (const pl of platforms) {                    // stacked lanes: land on highest crossed
          if (player.x + player.hw > pl.x0 && player.x - player.hw < pl.x1 &&
              prevY >= pl.y - 0.001 && player.y <= pl.y &&
              (landY === null || pl.y > landY)) {
            landY = pl.y; landPl = pl;
          }
        }
      }
      if (landY !== null) {
        player.y = landY; player.vy = 0; player.grounded = true; player.onOneWay = landPl;
      }
    } else {
      const cj = Math.floor(player.y + player.h);
      const i0 = Math.floor(player.x - player.hw + 0.02), i1 = Math.floor(player.x + player.hw - 0.02);
      if (isSolid(i0, cj) || isSolid(i1, cj)) { player.y = cj - player.h - 0.001; player.vy = 0; }
    }
  }
  if (player.grounded) {
    clearPlayerTraversal();
    player.traversalControlUntil = 0;
    player.coyoteUntil = gameMs + P.coyoteMs;
    player.airJumpsLeft = P.airJumps;
  }
  if (!wasGrounded && player.grounded) {
    player.jumpCutDone = true;
    scoreContact(player.y, 'land');       // a launch that went somewhere = a link
  }

  // Falling near a real solid top catches before a lower wall slide. One-way
  // catwalks are intentionally absent because the probe only uses isSolid.
  if (IS_TRAVERSAL_SLICE && player.traversalState === 'free' &&
      !player.grounded && player.vy < 0) {
    playerTraversalGeometry.minPlayerX =
      sLeftEdge() + CONFIG.edges.margin + P.traversalEdgeGuard;
    const catchState = traversalLedgeProbe({
      x: player.x, y: player.y, hw: player.hw, h: player.h,
      vx: collisionVx, vy: player.vy, grounded: player.grounded,
      down: keys.down, hInput: wallHit ? wallHit.side : h,
      now: gameMs, recatchUntil: player.traversalRecatchUntil,
    }, playerTraversalGeometry, P);
    if (catchState) {
      player.traversalState = 'ledge';
      player.traversalSide = catchState.side;
      player.traversalCellX = catchState.cellX;
      player.traversalTopY = catchState.topY;
      player.traversalSnapX = catchState.snapX;
      player.traversalSnapY = catchState.snapY;
      player.traversalUntil = gameMs + P.ledgeHangMs;
      player.traversalEntryVx = collisionVx;
      player.x = catchState.snapX; player.y = catchState.snapY;
      player.vx = 0; player.vy = 0; player.jumpCutDone = true;
      scoreContact(player.y, 'ledge');
    } else if (wallHit && wallHit.cellX >= playerTraversalGeometry.minCellX &&
               wallHit.cellX < playerTraversalGeometry.maxCellX &&
               playerTraversalGeometry.allowsGrab(wallHit.cellX, player.y, player.h) &&
               gameMs >= player.traversalRecatchUntil) {
      player.traversalState = 'wall';
      player.traversalSide = wallHit.side;
      player.traversalCellX = wallHit.cellX;
      player.traversalSnapX = wallHit.snapX;
      player.traversalUntil = gameMs + P.wallSlideMs;
      player.vy = Math.max(player.vy, -P.wallSlideSpeed);
      player.jumpCutDone = true;
      scoreContact(player.y, 'wall');
    }
  }

  // -- frustum constraints: left edge is a damage plane that pushes.
  //    Crush damage is suspended while a corner gate/turn holds the scroll —
  //    the plane isn't advancing, so a pin there would be unfair jank.
  const le = sLeftEdge() + CONFIG.edges.margin;
  if (player.traversalState !== 'free' &&
      player.x - player.hw < le + P.traversalEdgeGuard) {
    clearPlayerTraversal(gameMs + P.traversalRecatchMs);
    player.vx = Math.max(player.vx, activeScrollSpeed());
  }
  if (player.x - player.hw < le) {
    // The plane used to assign x with no collision resolution, so a pinned
    // player was pushed straight THROUGH a solid wall for 1 hp (adversarial
    // F4, reproduced against the dare-pocket dead end). Being crushed against
    // terrain has to be lethal pressure, not a teleport: stop at the wall's
    // outside face and let the damage stand, so the wall holds and the hp
    // clock (and then HULL FALLBACK) decides the outcome.
    player.x = le + player.hw;
    let crushed = false;
    if (playerOverlapsSolid()) {
      player.x = Math.floor(player.x + player.hw) - player.hw - 0.001;
      crushed = true;
    }
    // A ritual that holds the scroll suspends crush pressure for the same
    // reason a corner does: the plane is not advancing, so a pin there is jank.
    if (crushed && !cornerBusy() && !transformBusy()) damagePlayer(1, player.x - 1);
    // A pace may also make the plane itself lethal over time. Without this the
    // plane is a free conveyor: doing nothing at all survives on open ground
    // because the push costs no hp (adversarial F5).
    if (EDGE_PIN_MS > 0 && !cornerBusy()) {
      player.edgePinnedMs += dt * 1000;
      if (player.edgePinnedMs >= EDGE_PIN_MS) {
        player.edgePinnedMs = 0;
        damagePlayer(1, player.x - 1);
      }
    }
  } else {
    player.edgePinnedMs = 0;
  }
  //    Right clamp: while the active corner's face is still unbuilt, the
  //    pivot is the wall — the screen edge must not let the player walk
  //    onto hidden slam terrain (invisible floors and gaps past the corner).
  //    A pending transformation seam applies the same rule at its threshold.
  const ac = activeCorner();
  let re = sRightEdge() - CONFIG.edges.margin;
  if (ac) re = Math.min(re, ac.s + 1 - CONFIG.edges.margin);
  re = Math.min(re, transformFrontierX());
  if (player.x + player.hw > re) player.x = re - player.hw;
  //    Left clamp: a committed transformation sealed its panel behind RIG.
  //    The surface they came from is no longer rendered under their feet, so
  //    walking back through the seam is not a route.
  const seal = transformSealX();
  if (player.x - player.hw < seal) { player.x = seal + player.hw; player.vx = Math.max(player.vx, 0); }

  // -- fell into a gap
  if (ACTIVE_FIXTURE) {
    sliceStats.minEdgeMargin = Math.min(
      sliceStats.minEdgeMargin,
      player.x - player.hw - sLeftEdge()
    );
  }

  if (player.y < CONFIG.edges.killY) { loseLife('fall'); return; }

  // -- fire (RAGE halves the interval)
  if (keys.fire && gameMs >= player.nextFireAt) {
    const def = weaponDef(currentWeapon);
    const rageMult = gameMs < mods.rageUntil ? CONFIG.mods.rageFireMult : 1;
    // CHARGE gates the gun and nothing else: WARM shortens the interval
    player.nextFireAt = gameMs + def.fireRateMs * rageMult * scoreFireMult();
    const a = player.aim;
    fireWeapon(currentWeapon, player.x + a.x * 0.6, player.y + 1.05 + a.y * 0.5, a.x, a.y, false);
  }

  // -- rig transform (s,y → tower world) + aim pose + i-frame flicker
  view.player.sync();
}

export function damagePlayer(amount, fromX) {
  if (gameMs < player.iframesUntil) return;
  clearPlayerTraversal(gameMs + P.traversalRecatchMs);
  player.traversalControlUntil = 0;
  clearJumpBuffer();
  player.hp -= amount;
  player.iframesUntil = gameMs + P.iframesMs;
  player.hitstunUntil = gameMs + P.hitstunMs;
  const away = Math.sign(player.x - fromX || 1);
  player.vx = away * P.knockbackX;
  player.vy = P.knockbackY;
  player.grounded = false;
  // classic tension: the weapon capsule pops out toward the threat —
  // recatch it within the window or fall back to the rifle
  if (currentWeapon !== 'R' && player.hp > 0) {
    spawnCapsule('letter', currentWeapon, player.x, player.y + 1.2, 'pop', -away * CAP.popVx);
    setWeapon('R');
  }
  if (player.hp <= 0) loseLife('damage');
}

// Fast retry for the fixture: the run restarts itself through the host hook
// (src/main.js owns resetGame), so the sim never reaches up into the loop.
let sliceRetryTimer = 0;

function scheduleSliceRetry(reason) {
  if (!ACTIVE_FIXTURE || state === 'SLICE_RETRY') return;
  sliceStats.failures++;
  scoreRunEnd(reason === 'fall' ? 'fell' : 'lost');
  if (reason === 'fall') sliceStats.falls++;
  clearPlayerTraversal(0);
  player.traversalControlUntil = 0;
  clearJumpBuffer();
  releaseAllKeys();
  setState('SLICE_RETRY');
  sliceRetryTimer = setTimeout(() => {
    sliceRetryTimer = 0;
    if (state === 'SLICE_RETRY') host.resetGame();
  }, 650);
}

// resetGame cancels a pending auto-retry (the player pressed R first)
export function cancelSliceRetry() {
  if (sliceRetryTimer) {
    clearTimeout(sliceRetryTimer);
    sliceRetryTimer = 0;
  }
}

/* --------------------- HULL FALLBACK tier 1 (B.1) -------------------- *
 * The ship does not delete an anomaly on its hull, it dislodges one. Losing
 * costs altitude, CHARGE and a couple of seconds of position — never control,
 * and never a modal. Forward progress `s` is kept, and the routes below are
 * the worse ones, so the punishment is a demotion rather than a restart.    */
function fallbackSurfaces(x) {
  const out = [];
  const g = groundTopAt(x);
  if (g > -100) out.push(g);
  for (const pl of platforms)
    if (x + player.hw > pl.x0 && x - player.hw < pl.x1) out.push(pl.y);
  return out;
}

function hullFallback(reason) {
  const F = FALLBACK;
  if (player.x > player.fallbackRecoverX) player.fallbackStreak = 0;
  // Ceiling on consecutive fallbacks: B.1's tier 2 (band fallback into a
  // recovery shaft) is not built, so the fixture still retries past it rather
  // than letting a stuck player fall forever.
  if (player.fallbackStreak >= F.maxConsecutive) { scheduleSliceRetry(reason); return; }

  const y0 = player.y;
  const surfaces = fallbackSurfaces(player.x);
  let landY = traversalFallbackTarget(surfaces, y0, F);
  if (landY === null && surfaces.length) {
    const lowest = Math.min.apply(null, surfaces);
    if (y0 < lowest) landY = lowest;      // fell out of the world: the deck catches
  }
  if (landY === null && !surfaces.length) {           // over a gap: catch ahead
    let i = Math.max(0, Math.floor(player.x));
    while (i < LEVEL_LEN - 2 && groundTopAt(i) < -100) i++;
    player.x = i + 0.5;
    landY = groundTopAt(i) > -100 ? groundTopAt(i) : 3;
  }

  if (landY !== null) {
    player.y = landY + F.dropAboveTiles;
    player.vy = F.tossVy;
  } else {
    // Already on the lowest route: there is no altitude left to take, so the
    // ship takes margin instead. A fallback is never free.
    const le = sLeftEdge() + CONFIG.edges.margin + player.hw;
    player.x = Math.max(le, player.x - F.groundKnockTiles);
    player.vy = Math.max(player.vy, 0);
  }
  player.vx = Math.max(player.vx, F.tossVx);          // thrown forward, not stopped
  player.grounded = false; player.onOneWay = null; player.jumpCutDone = true;
  player.airJumpsLeft = P.airJumps;
  player.hp = P.maxHealth;
  player.iframesUntil = gameMs + F.iframesMs;
  player.hitstunUntil = 0;
  player.dropUntil = 0;
  player.coyoteUntil = 0;
  player.traversalChain = 0; player.traversalChainUntil = 0;
  player.fallbackStreak++;
  player.fallbackRecoverX = player.x + F.recoverTiles;
  sliceStats.setbacks++;
  sliceStats.lastSetbackAt = gameMs;
  sliceStats.failures++;
  if (reason === 'fall') sliceStats.falls++;
  scoreSetback(landY !== null ? 'fallback' : 'ground', y0, player.y);
}

export function loseLife(reason = 'damage') {
  clearPlayerTraversal(0);
  player.traversalControlUntil = 0;
  clearJumpBuffer();
  if (ACTIVE_FIXTURE) {                 // fixtures restart instead of spending a life
    if (SLICE_FALLBACK_ENABLED) hullFallback(reason);
    else scheduleSliceRetry(reason);
    return;
  }
  player.lives--;
  setWeapon('R');                     // death resets the arsenal
  clearMods();
  // ×3 on the HUD means three deaths total ends the run
  if (player.lives <= 0) { scoreRunEnd('game-over'); setState('GAME_OVER'); return; }
  respawn();
}

export function respawn() {
  let i = Math.max(2, Math.ceil(sLeftEdge()) + 3);
  while (i < LEVEL_LEN - 2 && (groundH[i] < -100 || groundH[i + 1] < -100)) i++;
  player.x = i + 0.5;
  player.y = (groundH[i] > -100 ? groundH[i] : 3) + 4;   // drop in from above
  player.vx = 0; player.vy = 0;
  player.hp = P.maxHealth;
  player.iframesUntil = gameMs + 2000;
  player.hitstunUntil = 0;
  player.dropUntil = 0;
  player.coyoteUntil = 0;
  player.grounded = false; player.onOneWay = null; player.jumpCutDone = true;
  player.airJumpsLeft = P.airJumps;
  clearPlayerTraversal(0);
  player.traversalControlUntil = 0;
  clearJumpBuffer();
}
