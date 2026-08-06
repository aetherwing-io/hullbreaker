/* ======================= HOSTILE SPRITE TABLE ===================== */
/* The Node-safe half of the runtime sprite path (T-049): which image stands
   for which hostile kind, how big the drawn art actually is inside its
   canvas, and the arithmetic that turns those two facts into a world-space
   quad. No three.js and no DOM in this file on purpose — the same reason
   src/render/palette.js and src/render/legibility.js are Node-safe: the
   part that can lie about SIZE is the part a headless gate must be able to
   check (tools/pathcheck/t-049-hostile-sprites.mjs re-measures every number
   below straight out of the PNG).

   decisions.md entry 16 authorized runtime assets and named the condition:
   a failed or missing asset degrades to the primitive body, and the SIM
   never learns which one drew. Nothing in this file is reachable from
   src/sim/ or src/pure/, and nothing here is a gameplay value: every box
   below is derived from the CONFIG box the primitive mesh already drew.

   THE ONE RULE THE SIZING ENCODES. A generated sprite does not fill its
   canvas — a wasp's art covers 94% x 88% of a 32x32 PNG. Sizing from the
   canvas silently shrinks the useful ink, while independently fitting ink
   width and height silently stretches the painting. So the opaque bounding
   box is uniformly contained by the primitive envelope, one scale on both
   axes, and the quad grows from that scale only to retain the authored
   transparent margin. The render layer may then apply one explicit uniform
   presentation scale to the complete cutout; collision stays unchanged.   */

import { CONFIG } from '../config.js';

// Where the art lives, relative to THIS module (src/render/). The loader
// resolves it with `new URL(..., import.meta.url)`, which is a RUNTIME
// reference and not a static import: the game still parses and boots with
// the whole assets/ tree deleted (tools/assets/check.mjs enforces that
// distinction, and the fallback below is what makes it true in play).
export const SPRITE_ROOT = '../../assets/generated/sprites/';

/* The roster. `canvas` is the PNG's own size; `ink` is the opaque bounding
   box inside it as [x, y, w, h] in texels. Both are MEASURED (from
   assets/generated/sprites/*.png, decoded by tools/assets/lib/png.mjs) and
   re-measured from each PNG source master by pathcheck — a number here that stops matching the file is
   a failed gate, not a silently wrong quad.

   Two candidates per role, from T-046's batch: `a` is the bold single-mass
   read, `b` carries board 06's plates/legs with a value break. `b` ships
   (see DEFAULT_VARIANT); ?spritevar=a is the operator's A/B.             */
export const SPRITE_ART = {
  hound: {
    a: { file: 'hound-brace-a.png', canvas: [64, 32], ink: [4, 2, 58, 30] },
    b: { file: 'houndframe-v2.png', canvas: [590, 313], ink: [24, 24, 542, 265] },
  },
  carrier: {
    a: { file: 'carrier-hauler-a.png', canvas: [64, 32], ink: [2, 0, 60, 32] },
    b: { file: 'carrier-hauler-v2.png', canvas: [586, 368], ink: [24, 24, 538, 320] },
  },
  wasp: {
    a: { file: 'wasp-drone-a.png', canvas: [32, 32], ink: [2, 2, 28, 24] },
    // Pixel-authored at the size the FAR camera actually samples. The old
    // 460px painting became a pale claw after 12:1 minification; this 128px
    // card keeps one dark body mass, an acid head and articulated wings.
    b: { file: 'wasp-pixel-v1/wasp-pixel-idle-v1.png',
      canvas: [128, 128], ink: [13, 51, 102, 57] },
  },
  polyp: {
    a: { file: 'polyp-iris-a.png', canvas: [64, 64], ink: [4, 4, 58, 58] },
    b: { file: 'iris-polyp-v2.png', canvas: [429, 410], ink: [24, 24, 381, 362] },
  },
  mortar: {
    a: { file: 'mortar-tripod-a.png', canvas: [64, 64], ink: [0, 2, 64, 60] },
    b: { file: 'spore-mortar-v2.png', canvas: [498, 458], ink: [24, 24, 450, 410] },
  },
  // The Warden has one production master rather than an A/B pair. Both
  // selector ids resolve to it so the global ?spritevar= diagnostic remains
  // legal without inventing a low-quality alternate for the centerpiece.
  warden: {
    a: { file: 'crown-warden-v1.webp', sourceFile: 'crown-warden-v1.png',
      canvas: [1672, 941], ink: [145, 17, 1413, 890] },
    b: { file: 'crown-warden-v1.webp', sourceFile: 'crown-warden-v1.png',
      canvas: [1672, 941], ink: [145, 17, 1413, 890] },
  },
};

