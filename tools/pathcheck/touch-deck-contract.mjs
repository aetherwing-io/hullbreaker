// Domain: T-101 two-thumb touch deck (decisions.md entry 20 + addendum) ======
//
// The deterministic half of the deck lives in src/pure/touch-stick.js, so its
// whole contract is provable here: the floating stick's dead zone and 8-way
// quantization (both with hysteresis — chatter is asserted against a seeded
// jittery thumb, and the same thumb WITHOUT hysteresis must chatter, so the
// check cannot pass vacuously), the rim-follow anchor, the deck layout at
// landscape-first phone sizes with notch/home-indicator insets on either side,
// the JUMP/FIRE hit test, and the scheme / auto-fire resolvers. The DOM half
// (src/ui/touch-controls.js) is held by source inspection to the one rule that
// matters for the sim: it emits keyboard key edges and nothing else. The
// player-level proof (real multi-touch through the browser) is
// tools/playtest/touch-proof.mjs.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG } from '../../src/config.js';
import {
  STICK_SECTOR_BITS, STICK_SECTORS, TOUCH_BIT, TOUCH_BIT_CODES, autoFireSees,
  autoFireStep, clusterHitBits, deckZone, resetAutoFire, resolveAutoFire,
  resolveTouchScheme, sectorOfAngle, sectorStartDeg, sectorWidthDeg, stickFollow,
  stickRimRadius, stickSector, stickSectorBits, touchDeckLayout, touchMaskCodes,
} from '../../src/pure/touch-stick.js';
import { GAMEPLAY_KEYMAP } from '../../src/pure/frame-input.js';
import { mulberry32 } from '../../src/pure/rng.js';
import { ok, srcDir, stripComments } from './_context.mjs';

export const title = 'T-101: two-thumb touch deck (pure stick, layout, wiring) ======';

const SC = CONFIG.touch.stick;
const LC = CONFIG.touch.layout;
const AC = CONFIG.touch.autoFire;
const DEG = Math.PI / 180;
// thumb offset (screen px, +y down) at angle `a` (math degrees) and radius r
const at = (a, r) => [Math.cos(a * DEG) * r, -Math.sin(a * DEG) * r];

