#!/usr/bin/env node
// Build the production RIG atlases from approved ImageGen source boards.
//
// This is intentionally an extraction/repack, not an art synthesizer:
//   - no pose is resampled, stretched, rotated, or redrawn;
//   - each intended cell keeps only its connected character assembly;
//   - chroma sources receive a straight-alpha green-key matte;
//   - every used output cell is validated for one assembly and a clear guard.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

import { REPO_ROOT } from './lib/browser.mjs';
import { decodePng } from './lib/png.mjs';
import { classify } from './lib/palette.mjs';

const SPRITES = resolve(REPO_ROOT, 'assets/generated/sprites');
const ALPHA_FLOOR = 8;
const COMPONENT_FLOOR = 40;
const GUARD = 24;

const JOBS = [
  {
    id: 'rig-slender-body-atlas-v2',
    source: 'rig-slender-core-palette-v2.png',
    sourceGrid: [4, 4],
    output: [2048, 1024], outputCell: [512, 512],
    poses: [
      { name: 'idle', sourceCell: 0, outputCell: 0, placement: 'trim-center' },
      { name: 'contact', sourceCell: 1, outputCell: 1, placement: 'trim-center' },
      { name: 'pass', sourceCell: 2, outputCell: 2, placement: 'trim-center' },
      { name: 'flight', sourceCell: 3, outputCell: 3, placement: 'trim-center' },
      { name: 'air-rise', sourceCell: 4, outputCell: 4, placement: 'trim-center' },
      { name: 'air-fall', sourceCell: 5, outputCell: 5, placement: 'trim-center' },
    ],
  },
  {
    id: 'rig-slender-aim-atlas-v2',
    source: 'rig-slender-aim-chroma-v2.png',
    sourceGrid: [4, 1], chromaGreen: true,
    output: [2048, 1024], outputCell: [512, 1024],
    poses: [
      { name: 'right', sourceCell: 0, outputCell: 0, placement: 'trim-center' },
      { name: 'up-right', sourceCell: 1, outputCell: 1, placement: 'trim-center' },
      { name: 'up', sourceCell: 2, outputCell: 2, placement: 'trim-center' },
      { name: 'down-right', sourceCell: 3, outputCell: 3, placement: 'trim-center' },
    ],
  },
  {
    id: 'rig-slender-climb-atlas-v2',
    source: 'rig-slender-climb-chroma-v2.png',
    sourceGrid: [4, 1], chromaGreen: true,
    output: [2048, 1024], outputCell: [512, 1024],
    poses: [
      { name: 'left-reach', sourceCell: 0, outputCell: 0, placement: 'preserve-cell' },
      { name: 'left-drive', sourceCell: 1, outputCell: 1, placement: 'preserve-cell' },
      { name: 'right-reach', sourceCell: 2, outputCell: 2, placement: 'preserve-cell' },
      { name: 'right-drive', sourceCell: 3, outputCell: 3, placement: 'preserve-cell' },
    ],
  },
];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const colorKey = (r, g, b) => (r << 16) | (g << 8) | b;

// ImageGen's painterly micro-hues occasionally fall between the project's
// declared rust/warm/teal bands. Keep legal pixels byte-for-byte and pull only
// an illegal color's chroma toward equal-channel luma until it enters a legal
// band. Geometry and alpha are untouched; this is the same conservative
// finishing rule used by normalize-painted-palette.mjs, embedded here so one
// command always reproduces the promoted atlases.
function normalizePalette(rgba, alphaFloor = 32) {
  const cache = new Map();
  let changedPixels = 0;
  let changedColors = 0;
  let neutralization = 0;
  const normalized = (r, g, b) => {
    const original = { r, g, b };
    if (classify(original).ok) return [r, g, b, 0];
    const luma = clamp(Math.round(r * 0.2126 + g * 0.7152 + b * 0.0722), 0, 255);
    const candidate = (t) => ({
      r: clamp(Math.round(r + (luma - r) * t), 0, 255),
      g: clamp(Math.round(g + (luma - g) * t), 0, 255),
      b: clamp(Math.round(b + (luma - b) * t), 0, 255),
    });
    let lo = 0, hi = 1;
    for (let i = 1; i <= 20; i++) {
      const t = i / 20;
      if (classify(candidate(t)).ok) { hi = t; break; }
      lo = t;
    }
    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) / 2;
      if (classify(candidate(mid)).ok) hi = mid;
      else lo = mid;
    }
    const out = candidate(Math.min(1, hi + 0.004));
    const final = classify(out).ok ? out : { r: luma, g: luma, b: luma };
    return [final.r, final.g, final.b, hi];
  };
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] <= alphaFloor) continue;
    const key = colorKey(rgba[i], rgba[i + 1], rgba[i + 2]);
    let replacement = cache.get(key);
    if (!replacement) {
      replacement = normalized(rgba[i], rgba[i + 1], rgba[i + 2]);
      cache.set(key, replacement);
      if (replacement[3] > 0) changedColors++;
    }
    if (replacement[3] <= 0) continue;
    rgba[i] = replacement[0]; rgba[i + 1] = replacement[1]; rgba[i + 2] = replacement[2];
    neutralization += replacement[3];
    changedPixels++;
  }
  return { alphaFloor, changedPixels, changedColors,
    changedShare: +(changedPixels / (rgba.length / 4)).toFixed(6),
    meanNeutralization: changedPixels ? +(neutralization / changedPixels).toFixed(4) : 0 };
}

