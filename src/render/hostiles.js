/* ==================== HOSTILE / CORPSE MESHES ===================== */
/* Mock-3D presence: enemies materialize out of the tower depth, breathe
   on the depth axis while alive, flash on hits, and dissolve back as
   display-only corpses. Every value is derived from the sim row; meshes
   are held in this module's map, never on the sim object. */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { mortarArcX, mortarArcY, mortarPulsePeriodMs } from '../pure/mortar.js';
import { installView } from '../sim/bridge.js';
import { gameMs } from '../sim/time.js';
import { PAL } from './palette.js';
import { scene } from './scene.js';
import { placeOnTower } from './tower.js';
import {
  CUE_GAIN, LAMP_COIL_SWELL, LAMP_OFF_ALPHA, LAMP_OFF_SWELL, LAMP_R, LEGIBILITY_ON, POSE_GAIN,
  POLYP_ONSET_MS, POLYP_SWELL_EASE, WASP_DIVE_NARROW, waspDiveStretch,
} from './legibility.js';

const waspGeo = new THREE.OctahedronGeometry(CONFIG.wasp.visualRadius);
const carrierGeo = new THREE.BoxGeometry(...CONFIG.carrier.size);
const houndGeo = new THREE.BoxGeometry(...CONFIG.hound.size);
const polypGeo = new THREE.DodecahedronGeometry(CONFIG.polyp.size);
const polypBarrelGeo = new THREE.BoxGeometry(...CONFIG.polyp.barrelSize);
const polypStalkGeo = new THREE.BoxGeometry(0.35, CONFIG.polyp.rootY, 0.35);
const polypBeamGeo = new THREE.BoxGeometry(1, CONFIG.polyp.beamHalf * 2, CONFIG.polyp.beamHalf * 2);
// Seed-Pod Tripod: a squat three-sided launch tube on three legs (the leg
// meshes and the bombardment props are built in the mortar block at the end
// of this file, which owns everything else about this kind).
const mortarTubeGeo = new THREE.ConeGeometry(CONFIG.mortar.size, CONFIG.mortar.size * 2.2, 3);

/* The houndframe's state theater: the shared presence pass below owns
   materialization, depth breathing, and the hit flash for every kind — this
   only adds the pose that makes its charge readable at full sprint.
     tell   — rears back and up, narrows, leans OUT of the combat plane, and
              blinks a warning light that accelerates as commitment nears;
     charge — snaps back into the plane, stretches along the run, holds a
              constant hot glow: "this is live and it is not steering";
     prowl  — a small stride bob so a patrolling frame still reads as alive.
   One reused object: sync runs per hostile per frame, so no allocation. */
const HOUND_POSE = { depth: 0, sx: 1, sy: 1, sz: 1, glow: PAL.glowOff };

function houndTellU(e) {                 // 0 → 1 across the reaction window
  return 1 - Math.max(0, Math.min(1, (e.stateUntil - gameMs) / CONFIG.hound.tellMs));
}

function houndPose(e) {
  const H = CONFIG.hound;
  const p = HOUND_POSE;
  p.depth = 0; p.sx = 1; p.sy = 1; p.sz = 1; p.glow = PAL.glowOff;
  if (e.state === 'tell') {
    const u = houndTellU(e);
    // POSE_GAIN (T-003): the wind-up silhouette takes back 60% of the FAR
    // pull-back, so the rear-up still reads on a ~15px chassis. It is 1 at
    // ?view=near and under ?legibility=0 — the pre-pass pose, exactly.
    p.depth = H.tellDepth * POSE_GAIN * u;
    p.sy = 1 + H.tellRise * POSE_GAIN * u;
    p.sx = 1 - H.tellNarrow * POSE_GAIN * u;
    if (e.stateUntil - gameMs <= H.tellCoilMs) {
      // the coil: blink resolves into a held glow and the frame drops onto its
      // haunches. This is the "NOW" the player answers — the accelerating blink
      // before it is the "not yet".
      p.glow = PAL.houndTell;
      p.sy -= H.tellCoilSquash * POSE_GAIN;
      p.sx += H.tellCoilSquash * POSE_GAIN * 0.5;
    } else {
      const period = H.tellBlinkSlowMs + (H.tellBlinkFastMs - H.tellBlinkSlowMs) * u;
      if (Math.floor(gameMs / period) % 2 === 0) p.glow = PAL.houndTell;
    }
  } else if (e.state === 'charge') {
    p.sx = 1 + H.chargeStretch;
    p.sy = 1 - H.chargeSquash;
    p.glow = PAL.houndCharge;
  } else if (e.state === 'prowl') {
    p.sy = 1 + Math.sin(e.t * H.gaitFreq) * H.gaitAmp;
  }
  return p;
}

