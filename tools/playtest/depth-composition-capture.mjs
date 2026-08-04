#!/usr/bin/env node
/* Fast live proof for the facet-owned Meridian depth volume. Two production
   pages (desktop + portrait) are reused across opening, mid-face, Crown and
   before/during/after poses at two separate turns. */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng } from '../assets/lib/png.mjs';
import { withIsolatedBrowser } from './lib/isolated-browser.mjs';

const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const root = resolve(here, '..', '..');
const out = resolve(process.argv[2] || '/private/tmp/hullbreaker-depth-volume');
await mkdir(out, { recursive: true });

const layouts = [
  { id: 'desktop', viewport: { width: 1440, height: 900 } },
  { id: 'portrait', viewport: { width: 390, height: 844 } },
];
const moments = [
  { id: 'opening', scroll: 48, corners: 0, playerX: 51 },
  { id: 'turn1-before', scroll: 89, corners: 0, playerX: 90, cornerState: 'approach' },
  { id: 'turn1-during', scroll: 89, corners: 0, playerX: 90, turnMs: 550 },
  { id: 'turn1-after', scroll: 106, corners: 1, playerX: 109 },
  { id: 'mid-face', scroll: 178, corners: 2, playerX: 181 },
  { id: 'turn3-before', scroll: 219, corners: 2, playerX: 220, cornerState: 'approach' },
  { id: 'turn3-during', scroll: 219, corners: 2, playerX: 220, turnMs: 550 },
  { id: 'turn3-after', scroll: 236, corners: 3, playerX: 239 },
  { id: 'crown', scroll: 415, corners: 6, playerX: 418 },
];
const depthRoles = new Set([
  'far-meridian-mass', 'mid-structural-anatomy',
  'world-condensation', 'near-armor-fragments',
]);

function imageStats(file) {
  const { width, height, rgba } = decodePng(file);
  const y0 = Math.floor(height * 0.05);
  const y1 = Math.floor(height * 0.76);
  const counts = new Map();
  let n = 0;
  let sum = 0;
  let sumSq = 0;
  let local = 0;
  let localN = 0;
  let flatTeal = 0;
  const luminance = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
      const l = luminance(r, g, b);
      sum += l;
      sumSq += l * l;
      n++;
      const key = (r << 16) | (g << 8) | b;
      counts.set(key, (counts.get(key) || 0) + 1);
      const haze = Math.hypot(r - 47, g - 86, b - 94);
      const sky = Math.hypot(r - 20, g - 50, b - 56);
      if (Math.min(haze, sky) <= 7) flatTeal++;
      if (x > 0) {
        const j = i - 4;
        local += Math.abs(l - luminance(rgba[j], rgba[j + 1], rgba[j + 2]));
        localN++;
      }
      if (y > y0) {
        const j = i - width * 4;
        local += Math.abs(l - luminance(rgba[j], rgba[j + 1], rgba[j + 2]));
        localN++;
      }
    }
  }
  let topColor = 0;
  let topCount = 0;
  for (const [color, count] of counts) {
    if (count > topCount) { topColor = color; topCount = count; }
  }
  const mean = sum / n;
  return {
    sd: +Math.sqrt(Math.max(0, sumSq / n - mean * mean)).toFixed(3),
    localContrast: +(local / localN).toFixed(3),
    flatTealShare: +(flatTeal / n).toFixed(5),
    topColor: `#${topColor.toString(16).padStart(6, '0')}`,
    topCoverage: +(topCount / n).toFixed(5),
    uniqueColors: counts.size,
  };
}

