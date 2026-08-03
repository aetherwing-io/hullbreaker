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
import {
  hullPieceDims, hullTexRepeat, resolveHullTexOn, composeHullTile, composeDeckPanel,
  DECK_PANEL, TILE_TONE, SCUTE_TILE_TONE,
} from './hulltiles.js';

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

// T-057 (I-049 shimmer investigation): this file used to pin anisotropy at 8
// regardless of what the device could do. The FAR camera views the hull at a
// grazing angle — exactly where anisotropic filtering earns its keep, by
// taking more samples along the view-aligned footprint instead of one blurry
// (or aliased) isotropic one — so under-asking the GPU here throws away
// filtering quality the hardware already has. `getMaxAnisotropy()` reads the
// actual device limit once at module scope (the same renderer already
// resident for the procedural environment above), so a lesser GPU still gets
// its own real max rather than failing to allocate; nothing here can ask for
// MORE than the device supports the way a raw constant risked drifting out
// of date with better hardware.
//
// HONESTY (build.md has the full measurement): this rides alone, NOT paired
// with a canvas-size change — T-057 measured four different composited-canvas
// resizings (power-of-two cellPx, raised copy count, both together, either
// alone) against the shipped `hulltiles.js` and every one made the shimmer
// metric equal or WORSE, never better, so none of them shipped;
// `hulltiles.js` is byte-identical to main. This anisotropy read is shipped
// on its own merits (strictly more correct than a hardcoded guess, measured
// to cause no regression on any metric this task ran) but did NOT measurably
// move I-049's shimmer number in this project's headless/software-rendered
// test harness — see build.md for why that result is inconclusive rather
// than a clean negative, and for the open recommendation to re-check on the
// operator's own hardware.
const HULL_MAX_ANISOTROPY = renderer.capabilities.getMaxAnisotropy();

function registerRaw(file, url) {
  const slot = { tex: null, ready: false };
  rawTex.set(file, slot);
  if (!HULL_TEX_ON) return slot;
  preloadTexture(url, { anisotropy: HULL_MAX_ANISOTROPY }).then((entry) => {
    if (entry.state === 'ready') { slot.tex = entry.tex; slot.ready = true; }
    else console.warn('HULLBREAKER art: hull texture ' + file + ' did not load (' +
      (entry.error || entry.state) + ') — the flat material stays.');
  });
  return slot;
}

// One large production panel source now serves route and limb. Bucket- and
// facet-specific Texture descriptors are derived after decode, so this is one
// network/preload request rather than query-string copies of identical bytes.
registerRaw('hull-panel-tile-v2.png', TEX_DIR + 'hull-panel-tile-v2.png');
registerRaw('weld-seam-strip.png', TEX_DIR + 'weld-seam-strip.png');

/* THE BOOT GATE. Same shared settlement T-049's sprite loader and this
   module's own procedural environment share nothing with — this is a
   SEPARATE concern (textures, not envMap) but the SAME gate: any number of
   modules may register and await it (preload.js's own contract), so this
   costs the boot nothing beyond what T-049's lane already spends waiting. */
await awaitPreloads();

