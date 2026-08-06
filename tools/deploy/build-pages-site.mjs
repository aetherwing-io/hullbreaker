#!/usr/bin/env node
/*
 * Build the GitHub Pages directory from an already verified HULLBREAKER zip.
 *
 * GitHub Pages controls cache headers.  A freshly fetched index.html can
 * therefore coexist with an older, still-fresh /src/*.js response in a warm
 * browser cache.  ES modules are all-or-nothing and that version skew has
 * already produced both blank boots and a visibly stale HUD.
 *
 * The Pages artifact fixes the cause instead of asking players to reload:
 * every release gets a commit-addressed module namespace,
 *
 *   releases/<commit>/src/main.js
 *
 * and every relative import stays inside that namespace.  index.html names
 * the namespace explicitly.  A new document can never reuse an older
 * release's module URL. A short tail of earlier v* module graphs on the
 * first-parent release line is retained so a cached older document continues
 * to boot during a rollout.
 * Assets remain shared at /assets: their filenames are already versioned and
 * they are not part of ES-module linking.  The source copies adjust only the
 * ../../assets/ literals needed by the two extra URL path segments.
 *
 * This is a Pages-only packaging transform.  build-bundle.mjs remains the
 * verbatim itch.io zip builder.
 */

import { execFileSync } from 'node:child_process';
import {
  access, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { homedir } from 'node:os';
import { dirname, join, parse as parsePath, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const RELEASE_DIR = 'releases';
const LEGACY_UNSCOPED_REF = 'v0.1.0';
const CUSTOM_DOMAIN = 'hullbreaker.app';
const PRUNED_ASSET_RE = /\/(?:review[^/]*|source[^/]*|[^/]*-sources)\//;

function parseArgs(argv) {
  const opt = { zip: null, ref: 'HEAD', out: null, retainTags: 4, retainRefs: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--zip') opt.zip = resolve(argv[++i]);
    else if (a.startsWith('--zip=')) opt.zip = resolve(a.slice(6));
    else if (a === '--ref') opt.ref = argv[++i];
    else if (a.startsWith('--ref=')) opt.ref = a.slice(6);
    else if (a === '--out') opt.out = resolve(argv[++i]);
    else if (a.startsWith('--out=')) opt.out = resolve(a.slice(6));
    else if (a === '--retain-tags') opt.retainTags = Number(argv[++i]);
    else if (a.startsWith('--retain-tags=')) opt.retainTags = Number(a.slice(14));
    else if (a === '--retain-ref') opt.retainRefs.push(argv[++i]);
    else if (a.startsWith('--retain-ref=')) opt.retainRefs.push(a.slice(13));
    else if (a === '--help' || a === '-h') opt.help = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  return opt;
}

const HELP = `Build a cache-consistent GitHub Pages site from the verified zip.

  node tools/deploy/build-pages-site.mjs \\
    --zip hullbreaker-web.zip --ref HEAD --out /tmp/hullbreaker-pages

Options:
  --zip FILE          verified bundle produced by build-bundle.mjs (required)
  --ref REF           release commit/ref represented by the zip (default HEAD)
  --out DIR           empty/replaced Pages site directory (required)
  --retain-tags N     retain N preceding tagged module graphs (default 4)
  --retain-ref REF    retain one additional graph (repeatable; local testing)
`;

function gitText(args, { quiet = false } = {}) {
  return execFileSync('git', args, {
    cwd: REPO,
    encoding: 'utf8',
    stdio: quiet ? ['ignore', 'pipe', 'ignore'] : ['ignore', 'pipe', 'inherit'],
  }).trim();
}

function commitFor(ref) {
  return gitText(['rev-parse', `${ref}^{commit}`], { quiet: true });
}

function safeRevision(commit) {
  if (!/^[0-9a-f]{40}$/i.test(commit)) {
    throw new Error(`ref did not resolve to a full commit id: ${commit}`);
  }
  return commit.toLowerCase();
}

function assertSafeOutput(path) {
  const root = parsePath(path).root;
  const exactForbidden = new Set([
    root, REPO, homedir(), resolve(tmpdir()), resolve('/tmp'), resolve('/private/tmp'), resolve('/var/tmp'),
  ]);
  const isRepoAncestor = REPO.startsWith(path + sep);
  if (exactForbidden.has(path) || isRepoAncestor || dirname(path) === path) {
    throw new Error(
      `refusing unsafe --out '${path}'. Choose a specific child directory, never a filesystem/temp/home ` +
      'root, the repository root, or an ancestor of the repository.',
    );
  }
}

function taggedAncestors(commit, limit) {
  if (!Number.isInteger(limit) || limit < 0 || limit > 20) {
    throw new Error('--retain-tags must be an integer from 0 through 20');
  }
  if (limit === 0) return [];
  const firstParent = new Set(gitText(
    ['rev-list', '--first-parent', commit], { quiet: true },
  ).split('\n').filter(Boolean));
  const refs = gitText([
    'for-each-ref', `--merged=${commit}`, '--sort=-creatordate',
    '--format=%(refname)', 'refs/tags/v*',
  ], { quiet: true }).split('\n').filter(Boolean);
  const seen = new Set([commit]);
  const out = [];
  for (const ref of refs) {
    const taggedCommit = safeRevision(commitFor(ref));
    if (seen.has(taggedCommit)) continue;
    if (!firstParent.has(taggedCommit)) continue;
    seen.add(taggedCommit);
    out.push({ ref, commit: taggedCommit });
    if (out.length >= limit) break;
  }
  return out;
}

function assetBlobs(ref) {
  const listing = gitText([
    'ls-tree', '-r', ref, '--', 'assets/generated', 'assets/ui/favicon.svg',
  ], { quiet: true });
  const out = new Map();
  for (const line of listing.split('\n').filter(Boolean)) {
    const match = line.match(/^\d+\s+blob\s+([0-9a-f]+)\t(.+)$/);
    if (!match) continue;
    const [, blob, path] = match;
    if (PRUNED_ASSET_RE.test(path)) continue;
    if (!/\.(?:png|webp|svg)$/i.test(path)) continue;
    out.set(path, blob);
  }
  return out;
}

export function findAssetConflicts(entries) {
  const byPath = new Map();
  for (const entry of entries) {
    for (const [path, blob] of entry.assets) {
      let variants = byPath.get(path);
      if (!variants) byPath.set(path, variants = new Map());
      let refs = variants.get(blob);
      if (!refs) variants.set(blob, refs = []);
      refs.push(entry.ref);
    }
  }

  // Compare the complete relation before writing any retained file. This
  // catches the subtle case where current deleted a pathname but two older
  // retained releases published different bytes at that same shared URL.
  const conflicts = [];
  for (const [path, variants] of byPath) {
    if (variants.size <= 1) continue;
    conflicts.push({ path, variants: [...variants].map(([blob, refs]) => ({ blob, refs })) });
  }
  return { byPath, conflicts };
}

async function enforceSharedAssetImmutability(currentRef, retainedEntries, siteRoot, scratch) {
  const entries = [
    { ref: currentRef, commit: safeRevision(commitFor(currentRef)), current: true },
    ...retainedEntries.map((entry) => ({ ...entry, current: false })),
  ];
  for (const entry of entries) entry.assets = assetBlobs(entry.ref);
  const { byPath, conflicts } = findAssetConflicts(entries);
  if (conflicts.length) {
    const detail = conflicts.slice(0, 8).map(({ path, variants }) =>
      `  ${path}: ` + variants.map(({ blob, refs }) =>
        `${blob.slice(0, 10)} in ${refs.join(', ')}`).join(' | ')).join('\n');
    throw new Error(
      `shared runtime asset pathnames map to different bytes across the current and retained release set.\n` +
      `${detail}${conflicts.length > 8 ? `\n  ...and ${conflicts.length - 8} more` : ''}\n` +
      'Give changed art a new versioned filename before deploying; every retained document must interpret ' +
      'one shared asset URL as exactly one immutable blob.',
    );
  }

  const current = entries[0].assets;
  const restoreByRef = new Map();
  for (const [path] of byPath) {
    if (current.has(path)) continue;
    const source = entries.slice(1).find((entry) => entry.assets.has(path));
    if (!source) throw new Error(`internal asset-union error: no source for ${path}`);
    let paths = restoreByRef.get(source.ref);
    if (!paths) restoreByRef.set(source.ref, paths = []);
    paths.push(path);
  }

  let restored = 0;
  for (const [ref, paths] of restoreByRef) {
    const commit = safeRevision(commitFor(ref));
    const archive = join(scratch, `assets-${commit.slice(0, 12)}.tar`);
    execFileSync('git', ['archive', '--format=tar', `--output=${archive}`, ref, '--', ...paths], {
      cwd: REPO,
      stdio: 'inherit',
    });
    execFileSync('tar', ['-xf', archive, '-C', siteRoot], { stdio: 'inherit' });
    await rm(archive, { force: true });
    restored += paths.length;
  }
  return { currentPaths: current.size, restoredPaths: restored, comparedRefs: entries.length };
}

async function walkFiles(root) {
  const out = [];
  async function visit(dir) {
    for (const ent of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, ent.name);
      if (ent.isDirectory()) await visit(path);
      else if (ent.isFile()) out.push(path);
    }
  }
  await visit(root);
  return out;
}

async function rewriteScopedSource(srcDir) {
  let files = 0;
  let assetLiterals = 0;
  for (const path of await walkFiles(srcDir)) {
    if (!path.endsWith('.js')) continue;
    const before = await readFile(path, 'utf8');
    const matches = before.match(/\.\.\/\.\.\/assets\//g);
    const after = before.replaceAll('../../assets/', '../../../../assets/');
    if (after !== before) await writeFile(path, after);
    files += 1;
    assetLiterals += matches ? matches.length : 0;
  }
  return { files, assetLiterals };
}

function releaseDocument(html, revision) {
  const mainRe = /(<script\s+type=["']module["']\s+src=["'])src\/main\.js(["']\s*>)/;
  if (!mainRe.test(html)) {
    throw new Error('index.html no longer contains the expected src/main.js module script');
  }
  let out = html.replace(mainRe, `$1${RELEASE_DIR}/${revision}/src/main.js$2`);
  const marker = `<meta name="hullbreaker-build" content="${revision}">`;
  if (!out.includes('</head>')) throw new Error('index.html has no </head> insertion point');
  out = out.replace('</head>', `${marker}\n</head>`);
  return out;
}

async function archiveRef(ref, destination) {
  const archive = join(dirname(destination), `source-${Math.random().toString(16).slice(2)}.tar`);
  execFileSync('git', ['archive', '--format=tar', `--output=${archive}`, ref, '--', 'index.html', 'src'], {
    cwd: REPO,
    stdio: 'inherit',
  });
  await mkdir(destination, { recursive: true });
  execFileSync('tar', ['-xf', archive, '-C', destination], { stdio: 'inherit' });
  await rm(archive, { force: true });
}

async function installReleaseSource(sourceRoot, siteRoot, revision) {
  const releaseRoot = join(siteRoot, RELEASE_DIR, revision);
  await mkdir(releaseRoot, { recursive: true });
  await cp(join(sourceRoot, 'src'), join(releaseRoot, 'src'), { recursive: true });
  const stats = await rewriteScopedSource(join(releaseRoot, 'src'));
  const html = await readFile(join(sourceRoot, 'index.html'), 'utf8');
  await writeFile(join(releaseRoot, 'root-document.html'), releaseDocument(html, revision));
  return stats;
}

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  if (opt.help) { process.stdout.write(HELP); return; }
  if (!opt.zip || !opt.out) {
    process.stderr.write(`${HELP}\nerror: --zip and --out are required\n`);
    process.exitCode = 2;
    return;
  }
  await access(opt.zip);
  assertSafeOutput(opt.out);
  const revision = safeRevision(commitFor(opt.ref));
  const scratch = await mkdtemp(join(tmpdir(), 'hb-pages-build-'));

  try {
    await rm(opt.out, { recursive: true, force: true });
    await mkdir(opt.out, { recursive: true });
    execFileSync('unzip', ['-q', opt.zip, '-d', opt.out], { stdio: 'inherit' });

    const currentSource = join(scratch, 'current');
    await mkdir(currentSource, { recursive: true });
    await cp(join(opt.out, 'index.html'), join(currentSource, 'index.html'));
    await cp(join(opt.out, 'src'), join(currentSource, 'src'), { recursive: true });

    const currentStats = await installReleaseSource(currentSource, opt.out, revision);
    const currentDocument = await readFile(
      join(opt.out, RELEASE_DIR, revision, 'root-document.html'), 'utf8',
    );
    await writeFile(join(opt.out, 'index.html'), currentDocument);

    const retained = taggedAncestors(revision, opt.retainTags);
    const retainedCommits = new Set([revision, ...retained.map((entry) => entry.commit)]);
    for (const ref of opt.retainRefs) {
      const commit = safeRevision(commitFor(ref));
      if (retainedCommits.has(commit)) continue;
      retainedCommits.add(commit);
      retained.push({ ref, commit });
    }
    for (const old of retained) {
      const sourceRoot = join(scratch, old.commit);
      await archiveRef(old.ref, sourceRoot);
      old.stats = await installReleaseSource(sourceRoot, opt.out, old.commit);
    }

    // v0.1.0 was the last unscoped deployment.  Keep its exact /src graph at
    // that legacy URL permanently so even an unexpectedly long-lived cached
    // document can never combine it with a future release.
    let legacyUnscopedRevision = null;
    let legacyEntry = null;
    try {
      legacyUnscopedRevision = safeRevision(commitFor(LEGACY_UNSCOPED_REF));
      legacyEntry = { ref: LEGACY_UNSCOPED_REF, commit: legacyUnscopedRevision };
    } catch {
      // A pre-v0.1.0 checkout can still exercise this builder.  Its own source
      // is the only honest legacy graph available there.
      legacyUnscopedRevision = revision;
    }
    const legacyRoot = join(scratch, 'legacy-unscoped');
    if (legacyEntry) {
      await archiveRef(LEGACY_UNSCOPED_REF, legacyRoot);
      await rm(join(opt.out, 'src'), { recursive: true, force: true });
      await cp(join(legacyRoot, 'src'), join(opt.out, 'src'), { recursive: true });
    } else {
      await mkdir(legacyRoot, { recursive: true });
      await cp(join(currentSource, 'index.html'), join(legacyRoot, 'index.html'));
      await cp(join(currentSource, 'src'), join(legacyRoot, 'src'), { recursive: true });
    }
    await cp(join(legacyRoot, 'index.html'), join(opt.out, 'legacy-root-document.html'));

    const assetRefs = [...retained];
    if (legacyEntry && legacyEntry.commit !== revision &&
        !assetRefs.some((entry) => entry.commit === legacyEntry.commit)) {
      assetRefs.push(legacyEntry);
    }
    const assetStats = await enforceSharedAssetImmutability(
      opt.ref, assetRefs, opt.out, scratch,
    );
    const sharedAssetRefs = [
      { ref: opt.ref, commit: revision },
      ...assetRefs.map(({ ref, commit }) => ({ ref, commit })),
    ];

    await writeFile(join(opt.out, '.nojekyll'), '');
    // Keep the public identity in every immutable artifact as well as in the
    // repository Pages setting, so domain drift fails verification.
    await writeFile(join(opt.out, 'CNAME'), `${CUSTOM_DOMAIN}\n`);
    const manifest = {
      schema: 1,
      strategy: 'commit-scoped-es-modules',
      customDomain: CUSTOM_DOMAIN,
      current: revision,
      retained: retained.map(({ ref, commit }) => ({ ref, commit })),
      legacyUnscopedRevision,
      legacyUnscopedDocument: 'legacy-root-document.html',
      sourceFiles: currentStats.files,
      adjustedAssetLiterals: currentStats.assetLiterals,
      sharedAssets: {
        policy: 'same-path-same-bytes',
        currentPaths: assetStats.currentPaths,
        restoredRetainedPaths: assetStats.restoredPaths,
        comparedRefs: assetStats.comparedRefs,
        refs: sharedAssetRefs,
      },
    };
    await writeFile(join(opt.out, 'pages-release.json'), `${JSON.stringify(manifest, null, 2)}\n`);

    const relativeOut = opt.out.startsWith(REPO + sep) ? opt.out.slice(REPO.length + 1) : opt.out;
    console.log(`Pages site: ${relativeOut}`);
    console.log(`  current module namespace: ${RELEASE_DIR}/${revision}/src (${currentStats.files} JS files)`);
    console.log(`  retained tagged namespaces: ${retained.length}`);
    console.log(`  legacy /src pinned to: ${legacyUnscopedRevision}`);
    console.log(`  adjusted asset literals: ${currentStats.assetLiterals}`);
    console.log(`  shared runtime assets: ${assetStats.currentPaths} current, ${assetStats.restoredPaths} retained-only restored`);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(`build-pages-site: ${err && err.stack ? err.stack : err}`);
    process.exit(1);
  });
}
