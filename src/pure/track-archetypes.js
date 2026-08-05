/* ===================== BODY-PLAN TRACK ARCHETYPES ===================== */
/* Pure, deterministic planning data for routes across Meridian's possible
 * macro body plans.  A physical track segment is deliberately NOT a defense
 * phase: several short anatomical segments may carry one immune-response
 * phase, while a long rib/wing/limb span may carry another phase by itself.
 *
 * This module owns no runtime geometry, camera, reveal mesh, player pace, or
 * enemy spawn.  Array order is the continuous route.  Consumers can project
 * the returned ranges into their own logical-s/y model without importing a
 * renderer or changing the shipped movement constants.                     */

export const DEFENSE_PHASES = Object.freeze([
  'OBSERVE', 'INTERCEPT', 'CONTAIN', 'QUARANTINE', 'STERILIZE', 'SCUTTLE',
]);

export const TRACK_SEGMENT_FIELDS = Object.freeze([
  'id', 'phase', 'bodyZone', 'lengthTiles', 'turnDeg', 'riseTiles', 'surface',
  'traversalDensity', 'traversalBands', 'revealAhead', 'revealBehind',
  'transitionKind', 'socketEcology',
]);

export const TRACK_SURFACES = Object.freeze(['exterior', 'interior']);
export const TRAVERSAL_DENSITIES = Object.freeze(['restrained', 'braided', 'dense', 'assault']);
export const TRANSITION_KINDS = Object.freeze([
  'facet-ratchet', 'tail-chicane', 'gill-fold', 'gill-breach',
  'dorsal-breach', 'wing-spar', 'limb-transfer', 'joint-hub',
  'access-plate', 'torso-transfer', 'collar-ratchet', 'crown-entry',
]);

export const SOCKET_ECOLOGY_ROLES = Object.freeze([
  'arc-intercept', 'aerial-nest', 'carrier-dare', 'countermeasure-vent',
  'ground-pursuit', 'joint-clamp', 'mortar-perch', 'rooted-interlock',
  'rupture-chain', 'summit-defense', 'under-rib-ambush',
]);

export const PACE_CONTRACT = Object.freeze({
  playerSpeedScale: 1,
  scrollSpeedScale: 1,
  unit: 'logical-tiles',
});

// Duplicated intentionally as a compatibility fixture.  The focused check
// compares this against CONFIG, so a future path change cannot silently make
// the baseline claim false.
export const CURRENT_SIX_FACE_PATH = Object.freeze({
  faces: 6,
  faceTiles: 88,
  introTiles: 24,
  outroTiles: 31,
  turnDeg: 30,
  turnSign: 1,
  chamferTiles: 2,
});

const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const sameArray = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

function freezeSegment(row) {
  return Object.freeze({
    id: row.id,
    phase: row.phase,
    bodyZone: row.bodyZone,
    lengthTiles: row.lengthTiles,
    turnDeg: row.turnDeg,
    riseTiles: row.riseTiles,
    surface: row.surface,
    traversalDensity: row.traversalDensity,
    traversalBands: row.traversalBands,
    revealAhead: row.revealAhead,
    revealBehind: row.revealBehind,
    transitionKind: row.transitionKind,
    socketEcology: Object.freeze([...row.socketEcology]),
  });
}

function freezePlan(row) {
  const segments = Object.freeze(row.segments.map(freezeSegment));
  return Object.freeze({
    id: row.id,
    bodyPlan: row.bodyPlan,
    version: row.version,
    entrySegmentId: segments[0]?.id || '',
    exitSegmentId: segments[segments.length - 1]?.id || '',
    introTiles: row.introTiles ?? 0,
    outroTiles: row.outroTiles ?? 0,
    turnModel: Object.freeze({ ...row.turnModel }),
    paceContract: PACE_CONTRACT,
    segments,
  });
}

const wormZones = Object.freeze([
  ['lower-vertebral-facet', 'exterior', 'restrained', 3,
    ['aerial-nest', 'ground-pursuit']],
  ['flank-rib-district', 'exterior', 'braided', 3,
    ['arc-intercept', 'ground-pursuit', 'carrier-dare']],
  ['armored-gill-ring', 'interior', 'dense', 4,
    ['rooted-interlock', 'under-rib-ambush', 'mortar-perch']],
  ['pressure-tract-coil', 'interior', 'dense', 4,
    ['countermeasure-vent', 'mortar-perch', 'rupture-chain']],
  ['upper-collar-facet', 'exterior', 'assault', 5,
    ['aerial-nest', 'joint-clamp', 'rupture-chain']],
  ['crown-approach-ring', 'exterior', 'assault', 5,
    ['rooted-interlock', 'summit-defense', 'carrier-dare']],
]);

