/* ============================== HOOK ============================== */
/* SNAP HOOK — the pure half of the tether verb (DESIGN's "context-sensitive
   launch toward clearly marked anchors with minimal aiming interruption").

   Everything here is deterministic geometry over authored anchor data: which
   anchor a position may grab, whether the tether line is clear, how far a
   substepped zip travels in one frame, and the whip velocity that ends it.
   No sim state, no rng, no DOM — the runtime (src/sim/hook.js) owns the state
   machine and the harness asserts these functions directly.

   The acquisition contract, in one place, because it is the design:
     1. ASSISTED, never free-aim. The player never points at an anchor; the
        game picks the single best one inside the anchor's own authored
        approach arc. Pressing the key is the whole input.
     2. NEVER BACKWARD. An anchor accepts approaches from behind and below
        (its `arc`), so a grab always converts into forward progress. The
        `behindTiles` gate stops a player from hooking something they have
        already run past.
     3. NEVER THROUGH ROCK. The tether line is sampled against the same
        isSolid the player collides with, so a hook is exactly as honest as
        the geometry looks.
     4. NEVER A STOP. Range has a floor (`minRange`): you cannot grab the
        thing you are standing under, so the verb can't become a pause.     */

const DEG_PER_RAD = 180 / Math.PI;

// Direction from the anchor to the player, in degrees [0, 360). The authored
// arc is expressed in this frame ("who may grab me, from where"), which reads
// naturally as level data: 270 = straight below, 180 = directly behind.
export function hookApproachDeg(anchor, px, py) {
  const d = Math.atan2(py - anchor.y, px - anchor.x) * DEG_PER_RAD;
  return d < 0 ? d + 360 : d;
}

export function hookArcAccepts(anchor, px, py) {
  const center = anchor.arc[0], half = anchor.arc[1];
  let diff = Math.abs(hookApproachDeg(anchor, px, py) - center) % 360;
  if (diff > 180) diff = 360 - diff;
  return diff <= half;
}

// Sampled line of sight along the tether. Coarse on purpose: the sample step
// is a tuning constant the harness asserts against the thinnest authored wall,
// so the check can never step over a one-tile chimney wall.
export function hookLineClear(x0, y0, x1, y1, isSolid, stepTiles) {
  const dx = x1 - x0, dy = y1 - y0;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / stepTiles));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (isSolid(Math.floor(x0 + dx * t), Math.floor(y0 + dy * t))) return false;
  }
  return true;
}

// The body position a grab pins the player to: the hand reaches the anchor.
export function hookHoldPoint(anchor, cfg) {
  return { x: anchor.x, y: anchor.y - cfg.handHeight };
}

/* Pick the anchor a state may grab, or null. `state` carries only values the
   caller already has:
     { x, y, hw, h, facing, now, lockedId, lockedUntil }
   Cost is distance, penalized for anchors that sit behind the player, so the
   choice is "the nearest thing ahead" — predictable without aiming. Ties break
   on authored order, so acquisition is reproducible frame to frame.        */
export function hookAcquire(anchors, state, cfg, isSolid) {
  if (!anchors || !anchors.length) return null;
  const handX = state.x;
  const handY = state.y + cfg.handHeight;
  let best = null, bestCost = Infinity;
  for (const a of anchors) {
    if (a.id === state.lockedId && state.now < state.lockedUntil) continue;
    const dx = a.x - handX, dy = a.y - handY;
    const dist = Math.hypot(dx, dy);
    if (dist > cfg.range || dist < cfg.minRange) continue;
    if (dx * (state.facing || 1) < -cfg.behindTiles) continue;
    if (!hookArcAccepts(a, handX, handY)) continue;
    if (!hookLineClear(handX, handY, a.x, a.y, isSolid, cfg.losStepTiles)) continue;
    const cost = dist * (dx >= 0 ? 1 : cfg.behindPenalty);
    if (cost < bestCost) { bestCost = cost; best = a; }
  }
  return best ? { anchor: best, dist: Math.hypot(best.x - handX, best.y - handY) } : null;
}

/* One frame of tether travel, substepped so a 20+ tile/s zip cannot cross a
   wall the endpoint-only player collision would miss. `fits(x, y)` is the
   caller's body-vs-solid test; the march stops at the last position that fit
   and reports it, so a clipped zip becomes a launch instead of a stick.    */
export function hookZipMarch(from, to, speed, dt, substepTiles, fits) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const remaining = Math.hypot(dx, dy);
  if (remaining <= 1e-6) return { x: to.x, y: to.y, arrived: true, blocked: false, traveled: 0 };
  const travel = Math.min(remaining, speed * dt);
  const steps = Math.max(1, Math.ceil(travel / substepTiles));
  const ux = dx / remaining, uy = dy / remaining;
  let x = from.x, y = from.y, moved = 0;
  for (let i = 1; i <= steps; i++) {
    const d = (travel * i) / steps;
    const nx = from.x + ux * d, ny = from.y + uy * d;
    if (!fits(nx, ny)) return { x, y, arrived: false, blocked: true, traveled: moved };
    x = nx; y = ny; moved = d;
  }
  return { x, y, arrived: travel >= remaining - 1e-6, blocked: false, traveled: moved };
}

// The whip: a grab becomes a launch, forward-only, entry speed preserved the
// same way a ledge launch preserves it. `mult` is the momentum chain's
// amplification; it is applied to the FORWARD component only, so the
// endpoint-only ceiling check in sim/player.js keeps its full budget. The
// forward speed is then clamped to cfg.launchCeiling — preserving entry speed
// makes chained launches compound, and the dt-clamp collision budget needs a
// bound that no chain length can cross.
export function hookWhipVelocity(cfg, dir, entrySpeed, mult) {
  const speed = Math.min(
    cfg.launchCeiling,
    Math.max(cfg.launchX, Math.abs(entrySpeed || 0)) * (mult || 1),
  );
  return { vx: (dir || 1) * speed, vy: cfg.launchY };
}

// Sign of forward travel through the anchor: the side the player grabbed from,
// or their facing when the anchor is straight overhead.
export function hookWhipDir(anchor, fromX, facing) {
  const dx = anchor.x - fromX;
  if (Math.abs(dx) < 0.35) return facing || 1;
  return dx > 0 ? 1 : -1;
}

// A pure reachability oracle for the harness and for authoring: can this
// position grab this anchor at all? Same predicate the runtime uses, minus
// the per-run lock.
export function hookAnchorReachableFrom(anchor, px, py, cfg, isSolid, facing = 1) {
  const got = hookAcquire([anchor], {
    x: px, y: py, facing, now: 0, lockedId: null, lockedUntil: 0,
  }, cfg, isSolid);
  return !!got;
}
