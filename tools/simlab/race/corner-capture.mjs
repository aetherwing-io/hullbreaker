#!/usr/bin/env node
/* corner-capture.mjs — a PLAYED corner taken while its enemies are alive,
 * on the operator's phone frame, for the T-201 phone check.
 *
 *   node tools/serve.mjs 8774 --root <worktree> --quiet &
 *   node tools/simlab/race/corner-capture.mjs --base-url http://127.0.0.1:8774 \
 *     --viewport 844x390 --touch [--dpr 1] [--corner 1] [--query ''] \
 *     [--out reports/tasks/T-201/captures]
 *
 * What is real and what is not — read before judging a frame:
 *   - Nothing is staged. The run is played from boot (?testapi=1&shell=0&
 *     audio=0) through the shipped frame loop and renderer: an in-page driver
 *     holds RIGHT, presses JUMP at holes and steps (the race lab's gap
 *     reflex), and NEVER FIRES, so the corner's encounter is alive when RIG
 *     reaches the joint. RIG's hp is topped up each frame (so the capture is
 *     about the corner, not survival) and nothing else is touched: no oracle,
 *     no removed bodies, no posed state.
 *   - Variable dt (no ?fixeddt): under SwiftShader a frame advances up to the
 *     game's 50 ms clamp, so the played trajectory is not frame-identical to
 *     the 60 Hz lab runs (positions differ by a few tiles; the corner logic is
 *     the same code).
 *   - Frames are taken by pausing (KeyP) on the first rendered frame that
 *     meets each milestone; the sidecar JSON records that frame's own sim
 *     state (corner state, ritual clock, RIG, scroll, every hostile with its
 *     follower flag) and the camera's fold snapshot. The pause overlay and
 *     the touch "TAP TO RESUME" cue are hidden with CSS, and the HUD and the
 *     thumb deck — which a pause fades out (body.at-modal) — are shown, so a
 *     frame reads as the playing frame it was paused on. The HUD keeps
 *     updating while paused, so its text is that frame's.
 * Milestones (corner k): arrive (the corner opens with an encounter body of
 * the side alive), t350 (the 30-degree hold), t700 (just after the camera
 * hand-off), done (the ritual is over; followers are dormant), enter (the
 * first follower starts condensing on the arriving facet), follow (+600 ms:
 * followers materializing ahead of RIG).
 * Dev-only; zero effect on the shipped game.                               */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser } from '../../assets/lib/browser.mjs';

const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt;
};
const baseUrl = opt('base-url', 'http://127.0.0.1:8774');
const [vw, vh] = opt('viewport', '844x390').split('x').map(Number);
const dpr = +opt('dpr', '1');
const k = +opt('corner', '1');
const query = opt('query', '');
const out = resolve(opt('out', 'reports/tasks/T-201/captures'));
const touch = argv.includes('--touch');
const quality = +opt('quality', '78');
const tag = opt('tag', '');
const MILESTONES = ['arrive', 't350', 't700', 'done', 'enter', 'follow'];
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

await mkdir(out, { recursive: true });
const { browser } = await launchBrowser({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr, hasTouch: touch });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e && e.stack || e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const sidecar = { tool: 'tools/simlab/race/corner-capture.mjs', viewport: { width: vw, height: vh, dpr, touch },
  baseUrl, query, corner: k, frames: [], errors };
