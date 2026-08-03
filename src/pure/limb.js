/* ============================== LIMB ============================== */
/* The creature-limb reading of the shipped hexagonal tower: which stretch
   of the circuit is which armour facet, where the joints are, and where
   every static piece of anatomy sits along them.

   This is a RENDER INTERPRETATION of the six-face run (?g1=1 — gate G1 in
   docs/proposals/2026-07-meridian-monster-greybox-map.md). The simulation
   is untouched: same path, same corner events, same ritual timings, same
   built-column state machine, same spawn tables. What changes is what a
   corner LOOKS like — the camera's existing 60° two-snap ratchet
   (../pure/waves.js) becomes an orbit around a joint of a static leg, and
   the next facet is not assembled but simply already there, shrouded by
   the joint's own mass, by the grazing angle a facet is seen at from far
   away, and by fog.

   THE LIMB NEVER MOVES. This module is a bake plan: a flat list of static
   boxes in (s, y, depth) that ../render/limb.js instantiates once. There
   is no time argument anywhere in this file, by design — per the CP3
   ruling (docs/decisions.md entry 3) the creature's body may not
   assemble, slam, or articulate.

   Pure: no three.js, no DOM. The harness (tools/pathcheck.mjs) rebuilds
   the plan and asserts the two rules that keep the theatre honest:

     1. nothing baked outward of the combat plane may enter the play band,
        so the limb can never hide RIG, a hostile, a bullet, or a deck; and
     2. outward mass that reaches past `fallOutwardMax` may only sit over a
        joint apron — columns the generator guarantees are flat solid
        ground — so a fall into a gap is never hidden behind armour.       */

import { CONFIG } from '../config.js';
import { cornerSList } from './path.js';

/* ------------------------------ topology --------------------------- */

// The straight armour facets between chamfers. Facet 0 carries the intro and
// the first wave; facet `faces` carries the outro. These are exactly the
// polyline's straight runs, so one facet is one flat plane of armour.
export function limbFacets(cfg) {
  const corners = cornerSList(cfg);
  const ch = cfg.path.chamferTiles;
  const out = [];
  for (let k = 0; k <= corners.length; k++) {
    out.push({
      k,
      s0: k === 0 ? 0 : corners[k - 1] + ch,
      s1: k < corners.length ? corners[k] : cfg.levelLength,
    });
  }
  return out;
}

// One joint per corner. `s` is the pivot the sim already uses; `sMid` is the
// middle of the chamfer, which is where the joint's mass is centred so it
// reads as one hinge rather than two bends. `apron0/apron1` is the flat,
// gap-free, catwalk-free staging ground the generator authors around every
// corner (src/pure/generator.js) — the only place outward mass is allowed to
// reach far, because nothing can fall there.
export function limbJoints(cfg) {
  const J = cfg.limb.joint;
  return cornerSList(cfg).map((s, i) => ({
    k: i + 1,
    s,
    sMid: s + cfg.path.chamferTiles / 2,
    apron0: s - J.apronBack,
    apron1: s + J.apronFwd,
  }));
}

// Facet material tone: weathering, fixed per facet forever. Two facets meeting
// at a joint read as two different planes of armour even before the camera
// turns, which is most of what makes the orbit legible.
export function limbFacetTone(k, cfg) {
  const tones = cfg.limb.tone;
  return tones[k % tones.length];
}

/* ------------------------------ helpers ---------------------------- */

// Deck reference height for a stretch: the highest solid column in it (the
// dressing hangs off the deck, so it must clear the tallest one). Gap-only
// stretches fall back to the generator's flat height.
export function limbGroundRef(groundH, a, b) {
  let ref = -999;
  for (let s = a; s < b; s++) if (groundH[s] > -100) ref = Math.max(ref, groundH[s]);
  return ref > -100 ? ref : 3;
}

export function limbChunkRanges(s0, s1, cols) {
  const out = [];
  for (let a = s0; a < s1; a += cols) out.push([a, Math.min(a + cols, s1)]);
  return out;
}

