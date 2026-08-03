/* ================= PAINTED MERIDIAN MUTATION PARTS ================= */
/* Enemy genomes are sim-side recipes; this module is their optional painted
 * render vocabulary. One 4x2 atlas supplies a physical bolt-on silhouette for
 * every gene, so a three-gene enemy is still one base sprite plus at most three
 * small planes -- no generated texture churn and no per-enemy asset requests.
 *
 * Loading follows the same contract as the hostile bodies: the atlas is
 * resident before frame one or this module returns null and hostiles.js keeps
 * its manufactured-geometry fallback. The sim cannot observe which path drew.
 */

import * as THREE from 'three';
import { QUERY } from '../mode.js';
import { awaitPreloads, preloadTexture } from './preload.js';
import { spritesEnabled } from './sprite-table.js';

export const GENOME_PART_ATLAS = Object.freeze({
  file: '../../assets/generated/enemy-parts/meridian-mutation-atlas-v1.png',
  canvas: Object.freeze([1024, 512]),
  cell: Object.freeze([256, 256]),
});

// Fixed ImageGen-authored order. Keeping it declarative lets the renderer and
// visual probes ask for a gene by name without duplicating crop arithmetic.
export const GENOME_PART_CELLS = Object.freeze({
  BULWARK: Object.freeze([0, 0]),
  VAULT: Object.freeze([1, 0]),
  TWINSTRIKE: Object.freeze([2, 0]),
  SALVO: Object.freeze([3, 0]),
  RELAY: Object.freeze([0, 1]),
  PINCER: Object.freeze([1, 1]),
  AEGIS: Object.freeze([2, 1]),
  BACKLASH: Object.freeze([3, 1]),
});

// The paintings were authored on a nominal 256px grid, but their useful ink
// is not itself a square cell. In particular TWINSTRIKE begins three pixels
// before its nominal column, so sampling the hard grid clipped the rear vane;
// very faint pixels from that vane could also leak into VAULT's crop under
// linear filtering. These top-left-origin source rectangles are measured from
// the keyed runtime atlas (opaque component plus a six-pixel transparent
// guard). The matching plane keeps rect/256 world dimensions, so this fixes
// crop/bleed without changing any module's play-scale footprint.
export const GENOME_PART_RECTS = Object.freeze({
  BULWARK:    Object.freeze([33, 40, 182, 192]),
  VAULT:      Object.freeze([262, 38, 198, 192]),
  TWINSTRIKE: Object.freeze([503, 61, 253, 161]),
  SALVO:      Object.freeze([782, 39, 216, 194]),
  RELAY:      Object.freeze([29, 282, 175, 192]),
  PINCER:     Object.freeze([258, 274, 233, 196]),
  AEGIS:      Object.freeze([531, 281, 183, 197]),
  BACKLASH:   Object.freeze([773, 288, 217, 176]),
});

const enabled = spritesEnabled(QUERY.get('sprites'));
const clock = () => globalThis.performance?.now?.() ?? Date.now();
const preloadStartedAt = clock();
let preloadReadyAt = null;
let requestCount = 0;
const slot = {
  state: enabled ? 'pending' : 'off',
  tex: null,
  error: null,
};

if (enabled) {
  requestCount++;
  preloadTexture(new URL(GENOME_PART_ATLAS.file, import.meta.url).href)
    .then((entry) => {
      preloadReadyAt = clock();
      if (entry.state === 'ready') {
        slot.tex = entry.tex;
        slot.state = 'ready';
      } else {
        slot.state = 'failed';
        slot.error = entry.error || entry.state;
        console.warn('HULLBREAKER art: painted Meridian mutation atlas did not load (' +
          slot.error + ') -- drawing the hard-surface module fallback.');
      }
    });
}

await awaitPreloads();

const geometries = new Map();

function cellGeometry(gene) {
  let geo = geometries.get(gene);
  if (geo) return geo;
  const rect = GENOME_PART_RECTS[gene];
  if (!rect) return null;
  const [x, y, w, h] = rect;
  const [canvasW, canvasH] = GENOME_PART_ATLAS.canvas;
  const [cellW, cellH] = GENOME_PART_ATLAS.cell;
  geo = new THREE.PlaneGeometry(w / cellW, h / cellH);
  const u0 = x / canvasW;
  const u1 = (x + w) / canvasW;
  // Texture UVs rise from the bottom; measured atlas rectangles rise from top.
  const v0 = 1 - (y + h) / canvasH;
  const v1 = 1 - y / canvasH;
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, u0 + uv.getX(i) * (u1 - u0),
      v0 + uv.getY(i) * (v1 - v0));
  }
  uv.needsUpdate = true;
  geometries.set(gene, geo);
  return geo;
}

export function paintedGenomePart(gene) {
  if (slot.state !== 'ready' || !slot.tex) return null;
  const geometry = cellGeometry(gene);
  if (!geometry) return null;
  return { texture: slot.tex, geometry };
}

export function paintedGenomePartMaterial() {
  if (slot.state !== 'ready' || !slot.tex) return null;
  return new THREE.MeshStandardMaterial({
    map: slot.tex,
    // A low whole-sprite emissive response preserves the painted energy cores
    // without turning orange plates into additive UI. hostiles.js may still
    // pulse emissiveIntensity when the matching behavior is actually armed.
    emissiveMap: slot.tex,
    emissive: 0xffffff,
    emissiveIntensity: 0.045,
    metalness: 0.48,
    roughness: 0.42,
    transparent: true,
    opacity: 0,
    alphaTest: 0.025,
    depthWrite: true,
    side: THREE.DoubleSide,
    forceSinglePass: true,
    fog: false,
  });
}

export function genomePartSnapshot() {
  return {
    state: slot.state,
    file: GENOME_PART_ATLAS.file,
    error: slot.error,
    cells: Object.keys(GENOME_PART_CELLS),
    rects: GENOME_PART_RECTS,
    requests: requestCount,
    preloadMs: preloadReadyAt == null ? null :
      Math.round((preloadReadyAt - preloadStartedAt) * 10) / 10,
  };
}

if (typeof window !== 'undefined') window.__HB_GENOME_PARTS = genomePartSnapshot;