try {
  const url = `${baseUrl}/index.html?testapi=1&shell=0&audio=0${query ? '&' + query : ''}`;
  await page.goto(url, { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(() => globalThis.HB && HB.state() === 'PLAYING', null, { timeout: 600000 });
  log('booted', `${vw}x${vh}`, touch ? 'touch' : 'mouse', 'dpr', dpr);
  await page.addStyleTag({ content: '#overlay, #thumbModal { display: none !important; } ' +
    'body.at-modal .hud, body.at-modal #thumbDeck { opacity: 1 !important; }' });
  await page.evaluate(async ({ k, milestones }) => {
    const [W, T, Hs, P, Cam, IN, LV, CF] = await Promise.all([
      '/src/sim/wavegate.js', '/src/sim/time.js', '/src/sim/hostiles.js', '/src/pure/path.js',
      '/src/render/camera.js', '/src/sim/input.js', '/src/sim/level.js', '/src/config.js',
    ].map((p) => import(p)));
    const S = window.__T201 = { targets: milestones.slice(), want: null, doneAt: 0, enterAt: 0, jumpUntil: 0 };
    const pause = (target, extra) => {
      const ev = W.cornerEvents[k - 1];
      S.targets.shift();
      S.want = {
        target, corner: ev.state, tMs: ev.state === 'turning' ? T.gameMs - ev.tStart : null,
        gameMs: T.gameMs, scrollX: T.scrollX,
        player: { x: HB.player.x, y: HB.player.y, vx: HB.player.vx, hp: HB.player.hp },
        fold: Cam.cameraFoldSnapshot(),
        carry: { survivorsAtTurn: ev.survivorsAtTurn, pursuers: ev.pursuers, carried: ev.carried },
        hostiles: Hs.hostiles.map((e) => ({ id: e.id, kind: e.kind, x: +e.x.toFixed(2), y: +e.y.toFixed(2),
          enc: e.encounterKey, follower: Number.isFinite(e.pursuitFrom) ? e.pursuitFrom : null,
          condensing: T.gameMs >= e.enterUntil - CF.CONFIG.wasp.enterMs, material: T.gameMs >= e.enterUntil,
          facet: P.facetAtBends(e.x, P.BEND_S) })),
        ...extra,
      };
      dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP' }));
      dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyP' }));
    };
    const tick = () => {
      requestAnimationFrame(tick);
      if (HB.state() !== 'PLAYING') return;
      const p = HB.player;
      p.hp = CF.CONFIG.player.maxHealth; p.lives = Math.max(p.lives, 2);
      // the driver: hold right, never fire, jump at holes and steps
      IN.keys.right = true; IN.keys.left = false; IN.keys.fire = false;
      if (p.grounded && T.gameMs >= S.jumpUntil) {
        const g = LV.groundTopAt(p.x + 1.2);
        if (g < -100 || g > p.y + 0.6) {
          IN.bufferJumpUntil(T.gameMs + CF.CONFIG.player.jumpBufferMs);
          IN.keys.jump = true; S.jumpUntil = T.gameMs + 420;
        }
      }
      if (T.gameMs >= S.jumpUntil) IN.keys.jump = false;
      const ev = W.cornerEvents[k - 1];
      if (ev.state === 'done' && !S.doneAt) S.doneAt = T.gameMs;
      const followers = Hs.hostiles.filter((e) => e.pursuitFrom === k && !e.gateBreakExit);
      const entering = followers.filter((e) => T.gameMs >= e.enterUntil - CF.CONFIG.wasp.enterMs);
      if (entering.length && !S.enterAt) S.enterAt = T.gameMs;
      const target = S.targets[0];
      if (!target) return;
      const tMs = ev.state === 'turning' ? T.gameMs - ev.tStart : null;
      const aliveOwn = Hs.hostiles.some((e) => e.encounterKey === ev.encounterKey && !e.gateBreakExit &&
        T.gameMs >= e.enterUntil && Number.isFinite(e.x) && e.x >= HB.edges().left && e.x <= HB.edges().right);
      if (target === 'arrive' && (ev.state === 'approach' || ev.state === 'turning')) {
        pause(target, { encounterAlive: aliveOwn });
      } else if (target.startsWith('t') && ((tMs !== null && tMs >= +target.slice(1)) || ev.state === 'done')) {
        pause(target, {});
      } else if (target === 'done' && ev.state === 'done') pause(target, {});
      else if (target === 'enter' && S.enterAt) pause(target, { followersEntering: entering.length });
      else if (target === 'follow' && S.enterAt && T.gameMs - S.enterAt >= 600)
        pause(target, { followersEntering: entering.length });
    };
    requestAnimationFrame(tick);
  }, { k, milestones: MILESTONES });
  for (const m of MILESTONES) {
    const t0 = Date.now();
    for (;;) {
      const st = await page.evaluate(() => HB.state());
      if (st === 'PAUSED') break;
      if (st !== 'PLAYING') throw new Error(`state ${st} before ${m}`);
      if (Date.now() - t0 > 60 * 60 * 1000) throw new Error(`milestone ${m}: never reached`);
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(300);
    const want = await page.evaluate(() => window.__T201.want);
    const name = `${tag}${vw}x${vh}${touch ? '-touch' : ''}-dpr${dpr}-c${k}-${String(MILESTONES.indexOf(m)).padStart(2, '0')}-${m}.jpg`;
    await page.screenshot({ path: resolve(out, name), type: 'jpeg', quality, timeout: 600000 });
    sidecar.frames.push({ file: name, ...want });
    const own = want.hostiles.filter((h) => h.enc === `gate:${k}` && h.follower === null && h.material);
    const fol = want.hostiles.filter((h) => h.follower === k);
    log(m, 'corner', want.corner, 'tMs', want.tMs === null ? '-' : want.tMs.toFixed(0),
      'x', want.player.x.toFixed(2), 'scroll', want.scrollX.toFixed(2), 'facet', want.fold.facingFacet,
      'encounter alive', own.length, 'followers', fol.length,
      'entering', fol.filter((h) => h.condensing).length);
    await page.evaluate(() => {
      dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP' }));
      dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyP' }));
    });
  }
} finally {
  await writeFile(resolve(out, `${tag}${vw}x${vh}${touch ? '-touch' : ''}-dpr${dpr}-c${k}-frames.json`),
    JSON.stringify(sidecar, null, 1));
  await browser.close();
  log('errors', errors.length ? errors : 'none');
}
