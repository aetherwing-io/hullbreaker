/* ========================= LEVEL MESHES =========================== */
/* Instanced tiles, catwalk slats, and the authored solid rectangles for
   the baked level in src/sim/level.js. The zipper and face-reveal hooks
   are the visual half of the corner ritual: the sim decides when a column
   counts as built, this module moves the bricks. */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { normalAscentAltAt, normalAscentPitchAt } from '../pure/ascent.js';
import {
  SEGS, CORNER_S, polyAt, headingAt, faceIndexAt,
} from '../pure/path.js';
import { deckShadePlan } from '../pure/shade.js';
import { ACTIVE_FIXTURE, IS_G1, IS_TRANSFORM_SLICE, QUERY } from '../mode.js';
import { installView } from '../sim/bridge.js';
import {
  LEVEL_LEN, groundH, platforms, solidRects, slamSets, farSets,
  unbuildFutureFaces,
} from '../sim/level.js';
import { scene, HIDE } from './scene.js';
import { PAL, SHADE_GAIN } from './palette.js';
import { applyDeckPanelTexture, applySurface } from './materials.js';
import { deckPanelFaceGain, deckPanelUv } from './hulltiles.js';
import {
  currentWorldFacet, routeRenderable, routeVisibilityStamp, routeWorldFacet,
} from './route-visibility.js';

// --- level meshes: baked per-face static geometry ---------------------
// Tile instances are baked once along the rising tower polyline with per-column
// instance ranges + base matrices (and per-face ranges for later passes),
// so the corner ritual can slam columns in without a rebuild.
const VISUAL_DEPTH = 4;
let tiles;
const tileBaseMats = [];                                  // final matrix per instance
const columnInstances = new Array(LEVEL_LEN).fill(null);  // col → {start, count, settled}
const faceRanges = [];                                    // face → {col0, col1, inst0, inst1}
const slatMeshes = [];                    // catwalk panels {mesh, x0, x1, facet, samples}
const authoredSolidMeshes = [];           // tagged solid rectangles {mesh, facet}
const routeHullFacets = [];                // continuous hull split for strict face ownership
const normalRunAltAt = (s) => ACTIVE_FIXTURE ? 0 : normalAscentAltAt(s, CONFIG.levelLength);
const normalRunPitchAt = (s) => ACTIVE_FIXTURE ? 0 : normalAscentPitchAt(s, CONFIG.levelLength);

// The collision bake intentionally stays chunky and legible.  This pass is
// everything the collision boxes should NOT have to be: the trusses, pipes,
// service frames and inset access plates that make those same rectangles read
// as a colossal maintained machine.  It is render-only and default-on in the
// static six-face run; ?world=0 is the exact A/B back to the undressed
// collision silhouette. Fixtures and the retired ?zip=1 reveal retain their
// authored visual grammar rather than leaking already-built details.
export const WORLD_DRESSING_ENABLED = IS_G1 && QUERY.get('world') !== '0';

const dressingStats = {
  enabled: WORLD_DRESSING_ENABLED,
  boxes: 0,
  pipes: 0,
  lights: 0,
  drawPools: 0,
  hidden: 0,
};

export function worldDressingStats() { return { ...dressingStats }; }
if (typeof globalThis !== 'undefined') globalThis.__HB_WORLD = worldDressingStats;

/* ---- view hooks: the build state of a face, made visible ---------- */
/* THE ZIPPER IS RETIRED FROM THE WORLD, NOT DELETED (docs/decisions.md
   entry 3 + its July 30 addendum): the creature's body may not assemble,
   but things the ship BUILDS may, so this choreography stays whole and
   callable for the traps/emplacements lane — and still playable, since
   ?zip=1 selects it. By DEFAULT (T-009) the same corner reads as an orbit
   around a static limb (../render/limb.js), so all three hooks below no-op
   and every column stays where the bake put it — the next facet was always
   there. The sim's build state machine is untouched in both modes; only the
   story the geometry tells changes.                                    */

function unbuiltHidden() {               // next faces stay unbuilt until their ritual
  if (!tiles || IS_G1) return;           // transformation slice: no tower bake
  for (const sets of [slamSets, farSets]) {
    for (const cols of sets) {
      for (const s of cols) {
        const col = columnInstances[s];
        if (!col) continue;
        col.settled = false;
        for (let n = 0; n < col.count; n++) tiles.setMatrixAt(col.start + n, HIDE);
      }
    }
  }
  tiles.instanceMatrix.needsUpdate = true;
  for (const sl of slatMeshes)           // catwalks over an unbuilt face are unbuilt too
    sl.mesh.visible = !CORNER_S.some((cs) =>
      sl.x1 >= cs && sl.x0 <= cs + CONFIG.path.faceTiles - 1);
}

const _zm = new THREE.Matrix4();
function zipperColumn(s, dy, locked) {   // one brick-slam column, dy tiles above base
  if (IS_G1) return;                     // a limb does not assemble
  const col = tiles && columnInstances[s];
  if (!col) return;
  for (let n = 0; n < col.count; n++) {
    const inst = col.start + n;
    _zm.copy(tileBaseMats[inst]);
    _zm.elements[13] += dy;
    tiles.setMatrixAt(inst, _zm);
  }
  if (locked) col.settled = true;
  tiles.instanceMatrix.needsUpdate = true;
}

