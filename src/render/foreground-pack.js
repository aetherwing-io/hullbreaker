/* =============== MERIDIAN FOREGROUND CONTENT PACK =============== */
/* Four reviewed 4x4 source libraries are offline-packed into one resident
 * 8x8 atlas. Runtime never requests a source sheet and never manufactures a
 * texture. Cells are opaque INLAYS: level.js clips their useful interior into
 * real recessed boxes whose v4 rims/gussets/sockets own silhouette, depth and
 * contact shadow. Full painted frames are reserved for actual deep service
 * apertures. Ambient cells have no emissive path; action state owns glow. */

import { IS_G1, QUERY } from '../mode.js';
import { awaitPreloads, preloadTexture } from './preload.js';
import { FOREGROUND_ATLAS_COMPONENTS } from './foreground-components.js';
import { FOREGROUND_PACK_SOURCE } from './foreground-pack-source.js';

const SHEET_ORIGIN = Object.freeze({
  A: Object.freeze([0, 0]),
  B: Object.freeze([4, 0]),
  C: Object.freeze([0, 4]),
  D: Object.freeze([4, 4]),
});

const specByCell = new Map(FOREGROUND_ATLAS_COMPONENTS.map((entry) =>
  [`${entry.sheet}:${entry.localIndex}`, entry]));

function cell(sheet, localIndex) {
  const origin = SHEET_ORIGIN[sheet];
  const col = origin[0] + localIndex % 4;
  const row = origin[1] + Math.floor(localIndex / 4);
  const spec = specByCell.get(`${sheet}:${localIndex}`);
  if (!spec) throw new Error(`missing foreground component metadata ${sheet}:${localIndex}`);
  return Object.freeze({
    ...spec, col, row, index: row * 8 + col,
  });
}

const allCells = [];
for (let i = 0; i < 16; i++) allCells.push(cell('A', i));
for (let i = 0; i < 16; i++) allCells.push(cell('B', i));
for (let i = 0; i < 16; i++) allCells.push(cell('C', i));
for (let i = 0; i < 16; i++) allCells.push(cell('D', i));
allCells.sort((a, b) => a.index - b.index);

export const FOREGROUND_PACK = Object.freeze({
  ...FOREGROUND_PACK_SOURCE,
  grid: Object.freeze([8, 8]),
  cellSize: 256,
  uvGuardPx: 6,
  cells: Object.freeze(allCells),
});

const bySheetLocal = new Map(allCells.map((entry) => [`${entry.sheet}:${entry.localIndex}`, entry]));
const pick = (sheet, values) => Object.freeze(values.map((index) =>
  bySheetLocal.get(`${sheet}:${index}`)));
const ROLE_CELLS = Object.freeze({
  surfaceCold: pick('A', [0, 1, 2, 3, 8, 10, 11, 12, 13]),
  surfaceWarm: pick('A', [4, 5, 6, 7, 14, 15]),
  surfaceWear: pick('A', [12, 13, 14, 15]),
  serviceVent: pick('B', [0, 1, 7, 9]),
  serviceInspect: pick('B', [2, 8, 13, 14, 15]),
  serviceConduit: pick('B', [3, 6, 10, 11]),
  structCatwalk: pick('C', [0, 1, 2, 3]),
  structLadder: pick('C', [4, 5, 6, 7]),
  resource: pick('C', [8, 9, 10, 11, 12, 13, 14, 15]),
  observeWake: pick('D', [0, 1, 2, 3]),
  interceptLock: pick('D', [4, 5]),
  containBrace: pick('D', [6, 7]),
  quarantineSeal: pick('D', [8, 9, 10]),
  sterilizePower: pick('D', [11]),
  scuttleDamage: pick('D', [12, 13, 14, 15]),
});

function hash(seed) {
  let value = (Math.trunc(seed) ^ 0x9e3779b9) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return (value ^ (value >>> 15)) >>> 0;
}

export function foregroundPackCell(role, seed) {
  const choices = ROLE_CELLS[role] || ROLE_CELLS.surfaceCold;
  return choices[hash(seed) % choices.length];
}

export function foregroundPackTransform(entryCell, seed) {
  const choice = hash(seed ^ (entryCell.index * 0x45d9f3b));
  const rotations = entryCell.transforms.rotations;
  return Object.freeze({
    mirrorX: entryCell.transforms.mirrorX && !!(choice & 1),
    quarterTurns: rotations[(choice >>> 1) % rotations.length],
  });
}

export function foregroundPackRoles() {
  return Object.fromEntries(Object.entries(ROLE_CELLS).map(([role, cells]) =>
    [role, cells.map((entry) => entry.index)]));
}

export const FOREGROUND_PACK_ON = IS_G1 && QUERY.get('world') !== '0' &&
  QUERY.get('pack') !== '0';
const clock = () => globalThis.performance?.now?.() ?? Date.now();
const startedAt = clock();
const request = FOREGROUND_PACK_ON
  ? preloadTexture(new URL(FOREGROUND_PACK.file, import.meta.url).href, { anisotropy: 8 })
  : null;

await awaitPreloads();

const entry = request ? await request : null;
const image = entry?.tex?.image;
const width = image && (image.naturalWidth || image.videoWidth || image.width);
const height = image && (image.naturalHeight || image.videoHeight || image.height);
const dimensionsReady = width === FOREGROUND_PACK.canvas[0] &&
  height === FOREGROUND_PACK.canvas[1];
const ready = !!entry && entry.state === 'ready' && !!entry.tex && dimensionsReady;
if (entry && !ready) {
  console.warn('HULLBREAKER art: foreground content atlas unavailable (' +
    (entry.error || (!dimensionsReady ? `dimensions ${width || 0}x${height || 0}` : entry.state)) +
    ') -- structural v4 geometry remains intact.');
}

const used = new Set();
export function noteForegroundPackCell(entryCell) {
  if (entryCell) used.add(entryCell.index);
}

export const FOREGROUND_PACK_SLOT = Object.freeze({
  state: FOREGROUND_PACK_ON ? (ready ? 'ready' : 'failed') : 'off',
  tex: ready ? entry.tex : null,
  error: entry && !ready ? (entry.error || `dimensions ${width || 0}x${height || 0}`) : null,
  requests: request ? 1 : 0,
  choices: allCells.length,
  gpuTextures: ready ? 1 : 0,
  emissive: false,
  preloadMs: request ? Math.round((clock() - startedAt) * 10) / 10 : null,
  gateMs: entry?.ms ?? null,
  settledBeforeConsumer: true,
});

export function foregroundPackStats() {
  const { tex: _tex, ...slot } = FOREGROUND_PACK_SLOT;
  return {
    ...slot,
    cellsUsed: used.size,
    usedIndices: [...used].sort((a, b) => a - b),
    roles: foregroundPackRoles(),
  };
}

if (typeof globalThis !== 'undefined') globalThis.__HB_FOREGROUND_PACK = foregroundPackStats;
