/* ============================= SHELL ============================== */
/* The game shell (T-013): start screen, pause/options panel, and the
   end-of-run stats screen. Presentation only — this module reads sim
   state the way src/ui/overlay.js and src/ui/audio.js already do, adds
   no simulation state of its own, and never writes any. The run
   lifecycle (resetGame, the state machine) stays in src/main.js; the
   shell only reports which intent a keypress carries
   (src/pure/shell.js) and draws the screens.

   Boundary notes:
   - the state screens are still owned by src/ui/overlay.js. It calls
     shellStateChanged() after it has written #ovTitle/#ovBody, so the
     overlay text the playtest harness scrapes (`ovTitle`, `ovBody`) is
     byte-identical to the pre-shell build and the shell's panel is an
     added sibling in #ovPanel;
   - the start screen uses production key art derived from concept boards
     09 and 14. The original data-backed board-05 composition remains in
     layout underneath it so its sizing/input contracts stay measurable;
   - the composition holds concept board 13's scale rule — RIG is 3.8% of
     frame height on all three directions. tools/pathcheck.mjs asserts
     that on the composition DATA; only a browser can prove the figure
     RENDERS at that scale and at its surface's angle, so ?selftest=1
     measures the laid-out element too (src/main.js);
   - motion is limited to light, vapour and haze. decisions.md entry 3's
     static-anatomy rule applies to the title too: the plate is hinged
     open when we arrive, it does not assemble itself for us. */

import {
  IS_TRANSFORM_SLICE, IS_TRAVERSAL_SLICE, QUERY, SHELL_AUTOSTART, SHELL_ENABLED,
  START_DIRECTION_ID, VIEW_ID,
} from '../mode.js';
import { CONFIG } from '../config.js';
import {
  START_DIRECTIONS, elementVars, runStatRows, startDirection, startDirectionAt,
} from '../pure/shell.js';
import {
  CONFIRM_TAP, SHELL_COPY, TOUCH_ACTION_KEYS, confirmLabel, confirmTap, panelActions,
  shellCopyMode, shellLine,
} from '../pure/shell-copy.js';
import { gameMs, scrollX, sliceStats } from '../sim/time.js';
import { player, P } from '../sim/player.js';
import { kills } from '../sim/hostiles.js';
import {
  currentGun, currentGunLabel, shotsFired, weaponDef, weaponKills,
} from '../sim/weapons.js';
import { scoreSnapshot } from '../sim/score.js';
import { committedBand, transformAltitudeAt } from '../sim/transform.js';

const shellEl = document.getElementById('shell');
const panelEl = document.getElementById('ovPanel');

let directionId = START_DIRECTION_ID;
let hudHidden = false;
let atTitle = false;
// wall of the run clock at the last resetGame. gameMs is monotone across a
// session and only advances while PLAYING, so this is a read, not new state:
// the elapsed time of the current attempt is gameMs - runStartMs.
let runStartMs = 0;

const MODE = IS_TRAVERSAL_SLICE ? 'traversal' : IS_TRANSFORM_SLICE ? 'transform' : 'six-face';

/* Which words this screen speaks (T-105). The two-thumb deck marks <html>
   with .touch-twin when it installs — before the first state screen is
   drawn — and only that deck can tap its way out of every screen; the
   keyboard, ?touch=0 and ?touch=legacy keep the keyboard copy. Read at
   draw time, never cached, so a screen always matches the live scheme. */
export function liveCopyMode() {
  const twin = typeof document !== 'undefined' &&
    document.documentElement.classList.contains('touch-twin');
  return shellCopyMode(twin ? 'twin' : 'off');
}

/* ------------------------- composition ---------------------------- */

function artFor(dir) {
  const frag = document.createDocumentFragment();
  let last = null;
  for (const e of dir.elements) {
    const d = document.createElement('div');
    d.className = 'sl sl-' + e.t;
    const s = d.style;
    // EVERY var, on every element, defaults included — custom properties
    // inherit, and an attached child that left one unset would re-apply its
    // parent's value on top of the parent's own transform (see
    // elementVars() in src/pure/shell.js). Never write these conditionally.
    const vars = elementVars(e);
    for (const k of Object.keys(vars)) s.setProperty(k, vars[k]);
    // attached elements ride their parent's box and transform (RIG stands on
    // the tilted plate / on a gantry); their own --rot is relative to it
    if (e.attach && last) last.appendChild(d);
    else { frag.appendChild(d); last = d; }
  }
  return frag;
}

