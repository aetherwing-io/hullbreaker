/* ==================== HOSTILE / CORPSE MESHES ===================== */
/* Mock-3D presence: enemies materialize out of the tower depth, breathe
   on the depth axis while alive, flash on hits, and dissolve back as
   display-only corpses. Every value is derived from the sim row; meshes
   are held in this module's map, never on the sim object. */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { enemyEcologyCondensationStarted } from '../pure/enemy-ecology.js';
import { mortarArcX, mortarArcY } from '../pure/mortar.js';
import { installView } from '../sim/bridge.js';
import { gameMs } from '../sim/time.js';
import { PAL } from './palette.js';
import { applySurface } from './materials.js';
import {
  genomePartSnapshot, paintedGenomePart, paintedGenomePartMaterial,
} from './genome-parts.js';
import { postGain } from './post.js';
import { camera, renderer, scene } from './scene.js';
import {
  primitiveBox, SPRITE_MOTION_ART, spriteActionQuad, spriteFlapQuad,
  spriteMotionFrame, spriteQuad,
} from './sprite-table.js';
import {
  spriteActionTexture, spriteFlapTexture, spriteTexture, spriteVariantOf,
} from './sprites.js';
import { placeOnTower } from './tower.js';
import { releaseContactShadow, syncContactShadow } from './contact.js';
import { routeRenderable } from './route-visibility.js';
import { applySpriteUnderside } from './sprite-grounding.js';
import {
  mortarBurstCoreGeometry, mortarBurstShellGeometry, mortarMarkGeometry,
  mortarPodCoreGeometry, mortarPodShellGeometry,
} from './mortar-vfx.js';
import {
  actorMotionBundle, actorMotionRuntimeSnapshot, actorMotionSocket,
} from './actor-motion.js';
import { waspModularBundle, waspModularRuntimeSnapshot } from './wasp-modular.js';
import {
  selectWaspWingPhase, WASP_BODY,
} from './wasp-modular-select.js';
import {
  enemyEcologyAttackSocketWorld, enemyEcologyBundle, enemyEcologyRuntimeSnapshot,
  enemyEcologyWarmGeometries, syncEnemyEcologyVisual,
} from './enemy-ecology.js';
import {
  attachEnemyEcologyTactics, detachEnemyEcologyTactics,
  enemyEcologyTacticRuntimeSnapshot, enemyEcologyTacticVisualSnapshot,
  enemyOwnsSweepfanBeam, hideEnemyEcologyTactics, isSweepfanBeam,
  syncEnemyEcologyTactics,
} from './enemy-ecology-tactics.js';
import {
  CUE_GAIN, LAMP_COIL_SWELL, LAMP_R, LEGIBILITY_ON, POSE_GAIN,
  POLYP_ONSET_MS, POLYP_SWELL_EASE, WASP_DIVE_NARROW, waspDiveStretch,
} from './legibility.js';
import { HOSTILE_PRESENTERS } from './hostile-presenters/index.js';

/* sprites.js owns the one boot gate. Its auxiliary-animation slots point at
   these atlases in sprite-table.js, so locomotion settles with every existing
   body/action texture rather than trying to register after another render
   dependency has closed the gate. */
const motionTextures = new Map();
for (const kind of Object.keys(SPRITE_MOTION_ART)) {
  const tex = spriteFlapTexture(kind);
  if (tex) motionTextures.set(kind, tex);
}

// T-039 (S6, contact shadows): the outer radius still comes straight from the
// same CONFIG envelope as the body, while depthRatio describes the underside
// that can actually touch one deck.  These immutable profiles keep painted
// actors grounded without reinstating the old same-size square card under
// every silhouette.  `strength` only reduces CONTACT_SHADOW.maxOpacity.
const contactProfile = (key, radius, depthRadius, strength) => Object.freeze({
  key, radius, depthRatio: Math.min(1, depthRadius / radius), strength,
});
const CONTACT_FOOTPRINT = Object.freeze({
  wasp: contactProfile('wasp', CONFIG.wasp.visualRadius,
    CONFIG.wasp.visualRadius * 0.42, 0.42),
  carrier: contactProfile('carrier',
    Math.max(CONFIG.carrier.size[0], CONFIG.carrier.size[2]) / 2,
    CONFIG.carrier.size[2] / 2, 0.64),
  hound: contactProfile('hound',
    Math.max(CONFIG.hound.size[0], CONFIG.hound.size[2]) / 2,
    CONFIG.hound.size[2] / 2, 0.82),
  polyp: contactProfile('polyp', CONFIG.polyp.size, CONFIG.polyp.size * 0.62, 0.78),
  mortar: contactProfile('mortar', CONFIG.mortar.size, CONFIG.mortar.size * 0.66, 0.82),
  warden: contactProfile('warden', CONFIG.warden.size[0] / 2,
    CONFIG.warden.size[2] / 2, 0.86),
});

const waspGeo = new THREE.OctahedronGeometry(CONFIG.wasp.visualRadius);
const carrierGeo = new THREE.BoxGeometry(...CONFIG.carrier.size);
const houndGeo = new THREE.BoxGeometry(...CONFIG.hound.size);
const polypGeo = new THREE.DodecahedronGeometry(CONFIG.polyp.size);
const polypBarrelGeo = new THREE.BoxGeometry(...CONFIG.polyp.barrelSize);
const polypStalkGeo = new THREE.BoxGeometry(0.35, CONFIG.polyp.rootY, 0.35);

// A live Polyp lane used to be two scaled boxes: at FAR their broad faces
// collapsed into one neon rectangle. Keep the exact normalized -0.5..+0.5
// reach, but cut that volume into a few tapered, interrupted conductor seams.
// The immutable geometry is built once at module boot; attack frames only
// change transform and material scalars already owned by the hostile view.
function polypConductorGeometry(halfHeight, core) {
  const spans = core ? [
    [-0.50, -0.24, 0.16, 0.12],
    [-0.20,  0.03, 0.12, 0.16],
    [ 0.07,  0.28, 0.15, 0.10],
    [ 0.32,  0.50, 0.11, 0.00],
  ] : [
    [-0.50, -0.34, 0.48, 0.88],
    [-0.30, -0.11, 0.72, 0.42],
    [-0.07,  0.11, 0.44, 0.70],
    [ 0.15,  0.31, 0.60, 0.34],
    [ 0.35,  0.50, 0.42, 0.00],
  ];
  const position = [];
  for (let i = 0; i < spans.length; i++) {
    const [x0, x1, h0, h1] = spans[i];
    // Alternating bias makes a torn mechanical seam, while every vertex
    // remains inside the real beam band and never invents splash/reach.
    const bias = core ? 0 : (i & 1 ? -0.08 : 0.07) * halfHeight;
    const h = Math.max(h0, h1) * halfHeight;
    if (core) {
      // A row of narrow darts carries the hot direction; no broad face exists
      // for bloom to turn back into the old rectangle.
      position.push(x0, bias + h, 0, x0, bias - h, 0, x1, bias, 0);
    } else {
      // Cold sheath pieces are asymmetric kites around that core. Their
      // pointed ends keep every interruption readable at FAR.
      const mid = x0 + (x1 - x0) * 0.58;
      position.push(
        x0, bias, 0, mid, bias + h, 0, x1, bias, 0,
        x0, bias, 0, mid, bias - h * 0.72, 0, x1, bias, 0,
      );
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.userData.actionLanguage = core
    ? 'polyp-conductor-core' : 'polyp-broken-sheath';
  geometry.userData.normalizedReach = Object.freeze([-0.5, 0.5]);
  geometry.userData.maxHalfHeight = halfHeight;
  return geometry;
}

const polypBeamGeo = polypConductorGeometry(CONFIG.polyp.beamHalf, false);
const polypBeamCoreGeo = polypConductorGeometry(0.13, true);
// Seed-Pod Tripod: a squat three-sided launch tube on three legs (the leg
// meshes and the bombardment props are built in the mortar block at the end
// of this file, which owns everything else about this kind).
const mortarTubeGeo = new THREE.ConeGeometry(CONFIG.mortar.size, CONFIG.mortar.size * 2.2, 3);
const wardenGeo = new THREE.BoxGeometry(...CONFIG.warden.size);

/* Production cutouts need enough pixels to carry the design that is painted
   into them. At the shipped FAR view, fitting a wasp to its one-tile legacy
   octahedron produced only ~18 CSS pixels of ink; the 400px source became an
   expensive green speck. These are PRESENTATION scales only. The sim rows,
   contact radii, target tests, projectiles and shadows stay unchanged. Rooted
   and deck-bound roles are lifted by the corresponding amount below so their
   feet remain on the exact same authored surface. */
const SPRITE_BODY_SCALE = Object.freeze({
  wasp: 1.55,
  carrier: 1.30,
  hound: 1.35,
  polyp: 1.30,
  mortar: 1.25,
  // Presentation-only: the pulled-back Crown camera turns a 5.8-tile body
  // into ~157 px. The centerpiece needs a 220 px read, so its cutout receives
  // the same explicit scale treatment as the small roster. Collision stays
  // the forgiving 1.12-tile iris and spriteAnchorLift keeps all four feet on
  // the exact same apron.
  warden: 1.45,
});

/* The ecology atlas is authored as a 64-state UNION, so its fixed fit must
   leave room for the widest attack and tallest breakup even while a live
   idle/prowl cell uses much less of that box. Reusing the legacy single-pose
   multiplier therefore made shipped idle ink 18--30px at FAR: enough texels,
   but not enough silhouette to separate Railfang's legs or Crosswind's wing
   banks. These larger values are presentation only and apply only to the
   reviewed two-layer atlas. Root compensation below preserves the exact
   authored surface; hit circles, target tests, attack sockets and sim rows do
   not read this table. */
const ENEMY_ECOLOGY_PRESENTATION_SCALE = Object.freeze({
  wasp: 2.30,
  hound: 2.45,
  polyp: 1.80,
  mortar: 1.75,
});

// Multiplies atlas albedo on the unlit card; it adds no light. Dark chassis
// paint needs more preservation than the already-ivory aerial bank. Values
// stay bounded below 1.7 so the source's tiny hot rivets do not become a halo.
const ENEMY_ECOLOGY_PAINT_GAIN = Object.freeze({
  wasp: 1.00,
  hound: 1.65,
  polyp: 1.18,
  mortar: 1.18,
});

function enemyEcologyPresentationScale(kind) {
  return ENEMY_ECOLOGY_PRESENTATION_SCALE[kind] ||
    SPRITE_BODY_SCALE[kind] || 1;
}

// Collision-faithful platforms occupy depth -0.70..+0.70. Hostiles used to
// breathe around depth zero, so even a flying wasp was depth-tested behind the
// platform fascia whenever their silhouettes overlapped. Lift presentation
// onto the same readable outer skin as RIG; entrance motion still begins deep
// inside Meridian because its authored -12-tile emergence composes first.
// Simulation positions, beams, marked zones, hitboxes and shadows remain on
// the exact combat plane.
export const HOSTILE_SURFACE_DEPTH = 1.15;

function spriteAnchorLift(kind, presentationScale) {
  if (kind === 'wasp' || kind === 'carrier' || presentationScale === 1) return 0;
  const box = primitiveBox(kind);
  if (!box) return 0;
  const bottom = box.cy - box.h / 2;
  return bottom * (1 - presentationScale);
}

/* ------------------- combat-plane readability props ------------------- *
 * Collision stays world-sized and untouched. Production cutouts receive the
 * presentation-only scale above; these small props carry INFORMATION that
 * must survive the FAR camera: a grounded contact read and a different
 * motion sentence for each committed threat. Idle silhouettes own no halo;
 * a warning is a message about the machine, not ambient decoration. */
function paintRadialTexture() {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 64;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 3, 32, 32, 32);
  grad.addColorStop(0, 'white');
  grad.addColorStop(0.34, 'white');
  grad.addColorStop(1, 'transparent');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

function paintStreakTexture() {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 32;
  const g = cv.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, 'transparent');
  grad.addColorStop(0.50, 'transparent');
  grad.addColorStop(0.82, 'white');
  grad.addColorStop(1, 'transparent');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(0, 16); g.lineTo(116, 4); g.lineTo(128, 16);
  g.lineTo(116, 28); g.closePath(); g.fill();
  return new THREE.CanvasTexture(cv);
}

function paintChevronTexture() {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 48;
  const g = cv.getContext('2d');
  g.strokeStyle = 'white';
  g.lineWidth = 7;
  g.lineJoin = 'miter';
  for (let x = 32; x < 244; x += 52) {
    g.beginPath();
    g.moveTo(x - 15, 8); g.lineTo(x + 7, 24); g.lineTo(x - 15, 40);
    g.stroke();
  }
  return new THREE.CanvasTexture(cv);
}

const actorGlowTex = paintRadialTexture();
const streakTex = paintStreakTexture();
const chevronTex = paintChevronTexture();
const actorGlowGeo = new THREE.PlaneGeometry(1, 1);
const streakGeo = new THREE.PlaneGeometry(1, 1);
const laneGeo = new THREE.PlaneGeometry(1, 1);
// Mortar landing language is a pair of inward-closing deck clamps, not a
// perfect ring that resembles a debug blast radius. Broad rails and teeth
// survive the pulled-back camera; the open centre keeps RIG and the actual
// marked surface visible. Local geometry spans one unit in both axes.
const zoneClampGeo = new THREE.BufferGeometry();
zoneClampGeo.setAttribute('position', new THREE.Float32BufferAttribute([
  // left and right vertical bolsters
  -0.50,-0.45,0, -0.42,-0.45,0, -0.42, 0.45,0,
  -0.50,-0.45,0, -0.42, 0.45,0, -0.50, 0.45,0,
   0.42,-0.45,0,  0.50,-0.45,0,  0.50, 0.45,0,
   0.42,-0.45,0,  0.50, 0.45,0,  0.42, 0.45,0,
  // upper rails and their inward-pointing teeth
  -0.42, 0.45,0, -0.15, 0.45,0, -0.15, 0.32,0,
  -0.42, 0.45,0, -0.15, 0.32,0, -0.42, 0.32,0,
  -0.15, 0.48,0,  0.02, 0.36,0, -0.15, 0.24,0,
   0.15, 0.45,0,  0.42, 0.45,0,  0.42, 0.32,0,
   0.15, 0.45,0,  0.42, 0.32,0,  0.15, 0.32,0,
   0.15, 0.48,0,  0.15, 0.24,0, -0.02, 0.36,0,
  // lower rails and their inward-pointing teeth
  -0.42,-0.45,0, -0.15,-0.32,0, -0.15,-0.45,0,
  -0.42,-0.45,0, -0.42,-0.32,0, -0.15,-0.32,0,
  -0.15,-0.48,0, -0.15,-0.24,0,  0.02,-0.36,0,
   0.15,-0.45,0,  0.42,-0.32,0,  0.42,-0.45,0,
   0.15,-0.45,0,  0.15,-0.32,0,  0.42,-0.32,0,
   0.15,-0.48,0, -0.02,-0.36,0,  0.15,-0.24,0,
], 3));
zoneClampGeo.computeVertexNormals();

const wardRingGeo = new THREE.RingGeometry(0.72, 0.88, 12);
const aegisRingGeo = new THREE.RingGeometry(0.25, 0.34, 12);
const pincerArcGeo = new THREE.RingGeometry(0.46, 0.55, 14, 1, 0, Math.PI);
const evolutionNodeGeo = new THREE.OctahedronGeometry(0.085, 0);
// Genome modules are small hard-surface parts bolted around the production
// painting. Boxes, coils and segmented rings retain a manufactured silhouette
// at play scale; there are deliberately no flat triangle badges or body-wide
// recolours standing in for mutation identity.
const genomePlateGeo = new THREE.BoxGeometry(0.16, 0.50, 0.10);
const genomeRailGeo = new THREE.BoxGeometry(0.42, 0.075, 0.10);
const genomeCoilGeo = new THREE.TorusGeometry(0.16, 0.035, 6, 16);
// Three short coil shoes deploy around a reactive chassis. Keeping the arc
// discontinuous is important: a complete circle reads as debug UI, while
// these broad metal segments and their clamps read as mounted machinery.
const BACKLASH_ARC = Math.PI * 0.36;
const backlashArcGeo = new THREE.RingGeometry(
  0.82, 1, 10, 1, -BACKLASH_ARC / 2, BACKLASH_ARC);

// One painted atlas cell per gene. ax/ay are fractions of the fitted actor
// box from its centre, size is a fraction of the body's THICKNESS (the lesser
// dimension), layer is its physical mount relative to the body plane, and
// authored is the direction the cell itself faces (+1 right, -1 left).
// Intrinsic anchors keep a three-gene recipe spatially decompressed: defence
// at the face, locomotion low/rear, attacks on the dorsal rail, command above,
// and reaction hardware below. Rear-mounted parts are depth-occluded by the
// painted body wherever they overlap it; only their bolted-on silhouette can
// protrude. phenotype adds only its bounded micro-variation.
const PAINTED_GENE_LAYOUT = Object.freeze({
  BULWARK:   { ax: 0.44, ay: 0.00, size: 0.68, rot: 0.00, layer: 0.038, authored: 1 },
  VAULT:     { ax: -0.38, ay: -0.30, size: 0.72, rot: -0.05, layer: -0.034, authored: 1 },
  TWINSTRIKE:{ ax: -0.34, ay: 0.36, size: 0.62, rot: 0.02, layer: -0.040, authored: -1 },
  SALVO:     { ax: -0.22, ay: 0.24, size: 0.72, rot: -0.04, layer: -0.034, authored: -1 },
  RELAY:     { ax: 0.38, ay: 0.06, size: 0.68, rot: 0.00, layer: 0.028, authored: 1 },
  PINCER:    { ax: 0.38, ay: 0.20, size: 0.62, rot: -0.04, layer: -0.026, authored: -1 },
  AEGIS:     { ax: 0.22, ay: 0.30, size: 0.70, rot: 0.00, layer: 0.042, authored: 1 },
  BACKLASH:  { ax: 0.16, ay: -0.46, size: 0.66, rot: 0.00, layer: -0.044, authored: 1 },
});

// The keyed BACKLASH artwork occupies about 72% of its square cell in x.
// Scaling by this measured fill makes the open horseshoe's OUTER edge land on
// the sim's damage radius without drawing a perfect debug circle.
const BACKLASH_ATLAS_FILL_X = 0.72;

function signalMaterial(color, map = null) {
  return new THREE.MeshBasicMaterial({
    color, map, transparent: true, opacity: 0, fog: false,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    forceSinglePass: true,
  });
}

// Genome identity is bolted-on machinery, not another HUD-shaped glow. The
// dark metal body keeps each part's silhouette readable against bright Crown
// plating; a restrained local emissive seam carries its tactic/state. Unlike
// signalMaterial this uses ordinary blending and never multiplies the whole
// part through the bloom gain.
function genomeMaterial(accent) {
  const color = new THREE.Color(accent).multiplyScalar(0.22);
  return new THREE.MeshStandardMaterial({
    color,
    emissive: accent,
    emissiveIntensity: 0.18,
    metalness: 0.76,
    roughness: 0.34,
    flatShading: true,
    transparent: true,
    opacity: 0,
    fog: false,
    side: THREE.DoubleSide,
    forceSinglePass: true,
  });
}

function genomeLit(mat, accent, intensity, base = 0.22) {
  mat.color.setHex(accent).multiplyScalar(base);
  mat.emissive.setHex(accent);
  mat.emissiveIntensity = intensity;
}

/* The houndframe's state theater: the shared presence pass below owns
   materialization, depth breathing, and the hit flash for every kind — this
   only adds the pose that makes its charge readable at full sprint.
     tell   — rears back and up while a small head coil gathers locally;
     charge — snaps back into the plane, stretches along the run, holds a
              constant hot glow: "this is live and it is not steering";
     prowl  — a small stride bob so a patrolling frame still reads as alive.
   One reused object: sync runs per hostile per frame, so no allocation. */
const HOUND_POSE = { depth: 0, sx: 1, sy: 1, sz: 1, glow: PAL.glowOff };

function houndTellU(e) {                 // 0 → 1 across the reaction window
  return 1 - Math.max(0, Math.min(1, (e.stateUntil - gameMs) / CONFIG.hound.tellMs));
}

function houndPose(e) {
  const H = CONFIG.hound;
  const p = HOUND_POSE;
  p.depth = 0; p.sx = 1; p.sy = 1; p.sz = 1; p.glow = PAL.glowOff;
  if (e.state === 'tell') {
    const u = houndTellU(e);
    // POSE_GAIN (T-003): the wind-up silhouette takes back 60% of the FAR
    // pull-back, so the rear-up still reads on a ~15px chassis. It is 1 at
    // ?view=near and under ?legibility=0 — the pre-pass pose, exactly.
    p.depth = H.tellDepth * POSE_GAIN * u;
    p.sy = 1 + H.tellRise * POSE_GAIN * u;
    p.sx = 1 - H.tellNarrow * POSE_GAIN * u;
    if (e.stateUntil - gameMs <= H.tellCoilMs) {
      // The frame drops onto its haunches for the final local lock. Warning
      // light lives on the head lamp, not across the whole body.
      p.sy -= H.tellCoilSquash * POSE_GAIN;
      p.sx += H.tellCoilSquash * POSE_GAIN * 0.5;
    }
  } else if (e.state === 'charge') {
    p.sx = 1 + H.chargeStretch;
    p.sy = 1 - H.chargeSquash;
    p.glow = PAL.houndCharge;
  } else if (e.state === 'vault') {
    p.sx = 1.12;
    p.sy = 0.88;
    p.depth = 0.16;
    p.glow = PAL.houndCharge;
  } else if (e.state === 'prowl') {
    p.sy = 1 + Math.sin(e.t * H.gaitFreq) * H.gaitAmp;
  }
  return p;
}

function houndRoll(e) {
  const H = CONFIG.hound;
  if (e.state === 'tell') return -e.dir * H.tellRear * POSE_GAIN * houndTellU(e);
  if (e.state === 'charge') return e.dir * H.chargeLean;
  if (e.state === 'vault') return Math.atan2(e.vy, e.vx) * 0.32;
  if (e.state === 'tumble') return e.t * 6;
  return Math.sin(e.t * H.gaitFreq) * H.gaitTilt;
}

/* The Warden is a summit-scale machine, so its animation is weight transfer,
   not idle bobbing.  The painted cutout stays recognisable while the chassis
   braces into each weapon and mechanically unloads when the iris opens.  All
   values are presentation-only and derived from the already committed sim
   state; no extra warning or timing contract is introduced here. */
const WARDEN_POSE = { depth: 0, sx: 1, sy: 1, sz: 1, glow: PAL.glowOff };

function wardenStateU(e, duration) {
  return 1 - Math.max(0, Math.min(1, (e.stateUntil - gameMs) / duration));
}

function wardenPose(e) {
  const W = CONFIG.warden;
  const p = WARDEN_POSE;
  p.depth = 0; p.sx = 1; p.sy = 1; p.sz = 1; p.glow = PAL.glowOff;
  if (e.state === 'sweepTell') {
    const brace = wardenStateU(e, W.sweepTellMs);
    p.sx = 1 + brace * 0.018;
    p.sy = 1 - brace * 0.016;
    p.depth = -brace * 0.035;
  } else if (e.state === 'sweepFire') {
    const kick = Math.sin(Math.PI * wardenStateU(e, W.sweepMs));
    p.sx = 1 + kick * 0.030;
    p.sy = 0.984 - kick * 0.012;
    p.depth = -0.045 - kick * 0.065;
  } else if (e.state === 'barrageTell') {
    const load = wardenStateU(e, W.barrageTellMs);
    p.sx = 1 - load * 0.010;
    p.sy = 1 - load * 0.024;
    p.depth = -load * 0.025;
  } else if (e.state === 'barrageBurst') {
    const kick = Math.sin(Math.PI * wardenStateU(e, W.barrageMs));
    p.sx = 1 + kick * 0.018;
    p.sy = 0.976 - kick * 0.030;
    p.depth = -0.035 - kick * 0.080;
  } else if (e.state === 'exposed') {
    // Shutters release and the loaded suspension settles into a vulnerable
    // stance.  This is deliberately not emissive: only the local iris says
    // "shoot now".
    const settle = Math.min(1, Math.max(0, (gameMs - e.openedAt) / 180));
    p.sx = 1 + settle * 0.012;
    p.sy = 1 - settle * 0.018;
    p.depth = -settle * 0.025;
  }
  return p;
}

function wardenRoll(e) {
  const W = CONFIG.warden;
  if (e.state === 'sweepTell')
    return -e.dir * wardenStateU(e, W.sweepTellMs) * 0.012;
  if (e.state === 'sweepFire')
    return -e.dir * Math.sin(Math.PI * wardenStateU(e, W.sweepMs)) * 0.030;
  if (e.state === 'barrageTell')
    return e.dir * wardenStateU(e, W.barrageTellMs) * 0.010;
  if (e.state === 'barrageBurst')
    return e.dir * Math.sin(Math.PI * wardenStateU(e, W.barrageMs)) * 0.022;
  return 0;
}

/* The polyp's state theater over the same shared presence pass: a rooted
   bulb whose iris cycle is told in silhouette + one local aperture light.
     closed — inert bulb; the shared depth breathing keeps it alive.
     tell   — dilates while the aperture gathers: "this lane is arming".
     fire   — holds the swollen pose and a constant hot glow while the beam
              mesh (below) spans the live reach: committed, not steering.
     vent   — sags and glows a dim spent warm: the opening, visibly.
   Same reused-object rule as the hound pose: sync runs per hostile per
   frame, so no allocation.                                             */
const POLYP_POSE = { depth: 0, sx: 1, sy: 1, sz: 1, glow: PAL.glowOff };

function polypPose(e) {
  const PP = CONFIG.polyp;
  const p = POLYP_POSE;
  p.depth = 0; p.sx = 1; p.sy = 1; p.sz = 1; p.glow = PAL.glowOff;
  if (e.state === 'tell') {
    const u = 1 - Math.max(0, Math.min(1, (e.stateUntil - gameMs) / PP.tellMs));
    // I-003 (playtest inbox): at the shipped FAR view the first ~300ms of the
    // previous iris tell read as a small dark notch in the bulb, so nearly a
    // third of the reaction window carried almost no signal. Two fixes, both
    // render-only and both vanishing under ?legibility=0: the dilation is
    // FRONT-LOADED (u ** 0.55 — most of the silhouette change happens in the
    // first beats) and it is boosted by POSE_GAIN so the swelled bulb still
    // reads at ~19px. The third is the iris lamp in polypLamp() below, which
    // is lit from the first frame of the tell.
    const swellU = LEGIBILITY_ON ? u ** POLYP_SWELL_EASE : u;
    p.sy = 1 + PP.tellSwell * POSE_GAIN * swellU;
    p.sz = 1 + PP.tellSwell * POSE_GAIN * swellU;
  } else if (e.state === 'fire') {
    p.sy = 1 + PP.tellSwell * POSE_GAIN;
    p.sz = 1 + PP.tellSwell * POSE_GAIN;
    p.glow = PAL.polypBeam;
  } else if (e.state === 'vent') {
    p.sy = 1 - PP.ventSag;
    p.glow = PAL.polypVent;
  }
  return p;
}

/* The wasp's dive, made readable at the shipped FAR view (T-003). A drone is
   ~17px there, and its cruise and its dive looked the same: a small acid
   diamond. The sim gives it no wind-up state to telegraph — a dive commits
   the frame it starts — so what the render adds is a COMMITMENT read, in the
   roster's existing language (hot acid = live and not steering, exactly like
   the houndframe's charge and the polyp's beam):
     - it points down its own dive vector instead of idly spinning;
     - it narrows into a dart, which is free — a drawn body may always claim
       LESS than its hit circle;
     - it wears PAL.waspDive, the hot end of the acid family.
   The elongation is clamped by waspDiveStretch() so the drawn nose can never
   claim reach past the contact circle. Warm amber is NOT used here on
   purpose: that is the roster's warning color, and a dive is past warning. */
const WASP_POSE = { depth: 0, sx: 1, sy: 1, sz: 1, glow: PAL.glowOff };

function waspDiving(e) {
  return LEGIBILITY_ON && e.state === 'dive';
}

function waspLaunched(e) {
  return waspDiving(e) && gameMs >= e.lockUntil;
}

function waspPose(e) {
  const p = WASP_POSE;
  p.depth = 0; p.sx = 1; p.sy = 1; p.sz = 1; p.glow = PAL.glowOff;
  if (waspDiving(e)) {
    // the nose reaches exactly the contact circle and the cross-section is
    // traded against THAT, not against the body — the dart must never make a
    // 17px drone smaller than the one that was cruising
    const grow = 1 + waspDiveStretch();
    p.sx = grow;
    p.sy = grow * (1 - WASP_DIVE_NARROW);
    p.sz = grow * (1 - WASP_DIVE_NARROW);
    // The lock pose points locally at its answer; the full acid body is the
    // committed danger moment and only ignites when movement starts.
    if (waspLaunched(e)) p.glow = PAL.waspDive;
  }
  return p;
}

function waspRoll(e) {
  // local +x is the dart's nose, so this points the whole pose down the dive
  return waspDiving(e) ? Math.atan2(e.vy, e.vx) : e.t * 2;
}

// per-kind look, keyed by the same kind rows as ENEMY in src/sim/hostiles.js
/* `surface` (T-048, decisions.md entry 18) is the material FAMILY the kind's
   body wears — the roughness/metalness response it answers the light rig
   with, from the one table in src/render/materials.js. Before this pass every
   hostile was a matte dielectric at the class defaults, so a drone shell, a
   running frame and a rooted emplacement all took light identically and only
   hue and silhouette separated them. The split follows the roster's own
   fiction: flyers are shells, the houndframe is exposed running gear, the two
   rooted kinds are grown into the hull. Color, geometry and pose are
   untouched — this adds a response, it does not restyle anything. */
const LOOK = {
  wasp:    { geo: waspGeo,    color: PAL.wasp,      surface: 'carapace',
             roll: waspRoll,  pose: waspPose },
  carrier: { geo: carrierGeo, color: PAL.carrier,   surface: 'carapace',
             roll: (e) => Math.sin(e.t * CONFIG.carrier.rollFreq) * CONFIG.carrier.rollAmp },
  hound:   { geo: houndGeo,   color: PAL.hound,     surface: 'chassis',
             roll: houndRoll, pose: houndPose },
  polyp:   { geo: polypGeo,   color: PAL.polyp,     surface: 'emplacement',
             roll: () => 0,   pose: polypPose },
  mortar:  { geo: mortarTubeGeo, color: PAL.mortar, surface: 'emplacement',
             roll: mortarRoll, pose: mortarPose },
  warden:  { geo: wardenGeo, color: PAL.warden, surface: 'chassis',
             roll: wardenRoll, pose: wardenPose },
};

/* ===================== THE SPRITE BODY (T-049) ===================== *
 * decisions.md entry 16 authorized runtime art, and this is where a
 * hostile stops being a flat-shaded solid and becomes the generated
 * sprite: one billboarded quad per body, textured with the T-046 art,
 * sized so the DRAWN INK lands exactly on the box the primitive occupied
 * (src/render/sprite-table.js owns that arithmetic and pathcheck
 * re-measures it out of the PNG).
 *
 * What "billboarded" means here is deliberately the tower's own facing,
 * not a camera-tracking billboard: placeOnTower already turns every body
 * to the face it stands on, and that face is what the FAR camera looks
 * at. A quad posed that way stays square to the view on the active face
 * and follows the world around a corner instead of sliding against it —
 * and it needs no per-frame work beyond the placement every body already
 * does.
 *
 * Everything the state theater above does keeps working, untouched:
 *   - scale poses (rear-up, dilate, dive dart, burst swell) scale the quad
 *     around the sim row, exactly as they scaled the solid;
 *   - the tell lamps are separate meshes and never knew what body they sat
 *     on;
 *   - the hit flash still rides `emissive`, which is why the material is
 *     MeshStandardMaterial with `emissiveMap` set to the art: a flash then
 *     lights the DRAWN pixels and leaves the transparent margin dark.
 *     (A MeshBasicMaterial would have thrown that whole language away —
 *     T-046's integration note called it out as a real decision, and this
 *     is the answer: keep the language, pay a lit material for it.)
 *
 * Three per-kind differences the art forces, all render-only:
 *   - FACING. Every sprite is authored pointing +x, so a body whose sim row
 *     faces left is mirrored (scale.x < 0). The roll functions already
 *     carry the sign of `dir`, so a mirrored lean comes out correct without
 *     touching them.
 *   - THE TRIPOD DOES NOT ROLL. mortarRoll() tilts the cone down its line
 *     of fire; the sprite has that tilt drawn in, so rolling it again would
 *     aim the tube at the deck.
 *   - THE DRONE BANKS INSTEAD OF SPINNING. A tumbling octahedron reads as a
 *     machine; a tumbling picture of a machine reads as a bug. The dive
 *     still points down the dive vector, which is the cue that matters.  */

const spriteGeos = new Map();            // kind -> PlaneGeometry, built once
const actionSpriteGeos = new Map();
const flapSpriteGeos = new Map();
const motionSpriteGeos = new Map();      // kind -> one fixed UV geometry per atlas cell

function motionSpriteFrames(kind) {
  let frames = motionSpriteGeos.get(kind);
  if (frames) return frames;
  const art = SPRITE_MOTION_ART[kind];
  if (!art) return null;
  frames = art.frames.map((unused, index) => {
    const q = spriteMotionFrame(kind, index);
    const geo = new THREE.PlaneGeometry(q.w, q.h);
    geo.translate(q.offX, q.offY, 0);
    // Select the cell in geometry, never by mutating the shared texture.
    // Different enemies may therefore occupy different gait frames while
    // every material still points at one resident atlas texture.
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      uv.setXY(i,
        q.uv.u0 + u * (q.uv.u1 - q.uv.u0),
        q.uv.v0 + v * (q.uv.v1 - q.uv.v0));
    }
    uv.needsUpdate = true;
    geo.userData.motionKind = kind;
    geo.userData.motionFrame = index;
    geo.userData.anchorWorldX = q.anchorWorldX;
    geo.userData.anchorWorldY = q.anchorWorldY;
    return applySpriteUnderside(geo, kind === 'wasp' ? 0.84 : 0.79);
  });
  motionSpriteGeos.set(kind, frames);
  return frames;
}

