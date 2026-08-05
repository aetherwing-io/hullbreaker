/* ============================= TINT =============================== */
/* Full-screen modifier tint. Cached: the DOM write happens only when the
   color actually changes, so a steady state costs nothing per frame. */

const tintEl = document.getElementById('tint');
let tintLast = 'transparent';

export function setTint(tint) {
  if (tint !== tintLast) { tintLast = tint; tintEl.style.background = tint; }
}

// modifier teardown (clearMods) always writes, cache or not
export function resetTint() {
  tintEl.style.background = 'transparent';
  tintLast = 'transparent';
}
