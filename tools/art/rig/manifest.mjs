#!/usr/bin/env node
// manifest.mjs — upsert RIG v3's entries in assets/manifest.json with the
// asset gate's OWN rules (tools/assets/lib: readPngSize, power-of-two,
// alphaCensus, the alpha-weighted raster histogram + checkRasterColors that
// tools/assets/check.mjs runs), so the recorded `palette` block is exactly what
// the gate recomputes. Every other entry is left byte-identical.
//
//   node tools/art/rig/manifest.mjs [--check]     (--check: verify only, write nothing)
//
// No `alpha` kind is declared: these are hard 0/255 pixel-art edges (0%
// partial), which the `cutout` contract (>= 2% feathered) would reject by
// design -- the same call T-109 phase A made for its pixel atlases.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { histogram, readPngSize, alphaCensus } from '../../assets/lib/png.mjs';
import { checkRasterColors, ALPHA_HUE_FLOOR } from '../../assets/lib/palette.mjs';
import { loadManifest, saveManifest, validateEntryShape, isPowerOfTwo } from '../../assets/lib/manifest.mjs';

const ROOT = resolve(import.meta.dirname, '../../..');
const CHECK = process.argv.includes('--check');
const doc = JSON.parse(readFileSync(join(ROOT, 'assets/generated/sprites/rig-v3.json'), 'utf8'));
const cc0 = JSON.parse(readFileSync(join(ROOT, 'tools/art/spike/cc0.json'), 'utf8'));
const src = (id) => cc0.sources.find((s) => s.id === id);
const soldier = src('irondust-scifi-soldiers');
const guns = src('quaternius-ultimate-gun-pack');

const GENERATOR = 'headless Blender 5.2 (bpy, Cycles CPU, 1 spp data passes) via tools/art/build_rig_v3.py: '
  + `CC0 "${soldier.title}" by ${soldier.author} (${soldier.page}, ${soldier.licence}, sha256 ${soldier.sha256.slice(0, 12)}…) `
  + `+ CC0 "${guns.title}" by ${guns.author} (${guns.page}, ${guns.licence}, sha256 ${guns.sha256.slice(0, 12)}…; `
  + 'Bullpup_3 / Shotgun_ShortStock / SniperRifle_4 / SubmachineGun_1 / Bullpup_2), posed in code with every gun on the '
  + "sim's shot line (tools/art/rig/poses.py, guns.py, render.py), toon-reduced by tools/art/rig/post.py into palette "
  + 'swatches measured from concept boards 01/13 (tools/art/rig/board_palette.py, palette_v3.py) + game tokens, packed '
  + 'by tools/art/rig/pack.py; provenance tools/art/spike/cc0.json; byte-reproducible on this host';

const out = [];
for (const d of doc.densities) {
  const path = `assets/generated/sprites/${d.image}`;
  const abs = join(ROOT, path);
  if (!existsSync(abs)) throw new Error(`missing ${path}`);
  const size = readPngSize(abs);
  if (!(isPowerOfTwo(size.width) && isPowerOfTwo(size.height))) throw new Error(`${path} is not power-of-two`);
  const hist = histogram(abs, { alphaFloor: ALPHA_HUE_FLOOR, weight: 'alpha' });
  const res = checkRasterColors(hist.colors.map((c) => ({ color: { r: c.r, g: c.g, b: c.b }, coverage: c.coverage, count: c.count })),
    { roleReportMass: 0.005 });
  const census = alphaCensus(abs);
  const entry = {
    id: `rig-v3-${d.id}`,
    path,
    category: 'sprites',
    size: { w: size.width, h: size.height },
    gpu: true,
    task: 'T-124',
    generator: GENERATOR,
    addedOn: '2026-10-23',
    notes: `RIG v3 (decisions entry 27: the CC0 soldier, toon-shaded in the boards' khaki/rust), ${d.pxPerTile} px/tile `
      + `(${d.serves.join('; ')}). ${doc.frames.length} frames = ${doc.poses.length} poses x 5 guns (R S L H F), one `
      + `${d.cell[0]}x${d.cell[1]} cell each, sim point at (${d.origin[0]}, ${d.origin[1]}); frame i is cell i in every `
      + 'density. Frame keys, anchors (tiles: muzzle on the sim shot origin, drawnMuzzle, hand, handL, support, head, feet), '
      + 'clips and the mirror rule live ONCE in the sibling rig-v3.json. tools/art/rig/check.py proves every drawn muzzle '
      + 'is within 1 px of its anchor and every anchor on the sim shot origin. NOT wired into the game (T-124 phase 2 '
      + `waits for T-123's crisp path). Indexed PNG, ${d.colours} colours, hard alpha (${census.partial.toFixed(2)}% `
      + 'partial): sample NEAREST, unlit, no mipmaps.',
    palette: { status: res.ok ? 'pass' : 'fail', roles: res.roles.map((r) => r.id).sort(), checkedBy: 'tools/assets/check.mjs' },
  };
  const errs = validateEntryShape(entry, 0);
  if (errs.length) throw new Error(errs.join('\n'));
  if (!res.ok) throw new Error(`${path}: palette ${res.failures.join('; ')}`);
  out.push({ entry, census, alien: res.alienMass, offBand: res.offBandMass });
}

const manifest = loadManifest(ROOT);
for (const { entry } of out) {
  const i = manifest.assets.findIndex((e) => e.id === entry.id);
  if (CHECK) {
    if (i < 0) throw new Error(`${entry.id}: not in the manifest`);
    const rec = manifest.assets[i];
    for (const k of ['path', 'category', 'task']) if (rec[k] !== entry[k]) throw new Error(`${entry.id}: ${k} differs`);
    if (rec.size.w !== entry.size.w || rec.size.h !== entry.size.h) throw new Error(`${entry.id}: size differs`);
    if (JSON.stringify(rec.palette) !== JSON.stringify(entry.palette)) throw new Error(`${entry.id}: palette differs`);
  } else if (i < 0) manifest.assets.push(entry);
  else manifest.assets[i] = entry;
}
const paths = new Set();
manifest.assets.forEach((e, i) => {
  const errs = validateEntryShape(e, i);
  if (errs.length) throw new Error(errs.join('\n'));
  if (paths.has(e.path)) throw new Error(`duplicate path ${e.path}`);
  paths.add(e.path);
});
if (!CHECK) saveManifest(ROOT, manifest);
for (const { entry, census, alien, offBand } of out) {
  console.log(entry.id, `${entry.size.w}x${entry.size.h}`, entry.palette.status, entry.palette.roles.join(','),
    `alien ${(alien * 100).toFixed(3)}% offBand ${(offBand * 100).toFixed(2)}%`,
    `alpha transparent ${census.transparent.toFixed(1)}% partial ${census.partial.toFixed(2)}%`);
}
console.log(CHECK ? 'manifest entries verified' : 'manifest written');
