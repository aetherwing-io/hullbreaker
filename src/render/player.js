/* ======================= PLAYER RIG (VISUAL) ====================== */
/* RIG's body, gun pose, and i-frame flicker. Driven entirely by sim
   fields on the player row — the rig itself carries no gameplay state. */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { installView } from '../sim/bridge.js';
import { gameMs, blink } from '../sim/time.js';
import { player } from '../sim/player.js';
import { flowSnapshot } from '../sim/flow.js';
import { scene } from './scene.js';
import { placeOnTower } from './tower.js';
import { PAL } from './palette.js';
import { syncContactShadow } from './contact.js';

const rig = new THREE.Group();
{
  const mat = new THREE.MeshStandardMaterial({ color: PAL.player, flatShading: true });
  // slimmed ~12% in width/depth for the pulled-back camera; heights and the
  // 0.7 × 1.7 collision box unchanged
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.85, 0.4), mat);
  torso.position.y = 0.95;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.28), mat);
  head.position.y = 1.55;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.19), mat);
  legL.position.set(-0.12, 0.28, 0);
  const legR = legL.clone();
  legR.position.x = 0.12;
  rig.add(torso, head, legL, legR);
}
const gunGroup = new THREE.Group();
gunGroup.position.set(0, 1.05, 0.25);
const gun = new THREE.Mesh(
  new THREE.BoxGeometry(0.75, 0.14, 0.14),
  new THREE.MeshStandardMaterial({ color: PAL.gun, flatShading: true })
);
gun.position.x = 0.45;
gunGroup.add(gun);
rig.add(gunGroup);
scene.add(rig);

// T-039 (S6, contact shadows): RIG has exactly one row, for its whole
// lifetime — never spawned or removed the way a hostile/capsule is — so a
// stable module-level identity is all `syncContactShadow` needs; there is no
// matching release call (see src/render/contact.js's header note).
const RIG_SHADOW_ID = Symbol('rig-contact-shadow');
const RIG_FOOTPRINT = CONFIG.player.width / 2;

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
  // A live momentum chain (?flow=1) leans the body into its own speed: the
  // chain has to be visible in the character, not only in the HUD. Presentation
  // only, and exactly zero without the flag.
  const lean = flowSnapshot().mult - 1;
  rig.rotation.z = lean > 0 ? -Math.sign(player.vx || 1) * lean * 1.4 : 0;
  rig.visible = gameMs >= player.iframesUntil || blink();
  syncContactShadow(RIG_SHADOW_ID, player.x, player.y, RIG_FOOTPRINT);
}
installView({ player: { sync } });
