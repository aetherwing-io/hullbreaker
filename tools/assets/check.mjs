#!/usr/bin/env node
// check.mjs — the asset gate. Zero dependencies, no browser, no network.
//
//   node tools/assets/check.mjs            validate everything, exit non-zero on failure
//   node tools/assets/check.mjs --write    recompute the manifest's derived fields in place
//   node tools/assets/check.mjs --json     machine-readable report on stdout
//   node tools/assets/check.mjs --selftest only prove the palette rule can fail, then exit
//
// What it enforces, in order:
//   0. the palette rule is coherent and can actually reject a color, and the
//      static-import scan still catches every import shape and still leaves
//      runtime references alone (--selftest, which also runs as part of a
//      normal check — a gate nobody has proven can fail is not a gate)
//   1. the role budget: <= 8 roles, per DESIGN's Concept section
//   2. manifest schema: required fields, known fields, kebab ids, unique
//      ids/paths, paths inside their declared category
//   3. file truth: every declared asset exists, and its recorded size is the
//      size actually in the file's own header — not a number someone typed
//   4. power-of-two dimensions for anything marked as a GPU texture
//   5. palette compliance, recomputed from pixels/literals, compared against
//      what the manifest claims
//   6. the game's independence from all of it: no static ES import of an
//      assets/ path anywhere in src/, so the game still boots with every asset
//      file deleted

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { alphaCensus, histogram, readPngSize } from './lib/png.mjs';
import { extractSvgColors, readSvgSize } from './lib/svg.mjs';
import { assetImports, maskSource } from './lib/imports.mjs';
import { ROLES, NEUTRAL_MAX_CHROMA, checkColors, checkRasterColors, classify, RASTER_LIMITS, ALPHA_HUE_FLOOR } from './lib/palette.mjs';
import { scanRecipe } from './lib/recipe.mjs';
import {
  loadManifest, saveManifest, validateEntryShape, isPowerOfTwo, MANIFEST_PATH,
  checkAlphaKind, ALPHA_RULES,
} from './lib/manifest.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ROLE_BUDGET = 8;                              // DESIGN: "Palette (<=8 colors)"
const DEFAULT_MIN_COVERAGE = 0.005;                 // 0.5% of non-transparent pixels

/* --------------------------------------------------------------------- *
 * 0. Self-test: colors whose verdict is known, both ways.
 *
 * Every "must pass" here is a color measured off an endorsed concept board or
 * already shipping in src/config.js; every "must fail" is a hue the art
 * direction has never used. If this block ever goes green-by-vacuity (a band so
 * wide nothing fails), the check below stops meaning anything — so it runs on
 * every invocation, not just under --selftest.
 * --------------------------------------------------------------------- */
const SELFTEST = {
  pass: [
    ['#0e5f6c', 'deep-teal', 'board 13 teal mass'],
    ['#024653', 'deep-teal', 'board 10 teal mass'],
    ['#9b5c31', 'rust-orange', 'board 06 rust'],
    ['#ff8a4a', 'rust-orange', 'shipped shots.F'],
    ['#ffe79b', 'warm-white', 'board 13 warm highlight'],
    ['#fff0c2', 'warm-white', 'shipped shots.R muzzle'],
    ['#e8f92b', 'acid-green', 'board 01 acid'],
    ['#5f8f3c', 'acid-green', 'shipped hound'],
    ['#ff4fd8', 'hot-magenta', 'shipped capsule pickup'],
    ['#7a1a61', 'hot-magenta', 'board 13 magenta accent'],
    ['#14181e', 'ink', 'shipped capsule letter ink'],
    ['#767c85', 'hull', 'shipped ground'],
    ['#46525f', 'haze', 'shipped limb fog'],
    ['#7a1a6188', 'hot-magenta', 'alpha is ignored, hue still decides'],
  ],
  fail: [
    ['#ff0000', 'pure red is not rust-orange'],
    ['#ff4500', 'orange-red sits below the rust band'],
    ['#0000ff', 'pure blue'],
    ['#2b4cff', 'royal blue'],
    ['#8a2be2', 'violet'],
    ['#3399ff', 'sky blue'],
    ['#00ffff', 'pure cyan sits below the teal band'],
    ['#00a86b', 'jade green sits between teal and acid'],
    ['not-a-color', 'unparseable input must fail, not pass silently'],
  ],
};

function runSelftest() {
  const failures = [];
  for (const [hex, roleId, why] of SELFTEST.pass) {
    const res = classify(hex);
    if (!res.ok || res.roleId !== roleId) {
      failures.push(`selftest: ${hex} (${why}) should classify as ${roleId}, got ${res.ok ? res.roleId : 'OFF-PALETTE'} — ${res.reason}`);
    }
  }
  for (const [hex, why] of SELFTEST.fail) {
    const res = classify(hex);
    if (res.ok) failures.push(`selftest: ${hex} (${why}) should be rejected, got role ${res.roleId}`);
  }
  return failures;
}

/* --------------------------------------------------------------------- *
 * 0b. Self-test: the import scan, both ways.
 *
 * Section 6 below is the gate behind "the game boots with every asset file
 * missing". Until I-014 it was one line-anchored regex, so a specifier pushed
 * onto the next line evaded it completely and the check exited 0 while the
 * invariant was violated. Widening the regex across newlines is the other
 * failure — it swallows the file between an `import` and the next unrelated
 * 'assets/…' literal and fails legal runtime code, which is why the README has
 * carried that counter-example since T-017.
 *
 * So both directions are pinned here, and (like the palette cases above) this
 * runs on EVERY invocation: the next editor of lib/imports.mjs cannot quietly
 * un-bind either half. `detect` cases must be rejected as hard dependencies;
 * `ignore` cases must stay legal. The end-to-end proof that a real tree exits
 * non-zero lives in tools/gatecheck.mjs, over the committed fixtures.
 * --------------------------------------------------------------------- */
