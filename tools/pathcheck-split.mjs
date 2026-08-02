#!/usr/bin/env node
// pathcheck-split.mjs — turn the pathcheck monolith into per-domain modules.
//
//   node tools/pathcheck-split.mjs                      split tools/pathcheck.mjs in place
//   node tools/pathcheck-split.mjs --source-rev main     split the monolith as of a git rev
//   node tools/pathcheck-split.mjs --check --source-rev <rev>
//                                                       regenerate into a temp dir and prove
//                                                       the committed tree matches, byte for byte
//   node tools/pathcheck-split.mjs --dry-run             print the plan, write nothing
//
// WHY (T-037). `tools/pathcheck.mjs` grew to 9,230 lines and every task appends
// assertions to it, so N concurrent lanes are an N-way conflict by
// construction. On 2026-08-02 the T-025/T-027 merge conflicted there and two
// successive hand resolutions silently DROPPED assertions (1733, then 1739,
// against a correct 1741) — caught only because the total failed to reconcile.
// New files never conflict; this makes "add assertions" mean "add or edit ONE
// domain file", and the runner is never touched.
//
// WHY A SCRIPT AND NOT A HAND EDIT. Lanes are in flight that add hundreds of
// lines to the monolith. A hand split is stale the moment one of them lands.
// Re-run this against the merged monolith instead of hand-merging the split.
//
// WHAT IT GUARANTEES
//   * Statements keep their exact text and their exact ORDER. The runner walks
//     an explicit ordered manifest — never a directory listing, whose order is
//     not stable across machines.
//   * One process, one evaluation order: the split cannot change results the
//     way per-file process isolation would (see reports/tasks/T-037/build.md —
//     the jump-apex block inherits setSimEdges() from a block above it, and
//     four assertions flip to FAIL if it does not).
//   * Every assumption below is CHECKED. If the monolith grows a shape this
//     script does not understand it exits non-zero and says what it found; it
//     never emits a half-correct tree.
//
// HOW IT SPLITS
//   header   the static import block                     -> re-emitted per module, minimised
//   prelude  everything up to the first assertion        -> tools/pathcheck/_context.mjs
//            (layer guards, ok/near/fingerprint, counters)
//   domains  each `/* ==== banner ==== */` section       -> tools/pathcheck/<slug>.mjs
//
// Cross-domain values (levels, fixtures and probes an earlier section builds
// and a later one reads) travel through one explicit object: each module
// destructures what earlier domains published and publishes what later domains
// use. The script computes both sets from the code, so it cannot forget one.
//
// Honesty / limitations:
//   * The parser is a scanner, not a full JS parser: it tracks comments,
//     strings, template literals (including ${} nesting) and regex literals so
//     that brace counting is honest — naive counting is a documented trap here
//     (docs/ORCHESTRATION.md, "never hand-balance braces"). It does not build
//     an AST, so identifier use is over-approximated: a module may import a
//     binding it only mentions in a comment. That is harmless; the failure
//     mode it cannot produce is a MISSING binding, which is a hard error at
//     run time, not a silent pass.
//   * It reads `provides`/`needs` from top-level declarations only. Values a
//     section stows on an imported singleton (the sim's player/keys/edges)
//     travel because the modules share one process, exactly as before.
//   * It does not re-indent. Assertion text stays byte-identical, which is what
//     makes the label-set proof meaningful.

import { execFileSync } from 'node:child_process';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');

/* ------------------------------------------------------------------ *
 * scanner
 * ------------------------------------------------------------------ */

/**
 * Split source into top-level statements, and mark which characters are real
 * code (not comment, not string). Depth is tracked for (), [] and {} with
 * strings/templates/regexes consumed whole, so a regex literal containing an
 * unbalanced brace cannot desynchronise the split.
 */
