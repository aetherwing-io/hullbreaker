// Domain: T-105 the phone shell (decisions.md entry 20 + addendum) ===========
//
// What a phone player sees that is not the touch deck: the words every screen
// speaks, the failsafe panel and its freeze watchdog, and home-screen play.
// The layout half (text fit, the HUD budget, safe areas, rotation, preload
// request counts, audio in the gesture) needs a browser and lives in
// tools/playtest/phone-shell.mjs. What is held HERE is everything that does
// not:
//
//   - the copy tables (src/pure/shell-copy.js): the keyboard-copy scan finds
//     every keyboard instruction the game prints (so it can fail), finds
//     nothing in any touch string, and every touch button does in its state
//     exactly what the key it stands for does;
//   - the INLINE bootstrap in index.html, run for real against a fake clock
//     and a stub DOM: a 6 s frame stall before the first frames earns no
//     "got stuck" panel, the same stall after warm-up does, a loop that never
//     starts is still reported, and the panel's hint says "tap" exactly where
//     a touch deck would install;
//   - the inline copies of pure policy (freezeVerdict, the hint mode) agree
//     with src/pure over seeded inputs;
//   - home-screen play: the web app manifest and the iOS meta tags, with
//     every icon present at its declared size;
//   - the preload list: each preloaded image is requested in the mode its
//     consumer uses, so it is fetched once, not twice;
//   - T-126: a touch control that ends or leaves the run arms on its first
//     tap and confirms only on a second tap inside the window
//     (confirmTap's decisions, and which controls it covers — tied to the
//     intent table). The DOM half (the real taps, the disarm-on-any-other-
//     tap, the reload's history entry, 44 px targets) needs a browser:
//     tools/playtest/touch-proof.mjs --only pause.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { FAILSAFE, freezeVerdict, plainLanguageIssues } from '../../src/pure/failsafe.js';
import {
  CONFIRM_ACTIONS, CONFIRM_LABELS, CONFIRM_TAP, INPUT_MODES, PANEL_ACTIONS, SHELL_COPY,
  TOUCH_ACTION_KEYS, confirmLabel, confirmTap, failsafeHintMode, keyboardCopyHits, needsConfirm,
  panelActions, shellCopyMode, shellLine,
} from '../../src/pure/shell-copy.js';
import { shellKeyIntent } from '../../src/pure/shell.js';
import { resolveTouchScheme } from '../../src/pure/touch-stick.js';
import { mulberry32 } from '../../src/pure/rng.js';
import { here, ok } from './_context.mjs';

export const title = 'T-105: the phone shell (copy, failsafe watchdog, home-screen play)';

const ROOT = join(here, '..');
const HTML = readFileSync(join(ROOT, 'index.html'), 'utf8');

/* ------------------- the inline bootstrap, run for real ------------------- *
 * The classic <script> at the top of index.html, executed with a fake clock
 * (setTimeout / setInterval / Date) and a stub DOM. Nothing is re-implemented:
 * the watchdog that runs here is the one a browser runs.                     */
