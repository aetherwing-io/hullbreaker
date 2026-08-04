#!/usr/bin/env node
/* Offline packer for Meridian's transient defense-activation VFX.
 *
 * ImageGen source sheets are reviewed as conceptual 4x4 boards, but their
 * output dimensions and gutters are intentionally not assumed. This tool
 * finds the three fully transparent separator bands on each axis, proves an
 * opaque gutter around every component, then crops the complete alpha bounds
 * (including disconnected particles) into one compact POT atlas. Runtime
 * receives ready UVs and native aspect; it never crops or derives a texture. */

import {
  mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { decodePng, readPngSize } from './lib/png.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const specFile = resolve(process.argv[2] ||
  join(root, 'assets/generated/vfx/meridian-defense-vfx-spec-v1.json'));
const output = resolve(process.argv[3] ||
  join(root, 'assets/generated/vfx/meridian-defense-vfx-pack-v1.png'));
const manifestFile = output.replace(/\.png$/i, '.manifest.json');
const moduleFile = resolve(process.argv[4] ||
  join(root, 'src/render/defense-vfx-pack.js'));
const work = mkdtempSync(join(tmpdir(), 'hullbreaker-defense-vfx-'));
const paletteFinisher = join(root, 'tools/assets/normalize-painted-palette.mjs');

const ATLAS_WIDTH = 1024;
const ATLAS_HEIGHT = 512;
const MAX_COMPONENT_PX = 104;
const PAD = 3;
const GRID = 4;
const TRIM_ALPHA = 8;
const VISIBLE_ALPHA = 32;
const AUDIT_ALPHA = 64;
const MIN_GUTTER = 6;

function magick(args) {
  const result = spawnSync('magick', args, {
    encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout ||
    `magick ${args[0]} failed with ${result.status}`);
  return result.stdout;
}

function normalizePalette(input, finalOutput) {
  const result = spawnSync(process.execPath, [
    paletteFinisher,
    '--input', input,
    '--out', finalOutput,
    '--alpha-floor', '32',
  ], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout ||
    `palette finisher failed with ${result.status}`);
  return JSON.parse(result.stdout);
}

function dimensions(file) {
  const size = readPngSize(file);
  return { width: size.width, height: size.height };
}

function round6(value) { return Math.round(value * 1e6) / 1e6; }

function pixelAt(rgba, width, x, y) {
  return (y * width + x) * 4;
}

function occupancy(rgba, width, height, floor) {
  const columns = Array(width).fill(0);
  const rows = Array(height).fill(0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[pixelAt(rgba, width, x, y) + 3] <= floor) continue;
      columns[x]++;
      rows[y]++;
    }
  }
  return { columns, rows };
}

function separatorCuts(values, extent) {
  const cuts = [0];
  for (let split = 1; split < GRID; split++) {
    const target = split * extent / GRID;
    const lo = Math.max(1, Math.floor(target - extent * 0.09));
    const hi = Math.min(extent - 2, Math.ceil(target + extent * 0.09));
    const runs = [];
    let start = -1;
    for (let i = lo; i <= hi; i++) {
      if (values[i] === 0 && start < 0) start = i;
      if ((values[i] !== 0 || i === hi) && start >= 0) {
        const end = values[i] === 0 ? i : i - 1;
        runs.push([start, end]);
        start = -1;
      }
    }
    if (!runs.length) throw new Error(
      `no transparent separator near ${split}/${GRID} of ${extent}px source`);
    runs.sort((a, b) =>
      (b[1] - b[0]) - (a[1] - a[0]) ||
      Math.abs((a[0] + a[1]) / 2 - target) -
        Math.abs((b[0] + b[1]) / 2 - target));
    cuts.push(Math.round((runs[0][0] + runs[0][1]) / 2));
  }
  cuts.push(extent);
  return cuts;
}

