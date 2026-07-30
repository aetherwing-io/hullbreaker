/* ========================= TRANSFORMATION ========================= */
/* World-transformation grammar: the rendered surfaces (bands) the 2D
   ribbon is mapped onto, the two discrete rituals that move between them
   (bulkhead flip inward, breach return), and the authored fixture the
   opt-in ?slice=transform demo is built from.

   The simulation never learns about any of this: RIG still runs in
   (s, y). A band is a frame — an origin, a heading and a rendered
   ALTITUDE — and a ritual is a ~1s, two-snap animation of that frame
   (the same chunky grammar as the corner ritual in ./waves.js, which
   this deliberately mirrors: wind-up → snap → ratchet hold → snap →
   settle → scroll eases back in). Altitude is what makes the climb
   perceptible: the frame lifts, the hull RIG left behind stays where it
   was and falls into the fog below.

   Pure: no three.js, no DOM. The harness asserts the whole timeline. */

import { CONFIG } from '../config.js';
import { DEG } from './path.js';
import { easeOutBack } from './waves.js';
import { GAP, buildLevel } from './generator.js';

const clamp01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);

/* ------------------------------ fixture ---------------------------- *
 * Three bands, two rituals: a short exterior run, a bulkhead flip inward
 * onto an interior service corridor, then a breach return onto another
 * exterior face 30 tiles higher. Bands chain: each band's world origin is
 * the previous band's position at the seam, so the seam column is
 * continuous and only heading + altitude change across it.
 *
 * Every ground column in [bounds.x0, bounds.x1) is authored exactly once,
 * seam aprons are flat and platform-free, and the threshold columns after
 * each seam belong to the NEXT band (both bands render them; only one copy
 * is visible at a time, and they are coincident at the frame the ritual
 * fires, so the swap is invisible).                                    */