export function scanTopLevel(src) {
  const n = src.length;
  const codeMask = new Uint8Array(n);
  const spans = [];
  let i = 0, curly = 0, paren = 0, square = 0, stmtStart = 0, outerBlockLike = true;
  let lastSig = '', lastWord = '';
  const KEYWORDS_BEFORE_REGEX = new Set(['return', 'typeof', 'case', 'in', 'of', 'new', 'delete',
    'void', 'instanceof', 'do', 'else', 'yield', 'await', 'throw']);

  const skipString = (q) => {
    i++;
    while (i < n) {
      if (src[i] === '\\') { i += 2; continue; }
      if (src[i] === q) { i++; return; }
      i++;
    }
  };
  const skipTemplate = () => {
    i++;
    while (i < n) {
      if (src[i] === '\\') { i += 2; continue; }
      if (src[i] === '`') { i++; return; }
      if (src[i] === '$' && src[i + 1] === '{') {
        // An interpolation IS code — its identifiers are real references (the
        // child-process probes build their file:// bases out of srcDir this
        // way), so mask it or a module loses an import it genuinely needs.
        i += 2;
        let bd = 1;
        while (i < n && bd > 0) {
          const ch = src[i];
          if (ch === '{') { bd++; codeMask[i] = 1; i++; continue; }
          if (ch === '}') { bd--; codeMask[i] = 1; i++; continue; }
          if (ch === '"' || ch === "'") { skipString(ch); continue; }
          if (ch === '`') { skipTemplate(); continue; }
          if (ch === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
          if (ch === '/' && src[i + 1] === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
          codeMask[i] = 1;
          i++;
        }
        continue;
      }
      i++;
    }
  };

  if (src.startsWith('#!')) { while (i < n && src[i] !== '\n') i++; }   // shebang: not code

  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '"' || c === "'") { skipString(c); lastSig = 'x'; lastWord = ''; continue; }
    if (c === '`') { skipTemplate(); lastSig = 'x'; lastWord = ''; continue; }
    if (c === '/') {
      const prevIsValue = /[\w$)\]]/.test(lastSig) && !KEYWORDS_BEFORE_REGEX.has(lastWord);
      if (!prevIsValue) {                                  // regex literal
        i++;
        let inClass = false;
        while (i < n) {
          if (src[i] === '\\') { i += 2; continue; }
          if (src[i] === '[') inClass = true;
          else if (src[i] === ']') inClass = false;
          else if (src[i] === '/' && !inClass) { i++; break; }
          else if (src[i] === '\n') break;
          i++;
        }
        while (i < n && /[a-z]/.test(src[i])) i++;
        lastSig = 'x'; lastWord = '';
        continue;
      }
      codeMask[i] = 1; lastSig = c; i++; continue;
    }
    if (c === '{') {
      // Only a BLOCK's closing brace can end a top-level statement. An import
      // clause, an object literal or a destructuring pattern must not, or
      // `import { a } from 'x';` splits in half.
      if (curly === 0) {
        outerBlockLike = !['import', 'export'].includes(lastWord) &&
          !['=', '(', ',', ':', '[', '>', '?', '&', '|', '+', '-', '*', '/', '!'].includes(lastSig);
      }
      curly++;
    } else if (c === '}') curly--;
    else if (c === '(') paren++;
    else if (c === ')') paren--;
    else if (c === '[') square++;
    else if (c === ']') square--;
    codeMask[i] = 1;
    if (/\s/.test(c)) { i++; continue; }
    if (/[\w$]/.test(c)) {
      let j = i;
      while (j < n && /[\w$]/.test(src[j])) j++;
      for (let k = i; k < j; k++) codeMask[k] = 1;
      lastWord = src.slice(i, j);
      lastSig = src[j - 1];
      i = j;
      continue;
    }
    lastSig = c; lastWord = '';
    if (curly === 0 && paren === 0 && square === 0 && (c === ';' || (c === '}' && outerBlockLike))) {
      // `} else {`, `} catch {`, `} finally {`, `} while (…)` continue the same
      // statement — a split there would strand a clause in another module.
      const continues = c === '}' && /^\s*(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*\n|\s)*(else|catch|finally|while)\b/.test(src.slice(i + 1, i + 400));
      if (!continues) {
        spans.push([stmtStart, i + 1]);
        stmtStart = i + 1;
      }
    }
    i++;
  }
  if (stmtStart < n) {
    // Trailing whitespace belongs to the last statement, so the partition of
    // the file is lossless and can be checked by concatenation.
    if (src.slice(stmtStart).trim()) spans.push([stmtStart, n]);
    else if (spans.length) spans[spans.length - 1][1] = n;
    else spans.push([stmtStart, n]);
  }
  return { spans, codeMask, balanced: curly === 0 && paren === 0 && square === 0 };
}

/** Names a top-level declaration statement binds. Takes the CODE text (a
 *  statement's leading comments are part of its span and must be stripped by
 *  the caller, or `// const x` would read as a declaration). */
