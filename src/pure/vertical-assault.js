/* ======================= VERTICAL ASSAULT ========================== */
/* Level 1's authored six-face route topology.
 *
 * The old pass placed the same rising staircase in every wave arena and left
 * the procedural tier generator to fill the rest of each face.  It satisfied
 * a route-count metric, but on screen it read as rows of interchangeable
 * scaffold.  V2 makes the whole playable strip of each face an authored
 * encounter: the deck remains the always-valid recovery route, while two
 * elevated routes split, cross and rejoin around real ladders, drop exits,
 * wall-launch ribs and defensible perches.
 *
 * Coordinates stay in the simulation's (s, y) route space. `u` is local
 * distance inside a 65-tile face; `h` is height above that face's lowest deck
 * column.  Nothing extends into the final seven-tile gate apron.  The render
 * layer continues to project this data through the ordinary Meridian helix,
 * so this is a Level 1 map change, not a new camera or a future track.       */

import { LATTICE, latticeBands, latticeFaces } from './lattice.js';

const freezeRows = (rows) => Object.freeze(rows.map((row) => Object.freeze(row)));
const freezeFace = (row) => Object.freeze({
  ...row,
  platforms: freezeRows(row.platforms),
  ladders: freezeRows(row.ladders),
  solids: freezeRows(row.solids || []),
});

/* Every face deliberately has a different screen silhouette and movement
 * question.  `key` is local to one face.  `arena` preserves the public IDs
 * consumed by the wave-gate and older proof tooling.  Existing arrival and
 * pocket platforms are referenced by the reserved keys documented below. */