export const TRANSFORM_FIXTURE = {
  id: 'transform-v1',
  // Face A starts well left of the spawn so the first frame is already a hull
  // face rather than half a screen of void.
  bounds: { x0: 0, x1: 152 },
  origin: { x: 0, z: 0 },
  targetPlaySeconds: { min: 12, max: 30 },
  run: {
    startScroll: 19,
    endScroll: 138,
    minimumScrollSpeed: 3.2,
    followLeadTiles: 16,
    lookAheadTiles: 2.5,
    portraitMinAspect: 0.9,
    playerSpawn: { x: 27.5, y: 3 },
  },
  bands: [
    {
      id: 'hull-face-A', kind: 'exterior', s0: 0, s1: 60, headingDeg: 0, alt: 0,
      label: 'HULL FACE A', shipState: 'INTERCEPT',
      // Atmosphere and material tone are the altitude cues DESIGN asks for.
      // The grey-box palette stays a neutral placeholder, but the hue walk
      // rhymes with the concept board's phase progression: teal-grey lower
      // exterior → warmer compressed interior → cooler open heights.
      atmosphere: { bg: 0x232830, fogNear: 30, fogFar: 74 },
      tone: [1, 1, 1],
      hullDrop: 26,                        // hull mass: runs off the bottom of frame
      hullWall: { height: 20, pattern: 'solid' },   // walled in, low on the ship
      // Silhouettes are authored at ABSOLUTE altitudes, so the climb is
      // readable in a single still: structures loom overhead down here and the
      // same kind of mass lies far below the deck on face C.
      skyline: [
        { atS: 12, top: 21, height: 30, width: 8, depth: -26 },
        { atS: 30, top: 17, height: 26, width: 9, depth: -21 },
        { atS: 44, top: 25, height: 34, width: 7, depth: -29 },
        { atS: 56, top: 13, height: 22, width: 11, depth: -24 },
      ],
    },
    {
      id: 'service-corridor', kind: 'interior', s0: 60, s1: 106, headingDeg: 90, alt: 6,
      label: 'SERVICE CORRIDOR', shipState: 'CONTAIN',
      atmosphere: { bg: 0x241e26, fogNear: 14, fogFar: 42 },
      // brighter as well as warmer: an interior lit by its own machinery, and
      // a deck that still reads as the brightest thing on screen
      tone: [1.26, 1.12, 1.18],
      interior: { ceilingAbove: 10, wallDepth: -3.6, ribEvery: 7, alcoveEvery: 5, pipeEvery: 9 },
      skyline: [],
    },
    {
      id: 'hull-face-C', kind: 'exterior', s0: 106, s1: 152, headingDeg: 180, alt: 36,
      label: 'HULL FACE C', shipState: 'QUARANTINE',
      atmosphere: { bg: 0x2d3a4a, fogNear: 26, fogFar: 70 },
      tone: [1.02, 1.09, 1.22],            // thinner, cooler air at altitude
      hullDrop: 40,                        // a far longer wall dropping away below
      // open sky between hull towers instead of a continuous skin: up here the
      // ship stops enclosing RIG, and the gaps are where the drop shows
      hullWall: { height: 22, pattern: 'towers' },
      // The structures that towered over face A are roofs in the fog beneath
      // RIG here — authored inside the strip the camera can actually see below
      // the deck, so the drop reads in a single still instead of off-screen.
      skyline: [
        { atS: 109, top: 33, height: 26, width: 10, depth: -16, below: true },
        { atS: 117, top: 30, height: 24, width: 13, depth: -23, below: true },
        { atS: 126, top: 32, height: 30, width: 9, depth: -18, below: true },
        { atS: 134, top: 30, height: 22, width: 14, depth: -26, below: true },
        { atS: 145, top: 33, height: 26, width: 10, depth: -20, below: true },
      ],
    },
  ],
  events: [
    {
      id: 'bulkhead-flip', kind: 'flip', seamS: 60, fromBand: 0, toBand: 1,
      armMsg: 'BULKHEAD OPEN — GO IN', label: 'BULKHEAD FLIP',
    },
    {
      id: 'breach-return', kind: 'breach', seamS: 106, fromBand: 1, toBand: 2,
      armMsg: 'HULL PANEL AHEAD — PUSH THROUGH', label: 'BREACH RETURN',
    },
  ],
  groundRuns: [
    { x0: 0, x1: 24, y: 3 },               // approach: the hull face already under RIG
    { x0: 24, x1: 34, y: 3 },
    { x0: 34, x1: 36, gap: true },
    { x0: 36, x1: 44, y: 3 },
    { x0: 44, x1: 48, y: 4 },
    { x0: 48, x1: 50, gap: true },
    { x0: 50, x1: 60, y: 3 },              // flip apron (flat through the seam)
    { x0: 60, x1: 66, y: 3 },              // door threshold: rendered by both bands
    { x0: 66, x1: 72, y: 3 },
    { x0: 72, x1: 74, gap: true },         // service pit, under a ceiling
    { x0: 74, x1: 82, y: 4 },
    { x0: 82, x1: 84, gap: true },
    { x0: 84, x1: 92, y: 3 },
    { x0: 92, x1: 99, y: 4 },
    { x0: 99, x1: 106, y: 3 },             // breach apron
    { x0: 106, x1: 112, y: 3 },            // breach threshold
    { x0: 112, x1: 120, y: 3 },
    { x0: 120, x1: 122, gap: true },
    { x0: 122, x1: 130, y: 4 },
    { x0: 130, x1: 132, gap: true },
    { x0: 132, x1: 140, y: 3 },
    { x0: 140, x1: 152, y: 4 },
  ],
  platforms: [
    { id: 'a-lower', x0: 27, x1: 33, y: 5.35 },
    { id: 'a-mid', x0: 37, x1: 43, y: 5.35 },
    { id: 'a-high', x0: 39, x1: 44, y: 8.35 },
    { id: 'i-walk-1', x0: 67, x1: 73, y: 5.35 },
    { id: 'i-walk-2', x0: 85, x1: 92, y: 5.35 },
    { id: 'i-walk-3', x0: 87, x1: 93, y: 8.35 },
    { id: 'c-walk-1', x0: 113, x1: 119, y: 5.35 },
    { id: 'c-walk-2', x0: 124, x1: 130, y: 6.35 },
    { id: 'c-walk-3', x0: 134, x1: 141, y: 5.35 },
  ],
  // Ambient wasps only, and never inside a seam-clear zone: this slice
  // proves the transformation, not interior combat. ?enemies=0 empties it.
  spawns: [
    { x: 41, type: 'wasp', lane: 4.6 },
    { x: 48, type: 'wasp', lane: 6.4 },
    { x: 78, type: 'wasp', lane: 4.0 },
    { x: 93, type: 'wasp', lane: 5.2 },
    { x: 122, type: 'wasp', lane: 4.6 },
    { x: 138, type: 'wasp', lane: 6.4 },
  ],
  spawnClear: { before: 10, after: 12 },
  finish: { x0: 146, x1: 152 },
};

