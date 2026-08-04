#!/usr/bin/env node

/* Reachable Level-1 weapon/destruction proof.
 *
 * Every frame in this report comes from an ordinary projectile fired through
 * sim/weapons.js into a production hostile on the opening deck. The harness
 * never decrements HP to manufacture an impact and never calls a render FX
 * entry point. Death rows start wounded at 1 HP — a reachable combat state —
 * and the game's next real rivet owns the kill/removal/corpse hand-off.
 *
 * Each viewport captures the fixed procedural fallback with the optional
 * painted action atlas disabled (that layer owns its own runtime matrix).
 * The pair is production procedural VFX, then only
 * the eight fixed FX pool meshes hidden while actor, corpse, game time and
 * camera remain frozen. Local pixel masks compare those pairs around the
 * projected collision point. Five frames expose four beats plus cool-off. */

import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { withIsolatedBrowser } from './lib/isolated-browser.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))
  ?.slice(name.length + 3) || '';
const OUT = arg('out') || process.env.ACTION_VFX_OUT ||
  '/private/tmp/hullbreaker-action-vfx-v2';
mkdirSync(OUT, { recursive: true });

const IMPACTS = Object.freeze([
  { id: 'impact-R', type: 'R', kind: 'hound', frames: [0, 48, 104, 164, 700] },
  { id: 'impact-S', type: 'S', kind: 'hound', frames: [0, 44, 102, 176, 700] },
  { id: 'impact-L', type: 'L', kind: 'polyp', frames: [0, 32, 74, 132, 500] },
  { id: 'impact-H', type: 'H', kind: 'mortar', frames: [0, 42, 96, 166, 720] },
  { id: 'impact-F', type: 'F', kind: 'hound', frames: [0, 54, 122, 214, 780] },
]);
const DEATHS = Object.freeze([
  { id: 'death-wasp', type: 'R', kind: 'wasp', frames: [0, 58, 142, 268, 900] },
  { id: 'death-hound', type: 'R', kind: 'hound', frames: [0, 72, 176, 318, 950] },
  { id: 'death-emplacement', type: 'R', kind: 'mortar', frames: [0, 68, 174, 326, 950] },
  { id: 'death-warden', type: 'R', kind: 'warden', frames: [0, 240, 650, 1010, 1750] },
]);
const ALL_SEQUENCES = Object.freeze([...IMPACTS, ...DEATHS]);
const ONLY = arg('only') || process.env.ACTION_VFX_ONLY || '';
const ONLY_IDS = new Set(ONLY.split(',').map((value) => value.trim()).filter(Boolean));
const SEQUENCES = Object.freeze(ONLY
  ? ALL_SEQUENCES.filter((row) => ONLY_IDS.has(row.id))
  : [...ALL_SEQUENCES]);
if (!SEQUENCES.length) throw new Error(`unknown ACTION_VFX_ONLY=${ONLY}`);

