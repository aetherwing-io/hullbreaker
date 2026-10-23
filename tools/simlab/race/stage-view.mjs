#!/usr/bin/env node
/* stage-view.mjs — the PLAYED successor of gate-view.mjs (T-201).
 *
 *   node tools/simlab/race/stage-view.mjs [path/to/baseline.json]
 *
 * gate-view.mjs is static: it asks whether each authored gate socket lies
 * inside the view HELD at HALT_S — the question a held gate (now the
 * `?gates=legacy` escape hatch) poses. Under the default rolling corner no
 * view is held: every body is staged against the LIVE view at the moment its
 * beat is released (src/sim/wavegate.js spawnRollingRole), and followers
 * re-enter against the live view after a turn. So the question becomes a
 * played one, and run-child.mjs records it for every encounter body and every
 * follower of every run: where it stood against the live view the frame it
 * began to condense and the frame it became shootable (summary.stage). This
 * tool reads a lab.mjs baseline and prints, per viewport, how many bodies were
 * staged, how many began outside the view, how many stood within 6 tiles of
 * the damage plane, and the nearest distance — the numbers T-201's "visible
 * beats" box is judged on. (The race lab measures against the sim's strip;
 * tools/simlab/lib/turn-proof.mjs checks the projected camera frame.)
 * Read-only; zero effect on the game.                                      */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = resolve(process.argv[2] || 'artifacts/t104-race/baseline.json');
const doc = JSON.parse(readFileSync(file, 'utf8'));
const byVp = new Map();
for (const r of doc.runs) {
  const s = r.summary;
  if (!s.stage) continue;
  const v = byVp.get(s.viewport) || { runs: 0, condense: 0, outC: 0, nearC: 0, material: 0, outM: 0, nearM: 0,
    minC: Infinity, minM: Infinity, worst: [] };
  v.runs++;
  v.condense += s.stage.condense; v.outC += s.stage.outsideAtCondense; v.nearC += s.stage.nearPlaneAtCondense;
  v.material += s.stage.material; v.outM += s.stage.outsideAtMaterial; v.nearM += s.stage.nearPlaneAtMaterial;
  if (Number.isFinite(s.stage.minPlaneAtCondense)) v.minC = Math.min(v.minC, s.stage.minPlaneAtCondense);
  if (Number.isFinite(s.stage.minPlaneAtMaterial)) v.minM = Math.min(v.minM, s.stage.minPlaneAtMaterial);
  for (const w of s.stage.worst || []) if (v.worst.length < 6) v.worst.push({ run: r.key, ...w });
  byVp.set(s.viewport, v);
}
console.log(`staging against the live view — ${file} (query "${doc.matrix?.query || ''}")`);
console.log('| viewport | runs | bodies began condensing | outside the view | < 6 tiles from the plane | nearest (tiles) | became shootable | outside then | < 6 then | nearest then |');
console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const [vp, v] of byVp)
  console.log(`| ${vp} | ${v.runs} | ${v.condense} | ${v.outC} | ${v.nearC} | ${Number.isFinite(v.minC) ? v.minC : '—'} | ` +
    `${v.material} | ${v.outM} | ${v.nearM} | ${Number.isFinite(v.minM) ? v.minM : '—'} |`);
for (const [vp, v] of byVp) if (v.worst.length)
  console.log(`  ${vp} first offenders: ${v.worst.map((w) => `${w.kind}@${w.x} [${w.L}, ${w.R}] ${w.enc}`).join('; ')}`);
