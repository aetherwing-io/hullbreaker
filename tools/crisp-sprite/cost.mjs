#!/usr/bin/env node
// cost.mjs — T-123 frame cost: the crisp sprite path against today's path,
// same viewport, same host, same session, interleaved.
//
//   node tools/crisp-sprite/cost.mjs --out <file.json>
//     --variant base=http://127.0.0.1:8805 --variant crisp=http://127.0.0.1:8804
//     --variant legacy=http://127.0.0.1:8804?art=legacy
//     [--views desktop,phone,phone3] [--rounds 1] [--frames 150] [--draws 15] [--three-dir <dir>]
//
// Per (round, view, variant), in that nesting so variants alternate:
//   * boot (tools/crisp-sprite/lib.mjs: real atlases, real composer);
//   * the decisions.md entry 18 stress path, as tools/playtest/sprite-stress.mjs
//     drives it: the right key held, the game's own fireWeapon('S', clone=true)
//     12x per frame (the 256-slot projectile pool saturates), a death burst and
//     flash every frame, the hostile roster topped back up to 10 (two of each
//     of five kinds) whenever the barrage kills one;
//   * after --frames real frames: window.HB.perf() — avgMs, worstMs, over20ms
//     over the last <=180 real frame intervals (the in-game sampler);
//   * then, paused, --draws (15) isolated draws: renderFrame() bracketed by a
//     1-pixel readPixels (gl.finish() alone does not wait in Chrome),
//     median and worst, with renderer.info's draw calls for that frame (the
//     crisp tile pass and reduction included).
//
// HONESTY: this host has no GPU. SwiftShader rasterizes on the CPU, shared
// with other lanes (load 40-90 on 4 cores), so absolute numbers are not a
// device's and run-to-run spread is large; only same-round comparisons mean
// anything, and the fill-rate ratio (drawing pixels) is the hardware-
// independent part. It says nothing about an iPhone's frame rate.

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadPlaywright } from '../assets/lib/browser.mjs';
import { VIEWS, frames, openGame, rendererFacts } from './lib.mjs';

const args = process.argv.slice(2);
const all = (name) => args.flatMap((a, i) => (a === name ? [args[i + 1]] : []));
const argv = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const OUT = resolve(argv('--out', 'crisp-cost.json'));
const views = argv('--views', 'desktop,phone,phone3').split(',');
const ROUNDS = Number(argv('--rounds', 1));
const FRAMES = Number(argv('--frames', 150));
const DRAWS = Math.max(1, Number(argv('--draws', 15)));
const THREE_DIR = argv('--three-dir', '');
const variants = all('--variant').map((v) => {
  const [name, url] = v.split('=');
  const [base, query = ''] = url.split('?');
  return { name, base, query };
});

