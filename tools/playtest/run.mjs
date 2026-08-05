#!/usr/bin/env node
// run.mjs — CLI entry point for the HULLBREAKER bot-player playtest harness.
//
//   node tools/playtest/run.mjs scripts/mid-route.json
//   node tools/playtest/run.mjs scripts/mid-route.json --headed --video
//   node tools/playtest/run.mjs scripts/mid-route.json --url http://localhost:8741/index.html?slice=traversal
//
// See tools/playtest/README.md for the full flag list and script format.

import { readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { startStaticServer } from './lib/server.mjs';
import { compileScript, scriptEndMs } from './lib/compile.mjs';
import { compilePolicy } from './lib/policy.mjs';
import { runPlaytest } from './lib/driver.mjs';
import { diagnoseDeterministicRun } from './lib/deterministic.mjs';
import { computeMetrics } from './lib/metrics.mjs';
import { writeReport } from './lib/report.mjs';
import { GAMEPLAY_CODES } from '../../src/pure/frame-input.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--headed') out.headed = true;
    else if (a === '--video') out.video = true;
    else if (a === '--url') out.url = argv[++i];
    else if (a === '--base-url') out.baseUrl = argv[++i];
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--sample-ms') out.sampleMs = Number(argv[++i]);
    else if (a === '--viewport') out.viewport = argv[++i];
    else if (a === '--channel') out.channel = argv[++i];
    else if (a === '--max-runtime-ms') out.maxRuntimeMs = Number(argv[++i]);
    else if (a === '--tail-ms') out.tailMs = Number(argv[++i]);
    else if (a === '--port') out.port = Number(argv[++i]);
    else if (a === '--no-testapi') out.noTestapi = true;
    else if (a === '--deterministic') out.deterministic = true;
    else if (a === '--stop-on-game-over') out.stopOnGameOver = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else out._.push(a);
  }
  return out;
}

// The game's own ?testapi=1 read-only telemetry hook (commit 15f66d2) is the
// highest-fidelity channel this harness has — see lib/sampler.mjs. On by
// default; --no-testapi opts back out to the DOM/window.HB fallback chain
// (e.g. to test what a "real" browser session with no debug flags sees).
function ensureTestApi(url, enabled) {
  if (!enabled || /[?&]testapi=/.test(url)) return url;
  return url + (url.includes('?') ? '&' : '?') + 'testapi=1';
}

function ensureFixedDt(url, enabled) {
  if (!enabled) return url;
  const parsed = new URL(url);
  if (!parsed.searchParams.has('fixeddt')) parsed.searchParams.set('fixeddt', '16.667');
  const dt = Number(parsed.searchParams.get('fixeddt'));
  if (!Number.isFinite(dt) || dt <= 0)
    throw new Error('--deterministic requires a positive ?fixeddt=<ms>');
  return parsed.toString();
}

