/* ===================== CROWN FINALE PRESENTATION ================== */
/* Render/UI half of the summit hold. The simulation owns phase timing,
   enemies, quota, and the eventual VICTORY state; this module turns the
   read-only finale snapshot into a waking landmark, a compact objective
   banner, and the one transmission spectacle the run has been earning.

   This is deliberately not the Orbital Lance again. OL is a short weapon
   telegraph on the combat plane. The Crown signal is rooted behind that
   plane in the existing summit structure: relays wake in stages, defense
   packets bank energy into the transmitter, then an ivory carrier inside a
   magenta sheath leaves vertically while the Crown recoils and face-hugging
   shock fronts cross its architecture. No full-screen flash or strobe.      */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { installView } from '../sim/bridge.js';
import { PAL } from './palette.js';
import { postGain } from './post.js';
import { scene } from './scene.js';
import { towerPose } from './tower.js';
import {
  crownRoot, crownSignal, resetCrownPresentation, setCrownPresentation,
} from './crown.js';
import { addTrauma } from './camera.js';
import { fxDirectedBurst, fxFlash, fxRing } from './fx.js';

const banner = document.getElementById('finale');
const bannerTitle = document.getElementById('finaleTitle');
const bannerMeta = document.getElementById('finaleMeta');
const bannerFill = document.getElementById('finaleFill');
const bannerProgress = document.getElementById('finaleProgress');

// Four persistent seal cells make the Warden's damage windows readable as a
// boss phase, rather than asking the player to decode a changing HP fraction
// inside the instruction copy. They share the compact objective panel and do
// not claim another screen-space lane on portrait displays.
const sealRail = document.createElement('div');
sealRail.id = 'finaleSeals';
sealRail.setAttribute('aria-hidden', 'true');
const sealCells = [];
for (let i = 0; i < 4; i++) {
  const cell = document.createElement('i');
  cell.setAttribute('data-seal', String(i + 1));
  sealRail.append(cell);
  sealCells.push(cell);
}
if (bannerProgress?.parentNode) bannerProgress.parentNode.insertBefore(sealRail, bannerProgress);

const finaleUiStyle = document.createElement('style');
finaleUiStyle.textContent = `
#finaleSeals {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4px;
  height: 4px;
  margin-top: 7px;
}
#finaleSeals i {
  position: relative;
  display: block;
  overflow: hidden;
  border: 1px solid rgba(255,242,216,.17);
  background: rgba(232,237,242,.07);
  box-shadow: inset 0 0 0 1px rgba(7,19,26,.58);
}
#finaleSeals i::after {
  content: '';
  position: absolute;
  inset: 0;
  background: #ff4fd8;
  box-shadow: 0 0 7px rgba(255,79,216,.72);
  transform: scaleX(0);
  transform-origin: 0 50%;
  transition: transform 130ms ease, background 130ms ease, opacity 130ms ease;
}
#finaleSeals i.sealed::after { transform: scaleX(.18); opacity: .48; }
#finaleSeals i.current::after {
  transform: scaleX(1);
  opacity: 1;
  animation: finale-seal-live 760ms ease-in-out infinite alternate;
}
#finaleSeals i.broken::after {
  transform: scaleX(1);
  background: rgba(255,242,216,.30);
  opacity: .42;
}
#finaleSeals i.linked::after {
  transform: scaleX(1);
  background: #fff2d8;
  opacity: .92;
}
#finale.core-open { border-color: rgba(255,242,216,.74); }
#finale.core-open #finaleTitle { text-shadow: 0 0 10px rgba(255,79,216,.48); }
#finale.attack-live { box-shadow: 0 0 0 1px rgba(7,19,26,.82), 0 0 22px rgba(255,157,69,.18); }
#finaleProgress { margin-top: 4px; }
@keyframes finale-seal-live { from { filter: brightness(.78); } to { filter: brightness(1.5); } }
@media (max-width: 600px) {
  #finaleSeals { gap: 3px; height: 3px; margin-top: 5px; }
  #finaleProgress { margin-top: 3px; }
}
@media (prefers-reduced-motion: reduce) {
  #finaleSeals i.current::after { animation: none; }
}`;
document.head.append(finaleUiStyle);

