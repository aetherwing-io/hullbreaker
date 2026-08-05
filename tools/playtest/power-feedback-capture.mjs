#!/usr/bin/env node

/* Shipped-scale acceptance for localized power feedback.
 *
 * One paused production scene is staged through public simulation events:
 * scoreKill earns OVERDRIVE, applyMod arms RAGE, and setGildedRig toggles the
 * cosmetic reward.  The renderer itself is never poked.  Hostiles, hurt
 * i-frames, recoil, and score drain are frozen so each crop differs only by
 * the declared power layer.  A second cold boot repeats the same six states
 * with bloom disabled, making glow inflation judgeable instead of assumed. */

import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withIsolatedBrowser } from './lib/isolated-browser.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = process.env.POWER_FEEDBACK_OUT || '/private/tmp/hullbreaker-power-feedback';
await mkdir(OUT, { recursive: true });

const STATES = Object.freeze([
  Object.freeze({ id: 'cold', expect: 'COLD' }),
  Object.freeze({ id: 'warm', expect: 'WARM' }),
  Object.freeze({ id: 'breaking-entry', expect: 'BREAKING' }),
  Object.freeze({ id: 'breaking-steady', expect: 'BREAKING' }),
  Object.freeze({ id: 'rage', expect: 'COLD' }),
  Object.freeze({ id: 'gilded', expect: 'COLD' }),
]);
const MODES = Object.freeze([
  Object.freeze({ id: 'post-on', query: '' }),
  Object.freeze({ id: 'post-off', query: '&bloom=0' }),
]);
const report = { ok: false, out: OUT, modes: {}, faults: [] };

async function afterPaint(page) {
  await page.evaluate(() => new Promise((done) =>
    requestAnimationFrame(() => requestAnimationFrame(done))));
}

