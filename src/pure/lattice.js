/* ============================ LATTICE ============================= */
/* Route density for the DEFAULT six-face run: the pass that turns the
   seeded chunk stream into a traversal lattice with real route choice,
   plus the authored pockets that hang off it.

   DESIGN's "Traversal lattice" asks for roughly three-to-five immediate
   routes readable at any moment, and DESIGN's "Level-construction
   contract" asks the generator to become an assembler of authored chunks
   rather than the sole author of fun. Before this pass the six-face run
   measured 1 surface at 243 of 445 columns (a single-lane corridor for
   55% of the climb) and a ten-column lookahead saw only two route bands
   across large stretches of every face. This module is the repair:

     1. POCKETS are carved first — one authored chunk per face: a long
        approach deck, a committed chasm, a landing one tile lower, a mid
        lane, and a SHELF that mounts on the landing side and reaches back
        out over the chasm with a WEAPON CAPSULE over its tip. The shelf is
        a spur pointing BACKWARD — no free drop off the tip (the chasm is
        under it), no forward continuation (the tip is the end) — so the
        pocket reads as a side room off the climb rather than a shortcut
        through it.
        The capsule is a PLAIN PICKUP (docs/decisions.md entry 9): it costs
        nothing, it is collected however the player happens to reach it,
        and its job is to feed the fight on the stretch that follows. What
        IS measured here, and asserted in tools/pathcheck.mjs, is the
        clock — the trip out to the tip and back has to leave real daylight
        against the pursuing edge (DESIGN's route-choice and pursuit
        contract), because a pocket a player cannot leave is a trap, not a
        room.

     2. PATCHES fill the thin windows: where a lookahead window offers
        fewer than `minRoutes` bands, one catwalk is added at the tier
        that is actually missing (mid first, then high), supported,
        capped, and kept clear of corner aprons.

     3. THINNING removes the excess: a window with more than `maxRoutes`
        bands is noise, not choice ("chaos stays readable"), so the
        highest, most redundant catwalk in it is dropped.

   Pure: no three.js, no DOM, no imports upward, no rng — every decision
   is arithmetic on cfg plus a hash of the column index, so the same seed
   builds the same lattice in the game and in the harness.               */

import { cornerSList } from './path.js';

