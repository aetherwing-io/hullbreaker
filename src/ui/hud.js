/* ============================== HUD =============================== */
/* The four corner readouts and the control legend. Reads sim state only —
   no HUD element is ever a source of truth. */

import { CONFIG } from '../config.js';
import { TRANSFORM_FIXTURE } from '../pure/transform.js';
import {
  ACTIVE_SLICE, IS_TRANSFORM_SLICE, IS_TRAVERSAL_SLICE, SCORE_ENABLED,
  SLICE_ENEMIES_ENABLED,
} from '../mode.js';
import { scoreNotchGlyphs } from '../pure/score.js';
import { gameMs, scrollX, sliceStats } from '../sim/time.js';
import { player, P } from '../sim/player.js';
import { scoreNotchNow, scoreThreat } from '../sim/score.js';
import { currentWeapon, weaponDef } from '../sim/weapons.js';
import { mods } from '../sim/mods.js';
import { hostiles, ENEMY, kills } from '../sim/hostiles.js';
import { activeCorner } from '../sim/wavegate.js';
import {
  activeTransformEvent, committedBand, lastCommit, transformAltitudeAt, transformBandLabel,
} from '../sim/transform.js';

const hudTL = document.getElementById('hudTL');
const hudTC = document.getElementById('hudTC');
const hudTR = document.getElementById('hudTR');
const hudBL = document.getElementById('hudBL');

hudBL.innerHTML = IS_TRAVERSAL_SLICE
  ? 'MOVE wasd/arrows &nbsp; JUMP space &nbsp; FIRE j or x &nbsp; RETRY r<br>' +
    'LEDGE near-misses catch: jump launches, down releases &nbsp;&middot;&nbsp; WALL contact: jump launches, down releases<br>' +
    'DROP down+jump &nbsp;&middot;&nbsp; MAGENTA POCKET = take H, retreat left &nbsp;&middot;&nbsp; PAUSE p/esc<br>' +
    'LOSING HP = HULL FALLBACK: the ship drops you to the route below and play continues'
  : IS_TRANSFORM_SLICE
    ? 'MOVE wasd/arrows &nbsp; JUMP space (hold = higher, again in air = double) &nbsp; FIRE j or x &nbsp; RETRY r<br>' +
      'TRANSFORMATION SLICE &nbsp;&middot;&nbsp; run into the open panel, then into the one ahead: ' +
      'the ship turns the world, you keep the same controls<br>' +
      'ALT is the rendered altitude of the surface you are standing on &nbsp;&middot;&nbsp; PAUSE p/esc'
    : 'MOVE wasd/arrows &nbsp; JUMP space (hold = higher, again in air = double) &nbsp; FIRE j or x<br>' +
      'AIM 8-way via move keys &nbsp; STRAFE-LOCK shift &nbsp; DROP down+jump on catwalks<br>' +
      'CAPSULES swap weapons &middot; hit = weapon pops out, recatch it fast &nbsp;&middot;&nbsp; PAUSE p/esc';

// updateHUD runs every rAF frame; assigning textContent replaces the text
// node even when identical, dirtying layout for three fixed elements 60x/s.
// Cache the last-written string per element and write only on change — in
// steady state DOM writes drop to near zero.
let hudTLLast = null, hudTCLast = null, hudTRLast = null;
const MOD_LABELS = [['rageUntil', 'RAGE'], ['ghostUntil', 'GHOST'], ['chronoUntil', 'CHRONO']];

