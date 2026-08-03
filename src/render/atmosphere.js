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
import { cameraFaceBlendGain } from './camera.js';
import { warmDerivedTextures } from './preload.js';

const TEX_W = 1024;
const TEX_H = 512;
const VEIL_DEPTHS = Object.freeze([-3.75, -7.25, -11.5]);
const VEIL_OPACITY = Object.freeze([0.58, 0.34, 0.22]);
const VEIL_CURVE = Object.freeze([0.9, 2.2, 4.1]);
const VEIL_H = 62;
// The connected anatomy plate belongs inside the middle storm shell.  Putting
// it on layer zero would sit it in front of too much air; putting it on the
// far layer would reduce its painted joints to noise.  These are compositing
// controls, not another mesh/material/render lane.
const ANATOMY_LAYER = 1;
const ANATOMY_OPACITY = 0.62;
const ANATOMY_COMBAT_GAIN = 0.54;
const PORTRAIT_VEIL_GAIN = 0.30;
const PORTRAIT_ANATOMY_GAIN = 0.62;
// Adjacent facet veils overlap generously; the texture itself feathers at the
// sides so a corner never exposes a rectangular transparency edge.
const VEIL_W = CONFIG.path.faceTiles * 2.0;
const VEIL_BASE_Y = 10;

// A portrait frustum intersects several overlapping facet shells at once.
// At desktop width their feathered sides occupy different screen regions; at
// phone width those same transparent layers stack across almost every pixel
// and previously washed the world toward pale grey.  Attenuate only that
// overlap case, continuously by the live camera aspect, so rotating a device
// cannot pop between two authored opacities.
function veilAspectGain(aspect, portraitFloor = PORTRAIT_VEIL_GAIN) {
  if (aspect >= 0.90) return 1;
  if (aspect <= 0.55) return portraitFloor;
  const u = (aspect - 0.55) / 0.35;
  return portraitFloor + (1 - portraitFloor) * u * u * (3 - 2 * u);
}

// A facet's storm belongs to that facet in world space. During a corner the
// departing bank must hand the frame to the arriving one; otherwise two large
// transparent shells continue to read as one screen-aligned sheet. Camera
// back is projected onto the horizontal plane so pitch/shake cannot pulse the
// weather. The eighth-power shoulder gives both faces a useful cross-dissolve
// at the 30-degree midpoint, then removes the old face by the settled detent.
const _cameraForward = new THREE.Vector3();
function veilAngleGain(camera, facetYaw) {
  camera.getWorldDirection(_cameraForward);
  const len = Math.hypot(_cameraForward.x, _cameraForward.z) || 1;
  const backX = -_cameraForward.x / len;
  const backZ = -_cameraForward.z / len;
  const facing = Math.max(0,
    Math.sin(facetYaw) * backX + Math.cos(facetYaw) * backZ);
  return facing ** 8;
}

// `faceMidS()` intentionally describes only the six full tower facets. The
// post-sixth-corner run is a shorter, seventh visual facet: without its own
// shell the camera completes the 360-degree orbit and looks through an empty
// teal stage toward face 1. Keep that final heading authored at the midpoint
// of the actual outro, not a fictitious seventh 65-tile span.
function atmosphereFaceS(face) {
  if (face <= CONFIG.path.faces) return faceMidS(face, CONFIG);
  return CONFIG.path.introTiles + CONFIG.path.faceTiles * CONFIG.path.faces +
    CONFIG.path.outroTiles / 2;
}

function atmosphereFaceRange(face) {
  const start = CONFIG.path.introTiles + (face - 1) * CONFIG.path.faceTiles;
  return {
    start,
    length: face <= CONFIG.path.faces ? CONFIG.path.faceTiles : CONFIG.path.outroTiles,
  };
}

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

function compositeAnatomy(g, anatomyTexture, stage, layer) {
  const anatomy = anatomyTexture?.image;
  if (layer !== ANATOMY_LAYER || !anatomy || anatomy.width <= 0 || anatomy.height <= 0)
    return false;

  // Build this mask once per escalation-stage texture at boot.  The source is
  // cover-fit so no unpainted edge can enter a facet during rotation, then its
  // middle/lower combat horizon is thinned before the result joins the storm.
  // That keeps feet, bullets and tells readable while the connected ribs and
  // scutes remain strong above and below the route.
  const anatomyCv = document.createElement('canvas');
  anatomyCv.width = TEX_W;
  anatomyCv.height = TEX_H;
  const a = anatomyCv.getContext('2d');
  const sourceAspect = anatomy.width / anatomy.height;
  const targetAspect = TEX_W / TEX_H;
  let drawW = TEX_W;
  let drawH = TEX_W / sourceAspect;
  if (sourceAspect > targetAspect) {
    drawH = TEX_H;
    drawW = TEX_H * sourceAspect;
  }
  const x = (TEX_W - drawW) / 2;
  const y = (TEX_H - drawH) / 2;
  a.filter = 'saturate(0.68) brightness(0.75) contrast(1.04)';
  a.drawImage(anatomy, x, y, drawW, drawH);
  a.filter = 'none';

  // CanvasTexture flips canvas Y into UV space. The climb's action horizon
  // therefore lands across roughly 47-69% of this canvas, not at its visual
  // top.  Attenuate alpha there rather than painting a flat teal cover over
  // the source; atmosphere and feathers can still show through naturally.
  a.globalCompositeOperation = 'destination-in';
  const combatMask = a.createLinearGradient(0, 0, 0, TEX_H);
  combatMask.addColorStop(0, rgba(PAL.bg, 1));
  combatMask.addColorStop(0.43, rgba(PAL.bg, 1));
  combatMask.addColorStop(0.49, rgba(PAL.bg, ANATOMY_COMBAT_GAIN));
  combatMask.addColorStop(0.68, rgba(PAL.bg, ANATOMY_COMBAT_GAIN));
  combatMask.addColorStop(0.75, rgba(PAL.bg, 1));
  combatMask.addColorStop(1, rgba(PAL.bg, 1));
  a.fillStyle = combatMask;
  a.fillRect(0, 0, TEX_W, TEX_H);

  g.save();
  // Later facets become slightly clearer without changing hue or introducing
  // a timed state. This matches the existing three authored storm stages.
  g.globalAlpha = ANATOMY_OPACITY + stage * 0.018;
  g.drawImage(anatomyCv, 0, 0);
  g.restore();
  return true;
}

