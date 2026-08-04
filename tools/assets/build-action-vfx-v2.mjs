#!/usr/bin/env node
/* Rebuild the reviewed Hullbreaker action-VFX v2 candidate atlas from four
 * ImageGen source boards. Each conceptual source cell is cropped, trimmed,
 * fitted and centered independently: resizing a whole 4x4 board lets Lanczos
 * samples leak across a cell boundary, which is unacceptable for runtime UVs.
 *
 * This is an offline asset tool. It edits no runtime module and has no browser
 * or Three.js dependency. */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { deflateSync } from 'node:zlib';
import { alphaCensus, decodePng, histogram, readPngSize } from './lib/png.mjs';
import { checkRasterColors } from './lib/palette.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = join(root, 'assets/generated/vfx/action-vfx-v2');
const atlasFile = join(outDir, 'action-vfx-atlas-v2.png');
const manifestFile = join(outDir, 'action-vfx-v2.manifest.json');
const provenanceFile = join(outDir, 'action-vfx-v2.provenance.json');
const promptsFile = join(outDir, 'PROMPTS.md');
const work = join(tmpdir(), `hullbreaker-action-vfx-v2-${process.pid}`);
const CELL = 128;
const ATLAS = 1024;
const FIT = 116;
const ALPHA_FLOOR = 32;

mkdirSync(work, { recursive: true });
mkdirSync(outDir, { recursive: true });

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const repo = (file) => relative(root, file).replaceAll('\\', '/');
const round6 = (value) => +value.toFixed(6);

function crc32(buf) {
  if (!crc32.table) {
    crc32.table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crc32.table[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const byte of buf) c = crc32.table[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const t = Buffer.from(type);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); t.copy(out, 4); data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([t, data])), 8 + data.length);
  return out;
}

function writeRgbaPng(file, width, height, rgba) {
  const stride = width * 4;
  const scan = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1); scan[row] = 1;
    for (let x = 0; x < stride; x++) {
      const current = rgba[y * stride + x];
      const left = x >= 4 ? rgba[y * stride + x - 4] : 0;
      scan[row + 1 + x] = (current - left + 256) & 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(scan, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]));
}

const boards = [
  {
    id: 'A', offset: [0, 0], slug: 'rifle-scatter',
    chroma: 'action-vfx-v2-board-a-rifle-scatter-chroma.png',
    alpha: 'action-vfx-v2-board-a-rifle-scatter-alpha.png',
    chromaKey: '#12f813', transparentPixels: 1428560, partialPixels: 20620,
    generated: '/Users/scottmeyer/.codex/generated_images/019fcda2-7c3f-7960-a835-5758a093b96f/exec-b9e310bb-b40c-499e-86d3-9d21eff155dd.png',
  },
  {
    id: 'B', offset: [4, 0], slug: 'laser-homing',
    chroma: 'action-vfx-v2-board-b-laser-homing-chroma.png',
    alpha: 'action-vfx-v2-board-b-laser-homing-alpha.png',
    chromaKey: '#0df611', transparentPixels: 1483737, partialPixels: 23806,
    generated: '/Users/scottmeyer/.codex/generated_images/019fcda2-7c3f-7960-a835-5758a093b96f/exec-d9ddab6b-bc46-4d5a-a2a7-fb5de1985530.png',
  },
  {
    id: 'C', offset: [0, 4], slug: 'combustion-rupture',
    chroma: 'action-vfx-v2-board-c-combustion-rupture-chroma.png',
    alpha: 'action-vfx-v2-board-c-combustion-rupture-alpha.png',
    chromaKey: '#05f80b', transparentPixels: 1369156, partialPixels: 48724,
    generated: '/Users/scottmeyer/.codex/generated_images/019fcda2-7c3f-7960-a835-5758a093b96f/exec-557dac42-1f4a-4439-8219-1932f28aa237.png',
  },
  {
    id: 'D', offset: [4, 4], slug: 'meridian-crown',
    chroma: 'action-vfx-v2-board-d-meridian-crown-chroma.png',
    alpha: 'action-vfx-v2-board-d-meridian-crown-alpha.png',
    chromaKey: '#05f909', transparentPixels: 1237028, partialPixels: 28989,
    generated: '/Users/scottmeyer/.codex/generated_images/019fcda2-7c3f-7960-a835-5758a093b96f/exec-f6f49a2a-bad0-4afc-b4ce-9f41ebdf75df.png',
  },
].map((board) => ({
  ...board,
  chromaFile: join(outDir, 'source-boards', board.chroma),
  alphaFile: join(outDir, 'source-boards', board.alpha),
}));

