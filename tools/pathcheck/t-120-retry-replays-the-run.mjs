/* T-120 — a retry replays the same run (proposal §7.4 #9).
 *
 * Currency (what a player notices): "try again" is the same climb — the same
 * spawns, the same wasp rhythm, the same capsules — and bot evidence across
 * retries is honest. It replaces boot-registry-contract's pin, which counted the
 * registry's owners and stayed green when an owner stopped resetting (T-108
 * mutant M34: the hostile-rng row registered but no-op).
 *
 * Mechanism: two fresh processes on tools/pathcheck/lib/default-run.mjs, the
 * real sim plus the REAL run-reset registry (src/boot/run-reset.js; only its four
 * render rows are inert stubs). Twin A plays a 20 s dirty prefix (RIG runs, fires,
 * swaps weapons, reaches the first gate; on its last frame it picks up SPREAD and
 * kills one hostile through the sim's own death path, arming that kill's
 * hit-stop) and carries CHRONO and a held key into a retry through the shipped
 * registry; twin B is a fresh boot whose clock is advanced by the same number of
 * steps without playing. Both then play the same policy for the same window, and
 * every frame's sim state (player, hostiles, bullets, capsules, modifiers, held
 * keys, the run clock relative to the retry, scroll, score, kills per weapon,
 * corner) must be identical.
 *
 * What it covers (T-120 fix round 1 owner sweep: each of the registry's 31 rows
 * replaced by a no-op, this test alone): 18 rows go red in both tiers —
 * input-keys, hostiles, projectiles, capsules, starter-weapon, weapon-kills,
 * modifiers, scroll, pace, score, spawner, hostile-rng, kill-count, shot-count,
 * player, corner-events, hit-stop, slice-stats. 13 stay green: four render rows
 * stubbed by design (corpses, projectile-tracers, camera-yaw,
 * juice-presentation), five fixtures or prototypes inert in the default run
 * (slice-retry, hook-input, hook, flow, transform), and four live owners the
 * first 20 s never touch (carrier-drops, meridian-defense, finale,
 * future-faces). Mutants M34, M45 and M47-M52 in tools/orch/mutants.mjs.
 *
 * Why the clock is matched: src/sim/time.js's gameMs is monotonic across
 * retries by design, and floating-point rounding of "deadline - duration"
 * depends on its absolute value. A retry at a LATER clock than a fresh boot is
 * therefore measured separately below and REPORTED, not asserted — on main
 * 5252c18 it diverges at the first hostile spawn by one frame of wasp motion
 * (src/sim/hostiles.js: `gameMs < e.enterUntil - W.enterMs`), a defect too small
 * to see but real; filed by T-120 as a proposed inbox issue.             */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ok, srcDir, stripComments } from './_context.mjs';
import { firstDivergence, runChild } from './lib/spawn.mjs';
import {
  MAIN_RESET_ALL_SIM_CALLS, MAIN_RESET_SIM_CALLS, MAIN_UPDATE_ALL_SIM_CALLS, MAIN_UPDATE_SIM_CALLS, mainSimImports,
} from './lib/default-run.mjs';
import { makeResetRegistry } from '../../src/boot/reset-registry.js';

export const title = 'T-120: a retry replays the same run (the shipped reset registry, driven)';

const CHILD = fileURLToPath(new URL('./lib/default-run-child.mjs', import.meta.url));
// Per edit (HB_GATE_FAST=1): 5 s compared instead of 10 s, and the reported
// later-clock comparison is skipped. The dirty prefix is 20 s in both tiers: a
// 10 s one (0.2 CPU-s cheaper) never reached the first gate, so a dead
// 'corner-events' row read green per edit (T-120 fix round 1 owner sweep).
const FAST = process.env.HB_GATE_FAST === '1';
const DIRTY = 1200;                   // frames of play before the retry
const WINDOW = FAST ? 300 : 600;      // frames compared after it (spawns from frame 42, first dive ~96)

