/* ============================= LEVEL ============================== */
/* Baked level data plus the collision predicates over it. The seeded
   generator (src/pure/generator.js) produces the geometry; this module
   owns the runtime queries and the built/unbuilt column state that makes
   faces beyond the current corner inert until their ritual slams them in.
   Tile instances for the same columns live in src/render/level.js. */

import { CONFIG } from '../config.js';
import { CORNER_S } from '../pure/path.js';
import { buildLevel, buildTraversalLevel, levelSolidCell } from '../pure/generator.js';
import { ACTIVE_SLICE, IS_TRAVERSAL_SLICE } from '../mode.js';
import { view } from './bridge.js';

const TILE_DEPTH = 8;           // solid tiles below each surface (collision)

export const LEVEL_LEN = CONFIG.levelLength;
export const END_SCROLL = LEVEL_LEN - 30;
export function activeScrollEnd() { return ACTIVE_SLICE ? ACTIVE_SLICE.run.endScroll : END_SCROLL; }
export function activeScrollSpeed() {
  return ACTIVE_SLICE ? ACTIVE_SLICE.run.minimumScrollSpeed : CONFIG.scrollSpeed;
}
// Traversal mode overlays one authored straight-face fixture; normal mode
// remains the seeded six-face generator byte-for-byte.
export const levelData = IS_TRAVERSAL_SLICE ? buildTraversalLevel(CONFIG) : buildLevel(CONFIG);
export const { groundH, platforms } = levelData;
export const solidRects = levelData.solidRects || [];

export function isSolid(i, j) {
  if (i < 0 || i >= LEVEL_LEN) return true;            // walls at level ends
  return levelSolidCell(levelData, i, j, TILE_DEPTH);
}
export function solidAt(x, y) { return isSolid(Math.floor(x), Math.floor(y)); }
export function groundTopAt(x) {
  const g = groundH[Math.floor(x)];
  return g > -100 ? g : -999;
}

// Face-build sets: the next face's zipper strip and the far rest beyond
// it. Both stay unbuilt until that corner's ritual, and the render layer
// bakes tile instances against the same column lists.
export const slamSets = [];                               // corner k-1 → zipper column list
export const farSets = [];                                // corner k-1 → rest of the next face
for (const cs of CORNER_S) {
  const strip = [], far = [];
  const faceEnd = Math.min(cs + CONFIG.path.faceTiles - 1, LEVEL_LEN - 1);
  for (let s = cs; s <= Math.min(cs + CONFIG.waves.zipCols - 1, LEVEL_LEN - 1); s++) strip.push(s);
  for (let s = cs + CONFIG.waves.zipCols; s <= faceEnd; s++) far.push(s);
  slamSets.push(strip);
  farSets.push(far);
}

// Built-column state: 1 = this column exists in the world and collides.
// Gap columns are never marked (nothing to build), and their queries are
// identical either way because groundH already reports them empty.
const built = new Uint8Array(LEVEL_LEN).fill(1);

export function columnHasGround(s) { return groundH[s] > -100; }
export function columnBuilt(s) { return built[s] === 1; }
export function settleColumn(s) { built[s] = 1; }

// next faces stay unbuilt until their ritual (was hideAllSlamColumns)
export function unbuildFutureFaces() {
  for (const sets of [slamSets, farSets])
    for (const cols of sets)
      for (const s of cols) if (columnHasGround(s)) built[s] = 0;
  view.level.unbuiltHidden();            // render: hide those tiles and their catwalks
}

// Settled-aware terrain queries: while a face is still unbuilt (columns
// hidden until its corner ritual slams them in), bullets and wasp floor
// checks must not collide with the invisible terrain — the face does not
// exist yet. Player collision never reaches past the corner clamp, and
// once a column locks (or the face commits) these degrade to the plain
// groundH queries.
export function builtSolidAt(x, y) {
  const i = Math.floor(x);
  if (i >= 0 && i < LEVEL_LEN) {
    if (columnHasGround(i) && !columnBuilt(i)) return false;
  }
  return isSolid(i, Math.floor(y));
}

export function builtGroundTopAt(x) {
  const i = Math.floor(x);
  if (i >= 0 && i < LEVEL_LEN) {
    if (columnHasGround(i) && !columnBuilt(i)) return -999;
  }
  return groundTopAt(x);
}

// helper shared by every spawn site: lane altitude over local ground,
// gap-safe, capped so hostiles stay in the fightable band
export function spawnLaneY(s, lane, cap = 10) {
  const base = groundTopAt(s);
  return Math.min((base > -100 ? base : 3) + lane, cap);
}