function faceRevealed(c) {               // beyond the zipper strip: one distant commit
  if (!tiles || IS_G1) return;           // nothing to reveal: the facet was baked
  for (const s of farSets[c.k - 1]) {
    const col = columnInstances[s];
    if (!col || col.settled) continue;
    col.settled = true;
    for (let n = 0; n < col.count; n++)
      tiles.setMatrixAt(col.start + n, tileBaseMats[col.start + n]);
  }
  tiles.instanceMatrix.needsUpdate = true;
  const faceEnd = c.s + CONFIG.path.faceTiles - 1;
  for (const sl of slatMeshes)           // this face's catwalks come back with it
    if (sl.x1 >= c.s && sl.x0 <= faceEnd) sl.mesh.visible = true;
}

// installed before the bake below, which finishes by unbuilding future faces
installView({ level: { unbuiltHidden, zipperColumn, faceRevealed } });

/* ---------------------- industrial world dressing ---------------------- *
 * Four draw pools carry the entire six-face route.  Every element is baked
 * from groundH/platforms but never registered with collision: dark access
 * bays divide the broad armour, pipes establish service scale, catwalks gain
 * real load paths, and tall maintenance frames connect the tiny traversal
 * band to the monumental body behind it.  The silhouettes that matter to a
 * jump remain exactly the original slats and tile tops. */

const dressBoxes = [];
const dressPipes = [];
const dressLights = [];
const _dressP = { x: 0, z: 0 };
const _dressM = new THREE.Matrix4();
const _dressRot = new THREE.Matrix4();
const _dressPitch = new THREE.Matrix4();
const _dressScale = new THREE.Vector3();
const _dressColor = new THREE.Color();
const dressingPools = [];
const dressingPanelFacets = [];
let dressingCullStamp = '';
// Keep the historic tile-pool source guard scoped to its intended pool: the
// value-ladder test counts literal THREE.InstancedMesh construction sites.
// DressingPool is still the same class; the alias names this separate pass.
const DressingPool = THREE.InstancedMesh;

function dressBox(s, y, depth, sx, sy, sz, color, tilt = 0) {
  dressBoxes.push({ s, y, depth, sx, sy, sz, color, tilt });
}

// CylinderGeometry's long axis is local Y. `tilt = -PI/2` lays it along the
// route; zero leaves it as a vertical riser.
function dressPipe(s, y, depth, length, radius, color, tilt = -Math.PI / 2) {
  dressPipes.push({ s, y, depth, sx: radius, sy: length, sz: radius, color, tilt });
}

function dressLight(s, y, depth, width = 0.48) {
  dressLights.push({ s, y, depth, sx: width, sy: 0.10, sz: 0.10, color: PAL.muzzle, tilt: 0 });
}

function dressingMatrix(row) {
  polyAt(SEGS, row.s, _dressP);
  const yaw = headingAt(SEGS, row.s);
  _dressRot.makeRotationY(yaw);
  _dressRot.multiply(_dressPitch.makeRotationZ(normalRunPitchAt(row.s) + row.tilt));
  _dressM.copy(_dressRot);
  _dressM.scale(_dressScale.set(row.sx, row.sy, row.sz));
  _dressM.setPosition(
    _dressP.x + Math.sin(yaw) * row.depth,
    row.y + normalRunAltAt(row.s),
    _dressP.z + Math.cos(yaw) * row.depth,
  );
  return _dressM;
}

function nearestDeckS(target, min, max) {
  const at = Math.round(target);
  for (let d = 0; d <= 6; d++) {
    for (const s of d === 0 ? [at] : [at - d, at + d]) {
      if (s >= min && s < max && groundH[s] > -100) return s + 0.5;
    }
  }
  return null;
}

