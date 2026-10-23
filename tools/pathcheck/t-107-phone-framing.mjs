/* T-107 — the phone frame (decisions.md entry 20 addendum: "Phones only get a
 * tighter frame (RIG ~6% of screen height); desktop keeps FAR exactly as
 * decided in entries 7/17"), T-102's camera findings R2 (edge voids), R3 (the
 * post-turn zoom pump, ?orbit=joint) and I-104 (half of RIG off-frame at the
 * right clamp), and T-204's per-side rise (?rise=steep).
 *
 * The subject of every assertion is what a player sees or can do, computed
 * through the SAME pure modules the page's camera calls (src/pure/framing.js)
 * and the shipped level data — never the constants that produce it:
 *
 *   resolver   which frame a viewport + pointer gets; desktop is FAR with the
 *              shipped fov and zero lift EXACTLY (the identity the live
 *              tools/playtest/phone-framing-probe.mjs --compare then proves on
 *              the real camera matrices).
 *   scale      RIG's 1.7-tile body at its drawn depth: 5.5-6.5% of the height
 *              at 844x390 / 932x430 / 667x375 on touch, and the same share of
 *              the SHORT side in portrait.
 *   thumbs     at every scroll position on every face, RIG standing on the
 *              lowest landing deck where the right-thumb cluster is has its
 *              feet above the cluster box (T-101's published layout, with
 *              and without the iPhone's landscape insets), and RIG's painted
 *              head on every route surface stays inside the frame.
 *   clamp      RIG pinned at the right clamp keeps its whole drawn silhouette
 *              on screen at every viewport (and the old route-plane clamp
 *              would not: the falsifier is computed beside it).
 *   replicas   the turn lab and the race lab calibrate the edges the page
 *              does (they call the same module).
 *   ascent     ?rise= absent is the shipped helix bit for bit; ?rise=steep
 *              is a per-side grade table inside 0.16-0.21 (9-12 deg) with
 *              continuous altitude and grade, and no sim module reads it.
 *   orbit      ?orbit=joint ends the ritual at the settled camera depth (no
 *              pump) and joins the shipped pose exactly at both ends.
 *   veil       the lit far veil covers the frame's full width at every
 *              settled corner pose (gate, post-turn catch-up) at every
 *              viewport; ?veil=legacy (the falsifier) does not.
 *
 * TWO TIERS. The full tier adds played runs: the T-102 turn proof at the
 * phone frame (touch viewports, both orbits, the clamp-riding run) and the
 * render-only simulation fingerprints (tools/simlab/framing/render-only.mjs).
 * HB_GATE_FAST=1 runs every static/analytic check and prints a SKIP line for
 * the played runs, which are not counted as passes.                       */

import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { join } from 'node:path';
import { ok, srcDir, stripComments } from './_context.mjs';
import { CONFIG } from '../../src/config.js';
import * as FR from '../../src/pure/framing.js';
import * as ASC from '../../src/pure/ascent.js';
import * as PATH from '../../src/pure/path.js';
import * as WAVES from '../../src/pure/waves.js';
import * as RIG from '../../src/pure/rig.js';
import * as TS from '../../src/pure/touch-stick.js';
import { edgesForViewport, lensForViewport, PORTRAIT_SAFE } from '../simlab/lib/sixface-host.mjs';
import { assertCameraSourceMatches, viewportEdges } from '../simlab/race/edges.mjs';
import * as VEIL from '../simlab/framing/veil-need.mjs';
import { runMatrix } from '../simlab/turnlab.mjs';

export const title = 'T-107: the phone frame, the corner camera fixes and the per-side rise';

const AD = CONFIG.framing.actorDepth;
const PAINTED_H = RIG.RIG_BODY_VISUAL_H;              // RIG's drawn silhouette height
const BODY_H = CONFIG.player.height;
const r3 = (v) => Math.round(v * 1000) / 1000;
const PHONES = [[844, 390], [932, 430], [667, 375]];   // the box's three landscape phones
// iOS landscape safe insets (notch side + home indicator); the 667x375 SE has none
const IPHONE_INSETS = { '844x390': { top: 0, right: 47, bottom: 21, left: 47 },
  '932x430': { top: 0, right: 59, bottom: 21, left: 59 }, '667x375': { top: 0, right: 0, bottom: 0, left: 0 } };
const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
const STEP = 2 * CONFIG.path.turnDeg * PATH.DEG * CONFIG.path.turnSign;

// camera.js PORTRAIT_SAFE helpers (the T-102 domain guards the copy)
const blend = (w, h) => { const a = w / h; return a >= PORTRAIT_SAFE.startAspect ? 0 : Math.min(1, Math.max(0,
  (PORTRAIT_SAFE.startAspect - a) / (PORTRAIT_SAFE.startAspect - PORTRAIT_SAFE.fullAspect))); };
const lookDrop = (w, h) => PORTRAIT_SAFE.lookDropTiles * blend(w, h);
const rightNdcOf = (w, h) => 1 - 2 * Math.min(w * 0.18, PORTRAIT_SAFE.maxInsetPx * blend(w, h)) / w;

