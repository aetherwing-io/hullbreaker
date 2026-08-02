#!/usr/bin/env node
// gatecheck.mjs — the negative controls for HULLBREAKER's own static gates.
//
//   node tools/gatecheck.mjs            run every control, exit non-zero if one misbehaves
//   node tools/gatecheck.mjs --list     print what it would run, and why, without running
//
// A gate that has never been observed failing is a rumour. Two shipped ones
// were green while the invariant they exist to protect was violated:
//
//   I-014  tools/assets/check.mjs saw a static import only when the specifier
//          sat on the same line as the `import` keyword. `import {\n x,\n} from
//          '../assets/x.png'` exited 0 and was filed under "runtime references",
//          so "the game boots with every asset file missing" reported green
//          while broken.
//   I-024  tools/pathcheck.mjs's fair-gap probe defended the word "floor" by
//          comparing takeoff windows (floor narrower than run). That catches a
//          probe started at runSpeed but not one that keeps the scroll-speed
//          start and loses the screen clamp: the gap-29-31 floor window
//          balloons 0.74 -> 4.12 tiles and 4.12 < 4.22 still passes.
//
// So this tool proves both gates can fail, by making them fail. Two committed
// fixture trees are fed to check.mjs; pathcheck is mutated in a scratch copy —
// with the number of replacements asserted, because a mutation test whose
// mutation silently stops applying is worse than no test — and the expected
// assertion must be among the failures it prints.
//
// Since T-037 pathcheck is a runner plus tools/pathcheck/*.mjs domain modules,
// so the scratch copy is a MIRROR of the whole gate (tools/.gatecheck-mutant.mjs
// + tools/.gatecheck-mutant/), written at the same directory depth so the
// modules' ../../src imports resolve. The mutation is hunted across every gate
// file; the occurrence count is still asserted, and the runner's repointing at
// the mirror is asserted too — a mirror that quietly ran the real modules would
// report a control as broken, not as passing.
//
// It is NOT a fast per-change gate: it runs the whole of pathcheck three times
// over (once clean, twice mutated), about 15 seconds. `node tools/pathcheck.mjs`
// stays the per-change check. Run this after touching either gate's own logic:
// tools/assets/lib/imports.mjs, checkGameIndependence, or the FAIR-GAP block.
//
// Honesty / limitations:
//   * It proves each gate REJECTS the one defect it was built for. It cannot
//     prove either gate is complete — check.mjs is a lexer over src/ and not a
//     JS parser, and the fair-gap probe measures the gaps the generator emits
//     for the shipped seed. See tools/assets/README.md § "Game independence".
//   * The mutants are textual. If someone rewrites the mutated lines into a
//     different shape, the replacement count assertion fails LOUDLY rather than
//     mutating nothing and reporting green — that is the intended failure, and
//     the fix is to re-aim the mutation at the new shape, never to drop it.
//   * The clean baseline runs first. A mutant that fails for an unrelated
//     reason is caught by requiring the baseline green and by requiring the
//     NAMED assertion in the mutant's failure list, not merely a non-zero exit.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const PATHCHECK = join(here, 'pathcheck.mjs');
const CHECKS = join(here, 'pathcheck');               // the domain modules (T-037)
const CHECK = join(here, 'assets', 'check.mjs');
const MUTANT = join(here, '.gatecheck-mutant.mjs');   // sibling of pathcheck.mjs:
                                                     // its ../src imports must resolve
const MUTANT_DIR = join(here, '.gatecheck-mutant');   // …and sibling of tools/pathcheck/,
                                                     // so ../../src resolves for the modules
const FIXTURES = join(here, 'assets', 'fixtures');

const rel = (p) => relative(ROOT, p);

