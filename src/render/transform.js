/* ====================== TRANSITIONS: THE BODY ====================== */
/* The rendered half of the world transitions: the three stretches of the
   ?slice=transform demo (outer face → inner passage that climbs → outer
   face 36 tiles higher), the covers that move, and the atmosphere.

   THE BODY IS STATIC. Every column, wall, ceiling and silhouette is baked
   once along the pure path (src/pure/transform.js) and never moves again —
   nothing assembles, slams, or rotates into place. The next stretch was
   always there; it is hidden because it is around the bend of the limb and
   behind the fog, and a transition reveals it by swinging the VIEW through
   that bend (src/render/camera.js) while RIG runs the chamfer.

   The only things that move here are covers and the atmosphere, and a cover
   is a MECHANISM with a hinge, not a body part: the access plate swings and
   then RELOCKS flush against the interior wall (it stays in the world); the
   vent cover is blown open to its stop, caught there, and hangs — one
   motion, no tumbling debris, nothing vanishing. Every cover beat lands on
   a camera detent (src/pure/transform.js owns the curves). The breach adds
   a pressure-vapor burst that clears before the camera commits — vapor is
   atmosphere, and atmosphere is allowed to move.

   Nothing here touches the simulation: RIG is still running in (s, y). */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { DEG } from '../pure/path.js';
import {
  TRANSFORM_FIXTURE as FIX, TRANSFORM_PATH as PATH,
  transformAltAt, transformAtmosphereMix, transformBandIndexAt, transformCoverAjar,
  transformGradeAt, transformPanelState, transformVapor,
} from '../pure/transform.js';
import { IS_TRANSFORM_SLICE } from '../mode.js';
import { installView } from '../sim/bridge.js';
import { groundH, platforms } from '../sim/level.js';
import { scene } from './scene.js';
import { activeCameraDepth } from './camera.js';
import { placeSharp } from './tower.js';
import { PAL, atmosphereBg } from './palette.js';

const T = CONFIG.transform;
const VISUAL_DEPTH = 4;                  // tile stack drawn under each surface column
const DRESS_COLS = 2;                    // columns per dressing segment (chunky steps)

const BASE_COLORS = {
  ground: PAL.ground, groundAlt: PAL.groundAlt, catwalk: PAL.catwalk,
  hull: PAL.transform.hull, wall: PAL.transform.wall, ceiling: PAL.transform.ceiling,
  rib: PAL.transform.rib, machine: PAL.transform.machine,
  skyline: PAL.transform.skyline, panel: PAL.transform.panel, accent: PAL.gun,
};

// One material set per stretch, its base colors nudged by that stretch's
// tone — only enough hue walk to make "inside the body" and "high on the
// body" read differently on top of the palette module's ladder.
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

// Every static piece is placed by (s along the path, y above the local deck,
// depth behind/in front of the combat plane). The path supplies the world
// position, the sharp heading and the climbed altitude.
function boxAt(w, h, d, material, s, y, depth, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  parent.add(m);
  placeSharp(m, s, y, depth);
  return m;
}

// Floor-like pieces follow the grade: the deck of a climbing passage is a ramp,
// not a staircase RIG hovers over. Walls, ribs and pipes stay plumb.
function rampAt(w, h, d, material, s, y, depth, parent) {
  const m = boxAt(w, h, d, material, s, y, depth, parent);
  const grade = transformGradeAt(PATH, s);
  if (grade > 1e-3) {
    m.rotation.order = 'YZX';              // heading first, then tilt along it
    m.rotation.z = Math.atan(grade);
  }
  return m;
}

const bands = [];                        // per stretch: { group, weather, band }
const covers = [];                       // per event: { hinge, leaf, vapor, … }
let atmoFrom = null, atmoTo = null;      // atmosphere cross-fade endpoints

/* ---------------------------- static bake --------------------------- */

function groundRefIn(a, b) {             // deck height a dressing segment hangs off
  let ref = -999;
  for (let s = a; s < b; s++) if (groundH[s] > -100) ref = Math.max(ref, groundH[s]);
  return ref > -100 ? ref : 3;
}

function dressRanges(s0, s1) {
  const out = [];
  for (let a = s0; a < s1; a += DRESS_COLS) out.push([a, Math.min(a + DRESS_COLS, s1)]);
  return out;
}