export const VERTICAL_ASSAULT_FACES = Object.freeze([
  freezeFace({
    name: 'split-rib', supportFamily: 'rib', targetSpan: 10, kind: 'rib', routes: 3,
    platforms: [
      { key: 'arrival-lower', u0: 5, u1: 12, h: 4.35, role: 'arrival-lower', arrival: true },
      { key: 'arrival-upper', u0: 9, u1: 17, h: 7.35, role: 'arrival-upper' },
      { key: 'entry-step', u0: 14, u1: 21, h: 4.35, role: 'entry-switchback' },
      { key: 'mid-bridge', u0: 28, u1: 38, h: 4.35, role: 'mid-route', staging: 'intercept-mid' },
      { key: 'high-bridge', u0: 27, u1: 37, h: 7.10, role: 'high-route', staging: 'aerial-crossing' },
      { key: 'arena-low', u0: 35, u1: 45, h: 4.35, role: 'arena-ingress', staging: 'ground-entry' },
      { key: 'arena-mid', u0: 41, u1: 51, h: 7.10, role: 'arena-switchback', staging: 'defender-mid' },
      { key: 'arena-apex', u0: 47, u1: 55, h: 10, role: 'arena-apex', staging: 'defender-apex' },
      { key: 'recovery', u0: 50, u1: 58, h: 4.35, role: 'recovery-lane', recovery: true },
    ],
    ladders: [
      { from: 'arrival-lower', to: 'arrival-upper' },
      { from: 'pocket-mid', to: 'pocket-shelf' },
      { from: 'mid-bridge', to: 'high-bridge' },
      { from: 'arena-low', to: 'arena-mid', u: 42 },
      { from: 'arena-mid', to: 'arena-apex' },
    ],
    solids: [
      { key: 'split-rib-cover', u0: 43, u1: 44, h0: 4.35, h1: 6.35, role: 'cover' },
    ],
  }),
  freezeFace({
    name: 'chimney-fork', supportFamily: 'service', targetSpan: 11, kind: 'service', routes: 3,
    platforms: [
      { key: 'arrival-upper', u0: 9, u1: 18, h: 7.35, role: 'arrival-upper' },
      { key: 'chimney-low', u0: 27, u1: 38, h: 3.50, role: 'low-connector', staging: 'hound-run' },
      { key: 'chimney-left', u0: 30, u1: 40, h: 6.40, role: 'wall-launch-left', staging: 'intercept-left' },
      { key: 'chimney-right', u0: 37, u1: 47, h: 9.30, role: 'wall-launch-right', staging: 'intercept-right' },
      { key: 'arena-mid', u0: 42, u1: 53, h: 6.40, role: 'arena-ingress', arena: 'mid', staging: 'defender-mid' },
      { key: 'arena-apex', u0: 45, u1: 54, h: 11, role: 'arena-apex', staging: 'defender-apex' },
      { key: 'recovery', u0: 49, u1: 58, h: 3.50, role: 'recovery-lane', recovery: true },
    ],
    ladders: [
      { from: 'arrival-lower', to: 'arrival-upper' },
      { from: 'pocket-mid', to: 'pocket-shelf' },
      { from: 'chimney-low', to: 'chimney-left' },
      { from: 'chimney-left', to: 'chimney-right' },
      { from: 'arena-mid', to: 'arena-apex' },
    ],
    solids: [
      // Suspended ribs leave the deck recovery lane open underneath while
      // forming a real wall-launch chimney for the fast route.
      { key: 'chimney-rib-left', u0: 36, u1: 37, h0: 4.10, h1: 8.70, role: 'wall-launch' },
      { key: 'chimney-rib-right', u0: 44, u1: 45, h0: 6.90, h1: 11, role: 'wall-launch' },
    ],
  }),
  freezeFace({
    name: 'crossfire-cavity', supportFamily: 'cavity', targetSpan: 12, kind: 'organic', routes: 3,
    platforms: [
      { key: 'arrival-upper', u0: 9, u1: 18, h: 6.35, role: 'arrival-upper' },
      { key: 'cavity-low', u0: 28, u1: 40, h: 3.50, role: 'covered-low', staging: 'hound-channel' },
      { key: 'left-perch', u0: 29, u1: 39, h: 8, role: 'defensive-perch', staging: 'defender-left' },
      { key: 'center-connector', u0: 37, u1: 49, h: 5.50, role: 'central-connector', arena: 'mid', staging: 'connector-control' },
      { key: 'right-perch', u0: 44, u1: 55, h: 10, role: 'defensive-perch', arena: 'high', staging: 'defender-right' },
      { key: 'escape-shelf', u0: 47, u1: 58, h: 3.50, role: 'drop-escape', recovery: true },
      { key: 'arena-apex', u0: 50, u1: 57, h: 12, role: 'arena-apex', staging: 'aerial-apex' },
      { key: 'recovery', u0: 51, u1: 58, h: 3.50, role: 'recovery-lane', recovery: true },
    ],
    ladders: [
      { from: 'arrival-lower', to: 'arrival-upper' },
      { from: 'pocket-mid', to: 'pocket-shelf' },
      { from: 'cavity-low', to: 'center-connector', u: 37.5 },
      { from: 'center-connector', to: 'left-perch', u: 37.35 },
      { from: 'center-connector', to: 'right-perch' },
      { from: 'right-perch', to: 'arena-apex' },
    ],
    solids: [
      { key: 'cavity-baffle-left', u0: 38, u1: 39, h0: 5.50, h1: 7.20, role: 'cover' },
      { key: 'cavity-baffle-right', u0: 48, u1: 49, h0: 5.50, h1: 9.50, role: 'cover' },
    ],
  }),
  freezeFace({
    name: 'vent-stack', supportFamily: 'vent', targetSpan: 13, kind: 'service', routes: 3,
    platforms: [
      { key: 'arrival-upper', u0: 9, u1: 18, h: 7.35, role: 'arrival-upper' },
      { key: 'vent-low-left', u0: 27, u1: 38, h: 4, role: 'vent-landing', arena: 'mid', staging: 'landing-denial-low' },
      { key: 'vent-mid-right', u0: 32, u1: 43, h: 7, role: 'vent-landing', staging: 'landing-denial-mid' },
      { key: 'vent-mid-left', u0: 38, u1: 49, h: 7, role: 'vent-landing', arena: 'high', staging: 'connector-control' },
      { key: 'vent-high-right', u0: 43, u1: 54, h: 10, role: 'vent-landing', staging: 'landing-denial-high' },
      { key: 'vent-apex', u0: 49, u1: 57, h: 13, role: 'arena-apex', arena: 'perch', staging: 'defender-apex' },
      { key: 'escape-bridge', u0: 48, u1: 58, h: 7, role: 'drop-escape', recovery: true },
      { key: 'recovery', u0: 51, u1: 58, h: 4, role: 'recovery-lane', recovery: true },
    ],
    ladders: [
      { from: 'arrival-lower', to: 'arrival-upper' },
      { from: 'pocket-mid', to: 'pocket-shelf' },
      { from: 'vent-low-left', to: 'vent-mid-right' },
      { from: 'vent-mid-right', to: 'vent-mid-left' },
      { from: 'vent-mid-left', to: 'vent-high-right' },
      { from: 'vent-high-right', to: 'vent-apex' },
    ],
    solids: [
      { key: 'vent-shaft-rib', u0: 42, u1: 43, h0: 4, h1: 11.80, role: 'wall-launch' },
    ],
  }),
  freezeFace({
    name: 'kill-braid', supportFamily: 'braid', targetSpan: 14, kind: 'organic', routes: 3,
    arrivalLowerU1: 16,
    platforms: [
      { key: 'arrival-upper', u0: 9, u1: 18, h: 5.35, role: 'arrival-upper' },
      { key: 'braid-low-a', u0: 27, u1: 39, h: 2.35, role: 'low-route', arena: 'mid', staging: 'hound-run' },
      { key: 'braid-mid-a', u0: 27, u1: 37, h: 6.50, role: 'mid-route', staging: 'connector-left' },
      { key: 'braid-high-a', u0: 36, u1: 45, h: 10, role: 'high-route', staging: 'aerial-left' },
      { key: 'crossover', u0: 38, u1: 47, h: 6.50, role: 'route-crossover' },
      { key: 'braid-mid-b', u0: 39, u1: 50, h: 6.50, role: 'mid-route', arena: 'high', staging: 'connector-right' },
      { key: 'braid-high-b', u0: 43, u1: 54, h: 10, role: 'high-route', staging: 'aerial-right' },
      { key: 'braid-apex', u0: 49, u1: 57, h: 14, role: 'arena-apex', arena: 'third', staging: 'defender-apex' },
      { key: 'braid-low-b', u0: 44, u1: 56, h: 2.35, role: 'low-route', recovery: true },
      { key: 'recovery', u0: 52, u1: 58, h: 6.50, role: 'recovery-lane', recovery: true },
    ],
    ladders: [
      { from: 'arrival-lower', to: 'arrival-upper' },
      { from: 'pocket-mid', to: 'pocket-shelf' },
      { from: 'braid-low-a', to: 'braid-mid-a' },
      { from: 'braid-mid-b', to: 'braid-high-b' },
      { from: 'braid-high-b', to: 'braid-apex' },
    ],
    solids: [
      { key: 'braid-rib-left', u0: 36, u1: 37, h0: 4.35, h1: 8.10, role: 'wall-launch' },
      { key: 'braid-rib-right', u0: 47, u1: 48, h0: 6.50, h1: 11.40, role: 'wall-launch' },
    ],
  }),
  freezeFace({
    name: 'crown-roots', supportFamily: 'root', targetSpan: 15, kind: 'rib', routes: 3,
    platforms: [
      { key: 'arrival-upper', u0: 9, u1: 18, h: 7.35, role: 'arrival-upper' },
      { key: 'root-low', u0: 27, u1: 40, h: 3, role: 'low-route', arena: 'mid', staging: 'ground-assault' },
      { key: 'root-mid-left', u0: 27, u1: 38, h: 6, role: 'mid-route', staging: 'connector-left' },
      { key: 'root-high-left', u0: 32, u1: 43, h: 10, role: 'high-route', staging: 'aerial-left' },
      { key: 'root-mid-center', u0: 38, u1: 50, h: 6, role: 'route-crossover', arena: 'high', staging: 'connector-center' },
      { key: 'root-upper-cross', u0: 40, u1: 49, h: 10, role: 'upper-crossover', staging: 'aerial-center' },
      { key: 'root-high-right', u0: 44, u1: 55, h: 10, role: 'high-route', staging: 'aerial-right' },
      { key: 'root-apex', u0: 49, u1: 57, h: 15, role: 'arena-apex', arena: 'third', staging: 'crown-defender' },
      { key: 'root-mid-right', u0: 49, u1: 58, h: 6, role: 'mid-route', recovery: true },
      { key: 'root-recovery', u0: 51, u1: 58, h: 3, role: 'recovery-lane', recovery: true },
    ],
    ladders: [
      { from: 'arrival-lower', to: 'arrival-upper' },
      { from: 'pocket-mid', to: 'pocket-shelf' },
      { from: 'root-low', to: 'root-mid-left' },
      { from: 'root-mid-left', to: 'root-high-left' },
      { from: 'root-mid-center', to: 'root-upper-cross' },
      { from: 'root-high-right', to: 'root-apex' },
    ],
    solids: [
      { key: 'crown-root-left', u0: 37, u1: 38, h0: 3, h1: 8.80, role: 'wall-launch' },
      { key: 'crown-root-right', u0: 48, u1: 49, h0: 7, h1: 13.80, role: 'wall-launch' },
    ],
  }),
]);

