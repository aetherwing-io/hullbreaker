/* ============================== HUD =============================== */
/* The four corner readouts and the control legend. Reads sim state only —
   no HUD element is ever a source of truth. */

import { CONFIG } from '../config.js';
import { TRANSFORM_FIXTURE } from '../pure/transform.js';
import {
  ACTIVE_FIXTURE, ACTIVE_SLICE, AIM_ASSIST_ENABLED, AUTOBOUNCE_ENABLED,
  CROUCH_ENABLED, FLOW_ENABLED, HOOK_ENABLED, HOOK_INPUT, HOUND_TRIAL_STAGE,
  IS_TRANSFORM_SLICE, IS_TRAVERSAL_SLICE, MOMENTUM_ENABLED, MORTAR_TRIAL_STAGE,
  POLYP_TRIAL_STAGE, RUN_FALLBACK_ENABLED, SCORE_ENABLED, SLICE_ENEMIES_ENABLED, SLICE_ENEMY_PLAN,
  VIEW_ID,
} from '../mode.js';
import { momentumMeter } from '../pure/momentum.js';
import { normalAscentAltAt } from '../pure/ascent.js';
import { momentumDrive } from '../sim/pace.js';
import { scoreNotchGlyphs } from '../pure/score.js';
import { activeGateThreatCount, wavePhase } from '../pure/waves.js';
import { gameMs, scrollX, sliceStats } from '../sim/time.js';
import { player, P } from '../sim/player.js';
import { scoreNotchNow } from '../sim/score.js';
import {
  carriedGun, carriedGunLabel, currentGun, currentGunLabel, currentWeapon,
} from '../sim/weapons.js';
import { mods } from '../sim/mods.js';
import { hostiles, kills } from '../sim/hostiles.js';
import { activeCorner } from '../sim/wavegate.js';
import { hookSnapshot } from '../sim/hook.js';
import { flowSnapshot } from '../sim/flow.js';
import {
  activeTransformEvent, committedBand, lastCommit, transformAltitudeAt, transformBandLabel,
} from '../sim/transform.js';
// Installs the non-blocking rolled-weapon reveal on the presentation bridge.
// Kept as a side-effect import here so the composition root's HUD import is
// still the sole UI entrypoint and audio (loaded last) can wrap the hook.
import './loot.js';

const hudTL = document.getElementById('hudTL');
const hudTC = document.getElementById('hudTC');
const hudTR = document.getElementById('hudTR');
const hudBL = document.getElementById('hudBL');
hudTL.style.whiteSpace = 'pre-line';

// How many world turns the LOADED fixture actually authors. Hardcoding the v1
// demo's 2 made the single-event G2 fixture advertise a second transformation
// that does not exist (SPRINT I-009), on every frame of every G2 capture.
const TRANSFORM_TURNS = IS_TRANSFORM_SLICE ? ACTIVE_FIXTURE.events.length : 0;

const HOOK_LEGEND = HOOK_ENABLED
  ? (HOOK_INPUT === 'auto'
    ? '<br>SNAP HOOK auto &mdash; fly near a lit anchor and the tether takes it: ' +
      'it zips you there and throws you forward (jump = throw early, down = drop off)'
    : '<br>SNAP HOOK l or e &mdash; grabs the lit anchor ahead, zips you to it, ' +
      'throws you forward (jump = throw early, down = drop off)')
  : '';
const FLOW_LEGEND = FLOW_ENABLED
  ? '<br>FLOW: every ledge / wall / hook launch without touching the floor ' +
    'compounds your speed &mdash; the floor bleeds it back off'
  : '';
const BOUNCE_LEGEND = AUTOBOUNCE_ENABLED
  ? '<br>AUTOBOUNCE: hold jump to keep bouncing &mdash; every landing re-arms it'
  : '';

