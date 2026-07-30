/* ============================ BRIDGE ============================== */
/* The simulation's only outward boundary. Every place where the
   single-file build reached for a mesh, a material, a texture, or an HTML
   element now calls one of these hooks instead, at exactly the same point
   in the frame. src/render/* and src/ui/* install implementations when
   they load; anything left uninstalled stays a no-op, so a Node harness
   can import and step the whole sim with no renderer at all.

   Contract: hooks are presentation-only. A hook must never write sim
   state or the headless run diverges from the played run.             */

const noop = () => {};

export const view = {
  stateScreen: noop,                     // (state) → overlay screen for a state change
  player:   { sync: noop },              // rig transform, gun pose, i-frame flicker
  hostiles: { spawned: noop, removed: noop, sync: noop },
  capsules: { spawned: noop, removed: noop, sync: noop },
  bullets:  { slotSpawned: noop, hideSlot: noop, syncSlot: noop, flush: noop },
  mods:     { sync: noop, cleared: noop, lanceTelegraph: noop },
  level:    { unbuiltHidden: noop, zipperColumn: noop, faceRevealed: noop },
  corner:   { finished: noop },
  transform: {                           // world-transformation rituals (slice-only)
    armed: noop, started: noop, ritual: noop, finished: noop, reset: noop,
  },
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
