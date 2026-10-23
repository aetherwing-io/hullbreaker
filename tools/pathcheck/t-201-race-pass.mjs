/* T-201 — the race pass: follow-lead scroll, corners that never wait,
 * encounters that roll on the move, survivors that follow (decisions.md
 * entries 20, 23 #2, the integrator call in entry 25's addendum).
 *
 * Every played assertion drives the SHIPPED six-face simulation through the
 * race lab's child (tools/simlab/race/run-child.mjs: fresh Node process per
 * run, every default verb on — momentum, CHARGE, HULL FALLBACK, aim assist,
 * hit-stop) with a policy that uses the default verbs, and asserts what a
 * PLAYER gets: how far ahead they see, how long a joint holds them, whether
 * the encounter's bodies appear where they can be seen, whether the ones they
 * skipped follow them, and that a run that never fires is never stuck.
 * The pure assertions pin the new pure logic those runs depend on.
 *
 * Bounds come from the acceptance boxes in the T-201 dispatch (route ahead >=
 * 0.9 x lead and <= 5 % of moving frames under 3 tiles; a closed joint holds
 * RIG <= 0.2 s; the racer waits <= 0.5 s before a corner arms; no beat waits
 * > 6 s; every staged body inside the view, >= 6 tiles inside the damage plane
 * on a landscape view), never from the code under test.
 *
 * TWO TIERS, like T-102's: the full set by default; HB_GATE_FAST=1 runs every
 * pure assertion plus FAST_RUNS and prints one SKIP line for the rest, which
 * are not counted as passes. Falsification record: reports/tasks/T-201/build.md. */

import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../../src/config.js';
import {
  CARRY_KINDS, FOLD_HANDOFF_PROGRESS, ROLLING_GATES, ROLLING_TEXT_MAX, cornerHandoffMs,
  cornerYawDeltaDeg, rollingBeatDue, rollingBeatLine, rollingCarryRank, rollingEncounterText,
  rollingStageBand, rollingStageX, wavePhase,
} from '../../src/pure/waves.js';
import {
  followCornerFloor, followLeadTiles, followScrollFloor, momentumBank, momentumLeadBank,
  momentumLeadBankSample, momentumScreenFrac,
} from '../../src/pure/momentum.js';
import { CORNER_S, HALT_S } from '../../src/pure/path.js';
import { histQuantiles } from '../simlab/race/lab.mjs';
import { near, ok, srcDir, stripComments } from './_context.mjs';

export const title = 'T-201: the race pass — follow-lead, never-wait corners, rolling encounters';

const CHILD = fileURLToPath(new URL('../simlab/race/run-child.mjs', import.meta.url));
const VIEWPORTS = ['desktop-16x10', 'phone-landscape', 'phone-landscape-6pct', 'phone-portrait'];
const LANDSCAPE = (vp) => vp !== 'phone-portrait';
const BEAT_BOUND_MS = 6000;
const HOLD_BOUND_MS = 200;
const WAIT_BOUND_MS = 500;
const PLANE_ROOM_TILES = 6;
const SIGHT_FRACTION = 0.9;
const UNDER3_SHARE = 0.05;

function runChild(cfg) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [CHILD, JSON.stringify(cfg)],
      { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) return reject(new Error(`${JSON.stringify(cfg)}: ${stderr || err.message}`));
        try { resolve(JSON.parse(stdout)); } catch (e) { reject(new Error('bad child JSON: ' + e.message)); }
      });
  });
}

async function pool(list, jobs) {
  const out = new Array(list.length);
  let next = 0;
  async function worker() {
    while (next < list.length) {
      const i = next++;
      try { out[i] = await runChild(list[i]); } catch (e) {
        console.error('pathcheck: T-201 race child failed: ' + e.message.slice(0, 400));
        out[i] = null;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, jobs) }, worker));
  return out;
}

const ORACLE = (viewport, query = '') => ({ policy: 'rush', seed: 1, viewport, query,
  instrument: 'oracle', oracleLatencyMs: 0, maxGameMs: 600000 });
const BOT = (policy, seed, viewport, query = '') => ({ policy, seed, viewport, query, maxGameMs: 600000 });

