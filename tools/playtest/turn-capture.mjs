#!/usr/bin/env node
/* turn-capture.mjs — before/during/after frames of every corner turn on the
 * DEFAULT six-face run, for the operator's visual judgment (SPRINT T-102).
 *
 *   node tools/playtest/turn-capture.mjs --base-url http://127.0.0.1:8752 \
 *     --viewport 1280x720 [--corners 1,2,3,4,5,6] [--frames gate,approach,t0,...] \
 *     [--out reports/tasks/T-102/captures] [--format jpeg|png] [--quality 72]
 *
 * What is real and what is staged — read before judging a frame:
 *   - The TURN is played, not posed: RIG holds ArrowRight through the shipped
 *     input path, the gate arms, the corner ritual fires when RIG physically
 *     reaches the bend, and the real frame loop renders every frame.
 *   - The approach is STAGED to save minutes of SwiftShader time: before each
 *     corner the scroll jumps to 19 tiles before that corner's halt and RIG is
 *     placed on the joint apron (earlier corners are completed through the
 *     same finishCorner() path the ritual uses). With --stage approach the
 *     gate is posed as cleared and only the turn itself is played.
 *   - An in-page ORACLE kills each gate body once the gate holds and the body
 *     has been solid for 700 ms (through the real death path; the moving
 *     prelude is left alone so a held gate is on camera) and removes ambient
 *     bodies as they appear,
 *     so the frames are about the corner, not about the fight. RIG's hp is
 *     topped up and its i-frame blink suppressed so it is always drawn.
 *   - Frames are taken by pausing (KeyP) on the first rendered frame whose
 *     ritual clock reaches each target; the recorded tMs is the frame's own.
 *     Variable dt (no ?fixeddt) under SwiftShader means a frame can land up to
 *     50 ms after its target — the JSON sidecar records the real value.
 * Dev-only; zero effect on the shipped game.                               */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser } from '../assets/lib/browser.mjs';

const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt;
};
const baseUrl = opt('base-url', 'http://127.0.0.1:8752');
const [vw, vh] = opt('viewport', '1280x720').split('x').map(Number);
const dpr = +opt('dpr', '1');
const corners = opt('corners', '1,2,3,4,5,6').split(',').map(Number);
const frames = opt('frames', 'gate,approach,t0,t350,t690,t860,done,after1500').split(',');
const out = resolve(opt('out', 'reports/tasks/T-102/captures'));
const format = opt('format', 'jpeg');
const quality = +opt('quality', '72');
const query = opt('query', '');
const touch = argv.includes('--touch');
// --stage prelude (default): scroll 19 tiles before the halt, the gate fight
// is played. --stage approach: the gate is posed as already cleared (scroll
// at the halt, RIG 1.2 tiles before the bend) and only the TURN is played —
// the cheap cross-check of turn-pose-capture.mjs's posed ritual frames.
const stageMode = opt('stage', 'prelude');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

