/* ======================= TWO-THUMB TOUCH DECK (T-101) ===================== */
/* decisions.md entry 20 judged the one-thumb scheme "too wonky"; this is its
   replacement, ON by default on touch hardware:

     LEFT  (left 45% of the glass): a floating stick spawns under the thumb
           and drives move left/right plus 8-way aim. Dead zone, sector
           hysteresis and rim follow are pure (src/pure/touch-stick.js).
     RIGHT: JUMP (big, bottom-right) and FIRE beside it on the thumb's arc.
           JUMP is press-and-hold — keydown on press, keyup on release — so
           variable jump height survives; a second press airborne is the air
           jump; stick-down + JUMP on a catwalk drops through. Those are not
           re-implementations: they ARE the keyboard's edges, so the sim's
           own jump buffer, cut and drop-through rules apply unchanged.
           Everything a right-hand pointer touches stays held until it lifts,
           so one thumb can roll FIRE -> JUMP (or land in the small lens
           between them) and jump without ceasing fire.
     SWAP / PAUSE / AUTO: small chips out of both thumb arcs. AUTO toggles
           auto-fire (OFF by default: firing is not free in the sim — see
           CONFIG.touch.autoFire and the T-101 report).

   The deck emits ONLY gameplay key edges, through the same
   applyGameplayKeyEdge() path the keyboard and the deterministic frame
   timeline use (src/main.js), so there is one gameplay-input contract.
   Codes are reference-counted per owner (the stick, each pointer, auto-fire):
   lifting one finger releases exactly that finger's codes.

   Escape hatches: ?touch=legacy (the rejected scheme, verbatim, in
   ./touch-legacy.js), ?touch=0 (no deck), ?touch=1 (this deck without touch
   hardware, for desktop review). ?autofire=1|0 overrides the AUTO toggle. */

import { CONFIG } from '../config.js';
import {
  STICK_SECTORS, TOUCH_BIT, TOUCH_BIT_CODES, autoFireSees, autoFireStep,
  clusterHitBits, deckZone, newDeckLayout, resetAutoFire, resolveAutoFire,
  resolveTouchScheme, sectorStartDeg, sectorWidthDeg, stickFollow, stickSector,
  stickSectorBits, touchDeckLayout, touchMaskCodes,
} from '../pure/touch-stick.js';
import { hostiles } from '../sim/hostiles.js';
import { gameMs } from '../sim/time.js';
import { sLeftEdge, sRightEdge } from '../sim/edges.js';
import { installLegacyTouchControls } from './touch-legacy.js';

const STICK_CFG = CONFIG.touch.stick;
const LAYOUT_CFG = CONFIG.touch.layout;
const AUTO_CFG = CONFIG.touch.autoFire;
const AUTO_KEY = 'hullbreaker.touch.autofire';

// A modal tap only counts once the screen has been up this long, so the
// frantic thumb that died does not skip the result it died to.
const MODAL_ARM_MS = { PAUSED: 0, GAME_OVER: 650, SLICE_RETRY: 350, VICTORY: 2400 };
const MODAL_CUE = {
  PAUSED: 'TAP TO RESUME',
  GAME_OVER: 'TAP TO CLIMB AGAIN',
  SLICE_RETRY: 'TAP TO RETRY',
  VICTORY: 'TAP TO CLIMB AGAIN',
};
const TAP_MAX_MS = 700;
const TAP_MAX_TRAVEL = 28;

// Pointer slot kinds. A fixed pool: no allocation per touch.
const FREE = 0, STICK = 1, CLUSTER = 2, CHIP = 3, DEAD = 4;
const MAX_POINTERS = 10;

