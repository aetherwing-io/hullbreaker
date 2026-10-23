#!/usr/bin/env node
/* framing-cost.mjs — what the phone frame costs per frame, against FAR on the
 * same viewport, under the 256-projectile stress path (SPRINT T-107;
 * decisions.md entry 18: "worstMs / over20ms ... before and after").
 *
 *   node tools/playtest/framing-cost.mjs --variants "phone=http://127.0.0.1:8776|,far=http://127.0.0.1:8776|view=far" \
 *     --viewport 844x390 --touch [--dpr 1] [--rounds 3] [--out cost.json]
 *
 * Each variant is `label=<baseUrl>|<extra query>`, so the same tool compares
 * two framings of one tree (phone vs ?view=far) or two trees (main vs this
 * branch). Rounds are INTERLEAVED (A B A B ...) so a host-load drift lands on
 * both sides; every reading is a fresh browser context: boot, hold right,
 * warm 1.2 s, then the injected load tools/playtest/juice-stress.mjs uses —
 * fireWeapon('S', ..., clone=true) twelve times a frame (the 256-slot
 * projectile pool saturates) plus a death burst and flash per frame — for
 * 5 s, then window.HB.perf(): the in-game sampler's last 180 frame intervals
 * (fps, avgMs, worstMs, over20ms) and the live projectile count.
 *
 * Honesty: this host renders through SwiftShader (no GPU) on a shared,
 * heavily loaded CPU, so absolute numbers are far from any device and only
 * the interleaved COMPARISON is evidence; rAF is vsync-capped where a vsync
 * exists. An iPhone frame-time check needs the device (T-204's packet asks
 * for it). Dev-only; zero effect on the game.                             */

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser } from '../assets/lib/browser.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
// label=<baseUrl>|<query>: split on the FIRST '=' and the first '|' only, so a
// query value (view=far, rise=steep) survives intact
const variants = opt('variants', 'phone=http://127.0.0.1:8776|,far=http://127.0.0.1:8776|view=far').split(',').map((v) => {
  const eq = v.indexOf('=');
  const label = v.slice(0, eq), rest = v.slice(eq + 1);
  const bar = rest.indexOf('|');
  return { label, base: bar < 0 ? rest : rest.slice(0, bar), query: bar < 0 ? '' : rest.slice(bar + 1) };
});
for (const v of variants) if (!v.label || !/^https?:\/\//.test(v.base)) throw new Error(`bad --variants entry: ${JSON.stringify(v)}`);
const [vw, vh] = opt('viewport', '844x390').split('x').map(Number);
const touch = argv.includes('--touch');
const dpr = +opt('dpr', '1');
const rounds = +opt('rounds', '3');
const out = opt('out', null);
const bootMs = Number(process.env.HB_PROBE_BOOT_MS) || 180000;
const log = (...a) => console.error(new Date().toISOString().slice(11, 19), ...a);

function stressLoop() {          // tools/playtest/juice-stress.mjs, verbatim in effect
  return (async () => {
    const [W, FX, C, PL] = await Promise.all([
      import('/src/sim/weapons.js'), import('/src/render/fx.js'), import('/src/config.js'), import('/src/sim/player.js'),
    ]);
    globalThis.__STRESS_ON__ = true;
    const J = C.CONFIG.juice;
    const step = () => {
      if (!globalThis.__STRESS_ON__) return;
      const p = PL.player;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        W.fireWeapon('S', p.x, p.y + 1, Math.cos(a), Math.sin(a), true);
      }
      FX.fxBurst(J.death, p.x, p.y + 1, FX.fxRole('enemyGlow'));
      FX.fxFlash(J.death.flashMs, J.death.flashSize, p.x, p.y + 1, FX.fxRole('enemyGlow'));
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  })();
}

const { browser } = await launchBrowser({ channel: 'chrome' });
const readings = [];
try {
  for (let r = 0; r < rounds; r++) {
    for (const v of variants) {
      const t0 = Date.now();
      const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr,
        hasTouch: touch, isMobile: touch });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
      try {
        await page.goto(`${v.base}/index.html?testapi=1&audio=0${v.query ? '&' + v.query : ''}`, { waitUntil: 'load', timeout: bootMs });
        await page.waitForFunction(() => globalThis.HB && HB.state() === 'PLAYING', null, { timeout: bootMs });
        await page.keyboard.down('ArrowRight');
        await page.waitForTimeout(1200);
        await page.evaluate(stressLoop);
        await page.waitForTimeout(5000);
        const res = await page.evaluate(async () => {
          const W = await import('/src/sim/weapons.js');
          const CAM = await import('/src/render/camera.js');
          const SC = await import('/src/render/scene.js');
          let live = 0; for (const b of W.bulletPool) if (b.alive) live++;
          // the renderer's own count for the last frame drawn: a load-independent
          // measure of what the framing asks the GPU to do (frustum-culled draw
          // calls and triangles), beside the wall-clock sampler
          const ri = SC.renderer && SC.renderer.info ? SC.renderer.info.render : null;
          return { perf: HB.perf(), liveProjectiles: live,
            render: ri ? { calls: ri.calls, triangles: ri.triangles, points: ri.points, lines: ri.lines } : null,
            framing: typeof CAM.cameraFramingSnapshot === 'function' ? CAM.cameraFramingSnapshot().id : 'far' };
        });
        await page.evaluate(() => { globalThis.__STRESS_ON__ = false; });
        readings.push({ round: r + 1, variant: v.label, ...res, errors, wallMs: Date.now() - t0 });
        log(`round ${r + 1} ${v.label}: ${JSON.stringify(res.perf)} render ${JSON.stringify(res.render)} live ${res.liveProjectiles} (${res.framing})`);
      } catch (e) {
        readings.push({ round: r + 1, variant: v.label, error: String(e.message || e).split('\n')[0], errors });
        log(`round ${r + 1} ${v.label}: FAILED ${e.message}`);
      } finally {
        await context.close().catch(() => {});
      }
    }
  }
} finally {
  await browser.close().catch(() => {});
}
const summary = {};
for (const v of variants) {
  const rs = readings.filter((x) => x.variant === v.label && x.perf);
  const med = (k) => { const a = rs.map((x) => x.perf[k]).filter(Number.isFinite).sort((p, q) => p - q); return a.length ? a[Math.floor(a.length / 2)] : null; };
  const medR = (k) => { const a = rs.map((x) => x.render && x.render[k]).filter(Number.isFinite).sort((p, q) => p - q); return a.length ? a[Math.floor(a.length / 2)] : null; };
  summary[v.label] = { n: rs.length, medianAvgMs: med('avgMs'), medianWorstMs: med('worstMs'), medianOver20ms: med('over20ms'), medianFps: med('fps'),
    medianCalls: medR('calls'), medianTriangles: medR('triangles'),
    framings: [...new Set(rs.map((x) => x.framing))] };
}
console.log(JSON.stringify(summary, null, 1));
if (out) await writeFile(resolve(out), JSON.stringify({ tool: 'tools/playtest/framing-cost.mjs', viewport: { vw, vh, dpr, touch },
  variants, rounds, readings, summary }, null, 1));
