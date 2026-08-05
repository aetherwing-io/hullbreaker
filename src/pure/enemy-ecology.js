/* ===================== LEVEL 1 ENEMY ECOLOGY ===================== */
/* Immutable role recipes and geometry for Meridian's first twelve-body
 * vocabulary.  A gameplay recipe is opt-in spawn data: an ordinary row with
 * no `ecologyId` never receives its mechanics or tactics.  Presentation may
 * independently select one of the zero-recipe neutral bodies through
 * `ecologyVisualId`; that identity is deliberately absent from every helper
 * below that can affect combat.  Nothing in this module knows about HP,
 * spawning, rendering, terrain, or the live hostile list.                  */

import { ENEMY_GENES } from './genome.js';

export const ENEMY_TACTICS = Object.freeze({
  REVERSE_VAULT: 'reverse-vault',
  HORIZONTAL_BURST: 'horizontal-burst',
  BOUNDED_SWEEP: 'bounded-sweep',
  DESCENT_COMB: 'descent-comb',
});

const NONE = Object.freeze([]);
const mechanics = (...ids) => Object.freeze(ids);
const tactics = (...ids) => Object.freeze(ids);

function recipe(id, family, kind, existingMechanics = NONE, newTactics = NONE,
    extra = {}) {
  return Object.freeze({
    id, family, kind,
    mechanics: existingMechanics,
    tactics: newTactics,
    ...extra,
  });
}

/* The order is production data: three bodies per family, in the same order
 * as docs/LEVEL1-ENEMY-ECOLOGY-PACK.md and the packed atlas contract. */
export const LEVEL1_ENEMY_ECOLOGY = Object.freeze([
  recipe('hound-railfang', 'hunter', 'hound'),
  recipe('hound-vaultjaw', 'hunter', 'hound', mechanics('VAULT')),
  recipe('hound-rebound', 'hunter', 'hound', NONE,
    tactics(ENEMY_TACTICS.REVERSE_VAULT)),

  recipe('wasp-crosswind', 'aerial', 'wasp', mechanics('PINCER', 'TWINSTRIKE'),
    tactics(ENEMY_TACTICS.HORIZONTAL_BURST)),
  recipe('wasp-diveclaw', 'aerial', 'wasp'),
  recipe('wasp-pincer', 'aerial', 'wasp', mechanics('PINCER', 'TWINSTRIKE')),

  recipe('polyp-needle', 'connector', 'polyp'),
  recipe('polyp-sweepfan', 'connector', 'polyp', NONE,
    tactics(ENEMY_TACTICS.BOUNDED_SWEEP)),
  recipe('polyp-gateweaver', 'connector', 'polyp', mechanics('RELAY')),

  recipe('mortar-craterpod', 'denial', 'mortar'),
  recipe('mortar-bracketpod', 'denial', 'mortar', mechanics('SALVO'), NONE,
    { salvoPattern: 'BRACKET' }),
  recipe('mortar-aircomb', 'denial', 'mortar', mechanics('SALVO'),
    tactics(ENEMY_TACTICS.DESCENT_COMB)),
]);

/* The ordinary Level-1 roster uses reviewed atlas art without silently
 * buying a recipe.  Each default is the zero-mechanic, zero-tactic member of
 * its base kind.  Carrier and Warden own separate production art and
 * intentionally resolve to the empty string. */
export const LEVEL1_NEUTRAL_ECOLOGY_VISUAL = Object.freeze({
  hound: 'hound-railfang',
  // The neutral wasp now uses the compact pixel-authored flight sheet. Named
  // ecology recipes still select their 64-state bodies; presentation remains
  // independent from whether a recipe buys mechanics.
  wasp: '',
  polyp: 'polyp-needle',
  mortar: 'mortar-craterpod',
});

export function neutralEnemyEcologyVisualId(kind) {
  return LEVEL1_NEUTRAL_ECOLOGY_VISUAL[kind] || '';
}

/* One boundary owns staged presentation.  At exactly enterUntil-enterMs the
 * condensation is allowed to appear; every earlier frame is fully hidden.
 * This helper is presentation-only and allocates nothing in the hot loop. */
export function enemyEcologyCondensationStarted(row, nowMs, enterMs) {
  if (!row || !Number.isFinite(row.enterUntil) || !Number.isFinite(nowMs))
    return false;
  return nowMs >= row.enterUntil - Math.max(0, Number(enterMs) || 0);
}

const BY_ID = new Map(LEVEL1_ENEMY_ECOLOGY.map((entry) => [entry.id, entry]));
const TACTIC_DIMENSION = Object.freeze({
  [ENEMY_TACTICS.REVERSE_VAULT]: 'locomotion',
  [ENEMY_TACTICS.HORIZONTAL_BURST]: 'attack',
  [ENEMY_TACTICS.BOUNDED_SWEEP]: 'attack',
  [ENEMY_TACTICS.DESCENT_COMB]: 'attack',
});
const CONFLICTS = Object.freeze([
  Object.freeze(['AEGIS', 'BULWARK']),
  Object.freeze(['AEGIS', 'BACKLASH']),
]);

/* Wrong-kind IDs fail closed.  That matters during authored integration: a
 * typo can leave an ordinary tested wasp in place, but can never bolt a
 * mortar hazard onto a mobile body. */
export function resolveEnemyEcology(id, kind) {
  if (!id) return null;
  const entry = BY_ID.get(String(id));
  return entry && entry.kind === kind ? entry : null;
}

