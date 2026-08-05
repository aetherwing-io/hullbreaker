#!/usr/bin/env node
/* Focused static/asset gate for the v2 painted-action runtime.  Browser proof
 * lives in tools/playtest/action-vfx-v2-runtime-capture.mjs; this gate keeps
 * the atlas/spec/pool/bridge contract cheap enough to run on every edit. */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const spec = await import(pathToFileURL(path.join(
  ROOT, 'src/render/action-vfx-spec.js')).href);
const manifest = JSON.parse(read(
  'assets/generated/vfx/action-vfx-v2/action-vfx-v2.manifest.json'));
const runtime = read('src/render/action-vfx-runtime.js');
const art = read('src/render/action-vfx-art.js');
const main = read('src/main.js');
const bridge = read('src/sim/bridge.js');
const weapons = read('src/sim/weapons.js');
const proof = read('tools/playtest/action-vfx-v2-runtime-capture.mjs');
const png = fs.readFileSync(path.join(
  ROOT, 'assets/generated/vfx/action-vfx-v2/action-vfx-atlas-v2.png'));

let checks = 0;
function check(value, message) {
  checks++;
  assert.ok(value, message);
}
function equal(actual, expected, message) {
  checks++;
  assert.deepEqual(actual, expected, message);
}

equal(png.subarray(1, 4).toString('ascii'), 'PNG', 'atlas is a PNG');
equal(png.readUInt32BE(16), 1024, 'atlas width');
equal(png.readUInt32BE(20), 1024, 'atlas height');
equal(manifest.runtime.gpuTextures, 1, 'manifest texture count');
equal(manifest.runtime.estimatedGpuBytes, 4 * 1024 * 1024, 'manifest GPU bytes');

const records = manifest.cells || manifest.records || manifest.entries ||
  manifest.components || [];
const byId = new Map(records.map((record) => [record.id, record]));
equal(spec.ACTION_VFX_COMPONENTS.length, 22, 'curated production component count');
equal(new Set(spec.ACTION_VFX_COMPONENTS.map((entry) => entry.id)).size,
  spec.ACTION_VFX_COMPONENTS.length, 'component IDs are unique');

for (const component of spec.ACTION_VFX_COMPONENTS) {
  const source = byId.get(component.id);
  check(source, `${component.id} exists in manifest`);
  equal(source.reviewStatus, 'production', `${component.id} is production reviewed`);
  equal(component.reviewStatus, 'production', `${component.id} runtime status`);
  equal(component.uv, source.uv, `${component.id} exact UV`);
  equal(component.pivot, source.pivot, `${component.id} exact pivot`);
  equal(component.nativeAspect, source.nativeAspect, `${component.id} exact aspect`);
  equal(component.screenExtentPx, source.screenExtentPx,
    `${component.id} exact readable envelope`);
  equal(component.timing.durationMs, source.timing.durationMs,
    `${component.id} duration`);
  equal(component.timing.peakMs, source.timing.peakMs, `${component.id} peak`);
  equal(component.timing.fadeStartMs, source.timing.fadeStartMs,
    `${component.id} fade start`);
}

const selected = new Set(spec.ACTION_VFX_COMPONENTS.map((entry) => entry.id));
for (const rejected of spec.ACTION_VFX_REJECTED)
  check(!selected.has(rejected), `${rejected} is not selectable`);
equal(spec.ACTION_VFX_REJECTED, manifest.review.rejectedIds,
  'runtime rejection fence matches visual review');

for (const type of ['R', 'S', 'L', 'H', 'F']) {
  const choices = spec.ACTION_VFX_WEAPONS[type];
  equal(choices.length, 3, `${type} has three distinct painted accents`);
  equal(new Set(choices).size, 3, `${type} choices are distinct`);
  for (const index of choices)
    check(index >= 0 && index < spec.ACTION_VFX_COMPONENTS.length,
      `${type} index ${index} is in range`);
}
for (const index of spec.ACTION_VFX_WEAPONS.L)
  equal(spec.ACTION_VFX_COMPONENTS[index].screenExtentPx.min, 24,
    'laser medium-scale floor is honored');
for (const type of ['R', 'S', 'H', 'F'])
  for (const index of spec.ACTION_VFX_WEAPONS[type])
    equal(spec.ACTION_VFX_COMPONENTS[index].screenExtentPx.min, 12,
      `${type} small-scale floor is honored`);

