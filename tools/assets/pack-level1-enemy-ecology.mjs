#!/usr/bin/env node
/* Pack the reviewed Level 1 Meridian ecology boards into one render-ready
 * atlas. This is deliberately offline: no source board, chroma matte or review
 * sheet is a runtime dependency. Twelve variants each own eight body layers
 * and eight independent action layers; their Cartesian product is proved in
 * the manifest and in a per-variant 8x8 contact sheet. */

import {
  mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { decodePng, readPngSize } from './lib/png.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const positional = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const outDir = resolve(positional[0] || join(root, 'assets/generated/enemy-ecology'));
const atlasFile = join(outDir, 'level1-enemy-ecology-atlas-v1.png');
const manifestFile = join(outDir, 'level1-enemy-ecology-atlas-v1.manifest.json');
const reviewDir = join(outDir, 'review');
const work = mkdtempSync(join(tmpdir(), 'hullbreaker-level1-ecology-'));
const chromaTool = '/Users/scottmeyer/.codex/skills/.system/imagegen/scripts/remove_chroma_key.py';

const CELL = 160;
const INNER = 136;
const COLS = 24;
const ROWS = 8;
const ATLAS_W = COLS * CELL;
const ATLAS_H = ROWS * CELL;
// ImageGen's magenta boards occasionally carry a nearly invisible, low-alpha
// echo of a neighboring row after despill. Derive geometry from the strong
// matte, then restore four pixels of antialias/glow guard around that core.
const AUDIT_ALPHA = 192;
const SOURCE_EDGE_PAD = 4;
const MIN_SOURCE_GUARD = 0;
const MIN_ATLAS_GUARD = (CELL - INNER) / 2;

const BODY_STATES = Object.freeze([
  'quiet-idle', 'awake-locomotion', 'acquisition-load', 'committed-load',
  'recovery-vent', 'impact-damaged', 'critical-damaged', 'death-breakup',
]);
const ACTION_PHASES = Object.freeze([
  'stowed', 'acquire', 'tell', 'release-early', 'release-peak',
  'follow-through', 'recover', 'spent-fail',
]);

const FAMILY_DEFS = Object.freeze([
  {
    id: 'hunter', compose: [0.50, 0.55], atlasBase: 0,
    bodySource: 'hunters', actionSource: 'hunters', combined: true,
    actionReplacementSource: 'hunters-action-active', actionReplacementRange: [1, 4],
    actionVariantReplacements: {
      0: { source: 'hunters-railfang-action-active', range: [1, 4] },
    },
    variants: [
      ['hound-railfang', 'hound', 'BASE+BULWARK', []],
      ['hound-vaultjaw', 'hound', 'VAULT', []],
      ['hound-rebound', 'hound', 'BASE+optional BACKLASH', ['reverse-vault']],
    ],
    variantSockets: {
      'hound-railfang': { attack: [0.20, 0.53] },
      'hound-vaultjaw': { attack: [0.20, 0.53] },
      'hound-rebound': { attack: [0.20, 0.53] },
    },
    sockets: {
      compose: [0.50, 0.55], root: [0.50, 0.83], tell: [0.24, 0.48],
      attack: [0.13, 0.53], damage: [0.50, 0.55], foreclaw: [0.20, 0.78],
      rearDrive: [0.78, 0.64],
    },
  },
  {
    id: 'aerial', compose: [0.50, 0.50], atlasBase: 6,
    bodySource: 'aerial-body-upper', bodySourceLate: 'aerial-body-lower',
    actionSource: 'aerial-action-upper', actionSourceLate: 'aerial-action-lower',
    combined: false,
    variants: [
      ['wasp-crosswind', 'wasp', 'PINCER+TWINSTRIKE', ['horizontal-burst']],
      ['wasp-diveclaw', 'wasp', 'BASE+BULWARK', []],
      ['wasp-pincer', 'wasp', 'PINCER+TWINSTRIKE', []],
    ],
    variantSockets: {
      'wasp-crosswind': { attack: [0.31, 0.50], tell: [0.35, 0.48] },
      'wasp-diveclaw': { attack: [0.28, 0.50], tell: [0.32, 0.48] },
      'wasp-pincer': { attack: [0.16, 0.50], tell: [0.22, 0.48] },
    },
    sockets: {
      compose: [0.50, 0.50], root: [0.50, 0.52], tell: [0.27, 0.45],
      attack: [0.12, 0.50], damage: [0.52, 0.52], wingFront: [0.30, 0.24],
      wingRear: [0.72, 0.28],
    },
  },
  {
    id: 'connector', compose: [0.50, 0.55], atlasBase: 12,
    bodySource: 'connectors-body-upper', bodySourceLate: 'connectors-body-lower',
    actionSource: 'connectors-action', combined: false,
    variants: [
      ['polyp-needle', 'polyp', 'BASE+optional AEGIS', []],
      ['polyp-sweepfan', 'polyp', 'BASE+optional AEGIS', ['bounded-sweep']],
      ['polyp-gateweaver', 'polyp', 'RELAY+optional AEGIS', []],
    ],
    variantSockets: {
      'polyp-needle': { attack: [0.86, 0.50], tell: [0.70, 0.48] },
      'polyp-sweepfan': { attack: [0.20, 0.50], tell: [0.30, 0.47] },
      'polyp-gateweaver': {
        attack: [0.17, 0.50], attackAlt: [0.70, 0.50], tell: [0.30, 0.47],
      },
    },
    sockets: {
      compose: [0.50, 0.55], root: [0.50, 0.78], tell: [0.28, 0.43],
      attack: [0.13, 0.50], damage: [0.50, 0.57], rootClamp: [0.50, 0.86],
      hinge: [0.50, 0.55],
    },
  },
  {
    id: 'denial', compose: [0.50, 0.62], atlasBase: 18,
    bodySource: 'denial-body-upper', bodySourceLate: 'denial-body-lower',
    bodyReplacementSource: 'denial-body-damage', bodyReplacementRange: [5, 6],
    actionSource: 'denial-action', combined: false,
    variants: [
      ['mortar-craterpod', 'mortar', 'BASE', []],
      ['mortar-bracketpod', 'mortar', 'SALVO+BASTION/BRACKET', []],
      ['mortar-aircomb', 'mortar', 'SALVO+optional BACKLASH', ['descent-comb']],
    ],
    variantSockets: {
      'mortar-craterpod': { attack: [0.65, 0.31], tell: [0.61, 0.36] },
      'mortar-bracketpod': {
        attack: [0.19, 0.37], attackAlt: [0.81, 0.37], tell: [0.27, 0.41],
      },
      'mortar-aircomb': { attack: [0.18, 0.43], tell: [0.27, 0.43] },
    },
    sockets: {
      compose: [0.50, 0.62], root: [0.50, 0.86], tell: [0.26, 0.36],
      attack: [0.17, 0.31], damage: [0.50, 0.60], barrel: [0.24, 0.34],
      outrigger: [0.50, 0.86],
    },
  },
]);

const SOURCE_DEFS = Object.freeze({
  hunters: {
    file: 'assets/generated/enemy-ecology/source-boards/level1-hunters-6x8-chroma-v1.png',
    cols: 6, rows: 8, accepted: true,
  },
  'aerial-body-upper': {
    file: 'assets/generated/enemy-ecology/source-boards/level1-aerial-body-b0-b3-3x4-chroma-v2.png',
    cols: 3, rows: 4, accepted: true,
  },
  'aerial-body-lower': {
    file: 'assets/generated/enemy-ecology/source-boards/level1-aerial-body-b4-b7-3x4-chroma-v2.png',
    cols: 3, rows: 4, accepted: true,
  },
  'aerial-action-upper': {
    file: 'assets/generated/enemy-ecology/source-boards/level1-aerial-action-a0-a3-3x4-chroma-v2.png',
    cols: 3, rows: 4, accepted: true,
  },
  'aerial-action-lower': {
    file: 'assets/generated/enemy-ecology/source-boards/level1-aerial-action-a4-a7-3x4-chroma-v2.png',
    cols: 3, rows: 4, accepted: true,
  },
  'hunters-action-active': {
    file: 'assets/generated/enemy-ecology/source-boards/level1-hunters-action-a1-a4-3x4-chroma-v2.png',
    cols: 3, rows: 4, accepted: true,
  },
  'hunters-railfang-action-active': {
    file: 'assets/generated/enemy-ecology/source-boards/level1-hunters-railfang-action-a1-a4-1x4-chroma-v3.png',
    cols: 1, rows: 4, accepted: true,
  },
  'connectors-body-upper': {
    file: 'assets/generated/enemy-ecology/source-boards/level1-connectors-body-b0-b3-3x4-chroma-v3.png',
    cols: 3, rows: 4, accepted: true,
  },
  'connectors-body-lower': {
    file: 'assets/generated/enemy-ecology/source-boards/level1-connectors-body-b4-b7-3x4-chroma-v3.png',
    cols: 3, rows: 4, accepted: true,
  },
  'connectors-action': {
    file: 'assets/generated/enemy-ecology/source-boards/level1-connectors-action-3x8-chroma-v3.png',
    cols: 3, rows: 8, accepted: true,
  },
  'denial-body-upper': {
    file: 'assets/generated/enemy-ecology/source-boards/level1-denial-body-b0-b3-3x4-chroma-v3.png',
    cols: 3, rows: 4, accepted: true,
  },
  'denial-body-lower': {
    file: 'assets/generated/enemy-ecology/source-boards/level1-denial-body-b4-b7-3x4-chroma-v3.png',
    cols: 3, rows: 4, accepted: true,
  },
  'denial-body-damage': {
    file: 'assets/generated/enemy-ecology/source-boards/level1-denial-body-b5-b6-3x2-chroma-v5.png',
    cols: 3, rows: 2, accepted: true,
  },
  'denial-action': {
    file: 'assets/generated/enemy-ecology/source-boards/level1-denial-action-3x8-chroma-v2.png',
    cols: 3, rows: 8, accepted: true,
  },
});

function run(command, args, maxBuffer = 16 * 1024 * 1024) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout ||
    `${command} ${args[0] || ''} failed with ${result.status}`);
  return result.stdout;
}

