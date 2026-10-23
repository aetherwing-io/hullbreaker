// lib.mjs — shared boot for the T-123 crisp-sprite captures and probes.
//
// openGame() boots index.html in an isolated headless Chrome context the way
// a real device would see it on a host that cannot keep up:
//   * src/render/preload.js's two boot budgets raised to 240 s at the ROUTE
//     layer (the served file differs only in those constants), so every atlas
//     loads instead of the procedural fallbacks a 2.5 s budget leaves here;
//   * src/render/post.js's 1.2 s composer boot budget raised the same way
//     unless `direct` is set, so the shipped composed path (bloom + ACES
//     OutputPass) is what is measured — on this host the addons otherwise
//     miss the budget and the game keeps its direct fallback;
//   * optionally the three.js CDN served from a local copy (`threeDir`),
//     byte-identical files, so a boot does not wait on the network.
// Nothing under src/ is modified on disk; ports are whatever the caller
// serves on (the tools never bind 8741/8742).

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const VIEWS = Object.freeze({
  desktop: { viewport: { width: 1280, height: 720 }, dpr: 1, frame: null },
  phone: { viewport: { width: 844, height: 390 }, dpr: 2, frame: null },
  phone3: { viewport: { width: 844, height: 390 }, dpr: 3, frame: null },
  portrait: { viewport: { width: 390, height: 844 }, dpr: 3, frame: null },
  spikephone: { viewport: { width: 844, height: 518 }, dpr: 2, frame: { width: 844, height: 390 } },
});

const THREE_FILES = {
  'build/three.module.js': 'three.module.js',
  'examples/jsm/postprocessing/EffectComposer.js': 'EffectComposer.js',
  'examples/jsm/postprocessing/RenderPass.js': 'RenderPass.js',
  'examples/jsm/postprocessing/UnrealBloomPass.js': 'UnrealBloomPass.js',
  'examples/jsm/postprocessing/OutputPass.js': 'OutputPass.js',
  'examples/jsm/postprocessing/Pass.js': 'Pass.js',
  'examples/jsm/shaders/OutputShader.js': 'OutputShader.js',
};

export const TIMEOUT = 900000;
export const BASE_QUERY = 'testapi=1&audio=0&shell=0&adaptive=0&momentum=0&score=0&fixeddt=16.667';

export async function openGame(browser, base, V, { query = '', threeDir = '', direct = false, errors = [] } = {}) {
  const context = await browser.newContext({ viewport: V.viewport, deviceScaleFactor: V.dpr });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    const t = m.text();
    if (/did not load|still loading|failed|error/i.test(t)) errors.push('console: ' + t.slice(0, 240));
  });
  if (threeDir) {
    await context.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', async (route) => {
      const rel = route.request().url().split('three@0.170.0/')[1];
      const file = THREE_FILES[rel];
      if (!file || !existsSync(join(threeDir, file))) return route.continue();
      return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8',
        body: await readFile(join(threeDir, file)), headers: { 'Access-Control-Allow-Origin': '*' } });
    });
  }
  await page.route('**/src/render/preload.js', async (route) => {
    const src = await (await route.fetch()).text();
    const patched = src
      .replace(/export const PRELOAD_BUDGET_MS = \d+;/, 'export const PRELOAD_BUDGET_MS = 240000;')
      .replace(/export const MOBILE_PRELOAD_BUDGET_MS = \d+;/, 'export const MOBILE_PRELOAD_BUDGET_MS = 240000;');
    if (patched === src) errors.push('preload.js budget constants not found');
    return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: patched,
      headers: { 'Cache-Control': 'no-store' } });
  });
  if (!direct) {
    await page.route('**/src/render/post.js', async (route) => {
      const src = await (await route.fetch()).text();
      const patched = src.replace(/const POST_BOOT_BUDGET_MS = \d+;/, 'const POST_BOOT_BUDGET_MS = 240000;');
      if (patched === src) errors.push('post.js boot budget constant not found');
      return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: patched,
        headers: { 'Cache-Control': 'no-store' } });
    });
  }
  await page.addInitScript(() => {
    const st = document.createElement('style');
    st.textContent = '#fail{display:none!important}#overlay{display:none!important}';
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(st));
  });
  const t0 = Date.now();
  await page.goto(`${base}/index.html?${BASE_QUERY}${query ? '&' + query : ''}`, { waitUntil: 'commit', timeout: TIMEOUT });
  await page.waitForFunction(() => !!window.HB, null, { timeout: TIMEOUT, polling: 1000 });
  const st = await page.evaluate(() => window.HB.state());
  if (st === 'MENU') await page.keyboard.press('Enter');
  else if (st !== 'PLAYING') await page.keyboard.press('r');
  await page.waitForFunction(() => window.HB?.state() === 'PLAYING', null, { timeout: TIMEOUT, polling: 1000 });
  return { context, page, bootMs: Date.now() - t0 };
}

export const frames = (page, n) => page.evaluate((k) => new Promise((r) => {
  let i = 0; const f = () => (++i >= k ? r() : requestAnimationFrame(f)); requestAnimationFrame(f);
}), n);

// The renderer facts the no-resample box is judged on, read live.
export async function rendererFacts(page) {
  return page.evaluate(async () => {
    const S = await import('/src/render/scene.js');
    const P = await import('/src/render/post.js');
    const c = S.renderer.domElement;
    const pre = window.__HB_PRELOAD ? window.__HB_PRELOAD() : null;
    const ps = P.postSnapshot ? P.postSnapshot() : null;
    return {
      pixelRatio: S.renderer.getPixelRatio(), canvas: [c.width, c.height],
      css: [c.clientWidth, c.clientHeight], dpr: devicePixelRatio,
      compositorScale: [c.clientWidth * devicePixelRatio / c.width, c.clientHeight * devicePixelRatio / c.height],
      imageRendering: getComputedStyle(c).imageRendering,
      resources: S.rendererResourceSnapshot ? S.rendererResourceSnapshot() : null,
      post: ps ? { status: ps.status, samples: ps.samples, pixelRatio: ps.pixelRatio } : null,
      preload: pre ? { costMs: pre.costMs, notReady: pre.assets.filter((e) => e.state !== 'ready')
        .map((e) => e.url.split('/').pop() + ' ' + e.state) } : null,
    };
  });
}
