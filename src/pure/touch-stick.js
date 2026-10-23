/* ======================= TOUCH STICK + DECK (pure) ====================== *
 * The deterministic half of the two-thumb touch deck (T-101, decisions.md
 * entry 20). src/ui/touch-controls.js owns the DOM half — pointer events,
 * drawing — and turns everything below into the SAME key edges a keyboard
 * produces (ArrowLeft/Right/Up/Down, Space, KeyX, KeyC), so the game keeps one
 * gameplay-input contract and the sim never learns a thumb was involved.
 *
 * What lives here, and why it is pure:
 *   - the floating stick's dead zone and 8-way sector quantization, both WITH
 *     hysteresis. Chatter between two diagonals is exactly the bug a
 *     hand-rolled angle check ships, and it is only provable headlessly;
 *   - the rim-follow anchor: a drag past the rim drags the stick after the
 *     thumb, so reversing direction never needs a long trip back;
 *   - the deck layout (every target sized from the SHORT screen side, placed
 *     inside the safe-area insets) and the JUMP/FIRE hit test, so tap-target
 *     size, overlap and safe-area containment are assertable at any viewport;
 *   - the scheme / auto-fire resolvers and the auto-fire hold-over step.
 *
 * Conventions: screen pixels with +y DOWN (pointer space). Angles are degrees
 * counter-clockwise from +x with +y UP, so sector 2 ("N") is up the screen.
 * Nothing here allocates on the per-move path: callers pass the state rows.  */

import { CONFIG } from '../config.js';

export const STICK_SECTORS = Object.freeze(['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE']);

// One bit per gameplay code the deck can hold. The order is the edge order the
// UI emits in, and TOUCH_BIT_CODES is the whole vocabulary — a bit the deck
// sets is a key the keyboard also has (GAMEPLAY_KEYMAP in ./frame-input.js).
export const TOUCH_BIT = Object.freeze({
  LEFT: 1, RIGHT: 2, UP: 4, DOWN: 8, JUMP: 16, FIRE: 32, SWAP: 64,
});
export const TOUCH_BIT_CODES = Object.freeze([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyX', 'KeyC',
]);

// sector -> held direction bits, in the keyboard's own terms: NE is exactly
// "ArrowUp + ArrowRight held", the chord a keyboard player uses for 45° aim.
export const STICK_SECTOR_BITS = Object.freeze([
  TOUCH_BIT.RIGHT,
  TOUCH_BIT.RIGHT | TOUCH_BIT.UP,
  TOUCH_BIT.UP,
  TOUCH_BIT.LEFT | TOUCH_BIT.UP,
  TOUCH_BIT.LEFT,
  TOUCH_BIT.LEFT | TOUCH_BIT.DOWN,
  TOUCH_BIT.DOWN,
  TOUCH_BIT.RIGHT | TOUCH_BIT.DOWN,
]);

const DEG = Math.PI / 180;

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// [0, 360)
function wrapDeg(a) {
  const r = a % 360;
  return r < 0 ? r + 360 : r;
}

/* Sector k spans [sectorStartDeg(k), sectorStartDeg(k) + sectorWidthDeg(k)).
   E/W are 2·horizontalHalfDeg wide, N/S 2·verticalHalfDeg, and the four
   diagonals share the rest equally: 90 - h - v each. With h = v = 22.5 this is
   the textbook 45°-everywhere split. */
export function sectorWidthDeg(k, cfg = CONFIG.touch.stick) {
  if (k === 0 || k === 4) return 2 * cfg.horizontalHalfDeg;
  if (k === 2 || k === 6) return 2 * cfg.verticalHalfDeg;
  return 90 - cfg.horizontalHalfDeg - cfg.verticalHalfDeg;
}

export function sectorStartDeg(k, cfg = CONFIG.touch.stick) {
  const h = cfg.horizontalHalfDeg, v = cfg.verticalHalfDeg;
  switch (k) {
    case 0: return wrapDeg(-h);
    case 1: return h;
    case 2: return 90 - v;
    case 3: return 90 + v;
    case 4: return 180 - h;
    case 5: return 180 + h;
    case 6: return 270 - v;
    default: return 270 + v;
  }
}

