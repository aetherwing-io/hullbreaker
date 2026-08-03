/* ============================== POST ============================== */
/* The screen pass: an EffectComposer with threshold bloom, so the things
   that ARE light in this game (muzzle flash, a hit pop, a tell lamp, the
   polyp's live beam, impact sparks) bleed onto what is around them instead
   of sitting on the frame as bright paint.

   AUTHORITY: docs/decisions.md entry 18 authorizes post-processing on the
   shipped URL, bloom first, under four conditions this module is written
   against — 60fps with 200+ live projectiles is the binding one, readability
   outranks beauty (pillar 5), entry 14's "too dark" verdict must not be
   answered by hazing the frame, and it ships ON with an escape hatch.
   Before entry 18 existed the ceiling for this material was a flag defaulted
   off; it is not any more, and the postprocessing skill's guardrail line to
   that effect is superseded by the entry, not by this file.

   HOW IT COMPOSES WITH TONE MAPPING (src/render/scene.js, T-047's lane):
   three.js applies `renderer.toneMapping` and the output color space only on
   the draw that reaches the canvas — a scene rendered INTO a render target
   comes out linear and untouched. So the chain is

       RenderPass  →  UnrealBloomPass  →  OutputPass
       (linear HDR)   (bleeds >threshold)  (tone map + sRGB, on the canvas)

   and OutputPass reads whatever `renderer.toneMapping` / `outputColorSpace`
   the light-rig lane has set at that moment. This module never sets either.
   That is deliberate: the palette was authored against ACES (see the
   calibration note in src/render/palette.js) and a second tone-map here
   would double it. A pixel no bloom touched is the same pixel it was.

   WHY THE ADDONS LOAD DYNAMICALLY, BUT SETTLE DURING BOOT: `three/addons/*`
   is four more modules fetched from the CDN. A static import would make one
   404 reject the whole module graph — a blank page, the P1 defect class this
   project treats as worse than any missing effect. An un-awaited dynamic
   import had the opposite defect: the first direct-rendered frames were on
   screen before bloom suddenly activated, which looked exactly like the art
   was taking time to arrive. The bounded boot settlement below chooses one
   final path before main.js can enter PLAYING: a prewarmed composer, or the
   permanent direct renderer. Fetch, construction, warm-up and render faults
   all retain the complete direct-draw fallback.

   FLAG (?bloom=): the escape hatch entry 18 asks for, and an A/B knob.
     absent / junk   the shipped default (ON, CONFIG values)
     ?bloom=0        OFF — the direct renderer.render path, and every emissive
                     family back at its token color (postGain() below)
     ?bloom=<n>      strength override, clamped, for side-by-sides

   What ?bloom=0 is NOT is a time machine: the same task also gave the hostile
   roster real roughness/metalness (src/render/materials.js), and that ships
   whether or not the pass is drawing. Measured against a build of the base
   commit at the same sim instant, ?bloom=0 differs from the pre-task tree by
   mean 0.008 levels, max 15, over 0.067% of pixels on the six-face combat
   frame — the enemies' new specular response, and nothing else.            */

import * as THREE from 'three';
import { POST_TUNE } from '../config.js';
import { QUERY } from '../mode.js';
import { resolvePost, resolveSamples } from '../pure/post.js';
import { inverseAcesFilmic } from '../pure/tonemap.js';
import { camera, renderer, scene } from './scene.js';

// Both resolvers live in src/pure/post.js so the gate can CALL them — a regex
// can prove a flag exists, only a call proves junk resolves to the default.
export const POST = resolvePost(QUERY.get('bloom'), POST_TUNE);
export const POST_SAMPLES = resolveSamples(QUERY.get('aa'), POST_TUNE);
const POST_BOOT_BUDGET_MS = 1200;
const POST_REPORT = QUERY.get('postreport') === '1';

/* status is the honest state of the pass, not the intent:
     'off'      the flag says no — nothing was loaded, nothing was built
     'loading'  the bounded addon settlement is holding the boot
     'active'   the composer is drawing
     'failed'   it broke and the direct path took over for good            */
let status = POST.on ? 'loading' : 'off';
let composer = null;
let bloomPass = null;
let faults = 0;
let lastError = '';
let bootMs = 0;
let prewarmed = false;
let presentedFrames = 0;
let firstFrameStatus = null;
let tenthFrameStatus = null;

/* Draw-call accounting. A composer calls renderer.render() several times per
   displayed frame, and every one of those resets renderer.info while
   autoReset is on — so a probe that reads info.render.calls would report the
   LAST pass's handful instead of the frame's work. Taking the reset over
   makes the number mean "everything drawn for this displayed frame",
   composer passes included, in both paths. */
