// t044-capture.mjs — dev-only evidence script for T-044's corner reveal set
// pieces (ARRIVAL + ARENA, src/pure/lattice.js). Same shape as the other
// tools/playtest/*-capture.mjs rigs: reuses the harness's static server +
// playwright-core + the SAME relative-geometry reflex policy
// scripts/six-face-aimed-run.json runs (measured to clear wave gates 1-3 and
// reach maxX 219.3 — the best documented policy for this run), replayed here
// as direct keyboard holds instead of the JSON policy grammar because this
// rig also needs several mid-run SCREENSHOTS keyed to RIG's position, not
// one shot at a fixed moment. Reuses lib/sampler.mjs + lib/threat.mjs (the
// harness's own relative-geometry projection) so the reflex is the same
// computation the JSON policy already runs, not a re-derivation of it.
//
//   node t044-capture.mjs
//
// Output: runs/t044/<tag>.png (gitignored) plus a log of where each shot was
// taken and how far the run got before it stopped.

import { chromium } from 'playwright-core';
import { startStaticServer } from './lib/server.mjs';
import { sampleState } from './lib/sampler.mjs';
import { deriveThreat } from './lib/threat.mjs';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, 'runs', 't044');
mkdirSync(OUT, { recursive: true });

// Authored landmarks (measured off the shipped seed via buildLevel — see the
// T-044 build report). Screenshots are taken the first time sampled x
// exceeds each `at`, in order.
const LANDMARKS = [
  { tag: 'f2-arrival', at: 94, note: 'face 2 ARRIVAL catwalk, right after corner 1' },
  { tag: 'f2-arena', at: 124, note: 'face 2 ARENA (Intercept, 1 tier) — wave 2\'s battleground' },
  { tag: 'f3-arrival', at: 159, note: 'face 3 ARRIVAL catwalk, right after corner 2' },
  { tag: 'f3-arena', at: 189, note: 'face 3 ARENA (Contain, 2 tiers)' },
  { tag: 'f4-arrival', at: 224, note: 'face 4 ARRIVAL catwalk, right after corner 3' },
  { tag: 'f4-arena', at: 254, note: 'face 4 ARENA (Quarantine, 2 tiers + perch)' },
  { tag: 'f5-arrival', at: 289, note: 'face 5 ARRIVAL catwalk, right after corner 4' },
  { tag: 'f5-arena', at: 319, note: 'face 5 ARENA (Sterilize, full 3-tier stack)' },
  { tag: 'f6-arrival', at: 354, note: 'face 6 ARRIVAL catwalk, right after corner 5' },
  { tag: 'f6-arena', at: 384, note: 'face 6 ARENA (Scuttle, full 3-tier stack, widest)' },
];

const held = new Set();
async function setKey(page, code, wantDown) {
  const isDown = held.has(code);
  if (wantDown && !isDown) { await page.keyboard.down(code); held.add(code); }
  else if (!wantDown && isDown) { await page.keyboard.up(code); held.delete(code); }
}

async function main() {
  const repoRoot = resolve(here, '..', '..');
  const server = await startStaticServer(repoRoot, { port: 0 });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const log = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${server.baseUrl}/index.html?testapi=1`, { waitUntil: 'load' });
    await page.waitForTimeout(300);
    await setKey(page, 'KeyJ', true);           // hold fire the whole run

    let idx = 0, jumpUntil = 0;
    const t0 = Date.now();
    const maxMs = 240000;
    while (Date.now() - t0 < maxMs && idx < LANDMARKS.length) {
      const sample = await page.evaluate(sampleState);
      if (!sample) { await page.waitForTimeout(40); continue; }
      if (sample.state !== 'PLAYING') {
        log.push(`stopped: state=${sample.state} at x=${sample.x?.toFixed(1)}`);
        break;
      }
      const t = deriveThreat(sample, held);
      const terrain = sample.terrain || { gapDist: 99 };
      const pinned = sample.grounded && Math.abs(sample.vx) < 0.3 && (held.has('ArrowLeft') || held.has('ArrowRight'));
      const houndTell = (sample.hostiles || []).some((h) => h.kind === 'hound' && h.state === 'tell');

      // Same 11 rules as scripts/six-face-aimed-run.json, in the same order.
      let right = null, left = null, up = false;
      if (!sample.hudTC) right = true;
      else if (t.upDist < 13 && t.upDx > 1 && t.upSlope < 2.5) right = true;
      else if (t.upDist < 13 && t.upDx < -1 && t.upSlope < 2.5) left = true;
      else if (t.upDist > 13 && t.dx > 2) right = true;
      else if (t.upDist > 13 && t.dx < -2) left = true;
      if (sample.edgeMargin < 8) right = true;
      if (t.upDist < 13 && t.upSlope > 0.5) up = true;

      await setKey(page, 'ArrowRight', !!right && !left);
      await setKey(page, 'ArrowLeft', !!left);
      await setKey(page, 'ArrowUp', up);

      const now = Date.now();
      let doJump = false;
      if (pinned) doJump = true;
      else if (houndTell) doJump = true;
      else if (sample.grounded && terrain.gapDist > 3 && t.upDist > 3.5) doJump = true;
      else if (sample.grounded && terrain.gapDist < 2.2) doJump = true;
      else if (!sample.grounded && sample.vy < 0 && terrain.gapDist < 1.2) doJump = true;
      if (doJump && now > jumpUntil) {
        await setKey(page, 'Space', true);
        jumpUntil = now + 420;
        setTimeout(() => { setKey(page, 'Space', false).catch(() => {}); }, 420);
      }

      while (idx < LANDMARKS.length && sample.x >= LANDMARKS[idx].at) {
        const lm = LANDMARKS[idx];
        const path = `${OUT}/${lm.tag}.png`;
        await page.screenshot({ path });
        log.push(`${lm.tag}: shot at x=${sample.x.toFixed(1)} y=${sample.y.toFixed(1)} hp=${sample.hp} ` +
          `lives=${sample.lives} scrollX=${sample.scrollX.toFixed(1)} — ${lm.note}`);
        console.log(`  ${lm.tag}: x=${sample.x.toFixed(1)} -> ${path}`);
        idx++;
      }
      await page.waitForTimeout(45);
    }
    if (idx < LANDMARKS.length) log.push(`reached ${idx} of ${LANDMARKS.length} landmarks before stopping`);
    await context.close();
  } finally {
    await browser.close();
    await server.close();
  }
  console.log('\n' + log.join('\n'));
}

await main();
