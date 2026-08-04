/* ============================== JUICE ============================= */
/* The baseline feedback pass's event vocabulary (T-011): what a kill,
   a hit taken, a shot, a pickup, a ritual snap and a closing crush plane
   LOOK like. It is the render layer's conductor — it decides nothing
   about the run.

   Boundary contract (the same one src/ui/audio.js established, and for
   the same reason): this module observes the simulation by WRAPPING the
   existing src/sim/bridge.js view hooks — each wrapper calls the
   previously-installed implementation first, then the juice handler — and
   by reading exported sim state. It never writes sim state. The one
   effect that does change gameplay, hit-stop, is decided sim-side in
   src/sim/time.js and merely announced here through the additive
   view.juice.hitStop hook, so the shake lands on the frame the freeze
   does and the renderer can never lengthen it.

   Load order: src/main.js imports this LAST, after every render/ui module
   has installed its half of the bridge, so the wrappers capture the final
   implementations (audio's wrappers included — the chain delegates in
   both directions and neither layer replaces the other).

   ?juice=0 (src/mode.js) disables the module completely: no wrappers, no
   pools, no per-frame work.

   Effect intensities all live in CONFIG.juice; the curves live in
   src/pure/juice.js; the pools live in src/render/fx.js. Colors are role
   names resolved by fx.js (optional lazy palette import) — this file
   names roles, never hexes.                                            */

import { CONFIG } from '../config.js';
import { JUICE_ENABLED } from '../mode.js';
import { crushWarnIntensity } from '../pure/juice.js';
import { cornerTimeline } from '../pure/waves.js';
import { transformTimeline } from '../pure/transform.js';
import { view } from '../sim/bridge.js';
import { gameMs, hitStopRemainingMs } from '../sim/time.js';
import { sLeftEdge } from '../sim/edges.js';
import { player } from '../sim/player.js';
import { hostiles } from '../sim/hostiles.js';
import { scoreNotchNow } from '../sim/score.js';
import { activeCorner } from '../sim/wavegate.js';
import { activeTransformEvent } from '../sim/transform.js';
import { addTrauma, cameraTrauma } from './camera.js';
import {
  fxBurst, fxCoreRupture, fxCrush, fxDirectedBurst, fxDirectionalFlash,
  fxFlash, fxHostileColor, fxImplode, fxRing, fxRole, fxRoleFragments,
  fxShotColor, fxStats, fxVapor, resetFx, updateFx,
} from './fx.js';

const J = CONFIG.juice;
const S = J.shake;
const CT = cornerTimeline(CONFIG);
const TT = transformTimeline(CONFIG);

// Presentation multipliers only: simulation fire rate, projectile size and
// point collision stay in CONFIG.weapons. These describe the silhouette of a
// trigger pull at the camera: rifle crack, spread fan, laser corridor, homing
// petals, and flame rake.
const WEAPON_FX = Object.freeze({
  R: Object.freeze({ flash: 1.25, fan: 0.75, spread: 0.10, hit: 1.00,
    breach: 0.00, beat1: 48, beat2: 104, beat3: 164 }),
  S: Object.freeze({ flash: 1.30, fan: 1.00, spread: 0.72, hit: 1.15,
    breach: 0.00, beat1: 44, beat2: 102, beat3: 176 }),
  L: Object.freeze({ flash: 1.65, fan: 0.50, spread: 0.04, hit: 1.75,
    breach: 1.30, beat1: 32, beat2: 74, beat3: 132 }),
  H: Object.freeze({ flash: 1.45, fan: 0.50, spread: 0.58, hit: 1.25,
    breach: 0.85, beat1: 42, beat2: 96, beat3: 166 }),
  F: Object.freeze({ flash: 1.90, fan: 1.50, spread: 0.46, hit: 1.50,
    breach: 1.10, beat1: 54, beat2: 122, beat3: 214 }),
});

/* Stable semantic hooks for the eventual bitmap VFX atlas. Runtime remains
 * procedural/pool-backed in this pass; a v2 pack can map these cells onto the
 * same four beat slots without touching damage, collision, event timing or
 * the capture contract. Keeping the names here makes art replacement data,
 * not another weapon switch statement. */
export const ACTION_VFX_V2_HOOKS = Object.freeze({
  version: 2,
  weapons: Object.freeze({
    R: Object.freeze(['rivet-contact-pin', 'rivet-through-chip', 'rivet-plate-pop', 'rivet-cool-cut']),
    S: Object.freeze(['scatter-contact-rake', 'scatter-armour-fan', 'scatter-reverse-rake', 'scatter-cross-cut']),
    L: Object.freeze(['lance-contact-seam', 'lance-throughline', 'lance-collapse', 'lance-cool-needle']),
    H: Object.freeze(['homing-vane-a', 'homing-vane-b', 'homing-core-shear', 'homing-guidance-debris']),
    F: Object.freeze(['cinder-contact-bite', 'cinder-hot-solids', 'cinder-backwash', 'cinder-pressure-wake']),
  }),
  deaths: Object.freeze({
    wasp: Object.freeze(['wasp-core-snip', 'wasp-wing-shear', 'wasp-thrust-fall', 'wasp-cooling-wake']),
    hound: Object.freeze(['hound-spine-break', 'hound-scute-skid', 'hound-deck-scrape', 'hound-cooling-wake']),
    emplacement: Object.freeze(['mount-contact', 'mount-bracket-eject', 'mount-vent-collapse', 'mount-cooling-wake']),
  }),
});

/* ----------------------- action impact beats --------------------- *
 * A projectile endpoint already draws the exact collision point in bullets.js.
 * This tiny render-only sequencer pays off the struck BODY over the next two
 * beats: armour first, then the weapon's residue. It is sixteen preallocated
 * numeric rows and claims round-robin, so a screenful of pierce hits cannot
 * allocate, grow, or add a draw call. The existing eight FX pools remain the
 * only geometry owners; an inactive row draws literally nothing. */
