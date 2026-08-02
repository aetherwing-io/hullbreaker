// hitflash-capture.mjs — dev-only evidence rig for inbox item I-010 (the hit
// flash erases a hostile's silhouette at the shipped FAR view). Written for
// T-030; it lives outside tools/ only because that directory is lane-fenced
// this cycle. Run it from the worktree it should photograph:
//
//   node <this file> --root <worktree> [--mode after] [--extra '&legibility=0']
//
// What it does, and why it can claim a pixel-exact A/B:
//   1. serves the worktree on an ephemeral port (never 8741/8742),
//   2. replays tools/playtest/scripts/mid-route.json — a NAMED, already-judged
//      script — until a live wasp is close to RIG at the FAR default view,
//   3. PARKS the page's requestAnimationFrame so the game advances only when
//      this rig steps it, then steps one frame at a time. With ?fixeddt the
//      sim advances a constant few ms per step, so the two frames of a pair
//      are the same world instant to within ~1px of motion,
//   4. writes flashUntil on ONE hostile row between the two steps, so the pair
//      differs by the hit flash and nothing else,
//   5. measures the pair: the flashed body's pixels are exactly the pixels
//      that got brighter, so no clustering heuristic is needed.
//
// HONESTY NOTES:
//   * writing `flashUntil` is a harness intervention on a live sim row. It is
//     a RENDER-only field (src/sim/hostiles.js sets it, only
//     src/render/hostiles.js reads it), so the run is not steered by it, but
//     the frame is staged: it shows the flash the sim would have drawn, at a
//     moment the rig chose.
//   * the two sides of a pair are one page load apart in mode only. before/
//     after panels ARE two page loads, so RIG and the drone sit in slightly
//     different places between them — judge the flash, not pixel deltas,
//     across modes. Within a mode the pair is frame-exact.
//   * the "featureless white" count is min(r,g,b) >= 235 and max-min <= 12:
//     a pixel that carries neither hue nor shading. That is the operational
//     reading of I-010's "featureless white quad".

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const ROOT = resolve(arg('root', process.cwd()));
const MODE = arg('mode', 'after');
const EXTRA = arg('extra', '');
const FIXED_DT = arg('fixeddt', '12');
const BUDGET_MS = +arg('budget', '90000');

// this rig sits outside the harness tree, so its dependencies are resolved
// from the worktree it was pointed at rather than from its own directory
const { chromium } = await import(resolve(ROOT, 'tools/playtest/node_modules/playwright-core/index.mjs'));
const { startStaticServer } = await import(resolve(ROOT, 'tools/playtest/lib/server.mjs'));
const { compileScript, resolveCode, scriptEndMs } =
  await import(resolve(ROOT, 'tools/playtest/lib/compile.mjs'));

const OUT = resolve(ROOT, 'artifacts', 'hitflash-v1');
mkdirSync(OUT, { recursive: true });
const VIEWPORT = { width: 1280, height: 800 };

/* ------------------------------- page probes ------------------------------ */

const PROBE = () => {
  const hb = window.HB;
  if (!hb) return null;
  const p = hb.player;
  return {
    gameMs: hb.gameMs(), state: hb.state(),
    x: p.x, y: p.y, grounded: p.grounded, hp: p.hp,
    hostiles: (hb.hostiles || []).map((h, i) => ({
      i, kind: h.kind, state: h.state, x: h.x, y: h.y, hp: h.hp,
    })),
  };
};

// Park rAF: the game's frame loop re-schedules itself at the top of every
// frame, so capturing that callback instead of scheduling it stops the loop
// without losing it. Everything else on the page that animates parks too.
const PARK_RAF = () => {
  if (window.__hbPark) return;
  const real = window.requestAnimationFrame.bind(window);
  window.__hbPark = { real, queue: [] };
  window.requestAnimationFrame = (cb) => { window.__hbPark.queue.push(cb); return 0; };
};

const STEP = () => new Promise((res) => {
  const park = window.__hbPark;
  const due = park.queue.splice(0, park.queue.length);
  if (!due.length) { res(false); return; }
  park.real((t) => {
    for (const cb of due) cb(t);
    park.real(() => res(true));            // let the frame present before we return
  });
});

/* ------------------------------ input driver ------------------------------ */

const TAIL = { right: resolveCode('right'), fire: resolveCode('fire'), jump: resolveCode('jump') };

