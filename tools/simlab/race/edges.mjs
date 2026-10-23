/* edges.mjs — the six-face run's frustum-edge calibration, without a renderer.
 *
 * Mirrors src/render/camera.js calibrateEdges() for the NORMAL run (no
 * fixture): FAR view depth (CONFIG.viewScales.far), the portrait pullback
 * (traversalCameraDepth with CONFIG.camera.portraitMinAspect), the compact
 * portrait view multiplier (portraitViewDepthMult), the portrait look drop and
 * the symmetric portrait NDC inset (PORTRAIT_SAFE in camera.js). The sim reads
 * these two numbers through src/sim/edges.js: EDGE_L is the pursuing damage
 * plane, EDGE_R the right clamp, and both feed spawn placement, gate layout and
 * the momentum screen fraction — so a phone viewport changes the SIMULATION,
 * not only the picture.
 *
 * PORTRAIT_SAFE is duplicated here because camera.js imports three.js and
 * cannot be loaded in Node. `assertCameraSourceMatches()` re-reads camera.js
 * and fails loudly if the constants drift, so a stale copy cannot silently
 * measure a different camera.
 *
 * T-107 (the phone frame): the lens and both edges now come from
 * src/pure/framing.js — the module camera.js itself calls — so this replica
 * cannot drift from the page's lens math. What the page resolves depends on
 * touch hardware, which a size cannot express; this lab's rule is that its
 * phone-sized viewports ARE touch phones (LANE-BRIEF: phones are checked with
 * hasTouch), so they get the phone lens the operator's iPhone gets. The 4th
 * argument of viewportEdges() selects otherwise: a NUMBER keeps T-104's
 * pure-pull ESTIMATE (FAR fov, route-plane edges; 'phone-landscape-6pct'), a
 * STRING forces that ?view= request ('far' on a phone = the escape hatch).
 * EDGE_R is the actor-plane right clamp camera.js calibrates (I-104), so the
 * visible ROUTE width is `routeRight - left`, a little more than
 * `right - left` (the sim's clamp-to-plane width the follow-lead reads).
 *
 * Cross-checked against the live page: 1280x800 FAR reproduces the
 * window.HB.edges() calibration recorded in tools/simlab/t2lab.mjs
 * (-27.438263128944797, 45.73492361770374) to 1e-12, and
 * tools/simlab/race/probe-edges.mjs re-measures every viewport in Chrome.
 *
 * Zero effect on the shipped game: read-only imports of src/config.js and
 * src/pure/traversal.js.                                                    */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(here, '..', '..', '..');
const SRC = join(REPO_ROOT, 'src');

const { CONFIG } = await import('file://' + join(SRC, 'config.js'));
const { portraitViewDepthMult, traversalCameraDepth } =
  await import('file://' + join(SRC, 'pure', 'traversal.js'));
const FRAMING = await import('file://' + join(SRC, 'pure', 'framing.js'));

export const PORTRAIT_SAFE = Object.freeze({
  startAspect: 0.9,
  fullAspect: 0.56,
  compactViewDepthMult: 1.15,
  maxInsetPx: 46,
  lookDropTiles: 1.55,
});

/* The viewports this lab measures. Desktop 16:10 is the harness's long-standing
   default (1280x800 and 1440x900 share an aspect, so they share edges); 16:9 is
   the common laptop/monitor shape; the phone pair is LANE-BRIEF's mandated
   check (landscape 844x390, portrait 390x844). */
export const VIEWPORTS = Object.freeze({
  'desktop-16x10': Object.freeze({ width: 1280, height: 800 }),
  'desktop-16x9': Object.freeze({ width: 1920, height: 1080 }),
  // Since T-107 the phone rows are TOUCH phones: the shipped phone lens
  // (decisions.md entry 20 addendum). Before T-107 they were FAR.
  'phone-landscape': Object.freeze({ width: 844, height: 390 }),
  'phone-portrait': Object.freeze({ width: 390, height: 844 }),
  // ESTIMATE, superseded by T-107's built frame ('phone-landscape' above):
  // T-104's model of the closer phone frame — the camera pulled straight
  // along its depth axis from the FAR pose until RIG is 6% of the frame
  // height, route-plane edges. Kept so T-104's tables stay reproducible.
  'phone-landscape-6pct': Object.freeze({ width: 844, height: 390, rigFraction: 0.06, estimate: true }),
  // The escape hatch on a phone (?view=far): today's FAR phone frame.
  'phone-landscape-far': Object.freeze({ width: 844, height: 390, rigFraction: 'far' }),
  'phone-portrait-far': Object.freeze({ width: 390, height: 844, rigFraction: 'far' }),
});

// Camera depth at which RIG (CONFIG.player.height tiles) fills `fraction` of
// the frame height on the route plane — the same visible-height model
// facts.mjs uses, which reproduces the shipped FAR value (3.74%).
export function depthForRigFraction(fraction, cfg = CONFIG) {
  return cfg.player.height / (fraction * 2 * Math.tan((cfg.camera.fov / 2) * Math.PI / 180));
}

