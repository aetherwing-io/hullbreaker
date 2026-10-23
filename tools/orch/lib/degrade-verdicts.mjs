// degrade-verdicts.mjs — the PLAY gate's verdicts on its `degrade` step
// (tools/orch/play-gate.mjs): one boot of the DEFAULT URL with every request
// under assets/generated/ aborted, one with the art, the same frame-exact input
// schedule in both (entry 16: a missing asset degrades visibly and safely, never
// wedges the game, never changes play).
//
// Pure: it judges two run records and returns verdict lines. play-gate.mjs fills
// the records from real pages; tools/pathcheck/t-120-gate-self-tests.mjs and
// play-gate.mjs's own start-up self-test feed it fixtures.
//
// THE RULES (T-120 fix round 1, review finding 1 / playtest I-C):
//   safety    read on EVERY run that has data, whatever its speed: no page
//             error, the failsafe verdict (lib/failsafe-check.mjs), and — on the
//             art-blocked run — art requests really aborted and no art ready.
//   progress  a run whose tick did not move during its liveness probe (five of
//             its own average frame times, at least 20 s) is WEDGED: FAIL. The
//             art-blocked run averaging under CRAWL_RATIO of the art run's tick
//             rate (both from the boot to the end of the budget, on the same
//             host, in parallel) is a FAIL: missing art made the game slow —
//             whether or not the art run finished. A schedule still advancing at
//             the end of the budget is too slow for this host: REPORT on a
//             GPU-less host, FAIL on a GPU host.
//   compare   the sim states at the terminal tick when both finished; otherwise
//             at the furthest checkpoint both reached (every CHECKPOINT_EVERY
//             ticks). Only when the lagging run reached no checkpoint is the
//             comparison INCONCLUSIVE — and it is also only REPORTED when the art
//             run had no art ready at the compared tick (nothing was compared).

export const CHECKPOINT_EVERY = 50;
export const CRAWL_RATIO = 0.25;

const readyOf = (a) => (a ? (a.preload?.ready || 0) + (a.sprites?.ready || 0) + (a.hullReady || 0) : 0);
// ticks per second from the boot to the end of the budget (or to the finish)
const avgRate = (r) => (r.complete ? r.stopTick : (r.budgetTick ?? r.tick)) / Math.max(1e-3, r.elapsedMs / 1000);