renderer.info.autoReset = false;

function recordPresentedFrame() {
  presentedFrames++;
  if (presentedFrames === 1) firstFrameStatus = status;
  if (presentedFrames !== 10) return;
  tenthFrameStatus = status;
  // A tiny opt-in boot report for the real-browser gate. It observes the
  // draw path rather than inferring readiness from a resolved import.
  if (POST_REPORT) console.info('HULLBREAKER post boot report ' + JSON.stringify({
    firstFrameStatus,
    tenthFrameStatus,
    stable: firstFrameStatus === tenthFrameStatus,
    prewarmed,
    bootMs,
  }));
}

export function renderFrame() {
  renderer.info.reset();
  if (composer) {
    try {
      drawComposed();
      recordPresentedFrame();
      return;
    } catch (err) {
      // one throw is enough: keep the picture, lose the effect, say so
      faults++;
      lastError = String((err && err.message) || err);
      status = 'failed';
      composer = null;
      bloomPass = null;
    }
  }
  renderer.render(scene, camera);
  recordPresentedFrame();
}

/* ===================== ATMOSPHERE COMPENSATION ====================== *
 * MEASURED, NOT ANTICIPATED — and it is the reason this file is longer than
 * "add a composer". With the composer wired and bloom's strength irrelevant,
 * the frame came out MUCH darker: the six-face combat frame's mean luminance
 * fell 66.98 → 64.36 and its sky band 72.76 → 64.45, and on the traversal
 * fixture (mostly sky) the mean fell 47.10 → 31.62 and the sky 42.90 → 25.24
 * — a 41% drop in the air (tools/playtest/post-capture.mjs, matched frames,
 * same sim instant). Entry 14's verdict is that the frame is already "too
 * dark"; shipping that would answer it in the wrong direction.
 *
 * WHY IT HAPPENS. three.js resolves TWO uniforms against the current render
 * target rather than against the material: the background clear color and the
 * fog color (`getUnlitUniformColorSpace`, three.module.js — the render target
 * branch returns the working/linear space, the canvas branch returns the
 * output color space). Drawing straight to the canvas, both are handed their
 * sRGB-ENCODED numbers, and the background additionally skips tone mapping
 * altogether — which is exactly what src/render/palette.js's calibration note
 * records as "scene.background/fog is drawn raw", and what every CONCEPT token
 * was authored against. Drawing into the composer's render target, both are
 * handed LINEAR numbers and both then go through OutputPass's tone map. Same
 * scene, same tokens, a much darker sky and a much darker haze.
 *
 * WHY BOTH LAND ON THE SAME ANSWER. Neither the sky nor the haze is tone
 * mapped today. The sky is a clear color written straight into the canvas in
 * display space. The fog is subtler and was got wrong here once before it was
 * measured: three's fragment chain is `tonemapping_fragment` → then
 * `colorspace_fragment` → then `fog_fragment` (ten shaders in three.module.js
 * end in exactly that order), so the fog blend happens AFTER the tone map, in
 * display space, against a uniform handed over in display space. A fully
 * fogged surface therefore displays as the raw token too — measured: distant
 * geometry and the sky behind it are both (47,86,94) on the shipped six-face
 * frame, the `limbBg` token exactly.
 *
 * So both compensations are the same operation: hand the composer the value
 * whose TONE-MAPPED result is the token — ACES inverted numerically (three's
 * ACESFilmicToneMapping, mirrored below).
 *
 * The one thing this cannot reproduce is the MIDDLE of the fog ramp: the
 * shipped blend is linear in display space, the composed one is linear in
 * light. Both ends are exact (an unfogged pixel and a fully fogged pixel are
 * byte-identical); a half-fogged pixel differs by a few levels. That is a real
 * difference, it is small, and it is named here rather than left to be found.
 *
 * The authored values are swapped in and OUT around the draw, never left
 * mutated: src/render/transform.js does `scene.background.copy(scene.fog.color)`
 * per band, and any lane retuning the fog ladder reads these too. Nothing
 * outside this function ever sees a compensated color.
 *
 * ?atmos=tone turns it off — the A/B for the question this raises and does
 * not settle: today's sky and today's haze do not actually agree on screen
 * (the sky skips the tone map the haze goes through), and the composer is the
 * first thing in this project that COULD make them agree. That is an operator
 * verdict, not a lane's, so the default is "change nothing but the bloom".  */

const ATMOS_MATCH = QUERY.get('atmos') !== 'tone';

