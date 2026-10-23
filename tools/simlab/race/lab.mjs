#!/usr/bin/env node
/* lab.mjs — the six-face race lab: measure the SHIPPED run as distributions.
 *
 *   node tools/simlab/race/lab.mjs baseline            # full matrix -> artifacts/t104-race/
 *   node tools/simlab/race/lab.mjs baseline --seeds 4  # smaller matrix (quick look)
 *   node tools/simlab/race/lab.mjs check               # re-run the committed matrix and
 *                                                     #   compare every run fingerprint
 *   node tools/simlab/race/lab.mjs check --every 8     # the same on every 8th run (faster)
 *   node tools/simlab/race/lab.mjs one '{"policy":"rush","seed":3,"viewport":"phone-portrait"}'
 *
 * Every run is ONE fresh Node process (run-child.mjs) driving the real,
 * unmodified src/ simulation at a fixed 1/60 s step with a seeded bot policy
 * (policies.mjs) or the oracle instrument. Same matrix -> byte-identical
 * fingerprints, which is how the numbers in
 * docs/proposals/2026-10-race-to-the-top.md are reproduced.
 *
 * Distributions, never one run (decisions.md entry 19): every aggregate row
 * reports n, min, p25, median, p75, max.
 *
 * Zero effect on the shipped game. Writes only under artifacts/t104-race/
 * (or --out). Honesty notes: tools/simlab/README.md "race lab".            */

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIEWPORTS, viewportEdges } from './edges.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..', '..', '..');
const CHILD = join(here, 'run-child.mjs');

const argv = process.argv.slice(2);
const mode = argv[0] && !argv[0].startsWith('-') ? argv[0] : 'baseline';
const opt = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt;
};

const SEEDS = parseInt(opt('seeds', '12'), 10);
const JOBS = parseInt(opt('jobs', '2'), 10);
const MAX_GAME_MS = parseInt(opt('max-game-ms', '600000'), 10);
const OUT_DIR = resolve(ROOT, opt('out', 'artifacts/t104-race'));
// T-201: every run of a matrix can carry one URL query (e.g.
// `--query 'gates=legacy&follow=0'` for the escape hatches), and the matrix
// can be narrowed to some viewports / policies.
const QUERY = opt('query', '');
const LAB_VIEWPORTS = opt('viewports', '') ? opt('viewports', '').split(',')
  : ['desktop-16x10', 'phone-landscape', 'phone-landscape-6pct', 'phone-portrait'];
// `skip` (T-201): rush's movement with the trigger never pulled.
const POLICIES = opt('policies', '') ? opt('policies', '').split(',')
  : ['rush', 'climber', 'fighter', 'carried', 'skip'];
const ORACLE_LATENCIES = [0, 1500, 3000];
const ORACLE_SEEDS = 3;

export function matrix(seeds = SEEDS) {
  const runs = [];
  for (const viewport of LAB_VIEWPORTS) {
    for (const policy of POLICIES)
      for (let seed = 1; seed <= seeds; seed++)
        runs.push({ policy, seed, viewport, maxGameMs: MAX_GAME_MS, query: QUERY });
    runs.push({ policy: 'idle', seed: 1, viewport, maxGameMs: MAX_GAME_MS, query: QUERY });
    for (const lat of ORACLE_LATENCIES)
      for (let seed = 1; seed <= ORACLE_SEEDS; seed++)
        runs.push({ policy: 'rush', seed, viewport, maxGameMs: MAX_GAME_MS, query: QUERY,
          instrument: 'oracle', oracleLatencyMs: lat });
  }
  return runs;
}

function runChild(cfg) {
  return new Promise((res, rej) => {
    const p = spawn(process.execPath, [CHILD, JSON.stringify(cfg)], { cwd: ROOT });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => {
      if (code !== 0) return rej(new Error('child failed ' + JSON.stringify(cfg) + '\n' + err));
      try { res(JSON.parse(out)); } catch (e) { rej(new Error('bad child JSON: ' + e.message)); }
    });
  });
}

async function pool(items, jobs, fn) {
  const results = new Array(items.length);
  let next = 0, done = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
      done++;
      if (done % 10 === 0 || done === items.length)
        process.stderr.write(`  ${done}/${items.length} runs\n`);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, jobs) }, worker));
  return results;
}

/* ---------------------------- aggregation ---------------------------- */

const r2 = (v) => (v === null || v === undefined || !Number.isFinite(v)) ? null : Math.round(v * 100) / 100;