export const LATTICE = {
  id: 'lattice-v1',

  // How far ahead a "route choice" is read. 12 columns is a little under a
  // third of the FAR view's width, i.e. what a player can commit to from the
  // moment they can see it, not the whole screen.
  lookahead: 12,
  minRoutes: 3, maxRoutes: 5,       // DESIGN: 3-5 readable at any moment
  bandStep: 0.5,                    // altitude quantization when counting bands
  bandMerge: 0.9,                   // two surfaces this close are ONE route band

  // The tier ladder, identical to the generator's own (a mid lane is one
  // committed jump over local ground; a high lane is the air jump above it).
  // The authored pockets use it too: shelf = mid lane + tierRise.
  midRise: 2.35, tierRise: 3,

  patch: {
    minLen: 5, maxLen: 8,           // added catwalks stay chunk-sized
    laneGap: 3,                     // …and never weld onto a neighbour at the
                                    //   same band: lanes keep 3-column breaks
    supportSlack: 0.75,             // a band within this of a tier counts as it
    cornerClearBefore: 8,           // no patch may reach into a corner apron
    cornerClearAfter: 5,
    maxPasses: 4,                   // patch -> thin -> prune, until stable
  },

  /* ------------------------------ pockets --------------------------- *
   * One authored chunk per face, in the face's FIRST half: the wave gate's
   * arena is the last ~35 columns before a corner, and a chasm does not
   * belong in a fight the player cannot walk backwards out of.
   * `cornerClearBefore` asserts that.                                   */
  pocket: {
    /* Per-face position (fraction of the face). The placeable band is
       narrow and every edge of it is somebody's rule: the pocket LANDING
       has to clear the spawner's 20-column post-corner breather (that is
       where the houndframe stands, and the breather is a no-spawn zone),
       and the pocket's far end has to clear the wave gate's 35-column
       arena. On a 65-column face that leaves x0 in [+13, +17] — so these
       fractions vary the placement by the four columns actually available
       rather than pretending to more freedom than the face has.        */
    perFaceFrac: [0.24, 0.21, 0.26, 0.20, 0.245, 0.225],
    deckMin: 3,                     // approach deck: the incoming column's own
                                    //   height, never below this — the landing
                                    //   is authored one tile lower, so the deck
                                    //   has to have a tile to give
    approachCols: 6,                // solid run before the chasm. Long on
                                    //   purpose: the chunk stream can step up
                                    //   to 2 tiles into the pocket seam, and a
                                    //   player who spends their jump on that
                                    //   step must land and re-plant before the
                                    //   hole. A 3-column approach cost the
                                    //   headless policy a life on face 1 — it
                                    //   hopped the seam and was still airborne,
                                    //   jumpless, when the chasm arrived.
    gapCols: 2,                     /* the committed hop. NOT the generator's
                                     * gapMax (5), and not even 3, because of a
                                     * property of this game the fixtures never
                                     * exposed: RIG is CLAMPED to the right of
                                     * the screen (src/sim/player.js's right
                                     * clamp), so a player who holds right is
                                     * pinned there and crosses ground at the
                                     * SCROLL speed (4.3 t/s), not at runSpeed
                                     * (9.4). Measured in the real sim: a full
                                     * held jump from the clamp travels ~3.0
                                     * tiles, so a pinned player clears a
                                     * 2-column hole from the lip and falls
                                     * into a 3-column one. The seeded chunk
                                     * stream still authors 2-5 wide gaps —
                                     * those are crossed with daylight in hand,
                                     * after the terrain has slowed you — but a
                                     * pocket chasm sits at a fixed place on
                                     * EVERY face, so it is held to the width
                                     * the worst case can always clear.
                                     * tools/pathcheck.mjs runs that policy
                                     * through the real sim and asserts no fall
                                     * ever lands inside a pocket.          */
    landingDrop: 1,                 // the far side sits this much lower: the
                                    //   deck visibly steps down across the
                                    //   hole (legal — a gap may change height
                                    //   by 1) and the extra tile of fall is
                                    //   what turns a cut jump from a death
                                    //   into a landing
    landingCols: 5,                 // solid run after it (>= landingMin)
    mountCols: 3,                   // shelf columns that sit over the landing
    midCols: 5,                     // the mid lane the shelf is entered from —
                                    //   exactly the landing, so the lane can
                                    //   never overhang the next chunk's gap
                                    //   and get pruned out from under the shelf
    /* Capsule height over the shelf deck. decisions.md entry 9 made this a
       plain pickup, so the number has exactly two jobs: put the capsule
       where a player who is on the shelf takes it by WALKING out to the tip
       (a standing player spans shelf .. shelf + 1.70 and the capsule bobs
       + 0.55 .. + 0.85, so it is inside the 0.95 pickup sphere at every bob
       phase), and read at FAR as a magenta mark sitting ON the shelf line,
       inside the same band of catwalk routes the rest of the face reads in.
       (artifacts/t009-lattice/entry9/ is the A/B: lifted two tiers higher the
       capsule detaches from every route line and reads as a mote in open
       sky.)

       History, so nobody re-derives it: this task raised it to 1.75 and then
       gave the shelf a 4.45 tier of its own, to lift the capsule clear of
       the deck-line jump arc (I-019) back when collecting it was supposed to
       cost a retreat. Entry 9 withdrew that requirement and the raised tier
       bought nothing else — it crowded the lattice and cost FAR legibility —
       so the shape is the plain one again: shelf one generator tier over the
       mid lane, capsule a short hop of air above the tip. A player who
       crosses the chasm on the deck line and never enters the pocket may now
       clip the capsule out of the air on the way past; that is a free
       pickup arriving early, which is what entry 9 decided it is. */
    rewardRise: 0.7,
    // The pickup itself: each pocket pays a weapon, and the later faces pay
    // the ones that answer the later threats — entry 9's benefit test is
    // escalation of the action, so this table climbs with the run.
    rewardLetters: ['S', 'H', 'L', 'F', 'H', 'L'],
    // 35 tiles clear of the pivot is the wave gate's whole ARENA: the scroll
    // halts at cornerS - 14 and the left frustum edge sits ~19 tiles behind
    // that, so a chasm at cornerS - 35 is outside the box the player fights
    // in. 8 after is the corner apron (cornerS + 2) plus room to land.
    cornerClearBefore: 35, cornerClearAfter: 8,
    // The detour clock, in the same shape the traversal fixture uses:
    // `entryEdgeMarginTiles` is the daylight the six-face follow camera
    // actually grants (the pursuing edge is the left frustum edge and the
    // camera leads the player by most of a screen; 14 tiles is a deliberate
    // worst-case floor, well under the ~30 tiles a 16:10 window shows), and
    // the trip out to the tip and back must leave `minExitMarginTiles` when
    // it is over. Nobody is charged for this — it is the guarantee that a
    // pocket never strands the player who walks into it.
    timing: { entryEdgeMarginTiles: 14, minExitMarginTiles: 6 },
  },

  /* ------------------ houndframe stations (decisions.md 6) ----------- */
  hound: {
    firstFace: 2,                   // face 1 teaches the lattice unpressured
    patrolCols: 3,                  // the judged hound-2.5 span: tight enough
                                    //   that the frame is always ON the thing
                                    //   it owns, never pacing away from it
    // ONE station per face is not modesty, it is arithmetic: a 65-column
    // face already spends its first 20 columns on the spawner's post-corner
    // breather and its last 35 on the wave gate's arena, and the pocket
    // occupies most of what is left. A second ambient station would have to
    // stand in one of those two zones, and both exist for good reasons.
    cornerClearBefore: 35,          // the gate arena, same figure the pockets use
  },

  /* ------------------- corner reveal set pieces (T-044) -------------- *
   * Two authored zones flank every corner ritual. Both are catwalk-only —
   * neither ever writes groundH — so nothing here can violate a ground
   * invariant (adjacent-step, gap, or landing rule) the chunk stream
   * already satisfies; both are exempt from the patch/thin fixpoint
   * (see `arrival`/`arena` flags below and their guard in latticeThinPass),
   * so they are guaranteed rather than left to that pass's own arithmetic.
   *
   *   ARRIVAL — one small catwalk in the few columns between the corner
   *   apron and that face's own pocket (its earliest x0 is prevCorner+13,
   *   T-021's pending fork work included: the pocket owns everything from
   *   there on, so ARRIVAL never reaches past prevCorner+12). The corner
   *   ritual (camera swing around static anatomy, decisions.md entry 3)
   *   already reveals the next face; this gives that reveal one concrete,
   *   guaranteed thing to land on instead of leaving it to whatever the
   *   chunk stream rolled.
   *
   *   ARENA — the wave gate's own fighting ground (the ~23 columns this
   *   authors, inside the ~33-tile box the gate halt + frustum actually
   *   fights in, and clear of the 7-column flat apron) is, today, whatever
   *   the seeded chunk stream and the Contra-tier loop happened to leave
   *   there — no deliberate composition. This authors one per face,
   *   escalating face 2 -> 6 so the six-stage ship escalation (STORY.md:
   *   Observe/Intercept/Contain/Quarantine/Sterilize/Scuttle) reads in the
   *   battleground's own silhouette. CONFIG.waves (wave size, composition,
   *   gated-hostile tuning) is untouched by this — nothing here moves a
   *   difficulty number, only what the fight stands on.
   *
   * Every offset below is authored against the SHIPPED seed (cfg.gen.seed
   * 1337, cfg.gen.tierSeed 777) and verified against the real build, the
   * same way the pocket fractions are: `back`/`front` column counts are
   * measured, not derived, and tools/pathcheck.mjs asserts the geometry
   * they produce (footprint bounds, no apron overlap, no pocket overlap,
   * reachable, present after prune) so a future generator change that
   * moves the ground under them fails loudly instead of silently
   * degrading the escalation.                                            */
  arrival: {
    firstFace: 2,        // face 1 has no preceding corner; stays the plain baseline
    afterApron: 5, len: 7,   // [prevCorner+5, prevCorner+12) — clear of the apron
                             //   (ends prevCorner+2) and every face's pocket x0
                             //   (earliest is prevCorner+13, face 4)
  },
  arena: {
    firstFace: 2,
    back: 30, front: 7,      // outer footprint [corner-30, corner-7): inside the
                             //   wave gate's own ~33-tile fighting box, clear of
                             //   the 7-column apron (corner-5..corner+2)
    // Per-face tier plan. `back`/`front` are column counts before the corner,
    // measured against the shipped seed (see probe numbers in the T-044
    // report). Tiers stack the same way the generator's own Contra-tier
    // ladder does — midRise, then +tierRise per tier up — and each is
    // skipped (not clamped) if its authored y would cross laneCapY, so a
    // reseed degrades gracefully instead of shipping an illegal platform;
    // pathcheck asserts that guard never actually fires for THIS seed.
    plans: [
      // face 2 — Intercept: one mid shelf. The gate mechanic itself is
      // still new; verticality stays modest.
      { tiers: [{ name: 'mid', back: 24, front: 11 }] },
      // face 3 — Contain: mid + high, the arena's first real stack.
      { tiers: [
        { name: 'mid', back: 26, front: 11 },
        { name: 'high', back: 22, front: 9 },
      ] },
      // face 4 — Quarantine: mid + high widen, plus a short high-ground
      // PERCH (third-tier height, narrow footprint) rather than a full
      // third lane — introduces the idea before face 5 commits to it.
      { tiers: [
        { name: 'mid', back: 28, front: 9 },
        { name: 'high', back: 24, front: 9 },
        { name: 'perch', back: 20, front: 14 },
      ] },
      // face 5 — Sterilize: the full three-tier stack, most of the
      // footprint's width — the "kill lattice... as many as ten total
      // elevations" phase (DESIGN.md's beat sheet).
      { tiers: [
        { name: 'mid', back: 29, front: 8 },
        { name: 'high', back: 25, front: 8 },
        { name: 'third', back: 21, front: 8 },
      ] },
      // face 6 — Scuttle: the same full stack, widened to the footprint's
      // own outer bounds — the largest, tallest gate arena in the run,
      // immediately before the corner into HULLBREAKER.
      { tiers: [
        { name: 'mid', back: 30, front: 7 },
        { name: 'high', back: 27, front: 7 },
        { name: 'third', back: 23, front: 7 },
      ] },
    ],
  },
};