// The analytic camera on the flat first face (yaw 0, anchor at the origin,
// no ascent): the pose calibrateEdges() probes.
function flatFrame(w, h, touch, request = null) {
  const L = lensForViewport(CONFIG, w, h, 'far', touch, request);
  const e = FR.framedEdges({ width: w, height: h, depth: L.depth, fovDeg: L.fovDeg, liftTiles: L.liftTiles,
    lookDrop: lookDrop(w, h), rightNdc: rightNdcOf(w, h) }, CONFIG);
  return { ...e, lens: L, aspect: w / h };
}
const ndcOf = (F, p) => FR.projectNdc(F.eye, F.basis, F.lens.fovDeg, F.aspect, p);

// The camera on the shipped run (render/camera.js syncCamera): anchor, yaw,
// the ascent's altitude and slope, the lens. World point of a route spot.
function runPose(w, h, touch, scrollX, yaw, profile = undefined) {
  const L = lensForViewport(CONFIG, w, h, 'far', touch, null);
  const C = CONFIG.camera;
  const a = PATH.polyAt(PATH.SEGS, scrollX, { x: 0, z: 0 });
  const alt = ASC.normalAscentAltAt(scrollX, CONFIG.levelLength, profile);
  const altAhead = ASC.normalAscentAltAt(scrollX + C.lookX, CONFIG.levelLength, profile);
  const slope = (altAhead - alt) / C.lookX;
  const fx = Math.cos(yaw), fz = -Math.sin(yaw), rx = -fz, rz = fx;
  const eye = [a.x + fx * C.x + rx * L.depth, C.y + alt + slope * C.x + L.liftTiles, a.z + fz * C.x + rz * L.depth];
  const look = [a.x + fx * C.lookX, C.lookY + altAhead - lookDrop(w, h) + L.liftTiles, a.z + fz * C.lookX];
  return { eye, basis: FR.lookBasis(eye, look), lens: L, aspect: w / h };
}
function worldOf(s, y, depth, profile = undefined) {        // render/tower.js placeOnTower
  const p = PATH.polyAt(PATH.SEGS, s, { x: 0, z: 0 });
  const yaw = PATH.yawAt(PATH.SEGS, s, CONFIG.path.yawBlendTiles);
  return [p.x + Math.sin(yaw) * depth, y + ASC.normalAscentAltAt(s, CONFIG.levelLength, profile), p.z + Math.cos(yaw) * depth];
}
const toScreen = (P, q, w, h) => { const n = FR.projectNdc(P.eye, P.basis, P.lens.fovDeg, P.aspect, q);
  return { x: (n.x + 1) / 2 * w, y: (1 - n.y) / 2 * h, behind: n.behind }; };

export async function run() {
  await staticChecks();
  if (process.env.HB_GATE_FAST === '1') {
    console.log('SKIP t-107-phone-framing: the played turn runs at the phone frame and the render-only ' +
      'simulation fingerprints not run (HB_GATE_FAST=1 — per-edit tier; not counted as passes)');
    return;
  }
  await playedChecks();
}

