/* ================= ACTOR MOTION RUNTIME ========================== */
/* Generic, allocation-free selection and geometry for ACTOR_MOTION_SPEC.
   Kind-specific render branches are intentionally absent: rules select a
   clip, progress selects a beat, and named sockets follow that frame. */

import * as THREE from 'three';
import { primitiveBox } from './sprite-table.js';
import { actorMotionTexture } from './actor-motion-art.js';
import { applySpriteUnderside } from './sprite-grounding.js';
import {
  ACTOR_MOTION_ATLASES, ACTOR_MOTION_KINDS, ACTOR_MOTION_SPEC,
} from './actor-motion-spec.js';

function predicateMatches(row, predicate) {
  const value = row[predicate.field];
  if ('eq' in predicate && value !== predicate.eq) return false;
  if ('ltField' in predicate && !(value < row[predicate.ltField])) return false;
  return true;
}

function ruleMatches(row, rule) {
  for (let i = 0; i < rule.when.length; i++)
    if (!predicateMatches(row, rule.when[i])) return false;
  return true;
}

function uvGeometry(q, cell, canvas) {
  const geo = new THREE.PlaneGeometry(q.w, q.h);
  geo.translate(q.offX, q.offY, 0);
  const [x, y, w, h] = cell;
  const [atlasW, atlasH] = canvas;
  const u0 = x / atlasW, u1 = (x + w) / atlasW;
  const v0 = 1 - (y + h) / atlasH, v1 = 1 - y / atlasH;
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    uv.setXY(i, u0 + u * (u1 - u0), v0 + v * (v1 - v0));
  }
  uv.needsUpdate = true;
  return geo;
}

function buildBundle(kind) {
  const spec = ACTOR_MOTION_SPEC[kind];
  const tex = actorMotionTexture(kind);
  const box = primitiveBox(kind);
  if (!spec || !tex || !box) return null;
  const atlas = ACTOR_MOTION_ATLASES[spec.atlas];
  const [cellW, cellH] = atlas.cell;
  const scale = box.w / spec.referenceInkWidth;
  const targetX = box.cx;
  const targetY = box.cy - box.h / 2;
  const frames = [];
  const frameByName = Object.create(null);
  for (const def of spec.frames) {
    const [anchorX, anchorY] = def.anchor;
    const q = {
      w: cellW * scale, h: cellH * scale,
      offX: targetX - (anchorX - cellW / 2) * scale,
      offY: targetY - (cellH / 2 - anchorY) * scale,
    };
    const col = def.index % atlas.grid[0];
    const row = Math.floor(def.index / atlas.grid[0]);
    const geo = uvGeometry(q, [col * cellW, row * cellH, cellW, cellH], atlas.canvas);
    // Crown owns its own presentation lane.  It receives a white identity
    // attribute only because the shared sprite material supports vertex color;
    // the ordinary Hound alone receives the underside ramp.
    applySpriteUnderside(geo, kind === 'warden' ? 1 : 0.79);
    geo.userData.actorMotionKind = kind;
    geo.userData.actorMotionFrame = def.index;
    const localSockets = Object.create(null);
    for (const [name, socket] of Object.entries(def.sockets)) {
      localSockets[name] = Object.freeze({
        x: targetX + (socket[0] - anchorX) * scale,
        y: targetY + (anchorY - socket[1]) * scale,
      });
    }
    const built = Object.freeze({
      index: def.index, name: def.name, geo,
      sockets: Object.freeze(localSockets),
    });
    frames.push(built);
    frameByName[def.name] = built;
  }
  const selection = { frame: null, clip: '', marker: '', event: '', progress: 0 };
  return Object.freeze({
    kind, spec, tex, box, scale,
    frames: Object.freeze(frames), frameByName: Object.freeze(frameByName),
    selection,
  });
}

const bundles = new Map();
for (const kind of ACTOR_MOTION_KINDS) {
  const bundle = buildBundle(kind);
  if (bundle) bundles.set(kind, bundle);
}

export function actorMotionBundle(kind) { return bundles.get(kind) || null; }

function selectClip(bundle, clipName, progress) {
  if (!bundle) return null;
  const chosen = clipName && bundle.spec.clips[clipName];
  if (!chosen) return null;
  progress = Math.max(0, Math.min(1, progress));
  let beatDef = chosen.beats[chosen.beats.length - 1];
  for (let i = 0; i < chosen.beats.length; i++) {
    if (progress <= chosen.beats[i].until) { beatDef = chosen.beats[i]; break; }
  }
  const frameDef = bundle.frameByName[beatDef.frame];
  if (!frameDef) return null;
  const out = bundle.selection;
  out.frame = frameDef;
  out.clip = clipName;
  out.marker = chosen.marker;
  out.event = beatDef.event;
  out.progress = progress;
  return out;
}

export function selectActorMotion(bundle, row, nowMs) {
  if (!bundle) return null;
  const { spec } = bundle;
  let clipName = spec.states[row.state] || null;
  for (let i = 0; i < spec.rules.length; i++) {
    const rule = spec.rules[i];
    if (ruleMatches(row, rule)) { clipName = rule.clip; break; }
  }
  const chosen = clipName && spec.clips[clipName];
  if (!chosen) return null;
  let progress = 1;
  if (chosen.durationMs > 0 && Number.isFinite(row.stateUntil))
    progress = 1 - Math.max(0, Math.min(1, (row.stateUntil - nowMs) / chosen.durationMs));
  return selectClip(bundle, clipName, progress);
}

// Presentation-only lifecycle beats (arrival and terminal rupture) have no
// simulation state and therefore no stateUntil.  The renderer supplies their
// already-computed normalized progress here; selection still reuses the same
// bundle-local result object as ordinary combat states.
export function selectActorMotionClip(bundle, clipName, progress) {
  return selectClip(bundle, clipName, progress);
}

export function actorMotionSocket(bundle, frameIndex, name) {
  if (!bundle) return null;
  for (let i = 0; i < bundle.frames.length; i++) {
    const frame = bundle.frames[i];
    if (frame.index === frameIndex) return frame.sockets[name] || null;
  }
  return null;
}

export function actorMotionRuntimeSnapshot() {
  const kinds = {};
  let geometries = 0;
  for (const kind of ACTOR_MOTION_KINDS) {
    const bundle = bundles.get(kind);
    kinds[kind] = {
      ready: !!bundle,
      atlas: ACTOR_MOTION_SPEC[kind].atlas,
      frames: bundle?.frames.length || 0,
      onePaintedBodyMesh: true,
      immutablePreload: true,
      fallback: ACTOR_MOTION_SPEC[kind].fallback,
    };
    geometries += bundle?.frames.length || 0;
  }
  return { kinds, geometries, textures: new Set([...bundles.values()].map((b) => b.tex)).size };
}
