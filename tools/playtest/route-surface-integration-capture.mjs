#!/usr/bin/env node
/* Fast current-production proof for the route/summit surface integration.
   Two live pages (desktop + portrait) are reused across four ascending route
   poses, so eight screenshots pay only two boot/preload costs.  Every pose is
   the real six-face level and production render stack; hostiles are cleared
   solely to expose the environment.  The probe never touches a visible/user
   browser, fixture map, collision, spawn data or runtime asset pipeline. */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withIsolatedBrowser } from './lib/isolated-browser.mjs';

const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const root = resolve(here, '..', '..');
const out = resolve(process.argv[2] || '/private/tmp/hullbreaker-route-surface-integration');
await mkdir(out, { recursive: true });

const layouts = [
  { id: 'desktop', viewport: { width: 1440, height: 900 } },
  { id: 'portrait', viewport: { width: 390, height: 844 } },
];
const moments = [
  { id: 'opening', scroll: 48, corners: 0 },
  { id: 'mid-face', scroll: 178, corners: 2 },
  { id: 'gate-corner', scroll: 349, corners: 4, turnMs: 550 },
  // The sixth/final facet commit owns the resident Crown. Five completed
  // corners reaches Crown Roots; the sixth handoff is what makes the summit
  // architecture legally renderable.
  { id: 'crown-summit', scroll: 415, corners: 6 },
];

const report = {
  output: out,
  browser: null,
  workflow: 'one isolated browser, two production page boots, eight ascending live poses',
  captures: [],
  gates: [],
  errors: [],
};
const gate = (ok, label, detail = null) =>
  report.gates.push({ ok: Boolean(ok), label, detail });

