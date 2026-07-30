/* ==================== TRANSFORMATION: SURFACES ==================== */
/* The rendered half of the world transformations: the three surfaces of
   the ?slice=transform demo (exterior hull face → interior service
   corridor → exterior hull face 30 tiles higher), the bulkhead leaf and
   blown hull panel, and the execution of each ritual's choreography.

   Each band is one THREE.Group whose transform IS its pure frame
   (origin, heading, altitude), so a column at s draws at local x = s - s0
   and nothing per-frame has to be recomputed. The pieces that move are:

     - the SLAM CHUNKS of the next band, dropping in near-to-far while the
       ritual turns (the corner ritual's brick zipper, one band later);
     - the THRESHOLD PLATE, the handful of columns RIG is standing on when
       the ritual fires. It is driven by the same animated frame as RIG,
       so the deck under their feet turns and lifts with them while the
       hull they left stays where it was and drops into the fog;
     - the panel, and the atmosphere (fog band + background by altitude).

   Nothing here touches the simulation: RIG is still running in (s, y). */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import {
  TRANSFORM_FIXTURE as FIX, TRANSFORM_FRAMES as FRAMES,
  bandSlamOffset, transformAtmosphereMix, transformPanelState,
} from '../pure/transform.js';
import { IS_TRANSFORM_SLICE } from '../mode.js';
import { installView } from '../sim/bridge.js';
import { groundH, platforms } from '../sim/level.js';
import { scene } from './scene.js';
import { activeFrame } from './tower.js';

const T = CONFIG.transform;
const PAL = CONFIG.palette;
const VISUAL_DEPTH = 4;                  // tile stack drawn under each surface column
const HULL_DROP = 17;                    // exterior hull mass below the deck, into fog
const HULL_WALL_H = 20;                  // hull skin behind the plane (deck-6 … deck+14)
const PLATE_LIFT = 0.001;                // keeps the plate's deck out of z-fight range

const BASE_COLORS = {
  ground: PAL.ground, groundAlt: PAL.groundAlt, catwalk: PAL.catwalk,
  hull: 0x494f57, wall: 0x555b64, ceiling: 0x646a73, rib: 0x7b818a,
  machine: 0x878d96, skyline: 0x333a44, panel: 0x8a9099, accent: PAL.gun,
};

