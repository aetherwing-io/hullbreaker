/* ============================ BRIDGE ============================== */
/* The simulation's only outward boundary. Every place where the
   single-file build reached for a mesh, a material, a texture, or an HTML
   element now calls one of these hooks instead, at exactly the same point
   in the frame. src/render/* and src/ui/* install implementations when
   they load; anything left uninstalled stays a no-op, so a Node harness
   can import and step the whole sim with no renderer at all.

   Contract: hooks are presentation-only. A hook must never write sim
   state or the headless run diverges from the played run.

   Known exception (deliberate, pre-dates the split): render/camera.js
   calls sim/edges.js setEdges() directly — screen edges are derivable
   only from the camera projection, so that one render→sim write happens
   outside this bridge. Headless hosts must call setEdges() themselves. */

const noop = () => {};

export const view = {
  stateScreen: noop,                     // (state) → overlay screen for a state change
  player:   { sync: noop },              // rig transform, gun pose, i-frame flicker
  hostiles: { spawned: noop, removed: noop, sync: noop },
  capsules: { spawned: noop, removed: noop, sync: noop },
  // A letter capsule has become the held gun. The immutable recipe and its
  // compiled stats are handed outward once so UI/audio can celebrate the
  // roll without polling or reaching back into simulation state.
  loot:     { acquired: noop },          // (gun, compiledDef, { recatch })
  bullets:  { slotSpawned: noop, hideSlot: noop, syncSlot: noop, flush: noop,
              bendCulled: noop, deckIgnited: noop, volatileImpact: noop,
              // Collision-frame presentation fact, positional to avoid a hot
              // event allocation: (slot,type,x,y,vx,vy,targetId,targetKind,
              // damaged,lethal). Observers may draw; they never answer back.
              hostileImpact: noop },
  mods:     { sync: noop, cleared: noop, lanceTelegraph: noop },
  level:    { unbuiltHidden: noop, zipperColumn: noop, faceRevealed: noop },
  // Environment-only Meridian defense lifecycle. The sim publishes a frozen
  // route/state snapshot; presentation may draw it but cannot answer back.
  meridian: { sync: noop, reset: noop },
  corner:   { finished: noop },
  finale:   { started: noop, sync: noop, transmit: noop, reset: noop },
  transform: {                           // world-transformation rituals (slice-only)
    armed: noop, started: noop, ritual: noop, finished: noop, reset: noop,
    frame: noop,                         // per-frame presentation tick (weather)
  },
  hook:     { sync: noop },              // anchor markers + the live tether line
  // Feedback pass (T-011). The sim owns hit-stop because it is timing the
  // player feels; this hook only TELLS the renderer a beat landed, so the
  // shake and the freeze start on the same frame. (kind, ms) — kind is
  // 'kill' | 'hurt'. Presentation-only like every hook here: an unhandled
  // juice notification changes nothing about the run.
  juice:    { hitStop: noop },
};

// group-wise merge: installView({ player: { sync } }) replaces only that hook
export function installView(impl) {
  for (const [group, value] of Object.entries(impl)) {
    if (typeof value === 'function') view[group] = value;
    else Object.assign(view[group], value);
  }
}

/* Composition-root callbacks (src/main.js owns the run lifecycle; the sim
   only asks for a restart when a fixture attempt is lost). */
export const host = { resetGame: noop };
export function installHost(impl) { Object.assign(host, impl); }
