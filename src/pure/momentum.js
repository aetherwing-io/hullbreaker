/* ============================ MOMENTUM ============================ *
 * Earned pace escalation — the pure half of decisions.md entry 11:
 *
 *   "pace should escalate across the faces, but at the player's momentum.
 *    a good player escalates the action to intense levels of explosion and
 *    speed, a new player is pushed along while they learn the mechanics."
 *
 * The physics already pays for this and T-020 measured it: RIG runs at
 * CONFIG.player.runSpeed (9.4 t/s) while the world scrolls at
 * CONFIG.scrollSpeed (4.3 t/s), so moving forward BANKS daylight — until the
 * screen's right clamp catches him, at which point his ground speed IS the
 * scroll speed and the bank is at its maximum. That is the whole signal:
 * where RIG sits between the pursuing damage plane (screen left) and the
 * clamp (screen right). Riding the right of the screen means outrunning the
 * world; being shoved toward the left means the world is dragging you along.
 *
 * Three properties this module exists to make provable, not to argue for:
 *
 *   FLOOR    — drive 0 returns EXACTLY CONFIG.scrollSpeed, and a player being
 *              pushed toward the plane banks nothing (momentumBank's
 *              deadband), so the DAYLIGHT term of a struggling run is zero and
 *              falling behind cannot compound into a death spiral. The floor
 *              is a floor, not a cap: the combat term is independent, so a
 *              player with no daylight who keeps killing still earns up to
 *              cfg.wCombat of the range (×1.12 at the shipped numbers) — that
 *              is the bound, and it is asserted. Damage sheds drive on the
 *              frame it lands (momentumOnDamage), a life clears it outright
 *              (sim/pace.js), and the mercy window forbids re-earning for a
 *              beat.
 *   CEILING   — escalation's own top is cfg.ceilMult; the ABSOLUTE top any
 *              source may reach (T-023's boosts included) is cfg.hardCeilMult,
 *              applied by momentumClampSpeed. The gap between them is the
 *              headroom entry 11 asked this task to leave.
 *   EARNED    — every input is player state (screen position, kills, damage).
 *              There is no elapsed-run-time term and no face index anywhere in
 *              this file: two players on the same face at the same second get
 *              different pace if they are playing differently, which is the
 *              entire point of the verdict.
 *
 * Everything here is a pure function of its arguments — no clock, no rng, no
 * module state — so the sim owns the drive value and the harness can assert
 * the curve without a browser (tools/pathcheck.mjs, "MOMENTUM").          */

export function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

/* ------------------------- the bank (screen) ------------------------ */

// Where RIG sits across the visible strip: 0 = flush against the pursuing
// damage plane, 1 = pinned to the right clamp. A FRACTION on purpose — the
// strip is 39 tiles wide at ?view=near and 81 at the shipped FAR default
// (docs/playtests/2026-08-first-gap-triage.md §2), so any tile-denominated
// reading of "daylight" would make escalation an aspect-ratio setting.
export function momentumScreenFrac(playerLeft, edgeLeft, edgeRight) {
  const span = edgeRight - edgeLeft;
  if (!(span > 0)) return 0;
  return clamp01((playerLeft - edgeLeft) / span);
}

// The earn ramp over that fraction. Below cfg.bankLo the player is being
// carried rather than outrunning anything and banks NOTHING: that deadband is
// the anti-death-spiral guarantee stated as arithmetic rather than as intent.
export function momentumBank(frac, cfg) {
  if (!(cfg.bankHi > cfg.bankLo)) return 0;
  return clamp01((frac - cfg.bankLo) / (cfg.bankHi - cfg.bankLo));
}

/* ------------------------- the bank (combat) ------------------------ */

// A decaying kill streak, already normalized: each kill adds 1/cfg.killFull,
// and the whole meter bleeds to empty in cfg.killDecaySec of not shooting
// anything. Keeping the fight fed is the second half of "explosion and speed".
export function momentumCombatStep(combat, killsThisStep, dt, cfg) {
  const gained = killsThisStep > 0 ? killsThisStep / cfg.killFull : 0;
  return clamp01(combat + gained - dt / cfg.killDecaySec);
}

/* ---------------------------- the drive ----------------------------- */

// Where the run WANTS to be, given how the player is doing right now.
// Weights are declared in CONFIG and asserted to sum to 1, so this is a
// weighted average and its range is exactly [0, 1].
export function momentumTarget(bank, combat, cfg) {
  return clamp01(cfg.wBank * clamp01(bank) + cfg.wCombat * clamp01(combat));
}

// One frame of approach toward that target.
//   flags.mercy — a hit just landed. Drive may fall but never rise, so the
//                 pressure backs off for a beat instead of piling on.
// Rise is deliberately slower than fall (asserted): escalation is something
// you climb into and something that lets you go quickly.
export function momentumStep(drive, target, dt, cfg, flags) {
  const cur = clamp01(drive);
  let t = clamp01(target);
  if (flags && flags.mercy && t > cur) t = cur;
  const rate = (t > cur ? cfg.risePerSec : cfg.fallPerSec) * dt;
  return clamp01(t > cur ? Math.min(t, cur + rate) : Math.max(t, cur - rate));
}

// While the scroll is HELD — a wave-gate fight, a corner ritual, the level-end
// clamp — the plane is not closing, so screen position stops meaning anything:
// standing still would read as banked daylight and hand anyone who reaches a
// gate the ceiling for free. The bank term therefore holds its last moving
// reading and the COMBAT term keeps working, which is the right answer for a
// gate: what escalates a held arena is clearing it, not standing in it.
export function momentumBankSample(heldBank, frac, held, cfg) {
  return held ? clamp01(heldBank) : momentumBank(frac, cfg);
}

// A hit caps the drive it does not clear: the run answers a mistake by
// backing off, never by escalating into the player who is already losing.
export function momentumOnDamage(drive, cfg) {
  return Math.min(clamp01(drive), cfg.hitDrive);
}

/* ------------------------- what drive buys -------------------------- */

// The pursuing edge's speed at this drive. Linear, so the curve is readable
// from one number: drive 0 is the shipped constant EXACTLY, drive 1 is
// cfg.ceilMult of it.
export function momentumSpeed(drive, baseSpeed, cfg) {
  return baseSpeed * (1 + (cfg.ceilMult - 1) * clamp01(drive));
}

// The absolute top of the pace, whatever produced it. The live six-face path
// already leaves through momentumClampSpeed (sim/pace.js momentumScrollSpeed),
// so this is a chokepoint every source passes rather than a convention a later
// one has to remember: T-023's boosts push their speed through the same
// function, and escalation's own ceiling keeps headroom below it.
export function momentumHardCeiling(baseSpeed, cfg) {
  return baseSpeed * cfg.hardCeilMult;
}
export function momentumClampSpeed(speed, baseSpeed, cfg) {
  const hard = momentumHardCeiling(baseSpeed, cfg);
  return speed > hard ? hard : speed < baseSpeed ? baseSpeed : speed;
}
// Tiles/sec left between escalation's ceiling and the hard ceiling — what a
// later boost may spend without re-tuning this module.
export function momentumHeadroom(baseSpeed, cfg) {
  return momentumHardCeiling(baseSpeed, cfg) - momentumSpeed(1, baseSpeed, cfg);
}

// Ambient spawn cadence rides the same number for free: the spawn table is
// authored in tiles and triggers off the right screen edge, which advances
// with the scroll — so at drive d the same entries arrive exactly this much
// sooner. Stated as a function so the harness asserts the identity instead of
// the report claiming it.
export function momentumSpawnScale(drive, cfg) {
  return momentumSpeed(drive, 1, cfg);
}

// Read a drive back out of a speed — how a bot report recovers escalation from
// the `pursuitSpeed` field the telemetry channel already publishes, with no
// new telemetry surface to keep in sync.
export function momentumDriveFromSpeed(speed, baseSpeed, cfg) {
  if (!(cfg.ceilMult > 1) || !(baseSpeed > 0)) return 0;
  return clamp01((speed / baseSpeed - 1) / (cfg.ceilMult - 1));
}

/* ---------------------------- readouts ------------------------------ */

// Banded drive for the HUD and for telemetry: 0..cfg.tiers.length.
export function momentumTier(drive, cfg) {
  const d = clamp01(drive);
  let tier = 0;
  for (const t of cfg.tiers) if (d >= t) tier++;
  return tier;
}

// The HUD meter, as a string, so its shape is asserted here rather than
// improvised in the render layer.
export function momentumMeter(drive, cfg) {
  const tier = momentumTier(drive, cfg);
  let out = '';
  for (let i = 0; i < cfg.tiers.length; i++) out += i < tier ? '▰' : '▱';
  return out;
}