export async function staticChecks() {
  /* ------------------------------ resolver ------------------------------ */
  const desktops = [[1280, 720], [1920, 1080], [1280, 800], [1440, 900], [1366, 768], [2560, 1440], [844, 390], [390, 844]];
  ok(desktops.every(([w, h]) => FR.resolveFramingId(null, w, h, false) === 'far'),
    'T-107: every mouse-driven window resolves to FAR, phone-sized ones included (' + desktops.map((v) => v.join('x')).join(', ') + ')');
  const phones = [[844, 390], [932, 430], [667, 375], [390, 844], [430, 932], [375, 667], [915, 412], [360, 780]];
  ok(phones.every(([w, h]) => FR.resolveFramingId(null, w, h, true) === 'phone'),
    'T-107: every touch phone resolves to the phone frame in both orientations');
  const tablets = [[768, 1024], [1024, 768], [820, 1180], [1180, 820], [744, 1133], [1366, 1024]];
  ok(tablets.every(([w, h]) => FR.resolveFramingId(null, w, h, true) === 'far'),
    'T-107: touch tablets (short side over the phone bound) keep FAR');
  ok(FR.resolveFramingId('far', 844, 390, true) === 'far' && FR.resolveFramingId('phone', 1280, 720, false) === 'phone' &&
     FR.resolveFramingId('near', 844, 390, true) === 'near' && FR.resolveFramingId('mid', 1280, 720, false) === 'mid' &&
     FR.resolveFramingId('banana', 844, 390, true) === 'phone' && FR.resolveFramingId('banana', 1280, 720, false) === 'far',
    'T-107: ?view=far forces FAR on a phone, ?view=phone forces the phone frame on desktop, near/mid keep their meaning, anything else is AUTO');
  ok([[0, 0], [NaN, 390], [844, -1], [Infinity, 390]].every(([w, h]) => FR.resolveFramingId(null, w, h, true) === 'far'),
    'T-107: a degenerate viewport (0, NaN, negative, infinite) is never a phone');
  ok(['far', 'near', 'mid'].every((id) => {
    const lens = FR.framingLens(id, 1280, 720, 42.75);
    return Object.is(lens.fovDeg, CONFIG.camera.fov) && Object.is(lens.liftTiles, 0);
  }), 'T-107: every non-phone frame is the shipped fov with zero lift, exactly (the desktop projection identity)');
  // EDGE_L on desktop is the shipped calibration: the live 1280x800 value
  // tools/simlab/t2lab.mjs recorded from window.HB.edges() before T-107.
  const d1610 = flatFrame(1280, 800, false);
  ok(Math.abs(d1610.left - (-27.438263128944797)) < 1e-9,
    `T-107: desktop 16:10 keeps the damage plane where it was (EDGE_L ${d1610.left}; recorded live -27.438263128944797)`);

  /* -------------------------------- scale ------------------------------- */
  // RIG's height share, measured where the camera looks (the frame's centre
  // column, x = lookX: where tools/playtest/phone-framing-probe.mjs stands RIG
  // in the live page). The camera's ~3 deg yaw toward that column makes the
  // share vary ~+-4% across the frame; the range is reported, not hidden.
  const share = (w, h, touch) => {
    const F = flatFrame(w, h, touch);
    const at = (x) => { const a = ndcOf(F, [x, 3, AD]), b = ndcOf(F, [x, 3 + BODY_H, AD]); return (b.y - a.y) / 2; };
    let lo = Infinity, hi = -Infinity;
    for (let f = 0.05; f <= 0.951; f += 0.15) {
      const v = at(F.left + f * (F.routeRight - F.left)); lo = Math.min(lo, v); hi = Math.max(hi, v);
    }
    const centre = at(CONFIG.camera.lookX);
    return { centre, lo, hi, short: centre * h / Math.min(w, h) };
  };
  for (const [w, h] of PHONES) {
    const s = share(w, h, true);
    ok(s.centre >= 0.055 && s.centre <= 0.065,
      `T-107: RIG's body is 5.5-6.5% of the height at ${w}x${h} on touch — ${r3(s.centre * 100)}% at the frame's centre ` +
      `(${r3(s.lo * 100)}-${r3(s.hi * 100)}% across it); painted silhouette ${r3(s.centre * 100 * PAINTED_H / BODY_H)}%`);
  }
  for (const [w, h] of [[390, 844], [430, 932], [375, 667]]) {
    const s = share(w, h, true);
    const L = lensForViewport(CONFIG, w, h, 'far', true, null);
    ok(L.id === 'phone' && Object.is(L.fovDeg, CONFIG.camera.fov) && Object.is(L.liftTiles, 0) && s.short >= 0.055,
      `T-107: a portrait phone (${w}x${h}) keeps FAR's portrait frame exactly — RIG's body is already ` +
      `${r3(s.short * 100)}% of the short side, at least the landscape phone's size, with no widening`);
  }
  {
    const s = share(1280, 720, false);
    ok(s.centre < 0.04 && s.centre > 0.036, `T-107: desktop FAR is untouched — RIG's body ${r3(s.centre * 100)}% of the height ` +
      `at the frame's centre (entry 7's ~3.7%)`);
  }

  /* ------------------------------- thumbs ------------------------------- */
  const LV = await import('../../src/sim/level.js');
  const facetOf = (s) => PATH.facetAtBends(s, PATH.BEND_S);
  // route surfaces: decks (groundH) and every platform / solid top
  const surfaces = [];
  for (let col = 0; col < LV.groundH.length; col++)
    if (LV.groundH[col] > -100) surfaces.push({ s: col + 0.5, y: LV.groundH[col], deck: true });
  for (const p of LV.platforms) for (let x = p.x0; x < p.x1; x += 0.5) surfaces.push({ s: x + 0.25, y: p.y, deck: false });
  for (const r of LV.solidRects) for (let x = r.x0; x < r.x1; x += 0.5) surfaces.push({ s: x + 0.25, y: r.y1, deck: false });
  const lowestDeck = Math.min(...surfaces.filter((q) => q.deck).map((q) => q.y));
  const highestTop = Math.max(...surfaces.filter((q) => facetOf(q.s) <= CONFIG.path.faces).map((q) => q.y));
  const thumbs = (w, h, insets, profile) => {
    const L = TS.touchDeckLayout(w, h, insets, 0, CONFIG.touch.layout, CONFIG.touch.stick);
    const F = flatFrame(w, h, true);
    // where RIG can stand: between the damage plane's margin and the clamp
    const lo = F.left + CONFIG.edges.margin + CONFIG.player.width / 2;
    const hi = F.right - CONFIG.edges.margin - CONFIG.player.width / 2;
    let feetUnderCluster = -Infinity, headOverTop = -Infinity, feetUnderStick = -Infinity, poses = 0;
    for (let k = 1; k <= CONFIG.path.faces; k++) {
      const yaw = (k - 1) * STEP;
      const from = k === 1 ? 0 : PATH.CORNER_S[k - 2] + CONFIG.path.chamferTiles, to = PATH.HALT_S[k - 1];
      for (let scroll = from; scroll <= to; scroll += 1) {
        const P = runPose(w, h, true, scroll, yaw, profile);
        poses++;
        for (const q of surfaces) {
          if (facetOf(q.s) !== k - 1) continue;           // only the facet this camera draws
          if (q.s < scroll + lo || q.s > scroll + hi) continue;
          const feet = toScreen(P, worldOf(q.s, q.y, AD, profile), w, h);
          if (feet.behind) continue;
          if (q.deck && q.y === lowestDeck) {
            if (feet.x >= L.cluster.x) feetUnderCluster = Math.max(feetUnderCluster, feet.y - L.cluster.y);
            if (feet.x >= L.ghost.cx - L.ghost.r && feet.x <= L.ghost.cx + L.ghost.r)
              feetUnderStick = Math.max(feetUnderStick, feet.y - (L.ghost.cy - L.ghost.r));
          }
          const head = toScreen(P, worldOf(q.s, q.y + PAINTED_H, AD, profile), w, h);
          headOverTop = Math.max(headOverTop, -head.y);
        }
      }
    }
    return { feetUnderCluster, headOverTop, feetUnderStick, poses };
  };
  ok(lowestDeck === 2 && highestTop === 17,
    `T-107: the band the phone frame is built for is the shipped one — lowest landing deck y ${lowestDeck}, ` +
    `highest route surface y ${highestTop} (re-derive the frame if the lattice moves)`);
  // the box's three phones, plus 844x350: the same iPhone in landscape Safari
  // with its toolbar showing (a shorter frame, the same 21 px inset)
  IPHONE_INSETS['844x350'] = IPHONE_INSETS['844x390'];
  for (const [w, h] of [...PHONES, [844, 350]]) {
    for (const [name, ins] of [['no insets', NO_INSETS], ['iPhone insets', IPHONE_INSETS[`${w}x${h}`]]]) {
      const t = thumbs(w, h, ins);
      ok(t.feetUnderCluster <= 0,
        `T-107: ${w}x${h} (${name}): RIG on the lowest deck never stands under the right-thumb cluster — ` +
        `worst ${r3(-t.feetUnderCluster)} px above its top over ${t.poses} scroll poses; ` +
        `stick ring ${t.feetUnderStick <= 0 ? r3(-t.feetUnderStick) + ' px clear' : r3(t.feetUnderStick) + ' px into its top (reported)'}`);
      if (name === 'no insets')
        ok(t.headOverTop <= 0, `T-107: ${w}x${h}: RIG's painted head stays inside the frame on every route surface ` +
          `(worst ${r3(-t.headOverTop)} px below the top)`);
    }
  }
  {
    // the vertical choice, falsified: T-104's ~6-tile lift (modelled before
    // the T-101 deck existed) would bury the lowest deck under the cluster
    const L = TS.touchDeckLayout(844, 390, NO_INSETS, 0, CONFIG.touch.layout, CONFIG.touch.stick);
    const lens = lensForViewport(CONFIG, 844, 390, 'far', true, null);
    const e6 = FR.framedEdges({ width: 844, height: 390, depth: lens.depth, fovDeg: lens.fovDeg, liftTiles: 6 }, CONFIG);
    const n = FR.projectNdc(e6.eye, e6.basis, lens.fovDeg, 844 / 390, [CONFIG.camera.lookX, lowestDeck, AD]);
    const feetY = (1 - n.y) / 2 * 390;
    ok(feetY > L.cluster.y, `T-107: a 6-tile lift would put the lowest deck ${r3(feetY - L.cluster.y)} px UNDER the cluster at 844x390 ` +
      `(why the frame lifts ${CONFIG.framing.phone.liftTiles} tiles, not 6)`);
  }

  /* -------------------------------- clamp ------------------------------- */
  const clampViews = [
    [1280, 720, false], [1920, 1080, false], [1280, 800, false], [1366, 768, false], [2560, 1080, false], [5120, 1440, false],
    [844, 390, true], [932, 430, true], [667, 375, true], [390, 844, true], [430, 932, true], [375, 667, true],
    [844, 390, false], [390, 844, false], [260, 1000, false], [768, 1024, true], [1024, 768, true],
  ];
  let worst = -Infinity, worstAt = '', oldWorst = -Infinity;
  for (const [w, h, touch] of clampViews) {
    const F = flatFrame(w, h, touch);
    const x = F.right - CONFIG.edges.margin - CONFIG.player.width / 2;      // pinned at the clamp
    for (const y of [2, 3, 3 + PAINTED_H / 2, 3 + PAINTED_H, 17, 17 + PAINTED_H]) {
      const n = ndcOf(F, [x + CONFIG.framing.actorHalfExtent, y, AD]);
      if (n.x > worst) { worst = n.x; worstAt = `${w}x${h}${touch ? ' touch' : ''}`; }
      const xOld = F.routeRight - CONFIG.edges.margin - CONFIG.player.width / 2;
      oldWorst = Math.max(oldWorst, ndcOf(F, [xOld, y, AD]).x);
    }
  }
  ok(worst <= 1, `T-107 (I-104): RIG pinned at the right clamp keeps its whole drawn silhouette on screen at all ` +
    `${clampViews.length} viewports (rightmost pixel at NDC ${r3(worst)}, ${worstAt})`);
  ok(oldWorst > 1, `T-107 (I-104) falsifier: the pre-T-107 route-plane clamp puts RIG's CENTRE past the frame edge ` +
    `(NDC ${r3(oldWorst)}) — the bound above binds`);
  ok(CONFIG.framing.actorHalfExtent === RIG.RIG_SPRITE_MAX_OVERRUN * RIG.BODY_HALF_WIDTH &&
     RIG.GUN_OUTER_X <= CONFIG.framing.actorHalfExtent && RIG.RIG_GUN_MUZZLE_X <= CONFIG.framing.actorHalfExtent,
    `T-107: the clamp's silhouette bound is pure/rig.js's documented overrun ceiling and covers the weapon ` +
    `(${CONFIG.framing.actorHalfExtent} >= gun ${RIG.GUN_OUTER_X}, muzzle ${RIG.RIG_GUN_MUZZLE_X})`);
  {
    const player = readFileSync(join(srcDir, 'render', 'player.js'), 'utf8');
    const hostiles = readFileSync(join(srcDir, 'render', 'hostiles.js'), 'utf8');
    const rigDepth = player.match(/const RIG_SURFACE_DEPTH = ([\d.]+);/);
    const hostileDepth = hostiles.match(/export const HOSTILE_SURFACE_DEPTH = ([\d.]+);/);
    ok(rigDepth && hostileDepth && +rigDepth[1] === AD && +hostileDepth[1] === AD,
      `T-107: the clamp is calibrated on the plane RIG and hostiles are drawn on (CONFIG.framing.actorDepth ${AD}; ` +
      `render/player.js ${rigDepth && rigDepth[1]}, render/hostiles.js ${hostileDepth && hostileDepth[1]})`);
  }

  /* ------------------------------ replicas ------------------------------ */
  let replicaOk = true;
  for (const [w, h, touch] of clampViews) {
    const F = flatFrame(w, h, touch);
    const [l, r] = edgesForViewport(CONFIG, w, h, 'far', touch, null);
    if (!Object.is(l, F.left) || !Object.is(r, F.right)) replicaOk = false;
    if (w === h * 0 + w && FR.isPhoneViewport(w, h, true) === touch && !(w === 844 && h === 390 && !touch) &&
        !(w === 390 && h === 844 && !touch)) {
      const e = viewportEdges(w, h, CONFIG);
      if (!Object.is(e.left, F.left) || !Object.is(e.right, F.right)) replicaOk = false;
    }
  }
  ok(replicaOk, 'T-107: the turn lab (sixface-host) and the race lab (edges.mjs) calibrate the edges the page does');
  let sourceOk = true;
  try { assertCameraSourceMatches(); } catch (e) { sourceOk = false; console.error(e.message); }
  ok(sourceOk, 'T-107: render/camera.js still contains the lens and clamp calls the race lab replicates');
  {
    const cam = stripComments(readFileSync(join(srcDir, 'render', 'camera.js'), 'utf8'));
    ok(/if \(camera\.fov !== lens\.fovDeg\) \{\s*camera\.fov = lens\.fovDeg;\s*camera\.updateProjectionMatrix\(\);\s*\}/.test(cam) &&
       /C\.y \+ alt \+ slope \* C\.x \+ lift/.test(cam) && /C\.lookY \+ altAhead - activePortraitLookDrop\(\) \+ lift/.test(cam),
      'T-107: the scene camera takes the resolved lens (fov only when it differs, lift added last) — on desktop both are the identity');
  }

  /* -------------------------------- ascent ------------------------------ */
  // the shipped helix, transcribed from main before T-204 (ace6618)
  const helix = (() => {
    const totalRise = 35, easeIn = 32;
    const ssi = (u) => u * u * u - 0.5 * u * u * u * u, ss = (u) => u * u * (3 - 2 * u);
    const prof = (endS) => { const end = Math.max(1, endS); const ease = Math.min(easeIn, end);
      const run = Math.max(0.5, end - ease * 0.5); return { end, ease, grade: totalRise / run }; };
    return {
      alt(s, endS) { const P = prof(endS); const x = Math.max(0, Math.min(P.end, s));
        if (x < P.ease) return P.grade * P.ease * ssi(x / P.ease); return P.grade * (x - P.ease * 0.5); },
      grade(s, endS) { const P = prof(endS); if (s <= 0 || s >= P.end) return 0;
        if (s < P.ease) return P.grade * ss(s / P.ease); return P.grade; },
    };
  })();
  const L = CONFIG.levelLength;
  let helixSame = true;
  for (let s = -5; s <= L + 5; s += 0.125) {
    if (!Object.is(ASC.normalAscentAltAt(s, L), helix.alt(s, L)) || !Object.is(ASC.normalAscentGradeAt(s, L), helix.grade(s, L)) ||
        !Object.is(ASC.normalAscentPitchAt(s, L), Math.atan(helix.grade(s, L)))) { helixSame = false; break; }
  }
  ok(helixSame && ASC.activeAscentProfile() === 'helix',
    'T-204: with ?rise= absent the rendered helix is the shipped one bit for bit (altitude, grade and pitch at 4,700 samples)');
  ok(ASC.resolveAscentProfile('steep') === 'steep' && ASC.resolveAscentProfile('1') === 'steep' &&
     ['0', null, '', 'helix', 'garbage'].every((v) => ASC.resolveAscentProfile(v) === 'helix'),
    'T-204: ?rise=steep (or 1) selects the per-side table; absent, 0 or anything else is the shipped helix');
  {
    const g = (s) => ASC.normalAscentGradeAt(s, L, 'steep'), a = (s) => ASC.normalAscentAltAt(s, L, 'steep');
    const faces = [];
    for (let k = 1; k <= CONFIG.path.faces; k++) {
      const s0 = CONFIG.path.introTiles + CONFIG.path.faceTiles * (k - 1) + (k === 1 ? 0 : CONFIG.path.chamferTiles);
      const s1 = PATH.CORNER_S[k - 1];
      let gmin = Infinity, gmax = -Infinity;
      for (let s = s0 + 8; s <= s1 - 8; s += 0.5) { gmin = Math.min(gmin, g(s)); gmax = Math.max(gmax, g(s)); }
      faces.push({ k, gmin, gmax, rise: a(s1) - a(k === 1 ? CONFIG.path.introTiles : PATH.CORNER_S[k - 2]) });
    }
    ok(faces.every((f) => f.gmin >= 0.16 - 1e-12 && f.gmax <= 0.21 + 1e-12),
      'T-204: every face of ?rise=steep climbs inside grade 0.16-0.21 (9.1-11.9 deg): ' +
      faces.map((f) => `F${f.k} ${r3(f.gmin)}`).join(', '));
    ok(faces.every((f) => f.rise >= 14 && f.rise <= 18.5),
      'T-204: on today\'s 88-tile sides each face rises 14-18.5 m (grade x side length): ' +
      faces.map((f) => `F${f.k} ${r3(f.rise)} m`).join(', ') + `; summit ${r3(a(L))} m vs the helix's ${r3(ASC.normalAscentAltAt(L, L, 'helix'))} m`);
    let maxAltJump = 0, maxGradeJump = 0, maxSlopeErr = 0, monotone = true;
    const h = 1 / 64;
    for (let s = 0; s < L; s += h) {
      maxAltJump = Math.max(maxAltJump, Math.abs(a(s + h) - a(s)));
      maxGradeJump = Math.max(maxGradeJump, Math.abs(g(s + h) - g(s)));
      if (a(s + h) < a(s) - 1e-12) monotone = false;
      maxSlopeErr = Math.max(maxSlopeErr, Math.abs((a(s + h) - a(s)) / h - (g(s) + g(s + h)) / 2));
    }
    ok(monotone && maxAltJump <= 0.21 * h + 1e-9 && maxGradeJump < 0.004 && maxSlopeErr < 1e-3,
      `T-204: ?rise=steep has no step and no kink — altitude continuous and climbing (max ${r3(maxAltJump / h)} per tile), ` +
      `grade continuous (max change ${maxGradeJump.toExponential(2)} per 1/64 tile), altitude is grade's integral ` +
      `(max error ${maxSlopeErr.toExponential(2)})`);
    ok(g(L - 1) === 0 && Math.abs(a(L) - a(L - 1)) < 1e-9,
      'T-204: ?rise=steep levels off onto the Crown summit (zero grade at the level end)');
  }
  {
    const simFiles = (await import('node:fs')).readdirSync(join(srcDir, 'sim')).filter((f) => f.endsWith('.js'));
    const readers = simFiles.filter((f) => /from\s+['"][^'"]*ascent\.js['"]/.test(readFileSync(join(srcDir, 'sim', f), 'utf8')));
    const mode = stripComments(readFileSync(join(srcDir, 'mode.js'), 'utf8'));
    ok(readers.length === 0 && /export const RISE_ID = selectAscentProfile\(QUERY\.get\('rise'\)\);/.test(mode),
      'T-204: the rise is presentation — no src/sim module imports pure/ascent.js, and mode.js selects the profile once ' +
      '(played proof: the render-only fingerprints in the full tier)');
  }

  /* -------------------------------- orbit ------------------------------- */
  {
    const depth = 42.75, chamfer = CONFIG.path.chamferTiles;
    const normalOf = (yaw) => [Math.sin(yaw), Math.cos(yaw)];       // outward normal (x, z)
    const lineDepth = (anchor, yaw, k) => {                          // eye's distance to face k+1's line
      const fx = Math.cos(yaw), fz = -Math.sin(yaw);
      const eye = [anchor.x + fx * CONFIG.camera.x - fz * depth, anchor.z + fz * CONFIG.camera.x + fx * depth];
      const p0 = PATH.polyAt(PATH.SEGS, PATH.CORNER_S[k - 1] + chamfer, { x: 0, z: 0 });
      const [nx, nz] = normalOf(k * STEP);
      return (eye[0] - p0.x) * nx + (eye[1] - p0.z) * nz;
    };
    let joint0 = 0, joint1 = 0, catchUp = 0, haltRatio = Infinity, jump = 0, haltJump = 0;
    const eyeOf = (a, yaw) => [a.x + Math.cos(yaw) * CONFIG.camera.x + Math.sin(yaw) * depth,
      a.z - Math.sin(yaw) * CONFIG.camera.x + Math.cos(yaw) * depth];
    for (let k = 1; k <= CONFIG.path.faces; k++) {
      const halt = PATH.HALT_S[k - 1], cs = PATH.CORNER_S[k - 1];
      const a0 = FR.jointOrbitAnchor(PATH.polyAt, PATH.SEGS, halt, cs, chamfer, 0, (k - 1) * STEP);
      const p0 = PATH.polyAt(PATH.SEGS, halt);
      joint0 = Math.max(joint0, Math.hypot(a0.x - p0.x, a0.z - p0.z));
      const past = cs + chamfer + 0.5;
      const a1 = FR.jointOrbitAnchor(PATH.polyAt, PATH.SEGS, past, cs, chamfer, 1, k * STEP);
      const p1 = PATH.polyAt(PATH.SEGS, past);
      joint1 = Math.max(joint1, Math.hypot(a1.x - p1.x, a1.z - p1.z));
      for (let sx = halt; sx <= cs + chamfer; sx += 0.25) {
        const aj = FR.jointOrbitAnchor(PATH.polyAt, PATH.SEGS, sx, cs, chamfer, 1, k * STEP);
        catchUp = Math.max(catchUp, Math.abs(lineDepth(aj, k * STEP, k) - depth));
      }
      haltRatio = Math.min(haltRatio, lineDepth(PATH.polyAt(PATH.SEGS, halt), k * STEP, k) / depth);
      // the camera EYE's per-frame travel through the ritual, joint vs shipped
      let prevJ = null, prevH = null;
      const pHalt = PATH.polyAt(PATH.SEGS, halt);
      for (let t = 0; t <= WAVES.cornerEventTotalMs(CONFIG); t += 1000 / 60) {
        const yaw = (k - 1) * STEP + WAVES.cornerYawDeltaDeg(t, CONFIG) * PATH.DEG * CONFIG.path.turnSign;
        const a = FR.jointOrbitAnchor(PATH.polyAt, PATH.SEGS, halt, cs, chamfer, (yaw - (k - 1) * STEP) / STEP, yaw);
        const ej = eyeOf(a, yaw), eh = eyeOf(pHalt, yaw);
        if (prevJ) jump = Math.max(jump, Math.hypot(ej[0] - prevJ[0], ej[1] - prevJ[1]));
        if (prevH) haltJump = Math.max(haltJump, Math.hypot(eh[0] - prevH[0], eh[1] - prevH[1]));
        prevJ = ej; prevH = eh;
      }
    }
    ok(joint0 < 1e-9 && joint1 < 1e-9,
      `T-107 (R3): ?orbit=joint is the shipped anchor before the ritual and after the catch-up (max ${joint0.toExponential(1)} / ${joint1.toExponential(1)} tiles)`);
    ok(catchUp < 1e-9 && haltRatio < 0.8,
      `T-107 (R3): after the swing ?orbit=joint stands at the settled depth from the arriving face (max error ${catchUp.toExponential(1)} tiles) ` +
      `where the shipped halt-point orbit stands at ${r3(haltRatio)} of it — the zoom pump`);
    ok(jump <= haltJump * 1.25, `T-107 (R3): the joint orbit's camera moves no more per frame than the shipped orbit does ` +
      `(max ${r3(jump)} vs ${r3(haltJump)} tiles per 60 Hz frame, the ratchet's own snap) — a swing, not a jump`);
  }

  /* --------------------------------- veil ------------------------------- */
  const settledOver = (rows) => rows.filter((r) => !r.during).reduce((m, r) => Math.max(m, r.leftOver, r.rightOver), -Infinity);
  const vps = [...VEIL.VIEWPORTS, { id: '2560x1080 (21:9)', w: 2560, h: 1080, touch: false },
    { id: '5120x1440 (32:9)', w: 5120, h: 1440, touch: false }];
  const extHalt = settledOver(VEIL.coverage({ extended: true, viewports: vps }));
  const extJoint = settledOver(VEIL.coverage({ extended: true, orbit: 'joint', viewports: vps }));
  const legacy = settledOver(VEIL.coverage({ extended: false, viewports: VEIL.VIEWPORTS }));
  const landscape = vps.filter((v) => v.w > v.h && v.w / v.h < 3);   // up to 21:9; 32:9 corners reported
  const vertical = VEIL.coverage({ extended: true, viewports: landscape }).filter((r) => !r.during)
    .reduce((m, r) => Math.max(m, r.verticalOver), -Infinity);
  const portraitVertical = VEIL.coverage({ extended: true, viewports: vps.filter((v) => v.w < v.h) })
    .filter((r) => !r.during).reduce((m, r) => Math.max(m, r.verticalOver), -Infinity);
  ok(extHalt <= 0 && extJoint <= 0,
    `T-107 (R2): the lit far veil spans the whole frame at every settled corner pose (gate, post-turn catch-up) at ` +
    `${vps.length} viewports up to 32:9, both orbits (closest edge ${r3(-Math.max(extHalt, extJoint))} tiles inside its opaque span)`);
  const wideVertical = VEIL.coverage({ extended: true, viewports: vps.filter((v) => v.w / v.h >= 3) })
    .filter((r) => !r.during).reduce((m, r) => Math.max(m, r.verticalOver), -Infinity);
  ok(vertical <= 0, `T-107 (R2): ... and its full height on every landscape screen up to 21:9 (closest ${r3(-vertical)} tiles inside; ` +
    `reported, not asserted: the 32:9 frame's corners reach ${r3(wideVertical)} tiles past it, and portrait's unchanged ` +
    `FAR frame ${r3(portraitVertical)} — pre-existing)`);
  ok(legacy > 0, `T-107 (R2) falsifier: ?veil=legacy leaves the frame edge ${r3(legacy)} tiles past the painting (T-102's voids)`);
}

