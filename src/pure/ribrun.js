/* ============================= RIB RUN ============================= */
/* THE AUTHORED SLOPE (?ribrun=1) — the movement lane's second live
   candidate (docs/decisions.md entry 5: "the movement lane's live
   candidates are now FLOW (?flow=1 ...) and the authored-slope rib-run
   (costed, not started)").

   The brief, from concept boards 10/13 and the operator's own framing of
   the climb: "a long straight up a ribline". One diagonal, taken at speed,
   testing whether SUSTAINED ASCENDING MOMENTUM can come out of geometry
   alone — and the hard constraint from entry 5's hook-v1 rejection: it has
   to be MARKER-LESS and BUTTON-LESS. No anchors to service, no new key.
   Nothing here is a new verb: run, jump and the launch that a contact
   already produces are the whole vocabulary, and the frozen jump constants
   (CLAUDE.md's hard rule) are untouched. The SLOPE makes the momentum.

   ---------------------------------------------------------------- form
   The rib is a monotone staircase of authored ground: `steps` risers of
   `riser` tiles each, separated by `tread` tiles of deck, from the
   fixture's own spawn apron up to a crest the rejoin sits on. It replaces
   the lattice inside the same fixture bounds rather than extending past
   them, so the run window, the pursuing edge, the spawn, the camera and
   the victory line are all exactly the ones the operator has already
   judged — only the ground moved.

   ------------------------------------------------- why 2 over 7, exactly
   Both numbers are derived from the frozen tune, not chosen by taste
   (fixture movement: runSpeed 10.8, jumpVel 16.5, gravity -42, fall x1.6):

   riser 2 — the ANALYTIC single-jump apex is 3.24 tiles, but the discrete
     apex of the semi-implicit integrator is lower and frame-rate
     dependent; src/pure/generator.js records 0.96x of analytic at 60Hz and
     0.92x at 30Hz, and src/main.js clamps dt at 0.05 s (20fps-equivalent),
     which is worse still. A 3-tile riser dies at that clamp. A 2-tile
     riser keeps roughly 0.8 tiles of clearance even there — asserted, at
     the clamp floor, against the real sim loop.

   tread 7 — one full jump carries 7.14 tiles at run speed, so a tread of 7
     makes a CONSTANT-CADENCE hop a fixed point of the rib: hop every
     tread/runSpeed = 0.648 s and every riser arrives at the same phase of
     the arc. That is the "sustained" in sustained ascending momentum
     stated as arithmetic — the rhythm does not have to be re-solved per
     step, and the rib never asks for a second input.

   Slope = 2/7 = 0.286 (16 degrees) inside the rib, 12 tiles of climb over
   35, which is the diagonal boards 10/13 draw.

   ------------------------------------------------- three tiers of repair
   Momentum is sacred (pillar 1), so a mistimed hop must cost altitude or
   time, never the run. The geometry answers a short jump three ways, in
   descending order of what it keeps, and all three are EXISTING sim
   behavior — no player-code change:

     1. CLEAR — the feet are above the riser when the leading edge crosses
        it: land on the next deck with horizontal speed untouched. The
        window is `ribrunClearSpan`, about 4.7 tiles wide (≈435 ms), which
        is why the cadence is forgiving.
     2. FLANGE — a one-way rib flange sits one tile under the lip of each
        deck, ending 0.8 tiles short of the riser face. A jump that falls
        short of the deck lands on the flange instead of hitting the wall,
        keeps its speed, and only has one tile left to climb. One-way
        plates never block horizontal motion, so a flange can only ever
        give momentum back.
     3. CATCH — the last 0.8 tiles in front of the face are left clear of
        the flange on purpose: a body that reaches the wall is pinned
        against it by its own forward drive and falls, and the ledge probe
        (src/pure/traversal.js, traversalLedgeProbe) converts that fall
        into a ledge catch the moment the hand passes the lip. That is the
        existing "every grab wants to become another launch" spine, reached
        with no marker and no new button: jump out of it (or, under
        ?flow=1 / ?pace=surge, it auto-launches and the whole rib becomes
        genuinely button-less past the first hop).

   Only past all three does the rib take something back: a wall slide down
   to the deck below, a stop, and the pursuing edge closing.

   Everything below is pure data plus the arithmetic that derives the
   contract from a movement tune; tools/pathcheck.mjs asserts the contract
   against that data AND against the real sim loop.                       */

