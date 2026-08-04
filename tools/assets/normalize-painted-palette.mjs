#!/usr/bin/env node
/* Deterministic finishing for ImageGen paintings. Keep legal pixels byte-for-
   byte. For an opaque/visible pixel whose CIELCh hue belongs to no declared
   project role, reduce only as much chroma as needed by moving its RGB toward
   an equal-channel luma neutral. Geometry and alpha are never touched.

   This is intentionally a finishing tool, not a runtime dependency. It makes
   the same conservative correction documented on the shipped wasp/hound
   atlases available to environment packs without copying one-off scripts. */

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decodePng } from './lib/png.mjs';
import { classify } from './lib/palette.mjs';

function usage(message = '') {
  if (message) console.error(message);
  console.error('usage: node tools/assets/normalize-painted-palette.mjs --input in.png --out out.png [--alpha-floor 32]');
  process.exit(2);
}

const argv = process.argv.slice(2);
const value = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};
const input = value('--input');
const output = value('--out');
const alphaFloor = Number(value('--alpha-floor') ?? 32);
if (!input || !output) usage();
if (!Number.isFinite(alphaFloor) || alphaFloor < 0 || alphaFloor > 254)
  usage('--alpha-floor must be between 0 and 254');

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

function chunk(type, data) {
  const t = Buffer.from(type);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  t.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([t, data])), 8 + data.length);
  return out;
}

function writePng(file, width, height, rgba) {
  const stride = width * 4;
  const scan = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1);
    scan[row] = 1;
    for (let x = 0; x < stride; x++) {
      const current = rgba[y * stride + x];
      const left = x >= 4 ? rgba[y * stride + x - 4] : 0;
      scan[row + 1 + x] = (current - left + 256) & 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(scan, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
const rgbKey = (r, g, b) => (r << 16) | (g << 8) | b;

function legal(rgb) {
  return classify(rgb).ok;
}

function normalized(r, g, b) {
  const original = { r, g, b };
  if (legal(original)) return [r, g, b, 0];
  const luma = clamp(r * 0.2126 + g * 0.7152 + b * 0.0722);
  const candidate = (t) => ({
    r: clamp(r + (luma - r) * t),
    g: clamp(g + (luma - g) * t),
    b: clamp(b + (luma - b) * t),
  });

  let lo = 0;
  let hi = 1;
  for (let i = 1; i <= 20; i++) {
    const t = i / 20;
    if (legal(candidate(t))) { hi = t; break; }
    lo = t;
  }
  for (let i = 0; i < 8; i++) {
    const mid = (lo + hi) / 2;
    if (legal(candidate(mid))) hi = mid;
    else lo = mid;
  }
  const out = candidate(Math.min(1, hi + 0.004));
  // Integer rounding can straddle the boundary. The neutral endpoint is the
  // bounded fallback and retains the original light/dark value.
  const final = legal(out) ? out : { r: luma, g: luma, b: luma };
  return [final.r, final.g, final.b, hi];
}

const sourcePath = resolve(input);
const outputPath = resolve(output);
const { width, height, rgba } = decodePng(sourcePath);
const cache = new Map();
let changedPixels = 0;
let changedColors = 0;
let neutralization = 0;

for (let i = 0; i < rgba.length; i += 4) {
  if (rgba[i + 3] <= alphaFloor) continue;
  const key = rgbKey(rgba[i], rgba[i + 1], rgba[i + 2]);
  let replacement = cache.get(key);
  if (!replacement) {
    replacement = normalized(rgba[i], rgba[i + 1], rgba[i + 2]);
    cache.set(key, replacement);
    if (replacement[3] > 0) changedColors++;
  }
  if (replacement[3] <= 0) continue;
  rgba[i] = replacement[0];
  rgba[i + 1] = replacement[1];
  rgba[i + 2] = replacement[2];
  neutralization += replacement[3];
  changedPixels++;
}

writePng(outputPath, width, height, rgba);
console.log(JSON.stringify({
  input: sourcePath,
  output: outputPath,
  width,
  height,
  alphaFloor,
  changedPixels,
  changedShare: +(changedPixels / (width * height)).toFixed(6),
  changedColors,
  meanNeutralization: changedPixels ? +(neutralization / changedPixels).toFixed(4) : 0,
}, null, 2));
