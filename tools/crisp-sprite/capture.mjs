#!/usr/bin/env node
// capture.mjs — T-123: RIG on the REAL game scene, with and without him, at
// true size, for the crisp sprite path's measurements (gain, silhouette-edge
// visibility, gun-edge contrast) and its browser probes (no resample, grid
// snap). The method is the T-109 A2 spike's (tools/art/spike/scene_capture.mjs
// on task/T-109): a frozen scene, RIG-free difference frames, the live
// projection of the sim point recorded so an offline reference can be pasted
// exactly where the game draws RIG.
//
//   node tools/crisp-sprite/capture.mjs --out <dir> [--base-url <url> | --root <tree>]
//     [--views desktop,phone,phone3,spikephone] [--query art=legacy]
//     [--poses idle,run,jump,upright,fire,left] [--three-dir <dir>] [--probe]
//     [--actors] [--direct] [--no-gunless] [--falsify lit]
//
// Views:
//   desktop     1280x720 @ DPR 1 — the shipped FAR desktop frame
//   phone       844x390  @ DPR 2 — a landscape phone, today's camera
//   phone3      844x390  @ DPR 3 — the operator's device class (entry 20);
//               SwiftShader may trip the freeze watchdog here (host artefact)
//   spikephone  844x518  @ DPR 2 — the spike's proxy for the phone framing
//               (RIG ~6% of a 390 px height); its frame is the central
//               844x390 CSS window (T-107's lens is that crop)
//
// What it does, nothing under src/ changed:
//   * src/render/preload.js's two boot budgets are raised to 240 s AT THE
//     ROUTE LAYER (the served file differs only in those constants), so every
//     atlas loads on a slow shared host as it would on a real device;
//   * freezes the scene: a requestAnimationFrame hook that runs after the
//     game's frame callback re-sets the scroll cursor, clears hostiles and
//     re-applies the staged player row, then PAUSES the game for each shot
//     set, so the shots with and without RIG share one byte-identical
//     background (the pause overlay is hidden by CSS);
//   * hides RIG two ways, whichever the tree has: the crisp path's test hook
//     (window.__HB_CRISP_DEBUG, ?testapi=1 only), or — on ?art=legacy and on
//     a pre-T-123 tree — the spike's render-layer trick (RIG's meshes to
//     layer 31, which no camera draws). The gun alone is hidden the same way
//     for the gun mask. His contact shadow and the muzzle flash are separate
//     objects and stay;
//   * --probe additionally reads the drawn frame back (gl.readPixels right
//     after a renderFrame()) and compares RIG's drawn pixels with the crisp
//     path's device-resolution tile, 1:1, and repeats it with the two
//     falsifiers (a half-pixel quad offset, a half-pixel figure offset).
//
// Outputs: <out>/<view>/*.png + <out>/<view>/capture.json.
// Honesty: SwiftShader is slow and the host is shared — boots take minutes.
// The freeze makes frames comparable; it does not make them representative
// of play (no hostiles, no scroll).

import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadPlaywright } from '../assets/lib/browser.mjs';
import { startStaticServer } from '../playtest/lib/server.mjs';
import { TIMEOUT as T, VIEWS, frames, openGame, rendererFacts } from './lib.mjs';

const ROOT_DEFAULT = resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
const argv = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const has = (name) => args.includes(name);
const OUT = resolve(argv('--out', 'crisp-capture'));
const ROOT = resolve(argv('--root', ROOT_DEFAULT));
const BASE_URL = argv('--base-url', '');
const EXTRA = argv('--query', '');
const THREE_DIR = argv('--three-dir', '');
const PROBE = has('--probe');
const DIRECT = has('--direct');
const ACTORS = has('--actors');
// --no-gunless: skip the gun-hidden shot (today's path is measured against
// column A's gun mask at the same placement, as the T-109 spike did)
const NO_GUNLESS = has('--no-gunless');
// --falsify lit: serve the crisp path with the lit material restored
// (lib.mjs FALSIFIERS) — the gain box's falsifier, which must read red
const FALSIFY = argv('--falsify', '');
const views = argv('--views', 'desktop,phone').split(',');
const POSES = argv('--poses', 'idle,run,jump,upright,fire,left').split(',');
const RIG_DEPTH = 1.15;        // src/render/player.js RIG_SURFACE_DEPTH

