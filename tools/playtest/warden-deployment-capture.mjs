#!/usr/bin/env node

/* Fast shipped-scale proof for the Crown Warden lifecycle. One real sim row
   is held at presentation-only arrival/combat beats while the normal renderer
   draws it. The harness does not change HP, hitboxes, AI or attack timing. */

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { withIsolatedBrowser } from './lib/isolated-browser.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = process.env.WARDEN_DEPLOYMENT_OUT ||
  '/private/tmp/hullbreaker-warden-deployment';
mkdirSync(OUT, { recursive: true });

const ARRIVAL = [
  { tag: '01-feet-lock', progress: 0.16, frame: 0, event: 'feet-lock' },
  { tag: '02-suspension-rise', progress: 0.32, frame: 3, event: 'suspension-rise' },
  { tag: '03-rack-unfold', progress: 0.56, frame: 4, event: 'rack-unfold' },
  { tag: '04-cannon-braced', progress: 0.84, frame: 1, event: 'cannon-braced' },
];

const COMBAT = [
  { tag: '05-braced-tell', state: 'sweepTell', progress: 0.50, frame: 1 },
  { tag: '06-committed-sweep', state: 'sweepFire', progress: 0.50, frame: 2 },
  { tag: '07-recoil', state: 'exposed', progress: 0.04, frame: 3 },
  { tag: '08-rack-tell', state: 'barrageTell', progress: 0.50, frame: 4 },
  { tag: '09-committed-barrage', state: 'barrageBurst', progress: 0.50, frame: 5 },
  { tag: '10-seal-break', state: 'exposed', progress: 0.55, frame: 6 },
  { tag: '11-damaged-exposed', state: 'exposed', progress: 0.55, frame: 7, damaged: true },
];

async function stage(page, row) {
  return page.evaluate(async (entry) => {
    const H = await import('/src/sim/hostiles.js');
    const P = await import('/src/sim/player.js');
    const B = await import('/src/sim/bridge.js');
    const RH = await import('/src/render/hostiles.js');
    const T = await import('/src/sim/time.js');
    const C = (await import('/src/config.js')).CONFIG;
    H.clearHostiles();
    RH.clearCorpses();
    const deck = P.player.y;
    H.spawnHostile(P.player.x + 4.2, deck + C.warden.bodyY, 0, 'warden', {
      dir: -1, gating: false, autoCycle: false,
      zone: { x: P.player.x + 0.4, y: deck },
      arena: { x0: P.player.x - 5, x1: P.player.x + 8 },
    });
    const e = H.hostiles[0];
    e.flashUntil = 0;
    e.armorPingUntil = 0;
    e.coreHitUntil = 0;
    e.beamReach = 0;
    e.zoneX = P.player.x + 0.4;
    e.zoneY = deck;
    if ('progress' in entry && !entry.state) {
      e.state = 'sealed';
      e.stateUntil = Infinity;
      e.enterUntil = T.gameMs + C.wasp.enterMs * (1 - entry.progress);
    } else {
      const duration = {
        sweepTell: C.warden.sweepTellMs,
        sweepFire: C.warden.sweepMs,
        barrageTell: C.warden.barrageTellMs,
        barrageBurst: C.warden.barrageMs,
        exposed: C.warden.exposedMs,
      }[entry.state];
      e.enterUntil = 0;
      e.state = entry.state;
      e.stateUntil = T.gameMs + duration * (1 - entry.progress);
      e.openedAt = T.gameMs - C.warden.exposedMs * entry.progress;
      e.beamReach = entry.state === 'sweepFire' ? C.warden.beamReach : 0;
      if (entry.damaged) e.hp = e.maxHp - C.warden.windowDamage;
    }
    B.view.hostiles.sync(e);
    document.getElementById('overlay').style.display = 'none';
    const visual = window.__HB_HOSTILE_EVOLUTION_VISUAL();
    return {
      row: visual.actorMotion.rows[0],
      runtime: visual.actorMotion,
      actor: { state: e.state, hp: e.hp, maxHp: e.maxHp },
    };
  }, row);
}

async function stageTerminal(page) {
  const before = await stage(page,
    { state: 'sweepFire', progress: 0.5, frame: 2 });
  const death = await page.evaluate(async () => {
    const H = await import('/src/sim/hostiles.js');
    H.removeHostile(0, true);
    return window.__HB_HOSTILE_DEATH_VISUAL().rows[0];
  });
  return { before, death };
}

async function advanceTerminal(page, ms) {
  return page.evaluate(async (delta) => {
    const T = await import('/src/sim/time.js');
    const RH = await import('/src/render/hostiles.js');
    T.advanceGameMs(delta);
    RH.updateCorpses();
    return window.__HB_HOSTILE_DEATH_VISUAL().rows[0];
  }, ms);
}