function renderTitle() {
  if (!shellEl) return;
  const dir = startDirection(directionId);
  shellEl.textContent = '';
  const art = document.createElement('div');
  art.id = 'shellArt';
  art.appendChild(artFor(dir));
  shellEl.appendChild(art);

  const text = document.createElement('div');
  text.id = 'shellText';
  // The production key art reserves the dark left side deliberately. Keep
  // the brand lockup there for every hidden board-direction A/B so selecting
  // 1/2/3 can never put copy over the Crown or RIG.
  text.style.setProperty('--tx', '5%');
  text.style.setProperty('--ty', '24%');
  text.style.setProperty('--tw', '47%');
  text.style.textAlign = 'left';
  // a tap anywhere starts the run on a touch device (src/main.js's window
  // pointerdown), so a phone is told to tap and shown its two thumbs
  const copy = liveCopyMode();
  text.innerHTML =
    '<h1>HULLBREAKER</h1>' +
    '<p class="tag">' + dir.tagline + '</p>' +
    '<p class="prompt">' + shellLine(copy, 'titlePrompt') + '</p>';
  shellEl.appendChild(text);

  const foot = document.createElement('div');
  foot.id = 'shellFoot';
  foot.dataset.copy = copy;
  foot.innerHTML =
    '<p>' + SHELL_COPY[copy].titleLegend.map(([what, how]) => '<b>' + what + '</b> ' + how)
      .join(' &nbsp;&middot;&nbsp; ') + '</p>' +
    '<p class="dim">CLIMB THE MERIDIAN &nbsp;&middot;&nbsp; BREAK THE CROWN &nbsp;&middot;&nbsp; SEND THE SIGNAL</p>';
  shellEl.appendChild(foot);
}

function showTitle() {
  if (!shellEl) return;
  if (!shellEl.firstChild) renderTitle();
  shellEl.classList.add('on');
  document.body.classList.add('at-title');
  atTitle = true;
}

function hideTitle() {
  if (!shellEl) return;
  shellEl.classList.remove('on');
  document.body.classList.remove('at-title');
  atTitle = false;
}

/* ---------------------------- panels ------------------------------ */

function rowsHtml(rows) {
  return '<div class="statgrid">' + rows.map((r) =>
    '<span class="k" data-stat="' + r.label + '">' + r.label + '</span>' +
    '<span class="v" data-stat="' + r.label + '">' + r.value + '</span>').join('') +
    '</div>';
}

function keysHtml(pairs) {
  return '<p class="keys">' + pairs.map(([k, what]) =>
    '<b>' + k + '</b> ' + what).join(' &nbsp;&middot;&nbsp; ') + '</p>';
}

/* Touch: the same verbs as buttons (see .shell-actions in index.html). A
   verb that ends or leaves the run carries its armed label (T-126): its
   first tap only arms it, a second confirms (see "armed taps" below). */
function actionsHtml(state, pairs) {
  return '<div class="shell-actions">' + pairs.map(([action, label]) => {
    const arm = confirmLabel(state, action);
    return '<button type="button" data-shell-action="' + action + '"' +
      (arm ? ' data-arm-label="' + arm + '"' : '') + '>' + label + '</button>';
  }).join('') + '</div>';
}

// the panel's verbs for the live input scheme: a key legend, or buttons
function verbsHtml(state, opts) {
  const copy = liveCopyMode();
  const pairs = panelActions(state, copy, opts);
  return copy === 'touch' ? actionsHtml(state, pairs) : keysHtml(pairs);
}

// options that need a different boot (view depth, audio, the shell itself)
// are honest about it: they reload the page with the flag applied. Nothing
// here mutates a running simulation.
function flagUrl(key, value) {
  const p = new URLSearchParams(location.search);
  if (value === null) p.delete(key);
  else p.set(key, value);
  const q = p.toString();
  return location.pathname + (q ? '?' + q : '');
}

