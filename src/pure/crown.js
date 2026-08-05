/* ======================== CROWN SUMMIT ============================ */
/* Pure, fixed bake plan for Meridian's command/transmitter at the top of the
   six-face run. The Crown is a PLACE and a SYSTEM, not a seventh creature:
   nothing here owns collision, timing, health, or animation. Every part is
   expressed in the route's ordinary (s, y, depth) space and the renderer
   bolts the complete landmark to the final hull facet once at boot.

   The playable ribbon is depth 0. Even the aperture lip remains behind it,
   so RIG, the Warden, projectiles and tells always win the silhouette. Four
   independent painted machine organs sit in a real shell/recess hierarchy;
   no image owns the complete silhouette or the transition into the hull. */

export const CROWN_APPROACH = Object.freeze({
  startFromEnd: 36,            // first buried root: s = 409 in the shipped run
  coreFromEnd: 18,             // command axis: s = 427, inside phone framing
  endFromEnd: 0,               // fractured far shoulder reaches the hull tip
  deckY: 3,                    // generator's guaranteed flat outro deck
});

// Mechanical response is presentation-only, but its limits live here so the
// renderer cannot quietly turn the Crown into a looping animated backdrop.
// Every envelope is zero without a recent encounter event. Distances are
// route tiles, angles are radians, and the turbine step is capped so a resumed
// browser tab cannot spin the mechanism through an enormous discontinuity.
export const CROWN_MECHANICAL_LIMITS = Object.freeze({
  packetDurationMs: 520,
  packetRootTravel: 0.24,
  packetCoreTravel: 0.055,
  turbineRadiansPerSecond: 4.4,
  turbineMaxStepMs: 80,
  ruptureDurationMs: 760,
  antennaWhipRadians: 0.12,
  transmissionDurationMs: 980,
  shellRecoilTravel: 0.22,
  shellRecoilRadians: 0.035,
  transmissionCoreTravel: 0.085,
});

function eventPulse(ageMs, durationMs) {
  const age = Number(ageMs);
  if (!Number.isFinite(age) || age < 0 || age >= durationMs) return 0;
  const u = age / durationMs;
  // Fast compression/impact, slower mechanical recovery.
  const attack = Math.min(1, u / 0.18);
  const release = 1 - (u - 0.18) / 0.82;
  const envelope = u < 0.18 ? attack * attack * (3 - 2 * attack)
    : Math.max(0, release * release * (3 - 2 * release));
  return Math.max(0, Math.min(1, envelope));
}

// Stateless action pose. Callers pass event ages, never encounter state or a
// simulation object. Signed antenna whip and asymmetric shell roll are
// bounded independently from their translation pulses.
export function crownMechanicalPose({
  packetAgeMs = Infinity,
  ruptureAgeMs = Infinity,
  transmissionAgeMs = Infinity,
} = {}) {
  const rootCompression = eventPulse(
    packetAgeMs, CROWN_MECHANICAL_LIMITS.packetDurationMs,
  );
  const ruptureEnvelope = eventPulse(
    ruptureAgeMs, CROWN_MECHANICAL_LIMITS.ruptureDurationMs,
  );
  const transmissionRecoil = eventPulse(
    transmissionAgeMs, CROWN_MECHANICAL_LIMITS.transmissionDurationMs,
  );
  const ruptureU = Number.isFinite(Number(ruptureAgeMs))
    ? Math.max(0, Math.min(1,
      Number(ruptureAgeMs) / CROWN_MECHANICAL_LIMITS.ruptureDurationMs))
    : 0;
  const antennaWhip = ruptureEnvelope * Math.sin(ruptureU * Math.PI * 3);

  return Object.freeze({
    rootCompression,
    coreKick: Math.max(rootCompression * 0.34, transmissionRecoil),
    antennaWhip,
    transmissionRecoil,
  });
}

export function stepCrownTurbine(angle = 0, dtMs = 0, committedAttack = false) {
  const tau = Math.PI * 2;
  const prior = ((Number(angle) || 0) % tau + tau) % tau;
  if (!committedAttack) return prior;
  const dt = Math.max(0, Math.min(
    CROWN_MECHANICAL_LIMITS.turbineMaxStepMs, Number(dtMs) || 0,
  ));
  return (prior + dt * CROWN_MECHANICAL_LIMITS.turbineRadiansPerSecond / 1000) % tau;
}

function part(kind, shape, s, y, w, h, depth, d, tilt = 0, extra = null) {
  return Object.freeze({
    kind, shape, s, y, w, h, depth, d, tilt,
    ...(extra || {}),
  });
}

