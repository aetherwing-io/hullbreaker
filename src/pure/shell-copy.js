/* =========================== SHELL COPY =========================== */
/* Every instruction the shell gives a player, in the two input modes the
   game ships (T-105, decisions.md entry 20: the phone is a first-class
   target). A touch player has no R, P, Esc or Space, so "press R" on a
   phone is not a hint, it is a dead end; a keyboard player keeps the exact
   words he has today.

   Which mode a screen speaks is decided once, by the input scheme that is
   actually live: the two-thumb deck (src/ui/touch-controls.js, on by
   default on touch hardware) means 'touch'; the keyboard, ?touch=0 and the
   rejected ?touch=legacy hatch (which has no modal taps) mean 'keys'.

   On touch the deck's own cue (#thumbModal: TAP TO RESUME / TAP TO CLIMB
   AGAIN) is the ONE instruction over a modal, so the overlay drops its
   keyboard line instead of printing a second, contradictory one.

   keyboardCopyHits() is the rule both gates use: tools/pathcheck holds the
   tables below to it, and tools/playtest/phone-shell.mjs runs it over the
   text a browser actually painted. Pure: no DOM, no clock.            */

export const INPUT_MODES = Object.freeze(['keys', 'touch']);

/* The live scheme -> the copy mode. Only the two-thumb deck has a tap path
   out of every screen; everything else is driven by keys. */
export function shellCopyMode(touchScheme) {
  return touchScheme === 'twin' ? 'touch' : 'keys';
}

/* The failsafe panel is drawn by the inline bootstrap before any module
   runs, so it cannot ask the deck. Its button is a real <button>, so a tap
   works under EVERY touch scheme: the hint is 'touch' whenever the deck
   would install at all. Mirrors resolveTouchScheme (src/pure/touch-stick.js)
   — pathcheck runs the inline copy of this against it. */
export function failsafeHintMode(rawTouchQuery, touchHardware) {
  if (rawTouchQuery === '0' || rawTouchQuery === 'off') return 'keys';
  if (rawTouchQuery === '1' || rawTouchQuery === 'on' || rawTouchQuery === 'legacy') return 'touch';
  return touchHardware ? 'touch' : 'keys';
}

/* Line-for-line. `null` means "this mode prints no line here" — on touch,
   the deck's modal cue already says it. Keyboard strings are byte-identical
   to the pre-T-105 build (the desktop screens must not change). */
export const SHELL_COPY = Object.freeze({
  keys: Object.freeze({
    titlePrompt: 'PRESS ANY KEY',
    titleLegend: Object.freeze([['MOVE', 'WASD / ARROWS'], ['JUMP', 'SPACE'], ['FIRE', 'J / X'], ['PAUSE', 'P / ESC']]),
    pausedLine: 'p / esc to resume',
    sliceRetryLine: 'r to retry now',
    gameOverLine: 'r to climb again',
    replayLine: 'r to replay',
    victoryLine: 'r to climb again',
    weaponSwap: 'C SWAP // ',
    weaponSwapCompact: 'C↔ ',
  }),
  touch: Object.freeze({
    titlePrompt: 'TAP TO START',
    titleLegend: Object.freeze([['LEFT THUMB', 'MOVE + AIM'], ['RIGHT THUMB', 'JUMP + FIRE'], ['II', 'PAUSE']]),
    pausedLine: null,
    sliceRetryLine: null,
    gameOverLine: null,
    replayLine: null,
    victoryLine: null,
    weaponSwap: 'SWAP ↔ ',
    weaponSwapCompact: 'SWAP ↔ ',
  }),
});

/* The panel rows under a state screen. Keyboard: the key legend it always
   had. Touch: the same verbs as buttons (the deck already owns resume and
   restart-on-death as a tap; a button never repeats the cue). */
