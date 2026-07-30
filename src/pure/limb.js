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

function push(out, kind, facet, s, w, y, h, depth, d) {
  out.push({ kind, facet, s, w, y, h, depth, d });
}

export function limbBakePlan(cfg, groundH) {
  const L = cfg.limb;
  const out = [];
  for (const facet of limbFacets(cfg)) {
    facetPlan(out, facet, cfg, groundH);
  }
  for (const joint of limbJoints(cfg)) {
    jointPlan(out, joint, cfg, groundH);
  }
  return out;
}

function facetPlan(out, facet, cfg, groundH) {
  const L = cfg.limb;
  const k = facet.k;
  // --- the body under the deck, and the wall of body behind it ---------
  for (const [a, b] of limbChunkRanges(facet.s0, facet.s1, L.chunkCols)) {
    const ref = limbGroundRef(groundH, a, b);
    const span = b - a;
    const mid = (a + b) / 2;
    const deckBottom = ref - 4;                 // the tile stack is 4 deep
    // hull: mass running off the bottom of frame — the leg continues below
    push(out, 'hull', k, mid, span, deckBottom - L.hull.drop / 2, L.hull.drop,
         L.hull.depth, L.hull.thickness);
    // the shadow line right under the deck lip
    push(out, 'hullRib', k, mid, span, deckBottom - L.hull.ribH / 2, L.hull.ribH,
         L.hull.depth - 0.5, L.hull.ribThickness);
    // wall: the body rising behind the combat plane, plated in horizontal
    // seams and then stepping backwards tier by tier. This is what turns the
    // deck into a ledge on something enormous, what the joint ridge
    // interrupts, and — because each tier is further into the fog — what
    // makes the body read as curving away rather than as a flat backdrop.
    // Everything here is BEHIND the plane, so none of it can ever occlude the
    // lane RIG fights in.
    const W = L.wall;
    const wallH = W.below + W.above;
    push(out, 'wall', k, mid, span, ref - W.below + wallH / 2, wallH,
         W.depth, W.thickness);
    push(out, 'wallCap', k, mid, span, ref + W.above + W.capH / 2, W.capH,
         W.depth + W.capDepth, W.capThickness);
    for (const at of W.seamAt)
      push(out, 'wallSeam', k, mid, span, ref + at, W.seamH,
           W.depth + 0.6, W.seamThickness);
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
    push(out, 'scute', facet.k, a + len / 2 - 0.2, len, top - S.h / 2, S.h,
         depth, S.thickness);
    if ((a / S.every) % S.ribEvery === 0)
      push(out, 'scuteRib', facet.k, a + 0.5, S.ribW, top - S.ribH / 2, S.ribH,
           depth + 0.2, S.thickness + 0.4);
  }
  // --- distant anatomy: the limb continuing up, and the body beyond ----
  const len = facet.s1 - facet.s0;
  for (const sk of L.silhouette) {
    push(out, 'silhouette', facet.k, facet.s0 + sk.atFrac * len, sk.w,
         sk.y0 + sk.h / 2, sk.h, sk.depth, sk.thickness);
  }
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

// Every violation of the two rules, as a list (empty = the plan is honest).
export function limbPlanViolations(plan, cfg, groundH) {
  const L = cfg.limb;
  const bad = [];
  for (const p of plan) {
    const reach = limbOutwardReach(p, cfg);
    if (reach <= 0) continue;                   // behind the plane: always fine
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