hudBL.innerHTML = IS_TRAVERSAL_SLICE
  ? 'MOVE wasd/arrows &nbsp; JUMP space &nbsp; FIRE j or x &nbsp; RETRY r<br>' +
    'LEDGE near-misses catch: jump launches, down releases &nbsp;&middot;&nbsp; WALL contact: jump launches, down releases<br>' +
    'DROP down+jump &nbsp;&middot;&nbsp; MAGENTA POCKET = take H, retreat left &nbsp;&middot;&nbsp; PAUSE p/esc<br>' +
    'LOSING HP = HULL FALLBACK: the ship drops you to the route below and play continues' +
    HOOK_LEGEND + FLOW_LEGEND + BOUNCE_LEGEND +
    // the aim-gap A/B prototypes announce themselves too, or the operator cannot
    // tell which of the answers they are currently feeling
    (CROUCH_ENABLED
      ? '<br>CROUCH hold down while grounded: low firing line, low profile, no walking'
      : '') +
    (AIM_ASSIST_ENABLED ? '<br>AIM ASSIST on: shots bend up to 8&deg; toward what you point at' : '')
  : IS_TRANSFORM_SLICE
    ? 'MOVE wasd/arrows &nbsp; JUMP space (hold = higher, again in air = double) &nbsp; FIRE j or x &nbsp; RETRY r<br>' +
      'TRANSFORMATION SLICE &nbsp;&middot;&nbsp; run into the open panel, then into the one ahead: ' +
      'the ship turns the world, you keep the same controls<br>' +
      'ALT is the rendered altitude of the surface you are standing on &nbsp;&middot;&nbsp; PAUSE p/esc'
    : 'MOVE wasd/arrows &nbsp;&middot;&nbsp; JUMP space ×2 &nbsp;&middot;&nbsp; FIRE j/x &nbsp;&middot;&nbsp; AIM with move &nbsp;&middot;&nbsp; PAUSE p/esc<br>' +
      'MAGENTA CAPSULES = BIG WEAPONS &nbsp;&middot;&nbsp; C = rifle/carried weapon &nbsp;&middot;&nbsp; ' +
      'SHIFT = strafe aim &nbsp;&middot;&nbsp; DOWN+JUMP = drop';

// updateHUD runs every rAF frame; assigning textContent replaces the text
// node even when identical, dirtying layout for three fixed elements 60x/s.
// Cache the last-written string per element and write only on change — in
// steady state DOM writes drop to near zero.
let hudTLLast = null, hudTCLast = null, hudTRLast = null, legendHidden = false;
const MOD_LABELS = [['rageUntil', 'RAGE'], ['ghostUntil', 'GHOST'], ['chronoUntil', 'CHRONO']];
const GUN_TIER_MARK = ['', 'I', 'II', 'III'];

