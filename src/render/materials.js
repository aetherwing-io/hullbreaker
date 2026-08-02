/* =========================== MATERIALS ============================ */
/* Surface families, and the one thing that makes them mean anything.

   THE MEASUREMENT THIS ANSWERS (docs/decisions.md entry 18): every material
   in the game was `MeshStandardMaterial { color, flatShading }` — `roughness`
   and `metalness` were never set anywhere in `src/`, so every surface sat at
   the class defaults (roughness 1, metalness 0: a perfectly matte dielectric)
   and had nothing with which to respond to light. Value alone had to carry
   metal, carapace and deck, and it cannot.

   WHY A FAMILY TABLE INSTEAD OF NUMBERS AT THE CALL SITE. The same two
   numbers have to mean the same surface everywhere or the world stops being
   one material world, and four render lanes are authoring at once. A call
   site names a FAMILY; the numbers live here, once.

   METALNESS NEEDS SOMETHING TO REFLECT — and this is the trap this file
   exists to avoid. A metal has no diffuse response at all: under a light rig
   with no environment, `metalness: 0.8` does not read as steel, it reads as
   BLACK, with one specular glint where the key happens to line up. Entry 14
   is explicit that the frame must not get darker in the name of drama. So a
   tiny procedural environment ships with the families: a vertical gradient
   between the palette's own sky, air and ground tokens, prefiltered through
   PMREM. It is generated, never fetched, costs one small texture, and if it
   fails to build the families degrade to envMap-free — dimmer specular, not a
   broken frame.

   AUTHORED AT FAR. RIG is ~30px and a wasp ~17px at the frozen default view
   (entry 7/17). Micro-surface detail is invisible there; what survives is
   whether a face catches the key differently from the face next to it. The
   values below are therefore deliberately broad — a roughness step you can
   see at 20px, not a PBR calibration.                                     */

import * as THREE from 'three';
import { SURFACE } from '../pure/post.js';
import { PAL } from './palette.js';
import { renderer } from './scene.js';
import { CONFIG } from '../config.js';
import { QUERY } from '../mode.js';
import { preloadTexture, awaitPreloads } from './preload.js';
import { hullTexRepeat, resolveHullTexOn } from './hulltiles.js';

// The family table itself is data, so it lives in src/pure/post.js where
// tools/pathcheck.mjs can read it — and where the guard that every family a
// mesh names actually exists can be a real cross-check rather than a grep.
export { SURFACE };

/* ------------------------- procedural environment ------------------------ */

const ENV_W = 32, ENV_H = 16;            // an equirect gradient needs no more
let env;                                  // undefined = not built yet, null = failed

/* Three stops from the palette itself, so the environment can never disagree
   with the light rig or the sky: the hemisphere's own sky color overhead, the
   atmosphere token at the horizon (the same one scene.js paints the sky and
   fog with), and the hemisphere's ground color below. THREE.Color holds
   LINEAR values once it has parsed a token, which is exactly what an
   environment sample must be, so nothing here converts anything. */
