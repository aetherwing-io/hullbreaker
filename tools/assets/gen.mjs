#!/usr/bin/env node
// gen.mjs — fill the codex spec template, optionally run `codex exec`, keep the
// resolved spec as the record of what was asked for.
//
//   node tools/assets/gen.mjs --id vent-plate --category textures \
//     --brief "an armoured vent cover, four louvres, one broken" \
//     --roles rust-orange,ink --size 128 --boards 10,13
//
//   node tools/assets/gen.mjs ... --mode raster --tiling xy   ask for a PAINTER, not an SVG
//   node tools/assets/gen.mjs ... --dry-run     write the spec, print the command, stop
//
// TWO MODES, both real:
//
//   vector (default) — codex returns one <svg>, rasterize.mjs turns it into a
//     PNG. Right for glyphs, UI marks and anything whose value is a crisp
//     silhouette at 16px. Flat fills are a feature there.
//   raster — codex returns a self-contained ES module that PAINTS the asset
//     into a canvas (a "recipe"), and render.mjs runs it. Right for surfaces:
//     hull plates, backdrops, anything whose value is grain, wear, occlusion and
//     atmosphere. A coding agent cannot emit a painting, but it can write a
//     program that renders one — and the source still diffs, still has no
//     dependency, and the pixels are still palette-checked.
//
// CODEX IS OPTIONAL, BY DESIGN. The rest of the pipeline (rasterize, render,
// check, view) never calls this file and works with codex absent or
// uninstalled: this is a way to *ask* for an asset, not a step anything depends
// on. With codex missing, the spec is still written and the exact command to run
// later is printed, and the exit code is 3 (distinct from 2 usage / 1 failure)
// so a caller can tell "unavailable" from "went wrong".
//
// What this does NOT do: judge the art, retry until something passes, or write
// into assets/approved/. It writes one source file into
// assets/generated/<category>/ and tells you the commands that put it through
// the gate.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROLES, CHROMATIC_ROLES, NEUTRAL_MAX_CHROMA } from './lib/palette.mjs';
import { CATEGORIES } from './lib/manifest.mjs';
import { extractRecipe, scanRecipe } from './lib/recipe.mjs';
import { hashString } from './lib/procgen.mjs';

const ASSETS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(ASSETS_DIR, '../..');
const TEMPLATES = {
  vector: join(ASSETS_DIR, 'codex', 'spec-template.md'),
  raster: join(ASSETS_DIR, 'codex', 'raster-spec-template.md'),
};

const RIG_TILES = 1.7;                    // CONFIG.player.height
const FAR_FRAC = 0.037;                   // RIG's screen-height fraction in the shipped FAR view
const REF_VIEWPORT_H = 800;               // the playtest harness's default viewport height

const HELP = `tools/assets/gen.mjs — build a codex spec for one asset, and optionally run it

  node tools/assets/gen.mjs --id <kebab-id> --category <${CATEGORIES.join('|')}> --brief "<what to draw>" [options]

  --mode <m>         vector (default, asks for an <svg>) or raster (asks for a canvas recipe)
  --seed <n>         raster only: meta.seed (default: derived from the id, so it is stable)
  --tiling <t>       raster only: none (default) | x | y | xy — which edges must be seamless
  --roles <a,b>      role ids the asset may use (default: all)
  --size <n|WxH>     canvas, every dimension a power of two (default 128)
  --tiles <h|W,H>    the asset's size in world tiles, for the scale note (default 0.55).
                     One number is a height (a square asset's width is assumed equal).
  --grid <n|WxH>     the SVG's viewBox — the DESIGN grid, in whole units (default: the
                     canvas). Set it to the asset's true on-screen pixel box and every
                     unit the generator draws is one pixel the player will actually see.
  --boards <n,m>     concept board numbers to attach as references (default 10,13)
  --model <name>     passed through to codex -m
  --dry-run          write the spec and print the command; do not invoke codex
  --spec-out <file>  where to write the resolved spec (default tools/assets/runs/spec-<id>.md)
  --force            overwrite an existing source file for this id`;

