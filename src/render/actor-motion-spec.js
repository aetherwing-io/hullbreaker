/* =============== DECLARATIVE HOSTILE ACTOR MOTION =============== */
/* Node-safe production data for rooted hardware animation.  Atlases, cells,
   anchors, clips, state markers, and attachment sockets live here; the
   renderer consumes the table generically and the simulation never imports
   it.  A frame is a complete painted actor, never a body-wide transform. */

const point = (x, y) => Object.freeze([x, y]);
const sockets = (core, muzzle, rack, mutation = core) => Object.freeze({
  core: point(...core),
  iris: point(...core),
  muzzle: point(...muzzle),
  barrel: point(...muzzle),
  rack: point(...rack),
  mutation: point(...mutation),
});
const frame = (index, name, anchor, socketTable) => Object.freeze({
  index, name, anchor: point(...anchor), sockets: socketTable,
});
const beat = (frameName, until = 1, event = '') => Object.freeze({
  frame: frameName, until, event,
});
const clip = (marker, durationMs, ...beats) => Object.freeze({
  marker, durationMs, beats: Object.freeze(beats),
});

export const ACTOR_MOTION_ATLASES = Object.freeze({
  emplacement: Object.freeze({
    id: 'emplacement-motion-atlas-v2',
    file: '../../assets/generated/sprites/emplacement-motion-atlas-v2.png',
    source: '../../assets/generated/sprites/emplacement-motion-atlas-v2.prompt.md',
    canvas: Object.freeze([2048, 1024]),
    grid: Object.freeze([4, 2]),
    cell: Object.freeze([512, 512]),
    minCellMargin: 29,
  }),
  warden: Object.freeze({
    id: 'warden-motion-atlas-v2',
    file: '../../assets/generated/sprites/warden-motion-atlas-v2.png',
    source: '../../assets/generated/sprites/warden-motion-atlas-v2.prompt.md',
    canvas: Object.freeze([2048, 1024]),
    grid: Object.freeze([4, 2]),
    cell: Object.freeze([512, 512]),
    // The tightest frame has 38px horizontal and 36px baseline clearance.
    minCellMargin: 36,
  }),
});

/* Socket coordinates are source pixels inside a 512px cell.  `anchor` is the
   common planted deck contact.  The runtime maps it to the primitive's mount
   line once, then every socket follows the selected painted hardware pose. */
