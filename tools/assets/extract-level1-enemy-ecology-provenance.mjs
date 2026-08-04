#!/usr/bin/env node
/* Extract exact ImageGen revised prompts from the Codex session log. The
 * generated JSON is an audit artifact; runtime never reads it. */

import { createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const session = resolve(process.argv[2] ||
  '/Users/scottmeyer/.codex/sessions/2026/08/03/rollout-2026-08-03T19-54-43-019fca44-054a-73e2-bf97-add9bf75d6b6.jsonl');
const output = resolve(process.argv[3] ||
  `${root}/assets/generated/enemy-ecology/level1-enemy-ecology-imagegen-provenance-v1.json`);

const accepted = [
  {
    callId: 'exec-5ddad9c5-309e-49ee-913e-c8d367914a5d', role: 'hunter body/action 6x8',
    workspaceFile: 'assets/generated/enemy-ecology/source-boards/level1-hunters-6x8-chroma-v1.png',
    references: ['assets/generated/sprites/houndframe-v2.png',
      'assets/generated/sprites/houndframe-action-v2.png',
      'docs/concept-art/07-enemy-combat-readability.png'],
  },
  {
    callId: 'exec-ba4a62c9-0383-4250-8278-de67cc86cda2',
    role: 'aerial body B0-B3 FAR-readability replacement 3x4',
    workspaceFile: 'assets/generated/enemy-ecology/source-boards/level1-aerial-body-b0-b3-3x4-chroma-v2.png',
    references: ['assets/generated/enemy-ecology/source-boards/level1-aerial-6x8-chroma-v1.png',
      'docs/concept-art/04-six-phase-escalation.png'],
  },
  {
    callId: 'exec-fd07f799-6a1c-4373-acd3-3473f8f9d38d',
    role: 'aerial body B4-B7 FAR-readability replacement 3x4',
    workspaceFile: 'assets/generated/enemy-ecology/source-boards/level1-aerial-body-b4-b7-3x4-chroma-v2.png',
    references: ['assets/generated/enemy-ecology/source-boards/level1-aerial-6x8-chroma-v1.png',
      'docs/concept-art/04-six-phase-escalation.png'],
  },
  {
    callId: 'exec-1f470f59-c9ca-482d-af7a-2e1ec7b62bfa',
    role: 'aerial action A0-A3 FAR-readability replacement 3x4',
    workspaceFile: 'assets/generated/enemy-ecology/source-boards/level1-aerial-action-a0-a3-3x4-chroma-v2.png',
    references: ['assets/generated/enemy-ecology/source-boards/level1-aerial-6x8-chroma-v1.png',
      'assets/generated/enemy-ecology/source-boards/level1-aerial-body-b0-b3-3x4-chroma-v2.png',
      'docs/concept-art/04-six-phase-escalation.png'],
  },
  {
    callId: 'exec-b1cb3b95-dc51-48ec-8bfd-62a2d7628a8b',
    role: 'aerial action A4-A7 FAR-readability replacement 3x4',
    workspaceFile: 'assets/generated/enemy-ecology/source-boards/level1-aerial-action-a4-a7-3x4-chroma-v2.png',
    references: ['assets/generated/enemy-ecology/source-boards/level1-aerial-6x8-chroma-v1.png',
      'assets/generated/enemy-ecology/source-boards/level1-aerial-body-b4-b7-3x4-chroma-v2.png',
      'docs/concept-art/04-six-phase-escalation.png'],
  },
  {
    callId: 'exec-2a8c9bc2-7d1e-4d63-9377-48d525e49a12',
    role: 'hunter action A1-A4 readability replacement 3x4 (Vaultjaw/Rebound)',
    workspaceFile: 'assets/generated/enemy-ecology/source-boards/level1-hunters-action-a1-a4-3x4-chroma-v2.png',
    references: ['ImageGen rejected hunter replacement exec-e51bf9b9-7b97-4376-876b-fec6e5094577',
      'assets/generated/enemy-ecology/source-boards/level1-hunters-6x8-chroma-v1.png'],
  },
  {
    callId: 'exec-9c32cbfe-d001-49d0-9481-53068e4b1eab',
    role: 'Railfang action A1-A4 large-articulation replacement 1x4',
    workspaceFile: 'assets/generated/enemy-ecology/source-boards/level1-hunters-railfang-action-a1-a4-1x4-chroma-v3.png',
    references: ['ImageGen Railfang articulation revision exec-54c4e636-e970-4342-8b20-54db1bed29ca'],
  },
  {
    callId: 'exec-4b81f8ce-7e93-4e3a-9942-4684fb7abf47', role: 'connector action 3x8',
    workspaceFile: 'assets/generated/enemy-ecology/source-boards/level1-connectors-action-3x8-chroma-v3.png',
    references: ['ImageGen connector revision exec-2ae7a014-f837-48cc-9777-3757f63e9494',
      'assets/generated/sprites/iris-polyp-v2.png',
      'assets/generated/sprites/iris-polyp-action-v2.png',
      'docs/concept-art/07-enemy-combat-readability.png'],
  },
  {
    callId: 'exec-abf066f1-1be5-4d00-abae-1265784dbd3d', role: 'connector body B0-B3 3x4',
    workspaceFile: 'assets/generated/enemy-ecology/source-boards/level1-connectors-body-b0-b3-3x4-chroma-v3.png',
    references: ['ImageGen connector body revision exec-61cf6c36-accc-45fe-9029-0703335c9662',
      'assets/generated/sprites/iris-polyp-v2.png',
      'docs/concept-art/07-enemy-combat-readability.png'],
  },
  {
    callId: 'exec-9f64ce43-bfb7-4447-aca9-558c6cde5524', role: 'connector body B4-B7 3x4',
    workspaceFile: 'assets/generated/enemy-ecology/source-boards/level1-connectors-body-b4-b7-3x4-chroma-v3.png',
    references: ['ImageGen connector body revision exec-61cf6c36-accc-45fe-9029-0703335c9662',
      'assets/generated/sprites/iris-polyp-v2.png',
      'docs/concept-art/07-enemy-combat-readability.png'],
  },
  {
    callId: 'exec-feec26eb-755d-40f5-8f16-2e366f1dcad5', role: 'denial action 3x8',
    workspaceFile: 'assets/generated/enemy-ecology/source-boards/level1-denial-action-3x8-chroma-v2.png',
    references: ['assets/generated/sprites/spore-mortar-v2.png',
      'assets/generated/sprites/spore-mortar-action-v2.png',
      'docs/concept-art/07-enemy-combat-readability.png'],
  },
  {
    callId: 'exec-fc4f4626-fb1b-40d0-903f-b60402811a49', role: 'denial body B0-B3 3x4',
    workspaceFile: 'assets/generated/enemy-ecology/source-boards/level1-denial-body-b0-b3-3x4-chroma-v3.png',
    references: ['assets/generated/enemy-ecology/source-boards/level1-denial-body-3x8-chroma-v2.png',
      'assets/generated/sprites/spore-mortar-v2.png',
      'assets/generated/sprites/spore-mortar-action-v2.png',
      'docs/concept-art/07-enemy-combat-readability.png'],
  },
  {
    callId: 'exec-665a54c0-ef3b-4078-ac5d-9d1735a6fced', role: 'denial body B4-B7 3x4',
    workspaceFile: 'assets/generated/enemy-ecology/source-boards/level1-denial-body-b4-b7-3x4-chroma-v3.png',
    references: ['assets/generated/enemy-ecology/source-boards/level1-denial-body-3x8-chroma-v2.png',
      'assets/generated/sprites/spore-mortar-v2.png',
      'assets/generated/sprites/spore-mortar-action-v2.png',
      'docs/concept-art/07-enemy-combat-readability.png'],
  },
  {
    callId: 'exec-bbb7125d-dd47-4560-b752-13ff12e0dbc3',
    role: 'denial body B5-B6 composed-readability replacement 3x2',
    workspaceFile: 'assets/generated/enemy-ecology/source-boards/level1-denial-body-b5-b6-3x2-chroma-v5.png',
    references: ['assets/generated/enemy-ecology/source-boards/level1-denial-body-b5-b6-3x2-chroma-v4.png',
      'assets/generated/enemy-ecology/source-boards/level1-denial-body-b4-b7-3x4-chroma-v3.png',
      'assets/generated/enemy-ecology/review/level1-enemy-ecology-master-contact-v1.png'],
  },
];

const rejected = [
  ['exec-8fe5828b-f650-418d-acf3-4cd0709c4ce5', 'denial combined v1',
    'baked launcher and chassis together; could not compose independent axes'],
  ['exec-082d1ab1-7455-4522-808f-64277e1c2557', 'denial body v2',
    'attractive sheet contained seven actual rows, not eight'],
  ['exec-c9f28492-b25d-48db-9fda-167be41f1c50', 'connector combined v1',
    'attractive sheet contained six actual rows, not eight'],
  ['exec-2ae7a014-f837-48cc-9777-3757f63e9494', 'connector combined v2',
    'iteration contained seven actual rows, not eight'],
  ['exec-61cf6c36-accc-45fe-9029-0703335c9662', 'connector body v3',
    'split body attempt still contained seven actual rows, replaced by two explicit 3x4 blocks'],
  ['exec-e51bf9b9-7b97-4376-876b-fec6e5094577', 'hunter action A1-A4 replacement v1',
    'pose silhouettes improved, but Railfang and Rebound action cells contained forbidden body cores'],
  ['exec-54c4e636-e970-4342-8b20-54db1bed29ca', 'Railfang action A1-A4 replacement v2',
    'articulation improved, but later-row coupling placement missed the invariant conceptual pivot'],
  ['exec-d61f9525-fb87-4c20-833f-ec63780b0f51', 'denial body B5-B6 replacement v4',
    'Craterpod and Bracketpod remained subtle after action composition; Aircomb B6 read taller/stronger'],
  ['exec-a11ecfee-ae2b-4f5b-bb23-1eb0346c5c10', 'aerial body/action 6x8 v1',
    'structurally valid, but actual 1440x900 play made the dark olive body collapse into a blob and lime wings resemble Scatterbloom projectiles'],
];

const events = new Map();
const lines = createInterface({ input: createReadStream(session), crlfDelay: Infinity });
for await (const line of lines) {
  // Image payloads make an overnight session hundreds of MiB. Skip every
  // unrelated JSONL row before parsing and keep only the tiny terminal event.
  if (!line.includes('"image_generation_end"')) continue;
  const row = JSON.parse(line);
  if (row.type === 'event_msg' && row.payload?.type === 'image_generation_end')
    events.set(row.payload.call_id, row.payload);
}

function eventFor(callId) {
  const event = events.get(callId);
  if (!event?.revised_prompt || !event?.saved_path)
    throw new Error(`missing completed ImageGen event ${callId}`);
  return event;
}

const acceptedRows = accepted.map((row) => {
  const event = eventFor(row.callId);
  return { ...row, generatedOriginal: event.saved_path, exactRevisedPrompt: event.revised_prompt };
});
const rejectedRows = rejected.map(([callId, role, reason]) => {
  const event = eventFor(callId);
  return { callId, role, reason, generatedOriginal: event.saved_path,
    exactRevisedPrompt: event.revised_prompt };
});

writeFileSync(output, JSON.stringify({
  version: 1,
  generator: 'OpenAI ImageGen via imagegen skill',
  extraction: {
    tool: '/Users/scottmeyer/.codex/skills/.system/imagegen/scripts/remove_chroma_key.py',
    args: ['--auto-key', 'border', '--soft-matte', '--transparent-threshold', '12',
      '--opaque-threshold', '180', '--edge-contract', '1', '--despill'],
  },
  policy: 'Original generated files remain in the Codex generated_images directory; accepted copies are project-bound workspace assets. Rejected revisions remain audit evidence and never enter the packed atlas.',
  accepted: acceptedRows,
  rejected: rejectedRows,
}, null, 2) + '\n');

console.log(JSON.stringify({ output, accepted: acceptedRows.length, rejected: rejectedRows.length }, null, 2));
