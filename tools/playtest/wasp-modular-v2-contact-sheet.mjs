#!/usr/bin/env node

/* Render the actual one-atlas/two-mesh assembly at roughly shipped combat
   scale. Every cell uses the production body and wing geometry anchors; the
   sheet never bakes a special 64-frame asset that runtime cannot reproduce. */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const packDir = join(root, 'assets/generated/sprites/wasp-modular-v2');
const manifest = JSON.parse(readFileSync(join(packDir,
  'wasp-modular-atlas-v2.manifest.json'), 'utf8'));
const atlas = join(root, manifest.runtime.file);
const outDir = join(root, 'artifacts/wasp-modular-v2');
const out = join(outDir, 'wasp-8x8-game-scale.png');
const reportFile = join(outDir, 'wasp-8x8-game-scale.report.json');
const scratch = mkdtempSync(join(tmpdir(), 'hb-wasp-8x8-'));
mkdirSync(outDir, { recursive: true });

function magick(args) {
  return execFileSync('magick', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

const scale = 0.30;
const cellW = 88;
const cellH = 64;
const anchorX = 44;
const anchorY = 32;
const parts = new Map();

function part(row, layer, index) {
  const key = `${layer}-${index}`;
  if (parts.has(key)) return parts.get(key);
  const [x, y, w, h] = row.packedRectPx;
  const file = join(scratch, `${key}.png`);
  magick([atlas, '-crop', `${w}x${h}+${x}+${y}`, '+repage',
    '-filter', 'Lanczos', '-resize', `${Math.round(w * scale)}x${Math.round(h * scale)}!`,
    `PNG32:${file}`]);
  const result = {
    file,
    x: Math.round(anchorX - row.packedAnchorLocalPx[0] * scale),
    y: Math.round(anchorY - row.packedAnchorLocalPx[1] * scale),
  };
  parts.set(key, result);
  return result;
}

try {
  const rowFiles = [];
  for (let bodyIndex = 0; bodyIndex < 8; bodyIndex++) {
    const cells = [];
    for (let wingIndex = 0; wingIndex < 8; wingIndex++) {
      const wing = part(manifest.wingPhases[wingIndex], 'wing', wingIndex);
      const body = part(manifest.bodyStates[bodyIndex], 'body', bodyIndex);
      const cell = join(scratch, `cell-${bodyIndex}-${wingIndex}.png`);
      magick(['-size', `${cellW}x${cellH}`, 'xc:#10282d',
        wing.file, '-geometry', `+${wing.x}+${wing.y}`, '-composite',
        body.file, '-geometry', `+${body.x}+${body.y}`, '-composite',
        '-stroke', '#31525a', '-strokewidth', '1', '-fill', 'none',
        '-draw', `rectangle 0,0 ${cellW - 1},${cellH - 1}`,
        `PNG32:${cell}`]);
      cells.push(cell);
    }
    const rowFile = join(scratch, `row-${bodyIndex}.png`);
    magick([...cells, '+append', `PNG32:${rowFile}`]);
    rowFiles.push(rowFile);
  }
  magick([...rowFiles, '-append', '-define', 'png:compression-level=9', `PNG32:${out}`]);
  const identify = magick(['identify', '-format', '%wx%h', out]).trim();
  const report = {
    ok: true,
    file: 'artifacts/wasp-modular-v2/wasp-8x8-game-scale.png',
    dimensions: identify,
    combinations: 64,
    order: 'rows=body states 0..7, columns=wing phases 0..7',
    runtimeEquivalent: true,
    sourceTextures: 1,
    runtimeMeshesPerWasp: 2,
    gameScale: scale,
    cell: [cellW, cellH],
    anchor: [anchorX, anchorY],
    bodyStates: manifest.bodyStates.map((row) => row.id),
    wingPhases: manifest.wingPhases.map((row) => row.id),
  };
  writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
