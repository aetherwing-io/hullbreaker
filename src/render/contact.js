/* ======================= CONTACT SHADOWS (T-039 / S6) ================== *
 * One instanced pool of flat, multiply-blended footprints that reads "this thing
 * sits ON the world" — docs/proposals/2026-08-look-direction.md §3 S6, the
 * cheapest legal source of the missing dark end of the value range (0.0% of
 * playfield pixels exceed luminance 200 in every gameplay capture measured
 * there; the shipped light rig fills every underside and nothing occludes
 * anything — grep -rn 'castShadow|receiveShadow|shadowMap' src/ is empty).
 *
 * THIS IS NOT A SHADOW MAP. MultiplyBlending is core three.js: no addon, no
 * light object, no renderer.shadowMap, no post pass, no asset — so it never
 * touches the light-rig guardrail (decisions.md entry 4.1 stays unopened,
 * and pathcheck's new statics below prove that mechanically).
 *
 * ON BY DEFAULT (decisions.md entries 16 + 17). Entry 16 retired the blanket
 * "prototypes ship behind a query flag, off by default" rule specifically
 * because it kept the operator looking at a grey-box build while approved
 * work sat invisible behind flags nobody typed; entry 17 names "contact
 * shadows" as one of the five look builds he was shown and approved
 * ("all of those 5 builds look good to me") and states plainly that
 * approved work "must not stay hidden behind flags." `?shadow=0` is the
 * escape hatch back — the same `?juice=0`/`?legibility=0` idiom entry 16
 * itself names as the correct precedent for approved, shipped work, not
 * an exception to it. When disabled (`?shadow=0`, or the transformation
 * slice below) this module still builds no geometry, no material, no mesh,
 * and every exported function returns immediately — the same "a disabled
 * path costs nothing" contract src/render/fx.js's ?juice=0 carries.
 *
 * One row per live actor per frame — RIG (src/render/player.js), each
 * hostile (src/render/hostiles.js) and each capsule (src/render/capsules.js)
 * call `syncContactShadow(id, s, y, footprintRadius)` from their own sync();
 * hostiles and capsules call `releaseContactShadow(id)` from their own
 * removed() so a dead actor's row parks on the shared HIDE matrix instead of
 * leaving a shadow stuck at its last position. `id` is any stable identity —
 * the sim row object itself for a hostile/capsule (the same key
 * src/render/hostiles.js's own `meshes` Map already uses), a module-level
 * sentinel for RIG, who has exactly one and never "removed".
 *
 * The pool is FIXED and never grows past boot (the exact idiom already in
 * src/render/fx.js:106-135): claiming a live id is a Map lookup, and once
 * every row is claimed a saturated pool recycles the oldest row round-robin
 * rather than dropping the request or allocating — a purely cosmetic
 * degradation (one shadow momentarily shares/loses its row) rather than a
 * crash. POOL_MAX below is sized generously past any wave composition this
 * cycle fields (CONFIG.waves' widest gate is 9 slots; RIG plus capsules adds
 * a handful more) with headroom to spare, not a measured hard ceiling.
 *
 * Ground query: groundTopAt/platforms are already exported read-only from
 * src/sim/level.js, and src/render/level.js already imports from that same
 * module for its own tile bake — so this crosses no new layer boundary and
 * writes nothing back to the sim. It reads groundTopAt (the raw geometric
 * deck height render/level.js's tile bake always draws from), NOT
 * builtGroundTopAt (the sim's build-gating state for the RETIRED zipper
 * reveal): under the shipped default (IS_G1, decisions.md entry 3's
 * static-anatomy reveal), unbuiltHidden() no-ops and every future-face
 * column is already fully visible from the start, so builtGroundTopAt would
 * hide a shadow under geometry the player can plainly see. The one narrower
 * cost of that choice: under the retired ?zip=1 brick-slam path (which "gets
 * no further investment" by the codebase's own stated policy), a shadow can
 * briefly sit over a column whose tiles are mid-zipper and momentarily
 * invisible. Stated here rather than silently accepted.
 *
 * Guarded off entirely under the transformation slice (?slice=transform,
 * ?g2=1): render/transform.js draws its OWN band geometry instead of the
 * tile bake in render/level.js (level.js skips that bake under
 * IS_TRANSFORM_SLICE), so sim groundH is not proven to coincide with the
 * drawn floor there. This is NOT "no groundH" — most columns measure ground
 * under ?slice=transform right now — it is a drawn-floor guarantee
 * this module cannot make without transform.js's own surface query, so
 * contact shadows stay off there until that query exists.
 *
 * The surface RESOLUTION and the height falloff are both pure
 * (src/pure/contactShadow.js) so pathcheck can assert the surface-selection
 * and monotone-falloff properties without a browser; this module is placement
 * and pixels only.                                                        */

