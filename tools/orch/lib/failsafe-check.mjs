// failsafe-check.mjs — the PLAY gate's verdict on the failsafe state of a page
// that should be healthy (tools/orch/play-gate.mjs boot and degrade steps).
//
// The failsafe's freeze watchdog (index.html: no frame for freezeStallMs = 4 s,
// a panel that never downgrades) is a frame-time check. On a GPU-less host one
// SwiftShader frame can take longer than that (boot frame times on the 4-core
// cloud host reach 8-100 s under load; SPRINT's environment notes: DPR 3 trips
// it), and the panel is then a measurement of the host — exactly like the frame
// budget, which the integrator made report-only there. So a 'frozen' panel is
// REPORTED only when ALL of these hold: a GPU-less host, no fault, no halt, the
// page measured a frame gap at least that long (HB.perf().worstMs), and the
// frame loop is demonstrably alive — its beat counter advances after the panel
// (a loop that really stopped does not). Any other panel, any fault, a halt, a
// loop that stays stopped — or any of it on a GPU host — FAILS.
//
// Falsified by tools/orch/failsafe-check-probe.mjs against a real page: the
// panel forced over a live loop -> REPORT; the same with the loop stopped
// (requestAnimationFrame swallowed) -> FAIL; a 'crash' panel -> FAIL.

export async function failsafeCheck(page, { gpuLess, aliveWaitMs = 60000 } = {}) {
  const fs = await page.evaluate(() => window.HB.failsafe());
  const perf = await page.evaluate(() => window.HB.perf());
  if (!fs.showing && !fs.halted && !fs.faults) return { status: 'PASS', fs, perf };
  const stall = (fs.policy && fs.policy.freezeStallMs) || 4000;
  if (!(gpuLess && fs.showing === 'frozen' && !fs.halted && !fs.faults && perf && perf.worstMs >= stall))
    return { status: 'FAIL', fs, perf };
  // alive? wait (bounded: a few SwiftShader frames) for the beat counter to move on
  let alive = false;
  try {
    await page.waitForFunction((b) => window.HB.failsafe().beats > b, fs.beats, { timeout: aliveWaitMs });
    alive = true;
  } catch { /* the loop stayed stopped */ }
  if (!alive) return { status: 'FAIL', fs, perf, note: 'the frame loop did not beat again after the freeze panel' };
  return { status: 'REPORT', fs, perf, note: `the freeze watchdog fired on a ${(perf.worstMs / 1000).toFixed(1)} s frame ` +
    `(its bound is ${stall / 1000} s) and the loop kept beating: SwiftShader on this GPU-less host, not the game` };
}
