#!/usr/bin/env node
/* gate-view.mjs — can the player SEE every body a gate makes them kill?
 *
 *   node tools/simlab/race/gate-view.mjs     # prints a table, writes artifacts/t104-race/gate-view.json
 *
 * Static check, no simulation stepped. For every authored gate row of the
 * six-face run (src/pure/level1-ecology-encounters.js, resolved through the
 * live Vertical Assault staging sockets exactly as src/sim/wavegate.js does
 * for wasps / polyps / mortars — the socket's x; rooted peers sharing a socket
 * are spread ±0.8 tiles around it) it reports where the body stands and
 * whether that x lies inside the view the player has while the gate holds the
 * scroll at HALT_S (scrollX = halt, so the view is [halt + EDGE_L,
 * halt + EDGE_R] from ./edges.mjs) for each lab viewport.
 *
 * A gate beat must be cleared before the next beat condenses; a body outside
 * the held view can only be found by luck, so the gate waits for
 * LEVEL1_ECOLOGY_BEAT_LOCK_MS (300 s). Hounds are resolved to the deck run
 * nearest their socket at spawn, so their x here is the socket's.
 *
 * It also reports visible bodies that stand within NEAR_PLANE_TILES of the
 * left edge: inside the view, but fought with RIG's back to the damage plane.
 *
 * T-201: this models the HELD gate, which is now the `?gates=legacy` escape
 * hatch. The default rolling corner holds no view; its bodies are staged
 * against the live view when their beat is released, and the played
 * successor of this check is ./stage-view.mjs over a lab baseline (plus the
 * projected-frame check in ../lib/turn-proof.mjs).                         */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIEWPORTS, viewportEdges } from './edges.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..', '..', '..');
const SRC = join(ROOT, 'src');
globalThis.__HB_QUERY__ = '';
const { CONFIG } = await import('file://' + join(SRC, 'config.js'));
const PATH = await import('file://' + join(SRC, 'pure', 'path.js'));
const ECO = await import('file://' + join(SRC, 'pure', 'level1-ecology-encounters.js'));
const WAVES = await import('file://' + join(SRC, 'pure', 'waves.js'));
const LV = await import('file://' + join(SRC, 'sim', 'level.js'));

// A visible body this close to the left edge is fought with the player's back
// against the damage plane (bots: Table M7b in the proposal).
const NEAR_PLANE_TILES = 6;
const views = Object.fromEntries(Object.entries(VIEWPORTS).map(([id, v]) => [id, viewportEdges(v.width, v.height, CONFIG, v.rigFraction)]));
const rows = [];
for (let k = 1; k <= CONFIG.path.faces; k++) {
  const halt = PATH.HALT_S[k - 1];
  const assault = (LV.levelData.assaults || []).find((a) => a.face === k);
  const n = WAVES.waveSize(k, CONFIG);
  for (let i = 0; i < n; i++) {
    const row = ECO.level1EcologyEncounterRow(k, i);
    if (!row) continue;
    const socket = assault?.staging?.find((s) => s.role === row.stageRole) || null;
    const x = socket ? socket.x : null;
    const inView = {};
    for (const [id, e] of Object.entries(views)) {
      const lo = halt + e.left, hi = halt + e.right;
      inView[id] = x === null ? null : {
        inside: x >= lo + 0.5 && x <= hi - 0.5,
        tilesOutside: x < lo ? +(lo - x).toFixed(2) : x > hi ? +(x - hi).toFixed(2) : 0,
        side: x < lo ? 'behind the damage plane' : x > hi ? 'past the right edge' : 'visible',
        // how much room a player has between this body and the damage plane
        tilesFromDamagePlane: +(x - lo).toFixed(2),
      };
    }
    rows.push({ gate: k, slot: i, beat: row.beat, kind: row.kind, ecologyId: row.ecologyId,
      stageRole: row.stageRole, socketX: x, halt, inView });
  }
}
const summary = Object.fromEntries(Object.keys(views).map((id) => {
  const bad = rows.filter((r) => r.inView[id] && !r.inView[id].inside);
  const inside = rows.filter((r) => r.inView[id] && r.inView[id].inside);
  const near = inside.filter((r) => r.inView[id].tilesFromDamagePlane < NEAR_PLANE_TILES);
  return [id, { bodiesOutsideHeldView: bad.length, of: rows.length,
    gates: [...new Set(bad.map((r) => r.gate))],
    firstBeatOutside: bad.filter((r) => r.beat === 0).map((r) => `${r.gate}:${r.ecologyId}`),
    minTilesFromDamagePlane: inside.length ? Math.min(...inside.map((r) => r.inView[id].tilesFromDamagePlane)) : null,
    [`insideButWithin${NEAR_PLANE_TILES}OfDamagePlane`]: near.map((r) => `${r.gate}:${r.ecologyId}@${r.inView[id].tilesFromDamagePlane}`) }];
}));
const out = resolve(ROOT, 'artifacts/t104-race');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'gate-view.json'), JSON.stringify({ tool: 'tools/simlab/race/gate-view.mjs', summary, rows }, null, 1));
console.log('gate row visibility while the scroll is held at HALT_S');
for (const [id, s] of Object.entries(summary))
  console.log(`  ${id.padEnd(16)} ${s.bodiesOutsideHeldView}/${s.of} gate bodies outside the held view; gates ${JSON.stringify(s.gates)}; beat-0 outside: ${JSON.stringify(s.firstBeatOutside)}`);
console.log(`visible gate bodies standing < ${NEAR_PLANE_TILES} tiles from the damage plane while the gate holds the scroll`);
for (const [id, s] of Object.entries(summary))
  console.log(`  ${id.padEnd(16)} nearest ${s.minTilesFromDamagePlane} tiles; ${s[`insideButWithin${NEAR_PLANE_TILES}OfDamagePlane`].length} bodies: ${s[`insideButWithin${NEAR_PLANE_TILES}OfDamagePlane`].join(', ') || '—'}`);
for (const r of rows.filter((r) => Object.values(r.inView).some((v) => v && !v.inside)))
  console.log(`  gate ${r.gate} beat ${r.beat} ${r.ecologyId.padEnd(18)} socket x ${r.socketX} (halt ${r.halt}): ` +
    Object.entries(r.inView).filter(([, v]) => v && !v.inside).map(([id, v]) => `${id} ${v.tilesOutside} tiles ${v.side}`).join('; '));