/* Some independently painted poses preserve the role's full horizontal ink
 * but become dramatically shorter vertically: at FAR the wasp downstroke was
 * only 52% of its cruise height and the hound charge 84% of idle.  That reads
 * as the enemy shrinking when it attacks. Normalize only the PlaneGeometry's
 * Y axis, once at construction. Width, mesh scale, collision, shadow, target
 * tests and every sim-owned position/state remain exactly as authored.
 *
 * Wasp poses retain real silhouette change rather than being forced to the
 * same height. The hound returns to full standing ink before its existing
 * charge-pose squash is applied, so that behavioral compression still reads. */
const POSE_HEIGHT_SHARE = Object.freeze({
  wasp: Object.freeze({ action: 0.85, flap: 0.78 }),
  hound: Object.freeze({ action: 1.00 }),
});

function poseHeightGain(kind, pose, q) {
  const share = POSE_HEIGHT_SHARE[kind]?.[pose];
  const base = spriteQuad(kind, spriteVariantOf(kind));
  if (!share || !base || !q?.inkH) return 1;
  return Math.max(1, base.inkH * share / q.inkH);
}

function poseHeightAnchor(kind) {
  // Grounded ink is fitted to this exact mount line in sprite-table.js. Scale
  // about it so the hound gains leg/chassis height upward, never floating feet.
  if (kind === 'hound') {
    const box = primitiveBox(kind);
    return box ? box.cy - box.h / 2 : 0;
  }
  return 0;
}

function normalizePoseHeight(geo, kind, pose, q) {
  const gain = poseHeightGain(kind, pose, q);
  if (gain === 1) return geo;
  const anchor = poseHeightAnchor(kind);
  geo.translate(0, -anchor, 0);
  geo.scale(1, gain, 1);
  geo.translate(0, anchor, 0);
  geo.userData.poseHeightGain = gain;
  geo.userData.poseHeightAnchor = anchor;
  return geo;
}

function spriteGeo(kind) {
  let geo = spriteGeos.get(kind);
  if (geo) return geo;
  const q = spriteQuad(kind, spriteVariantOf(kind));
  if (!q) return null;
  geo = new THREE.PlaneGeometry(q.w, q.h);
  // the offset is baked into the geometry, not the mesh position, so the
  // facing mirror flips it with the art and the pose scales still act
  // around the sim row the way they do on a primitive body
  geo.translate(q.offX, q.offY, 0);
  applySpriteUnderside(geo, kind === 'wasp' ? 0.84 : 0.79);
  spriteGeos.set(kind, geo);
  return geo;
}

function actionSpriteGeo(kind) {
  let geo = actionSpriteGeos.get(kind);
  if (geo) return geo;
  const q = spriteActionQuad(kind);
  if (!q) return null;
  geo = new THREE.PlaneGeometry(q.w, q.h);
  geo.translate(q.offX, q.offY, 0);
  normalizePoseHeight(geo, kind, 'action', q);
  applySpriteUnderside(geo, kind === 'wasp' ? 0.86 : 0.80);
  actionSpriteGeos.set(kind, geo);
  return geo;
}

function flapSpriteGeo(kind) {
  let geo = flapSpriteGeos.get(kind);
  if (geo) return geo;
  const q = spriteFlapQuad(kind);
  if (!q) return null;
  geo = new THREE.PlaneGeometry(q.w, q.h);
  geo.translate(q.offX, q.offY, 0);
  normalizePoseHeight(geo, kind, 'flap', q);
  applySpriteUnderside(geo, 0.94);
  flapSpriteGeos.set(kind, geo);
  return geo;
}

function poseNormalizationSnapshot() {
  const rows = [
    ['wasp', 'action', spriteActionQuad('wasp')],
    ['wasp', 'flap', spriteFlapQuad('wasp')],
    ['hound', 'action', spriteActionQuad('hound')],
  ];
  return rows.map(([kind, pose, q]) => {
    const base = spriteQuad(kind, spriteVariantOf(kind));
    const gain = poseHeightGain(kind, pose, q);
    return {
      kind, pose,
      targetShare: POSE_HEIGHT_SHARE[kind][pose],
      gain: Number(gain.toFixed(3)),
      widthGain: 1,
      opaqueHeightBefore: Number(q.inkH.toFixed(3)),
      opaqueHeightAfter: Number((q.inkH * gain).toFixed(3)),
      baseOpaqueHeight: Number(base.inkH.toFixed(3)),
      anchorY: Number(poseHeightAnchor(kind).toFixed(3)),
      collisionChanged: false,
    };
  });
}

function actionPoseActive(e) {
  if (e.kind === 'wasp') return e.state === 'dive';
  if (e.kind === 'hound') return e.state === 'charge' || e.state === 'vault';
  // An online Aegis projector holds a Polyp's iris visibly dilated because
  // sim/hostiles.js makes that priority source punishable for the same window.
  // The action painting is the roster's existing open-aperture silhouette.
  if (e.kind === 'polyp') return e.state === 'tell' || e.aegisActive;
  if (e.kind === 'mortar') return e.state === 'lob' || e.state === 'fuse' || e.state === 'burst';
  // The carrier has no attack state; its second pose follows its authored
  // flight bob phase. This is a two-pose hover cycle, not an arbitrary strobe.
  if (e.kind === 'carrier') return Math.sin(e.t * CONFIG.carrier.bobFreq) > 0.15;
  return false;
}

const WASP_FLIGHT_CYCLES_PER_SECOND = 3.25;
const HOUND_GAIT_STRIDE_TILES = 1.55;
const HOUND_RUN_FRAME_COUNT = 4;

/* The bottom row is not a decorative alternate loop. It names actual hound
 * mechanics: load while the tell is planted, launch at commitment, airborne
 * reach through the vault, and a compressed landing/skid. A normal charge
 * returns to the four distance-driven run phases after its launch beat. */
function houndActionMotionFrame(e, frameCount) {
  if (frameCount < 8) return -1;
  if (e.state === 'tell') return 4;
  if (e.state === 'charge') {
    const elapsed = CONFIG.hound.chargeMs - Math.max(0, e.stateUntil - gameMs);
    return elapsed < 110 ? 5 : -1;
  }
  if (e.state === 'vault') {
    if (e.vy > CONFIG.genome.vaultLift * 0.45) return 5;
    if (e.vy > -CONFIG.genome.vaultLift * 0.35) return 6;
    return 7;
  }
  if (e.state === 'tumble') return e.vy > -8 ? 6 : 7;
  if (e.state === 'skid') return 7;
  return -1;
}

function locomotionFrame(v, e) {
  const n = v.motionGeos?.length || 0;
  if (!n) return -1;
  if (e.kind === 'wasp') {
    const cycle = e.t * WASP_FLIGHT_CYCLES_PER_SECOND + e.id * 0.173;
    return Math.floor((cycle - Math.floor(cycle)) * n) % n;
  }
  if (e.kind === 'hound') {
    const dx = Math.abs(e.x - v.motionLastX);
    v.motionLastX = e.x;
    // A fold handoff, fixture relocation, or reset is not a stride. Ordinary
    // travel advances by distance so a blocked hound's feet stop with it.
    if (dx <= 0.75) v.motionPhase = (v.motionPhase + dx / HOUND_GAIT_STRIDE_TILES) % 1;
    else v.motionPhase = 0;
    const actionFrame = houndActionMotionFrame(e, n);
    if (actionFrame >= 0) return actionFrame;
    const runFrames = Math.min(HOUND_RUN_FRAME_COUNT, n);
    return Math.min(runFrames - 1, Math.floor(v.motionPhase * runFrames));
  }
  return -1;
}

// A motion pose is more than a frame number: the body geometry owns the atlas
// cell and the material owns the shared sheet. Keep this one predicate as the
// live/death hand-off contract so an interrupted state swap can never claim a
// stale cell. It allocates nothing and is also cheap enough for the live hound
// pose pass below.
function currentMotionFrame(v) {
  const frame = v.motionFrame;
  if (!Number.isInteger(frame) || frame < 0) return -1;
  if (v.motionSource === 'actor') {
    if (v.poseKey !== `actor:${frame}` || !v.actorMotionFrame ||
        v.actorMotionFrame.index !== frame ||
        v.actorMotionFrame.geo !== v.mesh.geometry ||
        v.mat.map !== v.actorMotionBundle.tex ||
        v.mat.emissiveMap !== v.actorMotionBundle.tex) return -1;
  } else if (v.motionSource === 'locomotion') {
    if (v.poseKey !== `motion:${frame}` || !v.motionTex ||
        v.motionGeos?.[frame] !== v.mesh.geometry ||
        v.mat.map !== v.motionTex || v.mat.emissiveMap !== v.motionTex) return -1;
  } else if (v.motionSource === 'wasp-modular') {
    if (v.poseKey !== `waspmod:${frame}` || !v.waspModular ||
        v.waspModular.body[frame]?.geo !== v.mesh.geometry ||
        v.mat.map !== v.waspModular.tex ||
        v.mat.emissiveMap !== v.waspModular.tex) return -1;
  } else return -1;
  return frame;
}

function presenterOwnsSilhouette(v, e) {
  return v.presenter.ownsSilhouette(PRESENTER_API, v, e);
}

// Scratch outputs are shared because every caller consumes them immediately.
// No socket lookup or world projection allocates in the render loop.
const MOTION_SOCKET = { s: 0, y: 0 };
const MUTATION_SOCKET = { s: 0, y: 0 };

function motionSocketWorld(v, e, name, out = MOTION_SOCKET) {
  if (v.ecology && name === 'muzzle')
    return enemyEcologyAttackSocketWorld(v, e, out);
  if (v.presenter.id !== 'actor' || !presenterOwnsSilhouette(v, e)) return false;
  const local = actorMotionSocket(v.actorMotionBundle, v.motionFrame, name);
  if (!local) return false;
  out.s = e.x + local.x * v.mesh.scale.x;
  out.y = e.y + v.presentationLift + local.y * v.mesh.scale.y;
  return true;
}

function spriteMaterial(tex) {
  return new THREE.MeshStandardMaterial({
    map: tex,
    vertexColors: true,
    emissiveMap: tex,                    // the hit flash and every state glow
    emissive: PAL.glowOff,               //   light the art, never the margin
    transparent: true,                   // the materialize/dissolve fade
    opacity: 0,
    alphaTest: 0.02,                     // discard the empty margin before it
                                         //   writes depth over what is behind
    side: THREE.DoubleSide,              // a mirrored quad has flipped winding
    // …and a double-sided TRANSPARENT material is drawn twice per frame by
    // default (back faces, then front) to help sorting. Measured: that made
    // every sprite body cost 2 draw calls where the box it replaced cost 1.
    // A flat quad cannot overlap itself, so the second pass buys nothing —
    // src/render/hostiles.js's own trace put the roster back under the
    // primitive's call count with this on (reports/tasks/T-049/build.md).
    forceSinglePass: true,
    depthWrite: true,
    fog: false,                            // actors remain foreground-readable in the teal depth fog
  });
}

function enemyEcologyMaterial(tex, kind) {
  /* The atlas already contains painted key/fill/rim and material response.
     Running that illustration through the world PBR rig a second time
     crushed its small dark chassis into black. An unlit alpha-tested card
     preserves the authored value exactly while remaining NON-emissive: it
     has no emissive map/property or separate luminous field. The bounded
     per-family albedo multiplier above restores dark ink without a halo in
     the shipped desktop/portrait proofs. State paint and physical tactic VFX
     remain the only active signals. */
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    alphaTest: 0.035,
    side: THREE.DoubleSide,
    forceSinglePass: true,
    depthWrite: true,
    fog: false,
  });
  const gain = ENEMY_ECOLOGY_PAINT_GAIN[kind] || 1;
  mat.color.setRGB(gain, gain, gain, THREE.LinearSRGBColorSpace);
  return mat;
}

const WASP_WING_DEPTH_BIAS = 0.015;
const PLATFORM_OUTER_DEPTH = 0.70;

function modularWaspWingAttach(v, e, K) {
  if (!v.waspModular || e.kind !== 'wasp') return;
  const mat = applySurface(spriteMaterial(v.waspModular.tex), K.surface);
  // The wing painting itself carries its membrane and spars. Idle flight gets
  // no emissive bloom, and phase changes never modulate opacity.
  mat.emissive.setHex(PAL.glowOff);
  mat.emissiveIntensity = 0;
  const mesh = new THREE.Mesh(v.waspModular.wings[0].geo, mat);
  mesh.name = 'Wasp modular hinged wing bank';
  mesh.visible = false;
  mesh.renderOrder = 1;
  v.mesh.renderOrder = 2;
  scene.add(mesh);
  v.waspWingMesh = mesh;
  v.waspWingMat = mat;
  v.waspWingPhase = 0;
  v.waspBodyDepth = -Infinity;
  v.waspWingDepth = -Infinity;
}

function modularWaspWingHide(v) {
  if (v.waspWingMesh) v.waspWingMesh.visible = false;
}

function syncModularWaspWing(v, e, depth, signaling) {
  if (!v.waspWingMesh) return;
  const phase = selectWaspWingPhase(e);
  if (phase !== v.waspWingPhase) {
    v.waspWingPhase = phase;
    v.waspWingMesh.geometry = v.waspModular.wings[phase].geo;
  }
  const wingDepth = depth - WASP_WING_DEPTH_BIAS;
  v.waspBodyDepth = depth;
  v.waspWingDepth = wingDepth;
  v.waspWingMesh.visible = v.mesh.visible && v.mat.opacity > 0.001;
  placeOnTower(v.waspWingMesh, e.x, e.y + v.presentationLift, wingDepth);
  // A single transform owns the whole assembly. Mirroring, bank, scale and
  // anchoring can never disagree between body and wing-root.
  v.waspWingMesh.rotation.z = v.mesh.rotation.z;
  v.waspWingMesh.scale.copy(v.mesh.scale);
  v.waspWingMat.opacity = v.mat.opacity;
  if (signaling) v.waspWingMat.emissive.copy(v.mat.emissive);
  else v.waspWingMat.emissive.setHex(PAL.glowOff);
  v.waspWingMat.emissiveIntensity = signaling ? v.mat.emissiveIntensity * 0.72 : 0;
}

function modularWaspWingDetach(v, preserveForDeath = false) {
  if (!v.waspWingMesh) return null;
  const mesh = v.waspWingMesh;
  const mat = v.waspWingMat;
  v.waspWingMesh = null;
  v.waspWingMat = null;
  if (!preserveForDeath) {
    scene.remove(mesh);
    mat.dispose();
    return null;
  }
  mesh.visible = true;
  return {
    mesh, mat, type: 'wasp-wing-bank', index: 0,
    rotation: mesh.rotation.z,
    depth: v.waspWingDepth,
    face: Math.sign(mesh.scale.x) || 1,
    sx: Math.abs(mesh.scale.x) || 1,
    sy: Math.abs(mesh.scale.y) || 1,
    sz: Math.abs(mesh.scale.z) || 1,
    opacity: Math.max(0.55, mat.opacity || 0),
  };
}

/* Painted wasp articulation FALLBACK. The shipped four-frame atlas uses the
 * primary body mesh and shows exactly one UV cell. If that atlas fails its
 * boot gate, these two older production cuts still provide a complete and
 * visible flight beat rather than falling all the way back to a static body.
 * Both production cuts were measured through the
 * same primitive envelope in sprite-table.js, so their opaque centres and
 * one-tile body lengths share an anchor. The idle drone crossfades between
 * those complete painted phases while position, facing, bank, scale and
 * materialization remain identical. No procedural appendage is drawn, and
 * the sim hitbox stays the original 0.55-tile circle. The separate action
 * slot remains reserved for the committed dive silhouette. */