export const VERTICAL_ASSAULT = Object.freeze({
  id: 'vertical-assault-v2',
  gateApron: 7,
  authoredStart: 4,
  maxPlatformLen: 13,
  maxLift: 5,
  spans: Object.freeze(VERTICAL_ASSAULT_FACES.map((face) => face.targetSpan)),
  kinds: Object.freeze(VERTICAL_ASSAULT_FACES.map((face) => face.kind)),
});

const round = (v) => Math.round(v * 1000) / 1000;

function faceGroundMin(groundH, face) {
  let min = Infinity;
  for (let x = face.s0; x < face.s1; x++) {
    const y = groundH[x];
    if (y > -100) min = Math.min(min, y);
  }
  return Number.isFinite(min) ? min : 2;
}

function faceForPlatform(p, faces) {
  const mid = (p.x0 + p.x1) / 2;
  return faces.find((face) => mid >= face.s0 && mid < face.s1) || null;
}

function platformAt(id, x0, x1, y, face, role, extra = {}) {
  return {
    id, x0: round(x0), x1: round(x1), y: round(y), face, role,
    assault: true,
    ...extra,
  };
}

function overlapX(a, b) {
  const x0 = Math.max(a.x0, b.x0), x1 = Math.min(a.x1, b.x1);
  if (x1 > x0) return round((x0 + x1) / 2);
  // A ladder between two close, non-overlapping ledges sits in their shared
  // jump seam. All shipped blueprint pairs overlap, but this fallback keeps a
  // future data edit deterministic rather than inventing a magic centre.
  return round((a.x1 + b.x0) / 2);
}