function paintStormTexture(stage, macroTexture, anatomyTexture, layer) {
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
    // A broad, edgeless body shadow also fills the largest negative-space
    // windows. The source silhouette is intentionally open, but at this
    // scale an untouched bright storm wash behind one opening looked like a
    // pasted rectangular crop rather than sky seen through anatomy.
    cloudBank(g, TEX_W * 0.56, TEX_H * 0.38,
      TEX_W * 0.68, TEX_H * 0.52, PAL.bg, 0.60 + stage * 0.025);
    // The painted coil has real alpha cutouts. At enormous Crown scale, one
    // wide negative-space opening could expose the brighter base wash as a
    // pale rectangle and read as a bad crop. Put a blurred silhouette of the
    // SAME alpha underneath it: holes remain atmospheric depth, but their
    // borders dissolve into body shadow instead of advertising the source
    // canvas. This is generated once at boot with the other veil textures.
    const shadowCv = document.createElement('canvas');
    shadowCv.width = TEX_W;
    shadowCv.height = TEX_H;
    const shadow = shadowCv.getContext('2d');
    shadow.filter = 'blur(72px)';
    shadow.globalAlpha = 0.46 + stage * 0.035;
    shadow.drawImage(macro, x, -TEX_H * 0.015, drawW, drawH);
    shadow.globalCompositeOperation = 'source-in';
    shadow.fillStyle = rgba(PAL.bg, 0.94);
    shadow.fillRect(0, 0, TEX_W, TEX_H);
    g.drawImage(shadowCv, 0, 0);
    g.save();
    g.globalAlpha = 0.22 + stage * 0.035;
    g.drawImage(macro, x, -TEX_H * 0.015, drawW, drawH);
    g.restore();
  }

  // The coherent body atlas is part of this curved, feathered texture.  It
  // deliberately creates no standalone plane, material or draw call.
  compositeAnatomy(g, anatomyTexture, stage, layer);

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
  edge.addColorStop(0.10, 'rgba(255,255,255,1)');
  edge.addColorStop(0.90, 'rgba(255,255,255,1)');
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

