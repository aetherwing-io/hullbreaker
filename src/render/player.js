/* ======================= PLAYER RIG (VISUAL) ====================== */
/* RIG's body, gun pose, and i-frame flicker. Driven entirely by sim
   fields on the player row — the rig itself carries no gameplay state. */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { installView } from '../sim/bridge.js';
import { gameMs, blink } from '../sim/time.js';
import { player } from '../sim/player.js';
import { scene } from './scene.js';
import { placeOnTower } from './tower.js';

const rig = new THREE.Group();
{
  const mat = new THREE.MeshStandardMaterial({ color: CONFIG.palette.player, flatShading: true });
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
  new THREE.MeshStandardMaterial({ color: CONFIG.palette.gun, flatShading: true })
);
gun.position.x = 0.45;
gunGroup.add(gun);
rig.add(gunGroup);
scene.add(rig);

// called at the end of updatePlayer, where the single-file build placed the rig
function sync() {
  placeOnTower(rig, player.x, player.y, 0);
  gunGroup.rotation.z = Math.atan2(player.aim.y, player.aim.x);
  rig.visible = gameMs >= player.iframesUntil || blink();
}
installView({ player: { sync } });
