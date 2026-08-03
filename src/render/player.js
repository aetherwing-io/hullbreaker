/* ======================= PLAYER RIG (VISUAL) ====================== */
/* RIG's body, gun pose, and i-frame flicker. Driven entirely by sim
   fields on the player row — the rig itself carries no gameplay state.

   T-040, THIRD REWORK. First the operator rejected six boxes ("this is RIG?
   i was hoping for a much higher quality asset in line with the concept
   art") — at RIG's frozen ~30px on-screen height (decisions.md entry 7)
   more geometry cannot read. Second, a plain-shapes canvas sprite (still
   below: HELMET/TORSO/LEG_FRONT/LEG_BACK) replaced the boxes. Third,
   decisions.md entries 16/17 authorized runtime asset loading and confirmed
   FAR stays permanent, so RIG is now a REAL PNG SPRITE loaded through
   THREE.TextureLoader — the plain-shapes canvas version is kept as the
   FALLBACK plane, shown immediately and left showing if the image never
   loads. Entry 16's one attached condition: a failed/missing asset must
   degrade visibly and safely, and the SIM MUST NEVER BRANCH on which one
   rendered — nothing here writes back to src/sim/player.js, and the fallback
   is a fully-working render path on its own, not a placeholder.

   FOURTH FIX (playtest FAIL, same session): the async texture fetch, left to
   land mid-run, measurably broke `--deterministic` mode — three identical
   scripted runs landed at wildly different `gameMs`/`minEdgeMargin` because
   the fetch + image decode + first-use GPU upload competed with the frame
   loop for main-thread time on an unpredictable frame. FIFTH FIX (same
   session): T-049 hit the identical defect loading its own hostile sprites
   and built the shared answer, `src/render/preload.js` — one boot gate, one
   wall-clock budget, every registered texture uploaded during boot or
   abandoned. This module now registers through THAT gate (`preloadTexture`/
   `awaitPreloads`) instead of carrying its own bespoke timeout/lock-in
   machinery, so RIG's sprite and every other lane's runtime art share one
   contract and one measured cost instead of each lane re-deriving it. See
   `src/render/preload.js`'s own header for the full reasoning (residency
   means uploaded, not fetched; a late arrival after the budget closes is
   dropped, never applied mid-run).

   The shipped path now uses one gunless body atlas plus one painted five-gun
   atlas. If that body atlas is unavailable, the synchronous canvas silhouette
   takes over; the earlier horizontal-rifle cutout is never allowed back onto
   the live frame. Every path mounts the eight-way weapon at the simulation's
   real muzzle. */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { QUERY } from '../mode.js';
import { BEND_S, facetAtBends } from '../pure/path.js';
import { installView } from '../sim/bridge.js';
import { gameMs, blink } from '../sim/time.js';
import { player } from '../sim/player.js';
import { turningCornerOwnsJoint } from '../sim/wavegate.js';
import { currentGun, currentWeapon } from '../sim/weapons.js';
import { flowSnapshot } from '../sim/flow.js';
import { scoreNotchNow } from '../sim/score.js';
import {
  CANVAS_H, CANVAS_W, GUN_BOX, HELMET, LEG_BACK, LEG_FRONT,
  RIG_GUN_MUZZLE_X, RIG_RECOIL_MS, RIG_RECOIL_TILES,
  RIG_AIM_FRAMES, RIG_AIM_WORLD_PER_PIXEL, RIG_BODY_ATLAS_H,
  RIG_BODY_ATLAS_PATH, RIG_BODY_ATLAS_W, RIG_BODY_VISUAL_H, RIG_IDLE_GUNLESS,
  RIG_RUN_CYCLE_MS, RIG_RUN_FRAMES, RIG_RUN_HAND_X,
  RIG_SPRITE_H, RIG_SPRITE_PATH,
  RIG_WEAPON_ART, RIG_WEAPON_ATLAS_H, RIG_WEAPON_ATLAS_PATH, RIG_WEAPON_ATLAS_W,
  SPRITE_H, SPRITE_W, TORSO, VISOR,
} from '../pure/rig.js';
import { awaitPreloads, preloadTexture } from './preload.js';
import { scene } from './scene.js';
import { cameraFacingFacet } from './camera.js';
import { placeOnTower } from './tower.js';
import { PAL } from './palette.js';
import { syncContactShadow } from './contact.js';

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

// Traces one of src/pure/rig.js's polygons onto the current 2D context,
// scaled to (w, h). A function rather than a stored path: Canvas2D paths
// are consumed by fill/clip/stroke in ways that are easiest to reason about
// by just re-tracing before each use.
function tracePoly(g, points, w, h) {
  g.beginPath();
  g.moveTo(points[0][0] * w, points[0][1] * h);
  for (let i = 1; i < points.length; i++) g.lineTo(points[i][0] * w, points[i][1] * h);
  g.closePath();
}

function traceEllipse(g, e, w, h) {
  g.beginPath();
  g.ellipse(e.x * w, e.y * h, e.rx * w, e.ry * h, 0, 0, Math.PI * 2);
}

/* Rasterizes RIG from src/pure/rig.js's shapes into a canvas: legs (mid),
   torso (dark, its own back-side pack bulge baked into the shape), helmet
   (mid), one accent visor. FLAT fills only — an earlier pass here tried a
   soft value-lift gradient and a thin rim-light/ink-outline stroke, and
   NEITHER survived the GPU's own minification down to RIG's true ~12px
   width: a stroke or gradient band that is only a couple of canvas texels
   wide is already sub-pixel once minified that far, so it blends away to
   nothing instead of reading as a separate feature (see reports/tasks/
   T-040/build.md's iteration log — caught by sampling actual on-screen
   pixels, not by trusting the flat 2D debug dump). What DOES survive
   minification is a BROAD, single-flat-color region occupying a real
   fraction of the figure's width — so every zone below is one flat fill,
   sized generously, and the shape's own silhouette (helmet dome, the
   pack's back bulge, two independently-posed legs) carries the "crafted"
   read instead of fine linework. Built once at module load — RIG has
   exactly one instance for the whole run (T-039's precedent note on
   src/render/contact.js applies here too), so there is no per-frame or
   per-instance redraw. */
