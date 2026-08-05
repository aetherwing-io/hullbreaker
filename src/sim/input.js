/* ============================= INPUT ============================== */
/* The intent buffer the simulation reads. The DOM key listeners that fill
   it live in src/main.js, so a bot player or a headless harness can drive
   these fields directly instead of synthesizing key events. */

export const keys = {
  left: false, right: false, up: false, down: false,
  jump: false, fire: false, strafe: false,
  swap: false,
  // snap hook (?hook=1). Present unconditionally so releaseAllKeys and any
  // harness see one stable key set; inert unless the flag arms sim/hook.js.
  hook: false,
};
export let jumpBufferedUntil = 0;
export let hookBufferedUntil = 0;
export let swapBufferedUntil = 0;

export function bufferJumpUntil(ms) { jumpBufferedUntil = ms; }
export function clearJumpBuffer() { jumpBufferedUntil = 0; }

// The hook is a buffered PRESS, like the jump: pressing a beat before an
// anchor becomes valid still grabs it, which is what keeps the verb from
// needing an aiming pause (DESIGN: "minimal aiming interruption").
export function bufferHookUntil(ms) { hookBufferedUntil = ms; }
export function clearHookBuffer() { hookBufferedUntil = 0; }

// Weapon swap is an edge, not a held action. The short buffer makes a press
// survive a hit-stop/fixed-step boundary without letting key repeat strobe it.
export function bufferSwapUntil(ms) { swapBufferedUntil = ms; }
export function clearSwapBuffer() { swapBufferedUntil = 0; }

// losing focus mid-hold would otherwise leave movement/fire keys stuck on
export function releaseAllKeys() { for (const k in keys) keys[k] = false; }
