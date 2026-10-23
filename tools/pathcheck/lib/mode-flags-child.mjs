// mode-flags-child.mjs — resolve src/mode.js under each query string and report
// the flags it exported (T-120, proposal §7.4 #8). Usage:
//
//   node mode-flags-child.mjs '["", "slice=traversal", ...]'    prints one JSON line
//
// src/mode.js reads globalThis.__HB_QUERY__ ONCE, when it evaluates. Each query
// gets its own evaluation through a distinct module URL (mode.js?q=<n>); its
// dependencies are shared, which is sound here because only mode.js's own
// exports are read. Run in a fresh process: mode.js's evaluation selects the
// transform fixture as a side effect (pure/transform.js), which must not leak
// into the gate process.

const SRC = new URL('../../../src/', import.meta.url);
const queries = JSON.parse(process.argv[2] || '[""]');
const FLAGS = [
  'HOOK_ENABLED', 'FLOW_ENABLED', 'AUTOBOUNCE_ENABLED', 'RIBRUN_ENABLED', 'CROUCH_ENABLED',
  'ZIPPER_REVEAL', 'IS_G2', 'IS_TRAVERSAL_SLICE', 'IS_TRANSFORM_SLICE', 'HOUND_STAGE', 'POLYP_STAGE',
  'MORTAR_STAGE', 'MOMENTUM_ENABLED', 'SCORE_ENABLED', 'RUN_FALLBACK_ENABLED', 'AIM_ASSIST_ENABLED',
  'JUICE_ENABLED', 'SHELL_ENABLED',
];
const out = [];
for (let i = 0; i < queries.length; i++) {
  globalThis.__HB_QUERY__ = queries[i];
  const M = await import(new URL('mode.js?q=' + i, SRC).href);
  const flags = {};
  for (const f of FLAGS) flags[f] = f in M ? M[f] : '__absent__';
  const slice = M.ACTIVE_SLICE;
  out.push({
    query: queries[i], flags,
    activeSlice: slice ? { id: slice.id, pace: slice.pace?.id ?? null, hook: !!slice.hook, flow: !!slice.flow } : null,
    activeFixture: M.ACTIVE_FIXTURE ? (M.ACTIVE_FIXTURE.id || 'fixture') : null,
  });
}
process.stdout.write(JSON.stringify({ rows: out }) + '\n');