// One column of surface: the deck plate plus, inside the body, the grating
// substructure under it. The checker is the same scroll-speed readability cue
// the six-face tower uses.
function addColumn(target, s, band, M) {
  const g = groundH[s];
  if (g < -100) return;
  const mid = s + 0.5;
  rampAt(1, VISUAL_DEPTH, 2, (s + g) % 2 === 0 ? M.ground : M.groundAlt,
         mid, g - VISUAL_DEPTH / 2, 0, target);
  if (band.kind === 'interior') {
    rampAt(1, 0.5, 5.6, M.wall, mid, g - VISUAL_DEPTH - 0.25, -1.4, target);
    // a lit grating lip along the walkable edge: inside all that machinery the
    // deck still has to be the most readable line on screen
    rampAt(1, 0.14, 0.5, M.catwalk, mid, g + 0.07, 0.95, target);
  }
}

function addDressing(target, a, b, band, M, omitWall) {
  const span = b - a;
  const cx = (a + b) / 2;
  const ref = groundRefIn(a, b);
  if (band.kind === 'exterior') {
    // the body below the deck: it runs off the bottom of frame, so the deck
    // reads as a ledge on something enormous rather than a table edge
    const drop = band.hullDrop;
    boxAt(span, drop, 3.4, M.hull, cx, ref - VISUAL_DEPTH - drop / 2, -0.4, target);
    boxAt(span, 0.5, 4.6, M.rib, cx, ref - VISUAL_DEPTH - 0.25, -0.9, target);
    // The body rising behind the combat plane. It is what hides the next
    // stretch until the view turns, and what makes an opening read as an
    // opening in something — so the turn columns deliberately omit it.
    if (omitWall) return;
    const W = band.hullWall;
    const wy = ref + W.height / 2 - 6;
    if (W.pattern === 'towers') {
      for (let s = a; s < b; s++) {
        if (s % 14 >= 8) continue;
        boxAt(1, W.height, 0.8, M.wall, s + 0.5, wy, -4.4, target);
        if (s % 14 === 0) boxAt(0.9, W.height, 1.3, M.rib, s + 0.5, wy, -4.0, target);
      }
      return;
    }
    boxAt(span, W.height, 0.8, M.wall, cx, wy, -4.4, target);
    for (let s = a; s < b; s++)
      if (s % 6 === 0) boxAt(0.8, W.height, 1.3, M.rib, s + 0.5, wy, -4.0, target);
    return;
  }
  // Inside: a ceiling, a machinery wall behind the plane and stacked hardware,
  // all of it stepping up the passage grade — compressed sightlines instead of
  // open sky, and a visible climb.
  const IN = band.interior;
  const ceil = ref + IN.ceilingAbove;
  rampAt(span, 0.9, 6.6, M.ceiling, cx, ceil, -0.3, target);
  boxAt(span, 26, 0.7, M.wall, cx, ref + 3, IN.wallDepth, target);
  rampAt(span, 0.6, 1.2, M.rib, cx, ceil - 1.6, IN.wallDepth + 0.8, target);
  boxAt(span, 0.45, 0.9, M.machine, cx, ceil - 3.2, IN.wallDepth + 1.0, target);
  // Everything stays at least ~2.5 behind the combat plane: the passage should
  // feel packed without any of it occluding the lane RIG fights in.
  for (let s = a; s < b; s++) {
    const mid = s + 0.5;
    if (s % IN.ribEvery === 0) {                     // structural ribs, deck to ceiling
      boxAt(0.5, IN.ceilingAbove, 0.5, M.rib, mid, ref + IN.ceilingAbove / 2,
            IN.wallDepth + 0.6, target);
      if ((s / IN.ribEvery) % 2 === 0)
        boxAt(1.7, 1.3, 1.1, M.machine, mid + 1.4, ref + 1.4, IN.wallDepth + 0.8, target);
    }
    if (s % IN.alcoveEvery === 0)                    // recessed wall alcoves
      boxAt(2.2, 1.8, 0.5, M.machine, mid, ref + 4.6, IN.wallDepth + 0.45, target);
    if (s % IN.pipeEvery === 0) {                    // vertical pipe runs + a valve block
      boxAt(0.6, IN.ceilingAbove - 1, 0.6, M.machine, mid + 0.5,
            ref + IN.ceilingAbove / 2 - 0.5, IN.wallDepth + 1.1, target);
      boxAt(1.1, 1.1, 1.1, M.rib, mid + 0.5, ref + 6.4, IN.wallDepth + 1.2, target);
    }
  }
}