const LIVE = !!crownRoot;
const _pose = { x: 0, y: 0, z: 0, yaw: 0, alt: 0 };
const MAGENTA = new THREE.Color(PAL.capsule);
const IVORY = new THREE.Color(PAL.muzzle);
const GOLD = new THREE.Color(PAL.modCapsule);

// A portrait frustum is only about nine route tiles wide.  The authored
// transmitter axis is eleven tiles ahead of the final scroll clamp, which
// makes the entire payoff happen just beyond the right glass on a phone.
// On that narrow composition, route the carrier through the Crown's forward
// shoulder relay instead. It remains world geometry, behind the combat plane,
// and keeps the true summit as its visual source; only the presentation tap is
// nearer. Landscape retains the authored central transmitter axis exactly.
const PORTRAIT_CARRIER_SHIFT = innerWidth / innerHeight < 0.66 ? -7.4 : 0;
const signalS = crownSignal.s + PORTRAIT_CARRIER_SHIFT;

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
const smooth = (v) => { const u = clamp01(v); return u * u * (3 - 2 * u); };

function signalMaterial(color, opacity = 0) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    fog: false,
    toneMapped: false,
  });
}

function placeStatic(object, s, y, depth) {
  const p = towerPose(s, _pose);
  object.position.set(
    p.x + Math.sin(p.yaw) * depth,
    y + p.alt,
    p.z + Math.cos(p.yaw) * depth,
  );
  object.rotation.y = p.yaw;
  return object;
}

function driveMaterial(mat, color, energy, alpha) {
  mat.color.copy(color).multiplyScalar(0.82 + postGain() * clamp01(energy) * 0.46);
  mat.opacity = clamp01(alpha);
}

// The sim's progress is deliberately phase-local: arming, defense, and
// transmission each run from zero to one.  The player-facing meter must not
// hit 100% while arming and then jump backward when the first packet arrives,
// so project those local values onto one continuous carrier timeline.
function carrierProgress(snapshot) {
  const p = clamp01(snapshot.progress);
  if (snapshot.phase === 'arming') return p * 0.12;
  if (snapshot.phase === 'defend') return 0.12 + p * 0.72;
  if (snapshot.phase === 'transmit') return 0.84 + p * 0.16;
  if (snapshot.phase === 'complete') return 1;
  return 0;
}

/* ----------------------- fixed world geometry ----------------------- */
const finaleRoot = new THREE.Group();
finaleRoot.name = 'Crown uplink finale effects';
finaleRoot.visible = false;
scene.add(finaleRoot);

const relayGeo = new THREE.OctahedronGeometry(0.18, 0);
const relayRingGeo = new THREE.RingGeometry(0.23, 0.31, 16);
const relayStemGeo = new THREE.BoxGeometry(0.065, 1.0, 0.065);
const relays = [];

if (LIVE) {
  for (const spec of crownSignal.relays) {
    const root = new THREE.Group();
    root.name = 'Crown signal relay';
    placeStatic(root, signalS + spec.ds, spec.y, crownSignal.depth);

    const stemMat = signalMaterial(PAL.capsule);
    const stem = new THREE.Mesh(relayStemGeo, stemMat);
    stem.position.y = -0.48;
    stem.renderOrder = 2;
    root.add(stem);

    const coreMat = signalMaterial(PAL.muzzle);
    const core = new THREE.Mesh(relayGeo, coreMat);
    core.renderOrder = 3;
    root.add(core);

    const ringMat = signalMaterial(PAL.capsule);
    const ring = new THREE.Mesh(relayRingGeo, ringMat);
    ring.position.z = -0.015;
    ring.renderOrder = 2;
    root.add(ring);

    finaleRoot.add(root);
    relays.push({ root, stem, stemMat, core, coreMat, ring, ringMat });
  }
}

