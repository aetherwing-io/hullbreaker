#!/usr/bin/env node
// reference.mjs — T-123: the spike's column A, rebuilt for TODAY's art.
//
//   node tools/crisp-sprite/reference.mjs --capture <dir>/<view>/capture.json [--ss 16]
//
// The T-109 spike's candidate A ("today, crisp") was assembled by
// tools/art/spike/crisp.py from the b114869 atlases, painted arms and all.
// T-103 has since erased those arms and re-poses RIG's own, so that A is no
// longer a picture of the current RIG and cannot be the reference for "gain
// vs its atlas". This rebuilds it the same way for the current art:
//
//   * every layer the game draws, through the SAME placement math
//     src/render/player.js runs (tools/rig-grip/raster.mjs poseLayers:
//     rigBodyPoint, rigArmPose, rigArmSegmentCorners, rigWeaponPlacement),
//     plus the R family accent plates (player.js GUN_FAMILY_ACCENTS.R, in its
//     PAL colours), in three's draw order: body, far arm, gun, accents, near
//     arm;
//   * composed at --ss (default 16) times the LIVE device density recorded by
//     capture.mjs, nearest texel (at 16x the atlas is sampled at or above its
//     own density, so the box below is a true area average);
//   * area-reduced ONCE to device pixels — premultiplied, sRGB-encoded box,
//     50% alpha cut, as Pillow's RGBa BOX resize reduced column A — with the
//     sim point on a pixel EDGE, as the spike pasted it;
//   * no light, no tone map, no mip chain, no canvas resample, no underside
//     ramp: the painting's own pixels.
//
// For each pose it writes ref-<pose>.png (device px), ref-gunless-<pose>.png
// (the same without the gun, so a gun mask can be made exactly as it is
// in game) and ref.json (origin = sim point in pixel-edge coords).
//
// Honesty: the in-game crisp path is NOT this code (it composes on the GPU at
// up to 8x with the atlas's own mip chain as the prefilter), so agreement
// between the two is evidence, not a tautology; and this is still a
// reconstruction of the spike's method, not the spike's own crisp.py, which
// hard-codes b114869's trims.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { poseLayers, writeRgbaPng } from '../rig-grip/raster.mjs';
import { RIG_GUN_MUZZLE_X, rigPlaceWeaponPoint } from '../../src/pure/rig.js';
import { PAL } from '../../src/render/palette.js';

const args = process.argv.slice(2);
const argv = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const CAPTURE = resolve(argv('--capture', ''));
const SS = Number(argv('--ss', 16));
const OUT = resolve(argv('--out', join(dirname(CAPTURE), 'ref')));

// player.js GUN_FAMILY_ACCENTS.R, gun-local tiles (mx = the shared muzzle x)
const MX = RIG_GUN_MUZZLE_X;
const ACCENTS_R = [
  { color: PAL.muzzle, pts: [[0.29, 0.11], [0.52, 0.12], [0.47, 0.20], [0.33, 0.19]] },
  { color: PAL.gun, pts: [[MX - 0.10, -0.17], [MX, -0.17], [MX, 0.17], [MX - 0.10, 0.17]] },
];

const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

function sampleTex(L, wx, wy) {
  if (Math.abs(L.det) < 1e-12) return null;
  const dx = wx - L.p0[0], dy = wy - L.p0[1];
  const u = (dx * L.by - dy * L.bx) / L.det;
  const v = (L.ax * dy - L.ay * dx) / L.det;
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return null;
  const tx = Math.floor(L.rx + u * L.rw), ty = Math.floor(L.ry + v * L.rh);
  const i = (ty * L.img.width + tx) * 4;
  return [L.img.rgba[i], L.img.rgba[i + 1], L.img.rgba[i + 2], L.img.rgba[i + 3]];
}