async function bootPage(newPage, viewport) {
  const owned = await newPage({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const { page } = owned;
  const faults = [];
  page.on('pageerror', (error) => faults.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    const text = message.text();
    if ((message.type() === 'error' || message.type() === 'warning') &&
        !text.includes('was preloaded using link preload but not used'))
      faults.push(`${message.type()}: ${text}`);
  });
  const qs = new URLSearchParams({ testapi: '1', enemies: '0', view: 'far',
    audio: '0', juice: '1', actionvfx: '0' });
  await page.goto(`${globalThis.__ACTION_BASE}/index.html?${qs}`,
    { waitUntil: 'load', timeout: 15000 });
  await page.waitForFunction(() => window.HB?.state() === 'PLAYING', null,
    { timeout: 15000 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.HB.state() === 'PAUSED');
  await installFixture(page);
  return { owned, page, faults };
}

async function installFixture(page) {
  await page.evaluate(async () => {
    const [THREE, C, H, P, L, B, T, ST, W, RH, Cam, J, FX, Scene, Tower, HUD] =
      await Promise.all([
        import('three'), import('/src/config.js'),
        import('/src/sim/hostiles.js'), import('/src/sim/player.js'),
        import('/src/sim/level.js'), import('/src/sim/bridge.js'),
        import('/src/sim/time.js'), import('/src/sim/state.js'),
        import('/src/sim/weapons.js'), import('/src/render/hostiles.js'),
        import('/src/render/camera.js'), import('/src/render/juice.js'),
        import('/src/render/fx.js'), import('/src/render/scene.js'),
        import('/src/render/tower.js'), import('/src/ui/hud.js'),
      ]);

    const q = { THREE, C, H, P, L, B, T, ST, W, RH, Cam, J, FX, Scene, Tower, HUD,
      eventAt: 0, target: null, targetPoint: null, targetCenter: null,
      terminals: [], impacts: [] };
    const hideBullet = B.view.bullets.hideSlot;
    B.view.bullets.hideSlot = (slot, bullet, reason) => {
      if (bullet) q.terminals.push({ slot, type: bullet.type, reason,
        x: bullet.x, y: bullet.y });
      hideBullet(slot, bullet, reason);
    };
    const hostileImpact = B.view.bullets.hostileImpact;
    B.view.bullets.hostileImpact = (
      slot, type, x, y, vx, vy, targetId, targetKind, damaged, lethal,
    ) => {
      q.impacts.push({ slot, type, x, y, vx, vy, targetId, targetKind,
        damaged, lethal });
      hostileImpact(slot, type, x, y, vx, vy, targetId, targetKind,
        damaged, lethal);
    };

    function deckAt(x, fallback = 2) {
      const deck = L.groundTopAt(x);
      return deck > -100 ? deck : fallback;
    }

    function resetAt(x) {
      H.clearHostiles();
      RH.clearCorpses();
      W.clearBullets();
      B.view.meridian.reset();
      B.view.finale.reset();
      B.view.stateScreen('PLAYING');
      document.getElementById('overlay').style.display = 'none';
      document.getElementById('finale').classList.remove('on');
      T.setScrollX(Math.max(0, x - 8));
      const deck = deckAt(x);
      Object.assign(P.player, {
        x, y: deck + 0.001, vx: 0, vy: 0, grounded: true,
        facing: 1, traversalState: 'free', ladderId: null, onOneWay: null,
        iframesUntil: Number.MAX_SAFE_INTEGER,
      });
      P.player.aim.set(1, 0);
      Cam.syncCamera();
      B.view.player.sync();
      q.eventAt = T.gameMs;
      q.target = null;
      q.targetPoint = null;
      q.targetCenter = null;
      q.terminals.length = 0;
      q.impacts.length = 0;
      return deck;
    }

    function targetY(kind, deck) {
      if (kind === 'wasp') return deck + 3.15;
      // Rooted emplacements author their vulnerable collision centre at the
      // standing firing line, not down at the feet/scaffold socket.
      if (kind === 'polyp') return deck + 1.05;
      if (kind === 'mortar') return deck + 1.05;
      if (kind === 'carrier') return deck + 2.25;
      if (kind === 'warden') return deck + C.CONFIG.warden.bodyY;
      return deck + 0.42;
    }

    function settleActor(e, kind, deck) {
      e.enterUntil = 0;
      e.flashUntil = 0;
      e.armorPingUntil = 0;
      e.coreHitUntil = 0;
      e.vx = 0; e.vy = 0;
      e.stateUntil = Infinity;
      if (kind === 'wasp' || kind === 'carrier') e.state = 'cruise';
      else if (kind === 'hound') e.state = 'prowl';
      else if (kind === 'polyp') e.state = 'vent';
      else if (kind === 'warden') {
        e.state = 'exposed';
        e.windowDamage = 0;
        e.earnedDamage = 0;
      }
      else e.state = 'cool';
      e.baseY = e.y;
      e.zoneX = e.x - 2;
      e.zoneY = deck;
      B.view.hostiles.sync(e);
    }

    function projectPoint(s, y, depth = 1.185) {
      const pose = Tower.towerPose(s, { x: 0, y: 0, z: 0, yaw: 0, alt: 0 });
      const v = new THREE.Vector3(
        pose.x + Math.sin(pose.yaw) * depth,
        y + pose.alt,
        pose.z + Math.cos(pose.yaw) * depth,
      );
      Scene.camera.updateMatrixWorld(true);
      v.project(Scene.camera);
      return {
        x: (v.x * 0.5 + 0.5) * innerWidth,
        y: (-v.y * 0.5 + 0.5) * innerHeight,
      };
    }

    function step(ms) {
      let left = ms;
      while (left > 0.001) {
        const dtMs = Math.min(8, left);
        T.advanceGameMs(dtMs);
        // Production main.js syncs hostiles before resolving bullets. Keep
        // that ordering so a nonlethal impact reaches the new collision hook
        // this frame—not a manually forced post-hit actor sync.
        if (q.target && H.hostiles.includes(q.target)) B.view.hostiles.sync(q.target);
        W.updateBullets(dtMs / 1000);
        J.updateJuice();
        RH.updateCorpses();
        left -= dtMs;
      }
    }

    function begin(sequence, death) {
      const playerX = 22;
      const deck = resetAt(playerX);
      // Four tiles is ordinary opening-deck engagement distance and stays well
      // inside the first facet; no future face or corner is involved.
      const preferred = sequence.type === 'F' ? 3.4 : 4.2;
      // The production route has small height changes inside that distance.
      // Walk the target back to the furthest continuous patch of the player's
      // live deck so the proof tests projectile/hostile collision, rather than
      // accidentally firing through a platform lip at an enemy below it.
      let x = playerX + preferred;
      for (let distance = preferred; distance >= 1.8; distance -= 0.125) {
        const candidate = playerX + distance;
        if (Math.abs(deckAt(candidate, deck) - deck) > 0.04) continue;
        x = candidate;
        break;
      }
      const targetDeck = deckAt(x, deck);
      const y = targetY(sequence.kind, targetDeck);
      H.spawnHostile(x, y, 0, sequence.kind, {
        id: `qa-reachable-${sequence.id}`, dir: -1, gating: false,
        autoCycle: false, zone: { x: x - 2, y: targetDeck },
        arena: { x0: playerX - 2, x1: playerX + 10 },
        tune: death ? { hp: 1 } : undefined,
      });
      const e = H.hostiles.at(-1);
      settleActor(e, sequence.kind, targetDeck);
      // A one-HP spawn is a reachable wounded fixture state. No post-spawn HP
      // write or manual sync manufactures a damage observer before the real
      // lethal projectile arrives.
      q.target = e;
      q.targetPoint = projectPoint(e.x, e.y, 1.15);
      q.targetCenter = q.targetPoint;
      const aimX = e.x - P.player.x;
      const aimY = e.y - (P.player.y + P.player.muzzleY);
      const inv = 1 / Math.max(0.001, Math.hypot(aimX, aimY));
      let ax = aimX * inv, ay = aimY * inv;
      // F converts aim to a lob and then applies gravity. This ordinary shallow
      // downward aim intersects the low hound chassis before deck ignition.
      if (sequence.type === 'F') { ax = 0.966; ay = -0.26; }
      P.player.aim.set(ax, ay);
      B.view.player.sync();
      W.setWeapon(sequence.type);
      HUD.updateHUD();
      const hp0 = e.hp;
      W.fireWeapon(sequence.type,
        P.player.x + ax * 0.55,
        P.player.y + P.player.muzzleY + ay * 0.55,
        ax, ay, false);

      let hit = false;
      for (let i = 0; i < 260 && !hit; i++) {
        step(4);
        hit = death ? !H.hostiles.includes(e) : e.hp < hp0;
      }
      if (!hit) throw new Error(`${sequence.id}: real projectile did not hit ` +
        JSON.stringify({ player: { x: P.player.x, y: P.player.y },
          target: { x: e.x, y: e.y, hp: e.hp, r: e.hitR }, aim: { ax, ay },
          terminals: q.terminals,
          bullets: W.bulletPool.filter((b) => b.alive).slice(0, 8).map((b) =>
            ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, crawling: b.crawling })) }));
      const terminal = q.terminals.findLast((row) => row.reason === 'hostile') ||
        q.terminals.at(-1) || null;
      const impact = q.impacts.findLast((row) => row.targetId === e.id) || null;
      if (impact) q.targetPoint = projectPoint(impact.x, impact.y);
      else if (terminal) q.targetPoint = projectPoint(terminal.x, terminal.y);
      q.eventAt = T.gameMs;
      return {
        id: sequence.id, type: sequence.type, kind: sequence.kind,
        death, hit: true, hpBefore: hp0,
        hpAfter: H.hostiles.includes(e) ? e.hp : 0,
        point: q.targetPoint, targetCenter: q.targetCenter,
        impact, terminal, eventAt: q.eventAt,
        juice: window.HB.juice(),
        corpse: window.__HB_HOSTILE_DEATH_VISUAL?.() || null,
        resources: Scene.rendererResourceSnapshot(),
      };
    }

    function advanceFromEvent(ageMs) {
      const age = T.gameMs - q.eventAt;
      if (ageMs < age - 0.001) throw new Error(`cannot rewind ${age} -> ${ageMs}`);
      step(ageMs - age);
      return {
        ageMs, point: q.targetPoint,
        juice: window.HB.juice(),
        corpse: window.__HB_HOSTILE_DEATH_VISUAL?.() || null,
        resources: Scene.rendererResourceSnapshot(),
      };
    }

    ST.setState('PAUSED');
    window.__ACTION_VFX_QA = {
      begin, advanceFromEvent,
      reset: () => resetAt(22),
      fx: FX.fxStats,
      proofVisible: FX.setFxProofVisible,
      runtime: () => ({ juice: J.juiceSnapshot(),
        resources: Scene.rendererResourceSnapshot() }),
    };
  });
}

