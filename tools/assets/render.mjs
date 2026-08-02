#!/usr/bin/env node
// render.mjs — RECIPE -> PNG. The raster half of the pipeline.
//
//   node tools/assets/render.mjs assets/generated/textures/hull-panel-tile.recipe.js
//   node tools/assets/render.mjs <recipe> --out foo.png --width 256 --height 128
//   node tools/assets/render.mjs <recipe> --seed 7 --no-verify --headed
//
// WHY THIS EXISTS ALONGSIDE rasterize.mjs. The SVG route (gen.mjs -> codex ->
// <svg> -> rasterize.mjs) asks a *coding* agent for placed vector shapes, and
// gets back what that ask can express: flat rectangles, hard edges, clip-art.
// The concept boards are painted — grain, wear, panel-gap occlusion, gradient
// depth, atmospheric haze. A generator cannot emit a painting, but it can write
// a PROGRAM that renders one, and that ask has a far higher ceiling while
// keeping every property the SVG route was chosen for: the source is text, it
// diffs, it is deterministic, and the pixels are palette-checkable.
//
// The recipe contract (tools/assets/codex/raster-spec-template.md states it to
// the generator, tools/assets/lib/recipe.mjs enforces it here):
//
//     export const meta = { id, size: { w, h }, seed, roles: [...] };
//     export function render(ctx, env) { ... }        // env: lib/procgen.mjs
//
// Determinism is not asserted, it is PROVED on every run: the recipe is
// rendered twice in two separate browser contexts and the PNG bytes must be
// identical. `--no-verify` skips the second render and says so in the output.
//
// Honest limitation, same as rasterize.mjs: bytes are reproducible against the
// same Chrome build. Canvas 2D compositing and any browser-side rounding belong
// to the renderer, not to us. Two different Chrome versions can differ by a
// least-significant bit; the recipe and the seed are the durable record.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import { launchBrowser, startStaticServer, REPO_ROOT } from './lib/browser.mjs';
import { scanRecipe } from './lib/recipe.mjs';
import { histogram } from './lib/png.mjs';
import { checkRasterColors, ALPHA_HUE_FLOOR } from './lib/palette.mjs';

const HELP = `tools/assets/render.mjs — run a procedural recipe and write its PNG

  node tools/assets/render.mjs <recipe.js> [options]

  --out <file>      output path (default: the recipe path with .png, minus ".recipe")
  --width <n>       canvas width  (default: the recipe's meta.size.w)
  --height <n>      canvas height (default: the recipe's meta.size.h)
  --size <n>        square shorthand for --width n --height n
  --seed <n>        override meta.seed (A/B only — the committed asset uses meta.seed)
  --no-verify       skip the second render that proves the output is reproducible
  --headed          show the browser (the canvas is on the page)
  --channel <name>  chrome (default) or chromium
  --base-url <url>  use an already-running static server
  --json            machine-readable report on stdout
  --quiet           only print the output path`;

function parseArgs(argv) {
  const a = {
    input: null, out: null, width: null, height: null, seed: null, verify: true,
    headed: false, channel: 'chrome', baseUrl: null, json: false, quiet: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--out') a.out = argv[++i];
    else if (t === '--width') a.width = Number(argv[++i]);
    else if (t === '--height') a.height = Number(argv[++i]);
    else if (t === '--size') { a.width = Number(argv[i + 1]); a.height = Number(argv[++i]); }
    else if (t === '--seed') a.seed = Number(argv[++i]);
    else if (t === '--no-verify') a.verify = false;
    else if (t === '--headed') a.headed = true;
    else if (t === '--channel') a.channel = argv[++i];
    else if (t === '--base-url') a.baseUrl = argv[++i];
    else if (t === '--json') a.json = true;
    else if (t === '--quiet') a.quiet = true;
    else if (t === '--help' || t === '-h') a.help = true;
    else if (!t.startsWith('--')) a.input = t;
    else { console.error(`unknown flag: ${t}`); process.exit(2); }
  }
  return a;
}

/** assets/…/foo.recipe.js -> assets/…/foo.png */
export function defaultOutFor(recipePath) {
  const base = basename(recipePath).replace(/\.recipe\.(js|mjs)$/, '').replace(/\.(js|mjs)$/, '');
  return join(dirname(recipePath), `${base}.png`);
}

async function renderOnce(browser, url, timeoutMs) {
  const context = await browser.newContext({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e.message || e)));
  try {
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.dataset.renderDone, null, { timeout: timeoutMs });
    const state = await page.evaluate(() => ({
      ok: window.__hbRender.ok,
      error: window.__hbRender.error,
      meta: window.__hbRender.meta,
      png: window.__hbRender.png,
      ms: window.__hbRender.ms,
    }));
    if (!state.ok) throw new Error(`recipe failed to render:\n${state.error}`);
    if (pageErrors.length) throw new Error(`page errors while rendering: ${pageErrors.join('; ')}`);
    return state;
  } finally {
    await context.close();
  }
}