// One material set per band, its base colors nudged by the band tone. Still a
// neutral grey-box palette — the tone is only enough hue walk to make "inside
// the ship" and "high on the hull" read differently in a screenshot.
function bandMaterials(tone) {
  const out = {};
  const c = new THREE.Color();
  for (const [key, hex] of Object.entries(BASE_COLORS)) {
    c.setHex(hex);
    out[key] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(
        Math.min(1, c.r * tone[0]), Math.min(1, c.g * tone[1]), Math.min(1, c.b * tone[2])
      ),
      flatShading: true,
    });
  }
  return out;
}
function box(w, h, d, material, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

const bands = [];                        // per band: { root, chunks, plate, overlap }
const panels = [];                       // per event: { hinge, leaf, restZ }
let atmoFrom = null, atmoTo = null;      // atmosphere cross-fade endpoints

/* ----------------------------- geometry ---------------------------- */

function chunkRanges(s0, s1, n) {        // near-to-far column ranges for the slam
  const out = [];
  const len = s1 - s0;
  for (let i = 0; i < n; i++) {
    const a = s0 + Math.floor((len * i) / n);
    const b = s0 + Math.floor((len * (i + 1)) / n);
    if (b > a) out.push([a, b]);
  }
  return out;
}

function groundRefIn(a, b) {             // deck height a chunk's dressing hangs off
  let ref = -999;
  for (let s = a; s < b; s++) if (groundH[s] > -100) ref = Math.max(ref, groundH[s]);
  return ref > -100 ? ref : 3;
}

// One column of surface: the deck plate plus, on an interior face, the grating
// substructure under it. The checker is the same scroll-speed readability cue
// the six-face tower uses.
function addColumn(target, s, band, M) {
  const g = groundH[s];
  if (g < -100) return;
  const lx = s - band.s0 + 0.5;
  box(1, VISUAL_DEPTH, 2, (s + g) % 2 === 0 ? M.ground : M.groundAlt,
      lx, g - VISUAL_DEPTH / 2, 0, target);
  if (band.kind === 'interior') {
    box(1, 0.5, 5.6, M.wall, lx, g - VISUAL_DEPTH - 0.25, -1.4, target);
    // a lit grating lip along the walkable edge: inside all that machinery the
    // deck still has to be the most readable line on screen
    box(1, 0.14, 0.5, M.catwalk, lx, g + 0.07, 0.95, target);
  }
}

function addChunkDressing(target, a, b, band, M, omitWall) {
  const span = b - a;
  const cx = (a + b) / 2 - band.s0;
  const ref = groundRefIn(a, b);
  if (band.kind === 'exterior') {
    // the completed hull below the deck: it ends in the fog, and once the
    // camera climbs it is what visibly falls away underneath RIG
    const drop = band.band.hullDrop || HULL_DROP;
    box(span, drop, 3.4, M.hull, cx, ref - VISUAL_DEPTH - drop / 2, -0.4, target);
    box(span, 0.5, 4.6, M.rib, cx, ref - VISUAL_DEPTH - 0.25, -0.9, target);
    // The hull skin RIG is climbing, rising behind the combat plane. It is what
    // makes a doorway read as a hole in a ship and a breach as a hole punched
    // back out of one, so threshold groups deliberately omit it. High on the
    // ship it breaks into towers: the gaps are where the drop is visible.
    if (omitWall) return;
    const W = band.band.hullWall || { height: HULL_WALL_H, pattern: 'solid' };
    const wy = ref + W.height / 2 - 6;
    if (W.pattern === 'towers') {
      for (let s = a; s < b; s++) {
        if (s % 14 >= 8) continue;
        const lx = s - band.s0 + 0.5;
        box(1, W.height, 0.8, M.wall, lx, wy, -4.4, target);
        if (s % 14 === 0) box(0.9, W.height, 1.3, M.rib, lx, wy, -4.0, target);
      }
      return;
    }
    box(span, W.height, 0.8, M.wall, cx, wy, -4.4, target);
    for (let s = a; s < b; s++)
      if (s % 6 === 0)
        box(0.8, W.height, 1.3, M.rib, s - band.s0 + 0.5, wy, -4.0, target);
    return;
  }
  // Interior: a ceiling, a machinery wall behind the plane and stacked
  // hardware — compressed sightlines instead of open sky, per DESIGN.
  const IN = band.band.interior;
  const ceil = ref + IN.ceilingAbove;
  box(span, 0.9, 6.6, M.ceiling, cx, ceil, -0.3, target);                 // ceiling
  box(span, 26, 0.7, M.wall, cx, ref + 3, IN.wallDepth, target);          // machinery wall
  box(span, 0.6, 1.2, M.rib, cx, ceil - 1.6, IN.wallDepth + 0.8, target); // conduit run
  box(span, 0.45, 0.9, M.machine, cx, ceil - 3.2, IN.wallDepth + 1.0, target);
  // Everything stays at least ~2.5 behind the combat plane: the corridor should
  // feel packed without any of it occluding the lane RIG fights in.
  for (let s = a; s < b; s++) {
    const lx = s - band.s0 + 0.5;
    if (s % IN.ribEvery === 0) {                     // structural ribs, deck to ceiling
      box(0.5, IN.ceilingAbove, 0.5, M.rib, lx, ref + IN.ceilingAbove / 2, IN.wallDepth + 0.6, target);
      if ((s / IN.ribEvery) % 2 === 0)
        box(1.7, 1.3, 1.1, M.machine, lx + 1.4, ref + 1.4, IN.wallDepth + 0.8, target);
    }
    if (s % IN.alcoveEvery === 0)                    // recessed wall alcoves
      box(2.2, 1.8, 0.5, M.machine, lx, ref + 4.6, IN.wallDepth + 0.45, target);
    if (s % IN.pipeEvery === 0) {                    // vertical pipe runs + a valve block
      box(0.6, IN.ceilingAbove - 1, 0.6, M.machine, lx + 0.5, ref + IN.ceilingAbove / 2 - 0.5,
          IN.wallDepth + 1.1, target);
      box(1.1, 1.1, 1.1, M.rib, lx + 0.5, ref + 6.4, IN.wallDepth + 1.2, target);
    }
  }
}

// The skin of the ship at a band entrance, with the hole RIG came through.
// Interior: the outer hull around the doorway, perpendicular to the corridor —
// it is what stops the frame from being half void while the view is still
// outside looking in. Exterior: the torn wall around the breach.
function addSeamSkin(target, band, M, kind) {
  const ref = groundRefIn(band.s0, band.s0 + T.thresholdTiles);
  if (kind === 'interior') {
    // Asymmetric on purpose: the skin reaches far along the hull away from the
    // camera and stops short of it, so it frames the doorway instead of
    // standing between the camera and the corridor RIG just entered.
    const FAR = -24, NEAR = 8, HALF = 5.5, DOOR = 13;
    box(1, 38, -(FAR + HALF), M.wall, -0.6, ref + 5, (FAR - HALF) / 2, target);
    box(1, 38, NEAR - HALF, M.wall, -0.6, ref + 5, HALF + (NEAR - HALF) / 2, target);
    box(1, 11, HALF * 2, M.wall, -0.6, ref + DOOR + 5.5, 0, target);
    box(1, 15, HALF * 2, M.hull, -0.6, ref - 7.5, 0, target);
    return;
  }
  const span = T.thresholdTiles;
  box(span, 5, 0.8, M.wall, span / 2, ref + 11.5, -4.4, target);       // hull above the hole
  box(1.1, 9, 0.8, M.rib, 0.4, ref + 4.5, -4.4, target);               // torn edges
  box(0.9, 6.5, 0.8, M.rib, span - 0.5, ref + 3.2, -4.4, target);
  box(1.6, 1.2, 0.8, M.rib, span - 1.6, ref + 8.4, -4.4, target);
}

function addCatwalks(target, a, b, s0, M) {
  for (const p of platforms) {
    const mid = (p.x0 + p.x1) / 2;
    if (mid < a || mid >= b) continue;
    box(p.x1 - p.x0, 0.18, 1.4, M.catwalk, mid - s0, p.y - 0.09, 0, target);
  }
}

// Silhouettes authored at ABSOLUTE altitudes: the structures that loom over
// hull face A stand far below on hull face C. This is the altitude cue that
// survives a screenshot. They hide with their band so an unentered surface
// never leaks silhouettes into the view down a corridor.
function addSkyline(root, band, M) {
  const g = new THREE.Group();
  root.add(g);
  for (const sk of band.band.skyline)
    // structures below RIG catch the light on their roofs, so they read as
    // separate masses in the haze instead of merging with the hull under the
    // deck; the ones overhead stay flat silhouettes
    box(sk.width, sk.height, sk.width * 0.8, sk.below ? M.rib : M.skyline,
        sk.atS - band.s0, sk.top - band.alt - sk.height / 2, sk.depth, g);
  return g;
}

function buildBand(frame) {
  const M = bandMaterials(frame.band.tone);
  const root = new THREE.Group();
  root.position.set(frame.x, frame.alt, frame.z);
  root.rotation.y = frame.heading;
  scene.add(root);

  const hasPlate = frame.index > 0;
  const bodyS0 = hasPlate ? frame.s0 + T.thresholdTiles : frame.s0;
  const chunks = [];
  for (const [a, b] of chunkRanges(bodyS0, frame.s1, T.slamChunks)) {
    const g = new THREE.Group();
    root.add(g);
    for (let s = a; s < b; s++) addColumn(g, s, frame, M);
    addChunkDressing(g, a, b, frame, M);
    addCatwalks(g, a, b, frame.s0, M);
    // the doorway skin arrives with the first chunk of an interior band: it is
    // world, so it slams in with the world rather than riding RIG's plate
    if (chunks.length === 0 && hasPlate && frame.kind === 'interior')
      addSeamSkin(g, frame, M, 'interior');
    chunks.push(g);
  }
  const skyline = addSkyline(root, frame, M);

  // The threshold plate lives in the scene, not the band: while the ritual
  // runs it rides the animated frame with RIG, then settles onto the band.
  let plate = null;
  if (hasPlate) {
    plate = new THREE.Group();
    scene.add(plate);
    for (let s = frame.s0; s < frame.s0 + T.thresholdTiles; s++)
      addColumn(plate, s, frame, M);
    addChunkDressing(plate, frame.s0, frame.s0 + T.thresholdTiles, frame, M, true);
    // the torn hull around a breach travels with the plate: it is the hole RIG
    // was just thrown through, and it lands with them on the new face
    if (frame.kind === 'exterior') addSeamSkin(plate, frame, M, 'exterior');
    restPlate(plate, frame);
  }

  // …and the band before a seam renders the same threshold columns in its own
  // frame, so RIG can walk into the doorway before anything has turned. The
  // two copies are coincident at the frame the ritual fires.
  let overlap = null;
  const next = FRAMES[frame.index + 1];
  if (next) {
    overlap = new THREE.Group();
    root.add(overlap);
    for (let s = next.s0; s < next.s0 + T.thresholdTiles; s++)
      addColumn(overlap, s, frame, M);
    addChunkDressing(overlap, next.s0, next.s0 + T.thresholdTiles, frame, M, true);
    // the hull opening RIG steps into, and the panel that has to give way
    buildDoorway(root, frame, next, M);
  }
  return { root, chunks, plate, overlap, skyline, frame };
}

function restPlate(plate, frame) {
  plate.position.set(frame.x, frame.alt + PLATE_LIFT, frame.z);
  plate.rotation.y = frame.heading;
}

// The seam's architecture: the hull opening RIG steps into, and — at the far
// end of the threshold — the massive panel that has to give way, carried on
// chunky hinge machinery. It is deliberately far bigger than RIG: the concept
// board's bulkhead dwarfs him, and the scale is most of why the flip reads as
// the ship moving rather than a prop animating.
const DOOR_H = 13, DOOR_W = 6.0, HINGE_Z = -3.4;

function buildDoorway(root, frame, next, M) {
  const ref = groundRefIn(next.s0, next.s0 + T.thresholdTiles);
  const lx = next.s0 - frame.s0;
  const FH = DOOR_H + 1.4;
  box(0.9, FH, 4.6, M.wall, lx - 0.3, ref + FH / 2, -2.6, root);          // jamb, far side
  box(0.9, FH, 3.0, M.wall, lx - 0.3, ref + FH / 2, 2.4, root);           // jamb, near side
  box(2.8, 1.1, 8.2, M.wall, lx + 0.6, ref + FH, 0, root);                // lintel beam
  box(2.4, 0.34, 6.0, M.accent, lx + 0.45, ref + 0.17, 0, root);          // lit sill

  const dx = next.s0 + T.thresholdTiles - frame.s0;
  // hinge machinery: two heavy bosses and the column they are bolted to
  box(1.5, DOOR_H + 0.6, 1.5, M.rib, dx, ref + DOOR_H / 2, HINGE_Z, root);
  box(2.3, 1.6, 2.3, M.machine, dx, ref + 1.2, HINGE_Z, root);
  box(2.3, 1.6, 2.3, M.machine, dx, ref + DOOR_H - 1.2, HINGE_Z, root);
  box(1.2, 1.2, 3.0, M.machine, dx - 1.4, ref + DOOR_H * 0.5, HINGE_Z - 1.2, root);

  // The leaf: hinged BEHIND the combat plane, so opening it sweeps the slab
  // out of the lane and leaves it lying along the wall RIG runs past.
  const hinge = new THREE.Group();
  hinge.position.set(dx, ref, HINGE_Z);
  root.add(hinge);
  const leaf = new THREE.Group();
  hinge.add(leaf);
  const zc = DOOR_W / 2 + 0.4;                     // leaf spans the opening ahead of the hinge
  box(1.0, DOOR_H, DOOR_W, M.panel, 0, DOOR_H / 2, zc, leaf);
  box(1.25, 0.7, DOOR_W, M.accent, 0, DOOR_H - 1.6, zc, leaf);            // warning stripes
  box(1.25, 0.7, DOOR_W, M.accent, 0, 1.9, zc, leaf);
  box(1.5, 1.4, 1.4, M.rib, 0, DOOR_H * 0.5, zc + DOOR_W / 2 - 0.7, leaf); // latch block
  panels.push({ hinge, leaf, root });
}

// Called at the bottom of the module, after every constant it reads exists.
function buildSlice() {
  for (const frame of FRAMES) bands.push(buildBand(frame));
  installView({ transform: { armed, started, ritual, finished, reset } });
  reset();
}

/* --------------------------- ritual execution ---------------------- */

function setBandVisible(b, visible) {
  for (const c of b.chunks) c.visible = visible;
  if (b.plate) b.plate.visible = visible;
  b.skyline.visible = visible;
}

function applyAtmosphere(a, b, u) {
  const near = a.fogNear + (b.fogNear - a.fogNear) * u;
  const far = a.fogFar + (b.fogFar - a.fogFar) * u;
  scene.fog.near = near;
  scene.fog.far = far;
  scene.fog.color.setHex(a.bg).lerp(_c.setHex(b.bg), u);
  scene.background.copy(scene.fog.color);
}
const _c = new THREE.Color();

// The HUD calls the arming beat out; the panel itself waits for the ritual.
function armed() {}

function started(ev) {
  atmoFrom = FRAMES[ev.fromBand].band.atmosphere;
  atmoTo = FRAMES[ev.toBand].band.atmosphere;
  bands[ev.toBand].skyline.visible = true;
  ritual(ev, 0);
}

function ritual(ev, t) {
  const to = bands[ev.toBand];
  const from = bands[ev.fromBand];
  // Threshold hand-off, on the wind-up beat: the two copies of the doorway
  // columns are coincident until the first snap moves the frame, so swapping
  // which one is drawn costs nothing and buys RIG a deck the whole way.
  const swapped = t >= T.windUpMs;
  if (from.overlap) from.overlap.visible = !swapped;
  // the next surface slams in near-to-far and locks before the scroll resumes
  for (let i = 0; i < to.chunks.length; i++) {
    const z = bandSlamOffset(t, i, CONFIG);
    to.chunks[i].visible = z.phase !== 'hidden';
    to.chunks[i].position.y = z.dy;
  }
  // the deck RIG is standing on turns and lifts with them: same frame, so
  // their feet never leave it while the world re-frames
  if (to.plate) {
    const c = activeFrame();
    to.plate.visible = swapped;
    to.plate.position.set(c.x, c.alt + PLATE_LIFT, c.z);
    to.plate.rotation.y = c.heading;
  }
  // the panel: a bulkhead swings inward with the snaps, a hull panel is blown
  // off its hinge and tumbles away out of the breach
  const p = panels[ev.index];
  if (p) {
    const st = transformPanelState(t, ev, CONFIG);
    p.hinge.visible = st.visible;
    p.hinge.rotation.y = st.open * (ev.kind === 'flip' ? Math.PI / 2 : 0.5);
    p.leaf.position.set(st.jolt + st.blow, st.blow * 0.4, 0);
    p.leaf.rotation.z = st.spin;
    p.leaf.rotation.x = st.spin * 0.35;
  }
  if (atmoFrom) applyAtmosphere(atmoFrom, atmoTo, transformAtmosphereMix(t, CONFIG));
}

function finished(ev) {
  const to = bands[ev.toBand];
  const from = bands[ev.fromBand];
  if (from.overlap) from.overlap.visible = false;
  for (const c of to.chunks) { c.visible = true; c.position.y = 0; }
  if (to.plate) restPlate(to.plate, FRAMES[ev.toBand]);
  const p = panels[ev.index];
  if (p) p.hinge.visible = false;
  applyAtmosphere(FRAMES[ev.fromBand].band.atmosphere, FRAMES[ev.toBand].band.atmosphere, 1);
  atmoFrom = atmoTo = null;
}

function reset() {                       // run reset: back to the first surface
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i];
    if (b.plate) restPlate(b.plate, FRAMES[i]);
    if (b.overlap) b.overlap.visible = true;
    setBandVisible(b, i === 0);
  }
  for (const p of panels) {
    p.hinge.visible = true;
    p.hinge.rotation.y = 0;
    p.leaf.position.set(0, 0, 0);
    p.leaf.rotation.set(0, 0, 0);
  }
  atmoFrom = atmoTo = null;
  const a = FRAMES[0].band.atmosphere;
  applyAtmosphere(a, a, 0);
}

// Only ?slice=transform builds any of this: every other run mode leaves the
// view hooks as the no-ops src/sim/bridge.js installs.
if (IS_TRANSFORM_SLICE) buildSlice();
