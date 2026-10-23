#!/usr/bin/env node
/* veil-need.mjs — does the current face's far anatomy veil cover the frame at
 * the camera poses a player actually sits in near a corner? (SPRINT T-107 /
 * T-102 R2, I-102: flat clear-colour voids at the screen edge near corners.)
 *
 *   node tools/simlab/framing/veil-need.mjs [--json out.json]
 *
 * A pure replica, no renderer: each face's far veil is the curved plane
 * src/render/atmosphere.js buildDirectLayer() places (width/depth/curve from
 * src/render/backdrop-depth-plan.js, centred at the face's midpoint plus its
 * authored offset, at the face's ascent altitude + 10.5, feathered at its
 * edge), and the camera is render/camera.js syncCamera() with the lens the
 * page resolves (src/pure/framing.js). For every pose it casts the frame's
 * left and right edge rays (and the corners) and reports how far past the
 * veil's OPAQUE span (inside the feather) each one lands, in tiles; > 0 means
 * that screen edge shows clear colour there. The constants it cannot import
 * (atmosphere.js needs three.js) are read from atmosphere.js's source and the
 * read fails loudly if they move (assertAtmosphereSourceMatches).
 *
 * Poses (per corner k = 1..6, per viewport): `gate` — scroll held at the halt
 * on the departing face (the whole gate fight and the cleared approach);
 * `turn-tNNN` — the ritual clock (both veils are partly lit; reported, the
 * blend owns these frames); `after-sN` — the post-turn catch-up, scroll N
 * tiles past the halt on the new heading, for the shipped halt-point orbit
 * and for ?orbit=joint. At rest only the current face's veil is lit
 * (camera.js cameraFaceBlendGain), so `gate` checks face k and `after-*`
 * checks face k+1.
 *
 * Honest limits: the opaque test ignores the painting's own dark/transparent
 * regions (the far source is opaque, alpha: false) and the mid layer; it is a
 * coverage bound, not a pixel metric — the column metric on real captures
 * (tools/playtest/turn-pose-capture.mjs + void-columns.mjs) is the
 * player-observable check. Dev-only; zero effect on the game.             */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..', '..', '..');
const SRC = join(ROOT, 'src');
const imp = (p) => import('file://' + join(SRC, p));
const { CONFIG } = await imp('config.js');
const FR = await imp('pure/framing.js');
const PATH = await imp('pure/path.js');
const WAVES = await imp('pure/waves.js');
const ASC = await imp('pure/ascent.js');
const PLAN = await imp('render/backdrop-depth-plan.js');
const TABLE = await imp('render/backdrop-table.js');
const { portraitViewDepthMult, traversalCameraDepth } = await imp('pure/traversal.js');

/* ---- constants atmosphere.js owns (three.js module: read, not imported) ---- */
export function atmosphereConstants() {
  const text = readFileSync(join(SRC, 'render', 'atmosphere.js'), 'utf8');
  const ext = text.match(/const FAR_VEIL_EXTEND_TILES = ([\d.]+);/);
  const lift = text.match(/mesh\.position\.y = altitude \+ \(id === 'far' \? ([\d.]+) : ([\d.]+)\);/);
  const feather = text.match(/installDirectEdgeFeather\(material, id === 'far' \? ([\d.]+) : ([\d.]+),\s*id === 'far' \? ([\d.]+) : ([\d.]+)\);/);
  if (!ext || !lift || !feather)
    throw new Error('veil-need: atmosphere.js no longer carries the far-veil constants this replica reads ' +
      `(extend ${!!ext}, lift ${!!lift}, feather ${!!feather}) — re-derive the replica`);
  return { extendTiles: +ext[1], farLift: +lift[1], sideFeather: +feather[1], verticalFeather: +feather[3] };
}
const ATM = atmosphereConstants();
const FAR = PLAN.MERIDIAN_DEPTH_LAYERS.find((l) => l.id === 'far');
const FAR_SRC = PLAN.MERIDIAN_DEPTH_SOURCES.far;

// render/camera.js PORTRAIT_SAFE (drift-guarded by the T-102 pathcheck domain)
const PS = { startAspect: 0.9, fullAspect: 0.56, compactViewDepthMult: 1.15, maxInsetPx: 46, lookDropTiles: 1.55 };
const blend = (w, h) => { const a = w / h; return a >= PS.startAspect ? 0 : Math.min(1, Math.max(0, (PS.startAspect - a) / (PS.startAspect - PS.fullAspect))); };

export function lensFor(w, h, touch, request = null) {
  const aspect = w / h;
  const viewId = request && CONFIG.viewScales[request] ? request : 'far';
  const depth = traversalCameraDepth(CONFIG.camera.z, aspect, CONFIG.camera) *
    portraitViewDepthMult(CONFIG.viewScales[viewId].depthMult, aspect,
      { startAspect: PS.startAspect, fullAspect: PS.fullAspect, compactMult: PS.compactViewDepthMult });
  const lens = FR.framingLens(FR.resolveFramingId(request, w, h, touch, CONFIG), w, h, depth, CONFIG);
  return { depth, fovDeg: lens.fovDeg, liftTiles: lens.liftTiles, id: lens.id, lookDrop: PS.lookDropTiles * blend(w, h) };
}

