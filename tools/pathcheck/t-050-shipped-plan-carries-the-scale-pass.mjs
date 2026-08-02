// T-050 — the scale pass is in the plan the SHIPPED URL bakes (I-037).
//
// WHY THIS DOMAIN EXISTS, STATED HONESTLY. I-037 reported that T-045's scale
// pass "emits nothing on the shipped default run": in a browser at
// `index.html?shell=0`, `limbBakePlan(CONFIG, groundH, {scale:true})` and
// `{scale:false}` both returned 829 pieces with zero mark/backdrop kinds and a
// `silhouette` still in the plan. That is real, reproducible evidence — but it
// is NOT evidence about this tree. Driven from the real level's groundH, on
// main, the same call returns 1633 with 818 mark/backdrop pieces, and the
// shipped frame differs from ?scale=0 by 16-40% of its pixels at every viewport
// (reports/tasks/T-050/build.md). 829/829/silhouette is the exact fingerprint
// of a PRE-T-045 src/pure/limb.js, declared limbBakePlan(cfg, groundH) — no
// third parameter, so the options argument is dropped — and a stale copy of
// that module was what the page was executing. (Function.length does not tell
// the builds apart: it stops at the first defaulted parameter, so today's
// (cfg, groundH, opts = {}) reports 2 as well. The piece count, the kind set
// and the presence of `silhouette` are what discriminate.)
//
// So the gate hole was never in the numbers T-045 asserted. It is that every
// gate in this repo reads files off disk in Node, and nothing asserted that the
// build a person is LOOKING AT is the build on disk. That check cannot live in
// this file — pathcheck has no browser — it lives in
// tools/playtest/verify-served.mjs, and the last block here keeps the surface
// that check reads from disappearing silently.
//
// What this domain adds on top of T-045's own block (pathcheck-suite-3.mjs):
//   1. the plan a caller gets with NO opts / empty opts is the shipped plan —
//      the pass cannot be lost by dropping the flag on the way in;
//   2. EVERY facet of the run carries reference objects and backdrop mass, not
//      just the run as a whole (an average is not a frame);
//   3. the renderer bakes that same plan and publishes its length, so an
//      outside observer can ask a running page which build it is.
//
// Everything is built from `buildLevel(CONFIG).groundH` — the real generated
// terrain the game ships, never a synthetic flat array. A synthetic array was
// what made I-037's contrast look like a groundH discriminator; it is not one
// (the scale emitters never read groundH), and asserting against one would
// prove nothing about the level a player runs.

import { readFileSync } from 'node:fs';
import { CONFIG } from '../../src/config.js';
import { buildLevel } from '../../src/pure/generator.js';
import { limbBakePlan, limbFacets } from '../../src/pure/limb.js';
import { ok } from './_context.mjs';

export const title = 'T-050: the shipped plan carries the scale pass (I-037)';

const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const isMark = (k) => k.startsWith('mark');
const isBackdrop = (k) => k.startsWith('bd');

