/* ====================== WAVES: GATE RUNTIME ======================= */
/* The six-face corners. Two lifecycles share this module.

   ROLLING (the default — T-201, decisions.md entry 23 #2 and the integrator
   call in entry 25's addendum): the turn never waits. A side's encounter is
   released beat by beat ON THE MOVE (teach -> test -> remix), each beat by
   proximity, by a clear or by a bounded clock (src/pure/waves.js
   ROLLING_GATES), every body staged inside the live view. The corner arms at
   its halt and opens the joint at once, whatever is still alive; when RIG
   reaches the bend the turn fires and up to ROLLING_GATES.carryMax of the
   side's mobile bodies follow RIG round the limb, re-entering on the arriving
   facet once the camera is there. The price of skipping a fight is pressure
   (entry 12), never time.

   LEGACY (`?gates=legacy`): the held gate exactly as it shipped. The scroll
   halts at each corner until the wave is cleared; the killing shot opens the
   joint; the ritual starts when RIG reaches it.

   Both end in the same ritual: wind-up, two yaw snaps with a ratchet hold,
   then the scroll eases back in. The brick-slam zipper that used to build the
   next face during it is gone (entry 25; recoverable at bb8e4df): the next
   face pre-exists, and the sim keeps no build state for it (sim/level.js). */

import { CONFIG } from '../config.js';
import {
  level1EcologyBeatCount, level1EcologyBeatSlots, level1EcologyEncounterDelay,
  level1EcologyEncounterRow, level1EcologyRollingDelay,
} from '../pure/level1-ecology-encounters.js';
import { BEND_S, CORNER_S, HALT_S } from '../pure/path.js';
import {
  CARRY_RANK_UNRELEASED, ROLLING_GATES, cornerApproachReady, cornerEventTotalMs,
  cornerHandoffMs, cornerJointRule, gateAttackReadyDelay, gatePreludeS, rollingBeatDue,
  rollingBeatLine, rollingCarryRank, rollingStageBand, rollingStageX,
  waveSize, waveKind, waveLane, wavePhase, waveSpawnDelay,
} from '../pure/waves.js';
import { ACTIVE_FIXTURE, GATES_ROLLING, HINGE_FLOW } from '../mode.js';
import { view } from './bridge.js';
import { gameMs, scrollX } from './time.js';
import { sLeftEdge, sRightEdge } from './edges.js';
import { groundTopAt, levelData, spawnLaneY } from './level.js';
import { ENEMY, hostiles, removeHostile, spawnHostile } from './hostiles.js';
import { makeEnemyEcologyFields } from './ecology-tactics.js';

export const cornerEvents = CORNER_S.map((s, i) => ({
  s, k: i + 1, phase: wavePhase(i + 1, CONFIG), state: 'idle', tStart: 0,
  sealed: false, primed: false, primedAtS: null, encounterKey: `gate:${i + 1}`,
  // ROLLING bookkeeping (T-201). `beat` is the next beat to release, `beatAtMs`
  // when the last one was, `beatClearedAt` when the last released beat's final
  // body left (null while any survives), `released` how many authored slots
  // have been released. `beatLog` records every release for the headless
  // proofs (cleared in place on reset, never reallocated).
  beats: Math.max(1, level1EcologyBeatCount(i + 1)), beat: 0, beatAtMs: 0,
  beatClearedAt: null, released: 0, beatLog: [],
  // Carry-over at this corner's turn: how many of the side's bodies were
  // alive, how many followed (survivors + outrun slots), how many re-entered
  // on the arriving facet, how many found no room and were dropped.
  survivorsAtTurn: 0, clearedAtTurn: false, pursuers: 0, unreleasedCarried: 0,
  carried: 0, dropped: 0, nextReentryAt: 0, reentryOpenAt: null,
}));

// The camera's fold hand-off inside the ritual (the same instant render/
// camera.js commits to the arriving facet), for `?hinge=flow`.
const HANDOFF_MS = cornerHandoffMs(CONFIG);

export function activeCorner() {         // first corner not yet completed
  if (ACTIVE_FIXTURE) return null;        // fixtures author their own transitions
  for (const c of cornerEvents) if (c.state !== 'done') return c;
  return null;
}

// "The encounter is pressing": hostiles fight inside the live view with the
// gate's cadence and patrol box (src/sim/hostiles.js). Legacy: only while a
// gate holds the scroll. Rolling: while a body of the side's released
// encounter, or one that followed RIG round the last corner, is on screen —
// the scroll keeps moving either way.
export function gateActive() {
  const c = activeCorner();
  if (!c) return false;
  if (!GATES_ROLLING) return c.state === 'gate';
  if (c.state !== 'idle' && c.state !== 'approach') return false;
  for (const e of hostiles) {
    if (e.gateBreakExit || gameMs < e.enterUntil - CONFIG.wasp.enterMs) continue;
    if (e.pursuitFrom === c.k - 1) return true;
    if (c.primed && e.encounterKey === c.encounterKey) return true;
  }
  return false;
}

export function cornerBusy() {           // fight, joint approach, or turn: scroll is held
  const c = activeCorner();
  return !!c && (c.state === 'gate' || c.state === 'approach' || c.state === 'turning');
}

// The route window is the sim half of the fold-ownership contract. Before a
// clear, the existing pivot wall keeps RIG on the departing facet. After the
// clear it opens only as far as the physical chamfer midpoint. The ritual pins
// RIG at that midpoint, then leaves the completed fold sealed behind them;
// there is never a frame where the camera owns one facet while collision lets
// RIG walk freely on the other.
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
      hingeFlowOpen(c),
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
  if (GATES_ROLLING) beginPursuit(c, playerX);
  return true;
}

// `?hinge=flow` (unjudged A/B, T-102 R4; off by default): after the camera
// hand-off the turning joint opens forward. Before it the arriving facet is
// not drawn yet, so RIG stays on the hinge exactly as in the default.
export function hingeFlowOpen(c) {
  return HINGE_FLOW && !!c && c.state === 'turning' && gameMs - c.tStart >= HANDOFF_MS;
}

