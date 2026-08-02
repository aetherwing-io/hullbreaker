/* ======================== RENDERER / SCENE ======================== */
/* The one renderer, scene, and camera. Every other render module adds meshes
   to this scene; the simulation never sees it.

   The light rig moved to ./lights.js (+ ./lightrig.js for its descriptors and
   arithmetic) when decisions.md entry 18 authorized a real one: a key, a
   fill, a rim, a shadow map fitted to the play band, and exposure. It is
   still exactly one rig, installed from exactly one place — here, one line
   after the scene exists, and before any other module can add a mesh, which
   is what lets it decide what each mesh does with light without reaching
   into a dozen lane-owned files. ?light=flat restores the pre-T-047 rig. */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { PAL } from './palette.js';
import { installLightRig } from './lights.js';

export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

export const scene = new THREE.Scene();
// fog matched to background, by construction: both come from the one token
scene.background = new THREE.Color(PAL.bg);
scene.fog = new THREE.Fog(PAL.bg, CONFIG.fog.near, CONFIG.fog.far);

export const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, innerWidth / innerHeight, 0.1, 200);

export const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);   // shared "invisible instance" matrix

installLightRig(renderer, scene);
