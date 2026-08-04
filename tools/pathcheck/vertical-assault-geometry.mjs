import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG } from '../../src/config.js';
import { buildLevel } from '../../src/pure/generator.js';
import {
  latticeFaces, latticeStranded, latticeUnreachable,
} from '../../src/pure/lattice.js';
import { VERTICAL_ASSAULT } from '../../src/pure/vertical-assault.js';
import { ok, srcDir, stripComments } from './_context.mjs';

export const title = 'Vertical Assault authored geometry remains deterministic and traversable';

export async function run() {
  const A = buildLevel(CONFIG);
  const B = buildLevel(CONFIG);
  const geometry = (level) => ({
    platforms: level.platforms,
    solidRects: level.solidRects,
    ladders: level.ladders,
    assaults: level.assaults,
    arenas: level.arenas,
    report: level.verticalAssault.report,
  });
  ok(JSON.stringify(geometry(A)) === JSON.stringify(geometry(B)),
    'same config produces byte-stable assault geometry');

  ok(A.assaults.length === 6,
    'one authored assault chunk exists per hull face');
  ok(A.lattice.patched === 0,
    'authored route decisions need no anonymous density-repair bars');

  const expectedArenaIds = [
    'arena-f2-mid',
    'arena-f3-mid', 'arena-f3-high',
    'arena-f4-mid', 'arena-f4-high', 'arena-f4-perch',
    'arena-f5-mid', 'arena-f5-high', 'arena-f5-third',
    'arena-f6-mid', 'arena-f6-high', 'arena-f6-third',
  ];
  const ids = new Set(A.platforms.map((p) => p.id).filter(Boolean));
  for (const id of expectedArenaIds)
    ok(ids.has(id), `Vertical Assault preserves authored arena id ${id}`);
  for (let face = 1; face <= 6; face++) {
    ok(ids.has(`pocket-mid-f${face}`), `Vertical Assault preserves pocket-mid-f${face}`);
    ok(ids.has(`pocket-shelf-f${face}`), `Vertical Assault preserves pocket-shelf-f${face}`);
  }

  const assaultPlatforms = A.platforms.filter((p) => p.assault);
  ok(new Set(assaultPlatforms.map((p) => p.id)).size === assaultPlatforms.length,
    'authored assault platform IDs are unique');
  ok(assaultPlatforms.every((p) => p.x1 > p.x0 &&
    p.x1 - p.x0 <= VERTICAL_ASSAULT.maxPlatformLen),
  'authored platforms remain positive local ribs/scutes rather than long shelves');

  const protectedBridges = A.platforms.filter((p) => p.routeBridge);
  for (const bridge of protectedBridges) {
    let ownsGap = false;
    for (let x = Math.floor(bridge.x0); x < Math.ceil(bridge.x1); x++)
      if (A.groundH[x] <= -100) ownsGap = true;
    ok(ownsGap, `protected row ${bridge.x0}-${bridge.x1} owns a real raw-deck gap`);
  }

  ok(JSON.stringify(A.verticalAssault.report.map((r) => r.span)) ===
    JSON.stringify(VERTICAL_ASSAULT.spans),
  'measured play-space span escalates from 10 to 15 tiles');
  ok(new Set(A.verticalAssault.report.map((r) => r.silhouette)).size === 6 &&
    new Set(A.verticalAssault.report.map((r) => r.silhouetteSignature)).size === 6,
  'all six faces have distinct named and measured silhouettes');
  for (const row of A.verticalAssault.report) {
    ok(row.connectorCount >= 5,
      `face ${row.face} has at least five vertical connectors`);
    ok(row.recoveryCount >= 1,
      `face ${row.face} has an explicit drop/recovery lane`);
    ok(row.routeMin >= 3 && row.routeMax <= 5,
      `face ${row.face} keeps 3-5 immediate routes including deck`);
    ok(row.stagingCount >= 5,
      `face ${row.face} exposes enemy staging across spatial roles`);
    ok(row.coverCount >= 1,
      `face ${row.face} has collision cover, not painted scenery`);
  }

  const ladderKeys = ['face', 'id', 'kind', 'x', 'y0', 'y1'];
  const ladderKinds = new Set(['rib', 'service', 'organic']);
  for (const rail of A.ladders) {
    ok(JSON.stringify(Object.keys(rail).sort()) === JSON.stringify(ladderKeys),
      `${rail.id} uses the frozen ladder schema`);
    ok(Number.isFinite(rail.x) && rail.y0 < rail.y1 &&
      rail.y1 - rail.y0 <= VERTICAL_ASSAULT.maxLift,
      `${rail.id} has ordered endpoints inside ordinary double-jump reach`);
    ok(ladderKinds.has(rail.kind), `${rail.id} uses a supported visual kind`);
    const lower = A.platforms.find((p) =>
      Math.abs(p.y - rail.y0) < 1e-6 && rail.x >= p.x0 && rail.x < p.x1);
    const upper = A.platforms.find((p) =>
      Math.abs(p.y - rail.y1) < 1e-6 && rail.x >= p.x0 && rail.x < p.x1);
    ok(!!lower && !!upper, `${rail.id} joins two real walkable surfaces`);
    ok(!!lower && !!upper && upper.y - lower.y <= CONFIG.gen.maxReach,
      `${rail.id} remains optional because the surfaces also admit a normal jump`);
    ok(!A.solidRects.some((r) =>
      r.x1 > rail.x - 0.35 && r.x0 < rail.x + 0.35 &&
      r.y1 > rail.y0 && r.y0 < rail.y1),
    `${rail.id} keeps a clear 0.7-tile body corridor`);
  }

  ok(latticeUnreachable(A, CONFIG).filter((p) => p.assault).length === 0,
    'every assault platform has a double-jump support');
  ok(latticeStranded(A, CONFIG).filter((p) => p.assault).length === 0,
    'every assault platform has a forward jump or safe drop');

  for (const face of latticeFaces(CONFIG)) {
    const cleanFrom = face.corner - VERTICAL_ASSAULT.gateApron;
    const chunk = A.assaults.find((c) => c.face === face.face);
    ok(chunk.platforms.every((p) => p.x1 <= cleanFrom),
      `face ${face.face} leaves the seven-tile gate apron free of platforms`);
    ok(A.solidRects.filter((r) => r.face === face.face).every((r) => r.x1 <= cleanFrom),
      `face ${face.face} leaves the bend approach free of cover`);
    ok(chunk.ladders.every((r) => r.x < cleanFrom),
      `face ${face.face} leaves the bend approach free of ladders`);
    ok(chunk.staging.every((s) => s.x < cleanFrom),
      `face ${face.face} keeps enemy staging out of the pivot`);
    ok(A.platforms.filter((p) => !p.id && !p.routeBridge &&
      p.x1 > chunk.x0 && p.x0 < chunk.x1).length === 0,
      `face ${face.face} contains no anonymous procedural catwalk carpet`);
  }

  // ?zip=1 changes only the corner theater. Real rails and every other
  // route-bound visual retain the normal run's camera/build ownership.
  const route = stripComments(readFileSync(
    join(srcDir, 'render', 'route-visibility.js'), 'utf8'));
  const levelRender = stripComments(readFileSync(
    join(srcDir, 'render', 'level.js'), 'utf8'));
  const ladderBuilder = levelRender.slice(
    levelRender.indexOf('function buildTraversableLadders'),
    levelRender.indexOf('export function updateWorldDressingCull'));
  const ladderCull = levelRender.slice(
    levelRender.indexOf('export function updateWorldDressingCull'),
    levelRender.indexOf('function buildIndustrialDressing'));
  const ladderCullAt = ladderCull.indexOf('for (const pool of ladderPools)');
  const anatomyReturnAt = ladderCull.indexOf('if (!IS_G1)');

  ok(/import\s*\{\s*ACTIVE_FIXTURE\s*\}\s*from\s*['"]\.\.\/mode\.js['"]/.test(route) &&
    !/\bIS_G1\b/.test(route) &&
    /if\s*\(ACTIVE_FIXTURE !== null\) return true/.test(route),
  'route ownership is normal-run topology, independent of default or zip corner art');
  ok(/ACTIVE_FIXTURE === null && ladders\.length/.test(ladderBuilder) &&
    !/\bIS_G1\b/.test(ladderBuilder),
  'both normal-run reveal styles build the same traversable ladder pools');
  ok(ladderCullAt >= 0 && anatomyReturnAt > ladderCullAt &&
    /routeRenderable\(pool\.rows\[i\]\.s\)/.test(
      ladderCull.slice(ladderCullAt, anatomyReturnAt)),
  'ladder pools apply facet/build culling before anatomy-only dressing can return');
}
