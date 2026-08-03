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
import { faceIndexAt } from '../pure/path.js';
import { newPressureState, stepPressureDirector } from '../pure/pressure.js';
import { TRANSFORM_FIXTURE } from '../pure/transform.js';
import { IS_TRANSFORM_SLICE, IS_TRAVERSAL_SLICE, SLICE_ENEMIES_ENABLED } from '../mode.js';
import { sLeftEdge, sRightEdge } from './edges.js';
import { groundTopAt, levelData, spawnLaneY } from './level.js';
import { hostiles, kills, spawnHostile } from './hostiles.js';
import { player } from './player.js';
import { gameMs, scrollX } from './time.js';
import { activeCorner, cornerBusy } from './wavegate.js';
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
let pressureRng = mulberry32(CONFIG.spawner.pressure.seed);
let pressureState = newPressureState(0);
let pressureCohortSerial = 0;

const lessonSites = spawnTable.filter((row) => {
  const face = faceIndexAt(row.x, CONFIG);
  return CONFIG.spawner.lesson.kindByFace[face - 1] === row.type;
});

function insideLessonBubble(x) {
  return lessonSites.some((row) =>
    Math.abs(x - row.x) < CONFIG.spawner.lesson.clearTiles);
}

// Count only bodies that can presently create an on-screen decision. A
// delayed lesson remix or a rooted emplacement half a face behind RIG must
// not suppress useful pressure in the visible strip.
function visibleThreatCount(left, right) {
  let count = 0;
  for (const e of hostiles) {
    if (e.x < left - 1 || e.x > right + 1) continue;
    if (gameMs < e.enterUntil - CONFIG.wasp.enterMs) continue;
    count++;
  }
  return count;
}

/* Pick a materialization point that is already visible and never inside the
   corner apron. Prefer the familiar incoming-right silhouette; if RIG is
   waiting against the unbuilt corner wall, use a clearly visible rear flank
   instead. Rear bodies face forward and still owe the full 900 ms presence
   tell, so this closes the pre-gate lull without an offscreen ambush. */
function pressureSpawnPoint(corner, left, right) {
  const D = CONFIG.spawner.pressure;
  const safeMax = corner.s - CONFIG.spawner.cornerClearBefore - D.cornerPadTiles;
  const front = Math.min(right - D.spawnInsetTiles, safeMax);
  if (front - player.x >= D.minPlayerLeadTiles)
    return { x: front, dir: -1, room: front - player.x };

  const rear = Math.min(player.x - D.rearLeadTiles, safeMax);
  if (rear >= left + D.spawnInsetTiles && player.x - rear >= D.minPlayerLeadTiles)
    return { x: rear, dir: 1, room: player.x - rear };
  return null;
}

// Grounded/rooted pressure roles are allowed only on a short continuous deck
// patch. A gap, cliff lip, or step taller than the hound's already-authored
// step allowance falls back to a wasp; the director never invents footing or
// materializes a body into a doomed fall. This is a spawn fence, not a new
// movement rule.
function pressureGroundSite(x) {
  const D = CONFIG.spawner.pressure;
  const y = groundTopAt(x);
  const yl = groundTopAt(x - D.groundProbeTiles);
  const yr = groundTopAt(x + D.groundProbeTiles);
  if (y <= -100 || yl <= -100 || yr <= -100) return null;
  const step = CONFIG.hound.stepUpTiles;
  if (Math.abs(yl - y) > step || Math.abs(yr - y) > step) return null;
  return { x, y };
}

function pressureKind(face, count, slot, roll, grounded) {
  // The first body in a pair remains aerial and mobile. Its partner can then
  // spend the learned-role bag on a floor denial or rooted sightline without
  // producing a stationary double-emplacement. Singles draw the same bag.
  if (!grounded || (count > 1 && slot === 0)) return 'wasp';
  const bags = CONFIG.spawner.pressure.roleBagByFace;
  const bag = bags[Math.max(0, Math.min(bags.length - 1, face - 1))] || ['wasp'];
  return bag[Math.min(bag.length - 1, Math.floor(roll * bag.length))] || 'wasp';
}

function spawnPressureBodies(point, count, face) {
  const D = CONFIG.spawner.pressure;
  const cohortKey = `pressure:${face}:${pressureCohortSerial++}`;
  const ground = pressureGroundSite(point.x);
  for (let i = 0; i < count; i++) {
    // A fixed two samples/body makes the role sequence invariant to which
    // branch its previous sibling took. Replays and retries therefore express
    // the same evolving assault exactly.
    const roleRoll = pressureRng();
    const laneRoll = pressureRng();
    const kind = pressureKind(face, count, i, roleRoll, ground);
    // Mixed pairs bracket the movement band: the mandatory wasp owns the high
    // route while the learned support role owns deck/sightline pressure.
    const lane = count > 1
      ? (i === 0 ? 6.7 + laneRoll * 0.8 : 2.8 + laneRoll * 0.6)
      : (laneRoll < 0.44 ? 2.7 : laneRoll < 0.82 ? 4.8 : 7.1) + roleRoll * 0.55;
    const y = kind === 'hound'
      ? ground.y
      : kind === 'polyp'
        ? ground.y + CONFIG.polyp.rootY
        : spawnLaneY(point.x, lane);
    spawnHostile(
      point.x,
      y,
      i * D.pairDelayMs,
      kind,
      {
        id: `${cohortKey}:${i}:${kind}`,
        dir: point.dir,
        gating: false,
        cohortKey,
        cohortSlot: i,
        // The genome response may spend one bounded extra trait only after
        // this director has independently proved a safe empty combat window.
        pressureSpawn: true,
        pressureClearEmaMs: pressureState.clearEmaMs,
      },
    );
  }
}

function updatePressureDirector(right) {
  const D = CONFIG.spawner.pressure;
  const corner = activeCorner();
  const left = sLeftEdge();
  const point = corner && corner.state === 'idle'
    ? pressureSpawnPoint(corner, left, right)
    : null;
  const face = corner ? corner.k : 0;
  const remaining = corner
    ? corner.s - CONFIG.waves.haltOffset - scrollX
    : 0;
  const nextTiles = spawnIdx < spawnTable.length
    ? Math.max(0, spawnTable[spawnIdx].x - (right - 1.5))
    : Infinity;
  const protectedLesson = !!point &&
    (insideLessonBubble(point.x) || insideLessonBubble(player.x));
  const alive = visibleThreatCount(left, right);
  const bodies = stepPressureDirector(pressureState, {
    nowMs: gameMs,
    face,
    aliveThreats: alive,
    kills,
    authoredStarted: spawnIdx > 0,
    suspended: !corner || corner.state !== 'idle',
    safe: !!point && !protectedLesson,
    nextAuthoredTiles: nextTiles,
    remainingTravelTiles: remaining,
    spawnRoomTiles: point ? point.room : 0,
  }, D);
  if (bodies && point) spawnPressureBodies(point, bodies, face);
}

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
  updatePressureDirector(re);
}

// run reset (resetGame in src/main.js): the ambient table rewinds to its
// first entry and its seeded lane rng restarts
export function resetSpawner() {
  spawnIdx = 0;
  spawnRng = mulberry32(9001);
  pressureRng = mulberry32(CONFIG.spawner.pressure.seed);
  pressureState = newPressureState(gameMs);
  pressureCohortSerial = 0;
}

export function pressureDirectorSnapshot() {
  return { ...pressureState, spawnIdx };
}
