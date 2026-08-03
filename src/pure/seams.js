/* ============================== SEAMS ============================== */
/* Warm-white seam pips and route-lip lights (S5, docs/proposals/2026-08-
   look-direction.md §3): the frame's only highlights. Deterministic,
   THREE-free — this module only DERIVES pip runs from level data that
   already defines a route (groundH's deck-edge runs, the platforms
   array's catwalk spans). src/render/seams.js turns the runs this module
   returns into the InstancedMesh pair that actually draws them.

   THE RULE: a pip run may never advertise a ledge that does not exist.
   Every run's [s0, s1) is copied VERBATIM from the route data — never
   authored, never padded — so a line of pips can never run past where
   its ledge stops (S5 falsifying test (a)). Static intensity only: no
   time argument anywhere in this file (mirrors the CP3 no-animation
   discipline src/pure/limb.js states for the body), and pathcheck's
   static-anatomy guard asserts it the same way (test (c)).

   SCOPE NOTE: the packet's item also names limbBakePlan's scute/kerb
   seam boundaries as a third input (the ?g1=1 limb read). That would
   touch src/pure/limb.js and src/render/limb.js, both fenced to a
   concurrent lane (T-035) this cycle — see the build report. This module
   covers the two inputs that do not require touching those files: the
   deck edge (always live) and the platforms array (catwalk ends).

   Kept local rather than in src/config.js (also fenced this cycle) —
   move SEAMS into CONFIG.seams at the next opportunity that touches that
   file without a lane conflict; nothing here depends on it staying local.

   ON BY DEFAULT (decisions.md entry 16, 2026-08-02). The blanket "prototypes
   ship behind query flags, off by default" rule is retired — entry 16 names
   this exact pass ("the value ladder, the seam pips and the RIG pass all
   landed invisible behind flags he never typed") as the reason. `?seams=0`
   is the escape hatch back to the pre-pass look, for comparison; absence,
   '' and junk all resolve to ON, the same shape `resolveLegibility` already
   carries for an approved, on-by-default pass. */

// Tuning. `pipEvery`/`edgeMargin` are in tiles (route-space, s). `pipSize`/
// `haloSize` are near-view world tiles — src/render/legibility.js's PIP_GAIN
// restores them at a pulled-back view exactly like LAMP_R. `deckDepth`/
// `platformDepth` follow the same "half the surface's own depth, plus a
// hair proud" arithmetic src/pure/limb.js's kerb piece already uses
// (planeHalfDepth + outward - thickness/2): src/render/level.js's tile box
// is BoxGeometry(1,1,2) (half-depth 1) and its catwalk slat is
// BoxGeometry(len,0.18,1.4) (half-depth 0.7) — both centred with no depth
// offset, so a pip sitting flush needs at least that half-depth to clear
// the surface it rides.
export const SEAMS = {
  minRun: 3,            // shorter runs are a stub, not a route: skip them
  pipEvery: 6,          // sparse navigation punctuation, not a warehouse light grid
  edgeMargin: 0.6,      // first/last pip stays this far inside the run's own ends
  pipSize: 0.11,        // core box, near-view tiles
  haloSize: 0.28,       // restrained halo; actors and weapon tells stay brightest
  deckUnder: 0.2,       // pip sits this far below the deck's top surface
  platformUnder: 0.12,  // pip sits this far below a catwalk slat's top
  deckDepth: 1.12,      // tile half-depth (1.0) + a hair proud
  platformDepth: 0.82,  // slat half-depth (0.7) + a hair proud
  depthGainMin: 0.72,   // the shallowest tier's floor — see depthGain() below
};

