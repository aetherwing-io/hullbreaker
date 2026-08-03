/* ======================= DETERMINISTIC GUN ROLLS ======================= */
/* A gun is an immutable recipe: one chassis letter plus 0…3 trait entries.
   Entries intentionally remain a list (rather than a set), because duplicate
   traits are real rolls and their effects stack. Nothing here knows about the
   sim clock, capsules, THREE, or CONFIG; authored and carrier pickups can use
   the same deterministic compiler in browser and headless runs.             */

export const GUN_TRAITS = Object.freeze([
  'RAPID', 'HEAVY', 'FORKED', 'SEEKER', 'PHASE', 'VOLATILE',
]);

export const GUN_CHASSIS_NAMES = Object.freeze({
  R: 'RIVETGUN',
  S: 'SCATTERBLOOM',
  L: 'SUNSPEAR',
  H: 'HUNGER ENGINE',
  F: 'CINDERMOUTH',
});

export const GUN_TRAIT_BITS = Object.freeze({
  RAPID: 1 << 0,
  HEAVY: 1 << 1,
  FORKED: 1 << 2,
  SEEKER: 1 << 3,
  PHASE: 1 << 4,
  VOLATILE: 1 << 5,
});

const SHORT_TRAIT = Object.freeze({
  RAPID: 'ZIP', HEAVY: 'HVY', FORKED: 'FRK',
  SEEKER: 'SKR', PHASE: 'PHS', VOLATILE: 'VOL',
});

const clamp01 = (n) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

