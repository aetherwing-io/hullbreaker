// backdrop-capture.mjs — dev-only evidence rig for T-051 (backdrop layers:
// graded anatomy plates on the six-face route, decisions.md entries 16/17).
// Same shape as tools/playtest/scale-capture.mjs (T-045's own evidence rig):
// it captures the SAME moment of the SAME driven run twice — once on the
// shipped default and once at ?backdrop=flat, which restores the pre-T-051
// background exactly — so the before/after is one URL apart in one build.
//
//   node backdrop-capture.mjs shots      — the paired frames, into
//                                         reports/tasks/T-051/evidence/
//   node backdrop-capture.mjs measure    — pixel stats on whatever is there
//                                         (no browser)
//
// Options: --viewport WxH (default 1440x900), --out <dir>.
//
// WHY THE PAIRS ARE COMPARABLE. Both runs replay the identical input
// schedule (tools/playtest/scripts/six-face-spaced-run.json's own policy)
// against the identical seeded sim, and the frame is taken at a scrollX
// threshold rather than a wall clock, so the camera pose is the same in
// both. The shipped scroll is a constant (CONFIG.scrollSpeed; ?momentum= is
// off by default), which is what makes that true.
//
// WHY ONLY FACETS 1 AND 2. six-face-spaced-run.json's own header records
// nine measured runs of this exact policy: EVERY one reaches wave gate 2 /
// scroll ~140-153 before GAME_OVER, none clears it. Facets 3-6 (placements
// at s=186.5, 251.5, 316.5, 381.5) are therefore not reachable by any policy
// this repo ships today — left uncaptured rather than reached with a poked
// CONFIG, which would not be evidence about the shipped build.
//
// HONESTY NOTE, same class as scale-capture.mjs's: hostile positions can
// differ by a frame or two of timing jitter between the two runs of a pair.
// Judge the backdrop plate and the camera framing around it, not sprites.