function plan() {
  const runs = [];
  for (const vp of VIEWPORTS) runs.push({ tag: 'oracle', cfg: ORACLE(vp) });
  for (const vp of VIEWPORTS) runs.push({ tag: 'skip', cfg: BOT('skip', 1, vp) });
  for (const vp of ['desktop-16x10', 'phone-landscape-6pct'])
    for (const seed of [1, 2, 3])
      for (const query of ['', 'follow=0'])
        runs.push({ tag: 'floor', cfg: BOT('carried', seed, vp, query) });
  // the escape hatches still restore what they promise (not inert flags)
  runs.push({ tag: 'hatch-follow', cfg: ORACLE('desktop-16x10', 'follow=0') });
  runs.push({ tag: 'hatch-legacy', cfg: ORACLE('desktop-16x10', 'gates=legacy&follow=0') });
  return runs;
}
// HB_GATE_FAST=1: the operator's frame and desktop for the box assertions,
// one no-fire run, one floor-promise pair.
const FAST = Object.freeze([
  ['oracle', 'desktop-16x10', ''], ['oracle', 'phone-landscape-6pct', ''],
  ['skip', 'phone-landscape', ''],
  ['floor', 'desktop-16x10', '', 1], ['floor', 'desktop-16x10', 'follow=0', 1],
]);
function fastPlan(list) {
  return list.filter((r) => FAST.some(([tag, vp, q, seed]) => r.tag === tag && r.cfg.viewport === vp &&
    (r.cfg.query || '') === q && (seed === undefined || r.cfg.seed === seed)));
}

const leadOf = (summary) => followLeadTiles(summary.edges.right - summary.edges.left, CONFIG.follow);
const gatesOf = (out) => out.faces.slice(0, 6).map((f) => f.gate);

export async function run() {
  pureChecks();
  const full = plan();
  const fast = process.env.HB_GATE_FAST === '1';
  const list = fast ? fastPlan(full) : full;
  if (fast) {
    console.log(`SKIP t-201-race-pass: ${full.length - list.length} of ${full.length} played race ` +
      'runs not run (HB_GATE_FAST=1 — per-edit tier; not counted as passes; unset it for the full set)');
    ok(list.length === FAST.length,
      `T-201: every fast-tier run is a run of the full set (${list.length} of ${FAST.length} found)`);
  }
  const outs = await pool(list.map((r) => r.cfg), Math.max(1, Math.min(4, cpus().length)));
  ok(outs.every(Boolean), `T-201: all ${list.length} played race runs completed`);
  playedChecks(list, outs);
}

