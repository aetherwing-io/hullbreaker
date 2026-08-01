/* ==================== HOSTILE / CORPSE MESHES ===================== */
/* Mock-3D presence: enemies materialize out of the tower depth, breathe
   on the depth axis while alive, flash on hits, and dissolve back as
   display-only corpses. Every value is derived from the sim row; meshes
   are held in this module's map, never on the sim object. */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { installView } from '../sim/bridge.js';
import { gameMs } from '../sim/time.js';
import { scene } from './scene.js';
import { placeOnTower } from './tower.js';

const waspGeo = new THREE.OctahedronGeometry(CONFIG.wasp.visualRadius);
const carrierGeo = new THREE.BoxGeometry(...CONFIG.carrier.size);
const houndGeo = new THREE.BoxGeometry(...CONFIG.hound.size);
const polypGeo = new THREE.DodecahedronGeometry(CONFIG.polyp.size);
const polypBarrelGeo = new THREE.BoxGeometry(...CONFIG.polyp.barrelSize);
const polypStalkGeo = new THREE.BoxGeometry(0.35, CONFIG.polyp.rootY, 0.35);
const polypBeamGeo = new THREE.BoxGeometry(1, CONFIG.polyp.beamHalf * 2, CONFIG.polyp.beamHalf * 2);

/* The houndframe's state theater: the shared presence pass below owns
   materialization, depth breathing, and the hit flash for every kind — this
   only adds the pose that makes its charge readable at full sprint.
     tell   — rears back and up, narrows, leans OUT of the combat plane, and
              blinks a warning light that accelerates as commitment nears;
     charge — snaps back into the plane, stretches along the run, holds a
              constant hot glow: "this is live and it is not steering";
     prowl  — a small stride bob so a patrolling frame still reads as alive.
   One reused object: sync runs per hostile per frame, so no allocation. */
const HOUND_POSE = { depth: 0, sx: 1, sy: 1, sz: 1, glow: 0x000000 };

function houndTellU(e) {                 // 0 → 1 across the reaction window
  return 1 - Math.max(0, Math.min(1, (e.stateUntil - gameMs) / CONFIG.hound.tellMs));
}

function houndPose(e) {
  const H = CONFIG.hound;
  const p = HOUND_POSE;
  p.depth = 0; p.sx = 1; p.sy = 1; p.sz = 1; p.glow = 0x000000;
  if (e.state === 'tell') {
    const u = houndTellU(e);
    p.depth = H.tellDepth * u;
    p.sy = 1 + H.tellRise * u;
    p.sx = 1 - H.tellNarrow * u;
    if (e.stateUntil - gameMs <= H.tellCoilMs) {
      // the coil: blink resolves into a held glow and the frame drops onto its
      // haunches. This is the "NOW" the player answers — the accelerating blink
      // before it is the "not yet".
      p.glow = CONFIG.palette.houndTell;
      p.sy -= H.tellCoilSquash;
      p.sx += H.tellCoilSquash * 0.5;
    } else {
      const period = H.tellBlinkSlowMs + (H.tellBlinkFastMs - H.tellBlinkSlowMs) * u;
      if (Math.floor(gameMs / period) % 2 === 0) p.glow = CONFIG.palette.houndTell;
    }
  } else if (e.state === 'charge') {
    p.sx = 1 + H.chargeStretch;
    p.sy = 1 - H.chargeSquash;
    p.glow = CONFIG.palette.houndCharge;
  } else if (e.state === 'prowl') {
    p.sy = 1 + Math.sin(e.t * H.gaitFreq) * H.gaitAmp;
  }
  return p;
}

function houndRoll(e) {
  const H = CONFIG.hound;
  if (e.state === 'tell') return -e.dir * H.tellRear * houndTellU(e);
  if (e.state === 'charge') return e.dir * H.chargeLean;
  if (e.state === 'tumble') return e.t * 6;
  return Math.sin(e.t * H.gaitFreq) * H.gaitTilt;
}