const STEP = 2 * CONFIG.path.turnDeg * PATH.DEG * CONFIG.path.turnSign;
const L = CONFIG.levelLength;

// render/camera.js syncCamera() for the normal run: eye + basis
export function cameraPose({ scrollX, yaw, lens, orbit = 'halt', k = null, u = 1 }) {
  const C = CONFIG.camera;
  let a;
  if (orbit === 'joint' && k !== null) {
    a = FR.jointOrbitAnchor(PATH.polyAt, PATH.SEGS, scrollX, PATH.CORNER_S[k - 1], CONFIG.path.chamferTiles, u, yaw, { x: 0, z: 0 });
  } else a = PATH.polyAt(PATH.SEGS, scrollX, { x: 0, z: 0 });
  const alt = ASC.normalAscentAltAt(scrollX, L);
  const altAhead = ASC.normalAscentAltAt(scrollX + C.lookX, L);
  const slope = (altAhead - alt) / C.lookX;
  const fx = Math.cos(yaw), fz = -Math.sin(yaw), rx = -fz, rz = fx;
  const eye = [a.x + fx * C.x + rx * lens.depth, C.y + alt + slope * C.x + lens.liftTiles, a.z + fz * C.x + rz * lens.depth];
  const look = [a.x + fx * C.lookX, C.lookY + altAhead - lens.lookDrop + lens.liftTiles, a.z + fz * C.lookX];
  return { eye, basis: FR.lookBasis(eye, look) };
}

// one face's far veil, in world space
export function farVeil(face, extended) {
  const s = TABLE.faceMidS(face, CONFIG);
  const yaw = PATH.headingAt(PATH.SEGS, s);
  const p = PATH.polyAt(PATH.SEGS, s, { x: 0, z: 0 });
  const plan = PLAN.meridianDepthFacePlan(face);
  const halfW = FAR.width / 2;
  const height = FAR.width / (FAR_SRC.canvas[0] / FAR_SRC.canvas[1]);
  const ext = extended ? ATM.extendTiles : 0;
  const total = halfW + ext;
  // the side feather keeps its width in tiles (atmosphere.js scales the
  // fraction by the extended width); the opaque span ends where it starts
  const featherTiles = ATM.sideFeather * FAR.width;
  return {
    face, yaw, halfW, height, ext, total, featherTiles,
    opaqueHalf: total - featherTiles,
    opaqueHalfH: height / 2 - ATM.verticalFeather * height,
    origin: [p.x + Math.cos(yaw) * plan.farOffset + Math.sin(yaw) * FAR.depth,
      ASC.normalAscentAltAt(s, L) + ATM.farLift,
      p.z - Math.sin(yaw) * plan.farOffset + Math.cos(yaw) * FAR.depth],
    curve: FAR.curve, extended,
  };
}

// local plane coordinates of a world point
function toLocal(V, q) {
  const dx = q[0] - V.origin[0], dy = q[1] - V.origin[1], dz = q[2] - V.origin[2];
  return { x: dx * Math.cos(V.yaw) - dz * Math.sin(V.yaw), y: dy, z: dx * Math.sin(V.yaw) + dz * Math.cos(V.yaw) };
}
// The shell's depth at local (x, y). Past the authored 200-tile span the bow
// is held at its edge value: that IS the extended plane, and for the legacy
// plane it locates where an edge ray reaches the veil's depth band (past the
// span it then lands outside the opaque test, i.e. the ray misses the veil).
function surfaceZ(V, x, y) {
  const t = x / V.halfW;
  const bow = Math.abs(t) <= 1 ? t * t : 1;
  return -V.curve * (bow + (y / (V.height / 2)) ** 2 * 0.18);
}

// where the ray through NDC (nx, ny) meets the veil's (infinitely extended)
// surface: local x/y, and how far outside the opaque span (tiles, <= 0 inside)
export function rayHit(pose, lens, aspect, V, nx, ny) {
  const tanY = Math.tan(lens.fovDeg * Math.PI / 360), tanX = tanY * aspect, B = pose.basis;
  const d = [0, 1, 2].map((i) => B.x[i] * nx * tanX + B.y[i] * ny * tanY - B.z[i]);
  const at = (t) => [pose.eye[0] + d[0] * t, pose.eye[1] + d[1] * t, pose.eye[2] + d[2] * t];
  const f = (t) => { const q = toLocal(V, at(t)); return q.z - surfaceZ(V, q.x, q.y); };
  let lo = 0, hi = 2000;
  if (f(lo) < 0 || f(hi) > 0) return { x: Infinity, y: 0, overX: Infinity, overY: 0, miss: true };
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (f(m) > 0) lo = m; else hi = m; }
  const q = toLocal(V, at(hi));
  return { x: q.x, y: q.y, overX: Math.abs(q.x) - V.opaqueHalf, overY: Math.abs(q.y) - V.opaqueHalfH };
}

