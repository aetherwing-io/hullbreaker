// driver.mjs — owns the browser: launch, navigate, replay input with real
// timing, sample state concurrently, and collect everything needed for a
// report. No game state is ever poked or mutated directly — every input is a
// real CDP key event via Playwright's keyboard API, and every read is a
// page.evaluate() over DOM/window, exactly what a human's browser would see.

import { chromium } from 'playwright-core';
import { sampleState, isReady, isVictorySample } from './sampler.mjs';
import { evaluatePolicyTick } from './policy.mjs';

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
  // script currently considers "down" (shared by the static timeline, policy
  // hold rules, and policy taps below); the sample loop watches the
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
  const lastEventT = events.reduce((m, e) => Math.max(m, e.t), 0);
  // durationMs is the script's declared minimum window (e.g. an idle/no-input
  // script has no events at all but must still run its full intended length) —
  // never let a sparse event list truncate the run early.
  const scriptEndMs = Math.max(lastEventT, durationMs) + tailMs;

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

  // --- Deterministic injection mode ------------------------------------
  // Default (deterministic: false) dispatches events on a wall-clock timer
  // (inputLoop below) — subject to Node/CDP round-trip jitter interacting
  // with the game's own variable rAF cadence. The adversarial report
  // measured this compounding into a 28-tile maxX spread from byte-identical
  // input on one build (t2-transform-seam-rush). Deterministic mode instead
  // keys dispatch to the game's own sim clock: every sample tick, dispatch
  // any event whose `t` has been reached by that tick's `gameMs`. This
  // quantizes dispatch to the sample interval (an event scheduled for
  // gameMs=1400 fires at the first tick where gameMs>=1400, up to `sampleMs`
  // of sim time late — reported per-event as `gameMsJitterMs`) rather than
  // eliminating jitter outright; --sample-ms controls that bound. Requires
  // testapi/HB (sample.gameMs must be a number) — dom-only fallback cannot
  // support this mode, and the driver reports an error rather than silently
  // behaving like wall-clock mode.
  //
  // I-018 — the one state where waiting for the clock never ends. The game
  // shell (T-013) parks a built-but-FROZEN run behind its title screen: state
  // is `MENU` and `gameMs` stays at 0 until a key starts the run. In this mode
  // that key is itself gated on `gameMs`, so a script whose first event is at
  // t>0 waits forever — zero events dispatched, every sample `MENU`, and a
  // report that looks like a run that simply didn't get anywhere. The clock
  // cannot start until an event fires, so while (and only while) the game is
  // parked at the title, events are dispatched on the WALL clock instead, and
  // each one is stamped `dispatchedVia: 'wallclock-title'` so no report claims
  // sim-time quantization it did not have. Every other frozen-clock state
  // (PAUSED, the retry freeze, GAME_OVER) keeps the old behaviour on purpose —
  // there the wait DOES end, and waiting is the useful half of this mode.
  let nextDeterministicIdx = 0;
  let deterministicGameMsMissingWarned = false;
  const titleWallclockDispatches = [];

  async function dispatchDueDeterministicEvents(sample, tMs) {
    if (sample.state === 'MENU') {
      while (nextDeterministicIdx < events.length && events[nextDeterministicIdx].t <= tMs) {
        const ev = events[nextDeterministicIdx++];
        if (ev.type === 'keydown') await pressKey(ev.code); else await releaseKey(ev.code);
        ev.actualDispatchMs = tMs;
        ev.jitterMs = tMs - ev.t;
        ev.dispatchedVia = 'wallclock-title';
        titleWallclockDispatches.push({ tMs, t: ev.t, type: ev.type, code: ev.code });
        if (stop) break;
      }
      return;
    }
    if (typeof sample.gameMs !== 'number') {
      if (!deterministicGameMsMissingWarned) {
        pageErrors.push({
          message: 'deterministic mode requested but sample.gameMs is not a number ' +
            '(needs testapi or window.HB) — no events can be dispatched by sim time',
        });
        deterministicGameMsMissingWarned = true;
      }
      return;
    }
    while (nextDeterministicIdx < events.length && events[nextDeterministicIdx].t <= sample.gameMs) {
      const ev = events[nextDeterministicIdx++];
      if (ev.type === 'keydown') await pressKey(ev.code); else await releaseKey(ev.code);
      ev.actualDispatchMs = tMs;
      ev.actualDispatchGameMs = sample.gameMs;
      ev.gameMsJitterMs = +(sample.gameMs - ev.t).toFixed(2);
      ev.jitterMs = tMs - ev.t;   // wall-clock figure too, for cross-mode comparison
      ev.dispatchedVia = 'gameMs';
      if (stop) break;
    }
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
      if (deterministic && sample) await dispatchDueDeterministicEvents(sample, tMs);
      if (policyRules && policyRules.length && sample) await runPolicyTick(sample, tMs);
      const timeUp = tMs >= scriptEndMs;
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
    if (deterministic) return;   // dispatched from sampleLoop instead, keyed to gameMs
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
    achievedSampleIntervalsMs,
    consoleErrors,
    pageErrors,
    teardownErrors,
    tapsSettledAtTeardown,
    titleWallclockDispatches,
    stopReason: bootError ? 'boot-error' : stopReason,
    bootError,
    wallTimeMs: elapsed(),
    screenshotPath,
    videoPath,
    dispatchedEvents: events,
    retryReassertions,
    maxRetryDetectionLagMs: sampleMs,
    deterministic,
    policyLog,
    policyMissingFieldWarnings: [...policyMissingFieldCounts.entries()].map(([key, count]) => {
      const [rule, field] = key.split(':');
      return { rule: Number(rule), field, count };
    }),
  };
}
