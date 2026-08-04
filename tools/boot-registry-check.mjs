#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeResetRegistry } from '../src/boot/reset-registry.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = (path) => readFileSync(resolve(ROOT, path), 'utf8');
const main = source('src/main.js');
const viewInit = source('src/boot/view-init.js');
const runReset = source('src/boot/run-reset.js');
const bridge = source('src/sim/bridge.js');

const baseBlock = viewInit.slice(viewInit.indexOf('VIEW_INIT_MANIFEST'),
  viewInit.indexOf('VIEW_OBSERVER_MANIFEST'));
const baseIds = [...baseBlock.matchAll(/Object\.freeze\(\{ id: '([^']+)', init: init/g)]
  .map((match) => match[1]);
assert.deepEqual(baseIds, [
  'camera', 'level', 'hostiles', 'meridian', 'finale', 'transform',
  'player', 'capsules', 'bullets', 'mods', 'hook', 'loot', 'overlay',
]);
assert.ok(viewInit.indexOf("id: 'juice'") < viewInit.indexOf("id: 'action-vfx'"),
  'juice delegates before action paint observes');
assert.match(main, /initializeViewRegistry\(\);[\s\S]*installHost/,
  'base views and observers install before a run can reset');
assert.doesNotMatch(main,
  /import ['"]\.\/render\/(?:finale|transform|player|capsules|mods|hook|meridian-defense-vfx)\.js['"]/,
  'main has no view-owner side-effect imports');

for (const path of [
  'src/render/camera.js', 'src/render/level.js', 'src/render/hostiles.js',
  'src/render/meridian-defense-vfx.js', 'src/render/finale.js',
  'src/render/transform.js', 'src/render/player.js', 'src/render/capsules.js',
  'src/render/bullets.js', 'src/render/mods.js', 'src/render/hook.js',
  'src/ui/loot.js', 'src/ui/overlay.js',
]) {
  const text = source(path);
  assert.doesNotMatch(text, /^installView\(/m,
    `${path} may export an installer but may not install at module scope`);
  assert.match(text, /export function init\w+View\(\)/,
    `${path} exports an explicit view initializer`);
}
assert.match(bridge, /export function installView/,
  'the renderer boundary remains the single bridge API');

const resetIds = [...runReset.matchAll(/\{ id: '([^']+)', reset:/g)]
  .map((match) => match[1]);
assert.equal(resetIds.length, 30, 'the full run has thirty named reset owners');
assert.equal(new Set(resetIds).size, resetIds.length, 'reset owner ids are unique');
assert.match(main, /function resetGame\(\) \{\s*resetRunState\(\);/,
  'resetGame delegates teardown to the registry');
const resetBody = main.slice(main.indexOf('function resetGame()'),
  main.indexOf('/* =========================== MAIN LOOP'));
assert.doesNotMatch(resetBody,
  /clearHostiles|clearBullets|resetSpawner|resetTransform|resetHitStop/,
  'the composition root no longer hand-wires subsystem teardown');

const trace = [];
const registry = makeResetRegistry([
  { id: 'a', reset: () => trace.push('a') },
  { id: 'b', reset: () => trace.push('b') },
]);
assert.deepEqual(registry.reset(), ['a', 'b']);
assert.deepEqual(trace, ['a', 'b']);
assert.deepEqual(registry.snapshot(), {
  owners: ['a', 'b'], runs: 1, last: ['a', 'b'],
});
assert.throws(() => makeResetRegistry([
  { id: 'a', reset() {} }, { id: 'a', reset() {} },
]), /duplicate reset owner/);

console.log(`BOOT REGISTRIES: ${baseIds.length} views, ${resetIds.length} reset owners`);
