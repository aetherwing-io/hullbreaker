// QA scratch tool (read-only on the game): does the T-102 gate HUD string fit
// the REAL objective panel at desktop / phone landscape / phone portrait, or
// does text-overflow: ellipsis eat the "+N INBOUND" suffix?
// It loads the pinned build in real Chromium, imports the page's OWN
// gateRequirementText, builds the strings from the authored encounter tables,
// writes each into #hudObjective and measures scrollWidth vs clientWidth.
// usage: node hud-fit3.mjs <baseUrl> <out.json>
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire('/home/user/hullbreaker/tools/playtest/package.json');
const { chromium } = require('playwright-core');

const baseUrl = process.argv[2];
const outFile = process.argv[3];
const VIEWPORTS = [
  { name: 'desktop-1100x700', width: 1100, height: 700, mobile: false },
  { name: 'desktop-1024x768', width: 1024, height: 768, mobile: false },
  { name: 'phone-landscape-667x375 (iPhone SE class)', width: 667, height: 375, mobile: true },
  { name: 'phone-landscape-812x375 (iPhone mini class)', width: 812, height: 375, mobile: true },
];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1,
    isMobile: vp.mobile, hasTouch: vp.mobile,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  const t0 = Date.now();
  await page.goto(`${baseUrl}/index.html?testapi=1`, { waitUntil: 'load', timeout: 600000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('hudTL');
    return !!(el && el.textContent && el.textContent.length > 0);
  }, null, { timeout: 600000 });
  const bootMs = Date.now() - t0;
  const r = await page.evaluate(async () => {
    const W = await import('/src/pure/waves.js');
    const E = await import('/src/pure/level1-ecology-encounters.js');
    const C = (await import('/src/config.js')).CONFIG;
    const el = document.getElementById('hudObjective');
    const panel = document.getElementById('hudObjectivePanel');
    const rig = document.getElementById('hudRigPanel');
    panel.classList.remove('empty');
    const cs = getComputedStyle(el);
    const info = {
      panelDisplay: getComputedStyle(panel).display,
      fontSize: cs.fontSize, fontWeight: cs.fontWeight, letterSpacing: cs.letterSpacing,
      whiteSpace: cs.whiteSpace, textOverflow: cs.textOverflow,
      clientWidth: el.clientWidth, panelRect: JSON.parse(JSON.stringify(panel.getBoundingClientRect())),
      rigRect: JSON.parse(JSON.stringify(rig.getBoundingClientRect())),
      innerWidth: window.innerWidth, innerHeight: window.innerHeight,
    };
    function measure(text) {
      el.textContent = text;
      const rg = document.createRange(); rg.selectNodeContents(el);
      const natural = rg.getBoundingClientRect().width;
      return { text, len: text.length, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
        natural: +natural.toFixed(2), headroom: +(el.clientWidth - natural).toFixed(2),
        truncated: el.scrollWidth > el.clientWidth };
    }
    // Strings straight from the shipped functions.
    const phases = C.waves.phases;
    const mk = (k, need) => `WAVE ${k}/${C.path.faces} · ${phases[k - 1]} · ` + W.gateRequirementText(need);
    const old = (k, threats) => `WAVE ${k}/${C.path.faces} · ${phases[k - 1]} · ` +
      (threats === 1 ? 'LAST SIGNAL · CLOSING' : `${threats} HOSTILES`);
    // Realistic cases from the authored tables: at beat b, rows of beat b are
    // present, every later row is a queued gating body; then bodies die down to 1.
    const realistic = [];
    for (const f of E.LEVEL1_ECOLOGY_ENCOUNTERS) {
      const beats = [...new Set(f.rows.map((r) => r.beat))].sort((a, b) => a - b);
      for (const b of beats) {
        const present0 = f.rows.filter((r) => r.beat === b).length;
        const queued = f.rows.filter((r) => r.beat > b).length;
        for (let p = present0; p >= 1; p--) {
          const need = { present: p, gatingPresent: p, gatingQueued: queued, gatingLeft: p + queued };
          realistic.push({ face: f.face, beat: b, present: p, queued, ...measure(mk(f.face, need)) });
        }
      }
    }
    // The OLD strings for the same faces, for comparison.
    const oldRows = [];
    for (let k = 1; k <= 6; k++) for (const n of [1, 2, 3, 4]) oldRows.push({ face: k, threats: n, ...measure(old(k, n)) });
    // Worst case by construction: longest phase, 3 present, 6 queued.
    const worst = [];
    for (let k = 1; k <= 6; k++) {
      worst.push({ face: k, ...measure(mk(k, { present: 3, gatingPresent: 3, gatingQueued: 6, gatingLeft: 9 })) });
      worst.push({ face: k, ...measure(mk(k, { present: 0, gatingPresent: 0, gatingQueued: 6, gatingLeft: 6 })) });
    }
    return { info, realistic, oldRows, worst };
  });
  results.push({ viewport: vp.name, bootMs, errors, ...r });
  await ctx.close();
  console.error(`[hud-fit] ${vp.name} done in ${bootMs} ms boot`);
}
await browser.close();
writeFileSync(outFile, JSON.stringify(results, null, 1));
for (const r of results) {
  const t = (rows) => rows.filter((x) => x.truncated).length;
  console.log(`${r.viewport}: panel clientWidth=${r.info.clientWidth}px font=${r.info.fontSize}/${r.info.fontWeight} ls=${r.info.letterSpacing} display=${r.info.panelDisplay} ` +
    `| new realistic truncated ${t(r.realistic)}/${r.realistic.length} | new worst-case truncated ${t(r.worst)}/${r.worst.length} | OLD strings truncated ${t(r.oldRows)}/${r.oldRows.length} | pageErrors=${r.errors.length}`);
}