async function tailCadence(page, now, s) {
  if (!s.on) {
    await page.keyboard.down(TAIL.right).catch(() => {});
    await page.keyboard.down(TAIL.fire).catch(() => {});
    s.on = true; s.next = now;
  }
  if (now >= s.next) {
    await page.keyboard.down(TAIL.jump).catch(() => {});
    setTimeout(() => page.keyboard.up(TAIL.jump).catch(() => {}), 200);
    s.next = now + 800;
  }
}

/* ------------------------------- the capture ------------------------------ */

async function releaseAll(page) {
  for (const code of new Set(Object.values(TAIL))) {
    await page.keyboard.up(code).catch(() => {});
  }
}

// One staged pair at the current world instant. Returns null if the frame did
// not actually show a compact flashed body (offscreen, occluded, or the row
// died between steps) so the driver can try the next opportunity.
async function stagePair(page, target, tag) {
  await page.evaluate(PARK_RAF);
  for (let i = 0; i < 3; i++) await page.evaluate(STEP);   // settle the parked loop
  const before = await page.evaluate(PROBE);
  const alive = before.hostiles.find((h) => h.i === target.i && h.kind === target.kind);
  if (!alive) return null;
  await page.evaluate((i) => { window.HB.hostiles[i].flashUntil = 0; }, target.i);
  await page.evaluate(STEP);
  await page.screenshot({ path: resolve(OUT, `${tag}--noflash.png`) });
  await page.evaluate((i) => {
    const hb = window.HB;
    hb.hostiles[i].flashUntil = hb.gameMs() + 100000;      // hold the flash open
  }, target.i);
  await page.evaluate(STEP);
  await page.screenshot({ path: resolve(OUT, `${tag}--flash.png`) });
  const after = await page.evaluate(PROBE);
  const still = after.hostiles.find((h) => h.i === target.i && h.kind === target.kind);
  if (!still) return null;
  return {
    kind: target.kind,
    simMsBetween: after.gameMs - before.gameMs,
    moved: +Math.hypot(still.x - alive.x, still.y - alive.y).toFixed(4),
    rig: { x: +before.x.toFixed(2), y: +before.y.toFixed(2) },
    hostile: { x: +still.x.toFixed(2), y: +still.y.toFixed(2), state: still.state },
  };
}

async function drive(page, { want, budgetMs, tag }) {
  const script = JSON.parse(readFileSync(resolve(ROOT, 'tools/playtest/scripts/mid-route.json'), 'utf8'));
  const events = compileScript(script);
  const endMs = scriptEndMs(events, script);
  const tail = { on: false, next: 0 };
  const t0 = Date.now();
  let ei = 0;
  let tries = 0;
  while (Date.now() - t0 < budgetMs) {
    const now = Date.now() - t0;
    while (ei < events.length && events[ei].t <= now) {
      const ev = events[ei++];
      await page.keyboard[ev.type === 'keydown' ? 'down' : 'up'](ev.code).catch(() => {});
    }
    if (now > endMs) await tailCadence(page, now, tail);
    const sample = await page.evaluate(PROBE);
    if (sample && sample.state === 'PLAYING') {
      const target = want(sample);
      if (target) {
        tries++;
        await releaseAll(page);                     // no muzzle flash in the pair
        const staged = await stagePair(page, target, tag);
        if (staged) return { ...staged, tries };
        // unpark and keep running: this opportunity did not photograph
        await page.evaluate(() => {
          const park = window.__hbPark;
          if (!park) return;
          window.requestAnimationFrame = park.real;
          const due = park.queue.splice(0, park.queue.length);
          window.__hbPark = null;
          for (const cb of due) park.real(cb);
        });
        if (tries >= 8) break;
      }
    }
    await page.waitForTimeout(15);
  }
  return null;
}

/* ------------------------------- measurement ------------------------------ */

