// deterministic.mjs — honesty check for frame-scoped --deterministic runs.
// The page owns exact input timing now, but a malformed bootstrap, frozen
// shell state, early terminal outcome, or missing telemetry can still make a
// plausible-looking report measure nothing. This pure verdict reads the trace
// and the page-authored ledger and names that failure instead of exiting green.
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
  const wasDispatched = (e) => typeof e.actualDispatchTick === 'number' ||
    typeof e.actualDispatchMs === 'number';
  const dispatched = events.filter(wasDispatched);
  const head = events.find((e) => !wasDispatched(e)) || null;
  const states = {};
  for (const s of trace) if (s && s.state) states[s.state] = (states[s.state] || 0) + 1;
  const stateSummary = Object.entries(states).map(([k, n]) => `${k}×${n}`).join(', ') || 'no state field';
  const clockAdvancedMs = clocks.length ? +(Math.max(...clocks) - Math.min(...clocks)).toFixed(1) : null;
  const d = {
    events: events.length,
    dispatched: dispatched.length,
    pending: events.length - dispatched.length,
    pendingHeadT: head ? head.t : null,
    viaWallclockTitle: 0,
    delivery: 'frame',
    frameInputStatus: result.frameInput && result.frameInput.status || null,
    gameMsSamples: clocks.length,
    gameMsMax: clocks.length ? Math.max(...clocks) : null,
    clockAdvancedMs,
    stopReason: result.stopReason || null,
    pendingExpected: EARLY_STOPS.has(result.stopReason),
    states,
    fatal: null,
    warning: null,
  };
  if (result.frameInput && result.frameInput.status === 'error') {
    d.fatal = `frame input initialization failed: ${result.frameInput.error || 'unknown error'}`;
    return d;
  }
  if (events.length === 0) return d;      // a policy-only script has no timeline to starve
  if (!clocks.length) {
    d.fatal = 'sample.gameMs was never a number in any sample — --deterministic needs the ' +
      'testapi clock and page-authored frame ledger (fidelity was ' +
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
