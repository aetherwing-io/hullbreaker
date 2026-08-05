/* ======================== POOLS / WEAPONS ========================= */
/* Letter weapons R/S/L/H/F share one instanced pool; per-type behavior,
   scale, and color are set per projectile. Damage flows through hitHostile
   so kills credit the weapon (favorite-weapon stat).                  */

import { CONFIG, WEAPON_LETTERS } from '../config.js';
import { BEND_S, DEG, crossesBend } from '../pure/path.js';
import { assistDirection } from '../pure/assist.js';
import { compileGunDef, gunLabel, plainGun } from '../pure/gunroll.js';
import { TRANSFORM_BEND_S } from '../pure/transform.js';
import { AIM_ASSIST_ENABLED, IS_TRANSFORM_SLICE } from '../mode.js';
import { view } from './bridge.js';
import { gameMs, approach } from './time.js';
import {
  builtSolidAt, columnBuilt, groundH, platforms, solidRects,
} from './level.js';
import { player } from './player.js';
import { hostiles, hitHostile, staggerHostile } from './hostiles.js';
import { mods, logShot } from './mods.js';

export const BULLET_MAX = 256;

// Projectiles are plain sim rows; the instanced mesh that draws slot i lives
// in src/render/bullets.js and is addressed by that same index.
export const bulletPool = [];
for (let i = 0; i < BULLET_MAX; i++) bulletPool.push({
  alive: false, x: 0, y: 0, vx: 0, vy: 0, dieAt: 0,
  type: 'R', damage: 1, pierce: false, pierceLeft: 0,
  crawling: false, dir: 1, hitSet: new Set(),
  crawlUntil: 0, crawlTilesLeft: 0, crawlSurfaceY: -999,
  gravityAt: 0,
  seekTargetId: 0, seekLocksLeft: 0, seekUntil: 0,
  phaseTilesLeft: 0,
  def: null, gun: null, meta: null,
});

export let shotsFired = 0;
export let currentWeapon = 'R';
export let weaponHeldSince = 0;
export const weaponKills = Object.fromEntries(WEAPON_LETTERS.map(k => [k, 0]));

export function weaponDef(letter) { return CONFIG.weapons[letter]; }

// `weaponDef(letter)` above deliberately remains the static chassis table for
// stats, shell summaries, and old callers. The held arsenal is a separate,
// immutable roll with a cached compiled def. R is always the plain dependable
// starter unless an actual rolled R capsule is acquired.
const PLAIN_GUNS = Object.freeze(Object.fromEntries(
  WEAPON_LETTERS.map((letter) => [letter, plainGun(letter, false)]),
));
const STARTER_GUN = plainGun('R', true);
// GHOST replays the same immutable recipe many times, and stress fixtures call
// clone fire directly. Cache compiled rows by recipe identity so neither path
// allocates and freezes a new definition on every trigger pull.
const compiledGunDefs = new WeakMap();
function compiledGunDef(gun) {
  let def = compiledGunDefs.get(gun);
  if (!def) {
    def = compileGunDef(gun, weaponDef(gun.letter) || weaponDef('R'));
    compiledGunDefs.set(gun, def);
  }
  return def;
}
export let currentGun = STARTER_GUN;
// Slot zero is the dependable field rifle. Slot one is the rolled weapon the
// run is currently carrying. Only one is active, but the player can answer a
// second enemy role without throwing away the interesting pickup.
export let carriedGun = null;
let usingCarriedGun = false;
let activeGunDef = compiledGunDef(currentGun);

export function currentGunDef() { return activeGunDef; }
export function currentGunLabel(compact = false) { return gunLabel(currentGun, compact); }
export function carriedGunLabel(compact = false) {
  return carriedGun ? gunLabel(carriedGun, compact) : '';
}

// Where the ribbon changes facet on the active path. A projectile dies here
// rather than steering around the body with it (../pure/path.js's header).
const BENDS = IS_TRANSFORM_SLICE ? TRANSFORM_BEND_S : BEND_S;

