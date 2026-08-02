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
 * ?tex=flat is the A/B and the escape hatch: it skips every registration
 * below (so the boot budget is not spent on textures nobody asked to see)
 * and every bucket falls back to the pre-T-052 flat material, byte-for-byte.
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

/* ------------------------- the wear composite ---------------------------- *
 * One small canvas per near surface: the base tile, drawn as a flat repeat,
 * then the wear overlay drawn on top at a DIFFERENT cell size with alternate
 * cells mirrored — two independent ways the eye that spots one repeating
 * texture (tools/assets/tile.mjs's whole reason to exist) is denied both. */

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

function buildWorn(base, wear, canvasPx, baseCellPx, wearCellPx) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = canvasPx;
  const g = cv.getContext('2d');
  drawTiled(g, base.tex.image, baseCellPx, canvasPx, false);
  if (wear && wear.ready) drawTiled(g, wear.tex.image, wearCellPx, canvasPx, true);
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
    HULL_TEX.wall = { map: wallBase.tex, bumpScale: 0.02, repeat: repeat.wall };
  }
  if (scuteBase.ready) {
    HULL_TEX.scute = { map: buildWorn(scuteBase, wear, 256, 128, 188), bumpScale: 0.07, repeat: repeat.scute };
  }
  if (shadowBase.ready) {
    HULL_TEX.shadow = { map: shadowBase.tex, bumpScale: 0.04, repeat: repeat.shadow };
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
