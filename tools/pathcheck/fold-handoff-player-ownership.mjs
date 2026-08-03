import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG } from '../../src/config.js';
import {
  BEND_S, DEG, HALT_S, SEGS, facetAtBends, yawAt,
} from '../../src/pure/path.js';
import { cornerApproachReady, cornerJointRule } from '../../src/pure/waves.js';
import { near, ok, srcDir, stripComments } from './_context.mjs';

export const title = 'fold handoff keeps RIG owned without leaking the old facet';

function clampCenterToRule(x, rule, halfWidth) {
  x = Math.min(x, rule.frontierRight - halfWidth);
  x = Math.max(x, rule.sealLeft + halfWidth);
  return x;
}

export async function run() {
  const halfWidth = CONFIG.player.width / 2;
  const cornerS = BEND_S[0] - CONFIG.path.chamferTiles / 2;
  const bendS = BEND_S[0];
  const haltS = HALT_S[0];

  ok(haltS === 75 && bendS === 90,
     'fold regression exercises the worst-case first-gate halt (75) and bend (90)');

  // Killing the gate while RIG is parked at HALT_S must never start a timed
  // camera handoff. A stationary player may wait forever and remains owned by
  // the same facet as the camera.
  let state = 'approach';
  const parkedX = haltS;
  for (let frame = 0; frame < 10000; frame++)
    if (cornerApproachReady(state, parkedX, bendS)) state = 'turning';
  ok(state === 'approach',
     'a stationary RIG left of the bend cannot time into an invisible handoff');
  ok(facetAtBends(parkedX, BEND_S) === 0,
     'the parked RIG remains on the departing facet while the camera remains there');

  const approach = cornerJointRule(
    'approach', cornerS, bendS, halfWidth, CONFIG.edges.margin,
  );
  near(approach.frontierRight - halfWidth, bendS, 1e-12,
       'the cleared arena opens exactly to the chamfer midpoint');
  ok(approach.sealLeft === -Infinity &&
     !cornerApproachReady('approach', bendS - 0.001, bendS) &&
     cornerApproachReady('approach', bendS, bendS),
     'the ritual starts on physical arrival, never before it');

  // Once physical traversal reaches BEND_S, the joint is a zero-width route
  // lock for the orbit. Forward drive and left input both resolve to the same
  // centre, so camera progress cannot create a cross-facet player state.
  const turning = cornerJointRule(
    'turning', cornerS, bendS, halfWidth, CONFIG.edges.margin,
  );
  near(clampCenterToRule(bendS - 8, turning, halfWidth), bendS, 1e-12,
       'the turning joint rejects retreat to the departing facet');
  near(clampCenterToRule(bendS + 8, turning, halfWidth), bendS, 1e-12,
       'the turning joint rejects advance onto unbuilt arriving terrain');
  ok(turning.jointOwned && facetAtBends(bendS, BEND_S) === 1,
     'at camera handoff the joint-owned RIG already belongs to the arriving facet');

  // The chamfer pose is halfway between the two detents. Its outward normal is
  // front-facing from both endpoints, so the joint exception cannot recreate
  // the mirrored paper actor that the facet cull removed.
  const jointYaw = yawAt(SEGS, bendS, CONFIG.path.yawBlendTiles);
  const arrivingYaw = 2 * CONFIG.path.turnDeg * DEG * CONFIG.path.turnSign;
  near(jointYaw, arrivingYaw / 2, 1e-12,
       'RIG uses the physical 30-degree chamfer pose during the orbit');
  ok(Math.cos(jointYaw) > 0 && Math.cos(arrivingYaw - jointYaw) > 0,
     'the chamfer pose presents its front side to both camera detents');

  const done = cornerJointRule(
    'done', cornerS, bendS, halfWidth, CONFIG.edges.margin,
  );
  near(clampCenterToRule(bendS - 8, done, halfWidth), bendS, 1e-12,
       'the completed bend remains a one-way seal after camera commit');

  // Static wiring: only the player receives the narrow joint exception.
  // Projectiles and proud world props must continue to use strict camera-facet
  // ownership, or the original behind-the-fold leak returns.
  const wavegate = stripComments(readFileSync(join(srcDir, 'sim', 'wavegate.js'), 'utf8'));
  const simPlayer = stripComments(readFileSync(join(srcDir, 'sim', 'player.js'), 'utf8'));
  const renderPlayer = stripComments(readFileSync(join(srcDir, 'render', 'player.js'), 'utf8'));
  const bullets = stripComments(readFileSync(join(srcDir, 'render', 'bullets.js'), 'utf8'));
  const level = stripComments(readFileSync(join(srcDir, 'render', 'level.js'), 'utf8'));

  ok(/c\.state\s*=\s*'approach'/.test(wavegate) &&
     /advanceCornerApproach\(player\.x\)/.test(simPlayer),
     'gate clear enters approach and real player traversal starts the ritual');
  ok(/cornerPlayerRouteWindow\(player\.hw\)/.test(simPlayer) &&
     /Math\.max\(transformSealX\(\),\s*cornerWindow\.sealLeft\)/.test(simPlayer),
     'the live player composes the corner frontier/seal with existing route constraints');
  ok(/turningCornerOwnsJoint\(player\.x\)/.test(renderPlayer) &&
     /facetAtBends\(player\.x,\s*BEND_S\)\s*===\s*cameraFacingFacet\(\)/.test(renderPlayer),
     'RIG uses a joint-only exception and strict facet ownership everywhere else');
  ok(/facetAtBends\(s,\s*PROJECTILE_BENDS\)\s*===\s*visibleProjectileFacet\(\)/.test(bullets) &&
     !/turningCornerOwnsJoint/.test(bullets),
     'projectiles remain strictly culled to the camera-facing facet');
  ok(/row\.facet\s*===\s*active/.test(level) &&
     !/turningCornerOwnsJoint/.test(level),
     'proud world props remain strictly culled to the camera-facing facet');
}
