#!/usr/bin/env node
/* Offline visual proof for the deliberately unwired Meridian defense VFX pack.
   It renders at packed/native game scale: no browser, server, Three scene, or
   animation loop. This keeps review cheap while still exercising the exact
   atlas rectangles, opacity caps, pivots, and lifecycle metadata. */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const manifestFile = join(root,
  'assets/generated/vfx/meridian-defense-vfx-pack-v1.manifest.json');
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
const atlas = join(root, manifest.runtime.file);
const outDir = resolve(process.argv[2] || '/private/tmp/hullbreaker-defense-vfx-proof');
mkdirSync(outDir, { recursive: true });

function magick(args) {
  const result = spawnSync('magick', args, {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`magick ${args.join(' ')} failed (${result.status}):\n${result.stderr}`);
  }
  return result.stdout;
}

function component(id) {
  const entry = manifest.components.find((item) => item.id === id);
  if (!entry) throw new Error(`unknown component ${id}`);
  return entry;
}

function extract(entry, file, opacity = entry.maxOpacity) {
  const [x, y, w, h] = entry.packedRectPx;
  magick([
    atlas,
    '-crop', `${w}x${h}+${x}+${y}`,
    '+repage',
    '-channel', 'A',
    '-evaluate', 'multiply', String(opacity),
    '+channel',
    '-define', 'png:compression-level=9',
    `PNG32:${file}`,
  ]);
  return { file, width: w, height: h };
}

function placement(entry, originX, originY) {
  const [, , w, h] = entry.packedRectPx;
  return {
    x: Math.round(originX - w * entry.origin[0]),
    y: Math.round(originY - h * entry.origin[1]),
  };
}

const stageColor = {
  tell: '#6c8a90',
  fire: '#d99a62',
  recovery: '#825c7d',
  spent: '#4f5960',
};

const contact = join(outDir, 'contact-sheet-native-opacity.png');
const contactWidth = 1680;
const contactHeight = 1090;
const left = 268;
const top = 126;
const cellW = 174;
const cellH = 116;
const contactArgs = [
  '-size', `${contactWidth}x${contactHeight}`,
  'gradient:#071820-#19343b',
  '-font', 'Menlo-Bold',
  '-fill', '#f4e6bd',
  '-pointsize', '28',
  '-gravity', 'northwest',
  '-annotate', '+28+24', 'MERIDIAN DEFENSE ACTIVATION // 64 NATIVE-SCALE COMPONENTS',
  '-font', 'Courier',
  '-fill', '#aabfc1',
  '-pointsize', '16',
  '-annotate', '+30+67', 'DORMANT = DRAW NOTHING  |  each sprite shown at metadata maxOpacity  |  TELL / FIRE / RECOVERY / SPENT',
];

const categoryOrder = Object.keys(manifest.review.categories);
for (let row = 0; row < categoryOrder.length; row++) {
  const category = categoryOrder[row];
  const entries = manifest.components.filter((entry) => entry.category === category);
  const y = top + row * cellH;
  contactArgs.push(
    '-font', 'Menlo-Bold', '-fill', '#c8d4d2', '-pointsize', '15',
    '-annotate', `+24+${y + 43}`, category.toUpperCase().replaceAll('-', ' '),
  );
  for (let col = 0; col < entries.length; col++) {
    const entry = entries[col];
    const x = left + col * cellW;
    const sprite = join(outDir, `.contact-${row}-${col}.png`);
    const { width, height } = extract(entry, sprite);
    const spriteX = x + Math.round((cellW - width) / 2);
    const spriteY = y + Math.max(4, Math.round((78 - height) / 2));
    contactArgs.push(
      '-stroke', stageColor[entry.timingState], '-strokewidth', '1',
      '-fill', '#0c2028cc', '-draw', `roundrectangle ${x + 3},${y + 3} ${x + cellW - 5},${y + cellH - 5} 5,5`,
      sprite, '-geometry', `+${spriteX}+${spriteY}`, '-composite',
      '-font', 'Courier', '-fill', '#d7ded8', '-pointsize', '13',
      '-annotate', `+${x + 9}+${y + 98}`,
      `${entry.timingState.toUpperCase()} ${entry.durationMs}ms  a${entry.maxOpacity.toFixed(2)}`,
    );
  }
}
contactArgs.push('-define', 'png:compression-level=9', `PNG24:${contact}`);
magick(contactArgs);

