// preload-concurrency-check.mjs — is src/render/preload.js actually the
// SHARED gate it claims to be? Written after review found that it was not:
// each caller raced its own snapshot of the registry and then force-marked
// everyone else's still-pending assets as timed out, so a second lane's
// texture was discarded in 7 of 10 trials, within 3-6ms, with a message
// claiming a 2500ms budget had elapsed.
//
//   node preload-concurrency-check.mjs            all six conditions
//   node preload-concurrency-check.mjs --trials 10
//
// The fixture is two INDEPENDENT sibling modules
// (tools/playtest/fixtures/preload-concurrency/lane-{first,second}.js), each
// doing exactly what the gate's header prescribes — `preloadTexture(url)` at
// module scope, then `await awaitPreloads()` at module scope — with no
// knowledge of each other. That is the shape T-040 was told to adopt.
//
// SIX conditions, because hoping for a race is not testing one:
//   plain          both textures served normally; N trials
//   slow-second    the second lane's texture is delayed 400ms at the network
//                  (inside the 2500ms budget). Under the old code this is the
//                  defect made deterministic — the first lane finishes and
//                  forecloses. Both must still be 'ready'.
//   over-budget    the second lane's texture is delayed 3200ms (past the
//                  budget). The second MUST be 'timeout', the first MUST be
//                  'ready', and the timeout message must state the time
//                  actually waited rather than quoting the budget.
//   awaits-first   a third module awaits the gate BEFORE anyone registers —
//                  module evaluation order is the import graph's business,
//                  not the asset owner's. Before the grace turns existed
//                  this closed the gate on everyone: both asset lanes
//                  REFUSED, zero art, 3 trials of 3.
//   late           a module registers AFTER awaitPreloads() resolved, which
//                  must be REFUSED. Nothing behavioural covered this until
//                  review patched a scratch copy to let it fall through and
//                  watched every check here stay green — the fourth false
//                  green in this lane, and the first it did not find itself.
//   warm-up        the GPU warm-up ran, ran while the gate was still shut,
//                  and ?warm=0 turns it off.
//
// HONESTY NOTES:
//   * This tests the gate's contract, not the game: the fixture page is not
//     index.html and boots no simulation.
//   * "Resident" here means the gate reported state 'ready' and handed back a
//     texture object. That the GPU upload happened is asserted separately, by
//     pathcheck, against the initTexture call site.
//   * The warm-up's ORDERING is read from a field the module records
//     (`warmedWhileClosed`), not inferred from timings: the first version of
//     that check compared warmMs against costMs and passed with the two
//     lines swapped, which is a false green of exactly the kind this repo
//     keeps paying for.
//   * Delays are injected with Playwright request interception, which is a
//     fair model of a slow network but not of a slow DECODE.

import { chromium } from 'playwright-core';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './lib/server.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const argv = process.argv.slice(2);
const trialsArg = argv.indexOf('--trials');
const TRIALS = trialsArg >= 0 ? Number(argv[trialsArg + 1]) : 10;
const PAGE = '/tools/playtest/fixtures/preload-concurrency/index.html';
const SECOND_ASSET = '**/mortar-tripod-b.png';

let failures = 0;
function check(cond, label, detail) {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? ' — ' + detail : ''));
  if (!cond) failures++;
}

async function trial(browser, base, { delayMs = 0 } = {}) {
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  const warnings = [];
  page.on('console', (m) => {
    if (m.type() === 'warning' || m.type() === 'error') warnings.push(m.text());
  });
  if (delayMs) {
    await page.route(SECOND_ASSET, async (route) => {
      await new Promise((r) => setTimeout(r, delayMs));
      await route.continue();
    });
  }
  await page.goto(base + PAGE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__T049_DONE === true, { timeout: 30000 });
  const out = await page.evaluate(() => ({
    first: window.__T049_FIRST,
    second: window.__T049_SECOND,
    preload: window.__HB_PRELOAD(),
  }));
  out.warnings = warnings;
  await page.close();
  return out;
}

const server = await startStaticServer(repoRoot, { port: 0 });
const base = server.baseUrl.replace(/\/$/, '');
const browser = await chromium.launch({ channel: 'chrome', headless: true });