const IMPORT_SELFTEST = {
  detect: [
    ["import glyph from '../assets/generated/glyphs/x.png';",
      'the single-line shape every file in src/ writes'],
    ["import {\n  glyph,\n} from '../assets/generated/glyphs/x.png';",
      'I-014: the specifier one line below the keyword'],
    ["import\n  glyph\n  from\n  \"../assets/generated/glyphs/x.png\";",
      'keyword, clause and specifier on four separate lines'],
    ["import * as art from '../../assets/manifest.json';",
      'namespace import'],
    ["import '../assets/generated/boot.js';",
      'side-effect import — no clause at all'],
    ["export { tex } from '../assets/generated/textures/t.png';",
      're-export binds the module exactly as hard as an import'],
    ["export *\n  from '../assets/generated/textures/t.png';",
      'multi-line star re-export'],
    ["import /* which */ tex /* from where? */ from '../assets/generated/textures/t.png';",
      'comments inside the clause do not hide the specifier'],
    ["const quoteRe = /['\"]/;\nimport {\n  tex,\n} from '../assets/generated/textures/t.png';",
      'a regex literal holding a quote must not blind the scan that follows it'],
    ["const help = `\n  import x from \"../assets/nope.png\"\n`;\nimport {\n  tex,\n} from '../assets/generated/textures/t.png';",
      'a template literal quoting an import must not blind the scan that follows it'],
    ["#!/usr/bin/env node\nimport tex from '../assets/generated/textures/t.png';",
      "a shebang is a comment, not code — lexing /usr/ as a regex hid the file's first import"],
    ["const n = 6;\nconst half = n / 2; import tex from '../assets/generated/textures/t.png';",
      'a division on the line above must not swallow the statement below it'],
  ],
  ignore: [
    ["import { CONFIG } from '../config.js';\nconst url = 'assets/generated/glyphs/x.png';",
      "the README's counter-example: a runtime string one line under a legal import"],
    ["import {\n  CONFIG,\n} from '../config.js';\nconst url = 'assets/generated/glyphs/x.png';",
      'the same counter-example with the legal import itself multi-line'],
    ["const mod = await import('../assets/generated/glyphs/x.png');",
      'a dynamic import is a runtime load, which is the sanctioned path'],
    ["export const ASSET_URL = 'assets/generated/glyphs/x.png';",
      'a runtime URL constant'],
    ["export default 'assets/generated/glyphs/x.png';",
      'export default of a string is not a re-export'],
    ["export { ASSET_URL };\nconst u = 'assets/generated/glyphs/x.png';",
      'an export clause with no "from" binds no module'],
    ["// import glyph from '../assets/generated/glyphs/x.png';",
      'a commented-out import is not a dependency'],
    ["/*\nimport {\n  glyph,\n} from '../assets/generated/glyphs/x.png';\n*/",
      'a block-commented import is not a dependency'],
    ["const doc = `\nimport glyph from \"../assets/generated/glyphs/x.png\";\n`;",
      'an import quoted inside a template literal is text, not a dependency'],
    ["loader.load('assets/generated/glyphs/x.png');",
      'a TextureLoader URL is the sanctioned runtime path'],
    ["const table = { import: 'assets/generated/glyphs/x.png' };",
      '"import" as a property name'],
    ["registry.import = 'assets/generated/glyphs/x.png';",
      '"import" as a member assignment'],
    ["import { CONFIG } from '../config.js';",
      'an ordinary non-asset import stays silent'],
  ],
};

function runImportSelftest() {
  const failures = [];
  const oneLine = (s) => JSON.stringify(s.length > 72 ? `${s.slice(0, 69)}...` : s);
  for (const [src, why] of IMPORT_SELFTEST.detect) {
    const hits = assetImports(src);
    if (hits.length !== 1) {
      failures.push(`import selftest: ${oneLine(src)} (${why}) must be rejected as a static asset import, got ${hits.length} hit(s)`);
    }
  }
  for (const [src, why] of IMPORT_SELFTEST.ignore) {
    const hits = assetImports(src);
    if (hits.length !== 0) {
      failures.push(`import selftest: ${oneLine(src)} (${why}) must stay legal, got flagged as "${hits[0].specifier}"`);
    }
  }
  return failures;
}

/* --------------------------------------------------------------------- *
 * 0c. Self-test: the RASTER rule, both ways.
 *
 * The raster rule replaced a per-color coverage gate that went vacuous on
 * painted output — it passed by judging nothing. A replacement that cannot be
 * observed failing would be the same defect wearing a longer function, so every
 * case below is a synthetic histogram with a known verdict, and (like the
 * palette and import cases above) it runs on EVERY invocation.
 *
 * Each case is a list of [hex, mass] over non-transparent pixels.
 * --------------------------------------------------------------------- */