function baseHull(file, mode) {
  const cold = mode === 'cold';
  const bg = cold ? 'gradient:#061820-#173945' : 'gradient:#191317-#51322a';
  const plate = cold ? '#263b42' : '#4c3430';
  const plateDark = cold ? '#13262d' : '#2a2020';
  const rail = cold ? '#765036' : '#a4683e';
  const seam = cold ? '#071116' : '#170d0d';
  const socket = cold ? '#aec7c7' : '#ffe0a2';
  const modeLabel = cold
    ? 'COLD HULL // OBSERVE → INTERCEPT // TELL ONLY'
    : 'WARM HULL // ACTIVE RESPONSE // FIRE + RECOVERY';
  magick([
    '-size', '1600x900', bg,
    '-fill', plateDark, '-stroke', '#091419', '-strokewidth', '8',
    '-draw', 'polygon 80,210 1510,165 1550,700 1010,790 110,725',
    '-fill', plate, '-stroke', rail, '-strokewidth', '5',
    '-draw', 'roundrectangle 130,250 760,660 24,24',
    '-draw', 'roundrectangle 850,230 1470,680 24,24',
    '-fill', '#101d22', '-stroke', '#6d4b35', '-strokewidth', '4',
    '-draw', 'roundrectangle 215,330 675,565 16,16',
    '-draw', 'roundrectangle 935,315 1385,575 16,16',
    '-fill', seam, '-stroke', rail, '-strokewidth', '3',
    '-draw', 'rectangle 784,198 824,720',
    '-fill', '#10181b', '-stroke', rail, '-strokewidth', '5',
    '-draw', 'circle 410,390 432,390',
    '-draw', 'circle 410,540 432,540',
    '-draw', 'circle 1190,390 1212,390',
    '-draw', 'circle 1190,540 1212,540',
    '-fill', socket, '-stroke', 'none',
    '-draw', 'circle 410,390 418,390',
    '-draw', 'circle 410,540 418,540',
    '-draw', 'circle 1190,390 1198,390',
    '-draw', 'circle 1190,540 1198,540',
    '-stroke', '#8f6745', '-strokewidth', '3', '-fill', 'none',
    '-draw', 'line 310,285 310,635 line 530,285 530,635 line 1060,270 1060,650 line 1305,270 1305,650',
    '-font', 'Menlo-Bold', '-fill', '#f2e2b5', '-pointsize', '26',
    '-gravity', 'northwest', '-annotate', '+36+34', modeLabel,
    '-font', 'Courier', '-fill', '#b4c3c1', '-pointsize', '17',
    '-annotate', '+38+76', '1x packed/native scale · effects anchored to hull sockets and seams · no RIG/projectile attachment',
    '-define', 'png:compression-level=9', `PNG24:${file}`,
  ]);
}

function addEffects(base, output, placements) {
  const args = [base];
  placements.forEach(({ id, origin, opacity }) => {
    const entry = component(id);
    const sprite = join(outDir, `.proof-${output.split('/').pop()}-${id}.png`);
    extract(entry, sprite, opacity ?? entry.maxOpacity);
    const point = placement(entry, origin[0], origin[1]);
    args.push(sprite, '-geometry', `+${point.x}+${point.y}`, '-composite');
  });
  args.push('-define', 'png:compression-level=9', `PNG24:${output}`);
  magick(args);
}

const coldBase = join(outDir, '.cold-hull-base.png');
const warmBase = join(outDir, '.warm-hull-base.png');
baseHull(coldBase, 'cold');
baseHull(warmBase, 'warm');

const cold = join(outDir, 'cold-hull-observe-intercept-tells.png');
addEffects(coldBase, cold, [
  { id: 'sensor-wake-chevrons', origin: [410, 390] },
  { id: 'sensor-wedge-sweep', origin: [410, 540] },
  { id: 'clamp-opposed-jaws', origin: [804, 390] },
  { id: 'clamp-diagonal-lock-rails', origin: [804, 540] },
]);