const pivots = {
  left: [0.12, 0.5], center: [0.5, 0.5], right: [0.88, 0.5], bottom: [0.5, 0.88],
};
const def = (id, label, category, timingState, durationMs, minScreenPx = 12,
  pivot = 'center', reason = '') => ({
  id, label, category, timingState, durationMs, minScreenPx, pivot: pivots[pivot], reason,
});

// Row-major within each authored 4x4 board. The five rejected cells remain in
// the 64-cell audit atlas so future review is reproducible, but the manifest's
// production lists and runtime recommendation explicitly exclude them.
const definitions = {
  A: [
    def('r-rivet-trail', 'Driven rivet and chips', 'rifle-pin', 'fire', 120, 24, 'left'),
    def('r-seam-punch', 'Rivet plate-seam punch', 'rifle-pin', 'impact', 170),
    def('r-needle-spall', 'Machined needle spall', 'rifle-pin', 'fire', 110, 24, 'left'),
    def('r-chip-fan', 'Ejector chip fan', 'rifle-pin', 'impact', 150),
    def('r-offset-slivers', 'Offset rifle slivers', 'rifle-pin', 'fire', 120, 24, 'left'),
    def('r-bore-spall', 'Bore-spall streak', 'rifle-pin', 'impact', 150, 24, 'left'),
    def('r-collapsed-seam', 'Collapsed impact seam', 'rifle-pin', 'recovery', 260),
    def('r-spent-pin', 'Spent pin and chips', 'rifle-pin', 'spent', 620),
    def('s-triple-rake', 'Triple flechette rake', 'scatter-rake', 'fire', 130, 24, 'left'),
    def('s-five-splay', 'Five-way flechette splay', 'scatter-rake', 'fire', 140, 12, 'left'),
    def('s-step-shear', 'Stepped armor rake', 'scatter-rake', 'impact', 180),
    def('s-split-shear', 'Split central strike', 'scatter-rake', 'impact', 170),
    def('s-armor-fan', 'Armor splinter fan', 'scatter-rake', 'impact', 190),
    def('s-plate-shards', 'Torn plate shard burst', 'scatter-rake', 'impact', 190),
    def('s-rake-afterimage', 'Receding rake afterimage', 'scatter-rake', 'recovery', 250, 24, 'left'),
    def('s-spent-splinters', 'Spent scatter splinters', 'scatter-rake', 'spent', 680),
  ],
  B: [
    def('l-seam-through', 'Hairline armor through-line', 'laser-seam', 'fire', 100, 24, 'left'),
    def('l-clamped-line', 'Clamped through-line', 'laser-seam', 'fire', 120, 24, 'left'),
    def('l-convergent-line', 'Convergent double line', 'laser-seam', 'fire', 120, 24, 'left'),
    def('l-plate-pierce', 'Plate-piercing seam', 'laser-seam', 'impact', 150, 24, 'left'),
    def('l-collapsing-echo', 'Collapsing seam echoes', 'laser-seam', 'recovery', 230, 24, 'left'),
    def('l-broken-afterimage', 'Broken line afterimage', 'laser-seam', 'recovery', 230, 24, 'left'),
    def('l-heated-incision', 'Heated plate incision', 'laser-seam', 'impact', 180, 24, 'left'),
    def('l-spent-seam', 'Spent laser seam', 'laser-seam', 'spent', 460, 24, 'left'),
    def('h-vane-bracket', 'Guidance-vane bracket', 'homing-shear', 'fire', 130, 12, 'left'),
    def('h-rise-shear', 'Rising three-vane shear', 'homing-shear', 'fire', 140, 12, 'left'),
    def('h-fin-slice', 'Guidance-fin slice', 'homing-shear', 'fire', 130, 12, 'left'),
    def('h-opposed-vanes', 'Opposed vane snap', 'homing-shear', 'impact', 170, 12, 'left'),
    def('h-broken-crosscut', 'Broken guidance cross-cut', 'homing-shear', 'impact', 170, 24, 'center',
      'REJECT: at 12px the four slashes collapse into the symmetric X/star vocabulary the pack forbids.'),
    def('h-correction-kink', 'Guidance correction kink', 'homing-shear', 'fire', 140, 24, 'left'),
    def('h-vane-afterimage', 'Vane correction afterimage', 'homing-shear', 'recovery', 240, 24, 'left'),
    def('h-spent-hardware', 'Spent guidance hardware', 'homing-shear', 'spent', 560, 24, 'center',
      'REJECT: minification reads as two unrelated props rather than a single action effect.'),
  ],
  C: [
    def('f-serrated-bite', 'Serrated combustion bite', 'combustion-bite', 'impact', 180, 12, 'left'),
    def('f-ground-wedge', 'Ground-skimming pressure wedge', 'combustion-bite', 'fire', 160, 12, 'left'),
    def('f-pressure-burst', 'Sparse pressure burst', 'combustion-bite', 'impact', 170, 12, 'left'),
    def('f-plate-incision', 'Combustion plate incision', 'combustion-bite', 'impact', 190, 12, 'left'),
    def('f-cinder-trail', 'Separated directional cinders', 'combustion-bite', 'recovery', 260, 24, 'left'),
    def('f-torn-pressure-ribbon', 'Perforated pressure ribbon', 'combustion-bite', 'fire', 160, 12, 'left'),
    def('f-double-vent-wisp', 'Double gray vent wisp', 'combustion-bite', 'recovery', 330, 24, 'left',
      'REJECT: obvious smoke wisps reintroduce the soft cloud vocabulary rejected from v1.'),
    def('f-spent-cinders', 'Spent combustion cinders', 'combustion-bite', 'spent', 620),
    def('enemy-rotor-rupture', 'Wasp rotor-vane rupture', 'enemy-rupture', 'impact', 220),
    def('enemy-scute-rupture', 'Hound scute and tendon rupture', 'enemy-rupture', 'impact', 240),
    def('enemy-iris-failure', 'Turret iris-jaw failure', 'enemy-rupture', 'impact', 240),
    def('enemy-breech-fracture', 'Mortar breech fracture', 'enemy-rupture', 'impact', 240),
    def('enemy-rise-vapor', 'Split rising pressure vapor', 'enemy-rupture', 'recovery', 420, 24, 'bottom',
      'REJECT: smoke-wisp identity is atmospheric, not a strong mechanical action silhouette.'),
    def('enemy-side-vent', 'Sideways vent cough', 'enemy-rupture', 'recovery', 380, 24, 'left',
      'REJECT: smoke body collapses into a soft puff under minification.'),
    def('enemy-terminal-debris', 'Terminal bracket and cable debris', 'enemy-rupture', 'spent', 760),
    def('enemy-split-core', 'Split mechanical core', 'enemy-rupture', 'impact', 260),
  ],
  D: [
    def('meridian-clamp-snap', 'Meridian clamp snap', 'meridian-response', 'impact', 220),
    def('meridian-lock-rails', 'Converging locking rails', 'meridian-response', 'tell', 260, 12, 'left'),
    def('meridian-shutter-strike', 'Offset shutter strike', 'meridian-response', 'impact', 230),
    def('meridian-clamp-recoil', 'Clamp-jaw recoil', 'meridian-response', 'recovery', 320),
    def('meridian-vent-slat', 'Pressure vent through slats', 'meridian-response', 'impact', 220, 12, 'left'),
    def('meridian-shutter-peel', 'Armor shutters peeling open', 'meridian-response', 'impact', 260),
    def('meridian-seal-sweep', 'Emergency seal sweep', 'meridian-response', 'tell', 300, 12, 'left'),
    def('meridian-spent-louvers', 'Spent bent louvers', 'meridian-response', 'spent', 820),
    def('crown-command-packet', 'Crown command packet', 'crown-uplink', 'fire', 180, 12, 'left'),
    def('crown-packet-arrival', 'Forked packet arrival', 'crown-uplink', 'impact', 210, 12, 'left'),
    def('warden-rack-rupture', 'Warden cannon-rack rupture', 'crown-uplink', 'impact', 250),
    def('crown-interlock-failure', 'Crown interlock failure', 'crown-uplink', 'impact', 280),
    def('crown-uplink-needle', 'Discontinuous vertical uplink', 'crown-uplink', 'tell', 320, 12, 'bottom'),
    def('crown-carrier-release', 'Carrier signal release', 'crown-uplink', 'fire', 230, 12, 'left'),
    def('crown-housing-shear', 'Transmitter housing shear', 'crown-uplink', 'impact', 300),
    def('crown-uplink-afterimage', 'Sparse uplink afterimage', 'crown-uplink', 'recovery', 360, 12, 'bottom'),
  ],
};