// Is any column in [a, b) possibly a gap RIG can fall through? Outward mass
// over one of those would hide the fall, so the plan may not reach far there.
export function limbSpanHasGap(groundH, a, b) {
  for (let s = Math.floor(a); s < Math.ceil(b); s++)
    if (!(groundH[s] > -100)) return true;
  return false;
}

// Deterministic, seed-free variation: the skin should not be a perfect ruler.
// A hash of the column index, so the same tile is dressed the same way in
// every run and in the harness.
function jitter(i, n) { return ((i * 2654435761) >>> 0) % n; }

/* ---------------------------- the bake plan ------------------------ *
 * Every piece: { kind, facet, s, w, y, h, depth, d } — s/y are centres, w is
 * length along the path, h is height, depth is the centre depth outward from
 * the combat plane (positive = toward the camera), d is thickness in depth.
 * `pathS` is where the piece is placed on the polyline; for joint pieces that
 * is the chamfer midpoint, whose sharp heading bisects the two facets.       */

function push(out, kind, facet, s, w, y, h, depth, d, roll = 0, shape = null) {
  const piece = { kind, facet, s, w, y, h, depth, d };
  // `roll` is a render-only rake in the local (s,y) plane. Keeping it on the
  // bake piece makes the anatomy deterministic and lets the renderer retain
  // one static instanced upload rather than posing ribs or tendons per frame.
  if (roll) piece.roll = roll;
  if (shape) piece.shape = shape;
  out.push(piece);
}

export function limbBakePlan(cfg, groundH, opts = {}) {
  const scale = opts.scale !== false;             // T-045; ?scale=0 is the A/B
  const out = [];
  for (const facet of limbFacets(cfg)) {
    facetPlan(out, facet, cfg, groundH, scale);
  }
  for (const joint of limbJoints(cfg)) {
    jointPlan(out, joint, cfg, groundH);
  }
  return out;
}