export function buildWormTrack(tune = CURRENT_SIX_FACE_PATH) {
  const faces = Math.max(0, tune.faces | 0);
  const semanticTurn = tune.turnDeg * 2 * tune.turnSign;
  const segments = Array.from({ length: faces }, (_, index) => {
    const phase = Math.min(DEFENSE_PHASES.length, index + 1);
    const zone = wormZones[index % wormZones.length];
    return {
      id: `worm-p${phase}-${zone[0]}`,
      phase,
      bodyZone: zone[0],
      lengthTiles: tune.faceTiles,
      turnDeg: semanticTurn,
      // Current path.js keeps macro y at zero; the local route generator owns
      // the vertical lattice.  Zero preserves that behavior exactly.
      riseTiles: 0,
      surface: zone[1],
      traversalDensity: zone[2],
      traversalBands: zone[3],
      revealAhead: 0,
      revealBehind: 0,
      transitionKind: 'facet-ratchet',
      socketEcology: zone[4],
    };
  });

  return freezePlan({
    id: 'worm',
    bodyPlan: 'Meridian Spine-Serpent',
    version: 1,
    introTiles: tune.introTiles,
    outroTiles: tune.outroTiles,
    turnModel: {
      stepsPerCorner: 2,
      stepDeg: tune.turnDeg,
      turnSign: tune.turnSign,
      chamferTiles: tune.chamferTiles,
    },
    segments,
  });
}

const SKY_RAY = freezePlan({
  id: 'sky-ray',
  bodyPlan: 'Crownback Sky-Ray',
  version: 1,
  introTiles: 20,
  outroTiles: 30,
  turnModel: { stepsPerCorner: 1, stepDeg: 0, turnSign: 1, chamferTiles: 0 },
  segments: [
    { id: 'sky-p1-tail-keel', phase: 1, bodyZone: 'tail-keel', lengthTiles: 22,
      turnDeg: 22, riseTiles: 2, surface: 'exterior', traversalDensity: 'restrained',
      traversalBands: 2, revealAhead: 1, revealBehind: 0, transitionKind: 'tail-chicane',
      socketEcology: ['aerial-nest', 'carrier-dare'] },
    { id: 'sky-p1-tail-fin-return', phase: 1, bodyZone: 'tail-fin-return', lengthTiles: 24,
      turnDeg: -22, riseTiles: 3, surface: 'exterior', traversalDensity: 'braided',
      traversalBands: 3, revealAhead: 0, revealBehind: 1, transitionKind: 'tail-chicane',
      socketEcology: ['arc-intercept', 'ground-pursuit'] },
    { id: 'sky-p2-lower-gill-lip', phase: 2, bodyZone: 'lower-gill-lip', lengthTiles: 26,
      turnDeg: 30, riseTiles: 3, surface: 'exterior', traversalDensity: 'braided',
      traversalBands: 3, revealAhead: 1, revealBehind: 0, transitionKind: 'gill-fold',
      socketEcology: ['aerial-nest', 'under-rib-ambush'] },
    { id: 'sky-p2-gill-chicane', phase: 2, bodyZone: 'gill-chicane', lengthTiles: 28,
      turnDeg: -30, riseTiles: 4, surface: 'exterior', traversalDensity: 'dense',
      traversalBands: 4, revealAhead: 0, revealBehind: 1, transitionKind: 'gill-breach',
      socketEcology: ['rooted-interlock', 'countermeasure-vent', 'mortar-perch'] },
    { id: 'sky-p3-gill-processor', phase: 3, bodyZone: 'gill-processor', lengthTiles: 28,
      turnDeg: 16, riseTiles: 5, surface: 'interior', traversalDensity: 'dense',
      traversalBands: 4, revealAhead: 1, revealBehind: 0, transitionKind: 'gill-fold',
      socketEcology: ['rooted-interlock', 'mortar-perch', 'rupture-chain'] },
    { id: 'sky-p3-gill-throat-return', phase: 3, bodyZone: 'gill-throat-return', lengthTiles: 34,
      turnDeg: -16, riseTiles: 6, surface: 'interior', traversalDensity: 'dense',
      traversalBands: 4, revealAhead: 0, revealBehind: 1, transitionKind: 'dorsal-breach',
      socketEcology: ['countermeasure-vent', 'under-rib-ambush', 'joint-clamp'] },
    { id: 'sky-p4-dorsal-breach-ramp', phase: 4, bodyZone: 'dorsal-breach-ramp', lengthTiles: 44,
      turnDeg: 12, riseTiles: 9, surface: 'interior', traversalDensity: 'assault',
      traversalBands: 5, revealAhead: 0, revealBehind: 0, transitionKind: 'dorsal-breach',
      socketEcology: ['rupture-chain', 'mortar-perch', 'rooted-interlock'] },
    { id: 'sky-p5-port-wing-spar', phase: 5, bodyZone: 'port-wing-spar', lengthTiles: 78,
      turnDeg: 0, riseTiles: 12, surface: 'exterior', traversalDensity: 'assault',
      traversalBands: 5, revealAhead: 1, revealBehind: 0, transitionKind: 'wing-spar',
      socketEcology: ['aerial-nest', 'arc-intercept', 'carrier-dare'] },
    { id: 'sky-p5-crownback-straight', phase: 5, bodyZone: 'crownback-straight', lengthTiles: 82,
      turnDeg: -8, riseTiles: 14, surface: 'exterior', traversalDensity: 'assault',
      traversalBands: 5, revealAhead: 0, revealBehind: 1, transitionKind: 'collar-ratchet',
      socketEcology: ['ground-pursuit', 'mortar-perch', 'rupture-chain'] },
    { id: 'sky-p6-transmitter-crest', phase: 6, bodyZone: 'transmitter-crest', lengthTiles: 90,
      turnDeg: 0, riseTiles: 16, surface: 'exterior', traversalDensity: 'assault',
      traversalBands: 5, revealAhead: 0, revealBehind: 0, transitionKind: 'crown-entry',
      socketEcology: ['summit-defense', 'rooted-interlock', 'carrier-dare'] },
  ],
});

