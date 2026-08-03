#!/usr/bin/env node
/* verify-bundle.mjs — the falsifying test for I-048/T-055.
 *
 * A file-count or zip-contents check would have passed the broken bundle
 * every day since decisions.md entry 16 retired "boot with assets/ missing":
 * the old bundle omitted assets/generated/ entirely, and the shipped game's
 * own safety property (every asset falls back to a primitive/flat/canvas
 * shape) meant it would have RUN FLAWLESSLY and LOOKED EXACTLY LIKE THE
 * GREY-BOX BUILD, with no error anywhere. So this tool does not open the zip
 * and count files. It:
 *
 *   1. builds the real bundle with build-bundle.mjs (or takes an existing
 *      zip via --zip, so a deliberately broken one can be checked too — see
 *      "Proving this binds" below),
 *   2. unzips it into a CLEAN DIRECTORY THAT IS NOT THE REPO (a fresh
 *      os.tmpdir() tree — nothing here can accidentally read a file the
 *      zip did not actually contain),
 *   3. serves THAT directory with tools/serve.mjs on a scratch port,
 *   4. drives a real headless Chrome (playwright-core, resolved from a
 *      handful of candidate installs — see loadChromium below; nothing new
 *      to install if tools/playtest or tools/durability already are), and
 *   5. asserts the art actually rendered: RIG's production body/weapon atlases
 *      (not the canvas/geometry fallbacks), every hostile's sprite (not its primitive body), the hull
 *      textures (not the flat material), and the backdrop plates (not the
 *      pre-T-046 empty background), including the connected Meridian anatomy
 *      source actually composited into its curved storm shell — read straight from the game's own
 *      diagnostic surfaces (window.__HB_PRELOAD / __HB_RIG_VISUAL / __HB_SPRITES /
 *      __HB_HULL_TEX / __HB_BACKDROP), which is what "rendered" MEANS at
 *      the code level: the asset reached 'ready', not 'failed' or 'off'.
 *
 * It also re-proves T-034's subpath-hosting claim (itch.io serves from
 * `https://html.itch.zone/html/<upload-id>/<slug>/`, not the domain root) —
 * unzipping a second copy under a synthetic three-level path and repeating
 * both the generic `?selftest=1` check and the art-render check there, so a
 * relative-asset-path regression under a subpath cannot hide behind a
 * flat-root-only test passing.
 *
 * PROVING THIS BINDS (do this before trusting a green run of this file):
 *   git archive --format=zip --output=/tmp/broken.zip HEAD -- index.html src
 *   node tools/deploy/verify-bundle.mjs --zip /tmp/broken.zip --skip-subpath
 * That is I-048's exact original bug (assets/generated/ never archived) and
 * this command must exit 1 with every art check reporting FAIL. Then run
 * this file with no --zip (or --ref) and confirm it goes green. Both runs are
 * quoted in reports/tasks/T-055/build.md.
 *
 * Usage (never on 8741/8742 — those are the operator's):
 *   node tools/deploy/verify-bundle.mjs
 *   node tools/deploy/verify-bundle.mjs --ref HEAD --port 8752
 *   node tools/deploy/verify-bundle.mjs --zip ./some-bundle.zip --skip-subpath
 *   node tools/deploy/verify-bundle.mjs --screenshot artifacts/boot.png --keep
 *
 * Dev-only: touches nothing under src/, index.html or assets/. Requires
 * `unzip` (standard on macOS/Linux) and playwright-core (see loadChromium).
 */

import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------- options ---------------------------- */

const args = process.argv.slice(2);
const opt = {
  ref: 'HEAD', zip: null, port: 8752, screenshot: null,
  keep: false, skipSubpath: false,
};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--ref') opt.ref = args[++i];
  else if (a === '--zip') opt.zip = resolve(args[++i]);
  else if (a === '--port') opt.port = Number(args[++i]);
  else if (a === '--screenshot') opt.screenshot = resolve(args[++i]);
  else if (a === '--keep') opt.keep = true;
  else if (a === '--skip-subpath') opt.skipSubpath = true;
  else if (a === '--help' || a === '-h') {
    console.log(`usage: node tools/deploy/verify-bundle.mjs [options]

  --ref <ref>          build the bundle from this ref (default HEAD)
  --zip <path>         verify an EXISTING zip instead of building one
                        (used to prove a broken bundle fails this test)
  --port <n>           base port; this and port+1 are used (default 8752)
  --screenshot <path>  save a PNG of the booted flat-root page here
  --keep               keep the scratch unzip directories (debugging)
  --skip-subpath       only run the flat-root art-render check

  8741 and 8742 belong to the operator: this tool never binds them.`);
    process.exit(0);
  } else {
    console.error(`unknown argument: ${a}`);
    process.exit(2);
  }
}
if (opt.port === 8741 || opt.port === 8742 || opt.port + 1 === 8741 || opt.port + 1 === 8742) {
  console.error('verify-bundle: 8741/8742 are the operator\'s ports — pick another with --port.');
  process.exit(2);
}

