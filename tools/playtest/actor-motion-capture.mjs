#!/usr/bin/env node

/* Play-scale proof gallery for the declarative emplacement/Warden pipeline.
   Each screenshot uses the normal renderer and one real sim hostile row; the
   harness only holds a requested state long enough to inspect its authored
   frame. Desktop and portrait run the identical state list. */

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { startStaticServer } from './lib/server.mjs';

async function loadChromium() {
  try { return (await import('playwright')).chromium; } catch { /* cache */ }
  const cache = resolve(homedir(), '.npm/_npx');
  for (const dir of readdirSync(cache)) {
    const candidate = resolve(cache, dir, 'node_modules/playwright-core/index.mjs');
    if (existsSync(candidate)) return (await import(pathToFileURL(candidate).href)).chromium;
  }
  throw new Error('Playwright is unavailable');
}

const OUT = process.env.ACTOR_MOTION_OUT || '/private/tmp/hullbreaker-actor-motion';
mkdirSync(OUT, { recursive: true });
const chromium = await loadChromium();
const server = await startStaticServer(resolve(import.meta.dirname, '../..'));
let browser;

const STATES = [
  { kind: 'polyp', tag: 'polyp-0-sealed', state: 'closed', frame: 0, progress: 1 },
  { kind: 'polyp', tag: 'polyp-1-shutter-flare', state: 'tell', frame: 3, progress: 0.12 },
  { kind: 'polyp', tag: 'polyp-2-aim-lock', state: 'tell', frame: 1, progress: 0.5 },
  { kind: 'polyp', tag: 'polyp-3-discharge', state: 'fire', frame: 2, progress: 0.5 },
  { kind: 'polyp', tag: 'polyp-4-recover', state: 'vent', frame: 3, progress: 0.5 },
  { kind: 'mortar', tag: 'mortar-0-brace', state: 'cool', frame: 4, progress: 0.8 },
  { kind: 'mortar', tag: 'mortar-1-load', state: 'aim', frame: 5, progress: 1 },
  { kind: 'mortar', tag: 'mortar-2-launch', state: 'lob', frame: 6, progress: 0.12 },
  { kind: 'mortar', tag: 'mortar-3-recover', state: 'fuse', frame: 7, progress: 0.5 },
  { kind: 'warden', tag: 'warden-0-sealed', state: 'sealed', frame: 0, progress: 1 },
  { kind: 'warden', tag: 'warden-1-sweep-tell', state: 'sweepTell', frame: 1, progress: 0.5 },
  { kind: 'warden', tag: 'warden-2-sweep-fire', state: 'sweepFire', frame: 2, progress: 0.5 },
  { kind: 'warden', tag: 'warden-3-sweep-recover', state: 'exposed', frame: 3, progress: 0.04 },
  { kind: 'warden', tag: 'warden-4-barrage-tell', state: 'barrageTell', frame: 4, progress: 0.5 },
  { kind: 'warden', tag: 'warden-5-barrage-burst', state: 'barrageBurst', frame: 5, progress: 0.5 },
  { kind: 'warden', tag: 'warden-6-exposed', state: 'exposed', frame: 6, progress: 0.55 },
  { kind: 'warden', tag: 'warden-7-damaged', state: 'exposed', frame: 7, progress: 0.55, damaged: true },
];

const BEFORE_STATES = [STATES[2], STATES[7], STATES[11]];
const DEATH_STATES = [STATES[3], STATES[7], STATES[16]];

async function stage(page, entry) {
  return page.evaluate(async (row) => {
    const H = await import('/src/sim/hostiles.js');
    const P = await import('/src/sim/player.js');
    const B = await import('/src/sim/bridge.js');
    const RH = await import('/src/render/hostiles.js');
    const S = await import('/src/render/scene.js');
    const T = await import('/src/sim/time.js');
    const C = (await import('/src/config.js')).CONFIG;
    H.clearHostiles();
    RH.clearCorpses();
    const deck = P.player.y;
    const bodyY = row.kind === 'polyp' ? C.polyp.rootY
      : row.kind === 'mortar' ? C.mortar.bodyY : C.warden.bodyY;
    const x = P.player.x + (row.kind === 'warden' ? 4.2 : 3.2);
    H.spawnHostile(x, deck + bodyY, 0, row.kind, {
      dir: -1, gating: false, autoCycle: false,
      zone: { x: P.player.x + 0.4, y: deck },
      arena: { x0: P.player.x - 5, x1: P.player.x + 8 },
    });
    const e = H.hostiles[0];
    const durations = {
      tell: C.polyp.tellMs, fire: C.polyp.beamMs, vent: C.polyp.ventMs,
      lob: C.mortar.lobMs, fuse: C.mortar.fuseMs, burst: C.mortar.burstMs,
      cool: C.mortar.coolMs, sweepTell: C.warden.sweepTellMs,
      sweepFire: C.warden.sweepMs, barrageTell: C.warden.barrageTellMs,
      barrageBurst: C.warden.barrageMs, exposed: C.warden.exposedMs,
    };
    const duration = durations[row.state] || 0;
    // A fresh page may still have a negative deterministic clock while its
    // warmup frame settles. Anchor against that clock so the Warden is never
    // mistaken for an in-progress deployment in portrait.
    e.enterUntil = T.gameMs - 1; e.flashUntil = 0; e.state = row.state;
    e.stateUntil = duration ? T.gameMs + duration * (1 - row.progress) : Infinity;
    e.openedAt = T.gameMs - C.warden.exposedMs * row.progress;
    e.beamReach = row.state === 'fire' ? 6
      : row.state === 'sweepFire' ? C.warden.beamReach : 0;
    e.zoneX = P.player.x + 0.4; e.zoneY = deck;
    e.zoneHomeX = e.zoneX; e.zoneHomeY = e.zoneY;
    e.podU = row.state === 'lob' ? row.progress : 0;
    if (row.damaged) e.hp = Math.max(1, e.maxHp - C.warden.windowDamage);
    B.view.hostiles.sync(e);
    document.getElementById('overlay').style.display = 'none';
    const visual = window.__HB_HOSTILE_EVOLUTION_VISUAL();
    const motion = visual.actorMotion.rows[0] || null;
    return {
      motion,
      actor: { kind: e.kind, state: e.state, x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp },
      art: window.__HB_ACTOR_MOTION_ART(),
      runtime: visual.actorMotion,
      renderer: S.rendererResourceSnapshot(),
    };
  }, entry);
}

