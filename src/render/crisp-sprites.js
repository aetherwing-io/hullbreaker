/* ======================= CRISP SPRITE PATH (render) ===================== */
/* decisions.md entry 27, the integrator's first call under it: "Sprites are
   drawn unlit at full gain, nearest-neighbour, mip-free, on the device pixel
   grid, at a density chosen per device." This module is the path every
   atlas-drawn actor goes through to get there; src/pure/crisp-sprite.js holds
   its arithmetic and is where pathcheck proves it.

   WHAT WAS WRONG (the T-109 spike, reports/tasks/T-109/spike.md on
   task/T-109, sections 3-4): RIG was a lit MeshStandardMaterial plane, so the
   key/fill/rim, the shadow map and the ACES tone map all sat between his
   painting and the screen (per-channel gain 0.81/0.76/0.62); his atlas was
   minified ~13:1 through a mip chain every frame; and the canvas was
   resampled again by the browser. The spike's column A - the same painting
   composed at 8x the device density, area-reduced ONCE, alpha cut at 50%,
   shown 1 texel = 1 device pixel - is the look this path reproduces in game.

   HOW (one actor; every actor is the same three steps, once per frame):

     1. TILE PASS. The actor's existing meshes - unchanged geometry, unchanged
        transforms, unchanged per-frame posing (T-103's arms, the aimed gun,
        hit flashes, power heat) - move to CRISP_LAYER, which the main camera
        never draws. Inside the main render (scene.onBeforeRender), they are
        drawn once more with the SAME camera into a shared supersampled atlas
        target: each actor's region of the screen, S x denser, its sim point
        shifted onto a device-pixel edge. The shift and the region are applied
        per actor by premultiplying the mesh's modelViewMatrix in its
        material's onBeforeRender with P^-1 R P (R the clip-space remap), so
        no vertex shader changes and the perspective is exactly the game's.
        Their materials are made UNLIT in this pass only (the lit sum becomes
        diffuse + emissive), so the painting's own value is what lands; every
        emissive term (hit flash, state glow, OVERDRIVE/RAGE/GILDED heat, the
        gun's recoil flash) is kept, because those are signals, not lighting.
     2. ONE REDUCTION. A full-target pass box-averages each S x S block in
        premultiplied sRGB-encoded space and cuts alpha at 50% - Pillow's RGBa
        BOX resize, i.e. how the spike reduced column A - into a reduced atlas
        where one texel IS one device pixel.
     3. THE DRAW. One screen-aligned quad per actor in the main scene, its
        left/top edges on integer device pixels, sampling the reduced atlas by
        texelFetch at gl_FragCoord - so texel-to-pixel is exactly 1:1,
        nearest, mip-free by construction. It sits at the actor's depth (world
        geometry still occludes it) and sorts with the transparent effects as
        the old body plane did. Its colour leaves through the composer's ACES
        OutputPass unchanged, because it writes the exact inverse
        (src/pure/crisp-sprite.js inverseAcesExact), held under the bloom
        threshold so a sprite never grows a glow it was not painted with. On
        the direct path (?bloom=0, or a composer that failed) it is drawn
        toneMapped:false, which is already exact.

   NOT HERE: the pixel-ratio policy (src/pure/render-budget.js +
   src/render/scene.js) that puts the drawing buffer on the device grid in
   the first place, and every effect quad (flashes, glows, auras, beams,
   contact shadows), which is light rather than paint and stays in the lit,
   bloomed main pass exactly as before.

   ?art=legacy turns this whole module inert: no layer moves, no material is
   patched, no hook is installed, and every actor draws through its original
   lit path.

   Per frame this allocates nothing: every vector, matrix, list and record is
   built at registration.                                                    */

import * as THREE from 'three';
import { POST_TUNE } from '../config.js';
import { ART_CRISP, QUERY } from '../mode.js';
import {
  ACES_INPUT_INVERSE, ACES_OUTPUT_INVERSE, BLOOM_LUMA, CRISP_ALPHA_CUT,
  CRISP_BLOOM_MARGIN, CRISP_SUPERSAMPLE, crispSupersample, crispTileRect, inverseAcesExact,
  snapAnchor,
} from '../pure/crisp-sprite.js';
import { renderer, scene } from './scene.js';

export const CRISP_ON = ART_CRISP;
// A layer the main camera (layer 0 only) never draws. Only the tile pass's
// borrowed camera mask sees it.
export const CRISP_LAYER = 29;

