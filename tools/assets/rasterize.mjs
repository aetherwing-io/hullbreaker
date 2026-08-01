#!/usr/bin/env node
// rasterize.mjs — SVG -> PNG through the playtest harness's Chrome.
//
//   node tools/assets/rasterize.mjs assets/generated/glyphs/foo.svg
//   node tools/assets/rasterize.mjs foo.svg --size 128 --out foo.png
//   node tools/assets/rasterize.mjs foo.svg --width 256 --height 128 --bg '#232830'
//
// Why a browser and not a rasterizer library: Chrome is already vendored for
// `tools/playtest`, it is the same renderer that will actually composite this
// asset if it ever loads as a CSS/img element, and it costs the repo zero new
// dependencies. The trade recorded in the README: PNG bytes are only
// reproducible against the same Chrome build, since antialiasing is the
// renderer's business, not ours.
//
// Output is transparent by default (`omitBackground`) — a glyph has to
// composite over whatever the game puts behind it. `--bg` bakes a background in
// for assets that genuinely own their backdrop.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';

import { launchBrowser, REPO_ROOT } from './lib/browser.mjs';
import { readSvgSize } from './lib/svg.mjs';
import { histogram } from './lib/png.mjs';
import { checkColors } from './lib/palette.mjs';

const HELP = `tools/assets/rasterize.mjs — render an SVG to PNG at an exact pixel size

  node tools/assets/rasterize.mjs <input.svg> [options]

  --out <file>      output path (default: input path with .png)
  --size <n>        square output, n x n
  --width <n>       explicit width  (default: the SVG's own width/viewBox)
  --height <n>      explicit height
  --scale <n>       multiply the SVG's declared size by n
  --bg <color>      bake a background color in (default: transparent)
  --channel <name>  browser channel: chrome (default) or chromium
  --quiet           only print the output path`;

function parseArgs(argv) {
  const a = { input: null, out: null, size: null, width: null, height: null, scale: null, bg: null, channel: 'chrome', quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--out') a.out = argv[++i];
    else if (t === '--size') a.size = Number(argv[++i]);
    else if (t === '--width') a.width = Number(argv[++i]);
    else if (t === '--height') a.height = Number(argv[++i]);
    else if (t === '--scale') a.scale = Number(argv[++i]);
    else if (t === '--bg') a.bg = argv[++i];
    else if (t === '--channel') a.channel = argv[++i];
    else if (t === '--quiet') a.quiet = true;
    else if (t === '--help' || t === '-h') a.help = true;
    else if (!t.startsWith('--')) a.input = t;
    else { console.error(`unknown flag: ${t}`); process.exit(2); }
  }
  return a;
}

/** Force the root <svg> to an exact pixel box, preserving its user-unit viewBox. */
export function prepareSvg(svgText, width, height, declaredSize) {
  const rootMatch = /<svg\b[^>]*>/i.exec(svgText);
  if (!rootMatch) throw new Error('input has no <svg> root element');
  let tag = rootMatch[0];

  const hasViewBox = /\bviewBox\s*=/i.test(tag);
  tag = tag.replace(/\s+(width|height)\s*=\s*["'][^"']*["']/gi, '');
  let inject = ` width="${width}" height="${height}"`;
  if (!hasViewBox) {
    const w = declaredSize.width ?? width;
    const h = declaredSize.height ?? height;
    inject += ` viewBox="0 0 ${w} ${h}"`;             // without this, scaling would crop, not scale
  }
  tag = tag.replace(/<svg\b/i, `<svg${inject}`);
  return svgText.slice(0, rootMatch.index) + tag + svgText.slice(rootMatch.index + rootMatch[0].length);
}

export async function rasterize({
  input, out, size = null, width = null, height = null, scale = null,
  bg = null, channel = 'chrome', root = REPO_ROOT,
}) {
  const inAbs = resolve(root, input);
  if (extname(inAbs).toLowerCase() !== '.svg') throw new Error(`expected an .svg input, got ${input}`);
  const declared = readSvgSize(inAbs);

  let w = width, h = height;
  if (size) { w = size; h = size; }
  if (scale) {
    if (!declared.width || !declared.height) throw new Error('--scale needs the SVG to declare a width/height or viewBox');
    w = Math.round(declared.width * scale); h = Math.round(declared.height * scale);
  }
  w = w ?? declared.width; h = h ?? declared.height;
  if (!w || !h) throw new Error('cannot determine output size: pass --size/--width/--height, or give the SVG a width/height or viewBox');
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1) throw new Error(`bad output size ${w}x${h}`);

  const outAbs = resolve(root, out || join(dirname(inAbs), `${basename(inAbs, '.svg')}.png`));
  mkdirSync(dirname(outAbs), { recursive: true });

  const svg = prepareSvg(readFileSync(inAbs, 'utf8'), w, h, declared);
  const html = `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:${bg || 'transparent'};}
    svg{display:block;}
  </style>${svg}`;

  const { browser, via, source } = await launchBrowser({ channel });
  let bytes;
  try {
    const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e.message || e)));
    await page.setContent(html, { waitUntil: 'load' });
    bytes = await page.screenshot({ omitBackground: !bg });
    await context.close();
    if (pageErrors.length) throw new Error(`page errors while rendering: ${pageErrors.join('; ')}`);
  } finally {
    await browser.close();
  }

  writeFileSync(outAbs, bytes);

  // Immediate round-trip proof: decode what was just written and report the
  // palette it actually contains, so a bad render is visible here rather than
  // three steps later in check.mjs.
  const hist = histogram(outAbs, { alphaFloor: 8 });
  const pal = checkColors(
    hist.colors.map((c) => ({ color: { r: c.r, g: c.g, b: c.b }, coverage: c.coverage, count: c.count })),
    { minCoverage: 0.005 }
  );

  return {
    input: inAbs.slice(root.length + 1),
    output: outAbs.slice(root.length + 1),
    size: { w: hist.width, h: hist.height },
    requested: { w, h },
    bytes: bytes.length,
    browser: { via, source, channel },
    palette: { ok: pal.ok, roles: pal.roles, offPalette: pal.offPalette },
    coverage: { opaque: hist.opaque, transparent: hist.transparent, unique: hist.unique },
  };
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.input) { console.log(HELP); process.exit(args.input ? 0 : 2); }
  rasterize(args).then((r) => {
    if (args.quiet) { console.log(r.output); return; }
    console.log(`rasterized ${r.input} -> ${r.output}`);
    console.log(`  ${r.size.w}x${r.size.h}, ${(r.bytes / 1024).toFixed(1)}kB, ${r.coverage.unique} unique colors, ${((r.coverage.transparent / (r.coverage.opaque + r.coverage.transparent)) * 100).toFixed(0)}% transparent`);
    console.log(`  browser: ${r.browser.channel} via ${r.browser.via}`);
    console.log(`  palette: ${r.palette.ok ? 'ok' : 'OFF-PALETTE'} — ${r.palette.roles.map((x) => `${x.id} ${(x.coverage * 100).toFixed(0)}%`).join(', ')}`);
    for (const o of r.palette.offPalette) console.log(`    off-palette ${o.hex} at ${(o.coverage * 100).toFixed(2)}% — ${o.reason}`);
  }).catch((err) => {
    console.error(`rasterize failed: ${err.message}`);
    process.exit(1);
  });
}