export async function run() {
  const gH = buildLevel(CONFIG).groundH;             // the REAL level, not a fixture
  const shipped = limbBakePlan(CONFIG, gH);          // what src/render/limb.js bakes
  const legacy = limbBakePlan(CONFIG, gH, { scale: false });   // ?scale=0, the A/B
  const marks = shipped.filter((p) => isMark(p.kind));
  const backdrop = shipped.filter((p) => isBackdrop(p.kind));

  /* ---- 1. the pass survives every way a caller can omit the flag ------- *
   * The defect that was reported would look exactly like this if it were
   * real, so this is the assertion that states it as a falsifiable claim
   * about the shipped level rather than about the author's intent.        */
  {
    ok(marks.length > 0 && backdrop.length > 0,
       'T-050: the shipped plan emits the scale pass over the REAL level: ' +
       marks.length + ' human-scale reference pieces + ' + backdrop.length +
       ' backdrop-tier pieces (I-037 measured 0 of each on a stale module)');
    ok(!shipped.some((p) => p.kind === 'silhouette'),
       'T-050: the shipped plan carries NO `silhouette` slab — that kind is ' +
       'emitted only on the ?scale=0 path, so its presence means the legacy ' +
       'branch ran (it was the tell in I-037)');
    // opts.scale !== false: every shape of "no opinion" must still ship it.
    for (const [label, opts] of [['no opts at all', undefined], ['empty opts', {}],
                                 ['{scale: undefined}', { scale: undefined }],
                                 ['{scale: true}', { scale: true }]]) {
      const n = opts === undefined ? limbBakePlan(CONFIG, gH) : limbBakePlan(CONFIG, gH, opts);
      ok(n.length === shipped.length &&
         n.filter((p) => isMark(p.kind) || isBackdrop(p.kind)).length === marks.length + backdrop.length,
         'T-050: ' + label + ' bakes the shipped plan (' + n.length + ' pieces) — the ' +
         'pass cannot be lost by a caller that drops the flag on the way in');
    }
    ok(legacy.length < shipped.length &&
       shipped.length - legacy.length >= 200,
       'T-050: ?scale=0 is a SMALLER plan by ' + (shipped.length - legacy.length) +
       ' pieces (floor 200) — default and escape hatch are not the same frame');
    ok(legacy.every((p) => !isMark(p.kind) && !isBackdrop(p.kind)) &&
       legacy.some((p) => p.kind === 'silhouette'),
       'T-050: ?scale=0 is exactly the pre-T-045 build — no mark/backdrop kinds, ' +
       'the silhouette pair restored (' +
       legacy.filter((p) => p.kind === 'silhouette').length + ' slabs)');
  }

  /* ---- 2. every facet, not the run on average -------------------------- *
   * A player sees one facet at a time. "818 pieces exist somewhere in the
   * level" is the shape of claim that let I-037 stand unexamined for a whole
   * cycle; "this facet has none" is the one a frame can falsify.          */
  {
    // The two ends are counted SEPARATELY, by the sign of the piece's depth:
    // near marks sit proud of the hull (depth > 0), sister marks ride the
    // backdrop limb (depth < 0). A combined count hides the failure that
    // matters — during T-050 a break that deleted every near-limb mark on one
    // facet left this assertion green, because the sister limb's own ladder
    // and railing kept the total above the floor. A scale cue with only one
    // end is not a comparison.
    const facets = limbFacets(CONFIG);
    for (const f of facets) {
      const m = shipped.filter((p) => p.facet === f.k && isMark(p.kind));
      const near = m.filter((p) => p.depth > 0).length;
      const sister = m.filter((p) => p.depth < 0).length;
      const b = shipped.filter((p) => p.facet === f.k && isBackdrop(p.kind)).length;
      ok(near >= 8 && sister >= 8 && b >= 8,
         'T-050: facet ' + f.k + ' (s ' + f.s0 + '-' + f.s1 + ') carries ' + near +
         ' reference pieces on the limb RIG runs on, ' + sister + ' on the ' +
         'backdrop limb and ' + b + ' backdrop-tier pieces of its own — no facet ' +
         'of the run is bare at either end (floor 8 each)');
    }
    // The opening screen is where the operator looks first, and it is the one
    // frame every single run shows, so it gets its own subject.
    const opening = shipped.filter((p) => isMark(p.kind) && p.s <= 40);
    const kinds = new Set(opening.map((p) => p.kind));
    ok(opening.length >= 12 && kinds.has('markRung') && kinds.has('markPanel'),
       'T-050: the first 40 tiles — the frame every run opens on — carry ' +
       opening.length + ' reference pieces including rungs and a hatch cover');
    // Sizes are the whole mechanism: a reference object has to be RIG-sized.
    const rung = shipped.find((p) => p.kind === 'markRung');
    const door = shipped.find((p) => p.kind === 'markPanel' && p.h > 2.4);
    ok(rung && door && door.h / CONFIG.player.height > 1.2 && door.h / CONFIG.player.height < 2.2,
       'T-050: a door in the shipped plan is ' + (door ? door.h.toFixed(2) : '?') +
       ' tiles against a ' + CONFIG.player.height + '-tile marine (' +
       (door ? (door.h / CONFIG.player.height).toFixed(2) : '?') + 'x) — ' +
       'door-sized, which is what makes it a scale cue');
  }

  /* ---- 3. the renderer bakes THAT plan, and says so out loud ----------- *
   * I-037's session could not tell a stale page from a broken tree because
   * nothing outside the page could ask it what it had baked. window.HB.g1
   * .pieces IS that number (src/main.js), it is the length of this plan
   * (src/render/limb.js), and tools/playtest/verify-served.mjs compares the
   * two. These assertions keep that chain from being cut silently.        */
  {
    const rsrc = read('src/render/limb.js');
    const msrc = read('src/main.js');
    ok(/limbBakePlan\(CONFIG,\s*groundH,\s*\{\s*scale:\s*SCALE_PASS\s*\}\)/.test(rsrc) &&
       /import\s*\{\s*groundH\s*\}\s*from\s*'\.\.\/sim\/level\.js'/.test(rsrc),
       'T-050: the renderer bakes the plan from the REAL level module\'s groundH ' +
       'with the shipped flag — the page and this gate plan the same body');
    ok(/return plan\.length;/.test(rsrc) && /limbPieces = IS_G1 \? bakeLimb\(\) : 0/.test(rsrc),
       'T-050: limbPieces IS the baked plan length, so a page that baked a ' +
       'different plan reports a different number');
    ok(/g1:\s*IS_G1\s*\?\s*\{\s*pieces:\s*limbPieces/.test(msrc),
       'T-050: window.HB.g1.pieces publishes it — the one number that lets an ' +
       'outside observer ask a RUNNING page which build it is');
    // read defensively: a DELETED verifier must fail this gate, not crash it
    let vsrc = '';
    try { vsrc = read('tools/playtest/verify-served.mjs'); } catch { vsrc = ''; }
    ok(/HB\.g1\.pieces|g1\.pieces/.test(vsrc) && /cache:\s*'reload'/.test(vsrc),
       'T-050: tools/playtest/verify-served.mjs still compares the page\'s baked ' +
       'plan against this tree AND cached bytes against network bytes — the two ' +
       'mechanisms that both produce I-037\'s 829/829/silhouette fingerprint');
  }
}
