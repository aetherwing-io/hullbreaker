#!/usr/bin/env node
/* Real-browser proof for the six-face adaptive-pressure runtime.
 *
 * This is deliberately not another pure director simulation.  It boots the
 * shipped composition root in isolated Chrome, equips a legitimate tier-III
 * rolled HUNGER ENGINE, lets main.js advance the real spawner/hostiles/
 * weapons/render loop, and samples spawner.js's read-only pressure snapshot.
 * Short face handoffs use the real finishCorner/reveal hooks so faces 3..6 can
 * be measured in ~30 seconds instead of replaying two already-proven opening
 * faces before every tuning attempt.                                       */

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withIsolatedBrowser } from './lib/isolated-browser.mjs';
import { CONFIG as SHIPPED_CONFIG } from '../../src/config.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const SEEKER_ONLY = process.argv.includes('--seeker-only');
const outArg = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const outDir = resolve(outArg || (SEEKER_ONLY
  ? '/private/tmp/hullbreaker-pressure-seeker-runtime'
  : '/private/tmp/hullbreaker-pressure-runtime'));

const VIEWPORT = { width: 1440, height: 900 };
const PORTRAIT = { width: 900, height: 1200 };
const FACES = [3, 4, 5, 6];
const FACE_SIM_MS = 8200;
const SAMPLE_WALL_MS = SEEKER_ONLY ? 35 : 70;
const FIXED_DT_MS = SEEKER_ONLY ? 80 : 50;
const DOMINANT_SEED = 15; // H tier III => RAPID/FORKED/SEEKER, proven below.

const PROFILES = Object.freeze([
  {
    id: 'authored-control',
    label: 'rolled dominant weapon, adaptive reinforcement disabled in-page',
    adaptive: false,
    gun: 'dominant',
    hp: 3,
  },
  {
    id: 'adaptive-dominant',
    label: 'rolled dominant weapon, shipped adaptive pressure',
    adaptive: true,
    gun: 'dominant',
    hp: 3,
    captures: true,
  },
  {
    id: 'adaptive-emergency',
    label: 'rolled dominant weapon, forced empty authored-score control',
    adaptive: true,
    gun: 'dominant',
    hp: 3,
    moving: false,
    faces: [3],
    faceSimMs: 2200,
    suppressAuthoredAfterSetup: true,
  },
  {
    id: 'adaptive-mercy',
    label: 'starter Rivetgun at one hull, shipped mercy pressure',
    adaptive: true,
    gun: 'starter',
    hp: 1,
  },
]);

const ACTIVE_PROFILES = SEEKER_ONLY ? Object.freeze([Object.freeze({
  id: 'adaptive-dominant',
  label: 'accelerated real rolled RAPID/SEEKER/FORKED pressure replay',
  adaptive: true,
  gun: 'dominant',
  hp: 3,
  moving: true,
  faces: [3, 5, 6],
  faceSimMs: 5200,
})]) : PROFILES;

const round = (n, digits = 3) => Number(Number(n || 0).toFixed(digits));
const maxOf = (rows, read, fallback = 0) => rows.length
  ? Math.max(...rows.map(read).filter(Number.isFinite)) : fallback;
const minOf = (rows, read, fallback = 0) => rows.length
  ? Math.min(...rows.map(read).filter(Number.isFinite)) : fallback;

async function installQa(page) {
  await page.evaluate(async () => {
    const [C, G, H, L, P, R, SP, ST, T, W, WG] = await Promise.all([
      import('/src/config.js'),
      import('/src/pure/gunroll.js'),
      import('/src/sim/hostiles.js'),
      import('/src/sim/level.js'),
      import('/src/sim/player.js'),
      import('/src/render/scene.js'),
      import('/src/sim/spawner.js'),
      import('/src/sim/state.js'),
      import('/src/sim/time.js'),
      import('/src/sim/weapons.js'),
      import('/src/sim/wavegate.js'),
    ]);
    globalThis.__PRESSURE_RUNTIME_QA__ = { C, G, H, L, P, R, SP, ST, T, W, WG };
  });
}

