/* ======================== POOLS / WEAPONS ========================= */
/* Letter weapons R/S/L/H/F share one instanced pool; per-type behavior,
   scale, and color are set per projectile. Damage flows through hitHostile
   so kills credit the weapon (favorite-weapon stat).                  */

import { CONFIG, WEAPON_LETTERS } from '../config.js';
import { DEG } from '../pure/path.js';
import { view } from './bridge.js';
import { gameMs, approach } from './time.js';
import { builtSolidAt, builtGroundTopAt } from './level.js';
import { player } from './player.js';
import { hostiles, hitHostile } from './hostiles.js';
import { mods, logShot } from './mods.js';

export const BULLET_MAX = 256;

// Projectiles are plain sim rows; the instanced mesh that draws slot i lives
// in src/render/bullets.js and is addressed by that same index.
export const bulletPool = [];
for (let i = 0; i < BULLET_MAX; i++) bulletPool.push({
  alive: false, x: 0, y: 0, vx: 0, vy: 0, dieAt: 0,
  type: 'R', damage: 1, pierce: false, crawling: false, dir: 1, hitSet: new Set(),
});

export let shotsFired = 0;
export let currentWeapon = 'R';
export const weaponKills = Object.fromEntries(WEAPON_LETTERS.map(k => [k, 0]));

export function weaponDef(letter) { return CONFIG.weapons[letter]; }

function spawnProj(type, x, y, dx, dy, def) {
  for (let i = 0; i < BULLET_MAX; i++) {
    const b = bulletPool[i];
    if (b.alive) continue;
    b.alive = true; b.type = type; b.x = x; b.y = y;
    b.vx = dx * def.speed; b.vy = dy * def.speed;
    b.damage = def.damage; b.pierce = !!def.pierce;
    b.dieAt = gameMs + def.lifeMs;
    b.crawling = false;
    b.dir = Math.sign(dx) || player.facing;
    b.hitSet.clear();
    view.bullets.slotSpawned(i, type);   // render: per-type shot color for this slot
    return;
  }
}

// One trigger pull → one "shot" for stats; clones replay without logging.
// No per-letter branches: count/splayDeg/lob fields on the def drive the fan.
export function fireWeapon(letter, x, y, ax, ay, clone) {
  if (!clone) {
    shotsFired++;
    if (gameMs < mods.ghostUntil) logShot(letter, x, y, ax, ay);
  }
  const def = weaponDef(letter);
  if (def.lobBias !== undefined) ay = ay * def.lobScaleY + def.lobBias;   // flame lob
  const base = Math.atan2(ay, ax);
  const n = def.count || 1;
  const step = (def.splayDeg || 0) * DEG;
  for (let k = 0; k < n; k++) {
    const a = base + step * (k - (n - 1) / 2);
    spawnProj(letter, x, y, Math.cos(a), Math.sin(a), def);
  }
}

function killBullet(b, i) { b.alive = false; view.bullets.hideSlot(i); }

export function updateBullets(dt) {
  const HDEF = CONFIG.weapons.H, FDEF = CONFIG.weapons.F;
  for (let i = 0; i < BULLET_MAX; i++) {
    const b = bulletPool[i];
    if (!b.alive) { view.bullets.hideSlot(i); continue; }

    if (b.type === 'H') {                                // steer toward nearest live hostile
      let best = null, bestD = HDEF.seekRange * HDEF.seekRange;
      for (const e of hostiles) {
        if (gameMs < e.enterUntil) continue;
        const d = (e.x - b.x) ** 2 + (e.y - b.y) ** 2;
        if (d < bestD) { bestD = d; best = e; }
      }
      if (best) {
        const cur = Math.atan2(b.vy, b.vx);
        let diff = Math.atan2(best.y - b.y, best.x - b.x) - cur;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        const a = approach(cur, cur + diff, HDEF.turnRate * dt);
        b.vx = Math.cos(a) * HDEF.speed; b.vy = Math.sin(a) * HDEF.speed;
      }                                                  // integration happens in substeps below
    } else if (b.type === 'F' && !b.crawling) {
      b.vy += FDEF.dropAccel * dt;                       // gravity once per frame
    }

    // integrate + collide in SUBSTEPS: a clamped 50ms frame moves a laser
    // 2 tiles — far enough to cross a 1-wide pillar or a 0.55-radius
    // hostile between endpoint tests. Steps sized so no substep exceeds
    // ~0.45 units (capped at 4: worst case 0.5, still under both).
    const spd = b.crawling ? FDEF.crawlSpeed : Math.hypot(b.vx, b.vy);
    const steps = Math.min(4, Math.max(1, Math.ceil(spd * dt / 0.45)));
    const sdt = dt / steps;
    let gone = false;
    for (let k = 0; k < steps && !gone; k++) {
      if (b.type === 'F' && !b.crawling) {               // arc down to the deck…
        b.x += b.vx * sdt; b.y += b.vy * sdt;
        const g = builtGroundTopAt(b.x);
        if (g > -100 && b.y <= g + FDEF.hugY && b.vy <= 0) { b.crawling = true; b.y = g + FDEF.hugY; }
      } else if (b.type === 'F') {                       // …then crawl, hugging terrain
        b.x += b.dir * FDEF.crawlSpeed * sdt;
        const g = builtGroundTopAt(b.x);
        if (g > -100) b.y = approach(b.y, g + FDEF.hugY, FDEF.hugRate * sdt);
        else { gone = true; break; }                     // gap: fire dies
      } else {
        b.x += b.vx * sdt; b.y += b.vy * sdt;
      }

      if (b.crawling
          ? builtSolidAt(b.x + b.dir * FDEF.probeX, b.y + FDEF.probeY)   // crawler: tall walls only
          : builtSolidAt(b.x, b.y)) { gone = true; break; }

      for (let w = hostiles.length - 1; w >= 0; w--) {
        const e = hostiles[w];
        if (gameMs < e.enterUntil) continue;             // still materializing: no hitbox
        if (b.pierce && b.hitSet.has(e.id)) continue;
        if ((b.x - e.x) ** 2 + (b.y - e.y) ** 2 < e.hitR * e.hitR) {
          if (b.pierce) b.hitSet.add(e.id);
          hitHostile(e, w, b.damage, b.type);
          if (!b.pierce) { gone = true; break; }
        }
      }
    }
    if (gone || gameMs > b.dieAt) { killBullet(b, i); continue; }

    view.bullets.syncSlot(i, b);          // render: (s,y) → tower, per-type shape
  }
  view.bullets.flush();
}

/* run reset (resetGame in src/main.js) — the pool empties, the arsenal
   falls back to the rifle, and the per-weapon tallies zero out. */
export function clearBullets() { for (const b of bulletPool) b.alive = false; }
export function setWeapon(letter) { currentWeapon = letter; }
export function resetWeaponKills() { for (const k of Object.keys(weaponKills)) weaponKills[k] = 0; }
export function resetShotsFired() { shotsFired = 0; }
