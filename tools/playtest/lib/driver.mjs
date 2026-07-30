// driver.mjs — owns the browser: launch, navigate, replay input with real
// timing, sample state concurrently, and collect everything needed for a
// report. No game state is ever poked or mutated directly — every input is a
// real CDP key event via Playwright's keyboard API, and every read is a
// page.evaluate() over DOM/window, exactly what a human's browser would see.

import { chromium } from 'playwright-core';
import { sampleState, isReady } from './sampler.mjs';

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
}) {
  const browser = await chromium.launch({ channel, headless: !headed });
  const contextOpts = { viewport };
  if (video) contextOpts.recordVideo = { dir: outDir, size: viewport };
  const context = await browser.newContext(contextOpts);
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
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
  let stop = false;

  // F7 fix (adversarial report, x4-retry-input-loss): the game's fast retry
  // calls releaseAllKeys() on every SLICE_RETRY -> resetGame() transition, so
  // a scripted key that is still "held" per the script's own timeline (a
  // `hold` from t0 to t1 with no keyup dispatched yet) goes dead in the game
  // the instant a retry fires, and stays dead until the script's own
  // scheduled keyup/keydown next touches that code — measured as 5.2s of
  // zero motion with a key conceptually held. heldCodes tracks what the
  // script currently considers "down"; the sample loop watches the
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

  async function reassertHeldKeys(tMs, attempts) {
    const codes = [...heldCodes];
    if (codes.length === 0) return;
    for (const code of codes) {
      try {
        await page.keyboard.down(code);
      } catch (err) {
        pageErrors.push({ message: `retry re-assertion failed for ${code}: ${err.message}` });
      }
    }
    retryReassertions.push({ tMs, attempts, codes });
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
      if (sample && sample.ovTitle === 'TRAVERSAL CLEAR' && victorySeenAt === null) {
        victorySeenAt = tMs;
      }
      if (sample && typeof sample.attempts === 'number') {
        if (lastAttemptsForRetry !== null && sample.attempts > lastAttemptsForRetry) {
          await reassertHeldKeys(tMs, sample.attempts);
        }
        lastAttemptsForRetry = sample.attempts;
      }
      const timeUp = tMs >= scriptEndMs;
      const hardCap = tMs >= maxRuntimeMs;
      const victoryDone = victorySeenAt !== null && tMs >= victorySeenAt + victorySettleMs;
      if (timeUp || hardCap || victoryDone) { stop = true; break; }
      const remaining = Math.max(5, sampleMs - (Date.now() - t0 - before));
      await new Promise((r) => setTimeout(r, remaining));
    }
  }

  async function inputLoop() {
    for (const ev of events) {
      const wait = ev.t - elapsed();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      const dispatchedAt = elapsed();
      try {
        if (ev.type === 'keydown') { await page.keyboard.down(ev.code); heldCodes.add(ev.code); }
        else { await page.keyboard.up(ev.code); heldCodes.delete(ev.code); }
      } catch (err) {
        pageErrors.push({ message: `input dispatch failed for ${ev.type} ${ev.code}: ${err.message}` });
      }
      ev.actualDispatchMs = dispatchedAt;
      ev.jitterMs = dispatchedAt - ev.t;
      if (stop) break;
    }
  }

  if (!bootError) {
    await Promise.all([sampleLoop(), inputLoop()]);
  }

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
    bootError,
    wallTimeMs: elapsed(),
    screenshotPath,
    videoPath,
    dispatchedEvents: events,
    retryReassertions,
    maxRetryDetectionLagMs: sampleMs,
  };
}
