// THROWAWAY reviewer script. Not part of the lane's diff. Run against a
// scratch copy of the repo (a git-archive snapshot + my own fixture files
// added under tools/playtest/fixtures/my-review/, never inside a live
// worktree) to independently reproduce the two multi-caller races claimed
// fixed in src/render/preload.js, without relying on the lane's own fixture
// wording. Deleted after use.
//
//   node _reviewer-repro.mjs --root <scratchRepoRoot> --trials 10
import { chromium } from 'playwright-core';
import { startStaticServer } from './lib/server.mjs';

const argv = process.argv.slice(2);
function arg(name, dflt) {
  const i = argv.indexOf('--' + name);
  return i >= 0 ? argv[i + 1] : dflt;
}
const ROOT = arg('root');
const TRIALS = Number(arg('trials', 8));
if (!ROOT) { console.error('usage: --root <path> [--trials N]'); process.exit(2); }

const SIBLINGS_PAGE = '/tools/playtest/fixtures/my-review/index-siblings.html';
const KEYSTONE_PAGE = '/tools/playtest/fixtures/my-review/index-keystone.html';
const BETA_ASSET = '**/polyp-iris-a.png';

async function trial(browser, base, page_url, { delayMs = 0 } = {}) {
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  const warnings = [];
  page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') warnings.push(m.text()); });
  if (delayMs) {
    await page.route(BETA_ASSET, async (route) => {
      await new Promise((r) => setTimeout(r, delayMs));
      await route.continue();
    });
  }
  await page.goto(base + page_url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__MY_DONE === true, { timeout: 30000 });
  const out = await page.evaluate(() => ({
    alpha: window.__MY_ALPHA, beta: window.__MY_BETA, gamma: window.__MY_GAMMA,
    awaiter: window.__MY_AWAITER,
    preload: window.__HB_PRELOAD ? window.__HB_PRELOAD() : null,
  }));
  out.warnings = warnings;
  await page.close();
  return out;
}

const server = await startStaticServer(ROOT, { port: 0 });
const base = server.baseUrl.replace(/\/$/, '');
const browser = await chromium.launch({ channel: 'chrome', headless: true });

console.log(`\n[root=${ROOT}]`);

console.log(`\n=== (a) plain siblings, no keystone, beta delayed 350ms: ${TRIALS} trials ===`);
const sib = [];
for (let i = 0; i < TRIALS; i++) sib.push(await trial(browser, base, SIBLINGS_PAGE, { delayMs: 350 }));
const sibStates = sib.map((r) => `${r.alpha.state}/${r.beta.state}/${r.gamma.state}`);
console.log('  states: ' + sibStates.join('  '));
console.log('  all a/b/g ready: ' + sibStates.filter((s) => s === 'ready/ready/ready').length + '/' + TRIALS);

console.log(`\n=== (b) keystone: awaiter imported BEFORE any lane registers: ${TRIALS} trials ===`);
const key = [];
for (let i = 0; i < TRIALS; i++) key.push(await trial(browser, base, KEYSTONE_PAGE));
const keyStates = key.map((r) => `${r.alpha.state}/${r.beta.state}/${r.gamma.state}`);
console.log('  states: ' + keyStates.join('  '));
console.log('  all a/b/g ready: ' + keyStates.filter((s) => s === 'ready/ready/ready').length + '/' + TRIALS);
console.log('  refused anywhere: ' + keyStates.filter((s) => s.includes('refused')).length + '/' + TRIALS);

await browser.close();
await server.close();