function addCatwalks(target, a, b, M) {
  for (const p of platforms) {
    const mid = (p.x0 + p.x1) / 2;
    if (mid < a || mid >= b) continue;
    rampAt(p.x1 - p.x0, 0.18, 1.4, M.catwalk, mid, p.y - 0.09, 0, target);
  }
}

// Threat mounts: empty plinths where the roster's own emplacements and hazards
// will live. Sockets rather than decoration, so a later pass can drop a polyp
// on one without re-authoring the passage.
function addThreatSockets(target, band, M) {
  for (const so of band.threatSockets || []) {
    if (so.kind === 'polyp') {
      boxAt(1.5, 0.5, 1.5, M.rib, so.x, so.y, so.depth, target);
      boxAt(0.8, 0.9, 0.8, M.machine, so.x, so.y + 0.7, so.depth, target);
    } else {
      boxAt(2.2, 0.9, 2.2, M.machine, so.x, so.y + 0.45, so.depth, target);
      boxAt(1.7, 0.25, 1.7, M.accent, so.x, so.y + 0.95, so.depth, target);
    }
  }
}

// Silhouettes authored at ABSOLUTE altitude: the structures that loom over the
// low face are roofs in the haze under the high one. Static, like everything
// else — the altitude they prove is the altitude RIG climbed to get here.
function addSkyline(target, band, M) {
  for (const sk of band.skyline) {
    const y = sk.top - transformAltAt(PATH, sk.atS) - sk.height / 2;
    boxAt(sk.width, sk.height, sk.width * 0.8, sk.below ? M.rib : M.skyline,
          sk.atS, y, sk.depth, target);
  }
}

// Driving rain on the exposed high face: presentation only, advanced from the
// slice per-frame hook. Weather is atmosphere, and atmosphere is allowed to
// move — it is the cue that tells the top of the climb in a still frame.
function addWeather(band, M) {
  const W = band.weather;
  if (!W) return null;
  const group = new THREE.Group();
  scene.add(group);
  placeSharp(group, band.s0, 0, 0);       // one straight stretch: one frame is exact
  const geo = new THREE.BoxGeometry(0.07, W.length, 0.07);
  const mat = new THREE.MeshBasicMaterial({ color: PAL.rain, transparent: true, opacity: 0.34 });
  const mesh = new THREE.InstancedMesh(geo, mat, W.count);
  mesh.frustumCulled = false;
  group.add(mesh);
  const span = band.s1 - band.s0;
  const drops = [];
  let seed = 20260729;                   // deterministic scatter, no run rng
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < W.count; i++)
    drops.push({ x: rnd() * span, y: rnd() * W.spanY - 8, z: rnd() * W.spanZ - 8 });
  return { mesh, drops, W, span };
}

function buildBand(band) {
  const M = bandMaterials(band.tone);
  const group = new THREE.Group();       // identity: every child is placed in world
  scene.add(group);
  const isTurn = (s) => FIX.events.some(
    (ev) => s >= ev.seamS - 2 && s < ev.seamS + T.thresholdTiles
  );
  for (let s = band.s0; s < band.s1; s++) addColumn(group, s, band, M);
  for (const [a, b] of dressRanges(band.s0, band.s1))
    addDressing(group, a, b, band, M, isTurn(a));
  addCatwalks(group, band.s0, band.s1, M);
  addThreatSockets(group, band, M);
  addSkyline(group, band, M);
  const weather = addWeather(band, M);
  return { group, weather, band, M };
}

/* -------------------------- covers that move ------------------------ */
/* An opening in the anatomy pre-exists; its cover is the one piece of the
   body allowed to move, and it never leaves the world. The access plate
   swings inward on chunky machinery, then relocks flush against the
   interior wall — after the turn it IS interior dressing. The vent cover
   is blown open on its hinge to a caught stop and hangs there, while a
   burst of pressure vapor (atmosphere) clears the sightline to the
   prebuilt high face.                                                  */