async function install(page) {
  await page.evaluate(async () => {
    const [P, W, H, L, B, T, ST, S, M, G, Cam, F, Post] = await Promise.all([
      import('/src/sim/player.js'), import('/src/sim/weapons.js'),
      import('/src/sim/hostiles.js'), import('/src/sim/level.js'),
      import('/src/sim/bridge.js'), import('/src/sim/time.js'),
      import('/src/sim/state.js'), import('/src/sim/score.js'),
      import('/src/sim/mods.js'), import('/src/render/gilded-aura.js'),
      import('/src/render/camera.js'), import('/src/render/power-feedback.js'),
      import('/src/render/post.js'),
    ]);
    ST.setState('PAUSED');
    document.getElementById('overlay').style.display = 'none';
    document.getElementById('finale').classList.remove('on');
    H.clearHostiles();
    W.clearBullets();
    const x = 8;
    const deck = L.groundTopAt(x);
    Object.assign(P.player, {
      x, y: deck + 0.001, vx: 0, vy: 0, grounded: true, facing: 1,
      traversalState: 'free', ladderId: null, onOneWay: null,
      iframesUntil: 0, nextFireAt: 0,
    });
    P.player.aim.set(1, 0);
    W.setWeapon('R');
    T.setScrollX(0);
    Cam.syncCamera();

    const q = { P, W, H, L, B, T, ST, S, M, G, Cam, F, Post, x, deck };

    q.clearShots = () => {
      for (let i = 0; i < W.bulletPool.length; i++) {
        const bullet = W.bulletPool[i];
        if (bullet.alive) B.view.bullets.hideSlot(i, bullet, 'reset');
      }
      W.clearBullets();
      B.view.bullets.flush();
    };
    q.resetPower = () => {
      q.clearShots();
      H.clearHostiles();
      S.resetScore();
      M.clearMods();
      G.setGildedRig(false);
      P.player.iframesUntil = 0;
      P.player.nextFireAt = 0;
      B.view.player.sync();
    };
    q.earnGroundKills = (count) => {
      for (let i = 0; i < count; i++)
        S.scoreKill('wasp', 'R', { grounded: true, x, y: deck + 1, vy: 0 });
    };
    q.earnAirKills = (count) => {
      for (let i = 0; i < count; i++)
        S.scoreKill('wasp', 'R', { grounded: false, x, y: deck + 3, vy: 4 });
    };
    q.advanceToPhasePeak = (omega) => {
      const phase = ((T.gameMs * omega) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      const delta = ((Math.PI / 2 - phase + Math.PI * 2) % (Math.PI * 2)) / omega;
      T.advanceGameMs(delta);
    };
    q.fireProofShot = () => {
      q.clearShots();
      W.fireWeapon('R', x + 0.62, deck + 0.98, 1, 0, false);
      for (let i = 0; i < W.bulletPool.length; i++) {
        const bullet = W.bulletPool[i];
        if (bullet.alive) B.view.bullets.syncSlot(i, bullet);
      }
      B.view.bullets.flush();
    };
    window.__POWER_FEEDBACK_QA__ = q;
    q.resetPower();
  });
  await afterPaint(page);
}

async function stage(page, id) {
  await page.evaluate((wanted) => {
    const q = window.__POWER_FEEDBACK_QA__;
    q.resetPower();
    if (wanted === 'warm') {
      q.earnGroundKills(7);
      q.B.view.player.sync();             // rising edge owns entryAt
      q.T.advanceGameMs(q.F.OVERDRIVE_ENTRY_MS + 40);
    } else if (wanted === 'breaking-entry' || wanted === 'breaking-steady') {
      q.earnAirKills(4);
      q.B.view.player.sync();             // exact BREAKING rising edge
      if (wanted === 'breaking-steady') {
        q.T.advanceGameMs(q.F.OVERDRIVE_ENTRY_MS + 40);
        q.advanceToPhasePeak(0.016);       // strongest steady breath, no entry tail
      }
    } else if (wanted === 'rage') {
      q.M.applyMod('RG');
      const omega = Math.PI * 2 * q.F.RAGE_STACCATO_HZ / 1000;
      q.advanceToPhasePeak(omega);         // narrow local pulse at its exact peak
    } else if (wanted === 'gilded') {
      q.G.setGildedRig(true);
    }
    q.P.player.iframesUntil = 0;           // no damage flicker in any evidence frame
    q.B.view.player.sync();
    q.fireProofShot();
    q.B.view.player.sync();
  }, id);
  await afterPaint(page);
  return page.evaluate(() => ({
    rig: window.__HB_RIG_VISUAL(),
    bullets: window.__HB_BULLET_TRAITS(),
    score: window.HB.snapshot().score,
    tint: getComputedStyle(document.getElementById('tint')).backgroundColor,
    post: window.HB.snapshot().post,
    hurtControlled: window.__POWER_FEEDBACK_QA__.P.player.iframesUntil === 0,
    gameMs: window.__POWER_FEEDBACK_QA__.T.gameMs,
  }));
}

function assertState(mode, spec, state) {
  const p = state.rig.powerPresentation;
  assert.equal(p.overdrive, spec.expect, `${mode}/${spec.id}: overdrive state`);
  assert.equal(state.hurtControlled, true, `${mode}/${spec.id}: hurt transient disabled`);
  assert.equal(state.tint, 'rgba(0, 0, 0, 0)', `${mode}/${spec.id}: no global tint`);
  if (spec.id === 'cold') {
    assert.equal(p.dominantPalette, 'NONE');
    assert.deepEqual(p.activeLayers, []);
    assert.equal(state.bullets.powerLanguage.live.cold, 1);
  } else if (spec.id === 'warm') {
    assert.equal(p.dominantPalette, 'OVERDRIVE_WARM');
    assert.deepEqual(p.activeLayers, ['OVERDRIVE_WARM']);
    assert.equal(p.aura.notch, 1);
    assert.ok(p.aura.scale < 1.05, `${mode}/warm: entry pulse expired`);
    assert.equal(state.bullets.powerLanguage.live.warm, 1);
  } else if (spec.id === 'breaking-entry') {
    assert.equal(p.dominantPalette, 'OVERDRIVE_WARM');
    assert.ok(p.aura.scale >= 1.19, `${mode}/breaking-entry: entry expansion visible`);
    assert.equal(state.bullets.powerLanguage.live.breaking, 1);
  } else if (spec.id === 'breaking-steady') {
    assert.equal(p.dominantPalette, 'OVERDRIVE_WARM');
    assert.ok(p.aura.scale < 1.05, `${mode}/breaking-steady: entry tail expired`);
    assert.equal(state.bullets.powerLanguage.live.breaking, 1);
  } else if (spec.id === 'rage') {
    assert.equal(p.dominantPalette, 'RAGE_RED_MAGENTA');
    assert.deepEqual(p.activeLayers, ['RAGE_RED_MAGENTA']);
    assert.ok(p.ragePulse >= 0.99, `${mode}/rage: exact staccato peak`);
    assert.equal(state.bullets.powerLanguage.live.rage, 1);
  } else if (spec.id === 'gilded') {
    assert.equal(p.dominantPalette, 'GILDED_GOLD');
    assert.deepEqual(p.activeLayers, ['GILDED_GOLD']);
    assert.equal(state.rig.gildedAuraVisible, true);
    assert.equal(p.aura.visible, false);
  }
  assert.deepEqual(p.layerPrecedence,
    ['GILDED_GOLD', 'RAGE_RED_MAGENTA', 'OVERDRIVE_WARM']);
}

await withIsolatedBrowser(ROOT, async ({ baseUrl, newPage, launch }) => {
  report.browser = { channel: launch.channel, via: launch.via };
  for (const mode of MODES) {
    const owned = await newPage({
      viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    const { page } = owned;
    const modeReport = { captures: {} };
    report.modes[mode.id] = modeReport;
    page.on('pageerror', (error) => report.faults.push(`${mode.id} pageerror: ${error.message}`));
    page.on('console', (message) => {
      const text = message.text();
      if ((message.type() === 'warning' || message.type() === 'error') &&
          !text.includes('was preloaded using link preload but not used'))
        report.faults.push(`${mode.id} ${message.type()}: ${text}`);
    });
    try {
      await page.goto(`${baseUrl}/index.html?slice=traversal&testapi=1&enemies=0` +
        `&view=far&audio=0&momentum=0&score=1${mode.query}`,
      { waitUntil: 'load', timeout: 15000 });
      await page.waitForFunction(() => window.HB?.state() === 'PLAYING' &&
        typeof window.__HB_RIG_VISUAL === 'function' &&
        typeof window.__HB_BULLET_TRAITS === 'function', null, { timeout: 15000 });
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => window.HB.state() === 'PAUSED');
      await install(page);

      for (const spec of STATES) {
        const state = await stage(page, spec.id);
        assertState(mode.id, spec, state);
        const screen = state.rig.screen;
        const clip = {
          x: Math.max(0, Math.min(1280 - 440, Math.round(screen.x - 120))),
          y: Math.max(0, Math.min(800 - 300, Math.round(screen.y - 190))),
          width: 440, height: 300,
        };
        const path = `${OUT}/${mode.id}-${spec.id}.png`;
        await page.screenshot({ path, clip });
        modeReport.captures[spec.id] = { path, clip, state };
      }
      modeReport.postStatus = modeReport.captures.cold.state.post.status;
      if (mode.id === 'post-on') assert.equal(modeReport.postStatus, 'active');
      else assert.equal(modeReport.postStatus, 'off');
    } finally {
      await owned.close();
    }
  }

  const cards = [];
  for (const spec of STATES) {
    for (const mode of MODES) {
      const row = report.modes[mode.id].captures[spec.id];
      const png = await readFile(row.path);
      cards.push(`<figure><img src="data:image/png;base64,${png.toString('base64')}">` +
        `<figcaption>${spec.id}<small>${mode.id}</small></figcaption></figure>`);
    }
  }
  const sheet = await newPage({ viewport: { width: 980, height: 1050 }, deviceScaleFactor: 1 });
  try {
    await sheet.page.setContent(`<!doctype html><style>
      *{box-sizing:border-box}body{margin:0;padding:20px;background:#07171d;color:#f3d7a0;
      font:13px/1.2 ui-monospace,monospace}h1{margin:0 0 14px;letter-spacing:.13em}
      main{display:grid;grid-template-columns:1fr 1fr;gap:10px}figure{margin:0;padding:7px;
      background:#0c222a;border:1px solid #38535a}img{display:block;width:100%;height:210px;
      object-fit:cover}figcaption{text-transform:uppercase;letter-spacing:.08em;padding-top:6px}
      small{float:right;color:#8faeb1}</style><h1>RIG // LOCAL POWER LANGUAGE</h1>
      <main>${cards.join('')}</main>`);
    report.contactSheet = `${OUT}/contact-sheet.png`;
    await sheet.page.screenshot({ path: report.contactSheet, fullPage: true });
  } finally {
    await sheet.close();
  }
});

report.ok = report.faults.length === 0;
await writeFile(`${OUT}/evidence.json`, JSON.stringify(report, null, 2) + '\n');
if (!report.ok) throw new Error(report.faults.join('\n'));
console.log(JSON.stringify({ ok: report.ok, out: OUT, contactSheet: report.contactSheet,
  post: Object.fromEntries(Object.entries(report.modes).map(([id, row]) =>
    [id, row.postStatus])), states: STATES.map((row) => row.id) }, null, 2));

