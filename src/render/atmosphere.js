/* ================== MERIDIAN ATMOSPHERIC DEPTH ==================== */
/* Render-only storm veils that sit between the playable hull face and the
   distant anatomy. The creature bake intentionally keeps its combat band
   clear, but that left a large, perfectly flat teal field between foreground
   route and overhead silhouettes. In motion it read as a warehouse wall --
   separate scenery behind orange platforms -- rather than one colossal body.

   Six static quads (one per facet) solve that hierarchy without touching the
   simulation, camera, route geometry, or the limb bake. They live just in
   front of the broad wall skin and behind every gameplay object. Their
   deterministic canvas textures add deep storm banks, broad curved body
   shadows, and sparse particulate scale. Opaque gameplay geometry still wins
   the depth test, while the veil softens distant boxes into atmosphere.

   Escalation is spatial, not animated: faces 1-2 use the quiet texture, 3-4
   carry more turbulence, and 5-6 carry the densest wake. Moving upward reveals
   the stronger layer naturally, so there is no clock, sim hook, or per-frame
   texture work. */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { normalAscentAltAt } from '../pure/ascent.js';
import { SEGS, headingAt, polyAt } from '../pure/path.js';
import { PAL } from './palette.js';
import { faceMidS } from './backdrop-table.js';

const TEX_W = 1024;
const TEX_H = 512;
const VEIL_DEPTH = -4.62; // wall -6 / gill -4.95 behind; landmark rib -4.35 ahead
const VEIL_H = 60;
// Adjacent facet veils overlap generously; the texture itself feathers at the
// sides so a corner never exposes a rectangular transparency edge.
const VEIL_W = CONFIG.path.faceTiles * 1.72;
const VEIL_BASE_Y = 10;

