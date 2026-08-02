// palette.mjs — HULLBREAKER's color roles, and the rule that decides whether a
// color belongs to one.
//
// THE RULE: a role is a *hue band*, not a hex. Shades, tints and alpha of a
// role are legal (flat-shaded geometry needs a lit face and a shadow face of
// the same material, and DESIGN's <=8 budget would be spent in one asset
// otherwise); a hue that lands in none of the bands is off-palette and gets
// flagged. Lightness and chroma are therefore free above the neutral floor.
//
// WHERE THE NUMBERS COME FROM: every band below is measured, not chosen.
// `probe.mjs` histograms the endorsed concept boards in CIELCh; those clusters
// set each band's center, and the band is then widened just far enough to also
// admit the colors the game already ships in `src/config.js`'s grey-box
// palette. Both sets of measurements are recorded per role in `evidence` so a
// future artist can see the slack and re-derive it. The README's palette table
// lists them all with their measured L/C/h.
//
// ROLE BUDGET: DESIGN's Concept section caps the palette at eight colors and
// names five of them. This file spends the remaining three on the neutral axis
// (ink, hull, haze) that the grey-box already uses for background, structure
// and fog — so exactly eight roles, which `check.mjs` asserts.

import { parseColor, rgbToLch, deltaE76, toHex } from './color.mjs';

/**
 * Below this CIELCh chroma a color carries no hue commitment — it reads as a
 * grey/ink/haze tone and is allowed under the neutral axis regardless of
 * lightness. Calibrated against the shipped neutrals, whose chroma runs 2.9
 * (player) to 9.2 (limb haze); the most chromatic thing that must still pass
 * as neutral is that haze, and the least chromatic thing that must still be
 * judged by hue is a muzzle warm-white at chroma 24.2.
 */
export const NEUTRAL_MAX_CHROMA = 12;

export const ROLES = [
  {
    id: 'deep-teal',
    kind: 'chromatic',
    label: 'deep teal',
    use: 'atmosphere, environment, fog',
    hue: [200, 240],
    anchor: '#0e5f6c',
    evidence: {
      boards: 'boards 10/11/13 mass clusters at h 207.9-223.7 (17-24% of screen each)',
      shipped: 'shots.L lance cyan h 206.5',
    },
  },
  {
    id: 'rust-orange',
    kind: 'chromatic',
    label: 'rust-orange',
    use: 'metal, structure, armour',
    hue: [48, 78],
    anchor: '#9b5c31',
    evidence: {
      boards: 'boards 01/06/07/13 rust clusters h 51.7-63.9',
      shipped: 'shots.F h 53.1, houndTell warm blink h 71.3',
    },
  },
  {
    id: 'warm-white',
    kind: 'chromatic',
    label: 'warm white',
    use: 'muzzle light, player fire, gold trim',
    hue: [78, 100],
    anchor: '#ffe79b',
    evidence: {
      boards: 'boards 01/13 warm highlights h 82.3-93.0',
      shipped: 'shots.S h 79.5, gun h 81.3, modCapsule h 89.2, shots.R h 94.6',
    },
  },
  {
    id: 'acid-green',
    kind: 'chromatic',
    label: 'acid green',
    use: 'enemy glow, danger, hostile ecology',
    hue: [100, 150],
    anchor: '#a8c22a',
    evidence: {
      boards: 'boards 01/06/07 acid clusters h 103.6-113.1 (yellow-green)',
      shipped: 'houndCharge h 130.6, hound h 129.2, wasp h 141.7, carrier h 146.3',
      note: 'the widest band, and knowingly so: the boards paint acid-green ' +
        'markedly more yellow than the grey-box paints its hostile ecology. ' +
        'Narrowing it is a real art decision (which end is canon?), not a ' +
        'tolerance tweak — flagged for the operator rather than settled here.',
    },
  },
  {
    id: 'hot-magenta',
    kind: 'chromatic',
    label: 'hot magenta',
    use: 'pickups, power, reward',
    hue: [325, 5],                                  // wraps through 0
    anchor: '#ff4fd8',
    evidence: {
      boards: 'boards 01/07/13 magenta accents h 330.0-0.3',
      shipped: 'capsule h 336.4, shots.H h 338.1',
    },
  },
  {
    id: 'ink',
    kind: 'neutral',
    label: 'ink',
    use: 'darkest neutral, glyph strokes, void',
    anchor: '#14181e',
    evidence: { shipped: 'capsule letter ink #14181e (L 8.1), CONFIG.palette.bg (L 15.9)' },
  },
  {
    id: 'haze',
    kind: 'neutral',
    label: 'haze',
    use: 'mid neutral, fog, receding structure',
    anchor: '#46525f',
    evidence: { shipped: 'CONFIG.limb.bg #46525f (L 34.3)' },
  },
  {
    id: 'hull',
    kind: 'neutral',
    label: 'hull',
    use: 'light neutral, deck surfaces, RIG',
    anchor: '#767c85',
    evidence: { shipped: 'CONFIG.palette.ground #767c85 (L 51.8), player #d9dde2 (L 87.9)' },
  },
];