const uplinkRoot = new THREE.Group();
uplinkRoot.name = 'Crown uplink core';
if (LIVE) placeStatic(
  uplinkRoot, signalS, crownSignal.coreY, crownSignal.depth + 0.03);
finaleRoot.add(uplinkRoot);

const uplinkCoreMat = signalMaterial(PAL.muzzle);
const uplinkCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 1), uplinkCoreMat);
uplinkCore.renderOrder = 3;
uplinkRoot.add(uplinkCore);

const chargeRings = [];
for (let i = 0; i < 3; i++) {
  const mat = signalMaterial(i === 2 ? PAL.modCapsule : PAL.capsule);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.48 + i * 0.22, 0.035 + i * 0.006, 5, 24), mat);
  ring.position.z = -0.025 - i * 0.008;
  ring.renderOrder = 2;
  uplinkRoot.add(ring);
  chargeRings.push({ ring, mat });
}

// Unit-height cylinders scale upward from their base during transmission.
const beamRoot = new THREE.Group();
beamRoot.name = 'Meridian-to-Earth signal';
if (LIVE) placeStatic(
  beamRoot, signalS, crownSignal.coreY + 0.08, crownSignal.depth - 0.06);
finaleRoot.add(beamRoot);

const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
const beamSheathMat = signalMaterial(PAL.capsule);
const beamSheath = new THREE.Mesh(beamGeo, beamSheathMat);
beamSheath.renderOrder = 2;
beamRoot.add(beamSheath);

const beamCoreMat = signalMaterial(PAL.muzzle);
const beamCore = new THREE.Mesh(beamGeo, beamCoreMat);
beamCore.renderOrder = 3;
beamRoot.add(beamCore);

const beamTipMat = signalMaterial(PAL.muzzle);
const beamTip = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 1), beamTipMat);
beamTip.renderOrder = 3;
beamRoot.add(beamTip);

const shockRings = [];
for (let i = 0; i < 3; i++) {
  const mat = signalMaterial(i === 1 ? PAL.muzzle : PAL.capsule);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.055, 5, 30), mat);
  ring.renderOrder = 3;
  uplinkRoot.add(ring);
  shockRings.push({ ring, mat });
}

// The carrier cannot become a frozen white pole the moment the results card
// arrives. Small packets continue climbing the beam after contact, giving the
// settled scene a readable direction and a quiet sense that Earth is still on
// the other end. These are real world-space objects, so they stay attached to
// the Crown through route rotation instead of behaving like a screen overlay.
const carrierMoteGeo = new THREE.OctahedronGeometry(0.052, 0);
const carrierMotes = [];
if (LIVE) {
  for (let i = 0; i < 14; i++) {
    const mat = signalMaterial(i % 4 === 0 ? PAL.muzzle : PAL.capsule);
    const mote = new THREE.Mesh(carrierMoteGeo, mat);
    mote.name = 'Earthbound carrier packet';
    mote.visible = false;
    mote.renderOrder = 4;
    beamRoot.add(mote);
    carrierMotes.push({ mote, mat, seed: (i * 0.61803398875) % 1 });
  }
}

/* -------------------------- state projection ------------------------ */
let current = {
  phase: 'dormant', elapsedMs: 0, kills: 0, quota: 0, progress: 0, wave: 0,
};
let lastElapsedMs = 0;
let lastWave = 0;
let waveKick = 0;
let transmitting = false;

