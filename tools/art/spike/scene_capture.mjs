#!/usr/bin/env node
// scene_capture.mjs — T-109 A2 spike: the REAL game scene behind RIG, and the
// current art in it, at the two framings the spike judges.
//
//   node tools/art/spike/scene_capture.mjs --view desktop|phone [--out <dir>] [--port 0]
//        [--scroll 0] [--x 6] [--poses idle,upright,jump,fire,left,run,wasp]
//
// Views (decisions.md entries 17 and 20 addendum):
//   desktop  1280x720 @ DPR 1, ?view=far — the shipped FAR default (RIG ~32 px).
//   phone    844x518 @ DPR 2, ?view=far. The FAR shot at the density where RIG
//            is 6% of a 390 px landscape height (23.4 CSS px, 47 device px). The
//            phone frame is the CENTRAL 844x390 CSS window of it: the in-flight
//            phone lens (T-107, src/pure/framing.js on task/T-107) is the FAR
//            camera pose through a narrower field of view, i.e. exactly a
//            central crop of the FAR image at this density. (T-107's small
//            "lift" is not modelled.)
//
// What it does, with nothing under src/ changed:
//   * serves the worktree with src/render/preload.js's boot budgets raised to
//     240 s at the ROUTE layer, so every atlas (RIG, backdrops, wasp) loads on
//     this slow shared host as it would on a real device within 2.5 s. Nothing
//     is blocked, unlike tools/art/capture/current-art.mjs.
//   * freezes the scene: a requestAnimationFrame hook that runs after the
//     game's own frame callback re-sets the sim's scroll cursor (the camera
//     follows it, src/render/camera.js), clears hostiles, and re-applies the
//     staged player row every frame. Every rendered frame is then "one update
//     after the same state", so consecutive screenshots share one background.
//   * hides RIG by moving the `rig` group (src/render/player.js) to render
//     layer 31 — the camera draws layer 0 — so the RIG-free background is the
//     identical frame minus RIG (his contact shadow and the muzzle flash, which
//     are separate objects, stay).
//   * records the live projection of every staged sim point at RIG's render
//     depth (1.15, src/render/player.js RIG_SURFACE_DEPTH), in CSS and device
//     px, so offline candidates are composited exactly where the game would
//     draw RIG.
//
// Outputs (git-ignored): tools/art/build/spike/scene/<view>/*.png + scene.json.

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { loadPlaywright, startStaticServer } from '../../assets/lib/browser.mjs';

const ROOT = resolve(import.meta.dirname, '../../..');
const args = process.argv.slice(2);
const argv = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const VIEW = argv('--view', 'desktop');
const VIEWS = {
  desktop: { viewport: { width: 1280, height: 720 }, dpr: 1, frame: null },
  phone: { viewport: { width: 844, height: 518 }, dpr: 2, frame: { width: 844, height: 390 } },
};
if (!VIEWS[VIEW]) throw new Error(`--view ${VIEW}: desktop|phone`);
const V = VIEWS[VIEW];
const OUT = resolve(argv('--out', join(ROOT, 'tools/art/build/spike/scene', VIEW)));
const PORT = Number(argv('--port', 0));
const SCROLL = Number(argv('--scroll', 0));
const X = Number(argv('--x', 6));
const POSES = argv('--poses', 'bg,upright,jump,fire,left,run,wasp').split(',');
const T = 300000;
const RIG_DEPTH = 1.15;
await mkdir(OUT, { recursive: true });

const reportPath = join(OUT, 'scene.json');
const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : {};
Object.assign(report, { view: VIEW, viewport: V.viewport, dpr: V.dpr, phoneFrame: V.frame,
  scroll: SCROLL, x: X, shots: report.shots || {}, errors: [] });
const save = () => writeFile(reportPath, JSON.stringify(report, null, 1) + '\n');

