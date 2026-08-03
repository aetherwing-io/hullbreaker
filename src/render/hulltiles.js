/* ===================== HULL TILE ARITHMETIC (T-052, Node-safe) ============ */
/* The part of materials.js's texture pass that can lie about SIZE, split out
   so a headless gate can check it — the same reason src/render/palette.js,
   legibility.js, seams.js and lightrig.js are three.js-free. materials.js and
   limb.js both import `three` and reach a live WebGLRenderer at module scope
   (the procedural environment, the boot-gate texture loads, the wear-overlay
   compositing), so pathcheck cannot resolve either of them directly — this
   file is what tools/pathcheck/t-052-hull-texture.mjs asserts against
   instead, exactly the precedent T-039 set for src/render/contact.js.

   THE CLAIM THIS FILE OWNS: a repeat value is `piece size / the tile's own
   authored world-tile size` (each PNG's own manifest note — "authored for a
   ~2x2 tile repeat", "~4x1 tiles", "~1.5x1.5 tiles"), computed from
   CONFIG.limb's OWN numbers rather than a second, hand-typed copy of them —
   so a retune of chunkCols, hull.drop, wall.below/above or scute.len/h moves
   the tiling density with it instead of silently drifting out of step. */

// Each tile's own authored world-tile span (world units per ONE copy), read
// off its assets/manifest.json note. `weldSeam` is asymmetric on purpose —
// the strip is 128x32px, a 4:1 strip, authored to tile along its length and
// show its whole cross-section once across the height.
export const TILE_WORLD_SIZE = {
  // The production v2 source is one large anatomy patch, not a small panel or
  // vent icon. At the old 1.5-2 tile spans its dark tendon channels repeated
  // six to nine times on a single scute/wall and became corrugated bands.
  // One authored copy now spans a genuinely large armour scale.
  hullPanel: [5.5, 5.5],
  ventLouver: [4.5, 4.5],
  weldSeam: [4, 1],
};

// The dominant kind's own (w, h) in each limb.js material bucket — `hull`
// against the `hull` kind itself, `wall` against `wall`, `scute` against
// `scute`, `shadow` against the wall cap's own seam height (hullRib/wallSeam
// share the same order of magnitude; see build.md for the co-tenant note).
export function hullPieceDims(cfg) {
  const L = cfg.limb;
  return {
    hull: [L.chunkCols, L.hull.drop],
    wall: [L.chunkCols, L.wall.below + L.wall.above],
    scute: [L.scute.len, L.scute.h],
    shadow: [L.chunkCols, L.wall.capH],
  };
}

/* THE CANVAS EACH BUCKET ACTUALLY BINDS (T-054's first measured defect).
   materials.js does not bind a tile PNG directly: it composites the tile into
   a larger canvas (`copies` x `copies` of it) so the wear overlay's own repeat
   can be decorrelated from the base grid. That canvas — not the PNG — is what
   `repeat` is applied to, and T-052's repeat arithmetic did not account for
   it: a canvas holding 3x3 copies of hull-panel-tile.png, repeated
   `chunkCols / 2` times across the piece, puts THREE authored copies where
   the manifest says one belongs. MEASURED CONSEQUENCE: an authored copy
   spanned 0.67 world units instead of 2 — about 12 screen px instead of the
   "~35x35px on screen" hull-panel-tile.png's own manifest note claims — so a
   128px panel design was minified ~11:1 and the mip chain averaged its panel
   lines away before the first pixel was lit. The copy count therefore lives
   here, next to the arithmetic that has to divide by it. */
export const TEX_LAYOUT = {
  hull: { tile: 'hullPanel', copies: 3, wear: 250 / 384 },
  wall: { tile: 'hullPanel', copies: 3, wear: 0 },
  scute: { tile: 'ventLouver', copies: 2, wear: 188 / 256 },
  shadow: { tile: 'weldSeam', copies: 1, wear: 0 },
};

