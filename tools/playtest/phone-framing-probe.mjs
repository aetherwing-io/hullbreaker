#!/usr/bin/env node
/* phone-framing-probe.mjs — what the shipped camera actually does, per viewport
 * (SPRINT T-107, the phone frame).
 *
 *   node tools/playtest/phone-framing-probe.mjs --base-url http://127.0.0.1:8776 \
 *     --viewports 1280x720,1920x1080 [--touch] [--query view=far] [--dpr 1] \
 *     [--rig] [--clamp] [--clear-shot] [--render-info] [--shots <dir>]
 *     [--boot-attempts 1] [--root <tree> instead of --base-url] --out <file.json>
 *   node tools/playtest/phone-framing-probe.mjs --compare base.json branch.json
 *
 * One headless Chrome, one fresh context per viewport (touch emulation with
 * --touch, which is what selects the phone lens on a touch device). The page is
 * booted with ?testapi=1&shell=0&audio=0, paused (KeyP) and then POSED through
 * the same module entry points the frame loop uses (the T-102 posed-capture
 * method, tools/playtest/turn-pose-capture.mjs): scroll, corner ritual state,
 * syncCamera(). For every viewport it records:
 *
 *   camera  — position, quaternion, fov/aspect/near/far, matrixWorld and
 *             projectionMatrix elements at a FIXED list of poses (flat faces,
 *             a turning corner at seven ritual clocks, completed corners).
 *             --compare diffs two such files element by element: the desktop
 *             identity proof is "every element bit-identical", not "close".
 *   facts   — the live edge calibration (HB.edges() - scrollX), the resolved
 *             lens (render/camera.js cameraFramingSnapshot, absent on trees
 *             without it), the touch deck's published layout
 *             (__HB_TOUCH().layout: cluster box, stick ghost, buttons) and the
 *             HUD rectangles, all in CSS px of this viewport.
 *   band    — where the lowest landing deck (y 2) and RIG's head on the
 *             highest route surface of every face land on screen, projected
 *             through the live camera at the actor depth across the frame.
 *   clamp   — (--clamp) RIG pinned at the sim's right clamp (facing right)
 *             and at the damage plane's margin (facing left), at deck height
 *             and high: the gap in CSS px between his outermost PAINTED pixel
 *             and the frame edge, from a RIG-only draw (<= 0: cut by the edge).
 *   clear   — (--clear-shot) one frame with every scene object hidden: the
 *             clear colour as the page draws it, the reference
 *             tools/simlab/framing/void_columns.py measures voids against.
 *   rig     — (--rig) RIG standing on the first face: its 1.7-tile body
 *             projected through the live camera, AND its painted pixels: one
 *             direct render with everything but RIG hidden over a key colour,
 *             read back with gl.readPixels, bounding box of non-key pixels.
 *   renderInfo — (--render-info) the frame cost the FRAMING asks for, free of
 *             host load: at every fixed pose (hostiles removed, nothing
 *             firing) the page's own facet culls run as the play loop runs
 *             them (backdrop facets, world dressing, seams, Crown, limb
 *             folds), two presented frames pass, and the renderer's count for
 *             the last one is read (post.js resets renderer.info once per
 *             presented frame, so it is the whole frame: scene, shadow and
 *             post passes). Deterministic for a given boot state: the same
 *             tree, pose, art residency and composer state give the same
 *             numbers on any host — compare only rows whose `preload`
 *             (notReady) and `post` (status) match; --boot-attempts re-boots
 *             until every asset is ready and the composer is active. On a
 *             loaded host the composer can miss its boot budget on every
 *             boot: compare framings with `--query bloom=0` (the direct path
 *             on every session; the composer's passes are a fixed per-frame
 *             cost — 14 one-triangle draws at 844x390 — whatever the lens
 *             frames). Runs last, so --shots is unaffected.
 *
 * Honesty: a posed page is not a played page (hostiles are removed; no
 * motion). The painted-pixel box is the sprite's alpha-tested pixels in ONE
 * pose (standing, facing right), without post-processing; it is the number a
 * player would call "how tall RIG is". Dev-only; zero effect on the game.   */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { launchBrowser } from '../assets/lib/browser.mjs';