import * as THREE from 'three';
import { QUERY, IS_TRANSFORM_SLICE } from '../mode.js';
import { CONTACT_SHADOW, contactShadowPlacement } from '../pure/contactShadow.js';
import { groundTopAt, platforms } from '../sim/level.js';
import { PAL } from './palette.js';
import { scene, HIDE } from './scene.js';
import { towerPose } from './tower.js';
import { PHYSICAL_DEPTH_LAYER, physicalDepthOffset } from './depth-layers.js';

// On by default (entries 16/17): only the literal opt-out ('0') or the
// transformation slice's unproven drawn-floor guarantee turn it off.
// Anything else — absent, '', '1', junk — resolves to armed, the exact
// shape src/mode.js's own JUICE_ENABLED already uses
// (`QUERY.get('juice') !== '0'`) for its default-on flag.
export function resolveContactShadows(value, transformSlice) {
  return value !== '0' && !transformSlice;
}
export const CONTACT_SHADOWS_ENABLED =
  resolveContactShadows(QUERY.get('shadow'), IS_TRANSFORM_SLICE);

const POOL_MAX = 48;               // see header note: generous headroom, not a hard cap
const Y_LIFT = physicalDepthOffset(PHYSICAL_DEPTH_LAYER.CONTACT_SHADOW);
const FOOTPRINT_SEGMENTS = 12;     // soft at FAR without paying for a texture or a canvas

let mesh = null;
let strengthAttribute = null;
const rowOf = new Map();           // actor id -> pool row index
const free = [];                   // free row indices (stack)
const ownerOfRow = new Array(POOL_MAX).fill(null);
const profileOfRow = new Array(POOL_MAX).fill('');
const coverage = Object.create(null);
let cursor = 0;

const _m = new THREE.Matrix4();
const _scale = new THREE.Vector3();
const _pose = { x: 0, y: 0, z: 0, yaw: 0, alt: 0 };

if (CONTACT_SHADOWS_ENABLED) {
  // A twelve-sided unit footprint, laid onto the XZ plane once at construction.
  // Radial shade falls from the centre to zero at the perimeter, giving the
  // painterly cutouts a restrained underside weight without a square card,
  // runtime canvas, texture, shader clone or additional draw call.  Instance
  // scale below authors the X/Z aspect per silhouette while this one resident
  // geometry remains shared by RIG, every hostile and every capsule.
  const geo = new THREE.CircleGeometry(0.5, FOOTPRINT_SEGMENTS);
  const radial = new Float32Array(geo.attributes.position.count);
  radial[0] = 1;
  geo.setAttribute('shadowRadial', new THREE.Float32BufferAttribute(radial, 1));
  strengthAttribute = new THREE.InstancedBufferAttribute(new Float32Array(POOL_MAX), 1);
  geo.setAttribute('shadowStrength', strengthAttribute);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    // ShaderMaterial does not provision the stock fog uniforms merely because
    // `fog:true` is set. Merge the resident Three uniform block once at boot so
    // WebGLRenderer.refreshFogUniforms has the values it expects on first draw.
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { shadowColor: { value: new THREE.Color(PAL.contactShadow) } },
    ]),
    vertexShader: `
      attribute float shadowRadial;
      attribute float shadowStrength;
      varying float vShadow;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vShadow = shadowRadial * shadowStrength;
        vec3 transformed = position;
        #include <project_vertex>
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      uniform vec3 shadowColor;
      varying float vShadow;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        float fogGain = 1.0;
        #ifdef USE_FOG
          #ifdef FOG_EXP2
            float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          #else
            float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
          #endif
          fogGain = 1.0 - fogFactor;
        #endif
        float shade = clamp(vShadow * fogGain, 0.0, 1.0);
        gl_FragColor = vec4(mix(vec3(1.0), shadowColor, shade), 1.0);
        #include <colorspace_fragment>
      }
    `,
    blending: THREE.MultiplyBlending,
    transparent: true, depthWrite: false, fog: true,
    toneMapped: false,
  });
  mesh = new THREE.InstancedMesh(geo, mat, POOL_MAX);
  mesh.name = 'contact-shadow-footprint-pool';
  mesh.userData.contactShadowPool = true;
  mesh.userData.fixedRows = POOL_MAX;
  mesh.userData.runtimeTextures = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  for (let i = 0; i < POOL_MAX; i++) {
    mesh.setMatrixAt(i, HIDE);
    strengthAttribute.setX(i, 0);
    free.push(i);
  }
  scene.add(mesh);
}