// At the exact chamfer midpoint the 30-degree surface belongs to both camera
// detents during the orbit. Render/player uses this narrow exception instead
// of showing any actor or effect parked elsewhere on the departing facet.
export function turningCornerOwnsJoint(playerX) {
  const c = activeCorner();
  return !!c && c.state === 'turning' &&
    Math.abs(playerX - BEND_S[c.k - 1]) <= 1e-5;
}

function gateRows(c) {
  return hostiles.filter((e) => e.encounterKey === c.encounterKey && !e.gateBreakExit);
}

function gatePresenceStarted(c) {
  // A staged teach body may be a non-gating hound or emplacement while a
  // later mobile remix remains queued. Its visible presence still owns the
  // encounter beat; `gating` continues to decide only the final clear.
  return gateRows(c).some((e) =>
    gameMs >= e.enterUntil - CONFIG.wasp.enterMs);
}

// If a fast prelude erased every body whose entrance had begun but a later
// authored slot still exists, pull that score forward as one block so its
// first condensation begins on the halt frame. `state=gate` therefore never
// describes an encounter with only invisible queued bodies.
function pullNextGatePresence(c) {
  if (gatePresenceStarted(c)) return;
  const queued = gateRows(c).filter((e) =>
    gameMs < e.enterUntil - CONFIG.wasp.enterMs);
  if (!queued.length) return;
  const firstEnterUntil = Math.min(...queued.map((e) => e.enterUntil));
  const pullMs = Math.max(0, firstEnterUntil - (gameMs + CONFIG.wasp.enterMs));
  if (!(pullMs > 0)) return;
  for (const e of gateRows(c)) {
    if (gameMs < e.enterUntil - CONFIG.wasp.enterMs) e.enterUntil -= pullMs;
  }
}

function retireGateDenials(c) {
  for (const e of gateRows(c)) e.gateBreakExit = true;
}

/* T-102: a held gate must never wait on a body the player cannot see.
 *
 * Rooted emplacements never move and a houndframe is bounded by its deck and
 * patrol, so neither can travel into the frozen halt view the way a flyer's
 * patrol box carries it back. Their positions come from authored arena
 * sockets, not from the view, and a narrow strip does not contain them: on a
 * 390x844 portrait phone the halted strip at gate 3 is [272, 291] while
 * CONTAIN's mandatory Iris sockets sit at x 265.25 / 266.75. That body held
 * the gate — and, because later beats are parked behind the present one
 * (level1EcologyEncounterDelay), every body queued after it — forever.
 *
 * Once the view is frozen, a view-bound row whose whole hit circle lies
 * outside the strip leaves through the ordinary deferred gate-break path
 * (updateHostiles removes it; onHostileRemoved then pulls the next beat or
 * opens the gate on that same frame). It is off-screen, so nothing visibly
 * vanishes. Wide views keep every authored socket inside the strip and are
 * untouched. Returns how many rows were retired this call.               */
const VIEW_BOUND_KINDS = Object.freeze({ polyp: true, mortar: true, hound: true });

export function gateRowOutsideHeldView(e, left = sLeftEdge(), right = sRightEdge()) {
  const r = Math.max(e.shotR || 0, e.hitR || 0);
  return e.x + r < left || e.x - r > right;
}

export function retireUnseenGateRows(c) {
  if (!c || c.state !== 'gate') return 0;
  const left = sLeftEdge(), right = sRightEdge();
  let retired = 0;
  for (const e of hostiles) {
    if (e.encounterKey !== c.encounterKey || e.gateBreakExit ||
        !VIEW_BOUND_KINDS[e.kind] || !gateRowOutsideHeldView(e, left, right)) continue;
    e.gateBreakExit = true;
    retired++;
  }
  return retired;
}

// Spawn the complete authored roster before the clamp. `primed` is a flag,
// not a corner state: cornerBusy() remains false, the pursuit plane keeps
// moving, and killing this cohort early earns a drive-through clear.

// LEGACY: spawn the complete authored roster before the clamp. `primed` is a
// flag, not a corner state: cornerBusy() remains false, the pursuit plane
// keeps moving, and killing this cohort early earns a drive-through clear.
// ROLLING: priming is the release of the teach beat (updateRollingEncounter
// decides when); a direct/headless caller gets that beat now.
export function primeGateWave(c) {
  if (!c || c.state !== 'idle' || c.primed) return false;
  if (GATES_ROLLING) {
    releaseRollingBeat(c, 0, 'prime', 0);
    return true;
  }
  c.primed = true;
  c.primedAtS = scrollX;
  spawnGateWave(c.k, c.encounterKey);
  return true;
}

export function armGate(c) {
  if (!c || c.state !== 'idle') return;
  if (!c.primed) primeGateWave(c); // direct/headless callers retain a complete gate

  if (GATES_ROLLING) {
    // The turn never waits: the joint opens on arming, whatever is alive.
    // Nothing is retired here; the encounter keeps fighting until the turn
    // fires, and what is still alive then is dealt with by beginPursuit().
    c.state = 'approach';
    c.tStart = 0;
    return;
  }

  // Retain the already-visible gate cohort and retire only ambient carryover.
  // This preserves the authored body count while removing the old halt-time
  // disappearance/materialization wait.
  for (let i = hostiles.length - 1; i >= 0; i--) {
    if (hostiles[i].encounterKey !== c.encounterKey) removeHostile(i, false);
  }

  // A non-gating denial row may own the CURRENT teaching beat only while a
  // mobile holder from this same encounter still survives (visible or queued).
  // If the player erased every holder during the moving prelude, retain the
  // earned drive-through clear instead of halting on an iris/pod alone.
  const hasGateSurvivor = gateRows(c).some((e) => e.gating);
  pullNextGatePresence(c);
  if (hasGateSurvivor && gatePresenceStarted(c)) {
    c.state = 'gate';
    return;
  }

  // Every gating body was earned before the clamp. Non-gating denial pieces
  // have finished their spatial job and leave through the normal deferred
  // removal path; RIG runs straight toward the physical joint.
  retireGateDenials(c);
  c.state = 'approach';
  c.tStart = 0;
}

