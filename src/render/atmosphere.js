/* ================== MERIDIAN ATMOSPHERIC DEPTH ==================== */
/* Render-only storm volumes between the playable hull face and the distant
   anatomy. The creature bake intentionally keeps its combat band clear, but
   that left a flat teal field between foreground route and overhead mass.

   The first version put one large textured quad on each facet. It looked good
   from a settled camera and immediately exposed itself as a stage scrim while
   the camera rounded a corner: the whole fog bank stayed on one 2D plane.
   Each facet now carries three gently curved depth layers plus world-space
   cloud puffs. The textures still do the broad composition, while the layers
   and puffs supply real parallax during a turn. Opaque gameplay geometry wins
   the depth test, so this remains atmosphere rather than combat clutter.

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
const VEIL_DEPTHS = Object.freeze([-3.75, -7.25, -11.5]);
const VEIL_OPACITY = Object.freeze([0.58, 0.34, 0.22]);
const VEIL_CURVE = Object.freeze([0.9, 2.2, 4.1]);
const VEIL_H = 62;
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

function paintStormTexture(stage, macroTexture, layer) {
  const cv = document.createElement('canvas');
  cv.width = TEX_W;
  cv.height = TEX_H;
  const g = cv.getContext('2d');
  const rand = rngFor(0x4842554c + stage * 0x1451 + layer * 0x8d31);

  // A transparent aerial-perspective wash. It is deliberately strongest at
  // the frame extremes and quieter across the action horizon.
  const grade = g.createLinearGradient(0, 0, 0, TEX_H);
  const layerGain = 1 - layer * 0.13;
  grade.addColorStop(0, rgba(PAL.bg, (0.62 + stage * 0.025) * layerGain));
  grade.addColorStop(0.28, rgba(PAL.backdropFar, 0.18));
  grade.addColorStop(0.58, rgba(PAL.bg, 0.16));
  grade.addColorStop(1, rgba(PAL.bg, (0.54 + stage * 0.025) * layerGain));
  g.fillStyle = grade;
  g.fillRect(0, 0, TEX_W, TEX_H);

  // The coherent macro-body plate is composited INTO the air rather than put
  // on another quad. That gives the painted scutes/ribs the same fog banks,
  // edge feather and one-draw hierarchy as the procedural layer, avoiding the
  // floating-sticker read of the legacy individual plates.
  const macro = macroTexture?.image;
  if (layer === 0 && macro && macro.width > 0 && macro.height > 0) {
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
  const cloudCount = 9 + stage * 4 + layer * 3;
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

  // Feather every texture border. The world shells overlap by almost a facet,
  // so their storms cross-dissolve instead of exposing a hard glass edge.
  // The original pass feathered only left/right; its fully opaque top edge
  // could still draw one ruler-straight horizontal cutoff across the viewport
  // when the camera pitched up toward the Crown.
  g.globalCompositeOperation = 'destination-in';
  const edge = g.createLinearGradient(0, 0, TEX_W, 0);
  edge.addColorStop(0, 'rgba(255,255,255,0)');
  edge.addColorStop(0.18, 'rgba(255,255,255,1)');
  edge.addColorStop(0.82, 'rgba(255,255,255,1)');
  edge.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = edge;
  g.fillRect(0, 0, TEX_W, TEX_H);

  const vertical = g.createLinearGradient(0, 0, 0, TEX_H);
  vertical.addColorStop(0, 'rgba(255,255,255,0)');
  vertical.addColorStop(0.17, 'rgba(255,255,255,1)');
  vertical.addColorStop(0.78, 'rgba(255,255,255,1)');
  vertical.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = vertical;
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

function curvedVeilGeometry(curve) {
  const geo = new THREE.PlaneGeometry(VEIL_W, VEIL_H, 14, 1);
  const pos = geo.attributes.position;
  const halfW = VEIL_W / 2;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / halfW;
    // Recede at the edges so adjacent facets overlap as a shallow fog shell,
    // not two cards crossing in front of the camera.
    pos.setZ(i, -curve * u * u);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function paintCloudPuffTexture() {
  const cv = document.createElement('canvas');
  cv.width = 192;
  cv.height = 96;
  const g = cv.getContext('2d');
  const lobes = [
    [65, 54, 47], [99, 43, 50], [132, 55, 43], [104, 67, 56],
  ];
  for (const [x, y, r] of lobes) {
    const fog = g.createRadialGradient(x, y, 2, x, y, r);
    fog.addColorStop(0, 'rgba(255,255,255,0.34)');
    fog.addColorStop(0.48, 'rgba(255,255,255,0.17)');
    fog.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = fog;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function buildWorldFog(scene) {
  const texture = paintCloudPuffTexture();
  const materials = [0.10, 0.075, 0.055].map((opacity) => new THREE.SpriteMaterial({
    map: texture,
    color: PAL.vapor,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: true,
    fog: true,
    toneMapped: false,
  }));
  const sprites = [];
  const p = { x: 0, z: 0 };

  for (let face = 1; face <= CONFIG.path.faces; face++) {
    const rand = rngFor(0x4d455249 + face * 0x51f1);
    const faceStart = CONFIG.path.introTiles + (face - 1) * CONFIG.path.faceTiles;
    for (let i = 0; i < 7; i++) {
      const s = faceStart + 4 + rand() * (CONFIG.path.faceTiles - 8);
      const yaw = headingAt(SEGS, s);
      polyAt(SEGS, s, p);
      const depth = -2.3 - rand() * 11.5;
      const puff = new THREE.Sprite(materials[i % materials.length]);
      puff.name = `Meridian fog volume F${face}.${i + 1}`;
      puff.userData.environmentRole = 'storm-volume';
      puff.position.set(
        p.x + Math.sin(yaw) * depth,
        5 + rand() * 52 + normalAscentAltAt(s, CONFIG.levelLength),
        p.z + Math.cos(yaw) * depth,
      );
      const w = 5.5 + rand() * 10;
      puff.scale.set(w, w * (0.34 + rand() * 0.18), 1);
      puff.renderOrder = -39;
      scene.add(puff);
      sprites.push(puff);
    }
  }
  return { sprites, texture, materials };
}

export function buildMeridianAtmosphere(scene, macroTexture = null) {
  const textures = VEIL_DEPTHS.map((_, layer) =>
    [0, 1, 2].map((stage) => paintStormTexture(stage, macroTexture, layer))
  );
  const geometries = VEIL_CURVE.map((curve) => curvedVeilGeometry(curve));
  const meshes = [];
  const euler = new THREE.Euler();

  for (let face = 1; face <= CONFIG.path.faces; face++) {
    const stage = Math.min(2, Math.floor((face - 1) / 2));
    const s = faceMidS(face, CONFIG);
    const yaw = headingAt(SEGS, s);
    const p = polyAt(SEGS, s);
    for (let layer = VEIL_DEPTHS.length - 1; layer >= 0; layer--) {
      const depth = VEIL_DEPTHS[layer];
      const mat = new THREE.MeshBasicMaterial({
        map: textures[layer][stage],
        color: 0xffffff,
        transparent: true,
        opacity: VEIL_OPACITY[layer] + stage * 0.012,
        depthWrite: false,
        depthTest: true,
        side: THREE.FrontSide,
        fog: false,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(geometries[layer], mat);
      mesh.name = `Meridian storm veil F${face} L${layer + 1}`;
      mesh.userData.environmentRole = 'storm-veil';
      mesh.userData.escalationStage = stage;
      mesh.userData.depthLayer = layer;
      mesh.quaternion.setFromEuler(euler.set(0, yaw, 0));
      mesh.position.set(
        p.x + Math.sin(yaw) * depth,
        VEIL_BASE_Y + normalAscentAltAt(s, CONFIG.levelLength),
        p.z + Math.cos(yaw) * depth,
      );
      mesh.frustumCulled = true;
      // Farthest layer first; all atmosphere still precedes gameplay glow.
      mesh.renderOrder = -48 - layer * 2;
      scene.add(mesh);
      meshes.push(mesh);
    }
  }

  const worldFog = buildWorldFog(scene);

  return {
    built: meshes.length,
    textureCount: textures.flat().length + 1,
    depth: VEIL_DEPTHS[0],
    depths: [...VEIL_DEPTHS],
    volumeCount: worldFog.sprites.length,
    stages: meshes.map((m) => m.userData.escalationStage),
  };
}