function spawnProj(type, x, y, dx, dy, def, gun) {
  for (let i = 0; i < BULLET_MAX; i++) {
    const b = bulletPool[i];
    if (b.alive) continue;
    b.alive = true; b.type = type; b.x = x; b.y = y;
    b.vx = dx * def.speed; b.vy = dy * def.speed;
    b.damage = def.damage; b.pierce = !!def.pierce; b.pierceLeft = def.pierceBudget || 0;
    b.dieAt = gameMs + def.lifeMs;
    b.crawling = false;
    b.crawlUntil = 0;
    b.crawlTilesLeft = 0;
    b.crawlSurfaceY = -999;
    b.gravityAt = gameMs + (def.dropDelayMs || 0);
    b.dir = Math.sign(dx) || player.facing;
    b.seekTargetId = 0;
    b.seekLocksLeft = def.turnRate > 0 ? 1 + (def.seekRetargets || 0) : 0;
    b.seekUntil = gameMs + (def.seekFuelMs || 0);
    b.phaseTilesLeft = def.terrainPhaseTiles || 0;
    b.def = def;
    b.gun = gun;
    b.meta = def.gunMeta;
    b.hitSet.clear();
    // Existing bridge wrappers ignore the additive metadata argument. The
    // projectile renderer uses it for tier/trait accents only; collision still
    // reads the point row above.
    view.bullets.slotSpawned(i, type, b.meta);
    return;
  }
}

// One trigger pull → one "shot" for stats; clones replay without logging.
// No per-letter branches: count/splayDeg/lob fields on the def drive the fan.
// ?aim=assist (A/B prototype): correct the heading at fire time only, by at
// most CONFIG.assist.maxDeg, toward a materialized hostile the player was
// already pointing at. Applied before the shot is logged, so GHOST clones
// replay the same corrected heading, and before the fan, so every weapon's
// spread is preserved around it. Pure math + bounds live in src/pure/assist.js.
const assistTargets = [];
const assistOut = { x: 1, y: 0, targetId: 0, adjustedDeg: 0 };

function assistHeading(x, y, ax, ay) {
  assistTargets.length = 0;
  for (const e of hostiles) {
    if (gameMs < e.enterUntil) continue;          // still materializing: not in play
    assistTargets.push(e);
  }
  return assistDirection(ax, ay, x, y, assistTargets, CONFIG.assist, assistOut);
}

export function fireWeapon(letter, x, y, ax, ay, clone, gunOverride = null) {
  if (AIM_ASSIST_ENABLED && !clone) {
    const a = assistHeading(x, y, ax, ay);
    ax = a.x; ay = a.y;
  }
  const gun = gunOverride || (!clone && letter === currentWeapon
    ? currentGun
    : PLAIN_GUNS[letter] || PLAIN_GUNS.R);
  const def = gun === currentGun
    ? activeGunDef
    : compiledGunDef(gun);
  if (!clone) {
    shotsFired++;
    if (gameMs < mods.ghostUntil) logShot(gun, x, y, ax, ay);
  }
  if (def.lobBias !== undefined) ay = ay * def.lobScaleY + def.lobBias;   // flame lob
  const base = Math.atan2(ay, ax);
  const n = def.count || 1;
  const step = (def.splayDeg || 0) * DEG;
  for (let k = 0; k < n; k++) {
    const a = base + step * (k - (n - 1) / 2);
    spawnProj(gun.letter, x, y, Math.cos(a), Math.sin(a), def, gun);
  }
}

// Terminal presentation receives the exact row at the exact substep that
// ended it, plus a small closed reason vocabulary. Rendering may celebrate a
// real collision or let spent fuel sputter, but it never has to infer either
// from its previous-frame transform. This hook remains presentation-only:
// collision, lifetime and pool ownership are still decided entirely here.
function killBullet(b, i, reason) {
  b.alive = false;
  view.bullets.hideSlot(i, b, reason);
}

