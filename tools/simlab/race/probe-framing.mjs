#!/usr/bin/env node
/* probe-framing.mjs — how far ahead can the player see, measured in Chrome.
 *
 *   node tools/simlab/race/probe-framing.mjs [--only id,id] [--out artifacts/t104-race]
 *
 * For each lab viewport (desktop 16:10 and 16:9, phone landscape 844x390 and
 * portrait 390x844 with hasTouch; plus the landscape phone at the shipped
 * ?view=mid and ?view=near scales, see EXTRA), boots the shipped index.html
 * (?testapi=1&fixeddt=16.667) in an isolated headless Chrome at DPR 1, holds
 * right + fire for 1.5 s of game time through the frame-input bootstrap, then
 * reads the live calibration (window.HB.edges() minus scrollX), RIG's
 * position and the fraction of the frame the HUD and touch deck cover, and
 * saves one screenshot. The JSON compares every edge with the
 * analytic replica in ./edges.mjs that the race lab simulates with.
 *
 * DPR 1 deliberately: LANE-BRIEF notes DPR 3 trips the SwiftShader freeze
 * watchdog on this host. Screenshots are evidence of framing, not of final
 * art quality. Zero effect on the game.
 *
 * The two desktop viewports are probed at an aspect-equivalent smaller size
 * (1280x800 -> 640x400, 1920x1080 -> 960x540): in landscape the calibration
 * depends only on aspect (edges.mjs; no portrait inset or pullback above
 * 0.9), and SwiftShader on a loaded shared host could not paint the full
 * sizes in time. The JSON records both sizes and checks that edges.mjs gives
 * the nominal size the same edges. Phones are probed at their real size with
 * touch emulation. `--only id,id` probes a subset in that order; rows are
 * merged into framing.json as they finish, and a viewport that fails records
 * its error instead of aborting the rest.                                   */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withIsolatedBrowser } from '../../playtest/lib/isolated-browser.mjs';
import { VIEWPORTS, viewportEdges } from './edges.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..', '..', '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const OUT = resolve(ROOT, opt('out', 'artifacts/t104-race'));
const STOP_MS = 1500;   // enough game time to settle the calibration; keeps SwiftShader cost low
const ONLY = opt('only', '') ? opt('only', '').split(',') : null;
const PROBE_SIZE = { 'desktop-16x10': { width: 640, height: 400 }, 'desktop-16x9': { width: 960, height: 540 } };
const SLOW = 20 * 60 * 1000;
// The 6 % phone frame is not built (T-107), but the shipped ?view= scales are
// the same transform — the FAR camera pulled along its depth axis — at other
// multipliers. Probing ?view=mid (RIG 5.0 %) and ?view=near (7.1 %) on the
// landscape phone checks the pure-pull model the estimate uses, at two points
// that bracket it, and gives two real screenshots either side of 6 %.
const EXTRA = Object.freeze({
  'phone-landscape-view-mid': Object.freeze({ width: 844, height: 390, view: 'mid' }),
  'phone-landscape-view-near': Object.freeze({ width: 844, height: 390, view: 'near' }),
});
const ORDER = [...Object.keys(VIEWPORTS), ...Object.keys(EXTRA)];
const { CONFIG } = await import('file://' + join(ROOT, 'src', 'config.js'));
function analyticEdges(id, w, h) {
  const v = EXTRA[id] && EXTRA[id].view;
  if (!v) return viewportEdges(w, h);
  const depth = CONFIG.camera.z * CONFIG.viewScales[v].depthMult;
  const fraction = CONFIG.player.height / (2 * depth * Math.tan((CONFIG.camera.fov / 2) * Math.PI / 180));
  return viewportEdges(w, h, CONFIG, fraction);   // the estimate's pure-pull model
}

const events = [
  { t: 0, type: 'keydown', code: 'ArrowRight' },
  { t: 200, type: 'keydown', code: 'KeyJ' },
  { t: STOP_MS - 200, type: 'keyup', code: 'ArrowRight' },
  { t: STOP_MS - 200, type: 'keyup', code: 'KeyJ' },
];

mkdirSync(OUT, { recursive: true });
// Rows are merged by viewport id into an existing framing.json, so a subset
// run (--only) refreshes its own rows and keeps the others.
const save = (rows) => {
  const file = join(OUT, 'framing.json');
  let kept = [];
  if (existsSync(file)) {
    try { kept = JSON.parse(readFileSync(file, 'utf8')).rows || []; } catch { kept = []; }
  }
  const ids = new Set(rows.map((r) => r.id));
  const merged = [...kept.filter((r) => !ids.has(r.id)), ...rows]
    .sort((x, y) => ORDER.indexOf(x.id) - ORDER.indexOf(y.id));
  writeFileSync(file, JSON.stringify({ tool: 'tools/simlab/race/probe-framing.mjs', stopAtMs: STOP_MS, rows: merged }, null, 1));
};