function makeLadder(id, lower, upper, face, kind, preferredX = null) {
  const lo = lower.y <= upper.y ? lower : upper;
  const hi = lo === lower ? upper : lower;
  return {
    id,
    x: Number.isFinite(preferredX) ? round(preferredX) : overlapX(lo, hi),
    y0: round(lo.y),
    y1: round(hi.y),
    face,
    kind,
  };
}

// Preserve one generated bridge over each raw deck chasm in an arena before
// anonymous tier rows are removed.  The bridge remains the safe low answer;
// V2's elevated routes never become mandatory merely because the seed rolled
// a five-column gap below them.
function protectFaceGapBridges(groundH, platforms, face, V) {
  const lo = Math.max(face.s0 + V.authoredStart, 0);
  const hi = Math.min(face.corner - V.gateApron, groundH.length);
  let gap0 = null;
  for (let x = lo; x <= hi; x++) {
    const gap = x < hi && groundH[x] <= -100;
    if (gap && gap0 === null) { gap0 = x; continue; }
    if (gap || gap0 === null) continue;
    let bridge = null;
    for (const p of platforms) {
      if (p.pocket || p.arrival || p.arena || p.assault) continue;
      if (p.x0 > gap0 || p.x1 < x) continue;
      if (!bridge || p.y < bridge.y) bridge = p;
    }
    if (bridge) bridge.routeBridge = true;
    gap0 = null;
  }
}