/* ------------------------------ frames ----------------------------- */

// Chain the authored bands into world frames. Band k+1's origin is band k's
// position at the seam, so a seam is continuous in position: only heading
// and altitude step across it, which is exactly what a ritual animates.
export function buildTransformFrames(fixture) {
  const out = [];
  for (let i = 0; i < fixture.bands.length; i++) {
    const b = fixture.bands[i];
    let x = fixture.origin.x, z = fixture.origin.z;
    if (i > 0) {
      const p = out[i - 1];
      const d = b.s0 - p.s0;
      x = p.x + Math.cos(p.heading) * d;
      z = p.z - Math.sin(p.heading) * d;
    }
    out.push({
      index: i, id: b.id, kind: b.kind, s0: b.s0, s1: b.s1,
      x, z, heading: b.headingDeg * DEG, alt: b.alt, band: b,
    });
  }
  return out;
}

export const TRANSFORM_FRAMES = buildTransformFrames(TRANSFORM_FIXTURE);

export function transformBandIndexAt(frames, s) {
  for (let i = frames.length - 1; i >= 0; i--) if (s >= frames[i].s0) return i;
  return 0;
}

// (s → world) inside one frame. `ctx` is {s0, x, z, heading, alt}: either a
// static band frame or the animated frame of a running ritual, so every
// caller — camera, rig, hostiles, bullets, the threshold plate — maps
// through one function and can never disagree about where the world is.
export function transformPosAt(ctx, s, out = { x: 0, z: 0 }) {
  const d = s - ctx.s0;
  out.x = ctx.x + Math.cos(ctx.heading) * d;
  out.z = ctx.z - Math.sin(ctx.heading) * d;
  return out;
}

export function transformFrameCtx(frame, out = {}) {
  out.s0 = frame.s0; out.x = frame.x; out.z = frame.z;
  out.heading = frame.heading; out.alt = frame.alt;
  out.kind = frame.kind; out.band = frame.index;
  return out;
}

/* ---------------------------- timeline ----------------------------- *
 * Event-local ms (t = gameMs - tStart), same shape as the corner ritual. */

export function transformTimeline(cfg) {
  const T = cfg.transform;
  const t1 = T.windUpMs;                   // latch jolt / counter-rotation ends
  const t2 = t1 + T.snap1Ms;               // snap 1 impact frame
  const t3 = t2 + T.holdMs;                // ratchet hold ends
  const t4 = t3 + T.snap2Ms;               // snap 2 lands: the surface has committed
  const t5 = t4 + T.settleMs;              // settle ends, scroll resumes
  const t6 = t5 + T.resumeMs;              // event done
  return { t1, t2, t3, t4, t5, t6 };
}

export function transformEventTotalMs(cfg) { return transformTimeline(cfg).t6; }

// yaw delta (degrees) over the ritual: 0 → windUpDeg → 45 → hold → 90
export function transformYawDeltaDeg(tMs, cfg) {
  const T = cfg.transform;
  const TL = transformTimeline(cfg);
  const snap = T.snapDeg;
  if (tMs <= 0) return 0;
  if (tMs < TL.t1) { const u = tMs / T.windUpMs; return T.windUpDeg * u * u; }
  if (tMs < TL.t2) {
    const u = (tMs - TL.t1) / T.snap1Ms;
    return T.windUpDeg + (snap - T.windUpDeg) * easeOutBack(u, T.backS);
  }
  if (tMs < TL.t3) return snap;
  if (tMs < TL.t4) {
    const u = (tMs - TL.t3) / T.snap2Ms;
    return snap + snap * easeOutBack(u, T.backS);
  }
  return snap * 2;
}