// -> { hull: [x, y], wall: [x, y], scute: [x, y], shadow: [x, y] }, in copies
// of the COMPOSITED CANVAS (what materials.js binds), so that one authored
// copy of the tile inside it spans exactly the world size TILE_WORLD_SIZE
// claims. `shadow`'s vertical axis is pinned to exactly 1 (one full copy of
// the strip's own height across the piece) rather than capH/weldSeam[1]
// (~0.5): a repeat under 1 would crop the strip's own bottom shadow band
// instead of scaling it to fit, and a thin trim piece has no vertical room to
// tile twice anyway.
export function hullTexRepeat(cfg) {
  const d = hullPieceDims(cfg);
  const T = TILE_WORLD_SIZE;
  const span = (key) => {
    const l = TEX_LAYOUT[key];
    return [T[l.tile][0] * l.copies, T[l.tile][1] * l.copies];
  };
  const s = { hull: span('hull'), wall: span('wall'), scute: span('scute'), shadow: span('shadow') };
  return {
    hull: [d.hull[0] / s.hull[0], d.hull[1] / s.hull[1]],
    wall: [d.wall[0] / s.wall[0], d.wall[1] / s.wall[1]],
    scute: [d.scute[0] / s.scute[0], d.scute[1] / s.scute[1]],
    shadow: [d.shadow[0] / s.shadow[0], 1],
  };
}

// What a repeat value MEANS on the creature, in world units per authored copy
// of the tile — the claim TILE_WORLD_SIZE makes, re-derived from the repeat
// the renderer actually binds. This is the observable form of the defect
// above: before T-054 this returned [0.67, 0.67] for `hull` against an
// authored [2, 2].
export function worldPerTileCopy(cfg) {
  const d = hullPieceDims(cfg);
  const rep = hullTexRepeat(cfg);
  const out = {};
  for (const key of Object.keys(TEX_LAYOUT)) {
    const copies = TEX_LAYOUT[key].copies;
    out[key] = [d[key][0] / (rep[key][0] * copies), d[key][1] / (rep[key][1] * copies)];
  }
  return out;
}

/* ==================== HOW BIG IS A TEXEL ON SCREEN (T-054) =============== *
 * The frozen FAR view (decisions.md entry 7/17) is a fixed camera at a fixed
 * fov, so "how many device pixels does one world unit occupy" is arithmetic,
 * not taste — and it is the number that decides how many texels a tile can
 * usefully carry. A canvas finer than that is not extra detail; it is extra
 * detail the mip chain averages into grey before the frame is drawn, which is
 * exactly the effect T-054 was opened to fix.
 *
 * HONESTY: this is the FRAME-CENTRE approximation. It uses the camera's own
 * depth axis and ignores the (fixed) x/y offset and the piece's own `depth`,
 * both of which move a surface a few percent nearer or further. It is used to
 * pick a texel budget, where a few percent cannot matter — never to place
 * anything.                                                                */

// 800 CSS px tall is the viewport every capture rig in tools/playtest uses;
// renderer.setPixelRatio(min(devicePixelRatio, 2)) means a retina laptop —
// the operator's — renders that at 1600 device px, the higher of the two
// samplings the shipped build can produce. Budget for the sharper one.
export const REFERENCE_FRAME = { viewportPx: 1600, note: '800 CSS px at devicePixelRatio 2' };

export function screenPxPerWorld(cfg, viewportPx = REFERENCE_FRAME.viewportPx) {
  const depth = cfg.camera.z * cfg.viewScales.far.depthMult;
  const worldH = 2 * Math.tan((cfg.camera.fov * Math.PI / 180) / 2) * depth;
  return viewportPx / worldH;
}

/* The composited canvas's own size, per bucket: a tile gets as many texels as
   the shipped view can actually resolve, and never more than the source file
   has (this pass can downsample a 128px tile to the size it is drawn at; it
   cannot invent detail by upsampling one). Rounded to a multiple of 4 so the
   copies tile the canvas exactly, and floored at 16 so a pathological CONFIG
   cannot produce a 1-texel tile. */
export const TILE_SOURCE_PX = { hullPanel: 128, ventLouver: 128, weldSeam: 128 };

export function hullTexCanvas(cfg, key) {
  const l = TEX_LAYOUT[key];
  if (!l) return null;
  const worldW = TILE_WORLD_SIZE[l.tile][0];
  const wanted = worldW * screenPxPerWorld(cfg);
  const cellPx = Math.max(16, Math.min(TILE_SOURCE_PX[l.tile], Math.round(wanted / 4) * 4));
  const canvasPx = cellPx * l.copies;
  return { cellPx, canvasPx, copies: l.copies, wearCellPx: Math.round(canvasPx * l.wear) };
}

