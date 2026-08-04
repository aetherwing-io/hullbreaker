/* =========================== LADDERS ============================= */
/* Renderer-free ladder decisions for the normal six-face climb. The
   generator owns where a rail exists; this module owns the deliberately
   small contact volume and the fast, optional movement it grants. Nothing
   here knows about THREE, input events, or mutable simulation state. */

// Twelve tiles per second is intentionally faster than RIG's 9.4 t/s run:
// a ladder changes lanes without becoming a pause in an accelerating game.
// The rail contact is only a little wider than RIG's 0.7-tile body, so an
// Up/Down press elsewhere remains aim/crouch rather than a magnetic grab.
export const LADDER_TUNE = Object.freeze({
  grabHalfWidth: 0.48,
  bottomEntryPad: 0.18,
  topEntryPad: 0.28,
  climbSpeed: 12,
  jumpX: 9.4,
  jumpY: 11.8,
  topExitSpeed: 8.2,
  bottomExitSpeed: -1.2,
  endpointEpsilon: 0.015,
});

function validLadder(row) {
  return row && Number.isFinite(row.x) && Number.isFinite(row.y0) &&
    Number.isFinite(row.y1) && row.y1 > row.y0;
}

// Pick only a rail the body actually overlaps. Direction is explicit so a
// neutral aim never grabs and a down press above the top landing can enter.
// Ties are deterministic: nearest x, then stable schema id.
export function ladderCandidate(ladders, state, direction, tune = LADDER_TUNE) {
  if (!direction || !Array.isArray(ladders) || !ladders.length) return null;
  let best = null;
  let bestDx = Infinity;
  for (const row of ladders) {
    if (!validLadder(row)) continue;
    const dx = Math.abs(state.x - row.x);
    if (dx > tune.grabHalfWidth) continue;
    const bodyBottom = state.y;
    // Endpoints describe foot-height surfaces, so entry is keyed to the feet,
    // not "any part of a 1.7-tile body overlaps." The latter magnetized RIG
    // upward from almost a full body below a ladder and skipped the approach.
    if (bodyBottom < row.y0 - tune.bottomEntryPad ||
        bodyBottom > row.y1 + tune.topEntryPad) continue;
    // Up cannot magnetize RIG from above the landing; down cannot catch a
    // rail after falling entirely below it.
    if (direction > 0 && bodyBottom > row.y1 + tune.endpointEpsilon) continue;
    if (direction < 0 && bodyBottom < row.y0 - tune.endpointEpsilon) continue;
    if (dx < bestDx - 1e-9 ||
        (Math.abs(dx - bestDx) <= 1e-9 && String(row.id) < String(best?.id))) {
      best = row;
      bestDx = dx;
    }
  }
  return best;
}

// One fixed-step decision while attached. `y` is RIG's logical foot height,
// matching platform and ladder endpoints. The runtime owns the state write;
// this function returns a complete, allocation-small action description.
export function ladderStep(state, tune = LADDER_TUNE) {
  const row = state.ladder;
  if (!validLadder(row)) return { kind: 'release', vy: 0 };

  if (state.jumpBuffered) {
    const away = Math.sign(state.hInput || state.facing || 1) || 1;
    return { kind: 'jump', vx: away * tune.jumpX, vy: tune.jumpY };
  }

  const direction = Math.sign(state.vInput || 0);
  if (direction > 0 && state.y >= row.y1 - tune.endpointEpsilon) {
    return { kind: 'top-exit', y: row.y1 + 0.001, vx: tune.topExitSpeed, vy: 0 };
  }
  if (direction < 0 && state.y <= row.y0 + tune.endpointEpsilon) {
    return { kind: 'bottom-exit', y: row.y0 - 0.025, vx: 0, vy: tune.bottomExitSpeed };
  }

  const nextY = Math.max(row.y0, Math.min(row.y1,
    state.y + direction * tune.climbSpeed * Math.max(0, state.dt)));
  // Crossing an endpoint exits on this same frame; RIG never spends a dead
  // update parked at the top after the player has already climbed there.
  if (direction > 0 && nextY >= row.y1 - tune.endpointEpsilon) {
    return { kind: 'top-exit', y: row.y1 + 0.001, vx: tune.topExitSpeed, vy: 0 };
  }
  if (direction < 0 && nextY <= row.y0 + tune.endpointEpsilon) {
    return { kind: 'bottom-exit', y: row.y0 - 0.025, vx: 0, vy: tune.bottomExitSpeed };
  }
  return {
    kind: 'climb',
    x: row.x,
    y: nextY,
    vx: 0,
    vy: direction * tune.climbSpeed,
  };
}