function link(kind, shape, s0, y0, s1, y1, depth, d, thickness = 0.34,
  extra = null) {
  const dx = s1 - s0;
  const dy = y1 - y0;
  return part(kind, shape, (s0 + s1) / 2, (y0 + y1) / 2,
    Math.hypot(dx, dy), thickness, depth, d, Math.atan2(dy, dx), extra);
}

// Same-build visual comparison for capture tooling. Production is always the
// default; this branch preserves the former wide plate + shallow plinth.
function legacyPlan(cfg, deckY) {
  const start = cfg.levelLength - 20;
  const core = cfg.levelLength - 11;
  const end = cfg.levelLength - 4.5;
  const shoulder = (start + end) / 2;
  return [
    part('summitPlate', 'plate', core, deckY + 6.35, 33.5, 13.4, -4.9, 0.05),
    part('foundation', 'rootLeft', shoulder, deckY + 0.30, end - start + 5.0, 0.60, -1.55, 1.55),
    part('foundation', 'rootRight', shoulder, deckY + 0.82, end - start + 2.0, 0.66, -2.04, 1.65),
    part('foundation', 'rootCrown', core, deckY + 1.27, 11.2, 0.72, -2.56, 1.72),
    part('trim', 'conduit', (start + core) / 2, deckY + 0.69, 6.4, 0.20, -1.42, 1.62),
    part('trim', 'conduit', core, deckY + 1.68, 8.4, 0.22, -2.42, 1.78),
    part('trim', 'conduit', (core + end) / 2, deckY + 0.69, 5.4, 0.20, -1.42, 1.62),
  ];
}