/* Is angle `a` inside sector k, widened by `pad` degrees on both sides? */
function inSector(a, k, pad, cfg) {
  const rel = wrapDeg(a - sectorStartDeg(k, cfg) + pad);
  return rel < sectorWidthDeg(k, cfg) + 2 * pad;
}

/* The fresh (hysteresis-free) classification of an angle. */
export function sectorOfAngle(a, cfg = CONFIG.touch.stick) {
  const w = wrapDeg(a);
  for (let k = 0; k < 8; k++) if (inSector(w, k, 0, cfg)) return k;
  return 0;                                   // unreachable: the sectors tile 360°
}

/* The rim radius for a viewport, in CSS px: a fixed fraction of the short
   side, clamped so a tablet does not get a dinner plate and a small phone
   still gets a usable throw. */
export function stickRimRadius(width, height, cfg = CONFIG.touch.stick) {
  return clamp(Math.min(width, height) * cfg.rimFrac, cfg.rimMin, cfg.rimMax);
}

/* One quantization step. (dx, dy) is the thumb's offset from the anchor in
   screen px (+y down), `prev` the sector this stick held last step (-1 =
   neutral), `rim` the rim radius. Returns -1 (neutral) or a sector 0..7.

   Two hystereses, both load-bearing:
     - dead zone: engage past `engage`·rim, drop to neutral only under
       `release`·rim — a thumb resting on the boundary cannot strobe a run;
     - sectors: a held sector survives until the angle is `hysteresisDeg`
       past its edge, so a thumb parked on the E/NE line does not chatter
       between "run" and "run + aim up" every pixel of wobble.            */
export function stickSector(dx, dy, prev, rim, cfg = CONFIG.touch.stick) {
  const r = Math.hypot(dx, dy);
  const held = Number.isInteger(prev) && prev >= 0 && prev < 8;
  if (!(r >= (held ? cfg.release : cfg.engage) * rim) || !(rim > 0)) return -1;
  const a = Math.atan2(-dy, dx) / DEG;          // screen +y down -> math +y up
  if (held && inSector(a, prev, cfg.hysteresisDeg, cfg)) return prev;
  return sectorOfAngle(a, cfg);
}

export function stickSectorBits(sector) {
  return sector >= 0 && sector < 8 ? STICK_SECTOR_BITS[sector] : 0;
}

/* Rim follow: when the thumb is further than `follow`·rim from the anchor,
   slide the anchor along the thumb's direction until it is exactly that far.
   Mutates `anchor` ({ x, y }); returns true when it moved. A long drag
   therefore never strands the thumb a palm's width from neutral. */
export function stickFollow(anchor, x, y, rim, cfg = CONFIG.touch.stick) {
  const dx = x - anchor.x, dy = y - anchor.y;
  const d = Math.hypot(dx, dy);
  const max = rim * cfg.follow;
  if (!(d > max) || !(max > 0)) return false;
  const k = (d - max) / d;
  anchor.x += dx * k;
  anchor.y += dy * k;
  return true;
}

/* Which deck a page gets. `raw` is the ?touch= query value (null when absent),
   `touchHardware` whether the device reports a touch screen / coarse pointer.
     ?touch=0       keyboard only, no deck (unchanged meaning)
     ?touch=1       the two-thumb deck even without touch hardware (review)
     ?touch=legacy  the rejected one-thumb scheme, verbatim (entry 20 escape)
     absent         the two-thumb deck on touch hardware, nothing otherwise */
export function resolveTouchScheme(raw, touchHardware) {
  if (raw === '0' || raw === 'off') return 'off';
  if (raw === 'legacy') return 'legacy';
  if (raw === '1' || raw === 'on') return 'twin';
  return touchHardware ? 'twin' : 'off';
}

/* Auto-fire is an OPTION, default OFF (see CONFIG.touch.autoFire). `raw` is
   the ?autofire= query value — an A/B override that wins — and `stored` the
   player's last toggle ('1' | '0' | null). */
export function resolveAutoFire(raw, stored) {
  if (raw === '1' || raw === 'on') return true;
  if (raw === '0' || raw === 'off') return false;
  return stored === '1';
}

