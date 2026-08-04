/* =============== MERIDIAN FOREGROUND COMPONENT VOCABULARY ===============
 * This module is deliberately renderer-agnostic. It describes what a part IS
 * before level.js decides how to draw it: native visible bounds, legal
 * transforms, attachment semantics, depth ownership, defense-state range and
 * rarity. The square atlas is only storage; these records prevent storage
 * cells from becoming square cards in the world. */

import {
  MERIDIAN_DEFENSE_STATES, meridianResponsePlan,
} from '../pure/meridian-response.js';
import {
  FOREGROUND_CUTOUT_COMPONENTS,
} from './foreground-component-spec.generated.js';

export { MERIDIAN_DEFENSE_STATES };
export { FOREGROUND_CUTOUT_COMPONENTS };

const A_NAMES = Object.freeze([
  'forged-teal-plate', 'overlapping-teal-scutes', 'welded-teal-fascia', 'ribbed-hull-skin',
  'oxidized-route-fascia', 'riveted-rust-armor', 'battered-rust-overlap', 'integrated-rust-grate',
  'hex-reinforcement', 'wide-cable-channel', 'pressure-rib-panel', 'broad-vented-armor',
  'impact-pitted-teal', 'oil-streaked-fascia', 'peeled-oxidized-paint', 'heat-scorched-skin',
]);
const B_NAMES = Object.freeze([
  'ventilation-throat', 'heavy-louver-bank', 'inspection-cavity', 'conduit-manifold',
  'grate-girder-junction', 'ladder-service-bay', 'armored-cable-bank', 'machine-ribs',
  'pressure-hatch', 'exhaust-throat', 'coolant-coil', 'hydraulic-manifold',
  'broken-guard-frame', 'service-cassette', 'pressure-collar', 'armored-junction',
]);
const C_NAMES = Object.freeze([
  'deck-fascia-insert', 'aperture-gusset', 'i-beam-junction', 'grate-bridge-socket',
  'lower-ladder-socket', 'upper-ladder-socket', 'guard-anchor', 'broken-guard-socket',
  'broad-cable-saddle', 'paired-pipe-clamps', 'branching-conduit', 'sensor-shroud',
  'coolant-reservoir', 'pressure-cylinder-rack', 'service-locker', 'hoist-chain-socket',
]);
const D_NAMES = Object.freeze([
  'observe-sensor-lid', 'observe-diagnostic-shutter', 'observe-scan-iris', 'observe-wake-relay',
  'intercept-route-clamp', 'intercept-lock-track', 'contain-pressure-brace', 'contain-defense-socket',
  'quarantine-bulkhead-seal', 'quarantine-landing-denial', 'quarantine-purge-vent',
  'sterilize-power-junction', 'scuttle-overdriven-clamp', 'scuttle-sheared-scutes',
  'scuttle-controlled-excision', 'scuttle-spent-purge-scar',
]);

const anchor = (name, x = 0.5, y = 0.5) => Object.freeze({ name, x, y });
const socket = (kind, x = 0.5, y = 0.5) => Object.freeze({ kind, x, y });
const transform = (stretchAxes, mirrorX = false, rotations = [0]) => Object.freeze({
  stretchAxes: Object.freeze(stretchAxes), mirrorX,
  rotations: Object.freeze(rotations),
});

function atlasSpec(sheet, localIndex, name, options) {
  return Object.freeze({
    id: `atlas-${sheet.toLowerCase()}-${String(localIndex).padStart(2, '0')}-${name}`,
    renderKind: 'atlas', sheet, localIndex, name,
    category: options.category,
    nativeAspect: options.nativeAspect ?? 1,
    trimRectPx: Object.freeze(options.trimRectPx || [16, 16, 240, 240]),
    transforms: options.transforms,
    anchors: Object.freeze(options.anchors),
    sockets: Object.freeze(options.sockets || []),
    depthBand: options.depthBand,
    phaseRange: Object.freeze(options.phaseRange || [0, 5]),
    rarity: options.rarity ?? 1,
    state: options.state || null,
    stateHooks: Object.freeze(options.stateHooks || ['dormant']),
    gameplayRole: options.gameplayRole || 'surface-readability',
    emissive: false,
  });
}

