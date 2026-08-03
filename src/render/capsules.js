/* ======================= CAPSULE PICKUP ART ======================= */
/* Production pickup cutouts, with the old lettered box retained as the
   complete missing-asset fallback. The simulation still owns every motion
   and catch rule: this module only maps { kind, letter } to pixels, places
   those pixels at the sim row, and gives them a restrained pickup collar.

   The eight source paintings are packed pixel-for-pixel into one padded RGBA
   atlas. Measured source bounds live beside the atlas coordinates below, so
   boot does no canvas allocation or full-image alpha scan. Per-cell UVs live
   on eight tiny shared geometries; the atlas texture itself is never cloned.

   The one atlas goes through the shared preload gate. A missing, late, or
   unreadable image never changes gameplay and never leaves a blank pickup:
   the old magenta/gold box and its fitted glyph draw instead. `?capsules=0`
   exercises that complete fallback without issuing an art request.         */

import * as THREE from 'three';
import { installView } from '../sim/bridge.js';
import { gameMs, blink } from '../sim/time.js';
import { CAP } from '../sim/capsules.js';
import { QUERY } from '../mode.js';
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
const ATLAS_FILE = 'capsule-pickups-atlas-v1.png';
const ATLAS_SIZE = Object.freeze([2048, 640]);
const WEAPON_CELL = Object.freeze({ S: 0, L: 1, H: 2, F: 3 });
const ATLAS_CELL = Object.freeze([512, 320]);
const CAPSULE_ART_ON = !['0', 'off'].includes((QUERY.get('capsules') || '').toLowerCase());

/* Coordinates are source-top atlas pixels. Each padded rect is a lossless
   composition of its named source PNG; `ink` is the alpha>8 extent measured when the
   atlas was packed. Keeping both here makes crop drift inspectable without a
   runtime readback. Four weapon silhouettes occupy row 0 and four modifiers
   occupy row 1, with at least 36px of transparent atlas gutter between art. */
const ART_TABLE = Object.freeze({
  'letter:S': { sourceFile: 'weapon-spread-v3.png', name: 'Spread weapon',
    atlas: [18, 28, 475, 263], ink: [12, 12, 451, 239] },
  'letter:L': { sourceFile: 'weapon-laser-v3.png', name: 'Laser weapon',
    atlas: [530, 29, 476, 262], ink: [12, 12, 452, 239] },
  'letter:H': { sourceFile: 'weapon-homing-v3.png', name: 'Homing weapon',
    atlas: [1042, 28, 475, 263], ink: [12, 11, 451, 240] },
  'letter:F': { sourceFile: 'weapon-flame-v3.png', name: 'Flame weapon',
    atlas: [1554, 28, 475, 263], ink: [12, 12, 451, 239] },
  'mod:RG': { sourceFile: 'mod-rage-v3.png', name: 'Rage modifier',
    atlas: [18, 348, 476, 264], ink: [12, 12, 452, 240] },
  'mod:GS': { sourceFile: 'mod-ghost-v3.png', name: 'Ghost modifier',
    atlas: [530, 348, 475, 264], ink: [12, 12, 452, 240] },
  'mod:CH': { sourceFile: 'mod-chrono-v3.png', name: 'Chrono modifier',
    atlas: [1042, 347, 476, 265], ink: [12, 12, 452, 241] },
  'mod:OL': { sourceFile: 'mod-orbital-v3.png', name: 'Orbital modifier',
    atlas: [1554, 348, 476, 264], ink: [12, 12, 452, 241] },
});

/* A cropped cutout fits inside this presentation envelope. The generated
   capsules contain real casing detail, so they need to survive MID/FAR as a
   reward rather than a 25px fleck. This remains inside CAP.pickupRadius's
   unchanged 2.3-tile catch diameter and therefore never lies about contact. */
