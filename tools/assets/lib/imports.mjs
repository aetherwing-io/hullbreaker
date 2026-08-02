// imports.mjs — statement-level scan for a module's STATIC import specifiers.
//
// `check.mjs` must reject a static ES import of an `assets/` path anywhere in
// src/ (the game has to boot with every asset file missing) while leaving
// runtime references legal. The two shapes differ only in grammar:
//
//     import { sprite } from '../assets/x.png';        // dependency — rejected
//     const url = '../assets/x.png';                   // runtime      — allowed
//     const m = await import('../assets/x.png');       // runtime      — allowed
//
// Why this is not one regex, twice over:
//
//   * the old line-anchored pattern (`/^\s*import\s[^\n]*?['"]…/`) only saw a
//     specifier sitting on the same line as the keyword, so
//     `import {\n x,\n} from '../assets/x.png'` exited 0 and was filed as a
//     *runtime* reference — I-014, the hole this module closes;
//   * the obvious repair, letting the pattern cross newlines, swallows the file
//     between an `import` and the next unrelated `'assets/…'` literal and
//     starts failing legal runtime code — the counter-example
//     `tools/assets/README.md` has warned about since T-017.
//
// So this reads the statement's grammar instead. After the keyword only an
// import clause may appear — identifiers, `*`, `as`, `,`, `{`, `}`, comments,
// whitespace — the specifier is the first string literal, and (except for a
// side-effect `import 'x'`) the word immediately before it must be `from`. The
// first character that cannot belong to a clause ends the scan, so a statement
// can never reach past its own terminator into the next line's string.
//
// Everything here is a lexer, not a parser: see the limitations section of
// tools/assets/README.md § "Game independence".

const IDENT = /[A-Za-z0-9_$]/;
const WS = /\s/;

// A `/` after one of these words starts a regex literal, not a division.
const REGEX_AFTER = new Set([
  'return', 'typeof', 'case', 'in', 'of', 'do', 'else', 'void', 'delete',
  'instanceof', 'yield', 'await', 'new', 'throw',
]);

function regexAllowed(lastSig, lastWord) {
  if (lastSig === '') return true;                       // start of file
  if (lastSig === ')' || lastSig === ']') return false;   // (a + b) / c, x[0] / 2
  if (IDENT.test(lastSig)) return REGEX_AFTER.has(lastWord);
  return true;                                           // after an operator or ; { } ,
}

/** End of a quoted string that opens at `i`, or null if the line ends first.
 *  Returns the index one past the closing quote. A raw newline means the quote
 *  was not a string opener at all (JS strings do not span lines unescaped) —
 *  reporting that as "unterminated" keeps a mis-lex local to one line instead
 *  of letting it swallow the rest of the file. */
export function endOfQuoted(text, i, quote) {
  for (let k = i + 1; k < text.length; k++) {
    const c = text[k];
    if (c === '\\') { k++; continue; }
    if (c === '\n') return null;
    if (c === quote) return k + 1;
  }
  return null;
}

/** End of a template literal opening at `i` (one past the closing backtick).
 *  `${}` interpolation is not tracked: the contents are masked either way. */
function endOfTemplate(text, i) {
  for (let k = i + 1; k < text.length; k++) {
    const c = text[k];
    if (c === '\\') { k++; continue; }
    if (c === '`') return k + 1;
  }
  return text.length;
}

/** End of a regex literal opening at `i`, or null if the line ends first. */
function endOfRegex(text, i) {
  let inClass = false;
  for (let k = i + 1; k < text.length; k++) {
    const c = text[k];
    if (c === '\\') { k++; continue; }
    if (c === '\n') return null;
    if (inClass) { if (c === ']') inClass = false; continue; }
    if (c === '[') { inClass = true; continue; }
    if (c === '/') return k + 1;
  }
  return null;
}

/**
 * One lexer pass over a module, producing two masks of the SAME length as the
 * source (newlines preserved), so any offset in a mask indexes the original:
 *
 *   code — comments blanked. String and regex literals survive intact, so a
 *          specifier can still be read and a runtime `'assets/…'` still shows.
 *   bare — comments blanked AND the contents of every string, template and
 *          regex literal blanked. An `import` keyword found here is real code,
 *          never prose in a comment or text inside a string.
 */