function bootstrap({ search = '', maxTouchPoints = 0, coarse = false } = {}) {
  const m = /<script>([\s\S]*?)<\/script>/.exec(HTML);
  if (!m) throw new Error('no inline bootstrap in index.html');
  const clock = { now: 1_000_000 };
  const timers = [];
  let seq = 0;
  const schedule = (fn, ms, every) => { timers.push({ at: clock.now + Math.max(0, ms), fn, every, id: ++seq }); return seq; };
  const advanceTo = (t) => {
    for (;;) {
      timers.sort((a, b) => a.at - b.at || a.id - b.id);
      const next = timers[0];
      if (!next || next.at > t) break;
      timers.shift();
      clock.now = next.at;
      if (next.every) timers.push({ ...next, at: next.at + next.every, id: ++seq });
      next.fn();
    }
    clock.now = t;
  };
  const els = {};
  const el = (id) => (els[id] ||= {
    id, textContent: '', focus() {},
    classList: { set: new Set(), add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); }, contains(c) { return this.set.has(c); } },
  });
  const doc = { visibilityState: 'visible', getElementById: el, addEventListener() {} };
  const win = {};
  class FakeDate {
    constructor() { this.t = clock.now; }
    static now() { return clock.now; }
    toISOString() { return new Date(this.t).toISOString(); }
  }
  const run = new Function('window', 'document', 'navigator', 'location', 'addEventListener',
    'setTimeout', 'setInterval', 'Date', 'matchMedia', 'URLSearchParams', m[1]);
  run(win, doc, { maxTouchPoints }, { search, reload() {}, href: '' }, () => {},
    (fn, ms) => schedule(fn, ms, 0), (fn, ms) => schedule(fn, ms, ms), FakeDate,
    () => ({ matches: coarse }), URLSearchParams);
  const api = win.__HB_FAILSAFE;
  // drive `ms` of wall clock; `fps` > 0 beats the frame loop like main.js does
  const play = (ms, { fps = 0, hidden = false } = {}) => {
    doc.visibilityState = hidden ? 'hidden' : 'visible';
    const end = clock.now + ms;
    const seen = [];
    const step = fps > 0 ? 1000 / fps : 50;
    while (clock.now < end) {
      advanceTo(Math.min(end, clock.now + step));
      if (fps > 0 && !hidden) api.beat();
      const s = api.showing();
      if (s && seen[seen.length - 1] !== s) seen.push(s);
    }
    doc.visibilityState = 'visible';
    return seen;
  };
  // exactly n frames, 16 ms apart (wall-clock stepping would drift a beat)
  const frames = (n) => {
    const seen = [];
    for (let i = 0; i < n; i++) {
      advanceTo(clock.now + 16);
      api.beat();
      const s = api.showing();
      if (s && seen[seen.length - 1] !== s) seen.push(s);
    }
    return seen;
  };
  return { api, clock, play, frames, el };
}

/* the inline function named `name`, compiled on its own */
function inlineFunction(name) {
  const m = new RegExp(`function ${name}\\(([^)]*)\\) \\{([\\s\\S]*?)\\n  \\}`).exec(HTML);
  if (!m) return null;
  return new Function(...m[1].split(',').map((s) => s.trim()), m[2]);
}

function pngInfo(path) {
  const b = readFileSync(path);
  const sig = b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  return { sig, w: b.readUInt32BE(16), h: b.readUInt32BE(20), colorType: b[25] };
}

