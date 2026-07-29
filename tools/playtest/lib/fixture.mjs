// fixture.mjs — hardcoded snapshot of TRAVERSAL_FIXTURE's route-graph metadata,
// copied by hand from index.html (TRAVERSAL_FIXTURE, commit 7ffd0c9) because the
// harness cannot import across the module boundary while the game is still one
// file. This is a deliberate duplication, not a shortcut: route inference needs
// connector coordinates and route order, and pathcheck.mjs regex-extracts the
// same data for the same reason (a real import isn't possible yet).
//
// STALE-DATA RISK: nothing checks this file against index.html. If the fixture
// geometry changes (new connectors, moved coordinates, retimed dare pocket),
// route-inference output here will silently drift from the real game. Once the
// splitter's module split lands `src/pure/traversal.js`, replace this whole
// file with `import { TRAVERSAL_FIXTURE } from '../../src/pure/traversal.js'`
// and delete the duplication. Until then, re-sync by hand whenever a fixture
// PR changes TRAVERSAL_FIXTURE in index.html.

export const FIXTURE_SOURCE_COMMIT = '7ffd0c9';

export const TRAVERSAL_FIXTURE_SNAPSHOT = {
  id: 'traversal-v1',
  bounds: { x0: 24, x1: 79 },
  entry: 'entry',
  exit: 'rejoin',
  connectors: [
    { id: 'entry', kind: 'entry', x: 27.5, y: 3 },
    { id: 'low-approach', kind: 'floor', x: 34, y: 2 },
    { id: 'mid-entry', kind: 'ledge', x: 33, y: 5.35 },
    { id: 'upper-entry', kind: 'ledge', x: 36, y: 8.35 },
    { id: 'low-step', kind: 'floor', x: 43, y: 3 },
    { id: 'chimney-base', kind: 'chimney', x: 42, y: 5.35 },
    { id: 'chimney-top', kind: 'chimney', x: 44.5, y: 10 },
    { id: 'recovery', kind: 'ledge', x: 46, y: 3.6 },
    { id: 'pocket-commit', kind: 'dare-commit', x: 48, y: 1 },
    { id: 'pocket-reward', kind: 'reward', x: 54, y: 1 },
    { id: 'pocket-wall', kind: 'wall', x: 55.6, y: 3.4 },
    { id: 'overhang-top', kind: 'solid-top', x: 52, y: 6 },
    { id: 'post-low', kind: 'floor', x: 59, y: 3 },
    { id: 'post-mid', kind: 'ledge', x: 60, y: 5.35 },
    { id: 'post-high', kind: 'ledge', x: 61, y: 8.35 },
    { id: 'exit-mid', kind: 'ledge', x: 68, y: 6.35 },
    { id: 'exit-high', kind: 'ledge', x: 68, y: 9.35 },
    { id: 'rejoin', kind: 'rejoin', x: 75, y: 4 },
  ],
  routes: [
    { id: 'lower-service', connectorIds: ['entry', 'low-approach', 'low-step', 'recovery', 'overhang-top', 'post-low', 'rejoin'] },
    { id: 'mid-catwalk', connectorIds: ['entry', 'mid-entry', 'chimney-base', 'overhang-top', 'post-mid', 'exit-mid', 'rejoin'] },
    { id: 'upper-chimney', connectorIds: ['entry', 'mid-entry', 'upper-entry', 'chimney-top', 'overhang-top', 'post-high', 'exit-high', 'rejoin'] },
    { id: 'wall-launch', connectorIds: ['entry', 'mid-entry', 'chimney-base', 'chimney-top', 'overhang-top', 'post-high', 'exit-high', 'rejoin'] },
    { id: 'dare-pocket', connectorIds: ['entry', 'low-approach', 'pocket-commit', 'pocket-reward', 'pocket-wall', 'pocket-commit', 'recovery', 'overhang-top', 'post-mid', 'exit-mid', 'rejoin'] },
    { id: 'recovery-scramble', connectorIds: ['entry', 'mid-entry', 'upper-entry', 'recovery', 'overhang-top', 'post-low', 'rejoin'] },
  ],
  darePocket: {
    commit: 'pocket-commit',
    rewardConnector: 'pocket-reward',
    rejoin: 'recovery',
    bounds: { x0: 48, x1: 57 },
    retreatPath: ['pocket-reward', 'pocket-wall', 'pocket-commit', 'recovery'],
    reward: { kind: 'letter', letter: 'H', mode: 'fixed', x: 54, y: 2 },
    timing: { retreatSeconds: 1.5, entryEdgeMarginTiles: 18, minExitMarginTiles: 8 },
  },
  rejoin: { connector: 'rejoin', x0: 72, x1: 79, y: 4 },
};

const connectorById = new Map(
  TRAVERSAL_FIXTURE_SNAPSHOT.connectors.map((c) => [c.id, c]),
);

export function connector(id) {
  return connectorById.get(id) || null;
}
