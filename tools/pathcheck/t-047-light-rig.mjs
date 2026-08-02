// Domain: T-047 — the light rig, shadow band, tone mapping (decisions.md 18)
//
// Everything here is asserted against what the RENDERER will do with the
// numbers that ship, not against the shape of the source. The rig's data and
// arithmetic live in src/render/lightrig.js, which is deliberately three.js-
// free (like palette.js and legibility.js) so these claims are checkable in
// Node; src/render/lights.js is the wiring, and the few claims about it that
// only a static read can make are marked as such.
//
// The claims that would cost a cycle if they silently stopped being true:
//   1. the deck stays the brightest large surface, on EVERY face heading —
//      the ranking every CONCEPT token was authored against;
//   2. ?light=flat is the pre-T-047 rig verbatim, so the A/B escape hatch is
//      the old frame and not a near-miss of it;
//   3. the shadow band covers the visible strip and no more, at a texel
//      density a 15x30 px RIG survives;
//   4. bullets, sparks, flashes and beams cast nothing, and a hostile fading
//      in at opacity 0 throws no shadow before it exists;
//   5. nothing in the rig reads a clock — the anatomy stays static
//      (decisions.md entry 3).

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG, LIGHT_RIG } from '../../src/config.js';
import {
  ACTIVE_RIG, LIGHT_RIGS, LIGHT_RIG_ID, SURFACE_KINDS, lightVector,
  playBandHalfHeightTiles, playBandHalfWidthTiles, resolveLightRigId, rigIrradiance,
  shadowPolicy, shadowTexelTiles, snapToTexel, tokenLuminance,
} from '../../src/render/lightrig.js';
import { CLASSIC, CONCEPT } from '../../src/render/palette.js';
import { near, ok, srcDir, stripComments } from './_context.mjs';

export const title = 'T-047 light rig, shadows, tone mapping (decisions 18)';

