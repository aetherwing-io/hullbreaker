#!/usr/bin/env node
/*
 * Falsifying test for the GitHub Pages cache-consistency transform.
 *
 * Static checks prove every document names exactly one commit-scoped module
 * graph.  The browser check then warms a Chromium profile with an older root
 * document, switches the server to the new release while that document is
 * still cache-fresh, and proves both outcomes are coherent:
 *
 *   - the exact legacy v0.1.0 document boots only pinned /src URLs;
 *   - a cached scoped old document (when one exists) boots only its revision;
 *   - a newly fetched document in those same warm caches boots only new URLs.
 *
 * That is the deployment race that an index-only ?deploy= query did not fix.
 */

import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = resolve(fileURLToPath(new URL('.', import.meta.url)));
const REPO = resolve(HERE, '..', '..');
const BASE_PATH = '/hullbreaker/';
const PRUNED_ASSET_RE = /\/(?:review[^/]*|source[^/]*|[^/]*-sources)\//;

function parseArgs(argv) {
  const opt = { site: null, revision: null, port: 8764, skipBrowser: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--site') opt.site = resolve(argv[++i]);
    else if (a.startsWith('--site=')) opt.site = resolve(a.slice(7));
    else if (a === '--revision') opt.revision = argv[++i].toLowerCase();
    else if (a.startsWith('--revision=')) opt.revision = a.slice(11).toLowerCase();
    else if (a === '--port') opt.port = Number(argv[++i]);
    else if (a.startsWith('--port=')) opt.port = Number(a.slice(7));
    else if (a === '--skip-browser') opt.skipBrowser = true;
    else if (a === '--help' || a === '-h') opt.help = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  return opt;
}

const HELP = `Verify the commit-scoped GitHub Pages artifact.

  node tools/deploy/verify-pages-site.mjs \\
    --site /tmp/hullbreaker-pages --revision <full-commit>

Options:
  --site DIR          built Pages site directory (required)
  --revision SHA      expected current full commit id (required)
  --port N            scratch server port (default 8764; never 8741/8742)
  --skip-browser      run structural checks only
`;

async function loadChromium() {
  const candidates = [
    'playwright-core',
    pathToFileURL(join(HERE, 'node_modules', 'playwright-core', 'index.js')).href,
    pathToFileURL(join(REPO, 'tools', 'playtest', 'node_modules', 'playwright-core', 'index.js')).href,
    pathToFileURL(join(REPO, 'tools', 'durability', 'node_modules', 'playwright-core', 'index.js')).href,
    process.env.HB_PLAYWRIGHT_CORE
      ? pathToFileURL(resolve(process.env.HB_PLAYWRIGHT_CORE)).href : null,
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const mod = await import(candidate);
      const chromium = mod.chromium || mod.default?.chromium;
      if (chromium) return chromium;
    } catch { /* next install */ }
  }
  throw new Error('playwright-core not found; run `npm ci --prefix tools/deploy`');
}

async function allJs(root) {
  const out = [];
  async function visit(dir) {
    for (const ent of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, ent.name);
      if (ent.isDirectory()) await visit(path);
      else if (ent.isFile() && ent.name.endsWith('.js')) out.push(path);
    }
  }
  await visit(root);
  return out;
}