const report = {
  output: out,
  workflow: 'one isolated browser; two production page boots; eighteen live poses',
  browser: null,
  captures: [],
  parallax: [],
  gates: [],
  errors: [],
};
const gate = (condition, label, detail = null) =>
  report.gates.push({ ok: Boolean(condition), label, detail });

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
        `&depthvolumeqa=${Date.now()}`;
      await page.goto(url, { waitUntil: 'load', timeout: 30000 });
      await page.waitForFunction(() => globalThis.HB && HB.state() === 'PLAYING', null, {
        timeout: 20000,
      });
      await page.addStyleTag({ content: '#overlay { display: none !important; }' });

      for (const moment of moments) {
        const id = `${layout.id}-${moment.id}`;
        await page.evaluate(async (pose) => {
          const [W, T, C, B, H, M, Weapon, Backdrop] = await Promise.all([
            import('/src/sim/wavegate.js'), import('/src/sim/time.js'),
            import('/src/render/camera.js'), import('/src/sim/bridge.js'),
            import('/src/sim/hostiles.js'), import('/src/sim/mods.js'),
            import('/src/sim/weapons.js'), import('/src/render/backdrop.js'),
          ]);
          H.clearHostiles();
          M.clearMods();
          Weapon.clearBullets();
          W.resetCornerEvents();
          C.resetCameraYaw();
          for (let i = 0; i < pose.corners; i++) W.finishCorner(W.cornerEvents[i]);
          const active = W.cornerEvents[pose.corners];
          if (active && pose.cornerState) active.state = pose.cornerState;
          if (active && pose.turnMs != null) {
            active.state = 'turning';
            active.sealed = true;
            active.tStart = T.gameMs - pose.turnMs;
          }
          T.setScrollX(pose.scroll);
          HB.player.x = pose.playerX;
          const col = Math.max(0, Math.min(
            HB.levelData.groundH.length - 1, Math.floor(HB.player.x),
          ));
          HB.player.y = HB.levelData.groundH[col];
          HB.player.hp = 3;
          HB.player.lives = 3;
          HB.player.iframesUntil = 1e9;
          C.syncCamera();
          Backdrop.updateBackdropFacetVisibility();
          B.view.player.sync();
          if (!globalThis.__HB_DEPTH_VOLUME_PAUSED) {
            dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP' }));
            globalThis.__HB_DEPTH_VOLUME_PAUSED = true;
          }
        }, moment);
        await page.waitForTimeout(180);

        const runtime = await page.evaluate(async (roles) => {
          const [S, C] = await Promise.all([
            import('/src/render/scene.js'), import('/src/render/camera.js'),
          ]);
          S.scene.updateMatrixWorld(true);
          S.camera.updateMatrixWorld(true);
          const roleSet = new Set(roles);
          const objects = [];
          const futureFacetLeaks = [];
          const bannedSemantics = [];
          const actorImpostors = [];
          const runtimeCanvasMaps = [];
          const idleGlow = [];
          const textureIds = {};
          const gains = Array.from({ length: 7 }, (_, i) => C.cameraFaceBlendGain(i + 1));
          S.scene.traverse((object) => {
            const role = object.userData?.depthRole;
            if (!roleSet.has(role)) return;
            const face = object.userData.backdropFace;
            const sphere = object.geometry?.boundingSphere;
            let projected = null;
            if (sphere) {
              const point = sphere.center.clone().applyMatrix4(object.matrixWorld).project(S.camera);
              projected = { x: point.x, y: point.y, z: point.z };
            }
            objects.push({
              name: object.name,
              role,
              face,
              visible: object.visible,
              facetGain: object.userData.facetGain,
              effectiveOpacity: object.userData.effectiveOpacity ?? null,
              authoredDepth: object.userData.authoredDepth ?? null,
              depthRange: object.userData.depthRange || null,
              renderOrder: object.renderOrder,
              projected,
            });
            if (object.visible && !(gains[face - 1] > 0))
              futureFacetLeaks.push({ name: object.name, face, gains });
            const semanticText = `${object.name} ${JSON.stringify(object.userData)}`;
            if (/\b(?:ladder|platform|capsule|pickup|turret|enemy|hostile|spawn|route-light)\b/i
              .test(semanticText)) bannedSemantics.push(object.name);
            // `playerPlaneDepth` is legitimate metadata on every depth mesh,
            // so actor semantics inspect only authored names/components. This
            // catches a future atlas regression without flagging the proof
            // marker that keeps all environment geometry behind RIG's plane.
            const appearanceText = `${object.name} ${(object.userData.componentIds || []).join(' ')}`;
            if (/\b(?:player|rig|actor|humanoid)\b/i.test(appearanceText))
              actorImpostors.push(object.name);
            const materials = Array.isArray(object.material)
              ? object.material : object.material ? [object.material] : [];
            for (const material of materials) {
              const map = material.map;
              if (map) {
                (textureIds[role] ||= new Set()).add(map.uuid);
                if (typeof HTMLCanvasElement !== 'undefined' &&
                    map.image instanceof HTMLCanvasElement) runtimeCanvasMaps.push(object.name);
              }
              if ((material.emissive && material.emissive.getHex() !== 0 &&
                   (material.emissiveIntensity ?? 1) > 0.001) ||
                  material.userData?.idleEmissive === true) idleGlow.push(object.name);
            }
          });
          const projectedByRole = {};
          for (const row of objects) {
            if (!row.visible || !row.projected) continue;
            (projectedByRole[row.role] ||= []).push({ face: row.face, ...row.projected });
          }
          return {
            backdrop: globalThis.__HB_BACKDROP?.(),
            fold: C.cameraFoldSnapshot(),
            gains,
            objects,
            projectedByRole,
            futureFacetLeaks,
            bannedSemantics,
            actorImpostors,
            runtimeCanvasMaps,
            idleGlow,
            textureIds: Object.fromEntries(
              Object.entries(textureIds).map(([role, ids]) => [role, [...ids]]),
            ),
            render: { ...S.renderer.info.render },
            resources: S.rendererResourceSnapshot(),
          };
        }, [...depthRoles]);

        const file = resolve(out, `${id}.png`);
        await page.screenshot({ path: file });
        report.captures.push({
          id,
          layout: layout.id,
          moment: moment.id,
          viewport: layout.viewport,
          file,
          runtime,
          image: imageStats(file),
        });
      }
    } finally {
      await owned.close();
    }
  }
});

