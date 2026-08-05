import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG } from '../../src/config.js';
import {
  BEND_S, HALT_S, activeWorldFacet, routeRenderOwned, worldFacetAt,
} from '../../src/pure/path.js';
import {
  cornerTimeline, cornerYawDeltaDeg, zipperOffset,
} from '../../src/pure/waves.js';
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
  ok(routeRenderOwned(BEND_S[0] - 1.5, true, HALT_S[0] - 11, cameraFacet, CONFIG, BEND_S) &&
     !routeRenderOwned(BEND_S[0] - 0.5, false, HALT_S[0] - 11, cameraFacet, CONFIG, BEND_S),
     'the built current hull survives while the pre-bend construction edge stays hidden');

  // Transition-gap regression. Camera ownership changes on the first integer
  // millisecond whose yaw reaches the 0.96 handoff. The far construction set
  // does not commit until finishCorner at t6. A face-wide `every(built)` gate
  // therefore erased the already locked arrival deck for this whole interval.
  // Reproduce the real first-corner score: at t=690, exactly nineteen arrival
  // columns form a contiguous built prefix and no later row is visible; at
  // t=1100, the finish commit exposes every configured row of the face.
  const timeline = cornerTimeline(CONFIG);
  let handoffMs = 0;
  while (cornerYawDeltaDeg(handoffMs, CONFIG) /
      (2 * CONFIG.path.turnDeg) < 0.96) handoffMs++;
  const cornerS = BEND_S[0] - CONFIG.path.chamferTiles / 2;
  const incomingFacet = 1;

  function columnBuiltAt(column, tMs) {
    if (column < cornerS) return true;
    const j = column - cornerS;
    if (j < CONFIG.waves.zipCols)
      return zipperOffset(tMs, j, CONFIG).phase === 'locked';
    return tMs >= timeline.t6;
  }

  function incomingPrefixAt(tMs) {
    let prefix = 0, laterVisible = 0, stopped = false, total = 0;
    for (let column = 0; column < CONFIG.levelLength; column++) {
      const s = column + 0.5;
      if (worldFacetAt(s, CONFIG, BEND_S) !== incomingFacet) continue;
      total++;
      const visible = routeRenderOwned(
        s, columnBuiltAt(column, tMs), HALT_S[0], 1, CONFIG, BEND_S,
      );
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
  ok(atHandoff.prefix === 19 && atHandoff.laterVisible === 0,
     'handoff frame retains its 19 built arrival columns and leaks zero future rows ' +
     `(got ${atHandoff.prefix} prefix, ${atHandoff.laterVisible} later)`);
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

  ok(/columnBuilt/.test(route) && /routeRenderOwned/.test(route),
     'shared render ownership composes simulation build state with camera topology');
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