function inPoly(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function drawList(state, { gun = true } = {}) {
  const { layers, pose, placement } = poseLayers(state);
  const list = [];
  for (const L of layers) {
    if (L.tag === 'gun') {
      if (!gun) continue;
      list.push({ kind: 'tex', L });
      for (const a of ACCENTS_R) {
        const pts = a.pts.map(([x, y]) => rigPlaceWeaponPoint(placement, x, y, [0, 0]));
        list.push({ kind: 'poly', pts, rgb: hex(a.color) });
      }
    } else list.push({ kind: 'tex', L });
  }
  return { list, pose };
}

// -> device-px RGBA (straight alpha, 0..1, encoded) with origin (ox, oy)
function render(list, ppt, box) {
  const { left, right, below, above } = box;          // device px around the sim point
  const W = left + right, H = below + above;
  const hp = ppt * SS;
  const HW = W * SS, HH = H * SS;
  const acc = new Float64Array(W * H * 4);
  for (let py = 0; py < HH; py++) {
    const wy = (above * SS - (py + 0.5)) / hp;
    for (let px = 0; px < HW; px++) {
      const wx = ((px + 0.5) - left * SS) / hp;
      let r = 0, g = 0, b = 0, a = 0;                  // premultiplied, encoded
      for (const d of list) {
        let s = null;
        if (d.kind === 'tex') {
          const t = sampleTex(d.L, wx, wy);
          if (t && t[3] >= 4) s = [t[0] / 255, t[1] / 255, t[2] / 255, t[3] / 255];
        } else if (inPoly(d.pts, wx, wy)) s = [d.rgb[0] / 255, d.rgb[1] / 255, d.rgb[2] / 255, 1];
        if (!s) continue;
        r = s[0] * s[3] + r * (1 - s[3]);
        g = s[1] * s[3] + g * (1 - s[3]);
        b = s[2] * s[3] + b * (1 - s[3]);
        a = s[3] + a * (1 - s[3]);
      }
      const o = (Math.floor(py / SS) * W + Math.floor(px / SS)) * 4;
      acc[o] += r; acc[o + 1] += g; acc[o + 2] += b; acc[o + 3] += a;
    }
  }
  const out = new Float32Array(W * H * 4);
  const n = SS * SS;
  for (let i = 0; i < W * H; i++) {
    const a = acc[i * 4 + 3];
    if (a / n < 0.5) continue;                         // the 50% cut
    out[i * 4] = acc[i * 4] / a;
    out[i * 4 + 1] = acc[i * 4 + 1] / a;
    out[i * 4 + 2] = acc[i * 4 + 2] / a;
    out[i * 4 + 3] = 1;
  }
  return { width: W, height: H, data: out, origin: [left, above] };
}

function main() {
  const cap = JSON.parse(readFileSync(CAPTURE, 'utf8'));
  mkdirSync(OUT, { recursive: true });
  const meta = { view: cap.view, dpr: cap.dpr, ss: SS, poses: {} };
  for (const [pose, row] of Object.entries(cap.shots || {})) {
    const info = row.info;
    const rv = info.rig;
    if (!rv || rv.canvasFallback) continue;
    const ppt = info.pxPerTile * cap.dpr;                // device px per tile at RIG's depth
    const state = {
      frame: rv.bodyFrame,
      bodyFacing: rv.poseFacing,
      gunFacing: info.player.facing,
      aim: [rv.aim.x, rv.aim.y],
      letter: rv.weapon || 'R',
      muzzleY: info.player.muzzleY,
      gain: rv.gunPresentation?.portraitGain ?? 1,
      squash: 1,
      recoil: rv.recoil || 0,
    };
    const box = { left: Math.ceil(1.9 * ppt), right: Math.ceil(1.9 * ppt), below: Math.ceil(0.5 * ppt),
      above: Math.ceil(3.1 * ppt) };
    const full = drawList(state);
    const img = render(full.list, ppt, box);
    const gunless = render(drawList(state, { gun: false }).list, ppt, box);
    writeRgbaPng(join(OUT, `ref-${pose}.png`), img);
    writeRgbaPng(join(OUT, `ref-gunless-${pose}.png`), gunless);
    meta.poses[pose] = { state, ppt, origin: img.origin, size: [img.width, img.height] };
    console.log(pose, state.frame, 'ppt', ppt.toFixed(3), img.width + 'x' + img.height);
  }
  writeFileSync(join(OUT, 'ref.json'), JSON.stringify(meta, null, 1) + '\n');
}

main();