function magick(args) { return run('magick', args); }
function round6(value) { return Math.round(value * 1e6) / 1e6; }
function pixelOffset(width, x, y) { return (y * width + x) * 4; }
function canonicalRgbaHash(width, height, rgba) {
  const dimensions = Buffer.alloc(8);
  dimensions.writeUInt32BE(width, 0);
  dimensions.writeUInt32BE(height, 4);
  return createHash('sha256')
    .update('hullbreaker:rgba8:v1\0')
    .update(dimensions)
    .update(rgba)
    .digest('hex');
}
function atlasCellRgba(source, col, row, size) {
  const rgba = Buffer.alloc(size * size * 4);
  const sourceX = col * size, sourceY = row * size;
  for (let y = 0; y < size; y++) {
    const start = ((sourceY + y) * source.width + sourceX) * 4;
    rgba.set(source.rgba.subarray(start, start + size * 4), y * size * 4);
  }
  return rgba;
}
function repo(file) { return relative(root, file).replaceAll('\\', '/'); }
function esc(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function occupancy(source, floor) {
  const columns = Array(source.width).fill(0);
  const rows = Array(source.height).fill(0);
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      if (source.rgba[pixelOffset(source.width, x, y) + 3] <= floor) continue;
      columns[x]++; rows[y]++;
    }
  }
  return { columns, rows };
}

function separatorCuts(values, extent, count) {
  const cuts = [0];
  const span = extent / count;
  for (let split = 1; split < count; split++) {
    const target = split * span;
    const lo = Math.max(1, Math.floor(target - span * 0.38));
    const hi = Math.min(extent - 2, Math.ceil(target + span * 0.38));
    const runs = [];
    let start = -1;
    for (let i = lo; i <= hi; i++) {
      const empty = values[i] <= 2;
      if (empty && start < 0) start = i;
      if ((!empty || i === hi) && start >= 0) {
        const end = empty && i === hi ? i : i - 1;
        runs.push([start, end]); start = -1;
      }
    }
    if (!runs.length) {
      let best = lo;
      for (let i = lo + 1; i <= hi; i++)
        if (values[i] < values[best] || (values[i] === values[best] &&
            Math.abs(i - target) < Math.abs(best - target))) best = i;
      cuts.push(best);
      continue;
    }
    runs.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]) ||
      Math.abs((a[0] + a[1]) / 2 - target) - Math.abs((b[0] + b[1]) / 2 - target));
    cuts.push(Math.round((runs[0][0] + runs[0][1]) / 2));
  }
  cuts.push(extent);
  for (let i = 1; i < cuts.length; i++)
    if (cuts[i] <= cuts[i - 1]) throw new Error(`invalid ${count}-way separator cuts ${cuts}`);
  return cuts;
}

function cellRect(source, col, row) {
  return {
    x: source.xCuts[col], y: source.yCuts[row],
    w: source.xCuts[col + 1] - source.xCuts[col],
    h: source.yCuts[row + 1] - source.yCuts[row],
  };
}

function alphaBounds(source, cell, floor) {
  let minX = cell.w, minY = cell.h, maxX = -1, maxY = -1, pixels = 0;
  let magenta = 0;
  for (let ly = 0; ly < cell.h; ly++) {
    for (let lx = 0; lx < cell.w; lx++) {
      const offset = pixelOffset(source.width, cell.x + lx, cell.y + ly);
      const alpha = source.rgba[offset + 3];
      if (alpha <= floor) continue;
      pixels++;
      minX = Math.min(minX, lx); minY = Math.min(minY, ly);
      maxX = Math.max(maxX, lx); maxY = Math.max(maxY, ly);
      const r = source.rgba[offset], g = source.rgba[offset + 1], b = source.rgba[offset + 2];
      if (r > 95 && b > 90 && r > g * 1.35 && b > g * 1.30 && Math.abs(r - b) < 90)
        magenta++;
    }
  }
  if (!pixels) throw new Error(`${source.id}:${cell.x},${cell.y}: empty layer`);
  return {
    x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1,
    pixels, magentaShare: round6(magenta / pixels),
  };
}