function gateArenaPlatforms(k) {
  const assault = (levelData.assaults || []).find((a) => a.face === k);
  if (assault) {
    return assault.platforms.filter((p) =>
      p.dropRejoin || (typeof p.role === 'string' && p.role.startsWith('arena-')));
  }
  const arena = (levelData.arenas || []).find((a) => a.face === k);
  return arena ? arena.platforms : [];
}

function ecologyStage(k, row, role = row?.stageRole) {
  if (!row || !role) return null;
  const assault = (levelData.assaults || []).find((entry) => entry.face === k);
  const socket = assault?.staging?.find((entry) => entry.role === role);
  const platform = socket && assault.platforms.find((entry) =>
    entry.id === socket.platformId);
  return socket && platform ? { ...socket, platform } : null;
}

function rootedStageX(kind, k, slot, stage, mount, fallbackX, radius) {
  if (!stage) return mount ? mount.x1 - 0.75 : fallbackX;
  // One authored control role can deliberately teach two ecology variants in
  // consecutive beats. They share the semantic socket, not the same physical
  // point: overlapping rooted hit circles let a closed front body intercept
  // every projectile aimed at an open body behind it. Spread peers evenly
  // around the reviewed stage centre and keep every circle inside its deck.
  const peers = [];
  for (let i = 0; i < waveSize(k, CONFIG); i++) {
    const row = level1EcologyEncounterRow(k, i);
    if (row?.kind === kind && row.stageRole === stage.role) peers.push(i);
  }
  const ordinal = peers.indexOf(slot);
  const spacing = Math.max(1.5, radius * 2 + 0.32);
  const offset = ordinal >= 0 && peers.length > 1
    ? (ordinal - (peers.length - 1) / 2) * spacing
    : 0;
  const inset = radius + 0.28;
  return Math.max(mount.x0 + inset, Math.min(mount.x1 - inset, stage.x + offset));
}

// Hounds remain deck machinery: catwalk grating does not magically become a
// solid locomotion surface. Resolve the nearest three-column flat ground run
// under the authored socket, bounded to its current face and gate approach.
function ecologyHoundDeck(k, stage) {
  if (!stage) return null;
  const pivot = CORNER_S[k - 1];
  const lo = Math.max(0, Math.floor(stage.platform.x0) - 5);
  const hi = Math.min(levelData.groundH.length - 3,
    Math.ceil(stage.platform.x1) + 5, Math.floor(pivot - 2));
  let best = null;
  for (let col = lo; col <= hi; col++) {
    const deck = levelData.groundH[col];
    if (!(deck > -100) || levelData.groundH[col + 1] !== deck ||
        levelData.groundH[col + 2] !== deck) continue;
    const x = col + 1.5;
    const score = Math.abs(x - stage.x);
    if (!best || score < best.score) {
      best = {
        x, deck, score,
        patrol: { x0: col + 0.2, x1: col + 2.8 },
      };
    }
  }
  return best;
}

function spawnGateRole(kind, k, slot, sx, lane, delayMs, pivot, encounterKey,
    ecologyRow = null) {
  // Gate recipes are keyed to authored wave+slot, independent of how many
  // adaptive ambient bodies the player provoked beforehand. Phase zero gives
  // each consecutive trio HUNTER → BASTION → WEAVER, making the late ecology
  // replayable while still combining differently across species.
  const stage = ecologyStage(k, ecologyRow);
  const genomeRow = {
    id: ecologyRow?.id || `gate-${k}-${slot}-${kind}`,
    gateWave: k,
    encounterKey,
    cohortKey: encounterKey,
    cohortSlot: slot,
    cohortPhase: 0,
    attackReadyDelayMs: gateAttackReadyDelay(slot),
    ...(ecologyRow ? {
      ecologyId: ecologyRow.ecologyId,
      ecologyBeat: ecologyRow.beat,
      ecologyBeatSlot: ecologyRow.beatSlot,
      ecologyStageRole: ecologyRow.stageRole,
      ecologyMode: ecologyRow.mode,
      ecologyStageResolved: !!stage,
      ecologyPlacementFallback: !stage,
    } : {}),
  };
  if (kind === 'wasp') {
    const x = stage ? stage.x : sx;
    const y = stage
      ? stage.y + Math.max(1.8, Math.min(3.2, lane * 0.5))
      : spawnLaneY(sx, lane);
    spawnHostile(x, y, delayMs, 'wasp', genomeRow);
    return;
  }

  if (kind === 'hound') {
    // The corner apron is guaranteed flat and solid at [pivot-5,pivot+2].
    // A tight patrol keeps the charge inside the fight and gives it a real
    // edge to overcommit through instead of letting a gate holder wander.
    const authoredDeck = ecologyHoundDeck(k, stage);
    const x = authoredDeck ? authoredDeck.x : pivot - 4.65;
    const deck = authoredDeck ? authoredDeck.deck : groundTopAt(x);
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
      patrol: authoredDeck?.patrol || { x0: pivot - 4.9, x1: pivot - 1.8 },
      ecologyPlacementFallback: !!ecologyRow && (!stage || !authoredDeck),
    };
    spawnHostile(x, deck + CONFIG.hound.rideY, delayMs, kind, row);
    return;
  }

  const platforms = gateArenaPlatforms(k);
  // Equal-height choices resolve forward. In the new switchback arenas that
  // makes the drop-rejoin the mandatory connector instead of leaving a live
  // gate holder twenty tiles behind the joint frontier.
  const low = platforms.reduce((best, p) =>
    !best || p.y < best.y || (p.y === best.y && p.x1 > best.x1) ? p : best, null);
  const high = platforms.reduce((best, p) => !best || p.y > best.y ? p : best, null);

  if (kind === 'polyp') {
    // Own the arena's lowest connector, with the other authored tiers as
    // immediate answers. `autoCycle` guarantees a vent opening even when a
    // player enters the held arena above or behind its sightline.
    const mount = stage?.platform || low;
    const deck = mount ? mount.y : groundTopAt(pivot - 2.2);
    // The stage socket is the reviewed firing position, not merely a label
    // for its platform. Using the old generic right-edge inset put CONTAIN's
    // mandatory Iris at x=271.25 — inside the authored [271,272] cover wall.
    // Terrain is intentionally resolved before hostile hit circles, making
    // that gate holder genuinely impossible to shoot. Root every authored
    // emplacement on its explicit socket; retain the inset only as the
    // legacy/fallback answer when no stage exists.
    const x = rootedStageX(
      kind, k, slot, stage, mount, pivot - 2.2, CONFIG.polyp.hitRadius,
    );
    // CONTAIN makes the first iris a mandatory target-priority test. In the
    // later remix it remains a live connector hazard, but mobile bodies own
    // the gate so cleanup never becomes "find the turret" after the action.
    const row = {
      ...genomeRow, kind, deck,
      dir: stage ? -1 : Math.sign(sx - x) || -1,
      gating: k === 3, autoCycle: true,
    };
    spawnHostile(x, deck + CONFIG.polyp.rootY, delayMs, kind, row);
    return;
  }

  if (kind === 'mortar') {
    // Bombard a centred patch of the lowest arena tier from its highest
    // perch. Short/long landings and every intermediate tier stay visible.
    const mount = stage?.platform || high || low;
    const deck = mount ? mount.y : groundTopAt(pivot - 3.5);
    // Mortars share the same placement contract as the Iris: a generated
    // staging socket has already been checked against the face's cover and
    // traversal lanes, whereas a generic platform-edge inset has not.
    const x = rootedStageX(
      kind, k, slot, stage, mount, pivot - 3.5, CONFIG.mortar.hitRadius,
    );
    let zoneX = pivot - 4.65;
    let zoneY = groundTopAt(zoneX);
    const targetStage = ecologyStage(k, ecologyRow, ecologyRow?.targetStageRole);
    const target = targetStage?.platform || low;
    if (target) {
      const inset = CONFIG.mortar.blastHalf + 0.5;
      zoneX = targetStage ? targetStage.x
        : Math.max(target.x0 + inset, Math.min(target.x1 - inset, x - 5));
      zoneY = target.y;
    }
    // A mortar's job is to redirect the next landing, not become a stationary
    // mandatory cleanup target on a remote perch. Mobile bodies hold the gate;
    // the tripod and its marked zone disappear with the break below.
    const row = {
      ...genomeRow, kind, deck, dir: -1, gating: false,
      zone: { x: zoneX, y: zoneY },
      ecologyPlacementFallback: !!ecologyRow &&
        (!stage || (!!ecologyRow.targetStageRole && !targetStage)),
    };
    spawnHostile(x, deck + CONFIG.mortar.bodyY, delayMs, kind, row);
    return;
  }

  // Defensive fallback for a mistyped/future roster entry: keep the gate
  // playable and visible instead of throwing halfway through a run.
  spawnHostile(sx, spawnLaneY(sx, lane), delayMs, 'wasp', genomeRow);
}