/* --------------------------- playwright-core ------------------------- */
// Same resolution order tools/durability/abuse.mjs uses: this directory's own
// install first, then tools/playtest's or tools/durability's (whichever a
// prior `npm install` populated), then $HB_PLAYWRIGHT_CORE.
async function loadChromium() {
  const candidates = [
    'playwright-core',
    pathToFileURL(join(HERE, 'node_modules', 'playwright-core', 'index.js')).href,
    pathToFileURL(join(REPO, 'tools', 'playtest', 'node_modules', 'playwright-core', 'index.js')).href,
    pathToFileURL(join(REPO, 'tools', 'durability', 'node_modules', 'playwright-core', 'index.js')).href,
    process.env.HB_PLAYWRIGHT_CORE
      ? pathToFileURL(resolve(process.env.HB_PLAYWRIGHT_CORE)).href : null,
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      const mod = await import(c);
      const chromium = mod.chromium || (mod.default && mod.default.chromium);
      if (chromium) return chromium;
    } catch { /* try the next one */ }
  }
  console.error('verify-bundle: playwright-core not found. Run `npm install` in tools/deploy,\n' +
    '  or point HB_PLAYWRIGHT_CORE at an existing tools/playtest or tools/durability install.');
  process.exit(2);
}

/* -------------------------------- build ------------------------------- */

async function resolveZip(scratch) {
  if (opt.zip) {
    await access(opt.zip);
    console.log(`verify-bundle: using existing zip ${opt.zip} (skipping build)`);
    return opt.zip;
  }
  const out = join(scratch, 'bundle-under-test.zip');
  console.log(`verify-bundle: building bundle from ref '${opt.ref}'...`);
  execFileSync(process.execPath,
    [join(REPO, 'tools', 'deploy', 'build-bundle.mjs'), '--ref', opt.ref, '--out', out],
    { cwd: REPO, stdio: 'inherit' });
  return out;
}

async function unzipTo(zipPath, destDir) {
  await rm(destDir, { recursive: true, force: true });
  await mkdir(destDir, { recursive: true });
  execFileSync('unzip', ['-q', zipPath, '-d', destDir]);
}

/* -------------------------------- server ------------------------------- */

function serve(root, port) {
  const child = spawn(process.execPath,
    [join(REPO, 'tools', 'serve.mjs'), String(port), '--root', root, '--quiet'],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  let diedEarly = false;
  child.stderr.on('data', (d) => process.stderr.write(`[serve ${port}] ${d}`));
  child.on('exit', (code) => {
    if (child.killed) return;
    diedEarly = true;
    console.error(`verify-bundle: the dev server on ${port} exited (${code}) unexpectedly — ` +
      'is something already listening there? Pick another with --port.');
  });
  child.diedEarly = () => diedEarly;
  return child;
}

async function waitForServer(url, timeoutMs = 8000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await sleep(120);
  }
  return false;
}

function stopServer(child) {
  if (!child || child.killed) return;
  child.kill();
}

/* ------------------------------ assertions ------------------------------ */

// The one thing "art rendered" means at the code level, read straight off
// the game's own diagnostic surfaces — no pixel-diffing, no guessing.
const READ_ART = () => ({
  booted: !!(window.__HB_FAILSAFE && window.__HB_FAILSAFE.isBooted()),
  preload: typeof window.__HB_PRELOAD === 'function' ? window.__HB_PRELOAD() : null,
  rigVisual: typeof window.__HB_RIG_VISUAL === 'function' ? window.__HB_RIG_VISUAL() : null,
  sprites: typeof window.__HB_SPRITES === 'function' ? window.__HB_SPRITES() : null,
  hullTex: typeof window.__HB_HULL_TEX === 'function' ? window.__HB_HULL_TEX() : null,
  backdrop: typeof window.__HB_BACKDROP === 'function' ? window.__HB_BACKDROP() : null,
});