async function main() {
  await mkdir(OUT, { recursive: true });
  let server = null;
  let base = BASE_URL;
  if (!base) { server = await startStaticServer(ROOT, { port: 0 }); base = server.baseUrl; }
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const view of views) {
      if (!VIEWS[view]) throw new Error(`unknown view ${view}`);
      await captureView(browser, base, view, VIEWS[view]);
    }
  } finally {
    await browser.close().catch(() => {});
    if (server) await server.close();
  }
}

async function captureView(browser, base, viewName, V) {
  const dir = join(OUT, viewName);
  await mkdir(dir, { recursive: true });
  const report = { view: viewName, viewport: V.viewport, dpr: V.dpr, frame: V.frame, base, query: EXTRA,
    direct: DIRECT, falsify: FALSIFY || null, shots: {}, errors: [], probe: null };
  const save = () => writeFile(join(dir, 'capture.json'), JSON.stringify(report, null, 1) + '\n');
  const { context, page, bootMs } = await openGame(browser, base, V,
    { query: EXTRA, threeDir: THREE_DIR, direct: DIRECT, errors: report.errors, falsify: FALSIFY,
      holdLoop: true });
  report.bootMs = bootMs;
  await page.evaluate(installHarness, { x: 6, scroll: 0 });
  await frames(page, 2);
  report.renderer = await rendererFacts(page);
  await save();
  console.log(viewName, 'booted', report.bootMs, 'ms', JSON.stringify(report.renderer.canvas),
    'post', report.renderer.post && report.renderer.post.status);

  const fullClip = V.frame
    ? { x: 0, y: Math.round((V.viewport.height - V.frame.height) / 2), width: V.frame.width, height: V.frame.height }
    : { x: 0, y: 0, width: V.viewport.width, height: V.viewport.height };
  const STAGES = {
    idle: { aim: [1, 0] },
    upright: { aim: [Math.SQRT1_2, Math.SQRT1_2] },
    jump: { aim: [1, 0], hold: { grounded: false, vy: 3.5 }, dy: 1.5 },
    left: { aim: [-1, 0], hold: { facing: -1 } },
    fire: { aim: [1, 0], fire: true },
    run: { run: true },
  };

  for (const pose of POSES) {
    try {
      const spec = STAGES[pose];
      if (!spec) throw new Error('unknown pose ' + pose);
      await release(page);
      if (spec.run) {
        await page.evaluate(() => window.__CRISP_CAP.stage({ hold: null }));
        await page.keyboard.down('ArrowRight');
        try {
          await page.evaluate(() => window.__CRISP_CAP.pauseOnFrame('run', 'pass'));
        } finally {
          await page.keyboard.up('ArrowRight');
        }
      } else {
        await page.evaluate((s) => window.__CRISP_CAP.stage(s), spec);
        await frames(page, 4);
        if (spec.fire) await page.evaluate(() => window.__CRISP_CAP.pauseOnFlash());
        else await page.evaluate(() => window.__CRISP_CAP.pause());
      }
      await frames(page, 1);
      const info = await page.evaluate((d) => window.__CRISP_CAP.info(d), RIG_DEPTH);
      const u = info.pxPerTile;
      const clip = { x: Math.max(0, Math.round(info.feet.x - 3.5 * u)), y: Math.max(0, Math.round(info.feet.y - 0.62 * 4.6 * u)),
        width: Math.round(7 * u), height: Math.round(4.6 * u) };
      const row = { info, clip };
      row.cur = await shoot(page, dir, `cur-${pose}`, clip, 'show');
      row.bg = await shoot(page, dir, `bg-${pose}`, clip, 'hide');
      if (!NO_GUNLESS) row.gunless = await shoot(page, dir, `gunless-${pose}`, clip, 'gunless');
      if (pose === 'idle') {
        row.bg2 = await shoot(page, dir, `bg2-${pose}`, clip, 'hide');
        row.fullCur = await shoot(page, dir, 'frame-cur-idle', fullClip, 'show');
        row.fullBg = await shoot(page, dir, 'frame-bg-idle', fullClip, 'hide');
        if (PROBE) {
          await page.evaluate(() => window.__CRISP_CAP.show('show'));
          report.probe = await page.evaluate(gridProbe);
        }
      }
      await page.evaluate(() => window.__CRISP_CAP.show('show'));
      await release(page);
      await page.evaluate(() => window.__CRISP_CAP.resume());
      report.shots[pose] = row;
      await save();
      console.log(viewName, pose, 'frame', info.rig?.bodyFrame, 'ppt', u.toFixed(3));
    } catch (err) {
      report.errors.push(`${pose}: ${String(err?.message || err).split('\n')[0]}`);
      await release(page).catch(() => {});
      await page.evaluate(() => window.__CRISP_CAP && window.__CRISP_CAP.resume()).catch(() => {});
      await save();
    }
  }
  if (ACTORS) {
    try {
      await release(page);
      const spawned = await page.evaluate(() => window.__CRISP_CAP.actors());
      // actors() ends every entrance at once (enterUntil = now), so three
      // frames settle them fully materialized and not yet engaged
      await frames(page, 3);
      await page.evaluate(() => window.__CRISP_CAP.pause());
      await frames(page, 1);
      const info = await page.evaluate((d) => window.__CRISP_CAP.info(d), RIG_DEPTH);
      const row = { spawned, info };
      row.full = await shoot(page, dir, 'frame-actors', fullClip, 'show');
      row.none = await shoot(page, dir, 'frame-noactors', fullClip, 'none');
      if (PROBE) {
        await page.evaluate(() => window.__CRISP_CAP.show('show'));
        report.actorProbe = await page.evaluate(gridProbe);
      }
      report.actors = row;
      await release(page);
      await page.evaluate(() => { window.__CRISP_CAP.show('show'); window.__CRISP_CAP.endActors(); window.__CRISP_CAP.resume(); });
      console.log(viewName, 'actors', JSON.stringify(spawned));
    } catch (err) {
      report.errors.push(`actors: ${String(err?.message || err).split('\n')[0]}`);
    }
  }
  await save();
  await context.close();
}

