/* =========================== OVERLAY ============================== */
/* The state screens: pause, fixture retry, game over, victory. The state
   machine itself is sim (src/sim/state.js) and reaches this presentation
   through the view bridge, so the sim owns no copy. */

import { IS_TRAVERSAL_SLICE } from '../mode.js';
import { installView } from '../sim/bridge.js';
import { gameMs, scrollX, sliceStats } from '../sim/time.js';
import { weaponDef, weaponKills, shotsFired } from '../sim/weapons.js';
import { kills } from '../sim/hostiles.js';

const overlay = document.getElementById('overlay');
const ovTitle = document.getElementById('ovTitle');
const ovBody = document.getElementById('ovBody');

function favoriteWeaponLine() {
  let best = 'R';
  for (const k of Object.keys(weaponKills)) if (weaponKills[k] > weaponKills[best]) best = k;
  return `favorite weapon: ${weaponDef(best).name} (${weaponKills[best]} kills)`;
}

function showOverlay(title, lines) {
  ovTitle.textContent = title;
  ovBody.innerHTML = lines.map(l => `<p${l.dim ? ' class="dim"' : ''}>${l.text}</p>`).join('');
  overlay.style.display = 'flex';
}
function hideOverlay() { overlay.style.display = 'none'; }

function showStateScreen(next) {
  if (next === 'PLAYING') hideOverlay();
  else if (next === 'PAUSED') showOverlay('PAUSED', [{ text: 'p / esc to resume', dim: true }]);
  else if (next === 'SLICE_RETRY') showOverlay('ROUTE LOST', [
    { text: 'resetting traversal fixture…', dim: true },
    { text: 'r to retry now', dim: true },
  ]);
  else if (next === 'GAME_OVER') showOverlay('SIGNAL LOST', [
    { text: `${Math.floor(scrollX)}m · ${kills} kills · ${shotsFired} shots` },
    { text: favoriteWeaponLine() },
    { text: 'r to restart', dim: true },
  ]);
  else if (next === 'VICTORY') {
    if (IS_TRAVERSAL_SLICE) {
      const elapsed = Math.max(0, (gameMs - sliceStats.startedAt) / 1000).toFixed(1);
      const edge = Number.isFinite(sliceStats.minEdgeMargin)
        ? Math.max(0, sliceStats.minEdgeMargin).toFixed(1)
        : '—';
      showOverlay('TRAVERSAL CLEAR', [
        { text: `${elapsed}s · ${kills} kills · ${sliceStats.airJumps} air jumps` },
        { text: `closest damage-edge margin: ${edge} tiles` },
        { text: `attempt ${sliceStats.attempts} · ${sliceStats.falls} total falls` },
        { text: 'r to replay', dim: true },
      ]);
    } else {
      showOverlay('SECTOR CLEAR', [
        { text: 'grey-box complete' },
        { text: `${Math.floor(scrollX)}m · ${kills} kills · ${shotsFired} shots` },
        { text: favoriteWeaponLine() },
        { text: 'r to restart', dim: true },
      ]);
    }
  }
}

installView({ stateScreen: showStateScreen });
