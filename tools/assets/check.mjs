#!/usr/bin/env node
// check.mjs — the asset gate. Zero dependencies, no browser, no network.
//
//   node tools/assets/check.mjs            validate everything, exit non-zero on failure
//   node tools/assets/check.mjs --write    recompute the manifest's derived fields in place
//   node tools/assets/check.mjs --json     machine-readable report on stdout
//   node tools/assets/check.mjs --selftest only prove the palette rule can fail, then exit
//
// What it enforces, in order:
//   0. the palette rule is coherent and can actually reject a color (--selftest,
//      which also runs as part of a normal check — a gate nobody has proven can
//      fail is not a gate)
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

import { histogram, readPngSize } from './lib/png.mjs';
import { extractSvgColors, readSvgSize } from './lib/svg.mjs';
import { ROLES, NEUTRAL_MAX_CHROMA, checkColors, classify } from './lib/palette.mjs';
import { loadManifest, saveManifest, validateEntryShape, isPowerOfTwo, MANIFEST_PATH } from './lib/manifest.mjs';

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
 * --------------------------------------------------------------------- */
function paletteOfFile(absPath, { minCoverage }) {
  const ext = extname(absPath).toLowerCase();
  if (ext === '.png') {
    const hist = histogram(absPath, { alphaFloor: 8 });
    const entries = hist.colors.map((c) => ({ color: { r: c.r, g: c.g, b: c.b }, coverage: c.coverage, count: c.count }));
    const gated = checkColors(entries, { minCoverage });
    const ungated = checkColors(entries, { minCoverage: 0 });
    return {
      kind: 'raster',
      ...gated,
      uniqueColors: hist.unique,
      transparentPixels: hist.transparent,
      // Blends below the gate are reported rather than hidden: if a real
      // off-palette accent is small enough to slip under the threshold, this
      // line is where it shows up.
      ungatedOffPalette: ungated.offPalette
        .filter((c) => c.coverage < minCoverage)
        .slice(0, 5)
        .map((c) => ({ hex: c.hex, coverage: c.coverage, hue: c.lch.h })),
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
 * 6. The game must not hard-depend on any of this.
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
  const srcDir = join(root, 'src');
  if (!existsSync(srcDir)) return { errs, info };
  const importRe = /^\s*import\s[^\n]*?['"]([^'"]*assets\/[^'"]*)['"]/gm;
  for (const file of walkJs(srcDir)) {
    const text = readFileSync(file, 'utf8');
    const rel = file.slice(root.length + 1);
    for (const m of text.matchAll(importRe)) {
      errs.push(
        `${rel}: static import of "${m[1]}" makes an asset a hard dependency — ` +
        'the game must boot with every asset file missing (asset-artist standing orders). ' +
        'Load through the render/ui layer at runtime with a fallback instead.'
      );
    }
    if (/assets\//.test(text)) {
      const lines = text.split('\n')
        .map((l, i) => ({ l, i: i + 1 }))
        .filter(({ l }) => /assets\//.test(l) && !/^\s*(\/\/|\*)/.test(l));
      for (const { l, i } of lines) info.push(`${rel}:${i}: runtime asset reference — ${l.trim().slice(0, 90)}`);
    }
  }
  return { errs, info };
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
    selftest: { cases: SELFTEST.pass.length + SELFTEST.fail.length, failures: [] },
    errors: [],
    warnings: [],
    assets: [],
    gameIndependence: { errors: [], references: [] },
  };

  report.selftest.failures = runSelftest();
  report.errors.push(...report.selftest.failures);

  if (args.selftest) {
    const ok = report.selftest.failures.length === 0;
    console.log(ok
      ? `selftest PASS — ${report.selftest.cases} palette cases (${SELFTEST.pass.length} must-pass, ${SELFTEST.fail.length} must-fail)`
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

        // --- the vector source, if one is declared ---
        if (entry.source) {
          const srcAbs = join(args.root, entry.source);
          if (!existsSync(srcAbs)) {
            errs.push(`${entry.id}: declared source not found: ${entry.source}`);
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
  console.log(`  palette: ${report.roleBudget.declared}/${report.roleBudget.budget} roles, neutral floor chroma ${report.roleBudget.neutralMaxChroma}, selftest ${report.selftest.cases} cases ${report.selftest.failures.length ? 'FAILED' : 'ok'}`);
  console.log(`  manifest: ${report.assets.length} asset${report.assets.length === 1 ? '' : 's'}`);
  for (const a of report.assets) {
    const size = a.actualSize ? `${a.actualSize.w}x${a.actualSize.h}` : '?';
    const roles = a.palette ? a.palette.roles.map((r) => `${r.id} ${(r.coverage * 100).toFixed(0)}%`).join(', ') : '';
    const bytes = a.bytes ? `, ${(a.bytes / 1024).toFixed(1)}kB` : '';
    console.log(`    ${a.errors.length ? 'FAIL' : 'ok  '} ${a.id}  ${size}${bytes}  ${roles}`);
    if (a.palette?.ungatedOffPalette?.length) {
      const u = a.palette.ungatedOffPalette;
      console.log(`         note: ${u.length} antialias/blend color${u.length === 1 ? '' : 's'} below the ${(report.minCoverage * 100).toFixed(1)}% gate, largest ${u[0].hex} at ${(u[0].coverage * 100).toFixed(2)}%`);
    }
  }
  if (report.gameIndependence.references.length) {
    console.log(`  game references to assets/ (runtime, not imports): ${report.gameIndependence.references.length}`);
    for (const r of report.gameIndependence.references) console.log(`    ${r}`);
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
