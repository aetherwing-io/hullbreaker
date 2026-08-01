#!/usr/bin/env node
// probe.mjs — what hues does a reference image actually contain?
//
// This exists because the palette in `lib/palette.mjs` has to come from
// somewhere defensible. DESIGN names the roles in words ("deep teal
// environment, rust-orange metal") and the shipped grey-box only commits real
// hex to three of them (pickup magenta, hostile green, muzzle warm-white), so
// the teal and rust anchors would otherwise be one agent's taste. Running this
// over the endorsed concept boards turns them into a measurement instead.
//
// Usage:
//   node tools/assets/probe.mjs docs/concept-art/13-human-scale-monster-climb-grammar.png
//   node tools/assets/probe.mjs <png> [--buckets 24] [--min-chroma 10] [--top 8]
//
// Reports hue clusters by screen coverage, each with a coverage-weighted mean
// LCh and the single most common exact pixel color in that cluster (the
// "representative" — a real pixel from the image, not an average that may not
// appear anywhere in it).

import { histogram } from './lib/png.mjs';
import { rgbToLch, toHex } from './lib/color.mjs';

function parseArgs(argv) {
  const args = { file: null, buckets: 24, minChroma: 10, top: 8, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--buckets') args.buckets = Number(argv[++i]);
    else if (a === '--min-chroma') args.minChroma = Number(argv[++i]);
    else if (a === '--top') args.top = Number(argv[++i]);
    else if (a === '--json') args.json = true;
    else if (!a.startsWith('--')) args.file = a;
  }
  return args;
}

export function probe(file, { buckets = 24, minChroma = 10, top = 8 } = {}) {
  const hist = histogram(file, { alphaFloor: 8 });
  const width = 360 / buckets;
  const bins = new Map();
  let neutral = 0, chromatic = 0;

  for (const c of hist.colors) {
    const lch = rgbToLch(c);
    if (lch.C < minChroma) { neutral += c.count; continue; }
    chromatic += c.count;
    const bin = Math.floor(lch.h / width);
    if (!bins.has(bin)) bins.set(bin, { bin, count: 0, sumL: 0, sumC: 0, sumSin: 0, sumCos: 0, best: null });
    const b = bins.get(bin);
    b.count += c.count;
    b.sumL += lch.L * c.count;
    b.sumC += lch.C * c.count;
    b.sumSin += Math.sin((lch.h * Math.PI) / 180) * c.count;
    b.sumCos += Math.cos((lch.h * Math.PI) / 180) * c.count;
    if (!b.best || c.count > b.best.count) b.best = { ...c, lch };
  }

  const clusters = [...bins.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, top)
    .map((b) => {
      let h = (Math.atan2(b.sumSin, b.sumCos) * 180) / Math.PI;
      if (h < 0) h += 360;
      return {
        hueRange: [+(b.bin * width).toFixed(1), +((b.bin + 1) * width).toFixed(1)],
        meanHue: +h.toFixed(1),
        meanL: +(b.sumL / b.count).toFixed(1),
        meanC: +(b.sumC / b.count).toFixed(1),
        coverage: +(b.count / hist.opaque).toFixed(4),
        representative: toHex(b.best),
        representativeLch: {
          L: +b.best.lch.L.toFixed(1), C: +b.best.lch.C.toFixed(1), h: +b.best.lch.h.toFixed(1),
        },
      };
    });

  return {
    file,
    size: `${hist.width}x${hist.height}`,
    uniqueColors: hist.unique,
    neutralCoverage: +(neutral / hist.opaque).toFixed(4),
    chromaticCoverage: +(chromatic / hist.opaque).toFixed(4),
    minChroma,
    clusters,
  };
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    console.error('usage: node tools/assets/probe.mjs <png> [--buckets N] [--min-chroma N] [--top N] [--json]');
    process.exit(2);
  }
  const out = probe(args.file, args);
  if (args.json) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log(`${out.file}  ${out.size}  ${out.uniqueColors} unique colors`);
    console.log(`neutral (C<${out.minChroma}): ${(out.neutralCoverage * 100).toFixed(1)}%   chromatic: ${(out.chromaticCoverage * 100).toFixed(1)}%`);
    console.log('');
    console.log('  coverage  hue    L    C   representative');
    for (const c of out.clusters) {
      console.log(
        `  ${(c.coverage * 100).toFixed(1).padStart(6)}%  ${String(c.meanHue).padStart(5)}  ` +
        `${String(c.meanL).padStart(4)} ${String(c.meanC).padStart(4)}   ${c.representative}`
      );
    }
  }
}
