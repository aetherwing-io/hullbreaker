/* ============ ENEMY ECOLOGY SEMANTIC VISUAL SELECTOR ============ */
/* Simulation owns every verb. This module only maps honest row fields onto
   the approved independent B0..B7 / A0..A7 axes. It returns one packed byte,
   allocates nothing in the hot loop, and never invents an attack timer. */

import { CONFIG } from '../config.js';

export const ECOLOGY_BODY = Object.freeze({
  IDLE: 0, MOVE: 1, ACQUIRE: 2, COMMIT: 3,
  RECOVER: 4, HIT: 5, CRITICAL: 6, BREAKUP: 7,
});

export const ECOLOGY_ACTION = Object.freeze({
  STOWED: 0, ACQUIRE: 1, TELL: 2, EARLY: 3,
  PEAK: 4, FOLLOW: 5, RECOVER: 6, SPENT: 7,
});

export function enemyEcologyVisualCode(body, action) {
  return ((body & 7) << 3) | (action & 7);
}

export function enemyEcologyBodyIndex(code) { return (code >> 3) & 7; }
export function enemyEcologyActionIndex(code) { return code & 7; }

function clamp01(value) {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

function timedProgress(row, nowMs, durationMs) {
  if (!(durationMs > 0) || !Number.isFinite(row.stateUntil)) return 0;
  return clamp01(1 - Math.max(0, row.stateUntil - nowMs) / durationMs);
}

function tacticProgress(row) {
  return Number.isFinite(row.tacticProgress) ? clamp01(row.tacticProgress) : 0;
}

function staged(progress, firstAt = 0.5, lastAt = 2) {
  return progress < firstAt ? ECOLOGY_ACTION.EARLY
    : progress < lastAt ? ECOLOGY_ACTION.PEAK : ECOLOGY_ACTION.FOLLOW;
}

function locomotionAction(row, rate) {
  const phase = Math.abs((Number(row.x) || 0) * rate + (Number(row.id) || 0) * 0.173);
  const beat = Math.floor((phase - Math.floor(phase)) * 3) % 3;
  return beat === 0 ? ECOLOGY_ACTION.STOWED
    : beat === 1 ? ECOLOGY_ACTION.ACQUIRE : ECOLOGY_ACTION.RECOVER;
}

function flightAction(row) {
  const phase = Math.abs((Number(row.t) || 0) * 3.25 + (Number(row.id) || 0) * 0.173);
  const beat = Math.floor((phase - Math.floor(phase)) * 3) % 3;
  return beat === 0 ? ECOLOGY_ACTION.STOWED
    : beat === 1 ? ECOLOGY_ACTION.ACQUIRE : ECOLOGY_ACTION.RECOVER;
}

function tacticCode(row) {
  const p = tacticProgress(row);
  switch (row.tacticPhase) {
    case 'charge-tell':
      return enemyEcologyVisualCode(ECOLOGY_BODY.ACQUIRE, ECOLOGY_ACTION.TELL);
    case 'forward-charge':
      return enemyEcologyVisualCode(ECOLOGY_BODY.COMMIT, staged(p, 0.5));
    case 'edge-brake':
      return enemyEcologyVisualCode(ECOLOGY_BODY.RECOVER, ECOLOGY_ACTION.FOLLOW);
    case 'reverse-vault':
      return enemyEcologyVisualCode(ECOLOGY_BODY.COMMIT, staged(p, 0.33, 0.70));
    case 'landing-recover':
    case 'wall-recover':
    case 'facet-stop':
    case 'failed-landing':
      return enemyEcologyVisualCode(ECOLOGY_BODY.RECOVER, ECOLOGY_ACTION.RECOVER);
    case 'horizontal-line-tell':
      return enemyEcologyVisualCode(ECOLOGY_BODY.ACQUIRE, ECOLOGY_ACTION.TELL);
    case 'parallel-burst':
      return enemyEcologyVisualCode(ECOLOGY_BODY.COMMIT, staged(p, 0.45));
    case 'strafe-exit':
      return enemyEcologyVisualCode(ECOLOGY_BODY.RECOVER,
        p < 0.5 ? ECOLOGY_ACTION.FOLLOW : ECOLOGY_ACTION.RECOVER);
    case 'bounded-arc-tell':
      return enemyEcologyVisualCode(ECOLOGY_BODY.ACQUIRE, ECOLOGY_ACTION.TELL);
    case 'sweep-start':
      return enemyEcologyVisualCode(ECOLOGY_BODY.COMMIT, staged(p, 0.5));
    case 'terminal-vent':
      return enemyEcologyVisualCode(ECOLOGY_BODY.RECOVER,
        p < 0.5 ? ECOLOGY_ACTION.FOLLOW : ECOLOGY_ACTION.RECOVER);
    case 'comb-corridor-tell':
      return enemyEcologyVisualCode(ECOLOGY_BODY.ACQUIRE, ECOLOGY_ACTION.TELL);
    case 'teeth-descending':
      return enemyEcologyVisualCode(ECOLOGY_BODY.COMMIT, staged(p, 0.4));
    case 'comb-impact':
      return enemyEcologyVisualCode(ECOLOGY_BODY.COMMIT, ECOLOGY_ACTION.FOLLOW);
    case 'reload':
      return enemyEcologyVisualCode(ECOLOGY_BODY.RECOVER, ECOLOGY_ACTION.RECOVER);
    default:
      return -1;
  }
}

function houndCode(row, nowMs) {
  switch (row.state) {
    case 'tell':
    case 'reboundTell':
      return enemyEcologyVisualCode(ECOLOGY_BODY.ACQUIRE, ECOLOGY_ACTION.TELL);
    case 'charge': {
      const p = timedProgress(row, nowMs, CONFIG.hound.chargeMs);
      return enemyEcologyVisualCode(ECOLOGY_BODY.COMMIT, staged(p, 0.5));
    }
    case 'vault': {
      const p = timedProgress(row, nowMs, CONFIG.genome.vaultMs);
      return enemyEcologyVisualCode(ECOLOGY_BODY.COMMIT, staged(p, 0.33, 0.70));
    }
    case 'reboundVault': {
      const p = tacticProgress(row);
      return enemyEcologyVisualCode(ECOLOGY_BODY.COMMIT, staged(p, 0.33, 0.70));
    }
    case 'tumble':
      return enemyEcologyVisualCode(ECOLOGY_BODY.COMMIT,
        row.vy > 2 ? ECOLOGY_ACTION.EARLY
          : row.vy > -3 ? ECOLOGY_ACTION.PEAK : ECOLOGY_ACTION.FOLLOW);
    case 'skid':
      return enemyEcologyVisualCode(ECOLOGY_BODY.RECOVER, ECOLOGY_ACTION.RECOVER);
    case 'prowl':
    default:
      return enemyEcologyVisualCode(ECOLOGY_BODY.MOVE, locomotionAction(row, 0.82));
  }
}

function waspCode(row, nowMs) {
  switch (row.state) {
    case 'dive':
      if (nowMs < (row.lockUntil || 0))
        return enemyEcologyVisualCode(ECOLOGY_BODY.ACQUIRE, ECOLOGY_ACTION.TELL);
      return enemyEcologyVisualCode(ECOLOGY_BODY.COMMIT,
        staged(timedProgress(row, nowMs, CONFIG.wasp.diveMs), 0.48));
    case 'recover':
    case 'crosswindRecover':
      return enemyEcologyVisualCode(ECOLOGY_BODY.RECOVER, ECOLOGY_ACTION.RECOVER);
    case 'cruise':
    default:
      return enemyEcologyVisualCode(ECOLOGY_BODY.MOVE, flightAction(row));
  }
}

function polypCode(row, nowMs) {
  switch (row.state) {
    case 'tell':
      return enemyEcologyVisualCode(ECOLOGY_BODY.ACQUIRE, ECOLOGY_ACTION.TELL);
    case 'fire':
      return enemyEcologyVisualCode(ECOLOGY_BODY.COMMIT,
        staged(timedProgress(row, nowMs, CONFIG.polyp.beamMs), 0.5));
    case 'vent': {
      const p = timedProgress(row, nowMs, CONFIG.polyp.ventMs);
      return enemyEcologyVisualCode(ECOLOGY_BODY.RECOVER,
        p < 0.5 ? ECOLOGY_ACTION.FOLLOW : ECOLOGY_ACTION.RECOVER);
    }
    case 'relay':
      return enemyEcologyVisualCode(ECOLOGY_BODY.RECOVER, ECOLOGY_ACTION.RECOVER);
    case 'closed':
    default:
      return enemyEcologyVisualCode(ECOLOGY_BODY.IDLE, ECOLOGY_ACTION.STOWED);
  }
}

function mortarCode(row, nowMs) {
  switch (row.state) {
    case 'lob':
      return enemyEcologyVisualCode(ECOLOGY_BODY.COMMIT,
        staged(Number.isFinite(row.podU) ? clamp01(row.podU) :
          timedProgress(row, nowMs, CONFIG.mortar.lobMs), 0.5));
    case 'fuse':
      return enemyEcologyVisualCode(ECOLOGY_BODY.ACQUIRE, ECOLOGY_ACTION.TELL);
    case 'burst':
      return enemyEcologyVisualCode(ECOLOGY_BODY.COMMIT, ECOLOGY_ACTION.FOLLOW);
    case 'cool':
      return enemyEcologyVisualCode(ECOLOGY_BODY.RECOVER, ECOLOGY_ACTION.RECOVER);
    case 'aim':
    default:
      return enemyEcologyVisualCode(ECOLOGY_BODY.IDLE, ECOLOGY_ACTION.STOWED);
  }
}

export function selectEnemyEcologyVisual(row, nowMs) {
  if (!row || row.hp <= 0)
    return enemyEcologyVisualCode(ECOLOGY_BODY.BREAKUP, ECOLOGY_ACTION.SPENT);

  let code = tacticCode(row);
  if (code < 0) {
    if (row.kind === 'hound') code = houndCode(row, nowMs);
    else if (row.kind === 'wasp') code = waspCode(row, nowMs);
    else if (row.kind === 'polyp') code = polypCode(row, nowMs);
    else if (row.kind === 'mortar') code = mortarCode(row, nowMs);
    else code = enemyEcologyVisualCode(ECOLOGY_BODY.IDLE, ECOLOGY_ACTION.STOWED);
  }

  const action = enemyEcologyActionIndex(code);
  let body = enemyEcologyBodyIndex(code);
  if (nowMs < (row.flashUntil || 0)) body = ECOLOGY_BODY.HIT;
  else if (Number.isFinite(row.maxHp) && row.maxHp > 0 && row.hp / row.maxHp <= 0.34)
    body = ECOLOGY_BODY.CRITICAL;
  return enemyEcologyVisualCode(body, action);
}

