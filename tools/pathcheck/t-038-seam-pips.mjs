// Domain: T-038: warm-white seam pips and route-lip highlights (S5)
//
// Written directly against the post-T-037 per-domain convention (this task
// merged main after T-037's pathcheck split landed) — there is no monolith
// section to move verbatim here, this file IS the section.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG } from '../../src/config.js';
import { buildLevel } from '../../src/pure/generator.js';
import {
  deckEdgeRuns, deckSeamRuns, depthGain, platformSeamRuns, seamRuns as seamsAllRuns,
  seamPipCount, resolveSeams, SEAMS,
} from '../../src/pure/seams.js';
import { CLASSIC as PAL_CLASSIC, CONCEPT as PAL_CONCEPT } from '../../src/render/palette.js';
import { SHARE, legibilityGain, screenPx } from '../../src/render/legibility.js';
import { ok, srcDir, stripComments } from './_context.mjs';

export const title = 'T-038: warm-white seam pips and route-lip highlights (S5)';

export async function run(SHARED) {

{
  // Review finding, addressed: the packet's own risk note for S5 wants
  // distant pips "pre-attenuated by depth at bake time." depthGain() is
  // that mechanism — pure, bake-time, deterministic — for the halo's
  // per-instance color. The shallowest tier this bake uses maps to exactly
  // the floor, the proudest to exactly 1, and it is monotonic in between
  // (a piece less proud of its surface never reads brighter than one more
  // proud of it).
  ok(depthGain(SEAMS.platformDepth, SEAMS) === SEAMS.depthGainMin,
     'seams: depthGain floors out at the shallowest tier this bake uses');
  ok(depthGain(SEAMS.deckDepth, SEAMS) === 1,
     'seams: depthGain reaches exactly 1 at the proudest tier this bake uses');
  ok(depthGain(SEAMS.platformDepth, SEAMS) < depthGain(SEAMS.deckDepth, SEAMS),
     'seams: a shallower pip never reads brighter than a prouder one');
  ok(depthGain(SEAMS.deckDepth, SEAMS) === depthGain(SEAMS.deckDepth, SEAMS),
     'seams: depthGain is a pure function of depth (same input, same output)');
}

{
  // (a) derived, not authored: every deck-edge pip run's [s0,s1) is a real
  // contiguous groundH span, and every platform pip run's [s0,s1) is some
  // platform's own [x0,x1] — never authored, so a pip line can never
  // advertise a ledge that does not exist.
  const level = buildLevel(CONFIG);
  const gh = level.groundH, plats = level.platforms;
  const deckRuns = deckSeamRuns(gh, SEAMS);
  const rawRuns = deckEdgeRuns(gh).filter((r) => r.s1 - r.s0 >= SEAMS.minRun);
  ok(rawRuns.length === deckRuns.length &&
     rawRuns.every((r, i) => r.s0 === deckRuns[i].s0 && r.s1 === deckRuns[i].s1),
     'seams: deckSeamRuns\' boundaries equal deckEdgeRuns\' raw spans one-for-one ' +
     '(' + deckRuns.length + ' runs)');
  ok(deckRuns.every((r) =>
       gh[r.s0] > -100 && (r.s0 === 0 || !(gh[r.s0 - 1] > -100)) &&
       gh[r.s1 - 1] > -100 && (r.s1 >= gh.length || !(gh[r.s1] > -100))),
     'seams: every deck pip run starts and ends exactly where groundH does ' +
     '(' + deckRuns.length + ' runs)');
  const platRuns = platformSeamRuns(plats, SEAMS);
  ok(platRuns.every((r) => plats.some((p) => p.x0 === r.s0 && p.x1 === r.s1)),
     'seams: every platform pip run is some platform\'s own [x0,x1) verbatim ' +
     '(' + platRuns.length + ' runs)');
  ok(deckRuns.concat(platRuns).every((r) => r.pips.every((p) => p.s >= r.s0 && p.s < r.s1)),
     'seams: every pip sits inside its own run\'s [s0,s1) — a pip run can never ' +
     'advertise a ledge that does not exist (' +
     (seamPipCount(deckRuns) + seamPipCount(platRuns)) + ' pips checked)');
  ok(JSON.stringify(seamsAllRuns(gh, plats, SEAMS)) === JSON.stringify(deckRuns.concat(platRuns)),
     'seams: seamRuns() composes deckSeamRuns + platformSeamRuns exactly');

  // determinism: same level, same runs, no rng
  const again = deckSeamRuns(gh, SEAMS).concat(platformSeamRuns(plats, SEAMS));
  ok(JSON.stringify(deckRuns.concat(platRuns)) === JSON.stringify(again),
     'seams: the pip layout is deterministic — same level, same runs, no rng');

  // a clutter ceiling, so "hundreds of specks" stays a stated, checked
  // number rather than an unbounded side effect of the level's length.
  // Measured on the shipped 445-tile level at SEAMS.pipEvery=3: 307 pips —
  // the ceiling below leaves headroom for level-length drift, not slack
  // to double the density unnoticed.
  const total = seamPipCount(deckRuns) + seamPipCount(platRuns);
  ok(total > 0 && total < 400,
     'seams: the shipped level bakes ' + total + ' pips total — bounded, not unbounded');
}

{
  // (b) hue + luminance ordering, both tables, both tokens. Gate the HUE
  // FAMILY (a small channel spread), not just a value comparison, per the
  // packet's carried correction — a pip tuned to houndTell's exact hue at
  // a different luminance would pass a naive check and still read as a
  // warning telegraph.
  const ch = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  const lum = (h) => { const [r, g, b] = ch(h); return r + g + b; };
  const warmWhite = (h) => {
    const [r, g, b] = ch(h);
    return r >= g && g >= b && (r - b) <= 60;
  };
  const tells = (T) => [T.houndTell, T.polypTell, T.mortarTell];
  for (const [name, T] of [['classic', PAL_CLASSIC], ['concept', PAL_CONCEPT]]) {
    ok(warmWhite(T.seamPip) && warmWhite(T.seamHalo),
       'seams: ' + name + ' seamPip/seamHalo are warm-white by SHAPE (small ' +
       'channel spread), not amber WARN — a hue check, not just a value check');
    const cap = Math.min(lum(T.muzzle), ...tells(T).map(lum));
    ok(lum(T.seamPip) < cap && lum(T.seamHalo) < cap,
       'seams: ' + name + ' seamPip/seamHalo stay below PAL.muzzle and every ' +
       'hostile tell in luminance (cap ' + cap + ', pip ' + lum(T.seamPip) +
       ', halo ' + lum(T.seamHalo) + ')');
    ok(lum(T.seamHalo) <= lum(T.seamPip),
       'seams: ' + name + ' the halo is never brighter than the core it surrounds');
  }
  ok(Object.keys(PAL_CLASSIC).sort().join() === Object.keys(PAL_CONCEPT).sort().join(),
     'seams: seamPip/seamHalo keep classic/concept key-shape parity (existing guard, ' +
     're-confirmed after the new tokens)');
}

{
  // (c) static-anatomy guard, mirrored onto BOTH modules — the same
  // mechanical check src/render/limb.js already carries, so an animated
  // version cannot arrive later by accident.
  const pureSrc = stripComments(readFileSync(join(srcDir, 'pure', 'seams.js'), 'utf8'));
  ok(!/\bgameMs\b|\btMs\b|\bdt\b|Math\.random/.test(pureSrc),
     'seams: src/pure/seams.js takes no time or randomness argument — static intensity only');
  const renderSrc = stripComments(readFileSync(join(srcDir, 'render', 'seams.js'), 'utf8'));
  ok(!/installView|view\./.test(renderSrc),
     'seams: src/render/seams.js installs no view hook at all — no per-frame, pulse or ' +
     'chase can move a pip');
  ok(!/\bgameMs\b|\btMs\b|requestAnimationFrame/.test(renderSrc),
     'seams: src/render/seams.js reads no per-frame clock');

  // (e) tokenization: seams.js opts INTO the same raw-literal / scattered-
  // CONFIG.palette checks the render-purity guard already runs elsewhere,
  // without editing that shared list — membership is this explicit,
  // separate assertion in its own domain module, so two lanes never collide
  // on one shared line.
  ok(!/CONFIG\.palette|CONFIG\.limb\.bg/.test(renderSrc),
     'seams: src/render/seams.js has no scattered CONFIG.palette reads');
  const colorLiteral =
    /0x[0-9a-fA-F]{6}\b|#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b|\brgba?\s*\(/g;
  const literals = (renderSrc.match(colorLiteral) || [])
    .filter((m) => m.toLowerCase() !== '0xffffff');
  ok(literals.length === 0,
     'seams: src/render/seams.js carries no raw color literal' +
     (literals.length ? ' (found: ' + literals.join(', ') + ')' : ''));

  // Review finding: a whole-level static bake with an additive, fog:false
  // halo never recedes — the packet's own risk note for S5, and the exact
  // failure a reviewer caught this pass had not actually solved. Neither
  // material may set `fog: false`, so a pip at the fog-far edge of a
  // 445-tile level fades exactly like the surface it rides rather than
  // blazing through the haze alone.
  ok(!/fog\s*:\s*false/.test(renderSrc),
     'seams: neither seams.js material sets fog:false — every pip recedes ' +
     'with distance, unlike fx.js\'s short-lived player-proximate pools');
  ok((renderSrc.match(/fog\s*:\s*true/g) || []).length === 2,
     'seams: both the core and halo materials explicitly set fog:true');
}

{
  // ?seams= resolver: ON by default (decisions.md entry 16 retired the
  // blanket off-by-default rule, naming seam pips explicitly; entry 17
  // then approved this pass by name), the same absent/''/junk-resolves-on
  // shape resolveLegibility already carries. '0'/'off' are the escape
  // hatch back to the pre-pass look.
  ok(resolveSeams(null) === true && resolveSeams('') === true &&
     resolveSeams('junk') === true && resolveSeams('1') === true &&
     resolveSeams('0') === false && resolveSeams('off') === false,
     'seams: ?seams= resolves ON for everything but the escape hatch ' +
     '(\'0\'/\'off\') — decisions.md entries 16 and 17');
}

{
  // projected-pixel floor: a pip under ~1.5px twinkles as the camera
  // translates (the packet's own risk note) rather than reading as a
  // light. SHARE.pip = 1 (full compensation) means the gained size
  // projects to the SAME screen size at every view — the near-view size,
  // restored — so this is checked at every shipped view id rather than
  // just the default, so a future SHARE.pip retune cannot silently drop
  // below the floor at one of them without pathcheck catching it.
  ok(SEAMS.haloSize > SEAMS.pipSize,
     'seams: the halo is authored bigger than the core it surrounds (' +
     SEAMS.haloSize + ' vs ' + SEAMS.pipSize + ')');
  const MIN_PX = 1.5;
  for (const id of Object.keys(CONFIG.viewScales)) {
    const gain = legibilityGain(SHARE.pip, id, true);
    const px = screenPx(SEAMS.pipSize * gain, id);
    ok(px >= MIN_PX,
       'seams: the pip core projects to ' + px.toFixed(2) + 'px at ?view=' + id +
       ' — at or above the ' + MIN_PX + 'px twinkle floor');
  }
}

}