function animateSettledCarrier(now = 0) {
  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(animateSettledCarrier);
  }
  if (!LIVE) return;

  const live = current.phase === 'transmit' || current.phase === 'complete';
  const settled = current.phase === 'complete';
  const seconds = now / 1000;
  for (let i = 0; i < carrierMotes.length; i++) {
    const packet = carrierMotes[i];
    packet.mote.visible = live;
    if (!live) continue;

    const laps = seconds * (settled ? 0.075 : 0.16) + packet.seed;
    const u = laps - Math.floor(laps);
    // Once Earth answers, every fifth packet descends against the outbound
    // helix in warm ivory. The carrier is visibly two-way instead of a beam
    // that merely froze when the score card appeared.
    const returning = settled && i % 5 === 0;
    const travel = returning ? 1 - u : u;
    const turn = travel * Math.PI * 3.2 + i * 2.17;
    const radius = (settled ? 0.105 : 0.15) + (i % 3) * 0.024;
    packet.mote.position.set(
      Math.cos(turn) * radius,
      0.7 + travel * 48.2,
      Math.sin(turn) * radius,
    );
    const edgeFade = smooth(Math.min(u / 0.08, (1 - u) / 0.12));
    const beat = 0.68 + 0.32 * Math.sin(seconds * 4.2 + i * 1.7);
    packet.mote.scale.setScalar((returning ? 1.14 : settled ? 0.72 : 0.9) + beat * 0.3);
    packet.mote.rotation.y = turn;
    driveMaterial(packet.mat, returning || i % 4 === 0 ? IVORY : MAGENTA,
      returning ? 0.82 : settled ? 0.48 : 0.88,
      edgeFade * (returning ? 0.72 : settled ? 0.42 : 0.7));
  }

  // Simulation snapshots stop advancing once VICTORY is reached. Keep only
  // the transmitter's presentation clock alive so the payoff does not read as
  // a paused game. Combat and run telemetry remain fully deterministic.
  if (settled && finaleRoot.visible) {
    const pulse = 0.5 + 0.5 * Math.sin(seconds * 2.35);
    beamSheath.scale.x = beamSheath.scale.z = 0.135 + pulse * 0.035;
    beamCore.scale.x = beamCore.scale.z = 0.038 + pulse * 0.014;
    driveMaterial(beamSheathMat, MAGENTA, 0.28 + pulse * 0.2, 0.055 + pulse * 0.035);
    driveMaterial(beamCoreMat, IVORY, 0.34 + pulse * 0.28, 0.13 + pulse * 0.09);
    uplinkCore.rotation.y = seconds * 0.48;
    uplinkCore.rotation.z = seconds * -0.31;
    uplinkCore.scale.setScalar(1.22 + pulse * 0.11);
    driveMaterial(uplinkCoreMat, IVORY, 0.58 + pulse * 0.22, 0.58 + pulse * 0.18);
    for (let i = 0; i < chargeRings.length; i++) {
      const { ring, mat } = chargeRings[i];
      ring.visible = true;
      ring.rotation.z = seconds * (i % 2 ? -0.3 : 0.36) + i * 0.65;
      driveMaterial(mat, i === 2 ? GOLD : MAGENTA,
        0.38 + pulse * 0.2, 0.09 + pulse * 0.08);
    }
  }
}

if (LIVE && typeof requestAnimationFrame !== 'undefined') {
  requestAnimationFrame(animateSettledCarrier);
}