// VOLATILE is deliberately a small local blast, not a screen-clear. It flows
// through the ordinary hostile damage path so armour, kills, score, carrier
// drops, and favorite-weapon stats all retain one owner. PHASE + VOLATILE is
// allowed to detonate more than once: that is the rolled-gun combination the
// player got lucky enough to assemble.
function volatileBlast(b, directId, def) {
  const radius = def.volatileRadius;
  view.bullets.volatileImpact(b, radius, b.meta?.volatile || 1);
  for (let w = hostiles.length - 1; w >= 0; w--) {
    const e = hostiles[w];
    if (e.id === directId || gameMs < e.enterUntil) continue;
    const reach = radius + e.hitR;
    if ((b.x - e.x) ** 2 + (b.y - e.y) ** 2 <= reach * reach) {
      // Radial shrapnel approaches from the blast centre. Bulwark resolves
      // that physical side instead of looking across the arena at RIG.
      hitHostile(e, w, def.volatileDamage, b.type,
        e.x - b.x || (b.crawling ? b.dir * def.crawlSpeed : b.vx));
      if (hostiles.includes(e)) {
        const dx = e.x - b.x, dy = e.y - b.y;
        const force = 1.15 + (b.meta?.volatile || 1) * 0.5 + (def.heavyImpulse || 0) * 0.22;
        const stun = 30 + (b.meta?.volatile || 1) * 14 + (def.heavyStunMs || 0) * 0.25;
        staggerHostile(e, dx || b.vx, dy || b.vy, force, stun);
      }
    }
  }
}

// One dart commits to one target while its motor burns. It may re-lock only
// when SEEKER stacks explicitly buy another lock; nearest-forever guidance
// was the reason the plain H chassis could clean up an arena without aiming.
function seekerTarget(b, def) {
  let target = b.seekTargetId
    ? hostiles.find((e) => e.id === b.seekTargetId && gameMs >= e.enterUntil)
    : null;
  if (target) {
    const limit = def.seekRange * 1.25 + target.hitR;
    if ((target.x - b.x) ** 2 + (target.y - b.y) ** 2 > limit * limit) target = null;
  }
  if (target) return target;

  b.seekTargetId = 0;
  if (b.seekLocksLeft <= 0 || gameMs >= b.seekUntil) return null;
  const speed = Math.hypot(b.vx, b.vy) || 1;
  const hx = b.vx / speed, hy = b.vy / speed;
  const coneCos = Math.cos((def.seekConeDeg || 0) * DEG * 0.5);
  let best = null, bestScore = Infinity;
  const maxD2 = def.seekRange * def.seekRange;
  for (const e of hostiles) {
    if (gameMs < e.enterUntil) continue;
    const dx = e.x - b.x, dy = e.y - b.y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= 0 || d2 > maxD2) continue;
    const dot = (dx * hx + dy * hy) / Math.sqrt(d2);
    if (dot < coneCos) continue;
    // Angular error matters more than a small distance advantage, so a dart
    // respects the player's launch direction instead of snapping sideways.
    const score = d2 * (1 + (1 - dot) * 2.4);
    if (score < bestScore || (score === bestScore && e.id < best.id)) {
      best = e;
      bestScore = score;
    }
  }
  if (best) {
    b.seekTargetId = best.id;
    b.seekLocksLeft--;
  }
  return best;
}

/* ------------------- Cindermouth surface ownership ------------------- *
 * F is allowed to become ground fire; no other projectile is.  The old
 * implementation sampled only groundH at the END of a substep, then silently
 * changed the still-rigid shell into a crawler.  Besides looking like a bug,
 * that skipped one-way catwalk tops and could teleport a slow HEAVY glob onto
 * the top of a step it had actually struck from the side.
 *
 * These queries sweep the projectile point down onto every authored top
 * surface: built hull columns, solid-rect roofs, and one-way catwalks.  They
 * use caller-owned scratch rows, so the projectile hot path remains allocation
 * free.  Ground columns keep their runtime build bit; a shot never ignites on
 * an invisible future face.                                                   */
const AIR_HIT = { hit: false, t: 2, x: 0, top: -999, kind: '' };
const CRAWL_HERE = { top: -999, x0: 0, x1: 0, kind: '' };
const CRAWL_NEXT = { top: -999, x0: 0, x1: 0, kind: '' };
const SURFACE_EPS = 1e-7;

