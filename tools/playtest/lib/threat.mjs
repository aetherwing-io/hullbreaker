// threat.mjs — the RELATIVE-GEOMETRY view of one sample, for the closed-loop
// policy grammar (lib/policy.mjs).
//
// WHY THIS EXISTS (T-018 finding, docs/playtests/2026-08-gate-fight-harness.md):
// every hostile-aware clause the grammar had was a global existence test —
// "is ANY hound in `tell`", "is ANY polyp open". None of them says WHERE the
// hostile is relative to RIG, and `sample.hostiles` is an array in spawn
// order, so the dotted-path lookup could only reach a meaningless fixed index
// (`hostiles.0.state`). That gap has one large consequence and one small one:
//
//   * The game's aim is 8-way and comes from the held direction keys
//     (`computeAim`, src/sim/player.js): level while only left/right is held,
//     45° up-forward with up+forward, straight up with up alone. A policy that
//     cannot name where a target is can only hold `up` unconditionally or
//     never — so every shipped policy fires level shots only. Against the
//     shipped wave-gate composition (CONFIG.waves.comp, lanes 2.6/4.6/7.2
//     above the deck) a level shot from the standing muzzle (1.05) or even
//     from a jump apex (+2.72) cannot reach the mid or high lane at all: the
//     bot could only ever damage an enemy that was already diving into its
//     face. That is a harness limit, not a difficulty fact.
//   * `wasp` had no state predicate at all, so "something is diving" was
//     unsayable even as a global test.
//
// WHAT THIS IS NOT: a planner, a target selector, or an aim assist. It is a
// per-tick projection of the SAME rows the sampler already polls, into scalar
// fields the existing `field OP value` grammar can already compare. No new
// operators, no `||`, no eval, no lookahead, no memory between ticks. A script
// still has to spell out its own reflex, and every threshold it uses stays
// visible in the script (which is why this module deliberately publishes no
// "is a dive dangerous" predicate — that number belongs in the script that
// believes it).
//
// Honesty notes (also in the README's limitations list):
//   - The corridors below are drawn from the standing muzzle point
//     (player.y + muzzleY) in a straight line. The game spawns a projectile at
//     (x + ax*0.6, y + muzzleY + ay*0.5) and it travels while the target
//     moves, so corridor occupancy is a "a shot fired now points at it" test,
//     not a hit prediction.
//   - No bend awareness: a shot dies at a facet bend (decisions.md entry 7)
//     and this module does not know where the bends are — it never imports
//     game source. Inside a corner arena (which ends at the pivot) that costs
//     nothing; a target sighted across a corner may be a phantom.
//   - `materialized: false` rows are skipped, matching the sim's own "no
//     hitbox while condensing" rule (src/sim/weapons.js).

// Geometry mirrored from CONFIG. Mirrored, not imported: this harness never
// imports game source, so the game stays the only thing under test. Drift is
// caught by tools/pathcheck.mjs ("playtest threat geometry mirrors CONFIG").
export const THREAT_GEOM = Object.freeze({
  muzzleY: 1.05,        // CONFIG.player.muzzleY — the standing firing line
  hitR: 0.55,           // CONFIG.wasp.contactRadius — bullet is a point vs this circle
  rangeTiles: 14,       // corridor length; ~one screen half-width, well inside
                        //   the rifle's own reach (speed 26 × lifeMs 1.1 = 28 tiles)
  absent: 99,           // every distance-like field when there is nothing to report
});

// Every field a script may name after `threat.`. compilePolicy rejects
// anything else at load time rather than letting a typo evaluate to false for
// a whole run (the failure mode the missing-field warnings exist to soften).
export const THREAT_FIELDS = Object.freeze([
  'n',          // materialized hostiles in the sample (any distance)
  'dist',       // distance from the muzzle to the nearest one, tiles
  'dx',         // signed x offset of the nearest one (world +x, not facing-relative)
  'dy',         // signed y offset of the nearest one from the muzzle line
  'adx',        // |dx| of the nearest one
  'fwd',        // dx of the nearest one in AIM-SIDE terms: >0 = in front of the gun
  'slope',      // dy / |dx| of the nearest one: the ANGLE, which is what an
                //   8-way gun actually chooses between. ~0 = level shot, ~1 =
                //   the 45° ray, big = straight overhead. Capped at 9 (and 9
                //   when |dx| is 0), because the grammar compares a field to a
                //   constant and never to another field.
  'side',       // which way the gun points this tick: 1 right, -1 left
  'kind',       // nearest one's kind ('wasp' | 'hound' | 'polyp' | 'mortar' | 'carrier')
  'state',      // nearest one's state ('cruise' | 'dive' | 'tell' | …)
  'levelN',     // how many sit on the LEVEL ray (aim with no up held)
  'diagN',      // how many sit on the 45° UP-FORWARD ray (up + forward held)
  'vertN',      // how many sit on the STRAIGHT-UP ray (up alone)
  'aboveN',     // how many are above the level ray at all, within range
  // The second mark: the nearest hostile ABOVE the firing line. Purely
  // geometric (no kind test), and the one a "tilt the gun up" reflex needs —
  // the nearest hostile overall is regularly a deck unit under the muzzle,
  // which would otherwise veto aiming up at the swarm overhead.
  'upDist',     // distance to the nearest hostile above the firing line
  'upDx',       // signed x offset of that one
  'upDy',       // its height above the firing line
  'upAdx',      // |upDx|
  'upSlope',    // upDy / |upDx|, same capping as `slope`
  'diveN',      // how many are in the wasp `dive` state, any distance
  'diveDist',   // distance to the nearest diving one
  'diveDx',     // signed x offset of the nearest diving one
  'diveDy',     // signed y offset of the nearest diving one from the muzzle line
]);

