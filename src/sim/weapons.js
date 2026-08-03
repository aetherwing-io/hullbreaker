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
import { hostiles, hitHostile } from './hostiles.js';
import { mods, logShot } from './mods.js';

export const BULLET_MAX = 256;

// Projectiles are plain sim rows; the instanced mesh that draws slot i lives
// in src/render/bullets.js and is addressed by that same index.
export const bulletPool = [];
for (let i = 0; i < BULLET_MAX; i++) bulletPool.push({
  alive: false, x: 0, y: 0, vx: 0, vy: 0, dieAt: 0,
  type: 'R', damage: 1, pierce: false, pierceLeft: 0,
  crawling: false, dir: 1, hitSet: new Set(),
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
  for (let w = hostiles.length - 1; w >= 0; w--) {
    const e = hostiles[w];
    if (e.id === directId || gameMs < e.enterUntil) continue;
    const reach = radius + e.hitR;
    if ((b.x - e.x) ** 2 + (b.y - e.y) ** 2 <= reach * reach)
      hitHostile(e, w, def.volatileDamage, b.type);
  }
}

export function updateBullets(dt) {
  for (let i = 0; i < BULLET_MAX; i++) {
    const b = bulletPool[i];
    if (!b.alive) { view.bullets.hideSlot(i); continue; }
    const def = b.def || CONFIG.weapons[b.type] || CONFIG.weapons.R;

    if (!b.crawling && def.turnRate > 0 && def.seekRange > 0) {
      // SEEKER makes any chassis steer. H's chassis starts here already, and
      // SEEKER stacks strengthen it instead of replacing its identity.
      let best = null, bestD = def.seekRange * def.seekRange;
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
        else { gone = true; break; }                     // gap: fire dies
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
        break;
      }

      if (b.crawling
          ? builtSolidAt(b.x + b.dir * def.probeX, b.y + def.probeY)   // crawler: tall walls only
          : builtSolidAt(b.x, b.y)) { gone = true; break; }

      for (let w = hostiles.length - 1; w >= 0; w--) {
        const e = hostiles[w];
        if (gameMs < e.enterUntil) continue;             // still materializing: no hitbox
        if (b.hitSet.has(e.id)) continue;
        if ((b.x - e.x) ** 2 + (b.y - e.y) ** 2 < e.hitR * e.hitR) {
          const directId = e.id;
          const passesThrough = b.pierceLeft > 0;
          if (passesThrough) { b.hitSet.add(directId); b.pierceLeft--; }
          hitHostile(e, w, b.damage, b.type);
          if (def.volatileRadius > 0) volatileBlast(b, directId, def);
          if (!passesThrough) gone = true;
          // hitHostile and the blast may splice hostiles. Resume on the next
          // projectile substep rather than walking stale indexes here.
          break;
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
export function setGun(gun) {
  const next = gun && CONFIG.weapons[gun.letter] ? gun : STARTER_GUN;
  currentGun = next;
  currentWeapon = next.letter;
  activeGunDef = compiledGunDef(next);
  weaponHeldSince = gameMs;
}
export function setWeapon(letter) {
  setGun(letter === 'R' ? STARTER_GUN : PLAIN_GUNS[letter] || STARTER_GUN);
}
export function resetWeaponKills() { for (const k of Object.keys(weaponKills)) weaponKills[k] = 0; }
export function resetShotsFired() { shotsFired = 0; }