/* Is any materialized hostile inside the screen's s-range? Rows are the sim's
   own hostile rows (x, enterUntil); `left`/`right` the sim edges. A body still
   condensing out of the tower depth has no hitbox, so it does not count —
   the same rule aim assist uses (src/sim/weapons.js assistHeading). */
export function autoFireSees(rows, left, right, nowMs, cfg = CONFIG.touch.autoFire) {
  const lo = left + cfg.edgeInsetTiles, hi = right - cfg.edgeInsetTiles;
  for (let i = 0; i < rows.length; i++) {
    const e = rows[i];
    if (nowMs < e.enterUntil) continue;
    if (e.x >= lo && e.x <= hi) return true;
  }
  return false;
}

/* One auto-fire step. Mutates `st` ({ lastSeenMs, holding }); returns whether
   the trigger is held. The hold-over keeps a hostile that flickers across a
   screen edge from strobing the trigger. `st.lastSeenMs = -Infinity` is the
   rest state (resetAutoFire). */
export function autoFireStep(st, seen, nowMs, cfg = CONFIG.touch.autoFire) {
  if (seen) st.lastSeenMs = nowMs;
  st.holding = nowMs - st.lastSeenMs <= cfg.holdMs;
  return st.holding;
}

export function resetAutoFire(st) {
  st.lastSeenMs = -Infinity;
  st.holding = false;
  return st;
}

/* ------------------------------ layout ------------------------------ */

function circle() { return { cx: 0, cy: 0, r: 0 }; }
function box() { return { x: 0, y: 0, w: 0, h: 0 }; }

export function newDeckLayout() {
  return {
    width: 0, height: 0, short: 0, landscape: true,
    safe: { top: 0, right: 0, bottom: 0, left: 0 },
    rim: 0, slop: 1, split: 0, stickMinX: 0,
    jump: circle(), fire: circle(), ghost: circle(),
    swap: box(), pause: box(), auto: box(),
    // the bounding box of every right-thumb target (JUMP/FIRE hit circles and
    // SWAP): the region a camera framing must keep RIG's play band out of
    cluster: box(),
  };
}

function polar(c, a, d) {
  c.cx += Math.cos(a * DEG) * d;
  c.cy -= Math.sin(a * DEG) * d;               // math +y up -> screen +y down
}

/* Lay the deck out for a viewport. `safe` is the safe-area inset in CSS px,
   `topReserve` the CSS px under the safe top that the HUD owns (the utility
   chips sit just below it). Fills and returns `out`.

   The two-thumb contract it encodes:
     - JUMP is the big target nearest the right thumb's rest; FIRE sits
       beside it along the thumb's arc, close enough that one thumb can
       roll between them and land on both;
     - SWAP is a deliberate reach (a mis-swap throws away a rolled gun);
     - PAUSE and AUTO are utilities and sit out of both thumbs' arcs;
     - the left `stickZone` fraction of the width belongs to the stick.     */
