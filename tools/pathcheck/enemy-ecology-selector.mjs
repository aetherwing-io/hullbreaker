/* Enemy ecology: which body and action frame a hostile shows, and when.
 *
 * The EXECUTED half of the deleted tools/enemy-ecology-render-check.mjs
 * (46b03af), restored by T-120's fix round 1 (review finding 3): batch 5
 * deleted the checker as "PIN-only", but 28 of its 39 assertions ran code.
 * They are the only tests of src/render/enemy-ecology-select.js — what a
 * player reads off a hostile (tell, commit, peak, follow-through, hit,
 * critical, breakup; pillar 5) — plus the drift checks that the generated
 * runtime spec still agrees with the accepted atlas manifest. All pure: the
 * selector, the spec and src/pure/enemy-ecology.js import no three.js.
 *
 * NOT restored: the checker's regex half (its lines 207-end: preload wiring,
 * material flags, presenter seams, death-rig text — source text), nor its
 * exact atlas/vocabulary constants (canvas 3840x1280, 192 / 768), which the
 * manifest and component hashes below already pin to the manifest.
 * Falsified in the fix-round report: a selector that shows EARLY for a tell
 * and a condensation boundary one frame late each turn this domain red.   */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { CONFIG } from '../../src/config.js';
import {
  LEVEL1_NEUTRAL_ECOLOGY_VISUAL, enemyEcologyCondensationStarted, neutralEnemyEcologyVisualId,
} from '../../src/pure/enemy-ecology.js';
import {
  ENEMY_ECOLOGY_COMPONENT_SHA256, ENEMY_ECOLOGY_MANIFEST_SHA256, ENEMY_ECOLOGY_VARIANTS, enemyEcologyVariant,
} from '../../src/render/enemy-ecology-spec.js';
import {
  ECOLOGY_ACTION, ECOLOGY_BODY, enemyEcologyActionIndex, enemyEcologyBodyIndex, enemyEcologyVisualCode,
  selectEnemyEcologyVisual,
} from '../../src/render/enemy-ecology-select.js';
import { ok } from './_context.mjs';

export const title = 'enemy ecology: the frame a hostile shows (selector) and the spec-manifest agreement';

const MANIFEST = new URL('../../assets/generated/enemy-ecology/level1-enemy-ecology-atlas-v1.manifest.json', import.meta.url);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const close = (a, b, epsilon = 1 / 32 + 1e-9) => Math.abs(a - b) <= epsilon;
const row = (overrides = {}) => ({
  id: 1, kind: 'hound', hp: 10, maxHp: 10, state: 'prowl', stateUntil: 0, enterUntil: 0, flashUntil: 0,
  tacticPhase: '', tacticProgress: 0, x: 0, y: 0, t: 0, vx: 0, vy: 0, dir: 1, ...overrides,
});
const componentContract = (c) => ({
  id: c.id, contentSha256: c.contentSha256, cell: c.atlas.cell, visiblePx: c.atlas.visiblePx,
  pivot: c.pivot.cellPx, root: c.sockets.root.cellPx, attack: c.sockets.attack.cellPx,
});

