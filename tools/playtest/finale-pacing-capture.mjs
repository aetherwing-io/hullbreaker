#!/usr/bin/env node
/* One-browser accelerated proof of the live Crown pacing timeline. It uses the
 * real finale sim and bridge, but pauses the composition loop between named
 * states so desktop + portrait finish in seconds instead of two full climbs. */

import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withIsolatedBrowser } from './lib/isolated-browser.mjs';

const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const repoRoot = resolve(here, '..', '..');
const out = resolve(process.argv[2] || '/private/tmp/hullbreaker-finale-pacing');
await mkdir(out, { recursive: true });

const layouts = [
  { id: 'desktop', viewport: { width: 1440, height: 900 }, lead: 3.0 },
  { id: 'portrait', viewport: { width: 430, height: 900 }, lead: 1.9 },
];

const report = { output: out, captures: [], errors: [], gates: [] };
const gate = (ok, label, detail = null) =>
  report.gates.push({ ok: Boolean(ok), label, detail });

async function prepare(page, lead) {
  return page.evaluate(async ({ lead }) => {
    const ST = await import('/src/sim/state.js');
    const W = await import('/src/sim/wavegate.js');
    const T = await import('/src/sim/time.js');
    const L = await import('/src/sim/level.js');
    const C = await import('/src/render/camera.js');
    const CR = await import('/src/render/crown.js');
    const B = await import('/src/sim/bridge.js');
    const H = await import('/src/sim/hostiles.js');
    const F = await import('/src/sim/finale.js');
    ST.setState('PAUSED');
    document.getElementById('overlay').style.display = 'none';
    document.body.classList.remove('at-modal');
    H.clearHostiles();
    F.resetFinale();
    for (const corner of W.cornerEvents) W.finishCorner(corner);
    T.setScrollX(L.END_SCROLL);
    HB.player.x = L.END_SCROLL + lead;
    HB.player.y = L.groundTopAt(HB.player.x);
    HB.player.vx = 0;
    HB.player.vy = 0;
    HB.player.hp = 3;
    HB.player.lives = 3;
    HB.player.iframesUntil = 1e12;
    C.syncCamera();
    CR.updateCrownFacetCull();
    B.view.player.sync();
    F.startFinale();
    T.advanceGameMs(F.FINALE_TIMING.armingMs + 1);
    F.updateFinale();
    return {
      state: HB.state(),
      crownVisible: CR.crownRoot.visible,
      finale: F.finaleSnapshot(),
    };
  }, { lead });
}

async function stagePressure(page) {
  return page.evaluate(async () => {
    const T = await import('/src/sim/time.js');
    const H = await import('/src/sim/hostiles.js');
    const F = await import('/src/sim/finale.js');
    const B = await import('/src/sim/bridge.js');
    const stages = new Set();
    let maximumLive = 0;
    let snapshot = F.finaleSnapshot();
    const sample = () => {
      snapshot = F.finaleSnapshot();
      stages.add(snapshot.stage);
      maximumLive = Math.max(maximumLive, snapshot.pressure.live);
      return snapshot;
    };
    const step = (ms) => {
      T.advanceGameMs(ms);
      F.updateFinale();
      return sample();
    };
    const breakSupport = () => {
      for (const enemy of [...H.hostiles]) {
        if (enemy.kind !== 'warden') H.forceBreakHostile(enemy, 'R');
      }
    };

    sample();
    breakSupport();
    for (let i = 0; i < 18 &&
        !(snapshot.wave >= 3 && snapshot.pressure.adaptiveSpawned > 0); i++) {
      step(360);
      breakSupport();
    }
    for (let i = 0; i < 8 && snapshot.pressure.live < 4; i++) step(360);
    // The accelerated finale score does not step hostile AI. Reveal the exact
    // four committed rows for visual QA without changing their gameplay data.
    for (const enemy of H.hostiles) {
      enemy.enterUntil = T.gameMs - 1;
      B.view.hostiles.sync(enemy);
    }
    document.body.classList.remove('at-modal');
    return {
      finale: snapshot,
      stages: [...stages],
      maximumLive,
      hostiles: H.hostiles.filter((enemy) => enemy.kind !== 'warden').map((enemy) => ({
        kind: enemy.kind,
        form: enemy.ecologyVisualId,
        source: enemy.finaleSource,
      })),
      state: HB.state(),
      banner: document.getElementById('finaleTitle')?.textContent || '',
    };
  });
}

