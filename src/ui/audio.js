/* ============================ AUDIO =============================== */
/* WebAudio synth layer — T-012. Procedural SFX (hit, hurt, jump, launch,
   pickup, warning, ritual snaps, per-weapon fire) plus a wave-layered
   mechanical ambience that gains a layer per revealed face / committed
   band (DESIGN: "music and mechanical ambience gain layers at each
   break"). No audio files, no dependencies, no sim writes.

   Boundary contract: this module is ui-layer. It observes the sim ONLY
   by wrapping the existing src/sim/bridge.js view hooks (each wrapper
   calls the previously-installed render/ui implementation first, then
   the audio handler) and by reading exported sim state the way
   src/ui/overlay.js already does. It never writes sim state, never
   installs a hook the render layer needs replaced, and src/sim/* does
   not know it exists — statically asserted in tools/pathcheck.mjs.

   Load order matters: src/main.js imports this module LAST, after every
   render/ui module has installed its half of the bridge, so the wrappers
   here capture the final hook implementations.

   Autoplay policy: no AudioContext exists until the first user gesture
   (keydown / pointerdown). Sounds requested before that are simply
   skipped — never queued, never erroring. ?audio=0 disables the module
   entirely (no wrappers, no listeners, no context: a muted boot is
   byte-identical to the pre-audio game).

   The zipper columns (view.level.zipperColumn) are deliberately silent:
   decisions.md entry 3 rules the brick-slam assembly out as the
   creature's own reveal, and giving it a sound would emphasize exactly
   the choreography that ruling retires. Assembly sounds return when
   assembly does — on ship-built traps and emplacements.

   Tuning constants live below rather than in src/config.js only because
   the in-flight T-004 lane owns config.js; folding AUDIO into CONFIG is
   a recorded follow-up for the integrator. */

import { CONFIG } from '../config.js';
import { QUERY } from '../mode.js';
import { cornerTimeline } from '../pure/waves.js';
import { transformTimeline } from '../pure/transform.js';
import { view } from '../sim/bridge.js';
import { gameMs } from '../sim/time.js';
import { player, circleHitsPlayer } from '../sim/player.js';
import { activeCorner, cornerEvents } from '../sim/wavegate.js';
import { transformEvents } from '../sim/transform.js';

const AUDIO_ON = QUERY.get('audio') !== '0';

/* ------------------------------ tuning ---------------------------- */
const A = {
  master: 0.9,
  sfx: 0.8,
  ambience: 0.32,          // ambience bus, well under the SFX
  ambRampInSec: 1.6,       // a new layer swells in, never pops in
  ambRampOutSec: 0.5,
  duck: { retry: 0.45, over: 0.15, victory: 0.55 },
  maxVoices: 14,           // concurrent one-shots; extras are dropped
  fireGapMs: 60,           // one volley = one sound (spread fires 5 slots)
  hitGapMs: 45,
  warnGapMs: 350,          // lanceTelegraph fires every frame; beep at this cadence
  tellGapMs: 260,
  jumpVyMin: 4,            // vy threshold that separates jumps/launches from
                           // drop-throughs; hurt knockback frames are excluded
                           // explicitly, not by this threshold
};

/* -------------------------- context state ------------------------- */
let ctx = null;            // AudioContext, created on first user gesture
let master = null, sfxBus = null, ambBus = null;
let noiseBuf = null;
let layers = [];           // ambience layers: [{ level }]
let voices = 0;
let dead = false;          // one audio error mutes the layer for the session
let paused = false;
let ambDuck = 1;
const lastAt = {};         // throttle clocks, ms in audio time

// tiny local LCG so even the presentation layer stays reproducible-ish;
// ui may use Math.random, but a seeded source costs nothing
let rngState = 0x9e3779b9;
function rnd() {
  rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0;
  return rngState / 4294967296;
}

function warnDead(e) {
  if (!dead) console.warn('HULLBREAKER audio: muted after error', e);
  dead = true;
}

function nowMs() { return ctx ? ctx.currentTime * 1000 : 0; }

function gate(key, ms) {
  const t = nowMs();
  if (t - (lastAt[key] || -1e9) < ms) return false;
  lastAt[key] = t;
  return true;
}

/* --------------------------- primitives --------------------------- */
function envGain(t0, attack, peak, dur) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  return g;
}

function voiceDone() { voices = Math.max(0, voices - 1); }

