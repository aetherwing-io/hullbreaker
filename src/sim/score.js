/* ============================= SCORE ============================== */
/* The sim half of the CHARGE/THREAT prototype (proposal A.4), armed by
   ?score=1 and completely inert otherwise. It owns three things:

     1. the meter — CHARGE, stepped from the pure tables in src/pure/score.js
        and fed only from existing decision sites (kills, launches, contacts,
        pickups, the crush edge). A.5's rule: events are emitted, never polled.
     2. the event stream — A.5's exact event names and envelope, capped at
        CONFIG.score.eventCap, published through HB.score.events.
     3. the BREAKING launch shock — armed here on a launch, consumed by
        sim/hostiles.js in the same frame, so neither module imports the other.

   No module here reaches back into the player or the hostile list: every
   caller passes what it already has. That keeps the import graph acyclic and
   the meter reproducible from the event log alone.                        */

import { CONFIG } from '../config.js';
import { ACTIVE_SLICE, SCORE_ENABLED } from '../mode.js';
import {
  scoreApplyGain, scoreClassification, scoreConnectorAt, scoreDrainPerSec,
  scoreFireRateMult, scoreNotch, scoreRoutesCompleted, scoreStep, scoreThreatGain,
} from '../pure/score.js';
import { gameMs, sliceStats } from './time.js';

const SC = CONFIG.score;
const POCKET = ACTIVE_SLICE ? ACTIVE_SLICE.darePocket : null;

// A.5's ring buffer: newest last, oldest dropped, cap CONFIG.score.eventCap.
export const scoreEvents = [];

const COUNT_KEYS = [
  'airborne_kill', 'launch_kill', 'link', 'reclaim', 'wager', 'recatch',
  'ground_kill',   // not in A.5's table; A.3's gain rows need a name for it
];

function freshCounts() {
  const c = {};
  for (const k of COUNT_KEYS) c[k] = 0;
  return c;
}

let counts = freshCounts();
const st = {
  charge: 0, threat: 0, chargeFloor: 0,
  airMs: 0, groundMs: 0, stallMs: 0, hotMs: 0, playMs: 0,
  stallAcc: 0, launchCount: 0,
  lastLaunch: null,          // { kind, at, y, linked }
  lowMarginAt: 0, lowMargin: Infinity,
  rewardHeld: false, wagerDone: false,
  visited: [],               // connector ids in visit order (A.5 route coverage)
  shock: null,               // BREAKING launch shock awaiting sim/hostiles.js
};

export function scoreEnabled() { return SCORE_ENABLED; }
export function scoreCharge() { return st.charge; }
export function scoreNotchNow() { return SCORE_ENABLED ? scoreNotch(st.charge) : 0; }
export function scoreThreat() { return st.threat; }
// setbacks have exactly one owner (sliceStats, written by the fallback path)
export function scoreSetbacks() { return sliceStats.setbacks; }

// the only hook the weapon path needs: WARM and above shortens the interval
export function scoreFireMult() {
  return SCORE_ENABLED ? scoreFireRateMult(scoreNotch(st.charge)) : 1;
}

function push(type, extra, gains) {
  const notch = scoreNotch(st.charge);
  if (gains) {
    st.threat += scoreThreatGain(type, notch);
    st.charge = scoreApplyGain(st.charge, type);
  }
  if (counts[type] !== undefined) counts[type]++;
  scoreEvents.push({ t: gameMs, notch, type, ...extra });
  if (scoreEvents.length > SC.eventCap) scoreEvents.shift();
}

/* ------------------------- emission call sites ----------------------- */

// sim/hostiles.js, on the single death path. One event per death: pierce and
// GHOST SQUAD cannot double-count because hitHostile removes the row here.
// ORBITAL LANCE kills score as ground kills whatever the player was doing,
// or the optimal play becomes "collect OL, then jump" (A.3 anti-degenerate).
export function scoreKill(kind, weapon, ctx) {
  if (!SCORE_ENABLED) return;
  const lance = weapon === 'OL';
  const airborne = !lance && !ctx.grounded;
  push(airborne ? 'airborne_kill' : 'ground_kill', {
    x: ctx.x, y: ctx.y, kind, weapon, vy: ctx.vy,
  }, true);
  const l = st.lastLaunch;
  if (!lance && l && gameMs - l.at <= SC.launchGraceMs) {
    push('launch_kill', { x: ctx.x, y: ctx.y, kind, weapon, launch: l.kind }, true);
  }
}