/* ===================== THE TEXEL PIPELINE (T-054) ======================== *
 * Every pixel operation the hull tiles go through lives here, in plain JS on
 * RGBA byte buffers, for one reason: tools/pathcheck can then run the SHIPPED
 * transform over the SHIPPED asset and assert on the output pixels. The
 * version this replaces expressed the same steps as CSS `filter` strings on a
 * 2D context, which no headless gate can execute — so the only thing the gate
 * could check was that the strings were still spelled correctly, and both of
 * the defects T-054 exists to fix (contrast compressed to nothing, tiles
 * minified past legibility) sat under a green gate for a full cycle.
 *
 * Everything resamples and composites in LINEAR light, because that is what
 * the GPU samples the texture in. Averaging sRGB bytes is the same class of
 * error as averaging f-stops.                                              */

export function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
export function linearToSrgb(c) {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

const S2L = new Float64Array(256);
for (let i = 0; i < 256; i++) S2L[i] = srgbToLinear(i / 255);

/* Area-average resample of an RGBA buffer, in linear light. Handles both
   directions: shrinking averages the covered source texels (a real box
   filter — this is the step that makes a 128px tile honest at 72px), and
   growing degenerates to picking the covering texel, which is all a
   magnified grime overlay needs. Alpha stays in its own (already linear)
   8-bit space. */
export function resample(src, sw, sh, dw, dh) {
  const out = new Uint8ClampedArray(dw * dh * 4);
  const fx = sw / dw, fy = sh / dh;
  for (let y = 0; y < dh; y++) {
    const y0 = Math.floor(y * fy), y1 = Math.max(y0 + 1, Math.ceil((y + 1) * fy));
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor(x * fx), x1 = Math.max(x0 + 1, Math.ceil((x + 1) * fx));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < Math.min(sh, y1); sy++) {
        for (let sx = x0; sx < Math.min(sw, x1); sx++) {
          const i = (sy * sw + sx) * 4;
          r += S2L[src[i]]; g += S2L[src[i + 1]]; b += S2L[src[i + 2]]; a += src[i + 3];
          n++;
        }
      }
      const o = (y * dw + x) * 4;
      if (!n) { out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0; continue; }
      out[o] = Math.round(linearToSrgb(r / n) * 255);
      out[o + 1] = Math.round(linearToSrgb(g / n) * 255);
      out[o + 2] = Math.round(linearToSrgb(b / n) * 255);
      out[o + 3] = Math.round(a / n);
    }
  }
  return out;
}

/* Tile `cell` (cellPx square) across a canvasPx square destination, alpha-over
   in linear light. `flip` mirrors alternate columns and rows, which is what
   denies the eye the wear overlay's own repeat (tools/assets/tile.mjs's whole
   reason to exist) — the base grid does not need it, because its cell divides
   the canvas exactly and a mirrored panel joint would fight the tile's own
   authored seam continuity. */
export function tileOver(dst, canvasPx, cell, cellPx, flip) {
  const rows = Math.ceil(canvasPx / cellPx);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < rows; col++) {
      const mx = flip && (row + col) % 2 === 1;
      const my = flip && row % 2 === 1;
      for (let y = 0; y < cellPx; y++) {
        const dy = row * cellPx + y;
        if (dy >= canvasPx) break;
        const sy = my ? cellPx - 1 - y : y;
        for (let x = 0; x < cellPx; x++) {
          const dx = col * cellPx + x;
          if (dx >= canvasPx) break;
          const sx = mx ? cellPx - 1 - x : x;
          const s = (sy * cellPx + sx) * 4, d = (dy * canvasPx + dx) * 4;
          const a = cell[s + 3] / 255;
          if (a <= 0) continue;
          if (a >= 1) {
            dst[d] = cell[s]; dst[d + 1] = cell[s + 1]; dst[d + 2] = cell[s + 2]; dst[d + 3] = 255;
            continue;
          }
          for (let c = 0; c < 3; c++)
            dst[d + c] = Math.round(linearToSrgb(S2L[cell[s + c]] * a + S2L[dst[d + c]] * (1 - a)) * 255);
          dst[d + 3] = 255;
        }
      }
    }
  }
  return dst;
}