function linkRow(label, options) {
  return '<span class="k">' + label + '</span><span class="v">' + options.map((o) =>
    (o.on
      ? '<b>' + o.label + '</b>'
      : '<a href="' + o.href + '">' + o.label + '</a>')).join(' / ') + '</span>';
}

/* Touch (T-126): the same options as 44 px cells — as links they were 14 px
   tall under a thumb. A cell that reloads ends the run, so it arms first
   like RESTART RUN. The current value is a cell too (pressed, inert): a tap
   on it is a tap on a control, so it never resumes the run by surprise. */
function cellRow(label, flag, options) {
  const arm = confirmLabel('PAUSED', 'reload');
  return '<span class="k">' + label + '</span><span class="v shell-seg">' + options.map((o) =>
    (o.on
      ? '<button type="button" class="on" aria-pressed="true">' + o.label + '</button>'
      : '<button type="button" data-shell-action="reload" data-shell-flag="' + flag +
        '" data-shell-value="' + (o.value === null ? '' : o.value) + '" data-arm-label="' + arm + '">' +
        o.label + '</button>')).join('') + '</span>';
}

const OPTIONS_NOTE = '<p class="note dim">&#8635; reloads the run with that flag. ' +
  'Live run stats are on the end-of-run screen.</p>';

function optionsPanel() {
  const audioOn = QUERY.get('audio') !== '0';
  if (liveCopyMode() === 'touch') {
    return '<div class="panel">' +
      verbsHtml('PAUSED', { hudHidden }) +
      '<div class="statgrid shell-options">' +
        '<span class="k">MODE</span><span class="v">' + MODE + '</span>' +
        cellRow('VIEW &#8635;', 'view', Object.keys(CONFIG.viewScales).map((id) => ({
          label: id.toUpperCase(), on: id === VIEW_ID, value: id,
        }))) +
        cellRow('AUDIO &#8635;', 'audio', [
          { label: 'ON', on: audioOn, value: null },
          { label: 'OFF', on: !audioOn, value: '0' },
        ]) +
        cellRow('SHELL &#8635;', 'shell', [
          { label: 'ON', on: true, value: null },
          { label: 'OFF', on: false, value: '0' },
        ]) +
      '</div>' + OPTIONS_NOTE + '</div>';
  }
  // the keyboard shell: byte-identical to the pre-T-126 panel
  const views = Object.keys(CONFIG.viewScales).map((id) => ({
    label: id.toUpperCase(), on: id === VIEW_ID, href: flagUrl('view', id),
  }));
  return '<div class="panel">' +
    verbsHtml('PAUSED', { hudHidden }) +
    '<div class="statgrid">' +
      '<span class="k">MODE</span><span class="v">' + MODE + '</span>' +
      linkRow('VIEW &#8635;', views) +
      linkRow('AUDIO &#8635;', [
        { label: 'ON', on: audioOn, href: flagUrl('audio', null) },
        { label: 'OFF', on: !audioOn, href: flagUrl('audio', '0') },
      ]) +
      linkRow('SHELL &#8635;', [
        { label: 'ON', on: true, href: flagUrl('shell', null) },
        { label: 'OFF', on: false, href: flagUrl('shell', '0') },
      ]) +
    '</div>' + OPTIONS_NOTE + '</div>';
}

/* every number here is read from state the game already keeps — the shell
   introduces no counters of its own (acceptance: "run-stats screen fed
   from existing telemetry, no new sim state"). DEATHS is derived from the
   lives the run has left rather than a counter, because the six-face run
   has no death counter today (SPRINT inbox I-006). */
function statsInput() {
  let best = 'R';
  for (const k of Object.keys(weaponKills)) if (weaponKills[k] > weaponKills[best]) best = k;
  return {
    mode: MODE,
    elapsedMs: Math.max(0, gameMs - runStartMs),
    distanceM: scrollX,
    altitudeTiles: transformAltitudeAt(player.x),
    bands: committedBand,
    attempts: sliceStats.attempts,
    kills,
    shots: shotsFired,
    bestWeapon: { name: weaponDef(best).name, kills: weaponKills[best] },
    deaths: Math.max(0, P.lives - Math.max(0, player.lives)),
    falls: sliceStats.falls,
    setbacks: sliceStats.setbacks,
    airJumps: sliceStats.airJumps,
    minEdgeMargin: sliceStats.minEdgeMargin,
    score: scoreSnapshot(),
  };
}