function spawnGateWave(k, encounterKey = `gate:${k}`) {
                                          // deterministic: no rng in wave layout
  const W = CONFIG.waves;
  const n = waveSize(k, CONFIG);
  // Materialize IN the future held arena while the pursuit plane is still
  // moving. Project today's real view edges to their halt-time positions so
  // priming changes only WHEN the old roster appears, never its calibrated
  // formation or its use of the arena's authored decks.
  const pivot = CORNER_S[k - 1];
  const halt = pivot - W.haltOffset;
  const edgeShift = halt - scrollX;
  const right = Math.min(sRightEdge() + edgeShift - 2, pivot - 2);
  const left = Math.min(sLeftEdge() + edgeShift + 6, right - 4);
  const span = Math.max(right - left, 4);
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0 : i / (n - 1);
    const sx = right - f * span;
    const lane = waveLane(k, i, CONFIG);       // authored altitude mix per wave
    // The ecology score is an opt-in row overlay. A missing/disabled row
    // leaves the old kind, timing and placement path untouched.
    const ecologyRow = level1EcologyEncounterRow(k, i);
    const kind = ecologyRow?.kind || waveKind(k, i, CONFIG);
    const delayMs = ecologyRow
      ? level1EcologyEncounterDelay(ecologyRow)
      : waveSpawnDelay(k, i, CONFIG);
    spawnGateRole(
      kind, k, i, sx, lane, delayMs, pivot, encounterKey, ecologyRow,
    );
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
  if (c && c.state === 'gate') pullNextGatePresence(c);
  if (c && c.state === 'gate' && !gateRows(c).some(e => e.gating)) {
    // Non-gating denial roles have done their spatial job. Clear them on the
    // killing beat so the transformation is a genuine breather and the next
    // face never inherits an invisible turret or marked landing. Removal is
    // deferred to updateHostiles: this callback can run inside updateBullets,
    // whose reverse iterator must not have the whole array cleared under it.
    for (const e of gateRows(c)) e.gateBreakExit = true;
    c.state = 'approach';
    c.tStart = 0;
  }
}

export function finishCorner(c) {
  // The next face already exists (static anatomy, entry 3; the sim keeps no
  // build state for it since T-201). The hook still marks the moment for
  // presentation: render juice keys its corner boom to it.
  view.level.faceRevealed(c);
  c.state = 'done';
  view.corner.finished(c);               // render: the camera keeps the new heading
  if (GATES_ROLLING) c.nextReentryAt = gameMs;
}

/* ======================== ROLLING ENCOUNTER ========================= */

const ROOTED_KINDS = Object.freeze({ polyp: true, mortar: true });
// A queued slot that does not wake on its own: hidden, inert, unshootable
// (every enterUntil test in the sim and the renderer reads it as "not yet").
const DORMANT = Infinity;

