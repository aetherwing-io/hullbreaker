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

   LOADING FINISHES BEFORE THE SIM'S FIRST FRAME, and that is not a nicety.
   Measured on this lane: with the five textures fetched in the background,
   one deterministic run of mid-route.json in four finished 1036ms of sim
   time short of its siblings, because the decode and the GPU upload landed
   inside frames the loop was also stepping physics through. Determinism is
   what every playtest gate rests on. So the five loads go through
   src/render/preload.js — one boot gate, one wall-clock budget, textures
   uploaded during boot — and this module AWAITS IT AT MODULE SCOPE. The ES
   module graph does the rest: src/main.js imports the hostile renderer,
   which imports this, so the composition root cannot run until the art is
   resident or abandoned. Nothing in the composition root had to change. */

import * as THREE from 'three';
import { QUERY } from '../mode.js';
import { awaitPreloads, preloadTexture } from './preload.js';
import {
  SPRITE_ACTION_ART, SPRITE_ART, SPRITE_FLAP_ART, SPRITE_KINDS, SPRITE_ROOT,
  resolveSpriteVariants, spritesEnabled,
} from './sprite-table.js';

export const SPRITES_ON = spritesEnabled(QUERY.get('sprites'));
export const SPRITE_VARIANT = resolveSpriteVariants(QUERY.get('spritevar'));

// kind -> { state: 'off'|'pending'|'ready'|'failed', variant, file, tex, error }
const slots = new Map();
const actionSlots = new Map();
const flapSlots = new Map();

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

/* Registration, then ONE await for the whole set. Everything about the
   texture itself — sRGB, mipmaps, the GPU upload — happens inside
   src/render/preload.js, during boot, before the first frame. */
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
  preloadTexture(new URL(SPRITE_ROOT + art.file, import.meta.url).href)
    .then((entry) => {
      if (entry.state === 'ready') { slot.tex = entry.tex; slot.state = 'ready'; }
      else fail(kind, slot, entry.error || entry.state);
    });
}

// Persistent painted animation phases are their own slots. In particular,
// the wasp downstroke must never replace its committed-dive action painting.
for (const kind of SPRITE_KINDS) {
  const art = SPRITE_FLAP_ART[kind];
  const slot = {
    state: SPRITES_ON && art ? 'pending' : 'off',
    variant: 'flap', file: art ? art.file : null, tex: null, error: null,
  };
  flapSlots.set(kind, slot);
  if (!SPRITES_ON || !art) continue;
  preloadTexture(new URL(SPRITE_ROOT + art.file, import.meta.url).href)
    .then((entry) => {
      if (entry.state === 'ready') { slot.tex = entry.tex; slot.state = 'ready'; }
      else fail(kind + ' flap', slot, entry.error || entry.state);
    });
}

// Production action poses share the same boot contract as the idle bodies.
// A failed action pose simply leaves the idle cutout on screen; it can never
// remove a hostile or delay a swap into the middle of play.
for (const kind of SPRITE_KINDS) {
  const art = SPRITE_ACTION_ART[kind];
  const slot = {
    state: SPRITES_ON && art ? 'pending' : 'off',
    variant: 'action', file: art ? art.file : null, tex: null, error: null,
  };
  actionSlots.set(kind, slot);
  if (!SPRITES_ON || !art) continue;
  preloadTexture(new URL(SPRITE_ROOT + art.file, import.meta.url).href)
    .then((entry) => {
      if (entry.state === 'ready') { slot.tex = entry.tex; slot.state = 'ready'; }
      else fail(kind + ' action', slot, entry.error || entry.state);
    });
}

/* THE BOOT GATE. This top-level await is the whole determinism fix: the ES
   module graph — and with it src/main.js, which imports the hostile renderer,
   which imports this file — does not finish evaluating until every texture is
   resident on the GPU or the shared budget has given up on it. There is no
   window in which a fetch, a decode or an upload can land inside a frame the
   simulation is stepping. `awaitPreloads()` never rejects and never waits
   past its budget, so this cannot hang the boot. */
await awaitPreloads();

/* The texture for a kind, or null — and null is a complete answer, not an
   error: 'off', 'pending' and 'failed' all mean "draw the primitive". */
export function spriteTexture(kind) {
  const slot = slots.get(kind);
  return slot && slot.state === 'ready' ? slot.tex : null;
}

export function spriteActionTexture(kind) {
  const slot = actionSlots.get(kind);
  return slot && slot.state === 'ready' ? slot.tex : null;
}

export function spriteFlapTexture(kind) {
  const slot = flapSlots.get(kind);
  return slot && slot.state === 'ready' ? slot.tex : null;
}

export function spriteVariantOf(kind) {
  const slot = slots.get(kind);
  return slot ? slot.variant : null;
}

/* There is deliberately NO "the texture turned up late, upgrade the body"
   hook here any more. It existed while loading was asynchronous, and it was
   a way for a GPU upload to land mid-run — the defect this module's boot
   gate exists to remove. Every state a kind can be in when the first frame
   runs is final: 'ready', 'failed', 'timeout' (reported as failed) or 'off'.

   Read surface for the browser console and the headless gates. Deliberately
   here and not on window.HB (src/main.js belongs to another lane, and this
   is render-side state that the sim must not be able to see anyway). */
export function spriteSnapshot() {
  const out = { enabled: SPRITES_ON, kinds: {} };
  for (const [kind, slot] of slots) {
    out.kinds[kind] = {
      state: slot.state, variant: slot.variant, file: slot.file, error: slot.error,
      action: actionSlots.has(kind) ? {
        state: actionSlots.get(kind).state,
        file: actionSlots.get(kind).file,
        error: actionSlots.get(kind).error,
      } : null,
      flap: flapSlots.has(kind) ? {
        state: flapSlots.get(kind).state,
        file: flapSlots.get(kind).file,
        error: flapSlots.get(kind).error,
      } : null,
    };
  }
  return out;
}

// one live read surface: the snapshot is computed on call, so a harness that
// grabs it before the textures land still sees the truth afterwards
if (typeof window !== 'undefined') window.__HB_SPRITES = spriteSnapshot;