function run(file, args) {
  try {
    const stdout = execFileSync(process.execPath, [file, ...args], {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, stdout, stderr: '' };
  } catch (err) {
    if (err.status === undefined) throw err;
    return { code: err.status, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
}

const failLines = (res) => `${res.stdout}\n${res.stderr}`.split('\n').filter((l) => l.startsWith('FAIL '));

/* ------------------------------------------------------------------ *
 * The controls.
 * Each returns { ok, detail } and says what it observed either way.
 * ------------------------------------------------------------------ */

/** check.mjs must reject a tree whose only defect is a multi-line asset import. */
function assetMultilineImport() {
  const root = join(FIXTURES, 'multiline-import');
  const res = run(CHECK, ['--root', root, '--json']);
  let report = null;
  try { report = JSON.parse(res.stdout); } catch { /* reported below */ }
  const imports = report?.gameIndependence?.staticImports ?? -1;
  const ok = res.code !== 0 && report?.ok === false && imports === 2 &&
    report.errors.length === 2 &&
    report.errors.every((e) => /static (import|re-export) of/.test(e)) &&
    report.gameIndependence.references.length === 0;
  return {
    ok,
    detail: `exit ${res.code}, ${imports} static import(s) rejected, ` +
      `${report?.errors.length ?? '?'} error(s), ` +
      `${report?.gameIndependence?.references.length ?? '?'} runtime reference(s)`,
    note: report?.errors?.[0]?.slice(0, 96),
  };
}

/** …and must NOT reject the counter-example the README warns about: runtime
 *  'assets/…' strings sitting under a legal (multi-line) import. */
function assetRuntimeReference() {
  const root = join(FIXTURES, 'runtime-reference');
  const res = run(CHECK, ['--root', root, '--json']);
  let report = null;
  try { report = JSON.parse(res.stdout); } catch { /* reported below */ }
  const refs = report?.gameIndependence?.references?.length ?? -1;
  const ok = res.code === 0 && report?.ok === true &&
    report.gameIndependence.staticImports === 0 && refs >= 3;
  return {
    ok,
    detail: `exit ${res.code}, 0 static imports, ${refs} runtime reference(s) listed`,
    note: report?.gameIndependence?.references?.[0]?.slice(0, 96),
  };
}

/** Every file the gate is made of: the runner plus its domain modules. Since
 *  T-037 the assertions live in tools/pathcheck/*.mjs, so a mutation has to be
 *  hunted across the tree instead of applied to one file. */
function gateSources() {
  const files = [PATHCHECK];
  if (existsSync(CHECKS)) {
    for (const f of readdirSync(CHECKS).sort()) if (f.endsWith('.mjs')) files.push(join(CHECKS, f));
  }
  return files;
}

/** Mutate the gate, run it, and require the named assertion to fail. */
function pathcheckMutant({ from, to, expect, wantHits }) {
  const files = gateSources();
  const hits = files.reduce((n, f) => n + (readFileSync(f, 'utf8').split(from).length - 1), 0);
  if (hits !== wantHits) {
    return {
      ok: false,
      detail: `mutation did not apply: expected ${wantHits} occurrence(s) of ${JSON.stringify(from)}, ` +
        `found ${hits} across ${files.length} gate file(s). ` +
        're-aim the mutation at the new shape of the code — do not drop the control',
    };
  }
  // Mirror the gate one name over, at the SAME directory depth so its relative
  // imports still resolve, applying the mutation on the way. Nothing in the
  // real tree is written to.
  if (existsSync(CHECKS)) {
    mkdirSync(MUTANT_DIR, { recursive: true });
    for (const f of readdirSync(CHECKS)) {
      if (!f.endsWith('.mjs')) continue;
      writeFileSync(join(MUTANT_DIR, f), readFileSync(join(CHECKS, f), 'utf8').split(from).join(to), 'utf8');
    }
  }
  let runner = readFileSync(PATHCHECK, 'utf8').split(from).join(to);
  if (existsSync(CHECKS)) {
    const repointed = runner.split("'./pathcheck/").join("'./.gatecheck-mutant/");
    if (repointed === runner) {
      rmSync(MUTANT_DIR, { recursive: true, force: true });
      return {
        ok: false,
        detail: "the runner does not import './pathcheck/…', so the mirrored copy would " +
          'run the UNMUTATED modules — re-aim the mirror at the new shape of the runner',
      };
    }
    runner = repointed;
  }
  writeFileSync(MUTANT, runner, 'utf8');
  try {
    const res = run(MUTANT, []);
    const fails = failLines(res);
    const hit = fails.filter((l) => l.includes(expect));
    return {
      ok: res.code !== 0 && hit.length > 0,
      detail: `${hits} site(s) mutated, exit ${res.code}, ${fails.length} assertion(s) failed, ` +
        `${hit.length} of them the expected one`,
      note: (hit[0] || fails[0] || '(no FAIL line)').slice(0, 150),
      others: fails.filter((l) => !l.includes(expect)).map((l) => l.slice(5, 90)),
    };
  } finally {
    if (existsSync(MUTANT)) rmSync(MUTANT);
    if (existsSync(MUTANT_DIR)) rmSync(MUTANT_DIR, { recursive: true, force: true });
  }
}

const CONTROLS = [
  {
    id: 'assets-multiline-import',
    why: 'I-014: a multi-line static asset import must exit non-zero, not be filed as a runtime reference',
    what: `${rel(CHECK)} --root ${rel(join(FIXTURES, 'multiline-import'))}`,
    run: assetMultilineImport,
  },
  {
    id: 'assets-runtime-reference',
    why: "the README's counter-example: runtime 'assets/…' strings under a legal import must stay green",
    what: `${rel(CHECK)} --root ${rel(join(FIXTURES, 'runtime-reference'))}`,
    run: assetRuntimeReference,
  },
  {
    id: 'fairgap-clamp-removed',
    why: 'I-024: keep the scroll-speed start, remove the screen clamp — the floor column becomes a near-free run ' +
      '(on gap 29-31 the old window comparison stays green at 4.12 < 4.22; it trips only via gap 46-47 saturating)',
    what: 'pathcheck.mjs with `if (mode.clamp) E.setEdges(` -> `if (false) E.setEdges(`',
    run: () => pathcheckMutant({
      from: 'if (mode.clamp) E.setEdges(',
      to: 'if (false) E.setEdges(',
      wantHits: 2,
      expect: 'every floor-labelled sweep really ran at the scroll floor',
    }),
  },
  {
    id: 'fairgap-floor-column-at-run-speed',
    why: "T-020's original control: measure the floor column in RUN mode and the two takeoff windows stop differing",
    what: 'pathcheck.mjs with the floor column\'s sweep switched to the RUN mode',
    run: () => pathcheckMutant({
      from: 'const single = windowFor(g, dt, false, FLOOR);',
      to: 'const single = windowFor(g, dt, false, RUN);',
      wantHits: 1,
      expect: 'the same gaps are wider still at run speed',
    }),
  },
  {
    id: 'fairgap-meter-stuck',
    why: 'a stuck speed meter would let the floor-speed guard pass vacuously; the liveness check must catch it',
    what: 'pathcheck.mjs with the speed meter never recording a maximum',
    run: () => pathcheckMutant({
      from: 'if (avg > SPEED.max) SPEED.max = avg;',
      to: 'if (false) SPEED.max = avg;',
      wantHits: 1,
      expect: 'the speed meter is live',
    }),
  },
];

/* ------------------------------------------------------------------ */

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8')
      .split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
    process.exit(0);
  }
  if (args.includes('--list')) {
    for (const c of CONTROLS) console.log(`${c.id}\n  why:  ${c.why}\n  what: ${c.what}\n`);
    process.exit(0);
  }

  console.log('gatecheck — proving the static gates can fail\n');

  // A mutant that goes red proves nothing unless the clean tree is green.
  const baselines = [
    ['tools/pathcheck.mjs', run(PATHCHECK, [])],
    ['tools/assets/check.mjs', run(CHECK, [])],
  ];
  let ok = true;
  for (const [name, res] of baselines) {
    const green = res.code === 0;
    ok = ok && green;
    console.log(`  ${green ? 'ok  ' : 'FAIL'} baseline ${name} (exit ${res.code})`);
    if (!green) console.log(`         ${failLines(res)[0] || res.stdout.trim().split('\n').pop() || ''}`);
  }
  if (!ok) {
    console.log('\nbaseline is not green — fix that before reading any control below\nFAIL');
    process.exit(1);
  }

  console.log('');
  for (const c of CONTROLS) {
    const res = c.run();
    ok = ok && res.ok;
    console.log(`  ${res.ok ? 'ok  ' : 'FAIL'} ${c.id} — ${res.detail}`);
    console.log(`         why: ${c.why}`);
    if (res.note) console.log(`         saw: ${res.note}`);
    if (res.others?.length) console.log(`         other assertions that also failed: ${res.others.length}`);
  }

  console.log(ok
    ? `\n${CONTROLS.length} controls, every one of them red where it must be, green where it must be.\nPASS`
    : '\nA control did not behave. A gate that cannot be made to fail is not protecting anything.\nFAIL');
  process.exit(ok ? 0 : 1);
}

main();
