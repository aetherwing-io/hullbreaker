#!/usr/bin/env node

/* Exact-frame proof for the one-atlas action-paint layer. Every row is armed
 * by an ordinary projectile fired through sim/weapons.js into a production
 * hostile. The harness records the same positional hostileImpact fact the
 * observer consumes; it never subtracts HP, calls hitHostile/removeHostile,
 * or synthesizes a render event. Death fixtures spawn in a reachable wounded
 * state at 1 HP. Each frozen on/off pair differs only by the twelve paint rows. */

import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { withIsolatedBrowser } from './lib/isolated-browser.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = process.argv.find((arg) => arg.startsWith('--out='))?.slice(6) ||
  '/private/tmp/hullbreaker-action-vfx-v2-runtime';
mkdirSync(OUT, { recursive: true });

const SEQUENCES = Object.freeze([
  { id: 'impact-R', type: 'R', kind: 'hound', death: false, minPx: 12 },
  { id: 'impact-S', type: 'S', kind: 'hound', death: false, minPx: 12 },
  { id: 'impact-L', type: 'L', kind: 'hound', death: false, minPx: 24 },
  { id: 'impact-H', type: 'H', kind: 'hound', death: false, minPx: 12 },
  { id: 'impact-F', type: 'F', kind: 'hound', death: false, minPx: 12 },
  { id: 'rupture-wasp', type: 'R', kind: 'wasp', death: true, minPx: 12 },
  { id: 'rupture-hound', type: 'R', kind: 'hound', death: true, minPx: 12 },
  { id: 'rupture-iris', type: 'R', kind: 'polyp', death: true, minPx: 12 },
  { id: 'rupture-breech', type: 'R', kind: 'mortar', death: true, minPx: 12 },
  { id: 'rupture-warden', type: 'R', kind: 'warden', death: true, minPx: 12 },
]);

async function afterPaint(page) {
  await page.evaluate(() => new Promise((done) =>
    requestAnimationFrame(() => requestAnimationFrame(done))));
}

