#!/usr/bin/env node
/* Production visual proof for Level 1's Vertical Assault v2 map pass.
 *
 * This is deliberately not a traversal fixture: it opens the shipped six-face
 * run with its real camera, hull skin, foreground component pack, route lamps,
 * fold ownership and post stack.  One desktop page advances through all six
 * faces and the five ordinary turns; a second portrait page proves that the
 * denser routes still read when the viewport is narrow.  The browser and
 * server are isolated and are always closed by withIsolatedBrowser(). */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../../src/config.js';
import { buildLevel } from '../../src/pure/generator.js';
import { withIsolatedBrowser } from './lib/isolated-browser.mjs';

const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const root = resolve(here, '..', '..');
const out = resolve(process.argv[2] || '/private/tmp/hullbreaker-level1-map-v2');
await mkdir(out, { recursive: true });

const level = buildLevel(CONFIG);
const before = {
  version: 'vertical-assault-v1',
  totalPlatforms: 87,
  authoredPlatformsByFace: [8, 7, 7, 7, 8, 8],
  ladders: 26,
  collisionRibs: 6,
  spans: [9.5, 10.5, 11.5, 12.5, 13.5, 14.5],
  silhouette: 'repeated arrival + pocket + rising staircase',
  routeRange: [3, 6],
};
const after = {
  version: level.verticalAssault.id,
  totalPlatforms: level.platforms.length,
  authoredPlatforms: level.platforms.filter((row) => row.assault).length,
  ladders: level.ladders.length,
  collisionRibs: level.solidRects.length,
  anonymousPatches: level.lattice.patched,
  faces: level.verticalAssault.report.map((row, index) => ({
    face: row.face,
    silhouette: row.silhouette,
    supportFamily: row.supportFamily,
    authoredPlatforms: level.assaults[index].platforms.length,
    span: row.span,
    routes: [row.routeMin, row.routeMax],
    connectors: row.connectorCount,
    staging: row.stagingCount,
    recovery: row.recoveryCount,
    cover: row.coverCount,
    gateApron: row.gateApron,
  })),
};

const desktop = { width: 1440, height: 900 };
const portrait = { width: 390, height: 844 };
const desktopMoments = [
  { id: 'face1-split-rib', face: 1, scroll: 48, kind: 'face' },
  { id: 'turn1-to-chimney', face: 1, scroll: 89, kind: 'turn', turnMs: 550 },
  { id: 'face2-chimney-fork', face: 2, scroll: 112, kind: 'face' },
  { id: 'turn2-to-cavity', face: 2, scroll: 154, kind: 'turn', turnMs: 550 },
  { id: 'face3-crossfire-cavity', face: 3, scroll: 178, kind: 'face' },
  { id: 'turn3-to-vents', face: 3, scroll: 219, kind: 'turn', turnMs: 550 },
  { id: 'face4-vent-stack', face: 4, scroll: 242, kind: 'face' },
  { id: 'turn4-to-braid', face: 4, scroll: 284, kind: 'turn', turnMs: 550 },
  { id: 'face5-kill-braid', face: 5, scroll: 308, kind: 'face' },
  { id: 'turn5-to-crown-roots', face: 5, scroll: 349, kind: 'turn', turnMs: 550 },
  { id: 'face6-crown-roots', face: 6, scroll: 382, kind: 'face' },
  { id: 'crown-approach', face: 6, scroll: 396, kind: 'face' },
];
const portraitMoments = [
  { id: 'portrait-face1-split-rib', face: 1, scroll: 48, kind: 'face' },
  { id: 'portrait-face3-cavity', face: 3, scroll: 178, kind: 'face' },
  { id: 'portrait-face6-crown-roots', face: 6, scroll: 382, kind: 'face' },
];

const report = {
  browser: null,
  workflow: 'current production, one isolated browser, one page per viewport',
  geometry: { before, after },
  captures: [],
  errors: [],
  assertions: [],
};
const gate = (ok, message, detail = null) => {
  report.assertions.push({ ok: !!ok, message, detail });
  if (!ok) report.errors.push(`${message}${detail ? `: ${JSON.stringify(detail)}` : ''}`);
};

