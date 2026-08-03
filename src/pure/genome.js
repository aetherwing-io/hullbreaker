/* ================= DETERMINISTIC ENEMY GENOMES =================== */
/* A Meridian mutation is an immutable recipe, parallel to a rolled gun:
 * at most one gene per dimension, a bounded total budget, seeded ordering,
 * and explicit compatibility. This module is pure so a campaign trace or
 * debug gallery can reproduce the exact roster without loading the sim or
 * renderer. Genes change decisions and spatial answers; none adds hit points. */

export const GENOME_DIMENSIONS = Object.freeze([
  'locomotion', 'defense', 'attack', 'behavior', 'command', 'reactive',
]);

export const MERIDIAN_RESPONSES = Object.freeze([
  'DORMANT', 'MAINTENANCE', 'INTERCEPT', 'CONTAIN', 'QUARANTINE', 'ERADICATE', 'SCUTTLE',
]);

export const ENEMY_GENES = Object.freeze({
  VAULT: Object.freeze({
    dimension: 'locomotion', kinds: Object.freeze(['hound']), short: 'VLT', minFace: 4,
  }),
  BULWARK: Object.freeze({
    dimension: 'defense', kinds: Object.freeze(['wasp', 'hound', 'carrier', 'mortar']),
    short: 'BLW', minFace: 3,
    // Rooted denial roles keep their clean solo lesson. The same painted
    // face-plate only joins a mortar after the player has already learned
    // both its ordinary landing mark and Bulwark's one-shot opening.
    minFaceByKind: Object.freeze({ mortar: 5 }),
  }),
  TWINSTRIKE: Object.freeze({
    dimension: 'attack', kinds: Object.freeze(['wasp']), short: 'TWN', minFace: 5,
  }),
  SALVO: Object.freeze({
    dimension: 'attack', kinds: Object.freeze(['mortar']), short: 'SLV', minFace: 5,
  }),
  RELAY: Object.freeze({
    dimension: 'behavior', kinds: Object.freeze(['polyp']), short: 'RLY', minFace: 4,
  }),
  PINCER: Object.freeze({
    // A Pincer carrier is a mobile support flank, not a diving carrier: it
    // takes the same visibly split station as a wasp and keeps its ordinary
    // loot body / ordinary contact rule. This makes the existing organ a
    // reusable behavior allele without inventing another asset or attack.
    dimension: 'behavior', kinds: Object.freeze(['wasp', 'carrier']), short: 'PNC', minFace: 5,
  }),
  AEGIS: Object.freeze({
    dimension: 'command', kinds: Object.freeze(['carrier', 'mortar', 'polyp']),
    short: 'AEG', minFace: 5,
  }),
  BACKLASH: Object.freeze({
    // The expanding horseshoe is already kind-agnostic, fully telegraphed and
    // kill-cancelled. SCUTTLE may bolt it to any ordinary body; earlier faces
    // remain untouched so the response never muddies a role's teaching beat.
    dimension: 'reactive',
    kinds: Object.freeze(['wasp', 'hound', 'carrier', 'polyp', 'mortar']),
    short: 'BKL', minFace: 6,
  }),
});

// Strains are encounter ecology, not a second stat roll. Consecutive members
// of an authored cohort rotate through pursuit, priority-source and reactive
// specialists, so a strong weapon cannot collapse a late wave into repeated
// copies of the same maximum-budget recipe. Each strain only ranks the eight
// existing, painted organs and chooses visible variants of behavior whose
// ordinary tells remain authoritative.
export const MERIDIAN_STRAINS = Object.freeze({
  HUNTER: Object.freeze({
    short: 'HNT',
    dimensions: Object.freeze([
      'attack', 'locomotion', 'behavior', 'command', 'defense', 'reactive',
    ]),
    wardPolicy: 'SPEAR',       // link bodies nearest RIG inside the visible radius
    salvoPattern: 'LEAD',      // second marked patch follows current travel
  }),
  BASTION: Object.freeze({
    short: 'BST',
    dimensions: Object.freeze([
      'command', 'defense', 'behavior', 'attack', 'locomotion', 'reactive',
    ]),
    wardPolicy: 'ANCHOR',      // link bodies nearest the painted projector
    salvoPattern: 'BRACKET',   // second patch brackets the authored home zone
  }),
  WEAVER: Object.freeze({
    short: 'WVR',
    dimensions: Object.freeze([
      'reactive', 'behavior', 'locomotion', 'defense', 'attack', 'command',
    ]),
    wardPolicy: 'ECHELON',     // visibly distribute links across altitude bands
    salvoPattern: 'CUTBACK',   // second marked patch punishes the panic reversal
  }),
});

const GENE_IDS = Object.freeze(Object.keys(ENEMY_GENES));
const STRAIN_IDS = Object.freeze(Object.keys(MERIDIAN_STRAINS));
const CONFLICTS = Object.freeze([
  Object.freeze(['AEGIS', 'BULWARK']), // the marked priority source must stay immediately punishable
  Object.freeze(['AEGIS', 'BACKLASH']),// killing the shield source may never spring a second trap
]);

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

