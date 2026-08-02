/* ======================= PLAYER RIG (VISUAL) ====================== */
/* RIG's body, gun pose, and i-frame flicker. Driven entirely by sim
   fields on the player row — the rig itself carries no gameplay state.

   T-040: the box list (body geometry + the gun's own box) is data in
   src/pure/rig.js, not literals here, so pathcheck can gate the silhouette
   ENVELOPE headlessly instead of trusting review. Three value zones ride
   the same table — see src/pure/rig.js's header for the zone grammar and
   the adversarial-review correction about the gun's swept reach. */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { installView } from '../sim/bridge.js';
import { gameMs, blink } from '../sim/time.js';
import { player } from '../sim/player.js';
import { flowSnapshot } from '../sim/flow.js';
import { RIG_BOXES, GUN_BOX } from '../pure/rig.js';
import { scene } from './scene.js';
import { placeOnTower } from './tower.js';
import { PAL } from './palette.js';

const rig = new THREE.Group();
{
  // one material per value zone, shared across every box that carries it —
  // still one draw call per Mesh, so three shared materials cost nothing
  // extra over the single shared material this replaces
  const zoneMat = {
    bright: new THREE.MeshStandardMaterial({ color: PAL.player, flatShading: true }),
    dark: new THREE.MeshStandardMaterial({ color: PAL.playerDark, flatShading: true }),
    mid: new THREE.MeshStandardMaterial({ color: PAL.playerMid, flatShading: true }),
  };
  // slimmed ~12% in width/depth for the pulled-back camera (pre-T-040 note,
  // still true of every box below); heights and the 0.7 × 1.7 collision box
  // unchanged — src/pure/rig.js's envelope check binds to that box, not this
  // file, so nothing here can silently drift outside it.
  for (const b of RIG_BOXES) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), zoneMat[b.zone]);
    mesh.position.set(b.x, b.y, b.z);
    rig.add(mesh);
  }
}
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
  // A live momentum chain (?flow=1) leans the body into its own speed: the
  // chain has to be visible in the character, not only in the HUD. Presentation
  // only, and exactly zero without the flag.
  const lean = flowSnapshot().mult - 1;
  rig.rotation.z = lean > 0 ? -Math.sign(player.vx || 1) * lean * 1.4 : 0;
  rig.visible = gameMs >= player.iframesUntil || blink();
}
installView({ player: { sync } });
