/* ========================= LEVEL MESHES =========================== */
/* Instanced tiles, catwalk slats, and the authored solid rectangles for
   the baked level in src/sim/level.js. The zipper and face-reveal hooks
   are the visual half of the corner ritual: the sim decides when a column
   counts as built, this module moves the bricks. */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { SEGS, CORNER_S, polyAt, headingAt, faceIndexAt } from '../pure/path.js';
import { deckShadePlan } from '../pure/shade.js';
import { IS_G1, IS_TRANSFORM_SLICE } from '../mode.js';
import { installView } from '../sim/bridge.js';
import {
  LEVEL_LEN, groundH, platforms, solidRects, slamSets, farSets,
  unbuildFutureFaces,
} from '../sim/level.js';
import { scene, HIDE } from './scene.js';
import { PAL, SHADE_GAIN } from './palette.js';

// --- level meshes: baked per-face static geometry ---------------------
// Tile instances are baked once along the tower polyline with per-column
// instance ranges + base matrices (and per-face ranges for later passes),
// so the corner ritual can slam columns in without a rebuild.
const VISUAL_DEPTH = 4;
let tiles;
const tileBaseMats = [];                                  // final matrix per instance
const columnInstances = new Array(LEVEL_LEN).fill(null);  // col → {start, count, settled}
const faceRanges = [];                                    // face → {col0, col1, inst0, inst1}
const slatMeshes = [];                                    // catwalk slats {mesh, x0, x1}
const authoredSolidMeshes = [];                           // traversal-only tagged solid rectangles

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

// The transformation slice replaces the tower with its own band geometry
// (src/render/transform.js), so the six-face bake is skipped entirely
// rather than left hidden behind the fog at the wrong heading.
if (!IS_TRANSFORM_SLICE) {
  let count = 0;
  for (let i = 0; i < LEVEL_LEN; i++) if (groundH[i] > -100) count += VISUAL_DEPTH;

  const tileGeo = new THREE.BoxGeometry(1, 1, 2);
  const tileMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true });
  tiles = new THREE.InstancedMesh(tileGeo, tileMat, count);
  tiles.frustumCulled = false;

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
      const m = new THREE.Matrix4().makeRotationY(colYaw);
      m.setPosition(p.x, j + 0.5, p.z);
      tileBaseMats.push(m);
      tiles.setMatrixAt(idx, m);
      const k = deckShade.rows[Math.min(d, deckShade.rows.length) - 1] * deckShade.wear[i];
      tiles.setColorAt(idx, _tile.copy((i + j) % 2 === 0 ? cA : cB)   // checker = scroll-speed
        .multiplyScalar(k));                                         //   readability, ramped
      idx++;
    }
    faceRanges[f].inst1 = idx - 1;
  }
  scene.add(tiles);

  const solidMat = new THREE.MeshStandardMaterial({ color: PAL.solid, flatShading: true });
  for (const rect of solidRects) {
    const midX = (rect.x0 + rect.x1) / 2;
    const midY = (rect.y0 + rect.y1) / 2;
    const wp = polyAt(SEGS, midX);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(rect.x1 - rect.x0, rect.y1 - rect.y0, 2),
      solidMat
    );
    mesh.position.set(wp.x, midY, wp.z);
    mesh.rotation.y = headingAt(SEGS, midX);
    mesh.userData.fixtureSolidId = rect.id;
    scene.add(mesh);
    authoredSolidMeshes.push(mesh);
  }

  const walkMat = new THREE.MeshStandardMaterial({ color: PAL.catwalk, flatShading: true });
  for (const p of platforms) {
    const len = p.x1 - p.x0;
    const mid = (p.x0 + p.x1) / 2;
    const wp = polyAt(SEGS, mid);
    const slat = new THREE.Mesh(new THREE.BoxGeometry(len, 0.18, 1.4), walkMat);
    slat.position.set(wp.x, p.y - 0.09, wp.z);
    slat.rotation.y = headingAt(SEGS, mid);            // aprons keep slats off the bends
    scene.add(slat);
    slatMeshes.push({ mesh: slat, x0: p.x0, x1: p.x1 });
  }
  unbuildFutureFaces();                                // after slats: they hide with their face
}