const RASTER_SELFTEST = {
  pass: [
    {
      why: 'a flat two-role asset: no off-band pixel at all',
      pixels: [['#9b5c31', 0.7], ['#14181e', 0.3]],
    },
    {
      why: 'two roles meeting along a soft 32-step edge: every intermediate hue is off-band, and every one of them is on the line between two colors the image uses',
      pixels: [['#0e5f6c', 0.49], ['#ff4fd8', 0.49], ...gradientPixels('#0e5f6c', '#ff4fd8', 32, 0.02)],
    },
    {
      why: 'a painted rust surface: 4000 shades of one role from noise, none of which reaches any per-color threshold',
      pixels: noisePixels('#9b5c31', '#14181e', 4000),
    },
  ],
  fail: [
    {
      why: 'a violet accent that is NOT on the teal-magenta line — a third hue, at 1% of the image',
      pixels: [['#0e5f6c', 0.6], ['#ff4fd8', 0.39], ['#4b2bd0', 0.01]],
      expect: /alien hue mass/,
    },
    {
      why: 'the same violet at a twentieth of that mass: an alien hue does not arrive in small quantities by accident',
      pixels: [['#0e5f6c', 0.6], ['#ff4fd8', 0.3985], ['#4b2bd0', 0.0015]],
      expect: /alien hue mass/,
    },
    {
      why: 'legal blends, illegal composition: half the image parked in the gap between two bands is a third hue however it got there',
      pixels: [['#0e5f6c', 0.25], ['#ff4fd8', 0.25], ...gradientPixels('#0e5f6c', '#ff4fd8', 60, 0.5)],
      expect: /off-band mass/,
    },
    {
      why: 'jade green between the teal and acid bands, with neither neighbour used in quantity',
      pixels: [['#767c85', 0.8], ['#14181e', 0.19], ['#00a86b', 0.01]],
      expect: /alien hue mass/,
    },
  ],
};

/** N evenly spaced sRGB steps from a to b, sharing `mass` (default: all of it). */
function gradientPixels(a, b, steps, mass = 1) {
  const pa = parseHexTriplet(a), pb = parseHexTriplet(b);
  const out = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const hex = '#' + [0, 1, 2].map((c) => Math.round(pa[c] + (pb[c] - pa[c]) * t).toString(16).padStart(2, '0')).join('');
    out.push([hex, mass / steps]);
  }
  return out;
}

/** `n` shades between two colors of the SAME role, each a vanishing fraction. */
function noisePixels(lit, dark, n) {
  return gradientPixels(lit, dark, n);
}