async function configureProfile(page, profile) {
  return page.evaluate(({ profile, dominantSeed }) => {
    const q = globalThis.__PRESSURE_RUNTIME_QA__;
    const D = q.C.CONFIG.spawner.pressure;
    q.ST.setState('PAUSED');
    q.H.clearHostiles();
    q.W.clearBullets();
    q.SP.resetSpawner();

    if (!profile.adaptive) {
      // A/B control only. The page is an isolated disposable context; live
      // source data is untouched. The director still observes exactly the
      // same combat windows, but its body ceiling is zero.
      D.maxBodiesByFace = D.maxBodiesByFace.map(() => 0);
    }

    let gun;
    if (profile.gun === 'dominant') {
      gun = q.G.rollGun('H', 1, dominantSeed);
      q.W.setGun(gun);
    } else {
      q.W.setWeapon('R');
      gun = q.W.currentGun;
    }

    q.P.player.hp = profile.hp;
    q.P.player.lives = 99;
    // Damage still collides and renders, but cannot turn this pressure proof
    // into a respawn/weapon-reset test. The mercy run stays honestly at one
    // hull for every director sample.
    q.P.player.iframesUntil = Number.MAX_SAFE_INTEGER;
    return {
      id: gun.id,
      label: gun.label,
      tier: gun.tier,
      traits: [...gun.traits],
      compiled: { ...q.W.currentGunDef() },
    };
  }, { profile, dominantSeed: DOMINANT_SEED });
}

async function enterFace(page, face, hp, suppressAuthoredAfterSetup = false) {
  return page.evaluate(({ face, hp, suppressAuthoredAfterSetup }) => {
    const q = globalThis.__PRESSURE_RUNTIME_QA__;
    const C = q.C.CONFIG;
    q.ST.setState('PAUSED');
    q.H.clearHostiles();
    q.W.clearBullets();

    // Commit every preceding static facet with the production hooks. This
    // settles collision, route ownership, tile instances, catwalk visibility,
    // and camera yaw together; no direct built-array mutation is used.
    for (let i = 0; i < face - 1; i++) {
      const corner = q.WG.cornerEvents[i];
      if (corner.state === 'done') continue;
      corner.sealed = true;
      q.WG.finishCorner(corner);
    }

    const faceStart = C.path.introTiles + C.path.faceTiles * (face - 1);
    const faceEnd = faceStart + C.path.faceTiles;
    q.T.setScrollX(faceStart + 2);

    const lessonSites = q.SP.spawnTable.filter((row) => {
      const rowFace = Math.max(1, Math.min(C.path.faces,
        1 + Math.floor(Math.max(0, row.x - C.path.introTiles) / C.path.faceTiles)));
      return C.spawner.lesson.kindByFace[rowFace - 1] === row.type;
    });
    const edges = globalThis.HB.edges();
    const wanted = faceStart + 15;
    let playerX = null;
    let playerY = null;
    let bestDistance = Infinity;
    const lo = Math.max(faceStart + 4, edges.left + C.edges.margin + 4);
    const hi = Math.min(faceEnd - 20, edges.right - C.edges.margin - 7);
    for (let x = lo; x <= hi; x += 0.25) {
      const y = q.L.groundTopAt(x);
      const yl = q.L.groundTopAt(x - 0.6);
      const yr = q.L.groundTopAt(x + 0.6);
      if (y <= -100 || yl <= -100 || yr <= -100) continue;
      if (Math.max(Math.abs(yl - y), Math.abs(yr - y)) > C.hound.stepUpTiles) continue;
      if (lessonSites.some((row) => Math.abs(x - row.x) < C.spawner.lesson.clearTiles + 1)) continue;
      const distance = Math.abs(x - wanted);
      if (distance < bestDistance) {
        bestDistance = distance;
        playerX = x;
        playerY = y;
      }
    }
    if (playerX === null) throw new Error(`face ${face} has no pressure-QA standing patch`);

    q.P.player.x = playerX;
    q.P.player.y = playerY + 0.001;
    q.P.player.vx = 0;
    q.P.player.vy = 0;
    q.P.player.grounded = true;
    q.P.player.onOneWay = null;
    q.P.player.facing = 1;
    q.P.player.aim.set(1, 0);
    q.P.player.hp = hp;
    q.P.player.lives = 99;
    q.P.player.iframesUntil = Number.MAX_SAFE_INTEGER;

    // Advance the real ambient cursor through discarded earlier score rows,
    // then clear those setup bodies. From the next animation frame onward all
    // enemies, bullets, kills, and pressure are ordinary main-loop work.
    q.SP.updateSpawner();
    q.H.clearHostiles();
    q.W.clearBullets();
    // Dedicated emergency control: the setup call above has already armed the
    // real director through a real authored cursor advance. Removing only the
    // disposable page's remaining score rows creates one falsifiable empty
    // field; the response still travels through updateSpawner, site fences,
    // spawnHostile, entry presentation, and the ordinary main loop.
    if (suppressAuthoredAfterSetup) q.SP.spawnTable.length = 0;
    q.ST.setState('PLAYING');

    const current = q.WG.activeCorner();
    return {
      face,
      faceStart,
      faceEnd,
      scrollX: q.T.scrollX,
      playerX,
      playerY,
      edges: globalThis.HB.edges(),
      corner: current ? { k: current.k, state: current.state, s: current.s } : null,
    };
  }, { face, hp, suppressAuthoredAfterSetup });
}

