#!/usr/bin/env node
/* Focused browser-free gate for the shipped six-face defense response. */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MERIDIAN_DEFENSE_STAGES, MERIDIAN_DEFENSE_TIMINGS,
  MERIDIAN_DEFENSE_TRIGGER_TILES, meridianDefenseLifecycleAt,
  meridianDefenseLifecycleSnapshot, newMeridianDefenseLifecycleState,
  resetMeridianDefenseLifecycleState, stepMeridianDefenseLifecycle,
} from '../src/pure/meridian-defense-lifecycle.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(root, file), 'utf8');
const manifest = JSON.parse(read('assets/generated/vfx/meridian-defense-vfx-pack-v1.manifest.json'));
const sim = read('src/sim/meridian-defense.js');
const renderer = read('src/render/meridian-defense-vfx.js');
const bridge = read('src/sim/bridge.js');

function runReplay() {
  const state = newMeridianDefenseLifecycleState();
  const trace = [];
  const intro = stepMeridianDefenseLifecycle(state, {
    nowMs: 0, routeFace: 0, cornerFace: 1, cornerState: 'idle',
    cornerPrimed: false, playerX: 6, faceStart: 24, authoredArmed: true,
    finale: false, fixture: false,
  });
  trace.push({ face: 0, stage: intro.stage, state: intro.state, reason: intro.reason });

  let nowMs = 100;
  for (let face = 1; face <= 6; face++) {
    const phase = face - 1;
    const faceStart = 24 + phase * 65;
    const base = {
      routeFace: face, cornerFace: face, cornerState: 'idle', cornerPrimed: false,
      playerX: faceStart + MERIDIAN_DEFENSE_TRIGGER_TILES[phase], faceStart,
      authoredArmed: true, finale: false, fixture: false,
    };
    const tell = stepMeridianDefenseLifecycle(state, { ...base, nowMs });
    trace.push({ face, stage: tell.stage, impulse: tell.impulse });
    assert.equal(tell.stage, 'tell');
    let elapsed = MERIDIAN_DEFENSE_TIMINGS[phase].tell;
    const fire = stepMeridianDefenseLifecycle(state, { ...base, nowMs: nowMs + elapsed });
    trace.push({ face, stage: fire.stage, impulse: fire.impulse });
    assert.equal(fire.stage, 'fire');
    assert.equal(fire.impulse, true);
    const fireAgain = stepMeridianDefenseLifecycle(state,
      { ...base, nowMs: nowMs + elapsed + 1 });
    assert.equal(fireAgain.impulse, false);
    elapsed += MERIDIAN_DEFENSE_TIMINGS[phase].fire;
    const recovery = stepMeridianDefenseLifecycle(state, { ...base, nowMs: nowMs + elapsed });
    trace.push({ face, stage: recovery.stage, impulse: recovery.impulse });
    assert.equal(recovery.stage, 'recovery');
    elapsed += MERIDIAN_DEFENSE_TIMINGS[phase].recovery;
    const spent = stepMeridianDefenseLifecycle(state, { ...base, nowMs: nowMs + elapsed });
    trace.push({ face, stage: spent.stage, impulse: spent.impulse });
    assert.equal(spent.stage, 'spent');
    elapsed += MERIDIAN_DEFENSE_TIMINGS[phase].spent;
    const dormant = stepMeridianDefenseLifecycle(state, { ...base, nowMs: nowMs + elapsed });
    trace.push({ face, stage: dormant.stage, reason: dormant.reason });
    assert.equal(dormant.stage, 'dormant');
    nowMs += elapsed + 100;
  }
  return { trace, snapshot: meridianDefenseLifecycleSnapshot(state) };
}

const first = runReplay();
const second = runReplay();
assert.deepEqual(second, first, 'identical route facts produce an identical replay');
assert.deepEqual(MERIDIAN_DEFENSE_STAGES, ['tell', 'fire', 'recovery', 'spent']);
assert.equal(first.trace[0].state, 'observe', 'intro explicitly remains dormant Observe');
assert.equal(first.trace[0].stage, 'dormant');
assert.equal(first.snapshot.activations, 6);
assert.equal(first.snapshot.impulses, 6);
assert.equal(first.snapshot.activatedMask, 0b111111);
assert.equal(first.snapshot.impulseMask, 0b111111);

