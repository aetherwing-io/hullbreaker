// deterministic.mjs — the honesty check for --deterministic runs (I-018).
//
// --deterministic dispatches an event at the first sample tick where the
// GAME's own clock has reached its `t`. Anything that stops that clock
// therefore stops the run's input, and the report it writes looks like an
// ordinary run that merely didn't get far: a plausible `not-completed`, no
// events, no explanation, exit 0. That is the same class as a gate that
// reports green because its subject was the author's intent rather than what
// happened, and it cost a real cycle to identify from the outside.
//
// The original case was the shell's title screen: ?shell=title parks a
// built-but-FROZEN run in MENU, so gameMs never leaves 0 — and the key that
// would start it is itself gated on that clock. lib/driver.mjs now dispatches
// on the wall clock while the game is parked there, so that shape RUNS instead
// of dying quietly. This module is the backstop for every other way the clock
// can fail to arrive: it reads what actually happened out of the trace and the
// event records, names it, and hands back a verdict run.mjs turns into an exit
// code. It is a pure function of (result, events) — no page, no I/O, no
// clock of its own — so it can be asserted directly in tools/pathcheck.mjs
// against synthetic runs instead of being trusted.
//
// `fatal` is the "this run measured nothing" class and exits non-zero: no
// event dispatched at all, or a sim clock that never advanced by a single
// millisecond. Events left pending with a clock that DID run is not a failure
// — a run legitimately ends at victory, at GAME_OVER, or at --max-runtime-ms
// with its tail unspent, and `stopReason` says which. Those three stops set
// `pendingExpected` and stay quiet on the console (a warning that fires on
// every long policy run is the same noise-in-an-error-channel problem as
// I-011, one channel over); the count is in the ledger either way. A run that
// played its FULL script window and still starved events is the surprising
// shape, and that one warns.

// The three ways a run legitimately ends before its script does.
const EARLY_STOPS = new Set(['victory', 'game-over', 'max-runtime-ms']);

export function diagnoseDeterministicRun(result, events) {
  const trace = result.trace || [];
  const clocks = trace.map((s) => s && s.gameMs).filter((v) => typeof v === 'number');
  const dispatched = events.filter((e) => typeof e.actualDispatchMs === 'number');
  const head = events.find((e) => typeof e.actualDispatchMs !== 'number') || null;
  const states = {};
  for (const s of trace) if (s && s.state) states[s.state] = (states[s.state] || 0) + 1;
  const stateSummary = Object.entries(states).map(([k, n]) => `${k}×${n}`).join(', ') || 'no state field';
  const clockAdvancedMs = clocks.length ? +(Math.max(...clocks) - Math.min(...clocks)).toFixed(1) : null;
  const d = {
    events: events.length,
    dispatched: dispatched.length,
    pending: events.length - dispatched.length,
    pendingHeadT: head ? head.t : null,
    viaWallclockTitle: (result.titleWallclockDispatches || []).length,
    gameMsSamples: clocks.length,
    gameMsMax: clocks.length ? Math.max(...clocks) : null,
    clockAdvancedMs,
    stopReason: result.stopReason || null,
    pendingExpected: EARLY_STOPS.has(result.stopReason),
    states,
    fatal: null,
    warning: null,
  };
  if (events.length === 0) return d;      // a policy-only script has no timeline to starve
  if (!clocks.length) {
    d.fatal = 'sample.gameMs was never a number in any sample — --deterministic keys dispatch to ' +
      'the game\'s own clock and needs testapi or window.HB (fidelity was ' +
      `"${(trace[0] && trace[0].fidelity) || 'unknown'}", states: ${stateSummary})`;
  } else if (clockAdvancedMs === 0) {
    d.fatal = `the game's sim clock never advanced (gameMs stayed at ${d.gameMsMax} across ` +
      `${clocks.length} samples; states: ${stateSummary}) — no event scheduled at t>0 can ever come ` +
      'due, so this run measured nothing';
  } else if (dispatched.length === 0) {
    d.fatal = `no event ever came due: the sim clock reached ${d.gameMsMax}ms and the first event ` +
      `is scheduled at t=${d.pendingHeadT}ms (states: ${stateSummary})`;
  } else if (d.pending > 0 && !d.pendingExpected) {
    d.warning = `${d.pending} of ${events.length} events never dispatched — the run stopped ` +
      `(${d.stopReason || 'unknown reason'}) with the sim clock at ${Math.round(d.gameMsMax)}ms, short of ` +
      `the next event's t=${d.pendingHeadT}ms`;
  }
  return d;
}
