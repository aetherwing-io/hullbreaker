/* ========================== BACKDROP LAYERS ========================== */
/* Five generated 2D plates (assets/generated/backdrops/) replacing the flat
   scene.background/limbBg color with actual creature anatomy receding into
   the haze — decisions.md entry 16 ("sprites are authorized... the shortest
   path from the concept boards to the screen") and entry 17 ("selling the
   scale is the headline art problem"). See src/config.js's BACKDROP_TUNE
   block and src/render/backdrop-table.js for the placement data and the two
   derived fences (play-band clearance, FAR-view frame coverage) this module
   builds meshes from.

   STATIC ANATOMY (decisions.md entry 3), END TO END. Every quad below is
   placed ONCE, from the authored plan, and is never touched again after boot
   — no per-frame hook, no ritual hook, no build hook, exactly the discipline
   src/render/limb.js's own header states for its box tiers. The apparent
   parallax — a near plate sweeping the frame faster than a far one — comes
   entirely from the CAMERA moving along the same polyline it already drives
   through every corner (src/pure/path.js's SEGS); nothing here computes its
   own position from a clock or a lagged state.

   WHY src/main.js IMPORTS THIS MODULE, NOT src/render/scene.js. This module
   needs the shared preload gate (./preload.js), which itself imports
   `renderer` from ./scene.js. Module dependencies fully evaluate before the
   IMPORTING module's own top-level code runs, no matter where in the source
   the import sits — so if scene.js were the one importing this file (a real
   attempt, reverted), scene.js's own `renderer`/`scene` consts could never
   be assigned before this module (and preload.js beneath it) needed them:
   a real cycle, proven three ways (static import, awaited dynamic import,
   deferred dynamic import) to either deadlock the boot outright or leave
   this module permanently unable to call `scene.add()` — the TDZ never
   clears, because scene.js's body cannot start until THIS module finishes,
   and this module cannot finish without reading `scene`. src/render/
   sprites.js sidesteps the same shared dependency on preload.js cleanly
   because it is reached from src/main.js AFTER main.js's own
   `import { camera, renderer, scene } from './render/scene.js'` line — by
   then scene.js has already fully evaluated, so preload.js's read of
   `renderer` is an ordinary forward dependency, not a cycle. This module is
   wired the same way: imported by src/main.js alongside the other
   side-effect render imports, after the scene.js import.

   DEGRADE SAFELY (entry 16's condition). A plate that fails or times out
   simply never gets a mesh — the existing flat/limb background stays
   exactly what it was before this task, visibly and safely. The whole
   registration+build sequence sits behind one try/catch: a bug in this
   module's own arithmetic must never be able to take the renderer, or the
   rest of the boot, down with it.

   ?backdrop=flat — the A/B: no quads are registered, no meshes are built,
   and scene.background/fog are untouched by this module (byte-identical to
   the pre-T-051 tree in that mode). */

import * as THREE from 'three';
import { BACKDROP_TUNE, CONFIG } from '../config.js';
import { SEGS, headingAt, polyAt } from '../pure/path.js';
import { IS_TRANSFORM_SLICE, QUERY } from '../mode.js';
import { faceMidS, plateSize, resolveBackdropOn } from './backdrop-table.js';
import { preloadTexture, awaitPreloads } from './preload.js';
import { scene } from './scene.js';
import { PAL } from './palette.js';

export const BACKDROP_ON = resolveBackdropOn(QUERY.get('backdrop'), IS_TRANSFORM_SLICE);

// one slot per placement: { placement, state: 'off'|'pending'|'ready'|'failed', tex, error, mesh }
const slots = [];
let built = 0;

/* Everything below is one try/catch, deliberately: an author bug in this
   module's own arithmetic (a bad lookup, a NaN dimension) must degrade the
   same way a network failure does — no mesh for the affected slot(s), never
   a thrown error escaping this module. `buildPlate` carries its own inner
   try/catch too, so one bad slot cannot cost the others their meshes. */
try {
  const BD = BACKDROP_TUNE;

  for (const placement of BD.placements) {
    const plate = BD.plates[placement.plate];
    const slot = {
      placement, state: BACKDROP_ON ? 'pending' : 'off', tex: null, error: null, mesh: null,
    };
    slots.push(slot);
    if (!BACKDROP_ON) continue;
    const url = new URL(BD.root + plate.file, import.meta.url).href;
    preloadTexture(url).then((entry) => {
      if (entry.state === 'ready') { slot.tex = entry.tex; slot.state = 'ready'; return; }
      slot.state = 'failed';
      slot.error = entry.error || entry.state;
      console.warn('HULLBREAKER art: backdrop ' + placement.plate + ' (' + plate.file +
        ') did not load (' + slot.error + ') — the existing flat/limb backdrop stays up there.');
    });
  }

  /* THE BOOT GATE. Same contract as src/render/sprites.js's own top-level
     await: everything registered above is resident (or abandoned) before
     this line returns, so no decode/upload from this module's textures can
     land inside a frame the sim is stepping. Never rejects, never hangs
     past the shared budget. */
  await awaitPreloads();

  const _euler = new THREE.Euler();

  // One plate, one quad.
  const buildPlate = (slot) => {
    try {
      const placement = slot.placement;
      const plate = BD.plates[placement.plate];
      const tier = BD.tiers[placement.tier];
      const { w, h, cy } = plateSize(tier, plate, CONFIG);
      const s = faceMidS(placement.face, CONFIG);
      const yaw = headingAt(SEGS, s);
      const p = polyAt(SEGS, s);
      const geo = new THREE.PlaneGeometry(w, h);
      const mat = new THREE.MeshBasicMaterial({
        map: slot.tex,
        color: PAL[tier.tint],
        transparent: true,           // the PNG's own alpha cutout
        alphaTest: 0.02,             // discard the empty margin before it blends
        depthWrite: false,           // several plates + the limb's own backdrop
                                      //   tiers share this depth range; let THREE's
                                      //   back-to-front transparent sort order them
        side: THREE.DoubleSide,      // a corner swing can carry the view well past
                                      //   this plate's own facet heading
        fog: true,                   // dissolve into the same fog band everything
                                      //   else in the scene grades against
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.quaternion.setFromEuler(_euler.set(0, yaw, 0));
      mesh.position.set(p.x + Math.sin(yaw) * tier.depth, cy, p.z + Math.cos(yaw) * tier.depth);
      mesh.frustumCulled = false;    // static bake, one upload, same reasoning as limb.js
      scene.add(mesh);
      slot.mesh = mesh;
    } catch (err) {
      console.warn('HULLBREAKER art: backdrop ' + slot.placement.plate + ' failed to build (' +
        ((err && err.message) || err) + ') — the existing flat/limb backdrop stays up there.');
    }
  };

  for (const slot of slots) if (slot.state === 'ready') { buildPlate(slot); built++; }
} catch (err) {
  console.warn('HULLBREAKER art: the backdrop layer failed to build (' +
    ((err && err.message) || err) + ') — the game continues with its existing background.');
}

/* Read surface for the console and the headless/browser gates: which plates
   are up, which slot failed and why, and whether the whole layer is armed.
   Deliberately not on window.HB (src/main.js owns that handle) — same
   placement as preload.js's __HB_PRELOAD and sprites.js's __HB_SPRITES. */
export function backdropSnapshot() {
  return {
    on: BACKDROP_ON,
    built,
    plates: slots.map((s) => ({
      face: s.placement.face, plate: s.placement.plate, tier: s.placement.tier,
      state: s.state, error: s.error,
    })),
  };
}
if (typeof window !== 'undefined') window.__HB_BACKDROP = backdropSnapshot;
