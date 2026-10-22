#!/usr/bin/env node
// smoke-verdict.mjs <report.json> — the merge gate's smoke criterion.
//
// WHY THIS REPLACED `grep '"result": "completed"'` (2026-10-22). "completed"
// means a victory screen was sampled. Since 7f5b8ae (frame-exact
// deterministic playtests) a --deterministic run freezes the sim on the
// script's exact terminal tick, and neither smoke script reaches victory
// inside its window — so main itself could never pass the old check. The
// gate was last used on 2026-08-02, before that change, which is why nobody
// saw it go permanently red.
//
// What a smoke run must prove is that the build BOOTS and PLAYS the whole
// scripted schedule cleanly. So it passes only if:
//   - the page reached a rendered HUD frame (no bootError);
//   - the deterministic ledger completed: every scheduled event dispatched
//     and the sim stopped on its exact terminal tick;
//   - the page threw nothing (pageErrors empty);
//   - the run did not stall (outcome.result !== 'stalled').
// A death inside the window is reported, not failed: outcome variance is a
// feature (decisions.md entry 19), and a smoke test is not a balance gate.
import { readFileSync } from 'node:fs';

const path = process.argv[2];
let r;
try { r = JSON.parse(readFileSync(path, 'utf8')); }
catch (err) { console.log(`smoke-verdict: FAIL — unreadable report ${path}: ${err.message}`); process.exit(1); }

const problems = [];
const meta = r.meta || {};
const fi = meta.frameInput || {};
if (meta.bootError) problems.push(`boot error: ${meta.bootError}`);
if (fi.status !== 'complete') problems.push(`deterministic ledger status ${fi.status ?? 'missing'}`);
if (fi.nextEvent !== fi.eventCount) problems.push(`dispatched ${fi.nextEvent}/${fi.eventCount} events`);
if (fi.tick !== fi.stopTick) problems.push(`stopped at tick ${fi.tick}, terminal tick ${fi.stopTick}`);
if ((r.pageErrors || []).length) problems.push(`page errors: ${r.pageErrors.map((e) => e.message).join(' | ')}`);
if (r.outcome?.result === 'stalled') problems.push('run stalled (idle > 60% of PLAYING time)');

const tail = `outcome=${r.outcome?.result} deaths=${r.outcome?.deaths} tick=${fi.tick}/${fi.stopTick}`;
if (problems.length) {
  console.log(`smoke-verdict: FAIL — ${problems.join('; ')} (${tail})`);
  process.exit(1);
}
console.log(`smoke-verdict: PASS (${tail})`);
