#!/usr/bin/env node
/* daylight.mjs — where does a run lose the daylight behind it?
 *
 *   node tools/simlab/race/daylight.mjs '{"policy":"carried","seed":1,"viewport":"phone-landscape-6pct"}'
 *   node tools/simlab/race/daylight.mjs --preset phone-crowding
 *
 * Table M7b in docs/proposals/2026-10-race-to-the-top.md reports the
 * DISTRIBUTION of daylight (RIG's back to the damage plane) per group and
 * viewport. This asks the follow-up question the distribution cannot: on the
 * frames where daylight is nearly gone, what is the run DOING? It samples a
 * single run's trace every 100 ms and splits the frames under
 * `--under` tiles by corner state (moving / gate / approach / turning /
 * outro), because a frozen plane during a held gate and an advancing plane
 * during a climb are different design problems:
 *
 *   - `gate`      the pursuit plane is frozen and the fight pushed RIG left
 *                 (a staging/arena question — proposal §4.5 rule 4);
 *   - `moving`    the plane is advancing and RIG is behind it
 *                 (a pace/route question — the crush margin proper).
 *
 * Deterministic: each run is ONE fresh child process (run-child.mjs), exactly
 * as lab.mjs does it, so the fingerprints match the matrix's. The sim modules
 * are module-level singletons: a second runOne() in the same process is NOT a
 * fresh run (it returns an empty trace and a different fingerprint), which is
 * why nothing here calls it in-process. Zero effect on the shipped game.
 * Honesty notes: tools/simlab/README.md "race lab".                        */

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIEWPORTS, viewportEdges } from './edges.mjs';

const CHILD = join(dirname(fileURLToPath(import.meta.url)), 'run-child.mjs');

function runChild(cfg) {
  return new Promise((res, rej) => {
    const p = spawn(process.execPath, [CHILD, JSON.stringify(cfg)]);
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => {
      if (code !== 0) return rej(new Error('run-child failed: ' + err));
      try { res(JSON.parse(out)); } catch (e) { rej(new Error('bad child JSON: ' + e.message)); }
    });
  });
}

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const UNDER = Number(opt('under', '3'));
const EVERY_MS = Number(opt('every-ms', '100'));
const PRESETS = {
  // the four runs the proposal's §4.5 rule 4 quotes
  'phone-crowding': [
    { policy: 'rush', seed: 1, viewport: 'phone-landscape-6pct' },
    { policy: 'fighter', seed: 3, viewport: 'phone-landscape-6pct' },
    { policy: 'carried', seed: 1, viewport: 'phone-landscape-6pct' },
    { policy: 'carried', seed: 1, viewport: 'desktop-16x10' },
  ],
};

const json = argv.find((a) => a.trim().startsWith('{'));
const preset = opt('preset', null);
const configs = json ? [JSON.parse(json)] : preset ? PRESETS[preset] : PRESETS['phone-crowding'];
if (!configs) throw new Error(`daylight.mjs: unknown preset ${preset} (have ${Object.keys(PRESETS).join(', ')})`);

for (const cfg of configs) {
  const vp = VIEWPORTS[cfg.viewport] || VIEWPORTS['desktop-16x10'];
  const left = viewportEdges(vp.width, vp.height, undefined, vp.rigFraction).left;
  const run = await runChild({ maxGameMs: 600000, ...cfg, traceEveryMs: EVERY_MS });
  const byState = {};
  let samples = 0, under = 0, min = Infinity;
  for (const [, x, , scrollX, seg] of run.trace) {
    const daylight = (x - 0.35) - (scrollX + left);   // RIG's back to the damage plane
    samples++;
    min = Math.min(min, daylight);
    if (daylight < UNDER) { under++; byState[seg] = (byState[seg] || 0) + 1; }
  }
  const id = `${cfg.policy}|${cfg.viewport}|${cfg.seed}`;
  console.log(`${id.padEnd(34)} fp ${run.fingerprint}  samples ${String(samples).padStart(5)}  ` +
    `under ${UNDER} tiles: ${String(under).padStart(5)} (${(100 * under / samples).toFixed(0)}%)  ` +
    `min ${min.toFixed(2)}  by state ${JSON.stringify(byState)}`);
}