for (let phase = 0; phase < 6; phase++) {
  const timing = MERIDIAN_DEFENSE_TIMINGS[phase];
  assert.ok(timing.tell >= 380 && timing.tell <= 620);
  assert.equal(meridianDefenseLifecycleAt(timing.tell, phase).stage, 'fire');
  assert.equal(meridianDefenseLifecycleAt(
    timing.tell + timing.fire + timing.recovery + timing.spent, phase).stage, 'dormant');
}

const interrupted = newMeridianDefenseLifecycleState();
const interruptedBase = {
  routeFace: 2, cornerFace: 2, cornerState: 'idle', cornerPrimed: false,
  playerX: 24 + 65 + MERIDIAN_DEFENSE_TRIGGER_TILES[1], faceStart: 24 + 65,
  authoredArmed: true, finale: false, fixture: false,
};
assert.equal(stepMeridianDefenseLifecycle(interrupted,
  { ...interruptedBase, nowMs: 100 }).stage, 'tell');
assert.equal(stepMeridianDefenseLifecycle(interrupted,
  { ...interruptedBase, nowMs: 200, cornerState: 'turning' }).stage, 'dormant');
assert.equal(interrupted.cancellations, 1);
assert.equal(interrupted.impulses, 0);
assert.equal(stepMeridianDefenseLifecycle(interrupted,
  { ...interruptedBase, nowMs: 300 }).stage, 'tell',
'a pre-fire interruption returns its activation token instead of dead-ending the face');
resetMeridianDefenseLifecycleState(interrupted);
assert.deepEqual(meridianDefenseLifecycleSnapshot(interrupted), {
  activatedMask: 0, impulseMask: 0, active: null,
  activations: 0, impulses: 0, cancellations: 0,
});

assert.equal(manifest.components.length, 64);
assert.ok(manifest.components.every((row) =>
  ['tell', 'fire', 'recovery', 'spent'].includes(row.timingState)));
assert.ok(manifest.components.filter((row) => row.timingState === 'tell')
  .every((row) => row.maxOpacity <= 0.38));
assert.ok(manifest.components.filter((row) => row.timingState === 'spent')
  .every((row) => row.emissiveStage === 'off'));

assert.match(bridge, /meridian:\s*\{\s*sync:\s*noop,\s*reset:\s*noop\s*\}/);
assert.match(sim, /notifyPressureEnvironmentChange\(presentation\.impulseStrength\)/);
assert.doesNotMatch(sim, /spawnHostile|gating\s*:\s*true|from ['"]\.\.\/render\//);
assert.match(renderer, /foregroundResponseSockets\(\)/);
assert.match(renderer, /currentSocket\.phase !== event\.phase/);
assert.match(renderer, /currentSocket\.route\.s > event\.cornerLimit/);
assert.match(renderer, /!currentSocket && event\.stage === 'tell'/);
assert.match(renderer, /mesh\.visible = false/);
assert.equal((renderer.match(/new THREE\.PlaneGeometry\(/g) || []).length, 1);
assert.equal((renderer.match(/new THREE\.Mesh\(/g) || []).length, 1);
assert.equal((renderer.match(/new THREE\.InstancedMesh\(/g) || []).length, 4);
assert.match(renderer, /mechanismParts: 10/);
assert.match(renderer, /const AMBIENT_RIGS = 3/);
assert.match(renderer, /AMBIENT_LIFE_ACTIVE_MS = 2300/);
assert.match(renderer, /ambientLifeDrawSlots: 0/);
assert.match(renderer, /fixedAtBoot: true/);
assert.match(renderer, /textureTransforms: false/);
assert.doesNotMatch(renderer, /CanvasTexture|createElement\(['"]canvas|\.clone\(\)/,
  'response allocates no runtime canvas, cloned atlas or texture transform');
assert.doesNotMatch(renderer,
  /from ['"]\.\.\/sim\/(?:player|weapons|hostiles)|\b(?:player|bullet|hostile)\./,
  'renderer source carries no actor/projectile attachment path');

console.log(JSON.stringify({
  ok: true,
  replay: {
    activations: first.snapshot.activations,
    impulses: first.snapshot.impulses,
    stages: MERIDIAN_DEFENSE_STAGES,
    intro: first.trace[0],
  },
  runtime: {
    atlasTextures: manifest.runtime.gpuTextures,
    components: manifest.components.length,
    geometryPools: 5,
    atlasDrawSlots: 1,
    mechanismDrawSlots: 2,
    mechanismParts: 10,
    ambientDrawSlots: 2,
    ambientParts: 15,
    directSpawns: 0,
    gatingSpawns: 0,
  },
}, null, 2));
