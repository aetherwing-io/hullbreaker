/* ============================ WAVES =============================== */
/* Pure choreography math for wave gates and the corner ritual: the
   yaw-snap timeline, the scroll resume curve, the joint rules, and (T-201)
   the rolling encounter that replaced the held gate as the default.
   All timings are event-local ms (t = gameMs - tStart).

   The brick-slam zipper (zipperOffset) was deleted under decisions.md entry
   25 with the rest of the zip-assembly corner; its choreography is recoverable
   from git at bb8e4df for a lane that builds traps or emplacements. */

// Start the defense score while the route is still moving. Eighteen tiles is
// roughly four seconds at the pursuit floor: enough room to fight across the
// authored ladders and split routes instead of reaching a clamp, deleting a
// tiny room, then waiting for its final flyer. This is pure encounter
// choreography rather than a tunable stat multiplier.
export const GATE_PRELUDE_TILES = 18;

// A cohort is visible and shootable as soon as each body finishes its ordinary
// materialization, but its attack state machine waits this additional local
// beat. Rotating a three-step score prevents a whole formation from entering
// its warning pose together while retaining the roster's existing tell windows.
export const GATE_ATTACK_READY_MS = Object.freeze([0, 180, 420]);

export function gatePreludeS(haltS) {
  return haltS - GATE_PRELUDE_TILES;
}

export function gatePreludeReady(state, primed, scroll, haltS) {
  return state === 'idle' && !primed && scroll >= gatePreludeS(haltS) - 1e-6;
}

export function gateAttackReadyDelay(slot) {
  const i = Math.max(0, slot | 0) % GATE_ATTACK_READY_MS.length;
  return GATE_ATTACK_READY_MS[i];
}

/* The gate HUD describes what the player can currently see and answer, not
 * every body allocated to a multi-beat encounter. A row owns the current
 * beat once its ordinary depth-condensation begins; later resident rows stay
 * out of the count until their own entrance window opens. `gating` is
 * deliberately irrelevant here: a Railfang teaching beat is still the live
 * threat even when later mobile bodies own the eventual gate clear. */
export function activeGateThreatCount(rows, encounterKey, nowMs, enterMs) {
  if (!Array.isArray(rows) || !encounterKey || !Number.isFinite(nowMs) ||
      !Number.isFinite(enterMs) || enterMs < 0) return 0;
  let count = 0;
  for (const row of rows) {
    if (!row || row.encounterKey !== encounterKey || row.gateBreakExit ||
        !Number.isFinite(row.enterUntil)) continue;
    if (nowMs >= row.enterUntil - enterMs) count++;
  }
  return count;
}

/* T-102: what still holds a shut gate, in the player's terms. The beat count
 * above is what is on screen; `gatingLeft` is what the turn actually waits
 * for. Multi-beat encounters park later holders (level1EcologyEncounterDelay),
 * so "one visible body" was usually NOT the last: measured on the shipped run,
 * 149 of gate 3's 158 "LAST SIGNAL" frames still had up to three gating
 * bodies queued behind them. */
export function gateRequirement(rows, encounterKey, nowMs, enterMs) {
  const out = { present: 0, gatingPresent: 0, gatingQueued: 0, gatingLeft: 0 };
  if (!Array.isArray(rows) || !encounterKey || !Number.isFinite(nowMs) ||
      !Number.isFinite(enterMs) || enterMs < 0) return out;
  for (const row of rows) {
    if (!row || row.encounterKey !== encounterKey || row.gateBreakExit ||
        !Number.isFinite(row.enterUntil)) continue;
    const present = nowMs >= row.enterUntil - enterMs;
    if (present) out.present++;
    if (!row.gating) continue;
    out.gatingLeft++;
    if (present) out.gatingPresent++;
    else out.gatingQueued++;
  }
  return out;
}

