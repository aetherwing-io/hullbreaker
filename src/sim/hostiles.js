/* ===================== ENTITIES: HOSTILES ========================= */
/* Kinds: wasp drone, carrier, houndframe, polyp turret, spore mortar —
   DESIGN's whole enemy-role table, one ENEMY row + one branch each. */

import { CONFIG } from '../config.js';
import { mulberry32 } from '../pure/rng.js';
import { BEND_S } from '../pure/path.js';
import {
  polypBeamHitsRect, polypBeamReach, polypBendClampRange,
} from '../pure/polyp.js';
import { mortarArmed, mortarBlastHitsRect } from '../pure/mortar.js';
import {
  diveVelocity, diveLaunched, squadReady, WASP_DIVE_LOCK_MS, WASP_SQUAD_STAGGER_MS,
} from '../pure/wasp.js';
import { TRANSFORM_BEND_S } from '../pure/transform.js';
import { IS_TRANSFORM_SLICE } from '../mode.js';
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
// The whole wasp squad's shared "last dive committed" clock (src/pure/wasp.js
// squadReady) — deliberately NOT per-hostile, so it orders distinct wasps'
// first commitments into a sequence instead of gating any one drone's own
// diveCooldownMs. Reset alongside every other piece of hostile state below.
let lastWaspLockMs = -Infinity;

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
  // Ambient rooted emplacements are non-gating: one left behind may never
  // deadlock a later ritual. Gate-authored copies opt in per row and cycle
  // automatically so their vulnerable opening is always available.
  polyp:   { hp: CONFIG.polyp.hp,
             hitR: CONFIG.polyp.hitRadius, gating: false, start: 'closed' },
  // The other rooted emplacement: a tripod bombarding an authored landing
  // zone. Non-gating for the same reason the polyp is — it cannot leave a
  // corner arena, so it must never be able to hold one closed.
  mortar:  { hp: CONFIG.mortar.hp,
             hitR: CONFIG.mortar.hitRadius, gating: false, start: 'aim' },
};

// Rooted kinds: `dir` is a FACING resolved at authoring time, never a patrol
// heading, so the corner gate's patrol box must never re-aim one.
const ROOTED = { polyp: true, mortar: true };

// While the iris is shut (closed, and through the dilating tell) shots ping
// off the armour: hp only moves in the two OPEN states, so the polyp dies to
// timing and position — "destroy it during an opening" — never to a bigger
// pool. Kept as a lookup so hitHostile stays branch-light.
const POLYP_OPEN = { fire: true, vent: true };

// A sightline may never cross a facet bend (decisions.md entry 7, the same
// rule projectiles carry) — same source list weapons.js uses.
const BENDS = IS_TRANSFORM_SLICE ? TRANSFORM_BEND_S : BEND_S;