const sourceBounds = (size) => Array.from({ length: 5 }, (_, i) => Math.round(i * size / 4));
const cellFiles = new Map();

for (const board of boards) {
  const size = readPngSize(board.alphaFile);
  if (size.width !== 1254 || size.height !== 1254 || size.colorType !== 6)
    throw new Error(`${board.id} alpha board must be 1254x1254 RGBA: ${JSON.stringify(size)}`);
  const xs = sourceBounds(size.width);
  const ys = sourceBounds(size.height);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const local = row * 4 + col;
      const globalCol = board.offset[0] + col;
      const globalRow = board.offset[1] + row;
      const file = join(work, `cell-${globalRow}-${globalCol}.png`);
      execFileSync('magick', [
        board.alphaFile,
        '-crop', `${xs[col + 1] - xs[col]}x${ys[row + 1] - ys[row]}+${xs[col]}+${ys[row]}`,
        '+repage', '-fuzz', '1%', '-trim', '+repage',
        '-filter', 'Lanczos', '-resize', `${FIT}x${FIT}>`,
        '-background', 'none', '-gravity', 'center', '-extent', `${CELL}x${CELL}`,
        file,
      ]);
      cellFiles.set(`${globalRow}:${globalCol}`, { file, board, row, col, local });
    }
  }
}

