/* ======================= CAPSULE PICKUP ART ======================= */
/* Production pickup cutouts, with the old lettered box retained as the
   complete missing-asset fallback. The simulation still owns every motion
   and catch rule: this module only maps { kind, letter, gun } to a rigid
   manufactured silhouette and places it at the sim row.

   The eight source paintings are packed pixel-for-pixel into one padded RGBA
   atlas. Measured source bounds live beside the atlas coordinates below, so
   boot does no canvas allocation or full-image alpha scan. Per-cell UVs live
   on eight tiny shared geometries; the atlas texture itself is never cloned.

   The one atlas goes through the shared preload gate. A missing, late, or
   unreadable image never changes gameplay and never leaves a blank pickup:
   the old magenta/gold box and its fitted glyph draw instead. `?capsules=0`
   exercises that complete fallback without issuing an art request.

   PRESENTATION CONTRACT. A production pickup is a Meridian RELIQUARY, not a
   floating badge: the generated casing sits inside code-native rails, clamps,
   rear stabilisers and a directional nose. Weapon rolls bolt their actual
   trait entries onto three visible hardpoints; modifiers use a broader utility
   cage. Nothing breathes or scales in sync(), and the complete silhouette fits
   inside the unchanged pickup radius so spectacle never lies about contact. */

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
import { routeRenderable } from './route-visibility.js';
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
const ART_SURFACE_DEPTH = 1.20;
// The widest production silhouette is 2.16 tiles, safely inside the
// unchanged 2.30-tile pickup diameter. This is exported through the runtime
// snapshot and source-asserted by the focused reliquary check.
const RELIQUARY_MAX_W = 2.16;
const RELIQUARY_MAX_H = 1.34;
const RELIQUARY_CASE_W = 1.82;
const RELIQUARY_CASE_H = 1.014;
// A reward must be findable without reading like a permanent muzzle flash.
// The casing and painted core carry the idle read; only the narrow scanner is
// additive. Tier changes the number of physical pips, not the amount of bloom.
const RELIQUARY_SIGNAL_ALPHA = 0.26;
const RELIQUARY_SCANNER_ALPHA = 0.58;
// Six authored rewards + six uncollected carrier drops + one popped held gun
// peak at thirteen in the current campaign. Twenty-four is explicit headroom,
// not permission to grow: every render object below is built once at boot.
const CAPSULE_POOL_MAX = 24;
const TIER_MAX = 3;
const TIER_PIP_W = 0.09;
const TIER_PIP_H = 0.09;
const TIER_PIP_GAP = 0.11;

// Structural differences are authored here rather than inferred in sync().
// They are visual-only and cannot affect the sim's kind/letter/gun rows.
const RELIQUARY_PROFILE = Object.freeze({
  letter: Object.freeze({
    role: 'weapon', nose: true, tailFins: true, utilityPods: false,
    signalRole: 'capsule', hardpoints: true,
  }),
  mod: Object.freeze({
    role: 'modifier', nose: false, tailFins: false, utilityPods: true,
    signalRole: 'modCapsule', hardpoints: false,
  }),
});

// A rolled trait changes the hardware bolted to the top rail. Colour and
// geometry mirror the projectile trait language; duplicate traits remain
// duplicate stations, because stackable rolls are the point of the system.
const TRAIT_HARDPOINT = Object.freeze({
  RAPID: Object.freeze({ geometry: 'fork', role: 'muzzle' }),
  HEAVY: Object.freeze({ geometry: 'block', role: 'modCapsule' }),
  FORKED: Object.freeze({ geometry: 'twin', role: 'capsule' }),
  SEEKER: Object.freeze({ geometry: 'antenna', role: 'capsule' }),
  PHASE: Object.freeze({ geometry: 'phase', role: 'laser' }),
  VOLATILE: Object.freeze({ geometry: 'saw', role: 'flame' }),
});

const atlasEntry = CAPSULE_ART_ON
  ? preloadTexture(new URL(ART_ROOT + ATLAS_FILE, import.meta.url).href)
  : Promise.resolve({ state: 'disabled', tex: null, error: 'disabled by ?capsules=0' });

