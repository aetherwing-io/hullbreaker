/* ======== LOCAL POWER FEEDBACK (render-only scalar vocabulary) ======== *
 * OVERDRIVE, RAGE, and the gilded chassis deliberately do not share a
 * cadence.  OVERDRIVE breathes like a machine under load; RAGE snaps in a
 * narrow staccato; gilded-aura.js keeps its much slower ceremonial shimmer.
 *
 * These helpers return numbers only.  They are shared by RIG, its local
 * bracket aura, and projectile spawn coloring without allocating objects in
 * any hot path or exposing presentation state to the simulation. */

export const OVERDRIVE_ENTRY_MS = 420;
// Slower than three beats per second so the rare modifier reads as deliberate
// machinery, not warning-light flicker.  A sixth-power envelope keeps each
// beat narrow even at the calmer cadence.
export const RAGE_STACCATO_HZ = 2.8;
const RAGE_STACCATO_OMEGA = Math.PI * 2 * RAGE_STACCATO_HZ / 1000;

export function clampPower01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function normalizedOverdriveCharge(charge, maxCharge) {
  const max = Number(maxCharge) || 1;
  return clampPower01((Number(charge) || 0) / max);
}

export function overdriveBreath(gameMs) {
  return 0.5 + 0.5 * Math.sin((Number(gameMs) || 0) * 0.016);
}

export function rageStaccato(gameMs) {
  const wave = 0.5 + 0.5 * Math.sin((Number(gameMs) || 0) * RAGE_STACCATO_OMEGA);
  return wave * wave * wave * wave * wave * wave;
}

export function overdriveProjectileGain(notch, charge01) {
  if (notch >= 2) return 0.20;
  if (notch === 1) return 0.08 + clampPower01(charge01) * 0.04;
  return 0;
}
