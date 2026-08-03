/* ======================= CAPSULE PICKUP ART ======================= */
/* Production pickup cutouts, with the old lettered box retained as the
   complete missing-asset fallback. The simulation still owns every motion
   and catch rule: this module only maps { kind, letter } to pixels, places
   those pixels at the sim row, and gives them a restrained pickup collar.

   Source PNGs are intentionally allowed to have generous transparent
   margins. Their alpha is measured once at boot, the texture UVs are cropped
   to that ink (plus a small breathing pad), and the resulting aspect is fit
   into one presentation envelope. That keeps a 70-100px source legible at
   its real world size without turning the pickup into a screen-sized bloom.

   All eight files go through the shared preload gate. A missing, late, or
   unreadable image never changes gameplay and never leaves a blank pickup:
   the old magenta/gold box and its fitted glyph draw instead.               */

import * as THREE from 'three';
import { installView } from '../sim/bridge.js';
import { gameMs, blink } from '../sim/time.js';
import { CAP } from '../sim/capsules.js';
import { scene } from './scene.js';
import { placeOnTower } from './tower.js';
import { PAL } from './palette.js';
import { awaitPreloads, preloadTexture } from './preload.js';
import { releaseContactShadow, syncContactShadow } from './contact.js';
import {
  CAPSULE_SWEEP_FREQ, CAPSULE_SWEEP_RAD, GLYPH_EDGE, GLYPH_GAIN, GLYPH_INK_FILL,
  GLYPH_SQUEEZE_MIN, GLYPH_TEX_PX, LEGIBILITY_ON,
} from './legibility.js';

const ART_ROOT = '../../assets/generated/capsules/';
const ART_TABLE = Object.freeze({
  'letter:S':  { file: 'weapon-spread-v3.png', name: 'Spread weapon' },
  'letter:L':  { file: 'weapon-laser-v3.png',  name: 'Laser weapon' },
  'letter:H':  { file: 'weapon-homing-v3.png', name: 'Homing weapon' },
  'letter:F':  { file: 'weapon-flame-v3.png',  name: 'Flame weapon' },
  'mod:RG':     { file: 'mod-rage-v3.png',      name: 'Rage modifier' },
  'mod:GS':     { file: 'mod-ghost-v3.png',     name: 'Ghost modifier' },
  'mod:CH':     { file: 'mod-chrono-v3.png',    name: 'Chrono modifier' },
  'mod:OL':     { file: 'mod-orbital-v3.png',   name: 'Orbital modifier' },
});

/* A cropped cutout fits inside this presentation envelope. At MID this is
   roughly 25-34 CSS px depending on aspect: enough to preserve a bold icon,
   still comfortably inside CAP.pickupRadius's unchanged catch diameter. */
const ART_MAX_W = 1.46;
const ART_MAX_H = 1.34;
const ART_SURFACE_DEPTH = 1.18;
const ART_SWAY_RAD = 0.075;
const ART_ALPHA_FLOOR = 8;
const ART_CROP_PAD_FRAC = 0.045;
const COLLAR_PAD = 1.12;
const COLLAR_BASE_ALPHA = 0.22;
const TIER_MAX = 3;
const TIER_PIP_W = 0.09;
const TIER_PIP_H = 0.09;
const TIER_PIP_GAP = 0.11;
const TIER_COLLAR_GAIN = Object.freeze([1, 1, 1.28, 1.58]);
const TIER_PIP_ALPHA = Object.freeze([0, 0.64, 0.78, 0.92]);

const artSlots = new Map();
for (const [key, spec] of Object.entries(ART_TABLE)) {
  const slot = {
    key, file: spec.file, name: spec.name,
    state: 'pending', tex: null, error: null,
    source: null, ink: null, crop: null, world: null,
  };
  slot.entry = preloadTexture(new URL(ART_ROOT + spec.file, import.meta.url).href);
  artSlots.set(key, slot);
}

// Hold the module graph until every image is resident or permanently failed.
await awaitPreloads();

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/* Return the non-transparent source bounds and crop the already-resident
   texture by UV transform. No replacement CanvasTexture is created here,
   so measuring alpha does not sneak a new GPU upload past the boot gate. */
