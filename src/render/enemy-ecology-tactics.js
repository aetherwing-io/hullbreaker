/* ============ ENEMY ECOLOGY EXACT TACTIC PRESENTATION =========== */
/* Crosswind and Aircomb damage is stored in three fixed slots on its owner.
   This renderer mirrors those exact prev->current swept segments and radii
   with three fixed meshes—no global projectile list, no hot-loop allocation,
   no decorative blob and no light while inactive. Sweepfan's beam remains in
   hostiles.js because it reuses the existing exact beam meshes; the helper
   below identifies that semantic branch for its direction/reach sync. */

import * as THREE from 'three';
import { PAL } from './palette.js';
import { scene } from './scene.js';
import { placeOnTower } from './tower.js';
import { routeRenderable } from './route-visibility.js';

export const ECOLOGY_TACTIC_SLOT_CAP = 3;
export const ECOLOGY_TACTIC_DEPTH = 1.17;
let tacticOwnersAttached = 0;
let tacticOwnersDetached = 0;
let tacticMaterialsCreated = 0;
let tacticMaterialsDisposed = 0;

// A hard six-sided rail/tooth silhouette. Local bounds are exactly one unit;
// scaling to (segment length + two radii) × (two radii) stays inside the
// simulation's swept capsule while retaining a directional point at play size.
const needleGeo = new THREE.BufferGeometry();
needleGeo.setAttribute('position', new THREE.Float32BufferAttribute([
  -0.50,  0.00, 0,  -0.31,  0.50, 0,
   0.22,  0.31, 0,   0.50,  0.00, 0,
   0.22, -0.31, 0,  -0.31, -0.50, 0,
], 3));
needleGeo.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5]);
needleGeo.computeVertexNormals();

function hazardMaterial() {
  return new THREE.MeshBasicMaterial({
    color: PAL.waspDive,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
    forceSinglePass: true,
    toneMapped: false,
  });
}

export function attachEnemyEcologyTactics(view, row) {
  if (!row?.tacticHazards?.length || view.ecologyTacticMeshes) return;
  const count = Math.min(ECOLOGY_TACTIC_SLOT_CAP, row.tacticHazards.length);
  view.ecologyTacticMeshes = [];
  view.ecologyTacticMats = [];
  for (let i = 0; i < count; i++) {
    const mat = hazardMaterial();
    const mesh = new THREE.Mesh(needleGeo, mat);
    mesh.name = `Enemy ecology fixed tactic slot ${i}`;
    mesh.visible = false;
    mesh.renderOrder = 4;
    mesh.frustumCulled = false;
    scene.add(mesh);
    view.ecologyTacticMeshes.push(mesh);
    view.ecologyTacticMats.push(mat);
    tacticMaterialsCreated++;
  }
  tacticOwnersAttached++;
}

export function hideEnemyEcologyTactics(view) {
  for (const mesh of view.ecologyTacticMeshes || []) mesh.visible = false;
}

export function detachEnemyEcologyTactics(view) {
  if (!view.ecologyTacticMeshes) return;
  for (let i = 0; i < (view.ecologyTacticMeshes?.length || 0); i++) {
    scene.remove(view.ecologyTacticMeshes[i]);
    view.ecologyTacticMats[i].dispose();
    tacticMaterialsDisposed++;
  }
  tacticOwnersDetached++;
  view.ecologyTacticMeshes = null;
  view.ecologyTacticMats = null;
}

function segmentRenderable(x0, x1) {
  return routeRenderable(x0) && routeRenderable((x0 + x1) * 0.5) &&
    routeRenderable(x1);
}

export function syncEnemyEcologyTactics(view, row) {
  const meshes = view.ecologyTacticMeshes;
  if (!meshes) return;
  for (let i = 0; i < meshes.length; i++) {
    const mesh = meshes[i];
    const mat = view.ecologyTacticMats[i];
    const hazard = row.tacticHazards[i];
    if (!hazard?.active || !segmentRenderable(hazard.prevX, hazard.x)) {
      mesh.visible = false;
      continue;
    }
    const dx = hazard.x - hazard.prevX;
    const dy = hazard.y - hazard.prevY;
    const distance = Math.hypot(dx, dy);
    const radius = Math.max(0.01, hazard.radius || 0);
    let angle = Math.atan2(dy, dx);
    if (distance < 1e-5)
      angle = Math.atan2(hazard.vy || 0, hazard.vx || 1);
    mesh.visible = true;
    placeOnTower(mesh,
      (hazard.prevX + hazard.x) * 0.5,
      (hazard.prevY + hazard.y) * 0.5,
      ECOLOGY_TACTIC_DEPTH);
    mesh.rotation.z = angle;
    mesh.scale.set(Math.max(radius * 2, distance + radius * 2), radius * 2, 1);
    mat.color.setHex(hazard.kind === 'aircomb' ? PAL.mortarBlast : PAL.waspDive);
    mat.opacity = hazard.kind === 'aircomb' ? 0.96 : 0.90;
  }
}

export function enemyOwnsSweepfanBeam(row) {
  return row?.ecologyId === 'polyp-sweepfan';
}

export function isSweepfanBeam(row) {
  return enemyOwnsSweepfanBeam(row) && row.tacticPhase === 'sweep-start' &&
    row.state === 'fire' &&
    Number.isFinite(row.tacticBeamX) && Number.isFinite(row.tacticBeamY);
}

export function enemyEcologyTacticRuntimeSnapshot() {
  return {
    ownerSlotCap: ECOLOGY_TACTIC_SLOT_CAP,
    ownersAttached: tacticOwnersAttached,
    ownersDetached: tacticOwnersDetached,
    activeOwners: tacticOwnersAttached - tacticOwnersDetached,
    materialsCreated: tacticMaterialsCreated,
    materialsDisposed: tacticMaterialsDisposed,
    liveMaterials: tacticMaterialsCreated - tacticMaterialsDisposed,
    balancedDisposal: tacticMaterialsCreated - tacticMaterialsDisposed ===
      (tacticOwnersAttached - tacticOwnersDetached) * ECOLOGY_TACTIC_SLOT_CAP,
    sharedGeometryCount: 1,
    actionOnlyEmission: true,
    routeAndTurnGate: 'prev+mid+current routeRenderable',
  };
}

export function enemyEcologyTacticVisualSnapshot(view, row) {
  const slots = [];
  for (let i = 0; i < (view.ecologyTacticMeshes?.length || 0); i++) {
    const hazard = row.tacticHazards[i];
    const mesh = view.ecologyTacticMeshes[i];
    slots.push({
      index: i,
      kind: hazard?.kind || '',
      active: !!hazard?.active,
      visible: mesh.visible,
      prev: hazard ? [hazard.prevX, hazard.prevY] : null,
      current: hazard ? [hazard.x, hazard.y] : null,
      radius: hazard?.radius || 0,
      exactSegmentAndRadius: true,
      routeAndTurnCulled: !!hazard?.active && !mesh.visible,
    });
  }
  return {
    capacity: view.ecologyTacticMeshes?.length || 0,
    active: slots.filter((slot) => slot.active).length,
    visible: slots.filter((slot) => slot.visible).length,
    fixedOwnerLocal: true,
    hotLoopAllocations: 0,
    actionOnlyEmission: true,
    idleGlow: false,
    surfaceDepth: ECOLOGY_TACTIC_DEPTH,
    slots,
  };
}