const ACTION_IMPACT_MAX = 16;
const actionImpacts = Array.from({ length: ACTION_IMPACT_MAX }, () => ({
  active: false, t0: 0, stage: 0, type: 'R', x: 0, y: 0,
  ds: 1, dy: 0, scale: 1, color: 0, enemy: 0,
  role: 'machine', warden: false,
}));
let actionImpactCursor = 0;
let actionImpactLive = 0;
let actionImpactRecycles = 0;

function hostileFragmentRole(kind) {
  return kind === 'wasp' ? 'wing' : (kind === 'hound' ? 'hound' : 'machine');
}

function emitActionImpact(row, stage) {
  const { x, y, ds, dy, scale: k, color, enemy, role } = row;
  const px = -dy, py = ds;              // tangent to the incoming shot
  const armour = row.warden ? 1.18 : 1;

  if (row.type === 'S') {
    if (stage === 0) {
      // One broad cross-cut says that five manufactured flechettes arrived
      // together. The projectile endpoint owns the rooted rake; this target
      // response starts with the clipped armour spray, not a duplicate lamp.
      fxDirectedBurst(J.impact, x, y, color, ds, dy, 1.06, 0.62 * k);
    } else if (stage === 1) {
      fxRoleFragments(role, x, y, enemy, ds, dy + 0.18,
        0.56 * k * armour);
      fxDirectionalFlash(66, 0.62 * k, 0.12 * k, x, y, enemy,
        px, py, 0.04);
    } else if (stage === 2) {
      fxDirectedBurst(J.impact, x - ds * 0.08, y - dy * 0.08, color,
        -ds, -dy, 0.88, 0.44 * k);
    } else {
      fxDirectionalFlash(78, 0.48 * k, 0.095 * k, x, y, color,
        -px, -py, 0.03);
    }
    return;
  }

  if (row.type === 'L') {
    if (stage === 0) {
      // A long, narrow seam is the only impact that continues through the
      // body. A split core bloomed into a cyan star once contact punctuation
      // correctly layered over painted actors; keep the first frame a clipped
      // through-line and reserve the inward collapse for beat two.
      fxCoreRupture(x, y, color, ds, dy, 0.10 * k, 0.05, 2.20);
    } else if (stage === 1) {
      fxDirectedBurst(J.impact, x, y, color, ds, dy, 0.055, 0.56 * k);
      fxDirectionalFlash(58, 0.72 * k, 0.075 * k, x, y, color,
        ds, dy, 0.045);
    } else if (stage === 2) {
      fxImplode(96, 0.52 * k, x - ds * 0.08, y - dy * 0.08,
        color, 0.035);
    } else {
      fxDirectedBurst(J.impact, x, y, color, -ds, -dy, 0.035, 0.26 * k);
    }
    return;
  }

  if (row.type === 'H') {
    if (stage === 0) {
      // Guidance vanes scissor ACROSS the flight line. The second half arrives
      // from the opposite side on the next beat. The endpoint owns vane A.
      fxDirectedBurst(J.impact, x, y, color, px, py, 0.20, 0.46 * k);
    } else if (stage === 1) {
      fxDirectionalFlash(64, 0.66 * k, 0.11 * k, x, y, color,
        -px, -py, 0.045);
      fxDirectedBurst(J.impact, x, y, color, -px, -py, 0.20, 0.40 * k);
    } else if (stage === 2) {
      fxCoreRupture(x, y, color, ds, dy, 0.52 * k, 0.045, 1.35);
    } else {
      fxRoleFragments(role, x, y, enemy, px, py + 0.10,
        0.48 * k * armour);
    }
    return;
  }

  if (row.type === 'F') {
    if (stage === 0) {
      // Cindermouth pierces its first two bodies, so terminal cleanup cannot
      // own the hit read. The exact hostileImpact fact roots one clipped,
      // orange bite here on every real damage contact. It is directional and
      // short-lived—not a radius flash—and bullets.js suppresses only F's
      // redundant HOSTILE terminal glyph when the final pierce is spent.
      fxDirectionalFlash(92, 1.82 * k, 0.30 * k, x, y, color,
        ds, dy, 0.22);
      // Two torn halves give the bite a connected manufactured jaw at FAR,
      // with a dark seam through the collision instead of a luminous disk.
      // This core used to arrive on beat one; moving it here strengthens
      // contact without increasing the sequence's total effect count.
      fxCoreRupture(x, y, color, ds, dy, 0.62 * k, 0.225, 1.70);
    } else if (stage === 1) {
      fxDirectedBurst(J.impact, x, y, color, ds, Math.min(-0.18, dy),
        0.68, 0.58 * k);
      fxRoleFragments(role, x, y, enemy, ds, -0.32,
        0.52 * k * armour);
    } else if (stage === 2) {
      fxDirectedBurst(J.impact, x, y - 0.04, color, -ds, 0.16,
        0.50, 0.36 * k);
    } else {
      fxVapor(x - ds * 0.10, y, enemy, -ds, 0.64 * k, 0.025);
    }
    return;
  }

  // Rivet is a hard horizontal pin, one displaced plate, a reverse ricochet,
  // then silence. It is the compact baseline, but no longer microscopic.
  if (stage === 0) {
    fxCoreRupture(x, y, color, ds, dy, 0.36 * k, 0.04, 1.55);
  } else if (stage === 1) {
    fxDirectedBurst(J.impact, x, y, color, ds, dy, 0.16, 0.40 * k);
  } else if (stage === 2) {
    fxRoleFragments(role, x, y, enemy, -ds, Math.max(0.14, -dy),
      0.42 * k * armour);
  } else {
    fxDirectedBurst(J.impact, x, y, color, -ds, Math.max(0.18, -dy),
      0.12, 0.22 * k);
  }
}