console.log(`\n=== plain: ${TRIALS} trials, both lanes must end resident ===`);
const plain = [];
for (let i = 0; i < TRIALS; i++) plain.push(await trial(browser, base));
const bothReady = plain.filter((r) => r.first.state === 'ready' && r.second.state === 'ready');
check(bothReady.length === TRIALS,
      `both lanes resident in every trial`,
      `${bothReady.length}/${TRIALS}; second-lane states: ` +
      [...new Set(plain.map((r) => r.second.state))].join(', '));
check(plain.every((r) => r.preload.costMs < r.preload.budgetMs),
      'the gate closed inside its budget every time',
      'costMs ' + Math.min(...plain.map((r) => r.preload.costMs)) + '-' +
      Math.max(...plain.map((r) => r.preload.costMs)) + 'ms of ' + plain[0].preload.budgetMs);
check(plain.every((r) => r.preload.assets.length === 2),
      'both registrations are visible in one shared registry',
      'entries per trial: ' + [...new Set(plain.map((r) => r.preload.assets.length))].join(', '));

console.log('\n=== slow-second: the second lane is 400ms behind (inside the budget) ===');
const slow = [];
for (let i = 0; i < 3; i++) slow.push(await trial(browser, base, { delayMs: 400 }));
check(slow.every((r) => r.first.state === 'ready' && r.second.state === 'ready'),
      'a slower second lane is WAITED FOR, not foreclosed on',
      slow.map((r) => `${r.first.state}/${r.second.state} @${r.preload.costMs}ms`).join('  '));
check(slow.every((r) => r.preload.costMs >= 380),
      'the gate really did hold the boot for it',
      'costMs ' + slow.map((r) => r.preload.costMs).join(', '));

console.log('\n=== over-budget: the second lane is 3200ms behind (past the budget) ===');
const over = await trial(browser, base, { delayMs: 3200 });
check(over.first.state === 'ready',
      'the first lane still gets its asset',
      over.first.state);
check(over.second.state === 'timeout',
      'the second lane is timed out rather than waited for forever',
      over.second.state);
check(over.preload.costMs >= over.preload.budgetMs - 50 &&
      over.preload.costMs <= over.preload.budgetMs + 400,
      'the gate closed at its budget, not before and not much after',
      `costMs ${over.preload.costMs} vs budget ${over.preload.budgetMs}`);
check(/still loading after \d+ms of the \d+ms boot budget/.test(over.second.error || '') &&
      Math.abs(Number(/after (\d+)ms/.exec(over.second.error)[1]) - over.preload.costMs) < 100,
      'the timeout message states the time actually waited',
      over.second.error);

/* The case the first concurrency fix did not cover, found while resolving
   the I-039 fix cycle: a lane that awaits the gate BEFORE anyone has
   registered. Module evaluation order is decided by the import graph, not by
   who owns an asset, so this is a normal shape for a shared gate to meet —
   and before the grace turns existed it closed the gate on everyone, both
   asset lanes REFUSED, zero art, 3 trials of 3. */
console.log('\n=== awaits-first: a lane awaits before anyone has registered ===');
const AWAIT_FIRST = '/tools/playtest/fixtures/preload-concurrency/index-awaits-first.html';
const firstAwait = [];
for (let i = 0; i < 3; i++) {
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  await page.goto(base + AWAIT_FIRST, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__T049_DONE === true, { timeout: 30000 });
  firstAwait.push(await page.evaluate(() => ({
    first: window.__T049_FIRST, second: window.__T049_SECOND,
    preload: window.__HB_PRELOAD(),
  })));
  await page.close();
}
check(firstAwait.every((r) => r.first.state === 'ready' && r.second.state === 'ready'),
      'an empty await does not close the gate on the lanes behind it',
      firstAwait.map((r) => `${r.first.state}/${r.second.state}`).join('  '));
check(firstAwait.every((r) => r.preload.assets.length === 2),
      'both later registrations still reached the shared registry',
      'entries: ' + firstAwait.map((r) => r.preload.assets.length).join(', '));

/* REGISTERING AFTER THE GATE CLOSED must be refused — and until the reviewer
   went looking, NOTHING behavioural covered it. The only guard was a
   source-literal `state: 'refused'` match in pathcheck, so a scratch copy
   patched to let a post-close registration fall through to the normal load
   path — reintroducing the mid-run upload this gate exists to prevent — kept
   pathcheck and all five conditions here green. That is the fourth false
   green this lane has had, and the first one it did not find itself. */
