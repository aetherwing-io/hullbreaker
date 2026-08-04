#!/usr/bin/env node
/* Focused browser-free contract for the bounded destruction sentence.
   Runtime captures prove pixels and pool pressure; this gate protects the
   architecture that keeps those pixels honest, role-specific and cheap. */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../src/config.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const fx = read('src/render/fx.js');
const juice = read('src/render/juice.js');
const bullets = read('src/render/bullets.js');
const hostiles = read('src/render/hostiles.js');
let passed = 0;

function ok(value, message) {
  if (!value) throw new Error(`DESTRUCTION FLOURISH FAIL: ${message}`);
  passed++;
  console.log(`ok ${passed} - ${message}`);
}

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const D = CONFIG.juice.destruction;
const P = CONFIG.juice.pools;
ok(D?.core?.ms > 0 && D.core.size >= 0.5 && D.core.size < 1 &&
   D.vapor.ms > D.core.ms && D.vapor.size < 0.8,
  'hot core stays compact while the sparse aftermath outlives it briefly');
ok(['wing', 'hound', 'machine'].every((role) =>
   D[role].count >= 3 && D[role].count <= 6 && D[role].size < 0.4),
  'three role debris alphabets remain small, bounded FAR-scale accents');
ok(P.cores === 24 && P.fragments === 72 && P.vapor === 28,
  'core, shared role-fragment, and vapor capacities are explicit fixed ceilings');

ok(/function rupturedCoreGeometry\(\)/.test(fx) &&
   /function wingFragmentGeometry\(\)/.test(fx) &&
   /function houndFragmentGeometry\(\)/.test(fx) &&
   /function machineFragmentGeometry\(\)/.test(fx) &&
   /function vaporAftermathGeometry\(\)/.test(fx),
  'core, wing, hound, machinery, and vapor own distinct authored silhouettes');
ok(/fragmentMeshes = \[\s*new THREE\.InstancedMesh\(wingFragmentGeometry/.test(fx) &&
   /new THREE\.InstancedMesh\(houndFragmentGeometry/.test(fx) &&
   /new THREE\.InstancedMesh\(machineFragmentGeometry/.test(fx) &&
   /fragments = makePool\(FRAGMENT_MAX\)/.test(fx),
  'three role meshes share one fixed fragment row pool instead of tripling live capacity');
ok(/for \(let m = 0; m < 3; m\+\+\) fragmentMeshes\[m\]\.setMatrixAt\(row\.index, HIDE\)/.test(fx) &&
   /for \(let m = 0; m < 3; m\+\+\) fragmentMeshes\[m\]\.instanceMatrix\.needsUpdate = true/.test(fx),
  'a saturated row uploads the old role HIDE before its recycled silhouette can strand onscreen');

const geometrySlice = stripComments(fx.slice(
  fx.indexOf('function rupturedCoreGeometry()'),
  fx.indexOf('function crushBoundaryGeometry()'),
));
ok(!/SphereGeometry|CircleGeometry|RingGeometry|TorusGeometry|OctahedronGeometry/.test(geometrySlice),
  'destruction geometry contains no sphere, disk, perfect ring, torus, or generic gem');

const spawnSlice = stripComments(fx.slice(
  fx.indexOf('export function fxCoreRupture'),
  fx.indexOf('function spawnFlash'),
));
ok(!/\bnew\s+|\.push\(|\.splice\(/.test(spawnSlice) &&
   /const row = claim\(cores\)/.test(spawnSlice) &&
   /const row = claim\(fragments\)/.test(spawnSlice) &&
   /const row = claim\(vapors\)/.test(spawnSlice),
  'core, fragment, and vapor event paths only claim preallocated rows');
ok(/pool\.claims\+\+/.test(fx) && /pool\.recycles\+\+/.test(fx) &&
   /pool\.cursor = \(pool\.cursor \+ 1\) % pool\.rows\.length/.test(fx),
  'saturation is measured and resolved in O(1) without growing a pool');
ok(/fixedDrawPools:\s*8/.test(fx) && /fixedRows:/.test(fx) &&
   /coreMax:\s*CORE_MAX/.test(fx) && /fragmentMax:\s*FRAGMENT_MAX/.test(fx) &&
   /vaporMax:\s*VAPOR_MAX/.test(fx),
  'runtime telemetry exposes every new pool ceiling and the fixed draw budget');

const removal = stripComments(juice.slice(
  juice.indexOf('function onHostileRemoved'),
  juice.indexOf('// capsules:'),
));
ok(/fxCoreRupture\(e\.x, e\.y/.test(removal) &&
   /fragmentRole = e\.kind === 'wasp' \? 'wing'/.test(removal) &&
   /e\.kind === 'hound' \? 'hound' : 'machine'/.test(removal) &&
   /fxRoleFragments\(fragmentRole/.test(removal) && /fxVapor\(e\.x, e\.y/.test(removal),
  'enemy deaths compose hot core, role-shaped fragments, and sparse aftermath');
ok(/incomingS = impactS \* impactInv/.test(removal) &&
   /incomingY = impactY \* impactInv/.test(removal) &&
   /fxCoreRupture\([^;]*incomingS, incomingY/s.test(removal),
  'death rupture orientation follows the incoming shot-to-hostile axis');
ok(!/fxBurst\s*\(/.test(removal) && !/fxRing\s*\(/.test(removal),
  'enemy death composition uses neither a generic radial burst nor radius front');

const volatile = stripComments(bullets.slice(
  bullets.indexOf('function volatileImpact'),
  bullets.indexOf('// map (s,y)'),
));
ok(/fxCoreRupture\(b\.x, b\.y/.test(volatile) &&
   /fxRoleFragments\('machine', b\.x, b\.y/.test(volatile) &&
   /fxVapor\(b\.x, b\.y/.test(volatile) &&
   !/fxBurst\s*\(|fxRing\s*\(/.test(volatile),
  'VOLATILE composes exact-point core, machine shards, and vapor without a radial glyph');
ok(/reason === 'terrain'/.test(bullets) &&
   /fxCoreRupture\(s, y/.test(bullets) &&
   /fxRoleFragments\('machine', s, y/.test(bullets) && /fxVapor\(s, y/.test(bullets),
  'terrain impact earns the same bounded physical grammar at the exact terminal point');
ok(/reason === 'hostile' \|\| reason === 'terrain'/.test(bullets) &&
   /reason === 'lifetime'/.test(bullets) && !/slotLastS|slotLastY/.test(bullets),
  'the richer pass preserves classified endpoint truth and never restores frame-late guessing');

ok(/const frozenMotion = motionFrame >= 0/.test(hostiles) &&
   /geometry: v\.mesh\.geometry/.test(hostiles) && /map: v\.mat\.map/.test(hostiles) &&
   /frozenMotion/.test(hostiles),
  'motion-atlas corpses still freeze the exact live geometry and painting through rupture');

console.log(`DESTRUCTION FLOURISH: ${passed}/${passed} contracts passed`);
