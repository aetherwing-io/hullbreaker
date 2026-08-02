/* ======================= PLAYER RIG (VISUAL) ====================== */
/* RIG's body, gun pose, and i-frame flicker. Driven entirely by sim
   fields on the player row — the rig itself carries no gameplay state.

   T-040 REWORK: the operator rejected the six-box/three-zone pass ("this is
   RIG? i was hoping for a much higher quality asset in line with the
   concept art") — at RIG's frozen ~30px on-screen height (decisions.md
   entry 7) more geometry cannot read, so this draws him instead: a small
   set of plain shapes (src/pure/rig.js's HELMET/TORSO/LEG_FRONT/LEG_BACK)
   rasterized once into a CanvasTexture (sanctioned technique, precedent at
   src/render/capsules.js's faceTexture) and mapped onto one billboard-style
   plane. The gun stays the small 3D box it always was — untouched by this
   rework, still swept through 8-way aim every frame below. */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { installView } from '../sim/bridge.js';
import { gameMs, blink } from '../sim/time.js';
import { player } from '../sim/player.js';
import { flowSnapshot } from '../sim/flow.js';
import {
  CANVAS_H, CANVAS_W, GUN_BOX, HELMET, LEG_BACK, LEG_FRONT, SPRITE_H, SPRITE_W, TORSO, VISOR,
} from '../pure/rig.js';
import { scene } from './scene.js';
import { placeOnTower } from './tower.js';
import { PAL } from './palette.js';

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

// Traces one of src/pure/rig.js's polygons onto the current 2D context,
// scaled to (w, h). A function rather than a stored path: Canvas2D paths
// are consumed by fill/clip/stroke in ways that are easiest to reason about
// by just re-tracing before each use.
function tracePoly(g, points, w, h) {
  g.beginPath();
  g.moveTo(points[0][0] * w, points[0][1] * h);
  for (let i = 1; i < points.length; i++) g.lineTo(points[i][0] * w, points[i][1] * h);
  g.closePath();
}

function traceEllipse(g, e, w, h) {
  g.beginPath();
  g.ellipse(e.x * w, e.y * h, e.rx * w, e.ry * h, 0, 0, Math.PI * 2);
}

/* Rasterizes RIG from src/pure/rig.js's shapes into a canvas: legs (mid),
   torso (dark, its own back-side pack bulge baked into the shape), helmet
   (mid), one accent visor. FLAT fills only — an earlier pass here tried a
   soft value-lift gradient and a thin rim-light/ink-outline stroke, and
   NEITHER survived the GPU's own minification down to RIG's true ~12px
   width: a stroke or gradient band that is only a couple of canvas texels
   wide is already sub-pixel once minified that far, so it blends away to
   nothing instead of reading as a separate feature (see reports/tasks/
   T-040/build.md's iteration log — caught by sampling actual on-screen
   pixels, not by trusting the flat 2D debug dump). What DOES survive
   minification is a BROAD, single-flat-color region occupying a real
   fraction of the figure's width — so every zone below is one flat fill,
   sized generously, and the shape's own silhouette (helmet dome, the
   pack's back bulge, two independently-posed legs) carries the "crafted"
   read instead of fine linework. Built once at module load — RIG has
   exactly one instance for the whole run (T-039's precedent note on
   src/render/contact.js applies here too), so there is no per-frame or
   per-instance redraw. */