async function boot(newPage, viewport) {
  const owned = await newPage({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const { page } = owned;
  const faults = [];
  page.on('pageerror', (error) => faults.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    const text = message.text();
    if ((message.type() === 'error' || message.type() === 'warning') &&
        !text.includes('was preloaded using link preload but not used'))
      faults.push(`${message.type()}: ${text}`);
  });
  const qs = new URLSearchParams({
    testapi: '1', enemies: '0', audio: '0', bloom: '0', view: 'far',
    juice: '1', actionvfx: '1', shell: '0',
  });
  await page.goto(`${globalThis.__HB_ACTION_BASE}/index.html?${qs}`,
    { waitUntil: 'load', timeout: 15000 });
  await page.waitForFunction(() => window.HB?.state() === 'PLAYING', null,
    { timeout: 15000 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.HB.state() === 'PAUSED');
  await installFixture(page);
  return { owned, page, faults };
}

async function installFixture(page) {
  await page.evaluate(async () => {
    const [THREE, C, H, P, L, B, T, W, RH, Cam, A, Scene, Tower] = await Promise.all([
      import('three'), import('/src/config.js'), import('/src/sim/hostiles.js'),
      import('/src/sim/player.js'), import('/src/sim/level.js'),
      import('/src/sim/bridge.js'), import('/src/sim/time.js'),
      import('/src/sim/weapons.js'), import('/src/render/hostiles.js'),
      import('/src/render/camera.js'), import('/src/render/action-vfx-runtime.js'),
      import('/src/render/scene.js'), import('/src/render/tower.js'),
    ]);
    const q = { THREE, C, H, P, L, B, T, W, RH, Cam, A, Scene, Tower,
      target: null, point: null, lastImpact: null, impacts: [] };

    // The recorder is outside the installed production observer and delegates
    // first. Its record proves both paths saw identical collision primitives
    // at identical gameMs, without reaching into the paint layer.
    const previousImpact = B.view.bullets.hostileImpact;
    B.view.bullets.hostileImpact = (
      slot, type, x, y, vx, vy, targetId, targetKind, damaged, lethal,
    ) => {
      previousImpact(slot, type, x, y, vx, vy, targetId, targetKind,
        damaged, lethal);
      q.lastImpact = { slot, type, x, y, vx, vy, targetId, targetKind,
        damaged, lethal, collisionFrameMs: T.gameMs };
      q.impacts.push(q.lastImpact);
    };
    const installBefore = A.actionVfxSnapshot().observerInstall;
    A.installActionVfxObservers();
    A.installActionVfxObservers();
    const installAfter = A.actionVfxSnapshot().observerInstall;

    function deckAt(x) {
      const y = L.groundTopAt(x);
      return y > -100 ? y : 2;
    }

    function project(s, y) {
      const pose = Tower.towerPose(s, { x: 0, y: 0, z: 0, yaw: 0, alt: 0 });
      const v = new THREE.Vector3(
        pose.x + Math.sin(pose.yaw) * 1.34,
        y + pose.alt,
        pose.z + Math.cos(pose.yaw) * 1.34,
      );
      Scene.camera.updateMatrixWorld(true);
      v.project(Scene.camera);
      return { x: (v.x * 0.5 + 0.5) * innerWidth,
        y: (-v.y * 0.5 + 0.5) * innerHeight };
    }

    function resetAt(x = 6) {
      H.clearHostiles();
      RH.clearCorpses();
      W.clearBullets();
      B.view.stateScreen('PLAYING');
      T.setScrollX(0);
      const deck = deckAt(x);
      Object.assign(P.player, {
        x, y: deck + 0.001, vx: 0, vy: 0, grounded: true,
        facing: 1, traversalState: 'free', ladderId: null, onOneWay: null,
        iframesUntil: Number.MAX_SAFE_INTEGER,
      });
      P.player.aim.set(1, 0);
      Cam.syncCamera();
      B.view.player.sync();
      q.target = null;
      q.point = null;
      q.lastImpact = null;
      q.impacts.length = 0;
      return deck;
    }

    function targetY(kind, deck) {
      if (kind === 'wasp') return deck + 3.15;
      if (kind === 'warden') return deck + C.CONFIG.warden.bodyY;
      if (kind === 'polyp' || kind === 'mortar') return deck + 1.05;
      return deck + 0.42;
    }

    function settle(e, kind) {
      e.enterUntil = 0;
      e.flashUntil = 0;
      e.armorPingUntil = 0;
      e.coreHitUntil = 0;
      e.vx = 0;
      e.vy = 0;
      e.stateUntil = Infinity;
      e.state = kind === 'wasp' ? 'cruise' : kind === 'hound' ? 'prowl'
        : kind === 'polyp' ? 'vent' : kind === 'warden' ? 'exposed' : 'cool';
      if (kind === 'warden') e.windowDamage = 0;
      e.baseY = e.y;
      B.view.hostiles.sync(e);
    }

    function step(ms) {
      let left = ms;
      while (left > 0.001) {
        const dtMs = Math.min(4, left);
        T.advanceGameMs(dtMs);
        // Match production order: the actor row is current before collision;
        // action paint then steps immediately after bullets in this frame.
        if (q.target && H.hostiles.includes(q.target))
          B.view.hostiles.sync(q.target);
        W.updateBullets(dtMs / 1000);
        A.updateActionVfx();
        RH.updateCorpses();
        left -= dtMs;
      }
    }

    function begin(sequence) {
      const playerX = 6;
      const deck = resetAt(playerX);
      const preferred = sequence.type === 'F' ? 3.4 : 4.2;
      let x = playerX + preferred;
      for (let distance = preferred; distance >= 1.8; distance -= 0.125) {
        const candidate = playerX + distance;
        if (Math.abs(deckAt(candidate) - deck) > 0.04) continue;
        x = candidate;
        break;
      }
      const targetDeck = deckAt(x);
      const y = targetY(sequence.kind, targetDeck);
      H.spawnHostile(x, y, 0, sequence.kind, {
        id: `action-vfx-v2-${sequence.id}`, dir: -1, gating: false,
        autoCycle: false, zone: { x: x - 2, y: targetDeck },
        arena: { x0: playerX - 2, x1: playerX + 10 },
        tune: sequence.death ? { hp: 1 } : undefined,
      });
      const e = H.hostiles.at(-1);
      settle(e, sequence.kind);
      q.target = e;
      const hpBefore = e.hp;
      const dx = e.x - P.player.x;
      const dy = e.y - (P.player.y + P.player.muzzleY);
      const inv = 1 / Math.max(0.001, Math.hypot(dx, dy));
      let ax = dx * inv, ay = dy * inv;
      // Plain F becomes a lob before gravity. This shallow ordinary shot lands
      // its crawler on the low hound rather than sliding under the fixture.
      if (sequence.type === 'F') { ax = 0.966; ay = -0.26; }
      P.player.aim.set(ax, ay);
      B.view.player.sync();
      W.setWeapon(sequence.type);
      W.fireWeapon(sequence.type,
        P.player.x + ax * 0.55,
        P.player.y + P.player.muzzleY + ay * 0.55,
        ax, ay, false);

      for (let i = 0; i < 300 && !q.lastImpact; i++) step(4);
      if (!q.lastImpact) {
        throw new Error(`${sequence.id}: real projectile did not collide ` +
          JSON.stringify({ player: { x: P.player.x, y: P.player.y },
            target: { x: e.x, y: e.y, hp: e.hp, hitR: e.hitR },
            aim: { ax, ay },
            bullets: W.bulletPool.filter((b) => b.alive).slice(0, 8).map((b) =>
              ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy,
                crawling: b.crawling })) }));
      }
      // Stop trailing pellets/fuel after the production collision has already
      // been resolved, recorded, and painted. This changes no proof endpoint.
      W.clearBullets();
      const event = q.lastImpact;
      q.point = project(event.x, event.y);
      const action = A.actionVfxSnapshot();
      const damage = action.lastDamageEndpoint;
      const death = action.lastDeathEndpoint;

      if (!damage) throw new Error(`${sequence.id}: collision missed action observer`);
      if (event.type !== sequence.type || event.targetKind !== sequence.kind ||
          event.damaged !== true || event.lethal !== sequence.death)
        throw new Error(`${sequence.id}: malformed production collision ` +
          JSON.stringify(event));
      if (damage.s !== event.x || damage.y !== event.y ||
          damage.vx !== event.vx || damage.vy !== event.vy ||
          damage.collisionFrameMs !== event.collisionFrameMs ||
          damage.targetId !== event.targetId || damage.targetKind !== event.targetKind)
        throw new Error(`${sequence.id}: action endpoint diverged ` +
          JSON.stringify({ event, damage }));
      if (!damage.id.startsWith(`${sequence.type.toLowerCase()}-`))
        throw new Error(`${sequence.id}: wrong weapon family ${damage.id}`);
      if (sequence.death && (!death || death.s !== event.x || death.y !== event.y ||
          death.vx !== event.vx || death.vy !== event.vy ||
          death.collisionFrameMs !== event.collisionFrameMs ||
          death.targetId !== event.targetId || death.targetKind !== event.targetKind))
        throw new Error(`${sequence.id}: rupture endpoint diverged ` +
          JSON.stringify({ event, death }));

      return {
        point: q.point,
        event,
        endpoint: { s: event.x, y: event.y },
        productionPath: {
          fired: true, collisionHook: true, woundedSpawnOnly: sequence.death,
          hpBefore, hpAfter: H.hostiles.includes(e) ? e.hp : 0,
          targetRemoved: !H.hostiles.includes(e), eventCount: q.impacts.length,
        },
        action,
        resources: Scene.rendererResourceSnapshot(),
      };
    }

    async function hitStopProof() {
      begin({ id: 'hit-stop-clock', type: 'R', kind: 'hound', death: false });
      T.resetHitStop();
      T.stepHitStop(0, P.player.hp);
      T.stepHitStop(1, P.player.hp);
      const before = A.actionVfxSnapshot();
      T.advanceGameMs(20);
      A.updateActionVfx();
      const during = A.actionVfxSnapshot();
      T.resetHitStop();
      return { before, during };
    }

    function paintVisible(visible) {
      for (const child of Scene.scene.children)
        if (child.userData.actionVfx) child.visible = visible;
    }

    window.__HB_ACTION_VFX_QA = {
      begin,
      hide: () => paintVisible(false),
      restore: () => A.updateActionVfx(),
      snapshot: A.actionVfxSnapshot,
      reset: resetAt,
      hitStopProof,
      installProbe: { before: installBefore, after: installAfter },
    };
  });
}

