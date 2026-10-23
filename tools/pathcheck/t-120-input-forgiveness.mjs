/* T-120 — input forgiveness is real and exactly as tuned (proposal §7.4 #4).
 *
 * Currency: a press a little LATE (RIG already off the deck) or a little EARLY
 * (RIG not yet down) still jumps — and the window is the one the tune declares
 * (CONFIG.player.coyoteMs / jumpBufferMs), at every frame rate the loop can run.
 *
 * Why this exists: the FAIR-GAP assertion named "a press up to 6 frames late
 * (one coyote window) still crosses every face-1 gap" is satisfied by the AIR
 * JUMP — T-108's M01 removed coyote time entirely and all 76 headless domains
 * stayed green. So both scenarios here WITHHOLD the air jump: the only way the
 * late or early press can get RIG up is the forgiveness under test.
 *
 * Mechanism: the real player sim (advanceGameMs + updatePlayer — the two calls
 * main.js's update() makes for RIG, in that order) on the shipped level and
 * tune, in a fresh process (tools/pathcheck/lib/default-run-child.mjs):
 *   coyote  RIG runs off a deck lip; the press arrives k frames after the frame
 *           RIG left it. Lateness = the consuming frame's clock minus the last
 *           grounded frame's. Forgiven iff lateness < coyoteMs.
 *   buffer  RIG falls onto a flat deck; the (held) press arrives k frames before
 *           the landing frame. Earliness = the first frame that can consume it
 *           minus the press. Fires — on the first grounded frame — iff
 *           earliness < jumpBufferMs.
 * At dt = 1/120, 1/60 and 1/30 s. Each window must be the tuned one: every
 * press more than half a frame inside it forgiven, every press more than half a
 * frame outside it refused (the frame AT the boundary is floating-point's call,
 * exactly as it is in the game).                                          */

import { fileURLToPath } from 'node:url';
import { CONFIG } from '../../src/config.js';
import { ok } from './_context.mjs';
import { runChild } from './lib/spawn.mjs';

export const title = 'T-120: coyote time and the jump buffer, measured with the air jump withheld';

const CHILD = fileURLToPath(new URL('./lib/default-run-child.mjs', import.meta.url));
// Per edit (HB_GATE_FAST=1) only the shipped 60 Hz is played; the merge gate
// (HB_GATE_FAST unset) plays all three rates. Falsifiers M01, M43, M44 are red
// at 60 Hz alone (T-120 fix round 1).
const ALL_RATES = [120, 60, 30];
const FAST = process.env.HB_GATE_FAST === '1';
const RATES = FAST ? [60] : ALL_RATES;

export async function run() {
  if (FAST) console.log(`SKIP t-120-input-forgiveness: ${ALL_RATES.length - RATES.length} of ${ALL_RATES.length} frame rates ` +
    'not played (HB_GATE_FAST=1 — per-edit tier; not counted as passes; unset it for 120/60/30 Hz)');
  const P = CONFIG.player;
  // one child per rate plays both scenarios (lib/default-run-child.mjs 'forgiveness')
  const perRate = await Promise.all(RATES.map((hz) => {
    const dt = 1 / hz;
    const maxK = Math.ceil(Math.max(P.coyoteMs, P.jumpBufferMs) / (1000 * dt)) + 3;
    return runChild(CHILD, [JSON.stringify({ mode: 'forgiveness', dt, maxK })]).then((r) => ({ hz, r }));
  }));
  const results = perRate.flatMap(({ hz, r }) => (r.error
    ? [{ hz, kind: 'coyote', r }, { hz, kind: 'buffer', r }]
    : [{ hz, kind: 'coyote', r: r.coyote }, { hz, kind: 'buffer', r: r.buffer }]));
  for (const { hz, kind, r } of results) {
    const tag = `T-120 ${kind} @ ${hz} Hz`;
    ok(!r.error && Array.isArray(r.rows) && r.rows.length > 4,
      `${tag}: the scenario ran on the shipped level` + (r.error ? ' — ' + r.error : ''));
    if (r.error || !Array.isArray(r.rows)) continue;
    const halfFrame = 500 / hz;
    if (kind === 'coyote') {
      const C = r.coyoteMs;
      const inside = r.rows.filter((x) => x.lateMs < C - halfFrame);
      const outside = r.rows.filter((x) => x.lateMs > C + halfFrame);
      const forgiven = r.rows.filter((x) => x.jumped).map((x) => x.lateMs);
      ok(inside.length > 0 && inside.every((x) => x.jumped),
        `${tag}: a press up to ${C} ms after RIG ran off the deck still jumps with the air jump withheld ` +
        `(forgiven lateness: ${forgiven.join(', ') || 'none'} ms; refused inside the window: ` +
        `${inside.filter((x) => !x.jumped).map((x) => x.lateMs).join(', ') || 'none'})`);
      ok(outside.length > 0 && outside.every((x) => !x.jumped),
        `${tag}: a press later than ${C} ms is not forgiven — the window is the tuned one, not longer ` +
        `(forgiven beyond it: ${outside.filter((x) => x.jumped).map((x) => x.lateMs).join(', ') || 'none'} ms)`);
    } else {
      const B = r.jumpBufferMs;
      const inside = r.rows.filter((x) => x.earlyMs !== null && x.earlyMs < B - halfFrame);
      const outside = r.rows.filter((x) => x.earlyMs !== null && x.earlyMs > B + halfFrame);
      ok(inside.length > 0 && inside.every((x) => x.fired && x.groundedFramesBeforeJump === 1),
        `${tag}: a press up to ${B} ms before landing fires on the first grounded frame with the air jump withheld ` +
        `(fired: ${r.rows.filter((x) => x.fired).map((x) => x.earlyMs + 'ms/' + x.groundedFramesBeforeJump + 'f').join(', ') || 'none'})`);
      ok(outside.length > 0 && outside.every((x) => !x.fired),
        `${tag}: a press earlier than ${B} ms before landing does not fire — the buffer is the tuned one, not longer ` +
        `(fired beyond it: ${outside.filter((x) => x.fired).map((x) => x.earlyMs).join(', ') || 'none'} ms)`);
    }
  }
}
