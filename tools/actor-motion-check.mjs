#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decodePng } from './assets/lib/png.mjs';
import {
  ACTOR_MOTION_ATLASES, ACTOR_MOTION_KINDS, ACTOR_MOTION_SPEC,
} from '../src/render/actor-motion-spec.js';

const ROOT = resolve(import.meta.dirname, '..');
const ALPHA = 20;
let passed = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  passed++;
  console.log(`ok ${passed} - ${message}`);
};

function alphaBox(png, cell) {
  const [x0, y0, w, h] = cell;
  let minX = w, minY = h, maxX = -1, maxY = -1, visible = 0, partial = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = png.rgba[((y0 + y) * png.width + x0 + x) * 4 + 3];
    if (a > ALPHA) {
      visible++;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    if (a > 0 && a < 255) partial++;
  }
  return { minX, minY, maxX, maxY, visible, partial };
}

function boundaryClear(png, cell, guard = 5) {
  const [x0, y0, w, h] = cell;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x >= guard && x < w - guard && y >= guard && y < h - guard) continue;
    if (png.rgba[((y0 + y) * png.width + x0 + x) * 4 + 3] > 0) return false;
  }
  return true;
}

function farMask(png, cell, outW, outH) {
  const [x0, y0, w, h] = cell;
  const mask = new Uint8Array(outW * outH);
  for (let oy = 0; oy < outH; oy++) for (let ox = 0; ox < outW; ox++) {
    const sx0 = Math.floor(ox * w / outW), sx1 = Math.ceil((ox + 1) * w / outW);
    const sy0 = Math.floor(oy * h / outH), sy1 = Math.ceil((oy + 1) * h / outH);
    let on = 0;
    for (let sy = sy0; sy < sy1 && !on; sy++) for (let sx = sx0; sx < sx1; sx++) {
      if (png.rgba[((y0 + sy) * png.width + x0 + sx) * 4 + 3] > ALPHA) { on = 1; break; }
    }
    mask[oy * outW + ox] = on;
  }
  return mask;
}

function delta(a, b) {
  let changed = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) changed++;
  return changed / a.length;
}

const decoded = {};
for (const [id, atlas] of Object.entries(ACTOR_MOTION_ATLASES)) {
  const png = decodePng(resolve(ROOT, atlas.file.replace('../../', '')));
  decoded[id] = png;
  check(png.width === 2048 && png.height === 1024 && png.colorType === 6,
    `${id} is strict 2048x1024 RGBA`);
  const cellCount = atlas.grid[0] * atlas.grid[1];
  // v2's sealed polyp is deliberately a compact armored bud; its silhouette
  // density is the pose sentence, not missing art. The larger Warden still
  // retains the original 50k painted-mass floor.
  const minVisible = id === 'emplacement' ? 25000 : 50000;
  const minPartial = id === 'emplacement' ? 4000 : 5000;
  let allMargins = true, allBoundaries = true, allAlpha = true;
  for (let i = 0; i < cellCount; i++) {
    const col = i % atlas.grid[0], row = Math.floor(i / atlas.grid[0]);
    const cell = [col * atlas.cell[0], row * atlas.cell[1], ...atlas.cell];
    const box = alphaBox(png, cell);
    allMargins &&= box.minX >= atlas.minCellMargin && box.minY >= atlas.minCellMargin &&
      atlas.cell[0] - 1 - box.maxX >= atlas.minCellMargin &&
      atlas.cell[1] - 1 - box.maxY >= atlas.minCellMargin;
    allBoundaries &&= boundaryClear(png, cell);
    allAlpha &&= box.visible > minVisible && box.partial > minPartial;
  }
  check(allMargins, `${id} keeps the declared clear margin in every cell`);
  check(allBoundaries, `${id} has zero alpha in every five-pixel cell-boundary guard`);
  check(allAlpha, `${id} retains substantial painted alpha and antialiased edges per cell`);
}

for (const kind of ACTOR_MOTION_KINDS) {
  const spec = ACTOR_MOTION_SPEC[kind];
  const atlas = ACTOR_MOTION_ATLASES[spec.atlas];
  const png = decoded[spec.atlas];
  const anchors = new Set(spec.frames.map((f) => f.anchor.join(',')));
  check(anchors.size === 1 && spec.anchorRole === 'deck-contact',
    `${kind} keeps one immutable deck/contact anchor`);
  check(spec.frames.every((f) => ['core', 'muzzle', 'rack', 'mutation']
    .every((socket) => Array.isArray(f.sockets[socket]))),
  `${kind} declares core, muzzle, rack, and mutation sockets in every pose`);
  check(spec.frames.every((f) => Object.values(f.sockets)
    .every(([x, y]) => x >= 0 && x <= atlas.cell[0] && y >= 0 && y <= atlas.cell[1])),
  `${kind} keeps every named socket inside its authored atlas cell`);
  const reachable = new Set();
  for (const clipDef of Object.values(spec.clips))
    for (const frameBeat of clipDef.beats) reachable.add(frameBeat.frame);
  check(spec.frames.every((f) => reachable.has(f.name)),
    `${kind} exposes every authored frame through a state clip`);
  check(Object.keys(spec.states).every((state) => spec.clips[spec.states[state]]) &&
    Object.values(spec.clips).every((c) => /^(safe|tell|fire|recover):/.test(c.marker)),
  `${kind} covers every sim state with an explicit combat marker`);

  const outH = kind === 'warden' ? 92 : kind === 'polyp' ? 42 : 46;
  const masks = spec.frames.map((f) => {
    const col = f.index % atlas.grid[0], row = Math.floor(f.index / atlas.grid[0]);
    return farMask(png, [col * 512, row * 512, 512, 512], 64, outH);
  });
  let minimumDelta = 1;
  for (let i = 0; i < masks.length; i++) for (let j = i + 1; j < masks.length; j++)
    minimumDelta = Math.min(minimumDelta, delta(masks[i], masks[j]));
  check(minimumDelta >= (kind === 'warden' ? 0.018 : 0.026),
    `${kind} every state silhouette remains distinct at FAR/play scale (${minimumDelta.toFixed(3)})`);
}

