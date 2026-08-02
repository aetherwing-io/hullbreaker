// verify-served.mjs — "what is that URL actually running?"
//
// WHY THIS EXISTS (T-050 / I-037). Every gate in this repo reads files off disk
// in Node. Nothing asserted that the build a PERSON IS LOOKING AT is the build
// on disk — and on 2026-08-02 that cost a night: T-045's scale pass was
// reported to the operator as live, `tools/pathcheck.mjs` was 2404/0, and the
// page in the browser was baking 829 pieces with zero of the pass's kinds,
// because the module it was executing was a pre-T-045 copy. The tree was
// innocent the whole time. Both mechanisms that produce that symptom are
// invisible from inside Node:
//
//   1. THE SERVER IS ROOTED ELSEWHERE — a pinned worktree from an earlier gate
//      (this repo keeps them under /private/tmp/hb-pin-*), so the URL serves an
//      older commit and every file is self-consistently old.
//   2. THE BROWSER IS EXECUTING CACHED BYTES — `python3 -m http.server` sends
//      no Cache-Control, so Chrome applies heuristic freshness and reuses
//      `src/*.js` (and index.html itself) without asking. Measured: with a warm
//      profile, a plain fresh navigation to the plain URL ran a 13,326-byte
//      pre-T-045 `src/pure/limb.js` while the server was rooted at a main
//      checkout whose copy is 25,319 bytes. A fresh load does NOT clear it; a
//      hard reload or a cold profile does.
//
// Both look identical from a console (`limbBakePlan(...)` returns the old
// plan), which is why the first move on "the shipped build renders nothing"
// should be this tool, not an edit.
//
// USAGE
//   node tools/playtest/verify-served.mjs http://127.0.0.1:8749
//   node tools/playtest/verify-served.mjs http://127.0.0.1:8749 --tree /path/to/worktree
//   node tools/playtest/verify-served.mjs http://127.0.0.1:8749 --profile ~/warm-chrome
//   node tools/playtest/verify-served.mjs http://127.0.0.1:8749 --json
//
//   --tree <dir>     the tree the URL is SUPPOSED to be serving (default: the
//                    repo this file lives in)
//   --profile <dir>  reuse a persistent browser profile — the only way to
//                    reproduce a warm-cache staleness; default is a cold
//                    profile, which by construction can never be stale
//   --query <qs>     query string for the page (default `?shell=0`)
//   --json           machine-readable report on stdout
//   --operator-port  required before this will touch :8741 or :8742, which
//                    belong to the operator (docs/LANE-BRIEF.md). The flag is
//                    not a permission — it exists so no agent probes those
//                    ports by reflex. Pointing it there is the operator's call.
//
// WHAT IT CHECKS
//   A. the page boots and exposes window.HB;
//   B. `HB.g1.pieces` — the length of the limb bake plan the page ACTUALLY
//      baked — equals the plan this tree bakes from the real generated level;
//   C. the page's own modules, re-imported in the page, still emit the scale
//      pass over the real groundH (the exact measurement I-037 reported);
//   D. for each watched file: bytes the browser used vs bytes the network
//      returns (`cache: 'reload'`) — a difference IS mechanism 2;
//   E. network bytes vs this tree's bytes on disk — a difference IS mechanism 1,
//      and the commit whose copy matches is named when one can be found.
//
// HONESTY / LIMITATIONS
//   - It only sees the files in WATCHED below plus the plan length. A stale
//     module outside that list is invisible to check D/E; the plan-length
//     check (B) is the broad net, because almost any stale render/pure module
//     changes it.
//   - A cold profile cannot be stale, so a PASS without `--profile` says
//     "this server serves this tree", not "the operator's browser is clean".
//     To answer the second question you must point it at the profile that
//     browser uses.
//   - It never writes to the tree and never touches the game; it is a reader.
//   - Byte counts from the page are JS string lengths (UTF-16 code units), so
//     they are compared against the same measurement of the local file, never
//     against `wc -c`.

import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(here, '..', '..');

