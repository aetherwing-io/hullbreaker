#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAdaptiveFidelityController } from '../src/pure/adaptive-fidelity.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = (path) => readFileSync(resolve(ROOT, path), 'utf8');
const tune = {
  warmupFrames: 2, batchFrames: 4, badBatchesRequired: 2,
  goodBatchesRequired: 3,
  avgBudgetMs: 19.5, slowFrameMs: 24, slowShare: 0.20,
  goodAvgMs: 17, goodSlowShare: 0.02, maxLevel: 3,
};
const controller = createAdaptiveFidelityController(tune);

assert.equal(controller.sample(NaN), null);
assert.equal(controller.sample(30), null);
assert.equal(controller.sample(30), null);
const feed = (ms, count) => {
  let event = null;
  for (let i = 0; i < count; i++) event = controller.sample(ms) || event;
  return event;
};
assert.equal(feed(30, 4), null, 'one bad batch is insufficient');
assert.equal(feed(16, 4), null, 'a good batch clears accumulated pressure');
assert.equal(feed(30, 4), null);
assert.deepEqual([feed(30, 4).level, controller.snapshot().last.direction], [1, 'down']);
assert.equal(feed(30, 8).level, 2);
assert.equal(feed(30, 8).level, 3);
assert.equal(feed(30, 12), null, 'the ladder is bounded');
assert.equal(controller.snapshot().level, 3);
assert.equal(feed(16, 8), null, 'two good batches cannot restore a rung');
assert.deepEqual([feed(16, 4).level, controller.snapshot().last.direction], [2, 'up']);
assert.equal(feed(16, 12).level, 1);
assert.equal(feed(16, 12).level, 0);
assert.equal(feed(16, 12), null, 'full quality is the upper bound');

const runtime = source('src/render/adaptive-fidelity.js');
const scene = source('src/render/scene.js');
const post = source('src/render/post.js');
const lights = source('src/render/lights.js');
const main = source('src/main.js');

const scale = runtime.indexOf("return 'supersample-0.80'");
const bloom = runtime.indexOf("return 'bloom-bypass'");
const shadow = runtime.indexOf("return 'shadow-1024'");
assert.ok(scale >= 0 && scale < bloom && bloom < shadow,
  'quality falls through supersample, bloom, then shadow resolution');
assert.match(runtime, /QUERY\.get\('adaptive'\) === '1'/,
  'adaptive quality remains opt-in until the operator checkpoint');
assert.match(scene, /setAdaptiveRenderScale[\s\S]*renderer\.setSize/,
  'the first rung reallocates the real drawing buffer');
assert.match(post, /composer && adaptiveBloomEnabled/,
  'the second rung bypasses the composer without discarding it');
assert.match(post, /warmScenePrograms[\s\S]*renderer\.compile\(scene, camera\)[\s\S]*gl\.finish/,
  'the boot fence compiles representative programs and waits for the GPU');
assert.match(lights, /setAdaptiveShadowMapSize[\s\S]*shadow\.map\.dispose/,
  'the final rung retires the expensive shadow allocation');
assert.match(main, /sampleAdaptiveFidelity\(frameMs\)/,
  'the live wall-clock sampler drives the policy');
assert.match(main,
  /resetGame\(\);[\s\S]*mountHostileWarmResources\(\)[\s\S]*warmScenePrograms\(\)[\s\S]*dispose\(\)/,
  'program and hostile geometry warmup happens after run construction and before frame one');

console.log('ADAPTIVE FIDELITY: 3 stable degradation rungs');