const QUADRUPED = freezePlan({
  id: 'quadruped',
  bodyPlan: 'Six-Limbed Ark-Beast',
  version: 1,
  introTiles: 24,
  outroTiles: 32,
  turnModel: { stepsPerCorner: 1, stepDeg: 0, turnSign: 1, chamferTiles: 0 },
  segments: [
    { id: 'quad-p1-forepaw-scutes', phase: 1, bodyZone: 'forepaw-scutes', lengthTiles: 36,
      turnDeg: 8, riseTiles: 8, surface: 'exterior', traversalDensity: 'restrained',
      traversalBands: 3, revealAhead: 1, revealBehind: 0, transitionKind: 'limb-transfer',
      socketEcology: ['ground-pursuit', 'carrier-dare'] },
    { id: 'quad-p1-forelimb-spar', phase: 1, bodyZone: 'forelimb-spar', lengthTiles: 82,
      turnDeg: 42, riseTiles: 14, surface: 'exterior', traversalDensity: 'braided',
      traversalBands: 4, revealAhead: 0, revealBehind: 1, transitionKind: 'joint-hub',
      socketEcology: ['arc-intercept', 'aerial-nest', 'mortar-perch'] },
    { id: 'quad-p2-elbow-gimbal', phase: 2, bodyZone: 'elbow-gimbal', lengthTiles: 34,
      turnDeg: -42, riseTiles: 0, surface: 'exterior', traversalDensity: 'assault',
      traversalBands: 5, revealAhead: 1, revealBehind: 0, transitionKind: 'joint-hub',
      socketEcology: ['joint-clamp', 'rooted-interlock', 'carrier-dare'] },
    { id: 'quad-p2-upper-limb-span', phase: 2, bodyZone: 'upper-limb-span', lengthTiles: 74,
      turnDeg: 28, riseTiles: 12, surface: 'exterior', traversalDensity: 'dense',
      traversalBands: 4, revealAhead: 0, revealBehind: 1, transitionKind: 'limb-transfer',
      socketEcology: ['ground-pursuit', 'aerial-nest', 'rupture-chain'] },
    { id: 'quad-p3-shoulder-socket', phase: 3, bodyZone: 'shoulder-socket', lengthTiles: 38,
      turnDeg: 60, riseTiles: 0, surface: 'exterior', traversalDensity: 'assault',
      traversalBands: 5, revealAhead: 1, revealBehind: 0, transitionKind: 'joint-hub',
      socketEcology: ['joint-clamp', 'mortar-perch', 'rooted-interlock'] },
    { id: 'quad-p3-thorax-entry', phase: 3, bodyZone: 'thorax-entry', lengthTiles: 58,
      turnDeg: -30, riseTiles: 8, surface: 'interior', traversalDensity: 'dense',
      traversalBands: 5, revealAhead: 0, revealBehind: 1, transitionKind: 'access-plate',
      socketEcology: ['countermeasure-vent', 'under-rib-ambush', 'rupture-chain'] },
    { id: 'quad-p4-thorax-transfer', phase: 4, bodyZone: 'thorax-transfer', lengthTiles: 66,
      turnDeg: 20, riseTiles: 14, surface: 'interior', traversalDensity: 'assault',
      traversalBands: 5, revealAhead: 0, revealBehind: 0, transitionKind: 'torso-transfer',
      socketEcology: ['rooted-interlock', 'mortar-perch', 'countermeasure-vent'] },
    { id: 'quad-p5-hip-gimbal', phase: 5, bodyZone: 'hip-gimbal', lengthTiles: 54,
      turnDeg: -55, riseTiles: 10, surface: 'interior', traversalDensity: 'assault',
      traversalBands: 5, revealAhead: 1, revealBehind: 0, transitionKind: 'joint-hub',
      socketEcology: ['joint-clamp', 'rupture-chain', 'carrier-dare'] },
    { id: 'quad-p5-hindlimb-span', phase: 5, bodyZone: 'hindlimb-span', lengthTiles: 86,
      turnDeg: 35, riseTiles: 16, surface: 'exterior', traversalDensity: 'assault',
      traversalBands: 5, revealAhead: 0, revealBehind: 1, transitionKind: 'limb-transfer',
      socketEcology: ['ground-pursuit', 'aerial-nest', 'mortar-perch'] },
    { id: 'quad-p6-shell-crown-run', phase: 6, bodyZone: 'shell-crown-run', lengthTiles: 78,
      turnDeg: 0, riseTiles: 18, surface: 'exterior', traversalDensity: 'assault',
      traversalBands: 5, revealAhead: 0, revealBehind: 0, transitionKind: 'crown-entry',
      socketEcology: ['summit-defense', 'rooted-interlock', 'carrier-dare'] },
  ],
});