// run record: { error?, complete, tick, stopTick, elapsedMs, budgetTick, probeMs, advancing, rate,
//   pageErrors[], fsv {status, note?}, art {preload, sprites, hullReady}, aborted,
//   checkpoints { [tick]: { sim, artReady } }, sim, artReady }
export function degradeVerdicts(art, bare, { gpuLess = true, budgetMs = 0 } = {}) {
  const out = [];
  const rec = (status, what, detail = null) => out.push({ status, what, detail });
  const slowStatus = gpuLess ? 'REPORT' : 'FAIL';
  const name = (r) => (r === art ? 'art run' : 'art-blocked run');
  const usable = [art, bare].filter((r) => r && !r.error);
  if (usable.length < 2) {
    rec('FAIL', 'both runs (art / art blocked) could be read', { art: art?.error || 'ok', blocked: bare?.error || 'ok' });
    // whatever one usable run shows is still judged below
  }

  /* ---- safety: every run that has data ---- */
  for (const r of usable) {
    const tag = name(r);
    if (r.pageErrors?.length) rec('FAIL', `${tag}: no page error`, r.pageErrors.slice(0, 2));
    else rec('PASS', `${tag}: no page error`);
    const fs = r.fsv || { status: 'FAIL', note: 'no failsafe reading' };
    rec(fs.status, `${tag}: no failure panel, fault or halt` + (fs.note ? ' — ' + fs.note : ''), fs.status === 'FAIL' ? fs : null);
  }
  if (bare && !bare.error) {
    const ok = bare.aborted > 0 && readyOf(bare.art) === 0;
    rec(ok ? 'PASS' : 'FAIL', `with ${bare.aborted} art requests aborted the game still played and reports no art ready ` +
      `(${JSON.stringify(bare.art)} blocked vs ${JSON.stringify(art && !art.error ? art.art : null)} with the art)`);
  }
  if (usable.length < 2) return out;

  /* ---- progress ---- */
  for (const r of usable) {
    if (r.scheduleBroken)
      rec('FAIL', `${name(r)}: the schedule reached its terminal tick without dispatching every input event (${r.dispatched}/${r.events})`);
    if (!r.complete && r.advancing === false)
      rec('FAIL', `${name(r)} is WEDGED: its tick stopped at ${r.tick}/${r.stopTick}` +
        (r.probeMs ? ` for ${(r.probeMs / 1000).toFixed(0)} s` : '') + ' (missing art must never wedge the game)');
  }
  const wedged = usable.some((r) => !r.complete && r.advancing === false);
  if (!wedged) {
    const artAvg = avgRate(art), bareAvg = avgRate(bare);
    if (art.complete && bare.complete) {
      rec('PASS', `both runs played the whole frame-exact schedule (${art.tick}/${art.stopTick} and ${bare.tick}/${bare.stopTick} ticks)`);
    } else if (!bare.complete && artAvg > 0 && bareAvg < CRAWL_RATIO * artAvg) {
      rec('FAIL', `the art-blocked run CRAWLS: it averaged ${bareAvg.toFixed(2)} ticks/s to tick ${bare.budgetTick ?? bare.tick}/${bare.stopTick} ` +
        `while the art run ${art.complete ? 'finished' : 'reached ' + (art.budgetTick ?? art.tick) + '/' + art.stopTick} at ` +
        `${artAvg.toFixed(2)} ticks/s, on the same host at the same time (missing art made the game slow)`);
    } else {
      const where = (r) => (r.complete ? 'finished' : `at ${r.tick}/${r.stopTick}, still advancing`);
      rec(slowStatus, `the frame-exact schedule did not finish within ${(budgetMs / 1000).toFixed(0)} s ` +
        `(art run ${where(art)}, ${artAvg.toFixed(2)} ticks/s; art-blocked run ${where(bare)}, ${bareAvg.toFixed(2)} ticks/s) ` +
        '— this host is too slow, nothing wedged');
    }
  }

  /* ---- compare ---- */
  let at = null, a = null, b = null, artReady = 0;
  if (art.complete && bare.complete) { at = art.stopTick; a = art.sim; b = bare.sim; artReady = readyOf(art.art); }
  else {
    const common = Object.keys(art.checkpoints || {}).map(Number)
      .filter((t) => bare.checkpoints && bare.checkpoints[t] !== undefined).sort((x, y) => y - x)[0];
    if (common !== undefined) {
      at = common; a = art.checkpoints[common].sim; b = bare.checkpoints[common].sim;
      artReady = art.checkpoints[common].artReady || 0;
    }
  }
  const where = at === null ? '' : (art.complete && bare.complete ? 'at the terminal tick' : `at tick ${at}, the furthest both runs reached`);
  if (at === null) {
    rec(slowStatus, 'missing art does not change play — INCONCLUSIVE: the lagging run reached no comparison tick ' +
      `(every ${CHECKPOINT_EVERY} ticks); nothing compared`);
  } else if (a !== b) {
    rec('FAIL', `missing art does not change play: the sim state ${where} is identical with and without the art`,
      { art: String(a).slice(0, 300), blocked: String(b).slice(0, 300) });
  } else if (artReady === 0) {
    rec('REPORT', `missing art does not change play — INCONCLUSIVE: identical sim state ${where}, but the art run had no art ` +
      'ready by then either, so nothing was compared');
  } else {
    rec('PASS', `missing art does not change play: the sim state ${where} is identical with ${artReady} art surfaces ready and with none`);
  }
  return out;
}

/* ---------------------------- fixtures (self-test) ---------------------------- */
// Each fixture: two run records and the verdicts that MUST appear (status + a
// fragment of the line). play-gate.mjs refuses to start if one does not hold;
// tools/pathcheck/t-120-gate-self-tests.mjs asserts them one by one.
const sim = (tag) => JSON.stringify({ g: 5000, p: [tag] });
const cps = (n, tag = 'x', ready = 14) => Object.fromEntries(Array.from({ length: n }, (_, i) =>
  [(i + 1) * CHECKPOINT_EVERY, { sim: sim(`${tag}${(i + 1) * CHECKPOINT_EVERY}`), artReady: ready }]));
const run = (o = {}) => ({
  complete: true, tick: 300, stopTick: 300, elapsedMs: 300000, advancing: null, rate: 0,
  pageErrors: [], fsv: { status: 'PASS' }, art: { preload: { ready: 33 }, sprites: { ready: 6 }, hullReady: 2 },
  aborted: 0, checkpoints: cps(6), sim: sim('end'), ...o,
});
const blocked = (o = {}) => run({ art: { preload: { failed: 33 }, sprites: { failed: 6 }, hullReady: 0 }, aborted: 38, ...o });
const slow = (o = {}) => ({ complete: false, tick: 294, advancing: true, rate: 0.5, checkpoints: cps(5), sim: null, ...o });

