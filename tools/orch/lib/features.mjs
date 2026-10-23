// features.mjs — T-108 scratch helper: mechanical features of each pathcheck
// call site, used as EVIDENCE for (never a substitute for) the hand
// classification in tools/orch/test-audit-spec.mjs.
//
//   srcText   the assertion's condition reads a variable that holds the TEXT of
//             a file under src/, index.html or tools/ (readFileSync without
//             JSON.parse, or derived from such a variable by .exec/.slice/...)
//   jsonData  the assertion reads a parsed JSON file (reports, scripts)
//   exactLit  the condition compares something to a numeric/string literal with
//             === (a candidate constant pin; many are legitimate)
//   fingerprint  the condition compares a hash/fingerprint
//
// Read-only. Zero effect on the game or the gate.
//
// Limitations: variable tracking is lexical and name-based (no scopes), so a
// name reused for a non-text value in another block of the same file can be
// over-flagged. The spec's hand classification wins wherever they disagree;
// test-census.mjs reports how often they disagree.

function statementAfter(src, idx) {
  // the initializer text from idx to the first ';' or newline-at-depth-0 that ends it
  let depth = 0;
  for (let i = idx; i < src.length; i++) {
    const c = src[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') { if (depth === 0) return src.slice(idx, i); depth--; }
    else if (c === ';' && depth === 0) return src.slice(idx, i);
    if (i - idx > 4000) return src.slice(idx, i);
  }
  return src.slice(idx);
}

export function fileTextVars(src) {
  const vars = new Set();
  const helpers = new Set();
  // helper functions that return file text: const read = (p) => readFileSync(...)
  for (const m of src.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*\([^)]*\)\s*=>\s*([^\n;]*)/g)) {
    if (/readFileSync\(/.test(m[2]) && !/JSON\.parse\(/.test(m[2])) helpers.add(m[1]);
  }
  for (const m of src.matchAll(/function\s+(\w+)\s*\([^)]*\)\s*\{([\s\S]{0,400}?)\}/g)) {
    if (/return[^;]*readFileSync\(/.test(m[2]) && !/JSON\.parse\(/.test(m[2])) helpers.add(m[1]);
  }
  const decls = [...src.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*/g)].map((m) => ({
    name: m[1], init: statementAfter(src, m.index + m[0].length),
  }));
  const forOf = [...src.matchAll(/for\s*\(\s*(?:const|let|var)\s+(?:\[([^\]]+)\]|(\w+))\s+of\s+([^)]*)\)/g)];
  const readsText = (init) => (/readFileSync\(/.test(init) && !/^\s*JSON\.parse\(/.test(init)) ||
    [...helpers].some((h) => new RegExp('\\b' + h + '\\(').test(init));
  for (const d of decls) if (readsText(d.init)) vars.add(d.name);
  // fixpoint: derived from a text variable
  for (let pass = 0; pass < 6; pass++) {
    const before = vars.size;
    for (const d of decls) {
      if (vars.has(d.name)) continue;
      if (/^\s*JSON\.parse\(/.test(d.init)) continue;
      for (const v of vars) {
        if (new RegExp('\\b' + v + '\\b').test(d.init)) { vars.add(d.name); break; }
      }
    }
    for (const f of forOf) {
      const iter = f[3];
      const names = (f[1] || f[2]).split(',').map((s) => s.trim()).filter(Boolean);
      if (readsText(iter) || [...vars].some((v) => new RegExp('\\b' + v + '\\b').test(iter))) {
        for (const n of names) vars.add(n);
      }
    }
    if (vars.size === before) break;
  }
  return { vars, helpers };
}

export function features(site, ctx) {
  const t = site.text || '';
  const refs = [...ctx.vars].filter((v) => new RegExp('\\b' + v + '\\b').test(t));
  const srcText = refs.length > 0 || (/readFileSync\(/.test(t) && !/JSON\.parse\(\s*readFileSync/.test(t)) ||
    [...ctx.helpers].some((h) => new RegExp('\\b' + h + '\\(').test(t));
  return {
    srcText,
    jsonData: /JSON\.parse\(/.test(t),
    exactLit: /===\s*-?\d|===\s*'[^']*'/.test(t),
    fingerprint: /fingerprint\(|hash/i.test(t),
  };
}
