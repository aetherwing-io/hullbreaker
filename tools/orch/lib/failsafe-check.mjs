// failsafe-check.mjs — the PLAY gate's verdict on the failsafe state of a page
// that should be healthy (tools/orch/play-gate.mjs boot and degrade steps).
//
// The failsafe's freeze watchdog (index.html: no frame for freezeStallMs = 4 s —
// 10 s inside T-105's warm-up, before the first warmBeats frames — and a panel
// that never downgrades) is a frame-time check. On a GPU-less host one
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

import { FAILSAFE } from '../../../src/pure/failsafe.js';

// The bound a frame must have reached for the panel to be the host's doing
// (T-105's warm-up, src/pure/failsafe.js freezeVerdict): before the loop has
// beaten policy.warmBeats times the watchdog waits warmStallMs (10 s); after
// that, freezeStallMs (4 s). A panel read while the page is still inside its
// warm-up can only have fired on the longer bound; read after it, the panel may
// have come up in either phase, so the shorter bound is the one that holds.
export function freezeBoundMs(fs) {
  const P = (fs && fs.policy) || {};
  const warm = P.warmBeats > 0 && (fs.beats || 0) < P.warmBeats;
  return (warm ? P.warmStallMs : P.freezeStallMs) || 4000;
}

export async function failsafeCheck(page, { gpuLess, aliveWaitMs = 60000 } = {}) {
  const fs = await page.evaluate(() => window.HB.failsafe());
  const perf = await page.evaluate(() => window.HB.perf());
  if (!fs.showing && !fs.halted && !fs.faults) return { status: 'PASS', fs, perf };
  const stall = freezeBoundMs(fs);
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
    `(its bound ${stall === FAILSAFE.warmStallMs && fs.beats < FAILSAFE.warmBeats ? 'inside the warm-up ' : ''}is ${stall / 1000} s) ` +
    'and the loop kept beating: SwiftShader on this GPU-less host, not the game' };
}

/* ---------------------------- fixtures (self-test) ---------------------------- */
// A fake page per branch of the rule: what HB.failsafe() and HB.perf() return,
// and whether the beat counter moves on. play-gate.mjs refuses to start if one
// does not hold; tools/pathcheck/t-120-gate-self-tests.mjs asserts them.
const fakePage = ({ fs, perf, beatsMove }) => ({
  evaluate: async (fn) => (String(fn).includes('perf') ? perf : fs),
  waitForFunction: async () => { if (!beatsMove) throw new Error('timeout'); },
});
// the shipped policy, so the fixtures follow a retune of the watchdog
const healthy = { showing: null, halted: false, faults: 0, beats: 100, policy: FAILSAFE };
const frozen = { ...healthy, showing: 'frozen' };
const inWarmUp = { ...frozen, beats: FAILSAFE.warmBeats - 1 };
export const FAILSAFE_FIXTURES = [
  { name: 'healthy page -> PASS', page: { fs: healthy, perf: { worstMs: 9000 } }, gpuLess: true, want: 'PASS' },
  { name: 'GPU-less, frozen panel over a live loop after a 9 s frame -> REPORT',
    page: { fs: frozen, perf: { worstMs: 9000 }, beatsMove: true }, gpuLess: true, want: 'REPORT' },
  { name: 'GPU-less, frozen panel, the loop stays stopped -> FAIL',
    page: { fs: frozen, perf: { worstMs: 9000 }, beatsMove: false }, gpuLess: true, want: 'FAIL' },
  { name: 'GPU-less, frozen panel, no frame as long as the bound -> FAIL',
    page: { fs: frozen, perf: { worstMs: 3999 }, beatsMove: true }, gpuLess: true, want: 'FAIL' },
  { name: 'GPU host, frozen panel -> FAIL', page: { fs: frozen, perf: { worstMs: 9000 }, beatsMove: true }, gpuLess: false, want: 'FAIL' },
  { name: 'frozen panel with a fault -> FAIL', page: { fs: { ...frozen, faults: 1 }, perf: { worstMs: 9000 }, beatsMove: true }, gpuLess: true, want: 'FAIL' },
  { name: 'frozen panel with a halt -> FAIL', page: { fs: { ...frozen, halted: true }, perf: { worstMs: 9000 }, beatsMove: true }, gpuLess: true, want: 'FAIL' },
  { name: 'crash panel -> FAIL', page: { fs: { ...healthy, showing: 'crash' }, perf: { worstMs: 9000 }, beatsMove: true }, gpuLess: true, want: 'FAIL' },
  { name: 'no panel but a fault -> FAIL', page: { fs: { ...healthy, faults: 2 }, perf: { worstMs: 9000 } }, gpuLess: true, want: 'FAIL' },
  // T-105's warm-up: before warmBeats the panel needs a warmStallMs-long silence
  { name: 'GPU-less, frozen panel inside the warm-up after a frame shorter than its 10 s bound -> FAIL',
    page: { fs: inWarmUp, perf: { worstMs: FAILSAFE.warmStallMs - 1000 }, beatsMove: true }, gpuLess: true, want: 'FAIL' },
  { name: 'GPU-less, frozen panel inside the warm-up after a frame past its 10 s bound, loop alive -> REPORT',
    page: { fs: inWarmUp, perf: { worstMs: FAILSAFE.warmStallMs + 2000 }, beatsMove: true }, gpuLess: true, want: 'REPORT' },
];
export async function failsafeSelfTest() {
  const out = [];
  for (const f of FAILSAFE_FIXTURES) {
    const got = await failsafeCheck(fakePage(f.page), { gpuLess: f.gpuLess, aliveWaitMs: 1 });
    out.push({ name: f.name, ok: got.status === f.want, want: f.want, got: got.status });
  }
  return out;
}
