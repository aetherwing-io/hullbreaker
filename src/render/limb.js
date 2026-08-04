/* ========================= LIMB: THE LEG ========================== */
/* The six-face tower baked as one static, faceted creature limb — armour
   skin under the deck, the body rising behind the combat plane, and a tendon
   joint at every corner. This is the DEFAULT world reveal since T-009
   (decisions.md entry 3); it began as the G1 limb-turn experiment behind
   ?g1=1, and ?zip=1 still selects the legacy brick-slam reveal instead.

   THE LIMB NEVER MOVES. Every box here is placed once from the pure bake
   plan (../pure/limb.js) along the shipped polyline and is never touched
   again: there is no per-frame hook, no ritual hook, and no build hook in
   this module, by construction. A corner is the CAMERA swinging 60° around
   a joint on the ritual's existing two-snap detent curve
   (../render/camera.js, ../pure/waves.js) while the facet beyond the joint
   — which was baked at boot, like everything else — comes into view around
   the joint's mass and out of the fog.

   The brick-slam zipper is not called in this mode (see ./level.js): the
   choreography code stays intact for the traps/emplacements lane per the
   July 30 addendum, it is simply not what a body does.

   Nothing here touches the simulation. The sim still gates the next face's
   columns as inert until their ritual — that is gameplay truth and it is
   unchanged; this module just refuses to tell that story with geometry. */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { normalAscentAltAt } from '../pure/ascent.js';
import { BEND_S, SEGS, facetAtBends, headingAt, polyAt } from '../pure/path.js';
import { limbBakePlan, limbFacetTone, limbFoldBridgeVisible } from '../pure/limb.js';
import { limbShadePlan } from '../pure/shade.js';
import { IS_G1, QUERY } from '../mode.js';
import { groundH } from '../sim/level.js';
import { scrollX } from '../sim/time.js';
import { HIDE, scene } from './scene.js';
import { PAL, SHADE_GAIN } from './palette.js';
import { applyHullTexture, applySurface, varyHullTexture } from './materials.js';
import { cameraFacingFacet } from './camera.js';

// One value ladder from the palette module (concept teal/rust by default,
// grey-box via ?palette=classic): the deck (PAL.ground) stays the brightest
// thing on screen, and the limb reads as mass around it. Values are chosen
// against what the renderer actually PRODUCES, not against the hex codes:
// with this light rig plus ACES tone mapping a lit face lands at roughly
// 0.45x its albedo, while scene.background/fog is drawn raw. The deck
// (PAL.ground, ~0.48x) has to stay the brightest large surface and the haze
// (PAL.limbBg) has to sit just above it, so the limb's own armour is
// authored a notch under the deck instead of the two notches that read as black.
//
// WHAT THAT CALIBRATION LEFT OUT, AND ?shade= SUPPLIES (T-035). The rule
// above authors where a LIT face lands. It never authored where an occluded
// one lands, so every one of these ~900 pieces was drawn at ~1.0x its token
// (CONFIG.limb.tone is +-4% of hue, not of value) and the measured result is
// a body with no darks at all: 99% of playfield pixels inside a 45-70 window
// out of 255 (docs/proposals/2026-08-look-direction.md). ../pure/shade.js
// computes the missing half — occlusion, top-face rake and seeded wear per
// piece — and it multiplies the SAME tokens, so the palette's hue authoring
// is untouched and the two can be judged apart. SHADE_GAIN is 0 on every URL
// that does not ask for it, and 0 means exactly 1.0x: the bake below is then
// byte-identical to the shipped build.
const BASE_COLORS = PAL.limb;