function measureAndCrop(tex) {
  const image = tex && tex.image;
  const w = image && (image.naturalWidth || image.videoWidth || image.width);
  const h = image && (image.naturalHeight || image.videoHeight || image.height);
  if (!w || !h) throw new Error('decoded image has no dimensions');

  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d', { willReadFrequently: true });
  if (!g) throw new Error('Canvas2D is unavailable for alpha crop');
  g.drawImage(image, 0, 0, w, h);
  const rgba = g.getImageData(0, 0, w, h).data;

  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0, p = 3; y < h; y++) {
    for (let x = 0; x < w; x++, p += 4) {
      if (rgba[p] <= ART_ALPHA_FLOOR) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < x0 || y1 < y0) throw new Error('image contains no visible alpha');

  const inkW = x1 - x0 + 1;
  const inkH = y1 - y0 + 1;
  const pad = Math.max(2, Math.ceil(Math.max(inkW, inkH) * ART_CROP_PAD_FRAC));
  const cx0 = clamp(x0 - pad, 0, w);
  const cy0 = clamp(y0 - pad, 0, h);
  const cx1 = clamp(x1 + 1 + pad, 0, w);
  const cy1 = clamp(y1 + 1 + pad, 0, h);
  const cropW = cx1 - cx0;
  const cropH = cy1 - cy0;

  // TextureLoader flips browser images for WebGL, so source-top y becomes
  // the upper end of the UV range and source-bottom becomes the lower end.
  tex.offset.set(cx0 / w, 1 - cy1 / h);
  tex.repeat.set(cropW / w, cropH / h);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;

  const aspect = cropW / cropH;
  const worldH = Math.min(ART_MAX_H, ART_MAX_W / aspect);
  return {
    source: [w, h],
    ink: [x0, y0, inkW, inkH],
    crop: [cx0, cy0, cropW, cropH],
    world: [worldH * aspect, worldH],
  };
}

for (const slot of artSlots.values()) {
  const entry = await slot.entry;
  if (entry.state !== 'ready') {
    slot.state = 'failed';
    slot.error = entry.error || entry.state;
    console.warn('HULLBREAKER art: capsule ' + slot.file + ' did not load (' +
      slot.error + ') — drawing the lettered fallback instead.');
    continue;
  }
  try {
    const measured = measureAndCrop(entry.tex);
    Object.assign(slot, measured);
    slot.tex = entry.tex;
    slot.state = 'ready';
  } catch (err) {
    slot.state = 'failed';
    slot.error = String((err && err.message) || err);
    console.warn('HULLBREAKER art: capsule ' + slot.file + ' could not be cropped (' +
      slot.error + ') — drawing the lettered fallback instead.');
  }
}

const artGeo = new THREE.PlaneGeometry(1, 1);             // shared: never disposed
const collarGeo = new THREE.RingGeometry(0.36, 0.5, 28); // shared: never disposed

function artKey(c) { return (c.kind === 'mod' ? 'mod' : 'letter') + ':' + c.letter; }

function artMaterial(tex) {
  return new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    alphaTest: 0.035,
    depthWrite: true,
    side: THREE.DoubleSide,
    forceSinglePass: true,
    fog: false,
    toneMapped: false,
  });
}

function pickupTier(c) {
  if (c.kind !== 'letter') return 0;
  return clamp(Math.round(c.gun?.tier || 0), 0, TIER_MAX);
}

function collarMaterial(c, tier) {
  return new THREE.MeshBasicMaterial({
    color: c.kind === 'mod' ? PAL.modCapsule : PAL.capsule,
    transparent: true,
    opacity: COLLAR_BASE_ALPHA * TIER_COLLAR_GAIN[tier],
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    toneMapped: false,
  });
}

