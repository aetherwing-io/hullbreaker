/* ============================== SEAMS ============================== */
/* The render half of the housed route-light pass: three fixed
   InstancedMeshes baked ONCE from the real ledge runs
   src/pure/seams.js derives. Their intensity never animates; only render
   ownership swaps base matrices for HIDE when a route face is not current.

   STATIC INTENSITY ONLY — no travel, no pulse, no chase, per the packet's
   own correction. The ownership update below reads no clock and changes no
   colour/intensity: pathcheck retains the static-anatomy guard (no
   `installView` call, no `view.` reference, no gameMs/tMs/dt), which
   mechanically forbids an animated version arriving later by accident.

   Three fixed pools follow the merged T-011 idiom src/render/fx.js ships:
     - a cold, light-reactive metal housing attached below the route lip;
     - a narrow warm slot inside it; and
     - one low-opacity rectangular surface spill, never an octahedron,
       diamond, additive star or repeated editor marker.
   All are sized once and never resized: total instance count is exactly
   the pip count src/pure/seams.js computes for the active level, which is
   deterministic for a given CONFIG and slice.

   ON by default (decisions.md entry 16): absent, '' and junk all arm the
   pass; `?seams=0` is the escape hatch back to the pre-pass look for
   comparison.

   SCOPE: deck-edge and selected long-catwalk fixtures only
   (src/sim/level.js's groundH and
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
const SEAM_LAYOUT = SEAMS;

const _m = new THREE.Matrix4();
const _rot = new THREE.Matrix4();
const _pitch = new THREE.Matrix4();
const _scale = new THREE.Vector3();
const normalRunAltAt = (s) => ACTIVE_FIXTURE ? 0 : normalAscentAltAt(s, CONFIG.levelLength);
const normalRunPitchAt = (s) => ACTIVE_FIXTURE ? 0 : normalAscentPitchAt(s, CONFIG.levelLength);

// One matrix per fixture layer: sharp per-column facing plus the deck's ascent pitch
// (the world is baked, not
// posed per frame), same math src/render/level.js's tile bake and
// src/render/tower.js's placeSharp both use — outward offset rides the
// heading-rotated local z axis, positive = toward the camera.
function bakeMatrix(s, y, depth, sx, sy, sz) {
  const p = polyAt(SEGS, s);
  const yaw = headingAt(SEGS, s);
  _rot.makeRotationY(yaw);
  if (!ACTIVE_FIXTURE) _rot.multiply(_pitch.makeRotationZ(normalRunPitchAt(s)));
  _m.copy(_rot);
  _m.scale(_scale.set(sx, sy, sz));
  _m.setPosition(
    p.x + Math.sin(yaw) * depth,
    y + normalRunAltAt(s),
    p.z + Math.cos(yaw) * depth
  );
  return _m;
}

let housingMesh = null, coreMesh = null, spillMesh = null, pipCount = 0;
let pipRows = [];
const housingBaseMatrices = [];
const pipBaseMatrices = [];
const haloBaseMatrices = [];
let seamCullStamp = '';
let seamHidden = 0;

// The all-route seam pools stay allocated and resident, but a future-face
// fixture has a zero matrix until both its column and camera facet are committed.
// No pulse/time input enters this pass; the seam language remains static.
export function updateSeamFoldCull() {
  if (!housingMesh || !coreMesh || !spillMesh) return;
  const stamp = routeVisibilityStamp();
  if (stamp === seamCullStamp) return;
  seamCullStamp = stamp;
  seamHidden = 0;
  for (let i = 0; i < pipRows.length; i++) {
    const visible = routeRenderable(pipRows[i].s);
    housingMesh.setMatrixAt(i, visible ? housingBaseMatrices[i] : HIDE);
    coreMesh.setMatrixAt(i, visible ? pipBaseMatrices[i] : HIDE);
    spillMesh.setMatrixAt(i, visible ? haloBaseMatrices[i] : HIDE);
    if (!visible) seamHidden++;
  }
  housingMesh.instanceMatrix.needsUpdate = true;
  coreMesh.instanceMatrix.needsUpdate = true;
  spillMesh.instanceMatrix.needsUpdate = true;
}

if (SEAMS_ENABLED && !IS_TRANSFORM_SLICE) {
  const runs = deckSeamRuns(groundH, SEAM_LAYOUT)
    .concat(platformSeamRuns(platforms, SEAM_LAYOUT));
  const pips = [];                                      // {s, y, depth, kind}
  for (const run of runs) {
    const depth = run.kind === 'deck' ? SEAM_LAYOUT.deckDepth : SEAM_LAYOUT.platformDepth;
    for (const pip of run.pips) pips.push({ s: pip.s, y: pip.y, depth, kind: run.kind });
  }
  pipCount = pips.length;
  pipRows = pips;

  if (pipCount > 0) {
    // These are world fixtures, not gameplay cues.  Restore only a fraction
    // of the FAR pull-back so the housing remains legible without ballooning
    // into the floating white bars the full cue gain produced.
    const gain = 1 + (PIP_GAIN - 1) * 0.32;
    const housingMat = new THREE.MeshStandardMaterial({
      color: PAL.limb.shadow,
      roughness: 0.52,
      metalness: 0.42,
      fog: true,
    });
    housingMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1), housingMat, pipCount,
    );
    housingMesh.name = 'Meridian housed route luminaires';
    housingMesh.userData.environmentRole = 'route-lamp-housing';
    housingMesh.frustumCulled = false;

    const coreMat = new THREE.MeshBasicMaterial({
      color: PAL.seamPip, fog: true, toneMapped: true,
    });
    coreMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1), coreMat, pipCount,
    );
    coreMesh.name = 'Meridian route luminaire slots';
    coreMesh.userData.environmentRole = 'route-lamp-core';
    coreMesh.frustumCulled = false;

    // The spill is ordinary alpha, not additive bloom geometry. Fog therefore
    // grades it with the surface it belongs to and it cannot blaze through a
    // distant facet like the old octahedral halos did.
    const haloMat = new THREE.MeshBasicMaterial({
      color: PAL.seamHalo,
      transparent: true, opacity: 0.07, fog: true,
      blending: THREE.NormalBlending, depthWrite: false,
      toneMapped: true,
    });
    spillMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1), haloMat, pipCount,
    );
    spillMesh.name = 'Meridian route luminaire surface spill';
    spillMesh.userData.environmentRole = 'route-lamp-surface-spill';
    spillMesh.frustumCulled = false;
    spillMesh.renderOrder = 2;

    // Every transform is baked; the visibility hot path only swaps fixed
    // matrices when the camera commits a route facet.
    for (let i = 0; i < pipCount; i++) {
      const pip = pips[i];
      const housingMatrix = bakeMatrix(
        pip.s, pip.y, pip.depth,
        SEAMS.housingWidth * gain,
        SEAMS.housingHeight * gain,
        SEAMS.housingDepth,
      ).clone();
      const pipMatrix = bakeMatrix(
        pip.s, pip.y + 0.012, pip.depth + SEAMS.housingDepth * 0.52,
        SEAMS.coreWidth * gain,
        SEAMS.coreHeight * gain,
        0.035,
      ).clone();
      const haloMatrix = bakeMatrix(
        pip.s, pip.y - SEAMS.spillHeight * 0.28,
        pip.depth + SEAMS.housingDepth * 0.56,
        SEAMS.spillWidth * gain,
        SEAMS.spillHeight * gain,
        0.012,
      ).clone();
      housingBaseMatrices.push(housingMatrix);
      pipBaseMatrices.push(pipMatrix);
      haloBaseMatrices.push(haloMatrix);
      housingMesh.setMatrixAt(i, housingMatrix);
      coreMesh.setMatrixAt(i, pipMatrix);
      spillMesh.setMatrixAt(i, haloMatrix);
      // Depth attenuation belongs to the material opacity rather than a
      // per-instance star color now; the two fixture tiers are close, but the
      // value remains exercised in stats/pathcheck for compatibility.
      void depthGain(pip.depth, SEAM_LAYOUT);
    }
    housingMesh.instanceMatrix.needsUpdate = true;
    coreMesh.instanceMatrix.needsUpdate = true;
    spillMesh.instanceMatrix.needsUpdate = true;
    scene.add(housingMesh);
    scene.add(coreMesh);
    scene.add(spillMesh);
    updateSeamFoldCull();
  }
}

// read-only debug/telemetry surface (see window.HB and ?testapi=1)
export function seamsStats() {
  return {
    enabled: SEAMS_ENABLED,
    pipCount,
    hidden: seamHidden,
    fixtureCount: pipCount,
    grammar: 'housed-slots',
    pipEvery: SEAM_LAYOUT.pipEvery,
    clusterGap: SEAM_LAYOUT.clusterGap || 0,
  };
}
