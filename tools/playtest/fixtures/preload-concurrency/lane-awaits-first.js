/* Fixture, not shipped code. THE CASE THE FIRST CONCURRENCY FIX DID NOT COVER.

   A lane that awaits the boot gate WITHOUT owning an asset of its own — or
   simply one whose module body runs before the asset-owning lane's — is a
   normal thing for a shared gate to meet: T-040, T-051 and T-052 all import
   it, and module evaluation order is decided by the import graph, not by who
   has a texture.

   If awaiting an EMPTY registry closes the gate, every registration that
   follows is refused and those lanes lose their art. This module is imported
   FIRST by index-awaits-first.html, so it awaits before lane-first.js and
   lane-second.js have registered anything. */

import { awaitPreloads, preloadSnapshot } from '/src/render/preload.js';

await awaitPreloads();

window.__T049_AWAITER = { snapshotAtClose: preloadSnapshot() };