async function captureSequence(newPage, viewport, moments, label, baseUrl) {
  const owned = await newPage({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const { page } = owned;
  page.on('pageerror', (error) => report.errors.push(`${label}: ${error.stack || error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') report.errors.push(`${label}: console: ${message.text()}`);
  });
  try {
    await page.goto(
      `${baseUrl}/index.html?testapi=1&shell=0&audio=0&view=far&mapv2qa=${Date.now()}`,
      { waitUntil: 'load', timeout: 30000 },
    );
    await page.waitForFunction(() => globalThis.HB && HB.state() === 'PLAYING', null,
      { timeout: 20000 });
    await page.waitForFunction(() => {
      const component = globalThis.__HB_FOREGROUND_COMPONENT_ART?.();
      const detail = globalThis.__HB_WORLD_DETAIL_ART?.();
      // An intentionally disabled optional pack reports `disabled`, not
      // `failed`.  The preload contract is the reliable production signal:
      // consumers only start after either GPU residency or a settled fallback.
      const settled = (row) => row && row.settledBeforeConsumer === true;
      return settled(component) && settled(detail);
    }, null, { timeout: 20000 });
    await page.addStyleTag({ content: '#overlay { display: none !important; }' });
    await page.evaluate(() => dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP' })));

    for (const moment of moments) {
      await page.evaluate(async (pose) => {
        const [W, T, Camera, Bridge, Hostiles, Mods, SimLevel, Path, RenderLevel, Seams] =
          await Promise.all([
            import('/src/sim/wavegate.js'), import('/src/sim/time.js'),
            import('/src/render/camera.js'), import('/src/sim/bridge.js'),
            import('/src/sim/hostiles.js'), import('/src/sim/mods.js'),
            import('/src/sim/level.js'), import('/src/pure/path.js'),
            import('/src/render/level.js'), import('/src/render/seams.js'),
          ]);
        Hostiles.clearHostiles();
        Mods.clearMods();

        // Commit only the faces that a real run has already cleared.  A turn
        // is then posed at the physical bend itself, which exercises the same
        // player/fog/future-face ownership that fixed the old fold ghost.
        for (let i = 0; i < pose.face - 1; i++) {
          if (W.cornerEvents[i].state !== 'done') W.finishCorner(W.cornerEvents[i]);
        }
        if (pose.kind === 'turn') {
          const corner = W.cornerEvents[pose.face - 1];
          corner.state = 'turning';
          corner.sealed = true;
          corner.tStart = T.gameMs - pose.turnMs;
        }

        T.setScrollX(pose.scroll);
        HB.player.x = pose.kind === 'turn'
          ? Path.BEND_S[pose.face - 1]
          : pose.scroll + (pose.portrait ? 1 : 3);
        HB.player.y = SimLevel.groundTopAt(HB.player.x);
        HB.player.vx = 0;
        HB.player.vy = 0;
        HB.player.hp = 3;
        HB.player.lives = 3;
        // Keep proof frames deterministic without forcing the damage-flash
        // shader into its invisible phase.  The previous infinite iframe pose
        // accidentally hid the RIG in otherwise valid map captures.
        HB.player.iframesUntil = T.gameMs - 1;
        Camera.syncCamera();
        Bridge.view.player.sync();
        RenderLevel.updateWorldDressingCull();
        Seams.updateSeamFoldCull();
      }, { ...moment, portrait: viewport.width < 600 });

      await page.waitForTimeout(220);
      const runtime = await page.evaluate(async (pose) => {
        const [Scene, Seams, Visibility, Time, Config, Lattice, SimLevel, Assault] =
          await Promise.all([
          import('/src/render/scene.js'), import('/src/render/seams.js'),
          import('/src/render/route-visibility.js'), import('/src/sim/time.js'),
          import('/src/config.js'), import('/src/pure/lattice.js'),
          import('/src/sim/level.js'), import('/src/pure/vertical-assault.js'),
        ]);
        const faces = Lattice.latticeFaces(Config.CONFIG);
        const faceSamples = faces.map((face) => ({
          face: face.face,
          s: face.s0 + 34,
          renderable: Visibility.routeRenderable(face.s0 + 34),
        }));
        const sockets = globalThis.__HB_FOREGROUND_RESPONSE_SOCKETS?.() || [];
        const visibleSockets = sockets.filter((row) =>
          Visibility.routeRenderable(row.route.visibilityS));
        const socketFaces = [...new Set(visibleSockets.map((row) =>
          faces.find((face) => row.route.s >= face.s0 && row.route.s < face.corner)?.face || 0))];
        const unsupportedSockets = sockets.filter((row) => {
          const face = faces.find((candidate) =>
            row.route.s >= candidate.s0 && row.route.s < candidate.corner);
          const col = Math.max(0, Math.min(SimLevel.groundH.length - 1,
            Math.floor(row.route.s)));
          // Intro and outro modules deliberately live outside the six assault
          // face ranges. They are still supported by real deck columns; only
          // a socket inside a face's protected turn apron is a map leak.
          return SimLevel.groundH[col] <= -100 ||
            (face && row.route.s >= face.corner - Assault.VERTICAL_ASSAULT.gateApron) ||
            Math.abs(row.route.s - row.route.visibilityS) > 8;
        });
        const seams = Seams.seamsStats();
        const resources = Scene.rendererResourceSnapshot();
        return {
          state: HB.state(),
          map: HB.levelData.verticalAssault,
          world: globalThis.__HB_WORLD?.(),
          worldArt: globalThis.__HB_WORLD_DETAIL_ART?.(),
          components: globalThis.__HB_FOREGROUND_COMPONENT_ART?.(),
          componentCatalog: globalThis.__HB_FOREGROUND_COMPONENT_CATALOG?.(),
          responseSockets: {
            total: sockets.length,
            visible: visibleSockets.length,
            visibleFaces: socketFaces,
            unsupported: unsupportedSockets.length,
            unsupportedRows: unsupportedSockets.map((row) => ({
              id: row.id,
              s: +row.route.s.toFixed(3),
              visibilityS: +row.route.visibilityS.toFixed(3),
              deck: SimLevel.groundH[Math.max(0, Math.min(
                SimLevel.groundH.length - 1, Math.floor(row.route.s)))],
            })),
          },
          seams: { ...seams, visible: seams.fixtureCount - seams.hidden },
          visibility: {
            scroll: Time.scrollX,
            facet: Visibility.currentWorldFacet(),
            faceSamples,
            visibleFaces: faceSamples.filter((row) => row.renderable).map((row) => row.face),
            twoFacesAhead: pose.face <= 4
              ? faceSamples[pose.face + 1].renderable
              : false,
          },
          rig: globalThis.__HB_RIG_VISUAL?.(),
          render: { ...Scene.renderer.info.render },
          resources,
        };
      }, moment);

      const file = resolve(out, `${moment.id}.png`);
      await page.screenshot({ path: file });
      report.captures.push({
        id: moment.id, face: moment.face, kind: moment.kind,
        viewport, file, runtime,
      });

      gate(runtime.map?.id === 'vertical-assault-v2', `${moment.id}: production map is v2`);
      gate(runtime.visibility.visibleFaces.length === 1 &&
        runtime.visibility.visibleFaces[0] === moment.face,
      `${moment.id}: only the camera-owned face can render`, runtime.visibility);
      gate(runtime.visibility.twoFacesAhead === false,
        `${moment.id}: no two-faces-ahead route leak`, runtime.visibility);
      gate(runtime.responseSockets.unsupported === 0,
        `${moment.id}: response sockets remain attached to their owning ground module`,
        runtime.responseSockets);
      gate((runtime.world?.componentPlacements || 0) >= 500,
        `${moment.id}: production component dressing is present`, runtime.world);
      gate((runtime.world?.componentUnique || 0) >= 16,
        `${moment.id}: component dressing retains useful variation`, runtime.world);
      gate(['rib', 'service', 'cavity', 'vent', 'braid', 'root'].every((family) =>
        (runtime.world?.supportFamilies?.[family] || 0) > 0),
      `${moment.id}: all six structural support dialects are present`,
      runtime.world?.supportFamilies);
      gate((runtime.render?.calls || 0) <= 320,
        `${moment.id}: desktop-grade draw-call ceiling`, runtime.render);
      gate((runtime.resources?.memory?.textures || 0) <= 72,
        `${moment.id}: texture residency stays bounded`, runtime.resources?.memory);
      gate(runtime.rig?.rigVisible === true,
        `${moment.id}: RIG remains visible on the camera-owned face`, runtime.rig);
      if (moment.kind === 'turn') {
        gate(runtime.rig?.screen?.x >= -2 &&
          runtime.rig?.screen?.x <= viewport.width + 2,
        `${moment.id}: RIG is owned by the visible fold`, runtime.rig);
      }
    }
  } finally {
    await owned.close();
  }
}

await withIsolatedBrowser(root, async ({ baseUrl, launch, newPage }) => {
  report.browser = { channel: launch.channel, via: launch.via };
  await captureSequence(newPage, desktop, desktopMoments, 'desktop', baseUrl);
  await captureSequence(newPage, portrait, portraitMoments, 'portrait', baseUrl);
});

const table = after.faces.map((row, index) =>
  `| ${row.face} | ${before.authoredPlatformsByFace[index]} / ${before.spans[index]} | ` +
  `${row.silhouette} | ${row.supportFamily} | ${row.authoredPlatforms} / ${row.span} | ` +
  `${row.routes[0]}-${row.routes[1]} | ${row.connectors} | ${row.staging} | ${row.recovery} |`,
).join('\n');
const summary = `# Level 1 map v2 production proof\n\n` +
  `Before: ${before.totalPlatforms} total platforms, ${before.ladders} ladders, ` +
  `${before.collisionRibs} collision ribs, and one repeated staircase silhouette.\n\n` +
  `After: ${after.totalPlatforms} total platforms, ${after.authoredPlatforms} authored ` +
  `encounter pieces, ${after.ladders} real ladders, ${after.collisionRibs} collision ribs, ` +
  `${after.anonymousPatches} anonymous repair bars.\n\n` +
  `| Face | Before pieces / span | New silhouette | Support family | New pieces / span | Routes | Connectors | Staging | Recovery |\n` +
  `| ---: | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: |\n${table}\n\n` +
  `Captures: ${report.captures.length}. Assertions: ` +
  `${report.assertions.filter((row) => row.ok).length}/${report.assertions.length} passed.\n`;

await writeFile(resolve(out, 'summary.md'), summary);
await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({
  browser: report.browser,
  geometry: report.geometry,
  captures: report.captures.map((row) => ({
    id: row.id,
    file: row.file,
    visibleFaces: row.runtime.visibility.visibleFaces,
    rigVisible: row.runtime.rig?.rigVisible,
    componentPlacements: row.runtime.world?.componentPlacements,
    componentUnique: row.runtime.world?.componentUnique,
    supportFamilies: row.runtime.world?.supportFamilies,
    responseSockets: row.runtime.responseSockets,
    calls: row.runtime.render?.calls,
    triangles: row.runtime.render?.triangles,
    textures: row.runtime.resources?.memory?.textures,
  })),
  assertions: {
    passed: report.assertions.filter((row) => row.ok).length,
    total: report.assertions.length,
  },
  errors: report.errors,
  report: resolve(out, 'report.json'),
  summary: resolve(out, 'summary.md'),
}, null, 2));
if (report.errors.length) process.exitCode = 1;