function buildEnv() {
  const sky = new THREE.Color(PAL.hemiSky);
  const air = new THREE.Color(PAL.bg);
  const ground = new THREE.Color(PAL.hemiGround);
  const data = new Float32Array(ENV_W * ENV_H * 4);
  const c = new THREE.Color();
  for (let y = 0; y < ENV_H; y++) {
    const v = y / (ENV_H - 1);           // 0 = top of the sphere, 1 = bottom
    if (v < 0.5) c.copy(sky).lerp(air, v * 2);
    else c.copy(air).lerp(ground, (v - 0.5) * 2);
    for (let x = 0; x < ENV_W; x++) {
      const i = (y * ENV_W + x) * 4;
      data[i] = c.r; data[i + 1] = c.g; data[i + 2] = c.b; data[i + 3] = 1;
    }
  }
  const tex = new THREE.DataTexture(data, ENV_W, ENV_H, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.needsUpdate = true;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromEquirectangular(tex);
  pmrem.dispose();
  tex.dispose();                          // the prefiltered target is what is kept
  return target.texture;
}

/* Built on first use rather than at module load: it costs a render, and the
   first frame of the game is worth more than a prefiltered gradient. A
   failure here is survivable by construction — every consumer treats a null
   environment as "no envMap", which is the look this file replaced. */
export function surfaceEnv() {
  if (env === undefined) {
    try {
      env = buildEnv();
    } catch {
      env = null;
    }
  }
  return env;
}

/* -------------------------------- apply --------------------------------- */

/* Give a material a family. Returns the material, so it composes onto a
   constructor call. An unknown family is a no-op rather than a throw: a
   material that lost its surface still draws, and the gate names the typo. */
export function applySurface(material, family) {
  const s = SURFACE[family];
  if (!s || !material) return material;
  material.roughness = s.roughness;
  material.metalness = s.metalness;
  const e = surfaceEnv();
  if (e) {
    material.envMap = e;
    material.envMapIntensity = s.envMapIntensity;
  }
  material.needsUpdate = true;
  return material;
}

/* FOR THE HULL LANES (T-035 value ladder, T-047 light rig): `deck`, `plate`,
   `machine` and `distant` above are authored for src/render/level.js,
   limb.js and transform.js and are deliberately NOT applied from here —
   those files belong to other lanes this cycle and a drive-by edit buys a
   merge conflict worth more than the change. Adopting one is one call:

       applySurface(new THREE.MeshStandardMaterial({ color: PAL.ground,
                                                     flatShading: true }), 'deck');

   The environment is shared and built once, so the second adopter pays
   nothing for it. If the light rig lane wants it scene-wide instead, the
   same texture is what `scene.environment` wants — that assignment belongs
   in scene.js, which is theirs, not here.                                 */

/* ========================= HULL SURFACE TILES (T-052) ===================== *
 * THE MEASUREMENT THIS ANSWERS: 30 materials in this tree, zero of them
 * carrying an image map (the only `map:` anywhere in src/render/ before this
 * was capsules.js's letter canvas). Four finished tiles sit in
 * assets/generated/textures/ (hull-panel-tile, weld-seam-strip,
 * vent-louver-plate, wear-scuff-overlay) and nothing in src/ referenced any
 * of them. This section binds them to the limb's own material buckets
 * (src/render/limb.js's `MATERIAL_FOR`), which is the only large hull
 * surface this lane's fence reaches — src/render/level.js and transform.js
 * are other lanes' concurrent work this cycle, exactly like the `deck`/
 * `plate`/`machine`/`distant` families above were left for them to adopt.
 *
 * WHY A KEY TABLE, NOT A CALL AT EVERY MATERIAL SITE: limb.js already keys
 * its eight InstancedMesh buckets by name (`hull`, `wall`, `scute`, …); this
 * file only has to answer "what does bucket X wear", so `applyHullTexture`
 * takes that same key and limb.js does not need to know a texture exists.
 *
 * WHICH BUCKETS GET A MAP, AND WHICH DON'T, ON PURPOSE:
 *   - `hull`, `wall`, `scute` are genuinely large armour surfaces (the
 *     under-deck mass, the body behind the plane, the overlapping skin) —
 *     these get an albedo + a free bump (the same map reused as a height
 *     field: panel lines and rivets read as relief for zero extra texture).
 *   - `shadow` (hullRib/wallSeam/wallCap/…) is the deck-edge seam trim,
 *     which is exactly what weld-seam-strip.png was authored for.
 *   - `rib`, `machine`, `skyline`, `scuteAlt` stay flat (family-only, no
 *     map): `rib`/`machine` are thin fixtures and joint highlights a tiled
 *     panel would smear across; `scuteAlt` is a 0.7-tile rib, too narrow for
 *     a legible copy; `skyline` is the silhouette tier, and CONFIG's own
 *     comment says distant anatomy must stay "silhouettes, never readable
 *     surfaces" — texturing it would fight that reading directly.
 *
 * REINFORCING THE DEPTH SPLIT, NOT FLATTENING IT (limb.js:65-78's "warm
 * near, cool far" note): `hull` and `scute` are the nearest large surfaces
 * (RIG stands directly beside them) and get the full treatment — sharp map,
 * bump, and the wear-scuff-overlay baked in as a second, DECORRELATED tiling
 * pass so the repeat never lines up with the base grid (see `buildWorn`).
 * `wall` sits a further tier back (CONFIG.limb.wall.depth = -6 versus hull's
 * -1.1) and gets the bare albedo at a third of the bump strength and no wear
 * pass at all — less relief is less contrast under the same key light, which
 * is the material-response half of atmospheric perspective, same as the
 * existing color split. `shadow` is thin trim close to the deck and gets a
 * middling bump; nothing here fights the fog, which already grades every
 * one of these the further back a piece's `depth` sits (limbFogFactor).
 *
 * DEGRADE-SAFE BY THE SAME CONTRACT AS EVERY OTHER RUNTIME ASSET (entry 16):
 * every texture goes through the SHARED preload gate (preload.js) — resident
 * before the sim's first frame, or abandoned. `applyHullTexture` is a no-op
 * for any key whose texture never arrived, exactly like `applySurface` is a
 * no-op for an unknown family; the material is left exactly as flat as it
 * was before this section existed. Nothing here is reachable from src/sim/
 * or src/pure/, and no gameplay value ever depends on whether a tile loaded.
 *
 * ?tex=flat is the A/B and the escape hatch for the ALBEDO PASS: it skips
 * every registration below (so the boot budget is not spent on textures
 * nobody asked to see) and every bucket's `map`/`bumpMap` fall back to
 * nothing, exactly as they were before this section existed. CORRECTION,
 * post-review: an earlier version of this comment claimed the flag reverts
 * a bucket to the pre-T-052 material "byte-for-byte" — that overclaimed.
 * `applySurface` (roughness/metalness/envMap, entry 18) still runs either
 * way, because it is limb.js's adoption of the shared SURFACE table this
 * file already offered every other hull lane, not part of what T-052 added;
 * gating it behind ?tex= would make the flag a family switch nobody asked
 * for. Measured (this file's own re-check, controlling for the family
 * alone with the map off both times): the family assignment's OWN luminance
 * effect on the lower-hull band is not measurable (40.1 either way) — the
 * entire darkening this section's next note describes comes from the map.
 *
 * COMPOSITING THE WEAR OVERLAY, AND WHY: wear-scuff-overlay.png is ~78%
 * fully transparent with RGB=0 in the empty area (measured — the file is
 * mostly (0,0,0,0)). Wiring that straight in as a `roughnessMap` (which
 * samples the green channel and ignores alpha entirely) would drive
 * roughness toward 0 — mirror-smooth — over 96% of every surface it touched,
 * which is backwards from "wear" and is exactly the kind of over-dramatic
 * result entry 14 already ruled out. So it is composited with its OWN alpha,
 * the way it was authored, onto a small offscreen canvas built from the
 * already-decoded source images (`buildWorn`), at a tile size that does not
 * evenly divide the base tile's — a flipped-cell grid on top of that breaks
 * the wear layer's own repeat too, so neither pattern's seam lines up with
 * the other's or with itself.
 *
 * THE COMPOSITE'S OWN RESIDENCY: a CanvasTexture built after `awaitPreloads`
 * resolves is a brand-new GPU resource that nothing has uploaded yet — the
 * exact defect the shared gate exists to prevent, just self-inflicted. So
 * `warmTexture` below repeats preload.js's own trick (a bounded offscreen
 * draw + blocking pixel read) on every texture this file derives, before
 * the module finishes evaluating and anything downstream can run a frame.  */

export const HULL_TEX_ON = resolveHullTexOn(QUERY.get('tex'));

const TEX_DIR = new URL('../../assets/generated/textures/', import.meta.url).href;

// file (+ a cache-bust suffix for a second, independently-configured copy of
// the same bytes — repeat/wrap live on the TEXTURE, not the material, and
// `wall` needs a different repeat than `hull` from the identical PNG) -> the
// resident slot. `ready` false covers 'pending' (never — awaitPreloads always
// settles first), 'failed', 'timeout' and 'refused' alike: every one of them
// means "this bucket stays flat", which is all any caller here needs to know.
const rawTex = new Map();

function registerRaw(file, url) {
  const slot = { tex: null, ready: false };
  rawTex.set(file, slot);
  if (!HULL_TEX_ON) return slot;
  preloadTexture(url, { anisotropy: 8 }).then((entry) => {
    if (entry.state === 'ready') { slot.tex = entry.tex; slot.ready = true; }
    else console.warn('HULLBREAKER art: hull texture ' + file + ' did not load (' +
      (entry.error || entry.state) + ') — the flat material stays.');
  });
  return slot;
}

registerRaw('hull-panel-tile.png', TEX_DIR + 'hull-panel-tile.png');
registerRaw('hull-panel-tile.png?wall', TEX_DIR + 'hull-panel-tile.png?wall');
registerRaw('vent-louver-plate.png', TEX_DIR + 'vent-louver-plate.png');
registerRaw('weld-seam-strip.png', TEX_DIR + 'weld-seam-strip.png');
registerRaw('wear-scuff-overlay.png', TEX_DIR + 'wear-scuff-overlay.png');

/* THE BOOT GATE. Same shared settlement T-049's sprite loader and this
   module's own procedural environment share nothing with — this is a
   SEPARATE concern (textures, not envMap) but the SAME gate: any number of
   modules may register and await it (preload.js's own contract), so this
   costs the boot nothing beyond what T-049's lane already spends waiting. */
await awaitPreloads();

/* ---------------- luminance normalization (post-review finding) ---------- *
 * MEASURED (the integrator's capture + this file's own re-check): binding a
 * tile straight in as `map` on a material whose own `color` is white
 * (0xffffff, so the INSTANCE color — the actual palette token — is the only
 * thing that used to set brightness) makes the texture's own absolute mean
 * value the surface's new brightness ceiling. hull-panel-tile.png's own mean
 * is ~78.5/255 (~31%), so binding it cut the lower-hull band from a measured
 * 40.1 to 19.3 — a 52% drop, independently reproduced here and matching the
 * ~56% the integrator measured at a different capture point. A control with
 * `applySurface` on and the map off showed no comparable drop (40.1 both
 * ways), so the ALBEDO MAP is the whole effect, not the roughness/metalness
 * family assignment next to it.
 *
 * The fix keeps the palette token owning VALUE and the tile owning DETAIL
 * (the integrator's option 1): every base tile is normalized so its OWN mean
 * luminance renders near-neutral (TARGET_MEAN) before it is drawn into the
 * composited/repeated canvas, via the same 2D-context `filter` a browser
 * already implements for free. A brighter or darker source (T-053 is
 * regenerating these) is renormalized the same way with no per-bucket
 * number to retune — the scale is computed from whatever image actually
 * loaded, not typed once and left to drift out of step with the asset. */

const TARGET_MEAN = 235;                  // measured target, not full 255 — see below
const NORMALIZE_SAMPLE_PX = 24;           // enough to average a tile's own mean;
                                           //   this is a scale factor, not a look

/* SECOND MEASURED FINDING, same review cycle: `wall` and `shadow` are cool
   teal palette tokens (PAL.limb.wall 0x44656b, PAL.limb.shadow 0x35504f —
   B the dominant channel in both), but hull-panel-tile.png is a warm rust
   texture (R dominant, B near zero). Binding it as a COLORED multiply onto
   those buckets crushes their blue channel harder than red/green, and the
   surface visibly shifts hue from teal toward green — reproduced in a live
   capture (reports/tasks/T-052/evidence/), invisible at first because the
   pre-normalization darkening (see below) buried it near-black. Grayscale
   the tile before the brightness pass fixes this everywhere at once: a
   texture bound this way can only ever modulate VALUE, never HUE, so the
   instance color (the actual palette token) owns hue on every bucket, warm
   or cool, exactly as the rest of this codebase's material model assumes. */
function tileFilter(brightnessPct) {
  return 'grayscale(100%) brightness(' + brightnessPct + '%)';
}

// CSS `filter: brightness(S%)` multiplies each 8-bit channel by S and CLIPS
// at 255 — it does not redistribute the clipped headroom back into the
// mean. MEASURED: hull-panel-tile.png's raw mean is 78.4/255; a naive
// `scale = TARGET/rawMean` (≈325%) only pushed the actual full-canvas mean
// to 201.7, not 255 — a 24-color, high-contrast tile clips its brighter
// pixels before a linear scale can bring the average that far. So the scale
// is found by measuring what a trial actually achieves and correcting
// toward the target — same 24x24 sample canvas reused each pass, three
// passes converge inside 2% for both this tile and T-053's regenerated one
// (458 colors, much lower contrast, converges in one pass).
function meanLuminance(img, brightnessPct) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = NORMALIZE_SAMPLE_PX;
  const g = cv.getContext('2d');
  g.filter = tileFilter(brightnessPct || 100);
  g.drawImage(img, 0, 0, NORMALIZE_SAMPLE_PX, NORMALIZE_SAMPLE_PX);
  const data = g.getImageData(0, 0, NORMALIZE_SAMPLE_PX, NORMALIZE_SAMPLE_PX).data;
  let sum = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    n++;
  }
  return n ? sum / n : TARGET_MEAN;
}

