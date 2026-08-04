#!/usr/bin/env node
/* True-production FAR proof for the one-draw sprite-grounding pass.
 *
 * Two real page boots per viewport compare the shipped contact footprint with
 * the explicit ?shadow=0 escape hatch.  The harness stages only simulation
 * rows and calls their installed production views; it never substitutes a
 * viewer, material, geometry or camera. */

import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { decodePng } from '../assets/lib/png.mjs';
import { withIsolatedBrowser } from './lib/isolated-browser.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = resolve(process.argv[2] || '/private/tmp/hullbreaker-sprite-grounding-v2');
await mkdir(OUT, { recursive: true });

const layouts = [
  { id: 'desktop', viewport: { width: 1440, height: 900 }, spread: 1 },
  { id: 'portrait', viewport: { width: 390, height: 844 }, spread: 0.62 },
];
const modes = [
  { id: 'on', query: 'shadow=1', enabled: true },
  { id: 'off', query: 'shadow=0', enabled: false },
];
const scenes = ['grounded', 'airborne', 'warden'];
const report = {
  output: OUT,
  browser: null,
  workflow: 'current six-face production, FAR camera, shipped shadow=1 vs shadow=0',
  captures: [],
  comparisons: [],
  gates: [],
  errors: [],
};
const gate = (ok, label, detail = null) => {
  report.gates.push({ ok: !!ok, label, detail });
  if (!ok) report.errors.push(`${label}${detail ? `: ${JSON.stringify(detail)}` : ''}`);
};

function luminance(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }

function comparePatches(onFile, offFile, contacts) {
  const a = decodePng(onFile), b = decodePng(offFile);
  assert.equal(a.width, b.width);
  assert.equal(a.height, b.height);
  let pixels = 0, changed = 0, onL = 0, offL = 0;
  for (const contact of contacts) {
    const rx = Math.max(5, Math.ceil(contact.screenRadiusX + 3));
    const ry = Math.max(3, Math.ceil(contact.screenRadiusY + 3));
    const x0 = Math.max(0, Math.floor(contact.x - rx));
    const x1 = Math.min(a.width - 1, Math.ceil(contact.x + rx));
    const y0 = Math.max(0, Math.floor(contact.y - ry));
    const y1 = Math.min(a.height - 1, Math.ceil(contact.y + ry));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = (y * a.width + x) * 4;
      const al = luminance(a.rgba[i], a.rgba[i + 1], a.rgba[i + 2]);
      const bl = luminance(b.rgba[i], b.rgba[i + 1], b.rgba[i + 2]);
      onL += al; offL += bl; pixels++;
      if (Math.abs(al - bl) >= 2) changed++;
    }
  }
  return {
    patches: contacts.length,
    pixels,
    changed,
    changedShare: pixels ? +(changed / pixels).toFixed(4) : 0,
    meanOn: pixels ? +(onL / pixels).toFixed(3) : 0,
    meanOff: pixels ? +(offL / pixels).toFixed(3) : 0,
    meanDelta: pixels ? +((onL - offL) / pixels).toFixed(3) : 0,
  };
}