export function maskSource(text) {
  const n = text.length;
  const code = text.split('');
  const bare = text.split('');
  const blankBoth = (a, b) => {
    for (let k = a; k < b; k++) {
      const ch = text[k] === '\n' ? '\n' : ' ';
      code[k] = ch; bare[k] = ch;
    }
  };
  const blankBare = (a, b) => {
    for (let k = a; k < b; k++) bare[k] = text[k] === '\n' ? '\n' : ' ';
  };

  let i = 0, lastSig = '', lastWord = '';
  // A leading shebang is a comment to Node, and lexing it as code was a real
  // bug: `/usr/` reads as a regex literal, `node` as the last identifier, and
  // the file's first import statement then looked like a property access and
  // was skipped.
  if (text[0] === '#' && text[1] === '!') {
    let j = 0;
    while (j < n && text[j] !== '\n') j++;
    blankBoth(0, j); i = j;
  }
  while (i < n) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '/') {
      let j = i;
      while (j < n && text[j] !== '\n') j++;
      blankBoth(i, j); i = j; continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const j = end < 0 ? n : end + 2;
      blankBoth(i, j); i = j; continue;
    }
    if (c === "'" || c === '"') {
      const j = endOfQuoted(text, i, c);
      if (j !== null) { blankBare(i + 1, j - 1); lastSig = c; lastWord = ''; i = j; continue; }
      // unterminated on this line — treat the quote as an ordinary character
    } else if (c === '`') {
      const j = endOfTemplate(text, i);
      blankBare(i + 1, j - 1); lastSig = c; lastWord = ''; i = j; continue;
    } else if (c === '/' && regexAllowed(lastSig, lastWord)) {
      const j = endOfRegex(text, i);
      if (j !== null) { blankBare(i + 1, j - 1); lastSig = '/'; lastWord = ''; i = j; continue; }
      // no closing slash on this line — it was a division after all
    }
    if (IDENT.test(c)) {
      let j = i;
      while (j < n && IDENT.test(text[j])) j++;
      lastWord = text.slice(i, j); lastSig = text[j - 1]; i = j; continue;
    }
    if (!WS.test(c)) { lastSig = c; lastWord = ''; }
    i++;
  }
  return { code: code.join(''), bare: bare.join('') };
}

/** Read the module specifier of the statement whose keyword ends at `i`.
 *  Returns null the moment the text stops looking like an import clause —
 *  that is the whole point: `export const U = 'assets/x'`, `import(`,
 *  `import.meta`, `export default 'assets/x'` and a bare `export { a }` all
 *  bail here, and no statement can read past its own end. */
function readSpecifier(code, i, kind) {
  const n = code.length;
  let sawClause = false, lastWord = '';
  while (i < n) {
    const c = code[i];
    if (WS.test(c)) { i++; continue; }
    if (c === "'" || c === '"') {
      const end = endOfQuoted(code, i, c);
      if (end === null) return null;
      const isSpecifier = lastWord === 'from' || (kind === 'import' && !sawClause);
      return isSpecifier ? { specifier: code.slice(i + 1, end - 1), end } : null;
    }
    if (IDENT.test(c)) {
      let j = i;
      while (j < n && IDENT.test(code[j])) j++;
      lastWord = code.slice(i, j); sawClause = true; i = j; continue;
    }
    if (c === '*' || c === ',' || c === '{' || c === '}') {
      lastWord = ''; sawClause = true; i++; continue;
    }
    return null;
  }
  return null;
}

const lineOf = (text, offset) => {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) if (text[i] === '\n') line++;
  return line;
};

/**
 * Every static `import … from '…'`, `import '…'` and `export … from '…'` in a
 * module, with the 1-based line span of the whole statement.
 *
 * `export … from` counts: a re-export is exactly as hard a dependency as an
 * import, and the "boots with every asset file missing" invariant does not care
 * which keyword bound the module.
 */
export function scanStaticImports(text, masks = maskSource(text)) {
  const { code, bare } = masks;
  const out = [];
  const kw = /\b(import|export)\b/g;
  let m;
  while ((m = kw.exec(bare)) !== null) {
    const at = m.index;
    // Only what precedes the keyword ON ITS OWN LINE can disqualify it — a
    // keyword that starts its line is a statement, whatever came before. (An
    // earlier version searched back across newlines for the last significant
    // character, which let an unrelated identifier on the previous line hide a
    // real import.)
    const sameLine = bare.slice(bare.lastIndexOf('\n', at - 1) + 1, at);
    const prev = sameLine.replace(/[ \t]+$/, '').slice(-1);
    if (prev === '.' || (prev && IDENT.test(prev))) continue;   // obj.import, notimport
    const found = readSpecifier(code, at + m[1].length, m[1]);
    if (!found) continue;
    out.push({
      kind: m[1],
      specifier: found.specifier,
      line: lineOf(text, at),
      endLine: lineOf(text, found.end - 1),
    });
    kw.lastIndex = found.end;
  }
  return out;
}

/** The static imports whose specifier names an `assets/` path. */
export function assetImports(text, masks = maskSource(text)) {
  return scanStaticImports(text, masks).filter((imp) => /assets\//.test(imp.specifier));
}