// kind → material. Joint perimeter hardware uses the brighter `rib`/`machine`
// end of the ladder: the joint is the landmark the orbit is about. Its huge
// vertical ridge is the exception — a bright face there reads as a blank
// billboard before every corner, so the pivot mass stays in shadow-steel
// while the collar, kerb and deck lights outline it.
//
// THE SCALE PASS ADDS NO MATERIAL (T-045). Every new kind below maps onto one
// of the eight keys that were already here. The silhouette pass below splits
// those keys into a small fixed set of primitive/material pools, but default
// and ?scale=0 use the same set: the scale pass still costs ZERO draw calls.
// What separates the tiers instead is the haze ladder plus the
// palette's own body/backdrop split: the sister limb wears the RUST body
// tokens (it is another arm of the same creature, board 10), the drums wear
// the teal shadow-steel of structure behind the plane, and the far body wears
// `skyline`. Warm near, cool far, is what atmospheric perspective IS.
const MATERIAL_FOR = {
  // Exposed armour is rust; the substrate under it is teal shadow-steel.
  // Keeping the old uninterrupted hull in the rust bucket made the lower half
  // of every frame read as a brown building façade no matter what sat on it.
  hull: 'wall', hullRib: 'shadow', wall: 'wall', wallSeam: 'shadow', wallCap: 'shadow',
  kerb: 'rib', lipScute: 'rib', scute: 'scute', scuteRib: 'scuteAlt', silhouette: 'skyline',
  ridge: 'shadow', collar: 'wall', tendon: 'shadow', buttress: 'wall', cup: 'hull',
  gill: 'shadow', bodyRib: 'hull', flankTendon: 'machine',
  // tier 1: the sister limb, in the body's own rust — but one notch off the
  // played limb's brightest metal on purpose. `machine` on the lip made the
  // backdrop limb the brightest edge in the frame, which reads as NEAR.
  bdLimb: 'wall', bdLimbLip: 'shadow', bdRing: 'skyline',
  // tier 2 / tier 3: structure and distance, in teal
  bdDrum: 'shadow', bdLink: 'shadow', bdFar: 'wall', bdSpire: 'skyline',
  // human-scale reference objects: fixtures, so the brightest metal in the
  // ladder — a rung that reads as a shadow is not a reference object
  markRung: 'shadow', markStile: 'shadow', markRail: 'shadow', markPost: 'shadow',
  markRim: 'machine', markPanel: 'shadow',
};

/* Production macro anatomy.  The original scale pass had the right spatial
   idea, but its vocabulary was still boxes plus stretched cylinders: sister
   limbs looked like hanging cards, vertebral links like floating girders and
   the far body like checkerboard slabs.  Keep the exact same static plan and
   transforms, but route those pieces through a tiny fixed primitive family:

     body   — a broad, overlapping under-deck muscle casting
     scute  — an asymmetric armoured lobe with a dark contact bevel
     rib    — a six-sided hardpoint / vertebra
     cable  — a six-sided connector whose axis follows local path-s

   No mesh is created after boot and no callback poses anatomy.  `?limbs=legacy`
   is a matched visual A/B in the same build; it restores the former primitive
   routing and geometry without changing one bake-plan piece. */
const LIMB_SILHOUETTE_PASS = QUERY.get('limbs') !== 'legacy';

const LEGACY_SHAPE_FOR = Object.freeze({
  hull: 'body', wall: 'scute',
  scute: 'scute', lipScute: 'scute', bdLimb: 'scute', bdFar: 'scute',
  scuteRib: 'rib', bodyRib: 'rib', ridge: 'rib', tendon: 'rib', bdDrum: 'rib',
  flankTendon: 'cable', markRim: 'cable',
});

const PRODUCTION_SHAPE_FOR = Object.freeze({
  hull: 'body', hullRib: 'cable', wall: 'scute',
  scute: 'scute', lipScute: 'scute',
  bdLimb: 'body', bdLimbLip: 'cable', bdRing: 'rib',
  bdDrum: 'rib', bdLink: 'cable', bdFar: 'body', bdSpire: 'rib',
  scuteRib: 'rib', bodyRib: 'rib', ridge: 'rib', collar: 'rib',
  tendon: 'rib', buttress: 'body', cup: 'rib',
  flankTendon: 'cable', markRim: 'cable',
});

