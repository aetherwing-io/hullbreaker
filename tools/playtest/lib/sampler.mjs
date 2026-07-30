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
//               airJumps, transform, pace, pursuitSpeed/Peak, setbacks)
//               can't drift apart; HB.snapshot() additionally carries
//               player.{hp,lives,facing,airJumpsLeft}, kills, shotsFired,
//               hostiles, capsules. Note window.HB's *other* top-level
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
// Hostiles/capsules enrichment (added for the closed-loop policy mode, which
// needs to react to e.g. a houndframe's `tell` telegraph): window.HB is
// unconditional, so its snapshot's `hostiles`/`capsules` arrays are merged in
// as an extra layer *regardless* of which channel is primary for physics —
// testapi does not expose hostiles/capsules at all as of this writing (see
// README hook request), so this is currently the only source for them.

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
    hostiles: null, capsules: null,
  };

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

  if (hbSnap && Array.isArray(hbSnap.hostiles)) {
    result.hostiles = hbSnap.hostiles.map((h) => ({
      id: h.id, kind: h.kind, x: h.x, y: h.y, hp: h.hp,
      state: h.state, dir: h.dir,          // houndframe: prowl/tell/charge/skid/tumble
      materialized: h.materialized,
    }));
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
