/* Opaque surface depth-layer contract.
 *
 * The lower-hull shimmer investigation exposed a broader ownership bug:
 * coplanar exceptions were being solved independently in limb, level,
 * contact-shadow and hostile presentation code. This domain keeps the shared
 * physical/raster policy centralized and proves that the repeated hull lobes
 * which intentionally overlap cannot land in the same physical lane. */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG } from '../../src/config.js';
import { limbChunkRanges, limbFacets } from '../../src/pure/limb.js';
import {
  COMPONENT_DEPTH_LAYER,
  DEPTH_QUANTUM,
  PHYSICAL_DEPTH_LAYER,
  RASTER_DEPTH_LAYER,
  depthLayerSlot,
  physicalDepthOffset,
} from '../../src/render/depth-layers.js';
import { ok, srcDir, stripComments } from './_context.mjs';

export const title = 'opaque surface depth layers: one physical/raster contract';

export async function run() {
  ok(CONFIG.camera.near >= 0.5 && CONFIG.camera.far / CONFIG.camera.near <= 400,
     `camera depth range keeps useful precision (${CONFIG.camera.near}/${CONFIG.camera.far})`);
  ok(DEPTH_QUANTUM === 0.002,
     'depth layers retain the audited 0.002-world-unit FAR/MSAA quantum');

  const componentOrder = [
    'trim-cap', 'beam-brace', 'ladder-rail', 'pipe-conduit',
    'service-organ', 'defense-state', 'scuttle-damage', 'near-silhouette',
  ];
  let priorMax = -Infinity;
  for (const category of componentOrder) {
    const layer = COMPONENT_DEPTH_LAYER[category];
    const min = physicalDepthOffset(layer, 0);
    const max = physicalDepthOffset(layer, layer.slots - 1);
    ok(min > priorMax,
       `component depth role ${category} starts beyond the prior role (${min} > ${priorMax})`);
    priorMax = max;
  }

  const hullLayer = PHYSICAL_DEPTH_LAYER.LIMB_HULL_CASTING;
  ok(hullLayer.slots >= 3 && physicalDepthOffset(hullLayer, 1) > 0 &&
     physicalDepthOffset(hullLayer, 2) > physicalDepthOffset(hullLayer, 1),
     'overlapping lower-hull castings own three distinct physical lanes');

  let adjacentPairs = 0;
  let sameLanePairs = 0;
  for (const facet of limbFacets(CONFIG)) {
    const chunks = limbChunkRanges(facet.s0, facet.s1, CONFIG.limb.chunkCols);
    for (let i = 1; i < chunks.length; i++) {
      const prior = depthLayerSlot(i - 1, hullLayer.slots);
      const next = depthLayerSlot(i, hullLayer.slots);
      adjacentPairs++;
      if (prior === next) sameLanePairs++;
    }
  }
  ok(adjacentPairs > 0 && sameLanePairs === 0,
     `all ${adjacentPairs} adjacent played-hull chunk pairs resolve to different depth lanes`);

  ok(RASTER_DEPTH_LAYER.FLUSH_ROUTE_ARMOUR.factor < 0 &&
     RASTER_DEPTH_LAYER.FLUSH_ROUTE_ARMOUR.units < 0,
     'flush route armour has one named raster layer toward the camera');

  const limb = stripComments(readFileSync(join(srcDir, 'render', 'limb.js'), 'utf8'));
  const limbPlan = stripComments(readFileSync(join(srcDir, 'pure', 'limb.js'), 'utf8'));
  const level = stripComments(readFileSync(join(srcDir, 'render', 'level.js'), 'utf8'));
  const contact = stripComments(readFileSync(join(srcDir, 'render', 'contact.js'), 'utf8'));
  const hostiles = stripComments(readFileSync(join(srcDir, 'render', 'hostiles.js'), 'utf8'));
  const scene = stripComments(readFileSync(join(srcDir, 'render', 'scene.js'), 'utf8'));

  ok(/PHYSICAL_DEPTH_LAYER\.LIMB_HULL_CASTING/.test(limb) &&
     /piece\.kind\s*===\s*['"]hull['"]/.test(limb) &&
     /piece\.surfaceDepthOrdinal/.test(limb) &&
     /applyRasterDepthLayer\s*\(/.test(limb) &&
     !/polygonOffset\s*=/.test(limb),
     'limb uses named physical and raster layers instead of local polygon-offset writes');
  ok((limbPlan.match(/surfaceDepthOrdinal\s*=\s*chunkOrdinal/g) || []).length === 2,
     'entry-shoulder and played-facet hull plans both publish stable local depth ordinals');
  ok(/componentDepthOffset\s*\(/.test(level) &&
     /PHYSICAL_DEPTH_LAYER\.FOREGROUND_PACK_INLAY/.test(level) &&
     !/COMPONENT_DEPTH_BIAS/.test(level),
     'level cutouts and pack inlays consume the shared physical layer policy');
  ok(/PHYSICAL_DEPTH_LAYER\.CONTACT_SHADOW/.test(contact),
     'contact shadows consume the shared physical layer policy');
  ok(/PHYSICAL_DEPTH_LAYER\.WASP_WING/.test(hostiles),
     'hinged wasp wings consume the shared physical layer policy');
  ok(/PerspectiveCamera\s*\([\s\S]*CONFIG\.camera\.near[\s\S]*CONFIG\.camera\.far/.test(scene) &&
     !/PerspectiveCamera\s*\([^)]*0\.1\s*,\s*200/.test(scene),
     'the runtime camera consumes the bounded depth range from CONFIG');
}