// one-shot oscillator: type, f0 → f1 over dur seconds, at optional delay
function tone(type, f0, f1, dur, peak, at = 0) {
  if (!ctx || dead || voices >= A.maxVoices) return;
  voices++;
  const t0 = ctx.currentTime + at;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
  const g = envGain(t0, 0.005, peak, dur);
  o.connect(g).connect(sfxBus);
  o.onended = voiceDone;
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

// one-shot filtered noise burst; f1 sweeps the filter when it differs from f0
function noiseHit(kind, f0, f1, q, dur, peak, at = 0) {
  if (!ctx || dead || voices >= A.maxVoices) return;
  voices++;
  const t0 = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  src.playbackRate.value = 0.9 + rnd() * 0.2;
  const f = ctx.createBiquadFilter();
  f.type = kind;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  const g = envGain(t0, 0.004, peak, dur);
  src.connect(f).connect(g).connect(sfxBus);
  src.onended = voiceDone;
  src.start(t0, rnd());
  src.stop(t0 + dur + 0.05);
}

/* ------------------------------ SFX ------------------------------- *
 * Each recipe is a comment-documented intent so a listener can verify
 * the mix against what the synth was told to sound like.              */

// per-weapon fire — one sound per volley (slotSpawned fires per projectile)
const FIRE = {
  R: () => tone('square', 950, 700, 0.07, 0.14),                    // dry rifle blip
  S: () => {                                                        // chunky shotgun bark
    tone('sawtooth', 420, 240, 0.12, 0.15);
    noiseHit('lowpass', 900, 500, 1, 0.09, 0.12);
  },
  L: () => {                                                        // descending zap
    tone('sine', 1500, 240, 0.16, 0.13);
    tone('sine', 2200, 2200, 0.05, 0.05);
  },
  H: () => tone('triangle', 480, 980, 0.11, 0.11),                  // seeking chirp up
  F: () => noiseHit('lowpass', 650, 320, 1, 0.22, 0.15),            // breathy whoosh
};

function sfxHit() {                          // bullet lands: bright tick + thunk
  noiseHit('bandpass', 1900, 1900, 4, 0.07, 0.18);
  tone('square', 210, 140, 0.07, 0.1);
}
function sfxKill() {                         // hostile dies: deeper mechanical crump
  tone('square', 130, 55, 0.18, 0.22);
  noiseHit('lowpass', 520, 240, 1, 0.16, 0.18);
}
function sfxHurt() {                         // RIG damaged: harsh descending buzz
  tone('sawtooth', 320, 80, 0.28, 0.26);
  noiseHit('bandpass', 700, 350, 2, 0.2, 0.16);
}
function sfxFall() {                         // route lost to a fall: longer, hollower
  tone('sawtooth', 240, 50, 0.4, 0.22);
}
function sfxJump() { tone('sine', 240, 480, 0.1, 0.11); }           // soft rising blip
function sfxAirJump() { tone('sine', 300, 640, 0.1, 0.11); }        // same shape, higher
function sfxLaunch() {                       // ledge/wall launch: bigger sweep + air
  tone('sine', 180, 720, 0.16, 0.14);
  noiseHit('bandpass', 1200, 2200, 2, 0.12, 0.07);
}
function sfxPickup(kind) {
  if (kind === 'mod') {                      // gold modifier: three-note rise
    tone('square', 550, 550, 0.07, 0.12);
    tone('square', 825, 825, 0.07, 0.12, 0.08);
    tone('square', 1100, 1100, 0.1, 0.12, 0.16);
  } else {                                   // weapon letter: two-note chime
    tone('square', 660, 660, 0.06, 0.13);
    tone('square', 990, 990, 0.09, 0.13, 0.07);
  }
}
function sfxWarn(low) {                      // alarm two-tone; `low` = heavier threat
  const a = low ? 523 : 880, b = low ? 392 : 620;
  tone('square', a, a, 0.09, 0.1);
  tone('square', b, b, 0.09, 0.1, 0.1);
}
function sfxTell() {                         // houndframe plants: low growl
  noiseHit('bandpass', 300, 180, 2, 0.12, 0.13);
}
function sfxCharge() {                       // houndframe commits: aggressive scrape
  noiseHit('bandpass', 500, 900, 1.5, 0.16, 0.12);
  tone('sawtooth', 90, 130, 0.16, 0.08);
}
function sfxWindup() {                       // ritual wind-up: air pulls back
  noiseHit('bandpass', 400, 1600, 1.5, 0.35, 0.11);
  tone('sine', 60, 120, 0.3, 0.09);
}
function sfxSnap(second) {                   // yaw snap lands: monumental clunk
  const f = second ? 65 : 75;
  tone('sine', f, f * 0.55, 0.22, second ? 0.5 : 0.42);             // seismic thump
  noiseHit('bandpass', 2600, 2600, 6, 0.05, 0.16);                  // metal ring
  tone('square', 150, 90, 0.08, 0.16);                              // latch body
}
function sfxBoom() {                         // face/band commits: deep settle boom
  tone('sine', 50, 30, 0.8, 0.4);
  noiseHit('lowpass', 200, 90, 1, 0.6, 0.2);
}
function sfxResume() {                       // scroll eases back in: soft hiss
  noiseHit('lowpass', 800, 400, 1, 0.4, 0.05);
}
function motif(notes, step, dur, peak) {
  notes.forEach((f, i) => tone('triangle', f, f, dur, peak, i * step));
}

/* --------------------------- ambience ------------------------------ *
 * One always-on machine bed plus up to six face layers. Every layer is
 * its own frequency band with its own slow LFO ("wave-layered": each
 * swells and recedes on its own period), so a new face is audible as a
 * new band entering the mix, not as "slightly louder".                */
const LAYER_RECIPES = [
  { kind: 'noise', filter: ['lowpass', 110, 1], base: 0.5,  lfo: [0.11, 0.25] },  // hull rumble
  { kind: 'osc', voicesDef: [['sine', 55], ['sine', 55.6]], base: 0.3,  lfo: [0.07, 0.12] },  // deep beating drone
  { kind: 'osc', voicesDef: [['sawtooth', 82]], filter: ['lowpass', 240, 1], base: 0.24, lfo: [0.5, 0.2] },   // engine chug
  { kind: 'osc', voicesDef: [['triangle', 164.8], ['sine', 220]], base: 0.16, lfo: [0.19, 0.08] },            // interior hum
  { kind: 'noise', filter: ['bandpass', 1400, 2], base: 0.11, lfo: [0.27, 0.07] },                            // vent hiss
  { kind: 'osc', voicesDef: [['sine', 660], ['sine', 663]], base: 0.06, lfo: [0.37, 0.035] },                 // machinery whine
  { kind: 'osc', voicesDef: [['square', 110]], filter: ['bandpass', 440, 3], base: 0.08, lfo: [0.9, 0.06] },  // alert-adjacent throb
];

function buildLayer(r) {
  const wave = ctx.createGain();             // LFO-modulated "wave" of the layer
  wave.gain.value = r.base;
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = r.lfo[0];
  const depth = ctx.createGain();
  depth.gain.value = r.lfo[1];
  lfo.connect(depth).connect(wave.gain);
  lfo.start();

  let head = wave;
  if (r.filter) {
    const f = ctx.createBiquadFilter();
    f.type = r.filter[0];
    f.frequency.value = r.filter[1];
    f.Q.value = r.filter[2];
    f.connect(wave);
    head = f;
  }
  if (r.kind === 'noise') {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    src.connect(head);
    src.start(0, rnd());
  } else {
    for (const [type, freq] of r.voicesDef) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.connect(head);
      o.start();
    }
  }
  const level = ctx.createGain();            // ramped 0/1: is this layer in the mix
  level.gain.value = 0;
  wave.connect(level).connect(ambBus);
  return { level };
}

