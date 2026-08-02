// manifest.mjs — assets/manifest.json: schema, load, save.
//
// The manifest is the index the render/ui layer would read to find an asset,
// and the record the operator reviews before promoting anything into
// assets/approved/. Its schema is enforced here so `check.mjs` and any future
// loader agree on one shape.

import { readFileSync, writeFileSync } from 'node:fs';

export const MANIFEST_PATH = 'assets/manifest.json';

/** Categories are directory names under assets/generated/ — one per asset kind. */
export const CATEGORIES = ['glyphs', 'textures', 'sprites', 'ui', 'fx', 'backdrops'];

export const ENTRY_SCHEMA = {
  required: ['id', 'path', 'category', 'size', 'task'],
  // `seed` is the reproducibility record for a procedurally painted asset: the
  // recipe named in `source` plus this integer is the whole input to the PNG.
  // check.mjs recomputes it from the recipe and refuses a mismatch, so it
  // cannot rot into a number someone typed once.
  //
  // `alpha` is the asset's TRANSPARENCY CONTRACT with whatever composites it —
  // see ALPHA_KINDS below. It is DECLARED, never derived: check.mjs compares it
  // against the pixels and fails on disagreement, and `--write` deliberately
  // does not fill it in.
  optional: ['source', 'gpu', 'palette', 'notes', 'generator', 'addedOn', 'seed', 'alpha'],
};

/**
 * What an asset promises about its alpha channel.
 *
 * This exists because a regeneration silently turned five backdrop plates from
 * ~50%-transparent cutouts into fully opaque rectangles with the background
 * baked in (T-053). Every gate stayed green: the palette was clean, the sizes
 * matched, the ids and paths were stable, and the game had no effect to show
 * because nothing loaded them yet. The lane layering those plates for parallax
 * would have been the thing that found out, at merge time, because an opaque
 * plate occludes every tier behind it.
 *
 * So alpha stops being an accident of how a brief was worded and becomes a
 * stated property with a falsifying test.
 *
 *   cutout  — a shape on transparency. Something composites this over something
 *             else and the transparent region must READ as absent. Requires a
 *             real feathered margin, not a one-pixel cut: a hard alpha edge on a
 *             camera-facing plane cannot be made to dissolve by any amount of
 *             fog or depth tuning downstream, so the dissolve has to be authored
 *             here.
 *   opaque  — every pixel opaque. A tiling surface texture wants this; alpha in
 *             a repeating material is a bug, not a feature.
 *   overlay — mostly transparent, nothing fully opaque: a wear/grime layer that
 *             modulates a surface underneath rather than replacing it.
 */
export const ALPHA_KINDS = ['cutout', 'opaque', 'overlay'];

/**
 * Thresholds for `alpha`, in percent of all pixels. Measured, not chosen — the
 * numbers each rule had to admit or reject are in tools/assets/README.md
 * § "Alpha semantics".
 */
export const ALPHA_RULES = {
  cutout: {
    minTransparent: 5,      // below this it is not a cutout, whatever it claims
    minPartial: 2,          // the feather: the pre-T-053 plates managed 0.28-1.80% and were judged too hard-edged
  },
  opaque: { maxTransparent: 0.5, maxPartial: 0.5 },
  overlay: { minTransparent: 40, maxOpaque: 5 },
};

/**
 * Judge an alpha census against a declared kind.
 * `census`: { transparent, partial, opaque } as percentages of all pixels.
 * -> array of failure strings (empty = the pixels keep the promise).
 */
export function checkAlphaKind(kind, census) {
  const errs = [];
  const r = ALPHA_RULES[kind];
  if (!r) return [`unknown alpha kind "${kind}" (want ${ALPHA_KINDS.join(', ')})`];
  const pct = (v) => `${v.toFixed(2)}%`;
  if (kind === 'cutout') {
    if (census.transparent < r.minTransparent) {
      errs.push(
        `declares alpha "cutout" but only ${pct(census.transparent)} of it is transparent ` +
        `(need >= ${r.minTransparent}%) — a plate with the background baked in occludes ` +
        'everything composited behind it'
      );
    }
    if (census.partial < r.minPartial) {
      errs.push(
        `declares alpha "cutout" but only ${pct(census.partial)} of it is partially transparent ` +
        `(need >= ${r.minPartial}%) — that is a hard-edged cut, and a hard alpha edge cannot be ` +
        'made to dissolve downstream; author the falloff into the asset'
      );
    }
  } else if (kind === 'opaque') {
    if (census.transparent > r.maxTransparent || census.partial > r.maxPartial) {
      errs.push(
        `declares alpha "opaque" but is ${pct(census.transparent)} transparent and ` +
        `${pct(census.partial)} partial (limits ${r.maxTransparent}% / ${r.maxPartial}%)`
      );
    }
  } else if (kind === 'overlay') {
    if (census.transparent < r.minTransparent) {
      errs.push(`declares alpha "overlay" but only ${pct(census.transparent)} of it is transparent (need >= ${r.minTransparent}%)`);
    }
    if (census.opaque > r.maxOpaque) {
      errs.push(
        `declares alpha "overlay" but ${pct(census.opaque)} of it is fully opaque ` +
        `(limit ${r.maxOpaque}%) — an overlay modulates what is under it, it does not replace it`
      );
    }
  }
  return errs;
}