let server = null;
let browser = null;
try {
  server = await startStaticServer(ROOT, { port: PORT });
  const { chromium } = await loadPlaywright();
  const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || '';
  browser = await chromium.launch({ channel: 'chrome', headless: true,
    ...(proxyUrl ? { proxy: { server: proxyUrl, bypass: '127.0.0.1,localhost' } } : {}) });
  const context = await browser.newContext({ viewport: V.viewport, deviceScaleFactor: V.dpr });
  const page = await context.newPage();
  page.on('pageerror', (e) => report.errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    const t = m.text();
    if (/did not load|still loading|failed/i.test(t)) report.errors.push(`console: ${t.slice(0, 200)}`);
  });
  // Route-level budget raise (see header). The served file differs from src
  // only in the two budget constants.
  const preloadSrc = await readFile(join(ROOT, 'src/render/preload.js'), 'utf8');
  const patched = preloadSrc
    .replace(/export const PRELOAD_BUDGET_MS = \d+;/, 'export const PRELOAD_BUDGET_MS = 240000;')
    .replace(/export const MOBILE_PRELOAD_BUDGET_MS = \d+;/, 'export const MOBILE_PRELOAD_BUDGET_MS = 240000;');
  if (patched === preloadSrc) throw new Error('preload.js budget constants not found');
  await page.route('**/src/render/preload.js', (route) => route.fulfill({
    status: 200, contentType: 'text/javascript; charset=utf-8', body: patched,
    headers: { 'Cache-Control': 'no-store' } }));
  await page.addInitScript(() => {
    // the boot / stall watchdog panel is a DOM overlay; a slow host trips it
    const st = document.createElement('style');
    st.textContent = '#fail{display:none!important}#overlay{display:none!important}' +
      'body.at-modal .hud,body.at-modal #finale{opacity:1!important;visibility:visible!important}';
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(st));
  });
  const t0 = Date.now();
  await page.goto(`${server.baseUrl}/index.html?testapi=1&audio=0&view=far&momentum=0&score=0&fixeddt=16`,
    { waitUntil: 'commit', timeout: T });
  await page.waitForFunction(() => !!window.HB, null, { timeout: T, polling: 1000 });
  const st = await page.evaluate(() => window.HB.state());
  if (st === 'MENU') await page.keyboard.press('Enter');
  else if (st !== 'PLAYING') await page.keyboard.press('r');
  await page.waitForFunction(() => window.HB?.state() === 'PLAYING', null, { timeout: T });
  report.bootMs = Date.now() - t0;
  await page.evaluate(async ({ scroll, x }) => {
    const [P, W, H, L, I, S, TW, THREE, TM, PRE, ST, FX] = await Promise.all([
      import('/src/sim/player.js'), import('/src/sim/weapons.js'),
      import('/src/sim/hostiles.js'), import('/src/sim/level.js'),
      import('/src/sim/input.js'), import('/src/render/scene.js'),
      import('/src/render/tower.js'), import('three'), import('/src/sim/time.js'),
      import('/src/render/preload.js'), import('/src/sim/state.js'), import('/src/render/fx.js'),
    ]);
    const deck = L.groundTopAt(x);
    W.setWeapon('R');
    let rigGroup = null;
    S.scene.traverse((o) => {
      if (rigGroup || o.name !== 'rig-gun-family-accent') return;
      let p = o;
      while (p.parent && p.parent !== S.scene) p = p.parent;
      rigGroup = p;
    });
    const Q = { scroll, x, deck, hold: null, aim: [1, 0], fire: false, clear: true, wasp: null };
    const base = () => ({ x, y: deck, vx: 0, vy: 0, grounded: true, facing: 1,
      traversalState: 'free', ladderId: null, onOneWay: null, iframesUntil: 0 });
    Q.hold = base();
    const tick = () => {
      TM.setScrollX(Q.scroll);
      if (Q.clear) H.clearHostiles();
      if (Q.hold) {
        Object.assign(P.player, Q.hold);
        P.player.aim.set(Q.aim[0], Q.aim[1]);
        I.keys.strafe = true;
      }
      I.keys.fire = Q.fire;
      if (Q.wasp) {
        const e = H.hostiles.find((h) => h.kind === 'wasp');
        if (e) Object.assign(e, Q.wasp);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const proj = (sx, sy, depth) => {
      const o = new THREE.Object3D();
      TW.placeOnTower(o, sx, sy, depth);
      o.updateMatrixWorld(true);
      const v = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).project(S.camera);
      const rect = S.renderer.domElement.getBoundingClientRect();
      return { x: rect.left + (v.x + 1) * rect.width / 2, y: rect.top + (1 - v.y) * rect.height / 2 };
    };
    const showRig = (on) => rigGroup && rigGroup.traverse((o) => o.layers.set(on ? 0 : 31));
    // Freeze the game the frame a muzzle flash is alive: runs after the game's
    // own frame callback, so the frame just drawn holds the flash; PAUSED stops
    // update(), gameMs and the fx clock, and every later frame redraws it.
    const pauseOnFlash = () => new Promise((resolve) => {
      const t0 = performance.now();
      const look = () => {
        if (FX.fxStats().flashes > 0 || performance.now() - t0 > 240000) {
          ST.setState('PAUSED');
          resolve(FX.fxStats().flashes);
        } else requestAnimationFrame(look);
      };
      requestAnimationFrame(look);
    });
    window.__SPIKE__ = { P, W, H, L, I, S, TW, THREE, TM, PRE, ST, FX, Q, base, proj, showRig, pauseOnFlash,
      rigGroup: !!rigGroup };
  }, { scroll: SCROLL, x: X });
  const frames = (n) => page.evaluate((k) => new Promise((r) => {
    let i = 0;
    const f = () => (++i >= k ? r() : requestAnimationFrame(f));
    requestAnimationFrame(f);
  }), n);
  await frames(6);
  report.renderer = await page.evaluate(() => {
    const { S, PRE } = window.__SPIKE__;
    const c = S.renderer.domElement;
    const pre = PRE.preloadSnapshot();
    const entries = pre.assets || [];
    return { pixelRatio: S.renderer.getPixelRatio(), canvas: [c.width, c.height],
      css: [c.clientWidth, c.clientHeight], dpr: devicePixelRatio,
      preload: { costMs: pre.costMs, budgetMs: pre.budgetMs,
        states: entries.reduce((m, e) => ((m[e.state] = (m[e.state] || 0) + 1), m), {}),
        notReady: entries.filter((e) => e.state !== 'ready').map((e) => `${e.url} ${e.state} ${e.error || ''}`) },
      rigGroupFound: window.__SPIKE__.rigGroup };
  });
  await save();
  console.log('booted', report.bootMs, 'ms', JSON.stringify(report.renderer).slice(0, 400));

  const fullClip = V.frame
    ? { x: 0, y: Math.round((V.viewport.height - V.frame.height) / 2), width: V.frame.width, height: V.frame.height }
    : { x: 0, y: 0, width: V.viewport.width, height: V.viewport.height };
  report.frameClip = fullClip;

  async function stage(spec) {
    await page.evaluate((s) => {
      const { Q, base } = window.__SPIKE__;
      Q.hold = s.hold === null ? null : Object.assign(base(), s.hold || {});
      if (Q.hold && s.dy) Q.hold.y = Q.deck + s.dy;
      Q.aim = s.aim || [1, 0];
      Q.fire = !!s.fire;
      Q.clear = s.clear !== false;
      Q.wasp = s.wasp || null;
    }, spec);
    await frames(spec.settle || 4);
  }

  async function info(points) {
    return page.evaluate(({ pts, depth }) => {
      const { P, proj, Q } = window.__SPIKE__;
      const rv = window.__HB_RIG_VISUAL ? window.__HB_RIG_VISUAL() : {};
      const pp = P.player;
      const out = { player: { x: pp.x, y: pp.y, vy: pp.vy, grounded: pp.grounded, facing: pp.facing,
        aim: [pp.aim.x, pp.aim.y] }, deck: Q.deck, bodyFrame: rv.bodyFrame, locomotionState: rv.locomotionState,
        canvasFallback: rv.canvasFallback, muzzle: rv.muzzle, points: {} };
      for (const [k, [sx, sy]] of Object.entries(pts)) out.points[k] = proj(sx, sy, depth);
      out.points.feet = proj(pp.x, pp.y, depth);
      out.points.head2 = proj(pp.x, pp.y + 2.0, depth);
      out.pxPerTile = Math.hypot(out.points.feet.x - out.points.head2.x, out.points.feet.y - out.points.head2.y) / 2.0;
      return out;
    }, { pts: points || {}, depth: RIG_DEPTH });
  }

  async function shoot(name, clip, { rig = true } = {}) {
    await page.evaluate((on) => window.__SPIKE__.showRig(on), rig);
    await frames(2);
    const before = await info();
    const path = join(OUT, `${name}.png`);
    const t1 = Date.now();
    await page.screenshot({ path, clip, scale: 'device', timeout: T, animations: 'allow' });
    const after = await info();
    const row = { path, clip, rig, ms: Date.now() - t1, before, after,
      dprAtCapture: await page.evaluate(() => devicePixelRatio) };
    report.shots[name] = row;
    await save();
    console.log('shot', name, row.ms, 'ms', before.bodyFrame, '->', after.bodyFrame);
    await page.evaluate(() => window.__SPIKE__.showRig(true));
    return row;
  }

  const rigClip = (pt, wTiles, hTiles, u) => {
    const w = Math.round(u * wTiles), h = Math.round(u * hTiles);
    return { x: Math.max(0, Math.round(pt.x - w / 2)), y: Math.max(0, Math.round(pt.y - h * 0.62)), width: w, height: h };
  };

  const STAGES = {
    idle: { aim: [1, 0] },
    upright: { aim: [Math.SQRT1_2, Math.SQRT1_2] },
    jump: { aim: [1, 0], hold: { grounded: false, vy: 3.5 }, dy: 1.5 },
    fire: { aim: [1, 0], fire: true, settle: 8 },
    left: { aim: [-1, 0], hold: { facing: -1 } },
  };

  for (const pose of POSES) {
    try {
      if (pose === 'bg') {
        await stage({ aim: [1, 0] });
        await shoot('bg-frame', fullClip, { rig: false });
        await shoot('cur-frame-idle', fullClip, { rig: true });
      } else if (STAGES[pose]) {
        await stage(STAGES[pose]);
        const i0 = await info();
        const clip = rigClip(i0.points.feet, 7, 4.6, i0.pxPerTile);
        if (pose === 'fire') {
          // the flash lives a few frames per shot: keep the brightest of a few
          let best = null;
          for (let k = 0; k < 2; k++) {
            const r = await shoot(`cur-${pose}-${k}`, clip, { rig: true });
            const r2 = await shoot(`bg-${pose}-${k}`, clip, { rig: false });
            best = best || [r, r2];
          }
        } else {
          await shoot(`cur-${pose}`, clip, { rig: true });
          if (pose === 'jump') await shoot(`bg-${pose}`, clip, { rig: false });
        }
      } else if (pose === 'firepause') {
        // one frozen frame with a live flash, shot with RIG and without
        await stage({ aim: [1, 0], fire: true, settle: 2 });
        const i0 = await info();
        const clip = rigClip(i0.points.feet, 7, 4.6, i0.pxPerTile);
        const flashes = await page.evaluate(() => window.__SPIKE__.pauseOnFlash());
        report.firePause = { flashesAtPause: flashes, state: await page.evaluate(() => window.HB.state()) };
        await frames(3);
        await shoot('cur-firep', clip, { rig: true });
        await shoot('bg-firep', clip, { rig: false });
        await page.evaluate(() => { window.__SPIKE__.ST.setState('PLAYING'); window.__SPIKE__.Q.fire = false; });
        await frames(3);
      } else if (pose === 'run') {
        await stage({ hold: null, clear: true });
        await page.evaluate(() => {
          const { P, Q, base, I } = window.__SPIKE__;
          Object.assign(P.player, base());
          I.keys.strafe = false;
        });
        await page.keyboard.down('ArrowRight');
        try {
          await page.waitForFunction(() => {
            const s = window.__HB_RIG_VISUAL?.();
            return s?.locomotionState === 'run' && s.bodyFrame === 'contact';
          }, null, { timeout: 240000, polling: 50 });
          const i0 = await info();
          const clip = rigClip(i0.points.feet, 7, 4.6, i0.pxPerTile);
          await shoot('cur-run', clip, { rig: true });
        } finally {
          await page.keyboard.up('ArrowRight');
        }
      } else if (pose === 'wasp') {
        await stage({ aim: [1, 0], clear: false });
        const spawned = await page.evaluate(() => {
          const { P, H, TM, Q } = window.__SPIKE__;
          H.clearHostiles();
          H.spawnHostile(Q.x + 4.5, Q.deck + 2.6, 0, 'wasp', null, '');
          const e = H.hostiles.find((h) => h.kind === 'wasp');
          if (!e) return null;
          e.enterUntil = TM.gameMs - 1;
          // held CRUISING (a far dive cooldown) so the crop shows the flight
          // pose, not a committed dive at RIG
          Q.wasp = { x: Q.x + 4.5, y: Q.deck + 2.6, enterUntil: TM.gameMs - 1, dir: -1,
            state: 'cruise', diveCdUntil: 1e12, stateUntil: 0 };
          return { x: e.x, y: e.y, kind: e.kind, state: e.state };
        });
        report.wasp = { spawned };
        await frames(12);
        const wi = await page.evaluate((depth) => {
          const { H, proj } = window.__SPIKE__;
          const e = H.hostiles.find((h) => h.kind === 'wasp');
          return e ? { x: e.x, y: e.y, state: e.state, dir: e.dir, lift: null, screen: proj(e.x, e.y, depth) } : null;
        }, RIG_DEPTH);
        report.wasp.live = wi;
        if (wi) {
          const i0 = await info();
          // the renderer draws the cruising wasp about a tile BELOW its sim
          // row (measured on the first pass), so the clip is taller and
          // centred under the row
          const clip = rigClip(wi.screen, 4.5, 4, i0.pxPerTile);
          clip.y = Math.max(0, Math.round(wi.screen.y - clip.height * 0.3));
          await shoot('cur-wasp', clip, { rig: true });
        }
        await page.evaluate(() => { window.__SPIKE__.Q.wasp = null; window.__SPIKE__.H.clearHostiles(); });
      }
    } catch (err) {
      report.errors.push(`${pose}: ${String(err && err.message || err).split('\n')[0]}`);
      await save();
      console.log('error', pose, err && err.message);
    }
  }
  await save();
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) await server.close();
}
console.log('done', reportPath);