async function stage(page, sceneId, spread) {
  return page.evaluate(async ({ sceneId, spread }) => {
    const [H, P, B, L, T, C, M, W, S] = await Promise.all([
      import('/src/sim/hostiles.js'), import('/src/sim/player.js'),
      import('/src/sim/bridge.js'), import('/src/sim/level.js'),
      import('/src/sim/time.js'), import('/src/render/camera.js'),
      import('/src/sim/mods.js'), import('/src/sim/weapons.js'),
      import('/src/render/scene.js'),
    ]);
    H.clearHostiles();
    M.clearMods();
    W.clearBullets();
    const centre = 51;
    T.setScrollX(48);
    Object.assign(P.player, {
      x: centre, y: L.groundTopAt(centre), vx: 0, vy: 0,
      grounded: true, crouched: false, facing: 1,
      traversalState: 'free', traversalSide: 0, ladderId: null,
      onOneWay: null, iframesUntil: 0,
    });
    P.player.aim.set(1, 0);

    const deck = (x) => {
      const y = L.groundTopAt(x);
      if (y > -100) return { x, y };
      for (let d = 0.25; d <= 3; d += 0.25) {
        const left = L.groundTopAt(x - d);
        if (left > -100) return { x: x - d, y: left };
        const right = L.groundTopAt(x + d);
        if (right > -100) return { x: x + d, y: right };
      }
      throw new Error(`no production deck near ${x}`);
    };
    const spawn = (kind, offset, lift, visualId, state, dir = -1) => {
      const site = deck(centre + offset * spread);
      const x = site.x;
      const y = site.y + lift;
      H.spawnHostile(x, y, 0, kind,
        { id: `grounding-${sceneId}-${kind}`, gating: false, dir,
          ecologyVisualId: visualId || '' }, visualId || '');
      const row = H.hostiles[H.hostiles.length - 1];
      Object.assign(row, {
        x, y, baseY: y, vx: 0, vy: 0, dir, state,
        enterUntil: 0, flashUntil: 0, stateUntil: Infinity,
        diveCdUntil: Infinity, lockUntil: 0, staggerUntil: 0, t: 0,
      });
      B.view.hostiles.sync(row);
      return { kind, id: row.id, x, y, visualId: row.ecologyVisualId || '' };
    };

    const actors = [];
    if (sceneId === 'grounded') {
      actors.push(spawn('hound', -5.0, 0, 'hound-railfang', 'prowl', 1));
      actors.push(spawn('polyp', -2.1, 0, 'polyp-needle', 'closed', 1));
      actors.push(spawn('mortar', 3.3, 0, 'mortar-craterpod', 'aim', -1));
    } else if (sceneId === 'airborne') {
      actors.push(spawn('wasp', -3.5, 3.1, 'wasp-crosswind', 'cruise', 1));
      actors.push(spawn('carrier', 3.5, 2.2, '', 'cruise', -1));
    } else {
      actors.push(spawn('warden', 2.8, 0, '', 'sealed', -1));
      const site = deck(centre - 3.0 * spread);
      P.player.x = site.x;
      P.player.y = site.y;
    }
    C.syncCamera();
    B.view.player.sync();
    for (const row of H.hostiles) B.view.hostiles.sync(row);
    S.scene.updateMatrixWorld(true);
    S.camera.updateMatrixWorld(true);
    return { actors, player: { x: P.player.x, y: P.player.y } };
  }, { sceneId, spread });
}

async function snapshot(page) {
  return page.evaluate(async () => {
    const THREE = await import('three');
    const S = await import('/src/render/scene.js');
    const contacts = [];
    const pools = [];
    const groundedSprites = [];
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const edge = new THREE.Vector3();
    const centre = new THREE.Vector3();
    const rect = S.renderer.domElement.getBoundingClientRect();
    S.scene.updateMatrixWorld(true);
    S.camera.updateMatrixWorld(true);
    S.scene.traverse((object) => {
      if (object.isMesh && object.visible && object.geometry?.userData?.spriteUnderside) {
        const materials = Array.isArray(object.material)
          ? object.material : object.material ? [object.material] : [];
        groundedSprites.push({
          name: object.name || '(unnamed sprite)',
          floor: object.geometry.userData.spriteUndersideFloor,
          colorItemSize: object.geometry.getAttribute('color')?.itemSize || 0,
          vertexColors: materials.length > 0 && materials.every((mat) => mat.vertexColors),
          mapped: materials.some((mat) => !!mat.map),
        });
      }
      if (!object.userData?.contactShadowPool) return;
      const radial = object.geometry.getAttribute('shadowRadial');
      const strength = object.geometry.getAttribute('shadowStrength');
      const active = [];
      for (let i = 0; i < object.count; i++) {
        object.getMatrixAt(i, matrix);
        matrix.decompose(position, rotation, scale);
        const shade = strength.getX(i);
        if (!(shade > 0) || !(Math.abs(scale.x) > 0.0001)) continue;
        centre.copy(position).project(S.camera);
        edge.set(position.x + Math.abs(scale.x) / 2, position.y, position.z).project(S.camera);
        const edgeY = new THREE.Vector3(
          position.x, position.y, position.z + Math.abs(scale.z) / 2).project(S.camera);
        const row = {
          row: i,
          shade: +shade.toFixed(4),
          x: +((centre.x * 0.5 + 0.5) * rect.width).toFixed(2),
          y: +((0.5 - centre.y * 0.5) * rect.height).toFixed(2),
          screenRadiusX: +(Math.abs(edge.x - centre.x) * rect.width / 2).toFixed(2),
          screenRadiusY: +(Math.abs(edgeY.y - centre.y) * rect.height / 2).toFixed(2),
        };
        active.push(row); contacts.push(row);
      }
      pools.push({
        name: object.name,
        instanced: object.isInstancedMesh,
        count: object.count,
        active: active.length,
        trianglesPerRow: object.geometry.index.count / 3,
        hasRadial: radial?.itemSize === 1,
        hasInstancedStrength: strength?.isInstancedBufferAttribute === true,
        material: object.material.type,
        blending: object.material.blending,
        expectedBlending: THREE.MultiplyBlending,
        fog: object.material.fog,
        toneMapped: object.material.toneMapped,
        map: !!object.material.map,
        runtimeTextures: object.userData.runtimeTextures,
      });
    });
    return {
      contact: globalThis.__HB_CONTACT_SHADOWS?.() || null,
      pools,
      contacts,
      groundedSprites,
      rig: globalThis.__HB_RIG_VISUAL?.() || null,
      ecology: globalThis.__HB_ENEMY_ECOLOGY_VISUAL?.() || null,
      evolution: globalThis.__HB_HOSTILE_EVOLUTION_VISUAL?.() || null,
      resources: S.rendererResourceSnapshot(),
    };
  });
}