// base bed + one layer per finished corner / committed transform band.
// Fixtures never advance cornerEvents, so a slice sits on the base bed
// until its own transform rituals commit.
function layerTarget() {
  let n = 1;
  for (const c of cornerEvents) if (c.state === 'done') n++;
  for (const ev of transformEvents) if (ev.state === 'done') n++;
  return Math.min(n, LAYER_RECIPES.length);
}

function applyLayers() {
  if (!ctx || dead) return;
  const n = layerTarget();
  const t = ctx.currentTime;
  layers.forEach((L, i) => {
    const target = i < n ? 1 : 0;
    L.level.gain.cancelScheduledValues(t);
    L.level.gain.setValueAtTime(L.level.gain.value, t);
    L.level.gain.linearRampToValueAtTime(
      target, t + (target ? A.ambRampInSec : A.ambRampOutSec));
  });
}

function duckAmbience(mult) {
  ambDuck = mult;
  if (!ctx || dead) return;
  const t = ctx.currentTime;
  ambBus.gain.cancelScheduledValues(t);
  ambBus.gain.setValueAtTime(ambBus.gain.value, t);
  ambBus.gain.linearRampToValueAtTime(A.ambience * mult, t + 0.4);
}

/* ------------------------- context lifecycle ----------------------- */
function buildContext() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { dead = true; return; }
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = A.master;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = A.sfx;
  sfxBus.connect(master);
  ambBus = ctx.createGain();
  ambBus.gain.value = A.ambience * ambDuck;
  ambBus.connect(master);

  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);   // 1s seeded noise
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = rnd() * 2 - 1;

  layers = LAYER_RECIPES.map(buildLayer);
  applyLayers();
}