for (const layout of layouts) for (const turn of ['turn1', 'turn3']) {
  const before = report.captures.find((row) =>
    row.layout === layout.id && row.moment === `${turn}-before`);
  const during = report.captures.find((row) =>
    row.layout === layout.id && row.moment === `${turn}-during`);
  const face = turn === 'turn1' ? 1 : 3;
  const shifts = {};
  for (const role of ['far-meridian-mass', 'mid-structural-anatomy', 'near-armor-fragments']) {
    const a = before.runtime.projectedByRole[role]?.find((row) => row.face === face);
    const b = during.runtime.projectedByRole[role]?.find((row) => row.face === face);
    shifts[role] = a && b ? +Math.hypot(b.x - a.x, b.y - a.y).toFixed(5) : null;
  }
  report.parallax.push({ layout: layout.id, turn, face, shifts });
}

const captures = report.captures;
const duringRows = captures.filter((row) => row.moment.endsWith('-during'));
const settledRows = captures.filter((row) => !row.moment.endsWith('-during'));
gate(report.errors.length === 0, 'browser emitted no page or console errors', report.errors);
gate(captures.length === layouts.length * moments.length,
  'opening, mid, Crown and before/during/after of two turns captured at desktop + portrait');
gate(captures.every((row) => row.runtime.backdrop?.atmosphere?.composition ===
  'facet-anatomy-volume'), 'every live pose uses the resident facet depth composition');
gate(captures.every((row) => row.runtime.backdrop?.sources?.far?.state === 'ready' &&
  row.runtime.backdrop?.sources?.mid?.state === 'ready' &&
  row.runtime.backdrop?.sources?.near?.state === 'ready'),
  'all three direct production sources settle before every first frame');
gate(captures.every((row) => row.runtime.backdrop?.atmosphere?.runtimeCanvases === 0 &&
  row.runtime.backdrop?.atmosphere?.runtimeCrops === 0 &&
  row.runtime.runtimeCanvasMaps.length === 0),
  'live depth objects use no canvas map, cover crop or derived image');
gate(captures.every((row) => row.runtime.futureFacetLeaks.length === 0),
  'only current and legitimately arriving facet depth is visible',
  captures.map((row) => [row.id, row.runtime.futureFacetLeaks]));
