#!/usr/bin/env node

/* One bounded browser pass for Level 1 action punctuation. Each viewport boots
 * once, then freezes real production actors at R/S/L/H/F body impacts, one
 * enemy rupture, one Warden hit, one Meridian activation, and one Crown
 * packet. The harness moves presentation rows only; it never steps combat. */

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { withIsolatedBrowser } from './lib/isolated-browser.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = process.env.ACTION_VFX_OUT || '/private/tmp/hullbreaker-action-vfx';
mkdirSync(OUT, { recursive: true });

const FAMILY_TARGET = Object.freeze({
  R: 'hound', S: 'wasp', L: 'polyp', H: 'mortar', F: 'carrier',
});
const FAMILY_DELAY = Object.freeze({ R: 96, S: 112, L: 78, H: 104, F: 138 });

async function installFixture(page) {
  await page.evaluate(async () => {
    const [H, P, L, B, T, ST, W, RH, Cam, J, FX, RL, Crown, HUD] = await Promise.all([
      import('/src/sim/hostiles.js'), import('/src/sim/player.js'),
      import('/src/sim/level.js'), import('/src/sim/bridge.js'),
      import('/src/sim/time.js'), import('/src/sim/state.js'),
      import('/src/sim/weapons.js'), import('/src/render/hostiles.js'),
      import('/src/render/camera.js'), import('/src/render/juice.js'),
      import('/src/render/fx.js'), import('/src/render/level.js'),
      import('/src/render/crown.js'), import('/src/ui/hud.js'),
    ]);

    function deckAt(x, fallback = 2) {
      const deck = L.groundTopAt(x);
      return deck > -100 ? deck : fallback;
    }

    function resetAt(x, y = null) {
      H.clearHostiles();
      RH.clearCorpses();
      W.clearBullets();
      B.view.meridian.reset();
      B.view.finale.reset();
      B.view.stateScreen('PLAYING');
      document.getElementById('overlay').style.display = 'none';
      document.getElementById('finale').classList.remove('on');
      T.setScrollX(Math.max(0, x - 8));
      const deck = y ?? deckAt(x);
      Object.assign(P.player, {
        x, y: deck + 0.001, vx: 0, vy: 0, grounded: true,
        facing: 1, traversalState: 'free', ladderId: null, onOneWay: null,
        iframesUntil: Number.MAX_SAFE_INTEGER,
      });
      P.player.aim.set(1, 0);
      Cam.syncCamera();
      B.view.player.sync();
      return deck;
    }

    function settleActor(e, kind, deck) {
      e.enterUntil = 0;
      e.flashUntil = 0;
      e.armorPingUntil = 0;
      e.coreHitUntil = 0;
      e.vx = 0;
      e.vy = 0;
      e.stateUntil = Infinity;
      if (kind === 'wasp' || kind === 'carrier') e.state = 'cruise';
      else if (kind === 'hound') e.state = 'tell';
      else if (kind === 'warden') {
        e.state = 'exposed';
        e.openedAt = T.gameMs - 220;
        e.stateUntil = T.gameMs + 5000;
        e.zoneX = e.x - 2;
        e.zoneY = deck;
      } else e.state = 'cool';
      B.view.hostiles.sync(e);
    }

    async function hit(type, kind, delay, warden = false) {
      const x = 22;
      const deck = resetAt(x);
      const targetX = x + (warden ? 5.1 : 4.2);
      const targetDeck = deckAt(targetX, deck);
      const targetY = targetDeck + (kind === 'wasp' ? 3.2 :
        kind === 'carrier' ? 2.25 : kind === 'warden' ? 1.25 : 0.42);
      H.spawnHostile(targetX, targetY, 0, kind, {
        id: `qa-action-${type}-${kind}`, dir: -1, gating: false,
        autoCycle: false, zone: { x: targetX - 2, y: deck },
        arena: { x0: x - 2, x1: x + 10 },
      });
      const e = H.hostiles.at(-1);
      settleActor(e, kind, deck);
      const aimX = e.x - P.player.x;
      const aimY = e.y - (P.player.y + P.player.muzzleY);
      const aimInv = 1 / Math.max(0.001, Math.hypot(aimX, aimY));
      P.player.aim.set(aimX * aimInv, aimY * aimInv);
      B.view.player.sync();
      W.setWeapon(type);
      HUD.updateHUD();
      B.view.bullets.slotSpawned(0, type, null);
      e.hp -= 1;
      B.view.hostiles.sync(e);
      // Land just before residue, advancing the flash/debris beat once, then
      // cross the family deadline by 17ms. The captured final beat is strong
      // rather than already halfway through its fade.
      T.advanceGameMs(delay - 1);
      J.updateJuice();
      T.advanceGameMs(18);
      J.updateJuice();
      return {
        kind, type, hp: e.hp, maxHp: e.maxHp, x: e.x, y: e.y,
        juice: window.HB.juice(),
        actor: window.__HB_HOSTILE_EVOLUTION_VISUAL?.().actorMotion?.rows?.[0] || null,
      };
    }

    async function death() {
      const x = 22;
      const deck = resetAt(x);
      H.spawnHostile(x + 4.4, deck + 2.2, 0, 'carrier', {
        id: 'qa-action-death', dir: -1, gating: false,
      });
      const e = H.hostiles[0];
      settleActor(e, 'carrier', deck);
      B.view.bullets.slotSpawned(0, 'F', null);
      H.removeHostile(0, true);
      T.advanceGameMs(170);
      J.updateJuice();
      return {
        corpse: window.__HB_HOSTILE_DEATH_VISUAL?.() || null,
        juice: window.HB.juice(),
      };
    }

    async function defense() {
      const sockets = RL.foregroundResponseSockets();
      const socket = [...sockets].reverse().find((row) => row.causeResponse &&
        row.route.offRoute && !row.route.playerAdjacent && row.hooks.includes('active'));
      if (!socket) throw new Error('no response socket for action proof');
      const playerX = socket.route.s - Math.max(8, socket.route.safeFromPlayerRadius + 3);
      resetAt(playerX);
      B.view.meridian.sync({
        face: socket.phase + 1, phase: socket.phase, state: socket.state,
        stage: 'fire', progress: 0.34, startedAtMs: T.gameMs + 991,
        stageDurationMs: 360, playerX,
        viewLeft: playerX - 15, viewRight: playerX + 24,
        cornerLimit: socket.route.s + 8,
      });
      return { socket, vfx: window.__HB_MERIDIAN_DEFENSE_VFX() };
    }

    async function crown() {
      const x = Crown.crownSignal.s;
      resetAt(x, Crown.crownSignal.deckY);
      const base = {
        phase: 'defend', elapsedMs: 4200, kills: 2, quota: 8,
        progress: 0.34, wave: 0, warden: null, sealsBroken: 1,
      };
      B.view.finale.started(base);
      B.view.finale.sync({ ...base, elapsedMs: 4380, wave: 1, progress: 0.38 });
      T.advanceGameMs(30);
      J.updateJuice();
      return {
        crown: window.__HB_CROWN_PRESENTATION?.() || null,
        finale: window.__HB_FINALE_PRESENTATION?.() || null,
        juice: window.HB.juice(),
      };
    }

    ST.setState('PAUSED');
    window.__ACTION_VFX_QA = { hit, death, defense, crown,
      reset: () => resetAt(22), fx: FX.fxStats };
  });
}