export function loadManifest(root) {
  const file = `${root}/${MANIFEST_PATH}`;
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (err) {
    throw new Error(`cannot read ${MANIFEST_PATH}: ${err.message}`);
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new Error(`${MANIFEST_PATH} is not valid JSON: ${err.message}`);
  }
  if (!json || typeof json !== 'object' || !Array.isArray(json.assets)) {
    throw new Error(`${MANIFEST_PATH} must be an object with an "assets" array`);
  }
  return json;
}

export function saveManifest(root, manifest) {
  const file = `${root}/${MANIFEST_PATH}`;
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return file;
}

const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Structural validation only — file existence and pixel truth live in check.mjs. */
export function validateEntryShape(entry, index) {
  const errs = [];
  const where = `assets[${index}]${entry && entry.id ? ` (${entry.id})` : ''}`;

  if (!entry || typeof entry !== 'object') return [`${where}: not an object`];

  for (const key of ENTRY_SCHEMA.required) {
    if (entry[key] === undefined) errs.push(`${where}: missing required field "${key}"`);
  }
  for (const key of Object.keys(entry)) {
    if (!ENTRY_SCHEMA.required.includes(key) && !ENTRY_SCHEMA.optional.includes(key)) {
      errs.push(`${where}: unknown field "${key}" (allowed: ${[...ENTRY_SCHEMA.required, ...ENTRY_SCHEMA.optional].join(', ')})`);
    }
  }
  if (entry.id !== undefined && !ID_RE.test(entry.id)) {
    errs.push(`${where}: id must be kebab-case ([a-z0-9-]), got "${entry.id}"`);
  }
  if (entry.path !== undefined) {
    if (!/^assets\/(generated|approved)\//.test(entry.path)) {
      errs.push(`${where}: path must live under assets/generated/ or assets/approved/, got "${entry.path}"`);
    }
    if (entry.path.includes('..')) errs.push(`${where}: path must not contain ".."`);
  }
  if (entry.category !== undefined && !CATEGORIES.includes(entry.category)) {
    errs.push(`${where}: category "${entry.category}" is not one of ${CATEGORIES.join(', ')}`);
  }
  if (entry.category !== undefined && entry.path !== undefined &&
      !entry.path.includes(`/${entry.category}/`)) {
    errs.push(`${where}: path "${entry.path}" is not inside its declared category directory "${entry.category}"`);
  }
  if (entry.size !== undefined) {
    const s = entry.size;
    if (!s || typeof s !== 'object' || !Number.isInteger(s.w) || !Number.isInteger(s.h)) {
      errs.push(`${where}: size must be { "w": <int>, "h": <int> }`);
    }
  }
  if (entry.gpu !== undefined && typeof entry.gpu !== 'boolean') {
    errs.push(`${where}: gpu must be a boolean (true = a GPU texture, power-of-two enforced)`);
  }
  if (entry.gpu === false && !entry.notes) {
    errs.push(`${where}: gpu:false opts out of the power-of-two rule, so "notes" must say why`);
  }
  if (entry.alpha !== undefined && !ALPHA_KINDS.includes(entry.alpha)) {
    errs.push(`${where}: alpha must be one of ${ALPHA_KINDS.join(', ')}, got ${JSON.stringify(entry.alpha)}`);
  }
  // Backdrops are layered by definition — something composites them over
  // something else — so the one category whose consumer depends on the alpha
  // contract has to state it. Everywhere else the field is optional until a
  // consumer needs it.
  if (entry.category === 'backdrops' && entry.alpha === undefined) {
    errs.push(
      `${where}: a backdrops entry must declare "alpha" (${ALPHA_KINDS.join(' | ')}). ` +
      'Backdrop plates are composited in depth tiers; whether the plate is a cutout is a ' +
      'contract with the render layer, and T-053 proved it silently regresses when nobody states it.'
    );
  }
  if (entry.seed !== undefined && !Number.isInteger(entry.seed)) {
    errs.push(`${where}: seed must be an integer (the recipe's meta.seed), got ${JSON.stringify(entry.seed)}`);
  }
  if (entry.seed !== undefined && !/\.(js|mjs)$/.test(entry.source || '')) {
    errs.push(`${where}: seed is only meaningful with a recipe "source" — a hand-authored SVG has no seed`);
  }
  if (entry.task !== undefined && !/^T-\d+$/.test(entry.task)) {
    errs.push(`${where}: task must look like "T-015", got "${entry.task}"`);
  }
  return errs;
}

export const isPowerOfTwo = (n) => Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