const artSlots = new Map(Object.entries(ART_TABLE).map(([key, spec]) => [key, {
  key, name: spec.name, sourceFile: spec.sourceFile,
  state: 'pending', tex: null, geometry: null, material: null, error: null,
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
    // TextureLoader already supplies ClampToEdge wrapping, and preload.js has
    // uploaded this exact texture before releasing the boot gate. Reasserting
    // the default is harmless; marking it dirty here was not — `needsUpdate`
    // invalidated that residency and deferred a second atlas upload until the
    // first production pickup appeared during play.
    settledAtlas.tex.wrapS = settledAtlas.tex.wrapT = THREE.ClampToEdgeWrapping;
    const material = artMaterial(settledAtlas.tex);
    for (const slot of artSlots.values()) {
      slot.tex = settledAtlas.tex;
      slot.geometry = atlasGeometry(slot.crop);
      slot.material = material;
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

const panelGeo = new THREE.PlaneGeometry(1, 1); // scanner + pooled hardpoint default
const RECT_POINTS = Object.freeze([
  Object.freeze([-0.5, -0.5]), Object.freeze([0.5, -0.5]),
  Object.freeze([0.5, 0.5]), Object.freeze([-0.5, 0.5]),
]);
const NOSE_POINTS = Object.freeze([
  Object.freeze([-0.5, -0.5]), Object.freeze([0.5, 0]), Object.freeze([-0.5, 0.5]),
]);
const TAIL_FIN_POINTS = Object.freeze([
  Object.freeze([-0.5, 0]), Object.freeze([0.5, -0.5]), Object.freeze([0.5, 0.5]),
]);
const DIAMOND_POINTS = Object.freeze([
  Object.freeze([0, -0.5]), Object.freeze([0.5, 0]),
  Object.freeze([0, 0.5]), Object.freeze([-0.5, 0]),
]);
const WEAPON_SHELL_POINTS = Object.freeze([
  Object.freeze([-0.50, -0.25]), Object.freeze([-0.37, -0.50]),
  Object.freeze([0.30, -0.50]), Object.freeze([0.50, 0]),
  Object.freeze([0.30, 0.50]), Object.freeze([-0.37, 0.50]),
  Object.freeze([-0.50, 0.25]),
]);
const MODIFIER_SHELL_POINTS = Object.freeze([
  Object.freeze([-0.50, -0.24]), Object.freeze([-0.34, -0.50]),
  Object.freeze([0.34, -0.50]), Object.freeze([0.50, -0.24]),
  Object.freeze([0.50, 0.24]), Object.freeze([0.34, 0.50]),
  Object.freeze([-0.34, 0.50]), Object.freeze([-0.50, 0.24]),
]);

function polygonGeometry(points) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

// Trait shapes remain shared geometries because each of the three fixed
// hardpoint meshes may select any one at spawn. Selection swaps references;
// it never constructs geometry during play.
const traitGeometry = Object.freeze({
  fork: polygonGeometry([
    [-0.48, -0.50], [-0.12, -0.05], [-0.12, 0.48], [0.12, 0.48],
    [0.12, -0.05], [0.48, -0.50], [0.22, -0.50], [0, -0.25], [-0.22, -0.50],
  ]),
  block: panelGeo,
  twin: polygonGeometry([
    [-0.50, -0.45], [-0.08, 0], [-0.50, 0.45], [-0.18, 0.45], [0.15, 0],
    [0.50, 0.45], [0.50, 0.12], [0.30, 0], [0.50, -0.12], [0.50, -0.45],
  ]),
  antenna: polygonGeometry([[-0.18, -0.50], [0.50, 0], [-0.18, 0.50], [0.05, 0]]),
  phase: polygonGeometry([
    [-0.50, -0.50], [-0.08, -0.50], [-0.30, 0], [-0.08, 0.50], [-0.50, 0.50],
    [-0.28, 0], [0.50, 0],
  ]),
  saw: polygonGeometry([
    [-0.50, -0.45], [-0.12, -0.08], [-0.26, 0.12], [0.18, 0.50],
    [0.02, 0.13], [0.50, 0.28], [0.12, -0.08], [0.28, -0.30],
  ]),
});

function part(points, x, y, sx, sy, z, rotation = 0) {
  return { points, x, y, sx, sy, z, rotation };
}

function rect(x, y, sx, sy, z, rotation = 0) {
  return part(RECT_POINTS, x, y, sx, sy, z, rotation);
}

// Merge any number of convex 2D parts into one BufferGeometry. This tiny local
// compiler replaces 20–31 separate Mesh draws per pickup with one mesh per
// material. It runs exactly at module boot; spawned()/sync() only swap the
// resulting immutable geometry references.
function compileParts(parts) {
  const positions = [];
  const indices = [];
  for (const p of parts) {
    const base = positions.length / 3;
    const c = Math.cos(p.rotation || 0), s = Math.sin(p.rotation || 0);
    for (const point of p.points) {
      const px = point[0] * p.sx, py = point[1] * p.sy;
      positions.push(p.x + px * c - py * s, p.y + px * s + py * c, p.z);
    }
    for (let i = 1; i < p.points.length - 1; i++) indices.push(base, base + i, base + i + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  geometry.userData.partCount = parts.length;
  return geometry;
}

function buildProfileGeometry(kind) {
  const weapon = kind === 'letter';
  const shell = weapon ? WEAPON_SHELL_POINTS : MODIFIER_SHELL_POINTS;
  const w = RELIQUARY_CASE_W, h = RELIQUARY_CASE_H;
  const metal = [
    part(shell, 0, 0, RELIQUARY_MAX_W - 0.04, RELIQUARY_MAX_H - 0.10, -0.075),
  ];
  if (weapon) {
    // An asymmetric launch-cradle silhouette: long lower skid, short top
    // spine, rear fins and a directional nose. It no longer reads as a UI
    // rectangle traced around the source painting.
    metal.push(rect(-w * 0.04, -h * 0.51, w * 0.78, 0.085, -0.030));
    metal.push(rect(-w * 0.16, h * 0.47, w * 0.46, 0.070, -0.030));
    metal.push(rect(-w * 0.33, h * 0.43, 0.18, 0.12, 0.018, -0.10));
    metal.push(rect(w * 0.27, -h * 0.44, 0.20, 0.11, 0.018, 0.10));
    metal.push(part(TAIL_FIN_POINTS, -w * 0.5 - 0.070, h * 0.30, 0.19, 0.20, -0.024));
    metal.push(part(TAIL_FIN_POINTS, -w * 0.5 - 0.070, -h * 0.30, 0.19, 0.20, -0.024));
  } else {
    // Modifier cartridges hang vertically in play. Broad opposing sockets
    // make them read as machinery modules rather than smaller weapon cans.
    metal.push(rect(0, h * 0.46, w * 0.64, 0.075, -0.030));
    metal.push(rect(0, -h * 0.46, w * 0.64, 0.075, -0.030));
    metal.push(part(DIAMOND_POINTS, 0, h * 0.5 + 0.055, 0.30, 0.18, -0.024));
    metal.push(part(DIAMOND_POINTS, 0, -h * 0.5 - 0.055, 0.30, 0.18, -0.024));
  }

  const ink = [
    part(shell, 0, 0, RELIQUARY_MAX_W - 0.16, RELIQUARY_MAX_H - 0.22, -0.065),
    rect(0, 0, w + 0.18, 0.095, -0.050),
  ];
  if (weapon) {
    ink.push(part(NOSE_POINTS, w * 0.5 + 0.070, 0, 0.20, h * 0.45, -0.022));
  } else {
    for (const x of [-1, 1])
      ink.push(rect(x * (w * 0.5 + 0.045), 0, 0.15, h * 0.46, -0.024));
  }

  const signal = [];
  if (weapon) {
    signal.push(part(NOSE_POINTS, w * 0.5 + 0.105, 0, 0.082, h * 0.17, 0.035));
    signal.push(rect(-w * 0.36, h * 0.47, 0.12, 0.030, 0.035, -0.10));
  } else {
    for (const x of [-1, 1])
      signal.push(rect(x * (w * 0.5 + 0.050), 0, 0.032, h * 0.29, 0.035));
    signal.push(part(DIAMOND_POINTS, 0, h * 0.5 + 0.060, 0.11, 0.075, 0.035));
  }

  const warm = [];
  const sockets = [];
  for (let tier = 0; tier <= TIER_MAX; tier++) {
    const lamps = [];
    if (weapon) for (const y of [-0.17, 0, 0.17])
      lamps.push(rect(w * 0.5 + 0.055, y * h, 0.115, 0.022, 0.040));
    if (tier > 0) {
      const span = tier * TIER_PIP_W + (tier - 1) * TIER_PIP_GAP;
      for (let i = 0; i < tier; i++) {
        const x = -span / 2 + TIER_PIP_W / 2 + i * (TIER_PIP_W + TIER_PIP_GAP);
        lamps.push(rect(x, -h * 0.48, TIER_PIP_W, TIER_PIP_H, 0.040));
      }
    }
    warm.push(compileParts(lamps));
    const socketParts = [];
    for (let i = 0; i < tier; i++) {
      const x = (i - (tier - 1) * 0.5) * 0.26;
      socketParts.push(rect(x, h * 0.5 - 0.005, 0.18, 0.055, 0.022));
    }
    sockets.push(compileParts(socketParts));
  }
  return Object.freeze({
    metal: compileParts(metal), ink: compileParts(ink), signal: compileParts(signal),
    warm: Object.freeze(warm), sockets: Object.freeze(sockets),
  });
}

const PROFILE_GEOMETRY = Object.freeze({
  letter: buildProfileGeometry('letter'),
  mod: buildProfileGeometry('mod'),
});

function artKey(c) { return (c.kind === 'mod' ? 'mod' : 'letter') + ':' + c.letter; }

function artMaterial(tex) {
  return new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    alphaTest: 0.035,
    depthWrite: true,
    side: THREE.DoubleSide,
    forceSinglePass: true,
    fog: true,
    toneMapped: true,
  });
}

function staticMaterial(color, additive = false) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: additive,
    opacity: 1,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: !additive,
    depthTest: true,
    side: THREE.DoubleSide,
    fog: true,
    toneMapped: true,
  });
}

const inkMat = staticMaterial(PAL.capsuleInk);
const metalMat = staticMaterial(PAL.catwalk);
const warmMat = staticMaterial(PAL.muzzle);
const traitMats = Object.freeze({
  muzzle: warmMat,
  modCapsule: staticMaterial(PAL.modCapsule),
  capsule: staticMaterial(PAL.capsule),
  laser: staticMaterial(PAL.shots.L),
  flame: staticMaterial(PAL.shots.F),
});

function signalColor(profile) {
  return profile.signalRole === 'modCapsule' ? PAL.modCapsule : PAL.capsule;
}

function signalMaterial(profile, tier) {
  return new THREE.MeshBasicMaterial({
    color: signalColor(profile),
    transparent: true,
    opacity: RELIQUARY_SIGNAL_ALPHA + tier * 0.018,
    blending: THREE.NormalBlending,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    fog: true,
    toneMapped: true,
  });
}

function scannerMaterial(profile) {
  return new THREE.MeshBasicMaterial({
    color: signalColor(profile),
    transparent: true,
    opacity: RELIQUARY_SCANNER_ALPHA,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    fog: true,
    toneMapped: true,
  });
}

function pickupTier(c) {
  if (c.kind !== 'letter') return 0;
  return clamp(Math.round(c.gun?.tier || 0), 0, TIER_MAX);
}

function transformedGeometryRadius(geometry, x = 0, y = 0, sx = 1, sy = 1, rotation = 0) {
  const position = geometry.getAttribute('position');
  const c = Math.cos(rotation), s = Math.sin(rotation);
  let reach = 0;
  for (let i = 0; i < position.count; i++) {
    const px = position.getX(i) * sx, py = position.getY(i) * sy;
    const tx = x + px * c - py * s, ty = y + px * s + py * c;
    reach = Math.max(reach, Math.hypot(tx, ty));
  }
  return reach;
}

function measureReliquaryReach() {
  let reach = transformedGeometryRadius(panelGeo, 0, 0, RELIQUARY_CASE_W, RELIQUARY_CASE_H);
  for (const profile of Object.values(PROFILE_GEOMETRY)) {
    reach = Math.max(reach,
      transformedGeometryRadius(profile.metal),
      transformedGeometryRadius(profile.ink),
      transformedGeometryRadius(profile.signal));
    for (let tier = 0; tier <= TIER_MAX; tier++) {
      reach = Math.max(reach,
        transformedGeometryRadius(profile.warm[tier]),
        transformedGeometryRadius(profile.sockets[tier]));
    }
  }
  // Scanner at both travel extrema; every hardpoint geometry at all three
  // possible tier-3 stations. This is a transformed-VERTEX measurement, not
  // the old width/height rectangle comparison.
  for (const x of [-RELIQUARY_CASE_W * 0.22, RELIQUARY_CASE_W * 0.22])
    reach = Math.max(reach, transformedGeometryRadius(
      panelGeo, x, 0, 0.030, RELIQUARY_CASE_H * 0.42));
  for (const x of [-0.26, 0, 0.26]) for (const geometry of Object.values(traitGeometry))
    reach = Math.max(reach, transformedGeometryRadius(
      geometry, x, RELIQUARY_CASE_H * 0.5 + 0.045, 0.14, 0.16));
  return reach;
}

const RELIQUARY_RADIAL_REACH = measureReliquaryReach();
if (!Number.isFinite(RELIQUARY_RADIAL_REACH) ||
    RELIQUARY_RADIAL_REACH > CAP.pickupRadius + 1e-6) {
  throw new Error(`Capsule reliquary reach ${RELIQUARY_RADIAL_REACH.toFixed(4)} ` +
    `exceeds pickup radius ${CAP.pickupRadius.toFixed(4)}`);
}
const CAPSULE_SHADOW_FOOTPRINT = Math.min(
  CAP.pickupRadius * 0.78,
  RELIQUARY_RADIAL_REACH * 0.80,
);

// The fixed production row: two merged invariant hardware draws, one atlas
// draw, one merged signal draw, one scanner, one merged warm-lamp draw, one
// merged socket draw, and three selectable hardpoints. Every object/material
// already exists before the simulation can spawn its first capsule.
function createProductionView(rowIndex) {
  const profile = PROFILE_GEOMETRY.letter;
  const signalMat = signalMaterial(RELIQUARY_PROFILE.letter, 0);
  const scannerMat = scannerMaterial(RELIQUARY_PROFILE.letter);
  const root = new THREE.Group();
  root.name = `Capsule reliquary pool row ${rowIndex}`;
  root.visible = false;
  const assembly = new THREE.Group();
  assembly.name = `Capsule reliquary assembly ${rowIndex}`;

  const metal = new THREE.Mesh(profile.metal, metalMat);
  const ink = new THREE.Mesh(profile.ink, inkMat);
  const artSlot = artSlots.values().next().value;
  const art = new THREE.Mesh(artSlot?.geometry || panelGeo, artSlot?.material || inkMat);
  const signal = new THREE.Mesh(profile.signal, signalMat);
  const scanner = new THREE.Mesh(panelGeo, scannerMat);
  const warm = new THREE.Mesh(profile.warm[0], warmMat);
  const sockets = new THREE.Mesh(profile.sockets[0], inkMat);
  const hardpoints = [];

  metal.renderOrder = ink.renderOrder = 2;
  art.renderOrder = 3;
  signal.renderOrder = scanner.renderOrder = warm.renderOrder = 5;
  sockets.renderOrder = 4;
  scanner.name = 'Reliquary contained-core scanner';
  scanner.scale.set(0.030, RELIQUARY_CASE_H * 0.42, 1);
  scanner.position.z = 0.042;
  for (let i = 0; i < TIER_MAX; i++) {
    const hardpoint = new THREE.Mesh(panelGeo, warmMat);
    hardpoint.name = `Capsule hardpoint pool row ${rowIndex}.${i}`;
    hardpoint.scale.set(0.14, 0.16, 1);
    hardpoint.position.z = 0.045;
    hardpoint.renderOrder = 5;
    hardpoint.visible = false;
    hardpoints.push(hardpoint);
  }
  assembly.add(metal, ink, art, signal, scanner, warm, sockets, ...hardpoints);
  root.add(assembly);
  return {
    rowIndex, root, assembly, mesh: root, metal, ink, art, signal, scanner, warm, sockets,
    hardpoints, signalMat, scannerMat, signalBaseAlpha: RELIQUARY_SIGNAL_ALPHA,
    scannerBaseAlpha: RELIQUARY_SCANNER_ALPHA,
    production: true, tier: 0, traits: Object.freeze([]),
    profile: RELIQUARY_PROFILE.letter, slot: artSlot,
  };
}

function configureProduction(v, c, slot) {
  const tier = pickupTier(c);
  const profileKey = c.kind === 'mod' ? 'mod' : 'letter';
  const profile = RELIQUARY_PROFILE[profileKey];
  const geometry = PROFILE_GEOMETRY[profileKey];
  const traits = profile.hardpoints && Array.isArray(c.gun?.traits) ? c.gun.traits : [];

  v.metal.geometry = geometry.metal;
  v.ink.geometry = geometry.ink;
  v.art.geometry = slot.geometry;
  v.art.material = slot.material;
  v.art.scale.set(slot.world[0], slot.world[1], 1);
  // Utility modifiers are keyed vertical cartridges; weapon reliquaries stay
  // horizontal and directional. This single rigid transform gives the two
  // reward families different FAR silhouettes without another texture.
  v.assembly.rotation.z = profileKey === 'mod' ? Math.PI * 0.5 : 0;
  v.signal.geometry = geometry.signal;
  v.warm.geometry = geometry.warm[tier];
  v.warm.visible = geometry.warm[tier].userData.partCount > 0;
  v.sockets.geometry = geometry.sockets[tier];
  v.sockets.visible = geometry.sockets[tier].userData.partCount > 0;
  v.signalMat.color.set(signalColor(profile));
  v.scannerMat.color.set(signalColor(profile));
  v.signalBaseAlpha = RELIQUARY_SIGNAL_ALPHA + tier * 0.018;
  v.signalMat.opacity = v.signalBaseAlpha;
  v.scannerBaseAlpha = RELIQUARY_SCANNER_ALPHA;
  v.scannerMat.opacity = v.scannerBaseAlpha;
  for (let i = 0; i < TIER_MAX; i++) {
    const hardpoint = v.hardpoints[i];
    const trait = traits[i];
    if (!trait) { hardpoint.visible = false; continue; }
    const spec = TRAIT_HARDPOINT[trait] || TRAIT_HARDPOINT.RAPID;
    hardpoint.geometry = traitGeometry[spec.geometry];
    hardpoint.material = traitMats[spec.role];
    hardpoint.position.x = (i - (traits.length - 1) * 0.5) * 0.26;
    hardpoint.position.y = RELIQUARY_CASE_H * 0.5 + 0.045;
    hardpoint.visible = true;
  }
  v.root.userData.accessibleName = (c.gun?.shortLabel || slot.name) + ' reliquary pickup';
  v.root.userData.gunTier = tier;
  v.root.userData.presentation = profile.role;
  v.root.userData.traitHardpoints = traits;
  v.tier = tier;
  v.traits = traits;
  v.profile = profile;
  v.slot = slot;
  v.production = true;
  v.mesh = v.root;
  v.root.visible = true;
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

// The complete failure presentation is fixed-capacity too. Prebuilding every
// legal weapon/mod face plus the pop-reward R means a disabled or failed atlas
// cannot smuggle canvas, texture, material, mesh, or scene-graph work into a
// combat frame.
const FALLBACK_KEYS = Object.freeze(['letter:R', ...Object.keys(ART_TABLE)]);
const fallbackMaterials = new Map();

function buildFallbackMaterials(key) {
  const [kind, letter] = key.split(':');
  const bg = kind === 'mod' ? PAL.modCapsule : PAL.capsule;
  const face = new THREE.MeshBasicMaterial({ map: faceTexture(letter, bg) });
  if (!LEGIBILITY_ON) return face;
  const plate = new THREE.MeshBasicMaterial({ map: faceTexture(null, bg) });
  return [plate, plate, plate, plate, face, face];
}

for (const key of FALLBACK_KEYS) fallbackMaterials.set(key, buildFallbackMaterials(key));
const defaultFallbackMaterial = fallbackMaterials.get('letter:R');

const meshes = new Map();
const poolRows = [];
const freeRows = [];
const ownerAt = new Array(CAPSULE_POOL_MAX).fill(null);
let poolCursor = 0;
let poolSaturations = 0;

// All rows live in the scene from boot onward. Claiming a row changes only
// visibility, transforms, and references to immutable shared resources.
for (let rowIndex = 0; rowIndex < CAPSULE_POOL_MAX; rowIndex++) {
  const v = createProductionView(rowIndex);
  const fallbackMesh = new THREE.Mesh(capsuleGeo, defaultFallbackMaterial);
  fallbackMesh.name = `Capsule fallback pool row ${rowIndex}`;
  // Keep this exact fallback gain: it is the far-view contract and remains
  // statically asserted by T-003.
  fallbackMesh.scale.setScalar(GLYPH_GAIN);
  fallbackMesh.visible = false;
  v.fallbackMesh = fallbackMesh;
  v.owner = null;
  poolRows.push(v);
  freeRows.push(rowIndex);
  scene.add(v.root, fallbackMesh);
}

function claimRow(c) {
  let rowIndex = freeRows.pop();
  if (rowIndex === undefined) {
    // Saturation is intentionally bounded and cosmetic: recycle the oldest
    // fixed row without touching simulation ownership. Twenty-four rows leave
    // almost 2x headroom above the measured campaign peak of thirteen.
    rowIndex = poolCursor;
    poolCursor = (poolCursor + 1) % CAPSULE_POOL_MAX;
    const oldOwner = ownerAt[rowIndex];
    if (oldOwner) {
      meshes.delete(oldOwner);
      releaseContactShadow(oldOwner);
    }
    poolSaturations++;
  }
  const v = poolRows[rowIndex];
  v.root.visible = false;
  v.fallbackMesh.visible = false;
  v.owner = c;
  ownerAt[rowIndex] = c;
  meshes.set(c, v);
  return v;
}

function configureFallback(v, c) {
  v.root.visible = false;
  v.fallbackMesh.material = fallbackMaterials.get(artKey(c)) || defaultFallbackMaterial;
  v.fallbackMesh.visible = true;
  v.fallbackMesh.userData.accessibleName = `${c.letter || 'R'} fallback capsule pickup`;
  v.production = false;
  v.mesh = v.fallbackMesh;
  v.slot = null;
  v.tier = 0;
  v.traits = Object.freeze([]);
  v.profile = RELIQUARY_PROFILE[c.kind === 'mod' ? 'mod' : 'letter'];
}

function spawned(c) {
  const v = claimRow(c);
  const slot = artSlots.get(artKey(c));
  if (slot && slot.state === 'ready') {
    v.fallbackMesh.visible = false;
    configureProduction(v, c, slot);
  } else {
    configureFallback(v, c);
  }
}

function removed(c) {
  const v = meshes.get(c);
  if (!v) return;
  meshes.delete(c);
  releaseContactShadow(c);
  v.root.visible = false;
  v.fallbackMesh.visible = false;
  if (ownerAt[v.rowIndex] !== c) return;
  ownerAt[v.rowIndex] = null;
  v.owner = null;
  freeRows.push(v.rowIndex);
}

function sync(c) {
  const v = meshes.get(c);
  if (!v) return;
  // Capsules may be generated for the whole climb, but rewards on an
  // unbuilt/future fold do not exist visually yet. Keep the sim row alive;
  // only its pixels and contact shadow are withheld until ownership commits.
  if (!routeRenderable(c.x)) {
    v.mesh.visible = false;
    releaseContactShadow(c);
    return;
  }
  // Expiring pop-capsules blink through their last stretch, regardless of
  // whether pixels or fallback geometry are drawing them.
  v.mesh.visible = c.mode !== 'pop' || c.dieAt - gameMs > CAP.blinkLastMs || blink();
  const towerYaw = placeOnTower(
    v.mesh, c.x, c.y, v.production ? ART_SURFACE_DEPTH : 0,
  );

  if (v.production) {
    // The reliquary is rigid machinery. Its only local motion is a constant-
    // size scanning slit translating inside the contained core. The painted
    // casing and physical tier hardware carry the idle read; only this moving
    // scan is allowed additive output.
    v.mesh.rotation.y = towerYaw;
    v.scanner.position.x = Math.sin(c.t * 2.65 + 0.35) * v.slot.world[0] * 0.22;
    v.signalMat.opacity = v.signalBaseAlpha *
      (0.92 + Math.max(0, Math.sin(c.t * 4.1 + 0.8)) * 0.08);
    v.scannerMat.opacity = v.scannerBaseAlpha *
      (0.72 + Math.max(0, Math.sin(c.t * 4.8 + 0.4)) * 0.28);
  } else {
    v.mesh.rotation.y = towerYaw + (LEGIBILITY_ON
      ? Math.sin(c.t * CAPSULE_SWEEP_FREQ) * CAPSULE_SWEEP_RAD
      : c.t * 2.2);
  }
  syncContactShadow(c, c.x, c.y,
    v.production ? CAPSULE_SHADOW_FOOTPRINT : CAP.size / 2);
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
  let production = 0, fallback = 0, weapons = 0, modifiers = 0, hardpoints = 0;
  const tiers = [0, 0, 0, 0];
  for (const v of meshes.values()) {
    if (v.production) {
      production++;
      tiers[v.tier || 0]++;
      if (v.profile.role === 'weapon') weapons++; else modifiers++;
      hardpoints += v.traits.length;
    } else fallback++;
  }
  return {
    atlas: { file: ATLAS_FILE, sizePx: ATLAS_SIZE, enabled: CAPSULE_ART_ON },
    presentation: {
      style: 'grounded-meridian-reliquary',
      envelopeTiles: [RELIQUARY_MAX_W, RELIQUARY_MAX_H],
      pickupDiameterTiles: CAP.pickupRadius * 2,
      radialReachTiles: RELIQUARY_RADIAL_REACH,
      contactShadowFootprintTiles: CAPSULE_SHADOW_FOOTPRINT,
      rigidScale: true,
      profiles: RELIQUARY_PROFILE,
    },
    assets,
    live: { production, fallback, weapons, modifiers, hardpoints, tiers },
    pool: {
      capacity: CAPSULE_POOL_MAX,
      live: meshes.size,
      free: freeRows.length,
      saturations: poolSaturations,
      rowsBuiltAtBoot: poolRows.length,
      objectsPerRow: 12,
      allocationsDuringSpawnAndSync: { geometry: 0, material: 0, mesh: 0 },
      productionDraws: {
        modifier: 5,
        weaponTier1: 8,
        weaponTier3: 10,
        previousModifier: 21,
        previousWeaponTier1: 25,
        previousWeaponTier3: 31,
      },
    },
  };
}

if (typeof window !== 'undefined') window.__HB_CAPSULE_ART = capsuleArtSnapshot;

let capsuleViewInstalled = false;
export function initCapsuleView() {
  if (capsuleViewInstalled) return false;
  installView({ capsules: { spawned, removed, sync } });
  capsuleViewInstalled = true;
  return true;
}