async function probeOne(newPage, baseUrl, id, nominal) {
  const vp = PROBE_SIZE[id] || { width: nominal.width, height: nominal.height };
  const phone = id.startsWith('phone');
  const t0 = Date.now();
  const { page, close } = await newPage({ viewport: vp, deviceScaleFactor: 1,
    hasTouch: phone, isMobile: phone });
  try {
    await page.addInitScript((payload) => {
      Object.defineProperty(globalThis, '__HULLBREAKER_INPUT_BOOTSTRAP__', {
        value: payload, configurable: true, writable: false,
      });
    }, { version: 1, events, stopAtMs: STOP_MS });
    const view = nominal.view ? `&view=${nominal.view}` : '';
    await page.goto(`${baseUrl}/index.html?testapi=1&fixeddt=16.667${view}`,
      { waitUntil: 'domcontentloaded', timeout: SLOW });
    await page.waitForFunction(() => {
      const api = globalThis.__HULLBREAKER_TEST__;
      return api && api.inputTimeline().status === 'complete';
    }, null, { timeout: SLOW, polling: 500 });
    await page.waitForTimeout(400);
    const live = await page.evaluate(() => {
      const s = globalThis.__HULLBREAKER_TEST__.snapshot();
      const e = window.HB.edges();
      return {
        inner: { w: innerWidth, h: innerHeight },
        scrollX: s.scrollX, gameMs: s.gameMs,
        edgeL: e.left - s.scrollX, edgeR: e.right - s.scrollX,
        player: { x: s.player.x, y: s.player.y },
        aheadTiles: e.right - (s.player.x + 0.35),
        view: window.HB.view(),
        // How much of the frame the shipped UI covers: a level cannot put a
        // route decision under the HUD or the touch deck. Fractions of the
        // viewport, from the live DOM (T-101/T-105 own these elements).
        ui: Object.fromEntries(['hudRigPanel', 'hudObjectivePanel', 'touchDeck'].map((id) => {
          const el = document.getElementById(id);
          if (!el || el.hidden || !el.getClientRects().length) return [id, null];
          const r = el.getBoundingClientRect();
          const f = (v, d) => Math.round((v / d) * 1000) / 1000;
          return [id, { x: f(r.x, innerWidth), y: f(r.y, innerHeight),
            w: f(r.width, innerWidth), h: f(r.height, innerHeight) }];
        })),
      };
    });
    await page.screenshot({ path: join(OUT, `framing-${id}.png`), timeout: SLOW });
    const a = analyticEdges(id, vp.width, vp.height);
    const n = analyticEdges(id, nominal.width, nominal.height);
    return {
      id, nominal: { width: nominal.width, height: nominal.height }, probed: vp,
      query: nominal.view ? `view=${nominal.view}` : '',
      wallMs: Date.now() - t0, live,
      analytic: { left: a.left, right: a.right, width: a.width, depth: a.depth,
        localYBottom: a.bottom, localYTop: a.top },
      edgeErr: { left: Math.abs(live.edgeL - a.left), right: Math.abs(live.edgeR - a.right) },
      nominalSameEdges: Math.abs(n.left - a.left) < 1e-9 && Math.abs(n.right - a.right) < 1e-9,
      screenshot: `framing-${id}.png`,
    };
  } catch (error) {
    return { id, probed: vp, wallMs: Date.now() - t0,
      error: String((error && error.message) || error).split('\n')[0] };
  } finally {
    await close().catch(() => {});
  }
}

const rows = await withIsolatedBrowser(ROOT, async ({ baseUrl, newPage }) => {
  const out = [];
  for (const id of ONLY || ORDER) {        // --only also sets the order
    const nominal = VIEWPORTS[id] || EXTRA[id];
    if (!nominal) throw new Error(`unknown viewport ${id}`);
    if (nominal.estimate) continue;         // not built yet (T-107): nothing to probe
    const row = await probeOne(newPage, baseUrl, id, nominal);
    out.push(row);
    save(out);
    process.stderr.write(`probe-framing: ${id} ${row.error ? 'FAILED' : 'done'} (${Math.round(row.wallMs / 1000)} s)\n`);
  }
  return out;
});
save(rows);
for (const r of rows) {
  if (r.error) { console.log(`${r.id.padEnd(16)} FAILED: ${r.error}`); continue; }
  const ui = Object.entries(r.live.ui || {}).filter(([, v]) => v)
    .map(([id, v]) => `${id} ${Math.round(v.w * 100)}x${Math.round(v.h * 100)}%`).join(', ') || 'none';
  console.log(`${r.id.padEnd(22)} probed ${r.probed.width}x${r.probed.height} | live L ${r.live.edgeL.toFixed(3)} R ${r.live.edgeR.toFixed(3)} | analytic L ${r.analytic.left.toFixed(3)} R ${r.analytic.right.toFixed(3)} | max err ${Math.max(r.edgeErr.left, r.edgeErr.right).toExponential(1)} | nominal size same edges: ${r.nominalSameEdges} | ahead of RIG ${r.live.aheadTiles.toFixed(1)} tiles | UI ${ui}`);
}
process.exit(rows.some((r) => r.error || Math.max(r.edgeErr.left, r.edgeErr.right) > 1e-6 || !r.nominalSameEdges) ? 1 : 0);