function armActionImpact(targetKind, type, x, y, ds, dy, scale) {
  const row = actionImpacts[actionImpactCursor];
  actionImpactCursor = (actionImpactCursor + 1) % ACTION_IMPACT_MAX;
  if (row.active) actionImpactRecycles++;
  else actionImpactLive++;
  row.active = true;
  row.t0 = gameMs;
  row.stage = 0;
  row.type = type;
  row.x = x;
  row.y = y;
  row.ds = ds;
  row.dy = dy;
  row.scale = scale;
  row.color = fxShotColor(type);
  row.enemy = fxHostileColor(targetKind);
  row.role = hostileFragmentRole(targetKind);
  row.warden = targetKind === 'warden';
  emitActionImpact(row, 0);
}

function updateActionImpacts() {
  for (let i = 0; i < ACTION_IMPACT_MAX; i++) {
    const row = actionImpacts[i];
    if (!row.active) continue;
    const W = WEAPON_FX[row.type];
    const elapsed = gameMs - row.t0;
    // Chained fixed tests preserve all authored punctuation under a clamped
    // 50ms frame: a slow device may cross two deadlines, but it may not
    // silently skip a family beat. Four is a fixed ceiling, never a queue.
    if (row.stage === 0 && elapsed >= W.beat1) {
      row.stage = 1; emitActionImpact(row, 1);
    }
    if (row.stage === 1 && elapsed >= W.beat2) {
      row.stage = 2; emitActionImpact(row, 2);
    }
    if (row.stage === 2 && elapsed >= W.beat3) {
      row.stage = 3;
      emitActionImpact(row, 3);
      row.active = false;
      actionImpactLive--;
    }
  }
}

function resetActionImpacts() {
  for (let i = 0; i < ACTION_IMPACT_MAX; i++) actionImpacts[i].active = false;
  actionImpactCursor = 0;
  actionImpactLive = 0;
  actionImpactRecycles = 0;
}

/* --------------------- role destruction sentences ------------------ *
 * Corpses remain owned by hostiles.js, including their exact final pose and
 * bounded continuity. This fixed presentation sequencer makes the material
 * leaving that pose obey the same role: wings shear, scutes skid, mounted
 * brackets vent, and carrier shells part. No whole body is rotated, scaled or
 * removed here. The four rows are future atlas slots named above. */
const DEATH_SENTENCE_MAX = 12;
const DEATH_BEATS = Object.freeze({
  wasp: Object.freeze([58, 142, 268]),
  hound: Object.freeze([72, 176, 318]),
  polyp: Object.freeze([76, 188, 342]),
  mortar: Object.freeze([68, 174, 326]),
  carrier: Object.freeze([84, 206, 368]),
  machine: Object.freeze([74, 184, 334]),
});
const deathSentences = Array.from({ length: DEATH_SENTENCE_MAX }, () => ({
  active: false, started: false, targetId: 0,
  t0: 0, stage: 0, kind: 'machine', role: 'machine',
  x: 0, y: 0, dir: 1, incomingS: 1, incomingY: 0,
  shot: 0, enemy: 0, scale: 1,
}));
let deathSentenceCursor = 0;
let deathSentenceLive = 0;
let deathSentenceRecycles = 0;

function emitDeathSentence(row, stage) {
  const { x, y, dir, incomingS: ds, incomingY: dy, shot, enemy } = row;
  const k = row.scale;

  if (row.kind === 'wasp') {
    if (stage === 0) {
      fxDirectionalFlash(78, 0.78 * k, 0.15 * k, x, y, shot,
        ds, dy, 0.055);
      fxCoreRupture(x, y, shot, ds, dy, 0.62 * k, 0.055, 1.55);
    } else if (stage === 1) {
      fxRoleFragments('wing', x, y, enemy, dir, -0.38, 1.18 * k);
      fxDirectedBurst(J.death, x, y, enemy, dir, -0.42, 0.54, 0.78 * k);
    } else if (stage === 2) {
      fxDirectedBurst(J.impact, x, y, shot, -dir, 0.58, 0.42, 0.72 * k);
      fxDirectionalFlash(82, 0.62 * k, 0.10 * k, x, y, enemy,
        -dir, 0.44, 0.04);
    } else {
      fxVapor(x - dir * 0.10, y - 0.06, enemy, -dir, 0.66 * k, 0.025);
    }
    return;
  }

  if (row.kind === 'hound') {
    if (stage === 0) {
      fxDirectionalFlash(84, 0.90 * k, 0.17 * k, x, y - 0.04, shot,
        ds, dy, 0.055);
      fxCoreRupture(x, y - 0.04, shot, ds, dy, 0.68 * k, 0.05, 1.75);
    } else if (stage === 1) {
      fxRoleFragments('hound', x, y - 0.10, enemy, dir, 0.08, 1.16 * k);
    } else if (stage === 2) {
      fxDirectedBurst(J.death, x, y - 0.14, enemy, dir, 0.08, 0.30, 0.92 * k);
      fxDirectedBurst(J.impact, x, y - 0.06, shot, -dir, 0.16, 0.24, 0.68 * k);
    } else {
      fxVapor(x - dir * 0.12, y - 0.18, enemy, -dir, 0.58 * k, 0.018);
    }
    return;
  }

  if (row.kind === 'polyp' || row.kind === 'mortar') {
    const mortar = row.kind === 'mortar';
    if (stage === 0) {
      // The root stays; barrel/iris energy is driven into the mount.
      fxDirectionalFlash(86, (mortar ? 0.82 : 0.92) * k, 0.16 * k,
        x, y, shot, mortar ? -dir : 0, mortar ? 0.52 : 1, 0.055);
      fxCoreRupture(x, y, shot, ds, dy, 0.64 * k, 0.05,
        mortar ? 1.55 : 1.25);
    } else if (stage === 1) {
      fxRoleFragments('machine', x, y, enemy,
        mortar ? -dir : dir, mortar ? 0.62 : 0.78, 1.08 * k);
    } else if (stage === 2) {
      fxDirectedBurst(J.death, x, y, enemy, 0, 1, 0.28, 0.86 * k);
      fxDirectedBurst(J.impact, x, y - 0.12, shot, 0, -1, 0.22, 0.62 * k);
    } else {
      fxVapor(x, y - 0.08, enemy, 0, 0.76 * k, 0.024);
    }
    return;
  }

  if (row.kind === 'carrier') {
    if (stage === 0) {
      fxDirectionalFlash(94, 1.04 * k, 0.19 * k, x, y, shot,
        ds, dy, 0.06);
      fxCoreRupture(x, y, shot, ds, dy, 0.78 * k, 0.06, 1.65);
    } else if (stage === 1) {
      fxRoleFragments('machine', x - 0.16, y, enemy, -1, 0.30, 1.20 * k);
      fxRoleFragments('machine', x + 0.16, y, enemy, 1, 0.30, 1.20 * k);
    } else if (stage === 2) {
      fxDirectedBurst(J.death, x, y, enemy, 0, -1, 0.36, 0.92 * k);
      fxDirectedBurst(J.impact, x, y + 0.05, shot, 0, 1, 0.28, 0.72 * k);
    } else {
      fxVapor(x, y - 0.12, enemy, -ds, 0.88 * k, 0.03);
    }
    return;
  }

  // Stable fallback for any later mechanical role: pin, two brackets, vent.
  if (stage === 0) {
    fxDirectionalFlash(82, 0.82 * k, 0.16 * k, x, y, shot,
      ds, dy, 0.05);
    fxCoreRupture(x, y, shot, ds, dy, 0.64 * k, 0.05, 1.45);
  } else if (stage === 1) {
    fxRoleFragments(row.role, x, y, enemy, dir, 0.34, 1.04 * k);
  } else if (stage === 2) {
    fxDirectedBurst(J.death, x, y, enemy, dir, 0.34, 0.52, 0.82 * k);
  } else {
    fxVapor(x, y, enemy, -ds, 0.68 * k, 0.02);
  }
}

