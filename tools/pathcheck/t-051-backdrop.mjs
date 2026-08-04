// Domain: T-051 backdrop layers
//
// Production now uses one shared resident anatomy map, one transparent coil
// map, world-space condensation geometry and one sparse component-atlas draw
// per active facet. The old five-plate placement table remains only as
// provenance/retirement metadata; no static route-like plate quad is built.
// Three things are checkable without a browser:
//
//   1. THE DATA IS INTERNALLY CONSISTENT AND SAFE. The two derived fences
//      (play-band clearance, FAR-view frame coverage) are re-computed here
//      from src/render/backdrop-table.js's own exported arithmetic — the
//      same functions that authored the retired metadata — never re-typed by
//      hand, so that compatibility data cannot silently rot while it remains
//      in CONFIG.
//   2. THE RECORDED ART MATCHES THE FILES. canvas dims are MEASURED off the
//      PNGs (tools/assets/lib/png.mjs), not typed, so a T-053 regeneration
//      that moves a canvas fails here rather than silently mis-scaling.
//   3. THE RESIDENT LOADER CONTRACT. Same shape as T-049's own gate (which already
//      asserts, across every file in src/render/ + src/ui/, that
//      src/render/preload.js is the only THREE.TextureLoader in the tree):
//      this module additionally proves src/render/backdrop.js itself awaits
//      the shared gate, never constructs its own loader, and degrades a
//      load/build failure to a console note rather than a thrown error or a
//      T-032 panel. The sim/pure ban on naming this feature is the same
//      belt-and-suspenders class T-049 added, scoped to this feature's own
//      strings. The live browser lane separately proves four settled/eight
//      turning calls, direct shared maps, real parallax and no future props.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BACKDROP_TUNE, CONFIG } from '../../src/config.js';
import {
  faceMidS, fogFraction, minYBottom, plateSize, resolveBackdropOn, viewDist,
} from '../../src/render/backdrop-table.js';
import { CORNER_S, HALT_S } from '../../src/pure/path.js';
import { readPngSize } from '../../tools/assets/lib/png.mjs';
import { here, layerFiles, near, ok, srcDir, stripComments } from './_context.mjs';

export const title = 'T-051 backdrop layers';

const BACKDROP_DIR = join(here, '..', 'assets', 'generated', 'backdrops');