function remapArenaMetadata(oldArena, byArenaName) {
  if (!oldArena) return null;
  const tiers = oldArena.tiers.map((old) => {
    const p = byArenaName.get(old.name);
    return p ? {
      name: old.name, x0: p.x0, x1: p.x1,
      base: old.base, y: p.y, fits: true,
    } : { ...old, fits: false };
  });
  return {
    ...oldArena,
    tiers,
    platforms: [...byArenaName.values()],
  };
}

function namedExisting(platforms, id) {
  return platforms.find((p) => p.id === id) || null;
}

function registerExisting(map, key, platform, faceNo, role) {
  if (!platform) return;
  platform.face = faceNo;
  platform.role = platform.role || role;
  map.set(key, platform);
}

/* Install V2 into the generator's mutable platform array.  The destructive
 * scope is intentionally narrow: anonymous tier rows inside the six authored
 * face strips are replaced, while the deck, pockets, arrivals, named bridge
 * rows and gate aprons remain exactly where their owning systems authored
 * them.                                                                    */
export function installVerticalAssault(
  cfg,
  groundH,
  platforms,
  { pockets = [], arrivals = [], arenas = [] } = {},
  V = VERTICAL_ASSAULT,
) {
  const faces = latticeFaces(cfg);
  for (const face of faces) protectFaceGapBridges(groundH, platforms, face, V);

  // Remove the old arena rows and the anonymous procedural catwalk carpet in
  // the authored strips.  Named route bridges, arrivals and reward-pocket
  // geometry are structural and survive.
  for (let i = platforms.length - 1; i >= 0; i--) {
    const p = platforms[i];
    const face = faceForPlatform(p, faces);
    if (!face) continue;
    const inStrip = p.x1 > face.s0 + V.authoredStart && p.x0 < face.corner - V.gateApron;
    if (p.arena || (inStrip && !p.pocket && !p.arrival && !p.routeBridge)) {
      platforms.splice(i, 1);
    }
  }

  const allPlatforms = [];
  const solidRects = [];
  const ladders = [];
  const chunks = [];
  const remappedArenas = [];

  for (let index = 0; index < faces.length; index++) {
    const face = faces[index];
    const faceNo = face.face;
    const plan = VERTICAL_ASSAULT_FACES[index];
    const minY = faceGroundMin(groundH, face);
    const peakY = round(minY + plan.targetSpan);
    const facePlatforms = [];
    const faceLadders = [];
    const faceSolids = [];
    const byKey = new Map();
    const byArenaName = new Map();

    const pocket = pockets.find((row) => row.face === faceNo);
    registerExisting(byKey, 'pocket-mid', pocket && namedExisting(platforms, pocket.mid.id), faceNo, 'pocket-mid');
    registerExisting(byKey, 'pocket-shelf', pocket && namedExisting(platforms, pocket.shelf.id), faceNo, 'pocket-shelf');

    let arrivalLower = namedExisting(platforms, 'arrival-f' + faceNo);
    if (!arrivalLower) {
      const spec = plan.platforms.find((row) => row.key === 'arrival-lower');
      const fallback = spec || { u0: 5, u1: 12, h: 4.35 };
      arrivalLower = platformAt(
        'assault-f' + faceNo + '-arrival-lower',
        face.s0 + fallback.u0, face.s0 + fallback.u1,
        minY + fallback.h, faceNo, 'arrival-lower', {
          arrival: true, supportFamily: plan.supportFamily,
        },
      );
      facePlatforms.push(arrivalLower);
    } else {
      arrivalLower.face = faceNo;
      arrivalLower.role = 'arrival-lower';
      if (Number.isFinite(plan.arrivalLowerU1))
        arrivalLower.x1 = round(Math.max(arrivalLower.x1, face.s0 + plan.arrivalLowerU1));
    }
    byKey.set('arrival-lower', arrivalLower);

    for (const spec of plan.platforms) {
      if (spec.key === 'arrival-lower') continue;
      const oldArena = arenas.find((row) => row.face === faceNo);
      const oldArenaPlatform = spec.arena && oldArena
        ? oldArena.platforms.find((p) => p.id === `arena-f${faceNo}-${spec.arena}`)
        : null;
      // Arena rows were removed above; only their public ID is retained.
      const id = oldArenaPlatform ? oldArenaPlatform.id
        : spec.arena ? `arena-f${faceNo}-${spec.arena}`
          : `assault-f${faceNo}-${spec.key}`;
      const p = platformAt(
        id,
        face.s0 + spec.u0, face.s0 + spec.u1,
        Math.min(peakY, minY + spec.h), faceNo, spec.role,
        {
          route: spec.role,
          supportFamily: plan.supportFamily,
          recovery: !!spec.recovery,
          dropRejoin: spec.role === 'recovery-lane',
          arrival: !!spec.arrival,
          arena: !!spec.arena,
          staging: spec.staging || null,
        },
      );
      facePlatforms.push(p);
      byKey.set(spec.key, p);
      if (spec.arena) byArenaName.set(spec.arena, p);
    }

    // If a V2 recovery lane spans the exact anonymous bridge retained above,
    // transfer the bridge contract to the authored casting and remove the
    // duplicate altitude band.  This is not bridge deletion: the replacement
    // covers the complete old interval and remains tagged `routeBridge` for
    // the same pruning/collision proofs.
    for (let bridgeIndex = platforms.length - 1; bridgeIndex >= 0; bridgeIndex--) {
      const bridge = platforms[bridgeIndex];
      if (!bridge.routeBridge || faceForPlatform(bridge, faces)?.face !== faceNo) continue;
      const replacement = facePlatforms.find((p) =>
        p.x0 <= bridge.x0 && p.x1 >= bridge.x1 &&
        (p.recovery || p.role === 'low-route' || p.role === 'arena-ingress'));
      if (!replacement) continue;
      replacement.routeBridge = true;
      platforms.splice(bridgeIndex, 1);
    }

    const connectorRows = [];
    for (let railIndex = 0; railIndex < plan.ladders.length; railIndex++) {
      const spec = plan.ladders[railIndex];
      const from = byKey.get(spec.from), to = byKey.get(spec.to);
      if (!from || !to || Math.abs(from.y - to.y) < 0.01) continue;
      const rail = makeLadder(
        `ladder-f${faceNo}-${railIndex + 1}-${spec.from}-to-${spec.to}`,
        from, to, faceNo, plan.kind,
        Number.isFinite(spec.u) ? face.s0 + spec.u : null,
      );
      faceLadders.push(rail);
      connectorRows.push({
        id: rail.id,
        kind: 'ladder-or-jump',
        from: spec.from,
        to: spec.to,
      });
    }

    for (const spec of plan.solids) {
      const rect = {
        id: `assault-f${faceNo}-${spec.key}`,
        x0: round(face.s0 + spec.u0),
        x1: round(face.s0 + spec.u1),
        y0: round(minY + spec.h0),
        y1: round(Math.min(peakY, minY + spec.h1)),
        face: faceNo,
        role: spec.role,
        grabbable: true,
        assault: true,
      };
      if (rect.y1 > rect.y0) {
        faceSolids.push(rect);
        solidRects.push(rect);
      }
    }

    const staging = facePlatforms.filter((p) => p.staging).map((p) => ({
      id: `stage-f${faceNo}-${p.staging}`,
      role: p.staging,
      platformId: p.id,
      x: round((p.x0 + p.x1) / 2),
      y: round(p.y),
    }));
    const recovery = facePlatforms.filter((p) => p.recovery).map((p) => p.id);
    const connectors = connectorRows;

    allPlatforms.push(...facePlatforms);
    ladders.push(...faceLadders);
    chunks.push({
      id: `vertical-assault-f${faceNo}`,
      face: faceNo,
      silhouette: plan.name,
      supportFamily: plan.supportFamily,
      routeCount: plan.routes,
      x0: face.s0 + V.authoredStart,
      x1: face.corner - V.gateApron,
      minY,
      peakY,
      targetSpan: plan.targetSpan,
      platforms: facePlatforms,
      ladders: faceLadders,
      solidRects: faceSolids,
      connectors,
      staging,
      recovery,
      dropRejoin: recovery.length ? {
        id: recovery[recovery.length - 1],
        from: facePlatforms.find((p) => p.role === 'arena-apex')?.id || null,
        to: recovery[recovery.length - 1],
      } : null,
    });

    const remapped = remapArenaMetadata(
      arenas.find((row) => row.face === faceNo), byArenaName,
    );
    if (remapped) remappedArenas.push(remapped);
  }

  platforms.push(...allPlatforms);
  return {
    id: V.id,
    chunks,
    platforms: allPlatforms,
    solidRects,
    ladders,
    arenas: remappedArenas,
  };
}

