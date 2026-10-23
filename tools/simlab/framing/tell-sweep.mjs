#!/usr/bin/env node
/* tell-sweep.mjs — when does a hostile telegraph ON SCREEN in the run that
 * tools/playtest/phone-readability-capture.mjs photographs? (T-107 box 5: a
 * readability photo needs a mark that lands on a tell.)
 *
 *   node tools/simlab/framing/tell-sweep.mjs [--viewport phone-landscape|phone-landscape-far|desktop-16x10]
 *        [--from 3000] [--to 40000] [--step 250] [--jobs 3] > sweep.jsonl
 *
 * Replays the capture tool's exact frame-input schedule (right + fire held, a
 * jump every 0.9 s) through the race lab's Node transcription of the game
 * (tools/simlab/race/run-child.mjs replay mode — browser-check.mjs proves it
 * against Chrome), stopped at each sample time, ONE CHILD PROCESS PER SAMPLE
 * (the replica's modules keep state between runs in one process). Prints one
 * JSON line per sample: the game clock, scroll, RIG, and every hostile in a
 * tell/fuse/dive state whose x is inside the calibrated screen strip.
 * Honest limits: "inside the strip" is the sim's view, not occlusion or the
 * facet cull; choose marks, then judge the photos. Dev-only; zero effect on
 * the game.                                                                */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const SELF = fileURLToPath(import.meta.url);
const ROOT = new URL('../../../', import.meta.url);

if (argv[0] === '--child') {
  const [vp, t] = [argv[1], +argv[2]];
  const { runOne } = await import(new URL('tools/simlab/race/run-child.mjs', ROOT).href);
  const { viewportEdges, VIEWPORTS } = await import(new URL('tools/simlab/race/edges.mjs', ROOT).href);
  const { CONFIG } = await import(new URL('src/config.js', ROOT).href);
  const events = [{ t: 0, type: 'keydown', code: 'ArrowRight' }, { t: 120, type: 'keydown', code: 'KeyJ' }];
  for (let s = 600; s < 600000; s += 900) {
    events.push({ t: s, type: 'keydown', code: 'Space' });
    events.push({ t: s + 180, type: 'keyup', code: 'Space' });
  }
  const v = VIEWPORTS[vp];
  const e = viewportEdges(v.width, v.height, CONFIG, v.rigFraction);
  const r = await runOne({ viewport: vp, replay: { events: events.filter((x) => x.t <= t), stopAtMs: t, fixedDtMs: 16.667 } });
  const f = r.final;
  const L = f.scrollX + e.left, R = f.scrollX + e.routeRight;
  const tells = (f.hostiles || []).filter((h) => /tell|fuse|dive/i.test(String(h.state)) && h.x >= L && h.x <= R);
  process.stdout.write(JSON.stringify({ t, gameMs: f.gameMs, scrollX: f.scrollX, rig: [f.player.x, f.player.y], hp: f.player.hp,
    state: r.state, hostiles: (f.hostiles || []).length,
    tells: tells.map((h) => `${h.kind}:${h.state}@${h.x.toFixed(1)},${h.y.toFixed(1)}`) }) + '\n');
  process.exit(0);
}

const vp = opt('viewport', 'phone-landscape');
const from = +opt('from', '3000'), to = +opt('to', '40000'), step = +opt('step', '250');
const jobs = Math.max(1, +opt('jobs', '3'));
const times = [];
for (let t = from; t <= to; t += step) times.push(t);
const rows = new Array(times.length);
let next = 0;
async function worker() {
  while (next < times.length) {
    const i = next++;
    rows[i] = await new Promise((res) => {
      const c = spawn(process.execPath, [SELF, '--child', vp, String(times[i])], { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '', err = '';
      c.stdout.on('data', (d) => { out += d; });
      c.stderr.on('data', (d) => { err += d; });
      c.on('close', (code) => res(code === 0 ? out.trim() : JSON.stringify({ t: times[i], error: err.slice(0, 300) })));
    });
  }
}
await Promise.all(Array.from({ length: jobs }, worker));
process.stdout.write(rows.join('\n') + '\n');