function facetPlan(out, facet, cfg, groundH, scale) {
  const L = cfg.limb;
  const k = facet.k;
  // --- the body under the deck -----------------------------------------
  for (const [a, b] of limbChunkRanges(facet.s0, facet.s1, L.chunkCols)) {
    const ref = limbGroundRef(groundH, a, b);
    const span = b - a;
    const mid = (a + b) / 2;
    const deckBottom = ref - 4;                 // the tile stack is 4 deep
    // hull: mass running off the bottom of frame — the leg continues below
    push(out, 'hull', k, mid, span, deckBottom - L.hull.drop / 2, L.hull.drop,
         L.hull.depth, L.hull.thickness, L.hull.tiltDeg * Math.PI / 180);
    // the shadow line right under the deck lip
    push(out, 'hullRib', k, mid, span, deckBottom - L.hull.ribH / 2, L.hull.ribH,
         L.hull.depth - 0.5, L.hull.ribThickness);
  }

  // No continuous wall here. With the normal-run helix, a later coil's wall
  // becomes an enormous hanging rectangle over the current one—the exact
  // warehouse read this file is meant to avoid. anatomyPlan emits sparse,
  // tapered backing lobes only where a gill organ needs body mass.
  anatomyPlan(out, facet, cfg, groundH);
  // --- the ramp edge: one unbroken kerb along the deck's outer lip -----
  // Per column, at that column's own deck height, so the line follows every
  // step and breaks only where the route itself does (a gap is a gap). It is
  // the only outward piece allowed inside the play band's y range, and it is
  // allowed because its top is below the deck: see CONFIG.limb.kerb.
  const K = L.kerb;
  const kerbDepth = L.planeHalfDepth + K.outward - K.thickness / 2;
  for (let s = facet.s0; s < facet.s1; s++) {
    if (!(groundH[s] > -100)) continue;
    push(out, 'kerb', k, s + 0.5, 1 + K.overlap, groundH[s] - K.under - K.h / 2, K.h,
         kerbDepth, K.thickness);
  }
  // One larger armour language sits just under the exact collision lip. The
  // original four-row tile face remains the gameplay truth, but overlapping
  // tapered plates cover its warehouse-like rectangle and point consistently
  // uphill. Any group containing a gap is skipped, so the silhouette never
  // advertises floor where the simulation has none.
  const LS = L.lipScute;
  const lipRoll = LS.tiltDeg * Math.PI / 180;
  for (let a = facet.s0; a < facet.s1; a += LS.every) {
    const b = Math.min(a + LS.every, facet.s1);
    let minDeck = Infinity, solid = true;
    for (let s = Math.floor(a); s < Math.ceil(b); s++) {
      if (!(groundH[s] > -100)) { solid = false; break; }
      minDeck = Math.min(minDeck, groundH[s]);
    }
    if (!solid || b - a < 2) continue;
    const len = Math.min(LS.len, b - a + 0.7);
    const halfY = Math.abs(Math.cos(lipRoll)) * LS.h / 2 +
      Math.abs(Math.sin(lipRoll)) * len / 2;
    const top = minDeck - LS.under;
    push(out, 'lipScute', k, (a + b) / 2, len, top - halfY, LS.h,
         LS.depth, LS.thickness, lipRoll, 'scute');
  }
  // --- the skin: overlapping scutes below the deck --------------------
  const S = L.scute;
  for (let s = facet.s0; s < facet.s1; s += S.every) {
    const a = s, b = Math.min(s + S.every, facet.s1);
    if (b - a < 2) continue;                    // no stub plates at a facet end
    const ref = limbGroundRef(groundH, a, b);
    const v = jitter(a, 3);
    const len = Math.min(S.len, facet.s1 - a + 0.4);
    // Plates step in depth and height along the facet: seen from 20+ tiles
    // away (a grazing angle) they overlap into one closed armoured surface;
    // seen square-on, from the camera that just turned onto this facet, the
    // deck above them is wide open.
    const top = ref - 4 - S.under - (v === 1 ? S.stagger : 0);
    const depth = S.depth - (v === 2 ? S.stagger : 0);
    const roll = S.tiltDeg * Math.PI / 180;
    // Keep the rotated plate's highest corner at `top`: the visible rake is
    // allowed to say UPHILL, but never to poke anatomy into the play band.
    const halfY = Math.abs(Math.cos(roll)) * S.h / 2 + Math.abs(Math.sin(roll)) * len / 2;
    push(out, 'scute', facet.k, a + len / 2 - 0.2, len, top - halfY, S.h,
         depth, S.thickness, roll);
    if ((a / S.every) % S.ribEvery === 0) {
      const ribRoll = -roll * 0.55;
      const ribHalfY = Math.abs(Math.cos(ribRoll)) * S.ribH / 2 +
        Math.abs(Math.sin(ribRoll)) * S.ribW / 2;
      push(out, 'scuteRib', facet.k, a + 0.5, S.ribW, top - ribHalfY, S.ribH,
           depth + 0.2, S.thickness + 0.4, ribRoll);
    }
  }
  // --- distant anatomy: the limb continuing up, and the body beyond ----
  if (!scale) {
    const len = facet.s1 - facet.s0;
    for (const sk of L.silhouette) {
      push(out, 'silhouette', facet.k, facet.s0 + sk.atFrac * len, sk.w,
           sk.y0 + sk.h / 2, sk.h, sk.depth, sk.thickness);
    }
    return;
  }
  sisterPlan(out, facet, cfg);
  spinePlan(out, facet, cfg);
  farPlan(out, facet, cfg);
  markPlan(out, facet, cfg);
}