const SHAPE_FOR = LIMB_SILHOUETTE_PASS ? PRODUCTION_SHAPE_FOR : LEGACY_SHAPE_FOR;

/* The three-band backdrop now owns colossal distance.  Retaining the older
   scale-pass cards on top of it produced exactly the duplicate language the
   production composition was built to remove: a sister limb as tilted dark
   rectangles, vertebrae as a floating bar, and a far body as pale slabs.
   Likewise, the painted route fascia already has bevels, seams and lights;
   the old proud lip scute merely covered it with a second brown strip and
   became a paddle at a grazing turn.

   Omit only those redundant PRESENTATION pieces from the production upload.
   They remain in the immutable pure bake plan (and in ?limbs=legacy), so plan
   length, fold ownership, collision, build prefix and the controlled A/B all
   retain their exact authored truth. Far-side scale marks leave with the
   sister limb they were attached to; near-limb ladders/hatches remain. */
const PRODUCTION_OMIT_KINDS = new Set([
  'lipScute',
  'bdLimb', 'bdLimbLip', 'bdRing',
  'bdDrum', 'bdLink', 'bdFar', 'bdSpire',
]);

function omitProductionPiece(piece) {
  return LIMB_SILHOUETTE_PASS &&
    (PRODUCTION_OMIT_KINDS.has(piece.kind) ||
      (piece.depth < 0 && piece.kind.startsWith('mark')));
}

/* Material-key -> SURFACE family (T-052, materials.js): reuses the table
   authored there rather than adding a ninth one. `hull`/`scute` are armour
   plate, `wall` recedes into the body (the family CONFIG.limb itself is
   named for — `distant`, roughness 0.92 — already reads "duller, further
   back"), `rib`/`machine` are the brightest metal in the ladder (joint
   highlights and human-scale fixtures), `shadow`/`scuteAlt`/`skyline` stay
   at the same plate/distant response the surface next to them wears; a
   family switch here is a look call, not a new material shape. */
const SURFACE_FOR = {
  hull: 'plate', wall: 'distant', scute: 'plate', scuteAlt: 'plate',
  shadow: 'distant', rib: 'machine', machine: 'machine', skyline: 'distant',
};

/* THE SCALE PASS (T-045), ON BY DEFAULT — decisions.md entry 16 ("ship
   improvements ON by default once the operator has judged them"; the blanket
   off-by-default flag rule is retired) plus entry 17, which makes selling the
   scale of the creature the headline art problem rather than RIG's pixel
   count. ?scale=0 is the escape hatch and the A/B: it restores the two
   `CONFIG.limb.silhouette` slabs — the build the operator has been looking
   at — so a before/after is one URL apart in the same build.

   Deliberately NOT named after ?view=: that flag is the camera pull-back
   (CONFIG.viewScales), whose shipped setting is now FAR. This one is about
   what the frame around the tiny figure contains. */
const SCALE_PASS = QUERY.get('scale') !== '0';

/* The six-face ascent closes over its own X/Z footprint one full coil higher.
   Euclidean depth alone cannot self-occlude that helix: at the opening camera,
   the Crown facet's under-deck roots are physically in front of the distant
   haze and project as a false ceiling (and can cover RIG during a turn).

   Keep the body itself completely static, but cull near-field armour outside
   the current/adjacent route facets exactly as a sectorized megastructure
   renderer would. Within those candidates, only the camera-facing facet owns
   proud anatomy; only kerb/lip pieces whose own span touches the shared
   chamfer may bridge into an adjacent facet for the corner reveal. Distant
   `bd*` anatomy and scale marks retain authored world-space
   transforms but cannot recur after the helix folds over itself. The update
   runs every frame but uploads matrices only at a route boundary or the final
   camera-detent handoff. */
