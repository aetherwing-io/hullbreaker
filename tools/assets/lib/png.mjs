// png.mjs — minimal PNG reader: header-only size, or a full pixel decode.
//
// Zero dependencies on purpose. `node:zlib` already ships the only hard part
// (inflate), so a decoder is ~100 lines of chunk walking and scanline
// unfiltering, and that keeps `check.mjs` runnable with no `npm install` at
// all. Only the rasterizer and viewer need a browser; validation must stay a
// bare `node tools/assets/check.mjs`.
//
// Supported: 8- and 16-bit depth, color types 0/2/3/4/6, non-interlaced.
// Adam7 interlacing throws rather than returning wrong pixels — Chrome's
// screenshot encoder never emits it, so this has cost nothing in practice.

import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunks(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG (bad signature)');
  const out = [];
  let p = 8;
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    out.push({ type, data });
    p += 12 + len;                       // len + type + data + crc
    if (type === 'IEND') break;
  }
  return out;
}

/** Cheap path: IHDR only. Used by the manifest size check, no inflate needed. */
export function readPngSize(file) {
  const buf = readFileSync(file);
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error(`not a PNG: ${file}`);
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    bitDepth: buf[24],
    colorType: buf[25],
    interlace: buf[28],
    bytes: buf.length,
  };
}

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function unfilter(raw, width, height, bpp, stride) {
  const out = Buffer.alloc(height * stride);
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    const line = raw.subarray(rp, rp + stride); rp += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      switch (filter) {
        case 0: break;
        case 1: v += a; break;
        case 2: v += b; break;
        case 3: v += (a + b) >> 1; break;
        case 4: {                                    // Paeth
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          break;
        }
        default: throw new Error(`unknown PNG filter type ${filter} on row ${y}`);
      }
      cur[x] = v & 0xff;
    }
  }
  return out;
}

/**
 * Full decode -> { width, height, rgba: Uint8Array (w*h*4) }.
 * 16-bit samples are truncated to their high byte: this pipeline only ever asks
 * "what hue is this", and 8 bits answers that. Flagged in the README.
 */
export function decodePng(file) {
  const buf = readFileSync(file);
  const cs = chunks(buf);
  const ihdr = cs.find((c) => c.type === 'IHDR');
  if (!ihdr) throw new Error(`no IHDR: ${file}`);
  const width = ihdr.data.readUInt32BE(0);
  const height = ihdr.data.readUInt32BE(4);
  const bitDepth = ihdr.data[8];
  const colorType = ihdr.data[9];
  const interlace = ihdr.data[12];
  if (interlace !== 0) throw new Error(`interlaced (Adam7) PNG is not supported: ${file}`);
  if (bitDepth !== 8 && bitDepth !== 16) {
    throw new Error(`unsupported bit depth ${bitDepth} (need 8 or 16): ${file}`);
  }
  const nch = CHANNELS[colorType];
  if (!nch) throw new Error(`unsupported color type ${colorType}: ${file}`);

  const idat = Buffer.concat(cs.filter((c) => c.type === 'IDAT').map((c) => c.data));
  const raw = inflateSync(idat);
  const sampleBytes = bitDepth / 8;
  const bpp = nch * sampleBytes;
  const stride = width * bpp;
  const px = unfilter(raw, width, height, bpp, stride);

  const plte = cs.find((c) => c.type === 'PLTE');
  const trns = cs.find((c) => c.type === 'tRNS');

  const rgba = new Uint8Array(width * height * 4);
  const sample = (row, i) => px[row * stride + i * sampleBytes];   // high byte when 16-bit
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const i = x * nch;
      if (colorType === 0) {
        const g = sample(y, i);
        rgba[o] = rgba[o + 1] = rgba[o + 2] = g; rgba[o + 3] = 255;
      } else if (colorType === 4) {
        const g = sample(y, i);
        rgba[o] = rgba[o + 1] = rgba[o + 2] = g; rgba[o + 3] = sample(y, i + 1);
      } else if (colorType === 2 || colorType === 6) {
        rgba[o] = sample(y, i); rgba[o + 1] = sample(y, i + 1); rgba[o + 2] = sample(y, i + 2);
        rgba[o + 3] = colorType === 6 ? sample(y, i + 3) : 255;
      } else {                                        // colorType 3: indexed
        if (!plte) throw new Error(`palette PNG without PLTE: ${file}`);
        const idx = sample(y, i);
        rgba[o] = plte.data[idx * 3]; rgba[o + 1] = plte.data[idx * 3 + 1]; rgba[o + 2] = plte.data[idx * 3 + 2];
        rgba[o + 3] = trns && idx < trns.data.length ? trns.data[idx] : 255;
      }
    }
  }
  return { width, height, rgba, colorType, bitDepth };
}

/**
 * Color histogram, alpha-aware.
 * `alphaFloor` (0-255): pixels at or below it are counted as transparent and
 * excluded from coverage entirely — an SVG glyph rasterized on transparency is
 * mostly empty, and counting that emptiness would bury every real color under a
 * 90%-transparent majority.
 */
export function histogram(file, { alphaFloor = 8 } = {}) {
  const { width, height, rgba } = decodePng(file);
  const counts = new Map();
  let opaque = 0, transparent = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3];
    if (a <= alphaFloor) { transparent++; continue; }
    opaque++;
    const key = (rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2];
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const colors = [...counts.entries()]
    .map(([key, count]) => ({
      r: (key >> 16) & 255, g: (key >> 8) & 255, b: key & 255,
      count, coverage: opaque ? count / opaque : 0,
    }))
    .sort((a, b) => b.count - a.count);
  return { width, height, totalPixels: width * height, opaque, transparent, unique: colors.length, colors };
}