/* ------------------------------ played (full) ----------------------------- */
const FAMILIES = Object.freeze({                    // tools/pathcheck/t-102-corner-turns.mjs
  envelope: ['teleport', 'popAfterRelocation', 'relocateOutsideOwnedRoute'],
  hinge: ['hingeFallThrough', 'hingeFallDeath', 'capsuleThroughDeck'],
  gate: ['gateShutWithKillConditionMet', 'haltedButIdle', 'gateBlind', 'hudLastButMore'],
  turn: ['approachAtBendNoTurn', 'turnWithoutRigAtBend', 'turnSkippedApproach'],
  facet: ['playerFacetBackwards', 'cameraFacetBackwards', 'rigCulledByFold'],
  ratchet: ['ratchetOutOfEnvelope', 'ratchetBaseMismatch', 'cameraYawJump', 'scrollBackwards'],
  framing: ['rigOffScreen'],
});

export function playedList() {
  return [
    { policy: 'run', viewport: 'phoneLandscapeTouch' },
    { policy: 'run', viewport: 'phoneMaxTouch' },
    { policy: 'run', viewport: 'phonePortraitTouch' },
    { policy: 'run', viewport: 'phoneLandscapeTouch', query: 'orbit=joint' },
    { policy: 'run', viewport: 'desktop', query: 'orbit=joint' },
    // momentum off rides the calibrated right clamp: the framing bound on the phone
    { policy: 'run', viewport: 'phoneLandscapeTouch', query: 'momentum=0' },
    { policy: 'die-at-hinge', viewport: 'phoneLandscapeTouch' },
  ].map((o) => ({ god: true, reactionMs: 350, ...o }));
}