async function captureLayout(newPage, baseUrl, name, viewport) {
  const dir = resolve(OUT, name);
  mkdirSync(dir, { recursive: true });
  const owned = await newPage({ viewport, deviceScaleFactor: 1 });
  const { page } = owned;
  const faults = [];
  page.on('pageerror', (e) => faults.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') faults.push(`console: ${m.text()}`);
  });
  try {
    await page.goto(`${baseUrl}/index.html?slice=traversal&testapi=1&enemies=0&view=far&audio=0`,
      { waitUntil: 'load' });
    await page.waitForFunction(() => window.HB?.state() === 'PLAYING' &&
      typeof window.__HB_HOSTILE_EVOLUTION_VISUAL === 'function', { timeout: 15000 });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.HB.state() === 'PAUSED');

    const rows = [];
    for (const entry of [...ARRIVAL, ...COMBAT]) {
      const snap = await stage(page, entry);
      await page.waitForTimeout(34);
      const live = await page.evaluate(() =>
        window.__HB_HOSTILE_EVOLUTION_VISUAL().actorMotion.rows[0]);
      assert.equal(live.frame, entry.frame, `${name}/${entry.tag}: frame`);
      assert.equal(live.bodyMeshes, 1, `${name}/${entry.tag}: one body mesh`);
      assert.equal(live.bodyRotation, 0, `${name}/${entry.tag}: planted rotation`);
      assert.deepEqual(live.bodyScale, [1.45, 1.45, 1.45],
        `${name}/${entry.tag}: constant whole-body scale`);
      assert.equal(live.bodyEmission, 0, `${name}/${entry.tag}: no body glow`);
      assert.equal(live.anchorRole, 'deck-contact', `${name}/${entry.tag}: deck anchor`);
      if (!entry.state) {
        assert.equal(live.clip, 'deployment', `${name}/${entry.tag}: deployment clip`);
        assert.equal(live.event, entry.event, `${name}/${entry.tag}: deployment event`);
        assert.equal(live.visibleAttachments, 0,
          `${name}/${entry.tag}: atlas mechanics only during arrival`);
      }
      const path = resolve(dir, `${entry.tag}.png`);
      await page.screenshot({ path });
      rows.push({ ...entry, path, live, runtime: snap.runtime });
    }

    const terminal = await stageTerminal(page);
    assert.equal(terminal.death.motionFrame, 7, `${name}/terminal: breached frame`);
    assert.equal(terminal.death.poseKey, 'actor:7', `${name}/terminal: authored pose`);
    assert.equal(terminal.death.posePreserved, true, `${name}/terminal: atlas continuity`);
    assert.equal(terminal.death.paintedPieces, 6,
      `${name}/terminal: six boot-resident Warden assemblies`);
    assert.equal(terminal.death.ruptureMode, 'rooted-terminal-pieces',
      `${name}/terminal: terminal atlas splits instead of intact fade`);
    const terminalPath = resolve(dir, '12-terminal-impact.png');
    await page.waitForTimeout(34);
    await page.screenshot({ path: terminalPath });
    terminal.path = terminalPath;
    terminal.stages = [];
    for (const step of [
      { tag: '13-hardpoint-eject', delta: 300, phase: 'hardpoint-eject' },
      { tag: '14-core-implosion', delta: 410, phase: 'core-implosion' },
      { tag: '15-signal-collapse', delta: 390, phase: 'signal-collapse' },
    ]) {
      const death = await advanceTerminal(page, step.delta);
      assert.equal(death.phase, step.phase, `${name}/${step.tag}: staged rupture phase`);
      assert.equal(death.paintedPieces, 6, `${name}/${step.tag}: pieces persist`);
      assert.equal(death.ruptureMode, 'rooted-terminal-pieces',
        `${name}/${step.tag}: no intact fallback`);
      const path = resolve(dir, `${step.tag}.png`);
      await page.waitForTimeout(34);
      await page.screenshot({ path });
      terminal.stages.push({ ...step, path, death });
    }

    assert.equal(rows[0].runtime.fixedFrameGeometries, 16,
      `${name}: fixed geometry budget`);
    assert.equal(rows[0].runtime.textures, 2, `${name}: resident texture budget`);
    assert.deepEqual(faults, [], `${name}: no runtime faults`);
    return { name, viewport, rows, terminal, faults };
  } finally {
    await owned.close();
  }
}

await withIsolatedBrowser(ROOT, async ({ baseUrl, newPage }) => {
  const desktop = await captureLayout(newPage, baseUrl, 'desktop-1440x900',
    { width: 1440, height: 900 });
  const portrait = await captureLayout(newPage, baseUrl, 'portrait-430x900',
    { width: 430, height: 900 });
  const report = { ok: true, out: OUT, desktop, portrait };
  writeFileSync(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    ok: true, out: OUT,
    desktop: desktop.rows.map((row) => `${row.frame}:${row.live.event}`),
    portrait: portrait.rows.map((row) => `${row.frame}:${row.live.event}`),
    terminal: [desktop.terminal.death.motionFrame, portrait.terminal.death.motionFrame],
    fixedFrameGeometries: desktop.rows[0].runtime.fixedFrameGeometries,
    textures: desktop.rows[0].runtime.textures,
  }, null, 2));
});
