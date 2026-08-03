/* ==================== HOSTILE / CORPSE MESHES ===================== */
/* Mock-3D presence: enemies materialize out of the tower depth, breathe
   on the depth axis while alive, flash on hits, and dissolve back as
   display-only corpses. Every value is derived from the sim row; meshes
   are held in this module's map, never on the sim object. */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { mortarArcX, mortarArcY } from '../pure/mortar.js';
import { installView } from '../sim/bridge.js';
import { gameMs } from '../sim/time.js';
import { PAL } from './palette.js';
import { applySurface } from './materials.js';
import { postGain } from './post.js';
import { scene } from './scene.js';
import { primitiveBox, spriteActionQuad, spriteQuad } from './sprite-table.js';
import { spriteActionTexture, spriteTexture, spriteVariantOf } from './sprites.js';
import { placeOnTower } from './tower.js';
import { releaseContactShadow, syncContactShadow } from './contact.js';
import {
  CUE_GAIN, LAMP_COIL_SWELL, LAMP_R, LEGIBILITY_ON, POSE_GAIN,
  POLYP_ONSET_MS, POLYP_SWELL_EASE, WASP_DIVE_NARROW, waspDiveStretch,
} from './legibility.js';

// T-039 (S6, contact shadows): each kind's own ground-plane footprint, read
// straight off the same CONFIG sizes LOOK's geometries below are built from
// — never a number this module invents on its own, so "the shadow can never
// exceed the actor's own footprint" is true by construction rather than by a
// second authored table that could drift from the meshes.
const CONTACT_FOOTPRINT = {
  wasp: CONFIG.wasp.visualRadius,
  carrier: Math.max(CONFIG.carrier.size[0], CONFIG.carrier.size[2]) / 2,
  hound: Math.max(CONFIG.hound.size[0], CONFIG.hound.size[2]) / 2,
  polyp: CONFIG.polyp.size,
  mortar: CONFIG.mortar.size,
};

const waspGeo = new THREE.OctahedronGeometry(CONFIG.wasp.visualRadius);
const carrierGeo = new THREE.BoxGeometry(...CONFIG.carrier.size);
const houndGeo = new THREE.BoxGeometry(...CONFIG.hound.size);
const polypGeo = new THREE.DodecahedronGeometry(CONFIG.polyp.size);
const polypBarrelGeo = new THREE.BoxGeometry(...CONFIG.polyp.barrelSize);
const polypStalkGeo = new THREE.BoxGeometry(0.35, CONFIG.polyp.rootY, 0.35);
const polypBeamGeo = new THREE.BoxGeometry(1, CONFIG.polyp.beamHalf * 2, CONFIG.polyp.beamHalf * 2);
const polypBeamCoreGeo = new THREE.BoxGeometry(1, 0.10, 0.10);
// Seed-Pod Tripod: a squat three-sided launch tube on three legs (the leg
// meshes and the bombardment props are built in the mortar block at the end
// of this file, which owns everything else about this kind).
const mortarTubeGeo = new THREE.ConeGeometry(CONFIG.mortar.size, CONFIG.mortar.size * 2.2, 3);

/* Production cutouts need enough pixels to carry the design that is painted
   into them. At the shipped MID view, fitting a wasp to its one-tile legacy
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
});

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
 * must survive the MID camera: a restrained ecology
 * glow behind each silhouette, and a different motion sentence for each
 * committed threat. They are intentionally unlit/fog-free; a warning is a
 * message about the machine, not another piece of distant architecture. */
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
const zoneRingGeo = new THREE.RingGeometry(0.34, 0.5, 24);