// clamped so a pathologically dark source never gets an absurd multiply —
// 8x is already far past what either tile in hand needs (hull-panel-tile.png
// converges around 4.7x, T-053's regenerated one around 2.6x).
function normalizeScale(img) {
  const raw = meanLuminance(img);
  let scale = Math.max(1, Math.min(8, TARGET_MEAN / Math.max(1, raw)));
  for (let i = 0; i < 3; i++) {
    const achieved = meanLuminance(img, Math.round(scale * 100));
    if (achieved <= 0) break;
    const ratio = TARGET_MEAN / achieved;
    if (Math.abs(ratio - 1) < 0.02) break;
    scale = Math.max(1, Math.min(8, scale * ratio));
  }
  return scale;
}

/* ------------------------- the wear composite ---------------------------- *
 * One small canvas per near surface: the base tile, brightness-normalized
 * and drawn as a flat repeat, then the wear overlay (never renormalized —
 * it is authored grime, not a base albedo) drawn on top at a DIFFERENT cell
 * size with alternate cells mirrored — two independent ways the eye that
 * spots one repeating texture (tools/assets/tile.mjs's whole reason to
 * exist) is denied both. */

function drawTiled(g, img, cellPx, canvasPx, flip) {
  let row = 0;
  for (let y = 0; y < canvasPx; y += cellPx, row++) {
    let col = row;
    for (let x = 0; x < canvasPx; x += cellPx, col++) {
      g.save();
      g.translate(x + cellPx / 2, y + cellPx / 2);
      if (flip) g.scale(col % 2 ? -1 : 1, row % 2 ? -1 : 1);
      g.drawImage(img, -cellPx / 2, -cellPx / 2, cellPx, cellPx);
      g.restore();
    }
  }
}

