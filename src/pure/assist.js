/* ============================= AIM ASSIST ========================= */
/* Fire-time aim correction: given the player's own 8-way heading and the
   live hostile list, nudge the shot toward the best target inside a narrow
   cone, by at most cfg.maxDeg. Pure and allocation-free (writes into `out`),
   so the sim can call it on every trigger pull and the harness can assert
   its bounds.

   The rules that keep this generosity rather than autoplay:
     - it never searches outside cfg.coneDeg of the heading the player chose,
       so it cannot pick a target they were not already pointing at;
     - it never rotates more than cfg.maxDeg, so a miss stays a miss if the
       player's aim was genuinely wrong;
     - it only reads position, so it cannot lead, track, or re-aim in flight
       (that is homing, and homing is a weapon the player has to find);
     - ties break on angle, then distance, then id, so a run stays seeded and
       reproducible.                                                       */

const DEG = Math.PI / 180;

// Signed angle from vector a to vector b, in radians, in (-pi, pi].
function signedAngle(ax, ay, bx, by) {
  return Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
}

export function assistDirection(ax, ay, ox, oy, targets, cfg, out) {
  out = out || { x: ax, y: ay, targetId: 0, adjustedDeg: 0 };
  out.x = ax; out.y = ay; out.targetId = 0; out.adjustedDeg = 0;
  if (!cfg || !targets || targets.length === 0) return out;

  const cone = cfg.coneDeg * DEG;
  const r2 = cfg.range * cfg.range;
  let best = null, bestAbs = cone, bestD2 = Infinity;
  for (const t of targets) {
    const dx = t.x - ox, dy = t.y - oy;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2 || d2 === 0) continue;
    if (ax * dx + ay * dy <= 0) continue;             // never behind the player
    const off = signedAngle(ax, ay, dx, dy);
    const abs = Math.abs(off);
    if (abs > cone) continue;
    // tie-break: smallest angle, then nearest, then lowest id — deterministic
    if (abs < bestAbs - 1e-12 ||
        (Math.abs(abs - bestAbs) <= 1e-12 &&
         (d2 < bestD2 - 1e-12 ||
          (Math.abs(d2 - bestD2) <= 1e-12 && best && t.id < best.t.id)))) {
      best = { t, off };
      bestAbs = abs;
      bestD2 = d2;
    }
  }
  if (!best) return out;

  const cap = cfg.maxDeg * DEG;
  const turn = Math.max(-cap, Math.min(cap, best.off));
  const cos = Math.cos(turn), sin = Math.sin(turn);
  out.x = ax * cos - ay * sin;
  out.y = ax * sin + ay * cos;
  out.targetId = best.t.id || 0;
  out.adjustedDeg = turn / DEG;
  return out;
}

// The reach of a clamped correction: how far above/below the firing line a
// target can be and still be brought into it from `dist` tiles away. The
// harness uses this to tie CONFIG.assist to the houndframe's real geometry.
export function assistVerticalReach(dist, cfg) {
  return dist * Math.tan(cfg.maxDeg * DEG);
}
