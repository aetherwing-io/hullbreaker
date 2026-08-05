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
const hudRigPanel = document.getElementById('hudRigPanel');
const hudObjectivePanel = document.getElementById('hudObjectivePanel');
const hudRunPanel = document.getElementById('hudRunPanel');
const hudLives = document.getElementById('hudLives');
const hudHealthPips = document.getElementById('hudHealthPips');
const hudHealthValue = document.getElementById('hudHealthValue');
const hudWeaponKey = document.getElementById('hudWeaponKey');
const hudWeaponName = document.getElementById('hudWeaponName');
const hudWeaponOther = document.getElementById('hudWeaponOther');
const hudPowerRow = document.querySelector('.hud-power');
const hudOverdrive = document.getElementById('hudOverdrive');
const hudOverdrivePips = [...hudOverdrive.querySelectorAll('i')];
const hudPowerState = document.getElementById('hudPowerState');
const hudPowerText = document.getElementById('hudPowerText');
const hudStatus = document.getElementById('hudStatus');
const hudObjectiveLabel = document.getElementById('hudObjectiveLabel');
const hudObjective = document.getElementById('hudObjective');
const hudRunLabel = document.getElementById('hudRunLabel');
const hudMetricA = document.getElementById('hudMetricA');
const hudMetricALabel = document.getElementById('hudMetricALabel');
const hudMetricB = document.getElementById('hudMetricB');
const hudMetricBLabel = document.getElementById('hudMetricBLabel');
const hudMetricC = document.getElementById('hudMetricC');
const hudMetricCLabel = document.getElementById('hudMetricCLabel');
const hudRushRow = document.getElementById('hudRushRow');
const hudRushPips = document.getElementById('hudRushPips');
const hudRushState = document.getElementById('hudRushState');

// How many world turns the LOADED fixture actually authors. Hardcoding the v1
// demo's 2 made the single-event G2 fixture advertise a second transformation
// that does not exist (SPRINT I-009), on every frame of every G2 capture.
const TRANSFORM_TURNS = IS_TRANSFORM_SLICE ? ACTIVE_FIXTURE.events.length : 0;

const HOOK_LEGEND = HOOK_ENABLED
  ? (HOOK_INPUT === 'auto'
    ? ' · HOOK AUTO'
    : ' · HOOK L/E')
  : '';
const FLOW_LEGEND = FLOW_ENABLED
  ? ' · CHAIN AIR MOVES FOR FLOW'
  : '';
const BOUNCE_LEGEND = AUTOBOUNCE_ENABLED
  ? ' · HOLD JUMP TO AUTOBOUNCE'
  : '';

hudBL.innerHTML = IS_TRAVERSAL_SLICE
  ? 'MOVE WASD/ARROWS · JUMP SPACE · FIRE J/X · DROP DOWN+JUMP · RETRY R' +
    HOOK_LEGEND + FLOW_LEGEND + BOUNCE_LEGEND +
    // the aim-gap A/B prototypes announce themselves too, or the operator cannot
    // tell which of the answers they are currently feeling
    (CROUCH_ENABLED
      ? ' · CROUCH DOWN'
      : '') +
    (AIM_ASSIST_ENABLED ? ' · AIM ASSIST ON' : '')
  : IS_TRANSFORM_SLICE
    ? 'MOVE WASD/ARROWS · JUMP SPACE ×2 · FIRE J/X · RUN THROUGH OPEN PANEL · RETRY R'
    : 'MOVE WASD/ARROWS · JUMP SPACE ×2 · FIRE J/X · AIM WITH MOVE · SWAP C · PAUSE ESC';

// updateHUD runs every rAF frame. Cache one readable signature per instrument
// and write its child fields only when that signature changes; the structured
// HUD stays available to assistive tech and playtest scraping without dirtying
// the whole panel's layout 60 times per second.
let hudTLLast = null, hudTCLast = null, hudTRLast = null, legendHidden = false;
const MOD_LABELS = [['rageUntil', 'RAGE'], ['ghostUntil', 'GHOST'], ['chronoUntil', 'CHRONO']];
const GUN_TIER_MARK = ['', 'I', 'II', 'III'];

function put(el, value) {
  const next = String(value);
  if (el.textContent !== next) el.textContent = next;
}

