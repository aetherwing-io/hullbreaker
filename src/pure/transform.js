/* ========================= TRANSITIONS ============================= */
/* The grammar for moving between stretches of the world: the static path
   the 2D ribbon is mapped onto, the two turns along it (flip inward,
   breach out), and the authored fixture the opt-in ?slice=transform demo
   is built from.

   The simulation never learns about any of this: RIG still runs in (s, y).
   The world is ONE STATIC BODY — a bent path with an altitude profile,
   baked once. Nothing assembles, slams or rotates into place: the next
   stretch was always there, hidden around the bend of the limb and behind
   the fog. A turn is the VIEW swinging through that bend on the corner
   ritual's two-snap detent curve (./waves.js) while RIG runs the chamfer
   under their own power. Altitude is *earned*: the inner passage climbs,
   so RIG ascends the body by running and jumping up it.

   Pure: no three.js, no DOM. The harness asserts the whole timeline. */

import { CONFIG } from '../config.js';
import { DEG } from './path.js';
import { easeOutBack } from './waves.js';
import { GAP, buildLevel } from './generator.js';

const clamp01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);

/* ------------------------------ fixture ---------------------------- *
 * Three stretches of one body, two turns: an outer face, a flip inward
 * through an opening onto an inner passage that CLIMBS, then a breach back
 * out onto an outer face 36 tiles higher. The path is chamfered at each
 * seam exactly like the six-face tower's corners, so position and altitude
 * stay continuous and only the heading steps — which is what the view
 * swings through.
 *
 * Every ground column in [bounds.x0, bounds.x1) is authored exactly once,
 * and seam aprons are flat and platform-free so a turn never happens over
 * a gap or a step.                                                     */
