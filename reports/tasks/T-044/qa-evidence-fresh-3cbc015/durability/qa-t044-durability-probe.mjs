// qa-t044-durability-probe.mjs — QA-only durability probe for T-044's new
// ARRIVAL/ARENA face-2 geometry. Reuses the SAME proven reflex
// tools/playtest/t044-capture.mjs / scripts/six-face-aimed-run.json use (the
// only policy in this repo documented to reliably reach face-2 ARRIVAL/ARENA)
// so RIG gets there the same way any run does, then at each checkpoint runs
// an "abuse" phase designed to try to wedge RIG in/under/behind the new
// platforms: rapid direction reversals, drop-through spam (down+jump) on
// one-way platforms, jump-into-ceiling mash, and a settle-then-check for
// position sanity (finite x/y, not stuck airborne with zero velocity).
//
// node qa-t044-durability-probe.mjs <baseUrl>

import { chromium } from 'playwright-core';
import { sampleState } from './lib/sampler.mjs';
import { deriveThreat } from './lib/threat.mjs';

const BASE = process.argv[2] || 'http://127.0.0.1:8792';
const held = new Set();
async function setKey(page, code, wantDown) {
  const isDown = held.has(code);
  if (wantDown && !isDown) { await page.keyboard.down(code); held.add(code); }
  else if (!wantDown && isDown) { await page.keyboard.up(code); held.delete(code); }
}
async function releaseAll(page) {
  for (const code of [...held]) await setKey(page, code, false);
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String((e && e.message) || e)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const loc = m.location && m.location();
    if (loc && /favicon\.ico$/.test(loc.url || '')) return;
    consoleErrors.push(m.text());
  });

  const log = [];
  const anomalies = [];

  await page.goto(BASE + '/index.html?testapi=1', { waitUntil: 'load' });
  await page.waitForFunction(() => globalThis.HB && globalThis.HB.state() === 'PLAYING', null, { timeout: 20000 });
  await setKey(page, 'KeyJ', true); // hold fire the whole run

  function checkSane(tag, sample) {
    if (!sample) { anomalies.push(`${tag}: no sample`); return; }
    for (const [k, v] of [['x', sample.x], ['y', sample.y], ['vx', sample.vx], ['vy', sample.vy]]) {
      if (typeof v !== 'number' || Number.isNaN(v) || !Number.isFinite(v)) {
        anomalies.push(`${tag}: ${k} is not a finite number (${v})`);
      }
    }
    if (sample.y < -50 || sample.y > 200) anomalies.push(`${tag}: y out of sane bound (${sample.y})`);
  }

  // The exact 11-rule reflex from t044-capture.mjs / six-face-aimed-run.json,
  // reused verbatim (not re-derived) so this probe reaches the same terrain
  // any documented run does.
  let jumpUntil = 0;
  async function reflexStep() {
    const sample = await page.evaluate(sampleState);
    if (!sample || sample.state !== 'PLAYING') return sample;
    const t = deriveThreat(sample, held);
    const terrain = sample.terrain || { gapDist: 99 };
    const pinned = sample.grounded && Math.abs(sample.vx) < 0.3 && (held.has('ArrowLeft') || held.has('ArrowRight'));
    const houndTell = (sample.hostiles || []).some((h) => h.kind === 'hound' && h.state === 'tell');

    let right = null, left = null, up = false;
    if (!sample.hudTC) right = true;
    else if (t.upDist < 13 && t.upDx > 1 && t.upSlope < 2.5) right = true;
    else if (t.upDist < 13 && t.upDx < -1 && t.upSlope < 2.5) left = true;
    else if (t.upDist > 13 && t.dx > 2) right = true;
    else if (t.upDist > 13 && t.dx < -2) left = true;
    if (sample.edgeMargin < 8) right = true;
    if (t.upDist < 13 && t.upSlope > 0.5) up = true;

    await setKey(page, 'ArrowRight', !!right && !left);
    await setKey(page, 'ArrowLeft', !!left);
    await setKey(page, 'ArrowUp', up);

    const now = Date.now();
    let doJump = false;
    if (pinned) doJump = true;
    else if (houndTell) doJump = true;
    else if (sample.grounded && terrain.gapDist > 3 && t.upDist > 3.5) doJump = true;
    else if (sample.grounded && terrain.gapDist < 2.2) doJump = true;
    else if (!sample.grounded && sample.vy < 0 && terrain.gapDist < 1.2) doJump = true;
    if (doJump && now > jumpUntil) {
      await setKey(page, 'Space', true);
      jumpUntil = now + 420;
      setTimeout(() => { setKey(page, 'Space', false).catch(() => {}); }, 420);
    }
    return sample;
  }

  async function driveUntil(label, targetX, maxMs) {
    const t0 = Date.now();
    let s = null;
    while (Date.now() - t0 < maxMs) {
      s = await page.evaluate(sampleState);
      if (!s) { await page.waitForTimeout(45); continue; }
      if (s.state !== 'PLAYING') { log.push(`${label}: stopped, state=${s.state} at x=${s.x?.toFixed(2)}`); break; }
      if (s.x >= targetX) break;
      await reflexStep();
      await page.waitForTimeout(45);
    }
    log.push(`${label}: x=${s?.x?.toFixed(2)} state=${s?.state} at t=${Date.now() - t0}ms (target ${targetX})`);
    return s;
  }

  async function abusePhase(label, cycles) {
    await setKey(page, 'ArrowRight', false); await setKey(page, 'ArrowLeft', false);
    await setKey(page, 'ArrowUp', false); await setKey(page, 'Space', false);
    const before = await page.evaluate(sampleState);
    for (let i = 0; i < cycles; i++) {
      await setKey(page, 'ArrowLeft', i % 2 === 0);
      await setKey(page, 'ArrowRight', i % 2 === 1);
      await setKey(page, 'ArrowUp', i % 4 === 0);
      if (i % 3 === 0) {
        await setKey(page, 'ArrowDown', true);
        await setKey(page, 'Space', true);
        setTimeout(() => { setKey(page, 'Space', false).catch(() => {}); }, 80);
      } else {
        await setKey(page, 'ArrowDown', false);
        await setKey(page, 'Space', i % 2 === 0);
      }
      await page.waitForTimeout(55);
    }
    await releaseAll(page);
    await page.waitForTimeout(600); // let physics settle
    const after = await page.evaluate(sampleState);
    log.push(`${label} before: x=${before?.x?.toFixed(2)} y=${before?.y?.toFixed(2)} grounded=${before?.grounded} state=${before?.state}`);
    log.push(`${label} after:  x=${after?.x?.toFixed(2)} y=${after?.y?.toFixed(2)} grounded=${after?.grounded} vx=${after?.vx?.toFixed(2)} vy=${after?.vy?.toFixed(2)} state=${after?.state} hp=${after?.hp} lives=${after?.lives}`);
    checkSane(label, after);
    if (after && after.state === 'PLAYING' && !after.grounded && Math.abs(after.vx) < 0.05 && Math.abs(after.vy) < 0.05) {
      anomalies.push(`${label}: airborne with near-zero velocity after 600ms settle — possible wedge`);
    }
    return after;
  }

  // Checkpoint 1: just before / on the face-2 ARRIVAL catwalk (landmark ~94)
  await driveUntil('approach-ARRIVAL', 96, 60000);
  await abusePhase('abuse-ARRIVAL', 40);

  // Checkpoint 2: inside the face-2 ARENA (landmark ~124)
  await setKey(page, 'KeyJ', true);
  const afterArrivalState = await page.evaluate(sampleState);
  if (afterArrivalState && afterArrivalState.state === 'PLAYING') {
    await driveUntil('approach-ARENA', 126, 60000);
    await abusePhase('abuse-ARENA', 60);
  } else {
    log.push('skipped ARENA checkpoint: not PLAYING after ARRIVAL abuse (state=' + afterArrivalState?.state + ')');
  }

  // Final responsiveness check: resume driving for a few seconds
  await setKey(page, 'KeyJ', true);
  const beforeResume = await page.evaluate(sampleState);
  if (beforeResume && beforeResume.state === 'PLAYING') {
    const t2 = Date.now();
    while (Date.now() - t2 < 6000) { await reflexStep(); await page.waitForTimeout(45); }
    const afterResume = await page.evaluate(sampleState);
    log.push(`post-abuse responsiveness: x ${beforeResume?.x?.toFixed(2)} -> ${afterResume?.x?.toFixed(2)}, state ${beforeResume?.state} -> ${afterResume?.state}, hp ${beforeResume?.hp} -> ${afterResume?.hp}, lives ${beforeResume?.lives} -> ${afterResume?.lives}`);
  } else {
    log.push(`post-abuse responsiveness: not PLAYING (state=${beforeResume?.state}), skipping resume check`);
  }

  await releaseAll(page);
  await context.close();
  await browser.close();

  console.log('\n=== LOG ===');
  for (const l of log) console.log(l);
  console.log('\n=== ANOMALIES ===');
  console.log(anomalies.length ? anomalies.join('\n') : '(none)');
  console.log('\n=== pageErrors ===');
  console.log(JSON.stringify(pageErrors));
  console.log('\n=== consoleErrors ===');
  console.log(JSON.stringify(consoleErrors));
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
