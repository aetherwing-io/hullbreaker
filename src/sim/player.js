/* ======================== ENTITIES: PLAYER ======================== */

import { CONFIG } from '../config.js';
import {
  traversalLedgeProbe, traversalLedgeDecision, traversalWallDecision,
  traversalSolidAllowsGrab, traversalChainMult, traversalFallbackTarget,
} from '../pure/traversal.js';
import { ladderCandidate, ladderStep } from '../pure/ladder.js';
import { crouchStance } from '../pure/stance.js';
import {
  ACTIVE_FIXTURE, ACTIVE_SLICE, AUTOBOUNCE_ENABLED, CROUCH_ENABLED, FLOW_ENABLED,
  HOOK_ENABLED, IS_TRAVERSAL_SLICE, RUN_FALLBACK_ENABLED, SLICE_FALLBACK_ENABLED,
} from '../mode.js';
import { RUN_FALLBACK } from '../pure/score.js';
import { view, host } from './bridge.js';
import { gameMs, sliceStats, approach } from './time.js';
import { sLeftEdge, sRightEdge } from './edges.js';
import {
  keys, jumpBufferedUntil, swapBufferedUntil, bufferJumpUntil, clearJumpBuffer,
  clearSwapBuffer, releaseAllKeys,
} from './input.js';
import {
  LEVEL_LEN, groundH, groundTopAt, ladders, platforms, isSolid, activeScrollSpeed,
} from './level.js';
import { state, setState } from './state.js';
import {
  carriedGun, currentGunDef, currentWeapon, dropCarriedGun, fireWeapon,
  setWeapon, swapWeapon, weaponHeldSince,
} from './weapons.js';
import { mods, clearMods } from './mods.js';
import { CAP, spawnCapsule } from './capsules.js';
import {
  scoreContact, scoreFireMult, scoreLaunch, scoreRunEnd, scoreSetback,
} from './score.js';
import {
  advanceCornerApproach, cornerBusy, cornerPlayerRouteWindow,
} from './wavegate.js';
import { transformBusy, transformFrontierX, transformSealX } from './transform.js';
// Movement-verb prototypes (?hook=1 / ?flow=1). Both modules are inert without
// their flag, and every call below is an identity operation when they are off.
import { hookCancel, hookUpdate } from './hook.js';
import { flowBreak, flowLaunch, flowSpeedNow, flowStep } from './flow.js';

// The vertical slice is allowed to prove a more forceful controller without
// silently changing the shipped six-face run. Every omitted field inherits the
// frozen base tune.
export const P = ACTIVE_SLICE
  ? { ...CONFIG.player, ...ACTIVE_SLICE.movement }
  : CONFIG.player;
// launch chaining is pacing-variant data, absent by default; the hull-fallback
// tune is the slice fixture's own where one is active, and the run tune from
// src/pure/score.js otherwise (CP4 promotion — armed only by ?fallback=1
// there, see RUN_FALLBACK_ENABLED in loseLife)
const CHAIN = ACTIVE_SLICE ? ACTIVE_SLICE.chain : null;
const FALLBACK = ACTIVE_SLICE ? ACTIVE_SLICE.fallback : RUN_FALLBACK;
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
  ladderId: null,
  traversalCellX: 0, traversalTopY: 0,
  traversalSnapX: 0, traversalSnapY: 0,
  traversalUntil: 0, traversalRecatchUntil: 0, traversalEntryVx: 0,
  traversalControlUntil: 0,
  traversalChain: 0, traversalChainUntil: 0,
  fallbackStreak: 0, fallbackEarnedTiles: 0, edgePinnedMs: 0,
  crouched: false, muzzleY: P.muzzleY,
  hp: P.maxHealth, lives: P.lives,
  iframesUntil: 0, hitstunUntil: 0,
  nextFireAt: 0,
};