function paintRigTexture() {
  const cv = document.createElement('canvas');
  cv.width = CANVAS_W;
  cv.height = CANVAS_H;
  const g = cv.getContext('2d');
  const w = CANVAS_W, h = CANVAS_H;
  const dark = hex(PAL.playerDark), mid = hex(PAL.playerMid), accent = hex(PAL.gun);

  g.fillStyle = mid;
  tracePoly(g, LEG_BACK, w, h); g.fill();
  tracePoly(g, LEG_FRONT, w, h); g.fill();

  g.fillStyle = dark;
  tracePoly(g, TORSO, w, h); g.fill();

  g.fillStyle = mid;
  traceEllipse(g, HELMET, w, h); g.fill();

  // the one accent: a warm visor glint on the helmet's front-lower face
  g.fillStyle = accent;
  g.beginPath();
  g.ellipse(VISOR.x * w, VISOR.y * h, VISOR.rx * w, VISOR.ry * h, 0, 0, Math.PI * 2);
  g.fill();

  const tex = new THREE.CanvasTexture(cv);
  return tex;
}

// A soft, palette-tinted readability field. It is not a second silhouette:
// the white canvas only supplies alpha and the material supplies the authored
// player/muzzle role. At the shipped FAR camera this survives minification as
// one quiet halo while the sprite still carries the actual body shape.
function paintGlowTexture() {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 64;
  const g = cv.getContext('2d');
  const glow = g.createRadialGradient(32, 32, 1, 32, 32, 32);
  // Tight rim rather than an opaque orb: the production cutout owns the
  // silhouette and this only separates its edge from rust or teal behind it.
  glow.addColorStop(0, hex(PAL.muzzle) + '20');
  glow.addColorStop(0.30, hex(PAL.muzzle) + '70');
  glow.addColorStop(0.58, hex(PAL.muzzle) + '34');
  glow.addColorStop(1, hex(PAL.muzzle) + '00');
  g.fillStyle = glow;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

const rig = new THREE.Group();
const bodyGroup = new THREE.Group();
rig.add(bodyGroup);
const glowTexture = paintGlowTexture();

const AIM_MASK_DIRECTIONS = Object.freeze({
  right: [1, 0],
  'up-right': [Math.SQRT1_2, Math.SQRT1_2],
  up: [0, 1],
  'down-right': [Math.SQRT1_2, -Math.SQRT1_2],
});

// Shared by the boot-time aim-mask painter. Keep this module-scope definition
// independent of the live fold-visibility path: both are pure easing math,
// but removing one visual consumer must never make the asset gate fail boot.
function smoothstep01(t) {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
}

// The gunless aim paintings deliberately include complete open hands so the
// source art remains reusable. In-game the simulation muzzle is closer to the
// torso than those presentation hands. A soft pose-local stencil removes only
// the limb pixels that would protrude past the real bore; the painted weapon
// sits in front and supplies the final connected silhouette. Boots, helmet and
// torso never enter these narrow arm gates.
function paintAimMaskTexture(name, spec) {
  const size = 256;
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const g = cv.getContext('2d');
  const image = g.createImageData(size, size);
  const [ax, ay] = AIM_MASK_DIRECTIONS[name];
  const tipX = ax * 0.6;
  const tipY = CONFIG.player.muzzleY + ay * 0.5;
  const tipAlong = tipX * ax + tipY * ay;
  const gate = name === 'right'
    ? { x0: 270, x1: 305, y0: 72, y1: 270 }
    : name === 'up-right'
      ? { x0: 235, x1: 270, y0: -20, y1: 235 }
      : name === 'up'
        ? { x0: 225, x1: 247, y0: -20, y1: 220 }
        : { x0: 215, x1: 250, y0: 72, y1: 238 };
  for (let y = 0; y < size; y++) {
    const py = (y + 0.5) / size * spec.trimH;
    const wy = (spec.trimH - py) * RIG_AIM_WORLD_PER_PIXEL;
    const gy0 = smoothstep01((py - gate.y0) / 14);
    const gy1 = 1 - smoothstep01((py - gate.y1) / 14);
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5) / size * spec.trimW;
      const wx = (px - spec.anchorX) * RIG_AIM_WORLD_PER_PIXEL;
      const along = wx * ax + wy * ay;
      const beyond = smoothstep01((along - (tipAlong - 0.055)) / 0.11);
      // UP's glove is above the helmet while its forearm runs beside it. Use
      // a stepped gate so the glove disappears without shaving the helmet.
      const x0 = name === 'up' && py < 98 ? -100 : gate.x0;
      const x1 = name === 'up' && py < 98 ? -50 : gate.x1;
      const gx = smoothstep01((px - x0) / Math.max(1, x1 - x0));
      const remove = beyond * gx * gy0 * gy1;
      const c = Math.round(255 * (1 - remove));
      const k = (y * size + x) * 4;
      image.data[k] = c; image.data[k + 1] = c; image.data[k + 2] = c; image.data[k + 3] = 255;
    }
  }
  g.putImageData(image, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

const aimMaskTextures = Object.freeze(Object.fromEntries(
  Object.entries(RIG_AIM_FRAMES).map(([name, spec]) => [name, paintAimMaskTexture(name, spec)]),
));

// MeshStandardMaterial (LIT), not Basic, for BOTH planes below: palette.js's
// own header note says every token here is authored against what the light
// rig + ACES tone mapping PRODUCES, not the raw hex — an unlit material
// feeds a texture's raw RGB straight into that tone curve with no lighting
// attenuation first, and at these values ACES's midtone compression washed
// dark and mid almost to the same near-white (measured on screen: confirmed
// with ?view=near, not just the shipped FAR distance, which ruled out a
// minification artifact — see reports/tasks/T-040/build.md's iteration
// log). transparent BLENDING, not an alphaTest cutout: at RIG's tiny
// on-screen size the GPU's own mipmapping blurs a texture's alpha edges
// hard enough that a 0.5 cutoff discarded almost the whole shape, leaving a
// paper-thin sliver (same iteration log).

// FALLBACK plane: the plain-shapes canvas sprite. Built and shown
// immediately (synchronous, cannot fail) so RIG is never absent for even
// one frame while the real sprite is still loading.
const fallbackTexture = paintRigTexture();
const fallbackMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(SPRITE_W, SPRITE_H),
  new THREE.MeshStandardMaterial({
    map: fallbackTexture, emissive: PAL.player, emissiveMap: fallbackTexture,
    emissiveIntensity: 0.44, transparent: true, alphaTest: 0.015,
    forceSinglePass: true, depthWrite: false, side: THREE.FrontSide, fog: false,
  }),
);
fallbackMesh.position.set(0, SPRITE_H / 2, 0);
bodyGroup.add(fallbackMesh);