// sim/player.js, at the launch branches that already exist. 'ledge' | 'wall'
// are traversal contacts; 'air' is the air jump (it arms launch_kill but can
// never produce a `link` — hanging or hopping in place must pay nothing).
export function scoreLaunch(kind, x, y) {
  if (!SCORE_ENABLED) return;
  st.launchCount++;
  st.lastLaunch = { kind, at: gameMs, y, linked: false };
  if (scoreNotch(st.charge) >= SC.notches.length) st.shock = { x, y, at: gameMs };
}

// sim/player.js, when a launch resolves into a landing or another contact.
// A.1: a link only counts when the grab went somewhere (>= linkDropTiles).
export function scoreContact(y, verb) {
  if (!SCORE_ENABLED) return;
  const l = st.lastLaunch;
  if (!l || l.linked || (l.kind !== 'ledge' && l.kind !== 'wall')) return;
  const dy = y - l.y;
  if (Math.abs(dy) < SC.linkDropTiles) return;
  l.linked = true;
  push('link', { x: 0, y, dy: Math.round(dy * 100) / 100, verb: verb || l.kind }, true);
}

// sim/hostiles.js consumes this in the same frame the launch happened.
export function consumeLaunchShock() {
  const s = st.shock;
  st.shock = null;
  return s;
}

// sim/capsules.js: the authored dare reward, and the classic pop recatch.
export function scoreRewardTaken(letter, x, y) {
  if (!SCORE_ENABLED) return;
  if (POCKET && letter === POCKET.reward.letter) st.rewardHeld = true;
  scoreEvents.push({ t: gameMs, notch: scoreNotch(st.charge), type: 'reward', letter, x, y });
  if (scoreEvents.length > SC.eventCap) scoreEvents.shift();
}

export function scoreRecatch(letter, msLeft, x, y) {
  if (!SCORE_ENABLED) return;
  push('recatch', { x, y, letter, msLeft: Math.round(msLeft) }, true);
}

// sim/player.js: HULL FALLBACK. A setback pays nothing and drops CHARGE to the
// phase floor (proposal B.1's score interaction) — the recovery is where the
// points are, not the fall.
export function scoreSetback(kind, y0, y1) {
  if (!SCORE_ENABLED) return;
  st.charge = st.chargeFloor;
  push('setback', { kind, phase: 0, y0, y1, x: 0 }, false);
}

export function scoreRunStart(seed, slice, mode) {
  if (!SCORE_ENABLED) return;
  push('run_start', { seed, slice, mode, x: 0, y: 0 }, false);
}

export function scoreRunEnd(reason) {
  if (!SCORE_ENABLED) return;
  push('run_end', {
    reason, threat: Math.round(st.threat),
    classification: scoreClassification(st.threat), ms: Math.round(st.playMs),
    x: 0, y: 0,
  }, false);
}

/* ----------------------------- the step ------------------------------ */
/* ctx: { grounded, vx, traversalState, x, y, margin, weapon }, all values the
   caller already has. dt is real seconds — CHRONO must not inflate CHARGE
   (A.3 anti-degenerate), and the main loop passes the unscaled dt.        */
