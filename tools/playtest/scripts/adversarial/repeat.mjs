#!/usr/bin/env node
// repeat.mjs — adversarial-lane batch runner.
//
// The mission's honesty rule is "a policy completing once is not reliable —
// run it 3x before claiming viability". This wrapper does that: it invokes the
// unmodified ../../run.mjs N times per script, then pulls a few numbers out of
// each report.json that the standard summary.md does not print but an
// adversarial claim needs:
//
//   maxX / finalX          how far the policy actually got (victory is x >= 72)
//   victoryMs              wall-clock ms from run start to the VICTORY sample
//   marginAtEnd            crush-edge margin on the last PLAYING sample
//   pinnedAtX / pinnedMs   longest grounded stretch with |vx| < 1 (a policy
//                          that jams against a step looks like this)
//   maxY                   proves whether a policy ended up on the top tier
//
// It writes nothing into the repo except under tools/playtest/runs/, which is
// already gitignored. No harness file is modified; this only shells out to the
// existing CLI so every number stays reproducible by hand:
//
//   node run.mjs scripts/adversarial/<name>.json --out runs/adversarial/<dir>
//
// Usage:
//   node scripts/adversarial/repeat.mjs [--reps 3] [--viewport 1280x800]
//                                       [--max-runtime-ms 25000]
//                                       scripts/adversarial/a.json [b.json ...]

import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadavg } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const playtestRoot = resolve(here, '..', '..');

function parseArgs(argv) {
  const out = {
    scripts: [], reps: 3, viewport: null, maxRuntimeMs: null, tag: null,
    query: null, json: null, baseline: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--reps') out.reps = Number(argv[++i]);
    else if (a === '--viewport') out.viewport = argv[++i];
    else if (a === '--max-runtime-ms') out.maxRuntimeMs = Number(argv[++i]);
    else if (a === '--tag') out.tag = argv[++i];
    else if (a === '--query') out.query = argv[++i];
    else if (a === '--base-url') out.baseUrl = argv[++i];
    else if (a === '--json') out.json = argv[++i];
    else if (a === '--baseline') out.baseline = argv[++i];
    else out.scripts.push(a);
  }
  return out;
}

// --query appends extra params to each script's own url (e.g. an intensity
// variant flag) without editing the committed script. run.mjs's --url would
// also work but it bypasses the built-in static server, so instead we write a
// throwaway copy of the script with the mutated url into the gitignored runs
// tree and point run.mjs at that. The copy is what the report records, so a
// variant run is self-documenting.
async function variantScript(scriptPath, query, outDir) {
  const script = JSON.parse(await readFile(scriptPath, 'utf8'));
  const base = script.url || 'index.html?slice=traversal';
  const extra = query.replace(/^[?&]+/, '');
  script.url = base + (base.includes('?') ? '&' : '?') + extra;
  script.description = (script.description || '') +
    ` [run with extra query params: ${query}]`;
  const copyPath = resolve(outDir, 'script.json');
  await writeFile(copyPath, JSON.stringify(script, null, 2) + '\n');
  return copyPath;
}

function run(cmd, args, cwd) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => res({ code, out, err }));
    p.on('error', rej);
  });
}

// Longest stretch of consecutive grounded samples with |vx| < 1 tile/sec while
// PLAYING — the signature of a policy jammed against terrain it cannot climb.
function longestPin(trace) {
  let best = { ms: 0, x: null };
  let startMs = null, startX = null, prevMs = null;
  for (const s of trace) {
    const playing = s.state === 'PLAYING' || s.state == null;
    const pinned = playing && s.grounded === true && typeof s.vx === 'number' && Math.abs(s.vx) < 1;
    if (pinned) {
      if (startMs === null) { startMs = s.nowMs; startX = s.x; }
      prevMs = s.nowMs;
      if (prevMs - startMs > best.ms) best = { ms: Math.round(prevMs - startMs), x: +startX.toFixed(2) };
    } else {
      startMs = null;
    }
  }
  return best;
}

