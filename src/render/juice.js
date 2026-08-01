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
import { activeCorner } from '../sim/wavegate.js';
import { activeTransformEvent } from '../sim/transform.js';
import { addTrauma, cameraTrauma } from './camera.js';
import { fxBurst, fxCrush, fxFlash, fxRole, fxStats, resetFx, updateFx } from './fx.js';

const J = CONFIG.juice;
const S = J.shake;
const CT = cornerTimeline(CONFIG);
const TT = transformTimeline(CONFIG);

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

// muzzle flash: one per volley, at the firing line along the aim
function onShotSpawned() {
  if (!gate('muzzle', J.muzzle.volleyGapMs)) return;
  const M = J.muzzle;
  const ax = player.aim.x, ay = player.aim.y;
  fxFlash(M.ms, M.size,
    player.x + ax * M.offsetTiles,
    player.y + player.muzzleY + ay * M.offsetTiles,
    fxRole('muzzle'));
}

// hostiles: an hp drop is an impact (armour pings do not drop hp, so an
// iris bounce correctly produces no debris); a removal WITH a corpse fade
// is a death — the same two facts src/ui/audio.js keys its hit/kill on.
const hostileHp = new Map();

function onHostileSpawned(e) { hostileHp.set(e.id, e.hp); }

function onHostileSync(e) {
  const hp = hostileHp.get(e.id);
  if (hp !== undefined && e.hp < hp && gate('impact', J.impact.gapMs))
    fxBurst(J.impact, e.x, e.y, fxRole('muzzle'));
  hostileHp.set(e.id, e.hp);
}

function onHostileRemoved(e, fade) {
  hostileHp.delete(e.id);
  if (!fade) return;                     // teardown/cull: no death, no debris
  fxBurst(J.death, e.x, e.y, fxRole('enemyGlow'));
  fxFlash(J.death.flashMs, J.death.flashSize, e.x, e.y, fxRole('enemyGlow'));
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
  fxBurst(J.pickup, c.x, c.y, color);
  fxFlash(J.pickup.flashMs, J.pickup.flashSize, c.x, c.y, color);
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

function onBoom() { addTrauma(S.boom); }

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
  prev.hp = player.hp;
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
