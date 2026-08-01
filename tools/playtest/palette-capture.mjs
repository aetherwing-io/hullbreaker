// palette-capture.mjs — dev-only evidence script for the T-010 palette pass.
// Captures the same moment in both palettes (concept default vs
// ?palette=classic) across the run modes the operator judges at FAR view,
// then composes labeled side-by-side pairs. Output goes to
// artifacts/palette-v1/ at the repo root this script is run from (the
// harness's own static server serves that root, so a worktree serves
// itself). Reuses the playtest harness's playwright-core dependency; not
// wired into run.mjs because it is a screenshot rig, not a scripted bot.
//
// HONESTY NOTE: pairs are matched by identical input schedules + the seeded
// sim rng, not by frame-locked replay — hostile positions can differ by a
// frame or two of timing jitter between the two runs of a pair. Composition
// and palette are exactly comparable; individual sprite positions are
// approximately comparable. Threat-readability judgments should use the
// whole frame, not pixel deltas.
//
//   node palette-capture.mjs                  — all scenes, both palettes, + pairs
//   node palette-capture.mjs transform-boot   — just the named scene tag(s)
//     (used to refresh one pair after a merge reworks only that slice)

import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './lib/server.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const OUT = resolve(repoRoot, 'artifacts', 'palette-v1');
mkdirSync(OUT, { recursive: true });

const PALETTES = [
  { id: 'concept', qs: '' },                    // the shipped default: no flag
  { id: 'classic', qs: '&palette=classic' },    // grey-box baseline
];

// One fixed input schedule per scene (hold right + fire, jump cadence), so
// both palette runs of a pair see the same seeded world at the same age.
async function driveSchedule(page, seq, untilMs, shotAt, path) {
  const t0 = Date.now();
  let i = 0;
  let shot = false;
  while (Date.now() - t0 < untilMs) {
    const now = Date.now() - t0;
    while (i < seq.length && seq[i][2] <= now) {
      const [type, code] = seq[i];
      try { await page.keyboard[type === 'keydown' ? 'down' : 'up'](code); } catch {}
      i++;
    }
    if (!shot && now >= shotAt) {
      await page.screenshot({ path });
      shot = true;
      break;
    }
    await page.waitForTimeout(25);
  }
  if (!shot) await page.screenshot({ path });
}

function jumpCadence(from, to, holdMs = 180, everyMs = 800) {
  const seq = [['keydown', 'ArrowRight', 0], ['keydown', 'KeyJ', 80]];
  for (let t = from; t < to; t += everyMs) {
    seq.push(['keydown', 'Space', t], ['keyup', 'Space', t + holdMs]);
  }
  return seq;
}

// Traversal action moment: poll for airborne-near-a-hostile (the threat-
// readability frame), same approach as viewscale-capture.mjs.
async function driveTraversal(page, path) {
  const seq = jumpCadence(300, 6500);
  const t0 = Date.now();
  let i = 0;
  while (Date.now() - t0 < 7000) {
    const now = Date.now() - t0;
    while (i < seq.length && seq[i][2] <= now) {
      const [type, code] = seq[i];
      try { await page.keyboard[type === 'keydown' ? 'down' : 'up'](code); } catch {}
      i++;
    }
    const st = await page.evaluate(() => {
      const hb = window.HB;
      if (!hb) return null;
      const p = hb.player;
      const hs = (hb.hostiles || []).filter((h) => h.hp > 0);
      return { air: !p.grounded && hs.some((h) => Math.abs(h.x - p.x) < 7 && Math.abs(h.y - p.y) < 6) };
    });
    if (st && st.air && now > 1200) {
      await page.screenshot({ path });
      return true;
    }
    await page.waitForTimeout(30);
  }
  await page.screenshot({ path });   // fallback: late frame, still evidence
  return false;
}

const SCENES = [
  { tag: 'sixface-boot', url: '/index.html?view=far',
    run: (page, path) => page.waitForTimeout(1400).then(() => page.screenshot({ path })) },
  { tag: 'sixface-action', url: '/index.html?view=far',
    run: (page, path) => driveSchedule(page, jumpCadence(300, 5200), 5600, 4600, path) },
  { tag: 'traversal-action', url: '/index.html?slice=traversal&view=far&testapi=1&enemies=1',
    run: (page, path) => driveTraversal(page, path) },
  // T-010 fix-cycle: the polyp trial is the enemy-role frame. It is captured
  // standing still (no schedule) at ~4.6s, deep enough into the solo teach
  // stage that the emplacement has cycled closed -> tell -> fire at least
  // once, so the acid body, the warm tell, and the hot beam are all judgeable
  // in one frame against board 06/07's enemy family.
  { tag: 'polyp-trial', url: '/index.html?slice=traversal&view=far&polyp=1&testapi=1',
    run: (page, path) => page.waitForTimeout(4600).then(() => page.screenshot({ path })) },
  { tag: 'g1-limb', url: '/index.html?g1=1&view=far',
    run: (page, path) => driveSchedule(page, jumpCadence(300, 3600), 4200, 3400, path) },
  { tag: 'transform-boot', url: '/index.html?slice=transform&view=far&enemies=0',
    run: (page, path) => page.waitForTimeout(1000).then(() => page.screenshot({ path })) },
];

async function composePair(browser, tag) {
  const files = PALETTES.map((p) => resolve(OUT, `${tag}--${p.id}.png`));
  const datas = files.map((f) => 'data:image/png;base64,' + readFileSync(f).toString('base64'));
  const page = await browser.newPage({ viewport: { width: 2600, height: 850 } });
  await page.setContent(`
    <body style="margin:0;background:#000;font:700 22px ui-monospace,monospace;color:#fff">
      <div style="display:flex;gap:8px">
        ${PALETTES.map((p, i) => `
          <figure style="margin:0">
            <figcaption style="padding:6px 10px">${tag} — ${p.id}${p.id === 'concept' ? ' (default)' : ' (?palette=classic)'}</figcaption>
            <img src="${datas[i]}" style="width:1288px;display:block">
          </figure>`).join('')}
      </div>
    </body>`);
  await page.waitForTimeout(250);
  await page.screenshot({ path: resolve(OUT, `${tag}--pair.png`), fullPage: true });
  await page.close();
}

const only = process.argv.slice(2);
const picked = only.length ? SCENES.filter((s) => only.includes(s.tag)) : SCENES;
if (!picked.length) {
  console.error(`no scene matches [${only.join(', ')}]; tags: ${SCENES.map((s) => s.tag).join(', ')}`);
  process.exit(1);
}

const server = await startStaticServer(repoRoot, { port: 0 });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const scene of picked) {
    for (const pal of PALETTES) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      await page.goto(`${server.baseUrl}${scene.url}${pal.qs}`, { waitUntil: 'load' });
      await page.waitForTimeout(300);
      const path = resolve(OUT, `${scene.tag}--${pal.id}.png`);
      await scene.run(page, path);
      console.log(`captured ${scene.tag} [${pal.id}]`);
      await context.close();
    }
    await composePair(browser, scene.tag);
    console.log(`  pair -> ${scene.tag}--pair.png`);
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(`done: ${OUT}`);