const warm = join(outDir, 'warm-hull-observe-intercept-active.png');
addEffects(warmBase, warm, [
  { id: 'sensor-scan-fan', origin: [410, 390] },
  { id: 'sensor-range-ripple', origin: [410, 540] },
  { id: 'clamp-strike-burst', origin: [804, 390] },
  { id: 'clamp-lock-pin-cross', origin: [804, 540] },
  { id: 'sensor-ghost-rake', origin: [1190, 390] },
  { id: 'clamp-spark-recoil', origin: [1190, 540] },
]);

const timeline = join(outDir, 'observe-intercept-lifecycle.png');
const timelineArgs = [
  '-size', '1600x520', 'gradient:#071820-#23343b',
  '-font', 'Menlo-Bold', '-fill', '#f0dfb3', '-pointsize', '25',
  '-gravity', 'northwest', '-annotate', '+28+24', 'OBSERVE → INTERCEPT // DORMANT → TELL → FIRE → RECOVERY / SPENT',
  '-font', 'Courier', '-fill', '#a8bab9', '-pointsize', '15',
  '-annotate', '+30+62', 'Same hull socket. Dormant is deliberately empty; emission rises only after the legible tell.',
];
const timelineStages = [
  { label: 'DORMANT\nDRAW NOTHING', ids: [] },
  { label: 'TELL\n240ms · a0.24', ids: ['sensor-wake-chevrons', 'clamp-opposed-jaws'] },
  { label: 'FIRE\nscan + clamp', ids: ['sensor-scan-fan', 'clamp-strike-burst'] },
  { label: 'RECOVERY / SPENT\ndecay, then clear', ids: ['sensor-ghost-rake', 'clamp-spent-shims'] },
];
for (let i = 0; i < timelineStages.length; i++) {
  const stage = timelineStages[i];
  const x = 35 + i * 390;
  timelineArgs.push(
    '-fill', '#10252dcc', '-stroke', i === 1 ? '#6f9091' : '#7c5b45', '-strokewidth', '2',
    '-draw', `roundrectangle ${x},100 ${x + 355},485 12,12`,
    '-fill', '#26383d', '-stroke', '#9a6741', '-strokewidth', '3',
    '-draw', `roundrectangle ${x + 35},205 ${x + 320},375 10,10`,
    '-fill', '#10191c', '-stroke', '#875a3d', '-strokewidth', '3',
    '-draw', `circle ${x + 177},290 ${x + 192},290`,
    '-font', 'Menlo-Bold', '-fill', '#e4d6b3', '-pointsize', '17',
    '-annotate', `+${x + 18}+128`, stage.label,
  );
  stage.ids.forEach((id, j) => {
    const entry = component(id);
    const sprite = join(outDir, `.timeline-${i}-${j}.png`);
    extract(entry, sprite);
    const point = placement(entry, x + 177, 260 + j * 62);
    timelineArgs.push(sprite, '-geometry', `+${point.x}+${point.y}`, '-composite');
  });
}
timelineArgs.push('-define', 'png:compression-level=9', `PNG24:${timeline}`);
magick(timelineArgs);

const dimensions = (file) => magick(['identify', '-format', '%wx%h', file]).trim();
const report = {
  mode: 'offline native-scale atlas composition; no browser/server/runtime',
  atlas: manifest.runtime,
  components: manifest.components.length,
  dormantSprites: 0,
  tells: {
    count: manifest.components.filter((entry) => entry.timingState === 'tell').length,
    maxOpacity: Math.max(...manifest.components
      .filter((entry) => entry.timingState === 'tell')
      .map((entry) => entry.maxOpacity)),
  },
  sensorLockTellOpacityMax: Math.max(...manifest.components
    .filter((entry) => entry.sheet === 'A' && entry.timingState === 'tell')
    .map((entry) => entry.maxOpacity)),
  files: {
    contact: { file: contact, dimensions: dimensions(contact) },
    cold: { file: cold, dimensions: dimensions(cold) },
    warm: { file: warm, dimensions: dimensions(warm) },
    lifecycle: { file: timeline, dimensions: dimensions(timeline) },
  },
};
writeFileSync(join(outDir, 'review-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
