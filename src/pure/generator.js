/* =========================== GENERATOR ============================ */
/* Pattern-chunk layout + ambient spawn-director math. Pure: no three.js,
   no DOM — the harness rebuilds the level and asserts every invariant.
   Ground is authored as a stream of named chunks (flats, steps, stairs,
   plateaus, trenches, gap hops, island hops, ridges) instead of a
   coin-flip walk. Invariants: heights within [minH, maxH]; adjacent
   solid columns differ by ≤ 2; gap runs ≤ gapMax with ≥ landingMin solid
   columns after and ≤ 1 height change across; intro + tail flat; corner
   aprons flat and platform-free; every catwalk within maxReach. */

import { mulberry32 } from './rng.js';
import { cornerSList, faceIndexAt } from './path.js';
import { TRAVERSAL_FIXTURE } from './traversal.js';
import {
  LATTICE, latticeCarvePocket, latticeHoundBeats, latticePatchPass,
  latticePocketSites, latticeReport, latticeThinPass,
} from './lattice.js';

export const GAP = -999;

export function solidRectContains(rect, x, y) {
  return x >= rect.x0 && x < rect.x1 && y >= rect.y0 && y < rect.y1;
}

export function levelSolidCell(level, i, j, tileDepth) {
  const g = level.groundH[i];
  if (g > -100 && j < g && j >= g - tileDepth) return true;
  for (const rect of level.solidRects || []) if (solidRectContains(rect, i, j)) return true;
  return false;
}

function clampH(v, g) { return Math.max(g.minH, Math.min(g.maxH, v)); }

// Each chunk emits {cols, h}: column heights (GAP for gaps) plus the walk
// height after the chunk. Every chunk's last solid column equals its
// returned h, so chunk-to-chunk seams can never step more than the
// chunk's own internal moves (≤ 2).
const CHUNK_LIB = [
  ['flat', (rng, h, g) => ({ cols: new Array(4 + Math.floor(rng() * 5)).fill(h), h })],
  ['step', (rng, h, g) => {                    // single ledge up/down (±1, sometimes ±2)
    const nh = clampH(h + (rng() < 0.5 ? -1 : 1) * (rng() < 0.3 ? 2 : 1), g);
    return { cols: new Array(3 + Math.floor(rng() * 4)).fill(nh), h: nh };
  }],
  ['stairs', (rng, h, g) => {                  // 2–3 risers with short treads
    const dir = rng() < 0.5 ? 1 : -1;
    const cols = [];
    let hh = h;
    for (let i = 0, n = 2 + Math.floor(rng() * 2); i < n; i++) {
      hh = clampH(hh + dir, g);
      for (let j = 0, run = 2 + Math.floor(rng() * 2); j < run; j++) cols.push(hh);
    }
    return { cols, h: hh };
  }],
  ['gapHop', (rng, h, g) => {                  // gap + guaranteed landing strip
    const cols = new Array(2 + Math.floor(rng() * (g.gapMax - 1))).fill(GAP);
    for (let j = 0; j < g.landingMin; j++) cols.push(h);
    return { cols, h };
  }],
  ['plateau', (rng, h, g) => {                 // raised slab, then back down
    const cols = new Array(3 + Math.floor(rng() * 3)).fill(clampH(h + 2, g));
    for (let j = 0, run = 2 + Math.floor(rng() * 2); j < run; j++) cols.push(h);
    return { cols, h };
  }],
  ['trench', (rng, h, g) => {                  // dip to the floor, climb back out
    const cols = new Array(3 + Math.floor(rng() * 3)).fill(g.minH);
    for (let j = 0, run = 2 + Math.floor(rng() * 2); j < run; j++) cols.push(h);
    return { cols, h };
  }],
  ['islandHop', (rng, h, g) => {               // gap, 3-tile island, gap, landing
    const cols = [GAP, GAP, h, h, h, GAP, GAP];
    for (let j = 0; j < g.landingMin; j++) cols.push(h);
    return { cols, h };
  }],
  ['ridge', (rng, h, g) => {                   // bumpy rhythm of one-tile lips
    const hi = clampH(h + 1, g);
    const cols = [];
    for (let c = 0, n = 2 + Math.floor(rng() * 2); c < n; c++) cols.push(h, h, hi, hi);
    cols.push(h, h);
    return { cols, h };
  }],
];

function pickChunk(rng, weights) {
  let total = 0;
  for (const [name] of CHUNK_LIB) total += weights[name];
  let r = rng() * total;
  for (const entry of CHUNK_LIB) {
    r -= weights[entry[0]];
    if (r < 0) return entry;
  }
  return CHUNK_LIB[0];
}

