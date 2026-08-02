// Domain: T-054 — the hull texture has to be VISIBLE (operator finding: "the
// one floating in the background seems to have more detail, while that in the
// foreground has less"). Two independently-correct fixes cancelled: T-052's
// brightness normalization compressed the tile's range toward white, and
// T-053's repaint smoothed it further; measured in play, the texture was
// worth 0.24 luminance levels of neighbour difference and LESS structure at
// the scale the eye reads than the untextured build.
//
// WHY THIS DOMAIN CAN ASSERT WHAT T-052'S COULD NOT. That harness could only
// re-derive arithmetic, because every pixel operation lived in
// src/render/materials.js as a CSS `filter` string on a 2D context — a file
// no headless gate can import (three.js + a live WebGLRenderer at module
// scope) executing a transform no headless gate can run. So the gate checked
// that the strings were spelled right, and both defects sat under a green
// gate for a cycle. T-054 moved the whole texel pipeline into
// src/render/hulltiles.js, which is Node-safe — so every assertion below runs
// the SHIPPED transform over the SHIPPED PNG and reads the OUTPUT PIXELS.
//
// What is checked here:
//   1. DENSITY — one authored copy of a tile covers the world span its own
//      manifest note claims, and lands at the on-screen size that note states
//      (~35 CSS px). This is the frequency half of the defect: at 0.67 world
//      units a 128px panel was minified ~11:1 and mipped into grey.
//   2. RANGE — the composited buffer's relative spread in LINEAR light (what
//      the GPU multiplies into the palette token) clears a floor, and the
//      curve that produces it preserves the surface's average albedo exactly
//      (mean(map) * gainExact == 1).
//   3. HUE — R == G == B at every texel of the composite, the property T-052's
//      reviewer proved for `grayscale(100%)` and the replacement must keep,
//      plus a scalar gain, which cannot shift hue either. Checked on the real
//      warm-rust tile, not on the comment that claims it.
//   4. DEGRADE — a missing base tile produces no composite at all (so the
//      material stays flat and no gain is applied without a map), and the
//      curve is bounded: no unbounded multiply, no brightening trim.

import { join } from 'node:path';
import { CONFIG } from '../../src/config.js';
import {
  TEX_LAYOUT, TILE_TONE, TILE_WORLD_SIZE, buildToneCurve, composeHullTile,
  hullTexCanvas, luminanceHistogram, applyToneCurve, resample, screenPxPerWorld,
  srgbToLinear, tileOver, worldPerTileCopy,
} from '../../src/render/hulltiles.js';
import { decodePng } from '../../tools/assets/lib/png.mjs';
import { ok, near, srcDir } from './_context.mjs';

export const title = 'T-054 hull texture legibility (density + range, entries 16/18)';

const TEX_DIR = join(srcDir, '..', 'assets', 'generated', 'textures');
const FILE_FOR = {
  hullPanel: 'hull-panel-tile.png',
  ventLouver: 'vent-louver-plate.png',
  weldSeam: 'weld-seam-strip.png',
};

function loadTile(file) {
  const p = decodePng(join(TEX_DIR, file));
  return { data: p.rgba, width: p.width, height: p.height };
}

