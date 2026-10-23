// render-stub-hooks.mjs — Node module-loader hooks (node:module register()) that
// let a HEADLESS test import the game's composition-root pieces (src/boot/*)
// for real while every render/UI module they reach is replaced by an inert stub.
//
// Why this exists (T-120). Some player-observable properties live in code that
// imports the renderer: the run-reset registry (src/boot/run-reset.js) mixes sim
// rows (hostile RNG, scroll, player, spawner, ...) with four render rows (corpses,
// tracers, camera yaw, juice presentation). A replica that re-types the sim rows
// cannot see a broken REGISTRY entry (T-108 mutant M34: the hostile-rng row stays
// registered but stops resetting). With these hooks the test runs the shipped
// registry itself; only the render rows become no-ops, which cannot change a
// simulated value because src/sim/ never imports src/render/ (layer purity,
// guarded by tools/pathcheck/_context.mjs before any domain runs).
//
// What a stub is: for a URL under src/render/ or src/ui/, a synthetic module that
// exports every name the real file exports (read from its `export` statements),
// each bound to a no-op function. Nothing under src/sim/, src/pure/, src/boot/,
// src/config.js or src/mode.js is ever stubbed. `three` is never resolved: every
// path to it runs through a stubbed render module first.
//
// Limitations (honesty): exports are found lexically (`export function|class|
// const|let|var NAME`, `export { a, b as c }`); `export * from` is not followed
// (no render module uses it today — a stub missing a name fails the import
// loudly, it does not pass silently). Stubbed constants are functions, not their
// real values, so a boot module that READS a render constant would see a
// function; none does today.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const STUB = 'hb-render-stub';
const STUBBED = /\/src\/(render|ui)\/[^?#]*\.js$/;

export async function resolve(specifier, context, next) {
  const r = await next(specifier, context);
  if (r.url.startsWith('file:') && STUBBED.test(r.url)) {
    return { ...r, url: r.url + '?' + STUB, shortCircuit: true };
  }
  return r;
}

function exportedNames(src) {
  const names = new Set();
  for (const m of src.matchAll(/^\s*export\s+(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^\s*export\s+class\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^\s*export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^\s*export\s+(?:const|let|var)\s+\{([^}]*)\}/gm)) {
    for (const part of m[1].split(',')) {
      const n = part.split(':').pop().trim();
      if (/^[A-Za-z_$][\w$]*$/.test(n)) names.add(n);
    }
  }
  for (const m of src.matchAll(/^\s*export\s*\{([^}]*)\}/gm)) {
    for (const part of m[1].split(',')) {
      const bits = part.trim().split(/\s+as\s+/);
      const n = (bits[1] || bits[0] || '').trim();
      if (/^[A-Za-z_$][\w$]*$/.test(n) && n !== 'default') names.add(n);
    }
  }
  return [...names];
}

export async function load(url, context, next) {
  if (!url.endsWith('?' + STUB)) return next(url, context);
  const file = fileURLToPath(url.slice(0, -(STUB.length + 1)));
  const names = exportedNames(readFileSync(file, 'utf8'));
  const body = names.map((n) => `export const ${n} = function ${n}() {};`).join('\n');
  return {
    format: 'module',
    shortCircuit: true,
    source: `// inert render/ui stub for ${file} (tools/pathcheck/lib/render-stub-hooks.mjs)\n${body}\nexport default undefined;\n`,
  };
}