export const TRACK_ARCHETYPES = Object.freeze({
  WORM: buildWormTrack(),
  SKY_RAY,
  QUADRUPED,
});

export function trackArchetype(id) {
  const key = String(id || '').trim().toUpperCase().replaceAll('-', '_');
  return TRACK_ARCHETYPES[key] || null;
}

// Converts ordered segment lengths into a gap-free logical route.  The
// outro begins at the last returned s1; it is intentionally not a segment.
export function trackSegmentRanges(plan) {
  let s = plan.introTiles;
  return Object.freeze(plan.segments.map((segment) => {
    const range = Object.freeze({ id: segment.id, s0: s, s1: s + segment.lengthTiles });
    s = range.s1;
    return range;
  }));
}

// The declaration is intentionally one-sided: what the active segment may
// reveal ahead does not force the hidden segment to reveal back.  Validation
// still prevents either direction from crossing a defense-phase boundary.
export function revealNeighborhood(plan, segmentIndex) {
  const segment = plan.segments[segmentIndex];
  if (!segment) return Object.freeze([]);
  const lo = Math.max(0, segmentIndex - segment.revealBehind);
  const hi = Math.min(plan.segments.length - 1, segmentIndex + segment.revealAhead);
  return Object.freeze(plan.segments.slice(lo, hi + 1).map((row) => row.id));
}

