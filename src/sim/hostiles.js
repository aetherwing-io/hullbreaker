/* ===================== ENTITIES: HOSTILES ========================= */
/* Kinds: wasp drone, carrier. Roster pass adds polyp turret, houndframe,
   spore mortar as ENEMY rows + movement branches. */

import { CONFIG } from '../config.js';
import { mulberry32 } from '../pure/rng.js';
import { view } from './bridge.js';
import { gameMs, approach } from './time.js';
import { sLeftEdge, sRightEdge } from './edges.js';
import { builtGroundTopAt } from './level.js';
import { player, circleHitsPlayer, damagePlayer } from './player.js';
import { weaponKills } from './weapons.js';
import { dropFromCarrier } from './capsules.js';
import { consumeLaunchShock, scoreKill } from './score.js';
import { activeCorner, gateActive, onHostileRemoved } from './wavegate.js';

export const hostiles = [];
export let kills = 0;
let hostileRng = mulberry32(5150);          // seeded: sim randomness is reproducible
let nextWaspId = 1;

// Per-kind stats resolved once at spawn — the roster pass adds kinds as rows
// here, not as ternaries at every use site. `gating: false` kinds never hold
// a wave gate closed (a slow hauler or future stationary emplacement parked
// near a corner must not deadlock the ritual). The matching geometry and
// colors are a render table in src/render/hostiles.js, keyed by the same kind.
export const ENEMY = {
  wasp:    { hp: CONFIG.wasp.hp,
             hitR: CONFIG.wasp.contactRadius, gating: true },
  carrier: { hp: CONFIG.carrier.hp,
             hitR: CONFIG.carrier.hitRadius, gating: false },
};

// `tune` is an optional per-spawn override (hp, cruiseSpeed, diveRange,
// diveCooldownMs) authored by a traversal pacing variant: the same two enemy
// kinds can hold a station over a connector, guard a pocket mouth, or press a
// floor line without new kinds or new branches. Absent everywhere else, so the
// shipped six-face run keeps the CONFIG.wasp behavior exactly.
export function spawnHostile(x, y, delayMs, kind, tune) {
  kind = kind || 'wasp';
  const K = ENEMY[kind];
  const T = tune || null;
  const e = {
    id: nextWaspId++, kind,
    x, y, baseY: y, vx: 0, vy: 0, dir: -1, t: hostileRng() * 6,
    hp: T && T.hp !== undefined ? T.hp : K.hp, hitR: K.hitR,
    cruiseSpeed: T && T.cruiseSpeed !== undefined ? T.cruiseSpeed : undefined,
    diveRange: T && T.diveRange !== undefined ? T.diveRange : undefined,
    diveCooldownMs: T && T.diveCooldownMs !== undefined ? T.diveCooldownMs : undefined,
    state: 'cruise', stateUntil: 0, diveCdUntil: 0,
    enterUntil: gameMs + (delayMs || 0) + CONFIG.wasp.enterMs,
    flashUntil: 0,
  };
  hostiles.push(e);
  view.hostiles.spawned(e);      // render: mesh, hidden until materialization begins
}

export function removeHostile(idx, fade) {  // single removal path: gates count every exit
  const e = hostiles[idx];
  view.hostiles.removed(e, fade);        // render: dissolve as a corpse, or drop the mesh
  hostiles.splice(idx, 1);
  onHostileRemoved();
}

export function hitHostile(e, idx, damage, weapon) {
  e.hp -= damage;
  e.flashUntil = gameMs + 70;
  if (e.hp <= 0) {
    kills++;
    if (weaponKills[weapon] !== undefined) weaponKills[weapon]++;
    // the one death path, so one score event per death however it died
    scoreKill(e.kind, weapon, {
      grounded: player.grounded, vy: player.vy, x: e.x, y: e.y,
    });
    if (e.kind === 'carrier') dropFromCarrier(e.x, e.y);
    removeHostile(idx, true);
  }
}

