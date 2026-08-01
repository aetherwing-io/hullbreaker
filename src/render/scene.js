/* ======================== RENDERER / SCENE ======================== */
/* The one renderer, scene, camera, and light rig. Every other render
   module adds meshes to this scene; the simulation never sees it. */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { PAL } from './palette.js';

export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

export const scene = new THREE.Scene();
// fog matched to background, by construction: both come from the one token
scene.background = new THREE.Color(PAL.bg);
scene.fog = new THREE.Fog(PAL.bg, CONFIG.fog.near, CONFIG.fog.far);

export const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, innerWidth / innerHeight, 0.1, 200);

export const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);   // shared "invisible instance" matrix

const hemi = new THREE.HemisphereLight(PAL.hemiSky, PAL.hemiGround, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(PAL.sun, 1.6);
sun.position.set(6, 12, 8);
scene.add(sun);