async function afterPaint(page) {
  await page.evaluate(() => new Promise((done) =>
    requestAnimationFrame(() => requestAnimationFrame(done))));
}

function collisionClip(point, viewport, radius = 96) {
  const x = Math.max(0, Math.floor(point.x - radius));
  const y = Math.max(0, Math.floor(point.y - radius));
  return { x, y,
    width: Math.min(radius * 2, viewport.width - x),
    height: Math.min(radius * 2, viewport.height - y) };
}

async function captureSequence(runtime, dir, sequence, viewport) {
  const { page } = runtime;
  const isDeath = sequence.id.startsWith('death-');
  const beginning = await page.evaluate(({ sequence, isDeath }) =>
    window.__ACTION_VFX_QA.begin(sequence, isDeath), { sequence, isDeath });
  assert.equal(beginning.hit, true, `${sequence.id}: real projectile hit`);
  assert.ok(beginning.impact, `${sequence.id}: collision-frame hostileImpact fact`);
  assert.equal(beginning.impact.type, sequence.type,
    `${sequence.id}: fact carries actual chassis`);
  assert.equal(beginning.impact.targetKind, sequence.kind,
    `${sequence.id}: fact carries struck role`);
  assert.equal(beginning.impact.damaged, true,
    `${sequence.id}: blocked contacts cannot paint damage`);
  assert.equal(beginning.impact.lethal, isDeath,
    `${sequence.id}: lethal bit matches removal`);
  if (beginning.terminal) {
    assert.ok(Math.hypot(beginning.impact.x - beginning.terminal.x,
      beginning.impact.y - beginning.terminal.y) < 1e-6,
    `${sequence.id}: terminal and collision fact share exact endpoint`);
  }
  // This is also the late-import bridge fence: an honest sim hit must reach
  // juice's actor observer, and a lethal hit must reach its removal observer.
  assert.equal(beginning.juice.actionImpacts.cursor, 1,
    `${sequence.id}: final production hostile-hit observer installed`);
  if (isDeath && sequence.kind !== 'warden') {
    assert.equal(beginning.juice.deathSentences.cursor, 1,
      `${sequence.id}: final production hostile-removal observer installed`);
  } else if (sequence.kind === 'warden') {
    assert.equal(beginning.juice.wardenRupture, 0,
      `${sequence.id}: Warden whole-machine sequencer armed`);
    const offCenterPx = Math.hypot(
      beginning.point.x - beginning.targetCenter.x,
      beginning.point.y - beginning.targetCenter.y,
    );
    assert.ok(offCenterPx >= 4,
      `${sequence.id}: proof collision is off-centre (${offCenterPx.toFixed(2)}px)`);
  }
  const clip = collisionClip(beginning.point, viewport);

  const frames = [];
  for (let index = 0; index < sequence.frames.length; index++) {
    const ageMs = sequence.frames[index];
    const snapshot = index === 0 ? beginning : await page.evaluate((age) =>
      window.__ACTION_VFX_QA.advanceFromEvent(age), ageMs);
    await afterPaint(page);
    const tag = `${sequence.id}-${String(index).padStart(2, '0')}-${ageMs}ms`;
    const onPath = resolve(dir, `${tag}-on.png`);
    const offPath = resolve(dir, `${tag}-off.png`);
    await page.screenshot({ path: onPath, clip });
    let contextPath = null;
    if (index === 0) {
      contextPath = resolve(dir, `${sequence.id}-context.png`);
      await page.screenshot({ path: contextPath });
    }
    const onRuntime = await page.evaluate(() => window.__ACTION_VFX_QA.runtime());
    // Exact same frozen fixture: hide only the eight pooled VFX meshes. No
    // clock, actor, corpse, camera, simulation or render row is replayed.
    await page.evaluate(() => window.__ACTION_VFX_QA.proofVisible(false));
    await afterPaint(page);
    await page.screenshot({ path: offPath, clip });
    const offRuntime = await page.evaluate(() => window.__ACTION_VFX_QA.runtime());
    await page.evaluate(() => window.__ACTION_VFX_QA.proofVisible(true));
    await afterPaint(page);
    let restoredPath = null;
    if (index === sequence.frames.length - 1) {
      restoredPath = resolve(dir, `${tag}-restored-on.png`);
      await page.screenshot({ path: restoredPath, clip });
    }
    frames.push({ index, ageMs, onPath, offPath, restoredPath, contextPath, clip,
      on: { ...snapshot, ...onRuntime }, off: {
        exactSameFrame: true, hiddenDrawPools: 8, ...offRuntime,
      } });
  }
  return { ...sequence, realProjectile: true, woundedOnlyForDeath: isDeath,
    beginning, frames };
}