function armDeathSentence(e, incomingS, incomingY, shot, enemy, scale) {
  const row = deathSentences[deathSentenceCursor];
  deathSentenceCursor = (deathSentenceCursor + 1) % DEATH_SENTENCE_MAX;
  if (row.active) deathSentenceRecycles++;
  else deathSentenceLive++;
  row.active = true;
  row.started = false;
  row.targetId = e.id;
  row.t0 = gameMs;
  row.stage = 0;
  row.kind = DEATH_BEATS[e.kind] ? e.kind : 'machine';
  row.role = hostileFragmentRole(e.kind);
  row.x = e.x; row.y = e.y;
  row.dir = Math.sign(e.vx) || e.dir || -1;
  row.incomingS = incomingS; row.incomingY = incomingY;
  row.shot = shot; row.enemy = enemy; row.scale = scale;
}

function updateDeathSentences() {
  for (let i = 0; i < DEATH_SENTENCE_MAX; i++) {
    const row = deathSentences[i];
    if (!row.active) continue;
    // Removal happens inside hitHostile, before weapons.js publishes the exact
    // successful terminal fact. Defer beat zero until the render update later
    // in the same frame so a lethal bullet can replace the body-centre fallback
    // with its exact collision point, chassis and live travel vector.
    if (!row.started) { row.started = true; emitDeathSentence(row, 0); }
    const beats = DEATH_BEATS[row.kind];
    const elapsed = gameMs - row.t0;
    if (row.stage === 0 && elapsed >= beats[0]) {
      row.stage = 1; emitDeathSentence(row, 1);
    }
    if (row.stage === 1 && elapsed >= beats[1]) {
      row.stage = 2; emitDeathSentence(row, 2);
    }
    if (row.stage === 2 && elapsed >= beats[2]) {
      row.stage = 3; emitDeathSentence(row, 3);
      row.active = false;
      deathSentenceLive--;
    }
  }
}

function resetDeathSentences() {
  for (let i = 0; i < DEATH_SENTENCE_MAX; i++) deathSentences[i].active = false;
  deathSentenceCursor = 0;
  deathSentenceLive = 0;
  deathSentenceRecycles = 0;
}

/* ---------------------------- throttles --------------------------- *
 * A spread volley is five slots and a pierce laser is many hits per
 * frame; the feedback for both is ONE beat. Gates are in gameMs, so they
 * scale with the game clock rather than the wall clock.               */
const lastAt = {};
function gate(key, ms) {
  if (gameMs - (lastAt[key] || -1e9) < ms) return false;
  lastAt[key] = gameMs;
  return true;
}

/* ---------------------------- handlers ---------------------------- */

// the sim's beat: hit-stop armed → the matching trauma, same frame
function onHitStop(kind) {
  addTrauma(kind === 'hurt' ? S.hurt : S.kill);
}

let recentShotType = 'R';
let recentShotAt = -1e9;

// Muzzle theater: one event per volley, at the actual firing line along the
// aim. The fan is visible immediately, before the projectiles have had a frame
// to separate; laser/homing/flame also kick apart a small launch shutter.
function onShotSpawned(_i, type) {
  recentShotType = WEAPON_FX[type] ? type : 'R';
  recentShotAt = gameMs;
  if (!gate('muzzle', J.muzzle.volleyGapMs)) return;
  const M = J.muzzle;
  const W = WEAPON_FX[recentShotType];
  const ax = player.aim.x, ay = player.aim.y;
  const x = player.x + ax * M.offsetTiles;
  const y = player.y + player.muzzleY + ay * M.offsetTiles;
  const color = fxShotColor(recentShotType);
  fxFlash(M.ms, M.size * W.flash, x, y, color);
  fxDirectedBurst(J.impact, x, y, color, ax, ay, W.spread, W.fan);
  if (W.breach > 0) fxRing(M.ms * 1.8, M.size * W.breach, x, y, color, 0.02);
}

// hostiles: an hp drop is an impact (armour pings do not drop hp, so an
// iris bounce correctly produces no debris); a removal WITH a corpse fade
// is a death — the same two facts src/ui/audio.js keys its hit/kill on.
const hostileHp = new Map();

function onHostileSpawned(e) { hostileHp.set(e.id, e.hp); }

