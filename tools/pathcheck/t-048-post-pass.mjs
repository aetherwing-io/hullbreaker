// T-048 — the screen pass (bloom) and the surface families.
//
// docs/decisions.md entry 18 authorizes post-processing ON THE SHIPPED URL,
// which is the first time anything in this project draws through something
// other than one renderer.render() call. The look proposal named the hole that
// creates (§4.3): "Nothing in the machine gates catches a composer wired into
// the default path" — src/main.js's own self-test check
// (renderer.info.render.frame > 0) passes just as happily when a composer is
// doing the drawing, including when it is doing it wrongly. This domain is
// that missing gate, and its subjects are the things a PLAYER would lose:
// the picture, the sky, and the frame budget's escape hatch.

import { readFileSync } from 'node:fs';
import { CONFIG, POST_TUNE } from '../../src/config.js';
import { resolvePost, resolveSamples, SURFACE } from '../../src/pure/post.js';
import {
  acesFilmic, inverseAcesFilmic, linearToSrgb, srgbToLinear,
} from '../../src/pure/tonemap.js';
import { CLASSIC, CONCEPT } from '../../src/render/palette.js';
import { ok, near } from './_context.mjs';

export const title = 'T-048: the screen pass (bloom), atmosphere fidelity, surface families';

const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

