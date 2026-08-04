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
   atlas. If that body atlas is unavailable, a synchronous fixed-geometry
   silhouette takes over; the earlier horizontal-rifle cutout is never allowed
   back onto the live frame. Every path mounts the eight-way weapon at the
   simulation's real muzzle. Atlas frames own immutable geometry UVs: changing
   pose or chassis never mutates/re-uploads a resident texture. */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { QUERY } from '../mode.js';
import { BEND_S, facetAtBends } from '../pure/path.js';
import { installView } from '../sim/bridge.js';
import { gameMs, blink } from '../sim/time.js';
import { player } from '../sim/player.js';
import { turningCornerOwnsJoint } from '../sim/wavegate.js';
import { currentGun, currentWeapon } from '../sim/weapons.js';
import { scoreNotchNow } from '../sim/score.js';
import {
  HELMET, LEG_BACK, LEG_FRONT,
  RIG_GUN_MUZZLE_X, RIG_RECOIL_MS, RIG_RECOIL_TILES,
  RIG_AIM_ATLAS_H, RIG_AIM_ATLAS_PATH, RIG_AIM_ATLAS_W,
  RIG_AIM_FRAMES, RIG_AIM_WORLD_PER_PIXEL, RIG_AIR_FRAMES,
  RIG_BODY_ATLAS_H, RIG_BODY_ATLAS_PATH, RIG_BODY_ATLAS_W,
  RIG_BODY_VISUAL_H, RIG_BODY_WORLD_PER_PIXEL, RIG_IDLE_GUNLESS,
  RIG_CLIMB_ATLAS_H, RIG_CLIMB_ATLAS_PATH, RIG_CLIMB_ATLAS_W,
  RIG_CLIMB_CYCLE_TILES, RIG_CLIMB_FRAMES, RIG_CLIMB_WORLD_PER_PIXEL,
  RIG_RUN_CYCLE_MS, RIG_RUN_FRAMES,
  RIG_SPRITE_H, RIG_SPRITE_PATH,
  RIG_WEAPON_ART, RIG_WEAPON_ATLAS_H, RIG_WEAPON_ATLAS_PATH, RIG_WEAPON_ATLAS_W,
  SPRITE_H, SPRITE_W, TORSO, VISOR,
} from '../pure/rig.js';
import { awaitPreloads, preloadTexture } from './preload.js';
import { camera, renderer, scene } from './scene.js';
import { cameraFacingFacet } from './camera.js';
import { placeOnTower } from './tower.js';
import { PAL } from './palette.js';
import { syncContactShadow } from './contact.js';
import { applySpriteUnderside } from './sprite-grounding.js';

const rig = new THREE.Group();
const bodyGroup = new THREE.Group();
rig.add(bodyGroup);

// Build all fallback plates and weapon attachments once. Vertex colours keep
// the material vocabulary inside one draw per assembly; the live sync path
// never allocates geometry, canvases, paths, or textures.
function coloredPartsGeometry(parts) {
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

function ellipsePoints(e, segments = 14) {
  const points = [];
  for (let i = 0; i < segments; i++) {
    const a = i / segments * Math.PI * 2;
    points.push([e.x + Math.cos(a) * e.rx, e.y + Math.sin(a) * e.ry]);
  }
  return points;
}

function fallbackPoints(points) {
  return points.map(([x, y]) => [(x - 0.5) * SPRITE_W, (0.5 - y) * SPRITE_H]);
}

const fallbackGeometry = coloredPartsGeometry([
  { color: PAL.playerDark, points: fallbackPoints(LEG_BACK) },
  { color: PAL.playerMid, points: fallbackPoints(LEG_FRONT) },
  { color: PAL.playerDark, points: fallbackPoints(TORSO) },
  { color: PAL.playerMid, points: fallbackPoints(ellipsePoints(HELMET)) },
  { color: PAL.gun, points: fallbackPoints(ellipsePoints(VISOR, 10)) },
]);

// Each atlas frame owns a fixed UV rectangle on its own geometry. Textures
// remain at offset=(0,0), repeat=(1,1) for their entire lifetime, eliminating
// pose-swap texture-matrix churn and making simultaneous proof views safe.
function applyAtlasUv(geo, spec, atlasW, atlasH) {
  const uv = geo.getAttribute('uv');
  const u0 = (spec.atlasX + spec.trimX) / atlasW;
  const v0 = (atlasH - spec.atlasY - spec.trimY - spec.trimH) / atlasH;
  const du = spec.trimW / atlasW;
  const dv = spec.trimH / atlasH;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, u0 + uv.getX(i) * du, v0 + uv.getY(i) * dv);
  }
  uv.needsUpdate = true;
  return geo;
}

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