function parseHexTriplet(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function toEntries(pixels) {
  return pixels.map(([hex, mass]) => {
    const [r, g, b] = parseHexTriplet(hex);
    return { color: { r, g, b }, coverage: mass, count: Math.round(mass * 1e6) };
  });
}

function runRasterSelftest() {
  const failures = [];
  for (const c of RASTER_SELFTEST.pass) {
    const res = checkRasterColors(toEntries(c.pixels));
    if (!res.ok) {
      failures.push(`raster selftest: "${c.why}" should PASS — ${res.failures.join('; ')}`);
    }
  }
  for (const c of RASTER_SELFTEST.fail) {
    const res = checkRasterColors(toEntries(c.pixels));
    if (res.ok) {
      failures.push(
        `raster selftest: "${c.why}" should FAIL, passed with off-band ${(res.offBandMass * 100).toFixed(3)}%, ` +
        `alien ${(res.alienMass * 100).toFixed(4)}% against caps ${(RASTER_LIMITS.offBandMass * 100)}% / ${(RASTER_LIMITS.alienMass * 100)}%`
      );
    } else if (c.expect && !res.failures.some((f) => c.expect.test(f))) {
      failures.push(`raster selftest: "${c.why}" failed for the wrong reason — ${res.failures.join('; ')}`);
    }
  }
  return failures;
}

/* --------------------------------------------------------------------- *
 * 0c-bis. Self-test: the alpha contract, both ways.
 *
 * The case that produced this rule: five backdrop plates regenerated from
 * ~50%-transparent cutouts into 100% opaque rectangles, with the palette, size,
 * path and id gates all green, because nothing had ever stated what the alpha
 * channel was for. The censuses below are the real measurements from before and
 * after that regression, plus the boundaries of each rule.
 * --------------------------------------------------------------------- */
const ALPHA_SELFTEST = {
  pass: [
    ['cutout', { transparent: 50.2, partial: 6.0, opaque: 43.8 }, 'a feathered cutout plate'],
    ['opaque', { transparent: 0, partial: 0, opaque: 100 }, 'a tiling surface texture'],
    ['overlay', { transparent: 71.3, partial: 28.66, opaque: 0 }, 'the wear overlay as shipped'],
  ],
  fail: [
    ['cutout', { transparent: 0, partial: 0, opaque: 100 }, 'THE REGRESSION: a cutout plate that came back fully opaque', /only 0.00% of it is transparent/],
    ['cutout', { transparent: 50.2, partial: 0.48, opaque: 49.32 }, 'the pre-T-053 plate: a cutout with a one-pixel hard cut', /partially transparent/],
    ['opaque', { transparent: 40, partial: 1, opaque: 59 }, 'a "surface texture" full of holes', /declares alpha "opaque"/],
    ['overlay', { transparent: 60, partial: 10, opaque: 30 }, 'an "overlay" a third of which paints over what it modulates', /fully opaque/],
    ['sponge', { transparent: 10, partial: 10, opaque: 80 }, 'an alpha kind nobody defined', /unknown alpha kind/],
  ],
};

function runAlphaSelftest() {
  const failures = [];
  for (const [kind, census, why] of ALPHA_SELFTEST.pass) {
    const errs = checkAlphaKind(kind, census);
    if (errs.length) failures.push(`alpha selftest: "${why}" should PASS as ${kind} — ${errs.join('; ')}`);
  }
  for (const [kind, census, why, expect] of ALPHA_SELFTEST.fail) {
    const errs = checkAlphaKind(kind, census);
    if (!errs.length) {
      failures.push(`alpha selftest: "${why}" should FAIL as ${kind}, passed`);
    } else if (expect && !errs.some((e) => expect.test(e))) {
      failures.push(`alpha selftest: "${why}" failed for the wrong reason — ${errs.join('; ')}`);
    }
  }
  return failures;
}

/* --------------------------------------------------------------------- *
 * 0d. Self-test: the recipe contract, both ways.
 *
 * A recipe is generated code that this repo commits and re-runs. The two
 * properties that make that worth doing — reproducible, self-contained — are
 * enforced by a lexer in lib/recipe.mjs, so the lexer gets the same treatment as
 * the import scan: known-bad shapes that must be rejected, known-good ones that
 * must stay legal.
 * --------------------------------------------------------------------- */
const OK_RECIPE = `export const meta = { id: 'x', size: { w: 64, h: 64 }, seed: 7, roles: ['ink'] };
export function render(ctx, env) { env.field(() => [20, 24, 30, 255]); }`;

const RECIPE_SELFTEST = {
  reject: [
    [`${OK_RECIPE}\nconst r = Math.random();`, 'Math.random makes the PNG unreproducible'],
    [`${OK_RECIPE}\nconst t = Date.now();`, 'a clock makes the PNG unreproducible'],
    [`import { fbm } from '../../tools/assets/lib/procgen.mjs';\n${OK_RECIPE}`, 'a recipe must be self-contained'],
    [`${OK_RECIPE}\nconst img = new Image();`, 'no external images'],
    [`${OK_RECIPE}\nawait fetch('http://example.com/x.png');`, 'no network'],
    [`${OK_RECIPE}\nconst c = document.createElement('canvas');`, 'the only DOM a recipe gets is its ctx'],
    ["export const meta = { id: 'x', size: { w: 64, h: 64 }, seed: 7 };", 'no render() at all'],
    ['export function render(ctx, env) {}', 'no meta at all'],
    ["export const meta = { id: 'x', size: { w: 4, h: 4 }, seed: someExpr };\nexport function render() {}",
      'a computed seed is not auditable'],
    [`${OK_RECIPE}\nconst violet = '#4b2bd0';`, 'an off-palette color literal, named at its line'],
    [`${OK_RECIPE}\nctx.fillStyle = '#8b462e';`, 'a rust-brown one degree below the rust band is still off it'],
  ],
  allow: [
    [OK_RECIPE, 'the minimal legal recipe'],
    [`// Math.random() would be wrong here, which is why this uses env.rng()\n${OK_RECIPE}`,
      'a comment naming a banned call is prose, not code'],
    [`${OK_RECIPE}\nconst note = 'do not use Math.random in a recipe';`,
      'a string naming a banned call is text, not code'],
    [`export const meta = { id: 'x', size: { w: 64, h: 64 }, seed: 7, roles: ['ink'] };\nexport const render = (ctx, env) => { env.rng(); };`,
      'an arrow-function render is still a render'],
    [`${OK_RECIPE}\nconst rust = '#9b5c31', fog = '#46525f', white = '#ffffff';`,
      'in-band literals, including a pure neutral, stay legal'],
  ],
};

function runRecipeSelftest() {
  const failures = [];
  const short = (s) => JSON.stringify(s.length > 64 ? `${s.slice(0, 61)}...` : s);
  for (const [src, why] of RECIPE_SELFTEST.reject) {
    const res = scanRecipe(src);
    if (res.errors.length === 0) failures.push(`recipe selftest: ${short(why)} must be rejected, scan found nothing`);
  }
  for (const [src, why] of RECIPE_SELFTEST.allow) {
    const res = scanRecipe(src);
    if (res.errors.length) failures.push(`recipe selftest: ${short(why)} must stay legal, got: ${res.errors.join('; ')}`);
  }
  return failures;
}

/* --------------------------------------------------------------------- *
 * 1. Role budget + band coherence.
 * --------------------------------------------------------------------- */
function checkRoleTable() {
  const errs = [];
  if (ROLES.length > ROLE_BUDGET) {
    errs.push(`palette declares ${ROLES.length} roles, DESIGN's budget is ${ROLE_BUDGET}`);
  }
  const ids = ROLES.map((r) => r.id);
  if (new Set(ids).size !== ids.length) errs.push('duplicate role ids in the palette table');

  const chromatic = ROLES.filter((r) => r.kind === 'chromatic');
  for (let i = 0; i < chromatic.length; i++) {
    for (let j = i + 1; j < chromatic.length; j++) {
      const [a, b] = [chromatic[i], chromatic[j]];
      const overlap = bandsOverlap(a.hue, b.hue);
      if (overlap) errs.push(`role bands overlap: ${a.id} [${a.hue}] and ${b.id} [${b.hue}] — a hue would have two owners`);
    }
  }
  return errs;
}

function bandsOverlap(a, b) {
  const spans = (band) => (band[0] <= band[1] ? [[band[0], band[1]]] : [[band[0], 360], [0, band[1]]]);
  for (const [a0, a1] of spans(a)) {
    for (const [b0, b1] of spans(b)) {
      if (a0 < b1 && b0 < a1) return true;
    }
  }
  return false;
}

/* --------------------------------------------------------------------- *
 * 5. Palette compliance for one file.
 *
 * Two rules, because the two kinds of asset fail differently:
 *
 *   VECTOR — every color literal was typed by someone, so every literal is
 *     judged, at threshold zero. Unchanged since T-015.
 *   RASTER — judged by MASS (lib/palette.mjs `checkRasterColors`), not per
 *     color. The old per-color coverage gate was written for a flat vector fill
 *     rasterized with antialiased edges, where a handful of authored colors each
 *     cover a big fraction of the image. A PAINTED asset — noise, gradients,
 *     dither — has tens of thousands of unique colors, none of them anywhere
 *     near the 0.5% threshold, so the gate would exempt every pixel and pass
 *     while judging nothing. Measured numbers and the calibration table are in
 *     tools/assets/README.md § "Palette compliance (raster)". `--min-coverage`
 *     now sets the mass a role needs to be RECORDED in the manifest; it no
 *     longer decides what is judged, because everything is.
 * --------------------------------------------------------------------- */
function paletteOfFile(absPath, { minCoverage }) {
  const ext = extname(absPath).toLowerCase();
  if (ext === '.png') {
    // Alpha-weighted, and only above the hue floor: a pixel counts for as much
    // color as it contributes, and a pixel too faint for its stored hue to
    // survive premultiplication does not vote. See lib/palette.mjs
    // ALPHA_HUE_FLOOR and lib/png.mjs `histogram` for both measurements.
    const hist = histogram(absPath, { alphaFloor: ALPHA_HUE_FLOOR, weight: 'alpha' });
    const entries = hist.colors.map((c) => ({ color: { r: c.r, g: c.g, b: c.b }, coverage: c.coverage, count: c.count }));
    const res = checkRasterColors(entries, { roleReportMass: minCoverage });

    // What the floor excluded, reported rather than hidden: the same rule run
    // over the faint band alone. A real off-palette accent hiding at 5% opacity
    // shows up on this line.
    const faint = histogram(absPath, { alphaFloor: 8, weight: 'alpha' });
    const faintOnly = faint.colors.filter((c) => c.count && !entries.some((e) => e.color.r === c.r && e.color.g === c.g && e.color.b === c.b));
    const faintRes = faintOnly.length
      ? checkRasterColors(faintOnly.map((c) => ({ color: { r: c.r, g: c.g, b: c.b }, coverage: c.coverage, count: c.count })))
      : null;

    return {
      kind: 'raster',
      faint: faintRes
        ? { colors: faintOnly.length, offBandMass: faintRes.offBandMass, alienMass: faintRes.alienMass }
        : null,
      ok: res.ok,
      failures: res.failures,
      roles: res.roles,
      allRoles: res.allRoles,
      inBandMass: res.inBandMass,
      offBandMass: res.offBandMass,
      blendMass: res.blendMass,
      alienMass: res.alienMass,
      alien: res.alien,
      alienColors: res.alienColors,
      clusters: res.clusters,
      anchors: res.anchors,
      limits: res.limits,
      offPalette: [],
      uniqueColors: hist.unique,
      transparentPixels: hist.transparent,
    };
  }
  if (ext === '.svg') {
    const { colors, unresolved } = extractSvgColors(absPath);
    const res = checkColors(colors.map((c) => ({ color: c.color, coverage: 1, count: c.count })), { minCoverage: 0 });
    return { kind: 'vector', ...res, unresolved, literals: colors.length };
  }
  return { kind: 'unknown', ok: false, roles: [], offPalette: [], unsupported: ext };
}

/* --------------------------------------------------------------------- *
 * 6. The game may LOAD any of this; it may not hard-DEPEND on it.
 *
 * `docs/decisions.md` entry 16 (2026-08-02) retired "the game must boot with
 * every file under assets/ missing" — it forbade the game from using the
 * pipeline built to feed it. Runtime loading is now sanctioned, with the
 * requirement that a failed load degrades visibly and safely and that gameplay
 * never branches on it. A STATIC import is still rejected, and for a narrower
 * reason than before: it binds the file into the module graph, so a missing
 * asset stops being a degraded frame and becomes a blank page.
 * --------------------------------------------------------------------- */
function walkJs(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walkJs(full));
    else if (name.endsWith('.js') || name.endsWith('.mjs')) out.push(full);
  }
  return out;
}

