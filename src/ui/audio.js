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
   the in-flight T-004 lane owns config.js; folding AUDIO into CONFIG once
   that lane lands is suggested to the integrator in the T-012 builder
   report (reports/tasks/T-012/report.md) — it is not yet a SPRINT task.

   T-042 (audio punch) additions, same file, same contract: more low-end and
   a two-part crunch/tick signature on the highest-frequency impacts (a
   bullet landing, a kill — the hit tick also scales a little with damage
   dealt, pairing with T-041's velocity-driven impact stretch: a bigger hit
   reads bigger on screen AND in the mix, decisions.md entry 15), a
   dedicated destruction voice for the orbital lance's screen-clear (the one
   break the throttled hit/kill sounds were flattening into a single tick),
   an audible pressure curve for the pursuing crush edge (a low rumble plus
   an accelerating ping sharing the SAME warnPulse()/crushWarnIntensity()
   pure functions the visual haze uses, src/pure/juice.js — the two effects
   can never read differently for the same margin), and two readability
   mechanisms for pillar 5 ("chaos stays readable"): every ordinary one-shot's
   peak gain shrinks a little per voice already sounding (loadScale()) so a
   crowd of hits sums toward "louder, still readable" instead of clipped
   mush, while `prio` cues (hurt, fall, ritual snaps/booms, the lance strike,
   the crush ping) always cut through; and the ambience bed gets a second,
   combat-density-driven duck (`heat`/`combatDuck`) on top of the existing
   state-driven one.

   The pressure curve needed one new sanctioned sim read (`sLeftEdge` from
   src/sim/edges.js — the live crush margin isn't derivable from anything
   else on the existing allowlist; `sliceStats.minEdgeMargin` is a running
   MIN for the whole life, which would pin the alarm near-max forever after
   one close call). Team lead authorized extending tools/pathcheck.mjs's
   T-012 sim-read allowlist directly for this (task #50) rather than leaving
   the feature undone — see reports/tasks/T-042/build.md for the exchange. */

import { CONFIG } from '../config.js';
import { QUERY } from '../mode.js';
import { cornerTimeline } from '../pure/waves.js';
import { transformTimeline } from '../pure/transform.js';
import { crushWarnIntensity, warnPulse } from '../pure/juice.js';
import { view } from '../sim/bridge.js';
import { gameMs } from '../sim/time.js';
import { player, circleHitsPlayer } from '../sim/player.js';
import { activeCorner, cornerEvents } from '../sim/wavegate.js';
import { transformEvents } from '../sim/transform.js';
import { sLeftEdge } from '../sim/edges.js';

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

  // --- readability under load (pillar 5: chaos stays readable) ---------
  // Every ordinary one-shot's peak gain shrinks a little per voice already
  // sounding, so a crowd of simultaneous hits sums toward "louder, still
  // readable" instead of stacking toward clipped mush. `prio` callers (hurt,
  // fall, the ritual snaps/booms, the lance strike) opt out: those cues are
  // rare and must always cut through regardless of how busy the fight is.
  loadDuck: 0.055,
  // A second, slower-moving duck on the ambience BED itself: recent combat
  // events ("heat") push the machine hum down so weapon/impact sound has
  // room, then it eases back during a lull. Composes with the existing
  // state-driven ambDuck (retry/over/victory) rather than replacing it.
  heatDecayPerSec: 1.0,
  heatDuck: 0.5,
  heatTickMs: 140,
  heat: { hit: 0.12, kill: 0.2, fire: 0.05, lance: 0.75 },

  // --- pursuing-edge pressure curve --------------------------------------
  // A low rumble under the ambience bed and an accelerating ping, both
  // driven by the SAME pure functions (crushWarnIntensity/warnPulse,
  // src/pure/juice.js) that drive the visual crush-warning haze, off the
  // same live margin — so the ear and the eye can never disagree about how
  // close the plane is.
  pressure: 0.3,           // rumble bed's max gain multiplier at intensity 1
  pressureHz: 42,          // low, felt more than heard, under the ambience bed
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
  // `?? ` not `||`: a key's first-ever fire can land at t===0 (the instant
  // unlock() builds the context, or — found by T-042's behavioral pathcheck
  // harness driving a frozen fake clock — any test that never advances
  // ctx.currentTime), and 0 is a legitimate previous timestamp, not "never
  // fired". `||` would treat it as falsy and let the very next call refire
  // immediately, defeating the throttle for exactly one key on exactly one
  // frame in real play — rare, but a throttle that can silently drop its
  // own gate is worse than the extra character.
  if (t - (lastAt[key] ?? -1e9) < ms) return false;
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

// Headroom shrinks as the voice budget fills: 0 live voices scales peak by
// 1.0, and it eases toward 1/(1+maxVoices*loadDuck) at a full house — never
// all the way to silence, so a wall of hits still reads as "a wall of hits."
function loadScale() { return 1 / (1 + voices * A.loadDuck); }

// one-shot oscillator: type, f0 → f1 over dur seconds, at optional delay.
// `prio` (hurt, fall, ritual snaps/booms, the lance strike) skips the load
// scaling above — those cues must cut through no matter how busy the mix is.
function tone(type, f0, f1, dur, peak, at = 0, prio = false) {
  if (!ctx || dead || voices >= A.maxVoices) return;
  voices++;
  const t0 = ctx.currentTime + at;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
  const g = envGain(t0, 0.005, prio ? peak : peak * loadScale(), dur);
  o.connect(g).connect(sfxBus);
  o.onended = voiceDone;
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

// A gentler oscillator envelope for the Crown's choir-like transmission
// stack. It shares the same voice cap, SFX bus and compressor as every other
// cue; only the attack differs, so a harmonic pad blooms instead of clicking.
function padTone(type, f0, f1, dur, peak, at = 0, attack = 0.16) {
  if (!ctx || dead || voices >= A.maxVoices) return;
  voices++;
  const t0 = ctx.currentTime + at;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
  const g = envGain(t0, attack, peak, dur);
  o.connect(g).connect(sfxBus);
  o.onended = voiceDone;
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

// one-shot filtered noise burst; f1 sweeps the filter when it differs from f0
function noiseHit(kind, f0, f1, q, dur, peak, at = 0, prio = false) {
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
  const g = envGain(t0, 0.004, prio ? peak : peak * loadScale(), dur);
  src.connect(f).connect(g).connect(sfxBus);
  src.onended = voiceDone;
  src.start(t0, rnd());
  src.stop(t0 + dur + 0.05);
}

/* ------------------------------ SFX ------------------------------- *
 * Each recipe is a comment-documented intent so a listener can verify
 * the mix against what the synth was told to sound like.              */

// per-weapon fire — one sound per volley (slotSpawned fires per projectile).
// Each recipe now carries a little more of its own physical signature (a
// rifle cracks, a shotgun thumps, flame crackles) on top of the shape T-012
// tuned, so five weapons in a row read as five different guns, not one
// oscillator in five colors.
const FIRE = {
  R: () => {                                                        // light snappy bark: the
    tone('square', 1100, 520, 0.07, 0.16);                          // workhorse — quick and
    noiseHit('highpass', 4200, 2800, 2, 0.03, 0.07);                // small so rapid-fire never
  },                                                                 // drowns the other four
  S: () => {                                                        // chunky shotgun bark + sub thump
    tone('sawtooth', 480, 190, 0.14, 0.2);
    noiseHit('lowpass', 1100, 380, 1, 0.11, 0.17);
    tone('sine', 120, 48, 0.12, 0.16);
  },
  L: () => {                                                        // descending zap
    tone('sawtooth', 1900, 210, 0.2, 0.17);
    tone('sine', 2800, 1200, 0.08, 0.08);
  },
  H: () => {                                                        // twin seeking chirps arc upward
    tone('triangle', 440, 1120, 0.13, 0.13);
    tone('sine', 880, 1760, 0.08, 0.06, 0.045);
  },
  F: () => {                                                        // breathy whoosh + crackle
    noiseHit('lowpass', 760, 240, 1, 0.25, 0.19);
    noiseHit('bandpass', 2600, 1200, 3, 0.07, 0.08);
    tone('sine', 86, 42, 0.18, 0.1);
  },
};

// bullet lands: bright tick + a felt sub click — the single most frequent
// sound in the game, so its weight matters most. `dmg` (the hp actually
// lost, e.g. 2 for LASER vs 1 for everything else, CONFIG.weapons.*.damage)
// nudges pitch down and gain up a little: the same pairing T-041 drew
// between a hit's OWN velocity and how far its spark streaks (decisions.md
// entry 15) — a harder hit reads a little bigger here too, not just there.
function sfxHit(dmg = 1) {
  const w = Math.min(2, Math.max(1, dmg));
  noiseHit('bandpass', 1900, 1900, 4, 0.07, 0.18 * (0.9 + 0.1 * w));
  tone('square', 210 / w, 140 / w, 0.07, 0.1 * w);
  tone('sine', 90 / w, 46 / w, 0.045, 0.09 * w);
}
function sfxKill(kind, mutated = false) {
  // Three bounded voices per role, shaped like the construction that is
  // visibly failing. Crowd throttling remains at the caller, so variety does
  // not increase simultaneous voice count versus the old universal crunch.
  if (kind === 'wasp') {
    noiseHit('highpass', 4300, 1700, 3.2, 0.09, 0.16);
    tone('triangle', mutated ? 760 : 610, 92, 0.22, 0.18);
    noiseHit('bandpass', 820, 240, 1.5, 0.16, 0.13);
  } else if (kind === 'hound') {
    noiseHit('bandpass', 980, 210, 1.8, 0.20, 0.23);
    tone('square', mutated ? 132 : 112, 38, 0.24, 0.24);
    noiseHit('lowpass', 420, 120, 1.0, 0.25, 0.19);
  } else if (kind === 'polyp') {
    noiseHit('bandpass', 1450, 190, 1.3, 0.26, 0.19);
    tone('sine', mutated ? 226 : 184, 34, 0.24, 0.20);
    noiseHit('lowpass', 540, 100, 0.8, 0.20, 0.15);
  } else if (kind === 'mortar') {
    noiseHit('lowpass', 1040, 130, 1.1, 0.24, 0.22);
    tone('sine', mutated ? 104 : 86, 29, 0.28, 0.24);
    noiseHit('bandpass', 2600, 760, 4.0, 0.08, 0.12, 0.025);
  } else if (kind === 'carrier') {
    noiseHit('bandpass', 2400, 360, 1.4, 0.27, 0.21);
    tone('sine', mutated ? 124 : 102, 25, 0.34, 0.27);
    tone('square', 285, 58, 0.19, 0.14, 0.025);
  } else {
    noiseHit('highpass', 3800, 2100, 3, 0.045, 0.17);
    tone('square', 145, 46, 0.23, 0.3);
    noiseHit('lowpass', 620, 160, 1, 0.22, 0.25);
  }
}
function sfxChainBreak(chain) {              // third rapid kill: the hull answers with one
  const lift = 1 + Math.min(2, chain - 3) * 0.12;                    // bounded celebratory blast
  tone('sine', 82 * lift, 28, 0.38, 0.34);
  noiseHit('bandpass', 2800, 480, 1.4, 0.2, 0.2);
  tone('square', 220 * lift, 70, 0.16, 0.14, 0.025);
}
function sfxHurt() {                         // RIG damaged: harsh descending buzz + gut-punch sub —
  tone('sawtooth', 320, 80, 0.28, 0.26, 0, true);                   // the highest-stakes cue in
  noiseHit('bandpass', 700, 350, 2, 0.2, 0.16, 0, true);            // the game always cuts
  tone('sine', 150, 40, 0.22, 0.24, 0, true);                       // through at full weight
}
function sfxFall() {                         // route lost to a fall: longer, hollower
  tone('sawtooth', 240, 50, 0.4, 0.22, 0, true);
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

// Rolled guns get a rarity cadence instead of the old one-size weapon chime.
// Tier I is a compact confirm, tier II adds a third harmonic and low detent,
// and tier III earns one short mechanical impact plus a warm rising carrier.
// A recatch is deliberately shorter: satisfying under pressure, but it never
// replays the full relic fanfare every time damage knocks the same gun loose.
function sfxWeaponLoot(gun, detail) {
  const tier = Math.max(1, Math.min(3, gun?.tier || 1));
  if (detail?.recatch) {
    tone('square', 510, 760, 0.12, 0.12, 0, true);
    tone('sine', 108, 62, 0.16, 0.10, 0, true);
    return;
  }
  if (tier === 1) {
    tone('square', 660, 660, 0.06, 0.13);
    tone('square', 990, 990, 0.09, 0.13, 0.07);
    return;
  }
  if (tier === 2) {
    tone('sine', 82, 48, 0.20, 0.13, 0, true);
    tone('triangle', 523, 523, 0.09, 0.11, 0.015);
    tone('triangle', 784, 784, 0.10, 0.11, 0.09);
    tone('triangle', 1047, 1047, 0.13, 0.10, 0.17);
    return;
  }
  noiseHit('lowpass', 520, 140, 1.2, 0.18, 0.16, 0, true);
  tone('sine', 72, 34, 0.34, 0.19, 0, true);
  tone('triangle', 392, 392, 0.12, 0.11, 0.035, true);
  tone('triangle', 587, 587, 0.14, 0.11, 0.12, true);
  tone('triangle', 784, 784, 0.18, 0.12, 0.21, true);
  padTone('sine', 196, 198, 0.62, 0.032, 0.08, 0.09);
  padTone('sine', 294, 296, 0.58, 0.026, 0.11, 0.10);
}

// VOLATILE pays off at the exact detonation edge (direct hit, terrain stop,
// or fuel expiry). A compact sub-body gives the blast weight, a filtered
// crack separates it from the ordinary hit tick, and stacked rolls lower the
// body slightly instead of adding unbounded voices. The caller globally
// throttles this recipe so a forked/rapid cluster becomes a rhythmic chain of
// charges, not six identical explosions clipping on the same frame.
function sfxVolatileImpact(stack = 1) {
  const power = Math.max(1, Math.min(3, Number(stack) || 1));
  noiseHit('lowpass', 980 + power * 120, 180, 1.25, 0.17,
    0.18 + power * 0.025);
  tone('sine', 104 - power * 9, 31, 0.25 + power * 0.025,
    0.19 + power * 0.035);
  noiseHit('bandpass', 2600, 720, 2.1, 0.105, 0.09 + power * 0.018,
    0.018);
}
function sfxWarn(low) {                      // alarm two-tone; `low` = heavier threat —
  const a = low ? 523 : 880, b = low ? 392 : 620;             // always audible: a warning
  tone('square', a, a, 0.09, 0.1, 0, true);                   // that gets buried under its
  tone('square', b, b, 0.09, 0.1, 0.1, true);                 // own chaos has failed its job
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
function sfxSnap(second) {                   // yaw snap lands: monumental clunk (pillar 4:
  const f = second ? 65 : 75;                                       // every break changes the
  tone('sine', f, f * 0.55, 0.22, second ? 0.5 : 0.42, 0, true);     // game, so the world-scale
  noiseHit('bandpass', 2600, 2600, 6, 0.05, 0.16, 0, true);          // ones stay full weight
  tone('square', 150, 90, 0.08, 0.16, 0, true);                      // under any load
}
function sfxBoom() {                         // face/band commits: deep settle boom
  tone('sine', 50, 30, 0.8, 0.4, 0, true);
  noiseHit('lowpass', 200, 90, 1, 0.6, 0.2, 0, true);
}
function sfxResume() {                       // scroll eases back in: soft hiss
  noiseHit('lowpass', 800, 400, 1, 0.4, 0.05);
}
// orbital lance resolves: every hostile on screen dies on one frame, which
// hitHostile/removeHostile's own throttled sfxHit/sfxKill would flatten into
// a single tick+thud — exactly the "everything just broke" beat that gets
// lost. A dedicated, distinctly bigger destruction voice: lower and longer
// than sfxBoom's settle, a wide crackle standing in for every kill the
// throttle masks, and a descending metal groan (mechanical, not organic —
// contrasts with sfxKill's organic-ish crunch). Always full weight: this is
// the single biggest destruction beat the game has (pillar 4).
function sfxLanceStrike() {
  tone('sine', 65, 24, 0.55, 0.5, 0, true);
  noiseHit('bandpass', 2400, 700, 1.2, 0.3, 0.24, 0, true);
  tone('sawtooth', 200, 45, 0.4, 0.22, 0, true);
  noiseHit('lowpass', 260, 90, 1, 0.5, 0.24, 0, true);
}

// Crown uplink: low and sparse while arming, a rising tonal detent for each
// defense packet, then a launch voice built from impact + carrier + a quiet
// harmonic stack. Frequencies stay out of the piercing top octave and every
// peak is below the established lance/ritual cues; weight comes from shape,
// not from making the finale tiring for a child to replay.
function sfxFinaleArm(progress = 0) {
  const p = Math.max(0, Math.min(1, progress));
  const root = 58 + p * 30;
  tone('sine', root, root * 1.18, 0.28, 0.075, 0, true);
  noiseHit('lowpass', 190 + p * 90, 110, 1, 0.22, 0.045);
}

function sfxFinalePacket(wave) {
  const step = Math.max(1, Math.min(3, wave));
  const root = [0, 146.8, 174.6, 220][step];
  tone('triangle', root, root * 1.5, 0.34, 0.105, 0, true);
  tone('sine', root * 0.5, root * 0.5, 0.42, 0.11, 0, true);
  tone('sine', root * 2, root * 2, 0.18, 0.045, 0.075);
}

function sfxFinaleHold(progress = 0) {
  const p = Math.max(0, Math.min(1, progress));
  const root = 82 + p * 55;
  tone('sine', root, root * 1.06, 0.18, 0.045, 0, true);
}

// The Warden speaks through the part that is arming. These short mechanical
// signatures mirror its two visual verbs: an accelerating rail charge for
// the sweep, a descending three-detent rack for the marked barrage, and an
// open harmonic when the iris can finally be damaged. No generic alarm loop
// and no full-body blink are needed to explain the encounter.
function sfxWardenState(state) {
  if (state === 'sweepTell') {
    tone('sawtooth', 82, 310, 0.42, 0.11, 0, true);
    noiseHit('bandpass', 520, 1300, 2.5, 0.26, 0.08, 0.04, true);
  } else if (state === 'sweepFire') {
    noiseHit('bandpass', 2100, 620, 1.3, 0.34, 0.18, 0, true);
    tone('square', 190, 72, 0.30, 0.15, 0, true);
  } else if (state === 'barrageTell') {
    tone('square', 294, 294, 0.07, 0.10, 0, true);
    tone('square', 220, 220, 0.07, 0.11, 0.11, true);
    tone('square', 147, 147, 0.10, 0.13, 0.22, true);
  } else if (state === 'barrageBurst') {
    noiseHit('lowpass', 520, 92, 1.1, 0.34, 0.20, 0, true);
    tone('sine', 74, 31, 0.36, 0.25, 0, true);
  } else if (state === 'exposed') {
    tone('triangle', 392, 392, 0.10, 0.11, 0, true);
    tone('triangle', 588, 588, 0.12, 0.11, 0.08, true);
    tone('sine', 784, 792, 0.25, 0.08, 0.15, true);
  }
}

function sfxWardenBreak() {
  noiseHit('bandpass', 2600, 210, 1.0, 0.48, 0.28, 0, true);
  noiseHit('lowpass', 360, 58, 1.2, 0.68, 0.32, 0.02, true);
  tone('sine', 66, 22, 0.78, 0.46, 0, true);
  tone('sawtooth', 170, 38, 0.54, 0.16, 0.04, true);
}

function sfxFinaleTransmit() {
  // The mechanical launch arrives first.
  tone('sine', 58, 24, 0.72, 0.43, 0, true);
  noiseHit('lowpass', 260, 72, 1, 0.62, 0.20, 0, true);
  tone('sawtooth', 96, 760, 1.05, 0.12, 0.035, true);
  // Then the carrier resolves into a restrained open-fifth/upper-octave pad.
  padTone('sine', 196, 198, 1.65, 0.052, 0.08, 0.18);
  padTone('sine', 294, 296, 1.62, 0.043, 0.10, 0.20);
  padTone('triangle', 392, 396, 1.58, 0.034, 0.12, 0.22);
  padTone('sine', 588, 592, 1.50, 0.025, 0.15, 0.24);
}
function motif(notes, step, dur, peak) {
  notes.forEach((f, i) => tone('triangle', f, f, dur, peak, i * step, true));
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

// The ambience bed is ducked by TWO independent multipliers that compose:
// ambDuck (state-driven — retry/over/victory, existing since T-012) and
// combatDuck (below — recent hit/kill/fire/lance density, new). Either can
// change without knowing about the other; both always read the other's
// CURRENT value, so a retry duck mid-fight and a combat duck easing off a
// lull never fight each other for the last word on the bus gain.
function applyAmbienceGain(rampSec) {
  if (!ctx || dead) return;
  const t = ctx.currentTime;
  ambBus.gain.cancelScheduledValues(t);
  ambBus.gain.setValueAtTime(ambBus.gain.value, t);
  ambBus.gain.linearRampToValueAtTime(A.ambience * ambDuck * combatDuck, t + rampSec);
}

function duckAmbience(mult) {
  ambDuck = mult;
  applyAmbienceGain(0.4);
}

// combat-density duck: a busy fight (frequent hits/kills/fire/a lance strike)
// pushes the machine bed down so the foreground weapon/impact sound has
// headroom; a lull lets it climb back. `heat` decays continuously but the
// bus gain itself is only recomputed on a throttled cadence (~7/s) — cheap
// enough to run every frame's onPlayerSync without adding scheduling churn.
let heat = 0;
let combatDuck = 1;

function bumpHeat(v) { heat = Math.min(1, heat + v); }

function updateCombatHeat() {
  if (!ctx || dead) return;
  if (!gate('heatTick', A.heatTickMs)) return;
  const t = nowMs();
  const dtSec = Math.max(0, t - (lastAt.heatClockAt ?? t)) / 1000;
  lastAt.heatClockAt = t;
  heat = Math.max(0, heat - A.heatDecayPerSec * dtSec);
  const next = 1 - A.heatDuck * heat;
  if (Math.abs(next - combatDuck) > 0.015) {
    combatDuck = next;
    applyAmbienceGain(0.25);
  }
}

/* ------------------- pursuing-edge pressure (T-042) ----------------- *
 * The crush plane's own warning grammar, mirrored into sound. `pressureBus`
 * is a persistent low rumble (built once, alongside the ambience layers —
 * same "always-live node, gain-zeroed until needed" pattern, not a one-shot)
 * whose gain tracks crushWarnIntensity(margin, CONFIG.juice.crush) — the
 * EXACT pure function and the EXACT margin expression (player.x - player.hw
 * - sLeftEdge()) render/juice.js already drives the visual crush-warning
 * haze with, so the two can never read differently for the same distance.
 * A separate ping is edge-detected off warnPulse()'s own continuous wave
 * (same C.pulseSlowMs/pulseFastMs the visual blink uses) rather than
 * re-deriving its period formula here, so a retune of the visual cadence
 * retunes the ping for free and the two cannot drift apart in tuning. */
let pressureBus = null;
let prevPulse = 0;
let lastPressureIntensity = 0;

function buildPressure() {
  pressureBus = ctx.createGain();
  pressureBus.gain.value = 0;
  pressureBus.connect(master);
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.value = A.pressureHz;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = A.pressureHz * 2;
  o.connect(f).connect(pressureBus);
  o.start();
}

function updatePressure() {
  if (!ctx || dead) return;
  const C = CONFIG.juice.crush;
  const intensity = crushWarnIntensity(player.x - player.hw - sLeftEdge(), C);
  lastPressureIntensity = intensity;
  const t = ctx.currentTime;
  pressureBus.gain.cancelScheduledValues(t);
  pressureBus.gain.setValueAtTime(pressureBus.gain.value, t);
  pressureBus.gain.linearRampToValueAtTime(A.pressure * intensity, t + 0.2);

  if (intensity <= 0) { prevPulse = 0; return; }
  // rising-edge detect: warnPulse's own period shrinks toward pulseFastMs as
  // intensity climbs, so pings naturally arrive faster as the plane closes —
  // a proximity-sensor cadence, not a fixed-rate beep.
  const p = warnPulse(intensity, nowMs(), C);
  if (p >= 0.5 && prevPulse < 0.5) {
    const f0 = 200 + 500 * intensity;              // pitch rises with danger too
    tone('sine', f0, f0 * 0.82, 0.09, 0.05 + 0.09 * intensity, 0, true);
  }
  prevPulse = p;
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

  buildPressure();

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
  updateCombatHeat();                        // throttled internally; safe every frame
  updatePressure();                          // per-frame; the ramp/gate calls inside are cheap

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
let killChain = 0;
let lastKillAt = -1e9;

function onHostileSpawned(e) {
  hostileHp.set(e.id, e.hp);
  hostileState.set(e.id, e.state);
}
function onHostileSync(e) {
  const hp = hostileHp.get(e.id);
  if (hp !== undefined && e.hp < hp && gate('hit', A.hitGapMs)) { sfxHit(hp - e.hp); bumpHeat(A.heat.hit); }
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
  if (!fade) return;
  killChain = gameMs - lastKillAt <= 780 ? Math.min(5, killChain + 1) : 1;
  lastKillAt = gameMs;
  if (gate('kill', A.hitGapMs)) {
    sfxKill(e.kind, !!e.genome?.mutated);
    bumpHeat(A.heat.kill);
  }
  // A fast triple kill is the earned spectacle beat. It has its own throttle
  // and still obeys the global voice cap/load scaling, so crowd kills become
  // one memorable detonation instead of an unbounded pile of identical thuds.
  if (killChain >= 3 && gate('chainBreak', 600)) sfxChainBreak(killChain);
}

// capsules: removal is pickup only under the sim's own catch predicate
// (updateCapsules: past noCatchUntil, overlapping RIG, and — checked first
// there — not an expiry/cull removal). Mirroring the expiry test here keeps
// a popped weapon that dies under the player from chiming a false pickup.
// Accepted edge: a resetGame teardown removal on the exact frame a catchable
// capsule overlaps RIG would still chime once, under the retry/over duck.
function onCapsuleRemoved(c) {
  // Letter pickups announce on view.loot.acquired, where their exact tier is
  // available. This removal hook remains the mod-pickup edge only.
  if (c.kind === 'letter') return;
  if (c.mode === 'pop' && (c.y < CONFIG.edges.killY || gameMs > c.dieAt)) return;
  if (gameMs >= c.noCatchUntil &&
      circleHitsPlayer(c.x, c.y, CONFIG.capsules.pickupRadius) && gate('pickup', 80))
    sfxPickup(c.kind);
}

function onLootAcquired(gun, def, detail) {
  if (gate('loot', 80)) sfxWeaponLoot(gun, detail);
}

function onVolatileImpact(b, radius, stack) {
  // One cue per 105ms is enough to articulate a detonation chain while
  // bounding a RAPID + FORKED + VOLATILE relic to under ten cues/second.
  if (!gate('volatile:impact', 105)) return;
  sfxVolatileImpact(stack);
  bumpHeat(0.20 + Math.min(3, Number(stack) || 1) * 0.05);
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

// Layer recount belongs on corner.finished, NOT faceRevealed: wavegate's
// finishCorner fires faceRevealed BEFORE it sets c.state = 'done', so a
// recount there would miss the completing corner (off by one, last face
// never entering the mix). corner.finished fires after 'done'.
function onCornerFinished() { sfxResume(); applyLayers(); }
function onFaceRevealed() { sfxBoom(); }

// Orbital lance: view.mods.lanceTelegraph(L) fires every frame the strike is
// armed, INCLUDING the resolving frame (mods.js calls it before nulling
// mods.lance) — so "gameMs crossed L.at" is the exact frame hitHostile hits
// everything on screen, detected off the SAME data the bridge already hands
// this hook plus the gameMs import audio.js already has. No new sim import,
// no change to the T-012 sanctioned-read allowlist. `lanceStruckAt` guards
// against firing twice while gameMs stays past L.at on later frames of the
// same telegraph (there are none — mods.lance goes null the same frame — but
// a second lance armed with the same `at` by coincidence would collide
// without it, so the guard is real, not defensive filler).
let lanceStruckAt = -1;
function onLanceTelegraph(L) {
  if (gate('warn', A.warnGapMs)) sfxWarn(false);
  if (gameMs >= L.at && lanceStruckAt !== L.at) {
    lanceStruckAt = L.at;
    sfxLanceStrike();
    bumpHeat(A.heat.lance);
  }
}

let finaleAudioPhase = 'dormant';
let finaleAudioWave = 0;
let finaleTransmitPlayed = false;
let finaleWardenAttack = 'dormant';
let finaleWardenDefeated = false;

function onFinaleStarted(snapshot) {
  finaleAudioPhase = snapshot?.phase || 'arming';
  finaleAudioWave = snapshot?.wave || 0;
  finaleTransmitPlayed = false;
  finaleWardenAttack = snapshot?.warden?.attack || 'dormant';
  finaleWardenDefeated = !!snapshot?.warden?.defeated;
  if (gate('finale:arm', 520)) sfxFinaleArm(snapshot?.progress || 0);
}

function onFinaleSync(snapshot) {
  if (!snapshot) return;
  const attack = snapshot.warden?.attack || 'dormant';
  if (snapshot.warden?.present && attack !== finaleWardenAttack &&
      gate(`warden:${attack}`, 120)) sfxWardenState(attack);
  if (snapshot.warden?.defeated && !finaleWardenDefeated) {
    sfxWardenBreak();
    bumpHeat(0.78);
  }
  finaleWardenAttack = attack;
  finaleWardenDefeated = !!snapshot.warden?.defeated;
  if (snapshot.phase === 'arming' && gate('finale:arm', 640))
    sfxFinaleArm(snapshot.progress);
  if (snapshot.phase === 'defend') {
    if (snapshot.wave > finaleAudioWave) {
      for (let wave = finaleAudioWave + 1; wave <= snapshot.wave; wave++) sfxFinalePacket(wave);
    } else if (gate('finale:hold', 1080)) {
      sfxFinaleHold(snapshot.progress);
    }
  }
  finaleAudioWave = Math.max(finaleAudioWave, snapshot.wave || 0);
  finaleAudioPhase = snapshot.phase;
}

function onFinaleTransmit(snapshot) {
  if (finaleTransmitPlayed) return;
  finaleTransmitPlayed = true;
  finaleAudioPhase = snapshot?.phase || 'transmit';
  sfxFinaleTransmit();
  bumpHeat(0.9);
}

function onFinaleReset() {
  finaleAudioPhase = 'dormant';
  finaleAudioWave = 0;
  finaleTransmitPlayed = false;
  finaleWardenAttack = 'dormant';
  finaleWardenDefeated = false;
  delete lastAt['finale:arm'];
  delete lastAt['finale:hold'];
}

function onStateScreen(next) {
  paused = next === 'PAUSED';
  if (!ctx || dead) return;
  if (next === 'PAUSED') { ctx.suspend().catch(() => {}); return; }
  if (ctx.state === 'suspended' && !document.hidden) ctx.resume().catch(() => {});
  // every state screen ends the live-combat context: a stale heat value
  // riding into a fresh life/screen would otherwise keep ambience ducked
  // for up to a second past a fight that just ended
  heat = 0;
  combatDuck = 1;
  // …and a fresh screen is never mid-crush: reset the pressure rumble/ping
  // clock so a restart never inherits a stale ramp or an early ping
  prevPulse = 0;
  lastPressureIntensity = 0;
  if (pressureBus) {
    pressureBus.gain.cancelScheduledValues(ctx.currentTime);
    pressureBus.gain.setValueAtTime(0, ctx.currentTime);
  }
  if (next === 'PLAYING') {
    // a restart rewound corner/transform state; resync layers and the
    // per-frame caches so stale deltas can't fire ghost sounds
    duckAmbience(1);
    applyLayers();
    hostileHp.clear();
    hostileState.clear();
    killChain = 0;
    lastKillAt = -1e9;
    xfSnap.clear();
    lanceStruckAt = -1;
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
    // The Crown already spent the mix's largest voice on transmission. Let
    // the results screen answer it with a smaller, warmer reply instead of
    // stacking the generic victory fanfare over the still-ringing carrier.
    if (finaleAudioPhase === 'complete') motif([659, 784, 1047], 0.15, 0.24, 0.085);
    else motif([523, 659, 784, 1047], 0.12, 0.18, 0.14);
  }
}

/* ------------------------------ wiring ----------------------------- */
if (AUDIO_ON) {
  after('player', 'sync', onPlayerSync);
  after('hostiles', 'spawned', onHostileSpawned);
  after('hostiles', 'sync', onHostileSync);
  after('hostiles', 'removed', onHostileRemoved);
  after('capsules', 'removed', onCapsuleRemoved);
  after('loot', 'acquired', onLootAcquired);
  after('bullets', 'slotSpawned', (i, type) => {
    if (FIRE[type] && gate('fire:' + type, A.fireGapMs)) { FIRE[type](); bumpHeat(A.heat.fire); }
  });
  after('bullets', 'volatileImpact', onVolatileImpact);
  after('mods', 'lanceTelegraph', onLanceTelegraph);
  after('finale', 'started', onFinaleStarted);
  after('finale', 'sync', onFinaleSync);
  after('finale', 'transmit', onFinaleTransmit);
  after('finale', 'reset', onFinaleReset);
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
    maxVoices: A.maxVoices,               // T-042: so a caller can judge `voices` against
                                           // its own budget instead of hardcoding 14
    combatDuck,                           // T-042: current ambience multiplier from recent
    heat,                                 // combat density (both 1/0 when nothing is happening)
    pressure: lastPressureIntensity,      // T-042: last computed crush-margin 0..1 intensity
    finale: { phase: finaleAudioPhase, wave: finaleAudioWave,
               transmitPlayed: finaleTransmitPlayed },
  };
}