export const CHROMATIC_ROLES = ROLES.filter((r) => r.kind === 'chromatic');
export const NEUTRAL_ROLES = ROLES.filter((r) => r.kind === 'neutral');

function inBand(h, [lo, hi]) {
  return lo <= hi ? h >= lo && h < hi : h >= lo || h < hi;   // wrapping band
}

/**
 * Classify one color.
 * -> { ok, roleId, kind, hex, lch, reason }
 * `ok: false` means "no role owns this hue" — the off-palette signal.
 */
export function classify(input) {
  const rgb = parseColor(input);
  if (!rgb) return { ok: false, roleId: null, kind: null, hex: String(input), lch: null, reason: 'unparseable color' };
  const lch = rgbToLch(rgb);
  const hex = toHex(rgb);
  const round = { L: +lch.L.toFixed(1), C: +lch.C.toFixed(1), h: +lch.h.toFixed(1) };

  if (lch.C < NEUTRAL_MAX_CHROMA) {
    const nearest = NEUTRAL_ROLES
      .map((r) => ({ r, d: deltaE76(rgb, parseColor(r.anchor)) }))
      .sort((a, b) => a.d - b.d)[0];
    return {
      ok: true, roleId: nearest.r.id, kind: 'neutral', hex, lch: round, alpha: rgb.a,
      reason: `chroma ${round.C} < ${NEUTRAL_MAX_CHROMA}: neutral axis, nearest anchor ${nearest.r.id}`,
    };
  }

  const role = CHROMATIC_ROLES.find((r) => inBand(lch.h, r.hue));
  if (!role) {
    return {
      ok: false, roleId: null, kind: 'chromatic', hex, lch: round, alpha: rgb.a,
      reason: `hue ${round.h} falls in no role band (chroma ${round.C} is above the ` +
        `neutral floor ${NEUTRAL_MAX_CHROMA}, so it must commit to a role)`,
    };
  }
  return {
    ok: true, roleId: role.id, kind: 'chromatic', hex, lch: round, alpha: rgb.a,
    reason: `hue ${round.h} in ${role.id} band [${role.hue[0]}, ${role.hue[1]})`,
  };
}