const atlas = [];
for (let i = 0; i < A_NAMES.length; i++) atlas.push(atlasSpec('A', i, A_NAMES[i], {
  category: i < 12 ? 'material-fill' : 'material-wear',
  nativeAspect: [1.8, 1.65, 2.1, 1.9, 1.75, 1.55, 1.7, 1.6,
    1.45, 2.2, 1.7, 1.8, 1.55, 1.9, 1.6, 1.75][i],
  trimRectPx: [20, 20, 236, 236],
  transforms: transform(['x', 'y'], true, [0, 2]),
  anchors: [anchor('surface-center')], depthBand: 'skin',
  rarity: i < 12 ? 4 : 2,
}));
for (let i = 0; i < B_NAMES.length; i++) atlas.push(atlasSpec('B', i, B_NAMES[i], {
  category: 'service-organ', trimRectPx: [10, 10, 246, 246],
  transforms: transform([], i === 2 || i === 3 || i === 6, [0]),
  anchors: [anchor('aperture-center')],
  sockets: [socket(i % 3 === 0 ? 'conduit' : 'service')],
  depthBand: 'recessed', rarity: 1.25,
  gameplayRole: i === 2 || i === 8 ? 'cover-read' : 'service-landmark',
}));
for (let i = 0; i < C_NAMES.length; i++) {
  const category = i < 4 ? 'structural-socket' : i < 8 ? 'traversal-socket' :
    i < 12 ? 'conduit-resource' : 'service-resource';
  const gameplayRole = i < 4 ? 'load-path-read' : i < 8 ? 'route-socket' :
    i < 12 ? 'hazard-socket' : 'resource-landmark';
  atlas.push(atlasSpec('C', i, C_NAMES[i], {
    category, trimRectPx: [14, 14, 242, 242],
    transforms: transform([], i === 0 || i === 1 || i >= 8, [0]),
    anchors: [anchor(i < 8 ? 'load-junction' : 'resource-center')],
    sockets: [socket(i < 8 ? 'traversal' : i < 12 ? 'conduit' : 'resource')],
    depthBand: i < 8 ? 'proud' : 'recessed', rarity: 0.8,
    gameplayRole,
  }));
}

const D_STATE = [
  'observe', 'observe', 'observe', 'observe',
  'intercept', 'intercept', 'contain', 'contain',
  'quarantine', 'quarantine', 'quarantine', 'sterilize',
  'scuttle', 'scuttle', 'scuttle', 'scuttle',
];
for (let i = 0; i < D_NAMES.length; i++) {
  const state = D_STATE[i];
  const phase = MERIDIAN_DEFENSE_STATES.indexOf(state);
  atlas.push(atlasSpec('D', i, D_NAMES[i], {
    category: phase === 5 ? 'scuttle-damage' : 'defense-state',
    trimRectPx: [24, 24, 232, 232],
    transforms: transform([], i === 3 || i === 4 || i === 5 || i >= 12, [0]),
    anchors: [anchor('defense-mount')],
    sockets: [socket(i === 9 ? 'landing-denial' : i === 10 ? 'purge' :
      i === 11 ? 'kill-lattice' : i >= 12 ? 'rupture' : 'defense')],
    depthBand: i >= 12 ? 'broken-skin' : 'proud', phaseRange: [phase, 5],
    rarity: phase === 5 ? 0.5 : 0.7, state,
    stateHooks: phase === 0 ? ['dormant', 'armed'] : phase === 5 ? ['active', 'spent', 'damaged'] :
      ['dormant', 'armed', 'active'],
    gameplayRole: i === 9 ? 'landing-denial-tell' : i === 10 ? 'purge-tell' :
      i === 11 ? 'kill-lattice-tell' : i >= 12 ? 'route-damage-read' : 'defense-wake-tell',
  }));
}

export const FOREGROUND_ATLAS_COMPONENTS = Object.freeze(atlas);

function procedural(id, category, renderKind, nativeAspect, options = {}) {
  return Object.freeze({
    id, name: id, category, renderKind, nativeAspect,
    trimRectPx: null,
    transforms: transform(options.stretchAxes || [], options.mirrorX || false,
      options.rotations || [0]),
    anchors: Object.freeze(options.anchors || [anchor('structure')]),
    sockets: Object.freeze(options.sockets || []),
    depthBand: options.depthBand || 'proud',
    phaseRange: Object.freeze(options.phaseRange || [0, 5]),
    rarity: options.rarity ?? 1, state: options.state || null,
    stateHooks: Object.freeze(options.stateHooks || ['dormant']),
    gameplayRole: options.gameplayRole || 'structure-read', emissive: false,
  });
}