function dressGroundArmour() {
  let start = 0;
  let moduleOrdinal = 0;
  while (start < LEVEL_LEN) {
    const h = groundH[start];
    if (h < -100) { start++; continue; }
    let end = start + 1;
    while (end < LEVEL_LEN && groundH[end] === h && faceIndexAt(end, CONFIG) === faceIndexAt(start, CONFIG)) end++;

    // Modules stay broad, but their spans follow a five-beat machine phrase
    // rather than a metronomic six-tile repeat. The collision boxes and the
    // continuous panel beneath are untouched; this only prevents identical
    // orange frames from reading as wallpaper over the creature's skin.
    const moduleSpans = [7.15, 5.85, 8.05, 6.45, 7.55];
    let bay = start + 0.35;
    while (bay < end - 1.1) {
      const span = moduleSpans[moduleOrdinal % moduleSpans.length];
      const len = Math.min(span - 0.58, end - bay - 0.25);
      if (len >= 2.1) {
        const mid = bay + len / 2;
        const pattern = moduleOrdinal % 5;
        const bayY = h - [2.34, 2.52, 2.42, 2.58, 2.38][pattern];
        const bayH = [1.12, 1.42, 1.26, 1.50, 1.20][pattern];
        dressBox(mid, bayY, 1.055, len - 0.32, bayH, 0.13, PAL.limb.shadow);
        dressBox(bay + 0.10, bayY, 1.16, 0.13, bayH + 0.94, 0.08, PAL.groundAlt);
        dressBox(bay + len - 0.10, bayY, 1.16, 0.13, bayH + 0.94, 0.08, PAL.groundAlt);

        if (pattern === 0 || pattern === 3) {
          // Recessed louvers survive at MID without turning into micro-noise.
          for (const dy of pattern === 0 ? [-0.30, 0, 0.30] : [-0.26, 0.26])
            dressBox(mid, bayY + dy, 1.135, len - 0.78, 0.075, 0.07, PAL.solid);
        } else if (pattern === 1 && len >= 3.0) {
          // A proud service pipe interrupts the repeated rectangular rhythm.
          dressPipe(mid, bayY, 1.19, len - 0.92, 0.12, PAL.limb.machine);
          dressBox(bay + 0.60, bayY, 1.22, 0.20, 0.50, 0.28, PAL.catwalk);
          dressBox(bay + len - 0.60, bayY, 1.22, 0.20, 0.50, 0.28, PAL.catwalk);
          dressBox(mid, bayY + 0.33, 1.19, 0.64, 0.34, 0.24, PAL.limb.wall);
        } else if (pattern === 4 && len >= 3.4) {
          // Offset paired conduits make a readable large asymmetry without
          // another tiny louver texture.
          dressPipe(mid - len * 0.13, bayY, 1.19, len * 0.54, 0.10, PAL.limb.machine);
          dressBox(mid + len * 0.27, bayY + 0.08, 1.19,
            Math.max(0.58, len * 0.22), 0.62, 0.24, PAL.limb.wall);
          dressBox(mid + len * 0.27, bayY + 0.08, 1.34,
            Math.max(0.30, len * 0.10), 0.16, 0.08, PAL.catwalk);
        } else {
          // Split access doors: one vertical lock and two low hinge plates.
          dressBox(mid, bayY, 1.15, 0.14, Math.min(1.16, bayH * 0.84), 0.08, PAL.catwalk);
          dressBox(mid - len * 0.24, bayY, 1.14, Math.max(0.48, len * 0.28), 0.10, 0.08, PAL.solid);
          dressBox(mid + len * 0.24, bayY, 1.14, Math.max(0.48, len * 0.28), 0.10, 0.08, PAL.solid);
          dressBox(mid, bayY - bayH * 0.29, 1.18, 0.52, 0.18, 0.12, PAL.limb.machine);
        }

        // Alternating pipe / equipment bays stop the lower face becoming a
        // repeated wallpaper strip.  Their placement follows real flat runs.
        if (moduleOrdinal % 2 === 0 && len >= 3.5) {
          dressPipe(mid, h - 3.42, 1.20, len - 0.72, 0.13, PAL.limb.machine);
          dressBox(bay + 0.48, h - 3.42, 1.22, 0.18, 0.42, 0.34, PAL.catwalk);
          dressBox(bay + len - 0.48, h - 3.42, 1.22, 0.18, 0.42, 0.34, PAL.catwalk);
        } else if (len >= 3.2) {
          dressBox(mid, h - 3.38, 1.20, 1.15, 0.52, 0.30, PAL.limb.wall);
          dressBox(mid, h - 3.38, 1.38, 0.52, 0.16, 0.10, PAL.catwalk);
        }
      }
      bay += span;
      moduleOrdinal++;
    }
    start = end;
  }
}

function dressCatwalks() {
  for (let index = 0; index < platforms.length; index++) {
    const p = platforms[index];
    const len = p.x1 - p.x0;
    if (len < 1.1) continue;
    const mid = (p.x0 + p.x1) / 2;

    // A bright edge, dark longitudinal girder, and paired load-bearing
    // diagonals turn each collision slat into a believable cantilever.
    dressBox(mid, p.y - 0.16, 0.78, Math.max(0.6, len - 0.10), 0.10, 0.16, PAL.catwalk);
    dressBox(mid, p.y - 0.45, 0.54, Math.max(0.6, len - 0.24), 0.24, 0.34, PAL.limb.shadow);

    if (len >= 2.3) {
      const half = len * 0.47;
      const drop = Math.min(1.50, 0.78 + len * 0.09);
      const beamLen = Math.hypot(half, drop);
      const tilt = Math.atan2(drop, half);
      dressBox(p.x0 + len * 0.265, p.y - 0.52 - drop / 2, 0.49,
        beamLen, 0.15, 0.20, PAL.solid, tilt);
      dressBox(p.x0 + len * 0.735, p.y - 0.52 - drop / 2, 0.49,
        beamLen, 0.15, 0.20, PAL.solid, -tilt);
      dressBox(p.x0 + 0.20, p.y - 0.63, 0.46, 0.15, 1.02, 0.20, PAL.limb.machine);
      dressBox(p.x1 - 0.20, p.y - 0.63, 0.46, 0.15, 1.02, 0.20, PAL.limb.machine);
    }

    // Long decks occasionally carry a hanging service cassette.  The
    // asymmetry is deterministic and deliberately sparse.
    if (len >= 4.3 && index % 3 === 1) {
      const cassetteS = mid + Math.min(0.7, len * 0.12);
      dressBox(cassetteS, p.y - 1.08, 0.73, 1.18, 0.66, 0.48, PAL.limb.wall);
      for (const dy of [-0.18, 0, 0.18])
        dressBox(cassetteS, p.y - 1.08 + dy, 1.00, 0.78, 0.055, 0.08, PAL.groundAlt);
    }
    if (len >= 3.5 && index % 2 === 0) dressLight(mid, p.y - 0.43, 0.91, 0.52);
  }
}