function productionPickup(c, slot) {
  const root = new THREE.Group();
  root.userData.accessibleName = slot.name + ' pickup';
  const tier = pickupTier(c);
  root.userData.gunTier = tier;

  const collarMat = collarMaterial(c, tier);
  const collar = new THREE.Mesh(collarGeo, collarMat);
  collar.position.z = -0.018;
  collar.scale.set(slot.world[0] * COLLAR_PAD, slot.world[1] * COLLAR_PAD, 1);
  collar.renderOrder = 2;
  root.add(collar);

  const mat = artMaterial(slot.tex);
  const art = new THREE.Mesh(artGeo, mat);
  art.scale.set(slot.world[0], slot.world[1], 1);
  art.renderOrder = 3;
  root.add(art);

  // Borderlands-like rolls need a pre-pickup value read, but the generated
  // capsule remains the hero. One to three warm-white machine lamps sit on
  // its lower casing; a stronger collar reinforces the same tier at mobile
  // scale, where an individual two-pixel lamp can disappear under motion.
  let pipMat = null;
  if (tier > 0) {
    pipMat = new THREE.MeshBasicMaterial({
      color: PAL.muzzle,
      transparent: true,
      opacity: TIER_PIP_ALPHA[tier],
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      fog: false,
      toneMapped: false,
    });
    const span = tier * TIER_PIP_W + (tier - 1) * TIER_PIP_GAP;
    for (let i = 0; i < tier; i++) {
      const pip = new THREE.Mesh(artGeo, pipMat);
      pip.name = `Gun tier ${tier} lamp ${i + 1}`;
      pip.scale.set(TIER_PIP_W, TIER_PIP_H, 1);
      pip.position.set(
        -span / 2 + TIER_PIP_W / 2 + i * (TIER_PIP_W + TIER_PIP_GAP),
        -slot.world[1] * 0.52,
        0.026,
      );
      pip.renderOrder = 4;
      root.add(pip);
    }
  }

  return {
    mesh: root,
    mats: pipMat ? [mat, collarMat, pipMat] : [mat, collarMat],
    production: true,
    art,
    collar,
    collarMat,
    collarBaseAlpha: COLLAR_BASE_ALPHA * TIER_COLLAR_GAIN[tier],
    collarScale: [slot.world[0] * COLLAR_PAD, slot.world[1] * COLLAR_PAD],
    pipMat,
    pipBaseAlpha: TIER_PIP_ALPHA[tier],
    tier,
    slot,
  };
}

/* -------------------- letter-cube failure fallback -------------------- */
const capsuleGeo = new THREE.BoxGeometry(CAP.size, CAP.size, CAP.size); // shared
const letterTexCache = {};
const GLYPH_FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const GLYPH_FATTEN = 0.08;

function drawGlyph(g, text, N) {
  const edge = Math.max(1, Math.round(N * GLYPH_EDGE));
  const targetH = N * GLYPH_INK_FILL;
  const usableW = N - 4 * edge;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  const probe = 100;
  g.font = 'bold ' + probe + 'px ' + GLYPH_FONT;
  const m0 = g.measureText(text);
  const inkPer = ((m0.actualBoundingBoxAscent || probe * 0.7) +
                  (m0.actualBoundingBoxDescent || 0)) / probe;
  const size = targetH / (inkPer + GLYPH_FATTEN);
  g.font = 'bold ' + size + 'px ' + GLYPH_FONT;
  const m = g.measureText(text);
  const asc = m.actualBoundingBoxAscent || size * 0.7;
  const desc = m.actualBoundingBoxDescent || 0;
  const inkW = (m.actualBoundingBoxLeft !== undefined
    ? m.actualBoundingBoxLeft + m.actualBoundingBoxRight
    : m.width) + size * GLYPH_FATTEN;
  let squeeze = Math.min(1, usableW / (inkW || usableW));
  let vscale = 1;
  if (squeeze < GLYPH_SQUEEZE_MIN) {
    vscale = squeeze / GLYPH_SQUEEZE_MIN;
    squeeze = GLYPH_SQUEEZE_MIN;
  }
  g.save();
  g.translate(N / 2, N / 2);
  g.scale(squeeze, vscale);
  g.lineJoin = 'round';
  g.lineWidth = size * GLYPH_FATTEN;
  g.strokeStyle = PAL.capsuleInk;
  g.fillStyle = PAL.capsuleInk;
  const baseline = (asc - desc) / 2;
  g.strokeText(text, 0, baseline);
  g.fillText(text, 0, baseline);
  g.restore();
}

