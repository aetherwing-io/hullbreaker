/* ======================= RUNTIME SPRITE LOADER ==================== */
/* The first real use of decisions.md entry 16 ("runtime asset loading is
   authorized. Sprites are authorized."): the generated hostile art in
   assets/generated/sprites/ fetched at runtime and handed to
   src/render/hostiles.js as textures.

   ENTRY 16'S CONDITION IS THE DESIGN OF THIS MODULE, not a caveat at the
   end of it. "A missing or failed asset must degrade visibly and safely …
   must never wedge the game, and must never be something the sim branches
   on." So:

     - nothing here throws. A 404, a decode failure, a file that was never
       copied, a mistyped ?spritevar= — every one of them lands in the same
       place: the kind stays in state 'failed', spriteTexture() returns
       null, and src/render/hostiles.js builds the primitive mesh it has
       always built. The primitive path is not a placeholder; it is the
       shipped pre-T-049 renderer, unchanged.
     - the degrade is VISIBLE three ways: the hostile is drawn (as its
       primitive, never blank), one console line names the file, and the
       T-032 failure bootstrap is handed a note, so if a panel is ever
       raised for any reason the asset failure is in its detail. What it
       deliberately does NOT do is RAISE that panel: a missing picture is
       not a dead game, and the bootstrap already says so in as many words
       (index.html: "a picture or a stylesheet that failed to arrive is not
       a dead game").
     - nothing in src/sim/ or src/pure/ can reach this module. There is no
       export here that a sim module could read, the bridge carries no
       sprite field, and pathcheck asserts the sim layer names neither this
       file, nor a texture, nor an asset path. Art may fail; the run plays
       out identically either way, which is what the missing-asset trace
       diff in reports/tasks/T-049/ measures rather than assumes.

   Loading is EAGER (all five selected variants at module load) rather than
   on first spawn: the whole set is ~7 kB, and a lazy load would mean the
   first houndframe of a run draws as a box for a frame or two and then
   changes shape mid-charge, which is a worse failure than a slow start. */

import * as THREE from 'three';
import { QUERY } from '../mode.js';
import {
  SPRITE_ART, SPRITE_KINDS, SPRITE_ROOT, resolveSpriteVariants, spritesEnabled,
} from './sprite-table.js';

export const SPRITES_ON = spritesEnabled(QUERY.get('sprites'));
export const SPRITE_VARIANT = resolveSpriteVariants(QUERY.get('spritevar'));

// kind -> { state: 'off'|'pending'|'ready'|'failed', variant, file, tex, error }
const slots = new Map();

const listeners = [];

// the T-032 bootstrap's note channel: recorded, never a panel (see header)
function note(line) {
  const api = typeof window !== 'undefined' && window.__HB_FAILSAFE;
  if (api && api.note) { try { api.note(line); } catch (e) { /* optional */ } }
}

function fail(kind, slot, why) {
  if (slot.state === 'failed') return;
  slot.state = 'failed';
  slot.error = why;
  const line = 'HULLBREAKER art: ' + kind + ' sprite ' + slot.file +
    ' did not load (' + why + ') — drawing the primitive body instead.';
  console.warn(line);
  note(line);
}

function ready(kind, slot, tex) {
  // sRGB because the PNGs are authored in sRGB and the renderer's output is
  // too (src/render/scene.js sets ACES tone mapping over the default sRGB
  // output space); leaving it unset draws the whole roster washed out.
  tex.colorSpace = THREE.SRGBColorSpace;
  // Mipmapped minification, NOT NearestFilter: at the shipped FAR view a
  // 64px-wide texture is drawn at ~30px, so this is minification, and
  // nearest sampling on a moving 30px sprite crawls (the texel grid slides
  // under the pixel grid every frame). anisotropy 4 matches the capsule
  // glyphs, and is clamped to the device maximum on upload.
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  slot.tex = tex;
  slot.state = 'ready';
  for (const cb of listeners) {
    try { cb(kind); } catch (e) { /* a listener must not break the loader */ }
  }
}

function load(kind) {
  const slot = slots.get(kind);
  const url = new URL(SPRITE_ROOT + slot.file, import.meta.url).href;
  try {
    new THREE.TextureLoader().load(
      url,
      // the success path is guarded too: it runs inside the loader's own
      // callback, outside the try below, and a throw there would escape into
      // the page as an uncaught error instead of degrading to the primitive
      (tex) => {
        try { ready(kind, slot, tex); } catch (err) {
          fail(kind, slot, 'the texture arrived but could not be prepared: ' +
            ((err && err.message) || err));
        }
      },
      undefined,
      (err) => fail(kind, slot, (err && err.type) || 'load error'),
    );
  } catch (err) {                        // a loader that throws synchronously
    fail(kind, slot, (err && err.message) || 'loader threw');
  }
}

for (const kind of SPRITE_KINDS) {
  const art = SPRITE_ART[kind][SPRITE_VARIANT[kind]];
  const slot = {
    state: SPRITES_ON ? 'pending' : 'off',
    variant: SPRITE_VARIANT[kind],
    file: art ? art.file : null,
    tex: null,
    error: null,
  };
  slots.set(kind, slot);
  if (!SPRITES_ON) continue;
  if (!art) { fail(kind, slot, 'no art declared for this kind'); continue; }
  load(kind);
}

/* The texture for a kind, or null — and null is a complete answer, not an
   error: 'off', 'pending' and 'failed' all mean "draw the primitive". */
export function spriteTexture(kind) {
  const slot = slots.get(kind);
  return slot && slot.state === 'ready' ? slot.tex : null;
}

export function spriteVariantOf(kind) {
  const slot = slots.get(kind);
  return slot ? slot.variant : null;
}

/* Called once per kind when its texture arrives, so a hostile that spawned
   during the load window can be upgraded in place instead of living out its
   life as a box. Registration is idempotent-free by design: hostiles.js
   registers exactly once at module load. */
export function onSpriteReady(cb) { listeners.push(cb); }

/* Read surface for the browser console and the headless gates. Deliberately
   here and not on window.HB (src/main.js belongs to another lane, and this
   is render-side state that the sim must not be able to see anyway). */
export function spriteSnapshot() {
  const out = { enabled: SPRITES_ON, kinds: {} };
  for (const [kind, slot] of slots) {
    out.kinds[kind] = {
      state: slot.state, variant: slot.variant, file: slot.file, error: slot.error,
    };
  }
  return out;
}

// one live read surface: the snapshot is computed on call, so a harness that
// grabs it before the textures land still sees the truth afterwards
if (typeof window !== 'undefined') window.__HB_SPRITES = spriteSnapshot;