// "LAST SIGNAL" only when one more kill opens the gate; queued holders are
// announced instead of hidden behind the current beat.
export function gateRequirementText(need) {
  if (need.gatingLeft === 1 && need.gatingPresent === 1) return 'LAST SIGNAL · CLOSING';
  const now = need.present === 1 ? '1 HOSTILE' : `${need.present} HOSTILES`;
  if (need.gatingQueued > 0)
    return need.present > 0 ? `${now} · +${need.gatingQueued} INBOUND` : `+${need.gatingQueued} INBOUND`;
  return now;
}

export function waveSize(k, cfg) { return cfg.waves.baseSize + cfg.waves.sizePerWave * k; }

export function waveLane(k, i, cfg) {                   // per-wave altitude composition
  const comp = cfg.waves.comp[k - 1];
  return cfg.waves.laneHeights[comp[i % comp.length]];
}

// The six-face run used to leave kind blank here, which made every one of
// its 39 gate slots silently fall back to `wasp`. Keeping the roster in the
// same pure choreography table as altitude makes each story phase authored
// and lets headless callers inspect it without importing the simulation.
export function waveKind(k, i, cfg) {
  const roster = cfg.waves.roster && cfg.waves.roster[k - 1];
  return roster && roster.length ? roster[i % roster.length] : 'wasp';
}

// Authored materialization score. The fallback preserves the original simple
// stagger contract for fixtures or stripped-down configs that do not carry it.
export function waveSpawnDelay(k, i, cfg) {
  const score = cfg.waves.spawnDelaysMs && cfg.waves.spawnDelaysMs[k - 1];
  return score && score[i] !== undefined ? score[i] : i * cfg.waves.staggerMs;
}

export function wavePhase(k, cfg) {
  return (cfg.waves.phases && cfg.waves.phases[k - 1]) || ('WAVE ' + k);
}

export function easeOutBack(u, s) {
  const v = u - 1;
  return 1 + (s + 1) * v * v * v + s * v * v;
}

export function cornerTimeline(cfg) {
  const W = cfg.waves;
  const t1 = W.windUpMs;                         // wind-up ends
  const t2 = t1 + W.snap1Ms;                     // snap 1 impact frame
  const t3 = t2 + W.holdMs;                      // ratchet hold ends
  const t4 = t3 + W.snap2Ms;                     // snap 2 lands
  const t5 = t4 + W.settleMs;                    // settle ends, scroll resumes
  const t6 = t5 + W.resumeMs;                    // event done
  return { t1, t2, t3, t4, t5, t6 };
}

export function cornerEventTotalMs(cfg) { return cornerTimeline(cfg).t6; }

// camera yaw delta (degrees) over the event: 0 → -1.5 → 30 → hold → 60
export function cornerYawDeltaDeg(tMs, cfg) {
  const W = cfg.waves;
  const T = cornerTimeline(cfg);
  const snap = cfg.path.turnDeg;                 // per-snap magnitude (30)
  if (tMs <= 0) return 0;
  if (tMs < T.t1) { const u = tMs / W.windUpMs; return W.windUpDeg * u * u; }
  if (tMs < T.t2) { const u = (tMs - T.t1) / W.snap1Ms; return W.windUpDeg + (snap - W.windUpDeg) * easeOutBack(u, W.backS); }
  if (tMs < T.t3) return snap;
  if (tMs < T.t4) { const u = (tMs - T.t3) / W.snap2Ms; return snap + snap * easeOutBack(u, W.backS); }
  return snap * 2;
}

// scroll velocity during the event: frozen, then quadratic ease back in
export function cornerScrollVel(tMs, cfg) {
  const T = cornerTimeline(cfg);
  if (tMs < T.t5) return 0;
  const u = Math.min(1, (tMs - T.t5) / cfg.waves.resumeMs);
  return cfg.scrollSpeed * u * u;
}