export function crownBakePlan(
  cfg, deckY = CROWN_APPROACH.deckY, { legacy = false } = {},
) {
  if (legacy) return legacyPlan(cfg, deckY);

  const core = cfg.levelLength - CROWN_APPROACH.coreFromEnd;
  const out = [];

  // Four independent painted machine organs occupy different depths. The
  // central art remains recessed while two atlas roots cross beneath it and
  // a separate receiver cluster breaks the skyline. Opaque shells below own
  // every major boundary and hide all four attachment seams.
  out.push(part('coreArt', 'plate', core - 0.18, deckY + 9.90,
    15.0, 20.0, -3.18, 0.04, 0, { asset: 'core' }));
  out.push(part('rootArt', 'plate', core - 8.72, deckY + 2.18,
    20.0, 12.0, -2.42, 0.04, 0.018, { asset: 'rootLeft' }));
  out.push(part('rootArt', 'plate', core + 8.58, deckY + 2.08,
    20.0, 12.0, -2.40, 0.04, -0.026, { asset: 'rootRight' }));
  out.push(part('antennaArt', 'plate', core + 3.92, deckY + 15.22,
    11.0, 14.0, -3.34, 0.04, -0.012, { asset: 'antenna' }));
  // The painted core already owns the landmark's irregular outer silhouette.
  // Keep opaque recess metal only behind the working iris: a full-height
  // rectangle reads as a pasted-on backing card at the shipped FAR camera.
  out.push(part('backplane', 'recess', core - 0.18, deckY + 9.18,
    8.8, 10.4, -4.82, 0.56, -0.012));

  // Five roots start below the guaranteed outro deck and overlap by several
  // tiles. Their upper arcs break through the summit armor; there is no
  // horizontal plinth, shelf or boxed terminal edge to reveal the landmark.
  out.push(part('foundation', 'rootLeft', core - 8.10, deckY - 1.42,
    16.2, 3.1, -2.02, 0.52, 0.030));
  out.push(part('foundation', 'rootRight', core + 8.05, deckY - 1.48,
    14.5, 3.0, -2.00, 0.50, -0.050));
  out.push(part('foundation', 'rootCrown', core - 0.28, deckY - 1.36,
    11.2, 3.0, -1.99, 0.48, -0.012));
  out.push(part('foundation', 'rootLeft', core - 14.10, deckY - 1.48,
    6.9, 2.6, -2.04, 0.46, -0.090));
  out.push(part('foundation', 'rootRight', core + 14.20, deckY - 1.52,
    6.25, 2.6, -2.03, 0.44, 0.080));

  // Layered asymmetric shells frame, but never cover, the recessed machine.
  // Their long tapered overlaps visually continue the same scute grammar as
  // the route hull and make the Crown feel unearthed from Meridian's body.
  out.push(part('shell', 'shellLeft', core - 6.72, deckY + 7.86,
    1.62, 9.6, -3.48, 0.44, -0.055));
  out.push(part('shell', 'shellRight', core + 6.68, deckY + 7.12,
    1.68, 8.8, -3.46, 0.42, 0.058));
  out.push(part('shell', 'shoulderLeft', core - 5.12, deckY + 3.18,
    1.85, 2.45, -2.76, 0.48, 0.024));
  out.push(part('shell', 'shoulderRight', core + 5.08, deckY + 2.92,
    1.95, 2.32, -2.74, 0.46, -0.036));
  out.push(part('shell', 'crownCap', core - 2.02, deckY + 17.52,
    2.65, 1.18, -3.58, 0.40, -0.018));
  out.push(part('shell', 'rootCrown', core - 0.12, deckY + 0.30,
    3.15, 1.12, -1.96, 0.40, 0.012));

  // Broad hardware discs and antenna pods are silhouette-scale detail. They
  // read as mechanisms rather than the tiny white-light checkerboard used by
  // the old graybox dressing.
  out.push(part('hardware', 'gear', core - 7.20, deckY + 3.68,
    1.34, 1.34, -1.91, 0.18, 0.04));
  out.push(part('hardware', 'gear', core + 7.48, deckY + 2.95,
    1.58, 1.58, -1.89, 0.18, -0.05));
  out.push(part('hardware', 'gear', core - 4.92, deckY + 8.74,
    1.12, 1.12, -1.93, 0.16, 0.02));
  out.push(part('hardware', 'gear', core + 4.74, deckY + 7.92,
    1.06, 1.06, -1.91, 0.16, -0.04));
  out.push(part('hardware', 'gear', core - 0.15, deckY + 16.42,
    0.92, 0.92, -1.96, 0.14, 0));

  out.push(part('antenna', 'antennaPod', core - 6.12, deckY + 15.74,
    0.70, 5.2, -3.72, 0.42, -0.045));
  out.push(part('antenna', 'antennaPod', core + 2.90, deckY + 18.28,
    0.76, 5.8, -3.74, 0.44, 0.025));
  out.push(part('antenna', 'antennaPod', core + 6.48, deckY + 13.85,
    0.58, 3.7, -3.69, 0.40, 0.085));

  // Five bowed carriers form a continuous root -> iris -> antenna circuit.
  // Each stage owns a separate material so finale energy walks through the
  // structure instead of tinting the whole tower pink at once.
  out.push(link('signal0', 'cableA', core - 12.0, deckY - 0.35,
    core - 3.35, deckY + 5.30, -1.97, 0.34, 0.72, { stage: 0 }));
  out.push(link('signal0', 'cableB', core + 11.7, deckY - 0.50,
    core + 3.15, deckY + 5.22, -1.95, 0.34, 0.70, { stage: 0 }));
  out.push(link('signal1', 'cableB', core - 3.18, deckY + 5.28,
    core - 0.12, deckY + 9.55, -1.90, 0.32, 0.58, { stage: 1 }));
  out.push(link('signal2', 'cableA', core + 0.04, deckY + 10.82,
    core - 0.58, deckY + 17.22, -1.92, 0.30, 0.52, { stage: 2 }));
  out.push(link('signal2', 'cableB', core + 0.32, deckY + 10.42,
    core + 5.82, deckY + 14.44, -1.94, 0.30, 0.48, { stage: 2 }));

  // The iris is a renderer-built deep mechanism: multiple fixed rings,
  // turbine vanes, a lens and six physical shutters. The damaged right shell
  // hinges outward during transmission, so the structure ruptures rather
  // than growing or dissolving into a pink overlay.
  out.push(part('void', 'aperture', core + 0.02, deckY + 9.62,
    4.65, 4.65, -1.82, 0.08, 0));
  out.push(part('damage', 'rupture', core + 5.12, deckY + 10.38,
    3.35, 6.4, -1.88, 0.42, -0.125));

  return out;
}

export function crownBounds(cfg, options) {
  const plan = crownBakePlan(cfg, CROWN_APPROACH.deckY, options);
  return plan.reduce((b, p) => ({
    s0: Math.min(b.s0, p.s - p.w / 2),
    s1: Math.max(b.s1, p.s + p.w / 2),
    y0: Math.min(b.y0, p.y - p.h / 2),
    y1: Math.max(b.y1, p.y + p.h / 2),
    nearestDepth: Math.max(b.nearestDepth, p.depth + p.d / 2),
  }), { s0: Infinity, s1: -Infinity, y0: Infinity, y1: -Infinity, nearestDepth: -Infinity });
}
