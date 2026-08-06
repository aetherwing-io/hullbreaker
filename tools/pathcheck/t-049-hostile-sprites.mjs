// Domain: T-049 runtime hostile sprites
//
// The gate for the first runtime-asset feature the game ships
// (docs/decisions.md entry 16). Three things are checkable without a
// browser and all three are checked here:
//
//   1. THE CONTRACT. "Gameplay must not branch on whether an asset loaded."
//      The sim layer may not name an asset, an image, a texture loader or
//      either sprite module — the half of entry 16's condition a machine
//      can actually decide. (The other half, that a run plays out
//      identically with the art deleted, is a trace diff and lives in
//      reports/tasks/T-049/.)
//   2. THE NUMBERS ARE MEASURED, NOT TYPED. src/render/sprite-table.js
//      records each PNG's canvas size and the opaque bounding box inside
//      it, and the whole quad-sizing rule is arithmetic over those two.
//      Every one of them is re-derived here straight out of the file with
//      tools/assets/lib/png.mjs, so a regenerated asset whose art moved
//      cannot silently keep the old quad.
//   3. THE SIZING RULE ITSELF. A sprite is sized from its measured ink,
//      uniformly contained without deforming the painting, grounded on the
//      same mount line, and bounded by the presentation envelope rather than
//      by whatever transparent margin happened to ship in the canvas.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CONFIG } from '../../src/config.js';
import { CAPSULE_ART_ATLAS, CAPSULE_ART_ROOT } from '../../src/render/capsule-art-spec.js';
import { ENEMY_ECOLOGY_ATLAS } from '../../src/render/enemy-ecology-spec.js';
import {
  DEFAULT_VARIANT, MORTAR_STANCE, SPRITE_ACTION_ART, SPRITE_ART, SPRITE_KINDS,
  SPRITE_MOTION_ART, SPRITE_ROOT, SPRITE_VARIANT_IDS, primitiveBox,
  resolveSpriteVariants, spriteQuad, spritesEnabled,
} from '../../src/render/sprite-table.js';
// the budget constant only — src/render/preload.js itself imports three.js
// and the renderer, so this harness reads it as TEXT below rather than
// importing it. Kept in step by the assertion that the file declares it.
const PRELOAD_BUDGET_MS = 2500;
import { waspDiveStretch } from '../../src/render/legibility.js';
import { decodePng } from '../../tools/assets/lib/png.mjs';
import { here, layerFiles, near, ok, srcDir, stripComments } from './_context.mjs';

export const title = 'T-049 runtime hostile sprites';

const SPRITE_DIR = join(here, '..', 'assets', 'generated', 'sprites');

// the opaque bounding box of a PNG, in texels: the same measurement
// src/render/sprite-table.js records, taken again from the file
function measureInk(file) {
  const { width, height, rgba } = decodePng(file);
  let x0 = width, x1 = -1, y0 = height, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] <= 8) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return { canvas: [width, height], ink: [x0, y0, x1 - x0 + 1, y1 - y0 + 1] };
}