function onHostileSync(e) {
  const hp = hostileHp.get(e.id);
  if (hp !== undefined && e.hp < hp && gate('impact', J.impact.gapMs)) {
    // Non-projectile damage (launch shock / scripted break) has no lettered
    // chassis. Real bullets advance this hp baseline in their exact terminal
    // observer below, so this fallback cannot duplicate or mislabel them.
    const type = 'R';
    const W = WEAPON_FX[type];
    const weight = Math.min(1.46,
      (0.74 + W.hit * 0.16) * (1 + Math.max(0, hp - e.hp - 1) * 0.12));
    // Continue the projectile's sentence through the struck body, then stage
    // physical armour/residue without holding a glowing badge over the actor.
    // The endpoint renderer owns contact; this row owns the target's answer.
    const dx = e.x - player.x;
    const dy = e.y - (player.y + player.muzzleY);
    const inv = 1 / Math.max(0.001, Math.hypot(dx, dy));
    armActionImpact(e.kind, type, e.x, e.y, dx * inv, dy * inv,
      weight * (e.kind === 'warden' ? 1.16 : 1));
  }
  hostileHp.set(e.id, e.hp);
}

function onBulletHostileImpact(
  _slot, type, x, y, vx, vy, targetId, targetKind, damaged, lethal,
) {
  if (!damaged) return;
  const inv = 1 / Math.max(0.001, Math.hypot(vx, vy));
  const ds = vx * inv, dy = vy * inv;
  const W = WEAPON_FX[type] || WEAPON_FX.R;

  // Advance the hp observer from the already-resolved sim row. This prevents
  // next frame's ordinary hostile sync from manufacturing a second, late,
  // player-centred impact for the same projectile fact.
  if (!lethal) {
    for (let i = 0; i < hostiles.length; i++) {
      if (hostiles[i].id !== targetId) continue;
      hostileHp.set(targetId, hostiles[i].hp);
      break;
    }
  }

  if (gate('impact', J.impact.gapMs)) {
    const weight = Math.min(1.46, 0.74 + W.hit * 0.16);
    armActionImpact(targetKind, type, x, y, ds, dy,
      weight * (targetKind === 'warden' ? 1.16 : 1));
  }

  if (!lethal) return;
  // hitHostile removes before returning, so the role sentence already owns a
  // fixed pending row. Correct it synchronously before updateJuice emits beat
  // zero later in this same frame. No queue growth and no object event.
  for (let i = 0; i < DEATH_SENTENCE_MAX; i++) {
    const row = deathSentences[i];
    if (!row.active || row.targetId !== targetId) continue;
    row.x = x; row.y = y;
    row.incomingS = ds; row.incomingY = dy;
    row.shot = fxShotColor(type);
    break;
  }
}

let deathChain = 0;
let lastDeathAt = -1e9;
let firstBreakDone = false;

// One Warden can own the Crown encounter. Its destruction therefore gets a
// tiny fixed sequencer rather than spending all of its punctuation on the
// removal frame: outer hardpoints eject, the exposed signal is pulled inward,
// then the core cracks into the mount. This is render state only—no timer or
// finale rule reads it—and every stage claims from the existing FX pools.
const wardenRupture = {
  active: false, t0: 0, stage: 0, x: 0, y: 0, dir: 1,
  signal: 0, carrier: 0, enemy: 0,
};

function armWardenRupture(e, signal, carrier, enemy) {
  wardenRupture.active = true;
  wardenRupture.t0 = gameMs;
  wardenRupture.stage = 0;
  wardenRupture.x = e.x;
  wardenRupture.y = e.y;
  wardenRupture.dir = Math.sign(e.vx) || e.dir || 1;
  wardenRupture.signal = signal;
  wardenRupture.carrier = carrier;
  wardenRupture.enemy = enemy;
}

function updateWardenRupture() {
  if (!wardenRupture.active) return;
  const w = wardenRupture;
  const elapsed = gameMs - w.t0;

  if (w.stage === 0 && elapsed >= 240) {
    w.stage = 1;
    // Weapon shoulders clear the silhouette in opposite directions. Two
    // local fans read as heavy assemblies leaving their rails, not confetti.
    fxDirectedBurst(J.death, w.x - 1.55, w.y + 0.10, w.enemy,
      -1, 0.24, 0.28, 1.55);
    fxDirectedBurst(J.death, w.x + 1.55, w.y + 0.10, w.enemy,
      1, 0.24, 0.28, 1.55);
    fxRoleFragments('machine', w.x - 1.55, w.y + 0.10, w.enemy,
      -1, 0.18, 0.78);
    fxRoleFragments('machine', w.x + 1.55, w.y + 0.10, w.enemy,
      1, 0.18, 0.78);
    fxDirectionalFlash(148, 1.18, 0.12,
      w.x, w.y + 0.18, w.carrier, w.dir, -0.08, 0.08);
    addTrauma(S.boom * 0.42);
    return;
  }

  if (w.stage === 1 && elapsed >= 650) {
    w.stage = 2;
    // Signal packets run back along the severed rails. Two offset broken
    // seams close toward one another; a single giant magenta implode read as
    // a pasted star over the six-piece mechanical failure.
    fxDirectedBurst(J.impact, w.x - 1.48, w.y + 0.04, w.signal,
      1, 0, 0.18, 1.35);
    fxDirectedBurst(J.impact, w.x + 1.48, w.y + 0.04, w.signal,
      -1, 0, 0.18, 1.35);
    fxDirectionalFlash(215, 1.04, 0.10,
      w.x - 0.78, w.y + 0.20, w.signal, 1, -0.18, 0.12);
    fxDirectionalFlash(235, 0.94, 0.09,
      w.x + 0.76, w.y - 0.12, w.signal, -1, 0.18, 0.12);
    addTrauma(S.boom * 0.62);
    return;
  }

  if (w.stage === 2 && elapsed >= 1010) {
    w.stage = 3;
    // The last beat goes INTO the Crown mount and vents one compact plume.
    // A long down-cut and short signal cross-cut expose the dark core seam;
    // no circular white lamp stands in for the machinery.
    fxDirectedBurst(J.impact, w.x - 0.40, w.y + 0.02, w.enemy,
      -0.22, -1, 0.18, 0.72);
    fxDirectedBurst(J.impact, w.x + 0.40, w.y + 0.02, w.enemy,
      0.22, -1, 0.18, 0.72);
    fxDirectedBurst(J.impact, w.x, w.y + 0.10, w.signal,
      0, 1, 0.24, 0.58);
    fxDirectionalFlash(150, 1.34, 0.09,
      w.x - 0.10, w.y + 0.02, w.carrier, 0, -1, 0.10);
    fxDirectionalFlash(132, 0.92, 0.075,
      w.x + 0.06, w.y + 0.09, w.signal, 1, 0, 0.105);
    fxDirectionalFlash(142, 0.76, 0.07,
      w.x - 0.04, w.y - 0.08, w.enemy, -0.72, -0.38, 0.095);
    fxVapor(w.x, w.y - 0.12, w.enemy, 0, 1.05, 0.06);
    addTrauma(S.boom * 0.78);
    return;
  }

  if (w.stage === 3 && elapsed >= 1260) w.active = false;
}

