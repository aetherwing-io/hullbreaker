/* T-120 — an unjudged prototype never arms unless its own flag is typed
 * (proposal §7.4 #8).
 *
 * Currency: the game a player opens — and every fixture URL the operator is
 * sent — runs exactly the judged build. Entry 16 retired blanket
 * off-by-default flags but kept flags for A/B and UNJUDGED experiments, and
 * CLAUDE.md keeps `?hook=1` (judged and rejected, entry 5) inert; entry 25
 * releases the hook for deletion; once it is deleted, its rows report "gone".
 *
 * Why this exists: the old check called the pure resolver
 * (resolveTraversalPace) with its DEFAULT arguments, while the shipped wiring
 * passes { hook: HOOK_ENABLED, flow: FLOW_ENABLED } from src/mode.js, which no
 * test resolved — T-108's M07 (the hook armed by default in the traversal slice)
 * stayed green. Here src/mode.js itself is evaluated under each URL a player or
 * the operator opens (tools/pathcheck/lib/mode-flags-child.mjs), and a positive
 * control proves each flag still turns on when typed (a renamed or dead flag
 * cannot pass vacuously).                                                 */

import { fileURLToPath } from 'node:url';
import { ok } from './_context.mjs';
import { runChild } from './lib/spawn.mjs';

export const title = 'T-120: unjudged prototypes are inert unless their own flag is typed (src/mode.js resolved)';

const CHILD = fileURLToPath(new URL('./lib/mode-flags-child.mjs', import.meta.url));

// the URLs a player or the operator is actually given
const BASES = ['', 'testapi=1', 'selftest=1', 'slice=traversal', 'slice=traversal&testapi=1',
  'slice=transform', 'slice=transform&enemies=0', 'g2=1'];
// each prototype: the flag export, what "off" reads as, and the URL that types it
const PROTOTYPES = [
  { flag: 'HOOK_ENABLED', off: false, on: 'slice=traversal&hook=1', why: 'hook v1, judged and rejected (entry 5)' },
  { flag: 'FLOW_ENABLED', off: false, on: 'slice=traversal&flow=1', why: 'the momentum spine, unjudged' },
  { flag: 'AUTOBOUNCE_ENABLED', off: false, on: 'slice=traversal&autobounce=1', why: 'held-jump rebound, unjudged' },
  { flag: 'RIBRUN_ENABLED', off: false, on: 'slice=traversal&ribrun=1', why: 'the authored slope, unjudged' },
  { flag: 'CROUCH_ENABLED', off: false, on: 'crouch=1', why: 'crouch A/B' },
  // ZIPPER_REVEAL (?zip=1, the brick-slam corner) is gone: T-121 deleted it (entry 25), and t-009 asserts ?zip=1 / ?g1=0 inert
  { flag: 'HOUND_STAGE', off: null, on: 'slice=traversal&hound=1', why: 'houndframe trial stage' },
  { flag: 'POLYP_STAGE', off: null, on: 'slice=traversal&polyp=1', why: 'polyp trial stage' },
  { flag: 'MORTAR_STAGE', off: null, on: 'slice=traversal&mortar=1', why: 'spore mortar trial stage' },
];

export async function run() {
  const queries = [...BASES, ...PROTOTYPES.map((p) => p.on)];
  const r = await runChild(CHILD, [JSON.stringify(queries)]);
  ok(!r.error && Array.isArray(r.rows) && r.rows.length === queries.length,
    'T-120: src/mode.js resolved under every player/operator URL' + (r.error ? ' — ' + r.error : ''));
  if (r.error) return;
  const at = (q) => r.rows.find((x) => x.query === q);
  for (const p of PROTOTYPES) {
    const present = BASES.every((q) => at(q).flags[p.flag] !== '__absent__');
    if (!present) {
      console.log(`pathcheck note (reported, not asserted): src/mode.js no longer exports ${p.flag} (${p.why}) — its rows are skipped`);
      continue;
    }
    const armed = BASES.filter((q) => at(q).flags[p.flag] !== p.off);
    ok(armed.length === 0,
      `T-120: ${p.flag} (${p.why}) is off on every URL that does not type it` +
      (armed.length ? ` — armed on: ${armed.map((q) => '?' + q).join(', ')}` : ''));
    const typed = at(p.on).flags[p.flag];
    ok(typed !== p.off && typed !== '__absent__',
      `T-120: ${p.flag} still turns on when its own flag is typed (?${p.on} -> ${JSON.stringify(typed)}), ` +
      'so the check above reads the live flag');
  }
  // the resolved slice composition carries no prototype data unless typed
  const leaks = BASES.filter((q) => at(q).activeSlice && (at(q).activeSlice.hook || at(q).activeSlice.flow));
  ok(leaks.length === 0,
    'T-120: the traversal slice a URL resolves carries no hook or flow data unless ?hook=1 / ?flow=1 is typed' +
    (leaks.length ? ` — leaked on: ${leaks.map((q) => '?' + q).join(', ')}` : ''));
  ok(at('').activeFixture === null && at('').flags.IS_TRAVERSAL_SLICE === false &&
     at('').flags.IS_TRANSFORM_SLICE === false,
    'T-120: the default URL resolves to the six-face run (no fixture active)');
}
