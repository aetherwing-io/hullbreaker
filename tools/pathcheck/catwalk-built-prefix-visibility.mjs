import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG } from '../../src/config.js';
import { buildLevel } from '../../src/pure/generator.js';
import { BEND_S, CORNER_S, HALT_S, routeRenderOwned } from '../../src/pure/path.js';
import { cornerYawDeltaDeg } from '../../src/pure/waves.js';
import * as LV from '../../src/sim/level.js';
import { ok, srcDir, stripComments } from './_context.mjs';

export const title = 'long catwalks expose only their built route prefix';

// Evaluate the renderer's tiny arithmetic-only splitter without importing the
// Three.js render module into the Node harness. Braces are balanced so object
// literals inside the function remain part of the extracted implementation.
function extractedFunction(code, name) {
  const start = code.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`missing ${name}`);
  const open = code.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}' && --depth === 0) {
      const source = code.slice(start, i + 1);
      return Function(`"use strict"; return (${source});`)();
    }
  }
  throw new Error(`unterminated ${name}`);
}

export async function run() {
  const level = stripComments(
    readFileSync(join(srcDir, 'render', 'level.js'), 'utf8'),
  );
  const splitPlatform = extractedFunction(level, 'platformBuildSegments');

  // The widest Crown-root casting exercises the exact route-ordered
  // segmentation used by authored and procedural catwalks without pinning a
  // retired face-6 coordinate.
  const shipped = buildLevel(CONFIG);
  const arena = shipped.platforms.find((p) => p.id === 'arena-f6-mid');
  const segments = splitPlatform(arena.x0, arena.x1);
  ok(arena.assault && arena.face === 6 && arena.x1 - arena.x0 === 13 &&
     segments.length === 13,
     'regression drives the shipped thirteen-tile face-6 Crown-root casting');
  ok(segments.every((segment, i) =>
    segment.x0 === arena.x0 + i && segment.x1 === arena.x0 + i + 1 &&
    segment.s === arena.x0 + i + 0.5),
  'the long catwalk is appended in exact half-open simulation-column order');

  // T-201 re-model (decisions.md entries 21 and 25). This regression used to
  // drive a catwalk the brick-slam zipper had only PARTLY built at the camera
  // handoff (one segment drawn, four withheld) and called that the intended
  // reveal. The zipper and the sim's build state are gone; the protected
  // property is that the default reveal draws the arriving facet whole at the
  // handoff and nothing of it before, so the same real catwalk — the one that
  // straddled the old strip edge — is asserted with the SIM's own build query.
  let handoffMs = 0;
  while (cornerYawDeltaDeg(handoffMs, CONFIG) /
      (2 * CONFIG.path.turnDeg) < 0.96) handoffMs++;
  const partial = shipped.platforms.find((p) => p.id === 'pocket-shelf-f3');
  const partialSegments = splitPlatform(partial.x0, partial.x1);
  LV.unbuildFutureFaces();                              // the boot/reset row, as shipped
  const drawnWithCamera = (cameraFacet) => partialSegments.filter((segment) => routeRenderOwned(
    segment.s, LV.columnBuilt(Math.floor(segment.s)), HALT_S[1], cameraFacet, CONFIG, BEND_S)).length;
  ok(handoffMs === 690 && partial.x0 === CORNER_S[1] + 29 && partial.x1 === CORNER_S[1] + 34 &&
     partialSegments.length === 5,
  'regression drives the real five-segment pocket-shelf-f3 catwalk that straddled the old zipper strip edge');
  ok(drawnWithCamera(2) === partialSegments.length,
     `T-201: at the corner-2 handoff its arriving catwalk is drawn whole (${drawnWithCamera(2)} of ` +
     `${partialSegments.length} segments), not a construction prefix`);
  ok(drawnWithCamera(1) === 0,
     'T-201: before that handoff none of it is drawn — it belongs to the arriving facet');

  const fractional = splitPlatform(9.25, 11.4);
  ok(JSON.stringify(fractional.map(({ x0, x1 }) => [x0, x1])) ===
     JSON.stringify([[9.25, 10], [10, 11], [11, 11.4]]) &&
     fractional.every((segment, i) => i === 0 || fractional[i - 1].x1 === segment.x0),
  'fractional authored ends remain exact and every visual segment is gap-free');

  const prefixBuilder = level.slice(level.indexOf('function platformPrefixGeometry'),
    level.indexOf('// The transformation slice'));
  const slatCull = level.slice(level.indexOf('export function updateWorldDressingCull'),
    level.indexOf('function buildIndustrialDressing'));
  const slatBake = level.slice(level.indexOf('for (const p of platforms)'),
    level.indexOf('if (WORLD_DRESSING_ENABLED)'));

  ok(/appendPanelGeometry\([\s\S]*segment\.s/.test(prefixBuilder) &&
     /samples\.push\(\{ s: segment\.s, vertexEnd: acc\.vertices \}\)/.test(prefixBuilder) &&
     /rows:\s*samples\.length/.test(prefixBuilder),
  'each route segment appends one ordered geometry row and records its exact draw-range end');
  ok(/for\s*\(const panel of slatMeshes\)\s*hidden \+= updateRoutePanelDrawRange\(panel, active\)/
       .test(slatCull) &&
     !/for\s*\(const row of slatMeshes\)[\s\S]{0,160}routeRenderable\(row\.s\)/
       .test(slatCull),
  'catwalks use the shared built-prefix draw gate, never midpoint all-or-nothing visibility');
  ok(/const prefix = IS_G1 \? platformPrefixGeometry\(p, mid, facet\) : null/.test(slatBake) &&
     /new THREE\.BoxGeometry\(len, 0\.18, 1\.4\)/.test(slatBake) &&
     !/p\.(?:x0|x1|y)\s*=/.test(slatBake),
  'the production renderer segments visuals only; fixture geometry and platform collision data stay unchanged');

  const simPlayer = stripComments(
    readFileSync(join(srcDir, 'sim', 'player.js'), 'utf8'),
  );
  ok(/for\s*\(const pl of platforms\)/.test(simPlayer) &&
     /player\.x \+ player\.hw > pl\.x0/.test(simPlayer) &&
     /player\.x - player\.hw < pl\.x1/.test(simPlayer),
  'player collision still consumes the original authored catwalk extents');
}
