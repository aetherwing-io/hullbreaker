/* ==================== MODIFIER PRESENTATION ======================= */
/* GHOST SQUAD clones, the ORBITAL LANCE telegraph beam, and the screen
   tint. All three are read models: the sim resolves which trail sample a
   clone stands on and when the strike lands, this module draws it. */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { installView } from '../sim/bridge.js';
import { gameMs } from '../sim/time.js';
import { mods } from '../sim/mods.js';
import { resetTint, setTint } from '../ui/tint.js';
import { scene } from './scene.js';
import { placeOnTower } from './tower.js';

const cloneMeshes = CONFIG.mods.ghostDelayMs.map(() => {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 1.5, 0.4),
    new THREE.MeshBasicMaterial({ color: CONFIG.palette.player, transparent: true, opacity: 0.32 })
  );
  m.visible = false;
  scene.add(m);
  return m;
});

const lanceBeam = new THREE.Mesh(
  new THREE.BoxGeometry(0.35, 16, 0.35),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })
);
lanceBeam.visible = false;
scene.add(lanceBeam);

function sync() {
  // ghost squad: each clone stands on the delayed trail sample the sim picked
  if (mods.clonesVisible) {
    for (let d = 0; d < cloneMeshes.length; d++) {
      const p = mods.cloneTrail[d];
      if (!p) continue;
      const cm = cloneMeshes[d];
      cm.visible = true;
      placeOnTower(cm, p.x, p.y + 0.85, 0);
    }
  } else {
    for (const cm of cloneMeshes) cm.visible = false;
  }

  // the telegraph beam is drawn by lanceTelegraph below, while a lance is
  // armed; once the strike lands (or a teardown clears it) the beam goes away
  if (!mods.lance) lanceBeam.visible = false;

  // screen tint: lance flash > rage red > chrono blue
  const T = CONFIG.palette.tints;
  let tint = 'transparent';
  if (gameMs < mods.lanceFlashUntil) tint = T.lance;
  else if (gameMs < mods.rageUntil) tint = T.rage;
  else if (gameMs < mods.chronoUntil) tint = T.chrono;
  setTint(tint);
}

// orbital lance telegraph: called while the lance is armed, at the same point
// in the frame the single-file build drew it
function lanceTelegraph(L) {
  lanceBeam.visible = true;
  placeOnTower(lanceBeam, L.s, 8, 0);
  lanceBeam.material.opacity = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(gameMs / 40));
}

// clearMods teardown: clones and beam off, tint back to transparent
function cleared() {
  lanceBeam.visible = false;
  for (const cm of cloneMeshes) cm.visible = false;
  resetTint();
}

installView({ mods: { sync, cleared, lanceTelegraph } });