export function updateHUD() {
  const hp = Math.max(0, player.hp);
  let tl = 'RIG ' + '▰'.repeat(hp) + '▱'.repeat(P.maxHealth - hp) +
           (IS_TRAVERSAL_SLICE ? '' : '  ×' + Math.max(0, player.lives)) +
           '  ·  [' + currentWeapon + '] ' + weaponDef(currentWeapon).name;
  // CHARGE notches are welded to the weapon readout, not given their own bar:
  // the player reads "how hot is my gun", in the place their eye already goes.
  if (SCORE_ENABLED) {
    const notch = scoreNotchNow();
    tl += ' ' + scoreNotchGlyphs(notch) +
      (notch >= CONFIG.score.notches.length ? ' BREAKING' : '');
  }
  for (const [f, label] of MOD_LABELS)
    if (gameMs < mods[f]) tl += ' · ' + label + ' ' + Math.ceil((mods[f] - gameMs) / 1000) + 's';
  if (mods.lance) tl += ' · LANCE ARMING';
  if (tl !== hudTLLast) { hudTLLast = tl; hudTL.textContent = tl; }
  const edge = Number.isFinite(sliceStats.minEdgeMargin)
    ? Math.max(0, sliceStats.minEdgeMargin).toFixed(1)
    : '—';
  let tr = IS_TRAVERSAL_SLICE
    ? `ATTEMPT ${sliceStats.attempts} · EDGE ${edge}` +
      (sliceStats.setbacks ? ` · FALLBACK ${sliceStats.setbacks}` : '') +
      ` · ${kills} kills`
    : IS_TRANSFORM_SLICE
      ? `ALT ${Math.round(transformAltitudeAt(player.x) + player.y)}m · ` +
        `${committedBand}/2 TURNS · ${kills} kills`
      : Math.floor(scrollX) + 'm  ·  ' + kills + ' kills';
  if (SCORE_ENABLED) tr += ' · THREAT ' + Math.round(scoreThreat());
  if (tr !== hudTRLast) { hudTRLast = tr; hudTR.textContent = tr; }
  const c = activeCorner();
  let tc = transformMessage();
  const pocket = ACTIVE_SLICE && ACTIVE_SLICE.darePocket.bounds;
  if (ACTIVE_SLICE && gameMs - sliceStats.lastSetbackAt < ACTIVE_SLICE.fallback.messageMs) {
    // HULL FALLBACK has to be explainable (pillar 5) — one line, existing slot
    tc = 'HULL FALLBACK · LOWER ROUTE · KEEP MOVING →';
  } else if (pocket && player.x >= pocket.x0 && player.x < pocket.x1) {
    tc = currentWeapon === ACTIVE_SLICE.darePocket.reward.letter
      ? 'H ACQUIRED · RETREAT LEFT ←'
      : 'H WAGER → · EXIT LEFT ←';
  } else if (IS_TRAVERSAL_SLICE && gameMs - sliceStats.startedAt < 2400) {
    tc = 'TRAVERSAL SLICE · ' + ACTIVE_SLICE.pace.label + ' · ' +
      (SLICE_ENEMIES_ENABLED ? ACTIVE_SLICE.enemies.length + ' HOSTILES' : 'MOVEMENT ONLY');
  } else if (c && c.state === 'gate') {
    let gaters = 0;
    for (const e of hostiles) if (ENEMY[e.kind].gating) gaters++;
    tc = 'WAVE ' + c.k + '/' + CONFIG.path.faces + ' — ' + gaters + ' HOSTILES';
  } else if (c && c.state === 'turning' && gameMs - c.tStart < CONFIG.waves.clearMsgMs) {
    tc = 'CLEAR';
  }
  if (tc !== hudTCLast) { hudTCLast = tc; hudTC.textContent = tc; }
}

/* The transformation slice's centre callout: the ship opening a way in, the
   ritual itself, and then the defensive state the break moved it to
   (Intercept → Contain → Quarantine, per the story spine). */
function transformMessage() {
  if (!IS_TRANSFORM_SLICE) return '';
  const ev = activeTransformEvent();
  if (ev && ev.state === 'armed') return ev.armMsg;
  if (ev && ev.state === 'turning') return ev.label;
  if (lastCommit && gameMs - lastCommit.at < CONFIG.transform.clearMsgMs)
    return `${lastCommit.ev.label} — ${transformBandLabel()} · MERIDIAN: ${transformShipState()}`;
  if (gameMs - sliceStats.startedAt < 2400)
    return 'TRANSFORMATION SLICE · ' + transformBandLabel();
  return '';
}

function transformShipState() {
  return IS_TRANSFORM_SLICE ? TRANSFORM_FIXTURE.bands[committedBand].shipState : '';
}

// resetGame clears the corner message and keeps the write cache coherent
export function resetHudMessage() {
  hudTC.textContent = '';
  hudTCLast = '';
}