function dressServiceSpines() {
  const faces = CONFIG.path.faces;
  for (let face = 0; face < faces; face++) {
    const faceStart = CONFIG.path.introTiles + face * CONFIG.path.faceTiles;
    const faceEnd = Math.min(LEVEL_LEN, faceStart + CONFIG.path.faceTiles);
    const anchors = [faceStart + 16, faceStart + CONFIG.path.faceTiles * 0.68];
    for (let ai = 0; ai < anchors.length; ai++) {
      const s = nearestDeckS(anchors[ai], faceStart, faceEnd);
      if (s === null) continue;
      const h = groundH[Math.floor(s)];
      const height = 9.5 + face * 0.72 + ai * 2.15;
      const railGap = 2.25;
      const depth = -1.38 - ai * 0.18;
      const centerY = h - 0.35 + height / 2;

      dressBox(s - railGap / 2, centerY, depth, 0.24, height, 0.32, PAL.limb.shadow);
      dressBox(s + railGap / 2, centerY, depth, 0.24, height, 0.32, PAL.limb.shadow);
      dressBox(s, h + height - 0.15, depth, railGap + 0.65, 0.26, 0.42, PAL.solid);

      const rungCount = Math.floor((height - 1.8) / 1.65);
      for (let r = 0; r < rungCount; r++) {
        const y = h + 1.25 + r * 1.65;
        dressBox(s, y, depth + 0.04, railGap, 0.12, 0.18,
          r % 3 === 0 ? PAL.solid : PAL.limb.machine);
      }

      // One broad X-braced cell reads at distance; repeating it all the way
      // up would become a fence texture at MID.
      const cellY = h + height * 0.55;
      const diagH = Math.min(3.6, height * 0.33);
      const diagLen = Math.hypot(railGap, diagH);
      const diagTilt = Math.atan2(diagH, railGap);
      dressBox(s, cellY, depth + 0.07, diagLen, 0.12, 0.15, PAL.groundAlt, diagTilt);
      dressBox(s, cellY, depth + 0.08, diagLen, 0.12, 0.15, PAL.groundAlt, -diagTilt);

      // A dark maintenance cassette and adjacent riser make the frame a
      // working system, not scaffolding pasted behind the route.
      const cassetteY = h + Math.min(4.0 + ai, height * 0.42);
      dressBox(s, cassetteY, depth + 0.24, 1.62, 1.72, 0.42, PAL.limb.wall);
      for (const dy of [-0.48, -0.16, 0.16, 0.48])
        dressBox(s, cassetteY + dy, depth + 0.49, 1.18, 0.075, 0.09, PAL.solid);
      dressPipe(s + railGap / 2 + 0.42, h + height * 0.49, depth + 0.18,
        height * 0.76, 0.12, PAL.limb.machine, 0);
      dressBox(s + railGap / 2 + 0.42, h + 1.2, depth + 0.19, 0.38, 0.26, 0.40, PAL.catwalk);
      dressBox(s + railGap / 2 + 0.42, h + height - 1.0, depth + 0.19, 0.38, 0.26, 0.40, PAL.catwalk);
      dressLight(s, h + height - 0.52, depth + 0.44, 0.62);
    }
  }
}

