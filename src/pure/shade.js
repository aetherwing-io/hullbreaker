/* ============================= SHADE ============================== */
/* THE VALUE LADDER (T-035, packet item S1 in docs/proposals/2026-08-look-
   direction.md). The measured finding that produced this module: 0.0% of
   playfield pixels exceed luminance 200 in all fifteen gameplay captures,
   99% of pixels sit inside a 45-70 window out of 255, and one flat token
   covers 29-34% of the screen. The world is not grey because of its HUES —
   T-010's concept palette changed every hue over byte-identical geometry,
   lights and materials and the frame still read as grey-box. It is grey
   because every surface in it is the same VALUE.

   This module is the arithmetic that gives a static bake a value range:
   per baked piece, how much light can actually reach it, folded into ONE
   multiplier that the renderer applies to that piece's instance color. It
   is the cheapest legal way to buy value separation — zero draw calls,
   zero frame time, bake-time only — and value separation is the only
   surface information that survives at the shipped FAR view, where RIG is
   3.7% of screen height (decisions.md entry 7).

   Four terms, each a physical claim about the bake, not a taste:

     1. EXTINCTION BY DEPTH. The key light enters from outside the body
        (src/render/scene.js's sun at (6,12,8)); the further a piece sits
        behind the combat plane, the less of it survives. Piecewise-linear
        over `behind` (tiles behind the plane) so each authored tier — deck
        lip, wall, distant anatomy — can be placed on the ladder by hand.
     2. OCCLUSION. Mass around a piece blocks the sky. Sampled from an
        occupancy grid built from the whole plan, as a ring around the
        piece's own footprint (so a piece never occludes itself), with
        neighbours in other depth tiers discounted — a plate six tiles
        behind you shades you less than the plate beside you.
     3. TOP-FACE RAKE. A piece with a wide, unobstructed top face catches
        the key light rake; a tall thin plate seen edge-on does not. Read
        off the piece's own proportions (depth extent vs height) times how
        much open sky is above it.
     4. WEAR. Two octaves of seeded value noise, so the skin is not a
        perfect ruler. COHERENT, not per-piece white noise: stains run in
        bands of ~20 and ~7 tiles, which reads as weathering rather than as
        dither at 3.7% RIG height, and gives the deck lip a second along-s
        carrier next to the checker (pillar 1).

   Determinism is structural. The only randomness is `mulberry32` from
   ./rng.js, drawn once per integer lattice cell of (s, y) — never per
   call, never per piece in plan order — so the same seed returns the same
   array whatever order the plan is walked in, the harness and the browser
   agree, and `--deterministic` captures reproduce. There is no time
   argument in this file, by design: the static-anatomy rule (decisions.md
   entry 3) means a body that cannot be animated cannot assemble, and a
   shading pass that cannot read a clock cannot become a light show.

   GAIN. Every export takes a `gain` in [0, 1] and returns
   `1 + gain * (raw - 1)`, so gain 0 is EXACTLY 1.0 for every piece — not
   nearly, exactly. That is what lets ?palette=classic stay a byte-faithful
   grey-box instrument for the still-unjudged Palette v1 A/B (CLASSIC's own
   gain is 0, so the ladder cannot touch it whatever the URL says), and what
   makes ?shade=0 a true no-op rather than an approximate one.

   The gain is ALSO the shipped dial, not just an on/off. The operator
   judged full strength too dark and half strength right (see `dose`
   below), and half strength is the same arithmetic at gain 0.5 — the
   approved frames reproduce bit for bit rather than being re-authored
   into the constants, which is the only way a look verdict stays
   verifiable after the fact. */

import { mulberry32 } from './rng.js';

/* ---------------------------- the dose ---------------------------- *
 * OPERATOR VERDICT, 2026-08-02: "C on the ladder feels better, shade=0.5
 * the other is too dark." Half strength is the game's look; full strength
 * is rejected. So the shipped default is `dose` (CONFIG.shade.dose = 0.5)
 * and the URL is a comparison instrument, not the way to get the approved
 * build:
 *
 *   (absent)     the approved dose — what a player gets
 *   ?shade=0     OFF: the pre-T-035 grey-box value range, for A/B
 *   ?shade=1     the full ladder the operator judged too dark
 *   ?shade=0.75  anything between, for a later re-ask
 *
 * Absence, '' and junk all resolve to the approved dose, the way
 * resolvePaletteId resolves them to the concept default: a typo must not
 * silently serve a look nobody approved. An explicit number is clamped to
 * [0, 1], so ?shade=0 is reachable and exact. Pure, so the harness checks
 * the resolver instead of the URL.                                     */
export function resolveShadeGain(value, dose = 1) {
  if (value === null || value === undefined || value === '') return dose;
  if (value === 'on') return 1;
  if (value === 'off') return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) return dose;
  return Math.max(0, Math.min(1, n));
}