import { TRAVERSAL_FIXTURE } from './traversal.js';

export const TRAVERSAL_RIBRUN = {
  id: 'ribrun-v1',
  label: 'RIB RUN',
  hypothesis:
    'A long authored diagonal, taken at speed, produces sustained ascending ' +
    'momentum out of geometry alone — no anchors to service and no new input, ' +
    'with every mistimed hop repaid by a flange or a ledge catch instead of ' +
    'stopping the run.',
  baseY: 3,             // the apron deck: the fixture's own spawn height
  firstRiserX: 31,      // where the climb starts (spawn is at 27.5)
  riser: 2,             // tiles gained per rib
  tread: 7,             // tiles of deck between risers
  steps: 6,             // risers, so the crest lands 12 tiles up
  // The flange hangs one tile under the deck it belongs to and stops short
  // of the riser face, leaving the catch pocket in front of the wall.
  flange: { drop: 1, back: 2.6, gap: 0.8 },
  // The stake rides the line instead of asking for a detour: one deck-height
  // above the middle rib, grabbed on the way through.
  reward: { kind: 'letter', letter: 'H', mode: 'fixed', x: 55, y: 12.2 },
};

/* The rib's decks, left to right: the apron, one per riser, and the crest
   that carries the rejoin. Half-open on x, exactly like the fixture's own
   ground runs, and covering the fixture bounds once with no seam.        */
export function ribrunDecks(rib = TRAVERSAL_RIBRUN, bounds = TRAVERSAL_FIXTURE.bounds) {
  const out = [{ index: 0, x0: bounds.x0, x1: rib.firstRiserX, y: rib.baseY }];
  for (let k = 1; k <= rib.steps; k++) {
    const x0 = rib.firstRiserX + (k - 1) * rib.tread;
    out.push({
      index: k,
      x0,
      x1: k === rib.steps ? bounds.x1 : x0 + rib.tread,
      y: rib.baseY + k * rib.riser,
    });
  }
  return out;
}

/* One-way flanges: the second tier of repair. `face` is the riser face the
   flange belongs to, so the assertions can talk about the catch pocket. */
export function ribrunFlanges(rib = TRAVERSAL_RIBRUN, bounds = TRAVERSAL_FIXTURE.bounds) {
  return ribrunDecks(rib, bounds).slice(1).map(function (deck) {
    return {
      id: 'rib-flange-' + deck.index,
      face: deck.x0,
      x0: deck.x0 - rib.flange.back,
      x1: deck.x0 - rib.flange.gap,
      y: deck.y - rib.flange.drop,
    };
  });
}

/* ---------------------------- the slope contract --------------------- *
 * Pure arithmetic over a movement tune, so the numbers the comment above
 * reasons with are the numbers the harness checks. `mv` is the resolved
 * player tune (CONFIG.player with the fixture's movement overrides), which
 * is exactly what src/sim/player.js runs on.                             */

export function ribrunJumpArc(mv) {
  const gUp = -mv.gravity;
  const gDown = -mv.gravity * mv.fallGravityMult;
  return {
    gUp,
    gDown,
    tRise: mv.jumpVel / gUp,
    apex: (mv.jumpVel * mv.jumpVel) / (2 * gUp),
  };
}

// Horizontal distances from the jump point — at run speed, holding jump —
// between which the FEET are at or above `h`. A jump started inside
// [from, to] before a riser face clears that riser. `null` means the tune
// cannot clear that height at all with one jump.
export function ribrunClearSpan(mv, h) {
  const a = ribrunJumpArc(mv);
  if (h > a.apex) return null;
  const tUp = (mv.jumpVel - Math.sqrt(mv.jumpVel * mv.jumpVel - 2 * a.gUp * h)) / a.gUp;
  const tDown = a.tRise + Math.sqrt((2 * (a.apex - h)) / a.gDown);
  return {
    from: tUp * mv.runSpeed,
    to: tDown * mv.runSpeed,
    width: (tDown - tUp) * mv.runSpeed,
    apex: a.apex,
  };
}

// How far one full jump carries at run speed before the feet return to the
// height they left — the cadence the tread is matched to.
export function ribrunHopSpan(mv) {
  const a = ribrunJumpArc(mv);
  return (a.tRise + Math.sqrt((2 * a.apex) / a.gDown)) * mv.runSpeed;
}

