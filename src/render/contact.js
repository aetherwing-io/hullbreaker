/* ======================= CONTACT SHADOWS (T-039 / S6) ================== *
 * One instanced pool of flat, multiply-blended quads that reads "this thing
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
 * ?shadow=1 arms it. Absent — every shipped URL today — this module builds
 * no geometry, no material, no mesh, and every exported function returns
 * immediately: a disabled boot costs the same three.js work as the
 * pre-contact-shadow game, the same contract src/render/fx.js's ?juice=0
 * carries. This is an UNJUDGED pixel change awaiting an operator checkpoint,
 * not baseline feedback for an already-shipped mechanic (the ?juice=0 /
 * ?legibility=0 precedent is explicitly NOT precedent for default-on here —
 * the packet says so for exactly this reason), so CLAUDE.md's rule applies:
 * prototypes ship behind a query flag, off by default.
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
 * drawn floor there. This is NOT "no groundH" — 400 of 445 columns measure
 * ground under ?slice=transform right now — it is a drawn-floor guarantee
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

export function resolveContactShadows(value, transformSlice) {
  return value === '1' && !transformSlice;
}
export const CONTACT_SHADOWS_ENABLED =
  resolveContactShadows(QUERY.get('shadow'), IS_TRANSFORM_SLICE);

const POOL_MAX = 48;               // see header note: generous headroom, not a hard cap
const Y_LIFT = 0.02;               // world-Y lift off the surface, beats z-fighting

let mesh = null;
const rowOf = new Map();           // actor id -> pool row index
const free = [];                   // free row indices (stack)
let cursor = 0;

const _m = new THREE.Matrix4();
const _scale = new THREE.Vector3();
const _pose = { x: 0, y: 0, z: 0, yaw: 0, alt: 0 };
const _white = new THREE.Color(1, 1, 1);
const _shadowColor = new THREE.Color();
const _c = new THREE.Color();

if (CONTACT_SHADOWS_ENABLED) {
  // A flat unit PlaneGeometry, laid onto the XZ plane once at construction
  // (three.js's own idiom for a "ground" quad) so the per-frame matrix below
  // only ever composes a yaw rotation, a scale and a translation.
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: PAL.contactShadow, blending: THREE.MultiplyBlending,
    transparent: true, depthWrite: false, fog: true,
  });
  mesh = new THREE.InstancedMesh(geo, mat, POOL_MAX);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  _shadowColor.set(PAL.contactShadow);
  for (let i = 0; i < POOL_MAX; i++) {
    mesh.setMatrixAt(i, HIDE);
    mesh.setColorAt(i, _white);       // white = the multiply identity: no darkening
    free.push(i);
  }
  scene.add(mesh);
}

function claim(id) {
  let i = rowOf.get(id);
  if (i !== undefined) return i;
  if (free.length) i = free.pop();
  else { i = cursor; cursor = (cursor + 1) % POOL_MAX; }   // saturated: round-robin recycle
  rowOf.set(id, i);
  return i;
}

function hide(i) {
  mesh.setMatrixAt(i, HIDE);
  mesh.setColorAt(i, _white);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
}

// Called once per live actor per frame, from that actor's own render sync():
// `s`/`y` are the actor's SIM position (never a render-only depth wobble —
// the shadow follows the ribbon, not a mock-3D breathing offset), and
// `footprintRadius` is that actor's own authored ground footprint (RIG's
// half-width, a wasp's visualRadius, a hound's half-width, …). The drawn
// radius is that value times a [0,1] falloff fraction, so it can never
// exceed the footprint the caller passed in — never a fixed world radius
// this module invents on its own.
export function syncContactShadow(id, s, y, footprintRadius) {
  if (!CONTACT_SHADOWS_ENABLED) return;
  const gTop = groundTopAt(s);
  const p = contactShadowPlacement(s, y, gTop, platforms, CONTACT_SHADOW);
  const i = claim(id);
  if (p.opacity <= 0) { hide(i); return; }
  const pose = towerPose(s, _pose);
  const d = 2 * footprintRadius * p.radiusMult;      // diameter: never past the footprint
  _m.makeRotationY(pose.yaw);
  _m.scale(_scale.set(d, 1, d));
  _m.setPosition(pose.x, p.groundY + Y_LIFT + pose.alt, pose.z);
  mesh.setMatrixAt(i, _m);
  // opacity is faked by lerping the instance color toward white (the
  // multiply identity) rather than toward black (additive's identity) —
  // this is the multiply-blend analogue of src/render/fx.js's per-instance
  // alpha trick, so the whole pool stays one draw call regardless of live count
  mesh.setColorAt(i, _c.copy(_white).lerp(_shadowColor, p.opacity));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
}

// Called from a hostile's/capsule's own removed(): a dead actor's row must
// not keep showing a shadow at its last live position. RIG never calls this
// (one row, one lifetime, never removed) — see src/render/player.js.
export function releaseContactShadow(id) {
  if (!CONTACT_SHADOWS_ENABLED) return;
  const i = rowOf.get(id);
  if (i === undefined) return;
  rowOf.delete(id);
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
  return { enabled: CONTACT_SHADOWS_ENABLED, live: rowOf.size, max: POOL_MAX };
}