export async function run() {
  const POST_SRC = read('src/render/post.js');
  const MAIN_SRC = read('src/main.js');
  const MATERIALS_SRC = read('src/render/materials.js');
  const HOSTILES_SRC = read('src/render/hostiles.js');
  const FX_SRC = read('src/render/fx.js');

  /* ---- the flag: default ON, one way off, junk never disables it -------- */
  {
    const shipped = POST_TUNE.bloom.strength;
    ok(resolvePost(null, POST_TUNE).on === true &&
       resolvePost(null, POST_TUNE).strength === shipped,
       'T-048: no ?bloom= at all is the shipped pass, ON — entry 16 retired ' +
       'off-by-default, and the operator kept seeing the grey-box build because ' +
       'improvements hid behind flags he never typed');
    ok(resolvePost('', POST_TUNE).on === true &&
       resolvePost('banana', POST_TUNE).on === true &&
       resolvePost('-3', POST_TUNE).on === true &&
       resolvePost('NaN', POST_TUNE).on === true &&
       resolvePost('banana', POST_TUNE).strength === shipped,
       'T-048: junk in ?bloom= resolves to the shipped default — a typo in a ' +
       'URL a nine-year-old is given must not silently disable the look');
    ok(resolvePost('0', POST_TUNE).on === false &&
       resolvePost('off', POST_TUNE).on === false &&
       resolvePost('0', POST_TUNE).strength === 0,
       'T-048: ?bloom=0 (and ?bloom=off) is the escape hatch entry 18 requires');
    ok(resolvePost('1.4', POST_TUNE).strength === 1.4 &&
       resolvePost('99', POST_TUNE).strength === POST_TUNE.bloom.strengthMax,
       'T-048: ?bloom=<n> overrides the strength for an A/B and is clamped at ' +
       'strengthMax (' + POST_TUNE.bloom.strengthMax + ')');
    ok(resolveSamples(null, POST_TUNE) === POST_TUNE.samples &&
       resolveSamples('junk', POST_TUNE) === POST_TUNE.samples &&
       resolveSamples('9', POST_TUNE) === POST_TUNE.samples &&
       resolveSamples('2.5', POST_TUNE) === POST_TUNE.samples &&
       resolveSamples('0', POST_TUNE) === 0 && resolveSamples('4', POST_TUNE) === 4,
       'T-048: ?aa= takes an integer 0..4 and everything else is the shipped ' +
       'sample count (' + POST_TUNE.samples + ')');
  }

  /* ---- the tuning itself stays inside the ranges it means --------------- */
  {
    const B = POST_TUNE.bloom;
    ok(B.threshold > 0.5 && B.threshold < 1,
       'T-048: the bloom threshold is a LINEAR-light luminance above the lit ' +
       'world and below an emissive quad (' + B.threshold + ') — at or under ' +
       '0.5 the deck itself starts to bleed, which is pillar 5 in reverse');
    ok(B.strength > 0 && B.strength <= 1 && B.radius >= 0 && B.radius <= 1,
       'T-048: bloom strength/radius stay in their authored ranges');
    ok(Number.isInteger(POST_TUNE.samples) &&
       POST_TUNE.samples >= 0 && POST_TUNE.samples <= 4,
       'T-048: the composer\'s MSAA sample count is a legal WebGL2 value');
    ok(POST_TUNE.emissiveGain >= 1 && POST_TUNE.emissiveGain <= 2.5,
       'T-048: the emissive gain lifts the light families over the threshold ' +
       'without whiting them out (' + POST_TUNE.emissiveGain + ')');
  }

  /* ---- THE SKY DOES NOT MOVE ------------------------------------------- *
   * The defect this guards is measured, not hypothetical: wired naively, the
   * composer dropped the traversal fixture's sky from luminance 42.9 to 25.24
   * and its whole-frame mean from 47.10 to 31.62, because three hands the
   * background and fog colors to a render target in linear light and to the
   * canvas in display space. Entry 14 already ruled the frame too dark.
   * src/render/post.js corrects it with inverseAcesFilmic, and this is the
   * assertion that the correction is EXACT — stated in the 8-bit units a
   * screenshot is measured in, over every background token the game can put
   * on screen in either palette.                                           */
  {
    const hexes = new Set([
      CLASSIC.bg, CONCEPT.bg, CLASSIC.limbBg, CONCEPT.limbBg,
      ...Object.keys(CONCEPT.atmos).map(Number),
      ...Object.values(CONCEPT.atmos),
      CONFIG.limb.bg,
    ]);
    const lin = [0, 0, 0], inv = [0, 0, 0], fwd = [0, 0, 0];
    let worst = 0, worstHex = 0;
    for (const hex of hexes) {
      const srgb = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
      for (let i = 0; i < 3; i++) lin[i] = srgbToLinear(srgb[i] / 255);
      inverseAcesFilmic(lin, 1, inv);
      acesFilmic(inv, 1, fwd);
      for (let i = 0; i < 3; i++) {
        const back = Math.round(linearToSrgb(fwd[i]) * 255);
        const err = Math.abs(back - srgb[i]);
        if (err > worst) { worst = err; worstHex = hex; }
      }
    }
    ok(worst <= 1,
       'T-048: every background/atmosphere token survives the tone-map round ' +
       'trip to within one 8-bit step (worst ' + worst + ' on 0x' +
       worstHex.toString(16) + ') — this is what keeps the composed sky the ' +
       'sky the palette authored, and entry 14\'s verdict answered');
    // …and the inverse is doing real work: the UNCORRECTED path is far off
    for (let i = 0; i < 3; i++) lin[i] = srgbToLinear(((CONCEPT.bg >> 8) & 255) / 255);
    acesFilmic(lin, 1, fwd);
    const naive = Math.round(linearToSrgb(fwd[1]) * 255);
    ok(Math.abs(naive - ((CONCEPT.bg >> 8) & 255)) > 5,
       'T-048: …and the correction is not a no-op — feeding the token straight ' +
       'through the tone map lands ' + naive + ' where the palette says ' +
       ((CONCEPT.bg >> 8) & 255));
  }

  /* ---- the tone curve behaves like a tone curve ------------------------- */
  {
    const out = [0, 0, 0];
    acesFilmic([0, 0, 0], 1, out);
    ok(out[0] === 0 && out[1] === 0 && out[2] === 0, 'T-048: black tone maps to black');
    acesFilmic([100, 100, 100], 1, out);
    near(out[0], 1, 1e-6, 'T-048: a huge value saturates at 1 instead of running away');
    let prev = -1, monotone = true;
    for (let v = 0; v <= 4; v += 0.05) {
      acesFilmic([v, v, v], 1, out);
      if (out[1] < prev - 1e-9) monotone = false;
      prev = out[1];
    }
    ok(monotone, 'T-048: the curve is monotone — which is what makes the ' +
       'bisection inverse land on an answer at all');
  }

  /* ---- surface families ------------------------------------------------ */
  {
    const names = Object.keys(SURFACE);
    ok(names.length >= 4, 'T-048: the surface table names at least four families');
    let legal = true;
    for (const n of names) {
      const s = SURFACE[n];
      if (!(s.roughness >= 0 && s.roughness <= 1)) legal = false;
      if (!(s.metalness >= 0 && s.metalness <= 1)) legal = false;
      if (!(s.envMapIntensity >= 0 && s.envMapIntensity <= 2)) legal = false;
    }
    ok(legal, 'T-048: every family\'s roughness/metalness is a legal PBR value');
    // Metalness with nothing to reflect renders BLACK, and entry 14 forbids a
    // darker frame: any family metallic enough to lose its diffuse response
    // must be picking up the generated environment.
    let paired = true;
    for (const n of names)
      if (SURFACE[n].metalness > 0.3 && SURFACE[n].envMapIntensity <= 0) paired = false;
    ok(paired, 'T-048: a metallic family always has an environment to reflect — ' +
       'metalness with none is a darker frame, not a metal one');
    // every family a mesh actually names exists in the table
    const used = [...HOSTILES_SRC.matchAll(/surface:\s*'([a-z]+)'/g)].map((m) => m[1]);
    ok(used.length >= 5, 'T-048: every hostile kind names a surface family (' +
       used.length + ' found)');
    ok(used.every((u) => SURFACE[u] !== undefined),
       'T-048: …and every family a mesh names exists in the table (' +
       used.filter((u) => !SURFACE[u]).join(', ') + ')');
  }

  /* ---- THE PICTURE CANNOT BE LOST ------------------------------------- *
   * The one thing worse than no bloom is no frame. The composer is built from
   * modules fetched over the network at boot; every failure mode has to end
   * with renderer.render(scene, camera) still running.                     */
  {
    ok(/import\('three\/addons\/postprocessing\/EffectComposer\.js'\)/.test(POST_SRC),
       'T-048: the addons are loaded DYNAMICALLY — a static import would put ' +
       'the whole module graph behind a CDN fetch, and a failed fetch would be ' +
       'a blank page instead of a game without bloom');
    const staticAddon = /^\s*import\s[^\n]*from\s+'three\/addons/m;
    ok(!staticAddon.test(POST_SRC) && !staticAddon.test(MAIN_SRC) &&
       !staticAddon.test(MATERIALS_SRC),
       'T-048: …and nothing anywhere imports three/addons at module scope');
    const fn = /export function renderFrame\(\) \{[\s\S]*?\n\}/.exec(POST_SRC);
    ok(!!fn, 'T-048: renderFrame is the game\'s one draw');
    if (fn) {
      const body = fn[0];
      ok(/catch \(err\)/.test(body) && /status = 'failed'/.test(body) &&
         /composer = null/.test(body),
         'T-048: a throw inside the composer retires it permanently instead of ' +
         'throwing every frame at the failsafe');
      ok(body.lastIndexOf('renderer.render(scene, camera);') > body.indexOf('if (composer)'),
         'T-048: …and the direct draw sits AFTER the composer branch, so the ' +
         'frame the composer failed on is still painted');
    }
    const mainCode = MAIN_SRC
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    ok(/renderFrame\(\);/.test(mainCode) &&
       !/renderer\.render\(/.test(mainCode),
       'T-048: src/main.js draws through renderFrame() and never calls ' +
       'renderer.render directly — one draw path, and it is the one with the ' +
       'fallback in it');
    ok(/post: postSnapshot/.test(MAIN_SRC) && /post: postSnapshot\(\)/.test(MAIN_SRC),
       'T-048: the pass publishes its live status on both read channels, so a ' +
       'capture or a perf reading can never be credited to a pass that was not ' +
       'running when it was taken');
    ok(/frames render on whichever path is live/.test(MAIN_SRC) &&
       /bloom parameters are live only while the pass draws/.test(MAIN_SRC),
       'T-048: ?selftest=1 checks in a REAL page what this file cannot — that ' +
       'frames are on screen whichever path is live, and that the emissive ' +
       'gain is 1 whenever the composer is not drawing');
  }

  /* ---- the emissive gain is tied to the pass, not to the flag ----------- */
  {
    ok(/status === 'active' && adaptiveBloomEnabled \? POST_TUNE\.emissiveGain : 1/.test(POST_SRC),
       'T-048: postGain() is the gain only while the composer is ACTUALLY ' +
       'drawing — with no bloom to catch it, an above-1 color is just a ' +
       'clipped white blob, so ?bloom=0 and a failed fetch both give back the ' +
       'pre-pass colors exactly');
    ok(/postGain\(\)/.test(FX_SRC) && /postGain\(\)/.test(HOSTILES_SRC),
       'T-048: the sparks/flashes pool and the hostile tells both read it');
    ok(/const gain = postGain\(\);/.test(FX_SRC),
       'T-048: …and fx.js reads it ONCE per frame, not once per particle row — ' +
       'the hot loop stays allocation- and call-free');
  }

  /* ---- new render files carry no raw color ----------------------------- *
   * post.js and materials.js are not in the palette section's `tokenized`
   * list (that list is a fixed set of filenames), so the same rule is applied
   * to them here: colors come from tokens, never from literals.            */
  {
    const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const literal = /0x[0-9a-fA-F]{6}\b|#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b|\brgba?\s*\(/;
    ok(!literal.test(strip(POST_SRC)),
       'T-048: src/render/post.js holds no raw color literal');
    ok(!literal.test(strip(MATERIALS_SRC)),
       'T-048: src/render/materials.js holds no raw color literal — the ' +
       'generated environment is built from palette tokens');
    ok(/PAL\.hemiSky/.test(MATERIALS_SRC) && /PAL\.bg/.test(MATERIALS_SRC) &&
       /PAL\.hemiGround/.test(MATERIALS_SRC),
       'T-048: …and it is built from the rig\'s OWN sky/air/ground tokens, so ' +
       'the environment cannot disagree with the light rig or the sky');
    ok(!/new Image|fetch\(|TextureLoader|'assets\//.test(MATERIALS_SRC),
       'T-048: the environment is generated, not fetched — nothing in the ' +
       'material path can fail on a missing file');
  }
}