/** "64" -> {w:64,h:64}; "64x32" -> {w:64,h:32}. Null on anything else. */
export function parseBox(text) {
  const parts = String(text).toLowerCase().split('x').map((s) => Number(s.trim()));
  if (parts.length === 1 && Number.isFinite(parts[0])) return { w: parts[0], h: parts[0] };
  if (parts.length === 2 && parts.every(Number.isFinite)) return { w: parts[0], h: parts[1] };
  return null;
}

/** "0.9" -> {w:0.9,h:0.9}; "1.7,0.9" -> {w:1.7,h:0.9}. Null on anything else. */
export function parseTiles(text) {
  const parts = String(text).split(',').map((s) => Number(s.trim()));
  if (parts.length === 1 && Number.isFinite(parts[0])) return { w: parts[0], h: parts[0] };
  if (parts.length === 2 && parts.every(Number.isFinite)) return { w: parts[0], h: parts[1] };
  return null;
}

function parseArgs(argv) {
  const a = {
    id: null, category: null, brief: null, roles: null, size: '128', tiles: '0.55',
    grid: null, boards: '10,13', model: null, dryRun: false, specOut: null, force: false,
    mode: 'vector', seed: null, tiling: 'none',
  };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--mode') a.mode = argv[++i];
    else if (t === '--seed') a.seed = Number(argv[++i]);
    else if (t === '--tiling') a.tiling = argv[++i];
    else if (t === '--id') a.id = argv[++i];
    else if (t === '--category') a.category = argv[++i];
    else if (t === '--brief') a.brief = argv[++i];
    else if (t === '--roles') a.roles = argv[++i];
    else if (t === '--size') a.size = argv[++i];
    else if (t === '--tiles') a.tiles = argv[++i];
    else if (t === '--grid') a.grid = argv[++i];
    else if (t === '--boards') a.boards = argv[++i];
    else if (t === '--model') a.model = argv[++i];
    else if (t === '--dry-run') a.dryRun = true;
    else if (t === '--spec-out') a.specOut = argv[++i];
    else if (t === '--force') a.force = true;
    else if (t === '--help' || t === '-h') a.help = true;
    else { console.error(`unknown flag: ${t}`); process.exit(2); }
  }
  return a;
}

/** The palette section, generated so the spec can never drift from the checker. */
function paletteTable(allowed) {
  const rows = ROLES
    .filter((r) => !allowed || allowed.includes(r.id))
    .map((r) => {
      const band = r.kind === 'chromatic'
        ? `hue ${r.hue[0]}-${r.hue[1]} in CIELCh`
        : `any hue below chroma ${NEUTRAL_MAX_CHROMA} (a grey/ink tone)`;
      return `- **${r.id}** (${r.use})\n  anchor \`${r.anchor}\`, legal range: ${band}`;
    });
  return `${rows.join('\n')}\n\nAnchors are one usable color per role, not the only one: any shade or tint ` +
    `that keeps the same hue passes. ${CHROMATIC_ROLES.length} chromatic roles plus a neutral axis, ` +
    'eight total — DESIGN\'s whole palette budget.';
}

/** The on-screen pixel box a world-tile box occupies in the shipped FAR view. */
export function screenBox(tiles) {
  const k = (FAR_FRAC * REF_VIEWPORT_H) / RIG_TILES;
  return { w: tiles.w * k, h: tiles.h * k };
}

function scaleNote(tiles, canvas, grid) {
  const px = screenBox(tiles);
  const rigPx = FAR_FRAC * REF_VIEWPORT_H;
  const lines = [
    `This asset occupies ${tiles.w} x ${tiles.h} world tiles. The shipped default camera (FAR, per ` +
    `docs/decisions.md entries 7 and 17) renders RIG — ${RIG_TILES} tiles — at ${(FAR_FRAC * 100).toFixed(1)}% of screen height, so on a ` +
    `1280x800 screen this asset is about **${px.w.toFixed(1)} x ${px.h.toFixed(1)} pixels**, next to a ${rigPx.toFixed(0)}px-tall RIG. ` +
    'That is the only size that matters. Judge every decision there.',
  ];
  if (grid.w !== canvas.w || grid.h !== canvas.h) {
    lines.push(
      `Your viewBox is **${grid.w} x ${grid.h}** and it is a DESIGN GRID: one unit is one pixel the ` +
      `player will really see (the ${canvas.w}x${canvas.h} raster is a ${(canvas.w / grid.w).toFixed(0)}x oversample for mipmapping, ` +
      'not extra resolution to spend). Snap every edge to whole units. A feature under one unit ' +
      'thick does not exist. You have on the order of a few hundred meaningful pixels — spend ' +
      'them on silhouette and one accent, not on detail.'
    );
  } else {
    const ratio = canvas.w / Math.max(1, px.w);
    lines.push(
      `The canvas is ${canvas.w}x${canvas.h}, about ${ratio.toFixed(1)}x the pixels this will occupy on screen, so any ` +
      `feature thinner than ${Math.max(2, Math.round(ratio)).toFixed(0)} canvas pixels vanishes when it is drawn.`
    );
  }
  return lines.join('\n\n');
}

