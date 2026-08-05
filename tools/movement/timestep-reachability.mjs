#!/usr/bin/env node
// T-060: compare Level 1 route reachability at fixed 120/60/30 Hz steps.
// Terrain-only by design: hostiles are removed as soon as they spawn so this
// answers integration/reachability, not combat policy quality.

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const STEPS_MS = [8.333, 16.667, 33.333];

async function childRun(stepMs) {
  globalThis.__HB_QUERY__ = 'enemies=0';
  const base = new URL('../../src/', import.meta.url);
  const load = (path) => import(new URL(path, base));
  const [T, E, LV, SC, PL, IN, ST, HO, WP, SP, WG, CA] = await Promise.all([
    load('sim/time.js'), load('sim/edges.js'), load('sim/level.js'),
    load('sim/scroll.js'), load('sim/player.js'), load('sim/input.js'),
    load('sim/state.js'), load('sim/hostiles.js'), load('sim/weapons.js'),
    load('sim/spawner.js'), load('sim/wavegate.js'), load('sim/capsules.js'),
  ]);
  E.setEdges(-18.9, 26.4);
  LV.unbuildFutureFaces();
  ST.setState('PLAYING');
  const p = PL.player;
  p.x = 6; p.y = 3;
  IN.keys.right = true;
  const dt = stepMs / 1000;
  let jumpUntil = 0, maxX = 0, falling = false;
  const falls = [], verbs = { jumps: 0, airJumps: 0, ledgeLaunches: 0, wallLaunches: 0 };
  const gapsCrossed = new Set();
  const authoredGaps = [];
  for (let x = 0; x < LV.groundH.length; x++) {
    if (LV.groundH[x] > -100) continue;
    const x0 = x;
    while (x + 1 < LV.groundH.length && LV.groundH[x + 1] < -100) x++;
    authoredGaps.push({ x0, x1: x + 1 });
  }
  for (const pocket of LV.pockets)
    CA.spawnCapsule(pocket.reward.kind, pocket.reward.letter,
      pocket.reward.x, pocket.reward.y, pocket.reward.mode);

  for (let frame = 0; frame < 24000; frame++) {
    const ahead = LV.groundTopAt(p.x + 1.2);
    const lip = ahead < -100 || ahead > p.y + 0.6;
    const contact = p.traversalState;
    let press = false;
    if (contact === 'wall' || contact === 'ledge') {
      press = true;
      verbs[contact === 'wall' ? 'wallLaunches' : 'ledgeLaunches']++;
    } else if (p.grounded && lip) {
      press = true;
      verbs.jumps++;
    } else if (!p.grounded && p.vy < -6 && lip && p.airJumpsLeft > 0) {
      press = true;
      verbs.airJumps++;
    }
    if (press) {
      IN.bufferJumpUntil(T.gameMs + 120);
      IN.keys.jump = true;
      jumpUntil = T.gameMs + 420;
    }
    if (T.gameMs > jumpUntil) IN.keys.jump = false;

    T.advanceGameMs(stepMs);
    SC.updateScroll(dt);
    PL.updatePlayer(dt);
    maxX = Math.max(maxX, p.x);
    for (let i = 0; i < authoredGaps.length; i++)
      if (p.x >= authoredGaps[i].x1) gapsCrossed.add(i);
    if (p.y < -6 && !falling) { falls.push(p.x); falling = true; }
    if (p.y > 0) falling = false;
    while (HO.hostiles.length) HO.removeHostile(0, false);
    HO.updateHostiles(dt);
    WP.updateBullets(dt);
    CA.updateCapsules(dt);
    if (ST.state !== 'PLAYING' || T.scrollX >= LV.activeScrollEnd()) break;
  }
  return {
    stepMs, effectiveHz: +(1000 / stepMs).toFixed(1), state: ST.state,
    scrollX: +T.scrollX.toFixed(3), end: LV.activeScrollEnd(),
    maxX: +maxX.toFixed(3), lives: p.lives, falls: falls.map((x) => +x.toFixed(3)),
    final: { x: +p.x.toFixed(3), y: +p.y.toFixed(3),
      vx: +p.vx.toFixed(3), vy: +p.vy.toFixed(3), grounded: p.grounded,
      traversalState: p.traversalState },
    gapsDeclared: authoredGaps.length, gapsCrossed: gapsCrossed.size,
    pocketsDeclared: LV.pockets.length, rewardsCollected: LV.pockets.length - CA.capsules.length,
    verbs,
    reachedEnd: T.scrollX >= LV.activeScrollEnd() &&
      (ST.state === 'PLAYING' || ST.state === 'VICTORY'),
  };
}

if (process.argv[2] === '--child') {
  console.log(JSON.stringify(await childRun(Number(process.argv[3]))));
} else {
  const runs = STEPS_MS.map((step) => JSON.parse(execFileSync(process.execPath,
    [new URL(import.meta.url).pathname, '--child', String(step)], {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    })));
  const baseline = runs[0];
  const closes = runs.filter((run) => baseline.reachedEnd && !run.reachedEnd)
    .map((run) => run.stepMs);
  const report = {
    tool: 'tools/movement/timestep-reachability.mjs',
    runs,
    finding: closes.length
      ? `route closes at fixed steps ${closes.join(', ')}ms`
      : 'no Level 1 end-to-end route closure at 60Hz or 30Hz versus 120Hz',
  };
  console.log(JSON.stringify(report, null, 2));
  if (closes.length || runs.some((run) => !run.reachedEnd)) process.exitCode = 1;
}
