#!/usr/bin/env node
// sheet.mjs — screenshot SEVERAL assets at their true on-screen sizes, side by side.
//
//   node tools/assets/sheet.mjs --assets a.png,b.png --tiles 0.55,1.045 --out sheet.png
//   node tools/assets/sheet.mjs --assets a.png,b.png --px 9.6,18.2 --bg deck
//
// viewer.html/view.mjs answer "does THIS asset read at this size". Choosing a
// DIRECTION asks a different question — "which of these reads, and can a player
// tell them apart at a glance" — and that one is only answerable with several
// candidates at one true size in a single image. This drives sheet.html the same
// way view.mjs drives viewer.html: same static server, same Chrome, same scale
// arithmetic (RIG 1.7 tiles at 3.7% of screen height in the shipped FAR view).
//
// Same honesty limit as the viewer, and it is worth repeating because a sheet
// looks more like evidence than it is: this is a flat composite at the correct
// pixel height. No fog, no perspective, no lighting, no mipmapping, no tone
// mapping. It answers "does this read at this size", never "does this look right
// in the scene" — for that, the asset has to get into the render layer and a real
// run has to be captured with tools/playtest.

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { launchBrowser, startStaticServer, REPO_ROOT } from './lib/browser.mjs';

const HELP = `tools/assets/sheet.mjs — one screenshot of many assets at their true on-screen sizes

  node tools/assets/sheet.mjs --assets <p1,p2,...> [options]

  --assets <paths>   comma-separated repo-relative asset paths (required)
  --labels <a,b>     column labels (default: each file's basename)
  --tiles <n,m>      row sizes given in world tiles (default 0.55, a weapon capsule)
  --px <n,m>         row sizes given directly in screen pixels (overrides --tiles)
  --rowlabels <a,b>  row labels (default: the resolved pixel height)
  --view <id>        near | mid | far — which view the --tiles rows resolve at (default far)
  --bg <name|hex>    game (default) | haze | void | ink | teal | deck | limb | any CSS color
  --cell <px>        column width (default 128)
  --title <text>     header title
  --note <text>      extra line prepended to the footer's approximation note
  --out <file>       screenshot destination (default tools/assets/runs/sheet.png)
  --viewport <WxH>   browser viewport (default 1280x800, the playtest default)
  --headed           show the browser instead of running headless
  --base-url <url>   use an already-running static server instead of starting one
  --channel <name>   chrome (default) or chromium`;

function parseArgs(argv) {
  const a = {
    assets: null, labels: null, tiles: null, px: null, rowlabels: null, view: 'far',
    bg: null, cell: null, title: null, note: null, out: null,
    viewport: { width: 1280, height: 800 }, headed: false, baseUrl: null, channel: 'chrome',
  };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--assets') a.assets = argv[++i];
    else if (t === '--labels') a.labels = argv[++i];
    else if (t === '--tiles') a.tiles = argv[++i];
    else if (t === '--px') a.px = argv[++i];
    else if (t === '--rowlabels') a.rowlabels = argv[++i];
    else if (t === '--view') a.view = argv[++i];
    else if (t === '--bg') a.bg = argv[++i];
    else if (t === '--cell') a.cell = Number(argv[++i]);
    else if (t === '--title') a.title = argv[++i];
    else if (t === '--note') a.note = argv[++i];
    else if (t === '--out') a.out = argv[++i];
    else if (t === '--viewport') {
      const [w, h] = String(argv[++i]).split('x').map(Number);
      if (!w || !h) { console.error('--viewport wants WxH, e.g. 1280x800'); process.exit(2); }
      a.viewport = { width: w, height: h };
    } else if (t === '--headed') a.headed = true;
    else if (t === '--base-url') a.baseUrl = argv[++i];
    else if (t === '--channel') a.channel = argv[++i];
    else if (t === '--help' || t === '-h') a.help = true;
    else { console.error(`unknown flag: ${t}`); process.exit(2); }
  }
  return a;
}

const list = (s) => String(s).split(',').map((x) => x.trim()).filter(Boolean);

export async function sheet(opts) {
  const root = opts.root || REPO_ROOT;
  const assets = list(opts.assets).map((p) => p.replace(/^\/+/, ''));
  const labels = opts.labels ? list(opts.labels) : [];
  const rowLabels = opts.rowlabels ? list(opts.rowlabels) : [];
  const rows = opts.px
    ? list(opts.px).map((v, i) => ({ px: Number(v), label: rowLabels[i] }))
    : list(opts.tiles || '0.55').map((v, i) => ({ tiles: Number(v), view: opts.view, label: rowLabels[i] }));

  const outAbs = resolve(root, opts.out || 'tools/assets/runs/sheet.png');
  mkdirSync(dirname(outAbs), { recursive: true });

  const spec = {
    assets: assets.map((path, i) => ({ path, label: labels[i] })),
    rows,
    bg: opts.bg || 'game',
    cell: opts.cell || 128,
    title: opts.title || 'comparison sheet',
    note: opts.note || undefined,
    viewportH: opts.viewport.height,
  };

  const server = opts.baseUrl ? null : await startStaticServer(root);
  const baseUrl = opts.baseUrl || server.baseUrl;
  const url = `${baseUrl}/tools/assets/sheet.html?spec=${encodeURIComponent(JSON.stringify(spec))}`;

  const { browser, via, channel } = await launchBrowser({ channel: opts.channel, headed: opts.headed });
  try {
    const context = await browser.newContext({ viewport: opts.viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e.message || e)));
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.dataset.sheetReady, null, { timeout: 15000 });
    const ready = await page.evaluate(() => document.documentElement.dataset.sheetReady);
    if (ready === 'error') throw new Error('sheet page could not build the spec');
    // fullPage so a tall ladder is not silently cropped at the viewport edge
    await page.screenshot({ path: outAbs, fullPage: true });
    const px = await page.evaluate(() =>
      [...document.querySelectorAll('th.row')].map((el) => el.textContent));
    await context.close();
    if (pageErrors.length) throw new Error(`sheet page errors: ${pageErrors.join('; ')}`);
    return {
      output: outAbs.startsWith(root) ? outAbs.slice(root.length + 1) : outAbs,
      assets: assets.length, rows: px, browser: { via, channel }, url,
    };
  } finally {
    await browser.close();
    if (server) await server.close();
  }
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.assets) { console.log(HELP); process.exit(args.assets ? 0 : 2); }
  sheet(args).then((r) => {
    console.log(`sheet -> ${r.output}`);
    console.log(`  ${r.assets} assets at ${r.rows.length} sizes: ${r.rows.join(' · ')}`);
    console.log(`  ${r.browser.channel} via ${r.browser.via}`);
  }).catch((err) => {
    console.error(`sheet failed: ${err.message}`);
    process.exit(1);
  });
}