/* ------------------------------ geometry --------------------------- */

// Faces 1..N as column ranges, with the corner that ends each one.
export function latticeFaces(cfg) {
  const corners = cornerSList(cfg);
  const out = [];
  for (let k = 1; k <= cfg.path.faces; k++) {
    out.push({
      face: k,
      s0: cfg.path.introTiles + cfg.path.faceTiles * (k - 1),
      s1: corners[k - 1],           // exclusive: the corner column itself
      corner: corners[k - 1],
      prevCorner: k > 1 ? corners[k - 2] : cfg.path.introTiles,
    });
  }
  return out;
}

// The columns the density invariant covers: a face's body, minus the corner
// apron approach at each end (aprons are deliberately flat and catwalk-free,
// so route count there is 1 by design, not by accident) and minus the window
// itself at the tail, which would otherwise read the apron.
export function latticeInterior(cfg, L = LATTICE) {
  return latticeFaces(cfg).map((f) => ({
    face: f.face,
    a: f.s0 + L.patch.cornerClearAfter,
    b: f.corner - L.patch.cornerClearBefore - L.lookahead,
  }));
}

// Every walkable surface top at column s: the deck, plus each catwalk over it.
export function latticeSurfacesAt(level, s) {
  const out = [];
  const g = level.groundH[s];
  if (g !== undefined && g > -100) out.push(g);
  for (const p of level.platforms) if (s >= p.x0 && s < p.x1) out.push(p.y);
  return out.sort((a, b) => a - b);
}