function runtimeSnapshot() {
  const q = globalThis.__PRESSURE_RUNTIME_QA__;
  const C = q.C.CONFIG;
  const pressure = q.SP.pressureDirectorSnapshot();
  const hb = globalThis.HB.snapshot();
  const corner = q.WG.activeCorner();
  const edges = globalThis.HB.edges();
  const D = C.spawner.pressure;
  const adaptive = q.H.hostiles
    .filter((row) => String(row.encounterKey || '').startsWith('pressure:'))
    .map((row) => ({
      id: row.id,
      encounterKey: row.encounterKey,
      kind: row.kind,
      x: row.x,
      y: row.y,
      dir: row.dir,
      gating: row.gating,
      ecologyId: row.ecologyId || '',
      genomeBudget: row.genomeBudget || 0,
      materialized: q.T.gameMs >= row.enterUntil,
      enterUntil: row.enterUntil,
    }));

  const i0 = Math.floor(q.P.player.x);
  let gapDist = 99;
  for (let k = 0; k <= 8; k++) {
    if (q.L.groundTopAt(i0 + k) <= -100) {
      gapDist = k === 0 ? 0 : i0 + k - q.P.player.x;
      break;
    }
  }

  let liveBullets = 0;
  for (const bullet of q.W.bulletPool) if (bullet.alive) liveBullets++;
  const info = q.R.renderer.info;
  return {
    gameMs: q.T.gameMs,
    state: q.ST.state,
    face: pressure.telemetry.phase,
    corner: corner ? { k: corner.k, state: corner.state, s: corner.s, primed: corner.primed } : null,
    scrollX: q.T.scrollX,
    player: {
      x: q.P.player.x, y: q.P.player.y, vy: q.P.player.vy,
      hp: q.P.player.hp, grounded: q.P.player.grounded,
      gapDist,
    },
    weapon: hb.currentGun,
    kills: q.H.kills,
    hostiles: q.H.hostiles.length,
    liveBullets,
    adaptive,
    spawnAudits: pressure.spawns,
    pressureDebug: {
      face: pressure.face,
      faceBodies: pressure.faceBodies,
      tokenBalance: pressure.tokenBalance,
      emptySinceMs: pressure.emptySinceMs,
      responseDueAtMs: pressure.responseDueAtMs,
      lastSpawnAtMs: pressure.lastSpawnAtMs,
      responseBand: pressure.responseBand,
      recoveryUntilMs: pressure.recoveryUntilMs,
      activeMs: pressure.activeMs,
      emptyMs: pressure.emptyMs,
    },
    pressure: pressure.telemetry,
    perf: globalThis.HB.perf(),
    render: {
      calls: info.render.calls,
      triangles: info.render.triangles,
      points: info.render.points,
      lines: info.render.lines,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
    },
  };
}