export function p90(values) {
  const v = values.filter((x) => x !== null && x !== undefined && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const i = (v.length - 1) * 0.9, lo = Math.floor(i), hi = Math.ceil(i);
  return r2(v[lo] + (v[hi] - v[lo]) * (i - lo));
}

export function dist(values) {
  const v = values.filter((x) => x !== null && x !== undefined && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return { n: 0 };
  const q = (p) => {
    const i = (v.length - 1) * p;
    const lo = Math.floor(i), hi = Math.ceil(i);
    return v[lo] + (v[hi] - v[lo]) * (i - lo);
  };
  return { n: v.length, min: r2(v[0]), p25: r2(q(0.25)), median: r2(q(0.5)), p75: r2(q(0.75)), max: r2(v[v.length - 1]) };
}

export function histQuantiles(pairs) {
  // pairs: [[bin, frames], ...] with 1-tile bins
  const total = pairs.reduce((a, [, n]) => a + n, 0);
  if (!total) return null;
  const at = (p) => {
    let acc = 0;
    for (const [bin, n] of pairs) { acc += n; if (acc >= p * total) return bin; }
    return pairs[pairs.length - 1][0];
  };
  const below = (t) => pairs.filter(([b]) => b < t).reduce((a, [, n]) => a + n, 0) / total;
  return { p10: at(0.1), p25: at(0.25), median: at(0.5), p75: at(0.75), p90: at(0.9),
    shareUnder3: r2(below(3)), shareUnder8: r2(below(8)) };
}

export function mergeHist(list) {
  const m = new Map();
  for (const pairs of list) for (const [b, n] of pairs) m.set(b, (m.get(b) || 0) + n);
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
}

const FACE_IDS = [1, 2, 3, 4, 5, 6];
const faceDone = (f) => f.gate && f.gate.turnDoneMs !== null;

export function compactRun(out) {
  return {
    key: runKey(out.summary),
    summary: { ...out.summary, wallMs: undefined, profile: undefined },
    fingerprint: out.fingerprint,
    faces: out.faces.map((f) => ({
      face: f.face, ms: f.ms, kills: f.kills, hits: f.hits, livesLost: f.livesLost,
      fallbacks: f.fallbacks, falls: f.falls, altEntry: f.altEntry, altExit: f.altExit,
      altMax: f.altMax, yMax: f.yMax, climbUp: f.climbUp, aboveDeckMs: f.aboveDeckMs,
      frames: f.frames, framesForward: f.framesForward, framesBack: f.framesBack,
      framesHold: f.framesHold, framesIdle: f.framesIdle, framesPinned: f.framesPinned,
      framesScrollHeld: f.framesScrollHeld, driveMean: f.driveMean, driveMax: f.driveMax,
      framesTerrainStall: f.framesTerrainStall,
      done: faceDone(f),
      driveThrough: f.gate ? f.gate.driveThrough : null,
      gateArmToClearMs: f.gate && f.gate.armedMs !== null && f.gate.approachMs !== null
        ? Math.round(f.gate.approachMs - f.gate.armedMs) : null,
      primedToArmMs: f.gate && f.gate.primedMs !== null && f.gate.armedMs !== null
        ? Math.round(f.gate.armedMs - f.gate.primedMs) : null,
      // a racer standing at the closed joint while the scroll is still
      // catching up to the halt: time spent waiting for the gate to START
      pivotWaitMs: f.gate && f.gate.firstAtPivotMs !== null && f.gate.armedMs !== null
        ? Math.max(0, Math.round(f.gate.armedMs - f.gate.firstAtPivotMs)) : null,
      // T-201: the climb held by the corner after RIG reaches the joint
      // (pressing into a closed joint), arrival -> turn start (includes RIG's
      // own last tile to the bend), the carry-over the sim reports and what
      // the next side actually showed.
      holdAtJointMs: f.gate ? f.gate.holdAtJointMs ?? null : null,
      holdAfterArrivalMs: f.gate && f.gate.arrivedMs !== null && f.gate.turnStartMs !== null
        ? Math.max(0, Math.round(f.gate.turnStartMs - f.gate.arrivedMs)) : null,
      survivorsAtTurn: f.gate ? f.gate.survivorsAtTurn : null,
      pursuers: f.gate ? f.gate.pursuers : null,
      unreleasedCarried: f.gate ? f.gate.unreleasedCarried : null,
      carried: f.gate ? f.gate.carried : null,
      dropped: f.gate ? f.gate.dropped : null,
      carriedSeen: f.gate ? f.gate.carriedSeen : null,
      clearedAtTurn: f.gate ? f.gate.clearedAtTurn : null,
      beatsReleased: f.gate ? f.gate.beatsReleased : null,
      beatMaxGapMs: f.gate ? f.gate.beatMaxGapMs : null,
      beatLog: f.gate ? f.gate.beatLog : null,
    })),
    simDigest: out.simDigest,
    hist: out.hist,
    landed: out.landed,
    level: out.level,
  };
}

function runKey(s) {
  return [s.instrument ? 'oracle@' + s.oracleLatencyMs : s.policy, s.viewport, s.seed].join('|');
}

function groupKey(run) {
  const s = run.summary;
  return (s.instrument ? 'oracle@' + s.oracleLatencyMs : s.policy) + '|' + s.viewport;
}

// Reachability by play: which authored platforms did ANY run land on, per
// viewport (the matrix's union) — and which did none of them reach?
export function reachByPlay(runs, platformIds) {
  const byVp = {};
  for (const r of runs) {
    const vp = r.summary.viewport;
    if (!byVp[vp]) byVp[vp] = new Set();
    for (const id of r.landed || []) byVp[vp].add(id);
  }
  return Object.fromEntries(Object.entries(byVp).map(([vp, set]) => {
    const unreached = platformIds.filter((id) => !set.has(id));
    return [vp, { authored: platformIds.length, landedOn: platformIds.length - unreached.length, unreached }];
  }));
}

export function aggregate(runs) {
  const groups = new Map();
  for (const r of runs) {
    const k = groupKey(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const rows = [];
  for (const [key, list] of groups) {
    const [who, viewport] = key.split('|');
    const row = { group: who, viewport, n: list.length };
    row.outcomes = {};
    for (const r of list) row.outcomes[r.summary.outcome] = (row.outcomes[r.summary.outcome] || 0) + 1;
    row.facesCleared = dist(list.map((r) => r.summary.facesCleared));
    row.runSeconds = dist(list.map((r) => r.summary.gameMs / 1000));
    row.victorySeconds = dist(list.filter((r) => r.summary.outcome === 'victory').map((r) => r.summary.gameMs / 1000));
    row.livesLost = dist(list.map((r) => 3 - r.summary.livesLeft));
    row.lethalEvents = dist(list.map((r) => r.faces.reduce((a, f) => a + f.livesLost + f.fallbacks, 0)));
    // whole-run frame shares (only frames actually played)
    const sum = (r, k) => r.faces.reduce((a, f) => a + f[k], 0);
    row.shareForward = dist(list.map((r) => sum(r, 'framesForward') / Math.max(1, sum(r, 'frames'))));
    row.shareScrollHeld = dist(list.map((r) => sum(r, 'framesScrollHeld') / Math.max(1, sum(r, 'frames'))));
    row.shareIdle = dist(list.map((r) => sum(r, 'framesIdle') / Math.max(1, sum(r, 'frames'))));
    row.sharePinnedRight = dist(list.map((r) => sum(r, 'framesPinned') / Math.max(1, sum(r, 'frames'))));
    row.lookaheadTiles = histQuantiles(mergeHist(list.map((r) => r.hist.lookahead)));
    row.routeAheadTiles = histQuantiles(mergeHist(list.map((r) => r.hist.routeAhead)));
    row.lookaheadMovingTiles = histQuantiles(mergeHist(list.map((r) => r.hist.lookaheadMoving)));
    row.routeAheadMovingTiles = histQuantiles(mergeHist(list.map((r) => r.hist.routeAheadMoving)));
    row.marginTiles = histQuantiles(mergeHist(list.map((r) => r.hist.margin)));
    // T-201 whole-run rows
    row.hitsPerRun = dist(list.map((r) => r.faces.reduce((a, f) => a + f.hits, 0)));
    row.fallbacksPerRun = dist(list.map((r) => r.faces.reduce((a, f) => a + f.fallbacks, 0)));
    row.livesLostPerRun = dist(list.map((r) => r.faces.reduce((a, f) => a + f.livesLost, 0)));
    row.killsPerRun = dist(list.map((r) => r.summary.kills));
    row.stage = {
      condensed: list.reduce((a, r) => a + (r.summary.stage?.condense || 0), 0),
      outsideAtCondense: list.reduce((a, r) => a + (r.summary.stage?.outsideAtCondense || 0), 0),
      outsideAtMaterial: list.reduce((a, r) => a + (r.summary.stage?.outsideAtMaterial || 0), 0),
      nearPlaneAtCondense: list.reduce((a, r) => a + (r.summary.stage?.nearPlaneAtCondense || 0), 0),
      nearPlaneAtMaterial: list.reduce((a, r) => a + (r.summary.stage?.nearPlaneAtMaterial || 0), 0),
      minPlaneAtCondense: dist(list.map((r) => r.summary.stage?.minPlaneAtCondense ?? null)),
      minPlaneAtMaterial: dist(list.map((r) => r.summary.stage?.minPlaneAtMaterial ?? null)),
    };
    row.framesFollowNear = dist(list.map((r) => r.summary.framesFollowNear ?? null));
    row.framesJointBeforeHalt = dist(list.map((r) => r.summary.framesJointBeforeHalt ?? null));
    row.perFace = FACE_IDS.map((k) => {
      const faces = list.map((r) => r.faces[k - 1]);
      const done = faces.filter((f) => f.done);
      const total = (f) => (f.ms.moving + f.ms.gate + f.ms.approach + f.ms.turning) / 1000;
      const nextEntry = (r) => r.faces[k] ? r.faces[k].altEntry : null;
      return {
        face: k,
        reached: faces.filter((f) => f.frames > 0).length,
        cleared: done.length,
        faceSeconds: dist(done.map(total)),
        movingSeconds: dist(done.map((f) => f.ms.moving / 1000)),
        gateHeldSeconds: dist(done.map((f) => (f.ms.gate) / 1000)),
        gateStateSecondsAll: dist(faces.filter((f) => f.frames > 0).map((f) => f.ms.gate / 1000)),
        approachSeconds: dist(done.map((f) => f.ms.approach / 1000)),
        pivotWaitSeconds: dist(done.map((f) => f.pivotWaitMs === null ? 0 : f.pivotWaitMs / 1000)),
        gateArmToClearSeconds: dist(done.map((f) => f.gateArmToClearMs === null ? null : f.gateArmToClearMs / 1000)),
        driveThroughRate: done.length ? r2(done.filter((f) => f.driveThrough).length / done.length) : null,
        livesLost: dist(faces.filter((f) => f.frames > 0).map((f) => f.livesLost)),
        lethalEvents: dist(faces.filter((f) => f.frames > 0).map((f) => f.livesLost + f.fallbacks)),
        hits: dist(faces.filter((f) => f.frames > 0).map((f) => f.hits)),
        kills: dist(faces.filter((f) => f.frames > 0).map((f) => f.kills)),
        peakAboveDeck: dist(faces.filter((f) => f.frames > 0).map((f) => f.yMax)),
        climbUpTiles: dist(done.map((f) => f.climbUp)),
        climbUpPerSecond: dist(done.map((f) => f.climbUp / Math.max(1e-6, total(f)))),
        netAltGain: dist(list.filter((r) => r.faces[k - 1].done && nextEntry(r) !== null)
          .map((r) => nextEntry(r) - r.faces[k - 1].altEntry)),
        netAltPerSecond: dist(list.filter((r) => r.faces[k - 1].done && nextEntry(r) !== null)
          .map((r) => (nextEntry(r) - r.faces[k - 1].altEntry) / Math.max(1e-6, total(r.faces[k - 1])))),
        shareAbove6: dist(done.map((f) => f.aboveDeckMs[1] / Math.max(1, total(f) * 1000))),
        shareForward: dist(done.map((f) => f.framesForward / Math.max(1, f.frames))),
        shareScrollHeld: dist(done.map((f) => f.framesScrollHeld / Math.max(1, f.frames))),
        sharePinnedRight: dist(done.map((f) => f.framesPinned / Math.max(1, f.frames))),
        driveMean: dist(done.map((f) => f.driveMean)),
        terrainStallSeconds: dist(faces.filter((f) => f.frames > 0).map((f) => f.framesTerrainStall / 60)),
        // T-201
        holdAtJointSeconds: dist(done.map((f) => f.holdAtJointMs === null ? null
          : f.holdAtJointMs / 1000)),
        holdAtJointP90: p90(done.map((f) => f.holdAtJointMs === null ? null
          : f.holdAtJointMs / 1000)),
        holdAfterArrivalSeconds: dist(done.map((f) => f.holdAfterArrivalMs === null ? null
          : f.holdAfterArrivalMs / 1000)),
        pivotWaitP90: p90(done.map((f) => f.pivotWaitMs === null ? 0 : f.pivotWaitMs / 1000)),
        survivorsAtTurn: dist(done.map((f) => f.survivorsAtTurn)),
        pursuers: dist(done.map((f) => f.pursuers)),
        carried: dist(done.map((f) => f.carried)),
        carriedSeen: dist(done.map((f) => f.carriedSeen)),
        clearedAtTurnRate: done.length && done[0].clearedAtTurn !== null
          ? r2(done.filter((f) => f.clearedAtTurn).length / done.length) : null,
        beatMaxGapSeconds: dist(done.map((f) => f.beatMaxGapMs === null ? null : f.beatMaxGapMs / 1000)),
      };
    });
    rows.push(row);
  }
  return rows;
}

/* ------------------------------ report -------------------------------- */

function staticFacts(sample) {
  const lv = sample.level;
  const views = Object.fromEntries(Object.entries(VIEWPORTS).map(([id, v]) => {
    const e = viewportEdges(v.width, v.height, undefined, v.rigFraction);
    return [id, { ...v, left: r2(e.left), right: r2(e.right), widthTiles: r2(e.width),
      aheadOfSpawnTiles: r2(e.right - 6 - 0.35) }];
  }));
  return { level: lv, views };
}

function md(rows, facts) {
  const L = [];
  const fmt = (d) => d && d.n ? `${d.median} [${d.min}–${d.max}]` : '—';
  L.push('# T-104 race lab — shipped six-face run baseline');
  L.push('');
  L.push('Generated by `node tools/simlab/race/lab.mjs baseline`. Cells are `median [min–max]` over the group\'s runs.');
  L.push('');
  L.push('| group | viewport | n | outcomes | faces cleared | run s | victory s | lives lost | lethal events | forward share | scroll-held share | pinned-right share | lookahead tiles p10/med/p90 |');
  L.push('|---|---|---:|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    const la = r.lookaheadTiles;
    L.push(`| ${r.group} | ${r.viewport} | ${r.n} | ${Object.entries(r.outcomes).map(([k, v]) => k + ' ' + v).join(', ')} | ${fmt(r.facesCleared)} | ${fmt(r.runSeconds)} | ${fmt(r.victorySeconds)} | ${fmt(r.livesLost)} | ${fmt(r.lethalEvents)} | ${fmt(r.shareForward)} | ${fmt(r.shareScrollHeld)} | ${fmt(r.sharePinnedRight)} | ${la ? la.p10 + ' / ' + la.median + ' / ' + la.p90 : '—'} |`);
  }
  L.push('');
  for (const r of rows) {
    L.push(`## ${r.group} @ ${r.viewport} (n=${r.n})`);
    L.push('');
    L.push('| face | reached | cleared | face s | moving s | wait at closed joint s | gate-held s | drive-through | lethal events | lives lost | peak above deck | climb-up tiles | climb-up /s | net ALT gain m | net ALT m/s | forward share |');
    L.push('|---:|---:|---:|---|---|---|---|---:|---|---|---|---|---|---|---|---|');
    for (const f of r.perFace) {
      L.push(`| ${f.face} | ${f.reached} | ${f.cleared} | ${fmt(f.faceSeconds)} | ${fmt(f.movingSeconds)} | ${fmt(f.pivotWaitSeconds)} | ${fmt(f.gateHeldSeconds)} | ${f.driveThroughRate ?? '—'} | ${fmt(f.lethalEvents)} | ${fmt(f.livesLost)} | ${fmt(f.peakAboveDeck)} | ${fmt(f.climbUpTiles)} | ${fmt(f.climbUpPerSecond)} | ${fmt(f.netAltGain)} | ${fmt(f.netAltPerSecond)} | ${fmt(f.shareForward)} |`);
    }
    L.push('');
  }
  L.push('## Static framing facts');
  L.push('');
  L.push('| viewport | px | visible route width (tiles) | left edge | right edge | ahead of spawn x=6 |');
  L.push('|---|---|---:|---:|---:|---:|');
  for (const [id, v] of Object.entries(facts.views))
    L.push(`| ${id} | ${v.width}x${v.height} | ${v.widthTiles} | ${v.left} | ${v.right} | ${v.aheadOfSpawnTiles} |`);
  L.push('');
  return L.join('\n');
}

/* -------------------------------- main -------------------------------- */

async function baseline() {
  const runs = matrix();
  process.stderr.write(`race lab: ${runs.length} runs, ${JOBS} jobs\n`);
  const t0 = Date.now();
  const outs = await pool(runs, JOBS, (cfg) => runChild(cfg));
  const compact = outs.map(compactRun);
  const rows = aggregate(compact);
  const facts = staticFacts(compact[0]);
  globalThis.__HB_QUERY__ = '';
  const LV = await import('file://' + join(ROOT, 'src', 'sim', 'level.js'));
  const platformIds = LV.platforms.map((p) => p.id).filter(Boolean).sort();
  const reach = reachByPlay(compact, platformIds);
  mkdirSync(OUT_DIR, { recursive: true });
  const doc = {
    tool: 'tools/simlab/race/lab.mjs baseline',
    generatedFor: 'T-104',
    matrix: { seeds: SEEDS, viewports: LAB_VIEWPORTS, policies: POLICIES,
      oracleLatencies: ORACLE_LATENCIES, oracleSeeds: ORACLE_SEEDS, maxGameMs: MAX_GAME_MS,
      dtMs: 1000 / 60, query: QUERY },
    facts,
    reachByPlay: reach,
    aggregate: rows,
    runs: compact.map((r) => ({ key: r.key, fingerprint: r.fingerprint, simDigest: r.simDigest,
      summary: r.summary, faces: r.faces, landed: r.landed, hist: r.hist })),
    digest: fnv(compact.map((r) => r.key + ':' + r.fingerprint).join('\n')),
  };
  // compact: ~232 runs x 7 sides of per-face metrics; baseline.md is the human view
  writeFileSync(join(OUT_DIR, 'baseline.json'), JSON.stringify(doc));
  writeFileSync(join(OUT_DIR, 'baseline.md'), md(rows, facts));
  process.stderr.write(`race lab: done in ${Math.round((Date.now() - t0) / 1000)} s, digest ${doc.digest}\n`);
  process.stderr.write(`  wrote ${join(OUT_DIR, 'baseline.json')} and baseline.md\n`);
}

async function check() {
  const doc = JSON.parse(readFileSync(join(OUT_DIR, 'baseline.json'), 'utf8'));
  const m = doc.matrix;
  // --every K re-runs every K-th committed run (a deterministic subset that
  // still spans every viewport and group); the default re-runs all of them.
  const every = Math.max(1, parseInt(opt('every', '1'), 10));
  const picked = doc.runs.map((r, i) => ({ r, i })).filter(({ i }) => i % every === 0);
  const runs = picked.map(({ r }) => {
    const s = r.summary;
    return { policy: s.policy, seed: s.seed, viewport: s.viewport, maxGameMs: m.maxGameMs,
      query: s.query || '',
      ...(s.instrument ? { instrument: s.instrument, oracleLatencyMs: s.oracleLatencyMs } : {}) };
  });
  process.stderr.write(`race lab check: re-running ${runs.length} committed runs\n`);
  const outs = await pool(runs, JOBS, (cfg) => runChild(cfg));
  let bad = 0;
  outs.forEach((o, j) => {
    const committed = doc.runs[picked[j].i];
    if (o.fingerprint !== committed.fingerprint) {
      bad++;
      console.log('MISMATCH ' + committed.key + ': committed ' + committed.fingerprint + ' now ' + o.fingerprint);
    } else {
      console.log('ok ' + committed.key + ' ' + o.fingerprint);
    }
  });
  console.log(bad ? `race lab check: ${bad} of ${runs.length} runs differ — the numbers in the doc are stale for this tree`
    : `race lab check: all ${runs.length} run fingerprints reproduce (digest ${doc.digest})`);
  process.exit(bad ? 1 : 0);
}

function fnv(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  if (mode === 'baseline') await baseline();
  else if (mode === 'check') await check();
  else if (mode === 'one') {
    const out = await runChild({ ...(QUERY ? { query: QUERY } : {}), ...JSON.parse(argv[1] || '{}') });
    console.log(JSON.stringify({ summary: out.summary, fingerprint: out.fingerprint,
      simDigest: out.simDigest,
      corners: out.faces.slice(0, 6).map((f) => f.gate),
      faces: out.faces.map((f) => ({ face: f.face, ms: f.ms, kills: f.kills, hits: f.hits,
        livesLost: f.livesLost, fallbacks: f.fallbacks, altMax: f.altMax, yMax: f.yMax })) }, null, 1));
  } else {
    console.error('usage: lab.mjs baseline|check|one [--seeds N] [--jobs N] [--out dir]');
    process.exit(2);
  }
}