/* The distinct route bands a player can commit to from column s: the DECK
   counts once no matter how much it undulates (a step in the floor is the
   same route, taken higher — it is not a second line), plus every catwalk
   band in the lookahead window, merged when two of them are within bandMerge
   (consecutive segments of one lane are one route, not two). */
export function latticeBands(level, s, cfg, L = LATTICE) {
  const seen = [];
  const end = Math.min(s + L.lookahead, level.groundH.length);
  let deck = -999;
  for (let k = s; k < end; k++) {
    if (level.groundH[k] > -100) deck = Math.max(deck, level.groundH[k]);
    for (const p of level.platforms) {
      if (k < p.x0 || k >= p.x1) continue;
      const q = Math.round(p.y / L.bandStep) * L.bandStep;
      if (!seen.some((v) => Math.abs(v - q) < L.bandMerge)) seen.push(q);
    }
  }
  if (deck > -100) seen.push(deck);
  return seen.sort((a, b) => a - b);
}

export function latticeRouteCount(level, s, cfg, L = LATTICE) {
  return latticeBands(level, s, cfg, L).length;
}

// Highest surface that could hold a jump up to platform p: deck under it (one
// column of slack either side) or any lower catwalk overlapping it.
export function latticeSupportY(level, p) {
  let best = -999;
  const n = level.groundH.length;
  for (let k = Math.max(0, p.x0 - 1); k <= Math.min(n - 1, p.x1 + 1); k++)
    if (level.groundH[k] > -100) best = Math.max(best, level.groundH[k]);
  for (const q of level.platforms)
    if (q !== p && q.y < p.y && q.x1 > p.x0 - 1 && q.x0 < p.x1 + 1)
      best = Math.max(best, q.y);
  return best;
}

// Deterministic, seed-free variation (the same trick src/pure/limb.js uses):
// the lattice must not read as a ruler, and must not consume the generator's
// rng stream either — every shipped seed keeps its exact chunk sequence.
function hash(i) { return ((i * 2654435761) >>> 0) / 4294967296; }

/* ----------------------------- pockets ----------------------------- */

/* One authored pocket chunk per face. `x0` is the first approach column and
   the chunk is [x0, x1):

     approach (deckY)   chasm   landing (deckY - landingDrop)
     ================== · · · ==========================
                          ^          ^ mid lane, then the SHELF above it
                          |
                          the shelf's tip hangs here, over the void

   `groundH` is the chunk stream as generated (before carving): the approach
   deck adopts the incoming column's own height so the entry seam is flat and
   nobody spends their jump on a step three tiles from a hole. Passing no
   terrain yields the same sites at the default deck, which is what lets a
   reader (or the harness) ask for the authored layout on its own.          */