export const PANEL_ACTIONS = Object.freeze({
  keys: Object.freeze({
    PAUSED: Object.freeze([['P / ESC', 'resume'], ['R', 'restart run'], ['Q', 'start screen'], ['H', 'hide HUD']]),
    PAUSED_HUD_HIDDEN: Object.freeze([['P / ESC', 'resume'], ['R', 'restart run'], ['Q', 'start screen'], ['H', 'show HUD']]),
    GAME_OVER: Object.freeze([['R', 'restart run'], ['Q', 'start screen']]),
    VICTORY: Object.freeze([['R', 'run it again'], ['Q', 'start screen']]),
    VICTORY_SUMMIT: Object.freeze([['R', 'break it again'], ['Q', 'start screen']]),
  }),
  touch: Object.freeze({
    PAUSED: Object.freeze([['restart', 'RESTART RUN'], ['title', 'START SCREEN'], ['hud', 'HIDE HUD']]),
    PAUSED_HUD_HIDDEN: Object.freeze([['restart', 'RESTART RUN'], ['title', 'START SCREEN'], ['hud', 'SHOW HUD']]),
    GAME_OVER: Object.freeze([['title', 'START SCREEN']]),
    VICTORY: Object.freeze([['title', 'START SCREEN']]),
    VICTORY_SUMMIT: Object.freeze([['title', 'START SCREEN']]),
  }),
});

/* A touch action is the keyboard player's key, pressed on his behalf: one
   lifecycle path (src/main.js's keydown handler and src/pure/shell.js's
   intent table), not a second one. */
export const TOUCH_ACTION_KEYS = Object.freeze({ restart: 'KeyR', title: 'KeyQ', hud: 'KeyH' });

/* ------------------ touch: a run-ending tap is armed (T-126) ------------------
 * Under the two-thumb deck the pause panel's controls sit where a "TAP TO
 * RESUME" tap can land (the deck resumes on a tap that is NOT on a control).
 * A control whose tap ends or leaves the run — RESTART RUN, START SCREEN, and
 * the option toggles that reload the page — therefore needs TWO taps: the
 * first only ARMS it (the control's label says what the second tap does), a
 * second tap on the same control inside the window confirms it, by the one
 * path the control always used (the key it presses; the reload). Any other
 * tap disarms it. The keyboard is untouched: R and Q act at once, as before.
 *
 * Which controls: every touch action whose key is a LIFECYCLE intent in
 * src/pure/shell.js's table ('restart', 'title' — main.js resets the run for
 * both), plus 'reload'. HIDE HUD is reversible and keeps the pause, so it
 * stays one tap. tools/pathcheck ties this list to the intent table, so a
 * run-ending button added later cannot skip the arming.
 *
 * The window — reasoned, not tuned against a thumb (the operator's call):
 *   minMs     a second tap sooner than this is the SAME gesture as the first
 *             — a double-tap, a bouncing thumb — and is ignored: the control
 *             stays armed, nothing fires. 300 ms is Android's double-tap
 *             timeout (ViewConfiguration.DOUBLE_TAP_TIMEOUT), a platform's
 *             own line between one gesture and two.
 *   windowMs  the armed label has to be seen, read (two to five words) and
 *             answered; 3 s leaves a first-time reader room, and is short
 *             enough that a control armed by a stray thumb reverts by itself
 *             before a player who looked away comes back to it. The control
 *             shows the window as a bar that drains over it.
 * Neither number is asserted (tools/pathcheck holds the invariants: one tap
 * never confirms, a second tap inside the window does, outside it never). */
export const CONFIRM_TAP = Object.freeze({ minMs: 300, windowMs: 3000 });

export const CONFIRM_ACTIONS = Object.freeze(['restart', 'title', 'reload']);

/* What an armed control says, by screen. It names the second tap and what it
   does; touch copy, so the keyboard-copy scan holds it like every other
   touch string. 'reload' is a 44 px option cell, so its words are the
   fewest; the cell's row says what reloads (↻) and the note under the rows
   says that ↻ reloads the run. */
export const CONFIRM_LABELS = Object.freeze({
  PAUSED: Object.freeze({
    restart: 'TAP AGAIN TO RESTART', title: 'TAP AGAIN TO QUIT RUN', reload: 'TAP AGAIN',
  }),
  GAME_OVER: Object.freeze({ title: 'TAP AGAIN FOR START SCREEN' }),
  VICTORY: Object.freeze({ title: 'TAP AGAIN FOR START SCREEN' }),
});