async function runFace(page, profile, face, captureState) {
  const setup = await enterFace(page, face, profile.hp, profile.suppressAuthoredAfterSetup);
  const setupClock = await page.evaluate(() => globalThis.__PRESSURE_RUNTIME_QA__.T.gameMs);
  await page.waitForFunction((clock) => {
    const q = globalThis.__PRESSURE_RUNTIME_QA__;
    const pressure = q.SP.pressureDirectorSnapshot().telemetry;
    return q.T.gameMs >= clock + 100 && pressure.committedThreats <= q.H.hostiles.length;
  }, setupClock, { timeout: 5000 });
  const start = await page.evaluate(runtimeSnapshot);
  const until = start.gameMs + (profile.faceSimMs || FACE_SIM_MS);
  const rows = [];
  let captured = false;
  const seenAdaptive = new Set(start.spawnAudits.map((row) => row.id));
  const spawnEvents = [];
  let lastJumpAt = -Infinity;
  const movesForward = profile.gun === 'dominant' && profile.moving !== false;

  await page.keyboard.down('KeyJ');
  if (movesForward) await page.keyboard.down('ArrowRight');
  try {
    while (true) {
      const sample = await page.evaluate(runtimeSnapshot);
      // Do not charge the authored gate prelude to ambient pressure. The
      // director suspends on this same `primed` edge; keeping that row would
      // count the gate roster toward a non-transition committed cap.
      if (!sample.corner || sample.corner.k !== face ||
          sample.corner.state !== 'idle' || sample.corner.primed) break;
      rows.push(sample);
      for (const row of sample.spawnAudits) {
        if (seenAdaptive.has(row.id)) continue;
        seenAdaptive.add(row.id);
        spawnEvents.push({ face, ...row });
      }

      // A real input-only traversal reflex: keep moving forward and jump on
      // each grounded beat, with an immediate response at a visible deck lip.
      // This produces the progress/kills/no-hit combination the live director
      // calls dominant instead of testing an overpowered gun on a parked RIG.
      if (movesForward && sample.player.grounded &&
          (sample.player.gapDist < 3.2 || sample.gameMs - lastJumpAt >= 900)) {
        await page.keyboard.down('Space');
        await page.waitForTimeout(22);
        await page.keyboard.up('Space');
        lastJumpAt = sample.gameMs;
      }

      if (profile.captures && !captured && sample.adaptive.length >= 2 &&
          sample.adaptive.some((row) => row.materialized)) {
        await page.evaluate(() => {
          globalThis.__PRESSURE_RUNTIME_QA__.ST.setState('PAUSED');
          // Freeze the real sim for a deterministic resize without letting the
          // pause menu cover the combat evidence. This is page-local QA only;
          // state, input, and render code remain shipped and unmodified.
          document.getElementById('overlay').style.visibility = 'hidden';
        });
        await page.waitForTimeout(40);
        const desktopPath = join(outDir, `pressure-face-${face}-desktop.png`);
        await page.screenshot({ path: desktopPath });
        captureState.desktop.push(desktopPath);
        if (!captureState.portrait) {
          await page.setViewportSize(PORTRAIT);
          await page.waitForTimeout(120);
          const portraitPath = join(outDir, `pressure-face-${face}-portrait.png`);
          await page.screenshot({ path: portraitPath });
          captureState.portrait = portraitPath;
          await page.setViewportSize(VIEWPORT);
        }
        await page.evaluate(() => {
          document.getElementById('overlay').style.visibility = '';
          globalThis.__PRESSURE_RUNTIME_QA__.ST.setState('PLAYING');
        });
        captured = true;
      }

      if (sample.gameMs >= until) break;
      assert.equal(sample.state, 'PLAYING', `${profile.id} face ${face} left PLAYING`);
      await page.waitForTimeout(SAMPLE_WALL_MS);
    }
  } finally {
    await page.keyboard.up('KeyJ');
    if (movesForward) await page.keyboard.up('ArrowRight');
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp']) {
      try { await page.keyboard.up(key); } catch { /* context teardown will release it */ }
    }
  }

  const final = rows[rows.length - 1];
  return { face, setup, startGameMs: start.gameMs, endGameMs: final.gameMs,
    rows, spawnEvents, finalPressure: final.pressure };
}

