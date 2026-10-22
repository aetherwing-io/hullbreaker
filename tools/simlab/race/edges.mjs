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
  'phone-landscape': Object.freeze({ width: 844, height: 390 }),
  'phone-portrait': Object.freeze({ width: 390, height: 844 }),
  // ESTIMATE, not shipped: the closer phone frame the operator authorized in
  // decisions.md entry 20's addendum (RIG ~6% of screen height on phones,
  // desktop FAR untouched), to be built by T-107. Modelled exactly the way the
  // shipped ?view= scales work — the camera pulled straight along its depth
  // axis from the FAR pose (x, y, look target and fov unchanged) until RIG is
  // 6% of the frame height. T-107 may also move the look target or insets;
  // re-measure when it lands.
  'phone-landscape-6pct': Object.freeze({ width: 844, height: 390, rigFraction: 0.06, estimate: true }),
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
    'setEdges(probeXAtNdc(-rightNdc), probeXAtNdc(rightNdc))',
    '_probe.lookAt(C.lookX, C.lookY - activePortraitLookDrop(), 0)',
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

/* -> { left, right, width, depth, rightNdc, lookDrop } in route tiles,
   relative to scrollX (the sim's EDGE_L / EDGE_R). */
export function viewportEdges(width, height, cfg = CONFIG, rigFraction = null) {
  const C = cfg.camera;
  const aspect = width / height;
  const viewBase = (cfg.viewScales.far).depthMult;
  const depth = Number.isFinite(rigFraction) && rigFraction > 0
    ? depthForRigFraction(rigFraction, cfg)
    : traversalCameraDepth(C.z, aspect, C) *
      portraitViewDepthMult(viewBase, aspect, {
        startAspect: PORTRAIT_SAFE.startAspect,
        fullAspect: PORTRAIT_SAFE.fullAspect,
        compactMult: PORTRAIT_SAFE.compactViewDepthMult,
      });
  const u = portraitBlend(width, height);
  const insetPx = Math.min(width * 0.18, PORTRAIT_SAFE.maxInsetPx * u);
  const rightNdc = 1 - 2 * insetPx / width;
  const lookDrop = PORTRAIT_SAFE.lookDropTiles * u;
  // THREE.Object3D.lookAt basis for a camera: z = normalize(eye - target),
  // x = normalize(cross(worldUp, z)). The ray through (ndcX, 0) in camera space
  // is (ndcX * tanX, 0, -1); intersect it with the route plane z = 0.
  const px = C.x, py = C.y, pz = depth;
  let zx = px - C.lookX, zy = py - (C.lookY - lookDrop), zz = pz;
  const zl = Math.hypot(zx, zy, zz); zx /= zl; zy /= zl; zz /= zl;
  let xx = zz, xz = -zx;
  const xl = Math.hypot(xx, xz); xx /= xl; xz /= xl;
  const tanX = aspect * Math.tan((C.fov / 2) * Math.PI / 180);
  const at = (ndc) => {
    const dx = ndc * tanX * xx - zx;
    const dz = ndc * tanX * xz - zz;
    return px + dx * (-pz / dz);
  };
  const left = at(-rightNdc), right = at(rightNdc);
  // Vertical band on the route plane at screen centre: the local heights the
  // frame shows. The normal-run camera rides the render ascent (alt), not
  // RIG's y, so this band is fixed in local route coordinates.
  const tanY = Math.tan((C.fov / 2) * Math.PI / 180);
  const yx = zy * xz, yy = zz * xx - zx * xz, yz = -zy * xx;   // camera up = z × x
  const atY = (ndcY) => {
    const dy = ndcY * tanY * yy - zy;
    const dz = ndcY * tanY * yz - zz;
    return py + dy * (-pz / dz);
  };
  return { left, right, width: right - left, depth, rightNdc, lookDrop, aspect,
    bottom: atY(-1), top: atY(1) };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  assertCameraSourceMatches();
  const rows = Object.entries(VIEWPORTS).map(([id, v]) => {
    const e = viewportEdges(v.width, v.height, CONFIG, v.rigFraction);
    return {
      id, ...v, aspect: +e.aspect.toFixed(3), depth: +e.depth.toFixed(3),
      left: +e.left.toFixed(4), right: +e.right.toFixed(4), width: +e.width.toFixed(3),
      localYBottom: +e.bottom.toFixed(2), localYTop: +e.top.toFixed(2),
    };
  });
  console.log(JSON.stringify(rows, null, 2));
}