// Gill stacks, ribs and tendon cables: sparse, oversized, and directional.
// The function consumes only config + the baked level heights, so it has the
// same static-anatomy contract as the rest of this module.
function anatomyPlan(out, facet, cfg, groundH) {
  const A = cfg.limb.anatomy;
  const W = cfg.limb.wall;
  const G = A.gill;
  const R = A.rib;
  const T = A.tendon;
  const k = facet.k;
  const gillRoll = G.tiltDeg * Math.PI / 180;
  const ribRoll = -R.tiltDeg * Math.PI / 180;
  const tendonRoll = T.tiltDeg * Math.PI / 180;

  for (let s = facet.s0 + 10; s < facet.s1 - 4; s += G.every) {
    const ref = limbGroundRef(groundH, s - G.slitW / 2, s + G.slitW / 2);
    const offset = (jitter(Math.floor(s) + k * 13, 3) - 1) * 0.5;
    const organH = G.pitch * (G.slits - 1) + 3.2;
    push(out, 'wall', k, s, G.slitW + 3.2, ref + 0.6 + offset, organH,
         W.depth, W.thickness, gillRoll * 0.45);
    for (let i = 0; i < G.slits; i++) {
      const w = G.slitW - i * 0.72;
      push(out, 'gill', k, s + i * 0.22, w, ref - 0.8 + offset + i * G.pitch,
           G.slitH, G.depth, G.thickness, gillRoll);
    }
    // One asymmetrical load-bearing rib is enough to turn the slits into an
    // organ. A complete rectangular frame would turn them straight back into
    // windows, the visual failure this pass is removing.
    push(out, 'bodyRib', k, s - G.slitW * 0.56, R.w, ref + 1.7, R.h,
         R.depth, R.thickness, ribRoll);
  }

  for (let s = facet.s0 + 12; s < facet.s1 - 5; s += T.every) {
    const ref = limbGroundRef(groundH, s - T.w / 2, s + T.w / 2);
    const halfY = Math.abs(Math.cos(tendonRoll)) * T.h / 2 +
      Math.abs(Math.sin(tendonRoll)) * T.w / 2;
    const top = ref - 5.25;
    for (let i = 0; i < T.bands; i++)
      push(out, 'flankTendon', k, s, T.w, top - halfY - i * T.gap, T.h,
           T.depth, T.thickness, tendonRoll);
  }
}

/* ------------------------ the scale pass (T-045) -------------------- *
 * Three graded tiers of anatomy in the haze band, and one set of
 * human-scale reference objects emitted at the SAME absolute size on the
 * limb RIG runs on and on the backdrop limb behind it. Every constant is
 * in CONFIG.limb.backdrop / CONFIG.limb.mark, with the two derived fences
 * (the haze ladder and the play-band screen fence) written out there.
 *
 * Still a bake: no time argument, no rng, hash-driven variation only, so
 * the body cannot animate or assemble (entry 3).                       */

// Tier 1 — the sister limb: the played limb's own vocabulary at 2.6x, on a
// diagonal, so two masses read as one creature instead of as scenery.
function sisterLayout(facet, cfg) {
  const S = cfg.limb.backdrop.sister;
  const len = facet.s1 - facet.s0;
  const run = len * S.span;
  const slack = Math.max(0, len - run - len * S.spanAt);
  const s0 = facet.s0 + len * S.spanAt + jitter(facet.k * 3 + 1, 4) * slack / 4;
  const segs = Math.max(2, Math.round(run / S.segW));
  return {
    s0, segs, step: run / segs,
    dir: jitter(facet.k * 7 + 3, 2) === 0 ? 1 : -1,     // climbs or descends
    // the diagonal is centred on `base`, so the LOW end has to start half a
    // rise above the tier floor. Clamping the low end to the floor instead
    // (the first pass did) flattens half of every diagonal into a horizontal
    // edge, which is exactly the shelf/ceiling read this tier must not have.
    base: S.y0 + S.rise / 2 + jitter(facet.k * 11 + 5, S.ySteps) * S.yStep,
  };
}

// bottom of segment `i` on the diagonal — one function, so the marks ride
// exactly the mass they are supposed to be attached to
function sisterBottom(i, lay, S) {
  const t = lay.segs > 1 ? i / (lay.segs - 1) : 0.5;
  return Math.max(S.y0, lay.base + lay.dir * S.rise * (t - 0.5));
}