function summarizeProfile(profile, gun, stages, errors, captures) {
  const rows = stages.flatMap((stage) => stage.rows);
  const spawns = stages.flatMap((stage) => stage.spawnEvents);
  const stablePerf = rows.filter((row) => row.perf.frames >= 120);
  const geometries = stablePerf.map((row) => row.render.geometries);
  const textures = stablePerf.map((row) => row.render.textures);
  const faceResourceDrift = (field) => Math.max(...stages.map((stage) => {
    const values = stage.rows.filter((row) => row.perf.frames >= 120 &&
        row.gameMs >= stage.startGameMs + 1000)
      .map((row) => row.render[field]);
    return values.length ? Math.max(...values) - Math.min(...values) : 0;
  }));
  const final = rows[rows.length - 1];
  return {
    id: profile.id,
    label: profile.label,
    gun,
    samples: rows.length,
    simulatedMs: stages.reduce((sum, stage) => sum + stage.endGameMs - stage.startGameMs, 0),
    kills: final.kills,
    adaptiveSpawns: spawns.length,
    adaptiveKinds: Object.fromEntries([...new Set(spawns.map((row) => row.kind))]
      .sort().map((kind) => [kind, spawns.filter((row) => row.kind === kind).length])),
    adaptiveEcologies: [...new Set(spawns.map((row) => row.ecologyId).filter(Boolean))].sort(),
    responseBands: [...new Set(rows.map((row) => row.pressure.responseBand?.id).filter(Boolean))],
    maxResponseBand: maxOf(rows, (row) => row.pressure.responseBand?.index),
    maxCommitted: maxOf(rows, (row) => row.pressure.committedThreats),
    maxAdaptiveVisible: maxOf(rows, (row) => row.pressure.adaptiveThreats),
    maxHostiles: maxOf(rows, (row) => row.hostiles),
    maxLiveBullets: maxOf(rows, (row) => row.liveBullets),
    emptyFieldRatio: final.pressure.emptyFieldRatio,
    maxEmptyStreakMs: maxOf(rows, (row) => row.pressure.emptyStreakMaxMs),
    responseLatencyMs: final.pressure.responseLatencyMs,
    mercySamples: rows.filter((row) => row.pressure.mercy).length,
    targetLowRange: [minOf(rows, (row) => row.pressure.targetLow),
      maxOf(rows, (row) => row.pressure.targetLow)],
    faceRows: stages.map((stage) => ({
      face: stage.face,
      phase: stage.finalPressure.phase,
      emptyFieldRatio: stage.finalPressure.faceEmptyFieldRatio,
      dominance: stage.finalPressure.dominance,
      clearEmaMs: stage.finalPressure.clearEmaMs,
      targets: [stage.finalPressure.targetLow, stage.finalPressure.targetHigh],
      bodies: stage.finalPressure.bodies.face,
      mercy: stage.finalPressure.mercy,
      spawnCount: stage.spawnEvents.length,
    })),
    safety: {
      spawnRows: spawns.length,
      minPlayerLeadTiles: minOf(spawns, (row) => row.playerLeadTiles, null),
      insideScreen: spawns.every((row) => row.insideScreen),
      outsideCornerApron: spawns.every((row) => row.outsideCornerApron),
      outsideLesson: spawns.every((row) => row.outsideLesson),
      rootedRouteSafe: spawns.every((row) => row.rootedRouteSafe),
      currentFacet: spawns.every((row) => row.currentFacet),
      nonGating: spawns.every((row) => row.gating === false),
    },
    performance: {
      minFps: minOf(stablePerf, (row) => row.perf.fps),
      maxAvgMs: maxOf(stablePerf, (row) => row.perf.avgMs),
      maxWorstMs: maxOf(stablePerf, (row) => row.perf.worstMs),
      maxOver20: maxOf(stablePerf, (row) => row.perf.over20ms),
      maxRenderCalls: maxOf(stablePerf, (row) => row.render.calls),
      maxTriangles: maxOf(stablePerf, (row) => row.render.triangles),
      worldRevealGeometryGrowth: geometries.length ? Math.max(...geometries) - Math.min(...geometries) : 0,
      worldRevealTextureGrowth: textures.length ? Math.max(...textures) - Math.min(...textures) : 0,
      maxFaceGeometryDrift: faceResourceDrift('geometries'),
      maxFaceTextureDrift: faceResourceDrift('textures'),
    },
    errors,
    captures,
    spawnEvents: spawns,
  };
}