function checkGameIndependence(root) {
  const errs = [];
  const info = [];
  let staticImports = 0;
  const srcDir = join(root, 'src');
  if (!existsSync(srcDir)) return { errs, info, staticImports };
  for (const file of walkJs(srcDir)) {
    const text = readFileSync(file, 'utf8');
    const rel = file.slice(root.length + 1);
    const masks = maskSource(text);
    // Lines belonging to a rejected import, so the info list below can exclude
    // them: an import is already reported as an error, and listing it a second
    // time under a "runtime, not imports" header contradicted itself (I-002).
    // The whole statement span is excluded, not just the keyword's line — a
    // multi-line import carries its specifier on a later one (I-014).
    const importLines = new Set();
    for (const imp of assetImports(text, masks)) {
      for (let ln = imp.line; ln <= imp.endLine; ln++) importLines.add(ln);
      staticImports++;
      errs.push(
        `${rel}:${imp.line}: static ${imp.kind === 'export' ? 're-export' : 'import'} of ` +
        `"${imp.specifier}" makes an asset a hard dependency — a missing file would fail the ` +
        'module graph and the game would not boot at all. Runtime assets are allowed ' +
        '(docs/decisions.md entry 16); what they must do is degrade visibly and safely. ' +
        'Load through the render/ui layer at runtime with a fallback instead.'
      );
    }
    // Comments are masked out of `code`, so prose that merely mentions an
    // assets/ path is not filed as a reference. The old line filter only
    // skipped lines starting with `//` or `*`, which listed two lines of
    // src/render/legibility.js's header comment as "runtime asset references".
    const codeLines = masks.code.split('\n');
    const rawLines = text.split('\n');
    for (let i = 0; i < codeLines.length; i++) {
      if (!/assets\//.test(codeLines[i]) || importLines.has(i + 1)) continue;
      info.push(`${rel}:${i + 1}: runtime asset reference — ${rawLines[i].trim().slice(0, 90)}`);
    }
  }
  return { errs, info, staticImports };
}

/* --------------------------------------------------------------------- *
 * Main.
 * --------------------------------------------------------------------- */
function parseArgs(argv) {
  const args = { write: false, json: false, selftest: false, minCoverage: DEFAULT_MIN_COVERAGE, root: REPO_ROOT };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--write') args.write = true;
    else if (a === '--json') args.json = true;
    else if (a === '--selftest') args.selftest = true;
    else if (a === '--min-coverage') args.minCoverage = Number(argv[++i]);
    else if (a === '--root') args.root = resolve(argv[++i]);
    else if (a === '--help' || a === '-h') args.help = true;
    else { console.error(`unknown flag: ${a}`); process.exit(2); }
  }
  return args;
}