function paintRigTexture() {
  const cv = document.createElement('canvas');
  cv.width = CANVAS_W;
  cv.height = CANVAS_H;
  const g = cv.getContext('2d');
  const w = CANVAS_W, h = CANVAS_H;
  const dark = hex(PAL.playerDark), mid = hex(PAL.playerMid), accent = hex(PAL.gun);

  g.fillStyle = mid;
  tracePoly(g, LEG_BACK, w, h); g.fill();
  tracePoly(g, LEG_FRONT, w, h); g.fill();

  g.fillStyle = dark;
  tracePoly(g, TORSO, w, h); g.fill();

  g.fillStyle = mid;
  traceEllipse(g, HELMET, w, h); g.fill();

  // the one accent: a warm visor glint on the helmet's front-lower face
  g.fillStyle = accent;
  g.beginPath();
  g.ellipse(VISOR.x * w, VISOR.y * h, VISOR.rx * w, VISOR.ry * h, 0, 0, Math.PI * 2);
  g.fill();

  const tex = new THREE.CanvasTexture(cv);
  return tex;
}

const rig = new THREE.Group();
const bodyMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(SPRITE_W, SPRITE_H),
  // MeshStandardMaterial (LIT), not Basic: palette.js's own header note says
  // every token here is authored against what the light rig + ACES tone
  // mapping PRODUCES, not the raw hex — an unlit material feeds the canvas's
  // raw RGB straight into that tone curve with no lighting attenuation
  // first, and at these values ACES's midtone compression washes dark and
  // mid almost to the same near-white (measured on screen: confirmed with
  // ?view=near, not just the shipped FAR distance, which ruled out a
  // minification artifact — see reports/tasks/T-040/build.md's iteration
  // log). MeshStandardMaterial gets the same light-rig attenuation every
  // other mesh here does, which is exactly what playerDark/playerMid were
  // calibrated against in the first place.
  // transparent BLENDING, not an alphaTest cutout: at RIG's tiny on-screen
  // size the GPU's own mipmapping blurs the texture's alpha edges hard
  // enough that a 0.5 cutoff discarded almost the whole shape, leaving a
  // paper-thin sliver (same iteration log).
  new THREE.MeshStandardMaterial({ map: paintRigTexture(), transparent: true, side: THREE.DoubleSide }),
);
// feet at y=0 (the deck RIG stands on), matching every other mesh here
bodyMesh.position.set(0, SPRITE_H / 2, 0);
rig.add(bodyMesh);

const gunGroup = new THREE.Group();
gunGroup.position.set(0, 1.05, 0.25);
const gun = new THREE.Mesh(
  new THREE.BoxGeometry(GUN_BOX.w, GUN_BOX.h, GUN_BOX.d),
  new THREE.MeshStandardMaterial({ color: PAL.gun, flatShading: true })
);
gun.position.set(GUN_BOX.x, GUN_BOX.y, GUN_BOX.z);
gunGroup.add(gun);
rig.add(gunGroup);
scene.add(rig);

// called at the end of updatePlayer, where the single-file build placed the rig
function sync() {
  placeOnTower(rig, player.x, player.y, 0);
  // crouch (?crouch=1) has to be visible or the lowered firing line is a
  // mystery: the body squashes to the crouched collision height and the gun
  // drops with the muzzle the sim is actually firing from.
  const squash = player.crouched ? CONFIG.crouch.height / CONFIG.player.height : 1;
  rig.scale.y = squash;
  gunGroup.position.y = player.muzzleY / squash;    // rig is squashed: undo it here
  gunGroup.rotation.z = Math.atan2(player.aim.y, player.aim.x);
  // the silhouette is authored facing +x (SILHOUETTE's own convention, see
  // src/pure/rig.js) — mirror the plane when the sim's own facing flips, the
  // same sign CONFIG.player.aim already uses, so the drawn pose (front leg,
  // pack) never points the wrong way while running left
  bodyMesh.scale.x = player.facing < 0 ? -1 : 1;
  // A live momentum chain (?flow=1) leans the body into its own speed: the
  // chain has to be visible in the character, not only in the HUD. Presentation
  // only, and exactly zero without the flag.
  const lean = flowSnapshot().mult - 1;
  rig.rotation.z = lean > 0 ? -Math.sign(player.vx || 1) * lean * 1.4 : 0;
  rig.visible = gameMs >= player.iframesUntil || blink();
}
installView({ player: { sync } });