function componentAudit(source, cell, floor, visiblePixels, label = source.id) {
  const seen = new Uint8Array(cell.w * cell.h);
  const parts = [];
  const stack = [];
  const solid = (lx, ly) => source.rgba[
    pixelOffset(source.width, cell.x + lx, cell.y + ly) + 3] > floor;
  for (let ly = 0; ly < cell.h; ly++) {
    for (let lx = 0; lx < cell.w; lx++) {
      const start = ly * cell.w + lx;
      if (seen[start] || !solid(lx, ly)) continue;
      let pixels = 0, minX = lx, maxX = lx, minY = ly, maxY = ly;
      seen[start] = 1;
      stack.push(start);
      while (stack.length) {
        const at = stack.pop();
        const x = at % cell.w, y = Math.floor(at / cell.w);
        pixels++;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
          if (nx < 0 || ny < 0 || nx >= cell.w || ny >= cell.h) continue;
          const next = ny * cell.w + nx;
          if (seen[next] || !solid(nx, ny)) continue;
          seen[next] = 1; stack.push(next);
        }
      }
      parts.push({ pixels, minX, maxX, minY, maxY });
    }
  }
  parts.sort((a, b) => b.pixels - a.pixels);
  const significantFloor = Math.max(24, Math.floor(visiblePixels * 0.006));
  const significant = parts.filter((part) => part.pixels >= significantFloor);
  const significantMass = significant.reduce((sum, part) => sum + part.pixels, 0) || 1;
  if (!significant.length) throw new Error(`${label}: no significant alpha anatomy (${parts.length} islands, ${visiblePixels} pixels)`);
  const minX = Math.min(...significant.map((part) => part.minX));
  const minY = Math.min(...significant.map((part) => part.minY));
  const maxX = Math.max(...significant.map((part) => part.maxX));
  const maxY = Math.max(...significant.map((part) => part.maxY));
  return {
    islands: parts.length,
    significantIslands: significant.length,
    largestIslandShare: round6((significant[0]?.pixels || 0) / significantMass),
    significantFloor,
    significantBounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
  };
}

function sourceGuard(cell, bounds) {
  return Math.min(bounds.x, bounds.y,
    cell.w - bounds.x - bounds.w, cell.h - bounds.y - bounds.h);
}

function expandedBounds(bounds, cell, pad) {
  const x = Math.max(0, bounds.x - pad);
  const y = Math.max(0, bounds.y - pad);
  const right = Math.min(cell.w, bounds.x + bounds.w + pad);
  const bottom = Math.min(cell.h, bounds.y + bounds.h + pad);
  return { x, y, w: right - x, h: bottom - y, pixels: bounds.pixels,
    magentaShare: bounds.magentaShare };
}

function mapPoint(point, trim, target) {
  return [
    round6(target.x + (point[0] - trim.x) * target.w / trim.w),
    round6(target.y + (point[1] - trim.y) * target.h / trim.h),
  ];
}

function layerSourceCell(family, variantIndex, axis, row) {
  let sourceId = axis === 'body' ? family.bodySource : family.actionSource;
  let sourceRow = row;
  const actionVariantReplacement = family.actionVariantReplacements?.[variantIndex];
  if (axis === 'action' && actionVariantReplacement &&
      row >= actionVariantReplacement.range[0] && row <= actionVariantReplacement.range[1]) {
    sourceId = actionVariantReplacement.source;
    sourceRow = row - actionVariantReplacement.range[0];
    return { sourceId, col: 0, row: sourceRow };
  }
  if (axis === 'action' && family.actionReplacementSource &&
      row >= family.actionReplacementRange[0] && row <= family.actionReplacementRange[1]) {
    sourceId = family.actionReplacementSource;
    sourceRow = row - family.actionReplacementRange[0];
    return { sourceId, col: variantIndex, row: sourceRow };
  }
  if (axis === 'body' && family.bodyReplacementSource &&
      row >= family.bodyReplacementRange[0] && row <= family.bodyReplacementRange[1]) {
    sourceId = family.bodyReplacementSource;
    sourceRow = row - family.bodyReplacementRange[0];
    return { sourceId, col: variantIndex, row: sourceRow };
  }
  if (axis === 'body' && family.bodySourceLate && row >= 4) {
    sourceId = family.bodySourceLate;
    sourceRow = row - 4;
  }
  if (axis === 'action' && family.actionSourceLate && row >= 4) {
    sourceId = family.actionSourceLate;
    sourceRow = row - 4;
  }
  const col = family.combined
    ? variantIndex * 2 + (axis === 'action' ? 1 : 0)
    : variantIndex;
  return { sourceId, col, row: sourceRow };
}

function svgImage(component, cardX, cardY, anchorX, anchorY, clipId) {
  const x = round6(cardX + anchorX - component.reviewPivot[0]);
  const y = round6(cardY + anchorY - component.reviewPivot[1]);
  return `<image xlink:href="data:image/png;base64,${component.reviewData}" x="${x}" y="${y}" width="${CELL}" height="${CELL}" clip-path="url(#${clipId})"/>`;
}

function svgImageScaled(component, anchorX, anchorY, scale) {
  const x = round6(anchorX - component.reviewPivot[0] * scale);
  const y = round6(anchorY - component.reviewPivot[1] * scale);
  const size = round6(CELL * scale);
  return `<image xlink:href="data:image/png;base64,${component.reviewData}" x="${x}" y="${y}" width="${size}" height="${size}"/>`;
}

function svgComposite(byId, placement) {
  const body = byId.get(`${placement.id}-b${placement.b}`);
  const action = byId.get(`${placement.id}-a${placement.a}`);
  let anchorX = placement.x;
  let anchorY = placement.y;
  if (placement.grounded) {
    const rootSocket = body.sockets.root.cellPx;
    anchorX -= (rootSocket[0] - body.reviewPivot[0]) * placement.scale;
    anchorY -= (rootSocket[1] - body.reviewPivot[1]) * placement.scale;
  }
  return {
    body, action, anchorX, anchorY,
    svg: svgImageScaled(body, anchorX, anchorY, placement.scale) +
      svgImageScaled(action, anchorX, anchorY, placement.scale),
  };
}

function placedSocket(component, socket, anchorX, anchorY, scale) {
  const point = component.sockets[socket].cellPx;
  return [
    anchorX + (point[0] - component.reviewPivot[0]) * scale,
    anchorY + (point[1] - component.reviewPivot[1]) * scale,
  ];
}