function setBanner(snapshot) {
  if (!banner) return;
  const phase = snapshot.phase;
  const show = phase === 'arming' || phase === 'defend' || phase === 'transmit';
  banner.classList.toggle('on', show);
  banner.classList.toggle('transmit', phase === 'transmit');
  banner.dataset.phase = phase;
  banner.setAttribute('aria-hidden', show ? 'false' : 'true');
  if (!show) return;

  const carrier = carrierProgress(snapshot);
  const pct = Math.round(carrier * 100);
  if (phase === 'arming') {
    bannerTitle.textContent = snapshot.warden?.present
      ? 'CROWN WARDEN // INTERLOCK DESCENDING'
      : 'CROWN UPLINK // HOLD THE SIGNAL';
    bannerMeta.textContent = snapshot.warden?.present
      ? 'BREAK FOUR SEALS · FIRE WHEN THE CENTRAL IRIS OPENS'
      : `ARMING BATTERED ARRAY · CARRIER ${pct}%`;
  } else if (phase === 'defend') {
    const warden = snapshot.warden;
    if (warden?.present) {
      bannerTitle.textContent = 'CROWN WARDEN // BREAK THE INTERLOCK';
      const seal = Math.max(1, Math.min(4, Number(warden.seal) || 1));
      const hp = `${Math.max(0, Math.ceil(warden.hp))}/${warden.maxHp}`;
      const attack = warden.attack;
      if (attack === 'exposed') {
        bannerMeta.textContent = `SEAL ${seal}/4 · CORE OPEN — FIRE NOW · ${hp}`;
      } else if (attack === 'sweepTell') {
        bannerMeta.textContent = `SEAL ${seal}/4 · BEAM CHARGING — LEAVE ITS LANE · CORE LOCKED`;
      } else if (attack === 'sweepFire') {
        bannerMeta.textContent = `SEAL ${seal}/4 · SWEEP LIVE — MOVE · CORE LOCKED`;
      } else if (attack === 'barrageTell') {
        bannerMeta.textContent = `SEAL ${seal}/4 · IMPACT ZONE MARKED — REDIRECT · CORE LOCKED`;
      } else if (attack === 'barrageBurst') {
        bannerMeta.textContent = `SEAL ${seal}/4 · BARRAGE LIVE — CLEAR THE MARK · CORE LOCKED`;
      } else {
        bannerMeta.textContent = `SEAL ${seal}/4 · CORE ${hp} · WAIT FOR THE OPENING`;
      }
    } else {
      bannerTitle.textContent = 'CROWN WARDEN // INTERLOCK BROKEN';
      bannerMeta.textContent = `TARGET DOWN · ${snapshot.kills} SUPPORT HOSTILES CLEARED · LINK ${pct}%`;
    }
  } else {
    bannerTitle.textContent = 'CROWN UPLINK // EARTHBOUND CARRIER';
    bannerMeta.textContent = `TRANSMITTING MERIDIAN → EARTH · ${pct}%`;
  }

  const attack = snapshot.warden?.attack || '';
  banner.classList.toggle('core-open', attack === 'exposed' || phase === 'transmit');
  banner.classList.toggle('attack-live', attack === 'sweepFire' || attack === 'barrageBurst');
  const currentSeal = Math.max(1, Math.min(4, Number(snapshot.warden?.seal) || 1));
  for (let i = 0; i < sealCells.length; i++) {
    const cell = sealCells[i];
    cell.className = '';
    if (phase === 'transmit') cell.classList.add('linked');
    else if (snapshot.warden?.defeated || !snapshot.warden?.present && phase === 'defend')
      cell.classList.add('broken');
    else if (phase === 'arming') cell.classList.add(i === 0 ? 'current' : 'sealed');
    else if (i < currentSeal - 1) cell.classList.add('broken');
    else if (i === currentSeal - 1) cell.classList.add('current');
    else cell.classList.add('sealed');
  }
  bannerFill.style.transform = `scaleX(${carrier})`;
  bannerProgress.setAttribute('aria-valuenow', String(pct));
  bannerProgress.setAttribute('aria-valuetext', `${pct}% ${phase}`);
}

function triggerDefensePacket(wave) {
  if (!LIVE) return;
  const size = 2.1 + Math.max(0, wave) * 0.62;
  fxFlash(145, 0.72 + wave * 0.10,
    signalS, crownSignal.coreY, PAL.capsule, crownSignal.depth);
  fxRing(360, size,
    signalS, crownSignal.coreY, PAL.modCapsule, crownSignal.depth + 0.02);
  addTrauma(CONFIG.juice.shake.kill * 0.32);
}

function beginTransmission(snapshot) {
  if (transmitting) return;
  transmitting = true;
  waveKick = 1;
  if (!LIVE) return;

  // One authored launch beat: upward shrapnel, two differently timed fronts,
  // and a compact core flash. The tall beam itself is persistent geometry
  // below, so this cannot turn into OL's flashing slab.
  fxDirectedBurst(CONFIG.juice.death,
    signalS, crownSignal.coreY, PAL.capsule, 0, 1, 1.15, 1.35);
  fxDirectedBurst(CONFIG.juice.impact,
    signalS, crownSignal.coreY, PAL.muzzle, 0, 1, 0.72, 1.55);
  fxFlash(250, 1.45,
    signalS, crownSignal.coreY, PAL.muzzle, crownSignal.depth + 0.04);
  fxRing(520, 4.6,
    signalS, crownSignal.coreY, PAL.capsule, crownSignal.depth + 0.03);
  fxRing(820, 7.2,
    signalS, crownSignal.coreY, PAL.muzzle, crownSignal.depth);
  addTrauma(CONFIG.juice.shake.boom * 1.45);
  current = { ...current, ...snapshot };
}