// altitude delta (tiles) over the ritual: the deck drops a hair, then the
// world ratchets up in the same two beats as the yaw — snap 1 takes
// altStep1 of the gain, snap 2 takes the rest. Discrete, not a lift ride.
export function transformAltDelta(tMs, gain, cfg) {
  const T = cfg.transform;
  const TL = transformTimeline(cfg);
  const pre = -T.altPreloadTiles;
  const step1 = gain * T.altStep1;
  if (tMs <= 0) return 0;
  if (tMs < TL.t1) { const u = tMs / T.windUpMs; return pre * u * u; }
  if (tMs < TL.t2) {
    const u = (tMs - TL.t1) / T.snap1Ms;
    return pre + (step1 - pre) * easeOutBack(u, T.altBackS);
  }
  if (tMs < TL.t3) return step1;
  if (tMs < TL.t4) {
    const u = (tMs - TL.t3) / T.snap2Ms;
    return step1 + (gain - step1) * easeOutBack(u, T.altBackS);
  }
  return gain;
}

// scroll velocity after a ritual: the same quadratic ease back in the corner
// ritual uses (the fixture floor speed, not the six-face scroll).
export function transformScrollVel(tMs, speed, cfg) {
  const TL = transformTimeline(cfg);
  if (tMs < TL.t5) return 0;
  const u = clamp01((tMs - TL.t5) / cfg.transform.resumeMs);
  return speed * u * u;
}

// Seam pull: on the second snap the ship carries the view THROUGH the seam,
// so a ritual ends with the camera on the new surface instead of hanging
// outside the door it just opened. Frozen through the wind-up, snap 1 and the
// ratchet hold — the pull is part of the second clack, not a dolly move.
export function transformSeamPull(tMs, cfg) {
  const T = cfg.transform;
  const TL = transformTimeline(cfg);
  if (tMs <= TL.t3) return 0;
  if (tMs >= TL.t5) return T.seamPullTiles;
  const u = (tMs - TL.t3) / (TL.t5 - TL.t3);
  return T.seamPullTiles * (1 - (1 - u) * (1 - u) * (1 - u));
}

// Total scroll advance since a ritual started: the seam pull, then the closed
// form of the resume ramp (∫ speed·u² dt). Closed form rather than integrated
// per frame, so a ritual advances the world by exactly the same distance at
// any frame rate.
export function transformScrollOffset(tMs, speed, cfg) {
  const TL = transformTimeline(cfg);
  const pull = transformSeamPull(tMs, cfg);
  if (tMs <= TL.t5) return pull;
  const u = clamp01((tMs - TL.t5) / cfg.transform.resumeMs);
  return pull + speed * (cfg.transform.resumeMs / 1000) * (u * u * u) / 3;
}

// The animated frame of a running ritual. At t ≤ 0 it is the FROM band
// extended past the seam (what RIG is standing on when the ritual fires);
// at t ≥ t4 it is exactly the TO band's frame. Position rotates about the
// seam point, which both frames share.
export function transformEventCtx(frames, ev, tMs, cfg, out = {}) {
  const from = frames[ev.fromBand];
  const to = frames[ev.toBand];
  const yaw = transformYawDeltaDeg(tMs, cfg) * DEG * (to.heading >= from.heading ? 1 : -1);
  out.s0 = ev.seamS;
  out.x = to.x; out.z = to.z;                    // the shared seam point
  out.heading = from.heading + yaw;
  out.alt = from.alt + transformAltDelta(tMs, to.alt - from.alt, cfg);
  out.kind = from.kind;
  out.band = from.index;
  return out;
}