function unlock() {
  if (dead) return;
  try {
    if (!ctx) buildContext();
    if (ctx && ctx.state === 'suspended' && !paused && !document.hidden)
      ctx.resume().catch(() => {});
  } catch (e) { warnDead(e); }
}

/* ------------------------ sim-edge detection ------------------------ *
 * Everything below derives audio events from bridge hooks. Wrappers call
 * the previously-installed implementation FIRST, so render behavior is
 * untouched even if an audio handler throws (which also mutes audio).  */
function after(group, name, fn) {
  const holder = group === null ? view : view[group];
  const prev = holder[name];
  holder[name] = (a, b, c) => {
    prev(a, b, c);
    if (dead || !ctx) {
      // state screens still steer lifecycle before/without a context
      if (fn === onStateScreen) { try { fn(a); } catch (e) { warnDead(e); } }
      return;
    }
    try { fn(a, b, c); } catch (e) { warnDead(e); }
  };
}

const CT = cornerTimeline(CONFIG);
const TT = transformTimeline(CONFIG);

// per-frame player edge detection (view.player.sync fires once per sim frame)
const prev = {
  grounded: true, vy: 0, hp: player.hp, airJumpsLeft: player.airJumpsLeft,
  traversalState: 'free', iframesUntil: 0,
  cornerK: 0, cornerState: 'idle', snap1: false, snap2: false,
};

function onPlayerSync() {
  const hurt = player.hp < prev.hp;
  if (hurt && gate('hurt', 120)) sfxHurt();

  if (!hurt && player.iframesUntil <= prev.iframesUntil) {
    // jump family — suppressed on hurt/knockback and fallback-iframe frames
    const launched = (prev.traversalState === 'ledge' || prev.traversalState === 'wall') &&
      player.traversalState === 'free' && player.vy > A.jumpVyMin;
    if (launched) sfxLaunch();
    else if (prev.grounded && !player.grounded && player.vy > A.jumpVyMin) sfxJump();
    else if (player.airJumpsLeft < prev.airJumpsLeft && !player.grounded) sfxAirJump();
  }

  // corner ritual (six-face run): warning at the gate, wind-up on the kill,
  // one clunk per yaw snap at the pure timeline's impact frames
  const c = activeCorner();
  if (c) {
    if (c.k !== prev.cornerK || c.state !== prev.cornerState) {
      if (c.state === 'gate') sfxWarn(true);
      if (c.state === 'turning') { sfxWindup(); prev.snap1 = false; prev.snap2 = false; }
      prev.cornerK = c.k;
      prev.cornerState = c.state;
    }
    if (c.state === 'turning') {
      const t = gameMs - c.tStart;
      if (!prev.snap1 && t >= CT.t2) { prev.snap1 = true; sfxSnap(false); }
      if (!prev.snap2 && t >= CT.t4) { prev.snap2 = true; sfxSnap(true); }
    }
  }

  prev.grounded = player.grounded;
  prev.vy = player.vy;
  prev.hp = player.hp;
  prev.airJumpsLeft = player.airJumpsLeft;
  prev.traversalState = player.traversalState;
  prev.iframesUntil = player.iframesUntil;
}

// hostiles: hp drops = hits; removal with a corpse fade = a kill;
// houndframe state transitions give the tell/charge warnings
const hostileHp = new Map();
const hostileState = new Map();

function onHostileSpawned(e) {
  hostileHp.set(e.id, e.hp);
  hostileState.set(e.id, e.state);
}
function onHostileSync(e) {
  const hp = hostileHp.get(e.id);
  if (hp !== undefined && e.hp < hp && gate('hit', A.hitGapMs)) sfxHit();
  hostileHp.set(e.id, e.hp);
  if (e.kind === 'hound') {
    const s = hostileState.get(e.id);
    if (s !== e.state) {
      if (e.state === 'tell' && gate('tell', A.tellGapMs)) sfxTell();
      else if (e.state === 'charge' && gate('charge', A.tellGapMs)) sfxCharge();
      hostileState.set(e.id, e.state);
    }
  }
}
function onHostileRemoved(e, fade) {
  hostileHp.delete(e.id);
  hostileState.delete(e.id);
  if (fade && gate('kill', A.hitGapMs)) sfxKill();
}

