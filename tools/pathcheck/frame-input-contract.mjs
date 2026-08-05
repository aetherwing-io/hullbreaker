// Frame-scoped input contract: pure timing plus composition-root wiring.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GAMEPLAY_CODES, createFrameInputTimeline, gameMsToInputTick,
} from '../../src/pure/frame-input.js';
import { here, ok } from './_context.mjs';

export const title = 'frame-scoped deterministic input';

export async function run() {
  const dt = 16.667;
  ok(gameMsToInputTick(0, dt) === 0 && gameMsToInputTick(dt, dt) === 1 &&
     gameMsToInputTick(dt + 0.001, dt) === 2,
     'frame input: timestamps resolve to the first update whose start clock reached them');

  const applied = [];
  const timeline = createFrameInputTimeline({
    fixedDtMs: dt,
    stopAtMs: dt * 2,
    // Intentionally put keydown before keyup at one timestamp: normalization
    // must release first so a same-tick re-press remains a real fresh edge.
    events: [
      { t: 0, type: 'keydown', code: 'ArrowRight' },
      { t: dt, type: 'keydown', code: 'ArrowRight' },
      { t: dt, type: 'keyup', code: 'ArrowRight' },
      { t: dt, type: 'keydown', code: 'Space' },
    ],
    applyEdge: (code, type, repeat) => applied.push({ code, type, repeat }),
  });
  ok(timeline.beforeUpdate(0) && applied.length === 1 && applied[0].code === 'ArrowRight',
     'frame input: t=0 drains before update zero');
  timeline.afterUpdate();
  ok(timeline.beforeUpdate(dt) && applied.slice(1, 4).map((e) => e.type).join(',') ===
     'keyup,keydown,keydown',
     'frame input: a same-timestamp release precedes presses on one exact tick');
  timeline.reassertHeld(dt);
  ok(applied.slice(-2).every((e) => e.type === 'keydown' && e.repeat === true),
     'frame input: reset restores held state as repeat edges, never fresh jump/hook presses');
  timeline.afterUpdate();
  ok(!timeline.beforeUpdate(dt * 2) && timeline.snapshot().status === 'complete' &&
     timeline.snapshot().tick === timeline.snapshot().stopTick,
     'frame input: the page freezes before the exact terminal update');
  const ledger = timeline.snapshot().events;
  ok(ledger.every((e) => e.dispatchedVia === 'frame' &&
     e.actualDispatchTick === e.scheduledTick),
     'frame input: every ledger row proves exact scheduled/actual tick identity');

  let rejected = false;
  try {
    createFrameInputTimeline({
      fixedDtMs: dt, stopAtMs: 10,
      events: [{ t: 0, type: 'keydown', code: 'KeyP' }],
      applyEdge() {},
    });
  } catch (err) { rejected = /non-gameplay/.test(String(err.message)); }
  ok(rejected && !GAMEPLAY_CODES.includes('KeyP'),
     'frame input: shell/pause controls are rejected instead of weakly simulated');

  const main = readFileSync(join(here, '..', 'src', 'main.js'), 'utf8');
  ok(main.indexOf('frameInputTimeline.beforeUpdate(gameMs)') < main.indexOf('update(dt);') &&
     /finally\s*\{[\s\S]*frameInputTimeline\.afterUpdate\(\)/.test(main),
     'frame input: main drains before update and advances its cursor even when update throws');
  ok(/Object\.freeze\(\{ snapshot: telemetry, inputTimeline: frameInputSnapshot \}\)/.test(main) &&
     !/queueEvent\s*[:=]/.test(main),
     'frame input: testapi exposes read-only evidence, not a mutable input injection API');

  const player = readFileSync(join(here, '..', 'src', 'sim', 'player.js'), 'utf8');
  ok((main.match(/if \(!e\.shiftKey\) keys\.strafe = false;/g) || []).length === 2 &&
     /if \(keys\.strafe && v === 0\) return;/.test(player),
     'frame input: a lost Shift release self-heals and explicit vertical aim always escapes strafe lock');
}
