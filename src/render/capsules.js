/* ====================== CAPSULE MESHES ============================ */
/* Lettered pickup boxes: one shared geometry, a cached canvas texture per
   letter, and the expiry blink for capsules knocked out of the player. */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { installView } from '../sim/bridge.js';
import { gameMs, blink } from '../sim/time.js';
import { CAP } from '../sim/capsules.js';
import { scene } from './scene.js';
import { placeOnTower } from './tower.js';

const capsuleGeo = new THREE.BoxGeometry(CAP.size, CAP.size, CAP.size);   // shared: never disposed
const letterTexCache = {};

function letterTexture(text, bg) {
  const key = text + '|' + bg;
  if (letterTexCache[key]) return letterTexCache[key];
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#14181e';
  g.font = 'bold ' + (text.length > 1 ? 30 : 42) + 'px monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 32, 35);
  const tex = new THREE.CanvasTexture(cv);
  letterTexCache[key] = tex;
  return tex;
}

const meshes = new Map();                // sim capsule row → { mesh, mat }

function spawned(c) {
  const kind = c.kind, letter = c.letter;
  const bg = kind === 'mod' ? CONFIG.palette.modCapsule : CONFIG.palette.capsule;
  const mat = new THREE.MeshBasicMaterial({ map: letterTexture(letter, bg) });
  const mesh = new THREE.Mesh(capsuleGeo, mat);
  scene.add(mesh);
  meshes.set(c, { mesh, mat });
}

function removed(c) {
  const v = meshes.get(c);
  if (!v) return;
  meshes.delete(c);
  scene.remove(v.mesh);
  v.mat.dispose();
}

function sync(c) {
  const v = meshes.get(c);
  if (!v) return;
  // expiring pop-capsules blink through their last stretch
  v.mesh.visible = c.mode !== 'pop' || c.dieAt - gameMs > CAP.blinkLastMs || blink();
  placeOnTower(v.mesh, c.x, c.y, 0);
  v.mesh.rotation.y += c.t * 2.2;               // pickup twirl on top of face yaw
}

installView({ capsules: { spawned, removed, sync } });
