/* ================= OPT-IN ENEMY ECOLOGY TACTICS ================== */
/* The four genuinely new Level 1 decisions live here so hostiles.js keeps
 * ownership of bodies, deaths, gates and the ordinary per-kind rhythms.
 * Every entry point fails closed when a row has no matching ecology tactic.
 * Projectile-like hazards are three fixed slots on their owning body: no
 * global list, no hot-loop allocation, no extra body, and killing the source
 * cancels its release immediately.                                        */

import { CONFIG } from '../config.js';
import {
  ENEMY_TACTICS, aircombTooth, crosswindPulse, ecologyHasTactic,
  effectiveEcologyMechanics, reboundLaunch, resolveEnemyEcology,
  segmentBandHitsRect, sweepfanDirection,
} from '../pure/enemy-ecology.js';
import { BEND_S, crossesBend } from '../pure/path.js';
import {
  polypBeamHitsRect, polypBeamReach,
} from '../pure/polyp.js';
import { mortarArmed } from '../pure/mortar.js';
import { TRANSFORM_BEND_S } from '../pure/transform.js';
import { IS_TRANSFORM_SLICE } from '../mode.js';
import { builtGroundTopAt, builtSolidAt } from './level.js';
import { damagePlayer, player } from './player.js';
import { gameMs, approach } from './time.js';

const BENDS = IS_TRANSFORM_SLICE ? TRANSFORM_BEND_S : BEND_S;
const EMPTY = Object.freeze([]);
const MAX_HAZARDS = Math.max(0, Math.min(3,
  CONFIG.enemyEcology.maxHazardsPerBody | 0));
const sweepVector = { x: 0, y: 0, offset: 0 };

function hazardSlot() {
  return {
    active: false, kind: '', x: 0, y: 0, prevX: 0, prevY: 0,
    startX: 0, startY: 0, groundY: 0, vx: 0, vy: 0, radius: 0,
    bornAt: 0, expiresAt: 0,
  };
}

function hazardSlots(ecology) {
  if (!ecologyHasTactic(ecology, ENEMY_TACTICS.HORIZONTAL_BURST) &&
      !ecologyHasTactic(ecology, ENEMY_TACTICS.DESCENT_COMB)) return null;
  return [hazardSlot(), hazardSlot(), hazardSlot()];
}

export function makeEnemyEcologyFields(kind, row, spawnY = 0, genome = null) {
  const ecology = resolveEnemyEcology(row?.ecologyId, kind);
  const effectiveMechanics = effectiveEcologyMechanics(ecology, genome);
  return {
    ecology,
    ecologyId: ecology?.id || '',
    ecologyFamily: ecology?.family || '',
    ecologyMechanics: ecology?.mechanics || EMPTY,
    effectiveMechanics,
    tactics: ecology?.tactics || EMPTY,
    tacticState: 'idle',
    tacticPhase: 'stowed',
    tacticProgress: 0,
    tacticUntil: 0,
    tacticStartedAt: 0,
    tacticCycle: 0,
    tacticUses: 0,
    tacticHomeY: yOrZero(spawnY),
    tacticAimY: 0,
    tacticDir: 0,
    tacticBeamX: 0,
    tacticBeamY: 0,
    tacticCooldownMs: 0,
    tacticFallback: false,
    tacticHazardCount: 0,
    tacticHazards: hazardSlots(ecology),
  };
}

function yOrZero(value) { return Number.isFinite(value) ? value : 0; }

export function ecologyMechanic(fieldsOrEnemy, id) {
  return !!fieldsOrEnemy?.effectiveMechanics?.includes(id);
}

export function enemyHasTactic(e, id) {
  return ecologyHasTactic(e, id);
}

function setTactic(e, state, phase, until = 0) {
  e.tacticState = state;
  e.tacticPhase = phase;
  e.tacticStartedAt = gameMs;
  e.tacticUntil = until;
  e.tacticProgress = 0;
}

function progressTo(e, until = e.tacticUntil) {
  const total = Math.max(1, until - e.tacticStartedAt);
  return Math.max(0, Math.min(1, (gameMs - e.tacticStartedAt) / total));
}