function faceTexture(text, bg) {
  const key = (text || '') + '|' + bg;
  if (letterTexCache[key]) return letterTexCache[key];
  const N = LEGIBILITY_ON ? GLYPH_TEX_PX : 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, N, N);
  if (LEGIBILITY_ON) {
    const edge = Math.max(1, Math.round(N * GLYPH_EDGE));
    g.fillStyle = PAL.capsuleInk;
    g.fillRect(0, 0, N, edge);
    g.fillRect(0, N - edge, N, edge);
    g.fillRect(0, 0, edge, N);
    g.fillRect(N - edge, 0, edge, N);
    if (text) drawGlyph(g, text, N);
  } else if (text) {
    g.fillStyle = PAL.capsuleInk;
    g.font = 'bold ' + (text.length > 1 ? 30 : 42) + 'px monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 32, 35);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  letterTexCache[key] = tex;
  return tex;
}

function fallbackPickup(c) {
  const bg = c.kind === 'mod' ? PAL.modCapsule : PAL.capsule;
  const face = new THREE.MeshBasicMaterial({ map: faceTexture(c.letter, bg) });
  const mats = [face];
  let mesh;
  if (LEGIBILITY_ON) {
    const plate = new THREE.MeshBasicMaterial({ map: faceTexture(null, bg) });
    mats.push(plate);
    mesh = new THREE.Mesh(capsuleGeo, [plate, plate, plate, plate, face, face]);
  } else {
    mesh = new THREE.Mesh(capsuleGeo, face);
  }
  // Keep this exact fallback gain: it is the far-view contract and remains
  // statically asserted by T-003.
  mesh.scale.setScalar(GLYPH_GAIN);
  return { mesh, mats, production: false, art: null, collar: null, slot: null };
}

const meshes = new Map();

function spawned(c) {
  const slot = artSlots.get(artKey(c));
  const v = slot && slot.state === 'ready'
    ? productionPickup(c, slot)
    : fallbackPickup(c);
  scene.add(v.mesh);
  meshes.set(c, v);
}

function removed(c) {
  const v = meshes.get(c);
  if (!v) return;
  meshes.delete(c);
  releaseContactShadow(c);
  scene.remove(v.mesh);
  for (const m of v.mats) m.dispose();
}

function sync(c) {
  const v = meshes.get(c);
  if (!v) return;
  // Expiring pop-capsules blink through their last stretch, regardless of
  // whether pixels or fallback geometry are drawing them.
  v.mesh.visible = c.mode !== 'pop' || c.dieAt - gameMs > CAP.blinkLastMs || blink();
  placeOnTower(v.mesh, c.x, c.y, v.production ? ART_SURFACE_DEPTH : 0);

  if (v.production) {
    // A small badge-like sway keeps the illustrated face readable. The old
    // full spin is deliberately not applied to a flat cutout: no edge-on art.
    const sway = Math.sin(c.t * CAPSULE_SWEEP_FREQ);
    v.mesh.rotation.y += sway * ART_SWAY_RAD;
    v.art.rotation.z = sway * ART_SWAY_RAD;
    const pulse = 1 + Math.sin(c.t * 3.1 + 0.7) * 0.035;
    v.collar.scale.set(v.collarScale[0] * pulse, v.collarScale[1] * pulse, 1);
    v.collarMat.opacity = v.collarBaseAlpha * (0.86 + 0.14 * pulse);
    if (v.pipMat) v.pipMat.opacity = v.pipBaseAlpha * (0.90 + 0.10 * pulse);
  } else {
    v.mesh.rotation.y += LEGIBILITY_ON
      ? Math.sin(c.t * CAPSULE_SWEEP_FREQ) * CAPSULE_SWEEP_RAD
      : c.t * 2.2;
  }
  syncContactShadow(c, c.x, c.y, CAP.size / 2);
}

export function capsuleArtSnapshot() {
  const assets = {};
  for (const [key, slot] of artSlots) {
    assets[key] = {
      state: slot.state,
      file: slot.file,
      error: slot.error,
      sourcePx: slot.source,
      inkPx: slot.ink,
      cropPx: slot.crop,
      worldTiles: slot.world,
    };
  }
  let production = 0, fallback = 0;
  const tiers = [0, 0, 0, 0];
  for (const v of meshes.values()) {
    if (v.production) {
      production++;
      tiers[v.tier || 0]++;
    } else fallback++;
  }
  return { assets, live: { production, fallback, tiers } };
}

if (typeof window !== 'undefined') window.__HB_CAPSULE_ART = capsuleArtSnapshot;

installView({ capsules: { spawned, removed, sync } });