export async function run() {

/* ==== T-049 runtime hostile sprites ==================================== */
{
  /* --- 1. the layer contract ------------------------------------------ *
   * Entry 16 kept layer purity and determinism deliberately ("neither has
   * ever blocked an art change"), and this is the sharp edge of it: art may
   * fail, gameplay may not change when it does. A sim module that could
   * name a texture is a sim module that could branch on one.
   *
   * Scoped to src/sim/ on purpose. src/pure/ is checked for the two things
   * that would let it BRANCH on a load (a loader call, an import of either
   * sprite module) rather than for the mere mention of a path — a pure
   * module holding an asset path as a constant is data, and legislating
   * that here would fail another lane's already-merged decision without
   * making this contract any safer.                                     */
  const SIM_BANNED = [
    [/assets\//, 'an assets/ path'],
    [/\.png\b/, 'an image file'],
    [/TextureLoader/, 'a texture loader'],
    [/render\/sprites?(-table)?\.js/, 'a sprite module'],
    [/\bspriteTexture\b|\bspriteQuad\b|\bspriteSnapshot\b/, 'a sprite API'],
  ];
  for (const file of layerFiles('sim')) {
    const code = stripComments(readFileSync(file, 'utf8'));
    for (const [re, what] of SIM_BANNED) {
      ok(!re.test(code),
         'T-049: src/sim/' + file.split('/').pop() + ' names ' + what + ' — the sim ' +
         'must not be able to tell whether the art loaded (decisions.md entry 16)');
    }
  }
  const PURE_BANNED = [
    [/TextureLoader/, 'a texture loader'],
    [/render\/sprites?(-table)?\.js/, 'a sprite module'],
  ];
  for (const file of layerFiles('pure')) {
    const code = stripComments(readFileSync(file, 'utf8'));
    for (const [re, what] of PURE_BANNED) {
      ok(!re.test(code),
         'T-049: src/pure/' + file.split('/').pop() + ' names ' + what + ' — the pure ' +
         'layer may hold data, never a load path it could branch on');
    }
  }

  // src/render/sprite-table.js is Node-safe by design (that is why the
  // numbers below can be asserted at all), exactly like palette.js and
  // legibility.js. The same banned surface guardLayer() applies to pure/sim.
  const tableSrc = stripComments(readFileSync(join(srcDir, 'render', 'sprite-table.js'), 'utf8'));
  ok(!/\b(THREE|document|window)\b/.test(tableSrc),
     'T-049: src/render/sprite-table.js stays Node-safe (no THREE, no DOM) — it is ' +
     'the half of the sprite path a headless gate has to be able to import');

  const renderDir = join(srcDir, 'render');
  const deliveryFiles = [
    ENEMY_ECOLOGY_ATLAS.file,
    CAPSULE_ART_ROOT + CAPSULE_ART_ATLAS.file,
    SPRITE_ROOT + SPRITE_ART.warden.b.file,
    SPRITE_ROOT + SPRITE_MOTION_ART.hound.file,
    SPRITE_ROOT + SPRITE_ACTION_ART.mortar.file,
  ].map((file) => resolve(renderDir, file));
  ok(deliveryFiles.every((file) => file.endsWith('.webp') && existsSync(file)),
     'T-049: ecology, capsule, Warden, hound-gait, and mortar-action runtime WebPs exist');
  const deliveryBytes = deliveryFiles.reduce((sum, file) => sum + statSync(file).size, 0);
  ok(deliveryBytes < 1_500_000,
     'T-049: the five cold-mobile gameplay atlases stay below a 1.5 MB delivery ceiling ' +
     '(got ' + deliveryBytes + ' bytes)');
  const criticalGameplaySrc = stripComments(readFileSync(
    join(renderDir, 'critical-gameplay-art.js'), 'utf8',
  ));
  const mainSrc = stripComments(readFileSync(join(srcDir, 'main.js'), 'utf8'));
  const criticalAt = mainSrc.indexOf("import './render/critical-gameplay-art.js'");
  ok(criticalAt > mainSrc.indexOf("import './render/critical-rig-art.js'") &&
     criticalAt < mainSrc.indexOf("import './render/enemy-ecology-art.js'") &&
     /CRITICAL_GAMEPLAY_REQUESTS/.test(criticalGameplaySrc) &&
     /files\.map\(\(file\) =>[\s\S]*preloadTexture/.test(criticalGameplaySrc) &&
     !/awaitPreloads/.test(criticalGameplaySrc),
     'T-049: five compact gameplay atlases register after RIG and before optional owners');

  /* --- 1b. the boot preload gate -------------------------------------- *
   * The determinism half of the runtime-asset contract, and the reason it
   * is a gate rather than a convention. MEASURED (T-040's playtest, then
   * this lane's own runs): a texture fetched in the background makes the
   * DECODE and the GPU UPLOAD land inside frames the loop is stepping
   * physics through, and the same scripted input then finishes a full
   * second of sim time away from its siblings. Every playtest gate in this
   * repo rests on that not happening.
   *
   * So: one loader, in one file, awaited at module scope, uploading during
   * boot, bounded by a budget, and dropping anything that turns up late.  */
  // COMMENTS ARE STRIPPED FIRST, and that is not tidiness. The first cut of
  // assertion (c) below tested the raw file for `renderer.initTexture(` — and
  // this module's own header comment contains that string, so deleting the
  // CALL left the gate green. It was caught by breaking it on purpose
  // (reports/tasks/T-049/build.md §6). Every check here reads code only.
  const preloadSrc = stripComments(readFileSync(join(srcDir, 'render', 'preload.js'), 'utf8'));
  const spritesSrc = stripComments(readFileSync(join(srcDir, 'render', 'sprites.js'), 'utf8'));

  // (a) ONE loader for the whole game. A lane that hand-rolls a second
  //     TextureLoader has reintroduced the defect in its own corner, so the
  //     gate names the fix in its failure message.
  const loaderFiles = [];
  for (const dir of ['render', 'ui']) {
    for (const file of readdirSync(join(srcDir, dir))) {
      if (!file.endsWith('.js')) continue;
      const code = stripComments(readFileSync(join(srcDir, dir, file), 'utf8'));
      if (/TextureLoader/.test(code)) loaderFiles.push(dir + '/' + file);
    }
  }
  ok(loaderFiles.length === 1 && loaderFiles[0] === 'render/preload.js',
     'T-049: THREE.TextureLoader is constructed in src/render/preload.js and ' +
     'nowhere else — an asset loaded outside the boot gate lands its decode and ' +
     'its GPU upload inside a running frame, which is measurably a different ' +
     'run (found: ' + (loaderFiles.join(', ') || 'none') + '). Route it through ' +
     'preloadTexture() instead.');

  // (b) the gate is actually awaited where it blocks the boot: a top-level
  //     await in a module src/main.js transitively imports
  ok(/^await awaitPreloads\(\);$/m.test(spritesSrc),
     'T-049: src/render/sprites.js awaits the preload gate AT MODULE SCOPE — ' +
     'that top-level await is what holds src/main.js, and with it the first ' +
     'simulated frame, until the art is resident');

  // (c) residency means uploaded, not fetched
  ok(/renderer\.initTexture\(/.test(preloadSrc),
     'T-049: the gate uploads each texture during boot (renderer.initTexture) — ' +
     'a texture that has only arrived still uploads on its first draw, which ' +
     'moves the stall into the run instead of removing it');

  // (d) it cannot hang the boot… — the number is read OUT OF THE FILE, not
  //     trusted from a copy in this harness, so a retune in either place
  //     that leaves the other behind is a failure rather than a silent drift
  const budgetMatch = /PRELOAD_BUDGET_MS\s*=\s*(\d+)/.exec(preloadSrc);
  const budgetMs = budgetMatch ? Number(budgetMatch[1]) : NaN;
  ok(budgetMs > 0 && budgetMs <= 8000,
     'T-049: the boot gate declares a finite budget (' + budgetMs + 'ms) inside the ' +
     'T-032 bootstrap\'s 10s boot watchdog, so a dead network starts the game with ' +
     'fallbacks instead of painting a panel');
  ok(budgetMs === PRELOAD_BUDGET_MS,
     'T-049: the budget this harness reasons about (' + PRELOAD_BUDGET_MS + 'ms) is ' +
     'the one src/render/preload.js actually ships (' + budgetMs + 'ms)');

  /* (e0) THE GATE'S BEHAVIOUR IS PROVED BY A BROWSER TOOL, NOT BY REGEXES.
   *
   * Three properties matter and none of them is a text pattern: every caller
   * shares one settlement; a caller that awaits before anyone registers does
   * not close the gate on the lanes behind it; and a timeout reports the
   * time actually waited. All three were BUGS at some point in this lane's
   * history, all three were found by running the thing rather than reading
   * it, and all three are asserted for real in
   * tools/playtest/preload-concurrency-check.mjs (independent sibling
   * modules, races forced by delayed responses, repeated trials).
   *
   * What used to be here instead was a set of source-literal matches —
   * `if (!gate) gate = settle();`, and worst, a whitespace-sensitive
   * 200-character window around `warmResident(...)` followed by
   * `closed = true;`. Those assert that the code LOOKS a certain way. With
   * T-040, T-051 and T-052 all editing around this gate, they would fail on
   * a reformat that changes no behaviour, and — being about appearance —
   * they would keep passing on a rewrite that broke the contract. This
   * lane already shipped one assertion whose subject was its own prose
   * (§6); these were the same mistake in a different disguise.
   *
   * What stays static below is only what a text scan is genuinely the right
   * tool for: WHICH FILE may construct a loader, and whether a declared
   * constant matches the one the harness reasons about. Everything about
   * ordering, sharing and timing is behavioural and lives in the tool. */
  ok(/awaitPreloads/.test(preloadSrc) && /settle/.test(preloadSrc),
     'T-049: src/render/preload.js still exposes the settlement gate the ' +
     'behavioural check drives (tools/playtest/preload-concurrency-check.mjs)');
  ok(/state: 'refused'/.test(preloadSrc),
     'T-049: the module still distinguishes a REFUSED registration from a ' +
     'timeout — the two diagnostics mean different things to a lane owner');

  /* (e-warm) THE GPU WARM-UP (I-039). Kept static only where a text scan is
   * the right tool — the presence of the readback (a draw alone can still be
   * queued into frame 1), the offscreen target and its restoration, and the
   * A/B flag. The ORDERING claim ("it runs before the gate opens") used to
   * be a whitespace-sensitive regex and is now behavioural: the tool checks
   * that the warm-up's cost is contained inside the gate's own cost, which
   * can only be true if it ran before close.
   *
   * NOTE FOR WHOEVER READS THIS NEXT: the warm-up did NOT fix I-039 on this
   * lane (16 rounds: 11/16 deviating without it, 14/16 with it, against a
   * 1/16 control). It is kept for the deferred-upload hazard, not because it
   * closed that issue. See reports/tasks/T-049/build.md §8. */
  ok(/readRenderTargetPixels/.test(preloadSrc),
     'T-049/I-039: the warm-up reads a pixel back — that readback is what ' +
     'blocks on the GPU; a draw alone can still be queued into frame 1');
  ok(/setRenderTarget/.test(preloadSrc) && /getRenderTarget/.test(preloadSrc),
     'T-049/I-039: the warm-up draws offscreen and restores the render target ' +
     'it found — the visible canvas is never touched by it');
  ok(/'warm'/.test(preloadSrc),
     'T-049/I-039: ?warm=0 still exists as the A/B control for the warm-up');

  // (e) …and a late arrival is thrown away rather than uploaded mid-run
  ok(/if \(closed[^)]*\) \{ tex\.dispose\(\); return; \}/.test(preloadSrc),
     'T-049: a texture that arrives after the gate closed is disposed, never ' +
     'applied — applying it would be the same mid-run upload, just rarer');
  ok(!/onSpriteReady|listeners\.push/.test(spritesSrc) &&
     !/onSpriteReady/.test(stripComments(readFileSync(join(srcDir, 'render', 'hostiles.js'), 'utf8'))),
     'T-049: no "the texture turned up late, swap the body" path survives in the ' +
     'sprite renderer — every kind\'s state is final before the first frame');

  // (f) the failure path, at the site: an error callback AND a try/catch, so
  //     neither an async failure nor a synchronous throw escapes the boot
  ok(/new THREE\.TextureLoader\(\)\.load\([\s\S]*?\(err\)\s*=>\s*fail\(/.test(preloadSrc),
     'T-049: the texture load passes an error callback that routes to the ' +
     'fallback, rather than dropping the failure on the floor');
  ok(/try\s*\{[\s\S]*TextureLoader[\s\S]*\}\s*catch/.test(preloadSrc),
     'T-049: the texture load is wrapped in try/catch — a loader that throws ' +
     'synchronously must still leave the primitive body drawing');
  ok(!/api\.show\(|__HB_FAILSAFE\.show|\.show\(['"]crash/.test(preloadSrc + spritesSrc),
     'T-049: a missing picture NOTES the failure and never raises the T-032 ' +
     'panel — a failed asset is not a dead game (index.html says so too)');

  // …and the consumer's: hostiles.js only takes the sprite when the texture
  // is already in hand, and still builds the primitive material otherwise.
  const hostSrc = readFileSync(join(srcDir, 'render', 'hostiles.js'), 'utf8');
  ok(/const tex = spriteTexture\(e\.kind\);/.test(hostSrc) &&
     /const geo = tex \? spriteGeo\(e\.kind\) : null;/.test(hostSrc),
     'T-049: spawned() asks for a texture and accepts null as an answer');
  ok(/geo \? spriteMaterial\(tex\) : new THREE\.MeshStandardMaterial\(\{/.test(hostSrc),
     'T-049: the primitive material is still constructed when no sprite is in ' +
     'hand — the fallback is the shipped renderer, not a placeholder');

  /* --- 2. the recorded art matches the files -------------------------- */
  for (const kind of SPRITE_KINDS) {
    for (const variant of SPRITE_VARIANT_IDS) {
      const art = SPRITE_ART[kind][variant];
      const measuredFile = art.sourceFile || art.file;
      const file = join(SPRITE_DIR, measuredFile);
      ok(existsSync(file),
         'T-049: ' + kind + '/' + variant + ' names a measured source that exists (' + measuredFile + ')');
      if (!existsSync(file)) continue;
      let m = null;
      try { m = measureInk(file); } catch (err) {
        ok(false, 'T-049: ' + art.file + ' could not be decoded — ' + err.message);
        continue;
      }
      ok(m.canvas[0] === art.canvas[0] && m.canvas[1] === art.canvas[1],
         'T-049: ' + art.file + ' recorded canvas ' + art.canvas.join('x') +
         ' is the size in the file (' + m.canvas.join('x') + ')');
      ok(m.ink.every((v, i) => v === art.ink[i]),
         'T-049: ' + art.file + ' recorded ink box [' + art.ink.join(',') + '] is the ' +
         'opaque bounding box measured from its pixels ([' + m.ink.join(',') + ']) — ' +
         'the quad is sized from this, so a redrawn asset may not keep an old number');
    }
  }

  /* --- 3. the sizing rule --------------------------------------------- *
   * The sprite's ink is uniformly contained by the old primitive envelope:
   * one axis fits exactly, the other may be smaller, and the authored aspect
   * ratio is never distorted. Grounded roles keep their feet on the old
   * mount line; flyers stay centred.                                    */
  for (const kind of SPRITE_KINDS) {
    const box = primitiveBox(kind);
    for (const variant of SPRITE_VARIANT_IDS) {
      const q = spriteQuad(kind, variant);
      const art = SPRITE_ART[kind][variant];
      const tag = 'T-049: ' + kind + '/' + variant + ': ';

      ok(q.inkW <= box.w + 1e-9 && q.inkH <= box.h + 1e-9,
         tag + 'drawn ink stays inside the primitive presentation envelope');
      ok(Math.abs(q.inkW - box.w) <= 1e-9 || Math.abs(q.inkH - box.h) <= 1e-9,
         tag + 'one drawn-ink axis fits the primitive envelope exactly');
      near(q.inkW / q.inkH, art.ink[2] / art.ink[3], 1e-9,
           tag + 'drawn ink preserves the authored aspect ratio (no stretch)');
      // the margin is the transparent padding and nothing else
      near(q.w / q.inkW, art.canvas[0] / art.ink[2], 1e-9,
           tag + 'the quad exceeds the ink by exactly the PNG\'s transparent margin (x)');
      near(q.h / q.inkH, art.canvas[1] / art.ink[3], 1e-9,
           tag + 'the quad exceeds the ink by exactly the PNG\'s transparent margin (y)');

      // …and it lands where the primitive stood: recompute the ink centre in
      // quad-local tiles from the geometry the renderer actually builds
      const inkCx = ((art.ink[0] + art.ink[2] / 2) / art.canvas[0] - 0.5) * q.w + q.offX;
      const inkCy = (0.5 - (art.ink[1] + art.ink[3] / 2) / art.canvas[1]) * q.h + q.offY;
      near(inkCx, box.cx, 1e-9, tag + 'the drawn ink is centred where the primitive was (x)');
      if (['hound', 'polyp', 'mortar', 'warden'].includes(kind)) {
        near(inkCy - q.inkH / 2, box.cy - box.h / 2, 1e-9,
             tag + 'the drawn feet remain on the primitive mount line');
      } else {
        near(inkCy, box.cy, 1e-9, tag + 'the flying ink remains centred on the primitive');
      }
    }
  }

  // the mount line: a body that stands on a surface has to stand on it, and
  // the surface is the sim's own ride height, not a number picked by eye
  near(primitiveBox('hound').cy - primitiveBox('hound').h / 2, -CONFIG.hound.rideY, 1e-9,
       'T-049: the houndframe sprite\'s feet sit on the plate it walks (hound.rideY)');
  near(primitiveBox('polyp').cy - primitiveBox('polyp').h / 2, -CONFIG.polyp.rootY, 1e-9,
       'T-049: the polyp sprite\'s root reaches the surface it is mounted on (polyp.rootY)');
  near(primitiveBox('mortar').cy - primitiveBox('mortar').h / 2, -CONFIG.mortar.bodyY, 1e-9,
       'T-049: the tripod sprite\'s feet reach the catwalk it stands on (mortar.bodyY)');

  /* The reach rule, carried over from src/render/legibility.js: a drawn
     body may claim LESS than the circle the sim damages with, never more.
     The drone is the case that matters — its dive stretches the quad — and
     the ink half-width is exactly visualRadius, so waspDiveStretch()'s
     existing clamp still lands on contactRadius and not past it. */
  const waspInk = spriteQuad('wasp');
  near(waspInk.inkW / 2, CONFIG.wasp.visualRadius, 1e-9,
       'T-049: the drone sprite\'s drawn half-width is visualRadius exactly, so the ' +
       'dive clamp in src/render/legibility.js still means what it says');
  ok((waspInk.inkW / 2) * (1 + waspDiveStretch()) <= CONFIG.wasp.contactRadius + 1e-9,
     'T-049: a fully stretched dive sprite\'s nose still stops at contactRadius — ' +
     'the drawn body never claims reach the sim did not give it');

  // the one role whose sprite is deliberately wider than its primitive, and
  // the reason it is allowed: the hit circle stays inside the drawn tube
  ok(MORTAR_STANCE > 1,
     'T-049: the tripod\'s widened stance is a declared constant, not a stray number');
  ok(CONFIG.mortar.hitRadius <= CONFIG.mortar.size * 1.1 + 1e-9,
     'T-049: the tripod\'s hit circle is still inside the drawn tube after the stance ' +
     'widening — the extra width is legs, and legs were always theater');

  /* --- 4. the flags --------------------------------------------------- */
  ok(spritesEnabled(null) && spritesEnabled('') && spritesEnabled('1'),
     'T-049: sprites are ON by default (decisions.md entry 16 retired blanket ' +
     'off-by-default flags for approved work)');
  ok(!spritesEnabled('0') && !spritesEnabled('off'),
     'T-049: ?sprites=0 is the escape hatch back to the primitive bodies');

  const def = resolveSpriteVariants(null);
  ok(SPRITE_KINDS.every((k) => def[k] === DEFAULT_VARIANT),
     'T-049: every role wears the shipped variant with no ?spritevar=');
  const all = resolveSpriteVariants('a');
  ok(SPRITE_KINDS.every((k) => all[k] === 'a'),
     'T-049: ?spritevar=a flips the whole roster to the other candidate');
  const mixed = resolveSpriteVariants('hound:a,wasp:b');
  ok(mixed.hound === 'a' && mixed.wasp === 'b' && mixed.polyp === DEFAULT_VARIANT,
     'T-049: ?spritevar= takes per-role pairs and leaves the rest alone');
  const junk = resolveSpriteVariants('hound:q,,zzz:a,:,%%%');
  ok(SPRITE_KINDS.every((k) => SPRITE_VARIANT_IDS.includes(junk[k])),
     'T-049: a mistyped ?spritevar= resolves to legal variants rather than ' +
     'throwing — a bad URL may never stop a hostile being drawn');
  ok(SPRITE_ROOT.startsWith('../../assets/'),
     'T-049: the art is addressed relative to the module at RUNTIME (a static ' +
     'import would make the game refuse to boot without it)');
}

}