import { startStaticServer } from './lib/server.mjs';

const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt;
};
const has = (name) => argv.includes('--' + name);
const log = (...a) => console.error(new Date().toISOString().slice(11, 19), ...a);

/* ------------------------------ compare -------------------------------- */
if (has('compare')) {
  const i = argv.indexOf('--compare');
  const [fa, fb] = [argv[i + 1], argv[i + 2]];
  const A = JSON.parse(await readFile(fa, 'utf8'));
  const B = JSON.parse(await readFile(fb, 'utf8'));
  const report = [];
  let identical = true;
  for (const va of A.viewports) {
    const vb = B.viewports.find((v) => v.viewport === va.viewport);
    if (!vb) { report.push(`${va.viewport}: missing in ${fb}`); identical = false; continue; }
    let poses = 0, diffs = 0, maxAbs = 0;
    for (const pa of va.camera) {
      const pb = vb.camera.find((p) => p.label === pa.label);
      if (!pb) { diffs++; continue; }
      poses++;
      for (const key of ['position', 'quaternion', 'matrixWorld', 'projectionMatrix', 'scalars']) {
        const a = pa[key], b = pb[key];
        for (let j = 0; j < a.length; j++) {
          if (!Object.is(a[j], b[j])) { diffs++; maxAbs = Math.max(maxAbs, Math.abs(a[j] - b[j])); }
        }
      }
    }
    if (diffs) identical = false;
    report.push(`${va.viewport}${va.touch ? ' touch' : ''}${va.query ? ' ?' + va.query : ''}: ` +
      `${poses} poses, ${diffs} differing camera numbers (max |delta| ${maxAbs})` +
      ` | edges A L ${va.facts.edgeL} R ${va.facts.edgeR} / B L ${vb.facts.edgeL} R ${vb.facts.edgeR}`);
  }
  console.log(report.join('\n'));
  console.log(identical ? 'CAMERA IDENTICAL (every element Object.is-equal)' : 'CAMERA DIFFERS');
  process.exit(identical ? 0 : 1);
}

/* ------------------------------- probe --------------------------------- */
// --root <tree>: serve that tree on an ephemeral 127.0.0.1 port for this run
// (tools/playtest/lib/server.mjs) instead of --base-url
const rootDir = opt('root', null);
const server = rootDir ? await startStaticServer(resolve(rootDir), { port: 0 }) : null;
const baseUrl = server ? server.baseUrl : opt('base-url', 'http://127.0.0.1:8776');
const viewports = opt('viewports', '1280x720').split(',').map((s) => s.split('x').map(Number));
const touch = has('touch');
const dpr = +opt('dpr', '1');
const query = opt('query', '');
const wantRig = has('rig');
const wantClamp = has('clamp');
const clearShot = has('clear-shot');
const wantRenderInfo = has('render-info');
const bootAttempts = Math.max(1, +opt('boot-attempts', '1'));
const shots = opt('shots', null);
const out = resolve(opt('out', 'phone-framing-probe.json'));
const bootMs = Number(process.env.HB_PROBE_BOOT_MS) || 180000;

// Fixed poses: identical inputs on every tree, so a camera difference can
// only come from the camera code. scroll / corner k / ritual clock / which
// earlier corners are complete.
const POSES = [
  { label: 'flat-s0', scroll: 0 },
  { label: 'flat-s10', scroll: 10 },
  { label: 'flat-s40', scroll: 40 },
  { label: 'halt-1', scroll: 98, k: 1, state: 'gate' },
  ...[0, 120, 350, 520, 690, 900, 1100].map((t) => ({ label: `turn-1-t${t}`, scroll: 98, k: 1, state: 'turning', tMs: t })),
  { label: 'after-1-s98', scroll: 98, done: 1 },
  { label: 'after-1-s106', scroll: 106, done: 1 },
  { label: 'after-1-s116', scroll: 116, done: 1 },
  { label: 'turn-3-t500', scroll: 274, k: 3, state: 'turning', tMs: 500, done: 2 },
  { label: 'flat-s420', scroll: 420, done: 4 },
  { label: 'flat-s540', scroll: 540, done: 6 },
];

