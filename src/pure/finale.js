/* ===================== CROWN PACING RULES ======================= */
/* Small, deterministic decisions shared by the live finale and headless
   telemetry. The Crown score has authored time ceilings for accessibility,
   but a powerful player advances it by breaking visible armour seals instead
   of waiting for those clocks to expire. */

export function finalePacketDue({
  wave, elapsedMs, earnedDamage, packets, windowDamage,
  readyElapsedMs = 0, powerBand = 0, supportThreats = 0,
  queuedSupport = 0, clearEmaMs = 0,
}) {
  const packet = packets[wave];
  if (!packet) return false;
  if (elapsedMs >= packet.atMs) return true;
  if (elapsedMs < readyElapsedMs) return false;
  // Packet zero wakes with the arena. Each later packet is Meridian's direct
  // answer to one spent Warden seal. `wave` is also the number of seals the
  // player must have broken, so no separate table can drift out of sync.
  if (wave > 0 && earnedDamage >= wave * windowDamage) return true;
  // A build which erases the current answer has demonstrated the same need
  // for escalation even if it happened to aim at support before the Warden.
  // This only advances the next authored packet; it never creates a body or
  // skips the caller-owned cadence/cap.
  return wave > 0 && powerBand > 0 && clearEmaMs > 0 &&
    supportThreats <= 0 && queuedSupport <= 0;
}

export function finaleEarnedClear({
  defendElapsedMs, minEarnedMs, wave, packetCount, wardenBroken,
  supportThreats, queuedSupport = 0,
}) {
  return defendElapsedMs >= minEarnedMs && wave >= packetCount &&
    !!wardenBroken && supportThreats <= 0 && queuedSupport <= 0;
}

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

/* Demonstrated-power score for the summit. No weapon tier or rolled trait is
   consulted: Meridian reacts only to observed clear cadence, real kills, and
   damage already dealt to visible Warden seals. */
export function finalePowerBand({
  clearEmaMs = 0, kills = 0, earnedDamage = 0, defendElapsedMs = 0,
}) {
  const seconds = Math.max(0.75, defendElapsedMs / 1000);
  const clear = Number(clearEmaMs) || 0;
  const killRate = Math.max(0, Number(kills) || 0) / seconds;
  const damageRate = Math.max(0, Number(earnedDamage) || 0) / seconds;
  let band = 0;
  if ((clear > 0 && clear <= 1650) || killRate >= 0.42 || damageRate >= 4.5) band++;
  if ((clear > 0 && clear <= 1050) || killRate >= 0.72 || damageRate >= 7.5) band++;
  if ((clear > 0 && clear <= 650) || killRate >= 1.05 || damageRate >= 11.0) band++;
  return clamp(band, 0, 3);
}

/* Exactly one support-spawn decision per update. The live runtime owns safe
   positions and the actual queue; this pure boundary owns only pressure and
   makes the no-flood/no-dead-air contract falsifiable in isolation. */
export function finalePressurePlan({
  nowMs = 0, liveSupport = 0, queuedSupport = 0, powerBand = 0,
  lastSpawnAtMs = -1e9, emptySinceMs = -1, adaptiveSpawned = 0,
  adaptiveCap = 0, allowAdaptive = true,
}, tune) {
  const band = clamp(powerBand | 0, 0, 3);
  const cap = Math.max(1, tune.maxSupport | 0);
  const live = clamp(liveSupport | 0, 0, cap);
  const queued = Math.max(0, queuedSupport | 0);
  const target = clamp(tune.targetSupport[band] | 0, 1, cap);
  const sinceSpawn = Math.max(0, nowMs - lastSpawnAtMs);
  const spawnGapMs = Math.max(0, tune.spawnGapMs[band] || 0);
  const refillDelayMs = Math.max(0, tune.refillDelayMs[band] || 0);
  const queueReady = queued > 0 && live < cap && live < target &&
    sinceSpawn >= spawnGapMs;
  const emptyForMs = emptySinceMs >= 0 ? Math.max(0, nowMs - emptySinceMs) : 0;
  const refillReady = allowAdaptive && queued <= 0 && live <= 0 &&
    adaptiveSpawned < adaptiveCap && emptySinceMs >= 0 &&
    emptyForMs >= refillDelayMs && sinceSpawn >= spawnGapMs;
  return {
    spawn: queueReady ? 'queued' : refillReady ? 'adaptive' : '',
    band,
    cap,
    target,
    refillDelayMs,
  };
}

export function finaleStage({ phase = 'dormant', wave = 0, wardenBroken = false }) {
  if (phase === 'arming') return 'interlock';
  if (phase === 'defend') {
    if (wardenBroken) return 'release';
    if (wave <= 1) return 'intercept';
    if (wave === 2) return 'contain';
    return 'scuttle';
  }
  if (phase === 'transmit') return 'uplink';
  if (phase === 'answer') return 'answer';
  if (phase === 'complete') return 'complete';
  return 'dormant';
}