/**
 * Classify a weighted color list (a PNG histogram or an SVG's literals).
 * `minCoverage` exists for raster input: antialiasing manufactures thousands of
 * one-off blend pixels along every edge, and a blend of two legal roles can sit
 * in an illegal band between them. Judging those as authored color would make
 * every rasterized asset fail, so only colors covering at least this fraction
 * of non-transparent pixels are gated; the rest are counted and reported as
 * `belowThreshold`. Vector input passes weight 1 per literal and a threshold of
 * 0, since every literal there was typed by someone.
 *
 * FOR RASTER INPUT, PREFER `checkRasterColors` BELOW. This function's per-color
 * threshold is sound for a flat vector fill rasterized with antialiased edges —
 * a handful of big authored colors, a fringe of blends — and goes vacuous on a
 * painted one: tens of thousands of unique colors, none of which individually
 * reaches 0.5%, so `gated` collapses toward 0, `offPalette` empties, and the
 * check passes while judging nothing. The measured numbers for the assets in
 * this repo are in tools/assets/README.md § "Palette compliance (raster)".
 */
export function checkColors(entries, { minCoverage = 0 } = {}) {
  const roles = new Map();
  const offPalette = [];
  let belowThreshold = 0, gated = 0;

  for (const e of entries) {
    const coverage = e.coverage ?? 1;
    const res = classify(e.color ?? e);
    if (coverage < minCoverage) {
      // Not attributed to a role either, deliberately. An edge blend between
      // two authored roles can land inside a third role's band (measured: a
      // warm-white/magenta blend at 0.44% classifies as rust-orange), and
      // counting it would put a role in the manifest that nobody drew — and
      // churn that list every time the asset is re-rendered at a new size.
      belowThreshold++;
      continue;
    }
    gated++;
    if (res.ok) {
      roles.set(res.roleId, (roles.get(res.roleId) || 0) + coverage);
    } else {
      offPalette.push({ ...res, coverage: +coverage.toFixed(5), count: e.count });
    }
  }

  return {
    ok: offPalette.length === 0,
    roles: [...roles.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, coverage]) => ({ id, coverage: +coverage.toFixed(4) })),
    offPalette: offPalette.sort((a, b) => b.coverage - a.coverage),
    gated,
    belowThreshold,
    minCoverage,
  };
}

/* ===================================================================== *
 * THE RASTER RULE
 *
 * Why a second rule at all. `checkColors` above judges one color at a time and
 * exempts anything under a coverage threshold. That is the right shape for a
 * flat vector fill — a dozen authored colors plus an antialiased fringe — and
 * the wrong shape for a painted asset built from noise, gradients and dither,
 * where no single color reaches the threshold and the gate ends up judging
 * nothing at all. A rule that cannot fail is not a rule.
 *
 * So raster assets are judged by MASS, not by per-color coverage, and the
 * question asked of each color changes from "is this color big enough to
 * bother with" to "where did this color come from":
 *
 *   IN BAND    its hue belongs to a role (or its chroma is below the neutral
 *              floor). Legal, and it is what most of the image should be.
 *   BLEND      off band, but it lies on the straight sRGB segment between two
 *              colors the asset itself uses in quantity. This is the pixel a
 *              gradient, an antialiased edge or a dither pattern produces, and
 *              it is legal: interpolating between two palette tokens introduces
 *              no new hue, it only crosses the gap between two owned ones.
 *   ALIEN      off band and on no such segment. A hue nobody in this image
 *              mixed. This is the failure the rule exists to catch, and it
 *              fails at a mass far below anything a human would notice, because
 *              an alien hue does not arrive in small quantities by accident.
 *
 * Two caps, both reported on every run whether they bind or not:
 *   alienMass   — the hard one. Off-band mass with no blend explanation.
 *   offBandMass — the "third hue as a design element" guard. A blend BETWEEN
 *                 two owned tokens is legal per pixel, but if a tenth of the
 *                 image is sitting in the gap between two bands then the gap is
 *                 what the asset is made of, and the palette has grown a color
 *                 whatever the author intended.
 *
 * The numbers below are calibrated against every asset in this repo, both the
 * flat vector rasterizations and the procedural ones — measured, with the
 * headroom written down, in tools/assets/README.md § "Palette compliance
 * (raster)". Changing one is an art decision and belongs in that table.
 * ===================================================================== */