// One shot = two drawn frames, no more: the game's loop is held (lib.mjs
// holdLoop), the toggle applied, the paused scene drawn twice with the
// game's own renderFrame(), and the page then photographed as the compositor
// shows it — so a canvas resample (today's 0.8 / 1.36) is in the picture.
// TWO because the shipped composer alternates its scene target every frame
// (OutputPass's default needsSwap ping-pongs EffectComposer's buffers, and
// src/render/post.js gives only renderTarget1 MSAA samples), so consecutive
// frames of one paused scene differ on every geometry edge; an even number
// of draws per shot keeps every shot of a pose on the same buffer, which is
// what makes the with/without-RIG difference RIG alone.
async function shoot(page, dir, name, clip, mode) {
  await page.evaluate(async (m) => {
    window.__HB_CAP_HOLD = true;
    window.__CRISP_CAP.show(m);
    const P = await import('/src/render/post.js');
    P.renderFrame();
    P.renderFrame();
  }, mode);
  const path = join(dir, name + '.png');
  const t0 = Date.now();
  await page.screenshot({ path, clip, scale: 'device', timeout: T, animations: 'allow' });
  return { path, ms: Date.now() - t0, mode };
}

const release = (page) => page.evaluate(() => { window.__HB_CAP_HOLD = false; });

/* ---------------------------- in the page ---------------------------- */