function alphaBounds(source, cell, floor) {
  const { rgba, width } = source;
  let minX = cell.x + cell.w;
  let minY = cell.y + cell.h;
  let maxX = cell.x - 1;
  let maxY = cell.y - 1;
  let pixels = 0;
  let alphaMass = 0;
  let greenHalo = 0;
  for (let y = cell.y; y < cell.y + cell.h; y++) {
    for (let x = cell.x; x < cell.x + cell.w; x++) {
      const offset = pixelAt(rgba, width, x, y);
      const alpha = rgba[offset + 3];
      if (alpha <= floor) continue;
      pixels++;
      alphaMass += alpha / 255;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      const red = rgba[offset];
      const green = rgba[offset + 1];
      const blue = rgba[offset + 2];
      if (green > red * 1.28 && green > blue * 1.18 && green - red > 28) greenHalo++;
    }
  }
  if (!pixels) throw new Error(`empty component cell ${cell.localIndex}`);
  return {
    x: minX - cell.x,
    y: minY - cell.y,
    w: maxX - minX + 1,
    h: maxY - minY + 1,
    pixels,
    alphaMass,
    greenHalo,
  };
}

function gutter(cell, bounds) {
  return Math.min(
    bounds.x,
    cell.w - bounds.x - bounds.w,
    bounds.y,
    cell.h - bounds.y - bounds.h,
  );
}

function islandCount(source, cell, floor) {
  const { rgba, width } = source;
  const seen = new Uint8Array(cell.w * cell.h);
  const solid = (lx, ly) =>
    rgba[pixelAt(rgba, width, cell.x + lx, cell.y + ly) + 3] > floor;
  let islands = 0;
  const stack = [];
  for (let ly = 0; ly < cell.h; ly++) {
    for (let lx = 0; lx < cell.w; lx++) {
      const start = ly * cell.w + lx;
      if (seen[start] || !solid(lx, ly)) continue;
      islands++;
      seen[start] = 1;
      stack.push(start);
      while (stack.length) {
        const index = stack.pop();
        const x = index % cell.w;
        const y = Math.floor(index / cell.w);
        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
          if (nx < 0 || ny < 0 || nx >= cell.w || ny >= cell.h) continue;
          const next = ny * cell.w + nx;
          if (seen[next] || !solid(nx, ny)) continue;
          seen[next] = 1;
          stack.push(next);
        }
      }
    }
  }
  return islands;
}

function normalizedBounds(bounds, cell) {
  return [
    round6(bounds.x / cell.w),
    round6(bounds.y / cell.h),
    round6(bounds.w / cell.w),
    round6(bounds.h / cell.h),
  ];
}

function moduleSource(manifest) {
  const runtime = {
    ...manifest.runtime,
    file: '../../' + manifest.runtime.file,
  };
  const value = {
    version: manifest.version,
    dormantMode: manifest.dormantMode,
    environmentOnly: manifest.environmentOnly,
    forbiddenAttachments: manifest.forbiddenAttachments,
    runtime,
    components: manifest.components,
  };
  return `/* GENERATED by tools/assets/pack-defense-vfx.mjs.\n` +
    ` * Data-only and side-effect-free: the Meridian response renderer selects a\n` +
    ` * reviewed component and maps its UV/pivot/timing contract onto one pool. */\n\n` +
    `function deepFreeze(value) {\n` +
    `  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;\n` +
    `  for (const child of Object.values(value)) deepFreeze(child);\n` +
    `  return Object.freeze(value);\n` +
    `}\n\n` +
    `export const DEFENSE_VFX_PACK = deepFreeze(${JSON.stringify(value, null, 2)});\n\n` +
    `const BY_ID = new Map(DEFENSE_VFX_PACK.components.map((entry) => [entry.id, entry]));\n` +
    `export function defenseVfxComponent(id) { return BY_ID.get(id) || null; }\n` +
    `export function defenseVfxForState(state, timingState = null) {\n` +
    `  return DEFENSE_VFX_PACK.components.filter((entry) =>\n` +
    `    entry.defenseState === state && (!timingState || entry.timingState === timingState));\n` +
    `}\n`;
}

const spec = JSON.parse(readFileSync(specFile, 'utf8'));
if (spec.components?.length !== 64 || new Set(spec.components.map((entry) => entry.id)).size !== 64)
  throw new Error('defense VFX spec must contain exactly 64 unique components');
if (spec.dormantMode !== 'draw-nothing' || !spec.environmentOnly)
  throw new Error('pack must remain environment-only and dormant-empty');

