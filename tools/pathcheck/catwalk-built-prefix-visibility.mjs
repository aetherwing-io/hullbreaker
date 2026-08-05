import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG } from '../../src/config.js';
import { buildLevel } from '../../src/pure/generator.js';
import { CORNER_S } from '../../src/pure/path.js';
import { cornerYawDeltaDeg, zipperOffset } from '../../src/pure/waves.js';
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

  function lockedPrefixAt(tMs) {
    let n = 0;
    for (let j = 0; j < CONFIG.waves.zipCols; j++) {
      if (zipperOffset(tMs, j, CONFIG).phase !== 'locked') break;
      n++;
    }
    return n;
  }

  let handoffMs = 0;
  while (cornerYawDeltaDeg(handoffMs, CONFIG) /
      (2 * CONFIG.path.turnDeg) < 0.96) handoffMs++;
  let partialMs = handoffMs;
  while (lockedPrefixAt(partialMs) < 30) partialMs++;
  const frontier = CORNER_S[1] + lockedPrefixAt(partialMs);
  const partial = shipped.platforms.find((p) => p.id === 'pocket-shelf-f3');
  const partialSegments = splitPlatform(partial.x0, partial.x1);
  const visiblePrefix = partialSegments.filter((segment) => segment.s < frontier).length;
  ok(handoffMs === 690 && partialMs > handoffMs && partialMs < 1100 &&
     frontier === CORNER_S[1] + 30 &&
     partial.x0 === frontier - 1 && partial.x1 === frontier + 4,
  'regression pins a real partially built catwalk inside the 690–1100 ms handoff interval');
  ok(visiblePrefix === 1 && partialSegments.length - visiblePrefix === 4,
     'the real construction frame keeps its one built segment and withholds four tail segments');
  ok(visiblePrefix > 0 && visiblePrefix < partialSegments.length &&
     partialSegments[visiblePrefix - 1].x1 === frontier &&
     partialSegments[visiblePrefix].x0 === frontier,
  `the draw frontier lands exactly at route s=${frontier}: no missing prefix and no leaked tail`);

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
