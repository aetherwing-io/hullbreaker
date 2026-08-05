/* =============== LEVEL 1 ECOLOGY ENCOUNTER SCORE ================ */
/* The twelve-body ecology is opt-in at the spawn-row seam.  This file is
 * the immutable six-face score: it chooses WHICH reviewed body owns each
 * existing gate slot and WHICH Vertical Assault socket explains its job.
 * It does not spawn anything, alter durability, or know about live terrain.
 *
 * `beat` is encounter-local sequencing.  A new answer is isolated before a
 * later beat recombines it; entries sharing one beat form a readable cell.
 * The gate runtime keeps the existing 4/5/6/7/8/9 body counts and unlocks
 * the next beat immediately when the current one is cleared.               */

import { resolveEnemyEcology } from './enemy-ecology.js';

export const LEVEL1_ECOLOGY_BEAT_LOCK_MS = 300000;
export const LEVEL1_ECOLOGY_BEAT_STAGGER_MS = 150;

const DECISIONS = Object.freeze({
  'hound-railfang': 'timing',
  'hound-vaultjaw': 'elevation',
  'hound-rebound': 'route',
  'wasp-crosswind': 'elevation',
  'wasp-diveclaw': 'timing',
  'wasp-pincer': 'target',
  'polyp-needle': 'route',
  'polyp-sweepfan': 'timing',
  'polyp-gateweaver': 'route',
  'mortar-craterpod': 'landing',
  'mortar-bracketpod': 'timing',
  'mortar-aircomb': 'elevation',
});

function entry(ecologyId, beat, stageRole, mode = 'teach', extra = {}) {
  const recipe = resolveEnemyEcology(ecologyId,
    ecologyId.startsWith('hound-') ? 'hound'
      : ecologyId.startsWith('wasp-') ? 'wasp'
        : ecologyId.startsWith('polyp-') ? 'polyp' : 'mortar');
  if (!recipe) throw new Error(`invalid Level 1 ecology encounter id ${ecologyId}`);
  return Object.freeze({
    ecologyId,
    kind: recipe.kind,
    family: recipe.family,
    beat,
    stageRole,
    mode,
    decision: DECISIONS[ecologyId],
    ...extra,
  });
}

function face(face, response, rows) {
  const beatCounts = new Map();
  const scored = rows.map((row, slot) => {
    const beatSlot = beatCounts.get(row.beat) || 0;
    beatCounts.set(row.beat, beatSlot + 1);
    return Object.freeze({
      ...row,
      face,
      response,
      slot,
      beatSlot,
      id: `ecology-f${face}-s${slot}-${row.ecologyId}`,
    });
  });
  return Object.freeze({ face, response, rows: Object.freeze(scored) });
}

/* Counts deliberately match CONFIG.waves exactly.  Teach cells isolate the
 * promised geometry; remix cells never introduce an unseen ID.  Pincer is
 * the one authored two-body lesson because its center seam is the answer. */
export const LEVEL1_ECOLOGY_ENCOUNTERS = Object.freeze([
  face(1, 'OBSERVE', [
    entry('wasp-crosswind', 0, 'aerial-crossing'),
    entry('wasp-diveclaw', 1, 'defender-apex'),
    entry('wasp-crosswind', 2, 'intercept-mid', 'recombine'),
    entry('wasp-diveclaw', 2, 'defender-mid', 'recombine'),
  ]),
  face(2, 'INTERCEPT', [
    entry('hound-railfang', 0, 'hound-run'),
    entry('hound-vaultjaw', 1, 'intercept-left'),
    entry('hound-railfang', 2, 'hound-run', 'recombine'),
    entry('wasp-crosswind', 2, 'intercept-right', 'recombine'),
    entry('wasp-diveclaw', 2, 'defender-apex', 'recombine'),
  ]),
  face(3, 'CONTAIN', [
    entry('polyp-needle', 0, 'connector-control'),
    entry('polyp-sweepfan', 1, 'connector-control'),
    entry('wasp-pincer', 2, 'defender-left'),
    entry('wasp-pincer', 2, 'defender-right'),
    entry('hound-railfang', 3, 'hound-channel', 'recombine'),
    entry('wasp-diveclaw', 3, 'aerial-apex', 'recombine'),
  ]),
  face(4, 'QUARANTINE', [
    entry('mortar-craterpod', 0, 'defender-apex', 'teach', {
      targetStageRole: 'landing-denial-low',
    }),
    entry('mortar-bracketpod', 1, 'landing-denial-high', 'teach', {
      targetStageRole: 'landing-denial-mid',
    }),
    entry('hound-rebound', 2, 'connector-control'),
    entry('mortar-craterpod', 3, 'landing-denial-high', 'recombine', {
      targetStageRole: 'landing-denial-low',
    }),
    entry('wasp-crosswind', 3, 'defender-apex', 'recombine'),
    entry('mortar-bracketpod', 4, 'defender-apex', 'recombine', {
      targetStageRole: 'landing-denial-mid',
    }),
    entry('wasp-diveclaw', 4, 'landing-denial-high', 'recombine'),
  ]),
  face(5, 'STERILIZE', [
    entry('polyp-gateweaver', 0, 'connector-left'),
    entry('mortar-aircomb', 1, 'defender-apex', 'teach', {
      targetStageRole: 'aerial-right',
    }),
    entry('polyp-gateweaver', 2, 'connector-right', 'recombine'),
    entry('hound-rebound', 2, 'hound-run', 'recombine'),
    entry('wasp-diveclaw', 2, 'aerial-left', 'recombine'),
    entry('mortar-aircomb', 3, 'defender-apex', 'recombine', {
      targetStageRole: 'aerial-right',
    }),
    entry('hound-railfang', 3, 'hound-run', 'recombine'),
    entry('wasp-crosswind', 3, 'aerial-left', 'recombine'),
  ]),
  face(6, 'SCUTTLE', [
    entry('wasp-crosswind', 0, 'aerial-left', 'recombine'),
    entry('hound-railfang', 0, 'ground-assault', 'recombine'),
    entry('polyp-needle', 0, 'connector-left', 'recombine'),
    entry('wasp-diveclaw', 1, 'aerial-center', 'recombine'),
    entry('hound-rebound', 1, 'ground-assault', 'recombine'),
    entry('mortar-craterpod', 1, 'crown-defender', 'recombine', {
      targetStageRole: 'connector-center',
    }),
    entry('wasp-pincer', 2, 'aerial-right', 'recombine'),
    entry('polyp-gateweaver', 2, 'connector-center', 'recombine'),
    entry('mortar-aircomb', 2, 'crown-defender', 'recombine', {
      targetStageRole: 'aerial-center',
    }),
  ]),
]);

export function level1EcologyEncounterRow(faceNo, slot, enabled = true) {
  if (!enabled) return null;
  const encounter = LEVEL1_ECOLOGY_ENCOUNTERS[Number(faceNo) - 1];
  return encounter?.face === Number(faceNo) ? encounter.rows[slot] || null : null;
}

export function level1EcologyEncounterDelay(row) {
  if (!row) return 0;
  return row.beat * LEVEL1_ECOLOGY_BEAT_LOCK_MS +
    row.beatSlot * LEVEL1_ECOLOGY_BEAT_STAGGER_MS;
}

