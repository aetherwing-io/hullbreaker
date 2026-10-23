/* ============================= LEVEL ============================== */
/* Baked level data plus the collision predicates over it. The seeded
   generator (src/pure/generator.js) produces the geometry; this module
   owns the runtime queries. Tile instances for the same columns live in
   src/render/level.js.

   T-201 (decisions.md entry 25, inbox I-105): the six-face run no longer
   keeps a built/unbuilt column state. Every face beyond the current corner
   used to be inert until the retired brick-slam zipper "slammed it in" during
   the ritual, which made weapon capsules, wasp dive floors, flame crawl and
   bullets treat the pre-bend column RIG fights from as a hole — and would let
   a survivor that follows RIG round a corner fall through a deck the player
   can see. Under the static-anatomy rule (entry 3) the next stretch
   pre-exists and is revealed; the sim now agrees: in the six-face run every
   column exists from boot. Only the traversal slice still marks the six-face
   corners' faces inert, as it always has: its play area ends before the first
   corner, its renderer hides those columns, and nothing ever settles them. */

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

// Column lists of every face after each corner, split where the retired
// zipper strip used to end. src/render/level.js still hides these tiles in
// the traversal slice (unbuiltHidden), and so does the sim below; the six-face
// run reads neither. (Kept under their historical names because the render
// module imports them; lane T-121 owns that consumer.)
export const slamSets = [];                               // corner k-1 → first zipCols arrival columns
export const farSets = [];                                // corner k-1 → rest of the next face
for (const cs of CORNER_S) {
  const strip = [], far = [];
  const faceEnd = Math.min(cs + CONFIG.path.faceTiles - 1, LEVEL_LEN - 1);
  for (let s = cs; s <= Math.min(cs + CONFIG.waves.zipCols - 1, LEVEL_LEN - 1); s++) strip.push(s);
  for (let s = cs + CONFIG.waves.zipCols; s <= faceEnd; s++) far.push(s);
  slamSets.push(strip);
  farSets.push(far);
}

// Column state: 1 = this column exists in the world and collides. Gap
// columns are never marked, and their queries are identical either way
// because groundH already reports them empty. In the six-face run every
// column is 1 for the whole run (T-201: nothing builds it; nothing settles
// it). The traversal slice marks the six-face corners' faces 0 at every reset
// and never changes them.
const built = new Uint8Array(LEVEL_LEN).fill(1);
let buildRevision = 0;

export function columnHasGround(s) { return groundH[s] > -100; }
export function columnBuilt(s) { return built[s] === 1; }
// Changes only when the traversal slice's reset marks its beyond-the-slice
// columns (read by src/render/route-visibility.js's cache stamp).
export function levelBuildRevision() { return buildRevision; }

// Boot and every run reset (src/boot/run-reset.js 'future-faces'). The
// transformation fixture owns its own bands (src/sim/transform.js) and the
// six-face run has nothing to mark; only the traversal slice keeps the faces
// beyond its play area inert, matching its renderer.
export function unbuildFutureFaces() {
  if (IS_TRANSFORM_SLICE) return;
  if (IS_TRAVERSAL_SLICE) {
    let changed = false;
    for (const sets of [slamSets, farSets])
      for (const cols of sets)
        for (const s of cols) if (columnHasGround(s) && built[s] !== 0) {
          built[s] = 0;
          changed = true;
        }
    if (changed) buildRevision++;
  }
  view.level.unbuiltHidden();            // render: unchanged presentation hook
}

// Terrain queries for everything but RIG's own collision (projectiles, wasp
// dive floors, flame crawl, mortar zones, capsules). In the six-face run they
// are the plain geometry queries (every column is built); in the traversal
// slice the inert columns beyond its play area do not collide, matching the
// tiles its renderer hides. The names are historical (zipper-era callers).
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