export async function run() {

/* ==== T-051 backdrop layers ============================================ */
{
  const BD = BACKDROP_TUNE;
  const tierIds = Object.keys(BD.tiers);
  const plateIds = Object.keys(BD.plates);

  /* --- 1. the placements reference real tiers/plates/faces -------------- */
  for (const pl of BD.placements) {
    ok(Number.isInteger(pl.face) && pl.face >= 1 && pl.face <= CONFIG.path.faces,
       'T-051: placement face ' + pl.face + ' is a real facet (1..' + CONFIG.path.faces + ')');
    ok(plateIds.includes(pl.plate),
       'T-051: placement names a declared plate (' + pl.plate + ')');
    ok(tierIds.includes(pl.tier),
       'T-051: placement names a declared tier (' + pl.tier + ')');
  }
  // no facet repeats its own (plate, tier) pairing — the "cycling" claim in
  // BACKDROP_TUNE's own comment, checked rather than taken on faith
  const seen = new Map();
  for (const pl of BD.placements) {
    const key = pl.face + '/' + pl.plate + '/' + pl.tier;
    ok(!seen.has(key), 'T-051: placement ' + key + ' is not duplicated');
    seen.set(key, true);
  }

  /* --- 2. the recorded art matches the files ----------------------------
   * Only the canvas size is measured here (unlike T-049's sprite ink boxes):
   * a backdrop plate has no primitive it must reach or exceed, so there is
   * no ink/reach contract to re-derive — just the aspect ratio the sizing
   * formula depends on. */
  for (const [id, plate] of Object.entries(BD.plates)) {
    const file = join(BACKDROP_DIR, plate.file);
    let size = null;
    try { size = readPngSize(file); } catch (err) {
      ok(false, 'T-051: ' + plate.file + ' could not be read (' + err.message + ')');
      continue;
    }
    ok(size.width === plate.canvas[0] && size.height === plate.canvas[1],
       'T-051: ' + plate.file + ' recorded canvas ' + plate.canvas.join('x') +
       ' is the size in the file (' + size.width + 'x' + size.height + ') — a ' +
       'regenerated plate whose canvas moved must update this table, not the other ' +
       'way around (T-053 owns assets/generated/**)');
    ok(plate.canvas[0] > 0 && plate.canvas[1] > 0, 'T-051: ' + id + ' has a positive canvas');
  }

  /* --- 3. the play-band clearance fence ----------------------------------
   * A backdrop piece must render entirely above CONFIG.limb.playBand.y1 at
   * every view scale. `near` (mult 1) is the binding case — checked here,
   * not assumed — because the required floor is LARGEST there and only
   * falls as the multiplier grows. */
  const mults = Object.values(CONFIG.viewScales).map((v) => v.depthMult);
  for (const [id, tier] of Object.entries(BD.tiers)) {
    const req = mults.map((m) => minYBottom(tier.depth, m, CONFIG));
    const reqNear = minYBottom(tier.depth, CONFIG.viewScales.near.depthMult, CONFIG);
    ok(req.every((r) => r <= reqNear + 1e-9),
       'T-051: tier ' + id + ' — ?view=near is genuinely the binding case ' +
       '(required floors: ' + req.map((r) => r.toFixed(2)).join(', ') + ')');
    ok(tier.yBottom >= reqNear,
       'T-051: tier ' + id + ' clears the play band at every view scale ' +
       '(yBottom ' + tier.yBottom + ' >= required ' + reqNear.toFixed(3) + ')');
    ok(tier.yBottom - reqNear < 2,
       'T-051: tier ' + id + '\'s clearance margin (' + (tier.yBottom - reqNear).toFixed(3) +
       ' tiles) is a deliberate small margin, not an accidental huge one that would ' +
       'suggest the fence was never binding');
  }

  /* --- 4. the fog ladder: graded, not flat, not fully clamped ------------
   * Checked under BOTH shipped fog configs (G1's tighter limb.fog and the
   * plain CONFIG.fog a non-G1 six-face run carries), at the FAR view the
   * sizing itself is authored against — the same "view-space depth" shift
   * src/render/camera.js applies (fogShift = cameraDepth - camera.z). */
  const farMult = CONFIG.viewScales.far.depthMult;
  for (const [bandName, band] of [['limb.fog (G1)', CONFIG.limb.fog], ['fog (plain)', CONFIG.fog]]) {
    const fracs = ['near', 'mid', 'far'].map((t) =>
      fogFraction(BD.tiers[t].depth, farMult, band.near, band.far, CONFIG));
    ok(fracs.every((f) => f > 0 && f < 1),
       'T-051: every tier carries PARTIAL haze under ' + bandName + ' (' +
       fracs.map((f) => f.toFixed(3)).join(', ') + ') — none is fully clear and none is ' +
       'fully clamped to background');
    ok(fracs[0] < fracs[1] && fracs[1] < fracs[2],
       'T-051: near < mid < far haze under ' + bandName + ' (' +
       fracs.map((f) => f.toFixed(3)).join(', ') + ') — the graded-distance claim');
  }

  /* --- 5. the FAR-view sizing formula: positive, aspect-preserving ------- */
  for (const pl of BD.placements) {
    const tier = BD.tiers[pl.tier];
    const plate = BD.plates[pl.plate];
    const { w, h, cy, dist } = plateSize(tier, plate, CONFIG);
    const tag = 'T-051: ' + pl.face + '/' + pl.plate + '/' + pl.tier + ': ';
    ok(w > 0 && h > 0 && Number.isFinite(w) && Number.isFinite(h), tag + 'positive finite size');
    near(w / h, plate.canvas[0] / plate.canvas[1], 1e-9,
         tag + 'the quad preserves the PNG\'s own aspect ratio (never stretched)');
    near(cy, tier.yBottom + h / 2 + (plate.yLift || 0), 1e-9,
         tag + 'center y is derived from yBottom + half height + authored landmark lift');
    near(dist, viewDist(tier.depth, farMult, CONFIG), 1e-9, tag + 'view-space distance matches viewDist()');
  }

  /* --- 6. facet placement: comfortably clear of every corner's halt ----- *
   * faceMidS sits 32.5 tiles from either of a facet's own bends (faceTiles
   * is 65); the corner ritual only ever halts within haltOffset (14) tiles
   * of a corner. Cheap arithmetic, checked rather than eyeballed. */
  for (let face = 1; face <= CONFIG.path.faces; face++) {
    const s = faceMidS(face, CONFIG);
    const faceStart = CONFIG.path.introTiles + CONFIG.path.faceTiles * (face - 1);
    const faceEnd = faceStart + CONFIG.path.faceTiles;
    ok(s > faceStart && s < faceEnd,
       'T-051: face ' + face + '\'s midpoint s=' + s + ' sits inside its own facet ' +
       '[' + faceStart + ', ' + faceEnd + ')');
    const halt = HALT_S[Math.min(face, CORNER_S.length) - 1];
    if (halt !== undefined) {
      ok(s < halt - 5, 'T-051: face ' + face + '\'s midpoint (s=' + s + ') sits well clear ' +
         'of its own corner\'s wave-gate halt (s=' + halt + ')');
    }
  }

  /* --- 7. resolveBackdropOn: the flag + transform-slice exclusion -------- */
  ok(resolveBackdropOn(null, false) && resolveBackdropOn('', false) && resolveBackdropOn('1', false),
     'T-051: backdrop is ON by default (decisions.md entry 16 retired blanket ' +
     'off-by-default flags for approved work)');
  ok(!resolveBackdropOn('flat', false),
     'T-051: ?backdrop=flat is the escape hatch back to the flat/box-only background');
  ok(!resolveBackdropOn(null, true) && !resolveBackdropOn('flat', true),
     'T-051: the transformation slice never builds these quads (its camera does not ' +
     'ride the six-face SEGS polyline this module places them on)');

  /* --- 8. the loader contract (same shape as T-049's own gate) ---------- */
  const backdropSrc = stripComments(readFileSync(join(srcDir, 'render', 'backdrop.js'), 'utf8'));
  const preloadSrc = stripComments(readFileSync(join(srcDir, 'render', 'preload.js'), 'utf8'));
  const mainSrc = stripComments(readFileSync(join(srcDir, 'main.js'), 'utf8'));
  const deployVerifierSrc = stripComments(readFileSync(
    join(here, '..', 'tools', 'deploy', 'verify-bundle.mjs'), 'utf8',
  ));
  const assetManifest = JSON.parse(readFileSync(join(here, '..', 'assets', 'manifest.json'), 'utf8'));

  ok(!/new THREE\.TextureLoader/.test(backdropSrc),
     'T-051: src/render/backdrop.js constructs no loader of its own — T-049\'s own gate ' +
     'already asserts src/render/preload.js is the ONLY one in src/render/ + src/ui/, ' +
     'this just names the file the claim is about');
  ok(/preloadTexture\(/.test(backdropSrc) && /awaitPreloads\(\)/.test(backdropSrc),
     'T-051: src/render/backdrop.js routes every texture through the shared gate ' +
     '(preloadTexture) and awaits it (awaitPreloads)');
  ok(/^\s*await awaitPreloads\(\);/m.test(backdropSrc),
     'T-051: the await sits at module scope (not inside a function nobody calls) — that ' +
     'top-level await is what holds src/main.js, and with it the sim\'s first frame, ' +
     'until the backdrop\'s own textures are resident or abandoned');
  ok(/catch \(error\)/.test(backdropSrc) && /entry\.state === ['"]ready['"]/.test(backdropSrc) &&
     /that depth band stays empty; play continues/.test(backdropSrc),
     'T-051: each direct source records its own ready/failed state and the fixed-pool ' +
     'build remains behind a top-level catch — one missing band never costs the game');
  ok(!/api\.show\(|__HB_FAILSAFE\.show|\.show\(['"]crash/.test(backdropSrc),
     'T-051: a missing or broken plate NOTES the failure and never raises the T-032 ' +
     'panel — a failed asset is not a dead game');
  const anatomyAsset = assetManifest.assets.find((a) => a.id === 'backdrop-meridian-anatomy-v1');
  ok(anatomyAsset?.path === 'assets/generated/backdrops/backdrop-meridian-anatomy-v1.png' &&
     anatomyAsset?.gpu === true,
     'T-051: the connected anatomy source is a declared GPU bundle asset — it cannot ' +
     'disappear from a git-archive deploy while a fallback masks the missing far body');
  ok(/registerSource\(farBody, MERIDIAN_DEPTH_SOURCES\.far, \{ anisotropy: 6 \}\)/
       .test(backdropSrc) &&
     !/cpuOnly:\s*true|CanvasTexture|createElement\(['"]canvas['"]\)/.test(backdropSrc) &&
     /ready\.filter\(\(e\) => !e\.cpuOnly\)/.test(preloadSrc),
     'T-051: the anatomy painting joins the ordinary GPU warm-up once and is never ' +
     'fed through a runtime canvas, cover crop or derived texture');
  ok(/anatomyBody/.test(deployVerifierSrc) &&
     /atmosphere\?\.anatomy/.test(deployVerifierSrc) &&
     /directMapped\s*===\s*true/.test(deployVerifierSrc) &&
     /runtimeCrop\s*===\s*false/.test(deployVerifierSrc),
     'T-051: the clean-bundle verifier requires anatomy source residency and the ' +
     'direct curved-shell map, rather than accepting a flat fallback as final art');
  ok(/legacyPlateMeshes\s*===\s*0/.test(deployVerifierSrc) &&
     /p\.state\s*===\s*['"]retired['"]/.test(deployVerifierSrc) &&
     /p\.replacement\s*===\s*['"]facet-anatomy-volume['"]/.test(deployVerifierSrc),
     'T-051: the clean-bundle verifier requires every dated illustrated plate to be ' +
     'retired into the facet depth volume instead of loading its route-like silhouettes');

  // src/main.js reaches backdrop.js directly (not counting on some other
  // module to drag it in as a side effect)
  ok(/^import ['"]\.\/render\/backdrop\.js['"];?\s*$/m.test(mainSrc),
     'T-051: src/main.js imports src/render/backdrop.js directly');
  // THE ACTUALLY LOAD-BEARING CONSTRAINT — proved behaviourally, not assumed:
  // an earlier version of this task had src/render/scene.js import backdrop.js
  // instead. Static import, awaited dynamic import, and deferred dynamic
  // import were each tried against the real served worktree; all three either
  // deadlocked the boot (confirmed independently with a minimal Node ESM
  // repro — Node prints "Detected unsettled top-level await" for the exact
  // shape) or left `scene`/`renderer` permanently stuck in their temporal
  // dead zone, so backdrop.js could never actually call `scene.add()` —
  // src/main.js's OWN import order was tried too (backdrop.js textually
  // before its scene.js import) and, unlike the scene.js case, that did NOT
  // break anything, because backdrop.js still names scene.js in its own
  // import list either way — so the one fact worth asserting here is that
  // scene.js itself never re-introduces the edge that does break:
  ok(!/import ['"]\.\/backdrop\.js['"]/.test(stripComments(readFileSync(join(srcDir, 'render', 'scene.js'), 'utf8'))),
     'T-051: src/render/scene.js does not import backdrop.js itself (that edge is the ' +
     'one proved, behaviourally, to deadlock the boot or permanently TDZ scene/renderer)');

  /* --- 9. sim/pure may not name this feature (T-049's own belt-and- ------
   * suspenders class, scoped to backdrop's own strings) ------------------- */
  const BANNED = [
    [/assets\/generated\/backdrops/, 'a backdrop asset path'],
    [/backdrop-table\.js|render\/backdrop\.js/, 'a backdrop module'],
    [/\bBACKDROP_TUNE\b/, 'the backdrop tuning table'],
  ];
  for (const file of [...layerFiles('sim'), ...layerFiles('pure')]) {
    const code = stripComments(readFileSync(file, 'utf8'));
    for (const [re, what] of BANNED) {
      ok(!re.test(code),
         'T-051: ' + file.split('/').slice(-2).join('/') + ' names ' + what + ' — the sim/pure ' +
         'layers must not be able to tell whether the backdrop loaded');
    }
  }
}

}
