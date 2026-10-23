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

/* --------------------------- follow-lead ---------------------------- *
 * T-201/T-202 (docs/proposals/2026-10-race-to-the-top.md §4.2). Measured on
 * the shipped run: a racer pinned against the right clamp saw a median of 5
 * tiles of route ahead (1 in the closer phone frame) and stood ~5-6 s at
 * every closed joint waiting for the scroll. The follow-lead term is the
 * fixtures' follow rule (src/pure/traversal.js traversalFollowTarget) for the
 * six-face run: the pursuing edge advances at least fast enough to keep RIG
 * `lead` tiles from the right edge. It is a FLOOR on the scroll, never a
 * ceiling: a player who never comes within `lead` of the right edge never
 * engages it, so the floor pace (and that player's whole run) is unchanged.
 *
 * `visibleWidth` is the live edge calibration (EDGE_R - EDGE_L), never a
 * typed number: the closer phone frame (T-107) changes it.                 */
export function followLeadTiles(visibleWidth, cfg) {
  const w = Number.isFinite(visibleWidth) && visibleWidth > 0 ? visibleWidth : 0;
  const lead = cfg.leadFrac * w;
  return lead < cfg.leadMinTiles ? cfg.leadMinTiles
    : lead > cfg.leadMaxTiles ? cfg.leadMaxTiles : lead;
}

// The lowest scroll that keeps RIG's front `lead` tiles inside the right edge
// (edgeRight is the right edge's offset from scrollX, sim/edges.js EDGE_R).
export function followScrollFloor(rigFront, edgeRight, lead) {
  return rigFront - (edgeRight - lead);
}

/* The corner blend. The lead alone would bring a racer to a closed joint with
 * the scroll short of the corner's halt (desktop FAR: 9.2 tiles; today's FAR
 * phone frame: 21.6), and render/camera.js anchors the view at the scroll — so
 * the turn would orbit a point 24-37 tiles before the joint instead of today's
 * 15, and right after it RIG would draw 2-4x their size with the arriving
 * facet out of frame (measured with the T-102 camera replica; T-201 report).
 * Inside the approach to an idle corner the scroll therefore also keeps up
 * with this floor, which reaches the halt exactly when RIG's front reaches the
 * joint: the plane gains `cornerBlendRate` tiles on RIG per tile RIG closes.
 * It binds only in the last (lead offset - joint gap) / rate tiles before the
 * joint, and never on a view whose lead already passes the halt (portrait).
 * The corner then arms at its halt the moment RIG arrives — no wait, and the
 * ritual frames the turn exactly as it does today.                        */
export function followCornerFloor(haltS, jointFront, rigFront, cfg) {
  return haltS - (1 + cfg.cornerBlendRate) * (jointFront - rigFront);
}

/* The bank under follow — entry 11's tension, named rather than buried.
 * Entry 11 makes banked daylight the currency of escalation, and T-022 reads
 * it as RIG's fraction of the strip between the damage plane and the right
 * clamp: riding the clamp (frac 0.97-0.99) saturated the bank. Under follow
 * the clamp is never reached — the lead converts the leading ~30 % of the
 * frame from bank into lookahead (desktop's maximum daylight drops from ~72 to
 * ~51 tiles) — so the shipped ramp would cap a racer's bank at ~0.37 and the
 * ceiling would be unreachable by racing. Re-expressed in tiles from the
 * damage plane: `daylight` is RIG's back to the plane, `leadDaylight` the
 * daylight RIG has when the follow line binds (its front on the lead line, or
 * on the corner blend's line when that binds first — the follow frame's new
 * clamp; sim/scroll.js followLineDaylight). Riding the follow line banks
 * fully, exactly as riding the clamp did — through the blend too, so a racer
 * does not shed escalation in the last tiles before every joint because the
 * frame compresses there; anywhere behind it the shipped fraction ramp is used
 * unchanged, so a player who never reaches the lead banks EXACTLY what they
 * banked before (the floor promise) and the carried player's deadband stays a
 * deadband. Without follow (`leadDaylight` = Infinity) this IS the shipped
 * bank, byte for byte. */
export const FOLLOW_BANK_EPS_TILES = 0.05;
export function momentumLeadBank(frac, daylight, leadDaylight, cfg) {
  if (Number.isFinite(leadDaylight) && daylight >= leadDaylight - FOLLOW_BANK_EPS_TILES) return 1;
  return momentumBank(frac, cfg);
}

// The held/moving sample with the follow re-expression (sim/pace.js).
export function momentumLeadBankSample(heldBank, frac, daylight, leadDaylight, held, cfg) {
  return held ? clamp01(heldBank) : momentumLeadBank(frac, daylight, leadDaylight, cfg);
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