function gridBounds(total, count) {
  return Array.from({ length: count + 1 }, (_, i) => Math.round(i * total / count));
}

// ImageGen's green is a gently varying neon field rather than one literal
// byte value. Green dominance gives a stable matte without deleting cream,
// orange, amber, black, or gunmetal pixels (none is green-dominant).
function removeGreen(decoded) {
  const out = new Uint8Array(decoded.rgba.length);
  const bg = [34, 240, 31];
  for (let i = 0; i < decoded.rgba.length; i += 4) {
    const r = decoded.rgba[i], g = decoded.rgba[i + 1], b = decoded.rgba[i + 2];
    const dominance = g - Math.max(r, b);
    const a = clamp((150 - dominance) / 125, 0, 1);
    if (a <= 0.015) continue;
    const recover = (v, k) => clamp(Math.round((v - k * (1 - a)) / Math.max(0.04, a)), 0, 255);
    out[i] = recover(r, bg[0]);
    out[i + 1] = recover(g, bg[1]);
    out[i + 2] = recover(b, bg[2]);
    out[i + 3] = Math.round(a * 255);
  }
  return { ...decoded, rgba: out };
}

function components(decoded, rect, floor = COMPONENT_FLOOR) {
  const { width, rgba } = decoded;
  const { x: rx, y: ry, w: rw, h: rh } = rect;
  const seen = new Uint8Array(rw * rh);
  const found = [];
  const qx = new Int32Array(rw * rh), qy = new Int32Array(rw * rh);
  for (let ly = 0; ly < rh; ly++) for (let lx = 0; lx < rw; lx++) {
    const local = ly * rw + lx;
    const alpha = rgba[((ry + ly) * width + rx + lx) * 4 + 3];
    if (seen[local] || alpha < floor) continue;
    let head = 0, tail = 0;
    qx[tail] = lx; qy[tail++] = ly; seen[local] = 1;
    const pixels = [];
    let x0 = lx, y0 = ly, x1 = lx, y1 = ly;
    while (head < tail) {
      const x = qx[head], y = qy[head++];
      pixels.push(y * rw + x);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y);
      x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || xx >= rw || yy < 0 || yy >= rh) continue;
        const p = yy * rw + xx;
        if (seen[p]) continue;
        if (rgba[((ry + yy) * width + rx + xx) * 4 + 3] < floor) continue;
        seen[p] = 1; qx[tail] = xx; qy[tail++] = yy;
      }
    }
    found.push({ pixels, count: pixels.length, x0, y0, x1, y1 });
  }
  return found.sort((a, b) => b.count - a.count);
}

function extractAssembly(decoded, rect) {
  const { width, rgba } = decoded;
  const cs = components(decoded, rect);
  if (!cs.length) throw new Error(`no character component in ${JSON.stringify(rect)}`);
  const main = cs[0];
  if (main.count < 1500) throw new Error(`undersized character component (${main.count}px)`);
  const { x: rx, y: ry, w: rw, h: rh } = rect;
  const keep = new Uint8Array(rw * rh);
  for (const p of main.pixels) keep[p] = 1;
  // Recover the soft alpha skirt discarded by the connected-component floor.
  // Expansion is local to the accepted assembly, so neighboring-cell debris
  // cannot ride along merely because it shares the conceptual quarter.
  for (let pass = 0; pass < 4; pass++) {
    const before = new Uint8Array(keep);
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
      const p = y * rw + x;
      if (before[p] || rgba[((ry + y) * width + rx + x) * 4 + 3] === 0) continue;
      for (let dy = -1; dy <= 1 && !keep[p]; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && xx < rw && yy >= 0 && yy < rh && before[yy * rw + xx]) keep[p] = 1;
      }
    }
  }

  let x0 = rw, y0 = rh, x1 = -1, y1 = -1, painted = 0, partial = 0;
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
    const p = y * rw + x;
    if (!keep[p]) continue;
    const a = rgba[((ry + y) * width + rx + x) * 4 + 3];
    if (a <= ALPHA_FLOOR) continue;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y);
    x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    painted++; if (a < 247) partial++;
  }
  return { keep, rect, bounds: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 },
    painted, partial, rejectedComponents: cs.slice(1).map((c) => c.count) };
}