export const ACTOR_MOTION_SPEC = Object.freeze({
  polyp: Object.freeze({
    atlas: 'emplacement', row: 0, authoredFacing: -1,
    referenceInkWidth: 448, anchorRole: 'deck-contact', fallback: 'base/primitive',
    frames: Object.freeze([
      frame(0, 'sealed', [256, 476], sockets([255, 371], [255, 371], [342, 382], [256, 342])),
      frame(1, 'aim', [256, 476], sockets([244, 276], [130, 274], [354, 275], [249, 326])),
      frame(2, 'discharge', [256, 476], sockets([266, 306], [55, 304], [371, 308], [276, 339])),
      frame(3, 'recover', [256, 476], sockets([236, 368], [236, 368], [365, 381], [251, 401])),
    ]),
    clips: Object.freeze({
      closed: clip('safe:sealed', 0, beat('sealed', 1, 'shutter-sealed')),
      // The old tell jumped straight from sealed to the final aim painting and
      // then held that one card for all 700ms. At FAR it read as a static
      // starfish with a warning lamp. Reuse the resident recovery silhouette
      // as a short shutter flare before the barrel locks: three strong poses
      // (sealed state -> flare -> aim), one immutable root, no tweened card.
      tell: clip('tell:hardware-aim', 700,
        beat('recover', 0.24, 'shutter-flare'), beat('aim', 1, 'iris-aim')),
      fire: clip('fire:beam-live', 450, beat('discharge', 1, 'muzzle-live')),
      vent: clip('recover:vent-open', 900, beat('recover', 1, 'iris-vulnerable')),
      relay: clip('recover:relay-hinge', 320, beat('recover', 1, 'barrel-hinge')),
    }),
    states: Object.freeze({ closed: 'closed', tell: 'tell', fire: 'fire', vent: 'vent', relay: 'relay' }),
    rules: Object.freeze([
      Object.freeze({ when: Object.freeze([{ field: 'state', eq: 'closed' },
        { field: 'aegisActive', eq: true }]), clip: 'tell' }),
    ]),
  }),

  mortar: Object.freeze({
    atlas: 'emplacement', row: 1, authoredFacing: -1,
    referenceInkWidth: 448, anchorRole: 'deck-contact', fallback: 'base/primitive',
    frames: Object.freeze([
      frame(4, 'brace', [256, 476], sockets([258, 362], [180, 228], [319, 329], [260, 350])),
      frame(5, 'load', [256, 476], sockets([260, 371], [112, 307], [325, 260], [262, 354])),
      frame(6, 'launch', [256, 476], sockets([262, 362], [174, 193], [320, 315], [260, 340])),
      frame(7, 'recover', [256, 476], sockets([253, 371], [126, 293], [329, 264], [258, 349])),
    ]),
    clips: Object.freeze({
      aim: clip('tell:loaded-ready', 0, beat('load', 1, 'breech-loaded')),
      lob: clip('fire:pod-launch', 580,
        beat('launch', 0.28, 'muzzle-launch'), beat('recover', 1, 'tube-recover')),
      fuse: clip('recover:venting', 520, beat('recover', 1, 'breech-vent')),
      burst: clip('fire:zone-live', 220, beat('recover', 1, 'zone-burst')),
      cool: clip('recover:reload', 1050,
        beat('recover', 0.34, 'breech-vent'), beat('brace', 1, 'tripod-brace')),
    }),
    states: Object.freeze({ aim: 'aim', lob: 'lob', fuse: 'fuse', burst: 'burst', cool: 'cool' }),
    rules: Object.freeze([]),
  }),

  warden: Object.freeze({
    atlas: 'warden', row: null, authoredFacing: -1,
    referenceInkWidth: 448, anchorRole: 'deck-contact', fallback: 'base/primitive',
    frames: Object.freeze([
      frame(0, 'sealed', [256, 476], sockets([208, 341], [87, 298], [369, 309], [252, 284])),
      frame(1, 'sweep-tell', [256, 476], sockets([209, 337], [164, 326], [365, 325], [258, 284])),
      frame(2, 'sweep-fire', [256, 476], sockets([238, 342], [64, 298], [378, 303], [264, 286])),
      frame(3, 'sweep-recover', [256, 476], sockets([213, 350], [90, 340], [361, 311], [251, 295])),
      frame(4, 'barrage-tell', [256, 476], sockets([209, 339], [84, 303], [354, 213], [253, 278])),
      frame(5, 'barrage-burst', [256, 476], sockets([202, 350], [68, 316], [346, 213], [247, 287])),
      frame(6, 'exposed', [256, 476], sockets([229, 346], [127, 305], [374, 312], [255, 278])),
      frame(7, 'damaged-exposed', [256, 476], sockets([204, 353], [89, 308], [369, 309], [255, 286])),
    ]),
    clips: Object.freeze({
      // The Crown interlock exists at its final footprint from the first
      // visible frame.  Complete painted poses articulate the suspension,
      // rack and cannon around the one immutable deck anchor; the renderer
      // never scales the complete body to fake an arrival.
      deployment: clip('safe:rooted-deployment', 900,
        beat('sealed', 0.20, 'feet-lock'),
        beat('sweep-recover', 0.42, 'suspension-rise'),
        beat('barrage-tell', 0.70, 'rack-unfold'),
        beat('sweep-tell', 1, 'cannon-braced')),
      sealed: clip('safe:sealed', 0, beat('sealed', 1, 'shutters-sealed')),
      sweepTell: clip('tell:cannon-brace', 620, beat('sweep-tell', 1, 'cannon-aim')),
      sweepFire: clip('fire:sweep-live', 330, beat('sweep-fire', 1, 'cannon-live')),
      barrageTell: clip('tell:rack-deploy', 700, beat('barrage-tell', 1, 'rack-aim')),
      barrageBurst: clip('fire:barrage-live', 240, beat('barrage-burst', 1, 'rack-live')),
      exposed: clip('recover:iris-exposed', 1500,
        beat('sweep-recover', 0.09, 'cannon-recover'), beat('exposed', 1, 'iris-vulnerable')),
      damagedExposed: clip('recover:damaged-iris-exposed', 1500,
        beat('sweep-recover', 0.09, 'cannon-recover'), beat('damaged-exposed', 1, 'iris-damaged')),
      terminalRupture: clip('recover:terminal-rupture', 1320,
        beat('exposed', 0.08, 'seal-break'),
        beat('damaged-exposed', 1, 'hardpoints-ruptured')),
    }),
    states: Object.freeze({
      sealed: 'sealed', sweepTell: 'sweepTell', sweepFire: 'sweepFire',
      barrageTell: 'barrageTell', barrageBurst: 'barrageBurst', exposed: 'exposed',
    }),
    rules: Object.freeze([
      Object.freeze({ when: Object.freeze([{ field: 'state', eq: 'exposed' },
        { field: 'hp', ltField: 'maxHp' }]), clip: 'damagedExposed' }),
    ]),
  }),
});

export const ACTOR_MOTION_KINDS = Object.freeze(Object.keys(ACTOR_MOTION_SPEC));
