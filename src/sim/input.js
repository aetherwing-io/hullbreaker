/* ============================= INPUT ============================== */
/* The intent buffer the simulation reads. The DOM key listeners that fill
   it live in src/main.js, so a bot player or a headless harness can drive
   these fields directly instead of synthesizing key events. */

export const keys = { left: false, right: false, up: false, down: false, jump: false, fire: false, strafe: false };
export let jumpBufferedUntil = 0;

export function bufferJumpUntil(ms) { jumpBufferedUntil = ms; }
export function clearJumpBuffer() { jumpBufferedUntil = 0; }

// losing focus mid-hold would otherwise leave movement/fire keys stuck on
export function releaseAllKeys() { for (const k in keys) keys[k] = false; }