export function declaredNames(text) {
  const body = text.replace(/^\s+/, '');
  let m = /^(const|let|var)\s+/.exec(body);
  if (m) {
    const rest = body.slice(m[0].length);
    const names = [];
    let d = 0, cur = '';
    const parts = [];
    for (let i = 0; i < rest.length; i++) {
      const ch = rest[i];
      if ('([{'.includes(ch)) d++;
      if (')]}'.includes(ch)) d--;
      if (d === 0 && (ch === ',' || ch === ';')) { parts.push(cur); cur = ''; if (ch === ';') break; continue; }
      cur += ch;
    }
    if (cur.trim()) parts.push(cur);
    for (const p of parts) {
      const head = p.split('=')[0].trim();
      if (head.startsWith('{') || head.startsWith('[')) {
        for (const id of head.matchAll(/([A-Za-z_$][\w$]*)\s*(?::\s*([A-Za-z_$][\w$]*))?/g)) names.push(id[2] || id[1]);
      } else if (/^[A-Za-z_$][\w$]*$/.test(head)) names.push(head);
    }
    return { kind: m[1], names };
  }
  m = /^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/.exec(body);
  if (m) return { kind: 'function', names: [m[1]] };
  m = /^class\s+([A-Za-z_$][\w$]*)/.exec(body);
  if (m) return { kind: 'class', names: [m[1]] };
  return { kind: null, names: [] };
}

