// sampler.mjs — the in-page probe. This function is shipped to the browser
// via page.evaluate(sampleState) and must be fully self-contained (no
// closures over anything outside its own body): Playwright serializes it by
// source text and runs it inside the page, not in Node.
//
// Three fidelity channels, checked in this order (highest first):
//
//   'testapi' — globalThis.__HULLBREAKER_TEST__.snapshot() is present,
//               opt-in via ?testapi=1 on the URL (which run.mjs adds by
//               default; --no-testapi opts out). Documented in src/main.js
//               as "the playtest harness's canonical channel, field names
//               frozen". Landed pre-module-split (commit 15f66d2) and was
//               missed in this harness's first pass, which assumed no such
//               hook existed.
//
//   'full'    — globalThis.window.HB.snapshot() is present instead. Unlike
//               testapi, window.HB is now unconditional — present on every
//               load, no query param needed (src/main.js: "Read-only debug
//               handle, always present"). Both channels are built from the
//               same telemetry() function in src/main.js so their shared
//               fields (gameMs, state, scrollX, player.{x,y,vx,vy,grounded,
//               traversalState}, edgeMargin, weapon, attempt, falls,
//               airJumps, transform, pace, pursuitSpeed/Peak, setbacks,
//               hostiles) can't drift apart; HB.snapshot() additionally
//               carries player.{hp,lives,facing,airJumpsLeft}, kills,
//               shotsFired, capsules. Note window.HB's *other* top-level
//               members (HB.state, HB.scrollX, HB.currentWeapon, HB.kills,
//               …) are getter *functions*, not values — this sampler only
//               ever reads them through snapshot(), never as bare
//               properties, specifically to avoid that trap.
//
//   'dom'     — neither exists. Falls back to parsing the HUD/overlay text
//               nodes: attempt count, crush-edge margin (rounded to 1
//               decimal), kill count, hp pips, current weapon letter,
//               dare-pocket/overlay text.
//
// The DOM-derived fields (kills, hp, weapon, overlay/HUD text) are always
// read first as a base layer; testapi/full overlay whatever extra precision
// or fields they have, and use their own kills/hp when the channel actually
// carries it (HB.snapshot() does; testapi's frozen shape deliberately
// doesn't).
//
// Hostiles/capsules (added for the closed-loop policy mode, which needs to
// react to e.g. a houndframe's `tell` telegraph). These two are no longer the
// same case:
//
//   `hostiles` rides the PRIMARY channel. `?testapi=1`'s telemetry() publishes
//   it (game-side hook request #2, merged e7b2952) and HB.snapshot() spreads
//   that same telemetry() result, so both channels carry byte-identical rows —
//   {id, kind, state, dir, x, y, hp, materialized}. fromTelemetryLike() below
//   normalizes it from whichever channel is primary; the window.HB read at the
//   bottom is now only a fallback for a page that publishes HB without testapi
//   (or a build predating e7b2952). That drops the last window.HB-specific
//   dependency of the hostile-state predicates in lib/policy.mjs.
//
//   `capsules` is still HB-only — the frozen channel has no equivalent field —
//   so it stays a pure enrichment layer, merged in regardless of which channel
//   is primary for physics (see README hook request #2 and limitation #7).