function runSpriteGeometry(spec) {
  const h = RIG_BODY_VISUAL_H;
  const w = spec.trimW / spec.trimH * h;
  const geo = new THREE.PlaneGeometry(w, h);
  const handX = (spec.handX / spec.trimW - 0.5) * w;
  geo.translate(RIG_RUN_HAND_X - handX, (h - RIG_SPRITE_H) / 2, 0);
  return geo;
}

const idleGunlessGeometry = runSpriteGeometry(RIG_IDLE_GUNLESS);
const runFrameGeometry = Object.freeze(Object.fromEntries(
  Object.entries(RIG_RUN_FRAMES).map(([name, spec]) => [name, runSpriteGeometry(spec)]),
));

function aimSpriteGeometry(spec) {
  // All four poses share one measured pixel scale. In particular, UP's trim
  // is taller because its arms are raised—not because RIG becomes smaller.
  const w = spec.trimW * RIG_AIM_WORLD_PER_PIXEL;
  const h = spec.trimH * RIG_AIM_WORLD_PER_PIXEL;
  const geo = new THREE.PlaneGeometry(w, h);
  // Pin the midpoint between the planted boots at x=0 and the bottom alpha
  // row at y=0. This prevents helmet/feet pops while aim selects a new crop.
  geo.translate((spec.trimW / 2 - spec.anchorX) * RIG_AIM_WORLD_PER_PIXEL,
    (h - RIG_SPRITE_H) / 2, 0);
  return geo;
}

const aimFrameGeometry = Object.freeze(Object.fromEntries(
  Object.entries(RIG_AIM_FRAMES).map(([name, spec]) => [name, aimSpriteGeometry(spec)]),
));

const spriteMesh = new THREE.Mesh(
  idleGunlessGeometry,
  new THREE.MeshStandardMaterial({
    emissive: PAL.player, emissiveIntensity: 0.44,
    transparent: true, alphaTest: 0.015, side: THREE.FrontSide,
    forceSinglePass: true, fog: false,
  }),
);
spriteMesh.position.set(0, RIG_SPRITE_H / 2, 0);
spriteMesh.visible = false;
bodyGroup.add(spriteMesh);

// ?rig=canvas is the escape hatch BACK to the plain-shapes fallback, for a
// direct side-by-side comparison — decisions.md entry 16 retired blanket
// off-by-default flags for approved work, so the sprite is the shipped
// DEFAULT and this is the opt-out, not the other way around.
const RIG_FORCE_CANVAS = QUERY.get('rig') === 'canvas';
// Kept as explicit compatibility provenance for T-040 and old save/build
// audits; this baked-rifle source is intentionally never requested or drawn.
const RETIRED_BAKED_BODY_SOURCE = RIG_SPRITE_PATH;
let spriteReady = false;
let actionReady = false;
let actionShowing = false;
let shownBodyFrame = 'canvas';
const idleUsesLegacy = false;
const idleGunlessSlot = { ready: false, tex: null, error: null, spec: RIG_IDLE_GUNLESS };
const runFrameSlots = Object.fromEntries(Object.entries(RIG_RUN_FRAMES).map(([name, spec]) => [name, {
  ready: false, tex: null, error: null, spec,
}]));
const aimFrameSlots = Object.fromEntries(Object.entries(RIG_AIM_FRAMES).map(([name, spec]) => [name, {
  ready: false, tex: null, error: null, spec,
}]));
const weaponArtSlots = Object.fromEntries(Object.entries(RIG_WEAPON_ART).map(([letter, spec]) => [letter, {
  ready: false, tex: null, error: null, spec,
}]));

function applyAtlasCrop(tex, spec, atlasW, atlasH) {
  const x = spec.atlasX + spec.trimX;
  const y = spec.atlasY + spec.trimY;
  tex.offset.set(x / atlasW, (atlasH - y - spec.trimH) / atlasH);
  tex.repeat.set(spec.trimW / atlasW, spec.trimH / atlasH);
  // offset/repeat update the texture matrix automatically. `needsUpdate`
  // would re-upload the entire atlas every time a stride pose or gun changes.
}

// Runtime art enters through the shared boot gate. Nothing in src/sim/ reads
// these slots, so an asset failure can only choose a render fallback; it can
// never change movement, hitboxes, firing, or deterministic timing.
if (!RIG_FORCE_CANVAS) {
  // One lossless atlas request supplies idle, three run poses, and four aim
  // poses. The source PNGs remain separate on disk; wide transparent gutters
  // keep mip chains from bleeding into one another.
  preloadTexture(new URL(RIG_BODY_ATLAS_PATH, import.meta.url).href).then((entry) => {
    if (entry.state !== 'ready') {
      idleGunlessSlot.error = entry.error || entry.state;
      for (const slot of Object.values(runFrameSlots)) slot.error = idleGunlessSlot.error;
      for (const slot of Object.values(aimFrameSlots)) slot.error = idleGunlessSlot.error;
      console.warn('RIG body atlas did not load (' + idleGunlessSlot.error +
        '); showing the procedural fallback instead.');
      return;
    }
    idleGunlessSlot.tex = entry.tex;
    idleGunlessSlot.ready = true;
    for (const slot of Object.values(runFrameSlots)) {
      slot.tex = entry.tex;
      slot.ready = true;
    }
    for (const slot of Object.values(aimFrameSlots)) {
      slot.tex = entry.tex;
      slot.ready = true;
    }
    spriteReady = true;
    actionReady = true;
  });

  // A second atlas supplies every gun. Only one gun is visible, so changing
  // the shared texture transform on pickup is enough; the five source images
  // neither issue five requests nor allocate five GPU textures.
  preloadTexture(new URL(RIG_WEAPON_ATLAS_PATH, import.meta.url).href).then((entry) => {
    if (entry.state !== 'ready') {
      for (const slot of Object.values(weaponArtSlots))
        slot.error = entry.error || entry.state;
      return;
    }
    for (const slot of Object.values(weaponArtSlots)) {
      slot.tex = entry.tex;
      slot.ready = true;
    }
  });
}
// THE BOOT GATE. Top-level await: every module that (transitively) imports
// this one — in practice src/main.js, via its own side-effect `import
// './render/player.js'` — does not resume evaluation past that import, and
// so cannot reach its own `requestAnimationFrame(frame)` call, until every
// asset preload.js knows about (RIG's sprite, and whatever else other lanes
// have registered by this point in the module graph) is resident or the
// shared budget has given up on it. See src/render/preload.js's header for
// why this is a shared gate rather than a per-lane timeout: a second bespoke
// mechanism here would be exactly the thing decisions.md entry 16's
// playtest FAIL taught this lane not to build twice.
await awaitPreloads();