function stress() {
  return (async () => {
    const [W, FX, C, PL, HS] = await Promise.all([
      import('/src/sim/weapons.js'), import('/src/render/fx.js'), import('/src/config.js'),
      import('/src/sim/player.js'), import('/src/sim/hostiles.js'),
    ]);
    const J = C.CONFIG.juice;
    const KINDS = ['hound', 'wasp', 'carrier', 'polyp', 'mortar'];
    let n = 0;
    window.__CRISP_STRESS = true;
    const step = () => {
      if (!window.__CRISP_STRESS) return;
      const p = PL.player;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        W.fireWeapon('S', p.x, p.y + 1, Math.cos(a), Math.sin(a), true);
      }
      FX.fxBurst(J.death, p.x, p.y + 1, FX.fxRole('enemyGlow'));
      FX.fxFlash(J.death.flashMs, J.death.flashSize, p.x, p.y + 1, FX.fxRole('enemyGlow'));
      while (HS.hostiles.length < 10) {
        const kind = KINDS[n % KINDS.length];
        const lane = 3 + (n % 4) * 1.6;
        const x = p.x + 4 + (n % 7) * 1.7;
        n++;
        HS.spawnHostile(x, p.y + (kind === 'wasp' || kind === 'carrier' ? lane : 1.05),
          0, kind, { dir: 1, zone: kind === 'mortar' ? { x: x - 10, y: p.y } : undefined });
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  })();
}

async function draws(n) {
  const S = await import('/src/render/scene.js');
  const P = await import('/src/render/post.js');
  const ST = await import('/src/sim/state.js');
  window.__CRISP_STRESS = false;
  ST.setState('PAUSED');
  const gl = S.renderer.getContext();
  const times = [];
  let calls = 0;
  // gl.finish() alone does not wait for the GPU process in Chrome (measured
  // here: 2.5 ms "draws" of a scene whose real frames took seconds), so each
  // draw is closed by a 1-pixel readPixels, which must wait for the frame
  const px = new Uint8Array(4);
  const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  for (let i = 0; i < n; i++) {
    S.renderer.info.reset();
    sync();
    const t0 = performance.now();
    P.renderFrame();
    sync();
    times.push(performance.now() - t0);
    calls = S.renderer.info.render.calls;
  }
  times.sort((a, b) => a - b);
  // The crisp path's own share: the same paused frame with every crisp actor
  // off (no tile pass, no reduction, no quads), and how much it composed.
  let split = null;
  const dbg = window.__HB_CRISP_DEBUG;
  if (dbg && window.__HB_CRISP) {
    const snap = window.__HB_CRISP();
    const drawn = snap.actors.filter((a) => a.drawn);
    const devicePx = drawn.reduce((t, a) => t + a.rect.w * a.rect.h, 0);
    const S = drawn.length ? drawn[0].S : 0;
    const off = [];
    dbg.hideAll = true;
    try {
      for (let i = 0; i < n; i++) {
        sync();
        const t0 = performance.now();
        P.renderFrame();
        sync();
        off.push(performance.now() - t0);
      }
    } finally {
      dbg.hideAll = false;
    }
    off.sort((a, b) => a - b);
    split = { actorsOffMedianMs: +off[Math.floor(n / 2)].toFixed(2), tileDevicePx: devicePx, S,
      tileSamples: devicePx * S * S };
  }
  const H = await import('/src/sim/hostiles.js');
  const W = await import('/src/sim/weapons.js');
  return {
    medianMs: +times[Math.floor(n / 2)].toFixed(2), worstMs: +times[n - 1].toFixed(2), draws: n, calls, split,
    hostiles: H.hostiles.length, bullets: W.bullets ? W.bullets.filter((b) => b.active !== false).length : null,
    crisp: window.__HB_CRISP ? (({ atlas, actors }) => ({ atlas, drawn: actors.filter((a) => a.drawn).length,
      S: actors.length ? actors[0].S : null }))(window.__HB_CRISP()) : null,
  };
}

async function main() {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const rows = [];
  try {
    for (let round = 0; round < ROUNDS; round++) {
      for (const view of views) {
        for (const v of variants) {
          const errors = [];
          const { context, page, bootMs } = await openGame(browser, v.base, VIEWS[view],
            { query: v.query, threeDir: THREE_DIR, errors });
          try {
            const facts = await rendererFacts(page);
            await page.keyboard.down('ArrowRight');
            await page.evaluate(stress);
            await frames(page, FRAMES);
            const perf = await page.evaluate(() => window.HB.perf());
            await page.keyboard.up('ArrowRight');
            const draw = await page.evaluate(draws, DRAWS);
            const row = { round, view, variant: v.name, bootMs, canvas: facts.canvas, pixelRatio: facts.pixelRatio,
              drawingPixels: facts.canvas[0] * facts.canvas[1], post: facts.post?.status, perf, draw, errors };
            rows.push(row);
            console.log([round, view, v.name, facts.canvas.join('x'), 'perf avg', perf.avgMs, 'worst', perf.worstMs,
              'over20', perf.over20ms, '| draw median', draw.medianMs, 'worst', draw.worstMs, 'calls', draw.calls,
              'post', facts.post?.status].join(' '));
            await writeFile(OUT, JSON.stringify({ frames: FRAMES, draws: DRAWS, rows }, null, 1) + '\n');
          } finally {
            await context.close();
          }
        }
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
