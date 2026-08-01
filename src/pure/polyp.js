/* ============================= POLYP ============================== */
/* Iris Polyp pure geometry (boards 06/07): the beam-reach march, the
   beam-vs-rect lane test shared by sensing and damage, and the bend
   clamp that keeps a sightline on its own facet. The polyp is a ROOTED
   emplacement — it never moves, so everything interesting about it is
   geometry: where its side-facing barrel can see, and what stands in
   that line. Runtime terrain arrives through an isSolidAt callback the
   same way traversal decisions receive geometry; no imports outside
   this layer.                                                        */

/* A sightline may never cross a facet bend — the same ruling projectiles
   carry (decisions.md entry 7: sim and visuals agree, no cross-corner
   sniping), applied to a held beam. The clamp is a constant per rooted
   barrel, so the sim computes it once at spawn. `bends` is the BEND_S
   list from pure/path.js (or a fixture's own). */
export function polypBendClampRange(x, dir, maxRange, bends) {
  let range = maxRange;
  for (const b of bends) {
    const d = (b - x) * dir;
    if (d >= 0 && d < range) range = d;
  }
  return Math.max(0, range);
}

/* March from the barrel tip along `dir` until terrain or the clamped
   range: the beam is a SIGHT line — cover ends it, and what it cannot
   see it cannot deny ("use cover" is the DESIGN counterplay). The march
   may overshoot into the blocking cell by at most `step`, which is why
   step must stay well under a 1-tile wall (asserted in pathcheck): the
   beam tip can enter a wall's face, never cross it. */
export function polypBeamReach(tipX, y, dir, maxRange, isSolidAt, step) {
  let d = 0;
  while (d < maxRange) {
    const nd = Math.min(maxRange, d + step);
    if (isSolidAt(tipX + dir * nd, y)) return nd;
    d = nd;
  }
  return maxRange;
}

/* The one lane predicate, shared by sensing and damage so they can never
   disagree: does an axis-aligned rect (a player AABB, a standing body at
   a connector) intersect the beam band? The band is `half` tall around
   the barrel line and runs `reach` tiles from the tip along `dir`. */
export function polypBeamHitsRect(tipX, y, dir, reach, half, rx0, rx1, ry0, ry1) {
  if (reach <= 0) return false;
  const bx0 = dir > 0 ? tipX : tipX - reach;
  const bx1 = dir > 0 ? tipX + reach : tipX;
  return bx0 < rx1 && bx1 > rx0 && (y - half) < ry1 && (y + half) > ry0;
}
