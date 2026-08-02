#!/usr/bin/env node
// alpha.mjs — show what an asset's transparency actually IS.
//
//   node tools/assets/alpha.mjs assets/generated/backdrops/backdrop-limb-segment.png
//   node tools/assets/alpha.mjs <asset> --width 520 --out shot.png
//
// Why this exists: five backdrop plates were regenerated from ~50%-transparent
// cutouts into fully opaque rectangles with the fog baked in, and every gate
// stayed green — palette clean, sizes right, ids and paths stable. Nothing in
// the pipeline made the alpha channel visible, so nobody looked at it. The
// numbers are now gated by `check.mjs` against the manifest's declared `alpha`;
// this is the picture that goes with them.
//
// Four panels, because each one fails differently:
//   over the game teal   — what it looks like where it will live
//   over hot magenta     — a background nothing in this game uses, so any pixel
//                          that is NOT showing magenta is a pixel the plate is
//                          covering. An opaque plate looks identical in both.
//   over a checkerboard  — partial alpha reads as a grey haze over the squares;
//                          a hard cut reads as a knife edge
//   the alpha channel    — white opaque, black transparent, greys the feather.
//                          A cutout with a 1px cut is pure black and white here.
//
// Honesty: like every other viewer in this directory this is a flat CSS/canvas
// composite — no fog, lighting, mipmapping, perspective or UV mapping. It shows
// the alpha channel, not the scene.

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { launchBrowser, startStaticServer, REPO_ROOT } from './lib/browser.mjs';
import { alphaCensus } from './lib/png.mjs';

const HELP = `tools/assets/alpha.mjs — an asset's transparency, as numbers and as a picture

  node tools/assets/alpha.mjs <asset.png> [options]

  --width <n>       display width per panel in px (default 460)
  --label <s>       caption
  --out <file>      screenshot destination (default tools/assets/runs/alpha-<name>.png)
  --viewport <WxH>  browser viewport (default 1100x900; the shot is full-page)
  --headed          show the browser
  --channel <name>  chrome (default) or chromium`;

function parseArgs(argv) {
  const a = {
    asset: null, width: 460, label: null, out: null,
    viewport: { width: 1100, height: 900 }, headed: false, channel: 'chrome',
  };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--width') a.width = Number(argv[++i]);
    else if (t === '--label') a.label = argv[++i];
    else if (t === '--out') a.out = argv[++i];
    else if (t === '--viewport') {
      const [w, h] = String(argv[++i]).split('x').map(Number);
      if (!w || !h) { console.error('--viewport wants WxH'); process.exit(2); }
      a.viewport = { width: w, height: h };
    } else if (t === '--headed') a.headed = true;
    else if (t === '--channel') a.channel = argv[++i];
    else if (t === '--help' || t === '-h') a.help = true;
    else if (!t.startsWith('--')) a.asset = t;
    else { console.error(`unknown flag: ${t}`); process.exit(2); }
  }
  return a;
}

