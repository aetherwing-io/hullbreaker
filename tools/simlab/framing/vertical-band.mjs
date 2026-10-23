#!/usr/bin/env node
/* vertical-band.mjs — does the climbing band fit the frame? (SPRINT T-107,
 * T-204): for the shipped helix and for ?rise=steep, at phone and desktop
 * viewports, over every scroll position on faces 1-6 and every route surface
 * RIG can stand on there (between the damage plane's margin and the right
 * clamp):
 *
 *   head            worst distance (CSS px) of RIG's PAINTED head above the
 *                   frame's top edge (> 0: off the top), and on which face;
 *   feetUnderCluster worst distance of RIG's feet on the lowest landing deck
 *                   (y 2) BELOW the touch deck's right-thumb cluster box top
 *                   where the cluster is (> 0: under the thumb);
 *   deckBelowBottom  worst distance of any deck below the frame's bottom.
 *
 *   node tools/simlab/framing/vertical-band.mjs
 *
 * The camera is render/camera.js syncCamera() replicated through
 * src/pure/framing.js (lens, lift) with the ascent's altitude and slope; the
 * thumb cluster is src/pure/touch-stick.js touchDeckLayout() — the same
 * layout the T-101 deck publishes — with the iPhone's landscape insets where
 * named. tools/pathcheck/t-107-phone-framing.mjs asserts the helix rows on
 * the phones; the steep rows are reported (the rise is flagged and unjudged).
 * Dev-only; zero effect on the game.                                      */

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const imp = (p) => import('file://' + join(ROOT, p));
const { CONFIG } = await imp('src/config.js');
const FR = await imp('src/pure/framing.js');
const ASC = await imp('src/pure/ascent.js');
const PATH = await imp('src/pure/path.js');
const RIG = await imp('src/pure/rig.js');
const LV = await imp('src/sim/level.js');
const TS = await imp('src/pure/touch-stick.js');
const SH = await imp('tools/simlab/lib/sixface-host.mjs');

const AD = CONFIG.framing.actorDepth, STEP = 2 * CONFIG.path.turnDeg * PATH.DEG * CONFIG.path.turnSign, C = CONFIG.camera;
const surf = [];
for (let c = 0; c < LV.groundH.length; c++) if (LV.groundH[c] > -100) surf.push({ s: c + 0.5, y: LV.groundH[c], deck: true });
for (const p of LV.platforms) for (let x = p.x0; x < p.x1; x += 0.5) surf.push({ s: x + 0.25, y: p.y });
for (const r of LV.solidRects) for (let x = r.x0; x < r.x1; x += 0.5) surf.push({ s: x + 0.25, y: r.y1 });
const lowestDeck = Math.min(...surf.filter((q) => q.deck).map((q) => q.y));

export function band(w, h, touch, profile, insets) {
  const L = SH.lensForViewport(CONFIG, w, h, 'far', touch, null);
  const [eL, eR] = SH.edgesForViewport(CONFIG, w, h, 'far', touch, null);
  const Lay = TS.touchDeckLayout(w, h, insets, 0, CONFIG.touch.layout, CONFIG.touch.stick);
  const reach = CONFIG.edges.margin + CONFIG.player.width / 2;
  const lo = eL + reach, hi = eR - reach;
  let head = -1e9, feet = -1e9, worstFace = 0, bottom = -1e9;
  for (let k = 1; k <= CONFIG.path.faces; k++) {
    const yaw = (k - 1) * STEP;
    const from = k === 1 ? 0 : PATH.CORNER_S[k - 2] + CONFIG.path.chamferTiles, to = PATH.HALT_S[k - 1];
    for (let sc = from; sc <= to; sc += 1) {
      const a = PATH.polyAt(PATH.SEGS, sc, { x: 0, z: 0 });
      const alt = ASC.normalAscentAltAt(sc, CONFIG.levelLength, profile);
      const ah = ASC.normalAscentAltAt(sc + C.lookX, CONFIG.levelLength, profile);
      const slope = (ah - alt) / C.lookX;
      const fx = Math.cos(yaw), fz = -Math.sin(yaw), rx = -fz, rz = fx;
      const eye = [a.x + fx * C.x + rx * L.depth, C.y + alt + slope * C.x + L.liftTiles, a.z + fz * C.x + rz * L.depth];
      const look = [a.x + fx * C.lookX, C.lookY + ah + L.liftTiles, a.z + fz * C.lookX];
      const B = FR.lookBasis(eye, look);
      for (const q of surf) {
        if (PATH.facetAtBends(q.s, PATH.BEND_S) !== k - 1 || q.s < sc + lo || q.s > sc + hi) continue;
        const p = PATH.polyAt(PATH.SEGS, q.s, { x: 0, z: 0 });
        const yw = PATH.yawAt(PATH.SEGS, q.s, CONFIG.path.yawBlendTiles);
        const qa = ASC.normalAscentAltAt(q.s, CONFIG.levelLength, profile);
        const pt = (y) => [p.x + Math.sin(yw) * AD, y + qa, p.z + Math.cos(yw) * AD];
        const hn = FR.projectNdc(eye, B, L.fovDeg, w / h, pt(q.y + RIG.RIG_BODY_VISUAL_H));
        const hv = -(1 - hn.y) / 2 * h;
        if (hv > head) { head = hv; worstFace = k; }
        if (q.deck) {
          const fn = FR.projectNdc(eye, B, L.fovDeg, w / h, pt(q.y));
          const fy = (1 - fn.y) / 2 * h, fxp = (fn.x + 1) / 2 * w;
          bottom = Math.max(bottom, fy - h);
          if (q.y === lowestDeck && fxp >= Lay.cluster.x) feet = Math.max(feet, fy - Lay.cluster.y);
        }
      }
    }
  }
  return { head: +head.toFixed(1), worstFace, feetUnderCluster: +feet.toFixed(1), deckBelowBottom: +bottom.toFixed(1) };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const ins = { top: 0, right: 47, bottom: 21, left: 47 }, none = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const profile of ['helix', 'steep'])
    for (const [w, h, t, i] of [[844, 390, true, ins], [844, 390, true, none], [932, 430, true, { top: 0, right: 59, bottom: 21, left: 59 }],
      [1280, 800, false, none], [1280, 720, false, none]])
      console.log(profile.padEnd(6), `${w}x${h}${t ? ' touch' : ''}${i.bottom > 0 ? ' iPhone insets' : ''}`.padEnd(28), JSON.stringify(band(w, h, t, profile, i)));
}