function digest(report) {
  const trace = report.trace || [];
  const phys = trace.filter((s) => typeof s.x === 'number');
  const playing = phys.filter((s) => s.state === 'PLAYING');
  const m = report.metrics || {};
  const victory = trace.find((s) => s.ovTitle === 'TRAVERSAL CLEAR' || s.state === 'VICTORY');
  const lastPlaying = playing[playing.length - 1] || null;
  const pin = longestPin(phys);
  // In-game seconds to victory, from the game's own clock rather than wall
  // time: gameMs at the victory sample minus gameMs at the first sample. This
  // is the number to compare across builds — wall time carries the driver's
  // startup offset with it.
  const withGameMs = trace.filter((s) => typeof s.gameMs === 'number');
  const victorySec = victory && typeof victory.gameMs === 'number' && withGameMs.length
    ? +((victory.gameMs - withGameMs[0].gameMs) / 1000).toFixed(2)
    : null;
  return {
    outcome: report.outcome && report.outcome.result,
    attempts: report.outcome && report.outcome.attempts,
    deaths: m.deaths,
    hits: m.hitsWithoutDeath,
    maxX: phys.length ? +Math.max(...phys.map((s) => s.x)).toFixed(2) : null,
    finalX: lastPlaying ? +lastPlaying.x.toFixed(2) : null,
    maxY: phys.length ? +Math.max(...phys.map((s) => s.y)).toFixed(2) : null,
    victoryMs: victory ? Math.round(victory.tMs) : null,
    victorySec,
    minEdgeMargin: m.closestCrushApproachTiles,
    marginAtEnd: lastPlaying && typeof lastPlaying.edgeMargin === 'number'
      ? +lastPlaying.edgeMargin.toFixed(2) : null,
    idleFraction: m.idleTime ? m.idleTime.idleTimeFraction : null,
    airMs: m.airborneTime ? m.airborneTime.airMs : null,
    protoScore: m.protoScore ? m.protoScore.protoScore : null,
    routeIds: (m.route && m.route.routeIds) || [],
    pocket: m.darePocket || null,
    weaponEnd: lastPlaying ? lastPlaying.weapon : null,
    pinnedMs: pin.ms,
    pinnedAtX: pin.x,
    errors: (report.consoleErrors || []).length + (report.pageErrors || []).length,
  };
}

function fmt(v, w) {
  const s = v === null || v === undefined ? '-' : String(v);
  return s.padEnd(w);
}

// Provenance for a baseline file. Learned the hard way: a baseline captured on
// 2026-07-29 straddled a mid-batch edit to lib/sampler.mjs and lib/driver.mjs,
// so its first two scripts were measured by one harness and the rest by
// another. A baseline that does not pin the harness as well as the game is not
// a baseline. The load average is recorded because in-game victory time is
// frame-rate sensitive (the sim's jump apex is discrete), so a batch run on a
// loaded machine is not time-comparable with one run on an idle machine.
async function provenance(playtestRoot) {
  // git pathspecs resolve against the process cwd, so this must run from the
  // repo root or it silently matches nothing and reports a clean tree.
  const repoRoot = resolve(playtestRoot, '..', '..');
  const head = await run('git', ['rev-parse', '--short', 'HEAD'], repoRoot);
  const dirty = await run('git',
    ['status', '--porcelain', '--', 'tools/playtest', 'src', 'index.html'], repoRoot);
  const libDir = resolve(playtestRoot, 'lib');
  const files = (await readdir(libDir)).filter((f) => f.endsWith('.mjs')).sort();
  const h = createHash('sha256');
  for (const f of files) h.update(await readFile(resolve(libDir, f)));
  h.update(await readFile(resolve(playtestRoot, 'run.mjs')));
  return {
    commit: head.code === 0 ? head.out.trim() : null,
    treeDirty: dirty.code === 0 ? dirty.out.trim().split('\n').filter(Boolean) : null,
    harnessHash: h.digest('hex').slice(0, 12),
    loadAvg1m: +loadavg()[0].toFixed(2),
  };
}