export async function run(SHARED) {

/* ==== T-047: flag resolution and what ships by default ================ */
{
  // decisions.md entry 16: an approved change ships ON by default and the
  // flag is for A/B, not for hiding the work. Absence, '' and junk are the
  // shipped rig; only an exact declared id selects an alternate.
  for (const bad of [null, undefined, '', 'junk', '1', 'RIG', 0, {}, ['rig'], 'toString', '__proto__'])
    ok(resolveLightRigId(bad) === 'rig',
       'T-047: ?light=' + JSON.stringify(bad) + ' resolves to the shipped rig');
  for (const id of Object.keys(LIGHT_RIGS))
    ok(resolveLightRigId(id) === id, 'T-047: ?light=' + id + ' selects the ' + id + ' rig');
  ok(LIGHT_RIG_ID === 'rig' && ACTIVE_RIG === LIGHT_RIGS.rig,
     'T-047: with no query (the harness case) the ACTIVE rig is the shipped one');
  ok(LIGHT_RIGS.rig.shadows === true,
     'T-047: shadows are ON in the shipped rig — entry 18 authorized them and ' +
     'entry 16 forbids landing approved work behind a flag nobody types');
  ok(LIGHT_RIGS.rig.exposure > 1,
     'T-047: exposure goes UP, never down (entry 14: the operator judged the ' +
     'full value ladder too dark, so contrast comes from direction, not dimming)');
  ok(LIGHT_RIGS.rig.lights.length === 3 &&
     LIGHT_RIGS.rig.lights.filter((l) => l.casts).length === 1,
     'T-047: key + fill + rim, and exactly ONE of them casts a shadow map');
}

/* ==== T-047: ?light=flat is the pre-T-047 rig, verbatim =============== */
{
  const flat = LIGHT_RIGS.flat;
  ok(flat.shadows === false && flat.exposure === 1,
     'T-047: the flat escape hatch casts nothing and sits at exposure 1');
  ok(flat.lights.length === 2, 'T-047: the flat rig is two lights, as scene.js shipped it');
  const hemi = flat.lights.find((l) => l.type === 'hemisphere');
  const sun = flat.lights.find((l) => l.type === 'directional');
  ok(hemi && hemi.intensity === 1.1 && hemi.sky === 'hemiSky' && hemi.ground === 'hemiGround' &&
     hemi.worldPosition.join(',') === '0,1,0',
     'T-047: flat hemisphere = HemisphereLight(hemiSky, hemiGround, 1.1) at the default (0,1,0)');
  ok(sun && sun.intensity === 1.6 && sun.color === 'sun' &&
     sun.worldPosition.join(',') === '6,12,8',
     'T-047: flat key = DirectionalLight(sun, 1.6) at (6,12,8) — scene.js line 26-27 verbatim');
  ok(flat.lights.every((l) => l.frame === 'world') && !flat.lights.some((l) => l.casts),
     'T-047: the flat rig is world-framed and casts nothing, so it cannot drift ' +
     'into the new rig\'s per-frame aiming');
}

/* ==== T-047: the value ladder — the deck stays the brightest ========== *
 * The palette's own calibration note (src/render/palette.js:28-32,
 * src/render/limb.js:34-42) is that a lit face lands at ~0.45x its albedo and
 * that THE DECK STAYS THE BRIGHTEST LARGE SURFACE. Every CONCEPT token was
 * authored through that ranking, and this lane may not touch palette.js — so
 * the rig has to preserve the ranking instead. A key raked lower than the
 * horizontal would invert it; that is the failure this gates.              */
{
  const YAWS = [];
  for (let i = 0; i < 24; i++) YAWS.push((i / 24) * Math.PI * 2);   // every face and every bend
  let worstTopMargin = Infinity, brightestVertical = 0, darkestVertical = Infinity;
  for (const yaw of YAWS) {
    const top = rigIrradiance('rig', 'top', yaw);
    for (const kind of ['camera', 'travel', 'antiTravel']) {
      const v = rigIrradiance('rig', kind, yaw);
      worstTopMargin = Math.min(worstTopMargin, top - v);
      brightestVertical = Math.max(brightestVertical, v);
      darkestVertical = Math.min(darkestVertical, v);
    }
    ok(top > rigIrradiance('rig', 'under', yaw),
       'T-047: the underside never out-shines the deck (yaw ' + yaw.toFixed(2) + ')');
  }
  ok(worstTopMargin > 0,
     'T-047: on EVERY face heading the horizontal (deck, catwalk tops, plate ' +
     'tops) is the brightest surface family — the ranking palette.js authored ' +
     'against (worst margin ' + worstTopMargin.toFixed(3) + ')');
  ok(worstTopMargin > 0.15,
     'T-047: …and by a real margin, not a rounding error: a key raked below ' +
     '~40 degrees closes it (' + worstTopMargin.toFixed(3) + ')');
  ok(darkestVertical > 0.02,
     'T-047: the key\'s dark side keeps a cool kicker — no vertical family falls ' +
     'to zero irradiance, which is what would bury a hostile against it ' +
     '(' + darkestVertical.toFixed(3) + ')');
  ok(brightestVertical / darkestVertical > 1.6,
     'T-047: the two vertical families still separate — a rig that lit them ' +
     'equally would be the flat hemisphere fill this lane exists to replace ' +
     '(ratio ' + (brightestVertical / darkestVertical).toFixed(2) + ')');
}

/* ==== T-047: view-framed vs world-framed, measured ==================== *
 * The reason the rig is aimed in the camera's basis at all. On a hexagonal
 * tower a world-fixed key lights two faces and backlights two others; the
 * shipped rig must be yaw-INVARIANT and the old one must not be, or the
 * argument in config.js is decoration.                                    */
{
  const yaws = [0, Math.PI / 3, 2 * Math.PI / 3, Math.PI, 4 * Math.PI / 3, 5 * Math.PI / 3];
  for (const kind of SURFACE_KINDS) {
    const vals = yaws.map((y) => rigIrradiance('rig', kind, y));
    const spread = Math.max(...vals) - Math.min(...vals);
    ok(spread < 1e-9,
       'T-047: the shipped rig lights a ' + kind + ' surface identically on all six ' +
       'faces (spread ' + spread.toExponential(1) + ')');
  }
  const flatCam = yaws.map((y) => rigIrradiance('flat', 'camera', y));
  const flatSpread = Math.max(...flatCam) - Math.min(...flatCam);
  ok(flatSpread > 0.2,
     'T-047: …and the pre-T-047 world-fixed rig did NOT — the same wall reads ' +
     flatSpread.toFixed(3) + ' apart between faces, which is the defect the ' +
     'view frame fixes (and why ?light=flat is a comparison, not a fallback)');
  const flatTop = yaws.map((y) => rigIrradiance('flat', 'top', y));
  ok(Math.max(...flatTop) - Math.min(...flatTop) < 1e-9,
     'T-047: the flat rig\'s horizontal surfaces were yaw-stable (only the ' +
     'verticals swung) — stated so the comparison above is not overclaimed');
}

/* ==== T-047: entry 14 — the frame gets brighter, not darker =========== *
 * Tone mapping is monotonic, so comparing irradiance x exposure compares
 * where two rigs land on the same curve. The deck and the wall behind the
 * play plane are the two biggest surfaces in the frame; neither may come out
 * dimmer than it shipped.                                                 */
{
  const lit = (rig, kind) => rigIrradiance(rig, kind, 0) * LIGHT_RIGS[rig].exposure;
  ok(lit('rig', 'top') > lit('flat', 'top'),
     'T-047: the deck is BRIGHTER than it shipped (' + lit('rig', 'top').toFixed(3) +
     ' vs ' + lit('flat', 'top').toFixed(3) + ') — entry 14 forbids re-darkening');
  ok(lit('rig', 'camera') > lit('flat', 'camera') * 0.98,
     'T-047: the wall behind the play plane is not dimmer than it shipped ' +
     '(' + lit('rig', 'camera').toFixed(3) + ' vs ' + lit('flat', 'camera').toFixed(3) + ')');
  ok(LIGHT_RIGS.bright.exposure > LIGHT_RIGS.rig.exposure &&
     LIGHT_RIGS.bright.shadows === true,
     'T-047: ?light=bright is one dose UP the same ladder (entry 14 was itself a ' +
     'dose verdict, so the dose question goes to the operator with an A/B)');
  ok(LIGHT_RIGS.bright.lights.filter((l) => l.role === 'key')[0].intensity >
     LIGHT_RIGS.rig.lights.filter((l) => l.role === 'key')[0].intensity,
     'T-047: …and the brighter dose moves the KEY, not the fill — a brighter ' +
     'fill would flatten the form this lane just bought');
}

/* ==== T-047: the shadow band is fitted to the play band =============== *
 * Entry 18's condition, in numbers: a frustum spanning a continent-sized
 * creature is useless and slow, and one narrower than the frame ends in a
 * visible line across the deck.                                           */
{
  const S = LIGHT_RIG.shadow;
  const aspect = 1280 / 800;                       // the harness viewport, and 16:10
  const halfW = playBandHalfWidthTiles(aspect, 'far');
  const halfH = playBandHalfHeightTiles('far');
  ok(S.halfWidth >= halfW,
     'T-047: the shadow band covers the whole visible strip at the FAR default ' +
     '(' + S.halfWidth + ' >= ' + halfW.toFixed(1) + ' tiles), so no shadow edge ' +
     'lands inside the frame');
  ok(S.halfHeight >= halfH,
     'T-047: …and its full height (' + S.halfHeight + ' >= ' + halfH.toFixed(1) + ')');
  ok(S.halfWidth <= halfW * 1.5 && S.halfHeight <= halfH * 1.5,
     'T-047: and it stops there — the band is fitted to the play band, not to ' +
     'the creature (entry 18: "scope them tightly")');
  ok(2 * S.halfWidth < CONFIG.levelLength * 0.25,
     'T-047: the band is a fraction of the run, never a whole-level shadow camera');
  const texel = shadowTexelTiles(S);
  ok(texel <= 0.05,
     'T-047: shadow texel is ' + texel.toFixed(4) + ' tiles — under 1/38th of RIG\'s ' +
     '1.9-tile height, so a 15x30 px marine still gets a shadow with a shape');
  ok(S.mapSize <= 2048,
     'T-047: one 2048-max map. Bigger buys texels nobody can see at FAR and ' +
     'costs bandwidth the 60fps bar has to pay for');
  ok(S.near < S.distance && S.far > S.distance + 2 * S.halfHeight,
     'T-047: the shadow frustum actually contains the play band in depth ' +
     '(near ' + S.near + ' < distance ' + S.distance + ', far ' + S.far + ')');
  ok(S.snapToTexel === true && snapToTexel(1.2345, 0.05) === 1.25 &&
     snapToTexel(1.2345, 0) === 1.2345,
     'T-047: the band snaps to whole texels as it follows the run (off, every ' +
     'shadow edge crawls), and a zero quantum is a no-op rather than a NaN');
  ok(S.normalBias > 0 && S.bias < 0,
     'T-047: acne/peter-panning trim is set for flat-shaded instanced boxes');
}

/* ==== T-047: what casts, what receives, what does neither ============= *
 * The enrollment policy, asserted on the material shapes the game actually
 * builds. These are player-visible claims: a shadow under a bullet, or a
 * hostile's shadow arriving before the hostile, is a readability defect
 * (pillar 5), not a cosmetic one.                                         */
{
  const LIT_SOLID = { lit: true, opaque: true };            // deck tiles, limb, slats, RIG
  const LIT_FADING = { lit: true, opaque: false };          // a hostile at opacity 0
  const UNLIT = { lit: false, opaque: true };               // bullets (MeshBasicMaterial)
  const UNLIT_ADDITIVE = { lit: false, opaque: false };     // sparks, flashes, beams, contact quads

  const p = (m, o) => shadowPolicy(m, o);
  ok(p([LIT_SOLID]).cast && p([LIT_SOLID]).receive,
     'T-047: opaque lit matter (deck, limb, catwalks, RIG) both casts and receives');
  ok(!p([UNLIT]).cast && !p([UNLIT]).receive,
     'T-047: an UNLIT mesh casts nothing — every bullet in the pool is ' +
     'MeshBasicMaterial, and 256 bullet shadows would be noise the sim never ' +
     'promised (pillar 5) as well as depth-pass work');
  ok(!p([UNLIT_ADDITIVE]).cast && !p([UNLIT_ADDITIVE]).receive,
     'T-047: additive/multiplied effect quads — sparks, flashes, the polyp beam, ' +
     'the crush warning, and a later lane\'s contact shadows — cast nothing');
  ok(!p([LIT_FADING]).cast && p([LIT_FADING]).receive,
     'T-047: a lit but TRANSPARENT body receives and does not cast: three.js\' ' +
     'depth material ignores opacity, so a hostile materializing at opacity 0 ' +
     'would otherwise throw a full shadow before it is on screen');
  ok(!p([LIT_SOLID, UNLIT]).cast,
     'T-047: a multi-material mesh (the capsule\'s six faces) is judged by its ' +
     'weakest material, never by its first');
  ok(!p([null]).cast && !p([]).cast,
     'T-047: a mesh with no material is inert rather than a crash in the traversal');
  for (const [o, expect] of [['none', [false, false]], ['cast', [true, false]],
                             ['receive', [false, true]], ['both', [true, true]]]) {
    const r = p([UNLIT], o);
    ok(r.cast === expect[0] && r.receive === expect[1] && r.why === 'override',
       'T-047: userData.shadow=\'' + o + '\' overrides the material policy, so a ' +
       'lane can opt in or out without this module knowing its module name');
  }
}

/* ==== T-047: the rig follows the CAMERA, never the clock ============== *
 * decisions.md entry 3 (static anatomy) and the lighting skill's guardrail 6:
 * no grep catches a swinging sun, so this is the grep. A light that moved on
 * gameMs would animate a body the operator ruled monumental and static.    */
{
  const rigSrc = stripComments(readFileSync(join(srcDir, 'render', 'lightrig.js'), 'utf8'));
  const lightsSrc = stripComments(readFileSync(join(srcDir, 'render', 'lights.js'), 'utf8'));
  for (const [name, src] of [['lightrig.js', rigSrc], ['lights.js', lightsSrc]]) {
    ok(!/\bgameMs\b|\bDate\b|\bperformance\b|\bsetInterval\b|\bsetTimeout\b/.test(src),
       'T-047: src/render/' + name + ' reads no clock — the anatomy stays static ' +
       '(entry 3); the rig only moves when the view moves');
    ok(!/Math\.random/.test(src),
       'T-047: src/render/' + name + ' has no unseeded randomness');
    const literals = src.match(/0x[0-9a-fA-F]{6}\b|#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b|\brgba?\s*\(/g) || [];
    ok(literals.length === 0,
       'T-047: src/render/' + name + ' carries no raw color literal — light ' +
       'colors are palette tokens like every other color (found: ' + literals.join(', ') + ')');
  }
  // lightrig.js has to stay Node-safe or none of the assertions above can run
  ok(!/\bTHREE\b|\bdocument\b|\bwindow\b/.test(rigSrc),
     'T-047: src/render/lightrig.js stays free of three.js and the DOM, the way ' +
     'palette.js and legibility.js do, so this gate can drive it directly');
  // every light color the descriptors name must exist in BOTH palette tables
  for (const rig of Object.values(LIGHT_RIGS))
    for (const l of rig.lights)
      for (const key of [l.color, l.sky, l.ground].filter(Boolean))
        ok(CONCEPT[key] !== undefined && CLASSIC[key] !== undefined,
           'T-047: light token ' + key + ' exists in both palette tables, so ' +
           '?palette=classic cannot boot a rig with an undefined color');
}

/* ==== T-047: exactly one module builds lights ========================= *
 * The lighting skill's guardrail 1 ("there is exactly one light rig, in one
 * file") was true by habit and enforced by nothing. Now that the rig is three
 * lights and a shadow camera, a per-feature light added inside hostiles.js or
 * fx.js would be invisible to review and would blow the budget quietly.    */
{
  const offenders = [];
  for (const dir of ['render', 'ui']) {
    for (const f of readdirSync(join(srcDir, dir)).filter((n) => n.endsWith('.js'))) {
      const src = stripComments(readFileSync(join(srcDir, dir, f), 'utf8'));
      if (/new THREE\.\w*Light\b/.test(src) && f !== 'lights.js') offenders.push(dir + '/' + f);
    }
  }
  const mainSrc = stripComments(readFileSync(join(srcDir, 'main.js'), 'utf8'));
  if (/new THREE\.\w*Light\b/.test(mainSrc)) offenders.push('main.js');
  ok(offenders.length === 0,
     'T-047: src/render/lights.js is the ONLY module that constructs a light' +
     (offenders.length ? ' (found: ' + offenders.join(', ') + ')' : ''));
  const sceneSrc = stripComments(readFileSync(join(srcDir, 'render', 'scene.js'), 'utf8'));
  ok(/installLightRig\(renderer, scene\)/.test(sceneSrc),
     'T-047: scene.js installs the rig itself — enrollment wraps scene.add, so it ' +
     'has to be in place before any other module can add a mesh');
  const camSrc = stripComments(readFileSync(join(srcDir, 'render', 'camera.js'), 'utf8'));
  ok(/updateLightRig\(_look\.x, _look\.y, _look\.z, camYaw\)/.test(camSrc),
     'T-047: the rig is aimed from the UNSHAKEN look point (camera.js), so screen ' +
     'shake cannot jitter a shadow edge and the sim never sees the rig');
  ok(camSrc.indexOf('updateLightRig(') < camSrc.indexOf('applyShake()'),
     'T-047: …and it is aimed BEFORE the shake is applied, not after');
}

/* ==== T-047: the light vectors are the angles config says they are ==== */
{
  const v = { x: 0, y: 0, z: 0 };
  const key = LIGHT_RIGS.rig.lights.find((l) => l.role === 'key');
  lightVector(key, 0, v);
  near(Math.hypot(v.x, v.y, v.z), 1, 1e-12, 'T-047: the key vector is a unit vector');
  near(v.y, Math.sin(key.elevationDeg * Math.PI / 180), 1e-12,
       'T-047: the key sits at its configured elevation above the horizon');
  ok(v.x > 0 && v.z > 0,
     'T-047: at yaw 0 the key comes from ahead-of-the-run and in FRONT of the ' +
     'play plane (board 01 lights the faces the camera sees, not the ones it does not)');
  const rim = LIGHT_RIGS.rig.lights.find((l) => l.role === 'rim');
  const rv = lightVector(rim, 0, { x: 0, y: 0, z: 0 });
  ok(rv.x * v.x + rv.z * v.z < 0,
     'T-047: the rim opposes the key in the horizontal plane — it exists to lift ' +
     'the faces the key leaves black, not to double the key');
  ok(rim.elevationDeg < key.elevationDeg,
     'T-047: the rim is the low one, the key is the high one');
  // token luminance is the weight these vectors are scaled by
  ok(tokenLuminance(0xffffff) > 0.99 && tokenLuminance(0x000000) === 0,
     'T-047: token luminance is linear-space relative luminance (white 1, black 0)');
  ok(tokenLuminance(CONCEPT.sun) > tokenLuminance(CONCEPT.hemiGround),
     'T-047: the key token outweighs the ground bounce in both palettes');
}

}