await withIsolatedBrowser(root, async ({ baseUrl, launch, newPage }) => {
  report.browser = { channel: launch.channel, via: launch.via };
  for (const layout of layouts) {
    const owned = await newPage({
      viewport: layout.viewport,
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    const { page } = owned;
    page.on('pageerror', (error) =>
      report.errors.push(`${layout.id}: ${error.stack || error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error')
        report.errors.push(`${layout.id}: console: ${message.text()}`);
    });
    try {
      const url = `${baseUrl}/index.html?testapi=1&shell=0&audio=0&view=far` +
        `&surfaceqa=${Date.now()}`;
      await page.goto(url, { waitUntil: 'load', timeout: 30000 });
      await page.waitForFunction(() => globalThis.HB && HB.state() === 'PLAYING', null, {
        timeout: 20000,
      });
      await page.addStyleTag({ content: '#overlay { display: none !important; }' });

      for (const moment of moments) {
        const id = `${layout.id}-${moment.id}`;
        await page.evaluate(async ({ scroll, corners, turnMs, portrait }) => {
          const [W, T, C, B, H, M] = await Promise.all([
            import('/src/sim/wavegate.js'), import('/src/sim/time.js'),
            import('/src/render/camera.js'), import('/src/sim/bridge.js'),
            import('/src/sim/hostiles.js'), import('/src/sim/mods.js'),
          ]);
          H.clearHostiles();
          M.clearMods();
          const completed = globalThis.__HB_SURFACE_FINISHED_CORNERS || 0;
          for (let i = completed; i < corners; i++) W.finishCorner(W.cornerEvents[i]);
          globalThis.__HB_SURFACE_FINISHED_CORNERS = Math.max(completed, corners);
          if (turnMs != null) {
            const corner = W.cornerEvents[corners];
            corner.state = 'turning';
            corner.tStart = T.gameMs - turnMs;
          }
          T.setScrollX(scroll);
          HB.player.x = scroll + (portrait ? 1.0 : 3.0);
          const col = Math.max(0, Math.min(
            HB.levelData.groundH.length - 1, Math.floor(HB.player.x),
          ));
          HB.player.y = HB.levelData.groundH[col];
          HB.player.hp = 3;
          HB.player.lives = 3;
          HB.player.iframesUntil = 1e9;
          C.syncCamera();
          B.view.player.sync();
          if (!globalThis.__HB_SURFACE_PAUSED) {
            dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP' }));
            globalThis.__HB_SURFACE_PAUSED = true;
          }
        }, {
          scroll: moment.scroll,
          corners: moment.corners,
          turnMs: moment.turnMs ?? null,
          portrait: layout.id === 'portrait',
        });
        await page.waitForTimeout(220);

        const runtime = await page.evaluate(async () => {
          const [S, L, R, T, C, Limb, Crown] = await Promise.all([
            import('/src/render/scene.js'), import('/src/render/seams.js'),
            import('/src/render/route-visibility.js'), import('/src/sim/time.js'),
            import('/src/config.js'), import('/src/render/limb.js'),
            import('/src/render/crown.js'),
          ]);
          // The page is intentionally paused after the first pose. Production
          // normally calls this from main's update loop; invoke the same
          // idempotent ownership gate after each direct QA teleport so the
          // snapshot reflects the new committed facet rather than pause time.
          Crown.updateCrownFacetCull();
          const active = R.currentWorldFacet();
          const surfaceRoles = new Set([
            'limb-anatomy',
            'collision-faithful-painted-hull-facet',
            'collision-faithful-painted-platform',
            'painted-service-bays',
            'foreground-content-pack-inlays',
            'native-shape-component-composition',
            'sparse-authored-meridian-fixtures',
          ]);
          const roleCounts = {};
          const futureFacetLeaks = [];
          const emissiveEnvironment = [];
          let limbPools = 0;
          let limbInstances = 0;
          let warmScutes = 0;
          let coldScutes = 0;
          S.scene.traverse((object) => {
            const role = object.userData?.environmentRole;
            if (!surfaceRoles.has(role)) return;
            roleCounts[role] = (roleCounts[role] || 0) + 1;
            const drawCount = object.geometry?.drawRange?.count;
            const draws = object.visible !== false &&
              (drawCount === undefined || drawCount === Infinity || drawCount > 0);
            if (draws && Number.isInteger(object.userData?.routeFacet) &&
                object.userData.routeFacet !== active) {
              futureFacetLeaks.push({
                name: object.name,
                facet: object.userData.routeFacet,
                active,
                drawCount,
              });
            }
            const materials = Array.isArray(object.material)
              ? object.material : object.material ? [object.material] : [];
            for (const material of materials) {
              const lit = material.emissive && material.emissive.getHex() !== 0 &&
                (material.emissiveIntensity ?? 1) > 0.001;
              if (lit) emissiveEnvironment.push({
                name: object.name,
                intensity: material.emissiveIntensity ?? 1,
                color: material.emissive.getHex(),
              });
            }
            if (role === 'limb-anatomy') {
              limbPools++;
              limbInstances += object.count || 0;
              if (String(object.userData?.limbShape).startsWith('armor')) {
                if (object.userData?.limbBucket === 'scute') warmScutes += object.count || 0;
                else coldScutes += object.count || 0;
              }
            }
          });
          const faceTiles = C.CONFIG.path.faceTiles;
          return {
            world: globalThis.__HB_WORLD?.(),
            pack: globalThis.__HB_FOREGROUND_PACK?.(),
            components: globalThis.__HB_FOREGROUND_COMPONENT_ART?.(),
            hullTexture: globalThis.__HB_HULL_TEX?.(),
            deckTexture: globalThis.__HB_DECK_PANEL?.(),
            seams: L.seamsStats(),
            limb: {
              fold: Limb.limbFoldCullSnapshot(),
              pools: limbPools,
              instances: limbInstances,
              warmScutes,
              coldScutes,
            },
            crown: Crown.crownPresentationSnapshot(),
            roleCounts,
            futureFacetLeaks,
            emissiveEnvironment,
            visibility: {
              scroll: T.scrollX,
              active,
              current: R.routeRenderable(T.scrollX + 3),
              nextFace: R.routeRenderable(T.scrollX + faceTiles),
              twoFacesAhead: R.routeRenderable(T.scrollX + faceTiles * 2),
            },
            render: { ...S.renderer.info.render },
            resources: S.rendererResourceSnapshot(),
            state: HB.state(),
          };
        });

        const file = resolve(out, `${id}.png`);
        await page.screenshot({ path: file });
        report.captures.push({
          id, layout: layout.id, moment: moment.id,
          viewport: layout.viewport, file, runtime,
        });
      }
    } finally {
      await owned.close();
    }
  }
});

const captures = report.captures;
const desktops = captures.filter((row) => row.layout === 'desktop');
const portraits = captures.filter((row) => row.layout === 'portrait');
const summit = captures.filter((row) => row.moment === 'crown-summit');
gate(report.errors.length === 0, 'browser emitted no page or console errors', report.errors);
gate(captures.length === 8 && desktops.length === 4 && portraits.length === 4,
  'opening, mid-face, gate/corner and Crown summit captured live at desktop and portrait');
gate(captures.every((row) => row.runtime.world?.packState === 'ready' &&
  row.runtime.world?.componentArtState === 'ready' && row.runtime.pack?.state === 'ready' &&
  row.runtime.components?.state === 'ready'),
  'every live pose uses the settled production pack and native component atlas');
gate(captures.every((row) => row.runtime.deckTexture?.ready &&
  Object.values(row.runtime.hullTexture?.files || {}).every(Boolean)),
  'deck and limb paintings report valid source residency in every pose');
gate(captures.every((row) => row.runtime.futureFacetLeaks.length === 0),
  'no painted panel, component, light-adjacent fixture or detail card draws around a fold',
  captures.map((row) => [row.id, row.runtime.futureFacetLeaks]));
gate(captures.every((row) => row.runtime.limb.fold.hidden > 0 &&
  row.runtime.seams.hidden > 0),
  'limb anatomy and housed luminaires cull remote/future facets in all eight poses');
gate(captures.every((row) => row.runtime.emissiveEnvironment.length === 0 &&
  row.runtime.world?.packEmissive === false && row.runtime.world?.componentArtEmissive === false),
  'ambient Meridian surfaces have no idle emissive/glow path');
gate(captures.every((row) => row.runtime.limb.pools === 22 &&
  row.runtime.limb.warmScutes === 26 && row.runtime.limb.coldScutes === 40),
  'the five-scute material phrase reuses 22 fixed limb pools with a bounded 26/40 warm/cold split',
  captures.map((row) => [row.id, row.runtime.limb]));
gate(captures.every((row) => row.runtime.render.calls <= 225 &&
  row.runtime.resources.memory.textures <= 70),
  'live production surface stays under 225 draw calls and 70 resident textures',
  captures.map((row) => [row.id, row.runtime.render.calls,
    row.runtime.resources.memory.textures]));
gate(desktops.every((row, index) =>
  row.runtime.world.componentPlacements === portraits[index].runtime.world.componentPlacements &&
  row.runtime.world.packPlacements === portraits[index].runtime.world.packPlacements &&
  row.runtime.limb.instances === portraits[index].runtime.limb.instances),
  'desktop and portrait consume identical deterministic placement plans');
gate(summit.every((row) => row.runtime.crown.visible &&
  row.runtime.roleCounts['limb-anatomy'] > 0 &&
  row.runtime.roleCounts['collision-faithful-painted-hull-facet'] > 0),
  'the visible Crown summit remains rooted in the same limb and route-surface hierarchy');

await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({
  output: out,
  browser: report.browser,
  workflow: report.workflow,
  captures: captures.map((row) => ({
    id: row.id,
    file: row.file,
    activeFacet: row.runtime.visibility.active,
    futureLeaks: row.runtime.futureFacetLeaks.length,
    limb: row.runtime.limb,
    crownVisible: row.runtime.crown.visible,
    components: row.runtime.world.componentPlacements,
    pack: row.runtime.world.packPlacements,
    calls: row.runtime.render.calls,
    triangles: row.runtime.render.triangles,
    textures: row.runtime.resources.memory.textures,
  })),
  gates: report.gates,
  errors: report.errors,
}, null, 2));
if (report.errors.length || report.gates.some((row) => !row.ok)) process.exitCode = 1;
