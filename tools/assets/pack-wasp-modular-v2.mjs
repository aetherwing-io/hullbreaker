#!/usr/bin/env node
/* Pack the reviewed modular wasp body/wing selections into one small POT
   texture. Source boards are candidate palettes only; runtime receives 8
   body poses + 8 wing phases, complete alpha crops and invariant anchors. */

import {
  mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { decodePng, readPngSize } from './lib/png.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const positional = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const selectionFile = resolve(positional[0] || join(root,
  'assets/generated/sprites/wasp-modular-v2/wasp-modular-v2-selection.json'));
const output = resolve(positional[1] || join(root,
  'assets/generated/sprites/wasp-modular-v2/wasp-modular-atlas-v2.png'));
const manifestFile = output.replace(/\.png$/i, '.manifest.json');
const moduleFile = resolve(positional[2] || join(root, 'src/render/wasp-modular-spec.js'));
const paletteFinisher = join(root, 'tools/assets/normalize-painted-palette.mjs');
const work = mkdtempSync(join(tmpdir(), 'hullbreaker-wasp-modular-'));

const GRID = 4;
const ATLAS_W = 1024;
const ATLAS_H = 512;
const MAX_COMPONENT = 192;
const PAD = 3;
const TRIM_ALPHA = 8;
const VISIBLE_ALPHA = 32;
const AUDIT_ALPHA = 64;
const MIN_GUTTER = 8;

function magick(args) {
  const result = spawnSync('magick', args, {
    encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout ||
    `magick ${args[0]} failed with ${result.status}`);
  return result.stdout;
}

function round6(value) { return Math.round(value * 1e6) / 1e6; }
function offset(width, x, y) { return (y * width + x) * 4; }

function occupancy(source, floor) {
  const columns = Array(source.width).fill(0);
  const rows = Array(source.height).fill(0);
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      if (source.rgba[offset(source.width, x, y) + 3] <= floor) continue;
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
    const lo = Math.max(1, Math.floor(target - extent * 0.10));
    const hi = Math.min(extent - 2, Math.ceil(target + extent * 0.10));
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
    if (!runs.length) throw new Error(`no transparent separator near ${split}/4 of ${extent}`);
    runs.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]) ||
      Math.abs((a[0] + a[1]) / 2 - target) - Math.abs((b[0] + b[1]) / 2 - target));
    cuts.push(Math.round((runs[0][0] + runs[0][1]) / 2));
  }
  cuts.push(extent);
  return cuts;
}

function cellFor(source, index) {
  const col = index % GRID;
  const row = Math.floor(index / GRID);
  return {
    x: source.xCuts[col], y: source.yCuts[row],
    w: source.xCuts[col + 1] - source.xCuts[col],
    h: source.yCuts[row + 1] - source.yCuts[row],
  };
}

function alphaBounds(source, cell, floor) {
  let minX = cell.w, minY = cell.h, maxX = -1, maxY = -1;
  let pixels = 0, magenta = 0;
  for (let ly = 0; ly < cell.h; ly++) {
    for (let lx = 0; lx < cell.w; lx++) {
      const i = offset(source.width, cell.x + lx, cell.y + ly);
      if (source.rgba[i + 3] <= floor) continue;
      pixels++;
      minX = Math.min(minX, lx); minY = Math.min(minY, ly);
      maxX = Math.max(maxX, lx); maxY = Math.max(maxY, ly);
      const r = source.rgba[i], g = source.rgba[i + 1], b = source.rgba[i + 2];
      if (r > 150 && b > 140 && g < 110) magenta++;
    }
  }
  if (!pixels) throw new Error('empty candidate cell');
  return {
    x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1,
    pixels, magentaShare: magenta / pixels,
  };
}

function gutter(cell, bounds) {
  return Math.min(bounds.x, bounds.y,
    cell.w - bounds.x - bounds.w, cell.h - bounds.y - bounds.h);
}

function components(source, cell, predicate) {
  const seen = new Uint8Array(cell.w * cell.h);
  const out = [];
  const stack = [];
  for (let ly = 0; ly < cell.h; ly++) {
    for (let lx = 0; lx < cell.w; lx++) {
      const index = ly * cell.w + lx;
      if (seen[index] || !predicate(lx, ly)) continue;
      const part = { pixels: 0, minX: lx, maxX: lx, minY: ly, maxY: ly,
        sumX: 0, sumY: 0 };
      seen[index] = 1;
      stack.push(index);
      while (stack.length) {
        const at = stack.pop();
        const x = at % cell.w, y = Math.floor(at / cell.w);
        part.pixels++; part.sumX += x; part.sumY += y;
        part.minX = Math.min(part.minX, x); part.maxX = Math.max(part.maxX, x);
        part.minY = Math.min(part.minY, y); part.maxY = Math.max(part.maxY, y);
        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
          if (nx < 0 || ny < 0 || nx >= cell.w || ny >= cell.h) continue;
          const next = ny * cell.w + nx;
          if (seen[next] || !predicate(nx, ny)) continue;
          seen[next] = 1; stack.push(next);
        }
      }
      part.cx = part.sumX / part.pixels;
      part.cy = part.sumY / part.pixels;
      part.w = part.maxX - part.minX + 1;
      part.h = part.maxY - part.minY + 1;
      out.push(part);
    }
  }
  return out.sort((a, b) => b.pixels - a.pixels);
}