function computeAim() {
  const h = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  const v = (keys.up ? 1 : 0) - (keys.down ? 1 : 0);
  if (h !== 0) player.facing = h;
  // Strafe preserves the horizontal firing line while RIG moves, but an
  // explicit up/down aim must always win. Besides feeling better, this is the
  // recovery path for a missed browser Shift keyup: the player can immediately
  // take an elevated target instead of being trapped on a horizontal shot.
  if (keys.strafe && v === 0) return;
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
const ladderById = new Map(ladders.map((row) => [row.id, row]));
// Simulation capability follows the selected level, never a renderer flag.
// `?zip=1` changes only the corner reveal and must remain byte-identical to the
// ordinary six-face controller. Authored fixtures keep their prior domains.
const TRAVERSAL_CONTACTS_ENABLED = IS_TRAVERSAL_SLICE || ACTIVE_FIXTURE === null;
const LADDERS_ENABLED = ACTIVE_FIXTURE === null && ladders.length > 0;
// The authored slice carries this override; the normal run already carries
// every other contact tune in CONFIG.player and uses the same short handoff.
const TRAVERSAL_CONTROL_MS = P.traversalLaunchControlMs ?? 100;

export function clearPlayerTraversal(recatchUntil = player.traversalRecatchUntil) {
  player.traversalState = 'free';
  player.ladderId = null;
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

// The two things sim/hook.js cannot reach on its own without importing this
// module back (which would close the import cycle): the pace's launch chain and
// the traversal-state clear. Allocated once, not per frame.
const hookApi = { chainMult: chainLaunchMult, clearTraversal: clearPlayerTraversal };

export function updatePlayer(dt) {
  computeAim();
  if (swapBufferedUntil > gameMs) {
    swapWeapon();
    clearSwapBuffer();
  }
  const frameStartX = player.x;

  // ?crouch=1 (A/B prototype): a planted stance that drops the firing line onto
  // low targets and the profile under skimming ones. Pure decision in
  // src/pure/stance.js; here it only sets the body height, the muzzle, and — as
  // the cost — zeroes the horizontal input while it is held.
  const stance = crouchStance({
    enabled: CROUCH_ENABLED, grounded: player.grounded, down: keys.down,
    jumpBuffered: jumpBufferedUntil > gameMs,
    traversalState: player.traversalState,
    standHeight: P.height, standMuzzleY: P.muzzleY,
  }, CONFIG.crouch);
  player.crouched = stance.crouched;
  player.muzzleY = stance.muzzleY;
  player.h = stance.height;
  if (!stance.crouched && playerOverlapsSolid()) player.h = CONFIG.crouch.height;
  if (stance.crouched && CONFIG.crouch.aimLevel) player.aim.set(player.facing, 0);

  const h = stance.planted ? 0 : (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  const v = (keys.up ? 1 : 0) - (keys.down ? 1 : 0);
  let ledgeHanging = false;
  let wallSliding = false;
  let ladderClimbing = false;
  // SNAP HOOK (?hook=1): runs before the ledge/wall branches so a grab can take
  // over a hang or a slide — every grab wants to become another launch. While
  // the tether is taut it owns position, exactly as a ledge hang does, so the
  // drive, gravity and both integrations below stand down for that frame.
  const hooked = HOOK_ENABLED ? hookUpdate(player, dt, hookApi) : false;

  // A rail is entered only by vertical intent inside its narrow authored
  // volume. Aim elsewhere remains aim; every rail is optional and the route
  // stays jumpable. Fixtures have no ladder behavior and retain their exact
  // traversal domain.
  if (!TRAVERSAL_CONTACTS_ENABLED && player.traversalState !== 'free')
    clearPlayerTraversal(0);
  if (!LADDERS_ENABLED && player.traversalState === 'ladder')
    clearPlayerTraversal(0);
  if (LADDERS_ENABLED && player.traversalState === 'free' && !hooked && v &&
      gameMs >= player.hitstunUntil && gameMs >= player.traversalRecatchUntil) {
    const row = ladderCandidate(ladders, {
      x: player.x, y: player.y, h: player.h,
    }, v);
    if (row) {
      player.traversalState = 'ladder';
      player.ladderId = row.id;
      player.x = row.x;
      player.crouched = false;
      player.h = P.height;
      player.muzzleY = P.muzzleY;
      player.grounded = false;
      player.onOneWay = null;
      player.coyoteUntil = 0;
      player.jumpCutDone = true;
    }
  }

  // Contextual traversal launches happen before the ordinary jump branch so
  // they neither consume nor refill the player's remaining air jump.
  if (player.traversalState === 'ladder') {
    const row = ladderById.get(player.ladderId);
    const action = ladderStep({
      ladder: row, x: player.x, y: player.y, h: player.h,
      facing: player.facing, hInput: h, vInput: v,
      jumpBuffered: jumpBufferedUntil > gameMs,
      dt,
    });
    if (action.kind === 'climb') {
      player.x = action.x;
      player.y = action.y;
      player.vx = action.vx;
      player.vy = action.vy;
      player.grounded = false;
      player.onOneWay = null;
      player.jumpCutDone = true;
      ladderClimbing = true;
    } else {
      clearPlayerTraversal(gameMs + P.traversalRecatchMs);
      if (action.kind === 'jump') clearJumpBuffer();
      if (Number.isFinite(action.y)) player.y = action.y;
      player.vx = action.vx || 0;
      player.vy = action.vy || 0;
      player.grounded = false;
      player.onOneWay = null;
      player.jumpCutDone = true;
      player.coyoteUntil = 0;
      player.traversalControlUntil = gameMs + TRAVERSAL_CONTROL_MS;
    }
  } else if (TRAVERSAL_CONTACTS_ENABLED && player.traversalState === 'ledge') {
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
      // flowLaunch returns its third argument unchanged unless ?flow=1
      player.vx = action.vx * flowLaunch(player, 'ledge', chainLaunchMult(), action.vx);
      player.vy = action.vy;
      player.grounded = false; player.onOneWay = null;
      player.coyoteUntil = 0; player.jumpCutDone = true;
      player.traversalControlUntil = gameMs + TRAVERSAL_CONTROL_MS;
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
  } else if (TRAVERSAL_CONTACTS_ENABLED && player.traversalState === 'wall') {
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
      player.vx = action.vx * flowLaunch(player, 'wall', chainLaunchMult(), action.vx);
      player.vy = action.vy;
      player.grounded = false; player.onOneWay = null;
      player.coyoteUntil = 0; player.jumpCutDone = true;
      player.traversalControlUntil = gameMs + TRAVERSAL_CONTROL_MS;
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
  //    flowSpeedNow() is exactly 1 unless ?flow=1: a live momentum chain raises
  //    the drive's target so a chained launch keeps its speed instead of being
  //    pulled back to runSpeed within a few frames.
  if (!ledgeHanging && !wallSliding && !ladderClimbing && !hooked &&
      gameMs >= player.hitstunUntil && gameMs >= player.traversalControlUntil) {
    const accel = player.grounded ? P.accelGround : P.accelAir;
    player.vx = approach(player.vx, h * P.runSpeed * flowSpeedNow(), accel * dt);
  }

  // -- jump: buffer + coyote + one air jump; down+jump on a catwalk = drop-through
  if (player.traversalState === 'free' && !hooked && jumpBufferedUntil > gameMs) {
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

  // -- gravity (a taut tether suspends it, the way a ledge hang does)
  if (!ledgeHanging && !ladderClimbing && !hooked) {
    const g = P.gravity * (player.vy < 0 ? P.fallGravityMult : 1);
    player.vy = Math.max(P.terminalVel, player.vy + g * dt);
    if (wallSliding) player.vy = Math.max(player.vy, -P.wallSlideSpeed);
  }

  // -- integrate X, resolve against solids (dt clamp keeps moves < 1 tile)
  let wallHit = null;
  const collisionVx = player.vx;
  if (!ledgeHanging && !wallSliding && !ladderClimbing && !hooked) {
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
  if (!ledgeHanging && !ladderClimbing && !hooked) {
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
    // ?autobounce=1: re-arm the jump buffer on contact while jump is HELD. The
    // buffer otherwise arms only on a fresh keydown (main.js checks !e.repeat),
    // so holding jump lands you and keeps you there — the root of adversarial
    // F11's parked policy. The next frame's ordinary jump branch consumes this
    // like any other buffered press, so nothing else changes.
    if (AUTOBOUNCE_ENABLED && keys.jump) bufferJumpUntil(gameMs + P.jumpBufferMs);
  }
  // MOMENTUM SPINE (?flow=1): the chain's window and its ground decay, stepped
  // once the frame's grounded state is settled. A no-op without the flag.
  if (FLOW_ENABLED) flowStep(dt, player.grounded);

  // Falling near a real solid top catches before a lower wall slide. One-way
  // catwalks are intentionally absent because the probe only uses isSolid.
  if (TRAVERSAL_CONTACTS_ENABLED && player.traversalState === 'free' && !hooked &&
      !keys.jump && !player.grounded && player.vy < 0) {
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
  const pinned = player.x - player.hw < le;
  if (pinned) {
    // The plane pushes, and it only ever pushes FORWARD. Two earlier versions
    // of this were both wrong: assigning x with no collision test shoved a
    // pinned player straight through a solid wall (adversarial F4), and then
    // ejecting them back out of the column they were shoved into left them
    // BEHIND the plane (edgeMargin measured to -0.60) and ground them through
    // the wall a tile per frame anyway. There is no position that satisfies
    // both "ahead of the plane" and "outside the wall" — that IS the crush, so
    // it resolves on the frame it happens instead of leaking geometry.
    player.x = le + player.hw;
    // A ritual that holds the scroll suspends crush for the same reason a
    // corner does: the plane is not advancing, so a pin there would be jank.
    if (playerOverlapsSolid() && !cornerBusy() && !transformBusy()) {
      if (IS_TRAVERSAL_SLICE) {
        crushPlayer();                 // resolves inside this frame, see below
      } else {
        // Six-face run: the wall HOLDS — RIG is pinned at its outside face
        // instead of being teleported through it — and the crush ignores
        // i-frames like the fixture's does, so the pin resolves in a few frames
        // (one hp each) instead of grinding through terrain for a second and a
        // half. Shipped behaviour was a slow teleport into invisible geometry
        // that ended in death anyway; this ends in the same death, legibly.
        player.x = Math.floor(player.x + player.hw) - player.hw - 0.001;
        player.iframesUntil = 0;
        damagePlayer(1, player.x - 1);
      }
    }
    // A pace may also make the plane itself lethal over time. Without this the
    // plane is a free conveyor: doing nothing at all survives on open ground
    // because the push costs no hp (adversarial F5).
    // NOTE: this clock is guarded by !cornerBusy() but not !transformBusy().
    // It is dead in the transformation fixture only because EDGE_PIN_MS comes
    // from ACTIVE_SLICE, which is null there. If EDGE_PIN_MS is ever
    // generalized to ACTIVE_FIXTURE, add the transform guard here too — a
    // held scroll must not bill the player for standing still.
    if (EDGE_PIN_MS > 0 && !cornerBusy()) {
      player.edgePinnedMs += dt * 1000;
      if (player.edgePinnedMs >= EDGE_PIN_MS) {
        player.edgePinnedMs = 0;
        damagePlayer(1, player.x - 1);
      }
    }
  } else {
    player.edgePinnedMs = 0;
    // Earned progress: forward motion on a frame the plane was NOT shoving us.
    // The streak that caps consecutive fallbacks used to clear on player.x
    // alone, which the plane's own shove supplies — a zero-input run reset the
    // safeguard with the very displacement the safeguard exists to punish.
    if (player.x > frameStartX) player.fallbackEarnedTiles += player.x - frameStartX;
  }
  //    Right clamp: while the active corner's face is still unbuilt, the
  //    pivot is the wall — the screen edge must not let the player walk
  //    onto hidden slam terrain (invisible floors and gaps past the corner).
  //    A pending transformation seam applies the same rule at its threshold.
  let cornerWindow = cornerPlayerRouteWindow(player.hw);
  let re = sRightEdge() - CONFIG.edges.margin;
  re = Math.min(re, cornerWindow.frontierRight);
  re = Math.min(re, transformFrontierX());
  if (player.x + player.hw > re) player.x = re - player.hw;
  // Reaching the chamfer is the only operation that may start a cleared
  // corner ritual. Re-read the window because that transition makes the
  // joint a left seal on this same frame; no input or knockback substep gets
  // one frame to retreat onto the departing facet before the camera moves.
  if (advanceCornerApproach(player.x)) cornerWindow = cornerPlayerRouteWindow(player.hw);
  //    Left clamp: a committed transformation or hull corner sealed its panel
  //    behind RIG. Those surfaces are no longer rendered under their feet, so
  //    walking back through either seam is not a route.
  const seal = Math.max(transformSealX(), cornerWindow.sealLeft);
  if (player.x - player.hw < seal) { player.x = seal + player.hw; player.vx = Math.max(player.vx, 0); }

  // Closest crush approach, every mode (was fixture-only): the score snapshot
  // reads it (A.5) and the CP4 default-run promotion needs it as evidence.
  // resetGame clears it per run; the HUD still only displays it in the slice.
  sliceStats.minEdgeMargin = Math.min(
    sliceStats.minEdgeMargin,
    player.x - player.hw - sLeftEdge()
  );

  if (player.y < CONFIG.edges.killY) { loseLife('fall'); return; }

  // -- fire (RAGE halves the interval)
  if (keys.fire && gameMs >= player.nextFireAt) {
    const def = currentGunDef();
    const rageMult = gameMs < mods.rageUntil ? CONFIG.mods.rageFireMult : 1;
    // CHARGE gates the gun and nothing else: WARM shortens the interval
    player.nextFireAt = gameMs + def.fireRateMs * rageMult * scoreFireMult();
    const a = player.aim;
    fireWeapon(currentWeapon, player.x + a.x * 0.6,
      player.y + player.muzzleY + a.y * 0.5, a.x, a.y, false);
  }

  // -- rig transform (s,y → tower world) + aim pose + i-frame flicker
  view.player.sync();
}

// A crush is the damage plane and a solid closing on the same tile: there is no
// position that is both ahead of the plane and outside the wall. It is not a
// "hit", so i-frames must not hold RIG inside terrain while the plane keeps
// advancing — it lands in full on the frame it happens, and HULL FALLBACK
// relocates RIG immediately with control kept. Fixture only; the six-face run
// keeps its shipped hp cadence at the wall face.
function crushPlayer() {
  player.iframesUntil = 0;
  // A crush resolves the pin — clear the EDGE_PIN_MS accumulator so the
  // sibling pin-damage clock can't fire a stale second hit on the same frame
  // against the just-relocated (and possibly just-healed) player.
  player.edgePinnedMs = 0;
  damagePlayer(player.hp, player.x - 1);
}

export function damagePlayer(amount, fromX) {
  if (gameMs < player.iframesUntil) return;
  clearPlayerTraversal(gameMs + P.traversalRecatchMs);
  player.traversalControlUntil = 0;
  clearJumpBuffer();
  // taking a hit knocks RIG off the tether and off the chain: momentum is
  // earned, and a hit is exactly the thing that un-earns it
  if (HOOK_ENABLED) hookCancel();
  if (FLOW_ENABLED) flowBreak();
  player.hp -= amount;
  player.iframesUntil = gameMs + P.iframesMs;
  player.hitstunUntil = gameMs + P.hitstunMs;
  const away = Math.sign(player.x - fromX || 1);
  player.vx = away * P.knockbackX;
  player.vy = P.knockbackY;
  player.grounded = false;
  // classic tension: the weapon capsule pops out toward the threat —
  // recatch it within the window or fall back to the rifle
  if (carriedGun && player.hp > 0 &&
      gameMs - weaponHeldSince >= CAP.pickupGraceMs) {
    const droppedGun = dropCarriedGun();
    spawnCapsule(
      'letter', droppedGun.letter, player.x, player.y + 1.2, 'pop',
      -away * CAP.popVx, droppedGun,
    );
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

// One canonical fresh-run pose. Respawn and fallback intentionally preserve
// different pieces of run state; only the composition-root reset registry
// calls this complete reset.
export function resetPlayerForRun(x = 6, y = 3) {
  player.x = x;
  player.y = y;
  player.vx = 0; player.vy = 0;
  player.hp = P.maxHealth; player.lives = P.lives;
  player.facing = 1; player.aim.set(1, 0);
  player.iframesUntil = 0; player.hitstunUntil = 0;
  player.coyoteUntil = 0; player.dropUntil = 0; player.nextFireAt = 0;
  player.grounded = false; player.onOneWay = null; player.jumpCutDone = true;
  player.airJumpsLeft = P.airJumps;
  player.traversalChain = 0; player.traversalChainUntil = 0;
  player.fallbackStreak = 0; player.fallbackEarnedTiles = 0;
  player.edgePinnedMs = 0;
  clearPlayerTraversal(0);
  player.traversalControlUntil = 0;
  clearJumpBuffer();
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

// Resolve any residual overlap by riding the top of what we are inside, but
// only while that stays at or below `ceilY`. Returns false when the only way
// out would be upward — i.e. RIG is trapped against geometry the plane has
// already reached, and this fallback has nothing left to take.
function settleFallback(ceilY) {
  for (let guard = 0; guard < 6; guard++) {
    if (!playerOverlapsSolid()) return true;
    const i0 = Math.floor(player.x - player.hw + 0.02);
    const i1 = Math.floor(player.x + player.hw - 0.02);
    let top = -Infinity;
    for (let i = i0; i <= i1; i++)
      for (let j = Math.floor(player.y + 0.02); j <= Math.floor(player.y + player.h - 0.02); j++)
        if (isSolid(i, j)) top = Math.max(top, j + 1);
    if (top === -Infinity) return true;
    if (top + 0.001 > ceilY) return false;
    player.y = top + 0.001;
  }
  return !playerOverlapsSolid();
}

// Reached from the traversal slice (SLICE_FALLBACK_ENABLED, on by default
// there) and — CP4 promotion — from the default six-face run behind
// ?fallback=1 (RUN_FALLBACK_ENABLED, off by default). Returns true when the
// setback was absorbed as a fallback; false when it has nothing left to give
// (streak ceiling, or trapped with nowhere lower) and the caller's next
// consequence tier applies: the slice retries, the run spends a stock life.
function hullFallback(reason) {
  const F = FALLBACK;
  // Mercy chain: RIG who fights back down a lower route earns the next
  // fallback. Conveyed distance never counts, so idling cannot buy mercy.
  if (player.fallbackEarnedTiles >= F.recoverTiles) player.fallbackStreak = 0;
  // Ceiling on consecutive fallbacks: B.1's tier 2 (band fallback into a
  // recovery shaft) is not built, so past the ceiling the caller escalates
  // rather than letting a stuck player fall forever.
  if (player.fallbackStreak >= F.maxConsecutive) return false;

  const y0 = player.y, x0 = player.x;
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
  // A fallback may only ever move RIG down or back — never up past the band
  // they were dislodged from. Without that rule this settle step "rescued" a
  // one-key policy: pinned in the dare pocket with the plane on top of it, the
  // knock-back was cancelled (no room), RIG was left embedded in the dead-end
  // column, and the settle lifted them onto its top — over the very wall that
  // trapped them — from where they ran to victory at full hp. Nowhere to fall
  // and nowhere to retreat is a terminal state, not a lift.
  if (!settleFallback(y0)) {
    player.x = x0; player.y = y0;
    return false;
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
  player.fallbackEarnedTiles = 0;
  sliceStats.setbacks++;
  sliceStats.lastSetbackAt = gameMs;
  sliceStats.failures++;
  if (reason === 'fall') sliceStats.falls++;
  scoreSetback(landY !== null ? 'fallback' : 'ground', y0, player.y);
  return true;
}

export function loseLife(reason = 'damage') {
  clearPlayerTraversal(0);
  player.traversalControlUntil = 0;
  clearJumpBuffer();
  if (HOOK_ENABLED) hookCancel();
  if (FLOW_ENABLED) flowBreak();
  if (ACTIVE_FIXTURE) {                 // fixtures restart instead of spending a life
    if (!SLICE_FALLBACK_ENABLED || !hullFallback(reason)) scheduleSliceRetry(reason);
    return;
  }
  // CP4 promotion: in the default run ?fallback=1 absorbs the setback as a
  // HULL FALLBACK first; only past its ceiling (or trapped with nowhere
  // lower) does the stock lives tier below bite, so the run still has a
  // terminal state and a fall loop cannot spin forever.
  if (RUN_FALLBACK_ENABLED && hullFallback(reason)) return;
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
