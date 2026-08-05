/* ===================== ONE-THUMB TOUCH CONTROL ==================== */
/* A floating stick owns movement and aim. Crossing its outer rail adds
   continuous fire; lifting keeps the last intent for a short "clutch" so a
   quick re-touch can jump without losing momentum or aim. Repeating that
   lift/re-touch is the air-jump gesture. The module emits the same key edges
   as a keyboard, so it does not create a second gameplay-input contract. */

const MOVE_CODE = Object.freeze({
  left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown',
});
const FIRE_CODE = 'KeyX';
const JUMP_CODE = 'Space';
const SWAP_CODE = 'KeyC';

// Long enough for a deliberate thumb re-tap, short enough that releasing the
// glass never leaves RIG running into danger for half a second.
const CLUTCH_MS = 380;
const JUMP_PULSE_MS = 96;
const TAP_MS = 170;
const TAP_TRAVEL_PX = 13;

function touchMode(query = new URLSearchParams(location.search)) {
  if (query.get('touch') === '1') return true;
  if (query.get('touch') === '0') return false;
  return navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

export function installTouchControls({ applyEdge, canControl, startRun, togglePause }) {
  const deck = document.getElementById('touchDeck');
  const stick = document.getElementById('touchStick');
  const nub = document.getElementById('touchNub');
  const cue = document.getElementById('touchCue');
  const swap = document.getElementById('touchSwap');
  const pause = document.getElementById('touchPause');
  const enabled = Boolean(deck && stick && nub && touchMode());
  const held = new Set();

  let pointerId = null;
  let anchorX = 0;
  let anchorY = 0;
  let dx = 0;
  let dy = 0;
  let magnitude = 0;
  let fire = false;
  let clutch = false;
  let clutchTimer = 0;
  let jumpTimer = 0;
  let jumpHeld = false;
  let downAt = 0;
  let travel = 0;
  let jumps = 0;
  let jumpedOnDown = false;

  function radius() {
    return clamp(Math.min(innerWidth, innerHeight) * 0.105, 48, 68);
  }

  function setCode(code, active) {
    if (active === held.has(code)) return;
    if (active) held.add(code); else held.delete(code);
    applyEdge(code, active ? 'keydown' : 'keyup', false);
  }

  function releaseMotion() {
    for (const code of [...held]) setCode(code, false);
    dx = 0;
    dy = 0;
    magnitude = 0;
    fire = false;
  }

  function releaseJump() {
    if (jumpTimer) clearTimeout(jumpTimer);
    jumpTimer = 0;
    if (!jumpHeld) return;
    jumpHeld = false;
    applyEdge(JUMP_CODE, 'keyup', false);
  }

  function pulseJump() {
    releaseJump();
    applyEdge(JUMP_CODE, 'keydown', false);
    jumpHeld = true;
    jumps++;
    jumpTimer = setTimeout(releaseJump, JUMP_PULSE_MS);
    deck.classList.remove('jump');
    // Restart the tiny CSS kick even when two air jumps arrive close together.
    void deck.offsetWidth;
    deck.classList.add('jump');
  }

  function clearClutch() {
    if (clutchTimer) clearTimeout(clutchTimer);
    clutchTimer = 0;
    clutch = false;
    deck.classList.remove('clutch');
  }

  function hideStick() {
    stick.classList.remove('on', 'firing');
    cue.textContent = 'DRAG · OUTER RAIL FIRES · TAP JUMPS';
  }

  function stop({ release = true } = {}) {
    pointerId = null;
    clearClutch();
    if (release) {
      releaseMotion();
      releaseJump();
    } else {
      held.clear();
      jumpHeld = false;
      if (jumpTimer) clearTimeout(jumpTimer);
      jumpTimer = 0;
    }
    hideStick();
  }

  function showAnchor(x, y) {
    const r = radius();
    const bounds = deck.getBoundingClientRect();
    anchorX = clamp(x, bounds.left + r * 1.55, bounds.right - r * 1.55);
    anchorY = clamp(y, bounds.top + r * 1.55, bounds.bottom - r * 1.55);
    stick.style.setProperty('--stick-x', `${anchorX}px`);
    stick.style.setProperty('--stick-y', `${anchorY}px`);
    stick.style.setProperty('--stick-r', `${r}px`);
    stick.classList.add('on');
  }

  function paintIntent(rawX, rawY) {
    const r = radius();
    const max = r * 1.48;
    const rawMagnitude = Math.hypot(rawX, rawY);
    const gain = rawMagnitude > max ? max / rawMagnitude : 1;
    dx = rawX * gain;
    dy = rawY * gain;
    magnitude = rawMagnitude;
    travel = Math.max(travel, rawMagnitude);
    nub.style.transform = `translate(${dx}px, ${dy}px)`;

    const axis = r * 0.27;
    setCode(MOVE_CODE.left, dx < -axis);
    setCode(MOVE_CODE.right, dx > axis);
    setCode(MOVE_CODE.up, dy < -axis);
    setCode(MOVE_CODE.down, dy > axis);
    fire = rawMagnitude >= r * 1.14;
    setCode(FIRE_CODE, fire);
    stick.classList.toggle('firing', fire);
    cue.textContent = fire ? 'FIRE LOCK · LIFT TO CLUTCH' : 'AIM / MOVE · PUSH OUT TO FIRE';
  }

  function begin(event) {
    if (pointerId !== null || event.button > 0) return;
    event.preventDefault();
    event.stopPropagation();
    startRun();
    if (!canControl()) return;

    pointerId = event.pointerId;
    deck.setPointerCapture?.(pointerId);
    downAt = performance.now();
    travel = 0;
    jumpedOnDown = false;

    if (clutch) {
      clearClutch();
      pulseJump();
      jumpedOnDown = true;
      stick.classList.add('on');
      paintIntent(event.clientX - anchorX, event.clientY - anchorY);
    } else {
      showAnchor(event.clientX, event.clientY);
      nub.style.transform = 'translate(0px, 0px)';
      releaseMotion();
    }
  }

  function move(event) {
    if (event.pointerId !== pointerId) return;
    event.preventDefault();
    paintIntent(event.clientX - anchorX, event.clientY - anchorY);
  }

  function end(event) {
    if (event.pointerId !== pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    pointerId = null;
    const wasTap = performance.now() - downAt <= TAP_MS && travel <= TAP_TRAVEL_PX;
    const inDeadZone = magnitude < radius() * 0.27;
    if ((wasTap && !jumpedOnDown) || inDeadZone) {
      releaseMotion();
      clearClutch();
      hideStick();
      if (wasTap && !jumpedOnDown) pulseJump();
      return;
    }

    clutch = true;
    deck.classList.add('clutch');
    cue.textContent = 'CLUTCH · TAP AGAIN TO JUMP';
    clutchTimer = setTimeout(() => {
      clutchTimer = 0;
      clutch = false;
      deck.classList.remove('clutch');
      releaseMotion();
      hideStick();
    }, CLUTCH_MS);
  }

  function cancel(event) {
    if (event && pointerId !== null && event.pointerId !== pointerId) return;
    stop();
  }

  function buttonEdge(event, code) {
    event.preventDefault();
    event.stopPropagation();
    startRun();
    if (!canControl()) return;
    applyEdge(code, 'keydown', false);
    setTimeout(() => applyEdge(code, 'keyup', false), 72);
  }

  if (enabled) {
    document.body.classList.add('touch-controls');
    deck.hidden = false;
    deck.addEventListener('pointerdown', begin);
    deck.addEventListener('pointermove', move);
    deck.addEventListener('pointerup', end);
    deck.addEventListener('pointercancel', cancel);
    swap.addEventListener('pointerdown', (event) => buttonEdge(event, SWAP_CODE));
    pause.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      togglePause();
    });
    addEventListener('blur', () => stop());
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  }

  const snapshot = () => ({
    enabled,
    active: pointerId !== null,
    clutch,
    vector: { x: +dx.toFixed(2), y: +dy.toFixed(2), magnitude: +magnitude.toFixed(2) },
    fire,
    held: [...held],
    jumps,
  });
  const controller = { enabled, reset: stop, snapshot };
  if (typeof window !== 'undefined') window.__HB_TOUCH = snapshot;
  return controller;
}