await mkdir(out, { recursive: true });
const { browser } = await launchBrowser({ channel: 'chrome' });
const context = await browser.newContext({
  viewport: { width: vw, height: vh }, deviceScaleFactor: dpr, hasTouch: touch,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e && e.stack || e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const sidecar = { viewport: { width: vw, height: vh, dpr }, baseUrl, query, stage: stageMode, frames: [], errors };

try {
  const url = `${baseUrl}/index.html?testapi=1&shell=0&audio=0${query ? '&' + query : ''}`;
  await page.goto(url, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => globalThis.HB && HB.state() === 'PLAYING', null, { timeout: 300000 });
  log('booted', vw + 'x' + vh);
  await page.addStyleTag({ content: '#overlay { display: none !important; }' });
  await page.evaluate(async () => {
    const W = await import('/src/sim/wavegate.js');
    const T = await import('/src/sim/time.js');
    const Hs = await import('/src/sim/hostiles.js');
    const P = await import('/src/pure/path.js');
    const Cam = await import('/src/render/camera.js');
    const S = window.__T102 = { want: null, targets: [], k: 0, armed: false, doneAt: 0, last: '' };
    S.stage = (k, mode) => {
      // staged approach: scroll 19 tiles before this corner's halt (one tile
      // ahead of the 18-tile gate prelude), RIG on the solid joint apron
      for (let i = Hs.hostiles.length - 1; i >= 0; i--) Hs.removeHostile(i, false);
      const halt = P.HALT_S[k - 1];
      for (let i = 0; i < k - 1; i++) {
        const prev = W.cornerEvents[i];
        if (prev.state !== 'done') {
          if (prev.state !== 'turning') { prev.state = 'turning'; prev.tStart = T.gameMs; }
          prev.sealed = true; W.updateZipper?.(prev, 1e9); W.finishCorner(prev); // the zipper is gone since T-201; a served pre-T-201 tree still has it
        }
      }
      let x = P.CORNER_S[k - 1] - 4.5;
      if (mode === 'approach') {
        const c = W.cornerEvents[k - 1];
        c.primed = true; c.state = 'approach'; c.tStart = 0;
        T.setScrollX(halt);
        x = P.BEND_S[k - 1] - 1.2;
      } else if (T.scrollX < halt - 19) T.setScrollX(halt - 19);
      HB.player.x = x; HB.player.vx = 0; HB.player.vy = 0;
      HB.player.y = HB.levelData.groundH[Math.floor(x)] + 0.01;
      S.k = k; S.doneAt = 0; S.armed = true;
    };
    const tick = () => {
      requestAnimationFrame(tick);
      if (HB.state() !== 'PLAYING' || !S.armed) return;
      HB.player.hp = 3; HB.player.lives = Math.max(HB.player.lives, 2);
      HB.player.iframesUntil = Math.min(HB.player.iframesUntil, T.gameMs);
      const ev = W.cornerEvents[S.k - 1];
      for (let i = Hs.hostiles.length - 1; i >= 0; i--) {
        const e = Hs.hostiles[i];
        if (e.encounterKey === ev.encounterKey) {
          // let the prelude cohort reach the halt so a held gate is on camera
          if (ev.state === 'gate' && T.gameMs >= e.enterUntil + 700) Hs.forceBreakHostile(e, 'R');
        } else if (e.kind !== 'warden') Hs.removeHostile(i, false);
      }
      if (ev.state === 'done' && !S.doneAt) S.doneAt = T.gameMs;
      const target = S.targets[0];
      if (!target) return;
      const tMs = ev.state === 'turning' ? T.gameMs - ev.tStart : null;
      let fire = false;
      if (target === 'gate') fire = (ev.state === 'gate' && Hs.hostiles.some((e) =>
        e.encounterKey === ev.encounterKey && T.gameMs >= e.enterUntil)) ||
        ev.state === 'approach' || ev.state === 'turning' || ev.state === 'done';
      else if (target === 'approach') fire = (ev.state === 'approach' && HB.player.x >= P.BEND_S[S.k - 1] - 0.9) ||
        ev.state === 'turning' || ev.state === 'done';
      else if (target.startsWith('after')) fire = S.doneAt && T.gameMs - S.doneAt >= +target.slice(5);
      else if (target === 'done') fire = ev.state === 'done';
      else if (target.startsWith('t')) fire = (tMs !== null && tMs >= +target.slice(1)) || ev.state === 'done';
      if (fire) {
        S.targets.shift();
        S.want = {
          k: S.k, target, state: ev.state, tMs, gameMs: T.gameMs, scrollX: T.scrollX,
          player: { x: HB.player.x, y: HB.player.y, vx: HB.player.vx },
          fold: Cam.cameraFoldSnapshot(), hostiles: Hs.hostiles.length,
        };
        dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP' }));
        dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyP' }));
      }
    };
    requestAnimationFrame(tick);
  });
  await page.keyboard.down('ArrowRight');
  for (const k of corners) {
    await page.evaluate(({ k, frames, stageMode }) => {
      window.__T102.targets = frames.slice(); window.__T102.stage(k, stageMode);
    }, { k, frames, stageMode });
    log('corner', k, 'staged');
    for (const f of frames) {
      const t0 = Date.now();
      for (;;) {
        const st = await page.evaluate(() => HB.state());
        if (st === 'PAUSED') break;
        if (Date.now() - t0 > 900000) throw new Error(`corner ${k} frame ${f}: never reached`);
        await page.waitForTimeout(400);
      }
      await page.waitForTimeout(250);
      const want = await page.evaluate(() => window.__T102.want);
      const file = resolve(out, `${vw}x${vh}-c${k}-${String(frames.indexOf(f)).padStart(2, '0')}-${f}.${format === 'png' ? 'png' : 'jpg'}`);
      await page.screenshot(format === 'png' ? { path: file, timeout: 240000 }
        : { path: file, type: 'jpeg', quality, timeout: 240000 });
      sidecar.frames.push({ file: file.slice(out.length + 1), ...want });
      log('corner', k, f, 'tMs', want.tMs === null ? '-' : want.tMs.toFixed(0), 'x', want.player.x.toFixed(2),
        'facet', want.fold.facingFacet, 'progress', want.fold.progress.toFixed(3));
      await page.evaluate(() => {
        dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP' }));
        dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyP' }));
      });
    }
  }
} finally {
  await writeFile(resolve(out, `${vw}x${vh}-frames.json`), JSON.stringify(sidecar, null, 1));
  await browser.close();
  log('errors', errors.length ? errors : 'none');
}