const DOOR_H = 13, DOOR_W = 6.0, HINGE_Z = -3.4;
const VAPOR_N = 120;                     // instanced motes; deterministic scatter

function buildCover(ev, M) {
  const ref = groundRefIn(ev.seamS - 2, ev.seamS + 1);
  // A gate fixture may declare its plate's size (G2's 10–12-tile access
  // plate); the v1 demo's covers keep their original door untouched.
  const H = ev.gate && ev.gate.plate ? ev.gate.plate.tiles : DOOR_H;
  const FH = H + 1.4;
  const group = new THREE.Group();
  scene.add(group);
  // the mouth of the opening: jambs and a lintel, static
  boxAt(0.9, FH, 4.6, M.wall, ev.seamS - 0.3, ref + FH / 2, -2.6, group);
  boxAt(0.9, FH, 3.0, M.wall, ev.seamS - 0.3, ref + FH / 2, 2.4, group);
  boxAt(2.8, 1.1, 8.2, M.wall, ev.seamS + 0.6, ref + FH, 0, group);
  boxAt(2.4, 0.34, 6.0, M.accent, ev.seamS + 0.45, ref + 0.17, 0, group);

  // The cover sits IN the opening, so RIG sees the way in (or the vent ahead)
  // from the approach instead of meeting it around the bend.
  const dx = ev.seamS - 0.4;
  // the machinery the cover turns on: two heavy bosses and their column
  boxAt(1.5, H + 0.6, 1.5, M.rib, dx, ref + H / 2, HINGE_Z, group);
  boxAt(2.3, 1.6, 2.3, M.machine, dx, ref + 1.2, HINGE_Z, group);
  boxAt(2.3, 1.6, 2.3, M.machine, dx, ref + H - 1.2, HINGE_Z, group);
  boxAt(1.2, 1.2, 3.0, M.machine, dx - 1.4, ref + H * 0.5, HINGE_Z - 1.2, group);

  // The cover itself, hinged BEHIND the combat plane so opening it sweeps out
  // of the lane instead of across RIG.
  const hinge = new THREE.Group();
  scene.add(hinge);
  placeSharp(hinge, dx, ref, HINGE_Z);
  const leaf = new THREE.Group();
  hinge.add(leaf);
  const zc = DOOR_W / 2 + 0.4;
  box(1.0, H, DOOR_W, M.panel, 0, H / 2, zc, leaf);
  box(1.25, 0.7, DOOR_W, M.accent, 0, H - 1.6, zc, leaf);
  box(1.25, 0.7, DOOR_W, M.accent, 0, 1.9, zc, leaf);
  box(1.5, 1.4, 1.4, M.rib, 0, H * 0.5, zc + DOOR_W / 2 - 0.7, leaf);

  // The breach vents pressure: an instanced mote burst anchored at the mouth.
  // Deterministic seeded scatter (same trick as the weather), so a bot trace
  // and a screenshot stay comparable run to run. This is air escaping the
  // body, not the body moving — and it is gone before the camera commits.
  let vapor = null;
  if (ev.kind === 'breach') {
    const geo = new THREE.BoxGeometry(0.42, 0.42, 0.42);
    const mat = new THREE.MeshBasicMaterial({
      color: PAL.vapor, transparent: true, opacity: 0, depthWrite: false,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, VAPOR_N);
    mesh.frustumCulled = false;
    mesh.visible = false;
    hinge.add(mesh);
    const motes = [];
    let seed = 20260731;                 // deterministic scatter, no run rng
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < VAPOR_N; i++) {
      motes.push({
        dx: 2 + rnd() * 9,               // downpath: out over the revealed face
        dy: (rnd() - 0.15) * 7,          // mostly rising
        dz: (rnd() - 0.5) * 5,
        y0: 1 + rnd() * DOOR_H,          // vents from the whole mouth
        sz: 0.6 + rnd() * 1.4,
      });
    }
    vapor = { mesh, motes };
  }
  const stopRad = (ev.kind === 'breach' ? T.cover.breachStopDeg : 90) * DEG;
  // G2's "become an interior ramp" beat: a plate that declares `plateRamp`
  // rakes to the interior climb grade as the relock drives it home, so the
  // seated plate reads as a ramp up the neck wall. Pure dressing — the
  // collision it fronts is the static carried deck. v1 events lack the flag
  // and keep their exact shipped rest pose.
  const seatRake = ev.plateRamp
    ? Math.atan(Math.max(0, transformGradeAt(PATH, ev.seamS + T.thresholdTiles + 1)))
    : 0;
  return { hinge, leaf, vapor, armMs: 0, arming: false, kind: ev.kind, stopRad, seatRake };
}

