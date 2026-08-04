/* ============= ENEMY ECOLOGY TWO-LAYER RUNTIME ================== */
/* The atlas is presentation only. Every bundle consists of eight immutable
   full-cell body quads plus eight immutable full-cell action quads. A live
   actor owns one body mesh and one action child; swapping geometry and moving
   the child to the body's exact compose socket creates all 64 combinations
   without crossfade, canvas work, texture mutation or per-frame allocation. */

import * as THREE from 'three';
import { primitiveBox } from './sprite-table.js';
import { enemyEcologyArtSnapshot, enemyEcologyTexture } from './enemy-ecology-art.js';
import {
  ENEMY_ECOLOGY_ATLAS, ENEMY_ECOLOGY_VARIANTS, enemyEcologyVariant,
} from './enemy-ecology-spec.js';
import {
  ECOLOGY_ACTION, ECOLOGY_BODY, enemyEcologyActionIndex,
  enemyEcologyBodyIndex, enemyEcologyVisualCode, selectEnemyEcologyVisual,
} from './enemy-ecology-select.js';

const CELL = ENEMY_ECOLOGY_ATLAS.cellPx;
const HALF_CELL = CELL / 2;
const ACTION_DEPTH = 0.018;
const bundles = new Map();

function cellGeometry(column, row, worldPerPx, offX, offY, axis, variantId) {
  const geo = new THREE.PlaneGeometry(CELL * worldPerPx, CELL * worldPerPx);
  geo.translate(offX, offY, 0);
  const uv = geo.attributes.uv;
  const u0 = column / ENEMY_ECOLOGY_ATLAS.grid[0];
  const u1 = (column + 1) / ENEMY_ECOLOGY_ATLAS.grid[0];
  const v0 = 1 - (row + 1) / ENEMY_ECOLOGY_ATLAS.grid[1];
  const v1 = 1 - row / ENEMY_ECOLOGY_ATLAS.grid[1];
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    uv.setXY(i, u0 + u * (u1 - u0), v0 + v * (v1 - v0));
  }
  uv.needsUpdate = true;
  geo.userData.enemyEcology = true;
  geo.userData.variantId = variantId;
  geo.userData.axis = axis;
  geo.userData.index = row;
  geo.userData.fullCellUv = true;
  return geo;
}

function buildBundle(spec, tex) {
  const box = primitiveBox(spec.kind);
  if (!box || !tex) return null;
  const [minX, minY, maxX, maxY] = spec.bounds;
  const unionW = Math.max(1, maxX - minX);
  const unionH = Math.max(1, maxY - minY);
  // One fit for the complete 64-state union. SPRITE_BODY_SCALE in the hostile
  // renderer is then the same presentation multiplier ordinary painted actors
  // already receive; neither axis is refit when a state changes.
  const worldPerPx = Math.min(box.w / unionW, box.h / unionH);
  const targetRootX = 0;
  const targetRootY = spec.grounded ? box.cy - box.h / 2 : box.cy;
  const body = [];
  const action = [];
  const compose = [];
  const actionAttack = [];
  for (let row = 0; row < 8; row++) {
    const meta = spec.rows[row];
    const [rootX, rootY] = meta.bodyRoot;
    const [bodyPivotX, bodyPivotY] = meta.bodyPivot;
    const [actionPivotX, actionPivotY] = meta.actionPivot;
    const [attackX, attackY] = meta.actionAttack;
    body.push(cellGeometry(spec.bodyColumn, row, worldPerPx,
      targetRootX + (HALF_CELL - rootX) * worldPerPx,
      targetRootY + (rootY - HALF_CELL) * worldPerPx,
      'body', spec.id));
    // Pivot at the child origin. The selected body row supplies the child's
    // local position below, so the entire body+action assembly mirrors and
    // rolls around the one simulation/root origin.
    action.push(cellGeometry(spec.actionColumn, row, worldPerPx,
      (HALF_CELL - actionPivotX) * worldPerPx,
      (actionPivotY - HALF_CELL) * worldPerPx,
      'action', spec.id));
    actionAttack.push(Object.freeze({
      x: (attackX - actionPivotX) * worldPerPx,
      y: (actionPivotY - attackY) * worldPerPx,
    }));
    compose.push(Object.freeze({
      x: targetRootX + (bodyPivotX - rootX) * worldPerPx,
      y: targetRootY + (rootY - bodyPivotY) * worldPerPx,
    }));
  }
  return Object.freeze({
    spec, tex, box, worldPerPx, targetRootX, targetRootY,
    body: Object.freeze(body), action: Object.freeze(action),
    compose: Object.freeze(compose), actionAttack: Object.freeze(actionAttack),
  });
}

