/* Production hull/limb silhouette contract.  This is deliberately about the
   renderer's fixed primitive vocabulary and the pure plan's safety fences;
   traversal and collision remain owned by the existing level domains. */

import { readFileSync } from 'node:fs';
import { CONFIG } from '../../src/config.js';
import { buildLevel } from '../../src/pure/generator.js';
import {
  limbBakePlan, limbFacets, limbPlanViolations,
} from '../../src/pure/limb.js';
import { ok, srcDir, stripComments } from './_context.mjs';

export const title = 'production limb silhouette: connected macro anatomy';

function table(src, declaration) {
  const start = src.indexOf(declaration);
  const body = src.slice(start, src.indexOf('});', start));
  const out = new Map();
  for (const match of body.matchAll(/(\w+):\s*'(\w+)'/g)) out.set(match[1], match[2]);
  return out;
}

export async function run() {
  const renderRaw = readFileSync(new URL('../../src/render/limb.js', import.meta.url), 'utf8');
  const render = stripComments(renderRaw);
  const level = buildLevel(CONFIG);
  const plan = limbBakePlan(CONFIG, level.groundH);
  const prod = table(renderRaw, 'const PRODUCTION_SHAPE_FOR');
  const legacy = table(renderRaw, 'const LEGACY_SHAPE_FOR');
  const macro = [
    'hull', 'hullRib', 'wall', 'lipScute', 'bdLimb', 'bdLimbLip', 'bdRing',
    'bdDrum', 'bdLink', 'bdFar', 'bdSpire', 'collar', 'buttress', 'cup',
  ];

  ok(plan.length > 1000 && limbPlanViolations(plan, CONFIG, level.groundH).length === 0,
    `the production renderer consumes the unchanged legal static body (${plan.length} pieces)`);
  ok(/QUERY\.get\('limbs'\)\s*!==\s*'legacy'/.test(render),
    'production is the default and ?limbs=legacy is the same-build visual A/B');
  ok(macro.every((kind) => prod.has(kind) && prod.get(kind) !== 'box'),
    'every large body, backdrop and joint kind routes away from the box primitive');
  ok(legacy.get('bdLimbLip') == null && legacy.get('bdLink') == null &&
    legacy.get('bdSpire') == null,
    'the A/B retains the former implicit box routing for links, lips and spires');
  ok(prod.get('bdLimb') === 'body' && prod.get('bdFar') === 'body' &&
    prod.get('wall') === 'scute',
    'omitted distance cards require no extra geometry; far mass shares the body lobe and gill backing the second');
  ok(prod.get('hullRib') === prod.get('bdLimbLip') &&
    prod.get('bdLimbLip') === prod.get('bdLink'),
    'under-deck contact line, sister lip and vertebral shaft share one connector family');
  ok(prod.get('lipScute') === 'scute' && prod.get('collar') === 'rib' &&
    prod.get('cup') === 'rib',
    'legacy lip data needs no extra production primitive while joint hardware stays faceted hardpoints');
  ok(/const PRODUCTION_OMIT_KINDS\s*=\s*new Set\(\[[\s\S]*'lipScute'[\s\S]*'bdLimb'[\s\S]*'bdDrum'[\s\S]*'bdFar'/.test(render) &&
    /if\s*\(omitProductionPiece\(plan\[n\]\)\)\s*continue/.test(render),
    'production omits the duplicate brown lip and old floating backdrop cards before pool upload');
  ok(/piece\.depth\s*<\s*0\s*&&\s*piece\.kind\.startsWith\('mark'\)/.test(render),
    'far-side reference marks leave with their omitted sister limb instead of floating unattached');
  ok(!/routeScute|SISTER_OUTLINE|LIP_WIDTH_GAIN/.test(render),
    'omitted accents allocate no replacement geometry, garnish or dead production pools');
  ok(/function mechanicalLobeGeometry\(outline, bevelSize, bevelThickness, rootFade\s*=\s*false\)/.test(render) &&
    /new THREE\.ExtrudeGeometry\(shape/.test(render) &&
    /bevelEnabled:\s*true/.test(render),
    'large anatomy uses a beveled polygon extrusion with a real screen-plane silhouette');
  ok(/setAttribute\('color', new THREE\.BufferAttribute\(colors, 3\)\)/.test(render) &&
    /nz\s*>\s*0\.72/.test(render) && /nz\s*<\s*-0\.72/.test(render),
    'front, back and contact bevels carry an authored value split without another material');
  ok(/const geometry\s*=\s*\{[\s\S]*mechanicalLobeGeometry\(BODY_OUTLINES\[0\]/.test(render) &&
    /mechanicalLobeGeometry\(BODY_OUTLINES\[1\]/.test(render) &&
    /mechanicalLobeGeometry\(BODY_OUTLINES\[2\]/.test(render) &&
    /mechanicalLobeGeometry\(MACRO_SCUTE_OUTLINE/.test(render),
    'three bucket-reused under-deck roots and macro armour are allocated once inside the boot bake');
  const foldBody = render.slice(render.indexOf('export function updateLimbFoldCull'),
    render.indexOf('export function limbFoldCullSnapshot'));
  ok(!/\bnew\s+THREE\.|\.map\(|\.filter\(|\.reduce\(/.test(foldBody),
    'the fold callback creates no Three.js values while culling fixed instances');
  ok(/mesh\.userData\.limbSilhouette\s*=/.test(render) &&
    /mesh\.userData\.environmentRole\s*=\s*'limb-anatomy'/.test(render),
    'every fixed pool exposes its silhouette variant and environment role for visual QA');
  for (const facet of limbFacets(CONFIG)) {
    const pieces = plan.filter((piece) => piece.facet === facet.k);
    ok(pieces.some((piece) => piece.kind === 'hull') &&
      pieces.some((piece) => piece.kind === 'bdFar') &&
      pieces.some((piece) => piece.kind === 'bdLink'),
      `facet ${facet.k} carries connected near body, far mass and vertebral links`);
  }
  ok(!/atmosphere\.js|backdrop\.js/.test(renderRaw),
    'limb cleanup remains independent of the frozen atmosphere composition');
  ok(readFileSync(new URL('../../src/pure/limb.js', import.meta.url), 'utf8')
    .includes('THE LIMB NEVER MOVES'),
    'the pure plan retains its static-anatomy contract');
  ok(srcDir.endsWith('/src'), 'contract resolves the shared source root');
}