async function stageTransmit(page) {
  return page.evaluate(async () => {
    const T = await import('/src/sim/time.js');
    const H = await import('/src/sim/hostiles.js');
    const F = await import('/src/sim/finale.js');
    const stages = new Set();
    let snapshot = F.finaleSnapshot();
    const warden = H.hostiles.find((enemy) => enemy.kind === 'warden');
    if (warden) H.forceBreakHostile(warden, 'R');
    for (let i = 0; i < 80 && snapshot.phase === 'defend'; i++) {
      for (const enemy of [...H.hostiles]) {
        if (enemy.kind !== 'warden') H.forceBreakHostile(enemy, 'R');
      }
      T.advanceGameMs(360);
      F.updateFinale();
      snapshot = F.finaleSnapshot();
      stages.add(snapshot.stage);
    }
    document.body.classList.remove('at-modal');
    return {
      finale: snapshot,
      stages: [...stages],
      state: HB.state(),
      banner: document.getElementById('finaleTitle')?.textContent || '',
    };
  });
}

async function stageAnswer(page) {
  return page.evaluate(async () => {
    const T = await import('/src/sim/time.js');
    const F = await import('/src/sim/finale.js');
    const ST = await import('/src/sim/state.js');
    T.advanceGameMs(F.FINALE_TIMING.transmitMs + 1);
    F.updateFinale();
    ST.setState('PLAYING');
    return {
      finale: F.finaleSnapshot(),
      state: HB.state(),
      overlayOn: document.getElementById('overlay')?.classList.contains('on') || false,
      banner: document.getElementById('finaleTitle')?.textContent || '',
    };
  });
}

async function finishAnswer(page) {
  return page.evaluate(async () => {
    const T = await import('/src/sim/time.js');
    const F = await import('/src/sim/finale.js');
    const ST = await import('/src/sim/state.js');
    ST.setState('PAUSED');
    let snapshot = F.finaleSnapshot();
    const remaining = snapshot.answerRemainingMs;
    T.advanceGameMs(Math.max(0, remaining - 1));
    F.updateFinale();
    const before = F.finaleSnapshot();
    T.advanceGameMs(2);
    F.updateFinale();
    const after = F.finaleSnapshot();
    document.getElementById('overlay').style.display = '';
    ST.setState('PLAYING');
    return { before, after, remaining };
  });
}

