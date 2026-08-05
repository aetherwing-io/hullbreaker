/* Mandatory actual-sim proof for the moving gate prelude.  Each scenario runs
   in a fresh child because the sim layer deliberately owns module singletons. */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ok } from './_context.mjs';

export const title = 'gate rosters materialize during the moving prelude';

const srcDir = fileURLToPath(new URL('../../src/', import.meta.url));

function runScenario(name, body, cornerIndex = 0) {
  const child = `
    globalThis.__HB_QUERY__ = '?momentum=0&score=0&juice=0';
    const base = ${JSON.stringify(srcDir)};
    const url = (path) => new URL(path, 'file://' + base).href;
    const [CFG, PATH, WAVES, EDGES, TIME, GATE, SCROLL, HOSTILES, LEVEL] =
      await Promise.all([
        import(url('config.js')),
        import(url('pure/path.js')),
        import(url('pure/waves.js')),
        import(url('sim/edges.js')),
        import(url('sim/time.js')),
        import(url('sim/wavegate.js')),
        import(url('sim/scroll.js')),
        import(url('sim/hostiles.js')),
        import(url('sim/level.js')),
      ]);
    EDGES.setEdges(-18.9, 26.4);
    HOSTILES.clearHostiles();
    GATE.resetCornerEvents();
    TIME.setScrollX(0);
    const selectedCorner = ${cornerIndex};
    for (let i = 0; i < selectedCorner; i++) GATE.cornerEvents[i].state = 'done';
    const c = GATE.cornerEvents[selectedCorner];
    const halt = PATH.HALT_S[selectedCorner];
    ${body}
  `;
  try {
    return JSON.parse(execFileSync(
      process.execPath,
      ['--input-type=module', '-e', child],
      { encoding: 'utf8' },
    ));
  } catch (error) {
    throw new Error(`${name}: actual-sim child failed\n${error.stderr || error.message}`);
  }
}

