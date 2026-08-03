import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { CONFIG } from '../../src/config.js';
import { buildLevel } from '../../src/pure/generator.js';
import {
  limbBakePlan, limbFoldBridgeVisible,
} from '../../src/pure/limb.js';
import { BEND_S } from '../../src/pure/path.js';
import { counts, ok, srcDir, stripComments } from './_context.mjs';

export const title = 'limb fold bridge is local to the shared chamfer';

const BRIDGE_KINDS = new Set(['kerb', 'lipScute']);

function touchesChamfer(piece, bend) {
  const half = CONFIG.path.chamferTiles / 2;
  return piece.s + piece.w / 2 >= bend - half - 1e-9 &&
    piece.s - piece.w / 2 <= bend + half + 1e-9;
}

export async function run() {
  const plan = limbBakePlan(CONFIG, buildLevel(CONFIG).groundH);
  const bridges = plan.filter((piece) => BRIDGE_KINDS.has(piece.kind));
  ok(bridges.length > 400,
     `regression exercises the full route-edge armour population (${bridges.length} pieces)`);

  // Opening-frame failure that triggered this test: all 73 bridge pieces on
  // facet 1 used to bypass behindFold. Only the pieces physically touching
  // the first chamfer may now accompany camera facet 0.
  const incoming = bridges.filter((piece) => piece.facet === 1);
  const incomingVisible = incoming.filter((piece) =>
    limbFoldBridgeVisible(piece, 0, BEND_S, CONFIG.path.chamferTiles));
  ok(incoming.length === 73,
     `first incoming facet contains the measured 73 kerb/lip pieces (got ${incoming.length})`);
  ok(incomingVisible.length === 4,
     `opening facet exposes only four bend-local incoming pieces, not all 73 (got ${incomingVisible.length})`);
  ok(incomingVisible.every((piece) => touchesChamfer(piece, BEND_S[0])),
     'every incoming exception physically intersects the exact two-tile chamfer');
  ok(incoming.filter((piece) => !touchesChamfer(piece, BEND_S[0])).every((piece) =>
    !limbFoldBridgeVisible(piece, 0, BEND_S, CONFIG.path.chamferTiles)),
     'every non-chamfer piece on the adjacent face stays behind the fold');

  // Camera ownership remains complete on every facet; this change only
  // narrows the adjacent exception and cannot punch holes in active anatomy.
  for (let facet = 0; facet <= CONFIG.path.faces; facet++) {
    const owned = bridges.filter((piece) => piece.facet === facet);
    ok(owned.length > 0 && owned.every((piece) =>
      limbFoldBridgeVisible(piece, facet, BEND_S, CONFIG.path.chamferTiles)),
       `camera facet ${facet} retains its complete kerb/lip anatomy`);
    ok(bridges.filter((piece) => Math.abs(piece.facet - facet) > 1).every((piece) =>
      !limbFoldBridgeVisible(piece, facet, BEND_S, CONFIG.path.chamferTiles)),
       `camera facet ${facet} exposes no remote bridge pieces`);
  }

  // The physical seam is identical on both sides of the camera detent. Every
  // piece touching the first shared chamfer survives immediately before and
  // after handoff, while ownership of the rest swaps cleanly.
  const seam = bridges.filter((piece) =>
    (piece.facet === 0 || piece.facet === 1) && touchesChamfer(piece, BEND_S[0]));
  ok(seam.length === 6 && seam.every((piece) =>
    limbFoldBridgeVisible(piece, 0, BEND_S, CONFIG.path.chamferTiles) &&
    limbFoldBridgeVisible(piece, 1, BEND_S, CONFIG.path.chamferTiles)),
     `the same six physical seam pieces survive both sides of handoff (got ${seam.length})`);

  const limbSrc = stripComments(readFileSync(join(srcDir, 'render', 'limb.js'), 'utf8'));
  ok(/limbFoldBridgeVisible\(piece,\s*cameraFacet,\s*BEND_S,\s*CONFIG\.path\.chamferTiles\)/.test(limbSrc) &&
     /piece\.facet\s*!==\s*cameraFacet\s*&&\s*!bridgeVisible/.test(limbSrc),
     'render culling uses the measured bend-local bridge predicate in behindFold');
  ok(!/!FOLD_BRIDGE_KINDS\.has\(piece\.kind\)\s*&&\s*piece\.facet\s*!==\s*cameraFacet/.test(limbSrc),
     'the old whole-adjacent-facet exemption is absent');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await run();
  const result = counts();
  console.log(`limb-fold-bridge-locality: ${result.passes} passed, ${result.fails} failed`);
  if (result.fails) process.exitCode = 1;
}