export function updateScore(dt, ctx) {
  if (!SCORE_ENABLED) return;
  const ms = dt * 1000;
  const traversal = ctx.traversalState !== 'free';
  const launchGrace = !!st.lastLaunch && gameMs - st.lastLaunch.at <= SC.launchGraceMs;
  st.playMs += ms;
  if (ctx.grounded) st.groundMs += ms; else st.airMs += ms;
  if (scoreNotch(st.charge) >= 1) st.hotMs += ms;

  const stalled = ctx.grounded && !traversal && Math.abs(ctx.vx) < SC.stallSpeed;
  st.charge = scoreStep(
    st.charge,
    scoreDrainPerSec({ grounded: ctx.grounded, traversal, launchGrace, vx: ctx.vx }),
    dt,
    st.chargeFloor,
  );

  // stall_tick is the only negative signal, and it never subtracts from THREAT
  if (stalled) {
    st.stallMs += ms;
    st.stallAcc += ms;
    while (st.stallAcc >= SC.stallTickMs) {
      st.stallAcc -= SC.stallTickMs;
      push('stall_tick', { x: ctx.x, y: ctx.y, ms: SC.stallTickMs }, false);
    }
  } else {
    st.stallAcc = 0;
  }

  // reclaim: the margin has to be crossed downward first, so it can never fire
  // from the natural start-of-face position (A.3 anti-degenerate)
  const R = SC.reclaim;
  if (ctx.margin <= R.lowTiles) {
    st.lowMarginAt = gameMs;
    st.lowMargin = Math.min(st.lowMargin, ctx.margin);
  } else if (st.lowMarginAt) {
    const elapsed = gameMs - st.lowMarginAt;
    if (elapsed > R.windowMs) { st.lowMarginAt = 0; st.lowMargin = Infinity; }
    else if (ctx.margin >= R.highTiles) {
      push('reclaim', {
        x: ctx.x, y: ctx.y,
        lowMargin: Math.round(st.lowMargin * 100) / 100, ms: Math.round(elapsed),
      }, true);
      st.lowMarginAt = 0; st.lowMargin = Infinity;
    }
  }

  // wager: the pickup alone pays nothing — you have to get out with daylight
  if (POCKET && st.rewardHeld && !st.wagerDone && ctx.x < POCKET.bounds.x0 &&
      ctx.margin > POCKET.timing.minExitMarginTiles) {
    st.wagerDone = true;
    push('wager', {
      x: ctx.x, y: ctx.y, letter: POCKET.reward.letter,
      exitMargin: Math.round(ctx.margin * 100) / 100,
    }, true);
  }

  // route coverage: connector visits in order, deduped
  if (ACTIVE_SLICE) {
    const id = scoreConnectorAt(ACTIVE_SLICE.connectors, ctx.x, ctx.y, SC.routeRadiusTiles);
    if (id && st.visited[st.visited.length - 1] !== id) st.visited.push(id);
  }
}

/* ------------------------- the A.5 read surface ---------------------- */
export function scoreSnapshot() {
  const notch = scoreNotch(st.charge);
  return {
    enabled: SCORE_ENABLED,
    charge: Math.round(st.charge * 100) / 100,
    notch,
    notchName: SC.notchNames[Math.min(notch, SC.notchNames.length - 1)],
    chargeFloor: st.chargeFloor,
    threat: Math.round(st.threat),
    classification: scoreClassification(st.threat),
    counts: { ...counts },
    airMs: Math.round(st.airMs),
    groundMs: Math.round(st.groundMs),
    stallMs: Math.round(st.stallMs),
    hotMs: Math.round(st.hotMs),
    playMs: Math.round(st.playMs),
    launchCount: st.launchCount,
    minEdgeMargin: Number.isFinite(sliceStats.minEdgeMargin)
      ? Math.round(sliceStats.minEdgeMargin * 1000) / 1000
      : null,
    routeIds: ACTIVE_SLICE
      ? scoreRoutesCompleted(ACTIVE_SLICE.routes, st.visited)
      : [],
    setbacks: sliceStats.setbacks,
    events: scoreEvents.length,
  };
}

// run reset (resetGame in src/main.js); the harness may assert it
export function resetScore() {
  scoreEvents.length = 0;
  counts = freshCounts();
  st.charge = st.chargeFloor;
  st.threat = 0;
  st.airMs = 0; st.groundMs = 0; st.stallMs = 0; st.hotMs = 0; st.playMs = 0;
  st.stallAcc = 0; st.launchCount = 0;
  st.lastLaunch = null;
  st.lowMarginAt = 0; st.lowMargin = Infinity;
  st.rewardHeld = false; st.wagerDone = false;
  st.visited.length = 0;
  st.shock = null;
}