function paintedWaspFlapAttach(v, e, K) {
  if (e.kind !== 'wasp' || !v.sprite || v.motionTex || !v.flapTex || !v.flapGeo) return;
  const mat = applySurface(spriteMaterial(v.flapTex), K.surface);
  const mesh = new THREE.Mesh(v.flapGeo, mat);
  mesh.name = 'Wasp painted downstroke phase';
  mesh.visible = false;
  // The base pose writes depth first; the co-anchored downstroke sits a hair
  // nearer and crossfades over it without z-fighting or changing world depth.
  mesh.renderOrder = 2;
  scene.add(mesh);
  v.flapMesh = mesh;
  v.flapMat = mat;
  v.flapMix = 0;
}

function paintedWaspFlapHide(v) {
  if (v.flapMesh) v.flapMesh.visible = false;
}

function paintedWaspFlapDetach(v) {
  if (!v.flapMesh) return;
  scene.remove(v.flapMesh);
  v.flapMat.dispose();
  v.flapMesh = null;
  v.flapMat = null;
}

function syncPaintedWaspFlap(v, e, depth) {
  if (!v.flapMesh) return;
  const presence = v.mat.opacity;
  const committed = e.state === 'dive';
  if (committed) {
    // syncSpritePose put the primary quad on the dedicated dive art. The
    // flight downstroke is a third phase and must not leak into that tell.
    v.flapMix = 0;
    v.flapMesh.visible = false;
    v.flapMat.opacity = 0;
    return;
  }
  const raw = 0.5 + 0.5 * Math.sin(e.t * 20 + e.id * 1.73);
  // Spend most of the beat in one complete PAINTED pose and crossfade only
  // through the middle 44%. The old full-range smoothstep left both wing
  // silhouettes half-visible for too long, which read as a translucent green
  // wedge at gameplay scale rather than a paired upstroke/downstroke.
  const crossing = Math.max(0, Math.min(1, (raw - 0.28) / 0.44));
  const mix = crossing * crossing * (3 - 2 * crossing);
  v.flapMix = mix;
  v.flapMesh.visible = v.mesh.visible && presence > 0.001;
  placeOnTower(v.flapMesh, e.x, e.y + v.presentationLift, depth + 0.012);
  v.flapMesh.rotation.z = v.mesh.rotation.z;
  v.flapMesh.scale.copy(v.mesh.scale);
  // A tiny compression at full downstroke reinforces force without moving the
  // actor, its hit radius, contact shadow, genome modules or tell geometry.
  v.flapMesh.scale.y *= 0.97 + mix * 0.03;
  v.flapMat.emissive.copy(v.mat.emissive);
  v.flapMat.emissiveIntensity = v.mat.emissiveIntensity;
  v.flapMat.opacity = presence * mix;
  // Complementary opacity keeps total body energy constant through the beat;
  // only the painted wing silhouette changes.
  v.mat.opacity = presence * (1 - mix);
}

// which way the drawn body points: the sim row's facing, except that a
// committed dive is steered by velocity and may cross its own facing
function relayFacing(e) {
  if (e.kind !== 'polyp' || e.state !== 'relay') return e.dir < 0 ? -1 : 1;
  const u = 1 - Math.max(0, Math.min(1,
    (e.stateUntil - gameMs) / CONFIG.genome.relayHingeMs));
  return e.relayFromDir * Math.cos(Math.PI * u);
}

function spriteFaceX(e, poseKey = 'base') {
  let desired = e.kind === 'wasp' && waspDiving(e)
    ? (e.vx < 0 ? -1 : 1)
    : relayFacing(e);
  // A plane has no visible yaw thickness, so relayFacing's cosine
  // foreshortening supplies the hinge: profile → edge-on → opposite profile.
  // The production atlas is painted facing left; the retained A/B sprites
  // face right. Bake that authoring convention into the mirror once so every
  // state pose and action cutout follows the sim's direction.
  const productionLeft = e.kind === 'wasp' || e.kind === 'hound' ||
    e.kind === 'mortar' || e.kind === 'warden';
  // Hound gait v2 is deliberately authored facing right; its retained base
  // and fallback action paintings face left. Pose-local authoring keeps the
  // state swap from making the creature reverse direction for one frame.
  const houndMotionRight = e.kind === 'hound' && poseKey.startsWith('motion:');
  const modularWaspRight = e.kind === 'wasp' && poseKey.startsWith('waspmod:');
  const actor = poseKey.startsWith('actor:') ? actorMotionBundle(e.kind) : null;
  const authored = actor ? actor.spec.authoredFacing :
    (houndMotionRight || modularWaspRight) ? 1 :
    (e.kind === 'warden' || spriteVariantOf(e.kind) === 'b') && productionLeft ? -1 : 1;
  return desired * authored;
}

function enemyEcologyFaceX(e) {
  const desired = e.kind === 'wasp' && waspDiving(e)
    ? (e.vx < 0 ? -1 : 1) : relayFacing(e);
  // Every approved ecology source board points toward local -x. Mirror the
  // complete parented body/action assembly, never the layers independently.
  return desired * -1;
}

function enemyEcologyRoll(e, K) {
  if (e.kind === 'wasp') return spriteRoll(e, K);
  if (e.kind === 'hound' &&
      (e.state === 'vault' || e.state === 'reboundVault' || e.state === 'tumble')) {
    const travel = Math.sign(e.vx) || e.dir || 1;
    return Math.atan2(e.vy, Math.max(0.1, Math.abs(e.vx))) * travel * 0.18;
  }
  return 0;
}

function spriteRoll(e, K) {
  if (e.kind === 'mortar') return 0;                 // drawn into the art
  if (e.kind === 'wasp') {
    if (!waspDiving(e)) return Math.sin(e.t * 1.6) * 0.12;   // a bank, not a spin
    const a = Math.atan2(e.vy, e.vx);
    // mirrored, the nose is local -x: rotating by a + PI points it down the
    // dive vector and keeps the drone's own up-side up
    return e.vx < 0 ? a + Math.PI : a;
  }
  return K.roll(e);
}

/* ---------------------- THE HIT FLASH (I-010) ----------------------------
 * A hit used to set the body's emissive to PAL.hitFlash — full white — which
 * is a fine pop on a 100px chassis and a readability defect on a 15px one.
 * At the shipped FAR view it replaced the silhouette instead of lighting it:
 * the drone lost its facets, its acid hue and its kind, and a screenshot gate
 * spent real time deciding whether a white quad was a shot wasp or a player
 * render bug (inbox I-010). Measured on the shipped tree, a cruising wasp's
 * flashed body core ran saturation 0.67 -> 0.07 and hue 124° -> 181°: the
 * ecology's color, gone for the 70ms that matter most.
 *
 * So the flash now TINTS the body instead of replacing it: hitFlash mixed
 * toward the kind's own color, once per kind at module load. The mix is 0 at
 * ?view=near and grows with the pull-back, which is the readability pass's own
 * rule (src/render/legibility.js) rather than a new one — a message may take
 * back exactly as much as the camera took, and no more:
 *
 *   ?view=near      CUE_GAIN 1    -> tint 0   -> the pre-pass white pop, exactly
 *   ?legibility=0   CUE_GAIN 1    -> tint 0   -> the operator's A/B, at any view
 *   ?view=far       CUE_GAIN 1.9  -> tint 0.8 -> the acid survives the pop
 *
 * The flash still wins over every state glow in sync() below, and it stays the
 * same event in both palettes (what differs is the body's own color, which is
 * what the palette flag is for). What it may never become is a SECOND
 * commitment cue: it stays PALE where a state glow is saturated, so "I hit it"
 * cannot be confused with "it is diving at me".
 *
 * Measured at the shipped FAR view, 1280x800, concept palette, on a wasp
 * (artifacts/hitflash-v1/ — the flashed body core's saturation and hue):
 *   tint 0    (the old white)  sat 0.07, hue 181 — hueless: this is I-010
 *   tint 0.55                  sat 0.11, hue 132 — still hueless under ACES
 *   tint 0.8  (shipped)        sat 0.20, hue 103 — acid, and paler than a glow
 *   tint 1.0  (the body color) sat 0.43, hue  85 — reads like the DIVE cue
 *
 * 1.0 is the ceiling for a reason: at full tint the flash renders as the same
 * hot acid the dive commitment glow wears (measured on the same frame at sat
 * 0.46 / hue 70), and "I hit it" would start meaning "it is coming for you".
 * The tune stays deliberately PALE, which is also what keeps a hit readable on
 * a body that is ALREADY glowing: a diving drone flashes by washing out.
 * Driving the emissive softer (0.55) does bring back some facet shading, but
 * it costs exactly that separation — the damped flash measured sat 0.46 on a
 * diver, indistinguishable from its own dive glow — so it is not the tune.  */
const HIT_TINT_FAR = 0.8;                // how far toward the body color the flash
                                         //   mixes at the shipped FAR default
const HIT_TINT = HIT_TINT_FAR * Math.min(1, Math.max(0,
  (CUE_GAIN - 1) / (CONFIG.viewScales.far.depthMult - 1)));

// one tinted flash color per kind, resolved at load: the hot loop only reads it
const FLASH = {};
for (const kind of Object.keys(LOOK)) {
  FLASH[kind] = new THREE.Color(PAL.hitFlash)
    .lerp(new THREE.Color(LOOK[kind].color), HIT_TINT).getHex();
}

/* ------------------------- THE TELL LAMP (T-003) -------------------------
 * The warning light the houndframe's and the polyp's code comments have
 * always described, given actual geometry so it survives the FAR default
 * view. A body-wide warning tint became an automatic dodge instruction at
 * play scale; the signal now stays on the arming part itself.
 *
 * It is a LAMP, not a HUD marker — a small light on the machine, sized in
 * world tiles and placed on the part of the body that is arming (the
 * houndframe's head, the polyp's iris aperture). CUE_GAIN holds its screen
 * size across the pull-back, so it stops shrinking away without becoming a
 * floating icon. It wears the roster's ONE warning color (PAL.houndTell /
 * PAL.polypTell — warm amber in both palettes), never the acid a body wears,
 * and it exists only while the sim row is actually in its tell state, so it
 * can never promise a threat the sim is not running. ?legibility=0 removes
 * it entirely.
 *
 * Deliberately NOT given to the wasp: a lamp per drone in a swarm is the
 * clutter pillar 5 forbids, and a diving wasp already has a whole-body
 * commitment read (waspPose above).                                       */
const lampGeo = new THREE.OctahedronGeometry(1);   // unit radius: scaled per frame
const LAMP_DEPTH = 0.35;                 // just proud of the combat plane, toward the
                                         //   camera, so the body never eats its own lamp

/* T-048 (decisions.md entry 18): the emissive families' HDR headroom. A tell
   lamp, a live beam and a detonation are LIGHT — bloom only bleeds what is
   above its threshold, and a quad drawn at exactly its token color sits under
   it. postGain() is 1 whenever the bloom pass is not actually drawing, so
   ?bloom=0 and a failed composer both give back the pre-pass color exactly.
   Called per frame on materials whose color is already written per frame. */
function lit(mat, hex) {
  mat.color.setHex(hex).multiplyScalar(postGain());
}

function lampAttach(v, color) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0 });
  const lamp = new THREE.Mesh(lampGeo, mat);
  lamp.visible = false;
  scene.add(lamp);
  v.lamp = lamp;
  v.lampMat = mat;
  v.lampColor = color;                   // the token; the drawn color is lit() of it
}

function lampDetach(v) {
  scene.remove(v.lamp);
  v.lampMat.dispose();
}

function lampShow(v, e, dx, dy, alpha, swell) {
  v.lamp.visible = true;
  lit(v.lampMat, v.lampColor);           // a warning light, not a warning decal
  v.lampMat.opacity = alpha;
  v.lamp.scale.setScalar(LAMP_R * CUE_GAIN * swell);
  placeOnTower(v.lamp, e.x + dx, e.y + dy, LAMP_DEPTH);
}

// Houndframe: a small charge lamp rides the head it rears back on, gathers
// intensity, then goes solid and big on the final locked coil.
function houndLamp(v, e) {
  const H = CONFIG.hound;
  if (!LEGIBILITY_ON || e.state !== 'tell') { v.lamp.visible = false; return; }
  const dx = e.dir * 0.55, dy = 0.95;    // clear of the chassis it rears on
  if (e.stateUntil - gameMs <= H.tellCoilMs) {
    lampShow(v, e, dx, dy, 1, LAMP_COIL_SWELL);
    return;
  }
  const u = houndTellU(e);
  lampShow(v, e, dx, dy, 0.30 + u * 0.48, 0.68 + u * 0.28);
}

// Iris Polyp: the lamp IS the iris, at the aperture the beam will leave
// from. It breathes steadily while arming and snaps bright only for the final
// frozen commitment, keeping the signal local instead of flashing the bulb.
function polypLamp(v, e) {
  const PP = CONFIG.polyp;
  if (!LEGIBILITY_ON || e.state !== 'tell') { v.lamp.visible = false; return; }
  const dx = e.dir * PP.barrelTiles, dy = 0;
  const left = Math.max(0, e.stateUntil - gameMs);
  if (left <= PP.commitCueMs) {
    lampShow(v, e, dx, dy, 1, LAMP_COIL_SWELL);
    return;
  }
  const u = 1 - Math.max(0, Math.min(1, left / PP.tellMs));
  const onset = PP.tellMs - left <= POLYP_ONSET_MS ? 0.12 : 0;
  lampShow(v, e, dx, dy, 0.26 + onset + u * 0.50, 0.70 + u * 0.26);
}

const LAMP_SYNC = { hound: houndLamp, polyp: polypLamp };

/* Every hostile owns a pooled halo sized from the primitive box its art
 * replaces, but the halo is visible ONLY while the simulation says the body
 * is signaling. Resting silhouettes must read through paint, value and contact
 * shadow; permanent glow turned every actor into a sticker and robbed attacks
 * of their visual verb. The brighter props are kind-specific and only exist
 * while the matching sim state is live, so the vocabulary stays learnable:
 *
 *   amber chevrons  = this lane is about to be occupied
 *   acid wake       = this body is committed and moving now
 *   amber deck jaws = this landing point is counting down
 */
function readabilityAttach(v, e, K) {
  const box = primitiveBox(e.kind);
  const glowMat = signalMaterial(K.color, actorGlowTex);
  const glow = new THREE.Mesh(actorGlowGeo, glowMat);
  glow.renderOrder = 0;
  scene.add(glow);
  v.actorGlow = glow;
  v.actorGlowMat = glowMat;
  v.actorBox = box;

  if (e.kind === 'wasp' || e.kind === 'hound') {
    const wakeMat = signalMaterial(e.kind === 'wasp' ? PAL.waspDive : PAL.houndCharge, streakTex);
    const wake = new THREE.Mesh(streakGeo, wakeMat);
    wake.visible = false;
    wake.renderOrder = 1;
    scene.add(wake);
    v.attackWake = wake;
    v.attackWakeMat = wakeMat;
  }

  if (e.kind === 'hound' || e.kind === 'polyp') {
    const laneColor = e.kind === 'hound' ? PAL.houndTell : PAL.polypTell;
    const laneMat = signalMaterial(laneColor, chevronTex);
    const lane = new THREE.Mesh(laneGeo, laneMat);
    lane.visible = false;
    lane.renderOrder = 1;
    scene.add(lane);
    v.tellLane = lane;
    v.tellLaneMat = laneMat;
  }

  if (e.kind === 'mortar') {
    const clampMat = signalMaterial(PAL.mortarMark);
    const clamp = new THREE.Mesh(zoneClampGeo, clampMat);
    clamp.visible = false;
    clamp.renderOrder = 1;
    scene.add(clamp);
    v.zoneClamp = clamp;
    v.zoneClampMat = clampMat;
  }
}

function readabilityDetach(v) {
  for (const [mesh, mat] of [
    [v.actorGlow, v.actorGlowMat], [v.attackWake, v.attackWakeMat],
    [v.tellLane, v.tellLaneMat], [v.zoneClamp, v.zoneClampMat],
  ]) {
    if (!mesh) continue;
    scene.remove(mesh);
    mat.dispose();
  }
}

function readabilityHide(v) {
  if (v.actorGlow) v.actorGlow.visible = false;
  if (v.attackWake) v.attackWake.visible = false;
  if (v.tellLane) v.tellLane.visible = false;
  if (v.zoneClamp) v.zoneClamp.visible = false;
}

function syncActorGlow(v, e, K, sx, sy, signaling) {
  const b = v.actorBox;
  if (!b) return;
  if (!signaling) {
    v.actorGlow.visible = false;
    return;
  }
  const face = spriteFaceX(e);
  const pulse = 0.96 + Math.sin(gameMs * 0.009 + e.id * 0.71) * 0.04;
  v.actorGlow.visible = true;
  placeOnTower(v.actorGlow,
    e.x + b.cx * face * v.presentationScale,
    e.y + v.presentationLift + b.cy * v.presentationScale,
    -0.10);
  v.actorGlow.rotation.z = v.sprite ? spriteRoll(e, K) : K.roll(e);
  v.actorGlow.scale.set(b.w * sx * 1.48 * pulse, b.h * sy * 1.62 * pulse, 1);
  v.actorGlowMat.color.setHex(K.pose ? K.pose(e).glow || K.color : K.color);
  // Action light is restrained enough to preserve the painted body. Impact,
  // beam and projectile effects provide the hot core at the actual event.
  v.actorGlowMat.opacity = v.mat.opacity * (e.kind === 'warden' ? 0.20 : 0.17);
}

function syncAttackRead(v, e) {
  if (v.attackWake) v.attackWake.visible = false;
  if (v.tellLane) v.tellLane.visible = false;

  if (e.kind === 'wasp' && v.attackWake && waspDiving(e)) {
    const speed = Math.max(0.001, Math.hypot(e.vx, e.vy));
    const ux = e.vx / speed, uy = e.vy / speed;
    const launched = waspLaunched(e);
    const length = launched ? 1.65 : 0.72;
    v.attackWake.visible = true;
    placeOnTower(v.attackWake, e.x - ux * length * 0.43, e.y - uy * length * 0.43, -0.06);
    v.attackWake.rotation.z = Math.atan2(e.vy, e.vx);
    v.attackWake.scale.set(length, launched ? 0.34 : 0.18, 1);
    lit(v.attackWakeMat, PAL.waspDive);
    v.attackWakeMat.opacity = launched ? 0.52 : 0.24;
    return;
  }

  if (e.kind === 'hound') {
    const H = CONFIG.hound;
    if (e.state === 'tell' && v.tellLane) {
      const left = e.stateUntil - gameMs;
      if (left > H.tellCoilMs) return;
      const u = 1 - Math.max(0, left / H.tellCoilMs);
      const reach = 1.35;
      v.tellLane.visible = true;
      placeOnTower(v.tellLane, e.x + e.dir * reach / 2, e.y - H.rideY + 0.11, -0.05);
      v.tellLane.scale.set(e.dir * reach, 0.24 + 0.08 * u, 1);
      lit(v.tellLaneMat, PAL.houndTell);
      v.tellLaneMat.opacity = 0.20 + 0.30 * u;
    } else if (e.state === 'charge' && v.attackWake) {
      const length = 2.35;
      v.attackWake.visible = true;
      placeOnTower(v.attackWake, e.x - e.dir * length * 0.42, e.y, -0.06);
      v.attackWake.scale.set(e.dir * length, 0.56, 1);
      lit(v.attackWakeMat, PAL.houndCharge);
      v.attackWakeMat.opacity = 0.58;
    }
    return;
  }

  if (e.kind === 'polyp' && e.state === 'tell' && v.tellLane) {
    const PP = CONFIG.polyp;
    const left = Math.max(0, e.stateUntil - gameMs);
    if (left > PP.commitCueMs) return;
    const u = 1 - Math.max(0, Math.min(1, left / PP.commitCueMs));
    // Only the barrel's final charge ray names direction. The eventual beam
    // volume is withheld until it is live.
    const preview = 1.25;
    const socketed = motionSocketWorld(v, e, 'muzzle');
    const muzzleS = socketed ? MOTION_SOCKET.s : e.x + e.dir * PP.barrelTiles;
    const muzzleY = socketed ? MOTION_SOCKET.y : e.y;
    v.tellLane.visible = true;
    placeOnTower(v.tellLane,
      muzzleS + e.dir * preview / 2, muzzleY, -0.04);
    v.tellLane.scale.set(e.dir * preview, 0.16 + u * 0.10, 1);
    lit(v.tellLaneMat, PAL.polypTell);
    v.tellLaneMat.opacity = 0.22 + 0.36 * u;
  }
}

function syncMortarBeacon(v, e) {
  if (!v.zoneClamp) return;
  const marked = e.state === 'lob' || e.state === 'fuse' || e.state === 'burst';
  v.zoneClamp.visible = marked;
  if (!marked) return;
  const M = CONFIG.mortar;
  const pulse = 0.5 + 0.5 * Math.sin(gameMs * (e.state === 'fuse' ? 0.028 : 0.014));
  const burst = e.state === 'burst';
  const width = M.blastHalf * 2 * (burst ? 1.04 : 0.86 + pulse * 0.07);
  const height = burst ? 1.04 : 0.52 + pulse * 0.12;
  placeOnTower(v.zoneClamp, e.zoneX, e.zoneY + height * 0.5, -0.08);
  v.zoneClamp.scale.set(width, height, 1);
  lit(v.zoneClampMat, burst ? PAL.mortarBlast : PAL.mortarMark);
  v.zoneClampMat.opacity = burst ? 0.88 : 0.30 + pulse * 0.30;
}

/* ---------------- Crown evolution + wasp articulation ----------------
 * Aegis and pincer are sim traits, so every visual here is a read of fields
 * that collision already used this frame. Magenta is Crown control energy;
 * attack commitments retain the roster's amber/acid vocabulary. */
function evolutionAttach(v, e, atlasOwnedMechanics = null) {
  v.evolutionMeshes = [];
  v.evolutionMats = [];
  v.paintedGenes = new Map();
  v.paintedGeneRows = [];
  const atlasOwns = (id) => !!atlasOwnedMechanics?.includes(id);
  v.mechanicReadOwnership = Object.create(null);
  for (const id of e.effectiveMechanics || [])
    v.mechanicReadOwnership[id] = atlasOwns(id)
      ? 'atlas body/action vocabulary' : 'existing dynamic hardware';
  for (const id of e.tactics || [])
    v.mechanicReadOwnership[id] = 'atlas action + exact tactic VFX';
  const attach = (name, geo, color = PAL.capsule) => {
    const mat = signalMaterial(color);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.visible = false;
    mesh.renderOrder = 3;
    scene.add(mesh);
    v.evolutionMeshes.push(mesh);
    v.evolutionMats.push(mat);
    return { mesh, mat };
  };
  const attachPainted = (gene) => {
    const part = paintedGenomePart(gene);
    const mat = part && paintedGenomePartMaterial();
    if (!part || !mat) return null;
    const mesh = new THREE.Mesh(part.geometry, mat);
    mesh.name = `Painted Meridian ${gene} module`;
    mesh.visible = false;
    mesh.renderOrder = 3;
    scene.add(mesh);
    v.evolutionMeshes.push(mesh);
    v.evolutionMats.push(mat);
    const row = {
      gene, mesh, mat,
      index: Math.max(0, e.genome?.genes.indexOf(gene) ?? 0),
    };
    v.paintedGenes.set(gene, row);
    v.paintedGeneRows.push(row);
    return row;
  };
  const attachModule = (name, geo, color = PAL.capsule) => {
    const mat = genomeMaterial(color);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.visible = false;
    mesh.renderOrder = 3;
    scene.add(mesh);
    v.evolutionMeshes.push(mesh);
    v.evolutionMats.push(mat);
    return { mesh, mat };
  };

  if (e.evolutionFace >= CONFIG.evolution.firstFace &&
      (e.kind === 'wasp' || e.kind === 'hound')) {
    const ward = attach('Crown Aegis local shield', wardRingGeo);
    v.wardRing = ward.mesh;
    v.wardRingMat = ward.mat;
    v.linkMotes = [];
    for (let i = 0; i < 3; i++) {
      const node = attach('Crown Aegis link packet', evolutionNodeGeo);
      v.linkMotes.push(node);
    }
  }

  if (e.aegis && !atlasOwns('AEGIS')) {
    if (!attachPainted('AEGIS')) {
      const ring = attach('Crown Aegis projector crown', aegisRingGeo);
      const core = attach('Crown Aegis projector core', evolutionNodeGeo, PAL.muzzle);
      v.aegisRing = ring.mesh;
      v.aegisRingMat = ring.mat;
      v.aegisCore = core.mesh;
      v.aegisCoreMat = core.mat;
    }
  }

  if (e.pincer && !atlasOwns('PINCER')) {
    if (!attachPainted('PINCER')) {
      const mark = attach('Pincer doctrine split arc', pincerArcGeo);
      v.pincerArc = mark.mesh;
      v.pincerArcMat = mark.mat;
    }
  }

  if (e.bulwark && !atlasOwns('BULWARK')) {
    if (!attachPainted('BULWARK')) {
      v.bulwarkPlates = [];
      for (let i = 0; i < 3; i++) {
        const plate = attachModule('Meridian Bulwark articulated face plate', genomePlateGeo,
          PAL.houndTell);
        v.bulwarkPlates.push(plate);
      }
    }
  }

  if (e.vault && !atlasOwns('VAULT')) {
    if (!attachPainted('VAULT')) {
      v.vaultCoils = [];
      for (let i = 0; i < 2; i++) {
        const coil = attachModule('Meridian Vault vector coil', genomeCoilGeo, PAL.muzzle);
        v.vaultCoils.push(coil);
      }
    }
  }

  const dynamicAttackGene = e.salvo && !atlasOwns('SALVO') ? 'SALVO'
    : e.relay && !atlasOwns('RELAY') ? 'RELAY'
      : e.twinstrike && !atlasOwns('TWINSTRIKE') ? 'TWINSTRIKE' : '';
  if (dynamicAttackGene) {
    const attackGene = dynamicAttackGene;
    if (!attachPainted(attackGene)) {
      v.attackRails = [];
      for (let i = 0; i < 2; i++) {
        const rail = attachModule(e.salvo ? 'Meridian Salvo twin rack' : e.relay
          ? 'Meridian Relay iris hinge rail'
          : 'Meridian Twinstrike flight rail', genomeRailGeo, PAL.capsule);
        v.attackRails.push(rail);
      }
    }
  }

  if (e.backlash && !atlasOwns('BACKLASH')) {
    if (!attachPainted('BACKLASH')) {
      v.backlashArcs = [];
      for (let i = 0; i < 3; i++) {
        const arc = attachModule('Meridian Backlash deployable coil shoe',
          backlashArcGeo, PAL.capsule);
        arc.mat.depthWrite = false;
        v.backlashArcs.push(arc);
      }
      v.backlashNodes = [];
      for (let i = 0; i < 3; i++) {
        const node = attachModule('Meridian Backlash coil clamp', evolutionNodeGeo, PAL.muzzle);
        v.backlashNodes.push(node);
      }
    }
  }
}