const ART_MAX_W = 1.82;
const ART_MAX_H = 1.58;
const ART_SURFACE_DEPTH = 1.18;
const ART_SWAY_RAD = 0.075;
const COLLAR_PAD = 1.17;
const BRACKET_PAD = 1.31;
const COLLAR_BASE_ALPHA = 0.28;
const TIER_MAX = 3;
const TIER_PIP_W = 0.09;
const TIER_PIP_H = 0.09;
const TIER_PIP_GAP = 0.11;
const TIER_COLLAR_GAIN = Object.freeze([1, 1, 1.28, 1.58]);
const TIER_PIP_ALPHA = Object.freeze([0, 0.64, 0.78, 0.92]);

const atlasEntry = CAPSULE_ART_ON
  ? preloadTexture(new URL(ART_ROOT + ATLAS_FILE, import.meta.url).href)
  : Promise.resolve({ state: 'disabled', tex: null, error: 'disabled by ?capsules=0' });

const artSlots = new Map(Object.entries(ART_TABLE).map(([key, spec]) => [key, {
  key, name: spec.name, sourceFile: spec.sourceFile,
  state: 'pending', tex: null, geometry: null, error: null,
  source: spec.atlas.slice(2), ink: spec.ink, crop: spec.atlas,
  world: null,
}]));

// Hold the module graph until the one atlas is resident or permanently failed.
await awaitPreloads();

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function atlasGeometry(rect) {
  const [x, y, w, h] = rect;
  const [atlasW, atlasH] = ATLAS_SIZE;
  const u0 = x / atlasW, u1 = (x + w) / atlasW;
  // TextureLoader flips browser images for WebGL, so source-top y maps to
  // the upper UV bound and source-bottom maps to the lower bound.
  const v0 = 1 - (y + h) / atlasH, v1 = 1 - y / atlasH;
  const geo = new THREE.PlaneGeometry(1, 1);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i,
      u0 + uv.getX(i) * (u1 - u0),
      v0 + uv.getY(i) * (v1 - v0));
  }
  uv.needsUpdate = true;
  return geo;
}

function worldSize(rect) {
  const aspect = rect[2] / rect[3];
  const worldH = Math.min(ART_MAX_H, ART_MAX_W / aspect);
  return [worldH * aspect, worldH];
}

const settledAtlas = await atlasEntry;
if (settledAtlas.state === 'ready') {
  const image = settledAtlas.tex && settledAtlas.tex.image;
  const atlasW = image && (image.naturalWidth || image.videoWidth || image.width);
  const atlasH = image && (image.naturalHeight || image.videoHeight || image.height);
  if (atlasW === ATLAS_SIZE[0] && atlasH === ATLAS_SIZE[1]) {
    settledAtlas.tex.wrapS = settledAtlas.tex.wrapT = THREE.ClampToEdgeWrapping;
    settledAtlas.tex.needsUpdate = true;
    for (const slot of artSlots.values()) {
      slot.tex = settledAtlas.tex;
      slot.geometry = atlasGeometry(slot.crop);
      slot.world = worldSize(slot.crop);
      slot.state = 'ready';
    }
  } else {
    const error = `atlas dimensions ${atlasW || 0}x${atlasH || 0}; expected ${ATLAS_SIZE.join('x')}`;
    for (const slot of artSlots.values()) {
      slot.state = 'failed';
      slot.error = error;
    }
    console.warn('HULLBREAKER art: capsule atlas is invalid (' + error +
      ') — drawing the lettered fallback instead.');
  }
} else {
  for (const slot of artSlots.values()) {
    slot.state = 'failed';
    slot.error = settledAtlas.error || settledAtlas.state;
  }
  if (CAPSULE_ART_ON) console.warn('HULLBREAKER art: capsule atlas did not load (' +
    (settledAtlas.error || settledAtlas.state) + ') — drawing the lettered fallback instead.');
}

/* The one-shot loot card uses the exact browser image already resident behind
   the WebGL texture. Returning source coordinates rather than another URL is
   the sharing contract: reward UI may copy one cell into its own tiny canvas,
   but it can never issue a second atlas transfer. */