export function touchDeckLayout(width, height, safe, topReserve = 0,
  cfg = CONFIG.touch.layout, stickCfg = CONFIG.touch.stick, out = newDeckLayout()) {
  const S = Math.min(width, height);
  const landscape = width >= height;
  const m = cfg.edgeMargin;
  out.width = width; out.height = height; out.short = S; out.landscape = landscape;
  out.safe.top = safe.top; out.safe.right = safe.right;
  out.safe.bottom = safe.bottom; out.safe.left = safe.left;
  out.rim = stickRimRadius(width, height, stickCfg);
  out.slop = cfg.hitSlop;
  out.split = safe.left + (width - safe.left - safe.right) * cfg.stickZone;
  // measured from the PHYSICAL edge: the back-swipe starts at the glass edge
  // whatever the notch inset is
  out.stickMinX = cfg.edgeGutter;

  const jr = clamp(S * cfg.jumpFrac, cfg.jumpMin, cfg.jumpMax) / 2;
  const fr = clamp(S * cfg.fireFrac, cfg.fireMin, cfg.fireMax) / 2;
  const chip = clamp(S * cfg.chipFrac, cfg.chipMin, cfg.chipMax);
  const gap = Math.max(cfg.gapMin, S * cfg.gapFrac);

  // JUMP: a fixed inset from the safe corner, never closer to an edge than
  // its own radius plus the margin.
  const J = out.jump;
  J.r = jr;
  J.cx = Math.min(width - safe.right - S * cfg.jumpInsetX, width - safe.right - m - jr);
  J.cy = Math.min(height - safe.bottom - S * cfg.jumpInsetY, height - safe.bottom - m - jr);

  // FIRE: along the thumb arc from JUMP, then pulled back inside the glass.
  const F = out.fire;
  F.r = fr; F.cx = J.cx; F.cy = J.cy;
  polar(F, landscape ? cfg.fireAngleLandscapeDeg : cfg.fireAnglePortraitDeg, jr + gap + fr);
  F.cy = Math.min(F.cy, height - safe.bottom - m - fr);

  // SWAP: a deliberate reach from FIRE (landscape) or JUMP (portrait).
  const W = out.swap;
  W.w = chip; W.h = chip;
  const from = landscape ? F : J;
  const swapC = { cx: from.cx, cy: from.cy };
  polar(swapC, landscape ? cfg.swapAngleLandscapeDeg : cfg.swapAnglePortraitDeg,
    from.r * cfg.hitSlop + S * cfg.swapGapFrac + chip / 2);
  W.x = Math.min(swapC.cx - chip / 2, width - safe.right - m - chip);
  W.y = swapC.cy - chip / 2;

  // PAUSE in the top-right corner under the HUD reserve; AUTO beside it.
  const P = out.pause, A = out.auto;
  P.w = chip; P.h = chip;
  P.x = width - safe.right - m - chip;
  P.y = safe.top + topReserve + m;
  A.w = chip; A.h = chip;
  A.x = P.x - cfg.chipGap - chip;
  A.y = P.y;

  // The idle stick ghost: where a resting left thumb lands.
  const G = out.ghost;
  G.r = out.rim;
  G.cx = Math.max(safe.left + m + out.rim * 1.35, Math.min(out.split - out.rim * 1.2,
    safe.left + S * 0.29));
  G.cy = height - safe.bottom - m - out.rim * 1.35;

  const C = out.cluster;
  const jh = J.r * cfg.hitSlop, fh = F.r * cfg.hitSlop;
  C.x = Math.min(J.cx - jh, F.cx - fh, W.x);
  C.y = Math.min(J.cy - jh, F.cy - fh, W.y);
  C.w = Math.max(J.cx + jh, F.cx + fh, W.x + W.w) - C.x;
  C.h = Math.max(J.cy + jh, F.cy + fh, W.y + W.h) - C.y;
  return out;
}

/* JUMP/FIRE hit bits for a point. Each button's hit circle is its visual
   circle grown by `slop` (default: the layout's press slop); the lens where
   the two overlap presses BOTH, which is the one-thumb "jump while firing"
   target. A thumb driven past JUMP into the screen corner still means JUMP.
   The deck passes a tighter slop for SLIDING onto a button than for landing
   on one, so a thumb rocking on FIRE's rim does not brush JUMP. */
export function clusterHitBits(layout, x, y, slop = layout.slop) {
  const J = layout.jump, F = layout.fire;
  let bits = 0;
  if (Math.hypot(x - J.cx, y - J.cy) <= J.r * slop ||
      (x >= J.cx && y >= J.cy)) bits |= TOUCH_BIT.JUMP;
  if (Math.hypot(x - F.cx, y - F.cy) <= F.r * slop) bits |= TOUCH_BIT.FIRE;
  return bits;
}

/* Which surface a NEW pointer at (x, y) belongs to: 'stick' left of the split,
   'cluster' right of it, and 'gutter' in the outermost left strip where iOS
   Safari's back swipe starts — a touch there spawns nothing (it would be
   hijacked mid-press). Chips are claimed by their DOM element first. */
export function deckZone(layout, x) {
  if (x < layout.stickMinX) return 'gutter';
  return x < layout.split ? 'stick' : 'cluster';
}

/* Mask -> codes (snapshot/debug only; allocates). */
export function touchMaskCodes(mask) {
  const out = [];
  for (let i = 0; i < TOUCH_BIT_CODES.length; i++)
    if (mask & (1 << i)) out.push(TOUCH_BIT_CODES[i]);
  return out;
}
