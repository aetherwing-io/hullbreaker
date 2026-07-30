/* ===================== ENTITIES: HOSTILES ========================= */
/* Kinds: wasp drone, carrier, houndframe. Roster pass adds polyp turret
   and spore mortar as further ENEMY rows + movement branches. */

import { CONFIG } from '../config.js';
import { mulberry32 } from '../pure/rng.js';
import { view } from './bridge.js';
import { gameMs, approach } from './time.js';
import { sLeftEdge, sRightEdge } from './edges.js';
import { builtGroundTopAt, builtSolidAt } from './level.js';
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
  // A deck unit inside a corner arena is a legitimate gate holder: unlike a
  // slow hauler it cannot drift out of the fight — its prowl is bounded by
  // terrain and its authored patrol span.
  hound:   { hp: CONFIG.hound.hp,
             hitR: CONFIG.hound.hitRadius, gating: true, start: 'prowl' },
};

// `row` is the optional authored spawn row this hostile came from. Two things
// ride on it, and nothing else in the sim needs to know which:
//   tune — per-spawn stat overrides (hp, cruiseSpeed, diveRange,
//          diveCooldownMs) authored by a traversal pacing variant, so the same
//          kinds can hold a station, guard a pocket mouth, or press a line
//          without new kinds or new branches;
//   dir / patrol — a houndframe's facing and the ground run it paces.
// Absent for the shipped six-face spawner and gate waves, whose rows then
// reproduce the CONFIG.wasp behavior exactly.
export function spawnHostile(x, y, delayMs, kind, row) {
  kind = kind || 'wasp';
  const K = ENEMY[kind];
  const T = (row && row.tune) || null;
  const patrol = (row && row.patrol) || null;
  const e = {
    id: nextWaspId++, kind,
    x, y, baseY: y, vx: 0, vy: 0, dir: (row && row.dir) || -1, t: hostileRng() * 6,
    hp: T && T.hp !== undefined ? T.hp : K.hp, hitR: K.hitR,
    cruiseSpeed: T && T.cruiseSpeed !== undefined ? T.cruiseSpeed : undefined,
    diveRange: T && T.diveRange !== undefined ? T.diveRange : undefined,
    diveCooldownMs: T && T.diveCooldownMs !== undefined ? T.diveCooldownMs : undefined,
    senseRange: T && T.senseRange !== undefined ? T.senseRange : undefined,
    state: K.start || 'cruise', stateUntil: 0, diveCdUntil: 0,
    patrolX0: patrol ? patrol.x0 : -Infinity,
    patrolX1: patrol ? patrol.x1 : Infinity,
    // a raised-surface hound rides the top of an authored solid instead of the
    // ground run; cleared if it ever tumbles down onto the deck below
    deckY: row && row.surface === 'solid-top' ? row.deck : undefined,
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

/* ------------------------- HOUNDFRAME ------------------------------ *
 * Spatial job: make a floor route temporarily unsafe with a committed
 * charge. It paces its plate (prowl), plants and telegraphs when the player
 * enters its lane (tell), then commits to a charge it cannot re-aim, and
 * pants afterwards (skid) so the lane goes safe again in a readable rhythm.
 *
 * Terrain is honoured on both sides of that commitment, which is what makes
 * topology an answer: a PROWLING hound turns at deck edges, tall steps, and
 * walls — it never walks itself off the level — while a CHARGING one only
 * mounts steps up to stepUpTiles, skids off anything taller, and runs
 * straight off a deck edge into a tumble. Lead a charge at a gap and the
 * hound removes itself. Deck-hugging follow is the flame crawler's pattern
 * (src/sim/weapons.js); like the crawler, hounds ride SOLID surfaces only —
 * one-way catwalks are grating and carry no frames. An authored row may name
 * a raised solid top (`surface: 'solid-top'`) instead of the ground run, which
 * is how a roof becomes a patrolled lane; a roof runner that charges off its
 * edge tumbles to the deck below and hunts on from there.
 *
 * Counterplay is always a movement verb, never a damage race: the charge is
 * faster than any run tune (you cannot retreat), it commits before it can
 * re-aim (you can be somewhere else), and the prowl is slow enough to get
 * behind. Fairness of the telegraph vs. the player's jump physics is
 * asserted in tools/pathcheck.mjs.                                       */

function houndInLane(e, H) {
  const dy = player.y - e.y;
  const sense = e.senseRange !== undefined ? e.senseRange : H.senseRange;
  return Math.abs(player.x - e.x) < sense &&
    dy > -H.laneBelow && dy < H.laneAbove;
}

// The surface under a hound. Ground runners read the terrain; a raised-surface
// runner holds its authored plate for exactly as long as there is solid tile
// beneath it, which is what makes a roof a lane with edges rather than a floor.
function houndDeckAt(e, x) {
  if (e.deckY === undefined) return builtGroundTopAt(x);
  return builtSolidAt(x, e.deckY - 0.5) ? e.deckY : -999;
}

// true when the deck ahead cannot be walked onto: no plate, too tall a step,
// or a wall at body height. Shared by the prowl (turns) and the charge (skids).
function houndBlockedAhead(e, H, deckAhead) {
  return deckAhead > e.y - H.rideY + H.stepUpTiles ||
    builtSolidAt(e.x + e.dir * H.probeX, e.y + H.wallProbeY);
}

function houndSkid(e, H, intoWall) {
  e.state = 'skid';
  e.stateUntil = gameMs + H.skidMs;
  e.diveCdUntil = gameMs + H.chargeCooldownMs;   // shared cooldown field: pant window
  if (intoWall) { e.vx = 0; e.dir = -e.dir; }    // impact: stop dead, turn around
  else e.vx = e.dir * H.chargeSpeed;             // run-out: slide to a stop
}

function updateHound(e, dt) {
  const H = CONFIG.hound;

  if (e.state === 'tumble') {                    // committed off an edge: no steering
    e.vy = Math.max(H.fallTerminal, e.vy + H.fallGravity * dt);
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    const landing = builtGroundTopAt(e.x);      // always the ground: a roof runner
    if (landing > -100 && e.y <= landing + H.rideY) {  //   that overcommits comes down
      e.y = landing + H.rideY;                 //   and keeps hunting on the deck
      e.vy = 0;
      e.deckY = undefined;
      houndSkid(e, H, true);                     // picks itself up on the lower deck
    }
    return;
  }

  const deck = houndDeckAt(e, e.x);
  if (deck > -100) e.y = approach(e.y, deck + H.rideY, H.hugRate * dt);

  if (e.state === 'prowl') {
    const deckAhead = houndDeckAt(e, e.x + e.dir * H.probeX);
    if (deckAhead < -100 || houndBlockedAhead(e, H, deckAhead) ||
        (e.dir < 0 && e.x <= e.patrolX0) || (e.dir > 0 && e.x >= e.patrolX1)) {
      e.dir = -e.dir;                            // pacing turn: never a self-inflicted fall
    } else {
      e.x += e.dir * H.prowlSpeed * dt;
    }
    if (gameMs >= e.enterUntil && gameMs >= e.diveCdUntil && houndInLane(e, H)) {
      e.dir = Math.sign(player.x - e.x) || e.dir;
      // never telegraph nose-to-wall: a charge with nowhere to go would be an
      // unreadable tell-skid stutter, so it keeps pacing and turns instead
      const facing = houndDeckAt(e, e.x + e.dir * H.probeX);
      if (facing > -100 && !houndBlockedAhead(e, H, facing)) {
        e.state = 'tell';
        e.stateUntil = gameMs + H.tellMs;
      }
    }
    return;
  }

  if (e.state === 'tell') {                      // planted: the whole window is pre-commitment
    e.x -= e.dir * (H.tellBackTiles / (H.tellMs / 1000)) * dt;   // rears back, visibly
    if (gameMs >= e.stateUntil) {
      e.state = 'charge';
      e.stateUntil = gameMs + H.chargeMs;
      e.vx = e.dir * H.chargeSpeed;              // locked here: a charge never re-aims
    }
    return;
  }

  if (e.state === 'charge') {
    // Substepped for the same reason projectiles are: a clamped 50 ms frame
    // moves the charge 0.78 tiles, far enough to skip the terrain probe or
    // tunnel through the player between endpoint tests.
    const steps = Math.min(H.substeps, Math.max(1, Math.ceil(Math.abs(e.vx) * dt / 0.45)));
    const sdt = dt / steps;
    for (let k = 0; k < steps; k++) {
      e.x += e.vx * sdt;
      const under = houndDeckAt(e, e.x);
      if (under > -100) e.y = approach(e.y, under + H.rideY, H.hugRate * sdt);
      if (gameMs >= e.enterUntil && circleHitsPlayer(e.x, e.y, e.hitR)) damagePlayer(1, e.x);
      const deckAhead = houndDeckAt(e, e.x + e.dir * H.probeX);
      if (deckAhead < -100) {                    // ran out of deck — commitment costs
        e.state = 'tumble';
        e.vy = 0;
        e.diveCdUntil = gameMs + H.chargeCooldownMs;
        return;
      }
      if (houndBlockedAhead(e, H, deckAhead)) { houndSkid(e, H, true); return; }
    }
    if (gameMs >= e.stateUntil) houndSkid(e, H, false);
    return;
  }

  e.vx = approach(e.vx, 0, H.chargeSpeed * 4 * dt);   // skid: the lane is briefly safe
  e.x += e.vx * dt;
  if (gameMs >= e.stateUntil) { e.state = 'prowl'; e.vx = 0; }
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
    // BREAKING launch shock is kind-agnostic on purpose: a chained launch that
    // pops a charging houndframe is exactly the fantasy the notch is selling.
    if (shock && gameMs >= e.enterUntil &&
        (e.x - shock.x) ** 2 + (e.y - shock.y) ** 2 <= shockR2) {
      hitHostile(e, i, CONFIG.score.shockDamage, 'shock');
      continue;
    }
    if (gate && e.state !== 'charge' && e.state !== 'tumble') {
      if (e.x < patrolL) e.dir = 1;                    // patrol box: nobody strands the gate
      else if (e.x > patrolR) e.dir = -1;              //   (a committed charge is exempt)
    }
    if (e.kind === 'hound') {                          // deck unit: floor denial, see above
      updateHound(e, dt);
    } else if (e.kind === 'carrier') {                 // slow hauler: cruise only, never dives
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

    if (e.x < cullX || e.y < CONFIG.edges.killY) {     // off the back, or tumbled out of the world
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