// Feet heights (relative to the LOWER deck) at which a body pinned to a
// riser face converts into a ledge catch: the hand has to land within
// ledgeReachY of the lip, and Math.round has to pick that lip, which
// ledgeReachY < 0.5 already guarantees.
export function ribrunCatchBand(mv, riser) {
  const lo = riser - mv.ledgeGrabHeight - mv.ledgeReachY;
  const hi = riser - mv.ledgeGrabHeight + mv.ledgeReachY;
  return { lo, hi, height: hi - lo };
}

// The catch band is only real if a falling body cannot step over it inside
// one clamped frame. The fastest legal crossing starts from the lip itself
// (a body higher than that is over the deck, not against the face).
export function ribrunCatchStep(mv, riser, dtClamp) {
  const band = ribrunCatchBand(mv, riser);
  const gDown = -mv.gravity * mv.fallGravityMult;
  const speed = Math.sqrt(2 * gDown * Math.max(0, riser - band.hi));
  return { band, speed, step: speed * dtClamp };
}

/* ------------------------------ the fixture -------------------------- *
 * A fixture-shaped overlay on the traversal slice: same bounds, same run
 * window, same spawn, same pursuit, same frozen movement tune, same
 * fallback rules — different ground. Everything the overlay does not name
 * is inherited, so a change to the shipped fixture's pacing or verbs
 * reaches the rib run too.                                              */
export function ribrunFixture(base = TRAVERSAL_FIXTURE, rib = TRAVERSAL_RIBRUN) {
  const decks = ribrunDecks(rib, base.bounds);
  const crest = decks[decks.length - 1];
  const connectors = [
    { id: 'entry', kind: 'entry', x: base.run.playerSpawn.x, y: rib.baseY },
  ];
  const edges = [];
  const routeIds = ['entry'];
  decks.slice(1).forEach(function (deck, i) {
    const id = 'rib-' + deck.index;
    connectors.push({ id, kind: 'rib', x: deck.x0 + 1.5, y: deck.y });
    edges.push({
      routeId: 'ribline',
      from: i === 0 ? 'entry' : 'rib-' + decks[i].index,
      to: id,
      verb: 'run-jump',
    });
    routeIds.push(id);
  });
  connectors.push({ id: 'rejoin', kind: 'rejoin', x: crest.x1 - 4, y: crest.y });
  edges.push({ routeId: 'ribline', from: 'rib-' + crest.index, to: 'rejoin', verb: 'run' });
  routeIds.push('rejoin');
  return {
    ...base,
    id: 'traversal-' + rib.id,
    ribrun: rib,
    // The rib is a movement bench: every pace's hostile roster is authored
    // against the lattice this overlay replaces, so fielding one here would
    // put wasps inside the rock. The pursuing edge is the pressure, and the
    // pace still owns it — ?ribrun=1&pace=surge is a real pacing A/B.
    hostileFree: true,
    enemies: [],
    groundRuns: decks.map(function (d) { return { x0: d.x0, x1: d.x1, y: d.y }; }),
    platforms: ribrunFlanges(rib, base.bounds).map(function (f) {
      return { id: f.id, x0: f.x0, x1: f.x1, y: f.y };
    }),
    // No lattice walls: the risers themselves are the only vertical surface,
    // and they are ground, so every one of them is grabbable.
    solidRects: [],
    entry: 'entry',
    exit: 'rejoin',
    immediateChoiceCap: 1,          // one line, on purpose — that is the test
    firstFork: { connector: 'entry', choices: ['rib-1'] },
    connectors,
    edges,
    routes: [{ id: 'ribline', connectorIds: routeIds }],
    rejoin: { connector: 'rejoin', x0: base.rejoin.x0, x1: base.bounds.x1, y: crest.y },
    // There is no dare pocket on a single line. Collapsing the span to the
    // fixture's left bound keeps every pocket consumer (pursuit release, HUD
    // banner, CHARGE wager) permanently false instead of special-casing them.
    darePocket: {
      ...base.darePocket,
      bounds: { x0: base.bounds.x0, x1: base.bounds.x0 },
      reward: { ...rib.reward },
      retreatPath: [],
    },
  };
}
