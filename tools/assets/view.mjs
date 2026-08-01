#!/usr/bin/env node
// view.mjs — screenshot an asset at in-game scale.
//
//   node tools/assets/view.mjs assets/generated/glyphs/capsule-letter-h.png
//   node tools/assets/view.mjs <asset> --tiles 0.55 --view far --out shot.png
//   node tools/assets/view.mjs <asset> --headed          # look at it yourself
//
// Serves the repo with the playtest harness's own static server, opens
// tools/assets/viewer.html against it, and screenshots the result. The scale
// arithmetic all lives in the viewer page (documented in its header comment);
// this file only drives a browser at it.
//
// The judged size is derived, not chosen: RIG is 1.7 tiles tall and renders at
// 3.7% of screen height in the shipped FAR view, so an asset `--tiles` tall
// lands at 0.037 * viewportHeight * tiles / 1.7 pixels. Default viewport is
// 1280x800, matching the playtest driver's, so the pixel numbers this prints
// are the same ones a bot run would see.

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { launchBrowser, startStaticServer, REPO_ROOT } from './lib/browser.mjs';

const HELP = `tools/assets/view.mjs — screenshot an asset at its real on-screen size

  node tools/assets/view.mjs <asset-path> [options]

  --out <file>       screenshot destination (default: tools/assets/runs/view-<name>.png)
  --tiles <n>        asset height in world tiles (default 0.55, a weapon capsule)
  --view <id>        near | mid | far (default far — the shipped default view)
  --frac <0..1>      override the RIG screen-height fraction directly
  --height-px <n>    override the on-screen height in pixels outright
  --bg <name|hex>    game (default) | haze | void | ink | any CSS color
  --viewport <WxH>   browser viewport (default 1280x800, the playtest default)
  --smooth 0         nearest-neighbour scaling instead of smooth minification
  --headed           show the browser instead of running headless
  --base-url <url>   use an already-running static server instead of starting one
  --channel <name>   chrome (default) or chromium`;

function parseArgs(argv) {
  const a = {
    asset: null, out: null, tiles: null, view: null, frac: null, heightPx: null,
    bg: null, viewport: { width: 1280, height: 800 }, smooth: null, headed: false,
    baseUrl: null, channel: 'chrome',
  };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--out') a.out = argv[++i];
    else if (t === '--tiles') a.tiles = Number(argv[++i]);
    else if (t === '--view') a.view = argv[++i];
    else if (t === '--frac') a.frac = Number(argv[++i]);
    else if (t === '--height-px') a.heightPx = Number(argv[++i]);
    else if (t === '--bg') a.bg = argv[++i];
    else if (t === '--viewport') {
      const [w, h] = String(argv[++i]).split('x').map(Number);
      if (!w || !h) { console.error('--viewport wants WxH, e.g. 1280x800'); process.exit(2); }
      a.viewport = { width: w, height: h };
    } else if (t === '--smooth') a.smooth = argv[++i];
    else if (t === '--headed') a.headed = true;
    else if (t === '--base-url') a.baseUrl = argv[++i];
    else if (t === '--channel') a.channel = argv[++i];
    else if (t === '--help' || t === '-h') a.help = true;
    else if (!t.startsWith('--')) a.asset = t;
    else { console.error(`unknown flag: ${t}`); process.exit(2); }
  }
  return a;
}

export async function view(opts) {
  const root = opts.root || REPO_ROOT;
  const asset = String(opts.asset).replace(/^\/+/, '');
  const name = asset.split('/').pop().replace(/\.[^.]+$/, '');
  const outAbs = resolve(root, opts.out || `tools/assets/runs/view-${name}.png`);
  mkdirSync(dirname(outAbs), { recursive: true });

  const server = opts.baseUrl ? null : await startStaticServer(root);
  const baseUrl = opts.baseUrl || server.baseUrl;

  const params = new URLSearchParams({ asset });
  if (opts.tiles) params.set('tiles', String(opts.tiles));
  if (opts.view) params.set('view', opts.view);
  if (opts.frac) params.set('frac', String(opts.frac));
  if (opts.heightPx) params.set('h', String(opts.heightPx));
  if (opts.bg) params.set('bg', opts.bg);
  if (opts.smooth !== null && opts.smooth !== undefined) params.set('smooth', String(opts.smooth));
  const url = `${baseUrl}/tools/assets/viewer.html?${params}`;

  const { browser, via, channel } = await launchBrowser({ channel: opts.channel, headed: opts.headed });
  let info;
  try {
    const context = await browser.newContext({ viewport: opts.viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e.message || e)));
    await page.goto(url, { waitUntil: 'load' });

    // The viewer sets data-viewer-ready once the asset's natural size is known;
    // screenshotting before that would catch a half-laid-out page.
    await page.waitForFunction(() => document.documentElement.dataset.viewerReady, null, { timeout: 8000 });
    const ready = await page.evaluate(() => document.documentElement.dataset.viewerReady);
    if (ready === 'error') throw new Error(`viewer could not load the asset: ${asset}`);

    info = await page.evaluate(() => ({
      scaleLine: document.getElementById('scaleLine')?.textContent || '',
      sizeLine: document.getElementById('sizeLine')?.textContent || '',
      inGamePx: (() => {
        const img = document.querySelector('.stop.primary img');
        return img ? +img.getBoundingClientRect().height.toFixed(1) : null;
      })(),
      rigPx: (() => {
        const bar = document.querySelector('.rigbar');
        return bar ? +bar.getBoundingClientRect().height.toFixed(1) : null;
      })(),
    }));

    await page.screenshot({ path: outAbs });
    await context.close();
    if (pageErrors.length) throw new Error(`viewer page errors: ${pageErrors.join('; ')}`);
  } finally {
    await browser.close();
    if (server) await server.close();
  }

  return {
    asset, url, output: outAbs.startsWith(root) ? outAbs.slice(root.length + 1) : outAbs,
    viewport: opts.viewport, browser: { via, channel }, ...info,
  };
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.asset) { console.log(HELP); process.exit(args.asset ? 0 : 2); }
  view(args).then((r) => {
    console.log(`viewer screenshot -> ${r.output}`);
    console.log(`  ${r.scaleLine}`);
    console.log(`  ${r.sizeLine}, rendered at ${r.inGamePx}px next to a ${r.rigPx}px RIG bar`);
    console.log(`  viewport ${r.viewport.width}x${r.viewport.height}, ${r.browser.channel} via ${r.browser.via}`);
  }).catch((err) => {
    console.error(`view failed: ${err.message}`);
    process.exit(1);
  });
}