function chooseSurface(out, top, x0, x1, kind, referenceTop) {
  const distance = Math.abs(top - referenceTop);
  const prior = out.top > -100 ? Math.abs(out.top - referenceTop) : Infinity;
  if (distance >= prior) return;
  out.top = top; out.x0 = x0; out.x1 = x1; out.kind = kind;
}

// Surface nearest the crawler's current deck plane.  A catwalk over hull must
// not suddenly snap flame down to the hull, and a roof runner must not select
// the ground several tiles below it.
function crawlSurfaceAt(x, referenceTop, out) {
  out.top = -999; out.x0 = 0; out.x1 = 0; out.kind = '';
  const i = Math.floor(x);
  const builtHere = i < 0 || i >= groundH.length ||
    groundH[i] <= -100 || columnBuilt(i);
  if (i >= 0 && i < groundH.length && groundH[i] > -100 && columnBuilt(i))
    chooseSurface(out, groundH[i], i, i + 1, 'deck', referenceTop);
  for (let r = 0; builtHere && r < solidRects.length; r++) {
    const rect = solidRects[r];
    if (x >= rect.x0 && x < rect.x1)
      chooseSurface(out, rect.y1, rect.x0, rect.x1, 'roof', referenceTop);
  }
  for (let p = 0; builtHere && p < platforms.length; p++) {
    const pl = platforms[p];
    if (x >= pl.x0 && x < pl.x1)
      chooseSurface(out, pl.y, pl.x0, pl.x1, 'platform', referenceTop);
  }
  return out.top > -100;
}

function considerAirSurface(out, x0, y0, x1, y1, clearance,
  top, span0, span1, kind) {
  const fall = y0 - y1;
  if (!(fall > 0)) return;
  const t = (y0 - (top + clearance)) / fall;
  if (t < -SURFACE_EPS || t > 1 + SURFACE_EPS || t >= out.t) return;
  const x = x0 + (x1 - x0) * Math.max(0, Math.min(1, t));
  if (x < span0 - SURFACE_EPS || x > span1 + SURFACE_EPS) return;
  const column = Math.floor(x);
  if (column >= 0 && column < groundH.length && groundH[column] > -100 &&
      !columnBuilt(column)) return;
  out.hit = true; out.t = Math.max(0, Math.min(1, t));
  out.x = x; out.top = top; out.kind = kind;
}

function sweptAirSurface(x0, y0, x1, y1, clearance, out) {
  out.hit = false; out.t = 2; out.x = x1; out.top = -999; out.kind = '';
  if (!(y1 < y0)) return false;
  const lo = Math.max(0, Math.floor(Math.min(x0, x1)) - 1);
  const hi = Math.min(groundH.length - 1, Math.floor(Math.max(x0, x1)) + 1);
  for (let i = lo; i <= hi; i++) {
    if (groundH[i] > -100 && columnBuilt(i))
      considerAirSurface(out, x0, y0, x1, y1, clearance,
        groundH[i], i, i + 1, 'deck');
  }
  for (let r = 0; r < solidRects.length; r++) {
    const rect = solidRects[r];
    considerAirSurface(out, x0, y0, x1, y1, clearance,
      rect.y1, rect.x0, rect.x1, 'roof');
  }
  for (let p = 0; p < platforms.length; p++) {
    const pl = platforms[p];
    considerAirSurface(out, x0, y0, x1, y1, clearance,
      pl.y, pl.x0, pl.x1, 'platform');
  }
  return out.hit;
}

// When the next sample has no usable support (gap), rises into a wall, or is
// physically inside a wall, terminate at the FIRST authored x boundary rather
// than up to one integration substep beyond it.
function firstSurfaceBoundary(x0, x1, fallback) {
  const dir = Math.sign(x1 - x0) || 1;
  let best = fallback;
  const ilo = Math.floor(Math.min(x0, x1));
  const ihi = Math.ceil(Math.max(x0, x1));
  for (let i = ilo; i <= ihi; i++) best = nearerBoundary(i, x0, x1, dir, best);
  for (let p = 0; p < platforms.length; p++) {
    best = nearerBoundary(platforms[p].x0, x0, x1, dir, best);
    best = nearerBoundary(platforms[p].x1, x0, x1, dir, best);
  }
  for (let r = 0; r < solidRects.length; r++) {
    best = nearerBoundary(solidRects[r].x0, x0, x1, dir, best);
    best = nearerBoundary(solidRects[r].x1, x0, x1, dir, best);
  }
  return best;
}

