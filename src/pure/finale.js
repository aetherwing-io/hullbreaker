/* ===================== CROWN PACING RULES ======================= */
/* Small, deterministic decisions shared by the live finale and headless
   telemetry. The Crown score has authored time ceilings for accessibility,
   but a powerful player advances it by breaking visible armour seals instead
   of waiting for those clocks to expire. */

export function finalePacketDue({
  wave, elapsedMs, earnedDamage, packets, windowDamage,
}) {
  const packet = packets[wave];
  if (!packet) return false;
  if (elapsedMs >= packet.atMs) return true;
  // Packet zero wakes with the arena. Each later packet is Meridian's direct
  // answer to one spent Warden seal. `wave` is also the number of seals the
  // player must have broken, so no separate table can drift out of sync.
  return wave > 0 && earnedDamage >= wave * windowDamage;
}

export function finaleEarnedClear({
  defendElapsedMs, minEarnedMs, wave, packetCount, wardenBroken,
  supportThreats,
}) {
  return defendElapsedMs >= minEarnedMs && wave >= packetCount &&
    !!wardenBroken && supportThreats <= 0;
}
