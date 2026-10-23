// raster.mjs — a deterministic software compositor for RIG's held weapon.
//
// It draws the SHIPPED atlases through the SAME placement math the renderer
// uses (src/pure/rig.js: rigBodyPoint, rigWeaponLocalPoint/rigWeaponPlacement/
// rigPlaceWeaponPoint, rigArmPose, rigArmSegmentCorners), so the pixels it
// produces are the pixels three.js is asked to draw, minus lighting, tone
// mapping and mip filtering. Two jobs:
//   1. the T-103 gate measures the RENDERED fist against the RENDERED grip
//      (alpha centroids of painted pixels after placement), not two authored
//      numbers against each other;
//   2. tools/rig-grip/preview.mjs uses it for fast offline contact sheets.
//
// Honesty limit: this is not a GPU. It samples nearest texels, ignores
// mipmaps/lighting, and composites straight alpha in draw order. Its claims
// are about GEOMETRY (where painted pixels land), which is exactly what the
// alignment gate needs; colour fidelity is the browser capture's job.

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodePng } from '../assets/lib/png.mjs';
import {
  RIG_AIM_ATLAS_PATH, RIG_ARM_SEGMENTS, RIG_BODY_ATLAS_PATH, RIG_CLIMB_ATLAS_PATH,
  RIG_GUN_FAMILY_HEIGHT_GAIN, RIG_WEAPON_ART, RIG_WEAPON_ATLAS_PATH,
  rigArmPose, rigArmSegmentCorners, rigBodyFrameSpec, rigBodyPoint,
  rigPlaceWeaponPoint, rigWeaponLocalPoint, rigWeaponPlacement,
} from '../../src/pure/rig.js';

const RIG_JS = new URL('../../src/pure/rig.js', import.meta.url);
const cache = new Map();
export function loadAtlas(relPath) {
  const file = fileURLToPath(new URL(relPath, RIG_JS));
  if (!cache.has(file)) cache.set(file, decodePng(file));
  return cache.get(file);
}
export function atlasFor(frame) {
  if (frame.startsWith('aim-')) return loadAtlas(RIG_AIM_ATLAS_PATH);
  if (frame.startsWith('climb-')) return loadAtlas(RIG_CLIMB_ATLAS_PATH);
  return loadAtlas(RIG_BODY_ATLAS_PATH);
}

// A layer = a textured parallelogram: atlas rect [x, y, w, h] whose corners
// TL, TR, BL land on world points p0, p1, p2 (BR follows). We invert that
// affine map per output pixel.
function layer(img, rect, p0, p1, p2, tag) {
  const [rx, ry, rw, rh] = rect;
  // world = p0 + u*(p1-p0) + v*(p2-p0), u,v in [0,1]
  const ax = p1[0] - p0[0], ay = p1[1] - p0[1];
  const bx = p2[0] - p0[0], by = p2[1] - p0[1];
  const det = ax * by - ay * bx;
  return { img, rx, ry, rw, rh, p0, ax, ay, bx, by, det, tag };
}

function sample(L, wx, wy) {
  if (Math.abs(L.det) < 1e-12) return null;
  const dx = wx - L.p0[0], dy = wy - L.p0[1];
  const u = (dx * L.by - dy * L.bx) / L.det;
  const v = (L.ax * dy - L.ay * dx) / L.det;
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return null;
  const tx = Math.floor(L.rx + u * L.rw), ty = Math.floor(L.ry + v * L.rh);
  const i = (ty * L.img.width + tx) * 4;
  return [L.img.rgba[i], L.img.rgba[i + 1], L.img.rgba[i + 2], L.img.rgba[i + 3], tx, ty];
}