const ARGV = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = ARGV.indexOf(name);
  return i >= 0 && ARGV[i + 1] ? ARGV[i + 1] : fallback;
};
const BASE = ARGV.find((a) => /^https?:\/\//.test(a));
const TREE = resolve(argOf('--tree', REPO));
const PROFILE = argOf('--profile', null);
const QUERY = argOf('--query', '?shell=0');
const JSON_OUT = ARGV.includes('--json');

// The files a stale copy of which has actually bitten this project, plus the
// document itself — which is cached too, so nothing shipped INSIDE the page can
// detect this (measured in T-050: the stale run served a 9,894-char document).
const WATCHED = [
  '/index.html',
  '/src/main.js',
  '/src/config.js',
  '/src/pure/limb.js',
  '/src/render/limb.js',
  '/src/sim/level.js',
];

if (!BASE) {
  console.error('usage: node tools/playtest/verify-served.mjs <base-url> [--tree dir] ' +
                '[--profile dir] [--query qs] [--json]');
  process.exit(2);
}
if (/:(8741|8742)(\/|$)/.test(BASE) && !ARGV.includes('--operator-port')) {
  console.error('FAIL  :8741 and :8742 are the operator\'s ports (docs/LANE-BRIEF.md).\n' +
                '      Re-run with --operator-port only if the operator asked for it.');
  process.exit(2);
}

/* ---- what THIS tree bakes, from the real generated level ---------------- */
const cfgMod = await import(pathToFileURL(join(TREE, 'src', 'config.js')).href);
const genMod = await import(pathToFileURL(join(TREE, 'src', 'pure', 'generator.js')).href);
const limbMod = await import(pathToFileURL(join(TREE, 'src', 'pure', 'limb.js')).href);
const CONFIG = cfgMod.CONFIG;
const groundH = genMod.buildLevel(CONFIG).groundH;
const expected = limbMod.limbBakePlan(CONFIG, groundH);
const expectedScale = expected.filter((p) => /^(mark|bd)/.test(p.kind)).length;

/* ---- what the URL is running -------------------------------------------- */
const tmpProfile = PROFILE ? null : mkdtempSync(join(tmpdir(), 'verify-served-'));
const ctx = await chromium.launchPersistentContext(PROFILE || tmpProfile, {
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  viewport: { width: 1280, height: 800 },
});
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message)));
// A dead port / wrong host is a FAIL with a sentence, not a stack trace: this
// tool is what someone reaches for when they already do not trust the URL.
try {
  await page.goto(BASE + '/index.html' + QUERY, { waitUntil: 'load' });
} catch (e) {
  await ctx.close();
  if (tmpProfile) rmSync(tmpProfile, { recursive: true, force: true });
  console.log(`FAIL  ${BASE}/index.html${QUERY}\n      ! nothing answered there: ` +
              String(e.message).split('\n')[0]);
  process.exit(1);
}
await page.waitForFunction(() => !!window.HB, null, { timeout: 20000 }).catch(() => {});

const seen = await page.evaluate(async (watched) => {
  const out = { hasHB: !!window.HB, docChars: document.documentElement.outerHTML.length, files: {} };
  out.pieces = window.HB && window.HB.g1 ? window.HB.g1.pieces : null;
  out.g1 = !!(window.HB && window.HB.g1);
  try {
    const { limbBakePlan } = await import('/src/pure/limb.js');
    const { CONFIG } = await import('/src/config.js');
    const { groundH } = await import('/src/sim/level.js');
    const plan = limbBakePlan(CONFIG, groundH);
    out.planLen = plan.length;
    out.scalePieces = plan.filter((p) => /^(mark|bd)/.test(p.kind)).length;
    out.hasSilhouette = plan.some((p) => p.kind === 'silhouette');
    out.bakeArity = limbBakePlan.length;
  } catch (e) { out.importError = String(e); }
  for (const f of watched) {
    const used = await fetch(f).then((r) => r.text()).then((t) => t.length).catch(() => null);
    const fresh = await fetch(f, { cache: 'reload' }).then((r) => r.text()).then((t) => t.length).catch(() => null);
    out.files[f] = { used, fresh };
  }
  return out;
}, WATCHED);
await ctx.close();
if (tmpProfile) rmSync(tmpProfile, { recursive: true, force: true });

