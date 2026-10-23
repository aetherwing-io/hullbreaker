#!/usr/bin/env node
// phone-probe.mjs — T-108 EVIDENCE probe (not a gate): measure, on this tree,
// the four integrator-observed mobile defects that no existing check sees, so
// docs/proposals/2026-10-test-audit.md does not have to inherit an observation
// made on an older commit (LANE-BRIEF: never inherit a measured number).
//
//   node tools/orch/phone-probe.mjs --out tools/orch/evidence/phone-probe.json
//
// Per viewport (desktop 1280x800; phone landscape 844x390 and portrait 390x844
// with isMobile + hasTouch + DPR 3) it loads the DEFAULT URL (index.html, no
// query — the page a player opens) and records:
//   * title text overflow: visible text elements under #shell / #overlay whose
//     scrollWidth exceeds clientWidth, or whose box leaves the viewport;
//   * keyboard-only copy on screen while matchMedia('(pointer: coarse)') holds;
//   * the failsafe panel's hint text (HB_FAIL_TEXT.hint, the copy a phone
//     player would read if the game broke);
//   * network: every URL requested more than once during load;
//   * console errors AND warnings, page errors;
// then loads index.html?testapi=1 (auto-starts the run) and records the share
// of the viewport covered by visible .hud panels.
//
// Uses tools/playtest/lib/isolated-browser.mjs (its own headless Chrome and
// ephemeral static server; never ports 8741/8742). Read-only on the tree;
// zero effect on the game or the gate. Exits 0 whatever it measures — it is
// an instrument, and the thresholds belong to a future PLAY gate (§7.2).
//
// Limitations: SwiftShader + a loaded host make boot slow, so waits are long;
// "visible" = computed opacity > 0.05, visibility != hidden, non-empty box;
// a request repeated by a legitimate retry would also be counted.

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withIsolatedBrowser } from '../playtest/lib/isolated-browser.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const outIdx = process.argv.indexOf('--out');
const OUT = outIdx > 0 ? resolve(process.argv[outIdx + 1]) : null;
const BOOT_MS = Number(process.env.HB_PROBE_BOOT_MS) || 180000;

const VIEWS = [
  { name: 'desktop', viewport: { width: 1280, height: 800 }, mobile: false },
  { name: 'phone-landscape', viewport: { width: 844, height: 390 }, mobile: true },
  { name: 'phone-portrait', viewport: { width: 390, height: 844 }, mobile: true },
];

const measureShell = () => {
  const vw = innerWidth, vh = innerHeight;
  const visible = (el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05 &&
      r.width > 0 && r.height > 0;
  };
  const texts = [...document.querySelectorAll('#shell *, #overlay *')]
    .filter((el) => el.childElementCount === 0 && el.textContent.trim().length > 1 && visible(el));
  const overflow = texts.map((el) => {
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(), id: el.id || null, cls: el.className || null,
      text: el.textContent.trim().slice(0, 60),
      scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
      left: Math.round(r.left), right: Math.round(r.right), vw,
    };
  }).filter((t) => t.scrollWidth > t.clientWidth + 1 || t.left < -1 || t.right > vw + 1);
  const shellText = (document.getElementById('shell')?.innerText || '') + '\n' +
    (document.getElementById('overlay')?.innerText || '');
  const keyboardCopy = (shellText.match(/press any key|press [a-z0-9]\b|\bkey(board)?s?\b|arrow|wasd|enter\b|shift\b|space\b/gi) || [])
    .map((s) => s.toLowerCase());
  return {
    vw, vh, coarsePointer: matchMedia('(pointer: coarse)').matches,
    overflow, keyboardCopy: [...new Set(keyboardCopy)],
    failHint: (globalThis.HB_FAIL_TEXT && globalThis.HB_FAIL_TEXT.hint) || null,
    titleText: (document.querySelector('#shellText h1')?.textContent || '').trim(),
  };
};