/* ------------------------------ pure ---------------------------------- */
export function pureChecks() {
  const F = CONFIG.follow;
  // the lead is the box's formula over the LIVE width, never a typed width
  ok(F.leadFrac === 0.3 && F.leadMinTiles === 6 && F.leadMaxTiles === 24 &&
     Object.keys(F).every((k) => ['leadFrac', 'leadMinTiles', 'leadMaxTiles', 'cornerBlendRate'].includes(k)),
    'T-201: CONFIG.follow is lead = clamp(0.3 x visible width, 6, 24) plus the corner blend — no width is typed');
  near(followLeadTiles(19, F), 6, 1e-12, 'T-201: a 19-tile portrait view keeps the 6-tile floor');
  near(followLeadTiles(62.57, F), 18.771, 1e-9, 'T-201: the closer phone frame leads 18.8 tiles');
  near(followLeadTiles(73.17, F), 21.951, 1e-9, 'T-201: desktop FAR 16:10 leads 22 tiles');
  near(followLeadTiles(99.16, F), 24, 1e-12, 'T-201: today\'s FAR phone frame is capped at 24');
  near(followScrollFloor(100, 45.73, 21.95), 76.22, 1e-9,
    'T-201: the follow floor keeps RIG\'s front exactly `lead` inside the right edge');
  const scrollSrc = stripComments(readFileSync(join(srcDir, 'sim', 'scroll.js'), 'utf8'));
  ok(/followLeadTiles\(EDGE_R - EDGE_L, CONFIG\.follow\)/.test(scrollSrc),
    'T-201: sim/scroll.js derives the lead from the live edge calibration (EDGE_R - EDGE_L)');

  // the corner blend reaches the halt exactly as RIG reaches the joint, and
  // binds only where the lead would leave the scroll short of the halt
  {
    const J = CORNER_S[0] + 1 - CONFIG.edges.margin, H = HALT_S[0];
    near(followCornerFloor(H, J, J, F), H, 1e-12,
      'T-201: at the joint the corner blend puts the scroll exactly on the halt');
    const D = 45.735 - followLeadTiles(73.17, F);           // desktop 16:10 lead offset
    const span = (D - (J - H)) / F.cornerBlendRate;          // where blend and lead meet
    near(followCornerFloor(H, J, J - span, F), (J - span) - D, 1e-9,
      `T-201: on desktop the blend takes over from the lead ${span.toFixed(1)} tiles before the joint`);
    ok(followCornerFloor(H, J, J - span - 1, F) < (J - span - 1) - D,
      'T-201: …and never binds before that point');
    const Dp = 16.985 - followLeadTiles(19, F);              // portrait: the lead passes the halt
    ok(J - Dp > H, 'T-201: on portrait the lead alone carries the scroll past the halt before arrival');
  }

  // the bank re-expressed in tiles from the damage plane
  {
    const L = -27.44, R = 45.73, W = R - L, lead = followLeadTiles(W, F), hw = CONFIG.player.width / 2;
    const leadDay = W - lead - 2 * hw;
    let identical = true, saturates = true;
    for (let i = 0; i <= 400; i++) {
      const day = i / 400 * W;
      const frac = momentumScreenFrac(L + day, L, R);
      const b = momentumLeadBank(frac, day, leadDay, CONFIG.momentum);
      if (day < leadDay - 0.06 && b !== momentumBank(frac, CONFIG.momentum)) identical = false;
      if (day >= leadDay && b !== 1) saturates = false;
      if (momentumLeadBank(frac, day, Infinity, CONFIG.momentum) !== momentumBank(frac, CONFIG.momentum))
        identical = false;
    }
    ok(identical, 'T-201 BANK: behind the lead line (and with the follow-lead off) the bank is ' +
      'T-022\'s screen-fraction bank exactly — a player who never reaches the lead banks what they banked');
    ok(saturates, 'T-201 BANK: riding the lead line banks fully, as riding the right clamp did');
    ok(momentumLeadBankSample(0.4, 0.99, leadDay + 1, leadDay, true, CONFIG.momentum) === 0.4,
      'T-201 BANK: a held scroll still holds the bank (entry 11: a halted plane is not daylight)');
  }

  // beats: the bound, the clear, proximity, the teach rules
  {
    const R = ROLLING_GATES;
    const s = { beat: 1, beats: 4, nowMs: 0, lastReleaseMs: 0, prevClearedAtMs: null,
      rigFront: 0, lineX: 50, rootedVisible: true, preludeReady: false, frameTrusted: true };
    ok(rollingBeatDue({ ...s, nowMs: R.beatBoundMs - 1 }) === null &&
       rollingBeatDue({ ...s, nowMs: R.beatBoundMs }) === 'bound' && R.beatBoundMs === BEAT_BOUND_MS,
      `T-201: a beat nobody clears and nobody approaches waits exactly its ${BEAT_BOUND_MS} ms bound, never the 300 s lock`);
    ok(rollingBeatDue({ ...s, nowMs: 1000, prevClearedAtMs: 1000 - R.clearBreathMs }) === 'clear' &&
       rollingBeatDue({ ...s, nowMs: 1000, prevClearedAtMs: 1000 - R.clearBreathMs + 1 }) === null,
      'T-201: clearing a beat hands over after one short breath');
    ok(rollingBeatDue({ ...s, nowMs: R.beatMinGapMs, rigFront: 50 }) === 'proximity' &&
       rollingBeatDue({ ...s, nowMs: R.beatMinGapMs - 1, rigFront: 50 }) === null &&
       rollingBeatDue({ ...s, nowMs: R.beatMinGapMs, rigFront: 50, rootedVisible: false }) === null,
      'T-201: proximity releases a beat only after the teach gap and only once its rooted sockets are in view');
    ok(rollingBeatDue({ ...s, beat: 0, rigFront: 50 }) === 'proximity' &&
       rollingBeatDue({ ...s, beat: 0, preludeReady: true }) === 'prelude' &&
       rollingBeatDue({ ...s, beat: 0, rigFront: 50, frameTrusted: false }) === null &&
       rollingBeatDue({ ...s, beat: 4 }) === null,
      'T-201: the teach beat primes on proximity or today\'s scroll prelude, never into a skewed frame');
    near(rollingBeatLine(112.6, 3, 2), 112.6 - R.tailTiles, 1e-12,
      'T-201: the last beat\'s line sits tailTiles before the joint');
    near(rollingBeatLine(112.6, 3, 2) - rollingBeatLine(112.6, 3, 1), R.beatSpacingTiles, 1e-12,
      'T-201: beat lines are beatSpacingTiles apart');
  }

  // staging band and displacement
  {
    const band = rollingStageBand(100, 170, 160, 8.5);
    ok(band.lo === 100 + ROLLING_GATES.stagePlaneTiles + 8.5 &&
       band.hi === 160 - ROLLING_GATES.stagePivotTiles,
      'T-201: the staging band is >= 6 tiles (+ the plane\'s advance) inside the damage plane and short of the pivot');
    ok(rollingStageX(130, band) === 130 && rollingStageX(200, band, 0) === band.hi &&
       rollingStageX(200, band, 1) === band.hi - ROLLING_GATES.stageSpacingTiles &&
       rollingStageX(10, band, 0) === band.lo,
      'T-201: an authored socket in the band is used verbatim; displaced bodies are pulled in and spread');
  }

  // who follows
  ok(rollingCarryRank({ kind: 'polyp', encounterKey: 'gate:2' }, 'gate:2') === Infinity &&
     rollingCarryRank({ kind: 'mortar', encounterKey: 'gate:2' }, 'gate:2') === Infinity &&
     rollingCarryRank({ kind: 'carrier', encounterKey: 'gate:2' }, 'gate:2') === Infinity &&
     rollingCarryRank({ kind: 'wasp', encounterKey: 'pressure:4' }, 'gate:2') === Infinity &&
     rollingCarryRank({ kind: 'wasp', encounterKey: 'gate:2', gating: true }, 'gate:2') === 0 &&
     rollingCarryRank({ kind: 'hound', encounterKey: 'gate:2', gating: false }, 'gate:2') === 1 &&
     rollingCarryRank({ kind: 'wasp', encounterKey: 'gate:1', pursuitFrom: 1 }, 'gate:2') === 3 &&
     Object.keys(CARRY_KINDS).join() === 'wasp,hound',
    'T-201: only the side\'s mobile ENCOUNTER bodies follow (gating first); rooted, carriers and the ambient stream never do');

  // the encounter line always fits its slot and never calls a live fight broken
  {
    let worst = '', calledBroken = 0, combos = 0;
    for (let k = 1; k <= 6; k++) {
      const phase = wavePhase(k, CONFIG), nextPhase = k < 6 ? wavePhase(k + 1, CONFIG) : '';
      for (const turning of [false, true]) for (const primed of [false, true])
        for (const cleared of [false, true]) for (const greeting of [false, true])
          for (let live = 0; live <= 13; live++) for (let pending = 0; pending <= 9; pending++)
            for (let following = 0; following <= ROLLING_GATES.carryMax; following++) {
              const text = rollingEncounterText({ k, faces: 6, phase, nextPhase, primed, live,
                pending, following, cleared, turning, greeting });
              combos++;
              if (text.length > worst.length) worst = text;
              if (!turning && /BROKEN/.test(text) && live + following > 0) calledBroken++;
            }
    }
    ok(worst.length <= ROLLING_TEXT_MAX && ROLLING_TEXT_MAX <= 28,
      `T-201: every encounter line fits the ~28-character HUD slot (${combos} states; longest ` +
      `${worst.length}: "${worst}")`);
    ok(calledBroken === 0, 'T-201: the encounter line never says BROKEN while a body of it is on screen');
  }

  // the sim's hand-off twin is the camera's
  {
    const cam = stripComments(readFileSync(join(srcDir, 'render', 'camera.js'), 'utf8'));
    const m = cam.match(/const FOLD_HANDOFF_PROGRESS = ([\d.]+);/);
    let first = 0;
    while (cornerYawDeltaDeg(first, CONFIG) / (2 * CONFIG.path.turnDeg) < FOLD_HANDOFF_PROGRESS) first++;
    ok(!!m && Number(m[1]) === FOLD_HANDOFF_PROGRESS && cornerHandoffMs(CONFIG) === first && first === 690,
      `T-201: ?hinge=flow releases RIG at the camera's own fold hand-off (${first} ms, progress ` +
      `${FOLD_HANDOFF_PROGRESS} in both waves.js and render/camera.js)`);
  }

  // the sim-side zipper is gone (entry 25): no build schedule, no settling
  {
    const simFiles = ['level.js', 'wavegate.js', 'scroll.js'].map((f) =>
      stripComments(readFileSync(join(srcDir, 'sim', f), 'utf8')));
    const pure = stripComments(readFileSync(join(srcDir, 'pure', 'waves.js'), 'utf8'));
    ok(!simFiles.some((t) => /zipperOffset|updateZipper|settleColumn|revealFaceRest|zipperColumn/.test(t)) &&
       !/zipperOffset/.test(pure),
      'T-201: the sim keeps no zipper: no build schedule, no settle, no zipper hook call (entry 25)');
  }
}