export async function run() {
  /* ----------------------------- the copy -------------------------------- */
  {
    // The scan binds: every keyboard instruction the game prints is found.
    const keyLines = ['titlePrompt', 'pausedLine', 'sliceRetryLine', 'gameOverLine', 'replayLine', 'victoryLine']
      .map((k) => SHELL_COPY.keys[k]);
    const legend = SHELL_COPY.keys.titleLegend.map(([w, h]) => w + ' ' + h).join(' · ');
    const panels = Object.values(PANEL_ACTIONS.keys).flat().map(([k, what]) => k + ' ' + what);
    const missed = [...keyLines, legend, ...panels, SHELL_COPY.keys.weaponSwap + 'RIFLE',
      SHELL_COPY.keys.weaponSwapCompact + 'RIFLE', 'Press R, or click the button, to play again.']
      .filter((line) => keyboardCopyHits(line).length === 0);
    ok(missed.length === 0,
       'T-105: the keyboard-copy scan finds every keyboard instruction the game prints ' +
       '(so a phone screen that still shows one fails)' + (missed.length ? ' — missed: ' + missed.join(' | ') : ''));

    // …and finds nothing in what a touch player is told.
    const touchStrings = [];
    for (const [k, v] of Object.entries(SHELL_COPY.touch)) {
      if (v === null) continue;
      if (k === 'titleLegend') v.forEach(([w, h]) => touchStrings.push(w + ' ' + h));
      else touchStrings.push(v + (k.startsWith('weaponSwap') ? 'RIFLE' : ''));
    }
    for (const rows of Object.values(PANEL_ACTIONS.touch)) rows.forEach(([, label]) => touchStrings.push(label));
    const hits = touchStrings.flatMap((s) => keyboardCopyHits(s).map((h) => `"${h.match}" in "${s}"`));
    ok(touchStrings.length >= 12 && hits.length === 0,
       'T-105: no touch-mode string names a key or says press/click (' + touchStrings.length +
       ' strings)' + (hits.length ? ' — ' + hits.join(', ') : ''));

    // Words that look like keys but are the game's own vocabulary stay clean:
    // weapon classes in brackets, gun labels, run stats.
    const vocab = ['[R] RIVETGUN', '[S·III] FRK/SKR/VOL SCATTERBLOOM', 'K / 100', 'WAVE 1/6 · OBSERVE · CONTACT',
      'PRESSURE', 'ENTERING THE NECK', 'TAP TO CLIMB AGAIN', 'SWAP ↔ RIFLE'];
    const noisy = vocab.filter((s) => keyboardCopyHits(s).length > 0);
    ok(noisy.length === 0, 'T-105: the scan does not mistake game vocabulary for key names' +
       (noisy.length ? ' — flagged: ' + noisy.join(' | ') : ''));

    // The keyboard player keeps today's words: the desktop screens must not move.
    const k = SHELL_COPY.keys;
    ok(k.titlePrompt === 'PRESS ANY KEY' && k.pausedLine === 'p / esc to resume' &&
       k.sliceRetryLine === 'r to retry now' && k.gameOverLine === 'r to climb again' &&
       k.replayLine === 'r to replay' && k.victoryLine === 'r to climb again' &&
       k.weaponSwap === 'C SWAP // ' && k.weaponSwapCompact === 'C↔ ' &&
       k.titleLegend.map(([w, h]) => w + ' ' + h).join(' · ') ===
         'MOVE WASD / ARROWS · JUMP SPACE · FIRE J / X · PAUSE P / ESC',
       'T-105: the keyboard copy is byte-identical to the pre-T-105 build (desktop unchanged)');

    // On touch the deck's modal cue is the ONE instruction over a modal.
    ok(['pausedLine', 'sliceRetryLine', 'gameOverLine', 'replayLine', 'victoryLine']
      .every((key) => shellLine('touch', key) === null),
       'T-105: on touch the overlay prints no instruction line of its own (the deck\'s ' +
       '"TAP TO …" cue is the one instruction)');

    ok(shellCopyMode('twin') === 'touch' && shellCopyMode('legacy') === 'keys' &&
       shellCopyMode('off') === 'keys' && shellCopyMode(undefined) === 'keys' &&
       INPUT_MODES.join() === 'keys,touch',
       'T-105: only the two-thumb deck (the one scheme with a tap out of every screen) speaks touch');
  }

  /* --------------- every touch button does what its key does ------------- */
  {
    const want = { restart: 'restart', title: 'title', hud: 'hud' };
    const bad = [];
    const offered = [];
    for (const state of ['PAUSED', 'GAME_OVER', 'VICTORY']) {
      for (const opts of [{}, { hudHidden: true }, { summit: true }]) {
        for (const [action] of panelActions(state, 'touch', opts)) {
          offered.push(state + ':' + action);
          const code = TOUCH_ACTION_KEYS[action];
          const intent = code ? shellKeyIntent(code, state) : null;
          // R on GAME_OVER / VICTORY restarts through main.js's own branch,
          // not the shell table — and touch never offers it there (below)
          if (intent !== want[action]) bad.push(`${state}:${action} -> ${code} -> ${intent}`);
        }
      }
    }
    ok(offered.length > 0 && bad.length === 0,
       'T-105: every touch button presses the key whose intent it names, in that state (' +
       [...new Set(offered)].join(', ') + ')' + (bad.length ? ' — ' + bad.join(', ') : ''));
    const dup = [];
    for (const [action] of panelActions('PAUSED', 'touch')) if (action === 'resume') dup.push('PAUSED:resume');
    for (const st of ['GAME_OVER', 'VICTORY'])
      for (const [action] of panelActions(st, 'touch', { summit: st === 'VICTORY' })) if (action === 'restart') dup.push(st + ':restart');
    ok(dup.length === 0,
       'T-105: no touch button repeats the verb the deck\'s modal tap already performs ' +
       '(tap = resume / climb again), so a phone shows one instruction');
  }

  /* ---------- T-126: a run-ending touch tap is armed, never final ---------- *
   * No number of the window is pinned here (it is reasoned, and the operator
   * may retune it): every boundary below is read from CONFIRM_TAP itself.   */
  {
    const P = CONFIRM_TAP;
    ok(Number.isFinite(P.minMs) && Number.isFinite(P.windowMs) && P.minMs >= 0 && P.windowMs > P.minMs,
       'T-126: the confirm window is a real interval after the arming tap (' +
       JSON.stringify(P) + ')');

    // every gap a second tap can come at: a sweep, plus each boundary at -1/0/+1
    const gaps = [-1000, -1, NaN, Infinity];
    for (let t = 0; t <= 3 * P.windowMs; t += 25) gaps.push(t);
    for (const b of [0, P.minMs, P.windowMs]) gaps.push(b - 1, b, b + 1);
    const controls = ['restart', 'title', 'reload:view=near', 'reload:audio=', 'reload:shell=0'];

    // ONE tap never confirms — nothing armed, or another control armed, at any time
    let firstTaps = 0, firstConfirm = 0, firstWait = 0;
    for (const tapped of controls) {
      for (const armed of [null, undefined, ...controls.filter((c) => c !== tapped)]) {
        for (const at of gaps) {
          const step = confirmTap(armed, 0, tapped, at);
          firstTaps++;
          if (step === 'confirm') firstConfirm++;
          if (step !== 'arm') firstWait++;
        }
      }
    }
    ok(firstConfirm === 0 && firstWait === 0,
       'T-126: a first tap on a run-ending control only ARMS it, whatever else is armed and whenever ' +
       'it lands (' + firstTaps + ' taps: ' + firstConfirm + ' confirmed, ' + (firstWait - firstConfirm) + ' ignored)');

    // the same control tapped twice: confirms exactly when the second tap is
    // inside the window; sooner is the arming tap's own double (ignored, still
    // armed); later, or a clock that ran back, arms afresh and never confirms
    const wrong = [];
    let inside = 0;
    for (const tapped of controls) {
      for (const dt of gaps) {
        const step = confirmTap(tapped, 1000, tapped, 1000 + dt);
        const want = !(dt >= 0) || dt > P.windowMs ? 'arm' : dt < P.minMs ? 'wait' : 'confirm';
        if (step === 'confirm') inside++;
        if (step !== want) wrong.push(`${tapped} +${dt}: ${step} (want ${want})`);
      }
    }
    ok(wrong.length === 0 && inside > 0,
       'T-126: a second tap on the armed control confirms only inside [minMs, windowMs] after the first; ' +
       'sooner it is ignored, later it re-arms (' + inside + ' confirming gaps)' +
       (wrong.length ? ' — ' + wrong.slice(0, 4).join('; ') : ''));

    // which controls arm: every touch action whose key is a LIFECYCLE intent
    // in that state (main.js resets the run for 'restart' and 'title') must,
    // and must say so; a reversible one (HIDE HUD) must not. A run-ending
    // button added later cannot skip the arming.
    const lifecycle = new Set(['restart', 'title']);
    const unarmed = [];
    const overArmed = [];
    const seen = [];
    for (const state of ['PAUSED', 'GAME_OVER', 'VICTORY']) {
      for (const opts of [{}, { hudHidden: true }, { summit: true }]) {
        for (const [action] of panelActions(state, 'touch', opts)) {
          const intent = shellKeyIntent(TOUCH_ACTION_KEYS[action], state);
          const label = confirmLabel(state, action);
          seen.push(state + ':' + action);
          if (lifecycle.has(intent) && !(needsConfirm(action) && label)) unarmed.push(state + ':' + action);
          if (!lifecycle.has(intent) && (needsConfirm(action) || label)) overArmed.push(state + ':' + action);
        }
      }
    }
    ok(unarmed.length === 0 && overArmed.length === 0 && seen.some((s) => s.endsWith(':restart')) &&
       seen.some((s) => s.endsWith(':title')) && seen.some((s) => s.endsWith(':hud')),
       'T-126: every touch button that ends or leaves the run arms first (and says so); HIDE HUD, which ' +
       'keeps the pause, stays one tap (' + [...new Set(seen)].join(', ') + ')' +
       (unarmed.length ? ' — unarmed: ' + unarmed.join(', ') : '') +
       (overArmed.length ? ' — armed but harmless: ' + overArmed.join(', ') : ''));
    ok(needsConfirm('reload') && !!confirmLabel('PAUSED', 'reload') && CONFIRM_ACTIONS.includes('reload'),
       'T-126: an option toggle that reloads the page (ending the run) arms first too');

    // the armed words: name the second tap, and no key (touch copy)
    const labels = Object.entries(CONFIRM_LABELS).flatMap(([state, t]) =>
      Object.entries(t).map(([action, text]) => ({ at: state + ':' + action, text })));
    const badLabel = labels.filter((l) => !/\bTAP AGAIN\b/.test(l.text) || keyboardCopyHits(l.text).length > 0);
    ok(labels.length >= 4 && badLabel.length === 0,
       'T-126: every armed label states the second tap and names no key (' + labels.length + ' labels)' +
       (badLabel.length ? ' — ' + badLabel.map((l) => `${l.at} "${l.text}"`).join(', ') : ''));

    // the keyboard keeps its one-press verbs: R and Q act at once on pause
    // (the arming is touch presentation; the intent table is unchanged)
    ok(shellKeyIntent('KeyR', 'PAUSED') === 'restart' && shellKeyIntent('KeyQ', 'PAUSED') === 'title' &&
       shellKeyIntent('KeyQ', 'GAME_OVER') === 'title' && shellKeyIntent('KeyH', 'PAUSED') === 'hud',
       'T-126: keyboard R / Q / H keep their one-press intents on the pause and result screens');
  }

  /* --------------------- the failsafe hint, by device -------------------- */
  {
    const inlineHint = inlineFunction('hintMode');
    ok(!!inlineHint, 'T-105: index.html carries the failsafe panel\'s hint-mode rule as a named function');
    const raws = [null, '', '0', 'off', '1', 'on', 'legacy', 'twin', 'yes', '2'];
    const disagree = [];
    for (const raw of raws) for (const hw of [false, true]) {
      const pure = failsafeHintMode(raw, hw);
      const scheme = resolveTouchScheme(raw, hw);
      if (inlineHint && inlineHint(raw, hw) !== pure) disagree.push(`inline(${raw},${hw})`);
      if ((pure === 'touch') !== (scheme !== 'off')) disagree.push(`deck(${raw},${hw})=${scheme} vs ${pure}`);
    }
    ok(disagree.length === 0,
       'T-105: the panel says "tap" exactly where a touch deck installs (inline rule = ' +
       'src/pure/shell-copy.js = resolveTouchScheme, ' + raws.length * 2 + ' cases)' +
       (disagree.length ? ' — ' + disagree.join(', ') : ''));

    const txt = /var HB_FAIL_TEXT = (\{[\s\S]*?\n\s*\});/.exec(HTML);
    const T = txt ? JSON.parse(txt[1]) : {};
    ok(typeof T.hintTouch === 'string' && plainLanguageIssues(T.hintTouch).length === 0 &&
       keyboardCopyHits(T.hintTouch).length === 0 && /button/i.test(T.hintTouch) &&
       keyboardCopyHits(T.hint).length > 0,
       'T-105: the touch hint reads plainly, names the button and no key ("' + T.hintTouch +
       '"); the keyboard hint still names its key');

    const painted = (opts) => {
      const b = bootstrap(opts);
      b.api.show('crash', 'pathcheck');
      return b.el('failHint').textContent;
    };
    const phone = painted({ maxTouchPoints: 5 });
    const desk = painted({});
    const optOut = painted({ maxTouchPoints: 5, search: '?touch=0' });
    const review = painted({ search: '?touch=1' });
    const coarse = painted({ coarse: true });
    ok(phone === T.hintTouch && coarse === T.hintTouch && review === T.hintTouch &&
       desk === T.hint && optOut === T.hint,
       'T-105: the REAL bootstrap paints the touch hint on touch hardware / a coarse pointer / ' +
       '?touch=1, and the key hint on a desktop and under ?touch=0 (got phone="' + phone +
       '", desktop="' + desk + '")');
  }

  /* --------------------- the freeze watchdog's warm-up ------------------- */
  {
    const w = /var WARM = \{ beats: (\d+), stallMs: (\d+) \};/.exec(HTML);
    ok(!!w && Number(w[1]) === FAILSAFE.warmBeats && Number(w[2]) === FAILSAFE.warmStallMs &&
       FAILSAFE.warmBeats >= 1 && FAILSAFE.warmStallMs > FAILSAFE.freezeStallMs,
       'T-105: the inline warm-up numbers are the policy\'s (' + (w ? w[1] + '/' + w[2] : 'missing') +
       ' vs ' + FAILSAFE.warmBeats + '/' + FAILSAFE.warmStallMs + '), and the warm-up window is ' +
       'longer than the stall rule it relaxes');

    // the inline copy of the decision agrees with src/pure over seeded states
    const inlineVerdict = inlineFunction('freezeVerdict');
    ok(!!inlineVerdict, 'T-105: index.html carries the watchdog decision as a named function');
    if (inlineVerdict) {
      const rnd = mulberry32(105);
      const P = { freezeStallMs: FAILSAFE.freezeStallMs, warmBeats: FAILSAFE.warmBeats, warmStallMs: FAILSAFE.warmStallMs };
      const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
      const kinds = {};
      let disagree = 0, cases = 0;
      const compare = (s, now) => {
        const a = freezeVerdict(s, now, P), b = inlineVerdict(s, now, P);
        kinds[a] = (kinds[a] || 0) + 1;
        cases++;
        if (a !== b) disagree++;
      };
      for (let i = 0; i < 4000; i++) {
        const now = 100000 + Math.floor(rnd() * 40000);
        compare({
          booted: rnd() < 0.9, slept: rnd() < 0.1, visible: rnd() < 0.9,
          showing: pick([null, null, null, 'slow', 'frozen', 'crash', 'boot']),
          beats: pick([0, 1, 2, 3, 4, 40]),
          bootedAt: now - Math.floor(rnd() * 20000), visibleSince: now - Math.floor(rnd() * 20000),
          lastBeatAt: now - Math.floor(rnd() * 12000),
        }, now);
      }
      // …and every threshold at -1 / 0 / +1 ms, beats either side of the
      // warm-up count: random times almost never land ON a boundary, and an
      // off-by-one between the two copies lives exactly there
      const now = 200000;
      for (const beats of [0, P.warmBeats - 1, P.warmBeats, P.warmBeats + 1])
        for (const showing of [null, 'slow', 'frozen'])
          for (const dw of [-1, 0, 1]) for (const df of [-1, 0, 1]) for (const dv of [-1, 0, 1]) {
            compare({ booted: true, slept: false, visible: true, showing, beats,
              bootedAt: now - P.warmStallMs - dw, visibleSince: now - P.freezeStallMs - dv,
              lastBeatAt: now - P.freezeStallMs - df }, now);
            compare({ booted: true, slept: false, visible: true, showing, beats,
              bootedAt: now - 30000, visibleSince: now - P.warmStallMs - dw,
              lastBeatAt: now - P.freezeStallMs - df }, now);
            compare({ booted: true, slept: false, visible: true, showing, beats,
              bootedAt: now - 30000, visibleSince: now - 30000,
              lastBeatAt: now - P.warmStallMs - dw }, now);
          }
      ok(disagree === 0 && ['ok', 'frozen'].every((k) => kinds[k] > 0) &&
         Object.keys(kinds).every((k) => k === 'ok' || k === 'frozen'),
         'T-105: the inline freeze verdict equals src/pure/failsafe.js over ' + cases + ' states ' +
         '(4000 seeded + every threshold at -1/0/+1 ms) covering every verdict (' +
         JSON.stringify(kinds) + ', ' + disagree + ' disagree)');
    }

    // The REAL bootstrap, played. Boot, then the stall, then frames again.
    const trial = (before, stallMs, { hidden = false } = {}) => {
      const b = bootstrap({});
      b.play(2000);                      // modules loading: no boot, no beats
      b.api.booted();
      const seen = [];
      seen.push(...b.frames(before));
      const stallAt = b.clock.now;
      let firstFrozenMs = null;
      const during = b.play(stallMs, { hidden });
      if (during.includes('frozen')) {
        // re-run the same stall in 50 ms steps to time the panel
        const c = bootstrap({});
        c.play(2000); c.api.booted();
        c.frames(before);
        const t0 = c.clock.now;
        while (c.clock.now - t0 < stallMs && c.api.showing() !== 'frozen') c.play(50, { hidden });
        firstFrozenMs = c.clock.now - t0;
      }
      seen.push(...during, ...b.play(3000, { fps: 60 }));
      return { seen, firstFrozenMs, stallAt, final: b.api.showing() };
    };
    const t0 = trial(0, 6000);
    const t1 = trial(1, 6000);
    const t2 = trial(2, 6000);
    ok(!t0.seen.includes('frozen') && !t1.seen.includes('frozen') && !t2.seen.includes('frozen') &&
       !t0.seen.length && !t1.seen.length && !t2.seen.length,
       'T-105: a 6 s frame stall before the first frames are drawn (0, 1 or 2 beats in) shows NO ' +
       'panel at all (saw ' + JSON.stringify([t0.seen, t1.seen, t2.seen]) + ')');
    const warm = trial(40, 6000);
    ok(warm.seen.includes('frozen') && warm.firstFrozenMs !== null &&
       warm.firstFrozenMs >= FAILSAFE.freezeStallMs && warm.firstFrozenMs <= FAILSAFE.freezeStallMs + 2 * FAILSAFE.freezeTickMs,
       'T-105: …while the same stall after warm-up (40 frames) still shows "got stuck", ' +
       (warm.firstFrozenMs ?? '?') + ' ms in (the ' + FAILSAFE.freezeStallMs + ' ms rule, one tick of slack)');
    const short = trial(40, FAILSAFE.freezeStallMs - 600);
    ok(!short.seen.includes('frozen'),
       'T-105: after warm-up a stall shorter than ' + FAILSAFE.freezeStallMs + ' ms is still a hiccup, not a panel');
    const hidden = trial(40, 8000, { hidden: true });
    ok(!hidden.seen.length, 'T-105: a hidden page that draws nothing is never "stuck" (saw ' +
       JSON.stringify(hidden.seen) + ')');

    // Not blinded: a loop that dies during warm-up — never drawing, or
    // drawing one frame and stopping (tools/durability/abuse.mjs kills it
    // 1.2 s after boot) — still gets the SAME hard panel, no sooner than the
    // warm-up limit and within one watchdog tick of it.
    for (const before of [0, 1, 2]) {
      const b = bootstrap({});
      b.play(2000); b.api.booted();
      b.frames(before);
      const t0 = b.clock.now;
      while (b.clock.now - t0 < FAILSAFE.warmStallMs + 3000 && !b.api.showing()) b.play(50);
      const at = b.clock.now - t0;
      ok(b.api.showing() === 'frozen' && at >= FAILSAFE.warmStallMs &&
         at <= FAILSAFE.warmStallMs + FAILSAFE.freezeTickMs + 100,
         'T-105: a frame loop that dies during warm-up (' + before + ' frame(s) drawn) still gets the ' +
         '"got stuck" panel, ' + at + ' ms after it went quiet (limit ' + FAILSAFE.warmStallMs + ' ms)');
    }
  }

  /* ------------------------- home-screen play ---------------------------- */
  {
    const tag = (re) => { const m = re.exec(HTML); return m ? m[1] : null; };
    const manifestHref = tag(/<link rel="manifest" href="([^"]+)">/);
    const manifestPath = manifestHref ? join(ROOT, manifestHref) : null;
    let mf = null;
    try { mf = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch (_) { mf = null; }
    ok(!!mf, 'T-105: index.html links a web app manifest that parses (' + manifestHref + ')');
    if (mf) {
      // start_url and scope resolve against the MANIFEST's URL, as a browser does
      const base = new URL('https://host/app/' + manifestHref);
      const start = new URL(mf.start_url, base);
      const scope = new URL(mf.scope, base);
      ok(/landscape/.test(mf.orientation) && /^(fullscreen|standalone)$/.test(mf.display) &&
         start.pathname === '/app/index.html' && start.href.startsWith(scope.href) &&
         typeof mf.name === 'string' && mf.name.length > 0,
         'T-105: the manifest launches the game page, landscape, ' + mf.display + ' (start ' +
         start.pathname + ', scope ' + scope.pathname + ') — relative, so a subpath deploy works');
      const icons = (mf.icons || []).map((icon) => {
        const p = resolve(dirname(manifestPath), icon.src);
        const info = existsSync(p) ? pngInfo(p) : null;
        return { ...icon, info, declared: icon.sizes };
      });
      const wrong = icons.filter((i) => !i.info || !i.info.sig || `${i.info.w}x${i.info.h}` !== i.declared);
      ok(icons.length >= 3 && wrong.length === 0 && icons.some((i) => i.declared === '192x192') &&
         icons.some((i) => i.declared === '512x512') && icons.some((i) => /maskable/.test(i.purpose || '')),
         'T-105: every manifest icon is a PNG at its declared size, with 192, 512 and a maskable one' +
         (wrong.length ? ' — wrong: ' + wrong.map((i) => i.src).join(', ') : ''));
    }
    const touchIcon = tag(/<link rel="apple-touch-icon" sizes="180x180" href="([^"]+)">/);
    const ti = touchIcon && existsSync(join(ROOT, touchIcon)) ? pngInfo(join(ROOT, touchIcon)) : null;
    ok(!!ti && ti.sig && ti.w === 180 && ti.h === 180 && ti.colorType === 2,
       'T-105: apple-touch-icon is a 180x180 OPAQUE PNG (iOS paints transparency black)' +
       (ti ? ` (${ti.w}x${ti.h}, colour type ${ti.colorType})` : ' (missing)'));
    const meta = (name) => tag(new RegExp(`<meta name="${name}" content="([^"]*)">`));
    ok(meta('apple-mobile-web-app-capable') === 'yes' && meta('mobile-web-app-capable') === 'yes' &&
       /^(default|black|black-translucent)$/.test(meta('apple-mobile-web-app-status-bar-style') || '') &&
       !!meta('apple-mobile-web-app-title') && /viewport-fit=cover/.test(HTML),
       'T-105: iOS home-screen launch is declared (capable, status-bar style, title) and the page ' +
       'draws edge to edge (viewport-fit=cover) — the safe-area insets are what keep it readable');
  }

  /* ------------------ each preloaded image is fetched once ---------------- */
  {
    // A <link rel=preload> is only reused by a request in the SAME mode. The
    // world textures load through THREE.TextureLoader (CORS, crossOrigin
    // 'anonymous'); the title art is a CSS background (no-cors).
    const links = [...HTML.matchAll(/<link rel="preload" as="image"[^>]*>/g)].map((m) => ({
      tag: m[0], href: /href="([^"]+)"/.exec(m[0])[1], cors: /\scrossorigin(\s|=|>)/.test(m[0]),
    }));
    const renderSrc = ['backdrop-depth-plan.js', 'foreground-pack-source.js', 'foreground-component-spec.generated.js']
      .map((f) => readFileSync(join(ROOT, 'src', 'render', f), 'utf8')).join('\n');
    const css = HTML.slice(HTML.indexOf('<style>'), HTML.indexOf('</style>'));
    const bad = [];
    for (const l of links) {
      const file = l.href.split('/').pop();
      const byTexture = renderSrc.includes(file);
      const byCss = new RegExp(`url\\('[^']*${file.replace(/\./g, '\\.')}'\\)`).test(css);
      if (!byTexture && !byCss) bad.push(file + ': nothing consumes it');
      else if (byTexture && byCss) bad.push(file + ': consumed in two modes');
      else if (byTexture !== l.cors) bad.push(file + (l.cors ? ': crossorigin on a no-cors consumer' : ': no crossorigin on a CORS consumer'));
    }
    ok(links.length >= 5 && bad.length === 0,
       'T-105: every image preload matches its consumer\'s request mode (' + links.length +
       ' preloads; CORS for TextureLoader, no-cors for CSS)' + (bad.length ? ' — ' + bad.join('; ') : ''));
  }
}
