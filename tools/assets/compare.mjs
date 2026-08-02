#!/usr/bin/env node
// compare.mjs — two assets, side by side, AT THE SIZE THE PLAYER SEES THEM,
// with the concept board they are meant to belong to in the same frame.
//
//   node tools/assets/compare.mjs --a old.png --b new.png --tiles 2 --repeat 4x4 \
//     --board docs/concept-art/01-exterior-gameplay.png --out shot.png
//
// Why this exists: view.mjs answers "does one copy read at 26px" and tile.mjs
// answers "does the repeat betray itself", and neither answers the question a
// regeneration actually raises — "is this different from what it replaced, at
// the size that matters, next to the thing it is being measured against". Three
// screenshots and a memory of the old one is not evidence; one frame with both
// in it is.
//
// The scale arithmetic is the same everywhere in this directory: RIG is 1.7
// tiles tall and renders at 3.7% of screen height in the shipped FAR view, so
// one world tile is (0.037 * 800) / 1.7 = 17.4 px on the reference 1280x800
// viewport.
//
// Honesty, same as tile.mjs and the viewer: this is a flat CSS composite. No
// fog, no perspective, no lighting, no mipmapping, no tone mapping, no UV
// mapping onto real geometry. It compares two images at a size; it does not
// predict what either looks like in the scene.

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { launchBrowser, startStaticServer, REPO_ROOT } from './lib/browser.mjs';

const RIG_TILES = 1.7;
const FAR_FRAC = 0.037;
const REF_VIEWPORT_H = 800;
const BACKDROPS = { game: '#143238', teal: '#143238', deck: '#c8834a', limb: '#2f565e', haze: '#46525f', void: '#000000', ink: '#14181e' };

const HELP = `tools/assets/compare.mjs — two assets side by side at in-game scale, with a board reference

  node tools/assets/compare.mjs --a <path> --b <path> --tiles <h|W,H> [options]

  --label-a <s>     caption for the left image  (default "before")
  --label-b <s>     caption for the right image (default "after")
  --tiles <h|W,H>   the asset's size in world tiles (default 1)
  --repeat <CxR>    tile both images C x R times instead of showing one copy
  --zoom <n>        also show both at n x true size (default 3; 0 to omit)
  --board <path>    a concept board to put in the same frame (repeat --board for more)
  --board-h <n>     board display height in px (default 300)
  --title <s>       heading text
  --bg <name|hex>   ${Object.keys(BACKDROPS).join(' | ')} | any CSS color (default game)
  --out <file>      screenshot destination (default tools/assets/runs/compare.png)
  --viewport <WxH>  browser viewport (default 1400x900; the shot is full-page)
  --headed          show the browser
  --channel <name>  chrome (default) or chromium`;