export function trackArchetypeViolations(plan) {
  const out = [];
  if (!plan || typeof plan !== 'object') return ['track archetype must be an object'];
  if (!idPattern.test(String(plan.id || ''))) out.push('plan id must be stable kebab-case');
  if (!String(plan.bodyPlan || '')) out.push('bodyPlan is required');
  if (!Number.isInteger(plan.version) || plan.version < 1) out.push('version must be a positive integer');
  if (!Number.isFinite(plan.introTiles) || plan.introTiles < 0) out.push('introTiles must be non-negative');
  if (!Number.isFinite(plan.outroTiles) || plan.outroTiles < 0) out.push('outroTiles must be non-negative');
  if (!Array.isArray(plan.segments) || !plan.segments.length) {
    out.push('segments must be a non-empty ordered route');
    return out;
  }
  if (plan.entrySegmentId !== plan.segments[0].id) out.push('entrySegmentId must own the first segment');
  if (plan.exitSegmentId !== plan.segments[plan.segments.length - 1].id)
    out.push('exitSegmentId must own the last segment');
  if (!plan.paceContract || plan.paceContract.playerSpeedScale !== 1 ||
      plan.paceContract.scrollSpeedScale !== 1 || plan.paceContract.unit !== 'logical-tiles')
    out.push('pace contract must preserve player and scroll speed at 1x');

  const ids = new Set();
  const phases = new Set();
  for (let index = 0; index < plan.segments.length; index++) {
    const segment = plan.segments[index];
    const prefix = `segment ${index + 1}`;
    if (!sameArray(Object.keys(segment).sort(), [...TRACK_SEGMENT_FIELDS].sort()))
      out.push(`${prefix} does not use the frozen track-segment schema`);
    if (!idPattern.test(String(segment.id || ''))) out.push(`${prefix} id must be stable kebab-case`);
    if (ids.has(segment.id)) out.push(`${prefix} id ${segment.id} is duplicated`);
    ids.add(segment.id);
    if (!Number.isInteger(segment.phase) || segment.phase < 1 || segment.phase > DEFENSE_PHASES.length)
      out.push(`${prefix} phase must map to 1..${DEFENSE_PHASES.length}`);
    else phases.add(segment.phase);
    if (index && Number.isInteger(segment.phase)) {
      const previous = plan.segments[index - 1].phase;
      if (segment.phase < previous || segment.phase > previous + 1)
        out.push(`${prefix} phase mapping must be ordered without skips`);
    }
    if (!idPattern.test(String(segment.bodyZone || ''))) out.push(`${prefix} bodyZone must be kebab-case`);
    if (!Number.isFinite(segment.lengthTiles) || segment.lengthTiles <= 0)
      out.push(`${prefix} lengthTiles must be positive`);
    if (!Number.isFinite(segment.turnDeg) || Math.abs(segment.turnDeg) > 120)
      out.push(`${prefix} turnDeg must be finite and within +/-120`);
    if (!Number.isFinite(segment.riseTiles) || segment.riseTiles < 0)
      out.push(`${prefix} riseTiles must be non-negative`);
    if (!TRACK_SURFACES.includes(segment.surface)) out.push(`${prefix} surface must be exterior or interior`);
    if (!TRAVERSAL_DENSITIES.includes(segment.traversalDensity))
      out.push(`${prefix} traversalDensity is unsupported`);
    if (!Number.isInteger(segment.traversalBands) || segment.traversalBands < 2 || segment.traversalBands > 5)
      out.push(`${prefix} traversalBands must be an integer from 2..5`);
    for (const direction of ['revealAhead', 'revealBehind']) {
      if (!Number.isInteger(segment[direction]) || segment[direction] < 0 || segment[direction] > 2)
        out.push(`${prefix} ${direction} must be an integer from 0..2`);
    }
    if (segment.revealBehind > index) out.push(`${prefix} revealBehind escapes the route entry`);
    if (segment.revealAhead > plan.segments.length - index - 1)
      out.push(`${prefix} revealAhead escapes the route exit`);
    const revealLo = Math.max(0, index - segment.revealBehind);
    const revealHi = Math.min(plan.segments.length - 1, index + segment.revealAhead);
    for (let other = revealLo; other <= revealHi; other++) {
      if (plan.segments[other].phase !== segment.phase)
        out.push(`${prefix} reveal neighborhood crosses defense phase ${segment.phase}`);
    }
    if (!TRANSITION_KINDS.includes(segment.transitionKind))
      out.push(`${prefix} transitionKind is unsupported`);
    if (!Array.isArray(segment.socketEcology) || segment.socketEcology.length < 2)
      out.push(`${prefix} socketEcology needs at least two roles`);
    else {
      const roles = new Set();
      for (const role of segment.socketEcology) {
        if (!SOCKET_ECOLOGY_ROLES.includes(role)) out.push(`${prefix} socket role ${role} is unsupported`);
        if (roles.has(role)) out.push(`${prefix} socket role ${role} is duplicated`);
        roles.add(role);
      }
    }
  }

  const missing = DEFENSE_PHASES.filter((_, index) => !phases.has(index + 1));
  if (missing.length) out.push(`phase coverage missing ${missing.join(', ')}`);
  return out;
}