// FNV-1a plus an avalanche. String input makes authored ids and numeric seeds
// equally stable, with no dependency on the run's mutable RNG stream.
function hash32(value) {
  const s = String(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

function nextHash(h, salt) {
  h = (h + 0x9e3779b9 + Math.imul(salt + 1, 0x85ebca6b)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

export function gunTraitSlots(routeProgress) {
  const p = clamp01(routeProgress);
  return p < 1 / 3 ? 1 : p < 2 / 3 ? 2 : 3;
}

function traitCounts(traits) {
  const counts = Object.fromEntries(GUN_TRAITS.map((trait) => [trait, 0]));
  for (const trait of traits) if (counts[trait] !== undefined) counts[trait]++;
  return counts;
}

function makeGun(letter, tier, traits, id, starter) {
  const safeLetter = GUN_CHASSIS_NAMES[letter] ? letter : 'R';
  const frozenTraits = Object.freeze(traits.slice());
  const counts = traitCounts(frozenTraits);
  let traitMask = 0;
  for (const trait of GUN_TRAITS) if (counts[trait]) traitMask |= GUN_TRAIT_BITS[trait];
  const visual = Object.freeze({
    tier,
    traitMask,
    rapid: counts.RAPID,
    heavy: counts.HEAVY,
    forked: counts.FORKED,
    seeker: counts.SEEKER,
    phase: counts.PHASE,
    volatile: counts.VOLATILE,
  });
  const gun = {
    id,
    letter: safeLetter,
    tier,
    traits: frozenTraits,
    counts: Object.freeze(counts),
    visual,
    starter: !!starter,
  };
  gun.label = gunLabel(gun);
  gun.shortLabel = gunLabel(gun, true);
  return Object.freeze(gun);
}

// Used for the dependable starter R and compatibility/debug calls that ask
// for a chassis by letter. Pickups never call this: they always call rollGun.
export function plainGun(letter = 'R', starter = false) {
  const safeLetter = GUN_CHASSIS_NAMES[letter] ? letter : 'R';
  return makeGun(safeLetter, 0, [], starter ? 'starter-rivetgun' : `plain-${safeLetter}`, starter);
}

export function rollGun(letter, routeProgress, seed = 0) {
  const safeLetter = GUN_CHASSIS_NAMES[letter] ? letter : 'R';
  const p = clamp01(routeProgress);
  const tier = gunTraitSlots(p);
  const routeKey = Math.round(p * 4096);
  const seedHash = hash32(`${seed}|${safeLetter}|${routeKey}|${tier}`);
  let h = seedHash;
  const traits = [];
  for (let i = 0; i < tier; i++) {
    h = nextHash(h, i);
    traits.push(GUN_TRAITS[h % GUN_TRAITS.length]);
  }
  return makeGun(
    safeLetter,
    tier,
    traits,
    `gun-${safeLetter}-${tier}-${seedHash.toString(16).padStart(8, '0')}`,
    false,
  );
}

function countSuffix(n) { return n > 1 ? (n === 2 ? '²' : '³') : ''; }

export function gunLabel(gun, compact = false) {
  const chassis = GUN_CHASSIS_NAMES[gun && gun.letter] || GUN_CHASSIS_NAMES.R;
  if (!gun || !gun.traits || gun.traits.length === 0) return chassis;
  const counts = gun.counts || traitCounts(gun.traits);
  const prefixes = [];
  for (const trait of GUN_TRAITS) {
    if (!counts[trait]) continue;
    prefixes.push((compact ? SHORT_TRAIT[trait] : trait) + countSuffix(counts[trait]));
  }
  return `${prefixes.join('/')} ${chassis}`;
}

/* Compile a recipe over an ordinary CONFIG.weapons chassis row. The result is
   a stable per-held-gun def, not a replacement for weaponDef(letter): callers
   that need the old static table continue to get exactly that table. */
export function compileGunDef(gun, baseDef) {
  const base = baseDef || {};
  const counts = (gun && gun.counts) || traitCounts([]);
  const rapid = counts.RAPID || 0;
  const heavy = counts.HEAVY || 0;
  const forked = counts.FORKED || 0;
  const seeker = counts.SEEKER || 0;
  const phase = counts.PHASE || 0;
  const volatile = counts.VOLATILE || 0;
  const heavySpeedMult = 0.88 ** heavy;
  const baseCount = base.count || 1;
  const count = baseCount + forked;
  const turnRate = base.turnRate
    ? base.turnRate * (1 + seeker * 0.22)
    : seeker ? 5.0 + seeker * 1.1 : 0;
  const seekRange = seeker
    ? Math.max((base.seekRange || 0) + seeker * 2.5, 11 + seeker * 2.5)
    : base.seekRange || 0;
  // Guidance is a finite behavior, not perfect aim for the projectile's
  // entire life. A chassis seeker gets one committed lock; SEEKER stacks add
  // fuel, widen acquisition and buy explicit re-locks when a target dies.
  // This preserves H's fire-while-traversing fantasy without letting two
  // darts circle the arena and erase whatever spawns next.
  const seekFuelMs = turnRate > 0
    ? (base.seekFuelMs || 760) + seeker * 280
    : 0;
  const seekConeDeg = turnRate > 0
    ? Math.min(178, (base.seekConeDeg || (base.turnRate ? 132 : 104)) + seeker * 16)
    : 0;
  const seekRetargets = turnRate > 0
    ? (base.seekRetargets || 0) + seeker
    : 0;
  // Existing L/F penetration remains their chassis promise (three bodies
  // total). PHASE is deliberately not dead on them: every stack adds two more
  // bodies AND 18% flight time, while granting the same finite budget to any
  // chassis that did not start with penetration.
  const pierceBudget = (base.pierce ? 2 : 0) + phase * 2;
  return Object.freeze({
    ...base,
    name: gunLabel(gun),
    fireRateMs: Math.max(55, (base.fireRateMs || 130) * (0.80 ** rapid)),
    speed: (base.speed || 26) * heavySpeedMult,
    damage: (base.damage || 1) + heavy,
    lifeMs: (base.lifeMs || 1100) * (1 + phase * 0.18),
    count,
    splayDeg: count > 1 ? (base.splayDeg || 6 + forked * 2) : 0,
    turnRate,
    seekRange,
    seekFuelMs,
    seekConeDeg,
    seekRetargets,
    seekLead: turnRate > 0 ? 0.72 + seeker * 0.08 : 0,
    pierce: pierceBudget > 0,
    pierceBudget,
    // PHASE now changes route behavior as well as body penetration. The
    // budget is measured in solid tiles, so one stack slips a thin plate but
    // cannot ghost through an entire limb or ever cross a facet bend.
    terrainPhaseTiles: phase ? 0.65 + phase * 0.65 : 0,
    // HEAVY has a physical combat identity: surviving mobile bodies recoil
    // and lose a short beat. Rooted threats and committed charges keep their
    // authored spatial promises; the live sim applies these two values.
    heavyImpulse: heavy ? 2.5 + heavy * 1.35 : 0,
    heavyStunMs: heavy ? 45 + heavy * 35 : 0,
    volatileRadius: volatile ? 0.8 + (volatile - 1) * 0.25 : 0,
    volatileDamage: volatile ? 1 + (volatile >= 3 ? 1 : 0) : 0,
    crawlSpeed: base.crawlSpeed ? base.crawlSpeed * heavySpeedMult : 0,
    gunId: gun ? gun.id : 'plain-R',
    gunTier: gun ? gun.tier : 0,
    gunMeta: gun ? gun.visual : null,
  });
}
