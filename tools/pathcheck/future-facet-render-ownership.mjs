import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG } from '../../src/config.js';
import {
  BEND_S, HALT_S, activeWorldFacet, routeRenderOwned, worldFacetAt,
} from '../../src/pure/path.js';
import {
  cornerTimeline, cornerYawDeltaDeg,
} from '../../src/pure/waves.js';
import * as LV from '../../src/sim/level.js';
import { ok, srcDir, stripComments } from './_context.mjs';

export const title = 'future facets have zero visible route-bound renderables';

export async function run() {
  // Immediately before the first handoff the camera still owns played face 1.
  // Pretend every future column is already generated *and built*: topology
  // alone must still expose none of them. This is stricter than boot, where
  // the simulation also marks those columns unbuilt.
  const scroll = CONFIG.path.introTiles + 8;
  const cameraFacet = 0;
  const active = activeWorldFacet(scroll, cameraFacet, CONFIG);
  let futureRows = 0;
  let futureVisible = 0;
  let activeVisible = 0;
  for (let column = 0; column < CONFIG.levelLength; column++) {
    const s = column + 0.5;
    const owner = worldFacetAt(s, CONFIG, BEND_S);
    const visible = routeRenderOwned(s, true, scroll, cameraFacet, CONFIG, BEND_S);
    if (owner > active) {
      futureRows++;
      if (visible) futureVisible++;
    } else if (owner === active && visible) activeVisible++;
  }
  ok(active === 0 && futureRows > 300 && activeVisible >= CONFIG.path.introTiles +
      CONFIG.path.faceTiles,
     'proof spans the climb while frame one owns the coplanar intro and first played face');
  ok(futureVisible === 0,
     `pre-turn render ownership exposes zero future rows (got ${futureVisible})`);
  ok(!routeRenderOwned(BEND_S[0], true, scroll, cameraFacet, CONFIG, BEND_S),
     'the exact bend is not a generic future-face exception; only RIG owns the turning joint');
  ok(!routeRenderOwned(scroll + 1, false, scroll, cameraFacet, CONFIG, BEND_S),
     'an unbuilt row is invisible even on the camera-owned face');
  // T-201 re-model (decisions.md entries 21 and 25; I-105): this used to
  // assert that the pre-bend column stays HIDDEN as an unbuilt construction
  // edge — the zipper-era state that also made the sim treat RIG's own gate
  // deck as a hole. The protected property is now the opposite and is read
  // from the SIM's own build query: the pre-bend column is drawn before the
  // turn, and the camera-owned hull around it with it.
  {
    LV.unbuildFutureFaces();                            // the boot/reset row, as shipped
    const preBend = BEND_S[0] - 0.5;
    const builtPre = LV.columnBuilt(Math.floor(preBend));
    ok(routeRenderOwned(BEND_S[0] - 1.5, LV.columnBuilt(Math.floor(BEND_S[0] - 1.5)), HALT_S[0] - 11,
         cameraFacet, CONFIG, BEND_S) &&
       routeRenderOwned(preBend, builtPre, HALT_S[0] - 11, cameraFacet, CONFIG, BEND_S),
       'T-201: the pre-bend column (the deck RIG fights from) is built in the sim and drawn before the turn');
  }

  // Transition-gap regression, re-modelled (T-201; decisions.md entries 21 and
  // 25). Camera ownership changes on the first integer millisecond whose yaw
  // reaches the 0.96 handoff. It used to model the brick-slam zipper's build
  // schedule (19 built arrival columns at the handoff, the rest at t6) as the
  // intended reveal; the zipper and the sim's build state are gone, so the
  // property is asserted with the SIM's own build query: at the handoff the
  // default reveal draws the whole arriving facet and nothing beyond it, and
  // the finish frame draws exactly the same rows.
  const timeline = cornerTimeline(CONFIG);
  let handoffMs = 0;
  while (cornerYawDeltaDeg(handoffMs, CONFIG) /
      (2 * CONFIG.path.turnDeg) < 0.96) handoffMs++;
  const incomingFacet = 1;

  function incomingPrefixAt() {
    let prefix = 0, laterVisible = 0, stopped = false, total = 0;
    for (let column = 0; column < CONFIG.levelLength; column++) {
      const s = column + 0.5;
      const owner = worldFacetAt(s, CONFIG, BEND_S);
      const visible = routeRenderOwned(s, LV.columnBuilt(column), HALT_S[0], 1, CONFIG, BEND_S);
      if (owner !== incomingFacet) { if (visible) laterVisible++; continue; }
      total++;
      if (!stopped && visible) prefix++;
      else if (!visible) stopped = true;
      else laterVisible++;
    }
    return { prefix, laterVisible, total };
  }

  const atHandoff = incomingPrefixAt(handoffMs);
  const atFinish = incomingPrefixAt(timeline.t6);
  ok(handoffMs === 690 && timeline.t6 === 1100,
     `handoff regression pins the live 690→1100 ms interval (got ${handoffMs}→${timeline.t6})`);
  ok(atHandoff.prefix === CONFIG.path.faceTiles && atHandoff.total === CONFIG.path.faceTiles &&
     atHandoff.laterVisible === 0,
     `T-201: at the ${handoffMs} ms handoff the default reveal draws all ${CONFIG.path.faceTiles} ` +
     `arrival rows and leaks no other facet (got ${atHandoff.prefix} of ${atHandoff.total}, ` +
     `${atHandoff.laterVisible} leaked)`);
  ok(atFinish.prefix === CONFIG.path.faceTiles &&
     atFinish.total === CONFIG.path.faceTiles && atFinish.laterVisible === 0,
     `finish frame expands the same draw prefix to all ${CONFIG.path.faceTiles} arrival rows without a hole`);

  const render = (file) => stripComments(
    readFileSync(join(srcDir, 'render', file), 'utf8'),
  );
  const route = render('route-visibility.js');
  const level = render('level.js');
  const seams = render('seams.js');
  const capsules = render('capsules.js');
  const hostiles = render('hostiles.js');
  const bullets = render('bullets.js');
  const crown = render('crown.js');
  const main = stripComments(readFileSync(join(srcDir, 'main.js'), 'utf8'));

  // T-127 (entry 25): the render cleanup dropped route-visibility.js's read
  // of the sim build query (constant since T-201; the deleted ?zip=1 reveal
  // was its one reader), so only the camera-topology half of this pin is kept.
  ok(/routeRenderOwned/.test(route),
     'shared render ownership reads camera topology (routeRenderOwned)');
  ok(/ownershipKey\s*=\s*`\$\{facet\}:\$\{f\}`/.test(level) &&
     /routeHullFacets/.test(level) && /panel\.mesh\.visible/.test(level) &&
     /routeRenderable\(row\.s\)/.test(level),
     'hull batches split facet/build phases; panels, catwalks, props and lights share the gate');
  ok(/setDrawRange\(0,\s*drawCount\)/.test(level) &&
     /if\s*\(!routeRenderable\(sample\.s\)\)\s*break/.test(level) &&
     /columnEnds/.test(level) && !/samples\.every\(routeRenderable\)/.test(level),
     'merged hull and bay meshes draw their contiguous built prefix instead of hiding a whole face');
  ok(/unbuildFutureFaces\(\);\s*dressingCullStamp\s*=\s*'';\s*updateWorldDressingCull\(\)/.test(level),
     'MENU seeds route ownership after build reset even when ?world=0 creates no dressing pools');
  ok(/updateSeamFoldCull/.test(seams) && /routeRenderable\(pipRows\[i\]\.s\)/.test(seams) &&
     /HIDE/.test(seams) && /updateSeamFoldCull\(\)/.test(main),
     'static seam cores and halos replace remote instance matrices every ownership revision');
  ok(/if\s*\(!routeRenderable\(c\.x\)\)/.test(capsules) && /releaseContactShadow\(c\)/.test(capsules),
     'capsule art and its shadow cannot leak from a future face');
  ok(/if\s*\(!routeRenderable\(e\.x\)\)/.test(hostiles) &&
     /if\s*\(!routeRenderable\(c\.s\)\)/.test(hostiles) &&
     /hideHostileVisual/.test(hostiles),
     'hostile bodies, companions, corpses and shadows are all withheld off-facet');
  ok(/visibleProjectileFacet\(\)\s*&&\s*routeRenderable\(s\)/.test(bullets),
     'projectiles require both their bend owner and the shared build/phase owner');
  ok(/crownRoot\.visible\s*=\s*routeRenderable\(crownSignal\.s\)/.test(crown) &&
     /updateCrownFacetCull\(\)/.test(main),
     'the boot-resident Crown landmark remains absent until its built outro facet');
}