const HELP = `tools/assets/check.mjs — validate assets/manifest.json, palette compliance and texture sizes

  node tools/assets/check.mjs [--write] [--json] [--selftest] [--min-coverage F] [--root DIR]

  --write          rewrite the manifest's derived fields (size, palette) from the files themselves
  --json           emit the full report as JSON instead of text
  --selftest       run only the palette rule's own known-good/known-bad cases
  --min-coverage   raster gate threshold, fraction of non-transparent pixels (default ${DEFAULT_MIN_COVERAGE})
  --root           repo root to validate (default: this checkout)`;

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(HELP); process.exit(0); }

  const report = {
    ok: true,
    root: args.root,
    minCoverage: args.minCoverage,
    roleBudget: { declared: ROLES.length, budget: ROLE_BUDGET, neutralMaxChroma: NEUTRAL_MAX_CHROMA },
    selftest: {
      cases: SELFTEST.pass.length + SELFTEST.fail.length,
      importCases: IMPORT_SELFTEST.detect.length + IMPORT_SELFTEST.ignore.length,
      rasterCases: RASTER_SELFTEST.pass.length + RASTER_SELFTEST.fail.length,
      alphaCases: ALPHA_SELFTEST.pass.length + ALPHA_SELFTEST.fail.length,
      recipeCases: RECIPE_SELFTEST.reject.length + RECIPE_SELFTEST.allow.length,
      failures: [],
    },
    errors: [],
    warnings: [],
    assets: [],
    gameIndependence: { errors: [], references: [], staticImports: 0 },
  };

  report.selftest.failures = [
    ...runSelftest(), ...runImportSelftest(), ...runRasterSelftest(),
    ...runAlphaSelftest(), ...runRecipeSelftest(),
  ];
  report.errors.push(...report.selftest.failures);

  if (args.selftest) {
    const ok = report.selftest.failures.length === 0;
    console.log(ok
      ? `selftest PASS — ${report.selftest.cases} palette cases (${SELFTEST.pass.length} must-pass, ` +
        `${SELFTEST.fail.length} must-fail) + ${report.selftest.importCases} import-scan cases ` +
        `(${IMPORT_SELFTEST.detect.length} must-reject, ${IMPORT_SELFTEST.ignore.length} must-allow) + ` +
        `${report.selftest.rasterCases} raster-mass cases (${RASTER_SELFTEST.pass.length} must-pass, ` +
        `${RASTER_SELFTEST.fail.length} must-fail) + ${report.selftest.alphaCases} alpha-contract cases ` +
        `(${ALPHA_SELFTEST.pass.length} must-pass, ${ALPHA_SELFTEST.fail.length} must-fail) + ` +
        `${report.selftest.recipeCases} recipe-contract cases ` +
        `(${RECIPE_SELFTEST.reject.length} must-reject, ${RECIPE_SELFTEST.allow.length} must-allow)`
      : report.selftest.failures.join('\n'));
    process.exit(ok ? 0 : 1);
  }

  report.errors.push(...checkRoleTable());

  let manifest;
  try {
    manifest = loadManifest(args.root);
  } catch (err) {
    report.errors.push(err.message);
    return finish(report, args);
  }

  const seenIds = new Set(), seenPaths = new Set();
  manifest.assets.forEach((entry, i) => {
    const errs = validateEntryShape(entry, i);
    const result = { id: entry?.id ?? `assets[${i}]`, path: entry?.path, errors: errs, warnings: [] };

    if (entry?.id) {
      if (seenIds.has(entry.id)) errs.push(`duplicate id "${entry.id}"`);
      seenIds.add(entry.id);
    }
    if (entry?.path) {
      if (seenPaths.has(entry.path)) errs.push(`duplicate path "${entry.path}"`);
      seenPaths.add(entry.path);
    }

    if (entry?.path && errs.length === 0) {
      const abs = join(args.root, entry.path);
      if (!existsSync(abs)) {
        errs.push(`${entry.id}: file not found: ${entry.path}`);
      } else {
        const ext = extname(abs).toLowerCase();

        // --- size truth, read from the file's own header ---
        let actual = null;
        try {
          actual = ext === '.png' ? readPngSize(abs) : ext === '.svg' ? readSvgSize(abs) : null;
        } catch (err) {
          errs.push(`${entry.id}: cannot read image header — ${err.message}`);
        }
        if (actual && Number.isFinite(actual.width) && Number.isFinite(actual.height)) {
          result.actualSize = { w: actual.width, h: actual.height };
          if (args.write) {
            entry.size = { w: actual.width, h: actual.height };
          } else if (entry.size.w !== actual.width || entry.size.h !== actual.height) {
            errs.push(`${entry.id}: manifest size ${entry.size.w}x${entry.size.h} != actual ${actual.width}x${actual.height} (run --write)`);
          }
          const gpu = entry.gpu !== false;
          if (gpu && !(isPowerOfTwo(actual.width) && isPowerOfTwo(actual.height))) {
            errs.push(
              `${entry.id}: ${actual.width}x${actual.height} is not power-of-two. GPU textures must be ` +
              '(asset-artist standing orders); set "gpu": false with a "notes" reason for a CSS/UI-only asset.'
            );
          }
          if (ext === '.png' && actual.bytes) result.bytes = actual.bytes;
        }

        // --- the alpha contract, recomputed from the alpha channel ---
        // Deliberately NOT written by --write: a declaration derived from the
        // file it is meant to constrain would agree with anything, which is how
        // five cutout plates became opaque rectangles with every gate green.
        if (ext === '.png') {
          try {
            const census = alphaCensus(abs);
            result.alpha = {
              declared: entry.alpha ?? null,
              transparent: +census.transparent.toFixed(2),
              partial: +census.partial.toFixed(2),
              opaque: +census.opaque.toFixed(2),
            };
            if (entry.alpha) {
              errs.push(...checkAlphaKind(entry.alpha, census).map((e) => `${entry.id}: ${e}`));
            }
          } catch (err) {
            errs.push(`${entry.id}: cannot read the alpha channel — ${err.message}`);
          }
        }

        // --- palette, recomputed ---
        let pal = null;
        try {
          pal = paletteOfFile(abs, { minCoverage: args.minCoverage });
        } catch (err) {
          errs.push(`${entry.id}: palette check failed to read the file — ${err.message}`);
        }
        if (pal) {
          result.palette = pal;
          if (pal.unsupported) errs.push(`${entry.id}: no palette checker for "${pal.unsupported}" files`);
          for (const u of pal.unresolved || []) {
            errs.push(`${entry.id}: unreadable color "${u.raw}" in ${u.prop} — ${u.why}`);
          }
          for (const off of pal.offPalette) {
            errs.push(
              `${entry.id}: off-palette ${off.hex} (${(off.coverage * 100).toFixed(2)}% coverage) — ${off.reason}`
            );
          }
          for (const f of pal.failures || []) {
            const worst = (pal.alien || []).slice(0, 3)
              .map((a) => `${a.hex} (hue ${a.hue}) at ${(a.coverage * 100).toFixed(4)}%`).join(', ');
            errs.push(`${entry.id}: ${f}${worst ? ` — worst: ${worst}` : ''}`);
          }
          const computed = { status: pal.ok && !(pal.unresolved || []).length ? 'pass' : 'fail', roles: pal.roles.map((r) => r.id).sort() };
          if (args.write) {
            entry.palette = { ...computed, checkedBy: 'tools/assets/check.mjs' };
          } else {
            const rec = entry.palette;
            if (!rec) {
              errs.push(`${entry.id}: no recorded "palette" block (run --write)`);
            } else if (rec.status !== computed.status) {
              errs.push(`${entry.id}: manifest records palette.status "${rec.status}", recomputed "${computed.status}"`);
            } else if (JSON.stringify([...(rec.roles || [])].sort()) !== JSON.stringify(computed.roles)) {
              errs.push(`${entry.id}: manifest records roles [${(rec.roles || []).join(', ')}], recomputed [${computed.roles.join(', ')}] (run --write)`);
            }
          }
        }

        // --- the source that produced the pixels, if one is declared ---
        if (entry.source) {
          const srcAbs = join(args.root, entry.source);
          const srcExt = extname(srcAbs).toLowerCase();
          if (!existsSync(srcAbs)) {
            errs.push(`${entry.id}: declared source not found: ${entry.source}`);
          } else if (srcExt === '.js' || srcExt === '.mjs') {
            // A RECIPE. Its colors are computed, so there are no literals to
            // check — the palette verdict is the one already taken off the
            // rendered pixels above. What is checked here is the contract that
            // makes the recipe worth committing: self-contained, and seeded so
            // the PNG can be regenerated. Deliberately WITHOUT executing it:
            // this checker never runs generated code.
            const scan = scanRecipe(readFileSync(srcAbs, 'utf8'), { label: entry.source });
            result.recipe = { seed: scan.meta.seed, roles: scan.meta.roles, errors: scan.errors.length };
            errs.push(...scan.errors.map((e) => `${entry.id}: ${e}`));
            if (entry.seed !== undefined && scan.meta.seed !== null && entry.seed !== scan.meta.seed) {
              errs.push(`${entry.id}: manifest records seed ${entry.seed}, ${entry.source} uses ${scan.meta.seed}`);
            }
            if (args.write && scan.meta.seed !== null) entry.seed = scan.meta.seed;
            else if (!args.write && entry.seed === undefined && scan.meta.seed !== null) {
              errs.push(`${entry.id}: a recipe-generated asset must record its "seed" so a regeneration is auditable (run --write)`);
            }
          } else {
            try {
              const srcPal = paletteOfFile(srcAbs, { minCoverage: 0 });
              result.sourcePalette = srcPal;
              for (const u of srcPal.unresolved || []) {
                errs.push(`${entry.id}: source ${entry.source}: unreadable color "${u.raw}" in ${u.prop} — ${u.why}`);
              }
              for (const off of srcPal.offPalette) {
                errs.push(`${entry.id}: source ${entry.source}: off-palette ${off.hex} — ${off.reason}`);
              }
            } catch (err) {
              errs.push(`${entry.id}: cannot palette-check source ${entry.source} — ${err.message}`);
            }
          }
        }
      }
    }

    report.assets.push(result);
    report.errors.push(...errs);
  });

  const indep = checkGameIndependence(args.root);
  report.gameIndependence.errors = indep.errs;
  report.gameIndependence.references = indep.info;
  report.gameIndependence.staticImports = indep.staticImports;
  report.errors.push(...indep.errs);

  if (args.write) {
    const file = saveManifest(args.root, manifest);
    report.wrote = file;
  }

  return finish(report, args);
}

