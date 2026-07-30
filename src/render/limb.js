/* ========================= LIMB: THE LEG ========================== */
/* The rendered half of the G1 limb-turn experiment (?g1=1): the six-face
   tower baked as one static, faceted creature limb — armour skin under the
   deck, the body rising behind the combat plane, and a tendon joint at
   every corner.

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
import { IS_G1 } from '../mode.js';
import { groundH } from '../sim/level.js';
import { scene } from './scene.js';

const PAL = CONFIG.palette;

// Grey-box palette, one value ladder: the deck (CONFIG.palette.ground) stays
// the brightest thing on screen, and the limb reads as mass around it.
// Values are chosen against what the renderer actually PRODUCES, not against
// the hex codes: with this light rig plus ACES tone mapping a lit face lands at
// roughly 0.45x its albedo, while scene.background/fog is drawn raw. The deck
// (palette.ground, ~0.48x) has to stay the brightest large surface and the haze
// (CONFIG.limb.bg) has to sit just above it, so the limb's own armour is
// authored a notch under the deck instead of the two notches that read as black.
const BASE_COLORS = {
  hull: 0x5f656e, wall: 0x646a73, rib: 0x7b818a, machine: 0x868c95,
  shadow: 0x4b515a,                      // seam lines: shadow, never structure
  scute: 0x6a707a, scuteAlt: 0x747a84, skyline: 0x505a67, accent: PAL.gun,
};

// kind → material. Joint pieces deliberately use the brighter `rib`/`machine`
// end of the ladder: the joint is the landmark the orbit is about.
const MATERIAL_FOR = {
  hull: 'hull', hullRib: 'shadow', wall: 'wall', wallSeam: 'shadow', wallCap: 'shadow',
  scute: 'scute', scuteRib: 'scuteAlt', silhouette: 'skyline',
  ridge: 'rib', collar: 'wall', tendon: 'shadow', buttress: 'wall', cup: 'rib',
};

function facetMaterials(tone) {
  const out = {};
  const c = new THREE.Color();
  for (const [key, hex] of Object.entries(BASE_COLORS)) {
    c.setHex(hex);
    out[key] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(
        Math.min(1, c.r * tone[0]), Math.min(1, c.g * tone[1]), Math.min(1, c.b * tone[2])
      ),
      flatShading: true,
    });
  }
  return out;
}

// (s, y, depth) → world, with the SHARP heading of the facet (or, for a joint
// piece, of the chamfer that bisects it). Same mapping the tile bake uses, so
// the armour and the deck are the same body.
function placePiece(mesh, s, y, depth) {
  const p = polyAt(SEGS, s);
  const yaw = headingAt(SEGS, s);
  mesh.position.set(p.x + Math.sin(yaw) * depth, y, p.z + Math.cos(yaw) * depth);
  mesh.rotation.y = yaw;
}

function bakeLimb() {
  // The air first: tighter than the shipped fog, because haze is what makes
  // the facet past the joint read as "the limb goes on" instead of "the next
  // level is over there". The band itself is set (and re-set on resize, with
  // the ?view= pull-back folded in) by ./camera.js.
  scene.background = new THREE.Color(CONFIG.limb.bg);
  scene.fog.color.setHex(CONFIG.limb.bg);

  const plan = limbBakePlan(CONFIG, groundH);
  const materials = new Map();                 // facet → material set
  const group = new THREE.Group();             // identity: children are in world
  scene.add(group);
  for (const piece of plan) {
    if (!materials.has(piece.facet))
      materials.set(piece.facet, facetMaterials(limbFacetTone(piece.facet, CONFIG)));
    const M = materials.get(piece.facet);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(piece.w, piece.h, piece.d),
      M[MATERIAL_FOR[piece.kind] || 'hull']
    );
    placePiece(mesh, piece.s, piece.y, piece.depth);
    group.add(mesh);
  }
  return plan.length;
}

// Only ?g1=1 bakes any of this; every other run mode renders the shipped
// grey-box tower untouched.
export const limbPieces = IS_G1 ? bakeLimb() : 0;
