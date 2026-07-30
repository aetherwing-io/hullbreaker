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
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const playtestRoot = resolve(here, '..', '..');

function parseArgs(argv) {
  const out = { scripts: [], reps: 3, viewport: null, maxRuntimeMs: null, tag: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--reps') out.reps = Number(argv[++i]);
    else if (a === '--viewport') out.viewport = argv[++i];
    else if (a === '--max-runtime-ms') out.maxRuntimeMs = Number(argv[++i]);
    else if (a === '--tag') out.tag = argv[++i];
    else out.scripts.push(a);
  }
  return out;
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
  return {
    outcome: report.outcome && report.outcome.result,
    attempts: report.outcome && report.outcome.attempts,
    deaths: m.deaths,
    hits: m.hitsWithoutDeath,
    maxX: phys.length ? +Math.max(...phys.map((s) => s.x)).toFixed(2) : null,
    finalX: lastPlaying ? +lastPlaying.x.toFixed(2) : null,
    maxY: phys.length ? +Math.max(...phys.map((s) => s.y)).toFixed(2) : null,
    victoryMs: victory ? Math.round(victory.tMs) : null,
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.scripts.length === 0) {
    console.log('usage: node scripts/adversarial/repeat.mjs [--reps N] [--viewport WxH] <script.json ...>');
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
      const argv = ['run.mjs', scriptPath, '--out', outDir];
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
        `maxX=${fmt(d.maxX, 6)} victoryMs=${fmt(d.victoryMs, 6)} ` +
        `minMargin=${fmt(d.minEdgeMargin, 6)} idle=${fmt(d.idleFraction, 6)} ` +
        `deaths=${fmt(d.deaths, 3)} proto=${fmt(d.protoScore, 7)} ` +
        `pinned=${fmt(d.pinnedMs + 'ms@' + d.pinnedAtX, 14)} maxY=${fmt(d.maxY, 6)} ` +
        `routes=${d.routeIds.join('|') || '-'}`);
    }
  }
  console.log('\n' + JSON.stringify(rows.map((r) => ({ ...r, dir: undefined })), null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });
