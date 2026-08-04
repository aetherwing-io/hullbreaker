/* Crown finale architecture contract. This guards the fixed world landmark,
   its modular art ownership and its action-only state layers; encounter
   timing, hostile behavior and summit foreground plating live elsewhere. */

import { readFileSync } from 'node:fs';
import { CONFIG } from '../../src/config.js';
import {
  CROWN_APPROACH, CROWN_MECHANICAL_LIMITS, crownBakePlan, crownBounds,
  crownMechanicalPose, stepCrownTurbine,
} from '../../src/pure/crown.js';
import { ok, stripComments } from './_context.mjs';

export const title = 'Crown command organ: modular rooted finale';

export async function run() {
  const pure = readFileSync(new URL('../../src/pure/crown.js', import.meta.url), 'utf8');
  const renderRaw = readFileSync(new URL('../../src/render/crown.js', import.meta.url), 'utf8');
  const artRaw = readFileSync(new URL('../../src/render/crown-art.js', import.meta.url), 'utf8');
  const finaleRaw = readFileSync(new URL('../../src/render/finale.js', import.meta.url), 'utf8');
  const mainRaw = readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8');
  const render = stripComments(renderRaw);
  const finale = stripComments(finaleRaw);
  const art = stripComments(artRaw);
  const plan = crownBakePlan(CONFIG);
  const legacy = crownBakePlan(CONFIG, CROWN_APPROACH.deckY, { legacy: true });
  const bounds = crownBounds(CONFIG);
  const idleMotion = crownMechanicalPose();
  const motionSamples = Array.from({ length: 121 }, (_, i) => crownMechanicalPose({
    packetAgeMs: i * CROWN_MECHANICAL_LIMITS.packetDurationMs / 120,
    ruptureAgeMs: i * CROWN_MECHANICAL_LIMITS.ruptureDurationMs / 120,
    transmissionAgeMs: i * CROWN_MECHANICAL_LIMITS.transmissionDurationMs / 120,
  }));
  const core = CONFIG.levelLength - CROWN_APPROACH.coreFromEnd;
  const byKind = (kind) => plan.filter((p) => p.kind === kind);

  const expectedKinds = Object.freeze({
    coreArt: 1,
    rootArt: 2,
    antennaArt: 1,
    backplane: 1,
    foundation: 5,
    shell: 6,
    hardware: 5,
    antenna: 3,
    signal0: 2,
    signal1: 1,
    signal2: 2,
    void: 1,
    damage: 1,
  });
  ok(plan.length === 31 && legacy.length === 7 && plan.every(Object.isFrozen),
    'production is a frozen 31-part modular organ; the seven-part former plinth is capture-only');
  ok(Object.entries(expectedKinds).every(([kind, count]) => byKind(kind).length === count),
    'four art organs, buried anatomy, shell hardware, three signal stages and physical payoff parts are fixed');
  ok(bounds.s1 - bounds.s0 > 37 && bounds.y1 - bounds.y0 > 26 &&
    bounds.y0 < CROWN_APPROACH.deckY - 3.5 && bounds.y1 > CROWN_APPROACH.deckY + 22,
  'the command organ owns a broad buried shoulder and a tall, asymmetric skyline');
  ok(bounds.nearestDepth < -1.5 && plan.every((p) => p.depth + p.d / 2 < 0),
    'every Crown surface remains behind the play plane and combat silhouettes');
  ok(idleMotion.rootCompression === 0 && idleMotion.coreKick === 0 &&
    idleMotion.antennaWhip === 0 && idleMotion.transmissionRecoil === 0 &&
    motionSamples.every((pose) => pose.rootCompression >= 0 && pose.rootCompression <= 1 &&
      pose.coreKick >= 0 && pose.coreKick <= 1 && Math.abs(pose.antennaWhip) <= 1 &&
      pose.transmissionRecoil >= 0 && pose.transmissionRecoil <= 1),
  'mechanical groups are dormant without events and every action envelope is purely bounded');
  const stepped = stepCrownTurbine(0, 10000, true);
  ok(stepped > 0 && stepped <= CROWN_MECHANICAL_LIMITS.turbineRadiansPerSecond *
    CROWN_MECHANICAL_LIMITS.turbineMaxStepMs / 1000 + 1e-12 &&
    Math.abs(stepCrownTurbine(stepped, 10000, false) - stepped) < 1e-12,
  'the turbine advances only during committed attacks and caps resumed-tab time steps');

  const arts = [
    ...byKind('coreArt'), ...byKind('rootArt'), ...byKind('antennaArt'),
  ];
  const roots = byKind('rootArt');
  ok(arts.length === 4 && new Set(arts.map((p) => p.asset)).size === 4 &&
    new Set(arts.map((p) => p.depth.toFixed(2))).size === 4,
  'core, left root, right root and antenna are independent organs at distinct depths');
  ok(roots.some((p) => p.s < core && p.y - p.h / 2 < CROWN_APPROACH.deckY) &&
    roots.some((p) => p.s > core && p.y - p.h / 2 < CROWN_APPROACH.deckY),
  'painted roots emerge from both sides and continue below the summit deck');
  ok(byKind('foundation').every((p) => p.y - p.h / 2 < CROWN_APPROACH.deckY &&
      p.y + p.h / 2 <= CROWN_APPROACH.deckY + 0.20) &&
    byKind('foundation').some((p) => p.s - p.w / 2 < core && p.s + p.w / 2 > core),
  'five opaque foundation roots bury art seams without rising into a graybox deck plinth');
  ok(byKind('backplane').every((p) => p.w <= 9 && p.h <= 10.5),
    'opaque recess metal supports only the iris and cannot become a rectangular art backing card');
  ok(new Set(plan.filter((p) => /^signal[0-2]$/.test(p.kind)).map((p) => p.stage)).size === 3,
    'five bowed carriers own three distinct root-to-iris-to-antenna energy stages');
  ok(byKind('void').length === 1 && byKind('damage').length === 1 &&
    byKind('damage')[0].s > core && Math.abs(byKind('damage')[0].tilt) > 0.09,
  'one recessed aperture and one tilted right-side rupture define the physical payoff');

  ok(/QUERY\.get\('crown'\)\s*===\s*'legacy'/.test(render) &&
    /new THREE\.InstancedMesh\(/.test(render) &&
    /environmentRole\s*=\s*'crown-architecture'/.test(render),
  'production is default, legacy is a same-build A/B, and repeated fixed parts are instanced');
  ok(/function atlasCellGeometry\(/.test(render) &&
    /CROWN_ART\.cells\.rootLeft/.test(render) && /CROWN_ART\.cells\.rootRight/.test(render) &&
    /CROWN_ART\.cells\.antenna/.test(render),
  'one atlas upload supplies three independently placed cell geometries without runtime crops');
  ok(/function buildAperture\(/.test(render) && /for\s*\(let i = 0; i < 6; i\+\+\)/.test(render) &&
    /function applyApertureOpen\(/.test(render) && /ruptureRig\.mesh\.rotation\.z/.test(render),
  'the payoff moves six physical shutters and a hinged rupture plate');
  ok(/paintedOrgans,/.test(render) && /stagedConductors:/.test(render) &&
    /physicalShutters:/.test(render) && /hingedRupture:/.test(render),
  'the debug snapshot exposes modular-art, conductor, shutter and rupture contracts');
  ok(/Crown root mechanical group/.test(render) &&
    /Crown core mechanical group/.test(render) &&
    /Crown antenna mechanical group/.test(render) &&
    /Crown shell mechanical group/.test(render) &&
    /Crown committed-attack turbine group/.test(render),
  'root, core, antenna, shell and turbine are registered as separate boot-built groups');
  ok(/crownRoot\.visible\s*=\s*routeRenderable\(crownSignal\.s\)/.test(render) &&
    /routeVisibilityStamp\(\)/.test(render),
  'the Crown obeys the shared built-prefix/facet owner and cannot leak around the final fold');

  const presentation = render.slice(render.indexOf('export function setCrownPresentation'),
    render.indexOf('export function resetCrownPresentation'));
  const forbiddenGlowOwners = [
    'foundationWarm', 'foundationDark', 'shellWarm', 'shellDark', 'shellIvory',
    'coreArt', 'atlasArt', 'antennaArt', 'backplane', 'hardware', 'antenna',
  ];
  ok(forbiddenGlowOwners.every((name) => !presentation.includes(`MATERIAL.${name}`)) &&
    /glow\(MATERIAL\.signal0/.test(presentation) && /glow\(MATERIAL\.signal1/.test(presentation) &&
    /glow\(MATERIAL\.signal2/.test(presentation) && !/crownRoot\.(position|rotation|scale)/.test(presentation),
  'energy walks only staged nerves, iris and lens; foundation, shells and painted organs never tint or grow');
  const mechanics = render.slice(render.indexOf('function applyMechanicalPose'),
    render.indexOf('export function setCrownPresentation'));
  ok(!/new THREE\.(Mesh|InstancedMesh|Texture)/.test(mechanics) &&
    /groups\.root\.position\.y/.test(mechanics) &&
    /mechanicalRig\.turbine\.rotation\.z/.test(mechanics) &&
    /groups\.antenna\.rotation\.z/.test(mechanics) &&
    /groups\.shell\.rotation\.z/.test(mechanics),
  'action projection mutates existing mechanical groups and cannot allocate a draw or texture');

  ok(/crown-command-core-runtime-v2\.png/.test(art) &&
    /crown-command-kit-runtime-v2\.png/.test(art) &&
    /kitCanvas:\s*Object\.freeze\(\[1024, 1024\]\)/.test(art) &&
    /kitCell:\s*Object\.freeze\(\[512, 512\]\)/.test(art),
  'the boot owner exposes two palette-approved 1024-square production textures and 512-square atlas cells');
  ok(/anchorPx:\s*Object\.freeze\(\[512, 990\]\)/.test(art) &&
    /anchorPx:\s*Object\.freeze\(\[473, 126\]\)/.test(art) &&
    /anchorPx:\s*Object\.freeze\(\[41, 131\]\)/.test(art) &&
    /anchorPx:\s*Object\.freeze\(\[256, 488\]\)/.test(art),
  'all four reusable organs publish stable attachment anchors');
  ok(/stateLayers:\s*Object\.freeze/.test(art) && /approach:/.test(art) &&
    /occupation:/.test(art) && /exposed:/.test(art) && /rupture:/.test(art) &&
    /signal:/.test(art),
  'approach, occupation, exposed, rupture and signal layers form the reusable state contract');
  ok(/await awaitPreloads\(\)/.test(art) && /settledBeforeConsumer:\s*true/.test(art) &&
    mainRaw.indexOf("import './render/crown-art.js'") <
      mainRaw.indexOf("import { updateCrownFacetCull } from './render/crown.js'"),
  'the two textures settle at the shared early boot gate before the Crown consumer evaluates');

  ok(/const signalS\s*=\s*crownSignal\.s/.test(finale) &&
    !/PORTRAIT_CARRIER_SHIFT/.test(finale) && /canonicalAxis:\s*true/.test(finale),
  'desktop and portrait share the same physical command axis');
  ok(/function ensureCarrierClock\(\)/.test(finale) &&
    /if\s*\(beamRoot\.visible\)\s*ensureCarrierClock\(\)/.test(finale) &&
    /function stopCarrierClock\(\)/.test(finale) &&
    /stopCarrierClock\(\);[\s\S]*finaleRoot\.visible\s*=\s*false/.test(finale),
  'the private payoff clock wakes only for the carrier and is cancelled on reset');
  ok(/triggerCrownMechanicalAction\('packet',\s*next\.elapsedMs\)/.test(finale) &&
    /committedWardenAttack\(snapshot\)/.test(finale) &&
    /triggerCrownMechanicalAction\('rupture',/.test(finale) &&
    /triggerCrownMechanicalAction\('transmission',/.test(finale),
  'real packet, committed attack, Warden rupture and transmission transitions drive Crown mechanics');
  ok(!/src\/sim\/finale|src\/sim\/hostiles|CONFIG\.warden/.test(pure + renderRaw + artRaw),
    'the architecture and art owners contain no finale timing, Warden tune, hitbox or hostile behavior');
}