function rgba(token, alpha) {
  const n = typeof token === 'number'
    ? token
    : Number.parseInt(String(token).replace(/^#/, ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// Small deterministic generator: the canvases are authored once at boot and
// must be identical for the same build/capture.
function rngFor(seed) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cloudBank(g, x, y, rx, ry, token, alpha) {
  g.save();
  g.translate(x, y);
  g.scale(rx, ry);
  const fog = g.createRadialGradient(0, 0, 0.03, 0, 0, 1);
  fog.addColorStop(0, rgba(token, alpha));
  fog.addColorStop(0.48, rgba(token, alpha * 0.72));
  fog.addColorStop(1, rgba(token, 0));
  g.fillStyle = fog;
  g.beginPath();
  g.arc(0, 0, 1, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function paintStormTexture(stage, macroTexture) {
  const cv = document.createElement('canvas');
  cv.width = TEX_W;
  cv.height = TEX_H;
  const g = cv.getContext('2d');
  const rand = rngFor(0x4842554c + stage * 0x1451);

  // A transparent aerial-perspective wash. It is deliberately strongest at
  // the frame extremes and quieter across the action horizon.
  const grade = g.createLinearGradient(0, 0, 0, TEX_H);
  grade.addColorStop(0, rgba(PAL.bg, 0.62 + stage * 0.025));
  grade.addColorStop(0.28, rgba(PAL.backdropFar, 0.18));
  grade.addColorStop(0.58, rgba(PAL.bg, 0.16));
  grade.addColorStop(1, rgba(PAL.bg, 0.54 + stage * 0.025));
  g.fillStyle = grade;
  g.fillRect(0, 0, TEX_W, TEX_H);

  // The coherent macro-body plate is composited INTO the air rather than put
  // on another quad. That gives the painted scutes/ribs the same fog banks,
  // edge feather and one-draw hierarchy as the procedural layer, avoiding the
  // floating-sticker read of the legacy individual plates.
  const macro = macroTexture?.image;
  if (macro && macro.width > 0 && macro.height > 0) {
    const drawH = TEX_H * 1.04;
    const drawW = drawH * (macro.width / macro.height);
    const travel = Math.max(0, drawW - TEX_W);
    const x = -travel * (0.18 + stage * 0.31);
    g.save();
    g.globalAlpha = 0.22 + stage * 0.035;
    g.drawImage(macro, x, -TEX_H * 0.015, drawW, drawH);
    g.restore();
  }

  // Two enormous curved shadows imply another coil/body mass passing through
  // the haze. Their scale is intentionally much broader than a platform bay.
  for (let i = 0; i < 2; i++) {
    const y = TEX_H * (0.26 + i * 0.38) + (rand() - 0.5) * 80;
    g.beginPath();
    g.moveTo(-120, y + 80);
    g.bezierCurveTo(
      TEX_W * 0.18, y - 150 - rand() * 50,
      TEX_W * 0.72, y + 150 + rand() * 50,
      TEX_W + 120, y - 55,
    );
    g.lineCap = 'round';
    g.lineWidth = 96 + rand() * 80 + stage * 12;
    g.strokeStyle = rgba(PAL.bg, 0.21 + stage * 0.025);
    g.stroke();

    // A diffuse rim keeps the sweep readable as anatomy instead of a random
    // dark cloud, while remaining in the same teal atmospheric family.
    g.lineWidth *= 0.58;
    g.strokeStyle = rgba(PAL.backdropFar, 0.07 + stage * 0.008);
    g.stroke();
  }

  // Overlapping elliptical banks produce large soft value masses. Later
  // facets add density, not a new hue or a flashing state.
  const cloudCount = 11 + stage * 4;
  for (let i = 0; i < cloudCount; i++) {
    const x = (rand() * 1.22 - 0.11) * TEX_W;
    const y = (0.05 + rand() * 0.9) * TEX_H;
    const rx = 110 + rand() * 250;
    const ry = 32 + rand() * 82;
    const token = i % 3 === 0 ? PAL.bg : (i % 3 === 1 ? PAL.backdropFar : PAL.limbBg);
    cloudBank(g, x, y, rx, ry, token, 0.12 + rand() * 0.16 + stage * 0.012);
  }

  // Long pressure-stream wisps tie the field to the route's uphill motion.
  // Their shared positive rake is subtle but prevents the air reading as a
  // static horizontal wallpaper band.
  for (let i = 0; i < 7 + stage * 2; i++) {
    const y = 60 + rand() * (TEX_H - 120);
    g.beginPath();
    g.moveTo(-40, y + 35);
    g.bezierCurveTo(TEX_W * 0.32, y + 12, TEX_W * 0.68, y - 38, TEX_W + 40, y - 72);
    g.lineWidth = 1.5 + rand() * 4.5;
    g.strokeStyle = rgba(PAL.backdropFar, 0.035 + rand() * 0.045);
    g.stroke();
  }

  // Sparse suspended particles: enough to give the void depth, never enough
  // to compete with white player projectiles or acid-green threats.
  const motes = 42 + stage * 14;
  for (let i = 0; i < motes; i++) {
    const a = 0.035 + rand() * 0.055;
    g.fillStyle = rgba(PAL.vapor, a * 0.55);
    const r = 0.5 + rand() * 1.25;
    g.fillRect(rand() * TEX_W, rand() * TEX_H, r, r);
  }

  // Feather the horizontal borders. The world quads overlap by almost a
  // facet, so their storms cross-dissolve instead of exposing a hard glass
  // edge during a corner orbit or in a narrow portrait crop.
  g.globalCompositeOperation = 'destination-in';
  const edge = g.createLinearGradient(0, 0, TEX_W, 0);
  edge.addColorStop(0, 'rgba(255,255,255,0)');
  edge.addColorStop(0.18, 'rgba(255,255,255,1)');
  edge.addColorStop(0.82, 'rgba(255,255,255,1)');
  edge.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = edge;
  g.fillRect(0, 0, TEX_W, TEX_H);
  g.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

export function buildMeridianAtmosphere(scene, macroTexture = null) {
  const textures = [0, 1, 2].map((stage) => paintStormTexture(stage, macroTexture));
  const meshes = [];
  const geo = new THREE.PlaneGeometry(VEIL_W, VEIL_H);
  const euler = new THREE.Euler();

  for (let face = 1; face <= CONFIG.path.faces; face++) {
    const stage = Math.min(2, Math.floor((face - 1) / 2));
    const s = faceMidS(face, CONFIG);
    const yaw = headingAt(SEGS, s);
    const p = polyAt(SEGS, s);
    const mat = new THREE.MeshBasicMaterial({
      map: textures[stage],
      color: 0xffffff,
      transparent: true,
      opacity: 0.9 + stage * 0.04,
      depthWrite: false,
      depthTest: true,
      // Only the outward face paints. Back-face culling keeps the other limbs
      // of the hex from stacking six full-screen transparent passes while a
      // corner still reveals its adjacent outward face naturally.
      side: THREE.FrontSide,
      fog: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `Meridian storm veil F${face}`;
    mesh.userData.environmentRole = 'storm-veil';
    mesh.userData.escalationStage = stage;
    mesh.quaternion.setFromEuler(euler.set(0, yaw, 0));
    mesh.position.set(
      p.x + Math.sin(yaw) * VEIL_DEPTH,
      VEIL_BASE_Y + normalAscentAltAt(s, CONFIG.levelLength),
      p.z + Math.cos(yaw) * VEIL_DEPTH,
    );
    mesh.frustumCulled = true;
    // Transparent atmosphere must paint before tracers, glows and sprites.
    mesh.renderOrder = -40;
    scene.add(mesh);
    meshes.push(mesh);
  }

  return {
    built: meshes.length,
    textureCount: textures.length,
    depth: VEIL_DEPTH,
    stages: meshes.map((m) => m.userData.escalationStage),
  };
}