equal((art.match(/preloadTexture\(/g) || []).length, 1,
  'one atlas preload request site');
check(art.includes('width === ACTION_VFX_ATLAS.canvas[0]') &&
  art.includes('height === ACTION_VFX_ATLAS.canvas[1]'),
  'boot validates exact atlas dimensions');
check(art.includes('gpuTextures: ready ? 1 : 0'), 'one GPU texture telemetry');

check(runtime.includes('export const ACTION_VFX_ROW_MAX = 12'),
  'hard draw pool is twelve rows');
check(runtime.includes('new THREE.MeshStandardMaterial'), 'physical paint material');
check(runtime.includes('blending: THREE.NormalBlending'), 'normal blending only');
check(runtime.includes('depthWrite: false'), 'transients do not write depth');
check(runtime.includes('mesh.visible = false'), 'dormant rows start at zero draws');
check(runtime.includes('routeRenderable(row.s)') &&
  runtime.includes('routeWorldFacet(row.s) !== row.facet'), 'facet ownership fence');
check(runtime.includes('row.s = s') && runtime.includes('row.y = y'),
  'bridge endpoint is the matrix anchor');
check(bridge.includes('hostileImpact: noop'), 'bridge declares hostile impact fact');
check(weapons.includes('view.bullets.hostileImpact(') &&
  weapons.includes('i, b.type, b.x, b.y, impactVx, impactVy'),
  'collision branch emits exact projectile endpoint and travel vector');
const collisionStart = weapons.indexOf('const directId = e.id;');
const collisionEnd = weapons.indexOf('if (def.volatileRadius > 0)', collisionStart);
const collisionBranch = collisionStart >= 0 && collisionEnd > collisionStart
  ? weapons.slice(collisionStart, collisionEnd)
  : '';
const damageAt = collisionBranch.indexOf('const damaged = hitHostile(');
const lethalAt = collisionBranch.indexOf('const lethal = !hostiles.includes(e);');
const factAt = collisionBranch.indexOf('view.bullets.hostileImpact(');
check(damageAt >= 0 && lethalAt > damageAt && factAt > lethalAt &&
  /directId, targetKind, damaged, lethal,/.test(collisionBranch),
  'collision fact carries production damage and lethal results');
check(runtime.includes('function onHostileImpact(') &&
  runtime.includes('claim(weaponIndex, x, y, angle'),
  'paint consumes exact collision endpoint');
check(runtime.includes('Math.atan2(vy, vx)'),
  'paint orientation comes from collision travel vector');
check(!/recentShot|hostileHp|onHostileSync|incomingAngle|player\./.test(runtime),
  'runtime contains no recent-shot, HP-diff, or player-axis inference');
check(runtime.includes('IVORY_EMISSION_MAX = 0.14'), 'brief emission is bounded');
check(runtime.includes('hitStopRemainingMs() > 0') &&
  runtime.includes('CONFIG.juice.hitStop.scale') &&
  runtime.includes('row.ageMs += dtMs'), 'paint lifetime holds on juice hit-stop clock');
check(!/AdditiveBlending|CustomBlending/.test(runtime), 'no additive/custom blending');
check(!/new\s+(?:OffscreenCanvas|HTMLCanvasElement)|document\.createElement\(['"]canvas|TextureLoader|\.clone\(|\.offset\.|\.repeat\./.test(runtime),
  'runtime has no canvas/load/clone/texture-transform path');

const claimBody = runtime.slice(runtime.indexOf('function claim('),
  runtime.indexOf('function onHostileImpact('));
const impactBody = runtime.slice(runtime.indexOf('function onHostileImpact('),
  runtime.indexOf('function onStateScreen('));
const stepBody = runtime.slice(runtime.indexOf('function stepRows('),
  runtime.indexOf('export function updateActionVfx'));
check(!/\bnew\s|Array\.from|\.map\(|\.filter\(|\.slice\(/.test(claimBody),
  'event claim path has no allocation constructs');
check(!/\bnew\s|Array\.from|\.map\(|\.filter\(|\.slice\(/.test(impactBody),
  'collision observer path has no allocation constructs');
check(!/\bnew\s|Array\.from|\.map\(|\.filter\(|\.slice\(/.test(stepBody),
  'frame step has no allocation constructs');
check(runtime.includes("source: 'sim-bullet-hostile-impact'") &&
  runtime.includes('collisionFrame: true') &&
  runtime.includes('inference: false'),
  'telemetry states exact collision-frame, non-inferred contract');
check(runtime.includes('previous(a, b, c, d, e, f, g, h, i, j)') &&
  runtime.includes('observer(a, b, c, d, e, f, g, h, i, j)'),
  'observer delegates all ten positional collision primitives');
check(proof.includes('W.fireWeapon(') && proof.includes('W.updateBullets('),
  'browser proof fires and advances production projectiles');
check(proof.includes('tune: sequence.death ? { hp: 1 } : undefined'),
  'death proof begins from reachable wounded spawn state');
check(!/\bH\.(?:hitHostile|removeHostile|forceBreakHostile)\s*\(/.test(proof) &&
  !/\be\.hp\s*[-+]?=/.test(proof),
  'browser proof never manufactures damage or removal');

const artImport = main.indexOf("import './render/action-vfx-art.js'");
const postImport = main.indexOf("from './render/post.js'");
const juiceImport = main.indexOf("from './render/juice.js'");
const runtimeImport = main.indexOf("from './render/action-vfx-runtime.js'");
check(artImport >= 0 && artImport < postImport, 'atlas joins boot gate before consumers');
check(juiceImport >= 0 && runtimeImport > juiceImport, 'observer wraps after juice');
check(main.indexOf('updateActionVfx();') > main.indexOf('updateBullets(dt * hScale);'),
  'rows step after bullet collision endpoints');
check(main.includes('actionVfx: actionVfxSnapshot()'), 'frozen telemetry includes action VFX');
check(main.includes('actionVfx: actionVfxSnapshot,'), 'window.HB includes action VFX reader');

console.log(`action-vfx-v2-runtime-check: ${checks}/${checks} checks passed`);