import { chromium } from 'playwright-core';
import { mkdirSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './lib/server.mjs';
import { sampleState } from './lib/sampler.mjs';
import { compilePolicy, evaluatePolicyTick } from './lib/policy.mjs';
import { decodePng } from '../assets/lib/png.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const ARGV = process.argv.slice(2);
const MODE = ARGV[0] || 'shots';
const argOf = (name, fallback) => {
  const i = ARGV.indexOf(name);
  return i >= 0 && ARGV[i + 1] ? ARGV[i + 1] : fallback;
};
const OUT = resolve(repoRoot, argOf('--out', join('reports', 'tasks', 'T-051', 'evidence')));
const [vw, vh] = argOf('--viewport', '1440x900').split('x').map(Number);
const VIEWPORT = { width: vw, height: vh };

const DRIVE_SCRIPT = resolve(here, 'scripts', 'six-face-spaced-run.json');
// scroll thresholds: an early reference before facet 1's own placements, the
// facet 1 pair (near=limbSegment @ -13, far=crownHorizon @ -23; s mid = 56.5),
// the corner 1 approach (where the facet 1 plates recede and the view starts
// swinging), and the facet 2 pair (mid=spineCoil @ -18, far=colonyCluster
// @ -23; s mid = 121.5) — each is "a point where the plate changes."
const MOMENTS = [
  { tag: '01-early', scroll: 20, note: 'before facet 1\'s own plates, near the ramp start' },
  { tag: '02-facet1-plates', scroll: 56, note: 'facet 1: limbSegment (near) + crownHorizon (far)' },
  { tag: '03-corner1-approach', scroll: 84, note: 'facet 1 plates receding, corner 1 filling the frame' },
  { tag: '04-facet2-plates', scroll: 121, note: 'facet 2: spineCoil (mid) + colonyCluster (far)' },
];
const VARIANTS = [
  { tag: 'after', query: '?testapi=1' },
  { tag: 'before', query: '?testapi=1&backdrop=flat' },
];

async function shots() {
  mkdirSync(OUT, { recursive: true });
  const server = await startStaticServer(repoRoot, { port: 0 });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const report = [];
  try {
    for (const v of VARIANTS) {
      const context = await browser.newContext({ viewport: VIEWPORT });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
      await page.goto(`${server.baseUrl}/index.html${v.query}`, { waitUntil: 'load' });
      await page.waitForTimeout(600);
      const rules = compilePolicy(JSON.parse(readFileSync(DRIVE_SCRIPT, 'utf8')).policy);
      const held = new Set();
      const policyHeld = new Set();
      await page.keyboard.down('KeyJ');
      for (const m of MOMENTS) {
        const deadline = Date.now() + 150000;
        let last = null;
        for (;;) {
          const sample = await page.evaluate(sampleState);
          last = sample;
          if (!sample) break;
          if ((sample.scrollX || 0) >= m.scroll) break;
          if (sample.state === 'GAME_OVER') break;   // died before this moment; skip it honestly
          if (Date.now() > deadline)
            throw new Error(`${m.tag}/${v.tag}: stuck at scroll ` +
              `${(sample.scrollX || 0).toFixed(1)} state ${sample.state} after 150 s`);
          await policyTick(page, rules, sample, held, policyHeld);
          await page.waitForTimeout(60);
        }
        if (last && last.state === 'GAME_OVER') {
          process.stdout.write(`  [${v.tag}] ${m.tag}: SKIPPED — died before scroll ${m.scroll} ` +
            `(reached ${(last.scrollX || 0).toFixed(1)})\n`);
          report.push({ moment: m.tag, variant: v.tag, skipped: true, reached: last.scrollX });
          continue;
        }
        await page.waitForTimeout(80);
        const backdrop = await page.evaluate(() => (window.__HB_BACKDROP ? window.__HB_BACKDROP() : null));
        if (last) process.stdout.write(
          `  [${v.tag}] ${m.tag}: scroll ${(last.scrollX || 0).toFixed(1)} state ${last.state} ` +
          `backdrop.built=${backdrop ? backdrop.built : 'n/a'}\n`);
        const file = join(OUT, `${m.tag}-${v.tag}.png`);
        await page.screenshot({ path: file });
        report.push({ moment: m.tag, variant: v.tag, file, scrollX: last ? last.scrollX : null, backdrop });
      }
      for (const code of policyHeld) { try { await page.keyboard.up(code); } catch {} }
      await page.keyboard.up('KeyJ');
      if (errors.length) process.stdout.write('  page errors: ' + errors.join(' | ') + '\n');
      await context.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }
  return report;
}

async function policyTick(page, rules, sample, held, policyHeld) {
  const { desiredHolds, tapsToFire } = evaluatePolicyTick(rules, sample, held);
  for (const code of desiredHolds) {
    if (!policyHeld.has(code)) {
      try { await page.keyboard.down(code); } catch {}
      policyHeld.add(code); held.add(code);
    }
  }
  for (const code of [...policyHeld]) {
    if (!desiredHolds.has(code)) {
      try { await page.keyboard.up(code); } catch {}
      policyHeld.delete(code); held.delete(code);
    }
  }
  for (const t of tapsToFire) {
    try { await page.keyboard.down(t.code); } catch {}
    held.add(t.code);
    setTimeout(() => {
      page.keyboard.up(t.code).then(() => held.delete(t.code)).catch(() => {});
    }, t.holdMs);
  }
}

/* --------------------------- the measurement ------------------------ *
 * Deliberately simple: coverage of the single most common exact color and
 * how many distinct colors the frame carries, over the FULL frame (not a
 * band — the plates sit at different heights per moment, unlike the fixed
 * fog-band read scale-capture.mjs's own `measure` uses). */
function frameStats(file) {
  const { width, height, rgba } = decodePng(file);
  const counts = new Map();
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const key = (rgba[o] << 16) | (rgba[o + 1] << 8) | rgba[o + 2];
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    pixels: width * height,
    unique: counts.size,
    topColor: '#' + top[0].toString(16).padStart(6, '0'),
    topCoverage: top[1] / (width * height),
  };
}

function measure() {
  if (!existsSync(OUT)) throw new Error('no captures in ' + OUT + ' — run `shots` first');
  const files = readdirSync(OUT).filter((f) => f.endsWith('.png')).sort();
  const w = (s, n) => String(s).padEnd(n);
  console.log(w('frame', 30) + w('largest exact color', 22) + 'distinct colors');
  for (const f of files) {
    const s = frameStats(join(OUT, f));
    console.log(w(f, 30) + w(s.topColor + ' ' + (s.topCoverage * 100).toFixed(1) + '%', 22) + s.unique);
  }
}

if (MODE === 'shots') {
  const report = await shots();
  console.log(JSON.stringify(report.map((r) => ({
    moment: r.moment, variant: r.variant, scrollX: r.scrollX, skipped: !!r.skipped,
    built: r.backdrop ? r.backdrop.built : undefined,
  })), null, 2));
  measure();
} else if (MODE === 'measure') {
  measure();
} else {
  console.error('usage: node backdrop-capture.mjs [shots|measure] [--viewport WxH] [--out dir]');
  process.exit(2);
}