/* The camera ritual may only take ownership of the arriving facet after RIG
 * physically reaches the middle of the chamfer. `approach` is the cleared,
 * held arena state: it opens the route to the joint but cannot begin the turn
 * on elapsed time alone. During `turning` the joint is a one-body-wide lock;
 * this keeps RIG on the surface both camera detents share without teleporting
 * them out of the arena. The completed joint then becomes a one-way seal.
 *
 * Coordinates are expressed as player edges because sim/player.js already
 * composes its camera and transformation constraints in those terms. */
export function cornerJointRule(state, cornerS, bendS, playerHalfWidth, edgeMargin,
    flowOpen = false) {
  const atJoint = state === 'approach' || state === 'turning';
  return {
    turnReadyX: state === 'approach' ? bendS : Infinity,
    // T-201 `?hinge=flow` (unjudged A/B, T-102 R4): once the camera has
    // handed ownership to the arriving facet, the turning joint stops being a
    // one-body lock and RIG may keep running onto the facet the camera now
    // owns. The seal below is unchanged: there is still no retreat.
    frontierRight: state === 'turning' && flowOpen
      ? Infinity
      : atJoint
        ? bendS + playerHalfWidth
        : cornerS + 1 - edgeMargin,
    sealLeft: state === 'turning' || state === 'done'
      ? bendS - playerHalfWidth
      : -Infinity,
    jointOwned: state === 'turning',
  };
}

export function cornerApproachReady(state, playerX, bendS) {
  return state === 'approach' && playerX >= bendS - 1e-6;
}

/* A held gate normally freezes the pursuit plane at HALT_S. Once the gate is
 * clear, however, RIG must physically reach the chamfer midpoint before the
 * turn can own them. Narrow/tall viewports can put that midpoint just beyond
 * their frozen right clamp. Advance the plane only far enough that the
 * player's right edge can reach the joint while remaining on-screen; wide
 * views already satisfy the equation and keep the original halt exactly. */
export function cornerApproachScrollTarget(
    state, haltS, bendS, rightEdgeOffset, edgeMargin, playerHalfWidth) {
  if (state !== 'approach') return haltS;
  const jointVisibleScroll = bendS + playerHalfWidth + edgeMargin - rightEdgeOffset;
  return Math.max(haltS, jointVisibleScroll);
}

/* ------------------------- corner hand-off ------------------------- *
 * The camera hands fold ownership to the arriving facet when the ritual's
 * yaw has covered FOLD_HANDOFF_PROGRESS of the corner (src/render/camera.js
 * declares the same 0.96; tools/pathcheck/t-201-race-pass.mjs reads both and
 * fails if they drift). The sim needs the instant only for `?hinge=flow`:
 * RIG may leave the hinge exactly when the facet ahead of them starts being
 * drawn, never before.                                                    */
export const FOLD_HANDOFF_PROGRESS = 0.96;

// First integer ms of the ritual whose yaw has reached `progress` of the turn.
export function cornerHandoffMs(cfg, progress = FOLD_HANDOFF_PROGRESS) {
  const total = cornerEventTotalMs(cfg);
  const full = 2 * cfg.path.turnDeg;
  for (let t = 0; t <= total; t++)
    if (cornerYawDeltaDeg(t, cfg) / full >= progress) return t;
  return total;
}

/* ========================= ROLLING ENCOUNTERS ========================= *
 * T-201 (decisions.md entry 23 #2; the defaults are the integrator call in
 * entry 25's addendum). Operator: "The turn never waits; survivors chase you
 * onto the next side, so skipping fights costs you pressure instead of time."
 *
 * The default six-face corner no longer holds the climb. A side's encounter
 * plays teach -> test -> remix ON THE MOVE: its beats are released by
 * proximity (RIG passing the beat's line on the route, once the beat's rooted
 * bodies can stand on their reviewed sockets inside the view), by a clear (the
 * previous beat is dead), or by a bounded clock — never by the 300 s beat lock.
 * The corner arms at its halt as before and opens the joint at once, whatever
 * is alive; the turn fires when RIG reaches the bend. Up to `carryMax` of the
 * side's mobile bodies — survivors first, then mobile slots the racer outran —
 * follow RIG round the limb and re-enter on the arriving facet (the price is
 * pressure, entry 12). `?gates=legacy` keeps the held gate exactly.
 *
 * Every number below is encounter choreography (the same category as
 * GATE_PRELUDE_TILES and GATE_ATTACK_READY_MS above), not a movement constant.
 * Unjudged as feel: the operator plays the A/B (`?gates=legacy`).           */
