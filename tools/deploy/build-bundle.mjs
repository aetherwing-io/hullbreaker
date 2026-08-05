#!/usr/bin/env node
// build-bundle.mjs — produce the exact zip itch.io serves as-is, and the
// browser-verified content input for GitHub Pages. Pages adds a commit-scoped
// module namespace with build-pages-site.mjs so warm caches cannot mix code
// revisions; it does not alter the itch.io zip.
//
// WHAT THIS DOES. HULLBREAKER has no build step: the shipped game is
// `index.html` + `src/**` + the runtime art under `assets/generated/**`,
// unmodified, exactly as committed. This script does not transform,
// minify, or bundle anything — it packages the tracked files a browser
// actually fetches (index.html, the favicon it links, every src/**/*.js
// the import graph reaches, three.js from the CDN, and the PNGs
// `src/render/` and `src/pure/rig.js` load from `assets/generated/**` at
// runtime — see "Why assets/generated/ is in the pathspec" below) into a
// single zip with `index.html` at the zip's ROOT, which is what itch.io's
// uploader expects for a "played in browser" project.
//
// It shells out to `git archive --format=zip`, so the zip always matches a
// real commit (never a working-tree file the operator forgot to save) and
// contains only files git tracks (no scratch artifacts, no reports, no
// .claude/, no node_modules). Zero new dependencies: git is already required
// to have this repo at all.
//
// WHY assets/generated/ IS IN THE PATHSPEC, AND assets/approved/ +
// assets/manifest.json ARE NOT (T-055, fixing I-048). Every runtime asset
// reference in src/ (grepped across src/config.js, src/render/backdrop.js,
// src/render/materials.js, src/render/sprite-table.js, src/render/sprites.js,
// src/render/player.js, src/pure/rig.js) resolves under
// `assets/generated/{backdrops,textures,sprites}/` — never under
// `assets/approved/` or `assets/manifest.json`. `assets/approved/` is the
// operator's own promotion directory (tools/assets/README.md: "nothing here
// writes to it") and today holds nothing but a `.gitkeep`; `assets/
// manifest.json` is asset-pipeline provenance bookkeeping that nothing in
// src/ loads. The `assets/generated/` subtree ships as a directory-level
// pathspec — not a curated list of just the files a static grep finds
// referenced today — because a per-file allowlist would silently drift out
// of sync with a future asset exactly the way the old index.html/src-only
// pathspec silently drifted out of sync with decisions.md entry 16.
//
// ONE NAMING CONVENTION IS PRUNED (2026-08-04, for the GitHub Pages
// deploy): any path segment under assets/generated/ that starts with
// `review` or `source`, or ends with `-sources`. Those directories hold
// asset-PIPELINE intermediates — enemy-ecology review boards, VFX source
// sheets, the foreground pack's ~17 MB of sources — that no runtime code
// fetches; by 2026-08 they were 86 tracked files, ~92 MB, more than half
// the bundle. The convention is safe because it is a convention, not a
// guess: that day, all 31 asset paths referenced from src/ and index.html
// were checked against it and none match. The drift risk now runs the
// other way — a FUTURE runtime asset dropped into a `source-*` directory
// would silently vanish from the bundle — and that is exactly what
// verify-bundle.mjs exists to catch loudly: it boots the zipped game and
// asserts the art renders. A `*contact*` prune was considered and rejected
// the same day: sprites/rig-run-contact-v1.png is a real sprite-family
// file whose name matches it. What still ships as deliberate dead weight:
// source .svg files, .recipe.js generation recipes, a few
// staged-but-unloaded glyph/HUD PNGs, and the ~7 MB action-vfx-v2 contact
// sheet. The cost of the directory-level choice stays concrete and stated,
// in exchange for never being the reason a shipped asset is missing again.
//
// Usage:
//   node tools/deploy/build-bundle.mjs                # writes ./hullbreaker-web.zip
//   node tools/deploy/build-bundle.mjs --out path.zip  # custom output path
//   node tools/deploy/build-bundle.mjs --ref <commit>  # archive a specific
//                                                       # commit/branch instead
//                                                       # of the current HEAD
//
// This tool has ZERO effect on the shipped game: it only reads committed
// files and writes a zip file outside of src/.

import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

// What a browser actually needs, fetched by git pathspec. Keep this list and
// the header comment above in sync — this is the one place I-048's fix lives.
// assets/ui/favicon.svg ships because index.html links it (a missing icon is
// a real 404 on a static host); the rest of assets/ outside generated/ is
// pipeline bookkeeping nothing fetches.
const ARCHIVE_PATHS = ['index.html', 'src', 'assets/generated', 'assets/ui/favicon.svg'];

