/* Node-safe state selection for the modular wasp presentation. Every input is
   an existing sim field or render-local motion sample; this module cannot
   change collision, AI, tell duration, damage, or movement. */

export const WASP_BODY = Object.freeze({
  CRUISE: 0,
  PITCH_UP: 1,
  TURN_BANK: 2,
  DIVE_LOCK: 3,
  DIVE_ATTACK: 4,
  HIT_RECOIL: 5,
  RECOVER_BRAKE: 6,
  DEATH_CRACK: 7,
});

export const WASP_WING_PHASES = 8;
export const WASP_FLIGHT_CYCLES_PER_SECOND = 3.25;

export function selectWaspBodyState(row, nowMs, motion) {
  if (nowMs < (row.staggerUntil || 0)) return WASP_BODY.HIT_RECOIL;
  if (row.state === 'dive')
    return nowMs < (row.lockUntil || 0) ? WASP_BODY.DIVE_LOCK : WASP_BODY.DIVE_ATTACK;
  if (row.state === 'recover') return WASP_BODY.RECOVER_BRAKE;
  if (motion?.turning || (motion?.dy || 0) < -0.025) return WASP_BODY.TURN_BANK;
  if ((motion?.dy || 0) > 0.025) return WASP_BODY.PITCH_UP;
  return WASP_BODY.CRUISE;
}

export function selectWaspWingPhase(row) {
  // The same 3.25Hz cycle the old four-frame atlas used, now sampled at eight
  // anatomically adjacent phases. id de-synchronizes a squad without RNG.
  const cycle = row.t * WASP_FLIGHT_CYCLES_PER_SECOND + row.id * 0.173;
  const unit = cycle - Math.floor(cycle);
  return Math.min(WASP_WING_PHASES - 1, Math.floor(unit * WASP_WING_PHASES));
}