function statsPanel(state) {
  const input = statsInput();
  const rows = runStatRows(input);
  if (state === 'VICTORY' && MODE === 'six-face') {
    const threat = Math.max(0, Math.round(Number(input.score?.threat) || 0));
    const rank = threat >= 9000 ? 'S' : threat >= 6500 ? 'A'
      : threat >= 4000 ? 'B' : threat >= 1800 ? 'C' : 'D';
    const value = (label, fallback = '—') =>
      rows.find((row) => row.label === label)?.value ?? fallback;
    const tier = currentGun.tier ? `TIER ${['', 'I', 'II', 'III'][currentGun.tier]}` : 'FIELD ISSUE';
    return '<div class="panel result-panel">' +
      '<div class="result-rank"><span>THREAT RANK</span><strong>' + rank + '</strong>' +
        '<em>' + threat + '</em></div>' +
      '<div class="result-weapon"><span>FINAL ARSENAL · ' + tier + '</span>' +
        '<b>' + currentGunLabel() + '</b></div>' +
      '<div class="result-strip">' +
        '<span><b>' + value('TIME') + '</b><small>TIME</small></span>' +
        '<span><b>' + value('KILLS', '0') + '</b><small>KILLS</small></span>' +
        '<span><b>' + value('KILLS / 100 SHOTS', '—') + '</b><small>K / 100</small></span>' +
        '<span><b>' + value('DEATHS', '0') + '</b><small>DEATHS</small></span>' +
      '</div>' +
      '<details class="result-details"><summary>FULL RUN TELEMETRY</summary>' +
        rowsHtml(rows) + '</details>' +
      verbsHtml('VICTORY', { summit: true }) +
      '</div>';
  }
  return '<div class="panel">' + rowsHtml(rows) + verbsHtml(state) + '</div>';
}

function setPanel(html) {
  if (!panelEl) return;
  disarm();                                   // a redrawn panel starts unarmed
  panelEl.innerHTML = html;
  panelEl.style.display = html ? 'block' : 'none';
}

/* ------------------------- armed taps (T-126) -------------------------- *
 * Touch only (the keyboard shell prints a key legend, not buttons). A
 * control that ends or leaves the run carries data-arm-label: its first tap
 * ARMS it — the label says what a second tap does, a bar drains over the
 * window — and a second tap inside the window (src/pure/shell-copy.js
 * CONFIRM_TAP / confirmTap) does what the control always did. Any other tap
 * disarms; so does the window running out and any redraw of the panel.
 * Presentation state only: which control, since when. */
let armedEl = null;
let armedId = null;
let armedAt = 0;
let armedText = '';
let armedTimer = 0;

function controlId(el) {
  const d = el.dataset;
  return d.shellAction + (d.shellFlag ? ':' + d.shellFlag + '=' + d.shellValue : '');
}

function disarm() {
  if (armedTimer) { clearTimeout(armedTimer); armedTimer = 0; }
  const el = armedEl;
  armedEl = null;
  armedId = null;
  if (!el) return;
  el.classList.remove('armed');
  el.textContent = armedText;
  el.style.width = '';
  el.style.height = '';
  el.style.removeProperty('--arm-ms');
}

function arm(el, at) {
  disarm();
  // lock the box BEFORE the longer label goes in: it wraps inside, so
  // nothing on the panel moves under a thumb that is about to tap again
  // (the fractional rect: offsetWidth rounds, and the neighbours would shift)
  const box = el.getBoundingClientRect();
  el.style.width = box.width + 'px';
  el.style.height = box.height + 'px';
  el.style.setProperty('--arm-ms', CONFIRM_TAP.windowMs + 'ms');
  armedText = el.textContent;
  el.textContent = el.dataset.armLabel;
  el.classList.add('armed');
  armedEl = el;
  armedId = controlId(el);
  armedAt = at;
  armedTimer = setTimeout(disarm, CONFIRM_TAP.windowMs);
}