function parseArgs(argv) {
  const a = {
    a: null, b: null, labelA: 'before', labelB: 'after', tiles: '1', repeat: null,
    zoom: 3, boards: [], boardH: 300, title: null, bg: 'game', out: null,
    viewport: { width: 1400, height: 900 }, headed: false, channel: 'chrome',
  };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--a') a.a = argv[++i];
    else if (t === '--b') a.b = argv[++i];
    else if (t === '--label-a') a.labelA = argv[++i];
    else if (t === '--label-b') a.labelB = argv[++i];
    else if (t === '--tiles') a.tiles = argv[++i];
    else if (t === '--repeat') a.repeat = argv[++i];
    else if (t === '--zoom') a.zoom = Number(argv[++i]);
    else if (t === '--board') a.boards.push(argv[++i]);
    else if (t === '--board-h') a.boardH = Number(argv[++i]);
    else if (t === '--title') a.title = argv[++i];
    else if (t === '--bg') a.bg = argv[++i];
    else if (t === '--out') a.out = argv[++i];
    else if (t === '--viewport') {
      const [w, h] = String(argv[++i]).split('x').map(Number);
      if (!w || !h) { console.error('--viewport wants WxH'); process.exit(2); }
      a.viewport = { width: w, height: h };
    } else if (t === '--headed') a.headed = true;
    else if (t === '--channel') a.channel = argv[++i];
    else if (t === '--help' || t === '-h') a.help = true;
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

export async function compare(opts) {
  const root = opts.root || REPO_ROOT;
  const outAbs = resolve(root, opts.out || 'tools/assets/runs/compare.png');
  mkdirSync(dirname(outAbs), { recursive: true });

  const [tw, th] = pair(opts.tiles, [1, 1]);
  const k = (FAR_FRAC * REF_VIEWPORT_H) / RIG_TILES;
  const cellW = tw * k, cellH = th * k;
  const [cols, rows] = opts.repeat ? pair(opts.repeat, [4, 4]) : [1, 1];
  const bg = BACKDROPS[opts.bg] || opts.bg || BACKDROPS.game;
  const zoom = opts.zoom > 0 ? opts.zoom : 0;

  const server = opts.baseUrl ? null : await startStaticServer(root);
  const baseUrl = opts.baseUrl || server.baseUrl;
  const url = (p) => `${baseUrl}/${String(p).replace(/^\/+/, '')}`;

  const patch = (src, scale) => {
    const w = cellW * cols * scale, h = cellH * rows * scale;
    return opts.repeat
      ? `<div class=patch style="width:${w.toFixed(2)}px;height:${h.toFixed(2)}px;
           background-image:url('${url(src)}');background-repeat:repeat;
           background-size:${(cellW * scale).toFixed(3)}px ${(cellH * scale).toFixed(3)}px"></div>`
      : `<img class=patch src="${url(src)}" style="width:${w.toFixed(2)}px;height:${h.toFixed(2)}px">`;
  };

  const column = (src, label, scale, note) => `<div class=col>
      <div class=lab>${label}${note ? ` <span class=dim>${note}</span>` : ''}</div>
      ${patch(src, scale)}
    </div>`;

  const boardRow = opts.boards.length ? `<div class=lab style="margin-top:22px">reference board${opts.boards.length > 1 ? 's' : ''}</div>
      <div class=row>${opts.boards.map((b) => `<img src="${url(b)}" style="height:${opts.boardH}px">`).join('')}</div>` : '';

  const html = `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;background:${bg};color:#cfe0e4;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
    .wrap{padding:16px 20px;width:max-content}
    h1{font-size:13px;margin:0 0 2px;color:#ffe79b;font-weight:700}
    .meta{color:#8fa6ac;margin-bottom:14px}
    .row{display:flex;gap:28px;align-items:flex-start;flex-wrap:nowrap}
    .col{}
    .lab{color:#8fa6ac;margin:10px 0 4px}
    .dim{color:#5f7076}
    .patch{outline:1px solid #ffffff22;display:block;image-rendering:auto}
  </style><div class=wrap>
    <h1>${opts.title || `${opts.labelA}  vs  ${opts.labelB}`}</h1>
    <div class=meta>one copy = ${tw} x ${th} world tiles = ${cellW.toFixed(1)} x ${cellH.toFixed(1)} px at the shipped FAR view${opts.repeat ? ` &middot; repeated ${cols} x ${rows}` : ''} &middot; backdrop ${opts.bg}</div>
    <div class=lab>TRUE on-screen size</div>
    <div class=row>
      ${column(opts.a, opts.labelA, 1)}
      ${column(opts.b, opts.labelB, 1)}
    </div>
    ${zoom ? `<div class=lab style="margin-top:18px">${zoom}x</div>
    <div class=row>
      ${column(opts.a, opts.labelA, zoom)}
      ${column(opts.b, opts.labelB, zoom)}
    </div>` : ''}
    ${boardRow}
    <div class=meta style="margin-top:16px">approximation: flat CSS composite — no fog, perspective,
      lighting, mipmapping or UV mapping. Size comparison only.</div>
  </div>`;

  const { browser, via, channel } = await launchBrowser({ channel: opts.channel, headed: opts.headed });
  try {
    const context = await browser.newContext({ viewport: opts.viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    await page.setContent(html, { waitUntil: 'load' });
    // Every <img> and every CSS background must have decoded before the shot,
    // or the capture is of a half-loaded page that looks like a broken asset.
    await page.evaluate(async (sources) => {
      await Promise.all(sources.map((s) => new Promise((done, fail) => {
        const img = new Image();
        img.onload = done;
        img.onerror = () => fail(new Error(`could not load ${s}`));
        img.src = s;
      })));
      await document.fonts.ready;
    }, [opts.a, opts.b, ...opts.boards].map(url));
    await page.screenshot({ path: outAbs, fullPage: true });
    await context.close();
    if (errors.length) throw new Error(`page errors: ${errors.join('; ')}`);
  } finally {
    await browser.close();
    if (server) await server.close();
  }

  return {
    output: outAbs.startsWith(root) ? outAbs.slice(root.length + 1) : outAbs,
    cell: { w: +cellW.toFixed(1), h: +cellH.toFixed(1) },
    repeat: [cols, rows],
    browser: { via, channel },
  };
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.a || !args.b) { console.log(HELP); process.exit(args.a && args.b ? 0 : 2); }
  compare(args).then((r) => {
    console.log(`compare -> ${r.output}`);
    console.log(`  one copy ${r.cell.w}x${r.cell.h}px on screen, repeated ${r.repeat[0]}x${r.repeat[1]}`);
    console.log(`  ${r.browser.channel} via ${r.browser.via}`);
  }).catch((err) => {
    console.error(`compare failed: ${err.message}`);
    process.exit(1);
  });
}