export async function run() {
  /* ---- the replica is still the shipped loop (drift guard) ------------- *
   * default-run.mjs transcribes main.js's update() and resetGame() because
   * main.js imports three.js. If main.js's order changes, every driven result
   * of the host would describe a loop the game no longer runs.            */
  const main = stripComments(readFileSync(join(srcDir, 'main.js'), 'utf8'));
  const body = (name) => (main.match(new RegExp('function ' + name + '\\(\\w*\\)\\s*\\{([\\s\\S]*?)\\n\\}')) || [])[1] || '';
  const callsIn = (src, names) => [...src.matchAll(/\b([A-Za-z]\w*)\s*\(/g)].map((m) => m[1]).filter((n) => names.includes(n));
  // every call to a function main.js imports from src/sim/ or src/boot/: a NEW
  // one fails here (review finding 6), not only a missing or reordered one
  const SIM = [...mainSimImports(main)];
  const upd = callsIn(body('update'), MAIN_UPDATE_SIM_CALLS);
  const updAll = callsIn(body('update'), SIM);
  ok(JSON.stringify(upd) === JSON.stringify(MAIN_UPDATE_SIM_CALLS) &&
     JSON.stringify(updAll) === JSON.stringify(MAIN_UPDATE_ALL_SIM_CALLS),
    'T-120: src/main.js update() still makes the sim calls tools/pathcheck/lib/default-run.mjs transcribes, ' +
    'in its order, and no other (got ' + updAll.join(' > ') + ')');
  const resetBody = body('resetGame');
  const rst = [...new Set(callsIn(resetBody, MAIN_RESET_SIM_CALLS))];
  const rstAll = callsIn(resetBody, SIM);
  ok(JSON.stringify(rst) === JSON.stringify(MAIN_RESET_SIM_CALLS) && /^\s*resetRunState\(\)/.test(resetBody) &&
     JSON.stringify(rstAll) === JSON.stringify(MAIN_RESET_ALL_SIM_CALLS),
    'T-120: src/main.js resetGame() still starts with resetRunState() and ends the default run with the calls ' +
    'the host transcribes, and no other (got ' + rstAll.join(' > ') + ')');

  /* ---- the registry itself (src/boot/reset-registry.js; restored from the
   * deleted tools/boot-registry-check.mjs:62-74, review finding 3) -------- */
  {
    const trace = [];
    const reg = makeResetRegistry([{ id: 'a', reset: () => trace.push('a') }, { id: 'b', reset: () => trace.push('b') }]);
    const ran = reg.reset();
    ok(JSON.stringify(ran) === '["a","b"]' && JSON.stringify(trace) === '["a","b"]' &&
       JSON.stringify(reg.snapshot()) === JSON.stringify({ owners: ['a', 'b'], runs: 1, last: ['a', 'b'] }),
      'T-120: makeResetRegistry runs its owners once each, in declared order, and its snapshot says so');
    let dup = null; try { makeResetRegistry([{ id: 'a', reset() {} }, { id: 'a', reset() {} }]); } catch (e) { dup = e; }
    ok(!!dup && /duplicate reset owner/.test(dup.message), 'T-120: a second reset owner with the same id is refused');
    let named = null;
    try { makeResetRegistry([{ id: 'ok', reset() {} }, { id: 'boom', reset() { throw new Error('x'); } }]).reset(); } catch (e) { named = e; }
    ok(!!named && named.owner === 'boom' && /reset owner boom failed/.test(named.message),
      'T-120: a failing reset owner is named, not swallowed');
    let reentered = null;
    const loop = makeResetRegistry([{ id: 'r', reset: () => { try { loop.reset(); } catch (e) { reentered = e; } } }]);
    loop.reset();
    ok(!!reentered && /not reentrant/.test(reentered.message), 'T-120: a reset cannot start inside a reset');
  }

  /* ---- the twins ------------------------------------------------------- */
  if (FAST) console.log('SKIP t-120-retry-replays-the-run: seconds 5-10 of the compared window and the later-clock report ' +
    '(HB_GATE_FAST=1 — per-edit tier compares 5 s after the same 20 s dirty prefix; unset it for 10 s)');
  const [retried, fresh, laterClockFresh] = await Promise.all([
    runChild(CHILD, [JSON.stringify({ mode: 'retry', dirtyFrames: DIRTY, frames: WINDOW })]),
    runChild(CHILD, [JSON.stringify({ mode: 'retry', cleanClock: true, dirtyFrames: DIRTY, frames: WINDOW })]),
    FAST ? Promise.resolve({ error: 'skipped (HB_GATE_FAST=1)' }) : runChild(CHILD, [JSON.stringify({ mode: 'trace', frames: WINDOW })]),
  ]);
  ok(!retried.error && !fresh.error,
    'T-120: both retry twins ran headlessly' + (retried.error ? ' — retried: ' + retried.error : '') +
    (fresh.error ? ' — fresh: ' + fresh.error : ''));
  if (retried.error || fresh.error) return;
  const d = retried.dirty || {};
  ok(d.shots > 0 && d.scrollX > 30 && d.kills >= 1 && d.weapon === 'S',
    `T-120: the dirty prefix really played before the retry (shots ${d.shots}, scroll ${d.scrollX}, ` +
    `hostiles alive ${d.hostiles}, kills ${d.kills}, weapon ${d.weapon}, state ${d.state})`);
  ok(retried.frames === WINDOW && fresh.frames === WINDOW && fresh.end.hostilesSeen > 0 && fresh.end.dives > 0,
    `T-120: the compared window is ${WINDOW} frames long and contains hostile spawns and a wasp dive ` +
    `(frames ${retried.frames}/${fresh.frames}, spawns ${fresh.end.hostilesSeen}, dives ${fresh.end.dives})`);
  ok(retried.end.resetOwners > 0 && retried.end.resetOwners === fresh.end.resetOwners,
    `T-120: the retry ran the shipped registry (${retried.end.resetOwners} owners)`);
  const div = firstDivergence(retried, fresh);
  ok(div.frame === -1,
    'T-120: a retry replays the same run — every frame of sim state after a real retry equals a fresh boot ' +
    'at the same clock' + (div.frame >= 0 ? ` (first difference at frame ${div.frame} in: ${div.parts.join(', ')})` : ''));

  /* ---- reported, not asserted: a retry at a later clock ------------------ */
  if (!laterClockFresh.error) {
    const late = firstDivergence(retried, laterClockFresh);
    console.log('pathcheck note (reported, not asserted): a retry at clock +' + (DIRTY / 60).toFixed(0) +
      ' s vs a fresh boot at clock 0: ' + (late.frame < 0 ? 'identical over ' + WINDOW + ' frames'
        : 'first difference at frame ' + late.frame + ' in ' + late.parts.join(', ') +
          ' (floating-point rounding of the monotonic game clock; see this domain\'s header)'));
  }
}