async function installHarness({ x, scroll }) {
  const [P, W, H, L, I, TW, THREE, TM, ST, FX, S] = await Promise.all([
    import('/src/sim/player.js'), import('/src/sim/weapons.js'), import('/src/sim/hostiles.js'),
    import('/src/sim/level.js'), import('/src/sim/input.js'), import('/src/render/tower.js'),
    import('three'), import('/src/sim/time.js'), import('/src/sim/state.js'), import('/src/render/fx.js'),
    import('/src/render/scene.js'),
  ]);
  const deck = L.groundTopAt(x);
  W.setWeapon('R');
  // RIG's groups, found the way the spike found them so a pre-T-123 tree works
  let accent = null;
  S.scene.traverse((o) => { if (!accent && o.name === 'rig-gun-family-accent') accent = o; });
  const gunGroup = accent ? accent.parent.parent : null;
  let rig = accent;
  while (rig && rig.parent && rig.parent !== S.scene) rig = rig.parent;
  const crispDebug = window.__HB_CRISP_DEBUG || null;
  const base = () => ({ x, y: deck, vx: 0, vy: 0, grounded: true, facing: 1,
    traversalState: 'free', ladderId: null, onOneWay: null, iframesUntil: 0 });
  const Q = { scroll, hold: base(), aim: [1, 0], fire: false, clear: true };
  const tick = () => {
    TM.setScrollX(Q.scroll);
    if (Q.clear) H.clearHostiles();
    if (Q.hold) {
      Object.assign(P.player, Q.hold);
      P.player.aim.set(Q.aim[0], Q.aim[1]);
      I.keys.strafe = true;
    }
    I.keys.fire = Q.fire;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const proj = (sx, sy, depth) => {
    const o = new THREE.Object3D();
    TW.placeOnTower(o, sx, sy, depth);
    o.updateMatrixWorld(true);
    const v = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).project(S.camera);
    const rect = S.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (v.x + 1) * rect.width / 2, y: rect.top + (1 - v.y) * rect.height / 2, z: v.z };
  };
  const setLayer = (root, layer) => root && root.traverse((o) => { if (o.isMesh) o.layers.set(layer); });
  window.__CRISP_CAP = {
    crisp: !!crispDebug,
    stage(s) {
      Q.hold = s.hold === null ? null : Object.assign(base(), s.hold || {});
      if (Q.hold && s.dy) Q.hold.y = deck + s.dy;
      Q.aim = s.aim || [1, 0];
      Q.fire = !!s.fire;
      if (Q.hold === null) { Object.assign(P.player, base()); I.keys.strafe = false; }
    },
    pause() { ST.setState('PAUSED'); },
    resume() { if (ST.state === 'PAUSED') ST.setState('PLAYING'); Q.fire = false; },
    // Pause in the frame callback that runs right after the game's own, the
    // moment the drawn frame is the one asked for — so the pose cannot move
    // between the state read and the shot (the spike's run-crop caveat).
    pauseOnFrame(state, frame) {
      return new Promise((resolve) => {
        const t0 = performance.now();
        const look = () => {
          const s = window.__HB_RIG_VISUAL && window.__HB_RIG_VISUAL();
          if ((s && s.locomotionState === state && s.bodyFrame === frame) || performance.now() - t0 > 600000) {
            ST.setState('PAUSED'); resolve(s && s.bodyFrame);
          } else requestAnimationFrame(look);
        };
        requestAnimationFrame(look);
      });
    },
    pauseOnFlash() {
      return new Promise((resolve) => {
        const t0 = performance.now();
        const look = () => {
          if (FX.fxStats().flashes > 0 || performance.now() - t0 > 600000) {
            ST.setState('PAUSED'); resolve(FX.fxStats().flashes);
          } else requestAnimationFrame(look);
        };
        requestAnimationFrame(look);
      });
    },
    // A lineup of the five hostile kinds and two pickups to RIG's right,
    // facing him, held until they have materialized (then paused).
    async actors() {
      const CP = await import('/src/sim/capsules.js');
      Q.clear = false;
      H.clearHostiles();
      CP.clearCapsules();
      const px = P.player.x, py = deck;
      for (const [kind, dx, dy] of [['wasp', 8.0, 2.6], ['hound', 10.0, 0.45], ['carrier', 12.0, 4.2],
        ['polyp', 14.0, 1.05], ['mortar', 16.0, 1.05]]) {
        H.spawnHostile(px + dx, py + dy, 0, kind, { dir: -1,
          zone: kind === 'mortar' ? { x: px + dx - 10, y: py } : undefined });
      }
      CP.spawnCapsule('letter', 'S', px + 2.0, py + 2.2, 'fixed');
      CP.spawnCapsule('mod', 'RG', px + 4.4, py + 3.4, 'fixed');
      // end every entrance now (src/sim/hostiles.js enterUntil; the render
      // side reads the same field), instead of 54 drawn frames of condensing
      for (const e of H.hostiles) e.enterUntil = TM.gameMs - 1;
      return { hostiles: H.hostiles.length, capsules: CP.capsules.length };
    },
    endActors() { Q.clear = true; },
    show(mode) {
      if (crispDebug) {
        crispDebug.hideAll = mode === 'none';
        crispDebug.hiddenActors.clear();
        crispDebug.hiddenParts.clear();
        if (mode === 'hide') crispDebug.hiddenActors.add('rig');
        if (mode === 'gunless') crispDebug.hiddenParts.add('rig-gun');
        return;
      }
      setLayer(rig, mode === 'hide' ? 31 : 0);
      if (mode === 'gunless') setLayer(gunGroup, 31);
    },
    info(depth) {
      const pp = P.player;
      const feet = proj(pp.x, pp.y, depth);
      const head = proj(pp.x, pp.y + 2, depth);
      return {
        player: { x: pp.x, y: pp.y, facing: pp.facing, aim: [pp.aim.x, pp.aim.y], grounded: pp.grounded,
          muzzleY: pp.muzzleY },
        feet, head, pxPerTile: Math.hypot(feet.x - head.x, feet.y - head.y) / 2,
        rig: window.__HB_RIG_VISUAL ? window.__HB_RIG_VISUAL() : null,
        crisp: window.__HB_CRISP ? window.__HB_CRISP() : null,
        state: window.HB.state(),
      };
    },
  };
}