// A second authored pose for each production role. These are never selected
// by a timer on their own: hostiles.js swaps them only while the matching sim
// state is true (dive, charge, tell/arming, or the carrier's actual bob phase).
// The geometry is measured independently because an action silhouette is not
// forced through the idle crop's aspect ratio.
export const SPRITE_ACTION_ART = {
  hound:  { file: 'houndframe-action-v2.png', canvas: [666, 302], ink: [24, 24, 618, 254] },
  carrier:{ file: 'carrier-hauler-action-v2.png', canvas: [590, 397], ink: [24, 24, 542, 349] },
  wasp:   { file: 'wasp-pixel-v1/wasp-pixel-dive-v1.png',
    canvas: [128, 128], ink: [19, 31, 84, 58] },
  polyp:  { file: 'iris-polyp-action-v2.png', canvas: [421, 399], ink: [24, 24, 373, 351] },
  mortar: { file: 'spore-mortar-action-v2.webp', sourceFile: 'spore-mortar-action-v2.png',
    canvas: [499, 449], ink: [24, 24, 451, 401] },
};

// Auxiliary animation plates loaded by sprites.js through the original boot
// gate. Hostiles uses their measured per-cell contract in SPRITE_MOTION_ART
// below; `ink` is the union alpha box and remains here for generic asset
// validation/backward-compatible spriteFlapQuad diagnostics. Action paintings
// stay separate: committed dive/charge/vault always override locomotion.
export const SPRITE_FLAP_ART = {
  wasp: {
    file: 'wasp-pixel-v1/wasp-pixel-flight-v1.png',
    canvas: [512, 128], ink: [28, 18, 465, 92],
  },
  hound: {
    file: 'hound-gait-atlas-v2.webp', sourceFile: 'hound-gait-atlas-v2.png',
    canvas: [2048, 1024], ink: [48, 180, 1956, 740],
  },
};

/* Production locomotion atlases. Unlike the legacy two-pose wasp crossfade,
   each entry below is a complete opaque sentence shown by itself. `cell` and
   `anchor` are source pixels, top-left origin. The anchor is a rigid feature:
   the wasp's round reactor and the hound's orange shoulder mass / planted-foot
   baseline. Geometry bakes the inverse offset, so swapping UV cells cannot
   move that feature even though ImageGen placed each cutout differently.

   `referenceInkWidth` maps source pixels through the exact width scale already
   used by the shipped production body. It preserves painted proportions—no
   atlas frame is independently stretched to fill a collision box. */
export const SPRITE_MOTION_ART = Object.freeze({
  wasp: Object.freeze({
    file: 'wasp-pixel-v1/wasp-pixel-flight-v1.png', canvas: Object.freeze([512, 128]),
    referenceInkWidth: 102, anchorRole: 'body-mass', grounded: false,
    frames: Object.freeze([
      Object.freeze({ cell: Object.freeze([0, 0, 128, 128]), anchor: Object.freeze([64, 64]) }),
      Object.freeze({ cell: Object.freeze([128, 0, 128, 128]), anchor: Object.freeze([64, 64]) }),
      Object.freeze({ cell: Object.freeze([256, 0, 128, 128]), anchor: Object.freeze([64, 64]) }),
      Object.freeze({ cell: Object.freeze([384, 0, 128, 128]), anchor: Object.freeze([64, 64]) }),
    ]),
  }),
  hound: Object.freeze({
    file: 'hound-gait-atlas-v2.webp', sourceFile: 'hound-gait-atlas-v2.png',
    canvas: Object.freeze([2048, 1024]),
    referenceInkWidth: 472, anchorRole: 'orange-shoulder+deck-line', grounded: true,
    frames: Object.freeze([
      // Run: front contact, passing/tuck, rear drive/reach, suspension.
      Object.freeze({ cell: Object.freeze([0, 0, 512, 512]), anchor: Object.freeze([272, 408]) }),
      Object.freeze({ cell: Object.freeze([512, 0, 512, 512]), anchor: Object.freeze([275, 408]) }),
      Object.freeze({ cell: Object.freeze([1024, 0, 512, 512]), anchor: Object.freeze([275, 408]) }),
      Object.freeze({ cell: Object.freeze([1536, 0, 512, 512]), anchor: Object.freeze([287, 408]) }),
      // Action: deep load, launch, airborne reach/tuck, hard landing.
      Object.freeze({ cell: Object.freeze([0, 512, 512, 512]), anchor: Object.freeze([290, 408]) }),
      Object.freeze({ cell: Object.freeze([512, 512, 512, 512]), anchor: Object.freeze([282, 408]) }),
      Object.freeze({ cell: Object.freeze([1024, 512, 512, 512]), anchor: Object.freeze([288, 408]) }),
      Object.freeze({ cell: Object.freeze([1536, 512, 512, 512]), anchor: Object.freeze([272, 408]) }),
    ]),
  }),
});