export function latticePocketSites(cfg, groundH, L = LATTICE) {
  const P = L.pocket;
  const G = cfg.gen;
  const width = P.approachCols + P.gapCols + P.landingCols;
  return latticeFaces(cfg).map((f, i) => {
    const x0 = Math.round(f.s0 + P.perFaceFrac[i % P.perFaceFrac.length] * cfg.path.faceTiles);
    const incoming = groundH && groundH[x0 - 1] > -100 ? groundH[x0 - 1] : P.deckMin;
    const deckY = Math.max(P.deckMin, Math.min(G.maxH, incoming));
    const landingY = Math.max(G.minH, deckY - P.landingDrop);
    const gap0 = x0 + P.approachCols;
    const gap1 = gap0 + P.gapCols;                  // exclusive
    const midY = landingY + L.midRise;
    const shelfY = midY + L.tierRise;
    const runSpeed = cfg.player.runSpeed;
    /* The detour, measured — not as a price anybody pays, but as the proof
       that the pocket can always be left (decisions.md entry 9). The tip is
       `gapCols` tiles of void from the first shelf column with ground under
       it, so walking out and back is twice that at runSpeed, and the
       pursuing edge advances at the shipped scroll speed while it happens.
       What is left over is `exitMarginTiles`, and tools/pathcheck.mjs holds
       it to `timing.minExitMarginTiles`. */
    const depthTiles = P.gapCols;
    const seconds = (2 * depthTiles) / runSpeed;
    const edgeAdvanceTiles = cfg.scrollSpeed * seconds;
    return {
      id: 'pocket-f' + f.face,
      face: f.face,
      x0, x1: x0 + width,
      deckY, landingY,
      gap: { x0: gap0, x1: gap1 },
      // the shelf: tip over the chasm at gap0, mount over the landing
      shelf: { id: 'pocket-shelf-f' + f.face, x0: gap0, x1: gap1 + P.mountCols, y: shelfY, pocket: true },
      // the mid lane the shelf is entered from (deck -> mid -> air jump -> shelf)
      mid: { id: 'pocket-mid-f' + f.face, x0: gap1, x1: gap1 + P.midCols, y: midY, pocket: true },
      reward: {
        kind: 'letter',
        letter: P.rewardLetters[i % P.rewardLetters.length],
        x: gap0 + 0.5, y: shelfY + P.rewardRise, mode: 'fixed',
      },
      detour: {
        depthTiles, seconds, edgeAdvanceTiles,
        exitMarginTiles: P.timing.entryEdgeMarginTiles - edgeAdvanceTiles,
      },
      corner: f.corner,
    };
  });
}

// The pocket chunk, written into the deck: flat approach, the chasm, and a
// landing one tile lower. Every seam step stays inside the generator's own
// ground invariants by construction (asserted in tools/pathcheck.mjs, not
// assumed): the approach adopts the incoming height, the drop across the
// chasm is exactly 1, and both runs are longer than landingMin.
export function latticeCarvePocket(groundH, site, GAP) {
  for (let s = site.x0; s < site.x1; s++) {
    if (s < 0 || s >= groundH.length) continue;
    groundH[s] = s < site.gap.x0 ? site.deckY
      : s < site.gap.x1 ? GAP
      : site.landingY;
  }
}

/* -------------------- corner reveal set pieces (T-044) --------------- *
 * ARRIVAL and ARENA (config above). Both read groundH, neither writes it —
 * so nothing here touches a ground invariant — and both ADD to whatever the
 * Contra-tier loop already dropped in their footprint rather than clearing
 * it first. An earlier version of this cleared the footprint before
 * installing (matching the pocket's own gap-clearing precedent) and that
 * was the wrong precedent to follow here: the pocket only ever clears its
 * own two-column CHASM, a span nothing legitimate can be standing over, but
 * an arena/arrival footprint is 7-23 columns wide and can contain a
 * procedural catwalk that is the ONLY bridge across a raw ground gap the
 * chunk stream rolled inside it — measured on face 5, a held-jump policy
 * that cleared the whole lattice cleanly went GAME_OVER the moment the
 * clear-then-install version deleted the catwalk at x[319,326) y=4.35
 * bridging a 5-column gap at x[321,325), because the authored replacement
 * (arena-f5-mid, y=5.35) sits higher than a jump launched from the
 * gap-mouth's actual ground height (2, not the tier's own locally-measured
 * base of 3) can reach. Adding rather than replacing means that bridge, and
 * anything else the chunk stream depends on, is never at risk — the cost is
 * an occasional extra band stacked near one of these, which is exactly the
 * "kill lattice… as many as ten total elevations" density DESIGN already
 * asks for by face 5, and outside the corner-clear window (faces 2-3) the
 * per-face tier plans are narrow enough that this rarely fires at all.    */