/* ------------------------------ played -------------------------------- */
function playedChecks(list, outs) {
  const byTag = (tag) => list.map((r, i) => ({ ...r, out: outs[i] })).filter((r) => r.tag === tag && r.out);

  // --- the racer: sight, waits, holds, staging, beats, carry-over ---------
  for (const { cfg, out } of byTag('oracle')) {
    const s = out.summary, vp = cfg.viewport, lead = leadOf(s), gates = gatesOf(out);
    ok(s.outcome === 'victory' && s.facesCleared === 6,
      `T-201 [oracle@0 ${vp}]: the racer takes all six corners to VICTORY (${s.outcome}, ${s.facesCleared}/6)`);
    const q = histQuantiles(out.hist.routeAheadMovingFine.map(([b, n]) => [b / 10, n]));
    const under3 = out.hist.routeAheadMovingFine.filter(([b]) => b < 30).reduce((a, [, n]) => a + n, 0) /
      out.hist.routeAheadMovingFine.reduce((a, [, n]) => a + n, 0);
    ok(q && q.median >= SIGHT_FRACTION * lead && under3 <= UNDER3_SHARE,
      `T-201 [oracle@0 ${vp}] SIGHT: while the scroll moves the racer sees a median ${q ? q.median.toFixed(1) : '?'} ` +
      `tiles of route ahead (>= ${(SIGHT_FRACTION * lead).toFixed(1)} = 0.9 x lead ${lead.toFixed(1)}), ` +
      `${(under3 * 100).toFixed(1)} % of moving frames under 3 tiles (<= 5 %)`);
    const waits = gates.map((g) => g && g.firstAtPivotMs !== null && g.armedMs !== null
      ? g.armedMs - g.firstAtPivotMs : 0);
    ok(waits.every((w) => w <= WAIT_BOUND_MS),
      `T-201 [oracle@0 ${vp}] WAIT: the racer never waits at a closed joint for the corner to arm ` +
      `(${waits.map((w) => (w / 1000).toFixed(2)).join(' / ')} s; bound 0.5 s)`);
    const holds = gates.map((g) => g ? g.holdAtJointMs : 0);
    ok(holds.every((h) => h <= HOLD_BOUND_MS),
      `T-201 [oracle@0 ${vp}] NEVER-WAIT: a closed joint holds RIG at most ${Math.max(...holds)} ms ` +
      '(bound 200 ms)');
    ok(s.stage.condense > 30 && s.stage.outsideAtCondense === 0 &&
       (!LANDSCAPE(vp) || s.stage.nearPlaneAtCondense === 0),
      `T-201 [oracle@0 ${vp}] VISIBLE: every one of ${s.stage.condense} staged/re-entering bodies began ` +
      `condensing inside the view (${s.stage.outsideAtCondense} outside)` +
      (LANDSCAPE(vp) ? `, none < ${PLANE_ROOM_TILES} tiles from the damage plane (nearest ${s.stage.minPlaneAtCondense})` : ''));
    const gaps = gates.map((g) => g && g.beatMaxGapMs !== null ? g.beatMaxGapMs : 0);
    ok(gaps.every((g) => g <= BEAT_BOUND_MS + 17),
      `T-201 [oracle@0 ${vp}] BEATS: no beat waited more than ${BEAT_BOUND_MS / 1000} s for the one before ` +
      `(${gaps.map((g) => (g / 1000).toFixed(1)).join(' / ')} s)`);
    ok(gates.every((g) => !g || !g.pursuers || (g.carried === g.pursuers && g.carriedSeen === g.pursuers && !g.dropped)),
      `T-201 [oracle@0 ${vp}] CARRY: every body that followed RIG round a corner re-entered on the ` +
      `arriving facet, inside the view (${gates.map((g) => g ? `${g.pursuers ?? 0}/${g.carriedSeen}` : '-').join(' ')})`);
  }

  // --- a run that never fires: no softlock, survivors follow ---------------
  for (const { cfg, out } of byTag('skip')) {
    const s = out.summary, vp = cfg.viewport, gates = gatesOf(out);
    ok(s.outcome !== 'timeout',
      `T-201 [skip ${vp}] NO SOFTLOCK: a run that never fires is never stuck — it ends in ` +
      `${s.outcome} after ${(s.gameMs / 1000).toFixed(0)} s with ${s.facesCleared}/6 corners taken`);
    const holds = gates.filter(Boolean).map((g) => g.holdAtJointMs);
    ok(holds.every((h) => h <= HOLD_BOUND_MS),
      `T-201 [skip ${vp}] NEVER-WAIT: no corner it reached held it more than 0.2 s ` +
      `(max ${Math.max(0, ...holds)} ms)`);
    // the side's skipped bodies — survivors it ran past, and mobile slots it
    // outran — follow (up to carryMax) and are seen condensing on the next side
    const carried = gates.filter((g) => g && g.pursuers > 0);
    ok(carried.length >= Math.min(3, s.facesCleared - 1) &&
       carried.every((g) => g.carriedSeen === g.pursuers && !g.dropped &&
         g.pursuers <= ROLLING_GATES.carryMax),
      `T-201 [skip ${vp}] PRESSURE: skipped bodies follow onto the next side and are seen there ` +
      `(followed/seen per corner ${gates.map((g) => g ? `${g.pursuers ?? 0}/${g.carriedSeen}` : '-').join(' ')}; ` +
      `survivors at the turn ${gates.map((g) => g ? g.survivorsAtTurn ?? '-' : '-').join('/')})`);
  }

  // --- the floor promise: no lead, no blend, no change ---------------------
  const floors = byTag('floor');
  for (const vp of ['desktop-16x10', 'phone-landscape-6pct']) {
    const pairs = [];
    for (const seed of [1, 2, 3]) {
      const on = floors.find((r) => r.cfg.viewport === vp && r.cfg.seed === seed && !r.cfg.query);
      const off = floors.find((r) => r.cfg.viewport === vp && r.cfg.seed === seed && r.cfg.query === 'follow=0');
      if (on && off) pairs.push({ seed, on: on.out, off: off.out });
    }
    if (!pairs.length) continue;
    // the bound holds for a slow player too (the oracle clears every beat)
    for (const p of pairs) {
      const gaps = gatesOf(p.on).map((g) => g && g.beatMaxGapMs !== null ? g.beatMaxGapMs : 0);
      ok(gaps.every((g) => g <= BEAT_BOUND_MS + 17),
        `T-201 [carried s${p.seed} ${vp}] BEATS: no beat waited more than ${BEAT_BOUND_MS / 1000} s ` +
        `for the one before (${gaps.map((g) => (g / 1000).toFixed(1)).join(' / ')} s)`);
    }
    const untouched = pairs.filter((p) => p.on.summary.framesFollowNear === 0 && p.off.summary.framesFollowNear === 0);
    ok(untouched.length > 0 && untouched.every((p) => p.on.simDigest === p.off.simDigest),
      `T-201 [carried ${vp}] FLOOR: a player who never reaches the lead (or the corner blend) plays a ` +
      `trajectory identical to ?follow=0 (${untouched.length} of ${pairs.length} seeds untouched: digests ` +
      `${untouched.map((p) => p.on.simDigest + (p.on.simDigest === p.off.simDigest ? '=' : '!=') + p.off.simDigest).join(', ')})`);
  }

  // --- the escape hatches are not inert ------------------------------------
  for (const { tag, out } of [...byTag('hatch-follow'), ...byTag('hatch-legacy')]) {
    const s = out.summary, lead = leadOf(s), gates = gatesOf(out);
    const waits = gates.map((g) => g && g.firstAtPivotMs !== null && g.armedMs !== null
      ? g.armedMs - g.firstAtPivotMs : 0);
    const q = histQuantiles(out.hist.routeAheadMovingFine.map(([b, n]) => [b / 10, n]));
    ok(waits.filter((w) => w > 3000).length >= 4 && q && q.median < 0.5 * lead,
      `T-201 [oracle@0 ${tag}]: the escape hatch restores today's scroll — the racer waits > 3 s at ` +
      `${waits.filter((w) => w > 3000).length} of 6 joints and sees a median ${q ? q.median.toFixed(1) : '?'} tiles ahead`);
    if (tag === 'hatch-legacy')
      ok(gates.filter((g) => g && g.gateEnteredMs !== null).length >= 3,
        `T-201 [oracle@0 ${tag}]: ?gates=legacy restores the held gate (${gates.filter((g) => g && g.gateEnteredMs !== null).length} gates held)`);
  }
}