function assetBlobs(commit) {
  const listing = execFileSync(
    'git', ['ls-tree', '-r', commit, '--', 'assets/generated', 'assets/ui/favicon.svg'],
    { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  );
  const out = new Map();
  for (const line of listing.split('\n').filter(Boolean)) {
    const match = line.match(/^\d+\s+blob\s+([0-9a-f]+)\t(.+)$/);
    if (!match) continue;
    const [, blob, path] = match;
    if (PRUNED_ASSET_RE.test(path) || !/\.(?:png|svg)$/i.test(path)) continue;
    out.set(path, blob);
  }
  return out;
}

function gitBlobHash(bytes) {
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

async function validateSharedAssetUnion(site, manifest) {
  const failures = [];
  const expectedCommits = [...new Set([
    manifest.current,
    ...manifest.retained.map((entry) => entry.commit),
    manifest.legacyUnscopedRevision,
  ])];
  const declared = manifest.sharedAssets?.refs || [];
  const declaredCommits = [...new Set(declared.map((entry) => entry.commit))];
  if (declaredCommits.length !== expectedCommits.length ||
      expectedCommits.some((commit) => !declaredCommits.includes(commit))) {
    failures.push('sharedAssets.refs does not exactly cover current + retained + legacy commits');
  }

  const variantsByPath = new Map();
  for (const commit of expectedCommits) {
    if (!/^[0-9a-f]{40}$/.test(commit || '')) {
      failures.push(`invalid asset-union commit id: ${commit}`);
      continue;
    }
    for (const [path, blob] of assetBlobs(commit)) {
      let variants = variantsByPath.get(path);
      if (!variants) variantsByPath.set(path, variants = new Map());
      let commits = variants.get(blob);
      if (!commits) variants.set(blob, commits = []);
      commits.push(commit);
    }
  }
  for (const [path, variants] of variantsByPath) {
    if (variants.size > 1) {
      failures.push(`${path}: retained asset union has ${variants.size} different Git blobs`);
      continue;
    }
    const expectedBlob = variants.keys().next().value;
    try {
      const bytes = await readFile(join(site, path));
      const actualBlob = gitBlobHash(bytes);
      if (actualBlob !== expectedBlob) {
        failures.push(`${path}: site blob ${actualBlob} does not match retained Git blob ${expectedBlob}`);
      }
    } catch {
      failures.push(`${path}: missing from shared Pages asset union`);
    }
  }
  if (manifest.sharedAssets?.currentPaths !== assetBlobs(manifest.current).size) {
    failures.push('sharedAssets.currentPaths does not match the current commit tree');
  }
  if (manifest.sharedAssets?.comparedRefs !== expectedCommits.length) {
    failures.push('sharedAssets.comparedRefs does not match the independent commit set');
  }
  return failures;
}

function expectedMain(revision) {
  return `releases/${revision}/src/main.js`;
}

function inspectDocument(html, revision, label) {
  const failures = [];
  const meta = html.match(/<meta\s+name=["']hullbreaker-build["']\s+content=["']([^"']+)["']/)?.[1];
  const main = html.match(/<script\s+type=["']module["']\s+src=["']([^"']+)["']/)?.[1];
  if (meta !== revision) failures.push(`${label}: build meta is ${meta || 'missing'}, expected ${revision}`);
  if (main !== expectedMain(revision)) {
    failures.push(`${label}: module entry is ${main || 'missing'}, expected ${expectedMain(revision)}`);
  }
  if (/src=["']src\/main\.js["']/.test(html)) failures.push(`${label}: still names unversioned src/main.js`);
  return failures;
}

async function structuralChecks(site, expectedRevision) {
  const failures = [];
  const manifest = JSON.parse(await readFile(join(site, 'pages-release.json'), 'utf8'));
  if (manifest.schema !== 1 || manifest.strategy !== 'commit-scoped-es-modules') {
    failures.push('pages-release.json has an unknown schema/strategy');
  }
  if (manifest.current !== expectedRevision) {
    failures.push(`manifest current=${manifest.current}, expected ${expectedRevision}`);
  }
  const cname = await readFile(join(site, 'CNAME'), 'utf8').catch(() => '');
  if (cname.trim() !== 'hullbreaker.app' || manifest.customDomain !== 'hullbreaker.app') {
    failures.push('Pages artifact does not lock CNAME and manifest to hullbreaker.app');
  }
  if (manifest.sharedAssets?.policy !== 'same-path-same-bytes' ||
      !(manifest.sharedAssets?.currentPaths > 0)) {
    failures.push('manifest does not prove the shared-asset same-path/same-bytes gate ran');
  }
  failures.push(...await validateSharedAssetUnion(site, manifest));
  const revisions = [manifest.current, ...manifest.retained.map((entry) => entry.commit)];
  if (new Set(revisions).size !== revisions.length) failures.push('manifest contains duplicate revisions');

  failures.push(...inspectDocument(
    await readFile(join(site, 'index.html'), 'utf8'), expectedRevision, 'root index.html',
  ));
  for (const revision of revisions) {
    const releaseRoot = join(site, 'releases', revision);
    failures.push(...inspectDocument(
      await readFile(join(releaseRoot, 'root-document.html'), 'utf8'), revision,
      `release ${revision.slice(0, 12)} document`,
    ));
    const jsFiles = await allJs(join(releaseRoot, 'src'));
    if (!jsFiles.length) failures.push(`release ${revision} has no JS files`);
    for (const path of jsFiles) {
      const source = await readFile(path, 'utf8');
      if (/(?:'|")\.\.\/\.\.\/assets\//.test(source)) {
        failures.push(`${path}: asset URL was not adjusted for the release namespace`);
      }
      const assetLiterals = source.matchAll(/(['"])(\.\.\/\.\.\/\.\.\/\.\.\/assets\/[^'"\n]*)\1/g);
      for (const match of assetLiterals) {
        const assetPath = match[2].slice('../../../../'.length);
        await stat(join(site, assetPath)).catch(() => {
          failures.push(`${path}: scoped asset literal does not resolve in the Pages site: ${match[2]}`);
        });
      }
    }
  }
  await stat(join(site, 'src', 'main.js')).catch(() => {
    failures.push('permanently pinned legacy /src/main.js graph is missing');
  });
  const legacyDocument = await readFile(join(site, manifest.legacyUnscopedDocument || ''), 'utf8')
    .catch(() => null);
  if (!legacyDocument) failures.push('legacy unscoped root document is missing');
  else {
    const legacyMain = legacyDocument.match(/<script\s+type=["']module["']\s+src=["']([^"']+)["']/)?.[1];
    if (legacyMain !== 'src/main.js') {
      failures.push(`legacy unscoped document names ${legacyMain || 'no module'}, expected src/main.js`);
    }
    if (/name=["']hullbreaker-build["']/.test(legacyDocument)) {
      failures.push('legacy unscoped document was rewritten instead of preserved exactly');
    }
  }
  return { manifest, revisions, failures };
}

const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
]);

function makeServer(site, initialDocument) {
  let documentSelection = initialDocument;
  let rootHits = 0;
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (!url.pathname.startsWith(BASE_PATH)) {
        res.writeHead(404).end('not found');
        return;
      }
      const relative = decodeURIComponent(url.pathname.slice(BASE_PATH.length));
      let path;
      const isRootDocument = relative === '' || relative === 'index.html';
      if (isRootDocument) {
        rootHits += 1;
        path = documentSelection === 'legacy'
          ? join(site, 'legacy-root-document.html')
          : join(site, 'releases', documentSelection, 'root-document.html');
      } else {
        const clean = normalize(relative).replace(new RegExp(`^\\.\\.${sep}`), '');
        path = join(site, clean);
        if (!path.startsWith(site + sep)) throw new Error('path traversal');
      }
      const body = await readFile(path);
      const immutable = relative.startsWith('releases/');
      res.writeHead(200, {
        'Content-Type': MIME.get(extname(path)) || 'application/octet-stream',
        'Cache-Control': immutable
          ? 'public, max-age=31536000, immutable'
          : 'public, max-age=600',
      });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return {
    server,
    setDocument(selection) { documentSelection = selection; },
    rootHits() { return rootHits; },
  };
}

async function listen(server, port) {
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolveListen);
  });
}

async function close(server) {
  await new Promise((resolveClose) => server.close(resolveClose));
}

async function openAndRead(context, url, expectedRevision) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err?.message || err)));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => window.HB?.state?.() === 'PLAYING', null, { timeout: 30000 },
  );
  const result = await page.evaluate(() => ({
    build: document.querySelector('meta[name="hullbreaker-build"]')?.content || null,
    main: document.querySelector('script[type="module"][src]')?.getAttribute('src') || null,
    js: performance.getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => new URL(name).origin === location.origin && new URL(name).pathname.endsWith('.js')),
  }));
  await page.close();
  const legacy = expectedRevision === 'legacy';
  const marker = legacy ? `${BASE_PATH}src/` : `${BASE_PATH}releases/${expectedRevision}/src/`;
  const wrongJs = result.js.filter((urlString) => !new URL(urlString).pathname.includes(marker));
  const expectedBuild = legacy ? null : expectedRevision;
  const expectedEntry = legacy ? 'src/main.js' : expectedMain(expectedRevision);
  return {
    ...result,
    errors,
    pass: result.build === expectedBuild &&
      result.main === expectedEntry &&
      result.js.length > 0 && wrongJs.length === 0 && errors.length === 0,
    wrongJs,
  };
}

async function runRollover(context, harness, rootUrl, oldSelection, currentRevision) {
  harness.setDocument(oldSelection);
  const warmOld = await openAndRead(context, rootUrl, oldSelection);
  const hitsAfterWarm = harness.rootHits();
  harness.setDocument(currentRevision);
  const cachedOld = await openAndRead(context, rootUrl, oldSelection);
  const cacheWasExercised = harness.rootHits() === hitsAfterWarm;
  const current = await openAndRead(
    context, `${rootUrl}&release=${currentRevision}`, currentRevision,
  );
  return { oldSelection, warmOld, cachedOld, current, cacheWasExercised };
}

async function browserChecks(site, manifest, port) {
  const harness = makeServer(site, 'legacy');
  await listen(harness.server, port);
  const chromium = await loadChromium();
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 960, height: 600 } });
    const baseUrl = `http://127.0.0.1:${port}${BASE_PATH}index.html?shell=0`;
    const cases = [];

    // Exact migration case: the cached v0.1.0 document still names
    // /src/main.js. That graph is deliberately pinned forever, so it remains
    // all-v0.1 after the server changes, while a fresh document uses scoped B.
    cases.push({
      label: 'legacy unscoped v0.1.0 -> current',
      ...await runRollover(context, harness, `${baseUrl}&case=legacy`, 'legacy', manifest.current),
    });

    // Once a prior v* release exists, also exercise scoped A -> scoped B.
    const oldRevision = manifest.retained[0]?.commit;
    if (oldRevision) {
      cases.push({
        label: `scoped ${oldRevision.slice(0, 12)} -> current`,
        ...await runRollover(
          context, harness, `${baseUrl}&case=scoped-${oldRevision}`, oldRevision, manifest.current,
        ),
      });
    }
    await context.close();
    return { cases, rootHits: harness.rootHits() };
  } finally {
    await browser.close();
    await close(harness.server);
  }
}

function printBrowser(result) {
  for (const rollover of result.cases) {
    console.log(`  ${rollover.label}`);
    const rows = [
      ['warm previous document', rollover.warmOld],
      ['cached previous document after server switch', rollover.cachedOld],
      ['current document in previous module cache', rollover.current],
    ];
    for (const [label, value] of rows) {
      console.log(`    [${value.pass ? 'PASS' : 'FAIL'}] ${label}: ` +
        `build=${value.build?.slice(0, 12) || 'legacy'} modules=${value.js.length} ` +
        `wrong=${value.wrongJs.length} errors=${value.errors.length}`);
    }
    console.log(`    [${rollover.cacheWasExercised ? 'PASS' : 'FAIL'}] old root response came from browser cache`);
  }
  console.log(`  server root hits=${result.rootHits}`);
}

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  if (opt.help) { process.stdout.write(HELP); return; }
  if (!opt.site || !opt.revision || !/^[0-9a-f]{40}$/.test(opt.revision)) {
    process.stderr.write(`${HELP}\nerror: --site and a full 40-character --revision are required\n`);
    process.exitCode = 2;
    return;
  }
  if ([8740, 8741, 8742].includes(opt.port)) throw new Error('ports 8741/8742 belong to the operator');

  const structural = await structuralChecks(opt.site, opt.revision);
  console.log(`Pages structure: ${structural.failures.length ? 'FAIL' : 'PASS'} ` +
    `(${structural.revisions.length} revision namespace(s))`);
  for (const failure of structural.failures) console.log(`  [FAIL] ${failure}`);
  if (structural.failures.length) process.exitCode = 1;

  if (!opt.skipBrowser && structural.failures.length === 0) {
    const browser = await browserChecks(opt.site, structural.manifest, opt.port);
    console.log('\nWarm-cache two-revision rollover:');
    printBrowser(browser);
    if (browser.cases.some((rollover) =>
      !rollover.warmOld.pass || !rollover.cachedOld.pass ||
      !rollover.current.pass || !rollover.cacheWasExercised)) {
      process.exitCode = 1;
    }
  }
  if (!process.exitCode) console.log('\nverify-pages-site: PASS');
  else console.log('\nverify-pages-site: FAIL');
}

main().catch((err) => {
  console.error(`verify-pages-site: ${err && err.stack ? err.stack : err}`);
  process.exit(1);
});