// The pruned pipeline-intermediate directories (see the header comment):
// path segments that start with `review` or `source`, or end with
// `-sources`. git ls-tree does NOT support :(exclude) pathspec magic, so the
// guards below deliberately run against the UNFILTERED list — they verify
// the ref contains the game at all, and the prune must never be what
// empties it. EXCLUDE_RE mirrors EXCLUDE_PATHSPECS for the build summary;
// keep the two in sync.
const EXCLUDE_PATHSPECS = [
  ':(exclude)assets/generated/**/review*/**',
  ':(exclude)assets/generated/**/source*/**',
  ':(exclude)assets/generated/**/*-sources/**',
];
const EXCLUDE_RE = /\/(?:review[^/]*|source[^/]*|[^/]*-sources)\//;

function parseArgs(argv) {
  const opts = { out: 'hullbreaker-web.zip', ref: 'HEAD' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--out') opts.out = argv[++i];
    else if (a.startsWith('--out=')) opts.out = a.slice(6);
    else if (a === '--ref') opts.ref = argv[++i];
    else if (a.startsWith('--ref=')) opts.ref = a.slice(6);
    else throw new Error(`unknown argument: ${a}`);
  }
  return opts;
}

const HELP = `Build the static-host zip for HULLBREAKER (index.html + src/ +
assets/ui/favicon.svg + assets/generated/ minus review/source pipeline
intermediates, verbatim).

  node tools/deploy/build-bundle.mjs [--out FILE] [--ref REF]

Defaults: --out hullbreaker-web.zip (relative to cwd), --ref HEAD.
See tools/deploy/README.md for the itch.io upload walkthrough.
`;

const opts = parseArgs(process.argv.slice(2));
if (opts.help) { process.stdout.write(HELP); process.exit(0); }

const outPath = resolve(opts.out);

// Confirm the ref actually contains index.html, src/ and assets/generated/
// before archiving — a typo'd --ref, or a ref from before the art landed,
// would otherwise silently produce an empty, wrong, or art-less zip (I-048).
let lsOutput;
try {
  lsOutput = execFileSync(
    'git', ['ls-tree', '-r', '--name-only', opts.ref, '--', ...ARCHIVE_PATHS],
    { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  );
} catch {
  console.error(`could not read ref '${opts.ref}' — not a valid commit/branch in this repo.`);
  process.exit(1);
}
const files = lsOutput.split('\n').filter(Boolean);
if (!files.some((f) => f === 'index.html')) {
  console.error(`'${opts.ref}' has no tracked index.html at repo root — refusing to build a broken bundle.`);
  process.exit(1);
}
const srcFiles = files.filter((f) => f.startsWith('src/'));
if (srcFiles.length === 0) {
  console.error(`'${opts.ref}' has no tracked files under src/ — refusing to build a broken bundle.`);
  process.exit(1);
}
const assetFiles = files.filter((f) => f.startsWith('assets/generated/') && f.endsWith('.png'));
if (assetFiles.length === 0) {
  console.error(`'${opts.ref}' has no tracked PNGs under assets/generated/ — refusing to build a bundle ` +
    `that would silently ship with none of the game's art (I-048). This ref predates the art landing ` +
    `(2026-08-02) or the tree has genuinely lost it; build from a ref that has assets/generated/ populated.`);
  process.exit(1);
}

execFileSync(
  'git', ['archive', '--format=zip', `--output=${outPath}`, opts.ref, '--',
    ...ARCHIVE_PATHS, ...EXCLUDE_PATHSPECS],
  { cwd: REPO_ROOT, stdio: 'inherit' },
);

const excludedFiles = files.filter((f) => f.startsWith('assets/generated/') && EXCLUDE_RE.test(f));
const size = existsSync(outPath) ? statSync(outPath).size : 0;
console.log(`\nWrote ${outPath} (${(size / 1048576).toFixed(1)} MiB, ${files.length - excludedFiles.length} shipped files, ` +
  `${excludedFiles.length} review/source intermediates pruned, ${assetFiles.length} PNGs tracked under assets/generated/, ref ${opts.ref}).`);
console.log('Contents: index.html at the zip root, plus src/**, assets/ui/favicon.svg, and assets/generated/** minus review/source intermediates.');
console.log('Upload this zip to itch.io; for Pages, pass it through build-pages-site.mjs. See tools/deploy/README.md.');