export const DEGRADE_FIXTURES = [
  { name: 'both finished, identical, art ready -> PASS', art: run(), bare: blocked(),
    want: [['PASS', 'identical with 41 art surfaces'], ['PASS', 'whole frame-exact schedule']], never: ['FAIL'] },
  { name: 'both finished, sim differs -> FAIL', art: run(), bare: blocked({ sim: sim('other') }),
    want: [['FAIL', 'missing art does not change play']] },
  { name: 'B1: both slow, art-blocked page error -> FAIL (not only INCONCLUSIVE)', art: run(slow()),
    bare: blocked(slow({ pageErrors: ['Error: T-120 fixture'] })), want: [['FAIL', 'art-blocked run: no page error']] },
  { name: 'B1: both slow, art-blocked failure panel -> FAIL', art: run(slow()),
    bare: blocked(slow({ fsv: { status: 'FAIL' } })), want: [['FAIL', 'art-blocked run: no failure panel']] },
  { name: 'B1: both slow, no art request aborted -> FAIL', art: run(slow()), bare: blocked(slow({ aborted: 0 })),
    want: [['FAIL', 'art requests aborted']] },
  { name: 'B1: art run finished, art-blocked run crawls -> FAIL', art: run({ elapsedMs: 300000 }),
    bare: blocked(slow({ tick: 40, budgetTick: 38, rate: 0.1, checkpoints: {} })), want: [['FAIL', 'CRAWLS']] },
  { name: 'B1: neither finished, the art-blocked run averages under a quarter of the art run -> FAIL',
    art: run(slow({ tick: 290 })), bare: blocked(slow({ tick: 50, rate: 0.1, checkpoints: cps(1) })), want: [['FAIL', 'CRAWLS']] },
  { name: 'one long SwiftShader frame inside the liveness probe is not a crawl (the averages decide) -> no FAIL',
    art: run(), bare: blocked(slow({ tick: 251, budgetTick: 250, rate: 0.05, checkpoints: cps(5) })),
    want: [['REPORT', 'did not finish'], ['PASS', 'at tick 250, the furthest']], never: ['FAIL'] },
  { name: 'art run finished, art-blocked run slower but not crawling -> REPORT (GPU-less), compared at a checkpoint',
    art: run(), bare: blocked(slow({ tick: 200, checkpoints: cps(4) })),
    want: [['REPORT', 'did not finish'], ['PASS', 'at tick 200, the furthest']], never: ['FAIL'] },
  { name: 'art-blocked run wedged -> FAIL', art: run(), bare: blocked(slow({ advancing: false, rate: 0 })),
    want: [['FAIL', 'WEDGED']] },
  { name: 'both slow, comparable, safe -> compared at the furthest common checkpoint; slowness REPORTED (GPU-less)',
    art: run(slow({ tick: 290, checkpoints: cps(5) })), bare: blocked(slow({ tick: 260, checkpoints: cps(5) })),
    want: [['REPORT', 'did not finish'], ['PASS', 'at tick 250, the furthest both runs reached'], ['PASS', 'art-blocked run: no page error']],
    never: ['FAIL'] },
  { name: 'both slow, sim differs at the common checkpoint -> FAIL', art: run(slow({ checkpoints: cps(5) })),
    bare: blocked(slow({ checkpoints: cps(5, 'y') })), want: [['FAIL', 'at tick 250']] },
  { name: 'the lagging run reached no checkpoint -> comparison INCONCLUSIVE, safety still judged',
    art: run(slow({ tick: 40, checkpoints: {} })), bare: blocked(slow({ tick: 30, checkpoints: {} })),
    want: [['REPORT', 'reached no comparison tick'], ['PASS', 'art-blocked run: no page error']], never: ['FAIL'] },
  { name: 'GPU host: a schedule that did not finish fails', art: run(slow()), bare: blocked(slow()), opts: { gpuLess: false },
    want: [['FAIL', 'did not finish']] },
  { name: 'art run had no art ready -> REPORT inconclusive, not PASS',
    art: run({ art: { preload: { timeout: 33 } }, checkpoints: cps(6, 'x', 0) }), bare: blocked(),
    want: [['REPORT', 'no art ready by then']], never: ['FAIL'] },
];

export function degradeSelfTest() {
  return DEGRADE_FIXTURES.map((f) => {
    const got = degradeVerdicts(f.art, f.bare, { budgetMs: 720000, ...(f.opts || {}) });
    const missing = f.want.filter(([status, frag]) => !got.some((v) => v.status === status && v.what.includes(frag)));
    const forbidden = (f.never || []).filter((status) => got.some((v) => v.status === status));
    return { name: f.name, ok: !missing.length && !forbidden.length, missing, forbidden, got };
  });
}
