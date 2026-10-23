#!/usr/bin/env node
// compose.mjs — BEFORE/AFTER contact sheets from two capture.mjs runs.
//
//   node tools/rig-grip/compose.mjs --before <capture dir>[,<dir>...]
//     --after <capture dir>[,<dir>...] --out <dir> [--view desktop]
//     [--guns RSLHF] [--scales 1,4] [--rows stand,run-contact,...]
//     [--aims right,up,...] [--facings 1,-1] [--name <file prefix>] [--stack-guns]
//
// --stack-guns puts every requested weapon in ONE sheet (weapon-major row
// groups) instead of one sheet per weapon; handy for short rows like crouch.
//
// Several capture dirs per side are merged in order (a later dir's rows and
// cells replace an earlier one's), so a re-shot row or the ?crouch=1 row can
// be added to a full matrix without re-shooting it.
//
// One sheet per (weapon, scale). Every pose row appears twice — BEFORE directly
// above AFTER, over the same (aim x facing) columns — so a hand moving onto the
// grip reads vertically. Each row header carries the LIVE measurements both
// captures recorded (capture.json): the worst fist-to-grip and muzzle-to-spawn
// distance on screen, in css px at that viewport. At scale >= 2 every cell also
// gets its own fist-to-grip number underneath (never drawn over the pixels).
//
// The 4x sheet is the true-size capture magnified by nearest neighbour
// (image-rendering: pixelated at an integer factor): no new pixels, no
// smoothing, so it is exactly the 1x evidence made legible.

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withIsolatedBrowser } from '../playtest/lib/isolated-browser.mjs';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const BEFORE = arg('before');
const AFTER = arg('after');
const OUT = resolve(arg('out', 'rig-grip-sheets'));
if (!BEFORE || !AFTER) {
  console.error('usage: compose.mjs --before <capture dir> --after <capture dir> --out <dir>');
  process.exit(2);
}
const VIEW = arg('view', 'desktop');
const GUNS = arg('guns', 'RSLHF').split('');
const SCALES = arg('scales', '1,4').split(',').map(Number);
const NAME = arg('name', `${VIEW}`);
const STACK = process.argv.includes('--stack-guns');
const ALL_AIMS = ['right', 'up-right', 'up', 'up-left', 'left', 'down-left', 'down', 'down-right'];
const ALL_ROWS = ['stand', 'run-contact', 'run-pass', 'run-flight', 'air-rise', 'air-fall',
  'climb-0', 'climb-1', 'climb-2', 'climb-3', 'wall', 'hit-iframe', 'respawn', 'crouch'];

const sides = [];
for (const [tag, dirs] of [['BEFORE', BEFORE], ['AFTER', AFTER]]) {
  const side = { tag, label: null, view: null };
  for (const dir of dirs.split(',')) {
    const report = JSON.parse(await readFile(resolve(dir, 'capture.json'), 'utf8'));
    const view = report.views[VIEW];
    if (!view) throw new Error(`${dir}/capture.json has no ${VIEW} view`);
    side.label ??= report.label;
    side.view ??= { viewport: view.viewport, dpr: view.dpr, rows: {}, cells: {} };
    Object.assign(side.view.rows, view.rows);
    for (const [k, c] of Object.entries(view.cells)) side.view.cells[k] = { ...c, dir: resolve(dir) };
  }
  sides.push(side);
}
const aims = arg('aims', 'all') === 'all' ? ALL_AIMS : arg('aims').split(',');
const facings = arg('facings', '1,-1').split(',').map(Number);
const rows = (arg('rows') ? arg('rows').split(',') : ALL_ROWS)
  .filter((row) => sides.some((s) => s.view.rows[row]));

const key = (row, aim, facing, gun) => `${row}|${aim}|${facing > 0 ? 'R' : 'L'}|${gun}`;
const fmt = (v) => (v === null || v === undefined ? '-' : v < 10 ? v.toFixed(2) : v.toFixed(1));
const worst = (cells, field) => {
  const vals = cells.map((c) => c?.[field]).filter((v) => typeof v === 'number');
  return vals.length ? Math.max(...vals) : null;
};

