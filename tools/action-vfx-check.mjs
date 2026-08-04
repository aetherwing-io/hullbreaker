#!/usr/bin/env node
/* Focused browser-free contract for Level 1's action-only VFX pass.
 * Runtime captures prove composition; this protects fixed budgets, family
 * grammar, collision honesty, and the environment pack's attachment fence. */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const juice = read('src/render/juice.js');
const fx = read('src/render/fx.js');
const bullets = read('src/render/bullets.js');
const defense = read('src/render/meridian-defense-vfx.js');
const pack = read('src/render/defense-vfx-pack.js');
let passed = 0;

function ok(value, message) {
  if (!value) throw new Error(`ACTION VFX FAIL: ${message}`);
  console.log(`ok ${++passed} - ${message}`);
}

function slice(from, to) {
  return juice.slice(juice.indexOf(from), juice.indexOf(to));
}

const impact = slice('function emitActionImpact', 'function armActionImpact');
const arm = slice('function armActionImpact', 'function updateActionImpacts');
const update = slice('function updateActionImpacts', 'function resetActionImpacts');
const actorHit = slice('function onHostileSync', 'let deathChain');

ok(/const ACTION_IMPACT_MAX = 16/.test(juice) &&
   /Array\.from\(\{ length: ACTION_IMPACT_MAX \}/.test(juice),
  'action staging owns exactly sixteen preallocated render rows');
ok(/actionImpactCursor = \(actionImpactCursor \+ 1\) % ACTION_IMPACT_MAX/.test(arm) &&
   /if \(row\.active\) actionImpactRecycles\+\+/.test(arm),
  'impact claims are O(1) round-robin and saturation is measured');
ok(!/\bnew\s+|\.push\(|\.splice\(|\.concat\(/.test(arm + update),
  'impact hot paths never allocate or grow a collection');
ok(/for \(let i = 0; i < ACTION_IMPACT_MAX; i\+\+\)/.test(update) &&
   /row\.active = false/.test(update),
  'the per-frame sequencer scans one fixed ceiling and retires dormant rows');

for (const type of ['S', 'L', 'H', 'F'])
  ok(new RegExp(`row\\.type === '${type}'`).test(impact),
    `${type} owns an authored actor-impact sentence`);
ok(/Rivet: a hard pin/.test(impact) && /fxCoreRupture/.test(impact),
  'R owns the compact pin/chip baseline rather than a generic blast');
ok(/Scatterbloom arrives as a clipped rake/.test(impact) &&
   /fxRoleFragments\(role/.test(impact),
  'S separates clipped fan, armour fragments, and reverse rake');
ok(/Lance opens one narrow seam/.test(impact) && /fxImplode\(92/.test(impact),
  'L separates seam, through-line, and collapsing afterimage');
ok(/const px = -dy, py = ds/.test(impact) &&
   /guidance vanes shear across the flight line/.test(impact),
  'H derives two vane-shear beats perpendicular to incoming travel');
ok(/Cindermouth bites once/.test(impact) && /fxVapor\(/.test(impact),
  'F separates bite, gravity-led solids, and sparse pressure residue');
ok(!/fxBurst\s*\(|fxRing\s*\(/.test(impact),
  'actor impacts contain no radial particle wheel or radius front');

ok(/hp !== undefined && e\.hp < hp/.test(actorHit) &&
   /armActionImpact\(e, type/.test(actorHit) && !/e\.hp\s*=/.test(actorHit),
  'actor staging observes real damage without writing combat state');
ok(/beat1: 34, beat2: 78/.test(juice) && /beat1: 58, beat2: 138/.test(juice),
  'all staged residue completes inside 138ms, with faster lance timing');
ok(/drawPoolsAdded: 0/.test(juice) && /fixedDrawPools:\s*8/.test(fx),
  'the pass adds zero draw pools and preserves the eight-pool ceiling');
ok(/actionImpacts:\s*\{/.test(juice) && /recycles: actionImpactRecycles/.test(juice),
  'runtime telemetry exposes active, ceiling, cursor, and recycle pressure');
ok(!/CanvasTexture|drawImage|getImageData|createImageBitmap/.test(juice),
  'action composition performs no runtime canvas texture or crop work');

ok(/case 'S':/.test(bullets) && /case 'L':/.test(bullets) &&
   /case 'H':/.test(bullets) && /case 'F':/.test(bullets) &&
   /const s = b\.x, y = b\.y/.test(bullets),
  'exact projectile endpoints retain five family-specific collision sentences');
ok(/"environmentOnly": true/.test(pack) &&
   /"forbiddenAttachments": \[\s*"rig",\s*"player",\s*"projectile"/s.test(pack),
  'the generated response atlas remains environment-only');
ok(/mesh\.userData\.attachments = Object\.freeze\(\[\]\)/.test(defense) &&
   /mesh\.visible = false/.test(defense) && /material\.opacity = 0/.test(defense),
  'dormant environment cues attach to nothing and draw no idle glow');
ok(/poolGeometry: DEFENSE_VFX_ART_SLOT\.tex \? 1 : 0/.test(defense) &&
   /stats\.drawSlots = 1/.test(defense),
  'environment activation remains one atlas, one plane, one active draw');

console.log(`ACTION VFX: ${passed}/${passed} contracts passed`);