/* ------- value and detail, after T-054's two measured defects ------------- *
 * THE DEFECT THIS SECTION NOW ANSWERS. T-052 closed a real 56% darkening
 * (binding a tile whose own mean is ~31% as `map` on a white-`color`
 * material makes that mean the surface's new brightness ceiling) by
 * multiplying every tile's brightness until its mean reached 235/255. That
 * removed the darkening and it also removed the reason to have a texture:
 * measured in play, at the same position, one URL apart —
 *
 *     ?tex=flat   lower-hull band  mean 43.05  sd 6.57  fine 0.417
 *     default     lower-hull band  mean 39.90  sd 5.80  fine 0.694
 *
 * — the textured build carried LESS structure at the scale the eye reads
 * (the 2-20px band: 3.02 against flat's 3.82) than the untextured one. The
 * operator saw it before any of this was measured: "the one floating in the
 * background seems to have more detail, while that in the foreground has
 * less."
 *
 * TWO CAUSES, BOTH ARITHMETIC, NEITHER ANYONE'S MISJUDGEMENT:
 *   1. FREQUENCY. The composited canvas holds 3x3 copies of the tile and was
 *      bound with a repeat computed for ONE — so an authored copy spanned
 *      0.67 world units, ~12 screen px, against the ~35px hull-panel-tile
 *      .png's own manifest note authors it for. A 128px panel design
 *      minified 11:1 has no panel lines left after the mip chain. Fixed in
 *      hulltiles.js's `hullTexRepeat`, which now divides by the copy count.
 *   2. RANGE. Pushing a tile's mean to 92% of full scale leaves 8% of the
 *      range to carry every panel line, and clips whatever sat above it into
 *      flat white. Fixed by hulltiles.js's `buildToneCurve`: the tile is
 *      solved to a target mean AND spread well below white, and the
 *      brightness that costs is paid back by `gain` — a SCALAR multiplied
 *      into the material's own color, so mean(map) * gain == 1 in linear
 *      light and the average surface brightness is exactly the flat build's.
 *      Normalizing the mean and compressing the range are not the same
 *      operation, and only the first one was ever wanted.
 *
 * WHY THE PIXEL WORK LIVES IN hulltiles.js AND NOT HERE: this file cannot be
 * imported by a headless gate (three.js + a live renderer at module scope),
 * so anything expressed here can only ever be checked as source text — and
 * both defects above sat under a green gate for a cycle for exactly that
 * reason. hulltiles.js is Node-safe, so tools/pathcheck runs the real
 * transform over the real PNG and asserts on the output pixels. What is left
 * here is the browser-only half: decode → hand the bytes over → upload.
 *
 * HUE PRESERVATION, the property T-052's reviewer proved by construction and
 * this may not lose: `applyToneCurve` writes R = G = B at every texel (the
 * same guarantee `grayscale(100%)` gave), and `gain` is a scalar applied to
 * all three channels of `material.color`. Neither multiply can shift the
 * palette token's hue — warm rust tile on the cool teal `wall`/`shadow`
 * tokens included. Asserted over the composited buffer in pathcheck.       */

// Decode an already-loaded texture's image into raw RGBA at its natural size.
// The one thing that genuinely needs a DOM here: everything downstream is
// plain arithmetic on these bytes.
function imageBytes(img) {
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth || img.width;
  cv.height = img.naturalHeight || img.height;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, cv.width, cv.height);
  return { data: d.data, width: cv.width, height: cv.height };
}

