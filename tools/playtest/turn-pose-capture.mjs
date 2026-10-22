#!/usr/bin/env node
/* turn-pose-capture.mjs — posed frames of every corner turn (SPRINT T-102).
 *
 *   node tools/simlab/turnlab.mjs poses --viewport desktop > /tmp/poses.json
 *   node tools/playtest/turn-pose-capture.mjs --poses /tmp/poses.json \
 *     --base-url http://127.0.0.1:8752 --viewport 1280x720 \
 *     [--out reports/tasks/T-102/captures] [--only approach,t350,done] [--corners 1,2]
 *
 * Why posed, and why that is honest: under SwiftShader on a loaded host the
 * game renders well under 1 fps, so PLAYING six turns per viewport takes
 * hours. Every pose here is the exact simulation state the headless replica
 * (tools/simlab/lib/sixface-host.mjs, the real sim modules) reached at that
 * milestone of a played run: scroll, RIG, the ritual clock, which corners are
 * sealed/done. The page is paused (KeyP) for the whole session and each pose
 * is applied through the same module entry points the frame loop uses —
 * finishCorner() for completed corners, updateZipper(c, tMs) for the turning
 * corner's construction state, then syncCamera() and every fold/facet cull
 * main.js runs after it, then the player sync — and rendered by the real
 * renderer. Two things a pose cannot show: hostiles and in-flight effects
 * (the gate is cleared at every pose and ambient bodies are removed), and
 * motion (judge sequences, not single frames). A played turn
 * (tools/playtest/turn-capture.mjs --stage approach) is the cross-check.
 * Dev-only; zero effect on the shipped game.                               */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser } from '../assets/lib/browser.mjs';

const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt;
};
const posesFile = opt('poses', null);
if (!posesFile) { console.error('--poses <file from turnlab poses> is required'); process.exit(2); }
const baseUrl = opt('base-url', 'http://127.0.0.1:8752');
const [vw, vh] = opt('viewport', '1280x720').split('x').map(Number);
const dpr = +opt('dpr', '1');
const out = resolve(opt('out', 'reports/tasks/T-102/captures'));
const only = opt('only', '') ? new Set(opt('only', '').split(',')) : null;
const cornersWanted = new Set(opt('corners', '1,2,3,4,5,6').split(',').map(Number));
const format = opt('format', 'jpeg');
const quality = +opt('quality', '74');
const query = opt('query', '');
const tag = opt('tag', '');
const shotTimeout = +opt('shot-timeout-ms', '240000');   // SwiftShader under load: minutes per frame
const resume = argv.includes('--resume');                // skip frames already on disk
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const parsed = JSON.parse(await readFile(posesFile, 'utf8'));
const poses = (parsed.poses || parsed).filter((p) =>
  cornersWanted.has(p.k) && (!only || only.has(p.label)));
await mkdir(out, { recursive: true });
const { browser } = await launchBrowser({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e && e.stack || e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const sidecar = { viewport: { width: vw, height: vh, dpr }, baseUrl, query, posesFile, frames: [], errors };
try {
  await page.goto(`${baseUrl}/index.html?testapi=1&shell=0&audio=0${query ? '&' + query : ''}`,
    { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => globalThis.HB && HB.state() === 'PLAYING', null, { timeout: 300000 });
  page.setDefaultTimeout(shotTimeout);
  await page.addStyleTag({ content: '#overlay { display: none !important; }' });
  await page.evaluate(() => {
    dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP' }));
    dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyP' }));
  });
  await page.waitForFunction(() => HB.state() === 'PAUSED', null, { timeout: 120000 });
  log('booted + paused', vw + 'x' + vh);
  for (const pose of poses) {
    const name = `${tag}${vw}x${vh}-c${pose.k}-${pose.label}.${format === 'png' ? 'png' : 'jpg'}`;
    const file = resolve(out, name);
    // Resuming still applies every pose in order (corner completion is
    // cumulative page state); it only skips the screenshot already on disk.
    const skipShot = resume && existsSync(file);
    const applied = await page.evaluate(async (pose) => {
      const [W, T, Hs, Cam, B, Bd, Lv, Se, Cr, Li] = await Promise.all([
        '/src/sim/wavegate.js', '/src/sim/time.js', '/src/sim/hostiles.js',
        '/src/render/camera.js', '/src/sim/bridge.js', '/src/render/backdrop.js',
        '/src/render/level.js', '/src/render/seams.js', '/src/render/crown.js',
        '/src/render/limb.js',
      ].map((p) => import(p)));
      for (let i = Hs.hostiles.length - 1; i >= 0; i--) Hs.removeHostile(i, false);
      for (const cs of pose.corners) {
        const c = W.cornerEvents[cs.k - 1];
        if (cs.state === 'done' && c.state !== 'done') {
          // the ritual's own construction score, then its completion
          if (c.state !== 'turning') { c.state = 'turning'; c.tStart = T.gameMs; }
          c.sealed = true;
          W.updateZipper(c, 1e9);
          W.finishCorner(c);
        }
      }
      const c = W.cornerEvents[pose.k - 1];
      if (pose.label === 'approach') {
        c.primed = true; c.state = 'approach'; c.tStart = 0;
      } else if (pose.tMs !== null && pose.tMs !== undefined) {
        c.primed = true; c.state = 'turning'; c.sealed = true;
        c.tStart = T.gameMs - pose.tMs;
        W.updateZipper(c, pose.tMs);
      }
      T.setScrollX(pose.scrollX);
      Object.assign(HB.player, {
        x: pose.player.x, y: pose.player.y, vx: pose.player.vx, vy: pose.player.vy,
        grounded: pose.player.grounded, facing: pose.player.facing,
      });
      HB.player.iframesUntil = 0;
      Cam.syncCamera();
      Bd.updateBackdropFacetVisibility();
      Lv.updateWorldDressingCull();
      Se.updateSeamFoldCull();
      Cr.updateCrownFacetCull();
      Li.updateLimbFoldCull();
      B.view.player.sync();
      if (!pose.skipShot) await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return { fold: Cam.cameraFoldSnapshot(), limb: Li.limbFoldCullSnapshot(),
        state: c.state, scrollX: T.scrollX, x: HB.player.x };
    }, { ...pose, skipShot });
    if (!skipShot) await page.screenshot(format === 'png'
      ? { path: file, timeout: shotTimeout }
      : { path: file, type: 'jpeg', quality, timeout: shotTimeout });
    sidecar.frames.push({ file: name, k: pose.k, label: pose.label, tMs: pose.tMs,
      scrollX: pose.scrollX, player: pose.player, cameraYawDeg: pose.cameraYawDeg,
      replicaCameraFacet: pose.cameraFacet, page: applied });
    const yawDeg = applied.fold.yaw * 180 / Math.PI;
    log(name, 'yaw', yawDeg.toFixed(2), '(replica', pose.cameraYawDeg.toFixed(2) + ')',
      'facet', applied.fold.facingFacet, '(replica', pose.cameraFacet + ')');
    if (Math.abs(yawDeg - pose.cameraYawDeg) > 1e-6 || applied.fold.facingFacet !== pose.cameraFacet)
      errors.push(`pose ${name}: page camera disagrees with the replica`);
  }
} finally {
  await writeFile(resolve(out, `${tag}${vw}x${vh}-poses.json`), JSON.stringify(sidecar, null, 1));
  await browser.close();
  log('errors', errors.length ? errors : 'none');
}