/* --------------------------- the tone curve ------------------------------ *
 * THE INSIGHT T-054 IS BUILT ON: normalizing the MEAN is not the same as
 * compressing the RANGE. The pass this replaces multiplied the tile's
 * brightness until its mean reached 235/255 and let the top of the range clip
 * against white; a tile whose mean sits at 92% of full scale has 8% of the
 * range left to say anything with, and the surface it modulates goes flat.
 *
 * What replaces it is an affine curve in display space — every level is
 * scaled about the tile's own mean, then re-centred — solved against the
 * tile's own histogram to hit a target mean AND a target spread. The mean it
 * targets is deliberately WELL BELOW white, and the brightness that costs is
 * paid back by `gain`: the scalar the material's own color is multiplied by,
 * so mean(map) * gain == 1 in linear light and the surface's average
 * brightness is exactly what it was with no map at all. That is the whole
 * trick — the mean is corrected where there is headroom to correct it, and
 * the tile keeps its range.
 *
 * HUE IS STILL PRESERVED BY CONSTRUCTION, the property T-052's reviewer
 * proved for `grayscale(100%)` and this must not lose: `applyToneCurve`
 * writes R = G = B = lut[luminance] at every texel, so the map can only ever
 * scale all three channels of the palette token equally, warm tile on cool
 * token included. `gain` is a scalar for the same reason. Two multiplies,
 * neither of which can shift hue. tools/pathcheck asserts it over the real
 * composited buffer rather than over this comment.                         */

export const TILE_TONE = {
  // 190/255 in display terms: bright enough that `gain` stays under 2x (so the
  // brightest texel lands ~1.8x the token, a highlight, not a blowout), dark
  // enough to leave real range below it. sd 52 is ~2.7x what the tone-mapped
  // hull band carried before; the cap on `contrast` is what stops a
  // low-contrast source from being amplified into grain to reach it.
  targetMean: 190,
  targetSd: 52,
  lo: 16,                    // never crush a texel to black: a black texel is
  hi: 255,                   //   a hole in the surface, not a panel line
  maxContrast: 4,
  maxGain: 2.6,
  /* MEASURED, and the one number here that is not derivable from the tile.
     `gain = 1 / linMean` is exact in ALBEDO terms — the surface's average
     reflectance is identical to the flat build's. The FRAME is not linear:
     ACES tone mapping has a toe, and a dark surface whose albedo now swings
     +-30% about that same mean comes out of the toe brighter than a flat one
     at the same average. Capture, same position and moment, lower-hull band
     against the ?tex=flat control: untrimmed 46.93 vs 42.78 (+9.7%, which
     spends most of the +-10% fence T-054 was given); at 0.88, 42.71 vs 42.95
     (-0.6%). Bounded to (0, 1] on purpose — this may correct a brightening
     the tone curve caused, and may never brighten a surface on its own. */
  gainTrim: 0.88,
};

// The production armour painting already carries broad value structure. The
// original curve above was authored to recover definition from the nearly
// flat placeholder tiles; driving the new scutes to the same 52-SD target
// turns their tendon channels into black corrugations. Keep this runtime tune
// beside the transform it controls so the renderer and Node-safe visual gates
// exercise the exact same curve.
export const SCUTE_TILE_TONE = Object.freeze({
  ...TILE_TONE,
  targetSd: 30,
  gainTrim: 0.98,
});

export function luminanceHistogram(rgba) {
  const h = new Float64Array(256);
  for (let i = 0; i < rgba.length; i += 4)
    h[Math.min(255, Math.round(0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]))]++;
  return h;
}

function histStats(h) {
  let n = 0, s = 0, sq = 0;
  for (let v = 0; v < 256; v++) { n += h[v]; s += h[v] * v; sq += h[v] * v * v; }
  if (!n) return { n: 0, mean: 0, sd: 0 };
  const mean = s / n;
  return { n, mean, sd: Math.sqrt(Math.max(0, sq / n - mean * mean)) };
}

function applyLut(h, lut) {
  const out = new Float64Array(256);
  for (let v = 0; v < 256; v++) out[lut[v]] += h[v];
  return out;
}

function lutFor(mid, contrast, srcMean, tone) {
  const lut = new Uint8Array(256);
  for (let v = 0; v < 256; v++)
    lut[v] = Math.max(tone.lo, Math.min(tone.hi, Math.round(mid + (v - srcMean) * contrast)));
  return lut;
}