/* ---- name the commit a served file came from, when git can ------------- */
function identify(relPath, chars) {
  try {
    const commits = execFileSync('git', ['-C', TREE, 'rev-list', '-n', '400', 'HEAD', '--', relPath],
      { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    for (const c of commits) {
      const blob = execFileSync('git', ['-C', TREE, 'show', `${c}:${relPath}`], { encoding: 'utf8' });
      if (blob.length === chars) return c.slice(0, 7);
    }
  } catch { /* not a git tree, or the path never existed there */ }
  return null;
}

/* ---- verdicts ----------------------------------------------------------- */
const problems = [];
const notes = [];

if (!seen.hasHB) problems.push('the page never exposed window.HB — it did not boot' +
  (pageErrors.length ? ' (first error: ' + pageErrors[0] + ')' : ''));
if (seen.importError) problems.push('the page could not re-import its own modules: ' + seen.importError);

if (seen.g1 && seen.pieces !== null) {
  if (seen.pieces !== expected.length) {
    problems.push(`the page baked ${seen.pieces} limb pieces; this tree bakes ` +
      `${expected.length} — the URL is NOT running this tree`);
  } else {
    notes.push(`limb bake plan matches this tree (${seen.pieces} pieces)`);
  }
} else {
  notes.push('no HB.g1 on this URL (a fixture, ?zip=1, or a pre-limb build): ' +
             'the plan-length check could not run');
}
if (seen.planLen !== undefined) {
  if (seen.scalePieces === 0 || seen.hasSilhouette) {
    problems.push(`the page's own modules emit ${seen.scalePieces} scale-pass pieces` +
      (seen.hasSilhouette ? ' and still carry `silhouette`' : '') +
      ` (arity ${seen.bakeArity}) — this is the I-037 fingerprint of a pre-T-045 limb.js`);
  } else if (seen.scalePieces !== expectedScale) {
    problems.push(`the page emits ${seen.scalePieces} scale-pass pieces; this tree emits ${expectedScale}`);
  } else {
    notes.push(`scale pass live in the page: ${seen.scalePieces} mark/backdrop pieces`);
  }
}

for (const [f, m] of Object.entries(seen.files)) {
  if (m.used === null || m.fresh === null) { problems.push(`${f}: could not be fetched`); continue; }
  if (m.used !== m.fresh) {
    const from = identify(f.replace(/^\//, ''), m.used);
    problems.push(`${f}: the browser used ${m.used} chars, the network returns ${m.fresh} — ` +
      'CACHED BYTES' + (from ? ` (matching commit ${from})` : '') +
      '. Hard-reload, or serve with `node tools/serve.mjs` from a cold profile.');
    continue;
  }
  const local = readFileSync(join(TREE, f.replace(/^\//, '')), 'utf8').length;
  if (local !== m.fresh) {
    const from = identify(f.replace(/^\//, ''), m.fresh);
    problems.push(`${f}: the server returns ${m.fresh} chars, this tree has ${local} — ` +
      'THE SERVER IS ROOTED ON ANOTHER TREE' + (from ? ` (matching commit ${from})` : ''));
  }
}

const verdict = problems.length === 0 ? 'PASS' : 'FAIL';
if (JSON_OUT) {
  console.log(JSON.stringify({ verdict, url: BASE + '/index.html' + QUERY, tree: TREE,
    profile: PROFILE || '(cold)', expected: { pieces: expected.length, scalePieces: expectedScale },
    seen, problems, notes }, null, 2));
} else {
  console.log(`${verdict}  ${BASE}/index.html${QUERY}`);
  console.log(`      tree ${TREE}${PROFILE ? `  profile ${PROFILE}` : '  (cold profile)'}`);
  for (const n of notes) console.log(`      · ${n}`);
  for (const p of problems) console.log(`      ! ${p}`);
}
process.exit(problems.length ? 1 : 0);
