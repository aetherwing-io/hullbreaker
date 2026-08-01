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
  optional: ['source', 'gpu', 'palette', 'notes', 'generator', 'addedOn'],
};

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
  if (entry.task !== undefined && !/^T-\d+$/.test(entry.task)) {
    errs.push(`${where}: task must look like "T-015", got "${entry.task}"`);
  }
  return errs;
}

export const isPowerOfTwo = (n) => Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
