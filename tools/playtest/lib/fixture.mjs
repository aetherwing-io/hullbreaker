// fixture.mjs — the harness's single access point for TRAVERSAL_FIXTURE.
//
// This is now a real import from the game's own module (the module split
// landed src/pure/traversal.js), replacing the hand-copied snapshot this file
// carried while the game was still one file (playtest README hook request #6).
// The old staleness risk — fixture geometry changing in the game with nothing
// checking this copy against it — is gone: this is the same object the game
// builds the traversal slice from. src/pure/ is deliberately DOM/THREE-free,
// so Node imports it directly.
//
// Path note: the import below resolves relative to THIS file (ESM semantics),
// not the process cwd — so it works from any invocation directory and inside
// any git worktree, always reading the fixture of the tree this harness copy
// lives in. One honest caveat survives, documented in README "Honesty /
// limitations": with --base-url pointed at a DIFFERENT pinned checkout, route
// metrics still come from the running tree's fixture, not the served one.

export { TRAVERSAL_FIXTURE } from '../../../src/pure/traversal.js';
