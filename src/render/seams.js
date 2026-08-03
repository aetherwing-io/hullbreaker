/* ============================== SEAMS ============================== */
/* The render half of the seam-pip pass (S5, docs/proposals/2026-08-look-
   direction.md §3): two fixed InstancedMeshes baked ONCE from the runs
   src/pure/seams.js derives. Their intensity never animates; only render
   ownership swaps base matrices for HIDE when a route face is not current.

   STATIC INTENSITY ONLY — no travel, no pulse, no chase, per the packet's
   own correction. The ownership update below reads no clock and changes no
   colour/intensity: pathcheck retains the static-anatomy guard (no
   `installView` call, no `view.` reference, no gameMs/tMs/dt), which
   mechanically forbids an animated version arriving later by accident.

   Two pools, the merged T-011 idiom src/render/fx.js already ships
   (src/render/fx.js:106-135), with ONE deliberate deviation — see the
   halo material below for why:
     - a small opaque box on the pip token (the core)
     - one additive halo pool: AdditiveBlending, depthWrite:false,
       fog:true (fx.js's pools use fog:false — this one does not, on
       purpose), renderOrder 2, no material color (instanceColor IS the
       color, so the pool stays one draw call)
   Both are sized once and never resized: total instance count is exactly
   the pip count src/pure/seams.js computes for the active level, which is
   deterministic for a given CONFIG and slice.

   ON by default (decisions.md entry 16): absent, '' and junk all arm the
   pass; `?seams=0` is the escape hatch back to the pre-pass look for
   comparison.

   SCOPE: deck-edge and catwalk pips only (src/sim/level.js's groundH and
   platforms, both already read-only exports). The ?g1=1 limb's scute/kerb
   seam boundaries are the packet's third input and are NOT covered here —
   that would touch src/render/limb.js and src/pure/limb.js, both fenced to
   a concurrent lane this cycle. See the build report. This module also
   builds nothing under the transformation slice: that slice draws its own
   band geometry (src/render/transform.js) and src/render/level.js skips
   its own tile bake there for the same reason (S6's carried correction) —
   sim groundH need not coincide with the drawn floor, so a pip line would
   risk advertising a ledge the transform slice never drew. */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { normalAscentAltAt, normalAscentPitchAt } from '../pure/ascent.js';
import { SEGS, polyAt, headingAt } from '../pure/path.js';
import { deckSeamRuns, depthGain, platformSeamRuns, SEAMS, resolveSeams } from '../pure/seams.js';
import { groundH, platforms } from '../sim/level.js';
import { ACTIVE_FIXTURE, QUERY, IS_TRANSFORM_SLICE } from '../mode.js';
import { PAL } from './palette.js';
import { PIP_GAIN } from './legibility.js';
import { scene, HIDE } from './scene.js';
import { routeRenderable, routeVisibilityStamp } from './route-visibility.js';

export const SEAMS_ENABLED = resolveSeams(QUERY.get('seams'));

const _m = new THREE.Matrix4();
const _rot = new THREE.Matrix4();
const _pitch = new THREE.Matrix4();
const normalRunAltAt = (s) => ACTIVE_FIXTURE ? 0 : normalAscentAltAt(s, CONFIG.levelLength);
const normalRunPitchAt = (s) => ACTIVE_FIXTURE ? 0 : normalAscentPitchAt(s, CONFIG.levelLength);

// One matrix per pip: sharp per-column facing plus the deck's ascent pitch
// (the world is baked, not
// posed per frame), same math src/render/level.js's tile bake and
// src/render/tower.js's placeSharp both use — outward offset rides the
// heading-rotated local z axis, positive = toward the camera.
function bakeMatrix(s, y, depth, size) {
  const p = polyAt(SEGS, s);
  const yaw = headingAt(SEGS, s);
  _rot.makeRotationY(yaw);
  if (!ACTIVE_FIXTURE) _rot.multiply(_pitch.makeRotationZ(normalRunPitchAt(s)));
  _m.copy(_rot);
  _m.scale(new THREE.Vector3(size, size, size));
  _m.setPosition(
    p.x + Math.sin(yaw) * depth,
    y + normalRunAltAt(s),
    p.z + Math.cos(yaw) * depth
  );
  return _m;
}

let pipMesh = null, haloMesh = null, pipCount = 0;
let pipRows = [];
const pipBaseMatrices = [];
const haloBaseMatrices = [];
let seamCullStamp = '';
let seamHidden = 0;