export function ecologyHasMechanic(ecology, id) {
  return !!ecology && ecology.mechanics.includes(id);
}

export function ecologyHasTactic(ecologyOrRow, id) {
  const list = ecologyOrRow?.tactics;
  return !!list && list.includes(id);
}

/* An ecology identity may pin one or two already-proved organs, but it may
 * never stack those on top of a full random genome. Recipe mechanics win;
 * compatible rolled organs fill only the remaining slots up to the same
 * three-organ ceiling. New tactics reserve their decision dimension so, for
 * example, a Rebound body cannot also roll VAULT and silently skip the
 * charge whose wall/edge commitment earns its return arc. */
export function effectiveEcologyMechanics(ecology, genome) {
  if (!ecology) return genome?.genes || NONE;
  const chosen = [...ecology.mechanics];
  const occupied = new Set(chosen.map((id) => ENEMY_GENES[id]?.dimension).filter(Boolean));
  for (const tactic of ecology.tactics) {
    const dimension = TACTIC_DIMENSION[tactic];
    if (dimension) occupied.add(dimension);
  }
  for (const id of genome?.genes || NONE) {
    if (chosen.includes(id) || chosen.length >= 3) continue;
    const dimension = ENEMY_GENES[id]?.dimension;
    if (!dimension || occupied.has(dimension)) continue;
    if (CONFLICTS.some((pair) => pair.includes(id) &&
        pair.some((other) => other !== id && chosen.includes(other)))) continue;
    chosen.push(id);
    occupied.add(dimension);
  }
  return Object.freeze(chosen);
}

const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp01 = (value) => Math.max(0, Math.min(1, finite(value)));

/* Rebound is one reverse ballistic commitment, not steering.  `forwardDir`
 * is the direction of the charge that paid for it; the returned launch is
 * always exactly opposite. */
export function reboundLaunch(forwardDir, cfg) {
  const dir = Math.sign(forwardDir) || -1;
  return Object.freeze({
    dir: -dir,
    vx: -dir * Math.max(0, finite(cfg?.speed)),
    vy: Math.max(0, finite(cfg?.lift)),
  });
}

/* Crosswind owns exactly three parallel pulses.  Index is clamped so a bad
 * caller cannot turn the pattern into an unbounded projectile factory. */
export function crosswindPulse(index, originX, centerY, dir, cfg) {
  const count = Math.max(1, Math.min(3, cfg?.count | 0));
  const slot = Math.max(0, Math.min(count - 1, index | 0));
  const spacing = Math.max(0, finite(cfg?.spacing));
  const d = Math.sign(dir) || -1;
  return Object.freeze({
    x: finite(originX),
    y: finite(centerY) + (slot - (count - 1) * 0.5) * spacing,
    vx: d * Math.max(0, finite(cfg?.speed)),
    vy: 0,
    radius: Math.max(0, finite(cfg?.radius)),
  });
}

/* The Sweepfan ray rotates through one finite arc.  Mirroring changes which
 * side opens first, never the arc size, duration, or tracking contract. */
export function sweepfanDirection(facing, handedness, progress, cfg, out = {}) {
  const dir = Math.sign(facing) || -1;
  const hand = Math.sign(handedness) || 1;
  const half = Math.max(0, finite(cfg?.halfAngleRad));
  const offset = (-half + 2 * half * clamp01(progress)) * hand;
  out.x = dir * Math.cos(offset);
  out.y = Math.sin(offset);
  out.offset = offset;
  return out;
}

/* Capsule-segment versus axis-aligned rectangle.  Expanding the rectangle by
 * `half` lets one exact predicate drive both the rendered beam thickness and
 * player damage without point sampling or frame-rate dependence. */
export function segmentBandHitsRect(x0, y0, x1, y1, half,
    rx0, rx1, ry0, ry1) {
  const pad = Math.max(0, finite(half));
  let lo = 0, hi = 1;
  const dx = x1 - x0, dy = y1 - y0;
  const minX = rx0 - pad, maxX = rx1 + pad;
  const minY = ry0 - pad, maxY = ry1 + pad;
  if (Math.abs(dx) < 1e-9) {
    if (x0 < minX || x0 > maxX) return false;
  } else {
    let a = (minX - x0) / dx, b = (maxX - x0) / dx;
    if (a > b) { const swap = a; a = b; b = swap; }
    lo = Math.max(lo, a); hi = Math.min(hi, b);
    if (lo > hi) return false;
  }
  if (Math.abs(dy) < 1e-9) {
    if (y0 < minY || y0 > maxY) return false;
  } else {
    let a = (minY - y0) / dy, b = (maxY - y0) / dy;
    if (a > b) { const swap = a; a = b; b = swap; }
    lo = Math.max(lo, a); hi = Math.min(hi, b);
    if (lo > hi) return false;
  }
  return true;
}

/* Aircomb mirrors one deliberately asymmetric three-tooth cadence.  The two
 * gaps are unequal, making the safe descent pocket visible; the pattern
 * remains three teeth under every input. */
export function aircombTooth(index, centerX, handedness, cfg, out = {}) {
  const slot = Math.max(0, Math.min(2, index | 0));
  const hand = Math.sign(handedness) || 1;
  const spacing = Math.max(0, finite(cfg?.spacing));
  const offsets = [-1.25, -0.25, 1.25];
  out.x = finite(centerX) + offsets[slot] * spacing * hand;
  out.radius = Math.max(0, finite(cfg?.radius));
  return out;
}
