/* ========================= FAILSAFE (view) ======================== */
/* The module-side half of the durability pass (T-032). It owns nothing a
   player can see: the panel, its words and its watchdogs all live in the
   inline bootstrap at the top of index.html, because the failure this task
   exists for — a module that never parsed — happens before any of src/
   runs. What this file adds is everything that needs the running game:

     - the frame loop's heartbeat, so the inline freeze watchdog can tell a
       live loop from a wedged one;
     - the fault policy (src/pure/failsafe.js) applied to exceptions caught
       inside the frame loop, and to uncaught errors the bootstrap hands
       back once the game is up;
     - the one recovery the game can perform by itself, a full resetGame()
       through the host hook src/main.js installs;
     - the read surfaces ?selftest=1 and window.HB use to prove all of the
       above without a person watching.

   It degrades quietly: with no bootstrap present (a host page that is not
   index.html) every call here is a no-op except the policy itself, which
   still stops a run from grinding on a permanently throwing frame. */

import {
  FAILSAFE, faultStep, freshFaultState, plainLanguageIssues,
} from '../pure/failsafe.js';

const api = (typeof window !== 'undefined' && window.__HB_FAILSAFE) || null;

let host = null;                 // { restart } — installed by src/main.js
let fault = freshFaultState();
let faultsSeen = 0;
let lastFault = '';
let logged = 0;                  // console lines spent (bounded: a broken
                                 //   frame must not also flood the log)

const LOG_LIMIT = 12;

function log(line) {
  if (logged >= LOG_LIMIT) return;
  logged++;
  console.error('HULLBREAKER failsafe: ' + line +
    (logged === LOG_LIMIT ? ' (further failsafe lines suppressed)' : ''));
}

function describe(where, err) {
  const msg = err && err.message ? err.message : String(err);
  const stack = err && err.stack ? String(err.stack).split('\n').slice(0, 4).join('\n') : '';
  return where + ': ' + msg + (stack ? '\n' + stack : '');
}

function nowMs() {
  return typeof performance !== 'undefined' && performance.now
    ? performance.now() : Date.now();
}

/* src/main.js hands over the one repair the game can make on its own. */
export function installFailsafe(h) { host = h; }

/* Called once per frame at the top of the loop. The inline watchdog reads
   this counter: a page that is visible, whose own timers are running on
   time, and whose heartbeat has not moved for seconds, is stuck — and a
   stuck game gets a panel instead of a still picture. */
export function failsafeBeat() { if (api) api.beat(); }

/* The last statement of src/main.js. Until this fires, ANY uncaught error
   is treated as "the game could not start". */
export function failsafeBooted() { if (api) api.booted(); }

/* The frame loop stands down when this is true — the panel is up and
   stepping the simulation further can only make the detail behind it
   less true. */
export function failsafeHalted() { return fault.halted; }

/* One caught exception. Returns the action taken: 'ignore', 'recover' or
   'stop'. The caller keeps rendering on 'ignore' and 'recover'. */
export function reportFault(where, err) {
  faultsSeen++;
  lastFault = describe(where, err);
  const next = faultStep(fault, nowMs(), FAILSAFE);
  fault = {
    faults: next.faults, firstMs: next.firstMs, lastMs: next.lastMs,
    recoveries: next.recoveries, halted: next.halted,
  };
  if (next.action === 'ignore') {
    if (faultsSeen <= 3 || next.faults === 1) log(lastFault);
    if (api) api.note(lastFault);
    return 'ignore';
  }
  if (next.action === 'recover') {
    log('restarting the run after a broken frame — ' + lastFault);
    if (api) api.note('restarting the run — ' + lastFault);
    let restarted = false;
    try {
      if (host && host.restart) { host.restart(); restarted = true; }
    } catch (e) {
      log('the restart itself failed — ' + describe('restart', e));
      if (api) api.note('the restart itself failed — ' + describe('restart', e));
    }
    if (restarted) return 'recover';
    fault.halted = true;                  // nothing left to try
  }
  log('stopping: the game could not fix itself — ' + lastFault);
  fault.halted = true;
  if (api) api.show('crash', lastFault);
  return 'stop';
}

/* The rendering context can vanish under a player (a GPU reset, a laptop
   waking up) with no exception thrown and the loop still beating: the
   canvas simply stops changing. That is exactly the "frozen canvas, live
   page" defect, so it gets the panel rather than a silent still frame.
   Recovering a lost context in place would mean re-uploading every buffer
   mid-run; a reload is the honest repair, and it is one keypress. */
export function reportContextLost() {
  fault.halted = true;
  lastFault = 'the drawing surface was lost';
  log(lastFault);
  if (api) api.show('frozen', lastFault);
}

/* Uncaught errors the bootstrap catches AFTER the game is up are routed
   here so one policy governs everything: a stray blip is noted and the run
   continues, a storm is treated exactly like a broken frame. */
if (api) {
  api.onUncaught = (detail) => {
    faultsSeen++;
    lastFault = String(detail);
    const next = faultStep(fault, nowMs(), FAILSAFE);
    fault = {
      faults: next.faults, firstMs: next.firstMs, lastMs: next.lastMs,
      recoveries: next.recoveries, halted: next.halted,
    };
    if (next.action === 'recover') {
      log('restarting the run after a burst of failures');
      try { if (host && host.restart) host.restart(); } catch (e) { fault.halted = true; }
    } else if (next.action === 'stop') {
      fault.halted = true;
      api.show('crash', lastFault);
    }
  };
}

/* Read-only: rides window.HB and feeds ?selftest=1. */
export function failsafeSnapshot() {
  return {
    installed: !!api,
    booted: !!api && api.isBooted(),
    showing: api ? api.showing() : null,
    halted: fault.halted,
    faults: faultsSeen,
    recoveries: fault.recoveries,
    beats: api ? api.beats() : 0,
    uncaught: api ? api.errors() : 0,
    lastFault,
    policy: FAILSAFE,
  };
}

/* ?selftest=1 only: paint the real panel, measure what LANDED (not what
   the text table says), and put it away again. A panel that is styled out
   of existence, or that grew engineer words, fails here. */
export function failsafeSelfCheck() {
  const out = { visible: false, reachableReload: false, issues: [], words: '' };
  if (!api) { out.issues.push('no failsafe bootstrap in the host page'); return out; }
  const wasShowing = api.showing();
  api.show('crash', 'selftest: painting the panel on purpose');
  const box = document.getElementById('fail');
  const btn = document.getElementById('failBtn');
  out.visible = !!box && box.classList.contains('on') &&
    box.getBoundingClientRect().height > 0 &&
    getComputedStyle(box).display !== 'none';
  out.reachableReload = !!btn && btn.getBoundingClientRect().height > 0 &&
    btn.textContent.trim().length > 0 && (api.keys || []).indexOf('KeyR') >= 0;
  const parts = [];
  for (const el of document.querySelectorAll('#fail .fail-plain')) parts.push(el.textContent);
  out.words = parts.join(' ');
  if (parts.length < 4) out.issues.push('the panel painted only ' + parts.length + ' lines');
  for (const part of parts) out.issues.push(...plainLanguageIssues(part));
  if (!wasShowing) api.hide();
  return out;
}
