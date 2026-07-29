// sampler.mjs — the in-page probe. This function is shipped to the browser
// via page.evaluate(sampleState) and must be fully self-contained (no
// closures over anything outside its own body): Playwright serializes it by
// source text and runs it inside the page, not in Node.
//
// Two fidelity modes, chosen automatically:
//
//   'full' — window.HB is present (the splitter's planned debug handle).
//            Gives raw player position/velocity/grounded, scrollX, game
//            state, sliceStats, currentWeapon, hostile count. This is the
//            only mode that can support idle-time, vertical-range, and
//            route-inference metrics, because those need real (x, y, vx, vy)
//            over time and the HUD never renders position.
//
//   'dom'  — window.HB is absent (true today: nothing has added it yet).
//            Reads the same numbers the HUD already shows: attempt count,
//            crush-edge margin (sliceStats.minEdgeMargin, pre-computed by
//            the game itself), kill count, hp pips, current weapon letter,
//            and the dare-pocket/overlay text state. This mode CANNOT see
//            position or velocity, so idle time / vertical range / route
//            inference are unavailable and reported as such rather than
//            guessed at.
//
// Both modes report every sample with a consistent envelope so metrics.mjs
// doesn't need to know which one produced a given trace point beyond
// checking `.fidelity`.

export function sampleState() {
  /* eslint-disable no-undef */
  const nowMs = performance.now();
  const HB = typeof window !== 'undefined' ? window.HB : undefined;

  if (HB && HB.player) {
    const p = HB.player;
    return {
      fidelity: 'full',
      nowMs,
      x: p.x, y: p.y, vx: p.vx, vy: p.vy, grounded: !!p.grounded, hp: p.hp,
      scrollX: HB.scrollX,
      state: HB.state,
      weapon: HB.currentWeapon,
      kills: HB.kills,
      hostiles: Array.isArray(HB.hostiles) ? HB.hostiles.length : null,
      sliceStats: HB.sliceStats ? {
        attempts: HB.sliceStats.attempts,
        failures: HB.sliceStats.failures,
        falls: HB.sliceStats.falls,
        airJumps: HB.sliceStats.airJumps,
        minEdgeMargin: HB.sliceStats.minEdgeMargin,
      } : null,
      overlayVisible: (function () {
        const el = document.getElementById('overlay');
        return !!el && getComputedStyle(el).display !== 'none';
      })(),
      ovTitle: (document.getElementById('ovTitle') || {}).textContent || '',
    };
  }

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

  return {
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
  };
  /* eslint-enable no-undef */
}

// Cheap readiness probe used by the driver before sampling/input begin:
// true once the HUD has painted at least one frame's text (proof the game
// loop is alive), independent of fidelity mode.
export function isReady() {
  const el = document.getElementById('hudTL');
  return !!(el && el.textContent && el.textContent.length > 0);
}
