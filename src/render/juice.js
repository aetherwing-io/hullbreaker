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
import { scoreNotchNow } from '../sim/score.js';
import { activeCorner } from '../sim/wavegate.js';
import { activeTransformEvent } from '../sim/transform.js';
import { addTrauma, cameraTrauma } from './camera.js';
import {
  fxBurst, fxCrush, fxDirectedBurst, fxFlash, fxHostileColor, fxRing, fxRole,
  fxShotColor, fxStats, resetFx, updateFx,
} from './fx.js';

const J = CONFIG.juice;
const S = J.shake;
const CT = cornerTimeline(CONFIG);
const TT = transformTimeline(CONFIG);

// Presentation multipliers only: simulation fire rate, projectile size and
// point collision stay in CONFIG.weapons. These describe the silhouette of a
// trigger pull at the camera: rifle crack, spread fan, laser corridor, homing
// petals, and flame rake.
const WEAPON_FX = {
  R: { flash: 1.25, fan: 0.75, spread: 0.10, hit: 1.00, ring: 0.00 },
  S: { flash: 1.30, fan: 1.00, spread: 0.72, hit: 1.15, ring: 0.00 },
  L: { flash: 1.65, fan: 0.50, spread: 0.04, hit: 1.75, ring: 1.30 },
  H: { flash: 1.45, fan: 0.50, spread: 0.58, hit: 1.25, ring: 0.85 },
  F: { flash: 1.90, fan: 1.50, spread: 0.46, hit: 1.50, ring: 1.10 },
};

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
// to separate; laser/homing/flame also stamp a small launch ring.
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
  if (W.ring > 0) fxRing(M.ms * 1.8, M.size * W.ring, x, y, color, 0.02);
}

// hostiles: an hp drop is an impact (armour pings do not drop hp, so an
// iris bounce correctly produces no debris); a removal WITH a corpse fade
// is a death — the same two facts src/ui/audio.js keys its hit/kill on.
const hostileHp = new Map();

function onHostileSpawned(e) { hostileHp.set(e.id, e.hp); }

function onHostileSync(e) {
  const hp = hostileHp.get(e.id);
  if (hp !== undefined && e.hp < hp && gate('impact', J.impact.gapMs)) {
    const type = gameMs - recentShotAt <= 650 ? recentShotType : 'R';
    const W = WEAPON_FX[type];
    const weight = Math.min(2.1, W.hit * (1 + Math.max(0, hp - e.hp - 1) * 0.22));
    const color = fxShotColor(type);
    fxBurst(J.impact, e.x, e.y, color, weight);
    if (W.ring > 0) fxRing(120, 0.72 * W.ring, e.x, e.y, color, 0.03);
  }
  hostileHp.set(e.id, e.hp);
}

let deathChain = 0;
let lastDeathAt = -1e9;
let firstBreakDone = false;

function onHostileRemoved(e, fade) {
  hostileHp.delete(e.id);
  if (!fade) return;                     // teardown/cull: no death, no debris
  deathChain = gameMs - lastDeathAt <= 780 ? Math.min(5, deathChain + 1) : 1;
  lastDeathAt = gameMs;
  const chainScale = 1 + (deathChain - 1) * 0.18;
  const enemyColor = fxHostileColor(e.kind);
  const shotColor = fxShotColor(gameMs - recentShotAt <= 700 ? recentShotType : 'R');

  // Two-color punctuation: acid ecology flies apart, then the weapon's own
  // color cuts a clean shock front through it. The center stays readable.
  fxBurst(J.death, e.x, e.y, enemyColor, chainScale);
  fxBurst(J.impact, e.x, e.y, shotColor, 1.15 * chainScale);
  fxFlash(J.death.flashMs, J.death.flashSize * chainScale, e.x, e.y, enemyColor);
  fxRing(J.death.flashMs * 1.7, 1.8 * chainScale, e.x, e.y, shotColor, 0.04);

  // The first machine RIG breaks teaches the reward language loudly: an
  // upward shrapnel fan and two expanding fronts. It happens naturally in
  // the opening fight, costs no rule/state change, and gives the first minute
  // one authored "whoa" beat instead of waiting for a late-game weapon drop.
  if (!firstBreakDone) {
    firstBreakDone = true;
    fxDirectedBurst(J.death, e.x, e.y, shotColor, 0, 1, 1.9, 1.8);
    fxBurst(J.death, e.x, e.y, enemyColor, 1.65);
    fxFlash(210, 1.55, e.x, e.y, shotColor, 0.04);
    fxRing(360, 3.15, e.x, e.y, shotColor, 0.05);
    fxRing(520, 4.45, e.x, e.y, enemyColor, 0.02);
    addTrauma(S.boom * 0.8);
  }

  // Three fast kills earn the one larger beat. It is capped to a 3.8-tile
  // ring and a 600ms gate: spectacular in a crowd, never a screen-white spam.
  if (deathChain >= 3 && gate('chainBlast', 600)) {
    const payoff = Math.min(3.8, 3.1 + (deathChain - 3) * 0.35);
    fxBurst(J.death, e.x, e.y, shotColor, 1.85);
    fxFlash(180, 1.75, e.x, e.y, shotColor, 0.06);
    fxRing(310, payoff, e.x, e.y, enemyColor, 0.05);
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
    // fxRing's unit torus has radius 0.5; diameter 2r draws the true damage
    // radius before the second, looser echo expands beyond it and disappears.
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
    ...fx,
  };
}

/* ----------------------------- wiring ----------------------------- *
 * Wrappers delegate to the previously-installed hook FIRST, so render
 * behaviour is identical even if a juice handler throws.              */
function after(group, name, fn) {
  const holder = group === null ? view : view[group];
  const prevImpl = holder[name];
  holder[name] = (a, b, c) => {
    prevImpl(a, b, c);
    if (dead) return;                    // one failure retires the layer, not the run
    try { fn(a, b, c); } catch (e) { warnDead(e); }
  };
}

let dead = false;
function warnDead(e) {
  if (!dead) console.warn('HULLBREAKER juice: effects disabled after error', e);
  dead = true;
}

if (JUICE_ENABLED) {
  after('juice', 'hitStop', onHitStop);
  after('player', 'sync', onPlayerSync);
  after('hostiles', 'spawned', onHostileSpawned);
  after('hostiles', 'sync', onHostileSync);
  after('hostiles', 'removed', onHostileRemoved);
  after('capsules', 'removed', onCapsuleRemoved);
  after('bullets', 'slotSpawned', onShotSpawned);
  after('transform', 'ritual', onTransformRitual);
  after('transform', 'finished', onBoom);
  after('transform', 'reset', onTransformReset);
  after('level', 'faceRevealed', onBoom);
  after(null, 'stateScreen', onStateScreen);
}
