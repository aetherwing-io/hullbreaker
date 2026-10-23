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
const WINDOW = 600;

export async function run() {
  const [a, b, c] = await Promise.all([
    runChild(CHILD, [JSON.stringify({ mode: 'trace', frames: WINDOW })]),
    runChild(CHILD, [JSON.stringify({ mode: 'trace', frames: WINDOW })]),
    runChild(CHILD, [JSON.stringify({ mode: 'trace', frames: WINDOW, poisonRenderGlobals: true })]),
  ]);
  ok(!a.error && !b.error && !c.error, 'T-120: three default-run processes ran headlessly' +
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