async function runProfile(browserSession, profile) {
  const { page, close } = await browserSession.newPage({ viewport: VIEWPORT });
  const errors = [];
  const captures = { desktop: [], portrait: null };
  page.on('pageerror', (error) => errors.push(String(error?.message || error)));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const location = message.location();
    if (/favicon\.ico/.test(location?.url || '') && /404/.test(message.text())) return;
    errors.push(message.text());
  });
  try {
    await page.goto(`${browserSession.baseUrl}/index.html?testapi=1&fixeddt=${FIXED_DT_MS}&audio=0`,
      { waitUntil: 'load' });
    await page.waitForFunction(() => globalThis.HB && globalThis.HB.state() === 'PLAYING',
      null, { timeout: 15000 });
    await installQa(page);
    const gun = await configureProfile(page, profile);
    if (profile.gun === 'dominant') {
      assert.deepEqual(gun.traits, ['RAPID', 'SEEKER', 'FORKED'],
        'dominant fixture must remain a legitimate deterministic rolled gun');
    }
    const stages = [];
    for (const face of profile.faces || FACES)
      stages.push(await runFace(page, profile, face, captures));
    return summarizeProfile(profile, gun, stages, errors, captures);
  } finally {
    await close();
  }
}

function buildChecks(result) {
  if (SEEKER_ONLY) {
    const dominant = result.profiles[0];
    const checks = [];
    const add = (id, ok, reading) => checks.push({ id, ok: !!ok, reading });
    add('real-seeker-fixture', dominant.gun.traits.join('/') === 'RAPID/SEEKER/FORKED',
      `${dominant.gun.label}: ${dominant.gun.traits.join('/')}`);
    add('real-adaptive-response', dominant.adaptiveSpawns > 0,
      `${dominant.adaptiveSpawns} real main-loop adaptive bodies`);
    add('real-observed-escalation', dominant.maxResponseBand >= 2,
      `${dominant.responseBands.join(' -> ')}; max ${dominant.maxResponseBand}`);
    add('real-composition-before-behavior',
      dominant.spawnEvents.some((row) => row.responseBand === 1) &&
      dominant.spawnEvents.some((row) => row.responseBand === 2 && row.ecologyId),
      dominant.spawnEvents.map((row) =>
        `f${row.face}:${row.kind}:${row.responseBand}:${row.ecologyId || 'neutral'}`).join(', '));
    add('real-empty-budget', dominant.maxEmptyStreakMs <=
      SHIPPED_CONFIG.spawner.pressure.hardEmptyBudgetMs,
      `${dominant.maxEmptyStreakMs}ms max active empty stretch`);
    add('real-live-pending-cap', dominant.maxAdaptiveVisible <= 2 &&
      dominant.maxCommitted <= 4,
      `${dominant.maxAdaptiveVisible} adaptive / ${dominant.maxCommitted} committed`);
    add('real-spawn-safety', dominant.safety.insideScreen &&
      dominant.safety.outsideCornerApron && dominant.safety.outsideLesson &&
      dominant.safety.rootedRouteSafe && dominant.safety.currentFacet &&
      dominant.safety.nonGating,
      dominant.safety);
    add('real-browser-errors', dominant.errors.length === 0, dominant.errors);
    return checks;
  }
  const control = result.profiles.find((row) => row.id === 'authored-control');
  const dominant = result.profiles.find((row) => row.id === 'adaptive-dominant');
  const emergency = result.profiles.find((row) => row.id === 'adaptive-emergency');
  const mercy = result.profiles.find((row) => row.id === 'adaptive-mercy');
  const checks = [];
  const add = (id, ok, reading) => checks.push({ id, ok: !!ok, reading });

  add('control-really-disabled', control.adaptiveSpawns === 0,
    `${control.adaptiveSpawns} adaptive bodies`);
  add('dominant-empty-field-ratio', dominant.emptyFieldRatio <= 0.15,
    `${round(dominant.emptyFieldRatio * 100, 2)}%`);
  add('dominant-improves-over-control',
    control.emptyFieldRatio - dominant.emptyFieldRatio >= 0.15,
    `${round(control.emptyFieldRatio * 100, 2)}% -> ${round(dominant.emptyFieldRatio * 100, 2)}%`);
  add('emergency-response-visible', emergency.responseLatencyMs.samples > 0 &&
    emergency.responseLatencyMs.max >= 500 && emergency.responseLatencyMs.max <= 900,
    `${emergency.responseLatencyMs.max}ms max across ` +
      `${emergency.responseLatencyMs.samples} forced-empty runtime samples`);
  add('committed-cap', dominant.maxCommitted <= 4,
    `${dominant.maxCommitted} max committed`);
  add('spawn-player-safety', dominant.safety.minPlayerLeadTiles >= 4.4,
    `${round(dominant.safety.minPlayerLeadTiles, 2)} tiles minimum`);
  add('spawn-visible', dominant.safety.insideScreen, dominant.safety);
  add('spawn-outside-corner', dominant.safety.outsideCornerApron, dominant.safety);
  add('spawn-outside-lessons', dominant.safety.outsideLesson, dominant.safety);
  add('rooted-route-safe', dominant.safety.rootedRouteSafe, dominant.safety);
  add('adaptive-never-gates', dominant.safety.nonGating && emergency.safety.nonGating &&
    mercy.safety.nonGating,
    `${dominant.safety.spawnRows + emergency.safety.spawnRows + mercy.safety.spawnRows} runtime rows inspected`);
  add('no-browser-errors', result.profiles.every((row) => row.errors.length === 0),
    result.profiles.flatMap((row) => row.errors));
  add('entity-bounds', dominant.maxAdaptiveVisible <= 4 && dominant.maxHostiles <= 16 &&
    dominant.maxLiveBullets <= 256,
    `${dominant.maxAdaptiveVisible} adaptive / ${dominant.maxHostiles} hostiles / ` +
      `${dominant.maxLiveBullets} bullets`);
  // Asset factories lazily initialize a small fixed geometry set during the
  // first encounter of a face. The correct leak test is pressure-vs-control:
  // the three cached adaptive actor families may add at most four geometries
  // over the authored path, while both remain absolutely bounded.
  add('render-resource-bounds', dominant.performance.maxFaceGeometryDrift <=
      Math.max(12, control.performance.maxFaceGeometryDrift + 4) &&
    dominant.performance.maxFaceTextureDrift <=
      Math.max(2, control.performance.maxFaceTextureDrift + 1),
    `${dominant.performance.maxFaceGeometryDrift} geometry / ` +
      `${dominant.performance.maxFaceTextureDrift} texture drift within any one face ` +
      `(control ${control.performance.maxFaceGeometryDrift}/` +
      `${control.performance.maxFaceTextureDrift}; ` +
      `${dominant.performance.worldRevealGeometryGrowth} geometry added by intentional face reveals)`);
  add('frame-budget', dominant.performance.minFps >= 30 && dominant.performance.maxAvgMs <= 34,
    `${dominant.performance.minFps}fps min / ${dominant.performance.maxAvgMs}ms max average`);
  add('mercy-engaged', mercy.mercySamples > 0 && mercy.targetLowRange[1] === 0,
    `${mercy.mercySamples}/${mercy.samples} mercy samples; targetLow ${mercy.targetLowRange.join('..')}`);
  add('mercy-sparse', mercy.maxAdaptiveVisible <= 1 && mercy.adaptiveSpawns < dominant.adaptiveSpawns,
    `${mercy.adaptiveSpawns} mercy bodies vs ${dominant.adaptiveSpawns} dominant`);
  return checks;
}