const RIGHT_CODES = ['ArrowRight', 'KeyD'];
const LEFT_CODES = ['ArrowLeft', 'KeyA'];
const NO_CODES = new Set();

// Which way the gun points this tick. The harness's own held-key set comes
// first because that is what the game will resolve `facing` from on this very
// frame (computeAim sets facing from the horizontal input whenever it is
// non-zero); the sampled `facing` (window.HB enrichment) only decides it when
// no direction key is held, and a fresh run starts facing right.
function aimSide(sample, heldCodes) {
  const held = heldCodes || NO_CODES;
  const right = RIGHT_CODES.some((c) => held.has(c));
  const left = LEFT_CODES.some((c) => held.has(c));
  if (right && !left) return 1;
  if (left && !right) return -1;
  if (sample.facing === 1 || sample.facing === -1) return sample.facing;
  return 1;
}

// Nothing to report: counts read 0 and every distance-like field reads
// THREAT_GEOM.absent, so a `<` rule is false and a `>0` rule is false on an
// empty sample. Threat rules should always be written that way round — see
// the README.
function emptyThreat(side) {
  const A = THREAT_GEOM.absent;
  return {
    n: 0, dist: A, dx: A, dy: A, adx: A, fwd: A, slope: 0, side, kind: '', state: '',
    levelN: 0, diagN: 0, vertN: 0, aboveN: 0,
    upDist: A, upDx: A, upDy: A, upAdx: A, upSlope: 0,
    diveN: 0, diveDist: A, diveDx: A, diveDy: A,
  };
}

// dy/|dx| with the vertical case pinned to a finite cap: the grammar only
// compares a field to a constant, so a script writes `threat.upSlope>2.5`
// where it means "nearly overhead" and gets a number, never Infinity/NaN.
const SLOPE_CAP = 9;
function slopeOf(dx, dy) {
  const a = Math.abs(dx);
  if (a < 1e-6) return dy > 0 ? SLOPE_CAP : (dy < 0 ? -SLOPE_CAP : 0);
  return Math.max(-SLOPE_CAP, Math.min(SLOPE_CAP, dy / a));
}

export function deriveThreat(sample, heldCodes) {
  const s = sample || {};
  const side = aimSide(s, heldCodes);
  if (typeof s.x !== 'number' || typeof s.y !== 'number' || !Array.isArray(s.hostiles)) {
    return emptyThreat(side);           // dom fidelity, or a slice with no hostiles telemetry
  }
  const G = THREAT_GEOM;
  const mx = s.x, my = s.y + G.muzzleY;
  const out = emptyThreat(side);
  let nearestD = Infinity, diveD = Infinity, upD = Infinity;
  for (const h of s.hostiles) {
    if (!h || h.materialized === false) continue;       // condensing: no hitbox yet
    if (typeof h.x !== 'number' || typeof h.y !== 'number') continue;
    const dx = h.x - mx, dy = h.y - my;
    const d = Math.hypot(dx, dy);
    out.n++;
    if (d < nearestD) {
      nearestD = d;
      out.dist = d; out.dx = dx; out.dy = dy; out.adx = Math.abs(dx);
      out.fwd = dx * side; out.slope = slopeOf(dx, dy);
      out.kind = h.kind || ''; out.state = h.state || '';
    }
    if (dy >= G.hitR && d < upD) {
      upD = d;
      out.upDist = d; out.upDx = dx; out.upDy = dy; out.upAdx = Math.abs(dx);
      out.upSlope = slopeOf(dx, dy);
    }
    if (h.state === 'dive') {
      out.diveN++;
      if (d < diveD) { diveD = d; out.diveDist = d; out.diveDx = dx; out.diveDy = dy; }
    }
    if (d > G.rangeTiles) continue;                     // out of the corridors' reach
    const fwd = dx * side;                              // >0: in front of the gun
    if (dy >= G.hitR) out.aboveN++;
    if (fwd > 0 && Math.abs(dy) < G.hitR) out.levelN++;
    // perpendicular distance to the 45° ray is |fwd - dy| / √2
    if (fwd > 0 && dy > 0 && Math.abs(fwd - dy) < G.hitR * Math.SQRT2) out.diagN++;
    if (dy > 0 && Math.abs(dx) < G.hitR) out.vertN++;
  }
  return out;
}