// The curve and its inverse live in src/pure/tonemap.js — arithmetic with no
// renderer in it, so tools/pathcheck.mjs asserts the round trip on every
// palette token instead of trusting this file's comment about it.
const _bgAuthored = new THREE.Color();
const _fogAuthored = new THREE.Color();
const _bgKey = [-1, -1, -1], _bgComp = [0, 0, 0];
const _fogKey = [-1, -1, -1], _fogComp = [0, 0, 0];
const _t = [0, 0, 0];

// Two caches rather than one shared solve: the sky and the haze are the same
// token today and are not required to be — src/render/limb.js and
// src/render/transform.js both retune them per band, and the fog-ladder lane
// may split them further. Each is keyed on its own authored components, so a
// change to either re-solves only itself, and only on the frame it changes.
function bgCompensated(c) {
  if (c.r !== _bgKey[0] || c.g !== _bgKey[1] || c.b !== _bgKey[2]) {
    _bgKey[0] = c.r; _bgKey[1] = c.g; _bgKey[2] = c.b;
    _t[0] = c.r; _t[1] = c.g; _t[2] = c.b;
    inverseAcesFilmic(_t, renderer.toneMappingExposure, _bgComp);
  }
  return _bgComp;
}

function fogCompensated(c) {
  if (c.r !== _fogKey[0] || c.g !== _fogKey[1] || c.b !== _fogKey[2]) {
    _fogKey[0] = c.r; _fogKey[1] = c.g; _fogKey[2] = c.b;
    _t[0] = c.r; _t[1] = c.g; _t[2] = c.b;
    inverseAcesFilmic(_t, renderer.toneMappingExposure, _fogComp);
  }
  return _fogComp;
}

/* The composed draw, with the atmosphere borrowed for exactly one frame.
   Compensation is skipped whenever the tone map is not the one it was solved
   against — if the light-rig lane moves to AgX or Neutral, this reports
   `atmos: 'unmatched'` in the snapshot rather than silently applying an
   inverse for a curve that is no longer in use. */
function drawComposed() {
  const bg = scene.background && scene.background.isColor ? scene.background : null;
  const fog = scene.fog || null;
  const match = ATMOS_MATCH && renderer.toneMapping === THREE.ACESFilmicToneMapping;
  if (!match) { composer.render(); return; }
  if (bg) {
    _bgAuthored.copy(bg);
    const k = bgCompensated(_bgAuthored);
    bg.setRGB(k[0], k[1], k[2]);
  }
  if (fog) {
    _fogAuthored.copy(fog.color);
    const k = fogCompensated(_fogAuthored);
    fog.color.setRGB(k[0], k[1], k[2]);
  }
  try {
    composer.render();
  } finally {
    if (bg) bg.copy(_bgAuthored);
    if (fog) fog.color.copy(_fogAuthored);
  }
}

/* The composer's own buffers are sized in DRAWING BUFFER pixels, so they
   inherit scene.js's bounded supersampled pixel ratio. A retina panel still
   pays materially more fill than this measurement rig's 1x buffer, which is
   why the report quotes both. `samples` keeps the MSAA that a composer otherwise silently drops
   (scene.js constructs the renderer with antialias:true, which only ever
   applied to the canvas): at FAR, RIG is ~30px and its silhouette is the
   read, so losing edge antialiasing is a readability regression, not a
   cosmetic one. */
function build(EffectComposer, RenderPass, UnrealBloomPass, OutputPass) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    samples: POST_SAMPLES,
  });
  // EffectComposer's constructor already captures the current pixel ratio, so
  // setSize() below takes CSS pixels and lands the buffers back on exactly the
  // drawing-buffer size `target` was built at — no oversized intermediate
  // allocation, and the resize listener speaks the same units.
  const c = new EffectComposer(renderer, target);
  /* EffectComposer clones the target it was given for its second ping-pong
     buffer, MSAA and all — and a multisampled buffer must be RESOLVED every
     time a pass reads it. Only the first buffer ever holds the multisampled
     SCENE; everything after it is full-screen quads, which gain nothing from
     samples and pay for the resolve. Measured at a retina drawing buffer
     (2560x1600), leaving both multisampled cost several milliseconds a frame.
     Set before the first render, so neither buffer has been created yet. */
  c.renderTarget2.samples = 0;
  c.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(size.x, size.y),
    POST.strength, POST_TUNE.bloom.radius, POST_TUNE.bloom.threshold);
  c.addPass(bloom);
  c.addPass(new OutputPass());
  c.setSize(innerWidth, innerHeight);
  composer = c;
  bloomPass = bloom;
  status = 'active';
}

function nowMs() {
  return typeof performance !== 'undefined' && performance.now
    ? performance.now() : Date.now();
}

function retirePost(err) {
  faults++;
  lastError = String((err && err.message) || err);
  status = 'failed';
  composer = null;
  bloomPass = null;
}