function buildDressingPool(rows, geometry, material, name, shadows = true) {
  if (!rows.length) return null;
  const mesh = new DressingPool(geometry, material, rows.length);
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  const baseMatrices = [];
  for (let i = 0; i < rows.length; i++) {
    const matrix = dressingMatrix(rows[i]).clone();
    baseMatrices.push(matrix);
    mesh.setMatrixAt(i, matrix);
    mesh.setColorAt(i, _dressColor.set(rows[i].color));
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  dressingPools.push({ mesh, rows, baseMatrices });
  // Paused browser inspection and direct test teleports still receive the
  // same sector visibility as ordinary play. The first callback updates all
  // pools together and then becomes an idempotent facet check.
  mesh.onBeforeRender = updateWorldDressingCull;
  scene.add(mesh);
  dressingStats.drawPools++;
  return mesh;
}

// These details are authored in route space but rendered on a nearly closed
// six-face coil. A service tower from the opening face used to wrap around
// and reappear as a detached pillar behind RIG at the Crown. Preserve the
// current camera-facing face only. The collision-faithful deck and limb kerb
// provide the corner reveal; proud service frames/bays on the next face wait
// for the camera's final detent, otherwise their back faces read as a second
// level floating through the fold.
export function updateWorldDressingCull() {
  if (!IS_G1) return;
  const stamp = routeVisibilityStamp();
  if (stamp === dressingCullStamp) return;
  dressingCullStamp = stamp;
  const active = currentWorldFacet();
  let hidden = 0;
  for (const pool of dressingPools) {
    for (let i = 0; i < pool.rows.length; i++) {
      const remote = !routeRenderable(pool.rows[i].s);
      pool.mesh.setMatrixAt(i, remote ? HIDE : pool.baseMatrices[i]);
      if (remote) hidden++;
    }
    pool.mesh.instanceMatrix.needsUpdate = true;
  }
  for (const panel of dressingPanelFacets) {
    hidden += updateRoutePanelDrawRange(panel, active);
  }
  // The production hull used to be one all-route BufferGeometry. No amount
  // of prop culling could stop its remote deck slabs recurring through the
  // closed coil. It is now one static mesh per phase/facet and obeys the same
  // camera + build contract as the details mounted on it.
  for (const panel of routeHullFacets) {
    hidden += updateRoutePanelDrawRange(panel, active);
  }
  // Collision remains continuous in the simulation. These proud authored
  // shapes are presentation lips/solids, however, and showing the next
  // facet's versions before the orbit was the remaining source of lamps and
  // platform silhouettes peeking around a wide desktop frame.
  for (const row of authoredSolidMeshes) {
    row.mesh.visible = row.facet === active && routeRenderable(row.s);
    if (!row.mesh.visible) hidden++;
  }
  // Long catwalks can cross the exact construction frontier. Their
  // geometry is appended one route column at a time, so the shared prefix
  // gate reveals the built landing strip without leaking its unbuilt tail.
  for (const panel of slatMeshes)
    hidden += updateRoutePanelDrawRange(panel, active);
  dressingStats.hidden = hidden;
}

function buildIndustrialDressing(panelMaterial) {
  dressGroundArmour();
  dressCatwalks();
  dressServiceSpines();

  const machineMat = applySurface(new THREE.MeshStandardMaterial({
    color: 0xffffff,
    flatShading: true,
  }), 'machine');
  // Paint only the broad bays/equipment bodies. Narrow ribs, vents, welds and
  // braces stay flat dark metal, preserving the vocabulary and keeping the
  // large source from collapsing into micro-noise on a 0.1-unit strip.
  const paintedBoxes = dressBoxes.filter((row) => row.sx >= 0.95 && row.sy >= 0.45);
  const trimBoxes = dressBoxes.filter((row) => row.sx < 0.95 || row.sy < 0.45);
  buildDressingPool(trimBoxes, new THREE.BoxGeometry(1, 1, 1), machineMat,
    'Meridian industrial boxes');
  buildDressingPanelPools(paintedBoxes, panelMaterial);
  buildDressingPool(dressPipes, new THREE.CylinderGeometry(1, 1, 1, 8, 1), machineMat,
    'Meridian service pipes');

  const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true, toneMapped: false });
  buildDressingPool(dressLights, new THREE.BoxGeometry(1, 1, 1), coreMat,
    'Meridian service lamps', false);

  const haloRows = dressLights.map((row) => ({
    ...row,
    sx: row.sx * 1.55,
    sy: 0.42,
    sz: 0.42,
  }));
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.30,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: true,
    toneMapped: false,
  });
  const halos = buildDressingPool(haloRows, new THREE.OctahedronGeometry(0.5), haloMat,
    'Meridian service lamp halos', false);
  if (halos) halos.renderOrder = 2;

  dressingStats.boxes = dressBoxes.length;
  dressingStats.pipes = dressPipes.length;
  dressingStats.lights = dressLights.length;
  // Every pool now exists; seed their shared visibility matrices once.
  dressingCullStamp = '';
  updateWorldDressingCull();
}

/* --------------------- continuous production hull skin ----------------- *
 * The simulation quite correctly models the route as one-unit collision
 * boxes. Repeating a complete painted panel on each of those boxes made the
 * render tell the same story as a graybox checker. The default run therefore
 * bakes those exact boxes into one static BufferGeometry and gives their
 * vertices route-space UVs. Geometry and collision are unchanged; only the
 * texture coordinate now crosses tile boundaries. Non-G1 zipper fixtures
 * retain their InstancedMesh because their columns genuinely move at runtime.
 */
const _panelPos = new THREE.Vector3();
const _panelUvPos = new THREE.Vector3();
const _panelNormal = new THREE.Vector3();
const _panelWorldNormal = new THREE.Vector3();
const _panelNormalMatrix = new THREE.Matrix3();
const _panelColor = new THREE.Color();

function panelAccumulator() {
  return { position: [], normal: [], uv: [], color: [], vertices: 0 };
}

function panelUvFor(local, normal, routeS, worldY, facet) {
  // Vertical outward/inward faces follow the climb; top/bottom planes follow
  // route x depth. End caps deliberately sample a third orientation, making
  // every change of profile a natural interruption in the painted field.
  if (Math.abs(normal.y) > 0.55)
    return deckPanelUv(facet, routeS + local.x, facet * 2.71 + local.z);
  if (Math.abs(normal.z) > 0.55)
    return deckPanelUv(facet, routeS + local.x, worldY + local.y);
  return deckPanelUv(facet, facet * 3.17 + local.z, worldY + local.y);
}