// The tallest solid column in [x0, x1), or `fallback` when the span is
// entirely gaps — same shape as the pocket's own `incoming` read, just over
// a span instead of one column, because a set piece's footprint is wide
// enough to cross a gap the chunk stream rolled through it.
export function latticeLocalBase(groundH, x0, x1, fallback) {
  let base = -999;
  for (let k = x0; k < x1; k++) if (groundH[k] > -100) base = Math.max(base, groundH[k]);
  return base > -100 ? base : fallback;
}

export function latticeInstallSite(platforms, newPlatforms) {
  for (const p of newPlatforms) platforms.push({ ...p });
}

// One small guaranteed catwalk per face (2+), in the gap between the corner
// apron and that face's own pocket approach — the first concrete thing the
// corner ritual's reveal has to land on, instead of whatever the chunk
// stream rolled there.
export function latticeArrivalSites(cfg, groundH, L = LATTICE) {
  const A = L.arrival;
  const G = cfg.gen;
  return latticeFaces(cfg).filter((f) => f.face >= A.firstFace).map((f) => {
    const x0 = f.prevCorner + A.afterApron;
    const x1 = x0 + A.len;
    const base = latticeLocalBase(groundH, x0, x1, G.minH);
    const y = base + L.midRise;
    return {
      face: f.face, corner: f.prevCorner, x0, x1, base,
      platforms: [{ id: 'arrival-f' + f.face, x0, x1, y, arrival: true }],
    };
  });
}

// The wave gate's own battleground, composed per face rather than left to
// the chunk stream. Each tier is skipped (not clamped) if its authored y
// would cross laneCapY, so a future reseed degrades gracefully instead of
// installing an illegal platform — tools/pathcheck.mjs asserts that guard
// never actually fires for the shipped seed.
export function latticeArenaSites(cfg, groundH, L = LATTICE) {
  const R = L.arena;
  const G = cfg.gen;
  return latticeFaces(cfg).filter((f) => f.face >= R.firstFace).map((f) => {
    const plan = R.plans[f.face - R.firstFace];
    const x0 = f.corner - R.back, x1 = f.corner - R.front;
    const platforms = [];
    const tiers = [];
    for (const t of plan.tiers) {
      const tx0 = f.corner - t.back, tx1 = f.corner - t.front;
      const base = latticeLocalBase(groundH, tx0, tx1, G.minH);
      const y = t.name === 'mid' ? base + L.midRise
        : t.name === 'high' ? base + L.midRise + L.tierRise
        : base + L.midRise + 2 * L.tierRise;                 // 'third' / 'perch'
      tiers.push({ name: t.name, x0: tx0, x1: tx1, base, y, fits: y <= G.laneCapY });
      if (y <= G.laneCapY) {
        platforms.push({ id: 'arena-f' + f.face + '-' + t.name, x0: tx0, x1: tx1, y, arena: true });
      }
    }
    return { face: f.face, corner: f.corner, x0, x1, tiers, platforms };
  });
}

/* -------------------- houndframe placement (faces 2+) ----------------- *
 * decisions.md entry 6: placement beats stats. A hound on open plate is
 * scenery — "one hound doesn't pose any threat" — so every station here is a
 * short patrol centred on a piece of deck the route cannot skip, exactly the
 * contract the judged hound-2.5 stage follows in the traversal fixture:
 *
 *   the POCKET LANDING (every face from 2 on) — the deck you land on after
 *   the committed hop. It is the one column-run every deck-line player
 *   touches on that face, and the answer to it is already built: the pocket's
 *   own mid lane runs directly overhead, so the hound pushes you off the
 *   floor and into the route the shelf hangs from. Bait its charge over the
 *   chasm and it removes itself.
 *
 * Two rules keep them honest, both asserted in tools/pathcheck.mjs:
 *   1. every patrol column is solid and at ONE height — a hound needs a
 *      plate, not a staircase, and its charge has to sweep what it owns;
 *   2. no station may sit inside a wave gate's arena. Ambient rows also
 *      carry `gating: false`: a gate is cleared by killing its WAVE, and a
 *      ground unit that cannot fly to the arena must never be able to hold
 *      the ritual shut from half a face away (the flyer's straggler rule is
 *      deliberate and unchanged — a wasp always comes to you).            */

// A flat, solid run of `len` columns starting at s, all at the same height.
export function latticeFlatRunAt(groundH, s, len) {
  const h = groundH[s];
  if (!(h > -100)) return false;
  for (let k = s; k < s + len; k++) if (groundH[k] !== h) return false;
  return true;
}