// `row` is the optional authored spawn row this hostile came from. Placement
// and encounter-specific behavior ride on it, and nothing else in the sim
// needs to know which:
//   tune — per-spawn stat overrides (hp, cruiseSpeed, diveRange,
//          diveCooldownMs) authored by a traversal pacing variant, so the same
//          kinds can hold a station, guard a pocket mouth, or press a line
//          without new kinds or new branches;
//   dir / patrol — a houndframe's facing and the ground run it paces.
// Wasp rows remain absent and reproduce CONFIG.wasp behavior exactly.
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
    // wasp dive aim-lock: the frame a committed dive may actually start
    // moving (src/pure/wasp.js WASP_DIVE_LOCK_MS). Unused by every other
    // kind — each keeps its own tell inside its own state machine.
    lockUntil: 0,
    // Whether this body holds a corner's wave gate closed. Per KIND by
    // default (the table above), but a row may opt out — and the six-face
    // run's ambient houndframe stations do (T-009, src/pure/lattice.js).
    // The reasoning is the same one that makes the carrier non-gating: a
    // gate is cleared by killing its WAVE, and a straggler may only hold it
    // if it can actually join the fight. A wasp always flies to you; a
    // ground unit bounded by terrain and a 3-column patrol cannot, so a
    // station left alive half a face back would hold the ritual shut with
    // nothing on screen to shoot. Authored gate rows opt in only for bodies
    // deliberately placed inside the held arena; fixture rows stay unchanged.
    gating: row && row.gating !== undefined ? row.gating : K.gating,
    // Gate-authored polyps cycle their warning even if RIG entered above or
    // behind the barrel. Ambient/fixture polyps keep the sightline-triggered
    // behavior; this flag exists only to guarantee a vent opening for a body
    // deliberately allowed to hold a corner ritual shut.
    autoCycle: !!(row && row.autoCycle),
    gateBreakExit: false,
    // Campaign carriers carry a phase-authored reward. Keeping the payload on
    // the body means missing one hauler cannot shift every later face's drop.
    drop: row && row.drop ? { ...row.drop } : null,
    patrolX0: patrol ? patrol.x0 : -Infinity,
    patrolX1: patrol ? patrol.x1 : Infinity,
    // a raised-surface hound rides the top of an authored solid instead of the
    // ground run; cleared if it ever tumbles down onto the deck below
    deckY: row && row.surface === 'solid-top' ? row.deck : undefined,
    // polyp beam state: live reach in tiles (0 unless firing), and the bend
    // clamp on its sightline — a constant per rooted barrel, resolved once
    beamReach: 0,
    sightClamp: kind === 'polyp'
      ? polypBendClampRange(
          x + ((row && row.dir) || -1) * CONFIG.polyp.barrelTiles,
          (row && row.dir) || -1, CONFIG.polyp.sightRange, BENDS)
      : 0,
    // mortar bombardment state: the AUTHORED landing zone it denies (a place,
    // never a moving target — decisions.md entry 6) and the pod's 0…1 flight
    // progress, which the render layer replays through the same pure arc.
    zoneX: row && row.zone ? row.zone.x : 0,
    zoneY: row && row.zone ? row.zone.y : 0,
    podU: 0,
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
  // Iris armour: every damage path (bullets, launch shock, whatever comes
  // later) flows through here, so every one of them respects the shell. The
  // short ping flash is the feedback that a shot bounced rather than wounded.
  if (e.kind === 'polyp' && !POLYP_OPEN[e.state]) {
    e.flashUntil = gameMs + 40;
    return;
  }
  e.hp -= damage;
  e.flashUntil = gameMs + 70;
  if (e.hp <= 0) {
    kills++;
    if (weaponKills[weapon] !== undefined) weaponKills[weapon]++;
    // the one death path, so one score event per death however it died
    scoreKill(e.kind, weapon, {
      grounded: player.grounded, vy: player.vy, x: e.x, y: e.y,
    });
    if (e.kind === 'carrier') dropFromCarrier(e.x, e.y, e.drop);
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

/* ------------------------- IRIS POLYP ------------------------------ *
 * Spatial job: lock a connector's SIGHTLINE and create target priority. It
 * is rooted — it never moves, never re-aims, and its side-facing barrel
 * owns exactly one lane — so the whole enemy is a rhythm over that lane:
 *
 *   closed — iris shut, armoured, lane free. Senses with the SAME predicate
 *            the beam damages with (pure/polyp.js), so a tell only ever
 *            starts when the beam would already be touching the player:
 *            behind cover, behind the barrel, on the tier above or the deck
 *            below, it stays dormant and is simply bypassed.
 *   tell   — the iris dilates for the whole reaction window, still
 *            armoured. Commitment is total: the beam will fire down the
 *            authored lane whether or not anyone is still standing in it.
 *   fire   — the beam holds the lane. Reach is re-marched every frame so
 *            cover keeps working mid-volley, and it is clamped at facet
 *            bends (entry 7: sightlines do not turn corners).
 *   vent   — open, spent, vulnerable: the authored opening. One vent window
 *            of rifle fire kills it (asserted), so destroying it is a
 *            timing decision, not a damage race.
 *
 * Counterplay is positional, never statistical: leave the lane (jump above
 * the band, drop below it, step behind cover), reroute a tier up or down,
 * or bait the volley and spend the opening. Fairness of the tell versus the
 * player's escape physics is asserted in tools/pathcheck.mjs.            */

function polypReachNow(e, PP) {
  return polypBeamReach(e.x + e.dir * PP.barrelTiles, e.y, e.dir,
    e.sightClamp, builtSolidAt, PP.beamStepTiles);
}

function polypBeamOnPlayer(e, PP, reach) {
  return polypBeamHitsRect(e.x + e.dir * PP.barrelTiles, e.y, e.dir, reach,
    PP.beamHalf, player.x - player.hw, player.x + player.hw,
    player.y, player.y + player.h);
}

function updatePolyp(e) {
  const PP = CONFIG.polyp;
  if (gameMs < e.enterUntil) return;             // materializing: no senses, no beam
  if (e.state === 'closed') {
    if (gameMs < e.diveCdUntil) return;          // shared cooldown field: iris rearming
    const reach = polypReachNow(e, PP);
    if (e.autoCycle || polypBeamOnPlayer(e, PP, reach)) {
      e.state = 'tell';
      e.stateUntil = gameMs + PP.tellMs;
    }
    return;
  }
  if (e.state === 'tell') {
    if (gameMs >= e.stateUntil) {                // committed: the lane, not the player
      e.state = 'fire';
      e.stateUntil = gameMs + PP.beamMs;
    }
    return;
  }
  if (e.state === 'fire') {
    e.beamReach = polypReachNow(e, PP);          // live: cover raised mid-volley still blocks
    if (polypBeamOnPlayer(e, PP, e.beamReach)) damagePlayer(1, e.x);
    if (gameMs >= e.stateUntil) {
      e.state = 'vent';
      e.stateUntil = gameMs + PP.ventMs;
      e.beamReach = 0;
    }
    return;
  }
  // vent: the opening — open, vulnerable, not firing
  if (gameMs >= e.stateUntil) {
    e.state = 'closed';
    e.diveCdUntil = gameMs + PP.cooldownMs;
  }
}

/* ------------------------ SPORE MORTAR ----------------------------- *
 * Spatial job: take an intended LANDING ZONE away for a moment, after a
 * warning long enough to answer. It is rooted and it never aims at the
 * player — it bombards an authored patch of catwalk — so the whole enemy
 * is a rhythm over that patch:
 *
 *   aim   — inert, tube stowed, the zone free. Arms when the player comes
 *           within armRange OF THE ZONE (a mortar guards a place, so the
 *           place is what watches), which is inside the fixture's own
 *           follow lead: the first lob always happens on screen.
 *   lob   — the pod is in the air on its authored arc and the zone is
 *           MARKED from the moment it launches (board 07: "marking the
 *           intended landing surface"). Commitment is total — nothing
 *           re-aims a pod — which is exactly what makes redirecting in
 *           the air a real answer instead of a chase.
 *   fuse  — the pod is planted on the mark and the warning blink
 *           accelerates. On its own this window is longer than the
 *           slowest answer to it (asserted per player tune).
 *   burst — the denial: the slab standing on the marked surface is live.
 *           Short enough that a full jump outlasts it, tall enough that
 *           standing in it is never safe.
 *   cool  — reloading. The zone is free again and the tripod is just a
 *           target — one reload window of rifle fire kills it.
 *
 * Counterplay is positional and never statistical: land short of the
 * mark, land long past it, take the tier above (which is where the tripod
 * itself stands, so going up is also how you shoot back), or take the
 * floor below — which is precisely what the combination stage's hound
 * prices. Fairness of the warning versus the player's escape physics is
 * asserted in tools/pathcheck.mjs.                                      */

function updateMortar(e) {
  const M = CONFIG.mortar;
  if (gameMs < e.enterUntil) return;             // materializing: no pod, no blast
  if (e.state === 'aim') {
    if (mortarArmed(player.x, e.zoneX, M.armRange)) {
      e.state = 'lob';
      e.stateUntil = gameMs + M.lobMs;
      e.podU = 0;
    }
    return;
  }
  if (e.state === 'lob') {
    e.podU = 1 - Math.max(0, (e.stateUntil - gameMs) / M.lobMs);
    if (gameMs >= e.stateUntil) {
      e.state = 'fuse';
      e.stateUntil = gameMs + M.fuseMs;
      e.podU = 1;                                // planted on the mark
    }
    return;
  }
  if (e.state === 'fuse') {
    if (gameMs >= e.stateUntil) {
      e.state = 'burst';
      e.stateUntil = gameMs + M.burstMs;
    }
    return;
  }
  if (e.state === 'burst') {
    // the one slab predicate, shared with the render mesh and the harness:
    // what is drawn is what denies
    if (mortarBlastHitsRect(e.zoneX, e.zoneY, M.blastHalf, M.blastHeight,
        player.x - player.hw, player.x + player.hw,
        player.y, player.y + player.h)) {
      damagePlayer(1, e.zoneX);
    }
    if (gameMs >= e.stateUntil) {
      e.state = 'cool';
      e.stateUntil = gameMs + M.coolMs;
      e.podU = 0;
    }
    return;
  }
  // cool: reloading — the lane is free and the emplacement is a target
  if (gameMs >= e.stateUntil) e.state = 'aim';
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
    // A gate break may be triggered from inside the projectile collision
    // loop. It marks denial hazards there and removes them here, one frame
    // later, so no caller has the hostile array shortened under its iterator.
    if (e.gateBreakExit) { removeHostile(i); continue; }
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
    if (gate && !ROOTED[e.kind] &&                    // a rooted barrel's dir is its FACING:
        e.state !== 'charge' && e.state !== 'tumble') {//   the box must never re-aim it
      if (e.x < patrolL) e.dir = 1;                    // patrol box: nobody strands the gate
      else if (e.x > patrolR) e.dir = -1;              //   (a committed charge is exempt)
    }
    if (e.kind === 'hound') {                          // deck unit: floor denial, see above
      updateHound(e, dt);
    } else if (e.kind === 'polyp') {                   // rooted emplacement: sightline denial
      updatePolyp(e);
    } else if (e.kind === 'mortar') {                  // rooted emplacement: landing denial
      updateMortar(e);
    } else if (e.kind === 'carrier') {                 // slow hauler: cruise only, never dives
      const C = CONFIG.carrier;
      e.x += e.dir * (e.cruiseSpeed !== undefined ? e.cruiseSpeed : C.speed) * dt;
      e.y = e.baseY + Math.sin(e.t * C.bobFreq) * C.bobAmp;
    } else if (e.state === 'cruise') {
      e.x += e.dir * cruiseSpeed * dt;
      e.y = e.baseY + Math.sin(e.t * W.bobFreq) * W.bobAmp;
      if (Math.abs(e.x - player.x) < diveRange && player.y + 1 < e.y &&
          gameMs > e.diveCdUntil && gameMs >= e.enterUntil &&    // no ghost dives mid-materialize
          squadReady(gameMs, lastWaspLockMs, WASP_SQUAD_STAGGER_MS)) {
        // commit now: aim is frozen for the whole dive (never re-aimed, same
        // doctrine as the hound's charge and the polyp's beam), but movement
        // is held for WASP_DIVE_LOCK_MS — the aim-lock beat that turns the
        // already-shipped hot-acid dart pose into a real pre-commit tell
        // instead of a dive that starts the instant its own warning would.
        const v = diveVelocity(e.x, e.y, player.x, player.y + 0.9, W.diveSpeed);
        e.vx = v.vx; e.vy = v.vy;
        e.state = 'dive';
        e.lockUntil = gameMs + WASP_DIVE_LOCK_MS;
        e.stateUntil = e.lockUntil + W.diveMs;
        lastWaspLockMs = gameMs;               // squad clock: next commit waits its turn
      }
    } else if (e.state === 'dive') {
      const launched = diveLaunched(gameMs, e.lockUntil);
      if (launched) { e.x += e.vx * dt; e.y += e.vy * dt; }
      const floor = builtGroundTopAt(e.x);       // hidden faces have no floor yet
      if (gameMs > e.stateUntil || (launched && e.y < floor + 0.4)) {
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
  lastWaspLockMs = -Infinity;         // squad clock: a fresh run owes nothing to the last one
}
export function resetKills() { kills = 0; }
export function resetHostileRng() { hostileRng = mulberry32(5150); }