const FOLD_CULL_KINDS = new Set([
  'hull', 'hullRib', 'wall', 'gill', 'bodyRib', 'flankTendon',
  'kerb', 'lipScute', 'scute', 'scuteRib',
  'ridge', 'collar', 'tendon', 'buttress', 'cup',
  // Scale anatomy still belongs to a facet. Letting the opening face's
  // sister limb survive all the way around the closed coil projected its
  // rings as detached charcoal/rust pillars behind the Crown.
  'bdLimb', 'bdLimbLip', 'bdRing', 'bdDrum', 'bdLink', 'bdFar', 'bdSpire',
  'markRung', 'markStile', 'markRail', 'markPost', 'markRim', 'markPanel',
]);
// These two thin bands describe the route continuing around the corner. A
// piece may bridge camera sectors only when its own s-span intersects their
// shared chamfer; the rest of either band belongs to exactly one face. Keeping
// whole next-face bands (or hull/scutes/joint slabs) alive through the
// 30-degree hold exposed their backs and made RIG appear behind the fold.
const FOLD_BRIDGE_KINDS = new Set(['kerb', 'lipScute']);
const foldCullPools = [];
let foldCullFacet = -1;
let foldCullCameraFacet = -1;
let foldCullHidden = 0;

function routeFacetAt(s) {
  return facetAtBends(s, BEND_S);
}

export function updateLimbFoldCull() {
  if (!IS_G1 || !foldCullPools.length) return;
  const active = routeFacetAt(scrollX);
  const cameraFacet = cameraFacingFacet();
  if (active === foldCullFacet && cameraFacet === foldCullCameraFacet) return;
  foldCullFacet = active;
  foldCullCameraFacet = cameraFacet;
  foldCullHidden = 0;
  for (const pool of foldCullPools) {
    for (const row of pool.rows) {
      const piece = row.piece;
      const nearField = FOLD_CULL_KINDS.has(piece.kind);
      // Once the last bend has handed us to the outro, there is no next
      // corner that needs a three-facet overlap. Retaining facet 5 here lets
      // its under-deck/backdrop pools project above the Crown as detached
      // ceiling slabs. The final joint is facet 6 and remains intact.
      const terminalOutro = active === CONFIG.path.faces;
      const remote = nearField && (terminalOutro
        ? piece.facet !== active
        : Math.abs(piece.facet - active) > 1);
      const bridgeVisible = FOLD_BRIDGE_KINDS.has(piece.kind) &&
        limbFoldBridgeVisible(piece, cameraFacet, BEND_S, CONFIG.path.chamferTiles);
      const behindFold = nearField && piece.facet !== cameraFacet && !bridgeVisible;
      const hidden = remote || behindFold;
      pool.mesh.setMatrixAt(row.instance, hidden ? HIDE : pieceMatrix(piece));
      if (hidden) foldCullHidden++;
    }
    pool.mesh.instanceMatrix.needsUpdate = true;
  }
}

export function limbFoldCullSnapshot() {
  return {
    facet: foldCullFacet,
    cameraFacet: foldCullCameraFacet,
    hidden: foldCullHidden,
    pools: foldCullPools.length,
  };
}

/* The whole limb is a small, fixed set of instanced material/primitive pools:
   each piece is positioned on the polyline and tinted by its facet's tone
   through the instance color (the same trick the tile bake uses for its
   checker). Hundreds of armour pieces would otherwise become hundreds of draw
   calls. The important property remains unchanged: the limb is uploaded once
   and never touched again. */

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _c = new THREE.Color();
const _tint = new THREE.Color();

/* A scute is an armour casting, not a stretched hexagonal log. The former
   CylinderGeometry gave every plate the same six corners and let its pale
   side faces occupy a large part of the silhouette, which is the cardboard
   row visible across the lower foreground. These three low-poly extrusions
   share the exact unit footprint/anchor but vary the clipped leading edge.
   Their vertex value is deliberately darkest on the back and bevels, so an
   overlap reads as a deep mechanical seam without another material or draw. */