/**
 * The seamless-repeat clause. A tiling texture's defect is a seam, and a
 * generator that has not been told which edges must meet will happily paint a
 * vignette. env.noise/env.fbm are periodic, so the instruction is concrete:
 * sample on a whole-number lattice across the canvas and the field wraps.
 */
export function tilingNote(tiling, canvas) {
  if (tiling === 'none') {
    return 'This asset does NOT tile: it is one plate, seen whole. Its edges may do whatever the\n' +
      'composition needs — vignette into the fog, run off the canvas, or stop at a silhouette.';
  }
  const axes = { x: 'horizontally', y: 'vertically', xy: 'in both directions' }[tiling];
  const wrap = tiling === 'x' ? 'left edge meets right edge'
    : tiling === 'y' ? 'top edge meets bottom edge'
      : 'left meets right AND top meets bottom';
  return `**This asset TILES ${axes}.** It is a repeating surface, so the ${wrap} with no visible ` +
    'seam and no motif the eye can count across a 4x4 repeat.\n\n' +
    '- Sample noise so it wraps: `env.fbm(u * P, v * P, { period: P })` with a whole-number `P` ' +
    `(u,v are 0..1 across the ${canvas.w}x${canvas.h} canvas) is periodic and meets itself exactly.\n` +
    '- Anything drawn with `ctx` that crosses an edge must be drawn twice, once on each side, ' +
    'offset by the canvas size — a bolt at x=2 also needs drawing at x=' + canvas.w + '+2.\n' +
    '- No vignette, no overall gradient across the tiling axis, no feature so distinctive that ' +
    'four copies of it read as wallpaper. Variation must come from the field, not from position.';
}

function boardFiles(spec) {
  const dir = join(REPO_ROOT, 'docs', 'concept-art');
  const all = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.png')) : [];
  const wanted = String(spec).split(',').map((s) => s.trim()).filter(Boolean);
  const hits = [];
  for (const w of wanted) {
    const num = w.padStart(2, '0');
    const file = all.find((f) => f.startsWith(`${num}-`));
    if (file) hits.push(join(dir, file));
    else console.error(`warning: no concept board matching "${w}" in docs/concept-art/`);
  }
  return hits;
}