export const ROLLING_GATES = Object.freeze({
  // Beat j's proximity line sits (beats - 1 - j) x beatSpacingTiles + tailTiles
  // before the joint: a racer at run speed meets a new beat every ~1.6 s and
  // the last one ~1.7 s before the turn, so the whole score can play out while
  // the race goes on.
  beatSpacingTiles: 15,
  tailTiles: 16,
  // The teach body owns the screen alone for at least this long (an entrance
  // tell is 900 ms) unless the player clears it first.
  beatMinGapMs: 1500,
  // The stated bound: no beat waits longer than this for the one before it,
  // cleared or not (survivors stay).
  beatBoundMs: 6000,
  // A beat the player clears early hands over after one short breath.
  clearBreathMs: 300,
  // Staging band, in route tiles against the LIVE view: at least
  // stagePlaneTiles inside the damage plane once the body is shootable (the
  // plane's advance over the entrance is added), stageEdgeTiles inside the
  // right edge, short of the corner pivot like the gate patrol box, and
  // displaced peers spread stageSpacingTiles apart.
  stagePlaneTiles: 6,
  stageEdgeTiles: 1.5,
  stagePivotTiles: 1.5,
  stageSpacingTiles: 1.6,
  // Carry-over: at most carryMax mobile bodies follow RIG round a corner
  // (pillar 5, chaos stays readable). They re-enter once the camera anchor has
  // crossed the bend (render/camera.js anchors the view at the scroll, so until
  // then the arriving facet is drawn skewed and the sim's strip is not the
  // frame), carryStaggerMs apart, preferably carryAheadTiles..+carryWindowTiles
  // ahead of RIG, each with an ordinary entrance tell. One that finds no room
  // within carryTimeoutMs is dropped and counted.
  carryMax: 4,
  carryStaggerMs: 150,
  carryAheadTiles: 4,
  carryWindowTiles: 10,
  carryTimeoutMs: 4000,
});

// The route x of beat `beat`'s proximity line (RIG's front crosses it).
export function rollingBeatLine(jointFront, beats, beat, R = ROLLING_GATES) {
  const last = Math.max(0, (beats | 0) - 1);
  const b = Math.max(0, Math.min(last, beat | 0));
  return jointFront - R.tailTiles - (last - b) * R.beatSpacingTiles;
}

/* Is the next beat due? Returns why ('proximity' | 'prelude' | 'clear' |
 * 'bound') or null. s = { beat, beats, nowMs, lastReleaseMs, prevClearedAtMs
 * (null while any body of the previous beat survives), rigFront, lineX,
 * rootedVisible (every rooted body of the beat has its socket inside the
 * staging band), preludeReady (today's scroll prelude rule), frameTrusted
 * (the camera anchor is on the current facet) }.                          */
export function rollingBeatDue(s, R = ROLLING_GATES) {
  if (!s || !(s.beat < s.beats) || !s.frameTrusted) return null;
  const near = s.rigFront >= s.lineX && !!s.rootedVisible;
  if (s.beat === 0) {
    if (near) return 'proximity';
    return s.preludeReady ? 'prelude' : null;
  }
  const since = s.nowMs - s.lastReleaseMs;
  if (Number.isFinite(s.prevClearedAtMs) && s.nowMs - s.prevClearedAtMs >= R.clearBreathMs)
    return 'clear';
  if (since >= R.beatBoundMs) return 'bound';
  if (near && since >= R.beatMinGapMs) return 'proximity';
  return null;
}

/* The band of route s a released body may condense in. `planeAdvanceTiles`
 * is how far the damage plane will travel while the body condenses, so the
 * stagePlaneTiles margin still holds when it becomes shootable.            */
