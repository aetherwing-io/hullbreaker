/* ============================ WAVES =============================== */
/* Pure choreography math for wave gates and the corner ritual: the
   yaw-snap timeline, the scroll resume curve, and the brick zipper.
   All timings are event-local ms (t = gameMs - tStart). */

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

// brick-slam zipper: column j (0-based within the slam set) drops from
// zipDropTiles above with gravity ease, dips one beat, then locks.
export function zipperOffset(tMs, colIdx, cfg) {
  const W = cfg.waves;
  const local = tMs - (W.zipStartMs + colIdx * W.zipPerColMs);
  if (local < 0) return { phase: 'hidden', dy: 0 };
  if (local < W.zipDropMs) {
    const u = local / W.zipDropMs;
    return { phase: 'drop', dy: W.zipDropTiles * (1 - u * u) };
  }
  if (local < W.zipDropMs + W.zipDipMs) return { phase: 'dip', dy: -W.zipDipTiles };
  return { phase: 'locked', dy: 0 };
}