export function trackArchetypeReport(plan) {
  const ranges = trackSegmentRanges(plan);
  const phaseSegments = DEFENSE_PHASES.map((phase, index) => Object.freeze({
    phase,
    count: plan.segments.filter((row) => row.phase === index + 1).length,
  }));
  const surfaces = Object.freeze({
    exterior: plan.segments.filter((row) => row.surface === 'exterior').length,
    interior: plan.segments.filter((row) => row.surface === 'interior').length,
  });
  return Object.freeze({
    id: plan.id,
    segments: plan.segments.length,
    phaseSegments: Object.freeze(phaseSegments),
    surfaces,
    routeStart: ranges[0]?.s0 ?? plan.introTiles,
    routeEnd: ranges[ranges.length - 1]?.s1 ?? plan.introTiles,
    totalLengthTiles: plan.segments.reduce((sum, row) => sum + row.lengthTiles, 0),
    totalRiseTiles: plan.segments.reduce((sum, row) => sum + row.riseTiles, 0),
    netTurnDeg: plan.segments.reduce((sum, row) => sum + row.turnDeg, 0),
    minLengthTiles: Math.min(...plan.segments.map((row) => row.lengthTiles)),
    maxLengthTiles: Math.max(...plan.segments.map((row) => row.lengthTiles)),
    violations: Object.freeze(trackArchetypeViolations(plan)),
  });
}

export function wormCompatibilityReport(plan = TRACK_ARCHETYPES.WORM, tune = CURRENT_SIX_FACE_PATH) {
  const expectedTurn = tune.turnDeg * 2 * tune.turnSign;
  const expectedCorners = Array.from({ length: tune.faces }, (_, index) =>
    tune.introTiles + tune.faceTiles * (index + 1));
  const expectedBendStarts = expectedCorners.flatMap((corner) => [corner, corner + tune.chamferTiles]);
  const ranges = trackSegmentRanges(plan);
  const actualCorners = ranges.map((range) => range.s1);
  const actualBendStarts = actualCorners.flatMap((corner) => [corner, corner + plan.turnModel.chamferTiles]);
  const checks = Object.freeze({
    id: plan.id === 'worm',
    faceCount: plan.segments.length === tune.faces,
    faceLength: plan.segments.every((row) => row.lengthTiles === tune.faceTiles),
    intro: plan.introTiles === tune.introTiles,
    outro: plan.outroTiles === tune.outroTiles,
    phaseCoverage: sameArray(plan.segments.map((row) => row.phase),
      Array.from({ length: tune.faces }, (_, index) => index + 1)),
    semanticTurns: plan.segments.every((row) => row.turnDeg === expectedTurn),
    turnSteps: plan.turnModel.stepsPerCorner === 2,
    turnStepDeg: plan.turnModel.stepDeg === tune.turnDeg,
    turnSign: plan.turnModel.turnSign === tune.turnSign,
    chamfer: plan.turnModel.chamferTiles === tune.chamferTiles,
    corners: sameArray(actualCorners, expectedCorners),
    bendStarts: sameArray(actualBendStarts, expectedBendStarts),
    totalLength: plan.introTiles + plan.outroTiles +
      plan.segments.reduce((sum, row) => sum + row.lengthTiles, 0) ===
      tune.introTiles + tune.outroTiles + tune.faces * tune.faceTiles,
  });
  const failedChecks = Object.freeze(Object.entries(checks)
    .filter(([, ok]) => !ok).map(([name]) => name));
  return Object.freeze({
    ok: failedChecks.length === 0 && trackArchetypeViolations(plan).length === 0,
    checks,
    failedChecks,
    expectedCorners: Object.freeze(expectedCorners),
    actualCorners: Object.freeze(actualCorners),
    expectedBendStarts: Object.freeze(expectedBendStarts),
    actualBendStarts: Object.freeze(actualBendStarts),
    totalRouteTiles: tune.introTiles + tune.faces * tune.faceTiles + tune.outroTiles,
    semanticTurnDeg: expectedTurn,
    circuitTurnDeg: expectedTurn * tune.faces,
  });
}
