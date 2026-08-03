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
import { groundTopAt, levelData, spawnLaneY } from './level.js';
import { spawnHostile } from './hostiles.js';
import { cornerBusy } from './wavegate.js';
import { transformBusy } from './transform.js';
import { finaleActive } from './finale.js';

// The transformation fixture authors its ambient table by hand (lanes
// included, so it consumes none of the seeded lane rng) and keeps every
// entry outside its seam-clear zones.
//
// The six-face table is built from THIS run's level, not a fresh one: the
// houndframe stations carry the deck plate they ride (src/pure/lattice.js),
// and a station derived from a second, discarded build would be riding a
// level the player never touches. It is the same geometry either way — the
// build is deterministic and asserted so — but "the same by construction"
// beats "the same by luck", and it saves the ~10 ms second build the default
// argument used to pay for at boot.
export const spawnTable = IS_TRANSFORM_SLICE
  ? (SLICE_ENEMIES_ENABLED ? TRANSFORM_FIXTURE.spawns : [])
  : IS_TRAVERSAL_SLICE ? [] : buildSpawnTable(CONFIG, levelData);
let spawnIdx = 0;
let spawnRng = mulberry32(9001);

export function updateSpawner() {
  if (IS_TRAVERSAL_SLICE) return;         // fixture spawns are authored per attempt
  if (finaleActive()) return;             // the Crown arena owns its three packets
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
      // Normal-run carriers carry their phase-authored drop on the spawn row;
      // fixture/legacy rows without one keep capsules.js's seeded fallback.
      spawnHostile(s.x, spawnLaneY(s.x, CONFIG.carrier.laneAbove), 0, 'carrier', s);
    } else if (s.type === 'hound') {
      // Deck units authored in a table, from two authors and one branch:
      //  - T-009's six-face lattice stations carry the deck plate they ride
      //    (src/pure/lattice.js), so the ride height is derived from the row
      //    the way the traversal enemy plan derives it;
      //  - a fixture-authored row (the G2 gate) has no deck and rides the
      //    terrain under its spawn column.
      // Either way the entry itself is passed as the row, so dir, patrol,
      // tune and the gating opt-out all ride through unchanged.
      const rideY = s.deck !== undefined
        ? s.deck + CONFIG.hound.rideY
        : groundTopAt(s.x);
      spawnHostile(s.x, rideY, s.delayMs || 0, 'hound', s);
    } else if (s.type === 'polyp') {
      const rootY = (s.deck !== undefined ? s.deck : groundTopAt(s.x)) + CONFIG.polyp.rootY;
      spawnHostile(s.x, rootY, s.delayMs || 0, 'polyp', s);
    } else if (s.type === 'mortar') {
      const bodyY = (s.deck !== undefined ? s.deck : groundTopAt(s.x)) + CONFIG.mortar.bodyY;
      spawnHostile(s.x, bodyY, s.delayMs || 0, 'mortar', s);
    } else if (s.lane !== undefined) {          // authored lane (fixture table)
      spawnHostile(s.x, spawnLaneY(s.x, s.lane), s.delayMs || 0, 'wasp', s);
    } else {
      const r = spawnRng();
      const lane = r < 0.45 ? 2.6 : r < 0.8 ? 4.6 : 7.2;   // low / mid / high tier
      spawnHostile(s.x, spawnLaneY(s.x, lane + spawnRng() * 0.8),
        s.delayMs || 0, 'wasp', s);
    }
  }
}

// run reset (resetGame in src/main.js): the ambient table rewinds to its
// first entry and its seeded lane rng restarts
export function resetSpawner() {
  spawnIdx = 0;
  spawnRng = mulberry32(9001);
}