function houndRoll(e) {
  const H = CONFIG.hound;
  if (e.state === 'tell') return -e.dir * H.tellRear * POSE_GAIN * houndTellU(e);
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
const POLYP_POSE = { depth: 0, sx: 1, sy: 1, sz: 1, glow: PAL.glowOff };

function polypPose(e) {
  const PP = CONFIG.polyp;
  const p = POLYP_POSE;
  p.depth = 0; p.sx = 1; p.sy = 1; p.sz = 1; p.glow = PAL.glowOff;
  if (e.state === 'tell') {
    const u = 1 - Math.max(0, Math.min(1, (e.stateUntil - gameMs) / PP.tellMs));
    // I-003 (playtest inbox): at the shipped FAR view the first ~300ms of the
    // 800ms iris tell read as a small dark notch in the bulb, so nearly a
    // third of the reaction window carried almost no signal. Two fixes, both
    // render-only and both vanishing under ?legibility=0: the dilation is
    // FRONT-LOADED (u ** 0.55 — most of the silhouette change happens in the
    // first beats) and it is boosted by POSE_GAIN so the swelled bulb still
    // reads at ~19px. The third is the iris lamp in polypLamp() below, which
    // is lit from the first frame of the tell.
    const swellU = LEGIBILITY_ON ? u ** POLYP_SWELL_EASE : u;
    p.sy = 1 + PP.tellSwell * POSE_GAIN * swellU;
    p.sz = 1 + PP.tellSwell * POSE_GAIN * swellU;
    const period = PP.tellBlinkSlowMs + (PP.tellBlinkFastMs - PP.tellBlinkSlowMs) * u;
    if (Math.floor(gameMs / period) % 2 === 0) p.glow = PAL.polypTell;
  } else if (e.state === 'fire') {
    p.sy = 1 + PP.tellSwell * POSE_GAIN;
    p.sz = 1 + PP.tellSwell * POSE_GAIN;
    p.glow = PAL.polypBeam;
  } else if (e.state === 'vent') {
    p.sy = 1 - PP.ventSag;
    p.glow = PAL.polypVent;
  }
  return p;
}

/* The wasp's dive, made readable at the shipped FAR view (T-003). A drone is
   ~17px there, and its cruise and its dive looked the same: a small acid
   diamond. The sim gives it no wind-up state to telegraph — a dive commits
   the frame it starts — so what the render adds is a COMMITMENT read, in the
   roster's existing language (hot acid = live and not steering, exactly like
   the houndframe's charge and the polyp's beam):
     - it points down its own dive vector instead of idly spinning;
     - it narrows into a dart, which is free — a drawn body may always claim
       LESS than its hit circle;
     - it wears PAL.waspDive, the hot end of the acid family.
   The elongation is clamped by waspDiveStretch() so the drawn nose can never
   claim reach past the contact circle. Warm amber is NOT used here on
   purpose: that is the roster's warning color, and a dive is past warning. */
const WASP_POSE = { depth: 0, sx: 1, sy: 1, sz: 1, glow: PAL.glowOff };

function waspDiving(e) {
  return LEGIBILITY_ON && e.state === 'dive';
}

function waspPose(e) {
  const p = WASP_POSE;
  p.depth = 0; p.sx = 1; p.sy = 1; p.sz = 1; p.glow = PAL.glowOff;
  if (waspDiving(e)) {
    // the nose reaches exactly the contact circle and the cross-section is
    // traded against THAT, not against the body — the dart must never make a
    // 17px drone smaller than the one that was cruising
    const grow = 1 + waspDiveStretch();
    p.sx = grow;
    p.sy = grow * (1 - WASP_DIVE_NARROW);
    p.sz = grow * (1 - WASP_DIVE_NARROW);
    p.glow = PAL.waspDive;
  }
  return p;
}

function waspRoll(e) {
  // local +x is the dart's nose, so this points the whole pose down the dive
  return waspDiving(e) ? Math.atan2(e.vy, e.vx) : e.t * 2;
}

// per-kind look, keyed by the same kind rows as ENEMY in src/sim/hostiles.js
const LOOK = {
  wasp:    { geo: waspGeo,    color: PAL.wasp,
             roll: waspRoll,  pose: waspPose },
  carrier: { geo: carrierGeo, color: PAL.carrier,
             roll: (e) => Math.sin(e.t * CONFIG.carrier.rollFreq) * CONFIG.carrier.rollAmp },
  hound:   { geo: houndGeo,   color: PAL.hound,
             roll: houndRoll, pose: houndPose },
  polyp:   { geo: polypGeo,   color: PAL.polyp,
             roll: () => 0,   pose: polypPose },
  mortar:  { geo: mortarTubeGeo, color: PAL.mortar,
             roll: mortarRoll, pose: mortarPose },
};

/* ------------------------- THE TELL LAMP (T-003) -------------------------
 * The warning light the houndframe's and the polyp's code comments have
 * always described, given actual geometry so it survives the FAR default
 * view. Until now the "blink" was an emissive tint on the body: at ~15px of
 * chassis that is a color flicker competing with the deck behind it, which
 * is what the operator accepted as a cost in decisions.md entry 7 and asked
 * to fix here.
 *
 * It is a LAMP, not a HUD marker — a small light on the machine, sized in
 * world tiles and placed on the part of the body that is arming (the
 * houndframe's head, the polyp's iris aperture). CUE_GAIN holds its screen
 * size across the pull-back, so it stops shrinking away without becoming a
 * floating icon. It wears the roster's ONE warning color (PAL.houndTell /
 * PAL.polypTell — warm amber in both palettes), never the acid a body wears,
 * and it exists only while the sim row is actually in its tell state, so it
 * can never promise a threat the sim is not running. ?legibility=0 removes
 * it entirely.
 *
 * Deliberately NOT given to the wasp: a lamp per drone in a swarm is the
 * clutter pillar 5 forbids, and a diving wasp already has a whole-body
 * commitment read (waspPose above).                                       */
const lampGeo = new THREE.OctahedronGeometry(1);   // unit radius: scaled per frame
const LAMP_DEPTH = 0.35;                 // just proud of the combat plane, toward the
                                         //   camera, so the body never eats its own lamp
const LAMP_ON_ALPHA = 0.95;

function lampAttach(v, color) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0 });
  const lamp = new THREE.Mesh(lampGeo, mat);
  lamp.visible = false;
  scene.add(lamp);
  v.lamp = lamp;
  v.lampMat = mat;
}