function evolutionHide(v) {
  for (const mesh of v.evolutionMeshes || []) mesh.visible = false;
}

function evolutionDetach(v) {
  for (const mesh of v.evolutionMeshes || []) scene.remove(mesh);
  for (const mat of v.evolutionMats || []) mat.dispose();
  v.evolutionMeshes = [];
  v.evolutionMats = [];
  v.paintedGenes?.clear();
  v.paintedGeneRows = [];
}

function syncPaintedGenes(v, e, depth, sx, sy, alpha) {
  if (!v.paintedGeneRows?.length) return;
  const b = v.actorBox || { w: 1, h: 1, cx: 0, cy: 0 };
  const phenotype = e.genome?.phenotype || {
    handedness: 1, moduleScale: 1, moduleTilt: 0,
    moduleBias: 0, pulsePhase: 0, platingBand: 1,
  };
  const desired = e.kind === 'wasp' && waspDiving(e)
    ? (e.vx < 0 ? -1 : 1) : relayFacing(e);
  const direction = Math.sign(desired) || e.dir || 1;
  const bodyW = b.w * Math.abs(sx);
  const bodyH = b.h * Math.abs(sy);
  let centerS = e.x + b.cx * desired * Math.abs(sx);
  let centerY = e.y + v.presentationLift + b.cy * Math.abs(sy);
  // Painted mutation modules bolt to the currently painted chassis, not to
  // the retired base card. The shared named socket keeps Aegis/Relay/Salvo
  // hardware coherent while the barrel, breech, or Warden suspension moves.
  if (motionSocketWorld(v, e, 'mutation', MUTATION_SOCKET)) {
    centerS = MUTATION_SOCKET.s;
    centerY = MUTATION_SOCKET.y;
  }
  const pulse = 0.5 + 0.5 * Math.sin(gameMs * 0.008 + phenotype.pulsePhase);
  const band = (phenotype.platingBand - 1) * bodyH * 0.035;

  for (const row of v.paintedGeneRows) {
    const L = PAINTED_GENE_LAYOUT[row.gene];
    if (!L) { row.mesh.visible = false; continue; }
    // A wide hound or tall emplacement must not turn a square bolt-on into a
    // second body. Body thickness is the stable composition unit across all
    // five anatomies; the deployed Backlash radius below remains sim-sized.
    let size = Math.min(bodyW, bodyH) * L.size * phenotype.moduleScale;
    let s = centerS + direction * (bodyW * L.ax + phenotype.moduleBias * 0.18);
    let y = centerY + bodyH * L.ay + band +
      (row.index - (v.paintedGeneRows.length - 1) / 2) * bodyH * 0.018;
    let rotation = v.mesh.rotation.z + direction * L.rot +
      phenotype.moduleTilt * phenotype.handedness;
    let opacity = 0.90;
    let intensity = 0.045;
    let scaleXFactor = desired;

    if (row.gene === 'BULWARK') {
      const open = gameMs < e.bulwarkOpenUntil;
      const ping = gameMs < e.bulwarkPingUntil;
      if (open) {
        s += direction * 0.16;
        rotation += direction * 0.18;
        opacity = 0.62;
      }
      intensity = ping ? 0.50 : open ? 0.025 : 0.075;
      size *= ping ? 1.08 : 1;
    } else if (row.gene === 'VAULT') {
      const tell = e.state === 'tell';
      const live = e.state === 'vault';
      y += live ? 0.12 : tell ? 0.06 * pulse : 0;
      rotation += live ? direction * 0.16 : 0;
      size *= live ? 1.12 : tell ? 1.02 + pulse * 0.05 : 1;
      intensity = live ? 0.30 : tell ? 0.12 + pulse * 0.08 : 0.045;
    } else if (row.gene === 'TWINSTRIKE') {
      const live = e.state === 'dive';
      size *= live ? 1.10 : 1;
      s -= direction * (live ? 0.08 : 0);
      intensity = live ? 0.23 : 0.055;
    } else if (row.gene === 'SALVO') {
      const live = e.state === 'lob' || e.state === 'fuse' || e.state === 'burst';
      y += live ? 0.08 : 0;
      rotation -= live ? direction * 0.08 : 0;
      size *= live ? 1.06 : 1;
      intensity = live ? 0.18 + pulse * 0.08 : 0.05;
    } else if (row.gene === 'RELAY') {
      const hinge = e.state === 'relay';
      const relayU = hinge ? 1 - Math.max(0, Math.min(1,
        (e.stateUntil - gameMs) / CONFIG.genome.relayHingeMs)) : 0;
      rotation += hinge ? e.relayFromDir * Math.sin(relayU * Math.PI) * 0.34 : 0;
      size *= hinge ? 1.05 : 1;
      intensity = hinge ? 0.16 + pulse * 0.07 : e.state === 'tell' ? 0.12 : 0.045;
    } else if (row.gene === 'PINCER') {
      const committed = e.state === 'dive';
      y += (e.formationSide || phenotype.handedness) * 0.045;
      rotation += direction * (e.formationSide || phenotype.handedness) * 0.04;
      size *= committed ? 1.08 : e.formationReady ? 1.03 : 1;
      intensity = committed ? 0.20 : e.formationReady ? 0.09 : 0.05;
    } else if (row.gene === 'AEGIS') {
      const ping = gameMs < e.aegisPingUntil;
      const online = e.aegisActive;
      size *= ping ? 1.10 : online ? 1.02 + pulse * 0.035 : 0.94;
      y += online ? 0.04 * pulse : -0.04;
      opacity = ping ? 1 : online ? 0.96 : 0.62;
      intensity = ping ? 0.62 : online ? 0.18 + pulse * 0.06 : 0.035;
    } else if (row.gene === 'BACKLASH') {
      const armed = !!e.backlashUntil;
      const burst = gameMs < e.backlashBurstUntil;
      const remain = armed ? Math.max(0, e.backlashUntil - gameMs) : 0;
      const u = armed ? 1 - Math.min(1, remain / CONFIG.genome.backlashTellMs) : 0;
      const deployed = CONFIG.genome.backlashRadius * 2 / BACKLASH_ATLAS_FILL_X;
      if (armed || burst) {
        size += (deployed - size) * (burst ? 1 : 0.28 + u * 0.72);
        s = e.x;
        y = e.y + v.presentationLift;
        rotation = v.mesh.rotation.z;
      }
      size *= burst ? 1 : armed ? 0.98 + pulse * 0.02 : 1;
      opacity = burst ? 1 : armed ? 0.94 : 0.84;
      intensity = burst ? 0.70 : armed ? 0.18 + u * 0.24 : 0.055;
      // The horseshoe is symmetric enough to remain stable at full radius;
      // retain only the body facing, never rotate it as screen-space UI.
      scaleXFactor = direction;
    }

    const hit = gameMs < e.flashUntil;
    if (hit) intensity = Math.max(intensity, 0.30);
    row.mesh.visible = alpha > 0.01;
    const mountLayer = row.gene === 'BACKLASH' && (e.backlashUntil ||
      gameMs < e.backlashBurstUntil) ? 0.052 : L.layer;
    placeOnTower(row.mesh, s, y, depth + mountLayer + row.index * 0.004 +
      phenotype.handedness * 0.002);
    row.mesh.rotation.z = rotation;
    const mirror = (Math.abs(scaleXFactor) < 0.04 ? 0.04 * direction : scaleXFactor) * L.authored;
    row.mesh.scale.set(size * mirror, size, size);
    row.mat.opacity = alpha * opacity;
    row.mat.emissive.setHex(0xffffff);
    row.mat.emissiveIntensity = intensity;
    row.worldSize = size;
  }
}

function syncEvolution(v, e, depth, sx, sy) {
  const alpha = v.mat.opacity;
  const pulse = 0.5 + 0.5 * Math.sin(gameMs * 0.009 + e.id * 0.61);
  syncPaintedGenes(v, e, depth, sx, sy, alpha);

  if (v.aegisRing) {
    const online = e.aegisActive;
    const ping = gameMs < e.aegisPingUntil;
    const b = v.actorBox;
    const y = e.y + v.presentationLift + (b ? b.h * sy * 0.62 : 0.8) + 0.22;
    v.aegisRing.visible = v.aegisCore.visible = alpha > 0.01;
    placeOnTower(v.aegisRing, e.x, y, depth + 0.24);
    placeOnTower(v.aegisCore, e.x, y, depth + 0.27);
    v.aegisRing.rotation.z = gameMs * (online ? 0.0024 : 0.0007);
    v.aegisRing.scale.setScalar((online ? 1.05 : 0.76) + pulse * 0.12);
    v.aegisCore.scale.setScalar((online ? 0.92 : 0.62) + pulse * 0.13);
    lit(v.aegisRingMat, ping ? PAL.muzzle : PAL.capsule);
    lit(v.aegisCoreMat, ping ? PAL.muzzle : PAL.capsule);
    v.aegisRingMat.opacity = alpha * (ping ? 0.94 : online ? 0.48 : 0.13);
    v.aegisCoreMat.opacity = alpha * (ping ? 1 : online ? 0.78 : 0.20);
  }

  if (v.wardRing) {
    const linked = !!e.wardedBy;
    const ping = gameMs < e.wardPingUntil;
    v.wardRing.visible = linked;
    if (linked) {
      placeOnTower(v.wardRing, e.x, e.y + v.presentationLift, depth + 0.23);
      v.wardRing.rotation.z = gameMs * 0.0018 * (e.formationSide || 1);
      const b = v.actorBox;
      v.wardRing.scale.set(
        (b?.w || 1) * Math.abs(sx) * 0.78 * (1 + pulse * 0.035),
        (b?.h || 1) * Math.abs(sy) * 0.92 * (1 + pulse * 0.035), 1);
      lit(v.wardRingMat, ping ? PAL.muzzle : PAL.capsule);
      v.wardRingMat.opacity = alpha * (ping ? 0.82 : 0.28 + pulse * 0.08);
    }
    for (let i = 0; i < (v.linkMotes || []).length; i++) {
      const { mesh, mat } = v.linkMotes[i];
      mesh.visible = linked;
      if (!linked) continue;
      const flow = (gameMs * 0.00052 + i / v.linkMotes.length) % 1;
      const s = e.x + (e.wardSourceX - e.x) * flow;
      const y = e.y + v.presentationLift + (e.wardSourceY - e.y) * flow + 0.18;
      placeOnTower(mesh, s, y, 0.22);
      mesh.rotation.z = gameMs * 0.003 + i;
      mesh.scale.setScalar((ping ? 1.35 : 0.78) + pulse * 0.18);
      lit(mat, ping ? PAL.muzzle : PAL.capsule);
      mat.opacity = alpha * (ping ? 0.92 : 0.48);
    }
  }

  if (v.pincerArc) {
    v.pincerArc.visible = alpha > 0.01;
    placeOnTower(v.pincerArc, e.x, e.y + v.presentationLift, depth + 0.20);
    v.pincerArc.rotation.z = (e.formationSide < 0 ? Math.PI : 0) + gameMs * 0.00055;
    v.pincerArc.scale.set(1.08 * Math.abs(sx), 0.70 * Math.abs(sy), 1);
    lit(v.pincerArcMat, PAL.capsule);
    v.pincerArcMat.opacity = alpha * (e.formationReady ? 0.20 : 0.34 + pulse * 0.12);
  }

  if (v.bulwarkPlates) {
    const open = gameMs < e.bulwarkOpenUntil;
    const ping = gameMs < e.bulwarkPingUntil;
    const b = v.actorBox || { w: 1, h: 1 };
    const front = b.w * Math.abs(sx) * 0.46 + 0.06;
    for (let i = 0; i < v.bulwarkPlates.length; i++) {
      const { mesh, mat } = v.bulwarkPlates[i];
      const spread = (i - 1) * (b.h * Math.abs(sy) * 0.25 + (open ? 0.12 : 0));
      mesh.visible = alpha > 0.01;
      placeOnTower(mesh, e.x + e.dir * (front + (open ? 0.16 : 0)),
        e.y + v.presentationLift + spread, depth + 0.28 + i * 0.006);
      mesh.rotation.z = (open ? (i - 1) * e.dir * 0.28 : e.dir * 0.035);
      mesh.scale.set(1, Math.max(0.56, b.h * Math.abs(sy) * 0.74), 1);
      genomeLit(mat, ping ? PAL.muzzle : PAL.houndTell,
        ping ? 1.1 : open ? 0.10 : 0.32);
      mat.opacity = alpha * (ping ? 1 : open ? 0.34 : 0.90);
    }
  }

  if (v.vaultCoils) {
    const arming = e.state === 'tell';
    const live = e.state === 'vault';
    const b = v.actorBox || { w: 1, h: 1 };
    for (let i = 0; i < v.vaultCoils.length; i++) {
      const { mesh, mat } = v.vaultCoils[i];
      mesh.visible = alpha > 0.01;
      placeOnTower(mesh,
        e.x - e.dir * b.w * Math.abs(sx) * (0.10 + i * 0.19),
        e.y + v.presentationLift - b.h * Math.abs(sy) * 0.34,
        depth + 0.25);
      mesh.rotation.z = gameMs * (live ? 0.009 : 0.002) * (i ? -1 : 1);
      mesh.scale.setScalar(live ? 1.42 : arming ? 1.05 + pulse * 0.22 : 0.72);
      genomeLit(mat, live ? PAL.muzzle : PAL.houndTell,
        live ? 1.0 : arming ? 0.58 : 0.20);
      mat.opacity = alpha * (live ? 1 : arming ? 0.94 : 0.74);
    }
  }

  if (v.attackRails) {
    const active = e.twinPassesLeft > 0 || e.salvoShotsRemaining > 0 ||
      (e.relay && (e.state === 'tell' || e.state === 'fire' || e.state === 'relay'));
    const b = v.actorBox || { w: 1, h: 1 };
    for (let i = 0; i < v.attackRails.length; i++) {
      const { mesh, mat } = v.attackRails[i];
      const side = i ? 1 : -1;
      mesh.visible = alpha > 0.01;
      placeOnTower(mesh,
        e.x - e.dir * b.w * Math.abs(sx) * 0.08,
        e.y + v.presentationLift + side * b.h * Math.abs(sy) * 0.27,
        depth + 0.22 + i * 0.008);
      // Co-anchor to the already-synchronized body. Reading the body transform
      // also keeps this correct for painted and primitive actors alike.
      const relayU = e.relay && e.state === 'relay'
        ? 1 - Math.max(0, Math.min(1,
          (e.stateUntil - gameMs) / CONFIG.genome.relayHingeMs)) : 0;
      mesh.rotation.z = v.mesh.rotation.z + side *
        (e.salvo ? 0.10 : e.relay
          ? 0.30 + Math.sin(relayU * Math.PI) * 0.34 : 0.18);
      mesh.scale.set(Math.max(0.74, b.w * Math.abs(sx) * 0.78), 1, 1);
      genomeLit(mat, active ? PAL.muzzle : PAL.capsule,
        active ? 0.58 + pulse * 0.22 : 0.18);
      mat.opacity = alpha * (active ? 0.96 : 0.72);
    }
  }

  if (v.backlashArcs) {
    const armed = !!e.backlashUntil;
    const burst = gameMs < e.backlashBurstUntil;
    const remain = armed ? Math.max(0, e.backlashUntil - gameMs) : 0;
    const u = armed ? 1 - Math.min(1, remain / CONFIG.genome.backlashTellMs) : 0;
    const radius = burst ? CONFIG.genome.backlashRadius * 1.12
      : armed ? CONFIG.genome.backlashRadius * (0.34 + u * 0.66) : 0.55;
    const mountedRoll = v.mesh.rotation.z + (e.kind === 'wasp' ? 0.20 : 0);
    for (let i = 0; i < v.backlashArcs.length; i++) {
      const { mesh, mat } = v.backlashArcs[i];
      mesh.visible = alpha > 0.01;
      placeOnTower(mesh, e.x, e.y + v.presentationLift, depth + 0.19 + i * 0.003);
      mesh.rotation.z = mountedRoll + i / v.backlashArcs.length * Math.PI * 2;
      mesh.scale.setScalar(radius);
      genomeLit(mat, burst ? PAL.muzzle : PAL.capsule,
        burst ? 1.05 : armed ? 0.30 + u * 0.42 : 0.12,
        burst ? 0.72 : armed ? 0.50 : 0.30);
      mat.opacity = alpha * (burst ? 0.94 : armed ? 0.38 + u * 0.34 : 0.26);
    }
    for (let i = 0; i < v.backlashNodes.length; i++) {
      const { mesh, mat } = v.backlashNodes[i];
      const a = mountedRoll + i / v.backlashNodes.length * Math.PI * 2;
      mesh.visible = alpha > 0.01;
      placeOnTower(mesh, e.x + Math.cos(a) * radius,
        e.y + v.presentationLift + Math.sin(a) * radius, depth + 0.22);
      mesh.scale.setScalar(burst ? 1.45 : armed ? 0.78 + u * 0.44 : 0.55);
      genomeLit(mat, burst ? PAL.muzzle : PAL.capsule,
        burst ? 1.1 : armed ? 0.54 : 0.14);
      mat.opacity = alpha * (burst ? 1 : armed ? 0.90 : 0.68);
    }
  }
}

const meshes = new Map();                // sim hostile row → { mesh, mat }
let ecologyPairsSpawned = 0;
let ecologyBodyMaterialsRetired = 0;
let ecologyActionMaterialsRetired = 0;

function spawnedEnemyEcology({ e, K, assets, presenter }) {
  const { ecology } = assets;
  const mat = enemyEcologyMaterial(ecology.tex, e.kind);
  const actionMat = enemyEcologyMaterial(ecology.tex, e.kind);
  const mesh = new THREE.Mesh(ecology.body[0], mat);
  const actionMesh = new THREE.Mesh(ecology.action[0], actionMat);
  mesh.name = `Enemy ecology ${ecology.spec.id} body`;
  actionMesh.name = `Enemy ecology ${ecology.spec.id} action`;
  mesh.renderOrder = 2;
  actionMesh.renderOrder = 3;
  actionMesh.visible = false;
  mesh.add(actionMesh);
  const v = {
    mesh, mat, kind: e.kind, sprite: true, presenter,
    ecology, ecologyCode: -1, ecologyBodyRow: 0, ecologyActionRow: 0,
    ecologyActionMesh: actionMesh, ecologyActionMat: actionMat,
    baseGeo: ecology.body[0], baseTex: ecology.tex,
    actionGeo: null, actionTex: null, actionActive: false,
    flapGeo: null, flapTex: null, motionTex: null, motionGeos: null,
    motionFrame: -1, motionPhase: 0, motionLastX: e.x,
    motionSource: 'enemy-ecology', poseKey: '',
    actorMotionBundle: null, actorMotionFrame: null,
    actorMotionClip: '', actorMotionMarker: '', actorMotionEvent: '',
    actorMotionProgress: 0,
    presentationScale: enemyEcologyPresentationScale(e.kind),
    presentationLift: 0,
    waspModular: null, waspBodyState: -1, waspWingPhase: 0,
    waspLastX: e.x, waspLastY: e.y, waspLastFace: Math.sign(e.dir) || 1,
    waspTurnUntil: 0, waspMotion: { turning: false, dx: 0, dy: 0 },
    actorBox: ecology.box,
    evolutionMeshes: [], evolutionMats: [], paintedGenes: new Map(),
    paintedGeneRows: [],
  };
  v.presentationLift = spriteAnchorLift(e.kind, v.presentationScale);
  syncEnemyEcologyVisual(v, e, gameMs);
  // Recipe-pinned organs are already painted into this variant's two atlas
  // layers. Optional compatible rolls keep the existing dynamic hardware so
  // Aegis, Backlash, etc. never become invisible mechanics.
  evolutionAttach(v, e, e.ecologyMechanics);

  // Physical attack volumes remain the exact shipped renderer. Static legacy
  // anatomy does not: the atlas body/action pair already paints barrel, roots,
  // tube, legs and articulated organs, preventing doubled pedestals.
  if (e.kind === 'polyp') {
    const beamMat = new THREE.MeshBasicMaterial({
      color: PAL.polyp, transparent: true, opacity: 0.28, depthWrite: false,
      side: THREE.DoubleSide, forceSinglePass: true, toneMapped: true,
    });
    const beam = new THREE.Mesh(polypBeamGeo, beamMat);
    beam.visible = false;
    scene.add(beam);
    v.beam = beam;
    v.beamMat = beamMat;
    const beamCoreMat = new THREE.MeshBasicMaterial({
      color: PAL.polypBeam, transparent: true, opacity: 0.72, depthWrite: false,
      side: THREE.DoubleSide, forceSinglePass: true, toneMapped: true,
    });
    const beamCore = new THREE.Mesh(polypBeamCoreGeo, beamCoreMat);
    beamCore.visible = false;
    scene.add(beamCore);
    v.beamCore = beamCore;
    v.beamCoreMat = beamCoreMat;
  } else if (e.kind === 'mortar') {
    mortarAttach(v, mesh);
  }
  attachEnemyEcologyTactics(v, e);

  // Spawns may be authored several beats ahead. Establish the full hidden
  // invariant immediately instead of waiting for their first sync callback.
  hideHostileVisual(v, e);
  scene.add(mesh);
  meshes.set(e, v);
  ecologyPairsSpawned++;
}