function touchHardware() {
  return (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
    (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
}

function readStored() {
  try { return localStorage.getItem(AUTO_KEY); } catch (_) { return null; }
}
function writeStored(on) {
  try { localStorage.setItem(AUTO_KEY, on ? '1' : '0'); } catch (_) { /* private mode */ }
}

export function installTouchControls(host) {
  const query = new URLSearchParams(location.search);
  const scheme = resolveTouchScheme(query.get('touch'), touchHardware());
  if (scheme === 'legacy') return installLegacyTouchControls(host);
  return installThumbDeck(host, scheme === 'twin', query);
}

function installThumbDeck({
  applyEdge, canControl, startRun, togglePause, restart = null, state = null,
}, wanted, query) {
  const deck = document.getElementById('thumbDeck');
  const el = (id) => document.getElementById(id);
  const stickEl = el('thumbStick');
  const nubEl = el('thumbNub');
  const ghostEl = el('thumbGhost');
  const jumpEl = el('thumbJump');
  const fireEl = el('thumbFire');
  const swapEl = el('thumbSwap');
  const pauseEl = el('thumbPause');
  const autoEl = el('thumbAuto');
  const cueEl = el('thumbCue');
  const safeEl = el('thumbSafe');
  const modalEl = el('thumbModal');
  const enabled = Boolean(wanted && deck && stickEl && nubEl && jumpEl && fireEl);

  const layout = newDeckLayout();
  const slots = [];
  for (let i = 0; i < MAX_POINTERS; i++) {
    slots.push({ id: -1, kind: FREE, mask: 0, chip: '', x0: 0, y0: 0, t0: 0 });
  }
  const anchor = { x: 0, y: 0 };
  const thumb = { x: 0, y: 0 };
  const afState = resetAutoFire({ lastSeenMs: -Infinity, holding: false });

  let stickSlot = -1;
  let sector = -1;
  let drawnSector = -2;            // the sector the rim wedge last showed
  let stickMask = 0;
  let autoMask = 0;
  let emitted = 0;                 // the union of every owner, as last sent
  let edges = 0;                   // key edges sent (telemetry for the proof)
  let jumps = 0;                   // JUMP presses sent
  let autoOn = resolveAutoFire(query.get('autofire'), readStored());
  let wasPlaying = false;
  let landscape = true;
  let modalState = '';
  let modalSince = 0;
  let modalPointer = -1;
  let modalDownAt = 0;
  let modalX = 0;
  let modalY = 0;
  let learnedStick = false;
  let learnedJump = false;

  /* ----------------------------- owners ----------------------------- */

  function union() {
    let m = stickMask | autoMask;
    for (let i = 0; i < MAX_POINTERS; i++) {
      const s = slots[i];
      if (s.kind === CLUSTER || s.kind === CHIP) m |= s.mask;
    }
    return m;
  }

  // Send exactly the edges that turn `emitted` into the owners' union.
  function sync() {
    const next = union();
    const changed = next ^ emitted;
    if (changed) {
      for (let i = 0; i < TOUCH_BIT_CODES.length; i++) {
        const bit = 1 << i;
        if (!(changed & bit)) continue;
        applyEdge(TOUCH_BIT_CODES[i], next & bit ? 'keydown' : 'keyup', false);
        edges++;
        if (bit === TOUCH_BIT.JUMP && (next & bit)) jumps++;
      }
      emitted = next;
    }
    paint();
  }

  // A pointer newly claiming JUMP is a new PRESS even if another pointer
  // already holds it: a second finger on JUMP mid-air must still be the air
  // jump, exactly like pressing K while Space is held. The fresh keydown
  // re-arms the sim's jump buffer; keys.jump simply stays true.
  function claimJump(bits) {
    if ((bits & TOUCH_BIT.JUMP) && (emitted & TOUCH_BIT.JUMP)) {
      applyEdge('Space', 'keydown', false);
      edges++;
      jumps++;
    }
    if (bits & TOUCH_BIT.JUMP) learnedJump = true;
  }

  function slotOf(id) {
    for (let i = 0; i < MAX_POINTERS; i++) if (slots[i].kind !== FREE && slots[i].id === id) return i;
    return -1;
  }
  function freeSlot() {
    for (let i = 0; i < MAX_POINTERS; i++) if (slots[i].kind === FREE) return i;
    return -1;
  }
  function clearSlot(i) {
    const s = slots[i];
    s.id = -1; s.kind = FREE; s.mask = 0; s.chip = '';
  }

  function endStick() {
    stickSlot = -1;
    sector = -1;
    drawnSector = -2;
    stickMask = 0;
    if (stickEl) stickEl.classList.remove('on', 'dir');
  }

  // A chip lights while a finger is on it (.down). Every path that lets go
  // of that finger without its own lift must put the light out too (T-105).
  function clearChipLooks() {
    if (swapEl) swapEl.classList.remove('down');
    if (pauseEl) pauseEl.classList.remove('down');
    if (autoEl) autoEl.classList.remove('down');
  }

  // Release every code this deck holds (blur, hidden tab, orientation flip,
  // leaving PLAYING). `send` false = the game already released them (reset).
  function releaseAll(send = true) {
    for (let i = 0; i < MAX_POINTERS; i++) clearSlot(i);
    endStick();
    autoMask = 0;
    resetAutoFire(afState);
    clearChipLooks();
    if (send) sync();
    else { emitted = 0; paint(); }
  }

  // A PRIMARY pointerdown starts a new touch sequence: no other finger is on
  // the glass, so any slot still live lost its pointerup AND its cancel (an
  // iOS system gesture can swallow both). Without this a lost lift held JUMP
  // or FIRE until the next lifecycle release; the stick already had its own
  // newest-wins rule (T-105, from T-101's review). Pointer touches only: a
  // mouse is always primary and never multi-touch.
  function releaseStaleSlots() {
    let any = false;
    for (let i = 0; i < MAX_POINTERS; i++) {
      if (slots[i].kind === FREE) continue;
      clearSlot(i);
      any = true;
    }
    if (!any) return false;
    endStick();
    clearChipLooks();
    sync();
    return true;
  }

  /* ----------------------------- drawing ---------------------------- */

  function paint() {
    if (!enabled) return;
    jumpEl.classList.toggle('on', (emitted & TOUCH_BIT.JUMP) !== 0);
    fireEl.classList.toggle('on', (emitted & TOUCH_BIT.FIRE) !== 0);
    fireEl.classList.toggle('auto', autoOn);
    fireEl.classList.toggle('autohold', autoMask !== 0);
    if (swapEl) swapEl.classList.toggle('on', (emitted & TOUCH_BIT.SWAP) !== 0);
    if (autoEl) {
      autoEl.classList.toggle('on', autoOn);
      autoEl.setAttribute('aria-pressed', autoOn ? 'true' : 'false');
    }
    if (ghostEl) ghostEl.classList.toggle('off', stickSlot >= 0);
    if (cueEl) cueEl.classList.toggle('learned', learnedStick && learnedJump);
  }

  function place(node, x, y, w, h) {
    if (!node) return;
    node.style.left = x + 'px';
    node.style.top = y + 'px';
    node.style.width = w + 'px';
    node.style.height = h + 'px';
  }

  function readSafe() {
    const out = { top: 0, right: 0, bottom: 0, left: 0 };
    if (!safeEl) return out;
    const cs = getComputedStyle(safeEl);
    out.top = parseFloat(cs.paddingTop) || 0;
    out.right = parseFloat(cs.paddingRight) || 0;
    out.bottom = parseFloat(cs.paddingBottom) || 0;
    out.left = parseFloat(cs.paddingLeft) || 0;
    return out;
  }

  function relayout() {
    if (!enabled) return;
    const w = innerWidth, h = innerHeight;
    const reserve = parseFloat(getComputedStyle(deck).getPropertyValue('--thumb-top-reserve')) || 0;
    touchDeckLayout(w, h, readSafe(), reserve, LAYOUT_CFG, STICK_CFG, layout);
    const J = layout.jump, F = layout.fire, G = layout.ghost;
    place(jumpEl, J.cx - J.r, J.cy - J.r, J.r * 2, J.r * 2);
    place(fireEl, F.cx - F.r, F.cy - F.r, F.r * 2, F.r * 2);
    place(ghostEl, G.cx - G.r, G.cy - G.r, G.r * 2, G.r * 2);
    place(swapEl, layout.swap.x, layout.swap.y, layout.swap.w, layout.swap.h);
    place(pauseEl, layout.pause.x, layout.pause.y, layout.pause.w, layout.pause.h);
    place(autoEl, layout.auto.x, layout.auto.y, layout.auto.w, layout.auto.h);
    deck.style.setProperty('--rim', layout.rim + 'px');
    deck.style.setProperty('--short', layout.short + 'px');
    deck.style.setProperty('--split', layout.split + 'px');
    deck.classList.toggle('portrait', !layout.landscape);
  }

  function drawStick() {
    stickEl.style.transform = `translate(${anchor.x}px, ${anchor.y}px)`;
    let nx = thumb.x - anchor.x, ny = thumb.y - anchor.y;
    const d = Math.hypot(nx, ny);
    if (d > layout.rim) { nx *= layout.rim / d; ny *= layout.rim / d; }
    nubEl.style.transform = `translate(${nx}px, ${ny}px)`;
    if (sector !== drawnSector) {
      drawnSector = sector;
      if (sector >= 0) {
        // conic angles run clockwise from 12 o'clock; sectors run
        // counter-clockwise from +x — the lit arc is the sector's true span
        const width = sectorWidthDeg(sector, STICK_CFG);
        stickEl.style.setProperty('--wedge-from', (90 - sectorStartDeg(sector, STICK_CFG) - width) + 'deg');
        stickEl.style.setProperty('--wedge-span', width + 'deg');
        stickEl.classList.add('dir');
      } else {
        stickEl.classList.remove('dir');
      }
    }
  }

  /* ----------------------------- pointers --------------------------- */

  function onDown(event) {
    if (event.button > 0) return;
    event.preventDefault();
    startRun();
    if (!canControl()) return;
    if (slotOf(event.pointerId) >= 0) return;          // duplicate delivery
    if (event.isPrimary && event.pointerType === 'touch') releaseStaleSlots();
    const i = freeSlot();
    if (i < 0) return;                                  // eleven fingers
    const s = slots[i];
    s.id = event.pointerId;
    s.x0 = event.clientX; s.y0 = event.clientY;
    s.t0 = event.timeStamp;
    s.mask = 0;
    try { deck.setPointerCapture(event.pointerId); } catch (_) { /* synthetic */ }

    const chip = event.target && event.target.closest ? event.target.closest('[data-chip]') : null;
    if (chip && deck.contains(chip)) {
      s.kind = CHIP;
      s.chip = chip.dataset.chip;
      if (s.chip === 'swap') s.mask = TOUCH_BIT.SWAP;   // keydown now, keyup on lift
      chip.classList.add('down');
      sync();
      return;
    }

    const zone = deckZone(layout, event.clientX);
    if (zone === 'gutter') {
      // iOS Safari owns a swipe from the left glass edge (browser back).
      // Track the finger so its moves and lift stay inert; never a stick.
      s.kind = DEAD;
      return;
    }
    if (zone === 'stick') {
      // The newest left-thumb touch always owns the stick: a lost pointerup
      // can never strand a run, and a re-touch re-anchors instantly.
      if (stickSlot >= 0) slots[stickSlot].kind = DEAD;
      s.kind = STICK;
      stickSlot = i;
      anchor.x = thumb.x = event.clientX;
      anchor.y = thumb.y = event.clientY;
      sector = -1;
      stickMask = 0;
      stickEl.classList.add('on');
      drawStick();
      sync();
      return;
    }

    s.kind = CLUSTER;
    const bits = clusterHitBits(layout, event.clientX, event.clientY);
    claimJump(bits);
    s.mask = bits;
    sync();
  }

  function onMove(event) {
    const i = slotOf(event.pointerId);
    if (i < 0) return;
    event.preventDefault();
    const s = slots[i];
    if (s.kind === STICK) {
      thumb.x = event.clientX;
      thumb.y = event.clientY;
      stickFollow(anchor, thumb.x, thumb.y, layout.rim, STICK_CFG);
      sector = stickSector(thumb.x - anchor.x, thumb.y - anchor.y, sector, layout.rim, STICK_CFG);
      const bits = stickSectorBits(sector);
      if (bits) learnedStick = true;
      drawStick();
      if (bits !== stickMask) { stickMask = bits; sync(); }
    } else if (s.kind === CLUSTER) {
      const add = clusterHitBits(layout, event.clientX, event.clientY, LAYOUT_CFG.slideSlop) & ~s.mask;
      if (add) {
        claimJump(add);
        s.mask |= add;
        sync();
      }
    }
  }

  function chipAction(s, event) {
    const node = s.chip === 'pause' ? pauseEl : s.chip === 'auto' ? autoEl : swapEl;
    if (node) node.classList.remove('down');
    if (s.chip !== 'pause' && s.chip !== 'auto') return;
    // A utility fires on LIFT, and only if the finger is still on it: brushing
    // past PAUSE mid-fight must not stop the run.
    const r = node ? node.getBoundingClientRect() : null;
    const pad = 10;
    if (!r || event.clientX < r.left - pad || event.clientX > r.right + pad ||
        event.clientY < r.top - pad || event.clientY > r.bottom + pad) return;
    if (s.chip === 'pause') togglePause();
    else {
      autoOn = !autoOn;
      writeStored(autoOn);
      if (!autoOn) { autoMask = 0; resetAutoFire(afState); }
    }
  }

  function onUp(event) {
    const i = slotOf(event.pointerId);
    if (i < 0) return;
    event.preventDefault();
    const s = slots[i];
    if (s.kind === STICK) endStick();
    if (s.kind === CHIP && event.type === 'pointerup') chipAction(s, event);
    else if (s.kind === CHIP) {
      const node = s.chip === 'pause' ? pauseEl : s.chip === 'auto' ? autoEl : swapEl;
      if (node) node.classList.remove('down');
    }
    clearSlot(i);
    sync();
  }

  /* ------------------------ lifecycle releases ----------------------- */

  function onResize() {
    relayout();
    const nowLandscape = innerWidth >= innerHeight;
    if (nowLandscape !== landscape) {
      landscape = nowLandscape;
      releaseAll();                 // the glass under every finger just moved
    }
  }

  /* ------------------------ modal taps (touch) ----------------------- */

  function readState() { return state ? state() : (canControl() ? 'PLAYING' : ''); }

  function interactive(target) {
    return !!(target && target.closest && target.closest('a,button,summary,details,input,select,label'));
  }

  function modalArmed(now) {
    const arm = MODAL_ARM_MS[modalState];
    return arm !== undefined && now - modalSince >= arm;
  }

  function onDocDown(event) {
    if (!MODAL_CUE[modalState] || interactive(event.target)) return;
    modalPointer = event.pointerId;
    modalDownAt = performance.now();
    modalX = event.clientX; modalY = event.clientY;
  }

  function onDocUp(event) {
    if (event.pointerId !== modalPointer) return;
    modalPointer = -1;
    const now = performance.now();
    if (!MODAL_CUE[modalState] || now - modalDownAt > TAP_MAX_MS ||
        Math.hypot(event.clientX - modalX, event.clientY - modalY) > TAP_MAX_TRAVEL ||
        modalDownAt - modalSince < 0 || !modalArmed(modalDownAt)) return;
    if (modalState === 'PAUSED') togglePause();
    else if (restart) restart();
  }

  function trackModal(s) {
    if (s === modalState) {
      if (modalEl && MODAL_CUE[s]) modalEl.classList.toggle('armed', modalArmed(performance.now()));
      return;
    }
    modalState = s;
    modalSince = performance.now();
    modalPointer = -1;
    if (!modalEl) return;
    const cue = MODAL_CUE[s];
    modalEl.textContent = cue || '';
    modalEl.classList.toggle('on', !!cue);
    modalEl.classList.toggle('armed', !!cue && modalArmed(modalSince));
  }

  /* ----------------------------- frame ------------------------------ */

  function tick() {
    requestAnimationFrame(tick);
    const playing = canControl();
    if (!playing && wasPlaying) releaseAll();
    wasPlaying = playing;
    trackModal(readState());
    if (autoOn && playing) {
      const seen = autoFireSees(hostiles, sLeftEdge(), sRightEdge(), gameMs, AUTO_CFG);
      const next = autoFireStep(afState, seen, gameMs, AUTO_CFG) ? TOUCH_BIT.FIRE : 0;
      if (next !== autoMask) { autoMask = next; sync(); }
    } else if (autoMask) {
      autoMask = 0;
      sync();
    }
  }

  if (enabled) {
    document.body.classList.add('touch-controls', 'touch-twin');
    document.documentElement.classList.add('touch-twin');
    deck.hidden = false;
    if (modalEl) modalEl.hidden = false;
    landscape = innerWidth >= innerHeight;
    relayout();
    deck.addEventListener('pointerdown', onDown);
    deck.addEventListener('pointermove', onMove);
    deck.addEventListener('pointerup', onUp);
    deck.addEventListener('pointercancel', onUp);
    deck.addEventListener('lostpointercapture', onUp);
    deck.addEventListener('contextmenu', (event) => event.preventDefault());
    deck.addEventListener('dblclick', (event) => event.preventDefault());
    // Chips are pointer-driven; a synthesized click must not re-trigger them.
    deck.addEventListener('click', (event) => event.preventDefault());
    // iOS Safari pinch: touch-action alone has not always been honoured there.
    for (const type of ['gesturestart', 'gesturechange', 'gestureend'])
      document.addEventListener(type, (event) => event.preventDefault(), { passive: false });
    addEventListener('resize', onResize);
    addEventListener('orientationchange', () => releaseAll());
    if (typeof screen !== 'undefined' && screen.orientation && screen.orientation.addEventListener)
      screen.orientation.addEventListener('change', () => releaseAll());
    addEventListener('blur', () => releaseAll());
    addEventListener('pagehide', () => releaseAll());
    document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
    document.addEventListener('pointerdown', onDocDown);
    document.addEventListener('pointerup', onDocUp);
    paint();
    requestAnimationFrame(tick);
  }

  const snapshot = () => ({
    enabled,
    scheme: enabled ? 'twin' : 'off',
    held: touchMaskCodes(emitted),
    stick: {
      active: stickSlot >= 0,
      sector: sector >= 0 ? STICK_SECTORS[sector] : null,
      anchor: { x: +anchor.x.toFixed(2), y: +anchor.y.toFixed(2) },
      thumb: { x: +thumb.x.toFixed(2), y: +thumb.y.toFixed(2) },
    },
    pointers: slots.filter((s) => s.kind !== FREE).map((s) => ({
      id: s.id,
      kind: ['free', 'stick', 'cluster', 'chip', 'dead'][s.kind],
      held: touchMaskCodes(s.kind === STICK ? stickMask : s.mask),
    })),
    autoFire: { enabled: autoOn, holding: autoMask !== 0 },
    jumps,
    edges,
    modal: { state: modalState, cue: MODAL_CUE[modalState] || null },
    layout: JSON.parse(JSON.stringify(layout)),
  });
  const controller = {
    enabled,
    scheme: enabled ? 'twin' : 'off',
    reset: ({ release = true } = {}) => releaseAll(release),
    snapshot,
  };
  if (typeof window !== 'undefined') window.__HB_TOUCH = snapshot;
  return controller;
}