export function framePoses(k) {
  const halt = PATH.HALT_S[k - 1];
  const out = [{ label: 'gate', k, face: k, scrollX: halt, yaw: (k - 1) * STEP }];
  // the ritual: yaw on the shipped two-snap curve, scroll frozen at the halt
  for (const t of [350, 700]) {
    const yaw = (k - 1) * STEP + WAVES.cornerYawDeltaDeg(t, CONFIG) * PATH.DEG * CONFIG.path.turnSign;
    out.push({ label: `turn-t${t}`, k, face: k + 1, scrollX: halt, yaw, u: (yaw - (k - 1) * STEP) / STEP, during: true });
  }
  for (const ds of [0, 4, 8, 12, 16])
    out.push({ label: `after-s${ds}`, k, face: k + 1, scrollX: halt + ds, yaw: k * STEP, u: 1 });
  return out;
}

export const VIEWPORTS = Object.freeze([
  { id: '1280x720', w: 1280, h: 720, touch: false },
  { id: '1280x800', w: 1280, h: 800, touch: false },
  { id: '844x390 FAR (mouse or ?view=far)', w: 844, h: 390, touch: false },
  { id: '844x390 touch (phone lens)', w: 844, h: 390, touch: true },
  { id: '932x430 touch (phone lens)', w: 932, h: 430, touch: true },
  { id: '667x375 touch (phone lens)', w: 667, h: 375, touch: true },
  { id: '390x844 touch (phone lens)', w: 390, h: 844, touch: true },
]);

// worst overshoot (tiles past the opaque span; <= 0 = covered) per pose
export function coverage({ extended, orbit = 'halt', viewports = VIEWPORTS }) {
  const rows = [];
  for (const vp of viewports) {
    const lens = lensFor(vp.w, vp.h, vp.touch);
    const aspect = vp.w / vp.h;
    for (let k = 1; k <= CONFIG.path.faces; k++) {
      for (const P of framePoses(k)) {
        if (P.face > CONFIG.path.faces + 1) continue;
        const V = farVeil(P.face, extended);
        const pose = cameraPose({ scrollX: P.scrollX, yaw: P.yaw, lens, orbit, k: P.k, u: P.u ?? 1 });
        let left = -Infinity, right = -Infinity, vertical = -Infinity;
        for (const ny of [-1, -0.5, 0, 0.5, 1]) {
          const l = rayHit(pose, lens, aspect, V, -1, ny), r = rayHit(pose, lens, aspect, V, 1, ny);
          // the frame's left edge runs off the veil's LOW-x side, the right
          // edge off its high side; report each against its own boundary
          left = Math.max(left, l.miss ? Infinity : -l.x - V.opaqueHalf);
          right = Math.max(right, r.miss ? Infinity : r.x - V.opaqueHalf);
          for (const h of [l, r]) vertical = Math.max(vertical, h.overY);
        }
        rows.push({ viewport: vp.id, k, label: P.label, face: P.face, during: !!P.during,
          leftOver: +left.toFixed(2), rightOver: +right.toFixed(2), verticalOver: +vertical.toFixed(2) });
      }
    }
  }
  return rows;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const argv = process.argv.slice(2);
  const jsonAt = argv.indexOf('--json');
  const sets = {
    'legacy veil, halt orbit (shipped before T-107)': coverage({ extended: false }),
    'extended veil, halt orbit (T-107 default)': coverage({ extended: true }),
    'extended veil, joint orbit (?orbit=joint)': coverage({ extended: true, orbit: 'joint' }),
  };
  for (const [name, rows] of Object.entries(sets)) {
    console.log(`\n== ${name}`);
    const byVp = new Map();
    for (const r of rows) {
      if (r.during) continue;                        // ritual frames: blend-owned, reported in JSON
      const v = byVp.get(r.viewport) || { worstLeft: -Infinity, worstRight: -Infinity, voids: [] };
      v.worstLeft = Math.max(v.worstLeft, r.leftOver); v.worstRight = Math.max(v.worstRight, r.rightOver);
      if (r.leftOver > 0 || r.rightOver > 0) v.voids.push(`c${r.k}:${r.label}(${r.leftOver > 0 ? 'L' + r.leftOver : ''}${r.rightOver > 0 ? 'R' + r.rightOver : ''})`);
      byVp.set(r.viewport, v);
    }
    for (const [vp, v] of byVp)
      console.log(`${vp.padEnd(34)} worst past the opaque veil: left ${v.worstLeft.toFixed(1)} right ${v.worstRight.toFixed(1)} tiles` +
        (v.voids.length ? ` | uncovered: ${v.voids.slice(0, 8).join(' ')}${v.voids.length > 8 ? ` +${v.voids.length - 8}` : ''}` : ' | covered at every settled pose'));
  }
  if (jsonAt >= 0) writeFileSync(resolve(argv[jsonAt + 1]), JSON.stringify({ tool: 'tools/simlab/framing/veil-need.mjs', atmosphere: ATM, sets }, null, 1));
}