function clearHazards(e) {
  if (e.tacticHazards) for (const h of e.tacticHazards) h.active = false;
  e.tacticHazardCount = 0;
}

/* -------------------------- REBOUND ------------------------------ */

export function resetReboundCycle(e) {
  if (!enemyHasTactic(e, ENEMY_TACTICS.REVERSE_VAULT)) return;
  e.tacticCycle++;
  e.tacticUses = 0;
  setTactic(e, 'acquire', 'charge-tell', e.stateUntil);
}

export function markReboundCharge(e) {
  if (!enemyHasTactic(e, ENEMY_TACTICS.REVERSE_VAULT)) return;
  setTactic(e, 'release', 'forward-charge', e.stateUntil);
}

export function markReboundRecovery(e, phase = 'landing-recover') {
  if (!enemyHasTactic(e, ENEMY_TACTICS.REVERSE_VAULT)) return;
  setTactic(e, 'recover', phase, e.stateUntil);
}

export function settleRebound(e) {
  if (!enemyHasTactic(e, ENEMY_TACTICS.REVERSE_VAULT)) return;
  setTactic(e, 'idle', 'stowed');
}

export function beginRebound(e) {
  if (!enemyHasTactic(e, ENEMY_TACTICS.REVERSE_VAULT) || e.tacticUses >= 1)
    return false;
  const R = CONFIG.enemyEcology.rebound;
  e.tacticUses = 1;
  e.vx = 0;
  e.vy = 0;
  e.state = 'reboundTell';
  e.stateUntil = gameMs + R.brakeTellMs;
  e.tacticDir = -(Math.sign(e.dir) || -1);
  setTactic(e, 'tell', 'edge-brake', e.stateUntil);
  return true;
}

/* Returns a small outcome token so hostiles.js can use its existing skid and
 * tumble transitions without this module taking body/gate ownership. */
function reboundDeckAt(e, x) {
  if (e.deckY === undefined) return builtGroundTopAt(x);
  return builtSolidAt(x, e.deckY - 0.5) ? e.deckY : -999;
}

export function updateRebound(e, dt) {
  if (e.state === 'reboundTell') {
    e.tacticProgress = progressTo(e, e.stateUntil);
    if (gameMs >= e.stateUntil) {
      const R = CONFIG.enemyEcology.rebound;
      const launch = reboundLaunch(-e.tacticDir, R);
      e.dir = launch.dir;
      e.vx = launch.vx;
      e.vy = launch.vy;
      e.state = 'reboundVault';
      e.stateUntil = gameMs + R.vaultMs;
      setTactic(e, 'release', 'reverse-vault', e.stateUntil);
    }
    return 'active';
  }
  if (e.state !== 'reboundVault') return '';

  const H = CONFIG.hound;
  const R = CONFIG.enemyEcology.rebound;
  const steps = Math.min(H.substeps, Math.max(1,
    Math.ceil(Math.hypot(e.vx, e.vy) * dt / 0.40)));
  const sdt = dt / steps;
  for (let k = 0; k < steps; k++) {
    const px = e.x, py = e.y;
    e.vy += R.gravity * sdt;
    e.x += e.vx * sdt;
    e.y += e.vy * sdt;
    if (crossesBend(BENDS, px, e.x)) {
      e.x = px; e.y = py;
      e.vy = 0;
      markReboundRecovery(e, 'facet-stop');
      return 'wall';
    }
    if (segmentBandHitsRect(px, py, e.x, e.y, e.hitR,
        player.x - player.hw, player.x + player.hw,
        player.y, player.y + player.h)) damagePlayer(1, e.x);
    if (builtSolidAt(e.x + e.dir * H.probeX * 0.35, e.y)) {
      e.vy = 0;
      markReboundRecovery(e, 'wall-recover');
      return 'wall';
    }
    let landing = reboundDeckAt(e, e.x);
    if (landing < -100) {
      e.deckY = undefined;
      landing = builtGroundTopAt(e.x);
    }
    if (e.vy <= 0 && landing > -100 && e.y <= landing + H.rideY) {
      e.y = landing + H.rideY;
      e.vy = 0;
      markReboundRecovery(e, 'landing-recover');
      return 'land';
    }
  }
  e.tacticProgress = progressTo(e, e.stateUntil);
  if (gameMs >= e.stateUntil) {
    markReboundRecovery(e, 'failed-landing');
    return 'tumble';
  }
  return 'active';
}