function usage() {
  console.log(`Usage: node run.mjs <script.json> [options]

Options:
  --url <url>           Override the target URL entirely (skips the local static server).
  --base-url <origin>   Serve from an already-running static server instead of the ephemeral
                        built-in one (e.g. a pinned git worktree) — the script's own "url" field
                        is still read and appended, unlike --url. See README "Pinned-worktree
                        capture" for the recommended recipe for any batch longer than one run.
  --headed              Show the browser window instead of running headless.
  --video               Record a webm video of the run (Playwright's built-in recorder).
  --out <dir>           Output directory for report.json/summary.md/screenshot (default: runs/<script>-<timestamp>).
  --sample-ms <n>       Requested state-sample interval in ms (default 75).
  --viewport WxH        Viewport size, e.g. 1280x800 (default from script or 1280x800).
  --channel <name>      Playwright browser channel (default "chrome" — the installed system Chrome, no download).
  --max-runtime-ms <n>  Hard cap on total run time in ms (default 25000) — safety net if something hangs.
  --tail-ms <n>         Grace period after the last scripted input before stopping (default 900).
  --port <n>            Fixed port for the local static server (default: OS-assigned free port).
  --no-testapi          Don't append ?testapi=1 (on by default) — falls back to window.HB, then DOM/HUD parsing.
  --deterministic       Install the complete gameplay input schedule before navigation and drain it at the
                        exact fixed-step simulation frame (default ?fixeddt=16.667). The page also freezes at
                        the script's exact terminal tick, removing CDP delivery and sampler-stop jitter.
                        Requires testapi and gameplay keys only; shell/pause/restart tests use ordinary mode.
  --stop-on-game-over   End the run once the game reaches GAME_OVER (last life spent) instead of sampling a frozen
                        world for the rest of the script window. Off by default; the run's own outcome is unchanged.

A script may declare "policy": { "rules": [...] } for closed-loop reactive input (see README "Closed-loop policy mode")
alongside or instead of "events"/"moves". Policy rules run regardless of --deterministic; the two are independent.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.length === 0) { usage(); process.exit(args.help ? 0 : 1); }

  const scriptPath = resolve(args._[0]);
  const script = JSON.parse(await readFile(scriptPath, 'utf8'));
  const scriptName = script.name || basename(scriptPath, '.json');

  const events = compileScript(script);
  const endMs = scriptEndMs(events, script);
  if (args.deterministic && args.noTestapi)
    throw new Error('--deterministic requires the testapi channel; remove --no-testapi');
  if (args.deterministic) {
    const allowed = new Set(GAMEPLAY_CODES);
    const shellEvent = events.find((e) => !allowed.has(e.code));
    if (shellEvent) throw new Error(`--deterministic accepts gameplay input only; ${shellEvent.code} ` +
      'belongs to the shell/browser path and must be tested without --deterministic');
    const targetSpec = args.url || script.url || 'index.html?slice=traversal';
    const targetQuery = new URL(targetSpec, 'http://playtest.invalid/').searchParams;
    if (targetQuery.get('shell') === 'title')
      throw new Error('--deterministic cannot start a ?shell=title page because the simulation clock is ' +
        'intentionally frozen in MENU; test title-screen behavior with ordinary real-key mode');
  }

  let policyRules = null;
  if (script.policy) {
    policyRules = compilePolicy(script.policy);
    // A code with genuinely ambiguous ownership (both a static hold/tap and
    // a policy `hold` rule) is a script bug, not something to silently
    // arbitrate — same philosophy as compile.mjs's double-edge check.
    // Policy `tap` actions are deliberately not checked here: a tap is a
    // momentary edge-triggered press, and coexisting with a static tap on
    // the same code is unusual but not structurally ambiguous the way two
    // `hold` owners would be.
    const staticCodes = new Set(events.map((e) => e.code));
    const holdCodes = policyRules.filter((r) => r.action.kind === 'hold').map((r) => r.action.code);
    for (const code of holdCodes) {
      if (staticCodes.has(code)) {
        throw new Error(`policy "hold" rule targets ${code}, which the script's static events/moves ` +
          'list also controls — pick one owner per code');
      }
    }
  }

  let viewport = { width: 1280, height: 800 };
  if (args.viewport) {
    const [w, h] = args.viewport.split('x').map(Number);
    viewport = { width: w, height: h };
  } else if (script.viewport) {
    viewport = script.viewport;
  }

  let server = null;
  let url = args.url;
  if (!url && args.baseUrl) {
    // Adopted from scripts/adversarial/repeat.mjs's --base-url: read the
    // script's own url field (same as the built-in server path below) but
    // against an already-running static server instead of an ephemeral one
    // — the point being a pinned git worktree, so a multi-minute batch
    // describes exactly one build instead of whatever merged mid-flight.
    const scriptUrl = script.url || 'index.html?slice=traversal';
    url = `${args.baseUrl.replace(/\/$/, '')}/${scriptUrl.replace(/^\//, '')}`;
  } else if (!url) {
    server = await startStaticServer(repoRoot, { port: args.port || 0 });
    const scriptUrl = script.url || 'index.html?slice=traversal';
    url = `${server.baseUrl}/${scriptUrl.replace(/^\//, '')}`;
  }
  url = ensureTestApi(url, !args.noTestapi);
  url = ensureFixedDt(url, !!args.deterministic);

  const outDir = args.out
    ? resolve(args.out)
    : join(here, 'runs', `${scriptName}-${Date.now()}`);

  console.log(`[playtest] script:  ${scriptName} (${events.length} events` +
    `${policyRules ? `, ${policyRules.length} policy rules` : ''}, script window ${endMs}ms)`);
  console.log(`[playtest] url:     ${url}`);
  console.log(`[playtest] out:     ${outDir}`);
  if (args.deterministic) console.log('[playtest] mode:    frame-scoped deterministic input + exact sim stop');
  if (args.deterministic && policyRules)
    console.log('[playtest] note:    static events are frame-exact; reactive policy remains sampled/CDP input');

  const startedAt = new Date().toISOString();
  let result;
  try {
    result = await runPlaytest({
      events, url, outDir,
      durationMs: script.durationMs || 0,
      headed: !!args.headed,
      video: !!args.video,
      sampleMs: args.sampleMs || 75,
      viewport,
      channel: args.channel || 'chrome',
      maxRuntimeMs: args.maxRuntimeMs || 25000,
      tailMs: args.tailMs != null ? args.tailMs : 900,
      deterministic: !!args.deterministic,
      stopOnGameOver: !!args.stopOnGameOver,
      policyRules,
    });
  } finally {
    if (server) await server.close();
  }

  const metrics = computeMetrics(result.trace, {
    events: result.dispatchedEvents,
    wallTimeMs: result.wallTimeMs,
    achievedSampleIntervalsMs: result.achievedSampleIntervalsMs,
    // the URL is evidence too (?enemies=0 is slice-only — SPRINT I-026), and
    // servedFixture is what every fixture-derived column is computed against
    // instead of this checkout's own src/pure/traversal.js (SPRINT I-013).
    url,
    servedFixture: result.servedFixture,
  });

  const jitterField = args.deterministic ? 'gameMsJitterMs' : 'jitterMs';
  const jitters = result.dispatchedEvents.filter((e) => typeof e[jitterField] === 'number')
    .map((e) => e[jitterField]);
  const avgJitter = jitters.length ? +(jitters.reduce((a, b) => a + Math.abs(b), 0) / jitters.length).toFixed(1) : null;
  const maxJitter = jitters.length ? Math.max(...jitters.map(Math.abs)) : null;

  // Honesty check (I-018): lib/deterministic.mjs holds the verdict logic and
  // the reasoning. A deterministic run whose events never came due is a no-op
  // run, and a no-op run that exits 0 is the expensive kind of quiet.
  const deterministic = args.deterministic
    ? diagnoseDeterministicRun(result, result.dispatchedEvents)
    : null;
  if (deterministic && deterministic.fatal) {
    console.error(`[playtest] ERROR: --deterministic dispatched ${deterministic.dispatched} of ` +
      `${deterministic.events} scripted events — ${deterministic.fatal}`);
    process.exitCode = 1;
  } else if (deterministic && deterministic.warning) {
    console.warn(`[playtest] WARNING: ${deterministic.warning}`);
  }

  // Report paths relative to the repo root / output dir rather than absolute
  // filesystem paths — those are local-machine-specific and would otherwise
  // get baked verbatim into a committed report.json.
  const report = {
    meta: {
      scriptName, scriptPath: relative(repoRoot, scriptPath), description: script.description || null,
      url, startedAt, wallTimeMs: result.wallTimeMs,
      viewport, sampleIntervalRequestedMs: args.sampleMs || 75,
      bootError: result.bootError,
      dispatchJitterMsAvg: avgJitter, dispatchJitterMsMax: maxJitter,
      deterministic: result.deterministic,
      deterministicScope: args.deterministic
        ? (policyRules ? 'static-schedule-only; policy is external sampled/CDP input'
          : 'complete static schedule and terminal tick')
        : null,
      frameInput: result.frameInput,
      // Why sampling stopped: victory / game-over / max-runtime-ms /
      // script-window / boot-error. The number of events left pending only
      // reads correctly next to this.
      stopReason: result.stopReason,
      // I-018: the deterministic-dispatch ledger — how many of the script's
      // events actually fired, how far the game's own clock got, and the named
      // reason if any of them never came due. `null` on a wall-clock run.
      deterministicDispatch: deterministic,
    },
    outcome: metrics.outcome,
    metrics,
    // F7 fix: ordinary/policy input is reasserted by the driver when attempts
    // changes; frame input is reasserted synchronously inside resetGame(). The
    // source field names which contract produced each evidence row.
    retryReassertions: result.retryReassertions,
    retryDetection: {
      maxLagMs: result.maxRetryDetectionLagMs,
      count: result.retryReassertions.length,
    },
    // Closed-loop policy mode (lib/policy.mjs): every hold-start/hold-end/
    // tap-down/tap-up the driver dispatched from a rule, plus how many times
    // each rule's condition referenced a sample field that was never
    // present (a likely typo or a field this fidelity/slice doesn't carry —
    // see README "Closed-loop policy mode").
    policy: policyRules ? {
      rules: policyRules.map((r) => ({ index: r.index, when: r.when, action: r.action, fireCount: r.fireCount })),
      log: result.policyLog,
      missingFieldWarnings: result.policyMissingFieldWarnings,
    } : null,
    consoleErrors: result.consoleErrors,
    pageErrors: result.pageErrors,
    // I-011: harness-teardown keyboard failures (a tap release racing the
    // browser context closing), kept OUT of pageErrors so that channel still
    // means "the game threw". Normally empty — taps in flight are cancelled and
    // released at teardown; this is the residue if one still loses the race.
    teardownErrors: result.teardownErrors,
    tapsSettledAtTeardown: result.tapsSettledAtTeardown,
    events: result.dispatchedEvents,
    trace: result.trace,
    screenshot: result.screenshotPath && basename(result.screenshotPath),
    video: result.videoPath && basename(result.videoPath),
  };

  await writeReport(outDir, report);

  console.log(`[playtest] outcome: ${metrics.outcome.result} (fidelity: ${metrics.fidelity}${metrics.highFidelityDetected ? '' : ', degraded — no testapi/window.HB'})`);
  console.log(`[playtest] deaths:  ${metrics.deaths === null ? 'UNAVAILABLE' : metrics.deaths}` +
    (metrics.deathsSource ? ` (from ${metrics.deathsSource})` : ` — ${metrics.deathsUnavailableReason}`) +
    `; served build: ${metrics.servedFixture.known ? `${metrics.servedFixture.kind}${metrics.servedFixture.id ? ` (${metrics.servedFixture.id})` : ''}` : 'unknown, fixture columns omitted'}`);
  // A flag that silently did nothing is the kind of thing a reader trusts
  // because nothing said otherwise (SPRINT I-026) — so say it, loudly, here as
  // well as in report.json and summary.md.
  if (metrics.hostilePresence.enemiesFlag && metrics.hostilePresence.enemiesFlag.honoured === false) {
    console.error(`[playtest] WARNING: ${metrics.hostilePresence.enemiesFlag.note}`);
  }
  if (policyRules) {
    const fires = policyRules.reduce((a, r) => a + r.fireCount, 0);
    console.log(`[playtest] policy:  ${fires} tap fire(s) across ${policyRules.length} rule(s)` +
      (report.policy.missingFieldWarnings.length
        ? `; WARNING missing fields: ${report.policy.missingFieldWarnings.map((w) => `${w.field}(rule ${w.rule}, x${w.count})`).join(', ')}`
        : ''));
  }
  console.log(`[playtest] report:  ${outDir}/report.json`);
  console.log(`[playtest] summary: ${outDir}/summary.md`);
  if (result.bootError) {
    console.error(`[playtest] BOOT ERROR: ${result.bootError}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[playtest] fatal:', err);
  process.exit(1);
});
