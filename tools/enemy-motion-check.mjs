#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng } from './assets/lib/png.mjs';
import {
  primitiveBox, SPRITE_MOTION_ART, spriteMotionFrame,
} from '../src/render/sprite-table.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ALPHA_FLOOR = 20;

function near(a, b, eps = 1e-9) {
  assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
}

function cellStats(png, cell) {
  const [x0, y0, w, h] = cell;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  let visible = 0, partial = 0, magenta = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((y0 + y) * png.width + x0 + x) * 4;
      const r = png.rgba[i], g = png.rgba[i + 1];
      const b = png.rgba[i + 2], a = png.rgba[i + 3];
      if (a > ALPHA_FLOOR) {
        visible++;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
      if (a > 0 && a < 255) partial++;
      if (a > 32 && r > 180 && b > 160 && g < 100) magenta++;
    }
  }
  return {
    visible, partial, magenta,
    bbox: [minX, minY, maxX - minX + 1, maxY - minY + 1],
  };
}

// Compare what survives FAR minification, not only source texels. Each output
// bit asks whether any authored alpha survives one low-resolution bucket.
function farMask(png, cell, targetH, yStart = 0, yEnd = cell[3]) {
  const [x0, y0, w] = cell;
  const sourceH = yEnd - yStart;
  const targetW = Math.max(1, Math.round(w / sourceH * targetH));
  let out = '';
  for (let oy = 0; oy < targetH; oy++) {
    const sy0 = yStart + Math.floor(oy * sourceH / targetH);
    const sy1 = yStart + Math.max(sy0 - yStart + 1,
      Math.ceil((oy + 1) * sourceH / targetH));
    for (let ox = 0; ox < targetW; ox++) {
      const sx0 = Math.floor(ox * w / targetW);
      const sx1 = Math.max(sx0 + 1, Math.ceil((ox + 1) * w / targetW));
      let on = false;
      for (let sy = sy0; sy < sy1 && !on; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          if (png.rgba[((y0 + sy) * png.width + x0 + sx) * 4 + 3] > ALPHA_FLOOR) {
            on = true; break;
          }
        }
      }
      out += on ? '1' : '0';
    }
  }
  return out;
}

function farRectMask(png, cell, rect, targetH) {
  const [x0, y0] = cell;
  const [rx, ry, rw, rh] = rect;
  const targetW = Math.max(1, Math.round(rw / rh * targetH));
  let out = '';
  for (let oy = 0; oy < targetH; oy++) {
    const sy0 = ry + Math.floor(oy * rh / targetH);
    const sy1 = ry + Math.max(1, Math.ceil((oy + 1) * rh / targetH));
    for (let ox = 0; ox < targetW; ox++) {
      const sx0 = rx + Math.floor(ox * rw / targetW);
      const sx1 = rx + Math.max(1, Math.ceil((ox + 1) * rw / targetW));
      let on = false;
      for (let sy = sy0; sy < sy1 && !on; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          if (png.rgba[((y0 + sy) * png.width + x0 + sx) * 4 + 3] > ALPHA_FLOOR) {
            on = true; break;
          }
        }
      }
      out += on ? '1' : '0';
    }
  }
  return out;
}

function maskDifference(a, b) {
  assert.equal(a.length, b.length);
  let changed = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) changed++;
  return changed / a.length;
}

function houndPoseMetrics(png, frame) {
  const [x0, y0, w, h] = frame.cell;
  const [anchorX, anchorY] = frame.anchor;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  let foreX = 0, foreY = 0, forePixels = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (png.rgba[((y0 + y) * png.width + x0 + x) * 4 + 3] <= ALPHA_FLOOR) continue;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      // Right-facing v2: the articulated forequarter lives at/beyond the
      // orange shoulder anchor and below the dorsal armour.
      if (x > anchorX - 45 && y > anchorY - 185) {
        foreX += x; foreY += y; forePixels++;
      }
    }
  }
  return {
    bbox: [minX, minY, maxX - minX + 1, maxY - minY + 1],
    maxY,
    foreCentroid: [foreX / forePixels, foreY / forePixels],
    forePixels,
  };
}

