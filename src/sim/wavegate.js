/* ====================== WAVES: GATE RUNTIME ======================= */
/* Scroll halts at each corner until the wave is cleared; the killing
   shot triggers the corner ritual — wind-up, two yaw snaps with a
   ratchet hold, brick-slam zipper building the next face — then the
   scroll eases back in. Byte-identical at all six corners. */

import { CONFIG } from '../config.js';
import { BEND_S, CORNER_S } from '../pure/path.js';
import {
  cornerApproachReady, cornerJointRule,
  waveSize, waveKind, waveLane, wavePhase, waveSpawnDelay, zipperOffset,
} from '../pure/waves.js';
import { ACTIVE_FIXTURE } from '../mode.js';
import { view } from './bridge.js';
import { gameMs } from './time.js';
import { sLeftEdge, sRightEdge } from './edges.js';
import {
  slamSets, farSets, columnHasGround, columnBuilt, settleColumn,
  groundTopAt, levelData, spawnLaneY,
} from './level.js';
import { hostiles, clearHostiles, spawnHostile } from './hostiles.js';

export const cornerEvents = CORNER_S.map((s, i) => ({
  s, k: i + 1, phase: wavePhase(i + 1, CONFIG), state: 'idle', tStart: 0,
  sealed: false,
}));

export function activeCorner() {         // first corner not yet completed
  if (ACTIVE_FIXTURE) return null;        // fixtures author their own transitions
  for (const c of cornerEvents) if (c.state !== 'done') return c;
  return null;
}

export function gateActive() {
  const c = activeCorner();
  return !!c && c.state === 'gate';
}

export function cornerBusy() {           // fight, joint approach, or turn: scroll is held
  const c = activeCorner();
  return !!c && (c.state === 'gate' || c.state === 'approach' || c.state === 'turning');
}

// The route window is the sim half of the fold-ownership contract. Before a
// clear, the existing pivot wall protects unbuilt terrain. After the clear it
// opens only as far as the physical chamfer midpoint. The ritual pins RIG at
// that midpoint, then leaves the completed fold sealed behind them; there is
// never a frame where the camera owns one facet while collision lets RIG walk
// freely on the other.
export function cornerPlayerRouteWindow(playerHalfWidth) {
  // Authored fixtures own their own seam/frontier systems. Several headless
  // fixture proofs deliberately mark the default cornerEvents done; those
  // bookkeeping rows must never become collision seals outside the six-face
  // run.
  if (ACTIVE_FIXTURE) return { frontierRight: Infinity, sealLeft: -Infinity };
  const c = activeCorner();
  let frontierRight = Infinity;
  if (c) {
    frontierRight = cornerJointRule(
      c.state, c.s, BEND_S[c.k - 1], playerHalfWidth, CONFIG.edges.margin,
    ).frontierRight;
  }

  let sealLeft = -Infinity;
  for (const ev of cornerEvents) {
    // `sealed` records the physical transition, independently of `state`.
    // Headless fixtures often mark the default events done merely to disable
    // gates; that test bookkeeping must not impersonate six completed folds.
    if (!ev.sealed) continue;
    const rule = cornerJointRule(
      ev.state, ev.s, BEND_S[ev.k - 1], playerHalfWidth, CONFIG.edges.margin,
    );
    sealLeft = Math.max(sealLeft, rule.sealLeft);
  }
  return { frontierRight, sealLeft };
}

// Called after player collision and edge clamping. Waiting at the old halt is
// stable forever; only a real traversal to BEND_S starts the camera ritual.
export function advanceCornerApproach(playerX) {
  const c = activeCorner();
  if (!c || !cornerApproachReady(c.state, playerX, BEND_S[c.k - 1])) return false;
  c.state = 'turning';
  c.tStart = gameMs;
  c.sealed = true;
  return true;
}

// At the exact chamfer midpoint the 30-degree surface belongs to both camera
// detents during the orbit. Render/player uses this narrow exception instead
// of showing any actor or effect parked elsewhere on the departing facet.
export function turningCornerOwnsJoint(playerX) {
  const c = activeCorner();
  return !!c && c.state === 'turning' &&
    Math.abs(playerX - BEND_S[c.k - 1]) <= 1e-5;
}

