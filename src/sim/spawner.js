/* ============================ SPAWNER ============================= */
/* Spawn director: data array keyed to scroll distance, built by the pure
   generator — density authored in seconds of scroll (scales with
   scrollSpeed), escalating per face along with the wingman pair chance.
   Roster pass extends entries with more types; this is the final
   mechanism. Corner zones are kept clean — gate waves are authored by
   the wave system, never by the ambient table. */

import { CONFIG } from '../config.js';
import { mulberry32 } from '../pure/rng.js';
import { buildSpawnTable } from '../pure/generator.js';
import { TRANSFORM_FIXTURE } from '../pure/transform.js';
import { IS_TRANSFORM_SLICE, IS_TRAVERSAL_SLICE, SLICE_ENEMIES_ENABLED } from '../mode.js';
import { sRightEdge } from './edges.js';
import { spawnLaneY } from './level.js';
import { spawnHostile } from './hostiles.js';
import { cornerBusy } from './wavegate.js';
import { transformBusy } from './transform.js';

// The transformation fixture authors its ambient table by hand (lanes
// included, so it consumes none of the seeded lane rng) and keeps every
// entry outside its seam-clear zones.
export const spawnTable = IS_TRANSFORM_SLICE
  ? (SLICE_ENEMIES_ENABLED ? TRANSFORM_FIXTURE.spawns : [])
  : IS_TRAVERSAL_SLICE ? [] : buildSpawnTable(CONFIG);
let spawnIdx = 0;
let spawnRng = mulberry32(9001);

export function updateSpawner() {
  if (IS_TRAVERSAL_SLICE) return;         // fixture spawns are authored per attempt
  if (transformBusy()) return;           // nobody arrives through a bulkhead flip
  if (cornerBusy()) return;              // gates author their own waves; on wide
                                         //   aspect ratios the halted look-ahead
                                         //   would otherwise reach past the
                                         //   corner-clear zone and drop ambient
                                         //   hostiles onto the unbuilt face
  // Trigger once the entry sits just INSIDE the view, so its materialization
  // happens on screen instead of completing past the right edge.
  const re = sRightEdge();
  while (spawnIdx < spawnTable.length && spawnTable[spawnIdx].x < re - 1.5) {
    const s = spawnTable[spawnIdx++];
    if (s.type === 'carrier') {
      spawnHostile(s.x, spawnLaneY(s.x, CONFIG.carrier.laneAbove), 0, 'carrier');
    } else if (s.type === 'hound') {
      // T-009: authored houndframe station (src/pure/lattice.js). The row
      // carries the deck it rides, its facing and its patrol span, exactly
      // like a traversal-fixture hound row, so this branch adds no policy —
      // it derives the ride height the way the fixture path does and hands
      // the row through for dir/patrol/gating.
      spawnHostile(s.x, s.deck + CONFIG.hound.rideY, 0, 'hound', s);
    } else if (s.lane !== undefined) {          // authored lane (fixture table)
      spawnHostile(s.x, spawnLaneY(s.x, s.lane), 0, 'wasp');
    } else {
      const r = spawnRng();
      const lane = r < 0.45 ? 2.6 : r < 0.8 ? 4.6 : 7.2;   // low / mid / high tier
      spawnHostile(s.x, spawnLaneY(s.x, lane + spawnRng() * 0.8));
    }
  }
}

// run reset (resetGame in src/main.js): the ambient table rewinds to its
// first entry and its seeded lane rng restarts
export function resetSpawner() {
  spawnIdx = 0;
  spawnRng = mulberry32(9001);
}
