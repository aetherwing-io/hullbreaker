// rig-arm-surgery.mjs — T-103: take the painted ARMS out of RIG's body frames
// and hand them to the runtime as two re-poseable strips.
//
// Why this exists. Every painted RIG pose (idle, run, rise/fall, the four aim
// elevations, the four climb beats) has its hands at chest or shoulder height:
// fists pumping, arms extended pistol-style at the shoulder, or reaching for a
// rung. The simulation fires from a hand socket at (0, CONFIG.player.muzzleY)
// = hip height, 0.82 tiles behind the muzzle, and that socket is gameplay
// truth (T-103's task block). No re-anchoring of a painted frame can move a
// hand that is 0.5-0.6 tiles above the socket down onto the grip without
// sinking the boots through the deck, so the gun read as floating under the
// fists in every pose (reports/tasks/T-103/build.md, "Root cause").
//
// The fix is the classic cut-out answer, built ONLY from pixels that already
// exist — nothing here generates or redraws art:
//   1. ERASE the parts of the painted arms that stick out past the torso
//      (forearms, fists, a far arm swinging behind the back);
//   2. PATCH the few places where a painted forearm crossed in front of the
//      chest by cloning the painting's own neighbouring torso pixels over it
//      (a straight 1:1 copy from a stated offset — no blur, no synthesis);
//   3. CUT the near arm out of the `aim/right` painting (where it is straight
//      and fully visible) into two strips — upper arm and forearm+fist — and
//      copy them 1:1 into the body atlas's unused cell 6. src/render/player.js
//      bends those strips with a two-bone solve so the fist lands on the
//      weapon's painted grip in every pose, aim direction, facing and chassis.
//
// Polygons are atlas pixel coordinates (top-left origin), sampled at pixel
// centres with an even-odd rule. Everything is deterministic and re-runnable:
// `node tools/assets/repack-rig-slender.mjs` rebuilds all three atlases from
// their source boards and applies this file last.

export const ARM_SURGERY_VERSION = 1;

// ---------------------------------------------------------------- strips ---
// Source: the aim atlas `right` cell, whose near arm is straight and drawn
// over transparent background from the elbow out. Target: body atlas cell 6
// (x 1024..1535, y 512..1023), unused by any pose. 1:1 copy, so the strip
// keeps the aim painting's texel density (RIG_AIM_WORLD_PER_PIXEL).
export const ARM_STRIP_SOURCE = 'rig-slender-aim-atlas-v2';
export const ARM_STRIP_TARGET = 'rig-slender-body-atlas-v2';
export const ARM_STRIPS = Object.freeze([
  Object.freeze({
    name: 'upper',
    // upper-arm plate + elbow knob; the shoulder pad itself stays painted on
    // every body frame and covers the pivot.
    poly: [[226, 377], [238, 371], [256, 373], [268, 381], [282, 391], [285, 403],
      [279, 414], [265, 419], [250, 413], [234, 407], [225, 397]],
    offset: [848, 196],
  }),
  Object.freeze({
    name: 'fore',
    // elbow knob -> forearm plate -> wrist cuff -> closed fist
    poly: [[264, 391], [277, 381], [300, 381], [326, 378], [346, 377], [351, 370],
      [373, 371], [382, 380], [383, 409], [375, 419], [347, 419], [326, 414],
      [300, 409], [280, 412], [266, 409]],
    offset: [808, 312],
  }),
]);

// ----------------------------------------------------------- per frame ----
// `erase`: polygons made fully transparent. `patch`: polygons overwritten by
// the same painting's pixels at (x + from[0], y + from[1]) — only opaque
// source pixels are copied, so a patch can never grow the silhouette.
export const ARM_SURGERY = Object.freeze({
  'rig-slender-body-atlas-v2': Object.freeze({
    // fists held in front of the chest; the cut follows the chest plate
    idle: { erase: [[[277, 186], [332, 186], [332, 236], [269, 236], [271, 222], [275, 208]]], patch: [] },
    // forward forearm + fist, cut along the chest's front edge
    contact: { erase: [[[822, 196], [870, 196], [870, 244], [806, 244], [807, 232], [812, 224],
      [816, 212], [820, 205]]], patch: [] },
    // forward fist; the far elbow knob poking out behind the back
    pass: { erase: [[[1314, 212], [1356, 212], [1356, 252], [1303, 252], [1305, 240], [1309, 228]],
      [[1258, 202], [1271, 202], [1271, 217], [1258, 217]]], patch: [] },
    // forward fist; the near arm swinging behind the back
    flight: { erase: [[[1852, 206], [1898, 204], [1898, 248], [1848, 248], [1849, 232], [1851, 218]],
      [[1766, 200], [1797, 200], [1795, 215], [1793, 235], [1795, 262], [1766, 262]]], patch: [] },
    // arms flung back and forward
    'air-rise': { erase: [[[166, 688], [240, 682], [250, 700], [214, 758], [166, 758]],
      [[298, 700], [348, 700], [348, 744], [294, 744], [294, 725]]], patch: [] },
    // forward arm reaching up past the chin; back arm trailing past the hip
    'air-fall': { erase: [[[812, 694], [830, 690], [848, 678], [870, 668], [882, 672], [882, 704],
      [862, 712], [844, 720], [822, 723], [811, 714]],
    [[744, 706], [758, 710], [750, 726], [744, 742], [738, 752], [738, 773], [712, 773], [712, 740],
      [730, 722]]], patch: [] },
  }),
  'rig-slender-aim-atlas-v2': Object.freeze({
    // extended pistol arms; the upper arm across the chest is replaced by the
    // painting's own abdomen plates cloned 50 px up
    right: {
      erase: [[[280, 362], [392, 356], [392, 428], [296, 428], [282, 420]]],
      patch: [{ poly: [[224, 368], [262, 366], [281, 386], [284, 412], [276, 421],
        [240, 417], [222, 401]], from: [0, 50] }],
    },
    // retired from play (their raised arms cover the helmet/chest and cannot
    // be removed without inventing the face behind them) — left untouched
    'up-right': { erase: [], patch: [] },
    up: { erase: [], patch: [] },
    // braced crouch: both forearms past the chest front, and the far upper arm
    // that showed between chin and shoulder
    'down-right': {
      erase: [[[1834, 400], [1880, 398], [1968, 425], [1968, 503], [1905, 505], [1868, 493],
        [1842, 478], [1830, 470], [1827, 450], [1830, 425]]],
      patch: [],
    },
  }),
  'rig-slender-climb-atlas-v2': Object.freeze({
    // the near arm keeps climbing; the far forearm/fist at the chest goes
    'left-reach': { erase: [[[313, 396], [342, 392], [350, 381], [376, 379], [381, 384], [381, 413], [352, 415],
      [328, 416], [312, 414]]], patch: [] },
    'left-drive': { erase: [], patch: [] },
    'right-reach': { erase: [[[1258, 398], [1288, 394], [1292, 388], [1322, 388], [1324, 428],
      [1290, 428], [1262, 424], [1256, 412]]], patch: [] },
    'right-drive': { erase: [], patch: [] },
  }),
});

