// capture.mjs — the T-038 (S5, seam pips) before/after evidence rig.
//
// Belongs under tools/playtest/; parked here because that directory (and
// src/main.js, which the pass needs one wiring line in) were lane-fenced to
// concurrent tasks while T-038 ran — see this directory's README. It takes
// the worktree to photograph as an argument, makes a THROWAWAY copy of it in
// the OS temp dir with the one `import './render/seams.js';` line added to
// main.js (never written back to the real worktree), serves that copy on an
// ephemeral port (never 8741/8742), and writes only into this directory.
//
// Needs tools/playtest/node_modules (the harness's own `npm install`, run
// once in that directory) and a local Chrome; uses tools/assets/lib's
// playwright-core resolution and zero-dependency PNG decoder, both already
// shipped dev tooling.
//
//   node artifacts/t038-seams/capture.mjs --root <worktree>

import { loadPlaywright, startStaticServer } from '../../tools/assets/lib/browser.mjs';
import { decodePng } from '../../tools/assets/lib/png.mjs';
import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = HERE;

function argRoot() {
  const i = process.argv.indexOf('--root');
  if (i < 0 || !process.argv[i + 1]) throw new Error('usage: capture.mjs --root <worktree>');
  return resolve(process.argv[i + 1]);
}

function luminanceShare(png, floor = 200) {
  const { width, height, rgba } = png;
  let over = 0;
  const n = width * height;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const L = 0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2];
    if (L > floor) over++;
  }
  return { over, n, pct: (100 * over) / n };
}

async function census(page) {
  return page.evaluate(async () => {
    const scene = await import('./src/render/scene.js');
    const seams = await import('./src/render/seams.js').catch(() => null);
    const info = scene.renderer.info;
    let instMeshes = 0, instances = 0;
    scene.scene.traverse((o) => { if (o.isInstancedMesh) { instMeshes++; instances += o.count; } });
    return {
      calls: info.render.calls, tris: info.render.triangles,
      geoms: info.memory.geometries, textures: info.memory.textures,
      instMeshes, instances,
      seamsEnabled: seams ? seams.SEAMS_ENABLED : null,
      seamsStats: seams ? seams.seamsStats() : null,
    };
  });
}

async function shootAndMeasure(browser, baseUrl, name, qs, driveInput) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`${baseUrl}/index.html?testapi=1${qs}`);
  if (driveInput) {
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(4000);
    await page.keyboard.up('ArrowRight');
  } else {
    await page.waitForTimeout(800);
  }
  const shotPath = join(OUT, `${name}.png`);
  await page.screenshot({ path: shotPath });
  const c = await census(page);
  const lum = luminanceShare(decodePng(shotPath), 200);
  await page.close();
  return { ...c, lum };
}

async function run() {
  const root = argRoot();
  const tmp = mkdtempSync(join(tmpdir(), 't038-seams-'));
  cpSync(root, tmp, {
    recursive: true,
    filter: (src) => !src.includes(`${root}/.git`) &&
      !src.includes('tools/playtest/node_modules') && !src.includes('tools/assets/node_modules'),
  });
  const mainPath = join(tmp, 'src', 'main.js');
  const mainSrc = readFileSync(mainPath, 'utf8');
  if (!mainSrc.includes("import './render/level.js';")) {
    throw new Error('src/main.js shape changed — update the wiring anchor');
  }
  writeFileSync(mainPath, mainSrc.replace(
    "import './render/level.js';",
    "import './render/level.js';\nimport './render/seams.js'; // T-038 capture-only wiring, never committed to main.js"
  ));

  const { chromium } = await loadPlaywright();
  const server = await startStaticServer(tmp, { port: 0 });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const results = {};
  // Clean pair (no input): the packet's own baseline convention — a
  // draw-call/instance delta with no bullet/hostile-count drift between runs.
  results.baseline = await shootAndMeasure(browser, server.baseUrl, 'baseline', '', false);
  results.seams = await shootAndMeasure(browser, server.baseUrl, 'seams', '&seams=1', false);
  // Approximate pair (same fixed hold-right schedule both sides): more of
  // the deck lip and a catwalk in frame, for the luminance read. Honesty
  // note: two separate page loads sharing a seed and a script, not a
  // frame-locked replay — hostile/bullet timing can differ by a frame or
  // two (the same caveat tools/playtest/palette-capture.mjs states).
  results['gameplay-baseline'] = await shootAndMeasure(browser, server.baseUrl, 'gameplay-baseline', '', true);
  results['gameplay-seams'] = await shootAndMeasure(browser, server.baseUrl, 'gameplay-seams', '&seams=1', true);

  await browser.close();
  await server.close();
  rmSync(tmp, { recursive: true, force: true });
  writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
}

run().catch((e) => { console.error(e); process.exit(1); });