// Per-script aggregate across this invocation's repetitions: what a claim is
// allowed to say (the honesty rule is 3 runs before calling a policy viable).
function aggregate(rows) {
  const byName = new Map();
  for (const r of rows) {
    if (r.error) continue;
    if (!byName.has(r.name)) byName.set(r.name, []);
    byName.get(r.name).push(r);
  }
  const out = [];
  for (const [name, rs] of byName) {
    const wins = rs.filter((r) => r.outcome === 'completed');
    const num = (key, from) => {
      const vals = (from || rs).map((r) => r[key]).filter((v) => typeof v === 'number');
      return vals.length ? { min: +Math.min(...vals).toFixed(2), max: +Math.max(...vals).toFixed(2) } : null;
    };
    out.push({
      name, viewport: rs[0].viewport, runs: rs.length,
      completed: wins.length,
      outcomes: rs.map((r) => r.outcome),
      victorySec: num('victorySec', wins),
      minEdgeMargin: num('minEdgeMargin'),
      idleFraction: num('idleFraction'),
      maxY: num('maxY'),
      deaths: num('deaths'),
      routeIds: [...new Set(rs.flatMap((r) => r.routeIds || []))].sort(),
      rewardTaken: rs.some((r) => r.pocket && r.pocket.rewardTaken),
      errors: rs.reduce((a, r) => a + (r.errors || 0), 0),
    });
  }
  return out;
}