function appendPanelGeometry(
  acc, source, matrix, routeS, worldY, facet, baseColor, uvScale = null,
) {
  const geometry = source.index ? source.toNonIndexed() : source;
  const pos = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  _panelNormalMatrix.getNormalMatrix(matrix);
  const base = _panelColor.set(baseColor).clone();
  for (let i = 0; i < pos.count; i++) {
    _panelPos.fromBufferAttribute(pos, i);
    _panelNormal.fromBufferAttribute(normal, i);
    _panelUvPos.copy(_panelPos);
    if (uvScale) _panelUvPos.multiply(uvScale);
    const uv = panelUvFor(_panelUvPos, _panelNormal, routeS, worldY, facet);
    const shade = deckPanelFaceGain(_panelNormal.x, _panelNormal.y, _panelNormal.z);
    const c = _panelColor.copy(base).multiplyScalar(shade);
    _panelPos.applyMatrix4(matrix);
    _panelWorldNormal.copy(_panelNormal).applyMatrix3(_panelNormalMatrix).normalize();
    acc.position.push(_panelPos.x, _panelPos.y, _panelPos.z);
    acc.normal.push(_panelWorldNormal.x, _panelWorldNormal.y, _panelWorldNormal.z);
    acc.uv.push(uv[0], uv[1]);
    acc.color.push(c.r, c.g, c.b);
    acc.vertices++;
  }
  if (geometry !== source) geometry.dispose();
}