function lampDetach(v) {
  scene.remove(v.lamp);
  v.lampMat.dispose();
}

function lampShow(v, e, dx, dy, alpha, swell) {
  v.lamp.visible = true;
  v.lampMat.opacity = alpha;
  v.lamp.scale.setScalar(LAMP_R * CUE_GAIN * swell);
  placeOnTower(v.lamp, e.x + dx, e.y + dy, LAMP_DEPTH);
}

// houndframe: the lamp rides the head it rears back on, blinks in the same
// accelerating period the pose blinks in, and goes solid and big on the coil
// — the "not yet… NOW" the charge is answered on.
function houndLamp(v, e) {
  const H = CONFIG.hound;
  if (!LEGIBILITY_ON || e.state !== 'tell') { v.lamp.visible = false; return; }
  const dx = e.dir * 0.55, dy = 0.95;    // clear of the chassis it rears on
  if (e.stateUntil - gameMs <= H.tellCoilMs) {
    lampShow(v, e, dx, dy, 1, LAMP_COIL_SWELL);
    return;
  }
  const u = houndTellU(e);
  const period = H.tellBlinkSlowMs + (H.tellBlinkFastMs - H.tellBlinkSlowMs) * u;
  const on = Math.floor(gameMs / period) % 2 === 0;
  lampShow(v, e, dx, dy, on ? LAMP_ON_ALPHA : LAMP_OFF_ALPHA, on ? 1 : LAMP_OFF_SWELL);
}