function relayEnergy(i, snapshot) {
  if (snapshot.phase === 'arming') return clamp01(snapshot.progress * 3.25 - i);
  if (snapshot.phase === 'defend' || snapshot.phase === 'transmit') return 1;
  if (snapshot.phase === 'complete') return 0.52;
  return 0;
}

function syncWorld(snapshot) {
  if (!LIVE) return;
  const phase = snapshot.phase;
  const p = clamp01(snapshot.progress);
  const active = phase !== 'dormant';
  finaleRoot.visible = active;
  if (!active) return;

  const t = Math.max(0, Number(snapshot.elapsedMs) || 0) / 1000;
  const defendEnergy = phase === 'arming' ? p * 0.48
    : phase === 'defend' ? 0.48 + p * 0.42
      : phase === 'transmit' ? 1 : 0.68;
  const pulse = 0.5 + 0.5 * Math.sin(t * (phase === 'defend' ? 5.2 : 3.1));

  for (let i = 0; i < relays.length; i++) {
    const relay = relays[i];
    const e = relayEnergy(i, snapshot);
    relay.root.visible = e > 0.015;
    if (!relay.root.visible) continue;
    const beat = 0.9 + 0.11 * pulse + waveKick * 0.16;
    relay.core.scale.setScalar(0.8 + e * 0.42 + waveKick * 0.08);
    relay.ring.scale.setScalar(0.86 + e * 0.22 + pulse * 0.05);
    relay.ring.rotation.z = t * (i % 2 ? -0.75 : 0.75) + i * 0.9;
    driveMaterial(relay.stemMat, MAGENTA, e, e * 0.36);
    driveMaterial(relay.coreMat, IVORY, e * beat, e * 0.78);
    driveMaterial(relay.ringMat, MAGENTA, e * beat, e * (0.20 + pulse * 0.10));
  }

  uplinkRoot.visible = defendEnergy > 0.04;
  const coreBeat = 0.92 + pulse * 0.13 + waveKick * 0.18;
  uplinkCore.scale.setScalar(0.76 + defendEnergy * 0.58 + waveKick * 0.12);
  driveMaterial(uplinkCoreMat, IVORY, defendEnergy * coreBeat,
    0.36 + defendEnergy * 0.58);

  for (let i = 0; i < chargeRings.length; i++) {
    const charged = phase === 'arming'
      ? clamp01(p * 3 - i)
      : clamp01((snapshot.wave || 0) - i + (phase === 'transmit' ? 1 : 0));
    const { ring, mat } = chargeRings[i];
    ring.visible = charged > 0.01;
    ring.rotation.z = t * (i % 2 ? -0.55 : 0.7) + i * 0.65;
    ring.scale.setScalar(0.86 + charged * 0.16 + waveKick * 0.08);
    driveMaterial(mat, i === 2 ? GOLD : MAGENTA,
      charged * coreBeat, charged * (0.12 + pulse * 0.12 + waveKick * 0.14));
  }

  beamRoot.visible = phase === 'transmit' || phase === 'complete';
  if (phase === 'transmit') {
    const rise = smooth(p / 0.16);
    const tail = 1 - smooth((p - 0.72) / 0.28) * 0.72;
    const height = Math.max(0.01, 52 * rise);
    beamSheath.scale.set(0.25 + pulse * 0.025, height, 0.25 + pulse * 0.025);
    beamSheath.position.y = height * 0.5;
    beamCore.scale.set(0.075 + pulse * 0.009, height, 0.075 + pulse * 0.009);
    beamCore.position.y = height * 0.5;
    beamTip.position.y = height;
    beamTip.scale.setScalar(0.35 + pulse * 0.14);
    driveMaterial(beamSheathMat, MAGENTA, tail, 0.24 * tail);
    driveMaterial(beamCoreMat, IVORY, tail, 0.86 * tail);
    driveMaterial(beamTipMat, IVORY, tail, 0.64 * tail);

    for (let i = 0; i < shockRings.length; i++) {
      const u = clamp01((p - 0.055 - i * 0.13) / 0.48);
      const live = u > 0 && u < 1;
      const { ring, mat } = shockRings[i];
      ring.visible = live;
      if (!live) continue;
      const size = 0.72 + u * (4.4 + i * 1.08);
      ring.scale.setScalar(size);
      driveMaterial(mat, i === 1 ? IVORY : MAGENTA, 1 - u, (1 - u) * (0.54 - i * 0.06));
    }

    const recoil = p < 0.38 ? Math.sin((p / 0.38) * Math.PI) * 0.46
      : (1 - p) * 0.055;
    setCrownPresentation({ energy: 1, surge: Math.max(waveKick, tail * 0.62), recoil });
  } else {
    // Results hold on a live-but-settled Crown. The lance remains as a narrow
    // afterglow behind the overlay, proof that the result followed the event.
    beamSheath.scale.set(0.15, 52, 0.15);
    beamSheath.position.y = 26;
    beamCore.scale.set(0.045, 52, 0.045);
    beamCore.position.y = 26;
    beamTip.visible = false;
    driveMaterial(beamSheathMat, MAGENTA, 0.32, 0.07);
    driveMaterial(beamCoreMat, IVORY, 0.38, 0.16);
    for (const { ring } of shockRings) ring.visible = false;
    setCrownPresentation({ energy: 0.72, surge: 0, recoil: 0 });
  }

  if (phase !== 'transmit' && phase !== 'complete') {
    beamRoot.visible = false;
    for (const { ring } of shockRings) ring.visible = false;
    setCrownPresentation({ energy: defendEnergy, surge: waveKick, recoil: 0 });
  }
}