const report = {};
for (const [kind, art] of Object.entries(SPRITE_MOTION_ART)) {
  const file = resolve(ROOT, 'assets/generated/sprites', art.file);
  const png = decodePng(file);
  assert.deepEqual([png.width, png.height], art.canvas, `${kind}: atlas dimensions`);
  assert.equal(png.colorType, 6, `${kind}: atlas must be RGBA`);
  for (const [x, y] of [[0, 0], [png.width - 1, 0], [0, png.height - 1],
    [png.width - 1, png.height - 1]])
    assert.equal(png.rgba[(y * png.width + x) * 4 + 3], 0, `${kind}: transparent corner`);

  const stats = art.frames.map((frame, index) => {
    const [x, y, w, h] = frame.cell;
    assert.ok(x >= 0 && y >= 0 && x + w <= png.width && y + h <= png.height,
      `${kind} frame ${index}: cell inside atlas`);
    const s = cellStats(png, frame.cell);
    assert.ok(s.visible > 15000, `${kind} frame ${index}: substantial opaque body`);
    assert.ok(s.partial > 1000, `${kind} frame ${index}: antialiased edge retained`);
    assert.equal(s.magenta, 0, `${kind} frame ${index}: no visible chroma fringe`);

    const q = spriteMotionFrame(kind, index);
    const box = primitiveBox(kind);
    near(q.anchorWorldX, box.cx);
    near(q.anchorWorldY, art.grounded ? box.cy - box.h / 2 : box.cy);
    near(q.w, w * box.w / art.referenceInkWidth);
    near(q.h, h * box.w / art.referenceInkWidth);
    assert.ok(q.uv.u0 >= 0 && q.uv.u1 <= 1 && q.uv.v0 >= 0 && q.uv.v1 <= 1,
      `${kind} frame ${index}: UV inside atlas`);
    return s;
  });

  const targetH = kind === 'wasp' ? 32 : 42;
  const fullSilhouettes = new Set(art.frames.map((f) => farMask(png, f.cell, targetH)));
  assert.equal(fullSilhouettes.size, art.frames.length,
    `${kind}: every frame remains a distinct silhouette at FAR scale`);
  if (kind === 'hound') {
    assert.equal(art.frames.length, 8, 'hound: four run + four leap/action frames');
    assert.ok(art.frames.every((f, i) =>
      f.cell[0] === (i % 4) * 512 && f.cell[1] === Math.floor(i / 4) * 512 &&
      f.cell[2] === 512 && f.cell[3] === 512),
    'hound: exact 4x2 grid of 512px cells');
    const footSilhouettes = new Set(art.frames.map((f) =>
      farMask(png, f.cell, 24, 170, 440)));
    assert.ok(footSilhouettes.size >= 7,
      `hound: expected >=7 distinct FAR underbody silhouettes, got ${footSilhouettes.size}`);

    const poses = art.frames.map((f) => houndPoseMetrics(png, f));
    const foreMasks = art.frames.map((f) =>
      farRectMask(png, f.cell, [220, 220, 292, 210], 24));
    assert.equal(new Set(foreMasks).size, 8,
      'hound: every forequarter remains distinct at FAR scale');
    assert.ok(maskDifference(foreMasks[1], foreMasks[2]) > 0.16 &&
      maskDifference(foreMasks[4], foreMasks[6]) > 0.16 &&
      maskDifference(foreMasks[6], foreMasks[7]) > 0.16,
    'hound: passing/reach and load/airborne/landing radically change the foreleg silhouette');
    assert.ok(poses[2].bbox[2] >= poses[1].bbox[2] + 90,
      'hound: rear-drive pose gains a dramatic forward-reach silhouette');
    assert.ok(poses[3].maxY <= art.frames[3].anchor[1] - 25,
      'hound: run suspension has every foot visibly clear of the deck line');
    assert.ok(poses[6].maxY <= art.frames[6].anchor[1] - 45,
      'hound: airborne leap has every foot visibly clear of the deck line');
    assert.ok(poses[4].foreCentroid[1] >= poses[6].foreCentroid[1] + 40 &&
      poses[7].foreCentroid[1] >= poses[6].foreCentroid[1] + 40,
    'hound: deep load and hard landing compress far below airborne reach');
    report.houndArticulation = {
      foreMaskDifferences: [
        maskDifference(foreMasks[1], foreMasks[2]),
        maskDifference(foreMasks[4], foreMasks[6]),
        maskDifference(foreMasks[6], foreMasks[7]),
      ].map((v) => Number(v.toFixed(3))),
      opaqueBoxes: poses.map((p) => p.bbox),
      foreCentroidY: poses.map((p) => Number(p.foreCentroid[1].toFixed(1))),
    };
  }
  report[kind] = {
    file: art.file, canvas: art.canvas, frames: art.frames.length,
    farDistinct: fullSilhouettes.size,
    alphaBoxes: stats.map((s) => s.bbox),
    anchorWorld: [spriteMotionFrame(kind, 0).anchorWorldX,
      spriteMotionFrame(kind, 0).anchorWorldY],
  };
}

const source = readFileSync(resolve(ROOT, 'src/render/hostiles.js'), 'utf8');
assert.match(source, /key = `motion:\$\{motionFrame\}`/,
  'runtime selects an individual motion frame');
assert.match(source, /v\.mesh\.geometry = geo/,
  'runtime reuses the one actor body mesh');
assert.match(source, /crossfade: false/,
  'runtime snapshot declares the exclusive-frame contract');
assert.match(source, /actionPoseActive\(e\).*v\.actionTex/s,
  'committed action art retains priority over locomotion');
assert.match(source, /HOUND_RUN_FRAME_COUNT = 4/,
  'hound locomotion cycles only the four run frames');
assert.match(source, /e\.state === 'tell'\) return 4/,
  'hound tell selects the deep-load frame');
assert.match(source, /e\.state === 'vault'.*return 5.*return 6.*return 7/s,
  'hound vault selects launch, airborne reach, and landing by real velocity');
assert.match(source, /poseKey\.startsWith\('motion:'\)/,
  'right-facing hound atlas has a pose-local authoring convention');
assert.match(source,
  /function currentMotionFrame\(v\)[\s\S]*v\.motionGeos\?\.\[frame\] !== v\.mesh\.geometry[\s\S]*v\.mat\.map !== v\.motionTex/,
  'motion identity requires the exact live atlas geometry and texture');
assert.match(source, /const rig = motionFrame >= 0 \? null : claimDeathRig\(v, e\)/,
  'motion deaths retain the live body instead of swapping to base-art fragments');
assert.match(source,
  /if \(!actorMotionOwnsSilhouette\(v\) && !houndMotionOwnsSilhouette\(v, e\)[\s\S]{0,120}\) \{\s*sx \*= p\.sx; sy \*= p\.sy; sz \*= p\.sz;/,
  'hound v2 cells bypass legacy primitive squash and stretch');
assert.match(source, /ruptureMode: frozen \? 'frozen-motion'/,
  'the death proof surface names frozen motion rupture explicitly');
assert.match(source, /posePreserved[\s\S]*c\.mesh\.geometry === frozen\.geometry[\s\S]*c\.mat\.map === frozen\.map/,
  'the death proof verifies geometry and texture identity through rupture');

console.log(JSON.stringify({ ok: true, report }, null, 2));