// Iris Polyp: the lamp IS the iris, at the aperture the beam will leave
// from. I-003's fix lives in its first beat — POLYP_ONSET_MS of held,
// full-size light at the very start of the tell, before the accelerating
// blink begins, so the opening of the reaction window is not a dark notch.
function polypLamp(v, e) {
  const PP = CONFIG.polyp;
  if (!LEGIBILITY_ON || e.state !== 'tell') { v.lamp.visible = false; return; }
  const dx = e.dir * PP.barrelTiles, dy = 0;
  const left = Math.max(0, e.stateUntil - gameMs);
  if (PP.tellMs - left <= POLYP_ONSET_MS) {     // the onset flash
    lampShow(v, e, dx, dy, 1, LAMP_COIL_SWELL);
    return;
  }
  const u = 1 - Math.max(0, Math.min(1, left / PP.tellMs));
  const period = PP.tellBlinkSlowMs + (PP.tellBlinkFastMs - PP.tellBlinkSlowMs) * u;
  const on = Math.floor(gameMs / period) % 2 === 0;
  lampShow(v, e, dx, dy, on ? LAMP_ON_ALPHA : LAMP_OFF_ALPHA, on ? 1 : LAMP_OFF_SWELL);
}

const LAMP_SYNC = { hound: houndLamp, polyp: polypLamp };

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
      color: PAL.polypBeam, transparent: true, opacity: 0.85,
    });
    const beam = new THREE.Mesh(polypBeamGeo, beamMat);
    beam.visible = false;
    scene.add(beam);
    v.beam = beam;
    v.beamMat = beamMat;
  } else if (e.kind === 'mortar') {
    mortarAttach(v, mesh);                 // legs, pod, and the marked-zone props
  }
  // the tell lamp (T-003): only the two kinds whose telegraph is a wind-up
  // ON the body, and only while the readability pass is on
  if (LEGIBILITY_ON && LAMP_SYNC[e.kind]) {
    lampAttach(v, e.kind === 'polyp' ? PAL.polypTell : PAL.houndTell);
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
  if (v.pod) mortarDetach(v);            // nor does a pod, a mark, or a blast
  if (v.lamp) lampDetach(v);             // nor a tell lamp: a corpse never warns
  if (fade) {                          // hand the mesh to the corpse pass to dissolve
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
    if (v.pod) mortarHide(v);
    if (v.lamp) v.lamp.visible = false;
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
  let glow = gameMs < e.flashUntil ? PAL.hitFlash : PAL.glowOff;
  if (K.pose) {                          // per-kind state theater over the shared presence
    const p = K.pose(e);
    depth += p.depth;
    sx *= p.sx; sy *= p.sy; sz *= p.sz;
    if (glow === PAL.glowOff) glow = p.glow;              // a hit flash still wins
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
  if (v.pod) mortarSync(v, e);           // pod arc + marked zone + detonation
  // the tell lamp reads the same sim state the pose does, one frame, no memory
  if (v.lamp) LAMP_SYNC[e.kind](v, e);
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
    c.mat.emissive.setHex(u < 0.16 ? PAL.hitFlash : PAL.glowOff);   // death pop, then dissolve
  }
}

// run reset (resetGame in src/main.js): drop any dissolving corpses
export function clearCorpses() {
  for (const c of corpses) { scene.remove(c.mesh); c.mat.dispose(); }
  corpses.length = 0;
}

/* ==================== SPORE MORTAR (T-014) ========================= *
 * Everything this kind needs beyond the shared presence pass, kept in one
 * block at the end of the file. Three props, all derived from sim fields
 * and the SAME pure functions the sim uses (src/pure/mortar.js), so the
 * arc that is drawn is the arc that was flown and the slab that is drawn
 * is the slab that damages:
 *
 *   pod   — the seed pod in flight, replayed from the sim's podU through
 *           the pure arc. Visible only while the tube is lobbing.
 *   mark  — the pad on the marked landing surface, lit from the moment
 *           the pod launches (board 07: "marking the intended landing
 *           surface") and blinking faster as the fuse runs down, in the
 *           roster's one warning language.
 *   blast — the denial volume itself: a translucent column standing on
 *           the mark, faint while it is only a warning and a full-opacity
 *           flash for exactly the frames the sim is dealing damage.
 *
 * The tube's own theater is the pose function above the LOOK table: it
 * kicks back on launch and settles across the flight, holds a warm glow
 * through the fuse, and pops on detonation. Static-anatomy rule (entry 3)
 * is untouched — a mortar is something the SHIP builds, and none of this
 * moves the creature's own geometry.                                    */

const M_CFG = CONFIG.mortar;
const mortarLegGeo = new THREE.BoxGeometry(...M_CFG.legSize);
const mortarPodGeo = new THREE.OctahedronGeometry(M_CFG.podRadius);
const mortarMarkGeo = new THREE.BoxGeometry(
  M_CFG.blastHalf * 2, M_CFG.markThickness, M_CFG.blastHalf * 1.1);
const mortarBlastGeo = new THREE.BoxGeometry(
  M_CFG.blastHalf * 2, M_CFG.blastHeight, M_CFG.blastHalf * 1.1);

// reused pose object, same no-allocation rule as the hound and polyp poses
const MORTAR_POSE = { depth: 0, sx: 1, sy: 1, sz: 1, glow: PAL.glowOff };

function mortarPose(e) {
  const p = MORTAR_POSE;
  p.depth = 0; p.sx = 1; p.sy = 1; p.sz = 1; p.glow = PAL.glowOff;
  if (e.state === 'lob') {
    // the kick: the tube compresses on launch and recovers across the flight
    const settle = 1 - Math.max(0, Math.min(1, e.podU));
    p.sy = 1 - 0.18 * settle;
    p.glow = PAL.mortarTell;
  } else if (e.state === 'fuse') {
    const remain = Math.max(0, e.stateUntil - gameMs);
    const period = mortarPulsePeriodMs(remain, M_CFG.fuseMs,
      M_CFG.markPulseSlowMs, M_CFG.markPulseFastMs);
    if (Math.floor(gameMs / period) % 2 === 0) p.glow = PAL.mortarTell;
  } else if (e.state === 'burst') {
    p.sy = 1 + M_CFG.burstSwell;
    p.glow = PAL.mortarBlast;
  }
  return p;
}

// the tube leans down its authored line of fire; nothing else rotates
function mortarRoll(e) {
  return e.dir * 0.42;
}

function mortarAttach(v, mesh) {
  // three legs sharing the body material, so materialize/dissolve fades the
  // whole tripod as one silhouette
  for (const [lx, lz] of [[-0.34, 0.22], [0.34, 0.22], [0, -0.34]]) {
    const leg = new THREE.Mesh(mortarLegGeo, v.mat);
    leg.position.set(lx, -M_CFG.bodyY / 2, lz);
    mesh.add(leg);
  }
  const podMat = new THREE.MeshBasicMaterial({
    color: PAL.mortarPod, transparent: true, opacity: 0.95,
  });
  const pod = new THREE.Mesh(mortarPodGeo, podMat);
  pod.visible = false;
  scene.add(pod);
  const markMat = new THREE.MeshBasicMaterial({
    color: PAL.mortarMark, transparent: true, opacity: 0.8,
  });
  const mark = new THREE.Mesh(mortarMarkGeo, markMat);
  mark.visible = false;
  scene.add(mark);
  const blastMat = new THREE.MeshBasicMaterial({
    color: PAL.mortarBlast, transparent: true, opacity: 0.16,
  });
  const blast = new THREE.Mesh(mortarBlastGeo, blastMat);
  blast.visible = false;
  scene.add(blast);
  v.pod = pod; v.podMat = podMat;
  v.mark = mark; v.markMat = markMat;
  v.blast = blast; v.blastMat = blastMat;
}

function mortarDetach(v) {
  for (const [mesh, mat] of [[v.pod, v.podMat], [v.mark, v.markMat], [v.blast, v.blastMat]]) {
    scene.remove(mesh);
    mat.dispose();
  }
}

function mortarHide(v) {
  v.pod.visible = false;
  v.mark.visible = false;
  v.blast.visible = false;
}

function mortarSync(v, e) {
  if (gameMs < e.enterUntil) { mortarHide(v); return; }   // no props while condensing in
  const flying = e.state === 'lob';
  const marked = flying || e.state === 'fuse' || e.state === 'burst';
  v.pod.visible = flying;
  if (flying) {
    // exactly the arc the sim flew: same pure functions, same podU
    placeOnTower(v.pod,
      mortarArcX(e.x, e.zoneX, e.podU),
      mortarArcY(e.y, e.zoneY, M_CFG.arcTiles, e.podU), 0);
    v.pod.rotation.z = e.podU * 7;
  }
  v.mark.visible = marked;
  v.blast.visible = marked;
  if (!marked) return;
  placeOnTower(v.mark, e.zoneX, e.zoneY + M_CFG.markThickness / 2, 0);
  placeOnTower(v.blast, e.zoneX, e.zoneY + M_CFG.blastHeight / 2, M_CFG.warnDepth);
  if (e.state === 'burst') {
    // the detonation: the denial volume goes hot and bright for exactly the
    // frames the sim is dealing damage — live and warning can never be
    // confused — while staying behind the play plane, so a body caught in it
    // keeps its silhouette (pillar 5: chaos stays readable)
    const u = Math.max(0, Math.min(1, (e.stateUntil - gameMs) / M_CFG.burstMs));
    v.blastMat.color.setHex(PAL.mortarBlast);
    v.blastMat.opacity = 0.24 + 0.38 * u;
    v.markMat.opacity = 0.95;
    v.blast.scale.set(1 + (1 - u) * 0.12, 1, 1 + (1 - u) * 0.35);
    return;
  }
  v.blast.scale.set(1, 1, 1);
  v.blastMat.color.setHex(PAL.mortarMark);   // warning field, not a detonation
  v.blastMat.opacity = 0.2;
  if (flying) { v.markMat.opacity = 0.55; return; }
  // fuse: the mark blinks faster the closer the detonation gets
  const remain = Math.max(0, e.stateUntil - gameMs);
  const period = mortarPulsePeriodMs(remain, M_CFG.fuseMs,
    M_CFG.markPulseSlowMs, M_CFG.markPulseFastMs);
  v.markMat.opacity = Math.floor(gameMs / period) % 2 === 0 ? 0.95 : 0.45;
}