/* What a control does — the ONE path it always had. A touch action presses,
   on the player's behalf, the key a keyboard player would press:
   src/main.js's keydown handler and src/pure/shell.js's intent table stay
   the one lifecycle path (restart, start screen, HUD). A reload REPLACES
   this history entry, so a toggle never leaves one behind that Safari's
   edge back-swipe (or a trackpad's) could return to mid-run. */
function perform(el) {
  const action = el.dataset.shellAction;
  if (action === 'reload') {
    location.replace(flagUrl(el.dataset.shellFlag, el.dataset.shellValue || null));
    return;
  }
  const code = TOUCH_ACTION_KEYS[action];
  if (code) {
    dispatchEvent(new KeyboardEvent('keydown',
      { code, key: code.slice(3).toLowerCase(), bubbles: true, cancelable: true }));
  }
}

/* The deck's modal tap ignores buttons and links (touch-controls.js
   interactive()), so tapping a control never also resumes or restarts. */
if (panelEl) {
  panelEl.addEventListener('click', (event) => {
    const target = event.target && event.target.closest ? event.target : null;
    if (!target) return;
    // the keyboard shell's option links reload in place too (no history
    // entry); a modified click — new tab, new window — stays the browser's
    const link = target.closest('.statgrid a[href]');
    if (link && panelEl.contains(link)) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      location.replace(link.href);
      return;
    }
    const button = target.closest('[data-shell-action]');
    if (!button || !panelEl.contains(button)) return;
    event.preventDefault();
    if (button.dataset.armLabel) {
      const now = event.timeStamp || performance.now();
      const step = confirmTap(armedEl === button ? armedId : null, armedAt, controlId(button), now);
      if (step === 'arm') { arm(button, now); return; }
      if (step === 'wait') return;              // the arming tap's own double: ignored
      disarm();
    }
    perform(button);
  });
  // any other tap disarms — capture phase, so it lands before the deck's
  // tap-to-resume and before the tapped control's own click
  document.addEventListener('pointerdown', (event) => {
    if (armedEl && !(event.target && armedEl.contains(event.target))) disarm();
  }, true);
}

/* --------------------------- lifecycle ---------------------------- */

/* Called by src/ui/overlay.js AFTER it has drawn the state screen, so the
   overlay's own title/body (which the bot harness scrapes) is untouched
   and the shell's panel is an added sibling. */
export function shellStateChanged(next) {
  if (!SHELL_ENABLED) return;
  if (next === 'MENU') showTitle(); else hideTitle();
  if (next === 'PAUSED') setPanel(optionsPanel());
  else if (next === 'GAME_OVER' || next === 'VICTORY') setPanel(statsPanel(next));
  else setPanel('');
}

// src/main.js calls this from resetGame: one read of the clock, so the
// stats screen can report the length of THIS attempt.
export function shellRunStarted() { runStartMs = gameMs; }

/* Acts on a consuming intent from src/pure/shell.js's table. 'start',
   'restart' and 'title' are lifecycle and belong to src/main.js — they
   never arrive here. */
export function shellApplyIntent(intent) {
  if (!SHELL_ENABLED) return false;
  if (intent === 'hud') {
    hudHidden = !hudHidden;
    document.body.classList.toggle('nohud', hudHidden);
    if (atTitle) return true;
    setPanel(optionsPanel());                 // the pause panel shows the toggle
    return true;
  }
  if (intent && intent.startsWith('pick:')) {
    const dir = startDirectionAt(Number(intent.slice(5)));
    if (dir.id !== directionId) {
      directionId = dir.id;
      renderTitle();
    }
    return true;
  }
  return false;
}

// read-only debug/QA surface, published on window.HB by src/main.js
export function shellSnapshot() {
  return {
    enabled: SHELL_ENABLED,
    autostart: SHELL_AUTOSTART,
    atTitle,
    direction: directionId,
    directions: START_DIRECTIONS.map((d) => d.id),
    hud: !hudHidden,
    runMs: Math.max(0, gameMs - runStartMs),
    copy: liveCopyMode(),
  };
}