/** Identifiers a statement mentions in code (comments and strings excluded). */
function identsIn(src, codeMask, a, b) {
  const text = src.slice(a, b);
  const out = new Set();
  for (const m of text.matchAll(/[A-Za-z_$][\w$]*/g)) {
    if (!codeMask[a + m.index]) continue;
    const before = text.slice(Math.max(0, m.index - 3), m.index);
    if (/(?<!\.)\.\s*$/.test(before)) continue;              // property access
    out.add(m[0]);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * import header
 * ------------------------------------------------------------------ */

function parseImport(text) {
  const src = /from\s*['"]([^'"]+)['"]/.exec(text) || /^\s*import\s*['"]([^'"]+)['"]/.exec(text);
  if (!src) return null;
  const clause = text.slice(text.indexOf('import') + 6, text.lastIndexOf('from') === -1 ? undefined : text.lastIndexOf('from'));
  const names = [];
  const ns = /\*\s*as\s+([A-Za-z_$][\w$]*)/.exec(clause);
  if (ns) names.push({ local: ns[1], spec: `* as ${ns[1]}`, kind: 'ns' });
  const braces = /\{([\s\S]*)\}/.exec(clause);
  if (braces) {
    for (const part of braces[1].split(',')) {
      const p = part.trim();
      if (!p) continue;
      const as = /^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(p);
      if (as) names.push({ local: as[2], spec: `${as[1]} as ${as[2]}`, kind: 'named' });
      else if (/^[A-Za-z_$][\w$]*$/.test(p)) names.push({ local: p, spec: p, kind: 'named' });
    }
  }
  const bare = clause.replace(/\{[\s\S]*\}/, '').replace(/\*\s*as\s+[A-Za-z_$][\w$]*/, '').replace(/,/g, '').trim();
  if (/^[A-Za-z_$][\w$]*$/.test(bare)) names.push({ local: bare, spec: bare, kind: 'default' });
  return { source: src[1], names };
}

/** Relative specifiers move one directory deeper when a chunk becomes a module. */
const deepen = (spec) => (spec.startsWith('./') ? '../' + spec.slice(2)
  : spec.startsWith('../') ? '../' + spec
    : spec);

function renderImports(groups) {
  const lines = [];
  for (const { source, names } of groups) {
    if (!names.length) continue;
    const ns = names.filter((x) => x.kind === 'ns');
    const def = names.filter((x) => x.kind === 'default');
    const named = names.filter((x) => x.kind === 'named');
    const head = [...def.map((x) => x.spec), ...ns.map((x) => x.spec)].join(', ');
    let clause = head;
    if (named.length) {
      const inner = named.map((x) => x.spec).join(', ');
      const braced = `{ ${inner} }`;
      clause = head ? `${head}, ${braced}` : braced;
    }
    let line = `import ${clause} from '${source}';`;
    if (line.length > 92 && named.length) {
      const rows = [];
      let row = '';
      for (const nm of named.map((x) => x.spec)) {
        const next = row ? `${row}, ${nm}` : `  ${nm}`;
        if (next.length > 88 && row) { rows.push(row + ','); row = `  ${nm}`; } else row = next;
      }
      if (row) rows.push(row + ',');
      const braced = `{\n${rows.join('\n')}\n}`;
      clause = head ? `${head}, ${braced}` : braced;
      line = `import ${clause} from '${source}';`;
    }
    lines.push(line);
  }
  return lines.join('\n');
}

/* ------------------------------------------------------------------ *
 * text rewrites that make a chunk legal one directory deeper
 * ------------------------------------------------------------------ */

function rewriteChunk(text) {
  let out = text;
  // `import.meta.url` in the monolith means "tools/pathcheck.mjs". Keep that
  // meaning explicit rather than silently rebasing it on the new file.
  out = out.replace(/\bimport\.meta\.url\b/g, 'ENTRY_URL');
  out = out.replace(/\bimport\.meta\.dirname\b/g, 'ENTRY_DIR');
  out = out.replace(/\bimport\.meta\.filename\b/g, 'ENTRY_FILE');
  // Dynamic imports are resolved against the importing module.
  out = out.replace(/(\bimport\s*\(\s*)(['"])(\.\.?\/[^'"]*)\2/g,
    (_m, head, q, spec) => `${head}${q}${deepen(spec)}${q}`);
  return out;
}

const usesEntryUrl = (text) => /\bENTRY_URL\b|\bENTRY_DIR\b|\bENTRY_FILE\b/.test(text);

/* ------------------------------------------------------------------ *
 * plan
 * ------------------------------------------------------------------ */

const BANNER = /^\/\*[ \t]*[=-]{4,}/m;
const SHARED = 'SHARED';

const SLUG_STOP = new Set(['the', 'a', 'an', 'of', 'on', 'at', 'to', 'and', 'is', 'in', 'for', 's', 'its']);

function slugify(text, taken) {
  let s = text
    .replace(/^\/\*+/, ' ').replace(/[=\-*]{2,}/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  const words = s.split('-').filter(Boolean);
  // Keep the leading task id (t-009, g2, cp1…) plus the first content words.
  const kept = [];
  for (const w of words) {
    if (kept.length >= 6) break;
    if (SLUG_STOP.has(w) && kept.length) continue;
    if (SLUG_STOP.has(w) && !kept.length) continue;
    kept.push(w);
  }
  s = kept.join('-');
  if (!s) s = 'section';
  let out = s, k = 2;
  while (taken.has(out)) out = `${s}-${k++}`;
  taken.add(out);
  return out;
}

function bannerTitle(text) {
  const m = /^\/\*[ \t]*[=-]{4,}([^\n]*)/m.exec(text);
  if (!m) return '';
  return m[1].replace(/[=\-*/]+$/g, '').replace(/^[=\-*\s]+/, '').trim();
}

export function planSplit(src) {
  const { spans, codeMask, balanced } = scanTopLevel(src);
  if (!balanced) throw new Error('pathcheck-split: the source did not scan to balanced depth — refusing to split');

  const stmts = spans.map(([a, b]) => {
    // A statement's span starts after the previous one ends, so it carries the
    // comments written above it. Find the first character that is real code.
    let c = a;
    while (c < b && !(codeMask[c] && !/\s/.test(src[c]))) c++;
    const text = src.slice(a, b);
    const code = src.slice(c, b);
    return {
      a, b, c, text, code,
      line: src.slice(0, a).split('\n').length,
      isImport: /^import[\s{*'"]/.test(code),
      decl: declaredNames(code),
      idents: identsIn(src, codeMask, a, b),
    };
  });
  if (stmts.map((s) => s.text).join('') !== src) {
    throw new Error('pathcheck-split: the statement partition is not lossless — refusing to split');
  }

  // header: the leading run of static imports.
  let h = 0;
  while (h < stmts.length && (stmts[h].isImport || !stmts[h].code.trim())) h++;
  const header = stmts.slice(0, h);
  if (stmts.slice(h).some((s) => s.isImport)) {
    throw new Error('pathcheck-split: a static import appears after the header block — move it up, or teach this script');
  }
  const imports = header.map((s) => parseImport(s.code)).filter(Boolean);
  if (imports.length !== header.length) {
    throw new Error(`pathcheck-split: parsed ${imports.length} of ${header.length} header imports — teach parseImport the new shape`);
  }
  const importByLocal = new Map();
  for (const imp of imports) for (const nm of imp.names) importByLocal.set(nm.local, imp.source);

  // prelude: everything up to the first statement that CALLS ok()/near().
  const callsAssert = (s) =>
    /(?:^|[^\w$.])(?:ok|near)\s*\(/.test(s.code) &&
    !/^(?:function|const|let|var)\s+(?:ok|near)\b/.test(s.code);
  let p = h;
  while (p < stmts.length && !callsAssert(stmts[p])) p++;
  if (p >= stmts.length) throw new Error('pathcheck-split: found no assertion call — is this the right file?');
  const prelude = stmts.slice(h, p);
  const body = stmts.slice(p);

  // The monolith ends by printing its own tally and exiting. That is the
  // runner's job now, so lift those two statements out explicitly — leaving
  // them in the last domain would print twice and exit before the tally.
  const TALLY = /console\.log\(\s*'pathcheck: '/;
  const EXIT = /process\.exit\(\s*fails/;
  const tallyIdx = body.findIndex((s) => TALLY.test(s.code));
  const exitIdx = body.findIndex((s) => EXIT.test(s.code));
  if (tallyIdx === -1 || exitIdx === -1) {
    throw new Error('pathcheck-split: could not find the trailing tally/exit statements — the harness has changed shape');
  }
  if (body.filter((s) => TALLY.test(s.code)).length !== 1 || body.filter((s) => EXIT.test(s.code)).length !== 1 ||
      exitIdx !== body.length - 1 || tallyIdx !== body.length - 2) {
    throw new Error('pathcheck-split: the tally and exit are not the last two statements — refusing to split');
  }
  const epilogue = body.splice(body.length - 2, 2);
  const okDefs = prelude.filter((s) => /function ok\(cond, msg\)/.test(s.code));
  if (okDefs.length !== 1) {
    throw new Error(`pathcheck-split: expected exactly one ok(cond, msg) definition in the prelude, found ${okDefs.length} — the harness has changed shape`);
  }

  // domains: a new one starts at every top-level banner comment.
  const taken = new Set();
  const domains = [];
  for (const s of body) {
    const isBoundary = BANNER.test(s.text) || domains.length === 0;
    if (isBoundary) {
      const title = bannerTitle(s.text) || 'pathcheck suite';
      domains.push({ title, slug: slugify(title, taken), stmts: [] });
    }
    domains[domains.length - 1].stmts.push(s);
  }

  // binding flow
  const declOwner = new Map();                       // name -> domain index (-1 = prelude)
  for (const s of prelude) for (const nm of s.decl.names) declOwner.set(nm, -1);
  domains.forEach((d, i) => {
    for (const s of d.stmts) for (const nm of s.decl.names) {
      if (declOwner.has(nm)) {
        throw new Error(`pathcheck-split: top-level name '${nm}' is declared twice — that is a syntax error in the monolith, so the scan is wrong`);
      }
      declOwner.set(nm, i);
    }
  });

  const usedIn = domains.map((d) => {
    const u = new Set();
    for (const s of d.stmts) for (const id of s.idents) u.add(id);
    return u;
  });
  const preludeUse = new Set();
  for (const s of prelude) for (const id of s.idents) preludeUse.add(id);

  domains.forEach((d, i) => {
    d.needs = [...usedIn[i]].filter((nm) => {
      const owner = declOwner.get(nm);
      return owner !== undefined && owner !== -1 && owner < i;
    }).sort();
    const forward = [...usedIn[i]].filter((nm) => {
      const owner = declOwner.get(nm);
      return owner !== undefined && owner > i;
    });
    if (forward.length) {
      throw new Error(`pathcheck-split: domain '${d.slug}' uses ${forward.join(', ')} declared in a LATER section. ` +
        'Splitting would break hoisting; move the declaration earlier before re-running.');
    }
    d.provides = [];
    for (const s of d.stmts) for (const nm of s.decl.names) {
      if (domains.some((other, j) => j > i && usedIn[j].has(nm))) d.provides.push(nm);
    }
    d.provides.sort();
    d.fromContext = [...usedIn[i]].filter((nm) => declOwner.get(nm) === -1).sort();
  });

  // a `let` that one domain declares and another assigns cannot travel by value
  for (const [name, owner] of declOwner) {
    const kindStmt = [...prelude, ...domains.flatMap((d) => d.stmts)]
      .find((s) => s.decl.names.includes(name));
    if (!kindStmt || kindStmt.decl.kind === 'const' || kindStmt.decl.kind === 'function' || kindStmt.decl.kind === 'class') continue;
    const assignRe = new RegExp(`(?:^|[^\\w$.])${name}\\s*(?:=[^=]|\\+\\+|--|\\+=|-=|\\*=|/=)`);
    domains.forEach((d, i) => {
      if (i === owner) return;
      for (const s of d.stmts) {
        if (assignRe.test(s.text)) {
          throw new Error(`pathcheck-split: '${name}' is a mutable binding declared in ${owner === -1 ? 'the prelude' : domains[owner].slug} ` +
            `and assigned in ${d.slug}. Copying it into ${SHARED} would silently change semantics — teach this script or refactor the binding.`);
        }
      }
    });
  }

  // what the context module must export
  const contextExports = new Set();
  for (const d of domains) for (const nm of d.fromContext) contextExports.add(nm);

  // The header's prose explains why each layer is importable here; it is not
  // regenerable, so carry it across rather than dropping it with the imports.
  const headerComments = header.map((s) => s.text.slice(0, s.c - s.a)).join('').replace(/^#![^\n]*\n/, '');

  for (const guard of ['__toPath', '__dirOf', SHARED, 'ENTRY_URL', 'ENTRY_DIR', 'ENTRY_FILE']) {
    if (new RegExp(`(?:^|[^\\w$.])${guard}(?:[^\\w$]|$)`).test(src)) {
      throw new Error(`pathcheck-split: the source already uses the name '${guard}', which the generated modules need — rename one of them`);
    }
  }
  return {
    stmts, header, headerComments, imports, importByLocal, prelude, domains,
    epilogue: epilogue.map((s) => s.code).join('\n'),
    contextExports: [...contextExports].sort(),
  };
}

/* ------------------------------------------------------------------ *
 * emit
 * ------------------------------------------------------------------ */

const GENERATED = 'GENERATED BY tools/pathcheck-split.mjs';

/** Repo style is single-quoted strings. */
const quote = (s) => (s.includes("'") || s.includes('\\') ? JSON.stringify(s) : `'${s}'`);

function importGroupsFor(plan, texts, extra = new Set()) {
  const used = new Set(extra);
  for (const t of texts) for (const m of t.matchAll(/[A-Za-z_$][\w$]*/g)) used.add(m[0]);
  return plan.imports.map((imp) => ({
    source: deepen(imp.source),
    names: imp.names.filter((nm) => used.has(nm.local)),
  })).filter((g) => g.names.length);
}

function emitContext(plan) {
  const texts = plan.prelude.map((s) => rewriteChunk(s.text));
  const groups = importGroupsFor(plan, texts);
  const exported = plan.contextExports.filter((nm) => !plan.importByLocal.has(nm));
  const runner = basename(plan.runnerName || 'pathcheck.mjs');
  return `// ${GENERATED} — do not hand-merge; re-run the script.
//
// The pathcheck prelude: the static layer guards, the assertion helpers, and
// the counters every domain module shares. It is evaluated once, before any
// domain runs, exactly where it sat in the monolith.
//
// Adding assertions? Add or edit a file in this directory and list it in
// manifest.mjs. You should not need to touch this file or ../${runner}.
//
// ---- carried over from the monolith's header ---------------------------
${plan.headerComments.trim().replace(/\n{3,}/g, '\n//\n')}
// ------------------------------------------------------------------------

import { fileURLToPath as __toPath } from 'node:url';
import { dirname as __dirOf } from 'node:path';
${renderImports(groups)}

// In the monolith \`import.meta.url\` meant tools/${runner}, and every path in
// the suite is derived from it (srcDir, the tools dir the playtest harness is
// read from, the child processes' file:// bases). It keeps meaning that here,
// which is why the modules can sit one directory deeper without moving a path.
export const ENTRY_URL = new URL('../${runner}', import.meta.url).href;
export const ENTRY_FILE = __toPath(ENTRY_URL);
export const ENTRY_DIR = __dirOf(ENTRY_FILE);

${texts.join('').trim()}

/** Live tally, for the runner's one-line summary. */
export function counts() { return { passes, fails }; }

export {
${exported.map((nm) => '  ' + nm + ',').join('\n')}
};
`;
}

function emitDomain(plan, d) {
  const texts = d.stmts.map((s) => rewriteChunk(s.text));
  const bodyText = texts.join('');
  const groups = importGroupsFor(plan, texts);
  const ctxNames = d.fromContext.filter((nm) => !plan.importByLocal.has(nm));
  if (usesEntryUrl(bodyText)) {
    for (const nm of ['ENTRY_URL', 'ENTRY_DIR', 'ENTRY_FILE']) {
      if (new RegExp(`\\b${nm}\\b`).test(bodyText) && !ctxNames.includes(nm)) ctxNames.push(nm);
    }
  }
  const ctxImport = ctxNames.length
    ? renderImports([{ source: './_context.mjs', names: ctxNames.map((n) => ({ local: n, spec: n, kind: 'named' })) }]) + '\n'
    : '';
  const head = [renderImports(groups), ctxImport].filter(Boolean).join('\n');
  const needs = d.needs.length
    ? `  const { ${d.needs.join(', ')} } = ${SHARED};   // built by earlier domains\n`
    : '';
  const provides = d.provides.length
    ? `\n  Object.assign(${SHARED}, { ${d.provides.join(', ')} });   // read by later domains\n`
    : '';
  return `// ${GENERATED} — assertions moved verbatim from the pathcheck monolith.
//
// Domain: ${d.title || d.slug}
//
// Edit this file to add assertions in this domain. Order inside the file is
// preserved as written; order between files is manifest.mjs's business.

${head}
export const title = ${quote(d.title || d.slug)};

export async function run(${SHARED}) {
${needs}${bodyText.replace(/^\n+/, '\n').replace(/\s+$/, '')}
${provides}}
`;
}

function emitManifest(plan) {
  const imports = plan.domains.map((d, i) => `import * as d${String(i).padStart(2, '0')} from './${d.slug}.mjs';`).join('\n');
  const list = plan.domains.map((d, i) => `  d${String(i).padStart(2, '0')},${' '.repeat(Math.max(1, 4))}// ${d.title || d.slug}`).join('\n');
  return `// ${GENERATED}
//
// The ordered domain manifest. ORDER IS SIGNIFICANT and this list is explicit
// on purpose: sections build values (levels, fixtures, probe results) that
// later sections read, and some drive the sim's module-level singletons and
// leave them set. Directory enumeration order is not stable across machines,
// so the runner never globs — it walks this list.
//
// Adding a domain: create the file, then add it here in the position it must
// run. Appending at the end is right for a new, self-contained section.

${imports}

export const DOMAINS = [
${list}
];
`;
}

function emitRunner(plan, outRel) {
  return `#!/usr/bin/env node
// ${GENERATED}
//
// pathcheck.mjs — HULLBREAKER's headless gate. Run from the repo root:
//
//   node tools/pathcheck.mjs
//
// The assertions live in ${outRel}/ — one module per domain, walked in the
// order ${outRel}/manifest.mjs lists. This file is a runner and nothing else,
// so two lanes adding assertions touch two different files and never conflict
// (T-037; before it, every task appended to one 9,230-line file and the
// T-025/T-027 merge dropped assertions twice while still printing green).
//
// The layer guards and the ok()/near() helpers live in ${outRel}/_context.mjs,
// which is evaluated before any domain, exactly where it sat in the monolith.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { counts } from './${outRel.split('/').pop()}/_context.mjs';
import { DOMAINS } from './${outRel.split('/').pop()}/manifest.mjs';

// A domain module that exists but is NOT listed in the manifest would run
// nothing while the gate still printed green — the silent-drop this split
// exists to prevent, reintroduced by a one-line merge conflict. So the runner
// refuses to run rather than under-report. (Losing a manifest line is exactly
// what the T-025/T-027 hand resolutions did to whole blocks of assertions.)
const MODULE_DIR = new URL('./${outRel.split('/').pop()}/', import.meta.url);
{
  const manifestSrc = readFileSync(fileURLToPath(new URL('manifest.mjs', MODULE_DIR)), 'utf8');
  const listed = new Set([...manifestSrc.matchAll(/from\\s*'\\.\\/([\\w.-]+\\.mjs)'/g)].map((m) => m[1]));
  const unlisted = readdirSync(fileURLToPath(MODULE_DIR))
    .filter((f) => f.endsWith('.mjs') && f !== 'manifest.mjs' && !f.startsWith('_') && !listed.has(f));
  if (unlisted.length) {
    console.error('pathcheck: ' + unlisted.length + ' domain module(s) present but not listed in ' +
      'manifest.mjs: ' + unlisted.join(', ') + '\\n' +
      'Their assertions would not run and this gate would still print green. ' +
      'Add them to the manifest in the position they must run.');
    process.exit(1);
  }
}

const ${SHARED} = {};                 // values that travel between domains
for (const domain of DOMAINS) await domain.run(${SHARED});

// The tally and exit below are the monolith's own two final statements, moved
// here verbatim: the output line and the exit code are a contract that
// tools/orch/merge-task.sh, tools/gatecheck.mjs and every gate agent read.
const { passes, fails } = counts();
${plan.epilogue.trim()}
`;
}

export function generate(src, { outRel = 'tools/pathcheck', runnerName = 'pathcheck.mjs' } = {}) {
  const plan = planSplit(src);
  plan.runnerName = runnerName;
  const files = new Map();
  files.set(`${outRel}/_context.mjs`, emitContext(plan));
  for (const d of plan.domains) files.set(`${outRel}/${d.slug}.mjs`, emitDomain(plan, d));
  files.set(`${outRel}/manifest.mjs`, emitManifest(plan));
  files.set(`tools/${runnerName}`, emitRunner(plan, outRel));
  return { plan, files };
}

/* ------------------------------------------------------------------ *
 * cli
 * ------------------------------------------------------------------ */

function readSource(opts) {
  if (opts.sourceRev) {
    return execFileSync('git', ['-C', ROOT, 'show', `${opts.sourceRev}:${opts.sourcePath}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  }
  const p = join(ROOT, opts.sourcePath);
  const text = readFileSync(p, 'utf8');
  if (text.includes(GENERATED)) {
    throw new Error(`pathcheck-split: ${opts.sourcePath} is already the generated runner. ` +
      'Point --source-rev at a revision that still has the monolith, or --source at the monolith file.');
  }
  return text;
}

function main() {
  const argv = process.argv.slice(2);
  const opts = {
    sourcePath: 'tools/pathcheck.mjs', sourceRev: null, outRel: 'tools/pathcheck',
    check: false, dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--source') opts.sourcePath = argv[++i];
    else if (a === '--source-rev') opts.sourceRev = argv[++i];
    else if (a === '--out-dir') opts.outRel = argv[++i];
    else if (a === '--check') opts.check = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--help' || a === '-h') {
      console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8')
        .split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
      process.exit(0);
    } else { console.error('pathcheck-split: unknown argument ' + a); process.exit(2); }
  }

  const src = readSource(opts);
  const { plan, files } = generate(src, { outRel: opts.outRel });

  console.log(`pathcheck-split: ${src.split('\n').length} lines, ${plan.stmts.length} top-level statements`);
  console.log(`  header  ${plan.header.length} imports`);
  console.log(`  prelude ${plan.prelude.length} statements -> ${opts.outRel}/_context.mjs (exports ${plan.contextExports.length})`);
  console.log(`  domains ${plan.domains.length}`);
  for (const d of plan.domains) {
    console.log(`    ${d.slug.padEnd(38)} ${String(d.stmts.length).padStart(3)} stmt` +
      (d.needs.length ? `  needs: ${d.needs.join(',')}` : '') +
      (d.provides.length ? `  provides: ${d.provides.join(',')}` : ''));
  }
  if (opts.dryRun) { console.log('  (--dry-run: nothing written)'); return; }

  if (opts.check) {
    let drift = 0;
    for (const [rel, text] of files) {
      const p = join(ROOT, rel);
      const have = existsSync(p) ? readFileSync(p, 'utf8') : null;
      if (have !== text) { console.error(`  DRIFT ${rel}` + (have === null ? ' (missing)' : '')); drift++; }
    }
    const dir = join(ROOT, opts.outRel);
    if (existsSync(dir)) {
      for (const f of readdirSync(dir)) {
        if (files.has(`${opts.outRel}/${f}`)) continue;
        // Hand-written files (a README, a domain someone added without
        // re-running the script) are not drift — only stale generated ones are.
        if (!readFileSync(join(dir, f), 'utf8').includes(GENERATED)) continue;
        console.error(`  DRIFT ${opts.outRel}/${f} (generated, but this source does not emit it)`);
        drift++;
      }
    }
    console.log(drift ? `  ${drift} file(s) differ from what the script emits` : '  every emitted file matches the tree, byte for byte');
    process.exit(drift ? 1 : 0);
  }

  // Clear previously generated modules so a re-run cannot leave an orphan.
  const dir = join(ROOT, opts.outRel);
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (readFileSync(p, 'utf8').includes(GENERATED)) rmSync(p);
      else console.error(`  keeping hand-written ${opts.outRel}/${f} (no generated marker)`);
    }
  }
  mkdirSync(dir, { recursive: true });
  for (const [rel, text] of files) {
    mkdirSync(dirname(join(ROOT, rel)), { recursive: true });
    writeFileSync(join(ROOT, rel), text);
  }
  console.log(`  wrote ${files.size} files`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main();