/* Solve the curve against a histogram. Iterative for the same reason T-052's
   brightness solve was: the clamps at `lo`/`hi` mean the achieved mean and sd
   are not the requested ones, so the only honest way to hit a target is to
   measure what a trial actually achieves and correct. Ten passes settle every
   tile in the tree well inside 1%. */
export function buildToneCurve(hist, tone = TILE_TONE) {
  const src = histStats(hist);
  if (!src.n) return null;
  let contrast = 1, mid = tone.targetMean;
  let lut = lutFor(mid, contrast, src.mean, tone);
  let got = histStats(applyLut(hist, lut));
  for (let i = 0; i < 10; i++) {
    if (got.sd > 0.5)
      contrast = Math.max(0.25, Math.min(tone.maxContrast, contrast * (tone.targetSd / got.sd)));
    mid += tone.targetMean - got.mean;
    lut = lutFor(mid, contrast, src.mean, tone);
    got = histStats(applyLut(hist, lut));
  }
  const out = applyLut(hist, lut);
  let n = 0, ls = 0, lsq = 0;
  for (let v = 0; v < 256; v++) { n += out[v]; ls += out[v] * S2L[v]; lsq += out[v] * S2L[v] * S2L[v]; }
  const linMean = ls / n;
  const linSd = Math.sqrt(Math.max(0, lsq / n - linMean * linMean));
  const gainExact = Math.max(1, Math.min(tone.maxGain, linMean > 0 ? 1 / linMean : 1));
  return {
    lut,
    contrast,
    mean: got.mean,
    sd: got.sd,
    linMean,
    // relative spread in LINEAR light: the number that predicts how much the
    // surface's brightness actually moves texel to texel once the GPU has
    // multiplied it into the palette token.
    linRelSd: linMean > 0 ? linSd / linMean : 0,
    // mean(map) * gainExact == 1 in linear light: the surface keeps the
    // average ALBEDO it had with no map at all (clamped, so a pathologically
    // dark tile cannot ask for an unbounded multiply). `gain` is what the
    // material is actually given — the same number after the measured
    // tone-mapping trim above.
    gainExact,
    gain: gainExact * tone.gainTrim,
  };
}

// In place, and gray by construction — see the hue note above.
export function applyToneCurve(rgba, lut) {
  for (let i = 0; i < rgba.length; i += 4) {
    const v = lut[Math.min(255, Math.round(
      0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]))];
    rgba[i] = rgba[i + 1] = rgba[i + 2] = v;
    rgba[i + 3] = 255;
  }
  return rgba;
}

/* The whole composite, from decoded source pixels to the buffer materials.js
   uploads: resample the base tile to the size the shipped view can resolve,
   tile it, blend the wear overlay at its own decorrelated cell size, then
   solve and apply one tone curve over the RESULT. Solving after the resample
   is the point: whatever the downsample averaged away is measured, and the
   curve puts the contrast back at the scale that survives to the screen.
   Returns null for a missing base — the caller's cue to leave the material
   exactly as flat as it was (entry 16's degrade contract). */
export function composeHullTile(cfg, key, base, wear, tone = TILE_TONE) {
  const layout = hullTexCanvas(cfg, key);
  if (!layout || !base || !base.data) return null;
  const cell = resample(base.data, base.width, base.height, layout.cellPx, layout.cellPx);
  const px = layout.canvasPx;
  const buf = new Uint8ClampedArray(px * px * 4);
  tileOver(buf, px, cell, layout.cellPx, false);
  if (wear && wear.data && layout.wearCellPx >= 8) {
    const wc = resample(wear.data, wear.width, wear.height, layout.wearCellPx, layout.wearCellPx);
    tileOver(buf, px, wc, layout.wearCellPx, true);
  }
  const curve = buildToneCurve(luminanceHistogram(buf), tone);
  if (!curve) return null;
  applyToneCurve(buf, curve.lut);
  return { data: buf, width: px, height: px, curve, layout };
}

// ?tex=flat is the only thing that turns the pass off (decisions.md entry
// 16: ON by default, a flag is the A/B). Absence, '', and any other junk all
// resolve to "on" — the same "only an exact opt-out" idiom src/pure/post.js
// uses for ?bloom=/?aa=, so a mistyped query never silently disables art.
export function resolveHullTexOn(value) {
  return value !== 'flat';
}