/** Pull the first <svg>...</svg> out of a codex reply, fenced or bare. */
export function extractSvg(text) {
  const fenced = /```(?:svg|xml|html)?\s*\n([\s\S]*?)```/g;
  for (const m of text.matchAll(fenced)) {
    const inner = m[1];
    const svg = /<svg[\s\S]*<\/svg>/i.exec(inner);
    if (svg) return svg[0];
  }
  const bare = /<svg[\s\S]*<\/svg>/i.exec(text);
  return bare ? bare[0] : null;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(HELP); process.exit(0); }
  if (!args.id || !args.category || !args.brief) {
    console.error('need --id, --category and --brief\n');
    console.log(HELP);
    process.exit(2);
  }
  if (!CATEGORIES.includes(args.category)) {
    console.error(`--category must be one of ${CATEGORIES.join(', ')}`);
    process.exit(2);
  }
  if (!TEMPLATES[args.mode]) {
    console.error(`--mode must be one of ${Object.keys(TEMPLATES).join(', ')}, got ${args.mode}`);
    process.exit(2);
  }
  if (!['none', 'x', 'y', 'xy'].includes(args.tiling)) {
    console.error(`--tiling must be none, x, y or xy, got ${args.tiling}`);
    process.exit(2);
  }
  if (args.seed !== null && !Number.isInteger(args.seed)) {
    console.error(`--seed wants a whole number, got ${args.seed}`);
    process.exit(2);
  }
  const canvas = parseBox(args.size);
  if (!canvas || ![canvas.w, canvas.h].every((n) => Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0)) {
    console.error(`--size wants a power of two or WxH of powers of two, got ${args.size}`);
    process.exit(2);
  }
  const grid = args.grid === null ? { ...canvas } : parseBox(args.grid);
  if (!grid || ![grid.w, grid.h].every((n) => Number.isInteger(n) && n > 0)) {
    console.error(`--grid wants a whole number or WxH of whole numbers, got ${args.grid}`);
    process.exit(2);
  }
  const tiles = parseTiles(args.tiles);
  if (!tiles || ![tiles.w, tiles.h].every((n) => n > 0)) {
    console.error(`--tiles wants a height or W,H in world tiles, got ${args.tiles}`);
    process.exit(2);
  }
  const allowed = args.roles ? args.roles.split(',').map((s) => s.trim()) : null;
  if (allowed) {
    const unknown = allowed.filter((r) => !ROLES.some((x) => x.id === r));
    if (unknown.length) {
      console.error(`unknown role(s): ${unknown.join(', ')} — known: ${ROLES.map((r) => r.id).join(', ')}`);
      process.exit(2);
    }
  }

  // A seed nobody chose is a seed nobody can reproduce by accident: derive it
  // from the id so re-running the same ask twice asks for the same asset, and
  // record it in the recipe so a regeneration is auditable.
  const seed = args.seed === null ? hashString(args.id) % 1000000 : args.seed;

  const boards = boardFiles(args.boards);
  const spec = readFileSync(TEMPLATES[args.mode], 'utf8')
    .replace(/<!--[\s\S]*?-->\n?/, '')                    // the template's own authoring notes
    .replaceAll('{{ID}}', args.id)
    .replaceAll('{{CATEGORY}}', args.category)
    .replaceAll('{{BRIEF}}', args.brief)
    .replaceAll('{{W}}', String(canvas.w))
    .replaceAll('{{H}}', String(canvas.h))
    .replaceAll('{{VBW}}', String(grid.w))
    .replaceAll('{{VBH}}', String(grid.h))
    .replaceAll('{{ROLES}}', allowed ? allowed.join(', ') : ROLES.map((r) => r.id).join(', '))
    .replaceAll('{{PALETTE}}', paletteTable(allowed))
    .replaceAll('{{BOARDS}}', boards.length ? boards.map((b) => b.slice(REPO_ROOT.length + 1)).join(', ') : 'none attached')
    .replaceAll('{{SCALE_NOTE}}', scaleNote(tiles, canvas, grid))
    .replaceAll('{{SEED}}', String(seed))
    .replaceAll('{{TILING}}', tilingNote(args.tiling, canvas));

  const specPath = resolve(REPO_ROOT, args.specOut || `tools/assets/runs/spec-${args.id}.md`);
  mkdirSync(dirname(specPath), { recursive: true });
  writeFileSync(specPath, spec, 'utf8');

  const raster = args.mode === 'raster';
  const outPath = resolve(
    REPO_ROOT,
    `assets/generated/${args.category}/${args.id}${raster ? '.recipe.js' : '.svg'}`
  );
  const lastMsgPath = resolve(REPO_ROOT, `tools/assets/runs/codex-last-${args.id}.md`);

  const codexArgs = ['exec', '--skip-git-repo-check', '-s', 'read-only', '-o', lastMsgPath];
  for (const b of boards) codexArgs.push('-i', b);
  if (args.model) codexArgs.push('-m', args.model);
  codexArgs.push('-');                                    // read the spec from stdin

  const printable = `codex ${codexArgs.join(' ')} < ${specPath}`;

  console.log(`spec written: ${specPath.slice(REPO_ROOT.length + 1)} (${spec.length} bytes)`);
  console.log(`  mode:            ${args.mode}${raster ? ` (canvas recipe, seed ${seed}, tiling ${args.tiling})` : ' (svg)'}`);
  console.log(`  boards attached: ${boards.length ? boards.map((b) => b.split('/').pop()).join(', ') : 'none'}`);
  console.log(`  roles allowed:   ${allowed ? allowed.join(', ') : 'all 8'}`);
  const screen = screenBox(tiles);
  console.log(`  target:          ${outPath.slice(REPO_ROOT.length + 1)} at ${canvas.w}x${canvas.h}`);
  if (!raster) {
    console.log(`  design grid:     ${grid.w}x${grid.h} viewBox units`
      + (grid.w === canvas.w && grid.h === canvas.h ? ' (canvas)' : ` (${(canvas.w / grid.w).toFixed(0)}x oversampled)`));
  }
  console.log(`  on screen (FAR): ${screen.w.toFixed(1)}x${screen.h.toFixed(1)} px from ${tiles.w}x${tiles.h} tiles`);

  if (args.dryRun) {
    console.log(`\ndry run — not invoking codex. To run it yourself:\n  ${printable}`);
    process.exit(0);
  }

  const probe = spawnSync('codex', ['--version'], { encoding: 'utf8' });
  if (probe.error || probe.status !== 0) {
    console.error(
      `\ncodex CLI unavailable (${probe.error ? probe.error.code : `exit ${probe.status}`}).\n` +
      `The spec is written and the rest of the pipeline does not need codex.\n` +
      `When it is available:\n  ${printable}`
    );
    process.exit(3);
  }
  console.log(`  codex:           ${probe.stdout.trim()}`);

  if (existsSync(outPath) && !args.force) {
    console.error(`\n${outPath.slice(REPO_ROOT.length + 1)} already exists — pass --force to overwrite`);
    process.exit(1);
  }

  console.log(`\nrunning: ${printable}\n`);
  const run = spawnSync('codex', codexArgs, {
    input: spec,
    encoding: 'utf8',
    stdio: ['pipe', 'inherit', 'inherit'],
    cwd: REPO_ROOT,
  });
  if (run.error || run.status !== 0) {
    console.error(`\ncodex exec failed (${run.error ? run.error.message : `exit ${run.status}`})`);
    process.exit(1);
  }

  if (!existsSync(lastMsgPath)) {
    console.error(`\ncodex wrote no final message to ${lastMsgPath.slice(REPO_ROOT.length + 1)}`);
    process.exit(1);
  }
  const reply = readFileSync(lastMsgPath, 'utf8');
  const body = raster ? extractRecipe(reply) : extractSvg(reply);
  if (!body) {
    console.error(
      `\nno ${raster ? 'js module with an exported render()' : '<svg> element'} in codex's reply — left at ` +
      `${lastMsgPath.slice(REPO_ROOT.length + 1)} for inspection.\n` +
      `The spec asks for exactly one fenced ${raster ? 'js' : 'svg'} block; a model that answered in prose needs a ` +
      're-run, not a parser fix.'
    );
    process.exit(1);
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${body.trim()}\n`, 'utf8');
  console.log(`\nwrote ${outPath.slice(REPO_ROOT.length + 1)} (${body.length} bytes)`);

  if (raster) {
    // The same static scan render.mjs and check.mjs run, applied here so a
    // recipe that reached for Math.random or an import is named immediately
    // rather than at render time. Reported, not repaired: this file never
    // rewrites what a generator wrote.
    const scan = scanRecipe(body, { label: outPath.slice(REPO_ROOT.length + 1) });
    if (scan.errors.length) {
      console.log('\nthe recipe does not satisfy the contract — it will be REJECTED by render.mjs:');
      for (const e of scan.errors) console.log(`  - ${e}`);
      console.log('  re-run the ask (the spec states every one of these rules); do not hand-patch the recipe silently.');
    } else {
      console.log(`  contract ok: meta.seed ${scan.meta.seed}, roles [${scan.meta.roles.join(', ')}]`);
    }
  }

  console.log('nothing here judged the art or the palette. Next:');
  if (raster) {
    console.log(`  node tools/assets/render.mjs assets/generated/${args.category}/${args.id}.recipe.js`);
  } else {
    console.log(`  node tools/assets/rasterize.mjs assets/generated/${args.category}/${args.id}.svg --width ${canvas.w} --height ${canvas.h}`);
  }
  console.log(`  node tools/assets/check.mjs --write && node tools/assets/check.mjs`);
  console.log(`  node tools/assets/view.mjs assets/generated/${args.category}/${args.id}.png --tiles ${tiles.h}`);
}

main();
