/* ====================== WAVES: GATE RUNTIME ======================= */
/* The six-face corners. Two lifecycles share this module:

   ROLLING (default, T-201 — decisions.md entry 23 #2 and the addendum in
   entry 25): the turn never waits. A side's encounter is released beat by
   beat ON THE MOVE (teach -> test -> remix), each beat by clear, proximity or
   a bounded clock (src/pure/waves.js ROLLING_GATES), every body staged inside
   the live view; the corner arms the moment RIG reaches its joint, whatever
   is still alive, and the side's mobile survivors follow RIG onto the next
   side. The price of skipping a fight is pressure (entry 12), never time.

   LEGACY (`?gates=legacy`): the held gate exactly as it shipped. The scroll
   halts at each corner until the wave is cleared; the killing shot opens the
   joint; the ritual starts when RIG reaches it.

   Both end in the same ritual: wind-up, two yaw snaps with a ratchet hold,
   then the scroll eases back in. The brick-slam zipper that used to build the
   next face during it is gone (entry 25); the next face pre-exists. */

import { CONFIG } from '../config.js';
import {
  level1EcologyBeatCount, level1EcologyBeatSlots, level1EcologyEncounterDelay,
  level1EcologyEncounterRow, level1EcologyRollingDelay,
} from '../pure/level1-ecology-encounters.js';
import { BEND_S, CORNER_S } from '../pure/path.js';
import {
  ROLLING_GATES, cornerApproachReady, cornerEventTotalMs, cornerHandoffMs, cornerJointRule,
  gateAttackReadyDelay, rollingBeatDue, rollingCarryRank, rollingStageBand, rollingStageX,
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
  // The scroll a held corner keeps (legacy: always its halt; with arm on
  // arrival, wherever the follow-lead had put it when RIG reached the joint).
  heldS: null, armedBy: null,
  // Rolling encounter bookkeeping (T-201). `beat` is the next beat to
  // release, `beatAtMs` when the last one was, `beatClearedAt` when the last
  // released beat's final body left (null while any survives). `beatLog`
  // records every release for the headless proofs; it is cleared in place.
  beats: Math.max(1, level1EcologyBeatCount(i + 1)), beat: 0, beatAtMs: 0,
  beatClearedAt: null, released: 0, beatLog: [],
  // Carry-over: survivors that followed RIG round this corner, and whether
  // the side's encounter had been cleared when the turn fired.
  pursuers: 0, carried: 0, clearedAtTurn: false, survivorsAtTurn: 0, candidatesAtTurn: 0,
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
// gate's cadence (src/sim/hostiles.js). Legacy: only while a gate holds the
// scroll. Rolling: while the side's released encounter has a live body, or
// survivors that followed RIG round the last corner are still alive — the
// scroll keeps moving either way.
export function gateActive() {
  const c = activeCorner();
  if (!c) return false;
  if (!GATES_ROLLING) return c.state === 'gate';
  return rollingEncounterPressing(c);
}

function rollingEncounterPressing(c) {
  if (c.state !== 'idle' && c.state !== 'approach') return false;
  for (const e of hostiles) {
    if (e.gateBreakExit) continue;
    if (c.primed && e.encounterKey === c.encounterKey) return true;
    if (e.pursuitFrom === c.k - 1) return true;
  }
  return false;
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

// `?hinge=flow` (unjudged A/B, T-102 R4): after the camera hand-off the
// turning joint opens forward. Before it, the arriving facet is not drawn yet,
// so RIG stays on the hinge exactly as in the default.
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
export function primeGateWave(c, planeTilesPerSec = 0) {
  if (!c || c.state !== 'idle' || c.primed) return false;
  c.primed = true;
  c.primedAtS = scrollX;
  if (GATES_ROLLING) releaseRollingBeat(c, 0, 'prime', planeTilesPerSec);
  else spawnGateWave(c.k, c.encounterKey);
  return true;
}

// `arrival`: RIG reached the closed joint before the scroll reached the halt
// (follow-lead or rolling corners). The corner then holds the scroll where it
// is instead of at the halt.
export function armGate(c, arrival = false) {
  if (!c || c.state !== 'idle') return;
  if (!c.primed) primeGateWave(c); // direct/headless callers retain a complete gate
  c.heldS = arrival ? scrollX : null;
  c.armedBy = arrival ? 'arrival' : 'halt';

  if (GATES_ROLLING) {
    // The turn never waits: the joint opens on arming, whatever is alive.
    // Nothing is retired here — the encounter keeps fighting until the turn
    // fires, and its survivors are dealt with then (beginPursuit).
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

export function finishCorner(c, rigX = BEND_S[c.k - 1]) {
  // The next face already exists (static anatomy, entry 3). This hook still
  // marks the moment for presentation: render juice keys its corner boom to it.
  view.level.faceRevealed(c);
  c.state = 'done';
  view.corner.finished(c);               // render: the camera keeps the new heading
  if (GATES_ROLLING) restagePursuers(c, rigX);
}

/* ======================== ROLLING ENCOUNTER ========================= */

// The x of each beat's proximity line: its nearest authored socket minus
// ROLLING_GATES.primeLeadTiles. Static data, resolved once per corner.
const beatTriggerCache = new Map();
function beatTriggerX(c, beat) {
  const key = c.k * 64 + beat;
  if (beatTriggerCache.has(key)) return beatTriggerCache.get(key);
  let near = Infinity;
  for (const slot of level1EcologyBeatSlots(c.k, beat)) {
    const stage = ecologyStage(c.k, level1EcologyEncounterRow(c.k, slot));
    near = Math.min(near, stage ? stage.x : c.s - CONFIG.waves.haltOffset);
  }
  if (!Number.isFinite(near)) near = c.s - CONFIG.waves.haltOffset;
  const x = near - ROLLING_GATES.primeLeadTiles;
  beatTriggerCache.set(key, x);
  return x;
}

// The encounter primes (its teach beat is released) when RIG comes within
// primeLeadTiles of the arena's nearest authored socket, so a racer meets
// the whole score before the joint; the shipped prelude rule (the scroll 18
// tiles from the halt) still primes it for a player the plane is carrying.
const primeTriggerCache = new Map();
function primeTriggerX(c) {
  if (primeTriggerCache.has(c.k)) return primeTriggerCache.get(c.k);
  let x = Infinity;
  for (let b = 0; b < c.beats; b++) x = Math.min(x, beatTriggerX(c, b));
  primeTriggerCache.set(c.k, x);
  return x;
}
export function rollingPrimeReady(c, rigX) {
  return GATES_ROLLING && !!c && c.state === 'idle' && !c.primed &&
    rigX >= primeTriggerX(c);
}

function beatAlive(c, beat) {
  for (const e of hostiles)
    if (e.encounterKey === c.encounterKey && e.ecologyBeat === beat && !e.gateBreakExit) return true;
  return false;
}

/* Called by sim/scroll.js every six-face frame. Releases the next beat when
 * it is due (src/pure/waves.js rollingBeatDue): the previous beat cleared
 * plus a breath, RIG near the beat's sockets, or the bounded clock. Beats
 * stop releasing once the corner is turning: unreleased beats never appear. */
const dueScratch = { beat: 0, beats: 0, nowMs: 0, lastReleaseMs: 0, prevClearedAtMs: null,
  rigX: 0, triggerX: 0 };
export function updateRollingEncounter(c, rigX, planeTilesPerSec = 0) {
  if (!GATES_ROLLING || !c || !c.primed || c.beat >= c.beats) return null;
  if (c.state !== 'idle' && c.state !== 'approach') return null;
  if (c.beatClearedAt === null && !beatAlive(c, c.beat - 1)) c.beatClearedAt = gameMs;
  dueScratch.beat = c.beat;
  dueScratch.beats = c.beats;
  dueScratch.nowMs = gameMs;
  dueScratch.lastReleaseMs = c.beatAtMs;
  dueScratch.prevClearedAtMs = c.beatClearedAt;
  dueScratch.rigX = rigX;
  dueScratch.triggerX = beatTriggerX(c, c.beat);
  const reason = rollingBeatDue(dueScratch);
  if (reason) releaseRollingBeat(c, c.beat, reason, planeTilesPerSec);
  return reason;
}

function releaseRollingBeat(c, beat, reason, planeTilesPerSec = 0) {
  const k = c.k;
  const slots = level1EcologyBeatSlots(k, beat);
  const n = waveSize(k, CONFIG);
  // A face without an authored score releases its whole roster as one beat.
  const list = slots.length ? slots : Array.from({ length: n }, (_, i) => i);
  let maxDelay = 0;
  for (const i of list) maxDelay = Math.max(maxDelay,
    level1EcologyRollingDelay(level1EcologyEncounterRow(k, i)));
  // The plane keeps moving while a body condenses: stage it far enough in
  // that it is still stagePlaneTiles clear of the plane once shootable.
  const advance = Math.max(0, planeTilesPerSec) * (maxDelay + CONFIG.wasp.enterMs) / 1000;
  const band = rollingStageBand(sLeftEdge(), sRightEdge(), CORNER_S[k - 1], advance);
  let displaced = 0, spawned = 0;
  for (let j = 0; j < list.length; j++) {
    const i = list[j];
    const row = level1EcologyEncounterRow(k, i);
    const kind = row?.kind || waveKind(k, i, CONFIG);
    const placed = spawnRollingRole(kind, k, i, j, list.length, row, band, displaced,
      c.encounterKey);
    if (placed === 'displaced') displaced++;
    if (placed) spawned++;
  }
  c.beat = beat + 1;
  c.beatAtMs = gameMs;
  c.beatClearedAt = null;
  c.released += list.length;
  c.beatLog.push({ beat, atMs: gameMs, reason, spawned, of: list.length,
    scroll: scrollX, band: { lo: band.lo, hi: band.hi } });
}

function rollingGenomeRow(k, slot, encounterKey, ecologyRow, stage) {
  return {
    id: ecologyRow?.id || `gate-${k}-${slot}`,
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

// Surfaces a rooted body may stand on: every authored platform of the face,
// clipped to the band, plus flat deck runs. Returns the mount whose usable
// span holds a point nearest the target, or null.
function rollingMount(k, targetX, band, inset, preferY) {
  const assault = (levelData.assaults || []).find((a) => a.face === k);
  let best = null;
  for (const p of assault ? assault.platforms : []) {
    const lo = Math.max(p.x0 + inset, band.lo), hi = Math.min(p.x1 - inset, band.hi);
    if (hi < lo) continue;
    const x = Math.max(lo, Math.min(hi, targetX));
    const score = Math.abs(x - targetX) + 0.25 * Math.abs(p.y - preferY);
    if (!best || score < best.score) best = { x, y: p.y, platform: p, score };
  }
  if (best) return best;
  // No platform in the band: root on the deck (two flat columns).
  for (let d = 0; d < 64; d++) {
    for (const col of [Math.floor(targetX) - d, Math.floor(targetX) + d]) {
      if (col + 1 < band.lo || col + 1 > band.hi) continue;
      const g = levelData.groundH[col];
      if (g > -100 && levelData.groundH[col + 1] === g)
        return { x: col + 1, y: g, platform: null, score: d };
    }
  }
  return null;
}

// A hound needs a three-column flat deck run inside the band, short of the
// pivot like the held gate's search.
function rollingHoundDeck(pivot, targetX, band) {
  const lo = Math.max(0, Math.floor(band.lo - 1.5));
  const hi = Math.min(levelData.groundH.length - 3, Math.floor(band.hi - 1.5), Math.floor(pivot - 2));
  let best = null;
  for (let col = lo; col <= hi; col++) {
    const deck = levelData.groundH[col];
    if (!(deck > -100) || levelData.groundH[col + 1] !== deck ||
        levelData.groundH[col + 2] !== deck) continue;
    const x = col + 1.5;
    if (x < band.lo || x > band.hi) continue;
    const score = Math.abs(x - targetX);
    if (!best || score < best.score)
      best = { x, deck, score, patrol: { x0: col + 0.2, x1: col + 2.8 } };
  }
  return best;
}

/* One released body, staged inside the live view. Its authored Vertical
 * Assault socket is used verbatim when it lies inside the band; otherwise
 * the body is pulled to the band (and spread from its peers). Roles, HP,
 * gating and timing are the held gate's; only WHERE moves. Returns
 * 'authored' | 'displaced' | null (null: nowhere honest to stand it).     */
function spawnRollingRole(kind, k, slot, j, count, ecologyRow, band, displacedIdx, encounterKey) {
  const stage = ecologyStage(k, ecologyRow);
  const genomeRow = rollingGenomeRow(k, slot, encounterKey, ecologyRow, stage);
  const delayMs = ecologyRow ? level1EcologyRollingDelay(ecologyRow)
    : j * CONFIG.waves.staggerMs;
  const lane = waveLane(k, slot, CONFIG);
  const f = count <= 1 ? 0 : j / (count - 1);
  const targetX = stage ? stage.x : band.hi - f * (band.hi - band.lo);
  const pivot = CORNER_S[k - 1];

  if (kind === 'wasp') {
    const x = rollingStageX(targetX, band, displacedIdx);
    const authored = !!stage && x === stage.x;
    const y = authored ? stage.y + Math.max(1.8, Math.min(3.2, lane * 0.5)) : spawnLaneY(x, lane);
    spawnHostile(x, y, delayMs, 'wasp', genomeRow);
    return authored ? 'authored' : 'displaced';
  }

  if (kind === 'hound') {
    const authoredDeck = ecologyHoundDeck(k, stage);
    const inBand = authoredDeck && authoredDeck.x >= band.lo && authoredDeck.x <= band.hi;
    const deck = inBand ? authoredDeck
      : rollingHoundDeck(pivot, rollingStageX(targetX, band, displacedIdx), band);
    if (!deck) return null;
    spawnHostile(deck.x, deck.deck + CONFIG.hound.rideY, delayMs, 'hound', {
      ...genomeRow, kind, deck: deck.deck, dir: 1,
      gating: false,
      tune: k <= 3 ? { hp: 4 } : undefined,
      patrol: deck.patrol,
      ecologyPlacementFallback: !!ecologyRow && (!stage || !inBand),
    });
    return inBand ? 'authored' : 'displaced';
  }

  if (kind === 'polyp' || kind === 'mortar') {
    const radius = kind === 'polyp' ? CONFIG.polyp.hitRadius : CONFIG.mortar.hitRadius;
    const inset = radius + 0.28;
    let mount = null, authored = false;
    if (stage) {
      const p = stage.platform;
      const lo = Math.max(p.x0 + inset, band.lo), hi = Math.min(p.x1 - inset, band.hi);
      if (lo <= hi && stage.x >= band.lo && stage.x <= band.hi) {
        // The held gate's peer spread around the socket, inside the band.
        const x = Math.max(lo, Math.min(hi,
          rootedStageX(kind, k, slot, stage, p, stage.x, radius)));
        mount = { x, y: p.y, platform: p };
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
    return authored ? 'authored' : 'displaced';
  }

  // Defensive fallback for a mistyped/future roster entry: a visible wasp.
  const x = rollingStageX(targetX, band, displacedIdx);
  spawnHostile(x, spawnLaneY(x, lane), delayMs, 'wasp', genomeRow);
  return 'displaced';
}

/* ---------------------- carry-over (T-201) ------------------------ *
 * The turn fires whatever is alive. On its first frame the side's mobile
 * survivors (up to ROLLING_GATES.carryMax, the encounter's gating bodies
 * first) leave play — inert and unseen, exactly a queued gate slot — and
 * everything else on the departing side is retired through the deferred
 * gate-break path (no kill credit, no corpse), so nothing can touch RIG while
 * the ritual pins them. When the ritual ends the survivors re-enter on the
 * arriving facet with an ordinary entrance tell: they followed RIG round the
 * limb. Rooted kinds and carriers never follow.                          */
const carryScratch = [];
function beginPursuit(c, rigX) {
  let survivors = 0;
  carryScratch.length = 0;
  for (const e of hostiles) {
    if (e.gateBreakExit) continue;
    if (e.encounterKey === c.encounterKey) survivors++;
    if (rollingCarryRank(e, c.encounterKey) === Infinity) { e.gateBreakExit = true; continue; }
    carryScratch.push(e);
  }
  c.survivorsAtTurn = survivors;
  c.candidatesAtTurn = carryScratch.length;
  c.clearedAtTurn = c.beat >= c.beats && survivors === 0;
  carryScratch.sort((a, b) =>
    rollingCarryRank(a, c.encounterKey) - rollingCarryRank(b, c.encounterKey) ||
    Math.abs(a.x - rigX) - Math.abs(b.x - rigX) || a.id - b.id);
  // Queued until well past the ritual's end; restagePursuers() sets the real
  // entrance the frame the ritual completes.
  const dormantUntil = gameMs + 2 * cornerEventTotalMs(CONFIG) + CONFIG.wasp.enterMs;
  let n = 0;
  for (const e of carryScratch) {
    if (n < ROLLING_GATES.carryMax) {
      e.pursuitFrom = c.k;
      e.enterUntil = dormantUntil;       // a queued slot: no AI, no contact, unseen
      n++;
    } else {
      e.gateBreakExit = true;
    }
  }
  carryScratch.length = 0;
  c.pursuers = n;
}

// Behaviour state a re-entering body starts from, as spawnHostile builds it.
const REENTRY_ZERO = Object.freeze([
  'vx', 'vy', 'stateUntil', 'diveCdUntil', 'lockUntil', 'twinPassesLeft',
  'staggerUntil', 'recoilVx', 'recoilVy', 'bulwarkOpenUntil', 'bulwarkPingUntil',
  'backlashUntil', 'backlashCoolUntil', 'backlashBurstUntil', 'salvoShotsRemaining',
  'relayCycles', 'beamReach', 't',
]);
export const PURSUIT_REENTRY_FIELDS = Object.freeze([
  ...REENTRY_ZERO, 'x', 'y', 'baseY', 'dir', 'state', 'gateClosing', 'tellLocked',
  'formationReady', 'patrolX0', 'patrolX1', 'deckY', 'enterUntil',
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

function restagePursuers(c, rigX) {
  const R = ROLLING_GATES;
  const bend = BEND_S[c.k - 1];
  const nextPivot = c.k < CORNER_S.length ? CORNER_S[c.k] : levelData.groundH.length - 1;
  const hi = Math.min(sRightEdge() - R.stageEdgeTiles, nextPivot - R.stagePivotTiles);
  let lo = Math.max(bend + 1, sLeftEdge() + R.stagePlaneTiles, rigX + R.carryAheadTiles);
  if (lo > hi) lo = Math.max(bend + 1, Math.min(hi, rigX + 1));
  const total = c.pursuers;
  let j = 0;
  for (const e of hostiles) {
    if (e.pursuitFrom !== c.k || e.gateBreakExit) continue;
    const x0 = total <= 1 ? (lo + hi) / 2 : lo + (hi - lo) * (j / (total - 1));
    const enterUntil = gameMs + j * R.carryStaggerMs + CONFIG.wasp.enterMs;
    if (e.kind === 'hound') {
      const deck = rollingHoundDeck(nextPivot, x0, { lo, hi });
      if (!deck) { e.gateBreakExit = true; continue; }
      reenterHostile(e, deck.x, deck.deck + CONFIG.hound.rideY, -1, enterUntil, deck.patrol);
    } else {
      const lanes = CONFIG.waves.laneHeights;
      reenterHostile(e, x0, spawnLaneY(x0, lanes[j % lanes.length]), -1, enterUntil, null);
    }
    j++;
  }
  c.carried = j;
}

/* What the encounter line reads (src/ui/hud.js), allocation-free. */
const statusOut = { live: 0, pending: 0, following: 0, cleared: false };
export function rollingEncounterStatus(c) {
  statusOut.live = 0; statusOut.following = 0;
  statusOut.pending = c ? Math.max(0, waveSize(c.k, CONFIG) - c.released) : 0;
  statusOut.cleared = false;
  if (!c) return statusOut;
  let any = false;
  for (const e of hostiles) {
    if (e.gateBreakExit) continue;
    if (e.encounterKey === c.encounterKey && e.pursuitFrom === undefined) {
      any = true;
      if (gameMs >= e.enterUntil - CONFIG.wasp.enterMs) statusOut.live++;
    } else if (e.pursuitFrom === c.k - 1 && gameMs >= e.enterUntil - CONFIG.wasp.enterMs) {
      statusOut.following++;
    }
  }
  statusOut.cleared = c.primed && c.beat >= c.beats && !any;
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
    c.heldS = null;
    c.armedBy = null;
    c.beat = 0;
    c.beatAtMs = 0;
    c.beatClearedAt = null;
    c.released = 0;
    c.beatLog.length = 0;
    c.pursuers = 0;
    c.carried = 0;
    c.clearedAtTurn = false;
    c.survivorsAtTurn = 0;
    c.candidatesAtTurn = 0;
  }
}