function spawnedStandard({ e, K, assets, presenter }) {
  // The sprite is taken only if its texture is ALREADY in hand. Pending,
  // failed, missing and ?sprites=0 all fall through to the primitive body
  // below — which is the pre-T-049 renderer, not a placeholder — so a body
  // is drawn on the first frame no matter what happened to the art
  // (decisions.md entry 16's degrade condition).
  //
  // Either body wears the kind's SURFACE FAMILY (T-048, entry 18): a sprite
  // quad is still a MeshStandardMaterial answering the same light rig, so a
  // drone shell has to keep responding like a shell whether its pixels come
  // from a texture or from a flat token. applySurface() only writes
  // roughness/metalness/envMap, so the map, emissiveMap, alphaTest and
  // single-pass transparency set in spriteMaterial() all survive it.
  const { tex, geo, modularBundle, actorBundle } = assets;
  // Authored actor motion is the production body, not an overlay on the old
  // card. It wins before the mesh is ever shown; a failed sheet falls through
  // to the exact base-sprite/primitive path below for the whole run.
  const actorGeo = actorBundle?.frames[0]?.geo || null;
  const actorTex = actorBundle?.tex || null;
  const bodyGeo = modularBundle?.body[WASP_BODY.CRUISE]?.geo || actorGeo || geo;
  const bodyTex = modularBundle?.tex || actorTex || tex;
  // Keep the established null-safe base-sprite path literal and lazy. Apart
  // from documenting the fallback contract for T-049, the closure prevents
  // allocating a discarded fallback material when an authored actor sheet is
  // ready at boot.
  const fallbackMaterial = () => geo ? spriteMaterial(tex) : new THREE.MeshStandardMaterial({
    color: K.color, flatShading: true, transparent: true, opacity: 0, fog: false,
  });
  const mat = applySurface((modularBundle || actorGeo)
    ? spriteMaterial(bodyTex) : fallbackMaterial(), K.surface);
  const mesh = new THREE.Mesh(bodyGeo || K.geo, mat);
  const actionTex = geo && !modularBundle ? spriteActionTexture(e.kind) : null;
  const flapTex = geo && !modularBundle ? spriteFlapTexture(e.kind) : null;
  const motionTex = geo && !modularBundle ? motionTextures.get(e.kind) || null : null;
  const v = {
    mesh, mat, kind: e.kind, sprite: !!bodyGeo, presenter,
    baseGeo: geo || bodyGeo, baseTex: tex || bodyTex,
    actionGeo: actionTex ? actionSpriteGeo(e.kind) : null,
    actionTex, actionActive: false,
    flapGeo: flapTex && !motionTex ? flapSpriteGeo(e.kind) : null,
    flapTex,
    motionTex,
    motionGeos: motionTex ? motionSpriteFrames(e.kind) : null,
    motionFrame: modularBundle ? WASP_BODY.CRUISE : -1,
    motionPhase: 0,
    motionLastX: e.x,
    motionSource: modularBundle ? 'wasp-modular' : '',
    poseKey: modularBundle ? `waspmod:${WASP_BODY.CRUISE}` : '',
    actorMotionBundle: modularBundle ? null : actorBundle,
    actorMotionFrame: null,
    actorMotionClip: '',
    actorMotionMarker: '',
    actorMotionEvent: '',
    actorMotionProgress: 0,
    presentationScale: bodyGeo ? (SPRITE_BODY_SCALE[e.kind] || 1) : 1,
    presentationLift: 0,
    waspModular: modularBundle,
    waspBodyState: modularBundle ? WASP_BODY.CRUISE : -1,
    waspWingPhase: 0,
    waspLastX: e.x,
    waspLastY: e.y,
    waspLastFace: Math.sign(e.dir) || 1,
    waspTurnUntil: 0,
    waspMotion: { turning: false, dx: 0, dy: 0 },
  };
  v.presentationLift = bodyGeo ? spriteAnchorLift(e.kind, v.presentationScale) : 0;
  modularWaspWingAttach(v, e, K);
  paintedWaspFlapAttach(v, e, K);
  readabilityAttach(v, e, K);
  evolutionAttach(v, e);
  if (e.kind === 'polyp') {
    // the side-facing barrel (board 07's model note) and the root stalk down
    // to the mounted surface — children sharing the bulb's material so
    // materialize/dissolve fades the whole body as one; the barrel offset is
    // set per frame from the sim row's facing in sync(). The sprite draws
    // both into its own art, so it takes neither child (and neither draw
    // call): one quad is the whole emplacement.
    if (!v.sprite) {
      const barrel = new THREE.Mesh(polypBarrelGeo, mat);
      mesh.add(barrel);
      v.barrel = barrel;
      const stalk = new THREE.Mesh(polypStalkGeo, mat);
      stalk.position.y = -CONFIG.polyp.rootY / 2;
      mesh.add(stalk);
    }
    // the beam is its own scene mesh: it spans the LIVE reach the sim
    // marched this frame, so what the render shows is exactly what damages
    // The full damage band stays visible, but as a translucent acid field;
    // a separate narrow core carries direction. The old single HDR slab
    // bloomed into an opaque white-green rectangle and erased the combatants
    // it was supposed to warn about.
    const beamMat = new THREE.MeshBasicMaterial({
      color: PAL.polyp, transparent: true, opacity: 0.28,
      depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, toneMapped: true,
    });
    const beam = new THREE.Mesh(polypBeamGeo, beamMat);
    beam.visible = false;
    scene.add(beam);
    v.beam = beam;
    v.beamMat = beamMat;
    const beamCoreMat = new THREE.MeshBasicMaterial({
      color: PAL.polypBeam, transparent: true, opacity: 0.72,
      depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, toneMapped: true,
    });
    const beamCore = new THREE.Mesh(polypBeamCoreGeo, beamCoreMat);
    beamCore.visible = false;
    scene.add(beamCore);
    v.beamCore = beamCore;
    v.beamCoreMat = beamCoreMat;
  } else if (e.kind === 'mortar') {
    mortarAttach(v, mesh);                 // legs, pod, and the marked-zone props
  } else if (e.kind === 'warden') {
    wardenAttach(v);                       // iris, shutters, beam and barrage volume
  }
  attachEnemyEcologyTactics(v, e);         // no-op for every ordinary row
  if (v.sprite) mesh.scale.x = spriteFaceX(e, v.poseKey); // pose-local authored facing
  // the tell lamp (T-003): only the two kinds whose telegraph is a wind-up
  // ON the body, and only while the readability pass is on
  if (LEGIBILITY_ON && LAMP_SYNC[e.kind]) {
    lampAttach(v, e.kind === 'polyp' ? PAL.polypTell : PAL.houndTell);
  }
  mesh.visible = false;                    // hidden until its materialization begins
  scene.add(mesh);
  meshes.set(e, v);
}

function spawned(e) {
  const K = LOOK[e.kind];
  // Gameplay ecologyId wins exactly. Ordinary Level-1 bodies may carry only
  // ecologyVisualId, which selects reviewed art without entering any recipe,
  // tactic, HP, collision or AI path in the simulation. Presenter priority is
  // centralized in hostile-presenters/index.js rather than repeated here and
  // again in sync().
  // Diveclaw is the neutral aerial sentence. Its 160px two-layer cutout lost
  // its body at FAR and read as two pale pincers, so that one visual identity
  // now takes the compact complete-body sheet below. Crosswind and Pincer
  // remain distinct ecology presenters and keep all 64 authored combinations.
  const pixelNeutralWasp = e.kind === 'wasp' &&
    (e.ecologyVisualId === 'wasp-diveclaw' ||
      (!e.ecologyId && !e.ecologyVisualId));
  const ecology = pixelNeutralWasp ? null
    : enemyEcologyBundle(e.ecologyId || e.ecologyVisualId, e.kind);
  if (ecology) {
    const assets = { ecology, modularBundle: null, actorBundle: null, spriteGeo: null };
    const presenter = HOSTILE_PRESENTERS.select(assets);
    presenter.spawn(PRESENTER_API, { e, K, assets, presenter });
    return;
  }

  const tex = spriteTexture(e.kind);
  const geo = tex ? spriteGeo(e.kind) : null;
  const modularBundle = e.kind === 'wasp' ? waspModularBundle() : null;
  const actorBundle = actorMotionBundle(e.kind);
  const assets = {
    ecology: null, tex, geo, spriteGeo: geo, modularBundle, actorBundle,
  };
  const presenter = HOSTILE_PRESENTERS.select(assets);
  presenter.spawn(PRESENTER_API, { e, K, assets, presenter });
}

// Death is an impact sentence, not a second movement mode. Every role holds
// its readable silhouette for one hit-punch, then resolves in the way its
// construction suggests. Painted bodies are cut into a small, authored set
// of texture-backed pieces: the actual wasp wing, hound armour, polyp iris,
// mortar tube and carrier cargo rupture instead of being replaced by generic
// triangles. All motion is bounded below one turn; ordinary rows retire in
// under 600ms while the unique Crown centerpiece holds for 1.32 seconds to
// bridge its final kill into uplink. These are render-only corpses: removal,
// score and drops have already happened in the sim before choreography begins.
const DEATH_ROLE = Object.freeze({
  // thrust dies first; the fuselage keeps its shot momentum while the two
  // painted wing banks shear upward, then every part drops below the route.
  wasp:    { ms: 520, punchMs: 52, fall: 2.35, drift: 0.92, depth: -0.62,
             tilt: 0.76, sx: 0.90, sy: 0.78 },
  // the cargo belly opens between two still-recognisable rotor shoulders.
  carrier: { ms: 560, punchMs: 70, fall: 1.55, drift: 0.48, depth: -0.82,
             tilt: 0.34, sx: 0.94, sy: 0.72 },
  // a deck-bound chassis does not explode upward: it plants, buckles and
  // skids along the deck while its fore/rear armour separates locally.
  hound:   { ms: 460, punchMs: 60, fall: 0.14, drift: 1.08, depth: -0.20,
             tilt: 0.14, sx: 1.04, sy: 0.72 },
  // rooted weapons lose pressure into their mount. The iris contracts into
  // its root; the mortar tube folds through its tripod instead of flying.
  polyp:   { ms: 420, punchMs: 64, fall: 0.24, drift: 0.03, depth: -0.48,
             tilt: 0.08, sx: 0.58, sy: 0.50 },
  mortar:  { ms: 470, punchMs: 66, fall: 0.36, drift: 0.08, depth: -0.42,
             tilt: 0.12, sx: 0.72, sy: 0.44 },
  // A six-tile Crown mechanism gets an earned three-stage failure: weapon
  // limbs clear their rails, the crown settles, then its iris implodes into
  // the mount. The long hold bridges the final kill to uplink instead of
  // letting the centerpiece silently disappear after half a second.
  warden:  { ms: 1320, punchMs: 105, fall: 0.16, drift: 0.04, depth: -0.38,
             tilt: 0.025, sx: 1.00, sy: 0.92 },
});

/* Rectangles are [u0,u1,v0,v1] in the production cutout. They partition the
 * painted silhouette into recognisable construction groups; transparent
 * texels remain transparent, so these are masks over the real art rather
 * than opaque geometry painted in approximately the right colour. Motion is
 * a short local offset from the intact reconstruction: x follows the drawn
 * body's facing, lift is an arc, drop is gravity-like, tilt is total radians
 * (never angular velocity), depth is the small tower-normal separation. */
const DEATH_PIECES = Object.freeze({
  wasp: Object.freeze([
    { tag: 'port wing bank', rect: [0.00, 0.55, 0.48, 1.00], x: -0.32, lift: 0.58, drop: 1.05, tilt: -0.72, depth: 0.16, shrink: 0.18 },
    { tag: 'starboard wing bank', rect: [0.55, 1.00, 0.48, 1.00], x: 0.48, lift: 0.72, drop: 1.32, tilt: 0.88, depth: -0.12, shrink: 0.22 },
    { tag: 'reactor and nose', rect: [0.00, 0.48, 0.00, 0.48], x: -0.12, lift: 0.16, drop: 0.42, tilt: -0.24, depth: 0.05, shrink: 0.10 },
    { tag: 'thrust tail', rect: [0.48, 1.00, 0.00, 0.48], x: 0.34, lift: 0.24, drop: 0.78, tilt: 0.46, depth: -0.08, shrink: 0.15 },
  ]),
  hound: Object.freeze([
    { tag: 'head armour', rect: [0.00, 0.32, 0.00, 1.00], x: -0.24, lift: 0.10, drop: 0.22, tilt: -0.24, depth: 0.06, shrink: 0.08 },
    { tag: 'shoulder chassis', rect: [0.32, 0.70, 0.30, 1.00], x: -0.05, lift: 0.08, drop: 0.15, tilt: -0.10, depth: -0.03, shrink: 0.05 },
    { tag: 'rear armour', rect: [0.70, 1.00, 0.26, 1.00], x: 0.26, lift: 0.16, drop: 0.28, tilt: 0.27, depth: 0.08, shrink: 0.10 },
    { tag: 'fore running gear', rect: [0.32, 0.56, 0.00, 0.30], x: -0.10, lift: 0.02, drop: 0.36, tilt: -0.34, depth: 0.03, shrink: 0.14 },
    { tag: 'rear running gear', rect: [0.56, 1.00, 0.00, 0.30], x: 0.16, lift: 0.03, drop: 0.34, tilt: 0.30, depth: -0.04, shrink: 0.14 },
  ]),
  polyp: Object.freeze([
    { tag: 'upper iris petals', rect: [0.00, 1.00, 0.68, 1.00], x: 0, lift: -0.12, drop: 0.16, tilt: 0.04, depth: -0.04, shrink: 0.52 },
    { tag: 'left iris petals', rect: [0.00, 0.32, 0.32, 0.68], x: 0.12, lift: 0, drop: 0.18, tilt: 0.08, depth: -0.02, shrink: 0.55 },
    { tag: 'pressure iris', rect: [0.32, 0.68, 0.32, 0.68], x: 0, lift: 0, drop: 0.28, tilt: 0, depth: -0.20, shrink: 0.72 },
    { tag: 'right iris petals', rect: [0.68, 1.00, 0.32, 0.68], x: -0.12, lift: 0, drop: 0.18, tilt: -0.08, depth: -0.02, shrink: 0.55 },
    { tag: 'root manifold', rect: [0.00, 1.00, 0.00, 0.32], x: 0, lift: 0, drop: 0.38, tilt: 0, depth: -0.10, shrink: 0.38 },
  ]),
  mortar: Object.freeze([
    { tag: 'launch tube', rect: [0.00, 0.62, 0.45, 1.00], x: -0.12, lift: 0.12, drop: 0.42, tilt: -0.28, depth: 0.06, shrink: 0.16 },
    { tag: 'breech housing', rect: [0.62, 1.00, 0.45, 1.00], x: 0.08, lift: 0.05, drop: 0.34, tilt: 0.18, depth: -0.04, shrink: 0.24 },
    { tag: 'left tripod', rect: [0.00, 0.42, 0.00, 0.45], x: 0.10, lift: 0, drop: 0.36, tilt: 0.24, depth: 0.02, shrink: 0.30 },
    { tag: 'mount block', rect: [0.42, 0.68, 0.00, 0.45], x: 0, lift: 0, drop: 0.42, tilt: 0, depth: -0.14, shrink: 0.52 },
    { tag: 'right tripod', rect: [0.68, 1.00, 0.00, 0.45], x: -0.10, lift: 0, drop: 0.36, tilt: -0.24, depth: 0.02, shrink: 0.30 },
  ]),
  carrier: Object.freeze([
    { tag: 'port rotor shoulder', rect: [0.00, 0.34, 0.48, 1.00], x: -0.58, lift: 0.52, drop: 0.72, tilt: -0.58, depth: 0.15, shrink: 0.18 },
    { tag: 'command chassis', rect: [0.34, 0.66, 0.48, 1.00], x: 0, lift: 0.22, drop: 0.62, tilt: 0.10, depth: -0.10, shrink: 0.16 },
    { tag: 'starboard rotor shoulder', rect: [0.66, 1.00, 0.48, 1.00], x: 0.58, lift: 0.52, drop: 0.72, tilt: 0.58, depth: 0.15, shrink: 0.18 },
    { tag: 'cargo containment belly', rect: [0.00, 1.00, 0.00, 0.48], x: 0, lift: 0.04, drop: 1.14, tilt: -0.06, depth: -0.20, shrink: 0.28 },
  ]),
  // Unlike the small roles, Warden parts carry a stage. The rectangles are
  // disjoint masks over the actual painted fortress: recognisable cannon,
  // missile rack, antenna crown, iris vault and two leg banks remain on
  // screen throughout the sentence instead of generic debris replacing it.
  warden: Object.freeze([
    { tag: 'port cannon limb', stage: 'hardpoint', rect: [0.00, 0.30, 0.30, 0.70], x: -1.52, lift: 0.48, drop: 0.58, tilt: -0.26, depth: 0.18, shrink: 0.12 },
    { tag: 'antenna crown', stage: 'crown', rect: [0.30, 0.70, 0.64, 1.00], x: -0.10, lift: 0.72, drop: 0.66, tilt: -0.09, depth: -0.18, shrink: 0.18 },
    { tag: 'starboard missile limb', stage: 'hardpoint', rect: [0.70, 1.00, 0.30, 0.70], x: 1.58, lift: 0.42, drop: 0.62, tilt: 0.24, depth: 0.16, shrink: 0.12 },
    { tag: 'signal iris vault', stage: 'core', rect: [0.30, 0.70, 0.30, 0.64], x: 0, lift: 0, drop: 0.18, tilt: 0, depth: -0.82, shrink: 0.92 },
    { tag: 'port leg bank', stage: 'mount', rect: [0.00, 0.50, 0.00, 0.30], x: -0.42, lift: 0.06, drop: 0.82, tilt: -0.17, depth: -0.08, shrink: 0.22 },
    { tag: 'starboard leg bank', stage: 'mount', rect: [0.50, 1.00, 0.00, 0.30], x: 0.42, lift: 0.04, drop: 0.84, tilt: 0.16, depth: -0.10, shrink: 0.22 },
  ]),
});

// Twelve concurrent painted ruptures cover the director's maximum readable
// combat crowd. A thirteenth retires the oldest corpse rather than allocating
// through a chain kill. Rigs are lazy and reused for the rest of the session.
// One separately capped Warden slot is reserved: without it, the many common
// species/pose keys encountered on the climb could exhaust the lazy cap before
// the only boss ever asked for its staged rig. Hard maximum: 13 materials and
// 66 small planes, with zero per-frame objects.
const MAX_ACTIVE_CORPSES = 12;
const MAX_COMMON_DEATH_RIGS = 12;
const MAX_WARDEN_DEATH_RIGS = 1;
const MAX_DEATH_RIGS = MAX_COMMON_DEATH_RIGS + MAX_WARDEN_DEATH_RIGS;
const MAX_DEATH_PLANES = MAX_COMMON_DEATH_RIGS * 5 + MAX_WARDEN_DEATH_RIGS * 6;
const deathPieceGeos = new Map();
const deathRigPools = new Map();
let deathRigCount = 0;
let deathPlaneCount = 0;
let commonDeathRigCount = 0;
let wardenDeathRigCount = 0;

function deathPieceGeo(key, q, rect, index) {
  const id = `${key}:${index}`;
  let geo = deathPieceGeos.get(id);
  if (geo) return geo;
  const [u0, u1, v0, v1] = rect;
  geo = new THREE.PlaneGeometry(q.w * (u1 - u0), q.h * (v1 - v0));
  geo.translate(q.offX + (u0 + u1 - 1) * q.w / 2,
    q.offY + (v0 + v1 - 1) * q.h / 2, 0);
  const uv = geo.attributes.uv;
  for (let n = 0; n < uv.count; n++) {
    uv.setXY(n, u0 + uv.getX(n) * (u1 - u0),
      v0 + uv.getY(n) * (v1 - v0));
  }
  uv.needsUpdate = true;
  // Fragment materials share the live sprite shader. Preserve their authored
  // painting with a white identity attribute rather than letting a missing
  // color attribute resolve to black on the GPU.
  applySpriteUnderside(geo, 1);
  deathPieceGeos.set(id, geo);
  return geo;
}

// The Warden is always rendered from the resident actor-motion atlas.  Its
// terminal frame therefore needs pieces cut from that frame's baked UV cell,
// not from the obsolete base sprite.  Build those six immutable planes once
// at module boot; the kill merely claims and animates them.
function actorDeathPieceGeo(key, frame, rect, index) {
  const id = `${key}:${index}`;
  let geo = deathPieceGeos.get(id);
  if (geo) return geo;
  frame.geo.computeBoundingBox();
  const box = frame.geo.boundingBox;
  const width = box.max.x - box.min.x;
  const height = box.max.y - box.min.y;
  const offX = (box.min.x + box.max.x) / 2;
  const offY = (box.min.y + box.max.y) / 2;
  const sourceUv = frame.geo.attributes.uv;
  let sourceU0 = Infinity, sourceU1 = -Infinity;
  let sourceV0 = Infinity, sourceV1 = -Infinity;
  for (let i = 0; i < sourceUv.count; i++) {
    sourceU0 = Math.min(sourceU0, sourceUv.getX(i));
    sourceU1 = Math.max(sourceU1, sourceUv.getX(i));
    sourceV0 = Math.min(sourceV0, sourceUv.getY(i));
    sourceV1 = Math.max(sourceV1, sourceUv.getY(i));
  }
  const [u0, u1, v0, v1] = rect;
  geo = new THREE.PlaneGeometry(width * (u1 - u0), height * (v1 - v0));
  geo.translate(offX + (u0 + u1 - 1) * width / 2,
    offY + (v0 + v1 - 1) * height / 2, 0);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const localU = u0 + uv.getX(i) * (u1 - u0);
    const localV = v0 + uv.getY(i) * (v1 - v0);
    uv.setXY(i,
      sourceU0 + localU * (sourceU1 - sourceU0),
      sourceV0 + localV * (sourceV1 - sourceV0));
  }
  uv.needsUpdate = true;
  geo.userData.actorMotionKind = 'warden';
  geo.userData.actorMotionFrame = frame.index;
  geo.userData.deathPiece = index;
  applySpriteUnderside(geo, 1);
  deathPieceGeos.set(id, geo);
  return geo;
}

function buildFixedWardenDeathRig() {
  const bundle = actorMotionBundle('warden');
  const frame = bundle?.frameByName?.['damaged-exposed'];
  const layout = DEATH_PIECES.warden;
  if (!bundle || !frame || !layout) return null;
  const key = 'warden:actor-terminal';
  const mat = applySurface(spriteMaterial(bundle.tex), LOOK.warden.surface);
  const pieces = layout.map((def, index) => {
    const mesh = new THREE.Mesh(actorDeathPieceGeo(key, frame, def.rect, index), mat);
    mesh.name = `warden death ${def.tag}`;
    mesh.visible = false;
    mesh.renderOrder = 2;
    scene.add(mesh);
    return { mesh, def };
  });
  const rig = { key, mat, pieces, inUse: false, fixedAtBoot: true };
  deathRigPools.set(key, [rig]);
  deathRigCount++;
  deathPlaneCount += pieces.length;
  wardenDeathRigCount++;
  return rig;
}

const fixedWardenDeathRig = buildFixedWardenDeathRig();

function claimDeathRig(v, e) {
  // Ecology breakup is already authored as the attached B7/A7 atlas pair.
  // Fail before touching the legacy rig pools; every ordinary actor continues
  // through the exact pre-ecology claim path below.
  if (v.ecology) return null;
  const layout = DEATH_PIECES[e.kind];
  if (!v.sprite || !layout) return null;
  let rig = null;
  if (e.kind === 'warden') {
    // One centerpiece can exist.  Never allocate or recrop its atlas on kill.
    if (fixedWardenDeathRig && !fixedWardenDeathRig.inUse)
      rig = fixedWardenDeathRig;
  } else {
    const action = !!(v.actionActive && v.actionTex && v.actionGeo);
    const key = `${e.kind}:${spriteVariantOf(e.kind)}:${action ? 'action' : 'base'}`;
    let pool = deathRigPools.get(key);
    if (!pool) { pool = []; deathRigPools.set(key, pool); }
    rig = pool.find((candidate) => !candidate.inUse);
    if (!rig && commonDeathRigCount < MAX_COMMON_DEATH_RIGS) {
      const q = action ? spriteActionQuad(e.kind) : spriteQuad(e.kind, spriteVariantOf(e.kind));
      const tex = action ? v.actionTex : v.baseTex;
      if (!q || !tex) return null;
      const mat = applySurface(spriteMaterial(tex), LOOK[e.kind].surface);
      const pieces = layout.map((def, index) => {
        const mesh = new THREE.Mesh(deathPieceGeo(key, q, def.rect, index), mat);
        mesh.name = `${e.kind} death ${def.tag}`;
        mesh.visible = false;
        mesh.renderOrder = 2;
        scene.add(mesh);
        return { mesh, def };
      });
      rig = { key, mat, pieces, inUse: false, fixedAtBoot: false };
      pool.push(rig);
      deathRigCount++;
      deathPlaneCount += pieces.length;
      commonDeathRigCount++;
    }
  }
  if (!rig) return null; // bounded overload: the intact role-collapse remains
  rig.inUse = true;
  rig.mat.opacity = 1;
  rig.mat.emissive.setHex(PAL.glowOff);
  for (const part of rig.pieces) part.mesh.visible = false;
  return rig;
}

function releaseDeathRig(rig) {
  if (!rig) return;
  rig.inUse = false;
  rig.mat.opacity = 0;
  for (const part of rig.pieces) part.mesh.visible = false;
}

