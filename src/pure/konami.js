/* ========================== KONAMI (pure) ========================= *
 * The gilded-chassis code: a deterministic key-sequence detector with no
 * DOM, no clock, and no game state — the composition root (src/main.js)
 * feeds it KeyboardEvent.code strings and owns the latch.
 *
 * Why pure: the detector is a tiny state machine whose whole contract is
 * "these exact ten presses, in order, with honest recovery from a
 * fumble". Expressing it as (progress, code) → { progress, fired } lets
 * pathcheck drive every edge headlessly — the partial-entry fallback
 * (pressing UP a third time must not lose the two UPs already banked) is
 * exactly the class of bug a hand-rolled index check gets wrong.
 *
 * The code is the canonical Konami sequence, UP UP DOWN DOWN LEFT RIGHT
 * LEFT RIGHT B A, expressed as KeyboardEvent.code values. Note the last
 * two are letter keys, not the (nonexistent) B/A buttons of a keyboard:
 * 'KeyB' is deliberately NOT a gameplay key (see GAMEPLAY_KEYMAP), so the
 * ninth press is unambiguous; 'KeyA' is also WASD-left, which is fine —
 * it only counts as the tenth press immediately after a 'KeyB' that
 * follows the full arrow run.                                                  */

export const KONAMI_SEQUENCE = Object.freeze([
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
  'KeyB', 'KeyA',
]);

/* Longest suffix of `prefix + code` that is also a prefix of the sequence —
   the KMP fallback, computed directly. With a ten-entry sequence this is
   trivially cheap, and it is what makes an entry like
   UP UP UP DOWN DOWN … still count (the third UP keeps two banked). */
function fallbackProgress(progress, code) {
  for (let k = Math.min(progress + 1, KONAMI_SEQUENCE.length - 1); k > 0; k--) {
    // candidate: the last k-1 matched presses, followed by this one
    if (KONAMI_SEQUENCE[k - 1] !== code) continue;
    let okTail = true;
    for (let i = 0; i < k - 1; i++) {
      if (KONAMI_SEQUENCE[progress - (k - 1) + i] !== KONAMI_SEQUENCE[i]) {
        okTail = false;
        break;
      }
    }
    if (okTail) return k;
  }
  return 0;
}

/* Advance the detector by one keydown. `progress` is the number of
   sequence presses already matched (0..KONAMI_SEQUENCE.length - 1).
   Returns the new progress and whether this press COMPLETED the code.
   When `fired` is true the progress resets to 0, so the code can be
   entered again (the composition root uses re-entry to toggle). */
export function advanceKonami(progress, code) {
  const p = Number.isInteger(progress) && progress >= 0 &&
    progress < KONAMI_SEQUENCE.length ? progress : 0;
  if (typeof code !== 'string' || code.length === 0) return { progress: p, fired: false };
  if (code === KONAMI_SEQUENCE[p]) {
    const next = p + 1;
    if (next === KONAMI_SEQUENCE.length) return { progress: 0, fired: true };
    return { progress: next, fired: false };
  }
  return { progress: fallbackProgress(p, code), fired: false };
}