export const SPRITE_KINDS = Object.keys(SPRITE_ART);
export const SPRITE_VARIANT_IDS = ['a', 'b'];
export const DEFAULT_VARIANT = 'b';

/* The tripod is the one role whose art is squarer than the mesh it
   replaces: the cone + three legs occupy about one tile of width, and
   squashing a square tripod sprite into that bends the stance into a
   pillar. The legs are given `size` * this many tile-widths instead —
   still narrower than the houndframe's 1.7-tile chassis, and the mortar's
   hitRadius (0.5) is unchanged and stays inside the drawn tube either way.
   Every role otherwise uses the primitive box as a contain envelope.    */
export const MORTAR_STANCE = 1.5;

/* The box the PRIMITIVE mesh draws, in tiles, and where its center sits
   relative to the sim row — the envelope the sprite's ink is contained by.
   Everything is derived from CONFIG so a retune moves the art with it.
   `cx` is measured along the kind's FACING (+x = the way it points), which
   is what makes mirroring a sign flip and nothing else.                  */
export function primitiveBox(kind, C = CONFIG) {
  if (kind === 'wasp') {
    const r = C.wasp.visualRadius;                 // the octahedron's own span,
    return { w: r * 2, h: r * 2, cx: 0, cy: 0 };   //   vertex to vertex
  }
  if (kind === 'hound') {
    return { w: C.hound.size[0], h: C.hound.size[1], cx: 0, cy: 0 };
  }
  if (kind === 'carrier') {
    return { w: C.carrier.size[0], h: C.carrier.size[1], cx: 0, cy: 0 };
  }
  if (kind === 'polyp') {
    const P = C.polyp;
    // bulb + the side barrel forward of it (src/render/hostiles.js places
    // the barrel at barrelTiles * 0.65 and it is barrelSize[0] long), and
    // the root stalk down to the surface it is mounted on
    const fwd = P.barrelTiles * 0.65 + P.barrelSize[0] / 2;
    const back = P.size;
    return {
      w: fwd + back, h: P.size + P.rootY,
      cx: (fwd - back) / 2, cy: (P.size - P.rootY) / 2,
    };
  }
  if (kind === 'mortar') {
    const M = C.mortar;
    const half = M.size * 1.1;                     // ConeGeometry(size, size*2.2)
    return {
      w: M.size * 2 * MORTAR_STANCE, h: half + M.bodyY,
      cx: 0, cy: (half - M.bodyY) / 2,
    };
  }
  if (kind === 'warden') {
    const W = C.warden;
    // The sim row is the iris target. Lift the broad ink mass just enough
    // that its four feet meet the apron at -bodyY.
    return {
      w: W.size[0], h: W.size[1], cx: 0,
      cy: W.size[1] / 2 - W.bodyY,
    };
  }
  return null;
}

/* The quad: how big the PlaneGeometry is in tiles, and how far its center
   sits from the sim row. The source art is scaled UNIFORMLY to fit inside
   the primitive envelope: independently forcing its ink to both the old
   primitive width and height visibly deformed the production silhouettes
   (the long action-wasp was compressed by more than 40%). Grounded roles
   keep their opaque bottom edge on the primitive's mount line; flyers keep
   their ink centred. Pure arithmetic over the two tables above — no sim
   field anywhere in it.

   `off` is baked into the geometry rather than the mesh position, so the
   facing mirror (scale.x = -1) flips the offset with the art and the pose
   scales still act around the sim row exactly as they do on a primitive. */
const GROUNDED_SPRITES = new Set(['hound', 'polyp', 'mortar', 'warden']);