/* -------------------------- CROSSWIND ---------------------------- */

export function beginCrosswind(e, diveRange, diveCooldownMs, commitReady) {
  if (!enemyHasTactic(e, ENEMY_TACTICS.HORIZONTAL_BURST) ||
      !e.formationReady || Math.abs(e.x - player.x) >= diveRange ||
      player.y + 0.5 >= e.y || gameMs <= e.diveCdUntil || !commitReady) return false;
  const C = CONFIG.enemyEcology.crosswind;
  e.tacticCycle++;
  e.tacticUses = 0;
  e.tacticHomeY = e.baseY;
  e.tacticAimY = player.y + player.h * 0.5;
  e.tacticDir = Math.sign(player.x - e.x) || e.dir;
  e.dir = e.tacticDir;
  e.tacticCooldownMs = diveCooldownMs;
  if (e.twinstrike && e.twinPassesLeft <= 0) e.twinPassesLeft = 2;
  e.state = 'crosswindTell';
  e.stateUntil = gameMs + C.tellMs;
  setTactic(e, 'tell', 'horizontal-line-tell', e.stateUntil);
  clearHazards(e);
  return true;
}

function launchCrosswind(e) {
  const C = CONFIG.enemyEcology.crosswind;
  const count = Math.min(MAX_HAZARDS, C.count | 0, e.tacticHazards?.length || 0);
  const originX = e.x + e.tacticDir * C.muzzleTiles;
  for (let i = 0; i < count; i++) {
    const spec = crosswindPulse(i, originX, e.tacticAimY, e.tacticDir, C);
    const h = e.tacticHazards[i];
    h.active = true;
    h.kind = 'crosswind';
    h.x = h.prevX = h.startX = spec.x;
    h.y = h.prevY = h.startY = spec.y;
    h.vx = spec.vx; h.vy = 0; h.radius = spec.radius;
    h.bornAt = gameMs; h.expiresAt = gameMs + C.lifeMs;
  }
  e.tacticHazardCount = count;
}

export function updateCrosswind(e, dt, boundLeft, boundRight) {
  const C = CONFIG.enemyEcology.crosswind;
  if (e.state === 'crosswindTell') {
    e.baseY = approach(e.baseY, e.tacticAimY + C.bodyOffsetY, C.acquireRate * dt);
    e.y = e.baseY;
    e.tacticProgress = progressTo(e, e.stateUntil);
    if (gameMs >= e.stateUntil) {
      e.state = 'crosswindBurst';
      e.stateUntil = gameMs + C.burstMs;
      e.vx = e.tacticDir * C.strafeSpeed;
      setTactic(e, 'release', 'parallel-burst', e.stateUntil);
      launchCrosswind(e);
    }
    return true;
  }
  if (e.state === 'crosswindBurst') {
    const nx = Math.max(boundLeft, Math.min(boundRight, e.x + e.vx * dt));
    const facetStop = crossesBend(BENDS, e.x, nx);
    if (!facetStop) e.x = nx;
    e.y = e.baseY;
    e.tacticProgress = progressTo(e, e.stateUntil);
    if (gameMs >= e.stateUntil || facetStop || e.x <= boundLeft || e.x >= boundRight) {
      e.state = 'crosswindRecover';
      e.stateUntil = gameMs + C.recoverMs;
      e.vx = 0;
      setTactic(e, 'recover', 'strafe-exit', e.stateUntil);
    }
    return true;
  }
  if (e.state !== 'crosswindRecover') return false;
  e.baseY = approach(e.baseY, e.tacticHomeY, C.acquireRate * dt);
  e.y = e.baseY;
  e.tacticProgress = progressTo(e, e.stateUntil);
  if (gameMs >= e.stateUntil) {
    if (e.twinstrike && e.twinPassesLeft > 1) {
      e.twinPassesLeft--;
      if (e.formationSide) e.formationSide = -e.formationSide;
      e.formationReady = false;
      e.diveCdUntil = gameMs + CONFIG.genome.twinGapMs;
    } else {
      e.twinPassesLeft = 0;
      e.diveCdUntil = gameMs + (e.tacticCooldownMs || 0);
    }
    e.state = 'cruise';
    setTactic(e, 'idle', 'stowed');
  }
  return true;
}