export const FOREGROUND_PROCEDURAL_COMPONENTS = Object.freeze([
  procedural('aperture-housing', 'service-organ', 'box', 1,
    { anchors: [anchor('aperture-center')], depthBand: 'recessed' }),
]);

const byId = new Map([
  ...FOREGROUND_ATLAS_COMPONENTS, ...FOREGROUND_CUTOUT_COMPONENTS,
  ...FOREGROUND_PROCEDURAL_COMPONENTS,
].map((entry) => [entry.id, entry]));
export function foregroundComponentById(id) { return byId.get(id) || null; }

function hash(seed) {
  let value = (Math.trunc(seed) ^ 0x9e3779b9) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return (value ^ (value >>> 15)) >>> 0;
}

export function foregroundCompositionForModule(phase, ordinal, pattern) {
  const state = MERIDIAN_DEFENSE_STATES[Math.max(0, Math.min(5, phase))];
  const seed = hash(ordinal * 131 + phase * 977 + pattern * 37);
  const surfaceRole = pattern === 3 ? 'surfaceWarm' :
    phase >= 2 && pattern === 2 ? 'surfaceWear' : 'surfaceCold';
  let apertureRole = null;
  if (ordinal % 9 === 5) apertureRole = 'resource';
  else if (pattern === 0 && ordinal % 3 === 0) apertureRole = 'serviceVent';
  else if (pattern === 1 && ordinal % 4 === 1) apertureRole = 'serviceConduit';
  else if (pattern === 2 && ordinal % 4 === 2) apertureRole = 'serviceInspect';
  else if (pattern === 4 && ordinal % 7 === 4) apertureRole = 'serviceConduit';

  const response = meridianResponsePlan(phase, ordinal, pattern);
  const defenseChoices = [
    ['observe-sensor-hood', 'observe-shutter-blade', 'observe-scan-iris', 'observe-wake-relay'],
    ['intercept-route-clamp', 'intercept-lock-rail'],
    ['contain-pressure-brace', 'contain-defense-socket'],
    ['quarantine-bulkhead-seal', 'quarantine-denial-teeth', 'quarantine-purge-nozzle'],
    ['sterilize-power-junction'],
    ['scuttle-overdriven-clamp', 'scuttle-exposed-ribs', 'scuttle-severed-conduit',
      'scuttle-spent-purge-ring'],
  ];
  let defenseShapeId = response.active ?
    defenseChoices[phase][seed % defenseChoices[phase].length] : null;
  // Scuttle still shows committed Sterilize hardware among the self-damage;
  // the response accumulates instead of swapping one wallpaper for another.
  if (phase === 5 && response.socketKind === 'defense')
    defenseShapeId = 'sterilize-power-junction';

  const shapeIds = [
    ['scute-edge', 'pressure-pipe'],
    ['route-cap-long', 'cable-bundle'],
    ['i-girder', 'conduit-tee'],
    ['cross-brace', 'route-cap-long'],
    ['scute-edge', 'armor-shoulder'],
  ][pattern];
  return Object.freeze({
    state, seed, surfaceRole, apertureRole, defenseShapeId, response,
    shapeIds: Object.freeze(shapeIds),
  });
}

export function foregroundComponentCatalogStats() {
  const all = [...FOREGROUND_ATLAS_COMPONENTS, ...FOREGROUND_CUTOUT_COMPONENTS,
    ...FOREGROUND_PROCEDURAL_COMPONENTS];
  const categories = Object.create(null);
  for (const entry of all) categories[entry.category] = (categories[entry.category] || 0) + 1;
  return {
    total: all.length,
    atlas: FOREGROUND_ATLAS_COMPONENTS.length,
    cutout: FOREGROUND_CUTOUT_COMPONENTS.length,
    procedural: FOREGROUND_PROCEDURAL_COMPONENTS.length,
    categories,
    emissiveDefaults: all.filter((entry) => entry.emissive).length,
  };
}

if (typeof globalThis !== 'undefined') {
  globalThis.__HB_FOREGROUND_COMPONENT_CATALOG = foregroundComponentCatalogStats;
}
