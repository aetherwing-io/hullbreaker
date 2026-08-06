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
ok(['wing', 'hound', 'machine'].every((role) => new RegExp(
   `new THREE\\.InstancedMesh\\(\\s*withInstanceOpacity\\(${role}FragmentGeometry\\(\\), FRAGMENT_MAX\\),\\s*fragmentMat, FRAGMENT_MAX\\)`,
   's').test(fx)) &&
   /fragments = makePool\(FRAGMENT_MAX\)/.test(fx),
  'three opacity-enabled role meshes share one fixed fragment row pool instead of tripling live capacity');
const fragmentClaim = fx.slice(
  fx.indexOf('export function fxRoleFragments'), fx.indexOf('export function fxVapor'));
ok(/for \(let m = 0; m < 3; m\+\+\) \{[\s\S]*?fragmentMeshes\[m\]\.setMatrixAt\(row\.index, HIDE\);[\s\S]*?instanceOpacity[\s\S]*?\.setX\(row\.index, 0\);[\s\S]*?\}/.test(fragmentClaim) &&
   /for \(let m = 0; m < 3; m\+\+\) \{[\s\S]*?fragmentMeshes\[m\]\.instanceMatrix\.needsUpdate = true;[\s\S]*?instanceOpacity[\s\S]*?\.needsUpdate = true;[\s\S]*?\}/.test(fragmentClaim),
  'a saturated row uploads old-role HIDE and alpha zero before its recycled silhouette can strand onscreen');

const geometrySlice = stripComments(fx.slice(
  fx.indexOf('function rupturedCoreGeometry()'),
  fx.indexOf('if (JUICE_ENABLED)'),
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
const deathSentence = stripComments(juice.slice(
  juice.indexOf('const DEATH_SENTENCE_MAX'),
  juice.indexOf('/* ---------------------------- throttles'),
));
ok(/const DEATH_SENTENCE_MAX = 12/.test(deathSentence) &&
   /const deathSentences = Array\.from\(\{ length: DEATH_SENTENCE_MAX \}/.test(deathSentence) &&
   /function emitDeathSentence\(row, stage\)/.test(deathSentence) &&
   /fxCoreRupture\(/.test(deathSentence) && /fxRoleFragments\(/.test(deathSentence) &&
   /fxVapor\(/.test(deathSentence) &&
   /armDeathSentence\(e, incomingS, incomingY, shotColor, enemyColor/.test(removal) &&
   /if \(e\.kind !== 'warden'\)/.test(removal),
  'enemy deaths arm one fixed staged sentence of hot core, role-shaped fragments, and sparse aftermath');
ok(/incomingS = impactS \* impactInv/.test(removal) &&
   /incomingY = impactY \* impactInv/.test(removal) &&
   /armDeathSentence\(e, incomingS, incomingY/.test(removal) &&
   /incomingS: ds, incomingY: dy/.test(deathSentence) &&
   /fxCoreRupture\([^;]*ds, dy/s.test(deathSentence),
  'staged death rupture orientation follows the incoming shot-to-hostile axis');
ok(!/fxBurst\s*\(/.test(deathSentence) && !/fxRing\s*\(/.test(deathSentence),
  'staged enemy death composition uses neither a generic radial burst nor radius front');

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