export async function renderRecipe(opts) {
  const root = opts.root || REPO_ROOT;
  const inRel = String(opts.input).replace(/^\/+/, '');
  const inAbs = resolve(root, inRel);
  const text = readFileSync(inAbs, 'utf8');

  // The static scan first: a recipe that names Math.random or imports something
  // never reaches a browser, and the failure names the line.
  const scan = scanRecipe(text, { label: inRel });
  if (scan.errors.length) {
    throw new Error(`recipe rejected before rendering:\n  ${scan.errors.join('\n  ')}`);
  }

  const outAbs = resolve(root, opts.out || defaultOutFor(inAbs));
  mkdirSync(dirname(outAbs), { recursive: true });

  const server = opts.baseUrl ? null : await startStaticServer(root);
  const baseUrl = opts.baseUrl || server.baseUrl;
  const params = new URLSearchParams({ recipe: inAbs.slice(root.length + 1) });
  if (opts.width) params.set('w', String(opts.width));
  if (opts.height) params.set('h', String(opts.height));
  if (Number.isFinite(opts.seed)) params.set('seed', String(opts.seed));
  const url = `${baseUrl}/tools/assets/renderer.html?${params}`;

  const { browser, via, channel } = await launchBrowser({ channel: opts.channel, headed: opts.headed });
  let first, second = null;
  try {
    first = await renderOnce(browser, url, 90000);
    if (opts.verify !== false) second = await renderOnce(browser, url, 90000);
  } finally {
    await browser.close();
    if (server) await server.close();
  }

  const reproducible = second ? second.png === first.png : null;
  if (reproducible === false) {
    throw new Error(
      'the same recipe rendered two different images in one run — it is not deterministic.\n' +
      '  Every random draw must come from env.rng / env.stream / env.noise / env.fbm, which are seeded by meta.seed.\n' +
      '  (Re-run with --no-verify to keep the first render anyway, for debugging only.)'
    );
  }

  const bytes = Buffer.from(first.png.slice(first.png.indexOf(',') + 1), 'base64');
  writeFileSync(outAbs, bytes);

  // Round-trip proof, decoded from the file that was just written.
  // The same weighting and the same alpha floor check.mjs uses — a round-trip
  // report that judged by a different rule than the gate would be worse than no
  // report at all.
  const hist = histogram(outAbs, { alphaFloor: ALPHA_HUE_FLOOR, weight: 'alpha' });
  const pal = checkRasterColors(
    hist.colors.map((c) => ({ color: { r: c.r, g: c.g, b: c.b }, coverage: c.coverage, count: c.count }))
  );

  return {
    input: inRel,
    output: outAbs.slice(root.length + 1),
    meta: first.meta,
    declaredRoles: scan.meta.roles,
    size: { w: hist.width, h: hist.height },
    bytes: bytes.length,
    ms: first.ms,
    reproducible,
    browser: { via, channel },
    palette: pal,
    coverage: { opaque: hist.opaque, transparent: hist.transparent, unique: hist.unique },
  };
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.input) { console.log(HELP); process.exit(args.input ? 0 : 2); }
  renderRecipe(args).then((r) => {
    if (args.json) { console.log(JSON.stringify(r, null, 2)); return; }
    if (args.quiet) { console.log(r.output); return; }
    console.log(`rendered ${r.input} -> ${r.output}`);
    console.log(`  ${r.size.w}x${r.size.h}, ${(r.bytes / 1024).toFixed(1)}kB, ${r.coverage.unique} unique colors, seed ${r.meta.seed}, ${r.ms}ms in-page`);
    console.log(`  reproducible: ${r.reproducible === null ? 'NOT CHECKED (--no-verify)' : r.reproducible ? 'yes — two renders, identical bytes' : 'NO'}`);
    console.log(`  browser: ${r.browser.channel} via ${r.browser.via}`);
    const p = r.palette;
    console.log(`  palette: ${p.ok ? 'ok' : 'FAIL'} — ${p.roles.map((x) => `${x.id} ${(x.coverage * 100).toFixed(0)}%`).join(', ') || 'no role above the report threshold'}`);
    console.log(`    in-band ${(p.inBandMass * 100).toFixed(2)}%, blend ${(p.blendMass * 100).toFixed(3)}%, alien ${(p.alienMass * 100).toFixed(4)}% (cap ${(p.limits.alienMass * 100).toFixed(3)}%), ${p.anchors} blend endpoints`);
    for (const c of p.clusters) {
      console.log(`    off-band hue ${c.hueLo}-${c.hueHi} at ${(c.mass * 100).toFixed(3)}% (${(c.alienMass * 100).toFixed(4)}% alien), e.g. ${c.example}`);
    }
    for (const f of p.failures) console.log(`    ${f}`);
    if (r.declaredRoles.length) {
      const got = new Set(p.roles.map((x) => x.id));
      const missing = r.declaredRoles.filter((x) => !got.has(x));
      const extra = p.roles.map((x) => x.id).filter((x) => !r.declaredRoles.includes(x));
      if (missing.length || extra.length) {
        console.log(`    meta.roles says [${r.declaredRoles.join(', ')}], pixels say [${[...got].join(', ')}]`);
      }
    }
    console.log('nothing here judged the art. Next:');
    console.log(`  node tools/assets/check.mjs --write && node tools/assets/check.mjs`);
  }).catch((err) => {
    console.error(`render failed: ${err.message}`);
    process.exit(1);
  });
}
