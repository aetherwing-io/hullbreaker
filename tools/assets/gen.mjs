#!/usr/bin/env node
// gen.mjs — fill the codex spec template, optionally run `codex exec`, keep the
// resolved spec as the record of what was asked for.
//
//   node tools/assets/gen.mjs --id vent-plate --category textures \
//     --brief "an armoured vent cover, four louvres, one broken" \
//     --roles rust-orange,ink --size 128 --boards 10,13
//
//   node tools/assets/gen.mjs ... --dry-run     write the spec, print the command, stop
//
// CODEX IS OPTIONAL, BY DESIGN. The rest of the pipeline (rasterize, check,
// view) never calls this file and works with codex absent or uninstalled: this
// is a way to *ask* for an SVG, not a step anything depends on. With codex
// missing, the spec is still written and the exact command to run later is
// printed, and the exit code is 3 (distinct from 2 usage / 1 failure) so a
// caller can tell "unavailable" from "went wrong".
//
// What this does NOT do: judge the art, retry until something passes, or write
// into assets/approved/. It writes one SVG into assets/generated/<category>/
// and tells you the two commands that put it through the gate.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROLES, CHROMATIC_ROLES, NEUTRAL_MAX_CHROMA } from './lib/palette.mjs';
import { CATEGORIES } from './lib/manifest.mjs';

const ASSETS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(ASSETS_DIR, '../..');
const TEMPLATE = join(ASSETS_DIR, 'codex', 'spec-template.md');

const RIG_TILES = 1.7;                    // CONFIG.player.height
const FAR_FRAC = 0.037;                   // RIG's screen-height fraction in the shipped FAR view
const REF_VIEWPORT_H = 800;               // the playtest harness's default viewport height

const HELP = `tools/assets/gen.mjs — build a codex spec for one asset, and optionally run it

  node tools/assets/gen.mjs --id <kebab-id> --category <${CATEGORIES.join('|')}> --brief "<what to draw>" [options]

  --roles <a,b>      role ids the asset may use (default: all)
  --size <n>         square canvas, power of two (default 128)
  --tiles <n>        the asset's height in world tiles, for the scale note (default 0.55)
  --boards <n,m>     concept board numbers to attach as references (default 10,13)
  --model <name>     passed through to codex -m
  --dry-run          write the spec and print the command; do not invoke codex
  --spec-out <file>  where to write the resolved spec (default tools/assets/runs/spec-<id>.md)
  --force            overwrite an existing SVG for this id`;

function parseArgs(argv) {
  const a = {
    id: null, category: null, brief: null, roles: null, size: 128, tiles: 0.55,
    boards: '10,13', model: null, dryRun: false, specOut: null, force: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--id') a.id = argv[++i];
    else if (t === '--category') a.category = argv[++i];
    else if (t === '--brief') a.brief = argv[++i];
    else if (t === '--roles') a.roles = argv[++i];
    else if (t === '--size') a.size = Number(argv[++i]);
    else if (t === '--tiles') a.tiles = Number(argv[++i]);
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

function scaleNote(tiles) {
  const px = (FAR_FRAC * REF_VIEWPORT_H * tiles) / RIG_TILES;
  return `This asset stands ${tiles} tiles tall in the world. The shipped default camera (FAR, per ` +
    `docs/decisions.md entry 7) renders RIG — 1.7 tiles — at 3.7% of screen height, so on a ` +
    `1280x800 screen this asset is about **${px.toFixed(1)} pixels tall**, next to a ${(FAR_FRAC * REF_VIEWPORT_H).toFixed(0)}px RIG. ` +
    'Judge every decision at that size.';
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
  if (!Number.isInteger(args.size) || (args.size & (args.size - 1)) !== 0) {
    console.error(`--size must be a power of two, got ${args.size}`);
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

  const boards = boardFiles(args.boards);
  const spec = readFileSync(TEMPLATE, 'utf8')
    .replace(/<!--[\s\S]*?-->\n?/, '')                    // the template's own authoring notes
    .replaceAll('{{ID}}', args.id)
    .replaceAll('{{CATEGORY}}', args.category)
    .replaceAll('{{BRIEF}}', args.brief)
    .replaceAll('{{SIZE}}', String(args.size))
    .replaceAll('{{ROLES}}', allowed ? allowed.join(', ') : ROLES.map((r) => r.id).join(', '))
    .replaceAll('{{PALETTE}}', paletteTable(allowed))
    .replaceAll('{{BOARDS}}', boards.length ? boards.map((b) => b.slice(REPO_ROOT.length + 1)).join(', ') : 'none attached')
    .replaceAll('{{SCALE_NOTE}}', scaleNote(args.tiles));

  const specPath = resolve(REPO_ROOT, args.specOut || `tools/assets/runs/spec-${args.id}.md`);
  mkdirSync(dirname(specPath), { recursive: true });
  writeFileSync(specPath, spec, 'utf8');

  const svgPath = resolve(REPO_ROOT, `assets/generated/${args.category}/${args.id}.svg`);
  const lastMsgPath = resolve(REPO_ROOT, `tools/assets/runs/codex-last-${args.id}.md`);

  const codexArgs = ['exec', '--skip-git-repo-check', '-s', 'read-only', '-o', lastMsgPath];
  for (const b of boards) codexArgs.push('-i', b);
  if (args.model) codexArgs.push('-m', args.model);
  codexArgs.push('-');                                    // read the spec from stdin

  const printable = `codex ${codexArgs.join(' ')} < ${specPath}`;

  console.log(`spec written: ${specPath.slice(REPO_ROOT.length + 1)} (${spec.length} bytes)`);
  console.log(`  boards attached: ${boards.length ? boards.map((b) => b.split('/').pop()).join(', ') : 'none'}`);
  console.log(`  roles allowed:   ${allowed ? allowed.join(', ') : 'all 8'}`);
  console.log(`  target:          ${svgPath.slice(REPO_ROOT.length + 1)} at ${args.size}x${args.size}`);

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

  if (existsSync(svgPath) && !args.force) {
    console.error(`\n${svgPath.slice(REPO_ROOT.length + 1)} already exists — pass --force to overwrite`);
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
  const svg = extractSvg(readFileSync(lastMsgPath, 'utf8'));
  if (!svg) {
    console.error(
      `\nno <svg> element in codex's reply — left at ${lastMsgPath.slice(REPO_ROOT.length + 1)} for inspection.\n` +
      'The spec asks for exactly one fenced svg block; a model that answered in prose needs a re-run, not a parser fix.'
    );
    process.exit(1);
  }

  mkdirSync(dirname(svgPath), { recursive: true });
  writeFileSync(svgPath, `${svg.trim()}\n`, 'utf8');
  console.log(`\nwrote ${svgPath.slice(REPO_ROOT.length + 1)} (${svg.length} bytes)`);
  console.log('nothing here judged the art or the palette. Next:');
  console.log(`  node tools/assets/rasterize.mjs assets/generated/${args.category}/${args.id}.svg --size ${args.size}`);
  console.log(`  node tools/assets/check.mjs --write && node tools/assets/check.mjs`);
  console.log(`  node tools/assets/view.mjs assets/generated/${args.category}/${args.id}.png --tiles ${args.tiles}`);
}

main();