// Delta table against a frozen baseline (see baseline-2026-07-29.json). The
// regression question for an intensity variant is not "did anything change"
// but specifically: does the naive policy still complete, and does it still
// enjoy the same crush margin and the same clear time?
function compareToBaseline(current, baseline, now) {
  const base = new Map((baseline.scripts || []).map((s) => [s.name, s]));
  const d = (a, b) => (typeof a === 'number' && typeof b === 'number'
    ? (b - a >= 0 ? '+' : '') + (b - a).toFixed(2) : '?');
  console.log('\n[repeat] deltas vs baseline ' +
    `${baseline.capturedAt || '?'} (game ${baseline.commit || '?'}, ` +
    `harness ${baseline.harnessHash || '?'}), baseline -> now:`);
  if (baseline.harnessHash && now && baseline.harnessHash !== now.harnessHash) {
    console.log(`  NOTE harness changed since the baseline (${baseline.harnessHash} -> ${now.harnessHash}); ` +
      'outcome and margin stay comparable, victorySec does not.');
  }
  if (baseline.loadAvg1m && now && Math.abs(baseline.loadAvg1m - now.loadAvg1m) > 2) {
    console.log(`  NOTE machine load differs (${baseline.loadAvg1m} -> ${now.loadAvg1m} 1m avg); ` +
      'victorySec is frame-rate sensitive, so read outcome and margin first.');
  }
  for (const cur of current) {
    const b = base.get(cur.name);
    if (!b) { console.log(`  ${fmt(cur.name, 30)} (no baseline entry)`); continue; }
    const sameVp = b.viewport === cur.viewport;
    const bWin = `${b.completed}/${b.runs}`, cWin = `${cur.completed}/${cur.runs}`;
    const flag = b.completed > 0 && cur.completed === 0 ? '  <== NO LONGER COMPLETES'
      : b.completed === 0 && cur.completed > 0 ? '  <== NOW COMPLETES'
      : '';
    console.log(`  ${fmt(cur.name, 30)}` +
      ` completed ${fmt(bWin, 5)} -> ${fmt(cWin, 6)}` +
      ` victorySec ${fmt(b.victorySec && b.victorySec.min, 6)} -> ${fmt(cur.victorySec && cur.victorySec.min, 6)}` +
      ` (${d(b.victorySec && b.victorySec.min, cur.victorySec && cur.victorySec.min)})` +
      ` minMargin ${fmt(b.minEdgeMargin && b.minEdgeMargin.min, 6)} -> ${fmt(cur.minEdgeMargin && cur.minEdgeMargin.min, 6)}` +
      ` (${d(b.minEdgeMargin && b.minEdgeMargin.min, cur.minEdgeMargin && cur.minEdgeMargin.min)})` +
      (sameVp ? '' : ` [viewport ${b.viewport} -> ${cur.viewport}, not comparable]`) +
      flag);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.scripts.length === 0) {
    console.log(`usage: node scripts/adversarial/repeat.mjs [options] <script.json ...>

  --reps N            repetitions per script (default 3)
  --viewport WxH      viewport for every run
  --max-runtime-ms N  passed through to run.mjs (x1/x3/x4/x5/x6 need 26000)
  --tag NAME          suffix for the output directory names
  --query "&k=v"      extra URL params appended to each script's own url,
                      e.g. an intensity variant flag; the mutated script is
                      written next to the report so the run self-documents
  --json PATH         write the per-run rows + per-script aggregate to PATH
  --baseline PATH     print a delta table against a frozen baseline json`);
    process.exit(1);
  }
  const vpTag = args.viewport ? args.viewport : 'default';
  const rows = [];
  for (const scriptArg of args.scripts) {
    const scriptPath = resolve(process.cwd(), scriptArg);
    const name = basename(scriptPath, '.json');
    for (let rep = 1; rep <= args.reps; rep++) {
      const outDir = resolve(playtestRoot, 'runs', 'adversarial',
        `${name}-${vpTag}${args.tag ? '-' + args.tag : ''}-r${rep}`);
      await mkdir(outDir, { recursive: true });
      const target = args.query
        ? await variantScript(scriptPath, args.query, outDir)
        : scriptPath;
      const argv = ['run.mjs', target, '--out', outDir];
      // --base-url points every run at an already-running static server instead
      // of run.mjs's ephemeral one. The reason this exists: four separate
      // captures in this lane were invalidated by merges landing mid-batch,
      // because the built-in server serves the live working tree and a
      // twelve-script capture takes ~15 minutes. Serve a pinned worktree
      // instead and a capture describes exactly one build:
      //   git worktree add /tmp/hb-pin <sha> && (cd /tmp/hb-pin && python3 -m http.server 8749)
      //   node scripts/adversarial/repeat.mjs --base-url http://127.0.0.1:8749 ...
      if (args.baseUrl) {
        const script = JSON.parse(await readFile(target, 'utf8'));
        const rel = (script.url || 'index.html?slice=traversal').replace(/^\//, '');
        argv.push('--url', `${args.baseUrl.replace(/\/$/, '')}/${rel}`);
      }
      if (args.viewport) argv.push('--viewport', args.viewport);
      if (args.maxRuntimeMs) argv.push('--max-runtime-ms', String(args.maxRuntimeMs));
      const r = await run(process.execPath, argv, playtestRoot);
      if (r.code !== 0) {
        console.error(`[repeat] FAILED ${name} rep ${rep} (exit ${r.code})\n${r.err || r.out}`);
        rows.push({ name, rep, error: true });
        continue;
      }
      const report = JSON.parse(await readFile(resolve(outDir, 'report.json'), 'utf8'));
      rows.push({ name, rep, viewport: vpTag, dir: outDir, ...digest(report) });
      const d = rows[rows.length - 1];
      console.log(`[repeat] ${fmt(name, 26)} r${rep} ${fmt(d.outcome, 14)} ` +
        `maxX=${fmt(d.maxX, 6)} victorySec=${fmt(d.victorySec, 6)} ` +
        `minMargin=${fmt(d.minEdgeMargin, 6)} idle=${fmt(d.idleFraction, 6)} ` +
        `deaths=${fmt(d.deaths, 3)} proto=${fmt(d.protoScore, 7)} ` +
        `pinned=${fmt(d.pinnedMs + 'ms@' + d.pinnedAtX, 14)} maxY=${fmt(d.maxY, 6)} ` +
        `routes=${d.routeIds.join('|') || '-'}`);
    }
  }

  const agg = aggregate(rows);
  console.log('\n[repeat] per-script aggregate:');
  for (const a of agg) {
    console.log(`  ${fmt(a.name, 30)} completed ${a.completed}/${a.runs}` +
      `  victorySec ${fmt(a.victorySec ? a.victorySec.min + '-' + a.victorySec.max : '-', 13)}` +
      `  minMargin ${fmt(a.minEdgeMargin ? a.minEdgeMargin.min + '-' + a.minEdgeMargin.max : '-', 13)}` +
      `  errors ${a.errors}`);
  }

  const prov = await provenance(playtestRoot);
  if (args.baseline) {
    const baseline = JSON.parse(await readFile(resolve(process.cwd(), args.baseline), 'utf8'));
    compareToBaseline(agg, baseline, prov);
  }
  if (args.json) {
    const path = resolve(process.cwd(), args.json);
    await writeFile(path, JSON.stringify({
      capturedAt: new Date().toISOString().slice(0, 10),
      ...prov,
      query: args.query || null,
      viewport: vpTag,
      loadSensitiveFields: ['victorySec'],
      scripts: agg,
      runs: rows.map((r) => ({ ...r, dir: undefined })),
    }, null, 2) + '\n');
    console.log(`\n[repeat] wrote ${path}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