// Door leaf / blown panel motion. `open` is chunky by construction: it
// tracks the yaw snaps, so the panel clacks with the world.
export function transformPanelState(tMs, ev, cfg, out = {}) {
  const T = cfg.transform;
  const TL = transformTimeline(cfg);
  out.visible = tMs < TL.t6;
  out.jolt = 0; out.open = 0; out.blow = 0; out.spin = 0;
  if (tMs <= 0) return out;
  if (tMs < TL.t1) { out.jolt = T.panelJoltTiles * (tMs / T.windUpMs); return out; }
  out.jolt = T.panelJoltTiles;
  out.open = clamp01(transformYawDeltaDeg(tMs, cfg) / (2 * T.snapDeg));
  if (ev.kind === 'breach') {
    const u = clamp01((tMs - TL.t1) / T.panelBlowMs);
    const e = 1 - (1 - u) * (1 - u);
    out.blow = T.panelBlowTiles * e;
    out.spin = T.panelSpinTurns * 2 * Math.PI * e;
  }
  return out;
}

// The next band slams in near-to-far while the ritual turns — the corner
// ritual's brick zipper, one chunk at a time — and every chunk is locked
// before the scroll resumes.
export function bandSlamOffset(tMs, chunkIdx, cfg) {
  const T = cfg.transform;
  const local = tMs - (T.slamStartMs + chunkIdx * T.slamPerColMs);
  if (local < 0) return { phase: 'hidden', dy: 0 };
  if (local < T.slamDropMs) {
    const u = local / T.slamDropMs;
    return { phase: 'drop', dy: T.slamDropTiles * (1 - u * u) };
  }
  if (local < T.slamDropMs + T.slamDipMs) return { phase: 'dip', dy: -T.slamDipTiles };
  return { phase: 'locked', dy: 0 };
}

export function bandSlamLockMs(cfg) {           // last chunk settles at this t
  const T = cfg.transform;
  return T.slamStartMs + (T.slamChunks - 1) * T.slamPerColMs + T.slamDropMs + T.slamDipMs;
}

// Atmosphere cross-fade: fog band and background move with the surface, so
// stepping inside compresses the sightlines and coming out high opens them.
export function transformAtmosphereMix(tMs, cfg) {
  const TL = transformTimeline(cfg);
  return clamp01((tMs - TL.t1) / (TL.t4 - TL.t1));
}

/* --------------------------- gate geometry ------------------------- */

export function transformHaltS(ev, cfg) { return ev.seamS - cfg.transform.haltOffset; }
export function transformTriggerS(ev, cfg) { return ev.seamS + cfg.transform.triggerOffset; }
// While the next band is unbuilt the threshold's far edge is the wall —
// the corner ritual's "pivot is the wall" rule, one seam later.
export function transformFrontierS(ev, cfg) {
  return ev.seamS + cfg.transform.thresholdTiles - cfg.transform.clampMargin;
}
// Once a band commits, the panel has sealed behind RIG: the previous band's
// columns are no longer rendered under their feet, so they cannot be walked.
export function transformSealS(ev, cfg) { return ev.seamS + cfg.transform.sealInset; }

/* ------------------------------- level ----------------------------- */

// Same overlay contract as the traversal fixture: the seeded generator
// still authors everything outside the fixture bounds (nothing renders
// there in this slice), and the fixture owns every column inside them.
export function buildTransformLevel(cfg) {
  const base = buildLevel(cfg);
  const B = TRANSFORM_FIXTURE.bounds;
  for (const run of TRANSFORM_FIXTURE.groundRuns)
    for (let x = run.x0; x < run.x1; x++) base.groundH[x] = run.gap ? GAP : run.y;
  const platforms = base.platforms.filter((p) => p.x1 <= B.x0 || p.x0 >= B.x1);
  for (const p of TRANSFORM_FIXTURE.platforms) platforms.push({ ...p });
  return {
    groundH: base.groundH,
    platforms,
    solidRects: [],
    chunkLog: base.chunkLog.concat(TRANSFORM_FIXTURE.id),
    fixture: TRANSFORM_FIXTURE,
  };
}