function segmentBlocked(x0, y0, x1, y1) {
  if (crossesBend(BENDS, x0, x1)) return true;
  const distance = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(distance / 0.28));
  for (let i = 1; i <= steps; i++) {
    const u = i / steps;
    if (builtSolidAt(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u)) return true;
  }
  return false;
}

function updateCrosswindHazard(h, dt, boundLeft, boundRight) {
  const nx = h.x + h.vx * dt;
  const ny = h.y;
  if (gameMs >= h.expiresAt || nx < boundLeft || nx > boundRight ||
      segmentBlocked(h.x, h.y, nx, ny)) {
    h.active = false;
    return;
  }
  if (segmentBandHitsRect(h.x, h.y, nx, ny, h.radius,
      player.x - player.hw, player.x + player.hw,
      player.y, player.y + player.h)) {
    damagePlayer(1, h.x);
    h.active = false;
    return;
  }
  h.prevX = h.x; h.prevY = h.y;
  h.x = nx; h.y = ny;
}

/* -------------------------- SWEEPFAN ----------------------------- */

function sweepReach(e, dx, dy) {
  const PP = CONFIG.polyp;
  const S = CONFIG.enemyEcology.sweepfan;
  const tipX = e.x + e.dir * PP.barrelTiles;
  const horizontalClamp = Math.max(0, e.sightClamp);
  const bendRange = Math.abs(dx) > 1e-5 ? horizontalClamp / Math.abs(dx) : PP.sightRange;
  const maxRange = Math.min(PP.sightRange, bendRange);
  let d = 0;
  while (d < maxRange) {
    const nd = Math.min(maxRange, d + S.beamStepTiles);
    if (builtSolidAt(tipX + dx * nd, e.y + dy * nd)) return nd;
    d = nd;
  }
  return maxRange;
}

function polypBaseSeesPlayer(e, PP) {
  const tipX = e.x + e.dir * PP.barrelTiles;
  const reach = polypBeamReach(tipX, e.y, e.dir, e.sightClamp,
    builtSolidAt, PP.beamStepTiles);
  const leadSec = PP.anticipateMs / 1000;
  const leadX = Math.max(-PP.predictXCap, Math.min(PP.predictXCap, player.vx * leadSec));
  const leadY = Math.max(-PP.predictYCap, Math.min(PP.predictYCap, player.vy * leadSec));
  return polypBeamHitsRect(tipX, e.y, e.dir, reach, PP.beamHalf,
    player.x - player.hw, player.x + player.hw, player.y, player.y + player.h) ||
    polypBeamHitsRect(tipX, e.y, e.dir, reach, PP.beamHalf,
      player.x + leadX - player.hw, player.x + leadX + player.hw,
      player.y + leadY, player.y + leadY + player.h);
}