async function loadImageInPage(page, path) {
  return `data:image/png;base64,${readFileSync(path).toString('base64')}`;
}

async function measureFrame(analyzer, frame, center, viewport, death) {
  const [on, off] = await Promise.all([
    loadImageInPage(analyzer, frame.onPath), loadImageInPage(analyzer, frame.offPath),
  ]);
  return analyzer.evaluate(async ({ on, off, center, viewport, death, frame }) => {
    const load = (src) => new Promise((resolve, reject) => {
      const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src;
    });
    const [a, b] = await Promise.all([load(on), load(off)]);
    const x0 = frame.clip.x, y0 = frame.clip.y;
    const w = a.naturalWidth, h = a.naturalHeight;
    const ca = document.createElement('canvas'); ca.width = w; ca.height = h;
    const cb = document.createElement('canvas'); cb.width = w; cb.height = h;
    const xa = ca.getContext('2d', { willReadFrequently: true });
    const xb = cb.getContext('2d', { willReadFrequently: true });
    xa.drawImage(a, 0, 0, w, h);
    xb.drawImage(b, 0, 0, w, h);
    const da = xa.getImageData(0, 0, w, h).data;
    const db = xb.getImageData(0, 0, w, h).data;
    const mask = new Uint8Array(w * h);
    const delta = new Uint16Array(w * h);
    let rawPixels = 0;
    // 48 summed RGB levels rejects post/AA shimmer but retains a restrained
    // dark metal chip. Both screenshots are lossless PNG.
    for (let p = 0, i = 0; p < da.length; p += 4, i++) {
      const d = Math.abs(da[p] - db[p]) + Math.abs(da[p + 1] - db[p + 1]) +
        Math.abs(da[p + 2] - db[p + 2]);
      if (d < 48) continue;
      mask[i] = 1; delta[i] = d; rawPixels++;
    }
    // Post/grain can change isolated pixels between the two render passes.
    // Measure only connected ink belonging to the collision neighbourhood;
    // a real streak/plate remains a component, a distant dither speck does not.
    const seen = new Uint8Array(w * h);
    const stack = new Int32Array(w * h);
    const cx = center.x - x0, cy = center.y - y0;
    // A direct impact must contribute authored ink within forty pixels of the
    // exact collision. Keeping the component search and acceptance radius in
    // agreement prevents a larger post-affected deck edge farther away from
    // stealing `primary` from the smaller, real contact glyph (notably F).
    const reach2 = (death ? 84 : 40) ** 2;
    let minX = w, minY = h, maxX = -1, maxY = -1, pixels = 0, energy = 0;
    let primary = null;
    for (let seed = 0; seed < mask.length; seed++) {
      if (!mask[seed] || seen[seed]) continue;
      let top = 0, read = 0, count = 0, componentEnergy = 0;
      let cMinX = w, cMinY = h, cMaxX = -1, cMaxY = -1, nearest2 = Infinity;
      stack[top++] = seed; seen[seed] = 1;
      while (read < top) {
        const at = stack[read++];
        const x = at % w, y = Math.floor(at / w);
        count++; componentEnergy += delta[at];
        cMinX = Math.min(cMinX, x); cMinY = Math.min(cMinY, y);
        cMaxX = Math.max(cMaxX, x); cMaxY = Math.max(cMaxY, y);
        nearest2 = Math.min(nearest2, (x - cx) ** 2 + (y - cy) ** 2);
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const nx = x + ox, ny = y + oy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const ni = ny * w + nx;
          if (mask[ni] && !seen[ni]) { seen[ni] = 1; stack[top++] = ni; }
        }
      }
      if (count < 3 || nearest2 > reach2) continue;
      minX = Math.min(minX, cMinX); minY = Math.min(minY, cMinY);
      maxX = Math.max(maxX, cMaxX); maxY = Math.max(maxY, cMaxY);
      pixels += count; energy += componentEnergy;
      const component = { count, energy: componentEnergy, nearest2,
        minX: cMinX, minY: cMinY, maxX: cMaxX, maxY: cMaxY };
      // The authored glyph can contain a deliberate dark seam, splitting its
      // ink into several pieces. Choose the largest connected piece that still
      // touches the exact collision neighbourhood; choosing the nearest three
      // antialias pixels would under-report the visible 20–40px silhouette.
      if (!primary || component.count > primary.count ||
          (component.count === primary.count &&
           component.nearest2 < primary.nearest2)) primary = component;
    }
    return {
      crop: { x: x0, y: y0, width: w, height: h },
      // The primary connected silhouette is the honest contact measurement;
      // unionBbox also reports every nearby chip/streak without pretending the
      // empty air between separated fragments is one giant glowing object.
      bbox: primary ? { x: x0 + primary.minX, y: y0 + primary.minY,
        width: primary.maxX - primary.minX + 1,
        height: primary.maxY - primary.minY + 1 } : null,
      unionBbox: pixels ? { x: x0 + minX, y: y0 + minY,
        width: maxX - minX + 1, height: maxY - minY + 1 } : null,
      changedPixels: primary?.count || 0,
      distanceFromCollisionPx: primary ? +Math.sqrt(primary.nearest2).toFixed(2) : null,
      nearbyChangedPixels: pixels,
      rawChangedPixels: rawPixels,
      meanRgbDelta: primary ? +(primary.energy / primary.count).toFixed(2) : 0,
      nearbyMeanRgbDelta: pixels ? +(energy / pixels).toFixed(2) : 0,
      thresholdRgbSum: 48,
    };
  }, { on, off, center, viewport, death, frame: { clip: frame.clip } });
}