const atlasTexture = enemyEcologyTexture();
if (atlasTexture) for (const spec of ENEMY_ECOLOGY_VARIANTS) {
  const bundle = buildBundle(spec, atlasTexture);
  if (bundle) bundles.set(spec.id, bundle);
}

export function enemyEcologyBundle(id, kind = '') {
  const spec = enemyEcologyVariant(id, kind);
  return spec ? bundles.get(spec.id) || null : null;
}

function applyCode(view, code) {
  if (!view?.ecology || code === view.ecologyCode) return code;
  const body = enemyEcologyBodyIndex(code);
  const action = enemyEcologyActionIndex(code);
  const coupling = view.ecology.compose[body];
  const attack = view.ecology.actionAttack[action];
  view.mesh.geometry = view.ecology.body[body];
  view.ecologyActionMesh.geometry = view.ecology.action[action];
  view.ecologyActionMesh.position.set(coupling.x, coupling.y, ACTION_DEPTH);
  view.ecologyAttackX = coupling.x + attack.x;
  view.ecologyAttackY = coupling.y + attack.y;
  view.ecologyCode = code;
  view.ecologyBodyRow = body;
  view.ecologyActionRow = action;
  view.poseKey = `ecology:${view.ecology.spec.id}:b${body}:a${action}`;
  return code;
}

export function syncEnemyEcologyVisual(view, row, nowMs) {
  if (!view?.ecology) return false;
  applyCode(view, selectEnemyEcologyVisual(row, nowMs));
  return true;
}

export function freezeEnemyEcologyBreakup(view) {
  if (!view?.ecology) return false;
  applyCode(view, enemyEcologyVisualCode(ECOLOGY_BODY.BREAKUP, ECOLOGY_ACTION.SPENT));
  return true;
}

export function enemyEcologyAttackSocketWorld(view, row, out) {
  if (!view?.ecology || !out) return false;
  const localX = view.ecologyAttackX * view.mesh.scale.x;
  const localY = view.ecologyAttackY * view.mesh.scale.y;
  const c = Math.cos(view.mesh.rotation.z), s = Math.sin(view.mesh.rotation.z);
  out.s = row.x + localX * c - localY * s;
  out.y = row.y + view.presentationLift + localX * s + localY * c;
  return true;
}

export function enemyEcologyRuntimeSnapshot() {
  const art = enemyEcologyArtSnapshot();
  return {
    ...art,
    variants: ENEMY_ECOLOGY_VARIANTS.length,
    residentVariants: bundles.size,
    componentGeometries: bundles.size * 16,
    visualCombinations: bundles.size * 64,
    quadsPerLiveEnemy: 2,
    extraDrawsPerLiveEnemy: 1,
    actionDepth: ACTION_DEPTH,
    fullCellUv: true,
    crossfade: false,
    sharedRootAssembly: true,
    fixedUnionFit: true,
    breakupCode: enemyEcologyVisualCode(ECOLOGY_BODY.BREAKUP, ECOLOGY_ACTION.SPENT),
  };
}

if (typeof globalThis !== 'undefined')
  globalThis.__HB_ENEMY_ECOLOGY_RUNTIME = enemyEcologyRuntimeSnapshot;
