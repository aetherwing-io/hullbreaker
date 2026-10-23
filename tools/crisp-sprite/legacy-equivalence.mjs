#!/usr/bin/env node
// legacy-equivalence.mjs — T-123: does ?art=legacy restore today's path
// EXACTLY? The same frame, at the same simulation tick, from the pre-T-123
// tree and from this tree with ?art=legacy, compared pixel for pixel.
//
//   node tools/crisp-sprite/legacy-equivalence.mjs --out <dir>
//     --base http://127.0.0.1:8805 --lane http://127.0.0.1:8804
//     [--views desktop,phone] [--tick-ms 3000] [--three-dir <dir>]
//
// Per view, three boots in one browser: BASE, LANE?art=legacy, BASE again.
// Each runs the default level with ?fixeddt=16.667 (every frame advances the
// sim by exactly one fixed step) and pauses inside the frame callback the
// first time gameMs reaches --tick-ms, so all three stop on the identical
// simulation tick no matter how slowly the host delivered frames. The frame is
// then drawn once more (renderFrame) and read back with gl.readPixels. BASE vs
// BASE is the cross-boot noise floor; BASE vs LEGACY is the claim. A third
// pair, BASE vs LANE (default, crisp), shows the comparison CAN see the
// crisp path (the falsifier: if crisp were byte-equal to base, the gate would
// be blind). Boot budgets are raised at the route layer (lib.mjs) for every
// variant alike.

import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { loadPlaywright } from '../assets/lib/browser.mjs';
import { VIEWS, openGame } from './lib.mjs';

const args = process.argv.slice(2);
const argv = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const OUT = resolve(argv('--out', 'crisp-legacy-equivalence'));
const BASE = argv('--base', '');
const LANE = argv('--lane', '');
const views = argv('--views', 'desktop,phone').split(',');
const TICK = Number(argv('--tick-ms', 3000));
const THREE_DIR = argv('--three-dir', '');

async function frameAtTick(browser, base, query, V) {
  const errors = [];
  const { context, page } = await openGame(browser, base, V, { query, threeDir: THREE_DIR, errors });
  try {
    const at = await page.evaluate((tick) => new Promise((resolve) => {
      Promise.all([import('/src/sim/time.js'), import('/src/sim/state.js')]).then(([TM, ST]) => {
        const look = () => {
          if (TM.gameMs >= tick) { ST.setState('PAUSED'); resolve(TM.gameMs); } else requestAnimationFrame(look);
        };
        requestAnimationFrame(look);
      });
    }), TICK);
    const frame = await page.evaluate(async () => {
      const S = await import('/src/render/scene.js');
      const P = await import('/src/render/post.js');
      P.renderFrame();
      const gl = S.renderer.getContext();
      gl.finish();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let bin = '';
      for (let i = 0; i < px.length; i += 0x8000) bin += String.fromCharCode(...px.subarray(i, i + 0x8000));
      return { w, h, px: btoa(bin), post: P.postSnapshot().status, ratio: S.renderer.getPixelRatio() };
    });
    return { gameMs: at, w: frame.w, h: frame.h, post: frame.post, ratio: frame.ratio,
      px: Buffer.from(frame.px, 'base64'), errors };
  } finally {
    await context.close();
  }
}

function diff(a, b) {
  if (a.w !== b.w || a.h !== b.h) return { sameSize: false, a: [a.w, a.h], b: [b.w, b.h] };
  let changed = 0, max = 0, sum = 0;
  for (let i = 0; i < a.px.length; i += 4) {
    let c = false;
    for (let k = 0; k < 3; k++) {
      const d = Math.abs(a.px[i + k] - b.px[i + k]);
      if (d) c = true;
      if (d > max) max = d;
      sum += d;
    }
    if (c) changed++;
  }
  const n = a.px.length / 4;
  return { sameSize: true, pixels: n, changedPixels: changed, changedPercent: +(changed / n * 100).toFixed(6),
    meanDelta: +(sum / (n * 3)).toFixed(6), maxDelta: max, identical: changed === 0 };
}

function png(file, f) {
  // bottom-up GL rows -> top-down PNG
  const stride = f.w * 4;
  const raw = Buffer.alloc((stride + 1) * f.h);
  for (let y = 0; y < f.h; y++) {
    raw[y * (stride + 1)] = 0;
    f.px.copy(raw, y * (stride + 1) + 1, (f.h - 1 - y) * stride, (f.h - y) * stride);
  }
  const table = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = table[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, body) => { const t = Buffer.from(type), o = Buffer.alloc(12 + body.length);
    o.writeUInt32BE(body.length, 0); t.copy(o, 4); body.copy(o, 8); o.writeUInt32BE(crc(Buffer.concat([t, body])), 8 + body.length); return o; };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(f.w, 0); ihdr.writeUInt32BE(f.h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return writeFile(file, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const report = { tickMs: TICK, views: {} };
  try {
    for (const view of views) {
      const V = VIEWS[view];
      const base1 = await frameAtTick(browser, BASE, '', V);
      const legacy = await frameAtTick(browser, LANE, 'art=legacy', V);
      const base2 = await frameAtTick(browser, BASE, '', V);
      const crisp = await frameAtTick(browser, LANE, '', V);
      await png(join(OUT, `${view}-base.png`), base1);
      await png(join(OUT, `${view}-legacy.png`), legacy);
      await png(join(OUT, `${view}-crisp.png`), crisp);
      report.views[view] = {
        ticks: { base1: base1.gameMs, legacy: legacy.gameMs, base2: base2.gameMs, crisp: crisp.gameMs },
        post: { base1: base1.post, legacy: legacy.post, base2: base2.post, crisp: crisp.post },
        ratio: { base1: base1.ratio, legacy: legacy.ratio, crisp: crisp.ratio },
        noiseBaseVsBase: diff(base1, base2),
        baseVsLegacy: diff(base1, legacy),
        baseVsCrisp: diff(base1, crisp),
        errors: [...base1.errors, ...legacy.errors, ...base2.errors, ...crisp.errors].slice(0, 20),
      };
      console.log(view, JSON.stringify({ noise: report.views[view].noiseBaseVsBase, legacy: report.views[view].baseVsLegacy,
        crisp: report.views[view].baseVsCrisp }));
      await writeFile(join(OUT, 'equivalence.json'), JSON.stringify(report, null, 1) + '\n');
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
