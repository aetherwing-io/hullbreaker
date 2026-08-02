// fogband-capture.mjs — dev-only evidence rig for T-056 (one haze band: T-035b's
// reconciliation of T-035's S2 shifted band against T-045's backdrop tiers).
//
// Re-implements the paired-population measurement T-035's own report and
// T-035b's build.md both used (rust/teal role split, share under L25.5,
// playfield crop) as a runnable script — neither of those reports committed
// the script that produced their numbers, so this is a fresh implementation
// of the SAME method, not a replay of their exact capture. Read the numbers
// here as a re-verification on this tree, not as a byte-for-byte reproduction.
//
//   node fogband-capture.mjs shots     — capture the three variants into
//                                        reports/tasks/T-056/evidence/
//   node fogband-capture.mjs measure   — stats on whatever PNGs are there
//                                        (no browser)
//
// Options: --viewport WxH (default 1280x800, matching both reports), --out <dir>.
//
// THE THREE VARIANTS, per SPRINT.md's T-056 entry / the team-lead's brief:
//   shipped   ?testapi=1                  — today's default: shadeFog (shifted)
//   t045band  ?testapi=1&__fogband=limb   — CONFIG.limb.fog (T-045's own band)
//   approved  ?testapi=1&scale=0          — the ladder's pre-T-045 reference
//     (backdrop tiers off, silhouette pair back — whatever band camera.js
//     selects by default, unmodified)
//
// `t045band` needs a code path that does not exist on an unpatched tree
// (there is no URL flag that selects CONFIG.limb.fog while the ladder is
// armed) — see runVariant()'s patch/restore for how this rig gets it without
// leaving anything behind.
//
// METHOD (verbatim from artifacts/shade-v1/README.md's pre-registered P1/P3,
// applied here to the SAME frame instead of a shade dose):
//   playfield crop = rows 12%-88% (excludes the HUD strip and the dev legend)
//   rust = r>g>b (play surfaces: deck, hull, machinery — palette.js's own
//     METAL role)              teal = g>r AND b>r (ENVIRONMENT role: sky,
//     haze, wall, backdrop anatomy)
//   P1 = median(rust) - median(teal), signed (more negative = wider, since
//     rust is authored brighter than teal)
//   P3 = share of playfield pixels at or under luminance 25.5 (boards'
//     darkest tenth, per shade-v1)
//   p5 = the 5th percentile luminance of the whole playfield crop
//   luminance = Rec.709 over sRGB bytes, same as scale-capture.mjs
//
// HONESTY NOTE, same class as scale-capture.mjs's: this rig drives with the
// judged six-face policy for a fixed WALL-CLOCK duration (not a scrollX
// threshold), so hostile positions and exact scroll position can differ by a
// fraction of a second between variants. Composition and value are
// comparable; treat small (<1 level) deltas as noise, exactly as T-035b's
// own report did with its "shifted vs T-045" separation gap.