export function updateSweepfan(e, attackReady) {
  if (!enemyHasTactic(e, ENEMY_TACTICS.BOUNDED_SWEEP)) return false;
  const PP = CONFIG.polyp;
  if (gameMs < e.enterUntil) return true;
  if (e.state === 'relay') return false; // ordinary harmless hinge owns this beat
  if (e.state === 'closed') {
    setTactic(e, 'idle', 'stowed');
    e.beamReach = 0;
    if (!attackReady || gameMs < e.diveCdUntil) return true;
    if (e.autoCycle || polypBaseSeesPlayer(e, PP)) {
      e.state = 'tell';
      e.stateUntil = gameMs + PP.tellMs;
      e.tacticDir = e.genome?.phenotype?.handedness || 1;
      setTactic(e, 'tell', 'bounded-arc-tell', e.stateUntil);
    }
    return true;
  }
  if (e.state === 'tell') {
    e.tacticProgress = progressTo(e, e.stateUntil);
    if (gameMs >= e.stateUntil) {
      e.state = 'fire';
      e.stateUntil = gameMs + PP.beamMs;
      setTactic(e, 'release', 'sweep-start', e.stateUntil);
    }
    return true;
  }
  if (e.state === 'fire') {
    const u = progressTo(e, e.stateUntil);
    const direction = sweepfanDirection(e.dir, e.tacticDir, u,
      CONFIG.enemyEcology.sweepfan, sweepVector);
    const reach = sweepReach(e, direction.x, direction.y);
    const tipX = e.x + e.dir * PP.barrelTiles;
    e.tacticBeamX = direction.x;
    e.tacticBeamY = direction.y;
    e.beamReach = reach;
    e.tacticProgress = u;
    if (segmentBandHitsRect(tipX, e.y,
        tipX + direction.x * reach, e.y + direction.y * reach, PP.beamHalf,
        player.x - player.hw, player.x + player.hw,
        player.y, player.y + player.h)) damagePlayer(1, e.x);
    if (gameMs >= e.stateUntil) {
      e.state = 'vent';
      e.stateUntil = gameMs + PP.ventMs;
      e.beamReach = 0;
      setTactic(e, 'recover', 'terminal-vent', e.stateUntil);
    }
    return true;
  }
  if (e.state !== 'vent') return false;
  e.tacticProgress = progressTo(e, e.stateUntil);
  if (gameMs >= e.stateUntil) {
    if (e.relay) return false; // hostiles.js performs the existing hinge transition
    e.state = 'closed';
    e.diveCdUntil = gameMs + PP.cooldownMs;
    setTactic(e, 'idle', 'stowed');
  }
  return true;
}

/* --------------------------- AIRCOMB ----------------------------- */

function safeAircombSites(e, boundLeft, boundRight, centerX) {
  const A = CONFIG.enemyEcology.aircomb;
  const hand = e.genome?.phenotype?.handedness || 1;
  for (let i = 0; i < MAX_HAZARDS; i++) {
    const h = e.tacticHazards[i];
    aircombTooth(i, centerX, hand, A, h);
    const groundY = builtGroundTopAt(h.x);
    if (h.x < boundLeft || h.x > boundRight || groundY < -100 ||
        crossesBend(BENDS, e.x, h.x)) return false;
    h.startX = h.x;
    h.prevX = h.x;
    h.groundY = groundY;
    h.y = h.prevY = h.startY = groundY + A.dropHeight;
  }
  return true;
}

function launchAircomb(e) {
  const A = CONFIG.enemyEcology.aircomb;
  for (let i = 0; i < MAX_HAZARDS; i++) {
    const h = e.tacticHazards[i];
    h.active = true;
    h.kind = 'aircomb';
    h.bornAt = gameMs;
    h.expiresAt = gameMs + A.dropMs;
    h.vy = -A.dropHeight / Math.max(0.001, A.dropMs / 1000);
    h.y = h.prevY = h.startY;
  }
  e.tacticHazardCount = MAX_HAZARDS;
}

function updateAircombHazard(h, dt) {
  const ny = Math.max(h.groundY, h.y + h.vy * dt);
  if (segmentBandHitsRect(h.x, h.y, h.x, ny, h.radius,
      player.x - player.hw, player.x + player.hw,
      player.y, player.y + player.h)) {
    damagePlayer(1, h.x);
    h.active = false;
    return;
  }
  h.prevY = h.y;
  h.y = ny;
  if (gameMs >= h.expiresAt || h.y <= h.groundY) h.active = false;
}

function nextAircombCenter(e) {
  const travelSide = Math.sign(player.vx) || -e.dir || 1;
  const hand = e.genome?.phenotype?.handedness || 1;
  if (e.salvoPattern === 'BRACKET') return e.zoneHomeX + hand * CONFIG.genome.salvoOffset;
  if (e.salvoPattern === 'CUTBACK') return player.x - travelSide * CONFIG.genome.salvoOffset;
  return player.x + travelSide * CONFIG.genome.salvoOffset;
}

