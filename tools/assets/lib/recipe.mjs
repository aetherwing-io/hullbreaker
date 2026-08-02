// recipe.mjs — what a raster RECIPE is allowed to be, checked without running it.
//
// A recipe is the source of a painted asset: a self-contained ES module that
// exports `meta` and `render(ctx, env)`, and gets rasterized by
// tools/assets/render.mjs inside the playtest harness's Chrome. Because the
// recipe is the committed, diffable record of the asset (the PNG is the
// artifact), two properties have to hold for it to be worth anything:
//
//   REPRODUCIBLE — same recipe + same seed = same pixels. That fails the moment
//     a recipe reaches for Math.random, a clock, or anything outside itself.
//   SELF-CONTAINED — no imports, no network, no DOM beyond the 2D context it is
//     handed. An asset that pins a path inside tools/ breaks when the tool moves.
//
// This module states both as a static scan so `check.mjs` can enforce them
// WITHOUT executing generated code — the checker stays a bare `node
// tools/assets/check.mjs` with no browser, no sandbox and no trust in whatever
// a generator wrote. render.mjs runs the same scan before it hands a recipe to
// a browser, and additionally deletes Math.random from the page, so a recipe
// that slipped past the lexer still cannot silently produce different bytes
// twice.
//
// LIMITATION, on purpose: this is a lexer, not a parser (same trade as
// imports.mjs). It reads `meta` fields with regexes over masked source, so a
// recipe that computes its seed at runtime, or hides `Math["random"]` behind a
// computed member access, is not caught here — it is caught by render.mjs's
// two-render byte comparison, which is the property that actually matters.

import { maskSource, scanStaticImports } from './imports.mjs';
import { classify } from './palette.mjs';

/**
 * Identifiers a recipe may not name. Each one is either non-deterministic or a
 * door out of the sandbox; `env` provides the legal substitute for the first two.
 */
export const BANNED = [
  { re: /\bMath\s*\.\s*random\b/, why: 'non-deterministic — use env.rng(), env.stream(name), env.noise() or env.fbm()' },
  { re: /\bDate\s*\.\s*now\b/, why: 'a clock makes the asset unreproducible' },
  { re: /\bnew\s+Date\b/, why: 'a clock makes the asset unreproducible' },
  { re: /\bperformance\s*\.\s*now\b/, why: 'a clock makes the asset unreproducible' },
  { re: /\bfetch\s*\(/, why: 'a recipe must not reach the network' },
  { re: /\bXMLHttpRequest\b/, why: 'a recipe must not reach the network' },
  { re: /\bimportScripts\b/, why: 'a recipe must not load code' },
  { re: /\beval\s*\(/, why: 'a recipe must be readable as written' },
  { re: /\bnew\s+Function\b/, why: 'a recipe must be readable as written' },
  { re: /\brequire\s*\(/, why: 'a recipe is an ES module and must be self-contained' },
  { re: /\bdocument\b/, why: 'the only DOM a recipe gets is the ctx it is handed' },
  { re: /\bwindow\b/, why: 'the only DOM a recipe gets is the ctx it is handed' },
  { re: /\bglobalThis\b/, why: 'the only DOM a recipe gets is the ctx it is handed' },
  { re: /\bnew\s+Image\b/, why: 'no external images: the asset must be painted, not composited from a file' },
  { re: /\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/, why: 'no persistent state between renders' },
  { re: /\bnavigator\b|\blocation\b/, why: 'the render must not depend on the machine it ran on' },
];

const NUM = String.raw`-?\d+(?:\.\d+)?`;

/** Best-effort read of a numeric or string field out of the `meta` literal. */
function metaField(code, name) {
  const num = new RegExp(String.raw`\b${name}\s*:\s*(${NUM})`).exec(code);
  if (num) return Number(num[1]);
  const str = new RegExp(String.raw`\b${name}\s*:\s*['"]([^'"]*)['"]`).exec(code);
  return str ? str[1] : null;
}

/**
 * Static verdict on one recipe's source.
 * -> { errors: string[], warnings: string[], meta: {id,seed,width,height,roles} }
 */
export function scanRecipe(text, { label = 'recipe' } = {}) {
  const masks = maskSource(text);
  const { code, bare } = masks;
  const errors = [];
  const warnings = [];

  for (const imp of scanStaticImports(text, masks)) {
    errors.push(`${label}: static ${imp.kind} of "${imp.specifier}" on line ${imp.line} — a recipe must be self-contained (everything it needs arrives in env)`);
  }
  for (const { re, why } of BANNED) {
    const m = re.exec(bare);
    if (m) {
      const line = text.slice(0, m.index).split('\n').length;
      errors.push(`${label}:${line}: "${m[0].trim()}" is not allowed in a recipe — ${why}`);
    }
  }

  // Every hex a recipe TYPES must itself be in a role band. The rendered pixels
  // are gated anyway, but a bad literal is a cause and a bad pixel is only a
  // symptom: this names the line. Colors the recipe derives with env.mix /
  // env.shade are not literals and are not seen here — that is the pixel gate's
  // job, and it is the half that catches a legal-looking mix landing off-band.
  for (const m of code.matchAll(/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b/g)) {
    const res = classify(m[0]);
    if (!res.ok) {
      const line = text.slice(0, m.index).split('\n').length;
      errors.push(`${label}:${line}: color literal ${m[0]} is off-palette — ${res.reason}. Derive colors from env.PALETTE with env.mix/env.shade instead of typing them.`);
    }
  }

  const hasRender = /\bexport\s+(async\s+)?function\s+render\b/.test(bare)
    || /\bexport\s+(const|let|var)\s+render\b/.test(bare)
    || /\bexport\s*\{[^}]*\brender\b/.test(bare);
  if (!hasRender) errors.push(`${label}: no exported render() — a recipe must "export function render(ctx, env)"`);

  const hasMeta = /\bexport\s+(const|let|var)\s+meta\b/.test(bare) || /\bexport\s*\{[^}]*\bmeta\b/.test(bare);
  if (!hasMeta) errors.push(`${label}: no exported meta — a recipe must "export const meta = { id, size, seed, roles }"`);

  const seed = metaField(code, 'seed');
  if (hasMeta && !Number.isFinite(seed)) {
    errors.push(`${label}: meta.seed must be a literal integer, so a regeneration is auditable`);
  }

  const meta = {
    id: metaField(code, 'id'),
    seed: Number.isFinite(seed) ? seed : null,
    width: metaField(code, 'w'),
    height: metaField(code, 'h'),
  };
  const roles = /\broles\s*:\s*\[([^\]]*)\]/.exec(code);
  meta.roles = roles ? roles[1].split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean) : [];

  return { errors, warnings, meta };
}

/** Pull the first fenced ```js / ```javascript block out of a codex reply. */
export function extractRecipe(text) {
  const fenced = /```(?:js|javascript|mjs)?\s*\n([\s\S]*?)```/g;
  for (const m of text.matchAll(fenced)) {
    const body = m[1];
    if (/\bexport\s+(async\s+)?function\s+render\b|\bexport\s+(const|let|var)\s+render\b/.test(body)) return body.trim();
  }
  return null;
}
