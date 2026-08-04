/* ============================= LEVEL ============================== */
/* Baked level data plus the collision predicates over it. The seeded
   generator (src/pure/generator.js) produces the geometry; this module
   owns the runtime queries and the built/unbuilt column state that makes
   faces beyond the current corner inert until their ritual slams them in.
   Tile instances for the same columns live in src/render/level.js. */

import { CONFIG } from '../config.js';
import { CORNER_S } from '../pure/path.js';
import { buildLevel, buildTraversalLevel, levelSolidCell } from '../pure/generator.js';
import { buildTransformLevel } from '../pure/transform.js';
import {
  ACTIVE_FIXTURE, ACTIVE_SLICE, IS_TRANSFORM_SLICE, IS_TRAVERSAL_SLICE,
  MOMENTUM_ENABLED,
} from '../mode.js';
import { view } from './bridge.js';
import { momentumScrollSpeed, paceSpeed } from './pace.js';

const TILE_DEPTH = 8;           // solid tiles below each surface (collision)

export const LEVEL_LEN = CONFIG.levelLength;
export const END_SCROLL = LEVEL_LEN - 30;
export function activeScrollEnd() { return ACTIVE_FIXTURE ? ACTIVE_FIXTURE.run.endScroll : END_SCROLL; }
// The pursuing edge is a constant in the shipped run, in the `base` slice pace
// and in the transformation fixture; the CP1 variants make it a behavior, so
// the traversal slice's live value comes from sim/pace.js.
// run.minimumScrollSpeed stays the declared cruise floor.
// With ?momentum=1 (T-022, six-face run only) that six-face constant becomes an
// earned value from the same module — and at drive 0 it returns
// CONFIG.scrollSpeed exactly, so the floor IS the shipped run.
export function activeScrollSpeed() {
  if (ACTIVE_SLICE) return paceSpeed();
  if (MOMENTUM_ENABLED) return momentumScrollSpeed();
  return ACTIVE_FIXTURE ? ACTIVE_FIXTURE.run.minimumScrollSpeed : CONFIG.scrollSpeed;
}
// Each fixture overlays its authored columns on the seeded layout; normal
// mode remains the seeded six-face generator byte-for-byte.
export const levelData = IS_TRAVERSAL_SLICE
  ? buildTraversalLevel(CONFIG, ACTIVE_SLICE)
  : IS_TRANSFORM_SLICE ? buildTransformLevel(CONFIG) : buildLevel(CONFIG);
export const { groundH, platforms } = levelData;
export const solidRects = levelData.solidRects || [];
// Traversable route rails are authored by the level generator in the same
// logical (s,y) space as platforms. Empty in fixtures and legacy layouts, so
// ladder movement is an optional capability rather than a new requirement.
export const ladders = levelData.ladders || [];
// T-009: the six-face run's authored pockets (src/pure/lattice.js) — geometry
// is already in groundH/platforms; this is the metadata the run reset reads to
// place each pocket's weapon capsule over its shelf tip. Empty for the
// fixtures, which author their own pickups.
export const pockets = levelData.pockets || [];

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
let buildRevision = 0;

export function columnHasGround(s) { return groundH[s] > -100; }
export function columnBuilt(s) { return built[s] === 1; }
export function levelBuildRevision() { return buildRevision; }
export function settleColumn(s) {
  if (built[s] === 1) return;
  built[s] = 1;
  buildRevision++;
}

// next faces stay unbuilt until their ritual (was hideAllSlamColumns)
export function unbuildFutureFaces() {
  // The transformation fixture replaces the tower with its own bands and
  // owns their build state (src/sim/transform.js), so the six-face corner
  // sets must not mark its columns inert.
  if (IS_TRANSFORM_SLICE) return;
  let changed = false;
  for (const sets of [slamSets, farSets])
    for (const cols of sets)
      for (const s of cols) if (columnHasGround(s) && built[s] !== 0) {
        built[s] = 0;
        changed = true;
      }
  if (changed) buildRevision++;
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