function hashUnit(value) {
  return hash32(value) / 0xffffffff;
}

const clamp01 = (v) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));

export function enemyGenomeBudget(ctx = {}) {
  const face = Math.max(0, Math.min(6, ctx.face | 0));
  if (face < 3) return 0; // DORMANT through INTERCEPT remain clean teaching grammar
  let budget = face < 5 ? 1 : 2;
  const hpRatio = clamp01(ctx.hpRatio === undefined ? 1 : ctx.hpRatio);
  const gunTier = Math.max(0, ctx.gunTier | 0);
  const clearEmaMs = Math.max(0, Number(ctx.clearEmaMs) || 0);
  const killsPerFace = Math.max(0, Number(ctx.kills) || 0) / Math.max(1, face);

  // The response reads demonstrated power, never raw elapsed time. Pressure
  // reinforcements get one extra mutation only after the director has already
  // proved a safe empty window in which to materialize them.
  if (face >= 4 && gunTier >= 2) budget++;
  if (clearEmaMs > 0 && clearEmaMs <= 1600) budget++;
  if (killsPerFace >= 7) budget++;
  if (ctx.pressure && face >= 4) budget++;
  // Mercy is paid after the response reaches its hard ceiling. Subtracting
  // before the clamp let a saturated power read (budget 5) remain at three
  // organs even when RIG was on the last hull pip: 5 - 1 still clamped to 3.
  // This is a real slot removed, not an HP nerf hidden in the body.
  budget = Math.min(3, budget);
  if (hpRatio <= 0.34) budget--;
  return Math.max(0, budget);
}

function compatible(chosen, id) {
  const dim = ENEMY_GENES[id].dimension;
  if (chosen.some((other) => ENEMY_GENES[other].dimension === dim)) return false;
  return !CONFLICTS.some((pair) => pair.includes(id) &&
    pair.some((other) => other !== id && chosen.includes(other)));
}

function geneAvailable(id, kind, face) {
  const gene = ENEMY_GENES[id];
  if (!gene.kinds.includes(kind)) return false;
  const minFace = gene.minFaceByKind?.[kind] ?? gene.minFace;
  return face >= minFace;
}

function labelFor(kind, response, strain, genes) {
  if (!genes.length) return `${response} ${String(kind || 'hostile').toUpperCase()}`;
  return `${response} ${strain.short} ${genes.map((id) => ENEMY_GENES[id].short).join('/')} ${String(kind).toUpperCase()}`;
}

function strainFor(ctx, seed, face, serial) {
  // Authored squads provide a cohort key + slot and get all three ecologies
  // once per trio. Ambient bodies fall into deterministic serial trios, so
  // changing the frame rate or kill order never changes their recipe.
  const cohortKey = String(ctx.cohortKey ?? `ambient:${Math.floor(serial / STRAIN_IDS.length)}`);
  const cohortSlot = Number.isFinite(ctx.cohortSlot)
    ? Math.max(0, ctx.cohortSlot | 0)
    : Math.max(0, serial) % STRAIN_IDS.length;
  const explicitPhase = Number.isFinite(ctx.cohortPhase) ? ctx.cohortPhase | 0 : null;
  const phase = explicitPhase === null
    ? hash32(`${seed}|${face}|${cohortKey}|strain`) % STRAIN_IDS.length
    : ((explicitPhase % STRAIN_IDS.length) + STRAIN_IDS.length) % STRAIN_IDS.length;
  const id = STRAIN_IDS[(phase + cohortSlot) % STRAIN_IDS.length];
  return Object.freeze({
    id,
    ...MERIDIAN_STRAINS[id],
    cohortKey,
    cohortSlot,
    cohortPhase: phase,
  });
}

function expressedGenomeBudget(ctx, seed, spawnKey, face, budget, strain) {
  if (budget <= 0) return 0;
  // A role's first mutation stays singular even if a skilled player arrived
  // with a high-tier gun: teaching is never skipped by adaptive pressure.
  if (face < 5) return 1;

  // Late squads distribute complexity across bodies. Hunter is a two-organ
  // pursuit hybrid; Bastion is a legible priority-source specialist; Weaver
  // grows from a one-organ remix on STERILIZE into a two-organ reaction on
  // SCUTTLE. A quarter of demonstrated-power SCUTTLE bodies (and pressure
  // reinforcements born in a proven empty window) may spend the third slot.
  let cap = strain.id === 'BASTION' ? 1
    : strain.id === 'WEAVER' && face === 5 ? 1 : 2;
  const overexpressed = face >= 6 && budget >= 3 && cap >= 2 &&
    (ctx.pressure || hash32(`${seed}|${spawnKey}|${strain.id}|overexpress`) % 4 === 0);
  if (overexpressed) cap++;
  return Math.max(0, Math.min(3, budget, cap));
}