function claim(id) {
  let i = rowOf.get(id);
  if (i !== undefined) return i;
  if (free.length) i = free.pop();
  else {
    i = cursor;
    cursor = (cursor + 1) % POOL_MAX;
    // Saturation is cosmetic, but ownership must stay honest: without deleting
    // the displaced id, a later sync could write through an old Map entry and
    // fight the new owner for the same instance row.
    if (ownerOfRow[i] !== null) rowOf.delete(ownerOfRow[i]);
  }
  rowOf.set(id, i);
  ownerOfRow[i] = id;
  return i;
}

function hide(i) {
  mesh.setMatrixAt(i, HIDE);
  strengthAttribute.setX(i, 0);
  mesh.instanceMatrix.needsUpdate = true;
  strengthAttribute.needsUpdate = true;
}

// Called once per live actor per frame, from that actor's own render sync():
// `s`/`y` are the actor's SIM position (never a render-only depth wobble —
// the shadow follows the ribbon, not a mock-3D breathing offset), and
// `footprintRadius` is that actor's own authored ground footprint (RIG's
// half-width, a wasp's visualRadius, a hound's half-width, …). The drawn
// radius is that value times a [0,1] falloff fraction, so it can never
// exceed the footprint the caller passed in — never a fixed world radius
// this module invents on its own.
export function syncContactShadow(id, s, y, footprint, gain = 1) {
  if (!CONTACT_SHADOWS_ENABLED) return;
  const gTop = groundTopAt(s);
  const p = contactShadowPlacement(s, y, gTop, platforms, CONTACT_SHADOW);
  const i = claim(id);
  const scalar = typeof footprint === 'number';
  const radius = scalar ? footprint : footprint?.radius || 0;
  const depthRatio = scalar ? 1 : footprint?.depthRatio ?? 1;
  const strength = scalar ? 0.72 : footprint?.strength ?? 0.72;
  const profile = scalar ? 'generic' : footprint?.key || 'authored';
  coverage[profile] = true;
  profileOfRow[i] = profile;
  const visibleGain = Math.max(0, Math.min(1, gain));
  if (p.opacity <= 0 || radius <= 0 || visibleGain <= 0) { hide(i); return; }
  const pose = towerPose(s, _pose);
  const d = 2 * radius * p.radiusMult * visibleGain;
  _m.makeRotationY(pose.yaw);
  _m.scale(_scale.set(d, 1, d * Math.max(0.18, Math.min(1, depthRatio))));
  _m.setPosition(pose.x, p.groundY + Y_LIFT + pose.alt, pose.z);
  mesh.setMatrixAt(i, _m);
  // The custom instance scalar mixes the shader toward white (multiply's
  // identity), so height and per-role weight soften both core and feather
  // without another material, texture or draw.
  strengthAttribute.setX(i,
    p.opacity / CONTACT_SHADOW.maxOpacity * strength * visibleGain);
  mesh.instanceMatrix.needsUpdate = true;
  strengthAttribute.needsUpdate = true;
}

// Called from a hostile's/capsule's own removed(): a dead actor's row must
// not keep showing a shadow at its last live position. RIG never calls this
// (one row, one lifetime, never removed) — see src/render/player.js.
export function releaseContactShadow(id) {
  if (!CONTACT_SHADOWS_ENABLED) return;
  const i = rowOf.get(id);
  if (i === undefined) return;
  rowOf.delete(id);
  ownerOfRow[i] = null;
  profileOfRow[i] = '';
  hide(i);
  free.push(i);
}

// No separate run-reset hook: unlike src/render/fx.js's bursty particles,
// every live row here is owned by a spawn/removed pair that already runs on
// reset — sim/hostiles.js's clearHostiles() calls view.hostiles.removed(e,
// false) for every hostile before truncating the array, and main.js's own
// capsule-clear loop calls removeCapsule(i) for each, which calls
// view.capsules.removed(c) — so releaseContactShadow already fires for every
// live id through the existing removed() wiring below. RIG's one row is
// simply overwritten next frame at wherever player.x/y reset to; there is
// nothing for it to leak.

// read-only debug/telemetry surface, the same shape src/render/fx.js's
// fxStats() takes (see window.HB.juice) — not wired to window.HB by this
// task (src/main.js is outside its file scope; see the build report).
export function contactShadowStats() {
  const liveProfiles = Object.create(null);
  for (const profile of profileOfRow) if (profile)
    liveProfiles[profile] = (liveProfiles[profile] || 0) + 1;
  return {
    enabled: CONTACT_SHADOWS_ENABLED,
    live: rowOf.size,
    max: POOL_MAX,
    draws: CONTACT_SHADOWS_ENABLED ? 1 : 0,
    geometry: 'radial-identity-footprint',
    segments: FOOTPRINT_SEGMENTS,
    textureCount: 0,
    runtimeCanvasCount: 0,
    liveProfiles,
    coveredProfiles: Object.keys(coverage).sort(),
  };
}

if (typeof globalThis !== 'undefined')
  globalThis.__HB_CONTACT_SHADOWS = contactShadowStats;
