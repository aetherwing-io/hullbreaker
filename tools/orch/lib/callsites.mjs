// callsites.mjs — T-108 scratch helper: find every ok()/near() call site in a
// pathcheck domain file and recover its message text, without a JS parser
// dependency. A small lexer skips comments, strings, template literals and
// regex literals so bracket matching does not trip over `/\(/` or `'('`.
//
// Used by tools/orch/test-census.mjs. Read-only; zero effect on the game.
//
// Limitations (stated, not hidden): the regex-literal rule is the usual
// "a slash after an operator/keyword/open bracket starts a regex" heuristic.
// It is exact for every file in tools/pathcheck/ at the time of writing
// (the census cross-checks: every call it finds must close its bracket before
// end of file, or the file is reported as unparsed instead of miscounted).

const REGEX_PREV = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%',
  '<', '>', '~', '^', '\n']);
const REGEX_KEYWORDS = /(?:^|[^\w$])(return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)\s*$/;

/** Returns an array of token spans {kind, start, end} for code (kind 'code'
 *  chunks are single chars) — only what bracket matching needs. */
export function lex(src) {
  const out = [];          // [{kind:'str'|'tpl'|'re'|'com'|'ch', start, end}]
  let i = 0;
  let lastSig = '\n';      // last significant (non-space) char of code
  let lastSigIndex = -1;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') { const j = src.indexOf('\n', i); const e = j < 0 ? n : j; out.push({ kind: 'com', start: i, end: e }); i = e; continue; }
    if (c === '/' && d === '*') { const j = src.indexOf('*/', i + 2); const e = j < 0 ? n : j + 2; out.push({ kind: 'com', start: i, end: e }); i = e; continue; }
    if (c === '\'' || c === '"') {
      let j = i + 1;
      while (j < n && src[j] !== c) { if (src[j] === '\\') j++; if (src[j] === '\n') break; j++; }
      out.push({ kind: 'str', start: i, end: j + 1 }); i = j + 1; lastSig = 'a'; lastSigIndex = i - 1; continue;
    }
    if (c === '`') {
      // template literal with ${ } nesting
      let j = i + 1, depth = 0;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (depth === 0 && src[j] === '`') break;
        if (src[j] === '$' && src[j + 1] === '{') { depth++; j += 2; continue; }
        if (depth > 0 && src[j] === '}') { depth--; j++; continue; }
        j++;
      }
      out.push({ kind: 'tpl', start: i, end: j + 1 }); i = j + 1; lastSig = 'a'; lastSigIndex = i - 1; continue;
    }
    if (c === '/') {
      const before = src.slice(Math.max(0, lastSigIndex - 12), lastSigIndex + 1);
      const isRe = REGEX_PREV.has(lastSig) || REGEX_KEYWORDS.test(before);
      if (isRe) {
        let j = i + 1, inClass = false;
        while (j < n) {
          if (src[j] === '\\') { j += 2; continue; }
          if (src[j] === '\n') break;
          if (inClass) { if (src[j] === ']') inClass = false; }
          else if (src[j] === '[') inClass = true;
          else if (src[j] === '/') break;
          j++;
        }
        j++;
        while (j < n && /[a-z]/i.test(src[j])) j++;
        out.push({ kind: 're', start: i, end: j }); i = j; lastSig = 'a'; lastSigIndex = j - 1; continue;
      }
    }
    if (!/\s/.test(c)) { lastSig = /[\w$)\]]/.test(c) ? 'a' : c; lastSigIndex = i; }
    out.push({ kind: 'ch', start: i, end: i + 1 });
    i++;
  }
  return out;
}

/** Every ok( / near( call: { fn, line, endLine, text, message }. */
export function callSites(src) {
  const toks = lex(src);
  const starts = [0];
  for (let k = 0; k < src.length; k++) if (src.charCodeAt(k) === 10) starts.push(k + 1);
  const lineAt = (idx) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= idx) lo = mid; else hi = mid - 1; } return lo + 1; };
  const byStart = new Map(toks.map((x, k) => [x.start, k]));
  const sites = [];
  const codeIdx = [];      // indices into toks of code chars
  for (let t = 0; t < toks.length; t++) if (toks[t].kind === 'ch') codeIdx.push(t);
  for (let ci = 0; ci < codeIdx.length; ci++) {
    const tok = toks[codeIdx[ci]];
    const ch = src[tok.start];
    if (ch !== 'o' && ch !== 'n') continue;
    const word = src.startsWith('ok(', tok.start) ? 'ok' : src.startsWith('near(', tok.start) ? 'near' : null;
    if (!word) continue;
    const prev = src[tok.start - 1];
    if (prev && /[\w$.]/.test(prev)) continue;               // lookOk( / x.ok(
    const before = src.slice(Math.max(0, tok.start - 9), tok.start);
    if (/function\s+$/.test(before)) continue;                // the definition itself
    // bracket-match from the '(' using tokens
    const open = tok.start + word.length;
    let t = byStart.has(open) ? byStart.get(open) : toks.length;
    let depth = 0, end = -1;
    for (; t < toks.length; t++) {
      const x = toks[t];
      if (x.kind !== 'ch') continue;
      const c = src[x.start];
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') { depth--; if (depth === 0) { end = x.end; break; } }
    }
    if (end < 0) { sites.push({ fn: word, line: lineAt(tok.start), endLine: null, text: null, message: null, unparsed: true }); continue; }
    const text = src.slice(tok.start, end);
    // message = string/template literals in the last top-level argument
    const inner = toks.filter((x) => x.start > open && x.end < end);
    let d2 = 0, lastComma = -1;
    for (const x of inner) {
      if (x.kind !== 'ch') continue;
      const c = src[x.start];
      if (c === '(' || c === '[' || c === '{') d2++;
      else if (c === ')' || c === ']' || c === '}') d2--;
      else if (c === ',' && d2 === 0) lastComma = x.start;
    }
    const msgToks = inner.filter((x) => x.start > lastComma && (x.kind === 'str' || x.kind === 'tpl'));
    const message = msgToks.map((x) => src.slice(x.start + 1, x.end - 1)).join(' … ').replace(/\s+/g, ' ').trim();
    sites.push({ fn: word, line: lineAt(tok.start), endLine: lineAt(end - 1), text, message });
  }
  return sites;
}