// A source mutation owns real hardware outside the painted quad. On death we
// retain only the pieces whose shutdown is combat information: an Aegis
// projector contracts into its source and Backlash's three discontinuous
// shoes fold against the chassis. Everything else retires immediately, and
// no complete ring expands away from the body.
function ruptureEvolution(v, e) {
  const selected = new Map();
  if (e.aegis) {
    const painted = v.paintedGenes?.get('AEGIS');
    if (painted) selected.set(painted.mesh, { type: 'aegis-painted', index: 0 });
    else {
      if (v.aegisRing) selected.set(v.aegisRing, { type: 'aegis-ring', index: 0 });
      if (v.aegisCore) selected.set(v.aegisCore, { type: 'aegis-core', index: 1 });
    }
  }
  if (e.backlash) {
    const painted = v.paintedGenes?.get('BACKLASH');
    if (painted) selected.set(painted.mesh, { type: 'backlash-painted', index: 0 });
    else {
      for (let i = 0; i < (v.backlashArcs || []).length; i++)
        selected.set(v.backlashArcs[i].mesh, { type: 'backlash-shoe', index: i });
    }
  }
  const systems = [];
  const actorH = (v.actorBox?.h || 1) * Math.abs(v.mesh.scale.y);
  for (let i = 0; i < (v.evolutionMeshes || []).length; i++) {
    const mesh = v.evolutionMeshes[i];
    const mat = v.evolutionMats[i];
    const meta = selected.get(mesh);
    if (!meta) {
      scene.remove(mesh);
      mat.dispose();
      continue;
    }
    mesh.visible = true;
    systems.push({
      mesh, mat, type: meta.type, index: meta.index,
      yOffset: meta.type.startsWith('aegis') ? actorH * 0.62 + 0.22 : 0,
      rotation: mesh.rotation.z,
      sx: Math.abs(mesh.scale.x) || 1,
      sy: Math.abs(mesh.scale.y) || 1,
      sz: Math.abs(mesh.scale.z) || 1,
      opacity: Math.max(0.55, mat.opacity || 0),
    });
  }
  v.evolutionMeshes = [];
  v.evolutionMats = [];
  v.paintedGenes?.clear();
  v.paintedGeneRows = [];
  return systems;
}

function removed(e, fade) {
  const v = meshes.get(e);
  if (!v) return;
  meshes.delete(e);
  releaseContactShadow(e);               // nor does a corpse cast one
  if (v.beam) {                          // the beam never outlives its emplacement
    scene.remove(v.beam);
    v.beamMat.dispose();
    scene.remove(v.beamCore);
    v.beamCoreMat.dispose();
  }
  if (v.pod) mortarDetach(v);            // nor does a pod, a mark, or a blast
  if (v.wardenCore) wardenDetach(v);     // Crown attack volumes die with the interlock
  if (v.lamp) lampDetach(v);             // nor a tell lamp: a corpse never warns
  detachEnemyEcologyTactics(v);
  readabilityDetach(v);                  // warning props never dissolve as corpses
  let systems = [];
  if (fade) systems = ruptureEvolution(v, e);
  else evolutionDetach(v);               // teardown has no display-only aftermath
  systems.push(...v.presenter.prepareRemoval(PRESENTER_API, v, e, fade));
  paintedWaspFlapDetach(v);              // a corpse holds one unambiguous painted silhouette
  if (fade) {                          // hand the mesh to the corpse pass to dissolve
    const spec = DEATH_ROLE[e.kind];
    if (corpses.length >= MAX_ACTIVE_CORPSES) releaseCorpse(corpses.shift());
    const motionFrame = currentMotionFrame(v);
    // The live atlas geometry already selects the exact frame UVs. Cutting it
    // into the base-art death rig would both swap paintings and require one
    // lazily allocated rig per atlas frame, exhausting the bounded common pool.
    // Motion bodies therefore keep this same mesh through rupture and use the
    // existing intact-body buckle below. No geometry, texture, anchor or facing
    // changes at the hand-off; base/action bodies retain their authored pieces.
    // Ordinary motion atlases keep their current intact pose because the
    // shared base-art masks would swap paintings.  The unique Warden has a
    // boot-resident terminal-frame rig, so it alone can hand off from the
    // exact breached card into six independently moving assemblies.
    const rig = e.kind === 'warden'
      ? claimDeathRig(v, e)
      : motionFrame >= 0 ? null : claimDeathRig(v, e);
    const face = Math.sign(v.mesh.scale.x) || 1;
    const frozenMotion = motionFrame >= 0 ? {
      frame: motionFrame,
      poseKey: v.poseKey,
      presentationScale: v.presentationScale,
      geometry: v.mesh.geometry,
      map: v.mat.map,
      emissiveMap: v.mat.emissiveMap,
      face,
      rootedTerminal: e.kind === 'warden',
    } : null;
    const ecologyDeath = v.ecology ? Object.freeze({
      id: v.ecology.spec.id,
      bodyRow: v.ecologyBodyRow,
      actionRow: v.ecologyActionRow,
      code: v.ecologyCode,
    }) : null;
    corpses.push({ mesh: v.mesh, mat: v.mat, s: e.x,
                   y: e.y + v.presentationLift, baseRoll: v.mesh.rotation.z,
                   t0: gameMs, flash: FLASH[e.kind],
                   breakDir: Math.sign(e.vx) || e.dir || -1,
                   baseScaleX: Math.abs(v.mesh.scale.x),
                   baseScaleY: Math.abs(v.mesh.scale.y),
                   baseScaleZ: Math.abs(v.mesh.scale.z),
                   face, kind: e.kind, spec, rig, systems, frozenMotion,
                   ecologyDeath,
                   ecologyActionMesh: v.ecologyActionMesh || null,
                   ecologyActionMat: v.ecologyActionMat || null });
  } else {
    scene.remove(v.mesh);
    if (v.ecologyActionMat) {
      v.ecologyActionMat.dispose();
      ecologyActionMaterialsRetired++;
      ecologyBodyMaterialsRetired++;
    }
    v.mat.dispose();
  }
}

function hideHostileVisual(v, e) {
  v.mesh.visible = false;
  if (v.ecologyActionMesh) v.ecologyActionMesh.visible = false;
  if (v.beam) v.beam.visible = false;
  if (v.beamCore) v.beamCore.visible = false;
  if (v.pod) mortarHide(v);
  if (v.wardenCore) wardenHide(v);
  if (v.lamp) v.lamp.visible = false;
  modularWaspWingHide(v);
  paintedWaspFlapHide(v);
  readabilityHide(v);
  evolutionHide(v);
  hideEnemyEcologyTactics(v);
  releaseContactShadow(e);
}

// Presenter hooks receive one reused frame record. Dispatch is immediate and
// no presenter retains it, so the hostile hot path remains allocation-free.
const PRESENTER_FRAME = {
  K: null, depth: 0, sx: 1, sy: 1, sz: 1, glow: 0, signaling: false,
};

function syncEcologyMaterial(v) {
  v.ecologyActionMat.opacity = v.mat.opacity;
  v.ecologyActionMesh.visible = true;
}

function syncPaintedMaterial(v, frame) {
  v.mat.emissive.setHex(frame.signaling ? frame.glow : frame.K.color);
  // The Warden atlas carries its own painted response. Its body is never an
  // idle lamp; only local impact/attack props receive light.
  v.mat.emissiveIntensity = v.kind === 'warden' ? 0
    : postGain() * (frame.signaling ? 0.82 : 0.12);
}

function syncEcologyTransform(v, e, frame) {
  v.mesh.rotation.z = enemyEcologyRoll(e, frame.K);
  v.mesh.scale.set(frame.sx * enemyEcologyFaceX(e), frame.sy, frame.sz);
}

function syncPaintedTransform(v, e, frame) {
  // Actor atlases own hardware articulation. A second procedural card roll
  // would move planted feet and weapon sockets.
  v.mesh.rotation.z = presenterOwnsSilhouette(v, e) ? 0 : spriteRoll(e, frame.K);
  v.mesh.scale.set(frame.sx * spriteFaceX(e, v.poseKey), frame.sy, frame.sz);
}

function syncPrimitiveTransform(v, e, frame) {
  v.mesh.rotation.z = frame.K.roll(e);
  v.mesh.scale.set(frame.sx, frame.sy, frame.sz);
}

const PRESENTER_API = Object.freeze({
  spawnEcology: spawnedEnemyEcology,
  spawnStandard: spawnedStandard,
  syncSpritePose: (v, e) => HOSTILE_PRESENTERS.get('sprite').syncPose(PRESENTER_API, v, e),
  currentMotionFrame,
  spriteFaceX,
  locomotionFrame,
  actionPoseActive,
  detachModularWaspWing: modularWaspWingDetach,
  syncEcologyMaterial,
  syncPaintedMaterial,
  syncEcologyTransform,
  syncPaintedTransform,
  syncPrimitiveTransform,
});

function sync(e) {
  const v = meshes.get(e);
  if (!v) return;
  const W = CONFIG.wasp;
  if (!routeRenderable(e.x)) {
    hideHostileVisual(v, e);
    return;
  }
  if (!enemyEcologyCondensationStarted(e, gameMs, W.enterMs)) {
    // Staged wave slot: body, child action, exact tactic volumes and every
    // legacy companion remain hidden until the first condensation frame.
    hideHostileVisual(v, e);
    return;
  }
  v.mesh.visible = true;
  v.presenter.syncPose(PRESENTER_API, v, e);
  // Mock-3D presence for ordinary bodies. The authored Warden is a six-tile
  // Crown interlock bolted to this apron: perspective travel or 0.7 -> 1 body
  // growth makes it look like a pasted card inflating into existence. Its
  // resident deployment cells articulate around a constant footprint instead.
  // Root identity is a species contract, not an atlas-success side effect.
  // A boot-safe fallback may lose articulation, but it still may not inflate,
  // drift in perspective, or bob a Crown fixture off its apron.
  const rootedWarden = e.kind === 'warden';
  let depth, scale;
  if (gameMs < e.enterUntil) {
    const u = 1 - (e.enterUntil - gameMs) / W.enterMs;    // 0 → 1 over the entrance
    if (rootedWarden) {
      depth = 0;
      scale = 1;
      // A short optical acquisition reveals the sealed machine; all later
      // change comes from actual painted limbs/racks, never whole-body scale.
      v.mat.opacity = Math.min(1, Math.max(0, u) / 0.18);
    } else {
      const ease = 1 - (1 - u) ** 3;
      depth = W.enterDepth * (1 - ease);
      scale = 0.7 + 0.3 * ease;
      v.mat.opacity = u;
    }
  } else {
    depth = rootedWarden ? 0 : Math.sin(e.t * W.wobbleFreq) * W.wobbleAmp;
    scale = 1;
    v.mat.opacity = 1;
  }
  const K = LOOK[e.kind];
  let sx = scale, sy = scale, sz = scale;
  const flashing = gameMs < e.flashUntil;
  if (flashing) {
    // A short silhouette punch survives FAR-view minification better than a
    // colour-only blink. It is isotropic, so feet/aim sockets do not shear.
    const hitPunch = 1 + 0.08 * Math.min(1, (e.flashUntil - gameMs) / 90);
    sx *= hitPunch; sy *= hitPunch; sz *= hitPunch;
  }
  let glow = flashing ? FLASH[e.kind] : PAL.glowOff;
  if (K.pose && v.presenter.usesLegacyPose(PRESENTER_API, v, e)) {
    const p = K.pose(e);
    depth += p.depth;
    // Hound v2 already paints prowl, load, launch, airborne and landing body
    // mechanics. Applying the legacy primitive squash/stretch over those cells
    // warped their torso proportions and pulled planted feet off their authored
    // anchor. Keep state depth/glow/roll/wake, but let the production atlas own
    // its silhouette. Primitive and missing-atlas fallbacks keep the old pose.
    if (!presenterOwnsSilhouette(v, e)) {
      sx *= p.sx; sy *= p.sy; sz *= p.sz;
    }
    if (glow === PAL.glowOff) glow = p.glow;              // a hit flash still wins
  }
  depth += HOSTILE_SURFACE_DEPTH;
  // Once collision is live, the body must remain on the readable side of
  // traversable ladders and route furniture. Presence may still condense from
  // deep in the Meridian while it is non-interactive; active depth breathing
  // is clamped to the combat plane so scenery can never disguise a target or
  // imply a shot should be blocked when the simulation says it is clear.
  if (gameMs >= e.enterUntil) depth = Math.max(depth, HOSTILE_SURFACE_DEPTH - 0.02);
  if (v.presenter.id === 'ecology') v.ecologyDepth = depth;
  sx *= v.presentationScale;
  sy *= v.presentationScale;
  sz *= v.presentationScale;
  // Ecology's bounded unlit card preserves authored ink without any emissive
  // state; its painted cells and physical tactic VFX carry tells and hits.
  // Ordinary sprites retain their existing active-emission path below.
  const signaling = v.presenter.id !== 'ecology' && glow !== PAL.glowOff;
  PRESENTER_FRAME.K = K;
  PRESENTER_FRAME.depth = depth;
  PRESENTER_FRAME.sx = sx;
  PRESENTER_FRAME.sy = sy;
  PRESENTER_FRAME.sz = sz;
  PRESENTER_FRAME.glow = glow;
  PRESENTER_FRAME.signaling = signaling;
  v.presenter.syncMaterial(PRESENTER_API, v, PRESENTER_FRAME);
  placeOnTower(v.mesh, e.x, e.y + v.presentationLift, depth);
  v.presenter.syncTransform(PRESENTER_API, v, e, PRESENTER_FRAME);
  syncModularWaspWing(v, e, depth, signaling);
  if (v.beam) {
    const PP = CONFIG.polyp;
    // the barrel points down the authored lane (dir is FACING on a rooted row)
    if (v.barrel) {
      const hinge = relayFacing(e);
      v.barrel.position.x = hinge * PP.barrelTiles * 0.65;
      v.barrel.scale.x = Math.max(0.08, Math.abs(hinge));
    }
    const sweepfanOwner = enemyOwnsSweepfanBeam(e);
    const sweepfan = isSweepfanBeam(e);
    // A Sweepfan without its exact bounded vector fails visually closed. It
    // must never fall through to the old straight Needle beam: that would
    // communicate a damage lane the simulation does not own.
    const live = e.state === 'fire' && e.beamReach > 0 && gameMs >= e.enterUntil &&
      (!sweepfanOwner || sweepfan);
    v.beam.visible = live;
    v.beamCore.visible = live;
    if (live) {
      // The far endpoint remains the exact endpoint marched by the sim. The
      // near endpoint follows the visible painted muzzle, so no beam appears
      // to leak from the actor's centre when the hardware extends to fire.
      // Sweepfan is different: its simulation damages one bounded rotated
      // segment. Render that exact origin/vector/reach, never the legacy
      // horizontal beam or an art-socket-shortened approximation.
      const socketed = !sweepfan && motionSocketWorld(v, e, 'muzzle');
      const startS = sweepfan ? e.x + e.dir * PP.barrelTiles
        : socketed ? MOTION_SOCKET.s : e.x + e.dir * PP.barrelTiles;
      const beamY = sweepfan ? e.y : socketed ? MOTION_SOCKET.y : e.y;
      const endS = sweepfan ? startS + e.tacticBeamX * e.beamReach
        : e.x + e.dir * (PP.barrelTiles + e.beamReach);
      const endY = sweepfan ? beamY + e.tacticBeamY * e.beamReach : beamY;
      const drawReach = Math.max(0.01, Math.hypot(endS - startS, endY - beamY));
      const midS = (startS + endS) / 2;
      const midY = (beamY + endY) / 2;
      placeOnTower(v.beam, midS, midY, sweepfan ? HOSTILE_SURFACE_DEPTH + 0.01 : 0);
      placeOnTower(v.beamCore, midS, midY,
        sweepfan ? HOSTILE_SURFACE_DEPTH + 0.04 : 0.03);
      // The new seam owns a directional tip. Point it down the exact segment
      // for both ordinary left/right lanes and rotated Sweepfan vectors.
      const beamRoll = Math.atan2(endY - beamY, endS - startS);
      v.beam.rotation.z = beamRoll;
      v.beamCore.rotation.z = beamRoll;
      const pulse = 1 + PP.beamPulseAmp *
        Math.sin(gameMs / 1000 * PP.beamPulseFreq * Math.PI * 2);
      v.beam.scale.set(drawReach, sweepfan ? 1 : pulse, sweepfan ? 1 : pulse);
      v.beamCore.scale.set(drawReach, 0.9 + pulse * 0.1, 0.9 + pulse * 0.1);
      v.beamMat.color.setHex(PAL.polyp); // hazard volume, readable through rather than white
      v.beamMat.opacity = 0.16 + 0.06 * pulse;
      v.beamCoreMat.color.setHex(PAL.polypBeam);
      v.beamCoreMat.opacity = 0.66 + 0.10 * pulse;
    }
  }
  if (v.pod) mortarSync(v, e);           // pod arc + marked zone + detonation
  syncEnemyEcologyTactics(v, e);         // exact fixed Crosswind/Aircomb slots
  if (v.wardenCore) wardenSync(v, e);    // local iris/shutters + exact attack volumes
  // the tell lamp reads the same sim state the pose does, one frame, no memory
  if (v.lamp) LAMP_SYNC[e.kind](v, e);
  if (v.presenter.id !== 'ecology') syncActorGlow(v, e, K, sx, sy, signaling);
  syncAttackRead(v, e);
  syncMortarBeacon(v, e);
  syncEvolution(v, e, depth, sx, sy);
  // Last: only the missing-atlas fallback changes complementary opacity.
  // The shipped motion path already selected one main-mesh UV cell above.
  syncPaintedWaspFlap(v, e, depth);
  syncContactShadow(e, e.x, e.y, CONTACT_FOOTPRINT[e.kind]);
}

let hostileViewInstalled = false;
export function initHostileView() {
  if (hostileViewInstalled) return false;
  installView({ hostiles: { spawned, removed, sync } });
  hostileViewInstalled = true;
  return true;
}

// Mount every immutable hostile pose for exactly the representative offscreen
// warm draw. This closes the mid-run upload gap created by geometry swapping:
// ecology rows, gait/action cells and modular wing phases exist at boot but
// are not all attached to a live mesh at once. The returned teardown removes
// every temporary node and material; the shared production geometries remain
// resident and no sim row is created or mutated.
export function mountHostileWarmResources() {
  const root = new THREE.Group();
  root.name = 'Boot-only hostile geometry warm mount';
  const materials = new Map();
  const mounted = new Set();
  const materialFor = (kind, tex) => {
    const key = `${kind}:${tex?.uuid || 'none'}`;
    let mat = materials.get(key);
    if (!mat) {
      mat = tex ? enemyEcologyMaterial(tex, kind)
        : new THREE.MeshBasicMaterial({ color: 0xffffff });
      materials.set(key, mat);
    }
    return mat;
  };
  const add = (geo, kind, tex = null) => {
    if (!geo || mounted.has(geo)) return;
    mounted.add(geo);
    const mesh = new THREE.Mesh(geo, materialFor(kind, tex));
    mesh.frustumCulled = false;
    root.add(mesh);
  };

  for (const row of enemyEcologyWarmGeometries()) {
    const bundle = enemyEcologyBundle(row.geo.userData.variantId, row.kind);
    add(row.geo, row.kind, bundle?.tex || null);
  }
  for (const kind of Object.keys(LOOK)) {
    const actor = actorMotionBundle(kind);
    if (actor) for (const frame of actor.frames) add(frame.geo, kind, actor.tex);
    add(spriteGeo(kind), kind, spriteTexture(kind));
    add(actionSpriteGeo(kind), kind, spriteActionTexture(kind));
    add(flapSpriteGeo(kind), kind, spriteFlapTexture(kind));
    const motion = motionSpriteFrames(kind);
    if (motion) for (const geo of motion) add(geo, kind, motionTextures.get(kind));
  }
  const modular = waspModularBundle();
  if (modular) {
    for (const part of modular.body) add(part.geo, 'wasp', modular.tex);
    for (const part of modular.wings) add(part.geo, 'wasp', modular.tex);
  }
  scene.add(root);
  return Object.freeze({
    geometries: mounted.size,
    dispose() {
      scene.remove(root);
      for (const mat of materials.values()) mat.dispose();
      root.clear();
    },
  });
}

export function hostileEvolutionVisualSnapshot() {
  let paintedFlappers = 0, paintedDownstrokesVisible = 0;
  let anchors = 0, shielded = 0, pincers = 0;
  let bulwarks = 0, vaults = 0, attackRacks = 0, backlashes = 0;
  let paintedParts = 0;
  const paintedByGene = {};
  const genomes = [];
  const motionRows = [];
  const actorMotionRows = [];
  const modularWaspRows = [];
  const motionActive = { wasp: new Set(), hound: new Set() };
  let flapSample = null;
  for (const [e, v] of meshes) {
    if (motionActive[e.kind] && v.motionFrame >= 0)
      motionActive[e.kind].add(v.motionFrame);
    if (v.motionFrame >= 0 && motionRows.length < 16) motionRows.push({
      kind: e.kind,
      id: e.id,
      frame: v.motionFrame,
      poseKey: v.poseKey,
      scale: [Math.abs(v.mesh.scale.x), Math.abs(v.mesh.scale.y), Math.abs(v.mesh.scale.z)]
        .map((value) => Number(value.toFixed(4))),
      presentationScale: v.presentationScale,
      atlasOwnsSilhouette: presenterOwnsSilhouette(v, e),
      presenter: v.presenter.id,
    });
    if (v.waspModular && modularWaspRows.length < 24) modularWaspRows.push({
      id: e.id,
      state: e.state,
      bodyState: v.waspBodyState,
      wingPhase: v.waspWingPhase,
      poseKey: v.poseKey,
      bodyDepth: Number.isFinite(v.waspBodyDepth)
        ? Number(v.waspBodyDepth.toFixed(4)) : null,
      wingDepth: Number.isFinite(v.waspWingDepth)
        ? Number(v.waspWingDepth.toFixed(4)) : null,
      platformOuterDepth: PLATFORM_OUTER_DEPTH,
      fullyOnActionPlane: v.waspWingDepth > PLATFORM_OUTER_DEPTH,
      rootContinuity: true,
      mirroredAsAssembly: !!v.waspWingMesh &&
        Math.sign(v.waspWingMesh.scale.x) === Math.sign(v.mesh.scale.x),
      opacityMatched: !!v.waspWingMat &&
        Math.abs(v.waspWingMat.opacity - v.mat.opacity) < 0.0001,
      idleWingEmissive: v.waspWingMat && e.state === 'cruise'
        ? Number(v.waspWingMat.emissiveIntensity.toFixed(4)) : null,
    });
    if (v.presenter.id === 'actor' && presenterOwnsSilhouette(v, e) &&
        actorMotionRows.length < 24)
      actorMotionRows.push({
        kind: e.kind, id: e.id, state: e.state,
        frame: v.motionFrame, frameName: v.actorMotionFrame.name,
        clip: v.actorMotionClip, marker: v.actorMotionMarker,
        event: v.actorMotionEvent,
        progress: Number(v.actorMotionProgress.toFixed(3)),
        poseKey: v.poseKey,
        bodyMeshes: 1,
        bodyRotation: Number(v.mesh.rotation.z.toFixed(4)),
        bodyScale: [Math.abs(v.mesh.scale.x), Math.abs(v.mesh.scale.y),
          Math.abs(v.mesh.scale.z)].map((value) => Number(value.toFixed(4))),
        bodyOpacity: Number(v.mat.opacity.toFixed(4)),
        bodyEmission: Number((v.mat.emissiveIntensity || 0).toFixed(4)),
        rootedLifecycle: e.kind === 'warden',
        deployment: v.actorMotionClip === 'deployment',
        anchorRole: v.actorMotionBundle.spec.anchorRole,
        visibleAttachments: e.kind === 'warden' ? [
          v.wardenCore, v.wardenShield, v.wardenEmitter, v.wardenRack,
          v.wardenBeam, v.wardenBeamCore, v.wardenMark, v.wardenBlast,
          ...v.wardenSeals.map((seal) => seal.mesh),
        ].reduce((count, mesh) => count + (mesh?.visible ? 1 : 0), 0) : 0,
        uniformStateTransform: false,
      });
    if (v.flapMesh) {
      paintedFlappers++;
      if (v.flapMesh.visible) paintedDownstrokesVisible++;
      if (!flapSample && v.flapMesh.visible) {
        flapSample = {
          id: e.id,
          state: e.state,
          mix: Number(v.flapMix.toFixed(3)),
          baseOpacity: Number(v.mat.opacity.toFixed(3)),
          downstrokeOpacity: Number(v.flapMat.opacity.toFixed(3)),
        };
      }
    }
    if (e.aegis) anchors++;
    if (v.wardRing?.visible) shielded++;
    if (e.pincer) pincers++;
    for (const row of v.paintedGeneRows || []) {
      paintedParts++;
      paintedByGene[row.gene] = (paintedByGene[row.gene] || 0) + 1;
    }
    if (v.bulwarkPlates || v.paintedGenes?.has('BULWARK')) bulwarks++;
    if (v.vaultCoils || v.paintedGenes?.has('VAULT')) vaults++;
    if (v.attackRails || v.paintedGenes?.has('TWINSTRIKE') ||
        v.paintedGenes?.has('SALVO') || v.paintedGenes?.has('RELAY')) attackRacks++;
    if (v.backlashArcs || v.paintedGenes?.has('BACKLASH')) backlashes++;
    if (e.genome?.mutated && genomes.length < 12) genomes.push({
      id: e.id,
      label: e.genome.label,
      strain: e.genome.strain?.id || '',
      expressedBudget: e.genome.expressedBudget,
      wardPolicy: e.wardPolicy,
      salvoPattern: e.salvoPattern,
      genes: [...e.genome.genes],
      painted: (v.paintedGeneRows || []).map((row) => ({
        gene: row.gene,
        visible: row.mesh.visible,
        worldSize: Number((row.worldSize || 0).toFixed(3)),
      })),
      state: e.state,
      bulwarkOpen: gameMs < e.bulwarkOpenUntil,
      backlashArmed: !!e.backlashUntil,
    });
  }
  return {
    paintedFlappers, paintedDownstrokesVisible,
    anchors, shielded, pincers,
    bulwarks, vaults, attackRacks, backlashes,
    paintedParts, paintedByGene,
    atlas: genomePartSnapshot(),
    poseNormalization: poseNormalizationSnapshot(),
    locomotion: Object.fromEntries(Object.entries(SPRITE_MOTION_ART).map(([kind, art]) => [kind, {
      ready: motionTextures.has(kind),
      frameCount: art.frames.length,
      activeFrames: [...motionActive[kind]].sort((a, b) => a - b),
      oneBodyMesh: true,
      crossfade: false,
    }])),
    actorMotion: {
      ...actorMotionRuntimeSnapshot(),
      liveBodies: actorMotionRows.length,
      bodyDraws: actorMotionRows.length,
      fixedFrameGeometries: actorMotionRuntimeSnapshot().geometries,
      rows: actorMotionRows,
    },
    waspModular: {
      ...waspModularRuntimeSnapshot(),
      liveBodies: modularWaspRows.length,
      liveDraws: modularWaspRows.length * 2,
      rootAnchor: 'reactor-center',
      independentBodyAndWingSelection: true,
      opacityStrobe: false,
      idleWingBloom: false,
      platformOuterDepth: PLATFORM_OUTER_DEPTH,
      activeMinimumWingDepth: HOSTILE_SURFACE_DEPTH - CONFIG.wasp.wobbleAmp -
        WASP_WING_DEPTH_BIAS,
      rows: modularWaspRows,
    },
    genomes, flapSample, motionRows,
  };
}