await withIsolatedBrowser(repoRoot, async ({ baseUrl, launch, newPage }) => {
  report.browser = launch;
  for (const layout of layouts) {
    const handle = await newPage({
      viewport: layout.viewport,
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    const { page } = handle;
    page.on('pageerror', (error) => report.errors.push(
      `${layout.id}: ${error.stack || error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error')
        report.errors.push(`${layout.id}: console: ${message.text()}`);
    });
    await page.goto(
      `${baseUrl}/index.html?testapi=1&shell=0&audio=0&view=far&enemies=0`,
      { waitUntil: 'load', timeout: 30000 },
    );
    await page.waitForFunction(() => globalThis.HB && HB.state() === 'PLAYING' &&
      typeof globalThis.__HB_FINALE_PRESENTATION === 'function', null,
    { timeout: 20000 });

    const prepared = await prepare(page, layout.lead);
    const pressure = await stagePressure(page);
    await page.waitForTimeout(80);
    const pressureFile = resolve(out, `${layout.id}-pressure.png`);
    await page.screenshot({ path: pressureFile });

    const transmit = await stageTransmit(page);
    await page.waitForTimeout(80);
    const transmitFile = resolve(out, `${layout.id}-transmit.png`);
    await page.screenshot({ path: transmitFile });

    const answerStart = await stageAnswer(page);
    await page.waitForTimeout(80);
    const answer = await page.evaluate(async () => {
      const F = await import('/src/sim/finale.js');
      return {
        finale: F.finaleSnapshot(),
        presentation: __HB_FINALE_PRESENTATION(),
        state: HB.state(),
        overlayOn: document.getElementById('overlay')?.classList.contains('on') || false,
        banner: document.getElementById('finaleTitle')?.textContent || '',
      };
    });
    const answerFile = resolve(out, `${layout.id}-answer.png`);
    await page.screenshot({ path: answerFile });

    const completion = await finishAnswer(page);
    await page.waitForFunction(() => HB.state() === 'VICTORY', null, { timeout: 3000 });
    const result = await page.evaluate(() => ({
      state: HB.state(),
      finale: HB.finale.snapshot(),
      overlayVisible: getComputedStyle(document.getElementById('overlay')).display !== 'none',
      victoryClass: document.getElementById('overlay')?.classList.contains('victory') || false,
    }));
    const resultFile = resolve(out, `${layout.id}-result.png`);
    await page.screenshot({ path: resultFile });

    report.captures.push({
      layout: layout.id,
      files: { pressure: pressureFile, transmit: transmitFile, answer: answerFile,
        result: resultFile },
      prepared, pressure, transmit, answerStart, answer, completion, result,
    });
    await handle.close();
  }
});

for (const row of report.captures) {
  gate(row.prepared.crownVisible && row.prepared.finale.phase === 'defend',
    `${row.layout}: production Crown and real finale runtime are active`);
  gate(row.pressure.finale.pressure.powerBand === 3 &&
      row.pressure.finale.pressure.live === 4 &&
      row.pressure.maximumLive <= row.pressure.finale.pressure.cap,
    `${row.layout}: demonstrated power fills but never exceeds the four-body cap`,
    row.pressure.finale.pressure);
  gate(row.pressure.finale.pressure.adaptiveSpawned > 0 &&
      row.pressure.finale.pressure.adaptiveSpawned <=
        row.pressure.finale.pressure.adaptiveCap,
    `${row.layout}: reviewed-form refill is visible and bounded`);
  gate(row.transmit.finale.phase === 'transmit' &&
      row.transmit.stages.includes('release') && row.transmit.stages.includes('uplink'),
    `${row.layout}: Warden release transitions distinctly into uplink`);
  gate(row.answer.finale.phase === 'answer' && row.answer.finale.controlRetained &&
      row.answer.state === 'PLAYING' && !row.answer.overlayOn &&
      row.answer.presentation.banner,
    `${row.layout}: Earth answer is playable, world-visible, and not a result overlay`);
  gate(row.answerStart.finale.answerRemainingMs === 2500 &&
      row.completion.before.phase === 'answer' &&
      row.completion.after.phase === 'complete' &&
      row.completion.before.answerRemainingMs === 1,
    `${row.layout}: complete stays locked through the full 2.5s answer beat`);
  gate(row.result.state === 'VICTORY' && row.result.overlayVisible &&
      row.result.victoryClass,
    `${row.layout}: results appear only after the answer completes`);
}
gate(report.errors.length === 0, 'browser emitted no page or console errors', report.errors);

await writeFile(resolve(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
const failed = report.gates.filter((row) => !row.ok);
for (const row of report.gates)
  console.log(`${row.ok ? 'PASS' : 'FAIL'} ${row.label}`);
assert.equal(failed.length, 0,
  `${failed.length} finale pacing capture gate(s) failed; see ${resolve(out, 'report.json')}`);
console.log(`\nFinale pacing capture passed: ${out}`);