function armAircomb(e, boundLeft, boundRight, centerX) {
  if (!safeAircombSites(e, boundLeft, boundRight, centerX)) return false;
  const M = CONFIG.mortar;
  e.zoneX = centerX;
  e.zoneY = builtGroundTopAt(centerX);
  e.state = 'lob';
  e.stateUntil = gameMs + M.lobMs;
  e.podU = 0;
  setTactic(e, 'tell', 'comb-corridor-tell', e.stateUntil);
  return true;
}

export function updateAircomb(e, attackReady, boundLeft, boundRight) {
  if (!enemyHasTactic(e, ENEMY_TACTICS.DESCENT_COMB)) return false;
  const M = CONFIG.mortar;
  const A = CONFIG.enemyEcology.aircomb;
  if (gameMs < e.enterUntil) return true;
  if (e.state === 'aim') {
    setTactic(e, 'idle', 'stowed');
    if (attackReady && mortarArmed(player.x, e.zoneHomeX, M.armRange)) {
      e.salvoShotsRemaining = e.salvo ? 2 : 1;
      if (!armAircomb(e, boundLeft, boundRight, e.zoneHomeX))
        e.salvoShotsRemaining = 0;
    }
    return true;
  }
  if (e.state === 'lob') {
    e.podU = 1 - Math.max(0, (e.stateUntil - gameMs) / M.lobMs);
    e.tacticProgress = progressTo(e, e.stateUntil);
    if (gameMs >= e.stateUntil) {
      launchAircomb(e);
      e.state = 'aircombDrop';
      e.stateUntil = gameMs + A.dropMs;
      e.podU = 1;
      setTactic(e, 'release', 'teeth-descending', e.stateUntil);
    }
    return true;
  }
  if (e.state === 'aircombDrop') {
    e.tacticProgress = progressTo(e, e.stateUntil);
    if (gameMs >= e.stateUntil) {
      e.state = 'aircombImpact';
      e.stateUntil = gameMs + A.impactMs;
      setTactic(e, 'release', 'comb-impact', e.stateUntil);
    }
    return true;
  }
  if (e.state === 'aircombImpact') {
    e.tacticProgress = progressTo(e, e.stateUntil);
    if (gameMs < e.stateUntil) return true;
    clearHazards(e);
    if (e.salvo && e.salvoShotsRemaining > 1) {
      e.salvoShotsRemaining--;
      let centerX = nextAircombCenter(e);
      if (armAircomb(e, boundLeft, boundRight, centerX)) return true;
      centerX = e.zoneHomeX;
      if (armAircomb(e, boundLeft, boundRight, centerX)) return true;
    }
    e.salvoShotsRemaining = 0;
    e.zoneX = e.zoneHomeX;
    e.zoneY = e.zoneHomeY;
    e.state = 'cool';
    e.stateUntil = gameMs + M.coolMs;
    e.podU = 0;
    setTactic(e, 'recover', 'reload', e.stateUntil);
    return true;
  }
  if (e.state === 'cool') {
    e.tacticProgress = progressTo(e, e.stateUntil);
    if (gameMs >= e.stateUntil) {
      e.state = 'aim';
      setTactic(e, 'idle', 'stowed');
    }
    return true;
  }
  return false;
}

/* Called once per materialized owner before its state branch.  It updates at
 * most three fixed rows and reports the live count for render/debug proof. */
export function updateEnemyTacticHazards(e, dt, boundLeft, boundRight) {
  if (!e.tacticHazards) return;
  let live = 0;
  for (const h of e.tacticHazards) {
    if (!h.active) continue;
    if (h.kind === 'crosswind') updateCrosswindHazard(h, dt, boundLeft, boundRight);
    else if (h.kind === 'aircomb') updateAircombHazard(h, dt);
    if (h.active) live++;
  }
  e.tacticHazardCount = live;
}