const TILE_MARGIN = 1;           // device px of clear border around a figure
const TILE_GUTTER = 1;           // reduced-atlas texels between packed tiles
const ATLAS_MIN = 512;           // supersampled atlas edge, px
const ATLAS_MAX = 4096;
const BLOOM_CAP = POST_TUNE.bloom.threshold * CRISP_BLOOM_MARGIN;

/* ------------------------------ GLSL ---------------------------------- */

const glslMat3 = (m) => 'mat3(' + [0, 1, 2].map((c) =>
  [0, 1, 2].map((r) => m[r][c].toFixed(9)).join(', ')).join(', ') + ')';   // column-major

const INVERSE_TONE_GLSL = `
const mat3 CRISP_ACES_OUT_INV = ${glslMat3(ACES_OUTPUT_INVERSE)};
const mat3 CRISP_ACES_IN_INV = ${glslMat3(ACES_INPUT_INVERSE)};
float crispFitInverse(float w) {
  float A = 1.0 - 0.983729 * w;
  float B = 0.0245786 - 0.4329510 * w;
  float C = -(0.000090537 + 0.238081 * w);
  return (-B + sqrt(B * B - 4.0 * A * C)) / (2.0 * A);
}
vec3 crispInverseAces(vec3 y, float exposure) {
  vec3 w = clamp(CRISP_ACES_OUT_INV * clamp(y, 0.0, 1.0), 0.0, 1.0);
  vec3 v = vec3(crispFitInverse(w.r), crispFitInverse(w.g), crispFitInverse(w.b));
  return CRISP_ACES_IN_INV * v * (0.6 / max(exposure, 1e-4));
}`;

const SRGB_GLSL = `
vec3 crispEncode(vec3 l) {
  vec3 lo = l * 12.92;
  vec3 hi = 1.055 * pow(max(l, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
  return mix(hi, lo, vec3(lessThanEqual(l, vec3(0.0031308))));
}
vec3 crispDecode(vec3 s) {
  vec3 lo = s / 12.92;
  vec3 hi = pow((max(s, vec3(0.0)) + 0.055) / 1.055, vec3(2.4));
  return mix(hi, lo, vec3(lessThanEqual(s, vec3(0.04045))));
}`;

/* ---------------------------- render targets --------------------------- */

let hiTarget = null;             // S x supersampled tiles (+ depth for part order)
let loTarget = null;             // reduced tiles: one texel per device pixel
let hiSize = 0;

function ensureTargets(edge, S) {
  const size = Math.max(ATLAS_MIN, Math.min(ATLAS_MAX, edge));
  if (!hiTarget || size > hiSize) {
    if (hiTarget) hiTarget.dispose();
    hiSize = size;
    hiTarget = new THREE.WebGLRenderTarget(size, size, {
      type: THREE.HalfFloatType, depthBuffer: true, stencilBuffer: false,
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false,
    });
    hiTarget.texture.name = 'crisp-sprite-supersampled-atlas';
  }
  // The reduced atlas is sized for the smallest supersample the policy allows,
  // so any S in range fits without a reallocation.
  const lo = Math.ceil(hiSize / CRISP_SUPERSAMPLE.min);
  if (!loTarget || loTarget.width !== lo) {
    if (loTarget) loTarget.dispose();
    loTarget = new THREE.WebGLRenderTarget(lo, lo, {
      type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false,
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false,
    });
    loTarget.texture.name = 'crisp-sprite-device-atlas';
    for (const a of actors) a.uniforms.uAtlas.value = loTarget.texture;
  }
  return S;
}

/* -------------------------- the one reduction -------------------------- */