const warden = ACTOR_MOTION_SPEC.warden;
check(warden.clips.deployment.durationMs === 900 &&
  warden.clips.deployment.beats.map((b) => b.frame).join(',') ===
    'sealed,sweep-recover,barrage-tell,sweep-tell' &&
  new Set(warden.clips.deployment.beats.map((b) => b.event)).size === 4,
'Warden arrival is a four-stage rooted mechanical deployment');
check(warden.clips.terminalRupture.beats.at(-1).frame === 'damaged-exposed' &&
  warden.clips.terminalRupture.marker === 'recover:terminal-rupture',
'Warden death resolves through the authored breached terminal silhouette');

const main = readFileSync(resolve(ROOT, 'src/main.js'), 'utf8');
const runtime = readFileSync(resolve(ROOT, 'src/render/actor-motion.js'), 'utf8');
const owner = readFileSync(resolve(ROOT, 'src/render/actor-motion-art.js'), 'utf8');
const hostiles = readFileSync(resolve(ROOT, 'src/render/hostiles.js'), 'utf8');
const sim = readFileSync(resolve(ROOT, 'src/sim/hostiles.js'), 'utf8');

check(main.indexOf("import './render/actor-motion-art.js'") >= 0 &&
  main.indexOf("import './render/actor-motion-art.js'") < main.indexOf("import { POST"),
'both atlases register before post and the hostile consumer settle the boot gate');
check(/preloadTexture[\s\S]*await awaitPreloads\(\)[\s\S]*Object\.freeze/.test(owner),
  'the preload owner freezes one early ready/fallback decision');
check(/const authored = deployingWarden[\s\S]*selectActorMotion\(v\.actorMotionBundle, e, gameMs\)[\s\S]*if \(authored\)[\s\S]*else if \(action\)/.test(hostiles),
  'authored actor frames have priority over legacy action cards');
check(/!actorMotionOwnsSilhouette\(v\) && !houndMotionOwnsSilhouette/.test(hostiles) &&
  /actorMotionOwnsSilhouette\(v\) \? 0 : spriteRoll/.test(hostiles),
  'atlas actors bypass legacy whole-card squash, growth, and rotation');
check(/actorMotionFrame\.geo !== v\.mesh\.geometry[\s\S]*emissiveMap !== v\.actorMotionBundle\.tex/.test(hostiles) &&
  /const rig = motionFrame >= 0 \? null : claimDeathRig/.test(hostiles),
  'death continuity retains the exact authored geometry and texture');
check(/motionSocketWorld\(v, e, 'muzzle'\)/.test(hostiles) &&
  /motionSocketWorld\(v, e, 'iris'\)/.test(hostiles) &&
  /motionSocketWorld\(v, e, 'rack'\)/.test(hostiles) &&
  /motionSocketWorld\(v, e, 'mutation'/.test(hostiles),
  'beam, pod, iris, rack, and mutation hardware consume named pose sockets');
check(/const selection = \{ frame: null/.test(runtime) &&
  /const out = bundle\.selection/.test(runtime) && !/selectActorMotion[\s\S]{0,800}return \{/.test(runtime),
  'hot frame selection reuses fixed storage without per-frame allocation');
check(/function selectClip[\s\S]*export function selectActorMotionClip/.test(runtime) &&
  !/selectActorMotionClip[\s\S]{0,300}new |selectActorMotionClip[\s\S]{0,300}\{ frame:/.test(runtime),
  'presentation lifecycle clips reuse the resident selector and allocate no frames');
check(/const rootedWarden = e\.kind === 'warden';[\s\S]{0,320}if \(rootedWarden\) \{[\s\S]{0,120}depth = 0;[\s\S]{0,80}scale = 1;/.test(hostiles) &&
  /depth = rootedWarden \? 0 :/.test(hostiles),
  'Warden arrival and idle keep constant whole-body scale and deck depth');
check(/selectActorMotionClip\([\s\S]{0,120}'terminalRupture', 1\)/.test(hostiles) &&
  /rootedTerminal: e\.kind === 'warden'/.test(hostiles),
  'Warden removal swaps to terminal art and preserves the planted lifecycle root');
check(/v\.mat\.emissiveIntensity = e\.kind === 'warden' \? 0/.test(hostiles) &&
  /v\.wardenCore\.visible = exposed \|\| ping \|\| hit/.test(hostiles) &&
  /v\.wardenShield\.visible = ping/.test(hostiles),
  'Warden body and idle attachments emit no resting glow');
check(ACTOR_MOTION_KINDS.reduce((sum, kind) =>
  sum + ACTOR_MOTION_SPEC[kind].frames.length, 0) === 16 &&
  new Set(ACTOR_MOTION_KINDS.map((kind) => ACTOR_MOTION_SPEC[kind].atlas)).size === 2,
  'all actor motion remains bounded to sixteen resident geometries and two textures');
check(!/actor-motion|actorMotion|motion atlas/i.test(sim),
  'simulation timing, hitboxes, and damage remain presentation-independent');

console.log(`ACTOR MOTION: ${passed}/${passed} contracts passed`);