/* The grid probe: one renderFrame(), the canvas read back immediately, and
   every drawn crisp actor's pixels compared with its device-resolution tile
   at the rectangle it was given; its anchor re-projected HERE from the live
   camera and snapped by the pure helper, so the compositor's own numbers are
   checked rather than trusted. Then the same with each falsifier injected
   (a half-pixel quad offset; a half-pixel figure offset). 8-bit encoded
   units; texels the bloom ceiling holds below their value are counted
   separately, never compared. */
async function gridProbe() {
  const S = await import('/src/render/scene.js');
  const P = await import('/src/render/post.js');
  const C = await import('/src/render/crisp-sprites.js');
  const G = await import('/src/pure/crisp-sprite.js');
  const THREE = await import('three');
  const dbg = window.__HB_CRISP_DEBUG;
  if (!dbg) return { skipped: 'no crisp path on this tree/URL' };
  const gl = S.renderer.getContext();
  const enc = (l) => Math.round(255 * Math.min(1, Math.max(0, G.srgbEncode(l))));
  const v3 = new THREE.Vector3();
  // ISOLATED: every mesh that is neither a crisp part nor a drawn quad is
  // hidden for the read, so effects composited over an actor (glows, lamps,
  // beams, hurt flashes and their bloom) cannot masquerade as resampling.
  const crispMask = 1 << C.CRISP_LAYER;
  const isolate = () => {
    const hidden = [];
    S.scene.traverse((o) => {
      if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite) || !o.visible) return;
      if (o.userData.crispImpostor || o.layers.mask === crispMask) return;
      o.visible = false;
      hidden.push(o);
    });
    return () => { for (const o of hidden) o.visible = true; };
  };
  const run = (label, isolated = true) => {
    const restore = isolated ? isolate() : null;
    P.renderFrame();
    gl.finish();
    if (restore) restore();
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const shot = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, shot);
    const snap = C.crispSnapshot();
    // pixels covered by more than one drawn actor's rect are resolved by
    // depth between actors; they are counted, not compared
    const cover = new Uint8Array(W * H);
    for (const a of snap.actors) {
      if (!a.drawn) continue;
      for (let y = Math.max(0, a.rect.y); y < Math.min(H, a.rect.y + a.rect.h); y++)
        for (let x = Math.max(0, a.rect.x); x < Math.min(W, a.rect.x + a.rect.w); x++) cover[y * W + x]++;
    }
    const rows = [];
    snap.actors.forEach((a, index) => {
      if (!a.drawn) return;
      const tile = C.crispTileReadback(index);
      if (!tile) return;
      const r = a.drawnRect;
      const quad = {};
      G.quadGridDeviation([r.x, r.y, r.x + r.w, r.y, r.x, r.y + r.h, r.x + r.w, r.y + r.h], tile.w, tile.h, quad);
      const anchor = C.crispActorAnchor(index);
      v3.setFromMatrixPosition(anchor.matrixWorld).project(S.camera);
      const ax = (v3.x + 1) / 2 * W, ay = (1 - v3.y) / 2 * H;
      const ex = G.snapAnchor(ax, ay, {});
      let opaque = 0, near = 0, capped = 0, worst = 0, offscreen = 0, shared = 0;
      for (let ty = 0; ty < tile.h; ty++) {
        for (let tx = 0; tx < tile.w; tx++) {
          const i = (ty * tile.w + tx) * 4;
          if (tile.rgba[i + 3] < 0.5) continue;
          // tile rows are top-down here; the canvas readback is bottom-up.
          // Expected placement: the rect the pure helper produced.
          const px = a.rect.x + tx, py = H - 1 - (a.rect.y + ty);
          if (px < 0 || py < 0 || px >= W || py >= H) { offscreen++; continue; }
          opaque++;
          if (tile.capped[ty * tile.w + tx]) { capped++; continue; }
          if (cover[(a.rect.y + ty) * W + px] > 1) { shared++; continue; }
          const k = (py * W + px) * 4;
          const d = Math.max(Math.abs(shot[k] - enc(tile.rgba[i])), Math.abs(shot[k + 1] - enc(tile.rgba[i + 1])),
            Math.abs(shot[k + 2] - enc(tile.rgba[i + 2])));
          if (d <= 2) near++;
          if (d > worst) worst = d;
        }
      }
      const compared = opaque - capped - shared;
      rows.push({
        index, name: a.name, rect: a.rect, drawnRect: r, S: a.S, fade: a.fade,
        anchorHere: { x: +ax.toFixed(4), y: +ay.toFixed(4) },
        anchorAgrees: Math.abs(ax - a.anchorPx.x) < 1e-3 && Math.abs(ay - a.anchorPx.y) < 1e-3,
        figureOnPixelEdge: a.snap.x === ex.x && a.snap.y === ex.y,
        quadCrisp: quad.crisp, quad,
        opaque, compared, within2: near, capped, shared, offscreen, worst,
        matchShare: compared > 0 ? +(near / compared).toFixed(4) : null,
      });
    });
    const shares = rows.map((x) => x.matchShare).filter((x) => x !== null);
    return {
      label, isolated, drawn: rows.length,
      allQuadsCrisp: rows.length > 0 && rows.every((x) => x.quadCrisp),
      allFiguresOnPixelEdge: rows.length > 0 && rows.every((x) => x.figureOnPixelEdge && x.anchorAgrees),
      minMatchShare: shares.length ? Math.min(...shares) : null,
      worst: rows.length ? Math.max(...rows.map((x) => x.worst)) : null,
      actors: rows,
    };
  };
  const out = { inScene: run('in scene (effects composited over actors)', false), clean: run('clean') };
  dbg.rectOffsetPx = 0.5;
  out.rectHalfPixel = run('quad +0.5 px');
  dbg.rectOffsetPx = 0;
  dbg.snapOffsetPx = 0.5;
  out.snapHalfPixel = run('figure +0.5 px');
  dbg.snapOffsetPx = 0;
  out.restored = run('restored');
  return out;
}

main().catch((err) => { console.error(err); process.exit(1); });
