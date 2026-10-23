/* T-120 — the default run is deterministic across processes, and the sim cannot
 * tell whether the art loaded (proposal §7.4 #7 and the headless half of #6).
 *
 * Currency: replays and bot evidence stay honest (entry 16 keeps determinism
 * "deliberately"), and missing or late art never changes play (entry 16: art
 * may fail to load; gameplay may not change when it does).
 *
 * Three fresh processes play the DEFAULT URL's six-face run, enemies on, every
 * default verb on (momentum, CHARGE, HULL FALLBACK, aim assist, hit-stop), under
 * the same deterministic policy (tools/pathcheck/lib/default-run.mjs):
 *   A, B   twins — every frame's sim state must be identical (cross-process
 *          determinism; the static Math.random / Date.now ban in _context.mjs is
 *          the other half, and catches the literal calls before any domain runs)
 *   C      the same run with every `__HB_*` render diagnostic global reading as
 *          "ready" (the only channel layer purity leaves for the sim to observe
 *          the art; see default-run-child.mjs poison()) — must equal A.
 * T-108's M10 (a wasp hitbox that grows when a render-set global says the art is
 * ready) survived the old name-list guards; its falsifier here is twin C.
 *
 * Window: 600 frames (10 s) of face 1 — the first spawns (frame ~42), the
 * carrier, the first wasp dive (~96), bullets, capsules. Not the corners: the
 * T-102 turn proof plays those; this test is about the sim's inputs, which
 * every frame exercises. The browser half of #6 (a boot with the art blocked
 * whose sim state equals the normal run's) is in tools/orch/play-gate.mjs.  */

import { fileURLToPath } from 'node:url';
import { ok } from './_context.mjs';
import { firstDivergence, runChild } from './lib/spawn.mjs';

export const title = 'T-120: the default run is deterministic across processes and blind to the art';

const CHILD = fileURLToPath(new URL('./lib/default-run-child.mjs', import.meta.url));
// Per edit (HB_GATE_FAST=1): 300 frames, and only twins A and C — C is a second
// process with the same input (plus the poisoned render globals), so A === C
// proves both properties at once; B is played only when A and C differ, to say
// which one broke. The merge gate plays 600 frames with all three. Falsifiers
// M10 (frame 42) and M05c (an aliased Math.random, frame 96) are red in both;
// M05b (Math['random']) is a prelude kill since the ban reads bracket access.
const FAST = process.env.HB_GATE_FAST === '1';
const WINDOW = FAST ? 300 : 600;

export async function run() {
  if (FAST) console.log('SKIP t-120-determinism-and-art-blind-sim: twin B and frames 300-600 ' +
    '(HB_GATE_FAST=1 — per-edit tier; B runs only to tell a failure apart; unset it for the full run)');
  const trace = (extra = {}) => runChild(CHILD, [JSON.stringify({ mode: 'trace', frames: WINDOW, ...extra })]);
  let a, b, c;
  if (FAST) {
    [a, c] = await Promise.all([trace(), trace({ poisonRenderGlobals: true })]);
    const quick = !a.error && !c.error ? firstDivergence(a, c) : { frame: 0 };
    // A === C: C is the second process — the determinism comparison below is A
    // against C, and B is not needed; otherwise play B to tell the failures apart
    b = quick.frame === -1 && a.frames === c.frames ? c : await trace();
  } else {
    [a, b, c] = await Promise.all([trace(), trace(), trace({ poisonRenderGlobals: true })]);
  }
  ok(!a.error && !b.error && !c.error, `T-120: ${b === c ? 'two' : 'three'} default-run processes ran headlessly` +
    [a, b, c].filter((x) => x.error).map((x) => ' — ' + x.error).join(''));
  if (a.error || b.error || c.error) return;
  ok(a.frames === WINDOW && a.end.hostilesSeen > 0 && a.end.dives > 0,
    `T-120: the compared window is ${WINDOW} frames of the default run with hostiles and a wasp dive in it ` +
    `(frames ${a.frames}, spawns ${a.end.hostilesSeen}, dives ${a.end.dives})`);
  const ab = firstDivergence(a, b);
  ok(ab.frame === -1 && a.frames === b.frames,
    'T-120: two processes playing the default run with the same input produce the same sim state every frame' +
    (ab.frame >= 0 ? ` (first difference at frame ${ab.frame} in: ${ab.parts.join(', ')})` : ''));
  ok(c.poisonLive === true,
    'T-120: the art-ready twin really saw every __HB_* render diagnostic as "ready" (the poison is live)');
  const ac = firstDivergence(a, c);
  ok(ac.frame === -1 && a.frames === c.frames,
    'T-120: the sim cannot tell whether the art loaded — a run whose every render diagnostic reads "ready" ' +
    'equals the plain run frame for frame' +
    (ac.frame >= 0 ? ` (first difference at frame ${ac.frame} in: ${ac.parts.join(', ')})` : ''));
}