export function assertCameraSourceMatches() {
  const text = readFileSync(join(SRC, 'render', 'camera.js'), 'utf8');
  const block = text.match(/const PORTRAIT_SAFE = Object\.freeze\(\{([\s\S]*?)\}\);/);
  if (!block) throw new Error('edges.mjs: PORTRAIT_SAFE block not found in src/render/camera.js');
  for (const [key, value] of Object.entries(PORTRAIT_SAFE)) {
    const m = block[1].match(new RegExp(key + ':\\s*([0-9.]+)'));
    if (!m || Number(m[1]) !== value)
      throw new Error(`edges.mjs: PORTRAIT_SAFE.${key} drifted (camera.js has ${m ? m[1] : 'nothing'}, lab has ${value})`);
  }
  for (const needle of [
    'traversalCameraDepth(CONFIG.camera.z, innerWidth / innerHeight, framing)',
    'portraitViewDepthMult(base, innerWidth / innerHeight',
    // T-107: the lens and the actor-plane right clamp (src/pure/framing.js)
    'resolveFramingId(VIEW_REQUEST, innerWidth, innerHeight, touchHardware())',
    'framingLens(id, innerWidth, innerHeight, cameraDepth, CONFIG, _lens)',
    '_probe.position.set(C.x, C.y + lens.liftTiles, cameraDepth)',
    '_probe.lookAt(C.lookX, C.lookY + lens.liftTiles - activePortraitLookDrop(), 0)',
    'setEdges(probeXAtNdc(-rightNdc), ACTIVE_FIXTURE || !lens.actorClamp',
    'actorPlaneRightX((ndcY) => probeXAtNdcOnActorPlane(rightNdc, ndcY)) - rightClampInsetTiles()',
  ]) {
    if (!text.includes(needle))
      throw new Error('edges.mjs: camera.js no longer contains `' + needle + '` — re-derive the replica');
  }
  return true;
}

function portraitBlend(width, height) {
  const aspect = width / height;
  if (aspect >= PORTRAIT_SAFE.startAspect) return 0;
  return Math.min(1, Math.max(0,
    (PORTRAIT_SAFE.startAspect - aspect) /
    (PORTRAIT_SAFE.startAspect - PORTRAIT_SAFE.fullAspect)));
}

/* -> { left, right, width, depth, rightNdc, lookDrop, aspect, bottom, top,
   routeRight, routeWidth, fovDeg, liftTiles, framing } in route tiles,
   relative to scrollX (the sim's EDGE_L / EDGE_R). `framing` (the historical
   4th argument, `rigFraction`): a number = T-104's pure-pull estimate at that
   RIG fraction; a string = a forced ?view= request; absent = what the page
   resolves here, with this lab's phone-sized viewports taken as touch phones.
   `bottom`/`top`: the local heights the frame shows at screen centre on the
   route plane (the camera rides the ascent, not RIG's y).                  */
export function viewportEdges(width, height, cfg = CONFIG, framing = null) {
  const C = cfg.camera;
  const aspect = width / height;
  const u = portraitBlend(width, height);
  const insetPx = Math.min(width * 0.18, PORTRAIT_SAFE.maxInsetPx * u);
  const rightNdc = 1 - 2 * insetPx / width;
  const lookDrop = PORTRAIT_SAFE.lookDropTiles * u;
  const estimate = typeof framing === 'number' && Number.isFinite(framing) && framing > 0;
  const request = typeof framing === 'string' ? framing : null;
  const viewId = request && cfg.viewScales[request] ? request : 'far';
  const depth = estimate
    ? depthForRigFraction(framing, cfg)
    : traversalCameraDepth(C.z, aspect, C) *
      portraitViewDepthMult(cfg.viewScales[viewId].depthMult, aspect, {
        startAspect: PORTRAIT_SAFE.startAspect,
        fullAspect: PORTRAIT_SAFE.fullAspect,
        compactMult: PORTRAIT_SAFE.compactViewDepthMult,
      });
  const lens = estimate
    ? { id: 'estimate', fovDeg: C.fov, liftTiles: 0 }
    : FRAMING.framingLens(
      FRAMING.resolveFramingId(request, width, height,
        FRAMING.isPhoneViewport(width, height, true, cfg), cfg),
      width, height, depth, cfg);
  const e = FRAMING.framedEdges({
    width, height, depth, fovDeg: lens.fovDeg, liftTiles: lens.liftTiles,
    lookDrop, rightNdc, actorClamp: estimate ? false : undefined,   // undefined: the page's rule
  }, cfg);
  const atY = (ndcY) => FRAMING.rayPlanePoint(e.eye, e.basis, lens.fovDeg, aspect, 0, ndcY, 0).y;
  return { left: e.left, right: e.right, width: e.right - e.left, depth, rightNdc, lookDrop, aspect,
    bottom: atY(-1), top: atY(1), routeRight: e.routeRight, routeWidth: e.routeRight - e.left,
    fovDeg: lens.fovDeg, liftTiles: lens.liftTiles, framing: lens.id };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  assertCameraSourceMatches();
  const rows = Object.entries(VIEWPORTS).map(([id, v]) => {
    const e = viewportEdges(v.width, v.height, CONFIG, v.rigFraction);
    return {
      id, ...v, framing: e.framing, fovDeg: +e.fovDeg.toFixed(3), aspect: +e.aspect.toFixed(3),
      depth: +e.depth.toFixed(3), left: +e.left.toFixed(4), right: +e.right.toFixed(4),
      width: +e.width.toFixed(3), routeRight: +e.routeRight.toFixed(4), routeWidth: +e.routeWidth.toFixed(3),
      localYBottom: +e.bottom.toFixed(2), localYTop: +e.top.toFixed(2),
    };
  });
  console.log(JSON.stringify(rows, null, 2));
}