export async function run() {

/* ==== 1. density: what one authored copy covers, and how big that is ===== */
{
  // The manifest note on hull-panel-tile.png states the intent in two units
  // at once — "authored for a ~2x2 tile repeat (~35x35px on screen)" — and
  // they have to agree with each other through the shipped camera, or one of
  // them is decoration. CSS px, because that is the unit the note is in
  // (REFERENCE_FRAME is device px at devicePixelRatio 2).
  const cssPxPerWorld = screenPxPerWorld(CONFIG, 800);
  const span = worldPerTileCopy(CONFIG);
  near(span.hull[0] * cssPxPerWorld, 35, 4,
     'T-054: one authored copy of hull-panel-tile.png lands at the ~35 CSS px its own ' +
     'manifest note claims (got ' + (span.hull[0] * cssPxPerWorld).toFixed(1) + ' px)');
  ok(span.hull[0] * cssPxPerWorld > 20,
     'T-054: …and well clear of the ~12 px the pre-T-054 repeat produced, which is ' +
     'where a 128px panel design has nothing left after the mip chain');

  // The canvas budget follows the camera rather than a typed constant: pull
  // the view back and a tile needs fewer texels, not the same ones averaged.
  const far = hullTexCanvas(CONFIG, 'hull');
  const pulled = { ...CONFIG, camera: { ...CONFIG.camera, z: CONFIG.camera.z * 2 } };
  const pulledCanvas = hullTexCanvas(pulled, 'hull');
  ok(pulledCanvas.cellPx < far.cellPx,
     'T-054: doubling the camera depth shrinks the tile\'s texel budget (' +
     far.cellPx + ' -> ' + pulledCanvas.cellPx + ') — the budget is derived from the ' +
     'frozen view, not typed');
  ok(far.cellPx <= 128 && pulledCanvas.cellPx <= 128,
     'T-054: …and never exceeds the source file\'s own 128px — this pass may ' +
     'downsample a tile to the size it is drawn at, never invent detail by upsampling');
  ok(far.canvasPx === far.cellPx * TEX_LAYOUT.hull.copies,
     'T-054: the composited canvas is an exact whole number of tile copies (' +
     far.canvasPx + ' = ' + far.cellPx + ' x ' + TEX_LAYOUT.hull.copies + '), so the ' +
     'base grid tiles it without a partial cell');
}

/* ==== 2. range: the composite carries contrast, and keeps its mean ======= */
{
  const wear = loadTile('wear-scuff-overlay.png');
  for (const key of Object.keys(TEX_LAYOUT)) {
    const file = FILE_FOR[TEX_LAYOUT[key].tile];
    const composed = composeHullTile(CONFIG, key, loadTile(file),
      TEX_LAYOUT[key].wear > 0 ? wear : null);
    ok(!!composed, 'T-054: the ' + key + ' bucket composes a tile from ' + file);
    const c = composed.curve;

    // THE NUMBER THE WHOLE TASK IS ABOUT. Relative spread in linear light is
    // what survives into the frame: the GPU multiplies this map into the
    // palette token, so a map varying +-X% about its mean moves the surface's
    // brightness by X%. The floor is deliberately a floor — 20% is under
    // every bucket in the tree today (29.3% is the lowest) and is here to
    // catch a pass that flattens the surface again, not to pin a look.
    ok(c.linRelSd >= 0.20,
       'T-054: the ' + key + ' composite varies at least 20% about its own mean in ' +
       'LINEAR light (got ' + (c.linRelSd * 100).toFixed(1) + '%) — the spread the ' +
       'surface actually modulates by');

    // …and MORE of it than the normalization it replaces, measured by running
    // both over the same un-normalized composite rather than by quoting a
    // number: build the raw tiled buffer from the shipped primitives, then
    // clip-normalize it the way T-052's `brightness()` pass did.
    const raw = rawComposite(key, file, wear);
    const clipped = clipNormalize(raw, 235);
    const gained = buildToneCurve(luminanceHistogram(raw));
    ok(gained.linRelSd > clipped.linRelSd,
       'T-054: …and more of it than the clip-to-235 normalization it replaces, both ' +
       'run over the same un-normalized ' + key + ' composite (' +
       (gained.linRelSd * 100).toFixed(1) + '% vs ' + (clipped.linRelSd * 100).toFixed(1) +
       '%, ' + (gained.linRelSd / clipped.linRelSd).toFixed(2) + 'x)');
    if (key === 'hull')
      ok(gained.linRelSd / clipped.linRelSd >= 1.25,
         'T-054: …by at least 1.25x on the `hull` bucket specifically — the large ' +
         'under-deck surface the operator\'s finding is about (' +
         (gained.linRelSd / clipped.linRelSd).toFixed(2) + 'x)');
    ok(clipped.linMean > gained.linMean,
       'T-054: the pass it replaces really did sit closer to white (linear mean ' +
       clipped.linMean.toFixed(3) + ' vs ' + gained.linMean.toFixed(3) + ') — which is ' +
       'where the range went: a mean at 92% of full scale has 8% left to say ' +
       'anything with');

    // the albedo-preserving property: correcting the MEAN is not compressing
    // the RANGE, and this is the arithmetic that separates them
    near(c.gainExact * c.linMean, 1, 1e-6,
       'T-054: mean(' + key + ' map) * gainExact == 1 in linear light — the surface ' +
       'keeps the average albedo it had with no map at all');
    ok(c.gain <= c.gainExact && c.gain > 0,
       'T-054: the shipped ' + key + ' gain is the exact one after a TRIM (' +
       c.gain.toFixed(3) + ' <= ' + c.gainExact.toFixed(3) + '), never above it');
    ok(c.gain <= TILE_TONE.maxGain && c.contrast <= TILE_TONE.maxContrast,
       'T-054: …and both the ' + key + ' gain and its contrast stay inside their caps ' +
       '(' + c.gain.toFixed(2) + ' <= ' + TILE_TONE.maxGain + ', ' +
       c.contrast.toFixed(2) + ' <= ' + TILE_TONE.maxContrast + ')');
  }
  ok(TILE_TONE.gainTrim > 0 && TILE_TONE.gainTrim <= 1,
     'T-054: the tone-mapping trim can only ever pull a gain DOWN (' +
     TILE_TONE.gainTrim + ') — it corrects a brightening, it may not cause one');
}

/* ==== 3. hue: R == G == B at every texel, on the real warm-rust tile ===== */
{
  // hull-panel-tile.png is warm rust (R dominant, B near zero) and PAL.limb
  // .wall / .shadow are cool teal tokens; a COLORED multiply crushes their
  // blue channel and swings them toward green, which is the live defect
  // T-052's review caught. The replacement has to keep the guarantee, so it
  // is checked where it can actually fail: on the output buffer.
  const src = loadTile('hull-panel-tile.png');
  let srcColored = 0;
  for (let i = 0; i < src.data.length; i += 4)
    if (src.data[i] !== src.data[i + 1] || src.data[i + 1] !== src.data[i + 2]) srcColored++;
  ok(srcColored > src.width * src.height * 0.5,
     'T-054: hull-panel-tile.png really is a colored source (' + srcColored + ' of ' +
     (src.width * src.height) + ' texels are not already gray) — so this check has ' +
     'something to catch');

  const composed = composeHullTile(CONFIG, 'wall', src, null);
  let colored = 0, opaque = 0;
  for (let i = 0; i < composed.data.length; i += 4) {
    if (composed.data[i] !== composed.data[i + 1] ||
        composed.data[i + 1] !== composed.data[i + 2]) colored++;
    if (composed.data[i + 3] === 255) opaque++;
  }
  ok(colored === 0,
     'T-054: every texel of the composited wall tile is R == G == B (' + colored +
     ' colored) — the map can only scale a palette token\'s value, never shift its hue');
  ok(opaque === composed.width * composed.height,
     'T-054: …and every texel is fully opaque, so no bucket samples an undefined ' +
     'alpha the way the raw wear overlay (78% transparent) would');
}

/* ==== 4. degrade + the pieces the composite is built from ================ */
{
  ok(composeHullTile(CONFIG, 'hull', null, null) === null,
     'T-054: a bucket whose base tile never loaded composes nothing — the material ' +
     'stays flat, and no gain is applied without the map it compensates for');
  ok(composeHullTile(CONFIG, 'nosuchbucket', loadTile('hull-panel-tile.png'), null) === null,
     'T-054: …and so does a bucket with no canvas layout');

  // resample averages in LINEAR light. A checkerboard of black and white is
  // the case that separates the two: averaged as sRGB bytes it lands at 128
  // (a mid-gray that is only 21% of the light), in linear light at 188.
  const cb = new Uint8ClampedArray(4 * 4 * 4);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const v = (x + y) % 2 ? 255 : 0, o = (y * 4 + x) * 4;
    cb[o] = cb[o + 1] = cb[o + 2] = v; cb[o + 3] = 255;
  }
  const avg = resample(cb, 4, 4, 1, 1);
  near(srgbToLinear(avg[0] / 255), 0.5, 0.02,
     'T-054: resampling a black/white checker averages to 0.5 in LINEAR light (got ' +
     srgbToLinear(avg[0] / 255).toFixed(3) + ') — averaging sRGB bytes instead would ' +
     'land at 0.21 and darken every downsampled tile');

  // the curve is monotonic: a texel that was darker than its neighbour may
  // never come out brighter (a non-monotonic curve inverts panel lines)
  const curve = buildToneCurve(luminanceHistogram(
    composeHullTile(CONFIG, 'hull', loadTile('hull-panel-tile.png'), null).data));
  let inversions = 0;
  for (let v = 1; v < 256; v++) if (curve.lut[v] < curve.lut[v - 1]) inversions++;
  ok(inversions === 0,
     'T-054: the tone curve is monotonic (' + inversions + ' inversions) — it can ' +
     'raise contrast, it cannot invert a panel line');

  // and applyToneCurve really is what writes gray: fed a colored buffer with
  // a junk alpha, it returns gray and opaque
  const probe = new Uint8ClampedArray([200, 40, 10, 0, 10, 200, 40, 128]);
  applyToneCurve(probe, curve.lut);
  ok(probe[0] === probe[1] && probe[1] === probe[2] && probe[3] === 255 &&
     probe[4] === probe[5] && probe[5] === probe[6] && probe[7] === 255,
     'T-054: applyToneCurve writes gray and opaque over any input, including a ' +
     'transparent one');
  ok(probe[0] !== probe[4],
     'T-054: …and it is not writing one constant — two differently-lit inputs come ' +
     'out at different levels (' + probe[0] + ' vs ' + probe[4] + ')');
}

}

