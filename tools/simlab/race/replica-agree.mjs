#!/usr/bin/env node
/* replica-agree.mjs — do the two six-face replicas still play the same game?
 *
 *   node tools/simlab/race/replica-agree.mjs [--width 844 --height 390]
 *        [--query '<url query>'] [--stop-ms 70000] [--fire 0|1]
 *
 * The race lab (tools/simlab/race/run-child.mjs, T-104) and the turn lab
 * (tools/simlab/lib/sixface-host.mjs, T-102) each transcribe src/main.js's
 * boot, resetGame() and update() for the default six-face run, with their own
 * drift guards. This tool plays ONE frame-exact open-loop schedule (the
 * frame-input contract of src/pure/frame-input.js: hold right, a jump every
 * 900 ms, optionally hold fire) through both, each in a fresh process, and
 * diffs the final state field by field — RIG, scroll, kills, every live
 * hostile — plus every corner's lifecycle and carry-over counters. A MATCH
 * means the shared quantities the two labs report (corner timing, holds,
 * followers, staging) come from the same simulation. Exit 1 on a mismatch.
 * Zero effect on the shipped game.                                         */

import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const W = Number(opt('width', '844')), H = Number(opt('height', '390'));
const QUERY = opt('query', '');
const STOP_MS = Number(opt('stop-ms', '70000'));
const FIRE = opt('fire', '0') === '1';
const FIXED_DT = 1000 / 60;

export function schedule(stopMs, fire) {
  const ev = [];
  const hold = (code, a, b) => { ev.push({ t: a, type: 'keydown', code }); ev.push({ t: b, type: 'keyup', code }); };
  hold('ArrowRight', 0, stopMs - 100);
  if (fire) hold('KeyJ', 300, stopMs - 100);
  for (let t = 500; t < stopMs - 500; t += 900) hold('Space', t, t + 300);
  return ev;
}

const raceSrc = pathToFileURL(join(here, 'run-child.mjs')).href;
const hostSrc = pathToFileURL(join(here, '..', 'lib', 'sixface-host.mjs')).href;

function child(src) {
  return new Promise((res, rej) => execFile(process.execPath, ['--input-type=module', '-e', src],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }, (e, so, se) => {
      if (e) return rej(new Error(se || e.message));
      try { res(JSON.parse(so)); } catch (err) { rej(new Error('bad child output: ' + so.slice(0, 300))); }
    }));
}

const corners = `(WG) => WG.cornerEvents.map((c) => ({ k: c.k, state: c.state, primed: c.primed,
  beat: c.beat ?? null, released: c.released ?? null, survivorsAtTurn: c.survivorsAtTurn ?? null,
  pursuers: c.pursuers ?? null, carried: c.carried ?? null, dropped: c.dropped ?? null,
  beatLog: (c.beatLog || []).map((b) => [b.beat, b.reason, Math.round(b.atMs), b.spawned]) }))`;

async function viaRaceLab(events) {
  return child(`
    globalThis.__HB_QUERY__ = ${JSON.stringify(QUERY)};
    const { runOne } = await import(${JSON.stringify(raceSrc)});
    const r = await runOne({ viewport: { width: ${W}, height: ${H} }, query: ${JSON.stringify(QUERY)},
      replay: { events: ${JSON.stringify(events)}, stopAtMs: ${STOP_MS}, fixedDtMs: ${FIXED_DT} } });
    const WG = await import(${JSON.stringify(pathToFileURL(join(here, '..', '..', '..', 'src', 'sim', 'wavegate.js')).href)});
    process.stdout.write(JSON.stringify({ ticks: r.ticks, state: r.state, final: r.final,
      corners: (${corners})(WG) }));
  `);
}

async function viaTurnHost(events) {
  return child(`
    const { bootSixFace } = await import(${JSON.stringify(hostSrc)});
    const { finalState } = await import(${JSON.stringify(raceSrc)});
    const H = await bootSixFace({ query: ${JSON.stringify(QUERY)}, viewport: { width: ${W}, height: ${H} } });
    const { M, player } = H;
    const { gameMsToInputTick, GAMEPLAY_KEYMAP } = await import(${JSON.stringify(
      pathToFileURL(join(here, '..', '..', '..', 'src', 'pure', 'frame-input.js')).href)});
    H.resetGame();
    const dtMs = ${FIXED_DT};
    const sched = ${JSON.stringify(events)}.map((e, i) => ({ ...e, i, tick: gameMsToInputTick(e.t, dtMs) }))
      .sort((a, b) => a.tick - b.tick || a.t - b.t ||
        (a.type === b.type ? a.i - b.i : a.type === 'keyup' ? -1 : 1));
    const stopTick = gameMsToInputTick(${STOP_MS}, dtMs);
    let tick = 0, next = 0;
    while (M.ST.state === 'PLAYING') {
      while (next < sched.length && sched[next].tick <= tick) {
        const e = sched[next++]; const k = GAMEPLAY_KEYMAP[e.code];
        if (k) H.keyEdge(k, e.type === 'keydown');
      }
      if (tick >= stopTick) break;
      H.update(dtMs / 1000);
      tick++;
    }
    process.stdout.write(JSON.stringify({ ticks: tick, state: M.ST.state,
      final: finalState({ T: M.T, p: player, HO: M.HO, WP: M.WP, c: M.WG.activeCorner(), E: M.E }),
      corners: (${corners})(M.WG) }));
  `);
}

function diff(a, b, path = '') {
  if (typeof a !== typeof b) return [`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`];
  if (a && typeof a === 'object') {
    const out = [];
    for (const k of new Set([...Object.keys(a), ...Object.keys(b || {})]))
      out.push(...diff(a[k], b ? b[k] : undefined, path + '.' + k));
    return out;
  }
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 1e-6 ? [] : [`${path}: ${a} vs ${b}`];
  return a === b ? [] : [`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`];
}

export async function agree() {
  const events = schedule(STOP_MS, FIRE);
  const [race, turn] = await Promise.all([viaRaceLab(events), viaTurnHost(events)]);
  const diffs = diff(race, turn);
  return { viewport: `${W}x${H}`, query: QUERY, stopMs: STOP_MS, fire: FIRE, ticks: race.ticks,
    turned: race.corners.filter((c) => c.state === 'done').length,
    followers: race.corners.reduce((a, c) => a + (c.pursuers || 0), 0),
    hostilesAtEnd: race.final.hostiles.length, match: diffs.length === 0, diffs: diffs.slice(0, 20) };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const r = await agree();
  console.log(JSON.stringify(r, null, 1));
  process.exit(r.match ? 0 : 1);
}