export function buildLevel(cfg) {
  const L = cfg.levelLength;
  const G = cfg.gen;
  const corners = cornerSList(cfg);
  const groundH = new Array(L);
  const platforms = [];                        // one-way catwalks {x0, x1, y}
  const chunkLog = [];                         // chunk names, for variety asserts
  const rng = mulberry32(G.seed);

  // ground: flat intro, chunk stream, flat outro tail
  let x = 0, h = 3;
  while (x < cfg.path.introTiles) groundH[x++] = 3;
  const tail = L - G.tailFlat;
  while (x < tail) {
    const picked = pickChunk(rng, G.weights);
    const c = picked[1](rng, h, G);
    chunkLog.push(picked[0]);
    for (const col of c.cols) {
      if (x >= tail) break;
      groundH[x++] = col;
    }
    h = c.h;
  }
  while (x < L) groundH[x++] = 3;

  // dare pockets (src/pure/lattice.js) are carved into the deck BEFORE the
  // tier pass, so the catwalk rhythm above them reads the chunk they created
  // rather than the chunk stream they replaced. Both seams are flat at the
  // generator's own walk height, so every ground invariant above still holds.
  const pockets = latticePocketSites(cfg, groundH);
  for (const site of pockets) latticeCarvePocket(groundH, site, GAP);

  // Contra tiers: a near-continuous mid lane (+2.35 over local ground) with
  // high lane stretches (+3 again) above it. All one-way: jump up through
  // them, down+jump drops a tier. Mid needs a committed full-hold jump —
  // analytic apex is 2.72, but the semi-implicit integrator's discrete apex
  // is 2.61 @60Hz and 2.49 @30Hz, so +2.35 keeps mounting frame-rate safe
  // (margins +0.26 / +0.14). High still needs the double jump (mid→high +3).
  const prng = mulberry32(G.tierSeed);
  let cx = 26;
  while (cx < L - 28) {
    const segLen = 7 + Math.floor(prng() * 6);         // 7–12 column segments: denser rhythm
    let base = 2;
    for (let k = cx; k < Math.min(cx + segLen, L); k++)
      if (groundH[k] > -100) base = Math.max(base, groundH[k]);
    if (prng() < G.laneChance) {
      const len = segLen - 2 - Math.floor(prng() * 2); // leaves 2–3 column lane gaps
      const y = base + 2.35;
      platforms.push({ x0: cx, x1: cx + len, y });
      if (y + 3 <= G.laneCapY && prng() < G.hiChance) {
        const hiLen = Math.max(3, len - 3);
        const off = 1 + Math.floor(prng() * 2);
        const yHi = y + 3;
        platforms.push({ x0: cx + off, x1: cx + off + hiLen, y: yHi });
        if (yHi + 3 <= G.laneCapY && prng() < G.thirdChance) {   // third tier over low ground
          platforms.push({ x0: cx + off + 1, x1: cx + off + 1 + Math.max(3, hiLen - 2), y: yHi + 3 });
        }
      }
    }
    cx += segLen;
  }

  // corner aprons (corner-zone cleanliness): solid flat staging ground
  // through each chamfer — the pivot and both bend columns must be ground,
  // not gap — and no catwalk may span a bend.
  for (const cs of corners) {
    for (let s = cs - 5; s <= cs + 2; s++) groundH[s] = 3;
    for (let i = platforms.length - 1; i >= 0; i--)
      if (platforms[i].x1 >= cs - 3 && platforms[i].x0 <= cs + 3) platforms.splice(i, 1);
  }

  // the pocket's own two catwalks: the mid lane it is entered from, and the
  // shelf that reaches back out over the chasm with the reward on its tip.
  // Anything the tier pass dropped across the chasm would read as a second
  // free line over the same hole, so the shelf's span is cleared first.
  for (const site of pockets) {
    for (let i = platforms.length - 1; i >= 0; i--)
      if (platforms[i].x1 > site.gap.x0 - 1 && platforms[i].x0 < site.gap.x1 + 1)
        platforms.splice(i, 1);
    platforms.push({ ...site.mid }, { ...site.shelf });
  }

  // reachability sweep: the apron pass can orphan a high catwalk whose mid
  // support it deleted — prune anything beyond double-jump reach, repeating
  // until stable (pruning one support can strand another).
  const prune = () => {
    let pruned = true;
    while (pruned) {
      pruned = false;
      for (let i = platforms.length - 1; i >= 0; i--) {
        const p = platforms[i];
        let best = -999;
        for (let k = Math.max(0, p.x0 - 1); k <= Math.min(L - 1, p.x1 + 1); k++)
          if (groundH[k] > -100) best = Math.max(best, groundH[k]);
        for (const q of platforms)
          if (q !== p && q.y < p.y && q.x1 > p.x0 - 1 && q.x0 < p.x1 + 1) best = Math.max(best, q.y);
        if (p.y - best > G.maxReach) { platforms.splice(i, 1); pruned = true; }
      }
    }
  };
  prune();

  // route density (src/pure/lattice.js): fill the thin windows, drop the
  // noisy ones, re-prune, and repeat until the lattice stops moving. Each
  // pass only ever reads the geometry that exists, so the loop is a fixpoint
  // search, not a schedule — `patched`/`thinned` going empty is the exit.
  const level = { groundH, platforms };
  const patched = [], thinned = [];
  for (let pass = 0; pass < LATTICE.patch.maxPasses; pass++) {
    const add = latticePatchPass(level, cfg);
    const cut = latticeThinPass(level, cfg);
    prune();
    patched.push(...add);
    thinned.push(...cut);
    if (!add.length && !cut.length) break;
  }

  return {
    groundH, platforms, chunkLog, pockets,
    lattice: {
      id: LATTICE.id,
      patched: patched.length,
      thinned: thinned.length,
      report: latticeReport(level, cfg),
    },
  };
}

