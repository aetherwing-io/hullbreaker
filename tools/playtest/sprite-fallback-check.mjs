// sprite-fallback-check.mjs — the gate decisions.md entry 16 attached to
// runtime assets, run as a test instead of promised in a comment:
//
//   "a missing or failed asset must degrade visibly and safely … must never
//    wedge the game, and must never be something the sim branches on. Art
//    may fail to load; gameplay may not change when it does."
//
// Two conditions, one script:
//   art       the tree as it stands
//   no-art    every request under assets/generated/sprites/ is aborted at
//             the network, which is what a 404, a truncated deploy or a
//             dead CDN looks like from inside the page
//
// and three questions, each answered by a measurement rather than by
// reading the code:
//
//   1. DOES THE RUN DIVERGE? Both conditions play the same scripted input
//      under ?fixeddt (the sim's own constant-step verification hook), and
//      the page records a digest of the SIM's state at every 250ms of game
//      time. The two digest streams are compared frame for frame. Any
//      difference at all is a failure: it would mean gameplay noticed the
//      art.
//   2. IS ANYTHING BLANK? One of each hostile kind is spawned through the
//      game's own spawnHostile(), the frame is screenshotted, and the box
//      around each body is measured for how much of it differs from the
//      background it stands against. A body that failed to draw is a box
//      that matches its background. Both conditions must draw all five.
//   3. DID IT WEDGE? The T-032 failsafe channel is read in both: no panel
//      showing, not halted, zero faults, zero uncaught errors, and the
//      frame loop still beating.
//
// Usage:
//   node sprite-fallback-check.mjs                 both conditions
//   node sprite-fallback-check.mjs --out <dir>     evidence directory
//
// Exit code is 0 only if every check passed; the output names each one.
//
// HONESTY NOTES:
//   * Aborting the request is not the only way art can fail. A file that
//     arrives corrupt takes the same code path (the loader's error
//     callback) but is not exercised here; a physically deleted directory
//     IS exercised, by running this script with the files moved aside —
//     see reports/tasks/T-049/build.md for that run's log.
//   * The digest is the sim's own published snapshot (window.HB.snapshot()).
//     If a future sim field escapes that snapshot, this check cannot see it
//     diverge. It covers what the harness's own metrics cover.
//   * The blankness measure is a heuristic about pixels, not a judgement
//     about art: it can tell "something is drawn there" from "nothing is",
//     and nothing finer.

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './lib/server.mjs';
import { decodePng } from '../assets/lib/png.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const argv = process.argv.slice(2);
const outArg = argv.indexOf('--out');
const OUT = resolve(outArg >= 0 ? argv[outArg + 1] : resolve(repoRoot, 'artifacts', 'sprites-v1', 'fallback'));
mkdirSync(OUT, { recursive: true });

const VIEWPORT = { width: 1280, height: 800 };
const FIXED_DT_MS = 16.6667;         // ?fixeddt — one constant sim step per frame
const RUN_MS = 12000;                // game time of the scripted stretch
const PRESS_AT_MS = 500;             // when the held keys go down, in game time
const DIGEST_EVERY_MS = 250;
// planted AHEAD of RIG, where the FAR camera has the most room, and outside
// every kind's trigger range (hound.senseRange 8, wasp.diveRange 6.5) so
// nobody is mid-telegraph when the shutter fires
const LINEUP = [
  { kind: 'carrier', dx: 3.0, dy: 4.2 },
  { kind: 'polyp', dx: 6.0, dy: 1.05, dir: 1 },
  { kind: 'mortar', dx: 9.0, dy: 1.05, dir: 1 },
  { kind: 'wasp', dx: 12.0, dy: 2.8 },
  { kind: 'hound', dx: 15.0, dy: 0.45 },
];

let failures = 0;
function check(cond, label, detail) {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? ' — ' + detail : ''));
  if (!cond) failures++;
}

/* ------------------------------ page work -------------------------------- */

