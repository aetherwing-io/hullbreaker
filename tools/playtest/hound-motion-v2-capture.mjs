#!/usr/bin/env node

/* Fast deterministic acceptance for the production hound atlas. It pauses the
 * sim but leaves the real renderer alive, then drives the renderer exclusively
 * through real hostile rows: x distance for the run row and state/vy for the
 * leap row. No debug sprite plane or atlas montage is drawn. */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { withIsolatedBrowser } from './lib/isolated-browser.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = process.env.HOUND_CAPTURE_OUT || '/private/tmp/hullbreaker-hound-v2';
mkdirSync(OUT, { recursive: true });

async function boot(owner, viewport) {
  const owned = await owner.newPage({ viewport, deviceScaleFactor: 1 });
  const { page } = owned;
  const faults = [];
  page.on('pageerror', (e) => faults.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning')
      faults.push(`${m.type()}: ${m.text()}`);
  });
  await page.goto(`${owner.baseUrl}/index.html?slice=traversal&testapi=1&enemies=0&view=far`,
    { waitUntil: 'load' });
  await page.waitForFunction(() => window.HB?.state() === 'PLAYING' &&
    typeof window.__HB_HOSTILE_EVOLUTION_VISUAL === 'function', { timeout: 15000 });
  return { page, faults, close: owned.close };
}

async function fixture(page, count) {
  const row = await page.evaluate(async (n) => {
    const H = await import('/src/sim/hostiles.js');
    const P = await import('/src/sim/player.js');
    H.clearHostiles();
    const px = P.player.x, py = P.player.y;
    const offsets = n > 2 ? [-8, -4, 4, 8] : [-4.5, 4.5];
    for (let i = 0; i < n; i++) {
      H.spawnHostile(px + offsets[i], py + 0.45, 0, 'hound', {
        dir: 1, id: `hound-v2-proof-${i}`,
      });
    }
    for (const e of H.hostiles) {
      e.hp = e.maxHp = 9999;
      e.enterUntil = 0;
      e.flashUntil = 0;
      e.diveCdUntil = Infinity;
      e.state = 'prowl';
      e.stateUntil = Infinity;
      e.vx = 0; e.vy = 0;
    }
    return { px, py, ids: H.hostiles.map((e) => e.id) };
  }, count);
  await page.waitForTimeout(50);
  return row;
}

async function setRunFrames(page, frames) {
  if (await page.evaluate(() => window.HB.state()) === 'PAUSED') {
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.HB.state() === 'PLAYING');
  }
  await page.evaluate((wanted) => {
    const totals = [0.10, 0.49, 0.88, 1.27];
    const rows = window.HB.hostiles.filter((e) => e.kind === 'hound');
    for (let i = 0; i < rows.length; i++) {
      const e = rows[i];
      e.state = 'prowl'; e.stateUntil = Infinity; e.vy = 0;
      e.x += Math.min(0.70, totals[wanted[i]]);
    }
  }, frames);
  await page.waitForTimeout(35);
  await page.evaluate((wanted) => {
    const totals = [0.10, 0.49, 0.88, 1.27];
    const rows = window.HB.hostiles.filter((e) => e.kind === 'hound');
    for (let i = 0; i < rows.length; i++)
      rows[i].x += Math.max(0, totals[wanted[i]] - 0.70);
  }, frames);
  await page.waitForTimeout(35);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.HB.state() === 'PAUSED');
}

async function setActionFrames(page, states) {
  if (await page.evaluate(() => window.HB.state()) === 'PAUSED') {
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.HB.state() === 'PLAYING');
  }
  await page.evaluate((wanted) => {
    const rows = window.HB.hostiles.filter((e) => e.kind === 'hound');
    for (let i = 0; i < rows.length; i++) {
      const e = rows[i], state = wanted[i];
      e.stateUntil = Infinity;
      if (state === 4) { e.state = 'tell'; e.vy = 0; }
      if (state === 5) { e.state = 'vault'; e.vy = 12.8; }
      if (state === 6) { e.state = 'vault'; e.vy = 0; e.y += 1.8; }
      if (state === 7) { e.state = 'skid'; e.vy = 0; e.vx = 0; }
    }
  }, states);
  await page.waitForTimeout(35);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.HB.state() === 'PAUSED');
}

async function snap(page, file) {
  const visual = await page.evaluate(() => window.__HB_HOSTILE_EVOLUTION_VISUAL());
  await page.evaluate(() => { document.getElementById('overlay').style.display = 'none'; });
  await page.screenshot({ path: `${OUT}/${file}` });
  await page.evaluate(() => { document.getElementById('overlay').style.display = ''; });
  return visual.locomotion.hound;
}

await withIsolatedBrowser(ROOT, async (owner) => {
  const report = { captures: {}, faults: [] };

  {
    const { page, faults, close } = await boot(owner, { width: 1440, height: 900 });
    await fixture(page, 4);
    await setRunFrames(page, [0, 1, 2, 3]);
    report.captures.desktopRun = await snap(page, 'desktop-far-run-0-1-2-3.png');
    await setActionFrames(page, [4, 5, 6, 7]);
    report.captures.desktopLeap = await snap(page, 'desktop-far-load-launch-air-land.png');
    report.faults.push(...faults);
    await close();
  }

  {
    const { page, faults, close } = await boot(owner, { width: 390, height: 844 });
    await fixture(page, 2);
    await setRunFrames(page, [0, 2]);
    report.captures.portraitRun = await snap(page, 'portrait-far-run-two-phases.png');
    await setActionFrames(page, [5, 6]);
    report.captures.portraitLeap = await snap(page, 'portrait-far-launch-airborne.png');
    report.faults.push(...faults);
    await close();
  }

  const ownFaults = report.faults.filter((f) =>
    /hound-gait-atlas|sprite|webgl|pageerror|uncaught|referenceerror|typeerror/i.test(f));
  report.ownFaults = ownFaults;
  const expect = {
    desktopRun: [0, 1, 2, 3], desktopLeap: [4, 5, 6, 7],
    portraitLeap: [5, 6],
  };
  for (const [name, wanted] of Object.entries(expect)) {
    const got = report.captures[name].activeFrames;
    if (!wanted.every((frame) => got.includes(frame)))
      throw new Error(`${name}: wanted frames ${wanted}, got ${got}`);
    if (report.captures[name].crossfade !== false ||
        report.captures[name].oneBodyMesh !== true)
      throw new Error(`${name}: exclusive one-body-frame contract failed`);
  }
  if (report.captures.portraitRun.activeFrames.length < 2 ||
      report.captures.portraitRun.activeFrames.some((frame) => frame >= 4))
    throw new Error(`portraitRun: expected two distinct run poses, got ${report.captures.portraitRun.activeFrames}`);
  if (ownFaults.length) throw new Error(`hound v2 runtime faults: ${ownFaults.join(' | ')}`);
  writeFileSync(`${OUT}/report.json`, JSON.stringify({ ok: true, ...report }, null, 2));
  console.log(JSON.stringify({ ok: true, out: OUT, captures: report.captures }, null, 2));
});