export function rollEnemyGenome(ctx = {}, seed = 0x4d455249) {
  const kind = ['wasp', 'hound', 'carrier', 'polyp', 'mortar'].includes(ctx.kind)
    ? ctx.kind : 'wasp';
  const face = Math.max(0, Math.min(6, ctx.face | 0));
  const response = MERIDIAN_RESPONSES[face] || MERIDIAN_RESPONSES[0];
  const budget = enemyGenomeBudget({ ...ctx, face });
  const chosen = [];

  const serial = Math.max(0, ctx.serial | 0);
  const spawnKey = ctx.spawnKey === undefined ? serial : ctx.spawnKey;
  const strain = strainFor(ctx, seed, face, serial);
  const expressedBudget = expressedGenomeBudget(ctx, seed, spawnKey, face, budget, strain);

  // Doctrine makes each response tier change the combat grammar, rather than
  // merely making a different random subset more likely. Only the clean
  // VAULT lesson is mandatory now; the late response is expressed across a
  // rotating cohort instead of stamping one mandatory build onto every body.
  const doctrine = [];
  // A mercy roll may reduce the whole expression to zero. Doctrine is a first
  // spend inside that cap, never a trait that bypasses it.
  if (expressedBudget > 0 && face === 4 && kind === 'hound') doctrine.push('VAULT');
  for (const id of doctrine) if (compatible(chosen, id)) chosen.push(id);

  const dimensionRank = new Map(strain.dimensions.map((dimension, index) => [dimension, index]));
  const ranked = GENE_IDS
    .filter((id) => geneAvailable(id, kind, face) && !doctrine.includes(id))
    .map((id) => ({
      id,
      dimension: dimensionRank.get(ENEMY_GENES[id].dimension) ?? GENOME_DIMENSIONS.length,
      score: hash32(`${seed}|${spawnKey}|${kind}|${face}|${strain.id}|${id}`),
    }))
    .sort((a, b) => a.dimension - b.dimension || a.score - b.score || a.id.localeCompare(b.id));
  // The strain's first available organ is its silhouette/tactical identity and
  // remains strict. SCUTTLE's later slots branch deterministically between the
  // next two compatible priorities. Without this small branch, every
  // species+strain pair converged on one exact late recipe because each kind
  // currently has at most one gene in any dimension: the seed changed its
  // phenotype, but never which painted parts or behaviors actually combined.
  // Keeping the branch to face 6 preserves every clean teaching encounter;
  // keeping it to a two-candidate window preserves HUNTER/BASTION/WEAVER's
  // ecology while making repeated assaults visibly and mechanically mutate.
  while (chosen.length < expressedBudget) {
    const candidates = ranked.filter(({ id }) =>
      !chosen.includes(id) && compatible(chosen, id));
    if (!candidates.length) break;
    let next = candidates[0];
    if (face >= 6 && chosen.length > doctrine.length && candidates.length > 1) {
      const slot = chosen.length;
      next = candidates.slice(0, 2)
        .map((candidate) => ({
          ...candidate,
          branchScore: hash32(
            `${seed}|${spawnKey}|${kind}|${face}|${strain.id}|slot:${slot}|${candidate.id}`),
        }))
        .sort((a, b) => a.branchScore - b.branchScore || a.id.localeCompare(b.id))[0];
    }
    chosen.push(next.id);
  }

  const genes = Object.freeze(chosen);
  const dimensions = Object.freeze(Object.fromEntries(GENOME_DIMENSIONS.map((dimension) => [
    dimension,
    genes.find((id) => ENEMY_GENES[id].dimension === dimension) || null,
  ])));
  const identity = `genome-${kind}-${face}-${hash32(`${seed}|${spawnKey}|${strain.id}|${genes.join('+')}`)
    .toString(16).padStart(8, '0')}`;
  // A genome also carries a small deterministic morphology. These values are
  // presentation only: the renderer may cant/offset its painted bolt-on parts
  // so two identical trait sets are not literal clones, while collision, HP,
  // timing and every combat decision stay completely unchanged. Bounded
  // variation keeps a BULWARK immediately recognizable as a Bulwark.
  const morphKey = `${identity}|morph`;
  const phenotype = Object.freeze({
    handedness: hash32(`${morphKey}|hand`) & 1 ? 1 : -1,
    moduleScale: 0.92 + hashUnit(`${morphKey}|scale`) * 0.16,
    moduleTilt: (hashUnit(`${morphKey}|tilt`) * 2 - 1) * 0.11,
    moduleBias: (hashUnit(`${morphKey}|bias`) * 2 - 1) * 0.12,
    pulsePhase: hashUnit(`${morphKey}|pulse`) * Math.PI * 2,
    platingBand: hash32(`${morphKey}|plate`) % 3,
  });
  return Object.freeze({
    id: identity,
    kind,
    face,
    response,
    budget,
    expressedBudget,
    strain,
    alleles: Object.freeze({
      wardPolicy: strain.wardPolicy,
      salvoPattern: strain.salvoPattern,
    }),
    genes,
    dimensions,
    phenotype,
    label: labelFor(kind, response, strain, genes),
    mutated: genes.length > 0,
  });
}

export function genomeHas(genome, gene) {
  return !!genome && genome.genes.includes(gene);
}