function copyAssembly(decoded, assembly, target, targetWidth, dx, dy) {
  const { width, rgba } = decoded;
  const { rect, keep } = assembly;
  for (let y = 0; y < rect.h; y++) for (let x = 0; x < rect.w; x++) {
    if (!keep[y * rect.w + x]) continue;
    const tx = dx + x, ty = dy + y;
    if (tx < 0 || tx >= targetWidth || ty < 0 || ty >= target.length / 4 / targetWidth) continue;
    const si = ((rect.y + y) * width + rect.x + x) * 4;
    const di = (ty * targetWidth + tx) * 4;
    target[di] = rgba[si]; target[di + 1] = rgba[si + 1];
    target[di + 2] = rgba[si + 2]; target[di + 3] = rgba[si + 3];
  }
}

let crcTable;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type), out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); t.copy(out, 4); data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([t, data])), 8 + data.length);
  return out;
}

function writePng(file, width, height, rgba) {
  const stride = width * 4;
  const scan = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1); scan[row] = 1;
    for (let x = 0; x < stride; x++) {
      const value = rgba[y * stride + x];
      const left = x >= 4 ? rgba[y * stride + x - 4] : 0;
      scan[row + 1 + x] = (value - left + 256) & 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(scan, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(file, png);
}

function outputAlphaBox(rgba, atlasW, rect) {
  let x0 = rect.x + rect.w, y0 = rect.y + rect.h, x1 = rect.x - 1, y1 = rect.y - 1;
  for (let y = rect.y; y < rect.y + rect.h; y++) for (let x = rect.x; x < rect.x + rect.w; x++) {
    if (rgba[(y * atlasW + x) * 4 + 3] <= ALPHA_FLOOR) continue;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y);
    x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

for (const job of JOBS) {
  const sourcePath = resolve(SPRITES, job.source);
  let decoded = decodePng(sourcePath);
  if (job.chromaGreen) decoded = removeGreen(decoded);
  const [sourceCols, sourceRows] = job.sourceGrid;
  const sx = gridBounds(decoded.width, sourceCols);
  const sy = gridBounds(decoded.height, sourceRows);
  const [atlasW, atlasH] = job.output;
  const [cellW, cellH] = job.outputCell;
  const atlas = new Uint8Array(atlasW * atlasH * 4);
  const layout = [];

  for (const pose of job.poses) {
    const sourceCol = pose.sourceCell % sourceCols;
    const sourceRow = Math.floor(pose.sourceCell / sourceCols);
    const sourceRect = {
      x: sx[sourceCol], y: sy[sourceRow],
      w: sx[sourceCol + 1] - sx[sourceCol],
      h: sy[sourceRow + 1] - sy[sourceRow],
    };
    const assembly = extractAssembly(decoded, sourceRect);
    const outputCol = pose.outputCell % Math.floor(atlasW / cellW);
    const outputRow = Math.floor(pose.outputCell / Math.floor(atlasW / cellW));
    const cell = { x: outputCol * cellW, y: outputRow * cellH, w: cellW, h: cellH };
    let dx, dy;
    if (pose.placement === 'preserve-cell') {
      dx = cell.x + Math.floor((cell.w - sourceRect.w) / 2);
      dy = cell.y + Math.floor((cell.h - sourceRect.h) / 2);
    } else {
      dx = cell.x + Math.floor((cell.w - assembly.bounds.w) / 2) - assembly.bounds.x;
      dy = cell.y + Math.floor((cell.h - assembly.bounds.h) / 2) - assembly.bounds.y;
    }
    copyAssembly(decoded, assembly, atlas, atlasW, dx, dy);
    const alpha = outputAlphaBox(atlas, atlasW, cell);
    const guard = {
      left: alpha.x - cell.x, top: alpha.y - cell.y,
      right: cell.x + cell.w - alpha.x - alpha.w,
      bottom: cell.y + cell.h - alpha.y - alpha.h,
    };
    if (Math.min(guard.left, guard.top, guard.right, guard.bottom) < GUARD)
      throw new Error(`${job.id}/${pose.name} violates ${GUARD}px guard: ${JSON.stringify(guard)}`);
    const post = components({ width: atlasW, rgba: atlas }, cell);
    if (post.length !== 1)
      throw new Error(`${job.id}/${pose.name} has ${post.length} output assemblies`);
    layout.push({ name: pose.name, sourceCell: pose.sourceCell, outputCell: pose.outputCell,
      sourceRect, alpha, guard, paintedPixels: assembly.painted,
      partialPixels: assembly.partial, rejectedComponents: assembly.rejectedComponents });
  }

  const paletteFinish = normalizePalette(atlas);
  const outputPath = resolve(SPRITES, `${job.id}.png`);
  writePng(outputPath, atlasW, atlasH, atlas);
  const metadata = {
    id: job.id,
    source: `assets/generated/sprites/${job.source}`,
    output: `assets/generated/sprites/${job.id}.png`,
    sourceSize: [decoded.width, decoded.height], outputSize: job.output,
    outputCell: job.outputCell, method: 'connected assembly extraction + 1:1 integer repack',
    resampled: false, guard: GUARD, alphaFloor: ALPHA_FLOOR,
    componentFloor: COMPONENT_FLOOR, paletteFinish, poses: layout,
  };
  writeFileSync(resolve(SPRITES, `${job.id}.layout.json`), `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(JSON.stringify(metadata, null, 2));
}
