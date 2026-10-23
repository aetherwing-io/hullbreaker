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
 * render rows are inert stubs). Twin A plays a dirty prefix (RIG runs, fires,
 * swaps weapons, takes the first gate's wasps) and then retries through the
 * shipped registry; twin B is a fresh boot whose clock is advanced by the same
 * number of steps without playing. Both then play the same policy for the same
 * window, and every frame's sim state (player, hostiles, bullets, capsules, the
 * run clock relative to the retry, scroll, score, corner) must be identical.
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
import { MAIN_RESET_SIM_CALLS, MAIN_UPDATE_SIM_CALLS } from './lib/default-run.mjs';

export const title = 'T-120: a retry replays the same run (the shipped reset registry, driven)';

const CHILD = fileURLToPath(new URL('./lib/default-run-child.mjs', import.meta.url));
const DIRTY = 1200;      // 20 s of play before the retry
const WINDOW = 600;      // 10 s compared after it (spawns from frame 42, first dive ~96)

export async function run() {
  /* ---- the replica is still the shipped loop (drift guard) ------------- *
   * default-run.mjs transcribes main.js's update() and resetGame() because
   * main.js imports three.js. If main.js's order changes, every driven result
   * of the host would describe a loop the game no longer runs.            */
  const main = stripComments(readFileSync(join(srcDir, 'main.js'), 'utf8'));
  const body = (name) => (main.match(new RegExp('function ' + name + '\\(\\w*\\)\\s*\\{([\\s\\S]*?)\\n\\}')) || [])[1] || '';
  const callsIn = (src, names) => [...src.matchAll(/\b([A-Za-z]\w*)\s*\(/g)].map((m) => m[1]).filter((n) => names.includes(n));
  const upd = callsIn(body('update'), MAIN_UPDATE_SIM_CALLS);
  ok(JSON.stringify(upd) === JSON.stringify(MAIN_UPDATE_SIM_CALLS),
    'T-120: src/main.js update() still makes the sim calls tools/pathcheck/lib/default-run.mjs transcribes, ' +
    'in its order (got ' + upd.join(' > ') + ')');
  const resetBody = body('resetGame');
  const rst = [...new Set(callsIn(resetBody, MAIN_RESET_SIM_CALLS))];
  ok(JSON.stringify(rst) === JSON.stringify(MAIN_RESET_SIM_CALLS) && /^\s*resetRunState\(\)/.test(resetBody),
    'T-120: src/main.js resetGame() still starts with resetRunState() and ends the default run with the calls ' +
    'the host transcribes (got ' + rst.join(' > ') + ')');

  /* ---- the twins ------------------------------------------------------- */
  const [retried, fresh, laterClockFresh] = await Promise.all([
    runChild(CHILD, [JSON.stringify({ mode: 'retry', dirtyFrames: DIRTY, frames: WINDOW })]),
    runChild(CHILD, [JSON.stringify({ mode: 'retry', cleanClock: true, dirtyFrames: DIRTY, frames: WINDOW })]),
    runChild(CHILD, [JSON.stringify({ mode: 'trace', frames: WINDOW })]),
  ]);
  ok(!retried.error && !fresh.error,
    'T-120: both retry twins ran headlessly' + (retried.error ? ' — retried: ' + retried.error : '') +
    (fresh.error ? ' — fresh: ' + fresh.error : ''));
  if (retried.error || fresh.error) return;
  const d = retried.dirty || {};
  ok(d.shots > 0 && d.scrollX > 30 && d.hostiles + d.kills > 0,
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