// capsules: removal is pickup only when the capsule actually overlaps RIG
// (resetGame teardown and off-screen despawns don't)
function onCapsuleRemoved(c) {
  if (circleHitsPlayer(c.x, c.y, CONFIG.capsules.pickupRadius) && gate('pickup', 80))
    sfxPickup(c.kind);
}

// transform rituals mirror the corner: armed → warning, started → wind-up,
// per-frame ritual t crossing the pure snap frames, finished → boom + layer
const xfSnap = new Map();                    // ev.index → [snap1Fired, snap2Fired]

function onTransformArmed() { sfxWarn(true); }
function onTransformStarted(ev) { xfSnap.set(ev.index, [false, false]); sfxWindup(); }
function onTransformRitual(ev, t) {
  const s = xfSnap.get(ev.index) || [false, false];
  if (!s[0] && t >= TT.t2) { s[0] = true; sfxSnap(false); }
  if (!s[1] && t >= TT.t4) { s[1] = true; sfxSnap(true); }
  xfSnap.set(ev.index, s);
}
function onTransformFinished() { sfxBoom(); applyLayers(); }
function onTransformReset() { xfSnap.clear(); applyLayers(); }

function onCornerFinished() { sfxResume(); }
function onFaceRevealed() { sfxBoom(); applyLayers(); }

function onLanceTelegraph() { if (gate('warn', A.warnGapMs)) sfxWarn(false); }

function onStateScreen(next) {
  paused = next === 'PAUSED';
  if (!ctx || dead) return;
  if (next === 'PAUSED') { ctx.suspend().catch(() => {}); return; }
  if (ctx.state === 'suspended' && !document.hidden) ctx.resume().catch(() => {});
  if (next === 'PLAYING') {
    // a restart rewound corner/transform state; resync layers and the
    // per-frame caches so stale deltas can't fire ghost sounds
    duckAmbience(1);
    applyLayers();
    hostileHp.clear();
    hostileState.clear();
    xfSnap.clear();
    prev.hp = player.hp;
    prev.airJumpsLeft = player.airJumpsLeft;
    prev.grounded = true;
    prev.traversalState = 'free';
    prev.iframesUntil = player.iframesUntil;
    prev.cornerK = 0;
    prev.cornerState = 'idle';
  } else if (next === 'SLICE_RETRY') {
    duckAmbience(A.duck.retry);
    if (gate('hurt', 120)) sfxFall();        // shared throttle: no double with a damage death
  } else if (next === 'GAME_OVER') {
    duckAmbience(A.duck.over);
    motif([392, 311, 233, 155], 0.16, 0.22, 0.14);
  } else if (next === 'VICTORY') {
    duckAmbience(A.duck.victory);
    motif([523, 659, 784, 1047], 0.12, 0.18, 0.14);
  }
}

/* ------------------------------ wiring ----------------------------- */
if (AUDIO_ON) {
  after('player', 'sync', onPlayerSync);
  after('hostiles', 'spawned', onHostileSpawned);
  after('hostiles', 'sync', onHostileSync);
  after('hostiles', 'removed', onHostileRemoved);
  after('capsules', 'removed', onCapsuleRemoved);
  after('bullets', 'slotSpawned', (i, type) => {
    if (FIRE[type] && gate('fire:' + type, A.fireGapMs)) FIRE[type]();
  });
  after('mods', 'lanceTelegraph', onLanceTelegraph);
  after('corner', 'finished', onCornerFinished);
  after('level', 'faceRevealed', onFaceRevealed);
  after('transform', 'armed', onTransformArmed);
  after('transform', 'started', onTransformStarted);
  after('transform', 'ritual', onTransformRitual);
  after('transform', 'finished', onTransformFinished);
  after('transform', 'reset', onTransformReset);
  after(null, 'stateScreen', onStateScreen);

  addEventListener('keydown', unlock);
  addEventListener('pointerdown', unlock);
  document.addEventListener('visibilitychange', () => {
    if (!ctx || dead) return;
    if (document.hidden) ctx.suspend().catch(() => {});
    else if (!paused) ctx.resume().catch(() => {});
  });
}

// read-only debug surface (browser console); nothing imports this
export function audioSnapshot() {
  return {
    enabled: AUDIO_ON,
    unlocked: !!ctx,
    contextState: ctx ? ctx.state : 'none',
    dead,
    layers: ctx ? layerTarget() : 0,
    voices,
  };
}
