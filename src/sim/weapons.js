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
import { builtSolidAt, builtGroundTopAt } from './level.js';
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
let activeGunDef = compiledGunDef(currentGun);

export function currentGunDef() { return activeGunDef; }
export function currentGunLabel(compact = false) { return gunLabel(currentGun, compact); }

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

function killBullet(b, i) { b.alive = false; view.bullets.hideSlot(i); }

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
    if (b.type === 'F' && !b.crawling) {
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
      if (b.type === 'F' && !b.crawling) {               // arc down to the deck…
        b.x += b.vx * sdt; b.y += b.vy * sdt;
        const g = builtGroundTopAt(b.x);
        if (g > -100 && b.y <= g + def.hugY && b.vy <= 0) {
          b.crawling = true; b.y = g + def.hugY;
        }
      } else if (b.type === 'F') {                       // …then crawl, hugging terrain
        b.x += b.dir * def.crawlSpeed * sdt;
        const g = builtGroundTopAt(b.x);
        if (g > -100) b.y = approach(b.y, g + def.hugY, def.hugRate * sdt);
        else { gone = true; goneReason = 'terrain'; break; } // gap: flame bursts out
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

      const inSolid = b.crawling
          ? builtSolidAt(b.x + b.dir * def.probeX, b.y + def.probeY)   // crawler: tall walls only
          : builtSolidAt(b.x, b.y);
      if (inSolid) {
        // PHASE spends a measured distance budget while inside solids. Bends
        // were already culled above, and a thick body still exhausts the roll.
        if (b.phaseTilesLeft > 0) {
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
        if ((b.x - e.x) ** 2 + (b.y - e.y) ** 2 < e.hitR * e.hitR) {
          const directId = e.id;
          const passesThrough = b.pierceLeft > 0;
          if (passesThrough) { b.hitSet.add(directId); b.pierceLeft--; }
          // Bulwark reads the projectile's live approach. A Hunger dart that
          // steered behind its target should strike the exposed rear even if
          // RIG is still standing in front. Crawling flame advances by dir;
          // its stored vx is intentionally stale once it hugs the deck.
          const impactVx = b.crawling ? b.dir * def.crawlSpeed : b.vx;
          hitHostile(e, w, b.damage, b.type, impactVx);
          if (hostiles.includes(e) && def.heavyImpulse > 0)
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
    if (gone || expired) { killBullet(b, i); continue; }

    view.bullets.syncSlot(i, b);          // render: (s,y) → tower, per-type shape
  }
  view.bullets.flush();
}

/* run reset (resetGame in src/main.js) — the pool empties, the arsenal
   falls back to the rifle, and the per-weapon tallies zero out. */
export function clearBullets() { for (const b of bulletPool) b.alive = false; }
export function setGun(gun) {
  const next = gun && CONFIG.weapons[gun.letter] ? gun : STARTER_GUN;
  currentGun = next;
  currentWeapon = next.letter;
  activeGunDef = compiledGunDef(next);
  weaponHeldSince = gameMs;
  return activeGunDef;
}
export function setWeapon(letter) {
  setGun(letter === 'R' ? STARTER_GUN : PLAIN_GUNS[letter] || STARTER_GUN);
}
export function resetWeaponKills() { for (const k of Object.keys(weaponKills)) weaponKills[k] = 0; }
export function resetShotsFired() { shotsFired = 0; }
