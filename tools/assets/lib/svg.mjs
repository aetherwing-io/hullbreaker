// svg.mjs — pull the authored colors and the declared size out of an SVG.
//
// Deliberately a scanner, not a parser. What the palette check needs is "every
// color a human or a generator typed into this file", and those only ever
// appear in a paint attribute (`fill`, `stroke`, `stop-color`, ...) or in a
// CSS declaration of the same name. Pulling those out with a scan avoids
// dragging an XML/CSS dependency into a repo whose whole point is having none,
// at the cost of the honest limitation recorded in the README: colors arriving
// from outside the file (an external stylesheet, a <use> of a remote symbol)
// are invisible to it. Assets in this pipeline are single self-contained files.

import { readFileSync } from 'node:fs';
import { parseColor } from './color.mjs';

// Values that are legal paint but carry no color of their own.
const STRUCTURAL = new Set(['none', 'transparent', 'currentcolor', 'inherit', 'context-fill', 'context-stroke']);

const PAINT_PROPS = ['fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color', 'color', 'solid-color'];

const ATTR_RE = new RegExp(`\\b(${PAINT_PROPS.join('|')})\\s*=\\s*["']([^"']*)["']`, 'gi');
const DECL_RE = new RegExp(`\\b(${PAINT_PROPS.join('|')})\\s*:\\s*([^;"'}]+)`, 'gi');

/**
 * -> { colors: [{ color, prop, raw, count }], unresolved: [{ raw, prop, why }] }
 * `unresolved` is a hard failure signal, not a warning: a color the checker
 * cannot read is a color the palette gate cannot enforce, and silently
 * skipping it would make a green check meaningless.
 */
export function extractSvgColors(file) {
  const text = readFileSync(file, 'utf8');
  const found = new Map();
  const unresolved = [];

  const consider = (prop, rawValue) => {
    const raw = rawValue.trim();
    const lower = raw.toLowerCase();
    if (!raw || STRUCTURAL.has(lower) || lower.startsWith('url(') || lower.startsWith('var(')) return;
    const rgb = parseColor(raw);
    if (!rgb) {
      unresolved.push({
        raw, prop,
        why: /^[a-z-]+$/i.test(raw)
          ? 'CSS named colors are not resolved by this checker — write the hex instead'
          : 'unrecognised color syntax — use #rrggbb, #rrggbbaa, rgb() or rgba()',
      });
      return;
    }
    const key = `${rgb.r},${rgb.g},${rgb.b},${rgb.a}`;
    if (!found.has(key)) found.set(key, { color: raw, prop, raw, count: 0, alpha: rgb.a });
    found.get(key).count++;
  };

  for (const m of text.matchAll(ATTR_RE)) consider(m[1].toLowerCase(), m[2]);
  for (const m of text.matchAll(DECL_RE)) consider(m[1].toLowerCase(), m[2]);

  return { colors: [...found.values()], unresolved };
}

const LEN_RE = /^([0-9.]+)\s*(px)?$/i;

/**
 * Declared intrinsic size. `width`/`height` win; a viewBox-only SVG reports its
 * user-unit box, which is what the rasterizer scales from either way.
 */
export function readSvgSize(file) {
  const text = readFileSync(file, 'utf8');
  const root = /<svg\b[^>]*>/i.exec(text);
  if (!root) throw new Error(`no <svg> root element: ${file}`);
  const tag = root[0];
  const attr = (name) => {
    const m = new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag);
    return m ? m[1].trim() : null;
  };
  const w = attr('width'), h = attr('height');
  const vb = attr('viewBox');
  const box = vb ? vb.split(/[\s,]+/).map(Number) : null;
  const num = (v) => {
    if (v === null) return null;
    const m = LEN_RE.exec(v);
    return m ? Number(m[1]) : null;             // percentages/em deliberately unhandled
  };
  const width = num(w) ?? (box && box.length === 4 ? box[2] : null);
  const height = num(h) ?? (box && box.length === 4 ? box[3] : null);
  return { width, height, viewBox: box && box.length === 4 ? box : null, declared: { width: w, height: h } };
}