// THIRD MEASURED FINDING, same review cycle: with the base tile normalized,
// re-measuring showed the lower-hull band still 33% darker than `?tex=flat`
// — removing the wear pass entirely (a one-line A/B, `wear -> null`) dropped
// that to 8%, so the WEAR OVERLAY, not the base tile, was carrying most of
// the remaining gap. wear-scuff-overlay.png's opaque texels are their own
// authored dark grime (measured mean ~62/255) blended in at full alpha, not
// multiplied — so the base tile's normalization never touched it. It still
// needs to read as grime (darker than its surroundings), just not so dark
// it anchors the whole surface's average down again; a flat, un-tuned
// brightness lift (not the iterative solve `normalizeScale` runs for an
// albedo base, since this is a small, sparse accent, not the surface's own
// value) is enough to keep it a visible accent rather than a second cause
// of the same defect.
const WEAR_BRIGHTEN_PCT = 340;

function buildWorn(base, wear, canvasPx, baseCellPx, wearCellPx) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = canvasPx;
  const g = cv.getContext('2d');
  const scale = normalizeScale(base.tex.image);
  g.filter = tileFilter(Math.round(scale * 100));
  drawTiled(g, base.tex.image, baseCellPx, canvasPx, false);
  if (wear && wear.ready) {
    g.filter = 'grayscale(100%) brightness(' + WEAR_BRIGHTEN_PCT + '%)';
    drawTiled(g, wear.tex.image, wearCellPx, canvasPx, true);
  }
  g.filter = 'none';
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  warmTexture(tex);
  return tex;
}