function onHostileRemoved(e, fade) {
  hostileHp.delete(e.id);
  if (!fade) return;                     // teardown/cull: no death, no debris
  deathChain = gameMs - lastDeathAt <= 780 ? Math.min(5, deathChain + 1) : 1;
  lastDeathAt = gameMs;
  const chainScale = 1 + (deathChain - 1) * 0.18;
  const enemyColor = fxHostileColor(e.kind);
  // A lethal projectile publishes its exact chassis/axis immediately after
  // this removal callback and corrects the deferred role row before beat zero.
  // Non-projectile breaks use the dependable neutral R value, never whichever
  // unrelated muzzle happened to fire most recently.
  const shotColor = fxShotColor('R');

  // The weapon establishes the incoming axis. The corpse owns its exact final
  // pose; a fixed four-beat role sentence only sheds construction from it.
  // Nothing below scales, spins or removes the corpse itself.
  const dir = Math.sign(e.vx) || e.dir || -1;
  const impactS = e.x - player.x;
  const impactY = e.y - (player.y + player.muzzleY);
  const impactInv = 1 / Math.max(0.001, Math.hypot(impactS, impactY));
  const incomingS = impactS * impactInv;
  const incomingY = impactY * impactInv;
  if (e.kind !== 'warden') {
    const roleScale = e.kind === 'carrier' ? 1.16 :
      (e.kind === 'wasp' ? 0.92 : 1.02);
    armDeathSentence(e, incomingS, incomingY, shotColor, enemyColor,
      roleScale * Math.min(1.16, chainScale));
  }
  // Warden contact is deliberately absent here: removal runs inside
  // hitHostile before the projectile publishes its exact off-centre terminal.
  // That collision hook owns contact; the fixed Warden sequencer below owns
  // only later whole-machine failure beats.

  // Mutation hardware shuts off in its own signal colour. These are compact
  // inward/falling cues paired with hostiles.js's contracting Aegis crown and
  // clamping Backlash shoes — never a blast that implies their hazard fired.
  if (e.aegis) {
    fxDirectedBurst(J.impact, e.x, e.y + 0.45, fxRole('capsule'), 0, -1,
      0.22, 0.62);
  } else if (e.backlash) {
    fxDirectedBurst(J.impact, e.x, e.y, fxRole('capsule'), -dir, 0.18,
      0.42, 0.48);
  }

  // The six-tile Warden cannot die with one-tile punctuation. Arm the fixed
  // three-stage sequencer; the corpse renderer owns the matching physical
  // limb/core motion while this layer contributes only light and fragments.
  if (e.kind === 'warden') {
    const signal = fxRole('capsule');
    const carrier = fxRole('muzzle');
    armWardenRupture(e, signal, carrier, enemyColor);
    addTrauma(S.boom * 1.45);
  }

  // The first machine RIG breaks teaches the reward language loudly: an
  // upward shrapnel fan and one long fracture stroke. It happens naturally in
  // the opening fight, costs no rule/state change, and gives the first minute
  // one authored "whoa" beat instead of waiting for a late-game weapon drop.
  if (!firstBreakDone) {
    firstBreakDone = true;
    // Loud means more construction, not a white lamp. The role's own solid
    // alphabet remains visible through bloom and leaves the corpse readable.
    if (e.kind !== 'warden') {
      fxRoleFragments(hostileFragmentRole(e.kind), e.x, e.y, enemyColor,
        dir, e.kind === 'wasp' ? -0.28 : 0.26, 1.18);
      fxDirectedBurst(J.impact, e.x, e.y, fxRole('warn'),
        -dir, 0.42, 0.44, 0.62);
      addTrauma(S.boom * 0.8);
    }
  }

  // Three fast kills earn the one larger beat. It is capped and gated at
  // 600ms: spectacular in a crowd, never screen-white spam.
  if (e.kind !== 'warden' && deathChain >= 3 && gate('chainBlast', 600)) {
    const payoff = Math.min(1.65, 1.25 + (deathChain - 3) * 0.14);
    fxDirectedBurst(J.death, e.x, e.y, fxRole('warn'), -dir, 0.56, 0.66, payoff);
    fxDirectedBurst(J.death, e.x, e.y, enemyColor, dir, 0.28, 0.58,
      payoff * 0.72);
    fxDirectionalFlash(155, 1.34, 0.24, e.x, e.y, fxRole('warn'),
      0, 1, 0.065);
    addTrauma(S.kill * 0.65);
  }
}