export function armGate(c) {
  // A corner is an authored arena beat, not an accumulator for every body
  // that happened to survive the preceding sprint.  Clear ambient carryover
  // before the wave owns the gate: otherwise one old wasp can silently turn
  // the six-body CONTAIN test into an eight-body cleanup, and an emplacement
  // behind a fallback spawn can keep aim assist looking away from the actual
  // gate holder.  Later waves keep their full authored rosters.
  clearHostiles();
  c.state = 'gate';
  spawnGateWave(c.k);
}

function gateArenaPlatforms(k) {
  const arena = (levelData.arenas || []).find((a) => a.face === k);
  return arena ? arena.platforms : [];
}

function spawnGateRole(kind, k, slot, sx, lane, delayMs, pivot) {
  // Gate recipes are keyed to authored wave+slot, independent of how many
  // adaptive ambient bodies the player provoked beforehand. Phase zero gives
  // each consecutive trio HUNTER → BASTION → WEAVER, making the late ecology
  // replayable while still combining differently across species.
  const genomeRow = {
    id: `gate-${k}-${slot}-${kind}`,
    gateWave: k,
    cohortKey: `gate:${k}`,
    cohortSlot: slot,
    cohortPhase: 0,
  };
  if (kind === 'wasp') {
    spawnHostile(sx, spawnLaneY(sx, lane), delayMs, 'wasp', genomeRow);
    return;
  }

  if (kind === 'hound') {
    // The corner apron is guaranteed flat and solid at [pivot-5,pivot+2].
    // A tight patrol keeps the charge inside the fight and gives it a real
    // edge to overcommit through instead of letting a gate holder wander.
    const x = pivot - 4.65;
    const deck = groundTopAt(x);
    const row = {
      ...genomeRow,
      kind, deck, dir: 1,
      // The first two appearances teach and test the charge without letting
      // a floor-bound patrol become the last mandatory target.  It stays in
      // the arena and keeps attacking; only the later remix hounds hold the
      // ritual shut, when the player has already learned how to answer them.
      // The frame forces the jump but never becomes a low-profile mandatory
      // cleanup target after the flying attackers are gone. It disappears on
      // the gate break with the other denial roles.
      gating: false,
      // INTERCEPT teaches the charge and CONTAIN tests it. Four HP keeps
      // those early appearances decisive when the player chooses to punish
      // the pant window; later remix hounds retain the full hull.
      tune: k <= 3 ? { hp: 4 } : undefined,
      patrol: { x0: pivot - 4.9, x1: pivot - 1.8 },
    };
    spawnHostile(x, deck + CONFIG.hound.rideY, delayMs, kind, row);
    return;
  }

  const platforms = gateArenaPlatforms(k);
  const low = platforms.reduce((best, p) => !best || p.y < best.y ? p : best, null);
  const high = platforms.reduce((best, p) => !best || p.y > best.y ? p : best, null);

  if (kind === 'polyp') {
    // Own the arena's lowest connector, with the other authored tiers as
    // immediate answers. `autoCycle` guarantees a vent opening even when a
    // player enters the held arena above or behind its sightline.
    const deck = low ? low.y : groundTopAt(pivot - 2.2);
    const x = low ? low.x1 - 0.75 : pivot - 2.2;
    // CONTAIN makes the first iris a mandatory target-priority test. In the
    // later remix it remains a live connector hazard, but mobile bodies own
    // the gate so cleanup never becomes "find the turret" after the action.
    const row = {
      ...genomeRow, kind, deck, dir: -1, gating: k === 3, autoCycle: true,
    };
    spawnHostile(x, deck + CONFIG.polyp.rootY, delayMs, kind, row);
    return;
  }

  if (kind === 'mortar') {
    // Bombard a centred patch of the lowest arena tier from its highest
    // perch. Short/long landings and every intermediate tier stay visible.
    const mount = high || low;
    const deck = mount ? mount.y : groundTopAt(pivot - 3.5);
    const x = mount ? mount.x1 - 0.75 : pivot - 3.5;
    let zoneX = pivot - 4.65;
    let zoneY = groundTopAt(zoneX);
    if (low) {
      const inset = CONFIG.mortar.blastHalf + 0.5;
      zoneX = Math.max(low.x0 + inset, Math.min(low.x1 - inset, x - 5));
      zoneY = low.y;
    }
    // A mortar's job is to redirect the next landing, not become a stationary
    // mandatory cleanup target on a remote perch. Mobile bodies hold the gate;
    // the tripod and its marked zone disappear with the break below.
    const row = {
      ...genomeRow, kind, deck, dir: -1, gating: false,
      zone: { x: zoneX, y: zoneY },
    };
    spawnHostile(x, deck + CONFIG.mortar.bodyY, delayMs, kind, row);
    return;
  }

  // Defensive fallback for a mistyped/future roster entry: keep the gate
  // playable and visible instead of throwing halfway through a run.
  spawnHostile(sx, spawnLaneY(sx, lane), delayMs, 'wasp', genomeRow);
}

