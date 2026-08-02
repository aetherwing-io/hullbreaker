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
import { SEGS, headingAt, polyAt } from '../pure/path.js';
import { limbBakePlan, limbFacetTone } from '../pure/limb.js';
import { IS_G1, QUERY } from '../mode.js';
import { groundH } from '../sim/level.js';
import { scene } from './scene.js';
import { PAL } from './palette.js';

// One value ladder from the palette module (concept teal/rust by default,
// grey-box via ?palette=classic): the deck (PAL.ground) stays the brightest
// thing on screen, and the limb reads as mass around it. Values are chosen
// against what the renderer actually PRODUCES, not against the hex codes:
// with this light rig plus ACES tone mapping a lit face lands at roughly
// 0.45x its albedo, while scene.background/fog is drawn raw. The deck
// (PAL.ground, ~0.48x) has to stay the brightest large surface and the haze
// (PAL.limbBg) has to sit just above it, so the limb's own armour is
// authored a notch under the deck instead of the two notches that read as black.
const BASE_COLORS = PAL.limb;

// kind → material. Joint pieces deliberately use the brighter `rib`/`machine`
// end of the ladder: the joint is the landmark the orbit is about.
//
// THE SCALE PASS ADDS NO MATERIAL (T-045). Every new kind below maps onto one
// of the eight keys that were already here, so the limb still bakes in eight
// instanced draws and the pass costs ZERO draw calls — the budget for it was
// +1 to +2. What separates the tiers instead is the haze ladder plus the
// palette's own body/backdrop split: the sister limb wears the RUST body
// tokens (it is another arm of the same creature, board 10), the drums wear
// the teal shadow-steel of structure behind the plane, and the far body wears
// `skyline`. Warm near, cool far, is what atmospheric perspective IS.
const MATERIAL_FOR = {
  hull: 'hull', hullRib: 'shadow', wall: 'wall', wallSeam: 'shadow', wallCap: 'shadow',
  kerb: 'machine', scute: 'scute', scuteRib: 'scuteAlt', silhouette: 'skyline',
  ridge: 'rib', collar: 'wall', tendon: 'shadow', buttress: 'wall', cup: 'rib',
  // tier 1: the sister limb, in the body's own rust — but one notch off the
  // played limb's brightest metal on purpose. `machine` on the lip made the
  // backdrop limb the brightest edge in the frame, which reads as NEAR.
  bdLimb: 'hull', bdLimbLip: 'rib', bdRing: 'scute',
  // tier 2 / tier 3: structure and distance, in teal
  bdDrum: 'wall', bdLink: 'shadow', bdFar: 'skyline', bdSpire: 'skyline',
  // human-scale reference objects: fixtures, so the brightest metal in the
  // ladder — a rung that reads as a shadow is not a reference object
  markRung: 'machine', markStile: 'machine', markRail: 'machine', markPost: 'machine',
  markRim: 'rib', markPanel: 'shadow',
};

/* THE SCALE PASS (T-045), ON BY DEFAULT — decisions.md entry 16 ("ship
   improvements ON by default once the operator has judged them"; the blanket
   off-by-default flag rule is retired) plus entry 17, which makes selling the
   scale of the creature the headline art problem rather than RIG's pixel
   count. ?scale=0 is the escape hatch and the A/B: it restores the two
   `CONFIG.limb.silhouette` slabs — the build the operator has been looking
   at — so a before/after is one URL apart in the same build.

   Deliberately NOT named after ?view=: that flag is the camera pull-back
   (CONFIG.viewScales), which entry 17 froze at FAR forever. This one is about
   what the frame around the tiny figure contains. */
const SCALE_PASS = QUERY.get('scale') !== '0';

/* The whole limb is ONE instanced draw per material: a unit box scaled per
   piece, positioned on the polyline, and tinted by its facet's tone through
   the instance color (the same trick the tile bake uses for its checker). ~800
   armour pieces would otherwise be ~800 draw calls, which is free on a GPU and
   very much not free on a software rasteriser — and it buys the property that
   matters here anyway: the limb is uploaded once and never touched again. */

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _c = new THREE.Color();
const _tint = new THREE.Color();

// (s, y, depth) → world, with the SHARP heading of the facet (or, for a joint
// piece, of the chamfer that bisects it). Same mapping the tile bake uses, so
// the armour and the deck are the same body.
function pieceMatrix(piece) {
  const p = polyAt(SEGS, piece.s);
  const yaw = headingAt(SEGS, piece.s);
  _q.setFromEuler(_e.set(0, yaw, 0));
  _s.set(piece.w, piece.h, piece.d);
  _v.set(p.x + Math.sin(yaw) * piece.depth, piece.y, p.z + Math.cos(yaw) * piece.depth);
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
  const byMaterial = new Map();                // material key → pieces
  for (const piece of plan) {
    const key = MATERIAL_FOR[piece.kind] || 'hull';
    if (!byMaterial.has(key)) byMaterial.set(key, []);
    byMaterial.get(key).push(piece);
  }
  const geo = new THREE.BoxGeometry(1, 1, 1);
  for (const [key, pieces] of byMaterial) {
    const mesh = new THREE.InstancedMesh(
      geo,
      new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true }),
      pieces.length
    );
    mesh.frustumCulled = false;                // static bake, one upload
    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i];
      mesh.setMatrixAt(i, pieceMatrix(piece));
      const tone = limbFacetTone(piece.facet, CONFIG);
      _c.setHex(BASE_COLORS[key]);
      mesh.setColorAt(i, _tint.setRGB(
        Math.min(1, _c.r * tone[0]), Math.min(1, _c.g * tone[1]), Math.min(1, _c.b * tone[2])
      ));
    }
    scene.add(mesh);
  }
  return plan.length;
}

// The six-face run bakes this by default; ?zip=1 (and the fixtures, which
// author their own transitions) render the grey-box tower untouched.
export const limbPieces = IS_G1 ? bakeLimb() : 0;