function fittedSpriteQuad(kind, art, C = CONFIG) {
  const box = primitiveBox(kind, C);
  if (!art || !box) return null;
  const [cw, ch] = art.canvas;
  const [ix, iy, iw, ih] = art.ink;
  const scale = Math.min(box.w / iw, box.h / ih);  // one scale: never stretch art
  const inkW = iw * scale;
  const inkH = ih * scale;
  const w = cw * scale;                            // grow the contained ink by exactly
  const h = ch * scale;                            //   the authored transparent margin
  // where the ink's center sits inside the quad, in tiles (canvas y is down)
  const inkCx = ((ix + iw / 2) / cw - 0.5) * w;
  const inkCy = (0.5 - (iy + ih / 2) / ch) * h;
  const targetCy = GROUNDED_SPRITES.has(kind)
    ? box.cy - box.h / 2 + inkH / 2
    : box.cy;
  return {
    w, h,
    offX: box.cx - inkCx + (art.align ? art.align[0] : 0),
    offY: targetCy - inkCy + (art.align ? art.align[1] : 0),
    inkW, inkH,
  };
}

export function spriteQuad(kind, variant = DEFAULT_VARIANT, C = CONFIG) {
  const art = SPRITE_ART[kind] && SPRITE_ART[kind][variant];
  return fittedSpriteQuad(kind, art, C);
}

export function spriteActionQuad(kind, C = CONFIG) {
  const art = SPRITE_ACTION_ART[kind];
  return fittedSpriteQuad(kind, art, C);
}

export function spriteFlapQuad(kind, C = CONFIG) {
  const art = SPRITE_FLAP_ART[kind];
  return fittedSpriteQuad(kind, art, C);
}

/* One locomotion frame as world geometry + atlas UV bounds. The atlas uses
   top-left pixel coordinates while Three's plane UVs use bottom-left, hence
   the explicit v inversion. `offX/offY` place the rigid source anchor at the
   same primitive-space point in every frame. Hound's y anchor is its planted
   foot line; the existing presentation lift then preserves the authored deck
   contact after uniform presentation scaling. */
export function spriteMotionFrame(kind, index, C = CONFIG) {
  const art = SPRITE_MOTION_ART[kind];
  const box = primitiveBox(kind, C);
  if (!art || !box || !art.frames.length) return null;
  const n = art.frames.length;
  const frame = art.frames[((index % n) + n) % n];
  const [atlasW, atlasH] = art.canvas;
  const [x, y, cw, ch] = frame.cell;
  const [anchorX, anchorY] = frame.anchor;
  const scale = box.w / art.referenceInkWidth;
  const w = cw * scale, h = ch * scale;
  const anchorLocalX = (anchorX - cw / 2) * scale;
  const anchorLocalY = (ch / 2 - anchorY) * scale;
  const targetY = art.grounded ? box.cy - box.h / 2 : box.cy;
  return {
    kind, index: ((index % n) + n) % n,
    w, h,
    offX: box.cx - anchorLocalX,
    offY: targetY - anchorLocalY,
    anchorX, anchorY,
    anchorWorldX: box.cx,
    anchorWorldY: targetY,
    uv: {
      u0: x / atlasW, u1: (x + cw) / atlasW,
      v0: 1 - (y + ch) / atlasH, v1: 1 - y / atlasH,
    },
  };
}

/* ?sprites=0 (or =off) is the escape hatch back to the primitive bodies —
   entry 16 retired blanket off-by-default flags, so approved art ships ON
   and the FLAG is the A/B. Everything else, including no flag at all,
   resolves to sprites on. */
export function spritesEnabled(param) {
  return !(param === '0' || param === 'off');
}

/* ?spritevar= picks which candidate each role wears:
     (absent)          every role wears DEFAULT_VARIANT
     a | b             every role wears that one
     hound:a,wasp:b    per-role, anything unnamed keeps the default
   Unknown roles and unknown letters are ignored rather than thrown: a
   mistyped URL must never be able to stop the game drawing a hostile. */
export function resolveSpriteVariants(param, kinds = SPRITE_KINDS) {
  const out = {};
  for (const kind of kinds) out[kind] = DEFAULT_VARIANT;
  const raw = (param || '').trim().toLowerCase();
  if (!raw) return out;
  if (SPRITE_VARIANT_IDS.includes(raw)) {
    for (const kind of kinds) out[kind] = raw;
    return out;
  }
  for (const part of raw.split(',')) {
    const [kind, id] = part.split(':').map((s) => (s || '').trim());
    if (kinds.includes(kind) && SPRITE_VARIANT_IDS.includes(id)) out[kind] = id;
  }
  return out;
}