function nearerBoundary(x, x0, x1, dir, best) {
  if (dir > 0) {
    if (x > x0 + SURFACE_EPS && x <= x1 + SURFACE_EPS && x < best) return x;
  } else if (x < x0 - SURFACE_EPS && x >= x1 - SURFACE_EPS && x > best) {
    return x;
  }
  return best;
}

export function updateBullets(dt) {
  for (let i = 0; i < BULLET_MAX; i++) {
    const b = bulletPool[i];
    if (!b.alive) { view.bullets.hideSlot(i); continue; }
    const def = b.def || CONFIG.weapons[b.type] || CONFIG.weapons.R;

    if (!b.crawling && def.turnRate > 0 && def.seekRange > 0 && gameMs < b.seekUntil) {
      // SEEKER makes any chassis steer. H starts with one finite committed
      // lock; stacked SEEKER rolls widen, lengthen and add re-locks.
      const best = seekerTarget(b, def);
      if (best) {
        const distance = Math.hypot(best.x - b.x, best.y - b.y);
        const leadSec = Math.min(0.28, distance / Math.max(1, def.speed) * (def.seekLead || 0));
        const targetX = best.x + best.vx * leadSec;
        const targetY = best.y + best.vy * leadSec;
        const cur = Math.atan2(b.vy, b.vx);
        let diff = Math.atan2(targetY - b.y, targetX - b.x) - cur;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        const a = approach(cur, cur + diff, def.turnRate * dt);
        b.vx = Math.cos(a) * def.speed; b.vy = Math.sin(a) * def.speed;
      }                                                  // integration happens in substeps below
    }
    if (b.type === 'F' && !b.crawling && gameMs >= b.gravityAt) {
      b.vy += def.dropAccel * dt;                        // gravity once per frame
    }

    // integrate + collide in SUBSTEPS: a clamped 50ms frame moves a laser
    // 2 tiles — far enough to cross a 1-wide pillar or a 0.55-radius
    // hostile between endpoint tests. Steps sized so no substep exceeds
    // ~0.45 units (capped at 4: worst case 0.5, still under both).
    const spd = b.crawling ? def.crawlSpeed : Math.hypot(b.vx, b.vy);
    const steps = Math.min(4, Math.max(1, Math.ceil(spd * dt / 0.45)));
    const sdt = dt / steps;
    let gone = false;
    let goneReason = '';
    for (let k = 0; k < steps && !gone; k++) {
      const x0 = b.x;                                    // substep start, for the bend test
      let deckIgnition = false;
      let crawlStep = false;
      if (b.type === 'F' && !b.crawling) {               // arc down to the deck…
        const nx = b.x + b.vx * sdt, ny = b.y + b.vy * sdt;
        if (sweptAirSurface(b.x, b.y, nx, ny, def.hugY, AIR_HIT)) {
          // PHASE explicitly buys passage through a zero-thickness catwalk.
          // Ordinary F (including HEAVY-only rolls) must ignite on its top.
          const phaseCost = def.phaseSurfaceCost || 0.35;
          if (AIR_HIT.kind === 'platform' && b.phaseTilesLeft >= phaseCost) {
            b.phaseTilesLeft -= phaseCost;
            b.x = nx; b.y = ny;
          } else {
            b.x = AIR_HIT.x;
            b.y = AIR_HIT.top + def.hugY;
            deckIgnition = true;
          }
        } else {
          b.x = nx; b.y = ny;
        }
      } else if (b.type === 'F') {                       // …then crawl, hugging terrain
        if (gameMs >= b.crawlUntil || b.crawlTilesLeft <= 0) {
          gone = true; goneReason = 'lifetime'; break;
        }
        b.x += b.dir * def.crawlSpeed * sdt;
        crawlStep = true;
      } else {
        b.x += b.vx * sdt; b.y += b.vy * sdt;
      }

      // The bend cull comes FIRST in the substep, before terrain and before
      // any hostile test: nothing on the far side of a bend may be hit, so a
      // limb can never be shot around. The render flies the tracer off on the
      // tangent it arrived with (view.bullets.bendCulled).
      if (crossesBend(BENDS, x0, b.x)) {
        view.bullets.bendCulled(i, b, x0);
        gone = true;
        goneReason = 'bend';
        break;
      }

      if (deckIgnition) {
        b.crawling = true;
        b.crawlSurfaceY = AIR_HIT.top;
        b.crawlUntil = Math.min(b.dieAt, gameMs + def.crawlLifeMs);
        b.crawlTilesLeft = def.crawlTiles;
        // Exact contact coordinates and a closed reason reach presentation
        // before the first ground-fire sync.  This is the missing authored
        // transformation that made the former rigid floor-slide read broken.
        view.bullets.deckIgnited(
          i, b, AIR_HIT.x, AIR_HIT.top, 'deck-ignite', AIR_HIT.kind,
        );
      }

      if (crawlStep) {
        // Query one epsilon behind the old point and one ahead of the new one,
        // so a point exactly on a platform/column lip keeps directionally
        // stable ownership instead of flickering between the two surfaces.
        const hereX = x0 - b.dir * 1e-6;
        const nextX = b.x + b.dir * 1e-6;
        const hasHere = crawlSurfaceAt(hereX, b.crawlSurfaceY, CRAWL_HERE);
        const hasNext = crawlSurfaceAt(nextX, b.crawlSurfaceY, CRAWL_NEXT);
        const rise = hasNext ? CRAWL_NEXT.top - b.crawlSurfaceY : Infinity;
        const drop = hasNext ? b.crawlSurfaceY - CRAWL_NEXT.top : Infinity;
        const blocked = builtSolidAt(b.x, b.y + def.probeY);
        if (!hasHere || !hasNext || rise > def.crawlStepUpMax ||
            drop > def.crawlDropMax || blocked) {
          const fallback = b.dir > 0
            ? (hasHere ? CRAWL_HERE.x1 : b.x)
            : (hasHere ? CRAWL_HERE.x0 : b.x);
          b.x = firstSurfaceBoundary(x0, b.x, fallback);
          b.y = b.crawlSurfaceY + def.hugY;
          gone = true; goneReason = 'terrain'; break;
        }
        const travelled = Math.abs(b.x - x0);
        b.crawlTilesLeft -= travelled;
        b.crawlSurfaceY = CRAWL_NEXT.top;
        b.y = CRAWL_NEXT.top + def.hugY;
      }

      const inSolid = b.crawling
        ? builtSolidAt(b.x, b.y + def.probeY)          // point contact; no fake look-ahead radius
        : builtSolidAt(b.x, b.y);
      if (inSolid) {
        // PHASE spends a measured distance budget while inside solids. Bends
        // were already culled above, and a thick body still exhausts the roll.
        if (!b.crawling && b.phaseTilesLeft > 0) {
          b.phaseTilesLeft -= Math.max(0.01, spd * sdt);
          if (b.phaseTilesLeft < 0) {
            gone = true;
            goneReason = 'terrain';
            break;
          }
        } else {
          gone = true;
          goneReason = 'terrain';
          break;
        }
      }

      for (let w = hostiles.length - 1; w >= 0; w--) {
        const e = hostiles[w];
        if (gameMs < e.enterUntil) continue;             // still materializing: no hitbox
        if (b.hitSet.has(e.id)) continue;
        const reach = (e.shotR || e.hitR) +
          (b.crawling ? (def.crawlHitRadius || 0) : (def.hitRadius || 0));
        if ((b.x - e.x) ** 2 + (b.y - e.y) ** 2 < reach * reach) {
          const directId = e.id;
          const passesThrough = b.pierceLeft > 0;
          if (passesThrough) { b.hitSet.add(directId); b.pierceLeft--; }
          // Bulwark reads the projectile's live approach. A Hunger dart that
          // steered behind its target should strike the exposed rear even if
          // RIG is still standing in front. Crawling flame advances by dir;
          // its stored vx is intentionally stale once it hugs the deck.
          const impactVx = b.crawling ? b.dir * def.crawlSpeed : b.vx;
          const impactVy = b.crawling ? 0 : b.vy;
          const targetKind = e.kind;
          const damaged = hitHostile(e, w, b.damage, b.type, impactVx);
          // hitHostile may splice the target. Cache the result once: the
          // presentation fact and heavy-stagger guard need the same answer,
          // and a crowded piercing shot should not scan hostiles twice.
          const lethal = !hostiles.includes(e);
          // One synchronous presentation-only fact from the exact collision
          // branch. Positional primitives preserve the allocation-free hot
          // path; damage, removal and projectile ownership remain unchanged.
          // A blocked shot is still a collision fact. Presentation gives it
          // a ricochet/shield answer instead of letting the round disappear
          // ambiguously; only `damaged` controls wound effects.
          view.bullets.hostileImpact(
            i, b.type, b.x, b.y, impactVx, impactVy,
            directId, targetKind, damaged, lethal,
          );
          if (!lethal && def.heavyImpulse > 0)
            staggerHostile(e, b.vx, b.vy, def.heavyImpulse, def.heavyStunMs);
          if (def.volatileRadius > 0) volatileBlast(b, directId, def);
          if (!passesThrough) { gone = true; goneReason = 'hostile'; }
          // hitHostile and the blast may splice hostiles. Resume on the next
          // projectile substep rather than walking stale indexes here.
          break;
        }
      }
    }
    const expired = gameMs > b.dieAt;
    // A volatile round always pays off at its endpoint. Direct impacts already
    // detonated above; bends remain silent so explosions never reach around a
    // facet. Terrain and fuel/lifetime expiry produce the promised blast.
    if (def.volatileRadius > 0 && (goneReason === 'terrain' || (!gone && expired)))
      volatileBlast(b, 0, def);
    if (gone || expired) {
      killBullet(b, i, gone ? goneReason : 'lifetime');
      continue;
    }

    view.bullets.syncSlot(i, b);          // render: (s,y) → tower, per-type shape
  }
  view.bullets.flush();
}

