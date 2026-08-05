// Domain: localized OVERDRIVE / RAGE presentation ========================
//
// Gameplay power must live on RIG and its shots, not as a global screen
// grade.  These checks freeze the three distinct visual identities, the
// edge-triggered fixed-mesh aura, and spawn-sampled projectile accents while
// proving all of it remains render-only and collision-honest.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  OVERDRIVE_ENTRY_MS, clampPower01, normalizedOverdriveCharge,
  overdriveBreath, overdriveProjectileGain, RAGE_STACCATO_HZ, rageStaccato,
} from '../../src/render/power-feedback.js';
import {
  CLASSIC as PAL_CLASSIC, CONCEPT as PAL_CONCEPT,
} from '../../src/render/palette.js';
import { ok, srcDir, stripComments } from './_context.mjs';

export const title = 'localized OVERDRIVE / RAGE presentation ===========';

export async function run() {
  ok(clampPower01(-4) === 0 && clampPower01(4) === 1,
    'power feedback: charge inputs are clamped to a safe presentation range');
  ok(normalizedOverdriveCharge(50, 100) === 0.5 &&
     normalizedOverdriveCharge(150, 100) === 1,
    'power feedback: raw score charge resolves continuously, not only at notches');
  ok(overdriveProjectileGain(0, 0.99) === 0 &&
     overdriveProjectileGain(1, 0.5) > 0 &&
     overdriveProjectileGain(2, 1) > overdriveProjectileGain(1, 1),
    'power feedback: projectiles stay cold below WARM and step up at BREAKING');
  const breath = [0, 80, 160, 240].map(overdriveBreath);
  ok(breath.every((v) => v >= 0 && v <= 1) && new Set(breath.map((v) => v.toFixed(3))).size > 2,
    'power feedback: OVERDRIVE has a bounded breathing cadence');
  ok(RAGE_STACCATO_HZ > 1.5 && RAGE_STACCATO_HZ <= 3,
    'power feedback: RAGE cadence stays deliberate and at or below three beats per second');
  const rageOmega = Math.PI * 2 * RAGE_STACCATO_HZ / 1000;
  const ragePeakAt = Math.PI / 2 / rageOmega;
  const rageTroughAt = Math.PI * 1.5 / rageOmega;
  ok(rageStaccato(ragePeakAt) > 0.99 && rageStaccato(rageTroughAt) < 0.001,
    'power feedback: RAGE has a distinct narrow staccato instead of a steady wash');
  ok(OVERDRIVE_ENTRY_MS >= 300 && OVERDRIVE_ENTRY_MS <= 500,
    'power feedback: threshold punctuation is brief, not a continuing screen flash');

  const auraSrc = stripComments(readFileSync(join(srcDir, 'render', 'power-aura.js'), 'utf8'));
  const playerSrc = stripComments(readFileSync(join(srcDir, 'render', 'player.js'), 'utf8'));
  const bulletSrc = stripComments(readFileSync(join(srcDir, 'render', 'bullets.js'), 'utf8'));
  const modsSrc = stripComments(readFileSync(join(srcDir, 'render', 'mods.js'), 'utf8'));

  ok((auraSrc.match(/new THREE\.Mesh\(/g) || []).length === 1 &&
     /RIG_OVERDRIVE_BRACKETS/.test(auraSrc) &&
     !/CanvasTexture|TextureLoader|document\.createElement/.test(auraSrc),
    'power feedback: OVERDRIVE owns one named procedural bracket mesh and no bitmap/canvas');
  const auraSync = auraSrc.slice(auraSrc.indexOf('export function syncPowerAura'),
    auraSrc.indexOf('export function powerAuraSnapshot'));
  ok(/safeNotch > previousNotch/.test(auraSync) &&
     !/new THREE\.|document\.|createElement/.test(auraSync),
    'power feedback: threshold pulses are rising-edge triggered and allocate no THREE objects');
  ok(/gameMs < lastGameMs/.test(auraSync),
    'power feedback: a run-clock rewind clears presentation pulse history');

  ok(/scoreCharge\(\)/.test(playerSrc) && /scoreNotchNow\(\)/.test(playerSrc) &&
     /syncPowerAura\(gameMs,\s*foldGain,\s*charge01,\s*notch,\s*gildedOn\)/.test(playerSrc) &&
     /powerPresentation/.test(playerSrc) && /activeLayers:\s*activePowerLayers/.test(playerSrc) &&
     /dominantPalette:\s*dominantPowerPalette/.test(playerSrc) &&
     /layerPrecedence:\s*\['GILDED_GOLD',\s*'RAGE_RED_MAGENTA',\s*'OVERDRIVE_WARM'\]/.test(playerSrc),
    'power feedback: RIG exposes continuous charge, notch, and inspectable aura state');
  ok(/PAL\.gildedGold/.test(playerSrc) && /PAL\.ragePower/.test(playerSrc) &&
     /PAL\.muzzle/.test(playerSrc),
    'power feedback: GILDED, RAGE, and OVERDRIVE retain three named color identities');
  ok(PAL_CLASSIC.ragePower === PAL_CONCEPT.ragePower &&
     PAL_CLASSIC.ragePower !== PAL_CLASSIC.gildedGold,
    'power feedback: RAGE is a stable identity token and cannot collapse into gilded gold');

  ok(/slotPowerState\s*=\s*new Uint8Array\(BULLET_MAX\)/.test(bulletSrc) &&
     /slotPowerGain\s*=\s*new Float32Array\(BULLET_MAX\)/.test(bulletSrc) &&
     /sampledAtSpawn:\s*true/.test(bulletSrc) &&
     /changesCollisionReach:\s*false/.test(bulletSrc),
    'power feedback: bullet accents use fixed pools, sampled once, with no reach claim');
  const bulletSync = bulletSrc.slice(bulletSrc.indexOf('function syncSlot'),
    bulletSrc.indexOf('function bendCulled'));
  ok(!/slotPowerGain\[i\].*scale|powerGain/.test(bulletSync),
    'power feedback: live projectile matrices never scale from presentation power');

  ok(!/else if\s*\(gameMs < mods\.rageUntil\)\s*tint/.test(modsSrc),
    'power feedback: RAGE no longer paints the entire screen for its timer');
  for (const simFile of ['sim/player.js', 'sim/weapons.js', 'sim/score.js']) {
    const simSrc = stripComments(readFileSync(join(srcDir, simFile), 'utf8'));
    ok(!/power-aura|power-feedback|ragePower|RIG_OVERDRIVE_BRACKETS/.test(simSrc),
      'power feedback: ' + simFile + ' has no presentation dependency');
  }
}