// local-space box for cover parts (children of the hinge, which is posed once)
function box(w, h, d, material, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/* ------------------------- transition execution --------------------- */

const _c = new THREE.Color();
function applyAtmosphere(a, b, u) {
  // Authored per-band fog is composed for the near camera; pulling the view
  // back (?view=mid|far, or the portrait correction) must carry the fog band
  // with it — the same depth-delta rule src/render/camera.js applies to every
  // other mode — or the interior compresses into a void at the far default
  // and there is nothing on screen for a turn to reveal.
  const shift = activeCameraDepth() - CONFIG.camera.z;
  scene.fog.near = a.fogNear + (b.fogNear - a.fogNear) * u + shift;
  scene.fog.far = a.fogFar + (b.fogFar - a.fogFar) * u + shift;
  // The fixture's bg values are pure data; the palette module remaps them
  // render-side (identity under ?palette=classic). Fog and background stay
  // the same color by construction.
  scene.fog.color.setHex(atmosphereBg(a.bg)).lerp(_c.setHex(atmosphereBg(b.bg)), u);
  scene.background.copy(scene.fog.color);
}
let atmoRest = null;                     // the band atmosphere the air rests at

// The way into the body opens as RIG arrives: the access plate unlatches and
// swings to AJAR — open enough that the way in reads, visibly not seated —
// and then holds dead still. The ritual finishes the motion on its own
// detents. A vent cover stays shut; the breach blows that one open.
function armed(ev) {
  const c = covers[ev.index];
  if (c && c.kind === 'flip') c.arming = true;
}

function started(ev) {
  const c = covers[ev.index];
  if (c) c.arming = false;               // the ritual owns the plate from here
  atmoFrom = FIX.bands[ev.fromBand].atmosphere;
  atmoTo = FIX.bands[ev.toBand].atmosphere;
  ritual(ev, 0);
}

const _panel = { visible: true, jolt: 0, open: 0, seated: false };
const _vap = { density: 0, reach: 0 };
const _vm = new THREE.Matrix4();

// One pose rule for both covers: a swing on the hinge, a jolt on the latch.
// A caught vent cover hangs with a slight sag; a relocked plate sits square —
// unless it declared the ramp rake, which eases in over the relock drive
// (open: snapFrac → 1) so the beat still lands ON the hold, before snap 2.
function applyCover(c, st) {
  c.leaf.rotation.y = st.open * c.stopRad;
  c.leaf.position.x = st.jolt;
  c.leaf.rotation.z = c.kind === 'breach' ? -0.04 * Math.min(1, st.open)
    : c.seatRake
      ? -c.seatRake * Math.min(1, Math.max(0,
          (st.open - T.cover.snapFrac) / (1 - T.cover.snapFrac)))
      : 0;
}

function applyVapor(c, tMs) {
  const st = transformVapor(tMs, CONFIG, _vap);
  const v = c.vapor;
  const on = st.density > 0.003;
  v.mesh.visible = on;
  if (!on) return;
  v.mesh.material.opacity = 0.42 * st.density;
  for (let i = 0; i < v.motes.length; i++) {
    const m = v.motes[i];
    const s = m.sz * (0.55 + 0.9 * st.reach);
    _vm.makeScale(s, s, s);
    _vm.setPosition(m.dx * st.reach + 0.4, m.y0 + m.dy * st.reach, m.dz * st.reach);
    v.mesh.setMatrixAt(i, _vm);
  }
  v.mesh.instanceMatrix.needsUpdate = true;
}

function ritual(ev, t) {
  // Nothing about the world is touched here: only the cover and the air.
  const c = covers[ev.index];
  if (c) {
    applyCover(c, transformPanelState(t, ev, CONFIG, _panel));
    if (c.vapor) applyVapor(c, t);
  }
  if (atmoFrom) applyAtmosphere(atmoFrom, atmoTo, transformAtmosphereMix(t, CONFIG));
}

function finished(ev) {
  const c = covers[ev.index];
  if (c) {
    c.arming = false;
    // final state, held forever: the plate relocked flush, the vent cover
    // hanging on its caught stop. Nothing is hidden — the cover is part of
    // the body RIG just climbed through.
    applyCover(c, transformPanelState(1e9, ev, CONFIG, _panel));
    if (c.vapor) c.vapor.mesh.visible = false;
  }
  applyAtmosphere(FIX.bands[ev.fromBand].atmosphere, FIX.bands[ev.toBand].atmosphere, 1);
  atmoRest = FIX.bands[ev.toBand].atmosphere;
  atmoFrom = atmoTo = null;
}

// Per-frame presentation tick (src/sim/transform.js calls it once per update).
// The arming plate's swing to ajar, and weather — the body has nothing to
// update. The curve is pure (src/pure/transform.js); only the clock is here.
const _rm = new THREE.Matrix4();
function frame(dtMs) {
  const dt = Math.min(50, dtMs) / 1000;
  // At rest the air still tracks the camera depth (a resize can change it and
  // camera.js's calibrateEdges leaves this slice's fog to this module).
  if (!atmoFrom && atmoRest) applyAtmosphere(atmoRest, atmoRest, 0);
  for (const c of covers) {
    if (!c.arming) continue;
    c.armMs += dtMs;
    const open = transformCoverAjar(c.armMs, CONFIG);
    c.leaf.rotation.y = open * c.stopRad;
    c.leaf.position.x = open * T.panelJoltTiles;
  }
  for (const b of bands) {
    const w = b.weather;
    if (!w) continue;
    for (let i = 0; i < w.drops.length; i++) {
      const d = w.drops[i];
      d.y -= w.W.speed * dt;
      d.x += w.W.drift * dt;
      if (d.y < -10) { d.y += w.W.spanY; d.x += 3; }
      if (d.x < 0) d.x += w.span;
      _rm.makeRotationZ(0.16);           // leaned with the wind, not falling straight
      _rm.setPosition(d.x, d.y, d.z);
      w.mesh.setMatrixAt(i, _rm);
    }
    w.mesh.instanceMatrix.needsUpdate = true;
  }
}

function reset() {                       // run reset: covers closed, air at the start
  for (const c of covers) {
    c.armMs = 0;
    c.arming = false;
    c.leaf.rotation.set(0, 0, 0);
    c.leaf.position.set(0, 0, 0);
    if (c.vapor) c.vapor.mesh.visible = false;
  }
  atmoFrom = atmoTo = null;
  atmoRest = FIX.bands[0].atmosphere;
  applyAtmosphere(atmoRest, atmoRest, 0);
}

// Authored solid ribs (the G2 twin-rib chimney): collision truth baked as
// static body anatomy on the combat plane — placed once, never moving. A
// side flange sits behind the plane so nothing overlaps a surface RIG can
// stand on. The v1 fixture authors none, so this is a no-op there.
function buildRibs() {
  for (const r of FIX.solidRects || []) {
    const bi = transformBandIndexAt(FIX, r.x0);
    const M = bands[bi].M;
    const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
    boxAt(r.x1 - r.x0, r.y1 - r.y0, 2.2, M.rib, cx, cy, 0, bands[bi].group);
    boxAt(r.x1 - r.x0 + 0.6, 0.5, 1.2, M.machine, cx, r.y1 - 0.25, -1.7, bands[bi].group);
    boxAt(r.x1 - r.x0 + 0.6, 0.9, 1.2, M.machine, cx, r.y0 + 0.45, -1.7, bands[bi].group);
  }
}

// Called at the bottom of the module, after every constant it reads exists.
function buildSlice() {
  for (const band of FIX.bands) bands.push(buildBand(band));
  buildRibs();
  for (const ev of FIX.events) covers.push(buildCover(ev, bands[ev.fromBand].M));
  installView({ transform: { armed, started, ritual, finished, reset, frame } });
  reset();
}

// Only ?slice=transform builds any of this: every other run mode leaves the
// view hooks as the no-ops src/sim/bridge.js installs.
if (IS_TRANSFORM_SLICE) buildSlice();
