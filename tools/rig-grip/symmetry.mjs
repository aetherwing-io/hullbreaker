#!/usr/bin/env node
// symmetry.mjs — is RIG lit the same facing left as facing right?
//
//   node tools/rig-grip/symmetry.mjs <capture dir> [--view desktop]
//
// Reads the cells a tools/rig-grip/capture.mjs run photographed. For every
// (gun, pose row, aim) the right-facing cell and the left-facing cell with the
// MIRRORED aim show one pose mirrored, and lighting does not care which way RIG
// faces, so their figures should have the same mean colour. A single pair is
// noisy (the mirrored sprite lands on a different sub-pixel phase; pre-T-103
// main's own pairs spread 0.94-1.07), so the verdict is on the AGGREGATE:
//   mean luma ratio L/R 1.000 +- 0.005, mean RGB delta (L - R) within +-0.5
//   per channel, and no pose row whose mean ratio is off by more than 0.015.
// Exit 0 = symmetric, 1 = not, 2 = no mirrored pairs found.
//
// Why it exists: T-103's re-posed arms were drawn as back faces when RIG
// faced left (clockwise triangles under a DoubleSide material), losing the key
// light. Every geometric gate (check.mjs, d77, the fist-to-grip capture) was
// blind to it: none of them looks at shading. This is a Node port of the T-103
// playtester's mirror-symmetry-check.py (reports/tasks/T-103/playtest.md,
// appendix): same mask, same pairing, same thresholds, same numbers.

import { existsSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { decodePng } from '../assets/lib/png.mjs';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const dir = process.argv[2] && !process.argv[2].startsWith('--') ? resolve(process.argv[2]) : null;
if (!dir) {
  console.error('usage: node tools/rig-grip/symmetry.mjs <capture dir> [--view desktop]');
  process.exit(2);
}
const view = arg('view', 'desktop');
const cells = join(dir, 'cells');

const MIRROR = { right: 'left', left: 'right', 'up-right': 'up-left', 'up-left': 'up-right',
  'down-left': 'down-right', 'down-right': 'down-left', up: 'up', down: 'down' };
const AIMS_LONGEST_FIRST = Object.keys(MIRROR).sort((a, b) => b.length - a.length);
const BG = [0x4a, 0x56, 0x5c];                 // capture.mjs isolation background
const LUMA = [0.2126, 0.7152, 0.0722];

// mean RGB of the figure: every pixel more than 30 (sum of |dRGB|) off the background
function figureMean(path) {
  const { width, height, rgba } = decodePng(path);
  let n = 0, r = 0, g = 0, b = 0;
  for (let i = 0; i < width * height * 4; i += 4) {
    if (Math.abs(rgba[i] - BG[0]) + Math.abs(rgba[i + 1] - BG[1]) + Math.abs(rgba[i + 2] - BG[2]) > 30) {
      n++; r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2];
    }
  }
  return n ? [r / n, g / n, b / n] : null;
}
const luma = (c) => c[0] * LUMA[0] + c[1] * LUMA[1] + c[2] * LUMA[2];
// numpy's default (linear) percentile
function percentile(sorted, p) {
  const at = (sorted.length - 1) * p / 100, lo = Math.floor(at), hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

const pairs = [];
const files = existsSync(cells) ? readdirSync(cells) : [];
for (const f of files.filter((name) => name.startsWith(`${view}-`) && name.endsWith('-R.png')).sort()) {
  const base = basename(f, '.png').slice(0, -2);              // drop "-R"
  const [, gun, ...restParts] = base.split('-');
  const rest = restParts.join('-');
  const aim = AIMS_LONGEST_FIRST.find((a) => rest.endsWith(`-${a}`));
  if (!aim) continue;
  const row = rest.slice(0, -(aim.length + 1));
  const twin = join(cells, `${view}-${gun}-${row}-${MIRROR[aim]}-L.png`);
  if (!existsSync(twin)) continue;
  const mR = figureMean(join(cells, f)), mL = figureMean(twin);
  if (!mR || !mL) continue;                                    // RIG not in one of the cells
  pairs.push({ gun, row, aim, ratio: luma(mL) / luma(mR), delta: [mL[0] - mR[0], mL[1] - mR[1], mL[2] - mR[2]] });
}
if (!pairs.length) {
  console.log(`no mirrored ${view} pairs in ${cells}`);
  process.exit(2);
}

const ratios = pairs.map((p) => p.ratio).sort((a, b) => a - b);
const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
const std = Math.sqrt(ratios.reduce((a, b) => a + (b - mean) ** 2, 0) / ratios.length);
const delta = [0, 1, 2].map((c) => pairs.reduce((a, p) => a + p.delta[c], 0) / pairs.length);
const rows = {};
for (const p of pairs) (rows[p.row] ||= []).push(p.ratio);
const rowMeans = Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length]));
const guns = {};
for (const p of pairs) (guns[p.gun] ||= []).push(p.ratio);

console.log(`${pairs.length} mirrored pairs in ${dir} (${view})`);
console.log(`  luma ratio L/R: mean ${mean.toFixed(4)}  std ${std.toFixed(4)}  p5 ${percentile(ratios, 5).toFixed(3)}  ` +
  `median ${percentile(ratios, 50).toFixed(3)}  p95 ${percentile(ratios, 95).toFixed(3)}`);
console.log(`  share of pairs more than 2 % darker facing left: ${(ratios.filter((r) => r < 0.98).length / ratios.length).toFixed(2)}`);
console.log(`  mean RGB delta (L - R): [${delta.map((d) => d.toFixed(2)).join(', ')}]`);
console.log('  mean luma ratio by row:', JSON.stringify(Object.fromEntries(Object.entries(rowMeans)
  .map(([k, v]) => [k, +v.toFixed(3)]))));
console.log('  mean luma ratio by gun:', JSON.stringify(Object.fromEntries(Object.entries(guns)
  .map(([k, v]) => [k, +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(3)]))));

const bad = [];
if (Math.abs(mean - 1) > 0.005) bad.push(`mean luma ratio ${mean.toFixed(4)} is not 1.000 +- 0.005`);
if (Math.max(...delta.map(Math.abs)) > 0.5) bad.push(`mean RGB delta [${delta.map((d) => d.toFixed(2))}] is not within +-0.5`);
for (const [k, v] of Object.entries(rowMeans)) if (Math.abs(v - 1) > 0.015) bad.push(`row ${k}: mean luma ratio ${v.toFixed(3)}`);
console.log(bad.length ? `NOT SYMMETRIC: ${bad.join('; ')}` : 'SYMMETRIC');
process.exitCode = bad.length ? 1 : 0;