// capsules: removal is a pickup only under the sim's own catch predicate.
// Mirrors src/ui/audio.js's test exactly (expiry first, then the no-catch
// window, then the overlap) so a popped capsule dying under RIG does not
// flash a false reward.
function onCapsuleRemoved(c) {
  if (c.mode === 'pop' && (c.y < CONFIG.edges.killY || gameMs > c.dieAt)) return;
  if (gameMs < c.noCatchUntil) return;
  if (!circleOverlapsPlayer(c.x, c.y, CONFIG.capsules.pickupRadius)) return;
  const color = fxRole(c.kind === 'mod' ? 'modCapsule' : 'capsule');
  fxBurst(J.pickup, c.x, c.y, color, 1.35);
  fxDirectedBurst(J.pickup, c.x, c.y, color, 0, 1, 1.65, 1.25);
  fxFlash(J.pickup.flashMs * 1.25, J.pickup.flashSize * 1.15, c.x, c.y, color);
  fxRing(280, c.kind === 'mod' ? 2.35 : 1.85, c.x, c.y, color, 0.05);
}

// local copy of the sim's circle-vs-AABB test: reading it would be fine,
// but the juice layer stays a pure observer of sim DATA, not of sim code
function circleOverlapsPlayer(x, y, r) {
  const cx = Math.max(player.x - player.hw, Math.min(x, player.x + player.hw));
  const cy = Math.max(player.y, Math.min(y, player.y + player.h));
  return (x - cx) ** 2 + (y - cy) ** 2 < r * r;
}

/* per-frame player edge detection (view.player.sync fires once per sim
   frame): RIG's own damage burst, plus the ritual rumble/snap cues that
   have no hook of their own on the six-face run. */
const prev = {
  hp: player.hp,
  airJumpsLeft: player.airJumpsLeft, traversalState: player.traversalState,
  cornerK: 0, cornerState: 'idle', snap1: false, snap2: false,
  xfIndex: -1, xfState: 'idle', xfSnap1: false, xfSnap2: false,
};

function onPlayerSync() {
  if (player.hp < prev.hp) {
    fxBurst(J.hurt, player.x, player.y + player.h * 0.5, fxRole('rig'));
    fxFlash(J.hurt.flashMs, J.hurt.flashSize, player.x, player.y + player.h * 0.5,
      fxRole('rig'));
  }
  prev.hp = player.hp;

  // BREAKING turns a real traversal launch into a close-range shock weapon.
  // Detect the same two state edges scoreLaunch() can arm: an air-jump spends
  // a charge, while a ledge/wall launch exits its held traversal state upward.
  // A normal ground jump matches neither edge and therefore cannot lie.
  const airLaunch = !player.grounded && player.airJumpsLeft < prev.airJumpsLeft;
  const contactLaunch = prev.traversalState !== 'free' &&
    player.traversalState === 'free' && player.vy > 0.5;
  if (scoreNotchNow() >= CONFIG.score.notches.length && (airLaunch || contactLaunch)) {
    const x = player.x, y = player.y + player.h * 0.52;
    const color = fxShotColor(recentShotType);
    const radius = CONFIG.score.shockRadius;
    fxDirectedBurst(J.death, x, y, color, 0, 1, 2.45, 1.45);
    fxFlash(190, 1.75, x, y, color, 0.08);
    // The first broken shutter reaches the true damage diameter; the second
    // is a looser mechanical echo. Open gaps keep RIG and the route readable.
    fxRing(320, radius * 2, x, y, color, 0.10);
    fxRing(510, radius * 2.55, x, y, fxRole('warn'), 0.04);
    addTrauma(S.boom * 0.72);
  }
  prev.airJumpsLeft = player.airJumpsLeft;
  prev.traversalState = player.traversalState;

  const c = activeCorner();
  if (c) {
    if (c.k !== prev.cornerK || c.state !== prev.cornerState) {
      if (c.state === 'turning') { prev.snap1 = false; prev.snap2 = false; }
      prev.cornerK = c.k;
      prev.cornerState = c.state;
    }
    if (c.state === 'turning') {
      const t = gameMs - c.tStart;
      if (!prev.snap1 && t >= CT.t2) { prev.snap1 = true; addTrauma(S.snap1); }
      if (!prev.snap2 && t >= CT.t4) { prev.snap2 = true; addTrauma(S.snap2); }
    }
  }
}

// transform rituals have their own hooks; the corner's do not, hence the
// split above. Same two impact frames either way.
function onTransformRitual(ev, t) {
  if (ev.index !== prev.xfIndex) {
    prev.xfIndex = ev.index;
    prev.xfSnap1 = false;
    prev.xfSnap2 = false;
  }
  if (!prev.xfSnap1 && t >= TT.t2) { prev.xfSnap1 = true; addTrauma(S.snap1); }
  if (!prev.xfSnap2 && t >= TT.t4) { prev.xfSnap2 = true; addTrauma(S.snap2); }
}

function onBoom() {
  addTrauma(S.boom);
  // Clearing a face is the climb's exclamation mark: the route opens with a
  // compact vertical ignition around RIG, rather than only a camera tremor.
  const y = player.y + player.h * 0.55;
  const shot = fxShotColor(recentShotType);
  const warn = fxRole('warn');
  fxDirectedBurst(J.death, player.x, y, warn, 0, 1, 1.35, 1.45);
  fxFlash(220, 1.65, player.x, y, shot, 0.04);
  fxRing(390, 4.1, player.x, y, shot, 0.05);
  fxRing(570, 6.0, player.x, y, warn, 0.02);
}

function onTransformReset() {
  prev.xfIndex = -1;
  prev.xfSnap1 = false;
  prev.xfSnap2 = false;
}

function onStateScreen(next) {
  if (next !== 'PLAYING') return;
  // a restart rewound the world: drop live effects and the stale caches, or
  // the first frame of the retry inherits the last frame of the attempt
  resetFx();
  hostileHp.clear();
  recentShotType = 'R'; recentShotAt = -1e9;
  deathChain = 0; lastDeathAt = -1e9;
  firstBreakDone = false;
  resetActionImpacts();
  resetDeathSentences();
  wardenRupture.active = false;
  wardenRupture.stage = 0;
  prev.hp = player.hp;
  prev.airJumpsLeft = player.airJumpsLeft;
  prev.traversalState = player.traversalState;
  prev.cornerK = 0; prev.cornerState = 'idle';
  prev.snap1 = false; prev.snap2 = false;
  onTransformReset();
  for (const k of Object.keys(lastAt)) delete lastAt[k];
  lastFrameMs = gameMs;
}