const gunGroup = new THREE.Group();

// A painted weapon is one plane whose visible bore ends at the same local
// x for every chassis. Translating by half its width puts the stock behind
// the hand pivot (local x~=0), while the measured muzzle row corrects the
// common failure where a centered image rotates around the wrong line.
function weaponArtGeometry(spec) {
  const h = spec.worldW * spec.trimH / spec.trimW;
  const geo = new THREE.PlaneGeometry(spec.worldW, h);
  const y = (spec.muzzleY / spec.trimH - 0.5) * h;
  geo.translate(RIG_GUN_MUZZLE_X - spec.worldW / 2, y, 0);
  return geo;
}

const GUN_ART_GEOMETRIES = Object.freeze(Object.fromEntries(
  Object.entries(RIG_WEAPON_ART).map(([letter, spec]) => [letter, weaponArtGeometry(spec)]),
));

// One mesh, five authored geometries. Filled convex plates beat thin line art
// at RIG's ~30px height, while vertex colours preserve material zones inside
// the single draw call. Every silhouette points +x and terminates at the same
// RIG_GUN_MUZZLE_X, so changing chassis never changes the shot origin.
function gunGeometry(parts) {
  const positions = [], colors = [], indices = [];
  const color = new THREE.Color();
  for (let p = 0; p < parts.length; p++) {
    const part = parts[p];
    const first = positions.length / 3;
    color.set(part.color);
    const z = p * 0.002;
    for (const [x, y] of part.points) {
      positions.push(x, y, z);
      colors.push(color.r, color.g, color.b);
    }
    for (let k = 1; k < part.points.length - 1; k++)
      indices.push(first, first + k, first + k + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

const I = PAL.capsuleInk, D = PAL.playerDark, M = PAL.playerMid;
const A = PAL.gun, W = PAL.muzzle;
const mx = RIG_GUN_MUZZLE_X;
const GUN_GEOMETRIES = {
  // RIVET: long receiver, hard muzzle brake, sabot stock and top sight.
  R: gunGeometry([
    { color: I, points: [[-0.05,-0.07],[0.16,-0.13],[0.25,-0.04],[0.13,0.09],[-0.05,0.06]] },
    { color: D, points: [[0.12,-0.11],[0.48,-0.11],[0.55,-0.03],[0.48,0.11],[0.15,0.12]] },
    { color: A, points: [[0.17,-0.08],[0.44,-0.08],[0.49,-0.02],[0.43,0.07],[0.20,0.08]] },
    { color: I, points: [[0.45,-0.032],[mx,-0.032],[mx,0.032],[0.45,0.032]] },
    { color: A, points: [[mx-0.08,-0.085],[mx,-0.085],[mx,0.085],[mx-0.08,0.085]] },
    { color: W, points: [[0.25,0.12],[0.55,0.12],[0.50,0.16],[0.29,0.16]] },
    { color: I, points: [[0.21,-0.11],[0.35,-0.11],[0.30,-0.27],[0.19,-0.23]] },
  ]),
  // SCATTER: twin blunt bores and a broad reinforced receiver.
  S: gunGeometry([
    { color: I, points: [[-0.05,-0.08],[0.16,-0.15],[0.27,-0.07],[0.16,0.10],[-0.05,0.07]] },
    { color: M, points: [[0.12,-0.15],[0.48,-0.15],[0.57,-0.08],[0.54,0.12],[0.18,0.15]] },
    { color: PAL.shots.S, points: [[0.20,-0.10],[0.46,-0.10],[0.51,-0.03],[0.45,0.08],[0.21,0.10]] },
    { color: I, points: [[0.45,-0.13],[mx,-0.13],[mx,-0.045],[0.45,-0.045]] },
    { color: I, points: [[0.45,0.045],[mx,0.045],[mx,0.13],[0.45,0.13]] },
    { color: W, points: [[mx-0.06,-0.16],[mx,-0.16],[mx,0.16],[mx-0.06,0.16]] },
    { color: D, points: [[0.20,-0.15],[0.35,-0.15],[0.29,-0.29],[0.17,-0.25]] },
  ]),
  // SUNSPEAR: compact breech feeding a long cyan crystal corridor.
  L: gunGeometry([
    { color: I, points: [[-0.04,-0.06],[0.18,-0.12],[0.28,-0.04],[0.17,0.10],[-0.04,0.06]] },
    { color: D, points: [[0.14,-0.12],[0.39,-0.12],[0.47,-0.04],[0.39,0.12],[0.15,0.12]] },
    { color: PAL.shots.L, points: [[0.34,-0.055],[mx-0.03,-0.025],[mx,0],[mx-0.03,0.025],[0.34,0.055]] },
    { color: W, points: [[0.26,-0.025],[mx-0.05,-0.012],[mx,0],[mx-0.05,0.012],[0.26,0.025]] },
    { color: PAL.shots.L, points: [[0.38,0.07],[0.61,0.16],[0.57,0.06]] },
    { color: PAL.shots.L, points: [[0.38,-0.07],[0.57,-0.06],[0.61,-0.16]] },
    { color: I, points: [[0.19,-0.12],[0.31,-0.12],[0.27,-0.26],[0.17,-0.22]] },
  ]),
  // HUNGER ENGINE: a short predatory guidance body with steering fins.
  H: gunGeometry([
    { color: I, points: [[-0.04,-0.06],[0.13,-0.13],[0.25,-0.07],[0.17,0.10],[-0.04,0.07]] },
    { color: D, points: [[0.12,0],[0.26,-0.17],[0.55,-0.12],[0.70,0],[0.55,0.12],[0.26,0.17]] },
    { color: PAL.shots.H, points: [[0.22,0],[0.34,-0.10],[0.56,-0.07],[0.65,0],[0.56,0.07],[0.34,0.10]] },
    { color: W, points: [[0.30,-0.025],[mx-0.03,-0.018],[mx,0],[mx-0.03,0.018],[0.30,0.025]] },
    { color: PAL.shots.H, points: [[0.34,0.12],[0.49,0.27],[0.54,0.10]] },
    { color: PAL.shots.H, points: [[0.34,-0.12],[0.54,-0.10],[0.49,-0.27]] },
    { color: I, points: [[0.18,-0.11],[0.31,-0.11],[0.27,-0.24],[0.16,-0.21]] },
  ]),
  // CINDERMOUTH: fuel belly and a broad ceramic combustion nozzle.
  F: gunGeometry([
    { color: I, points: [[-0.04,-0.07],[0.15,-0.14],[0.27,-0.06],[0.16,0.10],[-0.04,0.07]] },
    { color: D, points: [[0.12,-0.13],[0.46,-0.13],[0.55,-0.06],[0.50,0.12],[0.17,0.14]] },
    { color: PAL.shots.F, points: [[0.18,-0.11],[0.42,-0.11],[0.48,-0.03],[0.41,0.09],[0.20,0.10]] },
    { color: M, points: [[0.45,-0.09],[0.66,-0.18],[mx,-0.16],[mx,0.16],[0.66,0.18],[0.45,0.09]] },
    { color: PAL.shots.F, points: [[0.53,-0.055],[mx,-0.09],[mx,0.09],[0.53,0.055]] },
    { color: I, points: [[0.16,-0.14],[0.36,-0.14],[0.39,-0.29],[0.19,-0.31],[0.10,-0.23]] },
    { color: W, points: [[mx-0.045,-0.12],[mx,-0.12],[mx,0.12],[mx-0.045,0.12]] },
  ]),
};

// An unknown/corrupt chassis falls back to the authored RIVET silhouette.
// GUN_BOX remains the pure swept-reach contract, but no production failure
// path is allowed to turn the held weapon back into a featureless rectangle.
const fallbackGunGeo = GUN_GEOMETRIES.R;

gunGroup.position.set(0, 1.05, 0.25);
const gun = new THREE.Mesh(
  weaponArtSlots.R.ready ? GUN_ART_GEOMETRIES.R : GUN_GEOMETRIES.R,
  new THREE.MeshStandardMaterial({
    color: W, vertexColors: !weaponArtSlots.R.ready,
    map: weaponArtSlots.R.ready ? weaponArtSlots.R.tex : null,
    emissiveMap: weaponArtSlots.R.ready ? weaponArtSlots.R.tex : null,
    emissive: PAL.gun, emissiveIntensity: 0.48,
    roughness: 0.38, metalness: 0.42,
    transparent: true, alphaTest: 0.018, forceSinglePass: true,
    side: THREE.DoubleSide, flatShading: true, fog: false,
  })
);
gun.position.set(0, 0, 0);
gun.renderOrder = 4;
gunGroup.add(gun);
rig.add(gunGroup);

const rigGlow = new THREE.Sprite(new THREE.SpriteMaterial({
  map: glowTexture, color: PAL.player, transparent: true, opacity: 0.20,
  blending: THREE.AdditiveBlending, depthWrite: false,
}));
rigGlow.position.set(0, 0.95, -0.12);
rigGlow.scale.set(2.80, 2.45, 1);
rigGlow.renderOrder = 1;
rig.add(rigGlow);

// The jump flare makes the movement state legible before the viewer resolves
// the character's tiny legs. It is a short warm-white streak, never a new
// gameplay object and never a light/hitbox the simulation can observe.
const jumpFlare = new THREE.Sprite(new THREE.SpriteMaterial({
  map: glowTexture, color: PAL.muzzle, transparent: true, opacity: 0.72,
  blending: THREE.AdditiveBlending, depthWrite: false,
}));
jumpFlare.position.set(-0.18, 0.08, 0.08);
jumpFlare.scale.set(0.5, 1.0, 1);
jumpFlare.renderOrder = 3;
rig.add(jumpFlare);

scene.add(rig);

// T-039 (S6, contact shadows): RIG has exactly one row, for its whole
// lifetime — never spawned or removed the way a hostile/capsule is — so a
// stable module-level identity is all `syncContactShadow` needs; there is no
// matching release call (see src/render/contact.js's header note).
const RIG_SHADOW_ID = Symbol('rig-contact-shadow');
const RIG_FOOTPRINT = CONFIG.player.width / 2;

// The route's armour and authored solids are boxes centred on the logical
// play plane, with their camera-facing skin roughly one world unit outward.
// Actors still simulate at depth zero, but drawing RIG there lets that skin
// depth-occlude the entire character at some jump/platform combinations --
// especially obvious in a narrow portrait crop. Keep the simulation and
// contact shadow on their exact (s, y), while lifting only the visual rig onto
// the readable face of the hull.
const RIG_SURFACE_DEPTH = 1.15;
const PORTRAIT_ASPECT = 0.72;
let seenNextFireAt = 0;
let lastShotAt = -1e9;
let lastVisualMs = 0;
let lastVisualX = player.x;
let lastTravelSpeed = 0;
let runPhase = 0;
let wasGrounded = player.grounded;
let landedAt = -1e9;
let shownGunKey = '';
let gunWidthGain = 1;
let gunUsesArt = false;
let lastAimAngle = 0;
let lastRecoil = 0;
const _rollTint = new THREE.Color(0xffffff);
const _gunDisplayTint = new THREE.Color(0xffffff);
const _gunTraitColor = new THREE.Color();

const GUN_TRAIT_TINTS = [
  ['rapid', PAL.muzzle], ['heavy', PAL.modCapsule], ['forked', PAL.capsule],
  ['seeker', PAL.shots.H], ['phase', PAL.shots.L], ['volatile', PAL.shots.F],
];

function syncGunIdentity() {
  const held = currentGun;
  const key = `${held?.id || currentWeapon}:${currentWeapon}`;
  if (key === shownGunKey) return;
  shownGunKey = key;
  const art = weaponArtSlots[currentWeapon];
  gunUsesArt = !!art?.ready;
  if (gunUsesArt) applyAtlasCrop(art.tex, art.spec,
    RIG_WEAPON_ATLAS_W, RIG_WEAPON_ATLAS_H);
  const nextMap = gunUsesArt ? art.tex : null;
  const nextVertexColors = !gunUsesArt;
  const shaderModeChanged = !!gun.material.map !== !!nextMap ||
    gun.material.vertexColors !== nextVertexColors;
  gun.geometry = gunUsesArt
    ? GUN_ART_GEOMETRIES[currentWeapon]
    : GUN_GEOMETRIES[currentWeapon] || fallbackGunGeo;
  gun.material.map = nextMap;
  gun.material.emissiveMap = nextMap;
  gun.material.vertexColors = nextVertexColors;
  if (shaderModeChanged) gun.material.needsUpdate = true;

  let total = 0, rr = 0, gg = 0, bb = 0;
  const visual = held?.visual || {};
  for (const [trait, colorHex] of GUN_TRAIT_TINTS) {
    const count = Math.max(0, Number(visual[trait]) || 0);
    if (!count) continue;
    _gunTraitColor.set(colorHex);
    rr += _gunTraitColor.r * count;
    gg += _gunTraitColor.g * count;
    bb += _gunTraitColor.b * count;
    total += count;
  }
  _rollTint.setRGB(1, 1, 1);
  if (total > 0) {
    _gunTraitColor.setRGB(rr / total, gg / total, bb / total);
    _rollTint.lerp(_gunTraitColor, Math.min(0.62, 0.30 + (held?.tier || 1) * 0.10));
  }
  gunWidthGain = 1 + Math.min(0.28,
    (visual.heavy || 0) * 0.075 + (visual.volatile || 0) * 0.045 +
    (visual.forked || 0) * 0.025);
}

function portraitReadability() {
  return innerWidth / Math.max(1, innerHeight) < PORTRAIT_ASPECT;
}

function stationaryAimFrame() {
  const ax = Math.abs(player.aim.x), ay = player.aim.y;
  if (ay > 0.82) return 'aim-up';
  if (ay > 0.18) return 'aim-up-right';
  if (ay < -0.18) return 'aim-down-right';
  return 'aim-right';
}

// Camera direction is not a facet test: its lookX offset mixes a large route
// tangent into the view vector, so an old-face RIG could remain readable after
// the camera had committed to the next detent. Both sides now use the same
// topological boundary as projectile bend culling: the midpoint of the
// two-step chamfer. There is exactly one owner at every frame and no mirrored
// paper actor can fire visibly through the back of the fold.
function foldVisibility() {
  // The ritual starts with RIG centred on the 30-degree chamfer, the one
  // physical surface shared by the departing and arriving camera detents.
  // Keeping that exact joint visible throughout the orbit is topologically
  // honest; extending the exception to any old-facet position would restore
  // the behind-the-fold ghost this cull exists to remove.
  if (turningCornerOwnsJoint(player.x)) return 1;
  return facetAtBends(player.x, BEND_S) === cameraFacingFacet() ? 1 : 0;
}

// called at the end of updatePlayer, where the single-file build placed the rig
function sync() {
  placeOnTower(rig, player.x, player.y, RIG_SURFACE_DEPTH);
  const foldGain = foldVisibility();
  // crouch (?crouch=1) has to be visible or the lowered firing line is a
  // mystery: the body squashes to the crouched collision height and the gun
  // drops with the muzzle the sim is actually firing from.
  const squash = player.crouched ? CONFIG.crouch.height / CONFIG.player.height : 1;
  rig.scale.set(1, 1, 1);
  rig.rotation.z = 0;
  let dt = lastVisualMs ? gameMs - lastVisualMs : 0;
  let travelled = Math.abs(player.x - lastVisualX);
  // A restart/fallback can relocate RIG several tiles in one render frame.
  // That is not a stride: discard it instead of flashing through the atlas.
  const plausibleTravel = dt > 0
    ? CONFIG.player.runSpeed * 2.4 * dt / 1000 + 0.05 : 0;
  if (dt < 0 || dt > 120 || travelled > plausibleTravel) {
    dt = 0;
    travelled = 0;
    runPhase = 0;
  }
  lastVisualMs = gameMs;
  lastVisualX = player.x;
  lastTravelSpeed = dt > 0 ? travelled / (dt / 1000) : 0;
  // Distance, not wall time, owns the feet. At the advancing right clamp the
  // sim may still carry 9.4t/s velocity while RIG makes only the deck's 4.3t/s
  // progress; a fixed 300ms clock made those frames visibly skate. Preserve
  // the old full-speed cadence by deriving one stride from that exact tune.
  const running = player.grounded && (dt > 0
    ? lastTravelSpeed > 0.7
    : Math.abs(player.vx) > 1);
  const strideTiles = CONFIG.player.runSpeed * RIG_RUN_CYCLE_MS / 1000;
  if (running) runPhase = (runPhase + travelled / strideTiles) % 1;
  else runPhase = 0;
  if (player.grounded && !wasGrounded) landedAt = gameMs;
  wasGrounded = player.grounded;

  const strideWave = running ? Math.sin(runPhase * Math.PI * 2) : 0;
  const stepBob = running ? (0.5 - 0.5 * Math.cos(runPhase * Math.PI * 2)) * 0.055 : 0;
  const landingAge = gameMs - landedAt;
  const landing = landingAge >= 0 && landingAge < 120
    ? 1 - landingAge / 120 : 0;
  const bodyScaleX = 1 + Math.abs(strideWave) * 0.025 + landing * 0.055;
  const bodyScaleY = 1 - Math.abs(strideWave) * 0.018 - landing * 0.075 +
    (!player.grounded ? 0.025 : 0);
  bodyGroup.scale.set(bodyScaleX, squash * bodyScaleY, 1);
  bodyGroup.position.set(running ? strideWave * 0.018 : 0, stepBob, 0);
  fallbackMesh.position.y = SPRITE_H / 2;
  spriteMesh.position.y = RIG_SPRITE_H / 2;

  if (player.nextFireAt > seenNextFireAt) {
    seenNextFireAt = player.nextFireAt;
    lastShotAt = gameMs;
  } else if (player.nextFireAt < seenNextFireAt) {
    // restart rewound the fire clock
    seenNextFireAt = player.nextFireAt;
    lastShotAt = -1e9;
  }
  // contact → pass → flight → pass → contact: a four-beat stride assembled
  // from three gunless painted key poses. Reusing pass on the back half keeps
  // RIG's asymmetric pack/helmet identity tied to facing instead of flipping
  // the whole body independently of travel direction.
  let bodyFrame = stationaryAimFrame();
  if (running) {
    if (runPhase < 0.14 || runPhase >= 0.86) bodyFrame = 'contact';
    else if (runPhase < 0.36 || runPhase >= 0.64) bodyFrame = 'pass';
    else bodyFrame = 'flight';
  } else if (!player.grounded && player.vy > -1.5) bodyFrame = 'flight';

  const aimFrameName = bodyFrame.startsWith('aim-') ? bodyFrame.slice(4) : '';
  const aimSlot = aimFrameName ? aimFrameSlots[aimFrameName] : null;
  const displayBodyFrame = aimFrameName && !aimSlot?.ready
    ? (idleGunlessSlot.ready ? 'idle' : 'canvas')
    : bodyFrame;
  const canvasFallback = displayBodyFrame === 'canvas';
  const shownAimName = displayBodyFrame.startsWith('aim-')
    ? displayBodyFrame.slice(4) : '';
  const nextSlot = aimFrameName
    ? (aimSlot?.ready
        ? aimSlot
        : (idleGunlessSlot.ready
            ? idleGunlessSlot
            : { ready: true, tex: null }))
    : runFrameSlots[bodyFrame];
  const bodyFrameReady = canvasFallback || !!nextSlot?.ready;
  if (displayBodyFrame !== shownBodyFrame && bodyFrameReady) {
    shownBodyFrame = displayBodyFrame;
    if (!canvasFallback) applyAtlasCrop(nextSlot.tex, nextSlot.spec,
      RIG_BODY_ATLAS_W, RIG_BODY_ATLAS_H);
    if (!canvasFallback) {
      spriteMesh.geometry = shownAimName
        ? aimFrameGeometry[shownAimName]
        : (displayBodyFrame === 'idle'
            ? idleGunlessGeometry
            : runFrameGeometry[displayBodyFrame]);
      const nextAlphaMap = shownAimName ? aimMaskTextures[shownAimName] : null;
      const shaderModeChanged = !!spriteMesh.material.map !== !!nextSlot.tex ||
        !!spriteMesh.material.alphaMap !== !!nextAlphaMap;
      spriteMesh.material.map = nextSlot.tex;
      spriteMesh.material.emissiveMap = nextSlot.tex;
      spriteMesh.material.alphaMap = nextAlphaMap;
      if (shaderModeChanged) spriteMesh.material.needsUpdate = true;
    }
  }
  actionShowing = shownBodyFrame === 'contact' || shownBodyFrame === 'pass' ||
    shownBodyFrame === 'flight';
  spriteMesh.visible = bodyFrameReady && !canvasFallback && foldGain > 0.01;
  fallbackMesh.visible = canvasFallback || !bodyFrameReady;
  fallbackMesh.material.opacity = foldGain;
  spriteMesh.material.opacity = foldGain;

  // both planes are authored facing +x (see src/pure/rig.js) — mirror
  // whichever is showing when the sim's own facing flips, the same sign
  // CONFIG.player.aim already uses, so the drawn pose (front leg, pack)
  // never points the wrong way while running left. Flipping both costs
  // nothing on the invisible one and means neither plane needs to know
  // which is currently on screen.
  const faceX = player.facing < 0 ? -1 : 1;
  fallbackMesh.scale.x = faceX;
  spriteMesh.scale.x = faceX;

  // A live momentum chain (?flow=1) leans the body into its own speed: the
  // chain has to be visible in the character, not only in the HUD. Presentation
  // only, and exactly zero without the flag.
  const lean = flowSnapshot().mult - 1;
  const travel = Math.sign(player.vx || player.facing || 1);
  const motionLean = !player.grounded
    ? (player.vy >= 0 ? -0.105 : 0.055) * travel
    : (running ? -0.045 * travel : 0);
  bodyGroup.rotation.z = motionLean + (lean > 0 ? -travel * lean * 1.4 : 0);

  // The gun is a sibling of the leaning/squashed body, so its central axis
  // remains the exact simulation aim. Offset its root so the shared local
  // muzzle point lands on sim/player.js's actual spawn location for every
  // horizontal, vertical and diagonal direction.
  syncGunIdentity();
  const ax = player.aim.x, ay = player.aim.y;
  lastAimAngle = Math.atan2(ay, ax);
  gunGroup.visible = foldGain > 0.14;
  gunGroup.position.set(
    ax * 0.6 - ax * RIG_GUN_MUZZLE_X,
    player.muzzleY + ay * 0.5 - ay * RIG_GUN_MUZZLE_X,
    0.25,
  );
  gunGroup.rotation.z = lastAimAngle;
  const mirrorY = ax < -0.1 || (Math.abs(ax) <= 0.1 && player.facing < 0) ? -1 : 1;
  gun.scale.set(1, mirrorY * gunWidthGain, 1);
  const recoilAge = gameMs - lastShotAt;
  const recoilT = recoilAge >= 0 && recoilAge < RIG_RECOIL_MS
    ? 1 - recoilAge / RIG_RECOIL_MS : 0;
  lastRecoil = RIG_RECOIL_TILES * recoilT * recoilT;
  gun.position.x = -lastRecoil;

  const portrait = portraitReadability();
  const pulse = 0.96 + Math.sin(gameMs * 0.008) * 0.04;
  // OVERDRIVE lives on the machine, not only in a HUD label. WARM heats the
  // painted armour and aim rail; BREAKING adds a breathing white-hot pulse.
  // scoreNotchNow() is a primitive read and is zero whenever the system is
  // disabled, so this remains presentation-only and allocation-free.
  const notch = scoreNotchNow();
  const breakingPulse = notch >= 2 ? 0.5 + 0.5 * Math.sin(gameMs * 0.018) : 0;
  const heatColor = notch >= 1 ? PAL.gun : PAL.player;
  const bodyHeat = notch >= 2 ? 0.78 + breakingPulse * 0.34 : (notch === 1 ? 0.61 : 0.44);
  fallbackMesh.material.emissive.setHex(heatColor);
  fallbackMesh.material.emissiveIntensity = bodyHeat;
  spriteMesh.material.emissive.setHex(heatColor);
  spriteMesh.material.emissiveIntensity = bodyHeat + (actionShowing ? 0.04 : 0);
  _gunDisplayTint.copy(_rollTint);
  if (notch >= 2) _gunDisplayTint.lerp(_gunTraitColor.setHex(PAL.muzzle), 0.72);
  else if (notch === 1) _gunDisplayTint.lerp(_gunTraitColor.setHex(PAL.gun), 0.42);
  if (gunUsesArt) gun.material.color.setHex(0xffffff).lerp(_gunDisplayTint,
    0.08 + Math.min(0.12, (currentGun?.tier || 0) * 0.035));
  else gun.material.color.copy(_gunDisplayTint);
  gun.material.emissive.copy(_gunDisplayTint);
  gun.material.emissiveIntensity = notch >= 2
    ? 1.05 + breakingPulse * 0.72 + recoilT * 0.28
    : 0.40 + (currentGun?.tier || 0) * 0.075 + recoilT * 0.52 +
      (notch === 1 ? 0.34 : 0);
  rigGlow.material.color.setHex(notch >= 1 ? PAL.gun : PAL.player);
  rigGlow.position.y = 0.95 * squash + stepBob;
  // Portrait gets a larger, brighter field because the fixed vertical FOV
  // preserves body size while the narrow route crop removes surrounding
  // context. The halo stays presentation-only and never changes aim/hitboxes.
  const haloGain = portrait ? 1.34 : 1;
  rigGlow.scale.set(2.80 * pulse * haloGain,
    2.45 * pulse * haloGain * (player.crouched ? 0.78 : 1), 1);
  const baseHalo = gameMs < player.iframesUntil ? 0.36 : (portrait ? 0.27 : 0.18);
  rigGlow.material.opacity = Math.min(0.48, baseHalo +
    (notch >= 2 ? 0.10 + breakingPulse * 0.07 : (notch === 1 ? 0.055 : 0))) * foldGain;
  jumpFlare.visible = !player.grounded && Math.abs(player.vy) > 0.8;
  if (jumpFlare.visible) {
    jumpFlare.scale.y = 0.75 + Math.min(0.8, Math.abs(player.vy) * 0.045);
    jumpFlare.material.opacity = (player.vy > 0 ? 0.82 : 0.48) * foldGain;
  }
  rig.visible = foldGain > 0.01 && (gameMs >= player.iframesUntil || blink());
  rig.userData.foldVisibility = foldGain;
  // The contact shadow is a separate instanced mesh, so hiding only `rig`
  // can leave a little disembodied mark on the old facet. Scale its footprint
  // through the same fold gain; at the hidden midpoint its matrix has zero
  // area, and it grows back with the actor instead of arriving a frame early.
  syncContactShadow(RIG_SHADOW_ID, player.x, player.y, RIG_FOOTPRINT * foldGain);
}

export function rigVisualSnapshot() {
  const axisX = Math.cos(lastAimAngle), axisY = Math.sin(lastAimAngle);
  const tip = RIG_GUN_MUZZLE_X - lastRecoil;
  return {
    spriteReady, actionReady, actionShowing, bodyFrame: shownBodyFrame,
    idleGunlessReady: idleGunlessSlot.ready, idleUsesLegacy,
    canvasFallback: shownBodyFrame === 'canvas',
    retiredBakedBodySource: RETIRED_BAKED_BODY_SOURCE,
    runPhase: +runPhase.toFixed(3),
    travelSpeed: +lastTravelSpeed.toFixed(3),
    weapon: currentWeapon,
    gunId: currentGun?.id || '',
    gunUsesArt,
    artReady: Object.fromEntries(Object.entries(weaponArtSlots)
      .map(([letter, slot]) => [letter, slot.ready])),
    aim: { x: player.aim.x, y: player.aim.y, angle: lastAimAngle },
    aimArmPose: shownBodyFrame,
    aimArmAligned: !!aimFrameSlots[stationaryAimFrame().slice(4)]?.ready &&
      shownBodyFrame === stationaryAimFrame(),
    aimLimbMasked: shownBodyFrame.startsWith('aim-') &&
      spriteMesh.material.alphaMap === aimMaskTextures[shownBodyFrame.slice(4)],
    recoil: lastRecoil,
    muzzle: {
      drawnX: gunGroup.position.x + axisX * tip,
      drawnY: gunGroup.position.y + axisY * tip,
      simX: player.aim.x * 0.6,
      simY: player.muzzleY + player.aim.y * 0.5,
    },
    bakedGunMasked: false,
    rectangleGunFallback: false,
    fixedMeshes: 3,
  };
}

if (typeof window !== 'undefined') window.__HB_RIG_VISUAL = rigVisualSnapshot;
installView({ player: { sync } });