/* ---------------------------- seeded wear -------------------------- */

// One uint32 from three integers. Cheap avalanche (xorshift-multiply), so
// neighbouring lattice cells do not draw neighbouring seeds.
function hash3(a, b, c) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h ^= h >>> 15; h = Math.imul(h, 0x2545f491); h ^= h >>> 13;
  return h >>> 0;
}

// One draw per lattice cell, from a generator seeded by that cell alone:
// the value of a cell never depends on how many draws came before it.
function cellDraw(seed, xi, yi, salt) {
  return mulberry32((seed ^ hash3(xi, yi, salt)) >>> 0)();
}

function fade(t) { return t * t * (3 - 2 * t); }   // smoothstep: no lattice creases

function octaveAt(s, y, periodS, periodY, salt, seed) {
  const xs = s / periodS, ys = y / periodY;
  const x0 = Math.floor(xs), y0 = Math.floor(ys);
  const fx = fade(xs - x0), fy = fade(ys - y0);
  const a = cellDraw(seed, x0, y0, salt), b = cellDraw(seed, x0 + 1, y0, salt);
  const c = cellDraw(seed, x0, y0 + 1, salt), d = cellDraw(seed, x0 + 1, y0 + 1, salt);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

// The stain field: 0 = clean, 1 = dirtiest. Shared by the limb and the deck
// so a band of grime crosses the deck lip instead of stopping at it; each
// consumer applies its own amplitude.
//
// `contrast` is load-bearing, not a flourish: a sum of octaves is bell-
// shaped, so a raw field spends nearly all of its time in the middle and a
// material whose pieces are geometrically identical (the hull slabs, the
// joint ridges) would come out one value again — the exact defect this pass
// exists to fix. Expanding around the midpoint gives distinct clean and
// dirty patches with a transition between them, which is what weathering
// looks like and what puts a real ramp inside one material.
export function shadeWearAt(s, y, cfg) {
  const W = cfg.shade.wear;
  let sum = 0, tot = 0;
  for (let o = 0; o < W.octaves.length; o++) {
    const oc = W.octaves[o];
    sum += oc.weight * octaveAt(s, y, oc.periodS, oc.periodY, o + 1, cfg.shade.seed);
    tot += oc.weight;
  }
  const raw = tot > 0 ? sum / tot : 0;
  return clamp(0.5 + (raw - 0.5) * (W.contrast || 1), 0, 1);
}

/* ------------------------- depth and tiers ------------------------- */

// How far behind the combat plane a piece sits, in tiles. Anything at or
// outward of the plane (kerb, scutes, the joint buttress) is 0: full light.
export function shadeBehind(piece, cfg) {
  return Math.max(0, cfg.limb.planeHalfDepth - piece.depth);
}

// Which of the three authored planes a piece belongs to — deck/lip, body
// wall, distant anatomy. Used only to DISCOUNT occlusion across planes:
// the wall six tiles back shades the lip less than the lip beside it does.
export function shadeTier(depth, cfg) {
  const at = cfg.shade.tierAt;
  for (let i = 0; i < at.length; i++) if (depth > at[i]) return i;
  return at.length;
}

// Key-light survival by depth: piecewise-linear over the authored
// breakpoints in CONFIG.shade.extAt, so each tier's value is a number a
// human chose and can defend, not a curve's accident.
export function shadeExtinction(behind, cfg) {
  const table = cfg.shade.extAt;
  if (behind <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i];
    if (behind <= x1) {
      const [x0, y0] = table[i - 1];
      const t = x1 === x0 ? 0 : (behind - x0) / (x1 - x0);
      return y0 + (y1 - y0) * t;
    }
  }
  return table[table.length - 1][1];
}

/* --------------------------- occupancy ----------------------------- *
 * One integer cell grid per depth tier, built once from the whole plan.
 * Sets of packed cell keys: the plan is ~900 pieces and this runs once at
 * bake time, so the cost is a few milliseconds and never a frame.       */

const KEY_SPAN = 4096, KEY_BIAS = 1024;
function cellKey(cx, cy) { return (cx + KEY_BIAS) * KEY_SPAN + (cy + KEY_BIAS); }

function buildGrid(plan, cfg) {
  const cell = cfg.shade.cell;
  const tiers = [];
  for (let i = 0; i <= cfg.shade.tierAt.length; i++) tiers.push(new Set());
  for (const p of plan) {
    const t = shadeTier(p.depth, cfg);
    const s0 = Math.floor((p.s - p.w / 2) / cell), s1 = Math.floor((p.s + p.w / 2) / cell);
    const y0 = Math.floor((p.y - p.h / 2) / cell), y1 = Math.floor((p.y + p.h / 2) / cell);
    for (let cx = s0; cx <= s1; cx++)
      for (let cy = y0; cy <= y1; cy++) tiers[t].add(cellKey(cx, cy));
  }
  return tiers;
}