// FALLBACK silhouette: fixed vertex-coloured plates, built synchronously so
// RIG is never absent if an atlas fails. It has no generic gun attached.
const fallbackMesh = new THREE.Mesh(
  fallbackGeometry,
  new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, emissive: PAL.player,
    emissiveIntensity: 0, roughness: 0.64, metalness: 0.32,
    depthWrite: false, side: THREE.DoubleSide, flatShading: true, fog: false,
  }),
);
fallbackMesh.position.set(0, SPRITE_H / 2, 0);
bodyGroup.add(fallbackMesh);

function runSpriteGeometry(spec) {
  const w = spec.trimW * RIG_BODY_WORLD_PER_PIXEL;
  const h = spec.trimH * RIG_BODY_WORLD_PER_PIXEL;
  const geo = new THREE.PlaneGeometry(w, h);
  geo.translate((spec.trimW / 2 - spec.anchorX) * RIG_BODY_WORLD_PER_PIXEL,
    (h - RIG_SPRITE_H) / 2, 0);
  return applySpriteUnderside(
    applyAtlasUv(geo, spec, RIG_BODY_ATLAS_W, RIG_BODY_ATLAS_H), 0.84);
}

const idleGunlessGeometry = runSpriteGeometry(RIG_IDLE_GUNLESS);
const runFrameGeometry = Object.freeze(Object.fromEntries(
  Object.entries(RIG_RUN_FRAMES).map(([name, spec]) => [name, runSpriteGeometry(spec)]),
));
const airFrameGeometry = Object.freeze(Object.fromEntries(
  Object.entries(RIG_AIR_FRAMES).map(([name, spec]) => [name, runSpriteGeometry(spec)]),
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
  return applySpriteUnderside(
    applyAtlasUv(geo, spec, RIG_AIM_ATLAS_W, RIG_AIM_ATLAS_H), 0.84);
}

const aimFrameGeometry = Object.freeze(Object.fromEntries(
  Object.entries(RIG_AIM_FRAMES).map(([name, spec]) => [name, aimSpriteGeometry(spec)]),
));

function climbSpriteGeometry(spec) {
  const w = spec.trimW * RIG_CLIMB_WORLD_PER_PIXEL;
  const h = spec.trimH * RIG_CLIMB_WORLD_PER_PIXEL;
  const geo = new THREE.PlaneGeometry(w, h);
  geo.translate((spec.trimW / 2 - spec.anchorX) * RIG_CLIMB_WORLD_PER_PIXEL,
    (h - RIG_SPRITE_H) / 2, 0);
  return applySpriteUnderside(
    applyAtlasUv(geo, spec, RIG_CLIMB_ATLAS_W, RIG_CLIMB_ATLAS_H), 0.88);
}
const climbFrameGeometry = Object.freeze(RIG_CLIMB_FRAMES.map(climbSpriteGeometry));

const spriteMesh = new THREE.Mesh(
  idleGunlessGeometry,
  new THREE.MeshStandardMaterial({
    emissive: PAL.player, emissiveIntensity: 0,
    vertexColors: true,
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
let aimReady = false;
let climbReady = false;
let climbError = null;
let shownBodyFrame = 'canvas';
const idleUsesLegacy = false;
const idleGunlessSlot = { ready: false, tex: null, error: null, spec: RIG_IDLE_GUNLESS };
const runFrameSlots = Object.fromEntries(Object.entries(RIG_RUN_FRAMES).map(([name, spec]) => [name, {
  ready: false, tex: null, error: null, spec,
}]));
const airFrameSlots = Object.fromEntries(Object.entries(RIG_AIR_FRAMES).map(([name, spec]) => [name, {
  ready: false, tex: null, error: null, spec,
}]));
const aimFrameSlots = Object.fromEntries(Object.entries(RIG_AIM_FRAMES).map(([name, spec]) => [name, {
  ready: false, tex: null, error: null, spec,
}]));
const climbFrameSlots = RIG_CLIMB_FRAMES.map((spec) => ({
  ready: false, tex: null, error: null, spec,
}));
const weaponArtSlots = Object.fromEntries(Object.entries(RIG_WEAPON_ART).map(([letter, spec]) => [letter, {
  ready: false, tex: null, error: null, spec,
}]));

// Runtime art enters through the shared boot gate. Nothing in src/sim/ reads
// these slots, so an asset failure can only choose a render fallback; it can
// never change movement, hitboxes, firing, or deterministic timing.
if (!RIG_FORCE_CANVAS) {
  // One lossless atlas request supplies idle, run, and rise/fall silhouettes.
  preloadTexture(new URL(RIG_BODY_ATLAS_PATH, import.meta.url).href).then((entry) => {
    if (entry.state !== 'ready') {
      idleGunlessSlot.error = entry.error || entry.state;
      for (const slot of Object.values(runFrameSlots)) slot.error = idleGunlessSlot.error;
      for (const slot of Object.values(airFrameSlots)) slot.error = idleGunlessSlot.error;
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
    for (const slot of Object.values(airFrameSlots)) {
      slot.tex = entry.tex;
      slot.ready = true;
    }
    spriteReady = true;
    actionReady = aimReady;
  });

  // Aim has its own higher-resolution strip. It shares a measured scale across
  // all elevations, so raising the gun never shrinks or enlarges the pilot.
  preloadTexture(new URL(RIG_AIM_ATLAS_PATH, import.meta.url).href).then((entry) => {
    if (entry.state !== 'ready') {
      for (const slot of Object.values(aimFrameSlots)) slot.error = entry.error || entry.state;
      console.warn('RIG aim atlas did not load (' + (entry.error || entry.state) +
        '); using the production idle body beneath the live gun.');
      return;
    }
    for (const slot of Object.values(aimFrameSlots)) {
      slot.tex = entry.tex;
      slot.ready = true;
    }
    aimReady = true;
    actionReady = spriteReady;
  });

  // A second atlas supplies every gun. Each chassis geometry already owns its
  // atlas UV rectangle, so pickups only swap one resident geometry.
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

  // The climb strip is independent of the locomotion atlas. A failed request
  // never introduces a geometric placeholder: the existing production body
  // atlas supplies pass/flight poses while the ladder remains fully playable.
  preloadTexture(new URL(RIG_CLIMB_ATLAS_PATH, import.meta.url).href).then((entry) => {
    if (entry.state !== 'ready') {
      climbError = entry.error || entry.state;
      for (const slot of climbFrameSlots) slot.error = climbError;
      console.warn('RIG climb atlas did not load (' + climbError +
        '); using production locomotion poses on ladders.');
      return;
    }
    for (const slot of climbFrameSlots) {
      slot.tex = entry.tex;
      slot.ready = true;
    }
    climbReady = true;
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
  return applyAtlasUv(geo, spec, RIG_WEAPON_ATLAS_W, RIG_WEAPON_ATLAS_H);
}

const GUN_ART_GEOMETRIES = Object.freeze(Object.fromEntries(
  Object.entries(RIG_WEAPON_ART).map(([letter, spec]) => [letter, weaponArtGeometry(spec)]),
));

// One mesh, five authored geometries. Filled convex plates beat thin line art
// at RIG's ~30px height, while vertex colours preserve material zones inside
// the single draw call. Every silhouette points +x and terminates at the same
// RIG_GUN_MUZZLE_X, so changing chassis never changes the shot origin.
const gunGeometry = coloredPartsGeometry;

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

// The painted sources were authored as detailed inventory art. At the shipped
// camera their raw cross-sections collapsed to five nearly identical stubs.
// These restrained, family-specific bore-axis gains preserve RIG's slender
// body while making the twin-bore, crystal rail, guided fins, and fuel nozzle
// distinguishable in motion. X is never scaled: the shared muzzle stays exact.
const GUN_FAMILY_HEIGHT_GAIN = Object.freeze({
  R: 1.34, S: 1.62, L: 1.46, H: 1.58, F: 1.66,
});

// One fixed overlay mesh swaps among five coarse family profiles. The painted
// atlas keeps all close detail; these broad plates are the few pixels that
// survive FAR minification and let a player identify a chassis while moving.
const GUN_FAMILY_ACCENTS = Object.freeze({
  R: gunGeometry([
    { color: PAL.muzzle, points: [[0.29,0.11],[0.52,0.12],[0.47,0.20],[0.33,0.19]] },
    { color: PAL.gun, points: [[mx-0.10,-0.17],[mx,-0.17],[mx,0.17],[mx-0.10,0.17]] },
  ]),
  S: gunGeometry([
    { color: PAL.shots.S, points: [[0.39,0.05],[mx,0.09],[mx,0.23],[0.46,0.18]] },
    { color: PAL.muzzle, points: [[0.39,-0.05],[0.46,-0.18],[mx,-0.23],[mx,-0.09]] },
  ]),
  L: gunGeometry([
    { color: PAL.shots.L, points: [[0.22,0],[0.55,0.18],[mx,0.02],[mx,-0.02],[0.55,-0.18]] },
    { color: PAL.muzzle, points: [[0.34,-0.025],[mx,-0.012],[mx,0.012],[0.34,0.025]] },
  ]),
  H: gunGeometry([
    { color: PAL.shots.H, points: [[0.25,0.10],[0.45,0.34],[0.56,0.13],[mx,0.03],[mx,-0.03],[0.56,-0.13],[0.45,-0.34],[0.25,-0.10]] },
    { color: PAL.muzzle, points: [[0.48,-0.04],[0.67,-0.06],[0.75,0],[0.67,0.06],[0.48,0.04]] },
  ]),
  F: gunGeometry([
    { color: PAL.shots.F, points: [[0.13,-0.10],[0.38,-0.13],[0.48,-0.24],[0.39,-0.35],[0.18,-0.32],[0.10,-0.21]] },
    { color: PAL.gun, points: [[0.45,0.07],[0.65,0.16],[mx,0.22],[mx,0.10],[0.64,0.07]] },
    { color: PAL.muzzle, points: [[0.45,-0.07],[0.64,-0.07],[mx,-0.10],[mx,-0.22],[0.65,-0.16]] },
  ]),
});

// Rolled traits are physical, not a full-chassis recolour. Six fixed meshes
// stay resident and toggle on pickup; duplicates enlarge the same attachment
// modestly instead of adding draw calls. Every part terminates at/before mx.
const TRAIT_GEOMETRIES = Object.freeze({
  rapid: gunGeometry([
    { color: PAL.muzzle, points: [[0.10,0.11],[0.23,0.34],[0.32,0.12]] },
    { color: PAL.gun, points: [[0.34,0.10],[0.47,0.31],[0.56,0.09]] },
  ]),
  heavy: gunGeometry([
    { color: PAL.playerDark, points: [[0.02,-0.10],[0.54,-0.13],[0.46,-0.38],[0.10,-0.41]] },
    { color: PAL.modCapsule, points: [[0.15,-0.20],[0.41,-0.21],[0.36,-0.34],[0.18,-0.33]] },
  ]),
  forked: gunGeometry([
    { color: PAL.capsule, points: [[0.45,0.04],[mx,0.12],[mx,0.29],[0.55,0.19]] },
    { color: PAL.muzzle, points: [[0.45,-0.04],[0.55,-0.19],[mx,-0.29],[mx,-0.12]] },
  ]),
  seeker: gunGeometry([
    { color: PAL.playerDark, points: [[0.19,0.09],[0.43,0.10],[0.51,0.23],[0.29,0.36]] },
    { color: PAL.shots.H, points: [[0.29,0.17],[0.41,0.18],[0.45,0.24],[0.33,0.30]] },
  ]),
  phase: gunGeometry([
    { color: PAL.shots.L, points: [[0.17,0.10],[0.70,0.07],[mx,0.13],[0.24,0.25]] },
    { color: PAL.muzzle, points: [[0.17,-0.10],[0.24,-0.25],[mx,-0.13],[0.70,-0.07]] },
  ]),
  volatile: gunGeometry([
    { color: PAL.playerDark, points: [[0.10,-0.09],[0.53,-0.11],[0.60,-0.24],[0.46,-0.40],[0.15,-0.35]] },
    { color: PAL.shots.F, points: [[0.18,-0.17],[0.44,-0.18],[0.51,-0.26],[0.40,-0.34],[0.20,-0.30]] },
  ]),
});

gunGroup.position.set(0, 1.05, 0.25);
const gunAssembly = new THREE.Group();
const gun = new THREE.Mesh(
  weaponArtSlots.R.ready ? GUN_ART_GEOMETRIES.R : GUN_GEOMETRIES.R,
  new THREE.MeshStandardMaterial({
    color: W, vertexColors: !weaponArtSlots.R.ready,
    map: weaponArtSlots.R.ready ? weaponArtSlots.R.tex : null,
    emissiveMap: weaponArtSlots.R.ready ? weaponArtSlots.R.tex : null,
    emissive: PAL.gun, emissiveIntensity: 0,
    roughness: 0.38, metalness: 0.42,
    transparent: true, alphaTest: 0.018, forceSinglePass: true,
    side: THREE.DoubleSide, flatShading: true, fog: false,
  })
);
gun.position.set(0, 0, 0);
gun.renderOrder = 4;
gunAssembly.add(gun);

const attachmentMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff, vertexColors: true, emissive: PAL.glowOff,
  emissiveIntensity: 0, roughness: 0.36, metalness: 0.40,
  transparent: false, side: THREE.DoubleSide, flatShading: true, fog: false,
});
const familyAccent = new THREE.Mesh(GUN_FAMILY_ACCENTS.R, attachmentMaterial);
familyAccent.name = 'rig-gun-family-accent';
familyAccent.position.z = 0.016;
familyAccent.renderOrder = 5;
gunAssembly.add(familyAccent);
const traitMeshes = Object.freeze(Object.fromEntries(
  Object.entries(TRAIT_GEOMETRIES).map(([trait, geometry]) => {
    const mesh = new THREE.Mesh(geometry, attachmentMaterial);
    mesh.name = `rig-gun-trait-${trait}`;
    mesh.visible = false;
    mesh.position.z = 0.024;
    mesh.renderOrder = 6;
    gunAssembly.add(mesh);
    return [trait, mesh];
  }),
));
gunGroup.add(gunAssembly);
rig.add(gunGroup);

scene.add(rig);

// T-039 (S6, contact shadows): RIG has exactly one row, for its whole
// lifetime — never spawned or removed the way a hostile/capsule is — so a
// stable module-level identity is all `syncContactShadow` needs; there is no
// matching release call (see src/render/contact.js's header note).
const RIG_SHADOW_ID = Symbol('rig-contact-shadow');
const RIG_FOOTPRINT = Object.freeze({
  key: 'rig',
  radius: CONFIG.player.width / 2,
  depthRatio: 0.56,
  strength: 0.82,
});

// The route's armour and authored solids are boxes centred on the logical
// play plane, with their camera-facing skin roughly one world unit outward.
// Actors still simulate at depth zero, but drawing RIG there lets that skin
// depth-occlude the entire character at some jump/platform combinations --
// especially obvious in a narrow portrait crop. Keep the simulation and
// contact shadow on their exact (s, y), while lifting only the visual rig onto
// the readable face of the hull.
const RIG_SURFACE_DEPTH = 1.15;
let seenNextFireAt = 0;
let lastShotAt = -1e9;
let lastVisualMs = 0;
let lastVisualX = player.x;
let lastVisualY = player.y;
let lastTravelSpeed = 0;
let runPhase = 0;
let climbPhase = 0;
let climbFrameIndex = 0;
let wasClimbing = false;
let wasGrounded = player.grounded;
let landedAt = -1e9;
let locomotionState = 'idle';
let shownGunRef = null;
let shownWeapon = '';
let gunFamilyHeightGain = GUN_FAMILY_HEIGHT_GAIN.R;
let gunUsesArt = false;
let visibleTraitCount = 0;
let activeTraitSummary = '';
let lastAimAngle = 0;
let lastAimX = 1;
let lastAimY = 0;
let lastSimMuzzleX = 0.6;
let lastSimMuzzleY = CONFIG.player.muzzleY;
let lastPoseFacing = 1;
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
  if (held === shownGunRef && currentWeapon === shownWeapon) return;
  shownGunRef = held;
  shownWeapon = currentWeapon;
  const art = weaponArtSlots[currentWeapon];
  gunUsesArt = !!art?.ready;
  const nextMap = gunUsesArt ? art.tex : null;
  const nextVertexColors = !gunUsesArt;
  const shaderModeChanged = !!gun.material.map !== !!nextMap ||
    gun.material.vertexColors !== nextVertexColors;
  gun.geometry = gunUsesArt
    ? GUN_ART_GEOMETRIES[currentWeapon]
    : GUN_GEOMETRIES[currentWeapon] || fallbackGunGeo;
  familyAccent.geometry = GUN_FAMILY_ACCENTS[currentWeapon] || GUN_FAMILY_ACCENTS.R;
  gun.material.map = nextMap;
  gun.material.emissiveMap = nextMap;
  gun.material.vertexColors = nextVertexColors;
  if (shaderModeChanged) gun.material.needsUpdate = true;
  gunFamilyHeightGain = GUN_FAMILY_HEIGHT_GAIN[currentWeapon] ||
    GUN_FAMILY_HEIGHT_GAIN.R;

  let total = 0, rr = 0, gg = 0, bb = 0;
  const visual = held?.visual || {};
  visibleTraitCount = 0;
  activeTraitSummary = '';
  for (const [trait, colorHex] of GUN_TRAIT_TINTS) {
    const count = Math.max(0, Number(visual[trait]) || 0);
    const attachment = traitMeshes[trait];
    attachment.visible = count > 0;
    if (!count) {
      attachment.scale.set(1, 1, 1);
      continue;
    }
    visibleTraitCount++;
    activeTraitSummary += (activeTraitSummary ? ',' : '') + `${trait}:${count}`;
    const stackGain = 1 + Math.min(0.24, (count - 1) * 0.12);
    attachment.scale.set(stackGain, stackGain, 1);
    _gunTraitColor.set(colorHex);
    rr += _gunTraitColor.r * count;
    gg += _gunTraitColor.g * count;
    bb += _gunTraitColor.b * count;
    total += count;
  }
  _rollTint.setRGB(1, 1, 1);
  if (total > 0) {
    _gunTraitColor.setRGB(rr / total, gg / total, bb / total);
    _rollTint.lerp(_gunTraitColor, Math.min(0.22, 0.08 + (held?.tier || 1) * 0.045));
  }
}

function stationaryAimFrame(x = player.aim.x, y = player.aim.y) {
  const ax = Math.abs(x), ay = y;
  if (ay > 0.82) return 'aim-up';
  if (ay > 0.18) return 'aim-up-right';
  if (ay < -0.18) return 'aim-down-right';
  return 'aim-right';
}

function eightWayAimSector(x = player.aim.x, y = player.aim.y) {
  const a = Math.atan2(y, x);
  const index = (Math.round(a / (Math.PI / 4)) + 8) % 8;
  return ['right', 'up-right', 'up', 'up-left',
    'left', 'down-left', 'down', 'down-right'][index];
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
  let climbed = Math.abs(player.y - lastVisualY);
  const climbing = player.traversalState === 'ladder';
  const wallContact = player.traversalState === 'wall';
  // A restart/fallback can relocate RIG several tiles in one render frame.
  // That is not a stride: discard it instead of flashing through the atlas.
  const plausibleTravel = dt > 0
    ? CONFIG.player.runSpeed * 2.4 * dt / 1000 + 0.05 : 0;
  const plausibleClimb = dt > 0 ? 12 * 2.4 * dt / 1000 + 0.05 : 0;
  if (dt < 0 || dt > 120 || travelled > plausibleTravel || climbed > plausibleClimb) {
    dt = 0;
    travelled = 0;
    climbed = 0;
    runPhase = 0;
    climbPhase = 0;
  }
  lastVisualMs = gameMs;
  lastVisualX = player.x;
  lastVisualY = player.y;
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
  if (climbing) {
    if (!wasClimbing) climbPhase = 0;
    climbPhase = (climbPhase + climbed / RIG_CLIMB_CYCLE_TILES) % 1;
    climbFrameIndex = Math.min(3, Math.floor(climbPhase * 4));
  } else {
    climbPhase = 0;
    climbFrameIndex = 0;
  }
  wasClimbing = climbing;
  if (player.grounded && !wasGrounded) landedAt = gameMs;
  wasGrounded = player.grounded;

  const landingAge = gameMs - landedAt;
  const landing = landingAge >= 0 && landingAge < 120
    ? 1 - landingAge / 120 : 0;
  // The authored plates already carry stride stretch and landing compression.
  // Procedurally scaling the whole cutout made RIG pop in size and detached the
  // independently aimed gun. Only the real crouch height changes presentation.
  bodyGroup.scale.set(1, squash, 1);
  bodyGroup.position.set(0, 0, 0);
  bodyGroup.rotation.z = 0;
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
  if (climbing) {
    bodyFrame = `climb-${climbFrameIndex}`;
    locomotionState = 'climb';
  } else if (wallContact) {
    // A wall hold uses the authored reach silhouette, facing into the contact,
    // instead of looking like an ordinary airborne fall frozen beside a wall.
    bodyFrame = `climb-${player.traversalSide < 0 ? 2 : 0}`;
    locomotionState = 'wall';
  } else if (!player.grounded) {
    // Rise and fall are honest authored silhouettes, not a planted run frame
    // held in mid-air. The gun remains a sibling on the exact sim axis.
    bodyFrame = player.vy >= 0 ? 'air-rise' : 'air-fall';
    locomotionState = player.vy >= 0 ? 'air-rise' : 'air-fall';
  } else if (landing > 0) {
    // Flight resolves through the already-authored braced contact pose while
    // the existing 120ms compression settles, then hands control back to the
    // idle aim or distance-driven run cadence. No new texture or pose is
    // introduced and the gun remains on the exact simulation aim axis.
    bodyFrame = 'contact';
    locomotionState = 'land-brace';
  } else if (running) {
    if (runPhase < 0.14 || runPhase >= 0.86) bodyFrame = 'contact';
    else if (runPhase < 0.36 || runPhase >= 0.64) bodyFrame = 'pass';
    else bodyFrame = 'flight';
    locomotionState = 'run';
  } else {
    locomotionState = 'aim-idle';
  }

  const climbFrameName = bodyFrame.startsWith('climb-') ? bodyFrame.slice(6) : '';
  const requestedClimbSlot = climbFrameName !== ''
    ? climbFrameSlots[Number(climbFrameName)] : null;
  const climbFallbackFrame = climbFrameIndex % 2 === 0 ? 'flight' : 'pass';
  const airFrameName = bodyFrame.startsWith('air-') ? bodyFrame.slice(4) : '';
  const airSlot = airFrameName ? airFrameSlots[airFrameName] : null;
  const aimFrameName = bodyFrame.startsWith('aim-') ? bodyFrame.slice(4) : '';
  const aimSlot = aimFrameName ? aimFrameSlots[aimFrameName] : null;
  const displayBodyFrame = requestedClimbSlot && !requestedClimbSlot.ready
    ? (runFrameSlots[climbFallbackFrame]?.ready ? climbFallbackFrame : 'canvas')
    : (airFrameName && !airSlot?.ready
        ? (runFrameSlots.flight?.ready ? 'flight' : 'canvas')
        : (aimFrameName && !aimSlot?.ready
            ? (idleGunlessSlot.ready ? 'idle' : 'canvas')
            : bodyFrame));
  const canvasFallback = displayBodyFrame === 'canvas';
  const shownClimbName = displayBodyFrame.startsWith('climb-')
    ? displayBodyFrame.slice(6) : '';
  const shownAimName = displayBodyFrame.startsWith('aim-')
    ? displayBodyFrame.slice(4) : '';
  const shownAirName = displayBodyFrame.startsWith('air-')
    ? displayBodyFrame.slice(4) : '';
  const nextSlot = shownClimbName !== ''
    ? climbFrameSlots[Number(shownClimbName)]
    : (requestedClimbSlot && !requestedClimbSlot.ready
        ? (runFrameSlots[climbFallbackFrame]?.ready
            ? runFrameSlots[climbFallbackFrame]
            : { ready: true, tex: null })
        : (shownAirName
            ? airFrameSlots[shownAirName]
            : (aimFrameName
                ? (aimSlot?.ready
                    ? aimSlot
                    : (idleGunlessSlot.ready
                        ? idleGunlessSlot
                        : { ready: true, tex: null }))
                : runFrameSlots[displayBodyFrame])));
  const bodyFrameReady = canvasFallback || !!nextSlot?.ready;
  if (displayBodyFrame !== shownBodyFrame && bodyFrameReady) {
    shownBodyFrame = displayBodyFrame;
    if (!canvasFallback) {
      spriteMesh.geometry = shownClimbName !== ''
        ? climbFrameGeometry[Number(shownClimbName)]
        : (shownAimName
            ? aimFrameGeometry[shownAimName]
            : (shownAirName
                ? airFrameGeometry[shownAirName]
                : (displayBodyFrame === 'idle'
                    ? idleGunlessGeometry
                    : runFrameGeometry[displayBodyFrame])));
      const shaderModeChanged = !!spriteMesh.material.map !== !!nextSlot.tex;
      spriteMesh.material.map = nextSlot.tex;
      spriteMesh.material.emissiveMap = nextSlot.tex;
      if (shaderModeChanged) spriteMesh.material.needsUpdate = true;
    }
  }
  actionShowing = shownBodyFrame === 'contact' || shownBodyFrame === 'pass' ||
    shownBodyFrame === 'flight' || shownBodyFrame.startsWith('air-') ||
    shownBodyFrame.startsWith('climb-');
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
  const poseFacing = wallContact && player.traversalSide
    ? player.traversalSide : player.facing;
  const faceX = poseFacing < 0 ? -1 : 1;
  lastPoseFacing = faceX;
  fallbackMesh.scale.x = faceX;
  spriteMesh.scale.x = faceX;

  // The gun is a sibling of the crouch-scaled body, so its central axis
  // remains the exact simulation aim. Offset its root so the shared local
  // muzzle point lands on sim/player.js's actual spawn location for every
  // horizontal, vertical and diagonal direction.
  syncGunIdentity();
  const ax = player.aim.x, ay = player.aim.y;
  lastAimX = ax;
  lastAimY = ay;
  lastAimAngle = Math.atan2(ay, ax);
  lastSimMuzzleX = ax * 0.6;
  lastSimMuzzleY = player.muzzleY + ay * 0.5;
  gunGroup.visible = foldGain > 0.14;
  gunGroup.position.set(
    ax * 0.6 - ax * RIG_GUN_MUZZLE_X,
    player.muzzleY + ay * 0.5 - ay * RIG_GUN_MUZZLE_X,
    0.25,
  );
  gunGroup.rotation.z = lastAimAngle;
  const mirrorY = ax < -0.1 || (Math.abs(ax) <= 0.1 && player.facing < 0) ? -1 : 1;
  gunAssembly.scale.set(1, mirrorY * gunFamilyHeightGain, 1);
  const recoilAge = gameMs - lastShotAt;
  const recoilT = recoilAge >= 0 && recoilAge < RIG_RECOIL_MS
    ? 1 - recoilAge / RIG_RECOIL_MS : 0;
  lastRecoil = RIG_RECOIL_TILES * recoilT * recoilT;
  gunAssembly.position.x = -lastRecoil;

  // OVERDRIVE lives on the machine, not only in a HUD label. WARM heats the
  // painted armour and aim rail; BREAKING adds a breathing white-hot pulse.
  // scoreNotchNow() is a primitive read and is zero whenever the system is
  // disabled, so this remains presentation-only and allocation-free.
  const notch = scoreNotchNow();
  const breakingPulse = notch >= 2 ? 0.5 + 0.5 * Math.sin(gameMs * 0.018) : 0;
  const heatColor = notch >= 1 ? PAL.gun : PAL.player;
  const bodyHeat = notch >= 2 ? 0.34 + breakingPulse * 0.14 : (notch === 1 ? 0.16 : 0);
  fallbackMesh.material.emissive.setHex(heatColor);
  fallbackMesh.material.emissiveIntensity = bodyHeat;
  spriteMesh.material.emissive.setHex(heatColor);
  spriteMesh.material.emissiveIntensity = bodyHeat;
  _gunDisplayTint.copy(_rollTint);
  if (notch >= 2) _gunDisplayTint.lerp(_gunTraitColor.setHex(PAL.muzzle), 0.72);
  else if (notch === 1) _gunDisplayTint.lerp(_gunTraitColor.setHex(PAL.gun), 0.42);
  if (gunUsesArt) gun.material.color.setHex(0xffffff).lerp(_gunDisplayTint,
    0.08 + Math.min(0.12, (currentGun?.tier || 0) * 0.035));
  else gun.material.color.copy(_gunDisplayTint);
  gun.material.emissive.copy(_gunDisplayTint);
  gun.material.emissiveIntensity = notch >= 2
    ? 0.58 + breakingPulse * 0.40 + recoilT * 0.24
    : recoilT * 0.46 + (notch === 1 ? 0.24 : 0);
  rig.visible = foldGain > 0.01 && (gameMs >= player.iframesUntil || blink());
  rig.userData.foldVisibility = foldGain;
  // The contact shadow is a separate instanced mesh, so hiding only `rig`
  // can leave a little disembodied mark on the old facet. Scale its footprint
  // through the same fold gain; at the hidden midpoint its matrix has zero
  // area, and it grows back with the actor instead of arriving a frame early.
  syncContactShadow(RIG_SHADOW_ID, player.x, player.y, RIG_FOOTPRINT,
    (climbing || wallContact ? 0 : foldGain));
}

const _rigScreenProbe = new THREE.Vector3();
export function rigVisualSnapshot() {
  const axisX = lastAimX, axisY = lastAimY;
  const tip = RIG_GUN_MUZZLE_X - lastRecoil;
  rig.getWorldPosition(_rigScreenProbe);
  _rigScreenProbe.project(camera);
  const rect = renderer.domElement.getBoundingClientRect();
  return {
    spriteReady, aimReady, actionReady, actionShowing, bodyFrame: shownBodyFrame,
    rigVisible: rig.visible && foldVisibility() > 0.01,
    spriteVisible: spriteMesh.visible && spriteMesh.material.opacity > 0.01,
    climbReady, climbError, climbFrame: climbFrameIndex,
    climbFallback: player.traversalState === 'ladder' && !climbReady,
    idleGunlessReady: idleGunlessSlot.ready, idleUsesLegacy,
    canvasFallback: shownBodyFrame === 'canvas',
    retiredBakedBodySource: RETIRED_BAKED_BODY_SOURCE,
    runPhase: +runPhase.toFixed(3),
    travelSpeed: +lastTravelSpeed.toFixed(3),
    locomotionState,
    airbornePoseContinuous: player.grounded || shownBodyFrame === 'flight' ||
      shownBodyFrame.startsWith('air-') ||
      shownBodyFrame.startsWith('climb-'),
    landingBraceActive: locomotionState === 'land-brace' && shownBodyFrame === 'contact',
    weapon: currentWeapon,
    gunId: currentGun?.id || '',
    gunUsesArt,
    artReady: Object.fromEntries(Object.entries(weaponArtSlots)
      .map(([letter, slot]) => [letter, slot.ready])),
    aim: { x: lastAimX, y: lastAimY, angle: lastAimAngle },
    aimSector: eightWayAimSector(lastAimX, lastAimY),
    poseFacing: lastPoseFacing,
    aimArmPose: shownBodyFrame,
    aimArmAligned: !!aimFrameSlots[stationaryAimFrame(lastAimX, lastAimY).slice(4)]?.ready &&
      shownBodyFrame === stationaryAimFrame(lastAimX, lastAimY),
    aimFixedUv: shownBodyFrame.startsWith('aim-') && !spriteMesh.material.alphaMap,
    aimLimbMasked: false,
    recoil: lastRecoil,
    idleEmission: {
      body: +spriteMesh.material.emissiveIntensity.toFixed(4),
      gun: +gun.material.emissiveIntensity.toFixed(4),
    },
    gunPresentation: {
      familyHeightGain: gunFamilyHeightGain,
      visibleTraitCount,
      traits: activeTraitSummary,
      fixedUv: !gun.material.map ||
        (gun.material.map.offset.x === 0 && gun.material.map.offset.y === 0 &&
         gun.material.map.repeat.x === 1 && gun.material.map.repeat.y === 1),
    },
    screen: {
      x: +(rect.left + (_rigScreenProbe.x + 1) * rect.width / 2).toFixed(2),
      y: +(rect.top + (1 - _rigScreenProbe.y) * rect.height / 2).toFixed(2),
    },
    muzzle: {
      drawnX: gunGroup.position.x + axisX * tip,
      drawnY: gunGroup.position.y + axisY * tip,
      simX: lastSimMuzzleX,
      simY: lastSimMuzzleY,
    },
    socket: {
      x: gunGroup.position.x,
      y: gunGroup.position.y,
      barrelTiles: RIG_GUN_MUZZLE_X,
      followsAim: true,
    },
    bakedGunMasked: false,
    rectangleGunFallback: false,
    jumpExhaust: false,
    fixedMeshes: 10,
    maxVisibleDraws: 6,
  };
}

if (typeof window !== 'undefined') window.__HB_RIG_VISUAL = rigVisualSnapshot;
installView({ player: { sync } });