// wall/shadow have no wear pass, but they need the SAME brightness
// normalization — so they now go through a canvas too instead of binding
// the raw loaded texture directly (the raw texture never had a chance to be
// darkened OR normalized before this; it was simply used as-is).
function buildFlatTile(base, canvasPx, baseCellPx) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = canvasPx;
  const g = cv.getContext('2d');
  const scale = normalizeScale(base.tex.image);
  g.filter = tileFilter(Math.round(scale * 100));
  drawTiled(g, base.tex.image, baseCellPx, canvasPx, false);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  warmTexture(tex);
  return tex;
}

// preload.js's warm-up trick, repeated for a texture THIS file derives after
// the shared gate has already closed — see the header note above for why a
// CanvasTexture built here needs the exact same treatment.
const WARM_PX = 4;
function warmTexture(tex) {
  if (!tex) return;
  if (typeof renderer.initTexture === 'function') renderer.initTexture(tex);
  let rt = null, geo = null, mat = null;
  try {
    rt = new THREE.WebGLRenderTarget(WARM_PX, WARM_PX);
    const warmScene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
    cam.position.z = 1;
    geo = new THREE.PlaneGeometry(2, 2);
    mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
    warmScene.add(new THREE.Mesh(geo, mat));
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.render(warmScene, cam);
    const px = new Uint8Array(4);
    renderer.readRenderTargetPixels(rt, 0, 0, 1, 1, px);
    renderer.setRenderTarget(prev);
  } catch (err) {
    console.warn('HULLBREAKER art: a hull texture warm-up was skipped — ' +
      ((err && err.message) || err) + '; the art is loaded either way.');
  } finally {
    if (mat) mat.dispose();
    if (geo) geo.dispose();
    if (rt) rt.dispose();
  }
}

