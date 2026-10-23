#!/usr/bin/env node
// preview.mjs — offline RIG weapon-hold contact sheet from the shipped atlases.
//   node tools/rig-grip/preview.mjs --out sheet.png [--gun R] [--ppt 60]
//     [--frames aim-right,contact,...] [--aims right,up-right,up,down-right,down]
//     [--facing 1|-1|both] [--gain 1] [--no-arms] [--marks]
// Rows = body frames, columns = aim directions (x facings). World window per
// cell: x [-1.4, 1.4], y [-0.2, 2.9] tiles. `--ppt 18` is desktop FAR scale.
import { composite, poseLayers, writeRgbaPng } from './raster.mjs';
import { RIG_ARM_RIGS } from '../../src/pure/rig.js';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const has = (name) => process.argv.includes(`--${name}`);
const AIMS = {
  right: [1, 0], 'up-right': [Math.SQRT1_2, Math.SQRT1_2], up: [0, 1],
  'down-right': [Math.SQRT1_2, -Math.SQRT1_2], down: [0, -1],
  left: [-1, 0], 'up-left': [-Math.SQRT1_2, Math.SQRT1_2], 'down-left': [-Math.SQRT1_2, -Math.SQRT1_2],
};
const out = arg('out', 'rig-grip-preview.png');
const gun = arg('gun', 'R');
const ppt = Number(arg('ppt', 60));
const gain = Number(arg('gain', 1));
const frames = (arg('frames', Object.keys(RIG_ARM_RIGS).join(','))).split(',');
const aims = arg('aims', 'right,up-right,up,down-right,down').split(',');
const facings = arg('facing', '1') === 'both' ? [1, -1] : [Number(arg('facing', '1'))];
const win = { x0: -1.4 * gain, x1: 1.4 * gain, y0: -0.2, y1: 2.9 * gain, ppt };
const cells = [];
for (const frame of frames) for (const facing of facings) for (const a of aims) {
  const { layers } = poseLayers({ frame, bodyFacing: facing, gunFacing: facing, aim: AIMS[a],
    letter: gun, gain, arms: !has('no-arms') });
  cells.push(composite(layers, { ...win, bg: [232, 232, 232, 255] }));
}
const cw = cells[0].width, ch = cells[0].height, cols = aims.length * facings.length;
const rows = frames.length, pad = 2;
const W = cols * (cw + pad) + pad, H = rows * (ch + pad) + pad;
const data = new Float32Array(W * H * 4).fill(1);
cells.forEach((c, i) => {
  const ox = pad + (i % cols) * (cw + pad), oy = pad + Math.floor(i / cols) * (ch + pad);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const s = (y * cw + x) * 4, d = ((oy + y) * W + ox + x) * 4;
    data[d] = c.data[s]; data[d + 1] = c.data[s + 1]; data[d + 2] = c.data[s + 2]; data[d + 3] = 1;
  }
  if (has('marks')) {   // sim hand socket row (y = 1.05) as a faint line
    const yy = Math.round((win.y1 - 1.05) * ppt);
    for (let x = 0; x < cw; x += 2) { const d = ((oy + yy) * W + ox + x) * 4; data[d] = 1; data[d + 1] = 0; data[d + 2] = 0; }
  }
});
writeRgbaPng(out, { width: W, height: H, data });
console.log(JSON.stringify({ out, frames, aims, facings, gun, ppt, size: [W, H] }));