export function latticeHoundBeats(cfg, groundH, pockets, L = LATTICE) {
  const H = L.hound;
  const out = [];
  for (const p of pockets) {
    if (p.face < H.firstFace) continue;
    // beat A: the pocket landing, patrol tight around the touchdown column
    const a0 = p.gap.x1;
    if (latticeFlatRunAt(groundH, a0, H.patrolCols + 1)) {
      out.push({
        x: a0 + H.patrolCols / 2, type: 'hound', kind: 'hound',
        deck: groundH[a0], dir: -1, gating: false,
        contests: 'deck-line', owns: p.id + '-landing',
        patrol: { x0: a0, x1: a0 + H.patrolCols },
      });
    }
  }
  return out;
}

/* ------------------------- density repair -------------------------- */

function spansApron(x0, x1, corners, L) {
  return corners.some((cs) =>
    x1 > cs - L.patch.cornerClearBefore && x0 < cs + L.patch.cornerClearAfter);
}

// Where a window is thin, what is actually missing? Returns a catwalk to add,
// or null when the window cannot legally take one (over a chasm, against an
// apron, past the lane cap, or with no support under the tier).
function planPatch(level, s, cfg, L) {
  const G = cfg.gen;
  const corners = cornerSList(cfg);
  const end = Math.min(s + L.lookahead, level.groundH.length);
  let base = -999;
  for (let k = s; k < end; k++)
    if (level.groundH[k] > -100) base = Math.max(base, level.groundH[k]);
  if (base < -100) return null;                       // window is all chasm

  const bands = latticeBands(level, s, cfg, L);
  const tiers = [base + L.midRise, base + L.midRise + L.tierRise];
  // A tier counts as present only when a band is actually AT it: the test has
  // to be tighter than bandMerge, or a lane a full tile off the tier "covers"
  // it while the route count (which merges at bandMerge) still reads it as a
  // separate band — and the window stays thin with nothing able to fix it.
  let y = 0;
  for (const t of tiers) {
    if (!bands.some((b) => Math.abs(b - t) <= L.patch.supportSlack)) { y = t; break; }
  }
  if (!y || y > G.laneCapY) return null;

  const len = L.patch.minLen + Math.floor(hash(s) * (L.patch.maxLen - L.patch.minLen + 1));
  let x0 = s + 1;
  // never weld onto an existing lane at the same band: keep a real break
  for (const p of level.platforms)
    if (Math.abs(p.y - y) < L.bandMerge && p.x1 + L.patch.laneGap > x0 && p.x0 < x0 + len)
      x0 = Math.max(x0, p.x1 + L.patch.laneGap);
  const x1 = Math.min(x0 + len, end + L.patch.laneGap);
  if (x1 - x0 < L.patch.minLen) return null;
  if (spansApron(x0, x1, corners, L)) return null;

  const cand = { id: 'lattice-patch-' + x0, x0, x1, y, patch: true };
  if (y - latticeSupportY(level, cand) > G.maxReach) return null;
  return cand;
}

// Pass 1: add catwalks where the lattice is thin. Mutates level.platforms so
// each decision sees the previous one — an added lane can satisfy the next
// window, which is what keeps the additions sparse.
export function latticePatchPass(level, cfg, L = LATTICE) {
  const added = [];
  for (const span of latticeInterior(cfg, L)) {
    let s = span.a;
    while (s <= span.b) {
      if (latticeRouteCount(level, s, cfg, L) >= L.minRoutes) { s++; continue; }
      const patch = planPatch(level, s, cfg, L);
      if (!patch) { s++; continue; }
      level.platforms.push(patch);
      added.push(patch);
      s = patch.x0 + 1;
    }
  }
  return added;
}

// Would dropping platform i leave a window reading fewer than minRoutes?
// This is the guard that makes patch/thin a fixpoint instead of a metronome:
// without it the two passes fight over the same catwalk forever — one adds it
// to fix a thin window, the other removes it to fix a busy one — and the level
// ends wherever the loop happened to stop.
function thinIsSafe(level, i, cfg, L) {
  const p = level.platforms[i];
  level.platforms.splice(i, 1);
  let safe = true;
  const lo = p.x0 - L.lookahead, hi = p.x1;
  for (const span of latticeInterior(cfg, L)) {
    for (let s = Math.max(span.a, lo); s <= Math.min(span.b, hi) && safe; s++)
      if (latticeRouteCount(level, s, cfg, L) < L.minRoutes) safe = false;
    if (!safe) break;
  }
  level.platforms.splice(i, 0, p);
  return safe;
}

