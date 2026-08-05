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
const bridge = read('src/sim/bridge.js');
const weapons = read('src/sim/weapons.js');
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
const bulletHit = slice('function onBulletHostileImpact', 'let deathChain');
const death = slice('function emitDeathSentence', 'function armDeathSentence');
const deathArm = slice('function armDeathSentence', 'function updateDeathSentences');
const deathUpdate = slice('function updateDeathSentences', 'function resetDeathSentences');

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
ok(/Rivet is a hard horizontal pin/.test(impact) && /fxCoreRupture/.test(impact),
  'R owns the compact pin/chip baseline rather than a generic blast');
ok(/five manufactured flechettes/.test(impact) &&
   /fxRoleFragments\(role/.test(impact),
  'S separates clipped fan, armour fragments, and reverse rake');
ok(/long, narrow seam/.test(impact) && /fxImplode\(96/.test(impact),
  'L separates seam, through-line, and collapsing afterimage');
ok(/const px = -dy, py = ds/.test(impact) &&
   /Guidance vanes scissor ACROSS the flight line/.test(impact),
  'H derives two vane-shear beats perpendicular to incoming travel');
ok(/Cindermouth pierces its first two bodies/.test(impact) &&
   /fxDirectionalFlash\(92, 1\.82 \* k, 0\.30 \* k/.test(impact) &&
   /fxVapor\(/.test(impact),
  'F separates bite, gravity-led solids, and sparse pressure residue');
ok(!/fxBurst\s*\(|fxRing\s*\(/.test(impact),
  'actor impacts contain no radial particle wheel or radius front');

ok(/version: 2/.test(juice) &&
   /rivet-contact-pin/.test(juice) && /scatter-contact-rake/.test(juice) &&
   /lance-contact-seam/.test(juice) && /homing-vane-a/.test(juice) &&
   /cinder-contact-bite/.test(juice),
  'semantic v2 hook table preserves four named beats for every weapon family');
ok(/beat1: 48, beat2: 104, beat3: 164/.test(juice) &&
   /beat1: 32, beat2: 74, beat3: 132/.test(juice) &&
   /beat1: 54, beat2: 122, beat3: 214/.test(juice) &&
   /row\.stage === 2 && elapsed >= W\.beat3/.test(update),
  'all five impact families deliver four bounded beats by 214ms');

ok(/function onBulletHostileImpact/.test(bulletHit) &&
   /armActionImpact\(targetKind, type, x, y, ds, dy/.test(bulletHit) &&
   /hostileHp\.set\(targetId, hostiles\[i\]\.hp\)/.test(bulletHit) &&
   !/\.hp\s*=/.test(bulletHit),
  'actor staging consumes exact collision facts and advances the read-only hp baseline');
ok(/hostileImpact: noop/.test(bridge) &&
   /const damaged = hitHostile/.test(weapons) &&
   /view\.bullets\.hostileImpact\(/.test(weapons) &&
   /i, b\.type, b\.x, b\.y, impactVx, impactVy/.test(weapons) &&
   /directId, targetKind, damaged, lethal/.test(weapons) &&
   !/hostileImpact\(\s*\{/.test(weapons),
  'sim publishes allocation-free damage and blocked collision facts');
ok(/hp !== undefined && e\.hp < hp/.test(actorHit) &&
   /const type = 'R'/.test(actorHit),
  'non-projectile damage retains one neutral fallback without recent-shot inference');

ok(/const DEATH_SENTENCE_MAX = 12/.test(juice) &&
   /Array\.from\(\{ length: DEATH_SENTENCE_MAX \}/.test(juice),
  'role destruction owns exactly twelve preallocated rows');
ok(/deathSentenceCursor = \(deathSentenceCursor \+ 1\) % DEATH_SENTENCE_MAX/.test(deathArm) &&
   !/\bnew\s+|\.push\(|\.splice\(|\.concat\(/.test(deathArm + deathUpdate),
  'death claims and updates remain fixed-ceiling O(1) work');
ok(/row\.kind === 'wasp'/.test(death) && /fxRoleFragments\('wing'/.test(death) &&
   /row\.kind === 'hound'/.test(death) && /fxRoleFragments\('hound'/.test(death) &&
   /row\.kind === 'polyp' \|\| row\.kind === 'mortar'/.test(death) &&
   /fxRoleFragments\('machine'/.test(death),
  'wasp wings, hound scutes, and rooted brackets have distinct destruction grammar');
ok(/wasp: Object\.freeze\(\[58, 142, 268\]\)/.test(juice) &&
   /hound: Object\.freeze\(\[72, 176, 318\]\)/.test(juice) &&
   /mortar: Object\.freeze\(\[68, 174, 326\]\)/.test(juice) &&
   /corpseTransformWrites: 0/.test(juice),
  'role deaths stage four beats while leaving corpse pose ownership untouched');
ok(/row\.started = false/.test(deathArm) &&
   /if \(!row\.started\) \{ row\.started = true; emitDeathSentence\(row, 0\); \}/.test(deathUpdate) &&
   /row\.targetId !== targetId/.test(bulletHit) &&
   /row\.x = x; row\.y = y/.test(bulletHit),
  'lethal removal defers beat zero until the exact projectile terminal corrects it');
ok(/if \(e\.kind !== 'warden'\) \{[\s\S]*armDeathSentence/.test(juice) &&
   /Warden contact is deliberately absent here/.test(juice),
  'Warden removal emits no body-centre fake contact before the terminal hook');
ok(/Signal packets run back along the severed rails/.test(juice) &&
   /fxDirectionalFlash\(215, 1\.04, 0\.10/.test(juice) &&
   /fxDirectionalFlash\(150, 1\.34, 0\.09/.test(juice) &&
   !/fxImplode\(360, 2\.75/.test(juice) &&
   !/fxFlash\(165, 0\.78/.test(juice),
  'Warden delayed failure uses offset mechanical seams instead of a radial sticker or white lamp');
ok(/drawPoolsAdded: 0/.test(juice) && /fixedDrawPools:\s*8/.test(fx),
  'the pass adds zero draw pools and preserves the eight-pool ceiling');
ok(/actionImpacts:\s*\{/.test(juice) && /recycles: actionImpactRecycles/.test(juice),
  'runtime telemetry exposes active, ceiling, cursor, and recycle pressure');
ok(!/CanvasTexture|drawImage|getImageData|createImageBitmap/.test(juice),
  'action composition performs no runtime canvas texture or crop work');

ok(/const FX_SURFACE_DEPTH = 1\.15/.test(fx) &&
   /FX_SURFACE_DEPTH \+ depth/.test(fx),
  'pooled effects share the actor/projectile surface instead of hiding behind decks');
ok(/blending: THREE\.NormalBlending/.test(fx) &&
   /withInstanceOpacity/.test(fx) && /diffuseColor\.a \*= vInstanceOpacity/.test(fx) &&
   /Physical wreckage does not shrink out of existence/.test(fx) &&
   /const s = row\.size/.test(fx),
  'physical fragments retain role mass and retire through fixed per-instance alpha');
ok(/export function setFxProofVisible/.test(fx) &&
   /fragmentMeshes\[i\]\.visible = proofVisible/.test(fx),
  'same-frame proof can hide exactly the existing fixed pools without replay');

ok(/export function installJuiceHostileBridge/.test(juice) &&
   /Symbol\.for\('hullbreaker\.juiceObserver'\)/.test(juice) &&
   /installJuiceHostileBridge\(\)/.test(juice),
  'late async hostile art is fenced by an idempotent final juice bridge install');

ok(/case 'S':/.test(bullets) && /case 'L':/.test(bullets) &&
   /case 'H':/.test(bullets) && /case 'F':/.test(bullets) &&
   /const s = b\.x, y = b\.y/.test(bullets),
  'exact projectile endpoints retain five family-specific collision sentences');
ok(/case 'F':[\s\S]*if \(reason !== 'hostile'\)/.test(bullets),
  'Cindermouth hostileImpact owns contact without a duplicate terminal bite');
ok(/"environmentOnly": true/.test(pack) &&
   /"forbiddenAttachments": \[\s*"rig",\s*"player",\s*"projectile"/s.test(pack),
  'the generated response atlas remains environment-only');
ok(/mesh\.userData\.attachments = Object\.freeze\(\[\]\)/.test(defense) &&
   /mesh\.visible = false/.test(defense) && /material\.opacity = 0/.test(defense),
  'dormant environment cues attach to nothing and draw no idle glow');
ok(/poolGeometry: DEFENSE_VFX_ART_SLOT\.tex \? 1 : 0/.test(defense) &&
   /stats\.drawSlots = 1/.test(defense) &&
   /mechanismPools: 2/.test(defense) &&
   /stats\.mechanismDrawSlots = 2/.test(defense) &&
   /textureTransforms: false/.test(defense),
  'environment activation remains one atlas transient plus two fixed body mechanisms');

console.log(`ACTION VFX: ${passed}/${passed} contracts passed`);