// Static per-corner score facts, resolved once: each beat's slots, its
// proximity line on the route, its rooted bodies' reviewed sockets and its
// longest in-beat stagger.
const beatFacts = [];
function beatInfo(c, beat) {
  let rows = beatFacts[c.k - 1];
  if (!rows) {
    rows = [];
    const jointFront = c.s + 1 - CONFIG.edges.margin;
    for (let b = 0; b < c.beats; b++) {
      let slots = level1EcologyBeatSlots(c.k, b);
      // A face without an authored score releases its whole roster as one beat.
      if (!slots.length && b === 0) slots = Array.from({ length: waveSize(c.k, CONFIG) }, (_, i) => i);
      const rooted = [];
      let maxDelayMs = 0;
      for (let j = 0; j < slots.length; j++) {
        const row = level1EcologyEncounterRow(c.k, slots[j]);
        const kind = row?.kind || waveKind(c.k, slots[j], CONFIG);
        maxDelayMs = Math.max(maxDelayMs, row ? level1EcologyRollingDelay(row)
          : j * CONFIG.waves.staggerMs);
        const stage = ROOTED_KINDS[kind] ? ecologyStage(c.k, row) : null;
        if (stage) rooted.push(stage.x);
      }
      rows.push(Object.freeze({
        slots: Object.freeze(slots), rooted: Object.freeze(rooted), maxDelayMs,
        line: rollingBeatLine(jointFront, c.beats, b),
      }));
    }
    beatFacts[c.k - 1] = rows;
  }
  return rows[beat];
}

// The camera anchors at the scroll (render/camera.js syncCamera). After a
// turn it keeps the departing facet's anchor until the scroll crosses that
// bend, and until then the arriving facet is drawn skewed: the sim's
// [left, right] strip overstates what is in frame (measured with the T-102
// camera replica: by about 0.6 tiles per tile of lag on landscape views).
// Nothing is staged into a frame the sim cannot describe.
function viewOnFacet(k) {
  return k <= 1 || scrollX >= BEND_S[k - 2] - 1e-6;
}

// The staging band against the live view: the plane advances while a body
// condenses, so its margin is added for the body's longest entrance.
const bandScratch = { lo: 0, hi: 0 };
function stageBandFor(pivotS, maxDelayMs, planeTilesPerSec, out = bandScratch) {
  const advance = Math.max(0, planeTilesPerSec || 0) * (maxDelayMs + CONFIG.wasp.enterMs) / 1000;
  return rollingStageBand(sLeftEdge(), sRightEdge(), pivotS, advance, ROLLING_GATES, out);
}

function beatAlive(c, beat) {
  for (const e of hostiles) {
    if (e.gateBreakExit || e.encounterKey !== c.encounterKey ||
        Number.isFinite(e.pursuitFrom) || e.rollingBeat !== beat) continue;
    return true;
  }
  return false;
}

/* Called by sim/scroll.js every six-face frame. Releases the next beat when
 * it is due (src/pure/waves.js rollingBeatDue): RIG past the beat's line with
 * its rooted sockets in view, the previous beat cleared plus a breath, or the
 * bounded clock; the teach beat also on today's scroll prelude rule. Beats
 * stop releasing once the corner turns: a slot never released is either
 * carried (mobile) or never appears (rooted).                             */
const dueScratch = {
  beat: 0, beats: 0, nowMs: 0, lastReleaseMs: 0, prevClearedAtMs: null, rigFront: 0,
  lineX: 0, rootedVisible: false, preludeReady: false, frameTrusted: false,
};
export function updateRollingEncounter(c, rigFront, planeTilesPerSec = 0) {
  if (!GATES_ROLLING || !c || c.beat >= c.beats) return null;
  if (c.state !== 'idle' && c.state !== 'approach') return null;
  if (c.beat > 0 && c.beatClearedAt === null && !beatAlive(c, c.beat - 1)) c.beatClearedAt = gameMs;
  const info = beatInfo(c, c.beat);
  const band = stageBandFor(CORNER_S[c.k - 1], info.maxDelayMs, planeTilesPerSec);
  let visible = true;
  for (let i = 0; i < info.rooted.length; i++)
    if (info.rooted[i] < band.lo || info.rooted[i] > band.hi) { visible = false; break; }
  dueScratch.beat = c.beat;
  dueScratch.beats = c.beats;
  dueScratch.nowMs = gameMs;
  dueScratch.lastReleaseMs = c.beatAtMs;
  dueScratch.prevClearedAtMs = c.beat > 0 ? c.beatClearedAt : null;
  dueScratch.rigFront = rigFront;
  dueScratch.lineX = info.line;
  dueScratch.rootedVisible = visible;
  dueScratch.preludeReady = scrollX >= gatePreludeS(HALT_S[c.k - 1]) - 1e-6;
  dueScratch.frameTrusted = viewOnFacet(c.k);
  const reason = rollingBeatDue(dueScratch);
  if (reason) releaseRollingBeat(c, c.beat, reason, planeTilesPerSec, band);
  return reason;
}

function releaseRollingBeat(c, beat, reason, planeTilesPerSec = 0, bandIn = null) {
  const info = beatInfo(c, beat);
  const band = bandIn || stageBandFor(CORNER_S[c.k - 1], info.maxDelayMs, planeTilesPerSec);
  if (!c.primed) { c.primed = true; c.primedAtS = scrollX; }
  let displaced = 0, spawned = 0, authored = 0;
  for (let j = 0; j < info.slots.length; j++) {
    const slot = info.slots[j];
    const row = level1EcologyEncounterRow(c.k, slot);
    const kind = row?.kind || waveKind(c.k, slot, CONFIG);
    const placed = spawnRollingRole(kind, c.k, slot, j, info.slots.length, row, band,
      displaced, c.encounterKey, beat);
    if (placed === 'displaced') displaced++;
    else if (placed === 'authored') authored++;
    if (placed) spawned++;
  }
  c.beat = beat + 1;
  c.beatAtMs = gameMs;
  c.beatClearedAt = spawned ? null : gameMs;
  c.released += info.slots.length;
  c.beatLog.push({ beat, atMs: gameMs, reason, spawned, authored, of: info.slots.length,
    scroll: scrollX, lo: band.lo, hi: band.hi });
}