// The fixture argument is the resolved pacing variant (src/mode.js). Every
// pace shares this geometry — only pacing moves — so an A/B between variants
// compares the same seed, the same lattice, and the same routes.
export function buildTraversalLevel(cfg, fixture = TRAVERSAL_FIXTURE) {
  const base = buildLevel(cfg);
  const B = fixture.bounds;
  for (const run of fixture.groundRuns)
    for (let x = run.x0; x < run.x1; x++) base.groundH[x] = run.y;
  const platforms = base.platforms.filter((p) => p.x1 <= B.x0 || p.x0 >= B.x1);
  for (const p of fixture.platforms) platforms.push({ ...p });
  return {
    groundH: base.groundH,
    platforms,
    solidRects: fixture.solidRects.map((r) => ({ ...r })),
    chunkLog: base.chunkLog.concat(fixture.id),
    fixture,
  };
}

// Ambient spawn table: density authored in seconds of scroll so it scales
// with scrollSpeed, escalating per face; corner-clear zones stay empty —
// gate waves are authored by the wave system, never by this table.
//
// `level` is the built geometry the houndframe stations are placed on
// (src/pure/lattice.js needs a deck to stand a frame on). It defaults to a
// fresh build so every existing caller — the harness included — keeps working
// unchanged; the six-face boot pays one extra ~10 ms build for that, and gets
// a spawn table that cannot disagree with the level it spawns into.
export function buildSpawnTable(cfg, level = buildLevel(cfg)) {
  const S = cfg.spawner;
  const corners = cornerSList(cfg);
  const rng = mulberry32(S.seed);
  const nearCorner = (x) =>
    corners.some((cs) => x >= cs - S.cornerClearBefore && x <= cs + S.cornerClearAfter);
  const out = [];
  const end = cfg.levelLength - S.endFromEnd;
  let x = S.startS;
  while (x < end) {
    const f = Math.min(cfg.path.faces, Math.max(1, faceIndexAt(x, cfg)));
    if (!nearCorner(x)) {
      out.push({ x, type: 'wasp' });
      if (rng() < S.pairChance[f - 1] && !nearCorner(x + S.pairGapTiles) && x + S.pairGapTiles < end)
        out.push({ x: x + S.pairGapTiles, type: 'wasp' });
    }
    x += Math.max(2, Math.round((S.faceGapSec[f - 1] + rng() * S.jitterSec) * cfg.scrollSpeed));
  }
  // one carrier per face at an authored mid-face fraction — same table, same
  // corner-clear discipline, harness-assertable like every other row. Nudge
  // off any occupied column: the table stays strictly ascending in x.
  const used = new Set(out.map((r) => r.x));
  cfg.carrier.perFaceFrac.forEach((frac, f) => {
    const start = f === 0 ? cfg.path.introTiles : corners[f - 1];
    let cx = Math.round(start + frac * (corners[f] - start));
    while (used.has(cx)) cx++;
    if (!nearCorner(cx)) { out.push({ x: cx, type: 'carrier' }); used.add(cx); }
  });
  // houndframe stations (faces 2+, decisions.md entry 6 — placement, not
  // stats). Authored on half-columns so they can never collide with the
  // integer wasp/carrier rows, and skipped wholesale if a station would land
  // in a corner-clear zone: the ambient table's discipline applies to every
  // kind in it.
  for (const beat of latticeHoundBeats(cfg, level.groundH, level.pockets)) {
    if (nearCorner(beat.x) || beat.x < S.startS || beat.x >= end) continue;
    out.push(beat);
  }
  out.sort((a, b) => a.x - b.x);
  return out;
}