function dataUrl(path) {
  return `data:image/png;base64,${readFileSync(path).toString('base64')}`;
}

async function measure(analyzer, onPath, offPath, center, viewport) {
  return analyzer.evaluate(async ({ on, off, center, viewport }) => {
    const load = (src) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
    const [a, b] = await Promise.all([load(on), load(off)]);
    const radius = 78;
    const x0 = Math.max(0, Math.floor(center.x - radius));
    const y0 = Math.max(0, Math.floor(center.y - radius));
    const x1 = Math.min(viewport.width, Math.ceil(center.x + radius));
    const y1 = Math.min(viewport.height, Math.ceil(center.y + radius));
    const w = x1 - x0, h = y1 - y0;
    const ca = document.createElement('canvas'); ca.width = w; ca.height = h;
    const cb = document.createElement('canvas'); cb.width = w; cb.height = h;
    const xa = ca.getContext('2d', { willReadFrequently: true });
    const xb = cb.getContext('2d', { willReadFrequently: true });
    xa.drawImage(a, x0, y0, w, h, 0, 0, w, h);
    xb.drawImage(b, x0, y0, w, h, 0, 0, w, h);
    const da = xa.getImageData(0, 0, w, h).data;
    const db = xb.getImageData(0, 0, w, h).data;
    let pixels = 0, energy = 0, minX = w, minY = h, maxX = -1, maxY = -1;
    for (let p = 0, i = 0; p < da.length; p += 4, i++) {
      const delta = Math.abs(da[p] - db[p]) +
        Math.abs(da[p + 1] - db[p + 1]) + Math.abs(da[p + 2] - db[p + 2]);
      if (delta < 42) continue;
      const x = i % w, y = Math.floor(i / w);
      pixels++; energy += delta;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    return {
      thresholdRgbSum: 42,
      changedPixels: pixels,
      changedAreaPx: pixels,
      localCropAreaPx: w * h,
      changedAreaRatio: +(pixels / Math.max(1, w * h)).toFixed(5),
      meanRgbDelta: pixels ? +(energy / pixels).toFixed(2) : 0,
      bbox: pixels ? { x: x0 + minX, y: y0 + minY,
        width: maxX - minX + 1, height: maxY - minY + 1 } : null,
    };
  }, { on: dataUrl(onPath), off: dataUrl(offPath), center, viewport });
}

async function captureViewport(newPage, analyzer, name, viewport) {
  const dir = resolve(OUT, name);
  mkdirSync(dir, { recursive: true });
  const runtime = await boot(newPage, viewport);
  const rows = [];

  for (const sequence of SEQUENCES) {
    const beginning = await runtime.page.evaluate((entry) =>
      window.__HB_ACTION_VFX_QA.begin(entry), sequence);
    await afterPaint(runtime.page);
    const onPath = resolve(dir, `${sequence.id}-on.png`);
    const offPath = resolve(dir, `${sequence.id}-off.png`);
    await runtime.page.screenshot({ path: onPath });
    await runtime.page.evaluate(() => window.__HB_ACTION_VFX_QA.hide());
    await afterPaint(runtime.page);
    await runtime.page.screenshot({ path: offPath });
    const offSnapshot = await runtime.page.evaluate(() => ({
      action: window.__HB_ACTION_VFX_QA.snapshot(),
    }));
    await runtime.page.evaluate(() => window.__HB_ACTION_VFX_QA.restore());
    await afterPaint(runtime.page);

    const measurement = await measure(analyzer, onPath, offPath,
      beginning.point, viewport);
    if (!measurement.changedPixels) console.error('action-vfx-zero-delta', JSON.stringify({
      name, sequence, beginning, measurement,
    }));
    assert.ok(measurement.changedPixels > 0, `${name}/${sequence.id}: visible delta`);
    const extent = Math.max(measurement.bbox.width, measurement.bbox.height);
    assert.ok(extent >= Math.max(24, sequence.minPx),
      `${name}/${sequence.id}: readable extent ${extent}px`);
    assert.ok(extent <= 56, `${name}/${sequence.id}: bounded extent ${extent}px`);
    assert.equal(beginning.action.textureCount, 1, `${name}: one texture`);
    assert.equal(beginning.action.maxRows, 12, `${name}: fixed twelve rows`);
    assert.equal(beginning.action.contract.source, 'sim-bullet-hostile-impact',
      `${name}/${sequence.id}: production collision source`);
    assert.equal(beginning.action.contract.collisionFrame, true,
      `${name}/${sequence.id}: collision-frame contract`);
    assert.equal(beginning.action.contract.inference, false,
      `${name}/${sequence.id}: no inferred endpoint contract`);
    assert.equal(beginning.productionPath.fired, true,
      `${name}/${sequence.id}: fired through production weapon path`);
    assert.equal(beginning.productionPath.collisionHook, true,
      `${name}/${sequence.id}: production collision hook observed`);
    assert.equal(beginning.productionPath.targetRemoved, sequence.death,
      `${name}/${sequence.id}: lethal result matches production removal`);
    assert.ok(beginning.productionPath.hpAfter < beginning.productionPath.hpBefore,
      `${name}/${sequence.id}: production hit changed HP`);
    assert.equal(beginning.event.type, sequence.type,
      `${name}/${sequence.id}: exact weapon family event`);
    assert.equal(beginning.event.targetKind, sequence.kind,
      `${name}/${sequence.id}: exact target role event`);
    assert.equal(beginning.event.damaged, true,
      `${name}/${sequence.id}: damage result event`);
    assert.equal(beginning.event.lethal, sequence.death,
      `${name}/${sequence.id}: lethal result event`);
    assert.ok(beginning.action.visibleDraws >= 1 && beginning.action.visibleDraws <= 3,
      `${name}/${sequence.id}: modest visible draw budget`);
    const damage = beginning.action.lastDamageEndpoint;
    assert.ok(damage.id.startsWith(`${sequence.type.toLowerCase()}-`),
      `${name}/${sequence.id}: selected component belongs to weapon family`);
    for (const key of ['s', 'y', 'vx', 'vy', 'targetId', 'targetKind',
      'collisionFrameMs']) {
      const eventKey = key === 's' ? 'x' : key;
      assert.equal(damage[key], beginning.event[eventKey],
        `${name}/${sequence.id}: exact damage ${key}`);
    }
    assert.equal(damage.lethal, sequence.death,
      `${name}/${sequence.id}: action receives lethal bit`);
    const endpoint = sequence.death
      ? beginning.action.lastDeathEndpoint : damage;
    if (!endpoint || !beginning.endpoint) console.error('action-vfx-missing-endpoint',
      JSON.stringify({ name, sequence, beginning }));
    assert.equal(endpoint.s, beginning.endpoint.s, `${name}/${sequence.id}: exact s`);
    assert.equal(endpoint.y, beginning.endpoint.y, `${name}/${sequence.id}: exact y`);
    if (sequence.death) {
      for (const key of ['s', 'y', 'vx', 'vy', 'targetId', 'targetKind',
        'collisionFrameMs']) {
        const eventKey = key === 's' ? 'x' : key;
        assert.equal(endpoint[key], beginning.event[eventKey],
          `${name}/${sequence.id}: exact rupture ${key}`);
      }
      assert.equal(endpoint.role, sequence.kind,
        `${name}/${sequence.id}: role-shaped rupture`);
    }
    rows.push({ ...sequence, onPath, offPath, exactSameFrame: true,
      beginning, offSnapshot, measurement, extentPx: extent });
  }

  assert.deepEqual(runtime.faults, [], `${name}: zero browser faults`);
  const controls = await runtime.page.evaluate(async () => ({
    install: window.__HB_ACTION_VFX_QA.installProbe,
    hitStop: await window.__HB_ACTION_VFX_QA.hitStopProof(),
  }));
  assert.equal(controls.install.after.successes, 1,
    `${name}: observer installed exactly once`);
  assert.equal(controls.install.after.calls - controls.install.before.calls, 2,
    `${name}: reload probe called installer twice`);
  assert.equal(controls.install.after.skips - controls.install.before.skips, 2,
    `${name}: reload installs were idempotent no-ops`);
  const clock = controls.hitStop.during.clock;
  assert.equal(clock.lastRawMs, 20, `${name}: hit-stop proof raw clock`);
  assert.equal(clock.lastDtMs,
    +(20 * clock.configuredHitStopScale).toFixed(3),
    `${name}: painted clock uses exact hit-stop scale`);
  assert.ok(clock.hitStopHeldFrames >= 1, `${name}: held frame counted`);
  const dormant = await runtime.page.evaluate(() => {
    window.__HB_ACTION_VFX_QA.reset();
    return window.__HB_ACTION_VFX_QA.snapshot();
  });
  assert.equal(dormant.visibleDraws, 0, `${name}: dormant zero draws`);
  assert.equal(dormant.liveRows, 0, `${name}: dormant zero live rows`);
  await runtime.owned.close();
  return { name, viewport, faults: runtime.faults, controls, dormant, rows };
}

await withIsolatedBrowser(ROOT, async ({ baseUrl, newPage, launch }) => {
  globalThis.__HB_ACTION_BASE = baseUrl;
  const analyzerOwned = await newPage({ viewport: { width: 800, height: 800 },
    deviceScaleFactor: 1, reducedMotion: 'reduce' });
  await analyzerOwned.page.setContent('<!doctype html><body></body>');
  const desktop = await captureViewport(newPage, analyzerOwned.page,
    'desktop-1440x900', { width: 1440, height: 900 });
  const portrait = await captureViewport(newPage, analyzerOwned.page,
    'portrait-430x900', { width: 430, height: 900 });
  await analyzerOwned.close();
  const report = { ok: true, out: OUT, launch, desktop, portrait };
  writeFileSync(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    ok: true, out: OUT, launch,
    desktop: Object.fromEntries(desktop.rows.map((row) => [row.id, {
      id: row.beginning.action.lastDeathEndpoint?.id ||
        row.beginning.action.lastDamageEndpoint?.id,
      bbox: row.measurement.bbox, area: row.measurement.changedAreaPx,
      extentPx: row.extentPx, draws: row.beginning.action.visibleDraws,
    }])),
    portrait: Object.fromEntries(portrait.rows.map((row) => [row.id, {
      id: row.beginning.action.lastDeathEndpoint?.id ||
        row.beginning.action.lastDamageEndpoint?.id,
      bbox: row.measurement.bbox, area: row.measurement.changedAreaPx,
      extentPx: row.extentPx, draws: row.beginning.action.visibleDraws,
    }])),
    faults: { desktop: desktop.faults, portrait: portrait.faults },
  }, null, 2));
});