// The held gate's spawn row for an authored slot (same id, cohort and
// ecology fields), so a rolling body is the same reviewed body.
function gateGenomeRow(k, slot, kind, encounterKey, ecologyRow, stage) {
  return {
    id: ecologyRow?.id || `gate-${k}-${slot}-${kind}`,
    gateWave: k,
    encounterKey,
    cohortKey: encounterKey,
    cohortSlot: slot,
    cohortPhase: 0,
    attackReadyDelayMs: gateAttackReadyDelay(slot),
    ...(ecologyRow ? {
      ecologyId: ecologyRow.ecologyId,
      ecologyBeat: ecologyRow.beat,
      ecologyBeatSlot: ecologyRow.beatSlot,
      ecologyStageRole: ecologyRow.stageRole,
      ecologyMode: ecologyRow.mode,
      ecologyStageResolved: !!stage,
      ecologyPlacementFallback: !stage,
    } : {}),
  };
}

// Surfaces a displaced rooted body may stand on: every authored platform of
// the face clipped to the band, else a flat two-column deck run. Returns the
// mount whose usable span holds the point nearest the target, or null.
function rollingMount(k, targetX, band, inset, preferY) {
  const assault = (levelData.assaults || []).find((a) => a.face === k);
  let best = null;
  for (const p of assault ? assault.platforms : []) {
    const lo = Math.max(p.x0 + inset, band.lo), hi = Math.min(p.x1 - inset, band.hi);
    if (hi < lo) continue;
    const x = Math.max(lo, Math.min(hi, targetX));
    const score = Math.abs(x - targetX) + 0.25 * Math.abs(p.y - preferY);
    if (!best || score < best.score) best = { x, y: p.y, score };
  }
  if (best) return best;
  for (let d = 0; d < 64; d++) {
    for (const col of [Math.floor(targetX) - d, Math.floor(targetX) + d]) {
      if (col + 1 < band.lo || col + 1 > band.hi) continue;
      const g = levelData.groundH[col];
      if (g > -100 && levelData.groundH[col + 1] === g) return { x: col + 1, y: g, score: d };
    }
  }
  return null;
}

// A hound needs a three-column flat deck run inside [lo, hi], short of the
// pivot like the held gate's search; nearest the target wins.
function rollingHoundDeck(pivot, targetX, lo, hi) {
  const c0 = Math.max(0, Math.floor(lo - 1.5));
  const c1 = Math.min(levelData.groundH.length - 3, Math.floor(hi - 1.5), Math.floor(pivot - 2));
  let best = null;
  for (let col = c0; col <= c1; col++) {
    const deck = levelData.groundH[col];
    if (!(deck > -100) || levelData.groundH[col + 1] !== deck ||
        levelData.groundH[col + 2] !== deck) continue;
    const x = col + 1.5;
    if (x < lo || x > hi) continue;
    const score = Math.abs(x - targetX);
    if (!best || score < best.score)
      best = { x, deck, score, patrol: { x0: col + 0.2, x1: col + 2.8 } };
  }
  return best;
}

function tagLast(beat) {
  const e = hostiles[hostiles.length - 1];
  if (e) e.rollingBeat = beat;
  return e;
}

/* One released body, staged inside the live view. Its reviewed Vertical
 * Assault socket is used verbatim when it lies inside the band (rooted peers
 * keep the held gate's spread); otherwise the body is pulled into the band
 * (and spread from its displaced peers). Kind, HP, gating, genome row and
 * in-beat stagger are the held gate's; only WHERE (and the beat clock)
 * moves. Returns 'authored' | 'displaced' | null (nowhere honest to stand). */
function spawnRollingRole(kind, k, slot, j, count, ecologyRow, band, displacedIdx,
    encounterKey, beat) {
  const stage = ecologyStage(k, ecologyRow);
  const genomeRow = gateGenomeRow(k, slot, kind, encounterKey, ecologyRow, stage);
  const delayMs = ecologyRow ? level1EcologyRollingDelay(ecologyRow) : j * CONFIG.waves.staggerMs;
  const lane = waveLane(k, slot, CONFIG);
  const f = count <= 1 ? 0 : j / (count - 1);
  const targetX = stage ? stage.x : band.hi - f * (band.hi - band.lo);
  const pivot = CORNER_S[k - 1];

  if (kind === 'wasp') {
    const x = rollingStageX(targetX, band, displacedIdx);
    const authored = !!stage && x === stage.x;
    const y = authored ? stage.y + Math.max(1.8, Math.min(3.2, lane * 0.5)) : spawnLaneY(x, lane);
    spawnHostile(x, y, delayMs, 'wasp', genomeRow);
    tagLast(beat);
    return authored ? 'authored' : 'displaced';
  }

  if (kind === 'hound') {
    const authoredDeck = ecologyHoundDeck(k, stage);
    const inBand = !!authoredDeck && authoredDeck.x >= band.lo && authoredDeck.x <= band.hi;
    const deck = inBand ? authoredDeck
      : rollingHoundDeck(pivot, rollingStageX(targetX, band, displacedIdx), band.lo, band.hi);
    if (!deck) return null;
    spawnHostile(deck.x, deck.deck + CONFIG.hound.rideY, delayMs, 'hound', {
      ...genomeRow, kind, deck: deck.deck, dir: 1,
      gating: false,
      tune: k <= 3 ? { hp: 4 } : undefined,
      patrol: deck.patrol,
      ecologyPlacementFallback: !!ecologyRow && (!stage || !inBand),
    });
    tagLast(beat);
    return inBand ? 'authored' : 'displaced';
  }

  if (kind === 'polyp' || kind === 'mortar') {
    const radius = kind === 'polyp' ? CONFIG.polyp.hitRadius : CONFIG.mortar.hitRadius;
    const inset = radius + 0.28;
    let mount = null, authored = false;
    if (stage && stage.x >= band.lo && stage.x <= band.hi) {
      const p = stage.platform;
      const lo = Math.max(p.x0 + inset, band.lo), hi = Math.min(p.x1 - inset, band.hi);
      if (lo <= hi) {
        const x = Math.max(lo, Math.min(hi, rootedStageX(kind, k, slot, stage, p, stage.x, radius)));
        mount = { x, y: p.y };
        authored = true;
      }
    }
    if (!mount) {
      mount = rollingMount(k, rollingStageX(targetX, band, displacedIdx), band, inset,
        stage ? stage.y : 0);
    }
    if (!mount) return null;
    if (kind === 'polyp') {
      spawnHostile(mount.x, mount.y + CONFIG.polyp.rootY, delayMs, 'polyp', {
        ...genomeRow, kind, deck: mount.y, dir: -1, gating: k === 3, autoCycle: true,
      });
      tagLast(beat);
      return authored ? 'authored' : 'displaced';
    }
    // Mortar: bombard its authored landing role when that lies in the band,
    // otherwise the nearest landing short of the mortar, never past the pivot.
    const targetStage = ecologyStage(k, ecologyRow, ecologyRow?.targetStageRole);
    let zoneX = targetStage ? targetStage.x : mount.x - 5;
    let zoneY = targetStage ? targetStage.platform.y : groundTopAt(zoneX);
    if (!targetStage || zoneX < band.lo || zoneX > band.hi) {
      zoneX = Math.max(band.lo, Math.min(Math.min(band.hi, pivot - 2),
        targetStage ? targetStage.x : mount.x - 5));
      const g = groundTopAt(zoneX);
      zoneY = g > -100 ? g : mount.y;
    }
    spawnHostile(mount.x, mount.y + CONFIG.mortar.bodyY, delayMs, 'mortar', {
      ...genomeRow, kind, deck: mount.y, dir: -1, gating: false,
      zone: { x: zoneX, y: zoneY },
      ecologyPlacementFallback: !!ecologyRow && (!authored ||
        (!!ecologyRow.targetStageRole && !targetStage)),
    });
    tagLast(beat);
    return authored ? 'authored' : 'displaced';
  }

  // Defensive fallback for a mistyped/future roster entry: a visible wasp.
  const x = rollingStageX(targetX, band, displacedIdx);
  spawnHostile(x, spawnLaneY(x, lane), delayMs, 'wasp', genomeRow);
  tagLast(beat);
  return 'displaced';
}