function anatomyAudit(source, cell, visible) {
  const alphaParts = components(source, cell, (lx, ly) =>
    source.rgba[offset(source.width, cell.x + lx, cell.y + ly) + 3] > AUDIT_ALPHA);
  const significantFloor = Math.max(20, Math.floor(visible.pixels * 0.003));
  return {
    islands: alphaParts.length,
    significantIslands: alphaParts.filter((part) => part.pixels >= significantFloor).length,
    largestIslandShare: round6((alphaParts[0]?.pixels || 0) / visible.pixels),
  };
}

function acidAnchor(source, cell, visible, layer) {
  const acid = (lx, ly) => {
    const i = offset(source.width, cell.x + lx, cell.y + ly);
    const r = source.rgba[i], g = source.rgba[i + 1], b = source.rgba[i + 2];
    return source.rgba[i + 3] > AUDIT_ALPHA && g > 115 && g > r * 1.06 && g > b * 1.35;
  };
  const parts = components(source, cell, acid).filter((part) => part.pixels >= 12);
  if (!parts.length) throw new Error(`${layer}: no acid anchor candidates`);
  const normalized = parts.map((part) => ({
    ...part,
    nx: (part.cx - visible.x) / visible.w,
    ny: (part.cy - visible.y) / visible.h,
  }));
  let candidates;
  if (layer === 'body') {
    candidates = normalized.filter((part) => part.nx >= 0.25 && part.nx <= 0.70 &&
      part.ny >= 0.18 && part.ny <= 0.78);
    if (!candidates.length) candidates = normalized;
    candidates.sort((a, b) => {
      const da = (a.nx - 0.49) ** 2 * 2 + (a.ny - 0.48) ** 2;
      const db = (b.nx - 0.49) ** 2 * 2 + (b.ny - 0.48) ** 2;
      return da - db || b.pixels - a.pixels;
    });
  } else {
    candidates = normalized.filter((part) => part.nx <= 0.30);
    if (!candidates.length) candidates = normalized;
    candidates.sort((a, b) =>
      (a.nx * 3 + Math.abs(a.ny - 0.5) + Math.abs(a.w / a.h - 1) * 0.08) -
      (b.nx * 3 + Math.abs(b.ny - 0.5) + Math.abs(b.w / b.h - 1) * 0.08));
  }
  const pick = candidates[0];
  return {
    x: pick.cx, y: pick.cy, pixels: pick.pixels,
    normalizedInCell: [round6(pick.cx / cell.w), round6(pick.cy / cell.h)],
    normalizedInVisible: [round6(pick.nx), round6(pick.ny)],
  };
}

function moduleSource(manifest) {
  const runtime = { ...manifest.runtime, file: '../../' + manifest.runtime.file };
  const value = {
    version: manifest.version,
    identity: manifest.identity,
    authoredFacing: manifest.authoredFacing,
    anchorRole: manifest.anchorRole,
    runtime,
    referenceInkWidthPx: manifest.referenceInkWidthPx,
    bodyStates: manifest.bodyStates,
    wingPhases: manifest.wingPhases,
  };
  return `/* GENERATED by tools/assets/pack-wasp-modular-v2.mjs.\n` +
    ` * Render-only modular wasp presentation: 8 body poses x 8 independent\n` +
    ` * wing phases. Simulation, collision and existing timing never import it. */\n\n` +
    `function deepFreeze(value) {\n` +
    `  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;\n` +
    `  for (const child of Object.values(value)) deepFreeze(child);\n` +
    `  return Object.freeze(value);\n` +
    `}\n\n` +
    `export const WASP_MODULAR_SPEC = deepFreeze(${JSON.stringify(value, null, 2)});\n`;
}

const selection = JSON.parse(readFileSync(selectionFile, 'utf8'));
if (selection.bodyStates?.length !== 8 || selection.wingPhases?.length !== 8)
  throw new Error('selection must contain 8 body states and 8 wing phases');
if (new Set(selection.bodyStates.map((row) => row.id)).size !== 8 ||
    new Set(selection.wingPhases.map((row) => row.id)).size !== 8)
  throw new Error('body and wing ids must be unique');

