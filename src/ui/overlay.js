/* =========================== OVERLAY ============================== */
/* The state screens: title, pause, fixture retry, game over, victory. The
   state machine itself is sim (src/sim/state.js) and reaches this
   presentation through the view bridge, so the sim owns no copy.

   The overlay's own title and body text are frozen by use: the playtest
   harness reads #ovTitle / #ovBody to classify an outcome
   (tools/playtest/lib/sampler.mjs). The game shell (T-013) therefore
   ADDS to these screens through src/ui/shell.js — a stats/options panel
   in #ovPanel — instead of rewriting the lines below. */

import { CONFIG } from '../config.js';
import {
  ACTIVE_FIXTURE, ACTIVE_SLICE, IS_TRANSFORM_SLICE, IS_TRAVERSAL_SLICE,
  SCORE_ENABLED, VIEW_ID,
} from '../mode.js';
import { shellStateChanged } from './shell.js';
import { installView } from '../sim/bridge.js';
import { gameMs, sliceStats } from '../sim/time.js';
import { scoreSnapshot } from '../sim/score.js';
import { kills } from '../sim/hostiles.js';
import { player } from '../sim/player.js';
import { committedBand, transformAltitudeAt } from '../sim/transform.js';

const overlay = document.getElementById('overlay');
const ovTitle = document.getElementById('ovTitle');
const ovBody = document.getElementById('ovBody');

function showOverlay(title, lines) {
  ovTitle.textContent = title;
  ovBody.innerHTML = lines.map(l => `<p${l.dim ? ' class="dim"' : ''}>${l.text}</p>`).join('');
  overlay.style.display = 'flex';
}
function hideOverlay() { overlay.style.display = 'none'; }

function showStateScreen(next) {
  drawStateScreen(next);
  // the shell draws its panel into #ovPanel AFTER the body above, so the
  // scraped overlay text is exactly what it was before the shell existed
  shellStateChanged(next);
}

function drawStateScreen(next) {
  // MENU is the start screen: the run is built but frozen, and src/ui/shell.js
  // owns what is on screen — the overlay gets out of the way.
  if (next === 'PLAYING' || next === 'MENU') hideOverlay();
  else if (next === 'PAUSED') showOverlay('PAUSED', [{ text: 'p / esc to resume', dim: true }]);
  else if (next === 'SLICE_RETRY') showOverlay('ROUTE LOST', [
    { text: 'resetting fixture…', dim: true },
    { text: 'r to retry now', dim: true },
  ]);
  else if (next === 'GAME_OVER') showOverlay('SIGNAL LOST', [
    { text: 'MERIDIAN CUT THE TRANSMISSION.' },
    { text: 'GET BACK UP THERE.' },
    { text: 'r to climb again', dim: true },
  ]);
  else if (next === 'VICTORY') {
    if (IS_TRAVERSAL_SLICE) {
      const elapsed = Math.max(0, (gameMs - sliceStats.startedAt) / 1000).toFixed(1);
      const edge = Number.isFinite(sliceStats.minEdgeMargin)
        ? Math.max(0, sliceStats.minEdgeMargin).toFixed(1)
        : '—';
      const lines = [
        { text: `${elapsed}s · ${kills} kills · ${sliceStats.airJumps} air jumps` },
        { text: `closest damage-edge margin: ${edge} tiles` },
        { text: `attempt ${sliceStats.attempts} · ${sliceStats.falls} falls · ` +
                `${sliceStats.setbacks} hull fallbacks` },
      ];
      if (SCORE_ENABLED) {
        const sc = scoreSnapshot();
        lines.push({ text: `THREAT ${sc.threat} · ${sc.counts.airborne_kill} airborne ` +
                           `· ${sc.counts.link} links · ${sc.counts.wager} wagers` });
        lines.push({ text: `hot for ${(sc.hotMs / 1000).toFixed(1)}s of ` +
                           `${(sc.playMs / 1000).toFixed(1)}s` });
      }
      lines.push({ text: `pace: ${ACTIVE_SLICE.pace.label}`, dim: true });
      // mid (default) is silent: the VICTORY overlay only self-labels when a
      // non-default view was selected, same rule as the transient HUD tag.
      if (VIEW_ID !== 'mid') {
        lines.push({ text: `view: ${CONFIG.viewScales[VIEW_ID].label}`, dim: true });
      }
      lines.push({ text: 'r to replay', dim: true });
      showOverlay('TRAVERSAL CLEAR', lines);
    } else if (IS_TRANSFORM_SLICE) {
      const elapsed = Math.max(0, (gameMs - sliceStats.startedAt) / 1000).toFixed(1);
      // The loaded fixture's own turn count, never the v1 demo's 2: G2 authors
      // one event, and this line was telling the operator it had cleared one of
      // two (SPRINT I-009). #ovTitle is untouched — the harness classifies the
      // outcome off 'BREACH CLEAR', not off this body copy.
      const turns = ACTIVE_FIXTURE.events.length;
      const transformLines = [
        { text: `${elapsed}s · ${committedBand} of ${turns} ` +
                `transformation${turns === 1 ? '' : 's'} · ${kills} kills` },
        { text: `climbed ${Math.round(transformAltitudeAt(player.x))} tiles of body, on foot` },
        { text: 'flip inward → the passage climbs → breach out, one 2D controller the whole way' },
      ];
      // Same self-labeling rule as TRAVERSAL CLEAR: non-default views only.
      if (VIEW_ID !== 'mid') {
        transformLines.push({ text: `view: ${CONFIG.viewScales[VIEW_ID].label}`, dim: true });
      }
      transformLines.push({ text: 'r to replay', dim: true });
      showOverlay('BREACH CLEAR', transformLines);
    } else {
      showOverlay('SIGNAL SENT', [
        { text: 'CROWN UPLINK HELD. TRANSMISSION COMPLETE.' },
        { text: 'RIG: “HOME, THIS IS MERIDIAN COLONY. WE SURVIVED.”' },
        { text: 'EARTH: “MERIDIAN COLONY … WE HEAR YOU.”' },
        { text: 'r to climb again', dim: true },
      ]);
    }
  }
}

installView({ stateScreen: showStateScreen });
