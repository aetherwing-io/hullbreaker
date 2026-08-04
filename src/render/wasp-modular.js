/* Shared geometry for a two-layer wasp: one body state and one independent
   wing phase, both anchored at the exact reactor centre. */

import * as THREE from 'three';
import { primitiveBox } from './sprite-table.js';
import { waspModularTexture } from './wasp-modular-art.js';
import { applySpriteUnderside } from './sprite-grounding.js';
import { WASP_MODULAR_SPEC } from './wasp-modular-spec.js';

function geometryFor(component) {
  const box = primitiveBox('wasp');
  const scale = box.w / WASP_MODULAR_SPEC.referenceInkWidthPx;
  const [, , pxW, pxH] = component.packedRectPx;
  const [anchorX, anchorY] = component.packedAnchorLocalPx;
  const geo = new THREE.PlaneGeometry(pxW * scale, pxH * scale);
  // Source y points down; PlaneGeometry y points up. Translate the detected
  // reactor/root to local (0,0), so body state and wing phase can vary freely.
  geo.translate((pxW / 2 - anchorX) * scale,
    (anchorY - pxH / 2) * scale, 0);
  const [u0, v0Top, u1, v1Top] = component.uv;
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    uv.setXY(i, u0 + u * (u1 - u0), 1 - v1Top + v * (v1Top - v0Top));
  }
  uv.needsUpdate = true;
  geo.userData.waspModularLayer = component.layer;
  geo.userData.waspModularId = component.id;
  geo.userData.waspModularSourceIndex = component.sourceIndex;
  applySpriteUnderside(geo, component.layer === 'body' ? 0.84 : 0.94);
  return Object.freeze({ id: component.id, index: component.phase ?? null, geo });
}

const texture = waspModularTexture();
const bundle = texture ? Object.freeze({
  tex: texture,
  body: Object.freeze(WASP_MODULAR_SPEC.bodyStates.map(geometryFor)),
  wings: Object.freeze(WASP_MODULAR_SPEC.wingPhases.map(geometryFor)),
  combinations: WASP_MODULAR_SPEC.bodyStates.length * WASP_MODULAR_SPEC.wingPhases.length,
}) : null;

export function waspModularBundle() { return bundle; }

export function waspModularRuntimeSnapshot() {
  return {
    ready: !!bundle,
    bodyStates: bundle?.body.length || 0,
    wingPhases: bundle?.wings.length || 0,
    combinations: bundle?.combinations || 0,
    sharedGeometries: bundle ? bundle.body.length + bundle.wings.length : 0,
    meshesPerWasp: bundle ? WASP_MODULAR_SPEC.runtime.meshesPerWasp : 0,
    drawCallsPerWasp: bundle ? WASP_MODULAR_SPEC.runtime.drawCallsPerWasp : 0,
    addedDrawCallsPerWasp: bundle ? WASP_MODULAR_SPEC.runtime.addedDrawCallsPerWasp : 0,
    textureCount: bundle ? 1 : 0,
    estimatedGpuBytes: bundle ? WASP_MODULAR_SPEC.runtime.estimatedGpuBytes : 0,
    collisionChanged: false,
    simChanged: false,
    crossfade: false,
  };
}
