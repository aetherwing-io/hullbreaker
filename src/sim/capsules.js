/* ================= ENTITIES: CAPSULES (PICKUPS) =================== */
/* Letter capsules drift from destroyed carriers; on taking a hit the
   current weapon pops out and can be recaught before it burns away.
   Normal-run carriers carry authored phase rewards; fixture/legacy rows
   retain the seeded shuffle fallback below.                            */

import { CONFIG, WEAPON_LETTERS } from '../config.js';
import { rollGun } from '../pure/gunroll.js';
import { mulberry32 } from '../pure/rng.js';
import { view } from './bridge.js';
import { gameMs } from './time.js';
import { sLeftEdge } from './edges.js';
import { LEVEL_LEN, builtGroundTopAt } from './level.js';
import { circleHitsPlayer } from './player.js';
import { setGun } from './weapons.js';
import { applyMod } from './mods.js';
import { scoreRecatch, scoreRewardTaken } from './score.js';

export const capsules = [];
export const CAP = CONFIG.capsules;

// mode 'drift': flies from a killed carrier, sinks slowly toward catch height.
// mode 'pop': knocked out of the player, briefly uncatchable so the weapon
//   actually leaves your hands, lands, expires after the recatch window.
// mode 'fixed': authored dare-pocket reward; bobs in place until collected.
let gunRollSerial = 0;

export function spawnCapsule(kind, letter, x, y, mode, vx, carriedGun = null) {
  // A fresh letter capsule rolls exactly once, at spawn. A popped capsule is
  // handed the immutable held gun object, so movement, expiry blinking, and a
  // later recatch can never reroll it. Pops do not consume the deterministic
  // serial either, keeping future carrier/fixed rolls independent of damage.
  const gun = kind === 'letter'
    ? carriedGun || rollGun(
        letter,
        x / LEVEL_LEN,
        `${CONFIG.gen.seed}:${gunRollSerial++}:${Math.round(x * 16)}`,
      )
    : null;
  const c = {
    kind, letter, x, y, baseY: y, vx: vx || 0, vy: mode === 'pop' ? CAP.popVy : 0,
    mode, dieAt: mode === 'pop' ? gameMs + CAP.recatchMs : 0, t: 0,
    noCatchUntil: mode === 'pop' ? gameMs + CAP.popNoCatchMs : 0,
    gun,
  };
  capsules.push(c);
  view.capsules.spawned(c);              // render: lettered box in the capsule palette
  return c;
}

export function removeCapsule(i) {
  const c = capsules[i];
  view.capsules.removed(c);
  capsules.splice(i, 1);
}

export function clearCapsules() {
  for (let i = capsules.length - 1; i >= 0; i--) removeCapsule(i);
}

// Carrier drop order: seeded shuffle of the four letters, then rare
// modifiers. Deterministic run to run.
const capsuleRng = mulberry32(2600);
function shuffled(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const letterDrops = shuffled(WEAPON_LETTERS.filter(k => k !== 'R'), capsuleRng);
const modDrops = shuffled(['RG', 'GS', 'OL', 'CH'], capsuleRng);
let carrierDropIdx = 0;

export function dropFromCarrier(x, y, authored = null) {
  if (authored && authored.kind && authored.letter) {
    spawnCapsule(authored.kind, authored.letter, x, y, 'drift');
    return;
  }
  const i = carrierDropIdx++;
  if (i < letterDrops.length) spawnCapsule('letter', letterDrops[i], x, y, 'drift');
  else spawnCapsule('mod', modDrops[(i - letterDrops.length) % modDrops.length], x, y, 'drift');
}

export function updateCapsules(dt) {
  for (let i = capsules.length - 1; i >= 0; i--) {
    const c = capsules[i];
    c.t += dt;
    if (c.mode === 'drift') {
      c.x -= CAP.driftSpeed * dt;
      const g = builtGroundTopAt(c.x);
      const floorY = (g > -100 ? g : 2) + 1.5;
      c.baseY = Math.max(c.baseY - CAP.sinkSpeed * dt, floorY);
      c.y = c.baseY + Math.sin(c.t * CAP.bobFreq) * CAP.bobAmp;
      if (c.x < sLeftEdge() - 4) { removeCapsule(i); continue; }
    } else if (c.mode === 'pop') {
      c.vy += CAP.gravity * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      const g = builtGroundTopAt(c.x);
      if (g > -100 && c.y <= g + 0.3 && c.vy < 0) { c.y = g + 0.3; c.vy = 0; c.vx *= 0.8; }
      if (c.y < CONFIG.edges.killY || gameMs > c.dieAt) { removeCapsule(i); continue; }
    } else {
      c.y = c.baseY + Math.sin(c.t * CAP.bobFreq) * CAP.bobAmp * 0.3;
    }

    if (gameMs >= c.noCatchUntil && circleHitsPlayer(c.x, c.y, CAP.pickupRadius)) {
      if (c.kind === 'mod') applyMod(c.letter);
      else {
        const def = setGun(c.gun);
        view.loot.acquired(c.gun, def, { recatch: c.mode === 'pop' });
      }
      // scoring: an authored reward starts a wager, a 'pop' recatch closes the
      // classic panic beat (proposal A.1) — both are pickups that already exist
      if (c.mode === 'fixed') scoreRewardTaken(c.letter, c.x, c.y);
      else if (c.mode === 'pop') scoreRecatch(c.letter, c.dieAt - gameMs, c.x, c.y);
      removeCapsule(i);
      continue;
    }

    // render: expiry blink, tower placement, and the pickup twirl all derive
    // from mode/dieAt/t
    view.capsules.sync(c);
  }
}

// run reset (resetGame in src/main.js): the carrier drop order rewinds
export function resetCarrierDrops() { carrierDropIdx = 0; gunRollSerial = 0; }
