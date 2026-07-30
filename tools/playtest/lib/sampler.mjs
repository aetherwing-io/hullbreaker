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
//               airJumps) can't drift apart; HB.snapshot() additionally
//               carries player.{hp,lives,facing,airJumpsLeft}, kills,
//               shotsFired, hostiles, capsules. Note window.HB's *other*
//               top-level members (HB.state, HB.scrollX, HB.currentWeapon,
//               HB.kills, …) are getter *functions*, not values — this
//               sampler only ever reads them through snapshot(), never as
//               bare properties, specifically to avoid that trap.
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
  };

  const testapi = typeof globalThis !== 'undefined' ? globalThis.__HULLBREAKER_TEST__ : undefined;
  if (testapi && typeof testapi.snapshot === 'function') {
    const s = testapi.snapshot();
    return {
      ...base,
      fidelity: 'testapi',
      x: s.player.x, y: s.player.y, vx: s.player.vx, vy: s.player.vy,
      grounded: !!s.player.grounded,
      traversalState: s.player.traversalState || 'free',
      scrollX: s.scrollX, gameMs: s.gameMs, state: s.state,
      edgeMargin: s.edgeMargin,          // exact, not the HUD's 1-decimal display
      weapon: s.weapon || base.weapon,
      attempts: s.attempt, falls: s.falls,
      airJumps: typeof s.airJumps === 'number' ? s.airJumps : null,
    };
  }

  const HB = typeof window !== 'undefined' ? window.HB : undefined;
  if (HB && typeof HB.snapshot === 'function') {
    const s = HB.snapshot();
    return {
      ...base,
      fidelity: 'full',
      x: s.player.x, y: s.player.y, vx: s.player.vx, vy: s.player.vy,
      grounded: !!s.player.grounded,
      traversalState: s.player.traversalState || 'free',
      scrollX: s.scrollX, gameMs: s.gameMs, state: s.state,
      edgeMargin: s.edgeMargin,
      weapon: s.weapon || base.weapon,
      attempts: s.attempt, falls: s.falls,
      airJumps: typeof s.airJumps === 'number' ? s.airJumps : null,
      hp: typeof s.player.hp === 'number' ? s.player.hp : base.hp,
      kills: typeof s.kills === 'number' ? s.kills : base.kills,
      hostiles: Array.isArray(s.hostiles) ? s.hostiles.length : null,
    };
  }

  return base;
  /* eslint-enable no-undef */
}

// Cheap readiness probe used by the driver before sampling/input begin:
// true once the HUD has painted at least one frame's text (proof the game
// loop is alive), independent of fidelity mode.
export function isReady() {
  const el = document.getElementById('hudTL');
  return !!(el && el.textContent && el.textContent.length > 0);
}