import { chromium } from 'playwright-core';
import { mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './lib/server.mjs';
import { compilePolicy, evaluatePolicyTick } from './lib/policy.mjs';
import { sampleState } from './lib/sampler.mjs';
import { decodePng } from '../assets/lib/png.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const ARGV = process.argv.slice(2);
const MODE = ARGV[0] || 'shots';
const argOf = (name, fallback) => {
  const i = ARGV.indexOf(name);
  return i >= 0 && ARGV[i + 1] ? ARGV[i + 1] : fallback;
};
const OUT = resolve(repoRoot, argOf('--out', join('reports', 'tasks', 'T-056', 'evidence')));
const [vw, vh] = argOf('--viewport', '1280x800').split('x').map(Number);
const VIEWPORT = { width: vw, height: vh };
const DRIVE_MS = 10000;   // "10s" in both reports being re-verified

const DRIVE_SCRIPT = resolve(here, 'scripts', 'six-face-spaced-run.json');

const CAMERA_JS = resolve(repoRoot, 'src', 'render', 'camera.js');
const SHIPPED_LINE =
  "const F = IS_G1 ? (SHADE_GAIN > 0 ? CONFIG.limb.shadeFog : CONFIG.limb.fog) : CONFIG.fog;";
const T045_LINE = "const F = IS_G1 ? CONFIG.limb.fog : CONFIG.fog;";

const VARIANTS = [
  { tag: 'shipped', query: '?testapi=1', patch: null,
    note: 'today\'s default: CONFIG.limb.shadeFog (26.5/54.5), shifted band' },
  { tag: 't045band', query: '?testapi=1', patch: 'limb.fog',
    note: 'CONFIG.limb.fog (24/52) forced unconditionally, ladder still armed at the default dose' },
  { tag: 'approved', query: '?testapi=1&scale=0', patch: null,
    note: 'the ladder\'s pre-T-045 reference frame: backdrop tiers off (silhouette pair), band unmodified' },
];

async function shots() {
  mkdirSync(OUT, { recursive: true });
  const original = readFileSync(CAMERA_JS, 'utf8');
  if (!original.includes(SHIPPED_LINE)) {
    throw new Error('camera.js does not contain the expected shipped fog-select line — ' +
      'the file has moved since this rig was written; update SHIPPED_LINE before trusting its output');
  }
  const report = [];
  try {
    for (const v of VARIANTS) {
      if (v.patch === 'limb.fog') {
        writeFileSync(CAMERA_JS, original.replace(SHIPPED_LINE, T045_LINE));
      } else {
        writeFileSync(CAMERA_JS, original);   // restored / unpatched for this variant
      }
      const server = await startStaticServer(repoRoot, { port: 0 });
      const browser = await chromium.launch({ channel: 'chrome', headless: true });
      try {
        const context = await browser.newContext({ viewport: VIEWPORT });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
        await page.goto(`${server.baseUrl}/index.html${v.query}`, { waitUntil: 'load' });
        await page.waitForTimeout(600);
        const rules = compilePolicy(JSON.parse(readFileSync(DRIVE_SCRIPT, 'utf8')).policy);
        const held = new Set();
        const policyHeld = new Set();
        await page.keyboard.down('KeyJ');   // fire held, same as scale/backdrop-capture.mjs
        const deadline = Date.now() + DRIVE_MS;
        let last = null;
        for (;;) {
          const sample = await page.evaluate(sampleState);
          last = sample;
          if (!sample) break;
          if (Date.now() > deadline) break;
          if (sample.state === 'GAME_OVER') break;   // died before 10s; report it honestly
          await policyTick(page, rules, sample, held, policyHeld);
          await page.waitForTimeout(60);
        }
        await page.waitForTimeout(80);
        const died = last && last.state === 'GAME_OVER';
        const file = join(OUT, `${v.tag}.png`);
        await page.screenshot({ path: file });
        if (last) process.stdout.write(
          `  [${v.tag}] scroll ${(last.scrollX || 0).toFixed(1)} state ${last.state}` +
          (died ? ' (DIED before 10s — frame reflects wherever the run ended)' : '') + '\n');
        if (errors.length) process.stdout.write('  page errors: ' + errors.join(' | ') + '\n');
        for (const code of policyHeld) { try { await page.keyboard.up(code); } catch {} }
        await page.keyboard.up('KeyJ');
        await context.close();
        report.push({ variant: v.tag, file, scrollX: last ? last.scrollX : null, died, note: v.note });
      } finally {
        await browser.close();
        await server.close();
      }
    }
  } finally {
    writeFileSync(CAMERA_JS, original);   // ALWAYS restored, even if a variant throws
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

/* --------------------------- the measurement ------------------------ */

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function measureFile(file) {
  const { width, height, rgba } = decodePng(file);
  const y0 = Math.floor(height * 0.12), y1 = Math.floor(height * 0.88);
  const rust = [], teal = [], all = [];
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
      const v = lum(r, g, b);
      all.push(v);
      if (r > g && g > b) rust.push(v);
      else if (g > r && b > r) teal.push(v);
    }
  }
  const med = (arr) => {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  all.sort((a, b) => a - b);
  const pct = (p) => all[Math.min(all.length - 1, Math.floor(all.length * p))];
  const rustMed = med(rust), tealMed = med(teal);
  const under = all.filter((v) => v <= 25.5).length;
  return {
    pixels: all.length, rustN: rust.length, tealN: teal.length,
    rustMed, tealMed,
    separation: rustMed != null && tealMed != null ? +(tealMed - rustMed).toFixed(1) : null,
    p5: +pct(0.05).toFixed(1),
    shareUnderL25_5: +(100 * under / all.length).toFixed(2),
  };
}

function measure() {
  if (!existsSync(OUT)) throw new Error('no captures in ' + OUT + ' — run `shots` first');
  const files = readdirSync(OUT).filter((f) => f.endsWith('.png')).sort();
  const rows = [];
  console.log('variant'.padEnd(12) + 'separation'.padEnd(12) + 'p5'.padEnd(8) +
              'share<L25.5'.padEnd(14) + 'rust med / teal med');
  for (const f of files) {
    const s = measureFile(join(OUT, f));
    rows.push({ file: f, ...s });
    console.log(
      f.replace('.png', '').padEnd(12) +
      String(s.separation).padEnd(12) +
      String(s.p5).padEnd(8) +
      (s.shareUnderL25_5 + '%').padEnd(14) +
      `${s.rustMed} / ${s.tealMed}`);
  }
  return rows;
}

if (MODE === 'shots') {
  const report = await shots();
  writeFileSync(join(OUT, 'capture-report.json'), JSON.stringify(report, null, 2));
  measure();
} else if (MODE === 'measure') {
  measure();
} else {
  console.error('usage: node fogband-capture.mjs [shots|measure] [--viewport WxH] [--out dir]');
  process.exit(2);
}