export function sampleState() {
  /* eslint-disable no-undef */
  const nowMs = performance.now();

  const hudTL = (document.getElementById('hudTL') || {}).textContent || '';
  const hudTC = (document.getElementById('hudTC') || {}).textContent || '';
  const hudTR = (document.getElementById('hudTR') || {}).textContent || '';
  const overlayEl = document.getElementById('overlay');
  const overlayVisible = !!overlayEl && getComputedStyle(overlayEl).display !== 'none';
  const ovTitle = (document.getElementById('ovTitle') || {}).textContent || '';
  const ovBody = (document.getElementById('ovBody') || {}).textContent || '';

  const weaponMatch = hudTL.match(/\[([A-Z])\]/);
  const hpFilled = (hudTL.match(/▰/g) || []).length;   // ▰
  const hpEmpty = (hudTL.match(/▱/g) || []).length;    // ▱
  const attemptMatch = hudTR.match(/ATTEMPT (\d+)/);
  const edgeMatch = hudTR.match(/EDGE ([\d.]+|—)/);     // — (em dash) = no margin recorded yet
  const killsMatch = hudTR.match(/(\d+) kills/);

  const base = {
    fidelity: 'dom',
    nowMs,
    hudTL, hudTC, hudTR, overlayVisible, ovTitle, ovBody,
    weapon: weaponMatch ? weaponMatch[1] : null,
    hp: hudTL ? hpFilled : null,
    hpMax: hudTL ? hpFilled + hpEmpty : null,
    attempts: attemptMatch ? Number(attemptMatch[1]) : null,
    edgeMargin: edgeMatch && edgeMatch[1] !== '—' ? Number(edgeMatch[1]) : null,
    kills: killsMatch ? Number(killsMatch[1]) : null,
    title: document.title,
    // Physics/traversal fields only testapi/HB can fill:
    x: null, y: null, vx: null, vy: null, grounded: null, traversalState: null,
    scrollX: null, gameMs: null, state: null, falls: null, airJumps: null,
    transform: null, pace: null, pursuitSpeed: null, pursuitPeak: null, setbacks: null,
    score: null, hostiles: null, capsules: null,
    // window.HB-only enrichment (like `capsules` below): which way the gun
    // points. The frozen testapi shape has no equivalent field, so this is
    // null on a page that publishes testapi without window.HB. The
    // relative-geometry view (lib/threat.mjs) prefers the harness's own held
    // direction anyway and only consults this when nothing is held.
    facing: null,
    // window.HB-only terrain probe, filled below: where the floor ends in
    // front of RIG. The other half of the same relative-geometry gap the
    // `threat.*` view closes for hostiles (T-018) — a policy could say "a
    // hound is telegraphing" but had no way to say "the deck runs out in two
    // tiles", so a gap could only be jumped by a fixed timestamp.
    terrain: null,
  };

  // One normalizer for both sources, so a channel switch can't change the
  // row shape the trace/policy engine sees. Defined inside sampleState()
  // because this whole function is serialized to the page by source text.
  function mapHostiles(list) {
    return list.map((h) => ({
      id: h.id, kind: h.kind, x: h.x, y: h.y, hp: h.hp,
      state: h.state, dir: h.dir,          // houndframe: prowl/tell/charge/skid/tumble
      materialized: h.materialized,
    }));
  }

  function fromTelemetryLike(s, fidelity) {
    return {
      ...base,
      fidelity,
      x: s.player.x, y: s.player.y, vx: s.player.vx, vy: s.player.vy,
      grounded: !!s.player.grounded,
      traversalState: s.player.traversalState || 'free',
      scrollX: s.scrollX, gameMs: s.gameMs, state: s.state,
      edgeMargin: s.edgeMargin,          // exact, not the HUD's 1-decimal display
      weapon: s.weapon || base.weapon,
      attempts: s.attempt, falls: s.falls,
      airJumps: typeof s.airJumps === 'number' ? s.airJumps : null,
      // additive telemetry fields (score/pace/transform proposal + CP3):
      // passed through verbatim so new sub-fields (e.g. a future
      // transformSealX) automatically flow to the trace/policy engine
      // without a sampler change.
      transform: s.transform || null,
      pace: s.pace || null,
      pursuitSpeed: typeof s.pursuitSpeed === 'number' ? s.pursuitSpeed : null,
      pursuitPeak: typeof s.pursuitPeak === 'number' ? s.pursuitPeak : null,
      setbacks: s.setbacks != null ? s.setbacks : null,
      // primary-channel hostiles (both channels publish the same rows); null
      // leaves the window.HB fallback below free to fill it.
      hostiles: Array.isArray(s.hostiles) ? mapHostiles(s.hostiles) : null,
      // A.5 read surface (playtest README hook request #3): the game's own
      // scoreSnapshot(), passed through verbatim. `score.enabled` is false
      // unless the run was started with ?score=1 — lib/metrics.mjs only
      // trusts it as the real event stream when it is true.
      score: s.score || null,
    };
  }

  const testapi = typeof globalThis !== 'undefined' ? globalThis.__HULLBREAKER_TEST__ : undefined;
  const HB = typeof window !== 'undefined' ? window.HB : undefined;
  const hbSnap = HB && typeof HB.snapshot === 'function' ? HB.snapshot() : null;

  let result;
  if (testapi && typeof testapi.snapshot === 'function') {
    result = fromTelemetryLike(testapi.snapshot(), 'testapi');
  } else if (hbSnap) {
    result = fromTelemetryLike(hbSnap, 'full');
    result.hp = typeof hbSnap.player.hp === 'number' ? hbSnap.player.hp : base.hp;
    result.kills = typeof hbSnap.kills === 'number' ? hbSnap.kills : base.kills;
  } else {
    result = base;
  }

  // fallback only: the primary channel already filled this unless it was dom
  // fidelity, or a page with window.HB but no ?testapi=1.
  if (result.hostiles == null && hbSnap && Array.isArray(hbSnap.hostiles)) {
    result.hostiles = mapHostiles(hbSnap.hostiles);
  }
  if (hbSnap && hbSnap.player && (hbSnap.player.facing === 1 || hbSnap.player.facing === -1)) {
    result.facing = hbSnap.player.facing;
  }

  // --- terrain probe (window.HB.levelData.groundH) -----------------------
  // The ground column array the PLAYER's own collision reads (src/sim/level.js
  // imports groundH directly, unlike hostiles, which use the built-face
  // variants), so what this reports and what RIG lands on cannot disagree.
  // Deliberately bounded to PROBE_TILES ahead: a human sees the deck run out
  // well before that at the shipped FAR camera, so this is strictly less
  // information than the screen already gives, and a bounded window keeps the
  // per-tick cost O(12) instead of O(level).
  const gh = HB && HB.levelData && HB.levelData.groundH;
  if (gh && typeof result.x === 'number') {
    const PROBE_TILES = 12;
    const ABSENT = 99;
    const dir = result.facing === -1 ? -1 : 1;
    const i0 = Math.floor(result.x);
    const solidAt = (i) => i >= 0 && i < gh.length && gh[i] > -100;
    const here = solidAt(i0) ? gh[i0] : null;
    // The scan starts at RIG's OWN column, not the next one (T-019). The
    // original started at k=1, which made the reading incoherent exactly when
    // it matters most: mid-fall inside a hole, `gapDist` reported the distance
    // to the next hole column AHEAD (a fraction of a tile) — the same small
    // number as "a hole is right in front of me", which is the opposite
    // situation. Over a hole the honest reading is gapDist 0, and the useful
    // number becomes `landDist` below.
    let gapDist = ABSENT, gapWidth = 0, farY = ABSENT;
    for (let k = 0; k <= PROBE_TILES; k++) {
      const i = i0 + k * dir;
      if (i < 0 || i >= gh.length) break;
      if (gh[i] <= -100) {                       // first hole at or ahead of RIG
        gapDist = k === 0 ? 0 : Math.abs((dir > 0 ? i : i + 1) - result.x);
        let j = i;
        while (j >= 0 && j < gh.length && gh[j] <= -100) j += dir;
        gapWidth = Math.abs(j - i);
        farY = solidAt(j) ? gh[j] : ABSENT;
        break;
      }
    }
    // Where the next landable surface is, measured the way a jump decision
    // actually needs it: 0 while RIG is over solid ground, and otherwise the
    // distance to the near lip of the next solid column. Falling into a hole
    // with `landDist` still small means the far side is reachable; a jump
    // rule can be written on it without knowing whether the hole under RIG is
    // the one it meant to clear.
    let landDist = 0, landY = here;
    if (here === null) {
      landDist = ABSENT; landY = ABSENT;
      for (let k = 1; k <= PROBE_TILES; k++) {
        const i = i0 + k * dir;
        if (i < 0 || i >= gh.length) break;
        if (solidAt(i)) {
          landDist = Math.abs((dir > 0 ? i : i + 1) - result.x);
          landY = gh[i];
          break;
        }
      }
    }
    // The step in front of RIG's feet: how much higher (or lower) the very
    // next column is. The `pinned` predicate reports "jammed while trying to
    // run" without saying WHY, and a bot that answers every pin with a jump
    // pogos against things that are not steps at all — most expensively the
    // screen's own right clamp, which during a gate sits at the corner pivot
    // (src/sim/player.js) and looks exactly like a wall to a policy. 0 over a
    // hole or off the end of the array: a hole is `gapDist`'s business.
    const iAhead = i0 + dir;
    const stepUp = (here !== null && solidAt(iAhead)) ? gh[iAhead] - here : 0;
    result.terrain = { gapDist, gapWidth, farY, groundY: here, landDist, landY, stepUp, probeTiles: PROBE_TILES };
  }
  if (hbSnap && Array.isArray(hbSnap.capsules)) {
    result.capsules = hbSnap.capsules.map((c) => ({ kind: c.kind, letter: c.letter, x: c.x, y: c.y, mode: c.mode }));
  }

  return result;
  /* eslint-enable no-undef */
}

// Shared victory-detection helper for every Node-side consumer
// (lib/metrics.mjs, lib/driver.mjs, lib/policy.mjs) — kept in one place so
// the game's per-slice overlay titles can't drift out of sync across call
// sites the way they did before this fix: the traversal slice's overlay
// reads "TRAVERSAL CLEAR" and the transform slice's reads "BREACH CLEAR"
// (src/ui/overlay.js), but both set the same sim `state: 'VICTORY'`
// (src/main.js) — checking `state` first is slice-agnostic and available in
// testapi/full fidelity; the two overlay-text variants are the dom-mode
// fallback (dom mode never populates `state`). Runs in Node (not shipped to
// the page), so this can import normally, unlike sampleState() above.
export function isVictorySample(sample) {
  return !!sample && (sample.state === 'VICTORY' ||
    sample.ovTitle === 'TRAVERSAL CLEAR' || sample.ovTitle === 'BREACH CLEAR');
}

// Cheap readiness probe used by the driver before sampling/input begin:
// true once the HUD has painted at least one frame's text (proof the game
// loop is alive), independent of fidelity mode.
export function isReady() {
  const el = document.getElementById('hudTL');
  return !!(el && el.textContent && el.textContent.length > 0);
}