export async function run() {
  const manifestBytes = readFileSync(MANIFEST);
  const manifest = JSON.parse(manifestBytes);
  const CELL = manifest.textureBudget.cellPx;

  /* ---- the generated runtime spec still describes the accepted atlas ---- */
  ok(sha256(manifestBytes) === ENEMY_ECOLOGY_MANIFEST_SHA256 &&
     sha256(JSON.stringify(manifest.components.map(componentContract))) === ENEMY_ECOLOGY_COMPONENT_SHA256,
    'enemy ecology: the generated runtime spec matches the accepted atlas manifest (manifest and component hashes)');
  ok(ENEMY_ECOLOGY_VARIANTS.length === manifest.variants.length && manifest.variants.length > 0,
    `enemy ecology: the spec carries every manifest variant (${ENEMY_ECOLOGY_VARIANTS.length} of ${manifest.variants.length})`);
  ok(same(LEVEL1_NEUTRAL_ECOLOGY_VISUAL, { hound: 'hound-railfang', wasp: '', polyp: 'polyp-needle', mortar: 'mortar-craterpod' }) &&
     neutralEnemyEcologyVisualId('carrier') === '' && neutralEnemyEcologyVisualId('warden') === '',
    'enemy ecology: the visual-only neutral identities hold, and none escapes onto carrier or Warden art');
  const staged = { enterUntil: 9000 };
  ok(!enemyEcologyCondensationStarted(staged, 5999.999, 3000) && enemyEcologyCondensationStarted(staged, 6000, 3000) &&
     !enemyEcologyCondensationStarted({}, 6000, 3000),
    'enemy ecology: a condensing body becomes visible exactly on its first condensation frame, not a frame early');

  const components = new Map(manifest.components.map((entry) => [entry.id, entry]));
  const bad = { identity: [], lookup: [], columns: [], rows: [], packed: [], fit: [] };
  for (let v = 0; v < manifest.variants.length; v++) {
    const authored = manifest.variants[v], spec = ENEMY_ECOLOGY_VARIANTS[v];
    if (!spec || spec.id !== authored.id || spec.family !== authored.family || spec.kind !== authored.kind) { bad.identity.push(authored.id); continue; }
    if (enemyEcologyVariant(spec.id, spec.kind) !== spec || enemyEcologyVariant(spec.id, 'wrong-kind') !== null) bad.lookup.push(spec.id);
    if (spec.bodyColumn !== v * 2 || spec.actionColumn !== v * 2 + 1) bad.columns.push(spec.id);
    if (spec.rows.length !== 8) { bad.rows.push(spec.id); continue; }
    const bodyBounds = [], actionBounds = [];
    for (let i = 0; i < 8; i++) {
      const body = components.get(`${authored.id}-b${i}`), action = components.get(`${authored.id}-a${i}`);
      if (!body || !action) { bad.rows.push(`${authored.id} row ${i}`); continue; }
      const packed = spec.rows[i];
      const expected = [body.sockets.root.cellPx, body.pivot.cellPx, action.pivot.cellPx, action.sockets.attack.cellPx];
      const actual = [packed.bodyRoot, packed.bodyPivot, packed.actionPivot, packed.actionAttack];
      for (let g = 0; g < 4; g++) for (let a = 0; a < 2; a++)
        if (!close(actual[g][a], expected[g][a])) bad.packed.push(`${authored.id} row ${i}`);
      const [rootX, rootY] = body.sockets.root.cellPx, [pivotX, pivotY] = body.pivot.cellPx;
      const [apX, apY] = action.pivot.cellPx;
      const [bx, by, bw, bh] = body.atlas.visiblePx, [ax, ay, aw, ah] = action.atlas.visiblePx;
      const bx0 = bx - body.atlas.cell[0] * CELL, by0 = by - body.atlas.cell[1] * CELL;
      const ax0 = ax - action.atlas.cell[0] * CELL, ay0 = ay - action.atlas.cell[1] * CELL;
      bodyBounds.push([bx0 - rootX, rootY - (by0 + bh), bx0 + bw - rootX, rootY - by0]);
      actionBounds.push([ax0 - apX, apY - (ay0 + ah), ax0 + aw - apX, apY - ay0]);
      bodyBounds[i].compose = [pivotX - rootX, rootY - pivotY];
    }
    if (bodyBounds.length !== 8 || actionBounds.length !== 8) continue;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const bb of bodyBounds) for (const ab of actionBounds) {
      const [dx, dy] = bb.compose;
      minX = Math.min(minX, bb[0], dx + ab[0]); minY = Math.min(minY, bb[1], dy + ab[1]);
      maxX = Math.max(maxX, bb[2], dx + ab[2]); maxY = Math.max(maxY, bb[3], dy + ab[3]);
    }
    if (![minX, minY, maxX, maxY].every((value, k) => close(spec.bounds[k], value, 1e-6))) bad.fit.push(spec.id);
  }
  const list = (a) => (a.length ? ' — ' + [...new Set(a)].slice(0, 6).join(', ') : '');
  ok(!bad.identity.length, 'enemy ecology: every generated variant keeps its manifest id, family and kind' + list(bad.identity));
  ok(!bad.lookup.length, 'enemy ecology: a variant is found by its exact id and kind, and a mismatched sim kind is refused' + list(bad.lookup));
  ok(!bad.columns.length && !bad.rows.length,
    'enemy ecology: each variant keeps its adjacent body/action columns and eight metadata rows' + list([...bad.columns, ...bad.rows]));
  ok(!bad.packed.length, 'enemy ecology: the packed sockets and pivots equal the manifest\'s (within 1/32 px)' + list(bad.packed));
  ok(!bad.fit.length, 'enemy ecology: each variant\'s fixed-fit bounds are the union of its 64 body x action states' + list(bad.fit));

  /* ---- the selector: what the player reads off a hostile, and when ------ */
  const locomotion = [0, 0.2, 0.8].map((x) => enemyEcologyActionIndex(selectEnemyEcologyVisual(row({ x }), 1000)));
  ok(same(locomotion, [0, 1, 6]), `enemy ecology: a hound's locomotion articulates A0 / A1 / A6 (got ${locomotion})`);
  const flight = [0, 0.1, 0.2].map((t) => enemyEcologyActionIndex(selectEnemyEcologyVisual(row({ kind: 'wasp', state: 'cruise', t }), 1000)));
  ok(same(flight, [0, 1, 6]), `enemy ecology: a wasp's flight articulates A0 / A1 / A6 (got ${flight})`);
  const B = ECOLOGY_BODY, A = ECOLOGY_ACTION;
  const ROWS = [
    ['hound tell', row({ state: 'tell' }), B.ACQUIRE, A.TELL],
    ['hound charge early', row({ state: 'charge', stateUntil: 1000 + CONFIG.hound.chargeMs * 0.8 }), B.COMMIT, A.EARLY],
    ['hound vault peak', row({ state: 'vault', stateUntil: 1000 + CONFIG.genome.vaultMs * 0.5 }), B.COMMIT, A.PEAK],
    ['hound vault follow-through', row({ state: 'vault', stateUntil: 1000 + CONFIG.genome.vaultMs * 0.2 }), B.COMMIT, A.FOLLOW],
    ['rebound tell', row({ tacticPhase: 'charge-tell' }), B.ACQUIRE, A.TELL],
    ['rebound reverse vault', row({ tacticPhase: 'reverse-vault', tacticProgress: 0.8 }), B.COMMIT, A.FOLLOW],
    ['crosswind tell', row({ kind: 'wasp', tacticPhase: 'horizontal-line-tell' }), B.ACQUIRE, A.TELL],
    ['crosswind burst', row({ kind: 'wasp', tacticPhase: 'parallel-burst', tacticProgress: 0.7 }), B.COMMIT, A.PEAK],
    ['wasp dive tell', row({ kind: 'wasp', state: 'dive', lockUntil: 1100 }), B.ACQUIRE, A.TELL],
    ['polyp fire early', row({ kind: 'polyp', state: 'fire', stateUntil: 1000 + CONFIG.polyp.beamMs * 0.8 }), B.COMMIT, A.EARLY],
    ['sweepfan tell', row({ kind: 'polyp', tacticPhase: 'bounded-arc-tell' }), B.ACQUIRE, A.TELL],
    ['sweepfan release', row({ kind: 'polyp', state: 'fire', tacticPhase: 'sweep-start', tacticProgress: 0.7 }), B.COMMIT, A.PEAK],
    ['aircomb tell', row({ kind: 'mortar', tacticPhase: 'comb-corridor-tell' }), B.ACQUIRE, A.TELL],
    ['aircomb impact', row({ kind: 'mortar', tacticPhase: 'comb-impact' }), B.COMMIT, A.FOLLOW],
    ['mortar lob early', row({ kind: 'mortar', state: 'lob', podU: 0.2 }), B.COMMIT, A.EARLY],
    // not in the deleted checker: without it a fuse drawn as COMMIT stayed green
    // (only the hit-override row below reached 'fuse', and the flash masks the body)
    ['mortar fuse tell', row({ kind: 'mortar', state: 'fuse' }), B.ACQUIRE, A.TELL],
    ['a hit overrides the state (flash)', row({ kind: 'mortar', state: 'fuse', flashUntil: 1100 }), B.HIT, A.TELL],
    ['critical health overrides the body', row({ kind: 'polyp', state: 'vent', hp: 3, maxHp: 10, stateUntil: 1000 + CONFIG.polyp.ventMs * 0.75 }), B.CRITICAL, A.FOLLOW],
    ['terminal breakup at zero hp', row({ hp: 0 }), B.BREAKUP, A.SPENT],
  ];
  for (const [label, input, body, action] of ROWS) {
    const value = selectEnemyEcologyVisual(input, 1000);
    const gb = enemyEcologyBodyIndex(value), ga = enemyEcologyActionIndex(value);
    ok(gb === body && ga === action, `enemy ecology selector: ${label} shows body ${body} / action ${action} (got ${gb} / ${ga})`);
  }
  ok(enemyEcologyVisualCode(B.BREAKUP, A.SPENT) === 63, 'enemy ecology: terminal B7/A7 stays packed code 63');
}