function sisterPlan(out, facet, cfg) {
  const S = cfg.limb.backdrop.sister;
  const k = facet.k;
  const lay = sisterLayout(facet, cfg);
  const { segs, step } = lay;
  // Follow the macro diagonal with the plates themselves. Previously their
  // centres climbed but every segment stayed plumb, producing a staircase of
  // vertical wall bays. The rake turns the same chain into one huge armoured
  // limb. rakeLift keeps the rotated lower corners above the play-band fence.
  const roll = lay.dir * Math.atan2(S.rise, segs * step) * S.rake;
  for (let i = 0; i < segs; i++) {
    const bottom = sisterBottom(i, lay, S);
    const s = lay.s0 + (i + 0.5) * step;
    const w = step + S.overlap;
    push(out, 'bdLimb', k, s, w, bottom + S.segH / 2 + S.rakeLift, S.segH,
         S.depth, S.thickness, roll);
    // the lip along the top: the same bright edge line the deck kerb draws,
    // one scale up — it is what gives the mass a readable silhouette in haze
    push(out, 'bdLimbLip', k, s, w, bottom + S.segH - S.lipH / 2 + S.rakeLift, S.lipH,
         S.depth + S.lipOut, S.thickness, roll);
    // a raised ring at every few segment joints; it grows UPWARD only, so it
    // can never drop a piece below the tier's authored floor
    if (i % S.ringEvery === 0)
      push(out, 'bdRing', k, s - w / 2, S.ringW,
           bottom + (S.segH + S.ringOver) / 2 + S.rakeLift,
           S.segH + S.ringOver, S.depth + S.ringOut, S.thickness);
  }
  markSister(out, facet, cfg, lay);
}

// Tier 2 — vertebral drums: barrels on a shaft, seen edge-on.
function spinePlan(out, facet, cfg) {
  const P = cfg.limb.backdrop.spine;
  const k = facet.k;
  const len = facet.s1 - facet.s0;
  const n = Math.max(1, Math.round(len / P.every));
  const step = len / n;
  const tops = [];
  for (let i = 0; i < n; i++) {
    const s = facet.s0 + (i + 0.5) * step;
    // a spine UNDULATES; a row of drums at one height is a colonnade, which
    // is the architecture read the macro form was rejected for
    const wave = (1 + Math.sin(i * 0.85 + k * 1.7)) / 2;
    const bottom = P.y0 + wave * P.ySteps * P.yStep;
    const tall = P.drumH * P.barrel.reduce((a, [, hf]) => a + hf, 0);
    const mid = bottom + tall / 2;
    // five chorded slabs, not one box: at 62% haze a chamfered stack and a
    // real cylinder are the same silhouette, and this one is still a box pool
    let y = bottom;
    for (const [wf, hf] of P.barrel) {
      push(out, 'bdDrum', k, s, P.drumW * wf, y + P.drumH * hf / 2, P.drumH * hf,
           P.depth, P.thickness);
      y += P.drumH * hf;
    }
    tops.push({ s, mid });
  }
  // the shaft between two drums, half a tier further back so it reads as the
  // thing the drums are threaded onto
  for (let i = 1; i < n; i++) {
    const a = tops[i - 1], b = tops[i];
    push(out, 'bdLink', k, (a.s + b.s) / 2, b.s - a.s + 0.4, (a.mid + b.mid) / 2,
         P.linkH, P.depth - 0.6, P.thickness);
  }
}

// Tier 3 — the far body: one continuous mass with a stepped top edge, plus a
// crown of spires once per facet. This is the tier that keeps something
// enormous in frame at every point of the run (asserted in pathcheck).
function farPlan(out, facet, cfg) {
  const F = cfg.limb.backdrop.far;
  const k = facet.k;
  // It runs a chamfer PAST each end of its facet: at a corner the polyline is
  // still bending there, so the far body carries around the turn instead of
  // stopping dead at the seam the way the wall does.
  const ch = cfg.path.chamferTiles;
  const a = Math.max(0, facet.s0 - ch);
  const b = Math.min(cfg.levelLength, facet.s1 + ch);
  const len = b - a;
  const n = Math.max(1, Math.round(len / F.segW));
  const step = len / n;
  for (let i = 0; i < n; i++) {
    const top = F.tops[jitter(k * 17 + i * 3, F.tops.length)];
    push(out, 'bdFar', k, a + (i + 0.5) * step, step + F.overlap,
         (F.y0 + top) / 2, top - F.y0, F.depth, F.thickness);
  }
  // the crown on the horizon (board 14), told as silhouette only: the spires
  // sit half a tile behind the mass, so they emerge from its top edge
  const si = Math.min(n - 1, Math.floor(F.spireAt * n));
  const roof = F.tops[jitter(k * 17 + si * 3, F.tops.length)];
  const sc = a + (si + 0.5) * step;
  for (let j = 0; j < F.spires; j++) {
    const h = F.spireH[jitter(k * 19 + j * 7, F.spireH.length)];
    push(out, 'bdSpire', k, sc + (j - (F.spires - 1) / 2) * F.spireGap, F.spireW,
         roof - 1.5 + h / 2, h, F.depth - 0.4, F.thickness * 0.8);
  }
}