async function makeContactSheet(analyzer, sequences, output, portrait) {
  const rows = [];
  for (const sequence of sequences) {
    const cells = [];
    for (const frame of sequence.frames) cells.push({
      age: frame.ageMs, src: await loadImageInPage(analyzer, frame.onPath),
    });
    rows.push({ id: sequence.id, cells });
  }
  const cellW = portrait ? 150 : 290;
  await analyzer.setViewportSize({ width: cellW * 5 + 42,
    height: portrait ? 3400 : 1600 });
  await analyzer.setContent(`<!doctype html><style>
    html,body{margin:0;background:#081115;color:#dce8e5;font:15px ui-monospace,monospace}
    body{padding:16px}.row{margin:0 0 14px}.title{margin:0 0 5px;color:#f2bd69;font-weight:700}
    .strip{display:grid;grid-template-columns:repeat(5,${cellW}px);gap:4px}
    .cell{position:relative}.cell img{display:block;width:${cellW}px;height:auto;border:1px solid #32494d}
    .age{position:absolute;left:5px;bottom:5px;background:#061014d9;padding:2px 4px;color:#fff}
  </style><body>${rows.map((row) => `<div class="row"><div class="title">${row.id}</div><div class="strip">${row.cells.map((cell) => `<div class="cell"><img src="${cell.src}"><span class="age">${cell.age}ms</span></div>`).join('')}</div></div>`).join('')}</body>`);
  await analyzer.screenshot({ path: output, fullPage: true });
}