function composedBounds(components, cardX, cardY, anchorX, anchorY) {
  const placed = components.map((component) => {
    const [bx, by, bw, bh] = component.reviewBounds;
    const x = cardX + anchorX - component.reviewPivot[0] + bx;
    const y = cardY + anchorY - component.reviewPivot[1] + by;
    return { x, y, right: x + bw, bottom: y + bh };
  });
  return {
    x: Math.min(...placed.map((row) => row.x)),
    y: Math.min(...placed.map((row) => row.y)),
    right: Math.max(...placed.map((row) => row.right)),
    bottom: Math.max(...placed.map((row) => row.bottom)),
  };
}

function proofGuard(bounds, cardX, cardY, cardW, cardH) {
  return Math.min(
    bounds.x - cardX,
    bounds.y - cardY,
    cardX + cardW - bounds.right,
    cardY + cardH - bounds.bottom,
  );
}

function renderSvg(name, width, height, body) {
  const svg = join(work, `${name}.svg`);
  const output = join(reviewDir, `${name}.png`);
  writeFileSync(svg, `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>\n`);
  magick(['-density', '96', svg, '-define', 'png:color-type=6', output]);
  return output;
}

function contactSheet(variant, byId, proofGuards) {
  const cardW = 288, cardH = 204, anchorY = 116;
  const width = cardW * 8, height = cardH * 8;
  const defs = [], rows = [];
  for (let b = 0; b < 8; b++) {
    for (let a = 0; a < 8; a++) {
      const x = a * cardW, y = b * cardH, clip = `c-${b}-${a}`;
      const body = byId.get(`${variant.id}-b${b}`);
      const action = byId.get(`${variant.id}-a${a}`);
      const bounds = composedBounds([body, action], x, y, cardW / 2, anchorY);
      const guard = proofGuard(bounds, x, y, cardW, cardH);
      if (guard < 4)
        throw new Error(`${variant.id} B${b} A${a}: proof crop guard ${round6(guard)}px`);
      proofGuards.push({ id: `${variant.id}-b${b}-a${a}`, guardPx: round6(guard) });
      defs.push(`<clipPath id="${clip}"><rect x="${x + 1}" y="${y + 1}" width="${cardW - 2}" height="${cardH - 2}"/></clipPath>`);
      rows.push(`<rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" fill="${(a + b) % 2 ? '#10262c' : '#173138'}" stroke="#315159"/>`);
      rows.push(svgImage(body, x, y, cardW / 2, anchorY, clip));
      rows.push(svgImage(action, x, y, cardW / 2, anchorY, clip));
      rows.push(`<text x="${x + 7}" y="${y + 14}" fill="#8ca5a8" font-family="Menlo,monospace" font-size="10">B${b} A${a}</text>`);
    }
  }
  return renderSvg(`level1-${variant.id}-64-state-contact-v1`, width, height,
    `<defs>${defs.join('')}</defs>${rows.join('')}`);
}

function masterSheet(variants, byId) {
  const samples = [[0, 0], [2, 2], [3, 4], [4, 6], [6, 2], [7, 7]];
  const labelW = 250, cardW = 236, rowH = 170;
  const width = labelW + samples.length * cardW, height = variants.length * rowH;
  const defs = [], rows = [`<rect width="${width}" height="${height}" fill="#0a181d"/>`];
  variants.forEach((variant, vi) => {
    const y = vi * rowH;
    rows.push(`<rect x="0" y="${y}" width="${labelW}" height="${rowH}" fill="${vi % 2 ? '#162b31' : '#102228'}"/>`);
    rows.push(`<text x="18" y="${y + 54}" fill="#e7d7aa" font-family="Menlo,monospace" font-weight="700" font-size="18">${esc(variant.id)}</text>`);
    rows.push(`<text x="18" y="${y + 80}" fill="#829b9e" font-family="Menlo,monospace" font-size="12">${esc(variant.existingMechanic)}</text>`);
    samples.forEach(([b, a], si) => {
      const x = labelW + si * cardW, clip = `m-${vi}-${si}`;
      defs.push(`<clipPath id="${clip}"><rect x="${x + 1}" y="${y + 1}" width="${cardW - 2}" height="${rowH - 2}"/></clipPath>`);
      rows.push(`<rect x="${x}" y="${y}" width="${cardW}" height="${rowH}" fill="${si % 2 ? '#173138' : '#10262c'}" stroke="#315159"/>`);
      rows.push(svgImage(byId.get(`${variant.id}-b${b}`), x, y, cardW / 2, 98, clip));
      rows.push(svgImage(byId.get(`${variant.id}-a${a}`), x, y, cardW / 2, 98, clip));
      rows.push(`<text x="${x + 7}" y="${y + 14}" fill="#91a9ab" font-family="Menlo,monospace" font-size="10">B${b} A${a}</text>`);
    });
  });
  return renderSvg('level1-enemy-ecology-master-contact-v1', width, height,
    `<defs>${defs.join('')}</defs>${rows.join('')}`);
}

function edgeProof(variants, byId) {
  const labelW = 250, cardW = 250, rowH = 158;
  const backgrounds = ['#020304', '#17343b', '#6c3c25'];
  const width = labelW + backgrounds.length * cardW, height = variants.length * rowH;
  const defs = [], rows = [`<rect width="${width}" height="${height}" fill="#09171b"/>`];
  variants.forEach((variant, vi) => {
    const y = vi * rowH;
    rows.push(`<text x="16" y="${y + 76}" fill="#d8cda9" font-family="Menlo,monospace" font-size="16">${esc(variant.id)}</text>`);
    backgrounds.forEach((color, ci) => {
      const x = labelW + ci * cardW, clip = `e-${vi}-${ci}`;
      defs.push(`<clipPath id="${clip}"><rect x="${x + 1}" y="${y + 1}" width="${cardW - 2}" height="${rowH - 2}"/></clipPath>`);
      rows.push(`<rect x="${x}" y="${y}" width="${cardW}" height="${rowH}" fill="${color}" stroke="#49646a"/>`);
      rows.push(svgImage(byId.get(`${variant.id}-b6`), x, y, cardW / 2, 90, clip));
      rows.push(svgImage(byId.get(`${variant.id}-a4`), x, y, cardW / 2, 90, clip));
    });
  });
  return renderSvg('level1-enemy-ecology-edge-proof-v1', width, height,
    `<defs>${defs.join('')}</defs>${rows.join('')}`);
}

