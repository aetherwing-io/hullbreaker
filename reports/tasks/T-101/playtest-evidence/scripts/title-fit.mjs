// QA (T-101 gate): does the title wordmark fit the glass in portrait phone widths? One boot, then resize.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const TREE = process.env.HB_TREE || '/home/user/hullbreaker';
const { launchBrowser } = await import('file://' + join(TREE, 'tools/assets/lib/browser.mjs'));
const BASE = (process.argv[2] || 'http://127.0.0.1:8779').replace(/\/$/, '');
const OUT = process.argv[3]; mkdirSync(OUT, { recursive: true });
const WIDTHS = [[320, 568], [360, 740], [375, 667], [390, 844], [414, 896], [430, 932], [844, 390]];
const { browser } = await launchBrowser({ channel: 'chrome' });
const rows = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto(`${BASE}/index.html`, { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(() => globalThis.HB && HB.state() === 'MENU', null, { timeout: 300000, polling: 500 });
  // find the wordmark: the largest-font visible text node inside the title screen
  const find = () => page.evaluate(() => {
    const all = [...document.querySelectorAll('body *')].filter((n) => /HULLBREAKER/.test(n.textContent || '') && n.children.length === 0);
    const n = all[0];
    if (!n) return null;
    const r = n.getBoundingClientRect(); const s = getComputedStyle(n);
    const range = document.createRange(); range.selectNodeContents(n); const tr = range.getBoundingClientRect();
    return { tag: n.tagName, id: n.id, cls: n.className, fontSize: s.fontSize, letterSpacing: s.letterSpacing, boxLeft: r.left, boxRight: r.right, textLeft: tr.left, textRight: tr.right,
      innerWidth: innerWidth, overflowPx: Math.max(0, tr.right - innerWidth), clipped: tr.right > innerWidth + 0.5 || r.right > innerWidth + 0.5 };
  });
  for (const [w, h] of WIDTHS) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(600);
    const r = await find();
    rows.push({ w, h, ...r });
    console.log(`${w}x${h}: ` + JSON.stringify(r));
    if (w === 360 || w === 414) await page.screenshot({ path: join(OUT, `title-${w}x${h}.png`), timeout: 300000 });
  }
  await context.close();
} finally { await browser.close(); }
writeFileSync(join(OUT, 'title-fit.json'), JSON.stringify(rows, null, 2));
console.log('clipped widths: ' + rows.filter((r) => r.clipped).map((r) => r.w + 'x' + r.h).join(', ') + ' | fitting: ' + rows.filter((r) => !r.clipped).map((r) => r.w + 'x' + r.h).join(', '));