// Build the draw list for one pose. Returns layers in three.js draw order
// (body, far arm, weapon, near arm) plus the solved pose for reporting.
// `inject` exists only so the gate can prove it binds: handOffset [dx,dy]
// (tiles, rig-local) moves the solved gun-hand off its target, as a broken
// solve or a mis-transformed mesh would.
export function poseLayers({ frame, bodyFacing = 1, gunFacing = bodyFacing, aim = [1, 0],
  letter = 'R', muzzleY = 1.05, gain = 1, squash = 1, recoil = 0, arms = true, inject = {} }) {
  const body = rigBodyFrameSpec(frame);
  if (!body) throw new Error(`unknown body frame ${frame}`);
  const s = body.spec;
  const ax0 = (s.atlasX || 0) + s.trimX, ay0 = (s.atlasY || 0) + s.trimY;
  const bp = (x, y) => rigBodyPoint(body, x, y, bodyFacing, gain, squash, [0, 0]);
  const layers = [layer(atlasFor(frame), [ax0, ay0, s.trimW, s.trimH],
    bp(ax0, ay0), bp(ax0 + s.trimW, ay0), bp(ax0, ay0 + s.trimH), 'body')];
  const pose = rigArmPose(frame, bodyFacing, gunFacing, aim[0], aim[1], letter, muzzleY,
    gain, squash, recoil, true, {});
  if (inject.handOffset && pose.ok) {
    pose.gunArm.hx += pose.mirror * inject.handOffset[0];
    pose.gunArm.hy += inject.handOffset[1];
  }
  const bodyAtlas = loadAtlas(RIG_BODY_ATLAS_PATH);
  const armLayers = (arm, tag) => {
    const out = [];
    for (const [segName, j0, j1] of [['upper', 's', 'e'], ['fore', 'e', 'h']]) {
      const seg = RIG_ARM_SEGMENTS[segName];
      const c = rigArmSegmentCorners(seg, arm[j0 + 'x'], arm[j0 + 'y'], arm[j1 + 'x'], arm[j1 + 'y'],
        pose.thick, pose.mirror, new Array(8));
      out.push(layer(bodyAtlas, [seg.x, seg.y, seg.w, seg.h], [c[0], c[1]], [c[2], c[3]], [c[4], c[5]],
        `${tag}-${segName}`));
    }
    return out;
  };
  // three.js order: body, far-layer arms, weapon (+ overlays), near-layer arm
  if (arms && pose.ok && pose.supportArm) layers.push(...armLayers(pose.supportArm, 'support'));
  if (arms && pose.ok && pose.gunLayer === 'far') layers.push(...armLayers(pose.gunArm, 'gun'));
  const spec = RIG_WEAPON_ART[letter];
  const placement = pose.placement;
  const wp = (qx, qy) => {
    const p = rigWeaponLocalPoint(spec, qx, qy, [0, 0]);
    return rigPlaceWeaponPoint(placement, p[0], p[1], p);
  };
  const gx0 = spec.atlasX + spec.trimX, gy0 = spec.atlasY + spec.trimY;
  layers.push(layer(loadAtlas(RIG_WEAPON_ATLAS_PATH), [gx0, gy0, spec.trimW, spec.trimH],
    wp(0, 0), wp(spec.trimW, 0), wp(0, spec.trimH), 'gun'));
  if (arms && pose.ok && pose.gunLayer !== 'far') layers.push(...armLayers(pose.gunArm, 'gun'));
  return { layers, pose, placement, spec };
}

// Restrict a layer to an atlas sub-rect (e.g. only the fist, only the grip)
// without changing its placement.
export function subLayer(L, [sx, sy, sw, sh], tag) {
  const u0 = (sx - L.rx) / L.rw, v0 = (sy - L.ry) / L.rh;
  const u1 = (sx + sw - L.rx) / L.rw, v1 = (sy + sh - L.ry) / L.rh;
  const at = (u, v) => [L.p0[0] + u * L.ax + v * L.bx, L.p0[1] + u * L.ay + v * L.by];
  return layer(L.img, [sx, sy, sw, sh], at(u0, v0), at(u1, v0), at(u0, v1), tag);
}