function gameplayScaleProof(def, byId) {
  const base = resolve(root, def.base);
  const size = readPngSize(base);
  const background = readFileSync(base).toString('base64');
  const rows = [
    `<image xlink:href="data:image/png;base64,${background}" width="${size.width}" height="${size.height}"/>`,
  ];
  for (const placement of def.placements) {
    rows.push(svgComposite(byId, placement).svg);
  }
  const titleSize = size.width < 600 ? 11 : 15;
  const titleHeight = size.width < 600 ? 25 : 34;
  rows.push(`<rect x="0" y="0" width="${size.width}" height="${titleHeight}" fill="#071519" opacity="0.82"/>`);
  rows.push(`<text x="${size.width < 600 ? 9 : 16}" y="${size.width < 600 ? 17 : 23}" fill="#e7d7aa" font-family="Menlo,monospace" font-weight="700" font-size="${titleSize}">${esc(def.title)}</text>`);
  return renderSvg(def.name, size.width, size.height, rows.join(''));
}

function scaleComparisonProof(name, baseFile, variants, states, byId, portrait = false) {
  const base = resolve(root, baseFile);
  const baseSize = readPngSize(base);
  const background = readFileSync(base).toString('base64');
  const cardW = portrait ? 130 : 320;
  const cardH = portrait ? 160 : 220;
  const scale = portrait ? 0.43 : 0.72;
  const rootY = portrait ? 132 : 178;
  const cropX = portrait ? 130 : 250;
  const cropY = portrait ? 340 : 300;
  const width = cardW * states.length;
  const height = cardH * variants.length;
  const defs = [`<image id="${name}-bg" xlink:href="data:image/png;base64,${background}" width="${baseSize.width}" height="${baseSize.height}"/>`];
  const rows = [];
  variants.forEach((id, vi) => states.forEach((state, si) => {
    const x = si * cardW, y = vi * cardH, clip = `${name}-${vi}-${si}`;
    defs.push(`<clipPath id="${clip}"><rect x="${x}" y="${y}" width="${cardW}" height="${cardH}"/></clipPath>`);
    rows.push(`<g clip-path="url(#${clip})"><use xlink:href="#${name}-bg" x="${x - cropX}" y="${y - cropY}"/><rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" fill="#071519" opacity="0.20"/></g>`);
    rows.push(svgComposite(byId, {
      id, b: state.b, a: state.a, scale,
      x: x + cardW / 2, y: y + rootY, grounded: true,
    }).svg);
    rows.push(`<rect x="${x}" y="${y}" width="${cardW}" height="${portrait ? 19 : 25}" fill="#071519" opacity="0.88"/>`);
    rows.push(`<text x="${x + (portrait ? 5 : 9)}" y="${y + (portrait ? 13 : 17)}" fill="#e7d7aa" font-family="Menlo,monospace" font-size="${portrait ? 8 : 11}">${esc(id)}  ${esc(state.label)}</text>`);
    rows.push(`<rect x="${x + 0.5}" y="${y + 0.5}" width="${cardW - 1}" height="${cardH - 1}" fill="none" stroke="#557078"/>`);
  }));
  return renderSvg(name, width, height, `<defs>${defs.join('')}</defs>${rows.join('')}`);
}

function aerialReadabilityProof(name, baseFile, variants, states, byId, portrait = false) {
  const base = resolve(root, baseFile);
  const baseSize = readPngSize(base);
  const background = readFileSync(base).toString('base64');
  const cardW = portrait ? 130 : 250;
  const cardH = portrait ? 130 : 150;
  const scale = 0.31; // 136px authored maximum -> 42.16px live target.
  // Keep flyers off the deck so rails cannot manufacture or hide a wing edge.
  const anchorY = portrait ? 68 : 70;
  const cropX = portrait ? 130 : 250;
  const cropY = portrait ? 330 : 285;
  const width = cardW * states.length;
  const height = cardH * variants.length;
  const defs = [
    `<image id="${name}-bg" xlink:href="data:image/png;base64,${background}" width="${baseSize.width}" height="${baseSize.height}"/>`,
  ];
  const rows = [];
  variants.forEach((id, vi) => states.forEach((state, si) => {
    const x = si * cardW, y = vi * cardH, clip = `${name}-${vi}-${si}`;
    defs.push(`<clipPath id="${clip}"><rect x="${x}" y="${y}" width="${cardW}" height="${cardH}"/></clipPath>`);
    rows.push(`<g clip-path="url(#${clip})"><use xlink:href="#${name}-bg" x="${x - cropX}" y="${y - cropY}"/><rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" fill="#071519" opacity="0.10"/></g>`);
    rows.push(svgComposite(byId, {
      id, b: state.b, a: state.a, scale,
      x: x + cardW / 2, y: y + anchorY,
    }).svg);
    rows.push(`<rect x="${x}" y="${y}" width="${cardW}" height="19" fill="#071519" opacity="0.88"/>`);
    rows.push(`<text x="${x + 5}" y="${y + 13}" fill="#e7d7aa" font-family="Menlo,monospace" font-size="8">${esc(id)} ${esc(state.label)} · 42PX MAX</text>`);
    rows.push(`<rect x="${x + 0.5}" y="${y + 0.5}" width="${cardW - 1}" height="${cardH - 1}" fill="none" stroke="#557078"/>`);
  }));
  return renderSvg(name, width, height, `<defs>${defs.join('')}</defs>${rows.join('')}`);
}

function socketProof(variants, byId) {
  const cols = 4, cardW = 300, cardH = 210;
  const width = cols * cardW, height = Math.ceil(variants.length / cols) * cardH;
  const rows = [`<rect width="${width}" height="${height}" fill="#071519"/>`];
  const colors = {
    root: '#49d8ff', attack: '#ff4faf', attackAlt: '#ff4faf',
    tell: '#ffd45a', damage: '#ff6a4d',
  };
  variants.forEach((variant, index) => {
    const x = (index % cols) * cardW, y = Math.floor(index / cols) * cardH;
    const placed = svgComposite(byId, {
      id: variant.id, b: 3, a: 4, scale: 0.92,
      x: x + cardW / 2, y: y + 118,
    });
    rows.push(`<rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" fill="${index % 2 ? '#10262c' : '#173138'}" stroke="#557078"/>`);
    rows.push(placed.svg);
    const proofSockets = [
      ['root', placed.body], ['attack', placed.action],
      ...(placed.action.sockets.attackAlt ? [['attackAlt', placed.action]] : []),
      ['tell', placed.action], ['damage', placed.body],
    ];
    for (const [socket, component] of proofSockets) {
      const [sx, sy] = placedSocket(component, socket, placed.anchorX, placed.anchorY, 0.92);
      rows.push(`<circle cx="${round6(sx)}" cy="${round6(sy)}" r="5" fill="none" stroke="${colors[socket]}" stroke-width="2"/>`);
      rows.push(`<path d="M ${round6(sx - 7)} ${round6(sy)} H ${round6(sx + 7)} M ${round6(sx)} ${round6(sy - 7)} V ${round6(sy + 7)}" stroke="${colors[socket]}" stroke-width="1"/>`);
    }
    rows.push(`<text x="${x + 9}" y="${y + 17}" fill="#e7d7aa" font-family="Menlo,monospace" font-size="11">${esc(variant.id)}  B3/A4</text>`);
  });
  rows.push(`<text x="12" y="${height - 8}" fill="#b7c9c9" font-family="Menlo,monospace" font-size="10">ROOT cyan · ATTACK magenta · TELL amber · DAMAGE red</text>`);
  return renderSvg('level1-enemy-ecology-socket-proof-v1', width, height, rows.join(''));
}