/* run reset (resetGame in src/main.js) — the pool empties, the arsenal
   falls back to the rifle, and the per-weapon tallies zero out. */
export function clearBullets() { for (const b of bulletPool) b.alive = false; }
function activateGun(gun, carried) {
  currentGun = gun;
  currentWeapon = gun.letter;
  usingCarriedGun = carried;
  activeGunDef = compiledGunDef(gun);
  return activeGunDef;
}

export function setGun(gun) {
  const next = gun && CONFIG.weapons[gun.letter] ? gun : STARTER_GUN;
  // Any non-starter recipe occupies the second slot, including a rolled R.
  // The field-issue rifle remains available independently in slot zero.
  if (next.starter) {
    carriedGun = null;
    activateGun(STARTER_GUN, false);
  } else {
    carriedGun = next;
    activateGun(next, true);
  }
  weaponHeldSince = gameMs;
  return activeGunDef;
}
export function setWeapon(letter) {
  setGun(letter === 'R' ? STARTER_GUN : PLAIN_GUNS[letter] || STARTER_GUN);
}

export function swapWeapon() {
  if (!carriedGun) return false;
  if (usingCarriedGun) activateGun(STARTER_GUN, false);
  else activateGun(carriedGun, true);
  return true;
}

// Damage ejects the carried recipe even when the player happened to have the
// fallback rifle active. This keeps weapon loss meaningful without making the
// second slot an immunity exploit.
export function dropCarriedGun() {
  const dropped = carriedGun;
  if (!dropped) return null;
  carriedGun = null;
  activateGun(STARTER_GUN, false);
  return dropped;
}
export function resetWeaponKills() { for (const k of Object.keys(weaponKills)) weaponKills[k] = 0; }
export function resetShotsFired() { shotsFired = 0; }
