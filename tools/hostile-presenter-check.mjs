#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeHostilePresenterRegistry } from '../src/render/hostile-presenters/registry.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hostiles = readFileSync(resolve(ROOT, 'src/render/hostiles.js'), 'utf8');
const index = readFileSync(resolve(ROOT,
  'src/render/hostile-presenters/index.js'), 'utf8');
const ids = [...index.slice(index.indexOf('makeHostilePresenterRegistry(['))
  .matchAll(/\b(ECOLOGY|MODULAR_WASP|ACTOR|SPRITE|PRIMITIVE)_PRESENTER\b/g)]
  .map((match) => match[1].toLowerCase().replace('_', '-'));

assert.deepEqual(ids, ['ecology', 'modular-wasp', 'actor', 'sprite', 'primitive'],
  'presenter priority must remain explicit, with primitive last');

const descriptor = (id, matches) => Object.freeze({
  id, matches, spawn() {}, syncPose() {}, ownsSilhouette() {}, usesLegacyPose() {},
  syncMaterial() {}, syncTransform() {}, prepareRemoval() {},
});
const testRegistry = makeHostilePresenterRegistry([
  descriptor('specific', (row) => row.specific), descriptor('fallback', () => true),
]);
assert.equal(testRegistry.select({ specific: true }).id, 'specific');
assert.equal(testRegistry.select({}).id, 'fallback');
assert.throws(() => makeHostilePresenterRegistry([
  descriptor('same', () => true), descriptor('same', () => true),
]), /duplicate hostile presenter id/);

assert.match(hostiles, /presenter\.spawn\(PRESENTER_API/,
  'spawn dispatches through the selected presenter');
assert.match(hostiles, /v\.presenter\.syncPose\(PRESENTER_API/,
  'live pose dispatches through the spawn-owned presenter');
assert.match(hostiles, /v\.presenter\.syncMaterial\(PRESENTER_API/,
  'material policy dispatches through the spawn-owned presenter');
assert.match(hostiles, /v\.presenter\.syncTransform\(PRESENTER_API/,
  'body transform dispatches through the spawn-owned presenter');
assert.match(hostiles, /v\.presenter\.prepareRemoval\(PRESENTER_API/,
  'death handoff dispatches through the spawn-owned presenter');
assert.doesNotMatch(hostiles,
  /actorMotionOwnsSilhouette|houndMotionOwnsSilhouette|waspModularOwnsSilhouette/,
  'legacy cross-presenter ownership exception stack is gone');
for (const file of ['ecology', 'modular-wasp', 'actor', 'sprite', 'primitive']) {
  const text = readFileSync(resolve(ROOT,
    `src/render/hostile-presenters/${file}.js`), 'utf8');
  assert.match(text, /Object\.freeze\(\{/,
    `${file} presenter descriptor is immutable`);
}

console.log(`HOSTILE PRESENTERS: ${ids.length} lifecycle owners registered`);