// Turn one READ_ART() result into a list of { name, pass, detail } checks.
function judgeArt(snap) {
  const out = [];
  const bodyAtlas = snap.preload && snap.preload.assets.find((a) =>
    a.url.includes('rig-body-atlas-v1.png'));
  const weaponAtlas = snap.preload && snap.preload.assets.find((a) =>
    a.url.includes('rig-weapons-atlas-v1.png'));
  const rig = snap.rigVisual;
  out.push({
    name: 'RIG production body atlas (not canvas fallback)',
    pass: bodyAtlas?.state === 'ready' && rig?.spriteReady === true &&
      rig?.idleGunlessReady === true && rig?.canvasFallback === false,
    detail: `atlas=${bodyAtlas?.state || 'not registered'} ` +
      `spriteReady=${rig?.spriteReady ?? false} idleReady=${rig?.idleGunlessReady ?? false} ` +
      `canvasFallback=${rig?.canvasFallback ?? true}`,
  });
  const gunStates = rig ? Object.values(rig.artReady || {}) : [];
  out.push({
    name: 'RIG production weapon atlas (not geometry fallback)',
    pass: weaponAtlas?.state === 'ready' && gunStates.length > 0 &&
      gunStates.every((ready) => ready === true),
    detail: `atlas=${weaponAtlas?.state || 'not registered'} ` +
      `guns=${gunStates.filter(Boolean).length}/${gunStates.length}`,
  });

  const kinds = snap.sprites ? Object.keys(snap.sprites.kinds) : [];
  if (kinds.length === 0) {
    out.push({ name: 'hostile sprites (not primitives)', pass: false, detail: 'no __HB_SPRITES kinds' });
  } else {
    for (const kind of kinds) {
      const k = snap.sprites.kinds[kind];
      out.push({
        name: `hostile sprite: ${kind} (not primitive)`,
        pass: k.state === 'ready',
        detail: `variant=${k.variant} state=${k.state}${k.error ? ' (' + k.error + ')' : ''}`,
      });
    }
  }

  if (!snap.hullTex) {
    out.push({ name: 'hull textures (not flat material)', pass: false, detail: 'no __HB_HULL_TEX' });
  } else {
    const files = Object.entries(snap.hullTex.files);
    for (const [file, ready] of files) {
      out.push({ name: `hull texture file: ${file}`, pass: !!ready, detail: ready ? 'ready' : 'not ready' });
    }
  }

  if (!snap.backdrop) {
    out.push({ name: 'backdrop plates (not empty background)', pass: false, detail: 'no __HB_BACKDROP' });
  } else {
    const replaced = snap.backdrop.plates.filter((p) => p.replaced === true).length;
    out.push({
      name: 'backdrop slots drawn or intentionally replaced',
      pass: snap.backdrop.built > 0 &&
        snap.backdrop.built + replaced === snap.backdrop.plates.length,
      detail: `built=${snap.backdrop.built} replaced=${replaced} ` +
        `total=${snap.backdrop.plates.length}`,
    });
    for (const p of snap.backdrop.plates) {
      out.push({
        name: `backdrop plate: ${p.plate} (${p.face})`,
        pass: p.state === 'ready',
        detail: `state=${p.state}${p.error ? ' (' + p.error + ')' : ''}`,
      });
    }
    const anatomy = snap.backdrop.anatomyBody;
    out.push({
      name: 'connected Meridian anatomy source',
      pass: anatomy?.state === 'ready',
      detail: anatomy
        ? `state=${anatomy.state}${anatomy.error ? ' (' + anatomy.error + ')' : ''}`
        : 'no anatomyBody diagnostic',
    });
    const composite = snap.backdrop.atmosphere?.anatomy;
    out.push({
      name: 'connected Meridian anatomy composited into curved atmosphere',
      pass: composite?.composited === true,
      detail: composite
        ? `composited=${composite.composited} source=${composite.source?.join('x') || 'none'} ` +
          `stagePasses=${composite.stagePasses ?? 0}`
        : 'no atmosphere.anatomy diagnostic',
    });
  }
  return out;
}