const ordered = [];
for (let row = 0; row < 8; row++)
  for (let col = 0; col < 8; col++) ordered.push(cellFiles.get(`${row}:${col}`).file);
const rawAtlas = join(work, 'action-vfx-atlas-v2-raw.png');
execFileSync('magick', [
  'montage', ...ordered, '-tile', '8x8', '-geometry', `${CELL}x${CELL}+0+0`,
  '-background', 'none', rawAtlas,
]);
execFileSync('node', [
  join(root, 'tools/assets/normalize-painted-palette.mjs'),
  '--input', rawAtlas, '--out', atlasFile, '--alpha-floor', String(ALPHA_FLOOR),
], { stdio: 'inherit' });

// The shared project normalizer recognizes all global palette roles, while
// this pack deliberately bakes only warm metal and neutral value. Remove the
// final sub-percent of cool/green/magenta edge contamination without touching
// alpha or any legal copper/ivory/charcoal pixel. Runtime tint owns those hues.
{
  const narrow = decodePng(atlasFile);
  for (let i = 0; i < narrow.rgba.length; i += 4) {
    const r = narrow.rgba[i], g = narrow.rgba[i + 1], b = narrow.rgba[i + 2];
    if (narrow.rgba[i + 3] <= ALPHA_FLOOR) continue;
    const forbidden = b > r + 12 || g > r + 12 ||
      (g > r + 14 && g > b + 8) || (r > g + 14 && b > g + 14);
    if (!forbidden) continue;
    const luma = Math.max(0, Math.min(255, Math.round(r * 0.2126 + g * 0.7152 + b * 0.0722)));
    narrow.rgba[i] = narrow.rgba[i + 1] = narrow.rgba[i + 2] = luma;
  }
  writeRgbaPng(atlasFile, narrow.width, narrow.height, narrow.rgba);
}

const atlas = decodePng(atlasFile);
if (atlas.width !== ATLAS || atlas.height !== ATLAS || atlas.colorType !== 6)
  throw new Error(`bad atlas contract: ${JSON.stringify(readPngSize(atlasFile))}`);

function boundsForCell(col, row) {
  let minX = CELL, minY = CELL, maxX = -1, maxY = -1, alphaPixels = 0;
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const i = (((row * CELL + y) * atlas.width) + col * CELL + x) * 4;
      if (atlas.rgba[i + 3] <= ALPHA_FLOOR) continue;
      alphaPixels++;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  if (!alphaPixels) throw new Error(`empty atlas cell ${col},${row}`);
  const gutter = Math.min(minX, minY, CELL - 1 - maxX, CELL - 1 - maxY);
  if (gutter < 5) throw new Error(`cell ${col},${row} has only ${gutter}px guard`);
  const pad = 2;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(CELL - 1, maxX + pad); maxY = Math.min(CELL - 1, maxY + pad);
  return { minX, minY, maxX, maxY, gutter, alphaPixels };
}