export async function run() {
  /* ----------------------- sectors tile the circle ---------------------- */
  {
    let sum = 0, contiguous = true;
    for (let k = 0; k < 8; k++) {
      sum += sectorWidthDeg(k, SC);
      const end = (sectorStartDeg(k, SC) + sectorWidthDeg(k, SC)) % 360;
      if (Math.abs(end - sectorStartDeg((k + 1) % 8, SC)) > 1e-9) contiguous = false;
    }
    ok(Math.abs(sum - 360) < 1e-9 && contiguous,
       'T-101: the 8 stick sectors tile 360° with no gap and no overlap');
    const counts = new Array(8).fill(0);
    for (let a = 0; a < 360; a += 0.25) counts[sectorOfAngle(a, SC)]++;
    ok(counts.every((c, k) => Math.abs(c - sectorWidthDeg(k, SC) * 4) <= 1),
       'T-101: a quarter-degree sweep lands in each sector exactly its width ' +
       '[' + counts.map((c) => c / 4).join(', ') + ']');
    const canon = [0, 45, 90, 135, 180, 225, 270, 315].map((a) => STICK_SECTORS[sectorOfAngle(a, SC)]);
    ok(canon.join() === 'E,NE,N,NW,W,SW,S,SE',
       'T-101: the eight canonical directions quantize to their own sectors (' + canon + ')');
    ok(sectorWidthDeg(0, SC) === 50 && sectorWidthDeg(2, SC) === 35 && sectorWidthDeg(1, SC) === 47.5,
       'T-101: E/W 50°, N/S 35°, diagonals 47.5° (CONFIG.touch.stick)');
    // A pure-vertical sector zeroes RIG's run input (h = 0 in updatePlayer):
    // it must be the hardest sector to land in by accident — pillar 1.
    ok(sectorWidthDeg(2, SC) < sectorWidthDeg(1, SC) && sectorWidthDeg(2, SC) < sectorWidthDeg(0, SC),
       'T-101: the run-stopping N/S sectors are the narrowest');
  }

  /* -------------------- screen convention + key chords ------------------- */
  {
    const rim = 58.5;
    const name = (dx, dy) => STICK_SECTORS[stickSector(dx, dy, -1, rim, SC)] || 'none';
    ok(name(40, 0) === 'E' && name(40, -40) === 'NE' && name(0, -40) === 'N' &&
       name(-40, 40) === 'SW' && name(0, 40) === 'S',
       'T-101: screen +y is DOWN — a thumb pushed up the glass aims up');
    const want = [['ArrowRight'], ['ArrowRight', 'ArrowUp'], ['ArrowUp'], ['ArrowLeft', 'ArrowUp'],
      ['ArrowLeft'], ['ArrowLeft', 'ArrowDown'], ['ArrowDown'], ['ArrowRight', 'ArrowDown']];
    ok(STICK_SECTOR_BITS.every((bits, k) =>
      touchMaskCodes(bits).slice().sort().join() === want[k].slice().sort().join()),
       'T-101: every sector holds exactly the keyboard chord for that direction');
    ok(stickSectorBits(-1) === 0, 'T-101: neutral holds nothing');
    const intents = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
      Space: 'jump', KeyX: 'fire', KeyC: 'swap' };
    ok(TOUCH_BIT_CODES.length === 7 && TOUCH_BIT_CODES.every((c) => GAMEPLAY_KEYMAP[c] === intents[c]),
       'T-101: the deck\'s whole vocabulary is keyboard codes the game already maps ' +
       '(one gameplay-input contract)');
    ok(TOUCH_BIT_CODES.every((c, i) => touchMaskCodes(1 << i)[0] === c) &&
       TOUCH_BIT.JUMP === 16 && TOUCH_BIT.FIRE === 32,
       'T-101: bit i is TOUCH_BIT_CODES[i]');
  }

  /* ------------------------------ dead zone ------------------------------ */
  {
    const rim = 60;
    const engage = SC.engage * rim, release = SC.release * rim;
    ok(stickSector(engage - 0.5, 0, -1, rim, SC) === -1 && stickSector(engage + 0.5, 0, -1, rim, SC) === 0,
       'T-101: from neutral a direction engages only past ' + SC.engage + '·rim');
    ok(stickSector(release + 0.5, 0, 0, rim, SC) === 0 && stickSector(release - 0.5, 0, 0, rim, SC) === -1,
       'T-101: a held direction survives down to ' + SC.release + '·rim, then drops to neutral');
    // a thumb resting ON the engage ring (±2 px of wobble) must not strobe the run
    const rng = mulberry32(101);
    const flips = (cfg) => {
      let s = -1, n = 0;
      for (let i = 0; i < 600; i++) {
        const r = engage + (rng() * 4 - 2);
        const next = stickSector(r, 0, s, rim, cfg);
        if ((next === -1) !== (s === -1) && i > 0) n++;
        s = next;
      }
      return n;
    };
    const withHyst = flips(SC);
    const without = flips({ ...SC, release: SC.engage });
    ok(withHyst <= 1 && without > 50,
       'T-101: dead-zone hysteresis — a thumb wobbling ±2 px on the engage ring flips run on/off ' +
       withHyst + 'x over 600 samples (' + without + 'x with the hysteresis removed)');
  }

  /* --------------------------- sector hysteresis ------------------------- */
  {
    const rim = 60, r = 40, H = SC.hysteresisDeg;
    const edge = SC.horizontalHalfDeg;                       // the E | NE boundary
    ok(stickSector(...at(edge + H - 0.5, r), 0, rim, SC) === 0 &&
       stickSector(...at(edge + H + 0.5, r), 0, rim, SC) === 1,
       'T-101: a held E survives until ' + H + '° past the E/NE edge, then becomes NE');
    ok(stickSector(...at(edge - H + 0.5, r), 1, rim, SC) === 1 &&
       stickSector(...at(edge - H - 0.5, r), 1, rim, SC) === 0,
       'T-101: …and a held NE survives ' + H + '° back past the same edge');
    // The anti-chatter claim, falsifiably: a seeded thumb parked ON the E/NE
    // boundary with ±6° of wobble. With hysteresis it settles; with the
    // hysteresis set to zero the same thumb chatters between "run" and "run +
    // aim up" — so this check is about the hysteresis, not the thumb.
    const chatter = (cfg, seed) => {
      const rng = mulberry32(seed);
      let s = -1, n = 0;
      for (let i = 0; i < 600; i++) {
        const next = stickSector(...at(edge + (rng() * 12 - 6), r + (rng() * 6 - 3)), s, rim, cfg);
        if (s !== -1 && next !== s) n++;
        s = next;
      }
      return n;
    };
    const settled = chatter(SC, 7), raw = chatter({ ...SC, hysteresisDeg: 0 }, 7);
    ok(settled <= 1 && raw > 100,
       'T-101: no chatter between E and NE — ' + settled + ' sector changes over 600 wobbling ' +
       'samples (' + raw + ' with the hysteresis removed)');
    const settledDiag = (() => {
      const rng = mulberry32(19);
      let s = -1, n = 0;
      const nEdge = 90 - SC.verticalHalfDeg;                 // the NE | N boundary
      for (let i = 0; i < 600; i++) {
        const next = stickSector(...at(nEdge + (rng() * 12 - 6), r), s, rim, SC);
        if (s !== -1 && next !== s) n++;
        s = next;
      }
      return n;
    })();
    ok(settledDiag <= 1, 'T-101: no chatter on the NE/N boundary either (' + settledDiag + ' changes)');
  }

  /* ------------------------------ rim follow ----------------------------- */
  {
    const rim = 60;
    const anchor = { x: 100, y: 200 };
    const moved = stickFollow(anchor, 100 + 300, 200, rim, SC);
    ok(moved && Math.abs(anchor.x - (400 - rim)) < 1e-9 && anchor.y === 200,
       'T-101: a 300 px drag drags the anchor along, leaving the thumb exactly one rim out');
    ok(!stickFollow(anchor, 400 - 10, 200, rim, SC),
       'T-101: inside the rim the anchor stays put');
    // The payoff: after a long right drag, reversing by little more than a
    // rim reaches LEFT. Without the follow the same reversal is still RIGHT.
    const reverse = (cfg) => {
      const a = { x: 100, y: 200 };
      let s = -1, x = 100;
      for (; x <= 400; x += 10) {
        stickFollow(a, x, 200, rim, cfg);
        s = stickSector(x - a.x, 0, s, rim, cfg);
      }
      x -= 10;
      const back = x - (rim + SC.engage * rim + 2);
      stickFollow(a, back, 200, rim, cfg);
      return STICK_SECTORS[stickSector(back - a.x, 0, s, rim, cfg)] || 'none';
    };
    const followed = reverse(SC), pinned = reverse({ ...SC, follow: Infinity });
    ok(followed === 'W' && pinned === 'E',
       'T-101: after a 300 px drag right, a ' + Math.round(rim + SC.engage * rim + 2) +
       ' px reversal reads ' + followed + ' (without rim follow: ' + pinned + ')');
  }

  /* -------------------------------- layout ------------------------------- */
  {
    // landscape first (decisions.md entry 20 addendum): the tuning target.
    // Notched sizes are tested with the insets a notched iPhone reports;
    // home-button sizes (667x375, 568x320) have none.
    const VIEWS = [
      { w: 844, h: 390, tag: '844x390', insets: ['none', 'notchLeft', 'notchRight'] },
      // iPhone Safari in landscape keeps its toolbar on a page that never
      // scrolls: roughly 50 px of the 390 go to browser chrome
      { w: 844, h: 340, tag: '844x340', insets: ['none', 'notchLeft', 'notchRight'] },
      { w: 932, h: 430, tag: '932x430', insets: ['none', 'notchLeft', 'notchRight'] },
      { w: 667, h: 375, tag: '667x375', insets: ['none'] },
      { w: 568, h: 320, tag: '568x320', insets: ['none'] },
      { w: 390, h: 844, tag: '390x844', insets: ['none', 'notchTop'] },
      { w: 430, h: 932, tag: '430x932', insets: ['none', 'notchTop'] },
      { w: 375, h: 667, tag: '375x667', insets: ['none'] },
    ];
    const INSETS = {
      none: { top: 0, right: 0, bottom: 0, left: 0 },
      // iPhone landscape puts the notch on a SIDE and the home indicator at
      // the bottom; which side depends on the rotation direction
      notchLeft: { top: 0, right: 0, bottom: 21, left: 47 },
      notchRight: { top: 0, right: 47, bottom: 21, left: 0 },
      notchTop: { top: 47, right: 0, bottom: 34, left: 0 },
    };
    const circleIn = (c, safe, w, h) => c.cx - c.r >= safe.left + LC.edgeMargin - 1e-9 &&
      c.cx + c.r <= w - safe.right - LC.edgeMargin + 1e-9 &&
      c.cy - c.r >= safe.top + LC.edgeMargin - 1e-9 && c.cy + c.r <= h - safe.bottom - LC.edgeMargin + 1e-9;
    const boxIn = (b, safe, w, h) => b.x >= safe.left + LC.edgeMargin - 1e-9 &&
      b.x + b.w <= w - safe.right - LC.edgeMargin + 1e-9 &&
      b.y >= safe.top + LC.edgeMargin - 1e-9 && b.y + b.h <= h - safe.bottom - LC.edgeMargin + 1e-9;
    const boxCircleHit = (b, c, r) => {
      const nx = Math.max(b.x, Math.min(c.cx, b.x + b.w)), ny = Math.max(b.y, Math.min(c.cy, b.y + b.h));
      return Math.hypot(c.cx - nx, c.cy - ny) < r;
    };
    const boxesHit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const bad = { size: [], inside: [], overlap: [], lens: [], zone: [], corner: [], gutter: [], hits: [], slide: [] };
    for (const v of VIEWS) {
      for (const iname of v.insets) {
        const safe = INSETS[iname];
        const landscape = v.w >= v.h;
        const tag = v.tag + '/' + iname;
        const L = touchDeckLayout(v.w, v.h, safe, landscape ? 48 : 170, LC, SC);
        const J = L.jump, F = L.fire;
        // Apple HIG floor is 44 pt; the two thumb buttons are well above it
        if (!(J.r * 2 >= 64 && F.r * 2 >= 56 && [L.swap, L.pause, L.auto].every((b) => b.w >= 44 && b.h >= 44)))
          bad.size.push(tag);
        if (!(circleIn(J, safe, v.w, v.h) && circleIn(F, safe, v.w, v.h) &&
              [L.swap, L.pause, L.auto].every((b) => boxIn(b, safe, v.w, v.h))))
          bad.inside.push(tag);
        const jh = J.r * L.slop, fh = F.r * L.slop;
        const chipsClear = [L.swap, L.pause, L.auto].every((b) => !boxCircleHit(b, J, jh) && !boxCircleHit(b, F, fh));
        const chipPairs = !boxesHit(L.swap, L.pause) && !boxesHit(L.swap, L.auto) && !boxesHit(L.pause, L.auto);
        const dJF = Math.hypot(J.cx - F.cx, J.cy - F.cy);
        if (!(dJF >= J.r + F.r + LC.gapMin - 1e-9 && chipsClear && chipPairs)) bad.overlap.push(tag);
        // the both-buttons lens exists, and is a sliver, not half a button
        const lens = jh + fh - dJF;
        if (!(lens > 0 && lens <= 0.4 * F.r)) bad.lens.push(tag + ' lens ' + lens.toFixed(1));
        // the stick never owns a button's hit area; the ghost sits in its zone
        if (!(F.cx - fh >= L.split && J.cx - jh >= L.split && L.swap.x >= L.split &&
              L.ghost.cx < L.split && L.ghost.cx > L.stickMinX + L.ghost.r * 0.5 &&
              L.split - Math.max(L.stickMinX, safe.left) >= 2.5 * L.rim))
          bad.zone.push(tag);
        // the right-thumb cluster is a bottom-right corner, not a wall: it
        // stays out of the middle of the frame whatever the camera does
        const C = L.cluster;
        const yFloor = landscape ? 0.6 : 0.7;
        // (portrait is narrow: there the right thumb owns everything right of
        // the stick split, which the zone check above already holds)
        if (!(C.y >= yFloor * v.h && (!landscape || C.x >= 0.55 * v.w))) bad.corner.push(tag +
          ' cluster from ' + (C.x / v.w * 100).toFixed(0) + '%,' + (C.y / v.h * 100).toFixed(0) + '%');
        // iOS back-swipe gutter: no stick spawns at the outermost left strip
        // (the ~20 px is the integrator's iOS requirement, pinned literally so
        // a config edit cannot quietly shrink it)
        if (!(LC.edgeGutter >= 20 && deckZone(L, 19) === 'gutter' && deckZone(L, 0) === 'gutter' &&
              deckZone(L, LC.edgeGutter) === 'stick' && deckZone(L, L.split) === 'cluster'))
          bad.gutter.push(tag);
        // the hit test agrees with the drawing
        const mid = { x: (J.cx * fh + F.cx * jh) / (jh + fh), y: (J.cy * fh + F.cy * jh) / (jh + fh) };
        if (!(clusterHitBits(L, J.cx, J.cy) === TOUCH_BIT.JUMP &&
              clusterHitBits(L, F.cx, F.cy) === TOUCH_BIT.FIRE &&
              clusterHitBits(L, mid.x, mid.y) === (TOUCH_BIT.JUMP | TOUCH_BIT.FIRE) &&
              clusterHitBits(L, v.w - safe.right - 2, v.h - safe.bottom - 2) === TOUCH_BIT.JUMP &&
              clusterHitBits(L, L.split + 1, L.ghost.cy - L.rim * 2) === 0 &&
              clusterHitBits(L, L.swap.x + L.swap.w / 2, L.swap.y + L.swap.h / 2) === 0))
          bad.hits.push(tag);
        // sliding: a finger already down keeps what it holds, so the only
        // question is whether a slide ADDS JUMP. On FIRE's rim facing JUMP,
        // or rocked a further half-gap toward it, it must not; well onto
        // JUMP's face it must. (With the press slop the rocked point WOULD
        // add JUMP — that is the brush this rule removes.)
        const ux = (J.cx - F.cx) / dJF, uy = (J.cy - F.cy) / dJF;
        const gapPx = dJF - J.r - F.r;
        const rim = { x: F.cx + ux * F.r, y: F.cy + uy * F.r };
        const rocked = { x: rim.x + ux * gapPx / 2, y: rim.y + uy * gapPx / 2 };
        const jumpBit = (p, slop) => (clusterHitBits(L, p.x, p.y, slop) & TOUCH_BIT.JUMP) !== 0;
        if (!(!jumpBit(rim, LC.slideSlop) && !jumpBit(rocked, LC.slideSlop) && jumpBit(rocked, L.slop) &&
              jumpBit({ x: J.cx - ux * J.r * 0.9, y: J.cy - uy * J.r * 0.9 }, LC.slideSlop)))
          bad.slide.push(tag);
      }
    }
    ok(bad.size.length === 0, 'T-101: JUMP ≥ 64 px, FIRE ≥ 56 px, every chip ≥ 44 px (HIG) at every ' +
       'phone size and inset' + (bad.size.length ? ' — ' + bad.size.join(', ') : ''));
    ok(bad.inside.length === 0, 'T-101: every target lies inside the safe-area insets (notch on either ' +
       'side, home indicator)' + (bad.inside.length ? ' — ' + bad.inside.join(', ') : ''));
    ok(bad.overlap.length === 0, 'T-101: no two targets overlap (JUMP↔FIRE keep their gap; chips clear ' +
       'of both hit circles and of each other)' + (bad.overlap.length ? ' — ' + bad.overlap.join(', ') : ''));
    ok(bad.lens.length === 0, 'T-101: JUMP/FIRE hit circles share a thin both-buttons lens (one thumb ' +
       'can jump while firing) and no more' + (bad.lens.length ? ' — ' + bad.lens.join(', ') : ''));
    ok(bad.zone.length === 0, 'T-101: the stick zone owns no button and has room for a full stick' +
       (bad.zone.length ? ' — ' + bad.zone.join(', ') : ''));
    ok(bad.corner.length === 0, 'T-101: the right-thumb cluster stays a bottom-right corner (landscape ' +
       'below 60% of the height and right of 55% of the width; portrait below 70%)' +
       (bad.corner.length ? ' — ' + bad.corner.join(', ') : ''));
    ok(bad.gutter.length === 0, 'T-101: no stick spawns in the ' + LC.edgeGutter + ' px left-edge gutter ' +
       '(iOS Safari back swipe)' + (bad.gutter.length ? ' — ' + bad.gutter.join(', ') : ''));
    ok(bad.hits.length === 0, 'T-101: the hit test matches the drawing (centres, the both-lens, the ' +
       'JUMP corner, a dead miss, chips left to the DOM)' + (bad.hits.length ? ' — ' + bad.hits.join(', ') : ''));
    ok(bad.slide.length === 0, 'T-101: sliding needs the button itself — a thumb rocking off FIRE\'s ' +
       'rim half-way across the gap adds no JUMP (the press slop would); a slide onto JUMP does' +
       (bad.slide.length ? ' — ' + bad.slide.join(', ') : ''));
    const L = touchDeckLayout(844, 390, INSETS.none, 48, LC, SC);
    ok(Math.abs(L.jump.r * 2 - 0.22 * 390) < 1e-9 && Math.abs(L.rim - stickRimRadius(844, 390, SC)) < 1e-9 &&
       Math.abs(L.rim - 58.5) < 1e-9,
       'T-101: sizes derive from the short side (844x390: JUMP ' + (L.jump.r * 2).toFixed(1) +
       ' px, stick rim ' + L.rim + ' px)');
    const T = touchDeckLayout(1280, 800, INSETS.none, 48, LC, SC);
    ok(T.jump.r * 2 <= LC.jumpMax && T.rim <= SC.rimMax,
       'T-101: a tablet does not get dinner-plate buttons (clamped)');
  }

  /* ------------------------------ resolvers ------------------------------ */
  {
    ok(resolveTouchScheme(null, true) === 'twin' && resolveTouchScheme(null, false) === 'off',
       'T-101: absent ?touch=, the two-thumb deck is the touch-hardware default (entry 16/20)');
    ok(resolveTouchScheme('legacy', false) === 'legacy' && resolveTouchScheme('legacy', true) === 'legacy',
       'T-101: ?touch=legacy restores the rejected scheme on any device');
    ok(resolveTouchScheme('0', true) === 'off' && resolveTouchScheme('1', false) === 'twin',
       'T-101: ?touch=0 / ?touch=1 keep their meanings');
    ok(resolveAutoFire(null, null) === false,
       'T-101: auto-fire defaults OFF (firing is not free in the sim: BACKLASH, face 6+)');
    ok(resolveAutoFire('1', null) === true && resolveAutoFire('0', '1') === false &&
       resolveAutoFire(null, '1') === true && resolveAutoFire(null, '0') === false,
       'T-101: ?autofire= overrides the stored toggle; the stored toggle overrides the default');
  }

  /* ------------------------------ auto-fire ------------------------------ */
  {
    const rows = [
      { x: 30, enterUntil: 500 },          // still condensing at t=100
      { x: 60, enterUntil: 0 },            // materialized, off screen right
    ];
    ok(!autoFireSees(rows, 10, 50, 100, AC), 'T-101: auto-fire ignores bodies with no hitbox yet ' +
       'and bodies off screen');
    ok(autoFireSees(rows, 10, 50, 600, AC), 'T-101: …and sees a materialized body inside the edges');
    ok(!autoFireSees([{ x: 49.9, enterUntil: 0 }], 10, 50, 0, AC) &&
       autoFireSees([{ x: 49.7, enterUntil: 0 }], 10, 50, 0, AC),
       'T-101: a body counts once it is ' + AC.edgeInsetTiles + ' tiles inside a screen edge');
    const st = resetAutoFire({});
    const trace = [[true, 0], [false, AC.holdMs], [false, AC.holdMs + 1], [true, 1000]]
      .map(([seen, t]) => autoFireStep(st, seen, t, AC));
    ok(trace.join() === 'true,true,false,true',
       'T-101: auto-fire holds the trigger ' + AC.holdMs + ' ms past the last sighting, then lets go');
  }

  /* ---------------------------- static guards ---------------------------- */
  // decisions.md entry 21: source-text checks are weak evidence, so this
  // section keeps only what nothing else can show. Everything a browser CAN
  // exercise (release on pointercancel / blur / visibilitychange /
  // orientation, the legacy scheme, the 36-order pointer ledger) is proved by
  // tools/playtest/touch-proof.mjs driving the real game with real touches.
  {
    const read = (rel) => readFileSync(join(srcDir, rel), 'utf8');
    const deck = stripComments(read('ui/touch-controls.js'));
    // the one gameplay-input contract (a rule, not an implementation detail)
    ok(!/from\s+'\.\.\/sim\/input\.js'/.test(deck) && !/\bkeys\s*[.[]/.test(deck),
       'T-101: the deck never touches the sim\'s keys directly — it only emits key edges');
    // iOS Safari surface: no Chromium (and no Playwright WebKit on this host)
    // can exercise these, so a static guard is the only automated evidence
    ok(/'gesturestart', 'gesturechange', 'gestureend'/.test(deck) && /passive: false/.test(deck),
       'T-101 (iOS): Safari pinch gestures are cancelled (gesturestart/change/end, non-passive)');
    ok(/addEventListener\('orientationchange'/.test(deck) && /screen\.orientation/.test(deck) &&
       /addEventListener\('pagehide'/.test(deck),
       'T-101 (iOS): orientationchange, screen.orientation change and pagehide release the deck');
    ok(!/navigator\.vibrate/.test(deck), 'T-101 (iOS): no vibration API (absent on iPhone Safari)');
    const html = readFileSync(join(srcDir, '..', 'index.html'), 'utf8');
    const deckCss = /#thumbDeck \{[^}]*\}/.exec(html);
    ok(!!deckCss && /touch-action: none/.test(deckCss[0]) && /-webkit-user-select: none/.test(deckCss[0]) &&
       /-webkit-touch-callout: none/.test(deckCss[0]),
       'T-101 (iOS): the deck CSS carries touch-action:none and the -webkit- twins Safari reads');
  }

  /* ------------------ audio unlock on a touch END (iOS) ------------------ */
  // A model of the platform rule, not a phone: the fake AudioContext's
  // resume() only succeeds while a WebKit-style gesture is being dispatched
  // (touchend / pointerup / keydown / click — never a touch's pointerdown).
  // A touch-only player's tap is pointerdown then pointerup. On the pre-T-101
  // listener set (keydown + pointerdown) this ends 'suspended'.
  {
    const script = `
      class P { constructor(v) { this.value = v; } setValueAtTime() {} linearRampToValueAtTime() {}
        exponentialRampToValueAtTime() {} cancelScheduledValues() {} setTargetAtTime() {} }
      class N { connect(n) { return n; } disconnect() {} }
      class O extends N { constructor() { super(); this.frequency = new P(1); this.detune = new P(0); } start() {} stop() {} }
      class G extends N { constructor() { super(); this.gain = new P(1); } }
      class B extends N { constructor() { super(); this.frequency = new P(1); this.Q = new P(1); } }
      class S extends N { constructor() { super(); this.playbackRate = new P(1); } start() {} stop() {} }
      let gesture = false;
      class Ctx {
        constructor() { this.state = 'suspended'; this.currentTime = 0; this.sampleRate = 44100; this.destination = new N(); }
        createGain() { return new G(); } createOscillator() { return new O(); }
        createBufferSource() { return new S(); } createBiquadFilter() { return new B(); }
        createDynamicsCompressor() { return new N(); }
        createBuffer(c, l) { return { getChannelData: () => new Float32Array(l) }; }
        resume() { if (gesture) this.state = 'running'; return gesture ? Promise.resolve() : Promise.reject(new Error('no gesture')); }
        suspend() { this.state = 'suspended'; return Promise.resolve(); }
      }
      globalThis.window = globalThis; globalThis.AudioContext = Ctx;
      const listeners = {};
      globalThis.document = { hidden: false, addEventListener(n, f) { (listeners[n] ||= []).push(f); } };
      globalThis.addEventListener = (n, f) => { (listeners[n] ||= []).push(f); };
      globalThis.__HB_QUERY__ = '';
      const AU = await import(${JSON.stringify('file://' + srcDir + '/ui/audio.js')});
      const fire = (type, isGesture) => { gesture = isGesture; for (const f of (listeners[type] || [])) f(); gesture = false; };
      fire('pointerdown', false);            // a touch's pointerdown: not a gesture
      await new Promise((r) => setTimeout(r, 0));
      const afterDown = AU.audioSnapshot().contextState;
      fire('pointerup', true);               // the touch's end: the gesture
      fire('touchend', true);
      await new Promise((r) => setTimeout(r, 0));
      console.log(JSON.stringify({ afterDown, afterUp: AU.audioSnapshot().contextState,
        listening: Object.keys(listeners).sort() }));
    `;
    let r = null, err = '';
    try {
      r = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim().split('\n').pop());
    } catch (e) { err = String(e.stderr || e.message).slice(0, 300); }
    ok(!!r && r.afterDown === 'suspended' && r.afterUp === 'running',
       'T-101: a touch-only tap unlocks audio on its END (iOS Safari\'s gesture), modelled with a ' +
       'gesture-gated AudioContext' + (r ? ' — after down ' + r.afterDown + ', after up ' + r.afterUp : ' — ' + err));
  }
}
