// Domain: gilded chassis — the Konami-code cosmetic reward ================
//
// The detector (src/pure/konami.js) is a pure state machine, so its whole
// contract is provable headlessly: the canonical sequence, exact-press
// matching, fumble recovery (a third UP must not lose two banked UPs), and
// toggle-on-refire. The wiring is asserted by source inspection: main.js
// must feed every keydown through the detector WITHOUT consuming it (the
// title fall-through contract from T-013 still stands), and the effect must
// live entirely in the render/UI layers — src/sim never learns the chassis
// is gold, so a cosmetic placebo can never change a deterministic run.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  advanceKonami, KONAMI_SEQUENCE,
} from '../../src/pure/konami.js';
import { GAMEPLAY_KEYMAP } from '../../src/pure/frame-input.js';
import { ok, srcDir, stripComments } from './_context.mjs';

export const title = 'gilded chassis: Konami detector + wiring ============';

export async function run(SHARED) {
  // --- the sequence is the canonical code -------------------------------
  ok(KONAMI_SEQUENCE.join(',') ===
     'ArrowUp,ArrowUp,ArrowDown,ArrowDown,ArrowLeft,ArrowRight,ArrowLeft,ArrowRight,KeyB,KeyA',
     'gilded: the sequence is UP UP DOWN DOWN LEFT RIGHT LEFT RIGHT B A');
  ok(KONAMI_SEQUENCE.length === 10, 'gilded: the code is ten presses');
  ok(!('KeyB' in GAMEPLAY_KEYMAP),
     'gilded: KeyB (press nine) is not a gameplay key, so it is unambiguous');

  // --- a clean entry fires exactly on the tenth press --------------------
  {
    let progress = 0;
    let firedAt = -1;
    let earlyFire = false;
    for (let i = 0; i < KONAMI_SEQUENCE.length; i++) {
      const r = advanceKonami(progress, KONAMI_SEQUENCE[i]);
      progress = r.progress;
      if (r.fired && i < KONAMI_SEQUENCE.length - 1) earlyFire = true;
      if (r.fired && firedAt < 0) firedAt = i;
    }
    ok(firedAt === KONAMI_SEQUENCE.length - 1 && !earlyFire,
       'gilded: a clean entry fires on the tenth press and never before');
    ok(progress === 0, 'gilded: firing resets progress so the code can re-toggle');
  }

  // --- fumble recovery ---------------------------------------------------
  {
    // A wrong key that shares nothing with the prefix restarts from zero.
    let r = advanceKonami(3, 'KeyJ');
    ok(r.progress === 0 && !r.fired, 'gilded: an unrelated key drops a partial entry');
    // The classic fumble: UP UP UP … must keep the two banked UPs.
    r = advanceKonami(2, 'ArrowUp');
    ok(r.progress === 2 && !r.fired,
       'gilded: a third UP keeps two UPs banked (KMP fallback)');
    // …and the full sloppy entry UP UP UP DOWN DOWN LEFT RIGHT LEFT RIGHT B A
    // still completes.
    let progress = 0;
    const sloppy = ['ArrowUp', ...KONAMI_SEQUENCE];
    let fired = false;
    for (const code of sloppy) {
      const step = advanceKonami(progress, code);
      progress = step.progress;
      if (step.fired) fired = true;
    }
    ok(fired, 'gilded: a leading extra UP does not break the entry');
    // A mid-sequence restart: UP UP DOWN LEFT UP UP … — the LEFT breaks it,
    // and the following UP UP banks two, not three-worth.
    progress = 0;
    for (const code of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowLeft'])
      progress = advanceKonami(progress, code).progress;
    ok(progress === 0, 'gilded: LEFT out of order resets the entry');
    progress = advanceKonami(progress, 'ArrowUp').progress;
    progress = advanceKonami(progress, 'ArrowUp').progress;
    ok(progress === 2, 'gilded: the detector re-banks from the reset point');
  }

  // --- garbage input cannot fire or wedge the state machine --------------
  {
    const before = advanceKonami(4, undefined);
    ok(before.progress === 4 && !before.fired,
       'gilded: a non-string code leaves progress untouched');
    const bad = advanceKonami(-3, 'ArrowUp');
    ok(bad.progress === 1 && !bad.fired,
       'gilded: an out-of-range progress is sanitised before matching');
    let progress = 0;
    let fired = false;
    for (let i = 0; i < 50; i++) {
      const step = advanceKonami(progress, 'ArrowRight');
      progress = step.progress;
      fired = fired || step.fired;
    }
    ok(!fired && progress >= 0 && progress < KONAMI_SEQUENCE.length,
       'gilded: key mashing never fires and never escapes the progress range');
  }

  // --- wiring: main.js observes without consuming -------------------------
  {
    const mainSrc = stripComments(readFileSync(join(srcDir, 'main.js'), 'utf8'));
    ok(/advanceKonami\(konamiProgress,\s*e\.code\)/.test(mainSrc),
       'gilded: the keydown listener feeds every press through the detector');
    ok(/if \(advance\.fired\)/.test(mainSrc) && /setGildedRig\(gildedChassis\)/.test(mainSrc),
       'gilded: completing the code toggles the render-layer chassis');
    const keydownIdx = mainSrc.indexOf("addEventListener('keydown'");
    const detectorIdx = mainSrc.indexOf('advanceKonami(konamiProgress');
    const shellIdx = mainSrc.indexOf('shellKeyIntent(e.code');
    ok(keydownIdx >= 0 && detectorIdx > keydownIdx && shellIdx > detectorIdx,
       'gilded: detection runs ahead of shell intent handling (presses are never consumed)');
  }

  // --- the effect is presentation-only ------------------------------------
  {
    const auraSrc = stripComments(readFileSync(join(srcDir, 'render', 'gilded-aura.js'), 'utf8'));
    const playerSrc = stripComments(readFileSync(join(srcDir, 'render', 'player.js'), 'utf8'));
    ok(/export function setGildedRig/.test(auraSrc),
       'gilded: the aura module exports the chassis latch');
    ok(/AdditiveBlending/.test(auraSrc) && /PAL\.gildedGold/.test(auraSrc) &&
       !/0x[0-9a-fA-F]{6}\b|#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b|\brgba?\s*\(/ .test(auraSrc),
       'gilded: the aura is additive glow tinted from the palette token, no raw literals');
    ok(/mountGildedAura\(rig,\s*RIG_SPRITE_H\)/.test(playerSrc) &&
       /syncGildedAura\(gameMs,\s*foldGain\)/.test(playerSrc) &&
       (playerSrc.match(/new THREE\.Mesh\(/g) || []).length === 5,
       'gilded: player.js mounts and drives the aura without growing past its ' +
       'five frozen construction sites (the aura owns its own meshes)');
    ok((auraSrc.match(/new THREE\.Mesh\(/g) || []).length === 2 &&
       /\[0,\s*1,\s*2\]\.map/.test(auraSrc),
       'gilded: the aura is two construction sites making four meshes ' +
       '(one halo, plus a three-entry ring map)');
    ok(/PAL\.gildedGold/.test(playerSrc),
       'gilded: the body/gun shimmer tints from PAL.gildedGold, not a literal');
    for (const simFile of ['sim/player.js', 'sim/weapons.js',
                           'sim/state.js', 'sim/score.js']) {
      const src = stripComments(readFileSync(join(srcDir, simFile), 'utf8'));
      ok(!/gilded|konami/i.test(src),
         'gilded: ' + simFile + ' never learns the chassis is gold (placebo stays placebo)');
    }
  }
}
