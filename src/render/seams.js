/* ============================== SEAMS ============================== */
/* The render half of the seam-pip pass (S5, docs/proposals/2026-08-look-
   direction.md §3): two fixed InstancedMeshes baked ONCE from the runs
   src/pure/seams.js derives, and never touched again.

   STATIC INTENSITY ONLY — no travel, no pulse, no chase, per the packet's
   own correction. There is no update function in this file and none is
   wired anywhere: pathcheck mirrors the same static-anatomy guard it
   already runs on src/render/limb.js onto this module (no `installView`
   call, no `view.` reference, no gameMs/tMs/dt), which mechanically
   forbids an animated version arriving later by accident.

   Two pools, exactly the merged T-011 idiom src/render/fx.js already
   ships (src/render/fx.js:106-135), verbatim:
     - a small opaque box on the pip token (the core)
     - one additive halo pool: AdditiveBlending, depthWrite:false,
       fog:false, renderOrder 2, no material color (instanceColor IS the
       color, so the pool stays one draw call)
   Both are sized once and never resized: total instance count is exactly
   the pip count src/pure/seams.js computes for the active level, which is
   deterministic for a given CONFIG and slice.

   ?seams=1 arms the pass; absent (every shipped URL today) builds nothing
   at all, per CLAUDE.md's "prototypes ship behind query flags, off by
   default" — this has not had an operator checkpoint yet.

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
import { SEGS, polyAt, headingAt } from '../pure/path.js';
import { deckSeamRuns, platformSeamRuns, SEAMS, resolveSeams } from '../pure/seams.js';
import { groundH, platforms } from '../sim/level.js';
import { QUERY, IS_TRANSFORM_SLICE } from '../mode.js';
import { PAL } from './palette.js';
import { PIP_GAIN } from './legibility.js';
import { scene } from './scene.js';

export const SEAMS_ENABLED = resolveSeams(QUERY.get('seams'));

const _m = new THREE.Matrix4();
const _rot = new THREE.Matrix4();

// One matrix per pip: sharp per-column facing (the world is baked, not
// posed per frame), same math src/render/level.js's tile bake and
// src/render/tower.js's placeSharp both use — outward offset rides the
// heading-rotated local z axis, positive = toward the camera.
function bakeMatrix(s, y, depth, size) {
  const p = polyAt(SEGS, s);
  const yaw = headingAt(SEGS, s);
  _rot.makeRotationY(yaw);
  _m.copy(_rot);
  _m.scale(new THREE.Vector3(size, size, size));
  _m.setPosition(p.x + Math.sin(yaw) * depth, y, p.z + Math.cos(yaw) * depth);
  return _m;
}

let pipMesh = null, haloMesh = null, pipCount = 0;

if (SEAMS_ENABLED && !IS_TRANSFORM_SLICE) {
  const runs = deckSeamRuns(groundH, SEAMS).concat(platformSeamRuns(platforms, SEAMS));
  const pips = [];                                      // {s, y, depth}
  for (const run of runs) {
    const depth = run.kind === 'deck' ? SEAMS.deckDepth : SEAMS.platformDepth;
    for (const pip of run.pips) pips.push({ s: pip.s, y: pip.y, depth });
  }
  pipCount = pips.length;

  if (pipCount > 0) {
    const pipSize = SEAMS.pipSize * PIP_GAIN;
    const haloSize = SEAMS.haloSize * PIP_GAIN;

    const coreMat = new THREE.MeshBasicMaterial({ color: PAL.seamPip, fog: true });
    pipMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), coreMat, pipCount);
    pipMesh.frustumCulled = false;

    // no material `color` here on purpose: the default white is the
    // identity instanceColor multiplies, so the per-instance role color
    // IS the color — the exact fx.js idiom (fx.js:105-107).
    const haloMat = new THREE.MeshBasicMaterial({
      transparent: true, opacity: 1, fog: false,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    haloMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.5), haloMat, pipCount);
    haloMesh.frustumCulled = false;
    haloMesh.renderOrder = 2;

    const _c = new THREE.Color(PAL.seamHalo);
    for (let i = 0; i < pipCount; i++) {
      const pip = pips[i];
      pipMesh.setMatrixAt(i, bakeMatrix(pip.s, pip.y, pip.depth, pipSize));
      haloMesh.setMatrixAt(i, bakeMatrix(pip.s, pip.y, pip.depth, haloSize));
      haloMesh.setColorAt(i, _c);
    }
    pipMesh.instanceMatrix.needsUpdate = true;
    haloMesh.instanceMatrix.needsUpdate = true;
    haloMesh.instanceColor.needsUpdate = true;
    scene.add(pipMesh);
    scene.add(haloMesh);
  }
}

// read-only debug/telemetry surface (see window.HB and ?testapi=1)
export function seamsStats() {
  return { enabled: SEAMS_ENABLED, pipCount };
}