async function captureLayout(newPage, name, viewport) {
  const dir = resolve(OUT, name);
  mkdirSync(dir, { recursive: true });
  const runtime = await bootPage(newPage, viewport);
  const sequences = [];
  for (const sequence of SEQUENCES)
    sequences.push(await captureSequence(runtime, dir, sequence, viewport));

  const analyzerOwned = await newPage({ viewport: { width: 800, height: 800 },
    deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const analyzer = analyzerOwned.page;
  await analyzer.setContent('<!doctype html><body></body>');
  for (const sequence of sequences) {
    const center = sequence.beginning.point;
    for (const frame of sequence.frames)
      frame.measurement = await measureFrame(analyzer, frame, center, viewport,
        sequence.id.startsWith('death-'));
    const cooled = sequence.frames.at(-1);
    cooled.driftMeasurement = await measureFrame(analyzer,
      { ...cooled, offPath: cooled.restoredPath }, center, viewport,
      sequence.id.startsWith('death-'));
  }
  const contactSheet = resolve(dir, 'contact-sheet.png');
  await makeContactSheet(analyzer, sequences, contactSheet, viewport.width < viewport.height);

  for (const sequence of sequences) {
    const contact = sequence.frames[0].measurement;
    assert.ok(contact.changedPixels > 0, `${name}/${sequence.id}: visible VFX delta`);
    if (sequence.id.startsWith('impact-')) {
      const maxContactExtent = Math.max(contact.bbox.width, contact.bbox.height);
      assert.ok(maxContactExtent >= 12,
        `${name}/${sequence.id}: contact silhouette >=12px (${maxContactExtent}; ` +
        `live=${JSON.stringify({ sparks: sequence.frames[0].on.juice.sparks,
          flashes: sequence.frames[0].on.juice.flashes,
          cores: sequence.frames[0].on.juice.cores,
          action: sequence.frames[0].on.juice.actionImpacts })})`);
      assert.ok(maxContactExtent <= 48,
        `${name}/${sequence.id}: contact silhouette <=48px (${maxContactExtent})`);
      assert.ok(contact.distanceFromCollisionPx <= 40,
        `${name}/${sequence.id}: silhouette touches collision neighbourhood ` +
        `(${contact.distanceFromCollisionPx}px)`);
    }
    for (const frame of sequence.frames) {
      assert.equal(frame.on.juice.fixedDrawPools, 8,
        `${name}/${sequence.id}/${frame.ageMs}: fixed eight FX pools`);
      assert.equal(frame.on.juice.actionImpacts?.drawPoolsAdded || 0, 0,
        `${name}/${sequence.id}/${frame.ageMs}: no action draw pool`);
      assert.equal(frame.on.juice.deathSentences?.corpseTransformWrites || 0, 0,
        `${name}/${sequence.id}/${frame.ageMs}: VFX never transforms corpse`);
      // Shipped bloom submits each LIVE pool twice. Capacity remains eight
      // fixed meshes, but a cooled pool has count=0 and therefore pays no
      // dormant draw. This compares the exact same frozen scene, not harness
      // overhead or a replayed frame.
      const drawDelta = frame.on.resources.draw.calls - frame.off.resources.draw.calls;
      assert.equal(drawDelta, frame.on.juice.activeDrawPools * 2,
        `${name}/${sequence.id}/${frame.ageMs}: paired baseline pays only live pools`);
      assert.equal(frame.on.resources.memory.geometries,
        frame.off.resources.memory.geometries,
        `${name}/${sequence.id}/${frame.ageMs}: proof toggle allocates no geometry`);
      assert.equal(frame.on.resources.memory.textures,
        frame.off.resources.memory.textures,
        `${name}/${sequence.id}/${frame.ageMs}: proof toggle allocates no texture`);
    }
    const cooled = sequence.frames.at(-1);
    const proceduralLive = cooled.on.juice.sparks + cooled.on.juice.flashes +
      cooled.on.juice.rings + cooled.on.juice.cores +
      cooled.on.juice.fragments + cooled.on.juice.vapor;
    assert.equal(proceduralLive, 0,
      `${name}/${sequence.id}: all procedural rows retire by cooled frame`);
    assert.equal(cooled.on.juice.activeDrawPools, 0,
      `${name}/${sequence.id}: cooled VFX submit no dormant draw`);
    assert.equal(cooled.on.resources.draw.calls, cooled.off.resources.draw.calls,
      `${name}/${sequence.id}: cooled ON/OFF have identical draw baseline`);
  }
  assert.deepEqual(runtime.faults, [], `${name}: no browser faults`);

  const result = {
    name, viewport, contactSheet, sequences,
    budget: {
      fixedFxDrawPools: sequences[0].frames[0].on.juice.fixedDrawPools,
      fixedFxRows: sequences[0].frames[0].on.juice.fixedRows,
      actionRows: sequences[0].frames[0].on.juice.actionImpacts.max,
      deathRows: sequences[0].frames[0].on.juice.deathSentences.max,
      hostileBridgeInstalls: sequences[0].frames[0].on.juice.bridge?.hostileInstalls,
      maxDrawCallsOn: Math.max(...sequences.flatMap((row) => row.frames.map((frame) =>
        frame.on.resources.draw.calls))),
      maxDrawCallsOffBaseline: Math.max(...sequences.flatMap((row) => row.frames.map((frame) =>
        frame.off.resources.draw.calls))),
      maxVfxDrawDelta: Math.max(...sequences.flatMap((row) => row.frames.map((frame) =>
        frame.on.resources.draw.calls - frame.off.resources.draw.calls))),
    },
    faults: runtime.faults,
  };
  await analyzerOwned.close();
  await runtime.owned.close();
  return result;
}

await withIsolatedBrowser(ROOT, async ({ baseUrl, newPage, launch }) => {
  globalThis.__ACTION_BASE = baseUrl;
  const desktop = await captureLayout(newPage, 'desktop-1440x900',
    { width: 1440, height: 900 });
  const portrait = await captureLayout(newPage, 'portrait-430x900',
    { width: 430, height: 900 });
  const report = { ok: true, out: OUT, launch, desktop, portrait };
  writeFileSync(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2));
  const summary = (layout) => Object.fromEntries(layout.sequences.map((row) => {
    const frames = row.frames.map((frame) => ({ ageMs: frame.ageMs,
      bbox: frame.measurement.bbox, unionBbox: frame.measurement.unionBbox,
      pixels: frame.measurement.changedPixels,
      collisionDistancePx: frame.measurement.distanceFromCollisionPx,
      drawCalls: { on: frame.on.resources.draw.calls,
        off: frame.off.resources.draw.calls } }));
    return [row.id, frames];
  }));
  console.log(JSON.stringify({
    ok: true, out: OUT, browser: launch,
    sheets: { desktop: desktop.contactSheet, portrait: portrait.contactSheet },
    desktop: summary(desktop), portrait: summary(portrait),
    budgets: { desktop: desktop.budget, portrait: portrait.budget },
  }, null, 2));
});