export const TRANSFORM_FIXTURE = {
  id: 'transform-v1',
  // Face A starts well left of the spawn so the first frame is already a hull
  // face rather than half a screen of void.
  bounds: { x0: 0, x1: 152 },
  origin: { x: 0, z: 0 },
  // The climb, as geometry rather than as an event: flat along the outer face,
  // then a readable grade from the lip of the opening to the vent it comes back
  // out of, flat again up high. RIG gains every tile of it under their own
  // power — the grade with their legs, and another six tiles by jumping the
  // passage's rising decks (see groundRuns). Nothing lifts them.
  altitudeProfile: [
    { s: 0, alt: 0 }, { s: 59, alt: 0 }, { s: 107, alt: 20 }, { s: 152, alt: 20 },
  ],
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
      id: 'outer-face-a', kind: 'exterior', s0: 0, s1: 60, headingDeg: 0,
      label: 'OUTER FACE A', shipState: 'INTERCEPT',
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
      id: 'inner-passage', kind: 'interior', s0: 60, s1: 106, headingDeg: 90,
      label: 'INNER PASSAGE', shipState: 'CONTAIN',
      atmosphere: { bg: 0x241e26, fogNear: 14, fogFar: 42 },
      // brighter as well as warmer: an interior lit by its own machinery, and
      // a deck that still reads as the brightest thing on screen
      tone: [1.26, 1.12, 1.18],
      interior: { ceilingAbove: 10, wallDepth: -3.6, ribEvery: 7, alcoveEvery: 5, pipeEvery: 9 },
      skyline: [],
      // Mounts the interior's own vocabulary will hang off once the roster
      // exists (polyp emplacements on the wall, hazard tanks on the deck).
      // This slice renders the plinths and leaves them empty: it proves the
      // transformation, and interior threats belong to the combat lane.
      threatSockets: [
        { id: 'polyp-mid', kind: 'polyp', x: 76, y: 8.4, depth: -2.4 },
        { id: 'polyp-high', kind: 'polyp', x: 96, y: 11.4, depth: -2.4 },
        { id: 'hazard-pit', kind: 'hazard', x: 88, y: 6, depth: -1.2 },
        { id: 'hazard-shelf', kind: 'hazard', x: 94, y: 7, depth: -1.2 },
      ],
    },
    {
      id: 'outer-face-c', kind: 'exterior', s0: 106, s1: 152, headingDeg: 180,
      label: 'OUTER FACE C', shipState: 'QUARANTINE',
      atmosphere: { bg: 0x2d3a4a, fogNear: 26, fogFar: 70 },
      tone: [1.02, 1.09, 1.22],            // thinner, cooler air at altitude
      hullDrop: 40,                        // a far longer wall dropping away below
      // Weather is the loudest altitude cue the concept board uses: the high
      // face is told through driving rain, not just through geometry.
      weather: { count: 260, speed: 30, drift: -4.5, length: 1.7, spanY: 34, spanZ: 22 },
      // open sky between hull towers instead of a continuous skin: up here the
      // ship stops enclosing RIG, and the gaps are where the drop shows
      hullWall: { height: 22, pattern: 'towers' },
      // The structures that towered over face A are roofs in the fog beneath
      // RIG here — authored inside the strip the camera can actually see below
      // the deck, so the drop reads in a single still instead of off-screen.
      skyline: [
        { atS: 109, top: 21, height: 26, width: 10, depth: -16, below: true },
        { atS: 117, top: 19, height: 24, width: 13, depth: -23, below: true },
        { atS: 126, top: 20, height: 30, width: 9, depth: -18, below: true },
        { atS: 134, top: 18, height: 22, width: 14, depth: -26, below: true },
        { atS: 145, top: 21, height: 26, width: 10, depth: -20, below: true },
      ],
    },
  ],
  events: [
    {
      id: 'bulkhead-flip', kind: 'flip', seamS: 60, fromBand: 0, toBand: 1,
      armMsg: 'PANEL OPEN — GO IN', label: 'FLIP INWARD',
    },
    {
      id: 'breach-return', kind: 'breach', seamS: 106, fromBand: 1, toBand: 2,
      armMsg: 'PANEL AHEAD — PUSH THROUGH', label: 'BREACH OUT',
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
    { x0: 60, x1: 66, y: 3 },              // the way in: flat through the turn
    // inside, the decks climb too: six one-tile steps RIG jumps, so the ascent
    // is played and not only rendered
    { x0: 66, x1: 72, y: 4 },
    { x0: 72, x1: 74, gap: true },         // service pit, under a ceiling
    { x0: 74, x1: 82, y: 5 },
    { x0: 82, x1: 84, gap: true },
    { x0: 84, x1: 92, y: 6 },
    { x0: 92, x1: 99, y: 7 },
    { x0: 99, x1: 106, y: 8 },             // breach apron
    { x0: 106, x1: 112, y: 8 },            // breach threshold
    { x0: 112, x1: 120, y: 8 },
    { x0: 120, x1: 122, gap: true },
    { x0: 122, x1: 130, y: 7 },
    { x0: 130, x1: 132, gap: true },
    { x0: 132, x1: 140, y: 6 },
    { x0: 140, x1: 152, y: 7 },
  ],
  platforms: [
    { id: 'a-lower', x0: 27, x1: 33, y: 5.35 },
    { id: 'a-mid', x0: 37, x1: 43, y: 5.35 },
    { id: 'a-high', x0: 39, x1: 44, y: 8.35 },
    { id: 'i-walk-1', x0: 67, x1: 73, y: 6.35 },
    { id: 'i-walk-2', x0: 85, x1: 92, y: 8.35 },
    { id: 'i-walk-3', x0: 87, x1: 93, y: 11.35 },
    { id: 'c-walk-1', x0: 113, x1: 119, y: 10.35 },
    { id: 'c-walk-2', x0: 124, x1: 130, y: 9.35 },
    { id: 'c-walk-3', x0: 134, x1: 141, y: 8.35 },
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

/* -------------------------------- path ----------------------------- */
/* One static polyline with a chamfered bend at each seam, plus a
   piecewise-linear altitude profile. This is the whole world model: the
   body does not move, so every consumer (camera anchor, RIG, hostiles,
   bullets, every baked column) reads its place from here and only the
   camera's YAW is animated during a ritual. */

// Bend anchors: two `snapDeg` bends, `chamferTiles` apart, centred on the
// seam — the six-face tower's corner chamfer, one turn wider.
export function buildTransformPath(fixture, cfg) {
  const T = cfg.transform;
  const half = T.chamferTiles / 2;
  const segs = [{ s0: fixture.bands[0].s0, x: fixture.origin.x, z: fixture.origin.z, heading: 0 }];
  for (const ev of fixture.events) {
    for (const bs of [ev.seamS - half, ev.seamS + half]) {
      const prev = segs[segs.length - 1];
      const len = bs - prev.s0;
      segs.push({
        s0: bs,
        x: prev.x + Math.cos(prev.heading) * len,
        z: prev.z - Math.sin(prev.heading) * len,
        heading: prev.heading + T.snapDeg * DEG,
      });
    }
  }
  return { segs, profile: fixture.altitudeProfile.map((p) => ({ ...p })) };
}

export const TRANSFORM_PATH = buildTransformPath(TRANSFORM_FIXTURE, CONFIG);

// Bend boundaries, same rule as the tower's corners (./path.js): the middle of
// each turn's chamfer — which for a seam-centred chamfer IS the seam. A
// projectile that reaches one leaves on its own tangent instead of following
// the body around the turn.
export function transformBendSList(fixture) {
  return fixture.events.map((ev) => ev.seamS);
}

export const TRANSFORM_BEND_S = transformBendSList(TRANSFORM_FIXTURE);

function segAt(segs, s) {
  for (let i = segs.length - 1; i >= 0; i--) if (s >= segs[i].s0) return segs[i];
  return segs[0];
}

export function transformHeadingAt(path, s) { return segAt(path.segs, s).heading; }

// Blended heading for anything that moves along the path (RIG, hostiles,
// bullets): smoothstep each bend over ±blend tiles so a rig turns the bend
// instead of popping 45°. Same helper the tower uses for its corners.
export function transformYawAt(path, s, blend) {
  const segs = path.segs;
  if (!(blend > 0)) return transformHeadingAt(path, s);
  let yaw = segs[0].heading;
  for (let i = 1; i < segs.length; i++) {
    if (s <= segs[i].s0 - blend) break;
    const d = segs[i].heading - segs[i - 1].heading;
    const u = Math.min(1, Math.max(0, (s - (segs[i].s0 - blend)) / (2 * blend)));
    yaw += d * u * u * (3 - 2 * u);
  }
  return yaw;
}

// Rendered altitude at s: piecewise-linear through the authored profile.
export function transformAltAt(path, s) {
  const P = path.profile;
  if (s <= P[0].s) return P[0].alt;
  for (let i = 1; i < P.length; i++) {
    if (s > P[i].s) continue;
    const a = P[i - 1], b = P[i];
    return a.alt + (b.alt - a.alt) * ((s - a.s) / (b.s - a.s));
  }
  return P[P.length - 1].alt;
}

// Local grade of the climb at s (tiles of altitude per tile of path). The bake
// tilts every floor-like piece by it, so a deck top IS the profile RIG walks on
// instead of a staircase RIG floats over.
export function transformGradeAt(path, s) {
  const P = path.profile;
  for (let i = 1; i < P.length; i++) {
    if (s > P[i].s) continue;
    return (P[i].alt - P[i - 1].alt) / (P[i].s - P[i - 1].s);
  }
  return 0;
}

// The one (s → world) mapping: position along the static polyline plus the
// altitude the body has climbed by then.
export function transformPathAt(path, s, out = { x: 0, z: 0, alt: 0 }) {
  const g = segAt(path.segs, s);
  const d = s - g.s0;
  out.x = g.x + Math.cos(g.heading) * d;
  out.z = g.z - Math.sin(g.heading) * d;
  out.alt = transformAltAt(path, s);
  return out;
}

export function transformBandIndexAt(fixture, s) {
  const bands = fixture.bands;
  for (let i = bands.length - 1; i >= 0; i--) if (s >= bands[i].s0) return i;
  return 0;
}

// The heading the view rests at on a given stretch. A ritual animates from
// this to the next one; nothing else about the world changes.
export function transformBandHeading(fixture, i, cfg) {
  return i * 2 * cfg.transform.snapDeg * DEG;
}

/* ---------------------------- timeline ----------------------------- *
 * Event-local ms (t = gameMs - tStart), same shape as the corner ritual. */

export function transformTimeline(cfg) {
  const T = cfg.transform;
  const t1 = T.windUpMs;                   // latch jolt / counter-rotation ends
  const t2 = t1 + T.snap1Ms;               // snap 1 impact frame
  const t3 = t2 + T.holdMs;                // ratchet hold ends
  const t4 = t3 + T.snap2Ms;               // snap 2 lands: the view is around the bend
  const t5 = t4 + T.settleMs;              // settle ends, scroll resumes
  const t6 = t5 + T.resumeMs;              // event done
  return { t1, t2, t3, t4, t5, t6 };
}

export function transformEventTotalMs(cfg) { return transformTimeline(cfg).t6; }

// View yaw delta (degrees) over the ritual: 0 → windUpDeg → 45 → hold → 90.
// The only animated quantity in the whole transformation.
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

// scroll velocity after a ritual: the same quadratic ease back in the corner
// ritual uses (the fixture floor speed, not the six-face scroll).
export function transformScrollVel(tMs, speed, cfg) {
  const TL = transformTimeline(cfg);
  if (tMs < TL.t5) return 0;
  const u = clamp01((tMs - TL.t5) / cfg.transform.resumeMs);
  return speed * u * u;
}

// Seam pull: the bend comes to the player rather than the world assembling at
// a distance. It starts on the FIRST detent (t2) and runs through the hold and
// the second detent, so the view travels the chamfer while it swings.
export function transformSeamPull(tMs, cfg) {
  const T = cfg.transform;
  const TL = transformTimeline(cfg);
  if (tMs <= TL.t2) return 0;
  if (tMs >= TL.t5) return T.seamPullTiles;
  const u = (tMs - TL.t2) / (TL.t5 - TL.t2);
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

// Cover motion: the one piece of the body allowed to move, and it is a
// MECHANISM, not anatomy — a hinged access plate on the way in, a hinged vent
// cover on the way out. Nothing detaches, tumbles, or disappears: the flip
// plate swings, then RELOCKS flush against the interior wall (the G2 shape —
// snap 1 exposes the hinge and carries the plate, the hold rotates and
// relocks only the plate, snap 2 commits the camera); the vent cover is
// blown to its stop, caught, and hangs there. Both persist after the ritual:
// a body part that popped out of the world would be assembly played
// backwards. Chunkiness lives on the ritual's detents — every cover beat
// lands ON a camera beat.
//
// Arm-time (pre-ritual) flip-plate swing: the latch throws, then one heavy
// swing to ajar, so the way in reads before RIG commits. msSinceArm is
// accumulated by the render frame hook; this stays a pure curve. The harness
// asserts the arm window outlasts this swing even at a full sprint, so a
// ritual never fires against a half-open plate.
export function transformCoverAjar(msSinceArm, cfg) {
  const CV = cfg.transform.cover;
  if (msSinceArm <= CV.unlatchMs) return 0;
  const u = clamp01((msSinceArm - CV.unlatchMs) / CV.ajarMs);
  return CV.ajarFrac * easeOutBack(u, cfg.transform.backS);
}

export function transformPanelState(tMs, ev, cfg, out = {}) {
  const T = cfg.transform;
  const CV = T.cover;
  const TL = transformTimeline(cfg);
  out.visible = true;                      // covers persist: nothing pops out
  out.jolt = 0; out.open = 0; out.seated = false;
  if (ev.kind === 'flip') {
    // The arm phase already unlatched the plate and swung it to ajar; the
    // ritual finishes the motion. The latch throw tracks the swing, so the
    // hand-off from the arm curve is continuous — no pop, in either axis.
    out.open = CV.ajarFrac;                // flat through the wind-up: the
    if (tMs >= TL.t1) {                    //   camera counter-rotates, the
      if (tMs < TL.t2) {                   //   plate waits for the detent
        const u = (tMs - TL.t1) / T.snap1Ms;   // snap 1: clacks with the view
        out.open = CV.ajarFrac + (CV.snapFrac - CV.ajarFrac) * easeOutBack(u, T.backS);
      } else if (tMs < TL.t2 + CV.relockMs) {  // hold: driven home, seats flush
        const u = (tMs - TL.t2) / CV.relockMs;
        out.open = CV.snapFrac + (1 - CV.snapFrac) * u * u;
      } else {
        out.open = 1; out.seated = true;   // relocked — and it stays, forever
      }
    }
    out.jolt = T.panelJoltTiles * out.open;
    return out;
  }
  // breach: shut and straining through the wind-up, blown to its stop across
  // snap 1 — one overswing, caught ON the detent — then dead still forever.
  if (tMs <= 0) return out;
  if (tMs < TL.t1) { out.jolt = T.panelJoltTiles * (tMs / T.windUpMs); return out; }
  out.jolt = T.panelJoltTiles;
  if (tMs < TL.t2) {
    out.open = easeOutBack((tMs - TL.t1) / T.snap1Ms, CV.blowBackS);
    return out;
  }
  out.open = 1;
  return out;
}

// Pressure vapor at the breach: the ATMOSPHERE is what moves — a burst that
// peaks on the first detent and is fully cleared before snap 2 commits the
// camera, so the reveal is a sightline clearing over prebuilt anatomy (the
// G4 shape: the cover opens, vapor clears, the dorsal route already exists).
export function transformVapor(tMs, cfg, out = { density: 0, reach: 0 }) {
  const TL = transformTimeline(cfg);
  out.density = 0; out.reach = 0;
  if (tMs >= TL.t4) { out.reach = 1; return out; }
  if (tMs <= TL.t1) return out;
  const ur = (tMs - TL.t1) / (TL.t4 - TL.t1);
  out.reach = 1 - (1 - ur) * (1 - ur);
  if (tMs < TL.t2) {
    const u = (tMs - TL.t1) / (TL.t2 - TL.t1);
    out.density = u * (2 - u);             // easeOutQuad rise to the detent
  } else {
    const u = (tMs - TL.t2) / (TL.t4 - TL.t2);
    out.density = (1 - u) * (1 - u);       // clears through the hold
  }
  return out;
}

/* ------------------- reserved: assembly choreography ---------------- *
 * RETIRED FROM TRANSITIONS, RESERVED FOR HOSTILE CONSTRUCTS (FLEET-PLAN
 * July 30 addendum). The creature's own body never assembles — it is
 * static and RIG moves around it — but things the ship BUILDS should:
 * traps that snap together, emplacements that deploy, later enemies that
 * arrive in pieces. That reads as hostile activity precisely because the
 * anatomy never does it. The staggered drop curve below is kept whole and
 * callable so a traps/enemies lane can lift it as-is; nothing in the
 * transformation path calls it.                                       */

export function bandSlamOffset(tMs, chunkIdx, cfg, out = { phase: 'hidden', dy: 0 }) {
  const T = cfg.transform.assembly;
  const local = tMs - (T.startMs + chunkIdx * T.perColMs);
  if (local < 0) { out.phase = 'hidden'; out.dy = 0; return out; }
  if (local < T.dropMs) {
    const u = local / T.dropMs;
    out.phase = 'drop'; out.dy = T.dropTiles * (1 - u * u);
    return out;
  }
  if (local < T.dropMs + T.dipMs) { out.phase = 'dip'; out.dy = -T.dipTiles; return out; }
  out.phase = 'locked'; out.dy = 0;
  return out;
}

export function bandSlamLockMs(cfg, chunks) {     // last chunk settles at this t
  const T = cfg.transform.assembly;
  return T.startMs + (chunks - 1) * T.perColMs + T.dropMs + T.dipMs;
}

// Atmosphere cross-fade: the air changes with the stretch of body RIG is on —
// compressed and close inside, open and driving with rain up high.
export function transformAtmosphereMix(tMs, cfg) {
  const TL = transformTimeline(cfg);
  return clamp01((tMs - TL.t1) / (TL.t4 - TL.t1));
}

/* --------------------------- gate geometry ------------------------- */

export function transformHaltS(ev, cfg) { return ev.seamS - cfg.transform.haltOffset; }
export function transformTriggerS(ev, cfg) { return ev.seamS + cfg.transform.triggerOffset; }
// RIG rounds the bend while the view swings, and no further: past the
// threshold the view would be looking down a stretch it has not turned to yet.
export function transformFrontierS(ev, cfg) {
  return ev.seamS + cfg.transform.thresholdTiles - cfg.transform.clampMargin;
}
// A committed turn is one-way: the cover has closed or blown out behind RIG.
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