const result = { tool: 'tools/playtest/phone-framing-probe.mjs', measuredAt: new Date().toISOString(),
  baseUrl, touch, dpr, query, viewports: [] };
const { browser } = await launchBrowser({ channel: 'chrome' });
try {
  for (const [w, h] of viewports) {
    const t0 = Date.now();
    let context = null, page = null;
    const errors = [];
    const row = { viewport: `${w}x${h}`, touch, dpr, query, errors, preloadAttempts: [] };
    try {
      // Boot, and re-boot (--boot-attempts) while any art missed the boot
      // preload gate or the bloom composer missed its boot budget: on a
      // loaded host either can happen, and the page then draws documented
      // fallbacks for the whole session — fewer meshes or no composer passes,
      // so different --render-info counts. Every attempt's record is kept.
      for (let attempt = 1; attempt <= bootAttempts; attempt++) {
        context = await browser.newContext({ viewport: { width: w, height: h },
          deviceScaleFactor: dpr, hasTouch: touch, isMobile: touch });
        page = await context.newPage();
        errors.length = 0;
        page.on('pageerror', (e) => errors.push(String(e && e.stack || e)));
        page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
        await page.goto(`${baseUrl}/index.html?testapi=1&shell=0&audio=0${query ? '&' + query : ''}`,
          { waitUntil: 'load', timeout: bootMs });
        await page.waitForFunction(() => globalThis.HB && HB.state() === 'PLAYING', null, { timeout: bootMs });
        row.preload = await page.evaluate(() => {
          const p = globalThis.__HB_PRELOAD ? __HB_PRELOAD() : null;
          if (!p) return null;
          const assets = (p.assets || []).map((a) => ({ url: String(a.url || '').split('/').pop(), state: a.state }));
          return { budgetMs: p.budgetMs, costMs: p.costMs, notReady: assets.filter((a) => a.state !== 'ready') };
        });
        // the bloom composer settles at boot within its own bounded budget
        // (render/post.js); when it misses, the session draws the direct path
        // (no composer passes) — a different frame, so a different count
        row.post = await page.evaluate(async () => {
          const P = await import('/src/render/post.js');
          if (typeof P.postSnapshot !== 'function') return null;
          const q = P.postSnapshot();
          return { on: q.on, status: q.status, readyStatus: q.readyStatus };
        });
        const missed = row.preload ? row.preload.notReady.length : 0;
        const postDown = row.post && row.post.on && row.post.status !== 'active';
        row.preloadAttempts.push({ attempt, notReady: row.preload ? row.preload.notReady.map((a) => a.url) : null,
          post: row.post && row.post.status });
        if ((!missed && !postDown) || attempt === bootAttempts) break;
        log(`${w}x${h}: ${missed} assets missed the preload gate, post ${row.post && row.post.status}; re-booting (attempt ${attempt + 1})`);
        await context.close().catch(() => {});
      }
      page.setDefaultTimeout(bootMs);
      await page.evaluate(() => {
        dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP' }));
        dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyP' }));
      });
      await page.waitForFunction(() => HB.state() === 'PAUSED', null, { timeout: bootMs });
      // the pause card is not the game: hide it for every photo (the HUD and
      // the touch deck stay — they are what a player sees over the frame)
      await page.addStyleTag({ content: '#overlay, #thumbModal { display: none !important; }' });
      row.bootMs = Date.now() - t0;
      Object.assign(row, await page.evaluate(async ({ POSES, wantRig, wantClamp }) => {
        const [W, T, Hs, Cam, S, TW, THREE, LV, CFG] = await Promise.all([
          '/src/sim/wavegate.js', '/src/sim/time.js', '/src/sim/hostiles.js',
          '/src/render/camera.js', '/src/render/scene.js', '/src/render/tower.js', 'three',
          '/src/sim/level.js', '/src/config.js',
        ].map((p) => import(p)));
        const CONFIG = CFG.CONFIG;
        for (let i = Hs.hostiles.length - 1; i >= 0; i--) Hs.removeHostile(i, false);
        const cam = S.camera;
        const arr = (m) => Array.from(m.elements);
        const finish = (c) => {
          if (c.state === 'done') return;
          if (c.state !== 'turning') { c.state = 'turning'; c.tStart = T.gameMs; }
          c.sealed = true;
          if (typeof W.updateZipper === 'function') W.updateZipper(c, 1e9);
          W.finishCorner(c);
        };
        const camera = [];
        for (const p of POSES) {
          for (let k = 1; k <= (p.done || 0); k++) finish(W.cornerEvents[k - 1]);
          if (p.k) {
            const c = W.cornerEvents[p.k - 1];
            c.primed = true; c.state = p.state;
            c.tStart = p.state === 'turning' ? T.gameMs - p.tMs : 0;
            if (p.state === 'turning') c.sealed = true;
          }
          T.setScrollX(p.scroll);
          Cam.syncCamera();
          camera.push({
            label: p.label,
            position: cam.position.toArray(),
            quaternion: cam.quaternion.toArray(),
            matrixWorld: arr(cam.matrixWorld),
            projectionMatrix: arr(cam.projectionMatrix),
            scalars: [cam.fov, cam.aspect, cam.near, cam.far, cam.zoom],
          });
          if (p.k) {                        // leave the corner as the next pose expects it
            const c = W.cornerEvents[p.k - 1];
            if (c.state !== 'done') { c.state = 'idle'; c.tStart = 0; c.sealed = false; c.primed = false; }
          }
        }
        // ---- facts on the flat first face (a fresh, un-turned camera) ----
        // poses above completed corners; facts want the face-1 framing, which
        // the edges do not depend on (they are constant offsets), so read them
        // and the touch/HUD layout now, and project on the current face.
        const e = HB.edges();
        const snap = typeof Cam.cameraFramingSnapshot === 'function' ? Cam.cameraFramingSnapshot() : null;
        const touchSnap = typeof globalThis.__HB_TOUCH === 'function' ? globalThis.__HB_TOUCH() : null;
        const rect = (id) => {
          const el = document.getElementById(id);
          if (!el || el.hidden || !el.getClientRects().length) return null;
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) return null;
          return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
        };
        const hud = Object.fromEntries(['hudRigPanel', 'hudObjectivePanel', 'hud', 'touchDeck', 'thumbDeck']
          .map((id) => [id, rect(id)]));
        const facts = {
          inner: [innerWidth, innerHeight],
          edgeL: e.left - T.scrollX, edgeR: e.right - T.scrollX,
          framing: snap,
          touchLayout: touchSnap && touchSnap.layout ? {
            enabled: touchSnap.enabled, scheme: touchSnap.scheme,
            cluster: touchSnap.layout.cluster, ghost: touchSnap.layout.ghost,
            jump: touchSnap.layout.jump, fire: touchSnap.layout.fire, swap: touchSnap.layout.swap,
            split: touchSnap.layout.split, safe: touchSnap.layout.safe,
          } : null,
          hud,
        };
        // ---- the vertical band, projected through the live camera ----
        const v = new THREE.Vector3();
        const toScreen = (s, y, depth) => {
          const q = TW.towerPose(s, { x: 0, y: 0, z: 0, yaw: 0, alt: 0 });
          v.set(q.x + Math.sin(q.yaw) * depth, y + q.alt, q.z + Math.cos(q.yaw) * depth).project(cam);
          return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, ndcX: v.x, ndcY: v.y };
        };
        // flat face 1 at a mid-face scroll, no corner active
        for (const c of W.cornerEvents) { c.state = 'idle'; c.tStart = 0; c.sealed = false; c.primed = false; }
        Cam.resetCameraYaw();
        T.setScrollX(40);
        Cam.syncCamera();
        const depth = CONFIG.framing ? CONFIG.framing.actorDepth : 1.15;
        const xs = [];
        for (let f = 0.02; f <= 0.981; f += 0.08) xs.push(40 + facts.edgeL + f * (facts.edgeR - facts.edgeL));
        const deckY = [], headY = [];
        for (const s of xs) { deckY.push(toScreen(s, 2, depth).y); headY.push(toScreen(s, 18.7, depth).y); }
        const band = {
          scroll: 40, depth,
          deck2: { minY: Math.min(...deckY), maxY: Math.max(...deckY) },
          apexHead187: { minY: Math.min(...headY), maxY: Math.max(...headY) },
        };
        // ---- RIG ----
        let rig = null;
        if (wantRig) {
          const P = HB.player;
          const sx = 40 + CONFIG.camera.lookX;            // RIG near frame centre on face 1
          const gy = LV.groundTopAt(sx);
          Object.assign(P, { x: sx, y: gy, vx: 0, vy: 0, grounded: true, facing: 1 });
          P.iframesUntil = 0;
          const B = await import('/src/sim/bridge.js');
          B.view.player.sync();
          const feet = toScreen(P.x, P.y, depth), head = toScreen(P.x, P.y + CONFIG.player.height, depth);
          // painted pixels: hide everything but RIG, key background, one direct draw
          let accent = null;
          S.scene.traverse((o) => { if (o.name === 'rig-gun-family-accent') accent = o; });
          let top = accent;
          while (top && top.parent && top.parent !== S.scene) top = top.parent;
          const saved = [];
          S.scene.traverse((o) => saved.push([o, o.visible]));
          const bg = S.scene.background, fog = S.scene.fog, shadows = S.renderer.shadowMap.enabled;
          let painted = null;
          if (top) {
            for (const o of S.scene.children) o.visible = (o === top);
            S.scene.background = new THREE.Color(0xff00ff);
            S.scene.fog = null;
            S.renderer.shadowMap.enabled = false;
            S.renderer.setRenderTarget(null);
            S.renderer.render(S.scene, cam);
            const gl = S.renderer.getContext();
            const bw = gl.drawingBufferWidth, bh = gl.drawingBufferHeight;
            const px = new Uint8Array(bw * bh * 4);
            gl.readPixels(0, 0, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, px);
            let x0 = bw, x1 = -1, y0 = bh, y1 = -1, n = 0;
            for (let yy = 0; yy < bh; yy++) for (let xx = 0; xx < bw; xx++) {
              const i = (yy * bw + xx) * 4;
              const keyish = Math.abs(px[i] - 255) + px[i + 1] + Math.abs(px[i + 2] - 255) < 60;
              if (keyish) continue;
              n++; if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy;
            }
            const sy = bh / innerHeight;
            let crop = null;
            if (n) {
              const pad = 6, cx0 = Math.max(0, x0 - pad), cy0 = Math.max(0, y0 - pad);
              const cw = Math.min(bw, x1 + pad + 1) - cx0, ch = Math.min(bh, y1 + pad + 1) - cy0;
              const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
              const ctx = cv.getContext('2d'); const img = ctx.createImageData(cw, ch);
              for (let yy = 0; yy < ch; yy++) for (let xx = 0; xx < cw; xx++) {
                const si = ((cy0 + yy) * bw + (cx0 + xx)) * 4, di = ((ch - 1 - yy) * cw + xx) * 4;
                img.data[di] = px[si]; img.data[di + 1] = px[si + 1]; img.data[di + 2] = px[si + 2]; img.data[di + 3] = 255;
              }
              ctx.putImageData(img, 0, 0); crop = cv.toDataURL('image/png');
            }
            painted = n ? { pixels: n, buffer: [bw, bh], bbox: [x0, y0, x1, y1], crop,
              heightCss: +((y1 - y0 + 1) / sy).toFixed(2), widthCss: +((x1 - x0 + 1) / sy).toFixed(2),
              shareOfHeight: +((y1 - y0 + 1) / bh).toFixed(5),
              shareOfShortSide: +((y1 - y0 + 1) / sy / Math.min(innerWidth, innerHeight)).toFixed(5) } : { pixels: 0 };
            for (const [o, vis] of saved) o.visible = vis;
            S.scene.background = bg; S.scene.fog = fog; S.renderer.shadowMap.enabled = shadows;
          }
          rig = {
            x: P.x, y: P.y,
            projected: { feetY: feet.y, headY: head.y, heightCss: +(feet.y - head.y).toFixed(3),
              shareOfHeight: +((feet.y - head.y) / innerHeight).toFixed(5),
              shareOfShortSide: +((feet.y - head.y) / Math.min(innerWidth, innerHeight)).toFixed(5) },
            painted,
            visual: globalThis.__HB_RIG_VISUAL ? (() => { const r = globalThis.__HB_RIG_VISUAL();
              return { bodyFrame: r.bodyFrame, portraitGain: r.gunPresentation && r.gunPresentation.portraitGain }; })() : null,
          };
        }
        // ---- the clamp, in painted pixels (I-104) ----
        // RIG pinned at the sim's right clamp facing right, and at the damage
        // plane's margin facing left, at deck height and high on the frame;
        // one direct RIG-only draw each; the gap between his outermost
        // painted pixel and the frame edge (<= 0 means cut by the edge).
        let clamp = null;
        if (wantClamp) {
          const B = await import('/src/sim/bridge.js');
          const P = HB.player;
          let accent = null;
          S.scene.traverse((o) => { if (o.name === 'rig-gun-family-accent') accent = o; });
          let top = accent;
          while (top && top.parent && top.parent !== S.scene) top = top.parent;
          const drawBox = () => {
            const saved = [];
            S.scene.traverse((o) => saved.push([o, o.visible]));
            const bg = S.scene.background, fog = S.scene.fog, shadows = S.renderer.shadowMap.enabled;
            for (const o of S.scene.children) o.visible = (o === top);
            S.scene.background = new THREE.Color(0xff00ff); S.scene.fog = null; S.renderer.shadowMap.enabled = false;
            S.renderer.setRenderTarget(null);
            S.renderer.render(S.scene, cam);
            const gl = S.renderer.getContext();
            const bw = gl.drawingBufferWidth, bh = gl.drawingBufferHeight;
            const px = new Uint8Array(bw * bh * 4);
            gl.readPixels(0, 0, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, px);
            for (const [o, vis] of saved) o.visible = vis;
            S.scene.background = bg; S.scene.fog = fog; S.renderer.shadowMap.enabled = shadows;
            let x0 = bw, x1 = -1, y0 = bh, y1 = -1;
            for (let yy = 0; yy < bh; yy++) for (let xx = 0; xx < bw; xx++) {
              const i = (yy * bw + xx) * 4;
              if (Math.abs(px[i] - 255) + px[i + 1] + Math.abs(px[i + 2] - 255) < 60) continue;
              if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy;
            }
            const sx = bw / innerWidth;
            return x1 < 0 ? null : { leftGapCss: +(x0 / sx).toFixed(2), rightGapCss: +((bw - 1 - x1) / sx).toFixed(2),
              topGapCss: +((bh - 1 - y1) / sx).toFixed(2), bottomGapCss: +(y0 / sx).toFixed(2) };
          };
          for (const c of W.cornerEvents) { c.state = 'idle'; c.tStart = 0; c.sealed = false; c.primed = false; }
          Cam.resetCameraYaw();
          T.setScrollX(40);
          Cam.syncCamera();
          const margin = CONFIG.edges.margin, hw = CONFIG.player.width / 2;
          const xr = 40 + facts.edgeR - margin - hw, xl = 40 + facts.edgeL + margin + hw;
          clamp = {};
          for (const [label, x, facing, y] of [
            ['right-deck', xr, 1, LV.groundTopAt(xr)], ['right-high', xr, 1, 15],
            ['left-deck', xl, -1, LV.groundTopAt(xl)], ['left-high', xl, -1, 15],
          ]) {
            Object.assign(P, { x, y: Number.isFinite(y) ? y : 3, vx: 0, vy: 0, grounded: true, facing });
            P.iframesUntil = 0;
            B.view.player.sync();
            clamp[label] = { x: +x.toFixed(3), y: P.y, box: drawBox() };
          }
        }
        return { camera, facts, band, rig, clamp };
      }, { POSES, wantRig, wantClamp }));
      if (row.rig && row.rig.painted && row.rig.painted.crop) {
        const data = row.rig.painted.crop.split(',')[1];
        delete row.rig.painted.crop;
        const dir = shots || dirname(out);
        await mkdir(dir, { recursive: true });
        const file = resolve(dir, `rig-painted-${w}x${h}${touch ? '-touch' : ''}${query ? '-' + query.replace(/[^a-z0-9]+/gi, '_') : ''}.png`);
        await writeFile(file, Buffer.from(data, 'base64'));
        row.rig.painted.cropFile = file;
      }
      if (clearShot) {
        // the clear colour as this page draws it (post, tone mapping, JPEG):
        // every scene object hidden for one presented frame
        const dir = shots || dirname(out);
        await mkdir(dir, { recursive: true });
        await page.evaluate(async () => {
          const S = await import('/src/render/scene.js');
          globalThis.__T107_HIDDEN__ = S.scene.children.map((o) => [o, o.visible]);
          for (const o of S.scene.children) o.visible = false;
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        });
        const file = resolve(dir, `clear-ref-${w}x${h}${touch ? '-touch' : ''}.jpg`);
        await page.screenshot({ path: file, type: 'jpeg', quality: 80, timeout: bootMs });
        await page.evaluate(() => { for (const [o, v] of globalThis.__T107_HIDDEN__) o.visible = v; });
        row.clearShot = file;
      }
      if (shots) {
        await mkdir(shots, { recursive: true });
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        const file = resolve(shots, `framing-${w}x${h}${touch ? '-touch' : ''}${query ? '-' + query.replace(/[^a-z0-9]+/gi, '_') : ''}.jpg`);
        await page.screenshot({ path: file, type: 'jpeg', quality: 80, timeout: bootMs });
        row.shot = file;
      }
      if (wantRenderInfo) {
        row.renderInfo = await page.evaluate(async ({ POSES }) => {
          const [W, T, Cam, S, ...culls] = await Promise.all([
            '/src/sim/wavegate.js', '/src/sim/time.js', '/src/render/camera.js', '/src/render/scene.js',
            '/src/render/backdrop.js', '/src/render/level.js', '/src/render/seams.js',
            '/src/render/crown.js', '/src/render/limb.js',
          ].map((q) => import(q)));
          // the play loop's culls after syncCamera (src/main.js update()), by name
          const CULLS = ['updateBackdropFacetVisibility', 'updateWorldDressingCull', 'updateSeamFoldCull',
            'updateCrownFacetCull', 'updateLimbFoldCull'];
          const runCulls = () => {
            for (const name of CULLS) for (const m of culls) if (typeof m[name] === 'function') { m[name](); break; }
          };
          const finish = (c) => {
            if (c.state === 'done') return;
            if (c.state !== 'turning') { c.state = 'turning'; c.tStart = T.gameMs; }
            c.sealed = true;
            if (typeof W.updateZipper === 'function') W.updateZipper(c, 1e9);
            W.finishCorner(c);
          };
          const twoFrames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          const rows = [];
          for (const p of POSES) {
            for (let k = 1; k <= (p.done || 0); k++) finish(W.cornerEvents[k - 1]);
            if (p.k) {
              const c = W.cornerEvents[p.k - 1];
              c.primed = true; c.state = p.state;
              c.tStart = p.state === 'turning' ? T.gameMs - p.tMs : 0;
              if (p.state === 'turning') c.sealed = true;
            }
            T.setScrollX(p.scroll);
            Cam.syncCamera();
            runCulls();
            await twoFrames();
            const ri = S.renderer.info.render;
            rows.push({ label: p.label, calls: ri.calls, triangles: ri.triangles });
            if (p.k) {
              const c = W.cornerEvents[p.k - 1];
              if (c.state !== 'done') { c.state = 'idle'; c.tStart = 0; c.sealed = false; c.primed = false; }
            }
          }
          return { culls: CULLS, poses: rows,
            totalCalls: rows.reduce((a, r) => a + r.calls, 0), totalTriangles: rows.reduce((a, r) => a + r.triangles, 0) };
        }, { POSES });
      }
    } catch (error) {
      row.error = String(error && error.message || error).split('\n')[0];
    } finally {
      row.wallMs = Date.now() - t0;
      result.viewports.push(row);
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, JSON.stringify(result, null, 1));
      log(`${w}x${h}${touch ? ' touch' : ''}${query ? ' ?' + query : ''}: ${row.error ? 'FAILED ' + row.error : 'done'} (${Math.round(row.wallMs / 1000)} s)`);
      if (context) await context.close().catch(() => {});
    }
  }
} finally {
  await browser.close().catch(() => {});
  if (server) await server.close().catch(() => {});
}
process.exit(result.viewports.some((r) => r.error || r.errors.length) ? 1 : 0);