if (typeof window !== 'undefined')
  window.__HB_HOSTILE_EVOLUTION_VISUAL = hostileEvolutionVisualSnapshot;

// Dead hostiles are display-only: no sim, no gate participation (removeHostile
// already fired onHostileRemoved), just a short role-shaped rupture.
const corpses = [];

function releaseCorpse(c) {
  scene.remove(c.mesh);
  if (c.ecologyActionMat) {
    c.ecologyActionMat.dispose();
    ecologyActionMaterialsRetired++;
    ecologyBodyMaterialsRetired++;
  }
  c.mat.dispose();
  releaseDeathRig(c.rig);
  for (const system of c.systems) {
    scene.remove(system.mesh);
    system.mat.dispose();
  }
}

function syncDeathSystems(c, r) {
  const ease = 1 - (1 - r) ** 3;
  const fade = Math.max(0, 1 - r ** 1.4);
  for (const system of c.systems) {
    if (system.type === 'wasp-wing-bank') {
      // One bounded hinge failure: the bank shears upward, loses lift, then
      // drops. Rotation is total tilt (< 0.7 rad), never angular velocity.
      system.mesh.visible = fade > 0.01;
      placeOnTower(system.mesh,
        c.s - c.breakDir * 0.24 * ease,
        c.y + 0.34 * Math.sin(Math.PI * r) - 1.08 * r * r,
        system.depth - 0.34 * r);
      system.mesh.rotation.z = system.rotation - c.breakDir * 0.64 * ease;
      const fold = Math.max(0.30, 1 - 0.36 * ease);
      system.mesh.scale.set(system.sx * system.face * fold,
        system.sy * (1 - 0.18 * ease), system.sz * fold);
      system.mat.emissive.setHex(r < 0.12 ? c.flash : PAL.glowOff);
      system.mat.emissiveIntensity = postGain() * (r < 0.12 ? 0.72 : 0);
    } else if (system.type.startsWith('aegis')) {
      // The projector answer is an inward mechanical failure. The iris core
      // kicks once while the crown contracts; neither grows past its live
      // footprint and both are gone before the body finishes collapsing.
      const core = system.type === 'aegis-core';
      const kick = core ? Math.sin(Math.PI * r) * 0.28 : 0;
      placeOnTower(system.mesh,
        c.s + c.breakDir * (core ? 0.13 : 0.04) * ease,
        c.y + system.yOffset + kick - (core ? 0.34 : 0.54) * r * r,
        HOSTILE_SURFACE_DEPTH + 0.22 - 0.40 * r);
      system.mesh.rotation.z = system.rotation + c.breakDir *
        (core ? 0.42 : 0.68) * ease;
      const contract = Math.max(0.08, 1 - (core ? 0.78 : 0.88) * ease);
      system.mesh.scale.set(system.sx * contract, system.sy * contract,
        system.sz * contract);
    } else { // Painted horseshoe or fallback shoes clamp shut against the corpse.
      const painted = system.type === 'backlash-painted';
      const side = painted ? 0 : system.index - 1;
      placeOnTower(system.mesh,
        c.s + side * 0.05 * c.face * ease,
        c.y - 0.18 * r * r,
        HOSTILE_SURFACE_DEPTH + 0.19 - 0.24 * r);
      system.mesh.rotation.z = system.rotation + (painted
        ? c.breakDir * 0.14 : -side * 0.22) * ease;
      const clamp = Math.max(painted ? 0.10 : 0.16,
        1 - (painted ? 0.88 : 0.78) * ease);
      system.mesh.scale.set(system.sx * clamp, system.sy * clamp,
        system.sz * clamp);
    }
    system.mat.opacity = system.opacity * fade;
  }
}

function wardenPartProgress(stage, r) {
  let start = 0.02, span = 0.36;
  if (stage === 'crown') { start = 0.10; span = 0.48; }
  else if (stage === 'mount') { start = 0.04; span = 0.62; }
  else if (stage === 'core') { start = 0.44; span = 0.38; }
  const u = (r - start) / span;
  return u <= 0 ? 0 : u >= 1 ? 1 : u;
}

export function updateCorpses() {
  for (let i = corpses.length - 1; i >= 0; i--) {
    const c = corpses[i];
    const elapsed = gameMs - c.t0;
    const u = elapsed / c.spec.ms;
    if (u >= 1) { releaseCorpse(c); corpses.splice(i, 1); continue; }
    if (!routeRenderable(c.s)) {
      c.mesh.visible = false;
      if (c.rig) for (const part of c.rig.pieces) part.mesh.visible = false;
      for (const system of c.systems) system.mesh.visible = false;
      continue;
    }

    if (elapsed < c.spec.punchMs) {
      const q = elapsed / c.spec.punchMs;
      const punch = Math.sin(q * Math.PI);
      const rootedTerminal = !!c.frozenMotion?.rootedTerminal;
      c.mesh.visible = true;
      placeOnTower(c.mesh,
        rootedTerminal ? c.s : c.s - c.breakDir * 0.08 * punch,
        c.y, HOSTILE_SURFACE_DEPTH - (rootedTerminal ? 0 : 0.12 * punch));
      c.mesh.rotation.z = rootedTerminal ? 0 : c.baseRoll + c.breakDir * 0.08 * q;
      const swell = c.ecologyDeath || rootedTerminal ? 1 : 1 + punch * 0.16;
      c.mesh.scale.set(c.baseScaleX * c.face * swell,
        c.baseScaleY * swell, c.baseScaleZ * swell);
      c.mat.opacity = 1;
      if (c.mat.emissive) {
        c.mat.emissive.setHex(c.ecologyDeath ? PAL.glowOff : c.flash);
        c.mat.emissiveIntensity = c.ecologyDeath ? 0 : postGain();
      }
      if (c.ecologyActionMat) {
        c.ecologyActionMesh.visible = true;
        c.ecologyActionMat.opacity = 1;
      }
      if (c.rig) {
        c.rig.mat.opacity = 0;
        for (const part of c.rig.pieces) part.mesh.visible = false;
      }
      syncDeathSystems(c, 0);
      continue;
    }

    const r = Math.min(1,
      (elapsed - c.spec.punchMs) / (c.spec.ms - c.spec.punchMs));
    const snap = 1 - (1 - r) ** 3;
    const isWarden = c.kind === 'warden';
    const rootedTerminal = !!c.frozenMotion?.rootedTerminal;
    // The Crown is bolted into an apron: keep its centre planted while its
    // actual painted assemblies do the moving. Lesser roles retain their
    // compact whole-body carry/skid before their pieces resolve.
    const bodyS = rootedTerminal ? c.s
      : c.s + c.breakDir * c.spec.drift * (isWarden ? r * r : r);
    const bodyY = rootedTerminal ? c.y : c.y - c.spec.fall * r * r;
    const bodyDepth = HOSTILE_SURFACE_DEPTH +
      (rootedTerminal ? c.spec.depth * Math.max(0, (r - 0.72) / 0.28) : c.spec.depth * r);
    const bodyRoll = rootedTerminal ? 0
      : c.baseRoll + c.breakDir * c.spec.tilt * snap;
    const bodyScaleX = c.ecologyDeath || rootedTerminal ? 1
      : 1 + (c.spec.sx - 1) * snap;
    const bodyScaleY = c.ecologyDeath || rootedTerminal ? 1
      : 1 + (c.spec.sy - 1) * snap;
    const bodyScaleZ = c.ecologyDeath || rootedTerminal ? 1 : 1 - 0.28 * snap;
    // Warden holds readable metal through both hardpoint ejections and only
    // dissolves once the delayed core implosion is underway.
    const fade = isWarden
      ? (r < 0.72 ? 1 : Math.max(0, (1 - r) / 0.28) ** 1.25)
      : Math.max(0, 1 - r ** 1.45);

    if (c.rig) {
      // At r===0 these masked planes reconstruct the exact live painting,
      // so changing from the intact hit-punch to separated construction has
      // no sprite pop. Each definition then resolves in its role vocabulary.
      c.mesh.visible = false;
      c.rig.mat.opacity = fade;
      c.rig.mat.emissive.setHex(r < 0.12 ? c.flash : PAL.glowOff);
      c.rig.mat.emissiveIntensity = postGain() * (r < 0.12 ? 0.86 : 0.16);
      for (const part of c.rig.pieces) {
        const p = part.def;
        const partR = isWarden ? wardenPartProgress(p.stage, r) : r;
        const partSnap = isWarden ? 1 - (1 - partR) ** 3 : snap;
        part.mesh.visible = fade > 0.01;
        const localScale = Math.max(0.08, 1 - p.shrink * partSnap);
        placeOnTower(part.mesh,
          bodyS + p.x * c.face * partSnap,
          bodyY + p.lift * Math.sin(Math.PI * partR) - p.drop * partR * partR,
          bodyDepth + p.depth * partSnap);
        part.mesh.rotation.z = bodyRoll + p.tilt * c.face * partSnap;
        part.mesh.scale.set(c.baseScaleX * c.face * bodyScaleX * localScale,
          c.baseScaleY * bodyScaleY * localScale,
          c.baseScaleZ * bodyScaleZ * localScale);
      }
    } else {
      // Primitive/failsafe path: the same species motion remains, only the
      // painted segmentation is unavailable. It still buckles rather than
      c.mesh.visible = true;
      if (c.ecologyActionMesh) c.ecologyActionMesh.visible = true;
      placeOnTower(c.mesh, bodyS, bodyY, bodyDepth);
      c.mesh.rotation.z = bodyRoll;
      c.mesh.scale.set(c.baseScaleX * c.face * bodyScaleX,
        c.baseScaleY * bodyScaleY, c.baseScaleZ * bodyScaleZ);
      c.mat.opacity = fade;
      if (c.mat.emissive) {
        c.mat.emissive.setHex(c.ecologyDeath ? PAL.glowOff
          : r < 0.12 ? c.flash : PAL.glowOff);
        if (c.ecologyDeath) c.mat.emissiveIntensity = 0;
      }
    }
    if (c.ecologyActionMat) {
      c.ecologyActionMat.opacity = fade;
    }
    syncDeathSystems(c, r);
  }
}

// run reset (resetGame in src/main.js): drop any dissolving corpses
export function clearCorpses() {
  for (const c of corpses) releaseCorpse(c);
  corpses.length = 0;
}

// Read-only proof surface: enough to assert role, phase, bounded lifetime,
// pooled painted pieces and attached-system shutdown without exporting a
// renderer object into simulation code.
export function hostileDeathVisualSnapshot() {
  let activeRigs = 0;
  for (const pool of deathRigPools.values())
    for (const rig of pool) if (rig.inUse) activeRigs++;
  return {
    active: corpses.length,
    pool: { rigs: deathRigCount, activeRigs, maxRigs: MAX_DEATH_RIGS,
      commonRigs: commonDeathRigCount, wardenRigs: wardenDeathRigCount,
      planes: deathPlaneCount, maxPlanes: MAX_DEATH_PLANES,
      maxCorpses: MAX_ACTIVE_CORPSES },
    rows: corpses.map((c) => {
      const frozen = c.frozenMotion;
      const facingPreserved = !frozen ||
        (Math.sign(c.mesh.scale.x) || frozen.face) === frozen.face;
      const posePreserved = !frozen || (
        c.mesh.geometry === frozen.geometry &&
        c.mat.map === frozen.map &&
        c.mat.emissiveMap === frozen.emissiveMap &&
        facingPreserved
      );
      return {
        kind: c.kind,
        ageMs: Math.max(0, Math.round(gameMs - c.t0)),
        lifetimeMs: c.spec.ms,
        phase: gameMs - c.t0 < c.spec.punchMs ? 'impact'
          : c.kind !== 'warden' ? 'rupture'
          : gameMs - c.t0 < 650 ? 'hardpoint-eject'
          : gameMs - c.t0 < 1010 ? 'core-implosion' : 'signal-collapse',
        paintedPieces: c.rig ? c.rig.pieces.length : 0,
        pieceTags: c.rig ? c.rig.pieces.map((part) => part.def.tag) : [],
        systems: c.systems.map((system) => system.type),
        ruptureMode: c.ecologyDeath ? 'ecology-b7-a7'
          : c.kind === 'warden' && c.rig ? 'rooted-terminal-pieces'
          : frozen ? 'frozen-motion' : c.rig ? 'painted-pieces' : 'intact-fallback',
        poseKey: frozen?.poseKey || '',
        motionFrame: frozen?.frame ?? -1,
        facingPreserved,
        posePreserved,
        deathCrack: c.kind === 'wasp' && frozen?.frame === WASP_BODY.DEATH_CRACK,
        wingBankDetached: c.systems.some((system) => system.type === 'wasp-wing-bank'),
        ecologyId: c.ecologyDeath?.id || '',
        ecologyBodyRow: c.ecologyDeath?.bodyRow ?? -1,
        ecologyActionRow: c.ecologyDeath?.actionRow ?? -1,
        ecologyCode: c.ecologyDeath?.code ?? -1,
        legacyDeathRig: !!c.ecologyDeath && !!c.rig,
        ecologyLayersAttached: !!c.ecologyDeath &&
          c.ecologyActionMesh?.parent === c.mesh,
        ecologyOpacityMatched: !!c.ecologyDeath &&
          Math.abs(c.mat.opacity - c.ecologyActionMat.opacity) < 0.0001,
        ecologyScaleFixed: !!c.ecologyDeath,
        shrink: c.ecologyDeath ? false : undefined,
        spiral: false,
        boundedBodyTiltRad: c.spec.tilt,
        boundedWingTiltRad: c.kind === 'wasp' ? 0.64 : 0,
      };
    }),
  };
}

if (typeof window !== 'undefined')
  window.__HB_HOSTILE_DEATH_VISUAL = hostileDeathVisualSnapshot;

// Reused only by the on-demand QA snapshot; never touches the render loop.
const ENEMY_ECOLOGY_SCREEN_PROBE = new THREE.Vector3();

export function enemyEcologyVisualSnapshot() {
  const rows = [];
  let ordinaryBodies = 0;
  let visualOnlyBodies = 0;
  const textures = new Set();
  for (const [e, v] of meshes) {
    if (!v.ecology) { ordinaryBodies++; continue; }
    const visualOnly = !e.ecologyId && !!e.ecologyVisualId;
    if (visualOnly) visualOnlyBodies++;
    textures.add(v.mat.map);
    const settled = gameMs >= e.enterUntil;
    const condensationStarted = enemyEcologyCondensationStarted(
      e, gameMs, CONFIG.wasp.enterMs);
    const tacticVisual = enemyEcologyTacticVisualSnapshot(v, e);
    const targetRootY = v.ecology.targetRootY;
    v.mesh.getWorldPosition(ENEMY_ECOLOGY_SCREEN_PROBE);
    ENEMY_ECOLOGY_SCREEN_PROBE.project(camera);
    const canvasRect = renderer.domElement.getBoundingClientRect();
    const screenX = (ENEMY_ECOLOGY_SCREEN_PROBE.x * 0.5 + 0.5) * canvasRect.width;
    const screenY = (0.5 - ENEMY_ECOLOGY_SCREEN_PROBE.y * 0.5) * canvasRect.height;
    const rootError = settled
      ? v.presentationLift + targetRootY * Math.abs(v.mesh.scale.y) - targetRootY
      : null;
    rows.push({
      id: e.id,
      ecologyId: v.ecology.spec.id,
      gameplayEcologyId: e.ecologyId || '',
      ecologyVisualId: e.ecologyVisualId || '',
      visualOnly,
      kind: e.kind,
      state: e.state,
      tacticState: e.tacticState,
      tacticPhase: e.tacticPhase,
      tacticProgress: Number((e.tacticProgress || 0).toFixed(3)),
      bodyRow: v.ecologyBodyRow,
      actionRow: v.ecologyActionRow,
      code: v.ecologyCode,
      poseKey: v.poseKey,
      presentationScale: v.presentationScale,
      screen: {
        x: Number(screenX.toFixed(1)), y: Number(screenY.toFixed(1)),
        ndcZ: Number(ENEMY_ECOLOGY_SCREEN_PROBE.z.toFixed(4)),
        inFrame: Math.abs(ENEMY_ECOLOGY_SCREEN_PROBE.x) <= 1 &&
          Math.abs(ENEMY_ECOLOGY_SCREEN_PROBE.y) <= 1 &&
          ENEMY_ECOLOGY_SCREEN_PROBE.z >= -1 && ENEMY_ECOLOGY_SCREEN_PROBE.z <= 1,
      },
      quads: 2,
      actionAttached: v.ecologyActionMesh.parent === v.mesh,
      actionOpacityMatched:
        Math.abs(v.ecologyActionMat.opacity - v.mat.opacity) < 0.0001,
      oneTexture: v.ecologyActionMat.map === v.mat.map,
      noEmissiveMaps: !v.mat.emissiveMap && !v.ecologyActionMat.emissiveMap,
      noIdleEmission: !v.mat.emissiveMap && !v.ecologyActionMat.emissiveMap &&
        !v.mat.emissive && !v.ecologyActionMat.emissive,
      fullCellUv: !!v.mesh.geometry.userData.fullCellUv &&
        !!v.ecologyActionMesh.geometry.userData.fullCellUv,
      sharedMirror: v.ecologyActionMesh.scale.x === 1 &&
        v.ecologyActionMesh.scale.y === 1,
      rooted: v.ecology.spec.grounded,
      condensationStarted,
      bodyVisible: v.mesh.visible,
      actionVisible: v.ecologyActionMesh.visible,
      preCondensationHidden: condensationStarted ||
        (!v.mesh.visible && !v.ecologyActionMesh.visible &&
          tacticVisual.visible === 0 && !v.beam?.visible),
      settled,
      rootError: rootError === null ? null : Number(rootError.toFixed(6)),
      bodyDepth: Number((v.ecologyDepth || 0).toFixed(4)),
      actionDepth: Number(((v.ecologyDepth || 0) +
        v.ecologyActionMesh.position.z * Math.abs(v.mesh.scale.z)).toFixed(4)),
      fullyOnActionPlane: (v.ecologyDepth || 0) > PLATFORM_OUTER_DEPTH,
      noLegacyBodyLayers: !v.actorMotionBundle && !v.waspModular &&
        !v.flapMesh && !v.lamp && !v.actorGlow,
      mechanicReadOwnership: { ...v.mechanicReadOwnership },
      optionalMechanicMeshes: v.evolutionMeshes?.length || 0,
      actionPresentation: {
        beamVisible: !!v.beam?.visible,
        beamLanguage: v.beam?.geometry.userData.actionLanguage || '',
        beamCoreLanguage: v.beamCore?.geometry.userData.actionLanguage || '',
        beamReach: v.beam?.visible ? Number(v.beam.scale.x.toFixed(4)) : 0,
        podVisible: !!v.pod?.visible,
        podLanguage: v.pod?.geometry.userData.actionLanguage || '',
        podCoreLanguage: v.podCore?.geometry.userData.actionLanguage || '',
        podEmission: v.podMat?.emissiveIntensity || 0,
        markVisible: !!v.mark?.visible,
        markLanguage: v.mark?.geometry.userData.actionLanguage || '',
        blastVisible: !!v.blast?.visible,
        blastLanguage: v.blast?.geometry.userData.actionLanguage || '',
        blastCoreLanguage: v.blastCore?.geometry.userData.actionLanguage || '',
      },
      tacticVisual,
      sweepfanNoStraightFallback: !enemyOwnsSweepfanBeam(e) ||
        !v.beam?.visible || isSweepfanBeam(e),
      sweepfanExact: !isSweepfanBeam(e) || (!!v.beam?.visible &&
        Math.abs(v.beam.rotation.z - Math.atan2(e.tacticBeamY, e.tacticBeamX)) < 0.0001 &&
        Math.abs(v.beam.scale.x - e.beamReach) < 0.0001),
    });
  }
  const deaths = corpses.filter((c) => c.ecologyDeath).map((c) => ({
    ecologyId: c.ecologyDeath.id,
    bodyRow: c.ecologyDeath.bodyRow,
    actionRow: c.ecologyDeath.actionRow,
    code: c.ecologyDeath.code,
    legacyRig: !!c.rig,
    layersAttached: c.ecologyActionMesh?.parent === c.mesh,
    opacityMatched: Math.abs(c.ecologyActionMat.opacity - c.mat.opacity) < 0.0001,
    scaleFixed: true,
    spiral: false,
    shrink: false,
  }));
  return {
    ...enemyEcologyRuntimeSnapshot(),
    activation: 'ecologyId mechanics; ecologyVisualId presentation only',
    ordinaryBodies,
    visualOnlyBodies,
    liveBodies: rows.length,
    liveActorDraws: rows.length * 2,
    extraDraws: rows.length,
    liveTextures: textures.size,
    ordinaryPathFallbacks: 0,
    tacticRuntime: enemyEcologyTacticRuntimeSnapshot(),
    materials: {
      pairsSpawned: ecologyPairsSpawned,
      bodyRetired: ecologyBodyMaterialsRetired,
      actionRetired: ecologyActionMaterialsRetired,
      balancedRetirement: ecologyBodyMaterialsRetired === ecologyActionMaterialsRetired,
      paintedInkFloor: Object.freeze({
        mode: 'bounded-unlit-atlas-value',
        material: 'MeshBasicMaterial',
        colorGainByKind: { ...ENEMY_ECOLOGY_PAINT_GAIN },
        emissiveMap: false,
        idleEmissiveIntensity: 0,
      }),
    },
    deaths,
    rows,
  };
}

if (typeof window !== 'undefined')
  window.__HB_ENEMY_ECOLOGY_VISUAL = enemyEcologyVisualSnapshot;

/* ==================== SPORE MORTAR (T-014) ========================= *
 * Everything this kind needs beyond the shared presence pass, kept in one
 * block at the end of the file. Three props, all derived from sim fields
 * and the SAME pure functions the sim uses (src/pure/mortar.js), so the
 * arc that is drawn is the arc that was flown and the slab that is drawn
 * is the slab that damages:
 *
 *   pod   — the seed pod in flight, replayed from the sim's podU through
 *           the pure arc, then physically planted through the whole fuse.
 *   mark  — the pad on the marked landing surface, lit from launch and
 *           gathering continuously as the planted fuse runs down.
 *   blast — the denial volume itself, visible only for the frames in which
 *           the sim is dealing damage.
 *
 * The tube's own theater is the pose function above the LOOK table: it
 * kicks back on launch, settles across the flight, and pops on detonation.
 * Static-anatomy rule (entry 3)
 * is untouched — a mortar is something the SHIP builds, and none of this
 * moves the creature's own geometry.                                    */