await withIsolatedBrowser(ROOT, async ({ baseUrl, launch, newPage }) => {
  report.browser = { channel: launch.channel, via: launch.via };
  for (const layout of layouts) for (const mode of modes) {
    const owned = await newPage({
      viewport: layout.viewport,
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    const { page } = owned;
    page.on('pageerror', (error) => report.errors.push(
      `${layout.id}/${mode.id}: pageerror: ${error.stack || error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') report.errors.push(
        `${layout.id}/${mode.id}: console: ${message.text()}`);
    });
    try {
      await page.goto(`${baseUrl}/index.html?testapi=1&shell=0&audio=0&view=far&enemies=0&${mode.query}`,
        { waitUntil: 'load', timeout: 30000 });
      await page.waitForFunction(() => globalThis.HB && HB.state() === 'PLAYING' &&
        typeof globalThis.__HB_CONTACT_SHADOWS === 'function' &&
        typeof globalThis.__HB_RIG_VISUAL === 'function' &&
        typeof globalThis.__HB_ENEMY_ECOLOGY_VISUAL === 'function', null,
      { timeout: 20000 });
      await page.waitForFunction(() => {
        const ecology = globalThis.__HB_ENEMY_ECOLOGY_RUNTIME?.();
        const actors = globalThis.__HB_HOSTILE_EVOLUTION_VISUAL?.();
        return ecology?.state === 'ready' && actors?.actorMotion?.kinds &&
          Object.values(actors.actorMotion.kinds).every((row) => row.ready);
      }, null, { timeout: 20000 });
      await page.addStyleTag({ content: '#overlay { display: none !important; }' });
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => HB.state() === 'PAUSED');

      for (const sceneId of scenes) {
        const staged = await stage(page, sceneId, layout.spread);
        await page.waitForTimeout(120);
        const runtime = await snapshot(page);
        const file = resolve(OUT, `${layout.id}-${sceneId}-${mode.id}.png`);
        await page.screenshot({ path: file });
        report.captures.push({
          id: `${layout.id}-${sceneId}-${mode.id}`,
          layout: layout.id,
          scene: sceneId,
          mode: mode.id,
          viewport: layout.viewport,
          file,
          staged,
          runtime,
        });
      }

      const before = (await snapshot(page)).resources;
      await page.waitForTimeout(900);
      const after = (await snapshot(page)).resources;
      const stable = ['geometries', 'textures', 'programs'].every((key) =>
        before.memory[key] === after.memory[key]);
      gate(stable, `${layout.id}/${mode.id}: steady scene allocates no GPU resources`,
        { before: before.memory, after: after.memory });
    } finally {
      await owned.close();
    }
  }
});

for (const layout of layouts) for (const sceneId of scenes) {
  const on = report.captures.find((row) => row.layout === layout.id &&
    row.scene === sceneId && row.mode === 'on');
  const off = report.captures.find((row) => row.layout === layout.id &&
    row.scene === sceneId && row.mode === 'off');
  const pixels = comparePatches(on.file, off.file, on.runtime.contacts);
  report.comparisons.push({ layout: layout.id, scene: sceneId, on: on.file, off: off.file, pixels });
  gate(on.runtime.contact.enabled === true && off.runtime.contact.enabled === false,
    `${layout.id}/${sceneId}: A/B toggles only the shipped contact lane`);
  gate(on.runtime.pools.length === 1 && off.runtime.pools.length === 0,
    `${layout.id}/${sceneId}: enabled path owns one pool and disabled path owns zero`,
    { on: on.runtime.pools, off: off.runtime.pools });
  const pool = on.runtime.pools[0];
  gate(pool.instanced && pool.hasRadial && pool.hasInstancedStrength &&
    pool.material === 'ShaderMaterial' && pool.blending === pool.expectedBlending &&
    pool.fog && !pool.toneMapped && !pool.map && pool.runtimeTextures === 0,
  `${layout.id}/${sceneId}: fixed radial multiply footprint has no texture/canvas`, pool);
  gate(on.runtime.contacts.length >= (sceneId === 'grounded' ? 4 : sceneId === 'airborne' ? 3 : 2),
    `${layout.id}/${sceneId}: every staged visible body owns a live footprint`,
    on.runtime.contacts);
  gate(on.runtime.groundedSprites.length >=
    (sceneId === 'grounded' ? 4 : sceneId === 'airborne' ? 3 : 1) &&
    on.runtime.groundedSprites.every((row) => row.vertexColors && row.mapped &&
      row.colorItemSize === 3 && row.floor >= 0.78 && row.floor <= 1),
  `${layout.id}/${sceneId}: painted cutouts carry the fixed neutral underside ramp`,
  on.runtime.groundedSprites);
  gate(pixels.changed > 0,
    `${layout.id}/${sceneId}: true FAR A/B changes contact-region pixels`, pixels);
}

const enabled = report.captures.filter((row) => row.mode === 'on');
const covered = new Set(enabled.flatMap((row) => row.runtime.contact.coveredProfiles));
const expectedProfiles = ['rig', 'wasp', 'carrier', 'hound', 'polyp', 'mortar', 'warden'];
gate(expectedProfiles.every((key) => covered.has(key)),
  'RIG and every sprite-bodied hostile profile reach the production pool',
  { expectedProfiles, covered: [...covered].sort() });
gate(enabled.every((row) => row.runtime.contact.draws === 1 &&
  row.runtime.contact.textureCount === 0 && row.runtime.contact.runtimeCanvasCount === 0),
  'all enabled views keep the lane at one draw and zero textures/canvases');
gate(report.errors.filter((entry) => /pageerror|console/.test(entry)).length === 0,
  'browser emitted no page or console errors', report.errors);

await writeFile(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({
  ok: report.gates.every((entry) => entry.ok) && report.errors.length === 0,
  output: OUT,
  browser: report.browser,
  captures: report.captures.map((row) => ({
    id: row.id,
    file: row.file,
    liveProfiles: row.runtime.contact.liveProfiles,
    calls: row.runtime.resources.draw.calls,
    geometries: row.runtime.resources.memory.geometries,
    textures: row.runtime.resources.memory.textures,
  })),
  comparisons: report.comparisons,
  coveredProfiles: [...covered].sort(),
  gates: { passed: report.gates.filter((entry) => entry.ok).length, total: report.gates.length },
  errors: report.errors,
  report: resolve(OUT, 'report.json'),
}, null, 2));
if (report.errors.length || report.gates.some((entry) => !entry.ok)) process.exitCode = 1;