console.log('\n=== late: a lane registers AFTER awaitPreloads() resolved ===');
const LATE_PAGE = '/tools/playtest/fixtures/preload-concurrency/index-late.html';
const late = [];
let lateHung = 0;
for (let i = 0; i < 3; i++) {
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  const warns = [];
  page.on('console', (m) => { if (m.type() === 'warning') warns.push(m.text()); });
  await page.goto(base + LATE_PAGE, { waitUntil: 'load' });
  try {
    await page.waitForFunction(() => window.__T049_DONE === true, { timeout: 15000 });
  } catch (err) {
    // A gate that ACCEPTS a post-close registration hands back a promise
    // nothing will ever settle — settle() has already run and will not run
    // again — so the fixture's `await` hangs and the page never finishes.
    // That is a real failure mode with a specific meaning, and it must read
    // as a FAIL rather than as the tool crashing.
    lateHung++;
    await page.close();
    continue;
  }
  const out = await page.evaluate(() => ({
    late: window.__T049_LATE, first: window.__T049_FIRST,
    second: window.__T049_SECOND, preload: window.__HB_PRELOAD(),
  }));
  out.warns = warns;
  late.push(out);
  await page.close();
}
check(lateHung === 0,
      'the late page finished at all — a post-close registration must not ' +
      'return a promise that never settles',
      lateHung ? `${lateHung} of 3 trials hung waiting for the fixture` : '3 of 3 finished');
check(late.length > 0 && late.every((r) => r.late.state === 'refused'),
      'a registration after the gate closed is REFUSED',
      late.length ? late.map((r) => r.late.state).join(', ') : '(no trial completed)');
check(late.length > 0 && late.every((r) => r.late.hasTexture === false),
      'and no texture is handed back for it — nothing was loaded mid-run',
      late.length ? late.map((r) => 'hasTexture=' + r.late.hasTexture).join(', ') : '(no trial completed)');
check(late.length > 0 && late.every((r) => r.warns.some((w) => /registered after the boot gate closed/.test(w))),
      'the refusal names the file and says what to do instead',
      late.length ? (late[0].warns.find((w) => /after the boot gate/.test(w)) || '(no warning)').slice(0, 96) : '(no trial completed)');
check(late.length > 0 && late.every((r) => r.first.state === 'ready' && r.second.state === 'ready'),
      'the two on-time lanes are unaffected by the late one',
      late.length ? late.map((r) => `${r.first.state}/${r.second.state}`).join('  ') : '(no trial completed)');

/* The warm-up's ORDERING, as behaviour rather than as a regex over the
   source: if the warm-up ran before the gate opened, its measured cost is
   contained inside the gate's own measured cost. (Whether the warm-up helps
   determinism is a different question, answered — negatively, on this lane —
   in reports/tasks/T-049/build.md §8. This only checks it happens, and
   happens in the right place.) */
console.log('\n=== the warm-up runs INSIDE the gate, and ?warm=0 turns it off ===');
async function warmProbe(qs) {
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  await page.goto(base + PAGE + qs, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__T049_DONE === true, { timeout: 30000 });
  const out = await page.evaluate(() => window.__HB_PRELOAD());
  await page.close();
  return out;
}
const warmOn = await warmProbe('');
const warmOff = await warmProbe('?warm=0');
check(warmOn.warmOn === true && warmOn.warmMs > 0,
      'the warm-up ran by default', `warmOn=${warmOn.warmOn} warmMs=${warmOn.warmMs}`);
// NOT a timing comparison: `warmMs <= costMs` is true whichever side of
// `closed = true` the warm-up runs on, so the first version of this check
// passed with the two lines swapped. The module records the fact instead.
check(warmOn.warmedWhileClosed === true,
      'it ran while the gate was still SHUT — before any caller was released',
      `warmedWhileClosed=${warmOn.warmedWhileClosed}, warmMs=${warmOn.warmMs} of costMs=${warmOn.costMs}`);
check(warmOff.warmOn === false && warmOff.warmMs === 0,
      '?warm=0 skips it, which is what makes the A/B measurable',
      `warmOn=${warmOff.warmOn} warmMs=${warmOff.warmMs}`);

console.log(`\n[preload-concurrency] ${failures ? failures + ' CHECK(S) FAILED' : 'all checks passed'}`);
await browser.close();
await server.close();
process.exit(failures ? 1 : 0);
