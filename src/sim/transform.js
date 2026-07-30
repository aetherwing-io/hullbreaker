/* ==================== TRANSFORMATION: RUNTIME ===================== */
/* The gate runtime for the world transformations, mirroring the corner
   ritual in ./wavegate.js one level up: the scroll halts at the seam
   apron, RIG walking into the threshold fires the ritual, the ritual
   freezes the scroll while the next surface slams in, and then the scroll
   eases back. Only ?slice=transform arms any of it.

   The sim owns *when*; src/pure/transform.js owns the choreography math
   and src/render/transform.js executes it. RIG keeps full control the
   whole time — the only thing the ritual takes away is the scroll. */

import { CONFIG } from '../config.js';
import {
  TRANSFORM_FIXTURE, TRANSFORM_FRAMES, transformEventTotalMs, transformFrontierS,
  transformHaltS, transformScrollOffset, transformSealS, transformTriggerS,
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
export const transformEvents = IS_TRANSFORM_SLICE
  ? FIX.events.map((e, i) => ({ ...e, index: i, state: 'idle', tArm: 0, tStart: 0, scroll0: 0 }))
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
// either does not exist yet or is still mid-slam, so the threshold is the
// wall — exactly what the corner ritual does with its pivot column. RIG keeps
// full control inside it; they simply cannot outrun the transformation.
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

export function transformAltitude() {    // rendered altitude of the current surface
  return TRANSFORM_FRAMES[committedBand].alt;
}

export function transformBandLabel() {
  return TRANSFORM_FRAMES[committedBand].band.label;
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
    // closed form, so the world advances the same distance at any frame rate
    setScrollX(Math.min(
      ev.scroll0 + transformScrollOffset(t, FIX.run.minimumScrollSpeed, CONFIG),
      activeScrollEnd()
    ));
    view.transform.ritual(ev, t);        // render: panels, slam chunks, atmosphere
    if (t >= transformEventTotalMs(CONFIG)) finishTransform(ev);
    return false;
  }

  let target = activeScrollEnd();
  if (ev) {
    // The apron halt is a pause, not a wall: if RIG dawdles at an open
    // bulkhead the pursuing edge comes back and squeezes them into it — but
    // only up to seamS - pressedOffset, so the ritual is always framed.
    const pressed = ev.state === 'armed' && gameMs - ev.tArm >= T.armMaxMs &&
      playerRight < transformTriggerS(ev, CONFIG);
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
  // Armed = the way is open and readable. Whichever happens first: the scroll
  // reaches the apron, or RIG runs ahead of it and arrives at the seam.
  if (ev.state === 'idle' &&
      (halted || playerRight >= ev.seamS - T.armLookahead)) {
    ev.state = 'armed';
    ev.tArm = gameMs;
    view.transform.armed(ev);
  }
  // …and the ritual itself waits for both: RIG inside the threshold, and the
  // view settled on the apron, so the whole turn happens on screen.
  if (ev.state === 'armed' && halted && playerRight >= transformTriggerS(ev, CONFIG)) {
    ev.state = 'turning';
    ev.tStart = gameMs;
    ev.scroll0 = scrollX;
    view.transform.started(ev);
    return true;
  }
  return false;
}

function finishTransform(ev) {
  view.transform.ritual(ev, transformEventTotalMs(CONFIG));   // land every chunk
  ev.state = 'done';
  committedBand = ev.toBand;
  lastCommit = { ev, at: gameMs };
  view.transform.finished(ev);
}

// run reset (resetGame in src/main.js): back to the first surface
export function resetTransform() {
  for (const ev of transformEvents) {
    ev.state = 'idle'; ev.tArm = 0; ev.tStart = 0; ev.scroll0 = 0;
  }
  committedBand = 0;
  lastCommit = null;
  view.transform.reset();
}
