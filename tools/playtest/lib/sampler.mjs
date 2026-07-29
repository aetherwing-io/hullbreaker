// sampler.mjs — the in-page probe. This function is shipped to the browser
// via page.evaluate(sampleState) and must be fully self-contained (no
// closures over anything outside its own body): Playwright serializes it by
// source text and runs it inside the page, not in Node.
//
// Three fidelity channels, checked in this order (highest first):
//
//   'testapi' — globalThis.__HULLBREAKER_TEST__ is present (opt-in via
//               ?testapi=1 on the URL, which run.mjs adds by default). This
//               landed in commit 15f66d2, predates and is independent of the
//               splitter's planned window.HB, and was missed in this
//               harness's first pass — it already gives exact
//               player.{x,y,vx,vy,grounded,traversalState,
//               traversalControlUntil}, scrollX, gameMs, state, an exact
//               (unrounded) edgeMargin, weapon, attempt, falls. The game's
//               own comment documents it as read-only and unable to mutate
//               the simulation.
//
//   'full'    — window.HB is present instead (the splitter's planned debug
//               handle; not present on main as of this writing). Same kind
//               of data, different source.
//
//   'dom'     — neither exists. Falls back to parsing the same numbers the
//               HUD already shows: attempt count, crush-edge margin
//               (sliceStats.minEdgeMargin, pre-computed by the game),
//               kill count, hp pips, current weapon letter, and the
//               dare-pocket/overlay text.
//
// The DOM-derived fields (kills, hp, weapon, overlay/HUD text) are always
// read first as a base layer, then testapi/HB fields are overlaid on top —
// neither telemetry channel exposes kills/hp itself, so even 'testapi'/'full'
// samples still carry them from the HUD.

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
  if (testapi) {
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
    };
  }

  const HB = typeof window !== 'undefined' ? window.HB : undefined;
  if (HB && HB.player) {
    const p = HB.player;
    const ss = HB.sliceStats;
    return {
      ...base,
      fidelity: 'full',
      x: p.x, y: p.y, vx: p.vx, vy: p.vy, grounded: !!p.grounded,
      traversalState: p.traversalState || 'free',
      scrollX: HB.scrollX, state: HB.state,
      weapon: HB.currentWeapon || base.weapon,
      kills: typeof HB.kills === 'number' ? HB.kills : base.kills,
      hostiles: Array.isArray(HB.hostiles) ? HB.hostiles.length : null,
      attempts: ss ? ss.attempts : base.attempts,
      falls: ss ? ss.falls : base.falls,
      airJumps: ss && typeof ss.airJumps === 'number' ? ss.airJumps : null,
      edgeMargin: ss && typeof ss.minEdgeMargin === 'number' ? ss.minEdgeMargin : base.edgeMargin,
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