/* The composite BEFORE any normalization: the same two shipped primitives
   composeHullTile() itself uses, in the same order, stopping short of the
   tone curve — so section 2 can run the old and the new normalization over
   identical pixels. */
function rawComposite(key, file, wear) {
  const l = TEX_LAYOUT[key];
  const layout = hullTexCanvas(CONFIG, key);
  const base = loadTile(file);
  const cell = resample(base.data, base.width, base.height, layout.cellPx, layout.cellPx);
  const buf = new Uint8ClampedArray(layout.canvasPx * layout.canvasPx * 4);
  tileOver(buf, layout.canvasPx, cell, layout.cellPx, false);
  if (l.wear > 0) {
    const wc = resample(wear.data, wear.width, wear.height, layout.wearCellPx, layout.wearCellPx);
    tileOver(buf, layout.canvasPx, wc, layout.wearCellPx, true);
  }
  return buf;
}

/* The normalization T-054 replaces, re-implemented here for the comparison in
   section 2: multiply every channel toward a target mean and let it clip at
   255 (CSS `filter: brightness()`'s own behaviour, which is what materials.js
   used). Kept in the harness rather than in src/ — nothing ships it; it
   exists so the claim "the replacement carries more range" is measured
   against the real thing on the real buffer instead of asserted. */
function clipNormalize(rgba, targetMean) {
  const lum = (i) => 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2];
  let sum = 0, n = 0;
  for (let i = 0; i < rgba.length; i += 4) { sum += lum(i); n++; }
  const raw = sum / n;
  let scale = Math.max(1, Math.min(8, targetMean / Math.max(1, raw)));
  for (let pass = 0; pass < 3; pass++) {
    let got = 0;
    for (let i = 0; i < rgba.length; i += 4) got += Math.min(255, Math.round(lum(i) * scale));
    got /= n;
    if (got <= 0) break;
    const ratio = targetMean / got;
    if (Math.abs(ratio - 1) < 0.02) break;
    scale = Math.max(1, Math.min(8, scale * ratio));
  }
  let ls = 0, lsq = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const L = srgbToLinear(Math.min(255, Math.round(lum(i) * scale)) / 255);
    ls += L; lsq += L * L;
  }
  const linMean = ls / n;
  return { linMean, linRelSd: Math.sqrt(Math.max(0, lsq / n - linMean * linMean)) / linMean };
}