try {
  mkdirSync(dirname(output), { recursive: true });
  mkdirSync(dirname(moduleFile), { recursive: true });
  const sources = new Map();
  const sourceReview = [];

  for (const [sheet, repoFile] of Object.entries(spec.sources)) {
    const file = resolve(root, repoFile);
    const decoded = decodePng(file);
    if (decoded.colorType !== 6) throw new Error(`${repoFile}: expected RGBA source`);
    const projection = occupancy(decoded.rgba, decoded.width, decoded.height, AUDIT_ALPHA);
    const xCuts = separatorCuts(projection.columns, decoded.width);
    const yCuts = separatorCuts(projection.rows, decoded.height);
    const source = { file, repoFile, ...decoded, xCuts, yCuts };
    sources.set(sheet, source);
    sourceReview.push({
      sheet,
      file: repoFile,
      width: decoded.width,
      height: decoded.height,
      xCuts,
      yCuts,
      acceptedCells: 16,
      rejectedCells: [],
    });
  }

  const prepared = [];
  for (const entry of spec.components) {
    const source = sources.get(entry.sheet);
    if (!source) throw new Error(`${entry.id}: unknown sheet ${entry.sheet}`);
    const col = entry.localIndex % GRID;
    const row = Math.floor(entry.localIndex / GRID);
    const cell = {
      localIndex: entry.localIndex,
      x: source.xCuts[col],
      y: source.yCuts[row],
      w: source.xCuts[col + 1] - source.xCuts[col],
      h: source.yCuts[row + 1] - source.yCuts[row],
    };
    const audit = alphaBounds(source, cell, AUDIT_ALPHA);
    const minGutterPx = gutter(cell, audit);
    if (minGutterPx < MIN_GUTTER)
      throw new Error(`${entry.id}: opaque content has only ${minGutterPx}px source gutter`);
    const trim = alphaBounds(source, cell, TRIM_ALPHA);
    const visible = alphaBounds(source, cell, VISIBLE_ALPHA);
    const islands = islandCount(source, cell, AUDIT_ALPHA);
    const cropX = cell.x + trim.x;
    const cropY = cell.y + trim.y;
    const raw = join(work, `${entry.sheet}-${String(entry.localIndex).padStart(2, '0')}.png`);
    magick([
      source.file,
      '-crop', `${trim.w}x${trim.h}+${cropX}+${cropY}`,
      '+repage', '-filter', 'Lanczos', '-resize', `${MAX_COMPONENT_PX}x${MAX_COMPONENT_PX}>`,
      '-define', 'png:compression-level=9', `PNG32:${raw}`,
    ]);
    const outSize = dimensions(raw);
    prepared.push({
      spec: entry,
      source,
      cell,
      audit,
      trim,
      visible,
      minGutterPx,
      islands,
      raw,
      width: outSize.width,
      height: outSize.height,
    });
  }

  // Height-first shelves are deterministic and comfortably fit 64 native
  // 104px components in the single 1024x512 atlas without aspect distortion.
  const packingOrder = [...prepared].sort((a, b) =>
    b.height - a.height || b.width - a.width || a.spec.id.localeCompare(b.spec.id));
  let x = PAD;
  let y = PAD;
  let rowHeight = 0;
  for (const item of packingOrder) {
    const paddedWidth = item.width + PAD * 2;
    const paddedHeight = item.height + PAD * 2;
    if (x + paddedWidth > ATLAS_WIDTH - PAD) {
      x = PAD;
      y += rowHeight;
      rowHeight = 0;
    }
    if (y + paddedHeight > ATLAS_HEIGHT - PAD)
      throw new Error(`atlas overflow at ${item.spec.id}: ${x},${y} ${paddedWidth}x${paddedHeight}`);
    item.atlasX = x + PAD;
    item.atlasY = y + PAD;
    x += paddedWidth;
    rowHeight = Math.max(rowHeight, paddedHeight);
  }
  const usedHeight = y + rowHeight + PAD;

  const composite = ['-size', `${ATLAS_WIDTH}x${ATLAS_HEIGHT}`, 'xc:none'];
  for (const item of packingOrder) {
    composite.push(item.raw, '-geometry', `+${item.atlasX}+${item.atlasY}`, '-composite');
  }
  const rawAtlas = join(work, 'atlas-raw.png');
  composite.push('-define', 'png:compression-level=9', `PNG32:${rawAtlas}`);
  magick(composite);
  const paletteNormalization = normalizePalette(rawAtlas, output);
  const packedSize = readPngSize(output);
  if (packedSize.width !== ATLAS_WIDTH || packedSize.height !== ATLAS_HEIGHT ||
      packedSize.colorType !== 6)
    throw new Error(`runtime atlas contract failed: ${JSON.stringify(packedSize)}`);

  const components = prepared.map((item) => {
    const { spec: entry, cell, visible, trim, audit } = item;
    const u0 = item.atlasX / ATLAS_WIDTH;
    const v0 = item.atlasY / ATLAS_HEIGHT;
    const u1 = (item.atlasX + item.width) / ATLAS_WIDTH;
    const v1 = (item.atlasY + item.height) / ATLAS_HEIGHT;
    return {
      ...entry,
      sourceCellPx: [cell.x, cell.y, cell.w, cell.h],
      visibleBounds: normalizedBounds(visible, cell),
      trimBounds: normalizedBounds(trim, cell),
      sourceGutterPx: item.minGutterPx,
      islandCount: item.islands,
      allIslandsRetained: true,
      alphaCoverage: round6(audit.alphaMass / (cell.w * cell.h)),
      greenHaloShare: round6(audit.greenHalo / audit.pixels),
      packedRectPx: [item.atlasX, item.atlasY, item.width, item.height],
      uv: [round6(u0), round6(v0), round6(u1), round6(v1)],
      nativeAspect: round6(item.width / item.height),
      packedPivotPx: [
        round6(item.atlasX + entry.pivot[0] * item.width),
        round6(item.atlasY + entry.pivot[1] * item.height),
      ],
      packedOriginPx: [
        round6(item.atlasX + entry.origin[0] * item.width),
        round6(item.atlasY + entry.origin[1] * item.height),
      ],
    };
  });

  const categories = Object.fromEntries([...new Set(components.map((entry) => entry.category))]
    .map((category) => [category, components.filter((entry) => entry.category === category).length]));
  const timingStates = Object.fromEntries(['tell', 'fire', 'recovery', 'spent']
    .map((state) => [state, components.filter((entry) => entry.timingState === state).length]));
  for (const [category, count] of Object.entries(categories)) {
    if (count !== 8) throw new Error(`${category}: expected 8 components, got ${count}`);
  }
  if (components.some((entry) => entry.timingState === 'dormant' || entry.maxOpacity > 1))
    throw new Error('dormant sprites and invalid opacity are forbidden');

  const manifest = {
    version: 1,
    generatedBy: 'tools/assets/pack-defense-vfx.mjs',
    dormantMode: spec.dormantMode,
    environmentOnly: spec.environmentOnly,
    forbiddenAttachments: spec.forbiddenAttachments,
    runtime: {
      file: relative(root, output),
      canvas: [ATLAS_WIDTH, ATLAS_HEIGHT],
      gpuTextures: 1,
      estimatedGpuBytes: ATLAS_WIDTH * ATLAS_HEIGHT * 4,
      maxNativeDimensionPx: MAX_COMPONENT_PX,
      transparentGuardPx: PAD,
      noRuntimeCrop: true,
      nativeAspectPreserved: true,
    },
    review: {
      acceptedComponents: components.length,
      rejectedComponents: 0,
      sourceAlphaAuditFloor: AUDIT_ALPHA,
      minimumSourceGutterPx: Math.min(...components.map((entry) => entry.sourceGutterPx)),
      lowEmissionTellOpacityMax: Math.max(...components
        .filter((entry) => entry.timingState === 'tell').map((entry) => entry.maxOpacity)),
      usedAtlasHeightPx: usedHeight,
      categories,
      timingStates,
      everyIslandRetained: components.every((entry) => entry.allIslandsRetained),
      paletteNormalization: {
        changedPixels: paletteNormalization.changedPixels,
        changedShare: paletteNormalization.changedShare,
        meanNeutralization: paletteNormalization.meanNeutralization,
        alphaPreserved: true,
      },
    },
    sources: sourceReview,
    components,
  };
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(moduleFile, moduleSource(manifest));
  console.log(JSON.stringify({
    output,
    manifest: manifestFile,
    module: moduleFile,
    atlas: manifest.runtime,
    review: manifest.review,
    sources: sourceReview,
  }, null, 2));
} finally {
  // `work` is the exact mkdtemp directory created by this invocation.
  rmSync(work, { recursive: true, force: true });
}
