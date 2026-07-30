#!/usr/bin/env node
/* selftest.mjs — run the game's own browser self-test (?selftest=1) across a
 * matrix of URLs in real Chrome, headless, and print one PASS/FAIL table.
 *
 * The self-test lives in src/main.js and reports through the page title; this
 * tool only opens the pages and reads the verdicts, so it cannot mask a
 * failure. It also collects console errors and page errors per URL, because a
 * flag that throws on boot would otherwise show up as a timeout with no clue.
 *
 * Chrome comes from the dev-only playwright-core already installed under
 * tools/playtest (channel: 'chrome', i.e. the installed system browser — no
 * download). Nothing under tools/playtest is modified or imported except that
 * dependency.
 *
 *   cd tools/playtest && npm install          # once, if node_modules is absent
 *   node tools/movement/selftest.mjs                    # the default matrix
 *   node tools/movement/selftest.mjs --headed
 *   node tools/movement/selftest.mjs --url 'index.html?slice=traversal&hook=1'
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');
const require = createRequire(join(ROOT, 'tools', 'playtest', 'package.json'));
let chromium;
try {
  ({ chromium } = require('playwright-core'));
} catch {
  console.error('playwright-core not installed. Run: cd tools/playtest && npm install');
  process.exit(2);
}

/* The matrix: the movement-verb flags crossed with the paces the operator
   plays, plus the ordinary URLs, so this also proves the flags-off boot is
   untouched. Every entry runs the same self-test the browser ships. */
const MATRIX = [
  'index.html',
  'index.html?slice=traversal',
  'index.html?slice=traversal&pace=surge',
  'index.html?slice=traversal&hook=1',
  'index.html?slice=traversal&hook=1&hookinput=auto',
  'index.html?slice=traversal&flow=1',
  'index.html?slice=traversal&hook=1&flow=1',
  'index.html?slice=traversal&pace=surge&hook=1',
  'index.html?slice=traversal&pace=surge&flow=1',
  'index.html?slice=traversal&pace=surge&hook=1&flow=1',
  'index.html?slice=traversal&pace=hunt&hook=1&flow=1',
  'index.html?slice=traversal&pace=swarm&hook=1&flow=1',
  'index.html?slice=traversal&hound=1&hook=1&flow=1',
  'index.html?slice=traversal&pace=surge&hound=3&hook=1&flow=1&score=1',
  'index.html?slice=traversal&hook=1&flow=1&enemies=0',
];

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.png': 'image/png', '.json': 'application/json',
};

function startServer() {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    const file = join(ROOT, path === '/' ? 'index.html' : path);
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const args = process.argv.slice(2);
const headed = args.includes('--headed');
const only = args.includes('--url') ? [args[args.indexOf('--url') + 1]] : null;
// every entry gets ?selftest=1 appended here rather than repeated in the table
const withSelftest = (u) => (/[?&]selftest=/.test(u)
  ? u
  : u + (u.includes('?') ? '&' : '?') + 'selftest=1');
const urls = (only || MATRIX).map(withSelftest);

const server = await startServer();
const base = 'http://127.0.0.1:' + server.address().port + '/';
const browser = await chromium.launch({ channel: 'chrome', headless: !headed });
const rows = [];
for (const url of urls) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  // a missing /favicon.ico is this tool's own static server, not the game
  const isFavicon = (t) => /favicon/i.test(t);
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (/404/.test(text) && m.location() && isFavicon(m.location().url || '')) return;
    errors.push(text);
  });
  page.on('requestfailed', () => {});
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('response', (r) => {
    if (r.status() === 404 && !isFavicon(r.url())) errors.push('404: ' + r.url());
  });
  let verdict = 'NO VERDICT';
  try {
    await page.goto(base + url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => /SELFTEST/.test(document.title), null,
      { timeout: 15000 });
    verdict = await page.title();
  } catch (e) {
    verdict = 'TIMEOUT (' + e.message.split('\n')[0] + ')';
  }
  rows.push({ url, verdict, errors });
  await context.close();
}
await browser.close();
server.close();

let failures = 0;
for (const r of rows) {
  const pass = /SELFTEST PASS/.test(r.verdict) && r.errors.length === 0;
  if (!pass) failures++;
  console.log((pass ? 'PASS  ' : 'FAIL  ') + r.url.padEnd(62) + r.verdict.replace('HULLBREAKER — grey-box', ''));
  for (const e of r.errors.slice(0, 4)) console.log('        console: ' + e.slice(0, 200));
}
console.log(failures === 0
  ? 'selftest matrix: ' + rows.length + '/' + rows.length + ' PASS'
  : 'selftest matrix: ' + failures + ' of ' + rows.length + ' FAILED');
process.exit(failures ? 1 : 0);