// Bake-time depth attenuation for the additive halo (review finding on the
// first version of this pass): a piece sitting less proud of the surface it
// rides (lower `depth` — closer to the tile/slat face, further from the
// camera along the outward axis this module's two tiers span) reads
// dimmer, `depthGainMin` at the shallowest tier this bake uses and 1.0 at
// the proudest. This is deliberately a SEPARATE, complementary mechanism to
// `fog:true` on the halo material (src/render/seams.js): fog handles the
// dominant case for this module's geometry — a pip's distance from the
// CURRENT camera position varies continuously as the run scrolls past all
// 445 tiles of it, which cannot be known at bake time — while this handles
// the literal, bake-time-knowable "depth" the packet's own risk note names,
// small as that range is for deck/catwalk pips (both sit near the play
// plane; the ?g1=1 limb backdrop this pass does not cover is where a large
// depth spread would actually live). Pure, deterministic, no clock.
export function depthGain(depth, cfg = SEAMS) {
  const lo = Math.min(cfg.deckDepth, cfg.platformDepth);
  const hi = Math.max(cfg.deckDepth, cfg.platformDepth);
  if (hi <= lo) return 1;
  const u = Math.max(0, Math.min(1, (depth - lo) / (hi - lo)));
  return cfg.depthGainMin + (1 - cfg.depthGainMin) * u;
}

// ?seams=0 (or =off) restores the pre-pass look; absence, '' and junk all
// resolve to ON (decisions.md entry 16 — this pass ships by default, same
// shape as resolveLegibility).
export function resolveSeams(value) {
  return !(value === '0' || value === 'off');
}

/* ------------------------------ deck edge --------------------------- */

// Contiguous spans of real ground in groundH: [s0, s1) columns, s1
// exclusive. Mirrors the per-column test src/pure/limb.js's kerb loop
// already uses (`groundH[s] > -100`), so a pip run and a kerb piece always
// agree on where the deck edge starts and stops.
export function deckEdgeRuns(groundH) {
  const runs = [];
  let s0 = -1;
  for (let s = 0; s <= groundH.length; s++) {
    const has = s < groundH.length && groundH[s] > -100;
    if (has && s0 < 0) s0 = s;
    else if (!has && s0 >= 0) { runs.push({ s0, s1: s }); s0 = -1; }
  }
  return runs;
}

// Evenly spaced pip centres inside [a, b), inset by `margin` so a pip never
// sits flush with a ledge's own end (it would read as painted past the
// edge rather than stopping at it). Returns [] for a span too short to
// hold even one inset pip.
function pipsAlong(s0, s1, every, margin) {
  const a = s0 + margin, b = s1 - margin;
  if (b <= a) return [];
  const span = b - a;
  const n = Math.max(1, Math.round(span / every) + 1);
  const out = [];
  for (let i = 0; i < n; i++) out.push(n === 1 ? (a + b) / 2 : a + (span * i) / (n - 1));
  return out;
}

// Deck-edge pip runs: one line of pips under the lip of every deck run at
// least SEAMS.minRun tiles long. `s0`/`s1` are copied verbatim from
// deckEdgeRuns — never authored — so a run can never advertise a ledge
// that has no ground under it.
export function deckSeamRuns(groundH, cfg = SEAMS) {
  const out = [];
  for (const run of deckEdgeRuns(groundH)) {
    if (run.s1 - run.s0 < cfg.minRun) continue;
    const centres = pipsAlong(run.s0, run.s1, cfg.pipEvery, cfg.edgeMargin);
    out.push({
      kind: 'deck', s0: run.s0, s1: run.s1,
      pips: centres.map((s) => ({ s, y: groundH[Math.min(groundH.length - 1, Math.floor(s))] - cfg.deckUnder })),
    });
  }
  return out;
}

/* ------------------------------ catwalks ----------------------------- */

// Catwalk pip runs: one line under every platform long enough to read.
// `s0`/`s1` are the platform's own x0/x1 — verbatim — so a pip line can
// never run past a catwalk's own end.
export function platformSeamRuns(platforms, cfg = SEAMS) {
  const out = [];
  for (const p of platforms) {
    if (p.x1 - p.x0 < cfg.minRun) continue;
    const centres = pipsAlong(p.x0, p.x1, cfg.pipEvery, cfg.edgeMargin);
    out.push({
      kind: 'platform', s0: p.x0, s1: p.x1,
      pips: centres.map((s) => ({ s, y: p.y - cfg.platformUnder })),
    });
  }
  return out;
}

export function seamRuns(groundH, platforms, cfg = SEAMS) {
  return deckSeamRuns(groundH, cfg).concat(platformSeamRuns(platforms, cfg));
}

export function seamPipCount(runs) {
  let n = 0;
  for (const r of runs) n += r.pips.length;
  return n;
}