function prewarmComposer() {
  try {
    // Build render targets, compile every post shader and execute one complete
    // chain while the module graph is still holding main.js. `finish()` is a
    // one-time boot fence: no queued compile/upload can spill into frame one.
    drawComposed();
    const gl = renderer.getContext();
    if (gl && typeof gl.finish === 'function') gl.finish();
    renderer.info.reset();
    prewarmed = true;
  } catch (err) {
    retirePost(err);
  }
}

async function settlePostAtBoot() {
  const started = nowMs();
  let timer = null;
  const imports = Promise.all([
    import('three/addons/postprocessing/EffectComposer.js'),
    import('three/addons/postprocessing/RenderPass.js'),
    import('three/addons/postprocessing/UnrealBloomPass.js'),
    import('three/addons/postprocessing/OutputPass.js'),
  ]).then(
    (modules) => ({ kind: 'ready', modules }),
    (error) => ({ kind: 'failed', error }),
  );
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ kind: 'timeout' }), POST_BOOT_BUDGET_MS);
  });
  const result = await Promise.race([imports, timeout]);
  if (timer !== null) clearTimeout(timer);
  bootMs = Math.round(nowMs() - started);

  if (result.kind === 'timeout') {
    // The import promise is already rejection-handled above. If it completes
    // later its value is deliberately ignored: no mid-run visual upgrade.
    retirePost('post-processing was not ready inside the ' +
      POST_BOOT_BUDGET_MS + 'ms boot budget; direct rendering retained');
    return;
  }
  if (result.kind === 'failed') {
    retirePost(result.error);
    return;
  }
  try {
    const [ec, rp, ub, op] = result.modules;
    build(ec.EffectComposer, rp.RenderPass, ub.UnrealBloomPass, op.OutputPass);
    prewarmComposer();
  } catch (err) {
    retirePost(err);
  }
}

if (POST.on) {
  // Top-level await is intentional: main.js cannot schedule frame one until
  // this bounded decision has reached its final active/failed state.
  await settlePostAtBoot();

  /* Sized off the same globals src/render/camera.js's handleResize reads, so
     the order the two listeners run in cannot matter. EffectComposer caches
     the renderer's pixel ratio at construction, however, so a display/zoom/
     orientation DPR change needs BOTH calls: adopt scene.js's freshly
     resolved ratio, then size from the current CSS viewport. Registered here
     rather than in camera.js because that file owns projection, not buffers. */
  addEventListener('resize', () => syncPostSize());
}

export function syncPostSize(width = innerWidth, height = innerHeight) {
  if (!composer) return false;
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(width, height);
  return true;
}

/* The emissive families' HDR headroom. Bloom bleeds what is ABOVE the
   threshold, and an unlit quad drawn at exactly its token color sits just
   under it — so the pass would find almost nothing to bleed and a muzzle
   flash would stay bright paint. This is the gain that puts flashes, tell
   lamps and hit pops over the line, and it is 1 whenever the composer is not
   actually drawing: with no bloom to catch it, an above-1 color is just a
   clipped white blob, and ?bloom=0 has to return the pre-pass look. */
export function postGain() {
  return status === 'active' ? POST_TUNE.emissiveGain : 1;
}

export function postActive() { return status === 'active'; }

// read-only surface for ?testapi=1 / window.HB / the browser self-test
export function postSnapshot() {
  const draw = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = composer ? composer.renderTarget1 : null;
  return {
    on: POST.on,
    status,
    strength: bloomPass ? bloomPass.strength : 0,
    radius: bloomPass ? bloomPass.radius : 0,
    threshold: bloomPass ? bloomPass.threshold : 0,
    samples: POST_SAMPLES,
    pixelRatio: renderer.getPixelRatio(),
    drawingBuffer: { width: draw.x, height: draw.y },
    composerBuffer: target ? { width: target.width, height: target.height } : null,
    gain: postGain(),
    boot: {
      budgetMs: POST_BOOT_BUDGET_MS,
      costMs: bootMs,
      prewarmed,
      presentedFrames,
      firstFrameStatus,
      tenthFrameStatus,
      stableThroughTen: firstFrameStatus !== null &&
        tenthFrameStatus !== null && firstFrameStatus === tenthFrameStatus,
    },
    // 'match'     the shipped atmosphere is being reproduced exactly
    // 'tone'      ?atmos=tone — sky and haze go through the tone map
    // 'unmatched' the tone map is not the one the inverse was solved for, so
    //             compensation stood down rather than guess (see drawComposed)
    atmos: !ATMOS_MATCH ? 'tone'
      : renderer.toneMapping === THREE.ACESFilmicToneMapping ? 'match' : 'unmatched',
    faults,
    error: lastError,
  };
}