function started(snapshot) {
  current = { ...current, ...snapshot };
  lastElapsedMs = current.elapsedMs;
  lastWave = current.wave;
  waveKick = 0;
  transmitting = false;
  beamTip.visible = true;
  setBanner(current);
  syncWorld(current);
}

function sync(snapshot) {
  const next = { ...current, ...snapshot };
  const dt = Math.max(0, Math.min(100, next.elapsedMs - lastElapsedMs));
  waveKick = Math.max(0, waveKick - dt / 520);
  if (next.phase === 'defend' && next.wave > lastWave) {
    for (let wave = lastWave + 1; wave <= next.wave; wave++) triggerDefensePacket(wave);
    waveKick = 1;
  }
  if (next.phase === 'transmit' && !transmitting) beginTransmission(next);
  current = next;
  lastElapsedMs = next.elapsedMs;
  lastWave = Math.max(lastWave, next.wave);
  setBanner(next);
  syncWorld(next);
}

function transmit(snapshot) {
  beginTransmission(snapshot || current);
  setBanner(snapshot || current);
  syncWorld(snapshot || current);
}

function reset() {
  current = {
    phase: 'dormant', elapsedMs: 0, kills: 0, quota: 0, progress: 0, wave: 0,
  };
  lastElapsedMs = 0;
  lastWave = 0;
  waveKick = 0;
  transmitting = false;
  finaleRoot.visible = false;
  beamRoot.visible = false;
  beamTip.visible = true;
  for (const { ring } of shockRings) ring.visible = false;
  resetCrownPresentation();
  setBanner(current);
}

reset();
installView({ finale: { started, sync, transmit, reset } });

export function finalePresentationSnapshot() {
  return {
    ...current,
    visible: finaleRoot.visible,
    transmitting,
    waveKick,
    banner: !!banner?.classList.contains('on'),
    crown: LIVE,
    signalS,
    portraitCarrier: PORTRAIT_CARRIER_SHIFT !== 0,
  };
}

if (typeof window !== 'undefined') window.__HB_FINALE_PRESENTATION = finalePresentationSnapshot;