/* --------------------- human-scale reference objects ---------------- *
 * One table (CONFIG.limb.mark), two emitters, identical dimensions: the
 * hull skirt under RIG's feet, and the backdrop sister limb. That pairing
 * is the whole mechanism — the eye calibrates on the near ladder and then
 * reads the same ladder, tiny, on something across the sky.            */

function ladderAt(out, kind, k, s, topY, runH, depth, M) {
  const D = M.ladder;
  push(out, kind + 'Stile', k, s - D.rungW / 2, D.stileW, topY - runH / 2, runH,
       depth, M.thickness);
  push(out, kind + 'Stile', k, s + D.rungW / 2, D.stileW, topY - runH / 2, runH,
       depth, M.thickness);
  for (let y = topY - 0.3; y > topY - runH; y -= D.pitch)
    push(out, kind + 'Rung', k, s, D.rungW, y, D.rungH, depth, M.thickness);
}

function markPlan(out, facet, cfg) {
  const M = cfg.limb.mark;
  const k = facet.k;
  const depth = M.out;
  const top = M.band.y0;
  for (let s = Math.ceil(facet.s0 / M.ladder.every) * M.ladder.every;
       s < facet.s1 - 1; s += M.ladder.every)
    ladderAt(out, 'mark', k, s + 0.5, top, M.ladder.runH, depth, M);
  // Access hatches: a bright rim with a dark cover standing PROUD of it. The
  // cover has to be the nearer box — a box "frame" behind a box "panel" is
  // just a box, and the first pass of this shipped exactly that: flat painted
  // squares with no cover visible at all.
  const H = M.hatch;
  for (let s = Math.ceil((facet.s0 + H.every / 2) / H.every) * H.every;
       s < facet.s1 - 1; s += H.every) {
    const y = M.band.y0 - H.rimH / 2 - 0.8 - jitter(k * 23 + s, 4) * 1.2;
    push(out, 'markRim', k, s + 0.5, H.rimW, y, H.rimH, depth, M.thickness);
    push(out, 'markPanel', k, s + 0.5, H.panelW, y, H.panelH, depth + M.proud, M.thickness);
  }
  // personnel doors, on their own rhythm and their own (lower) deck line
  const R = M.door;
  for (let s = Math.ceil((facet.s0 + R.every / 3) / R.every) * R.every;
       s < facet.s1 - 1; s += R.every) {
    const sill = M.band.y1 + 0.35 + jitter(k * 29 + s, 3) * 1.05;
    push(out, 'markRim', k, s + 0.5, R.rimW, sill + R.rimH / 2, R.rimH, depth, M.thickness);
    push(out, 'markPanel', k, s + 0.5, R.panelW, sill + R.panelH / 2, R.panelH,
         depth + M.proud, M.thickness);
    push(out, 'markRim', k, s + 0.5, R.rimW + 1.6, sill - R.sillH / 2, R.sillH,
         depth + M.proud, M.thickness);
  }
}

