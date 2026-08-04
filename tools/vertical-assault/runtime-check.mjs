#!/usr/bin/env node
/* Focused Vertical Assault v2 contract: pure ladder feel plus source-level
   ownership for the sim/render seam. Actor-art asset contracts live in their
   own checks; this map gate intentionally does not stale when RIG art changes. */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LADDER_TUNE, ladderCandidate, ladderStep } from '../../src/pure/ladder.js';

const rails = [
  { id: 'near', x: 10, y0: 3, y1: 8, face: 1, kind: 'service' },
  { id: 'far', x: 14, y0: 2, y1: 6, face: 1, kind: 'rib' },
];

assert.equal(ladderCandidate(rails, { x: 10.45, y: 3, h: 1.7 }, 1)?.id, 'near',
  'Up enters inside the narrow 0.48-tile rail volume');
assert.equal(ladderCandidate(rails, { x: 10.49, y: 3, h: 1.7 }, 1), null,
  'vertical aim outside the rail volume never magnetizes RIG');
assert.equal(ladderCandidate(rails, { x: 10, y: 1.4, h: 1.7 }, 1), null,
  'body overlap alone cannot teleport RIG up from below the lower landing');
assert.equal(ladderCandidate(rails, { x: 10, y: 8.20, h: 1.7 }, -1)?.id, 'near',
  'Down enters from the upper landing padding');
assert.equal(ladderCandidate(rails, { x: 10, y: 8.20, h: 1.7 }, 1), null,
  'Up above the landing remains ordinary aim');

const climb = ladderStep({
  ladder: rails[0], x: 10.2, y: 4, h: 1.7,
  facing: 1, hInput: 0, vInput: 1, jumpBuffered: false, dt: 1 / 60,
});
assert.equal(climb.kind, 'climb');
assert.equal(climb.x, 10, 'climb snaps to the authored rail center');
assert.ok(Math.abs(climb.y - 4.2) < 1e-9 && climb.vy === 12,
  'climb advances at exactly 12 tiles/s');

const hold = ladderStep({
  ladder: rails[0], x: 10, y: 5, h: 1.7,
  facing: 1, hInput: 0, vInput: 0, jumpBuffered: false, dt: 1 / 60,
});
assert.deepEqual(hold, { kind: 'climb', x: 10, y: 5, vx: 0, vy: 0 },
  'neutral input holds without gravity or drift');

const launch = ladderStep({
  ladder: rails[0], x: 10, y: 5, h: 1.7,
  facing: 1, hInput: -1, vInput: 1, jumpBuffered: true, dt: 1 / 60,
});
assert.deepEqual(launch, {
  kind: 'jump', vx: -LADDER_TUNE.jumpX, vy: LADDER_TUNE.jumpY,
}, 'jump launches immediately in the chosen away direction');

const top = ladderStep({
  ladder: rails[0], x: 10, y: 7.95, h: 1.7,
  facing: -1, hInput: 0, vInput: 1, jumpBuffered: false, dt: 1 / 60,
});
assert.equal(top.kind, 'top-exit');
assert.ok(top.y > rails[0].y1 && top.vx > 0,
  'top auto-exit continues forward onto the upper lane with no wait frame');

const bottom = ladderStep({
  ladder: rails[0], x: 10, y: 3.05, h: 1.7,
  facing: 1, hInput: 0, vInput: -1, jumpBuffered: false, dt: 1 / 60,
});
assert.equal(bottom.kind, 'bottom-exit');
assert.ok(bottom.y < rails[0].y0 && bottom.vy < 0,
  'down exits below the lower endpoint cleanly');

const sim = readFileSync(new URL('../../src/sim/player.js', import.meta.url), 'utf8');
const level = readFileSync(new URL('../../src/render/level.js', import.meta.url), 'utf8');
assert.match(sim, /TRAVERSAL_CONTACTS_ENABLED = IS_TRAVERSAL_SLICE \|\| ACTIVE_FIXTURE === null/,
  'ledge/wall contacts follow the gameplay domain, not a renderer flag');
assert.match(sim, /LADDERS_ENABLED = ACTIVE_FIXTURE === null && ladders\.length > 0/,
  'fixtures cannot acquire ladder state');
assert.match(level, /if \(!\(ACTIVE_FIXTURE === null && ladders\.length\)\) return;/,
  'every normal-run presentation builds the same visible rails as collision');
assert.match(sim, /if \(keys\.fire && gameMs >= player\.nextFireAt\)/,
  'the ordinary firing path remains reachable for every traversal state');
assert.match(level, /!routeRenderable\(pool\.rows\[i\]\.s\)/,
  'real ladder instances obey the shared route visibility gate');
assert.match(level, /environmentRole = 'traversable-route-ladder'/,
  'rail pools expose their semantic render role');
assert.doesNotMatch(level, /const rungCount = Math\.floor\(\(height - 1\.8\)/,
  'decorative service spines no longer impersonate usable ladders');

console.log('Vertical Assault runtime: PASS');
console.log('  ladder entry: narrow / optional');
console.log('  climb: 12.0 tiles/s / fire path preserved');
console.log('  exits: jump away / forward top / lower release');
console.log('  render: route-owned ladder pools / no decorative impostors');