// Composite layers into an RGBA image covering world [x0,x1]x[y0,y1].
export function composite(layers, { x0, x1, y0, y1, ppt, bg = [0, 0, 0, 0] }) {
  const W = Math.max(1, Math.round((x1 - x0) * ppt)), H = Math.max(1, Math.round((y1 - y0) * ppt));
  const out = new Float32Array(W * H * 4);
  for (let i = 0; i < W * H; i++) out.set(bg.map((c) => c / 255), i * 4);
  for (let py = 0; py < H; py++) {
    const wy = y1 - (py + 0.5) / ppt;
    for (let px = 0; px < W; px++) {
      const wx = x0 + (px + 0.5) / ppt;
      const o = (py * W + px) * 4;
      for (const L of layers) {
        const s = sample(L, wx, wy);
        if (!s || s[3] < 4) continue;
        const a = s[3] / 255;
        out[o] = s[0] / 255 * a + out[o] * (1 - a);
        out[o + 1] = s[1] / 255 * a + out[o + 1] * (1 - a);
        out[o + 2] = s[2] / 255 * a + out[o + 2] * (1 - a);
        out[o + 3] = a + out[o + 3] * (1 - a);
      }
    }
  }
  return { width: W, height: H, data: out };
}

// Alpha-weighted centroid (world units) of ONE layer's opaque painted pixels
// as rendered: a pure measurement of where the paint landed.
export function renderedCentroid(L, { ppt = 600, alphaFloor = 128 } = {}) {
  const pts = [L.p0, [L.p0[0] + L.ax, L.p0[1] + L.ay], [L.p0[0] + L.bx, L.p0[1] + L.by],
    [L.p0[0] + L.ax + L.bx, L.p0[1] + L.ay + L.by]];
  const x0 = Math.min(...pts.map((p) => p[0])), x1 = Math.max(...pts.map((p) => p[0]));
  const y0 = Math.min(...pts.map((p) => p[1])), y1 = Math.max(...pts.map((p) => p[1]));
  let n = 0, sx = 0, sy = 0;
  const W = Math.ceil((x1 - x0) * ppt), H = Math.ceil((y1 - y0) * ppt);
  for (let py = 0; py < H; py++) {
    const wy = y0 + (py + 0.5) / ppt;
    for (let px = 0; px < W; px++) {
      const wx = x0 + (px + 0.5) / ppt;
      const s = sample(L, wx, wy);
      if (!s || s[3] < alphaFloor) continue;
      n++; sx += wx; sy += wy;
    }
  }
  return n ? { x: sx / n, y: sy / n, n } : null;
}

// The same measurement without rasterizing: the alpha centroid of the opaque
// painted pixels in the layer's atlas rect, carried through the layer's own
// corner-derived affine map. A textured quad is an affine image of its atlas
// rect, and affine maps carry centroids exactly, so this equals
// renderedCentroid() up to sampling noise (the gate cross-checks the two on a
// sample of combinations) at a tiny fraction of the cost.
const centroidCache = new Map();
export function paintedCentroid(L, { alphaFloor = 128 } = {}) {
  const key = `${L.img.width}x${L.img.height}:${L.rx},${L.ry},${L.rw},${L.rh}:${alphaFloor}`;
  let c = centroidCache.get(key);
  if (!c) {
    let n = 0, sx = 0, sy = 0;
    for (let y = L.ry; y < L.ry + L.rh; y++) for (let x = L.rx; x < L.rx + L.rw; x++) {
      if (L.img.rgba[(y * L.img.width + x) * 4 + 3] >= alphaFloor) { n++; sx += x + 0.5; sy += y + 0.5; }
    }
    c = n ? { x: sx / n, y: sy / n, n } : null;
    centroidCache.set(key, c);
  }
  if (!c) return null;
  const u = (c.x - L.rx) / L.rw, v = (c.y - L.ry) / L.rh;
  return { x: L.p0[0] + u * L.ax + v * L.bx, y: L.p0[1] + u * L.ay + v * L.by, n: c.n };
}

export function writeRgbaPng(file, { width, height, data }) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    for (let x = 0; x < stride; x++) {
      raw[y * (stride + 1) + 1 + x] = Math.max(0, Math.min(255, Math.round(data[y * stride + x] * 255)));
    }
  }
  const crcTable = new Uint32Array(256).map((_, n) => {
    let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0;
  });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, body) => {
    const t = Buffer.from(type), out = Buffer.alloc(12 + body.length);
    out.writeUInt32BE(body.length, 0); t.copy(out, 4); body.copy(out, 8);
    out.writeUInt32BE(crc(Buffer.concat([t, body])), 8 + body.length); return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  writeFileSync(file, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

export { RIG_GUN_FAMILY_HEIGHT_GAIN, rigWeaponPlacement };
