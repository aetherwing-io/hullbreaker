// T-123: the crisp sprite path (decisions.md entry 27) — the pure half.
//
// What a player can observe is measured in the browser (tools/crisp-sprite/
// capture.mjs + its grid probe: RIG's drawn pixels against his device tile,
// the canvas against css x dpr, the in-game gain). This domain holds the
// arithmetic every one of those depends on, each with a NEGATIVE CONTROL run
// inside the gate itself, so a predicate that has quietly stopped binding
// shows up as red here rather than as a green capture nobody re-reads:
//
//   1. ?art= resolves to the crisp path by default; only `legacy` restores
//      today's renderer; the flag never reaches the simulation (a scripted
//      sim pass is byte-identical with and without it).
//   2. NO RESAMPLE: at DPR 1, 2 and 3 on the target viewports the crisp
//      policy's backing store is exactly css x dpr (compositor scale 1); the
//      legacy policy (1.25x supersample, 2.2x cap) fails the same predicate.
//   3. GRID SNAP: the snapped figure lands on a pixel edge, the tile rect is
//      whole pixels, and the quad audit passes a crisp quad and fails a
//      half-pixel offset, a fractional scale and a skew.
//   4. THE ONE REDUCTION: premultiplied, sRGB-encoded box average, 50% cut.
//   5. FULL GAIN: the exact ACES inverse round-trips every 8-bit colour
//      through src/pure/tonemap.js's forward curve (the shipped OutputPass
//      transcription); drawing the texel straight into the tone map does
//      not — that is the darkening the lit path shipped.
//   6. THE BLOOM CEILING: below the threshold, untouched; above it, held to
//      the brightest value the bloom pass will not catch.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { layerFiles, ok, srcDir, stripComments } from './_context.mjs';
import { LIGHT_RIG, POST_TUNE } from '../../src/config.js';
import {
  ACES_OUTPUT_INVERSE, BLOOM_LUMA, CRISP_ALPHA_CUT, CRISP_BLOOM_MARGIN, CRISP_SUPERSAMPLE,
  bloomSafeScale, crispSupersample, crispTileRect, inverseAcesExact, quadGridDeviation,
  reduceBlock, resolveArtMode, resolveCrispScale, rrtOdtFitInverse, snapAnchor, srgbDecode,
  srgbEncode,
} from '../../src/pure/crisp-sprite.js';
import {
  CRISP_RENDER_PIXEL_BUDGET, RENDER_PIXEL_BUDGET, canvasCompositorScale, resolveCrispPixelRatio,
  resolveRenderPixelRatio,
} from '../../src/pure/render-budget.js';
import { acesFilmic, linearToSrgb, srgbToLinear } from '../../src/pure/tonemap.js';

export const title = 'T-123 — the crisp sprite path: device grid, one reduction, full gain (entry 27)';

