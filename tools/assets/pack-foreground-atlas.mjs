#!/usr/bin/env node
/* Pack four ImageGen-authored 4x4 source sheets into the ONE resident 8x8
 * Meridian foreground atlas.  Source sheets stay as review/provenance assets;
 * runtime never requests them.  Normalising each sheet before the quadrant
 * append makes every production cell exactly 256px and keeps crop arithmetic
 * independent of ImageGen's current 1254px preview size. */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(new URL('../..', import.meta.url).pathname);
const sourceDir = join(root, 'assets/generated/environment/foreground-pack-sources');
const sources = [
  ['A', 'surface-fascia-wear', 'meridian-pack-source-a-surfaces.png'],
  ['B', 'service-machinery-insets', 'meridian-pack-source-b-service.png'],
  ['C', 'structural-traversal-resources', 'meridian-pack-source-c-structure.png'],
  ['D', 'observe-through-scuttle-defense-states', 'meridian-pack-source-d-defense.png'],
];
const output = resolve(process.argv[2] ||
  join(root, 'assets/generated/environment/meridian-foreground-pack-v1.png'));
const manifestFile = output.replace(/\.png$/i, '.manifest.json');
const work = mkdtempSync(join(tmpdir(), 'hullbreaker-foreground-pack-'));

function magick(args) {
  const result = spawnSync('magick', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout ||
    `magick ${args[0]} failed with ${result.status}`);
  return result.stdout;
}

function dimensions(file) {
  const out = magick(['identify', '-format', '%w %h', file]).trim();
  const [width, height] = out.split(/\s+/).map(Number);
  return { width, height };
}

function packedCell(sheetIndex, localIndex) {
  const quadrantCol = sheetIndex % 2;
  const quadrantRow = Math.floor(sheetIndex / 2);
  const col = quadrantCol * 4 + localIndex % 4;
  const row = quadrantRow * 4 + Math.floor(localIndex / 4);
  return { index: row * 8 + col, col, row };
}

try {
  mkdirSync(dirname(output), { recursive: true });
  const normalized = [];
  const sourceStats = [];
  for (let i = 0; i < sources.length; i++) {
    const [id, role, name] = sources[i];
    const source = join(sourceDir, name);
    const size = dimensions(source);
    if (size.width !== size.height || size.width < 1024)
      throw new Error(`${name}: expected square source >=1024px, got ${size.width}x${size.height}`);
    const target = join(work, `${id}.png`);
    magick([source, '-filter', 'Lanczos', '-resize', '1024x1024!',
      '-alpha', 'off', '-type', 'TrueColor', target]);
    normalized.push(target);
    sourceStats.push({ id, role, file: name, ...size, acceptedCells: 16, rejectedCells: [] });
  }

  magick([
    '(', normalized[0], normalized[1], '+append', ')',
    '(', normalized[2], normalized[3], '+append', ')',
    '-append', '+repage', '-alpha', 'off', '-type', 'TrueColor',
    '-define', 'png:compression-level=9', `PNG24:${output}`,
  ]);

  const packedSize = dimensions(output);
  if (packedSize.width !== 2048 || packedSize.height !== 2048)
    throw new Error(`packed atlas must be 2048x2048, got ${packedSize.width}x${packedSize.height}`);

  const statText = magick([
    output, '-crop', '256x256', '+repage',
    '-format', '%[fx:mean.r] %[fx:mean.g] %[fx:mean.b]\n', 'info:',
  ]).trim();
  const samples = statText.split('\n').filter(Boolean).map((line) =>
    line.trim().split(/\s+/).map(Number));
  if (samples.length !== 64) throw new Error(`expected 64 packed samples, got ${samples.length}`);
  for (let i = 0; i < samples.length; i++) {
    const mean = (samples[i][0] + samples[i][1] + samples[i][2]) / 3;
    if (!(mean > 0.025 && mean < 0.72))
      throw new Error(`cell ${i}: implausible mean ${mean.toFixed(4)} (empty/washed crop)`);
  }
  const defenseCells = [];
  for (let local = 0; local < 16; local++) defenseCells.push(packedCell(3, local).index);
  // The defense-state cells must survive as mechanisms rather than uniform
  // dark cards at gameplay scale. Downsample each to 32px and measure its
  // grayscale standard deviation: a bounded contrast contract that works for
  // dormant sensors, seals, purge organs and unlit Scuttle damage alike.
  const defenseContrasts = defenseCells.map((index) => {
    const x = (index % 8) * 256;
    const y = Math.floor(index / 8) * 256;
    return Number(magick([
      '-extract', `256x256+${x}+${y}`, output, '+repage',
      '-colorspace', 'Gray', '-resize', '32x32!',
      '-format', '%[fx:standard_deviation]', 'info:',
    ]).trim());
  });
  const defenseContrast = defenseContrasts.reduce((sum, value) => sum + value, 0) /
    defenseContrasts.length;
  if (defenseContrasts.some((value) => value < 0.04) || defenseContrast < 0.052)
    throw new Error(`defense-state detail collapse at 32px: ${defenseContrasts.join(', ')}`);

  const cells = [];
  for (let sheet = 0; sheet < sources.length; sheet++) {
    for (let local = 0; local < 16; local++) {
      const packed = packedCell(sheet, local);
      cells.push({
        sheet: sources[sheet][0], localIndex: local, ...packed,
        meanRgb: samples[packed.index].map((value) => Math.round(value * 10000) / 10000),
      });
    }
  }
  cells.sort((a, b) => a.index - b.index);
  const manifest = {
    version: 1,
    runtime: {
      file: output.slice(root.length + 1),
      width: 2048,
      height: 2048,
      grid: [8, 8],
      cell: [256, 256],
      gpuTextures: 1,
      emissive: false,
      minFilter: 'LinearMipmapLinearFilter',
      uvGuardPx: 6,
    },
    review: {
      humanApproved: true,
      approvedChoices: 64,
      rejectedChoices: 0,
      identicalOuterFramesAreCroppedAtRuntime: true,
      fullFramesReservedForDeepApertures: true,
      canonicalDefenseStates: [
        'observe', 'intercept', 'contain', 'quarantine', 'sterilize', 'scuttle',
      ],
      minifiedDefenseContrast: Math.round(defenseContrast * 10000) / 10000,
    },
    sources: sourceStats,
    cells,
  };
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({
    output, manifest: manifestFile,
    minifiedDefenseContrast: Math.round(defenseContrast * 10000) / 10000,
    sourceStats,
  }, null, 2));
} finally {
  // `work` is an explicit directory created by this process under os.tmpdir.
  rmSync(work, { recursive: true, force: true });
}