/* ---------------------------- carry-over ----------------------------- *
 * The turn fires whatever is alive. On its first frame up to
 * ROLLING_GATES.carryMax of the side's mobile ENCOUNTER bodies follow RIG:
 * its own survivors first (its gating bodies, then the rest), then mobile
 * slots of beats the racer outran (they were on their way), then bodies
 * already following from an earlier corner. A follower goes
 * DORMANT — a queued slot: hidden, inert, unshootable, the state every gate
 * body starts in — so nothing can touch RIG while the ritual pins them; every
 * other body on the departing side leaves through the deferred gate-break path
 * (no kill credit). Rooted kinds and carriers never follow, and nothing
 * follows past the last corner: the Crown approach is a set piece, not a side.
 * Once the ritual is over and the camera anchor has crossed the bend,
 * updatePursuers() brings the followers back on the arriving facet, one per
 * carryStaggerMs, each with an ordinary entrance tell.                     */
const carryScratch = [];
const pursuerIds = CORNER_S.map(() => []);

function beginPursuit(c, rigX) {
  const R = ROLLING_GATES;
  const lastCorner = c.k >= CORNER_S.length;
  let survivors = 0;
  carryScratch.length = 0;
  for (const e of hostiles) {
    if (e.gateBreakExit) continue;
    if (e.encounterKey === c.encounterKey && !Number.isFinite(e.pursuitFrom)) survivors++;
    const rank = lastCorner ? Infinity : rollingCarryRank(e, c.encounterKey);
    if (rank === Infinity) { e.gateBreakExit = true; continue; }
    carryScratch.push({ rank, d: Math.abs(e.x - rigX), id: e.id, e, slot: -1, beat: -1 });
  }
  if (!lastCorner) {
    for (let b = c.beat; b < c.beats; b++) {
      const info = beatInfo(c, b);
      for (const slot of info.slots) {
        const row = level1EcologyEncounterRow(c.k, slot);
        const kind = row?.kind || waveKind(c.k, slot, CONFIG);
        if (kind !== 'wasp' && kind !== 'hound') continue;
        carryScratch.push({ rank: CARRY_RANK_UNRELEASED, d: 0, id: slot, e: null, slot, beat: b });
      }
    }
  }
  c.survivorsAtTurn = survivors;
  c.clearedAtTurn = c.beat >= c.beats && survivors === 0;
  carryScratch.sort((a, b) => a.rank - b.rank || a.d - b.d || a.id - b.id);
  const ids = pursuerIds[c.k - 1];
  ids.length = 0;
  let unreleased = 0;
  for (const cand of carryScratch) {
    if (ids.length >= R.carryMax) {
      if (cand.e) cand.e.gateBreakExit = true;
      continue;
    }
    let e = cand.e;
    if (!e) {
      e = spawnDormantSlot(c, cand.slot, cand.beat, rigX);
      if (!e) continue;
      unreleased++;
    }
    e.pursuitFrom = c.k;
    e.enterUntil = DORMANT;
    ids.push(e.id);
  }
  carryScratch.length = 0;
  c.pursuers = ids.length;
  c.unreleasedCarried = unreleased;
  c.carried = 0;
  c.dropped = 0;
  c.reentryOpenAt = null;
}

// A mobile slot the racer outran: the same reviewed body, spawned dormant
// (placed at re-entry). Its slot is released for the bookkeeping.
function spawnDormantSlot(c, slot, beat, rigX) {
  const row = level1EcologyEncounterRow(c.k, slot);
  const kind = row?.kind || waveKind(c.k, slot, CONFIG);
  const genomeRow = gateGenomeRow(c.k, slot, kind, c.encounterKey, row, ecologyStage(c.k, row));
  const extra = kind === 'hound' ? { gating: false, tune: c.k <= 3 ? { hp: 4 } : undefined } : {};
  spawnHostile(rigX - 1, groundTopAt(rigX - 1) + 1, 0, kind, { ...genomeRow, ...extra });
  const e = tagLast(beat);
  c.released++;
  return e;
}