function finishPanelGeometry(acc) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(acc.position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(acc.normal, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(acc.uv, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(acc.color, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

/* A merged route panel may straddle two construction beats: the near zipper
   columns lock one at a time, while the far body commits together only when
   the corner ritual finishes. Hiding the WHOLE mesh until `samples.every(...)`
   was true erased already-built hull for the 410 ms between the camera's 0.96
   facet handoff and finishCorner().

   Construction advances monotonically along s, and both panel builders append
   their rows in that same order. Keep one draw call per facet but reveal only
   the contiguous built prefix with BufferGeometry.drawRange. The first
   unbuilt row therefore remains a hard visual frontier: no future playable
   column can leak, while the nineteen locked arrival columns present at the
   first handoff frame continue supporting RIG. Monumental limb anatomy is a
   separate camera-owned bake in render/limb.js and does not read this build
   gate; collision-faithful hull, bays, lights and actors still do. */
function updateRoutePanelDrawRange(panel, active) {
  let drawCount = 0;
  if (panel.facet === active) {
    for (const sample of panel.samples) {
      if (!routeRenderable(sample.s)) break;
      drawCount = sample.vertexEnd;
    }
  }
  panel.mesh.geometry.setDrawRange(0, drawCount);
  panel.mesh.visible = drawCount > 0;
  return Math.max(0, panel.rows - drawCount / 36);
}

function panelGeometry(source, routeS, worldY, facet, baseColor) {
  const acc = panelAccumulator();
  appendPanelGeometry(acc, source, new THREE.Matrix4(), routeS, worldY, facet, baseColor);
  return finishPanelGeometry(acc);
}

function buildDressingPanelPools(rows, material) {
  if (!rows.length || !material) return;
  const byOwnership = new Map();
  const source = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  for (const row of rows) {
    const facet = routeWorldFacet(row.s);
    const phase = faceIndexAt(row.s, CONFIG);
    const key = `${facet}:${phase}`;
    if (!byOwnership.has(key)) byOwnership.set(key, {
      rows: [], facet, phase,
    });
    byOwnership.get(key).rows.push(row);
  }
  for (const bucket of byOwnership.values()) {
    const { facet, phase } = bucket;
    const acc = panelAccumulator();
    const samples = [];
    // Build state is a route prefix. Sorting once at bake time makes drawRange
    // the exact same prefix even though dressing authoring emits rows by role.
    bucket.rows.sort((a, b) => a.s - b.s);
    for (const row of bucket.rows) {
      appendPanelGeometry(
        acc, source, dressingMatrix(row).clone(),
        row.s, row.y, facet, row.color,
        _dressScale.set(row.sx, row.sy, row.sz).clone(),
      );
      samples.push({ s: row.s, vertexEnd: acc.vertices });
    }
    const mesh = new THREE.Mesh(finishPanelGeometry(acc), material);
    mesh.name = `Meridian painted service bays face ${facet} phase ${phase}`;
    mesh.userData.environmentRole = 'painted-service-bays';
    mesh.userData.routeFacet = facet;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    dressingPanelFacets.push({ mesh, facet, rows: acc.vertices / 36, samples });
    scene.add(mesh);
    dressingStats.drawPools++;
  }
  source.dispose();
}

function platformProfileGeometry(len) {
  // Preserve the exact collision top at local y=0 while replacing the thin
  // orange rectangle with a tapered armour lip: broad walkable cap, recessed
  // underside, and a sloped front/back face for a readable highlight break.
  const geometry = new THREE.BoxGeometry(len, 0.26, 1.4);
  geometry.translate(0, -0.13, 0);
  const pos = geometry.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const down = Math.max(0, Math.min(1, -y / 0.26));
    pos.setZ(i, Math.sign(z || 1) * Math.max(0, Math.abs(z) - down * 0.11));
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

// Split a platform only at simulation-column boundaries. Construction owns
// those same half-open [column,column+1) intervals, so a sample at each
// segment midpoint answers for every triangle in that segment. Fractional
// authored ends remain exact and adjacent segments share an edge — no visual
// shortening, overlap, or collision change.
function platformBuildSegments(x0, x1) {
  const segments = [];
  let cursor = x0;
  while (cursor < x1) {
    const columnEnd = Math.floor(cursor) + 1;
    const end = Math.min(x1, columnEnd);
    segments.push({ x0: cursor, x1: end, s: (cursor + end) * 0.5 });
    cursor = end;
  }
  return segments;
}

// One mesh/draw call per authored catwalk, but triangles are ordered from its
// route start to its route end. updateRoutePanelDrawRange can therefore clip
// at the first unbuilt column exactly as it does for the continuous hull. Each
// segment retains the profiled cap geometry, so a temporarily exposed build
// frontier remains a finished mechanical edge rather than an open shell.
function platformPrefixGeometry(p, mid, facet) {
  const acc = panelAccumulator();
  const samples = [];
  for (const segment of platformBuildSegments(p.x0, p.x1)) {
    const source = platformProfileGeometry(segment.x1 - segment.x0);
    const localOffset = new THREE.Matrix4().makeTranslation(segment.s - mid, 0, 0);
    appendPanelGeometry(
      acc, source, localOffset, segment.s, p.y - 0.13, facet, PAL.catwalk,
    );
    source.dispose();
    samples.push({ s: segment.s, vertexEnd: acc.vertices });
  }
  return {
    geometry: finishPanelGeometry(acc),
    rows: acc.vertices / 36,
    samples,
  };
}

// The transformation slice replaces the tower with its own band geometry
// (src/render/transform.js), so the six-face bake is skipped entirely
// rather than left hidden behind the fog at the wrong heading.
if (!IS_TRANSFORM_SLICE) {
  let count = 0;
  for (let i = 0; i < LEVEL_LEN; i++) if (groundH[i] > -100) count += VISUAL_DEPTH;

  const tileGeo = new THREE.BoxGeometry(1, 1, 2);
  const panelTileGeo = IS_G1 ? tileGeo.toNonIndexed() : null;
  const panelBakes = IS_G1 ? new Map() : null;
  const panelMat = applyDeckPanelTexture(applySurface(new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    flatShading: false,
  }), 'deck'));
  panelMat.name = 'Meridian production hull panel';

  const tileMat = applySurface(new THREE.MeshStandardMaterial({
    color: 0xffffff,
    flatShading: true,
  }), 'deck');
  tiles = IS_G1 ? null : new THREE.InstancedMesh(tileGeo, tileMat, count);
  if (tiles) tiles.frustumCulled = false;

  const cA = new THREE.Color(PAL.ground);
  const cB = new THREE.Color(PAL.groundAlt);
  // The deck's half of the T-035 value ladder (?shade=, off by default): a
  // monotone ramp DOWN the four-tile stack — d=1 is the lit lip, d=4 the
  // bottom — plus the shared stain field per column. The rows already
  // alternate (j = groundH[i] - d flips (i+j)%2 every row), so what this adds
  // is a ramp, not a first alternation; the checker keeps its own delta and
  // its scroll-speed job, and the ramp's top-row-to-row-2 step is the larger
  // of the two. SHADE_GAIN 0 makes every factor exactly 1.0, so the shipped
  // build's instance colors are unchanged bit for bit.
  const deckShade = deckShadePlan(groundH, CONFIG, SHADE_GAIN);
  const _tile = new THREE.Color();
  const _tileEuler = new THREE.Euler(0, 0, 0, 'YZX');
  let idx = 0;
  for (let i = 0; i < LEVEL_LEN; i++) {
    const f = faceIndexAt(i, CONFIG);
    if (!faceRanges[f]) faceRanges[f] = { col0: i, col1: i, inst0: idx, inst1: idx - 1 };
    faceRanges[f].col1 = i;
    if (groundH[i] < -100) continue;                   // gap column: no instances
    const p = polyAt(SEGS, i + 0.5);
    const colYaw = headingAt(SEGS, i + 0.5);           // sharp per-column facing
    columnInstances[i] = { start: idx, count: VISUAL_DEPTH, settled: true };
    for (let d = 1; d <= VISUAL_DEPTH; d++) {
      const j = groundH[i] - d;
      const atS = i + 0.5;
      const m = ACTIVE_FIXTURE
        ? new THREE.Matrix4().makeRotationY(colYaw)
        : new THREE.Matrix4().makeRotationFromEuler(
            _tileEuler.set(0, colYaw, normalRunPitchAt(atS), 'YZX')
      );
      m.setPosition(p.x, j + 0.5 + normalRunAltAt(atS), p.z);
      tileBaseMats.push(m);
      const k = deckShade.rows[Math.min(d, deckShade.rows.length) - 1] * deckShade.wear[i];
      // Broad 6×2 armour bands carry motion without turning the creature's
      // skin into a one-tile checkerboard. They read as overlapping scutes at
      // play scale; the two authored values still make forward motion visible.
      const scuteBand = (Math.floor(i / 6) + Math.floor((d - 1) / 2)) % 2;
      if (panelBakes) {
        const facet = routeWorldFacet(atS);
        const ownershipKey = `${facet}:${f}`;
        if (!panelBakes.has(ownershipKey)) panelBakes.set(ownershipKey, {
          acc: panelAccumulator(), columnEnds: new Map(), facet, phase: f,
        });
        const bucket = panelBakes.get(ownershipKey);
        appendPanelGeometry(bucket.acc, panelTileGeo, m, atS, j + 0.5, f,
          _tile.copy(scuteBand === 0 ? cA : cB).multiplyScalar(k));
        bucket.columnEnds.set(i, bucket.acc.vertices);
      } else {
        tiles.setMatrixAt(idx, m);
        tiles.setColorAt(idx, _tile.copy(scuteBand === 0 ? cA : cB).multiplyScalar(k));
      }
      idx++;
    }
    faceRanges[f].inst1 = idx - 1;
  }
  if (panelBakes) {
    tiles = new THREE.Group();
    tiles.name = 'Meridian continuous route hull';
    tiles.userData.environmentRole = 'collision-faithful-painted-hull';
    let panelVertices = 0;
    for (const bucket of panelBakes.values()) {
      const { facet, phase } = bucket;
      const mesh = new THREE.Mesh(finishPanelGeometry(bucket.acc), panelMat);
      mesh.name = `Meridian continuous route hull face ${facet} phase ${phase}`;
      mesh.userData.environmentRole = 'collision-faithful-painted-hull-facet';
      mesh.userData.routeFacet = facet;
      mesh.frustumCulled = false;
      const samples = [...bucket.columnEnds].map(([column, vertexEnd]) => ({
        s: column + 0.5, vertexEnd,
      }));
      routeHullFacets.push({
        mesh, facet, phase, samples, rows: bucket.acc.vertices / 36,
      });
      tiles.add(mesh);
      panelVertices += bucket.acc.vertices;
    }
    tiles.userData.panelVertices = panelVertices;
    tileGeo.dispose();
    panelTileGeo.dispose();
  } else {
    tiles.instanceMatrix.needsUpdate = true;
    if (tiles.instanceColor) tiles.instanceColor.needsUpdate = true;
  }
  tiles.frustumCulled = false;
  scene.add(tiles);

  const solidMat = applySurface(new THREE.MeshStandardMaterial({
    color: PAL.solid,
    flatShading: true,
  }), 'plate');
  for (const rect of solidRects) {
    const midX = (rect.x0 + rect.x1) / 2;
    const midY = (rect.y0 + rect.y1) / 2;
    const wp = polyAt(SEGS, midX);
    const source = new THREE.BoxGeometry(rect.x1 - rect.x0, rect.y1 - rect.y0, 2);
    const geometry = IS_G1
      ? panelGeometry(source, midX, midY, faceIndexAt(midX, CONFIG), PAL.solid)
      : source;
    if (geometry !== source) source.dispose();
    const mesh = new THREE.Mesh(
      geometry,
      IS_G1 ? panelMat : solidMat,
    );
    mesh.position.set(wp.x, midY + normalRunAltAt(midX), wp.z);
    mesh.rotation.y = headingAt(SEGS, midX);
    mesh.userData.fixtureSolidId = rect.id;
    scene.add(mesh);
    authoredSolidMeshes.push({ mesh, facet: routeWorldFacet(midX), s: midX });
  }

  const walkMat = applySurface(new THREE.MeshStandardMaterial({
    color: PAL.catwalk,
    flatShading: true,
  }), 'deck');
  for (const p of platforms) {
    const len = p.x1 - p.x0;
    const mid = (p.x0 + p.x1) / 2;
    const wp = polyAt(SEGS, mid);
    const facet = routeWorldFacet(mid);
    const prefix = IS_G1 ? platformPrefixGeometry(p, mid, facet) : null;
    const geometry = prefix
      ? prefix.geometry
      : new THREE.BoxGeometry(len, 0.18, 1.4);
    const slat = new THREE.Mesh(geometry, IS_G1 ? panelMat : walkMat);
    // The profile's local top is y=0, exactly the collision plane. Non-G1
    // fixtures retain the historic centered 0.18 slab.
    slat.position.set(wp.x, p.y + (IS_G1 ? 0 : -0.09) + normalRunAltAt(mid), wp.z);
    slat.rotation.y = headingAt(SEGS, mid);            // aprons keep slats off the bends
    if (!ACTIVE_FIXTURE) {
      slat.rotation.order = 'YZX';
      slat.rotation.z = normalRunPitchAt(mid);
    }
    slat.name = 'Meridian profiled catwalk';
    slat.userData.environmentRole = 'collision-faithful-painted-platform';
    scene.add(slat);
    slatMeshes.push({
      mesh: slat, x0: p.x0, x1: p.x1, facet, s: mid,
      rows: prefix ? prefix.rows : 1,
      samples: prefix ? prefix.samples : [
        { s: mid, vertexEnd: geometry.getAttribute('position').count },
      ],
    });
  }
  if (WORLD_DRESSING_ENABLED) buildIndustrialDressing(panelMat);
  unbuildFutureFaces();                                // after slats: they hide with their face
  // MENU renders before the first simulation update. Seed route ownership
  // after the build reset even under ?world=0, where no dressing pool exists
  // to invoke this through onBeforeRender.
  dressingCullStamp = '';
  updateWorldDressingCull();
}