export function updateHUD() {
  // Teach the core controls, then give the playfield back. Restarting rewinds
  // scrollX, so the legend naturally returns for a fresh climb.
  const hideLegend = !ACTIVE_FIXTURE && scrollX > 30;
  if (hideLegend !== legendHidden) {
    legendHidden = hideLegend;
    hudBL.classList.toggle('gone', hideLegend);
  }
  const hp = Math.max(0, player.hp);
  const gunTier = currentGun.tier ? '·' + GUN_TIER_MARK[currentGun.tier] : '';
  // Tier II/III rolls use terse three-letter prefixes. The chassis name stays
  // whole, but even a three-trait CINDERMOUTH remains inside the mobile line.
  const mobileHud = globalThis.innerWidth <= 600;
  const gunName = currentGunLabel(currentGun.tier > 1 || mobileHud);
  let tl = 'RIG ' + '▰'.repeat(hp) + '▱'.repeat(P.maxHealth - hp) +
           (IS_TRAVERSAL_SLICE ? '' : '  ×' + Math.max(0, player.lives)) +
           // A relic name can be a full trait stack.  Two authored phone rows
           // are steadier than letting that stack wrap into the altitude row.
           '\n' +
           '[' + currentWeapon + gunTier + '] ' + gunName;
  if (carriedGun) {
    const other = currentGun === carriedGun ? 'RIFLE' : carriedGunLabel(true);
    tl += (mobileHud ? ' · C↔ ' : ' · C SWAP ↔ ') + other;
  }
  // OVERDRIVE is welded to the weapon readout: it is an earned combat power,
  // not a developer score. The name makes the faster fire / launch shock
  // promise legible the first time a player sees the meter fill.
  if (SCORE_ENABLED) {
    const notch = scoreNotchNow();
    tl += (mobileHud ? ' · OD ' : ' · OVERDRIVE ') + scoreNotchGlyphs(notch) +
      (notch >= CONFIG.score.notches.length ? (mobileHud ? ' BREAK' : ' HULLBREAK') : '');
  }
  // FLOW rides the same readout for the same reason: the player's eye is
  // already there, and the chain has to be visible while it builds and bleeds.
  if (FLOW_ENABLED) {
    const fl = flowSnapshot();
    tl += ' · FLOW ' + '▮'.repeat(fl.links) + '▯'.repeat(fl.max - fl.links) +
      (fl.links ? ' ×' + fl.mult.toFixed(2) : '');
  }
  // kept to one short word: this readout sits beside the centered slice banner,
  // and an anchor id here overlapped it (browser screenshot)
  if (HOOK_ENABLED) {
    const hk = hookSnapshot();
    if (hk.phase !== 'idle') tl += ' · TETHER';
    else if (hk.acquirable) tl += ' · HOOK';
  }
  for (const [f, label] of MOD_LABELS)
    if (gameMs < mods[f]) tl += ' · ' + (mobileHud ? label.slice(0, 3) : label) + ' ' +
      Math.ceil((mods[f] - gameMs) / 1000) + 's';
  if (mods.lance) tl += mobileHud ? ' · LANCE' : ' · LANCE ARMING';
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
        `${committedBand}/${TRANSFORM_TURNS} TURNS · ${kills} kills`
      : `ALT ${Math.round(normalAscentAltAt(player.x, CONFIG.levelLength) + player.y)}m · ` +
        `${Math.floor(scrollX)}m FORWARD · ${kills} KILLS`;
  // THREAT remains in the run summary/telemetry; the live HUD spends that
  // space on actionable information instead of an unexplained debug number.
  // RUSH is the visible earned pace escalation. Keep the compact three-pip
  // read on the crowded top edge; the exact multiplier remains in telemetry.
  if (MOMENTUM_ENABLED) {
    tr += ' · RUSH ' + momentumMeter(momentumDrive(), CONFIG.momentum);
  }
  if (tr !== hudTRLast) { hudTRLast = tr; hudTR.textContent = tr; }
  const c = activeCorner();
  let tc = transformMessage();
  const pocket = ACTIVE_SLICE && ACTIVE_SLICE.darePocket.bounds;
  if ((ACTIVE_SLICE || RUN_FALLBACK_ENABLED) && gameMs - sliceStats.lastSetbackAt <
      (ACTIVE_SLICE ? ACTIVE_SLICE.fallback.messageMs : 1800)) {
    // HULL FALLBACK has to be explainable (pillar 5) — one line, existing slot
    tc = 'HULL FALLBACK · LOWER ROUTE · KEEP MOVING →';
  } else if (pocket && player.x >= pocket.x0 && player.x < pocket.x1) {
    tc = currentWeapon === ACTIVE_SLICE.darePocket.reward.letter
      ? 'H ACQUIRED · RETREAT LEFT ←'
      : 'H WAGER → · EXIT LEFT ←';
  } else if (IS_TRAVERSAL_SLICE && gameMs - sliceStats.startedAt < 2400) {
    // view-scale experiment: self-documents on screenshots so a variant is
    // identifiable without cross-referencing the URL (FAR is the shipped
    // camera and stays silent to keep that overlay unchanged by default).
    const viewTag = VIEW_ID === 'far' ? '' : ' · VIEW ' + CONFIG.viewScales[VIEW_ID].label;
    tc = 'TRAVERSAL SLICE · ' + ACTIVE_SLICE.pace.label +
      (HOUND_TRIAL_STAGE ? ' + ' + HOUND_TRIAL_STAGE.label : '') +
      (POLYP_TRIAL_STAGE ? ' + ' + POLYP_TRIAL_STAGE.label : '') +
      (MORTAR_TRIAL_STAGE ? ' + ' + MORTAR_TRIAL_STAGE.label : '') + viewTag + ' · ' +
      (SLICE_ENEMIES_ENABLED ? SLICE_ENEMY_PLAN.length + ' HOSTILES' : 'MOVEMENT ONLY');
  } else if (!ACTIVE_FIXTURE && c && c.state === 'idle') {
    tc = `WAVE ${c.k}/${CONFIG.path.faces} · ${c.phase}` +
      (c.primed ? ' · INBOUND' : c.k === 1 && scrollX < 14 ? ' · MERIDIAN HAS SEEN YOU' : '');
  } else if (c && c.state === 'gate') {
    // Count only this encounter's current visible/condensing beat. Later
    // resident rows are implementation detail, and `gating` describes who
    // owns the eventual clear rather than which body is threatening RIG now.
    const threats = activeGateThreatCount(
      hostiles, c.encounterKey, gameMs, CONFIG.wasp.enterMs,
    );
    tc = `WAVE ${c.k}/${CONFIG.path.faces} · ${c.phase} · ` +
      (threats === 1 ? 'LAST SIGNAL · CLOSING' : `${threats} HOSTILES`);
  } else if (c && c.state === 'approach') {
    tc = `WAVE ${c.k}/${CONFIG.path.faces} BROKEN · RUN TO THE TURN →`;
  } else if (c && c.state === 'turning' && gameMs - c.tStart < CONFIG.waves.clearMsgMs) {
    tc = c.k < CONFIG.path.faces
      ? c.phase + ' BROKEN · ' + wavePhase(c.k + 1, CONFIG)
      : 'SCUTTLE COMPLETE · CROWN ACCESS OPEN';
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
  if (gameMs - sliceStats.startedAt < 2400) {
    const viewTag = VIEW_ID === 'far' ? '' : ' · VIEW ' + CONFIG.viewScales[VIEW_ID].label;
    return 'TRANSFORMATION SLICE · ' + transformBandLabel() + viewTag;
  }
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
