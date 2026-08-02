// fixture.mjs — what fixture the SERVED build is actually running, read out of
// the page instead of imported from this checkout.
//
// History, because the shape of this file is the whole fix (SPRINT I-013):
// this module used to `export { TRAVERSAL_FIXTURE } from '../../../src/pure/
// traversal.js'` — the lattice fixture of the tree the harness process happens
// to live in, unconditionally. lib/metrics.mjs then computed route coverage,
// route inference and the dare-pocket columns against it no matter what the
// browser was running. A `?ribrun=1` run (which REPLACES the lattice with one
// ascending ribline, src/pure/ribrun.js) was therefore credited with four
// lattice routes — mid-catwalk, upper-chimney, wall-launch, recovery-scramble
// — and a dare-pocket entry, purely because its (x, y) trace passed through
// the coordinate ranges those features used to occupy. Same class of error for
// a default six-face run (no authored fixture at all) and for `--base-url`
// pointed at a different pinned checkout.
//
// The fix has one rule: ASK THE PAGE. `window.HB.fixture` is the served
// build's own resolved ACTIVE_SLICE (src/main.js) — already overlay-applied
// (?ribrun=1) and pace-resolved (?pace=) — and `HB.snapshot()` says which
// KIND of run this is without parsing the URL:
//
//   - `snapshot.corner` is an object  ->  ACTIVE_FIXTURE === null, i.e. the
//     default six-face run (src/main.js telemetry(): `corner: ACTIVE_FIXTURE
//     ? undefined : cornerTelemetry()`). No authored routes, no dare pocket,
//     and `sliceStats.attempts` never increments.
//   - `snapshot.transform` is an object -> the transformation slice (or ?g2=1).
//     A fixture IS active (so attempts counts retries), but it authors no
//     routes and no dare pocket.
//   - neither -> the traversal slice, and `HB.fixture` carries its connectors,
//     routes and dare pocket.
//
// Nothing here imports game source any more. When the page cannot be asked
// (dom fidelity: no window.HB), the answer is "unknown" and the fixture-derived
// columns are omitted with a reason — never computed against a local guess.

// The in-page half. Serialized to the browser by source text (page.evaluate),
// so it must be self-contained, exactly like sampleState() in sampler.mjs.
// Fields are copied one at a time on purpose: HB.fixture is a live sim object
// and only plain data survives the structured clone.
export function probeServedFixture() {
  /* eslint-disable no-undef */
  const HB = typeof window !== 'undefined' ? window.HB : undefined;
  if (!HB || typeof HB.snapshot !== 'function') {
    return {
      available: false,
      reason: 'window.HB was not present on the page, so the served build could not be ' +
        'asked which fixture it is running (dom-fidelity run, or a build predating the ' +
        'unconditional debug handle)',
    };
  }
  const snap = HB.snapshot();
  const kind = snap && snap.corner !== undefined ? 'default-run'
    : snap && snap.transform !== undefined ? 'transform-slice'
    : 'traversal-slice';
  const f = HB.fixture || null;
  const out = {
    available: true,
    kind,
    // `corner` present <=> ACTIVE_FIXTURE === null <=> sliceStats.attempts is
    // frozen at 1 for the whole session (src/main.js resetGame). This is the
    // served build's own answer to "does the attempt counter mean anything
    // here", which is what SPRINT I-006 needed and nothing published.
    hasActiveFixture: kind !== 'default-run',
    query: typeof location !== 'undefined' ? location.search : '',
    id: f ? f.id : null,
    paceId: f && f.pace ? f.pace.id : null,
    connectors: null,
    routes: null,
    darePocket: null,
  };
  if (f) {
    out.connectors = (f.connectors || []).map((c) => ({ id: c.id, kind: c.kind, x: c.x, y: c.y }));
    out.routes = (f.routes || []).map((r) => ({ id: r.id, connectorIds: (r.connectorIds || []).slice() }));
    if (f.darePocket && f.darePocket.bounds) {
      out.darePocket = {
        bounds: {
          x0: f.darePocket.bounds.x0, x1: f.darePocket.bounds.x1,
          y0: f.darePocket.bounds.y0, y1: f.darePocket.bounds.y1,
        },
        rewardLetter: f.darePocket.reward ? f.darePocket.reward.letter : null,
      };
    }
  }
  return out;
  /* eslint-enable no-undef */
}

// The Node-side half: normalize a probe (or its absence) into the one object
// lib/metrics.mjs asks its questions of. Every "no" carries the reason it will
// print in the report — a fixture-derived column is either computed against
// what was served, or it is absent and says why.
export function describeServedFixture(probe) {
  if (!probe || probe.available !== true) {
    const reason = (probe && probe.reason) ||
      'the served build was never probed for its fixture (harness ran without the ' +
      'one-time window.HB probe, e.g. a boot failure)';
    return {
      known: false, kind: null, id: null, paceId: null,
      hasActiveFixture: null,
      hasRoutes: false, hasDarePocket: false,
      connectors: [], routes: [], darePocket: null,
      reason,
      routeReason: reason,
      pocketReason: reason,
    };
  }
  const routes = probe.routes || [];
  const connectors = probe.connectors || [];
  const pocket = probe.darePocket || null;
  // A pocket collapsed to zero width is the rib run's own way of switching
  // every pocket consumer off (src/pure/ribrun.js: "There is no dare pocket on
  // a single line") — treat it as absent rather than reporting entered=false
  // against a degenerate span the player could not have been inside.
  const pocketReal = !!pocket && pocket.bounds.x1 > pocket.bounds.x0;
  const noFixtureReason = probe.kind === 'default-run'
    ? 'the served build is running the DEFAULT six-face run (window.HB.snapshot().corner is ' +
      'present, so ACTIVE_FIXTURE === null): it authors no connectors, no routes and no dare ' +
      'pocket, so there is nothing for this metric to be computed against'
    : probe.kind === 'transform-slice'
      ? 'the served build is running the TRANSFORMATION slice (?slice=transform / ?g2=1), whose ' +
        'fixture authors no connectors, routes or dare pocket'
      : 'the served traversal fixture (' + (probe.id || 'unknown id') + ') publishes none';
  return {
    known: true,
    kind: probe.kind,
    id: probe.id,
    paceId: probe.paceId,
    hasActiveFixture: probe.hasActiveFixture,
    query: probe.query || '',
    connectors,
    routes,
    darePocket: pocketReal ? pocket : null,
    hasRoutes: routes.length > 0 && connectors.length > 0,
    hasDarePocket: pocketReal,
    reason: null,
    routeReason: routes.length > 0 && connectors.length > 0 ? null : noFixtureReason,
    pocketReason: pocketReal
      ? null
      : (pocket
        ? 'the served fixture (' + (probe.id || 'unknown id') + ') collapses its dare pocket to a ' +
          'zero-width span (x0 === x1), which is how src/pure/ribrun.js switches the pocket off — ' +
          'there is no pocket on this build to enter'
        : noFixtureReason),
  };
}
