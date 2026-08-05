/* Deterministic environment-response contract shared by renderer and the
 * future adaptive assault director. It plans sockets and state semantics only;
 * it neither spawns hostiles nor imports renderer state. */

export const MERIDIAN_DEFENSE_STATES = Object.freeze([
  'observe', 'intercept', 'contain', 'quarantine', 'sterilize', 'scuttle',
]);

// path.faceIndexAt reserves 0 for the short intro and numbers the six authored
// climb faces 1..6. Defense state arrays are zero-based; the intro intentionally
// shares Observe rather than consuming or skipping a state.
export function defensePhaseForRouteFace(routeFace) {
  return Math.max(0, Math.min(5, Math.trunc(routeFace) - 1));
}

const STATE_SOCKET = Object.freeze({
  observe: 'spawn',
  intercept: 'clamp',
  contain: 'interlock',
  quarantine: 'vent',
  sterilize: 'defense',
  scuttle: 'rupture',
});

function hash(seed) {
  let value = (Math.trunc(seed) ^ 0x9e3779b9) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return (value ^ (value >>> 15)) >>> 0;
}

export function meridianResponsePlan(phase, ordinal, pattern) {
  const phaseIndex = Math.max(0, Math.min(5, Math.trunc(phase)));
  const state = MERIDIAN_DEFENSE_STATES[phaseIndex];
  const cadence = [11, 8, 7, 6, 5, 4][phaseIndex];
  const beat = (ordinal + phaseIndex * 3) % cadence;
  const active = beat === 0 || (phaseIndex === 5 && beat === 2);
  const seed = hash(ordinal * 131 + phaseIndex * 977 + pattern * 37);
  const socketKind = phaseIndex === 5 && beat === 2 ? 'defense' : STATE_SOCKET[state];
  return Object.freeze({
    phase: phaseIndex,
    state,
    active,
    socketKind,
    // Keep deployment origins away from RIG's playable plane. The renderer
    // resolves these route-relative offsets into world coordinates; a future
    // director can use the same plan without importing Three.js.
    routeOffset: ((seed >>> 5) % 3 - 1) * 0.38,
    verticalOffset: -2.9 - ((seed >>> 9) % 3) * 0.34,
    outwardDepth: 2.0 + ((seed >>> 13) % 3) * 0.24,
    safeFromPlayerRadius: 2.4 + phaseIndex * 0.12,
    tellLeadMs: [620, 560, 500, 460, 420, 380][phaseIndex],
    allowedHooks: phaseIndex === 0 ? Object.freeze(['dormant', 'armed']) :
      phaseIndex === 5 ? Object.freeze(['armed', 'active', 'spent', 'damaged']) :
        Object.freeze(['dormant', 'armed', 'active']),
  });
}
