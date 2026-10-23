#!/usr/bin/env node
/* flag-lines.mjs — how much code sits behind each query flag (T-121).
 *
 *   node tools/cleanup/flag-lines.mjs
 *
 * For every flag constant it finds each `if` / `?:` whose TEST mentions the
 * constant and counts the lines of the branch that the DEFAULT URL does not
 * take ("off-default"). Default values: every src/mode.js export, computed by
 * importing src/mode.js headlessly with an empty query (so they cannot drift
 * from the code), plus the render-side constants in RENDER_DEFAULTS below,
 * read off their resolvers (src/render/*, src/pure/{post,seams,shade}.js).
 *
 * Limits (also in tools/cleanup/README.md): a test it cannot evaluate from
 * the defaults (a call, an unknown identifier) is reported as "undetermined",
 * not guessed; whole modules or data tables that only one flag reaches are
 * NOT counted here (they are reachable imports) — the cleanup proposal adds
 * those by hand and says so. Needs acorn (see graph.mjs). Zero game effect. */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
let acorn, walk;
for (const d of [process.env.HB_ACORN_DIR, join(ROOT, 'tools/cleanup/node_modules'), '/opt/node-tools/node_modules'].filter(Boolean)) {
  try { const req = createRequire(join(d, 'noop.js')); acorn = req('acorn'); walk = req('acorn-walk'); break; } catch { /* next */ }
}
if (!acorn) { console.error('flag-lines.mjs needs acorn + acorn-walk: cd tools/cleanup && npm install'); process.exit(2); }

// read off each resolver at its default (null) input — see the file's header
const RENDER_DEFAULTS = {
  CANVAS_MSAA: false, RENDER_BUDGETED: true, WARM_ON: true, LIGHT_RIG_ID: 'rig',
  FOREGROUND_COMPONENT_ART_ON: true, ACTION_VFX_ART_ON: true, SEAMS_ENABLED: true,
  ADAPTIVE_FIDELITY_ON: false, ACTOR_MOTION_ON: true, ENEMY_ECOLOGY_ART_ON: true,
  PROJECTILE_ART_ON: true, LIMB_SILHOUETTE_PASS: true, SCALE_PASS: true,
  CONTACT_SHADOWS_ENABLED: true, HULL_TEX_MODE: 'pixel', HULL_TEX_ON: true,
  WORLD_DRESSING_ENABLED: true, LEGACY_CROWN: false, BACKDROP_ON: true,
  DEFENSE_VFX_ART_ON: true, CAPSULE_ART_ON: true, WASP_MODULAR_ON: false, SPRITES_ON: true,
  FOREGROUND_PACK_ON: true, WORLD_DETAIL_ON: true, LEGIBILITY_ON: true, POST_REPORT: false,
  ATMOS_MATCH: true, RIG_FORCE_CANVAS: false, PALETTE_ID: 'concept', AUDIO_ON: true,
};
globalThis.__HB_QUERY__ = '';
const mode = await import(pathToFileURL(join(ROOT, 'src/mode.js')).href);
const DEFAULTS = { ...RENDER_DEFAULTS };
for (const [k, v] of Object.entries(mode)) if (k !== 'QUERY') DEFAULTS[k] = v;
const NAMES = Object.keys(DEFAULTS);

function evalTest(n) {
  switch (n.type) {
    case 'Identifier': return n.name in DEFAULTS ? !!DEFAULTS[n.name] : null;
    case 'UnaryExpression': { if (n.operator !== '!') return null; const v = evalTest(n.argument); return v === null ? null : !v; }
    case 'LogicalExpression': {
      const a = evalTest(n.left), b = evalTest(n.right);
      if (n.operator === '&&') return a === false || b === false ? false : a && b ? true : null;
      if (n.operator === '||') return a === true || b === true ? true : a === false && b === false ? false : null;
      return null;
    }
    case 'BinaryExpression': {
      const id = [n.left, n.right].find((x) => x.type === 'Identifier' && x.name in DEFAULTS);
      const lit = [n.left, n.right].find((x) => x.type === 'Literal');
      if (!id || !lit) return null;
      const v = DEFAULTS[id.name];
      if (n.operator === '===' || n.operator === '==') return v === lit.value;
      if (n.operator === '!==' || n.operator === '!=') return v !== lit.value;
      return null;
    }
    default: return null;
  }
}
const span = (n) => (n ? n.loc.end.line - n.loc.start.line + 1 : 0);
const files = (dir, out = []) => {
  for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) files(p, out); else if (p.endsWith('.js')) out.push(p); }
  return out;
};
const result = {};
for (const f of files(join(ROOT, 'src'))) {
  const ast = acorn.parse(readFileSync(f, 'utf8'), { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  walk.full(ast, (n) => {
    if (n.type !== 'IfStatement' && n.type !== 'ConditionalExpression') return;
    const seen = new Set();
    walk.full(n.test, (x) => { if (x.type === 'Identifier' && x.name in DEFAULTS) seen.add(x.name); });
    if (!seen.size) return;
    const v = evalTest(n.test);
    for (const k of seen) {
      const r = (result[k] ||= { sites: 0, off: 0, undetermined: 0, files: {} });
      const fr = (r.files[relative(join(ROOT, 'src'), f)] ||= 0);
      r.sites++;
      const off = v === true ? span(n.alternate) : v === false ? span(n.consequent) : 0;
      if (v === null) r.undetermined += span(n.consequent) + span(n.alternate);
      r.off += off;
      r.files[relative(join(ROOT, 'src'), f)] = fr + off;
    }
  });
}
console.log('flag constant'.padEnd(28) + 'default'.padEnd(16) + 'sites  off-default  undetermined  files (off-default lines)');
for (const [k, r] of Object.entries(result).sort((a, b) => b[1].off - a[1].off)) {
  const d = DEFAULTS[k];
  const shown = d && typeof d === 'object' ? (d.id || 'object') : String(d);
  console.log(k.padEnd(28) + shown.slice(0, 15).padEnd(16) + String(r.sites).padStart(5) + String(r.off).padStart(13) +
    String(r.undetermined).padStart(14) + '  ' + Object.entries(r.files).map(([f, l]) => `${f}(${l})`).join(' '));
}