/* Arithmetic report used by checks and browser telemetry. `routeMin` is the
 * conservative number of distinct surface bands in every 12-tile decision
 * window. `silhouetteSignature` makes accidental template duplication
 * observable without relying on screenshots alone.                         */
export function verticalAssaultReport(level, cfg, V = VERTICAL_ASSAULT) {
  const faces = latticeFaces(cfg);
  return faces.map((face, index) => {
    const chunk = (level.assaults || []).find((row) => row.face === face.face);
    const authored = level.platforms.filter((p) => p.assault && p.face === face.face);
    const rails = (level.ladders || []).filter((r) => r.face === face.face);
    const walls = (level.solidRects || []).filter((r) => r.assault && r.face === face.face);
    const minY = faceGroundMin(level.groundH, face);
    let maxY = minY;
    for (const p of authored) maxY = Math.max(maxY, p.y);
    for (const r of walls) maxY = Math.max(maxY, r.y1);

    const readStart = face.s0 + V.authoredStart;
    const readEnd = face.corner - V.gateApron;
    let routeMin = Infinity;
    let routeMax = 0;
    for (let s = readStart; s <= readEnd - LATTICE.lookahead; s++) {
      const count = latticeBands(level, s, cfg, LATTICE).length;
      routeMin = Math.min(routeMin, count);
      routeMax = Math.max(routeMax, count);
    }
    const signature = authored
      .map((p) => `${round(p.x0 - face.s0)}:${round(p.x1 - p.x0)}:${round(p.y - minY)}`)
      .sort()
      .join('|');

    return {
      face: face.face,
      silhouette: chunk ? chunk.silhouette : VERTICAL_ASSAULT_FACES[index].name,
      supportFamily: chunk
        ? chunk.supportFamily : VERTICAL_ASSAULT_FACES[index].supportFamily,
      targetSpan: V.spans[index],
      span: round(maxY - minY),
      peakY: round(maxY),
      platformCount: authored.length,
      maxPlatformLen: authored.reduce((m, p) => Math.max(m, p.x1 - p.x0), 0),
      connectorCount: rails.length,
      recoveryCount: chunk ? chunk.recovery.length : 0,
      stagingCount: chunk ? chunk.staging.length : 0,
      coverCount: walls.length,
      routeMin: Number.isFinite(routeMin) ? routeMin : 0,
      routeMax,
      gateApron: V.gateApron,
      silhouetteSignature: signature,
    };
  });
}
