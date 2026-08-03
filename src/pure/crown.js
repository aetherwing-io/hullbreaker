/* ======================== CROWN SUMMIT ============================ */
/* Pure bake plan for the functional bridge/transmitter at the top of the
   normal six-face run. The Crown is scenery, not a seventh arena: every
   descriptor is expressed in the same logical (s, y, depth) coordinates as
   RIG's route and ../render/crown.js maps it onto the rising tower once.

   The playable ribbon sits at depth 0. All Crown mass is behind it (negative
   depth), so the final sprint and every combat silhouette remain in front of
   the landmark. A detailed alpha plate carries the three-tower transmitter;
   only a broad, stepped bridge shoulder remains procedural, because little
   bars and greebles collapse back into the grey-box noise this landmark
   replaces. */

export const CROWN_APPROACH = Object.freeze({
  startFromEnd: 20,            // first scute shoulder: s = 425 in the shipped run
  coreFromEnd: 11,             // transmitter axis: s = 434
  endFromEnd: 4.5,             // far shoulder: s = 440.5
  deckY: 3,                    // generator's guaranteed flat outro deck
});

function part(kind, shape, s, y, w, h, depth, d, tilt = 0) {
  return { kind, shape, s, y, w, h, depth, d, tilt };
}

export function crownBakePlan(cfg, deckY = CROWN_APPROACH.deckY) {
  const start = cfg.levelLength - CROWN_APPROACH.startFromEnd;
  const core = cfg.levelLength - CROWN_APPROACH.coreFromEnd;
  const end = cfg.levelLength - CROWN_APPROACH.endFromEnd;
  const out = [];

  // The production summit art is a WORLD plate, not a screen overlay: it
  // follows this last face and sits immediately behind the broad 3D armour
  // below. The renderer skips this descriptor if its alpha texture missed
  // the boot gate; the foreground silhouette remains a complete fallback.
  out.push(part('summitPlate', 'plate', core, deckY + 6.35,
    33.5, 13.4, -4.9, 0.05));

  // Three overlapping armour shoulders replace the old single rectangular
  // plinth. Each successive tier is narrower and deeper, so the transmitter
  // grows out of the final-face scutes instead of sitting on a grey box. The
  // alpha plate sinks below the top tier; ordinary opaque depth is what hides
  // its lower cutout edge and makes the join physical.
  const shoulder = (start + end) / 2;
  out.push(part('foundation', 'box', shoulder, deckY + 0.30,
    end - start + 5.0, 0.60, -1.55, 1.55));
  out.push(part('foundation', 'box', shoulder, deckY + 0.82,
    end - start + 2.0, 0.66, -2.04, 1.65));
  out.push(part('foundation', 'box', core, deckY + 1.27,
    11.2, 0.72, -2.56, 1.72));

  // Broken rust lips echo the route's overlapping scutes; one unbroken bar
  // across the summit was the other half of the pasted-on plinth read.
  out.push(part('trim', 'box', (start + core) / 2, deckY + 0.69,
    6.4, 0.20, -1.42, 1.62));
  out.push(part('trim', 'box', core, deckY + 1.68,
    8.4, 0.22, -2.42, 1.78));
  out.push(part('trim', 'box', (core + end) / 2, deckY + 0.69,
    5.4, 0.20, -1.42, 1.62));

  return out;
}

export function crownBounds(cfg) {
  const plan = crownBakePlan(cfg);
  return plan.reduce((b, p) => ({
    s0: Math.min(b.s0, p.s - p.w / 2),
    s1: Math.max(b.s1, p.s + p.w / 2),
    y0: Math.min(b.y0, p.y - p.h / 2),
    y1: Math.max(b.y1, p.y + p.h / 2),
    nearestDepth: Math.max(b.nearestDepth, p.depth + p.d / 2),
  }), { s0: Infinity, s1: -Infinity, y0: Infinity, y1: -Infinity, nearestDepth: -Infinity });
}