/* key -> { map, bumpScale, repeat: [x, y] }. `repeat` comes from
   hulltiles.js's hullTexRepeat(CONFIG) — piece size / each tile's own
   authored world-tile size, computed against the DOMINANT kind in that
   bucket (see that file's header). A bucket's smaller co-tenants (bdLimb
   inside `hull`, bdDrum inside `wall`, bdRing inside `scute`) share the same
   per-unit density and so show a proportionally different tile count on
   their own, smaller faces — a known, reported approximation (see
   build.md); true per-instance density needs a per-instance UV scale this
   pass does not add. */
const HULL_TEX = {};

function finishHullTex() {
  const hullBase = rawTex.get('hull-panel-tile.png');
  const wallBase = rawTex.get('hull-panel-tile.png?wall');
  const scuteBase = rawTex.get('vent-louver-plate.png');
  const shadowBase = rawTex.get('weld-seam-strip.png');
  const wear = rawTex.get('wear-scuff-overlay.png');
  const repeat = hullTexRepeat(CONFIG);

  if (hullBase.ready) {
    HULL_TEX.hull = { map: buildWorn(hullBase, wear, 384, 128, 250), bumpScale: 0.07, repeat: repeat.hull };
  }
  if (wallBase.ready) {
    HULL_TEX.wall = { map: buildFlatTile(wallBase, 384, 128), bumpScale: 0.02, repeat: repeat.wall };
  }
  if (scuteBase.ready) {
    HULL_TEX.scute = { map: buildWorn(scuteBase, wear, 256, 128, 188), bumpScale: 0.07, repeat: repeat.scute };
  }
  if (shadowBase.ready) {
    HULL_TEX.shadow = { map: buildFlatTile(shadowBase, 128, 128), bumpScale: 0.04, repeat: repeat.shadow };
  }

  // Every raw loaded texture above was consumed SYNCHRONOUSLY into a canvas
  // (drawImage reads pixels immediately; nothing here is async) and none of
  // them is bound as a live material `.map` any more — buildWorn/buildFlatTile
  // always produce the CanvasTexture actually used. Left resident, they were
  // dead GPU memory: measured, +2 resident textures (34 vs 32) after wall and
  // shadow moved off the raw binding they used to have. Disposing here is
  // safe precisely because nothing after this point still reads `.tex`.
  for (const slot of [hullBase, wallBase, scuteBase, shadowBase, wear]) {
    if (slot.ready && slot.tex) slot.tex.dispose();
  }
}
finishHullTex();

/* Give a material the texture bound to a limb.js material key. A no-op for a
   key with no entry (see the list above) or one whose texture never arrived
   — the material is left exactly as `applySurface` alone would leave it. */
export function applyHullTexture(material, key) {
  const t = HULL_TEX[key];
  if (!t || !material) return material;
  t.map.wrapS = t.map.wrapT = THREE.RepeatWrapping;
  t.map.repeat.set(t.repeat[0], t.repeat[1]);
  material.map = t.map;
  material.bumpMap = t.map;
  material.bumpScale = t.bumpScale;
  material.needsUpdate = true;
  return material;
}

/* Read surface for the console and the headless gates: which bucket got a
   texture, and (indirectly, via `rawTex`) whether the underlying loads
   themselves succeeded — the two are kept separate because a bucket can be
   texture-less on purpose (`rib`, `machine`, `skyline`, `scuteAlt`) even when
   every file loaded cleanly. */
export function hullTextureSnapshot() {
  const files = {};
  for (const [file, slot] of rawTex) files[file] = slot.ready;
  return { on: HULL_TEX_ON, files, buckets: Object.keys(HULL_TEX) };
}
if (typeof window !== 'undefined') window.__HB_HULL_TEX = hullTextureSnapshot;