const written = [];
await withIsolatedBrowser(resolve(import.meta.dirname, '../..'), async ({ newPage }) => {
  for (const sheetGuns of (STACK ? [GUNS] : GUNS.map((g) => [g]))) for (const scale of SCALES) {
    const gunTag = sheetGuns.join('');
    const cols = [];
    for (const facing of facings) for (const aim of aims) cols.push([facing, aim]);
    const head = cols.map(([f, a]) => `<th>${a}<br>${f > 0 ? 'face R' : 'face L'}</th>`).join('');
    const body = [];
    for (const gun of sheetGuns) for (const row of rows) {
      for (const side of sides) {
        const cells = cols.map(([facing, aim]) => side.view.cells[key(row, aim, facing, gun)]);
        const fg = worst(cells, 'fistToGripCssPx');
        const ms = worst(cells, 'muzzleToSpawnCssPx');
        const tds = [];
        for (const c of cells) {
          if (!c) { tds.push('<td></td>'); continue; }
          const png = await readFile(resolve(c.dir, 'cells', c.file));
          const note = scale >= 2
            ? `<div class="n">fist-grip ${fmt(c.fistToGripCssPx)} px${c.stretch && c.stretch > 1.0001
              ? ` · arm x${c.stretch.toFixed(2)}` : ''}</div>` : '';
          tds.push(`<td><img data-s="${scale}" src="data:image/png;base64,${png.toString('base64')}">${note}</td>`);
        }
        const frame = side.view.rows[row]?.frame || '';
        body.push(`<tr class="${side.tag.toLowerCase()}"><th class="rh"><b>${row}</b> <small>${frame}</small>` +
          `${STACK ? ` <b>weapon ${gun}</b>` : ''}<br>` +
          `<span class="t">${side.tag}</span><br><small>worst fist-grip ${fmt(fg)} px<br>` +
          `worst muzzle-spawn ${fmt(ms)} px</small></th>${tds.join('')}</tr>`);
      }
    }
    const v = sides[1].view;
    const page = await newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
    try {
      await page.page.setContent(`<!doctype html><style>
        body{margin:0;padding:8px;background:#10171b;color:#e9d6a8;font:11px/1.25 monospace}
        h1{font-size:14px;margin:0 0 4px} p{margin:0 0 6px;max-width:1100px;color:#b9c4c8}
        table{border-collapse:collapse}
        td,th{border:1px solid #2c3a40;padding:2px;text-align:center;vertical-align:middle}
        th.rh{min-width:150px;text-align:left} tr.before{background:#1d1416} tr.after{background:#121d18}
        tr.after td,tr.after th{border-bottom:3px solid #46555c}
        .t{font-weight:bold} tr.before .t{color:#ff8f70} tr.after .t{color:#8fe3a0}
        img{display:block;margin:0 auto;image-rendering:pixelated} .n{font-size:10px;color:#cfd8dc}
        </style><h1>RIG weapon hold // ${VIEW} ${v.viewport.width}x${v.viewport.height} DPR ${v.dpr}
        // weapon${sheetGuns.length > 1 ? 's' : ''} ${sheetGuns.join(' ')} // ${scale === 1 ? 'TRUE SIZE (1 capture px = 1 sheet px)'
          : `${scale}x nearest-neighbour of true size`}</h1>
        <p>BEFORE: ${sides[0].label}. AFTER: ${sides[1].label}. Every pose row shows BEFORE above AFTER.
        Numbers are LIVE measurements from the captured frame (css px at this viewport):
        fist-grip = projected centre of the fist that holds the weapon (BEFORE: the nearest painted fist
        on the shown frame; AFTER: the re-posed arm's fist) to the projected centroid of the weapon's
        painted pistol grip; muzzle-spawn = projected painted muzzle face to the simulation's bullet spawn.</p>
        <table><tr><th></th>${head}</tr>${body.join('')}</table>`);
      await page.page.evaluate(() => Promise.all([...document.images].map((i) =>
        i.complete ? 0 : new Promise((r) => { i.onload = r; }))).then(() => {
        for (const i of document.images) i.style.width = `${i.naturalWidth * Number(i.dataset.s)}px`;
      }));
      const file = resolve(OUT, `${NAME}-${gunTag}-before-after-${scale}x.png`);
      await page.page.screenshot({ path: file, fullPage: true, timeout: 300000 });
      written.push(file);
      console.log(file);
    } finally {
      await page.close();
    }
  }
});
console.log(JSON.stringify({ written: written.length, rows, aims, facings }));