const components = [];
for (const board of boards) {
  for (let local = 0; local < 16; local++) {
    const row = Math.floor(local / 4), col = local % 4;
    const atlasCol = board.offset[0] + col, atlasRow = board.offset[1] + row;
    const d = definitions[board.id][local];
    const b = boundsForCell(atlasCol, atlasRow);
    const x = atlasCol * CELL + b.minX, y = atlasRow * CELL + b.minY;
    const width = b.maxX - b.minX + 1, height = b.maxY - b.minY + 1;
    const rejected = d.reason.startsWith('REJECT:');
    components.push({
      id: d.id,
      label: d.label,
      board: board.id,
      sourceCell: [col, row],
      atlasCell: [atlasCol, atlasRow],
      category: d.category,
      reviewStatus: rejected ? 'rejected' : 'production',
      reviewReason: rejected ? d.reason.slice('REJECT: '.length) :
        (d.minScreenPx === 12
          ? 'Strong broad/asymmetric silhouette survives the reviewed 12px proof.'
          : 'Reviewed for medium/large punctuation only; retains identity at 24–48px.'),
      screenExtentPx: { min: d.minScreenPx, max: 48 },
      timing: {
        state: d.timingState,
        durationMs: d.durationMs,
        leadMs: d.timingState === 'tell' ? d.durationMs : 0,
        peakMs: Math.round(d.durationMs * (d.timingState === 'spent' ? 0.08 : 0.28)),
        fadeStartMs: Math.round(d.durationMs * (d.timingState === 'spent' ? 0.55 : 0.62)),
      },
      pivot: d.pivot,
      direction: d.pivot === pivots.bottom ? [0, 1] : [1, 0],
      runtimeTint: d.timingState !== 'spent',
      sourceGutterPx: b.gutter,
      packedRectPx: [x, y, width, height],
      uvOrigin: 'top-left',
      uv: [round6(x / ATLAS), round6(y / ATLAS),
        round6((x + width) / ATLAS), round6((y + height) / ATLAS)],
      cellUv: [round6(atlasCol / 8), round6(atlasRow / 8),
        round6((atlasCol + 1) / 8), round6((atlasRow + 1) / 8)],
      nativeAspect: round6(width / height),
      alphaCoverage: round6(b.alphaPixels / (CELL * CELL)),
    });
  }
}

// Project-palette validation is supplemented by a narrow bake check: active
// pixels may be neutral or warm (r >= g >= b, with a small AA tolerance).
// Green/cyan/magenta remain runtime tint roles and must not be baked here.
let visibleWeight = 0, coolWeight = 0, greenWeight = 0, magentaWeight = 0;
for (let i = 0; i < atlas.rgba.length; i += 4) {
  const r = atlas.rgba[i], g = atlas.rgba[i + 1], b = atlas.rgba[i + 2], a = atlas.rgba[i + 3];
  if (a <= ALPHA_FLOOR) continue;
  const w = a / 255; visibleWeight += w;
  if (b > r + 12 || g > r + 12) coolWeight += w;
  if (g > r + 14 && g > b + 8) greenWeight += w;
  if (r > g + 14 && b > g + 14) magentaWeight += w;
}
const projectPalette = checkRasterColors(
  histogram(atlasFile, { alphaFloor: ALPHA_FLOOR, weight: 'alpha' }).colors);
const production = components.filter((entry) => entry.reviewStatus === 'production');
const rejected = components.filter((entry) => entry.reviewStatus === 'rejected');
const small = production.filter((entry) => entry.screenExtentPx.min === 12);
const medium = production.filter((entry) => entry.screenExtentPx.min === 24);
const minimumGuard = Math.min(...components.map((entry) => entry.sourceGutterPx));