// Even-odd point-in-polygon at a pixel centre.
function inside(poly, px, py) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function bounds(poly) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return { x0: Math.floor(x0), y0: Math.floor(y0), x1: Math.ceil(x1), y1: Math.ceil(y1) };
}

export function polygonPixels(poly, width, height, cell = null) {
  const b = bounds(poly);
  const out = [];
  for (let y = Math.max(0, b.y0); y <= Math.min(height - 1, b.y1); y++) {
    for (let x = Math.max(0, b.x0); x <= Math.min(width - 1, b.x1); x++) {
      if (cell && (x < cell.x || x >= cell.x + cell.w || y < cell.y || y >= cell.y + cell.h)) continue;
      if (inside(poly, x + 0.5, y + 0.5)) out.push(x, y);
    }
  }
  return out;
}

// Apply one pose's erase/patch list in place. Patches read from a snapshot of
// the atlas taken BEFORE any edit, so the result never depends on op order.
export function applyPoseSurgery(rgba, width, height, cell, ops) {
  const before = Uint8Array.from(rgba);
  let erased = 0, patched = 0;
  for (const { poly, from } of ops.patch || []) {
    const px = polygonPixels(poly, width, height, cell);
    for (let i = 0; i < px.length; i += 2) {
      const x = px[i], y = px[i + 1];
      const sx = x + from[0], sy = y + from[1];
      if (sx < cell.x || sx >= cell.x + cell.w || sy < cell.y || sy >= cell.y + cell.h) continue;
      const si = (sy * width + sx) * 4, di = (y * width + x) * 4;
      if (before[si + 3] < 250) continue;          // never grow the silhouette
      rgba[di] = before[si]; rgba[di + 1] = before[si + 1];
      rgba[di + 2] = before[si + 2]; rgba[di + 3] = before[si + 3];
      patched++;
    }
  }
  for (const poly of ops.erase || []) {
    const px = polygonPixels(poly, width, height, cell);
    for (let i = 0; i < px.length; i += 2) {
      const di = (px[i + 1] * width + px[i]) * 4;
      if (rgba[di + 3] === 0 && rgba[di] === 0 && rgba[di + 1] === 0 && rgba[di + 2] === 0) continue;
      rgba[di] = 0; rgba[di + 1] = 0; rgba[di + 2] = 0; rgba[di + 3] = 0;
      erased++;
    }
  }
  return { erased, patched };
}

// Copy each strip polygon 1:1 from the source atlas into the target atlas and
// report the target-space alpha box (what src/pure/rig.js must declare).
export function copyArmStrips(src, srcW, srcH, dst, dstW, dstH) {
  const report = [];
  for (const strip of ARM_STRIPS) {
    const px = polygonPixels(strip.poly, srcW, srcH);
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1, copied = 0;
    for (let i = 0; i < px.length; i += 2) {
      const sx = px[i], sy = px[i + 1];
      const si = (sy * srcW + sx) * 4;
      if (src[si + 3] === 0) continue;
      const tx = sx + strip.offset[0], ty = sy + strip.offset[1];
      if (tx < 0 || tx >= dstW || ty < 0 || ty >= dstH) throw new Error(`arm strip ${strip.name} leaves the target atlas`);
      const di = (ty * dstW + tx) * 4;
      dst[di] = src[si]; dst[di + 1] = src[si + 1]; dst[di + 2] = src[si + 2]; dst[di + 3] = src[si + 3];
      x0 = Math.min(x0, tx); y0 = Math.min(y0, ty); x1 = Math.max(x1, tx); y1 = Math.max(y1, ty);
      copied++;
    }
    report.push({ name: strip.name, offset: strip.offset, copied,
      alpha: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } });
  }
  return report;
}