const ARMOUR_OUTLINES = Object.freeze([
  // The upper shoulder stays broad enough to overlap its neighbour; the
  // lower edge breaks into a keel/notch rhythm so the chain cannot resolve
  // into one ruler-straight fascia band.
  Object.freeze([
    [-0.52, 0.43], [-0.31, 0.50], [0.16, 0.46], [0.44, 0.50],
    [0.52, 0.28], [0.46, -0.18], [0.29, -0.42], [0.08, -0.50],
    [-0.09, -0.29], [-0.38, -0.48], [-0.52, -0.18],
  ]),
  Object.freeze([
    [-0.50, 0.31], [-0.42, 0.50], [-0.02, 0.45], [0.28, 0.50],
    [0.51, 0.34], [0.48, -0.09], [0.34, -0.48], [0.03, -0.39],
    [-0.18, -0.50], [-0.31, -0.27], [-0.50, -0.42],
  ]),
  Object.freeze([
    [-0.51, 0.38], [-0.30, 0.49], [0.02, 0.42], [0.40, 0.50],
    [0.52, 0.23], [0.43, -0.32], [0.23, -0.50], [-0.02, -0.31],
    [-0.25, -0.48], [-0.47, -0.34],
  ]),
]);

function armourPlateGeometry(variant) {
  const outline = ARMOUR_OUTLINES[variant % ARMOUR_OUTLINES.length];
  const shape = new THREE.Shape();
  shape.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) shape.lineTo(outline[i][0], outline[i][1]);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 1,
    steps: 1,
    curveSegments: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.035,
    bevelThickness: 0.045,
  });
  geometry.translate(0, 0, -0.5);
  const normal = geometry.getAttribute('normal');
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(normal.count * 3);
  for (let i = 0; i < normal.count; i++) {
    const nz = normal.getZ(i), ny = normal.getY(i);
    const x = position.getX(i), y = position.getY(i);
    // A fixed upper-shoulder/lower-keel value split gives each casting its
    // own occlusion lip.  It is vertex paint on one boot-time geometry—not a
    // decal, runtime crop, transparent card or additional draw.
    const shoulder = Math.max(0, Math.min(1, (y + 0.46) / 0.92));
    const front = (0.70 + shoulder * 0.30) * (x < -0.12 ? 0.93 : 1);
    const gain = nz > 0.72 ? front
      : (nz < -0.72 ? 0.20 : (ny > 0.42 ? 0.68 : 0.38));
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = gain;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

/* A large casting needs an outline in the screen plane, not the regular
   silhouette of a stretched cylinder.  Extruding one deterministic polygon
   gives the front an uninterrupted textured surface while the bevel supplies
   dark contact occlusion at overlaps.  The extremes remain wider than the
   nominal unit footprint, so adjacent hull chunks overlap instead of opening
   sky cracks when the camera reaches a grazing angle. */
function mechanicalLobeGeometry(outline, bevelSize, bevelThickness, rootFade = false) {
  const shape = new THREE.Shape();
  shape.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) shape.lineTo(outline[i][0], outline[i][1]);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 1,
    steps: 1,
    curveSegments: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize,
    bevelThickness,
  });
  geometry.translate(0, 0, -0.5);
  const normal = geometry.getAttribute('normal');
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(normal.count * 3);
  for (let i = 0; i < normal.count; i++) {
    const nz = normal.getZ(i);
    const ny = normal.getY(i);
    const x = position.getX(i);
    const y = position.getY(i);
    // Front armour remains readable; back/side bevels become the contact seam.
    // A subtle left/right value split prevents a whole chain of lobes reading
    // as one flat wallpaper strip without adding a material or texture sample.
    let faceGain = nz > 0.72 ? (x < -0.05 ? 0.90 : 1.0)
      : (nz < -0.72 ? 0.20 : (ny > 0.42 ? 0.70 : 0.42));
    // Colossal under-deck hull lobes used to end in one ruler-straight black
    // cutout. Their roots now taper below the nominal footprint and grade
    // toward the blue-black body value before the viewport crops them. This
    // is fixed vertex paint on fixed geometry — no transparent sort, shader
    // branch, animation, or per-frame work.
    if (rootFade) {
      const root = Math.max(0, Math.min(1, (y + 0.72) / 0.78));
      faceGain *= 0.48 + root * 0.52;
    }
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = faceGain;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

// Three roots share an overlapping upper casting but break and taper below
// it at different positions. Hull chunks were already split into three
// texture buckets, so routing those existing buckets through three outlines
// adds no draw call and keeps the static instancing contract intact.
const BODY_OUTLINES = Object.freeze([
  Object.freeze([
    [-0.58, 0.28], [-0.54, 0.49], [-0.20, 0.54], [0.08, 0.49],
    [0.50, 0.54], [0.58, 0.29], [0.57, -0.30], [0.48, -0.52],
    [0.24, -0.59], [0.08, -0.76], [-0.12, -0.62], [-0.34, -0.82],
    [-0.55, -0.48], [-0.58, -0.28],
  ]),
  Object.freeze([
    [-0.59, 0.24], [-0.53, 0.50], [-0.12, 0.55], [0.14, 0.47],
    [0.49, 0.53], [0.59, 0.25], [0.56, -0.36], [0.42, -0.66],
    [0.18, -0.56], [-0.02, -0.84], [-0.24, -0.66], [-0.45, -0.72],
    [-0.57, -0.43],
  ]),
  Object.freeze([
    [-0.58, 0.30], [-0.55, 0.48], [-0.30, 0.55], [0.05, 0.48],
    [0.45, 0.54], [0.59, 0.30], [0.55, -0.42], [0.35, -0.75],
    [0.11, -0.64], [-0.10, -0.78], [-0.31, -0.57], [-0.52, -0.73],
    [-0.58, -0.31],
  ]),
]);

const MACRO_SCUTE_OUTLINE = Object.freeze([
  [-0.55, 0.14], [-0.47, 0.43], [-0.20, 0.52], [0.06, 0.45],
  [0.34, 0.52], [0.54, 0.28], [0.49, -0.10], [0.31, -0.46],
  [0.02, -0.52], [-0.18, -0.43], [-0.45, -0.50], [-0.56, -0.20],
]);

// (s, y, depth) → world, with the SHARP heading of the facet (or, for a joint
// piece, of the chamfer that bisects it) and the shared normal-run altitude.
// Same mapping the tile bake uses, so the armour and the deck are one rising
// body. Anatomy stays plumb; only floor-like geometry pitches with the grade.
function pieceMatrix(piece) {
  const p = polyAt(SEGS, piece.s);
  const yaw = headingAt(SEGS, piece.s);
  // Local Z roll is a rake in the path's (s,y) plane. This is how a static
  // scute/tendon points uphill even while the camera follows the helix grade.
  _q.setFromEuler(_e.set(0, yaw, piece.roll || 0, 'YZX'));
  _s.set(piece.w, piece.h, piece.d);
  _v.set(
    p.x + Math.sin(yaw) * piece.depth,
    piece.y + normalAscentAltAt(piece.s, CONFIG.levelLength),
    p.z + Math.cos(yaw) * piece.depth
  );
  return _m.compose(_v, _q, _s);
}

function bakeLimb() {
  // The air first: tighter than the shipped fog, because haze is what makes
  // the facet past the joint read as "the limb goes on" instead of "the next
  // level is over there". The band itself is set (and re-set on resize, with
  // the ?view= pull-back folded in) by ./camera.js.
  scene.background = new THREE.Color(PAL.limbBg);
  scene.fog.color.setHex(PAL.limbBg);

  const plan = limbBakePlan(CONFIG, groundH, { scale: SCALE_PASS });
  // One plan-level pass, before the buckets: the occlusion term is about what
  // is AROUND a piece, so it cannot be computed piece by piece — and with the
  // scale pass on, the pieces it is around now include T-045's backdrop tiers,
  // which is why this runs on whatever plan the flags produced rather than on
  // a fixed one.
  const shade = limbShadePlan(plan, CONFIG, SHADE_GAIN);
  const byBucket = new Map();                  // material/primitive → plan indices
  // A five-scute phrase uses the same five fixed pools the texture-variation
  // pass already required.  Two oxidized plates mark route direction; three
  // shadow-steel plates expose the underlying Meridian body.  Selecting the
  // material from the existing texture phase therefore breaks the pasted-on
  // brown belt without adding a mesh, texture, random source or per-frame
  // branch. Legacy remains byte-for-byte on MATERIAL_FOR.
  const SCUTE_MATERIAL_PHRASE = Object.freeze([
    'wall', 'scute', 'wall', 'wall', 'scute',
  ]);
  const PRODUCTION_SUBSTRATE_MATERIAL = Object.freeze({
    // Warm paint on these 13-tile ribs and 17-tile tendons turned them into
    // detached wooden planks laid over the creature. They now share the
    // existing shadow-steel hardpoint/cable pools; selected armour and the
    // route cap retain the oxidized navigation color.
    scuteRib: 'shadow', bodyRib: 'shadow', flankTendon: 'shadow',
  });
  for (let n = 0; n < plan.length; n++) {
    if (omitProductionPiece(plan[n])) continue;
    const piece = plan[n];
    const scutePhase = Math.abs(
      Math.floor(piece.s / CONFIG.limb.scute.every) + piece.facet * 2,
    ) % SCUTE_MATERIAL_PHRASE.length;
    const materialKey = LIMB_SILHOUETTE_PASS && piece.kind === 'scute'
      ? SCUTE_MATERIAL_PHRASE[scutePhase]
      : LIMB_SILHOUETTE_PASS && PRODUCTION_SUBSTRATE_MATERIAL[piece.kind]
        ? PRODUCTION_SUBSTRATE_MATERIAL[piece.kind]
        : MATERIAL_FOR[piece.kind] || 'hull';
    // Deterministic crops/orientations across only the broad painted armour
    // families. Foreground scutes get five crop phases because they form the
    // longest uninterrupted row in the frame; other families retain three.
    // The phase also selects one of three clipped scute outlines, so variety
    // costs only two draws over the prior three-pool scute path.
    const painted = materialKey === 'hull' || materialKey === 'wall' || materialKey === 'scute';
    const variantCount = piece.kind === 'scute' ? 5 : 3;
    const textureVariant = painted
      ? Math.abs(Math.floor(piece.s / CONFIG.limb.scute.every) + piece.facet * 2) % variantCount
      : 0;
    // Only the played limb's large foreground shingles get these castings.
    // Distant `bd*` masses retain their established low-detail silhouette.
    const plannedShape = piece.kind === 'scute'
      ? `armor${textureVariant % ARMOUR_OUTLINES.length}`
      : LIMB_SILHOUETTE_PASS
        ? SHAPE_FOR[piece.kind] || piece.shape || 'box'
        : piece.shape || SHAPE_FOR[piece.kind] || 'box';
    const shape = LIMB_SILHOUETTE_PASS && plannedShape === 'body'
      ? `body${textureVariant % BODY_OUTLINES.length}`
      : plannedShape;
    const bucketKey = materialKey + '/' + shape + '/' + textureVariant;
    if (!byBucket.has(bucketKey)) byBucket.set(bucketKey, {
      materialKey, shape, textureVariant, indices: [],
    });
    byBucket.get(bucketKey).indices.push(n);
  }
  const geometry = {
    box: new THREE.BoxGeometry(1, 1, 1),
    // Successive chunks remain faceted, but the lower radius now meets the
    // next chunk instead of shrinking to 80% of its spacing and exposing a
    // regular sky wedge through what should be one colossal limb.
    body: new THREE.CylinderGeometry(0.57, 0.51, 1, 6, 1, false),
    body0: mechanicalLobeGeometry(BODY_OUTLINES[0], 0.022, 0.035, true),
    body1: mechanicalLobeGeometry(BODY_OUTLINES[1], 0.022, 0.035, true),
    body2: mechanicalLobeGeometry(BODY_OUTLINES[2], 0.022, 0.035, true),
    // Cylinder height is local Y: different top/bottom radii make an armour
    // shingle with a broad root and clipped nose instead of another crate.
    scute: LIMB_SILHOUETTE_PASS
      ? mechanicalLobeGeometry(MACRO_SCUTE_OUTLINE, 0.030, 0.042)
      : new THREE.CylinderGeometry(0.58, 0.42, 1, 4, 1, false),
    armor0: armourPlateGeometry(0),
    armor1: armourPlateGeometry(1),
    armor2: armourPlateGeometry(2),
    rib: new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1, false),
    cable: new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1, false),
  };
  if (!LIMB_SILHOUETTE_PASS) {
    geometry.scute.rotateY(Math.PI / 4);
    geometry.body.rotateY(Math.PI / 6);
  }
  geometry.rib.rotateY(Math.PI / 6);
  geometry.cable.rotateZ(Math.PI / 2);          // cable length follows local s / X
  for (const { materialKey: key, shape, textureVariant, indices } of byBucket.values()) {
    // T-052: a surface family (roughness/metalness/envMap) plus, for the
    // buckets a large hull surface actually names, an albedo+bump tile —
    // both are no-ops (this stays the pre-T-052 flat white material) for
    // any family or texture that failed to resolve, by construction.
    const armourCasting = shape.startsWith('armor') ||
      (LIMB_SILHOUETTE_PASS && (shape.startsWith('body') || shape === 'scute'));
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      flatShading: true,
      vertexColors: armourCasting,
    });
    applySurface(material, SURFACE_FOR[key] || 'plate');
    applyHullTexture(material, key);
    varyHullTexture(material, textureVariant);
    // The route scutes sit flush with the collision tile face by design (they
    // must not claim extra depth). A tiny raster offset prevents coplanar
    // flicker without moving the geometry into the protected play volume.
    if (shape === 'scute') {
      material.polygonOffset = true;
      material.polygonOffsetFactor = -1;
      material.polygonOffsetUnits = -1;
    }
    const mesh = new THREE.InstancedMesh(geometry[shape], material, indices.length);
    mesh.name = `Meridian limb ${key}/${shape}/v${textureVariant}`;
    mesh.userData.environmentRole = 'limb-anatomy';
    mesh.userData.limbBucket = key;
    mesh.userData.limbShape = shape;
    mesh.userData.textureVariant = textureVariant;
    mesh.userData.limbSilhouette = LIMB_SILHOUETTE_PASS ? 'production' : 'legacy';
    mesh.frustumCulled = false;                // static bake, one upload
    for (let i = 0; i < indices.length; i++) {
      const piece = plan[indices[i]];
      mesh.setMatrixAt(i, pieceMatrix(piece));
      const tone = limbFacetTone(piece.facet, CONFIG);
      const k = shade[indices[i]];             // 1.0 exactly when the flag is off
      _c.setHex(BASE_COLORS[key]);
      mesh.setColorAt(i, _tint.setRGB(
        Math.min(1, _c.r * tone[0] * k),
        Math.min(1, _c.g * tone[1] * k),
        Math.min(1, _c.b * tone[2] * k)
      ));
    }
    foldCullPools.push({
      mesh,
      rows: indices.map((planIndex, instance) => ({ instance, piece: plan[planIndex] })),
    });
    // Keeps direct browser inspection/teleport captures honest even while the
    // sim is paused (the production loop also calls the same idempotent gate).
    mesh.onBeforeRender = updateLimbFoldCull;
    scene.add(mesh);
  }
  updateLimbFoldCull();
  return plan.length;
}

// The six-face run bakes this by default; ?zip=1 (and the fixtures, which
// author their own transitions) render the grey-box tower untouched.
export const limbPieces = IS_G1 ? bakeLimb() : 0;