try {
  mkdirSync(dirname(output), { recursive: true });
  mkdirSync(dirname(moduleFile), { recursive: true });
  const sources = {};
  for (const [layer, repoFile] of Object.entries(selection.sources)) {
    const file = resolve(root, repoFile);
    const decoded = decodePng(file);
    if (decoded.colorType !== 6) throw new Error(`${repoFile}: expected RGBA`);
    const projected = occupancy(decoded, AUDIT_ALPHA);
    sources[layer] = {
      layer, file, repoFile, ...decoded,
      xCuts: separatorCuts(projected.columns, decoded.width),
      yCuts: separatorCuts(projected.rows, decoded.height),
    };
  }

  const candidateReview = [];
  for (const layer of ['body', 'wing']) {
    const source = sources[layer];
    const selected = new Set((layer === 'body' ? selection.bodyStates : selection.wingPhases)
      .map((row) => row.sourceIndex));
    for (let sourceIndex = 0; sourceIndex < 16; sourceIndex++) {
      const cell = cellFor(source, sourceIndex);
      const visible = alphaBounds(source, cell, AUDIT_ALPHA);
      const anatomy = anatomyAudit(source, cell, visible);
      const sourceGutterPx = gutter(cell, visible);
      const issues = [];
      if (sourceGutterPx < MIN_GUTTER) issues.push('crop-gutter');
      if (anatomy.significantIslands > 1) issues.push('disconnected-anatomy');
      if (visible.magentaShare > 0.0001) issues.push('chroma-fringe');
      candidateReview.push({
        layer, sourceIndex, selected: selected.has(sourceIndex),
        sourceGutterPx, ...anatomy, magentaShare: round6(visible.magentaShare), issues,
      });
    }
  }
  if (process.argv.includes('--audit')) {
    console.log(JSON.stringify({ candidateReview }, null, 2));
    rmSync(work, { recursive: true, force: true });
    process.exit(0);
  }

  const requested = [
    ...selection.bodyStates.map((entry) => ({ ...entry, layer: 'body' })),
    ...selection.wingPhases.map((entry) => ({ ...entry, layer: 'wing' })),
  ];
  const prepared = [];
  for (const entry of requested) {
    const source = sources[entry.layer];
    const cell = cellFor(source, entry.sourceIndex);
    const trim = alphaBounds(source, cell, TRIM_ALPHA);
    const visible = alphaBounds(source, cell, VISIBLE_ALPHA);
    const audit = alphaBounds(source, cell, AUDIT_ALPHA);
    const sourceGutterPx = gutter(cell, audit);
    const anatomy = anatomyAudit(source, cell, audit);
    if (sourceGutterPx < MIN_GUTTER)
      throw new Error(`${entry.layer}:${entry.id}: crop gutter ${sourceGutterPx}px`);
    if (anatomy.significantIslands > 1)
      throw new Error(`${entry.layer}:${entry.id}: disconnected significant anatomy (${anatomy.significantIslands})`);
    if (audit.magentaShare > 0.0001)
      throw new Error(`${entry.layer}:${entry.id}: chroma fringe ${audit.magentaShare}`);
    const anchor = acidAnchor(source, cell, visible, entry.layer);
    const raw = join(work, `${entry.layer}-${entry.sourceIndex}.png`);
    magick([
      source.file,
      '-crop', `${trim.w}x${trim.h}+${cell.x + trim.x}+${cell.y + trim.y}`,
      '+repage', '-filter', 'Lanczos', '-resize', `${MAX_COMPONENT}x${MAX_COMPONENT}>`,
      '-define', 'png:compression-level=9', `PNG32:${raw}`,
    ]);
    const size = readPngSize(raw);
    prepared.push({ entry, source, cell, trim, visible, audit, anchor,
      sourceGutterPx, anatomy, raw, width: size.width, height: size.height });
  }

  const packing = [...prepared].sort((a, b) =>
    b.height - a.height || b.width - a.width || a.entry.id.localeCompare(b.entry.id));
  let x = PAD, y = PAD, rowHeight = 0;
  for (const item of packing) {
    const pw = item.width + PAD * 2, ph = item.height + PAD * 2;
    if (x + pw > ATLAS_W - PAD) { x = PAD; y += rowHeight; rowHeight = 0; }
    if (y + ph > ATLAS_H - PAD)
      throw new Error(`atlas overflow at ${item.entry.layer}:${item.entry.id}`);
    item.atlasX = x + PAD; item.atlasY = y + PAD;
    x += pw; rowHeight = Math.max(rowHeight, ph);
  }
  const usedHeight = y + rowHeight + PAD;

  const rawAtlas = join(work, 'atlas-raw.png');
  const composite = ['-size', `${ATLAS_W}x${ATLAS_H}`, 'xc:none'];
  for (const item of packing)
    composite.push(item.raw, '-geometry', `+${item.atlasX}+${item.atlasY}`, '-composite');
  composite.push('-define', 'png:compression-level=9', `PNG32:${rawAtlas}`);
  magick(composite);
  const paletteRun = spawnSync(process.execPath, [
    paletteFinisher, '--input', rawAtlas, '--out', output, '--alpha-floor', '32',
  ], { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
  if (paletteRun.status !== 0) throw new Error(paletteRun.stderr || paletteRun.stdout);
  const palette = JSON.parse(paletteRun.stdout);
  const packedSize = readPngSize(output);
  if (packedSize.width !== ATLAS_W || packedSize.height !== ATLAS_H || packedSize.colorType !== 6)
    throw new Error(`atlas contract failed: ${JSON.stringify(packedSize)}`);

  function packed(item) {
    const localAnchorX = (item.anchor.x - item.trim.x) * item.width / item.trim.w;
    const localAnchorY = (item.anchor.y - item.trim.y) * item.height / item.trim.h;
    return {
      ...item.entry,
      sourceCellPx: [item.cell.x, item.cell.y, item.cell.w, item.cell.h],
      sourceGutterPx: item.sourceGutterPx,
      visibleBounds: [round6(item.visible.x / item.cell.w), round6(item.visible.y / item.cell.h),
        round6(item.visible.w / item.cell.w), round6(item.visible.h / item.cell.h)],
      significantIslands: item.anatomy.significantIslands,
      largestIslandShare: item.anatomy.largestIslandShare,
      anchorSourcePx: [round6(item.anchor.x), round6(item.anchor.y)],
      anchorCell: item.anchor.normalizedInCell,
      anchorVisible: item.anchor.normalizedInVisible,
      packedRectPx: [item.atlasX, item.atlasY, item.width, item.height],
      packedAnchorLocalPx: [round6(localAnchorX), round6(localAnchorY)],
      packedAnchorPx: [round6(item.atlasX + localAnchorX), round6(item.atlasY + localAnchorY)],
      uv: [round6(item.atlasX / ATLAS_W), round6(item.atlasY / ATLAS_H),
        round6((item.atlasX + item.width) / ATLAS_W),
        round6((item.atlasY + item.height) / ATLAS_H)],
      nativeAspect: round6(item.width / item.height),
    };
  }
  const bodyStates = prepared.filter((item) => item.entry.layer === 'body').map(packed);
  const wingPhases = prepared.filter((item) => item.entry.layer === 'wing').map(packed);
  const referenceInkWidthPx = bodyStates[0].packedRectPx[2];
  const anchorDrift = (rows) => {
    const xs = rows.map((row) => row.anchorCell[0]);
    const ys = rows.map((row) => row.anchorCell[1]);
    return [round6(Math.max(...xs) - Math.min(...xs)), round6(Math.max(...ys) - Math.min(...ys))];
  };
  const manifest = {
    version: 2,
    generatedBy: 'tools/assets/pack-wasp-modular-v2.mjs',
    identity: selection.identity,
    authoredFacing: selection.authoredFacing,
    anchorRole: selection.anchorRole,
    wingRootRole: selection.wingRootRole,
    runtime: {
      file: relative(root, output), canvas: [ATLAS_W, ATLAS_H],
      gpuTextures: 1, estimatedGpuBytes: ATLAS_W * ATLAS_H * 4,
      maxComponentPx: MAX_COMPONENT, transparentGuardPx: PAD,
      sharedGeometries: 16, meshesPerWasp: 2, drawCallsPerWasp: 2,
      addedDrawCallsPerWasp: 1, crossfade: false,
    },
    referenceInkWidthPx,
    sources: Object.fromEntries(Object.entries(sources).map(([layer, source]) => [layer, {
      file: source.repoFile, canvas: [source.width, source.height],
      xCuts: source.xCuts, yCuts: source.yCuts,
    }])),
    review: {
      candidates: 32, selected: 16, alternates: 16,
      selectedBodyStates: 8, selectedWingPhases: 8, combinations: 64,
      minimumSourceGutterPx: Math.min(...prepared.map((item) => item.sourceGutterPx)),
      selectedSignificantIslands: [...bodyStates, ...wingPhases]
        .map((row) => row.significantIslands),
      bodyAnchorDriftCell: anchorDrift(bodyStates),
      wingAnchorDriftCell: anchorDrift(wingPhases),
      usedAtlasHeightPx: usedHeight,
      paletteNormalization: {
        changedPixels: palette.changedPixels, changedShare: palette.changedShare,
        meanNeutralization: palette.meanNeutralization, alphaPreserved: true,
      },
      candidateReview,
    },
    bodyStates,
    wingPhases,
  };
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(moduleFile, moduleSource(manifest));
  console.log(JSON.stringify({ output, manifest: manifestFile, module: moduleFile,
    runtime: manifest.runtime, review: manifest.review }, null, 2));
} finally {
  rmSync(work, { recursive: true, force: true });
}