const measureHud = () => {
  const vw = innerWidth, vh = innerHeight;
  const panels = [...document.querySelectorAll('.hud')].filter((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05 && r.width > 0 && r.height > 0;
  }).map((el) => {
    const r = el.getBoundingClientRect();
    return { id: el.id, x0: Math.max(0, r.left), y0: Math.max(0, r.top), x1: Math.min(vw, r.right), y1: Math.min(vh, r.bottom) };
  });
  // union area on a coarse 4-px grid (panels may overlap)
  const cell = 4; let covered = 0;
  for (let y = 0; y < vh; y += cell) for (let x = 0; x < vw; x += cell) {
    if (panels.some((p) => x >= p.x0 && x < p.x1 && y >= p.y0 && y < p.y1)) covered++;
  }
  const total = Math.ceil(vw / cell) * Math.ceil(vh / cell);
  return { vw, vh, panels, coveredShare: +(covered / total).toFixed(4), state: globalThis.HB?.state?.() ?? null };
};

const result = { tool: 'tools/orch/phone-probe.mjs', when: new Date().toISOString(), views: [] };
await withIsolatedBrowser(ROOT, async ({ baseUrl, newPage }) => {
  for (const view of VIEWS) {
    const row = { view: view.name, viewport: view.viewport };
    const opts = { viewport: view.viewport, deviceScaleFactor: view.mobile ? 3 : 1, isMobile: view.mobile, hasTouch: view.mobile };
    // 1) default URL, title screen
    {
      const { page, close } = await newPage(opts);
      const requests = new Map(), consoleMsgs = [], pageErrors = [];
      page.on('request', (r) => requests.set(r.url(), (requests.get(r.url()) || 0) + 1));
      page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleMsgs.push(`${m.type()}: ${m.text().slice(0, 240)}`); });
      page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 240)));
      const t0 = Date.now();
      try {
        await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load', timeout: BOOT_MS });
        await page.waitForFunction(() => !!globalThis.HB && !!document.querySelector('#shellText h1'), null, { timeout: BOOT_MS });
        await page.waitForTimeout(1500);
        row.title = await page.evaluate(measureShell);
      } catch (err) { row.titleError = String(err).slice(0, 300); }
      row.titleBootMs = Date.now() - t0;
      row.duplicateRequests = [...requests].filter(([, n]) => n > 1).map(([url, n]) => ({ url: url.replace(baseUrl, ''), n }));
      row.consoleErrorsAndWarnings = consoleMsgs;
      row.pageErrors = pageErrors;
      await close();
    }
    // 2) auto-started run, HUD coverage
    {
      const { page, close } = await newPage(opts);
      const t0 = Date.now();
      try {
        await page.goto(`${baseUrl}/index.html?testapi=1`, { waitUntil: 'load', timeout: BOOT_MS });
        await page.waitForFunction(() => globalThis.HB?.state?.() === 'PLAYING', null, { timeout: BOOT_MS });
        await page.waitForTimeout(1500);
        row.hud = await page.evaluate(measureHud);
      } catch (err) { row.hudError = String(err).slice(0, 300); }
      row.hudBootMs = Date.now() - t0;
      await close();
    }
    result.views.push(row);
    console.error(`[phone-probe] ${view.name}: title ${row.titleError ? 'ERROR' : 'ok'}, hud ${row.hudError ? 'ERROR' : 'ok'}`);
  }
});
if (OUT) writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result.views.map((v) => ({
  view: v.view, title: v.title?.titleText, overflow: v.title?.overflow?.length, coarse: v.title?.coarsePointer,
  keyboardCopy: v.title?.keyboardCopy, failHint: v.title?.failHint, dupes: v.duplicateRequests?.length,
  warnings: v.consoleErrorsAndWarnings?.length, hudShare: v.hud?.coveredShare, errors: [v.titleError, v.hudError].filter(Boolean),
})), null, 1));