/**
 * Alpha below which a pixel's stored color is not evidence of its hue.
 *
 * A canvas stores premultiplied 8-bit color: what lands in the PNG is
 * `round(color * a/255) * 255/a`, so the recovered channel is quantized to
 * steps of `255/a` levels — 8 levels at alpha 32, 25.5 at alpha 10. On a dark
 * color that is enough to swing the CIELCh hue by tens of degrees, and it does:
 * measured on `wear-scuff-overlay`, 70 pixels at alpha 9-10, every color in the
 * recipe derived from `env.PALETTE`, read back as blue-violets at hue 295-296
 * that no role owns. Those pixels also contribute at most 4% of a composited
 * pixel each, so the gate was failing an asset over rounding noise nobody can
 * see.
 *
 * Above this floor the quantization step is <= 8 levels, inside the blend
 * test's own tolerance. Below it, the pixels are excluded from the hue verdict
 * and their off-band mass is REPORTED separately — excluded, not hidden.
 */
export const ALPHA_HUE_FLOOR = 32;

export const RASTER_LIMITS = {
  /** Mass of unexplainable off-band pixels that fails the asset. */
  alienMass: 0.001,
  /** Mass of off-band pixels — blends included — that fails the asset. */
  offBandMass: 0.05,
  /** sRGB distance a color may sit off a blend segment and still count as that blend. */
  blendEps: 10,
  /** A color must carry at least this mass to be usable as a blend endpoint. */
  anchorMinMass: 0.0005,
  /** Cap on endpoints considered, for cost: the segment test is O(anchors^2). */
  maxAnchors: 48,
  /** Endpoints considered for THREE-way blends, where the cost is O(n^3). */
  maxTriangleAnchors: 12,
  /** A role must carry at least this mass to be recorded in the manifest. */
  roleReportMass: 0.005,
};

/**
 * Quantized bucket key for anchor clustering — 16 levels per channel.
 *
 * The grid size is not free: an anchor is a bucket's weighted mean, so half the
 * bucket's width is the error between the anchor and the colors it stands for.
 * At 8 levels per channel (32-wide buckets) that error is up to 16 per channel,
 * larger than `blendEps` itself, and blends of colors inside one bucket started
 * reading as alien — measured on `backdrop-crown-horizon`, whose fog lives in
 * four buckets and whose dither then had nothing legal to sit on. At 16 levels
 * the half-width is 8, inside the tolerance, and the anchor set stays small.
 */
const bucketKey = (r, g, b) => ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);

/**
 * Squared distance from p to the TRIANGLE abc, in sRGB — the three-way blend.
 *
 * Two layers of paint over a third produce a pixel inside the triangle of the
 * three colors, not on any edge of it, and a soft fog gradient laid over an
 * already-graded surface does it constantly: measured on the first painted
 * `backdrop-crown-horizon`, 0.078% of the plate is teal/haze/ink triple blends
 * at hues 257-285 that no two-color segment explains. Those are still only
 * interpolation between colors the asset uses, so they are still blends. Only
 * the interior is tested here; the edges are the segment test's job and are
 * already covered.
 */
function distSqToTriangle(p, a, b, c) {
  const e0 = { r: b.r - a.r, g: b.g - a.g, b: b.b - a.b };
  const e1 = { r: c.r - a.r, g: c.g - a.g, b: c.b - a.b };
  const d = { r: p.r - a.r, g: p.g - a.g, b: p.b - a.b };
  const dot = (u, v) => u.r * v.r + u.g * v.g + u.b * v.b;
  const a00 = dot(e0, e0), a01 = dot(e0, e1), a11 = dot(e1, e1);
  const det = a00 * a11 - a01 * a01;
  if (det <= 1e-9) return Infinity;                 // degenerate: the edges cover it
  const b0 = dot(d, e0), b1 = dot(d, e1);
  const s = (a11 * b0 - a01 * b1) / det;
  const t = (a00 * b1 - a01 * b0) / det;
  if (s < 0 || t < 0 || s + t > 1) return Infinity; // outside: an edge case, literally
  const q = { r: a.r + e0.r * s + e1.r * t, g: a.g + e0.g * s + e1.g * t, b: a.b + e0.b * s + e1.b * t };
  return (p.r - q.r) ** 2 + (p.g - q.g) ** 2 + (p.b - q.b) ** 2;
}