/* ---------------------------- per frame --------------------------- *
 * Called once per sim frame from src/main.js. The step is the GAME clock
 * scaled by the sim's live hit-stop, so particles, flashes and the crush
 * pulse all hold still inside a freeze with the world — a burst that kept
 * expanding through the hold would undo the beat it belongs to.       */
let lastFrameMs = 0;

export function updateJuice() {
  if (!JUICE_ENABLED || dead) return;
  const raw = Math.max(0, Math.min(50, gameMs - lastFrameMs));
  lastFrameMs = gameMs;
  const dtMs = hitStopRemainingMs() > 0 ? raw * J.hitStop.scale : raw;

  // sustained tremble while a ritual owns the scroll: the body is a machine
  // the size of a continent turning over, and the two snaps above are its
  // punctuation. Fed as a per-second rate against the decay, so it holds a
  // level instead of ramping.
  const c = activeCorner();
  const xf = activeTransformEvent();
  const ritual = (c && (c.state === 'gate' || c.state === 'turning')) ||
    (xf && xf.state === 'turning');
  if (ritual) addTrauma(S.rumbleMax * S.decayPerSec * (dtMs / 1000));

  updateActionImpacts();
  updateDeathSentences();
  updateWardenRupture();
  updateFx(dtMs);

  // crush-edge warning: the pursuing damage plane, intensifying as RIG's
  // margin closes. Read-only — the plane is sim state and stays sim state.
  const edge = sLeftEdge();
  fxCrush(crushWarnIntensity(player.x - player.hw - edge, J.crush), edge, gameMs);
}

/* --------------------------- read surface ------------------------- */
export function juiceSnapshot() {
  const fx = fxStats();
  return {
    enabled: JUICE_ENABLED,
    trauma: JUICE_ENABLED ? +cameraTrauma().toFixed(4) : 0,
    hitStopMs: JUICE_ENABLED ? +hitStopRemainingMs().toFixed(2) : 0,
    actionImpacts: {
      active: actionImpactLive, max: ACTION_IMPACT_MAX,
      cursor: actionImpactCursor, recycles: actionImpactRecycles,
      drawPoolsAdded: 0,
    },
    deathSentences: {
      active: deathSentenceLive, max: DEATH_SENTENCE_MAX,
      cursor: deathSentenceCursor, recycles: deathSentenceRecycles,
      stages: 4, corpseTransformWrites: 0, drawPoolsAdded: 0,
    },
    impactGrammar: { version: ACTION_VFX_V2_HOOKS.version, beats: 4,
      source: 'procedural-pools' },
    bridge: { hostileInstalls: hostileBridgeInstalls },
    wardenRupture: wardenRupture.active ? wardenRupture.stage : -1,
    ...fx,
  };
}

/* ----------------------------- wiring ----------------------------- *
 * Wrappers delegate to the previously-installed hook FIRST, so render
 * behaviour is identical even if a juice handler throws.              */
function after(group, name, fn) {
  const holder = group === null ? view : view[group];
  const tag = `juice:${group === null ? 'view' : group}.${name}`;
  // Async atlas modules can resume after this module evaluated and replace a
  // bridge slot with their finished renderer. Mark our wrapper chain so the
  // composition root can safely reinstall the observer once every import has
  // settled, without stacking the same observer twice when it was retained.
  for (let probe = holder[name]; typeof probe === 'function';
       probe = probe[JUICE_PREVIOUS]) {
    if (probe[JUICE_OBSERVER] === tag) return false;
  }
  const prevImpl = holder[name];
  const wrapped = (a, b, c, d, e, f, g, h, i, j) => {
    prevImpl(a, b, c, d, e, f, g, h, i, j);
    if (dead) return;                    // one failure retires the layer, not the run
    try { fn(a, b, c, d, e, f, g, h, i, j); } catch (error) { warnDead(error); }
  };
  Object.defineProperty(wrapped, JUICE_OBSERVER, { value: tag });
  Object.defineProperty(wrapped, JUICE_PREVIOUS, { value: prevImpl });
  holder[name] = wrapped;
  return true;
}

const JUICE_OBSERVER = Symbol.for('hullbreaker.juiceObserver');
const JUICE_PREVIOUS = Symbol.for('hullbreaker.previousBridge');
let hostileBridgeInstalls = 0;

// Base view owners are installed first by boot/view-init.js. This idempotent
// observer is then layered over the finished hostile presenter exactly once.
export function installJuiceHostileBridge() {
  if (!JUICE_ENABLED) return false;
  let installed = false;
  installed = after('hostiles', 'spawned', onHostileSpawned) || installed;
  installed = after('hostiles', 'sync', onHostileSync) || installed;
  installed = after('hostiles', 'removed', onHostileRemoved) || installed;
  if (installed) hostileBridgeInstalls++;
  return installed;
}

let dead = false;
function warnDead(e) {
  if (!dead) console.warn('HULLBREAKER juice: effects disabled after error', e);
  dead = true;
}

let juiceViewsInstalled = false;
export function initJuiceViewObservers() {
  if (!JUICE_ENABLED || juiceViewsInstalled) return false;
  after('juice', 'hitStop', onHitStop);
  after('player', 'sync', onPlayerSync);
  installJuiceHostileBridge();
  after('capsules', 'removed', onCapsuleRemoved);
  after('bullets', 'slotSpawned', onShotSpawned);
  after('bullets', 'hostileImpact', onBulletHostileImpact);
  after('transform', 'ritual', onTransformRitual);
  after('transform', 'finished', onBoom);
  after('transform', 'reset', onTransformReset);
  after('level', 'faceRevealed', onBoom);
  after(null, 'stateScreen', onStateScreen);
  juiceViewsInstalled = true;
  return true;
}
