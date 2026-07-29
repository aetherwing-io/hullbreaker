/* ======================== RENDERER / SCENE ======================== */
/* The one renderer, scene, camera, and light rig. Every other render
   module adds meshes to this scene; the simulation never sees it. */

import * as THREE from 'three';
import { CONFIG } from '../config.js';

export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

export const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.palette.bg);
scene.fog = new THREE.Fog(CONFIG.palette.bg, CONFIG.fog.near, CONFIG.fog.far);

export const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, innerWidth / innerHeight, 0.1, 200);

export const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);   // shared "invisible instance" matrix

const hemi = new THREE.HemisphereLight(0xcfd8e3, 0x3a3f46, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(6, 12, 8);
scene.add(sun);
