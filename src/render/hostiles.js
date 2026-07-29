/* ==================== HOSTILE / CORPSE MESHES ===================== */
/* Mock-3D presence: enemies materialize out of the tower depth, breathe
   on the depth axis while alive, flash on hits, and dissolve back as
   display-only corpses. Every value is derived from the sim row; meshes
   are held in this module's map, never on the sim object. */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { installView } from '../sim/bridge.js';
import { gameMs } from '../sim/time.js';
import { scene } from './scene.js';
import { placeOnTower } from './tower.js';

const waspGeo = new THREE.OctahedronGeometry(CONFIG.wasp.visualRadius);
const carrierGeo = new THREE.BoxGeometry(...CONFIG.carrier.size);

// per-kind look, keyed by the same kind rows as ENEMY in src/sim/hostiles.js
const LOOK = {
  wasp:    { geo: waspGeo,    color: CONFIG.palette.wasp },
  carrier: { geo: carrierGeo, color: CONFIG.palette.carrier },
};
const meshes = new Map();                // sim hostile row → { mesh, mat }

function spawned(e) {
  const K = LOOK[e.kind];
  const mat = new THREE.MeshStandardMaterial({
    color: K.color, flatShading: true, transparent: true, opacity: 0,
  });
  const mesh = new THREE.Mesh(K.geo, mat);
  mesh.visible = false;                    // hidden until its materialization begins
  scene.add(mesh);
  meshes.set(e, { mesh, mat });
}

function removed(e, fade) {
  const v = meshes.get(e);
  if (!v) return;
  meshes.delete(e);
  if (fade) {                            // hand the mesh to the corpse pass to dissolve
    corpses.push({ mesh: v.mesh, mat: v.mat, s: e.x, y: e.y, spin: e.t, t0: gameMs });
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
    return;
  }
  v.mesh.visible = true;
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
  v.mat.emissive.setHex(gameMs < e.flashUntil ? 0xffffff : 0x000000);
  placeOnTower(v.mesh, e.x, e.y, depth);
  v.mesh.rotation.z = e.kind === 'carrier'
    ? Math.sin(e.t * CONFIG.carrier.rollFreq) * CONFIG.carrier.rollAmp
    : e.t * 2;
  v.mesh.scale.setScalar(scale);
}

installView({ hostiles: { spawned, removed, sync } });

// Dead hostiles are display-only: no sim, no gate participation (removeHostile
// already fired onHostileRemoved), just the dissolve back into tower depth.
const corpses = [];
export function updateCorpses() {
  const W = CONFIG.wasp;
  for (let i = corpses.length - 1; i >= 0; i--) {
    const c = corpses[i];
    const u = (gameMs - c.t0) / W.dieMs;
    if (u >= 1) { scene.remove(c.mesh); c.mat.dispose(); corpses.splice(i, 1); continue; }
    placeOnTower(c.mesh, c.s, c.y - 0.6 * u, W.dieDepth * u * u);   // recede into the dark
    c.mesh.rotation.z = c.spin + u * 9;           // death tumble
    c.mesh.scale.setScalar(1 + 0.3 * u);
    c.mat.opacity = 1 - u * u;
    c.mat.emissive.setHex(u < 0.16 ? 0xffffff : 0x000000);   // death pop, then dissolve
  }
}

// run reset (resetGame in src/main.js): drop any dissolving corpses
export function clearCorpses() {
  for (const c of corpses) { scene.remove(c.mesh); c.mat.dispose(); }
  corpses.length = 0;
}