function finish(report, args) {
  report.ok = report.errors.length === 0;
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.ok ? 0 : 1);
  }

  console.log(`asset check — ${report.root}`);
  console.log(`  palette: ${report.roleBudget.declared}/${report.roleBudget.budget} roles, neutral floor chroma ${report.roleBudget.neutralMaxChroma}, selftest ${report.selftest.cases} palette + ${report.selftest.importCases} import-scan + ${report.selftest.rasterCases} raster-mass + ${report.selftest.alphaCases} alpha-contract + ${report.selftest.recipeCases} recipe-contract cases ${report.selftest.failures.length ? 'FAILED' : 'ok'}`);
  console.log(`  manifest: ${report.assets.length} asset${report.assets.length === 1 ? '' : 's'}`);
  for (const a of report.assets) {
    const size = a.actualSize ? `${a.actualSize.w}x${a.actualSize.h}` : '?';
    const roles = a.palette ? a.palette.roles.map((r) => `${r.id} ${(r.coverage * 100).toFixed(0)}%`).join(', ') : '';
    const bytes = a.bytes ? `, ${(a.bytes / 1024).toFixed(1)}kB` : '';
    console.log(`    ${a.errors.length ? 'FAIL' : 'ok  '} ${a.id}  ${size}${bytes}  ${roles}`);
    if (a.palette?.kind === 'raster') {
      const p = a.palette;
      console.log(
        `         mass: in-band ${(p.inBandMass * 100).toFixed(2)}%, blend ${(p.blendMass * 100).toFixed(3)}% ` +
        `(cap ${(p.limits.offBandMass * 100).toFixed(0)}% off-band), alien ${(p.alienMass * 100).toFixed(4)}% ` +
        `(cap ${(p.limits.alienMass * 100).toFixed(1)}%) over ${p.uniqueColors} unique colors`
      );
      if (p.alienColors) {
        console.log(`         alien: ${p.alien.slice(0, 3).map((x) => `${x.hex} hue ${x.hue} @${(x.coverage * 100).toFixed(4)}%`).join(', ')}`);
      }
      if (p.faint) {
        console.log(
          `         faint: ${p.faint.colors} color${p.faint.colors === 1 ? '' : 's'} below alpha ${ALPHA_HUE_FLOOR} ` +
          `excluded from the hue verdict (premultiply quantization) — of those, off-band ` +
          `${(p.faint.offBandMass * 100).toFixed(2)}%, alien ${(p.faint.alienMass * 100).toFixed(2)}%`
        );
      }
    }
    if (a.alpha) {
      console.log(
        `         alpha: ${a.alpha.declared ?? 'undeclared'} — ${a.alpha.transparent}% transparent, ` +
        `${a.alpha.partial}% partial, ${a.alpha.opaque}% opaque`
      );
    }
    if (a.recipe) {
      console.log(`         recipe: seed ${a.recipe.seed}, declares roles [${a.recipe.roles.join(', ')}]`);
    }
  }
  // Static imports are errors, listed under "problems" below; this line counts
  // only the legal runtime references, and says so even when the two coexist
  // (I-002: imports used to be printed here too, under a header denying it).
  const rejected = report.gameIndependence.staticImports
    ? ` (${report.gameIndependence.staticImports} static import${report.gameIndependence.staticImports === 1 ? '' : 's'} rejected below, not counted here)`
    : '';
  if (report.gameIndependence.references.length) {
    console.log(`  game references to assets/ (runtime, not imports): ${report.gameIndependence.references.length}${rejected}`);
    for (const r of report.gameIndependence.references) console.log(`    ${r}`);
  } else if (report.gameIndependence.staticImports) {
    console.log(`  game independence: src/ has no runtime reference to assets/${rejected}`);
  } else {
    console.log('  game independence: src/ contains no reference to assets/ at all');
  }
  if (report.wrote) console.log(`  wrote ${MANIFEST_PATH}`);

  if (report.ok) {
    console.log('\nPASS');
  } else {
    console.log(`\n${report.errors.length} problem${report.errors.length === 1 ? '' : 's'}:`);
    for (const e of report.errors) console.log(`  - ${e}`);
    console.log('\nFAIL');
  }
  process.exit(report.ok ? 0 : 1);
}

main();
