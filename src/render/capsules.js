/* ====================== CAPSULE MESHES ============================ */
/* Lettered pickup boxes: one shared geometry, a cached canvas texture per
   letter, and the expiry blink for capsules knocked out of the player.

   FAR-view readability (T-003, decisions.md entry 7's accepted follow-up).
   Three things were costing the letter at the shipped default view, where
   T-015 measured the 0.55-tile box at 9.6px and its letter at under 7px:

     1. the letter was drawn at a fixed font size into a 64px canvas, so
        two thirds of the face was margin. It is now FITTED — measured and
        scaled so its drawn ink is exactly GLYPH_INK_FILL of the face — and
        fattened with a matching stroke, so the strokes survive minification;
     2. the box drew at world size, which the pull-back shrinks like any
        other world mass. A letter is information, not mass, so the mesh is
        scaled by GLYPH_GAIN, which restores exactly the screen size the
        near view already had — and nothing more (see src/render/legibility.js);
     3. the pickup twirl was a full spin, so the lettered face was edge-on
        for a large part of every revolution. It is now a bounded rock at
        the same rate: still alive, never turned away.

   The SIM is untouched: CAP.size and CAP.pickupRadius are the sim's, the
   drawn box stays inside the catch radius at every view (asserted), and
   ?legibility=0 restores the pre-pass geometry gain at every view.       */

import * as THREE from 'three';
import { installView } from '../sim/bridge.js';
import { gameMs, blink } from '../sim/time.js';
import { CAP } from '../sim/capsules.js';
import { scene } from './scene.js';
import { placeOnTower } from './tower.js';
import { PAL } from './palette.js';
import {
  CAPSULE_SWEEP_FREQ, CAPSULE_SWEEP_RAD, GLYPH_EDGE, GLYPH_GAIN, GLYPH_INK_FILL,
  GLYPH_SQUEEZE_MIN, GLYPH_TEX_PX, LEGIBILITY_ON,
} from './legibility.js';

const capsuleGeo = new THREE.BoxGeometry(CAP.size, CAP.size, CAP.size);   // shared: never disposed
const letterTexCache = {};

const GLYPH_FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const GLYPH_FATTEN = 0.08;         // stroke width per px of font size: chunky strokes are
                                   //   what survives a mipmapped minification to ~14px

// Measure-then-fit, so GLYPH_INK_FILL is a promise about the letter's DRAWN
// ink rather than about its em box (which varies per font and per glyph).
// A multi-character mod label condenses horizontally before it gives up any
// height — cap height is what reads at distance.
function drawGlyph(g, text, N) {
  const edge = Math.max(1, Math.round(N * GLYPH_EDGE));
  const targetH = N * GLYPH_INK_FILL;
  const usableW = N - 4 * edge;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  const probe = 100;
  g.font = 'bold ' + probe + 'px ' + GLYPH_FONT;
  const m0 = g.measureText(text);
  // actualBoundingBox* is the drawn-ink extent; the fallback keeps this
  // working (approximately) on a canvas implementation that omits it
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
  if (squeeze < GLYPH_SQUEEZE_MIN) {      // wider than a condensed label can carry:
    vscale = squeeze / GLYPH_SQUEEZE_MIN; //   only now does height pay
    squeeze = GLYPH_SQUEEZE_MIN;
  }
  g.save();
  g.translate(N / 2, N / 2);
  g.scale(squeeze, vscale);
  g.lineJoin = 'round';
  g.lineWidth = size * GLYPH_FATTEN;
  g.strokeStyle = PAL.capsuleInk;
  g.fillStyle = PAL.capsuleInk;
  const baseline = (asc - desc) / 2;      // ink centered on the face, not the em box
  g.strokeText(text, 0, baseline);
  g.fillText(text, 0, baseline);
  g.restore();
}

// text === null draws the bare plate: the four faces that are never square to
// the camera carry no letter, so the box reads as ONE lettered object instead
// of the "H|H" corner two lettered faces produced at the rocking angle.
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
    // an ink edge around the plate: at FAR the box is ~18px of saturated
    // pickup color against a lit rust deck, and the border is what keeps it
    // a readable OBJECT rather than a bright patch of the surface
    const edge = Math.max(1, Math.round(N * GLYPH_EDGE));
    g.fillStyle = PAL.capsuleInk;
    g.fillRect(0, 0, N, edge);
    g.fillRect(0, N - edge, N, edge);
    g.fillRect(0, 0, edge, N);
    g.fillRect(N - edge, 0, edge, N);
    if (text) drawGlyph(g, text, N);
  } else {
    // the pre-pass draw, verbatim: ?legibility=0 is the operator's A/B
    g.fillStyle = PAL.capsuleInk;
    g.font = 'bold ' + (text.length > 1 ? 30 : 42) + 'px monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 32, 35);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;                    // clamped to the device max at upload
  letterTexCache[key] = tex;
  return tex;
}

const meshes = new Map();                // sim capsule row → { mesh, mats }

function spawned(c) {
  const kind = c.kind, letter = c.letter;
  const bg = kind === 'mod' ? PAL.modCapsule : PAL.capsule;
  const face = new THREE.MeshBasicMaterial({ map: faceTexture(letter, bg) });
  // BoxGeometry group order is +x, -x, +y, -y, +z, -z; +z/-z are the faces the
  // bounded rock keeps square to the camera, so they carry the letter
  const mats = [face];
  let mesh;
  if (LEGIBILITY_ON) {
    const plate = new THREE.MeshBasicMaterial({ map: faceTexture(null, bg) });
    mats.push(plate);
    mesh = new THREE.Mesh(capsuleGeo, [plate, plate, plate, plate, face, face]);
  } else {
    mesh = new THREE.Mesh(capsuleGeo, face);
  }
  // render-only readability gain: the sim's CAP.size and pickup radius are
  // untouched, and the drawn box stays inside the catch circle (asserted)
  mesh.scale.setScalar(GLYPH_GAIN);
  scene.add(mesh);
  meshes.set(c, { mesh, mats });
}

function removed(c) {
  const v = meshes.get(c);
  if (!v) return;
  meshes.delete(c);
  scene.remove(v.mesh);
  for (const m of v.mats) m.dispose();
}

function sync(c) {
  const v = meshes.get(c);
  if (!v) return;
  // expiring pop-capsules blink through their last stretch
  v.mesh.visible = c.mode !== 'pop' || c.dieAt - gameMs > CAP.blinkLastMs || blink();
  placeOnTower(v.mesh, c.x, c.y, 0);
  // pickup twirl on top of face yaw: a bounded rock while the readability
  // pass is on (the lettered face never turns away), the original spin when
  // it is off
  v.mesh.rotation.y += LEGIBILITY_ON
    ? Math.sin(c.t * CAPSULE_SWEEP_FREQ) * CAPSULE_SWEEP_RAD
    : c.t * 2.2;
}

installView({ capsules: { spawned, removed, sync } });