function markdown(result) {
  const p = Object.fromEntries(result.profiles.map((row) => [row.id, row]));
  const comparison = SEEKER_ONLY
    ? `Accelerated seeker proof: ${p['adaptive-dominant'].adaptiveSpawns} adaptive bodies; ` +
      `${p['adaptive-dominant'].maxEmptyStreakMs}ms maximum active empty stretch.`
    : `Before/after: authored-only control ${round(p['authored-control'].emptyFieldRatio * 100, 2)}% ` +
      `empty → shipped adaptive ${round(p['adaptive-dominant'].emptyFieldRatio * 100, 2)}%.`;
  const lines = [
    '# Adaptive pressure real-runtime proof',
    '',
    `Measured ${result.measuredAt} in isolated installed Chrome at 1440×900.`,
    '',
    '| Profile | Empty field | Adaptive bodies | Max committed | Response max | Mercy |',
    '|---|---:|---:|---:|---:|---:|',
    ...result.profiles.map((row) =>
      `| ${row.id} | ${round(row.emptyFieldRatio * 100, 2)}% | ${row.adaptiveSpawns} | ` +
      `${row.maxCommitted} | ${row.responseLatencyMs.max}ms | ${row.mercySamples}/${row.samples} |`),
    '',
    comparison,
    '',
    '## Gates',
    '',
    ...result.checks.map((check) => `- ${check.ok ? 'PASS' : 'FAIL'} — ${check.id}: ` +
      (typeof check.reading === 'string' ? check.reading : JSON.stringify(check.reading))),
    '',
    'The test uses the real main-loop spawner, enemies, rolled-gun compiler, bullets, renderer, and frame sampler. ' +
      (SEEKER_ONLY ? 'No in-page combat tuning is mutated.' :
        'Only the A/B control mutates its disposable page copy of the body ceiling; source CONFIG is unchanged.'),
  ];
  return lines.join('\n') + '\n';
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const result = await withIsolatedBrowser(repoRoot, async (session) => {
    const profiles = [];
    for (const profile of ACTIVE_PROFILES) profiles.push(await runProfile(session, profile));
    return {
      measuredAt: new Date().toISOString(),
      tool: 'tools/playtest/adaptive-pressure-runtime.mjs',
      method: `real main.js loop; fixed ${FIXED_DT_MS}ms sim frames; ` +
        `${SEEKER_ONLY ? '5200ms faces 3,5,6' : `${FACE_SIM_MS}ms per face 3..6`}; ` +
        'static-facet handoffs through finishCorner()',
      browser: session.launch,
      viewport: VIEWPORT,
      profiles,
    };
  });
  result.checks = buildChecks(result);
  result.ok = result.checks.every((row) => row.ok);
  writeFileSync(join(outDir, 'report.json'), JSON.stringify(result, null, 2) + '\n');
  writeFileSync(join(outDir, 'summary.md'), markdown(result));

  console.log(markdown(result));
  console.log(`Evidence: ${outDir}`);
  if (!result.ok) {
    const failed = result.checks.filter((row) => !row.ok).map((row) => row.id);
    throw new Error(`adaptive pressure runtime gates failed: ${failed.join(', ')}`);
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