export async function alphaView(opts) {
  const root = opts.root || REPO_ROOT;
  const asset = String(opts.asset).replace(/^\/+/, '');
  const name = asset.split('/').pop().replace(/\.[^.]+$/, '');
  const outAbs = resolve(root, opts.out || `tools/assets/runs/alpha-${name}.png`);
  mkdirSync(dirname(outAbs), { recursive: true });

  const census = alphaCensus(resolve(root, asset));

  const server = opts.baseUrl ? null : await startStaticServer(root);
  const baseUrl = opts.baseUrl || server.baseUrl;
  const url = `${baseUrl}/${asset}`;
  const w = opts.width;

  const html = `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;background:#0d1417;color:#cfe0e4;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
    .wrap{padding:16px 20px;width:max-content}
    h1{font-size:13px;margin:0 0 2px;color:#ffe79b;font-weight:700}
    .meta{color:#8fa6ac;margin-bottom:14px}
    .row{display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start}
    .lab{color:#8fa6ac;margin:8px 0 4px}
    .panel{width:${w}px;outline:1px solid #ffffff22;background-repeat:no-repeat;background-size:100% auto}
    .teal{background-color:#143238}
    .mag{background-color:#ff4fd8}
    .check{background-color:#ffffff;background-image:
      linear-gradient(45deg,#4a4a4a 25%,transparent 25%,transparent 75%,#4a4a4a 75%),
      linear-gradient(45deg,#4a4a4a 25%,transparent 25%,transparent 75%,#4a4a4a 75%);
      background-size:16px 16px;background-position:0 0,8px 8px}
    img,canvas{display:block;width:${w}px;height:auto}
  </style><div class=wrap>
    <h1>${opts.label || asset}</h1>
    <div class=meta>alpha census over ${census.pixels.toLocaleString()} pixels —
      <b>${census.transparent.toFixed(2)}%</b> fully transparent,
      <b>${census.partial.toFixed(2)}%</b> partial (the feather),
      <b>${census.opaque.toFixed(2)}%</b> fully opaque</div>
    <div class=row>
      <div><div class=lab>over the game teal</div><div class="panel teal"><img src="${url}"></div></div>
      <div><div class=lab>over hot magenta (nothing here is magenta: what you see through is transparency)</div><div class="panel mag"><img src="${url}"></div></div>
    </div>
    <div class=row>
      <div><div class=lab>over a checkerboard (partial alpha hazes the squares)</div><div class="panel check"><img src="${url}"></div></div>
      <div><div class=lab>the alpha channel — white opaque, black transparent, grey feathered</div><canvas id=alpha></canvas></div>
    </div>
    <div class=meta style="margin-top:14px">approximation: flat CSS/canvas composite — no fog,
      lighting, mipmapping, perspective or UV mapping. This shows the alpha channel, not the scene.</div>
  </div>
  <script>
  (async () => {
    const img = new Image();
    await new Promise((done, fail) => { img.onload = done; img.onerror = fail; img.src = ${JSON.stringify(url)}; });
    const c = document.getElementById('alpha');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < d.data.length; i += 4) {
      const a = d.data[i + 3];
      d.data[i] = d.data[i + 1] = d.data[i + 2] = a;
      d.data[i + 3] = 255;
    }
    g.putImageData(d, 0, 0);
    document.documentElement.dataset.alphaReady = '1';
  })();
  </script>`;

  const { browser, via, channel } = await launchBrowser({ channel: opts.channel, headed: opts.headed });
  try {
    const context = await browser.newContext({ viewport: opts.viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    // The page is SERVED, not set: reading the alpha channel back needs
    // `getImageData`, and a canvas that has drawn an image from a different
    // origin is tainted and throws. `setContent` leaves the document on
    // about:blank, which makes every asset URL cross-origin — so the HTML is
    // fulfilled on the static server's own origin instead.
    await page.route(`${baseUrl}/__alpha__`, (route) => route.fulfill({
      status: 200, contentType: 'text/html; charset=utf-8', body: html,
    }));
    await page.goto(`${baseUrl}/__alpha__`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.dataset.alphaReady, null, { timeout: 15000 });
    await page.screenshot({ path: outAbs, fullPage: true });
    await context.close();
    if (errors.length) throw new Error(`page errors: ${errors.join('; ')}`);
  } finally {
    await browser.close();
    if (server) await server.close();
  }

  return { asset, census, output: outAbs.startsWith(root) ? outAbs.slice(root.length + 1) : outAbs, browser: { via, channel } };
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.asset) { console.log(HELP); process.exit(args.asset ? 0 : 2); }
  alphaView(args).then((r) => {
    console.log(`alpha view -> ${r.output}`);
    console.log(`  ${r.census.transparent.toFixed(2)}% transparent, ${r.census.partial.toFixed(2)}% partial, ${r.census.opaque.toFixed(2)}% opaque`);
    console.log(`  ${r.browser.channel} via ${r.browser.via}`);
  }).catch((err) => {
    console.error(`alpha view failed: ${err.message}`);
    process.exit(1);
  });
}