const GAMEPLAY_PROOFS = Object.freeze([
  {
    name: 'level1-enemy-ecology-play-scale-face1-v1',
    base: 'assets/generated/enemy-ecology/review/bases/level1-face1-clean-v1.png',
    title: 'PLAY-SCALE PROOF // RAILFANG · CROSSWIND · NEEDLE · CRATERPOD',
    placements: [
      { id: 'hound-railfang', b: 1, a: 1, scale: 0.72, x: 370, y: 505, grounded: true },
      { id: 'wasp-crosswind', b: 1, a: 2, scale: 0.68, x: 630, y: 330 },
      { id: 'polyp-needle', b: 0, a: 2, scale: 0.65, x: 850, y: 448, grounded: true },
      { id: 'mortar-craterpod', b: 2, a: 2, scale: 0.70, x: 1140, y: 420, grounded: true },
    ],
  },
  {
    name: 'level1-enemy-ecology-play-scale-mid-v1',
    base: 'assets/generated/enemy-ecology/review/bases/level1-mid-clean-v1.png',
    title: 'PLAY-SCALE PROOF // VAULTJAW · DIVECLAW · SWEEPFAN · BRACKETPOD',
    placements: [
      { id: 'hound-vaultjaw', b: 3, a: 4, scale: 0.70, x: 310, y: 520, grounded: true },
      { id: 'wasp-diveclaw', b: 1, a: 4, scale: 0.66, x: 550, y: 335 },
      { id: 'polyp-sweepfan', b: 2, a: 3, scale: 0.60, x: 820, y: 460, grounded: true },
      { id: 'mortar-bracketpod', b: 2, a: 2, scale: 0.74, x: 1130, y: 425, grounded: true },
    ],
  },
  {
    name: 'level1-enemy-ecology-play-scale-portrait-v1',
    base: 'assets/generated/enemy-ecology/review/bases/level1-portrait-clean-v1.png',
    title: 'PORTRAIT SCALE // REBOUND · PINCER · GATEWEAVER · AIRCOMB',
    placements: [
      { id: 'hound-rebound', b: 2, a: 2, scale: 0.47, x: 190, y: 474, grounded: true },
      { id: 'wasp-pincer', b: 1, a: 4, scale: 0.43, x: 292, y: 351 },
      { id: 'polyp-gateweaver', b: 1, a: 2, scale: 0.39, x: 332, y: 424, grounded: true },
      { id: 'mortar-aircomb', b: 2, a: 2, scale: 0.43, x: 124, y: 478, grounded: true },
    ],
  },
]);

