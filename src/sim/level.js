/* ============================= LEVEL ============================== */
/* Baked level data plus the collision predicates over it. The seeded
   generator (src/pure/generator.js) produces the geometry; this module
   owns the runtime queries. Tile instances for the same columns live in
   src/render/level.js.

   T-201 (decisions.md entry 25, SPRINT I-105): the sim no longer keeps a
   built/unbuilt column state. It used to mark every face beyond the current
   corner inert until the retired brick-slam zipper "slammed it in" during the
   ritual, which made weapon capsules, wasp dive floors, flame crawl and
   bullets treat the pre-bend column RIG fights from as a hole, and would have
   let a survivor that follows RIG round the corner fall through a deck the
   player can see. Under the static-anatomy rule (entry 3) the next stretch
   pre-exists and is revealed; the sim now agrees: every column exists. */

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

// RENDER-ONLY LEGACY LISTS. src/render/level.js still imports these column
// lists for the ?zip=1 brick reveal's tile hiding (lane T-121 deletes that
// consumer and the flag under entry 25). The simulation no longer reads them:
// no column here is ever inert. Kept as plain geometry so the render module
// keeps loading until T-121 lands; delete with it.
export const slamSets = [];                               // corner k-1 -> first 31 arrival columns
export const farSets = [];                                // corner k-1 -> rest of the next face
for (const cs of CORNER_S) {
  const strip = [], far = [];
  const faceEnd = Math.min(cs + CONFIG.path.faceTiles - 1, LEVEL_LEN - 1);
  for (let s = cs; s <= Math.min(cs + CONFIG.waves.zipCols - 1, LEVEL_LEN - 1); s++) strip.push(s);
  for (let s = cs + CONFIG.waves.zipCols; s <= faceEnd; s++) far.push(s);
  slamSets.push(strip);
  farSets.push(far);
}

export function columnHasGround(s) { return groundH[s] > -100; }
// Every column exists (see the header). These two keep their names for the
// render consumers (src/render/route-visibility.js) until T-121 lands.
export function columnBuilt() { return true; }
export function levelBuildRevision() { return 0; }

// Boot and every run reset: the render half (its ?zip=1 path and the
// traversal slice's tile bake) still hides the columns it always hid; the sim
// marks nothing. The transformation fixture owns its own bands.
export function unbuildFutureFaces() {
  if (IS_TRANSFORM_SLICE) return;
  view.level.unbuiltHidden();            // render: unchanged presentation hook
}

// The terrain queries projectiles, wasp dive floors, flame crawl, mortar zones
// and capsules use. They were build-gated by the zipper; they are the plain
// geometry queries now, and keep their names for their (unfenced) callers.
export function builtSolidAt(x, y) { return isSolid(Math.floor(x), Math.floor(y)); }
export function builtGroundTopAt(x) { return groundTopAt(x); }

// helper shared by every spawn site: lane altitude over local ground,
// gap-safe, capped so hostiles stay in the fightable band
export function spawnLaneY(s, lane, cap = 10) {
  const base = groundTopAt(s);
  return Math.min((base > -100 ? base : 3) + lane, cap);
}