async function captureLayout(newPage, name, viewport) {
  const dir = resolve(OUT, name);
  mkdirSync(dir, { recursive: true });
  const owned = await newPage({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const { page } = owned;
  const faults = [];
  page.on('pageerror', (error) => faults.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning')
      faults.push(`${message.type()}: ${message.text()}`);
  });

  await page.goto(`${globalThis.__ACTION_BASE}/index.html?testapi=1&enemies=0&view=far&audio=0`,
    { waitUntil: 'load', timeout: 15000 });
  await page.waitForFunction(() => window.HB?.state() === 'PLAYING' &&
    typeof window.__HB_MERIDIAN_DEFENSE_VFX === 'function' &&
    typeof window.__HB_HOSTILE_EVOLUTION_VISUAL === 'function', null,
  { timeout: 15000 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.HB.state() === 'PAUSED');
  await installFixture(page);

  const frames = [];
  async function capture(tag, invoke, arg = undefined) {
    const snapshot = await page.evaluate(invoke, arg);
    await page.evaluate(() => new Promise((done) =>
      requestAnimationFrame(() => requestAnimationFrame(done))));
    const path = resolve(dir, `${tag}.png`);
    await page.screenshot({ path });
    frames.push({ tag, path, snapshot });
    return snapshot;
  }

  for (const type of ['R', 'S', 'L', 'H', 'F']) {
    const kind = FAMILY_TARGET[type];
    const delay = FAMILY_DELAY[type];
    await capture(`impact-${type}`, ({ type, kind, delay }) =>
      window.__ACTION_VFX_QA.hit(type, kind, delay), { type, kind, delay });
  }

  await capture('enemy-death', () => window.__ACTION_VFX_QA.death());
  await capture('warden-hit', () => window.__ACTION_VFX_QA.hit('L', 'warden', 82, true));
  const response = await capture('environment-activation', () =>
    window.__ACTION_VFX_QA.defense());
  await capture('crown-packet-hit', () => window.__ACTION_VFX_QA.crown());
  const idle = await page.evaluate(() => {
    window.__ACTION_VFX_QA.reset();
    return {
      juice: window.HB.juice(),
      defense: window.__HB_MERIDIAN_DEFENSE_VFX(),
    };
  });

  assert.equal(frames.length, 9, `${name}: nine production action frames`);
  for (const frame of frames.filter((row) => row.tag.startsWith('impact-') ||
    row.tag === 'warden-hit')) {
    assert.equal(frame.snapshot.juice.actionImpacts.max, 16,
      `${name}/${frame.tag}: fixed action row ceiling`);
    assert.equal(frame.snapshot.juice.actionImpacts.drawPoolsAdded, 0,
      `${name}/${frame.tag}: no draw pool added`);
    assert.equal(frame.snapshot.juice.fixedDrawPools, 8,
      `${name}/${frame.tag}: fixed FX draw budget`);
  }
  assert.equal(response.vfx.drawSlots, 1, `${name}: activation uses one draw slot`);
  assert.equal(response.vfx.atlasTextures, 1, `${name}: activation uses one atlas`);
  assert.equal(response.vfx.environmentOnly, true, `${name}: response stays environment-only`);
  assert.equal(idle.juice.actionImpacts.active, 0, `${name}: action rows dormant`);
  assert.equal(idle.defense.dormantDraws, 0, `${name}: environment idle draw is zero`);
  assert.deepEqual(faults, [], `${name}: no browser faults`);
  await owned.close();
  return { name, viewport, frames, idle, faults };
}

await withIsolatedBrowser(ROOT, async ({ baseUrl, newPage, launch }) => {
  globalThis.__ACTION_BASE = baseUrl;
  const desktop = await captureLayout(newPage, 'desktop-1440x900',
    { width: 1440, height: 900 });
  const portrait = await captureLayout(newPage, 'portrait-430x900',
    { width: 430, height: 900 });
  const report = { ok: true, out: OUT, launch, desktop, portrait };
  writeFileSync(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    ok: true, out: OUT,
    browser: launch,
    desktop: desktop.frames.map((row) => row.path),
    portrait: portrait.frames.map((row) => row.path),
    budget: {
      actionRows: desktop.idle.juice.actionImpacts.max,
      addedDrawPools: desktop.idle.juice.actionImpacts.drawPoolsAdded,
      fixedFxDrawPools: desktop.idle.juice.fixedDrawPools,
      fixedFxRows: desktop.idle.juice.fixedRows,
      environmentAtlasTextures: desktop.frames.find((row) =>
        row.tag === 'environment-activation').snapshot.vfx.atlasTextures,
      environmentDrawSlots: desktop.frames.find((row) =>
        row.tag === 'environment-activation').snapshot.vfx.drawSlots,
      dormantActionRows: desktop.idle.juice.actionImpacts.active,
      dormantEnvironmentDraws: desktop.idle.defense.dormantDraws,
    },
  }, null, 2));
});