export function needsConfirm(action) {
  return CONFIRM_ACTIONS.includes(action);
}

// the armed label for `action` on `state`'s screen, or null (one tap)
export function confirmLabel(state, action) {
  if (!needsConfirm(action)) return null;
  const table = CONFIRM_LABELS[state];
  return table && Object.prototype.hasOwnProperty.call(table, action) ? table[action] : null;
}

/* A tap on a run-ending control. `armedId` / `armedAt` describe the control
   that is armed now (null when none), `tappedId` the control tapped, `now`
   the tap's time on the same clock. Returns
     'arm'     arm `tappedId` from `now` (nothing armed, a different control
               was, or its window ran out: that never confirms);
     'wait'    the same gesture as the arming tap: ignore it, stay armed;
     'confirm' do what the control does.
   A presentation decision, not a lifecycle: the caller does the ONE thing
   the control always did. Pure: no DOM, no clock. */
export function confirmTap(armedId, armedAt, tappedId, now, policy = CONFIRM_TAP) {
  if (armedId === null || armedId === undefined || armedId !== tappedId) return 'arm';
  const dt = now - armedAt;
  if (!(dt >= 0)) return 'arm';               // NaN or a clock that ran back: start over
  if (dt < policy.minMs) return 'wait';
  return dt <= policy.windowMs ? 'confirm' : 'arm';
}

export function shellLine(mode, key) {
  const table = SHELL_COPY[mode === 'touch' ? 'touch' : 'keys'];
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : null;
}

export function panelActions(state, mode, { hudHidden = false, summit = false } = {}) {
  const table = PANEL_ACTIONS[mode === 'touch' ? 'touch' : 'keys'];
  if (state === 'PAUSED') return hudHidden ? table.PAUSED_HUD_HIDDEN : table.PAUSED;
  if (state === 'GAME_OVER') return table.GAME_OVER;
  if (state === 'VICTORY') return summit ? table.VICTORY_SUMMIT : table.VICTORY;
  return Object.freeze([]);
}

/* ---------------------- keyboard-only copy, found -------------------- *
 * What a phone player must never be told: key names, and "press" /
 * "click" wording. Each pattern names what it catches; the scan returns
 * every hit with its pattern so a failing gate says WHICH words.
 * Weapon letters in brackets ("[R] RIVETGUN") are a weapon class, not a
 * key, and are deliberately not matched.                               */
export const KEYBOARD_COPY_PATTERNS = Object.freeze([
  ['press/click wording', /\b(?:press(?:es|ed|ing)?|click(?:s|ed|ing)?)\b/gi],
  ['the word key', /\bkey(?:s|board)?\b/gi],
  ['named key', /\b(?:esc|escape|enter|return|space(?:bar)?|shift|ctrl|tab|wasd|arrows?)\b/gi],
  ['key pair', /\b[A-Z]\s*\/\s*(?:[A-Z]|ESC)\b/gi],
  ['letter-key verb', /(?:^|[\s·(])[A-Z](?=\s+(?:to|restart|resume|retry|replay|swap|start|show|hide|quit|break|run)\b)/gi],
  ['verb-letter key', /\b(?:swap|pause|retry|hook|restart|quit)\s+[A-Z](?:\s*\/\s*[A-Z])?(?![\w'↔])/gi],
  ['letter-swap glyph', /\b[A-Z](?=\s*[↔⇄])/g],
]);

export function keyboardCopyHits(text) {
  const raw = typeof text === 'string' ? text : String(text == null ? '' : text);
  const hits = [];
  for (const [name, re] of KEYBOARD_COPY_PATTERNS) {
    re.lastIndex = 0;
    for (let m = re.exec(raw); m; m = re.exec(raw)) {
      hits.push({ pattern: name, match: m[0].trim(), at: m.index });
      if (m[0].length === 0) re.lastIndex++;
    }
  }
  return hits;
}