// Three intersecting quads in ONE geometry: unlike THREE.Sprite they remain
// fixed in world space while the camera rounds a facet, so a bank has actual
// thickness/parallax instead of obediently rotating as a 2D card. Keeping the
// three sheets in one mesh also preserves the old one-draw-per-puff budget.
function crossedPuffGeometry() {
  const positions = [];
  const uvs = [];
  const indices = [];
  const corners = [
    [-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5],
  ];
  for (let plane = 0; plane < 3; plane++) {
    const angle = plane * Math.PI / 3;
    const c = Math.cos(angle), s = Math.sin(angle);
    const base = positions.length / 3;
    for (const [x, y] of corners) positions.push(x * c, y, -x * s);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

function buildWorldFog(scene) {
  const texture = paintCloudPuffTexture();
  const geometry = crossedPuffGeometry();
  // Each center is crossed by up to three translucent sheets, so these are
  // intentionally lower than the old single-sprite values. Their combined
  // optical density is similar; only the view-dependent card read is gone.
  const materials = [0.070, 0.052, 0.040].map((opacity) => {
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      color: PAL.vapor,
      transparent: true,
      opacity,
      depthWrite: false,
      depthTest: true,
      fog: true,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    material.userData.baseStormOpacity = opacity;
    return material;
  });
  const sprites = [];
  const p = { x: 0, z: 0 };

  for (let face = 1; face <= CONFIG.path.faces + 1; face++) {
    const rand = rngFor(0x4d455249 + face * 0x51f1);
    const range = atmosphereFaceRange(face);
    const count = face <= CONFIG.path.faces ? 7 : 4;
    for (let i = 0; i < count; i++) {
      const s = range.start + 4 + rand() * (range.length - 8);
      const yaw = headingAt(SEGS, s);
      polyAt(SEGS, s, p);
      const depth = -2.3 - rand() * 11.5;
      const puff = new THREE.Mesh(geometry, materials[i % materials.length]);
      puff.name = `Meridian fog volume F${face}.${i + 1}`;
      puff.userData.environmentRole = 'storm-volume';
      puff.userData.backdropFace = face;
      puff.userData.facetYaw = yaw;
      puff.position.set(
        p.x + Math.sin(yaw) * depth,
        5 + rand() * 52 + normalAscentAltAt(s, CONFIG.levelLength),
        p.z + Math.cos(yaw) * depth,
      );
      const w = 5.5 + rand() * 10;
      puff.rotation.y = yaw + rand() * Math.PI;
      puff.scale.set(w, w * (0.34 + rand() * 0.18), w * 0.58);
      puff.renderOrder = -39;
      puff.onBeforeRender = (_renderer, _scene, camera, _geometry, material) => {
        material.opacity = material.userData.baseStormOpacity * veilAspectGain(camera.aspect) *
          veilAngleGain(camera, puff.userData.facetYaw) *
          cameraFaceBlendGain(puff.userData.backdropFace);
      };
      scene.add(puff);
      sprites.push(puff);
    }
  }
  return { sprites, texture, materials, geometry };
}

export function buildMeridianAtmosphere(scene, macroTexture = null, anatomyTexture = null) {
  const anatomyImage = anatomyTexture?.image;
  const anatomyReady = Boolean(anatomyImage?.width > 0 && anatomyImage?.height > 0);
  const textures = VEIL_DEPTHS.map((_, layer) =>
    [0, 1, 2].map((stage) =>
      paintStormTexture(stage, macroTexture, anatomyTexture, layer))
  );
  const geometries = VEIL_CURVE.map((curve) => curvedVeilGeometry(curve));
  const meshes = [];
  const euler = new THREE.Euler();

  for (let face = 1; face <= CONFIG.path.faces + 1; face++) {
    const stage = Math.min(2, Math.floor((face - 1) / 2));
    const s = atmosphereFaceS(face);
    const yaw = headingAt(SEGS, s);
    const p = polyAt(SEGS, s);
    for (let layer = VEIL_DEPTHS.length - 1; layer >= 0; layer--) {
      const depth = VEIL_DEPTHS[layer];
      const baseOpacity = VEIL_OPACITY[layer] + stage * 0.012;
      const mat = new THREE.MeshBasicMaterial({
        map: textures[layer][stage],
        color: 0xffffff,
        transparent: true,
        opacity: baseOpacity,
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
      mesh.userData.backdropFace = face;
      mesh.userData.baseStormOpacity = baseOpacity;
      mesh.userData.facetYaw = yaw;
      mesh.quaternion.setFromEuler(euler.set(0, yaw, 0));
      mesh.position.set(
        p.x + Math.sin(yaw) * depth,
        VEIL_BASE_Y + normalAscentAltAt(s, CONFIG.levelLength),
        p.z + Math.cos(yaw) * depth,
      );
      mesh.frustumCulled = true;
      // Farthest layer first; all atmosphere still precedes gameplay glow.
      mesh.renderOrder = -48 - layer * 2;
      mesh.onBeforeRender = (_renderer, _scene, camera, _geometry, material) => {
        const portraitFloor = mesh.userData.depthLayer === ANATOMY_LAYER
          ? PORTRAIT_ANATOMY_GAIN
          : PORTRAIT_VEIL_GAIN;
        material.opacity = mesh.userData.baseStormOpacity *
          veilAspectGain(camera.aspect, portraitFloor) *
          veilAngleGain(camera, mesh.userData.facetYaw) *
          cameraFaceBlendGain(mesh.userData.backdropFace);
      };
      scene.add(mesh);
      meshes.push(mesh);
    }
  }

  const worldFog = buildWorldFog(scene);
  // These ten textures are boot-time composites, not new URL requests, so
  // they are born after the decoded anatomy/backdrop sources clear the shared
  // gate. Force their GPU upload now while main.js is still evaluating; the
  // first visible facet must never be the thing that makes them resident.
  const textureResidency = warmDerivedTextures([
    ...textures.flat(), worldFog.texture,
  ]);

  return {
    built: meshes.length,
    textureCount: textures.flat().length + 1,
    textureResidency,
    depth: VEIL_DEPTHS[0],
    depths: [...VEIL_DEPTHS],
    volumeCount: worldFog.sprites.length,
    stages: meshes.map((m) => m.userData.escalationStage),
    anatomy: {
      composited: anatomyReady,
      source: anatomyReady ? [anatomyImage.width, anatomyImage.height] : null,
      layer: ANATOMY_LAYER,
      depth: VEIL_DEPTHS[ANATOMY_LAYER],
      opacity: ANATOMY_OPACITY,
      combatBandGain: ANATOMY_COMBAT_GAIN,
      stagePasses: anatomyReady ? 3 : 0,
      facets: CONFIG.path.faces + 1,
      meshDelta: 0,
      inheritsCurveAndFeather: true,
    },
  };
}