// Installed before the run, and it owns BOTH halves of the comparison:
//   - it presses the run's keys itself, on the frame the game's own clock
//     crosses a mark. Dispatching from Node instead (even in the harness's
//     deterministic mode) lands the press on whichever frame the poll
//     happened to catch, and one frame of difference is a divergence this
//     check would then report as if the sim had branched on the art.
//   - it records the SIM's own snapshot every 250ms of game time, on the
//     frame it crosses the mark, so two runs compare mark for mark.
const INSTALL_DIGEST = ({ everyMs, pressAtMs, codes }) => {
  window.__T049 = [];
  let last = -1;
  let pressed = false;
  const r6 = (n) => (typeof n === 'number' ? Math.round(n * 1e6) / 1e6 : n);
  const tick = () => {
    const hb = window.HB;
    if (hb && hb.state() === 'PLAYING') {
      const gm = hb.gameMs();
      if (!pressed && gm >= pressAtMs) {
        pressed = true;
        for (const code of codes) {
          window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
        }
      }
      const bucket = Math.floor(gm / everyMs);
      if (bucket !== last) {
        last = bucket;
        const s = hb.snapshot();
        window.__T049.push(JSON.stringify({
          b: bucket,
          p: [r6(s.player.x), r6(s.player.y), r6(s.player.vx), r6(s.player.vy),
              s.player.hp, s.player.lives, s.player.grounded, s.player.facing],
          k: s.kills, f: s.shotsFired, w: s.currentWeapon,
          sc: [r6(s.scrollX), r6(s.edgeLeft), r6(s.edgeRight)],
          h: (s.hostiles || []).map((e) => [e.kind, r6(e.x), r6(e.y), e.hp, e.state]),
          c: (s.capsules || []).map((c) => [c.kind, c.letter, r6(c.x), r6(c.y)]),
        }));
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const SPAWN = async (lineup) => {
  const H = await import('/src/sim/hostiles.js');
  const P = await import('/src/sim/player.js');
  const T = await import('/src/sim/time.js');
  H.clearHostiles();
  const px = P.player.x, py = P.player.y;
  for (const row of lineup) {
    const x = px + row.dx, y = py + row.dy;
    H.spawnHostile(x, y, 0, row.kind, {
      dir: row.dir || -1,
      zone: row.kind === 'mortar' ? { x: x - 10, y } : undefined,
    });
  }
  return T.gameMs;
};

const PROJECT = async () => {
  const [THREE, S, TW, HS] = await Promise.all([
    import('three'), import('/src/render/scene.js'),
    import('/src/render/tower.js'), import('/src/sim/hostiles.js'),
  ]);
  const v = new THREE.Vector3();
  const pose = { x: 0, y: 0, z: 0, yaw: 0, alt: 0 };
  return HS.hostiles.map((e) => {
    TW.towerPose(e.x, pose);
    v.set(pose.x, e.y + pose.alt, pose.z).project(S.camera);
    return {
      kind: e.kind,
      sx: Math.round((v.x * 0.5 + 0.5) * innerWidth),
      sy: Math.round((-v.y * 0.5 + 0.5) * innerHeight),
    };
  });
};

/* --------------------------- pixel measurement ---------------------------- */

// "is anything drawn here": the fraction of a box around the body whose
// pixels differ from the box's own most common color (its background)
function drawnFraction(png, cx, cy, half = 14) {
  const { width, height, rgba } = png;
  const counts = new Map();
  const px = [];
  for (let y = Math.max(0, cy - half); y < Math.min(height, cy + half); y++) {
    for (let x = Math.max(0, cx - half); x < Math.min(width, cx + half); x++) {
      const o = (y * width + x) * 4;
      const key = (rgba[o] >> 3) + ',' + (rgba[o + 1] >> 3) + ',' + (rgba[o + 2] >> 3);
      counts.set(key, (counts.get(key) || 0) + 1);
      px.push(key);
    }
  }
  let modal = null, best = -1;
  for (const [k, n] of counts) if (n > best) { best = n; modal = k; }
  return px.length ? px.filter((k) => k !== modal).length / px.length : 0;
}

/* -------------------------------- driver --------------------------------- */

const server = await startStaticServer(repoRoot);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = {};

for (const mode of [{ id: 'art', block: false }, { id: 'no-art', block: true }]) {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const warnings = [];
  page.on('console', (m) => {
    if (m.type() === 'warning' || m.type() === 'error') warnings.push(m.text());
  });
  if (mode.block) {
    await page.route('**/assets/generated/sprites/**', (route) => route.abort());
  }
  await page.addInitScript(INSTALL_DIGEST,
    { everyMs: DIGEST_EVERY_MS, pressAtMs: PRESS_AT_MS, codes: ['ArrowRight', 'KeyX'] });
  const url = `${server.baseUrl}/index.html?slice=traversal&testapi=1&fixeddt=${FIXED_DT_MS}`;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.HB && window.HB.state() === 'PLAYING', { timeout: 15000 });
  // the keys are pressed IN the page, keyed to the sim clock (see
  // INSTALL_DIGEST): nothing about this run is timed from out here
  await page.waitForFunction((ms) => window.HB.gameMs() >= ms, RUN_MS, { timeout: 90000 });
  await page.evaluate((codes) => {
    for (const code of codes) window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  }, ['ArrowRight', 'KeyX']);

  const digest = await page.evaluate(() => window.__T049);
  const sprites = await page.evaluate(() => (typeof window.__HB_SPRITES === 'function'
    ? window.__HB_SPRITES() : null));
  const failsafe = await page.evaluate(() => window.HB.failsafe());
  // a run that died mid-stretch stops recording and moves RIG somewhere else
  // on the retry: that is a different run, not a divergence, and it has to
  // announce itself rather than surface as four mystery failures downstream
  const endState = await page.evaluate(() => ({
    state: window.HB.state(), attempts: window.HB.sliceStats.attempts,
  }));

  // …then the lineup, for the "nothing is blank" half
  await page.evaluate(SPAWN, LINEUP);
  await page.waitForFunction((t) => window.HB.gameMs() >= t, await page.evaluate(() => window.HB.gameMs() + 1200), { timeout: 30000 });
  const bodies = await page.evaluate(PROJECT);
  const shot = resolve(OUT, `lineup-${mode.id}.png`);
  await page.screenshot({ path: shot });
  const png = decodePng(shot);
  const drawn = bodies.map((b) => ({ ...b, drawn: drawnFraction(png, b.sx, b.sy) }));

  results[mode.id] = { digest, sprites, failsafe, endState, drawn, warnings, shot };
  await page.close();
}

/* -------------------------------- verdict -------------------------------- */

console.log('\n=== 0. both runs are actually comparable ===');
for (const mode of ['art', 'no-art']) {
  const e = results[mode].endState;
  check(e.state === 'PLAYING' && e.attempts <= 1,
        `${mode}: the scripted stretch ran start to finish without a death`,
        `state=${e.state} attempts=${e.attempts}`);
}

console.log('\n=== 1. the sim must not branch on whether the art loaded ===');
const A = results.art.digest, B = results['no-art'].digest;
// The scripted stretch is RUN_MS of game time; a run may carry one extra
// trailing sample because the wait that ENDS it is polled from out here, so
// the compared window is the scripted one and the tail is reported, never
// counted as a divergence.
const WANT = Math.floor(RUN_MS / DIGEST_EVERY_MS);
check(A.length >= WANT && B.length >= WANT,
      `both runs produced the scripted ${WANT} samples of ${DIGEST_EVERY_MS}ms game time`,
      `${A.length} / ${B.length} recorded`);
const n = Math.min(A.length, B.length, WANT);
let firstDiff = -1;
for (let i = 0; i < n; i++) if (A[i] !== B[i]) { firstDiff = i; break; }
check(firstDiff === -1, 'the two sim traces are identical, sample for sample',
      firstDiff === -1 ? `${n} samples compared` : `first difference at sample ${firstDiff}:\n    art:    ${A[firstDiff]}\n    no-art: ${B[firstDiff]}`);

console.log('\n=== 2. the art really did fail in the no-art run, and drew in the other ===');
const kinds = Object.keys(results.art.sprites.kinds);
check(kinds.every((k) => results.art.sprites.kinds[k].state === 'ready'),
      'every kind loaded its sprite in the control run',
      kinds.map((k) => k + ':' + results.art.sprites.kinds[k].state).join(' '));
check(kinds.every((k) => results['no-art'].sprites.kinds[k].state === 'failed'),
      'every kind reports a FAILED sprite when the art is unreachable',
      kinds.map((k) => k + ':' + results['no-art'].sprites.kinds[k].state).join(' '));
check(results['no-art'].warnings.some((w) => /did not load/.test(w)),
      'the failure is visible in the console, naming the file',
      results['no-art'].warnings.find((w) => /did not load/.test(w)) || '(no line)');

console.log('\n=== 3. nothing is blank: every body still draws, both ways ===');
const onScreen = (b) => b.sx > 20 && b.sx < VIEWPORT.width - 20 &&
  b.sy > 20 && b.sy < VIEWPORT.height - 20;
for (const mode of ['art', 'no-art']) {
  for (const b of results[mode].drawn) {
    // a body the camera is not looking at proves nothing either way, and
    // must never be allowed to read as a pass
    check(onScreen(b), `${mode}: the ${b.kind} is inside the frame to be judged`,
          `(${b.sx},${b.sy}) in ${VIEWPORT.width}x${VIEWPORT.height}`);
    if (!onScreen(b)) continue;
    check(b.drawn >= 0.08,
          `${mode}: a ${b.kind} is drawn at (${b.sx},${b.sy})`,
          (b.drawn * 100).toFixed(0) + '% of its box differs from the background');
  }
}

console.log('\n=== 4. it did not wedge ===');
for (const mode of ['art', 'no-art']) {
  const f = results[mode].failsafe;
  check(!f.showing && !f.halted && f.faults === 0 && f.uncaught === 0 && f.beats > 60,
        `${mode}: no failure panel, no fault, the frame loop still beating`,
        `showing=${f.showing} halted=${f.halted} faults=${f.faults} uncaught=${f.uncaught} beats=${f.beats}`);
}

writeFileSync(resolve(OUT, 'fallback-check.json'), JSON.stringify({
  fixedDtMs: FIXED_DT_MS, runMs: RUN_MS, digestEveryMs: DIGEST_EVERY_MS,
  samples: { art: A.length, noArt: B.length }, firstDiff,
  sprites: { art: results.art.sprites, noArt: results['no-art'].sprites },
  drawn: { art: results.art.drawn, noArt: results['no-art'].drawn },
  failsafe: { art: results.art.failsafe, noArt: results['no-art'].failsafe },
  warnings: results['no-art'].warnings,
}, null, 2) + '\n');

console.log(`\n[sprite-fallback] ${failures ? failures + ' CHECK(S) FAILED' : 'all checks passed'} — evidence in ${OUT}`);
await browser.close();
await server.close();
process.exit(failures ? 1 : 0);