const M_CFG = CONFIG.mortar;
const mortarLegGeo = new THREE.BoxGeometry(...M_CFG.legSize);

const mortarPodGeo = mortarPodShellGeometry(M_CFG.podRadius);
const mortarPodCoreGeo = mortarPodCoreGeometry(M_CFG.podRadius);
const mortarMarkGeo = mortarMarkGeometry(M_CFG.blastHalf, M_CFG.markThickness);
const mortarBlastGeo = mortarBurstShellGeometry(M_CFG.blastHalf, M_CFG.blastHeight);
const mortarBlastCoreGeo = mortarBurstCoreGeometry(M_CFG.blastHalf, M_CFG.blastHeight);

// reused pose object, same no-allocation rule as the hound and polyp poses
const MORTAR_POSE = { depth: 0, sx: 1, sy: 1, sz: 1, glow: PAL.glowOff };

function mortarPose(e) {
  const p = MORTAR_POSE;
  p.depth = 0; p.sx = 1; p.sy = 1; p.sz = 1; p.glow = PAL.glowOff;
  if (e.state === 'lob') {
    // the kick: the tube compresses on launch and recovers across the flight
    const settle = 1 - Math.max(0, Math.min(1, e.podU));
    p.sy = 1 - 0.18 * settle;
  } else if (e.state === 'burst') {
    p.sy = 1 + M_CFG.burstSwell;
    p.glow = PAL.mortarBlast;
  }
  return p;
}

// the tube leans down its authored line of fire; nothing else rotates
function mortarRoll(e) {
  return e.dir * 0.42;
}

function mortarAttach(v, mesh) {
  // three legs sharing the body material, so materialize/dissolve fades the
  // whole tripod as one silhouette. The sprite has its stance drawn in, so
  // it skips them — the pod, the mark and the blast slab below are DAMAGE
  // props and are built for both bodies, unchanged.
  if (!v.sprite) {
    for (const [lx, lz] of [[-0.34, 0.22], [0.34, 0.22], [0, -0.34]]) {
      const leg = new THREE.Mesh(mortarLegGeo, v.mat);
      leg.position.set(lx, -M_CFG.bodyY / 2, lz);
      mesh.add(leg);
    }
  }
  const podMat = new THREE.MeshStandardMaterial({
    // Near-black chassis + acid inset: the bomb keeps a silhouette against
    // both the painted Meridian and the bright deck. Green across the entire
    // shape collapsed the fins and shell into the same small diamond.
    color: PAL.capsuleInk, emissive: PAL.mortar, emissiveIntensity: 0,
    roughness: 0.52, metalness: 0.34, flatShading: true,
    transparent: true, opacity: 0.98, depthWrite: true,
    side: THREE.DoubleSide,
  });
  const pod = new THREE.Mesh(mortarPodGeo, podMat);
  const podCoreMat = new THREE.MeshBasicMaterial({
    color: PAL.mortarPod, transparent: true, opacity: 0.58,
    depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
  });
  const podCore = new THREE.Mesh(mortarPodCoreGeo, podCoreMat);
  podCore.position.z = 0.025;
  pod.add(podCore);
  pod.visible = false;
  scene.add(pod);
  const markMat = new THREE.MeshBasicMaterial({
    color: PAL.mortarMark, transparent: true, opacity: 0.8,
    depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
  });
  const mark = new THREE.Mesh(mortarMarkGeo, markMat);
  mark.visible = false;
  scene.add(mark);
  const blastMat = new THREE.MeshBasicMaterial({
    color: PAL.capsuleInk, transparent: true, opacity: 0.86,
    depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
  });
  const blast = new THREE.Mesh(mortarBlastGeo, blastMat);
  const blastCoreMat = new THREE.MeshBasicMaterial({
    color: PAL.mortarMark, transparent: true, opacity: 0.88,
    depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
  });
  const blastCore = new THREE.Mesh(mortarBlastCoreGeo, blastCoreMat);
  blastCore.position.z = 0.025;
  blast.add(blastCore);
  blast.visible = false;
  scene.add(blast);
  v.pod = pod; v.podMat = podMat;
  v.podCore = podCore; v.podCoreMat = podCoreMat;
  v.mark = mark; v.markMat = markMat;
  v.blast = blast; v.blastMat = blastMat;
  v.blastCore = blastCore; v.blastCoreMat = blastCoreMat;
}

function mortarDetach(v) {
  for (const [mesh, mat] of [
    [v.pod, v.podMat], [v.mark, v.markMat], [v.blast, v.blastMat],
  ]) {
    scene.remove(mesh);
    mat.dispose();
  }
  v.podCoreMat.dispose();
  v.blastCoreMat.dispose();
}

function mortarHide(v) {
  v.pod.visible = false;
  if (v.podMat.emissive) v.podMat.emissiveIntensity = 0;
  v.mark.visible = false;
  v.blast.visible = false;
}

function mortarSync(v, e) {
  if (gameMs < e.enterUntil) { mortarHide(v); return; }   // no props while condensing in
  const flying = e.state === 'lob';
  const planted = e.state === 'fuse';
  const marked = flying || e.state === 'fuse' || e.state === 'burst';
  v.pod.visible = flying || planted;
  if (!flying && !planted) v.podMat.emissiveIntensity = 0;
  if (flying) {
    // Dark acid shell, with a brief launch-hot core that cools along the arc.
    // Emission exists only while the sim owns a flying pod and stays bounded
    // below the value that previously blew its square face to white.
    const launch = 1 - Math.max(0, Math.min(1, e.podU / 0.22));
    v.podMat.color.set(PAL.capsuleInk);
    v.podMat.emissive.setHex(PAL.mortar);
    v.podMat.emissiveIntensity = 0.04 + launch * 0.12;
    // The planted zone and timing stay sim-owned; only the visual arc's first
    // point follows the launch frame's painted bore instead of the old row
    // centre. The same pure parabola and podU still own every later point.
    const socketed = motionSocketWorld(v, e, 'muzzle');
    const muzzleS = socketed ? MOTION_SOCKET.s : e.x;
    const muzzleY = socketed ? MOTION_SOCKET.y : e.y;
    placeOnTower(v.pod,
      mortarArcX(muzzleS, e.zoneX, e.podU),
      mortarArcY(muzzleY, e.zoneY, M_CFG.arcTiles, e.podU), 0);
    // Analytic tangent of the exact pure parabola. The pointed seed therefore
    // communicates its real committed direction instead of tumbling like a
    // pickup; no endpoint, arc height, or flight timing is approximated.
    const tangentX = e.zoneX - muzzleS;
    const tangentY = e.zoneY - muzzleY +
      4 * M_CFG.arcTiles * (1 - 2 * e.podU);
    v.pod.rotation.z = Math.atan2(tangentY, tangentX);
    v.pod.scale.set(2.85, 2.85, 2.85);
    v.podCoreMat.opacity = 0.70 + launch * 0.20;
  } else if (planted) {
    // The bomb remains physically present throughout the fuse. Previously it
    // vanished on touchdown, leaving only a flat cream card at detonation and
    // making the actual projectile look like an unloaded asset. The planted
    // shell pulses its inset core while the dark chassis stays still.
    const remain = Math.max(0, e.stateUntil - gameMs);
    const armed = 1 - Math.max(0, Math.min(1, remain / M_CFG.fuseMs));
    const pulse = 0.5 + 0.5 * Math.sin(gameMs * (0.018 + armed * 0.022));
    placeOnTower(v.pod, e.zoneX,
      e.zoneY + M_CFG.podRadius * 0.72, M_CFG.warnDepth + 0.12);
    v.pod.rotation.z = -Math.PI / 2;
    v.pod.scale.set(3.02 + pulse * 0.12, 3.02 + pulse * 0.12, 3.02);
    v.podMat.color.set(PAL.capsuleInk);
    v.podMat.emissive.setHex(PAL.mortar);
    v.podMat.emissiveIntensity = 0.02 + armed * 0.04;
    v.podCoreMat.opacity = 0.58 + armed * 0.26 + pulse * 0.10;
  }
  v.mark.visible = marked;
  // Before detonation only the authored landing patch is marked. Drawing the
  // whole eventual slab during the warning made the answer trivial and made
  // safe actors disappear behind a volume that was not dangerous yet.
  v.blast.visible = e.state === 'burst';
  if (!marked) return;
  placeOnTower(v.mark, e.zoneX, e.zoneY + M_CFG.markThickness / 2, 0);
  placeOnTower(v.blast, e.zoneX, e.zoneY + M_CFG.blastHeight / 2, M_CFG.warnDepth);
  if (e.state === 'burst') {
    // the detonation: the denial volume goes hot and bright for exactly the
    // frames the sim is dealing damage — live and warning can never be
    // confused — while staying behind the play plane, so a body caught in it
    // keeps its silhouette (pillar 5: chaos stays readable)
    const u = Math.max(0, Math.min(1, (e.stateUntil - gameMs) / M_CFG.burstMs));
    // Keep the shell under the bloom threshold. Narrow amber cores carry the
    // hot impact value; boosting the complete teeth recreated the cream
    // placeholder card this geometry was built to retire.
    v.blastMat.color.set(PAL.capsuleInk);
    v.blastMat.opacity = 0.76 + 0.16 * u;
    v.blastCoreMat.opacity = 0.68 + 0.24 * u;
    v.markMat.opacity = 0.95;
    // Quantized-looking column punch: wide growth is tiny, vertical collapse
    // carries the 220 ms impact while every point remains inside the sim slab.
    v.blast.scale.set(1 + (1 - u) * 0.05, 0.84 + u * 0.16, 1);
    return;
  }
  v.blast.scale.set(1, 1, 1);
  if (flying) { v.markMat.opacity = 0.48 + e.podU * 0.12; return; }
  // Fuse gathers continuously at the landing patch; no whole-body or binary
  // flashing. The burst itself remains the unmistakable committed moment.
  const remain = Math.max(0, e.stateUntil - gameMs);
  const armed = 1 - Math.max(0, Math.min(1, remain / M_CFG.fuseMs));
  v.markMat.opacity = 0.56 + armed * 0.38;
}

/* ===================== CROWN WARDEN ============================== *
 * One production cutout, one small target: the iris. The props below do not
 * recolour or blink the six-tile body. They light the part actually arming,
 * draw only a short commitment ray before the sweep is live, and reuse the
 * mortar's marked-patch language for the rack. Four persistent seal pips
 * disappear as armour is broken, so damage changes the machine permanently.
 */
const WARDEN_CFG = CONFIG.warden;
// The Crown's attack language is mounted machinery, never UI drawn over the
// actor.  Each iris below is a handful of disconnected trapezoidal shoes: the
// open gaps preserve the painted shutter underneath and keep even a bright hit
// from resolving into a perfect debug ring at the pulled-back camera.
function wardenIrisGeometry(inner, outer, shoes, shoeShare, phase = 0) {
  const positions = [];
  for (let i = 0; i < shoes; i++) {
    const centre = phase + i * Math.PI * 2 / shoes;
    const half = Math.PI / shoes * shoeShare;
    const a0 = centre - half, a1 = centre + half;
    const bevel = half * 0.16;
    const corners = [
      [Math.cos(a0 + bevel) * inner, Math.sin(a0 + bevel) * inner],
      [Math.cos(a0) * outer, Math.sin(a0) * outer],
      [Math.cos(a1) * outer, Math.sin(a1) * outer],
      [Math.cos(a1 - bevel) * inner, Math.sin(a1 - bevel) * inner],
    ];
    positions.push(
      ...corners[0], 0, ...corners[1], 0, ...corners[2], 0,
      ...corners[0], 0, ...corners[2], 0, ...corners[3], 0,
    );
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

// One fixed draw per beam layer.  The interruption gaps and alternating
// shoulders are baked into geometry, so there is no runtime canvas, cloned
// texture or stretched glowing rectangle when the sweep reaches full length.
function wardenBeamTrainGeometry(core = false) {
  const positions = [];
  const count = core ? 9 : 7;
  for (let i = 0; i < count; i++) {
    const cell = 1 / count;
    const x0 = -0.5 + i * cell + cell * (core ? 0.13 : 0.09);
    const x1 = -0.5 + (i + 1) * cell - cell * (core ? 0.16 : 0.12);
    const taper = i === 0 || i === count - 1 ? 0.66 : 1;
    const half = (core ? 0.045 : WARDEN_CFG.beamHalf * (i % 2 ? 0.78 : 1.02)) * taper;
    const nip = Math.min((x1 - x0) * 0.16, 0.018);
    positions.push(
      x0 + nip, -half, 0, x1 - nip, -half, 0, x1, 0, 0,
      x0 + nip, -half, 0, x1, 0, 0, x0, 0, 0,
      x0, 0, 0, x1, 0, 0, x1 - nip, half, 0,
      x0, 0, 0, x1 - nip, half, 0, x0 + nip, half, 0,
    );
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

const wardenCoreGeo = wardenIrisGeometry(0.31, 0.55, 6, 0.56, Math.PI / 6);
const wardenShieldGeo = wardenIrisGeometry(0.57, 0.74, 4, 0.38, Math.PI / 4);
const wardenEmitterGeo = new THREE.CylinderGeometry(0.10, 0.19, 0.38, 5);
wardenEmitterGeo.rotateZ(Math.PI / 2);
const wardenRackGeo = new THREE.BoxGeometry(0.38, 0.16, 0.14);
const wardenSealGeo = new THREE.OctahedronGeometry(0.10, 0);
const wardenBeamGeo = wardenBeamTrainGeometry(false);
const wardenBeamCoreGeo = wardenBeamTrainGeometry(true);
// Barrage ownership uses the same inward-facing deck clamps as ordinary
// mortar danger.  Sharing immutable geometry keeps this readable vocabulary
// cheap and removes the last perfect target ring from the boss.
const wardenMarkGeo = zoneClampGeo;
function wardenBarrageRuptureGeometry() {
  const positions = [];
  const width = WARDEN_CFG.barrageHalf * 2;
  const height = WARDEN_CFG.barrageHeight;
  const base = -height / 2;
  const tips = [0.62, 0.88, 0.70, 1.00, 0.76, 0.92, 0.58];
  for (let i = 0; i < tips.length; i++) {
    const cell = width / tips.length;
    const x0 = -width / 2 + cell * (i + 0.10);
    const x1 = -width / 2 + cell * (i + 0.88);
    const peakX = (x0 + x1) / 2 + (i % 2 ? -1 : 1) * cell * 0.10;
    const shoulder = base + height * (0.16 + (i % 3) * 0.035);
    const peakY = base + height * tips[i];
    positions.push(
      x0, base, 0, x1, base, 0, x1 - cell * 0.12, shoulder, 0,
      x0, base, 0, x1 - cell * 0.12, shoulder, 0, peakX, peakY, 0,
      x0, base, 0, peakX, peakY, 0, x0 + cell * 0.13, shoulder, 0,
    );
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}
const wardenBlastGeo = wardenBarrageRuptureGeometry();

function wardenProp(geo, color, map = null) {
  const mat = signalMaterial(color, map);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.visible = false;
  mesh.renderOrder = 4;
  scene.add(mesh);
  return { mesh, mat };
}

function wardenAttach(v) {
  const core = wardenProp(wardenCoreGeo, PAL.capsule);
  const shield = wardenProp(wardenShieldGeo, PAL.modCapsule);
  const emitter = wardenProp(wardenEmitterGeo, PAL.modCapsule);
  const rack = wardenProp(wardenRackGeo, PAL.modCapsule);
  const beam = wardenProp(wardenBeamGeo, PAL.capsule);
  const beamCore = wardenProp(wardenBeamCoreGeo, PAL.mortarBlast);
  // The sheath describes occupied space without additive HDR stacking; the
  // much thinner filament alone receives bloom.
  beam.mat.blending = THREE.NormalBlending;
  const mark = wardenProp(wardenMarkGeo, PAL.mortarMark);
  const blast = wardenProp(wardenBlastGeo, PAL.mortarBlast);
  // The atlas already paints the dormant iris and shutter hardware. These
  // rings exist only for impact/exposure feedback and use normal alpha so an
  // inactive Warden never wears a permanent additive halo.
  core.mat.blending = THREE.NormalBlending;
  shield.mat.blending = THREE.NormalBlending;
  blast.mat.blending = THREE.NormalBlending;
  Object.assign(v, {
    wardenCore: core.mesh, wardenCoreMat: core.mat,
    wardenShield: shield.mesh, wardenShieldMat: shield.mat,
    wardenEmitter: emitter.mesh, wardenEmitterMat: emitter.mat,
    wardenRack: rack.mesh, wardenRackMat: rack.mat,
    wardenBeam: beam.mesh, wardenBeamMat: beam.mat,
    wardenBeamCore: beamCore.mesh, wardenBeamCoreMat: beamCore.mat,
    wardenMark: mark.mesh, wardenMarkMat: mark.mat,
    wardenBlast: blast.mesh, wardenBlastMat: blast.mat,
    wardenSeals: [],
  });
  for (let i = 0; i < 4; i++) {
    const pip = wardenProp(wardenSealGeo, PAL.modCapsule);
    pip.mat.blending = THREE.NormalBlending;
    v.wardenSeals.push(pip);
  }
}

function wardenHide(v) {
  for (const mesh of [
    v.wardenCore, v.wardenShield, v.wardenEmitter, v.wardenRack,
    v.wardenBeam, v.wardenBeamCore, v.wardenMark, v.wardenBlast,
    ...v.wardenSeals.map((p) => p.mesh),
  ]) mesh.visible = false;
}

function wardenDetach(v) {
  for (const [mesh, mat] of [
    [v.wardenCore, v.wardenCoreMat], [v.wardenShield, v.wardenShieldMat],
    [v.wardenEmitter, v.wardenEmitterMat], [v.wardenRack, v.wardenRackMat],
    [v.wardenBeam, v.wardenBeamMat], [v.wardenBeamCore, v.wardenBeamCoreMat],
    [v.wardenMark, v.wardenMarkMat], [v.wardenBlast, v.wardenBlastMat],
    ...v.wardenSeals.map((p) => [p.mesh, p.mat]),
  ]) {
    scene.remove(mesh);
    mat.dispose();
  }
}

function wardenSync(v, e) {
  const W = WARDEN_CFG;
  const coreSocketed = motionSocketWorld(v, e, 'iris');
  const irisX = coreSocketed ? MOTION_SOCKET.s : e.x - 0.44;
  const irisY = coreSocketed ? MOTION_SOCKET.y : e.y - 0.10;
  const entering = gameMs < e.enterUntil;
  if (entering) {
    wardenHide(v);
    return;
  }

  const pulse = 0.5 + Math.sin(gameMs * 0.012) * 0.5;
  const exposed = e.state === 'exposed';
  const ping = gameMs < e.armorPingUntil;
  const hit = gameMs < e.coreHitUntil;

  v.wardenCore.visible = exposed || ping || hit;
  if (v.wardenCore.visible) {
    placeOnTower(v.wardenCore, irisX, irisY, 0.32);
    v.wardenCore.rotation.z = 0;
    v.wardenCore.scale.setScalar(1 + (hit ? 0.20 : 0));
    lit(v.wardenCoreMat, hit ? PAL.muzzle : exposed ? PAL.capsule : PAL.modCapsule);
    v.wardenCoreMat.opacity = hit ? 1 : exposed ? 0.78 : 0.66;
  }

  v.wardenShield.visible = ping;
  if (ping) {
    placeOnTower(v.wardenShield, irisX, irisY, 0.29);
    v.wardenShield.rotation.z = 0;
    v.wardenShield.scale.setScalar(1);
    lit(v.wardenShieldMat, PAL.muzzle);
    v.wardenShieldMat.opacity = 0.86;
  }

  // Persistent seal state: these do not refill when another attack begins.
  const seals = Math.max(0, Math.ceil(e.hp / W.windowDamage));
  const sealPos = [[-0.72, 0.62], [-0.28, 0.82], [0.28, 0.82], [0.72, 0.62]];
  for (let i = 0; i < v.wardenSeals.length; i++) {
    const p = v.wardenSeals[i];
    p.mesh.visible = exposed && i < seals;
    if (!p.mesh.visible) continue;
    placeOnTower(p.mesh, irisX + sealPos[i][0], irisY + sealPos[i][1], 0.27);
    p.mesh.rotation.z = i * Math.PI * 0.5;
    p.mesh.scale.setScalar(0.78);
    lit(p.mat, PAL.modCapsule);
    p.mat.opacity = 0.60;
  }

  const sweepTell = e.state === 'sweepTell';
  const sweepLive = e.state === 'sweepFire';
  const commit = sweepTell && e.stateUntil - gameMs <= W.sweepCommitMs;
  const simMuzzleX = e.x + e.dir * W.emitterTiles;
  const muzzleSocketed = motionSocketWorld(v, e, 'muzzle');
  const muzzleX = muzzleSocketed ? MOTION_SOCKET.s : simMuzzleX;
  const muzzleY = muzzleSocketed ? MOTION_SOCKET.y : e.y + 0.22;
  v.wardenEmitter.visible = sweepTell || sweepLive;
  if (v.wardenEmitter.visible) {
    placeOnTower(v.wardenEmitter, muzzleX, muzzleY, 0.30);
    v.wardenEmitter.scale.setScalar(sweepLive ? 1.28 : 0.72 + pulse * 0.32);
    lit(v.wardenEmitterMat, sweepLive ? PAL.polypBeam : PAL.mortarMark);
    v.wardenEmitterMat.opacity = sweepLive ? 1 : 0.48 + pulse * 0.30;
  }

  const rayLength = sweepLive ? W.beamReach : commit ? 1.35 : 0;
  for (const mesh of [v.wardenBeam, v.wardenBeamCore]) mesh.visible = rayLength > 0;
  if (rayLength > 0) {
    const endpoint = simMuzzleX + e.dir * rayLength;
    const visibleLength = Math.max(0.01, Math.abs(endpoint - muzzleX));
    const mid = (muzzleX + endpoint) / 2;
    placeOnTower(v.wardenBeam, mid, muzzleY, -0.12);
    placeOnTower(v.wardenBeamCore, mid, muzzleY, 0.02);
    v.wardenBeam.scale.set(visibleLength, sweepLive ? 1 : 0.48, 1);
    v.wardenBeamCore.scale.set(visibleLength, 1, 1);
    lit(v.wardenBeamMat, sweepLive ? PAL.capsule : PAL.mortarMark);
    lit(v.wardenBeamCoreMat, PAL.mortarBlast);
    v.wardenBeamMat.opacity = sweepLive ? 0.66 : 0.28;
    v.wardenBeamCoreMat.opacity = sweepLive ? 0.76 : 0.46;
  }

  const barrageTell = e.state === 'barrageTell';
  const barrageLive = e.state === 'barrageBurst';
  const rackSocketed = motionSocketWorld(v, e, 'rack');
  const rackX = rackSocketed ? MOTION_SOCKET.s : e.x - e.dir * 2.02;
  const rackY = rackSocketed ? MOTION_SOCKET.y : e.y + 0.42;
  v.wardenRack.visible = barrageTell || barrageLive;
  if (v.wardenRack.visible) {
    placeOnTower(v.wardenRack, rackX, rackY, 0.28);
    v.wardenRack.scale.setScalar(barrageLive ? 1.38 : 0.76 + pulse * 0.30);
    lit(v.wardenRackMat, barrageLive ? PAL.mortarBlast : PAL.mortarMark);
    v.wardenRackMat.opacity = barrageLive ? 1 : 0.50 + pulse * 0.28;
  }
  v.wardenMark.visible = barrageTell || barrageLive;
  v.wardenBlast.visible = barrageLive;
  if (v.wardenMark.visible) {
    placeOnTower(v.wardenMark, e.zoneX, e.zoneY + 0.08, -0.08);
    const gather = barrageTell
      ? 1 - Math.max(0, (e.stateUntil - gameMs) / W.barrageTellMs) : 1;
    const markScale = W.barrageHalf * (0.74 + gather * 0.26);
    v.wardenMark.scale.set(markScale, markScale * 0.58, 1);
    lit(v.wardenMarkMat, barrageLive ? PAL.mortarBlast : PAL.mortarMark);
    v.wardenMarkMat.opacity = barrageLive ? 0.98 : 0.34 + gather * 0.44;
  }
  if (barrageLive) {
    placeOnTower(v.wardenBlast, e.zoneX, e.zoneY + W.barrageHeight / 2, -0.52);
    lit(v.wardenBlastMat, PAL.mortarBlast);
    v.wardenBlastMat.opacity = 0.38;
  }

  // Atlas paint carries all persistent wear; keeping body emission at zero
  // prevents the complete rectangular cutout from blooming at rest.
  v.mat.emissiveIntensity = 0;
}