const reduceUniforms = {
  uHi: { value: null },
  uS: { value: 2 },
};
const reduceMaterial = new THREE.ShaderMaterial({
  name: 'crisp-sprite-reduction',
  uniforms: reduceUniforms,
  depthTest: false,
  depthWrite: false,
  vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
uniform sampler2D uHi;
uniform int uS;
${SRGB_GLSL}
void main() {
  ivec2 o = ivec2(floor(gl_FragCoord.xy)) * uS;
  vec3 sum = vec3(0.0);
  float a = 0.0;
  for (int j = 0; j < ${CRISP_SUPERSAMPLE.max}; j++) {
    if (j >= uS) break;
    for (int i = 0; i < ${CRISP_SUPERSAMPLE.max}; i++) {
      if (i >= uS) break;
      vec4 p = texelFetch(uHi, o + ivec2(i, j), 0);   // premultiplied linear
      if (p.a > 0.0) {
        sum += crispEncode(max(p.rgb / p.a, vec3(0.0))) * p.a;
        a += p.a;
      }
    }
  }
  float coverage = a / float(uS * uS);
  if (coverage < ${CRISP_ALPHA_CUT.toFixed(3)}) { gl_FragColor = vec4(0.0); return; }
  gl_FragColor = vec4(crispDecode(sum / a), 1.0);
}`,
});
reduceMaterial.toneMapped = false;
const reduceGeometry = new THREE.BufferGeometry();
reduceGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
const reduceMesh = new THREE.Mesh(reduceGeometry, reduceMaterial);
reduceMesh.frustumCulled = false;
const reduceScene = new THREE.Scene();
reduceScene.add(reduceMesh);
const reduceCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

/* ------------------------------ the draw -------------------------------- */

const IMPOSTOR_VERTEX = `
uniform vec4 uRect;      // x, y (top-left), w, h - device px
uniform vec2 uTarget;    // drawing target size, px
uniform float uDepth;    // the actor's anchor depth, NDC
void main() {
  vec2 px = vec2(uRect.x + uv.x * uRect.z, uRect.y + (1.0 - uv.y) * uRect.w);
  gl_Position = vec4(px.x / uTarget.x * 2.0 - 1.0, 1.0 - px.y / uTarget.y * 2.0, uDepth, 1.0);
}`;

const IMPOSTOR_FRAGMENT = `
uniform sampler2D uAtlas;
uniform vec4 uRect;
uniform vec2 uTarget;
uniform vec2 uTile;      // the tile's bottom-left texel in the device atlas
uniform float uFade;
uniform float uInverse;  // 1 when the composer's tone map follows this draw
uniform float uExposure;
uniform float uBloomCap;
${INVERSE_TONE_GLSL}
void main() {
  ivec2 frag = ivec2(floor(gl_FragCoord.xy));
  ivec2 bottomLeft = ivec2(int(floor(uRect.x + 0.5)), int(floor(uTarget.y - uRect.y - uRect.w + 0.5)));
  vec4 c = texelFetch(uAtlas, ivec2(uTile) + frag - bottomLeft, 0);
  if (c.a < 0.5) discard;
  vec3 rgb = clamp(c.rgb, 0.0, 1.0);
  if (uInverse > 0.5) {
    rgb = crispInverseAces(rgb, uExposure);
    float l = dot(rgb, vec3(${BLOOM_LUMA.map((v) => v.toFixed(3)).join(', ')}));
    if (uBloomCap > 0.0 && l > uBloomCap) rgb *= uBloomCap / l;
  }
  gl_FragColor = vec4(rgb, uFade);
  #include <colorspace_fragment>
}`;

const impostorGeometry = new THREE.PlaneGeometry(1, 1);

function onImpostorRender(r) {
  // `this` is the material. The composed path draws the scene into the
  // composer's linear target and tone-maps it in OutputPass; the direct path
  // draws to the canvas with this material's toneMapped:false. Only the
  // first needs the inverse.
  const u = this.uniforms;
  u.uInverse.value = r.getRenderTarget() !== null &&
    r.toneMapping === THREE.ACESFilmicToneMapping ? 1 : 0;
  u.uExposure.value = r.toneMappingExposure;
}

/* --------------------------- part materials ---------------------------- */

let tilePass = false;

// Shared by every crisp part material: during the tile pass, put this object
// into its actor's tile; at any other time do nothing.
function onPartRender(_r, _s, _c, _g, object) {
  if (!tilePass) return;
  const actor = object.userData.crispActor;
  if (actor && actor.drawn) object.modelViewMatrix.premultiply(actor.remap);
}

// three r170's lit sums (meshphysical / meshlambert / meshphong fragment
// mains). The import map pins three 0.170.0; a three upgrade that rewords
// them shows up as unlitMisses in crispSnapshot(), not as a silent black RIG.
const LIT_SUMS = [
  'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;',
  'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
  'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;',
];
const UNLIT_SUM = 'vec3 outgoingLight = diffuseColor.rgb + totalEmissiveRadiance;';
let unlitMisses = 0;

function unlitPatch(shader) {
  // The painting (map x color x vertex colour) plus every emissive signal,
  // and none of the light rig. The tile pass has no lights in it anyway; this
  // also drops the IBL/ambient terms a lit program would still add.
  let src = shader.fragmentShader;
  for (let i = 0; i < LIT_SUMS.length; i++) src = src.replace(LIT_SUMS[i], UNLIT_SUM);
  if (src.indexOf(UNLIT_SUM) < 0) unlitMisses++;
  shader.fragmentShader = src;
}

function crispPartMaterial(material) {
  if (!material || material.userData.crispPart) return;
  material.userData.crispPart = true;
  material.onBeforeRender = onPartRender;
  if (material.isMeshStandardMaterial || material.isMeshLambertMaterial || material.isMeshPhongMaterial) {
    const previous = material.onBeforeCompile;
    material.onBeforeCompile = (shader, r) => {
      if (typeof previous === 'function') previous(shader, r);
      unlitPatch(shader);
    };
    const key = material.customProgramCacheKey.bind(material);
    material.customProgramCacheKey = () => key() + '|crisp-unlit';
    material.needsUpdate = true;
  }
}

function enrollMesh(mesh, actor) {
  if (mesh.userData.crispActor !== actor) mesh.userData.crispActor = actor;
  if (mesh.layers.mask !== CRISP_LAYER_MASK) mesh.layers.set(CRISP_LAYER);
  const m = mesh.material;
  if (Array.isArray(m)) { for (let i = 0; i < m.length; i++) crispPartMaterial(m[i]); }
  else crispPartMaterial(m);
}
const CRISP_LAYER_MASK = 1 << CRISP_LAYER;

/* ------------------------------ registry -------------------------------- */

const actors = [];
const debug = {
  hideAll: false,              // capture: every crisp actor off (actor-free frames)
  hiddenActors: new Set(),     // capture: RIG-free frames
  hiddenParts: new Set(),      // capture: names of part roots to omit (e.g. the gun)
  rectOffsetPx: 0,             // falsifier: shift every drawn quad off the grid
  snapOffsetPx: 0,             // falsifier: shift every figure off its pixel edge
};

/* Register an actor with the crisp path.
     name           diagnostics + the capture tools' handle
     anchor         Object3D whose world origin is the sim point (snapped)
     parts          Object3D roots whose meshes ARE the actor's painted body
     texelsPerTile  the art's own density, for the supersample choice
     fade()         optional: the actor's whole-figure opacity (default 1)
     renderOrder    optional sort slot of the drawn quad among transparent
                    effects; by default the LOWEST of its parts' slots, so
                    whatever drew under the whole figure still does, whatever
                    drew over all of it still does, and an effect that used to
                    fall between two of its layers now draws over the figure
                    (one quad cannot interleave)
     impostorParent optional: where the drawn quad hangs (default: the
                    anchor, so it shares the anchor's visibility and sort
                    position, and survives any tool that isolates the
                    actor's group; a pooled rig whose anchor piece may hide
                    alone passes the scene)
   Returns the record, or null on ?art=legacy (where nothing moves).        */
function lowestRenderOrder(parts) {
  let lo = Infinity;
  for (let i = 0; i < parts.length; i++) {
    parts[i].traverse((o) => { if (o.isMesh && o.renderOrder < lo) lo = o.renderOrder; });
  }
  return Number.isFinite(lo) ? lo : 0;
}

export function registerCrispActor(spec) {
  if (!CRISP_ON) return null;
  const uniforms = {
    uAtlas: { value: loTarget ? loTarget.texture : null },
    uRect: { value: new THREE.Vector4(0, 0, 1, 1) },
    uTarget: { value: new THREE.Vector2(1, 1) },
    uTile: { value: new THREE.Vector2(0, 0) },
    uDepth: { value: 0 },
    uFade: { value: 1 },
    uInverse: { value: 1 },
    uExposure: { value: 1 },
    uBloomCap: { value: BLOOM_CAP },
  };
  const material = new THREE.ShaderMaterial({
    name: 'crisp-sprite-' + spec.name,
    uniforms,
    vertexShader: IMPOSTOR_VERTEX,
    fragmentShader: IMPOSTOR_FRAGMENT,
    transparent: true,
    depthTest: true,
    depthWrite: true,
    side: THREE.DoubleSide,
    forceSinglePass: true,
  });
  material.toneMapped = false;
  material.onBeforeRender = onImpostorRender;
  const impostor = new THREE.Mesh(impostorGeometry, material);
  impostor.name = 'crisp-sprite:' + spec.name;
  impostor.frustumCulled = false;
  impostor.renderOrder = typeof spec.renderOrder === 'number' ? spec.renderOrder
    : lowestRenderOrder(spec.parts);
  impostor.visible = false;
  impostor.userData.shadow = 'none';
  impostor.userData.crispImpostor = true;
  const actor = {
    name: spec.name,
    anchor: spec.anchor,
    parts: spec.parts.slice(),
    texelsPerTile: spec.texelsPerTile || 64,
    fade: typeof spec.fade === 'function' ? spec.fade : null,
    impostor,
    uniforms,
    meshes: [],
    rect: { x: 0, y: 0, w: 1, h: 1 },
    snap: { x: 0, y: 0, dx: 0, dy: 0 },
    anchorPx: { x: 0, y: 0 },
    anchorNdcZ: 0,
    devicePxPerTile: 0,
    S: CRISP_SUPERSAMPLE.min,
    tile: { x: 0, y: 0 },
    remap: new THREE.Matrix4(),
    fadeValue: 1,
    drawn: false,
    removed: false,
  };
  actors.push(actor);
  (spec.impostorParent || spec.anchor).add(impostor);
  return actor;
}

export function unregisterCrispActor(actor) {
  if (!actor || actor.removed) return;
  actor.removed = true;
  const i = actors.indexOf(actor);
  if (i >= 0) actors.splice(i, 1);
  actor.impostor.removeFromParent();
  actor.impostor.material.dispose();
  for (const root of actor.parts) {
    root.traverse((o) => { if (o.userData.crispActor === actor) o.userData.crispActor = null; });
  }
}

/* ------------------------------ per frame ------------------------------- */

const _size = new THREE.Vector2();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _projScreen = new THREE.Matrix4();
const _R = new THREE.Matrix4();
const _clear = new THREE.Color();
const _box = { minX: 0, minY: 0, maxX: 0, maxY: 0, any: false };
let _W = 1, _H = 1;
let _actor = null;
let frameStamp = 0;
const touchedMaterials = [];
const touchedOpacity = [];
const hiddenRoots = [];

// Visible all the way up AND still in the scene: a part its owner has
// detached (a wing retired at teardown, a genome module dropped at death)
// is not drawn, so it must not widen the tile either.
function worldVisible(o) {
  let p = o;
  for (; p.parent; p = p.parent) if (!p.visible) return false;
  return p === scene && p.visible;
}

function projectPoint(x, y, z, m) {
  _v.set(x, y, z).applyMatrix4(m).applyMatrix4(_projScreen);
  const px = (_v.x + 1) * 0.5 * _W;
  const py = (1 - _v.y) * 0.5 * _H;
  if (px < _box.minX) _box.minX = px;
  if (px > _box.maxX) _box.maxX = px;
  if (py < _box.minY) _box.minY = py;
  if (py > _box.maxY) _box.maxY = py;
}

function visitPart(o) {
  if (!o.isMesh || !o.visible || o.userData.crispImpostor) return;
  enrollMesh(o, _actor);
  _actor.meshes.push(o);
  const geo = o.geometry;
  const pos = geo.getAttribute('position');
  if (!pos) return;
  if (geo.boundingBox === null || pos.usage === THREE.DynamicDrawUsage) geo.computeBoundingBox();
  const b = geo.boundingBox;
  if (b.isEmpty()) return;
  const m = o.matrixWorld;
  for (let i = 0; i < 8; i++) {
    projectPoint(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z, m);
  }
  _box.any = true;
}

function measureActor(a) {
  a.meshes.length = 0;
  a.drawn = false;
  if (debug.hideAll || debug.hiddenActors.has(a.name)) return false;
  _actor = a;
  _box.minX = Infinity; _box.minY = Infinity; _box.maxX = -Infinity; _box.maxY = -Infinity;
  _box.any = false;
  for (let i = 0; i < a.parts.length; i++) {
    const root = a.parts[i];
    if (debug.hiddenParts.size && debug.hiddenParts.has(root.name)) continue;
    if (worldVisible(root)) root.traverseVisible(visitPart);
  }
  _actor = null;
  if (!_box.any || !Number.isFinite(_box.minX)) return false;
  _w.setFromMatrixPosition(a.anchor.matrixWorld);
  _v.copy(_w).applyMatrix4(_projScreen);
  a.anchorNdcZ = _v.z;
  a.anchorPx.x = (_v.x + 1) * 0.5 * _W;
  a.anchorPx.y = (1 - _v.y) * 0.5 * _H;
  if (!(a.anchorNdcZ > -1 && a.anchorNdcZ < 1)) return false;
  _v.copy(_w);
  _v.y += 1;
  _v.applyMatrix4(_projScreen);
  a.devicePxPerTile = Math.abs((1 - _v.y) * 0.5 * _H - a.anchorPx.y);
  a.S = crispSupersample(a.texelsPerTile, a.devicePxPerTile);
  snapAnchor(a.anchorPx.x + debug.snapOffsetPx, a.anchorPx.y + debug.snapOffsetPx, a.snap);
  crispTileRect(_box.minX, _box.minY, _box.maxX, _box.maxY, a.snap.dx, a.snap.dy, TILE_MARGIN, a.rect);
  // Only the part of the figure that can reach the screen is ever composed.
  const x0 = Math.max(a.rect.x, -TILE_MARGIN), y0 = Math.max(a.rect.y, -TILE_MARGIN);
  const x1 = Math.min(a.rect.x + a.rect.w, _W + TILE_MARGIN);
  const y1 = Math.min(a.rect.y + a.rect.h, _H + TILE_MARGIN);
  if (x1 <= x0 || y1 <= y0) return false;
  a.rect.x = x0; a.rect.y = y0; a.rect.w = x1 - x0; a.rect.h = y1 - y0;
  a.fadeValue = a.fade ? Math.max(0, Math.min(1, a.fade())) : 1;
  return a.fadeValue > 0.001;
}

// Shelf packing in device-atlas texels. Returns the supersampled edge
// needed (or -1), and leaves the used extent in _usedW/_usedH (texels).
let _usedW = 0, _usedH = 0;
function pack(S, edge) {
  const cols = Math.floor(edge / S);
  let x = TILE_GUTTER, y = TILE_GUTTER, row = 0, maxX = 0;
  for (let ai = 0; ai < actors.length; ai++) {
    const a = actors[ai];
    if (!a.drawn) continue;
    if (x + a.rect.w + TILE_GUTTER > cols) { x = TILE_GUTTER; y += row + TILE_GUTTER; row = 0; }
    if (a.rect.w + 2 * TILE_GUTTER > cols) return -1;
    a.tile.x = x;
    a.tile.y = y;
    x += a.rect.w + TILE_GUTTER;
    if (x > maxX) maxX = x;
    if (a.rect.h > row) row = a.rect.h;
  }
  _usedW = maxX;
  _usedH = y + row + TILE_GUTTER;
  return _usedH * S <= edge ? edge : -1;
}

function remapFor(a, S, cam) {
  // clip-space remap of the actor's (snapped) screen region onto its tile of
  // the supersampled atlas: x' = sx x + ox w, y' = sy y + oy w.
  const AW = hiSize, AH = hiSize;
  const dx = a.snap.dx, dy = a.snap.dy;
  const sx = _W * S / AW, sy = _H * S / AH;
  const ox = (a.tile.x + _W / 2 + dx - a.rect.x) * 2 * S / AW - 1;
  const oy = (a.tile.y + a.rect.h + a.rect.y - dy - _H / 2) * 2 * S / AH - 1;
  _R.set(sx, 0, 0, ox, 0, sy, 0, oy, 0, 0, 1, 0, 0, 0, 0, 1);
  a.remap.multiplyMatrices(cam.projectionMatrixInverse, _R).multiply(cam.projectionMatrix);
}

function normalizeOpacity(a) {
  // The tile carries the silhouette at full coverage; the drawn quad carries
  // the actor's fade. Parts whose own opacity tracks the fade come out at 1;
  // a part deliberately fainter than the body keeps its ratio.
  const f = a.fadeValue;
  for (let i = 0; i < a.meshes.length; i++) {
    const mats = a.meshes[i].material;
    const n = Array.isArray(mats) ? mats.length : 1;
    for (let k = 0; k < n; k++) {
      const m = Array.isArray(mats) ? mats[k] : mats;
      if (!m || m.userData.crispStamp === frameStamp) continue;
      m.userData.crispStamp = frameStamp;
      touchedMaterials.push(m);
      touchedOpacity.push(m.opacity);
      m.opacity = f > 0 ? Math.min(1, m.opacity / f) : m.opacity;
    }
  }
}

function hideDebugParts() {
  if (!debug.hiddenParts.size) return;
  for (let ai = 0; ai < actors.length; ai++) {
    const a = actors[ai];
    for (let ri = 0; ri < a.parts.length; ri++) {
      const root = a.parts[ri];
      if (debug.hiddenParts.has(root.name) && root.visible) { root.visible = false; hiddenRoots.push(root); }
    }
  }
}

function composeTiles(cam, target) {
  if (target) { _W = target.width; _H = target.height; }
  else { renderer.getDrawingBufferSize(_size); _W = _size.x; _H = _size.y; }
  _projScreen.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  let S = CRISP_SUPERSAMPLE.min;
  let any = false;
  for (let ai = 0; ai < actors.length; ai++) {
    const a = actors[ai];
    a.drawn = measureActor(a);
    if (a.drawn) { any = true; if (a.S > S) S = a.S; }
    else a.impostor.visible = false;
  }
  if (!any) return;
  // Fit: grow the atlas first, then give up supersampling, never the actor.
  let edge = Math.max(hiSize, ATLAS_MIN);
  for (;;) {
    if (pack(S, edge) > 0) break;
    if (edge < ATLAS_MAX) { edge *= 2; continue; }
    if (S > CRISP_SUPERSAMPLE.min) { S--; continue; }
    // A figure bigger than the whole atlas at the minimum supersample is a
    // camera nobody ships; drop the extras rather than corrupt the pass.
    for (let i = actors.length - 1; i >= 0 && pack(S, edge) < 0; i--) {
      if (actors[i].drawn) { actors[i].drawn = false; actors[i].impostor.visible = false; }
    }
    break;
  }
  ensureTargets(edge, S);
  frameStamp++;
  touchedMaterials.length = 0;
  touchedOpacity.length = 0;
  hiddenRoots.length = 0;
  for (let ai = 0; ai < actors.length; ai++) {
    const a = actors[ai];
    if (!a.drawn) continue;
    a.S = S;
    remapFor(a, S, cam);
    normalizeOpacity(a);
  }
  hideDebugParts();

  const prevTarget = renderer.getRenderTarget();
  const prevAutoClear = renderer.autoClear;
  renderer.getClearColor(_clear);
  const prevClearAlpha = renderer.getClearAlpha();
  const prevBackground = scene.background;
  const prevFog = scene.fog;
  const prevAutoUpdate = scene.matrixWorldAutoUpdate;
  const prevMask = cam.layers.mask;
  tilePass = true;
  // Only the packed region is cleared, composed and reduced each frame.
  hiTarget.scissor.set(0, 0, Math.min(hiSize, _usedW * S), Math.min(hiSize, _usedH * S));
  hiTarget.scissorTest = true;
  loTarget.viewport.set(0, 0, Math.min(loTarget.width, _usedW), Math.min(loTarget.height, _usedH));
  try {
    renderer.setRenderTarget(hiTarget);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);
    renderer.autoClear = false;
    scene.background = null;
    scene.fog = null;
    scene.matrixWorldAutoUpdate = false;
    cam.layers.set(CRISP_LAYER);
    renderer.render(scene, cam);
    cam.layers.mask = prevMask;
    reduceUniforms.uHi.value = hiTarget.texture;
    reduceUniforms.uS.value = S;
    renderer.setRenderTarget(loTarget);
    renderer.render(reduceScene, reduceCamera);
  } finally {
    tilePass = false;
    cam.layers.mask = prevMask;
    scene.matrixWorldAutoUpdate = prevAutoUpdate;
    scene.fog = prevFog;
    scene.background = prevBackground;
    renderer.autoClear = prevAutoClear;
    renderer.setClearColor(_clear, prevClearAlpha);
    for (let i = 0; i < touchedMaterials.length; i++) touchedMaterials[i].opacity = touchedOpacity[i];
    for (let i = 0; i < hiddenRoots.length; i++) hiddenRoots[i].visible = true;
    renderer.setRenderTarget(prevTarget);
  }

  for (let ai = 0; ai < actors.length; ai++) {
    const a = actors[ai];
    if (!a.drawn) continue;
    const u = a.uniforms;
    u.uAtlas.value = loTarget.texture;
    u.uRect.value.set(a.rect.x + debug.rectOffsetPx, a.rect.y + debug.rectOffsetPx, a.rect.w, a.rect.h);
    u.uTarget.value.set(_W, _H);
    u.uTile.value.set(a.tile.x, a.tile.y);
    u.uDepth.value = a.anchorNdcZ;
    u.uFade.value = a.fadeValue;
    // it sorts with the transparent effects from its parent's world
    // position; a scene-level quad is moved onto the anchor for that
    if (a.impostor.parent === scene) {
      a.impostor.position.setFromMatrixPosition(a.anchor.matrixWorld);
      a.impostor.updateMatrixWorld(true);
    }
    a.impostor.visible = true;
  }
}

function beforeMainRender(r, s, cam, target) {
  if (tilePass || !actors.length || !cam || !cam.isCamera) return;
  composeTiles(cam, target);
}

if (CRISP_ON) {
  scene.onBeforeRender = beforeMainRender;
}

/* ------------------------------ probes ---------------------------------- */

function halfToFloat(h) {
  const s = (h & 0x8000) ? -1 : 1;
  const e = (h >> 10) & 0x1f;
  const f = h & 0x3ff;
  if (e === 0) return s * Math.pow(2, -14) * (f / 1024);
  if (e === 31) return f ? NaN : s * Infinity;
  return s * Math.pow(2, e - 15) * (1 + f / 1024);
}

/* The device-resolution tile an actor was drawn from this frame, read back
   from the GPU (allocates; probes only, never the frame loop). rgba is
   linear, rows TOP-DOWN, alpha 0/1. `capped` marks the texels the bloom
   ceiling holds below their painted value on the composed path. */
export function crispTileReadback(which) {
  const a = typeof which === 'number' ? actors[which] : actors.find((r) => r.name === which);
  if (!a || !a.drawn || !loTarget) return null;
  const w = a.rect.w, h = a.rect.h;
  const raw = new Uint16Array(w * h * 4);
  renderer.readRenderTargetPixels(loTarget, a.tile.x, a.tile.y, w, h, raw);
  const rgba = new Float32Array(w * h * 4);
  const capped = new Uint8Array(w * h);
  const exposure = renderer.toneMappingExposure;
  const x = [0, 0, 0];
  for (let row = 0; row < h; row++) {
    const src = (h - 1 - row) * w * 4;          // GL rows are bottom-up
    for (let i = 0; i < w * 4; i++) rgba[row * w * 4 + i] = halfToFloat(raw[src + i]);
    for (let col = 0; col < w; col++) {
      const k = (row * w + col) * 4;
      if (rgba[k + 3] < 0.5) continue;
      const t = [Math.min(1, rgba[k]), Math.min(1, rgba[k + 1]), Math.min(1, rgba[k + 2])];
      inverseAcesExact(t, exposure, x);
      const l = BLOOM_LUMA[0] * x[0] + BLOOM_LUMA[1] * x[1] + BLOOM_LUMA[2] * x[2];
      if (l > BLOOM_CAP) capped[row * w + col] = 1;
    }
  }
  return { w, h, rgba, capped };
}

// The anchor object of the index-th registered actor, so a probe can project
// the sim point itself instead of trusting this module's numbers.
export function crispActorAnchor(index) {
  return actors[index] ? actors[index].anchor : null;
}

/* ----------------------------- read surface ----------------------------- */

export function crispSnapshot() {
  return {
    on: CRISP_ON,
    layer: CRISP_LAYER,
    atlas: hiTarget ? { supersampled: hiSize, device: loTarget ? loTarget.width : 0 } : null,
    target: { width: _W, height: _H },
    unlitMisses,
    actors: actors.map((a) => ({
      name: a.name,
      renderOrder: a.impostor.renderOrder,
      drawn: a.drawn,
      meshes: a.meshes.length,
      S: a.S,
      devicePxPerTile: +a.devicePxPerTile.toFixed(4),
      anchorPx: { x: a.anchorPx.x, y: a.anchorPx.y },
      snap: { x: a.snap.x, y: a.snap.y, dx: a.snap.dx, dy: a.snap.dy },
      rect: { ...a.rect },
      drawnRect: a.drawn ? {
        x: a.uniforms.uRect.value.x, y: a.uniforms.uRect.value.y,
        w: a.uniforms.uRect.value.z, h: a.uniforms.uRect.value.w,
      } : null,
      tile: { ...a.tile },
      depthNdc: a.anchorNdcZ,
      fade: a.fadeValue,
    })),
  };
}

if (typeof window !== 'undefined') {
  window.__HB_CRISP = crispSnapshot;
  // Capture/probe hooks (RIG-free frames, gun masks, falsifiers) exist only
  // in an automated session; an ordinary URL has no way to reach them.
  if (CRISP_ON && QUERY.has('testapi')) window.__HB_CRISP_DEBUG = debug;
}
