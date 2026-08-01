/* ==================== TRANSFORMATION: RUNTIME ===================== */
/* The gate runtime for the world transitions, mirroring the corner ritual
   in ./wavegate.js: the scroll halts at the turn apron, RIG walking into
   the threshold starts the turn, the view swings through the bend while
   the scroll carries it around, and then the scroll eases back. Only
   ?slice=transform arms any of it.

   Nothing in the world is built, moved or revealed by this module: the
   body is static and pre-placed. What a transition changes is where the
   view is pointing and how far along the path the scroll has come.

   The sim owns *when*; src/pure/transform.js owns the choreography math
   and src/render/transform.js executes it. RIG keeps full control the
   whole time — the only thing the ritual takes away is the scroll. */

import { CONFIG } from '../config.js';
import {
  TRANSFORM_FIXTURE, TRANSFORM_PATH, transformAltAt, transformBandIndexAt,
  transformEventTotalMs, transformFrontierS, transformHaltS, transformScrollOffset,
  transformSealS, transformTriggerS,
} from '../pure/transform.js';
import { traversalFollowTarget } from '../pure/traversal.js';
import { IS_TRANSFORM_SLICE } from '../mode.js';
import { view } from './bridge.js';
import { gameMs, scrollX, setScrollX } from './time.js';
import { EDGE_R } from './edges.js';
import { activeScrollEnd, activeScrollSpeed } from './level.js';

const FIX = TRANSFORM_FIXTURE;
const T = CONFIG.transform;

// idle → armed (scroll halted at the apron) → turning (the ritual) → done
// The d* fields are a DEV-ONLY decision trace (T-002, the t2-transform-seam-rush
// divergence investigation): scalar timestamps/margins written only on the
// frame a precondition or transition first fires, read back through
// transformDecisionTrace() → telemetry. Gameplay reads none of them.
//   dHaltAt    — first frame the scroll had reached the apron (halted true)
//   dTriggerAt — first frame RIG's leading edge had crossed triggerS
//   dArmAt / dStartAt / dFinishAt — the idle→armed / armed→turning / →done frames
// Comparing dHaltAt vs dTriggerAt tells you which precondition arrived LAST —
// i.e. whether the ritual's start frame was bound by the (autonomous) scroll
// halt or by (input-driven) player arrival. -1 = not reached yet.
export const transformEvents = IS_TRANSFORM_SLICE
  ? FIX.events.map((e, i) => ({
      ...e, index: i, state: 'idle', tArm: 0, tStart: 0, scroll0: 0,
      dHaltAt: -1, dTriggerAt: -1, dArmAt: -1, dArmPlayerRight: 0,
      dArmHalted: 0, dArmByLookahead: 0, dStartAt: -1, dStartPlayerRight: 0,
      dStartScroll: 0, dStartTriggerMargin: 0, dPressedFrames: 0, dFinishAt: -1,
    }))
  : [];

export let committedBand = 0;            // which band the world is currently on
export let lastCommit = null;            // { ev, at } — the ritual stinger the HUD reads

export function activeTransformEvent() {
  for (const ev of transformEvents) if (ev.state !== 'done') return ev;
  return null;
}

// A ritual (or its arming halt) owns the scroll: crush damage is suspended
// for the same reason it is at a corner — the damage plane is not advancing.
export function transformBusy() {
  const ev = activeTransformEvent();
  return !!ev && ev.state !== 'idle';
}

export function transformTurning() {
  const ev = activeTransformEvent();
  return !!ev && ev.state === 'turning';
}

// Right clamp: until a ritual has finished, the surface past the threshold
// is around a bend the view has not turned to yet, so the threshold is the
// wall — exactly what the corner ritual does with its pivot column. RIG keeps
// full control inside it; they simply cannot outrun the turn.
export function transformFrontierX() {
  const ev = activeTransformEvent();
  return ev ? transformFrontierS(ev, CONFIG) : Infinity;
}

// Left clamp: the panel sealed behind RIG when the band committed, and the
// band they came from is no longer rendered under their feet.
export function transformSealX() {
  let seal = -Infinity;
  for (const ev of transformEvents)
    if (ev.state === 'done') seal = Math.max(seal, transformSealS(ev, CONFIG));
  return seal;
}

// Rendered altitude at a point on the path: the body climbs, so this is a
// property of WHERE RIG is, not of which transition has fired.
export function transformAltitudeAt(s) { return transformAltAt(TRANSFORM_PATH, s); }

export function transformBandLabel() {
  return FIX.bands[committedBand].label;
}

export function transformBandLabelAt(s) {
  return FIX.bands[transformBandIndexAt(FIX, s)].label;
}

/* --------------------------- scroll + gating ------------------------ *
 * Called from sim/scroll.js (which owns the player reference, so this
 * module stays importable by src/sim/player.js without a cycle). Returns
 * true on the single frame a ritual starts, so the caller can clear the
 * arena the way a corner gate is cleared before its ritual.            */
