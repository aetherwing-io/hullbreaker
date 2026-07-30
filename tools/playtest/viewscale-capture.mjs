// viewscale-capture.mjs — dev-only verification/evidence script for the
// view-scale experiment (?view=near|mid|far, CONFIG.viewScales). Reuses the
// playtest harness's own static server + playwright-core dependency; not
// wired into run.mjs because it drives ad hoc polling loops (wait for an
// airborne-near-a-wasp moment, wait for a transform-slice band commit) that
// don't fit the scripted keydown/keyup format the rest of tools/playtest/
// uses. Output goes to runs/viewscale/ (gitignored, same as the rest of
// tools/playtest/runs/).
//
//   node viewscale-capture.mjs selftest    — selftest matrix (view x pace x viewport)
//   node viewscale-capture.mjs shots       — traversal-slice screenshot evidence (boot + action moment)
//   node viewscale-capture.mjs transform   — transform-slice screenshot evidence (ritual + high-exterior)

import { chromium } from 'playwright-core';
import { startStaticServer } from './lib/server.mjs';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, 'runs', 'viewscale');
mkdirSync(OUT, { recursive: true });

async function withBrowser(fn) {
  const repoRoot = resolve(here, '..', '..');
  const server = await startStaticServer(repoRoot, { port: 0 });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    await fn(server, browser);
  } finally {
    await browser.close();
    await server.close();
  }
}

async function selftestMatrix() {
  const views = ['near', 'mid', 'far'];
  const paces = ['base', 'surge'];
  const viewports = [{ w: 1280, h: 800 }, { w: 800, h: 1000 }];
  const rows = [];
  await withBrowser(async (server, browser) => {
    for (const view of views) {
      for (const pace of paces) {
        for (const vp of viewports) {
          const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
          const page = await context.newPage();
          const url = `${server.baseUrl}/index.html?slice=traversal&pace=${pace}&view=${view}&selftest=1`;
          await page.goto(url, { waitUntil: 'load' });
          await page.waitForTimeout(2200);
          const title = await page.title();
          rows.push({ view, pace, viewport: `${vp.w}x${vp.h}`, title });
          await context.close();
        }
      }
      // transform slice, no pace axis (its own fixture) — both viewports, so
      // the portrait-correction/view-scale interaction gets exercised there too
      for (const vp of viewports) {
        const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
        const page = await context.newPage();
        const url = `${server.baseUrl}/index.html?slice=transform&view=${view}&selftest=1`;
        await page.goto(url, { waitUntil: 'load' });
        await page.waitForTimeout(2200);
        const title = await page.title();
        rows.push({ view, pace: 'transform', viewport: `${vp.w}x${vp.h}`, title });
        await context.close();
      }
    }
  });
  for (const r of rows) {
    console.log(`${r.view.padEnd(4)} ${r.pace.padEnd(5)} ${r.viewport.padEnd(9)} -> ${r.title}`);
  }
  const fails = rows.filter((r) => !/^SELFTEST PASS/.test(r.title));
  console.log(fails.length ? `\n${fails.length} FAILURES` : '\nALL PASS');
}

// A fixed, deterministic input policy (same shape as playtest's mid-route.json)
// replayed via real CDP key events, while we poll window.HB for the moment
// the player is airborne with a wasp nearby, and again to get a clean boot
// frame first.
async function driveAndCapture(page, { tag }) {
  const seq = [
    ['keydown', 'ArrowRight', 0], ['keydown', 'KeyJ', 100],
    ['keydown', 'Space', 300], ['keyup', 'Space', 480],
    ['keydown', 'Space', 1100], ['keyup', 'Space', 1280],
    ['keydown', 'Space', 1900], ['keyup', 'Space', 2080],
    ['keydown', 'Space', 2700], ['keyup', 'Space', 2880],
    ['keydown', 'Space', 3500], ['keyup', 'Space', 3680],
    ['keydown', 'Space', 4300], ['keyup', 'Space', 4480],
    ['keydown', 'Space', 5100], ['keyup', 'Space', 5280],
    ['keydown', 'Space', 5900], ['keyup', 'Space', 6080],
  ];
  const t0 = Date.now();
  let actionShot = null;
  let bootShot = null;
  const maxMs = 7000;
  let i = 0;
  while (Date.now() - t0 < maxMs) {
    const now = Date.now() - t0;
    while (i < seq.length && seq[i][2] <= now) {
      const [type, code] = seq[i];
      try { await page.keyboard[type === 'keydown' ? 'down' : 'up'](code); } catch {}
      i++;
    }
    if (!bootShot && now >= 250) {
      bootShot = await page.screenshot({ path: `${OUT}/${tag}-boot.png` });
    }
    if (!actionShot) {
      const st = await page.evaluate(() => {
        const hb = window.HB;
        if (!hb) return null;
        const p = hb.player;
        const hs = (hb.hostiles || []).filter((h) => h.hp > 0);
        const near = hs.some((h) => Math.abs(h.x - p.x) < 7 && Math.abs(h.y - p.y) < 6);
        return { grounded: p.grounded, x: p.x, y: p.y, near, hostileCount: hs.length };
      });
      if (st && !st.grounded && st.near) {
        actionShot = await page.screenshot({ path: `${OUT}/${tag}-action.png` });
        console.log(`  ${tag}: action shot at t=${now}ms player=(${st.x.toFixed(1)},${st.y.toFixed(1)}) hostiles=${st.hostileCount}`);
        break;
      }
    }
    await page.waitForTimeout(40);
  }
  if (!actionShot) {
    actionShot = await page.screenshot({ path: `${OUT}/${tag}-action-FALLBACK.png` });
    console.log(`  ${tag}: NO action moment found in ${maxMs}ms window, saved fallback screenshot`);
  }
}