// The all-route seam pools stay allocated and resident, but a future-face
// pip has a zero matrix until both its column and camera facet are committed.
// No pulse/time input enters this pass; the seam language remains static.
export function updateSeamFoldCull() {
  if (!pipMesh || !haloMesh) return;
  const stamp = routeVisibilityStamp();
  if (stamp === seamCullStamp) return;
  seamCullStamp = stamp;
  seamHidden = 0;
  for (let i = 0; i < pipRows.length; i++) {
    const visible = routeRenderable(pipRows[i].s);
    pipMesh.setMatrixAt(i, visible ? pipBaseMatrices[i] : HIDE);
    haloMesh.setMatrixAt(i, visible ? haloBaseMatrices[i] : HIDE);
    if (!visible) seamHidden++;
  }
  pipMesh.instanceMatrix.needsUpdate = true;
  haloMesh.instanceMatrix.needsUpdate = true;
}

if (SEAMS_ENABLED && !IS_TRANSFORM_SLICE) {
  const runs = deckSeamRuns(groundH, SEAMS).concat(platformSeamRuns(platforms, SEAMS));
  const pips = [];                                      // {s, y, depth}
  for (const run of runs) {
    const depth = run.kind === 'deck' ? SEAMS.deckDepth : SEAMS.platformDepth;
    for (const pip of run.pips) pips.push({ s: pip.s, y: pip.y, depth });
  }
  pipCount = pips.length;
  pipRows = pips;

  if (pipCount > 0) {
    const pipSize = SEAMS.pipSize * PIP_GAIN;
    const haloSize = SEAMS.haloSize * PIP_GAIN;

    const coreMat = new THREE.MeshBasicMaterial({ color: PAL.seamPip, fog: true });
    pipMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), coreMat, pipCount);
    pipMesh.frustumCulled = false;

    // no material `color` here on purpose: the default white is the
    // identity instanceColor multiplies, so the per-instance role color
    // IS the color — the exact fx.js idiom (fx.js:105-107), with ONE
    // deliberate deviation from "verbatim": `fog: true`, not `fog: false`.
    // fx.js's pools are short-lived and player-proximate, so whether they
    // fade with fog never matters. This pool is the first STATIC,
    // whole-level bake: 307 pips are scattered across all 445 tiles, and
    // the run scrolls the camera past every one of them at some point, so
    // "distance from camera" varies continuously per pip over the course
    // of a run — there is no fixed depth to pre-attenuate by at bake time
    // the way the packet's risk note asks for (S5's own risk: "additive
    // quads with fog:false never recede, so distant pips must be
    // pre-attenuated by depth at bake time"). `fog: true` is the
    // mechanically simple, provably-correct answer instead: it fades the
    // additive contribution toward `scene.fog.color` by the SAME
    // per-frame distance the deck/limb tiles around it already fade by
    // (their own materials are `fog: true`, the three.js default), so a
    // pip at the fog-far edge recedes exactly in lockstep with the
    // surface it rides rather than blazing through the haze alone — and
    // it stays correct automatically if the fog band is retuned (S2)
    // later, where a hand-baked constant would not.
    const haloMat = new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0.58, fog: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    haloMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.5), haloMat, pipCount);
    haloMesh.frustumCulled = false;
    haloMesh.renderOrder = 2;

    // Bake-time depth attenuation (src/pure/seams.js's depthGain — see the
    // long comment there): the halo's per-instance color is the token
    // scaled by how proud of its surface that specific pip sits, so a
    // shallower-depth tier reads measurably dimmer even before fog ever
    // applies. `_base` is read once; `_c` is the scratch every instance
    // reuses (setColorAt copies its value into the buffer immediately).
    const _base = new THREE.Color(PAL.seamHalo);
    const _c = new THREE.Color();
    for (let i = 0; i < pipCount; i++) {
      const pip = pips[i];
      const pipMatrix = bakeMatrix(pip.s, pip.y, pip.depth, pipSize).clone();
      const haloMatrix = bakeMatrix(pip.s, pip.y, pip.depth, haloSize).clone();
      pipBaseMatrices.push(pipMatrix);
      haloBaseMatrices.push(haloMatrix);
      pipMesh.setMatrixAt(i, pipMatrix);
      haloMesh.setMatrixAt(i, haloMatrix);
      _c.copy(_base).multiplyScalar(depthGain(pip.depth, SEAMS));
      haloMesh.setColorAt(i, _c);
    }
    pipMesh.instanceMatrix.needsUpdate = true;
    haloMesh.instanceMatrix.needsUpdate = true;
    haloMesh.instanceColor.needsUpdate = true;
    scene.add(pipMesh);
    scene.add(haloMesh);
    updateSeamFoldCull();
  }
}

// read-only debug/telemetry surface (see window.HB and ?testapi=1)
export function seamsStats() {
  return { enabled: SEAMS_ENABLED, pipCount, hidden: seamHidden };
}