async function checkArtRenders(chromium, baseUrl, label, screenshotPath) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const consoleErrors = [];
    page.on('pageerror', (e) => consoleErrors.push(String(e && e.message ? e.message : e)));
    await page.goto(`${baseUrl}/index.html?shell=0`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => window.HB && window.HB.state && window.HB.state() === 'PLAYING',
      null, { timeout: 20000 },
    );
    // preload.js's own budget is 2500ms; give it a beat past that so a
    // borderline machine doesn't get read mid-settle.
    await page.waitForFunction(
      () => window.__HB_PRELOAD && window.__HB_PRELOAD().closed === true,
      null, { timeout: 8000 },
    ).catch(() => {});
    await sleep(150);
    const snap = await page.evaluate(READ_ART);
    if (screenshotPath) {
      await mkdir(dirname(screenshotPath), { recursive: true });
      await page.screenshot({ path: screenshotPath });
    }
    await page.close();
    return { label, snap, checks: judgeArt(snap), consoleErrors };
  } finally {
    await browser.close();
  }
}

async function checkSelftest(chromium, baseUrl) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${baseUrl}/index.html?selftest=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => /SELFTEST (PASS|FAIL)/.test(document.title), null, { timeout: 20000 });
    const title = await page.title();
    await page.close();
    return { pass: title.includes('SELFTEST PASS'), title };
  } finally {
    await browser.close();
  }
}

/* --------------------------------- main -------------------------------- */

function printChecks(result) {
  console.log(`\n-- ${result.label} --`);
  for (const c of result.checks) {
    console.log(`  [${c.pass ? 'PASS' : 'FAIL'}] ${c.name}  (${c.detail})`);
  }
  if (result.consoleErrors.length) {
    console.log(`  page errors: ${result.consoleErrors.length}`);
    for (const e of result.consoleErrors.slice(0, 5)) console.log(`    ${e}`);
  }
}

async function main() {
  const scratch = await mkdtemp(join(tmpdir(), 'hb-deploy-verify-'));
  const chromium = await loadChromium();
  let overallPass = true;
  const flatServerRoot = join(scratch, 'flat');
  const subpathServerRoot = join(scratch, 'subpath');
  const subpathGameDir = join(subpathServerRoot, 'html', '999999', 'hullbreaker-alpha');
  let flatServer = null;
  let subpathServer = null;

  try {
    const zipPath = await resolveZip(scratch);

    // ---- 1. flat root: unzip into a clean dir OUTSIDE the repo, serve, assert
    await unzipTo(zipPath, flatServerRoot);
    flatServer = serve(flatServerRoot, opt.port);
    const flatBase = `http://127.0.0.1:${opt.port}`;
    if (!(await waitForServer(`${flatBase}/index.html`))) {
      throw new Error(`dev server on ${opt.port} never came up (${flatServer.diedEarly() ? 'exited early' : 'timeout'})`);
    }
    const flatResult = await checkArtRenders(chromium, flatBase, 'flat root', opt.screenshot);
    printChecks(flatResult);
    if (flatResult.checks.some((c) => !c.pass)) overallPass = false;
    stopServer(flatServer);
    flatServer = null;

    // ---- 2. subpath hosting (T-034): synthetic itch.io-shaped nested path
    if (!opt.skipSubpath) {
      await unzipTo(zipPath, subpathGameDir);
      subpathServer = serve(subpathServerRoot, opt.port + 1);
      const subBase = `http://127.0.0.1:${opt.port + 1}`;
      if (!(await waitForServer(`${subBase}/html/999999/hullbreaker-alpha/index.html`))) {
        throw new Error(`dev server on ${opt.port + 1} never came up`);
      }
      const nestedBase = `${subBase}/html/999999/hullbreaker-alpha`;
      const selftest = await checkSelftest(chromium, nestedBase);
      console.log(`\n-- subpath hosting: ?selftest=1 at /html/999999/hullbreaker-alpha/ --`);
      console.log(`  [${selftest.pass ? 'PASS' : 'FAIL'}] page title: "${selftest.title}"`);
      if (!selftest.pass) overallPass = false;

      const subResult = await checkArtRenders(chromium, nestedBase, 'subpath (art render)', null);
      printChecks(subResult);
      if (subResult.checks.some((c) => !c.pass)) overallPass = false;
      stopServer(subpathServer);
      subpathServer = null;
    }
  } finally {
    stopServer(flatServer);
    stopServer(subpathServer);
    if (!opt.keep) await rm(scratch, { recursive: true, force: true });
    else console.log(`\nverify-bundle: kept scratch dir ${scratch}`);
  }

  console.log(`\nverify-bundle: ${overallPass ? 'PASS' : 'FAIL'}`);
  process.exit(overallPass ? 0 : 1);
}

main().catch((err) => {
  console.error(`verify-bundle: ${err && err.stack ? err.stack : err}`);
  process.exit(1);
});
