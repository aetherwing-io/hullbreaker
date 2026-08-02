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
//   3. THE SIZING RULE ITSELF. A sprite may never draw a body SMALLER than
//      the primitive it replaces (that is the defect T-046 measured — a
//      canvas-sized quad drew the wasp at 88% x 75% of its own hit box),
//      it must stand on the same mount line, and it may never claim reach
//      past the circle the sim damages with.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG } from '../../src/config.js';
import {
  DEFAULT_VARIANT, MORTAR_STANCE, SPRITE_ART, SPRITE_KINDS, SPRITE_ROOT,
  SPRITE_VARIANT_IDS, primitiveBox, resolveSpriteVariants, spriteQuad, spritesEnabled,
} from '../../src/render/sprite-table.js';
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

  // The loader's failure path, at the site: the texture request carries an
  // error callback AND sits inside a try/catch, so neither an async failure
  // nor a synchronous throw can escape into the frame loop.
  const loaderSrc = readFileSync(join(srcDir, 'render', 'sprites.js'), 'utf8');
  ok(/new THREE\.TextureLoader\(\)\.load\([\s\S]*?\(err\)\s*=>\s*fail\(/.test(loaderSrc),
     'T-049: the texture load passes an error callback that routes to the ' +
     'fallback, rather than dropping the failure on the floor');
  ok(/try\s*\{[\s\S]*TextureLoader[\s\S]*\}\s*catch/.test(loaderSrc),
     'T-049: the texture load is wrapped in try/catch — a loader that throws ' +
     'synchronously must still leave the primitive body drawing');
  ok(!/api\.show\(|__HB_FAILSAFE\.show|\.show\(['"]crash/.test(loaderSrc),
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
      const file = join(SPRITE_DIR, art.file);
      ok(existsSync(file),
         'T-049: ' + kind + '/' + variant + ' names an asset that exists (' + art.file + ')');
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
   * The rule, in one line: the sprite's INK occupies exactly the box the
   * primitive mesh drew. Everything else follows from it.               */
  for (const kind of SPRITE_KINDS) {
    const box = primitiveBox(kind);
    for (const variant of SPRITE_VARIANT_IDS) {
      const q = spriteQuad(kind, variant);
      const art = SPRITE_ART[kind][variant];
      const tag = 'T-049: ' + kind + '/' + variant + ': ';

      near(q.inkW, box.w, 1e-9, tag + 'drawn ink width is the primitive box width');
      near(q.inkH, box.h, 1e-9, tag + 'drawn ink height is the primitive box height');
      ok(q.w >= box.w - 1e-9 && q.h >= box.h - 1e-9,
         tag + 'the quad is at least the primitive box on both axes — a sprite may ' +
         'never draw a body smaller than the solid it replaces (T-046 measured ' +
         'exactly that on a canvas-sized quad)');
      // the margin is the transparent padding and nothing else
      near(q.w / box.w, art.canvas[0] / art.ink[2], 1e-9,
           tag + 'the quad exceeds the ink by exactly the PNG\'s transparent margin (x)');
      near(q.h / box.h, art.canvas[1] / art.ink[3], 1e-9,
           tag + 'the quad exceeds the ink by exactly the PNG\'s transparent margin (y)');

      // …and it lands where the primitive stood: recompute the ink centre in
      // quad-local tiles from the geometry the renderer actually builds
      const inkCx = ((art.ink[0] + art.ink[2] / 2) / art.canvas[0] - 0.5) * q.w + q.offX;
      const inkCy = (0.5 - (art.ink[1] + art.ink[3] / 2) / art.canvas[1]) * q.h + q.offY;
      near(inkCx, box.cx, 1e-9, tag + 'the drawn ink is centred where the primitive was (x)');
      near(inkCy, box.cy, 1e-9, tag + 'the drawn ink is centred where the primitive was (y)');
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
  const waspInk = primitiveBox('wasp');
  near(waspInk.w / 2, CONFIG.wasp.visualRadius, 1e-9,
       'T-049: the drone sprite\'s drawn half-width is visualRadius exactly, so the ' +
       'dive clamp in src/render/legibility.js still means what it says');
  ok((waspInk.w / 2) * (1 + waspDiveStretch()) <= CONFIG.wasp.contactRadius + 1e-9,
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