function signalMaterial(color, map = null) {
  return new THREE.MeshBasicMaterial({
    color, map, transparent: true, opacity: 0, fog: false,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
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
  } else if (e.state === 'prowl') {
    p.sy = 1 + Math.sin(e.t * H.gaitFreq) * H.gaitAmp;
  }
  return p;
}

function houndRoll(e) {
  const H = CONFIG.hound;
  if (e.state === 'tell') return -e.dir * H.tellRear * POSE_GAIN * houndTellU(e);
  if (e.state === 'charge') return e.dir * H.chargeLean;
  if (e.state === 'tumble') return e.t * 6;
  return Math.sin(e.t * H.gaitFreq) * H.gaitTilt;
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
  actionSpriteGeos.set(kind, geo);
  return geo;
}

function actionPoseActive(e) {
  if (e.kind === 'wasp') return e.state === 'dive';
  if (e.kind === 'hound') return e.state === 'charge';
  if (e.kind === 'polyp') return e.state === 'tell';
  if (e.kind === 'mortar') return e.state === 'lob' || e.state === 'fuse' || e.state === 'burst';
  // The carrier has no attack state; its second pose follows its authored
  // flight bob phase. This is a two-pose hover cycle, not an arbitrary strobe.
  if (e.kind === 'carrier') return Math.sin(e.t * CONFIG.carrier.bobFreq) > 0.15;
  return false;
}

function syncSpritePose(v, e) {
  if (!v.sprite || !v.actionTex || !v.actionGeo) return;
  const action = actionPoseActive(e);
  if (action === v.actionActive) return;
  v.actionActive = action;
  v.mesh.geometry = action ? v.actionGeo : v.baseGeo;
  const tex = action ? v.actionTex : v.baseTex;
  v.mat.map = tex;
  v.mat.emissiveMap = tex;
}

function spriteMaterial(tex) {
  return new THREE.MeshStandardMaterial({
    map: tex,
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

// which way the drawn body points: the sim row's facing, except that a
// committed dive is steered by velocity and may cross its own facing
function spriteFaceX(e) {
  const desired = e.kind === 'wasp' && waspDiving(e)
    ? (e.vx < 0 ? -1 : 1)
    : (e.dir < 0 ? -1 : 1);
  // The production atlas is painted facing left; the retained A/B sprites
  // face right. Bake that authoring convention into the mirror once so every
  // state pose and action cutout follows the sim's direction.
  const productionLeft = e.kind === 'wasp' || e.kind === 'hound' || e.kind === 'mortar';
  const authored = spriteVariantOf(e.kind) === 'b' && productionLeft ? -1 : 1;
  return desired * authored;
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

/* Every hostile gets one quiet halo sized from the primitive box its art
 * replaces. The brighter props are kind-specific and only exist while the
 * matching sim state is live, so the vocabulary stays learnable:
 *
 *   amber chevrons  = this lane is about to be occupied
 *   acid wake       = this body is committed and moving now
 *   amber ring      = this landing point is counting down
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
    const ringMat = signalMaterial(PAL.mortarMark);
    const ring = new THREE.Mesh(zoneRingGeo, ringMat);
    ring.visible = false;
    ring.renderOrder = 1;
    scene.add(ring);
    v.zoneRing = ring;
    v.zoneRingMat = ringMat;
  }
}

function readabilityDetach(v) {
  for (const [mesh, mat] of [
    [v.actorGlow, v.actorGlowMat], [v.attackWake, v.attackWakeMat],
    [v.tellLane, v.tellLaneMat], [v.zoneRing, v.zoneRingMat],
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
  if (v.zoneRing) v.zoneRing.visible = false;
}

function syncActorGlow(v, e, K, sx, sy, signaling) {
  const b = v.actorBox;
  if (!b) return;
  const face = spriteFaceX(e);
  const pulse = 0.96 + Math.sin(gameMs * 0.009 + e.id * 0.71) * 0.04;
  v.actorGlow.visible = true;
  placeOnTower(v.actorGlow,
    e.x + b.cx * face * v.presentationScale,
    e.y + v.presentationLift + b.cy * v.presentationScale,
    -0.10);
  v.actorGlow.rotation.z = v.sprite ? spriteRoll(e, K) : K.roll(e);
  v.actorGlow.scale.set(b.w * sx * 1.48 * pulse, b.h * sy * 1.62 * pulse, 1);
  v.actorGlowMat.color.setHex(signaling ? (K.pose ? K.pose(e).glow || K.color : K.color) : K.color);
  v.actorGlowMat.opacity = v.mat.opacity * (signaling ? 0.25 : 0.11);
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
    v.tellLane.visible = true;
    placeOnTower(v.tellLane,
      e.x + e.dir * (PP.barrelTiles + preview / 2), e.y, -0.04);
    v.tellLane.scale.set(e.dir * preview, 0.16 + u * 0.10, 1);
    lit(v.tellLaneMat, PAL.polypTell);
    v.tellLaneMat.opacity = 0.22 + 0.36 * u;
  }
}

function syncMortarBeacon(v, e) {
  if (!v.zoneRing) return;
  const marked = e.state === 'lob' || e.state === 'fuse' || e.state === 'burst';
  v.zoneRing.visible = marked;
  if (!marked) return;
  const M = CONFIG.mortar;
  const pulse = 0.5 + 0.5 * Math.sin(gameMs * (e.state === 'fuse' ? 0.028 : 0.014));
  const burst = e.state === 'burst';
  placeOnTower(v.zoneRing, e.zoneX, e.zoneY + 0.74, -0.08);
  const size = M.blastHalf * (burst ? 1.18 : 0.72 + pulse * 0.12);
  v.zoneRing.scale.set(size, size * 0.72, 1);
  lit(v.zoneRingMat, burst ? PAL.mortarBlast : PAL.mortarMark);
  v.zoneRingMat.opacity = burst ? 0.88 : 0.34 + pulse * 0.28;
}

const meshes = new Map();                // sim hostile row → { mesh, mat }

function spawned(e) {
  const K = LOOK[e.kind];
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
  const tex = spriteTexture(e.kind);
  const geo = tex ? spriteGeo(e.kind) : null;
  const mat = applySurface(geo ? spriteMaterial(tex) : new THREE.MeshStandardMaterial({
    color: K.color, flatShading: true, transparent: true, opacity: 0, fog: false,
  }), K.surface);
  const mesh = new THREE.Mesh(geo || K.geo, mat);
  const actionTex = geo ? spriteActionTexture(e.kind) : null;
  const v = {
    mesh, mat, sprite: !!geo,
    baseGeo: geo, baseTex: tex,
    actionGeo: actionTex ? actionSpriteGeo(e.kind) : null,
    actionTex, actionActive: false,
    presentationScale: geo ? (SPRITE_BODY_SCALE[e.kind] || 1) : 1,
    presentationLift: 0,
  };
  v.presentationLift = geo ? spriteAnchorLift(e.kind, v.presentationScale) : 0;
  readabilityAttach(v, e, K);
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
      depthWrite: false,
    });
    const beam = new THREE.Mesh(polypBeamGeo, beamMat);
    beam.visible = false;
    scene.add(beam);
    v.beam = beam;
    v.beamMat = beamMat;
    const beamCoreMat = new THREE.MeshBasicMaterial({
      color: PAL.polypBeam, transparent: true, opacity: 0.72,
      depthWrite: false,
    });
    const beamCore = new THREE.Mesh(polypBeamCoreGeo, beamCoreMat);
    beamCore.visible = false;
    scene.add(beamCore);
    v.beamCore = beamCore;
    v.beamCoreMat = beamCoreMat;
  } else if (e.kind === 'mortar') {
    mortarAttach(v, mesh);                 // legs, pod, and the marked-zone props
  }
  if (v.sprite) mesh.scale.x = spriteFaceX(e);   // authored facing +x
  // the tell lamp (T-003): only the two kinds whose telegraph is a wind-up
  // ON the body, and only while the readability pass is on
  if (LEGIBILITY_ON && LAMP_SYNC[e.kind]) {
    lampAttach(v, e.kind === 'polyp' ? PAL.polypTell : PAL.houndTell);
  }
  mesh.visible = false;                    // hidden until its materialization begins
  scene.add(mesh);
  meshes.set(e, v);
}

// Death is an impact sentence, not a second movement mode. Every role holds
// its readable silhouette for one hit-punch, then resolves in the way its
// construction suggests: flyers break and fall, the frame buckles forward,
// rooted growths snap into their mount. None spins through a full turn.
const DEATH_ROLE = Object.freeze({
  wasp:    { fall: 1.45, drift: 0.72, depth: -0.55, tilt: 0.82, sx: 0.72, sy: 0.45, debris: 3, shardSpeed: 2.8 },
  carrier: { fall: 2.05, drift: 0.50, depth: -0.75, tilt: 0.42, sx: 0.88, sy: 0.42, debris: 5, shardSpeed: 3.0 },
  hound:   { fall: 0.42, drift: 0.34, depth: -0.20, tilt: 0.20, sx: 1.08, sy: 0.24, debris: 4, shardSpeed: 2.5 },
  polyp:   { fall: 0.34, drift: 0.08, depth: -0.14, tilt: 0.28, sx: 1.02, sy: 0.16, debris: 4, shardSpeed: 2.2 },
  mortar:  { fall: 0.46, drift: 0.12, depth: -0.16, tilt: 0.24, sx: 0.90, sy: 0.12, debris: 4, shardSpeed: 2.4 },
});
const DEATH_PUNCH_MS = 70;
const deathShardGeo = new THREE.TetrahedronGeometry(0.12, 0);

function deathDebris(e, kind, spec) {
  const mat = new THREE.MeshBasicMaterial({
    color: LOOK[kind].color, transparent: true, opacity: 0, fog: false,
  });
  const shards = [];
  const bias = Math.sign(e.vx) || e.dir || -1;
  for (let n = 0; n < spec.debris; n++) {
    const mesh = new THREE.Mesh(deathShardGeo, mat);
    mesh.visible = false;
    scene.add(mesh);
    const side = n % 2 ? -1 : 1;
    const spread = 0.45 + (n % 3) * 0.22;
    shards.push({
      mesh,
      vx: (bias * 0.45 + side * spread) * spec.shardSpeed,
      vy: spec.shardSpeed * (0.75 + (n % 3) * 0.25),
      depthV: ((n % 3) - 1) * 0.55,
      spin: side * (5 + n),
      scale: 0.76 + (n % 2) * 0.34,
    });
  }
  return { shards, mat };
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
  if (v.lamp) lampDetach(v);             // nor a tell lamp: a corpse never warns
  readabilityDetach(v);                  // warning props never dissolve as corpses
  if (fade) {                          // hand the mesh to the corpse pass to dissolve
    const spec = DEATH_ROLE[e.kind];
    const debris = deathDebris(e, e.kind, spec);
    corpses.push({ mesh: v.mesh, mat: v.mat, s: e.x,
                   y: e.y + v.presentationLift, baseRoll: v.mesh.rotation.z,
                   t0: gameMs, flash: FLASH[e.kind],
                   breakDir: Math.sign(e.vx) || e.dir || -1,
                   baseScaleX: Math.abs(v.mesh.scale.x),
                   baseScaleY: Math.abs(v.mesh.scale.y),
                   baseScaleZ: Math.abs(v.mesh.scale.z),
                   face: Math.sign(v.mesh.scale.x) || 1,
                   spec, shards: debris.shards, shardMat: debris.mat });
  } else {
    scene.remove(v.mesh);
    v.mat.dispose();
  }
}

function sync(e) {
  const v = meshes.get(e);
  if (!v) return;
  const W = CONFIG.wasp;
  if (gameMs < e.enterUntil - W.enterMs) {            // staged wave slot: still hidden
    v.mesh.visible = false;
    if (v.beam) v.beam.visible = false;
    if (v.beamCore) v.beamCore.visible = false;
    if (v.pod) mortarHide(v);
    if (v.lamp) v.lamp.visible = false;
    readabilityHide(v);
    return;
  }
  v.mesh.visible = true;
  syncSpritePose(v, e);
  // mock-3D presence: materialize in from tower depth, breathe while alive
  let depth, scale;
  if (gameMs < e.enterUntil) {
    const u = 1 - (e.enterUntil - gameMs) / W.enterMs;    // 0 → 1 over the entrance
    const ease = 1 - (1 - u) ** 3;
    depth = W.enterDepth * (1 - ease);
    scale = 0.7 + 0.3 * ease;
    v.mat.opacity = u;
  } else {
    depth = Math.sin(e.t * W.wobbleFreq) * W.wobbleAmp;
    scale = 1;
    v.mat.opacity = 1;
  }
  const K = LOOK[e.kind];
  let sx = scale, sy = scale, sz = scale;
  const flashing = gameMs < e.flashUntil;
  let glow = flashing ? FLASH[e.kind] : PAL.glowOff;
  if (K.pose) {                          // per-kind state theater over the shared presence
    const p = K.pose(e);
    depth += p.depth;
    sx *= p.sx; sy *= p.sy; sz *= p.sz;
    if (glow === PAL.glowOff) glow = p.glow;              // a hit flash still wins
  }
  sx *= v.presentationScale;
  sy *= v.presentationScale;
  sz *= v.presentationScale;
  // Keep the generated ink alive in the fog. At play scale a fully dark
  // emissive map made the wasp and hound detail collapse into the hull even
  // though their silhouettes were technically present. A quiet kind-colour
  // lift preserves that ink; tells, hits and committed attacks still jump to
  // full authored emissive, so this cannot masquerade as a warning state.
  const signaling = glow !== PAL.glowOff;
  v.mat.emissive.setHex(signaling ? glow : K.color);
  // T-048: active state light gets the same headroom as lamps and beams.
  // Ordinary bodies receive only a restrained fraction of it for legibility.
  v.mat.emissiveIntensity = postGain() * (signaling ? 1 : 0.30);
  placeOnTower(v.mesh, e.x, e.y + v.presentationLift, depth);
  if (v.sprite) {
    // the art is authored facing +x, so facing is a mirror; the roll rules
    // that differ from the solid's are in spriteRoll() above
    v.mesh.rotation.z = spriteRoll(e, K);
    v.mesh.scale.set(sx * spriteFaceX(e), sy, sz);
  } else {
    v.mesh.rotation.z = K.roll(e);
    v.mesh.scale.set(sx, sy, sz);
  }
  if (v.beam) {
    const PP = CONFIG.polyp;
    // the barrel points down the authored lane (dir is FACING on a rooted row)
    if (v.barrel) v.barrel.position.x = e.dir * PP.barrelTiles * 0.65;
    const live = e.state === 'fire' && e.beamReach > 0 && gameMs >= e.enterUntil;
    v.beam.visible = live;
    v.beamCore.visible = live;
    if (live) {
      // span exactly the reach the sim marched this frame, in the combat
      // plane (depth 0): what is drawn is what damages, wall to barrel
      placeOnTower(v.beam, e.x + e.dir * (PP.barrelTiles + e.beamReach / 2), e.y, 0);
      placeOnTower(v.beamCore, e.x + e.dir * (PP.barrelTiles + e.beamReach / 2), e.y, 0.03);
      const pulse = 1 + PP.beamPulseAmp *
        Math.sin(gameMs / 1000 * PP.beamPulseFreq * Math.PI * 2);
      v.beam.scale.set(e.beamReach, pulse, pulse);
      v.beamCore.scale.set(e.beamReach, 0.9 + pulse * 0.1, 0.9 + pulse * 0.1);
      v.beamMat.color.setHex(PAL.polyp); // hazard volume, readable through rather than white
      v.beamMat.opacity = 0.22 + 0.08 * pulse;
      v.beamCoreMat.color.setHex(PAL.polypBeam);
      v.beamCoreMat.opacity = 0.58 + 0.12 * pulse;
    }
  }
  if (v.pod) mortarSync(v, e);           // pod arc + marked zone + detonation
  // the tell lamp reads the same sim state the pose does, one frame, no memory
  if (v.lamp) LAMP_SYNC[e.kind](v, e);
  syncActorGlow(v, e, K, sx, sy, signaling);
  syncAttackRead(v, e);
  syncMortarBeacon(v, e);
  syncContactShadow(e, e.x, e.y, CONTACT_FOOTPRINT[e.kind]);
}

installView({ hostiles: { spawned, removed, sync } });

// Dead hostiles are display-only: no sim, no gate participation (removeHostile
// already fired onHostileRemoved), just a short role-shaped rupture.
const corpses = [];

function releaseCorpse(c) {
  scene.remove(c.mesh);
  c.mat.dispose();
  for (const shard of c.shards) scene.remove(shard.mesh);
  c.shardMat.dispose();
}

export function updateCorpses() {
  const W = CONFIG.wasp;
  for (let i = corpses.length - 1; i >= 0; i--) {
    const c = corpses[i];
    const elapsed = gameMs - c.t0;
    const u = elapsed / W.dieMs;
    if (u >= 1) { releaseCorpse(c); corpses.splice(i, 1); continue; }

    if (elapsed < DEATH_PUNCH_MS) {
      const q = elapsed / DEATH_PUNCH_MS;
      const punch = Math.sin(q * Math.PI);
      placeOnTower(c.mesh, c.s - c.breakDir * 0.08 * punch, c.y, -0.12 * punch);
      c.mesh.rotation.z = c.baseRoll + c.breakDir * 0.08 * q;
      const swell = 1 + punch * 0.16;
      c.mesh.scale.set(c.baseScaleX * c.face * swell,
        c.baseScaleY * swell, c.baseScaleZ * swell);
      c.mat.opacity = 1;
      c.mat.emissive.setHex(c.flash);
      continue;
    }

    const r = Math.min(1, (elapsed - DEATH_PUNCH_MS) / (W.dieMs - DEATH_PUNCH_MS));
    const snap = 1 - (1 - r) ** 3;
    placeOnTower(c.mesh,
      c.s + c.breakDir * c.spec.drift * r,
      c.y - c.spec.fall * r * r,
      c.spec.depth * r);
    c.mesh.rotation.z = c.baseRoll + c.breakDir * c.spec.tilt * snap;
    c.mesh.scale.set(
      c.baseScaleX * c.face * (1 + (c.spec.sx - 1) * snap),
      c.baseScaleY * (1 + (c.spec.sy - 1) * snap),
      c.baseScaleZ * (1 - 0.28 * snap));
    c.mat.opacity = 1 - r ** 1.35;
    c.mat.emissive.setHex(r < 0.12 ? c.flash : PAL.glowOff);

    const t = (elapsed - DEATH_PUNCH_MS) / 1000;
    c.shardMat.opacity = Math.max(0, 0.92 * (1 - r));
    for (const shard of c.shards) {
      shard.mesh.visible = true;
      placeOnTower(shard.mesh,
        c.s + shard.vx * t,
        c.y + shard.vy * t - 10 * t * t,
        -0.04 + shard.depthV * t);
      shard.mesh.rotation.z = shard.spin * t;
      shard.mesh.scale.setScalar(shard.scale * (1 - r * 0.45));
    }
  }
}

// run reset (resetGame in src/main.js): drop any dissolving corpses
export function clearCorpses() {
  for (const c of corpses) releaseCorpse(c);
  corpses.length = 0;
}

/* ==================== SPORE MORTAR (T-014) ========================= *
 * Everything this kind needs beyond the shared presence pass, kept in one
 * block at the end of the file. Three props, all derived from sim fields
 * and the SAME pure functions the sim uses (src/pure/mortar.js), so the
 * arc that is drawn is the arc that was flown and the slab that is drawn
 * is the slab that damages:
 *
 *   pod   — the seed pod in flight, replayed from the sim's podU through
 *           the pure arc. Visible only while the tube is lobbing.
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
const mortarPodGeo = new THREE.OctahedronGeometry(M_CFG.podRadius);
const mortarMarkGeo = new THREE.BoxGeometry(
  M_CFG.blastHalf * 2, M_CFG.markThickness, M_CFG.blastHalf * 1.1);
const mortarBlastGeo = new THREE.BoxGeometry(
  M_CFG.blastHalf * 2, M_CFG.blastHeight, M_CFG.blastHalf * 1.1);

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
  const podMat = new THREE.MeshBasicMaterial({
    color: PAL.mortarPod, transparent: true, opacity: 0.95,
  });
  const pod = new THREE.Mesh(mortarPodGeo, podMat);
  pod.visible = false;
  scene.add(pod);
  const markMat = new THREE.MeshBasicMaterial({
    color: PAL.mortarMark, transparent: true, opacity: 0.8,
  });
  const mark = new THREE.Mesh(mortarMarkGeo, markMat);
  mark.visible = false;
  scene.add(mark);
  const blastMat = new THREE.MeshBasicMaterial({
    color: PAL.mortarBlast, transparent: true, opacity: 0.16,
  });
  const blast = new THREE.Mesh(mortarBlastGeo, blastMat);
  blast.visible = false;
  scene.add(blast);
  v.pod = pod; v.podMat = podMat;
  v.mark = mark; v.markMat = markMat;
  v.blast = blast; v.blastMat = blastMat;
}

function mortarDetach(v) {
  for (const [mesh, mat] of [[v.pod, v.podMat], [v.mark, v.markMat], [v.blast, v.blastMat]]) {
    scene.remove(mesh);
    mat.dispose();
  }
}

function mortarHide(v) {
  v.pod.visible = false;
  v.mark.visible = false;
  v.blast.visible = false;
}

function mortarSync(v, e) {
  if (gameMs < e.enterUntil) { mortarHide(v); return; }   // no props while condensing in
  const flying = e.state === 'lob';
  const marked = flying || e.state === 'fuse' || e.state === 'burst';
  v.pod.visible = flying;
  if (flying) {
    lit(v.podMat, PAL.mortarPod);        // the ARC is the read — let it carry light
    // exactly the arc the sim flew: same pure functions, same podU
    placeOnTower(v.pod,
      mortarArcX(e.x, e.zoneX, e.podU),
      mortarArcY(e.y, e.zoneY, M_CFG.arcTiles, e.podU), 0);
    v.pod.rotation.z = e.podU * 7;
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
    lit(v.blastMat, PAL.mortarBlast);    // the detonation, for the frames it damages
    v.blastMat.opacity = 0.24 + 0.38 * u;
    v.markMat.opacity = 0.95;
    v.blast.scale.set(1 + (1 - u) * 0.12, 1, 1 + (1 - u) * 0.35);
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
