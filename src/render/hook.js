/* ====================== HOOK ANCHORS + TETHER ===================== */
/* Grey-box presentation for the snap hook (?hook=1): a marked bracket at
   every authored anchor, a brighter one when it is the anchor you would grab,
   and a taut line while the tether holds. Nothing here decides anything — the
   sim (src/sim/hook.js) owns the verb and this module only reads it, so a
   headless run and a played run take identical paths.

   Loaded unconditionally by src/main.js; builds nothing at all when the flag
   is off, which is why an ordinary URL cannot tell this file exists. */

import * as THREE from 'three';
import { installView } from '../sim/bridge.js';
import { blink } from '../sim/time.js';
import { player } from '../sim/player.js';
import { hookAnchors, hookEnabled, hookSnapshot, hookTether } from '../sim/hook.js';
import { CONFIG } from '../config.js';
import { scene } from './scene.js';
import { placeOnTower } from './tower.js';

const anchorMeshes = [];
let tether = null;

if (hookEnabled()) {
  // A clearly marked bracket: DESIGN requires a new player to recognize a valid
  // anchor without stopping to aim, so the marker is loud and identical
  // everywhere. Ring + stub, warm like the gun so it reads as "grabbable
  // hardware" rather than a pickup (magenta) or a hostile (acid green).
  const ringGeo = new THREE.TorusGeometry(0.42, 0.09, 6, 12);
  const stubGeo = new THREE.BoxGeometry(0.16, 0.5, 0.16);
  for (const a of hookAnchors()) {
    const mat = new THREE.MeshStandardMaterial({
      color: CONFIG.palette.hookAnchor, flatShading: true,
    });
    const group = new THREE.Group();
    const ring = new THREE.Mesh(ringGeo, mat);
    const stub = new THREE.Mesh(stubGeo, mat);
    stub.position.y = 0.42;
    group.add(ring, stub);
    scene.add(group);
    anchorMeshes.push({ anchor: a, group, mat });
  }
  const tetherMat = new THREE.MeshBasicMaterial({ color: CONFIG.palette.hookTether });
  // unit-length box along +Y, scaled and rotated per frame into the line
  tether = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1, 0.08), tetherMat);
  tether.visible = false;
  scene.add(tether);
}

const LIVE_SCALE = 1.35;

function sync() {
  if (!tether) return;
  const snap = hookSnapshot();
  for (const m of anchorMeshes) {
    const live = snap.acquirable === m.anchor.id;
    const held = snap.anchorId === m.anchor.id;
    placeOnTower(m.group, m.anchor.x, m.anchor.y, 0);
    const s = held ? LIVE_SCALE : live ? (blink(140) ? LIVE_SCALE : 1.15) : 1;
    m.group.scale.setScalar(s);
    m.mat.color.set(held || live ? CONFIG.palette.hookLive : CONFIG.palette.hookAnchor);
  }
  const t = hookTether(player);
  if (!t) { tether.visible = false; return; }
  // Place the line's midpoint on the tower ribbon and rotate it in the face
  // plane — the sim is 2D, so a tether is a 2D segment lifted onto the face.
  const mx = (t.x0 + t.x1) / 2, my = (t.y0 + t.y1) / 2;
  const dx = t.x1 - t.x0, dy = t.y1 - t.y0;
  const len = Math.max(0.05, Math.hypot(dx, dy));
  placeOnTower(tether, mx, my, 0.05);
  tether.scale.set(1, len, 1);
  // ASSIGN the in-face tilt, never rotateZ(): placeOnTower writes rotation.y
  // and leaves z alone, so an incremental rotate compounds every frame and the
  // line visibly drifts off the anchor (caught in a browser screenshot). With
  // Euler order XYZ, z is applied inside the yawed face frame, which is exactly
  // the plane the 2D sim lives in.
  tether.rotation.z = Math.atan2(dy, dx) - Math.PI / 2;
  tether.visible = true;
}

installView({ hook: { sync } });