export function capsuleAtlasWeaponCell(letter) {
  const column = WEAPON_CELL[letter];
  const image = CAPSULE_ART_ON && settledAtlas.state === 'ready'
    ? settledAtlas.tex?.image
    : null;
  if (column === undefined || !image) return null;
  const width = image.naturalWidth || image.videoWidth || image.width;
  const height = image.naturalHeight || image.videoHeight || image.height;
  if (width !== ATLAS_SIZE[0] || height !== ATLAS_SIZE[1]) return null;
  return {
    image,
    sx: column * ATLAS_CELL[0], sy: 0,
    sw: ATLAS_CELL[0], sh: ATLAS_CELL[1],
  };
}

const artGeo = new THREE.PlaneGeometry(1, 1);             // pips: never disposed
const collarGeo = new THREE.RingGeometry(0.36, 0.5, 28); // shared: never disposed
// Two opposing partial rings make a machine-readable acquisition bracket.
// Unlike one big additive halo, the broken contour stays crisp on mobile and
// leaves the generated capsule casing unobscured.
const bracketGeo = new THREE.RingGeometry(0.43, 0.49, 24, 1, -0.72, 1.44);

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

  const bracketRoot = new THREE.Group();
  bracketRoot.position.z = -0.012;
  bracketRoot.scale.set(slot.world[0] * BRACKET_PAD, slot.world[1] * BRACKET_PAD, 1);
  for (let i = 0; i < 2; i++) {
    const bracket = new THREE.Mesh(bracketGeo, collarMat);
    bracket.rotation.z = i * Math.PI;
    bracket.renderOrder = 2;
    bracketRoot.add(bracket);
  }
  root.add(bracketRoot);

  const mat = artMaterial(slot.tex);
  const art = new THREE.Mesh(slot.geometry, mat);
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
    bracketRoot,
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
  const towerYaw = placeOnTower(
    v.mesh, c.x, c.y, v.production ? ART_SURFACE_DEPTH : 0,
  );

  if (v.production) {
    // A small badge-like sway keeps the illustrated face readable. The old
    // full spin is deliberately not applied to a flat cutout: no edge-on art.
    const sway = Math.sin(c.t * CAPSULE_SWEEP_FREQ);
    v.mesh.rotation.y = towerYaw + sway * ART_SWAY_RAD;
    v.art.rotation.z = sway * ART_SWAY_RAD;
    const pulse = 1 + Math.sin(c.t * 3.1 + 0.7) * 0.035;
    v.collar.scale.set(v.collarScale[0] * pulse, v.collarScale[1] * pulse, 1);
    v.bracketRoot.rotation.z = c.t * (0.31 + v.tier * 0.035);
    v.bracketRoot.scale.set(
      v.slot.world[0] * BRACKET_PAD * (2 - pulse),
      v.slot.world[1] * BRACKET_PAD * (2 - pulse),
      1,
    );
    v.collarMat.opacity = v.collarBaseAlpha * (0.86 + 0.14 * pulse);
    if (v.pipMat) v.pipMat.opacity = v.pipBaseAlpha * (0.90 + 0.10 * pulse);
  } else {
    v.mesh.rotation.y = towerYaw + (LEGIBILITY_ON
      ? Math.sin(c.t * CAPSULE_SWEEP_FREQ) * CAPSULE_SWEEP_RAD
      : c.t * 2.2);
  }
  syncContactShadow(c, c.x, c.y, CAP.size / 2);
}

export function capsuleArtSnapshot() {
  const assets = {};
  for (const [key, slot] of artSlots) {
    assets[key] = {
      state: slot.state,
      file: ATLAS_FILE,
      sourceFile: slot.sourceFile,
      error: slot.error,
      sourcePx: slot.source,
      inkPx: slot.ink,
      atlasCropPx: slot.crop,
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
  return {
    atlas: { file: ATLAS_FILE, sizePx: ATLAS_SIZE, enabled: CAPSULE_ART_ON },
    assets,
    live: { production, fallback, tiers },
  };
}

if (typeof window !== 'undefined') window.__HB_CAPSULE_ART = capsuleArtSnapshot;

installView({ capsules: { spawned, removed, sync } });