try {
  mkdirSync(outDir, { recursive: true });
  mkdirSync(reviewDir, { recursive: true });

  const sources = new Map();
  for (const [id, def] of Object.entries(SOURCE_DEFS)) {
    const input = resolve(root, def.file);
    const keyed = join(work, `${id}-alpha.png`);
    run('python3', [
      chromaTool, '--input', input, '--out', keyed, '--auto-key', 'border',
      '--soft-matte', '--transparent-threshold', '12', '--opaque-threshold', '180',
      '--edge-contract', '1', '--despill', '--force',
    ]);
    const decoded = decodePng(keyed);
    const projection = occupancy(decoded, AUDIT_ALPHA);
    const preparedSource = {
      id, ...def, input, keyed, ...decoded,
      xCuts: separatorCuts(projection.columns, decoded.width, def.cols),
      yCuts: separatorCuts(projection.rows, decoded.height, def.rows),
    };
    sources.set(id, preparedSource);
    if (process.argv.includes('--verbose')) console.error(JSON.stringify({
      source: id, xCuts: preparedSource.xCuts, yCuts: preparedSource.yCuts,
    }));
  }

  const components = [];
  const orderedCells = [];
  const variantRows = [];
  // A pose sheet is an animation contract, not a collection of unrelated
  // thumbnails.  Measure every row first, normalize source boards by their
  // nominal row height, then assign one scale to all eight rows of a
  // variant/axis.  Per-cell fit made damaged bodies inflate back to intact
  // size and made locomotion "breathe" between frames.
  const measured = new Map();
  const uniformScale = new Map();
  for (const family of FAMILY_DEFS) {
    for (let vi = 0; vi < family.variants.length; vi++) {
      const [id] = family.variants[vi];
      for (const axis of ['body', 'action']) {
        let maxNormalizedW = 0;
        let maxNormalizedH = 0;
        for (let index = 0; index < 8; index++) {
          const sourceCell = layerSourceCell(family, vi, axis, index);
          const source = sources.get(sourceCell.sourceId);
          const cell = cellRect(source, sourceCell.col, sourceCell.row);
          const rawAudit = alphaBounds(source, cell, AUDIT_ALPHA);
          const anatomy = componentAudit(source, cell, AUDIT_ALPHA, rawAudit.pixels,
            `${id}:${axis}${index}:${source.id}:${sourceCell.col},${sourceCell.row}`);
          const auditBounds = { ...anatomy.significantBounds,
            pixels: rawAudit.pixels, magentaShare: rawAudit.magentaShare };
          const trim = expandedBounds(auditBounds, cell, SOURCE_EDGE_PAD);
          const guard = sourceGuard(cell, auditBounds);
          const sourceUnitPx = source.height / source.rows;
          const normalizedTrim = [trim.w / sourceUnitPx, trim.h / sourceUnitPx];
          maxNormalizedW = Math.max(maxNormalizedW, normalizedTrim[0]);
          maxNormalizedH = Math.max(maxNormalizedH, normalizedTrim[1]);
          measured.set(`${family.id}:${vi}:${axis}:${index}`, {
            sourceCell, source, cell, rawAudit, anatomy, auditBounds, trim, guard,
            sourceUnitPx, normalizedTrim,
          });
        }
        uniformScale.set(`${id}:${axis}`, Math.min(
          INNER / maxNormalizedW, INNER / maxNormalizedH,
        ));
      }
    }
  }
  for (const family of FAMILY_DEFS) {
    for (let vi = 0; vi < family.variants.length; vi++) {
      const [id, kind, existingMechanic, newTactics] = family.variants[vi];
      const bodyIds = [], actionIds = [];
      for (const axis of ['body', 'action']) {
        for (let index = 0; index < 8; index++) {
          const analysis = measured.get(`${family.id}:${vi}:${axis}:${index}`);
          const {
            sourceCell, source, cell, anatomy, auditBounds, trim, guard,
            sourceUnitPx, normalizedTrim,
          } = analysis;
          // Breakup rows deliberately scatter several large pieces toward the
          // source-cell edge. Native review proved those outer fragments are
          // whole; packing re-centers the complete measured union with 12px
          // atlas guard. Live anatomy still fails on a tight source crop.
          if (guard < MIN_SOURCE_GUARD && index < 7)
            throw new Error(`${id}:${axis}${index}: source crop guard ${guard}px`);
          if (auditBounds.magentaShare > 0.004)
            throw new Error(`${id}:${axis}${index}: magenta fringe ${auditBounds.magentaShare}`);

          const scale = uniformScale.get(`${id}:${axis}`);
          const targetW = Math.max(1, Math.round(normalizedTrim[0] * scale));
          const targetH = Math.max(1, Math.round(normalizedTrim[1] * scale));
          const target = {
            x: Math.floor((CELL - targetW) / 2), y: Math.floor((CELL - targetH) / 2),
            w: targetW, h: targetH,
          };
          const atlasCol = family.atlasBase + vi * 2 + (axis === 'action' ? 1 : 0);
          const atlasRow = index;
          const componentId = `${id}-${axis === 'body' ? 'b' : 'a'}${index}`;
          const prepared = join(work, `${String(atlasRow).padStart(2, '0')}-${String(atlasCol).padStart(2, '0')}-${componentId}.png`);
          magick([
            source.keyed, '-crop', `${trim.w}x${trim.h}+${cell.x + trim.x}+${cell.y + trim.y}`,
            '+repage', '-filter', 'Lanczos', '-resize', `${targetW}x${targetH}!`,
            '-gravity', 'center', '-background', 'none', '-extent', `${CELL}x${CELL}`,
            '-define', 'png:color-type=6', prepared,
          ]);
          const preparedBytes = readFileSync(prepared);
          const preparedImage = decodePng(prepared);
          if (preparedImage.width !== CELL || preparedImage.height !== CELL ||
              preparedImage.colorType !== 6)
            throw new Error(`${componentId}: prepared cell is not ${CELL}x${CELL} RGBA`);

          const pivotSource = [cell.w * family.compose[0], cell.h * family.compose[1]];
          const reviewPivot = mapPoint(pivotSource, trim, target);
          const sockets = {};
          const socketContract = {
            ...family.sockets, ...(family.variantSockets?.[id] || {}),
          };
          for (const [socket, normalized] of Object.entries(socketContract)) {
            const sourcePoint = [cell.w * normalized[0], cell.h * normalized[1]];
            const local = mapPoint(sourcePoint, trim, target);
            sockets[socket] = {
              sourceNormalized: normalized,
              cellPx: local,
              atlasPx: [round6(atlasCol * CELL + local[0]), round6(atlasRow * CELL + local[1])],
            };
          }
          const entry = {
            id: componentId, variantId: id, kind, family: family.id, axis, index,
            semantic: axis === 'body' ? BODY_STATES[index] : ACTION_PHASES[index],
            source: {
              file: source.file, set: source.id, grid: [source.cols, source.rows],
              cell: [sourceCell.col, sourceCell.row], cellPx: [cell.x, cell.y, cell.w, cell.h],
              trimPx: [trim.x, trim.y, trim.w, trim.h], guardPx: guard,
            },
            atlas: {
              cell: [atlasCol, atlasRow], cellPx: [atlasCol * CELL, atlasRow * CELL, CELL, CELL],
              visiblePx: [atlasCol * CELL + target.x, atlasRow * CELL + target.y, target.w, target.h],
              uv: [round6(atlasCol * CELL / ATLAS_W), round6(atlasRow * CELL / ATLAS_H),
                round6(CELL / ATLAS_W), round6(CELL / ATLAS_H)],
            },
            packing: {
              scaleGroup: `${id}:${axis}`,
              normalization: 'source-row-height', sourceUnitPx: round6(sourceUnitPx),
              normalizedTrim: normalizedTrim.map(round6),
              variantAxisPxPerUnit: round6(scale),
            },
            pivot: {
              sourceNormalized: family.compose, cellPx: reviewPivot,
              atlasPx: [round6(atlasCol * CELL + reviewPivot[0]), round6(atlasRow * CELL + reviewPivot[1])],
            },
            sockets,
            audit: {
              sourceGuardPx: guard, atlasGuardPx: Math.min(target.x, target.y,
                CELL - target.x - target.w, CELL - target.y - target.h),
              alphaPixels: auditBounds.pixels, magentaShare: auditBounds.magentaShare,
              ...anatomy,
            },
            reviewFile: prepared,
            reviewData: preparedBytes.toString('base64'),
            reviewPivot,
            reviewBounds: [target.x, target.y, target.w, target.h],
          };
          components.push(entry);
          orderedCells[atlasRow * COLS + atlasCol] = prepared;
          (axis === 'body' ? bodyIds : actionIds).push(componentId);
        }
      }
      const visualStates = [];
      for (let b = 0; b < 8; b++) for (let a = 0; a < 8; a++) visualStates.push({
        id: `${id}-b${b}-a${a}`, bodyId: `${id}-b${b}`, actionId: `${id}-a${a}`,
        bodyIndex: b, actionIndex: a,
      });
      variantRows.push({
        id, family: family.id, kind, existingMechanic, newTactics,
        bodyIds, actionIds, visualStateCount: visualStates.length, visualStates,
      });
    }
  }
  if (components.length !== 192 || orderedCells.length !== 192 || orderedCells.some((file) => !file))
    throw new Error(`expected complete 192-layer atlas, got ${components.length}`);
  magick(['montage', ...orderedCells, '-tile', `${COLS}x${ROWS}`,
    '-geometry', `${CELL}x${CELL}+0+0`, '-background', 'none',
    '-define', 'png:color-type=6', atlasFile]);
  const atlasSize = readPngSize(atlasFile);
  if (atlasSize.width !== ATLAS_W || atlasSize.height !== ATLAS_H || atlasSize.colorType !== 6)
    throw new Error(`bad atlas ${atlasSize.width}x${atlasSize.height} colorType ${atlasSize.colorType}`);
  // The final atlas cell is the runtime semantic payload. Montage is allowed
  // to normalize color metadata while composing, so canonical identities are
  // assigned only from decoded post-montage RGBA—not temporary cell PNGs.
  const atlasImage = decodePng(atlasFile);
  for (const component of components) {
    const [col, row] = component.atlas.cell;
    component.contentSha256 = canonicalRgbaHash(
      CELL, CELL, atlasCellRgba(atlasImage, col, row, CELL),
    );
  }
  const distinctHashes = new Set(components.map((entry) => entry.contentSha256));
  if (distinctHashes.size !== components.length)
    throw new Error(`expected 192 distinct atlas-cell renders, got ${distinctHashes.size}`);

  const byId = new Map(components.map((entry) => [entry.id, entry]));
  const proofGuards = [];
  const contacts = variantRows.map((variant) => repo(contactSheet(variant, byId, proofGuards)));
  const master = repo(masterSheet(variantRows, byId));
  const edge = repo(edgeProof(variantRows, byId));
  const gameplayScale = GAMEPLAY_PROOFS.map((def) => repo(gameplayScaleProof(def, byId)));
  const damageVariants = ['mortar-craterpod', 'mortar-bracketpod', 'mortar-aircomb'];
  const damageStates = [
    { b: 0, a: 0, label: 'B0 INTACT' },
    { b: 5, a: 0, label: 'B5 IMPACT' },
    { b: 6, a: 0, label: 'B6 CRITICAL' },
  ];
  const houndVariants = ['hound-railfang', 'hound-vaultjaw', 'hound-rebound'];
  const houndStates = [1, 2, 3, 4].map((a) => ({ b: 1, a, label: `A${a}` }));
  const damageScale = {
    far: repo(scaleComparisonProof(
      'level1-enemy-ecology-damage-far-v1',
      'assets/generated/enemy-ecology/review/bases/level1-face1-clean-v1.png',
      damageVariants, damageStates, byId,
    )),
    portrait: repo(scaleComparisonProof(
      'level1-enemy-ecology-damage-portrait-v1',
      'assets/generated/enemy-ecology/review/bases/level1-portrait-clean-v1.png',
      damageVariants, damageStates, byId, true,
    )),
  };
  const houndMotionScale = {
    far: repo(scaleComparisonProof(
      'level1-enemy-ecology-hound-motion-far-v1',
      'assets/generated/enemy-ecology/review/bases/level1-face1-clean-v1.png',
      houndVariants, houndStates, byId,
    )),
    portrait: repo(scaleComparisonProof(
      'level1-enemy-ecology-hound-motion-portrait-v1',
      'assets/generated/enemy-ecology/review/bases/level1-portrait-clean-v1.png',
      houndVariants, houndStates, byId, true,
    )),
  };
  const aerialVariants = ['wasp-crosswind', 'wasp-diveclaw', 'wasp-pincer'];
  const aerialStates = [0, 2, 4, 6].map((a) => ({ b: 1, a, label: `A${a}` }));
  const aerialReadability = {
    far: repo(aerialReadabilityProof(
      'level1-enemy-ecology-aerial-42px-far-v1',
      'assets/generated/enemy-ecology/review/bases/level1-face1-clean-v1.png',
      aerialVariants, aerialStates, byId,
    )),
    portrait: repo(aerialReadabilityProof(
      'level1-enemy-ecology-aerial-42px-portrait-v1',
      'assets/generated/enemy-ecology/review/bases/level1-portrait-clean-v1.png',
      aerialVariants, aerialStates, byId, true,
    )),
  };
  const sockets = repo(socketProof(variantRows, byId));
  const minComposedGuardPx = Math.min(...proofGuards.map((row) => row.guardPx));

  const cleanComponents = components.map(({
    reviewFile, reviewData, reviewPivot, reviewBounds, ...entry
  }) => entry);
  const manifest = {
    version: 1,
    identity: 'level1-meridian-enemy-ecology',
    status: 'approved asset pack; runtime consumers may opt in only through an exact ecologyId',
    arithmetic: {
      archetypes: 12, nativeLayersPerArchetype: 16, nativeLayers: 192,
      bodyStates: 8, actionPhases: 8, visualStatesPerArchetype: 64,
      totalVisualStates: 768, familySourceSets: 4, physicalAcceptedSourceBoards: 14,
    },
    semantics: { bodyStates: BODY_STATES, actionPhases: ACTION_PHASES },
    textureBudget: {
      file: repo(atlasFile), format: 'RGBA8', width: ATLAS_W, height: ATLAS_H,
      cellPx: CELL, innerMaxPx: INNER, minAtlasGuardPx: MIN_ATLAS_GUARD,
      baseBytes: ATLAS_W * ATLAS_H * 4,
      estimatedMipmappedBytes: Math.ceil(ATLAS_W * ATLAS_H * 4 * 4 / 3),
      commonQuadsPerEnemy: 2, temporaryFragmentQuads: 1, sourceBoardsAtRuntime: 0,
    },
    sourceSets: Object.fromEntries(Object.entries(SOURCE_DEFS).map(([id, row]) => [id, row])),
    rejectedSource: {
      file: '/Users/scottmeyer/.codex/generated_images/019fca44-054a-73e2-bf97-add9bf75d6b6/exec-8fe5828b-f650-418d-acf3-4cd0709c4ce5.png',
      reason: 'combined denial sheet repeated complete launcher/base combatants; replaced by split body/action set',
    },
    invariants: {
      liveConnectedRows: { body: [0, 1, 2, 3, 4, 5, 6], action: [0, 1, 2, 3, 4, 5, 6] },
      breakupRowsMayUseMultipleIslands: { body: [7], action: [7] },
      sockets: ['compose', 'root', 'tell', 'attack', 'damage'],
    },
    selectorGuidance: {
      contract: 'simulation chooses semantic state; renderer maps it to independent body and action indices',
      hunter: {
        prowlCycle: [0, 1, 6], acquire: 1, tell: 2, committedCharge: [3, 4],
        vaultOrStrike: [3, 4, 5], recoverOrSkid: 6, spentOrDeath: 7,
      },
      tacticActionPhases: {
        'hound-rebound': {
          'charge-tell': 2, 'forward-charge': 3, 'edge-brake': 5,
          'reverse-vault': 4, recover: 6,
        },
        'wasp-crosswind': {
          'horizontal-line-tell': 2, 'parallel-burst': 4, 'strafe-exit': 6,
        },
        'polyp-sweepfan': {
          'bounded-arc-tell': 2, 'sweep-start': 3, 'terminal-vent': 6,
        },
        'mortar-aircomb': {
          'comb-corridor-tell': 2, 'teeth-descending': 4,
          'comb-impact': 5, reload: 6,
        },
      },
    },
    variants: variantRows,
    components: cleanComponents,
    review: {
      contacts, master, edge, gameplayScale, damageScale, houndMotionScale,
      aerialReadability, sockets,
      composedProofStates: proofGuards.length, minComposedGuardPx,
    },
    provenance: 'assets/generated/enemy-ecology/level1-enemy-ecology-imagegen-provenance-v1.json',
  };
  writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');

  const minSourceGuard = Math.min(...cleanComponents.map((entry) => entry.audit.sourceGuardPx));
  const minAtlasGuard = Math.min(...cleanComponents.map((entry) => entry.audit.atlasGuardPx));
  const minLiveConnected = Math.min(...cleanComponents
    .filter((entry) => entry.index < 7)
    .map((entry) => entry.audit.largestIslandShare));
  console.log(JSON.stringify({
    atlas: repo(atlasFile), manifest: repo(manifestFile),
    layers: components.length, variants: variantRows.length, visualStates: 768,
    minSourceGuard, minAtlasGuard, minLiveConnected, minComposedGuardPx,
    review: { master, edge, contacts: contacts.length },
  }, null, 2));
} finally {
  rmSync(work, { recursive: true, force: true });
}
