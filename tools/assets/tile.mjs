#!/usr/bin/env node
// tile.mjs — screenshot a texture REPEATED, at its real on-screen size.
//
//   node tools/assets/tile.mjs assets/generated/textures/hull-panel-tile.png --tiles 2
//   node tools/assets/tile.mjs <asset> --tiles 4,1 --repeat 6x3 --bg deck --out shot.png
//
// view.mjs answers "does this asset read at this size" for ONE copy. A texture's
// defect is a different one: a seam, or a motif the eye can count. Neither is
// visible in a single copy, and both are what makes a tiled surface look tiled
// instead of looking like a hull. So this repeats the asset the way a material
// would and screenshots the result at the same derived scale everything else in
// this directory uses (RIG 1.7 tiles at 3.7% of screen height in the shipped FAR
// view, so one world tile is ~17.4px on a 1280x800 screen).
//
// Honesty, same as the viewer and the sheet: this is a flat CSS composite. No
// fog, no perspective, no lighting, no mipmapping, no tone mapping, and no UV
// mapping onto real geometry — a texture that tiles here can still show a seam
// in the scene if the render layer maps it differently. It answers "does the
// repeat betray itself", never "does this look right in the game".

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { launchBrowser, startStaticServer, REPO_ROOT } from './lib/browser.mjs';

const RIG_TILES = 1.7;                    // CONFIG.player.height
const FAR_FRAC = 0.037;                   // RIG's screen-height fraction in the shipped FAR view
const BACKDROPS = {                       // the same names sheet.html uses
  game: '#143238', teal: '#143238', deck: '#c8834a', limb: '#2f565e',
  haze: '#46525f', void: '#000000', ink: '#14181e',
};

const HELP = `tools/assets/tile.mjs — screenshot a texture repeated, at in-game scale

  node tools/assets/tile.mjs <asset-path> [options]

  --tiles <h|W,H>   the asset's size in world tiles (default 1). One number is a square.
  --repeat <CxR>    how many copies (default 4x4, or 4x1 for a strip-shaped asset)
  --bg <name|hex>   ${Object.keys(BACKDROPS).join(' | ')} | any CSS color (default game)
  --zoom <n>        draw at n x the true on-screen size as well (default 4)
  --out <file>      screenshot destination (default tools/assets/runs/tile-<name>.png)
  --viewport <WxH>  browser viewport (default 900x520)
  --headed          show the browser instead of running headless
  --base-url <url>  use an already-running static server instead of starting one
  --channel <name>  chrome (default) or chromium`;

function parseArgs(argv) {
  const a = {
    asset: null, tiles: '1', repeat: null, bg: 'game', zoom: 4, out: null,
    viewport: { width: 900, height: 520 }, headed: false, baseUrl: null, channel: 'chrome',
  };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--tiles') a.tiles = argv[++i];
    else if (t === '--repeat') a.repeat = argv[++i];
    else if (t === '--bg') a.bg = argv[++i];
    else if (t === '--zoom') a.zoom = Number(argv[++i]);
    else if (t === '--out') a.out = argv[++i];
    else if (t === '--viewport') {
      const [w, h] = String(argv[++i]).split('x').map(Number);
      if (!w || !h) { console.error('--viewport wants WxH, e.g. 900x520'); process.exit(2); }
      a.viewport = { width: w, height: h };
    } else if (t === '--headed') a.headed = true;
    else if (t === '--base-url') a.baseUrl = argv[++i];
    else if (t === '--channel') a.channel = argv[++i];
    else if (t === '--help' || t === '-h') a.help = true;
    else if (!t.startsWith('--')) a.asset = t;
    else { console.error(`unknown flag: ${t}`); process.exit(2); }
  }
  return a;
}

function pair(text, fallback) {
  const parts = String(text).split(/[,x]/).map((s) => Number(s.trim()));
  if (parts.length === 1 && Number.isFinite(parts[0])) return [parts[0], parts[0]];
  if (parts.length === 2 && parts.every(Number.isFinite)) return parts;
  return fallback;
}