async function shots() {
  const views = ['near', 'mid', 'far'];
  const paces = ['base', 'surge'];
  await withBrowser(async (server, browser) => {
    for (const view of views) {
      for (const pace of paces) {
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const page = await context.newPage();
        const url = `${server.baseUrl}/index.html?slice=traversal&pace=${pace}&view=${view}&testapi=1&enemies=1`;
        await page.goto(url, { waitUntil: 'load' });
        await page.waitForTimeout(300);
        await driveAndCapture(page, { tag: `${view}-${pace}` });
        await context.close();
      }
    }
  });
}

// Transform slice (?slice=transform): same fixed hold-right/fire/jump-every-
// ~620ms policy as tools/playtest/scripts/transform-slice.json (proven to
// clear both rituals and reach the high exterior face C). Captures one
// mid-ritual frame (first observed `eventState === 'turning'`) and one
// high-exterior frame a beat after the second break commits, per view — the
// altitude/scale-spectacle moments the coordinator asked for.
async function driveTransformAndCapture(page, { tag }) {
  const jumpTimes = [];
  for (let t = 300; t < 17000; t += 620) jumpTimes.push(t);
  const t0 = Date.now();
  let down = false;
  let ritualShot = false, highShot = false, postBand2At = null;
  await page.keyboard.down('ArrowRight');
  await page.keyboard.down('KeyJ');
  const maxMs = 18500;
  let ji = 0;
  while (Date.now() - t0 < maxMs) {
    const now = Date.now() - t0;
    if (!down && ji < jumpTimes.length && jumpTimes[ji] <= now) {
      await page.keyboard.down('Space'); down = true;
      setTimeout(() => {}, 0);
    }
    if (down && ji < jumpTimes.length && now - jumpTimes[ji] >= 310) {
      await page.keyboard.up('Space'); down = false; ji++;
    }
    const st = await page.evaluate(() => {
      const hb = window.HB;
      if (!hb) return null;
      const t = hb.snapshot().transform;
      return t ? { band: t.band, alt: t.altitude, ev: t.event, state: t.eventState } : null;
    });
    if (st) {
      if (!ritualShot && st.state === 'turning') {
        await page.screenshot({ path: `${OUT}/transform-${tag}-ritual.png` });
        console.log(`  transform-${tag}: ritual shot at t=${now}ms band=${st.band} ev=${st.ev}`);
        ritualShot = true;
      }
      if (!highShot && st.band >= 2) {
        if (postBand2At === null) postBand2At = now;
        if (now - postBand2At >= 1500) {
          await page.screenshot({ path: `${OUT}/transform-${tag}-high.png` });
          console.log(`  transform-${tag}: high-exterior shot at t=${now}ms alt=${st.alt}`);
          highShot = true;
          break;
        }
      }
    }
    await page.waitForTimeout(40);
  }
  if (!ritualShot) console.log(`  transform-${tag}: NO ritual moment observed`);
  if (!highShot) {
    await page.screenshot({ path: `${OUT}/transform-${tag}-high-FALLBACK.png` });
    console.log(`  transform-${tag}: NO post-second-break moment observed, saved fallback`);
  }
}

async function transformShots() {
  const views = ['near', 'mid', 'far'];
  await withBrowser(async (server, browser) => {
    for (const view of views) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      const url = `${server.baseUrl}/index.html?slice=transform&view=${view}&enemies=0&testapi=1`;
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForTimeout(300);
      await driveTransformAndCapture(page, { tag: view });
      await context.close();
    }
  });
}

const mode = process.argv[2];
if (mode === 'selftest') await selftestMatrix();
else if (mode === 'shots') await shots();
else if (mode === 'transform') await transformShots();
else { console.log('usage: node _viewscale_capture.mjs [selftest|shots|transform]'); process.exit(1); }