export function updateHostiles(dt) {
  const W = CONFIG.wasp;
  const GW = CONFIG.waves;
  const gate = gateActive();
  const cullX = sLeftEdge() - 8;
  // BREAKING (CHARGE notch 2): the launch RIG just made is itself a weapon.
  // Armed in sim/score.js by the launch branch, consumed here in the same
  // frame, so neither module has to import the other.
  const shock = consumeLaunchShock();
  const shockR2 = CONFIG.score.shockRadius * CONFIG.score.shockRadius;
  // Patrol right bound: the frozen screen edge reaches ~12 tiles past the
  // corner pivot, so bounding on the edge alone let hostiles drift around
  // the corner onto the next face — foreshortened, clustered, idling. The
  // arena ends at the pivot; nobody fights around a corner that isn't
  // built yet.
  const patrolR = gate ? Math.min(sRightEdge() - 2, activeCorner().s - 1.5) : 0;
  const patrolL = gate ? sLeftEdge() + 2 : 0;
  for (let i = hostiles.length - 1; i >= 0; i--) {
    const e = hostiles[i];
    if (gameMs < e.enterUntil - W.enterMs) {           // staged wave slot: not yet condensing
      view.hostiles.sync(e);                           //   render keeps it hidden
      continue;
    }
    e.t += dt;
    // gated hostiles press harder; otherwise a variant's per-enemy tune wins
    const diveRange = gate ? GW.gateDiveRange
      : (e.diveRange !== undefined ? e.diveRange : W.diveRange);
    const diveCooldown = gate ? GW.gateDiveCooldownMs
      : (e.diveCooldownMs !== undefined ? e.diveCooldownMs : W.diveCooldownMs);
    const cruiseSpeed = gate ? GW.gateCruiseSpeed
      : (e.cruiseSpeed !== undefined ? e.cruiseSpeed : W.cruiseSpeed);
    if (shock && gameMs >= e.enterUntil &&
        (e.x - shock.x) ** 2 + (e.y - shock.y) ** 2 <= shockR2) {
      hitHostile(e, i, CONFIG.score.shockDamage, 'shock');
      continue;
    }
    if (gate) {                                        // patrol box: nobody strands the gate
      if (e.x < patrolL) e.dir = 1;
      else if (e.x > patrolR) e.dir = -1;
    }
    if (e.kind === 'carrier') {                        // slow hauler: cruise only, never dives
      const C = CONFIG.carrier;
      e.x += e.dir * (e.cruiseSpeed !== undefined ? e.cruiseSpeed : C.speed) * dt;
      e.y = e.baseY + Math.sin(e.t * C.bobFreq) * C.bobAmp;
    } else if (e.state === 'cruise') {
      e.x += e.dir * cruiseSpeed * dt;
      e.y = e.baseY + Math.sin(e.t * W.bobFreq) * W.bobAmp;
      if (Math.abs(e.x - player.x) < diveRange && player.y + 1 < e.y &&
          gameMs > e.diveCdUntil && gameMs >= e.enterUntil) {   // no ghost dives mid-materialize
        const tx = player.x - e.x, ty = (player.y + 0.9) - e.y;
        const n = Math.hypot(tx, ty) || 1;
        e.vx = tx / n * W.diveSpeed; e.vy = ty / n * W.diveSpeed;
        e.state = 'dive';
        e.stateUntil = gameMs + W.diveMs;
      }
    } else if (e.state === 'dive') {
      e.x += e.vx * dt; e.y += e.vy * dt;
      const floor = builtGroundTopAt(e.x);       // hidden faces have no floor yet
      if (gameMs > e.stateUntil || e.y < floor + 0.4) {
        e.state = 'recover';
        e.diveCdUntil = gameMs + diveCooldown;
      }
    } else {                                             // recover: climb back up
      e.x -= 1.2 * dt;
      if (gate) e.x = Math.max(e.x, sLeftEdge() + 1);    // no drifting out of the fight
      e.y = approach(e.y, e.baseY, 5 * dt);
      if (Math.abs(e.y - e.baseY) < 0.05) { e.state = 'cruise'; e.t = 0; }
    }

    if (e.x < cullX) {
      removeHostile(i);
      continue;
    }

    // contact damage — only once fully materialized (hitR doubles as contact radius)
    if (gameMs >= e.enterUntil && circleHitsPlayer(e.x, e.y, e.hitR)) damagePlayer(1, e.x);

    // mock-3D presence (materialize in from tower depth, breathe while alive,
    // hit flash) is derived entirely from these sim fields by the render layer
    view.hostiles.sync(e);
  }
}

/* run reset (resetGame in src/main.js): every hostile leaves without
   counting toward a wave gate, and the seeded sim rng rewinds. */
export function clearHostiles() {
  for (const e of hostiles) view.hostiles.removed(e, false);
  hostiles.length = 0;
}
export function resetKills() { kills = 0; }
export function resetHostileRng() { hostileRng = mulberry32(5150); }
