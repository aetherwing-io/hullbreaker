#!/usr/bin/env node
/* Focused real-simulation proof for Vertical Assault v1. This imports the
   normal G1 sim with no DOM/renderer, drives one generated ladder, and proves
   movement plus continuous fire through the actual updatePlayer path. */

import assert from 'node:assert/strict';

globalThis.__HB_QUERY__ = 'shell=0&momentum=0&juice=0&fallback=0';

const E = await import('../../src/sim/edges.js');
const T = await import('../../src/sim/time.js');
const I = await import('../../src/sim/input.js');
const L = await import('../../src/sim/level.js');
const P = await import('../../src/sim/player.js');
const W = await import('../../src/sim/weapons.js');

assert.ok(L.ladders.length >= 20, 'normal G1 loads the generated assault ladders');
const rail = L.ladders[0];
assert.deepEqual(Object.keys(rail), ['id', 'x', 'y0', 'y1', 'face', 'kind'],
  'runtime consumes the exact frozen ladder schema');

E.setEdges(-100, 100);
T.setScrollX(0);
const rig = P.player;
function resetAt(y) {
  rig.x = rail.x;
  rig.y = y;
  rig.vx = 0;
  rig.vy = 0;
  rig.grounded = true;
  rig.onOneWay = null;
  rig.airJumpsLeft = P.P.airJumps;
  rig.coyoteUntil = 0;
  rig.dropUntil = 0;
  rig.jumpCutDone = true;
  rig.iframesUntil = 0;
  rig.hitstunUntil = 0;
  rig.nextFireAt = 0;
  P.clearPlayerTraversal(0);
  I.clearJumpBuffer();
  for (const key of Object.keys(I.keys)) I.keys[key] = false;
}

resetAt(rail.y0);
I.keys.up = true;
I.keys.fire = true;
const shots0 = W.shotsFired;
const yStart = rig.y;
for (let frame = 0; frame < 5; frame++) {
  T.advanceGameMs(1000 / 60);
  P.updatePlayer(1 / 60);
}
assert.equal(rig.traversalState, 'ladder', 'Up enters and remains on the real generated rail');
assert.equal(rig.ladderId, rail.id, 'runtime state owns the exact authored rail');
assert.ok(Math.abs((rig.y - yStart) - 1) < 1e-9,
  'five real sim frames climb exactly one tile at 12 tiles/s');
assert.ok(W.shotsFired > shots0, 'held fire continues through real ladder updates');

for (let frame = 0; frame < 30 && rig.traversalState === 'ladder'; frame++) {
  T.advanceGameMs(1000 / 60);
  P.updatePlayer(1 / 60);
}
assert.equal(rig.traversalState, 'free', 'upper endpoint auto-exits without a parked frame');
assert.ok(rig.y >= rail.y1 - 0.05 && rig.vx > 0,
  'top exit lands at the authored upper surface and carries forward');
const topExitX = rig.x;
const topExitRecatch = rig.traversalRecatchUntil;
for (let frame = 0; frame < 4; frame++) {
  T.advanceGameMs(1000 / 60);
  P.updatePlayer(1 / 60);
}
assert.equal(rig.traversalState, 'free',
  'holding Up through a top exit cannot magnetize RIG back onto the rail');
assert.ok(rig.x > topExitX && rig.traversalRecatchUntil === topExitRecatch,
  'top-exit carry advances while its finite recatch deadline remains stable');

resetAt((rail.y0 + rail.y1) / 2);
I.keys.up = true;
T.advanceGameMs(1000 / 60);
P.updatePlayer(1 / 60);
assert.equal(rig.traversalState, 'ladder', 'mid-rail vertical intent attaches');
I.keys.left = true;
I.bufferJumpUntil(T.gameMs + P.P.jumpBufferMs);
T.advanceGameMs(1000 / 60);
P.updatePlayer(1 / 60);
assert.equal(rig.traversalState, 'free', 'jump releases the live rail immediately');
assert.ok(rig.vx < 0 && rig.vy > 0, 'left+jump launches away with upward velocity');
const jumpExitX = rig.x;
const jumpExitRecatch = rig.traversalRecatchUntil;
for (let frame = 0; frame < 4; frame++) {
  T.advanceGameMs(1000 / 60);
  P.updatePlayer(1 / 60);
}
assert.equal(rig.traversalState, 'free',
  'held Up cannot recapture a jump-away during the traversal handoff');
assert.ok(rig.x < jumpExitX && rig.traversalRecatchUntil === jumpExitRecatch,
  'jump-away keeps its chosen direction and does not extend the recatch lock');

for (const key of Object.keys(I.keys)) I.keys[key] = false;
console.log('Vertical Assault real sim: PASS');
console.log(`  rail ${rail.id}: ${rail.y0.toFixed(2)} -> ${rail.y1.toFixed(2)}`);
console.log('  12.0 tiles/s, fire held, top exit forward, jump-away live');
