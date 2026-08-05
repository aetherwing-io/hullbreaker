/* ============================= STATES ============================= */
/* Full machine: BOOT → MENU → PLAYING → PAUSED/SLICE_RETRY → GAME_OVER/VICTORY.
   Grey-box boots straight into PLAYING; MENU arrives with the UI pass.
   The overlay copy for each state lives in src/ui/overlay.js and is
   reached through the view bridge, so the sim owns the state and nothing
   else. */

import { view } from './bridge.js';

export let state = 'BOOT';

export function setState(next) {
  state = next;
  view.stateScreen(next);
}
