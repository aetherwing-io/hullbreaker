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