function spawnGateWave(k) {              // deterministic: no rng in wave layout
  const W = CONFIG.waves;
  const n = waveSize(k, CONFIG);
  // Materialize IN the arena: the view is frozen during a gate, so the wave
  // condenses out of the tower depth in front of the player — staggered
  // right-to-left, one presence at a time. Placement is bounded by the real
  // (aspect-corrected) view edges and never crosses onto the unbuilt face,
  // so this is safe at any window shape.
  const pivot = CORNER_S[k - 1];
  const right = Math.min(sRightEdge() - 2, pivot - 2);
  const left = Math.min(sLeftEdge() + 6, right - 4);
  const span = Math.max(right - left, 4);
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0 : i / (n - 1);
    const sx = right - f * span;
    const lane = waveLane(k, i, CONFIG);       // authored altitude mix per wave
    const kind = waveKind(k, i, CONFIG);       // authored role mix per story phase
    spawnGateRole(kind, k, i, sx, lane, waveSpawnDelay(k, i, CONFIG), pivot);
  }
}

// Event-driven clear: called from every hostile removal path. The kill opens
// a short player-driven run to the physical joint; the ritual starts only when
// RIG arrives there, so a player left in the arena can never disappear when
// the camera commits the next facet.
export function onHostileRemoved() {
  const c = activeCorner();
  // `e.gating` is the kind's value unless the spawn row opted out (T-009's
  // ambient houndframe stations do — see src/sim/hostiles.js).
  if (c && c.state === 'gate' && !hostiles.some(e => e.gating)) {
    // Non-gating denial roles have done their spatial job. Clear them on the
    // killing beat so the transformation is a genuine breather and the next
    // face never inherits an invisible turret or marked landing. Removal is
    // deferred to updateHostiles: this callback can run inside updateBullets,
    // whose reverse iterator must not have the whole array cleared under it.
    for (const e of hostiles) e.gateBreakExit = true;
    c.state = 'approach';
    c.tStart = 0;
  }
}

export function finishCorner(c) {
  updateZipper(c, 1e9);                  // lock every slam column to base
  revealFaceRest(c);                     // rest of the face commits, fog-covered
  c.state = 'done';
  view.corner.finished(c);               // render: the camera keeps the new heading
}

function revealFaceRest(c) {             // beyond the zipper strip: one distant commit
  for (const s of farSets[c.k - 1]) {
    if (!columnHasGround(s) || columnBuilt(s)) continue;
    settleColumn(s);
  }
  view.level.faceRevealed(c);            // render: base matrices + this face's catwalks
}

export function updateZipper(c, tMs) {   // near-to-far brick slam of the next face
  const cols = slamSets[c.k - 1];
  for (let j = 0; j < cols.length; j++) {
    const s = cols[j];
    if (!columnHasGround(s) || columnBuilt(s)) continue;   // gap column, or already locked
    const z = zipperOffset(tMs, j, CONFIG);
    if (z.phase === 'hidden') continue;
    view.level.zipperColumn(s, z.dy, z.phase === 'locked');
    if (z.phase === 'locked') settleColumn(s);
  }
}

// run reset (resetGame in src/main.js): every corner is armed again
export function resetCornerEvents() {
  for (const c of cornerEvents) { c.state = 'idle'; c.tStart = 0; c.sealed = false; }
}