export async function run() {
const threshold = runScenario('threshold and survivors', `
  TIME.setScrollX(halt - WAVES.GATE_PRELUDE_TILES - 0.001);
  SCROLL.updateScroll(0);
  const before = { primed: c.primed, bodies: HOSTILES.hostiles.length };

  TIME.setScrollX(halt - WAVES.GATE_PRELUDE_TILES);
  SCROLL.updateScroll(0);
  const expected = WAVES.waveSize(c.k, CFG.CONFIG);
  const primed = {
    state: c.state,
    busy: GATE.cornerBusy(),
    at: c.primedAtS,
    bodies: HOSTILES.hostiles.length,
    encounterKeys: [...new Set(HOSTILES.hostiles.map((e) => e.encounterKey))],
    attackDelays: HOSTILES.hostiles.map((e) => e.attackReadyDelayMs),
  };

  // One prelude kill stays dead: the halt promotes survivors and never
  // silently respawns the old authored roster.
  HOSTILES.removeHostile(HOSTILES.hostiles.length - 1, false);
  TIME.setScrollX(halt);
  SCROLL.updateScroll(0);
  const atHalt = {
    state: c.state,
    bodies: HOSTILES.hostiles.length,
    startedGateBody: HOSTILES.hostiles.some((e) => e.gating &&
      TIME.gameMs >= e.enterUntil - CFG.CONFIG.wasp.enterMs),
  };
  console.log(JSON.stringify({ before, expected, primed, atHalt, halt,
    prelude: WAVES.GATE_PRELUDE_TILES }));
`);

ok(JSON.stringify(threshold.before) === JSON.stringify({ primed: false, bodies: 0 }),
  'the roster does not exist before the authored moving-prelude threshold');
ok(threshold.primed.state === 'idle',
  'priming is a flag, not a corner state');
ok(threshold.primed.busy === false,
  'priming does not hold the scrolling pursuit plane');
ok(threshold.primed.at === threshold.halt - threshold.prelude,
  'the authored gate roster is pre-positioned at the declared prelude distance');
ok(threshold.primed.bodies === threshold.expected,
  'priming creates the complete existing authored roster once');
ok(JSON.stringify(threshold.primed.encounterKeys) === JSON.stringify(['gate:1']),
  'every prelude body stores its stable encounter key');
ok(JSON.stringify(threshold.primed.attackDelays) === JSON.stringify([0, 180, 420, 0]),
  'attack readiness follows the authored three-beat cohort score');
ok(threshold.atHalt.state === 'gate',
  'survivors own the ordinary gate at the halt');
ok(threshold.atHalt.bodies === threshold.expected - 1,
  'a prelude kill is not repopulated at the halt');
ok(threshold.atHalt.startedGateBody === true,
  'gate state always has a visible or entering gating body');

const earlyClear = runScenario('early clear', `
  TIME.setScrollX(halt - WAVES.GATE_PRELUDE_TILES);
  SCROLL.updateScroll(0);
  for (let i = HOSTILES.hostiles.length - 1; i >= 0; i--)
    if (HOSTILES.hostiles[i].gating) HOSTILES.removeHostile(i, false);
  TIME.setScrollX(halt);
  SCROLL.updateScroll(0);
  console.log(JSON.stringify({
    state: c.state,
    gating: HOSTILES.hostiles.filter((e) => e.gating && !e.gateBreakExit).length,
  }));
`);

ok(JSON.stringify(earlyClear) === JSON.stringify({ state: 'approach', gating: 0 }),
  'clearing the primed cohort early drives directly into the joint approach');

const queuedOnly = runScenario('queued-only gate', `
  TIME.setScrollX(halt - WAVES.GATE_PRELUDE_TILES);
  SCROLL.updateScroll(0);
  for (let i = HOSTILES.hostiles.length - 1; i >= 0; i--) {
    const e = HOSTILES.hostiles[i];
    if (e.gating && TIME.gameMs >= e.enterUntil - CFG.CONFIG.wasp.enterMs)
      HOSTILES.removeHostile(i, false);
  }
  const queuedBeforeHalt = HOSTILES.hostiles.filter((e) => e.gating).length;
  TIME.setScrollX(halt);
  SCROLL.updateScroll(0);
  console.log(JSON.stringify({
    queuedBeforeHalt,
    state: c.state,
    startedGateBody: HOSTILES.hostiles.some((e) => e.gating &&
      TIME.gameMs >= e.enterUntil - CFG.CONFIG.wasp.enterMs),
  }));
`);

ok(queuedOnly.queuedBeforeHalt > 0,
  'the edge proof retains later authored slots after erasing the first presence');
ok(queuedOnly.state === 'gate',
  'a surviving queued cohort still becomes the gate');
ok(queuedOnly.startedGateBody === true,
  'queued-only survivors are pulled to an entering presence before gate state');

const containPolyp = runScenario('CONTAIN forward polyp', `
  TIME.setScrollX(halt - WAVES.GATE_PRELUDE_TILES);
  GATE.primeGateWave(c);
  const polyps = HOSTILES.hostiles.filter((e) => e.kind === 'polyp');
  const assault = LEVEL.levelData.assaults.find((a) => a.face === c.k);
  const stage = assault.staging.find((s) => s.role === 'connector-control');
  const mount = assault.platforms.find((p) => p.id === stage.platformId);
  const embedded = polyps.some((polyp) => LEVEL.levelData.solidRects.some((rect) =>
    polyp.x + polyp.shotR > rect.x0 && polyp.x - polyp.shotR < rect.x1 &&
    polyp.y + polyp.shotR > rect.y0 && polyp.y - polyp.shotR < rect.y1));
  console.log(JSON.stringify({
    face: c.k,
    polyps: polyps.map((polyp) => ({
      x: polyp.x, y: polyp.y, dir: polyp.dir, gating: polyp.gating,
    })),
    stage: { role: stage.role, x: stage.x, y: stage.y },
    mount: { x0: mount.x0, x1: mount.x1, y: mount.y },
    embedded,
    rootY: CFG.CONFIG.polyp.rootY,
  }));
`, 2);

ok(containPolyp.face === 3 && containPolyp.polyps.length === 2,
  'CONTAIN authors its two mandatory Iris variants as distinct bodies');
ok(containPolyp.polyps.every((polyp) => polyp.gating === true),
  'both CONTAIN Irises still own the target-priority gate lesson');
ok(containPolyp.stage.role === 'connector-control' &&
   new Set(containPolyp.polyps.map((polyp) => polyp.x)).size === 2 &&
   Math.abs(containPolyp.polyps.reduce((sum, polyp) => sum + polyp.x, 0) /
     containPolyp.polyps.length - containPolyp.stage.x) < 1e-9 &&
   containPolyp.polyps.every((polyp) =>
     polyp.y === containPolyp.mount.y + containPolyp.rootY) &&
   containPolyp.embedded === false,
  'the mandatory Irises flank CONTAIN\'s explicit clear connector-control socket');
ok(containPolyp.polyps.every((polyp) => polyp.dir === -1),
  'both connector Irises face the approaching player across their owned lane');
}