/* The polyp's state theater over the same shared presence pass: a rooted
   bulb whose iris cycle is told in silhouette + the roster's one warning
   language (accelerating warm blink → commitment).
     closed — inert bulb; the shared depth breathing keeps it alive.
     tell   — dilates across the whole reaction window while the warm blink
              accelerates: "this lane is about to be wrong".
     fire   — holds the swollen pose and a constant hot glow while the beam
              mesh (below) spans the live reach: committed, not steering.
     vent   — sags and glows a dim spent warm: the opening, visibly.
   Same reused-object rule as the hound pose: sync runs per hostile per
   frame, so no allocation.                                             */
const POLYP_POSE = { depth: 0, sx: 1, sy: 1, sz: 1, glow: 0x000000 };

function polypPose(e) {
  const PP = CONFIG.polyp;
  const p = POLYP_POSE;
  p.depth = 0; p.sx = 1; p.sy = 1; p.sz = 1; p.glow = 0x000000;
  if (e.state === 'tell') {
    const u = 1 - Math.max(0, Math.min(1, (e.stateUntil - gameMs) / PP.tellMs));
    p.sy = 1 + PP.tellSwell * u;
    p.sz = 1 + PP.tellSwell * u;
    const period = PP.tellBlinkSlowMs + (PP.tellBlinkFastMs - PP.tellBlinkSlowMs) * u;
    if (Math.floor(gameMs / period) % 2 === 0) p.glow = CONFIG.palette.polypTell;
  } else if (e.state === 'fire') {
    p.sy = 1 + PP.tellSwell;
    p.sz = 1 + PP.tellSwell;
    p.glow = CONFIG.palette.polypBeam;
  } else if (e.state === 'vent') {
    p.sy = 1 - PP.ventSag;
    p.glow = CONFIG.palette.polypVent;
  }
  return p;
}

// per-kind look, keyed by the same kind rows as ENEMY in src/sim/hostiles.js
const LOOK = {
  wasp:    { geo: waspGeo,    color: CONFIG.palette.wasp,
             roll: (e) => e.t * 2 },
  carrier: { geo: carrierGeo, color: CONFIG.palette.carrier,
             roll: (e) => Math.sin(e.t * CONFIG.carrier.rollFreq) * CONFIG.carrier.rollAmp },
  hound:   { geo: houndGeo,   color: CONFIG.palette.hound,
             roll: houndRoll, pose: houndPose },
  polyp:   { geo: polypGeo,   color: CONFIG.palette.polyp,
             roll: () => 0,   pose: polypPose },
};
const meshes = new Map();                // sim hostile row → { mesh, mat }

function spawned(e) {
  const K = LOOK[e.kind];
  const mat = new THREE.MeshStandardMaterial({
    color: K.color, flatShading: true, transparent: true, opacity: 0,
  });
  const mesh = new THREE.Mesh(K.geo, mat);
  const v = { mesh, mat };
  if (e.kind === 'polyp') {
    // the side-facing barrel (board 07's model note) and the root stalk down
    // to the mounted surface — children sharing the bulb's material so
    // materialize/dissolve fades the whole body as one; the barrel offset is
    // set per frame from the sim row's facing in sync()
    const barrel = new THREE.Mesh(polypBarrelGeo, mat);
    mesh.add(barrel);
    v.barrel = barrel;
    const stalk = new THREE.Mesh(polypStalkGeo, mat);
    stalk.position.y = -CONFIG.polyp.rootY / 2;
    mesh.add(stalk);
    // the beam is its own scene mesh: it spans the LIVE reach the sim
    // marched this frame, so what the render shows is exactly what damages
    const beamMat = new THREE.MeshBasicMaterial({
      color: CONFIG.palette.polypBeam, transparent: true, opacity: 0.85,
    });
    const beam = new THREE.Mesh(polypBeamGeo, beamMat);
    beam.visible = false;
    scene.add(beam);
    v.beam = beam;
    v.beamMat = beamMat;
  }
  mesh.visible = false;                    // hidden until its materialization begins
  scene.add(mesh);
  meshes.set(e, v);
}