export async function playedChecks(list = playedList(), jobs = Math.max(1, Math.min(3, cpus().length - 1))) {
  let results = [];
  try { results = await runMatrix(list, jobs); } catch (e) { console.error('pathcheck: T-107 turn child failed: ' + e.message); }
  ok(results.length === list.length, `T-107: all ${list.length} played turn runs at the phone frame completed`);
  for (const r of results) {
    const tag = `${r.policy}${r.query ? '?' + r.query : ''} @${r.viewport.width}x${r.viewport.height}${r.viewport.touch ? ' touch' : ''}`;
    ok(r.finishedCorners === 6 && r.endState === 'VICTORY',
      `T-107 [${tag}]: all five turns and the Crown approach complete at the phone frame (${r.finishedCorners}/6, ${r.endState})`);
    for (const [family, kinds] of Object.entries(FAMILIES)) {
      const hits = kinds.map((k) => [k, r.counts[k] || 0]).filter(([, n]) => n > 0);
      const first = hits.length ? r.violations.find((v) => kinds.includes(v.kind)) : null;
      ok(hits.length === 0, `T-107 [${tag}]: T-102's ${family} contract holds on every tick` +
        (hits.length ? ` — ${hits.map(([k, n]) => `${k}x${n}`).join(', ')}; first ${JSON.stringify(first)}` : ''));
    }
    ok(r.clampNdc < 1, `T-107 [${tag}]: RIG pinned at the right clamp renders its chest on screen (NDC ${r3(r.clampNdc)}, was ~1.012)`);
  }
  // the rise and the corner camera are presentation: the simulation is
  // byte-identical with and without them (and a sim flag is not)
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [join(srcDir, '..', 'tools', 'simlab', 'framing', 'render-only.mjs'),
      '--seeds', '1', '--viewports', 'desktop-16x10,phone-landscape', '--max-game-ms', '150000'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (c) => { if (c !== 0) console.error(out.slice(-2000)); resolve(c); });
  });
  ok(code === 0, 'T-107/T-204: ?rise=steep, ?orbit=joint and ?veil=legacy leave every simulated run byte-identical ' +
    '(policies x seeds x desktop/phone, sim fingerprints) while the falsifier ?momentum=0 moves every one');
}
