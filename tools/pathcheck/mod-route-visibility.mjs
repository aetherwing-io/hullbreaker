import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ok, srcDir, stripComments } from './_context.mjs';

export const title = 'modifier echoes and telegraphs obey route visibility';

export async function run() {
  const mods = stripComments(
    readFileSync(join(srcDir, 'render', 'mods.js'), 'utf8'),
  );

  ok(/import\s*\{\s*routeRenderable\s*\}\s*from\s*['"]\.\/route-visibility\.js['"]/.test(mods),
     'modifier presentation uses the shared build-and-facet visibility contract');
  ok(/const\s+cm\s*=\s*cloneMeshes\[d\];\s*cm\.visible\s*=\s*false;\s*if\s*\(\s*!p\s*\|\|\s*!routeRenderable\(p\.x\)\s*\)\s*continue;\s*cm\.visible\s*=\s*true;/.test(mods),
     'each clone slot clears stale art before requiring a present, route-owned trail sample');
  ok(/lanceBeam\.visible\s*=\s*routeRenderable\(L\.s\);\s*if\s*\(\s*!lanceBeam\.visible\s*\)\s*return;\s*placeOnTower\(lanceBeam,\s*L\.s,/.test(mods),
     'the orbital-lance telegraph cannot be placed on an unbuilt or off-camera facet');
}