export function updateTransformScroll(dt, playerRow) {
  const ev = activeTransformEvent();
  const playerRight = playerRow.x + playerRow.hw;
  view.transform.frame(dt * 1000);       // render: weather, and nothing gameplay

  if (ev && ev.state === 'turning') {
    const t = gameMs - ev.tStart;
    // absolute, from the ritual start: the seam pull plus the resume ramp is a
    // closed form, so the world advances the same distance at any frame rate.
    // The event rides along for its (optional) authored seam-pull override —
    // gate geometry, not choreography.
    setScrollX(Math.min(
      ev.scroll0 + transformScrollOffset(t, FIX.run.minimumScrollSpeed, CONFIG, ev),
      activeScrollEnd()
    ));
    view.transform.ritual(ev, t);        // render: the cover and the air, nothing else
    if (t >= transformEventTotalMs(CONFIG)) finishTransform(ev);
    return false;
  }

  let target = activeScrollEnd();
  const trigS = ev ? transformTriggerS(ev, CONFIG) : 0;
  if (ev) {
    // The apron halt is a pause, not a wall: if RIG dawdles at an open
    // bulkhead the pursuing edge comes back and squeezes them into it — but
    // only up to seamS - pressedOffset, so the ritual is always framed.
    const pressed = ev.state === 'armed' && gameMs - ev.tArm >= T.armMaxMs &&
      playerRight < trigS;
    if (pressed) ev.dPressedFrames++;                          // trace only
    target = Math.min(target, pressed ? ev.seamS - T.pressedOffset : transformHaltS(ev, CONFIG));
  }

  const screenLead = Math.max(2, EDGE_R - CONFIG.edges.margin - FIX.run.lookAheadTiles);
  const next = Math.max(
    scrollX + activeScrollSpeed() * dt,
    traversalFollowTarget(scrollX, playerRight, screenLead, FIX.run)
  );
  setScrollX(Math.min(next, target));

  if (!ev) return false;
  const halted = scrollX >= transformHaltS(ev, CONFIG) - 1e-6;
  // decision trace: first frame each start-precondition held. Scroll only
  // ratchets forward while an event is pending, so `halted` is monotone;
  // playerRight is not (RIG can retreat), so dTriggerAt is the FIRST crossing
  // and the start-frame margin below is recorded separately.
  if (ev.dHaltAt < 0 && halted) ev.dHaltAt = gameMs;
  if (ev.dTriggerAt < 0 && playerRight >= trigS) ev.dTriggerAt = gameMs;
  // Armed = the way is open and readable. Whichever happens first: the scroll
  // reaches the apron, or RIG runs ahead of it and arrives at the seam.
  if (ev.state === 'idle' &&
      (halted || playerRight >= ev.seamS - T.armLookahead)) {
    ev.state = 'armed';
    ev.tArm = gameMs;
    ev.dArmAt = gameMs;                                        // trace only
    ev.dArmPlayerRight = playerRight;
    ev.dArmHalted = halted ? 1 : 0;
    ev.dArmByLookahead = playerRight >= ev.seamS - T.armLookahead ? 1 : 0;
    view.transform.armed(ev);
  }
  // …and the ritual itself waits for both: RIG inside the threshold, and the
  // view settled on the apron, so the whole turn happens on screen.
  if (ev.state === 'armed' && halted && playerRight >= trigS) {
    ev.state = 'turning';
    ev.tStart = gameMs;
    ev.scroll0 = scrollX;
    ev.dStartAt = gameMs;                                      // trace only
    ev.dStartPlayerRight = playerRight;
    ev.dStartScroll = scrollX;
    ev.dStartTriggerMargin = playerRight - trigS;
    view.transform.started(ev);
    return true;
  }
  return false;
}

/* Dev-only read surface for the decision trace above (T-002). Allocates a
 * fresh snapshot per call, so it is only ever called from the telemetry
 * channels (src/main.js), never from the frame loop itself. `binding` names
 * the start-precondition that arrived last — 'halt' means the ritual start
 * frame was set by the autonomous scroll reaching the apron, 'player' means
 * it was set by RIG's (input-driven) arrival past triggerS. Caveat: if RIG
 * crosses triggerS, retreats, and recrosses, dTriggerAt keeps the first
 * crossing, so 'player' can be over-attributed in retreat play; the t2 rush
 * under investigation holds right and never retreats.                     */
export function transformDecisionTrace() {
  return transformEvents.map((ev) => ({
    id: ev.id, state: ev.state,
    haltAt: ev.dHaltAt, triggerAt: ev.dTriggerAt,
    armAt: ev.dArmAt, armPlayerRight: ev.dArmPlayerRight,
    armHalted: ev.dArmHalted, armByLookahead: ev.dArmByLookahead,
    startAt: ev.dStartAt, startPlayerRight: ev.dStartPlayerRight,
    startScroll: ev.dStartScroll, startTriggerMargin: ev.dStartTriggerMargin,
    pressedFrames: ev.dPressedFrames, finishAt: ev.dFinishAt,
    binding: ev.dStartAt < 0 ? null
      : ev.dHaltAt >= ev.dTriggerAt ? 'halt' : 'player',
  }));
}

function finishTransform(ev) {
  view.transform.ritual(ev, transformEventTotalMs(CONFIG));   // land every chunk
  ev.state = 'done';
  ev.dFinishAt = gameMs;                                       // trace only
  committedBand = ev.toBand;
  lastCommit = { ev, at: gameMs };
  view.transform.finished(ev);
}

// run reset (resetGame in src/main.js): back to the first surface
export function resetTransform() {
  for (const ev of transformEvents) {
    ev.state = 'idle'; ev.tArm = 0; ev.tStart = 0; ev.scroll0 = 0;
    ev.dHaltAt = -1; ev.dTriggerAt = -1; ev.dArmAt = -1;
    ev.dArmPlayerRight = 0; ev.dArmHalted = 0; ev.dArmByLookahead = 0;
    ev.dStartAt = -1; ev.dStartPlayerRight = 0; ev.dStartScroll = 0;
    ev.dStartTriggerMargin = 0; ev.dPressedFrames = 0; ev.dFinishAt = -1;
  }
  committedBand = 0;
  lastCommit = null;
  view.transform.reset();
}