async function captureDeathContinuity(page, dir, name) {
  const rows = [];
  for (const entry of DEATH_STATES) {
    await stage(page, entry);
    const death = await page.evaluate(async () => {
      const H = await import('/src/sim/hostiles.js');
      H.removeHostile(0, true);
      return window.__HB_HOSTILE_DEATH_VISUAL().rows[0];
    });
    assert.equal(death.ruptureMode,
      entry.kind === 'warden' ? 'rooted-terminal-pieces' : 'frozen-motion',
      `${name}/${entry.tag}: authored terminal presentation`);
    assert.equal(death.motionFrame, entry.frame, `${name}/${entry.tag}: death retains attack frame`);
    assert.equal(death.posePreserved, true, `${name}/${entry.tag}: death retains geometry and map`);
    const path = resolve(dir, `${entry.tag}-death-continuity.png`);
    await page.screenshot({ path });
    rows.push({ kind: entry.kind, frame: entry.frame, path, death });
  }
  return rows;
}

async function captureLayout(name, viewport, includeDeaths = false) {
  const dir = resolve(OUT, name);
  mkdirSync(dir, { recursive: true });
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const faults = [];
  page.on('pageerror', (e) => faults.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') faults.push(`${m.type()}: ${m.text()}`);
  });
  await page.goto(`${server.baseUrl}/index.html?slice=traversal&testapi=1&enemies=0&view=far&audio=0`,
    { waitUntil: 'load' });
  await page.waitForFunction(() => window.HB?.state() === 'PLAYING' &&
    typeof window.__HB_HOSTILE_EVOLUTION_VISUAL === 'function', { timeout: 15000 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.HB.state() === 'PAUSED');
  const rows = [];
  for (const entry of STATES) {
    const snap = await stage(page, entry);
    await page.waitForTimeout(40);
    const live = await page.evaluate(() => window.__HB_HOSTILE_EVOLUTION_VISUAL().actorMotion.rows[0]);
    assert.equal(live.frame, entry.frame, `${name}/${entry.tag}: selected frame`);
    assert.equal(live.bodyMeshes, 1, `${name}/${entry.tag}: one painted body`);
    assert.equal(live.bodyRotation, 0, `${name}/${entry.tag}: no procedural card rotation`);
    const path = resolve(dir, `${entry.tag}.png`);
    await page.screenshot({ path });
    rows.push({ ...entry, path, snap: { ...snap, motion: live } });
  }
  const deathRows = includeDeaths ? await captureDeathContinuity(page, dir, name) : [];
  const ownFaults = faults.filter((f) => /actor motion|emplacement-motion|warden-motion|pageerror/i.test(f));
  assert.deepEqual(ownFaults, [], `${name}: actor-motion runtime faults`);
  await page.close();
  return { name, viewport, rows, deathRows, faults, ownFaults };
}

async function captureFallbacks(viewport) {
  const name = 'before-atlas-fallback-1440x900';
  const dir = resolve(OUT, name);
  mkdirSync(dir, { recursive: true });
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await page.goto(`${server.baseUrl}/index.html?slice=traversal&testapi=1&enemies=0&view=far&audio=0&actormotion=0`,
    { waitUntil: 'load' });
  await page.waitForFunction(() => window.HB?.state() === 'PLAYING' &&
    typeof window.__HB_HOSTILE_EVOLUTION_VISUAL === 'function', { timeout: 15000 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.HB.state() === 'PAUSED');
  const rows = [];
  for (const entry of BEFORE_STATES) {
    const snap = await stage(page, entry);
    assert.equal(snap.art.enabled, false, `${entry.tag}: fallback switch is active`);
    assert.equal(snap.motion, null, `${entry.tag}: fallback owns the body`);
    const path = resolve(dir, `${entry.tag}-before.png`);
    await page.screenshot({ path });
    rows.push({ kind: entry.kind, state: entry.state, path });
  }
  await page.close();
  return { name, viewport, rows };
}

try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const viewport = { width: 1440, height: 900 };
  const before = await captureFallbacks(viewport);
  const desktop = await captureLayout('desktop-1440x900', viewport, true);
  const portrait = await captureLayout('portrait-430x900', { width: 430, height: 900 });
  const report = { ok: true, out: OUT, before, desktop, portrait };
  writeFileSync(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    ok: true,
    out: OUT,
    captures: before.rows.length + desktop.rows.length + desktop.deathRows.length + portrait.rows.length,
    before: before.rows.map((r) => r.kind),
    deathContinuity: desktop.deathRows.map((r) => `${r.kind}:${r.frame}`),
    desktopFrames: desktop.rows.map((r) => `${r.kind}:${r.frame}`),
    portraitFrames: portrait.rows.map((r) => `${r.kind}:${r.frame}`),
    runtime: desktop.rows[0].snap.runtime,
  }, null, 2));
} finally {
  if (browser) await browser.close();
  await server.close();
}