const manifest = {
  schema: 'hullbreaker-action-vfx-v2',
  version: 2,
  assetOnly: true,
  runtimeIntegrated: false,
  runtime: {
    file: repo(atlasFile),
    canvas: [ATLAS, ATLAS],
    format: 'RGBA8',
    layout: [8, 8],
    cellPx: [CELL, CELL],
    gpuTextures: 1,
    estimatedGpuBytes: ATLAS * ATLAS * 4,
    uvOrigin: 'top-left',
    independentCellPacking: true,
    // Consumers address reviewed rectangles with immutable boot-built UVs;
    // they never crop/copy atlas pixels into runtime textures or canvases.
    noRuntimeCrop: true,
  },
  paletteIntent: {
    baked: ['charcoal iron', 'oxidized copper', 'warm ivory', 'neutral grayscale'],
    runtimeTintOnly: ['hot magenta', 'acid green', 'cyan', 'weapon identity colors'],
  },
  review: {
    status: 'visual-approved-asset-only',
    productionCount: production.length,
    rejectedCount: rejected.length,
    smallScaleProductionCount: small.length,
    mediumScaleProductionCount: medium.length,
    productionIds: production.map((entry) => entry.id),
    smallScaleProductionIds: small.map((entry) => entry.id),
    mediumScaleProductionIds: medium.map((entry) => entry.id),
    rejectedIds: rejected.map((entry) => entry.id),
    rule: 'Use smallScaleProductionIds at 12–23px. Fine streaks are legal only at 24–48px. Rejected smoke/prop/cross cells must never be runtime-selected.',
  },
  metrics: {
    sha256: sha256(atlasFile),
    alpha: alphaCensus(atlasFile),
    minimumTransparentGuardPx: minimumGuard,
    emptyCells: 0,
    projectPalette: {
      ok: projectPalette.ok,
      inBandMass: round6(projectPalette.inBandMass),
      offBandMass: round6(projectPalette.offBandMass),
      alienMass: round6(projectPalette.alienMass),
    },
    narrowBake: {
      coolDominantMass: round6(coolWeight / visibleWeight),
      greenDominantMass: round6(greenWeight / visibleWeight),
      magentaDominantMass: round6(magentaWeight / visibleWeight),
    },
  },
  proofs: {
    contactSheet: 'assets/generated/vfx/action-vfx-v2/action-vfx-v2-contact-sheet.png',
    screen48: 'assets/generated/vfx/action-vfx-v2/proofs/action-vfx-v2-48px-proof.png',
    screen24: 'assets/generated/vfx/action-vfx-v2/proofs/action-vfx-v2-24px-proof.png',
    screen12: 'assets/generated/vfx/action-vfx-v2/proofs/action-vfx-v2-12px-proof.png',
  },
  components,
};

const provenance = {
  schema: 'hullbreaker-action-vfx-v2-provenance',
  generatedOn: '2026-08-04',
  generationMode: 'OpenAI built-in image generation tool',
  useCase: 'stylized-concept',
  prompts: repo(promptsFile),
  promptsSha256: sha256(promptsFile),
  referencesInspected: [
    'docs/DESIGN.md', 'docs/STORY.md', 'docs/concept-art/04-six-phase-escalation.png',
    'docs/concept-art/06-enemy-form-language.png', 'docs/concept-art/10-creature-lattice-chaos.png',
    'assets/generated/vfx/meridian-defense-vfx-pack-v1.png',
    'assets/generated/projectiles/projectile-scatterbloom-flechette-candidates-v1.png',
  ],
  backgroundRemoval: {
    tool: '/Users/scottmeyer/.codex/skills/.system/imagegen/scripts/remove_chroma_key.py',
    args: ['--auto-key', 'border', '--soft-matte', '--transparent-threshold', '12',
      '--opaque-threshold', '220', '--despill'],
  },
  packing: {
    tool: repo(fileURLToPath(import.meta.url)),
    policy: `${FIT}px maximum fitted content inside each ${CELL}px cell`,
    independentCellPacking: true,
    atlasSha256: sha256(atlasFile),
  },
  boards: boards.map((board) => ({
    id: board.id,
    slug: board.slug,
    imagegenOriginal: board.generated,
    chroma: repo(board.chromaFile),
    chromaSha256: sha256(board.chromaFile),
    alpha: repo(board.alphaFile),
    alphaSha256: sha256(board.alphaFile),
    sampledChromaKey: board.chromaKey,
    removalPixels: {
      transparent: board.transparentPixels,
      partial: board.partialPixels,
      total: 1254 * 1254,
    },
    alphaCensus: alphaCensus(board.alphaFile),
    dimensions: [1254, 1254],
    cells: [4, 4],
  })),
  selection: {
    selected: production.map((entry) => entry.id),
    rejected: rejected.map((entry) => ({ id: entry.id, reason: entry.reviewReason })),
  },
};

writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(provenanceFile, `${JSON.stringify(provenance, null, 2)}\n`);
rmSync(work, { recursive: true, force: true });

console.log(JSON.stringify({
  atlas: repo(atlasFile),
  manifest: repo(manifestFile),
  provenance: repo(provenanceFile),
  components: components.length,
  production: production.length,
  smallScale: small.length,
  mediumScale: medium.length,
  rejected: rejected.map((entry) => entry.id),
  minimumGuardPx: minimumGuard,
  alpha: manifest.metrics.alpha,
  palette: manifest.metrics,
}, null, 2));