function removed(e, fade) {
  const v = meshes.get(e);
  if (!v) return;
  meshes.delete(e);
  if (v.beam) {                          // the beam never outlives its emplacement
    scene.remove(v.beam);
    v.beamMat.dispose();
  }
  if (fade) {                            // hand the mesh to the corpse pass to dissolve
    corpses.push({ mesh: v.mesh, mat: v.mat, s: e.x, y: e.y, spin: e.t, t0: gameMs });
  } else {
    scene.remove(v.mesh);
    v.mat.dispose();
  }
}

function sync(e) {
  const v = meshes.get(e);
  if (!v) return;
  const W = CONFIG.wasp;
  if (gameMs < e.enterUntil - W.enterMs) {            // staged wave slot: still hidden
    v.mesh.visible = false;
    if (v.beam) v.beam.visible = false;
    return;
  }
  v.mesh.visible = true;
  // mock-3D presence: materialize in from tower depth, breathe while alive
  let depth, scale;
  if (gameMs < e.enterUntil) {
    const u = 1 - (e.enterUntil - gameMs) / W.enterMs;    // 0 → 1 over the entrance
    const ease = 1 - (1 - u) ** 3;
    depth = W.enterDepth * (1 - ease);
    scale = 0.7 + 0.3 * ease;
    v.mat.opacity = u;
  } else {
    depth = Math.sin(e.t * W.wobbleFreq) * W.wobbleAmp;
    scale = 1;
    v.mat.opacity = 1;
  }
  const K = LOOK[e.kind];
  let sx = scale, sy = scale, sz = scale;
  let glow = gameMs < e.flashUntil ? 0xffffff : 0x000000;
  if (K.pose) {                          // per-kind state theater over the shared presence
    const p = K.pose(e);
    depth += p.depth;
    sx *= p.sx; sy *= p.sy; sz *= p.sz;
    if (glow === 0x000000) glow = p.glow;              // a hit flash still wins
  }
  v.mat.emissive.setHex(glow);
  placeOnTower(v.mesh, e.x, e.y, depth);
  v.mesh.rotation.z = K.roll(e);
  v.mesh.scale.set(sx, sy, sz);
  if (v.beam) {
    const PP = CONFIG.polyp;
    // the barrel points down the authored lane (dir is FACING on a rooted row)
    v.barrel.position.x = e.dir * PP.barrelTiles * 0.65;
    const live = e.state === 'fire' && e.beamReach > 0 && gameMs >= e.enterUntil;
    v.beam.visible = live;
    if (live) {
      // span exactly the reach the sim marched this frame, in the combat
      // plane (depth 0): what is drawn is what damages, wall to barrel
      placeOnTower(v.beam, e.x + e.dir * (PP.barrelTiles + e.beamReach / 2), e.y, 0);
      const pulse = 1 + PP.beamPulseAmp *
        Math.sin(gameMs / 1000 * PP.beamPulseFreq * Math.PI * 2);
      v.beam.scale.set(e.beamReach, pulse, pulse);
      v.beamMat.opacity = 0.65 + 0.25 * pulse;
    }
  }
}

installView({ hostiles: { spawned, removed, sync } });

// Dead hostiles are display-only: no sim, no gate participation (removeHostile
// already fired onHostileRemoved), just the dissolve back into tower depth.
const corpses = [];
export function updateCorpses() {
  const W = CONFIG.wasp;
  for (let i = corpses.length - 1; i >= 0; i--) {
    const c = corpses[i];
    const u = (gameMs - c.t0) / W.dieMs;
    if (u >= 1) { scene.remove(c.mesh); c.mat.dispose(); corpses.splice(i, 1); continue; }
    placeOnTower(c.mesh, c.s, c.y - 0.6 * u, W.dieDepth * u * u);   // recede into the dark
    c.mesh.rotation.z = c.spin + u * 9;           // death tumble
    c.mesh.scale.setScalar(1 + 0.3 * u);
    c.mat.opacity = 1 - u * u;
    c.mat.emissive.setHex(u < 0.16 ? 0xffffff : 0x000000);   // death pop, then dissolve
  }
}

// run reset (resetGame in src/main.js): drop any dissolving corpses
export function clearCorpses() {
  for (const c of corpses) { scene.remove(c.mesh); c.mat.dispose(); }
  corpses.length = 0;
}
