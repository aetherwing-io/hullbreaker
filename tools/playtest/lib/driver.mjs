// driver.mjs — owns the browser, input delivery, sampling and report evidence.
// Ordinary and policy input travels through real Playwright keyboard events.
// Deterministic static input is different on purpose: the complete immutable
// timeline is installed before navigation, then the game drains it at frame
// start through the same canonical gameplay edge function as the DOM path.

import { chromium } from 'playwright-core';
import { sampleState, isReady, isVictorySample } from './sampler.mjs';
import { probeServedFixture } from './fixture.mjs';
import { evaluatePolicyTick } from './policy.mjs';
import { FRAME_INPUT_VERSION } from '../../../src/pure/frame-input.js';

const DEFAULT_VIEWPORT = { width: 1280, height: 800 };

export async function runPlaytest({
  events,
  url,
  outDir,
  durationMs = 0,
  headed = false,
  sampleMs = 75,
  video = false,
  viewport = DEFAULT_VIEWPORT,
  channel = 'chrome',
  maxRuntimeMs = 25000,
  tailMs = 900,
  victorySettleMs = 400,
  deterministic = false,
  policyRules = null,
  stopOnGameOver = false,
}) {
  const browser = await chromium.launch({ channel, headless: !headed });
  const contextOpts = { viewport };
  if (video) contextOpts.recordVideo = { dir: outDir, size: viewport };
  const context = await browser.newContext(contextOpts);
  const page = await context.newPage();
  const lastEventT = events.reduce((m, e) => Math.max(m, e.t), 0);
  // durationMs is the script's declared minimum window; tailMs is part of the
  // simulation contract in frame mode, not a Node timer noticed after the fact.
  const scriptEndMs = Math.max(lastEventT, durationMs) + tailMs;

  if (deterministic) {
    await page.addInitScript((payload) => {
      Object.defineProperty(globalThis, '__HULLBREAKER_INPUT_BOOTSTRAP__', {
        value: payload,
        configurable: true,
        writable: false,
      });
    }, { version: FRAME_INPUT_VERSION, events, stopAtMs: scriptEndMs });
  }

  const consoleErrors = [];
  const pageErrors = [];
  // I-011: `pageErrors` is the channel a gate reads to decide whether the GAME
  // threw. A policy `tap` releases its key from a fire-and-forget timer (by
  // design — a tap's hold must never block the sample cadence), so a run that
  // ends with a tap in flight used to record `key up failed for Space:
  // ...browser has been closed` in that channel: harness teardown noise sitting
  // in an error channel, which is exactly where noise is expensive. Teardown
  // now (a) cancels pending tap releases and releases those keys while the page
  // is still alive, and (b) buckets anything that still fails against a closing
  // context here instead, so `pageErrors` stays a game-error channel.
  const teardownErrors = [];
  let tearingDown = false;
  const CLOSED_RE = /has been closed|Target closed|Target page, context or browser/i;
  function noteKeyError(message) {
    if (tearingDown || CLOSED_RE.test(message)) teardownErrors.push({ message });
    else pageErrors.push({ message });
  }
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    // Chrome auto-requests /favicon.ico for any page; our minimal static
    // server has no favicon, so this 404 fires every run and is unrelated to
    // the game or the harness. Filtering only this exact, location-verified
    // case — anything else still surfaces so real errors aren't buried.
    const loc = msg.location && msg.location();
    if (loc && /\/favicon\.ico$/.test(loc.url || '') && /404/.test(msg.text())) return;
    consoleErrors.push({ text: msg.text() });
  });
  page.on('pageerror', (err) => {
    pageErrors.push({ message: String(err && err.message || err) });
  });

  await page.goto(url, { waitUntil: 'load' });

  let bootError = null;
  try {
    await page.waitForFunction(isReady, null, { timeout: 8000 });
  } catch (err) {
    bootError = 'game did not reach a rendered HUD frame within 8s of load — ' +
      'treating as a boot failure rather than guessing at state';
  }

  let frameInput = null;
  if (!bootError && deterministic) {
    try {
      frameInput = await page.evaluate(() => {
        const api = globalThis.__HULLBREAKER_TEST__;
        return api && typeof api.inputTimeline === 'function' ? api.inputTimeline() : null;
      });
      if (!frameInput || !['running', 'complete'].includes(frameInput.status)) {
        bootError = 'frame-scoped input did not initialize: ' +
          (frameInput && frameInput.error || 'testapi inputTimeline() is unavailable');
      }
    } catch (err) {
      bootError = `frame-scoped input probe threw: ${String(err && err.message || err)}`;
    }
  }

  // One-time, before any input: ask the SERVED build which fixture it is
  // running (lib/fixture.mjs). Every fixture-derived column in the report is
  // computed against this answer instead of against whatever this checkout's
  // src/pure/traversal.js happens to say — the I-013 contamination class, where
  // a ?ribrun=1 run was credited with four lattice routes it had replaced.
  // Once, not per tick: the connector list is ~20 rows and would bloat every
  // trace sample; the fixture cannot change mid-run (src/mode.js resolves it at
  // load), so a single read is the whole truth.
  let servedFixture = { available: false, reason: 'the page was never probed (boot failure)' };
  if (!bootError) {
    try {
      servedFixture = await page.evaluate(probeServedFixture);
    } catch (err) {
      servedFixture = {
        available: false,
        reason: `the window.HB fixture probe threw: ${String(err && err.message || err)}`,
      };
    }
  }

  const trace = [];
  const achievedSampleIntervalsMs = [];
  let lastSampleAt = null;
  let victorySeenAt = null;
  let gameOverSeenAt = null;
  let stop = false;
  // Why the run ended, in the run's own words — a report that says "42 events
  // pending" is only readable next to the reason sampling stopped.
  let stopReason = null;

  // F7 fix (adversarial report, x4-retry-input-loss): the game's fast retry
  // calls releaseAllKeys() on every SLICE_RETRY -> resetGame() transition, so
  // a scripted key that is still "held" per the script's own timeline (a
  // `hold` from t0 to t1 with no keyup dispatched yet) goes dead in the game
  // the instant a retry fires, and stays dead until the script's own
  // scheduled keyup/keydown next touches that code — measured as 5.2s of
  // zero motion with a key conceptually held. heldCodes tracks what the
  // script currently considers "down" for CDP-delivered input (ordinary
  // static events plus policy holds/taps); the sample loop watches the
  // testapi/HB `attempts` counter (already polled every sampleMs) and, the
  // moment it ticks up, re-dispatches a keydown for every currently-held
  // code. Verified empirically: a second page.keyboard.down() for an
  // already-down code produces a real `repeat: true` keydown (not an error,
  // not a fresh press) — exactly what re-arming a held key should look like,
  // and harmless for jump specifically since the game only schedules a fresh
  // jump buffer on `!e.repeat`. Detection lag is bounded by the polling
  // interval (sampleMs) plus one CDP round-trip, not the multi-second gap
  // the unpatched harness produced — both are recorded in retryReassertions
  // for the report rather than assumed instantaneous.
  const heldCodes = new Set();
  const retryReassertions = [];
  let lastAttemptsForRetry = null;

  const t0 = Date.now();
  const elapsed = () => Date.now() - t0;

  async function pressKey(code) {
    try {
      await page.keyboard.down(code);
    } catch (err) {
      noteKeyError(`key down failed for ${code}: ${err.message}`);
    }
    heldCodes.add(code);
  }
  async function releaseKey(code) {
    try {
      await page.keyboard.up(code);
    } catch (err) {
      noteKeyError(`key up failed for ${code}: ${err.message}`);
    }
    heldCodes.delete(code);
  }

  async function reassertHeldKeys(tMs, attempts) {
    const codes = [...heldCodes];
    if (codes.length === 0) return;
    for (const code of codes) {
      try {
        await page.keyboard.down(code);
      } catch (err) {
        noteKeyError(`retry re-assertion failed for ${code}: ${err.message}`);
      }
    }
    retryReassertions.push({ tMs, attempts, codes });
  }

  // --- Closed-loop policy mode ------------------------------------------
  // See lib/policy.mjs for the condition/action vocabulary. Evaluated every
  // sample tick against that tick's already-polled snapshot — no extra
  // page.evaluate calls. `hold` rules are level-triggered and synced every
  // tick (OR-combined across rules targeting the same code); `tap` rules
  // fire once per false->true edge and self-release after holdMs via a
  // fire-and-forget timer so a tap's hold duration never blocks the sample
  // cadence. Known limitation (documented, not engineered around — this is
  // meant to stay a dumb reflex layer): rapid re-triggering of the same
  // `tap` code before its previous release fires can release early; not
  // expected for the shipped predicates' natural trigger cadence (a hound's
  // `tell` window, a pin against a step) since those don't oscillate faster
  // than one sample interval.
  const policyHeldCodes = new Set();
  const policyLog = [];
  const policyMissingFieldCounts = new Map();
  // Every tap release that has been scheduled but not yet fired (I-011). The
  // run can end at any instant — a hard cap, a victory, a game over — and a
  // timer that outlives the browser context is both a spurious error and a key
  // the game was never told about; both are settled at teardown instead.
  const pendingTapReleases = new Set();

  async function runPolicyTick(sample, tMs) {
    const { desiredHolds, tapsToFire, missingFieldWarnings } = evaluatePolicyTick(policyRules, sample, heldCodes);
    for (const w of missingFieldWarnings) {
      const key = `${w.rule}:${w.field}`;
      policyMissingFieldCounts.set(key, (policyMissingFieldCounts.get(key) || 0) + 1);
    }
    for (const code of desiredHolds) {
      if (!policyHeldCodes.has(code)) {
        await pressKey(code);
        policyHeldCodes.add(code);
        policyLog.push({ tMs, action: 'hold-start', code });
      }
    }
    for (const code of [...policyHeldCodes]) {
      if (!desiredHolds.has(code)) {
        await releaseKey(code);
        policyHeldCodes.delete(code);
        policyLog.push({ tMs, action: 'hold-end', code });
      }
    }
    for (const t of tapsToFire) {
      await pressKey(t.code);
      policyLog.push({ tMs, action: 'tap-down', code: t.code, rule: t.rule });
      const timer = setTimeout(() => {
        pendingTapReleases.delete(entry);
        releaseKey(t.code).then(() => {
          policyLog.push({ tMs: elapsed(), action: 'tap-up', code: t.code, rule: t.rule });
        });
      }, t.holdMs);
      const entry = { timer, code: t.code, rule: t.rule };
      pendingTapReleases.add(entry);
    }
  }

  // Settle every tap whose release timer is still pending, while the page is
  // still open: cancel the timer, release the key for real, and log it as the
  // teardown release it is (`tap-up-teardown`, never a plain `tap-up` — a
  // report should not read as though the tap ran its full holdMs).
  async function flushPendingTapReleases() {
    const entries = [...pendingTapReleases];
    pendingTapReleases.clear();
    for (const e of entries) {
      clearTimeout(e.timer);
      await releaseKey(e.code);
      policyLog.push({ tMs: elapsed(), action: 'tap-up-teardown', code: e.code, rule: e.rule });
    }
    return entries.length;
  }

  async function sampleLoop() {
    while (!stop) {
      const before = elapsed();
      let sample = null;
      try {
        sample = await page.evaluate(sampleState);
      } catch (err) {
        sample = { fidelity: 'error', error: String(err && err.message || err), nowMs: before };
      }
      const tMs = elapsed();
      trace.push({ tMs, ...sample });
      if (lastSampleAt !== null) achievedSampleIntervalsMs.push(tMs - lastSampleAt);
      lastSampleAt = tMs;
      if (sample && isVictorySample(sample) && victorySeenAt === null) {
        victorySeenAt = tMs;
      }
      // --stop-on-game-over (opt-in, default off): the six-face run's terminal
      // failure state. Once the last life is spent the game freezes — gameMs
      // stops advancing, no input changes anything — so every remaining second
      // of the script window is dead trace. Off by default because a report
      // whose length no longer matches its script window is a surprise, and
      // the fixture scripts deliberately keep running through retries; opt in
      // when iterating on a long policy run, where it turns a 4-minute
      // post-mortem into nothing.
      if (stopOnGameOver && sample && sample.state === 'GAME_OVER' && gameOverSeenAt === null) {
        gameOverSeenAt = tMs;
      }
      if (sample && typeof sample.attempts === 'number') {
        if (lastAttemptsForRetry !== null && sample.attempts > lastAttemptsForRetry) {
          await reassertHeldKeys(tMs, sample.attempts);
        }
        lastAttemptsForRetry = sample.attempts;
      }
      if (policyRules && policyRules.length && sample) await runPolicyTick(sample, tMs);
      const frameDone = !!(sample && sample.frameInput && sample.frameInput.status === 'complete');
      // A terminal/pause state intentionally stops gameMs. Preserve the old
      // script-window sampling contract there; during PLAYING, only the exact
      // in-page terminal tick may stop a deterministic run.
      const frozenWindowDone = deterministic && sample && sample.state !== 'PLAYING' &&
        tMs >= scriptEndMs;
      const timeUp = deterministic ? frameDone || frozenWindowDone : tMs >= scriptEndMs;
      const hardCap = tMs >= maxRuntimeMs;
      const victoryDone = victorySeenAt !== null && tMs >= victorySeenAt + victorySettleMs;
      const gameOverDone = gameOverSeenAt !== null && tMs >= gameOverSeenAt + victorySettleMs;
      if (timeUp || hardCap || victoryDone || gameOverDone) {
        stopReason = victoryDone ? 'victory'
          : gameOverDone ? 'game-over'
          : hardCap ? 'max-runtime-ms'
          : 'script-window';
        stop = true;
        break;
      }
      const remaining = Math.max(5, sampleMs - (Date.now() - t0 - before));
      await new Promise((r) => setTimeout(r, remaining));
    }
  }

  async function inputLoop() {
    if (deterministic) return;   // the immutable schedule was installed before navigation
    for (const ev of events) {
      const wait = ev.t - elapsed();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      const dispatchedAt = elapsed();
      if (ev.type === 'keydown') await pressKey(ev.code); else await releaseKey(ev.code);
      ev.actualDispatchMs = dispatchedAt;
      ev.jitterMs = dispatchedAt - ev.t;
      if (stop) break;
    }
  }

  if (!bootError) {
    await Promise.all([sampleLoop(), inputLoop()]);
  }

  // Read the full ledger once. Trace samples carry only a six-field summary,
  // otherwise a 100-event schedule copied 1,000 times would dominate reports.
  if (deterministic) {
    try {
      frameInput = await page.evaluate(() => {
        const api = globalThis.__HULLBREAKER_TEST__;
        return api && typeof api.inputTimeline === 'function' ? api.inputTimeline() : null;
      });
      if (frameInput && Array.isArray(frameInput.events)) {
        for (let i = 0; i < events.length; i++) {
          const actual = frameInput.events[i];
          if (actual && actual.t === events[i].t && actual.type === events[i].type &&
              actual.code === events[i].code) Object.assign(events[i], actual);
        }
      }
      if (frameInput && Array.isArray(frameInput.reassertions)) {
        retryReassertions.push(...frameInput.reassertions.map((r) => ({ ...r, source: 'frame' })));
      }
    } catch (err) {
      pageErrors.push({ message: `frame input teardown probe failed: ${String(err && err.message || err)}` });
    }
  }

  // Teardown starts here: no more input is scheduled, so any keyboard failure
  // from this point on is the harness closing up, not the game (I-011).
  const tapsSettledAtTeardown = await flushPendingTapReleases();
  tearingDown = true;

  let screenshotPath = null;
  try {
    screenshotPath = `${outDir}/screenshot.png`;
    await page.screenshot({ path: screenshotPath });
  } catch (err) {
    screenshotPath = null;
  }

  let videoPath = null;
  const pageVideo = page.video();
  await context.close();
  if (video && pageVideo) {
    try { videoPath = await pageVideo.path(); } catch (err) { videoPath = null; }
  }
  await browser.close();

  return {
    trace,
    servedFixture,
    achievedSampleIntervalsMs,
    consoleErrors,
    pageErrors,
    teardownErrors,
    tapsSettledAtTeardown,
    titleWallclockDispatches: [],
    stopReason: bootError ? 'boot-error' : stopReason,
    bootError,
    wallTimeMs: elapsed(),
    screenshotPath,
    videoPath,
    dispatchedEvents: events,
    retryReassertions,
    maxRetryDetectionLagMs: deterministic && !(policyRules && policyRules.length) ? 0 : sampleMs,
    deterministic,
    frameInput,
    policyLog,
    policyMissingFieldWarnings: [...policyMissingFieldCounts.entries()].map(([key, count]) => {
      const [rule, field] = key.split(':');
      return { rule: Number(rule), field, count };
    }),
  };
}
