// color.mjs — sRGB parsing and CIELAB/LCh conversion, zero dependencies.
//
// Why perceptual space at all: the palette rule this pipeline enforces is
// "shades and tints of a role are fine, a new hue is not" (DESIGN's <=8 color
// roles). That rule is a statement about *hue*, and hue is only separable from
// lightness/chroma in a perceptual space — in raw RGB, #ff4fd8 and #7a2668 look
// like completely different numbers even though one is just the other in
// shadow. Lab -> LCh gives an explicit hue angle to compare, so the checker can
// say "same role, darker" instead of "unknown color."
//
// D65 white point, sRGB primaries, the standard companding curve. No gamut
// cleverness: assets here are flat-shaded, fully-saturated screen colors.

const D65 = { x: 95.047, y: 100.0, z: 108.883 };

/**
 * '#rgb' | '#rrggbb' | '#rrggbbaa' | 'rgb()' | 'rgba()' | 0xRRGGBB | {r,g,b[,a]}
 * -> {r,g,b,a} with channels 0-255 and alpha 0-1.
 * The object form is what a decoded PNG histogram hands over, so it is accepted
 * directly rather than being stringified into hex and re-parsed on the way in.
 */
export function parseColor(input) {
  if (input && typeof input === 'object') {
    const { r, g, b, a } = input;
    if ([r, g, b].every((v) => typeof v === 'number' && Number.isFinite(v))) {
      return { r: clamp255(r), g: clamp255(g), b: clamp255(b), a: typeof a === 'number' ? a : 1 };
    }
    return null;
  }
  if (typeof input === 'number') {
    return { r: (input >> 16) & 255, g: (input >> 8) & 255, b: input & 255, a: 1 };
  }
  const s = String(input).trim().toLowerCase();

  const hex = /^#([0-9a-f]{3,8})$/.exec(s);
  if (hex) {
    const h = hex[1];
    if (h.length === 3 || h.length === 4) {
      const [r, g, b, a] = [...h].map((c) => parseInt(c + c, 16));
      return { r, g, b, a: h.length === 4 ? a / 255 : 1 };
    }
    if (h.length === 6 || h.length === 8) {
      const n = (i) => parseInt(h.slice(i, i + 2), 16);
      return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
    }
    return null;
  }

  const fn = /^(rgba?)\(([^)]+)\)$/.exec(s);
  if (fn) {
    const parts = fn[2].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const chan = (p) => (p.endsWith('%') ? Math.round(parseFloat(p) * 2.55) : Math.round(parseFloat(p)));
    const [r, g, b] = parts.slice(0, 3).map(chan);
    let a = 1;
    if (parts[3] !== undefined) a = parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
    if ([r, g, b, a].some((v) => Number.isNaN(v))) return null;
    return { r: clamp255(r), g: clamp255(g), b: clamp255(b), a: Math.max(0, Math.min(1, a)) };
  }

  return null;
}

const clamp255 = (v) => Math.max(0, Math.min(255, v));

export function toHex({ r, g, b }) {
  const h = (v) => clamp255(Math.round(v)).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function rgbToLab({ r, g, b }) {
  const [lr, lg, lb] = [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
  const x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) * 100;
  const y = (lr * 0.2126729 + lg * 0.7151522 + lb * 0.0721750) * 100;
  const z = (lr * 0.0193339 + lg * 0.1191920 + lb * 0.9503041) * 100;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const [fx, fy, fz] = [f(x / D65.x), f(y / D65.y), f(z / D65.z)];
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** LCh(ab): L 0-100, C 0-~130, h degrees 0-360. */
export function rgbToLch(rgb) {
  const { L, a, b } = rgbToLab(rgb);
  const C = Math.hypot(a, b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L, C, h };
}

/** Shortest angular distance between two hue angles, in degrees (0-180). */
export function hueDistance(h1, h2) {
  const d = Math.abs(((h1 - h2) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

/** CIE76 deltaE. Coarse, but only ever used here for "which anchor is nearest". */
export function deltaE76(rgb1, rgb2) {
  const a = rgbToLab(rgb1), b = rgbToLab(rgb2);
  return Math.hypot(a.L - b.L, a.a - b.a, a.b - b.b);
}