// The same objects on the sister limb: one ladder down a segment face and one
// railed gantry along its top. Sizes come from the SAME table, unscaled.
function markSister(out, facet, cfg, lay) {
  const M = cfg.limb.mark;
  const S = cfg.limb.backdrop.sister;
  const k = facet.k;
  const depth = S.depth + S.thickness / 2 + S.lipOut + 0.3;   // proud of the tier's lip
  const at = (frac) => {
    const i = Math.min(lay.segs - 1, Math.max(0, Math.round(frac * (lay.segs - 1))));
    return { s: lay.s0 + (i + 0.5) * lay.step, bottom: sisterBottom(i, lay, S) };
  };
  const L = at(M.ladder.at);
  ladderAt(out, 'mark', k, L.s, L.bottom + S.segH - 0.5 + S.rakeLift,
           S.segH - 1.4, depth, M);
  // a railed walkway along the top lip: at this distance a railing is the most
  // legible human object there is — it is only ever the width of a person
  const G = M.rail;
  const W = at(G.at);
  const railY = W.bottom + S.segH + S.rakeLift + G.postH;
  push(out, 'markRail', k, W.s, G.len, railY, G.barH, depth, M.thickness);
  for (let x = -Math.floor(G.len / 2 / G.postEvery); x <= Math.floor(G.len / 2 / G.postEvery); x++)
    push(out, 'markPost', k, W.s + x * G.postEvery, G.postW,
         railY - G.postH / 2, G.postH, depth, M.thickness);
}

function jointPlan(out, joint, cfg, groundH) {
  const J = cfg.limb.joint;
  const k = joint.k;                            // joint k sits between facets
  const ref = limbGroundRef(groundH, joint.apron0, joint.apron1);
  const s = joint.sMid;
  // The ridge where two armour facets meet, behind the plane: the vertical
  // line the camera orbits, and the thing that visibly separates the facet
  // RIG is on from the facet beyond it.
  const ridgeH = J.ridgeBelow + J.ridgeAbove;
  push(out, 'ridge', k, s, J.ridgeW, ref - J.ridgeBelow + ridgeH / 2, ridgeH,
       J.ridgeDepth, J.ridgeThickness);
  // the collar swelling at deck height: a hinge, not a pillar
  push(out, 'collar', k, s, J.collarW, ref + J.collarAt, J.collarH,
       J.collarDepth, J.collarThickness);
  push(out, 'tendon', k, s - 1.6, J.tendonW, ref + 4, 14, J.tendonDepth, J.tendonThickness);
  push(out, 'tendon', k, s + 1.6, J.tendonW, ref + 4, 14, J.tendonDepth, J.tendonThickness);
  // The ramp edge continues THROUGH the chamfer: the two columns that belong to
  // no facet are exactly the ones where the route has to read as continuing
  // around the limb rather than stopping at a new face (concept board 14).
  const K = cfg.limb.kerb;
  const kerbDepth = cfg.limb.planeHalfDepth + K.outward - K.thickness / 2;
  for (let c = joint.s; c < joint.s + cfg.path.chamferTiles; c++) {
    if (!(groundH[c] > -100)) continue;
    push(out, 'kerb', k, c + 0.5, 1 + K.overlap, groundH[c] - K.under - K.h / 2, K.h,
         kerbDepth, K.thickness);
  }
  // The tendon anchor under the joint, reaching OUT of the limb: the one big
  // outward mass in the whole plan. It sweeps across frame while the camera
  // swings, which is the parallax that sells an orbit — and it is only legal
  // here because the apron under it is guaranteed flat solid ground.
  push(out, 'buttress', k, s, J.buttressW, J.buttressTop - J.buttressH / 2 + ref - 3,
       J.buttressH, J.buttressDepth, J.buttressThickness);
  push(out, 'cup', k, s, J.cupW, J.cupTop - J.cupH / 2 + ref - 3, J.cupH,
       J.cupDepth, J.cupThickness);
}

/* ---------------------------- plan audits -------------------------- *
 * The two rules above, as functions, so the harness and any later reader
 * check the same arithmetic the renderer bakes.                        */

// Outward reach of a piece: how far past the combat plane's own half-depth it
// projects. <= 0 means it is behind, or flush with, the tiles.
export function limbOutwardReach(piece, cfg) {
  return piece.depth + piece.d / 2 - cfg.limb.planeHalfDepth;
}

export function limbSpansPlayBand(piece, cfg) {
  const B = cfg.limb.playBand;
  return piece.y + piece.h / 2 > B.y0 && piece.y - piece.h / 2 < B.y1;
}