// Pass 2: drop the noise. A window over maxRoutes loses its highest catwalk
// that is neither authored (a pocket) nor load-bearing for something above it
// — and only when the level still reads >= minRoutes everywhere afterwards.
export function latticeThinPass(level, cfg, L = LATTICE) {
  const removed = [];
  for (const span of latticeInterior(cfg, L)) {
    for (let s = span.a; s <= span.b; s++) {
      let guard = 0;
      while (latticeRouteCount(level, s, cfg, L) > L.maxRoutes && guard++ < 8) {
        const end = Math.min(s + L.lookahead, level.groundH.length);
        const order = [];
        for (let i = 0; i < level.platforms.length; i++) {
          const p = level.platforms[i];
          if (p.pocket || p.arrival || p.arena) continue;   // authored: never thinned
          if (p.x1 <= s || p.x0 >= end) continue;
          // load-bearing: something above it would be stranded
          const supports = level.platforms.some((q) =>
            q !== p && q.y > p.y && q.x1 > p.x0 - 1 && q.x0 < p.x1 + 1 &&
            q.y - latticeSupportYExcluding(level, q, p) > cfg.gen.maxReach);
          if (!supports) order.push(i);
        }
        order.sort((a, b) => level.platforms[b].y - level.platforms[a].y);
        const pick = order.find((i) => thinIsSafe(level, i, cfg, L));
        if (pick === undefined) break;
        removed.push(level.platforms[pick]);
        level.platforms.splice(pick, 1);
      }
    }
  }
  return removed;
}

function latticeSupportYExcluding(level, p, skip) {
  let best = -999;
  const n = level.groundH.length;
  for (let k = Math.max(0, p.x0 - 1); k <= Math.min(n - 1, p.x1 + 1); k++)
    if (level.groundH[k] > -100) best = Math.max(best, level.groundH[k]);
  for (const q of level.platforms)
    if (q !== p && q !== skip && q.y < p.y && q.x1 > p.x0 - 1 && q.x0 < p.x1 + 1)
      best = Math.max(best, q.y);
  return best;
}

/* ----------------------------- audits ------------------------------ *
 * The same arithmetic the harness asserts against, exported so the runtime
 * and tools/pathcheck.mjs can never disagree about what "reachable",
 * "stranded", or "readable" mean.                                      */

// Catwalks whose support is further than a double jump below them.
export function latticeUnreachable(level, cfg) {
  return level.platforms.filter((p) => p.y - latticeSupportY(level, p) > cfg.gen.maxReach);
}

/* A catwalk STRANDS the player when, standing at its forward (right) end,
   there is no way on: no forward surface inside a run-jump, and nothing
   below to drop onto — only a chasm. The authored pocket shelves are the one
   deliberate exception and they are exempt by construction: their forward end
   is the mount, over solid landing, and it is their BACKWARD tip that hangs
   over the void — the walk back off it is measured in `detour`, not a
   surprise. */
export function latticeStranded(level, cfg) {
  const P = cfg.player;
  // A run-jump from a standstill-to-sprint launch: apex over the launch
  // surface, and the horizontal distance covered inside the rise.
  const apex = (P.jumpVel * P.jumpVel) / (2 * -P.gravity);
  const airMs = (2 * P.jumpVel) / -P.gravity;
  const reachX = P.runSpeed * airMs;
  const out = [];
  for (const p of level.platforms) {
    const edge = p.x1;                                 // first column past the end
    let ok = false;
    // (a) something to drop onto within a column of the edge
    for (let k = edge - 1; k <= Math.min(edge + 1, level.groundH.length - 1) && !ok; k++) {
      if (level.groundH[k] > -100 && level.groundH[k] < p.y) ok = true;
      for (const q of level.platforms)
        if (q !== p && q.y < p.y && k >= q.x0 && k < q.x1) ok = true;
    }
    // (b) something to jump to, forward and within the arc
    for (let k = edge; k < Math.min(edge + reachX, level.groundH.length) && !ok; k++) {
      if (level.groundH[k] > -100 && level.groundH[k] <= p.y + apex) ok = true;
      for (const q of level.platforms)
        if (q !== p && k >= q.x0 && k < q.x1 && q.y <= p.y + apex && q.y > p.y - 12) ok = true;
    }
    if (!ok) out.push(p);
  }
  return out;
}

// Per-face route-density report: what the lattice actually reads as.
export function latticeReport(level, cfg, L = LATTICE) {
  return latticeInterior(cfg, L).map((span) => {
    let min = 99, max = 0, sum = 0, n = 0;
    for (let s = span.a; s <= span.b; s++) {
      const c = latticeRouteCount(level, s, cfg, L);
      min = Math.min(min, c); max = Math.max(max, c); sum += c; n++;
    }
    return { face: span.face, a: span.a, b: span.b, min, max, avg: n ? sum / n : 0 };
  });
}