export async function run() {
  /* ---------------------------- 1. the flag ----------------------------- */
  ok(resolveArtMode(null) === 'crisp' && resolveArtMode(undefined) === 'crisp' &&
     resolveArtMode('') === 'crisp' && resolveArtMode('crisp') === 'crisp' &&
     resolveArtMode('LEGACY') === 'crisp' && resolveArtMode('1') === 'crisp',
     'T-123: ?art= absent, empty or junk is the crisp path — ON by default (entry 27)');
  ok(resolveArtMode('legacy') === 'legacy',
     'T-123: ?art=legacy (exactly) restores today\'s renderer');
  ok(resolveCrispScale(null) === 1 && resolveCrispScale('half') === 2 &&
     resolveCrispScale('2') === 2 && resolveCrispScale('junk') === 1,
     'T-123: ?crispscale=half is the one opt-in whole-number step down; anything else is full ratio');
  {
    const modeSrc = stripComments(readFileSync(join(srcDir, 'mode.js'), 'utf8'));
    ok(/export const ART_ID = resolveArtMode\(QUERY\.get\('art'\)\)/.test(modeSrc) &&
       /export const ART_CRISP = ART_ID === 'crisp'/.test(modeSrc),
       'T-123: src/mode.js resolves ART_ID through the asserted resolver, once, from ?art=');
    // the flag is presentation: no sim module may read it
    const leaks = layerFiles('sim').filter((f) =>
      /ART_ID|ART_CRISP|CRISP_SCALE|crisp-sprite/.test(readFileSync(f, 'utf8')));
    ok(leaks.length === 0,
       'T-123: no src/sim/ module reads ART_ID / ART_CRISP / CRISP_SCALE or the crisp module (' +
       leaks.join(', ') + ')');
  }

  /* ---------------- 1c. every actor family is on the path --------------- */
  {
    const src = (f) => stripComments(readFileSync(join(srcDir, 'render', f), 'utf8'));
    const player = src('player.js'), hostiles = src('hostiles.js'), capsules = src('capsules.js');
    ok(/registerCrispActor\(\{\s*name: 'rig',\s*anchor: rig,\s*parts: \[bodyGroup, armFar, gunGroup, armNear\]/.test(player),
       'T-123: RIG\'s body, both arms and the gun assembly are registered with the crisp path');
    ok(/function crispHostile\(v, e\)/.test(hostiles) &&
       (hostiles.match(/crispHostile\(v, e\);/g) || []).length === 2 &&
       (hostiles.match(/crispDeathRig\(rig, (?:'warden'|e\.kind)\);/g) || []).length === 2 &&
       /unregisterCrispActor\(c\.crisp\)/.test(hostiles) && /unregisterCrispActor\(v\.crisp\)/.test(hostiles),
       'T-123: both hostile spawn paths and both death-rig builders register; corpses and teardown release');
    ok(/registerCrispActor\(\{\s*name: 'capsule'/.test(capsules),
       'T-123: every capsule reliquary row is registered with the crisp path');
    // Whichever module registers an actor atlas first decides its preparation,
    // so every owner must ask for the crisp (nearest, mip-free) setup.
    const owners = ['critical-rig-art.js', 'critical-gameplay-art.js', 'sprites.js',
      'enemy-ecology-art.js', 'actor-motion-art.js', 'wasp-modular-art.js', 'genome-parts.js', 'capsules.js'];
    // every preloadTexture( call, cut at its own balanced closing paren
    const callsIn = (s) => {
      const out = [];
      for (let at = s.indexOf('preloadTexture('); at >= 0; at = s.indexOf('preloadTexture(', at + 1)) {
        let depth = 0, end = at + 'preloadTexture'.length;
        for (; end < s.length; end++) {
          if (s[end] === '(') depth++;
          else if (s[end] === ')' && --depth === 0) break;
        }
        out.push(s.slice(at, end + 1));
      }
      return out;
    };
    const bare = owners.filter((f) => {
      const calls = callsIn(src(f));
      return !calls.length || calls.some((c) => !/actorAtlasOptions\(|RIG_ART_PRELOAD_OPTIONS/.test(c));
    });
    ok(bare.length === 0,
       'T-123: every actor-atlas owner registers through actorAtlasOptions (bare: ' + bare.join(', ') + ')');
    const preload = src('preload.js');
    ok(/if \(opts\.crisp\) \{[\s\S]*?generateMipmaps = false;[\s\S]*?minFilter = THREE\.NearestFilter;[\s\S]*?magFilter = THREE\.NearestFilter;/.test(preload) &&
       /return ART_CRISP \? \{ \.\.\.opts, crisp: true \} : opts;/.test(preload),
       'T-123: a crisp actor atlas is prepared nearest and mip-free; ?art=legacy keeps the caller\'s options');
  }

  /* ------------------------- 2. no resample ----------------------------- */
  const TARGETS = [
    [1280, 720, 1], [1280, 720, 2], [1280, 720, 3],
    [844, 390, 1], [844, 390, 2], [844, 390, 3],
    [390, 844, 2], [390, 844, 3], [932, 430, 3], [1440, 900, 2],
  ];
  const crispAt = (w, h, d) => {
    const r = resolveCrispPixelRatio(d, w, h);
    return { r, s: canvasCompositorScale(w, h, r.ratio, d) };
  };
  for (const [w, h, d] of TARGETS) {
    const { r, s } = crispAt(w, h, d);
    ok(r.ratio === d && r.upscale === 1 && s.noResample &&
       s.backingWidth === w * d && s.backingHeight === h * d,
       `T-123: ${w}x${h} @${d} — crisp backing store is exactly css x dpr (want ${w * d}x${h * d}, ` +
       `got ${s.backingWidth}x${s.backingHeight}), compositor scale 1 (got ratio ${r.ratio}, ` +
       `scale ${s.scaleX.toFixed(4)})`);
    ok(r.pixels <= r.budget,
       `T-123: ${w}x${h} @${d} — full device resolution fits the crisp pixel budget ` +
       `(${(r.pixels / 1e6).toFixed(2)}M <= ${(r.budget / 1e6).toFixed(2)}M)`);
  }
  {
    // NEGATIVE CONTROLS: the same predicate must fail on the shipped legacy
    // policy — the desktop 1.25x supersample and the 2.2x compact cap.
    const legacy = (w, h, d) => canvasCompositorScale(w, h, resolveRenderPixelRatio(d, w, h), d);
    const desk = legacy(1280, 720, 1), phone3 = legacy(844, 390, 3), phone2 = legacy(844, 390, 2);
    ok(!desk.noResample && Math.abs(desk.scaleX - 0.8) < 1e-9,
       'T-123 (negative control): the legacy 1.25x desktop canvas fails no-resample — the browser ' +
       'shrinks it by 0.8 (got ' + desk.scaleX.toFixed(4) + ')');
    ok(!phone3.noResample && Math.abs(phone3.scaleX - 3 / 2.2) < 1e-3,
       'T-123 (negative control): the legacy 2.2x cap fails no-resample on a DPR-3 phone — Safari ' +
       'stretches it by 1.36 (got ' + phone3.scaleX.toFixed(4) + ')');
    ok(!phone2.noResample,
       'T-123 (negative control): the legacy 2.2x cap fails no-resample on a DPR-2 phone too');
    ok(resolveRenderPixelRatio(3, 390, 844) === 2.2 && resolveRenderPixelRatio(2, 1440, 900) === 2.25 &&
       resolveRenderPixelRatio(1, 1280, 720) === 1.25,
       'T-123: ?art=legacy keeps the former policy byte for byte (2.2x compact, 2.25x desktop, 1.25x supersample)');
  }
  {
    // Past the budget: a whole-number step, never a fractional smear. Exact
    // when css x dpr divides by the step; otherwise three.js floors the
    // backing store and the upscale is off the whole number by under 0.1%
    // (5120x2880 @2 -> dpr/3: 3413 px for 3413.33, scale 3.0003) — stated
    // in reports/tasks/T-123/build.md, not hidden.
    for (const [w, h, d] of [[2560, 1440, 2], [5120, 2880, 2], [1920, 1200, 2], [1366, 1024, 3]]) {
      const { r, s } = crispAt(w, h, d);
      const off = Math.max(Math.abs(s.scaleX - r.upscale), Math.abs(s.scaleY - r.upscale)) / r.upscale;
      ok(r.upscale >= 2 && Number.isInteger(r.upscale) && off < 1e-3 && r.pixels <= r.budget,
         `T-123: ${w}x${h} @${d} — past the budget the crisp ratio is dpr/${r.upscale} (upscale ` +
         `${s.scaleX.toFixed(4)}, ${(off * 100).toFixed(3)}% off the whole number), inside ` +
         `${(r.budget / 1e6).toFixed(1)}M drawing pixels`);
    }
    const half = resolveCrispPixelRatio(3, 844, 390, 2);
    const hs = canvasCompositorScale(844, 390, half.ratio, 3);
    ok(half.ratio === 1.5 && half.upscale === 2 && hs.integerUpscale && !hs.noResample,
       'T-123: ?crispscale=half on a DPR-3 phone is 1.5x with an exact 2x (nearest) upscale');
    ok(CRISP_RENDER_PIXEL_BUDGET.compact >= 932 * 430 * 9 &&
       CRISP_RENDER_PIXEL_BUDGET.desktop >= 1920 * 1080 * 4 &&
       CRISP_RENDER_PIXEL_BUDGET.compact > RENDER_PIXEL_BUDGET.compact,
       'T-123: the crisp budgets cover a DPR-3 phone in either orientation and a 200% 1080p desktop');
  }

  /* --------------------------- 3. grid snap ----------------------------- */
  {
    const snap = {};
    let worst = 0, onEdge = true;
    for (let i = 0; i <= 400; i++) {
      const px = -3.7 + i * 0.0371, py = px * 1.37 + 0.123;
      snapAnchor(px, py, snap);
      worst = Math.max(worst, Math.abs(snap.dx), Math.abs(snap.dy));
      if (!Number.isInteger(snap.x) || !Number.isInteger(snap.y) ||
          Math.abs(px + snap.dx - snap.x) > 1e-9 || Math.abs(py + snap.dy - snap.y) > 1e-9) onEdge = false;
    }
    ok(onEdge && worst <= 0.5 + 1e-12,
       'T-123: every snapped anchor lands on a pixel edge, moved by at most half a pixel (worst ' +
       worst.toFixed(4) + ')');
    const rect = {};
    crispTileRect(10.3, 20.7, 41.2, 70.01, 0.4, -0.3, 1, rect);
    ok([rect.x, rect.y, rect.w, rect.h].every(Number.isInteger) &&
       rect.x <= 10.3 + 0.4 - 1 && rect.y <= 20.7 - 0.3 - 1 &&
       rect.x + rect.w >= 41.2 + 0.4 + 1 && rect.y + rect.h >= 70.01 - 0.3 + 1,
       'T-123: the tile rect is whole device pixels and covers the shifted figure plus its margin');
    const q = (x, y, w, h) => [x, y, x + w, y, x, y + h, x + w, y + h];
    const dev = {};
    quadGridDeviation(q(rect.x, rect.y, rect.w, rect.h), rect.w, rect.h, dev);
    ok(dev.crisp && dev.scaleX === 1 && dev.scaleY === 1,
       'T-123: a drawn quad from that rect audits crisp: axis-aligned, on the grid, 1 texel = 1 px');
    // NEGATIVE CONTROLS: the falsifiers the acceptance names
    quadGridDeviation(q(rect.x + 0.5, rect.y, rect.w, rect.h), rect.w, rect.h, dev);
    ok(!dev.crisp && !dev.onGrid && Math.abs(dev.edgePx - 0.5) < 1e-9,
       'T-123 (negative control): a half-pixel offset fails the grid audit (edge off by ' +
       dev.edgePx + ' px)');
    quadGridDeviation(q(rect.x, rect.y + 0.5, rect.w, rect.h), rect.w, rect.h, dev);
    ok(!dev.crisp && !dev.onGrid, 'T-123 (negative control): a half-pixel vertical offset fails too');
    quadGridDeviation(q(rect.x, rect.y, rect.w * 1.36, rect.h * 1.36), rect.w, rect.h, dev);
    ok(!dev.crisp && !dev.integerScale,
       'T-123 (negative control): a 1.36x texel-to-pixel scale (the DPR-3 stretch) fails the audit');
    quadGridDeviation(q(rect.x, rect.y, rect.w * 2, rect.h * 2), rect.w, rect.h, dev);
    ok(dev.crisp && dev.scaleX === 2,
       'T-123: an exact 2x scale is still crisp (the ?crispscale=half / over-budget step)');
    const skew = q(rect.x, rect.y, rect.w, rect.h);
    skew[2] += 0.25; skew[3] += 0.6;
    quadGridDeviation(skew, rect.w, rect.h, dev);
    ok(!dev.crisp && !dev.axisAligned, 'T-123 (negative control): a rotated/skewed quad fails the audit');
    ok(crispSupersample(429 / 2, 16.24) === CRISP_SUPERSAMPLE.max &&
       crispSupersample(429 / 2, 120) === 2 && crispSupersample(10, 1000) === CRISP_SUPERSAMPLE.min,
       'T-123: the reduction supersamples at least the art\'s own minification, within [2, 8]');
  }

  /* ------------------------ 4. the one reduction ------------------------ */
  {
    const out = {};
    const block = (n, fill) => { const a = new Float64Array(n * n * 4); for (let i = 0; i < n * n; i++) fill(a, i); return a; };
    const c = [0.2, 0.05, 0.6];
    reduceBlock(block(4, (a, i) => { a.set([c[0], c[1], c[2], 1], i * 4); }), out);
    ok(Math.abs(out.r - c[0]) < 1e-12 && Math.abs(out.g - c[1]) < 1e-12 && Math.abs(out.b - c[2]) < 1e-12 && out.a === 1,
       'T-123: a uniform opaque block reduces to its own colour, alpha 1');
    // premultiplied input: a half-covered texel still contributes its own colour
    reduceBlock(block(2, (a, i) => { a.set(i < 2 ? [c[0] * 0.5, c[1] * 0.5, c[2] * 0.5, 0.5] : [c[0], c[1], c[2], 1], i * 4); }), out);
    ok(Math.abs(out.r - c[0]) < 1e-9 && out.a === 1,
       'T-123: premultiplied samples are un-premultiplied before averaging (no dark fringe)');
    // the 50% cut
    reduceBlock(block(4, (a, i) => { a.set(i < 8 ? [0.5, 0.5, 0.5, 1] : [0, 0, 0, 0], i * 4); }), out);
    ok(out.a === 1 && out.coverage === 0.5, 'T-123: exactly half coverage is kept (the cut is >= 50%)');
    reduceBlock(block(4, (a, i) => { a.set(i < 7 ? [0.5, 0.5, 0.5, 1] : [0, 0, 0, 0], i * 4); }), out);
    ok(out.a === 0 && CRISP_ALPHA_CUT === 0.5, 'T-123: 7/16 coverage is cut — every drawn pixel is fully opaque');
    // averaged in ENCODED space, as Pillow's RGBa BOX resize did for column A
    const lo = srgbDecode(60 / 255), hi = srgbDecode(120 / 255);
    reduceBlock(block(2, (a, i) => { const v = i % 2 ? hi : lo; a.set([v, v, v, 1], i * 4); }), out);
    const got = srgbEncode(out.r) * 255;
    ok(Math.abs(got - 90) < 1e-6,
       'T-123: two greys 60/120 average to encoded 90 (got ' + got.toFixed(3) +
       '), not the linear-light ~96 — the spike\'s reduction space');
  }

  /* ---------------------------- 5. full gain ---------------------------- */
  {
    ok(ACES_OUTPUT_INVERSE.every((row) => row.every((v) => v >= 0) &&
       Math.abs(row[0] + row[1] + row[2] - 1) < 1e-4),
       'T-123: ACES_OUTPUT^-1 is non-negative with unit rows — every display colour has an exact preimage');
    {
      const fit = (v) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081);
      let worstFit = 0;
      for (let w = 0; w <= 1.0000001; w += 0.01) worstFit = Math.max(worstFit, Math.abs(fit(rrtOdtFitInverse(w)) - w));
      ok(worstFit < 1e-12, 'T-123: the RRT/ODT fit inverse is the fit\'s exact inverse on [0, 1] (worst ' +
         worstFit.toExponential(2) + ')');
    }
    let srgbAgree = true;
    for (let i = 0; i <= 255; i++) {
      const s = i / 255;
      if (Math.abs(srgbDecode(s) - srgbToLinear(s)) > 1e-15 ||
          Math.abs(srgbEncode(srgbDecode(s)) - linearToSrgb(srgbToLinear(s))) > 1e-12) srgbAgree = false;
    }
    ok(srgbAgree, 'T-123: the crisp module\'s sRGB pair agrees with src/pure/tonemap.js on every 8-bit level');
    const x = [0, 0, 0], f = [0, 0, 0];
    for (const exposure of [LIGHT_RIG.exposure, LIGHT_RIG.bright.exposure, 1]) {
      let worst = 0, worstAt = '';
      for (let r = 0; r < 256; r += 15) for (let g = 0; g < 256; g += 15) for (let b = 0; b < 256; b += 15) {
        const y = [srgbToLinear(r / 255), srgbToLinear(g / 255), srgbToLinear(b / 255)];
        inverseAcesExact(y, exposure, x);
        acesFilmic(x, exposure, f);
        const d = Math.max(Math.abs(linearToSrgb(f[0]) * 255 - r), Math.abs(linearToSrgb(f[1]) * 255 - g),
          Math.abs(linearToSrgb(f[2]) * 255 - b));
        if (d > worst) { worst = d; worstAt = [r, g, b].join(','); }
      }
      for (let v = 0; v < 256; v++) {
        const y = [srgbToLinear(v / 255), srgbToLinear(v / 255), srgbToLinear(v / 255)];
        inverseAcesExact(y, exposure, x);
        acesFilmic(x, exposure, f);
        const d = Math.abs(linearToSrgb(f[1]) * 255 - v);
        if (d > worst) { worst = d; worstAt = 'grey ' + v; }
      }
      ok(worst < 0.01,
         `T-123: at exposure ${exposure} the exact inverse round-trips every 8-bit grey and an 18^3 colour ` +
         `grid through the shipped ACES curve (worst ${worst.toFixed(5)} levels${worstAt ? ' at ' + worstAt : ''})`);
    }
    // NEGATIVE CONTROL: the texel straight into the tone map is not full gain
    {
      let worst = 0;
      for (let v = 16; v < 256; v += 16) {
        acesFilmic([srgbToLinear(v / 255), srgbToLinear(v / 255), srgbToLinear(v / 255)], LIGHT_RIG.exposure, f);
        worst = Math.max(worst, Math.abs(linearToSrgb(f[0]) * 255 - v));
      }
      ok(worst > 20,
         'T-123 (negative control): an unlit texel drawn straight into the shipped tone map moves by up to ' +
         worst.toFixed(1) + ' levels — what the inverse exists to cancel');
    }
  }

  /* -------------------------- 6. bloom ceiling -------------------------- */
  {
    const thr = POST_TUNE.bloom.threshold;
    const x = [0, 0, 0];
    const lum = (v) => BLOOM_LUMA[0] * v[0] + BLOOM_LUMA[1] * v[1] + BLOOM_LUMA[2] * v[2];
    let firstCapped = -1;
    for (let v = 0; v < 256; v++) {
      inverseAcesExact([srgbToLinear(v / 255), srgbToLinear(v / 255), srgbToLinear(v / 255)], LIGHT_RIG.exposure, x);
      if (bloomSafeScale(x, thr) < 1) { firstCapped = v; break; }
    }
    ok(firstCapped > 200 && firstCapped < 240,
       'T-123: at the shipped exposure/threshold the crisp path is exact for every grey below ' + firstCapped +
       ' and holds brighter ones under the bloom threshold');
    inverseAcesExact([1, 1, 1], LIGHT_RIG.exposure, x);
    const k = bloomSafeScale(x, thr);
    ok(lum(x) > 10 && Math.abs(lum([x[0] * k, x[1] * k, x[2] * k]) - thr * CRISP_BLOOM_MARGIN) < 1e-9,
       'T-123: white\'s exact inverse (' + lum(x).toFixed(2) + ' linear) would bloom; held, it sits just under ' +
       'the threshold');
    inverseAcesExact([srgbToLinear(0.5), srgbToLinear(0.5), srgbToLinear(0.5)], LIGHT_RIG.exposure, x);
    ok(bloomSafeScale(x, thr) === 1, 'T-123: a mid-grey texel is untouched by the ceiling');
  }

  /* ----------------- 1b. the flag never reaches the sim ------------------ */
  {
    const simBase = 'file://' + join(srcDir, 'sim');
    const child = (query) => `
      globalThis.__HB_QUERY__ = ${JSON.stringify(query)};
      const [T, E, LV, SC, PLm, IN, ST, HO, WP, SP] = await Promise.all([
        import(${JSON.stringify(simBase + '/time.js')}), import(${JSON.stringify(simBase + '/edges.js')}),
        import(${JSON.stringify(simBase + '/level.js')}), import(${JSON.stringify(simBase + '/scroll.js')}),
        import(${JSON.stringify(simBase + '/player.js')}), import(${JSON.stringify(simBase + '/input.js')}),
        import(${JSON.stringify(simBase + '/state.js')}), import(${JSON.stringify(simBase + '/hostiles.js')}),
        import(${JSON.stringify(simBase + '/weapons.js')}), import(${JSON.stringify(simBase + '/spawner.js')}),
      ]);
      const M = await import(${JSON.stringify('file://' + join(srcDir, 'mode.js'))});
      E.setEdges(-18.9, 26.4);
      LV.unbuildFutureFaces();
      ST.setState('PLAYING');
      const p = PLm.player;
      p.x = 6; p.y = 3; p.vx = 0; p.vy = 0;
      IN.keys.right = true; IN.keys.fire = true;
      const rows = [];
      let jumpUntil = 0;
      for (let f = 0; f < 900; f++) {
        if (p.grounded && (LV.groundTopAt(p.x + 1.7) < -100 || LV.groundTopAt(p.x + 1.2) > p.y + 0.6)) {
          IN.bufferJumpUntil(T.gameMs + 120); IN.keys.jump = true; jumpUntil = T.gameMs + 260;
        }
        if (T.gameMs > jumpUntil) IN.keys.jump = false;
        T.advanceGameMs(1000 / 60);
        SC.updateScroll(1 / 60);
        SP.updateSpawner();
        PLm.updatePlayer(1 / 60);
        if (ST.state !== 'PLAYING') break;
        HO.updateHostiles(1 / 60);
        WP.updateBullets(1 / 60);
        rows.push([f, T.gameMs.toFixed(3), T.scrollX.toFixed(6), p.x.toFixed(6), p.y.toFixed(6),
          p.vx.toFixed(6), p.vy.toFixed(6), p.hp, HO.hostiles.length, HO.kills,
          HO.hostiles.map((e) => e.x.toFixed(3) + ':' + e.y.toFixed(3)).join('|')].join(','));
      }
      console.log(JSON.stringify({ art: M.ART_ID, scale: M.CRISP_SCALE, rows }));
    `;
    const trace = (query) => {
      try {
        return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', child(query)],
          { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
      } catch (e) {
        console.error('pathcheck: T-123 sim trace child failed (' + query + '): ' + e.message);
        return null;
      }
    };
    const crisp = trace('');
    const legacy = trace('?art=legacy');
    const half = trace('?crispscale=half');
    ok(!!crisp && !!legacy && !!half && crisp.art === 'crisp' && legacy.art === 'legacy' && half.scale === 2,
       'T-123: the sim runs headlessly under the default, ?art=legacy and ?crispscale=half (each resolved)');
    if (crisp && legacy && half) {
      const same = (a, b) => a.rows.length === b.rows.length && a.rows.every((r, i) => r === b.rows[i]);
      ok(crisp.rows.length > 600 && same(crisp, legacy) && same(crisp, half),
         'T-123: ' + crisp.rows.length + ' simulated frames (player, scroll, hostiles, kills) are identical ' +
         'with and without ?art=legacy / ?crispscale=half — the path is presentation only');
    }
  }
}