export function limbInJointApron(piece, cfg) {
  const a = piece.s - piece.w / 2, b = piece.s + piece.w / 2;
  return limbJoints(cfg).some((j) => a >= j.apron0 && b <= j.apron1);
}

/* ------------------- the scale pass's own audits (T-045) ------------ *
 * Three claims, each as a function the harness and the reader share:
 * where a piece lands in the haze ladder, whether it is drawn clear of the
 * air the fight happens in, and whether the far body is ever absent from
 * the frame. The arithmetic is written out in CONFIG.limb.backdrop.       */

// Linear fog factor of a depth, 0 = untouched, 1 = drawn as pure haze. The
// camera pull-back shifts the band by exactly (cameraDepth - camera.z), so
// the shift cancels and this is the same number at every ?view=.
export function limbFogFactor(depth, cfg) {
  const F = cfg.limb.fog;
  return (Math.abs(depth) + cfg.camera.z - F.near) / (F.far - F.near);
}

// Everything baked deeper than the body wall is "backdrop" — no kind list to
// keep in sync, so a new tier is fenced the day it is written.
export function limbBackdropPieces(plan, cfg) {
  return plan.filter((p) => p.depth < cfg.limb.wall.depth);
}

// Does this piece draw entirely ABOVE the protected play band on screen? For
// a pinhole camera, two points at the same screen x order by elevation ratio
// (y - camera.y) / distance, so this comparison is exact and needs no
// projection. `depthMult` is a CONFIG.viewScales entry's pull-back.
export function limbAbovePlayBand(piece, cfg, depthMult) {
  const C = cfg.camera;
  const camZ = C.z * depthMult;
  const bottom = piece.y - piece.h / 2;
  return (bottom - C.y) / (camZ + Math.abs(piece.depth)) > (cfg.limb.playBand.y1 - C.y) / camZ;
}

// Runs of the level where no far-body mass sits within `halfWindow` tiles of
// the camera's own column. Empty = something enormous is always in frame.
export function limbBackdropGaps(plan, cfg, halfWindow) {
  const mass = plan.filter((p) => p.kind === 'bdFar');
  const gaps = [];
  let open = null;
  for (let s = 0; s <= cfg.levelLength; s += 0.5) {
    const covered = mass.some((p) => p.s - p.w / 2 <= s + halfWindow &&
                                     p.s + p.w / 2 >= s - halfWindow);
    if (!covered && open === null) open = s;
    if (covered && open !== null) { gaps.push([open, s]); open = null; }
  }
  if (open !== null) gaps.push([open, cfg.levelLength]);
  return gaps;
}

// Every violation of the two rules, as a list (empty = the plan is honest).
export function limbPlanViolations(plan, cfg, groundH) {
  const L = cfg.limb;
  const bad = [];
  for (const p of plan) {
    const reach = limbOutwardReach(p, cfg);
    if (reach <= 0) continue;                   // behind the plane: always fine
    if (p.kind === 'kerb' || p.kind === 'lipScute') {
      // the deck lip: exempt from the play band, held to its own two rules
      const deck = groundH[Math.floor(p.s)];
      if (!(p.y + p.h / 2 <= deck + 1e-9))
        bad.push({ piece: p, why: 'kerb rises to or above the deck it edges' });
      if (reach > L.kerbOutwardMax)
        bad.push({ piece: p, why: 'kerb reaches past the kerb limit' });
      continue;
    }
    if (limbSpansPlayBand(p, cfg))
      bad.push({ piece: p, why: 'outward piece enters the play band' });
    if (reach > L.fallOutwardMax && !limbInJointApron(p, cfg))
      bad.push({ piece: p, why: 'outward mass past a possible gap' });
    if (reach > L.jointOutwardMax)
      bad.push({ piece: p, why: 'outward mass past the joint limit' });
    if (reach > L.fallOutwardMax &&
        limbSpanHasGap(groundH, p.s - p.w / 2, p.s + p.w / 2))
      bad.push({ piece: p, why: 'outward mass over a gap column' });
  }
  return bad;
}