function updateMeter(nodes, lit) {
  for (let i = 0; i < nodes.length; i++) nodes[i].classList.toggle('on', i < lit);
}

function setMetric(valueEl, labelEl, value, label) {
  put(valueEl, value);
  put(labelEl, label);
}

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
  const healthGlyphs = '▰'.repeat(hp) + '▱'.repeat(P.maxHealth - hp);
  const lives = Math.max(0, player.lives);
  let otherGun = 'FIELD RIFLE // PRIMARY';
  let legacyOtherGun = '';
  if (carriedGun) {
    const other = currentGun === carriedGun ? 'RIFLE' : carriedGunLabel(true);
    otherGun = (mobileHud ? 'C↔ ' : 'C SWAP // ') + other;
    legacyOtherGun = (mobileHud ? ' · C↔ ' : ' · C SWAP ↔ ') + other;
  }
  // OVERDRIVE is welded to the weapon readout: it is an earned combat power,
  // not a developer score. The name makes the faster fire / launch shock
  // promise legible the first time a player sees the meter fill.
  const notch = SCORE_ENABLED ? scoreNotchNow() : 0;
  const powerGlyphs = scoreNotchGlyphs(notch);
  const powerState = notch >= CONFIG.score.notches.length
    ? 'HULLBREAK'
    : notch > 0 ? 'WARM' : 'COLD';
  const statuses = [];
  // FLOW rides the same readout for the same reason: the player's eye is
  // already there, and the chain has to be visible while it builds and bleeds.
  if (FLOW_ENABLED) {
    const fl = flowSnapshot();
    statuses.push('FLOW ' + '▮'.repeat(fl.links) + '▯'.repeat(fl.max - fl.links) +
      (fl.links ? ' ×' + fl.mult.toFixed(2) : ''));
  }
  // kept to one short word: this readout sits beside the centered slice banner,
  // and an anchor id here overlapped it (browser screenshot)
  if (HOOK_ENABLED) {
    const hk = hookSnapshot();
    if (hk.phase !== 'idle') statuses.push('TETHER');
    else if (hk.acquirable) statuses.push('HOOK READY');
  }
  for (const [f, label] of MOD_LABELS)
    if (gameMs < mods[f]) statuses.push((mobileHud ? label.slice(0, 3) : label) + ' ' +
      Math.ceil((mods[f] - gameMs) / 1000) + 's');
  if (mods.lance) statuses.push(mobileHud ? 'LANCE' : 'LANCE ARMING');
  const status = statuses.join(' // ');
  // Keep the compact string as the cache key and the DOM's textual fallback:
  // test drivers can still read health pips, ×lives, weapon and readiness
  // without understanding the presentation markup.
  let tl = 'RIG ' + healthGlyphs + (IS_TRAVERSAL_SLICE ? '' : ' ×' + lives) +
    '\n[' + currentWeapon + gunTier + '] ' + gunName + legacyOtherGun;
  if (SCORE_ENABLED) {
    tl += (mobileHud ? ' · OD ' : ' · OVERDRIVE ') + powerGlyphs +
      (notch >= CONFIG.score.notches.length ? (mobileHud ? ' BREAK' : ' HULLBREAK') : '');
  }
  for (const item of statuses) tl += ' · ' + item;
  if (tl !== hudTLLast) {
    hudTLLast = tl;
    put(hudTL, tl);
    put(hudLives, IS_TRAVERSAL_SLICE ? 'RIG' : '×' + lives);
    put(hudHealthPips, healthGlyphs);
    hudHealthPips.dataset.critical = hp <= 1 ? 'true' : 'false';
    hudRigPanel.dataset.health = hp <= 1 ? 'critical' : hp < P.maxHealth ? 'damaged' : 'stable';
    put(hudHealthValue, hp + '/' + P.maxHealth);
    put(hudWeaponKey, '[' + currentWeapon + gunTier + ']');
    put(hudWeaponName, gunName);
    put(hudWeaponOther, otherGun);
    hudPowerRow.hidden = !SCORE_ENABLED;
    updateMeter(hudOverdrivePips, notch);
    put(hudPowerState, powerState);
    put(hudPowerText, SCORE_ENABLED ? 'OVERDRIVE ' + powerGlyphs + ' ' + powerState : '');
    put(hudStatus, status);
  }
  const edge = Number.isFinite(sliceStats.minEdgeMargin)
    ? Math.max(0, sliceStats.minEdgeMargin).toFixed(1)
    : '—';
  let runLabel, metricA, metricALabel, metricB, metricBLabel;
  if (IS_TRAVERSAL_SLICE) {
    runLabel = 'ROUTE // LIVE';
    metricA = sliceStats.attempts; metricALabel = 'ATTEMPT';
    metricB = edge; metricBLabel = sliceStats.setbacks ? `EDGE · ${sliceStats.setbacks} FALLS` : 'EDGE';
  } else if (IS_TRANSFORM_SLICE) {
    runLabel = 'BREACH // LIVE';
    metricA = Math.round(transformAltitudeAt(player.x) + player.y) + 'm'; metricALabel = 'ALT';
    metricB = committedBand + '/' + TRANSFORM_TURNS; metricBLabel = 'TURNS';
  } else {
    runLabel = 'ASCENT // LIVE';
    metricA = Math.round(normalAscentAltAt(player.x, CONFIG.levelLength) + player.y) + 'm'; metricALabel = 'ALT';
    metricB = Math.floor(scrollX) + 'm'; metricBLabel = 'FORWARD';
  }
  // THREAT remains in the run summary/telemetry; the live HUD spends that
  // space on actionable information instead of an unexplained debug number.
  // RUSH is the visible earned pace escalation. Keep the compact three-pip
  // read on the crowded top edge; the exact multiplier remains in telemetry.
  const drive = MOMENTUM_ENABLED ? momentumDrive() : 0;
  const rush = momentumMeter(drive, CONFIG.momentum);
  const rushState = drive >= .67 ? 'SURGE' : drive >= .3 ? 'RISING' : 'STEADY';
  let tr = IS_TRAVERSAL_SLICE
    ? `ATTEMPT ${sliceStats.attempts} · EDGE ${edge}` +
      (sliceStats.setbacks ? ` · FALLBACK ${sliceStats.setbacks}` : '') +
      ` · ${kills} kills`
    : IS_TRANSFORM_SLICE
      ? `ALT ${metricA} · ${committedBand}/${TRANSFORM_TURNS} TURNS · ${kills} kills`
      : `ALT ${metricA} · ${metricB} FORWARD · ${kills} KILLS`;
  if (MOMENTUM_ENABLED) tr += ' · RUSH ' + rush;
  if (tr !== hudTRLast) {
    hudTRLast = tr;
    put(hudTR, tr);
    put(hudRunLabel, runLabel);
    setMetric(hudMetricA, hudMetricALabel, metricA, metricALabel);
    setMetric(hudMetricB, hudMetricBLabel, metricB, metricBLabel);
    setMetric(hudMetricC, hudMetricCLabel, kills, 'KILLS');
    hudRushRow.hidden = !MOMENTUM_ENABLED;
    put(hudRushPips, rush);
    put(hudRushState, rushState);
    hudRunPanel.dataset.rush = rushState.toLowerCase();
  }
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
    const compactLandscape = globalThis.innerHeight <= 520 && globalThis.innerWidth <= 980;
    tc = `WAVE ${c.k}/${CONFIG.path.faces} · ${c.phase}` +
      (c.primed ? ' · INBOUND' : c.k === 1 && scrollX < 14
        ? compactLandscape ? ' · CONTACT' : ' · MERIDIAN HAS SEEN YOU'
        : '');
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
  if (tc !== hudTCLast) {
    hudTCLast = tc;
    put(hudObjective, tc);
    const upper = tc.toUpperCase();
    const danger = /FALLBACK|HOSTILE|INBOUND|WAGER|LOST/.test(upper);
    const clear = /BROKEN|COMPLETE|OPEN|ACQUIRED/.test(upper);
    put(hudTC, tc);
    hudObjectivePanel.dataset.tone = danger ? 'danger' : clear ? 'clear' : 'steady';
    put(hudObjectiveLabel, /TRANSFORM|BREACH|TURN/.test(upper)
      ? 'HULL GEOMETRY'
      : /FALLBACK|ROUTE/.test(upper) ? 'ROUTE STATUS' : 'MERIDIAN RESPONSE');
    hudObjectivePanel.classList.toggle('empty', !tc);
  }
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
  hudObjective.textContent = '';
  hudObjectivePanel.classList.add('empty');
  hudTCLast = '';
}
