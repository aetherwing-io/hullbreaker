/* ============================= JUICE ============================== */
/* Feedback math — the deterministic half of the baseline juice pass
   (T-011). Everything here is pure: no imports, no clock, no state. The
   sim owns the one piece of juice that changes gameplay (hit-stop) and
   drives it through these functions; the renderer owns everything that is
   only ever looked at (shake, particles, flashes, the crush warning) and
   drives it through these same functions, so both halves agree by
   construction and `tools/pathcheck.mjs` can assert the whole vocabulary
   without a browser.

   Tuning lives in CONFIG.juice (`src/config.js`) — one block, one
   intensity constant per effect — and is passed in as `J`/`S`/`C` rather
   than imported, so a fixture or a test can substitute its own table. */

export function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

/* ---------------------------- hit-stop ---------------------------- *
 * The one gameplay-affecting effect in the pass. It is a SIM decision:
 * how long the world holds its breath after a kill or a hit is timing
 * the player feels through the controller, so the renderer must not be
 * able to change it (and a renderer-free host must produce the same
 * run). These two functions are the whole policy; src/sim/time.js owns
 * the clock that applies them.
 *
 * Convention (matches CHRONO, see src/sim/time.js's header): gameMs
 * always advances at REAL time, and the freeze is expressed as a SCALE
 * on the dt handed to entity updates. So a hit-stop of `ms` removes
 * exactly ms * (1 - scale) of simulated time whatever the frame rate is,
 * and no timer deadline stored in gameMs drifts. */

// Which event, if any, arms a hit-stop this frame. Hurt outranks a kill:
// taking damage is the bigger beat, and the two can land on one frame.
export function hitStopEvent(prevKills, kills, prevHp, hp) {
  if (hp < prevHp) return 'hurt';
  if (kills > prevKills) return 'kill';
  return null;
}

export function hitStopMsFor(event, J) {
  if (event === 'hurt') return J.hurtMs;
  if (event === 'kill') return J.killMs;
  return 0;
}

// Arming is idempotent-ish: a second kill inside a freeze extends it, but
// never past maxMs from now, so a crowd kill can never stall the run.
export function hitStopArm(until, gameMs, ms, J) {
  if (!(ms > 0)) return until;
  const target = gameMs + ms;
  const cap = gameMs + J.maxMs;
  return Math.min(Math.max(until, target), cap);
}

export function hitStopScaleAt(gameMs, until, J) {
  return gameMs < until ? J.scale : 1;
}

/* ------------------------------ shake ----------------------------- *
 * Trauma model: events ADD trauma, trauma decays linearly, and the
 * amplitude is trauma SQUARED — so small events barely move the frame
 * and only a real beat (a hit taken, a ritual snap) is felt. Readability
 * first (pillar 5): the offset is bounded in world tiles, not pixels, so
 * the FAR default view (decisions.md entry 7) never smears.             */

export function traumaAdd(trauma, amount) { return clamp01(trauma + amount); }

export function traumaAfter(trauma, dtMs, decayPerSec) {
  return clamp01(trauma - decayPerSec * (dtMs / 1000));
}

// Deterministic, allocation-free, and periodic-but-not-obviously-so: three
// incommensurate sine phases, so the frame never traces a visible circle.
// `out` is reused by the caller (one object per module, never per frame).
export function shakeAt(trauma, tMs, S, out) {
  const a = trauma * trauma;
  const w = (tMs / 1000) * S.freqHz * Math.PI * 2;
  out.x = a * S.maxOffset * Math.sin(w);
  out.y = a * S.maxOffset * Math.sin(w * 1.37 + 1.7);
  out.roll = a * S.maxRollDeg * Math.sin(w * 0.61 + 3.1);
  return out;
}

/* -------------------------- crush warning ------------------------- *
 * The pursuing damage plane already kills; nothing on screen says it is
 * about to. Intensity rises as the player's margin closes, eased so the
 * last tile dominates, and the pulse accelerates with it — the same
 * warning grammar the hound tell and the polyp iris already speak.     */

export function crushWarnIntensity(marginTiles, C) {
  if (!(marginTiles < C.startTiles) || !(C.startTiles > 0)) return 0;
  const u = 1 - Math.max(0, marginTiles) / C.startTiles;
  return clamp01(u * u);
}

// 0…1 blink phase; period shortens from pulseSlowMs to pulseFastMs as the
// margin closes. Returns a smooth wave, not a square one: a hard strobe at
// the edge of the screen is exactly the kind of noise pillar 5 rules out.
export function warnPulse(intensity, tMs, C) {
  const period = C.pulseSlowMs + (C.pulseFastMs - C.pulseSlowMs) * clamp01(intensity);
  return 0.5 + 0.5 * Math.sin((tMs / period) * Math.PI * 2);
}

/* ----------------------------- particles -------------------------- *
 * Bursts are spawned from a seeded hash rather than a live rng, so the
 * same event always looks the same and nothing in the render layer has
 * to touch src/pure/rng.js's shared stream (which the sim owns).       */

export function hash01(n) {
  let h = Math.imul(n ^ 0x9e3779b9, 2246822519);
  h ^= h >>> 15;
  h = Math.imul(h, 3266489917);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

// Burst velocity for particle `i` of `n`, in the FACE frame: s along the
// ribbon, y up, d outward from the hull. Directions are fanned by the
// golden angle and jittered by the hash, so a 4-particle impact never
// looks like a cross and a 12-particle death never looks like a wheel.
export function burstVelocity(seed, i, n, speed, out) {
  const golden = 2.39996323;
  const jitter = hash01(seed * 733 + i * 37);
  const ang = i * golden + jitter * 0.9;
  const mag = speed * (0.45 + 0.55 * hash01(seed * 977 + i * 61));
  const depth = (hash01(seed * 401 + i * 89) - 0.5) * 0.7;
  out.s = Math.cos(ang) * mag;
  out.y = Math.sin(ang) * mag;
  out.d = depth * mag;
  return out;
}

// Life curves, both defined on u = age / ttl in [0, 1].
export function particleAlpha(u) {
  const t = clamp01(u);
  return (1 - t) * (1 - t);              // fades out fast, no pop at the end
}

export function particleScale(u, from, to) {
  return from + (to - from) * clamp01(u);
}

// Flashes (muzzle, pickup, kill pop) are the opposite curve: instant on,
// a short hold, then out — a flash that ramps in reads as a light source
// switching on rather than as an impact.
export function flashAlpha(u) {
  const t = clamp01(u);
  if (t < 0.18) return 1;
  return clamp01((0.82 - (t - 0.18)) / 0.82) ** 1.6;
}