const MEASURE = ({ aSrc, bSrc, w, h }) => new Promise((res) => {
  const load = (src) => new Promise((r) => { const im = new Image(); im.onload = () => r(im); im.src = src; });
  Promise.all([load(aSrc), load(bSrc)]).then(([ia, ib]) => {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(ia, 0, 0); const A = cx.getImageData(0, 0, w, h).data;
    cx.clearRect(0, 0, w, h);
    cx.drawImage(ib, 0, 0); const B = cx.getImageData(0, 0, w, h).data;

    const white = (r, g, b) => Math.min(r, g, b) >= 235 && Math.max(r, g, b) - Math.min(r, g, b) <= 12;
    const sat = (r, g, b) => { const mx = Math.max(r, g, b); return mx === 0 ? 0 : (mx - Math.min(r, g, b)) / mx; };
    const hue = (r, g, b) => {
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      if (!d) return -1;
      let hh;
      if (mx === r) hh = ((g - b) / d) % 6;
      else if (mx === g) hh = (b - r) / d + 2;
      else hh = (r - g) / d + 4;
      return (hh * 60 + 360) % 360;
    };

    // The flashed body = the pixels that got brighter between the two frames.
    // The world also scrolls ~2px between the pair's two steps, which lights up
    // every high-contrast edge, so the raw diff is segmented into connected
    // components and only the one carrying the most added light is kept: the
    // body. Edge slivers are thin and dim by comparison.
    const raw = new Uint8Array(w * h);
    const delta = new Int16Array(w * h);
    for (let p = 0, i = 0; p < w * h; p++, i += 4) {
      const d = (B[i] - A[i]) + (B[i + 1] - A[i + 1]) + (B[i + 2] - A[i + 2]);
      delta[p] = Math.max(-32768, Math.min(32767, d));
      if (d > 60) raw[p] = 1;
    }
    const label = new Int32Array(w * h).fill(-1);
    const stack = new Int32Array(w * h);
    let best = -1, bestSum = -1;
    const comps = [];
    for (let p0 = 0; p0 < w * h; p0++) {
      if (!raw[p0] || label[p0] >= 0) continue;
      const id = comps.length;
      let sp = 0, sum = 0, count = 0;
      let cx0 = w, cy0 = h, cx1 = -1, cy1 = -1;
      stack[sp++] = p0; label[p0] = id;
      while (sp) {
        const p = stack[--sp];
        const x = p % w, y = (p / w) | 0;
        sum += delta[p]; count++;
        if (x < cx0) cx0 = x; if (x > cx1) cx1 = x;
        if (y < cy0) cy0 = y; if (y > cy1) cy1 = y;
        for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1,
                         y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
          if (q >= 0 && raw[q] && label[q] < 0) { label[q] = id; stack[sp++] = q; }
        }
      }
      comps.push({ id, count, sum, bbox: { x: cx0, y: cy0, w: cx1 - cx0 + 1, h: cy1 - cy0 + 1 } });
      if (sum > bestSum) { bestSum = sum; best = id; }
    }
    const mask = new Uint8Array(w * h);
    let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    if (best >= 0) {
      for (let p = 0; p < w * h; p++) {
        if (label[p] !== best) continue;
        mask[p] = 1; n++;
        const x = p % w, y = (p / w) | 0;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    // The body's INTERIOR: a 15px drone is mostly edge, and an edge pixel is a
    // blend with the teal behind it, so the mask's mean understates both the
    // acid of the unflashed body and the white of the flashed one. `core` is
    // the fully covered part — the pixels that took the most added light.
    let maxDelta = 0;
    for (let p = 0; p < w * h; p++) if (mask[p] && delta[p] > maxDelta) maxDelta = delta[p];
    const core = new Uint8Array(w * h);
    let coreN = 0;
    for (let p = 0; p < w * h; p++) {
      if (mask[p] && delta[p] >= 0.6 * maxDelta) { core[p] = 1; coreN++; }
    }

    const stats = (buf, sel = mask, count = n) => {
      let r = 0, g = 0, b = 0, wh = 0, wash = 0, s = 0, hs = 0, hn = 0, lum = 0;
      const n = count;
      for (let p = 0, i = 0; p < w * h; p++, i += 4) {
        if (!sel[p]) continue;
        const R = buf[i], G = buf[i + 1], Bl = buf[i + 2];
        r += R; g += G; b += Bl;
        const L = 0.2126 * R + 0.7152 * G + 0.0722 * Bl;
        lum += L;
        s += sat(R, G, Bl);
        const hh = hue(R, G, Bl);
        if (hh >= 0) { hs += hh; hn++; }
        if (white(R, G, Bl)) wh++;
        // I-010's signature: bright and hueless — the pixel could belong to a
        // muzzle flash, a bullet, or a hostile, and carries no kind at all
        if (L >= 200 && sat(R, G, Bl) <= 0.1) wash++;
      }
      const k = Math.max(1, n);
      return {
        meanRGB: [Math.round(r / k), Math.round(g / k), Math.round(b / k)],
        meanLuma: +(lum / k).toFixed(1),
        meanSat: +(s / k).toFixed(3),
        meanHue: hn ? Math.round(hs / hn) : -1,
        whitePx: wh,
        washPx: wash,
        washPct: +(100 * wash / k).toFixed(1),
      };
    };
    res({
      maskPx: n,
      corePx: coreN,
      bbox: n ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null,
      components: comps.length,
      unflashed: stats(A),
      flashed: stats(B),
      unflashedCore: stats(A, core, coreN),
      flashedCore: stats(B, core, coreN),
    });
  });
});

async function measure(browser, tag) {
  const url = (f) => 'data:image/png;base64,' +
    readFileSync(resolve(OUT, `${tag}--${f}.png`)).toString('base64');
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  const out = await page.evaluate(MEASURE, {
    aSrc: url('noflash'), bSrc: url('flash'), w: VIEWPORT.width, h: VIEWPORT.height,
  });
  await page.close();
  return out;
}

/* -------------------------------- composition ----------------------------- */

async function compose(browser, outName, panels, { crop = 0, focus = [0.5, 0.5] } = {}) {
  const w = crop ? 900 : 1288;
  const page = await browser.newPage({
    viewport: { width: panels.length * (w + 10) + 20, height: crop ? 640 : 880 },
  });
  const shift = `translate(${((0.5 - focus[0]) * 100).toFixed(2)}%, ${((0.5 - focus[1]) * 100).toFixed(2)}%)`;
  const cell = (p) => crop
    ? `<figure style="margin:0">
         <figcaption style="padding:6px 10px">${p.label}</figcaption>
         <div style="width:${w}px;height:540px;overflow:hidden;position:relative">
           <img src="${p.src}" style="position:absolute;left:50%;top:50%;
                transform:translate(-50%,-50%) scale(${crop}) ${shift};image-rendering:pixelated">
         </div>
       </figure>`
    : `<figure style="margin:0">
         <figcaption style="padding:6px 10px">${p.label}</figcaption>
         <img src="${p.src}" style="width:${w}px;display:block">
       </figure>`;
  await page.setContent(`
    <body style="margin:0;background:#000;font:700 20px ui-monospace,monospace;color:#fff">
      <div style="display:flex;gap:10px">${panels.map(cell).join('')}</div>
    </body>`);
  await page.waitForTimeout(250);
  await page.screenshot({ path: resolve(OUT, outName), fullPage: true });
  await page.close();
}

/* --------------------------------- driver --------------------------------- */

const server = await startStaticServer(ROOT, { port: 0 });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const WANT_STATE = arg('state', 'cruise');       // 'any' to take whichever comes first
const tag = `wasp-${WANT_STATE}-hit--far-${MODE}`;
try {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  const url = `${server.baseUrl}/index.html?slice=traversal&view=far&testapi=1&fixeddt=${FIXED_DT}${EXTRA}`;
  console.log(`url ${url}`);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  const got = await drive(page, {
    tag,
    budgetMs: BUDGET_MS,
    // a live drone close enough to RIG to be in the frame's action, and on
    // screen: the wasp is the kind I-010 names (a ~13-17px body at FAR)
    want: (s) => s.hostiles.find((h) => h.kind === 'wasp' && h.hp > 0 &&
      (WANT_STATE === 'any' || h.state === WANT_STATE) &&
      h.x - s.x > -2 && h.x - s.x < 9 && Math.abs(h.y - s.y) < 5),
  });
  if (!got) {
    console.log('MISSED — no verified wasp pair inside the budget');
    process.exitCode = 1;
  } else {
    const stats = await measure(browser, tag);
    const record = { tag, mode: MODE, extra: EXTRA, fixeddt: +FIXED_DT, ...got, stats };
    writeFileSync(resolve(OUT, `${tag}.json`), JSON.stringify(record, null, 2) + '\n');
    console.log(JSON.stringify(record, null, 2));
    const focusX = stats.bbox ? (stats.bbox.x + stats.bbox.w / 2) / VIEWPORT.width : 0.5;
    const focusY = stats.bbox ? (stats.bbox.y + stats.bbox.h / 2) / VIEWPORT.height : 0.5;
    const panels = [
      { label: `${tag} — no flash`, src: 'data:image/png;base64,' + readFileSync(resolve(OUT, `${tag}--noflash.png`)).toString('base64') },
      { label: `${tag} — hit flash`, src: 'data:image/png;base64,' + readFileSync(resolve(OUT, `${tag}--flash.png`)).toString('base64') },
    ];
    await compose(browser, `${tag}--pair.png`, panels);
    await compose(browser, `${tag}--detail.png`, panels, { crop: 3.4, focus: [focusX, focusY] });
    console.log(`pair -> ${tag}--pair.png, ${tag}--detail.png (focus ${focusX.toFixed(3)}, ${focusY.toFixed(3)})`);
  }
  await context.close();
} finally {
  await browser.close();
  await server.close();
}