gate(captures.every((row) => row.runtime.bannedSemantics.length === 0),
  'depth fill contains no future route, ladder, light, pickup or enemy semantics');
gate(captures.every((row) => row.runtime.actorImpostors.length === 0),
  'depth fill contains no player, RIG, actor or humanoid atlas semantics');
gate(captures.every((row) => row.runtime.idleGlow.length === 0),
  'ambient depth sources expose no idle emissive/glow channel');
gate(settledRows.every((row) => row.runtime.backdrop?.facetVisibility?.visibleFacets === 1 &&
  row.runtime.backdrop?.facetVisibility?.visibleMeshes === 4),
  'settled frames traverse exactly one facet and four fixed depth draws');
gate(duringRows.every((row) => row.runtime.backdrop?.facetVisibility?.visibleFacets === 2 &&
  row.runtime.backdrop?.facetVisibility?.visibleMeshes === 8),
  'turn frames traverse only departing + arriving facets and eight fixed depth draws');
gate(duringRows.every((row) => row.runtime.objects
  .filter((object) => object.visible && object.role === 'near-armor-fragments')
  .every((object) => object.effectiveOpacity != null && object.effectiveOpacity < 0.001) &&
  row.runtime.objects
    .filter((object) => object.visible && object.role === 'mid-structural-anatomy')
    .every((object) => object.effectiveOpacity != null && object.effectiveOpacity < 0.06)),
  'actor-like near cutouts and pale mid cards park below visible fold opacity',
  duringRows.map((row) => [row.id, row.runtime.objects
    .filter((object) => object.visible &&
      (object.role === 'near-armor-fragments' || object.role === 'mid-structural-anatomy'))
    .map((object) => [object.role, object.face, object.effectiveOpacity])]));
gate(captures.every((row) => row.runtime.backdrop?.atmosphere?.fixedPool?.turnTriangles <= 496 &&
  row.runtime.backdrop?.atmosphere?.fixedPool?.turnDrawCalls === 8),
  'lane stays inside the exact 496-triangle / 8-turn-call budget');
gate(captures.every((row) =>
  row.runtime.textureIds['far-meridian-mass']?.length === 1 &&
  row.runtime.textureIds['mid-structural-anatomy']?.length === 1 &&
  row.runtime.textureIds['near-armor-fragments']?.length === 1),
  'all facets share exactly one GPU texture for each direct art source');
gate(report.parallax.every((row) => {
  const values = Object.values(row.shifts);
  return values.every(Number.isFinite) && Math.max(...values) - Math.min(...values) >= 0.015;
}), 'two independent turns show distinct far/mid/near screen trajectories at both aspects',
report.parallax);
gate(duringRows.every((row) => row.image.topCoverage < 0.03 &&
  row.image.flatTealShare < 0.12 &&
  row.image.localContrast > 1.4 &&
  row.image.uniqueColors > (row.layout === 'desktop' ? 35_000 : 15_000)),
  'the old 80%-flat-teal turn frame is replaced by structured mechanical depth',
  duringRows.map((row) => [row.id, row.image]));
gate(captures.every((row) => row.runtime.render.calls <= 225 &&
  row.runtime.resources.memory.textures <= 70 &&
  row.runtime.resources.drawingPixels <= 6_000_000),
  'production frame stays inside total draw, texture and render-pixel ceilings',
  captures.map((row) => [row.id, row.runtime.render.calls,
    row.runtime.resources.memory.textures, row.runtime.resources.drawingPixels]));

await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  output: out,
  browser: report.browser,
  parallax: report.parallax,
  turnImages: duringRows.map((row) => ({ id: row.id, ...row.image })),
  resources: captures.map((row) => ({
    id: row.id,
    calls: row.runtime.render.calls,
    triangles: row.runtime.render.triangles,
    textures: row.runtime.resources.memory.textures,
    drawingPixels: row.runtime.resources.drawingPixels,
  })),
  gates: report.gates,
  errors: report.errors,
}, null, 2));
if (report.errors.length || report.gates.some((entry) => !entry.ok)) process.exitCode = 1;