// Hand a Node-safe composition to the GPU. Hull and deck sources both pass
// through this exact upload/warm path, so adding the large route painting
// costs one preload and one resident canvas texture — never a first-use hitch.
function uploadComposed(composed) {
  if (!composed) return null;
  const cv = document.createElement('canvas');
  cv.width = composed.width;
  cv.height = composed.height;
  const g = cv.getContext('2d');
  const bytes = g.createImageData(composed.width, composed.height);
  bytes.data.set(composed.data);
  g.putImageData(bytes, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = HULL_MAX_ANISOTROPY;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  warmTexture(tex);
  return { tex, curve: composed.curve, layout: composed.layout };
}

// Compose one limb bucket's canvas (hulltiles.js does every pixel of it) and
// hand it to the GPU. Returns null when the base never arrived, which is the
// caller's cue to leave the material flat — entry 16's degrade contract.
function buildTile(key, base, wear, tone = TILE_TONE) {
  if (!base || !base.ready) return null;
  return uploadComposed(composeHullTile(CONFIG, key,
    imageBytes(base.tex.image),
    wear && wear.ready ? imageBytes(wear.tex.image) : null,
    tone));
}

function buildDeckPanel(base) {
  if (!base || !base.ready) return null;
  return uploadComposed(composeDeckPanel(CONFIG, imageBytes(base.tex.image)));
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

/* key -> { map, bumpScale, repeat: [x, y], gain }. `repeat` comes from
   hulltiles.js's hullTexRepeat(CONFIG) — piece size / the world span of the
   COMPOSITED CANVAS (T-054: the copy count inside it is what T-052's version
   of this arithmetic missed), computed against the DOMINANT kind in that
   bucket (see that file's header). A bucket's smaller co-tenants (bdLimb
   inside `hull`, bdDrum inside `wall`, bdRing inside `scute`) share the same
   per-unit density and so show a proportionally different tile count on
   their own, smaller faces — a known, reported approximation (see
   build.md); true per-instance density needs a per-instance UV scale this
   pass does not add. `gain` travels WITH the map, in the same record, so a
   bucket can never end up brightened by a texture that failed to load. */
const HULL_TEX = {};

// The v2 painting already has broad value structure. The legacy tone solve
// was designed to recover contrast from four nearly-flat placeholder lines;
// applying its 52-SD target to this source made every tendon channel a black
// stripe. Retain enough range to read the scutes, recover the old 12% trim,
// and leave the weld strip on its original sharp tune.
function finishHullTex() {
  const shadowBase = rawTex.get('weld-seam-strip.png');
  const repeat = hullTexRepeat(CONFIG);

  // bumpScale, per bucket: `hull`/`scute` are the near armour RIG stands
  // beside, `wall` is a tier back (less relief is less contrast under the
  // same key light — the material half of atmospheric perspective), `shadow`
  // is thin deck-edge trim. HALVED against T-052's numbers because the tone
  // curve above hands the bump map ~3x the luminance slope it used to see:
  // bump reads the map's own gradient, so restoring contrast in the albedo
  // silently multiplies the relief by the same factor.
  const bucket = (key, base, wearFor) => {
    const built = buildTile(key, base, wearFor,
      key === 'shadow' ? TILE_TONE : SCUTE_TILE_TONE);
    if (!built) return;
    HULL_TEX[key] = {
      map: built.tex,
      bumpScale: { hull: 0.015, wall: 0.004, scute: 0.02, shadow: 0.02 }[key],
      repeat: repeat[key],
      gain: built.curve.gain,
      curve: built.curve,
    };
  };
  // The broad buckets are installed from the production route painting below
  // after its one shared composition is ready. Keep these literal bucket
  // declarations as the degrade contract: a missing panel leaves them flat.
  bucket('hull', null, null);
  bucket('wall', null, null);
  bucket('scute', null, null);
  bucket('shadow', shadowBase, null);

  // Every raw loaded texture above was consumed SYNCHRONOUSLY into a canvas
  // (drawImage reads pixels immediately; nothing here is async) and none of
  // them is bound as a live material `.map` any more — buildTile always
  // produces the CanvasTexture actually used. Left resident, they were
  // dead GPU memory: measured, +2 resident textures (34 vs 32) after wall and
  // shadow moved off the raw binding they used to have. Disposing here is
  // safe precisely because nothing after this point still reads `.tex`.
  for (const slot of [shadowBase]) {
    if (slot && slot.ready && slot.tex) slot.tex.dispose();
  }
}
finishHullTex();

// One continuous route-space painting for level.js. The original 512px crop
// is used rather than the pre-kaleidoscoped mirror proof: MirroredRepeatWrapping
// makes the boundary exact on the GPU while level.js's facet UV transforms
// keep the strong centre motif from recurring in lockstep.
let DECK_PANEL_TEX = null;
function finishDeckPanelTex() {
  const base = rawTex.get('hull-panel-tile-v2.png');
  const built = buildDeckPanel(base);
  if (built) {
    built.tex.wrapS = built.tex.wrapT = THREE.MirroredRepeatWrapping;
    built.tex.repeat.set(1, 1);
    built.tex.offset.set(0, 0);
    built.tex.needsUpdate = true;
    DECK_PANEL_TEX = {
      map: built.tex,
      bumpScale: 0.012,
      gain: built.curve.gain,
      curve: built.curve,
      layout: built.layout,
    };
  }
  if (base && base.ready && base.tex) base.tex.dispose();
}
finishDeckPanelTex();

function installProductionLimbPanels() {
  if (!DECK_PANEL_TEX) return;
  const dims = hullPieceDims(CONFIG);
  const bumpScale = { hull: 0.008, wall: 0.003, scute: 0.012 };
  for (const key of ['hull', 'wall', 'scute']) {
    const map = DECK_PANEL_TEX.map.clone();
    map.wrapS = map.wrapT = THREE.MirroredRepeatWrapping;
    map.repeat.set(
      dims[key][0] / DECK_PANEL.worldSpan,
      dims[key][1] / DECK_PANEL.worldSpan,
    );
    map.center.set(0.5, 0.5);
    map.needsUpdate = true;
    warmTexture(map);
    HULL_TEX[key] = {
      map,
      bumpScale: bumpScale[key],
      repeat: [map.repeat.x, map.repeat.y],
      gain: DECK_PANEL_TEX.gain,
      curve: DECK_PANEL_TEX.curve,
      wrapping: 'mirrored-repeat',
    };
  }
}
installProductionLimbPanels();

/* Bind the painted route panel without deciding where it lands. level.js
   authors UVs in route space, so one source crosses dozens of collision
   tiles and platform faces without restarting. Palette hue remains in vertex
   colors because the uploaded map is grayscale by construction. */
export function applyDeckPanelTexture(material) {
  const t = DECK_PANEL_TEX;
  if (!t || !material) return material;
  material.map = t.map;
  material.bumpMap = t.map;
  material.bumpScale = t.bumpScale;
  material.color.setRGB(t.gain, t.gain, t.gain, THREE.LinearSRGBColorSpace);
  material.needsUpdate = true;
  return material;
}

export function deckPanelTextureSnapshot() {
  const t = DECK_PANEL_TEX;
  return {
    ready: !!t,
    sourceReady: !!rawTex.get('hull-panel-tile-v2.png')?.ready,
    wrapping: t ? 'mirrored-repeat' : 'flat-fallback',
    canvasPx: t ? t.layout.canvasPx : 0,
    worldSpan: t ? t.layout.worldSpan : 0,
    gain: t ? t.gain : 1,
    mean: t ? t.curve.mean : 0,
    sd: t ? t.curve.sd : 0,
    bumpScale: t ? t.bumpScale : 0,
  };
}
if (typeof window !== 'undefined') window.__HB_DECK_PANEL = deckPanelTextureSnapshot;

/* Give a material the texture bound to a limb.js material key. A no-op for a
   key with no entry (see the list above) or one whose texture never arrived
   — the material is left exactly as `applySurface` alone would leave it.
   `color` carries the tone curve's `gain` and is set in the SAME statement
   list as the map, from the same record: there is no path through this
   function that brightens a material without also giving it the map that
   gain compensates for. Written in the working (linear) color space, which
   is where the shader multiplies it, and equal on all three channels so the
   instance color — the palette token — keeps its hue exactly. */
export function applyHullTexture(material, key) {
  const t = HULL_TEX[key];
  if (!t || !material) return material;
  t.map.wrapS = t.map.wrapT = t.wrapping === 'mirrored-repeat'
    ? THREE.MirroredRepeatWrapping
    : THREE.RepeatWrapping;
  t.map.repeat.set(t.repeat[0], t.repeat[1]);
  material.map = t.map;
  material.bumpMap = t.map;
  material.bumpScale = t.bumpScale;
  material.color.setRGB(t.gain, t.gain, t.gain, THREE.LinearSRGBColorSpace);
  material.needsUpdate = true;
  return material;
}

// Instanced armour normally shares one UV origin, which made every enormous
// foreground scute repeat the exact same dark channel in lockstep. A second
// bucket may cheaply decorrelate that origin: clone only the tiny texture
// descriptor/image binding, retain the exact density/tone/bump calibration,
// and offset within its existing repeat. Variant zero remains byte-for-byte
// the original material path.
export function varyHullTexture(material, variant = 0) {
  if (!(variant > 0) || !material || !material.map) return material;
  const transforms = [
    [0, 0, 0],
    [0.37, 0.19, Math.PI / 2],
    [0.68, 0.47, Math.PI],
  ];
  const tr = transforms[variant % transforms.length];
  const tex = material.map.clone();
  tex.center.set(0.5, 0.5);
  tex.offset.set(tr[0], tr[1]);
  tex.rotation = tr[2];
  tex.needsUpdate = true;
  warmTexture(tex);
  material.map = tex;
  material.bumpMap = tex;
  material.needsUpdate = true;
  return material;
}

/* Read surface for the console and the headless gates: which bucket got a
   texture, and (indirectly, via `rawTex`) whether the underlying loads
   themselves succeeded — the two are kept separate because a bucket can be
   texture-less on purpose (`rib`, `machine`, `skyline`, `scuteAlt`) even when
   every file loaded cleanly. T-054 adds the per-bucket tone curve, so a live
   page can be asked what contrast and what gain it actually built — the
   capture rig (tools/playtest/hulltex-capture.mjs) asserts the gain/map
   pairing against this rather than against the source text of the function
   above. */
export function hullTextureSnapshot() {
  const files = {};
  for (const [file, slot] of rawTex) files[file] = slot.ready;
  const tone = {};
  for (const [key, t] of Object.entries(HULL_TEX))
    tone[key] = {
      gain: t.gain, hasMap: !!t.map, repeat: t.repeat, bumpScale: t.bumpScale,
      canvasPx: t.map && t.map.image ? t.map.image.width : 0,
      mean: t.curve.mean, sd: t.curve.sd, contrast: t.curve.contrast,
      linMean: t.curve.linMean, linRelSd: t.curve.linRelSd,
    };
  return { on: HULL_TEX_ON, files, buckets: Object.keys(HULL_TEX), tone };
}
if (typeof window !== 'undefined') window.__HB_HULL_TEX = hullTextureSnapshot;