export async function tile(opts) {
  const root = opts.root || REPO_ROOT;
  const asset = String(opts.asset).replace(/^\/+/, '');
  const name = asset.split('/').pop().replace(/\.[^.]+$/, '');
  const outAbs = resolve(root, opts.out || `tools/assets/runs/tile-${name}.png`);
  mkdirSync(dirname(outAbs), { recursive: true });

  const [tw, th] = pair(opts.tiles, [1, 1]);
  const [cols, rows] = pair(opts.repeat || (tw / th >= 3 ? '4x3' : '4x4'), [4, 4]);
  const k = (FAR_FRAC * 800) / RIG_TILES;          // px per world tile at the reference viewport
  const cellW = tw * k;
  const cellH = th * k;
  const bg = BACKDROPS[opts.bg] || opts.bg || BACKDROPS.game;
  const zoom = opts.zoom > 0 ? opts.zoom : 4;

  const server = opts.baseUrl ? null : await startStaticServer(root);
  const baseUrl = opts.baseUrl || server.baseUrl;
  const url = `${baseUrl}/${asset}`;

  const html = `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;background:${bg};color:#cfe0e4;
      font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
    .wrap{padding:16px 20px}
    h1{font-size:13px;margin:0 0 2px;color:#ffe79b;font-weight:700}
    .meta{color:#8fa6ac;margin-bottom:14px}
    .row{display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap}
    .lab{color:#8fa6ac;margin:10px 0 4px}
    .patch{background-image:url('${url}');background-repeat:repeat;image-rendering:auto;
      outline:1px solid #ffffff22}
    .true{width:${(cellW * cols).toFixed(2)}px;height:${(cellH * rows).toFixed(2)}px;
      background-size:${cellW.toFixed(3)}px ${cellH.toFixed(3)}px}
    .zoom{width:${(cellW * cols * zoom).toFixed(2)}px;height:${(cellH * rows * zoom).toFixed(2)}px;
      background-size:${(cellW * zoom).toFixed(3)}px ${(cellH * zoom).toFixed(3)}px}
  </style><div class=wrap>
    <h1>${asset}</h1>
    <div class=meta>one copy = ${tw} x ${th} world tiles = ${cellW.toFixed(1)} x ${cellH.toFixed(1)} px at the shipped FAR view
      &middot; repeated ${cols} x ${rows} &middot; backdrop ${opts.bg}</div>
    <div class=row>
      <div><div class=lab>TRUE on-screen size</div><div class="patch true"></div></div>
      <div><div class=lab>${zoom}x</div><div class="patch zoom"></div></div>
    </div>
    <div class=meta style="margin-top:14px">approximation: flat CSS repeat — no fog,
      perspective, lighting, mipmapping or UV mapping. Seams only.</div>
  </div>`;

  const { browser, via, channel } = await launchBrowser({ channel: opts.channel, headed: opts.headed });
  try {
    const context = await browser.newContext({ viewport: opts.viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e.message || e)));
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate((u) => new Promise((done, fail) => {
      const img = new Image();
      img.onload = done;
      img.onerror = () => fail(new Error(`could not load ${u}`));
      img.src = u;
    }), url);
    await page.screenshot({ path: outAbs });
    await context.close();
    if (pageErrors.length) throw new Error(`tile page errors: ${pageErrors.join('; ')}`);
  } finally {
    await browser.close();
    if (server) await server.close();
  }

  return {
    asset, output: outAbs.startsWith(root) ? outAbs.slice(root.length + 1) : outAbs,
    cell: { w: +cellW.toFixed(1), h: +cellH.toFixed(1) }, repeat: [cols, rows],
    browser: { via, channel },
  };
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.asset) { console.log(HELP); process.exit(args.asset ? 0 : 2); }
  tile(args).then((r) => {
    console.log(`tile -> ${r.output}`);
    console.log(`  one copy ${r.cell.w}x${r.cell.h}px on screen, repeated ${r.repeat[0]}x${r.repeat[1]}`);
    console.log(`  ${r.browser.channel} via ${r.browser.via}`);
  }).catch((err) => {
    console.error(`tile failed: ${err.message}`);
    process.exit(1);
  });
}