// Behaviour state a re-entering body starts from, as spawnHostile builds it.
// Identity — id, kind, hp, genome and its traits, ecology recipe — is kept:
// it is the same body that followed RIG round the limb.
const REENTRY_ZERO = Object.freeze([
  'vx', 'vy', 'stateUntil', 'diveCdUntil', 'lockUntil', 'twinPassesLeft',
  'staggerUntil', 'recoilVx', 'recoilVy', 'bulwarkOpenUntil', 'bulwarkPingUntil',
  'backlashUntil', 'backlashCoolUntil', 'backlashBurstUntil', 'salvoShotsRemaining',
  'relayCycles', 'beamReach', 'flashUntil',
]);

function reenterHostile(e, x, y, dir, enterUntil, patrol) {
  for (const f of REENTRY_ZERO) e[f] = 0;
  e.x = x; e.y = y; e.baseY = y; e.dir = dir;
  e.state = ENEMY[e.kind]?.start || 'cruise';
  e.gateClosing = false;
  e.tellLocked = false;
  e.formationReady = !e.pincer;
  if (patrol) { e.patrolX0 = patrol.x0; e.patrolX1 = patrol.x1; }
  e.deckY = undefined;
  // The ecology tactic state (crosswind burst, rebound vault, hazards) is
  // rebuilt exactly as spawnHostile builds it for this body's own recipe.
  Object.assign(e, makeEnemyEcologyFields(e.kind, { ecologyId: e.ecologyId }, y, e.genome));
  e.enterUntil = enterUntil;
}

/* Every rolling frame (sim/scroll.js): bring followers back on the arriving
 * facet. A follower re-enters only once the corner is done and the camera
 * anchor has crossed its bend, inside the staging band on the arriving facet,
 * preferably carryAheadTiles..+carryWindowTiles ahead of RIG; one that finds
 * no room within carryTimeoutMs is dropped (and counted).                  */
const reentryBand = { lo: 0, hi: 0 };
export function updatePursuers(rigX, planeTilesPerSec = 0) {
  if (!GATES_ROLLING) return;
  const R = ROLLING_GATES;
  for (const c of cornerEvents) {
    if (c.state !== 'done' || c.carried + c.dropped >= c.pursuers || c.k >= CORNER_S.length) continue;
    if (!viewOnFacet(c.k + 1) || gameMs < c.nextReentryAt) continue;
    if (c.reentryOpenAt === null) c.reentryOpenAt = gameMs;
    const ids = pursuerIds[c.k - 1];
    const j = c.carried + c.dropped;
    let e = null;
    for (const h of hostiles) if (h.id === ids[j]) { e = h; break; }
    // Killed or retired while dormant cannot happen (dormant bodies are
    // unshootable); a run reset clears both lists. Count it rather than stall.
    if (!e || e.gateBreakExit) { c.dropped++; continue; }
    const bend = BEND_S[c.k - 1], nextPivot = CORNER_S[c.k];
    const band = stageBandFor(nextPivot, 0, planeTilesPerSec, reentryBand);
    band.lo = Math.max(band.lo, bend + 1);
    let lo = Math.max(band.lo, rigX + R.carryAheadTiles);
    let hi = Math.min(band.hi, lo + R.carryWindowTiles);
    if (hi < lo) { lo = band.lo; hi = band.hi; }
    const enterUntil = gameMs + CONFIG.wasp.enterMs;
    let placed = false;
    if (hi >= lo) {
      const x0 = lo + (hi - lo) * ((j % R.carryMax) + 0.5) / R.carryMax;
      if (e.kind === 'hound') {
        const deck = rollingHoundDeck(nextPivot, x0, lo, hi) ||
          rollingHoundDeck(nextPivot, x0, band.lo, band.hi);
        if (deck) {
          reenterHostile(e, deck.x, deck.deck + CONFIG.hound.rideY, -1, enterUntil, deck.patrol);
          placed = true;
        }
      } else {
        const lanes = CONFIG.waves.laneHeights;
        reenterHostile(e, x0, spawnLaneY(x0, lanes[j % lanes.length]), -1, enterUntil, null);
        placed = true;
      }
    }
    if (placed) {
      c.carried++;
      c.nextReentryAt = gameMs + R.carryStaggerMs;
    } else if (gameMs - c.reentryOpenAt > R.carryTimeoutMs) {
      e.gateBreakExit = true;
      c.dropped++;
    }
  }
}

/* What the encounter line reads (src/ui/hud.js), allocation-free. */
const statusOut = { live: 0, pending: 0, following: 0, cleared: false };
export function rollingEncounterStatus(c) {
  statusOut.live = 0; statusOut.following = 0; statusOut.cleared = false;
  statusOut.pending = c ? Math.max(0, waveSize(c.k, CONFIG) - c.released) : 0;
  if (!c) return statusOut;
  let own = false;
  for (const e of hostiles) {
    if (e.gateBreakExit) continue;
    if (Number.isFinite(e.pursuitFrom)) {
      if (e.pursuitFrom === c.k - 1) statusOut.following++;
    } else if (e.encounterKey === c.encounterKey) {
      own = true;
      if (gameMs >= e.enterUntil - CONFIG.wasp.enterMs) statusOut.live++;
    }
  }
  statusOut.cleared = c.primed && c.beat >= c.beats && !own;
  return statusOut;
}

// run reset (resetGame in src/main.js): every corner is armed again
export function resetCornerEvents() {
  for (const c of cornerEvents) {
    c.state = 'idle';
    c.tStart = 0;
    c.sealed = false;
    c.primed = false;
    c.primedAtS = null;
    c.beat = 0;
    c.beatAtMs = 0;
    c.beatClearedAt = null;
    c.released = 0;
    c.beatLog.length = 0;
    c.survivorsAtTurn = 0;
    c.clearedAtTurn = false;
    c.pursuers = 0;
    c.unreleasedCarried = 0;
    c.carried = 0;
    c.dropped = 0;
    c.nextReentryAt = 0;
    c.reentryOpenAt = null;
  }
  for (const ids of pursuerIds) ids.length = 0;
}