export function rollingStageBand(left, right, pivotS, planeAdvanceTiles = 0, R = ROLLING_GATES,
    out = { lo: 0, hi: 0 }) {
  const hi = Math.min(right - R.stageEdgeTiles, pivotS - R.stagePivotTiles);
  let lo = left + R.stagePlaneTiles + Math.max(0, planeAdvanceTiles || 0);
  if (hi - lo < 1) lo = Math.max(left + 0.5, hi - 1);
  out.lo = lo;
  out.hi = hi;
  return out;
}

// An authored socket inside the band is used verbatim; one outside it is
// pulled to the nearest band edge, and successive displaced bodies are spread
// inward so they never stack on one point.
export function rollingStageX(targetX, band, displacedIndex = 0, R = ROLLING_GATES) {
  if (targetX >= band.lo && targetX <= band.hi) return targetX;
  const step = R.stageSpacingTiles * Math.max(0, displacedIndex | 0);
  if (targetX > band.hi) return Math.max(band.lo, band.hi - step);
  return Math.min(band.hi, band.lo + step);
}

/* Carry priority at the turn (lower first; Infinity = does not follow). The
 * side's ENCOUNTER follows, nothing else: its own survivors (gating bodies
 * first), then mobile slots of beats the racer outran (they were on their way;
 * CARRY_RANK_UNRELEASED, ranked by the caller), then bodies already following
 * from an earlier corner. Rooted kinds and carriers never follow, and the
 * ambient stream is retired at the turn exactly as the held gate retires it
 * at the halt.                                                             */
export const CARRY_KINDS = Object.freeze({ wasp: true, hound: true });
export const CARRY_RANK_UNRELEASED = 2;
export function rollingCarryRank(row, encounterKey) {
  if (!row || !CARRY_KINDS[row.kind] || row.gateBreakExit) return Infinity;
  if (Number.isFinite(row.pursuitFrom)) return 3;       // already following from an earlier corner
  if (row.encounterKey === encounterKey) return row.gating ? 0 : 1;
  return Infinity;                                      // the ambient stream
}

/* The encounter line, in the player's terms, with no held gate. Every
 * string fits ROLLING_TEXT_MAX characters (T-102's playtest measured the slot
 * truncating; the phone shell sizes it for ~28). s = { k, faces, phase,
 * nextPhase, primed, live, pending, following, cleared, turning, greeting }:
 * live = the side's bodies on screen now, pending = its slots not yet
 * released, following = bodies that followed RIG round the last corner.   */
export const ROLLING_TEXT_MAX = 28;
export function rollingEncounterText(s) {
  const n = (v) => Math.max(0, Math.min(99, v | 0));
  if (s.turning) {
    const last = s.k >= s.faces;
    if (!last && n(s.following) > 0) return `${n(s.following)} FOLLOWING → ${s.nextPhase}`;
    if (s.cleared) return last ? 'CROWN ACCESS OPEN' : `${s.phase} BROKEN`;
    return last ? 'CROWN AHEAD' : `${s.nextPhase} AHEAD`;
  }
  const live = n(s.live) + n(s.following);
  if (!s.primed) {
    if (n(s.following) > 0) return `${s.phase} · ${n(s.following)} FOLLOWING`;
    const wave = `WAVE ${s.k}/${s.faces} · ${s.phase}`;
    // The opening greeting only where it fits (it is OBSERVE's, on face 1).
    return s.greeting && wave.length + 10 <= ROLLING_TEXT_MAX ? wave + ' · CONTACT' : wave;
  }
  if (live > 0) {
    return `${s.phase} · ${live} HOSTILE${live === 1 ? '' : 'S'}` +
      (n(s.pending) > 0 ? ` +${n(s.pending)}` : '');
  }
  if (n(s.pending) > 0) return `${s.phase} · +${n(s.pending)} INBOUND`;
  return `${s.phase} BROKEN · CLIMB →`;
}
