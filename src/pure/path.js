import { CONFIG } from '../config.js';

/* ============================= PATH =============================== */
/* Pure polyline math for the hexagonal tower. Gameplay simulates in
   logical coords (s = distance along the level in tiles, y = height);
   only rendering maps s → world via these. No three.js, no DOM. */

export const DEG = Math.PI / 180;

export function cornerSList(cfg) {
  const out = [];
  for (let k = 1; k <= cfg.path.faces; k++) out.push(cfg.path.introTiles + cfg.path.faceTiles * k);
  return out;
}

export function haltSFor(cornerS, cfg) { return cornerS - cfg.waves.haltOffset; }

// face index of a distance s: 0 = intro, 1..faces = tower faces, faces+1 = outro
export function faceIndexAt(s, cfg) {
  const p = cfg.path;
  if (s < p.introTiles) return 0;
  return Math.min(Math.floor((s - p.introTiles) / p.faceTiles) + 1, p.faces + 1);
}

// segment table: sharp polyline with a 2-tile chamfer (two turnDeg bends)
// at every corner. Headings sum to a full 360° circuit after 6 corners.
export function buildSegments(cfg) {
  const turn = cfg.path.turnDeg * DEG * cfg.path.turnSign;
  const segs = [{ s0: 0, x: 0, z: 0, heading: 0 }];
  for (const cs of cornerSList(cfg)) {
    for (const bs of [cs, cs + cfg.path.chamferTiles]) {
      const prev = segs[segs.length - 1];
      const len = bs - prev.s0;
      segs.push({
        s0: bs,
        x: prev.x + Math.cos(prev.heading) * len,
        z: prev.z - Math.sin(prev.heading) * len,
        heading: prev.heading + turn,
      });
    }
  }
  return segs;
}

export function segAt(segs, s) {
  for (let i = segs.length - 1; i >= 0; i--) if (s >= segs[i].s0) return segs[i];
  return segs[0];
}

export function polyAt(segs, s, out = { x: 0, z: 0 }) { // s → world position at height 0;
  const g = segAt(segs, s);                      //   out-param lets per-frame callers
  const d = s - g.s0;                            //   reuse one scratch (no GC churn)
  out.x = g.x + Math.cos(g.heading) * d;
  out.z = g.z - Math.sin(g.heading) * d;
  return out;
}

export function headingAt(segs, s) { return segAt(segs, s).heading; }   // sharp, per segment

// blended heading for dynamic entities: smoothstep each bend's turn over
// ±blend tiles so rigs don't pop 30° when crossing a bend column.
export function yawAt(segs, s, blend) {
  if (!(blend > 0)) return headingAt(segs, s);
  let yaw = segs[0].heading;
  for (let i = 1; i < segs.length; i++) {
    if (s <= segs[i].s0 - blend) break;        // segs sorted by s0: later bends add 0
    const d = segs[i].heading - segs[i - 1].heading;
    const u = Math.min(1, Math.max(0, (s - (segs[i].s0 - blend)) / (2 * blend)));
    yaw += d * u * u * (3 - 2 * u);
  }
  return yaw;
}

export const CORNER_S = cornerSList(CONFIG);            // [89, 154, 219, 284, 349, 414]
export const SEGS = buildSegments(CONFIG);
export const HALT_S = CORNER_S.map((cs) => haltSFor(cs, CONFIG));