/** Squared distance from point p to the segment ab, in sRGB. */
function distSqToSegment(p, a, b) {
  const abx = b.r - a.r, aby = b.g - a.g, abz = b.b - a.b;
  const apx = p.r - a.r, apy = p.g - a.g, apz = p.b - a.b;
  const denom = abx * abx + aby * aby + abz * abz;
  let t = denom > 0 ? (apx * abx + apy * aby + apz * abz) / denom : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t;
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Judge a raster histogram by mass.
 *
 * `entries`: [{ color: {r,g,b}, coverage, count }] over non-transparent pixels,
 * coverage summing to 1 — exactly what lib/png.mjs `histogram()` produces.
 *
 * -> {
 *      ok, roles, alien: { mass, colors[] }, offBand: { mass, clusters[] },
 *      inBandMass, anchors, unique, limits
 *    }
 */
export function checkRasterColors(entries, limits = {}) {
  const lim = { ...RASTER_LIMITS, ...limits };
  const roleMass = new Map();
  const buckets = new Map();
  const offBand = [];
  let inBandMass = 0, offBandMass = 0, unique = 0;

  for (const e of entries) {
    const coverage = e.coverage ?? 0;
    const color = e.color ?? e;
    const res = classify(color);
    unique++;
    if (res.ok) {
      inBandMass += coverage;
      roleMass.set(res.roleId, (roleMass.get(res.roleId) || 0) + coverage);
      const rgb = parseColor(color);
      const key = bucketKey(rgb.r, rgb.g, rgb.b);
      const b = buckets.get(key) || { r: 0, g: 0, b: 0, mass: 0 };
      b.r += rgb.r * coverage; b.g += rgb.g * coverage; b.b += rgb.b * coverage; b.mass += coverage;
      buckets.set(key, b);
    } else {
      offBandMass += coverage;
      offBand.push({ ...res, rgb: parseColor(color), coverage, count: e.count });
    }
  }

  // Blend endpoints: the in-band colors this asset actually uses, clustered so
  // a smooth gradient contributes a handful of representative points rather
  // than ten thousand near-identical ones.
  const anchors = [...buckets.values()]
    .filter((b) => b.mass >= lim.anchorMinMass)
    .sort((a, b) => b.mass - a.mass)
    .slice(0, lim.maxAnchors)
    .map((b) => ({ r: b.r / b.mass, g: b.g / b.mass, b: b.b / b.mass, mass: b.mass }));

  const epsSq = lim.blendEps * lim.blendEps;
  // Triangles are only tried on colors no segment explains, and only over the
  // heaviest anchors: the test is O(n^3) and a blend endpoint that carries
  // almost none of the image is not what a third layer was painted with.
  const tri = anchors.slice(0, lim.maxTriangleAnchors);
  const alien = [];
  let alienMass = 0, blendMass = 0;
  for (const off of offBand) {
    let explained = false;
    for (let i = 0; i < anchors.length && !explained; i++) {
      for (let j = i; j < anchors.length; j++) {
        if (distSqToSegment(off.rgb, anchors[i], anchors[j]) <= epsSq) { explained = true; break; }
      }
    }
    for (let i = 0; i < tri.length && !explained; i++) {
      for (let j = i + 1; j < tri.length && !explained; j++) {
        for (let k = j + 1; k < tri.length; k++) {
          if (distSqToTriangle(off.rgb, tri[i], tri[j], tri[k]) <= epsSq) { explained = true; break; }
        }
      }
    }
    if (explained) { blendMass += off.coverage; continue; }
    alienMass += off.coverage;
    off.isAlien = true;
    alien.push(off);
  }

  // Off-band hue clusters, for the report: which gaps the blends live in, and
  // how much sits there. 5-degree bins, contiguous runs merged.
  const bins = new Map();
  for (const off of offBand) {
    const bin = Math.floor(off.lch.h / 5);
    const b = bins.get(bin) || { mass: 0, alien: 0, example: off.hex, lo: off.lch.h, hi: off.lch.h };
    b.mass += off.coverage;
    if (off.isAlien) b.alien += off.coverage;
    b.lo = Math.min(b.lo, off.lch.h); b.hi = Math.max(b.hi, off.lch.h);
    if (off.coverage > 0 && off.coverage >= (b.topCoverage || 0)) { b.example = off.hex; b.topCoverage = off.coverage; }
    bins.set(bin, b);
  }
  const clusters = [];
  for (const bin of [...bins.keys()].sort((a, b) => a - b)) {
    const b = bins.get(bin);
    const last = clusters[clusters.length - 1];
    if (last && bin - last.lastBin <= 1) {
      last.mass += b.mass; last.alienMass += b.alien;
      last.hueHi = Math.max(last.hueHi, b.hi); last.lastBin = bin;
      if (b.topCoverage >= last.topCoverage) { last.example = b.example; last.topCoverage = b.topCoverage; }
    } else {
      clusters.push({
        hueLo: b.lo, hueHi: b.hi, mass: b.mass, alienMass: b.alien,
        example: b.example, topCoverage: b.topCoverage || 0, lastBin: bin,
      });
    }
  }
  for (const c of clusters) {
    delete c.lastBin; delete c.topCoverage;
    c.hueLo = +c.hueLo.toFixed(1); c.hueHi = +c.hueHi.toFixed(1);
    c.mass = +c.mass.toFixed(6); c.alienMass = +c.alienMass.toFixed(6);
  }
  clusters.sort((a, b) => b.mass - a.mass);

  const failures = [];
  if (alienMass > lim.alienMass) {
    failures.push(
      `alien hue mass ${(alienMass * 100).toFixed(3)}% exceeds ${(lim.alienMass * 100).toFixed(3)}% — ` +
      `${alien.length} color${alien.length === 1 ? '' : 's'} that are off every role band AND not on a blend ` +
      'segment between two colors this asset uses'
    );
  }
  if (offBandMass > lim.offBandMass) {
    failures.push(
      `off-band mass ${(offBandMass * 100).toFixed(2)}% exceeds ${(lim.offBandMass * 100).toFixed(2)}% — ` +
      'the gaps between role bands are carrying too much of the image to be edge blends; ' +
      'that is a third hue, not an interpolation'
    );
  }

  return {
    ok: failures.length === 0,
    failures,
    roles: [...roleMass.entries()]
      .filter(([, mass]) => mass >= lim.roleReportMass)
      .sort((a, b) => b[1] - a[1])
      .map(([id, mass]) => ({ id, coverage: +mass.toFixed(4) })),
    allRoles: [...roleMass.entries()].sort((a, b) => b[1] - a[1]).map(([id, mass]) => ({ id, coverage: +mass.toFixed(6) })),
    inBandMass: +inBandMass.toFixed(6),
    offBandMass: +offBandMass.toFixed(6),
    blendMass: +blendMass.toFixed(6),
    alienMass: +alienMass.toFixed(6),
    alien: alien
      .sort((a, b) => b.coverage - a.coverage)
      .slice(0, 8)
      .map((a) => ({ hex: a.hex, hue: a.lch.h, chroma: a.lch.C, coverage: +a.coverage.toFixed(6) })),
    alienColors: alien.length,
    clusters: clusters.slice(0, 6),
    anchors: anchors.length,
    unique,
    limits: lim,
  };
}
