/* ============================= TONEMAP ============================ */
/* three.js's ACESFilmicToneMapping, and its inverse.

   WHY THIS IS IN THE PURE LAYER. It is arithmetic with no renderer in it, and
   the render side needs the INVERSE for a reason that has to be gateable
   without a browser: the screen pass (src/render/post.js, decisions.md entry
   18) draws the scene into a render target, and three hands the background and
   fog colors to a render target in linear light while it hands them to the
   canvas in display space — so the composed frame's sky and haze come out
   several stops darker than the shipped frame's unless they are pre-corrected
   by exactly this inverse. Measured before the correction existed: the
   traversal fixture's sky fell from luminance 42.9 to 25.24.

   That correction is only trustworthy if the round trip is exact, and "exact"
   is a property tools/pathcheck.mjs can assert on every palette token — which
   is the whole reason the math lives here instead of inside the render file.

   Transcribed from ShaderChunk.tonemapping_pars_fragment (three 0.170.0),
   matrices written row-major (GLSL's mat3 literal is column-major, so the
   columns there are these rows).                                          */

const ACES_IN = [
  [0.59719, 0.35458, 0.04823],
  [0.07600, 0.90834, 0.01566],
  [0.02840, 0.13383, 0.83777],
];
const ACES_OUT = [
  [1.60475, -0.53108, -0.07367],
  [-0.10208, 1.10813, -0.00605],
  [-0.00327, -0.07276, 1.07602],
];

function mul3(m, v, out) {
  const x = v[0], y = v[1], z = v[2];
  out[0] = m[0][0] * x + m[0][1] * y + m[0][2] * z;
  out[1] = m[1][0] * x + m[1][1] * y + m[1][2] * z;
  out[2] = m[2][0] * x + m[2][1] * y + m[2][2] * z;
  return out;
}

function rrtAndOdtFit(v) {
  const a = v * (v + 0.0245786) - 0.000090537;
  const b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}

const _s1 = [0, 0, 0], _s2 = [0, 0, 0];

/* Linear light in, display-referred (still linear-encoded) out. `out` is
   written and returned; nothing here allocates, because the render side calls
   it hundreds of times inside one solve. */
export function acesFilmic(rgb, exposure, out) {
  for (let i = 0; i < 3; i++) _s1[i] = rgb[i] * exposure / 0.6;
  mul3(ACES_IN, _s1, _s2);
  for (let i = 0; i < 3; i++) _s2[i] = rrtAndOdtFit(_s2[i]);
  mul3(ACES_OUT, _s2, out);
  for (let i = 0; i < 3; i++) out[i] = Math.min(1, Math.max(0, out[i]));
  return out;
}

/* The value whose tone-mapped result IS `target`.

   Per-channel bisection, swept a few times. ACES is NOT separable — its two
   matrices mix the channels, so a dark saturated teal's red output has a floor
   set by its own green and blue — and the obvious fixed-point iteration
   (scale each channel by how far it fell short) does not converge on the
   colors this palette is made of: tried first, it overshot the shipped sky's
   red from 20 to 70. What is true is that each channel's output rises
   monotonically with that channel's input while the others are held, so
   bisection always lands on the best reachable value and the sweep resolves
   the coupling. Where a target is unreachable (the curve saturates), it
   returns the closest value rather than diverging.

   `pathcheck` asserts the round trip lands within one 8-bit step on every
   background token both palettes carry. */
const _f = [0, 0, 0];

export function inverseAcesFilmic(target, exposure, out) {
  for (let i = 0; i < 3; i++) out[i] = target[i];
  for (let round = 0; round < 6; round++) {
    for (let i = 0; i < 3; i++) {
      let lo = 0, hi = 8;                  // far past anything a token needs
      for (let step = 0; step < 30; step++) {
        const mid = (lo + hi) / 2;
        out[i] = mid;
        acesFilmic(out, exposure, _f);
        if (_f[i] < target[i]) lo = mid; else hi = mid;
      }
      out[i] = (lo + hi) / 2;
    }
  }
  return out;
}

// the sRGB transfer function, both directions — the gate needs them to state
// the round trip in the 8-bit units a screenshot is measured in
export function srgbToLinear(s) {
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(l) {
  return l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
}