// How much a single cell occludes a piece in `tier`: the nearest tier that
// fills it wins, discounted by how many planes away it is.
function occupancyAt(tiers, tier, cx, cy, weights) {
  const key = cellKey(cx, cy);
  let best = 0;
  for (let t = 0; t < tiers.length; t++) {
    if (!tiers[t].has(key)) continue;
    const w = weights[Math.min(Math.abs(t - tier), weights.length - 1)];
    if (w > best) best = w;
  }
  return best;
}

// Ambient occlusion: the filled fraction of a ring around the piece's own
// footprint. The footprint itself is skipped, so a piece is never shaded by
// its own mass — a big plate is not dark just for being big.
function ringOcclusion(tiers, p, tier, cfg) {
  const cell = cfg.shade.cell, R = cfg.shade.ao.radius, weights = cfg.shade.tierWeight;
  const s0 = Math.floor((p.s - p.w / 2) / cell), s1 = Math.floor((p.s + p.w / 2) / cell);
  const y0 = Math.floor((p.y - p.h / 2) / cell), y1 = Math.floor((p.y + p.h / 2) / cell);
  let occ = 0, tot = 0;
  for (let cx = s0 - R; cx <= s1 + R; cx++) {
    for (let cy = y0 - R; cy <= y1 + R; cy++) {
      if (cx >= s0 && cx <= s1 && cy >= y0 && cy <= y1) continue;
      tot++;
      occ += occupancyAt(tiers, tier, cx, cy, weights);
    }
  }
  return tot > 0 ? occ / tot : 0;
}

// Sky blockage: mass directly above the piece, weighted by 1/distance so an
// overhang one tile up matters and the same mass seven tiles up barely does.
function skyBlocked(tiers, p, tier, cfg) {
  const cell = cfg.shade.cell, S = cfg.shade.sky, weights = cfg.shade.tierWeight;
  const s0 = Math.floor((p.s - p.w / 2) / cell) - S.spread;
  const s1 = Math.floor((p.s + p.w / 2) / cell) + S.spread;
  const top = Math.floor((p.y + p.h / 2) / cell);
  let hit = 0, tot = 0;
  for (let d = 1; d <= S.rise; d++) {
    const w = 1 / d;
    for (let cx = s0; cx <= s1; cx++) {
      tot += w;
      hit += w * occupancyAt(tiers, tier, cx, top + d, weights);
    }
  }
  return tot > 0 ? hit / tot : 0;
}

/* --------------------------- the passes ---------------------------- */

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/* THE LIMB. Plan-level by construction: the occlusion term needs the whole
   body (a piece cannot know what is above it from its own fields), so this
   takes the bake plan and returns one multiplier per piece, in plan order.
   `cfg` is the whole CONFIG; `gain` is the flag's strength.            */
export function limbShadePlan(plan, cfg, gain = 1) {
  const S = cfg.shade;
  const tiers = buildGrid(plan, cfg);
  const out = new Array(plan.length);
  for (let i = 0; i < plan.length; i++) {
    const p = plan[i];
    const tier = shadeTier(p.depth, cfg);
    const sky = skyBlocked(tiers, p, tier, cfg);
    const flat = p.d / (p.d + p.h);                 // top-face share of the form
    const facet = S.facet[((p.facet % S.facet.length) + S.facet.length) % S.facet.length];
    const raw = S.lit
      * shadeExtinction(shadeBehind(p, cfg), cfg)
      * (1 - S.ao.amount * ringOcclusion(tiers, p, tier, cfg))
      * (1 - S.sky.amount * sky)
      * (1 + S.rake.amount * flat * (1 - sky))
      * facet
      * (1 - S.wear.amount * shadeWearAt(p.s, p.y, cfg));
    out[i] = 1 + gain * (clamp(raw, S.floor, S.ceil) - 1);
  }
  return out;
}

/* THE DECK. The tile stack is authored, not planned, so its ladder is the
   two numbers the bake loop actually has: which of the four depth rows a
   tile is in (d=1 is the lit lip, d=4 is the bottom of the stack), and
   which column it stands in. The row ramp is the value ladder; the column
   term is the shared stain field at a small amplitude — deliberately
   smaller than the checker's own value delta, because the checker's job is
   scroll-speed readability (src/render/level.js) and a wear band that
   swamped it would trade a pillar-1/5 carrier for a look.             */
export function deckShadePlan(groundH, cfg, gain = 1) {
  const D = cfg.shade.deck;
  const rows = D.rows.map((r) => 1 + gain * (r - 1));
  const wear = new Array(groundH.length);
  for (let i = 0; i < groundH.length; i++) {
    const g = groundH[i];
    const raw = g > -100 ? 1 - D.wear * shadeWearAt(i + 0.5, g, cfg) : 1;
    wear[i] = 1 + gain * (raw - 1);
  }
  return { rows, wear };
}
