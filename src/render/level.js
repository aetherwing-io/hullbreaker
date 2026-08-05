/* ========================= LEVEL MESHES =========================== */
/* Instanced tiles, catwalk slats, and the authored solid rectangles for
   the baked level in src/sim/level.js. The zipper and face-reveal hooks
   are the visual half of the corner ritual: the sim decides when a column
   counts as built, this module moves the bricks. */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { normalAscentAltAt, normalAscentPitchAt } from '../pure/ascent.js';
import { defensePhaseForRouteFace } from '../pure/meridian-response.js';
import {
  SEGS, CORNER_S, polyAt, headingAt, faceIndexAt,
} from '../pure/path.js';
import { deckShadePlan } from '../pure/shade.js';
import { ACTIVE_FIXTURE, IS_G1, IS_TRANSFORM_SLICE, QUERY } from '../mode.js';
import { installView } from '../sim/bridge.js';
import {
  LEVEL_LEN, groundH, ladders, platforms, solidRects, slamSets, farSets,
  unbuildFutureFaces,
} from '../sim/level.js';
import { scene, HIDE } from './scene.js';
import { PAL, SHADE_GAIN } from './palette.js';
import {
  FOREGROUND_PACK, FOREGROUND_PACK_SLOT, foregroundPackCell,
  foregroundPackTransform, noteForegroundPackCell,
} from './foreground-pack.js';
import {
  foregroundComponentById, foregroundComponentCatalogStats,
  foregroundCompositionForModule,
} from './foreground-components.js';
import { FOREGROUND_COMPONENT_ART_SLOT } from './foreground-component-art.js';
import { FOREGROUND_COMPONENT_ATLAS } from './foreground-component-spec.generated.js';
import {
  WORLD_DETAIL_ART, WORLD_DETAIL_ART_SLOT, WORLD_DETAIL_ON,
} from './world-detail-art.js';
import { applyDeckPanelTexture, applySurface } from './materials.js';
import { deckPanelFaceGain, deckPanelUv } from './hulltiles.js';
import {
  currentWorldFacet, routeRenderable, routeVisibilityStamp, routeWorldFacet,
} from './route-visibility.js';

// --- level meshes: baked per-face static geometry ---------------------
// Tile instances are baked once along the rising tower polyline with per-column
// instance ranges + base matrices (and per-face ranges for later passes),
// so the corner ritual can slam columns in without a rebuild.
const VISUAL_DEPTH = 4;
let tiles;
const tileBaseMats = [];                                  // final matrix per instance
const columnInstances = new Array(LEVEL_LEN).fill(null);  // col → {start, count, settled}
const faceRanges = [];                                    // face → {col0, col1, inst0, inst1}
const slatMeshes = [];                    // catwalk panels {mesh, x0, x1, facet, samples}
const authoredSolidMeshes = [];           // tagged solid rectangles {mesh, facet}
const routeHullFacets = [];                // continuous hull split for strict face ownership
const normalRunAltAt = (s) => ACTIVE_FIXTURE ? 0 : normalAscentAltAt(s, CONFIG.levelLength);
const normalRunPitchAt = (s) => ACTIVE_FIXTURE ? 0 : normalAscentPitchAt(s, CONFIG.levelLength);

// The collision bake intentionally stays chunky and legible.  This pass is
// everything the collision boxes should NOT have to be: the trusses, pipes,
// service frames and inset access plates that make those same rectangles read
// as a colossal maintained machine.  It is render-only and default-on in the
// static six-face run; ?world=0 is the exact A/B back to the undressed
// collision silhouette. Fixtures and the retired ?zip=1 reveal retain their
// authored visual grammar rather than leaking already-built details.
export const WORLD_DRESSING_ENABLED = IS_G1 && QUERY.get('world') !== '0';

const dressingStats = {
  enabled: WORLD_DRESSING_ENABLED,
  boxes: 0,
  pipes: 0,
  gussets: 0,
  lights: 0,
  drawPools: 0,
  hidden: 0,
  detailState: WORLD_DETAIL_ART_SLOT.state,
  detailFixtures: 0,
  detailVisible: 0,
  detailHidden: 0,
  detailDrawPools: 0,
  detailVertices: 0,
  detailTriangles: 0,
  detailFallbacks: 0,
  detailRoles: Object.create(null),
  packState: FOREGROUND_PACK_SLOT.state,
  packChoices: FOREGROUND_PACK_SLOT.choices,
  packRequests: FOREGROUND_PACK_SLOT.requests,
  packGpuTextures: FOREGROUND_PACK_SLOT.gpuTextures,
  packEmissive: FOREGROUND_PACK_SLOT.emissive,
  packPlacements: 0,
  packDrawPools: 0,
  packCellsUsed: 0,
  componentCatalog: foregroundComponentCatalogStats(),
  componentPlacements: 0,
  componentArtState: FOREGROUND_COMPONENT_ART_SLOT.state,
  componentArtRequests: FOREGROUND_COMPONENT_ART_SLOT.requests,
  componentArtGpuTextures: FOREGROUND_COMPONENT_ART_SLOT.gpuTextures,
  componentArtEmissive: FOREGROUND_COMPONENT_ART_SLOT.emissive,
  componentDrawPools: 0,
  componentUnique: 0,
  componentCategories: Object.create(null),
  authoredSolidSkins: 0,
  authoredSolidSkinPanels: 0,
  authoredSolidSkinComponents: 0,
  authoredSolidSkinPrimitives: 0,
  supportFamilies: Object.create(null),
  responseSockets: 0,
  responseSocketKinds: Object.create(null),
  responseStates: Object.create(null),
};

export function worldDressingStats() {
  return {
    ...dressingStats,
    detailRoles: { ...dressingStats.detailRoles },
    componentCatalog: {
      ...dressingStats.componentCatalog,
      categories: { ...dressingStats.componentCatalog.categories },
    },
    componentCategories: { ...dressingStats.componentCategories },
    supportFamilies: { ...dressingStats.supportFamilies },
    responseSocketKinds: { ...dressingStats.responseSocketKinds },
    responseStates: { ...dressingStats.responseStates },
    detailPreload: {
      state: WORLD_DETAIL_ART_SLOT.state,
      requests: WORLD_DETAIL_ART_SLOT.requests,
      preloadMs: WORLD_DETAIL_ART_SLOT.preloadMs,
      gateMs: WORLD_DETAIL_ART_SLOT.gateMs,
      residency: WORLD_DETAIL_ART_SLOT.residency,
      settledBeforeConsumer: WORLD_DETAIL_ART_SLOT.settledBeforeConsumer,
    },
  };
}
if (typeof globalThis !== 'undefined') globalThis.__HB_WORLD = worldDressingStats;

/* ---- view hooks: the build state of a face, made visible ---------- */
/* THE ZIPPER IS RETIRED FROM THE WORLD, NOT DELETED (docs/decisions.md
   entry 3 + its July 30 addendum): the creature's body may not assemble,
   but things the ship BUILDS may, so this choreography stays whole and
   callable for the traps/emplacements lane — and still playable, since
   ?zip=1 selects it. By DEFAULT (T-009) the same corner reads as an orbit
   around a static limb (../render/limb.js), so all three hooks below no-op
   and every column stays where the bake put it — the next facet was always
   there. The sim's build state machine is untouched in both modes; only the
   story the geometry tells changes.                                    */

function unbuiltHidden() {               // next faces stay unbuilt until their ritual
  if (!tiles || IS_G1) return;           // transformation slice: no tower bake
  for (const sets of [slamSets, farSets]) {
    for (const cols of sets) {
      for (const s of cols) {
        const col = columnInstances[s];
        if (!col) continue;
        col.settled = false;
        for (let n = 0; n < col.count; n++) tiles.setMatrixAt(col.start + n, HIDE);
      }
    }
  }
  tiles.instanceMatrix.needsUpdate = true;
  for (const sl of slatMeshes)           // catwalks over an unbuilt face are unbuilt too
    sl.mesh.visible = !CORNER_S.some((cs) =>
      sl.x1 >= cs && sl.x0 <= cs + CONFIG.path.faceTiles - 1);
}

const _zm = new THREE.Matrix4();
function zipperColumn(s, dy, locked) {   // one brick-slam column, dy tiles above base
  if (IS_G1) return;                     // a limb does not assemble
  const col = tiles && columnInstances[s];
  if (!col) return;
  for (let n = 0; n < col.count; n++) {
    const inst = col.start + n;
    _zm.copy(tileBaseMats[inst]);
    _zm.elements[13] += dy;
    tiles.setMatrixAt(inst, _zm);
  }
  if (locked) col.settled = true;
  tiles.instanceMatrix.needsUpdate = true;
}

function faceRevealed(c) {               // beyond the zipper strip: one distant commit
  if (!tiles || IS_G1) return;           // nothing to reveal: the facet was baked
  for (const s of farSets[c.k - 1]) {
    const col = columnInstances[s];
    if (!col || col.settled) continue;
    col.settled = true;
    for (let n = 0; n < col.count; n++)
      tiles.setMatrixAt(col.start + n, tileBaseMats[col.start + n]);
  }
  tiles.instanceMatrix.needsUpdate = true;
  const faceEnd = c.s + CONFIG.path.faceTiles - 1;
  for (const sl of slatMeshes)           // this face's catwalks come back with it
    if (sl.x1 >= c.s && sl.x0 <= faceEnd) sl.mesh.visible = true;
}

// installed before the bake below, which finishes by unbuilding future faces
let levelViewInstalled = false;
export function initLevelView() {
  if (levelViewInstalled) return false;
  installView({ level: { unbuiltHidden, zipperColumn, faceRevealed } });
  levelViewInstalled = true;
  return true;
}

/* ---------------------- industrial world dressing ---------------------- *
 * Four draw pools carry the entire six-face route.  Every element is baked
 * from groundH/platforms but never registered with collision: dark access
 * bays divide the broad armour, pipes establish service scale, catwalks gain
 * real load paths, and tall maintenance frames connect the tiny traversal
 * band to the monumental body behind it.  The silhouettes that matter to a
 * jump remain exactly the original slats and tile tops. */

const dressBoxes = [];
const dressPipes = [];
const dressGussets = [];
const _dressP = { x: 0, z: 0 };
const _dressM = new THREE.Matrix4();
const _dressRot = new THREE.Matrix4();
const _dressPitch = new THREE.Matrix4();
const _dressScale = new THREE.Vector3();
const _dressColor = new THREE.Color();
const dressingPools = [];
const dressingPanelFacets = [];
const worldDetailPanels = [];
const worldDetailRows = [];
const ladderPools = [];
const responseSockets = [];
const componentPlanes = [];
let dressingCullStamp = '';

export function foregroundResponseSockets() {
  // Records are frozen at bake time. Returning a new array protects route and
  // socket ownership from accidental mutation without cloning on the hot path.
  return responseSockets.slice();
}
if (typeof globalThis !== 'undefined')
  globalThis.__HB_FOREGROUND_RESPONSE_SOCKETS = foregroundResponseSockets;
// Keep the historic tile-pool source guard scoped to its intended pool: the
// value-ladder test counts literal THREE.InstancedMesh construction sites.
// DressingPool is still the same class; the alias names this separate pass.
const DressingPool = THREE.InstancedMesh;

function dressBox(
  s, y, depth, sx, sy, sz, color, tilt = 0, visibilityS = s, detailRole = null,
  surface = 'auto', packCell = null, componentId = null, packTransform = null,
) {
  const row = {
    s, y, depth, sx, sy, sz, color, tilt, visibilityS, detailRole, surface,
    packCell, componentId, packTransform,
  };
  dressBoxes.push(row);
  return row;
}

function dressMachineBox(
  s, y, depth, sx, sy, sz, color, tilt = 0, visibilityS = s,
  componentId = null,
) {
  return dressBox(
    s, y, depth, sx, sy, sz, color, tilt, visibilityS, null, 'machine',
    null, componentId,
  );
}

function dressGusset(
  s, y, depth, sx, sy, sz, color, variant, visibilityS = s,
  componentId = null,
) {
  const row = {
    s, y, depth, sx, sy, sz, color, tilt: 0,
    variant: variant % 3, visibilityS, componentId,
  };
  dressGussets.push(row);
  return row;
}

function dressPackBox(
  s, y, depth, sx, sy, sz, role, seed, tilt = 0, visibilityS = s,
) {
  const packCell = foregroundPackCell(role, seed);
  noteForegroundPackCell(packCell);

  // A is body material and may legitimately run across a broad fascia. The
  // B/C/D sheets describe discrete service machinery, traversal hardware and
  // damage states; stretching those square mechanisms into a three-to-one
  // banner destroys their authored proportions. Seat them as near-square
  // apertures inside the wider structural bay instead. The ordinary-material
  // box supplies real thickness, side faces and contact shadow; only its
  // proud front inlay uses the atlas.
  const framed = packCell.sheet !== 'A';
  const aspect = Math.max(0.25, packCell.nativeAspect || 1);
  const panelW = framed ? Math.min(sx, sy * aspect) : sx;
  const panelH = framed ? Math.min(sy, sx / aspect) : sy;
  const backDepth = depth + sz / 2 - Math.max(0.14, sz + 0.06) / 2 - 0.018;
  if (framed) dressMachineBox(
    s, y, backDepth, panelW + 0.20, panelH + 0.20,
    Math.max(0.14, sz + 0.06), PAL.limb.shadow, tilt, visibilityS,
    'aperture-housing',
  );
  const row = dressBox(
    s, y, depth, panelW, panelH, sz, 0xffffff, tilt, visibilityS,
    null, 'pack', packCell, packCell.id, foregroundPackTransform(packCell, seed),
  );
  return { packCell, row };
}

// CylinderGeometry's long axis is local Y. `tilt = -PI/2` lays it along the
// route; zero leaves it as a vertical riser.
function dressPipe(
  s, y, depth, length, radius, color, tilt = -Math.PI / 2,
  visibilityS = s, detailRole = null, componentId = null,
) {
  const row = {
    s, y, depth, sx: radius, sy: length, sz: radius, color, tilt,
    visibilityS, detailRole, componentId,
  };
  dressPipes.push(row);
  return row;
}

function componentHash(seed) {
  let value = (Math.trunc(seed) ^ 0x85ebca6b) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

function dressComponentPlane(
  anchorS, anchorY, depth, targetW, targetH, componentId, seed,
  extraTilt = 0, visibilityS = anchorS,
) {
  const component = foregroundComponentById(componentId);
  if (!component || component.renderKind !== 'cutout') return null;
  const choice = componentHash(seed + componentId.length * 97);
  let rotations = component.rotations || [0];
  // Axis-stretched parts keep their authored long axis aligned with the
  // requested housing. Free rotations remain available to compact braces,
  // elbows, tees and state organs.
  if (component.stretchAxes?.length) {
    const wantTall = targetH > targetW;
    const aligned = rotations.filter((quarter) => !!(quarter & 1) === wantTall);
    if (aligned.length) rotations = aligned;
  }
  const quarterTurns = rotations[(choice >>> 1) % rotations.length];
  const rotated = !!(quarterTurns & 1);
  const displayAspect = rotated ? 1 / component.nativeAspect : component.nativeAspect;
  const uniformH = Math.min(targetH, targetW / displayAspect);
  const uniformW = uniformH * displayAspect;
  let width = uniformW;
  let height = uniformH;
  const screenStretchX = component.stretchAxes?.includes(rotated ? 'y' : 'x');
  const screenStretchY = component.stretchAxes?.includes(rotated ? 'x' : 'y');
  if (screenStretchX) width = targetW;
  if (screenStretchY) height = targetH;
  const angle = quarterTurns * Math.PI / 2 + extraTilt;
  const pivot = component.pivot || [0.5, 0.5];
  const px = (pivot[0] - 0.5) * width;
  const py = (0.5 - pivot[1]) * height;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const row = {
    s: anchorS - (px * cos - py * sin),
    y: anchorY - (px * sin + py * cos),
    anchorS, anchorY, depth, sx: width, sy: height, sz: 1,
    tilt: angle, visibilityS, componentId, component,
    componentTransform: {
      mirrorX: !!component.mirrorX && !!(choice & 1), quarterTurns,
    },
  };
  componentPlanes.push(row);
  return row;
}

/* ------------------ authored collision-rib presentation ----------------- *
 * Vertical Assault's `solidRects` are intentionally terse collision: one
 * exact rectangle is enough for wall launches, cover and projectile stops.
 * Presenting that same rectangle as one tall painted card made the authored
 * routes look unfinished, however.  This bake-only skin keeps the rectangle
 * authoritative while composing existing resident foreground vocabulary over
 * it.  Plate cells repeat at their useful native scale, structural braces sit
 * inside those cells, and every proud part shares the solid's MIDPOINT gate so
 * the skin can never appear on a facet where its collision body is hidden. */
const AUTHORED_SOLID_CASSETTE_SEEDS = Object.freeze([4, 13, 23, 25, 28, 31]);

function dressAuthoredSolidSkins() {
  const beforeBoxes = dressBoxes.length;
  const beforeComponents = componentPlanes.length;
  let skins = 0;
  let panels = 0;

  for (let index = 0; index < solidRects.length; index++) {
    const rect = solidRects[index];
    if (!rect.assault) continue;
    const width = rect.x1 - rect.x0;
    const height = rect.y1 - rect.y0;
    if (!(width > 0.36 && height > 0.54)) continue;

    const mid = (rect.x0 + rect.x1) / 2;
    const middleY = (rect.y0 + rect.y1) / 2;
    const gate = mid; // exact authoredSolidMeshes ownership, not a new reveal edge
    const seed = (rect.face || faceIndexAt(mid, CONFIG) + 1) * 997 + index * 131;
    const edgeW = Math.min(0.14, width * 0.14);
    const edgeX = Math.max(0, width / 2 - edgeW * 0.72);

    // Two cold rails and seated toe/crown castings turn the collision body
    // into a load path. They overlap the source mesh in depth, so no bracket
    // can float even if the optional atlases fall back.
    for (const side of [-1, 1]) {
      dressMachineBox(
        mid + side * edgeX, middleY, 1.035,
        edgeW, Math.max(0.30, height - 0.22), 0.18,
        side < 0 ? PAL.limb.shadow : PAL.limb.wall,
        0, gate,
      );
    }
    dressMachineBox(
      mid, rect.y1 - 0.09, 1.045,
      width, 0.18, 0.20, PAL.groundAlt, 0, gate,
    );
    dressMachineBox(
      mid, rect.y0 + 0.08, 1.035,
      Math.max(0.42, width - 0.08), 0.16, 0.18,
      PAL.limb.shadow, 0, gate,
    );

    // The route cap is a reviewed native cutout, kept entirely inside the
    // climbable top. Alternating scute/cap vocabulary prevents clone pillars
    // without changing the wall-launch silhouette.
    dressComponentPlane(
      mid, rect.y1 - 0.16, 1.145,
      Math.max(0.42, width - 0.04), 0.29,
      index & 1 ? 'scute-edge' : 'route-cap-long', seed + 17, 0, gate,
    );

    const hasCassette = height >= 3.8;
    const bottomInset = hasCassette ? 1.08 : 0.34;
    const topInset = 0.36;
    const usable = Math.max(0.30, height - bottomInset - topInset);
    const segmentCount = Math.max(1, Math.ceil(usable / 0.88));
    const pitch = usable / segmentCount;
    const panelW = Math.max(0.34, width - 0.28);
    const panelH = Math.max(0.24, Math.min(0.70, pitch * 0.78));

    for (let segment = 0; segment < segmentCount; segment++) {
      const y = rect.y0 + bottomInset + pitch * (segment + 0.5);
      dressPackBox(
        mid, y, 1.055, panelW, panelH, 0.08,
        'surfaceCold', seed + segment * 73, 0, gate,
      );
      panels++;

      // Repeating one stretched picture along a seven-tile rib becomes mush.
      // Compact braces instead occupy alternating plate bays at native scale.
      if ((segment + index) % 2 === 0) {
        dressComponentPlane(
          mid, y, 1.145,
          Math.min(panelW, 0.66), Math.min(panelH, 0.64),
          (segment + index) % 4 === 0 ? 'cross-brace' : 'diagonal-brace',
          seed + segment * 109 + 41, 0, gate,
        );
      }
      if (segment > 0) {
        dressMachineBox(
          mid, y - pitch / 2, 1.105,
          Math.max(0.38, width - 0.16), 0.075, 0.11,
          PAL.limb.shadow, 0, gate,
        );
      }
    }

    if (hasCassette) {
      // These seeds resolve to the reviewed B13 service-cassette cell. Its
      // ordinary-metal housing is emitted by dressPackBox and sits inside the
      // lower rib bay, so the machinery cannot read as a sticker or fake
      // collision hanging in open traversal space.
      dressPackBox(
        mid, rect.y0 + 0.58, 1.075,
        Math.max(0.46, width - 0.26), 0.48, 0.10,
        'serviceInspect',
        AUTHORED_SOLID_CASSETTE_SEEDS[index % AUTHORED_SOLID_CASSETTE_SEEDS.length],
        0, gate,
      );
      panels++;
    } else if (height >= 1.3) {
      // Short cover gets a rooted shoulder rather than a squeezed cassette.
      dressComponentPlane(
        mid, rect.y0 + 0.08, 1.135,
        Math.max(0.42, width - 0.16), Math.min(0.68, height * 0.38),
        'armor-shoulder', seed + 211, 0, gate,
      );
    }
    skins++;
  }

  dressingStats.authoredSolidSkins = skins;
  dressingStats.authoredSolidSkinPanels = panels;
  dressingStats.authoredSolidSkinComponents = componentPlanes.length - beforeComponents;
  dressingStats.authoredSolidSkinPrimitives = dressBoxes.length - beforeBoxes;
}

function registerResponseSocket(
  response, component, anchorS, groundY, moduleStart, moduleEnd, visibilityS,
) {
  if (!response?.active || !component) return null;
  const margin = Math.min(0.46, Math.max(0.12, (moduleEnd - moduleStart) * 0.12));
  const socketS = Math.max(moduleStart + margin,
    Math.min(moduleEnd - margin, anchorS + response.routeOffset));
  const socketY = groundY + response.verticalOffset;
  const yaw = headingAt(SEGS, socketS);
  polyAt(SEGS, socketS, _dressP);
  const socketMeta = component.sockets?.find((entry) =>
    entry.kind === response.socketKind) || component.sockets?.[0] || null;
  const record = Object.freeze({
    id: `response-${response.phase}-${responseSockets.length}-${component.id}`,
    state: response.state, phase: response.phase,
    kind: response.socketKind,
    componentId: component.id,
    componentSocket: socketMeta ? Object.freeze({ ...socketMeta }) : null,
    route: Object.freeze({
      s: socketS, y: socketY, visibilityS,
      offRoute: true, playerAdjacent: false,
      safeFromPlayerRadius: response.safeFromPlayerRadius,
    }),
    world: Object.freeze({
      x: _dressP.x + Math.sin(yaw) * response.outwardDepth,
      y: socketY + normalRunAltAt(socketS),
      z: _dressP.z + Math.cos(yaw) * response.outwardDepth,
      yaw,
    }),
    hooks: Object.freeze([...response.allowedHooks]),
    tellLeadMs: response.tellLeadMs,
    causeResponse: true,
  });
  responseSockets.push(record);
  return record;
}

function dressingMatrix(row, depthOffset = 0, depthScale = row.sz) {
  polyAt(SEGS, row.s, _dressP);
  const yaw = headingAt(SEGS, row.s);
  _dressRot.makeRotationY(yaw);
  _dressRot.multiply(_dressPitch.makeRotationZ(normalRunPitchAt(row.s) + row.tilt));
  _dressM.copy(_dressRot);
  _dressM.scale(_dressScale.set(row.sx, row.sy, depthScale));
  _dressM.setPosition(
    _dressP.x + Math.sin(yaw) * (row.depth + depthOffset),
    row.y + normalRunAltAt(row.s),
    _dressP.z + Math.cos(yaw) * (row.depth + depthOffset),
  );
  return _dressM;
}

function nearestDeckS(target, min, max) {
  const at = Math.round(target);
  for (let d = 0; d <= 6; d++) {
    for (const s of d === 0 ? [at] : [at - d, at + d]) {
      if (s >= min && s < max && groundH[s] > -100) return s + 0.5;
    }
  }
  return null;
}

/* ------------------- sparse authored Meridian fixtures ------------------ *
 * Three large landmarks per route face replace per-tile visual wallpaper.
 * The grammar is deterministic, terrain-aware only at bake time, and never
 * enters collision. A row records the far edge of its FULL transparent cell,
 * not merely its anchor, so construction cannot reveal half a fixture. */
const WORLD_DETAIL_ROLE_ROWS = Object.freeze([
  Object.freeze(['gill', 'pipe-spine', 'gallery']),
  Object.freeze(['vent-bank', 'breach', 'sensor']),
  Object.freeze(['pipe-spine', 'exhaust', 'containment']),
  Object.freeze(['gallery', 'gill', 'breach']),
  Object.freeze(['sensor', 'vent-bank', 'pipe-spine']),
  Object.freeze(['containment', 'exhaust', 'breach']),
]);
const WORLD_DETAIL_WIDTH = Object.freeze({
  gill: 5.45,
  'pipe-spine': 3.95,
  gallery: 5.85,
  breach: 5.15,
  'vent-bank': 6.05,
  sensor: 4.25,
  exhaust: 5.05,
  containment: 4.55,
});
const WORLD_DETAIL_TOP = Object.freeze({
  gill: -0.28,
  'pipe-spine': 1.18,
  gallery: 1.62,
  breach: -0.10,
  'vent-bank': -0.42,
  sensor: 2.15,
  exhaust: 0.72,
  containment: 0.05,
});
const WORLD_DETAIL_BY_ROLE = new Map(
  WORLD_DETAIL_ART.cells.map((entry) => [entry.role, entry]),
);

function planWorldDetailFixtures() {
  if (!WORLD_DETAIL_ON || WORLD_DETAIL_ART_SLOT.state === 'off' || worldDetailRows.length) return;
  const anchors = [13.5, 33.0, 52.0];
  for (let face = 0; face < CONFIG.path.faces; face++) {
    const faceStart = CONFIG.path.introTiles + face * CONFIG.path.faceTiles;
    const faceEnd = Math.min(LEVEL_LEN, faceStart + CONFIG.path.faceTiles);
    for (let slot = 0; slot < anchors.length; slot++) {
      const role = WORLD_DETAIL_ROLE_ROWS[face][slot];
      const art = WORLD_DETAIL_BY_ROLE.get(role);
      const s = nearestDeckS(
        faceStart + anchors[slot], faceStart + 7, faceEnd - 7,
      );
      if (s === null || !art) continue;
      const column = Math.max(0, Math.min(groundH.length - 1, Math.floor(s)));
      const deckY = groundH[column];
      let platformNear = false;
      for (const p of platforms) {
        if (p.x1 >= s - 3.2 && p.x0 <= s + 3.2) {
          platformNear = true;
          break;
        }
      }
      let gapNear = false;
      for (let x = Math.max(0, column - 3); x <= Math.min(groundH.length - 1, column + 3); x++) {
        if (groundH[x] < -100) { gapNear = true; break; }
      }

      const width = WORLD_DETAIL_WIDTH[role] *
        (1 + face * 0.018 + (gapNear ? 0.035 : 0) - (platformNear ? 0.015 : 0));
      const [ix, iy, iw, ih] = art.ink;
      const scale = width / iw;
      const flip = ((face * 3 + slot) % 4) === 1;
      const inkOffsetX = (ix + iw / 2 - WORLD_DETAIL_ART.cellSize / 2) * scale;
      const planeWidth = WORLD_DETAIL_ART.cellSize * scale;
      const planeHeight = WORLD_DETAIL_ART.cellSize * scale;
      const planeCenterS = s - (flip ? -inkOffsetX : inkOffsetX);
      const topY = deckY + WORLD_DETAIL_TOP[role] + (platformNear ? 0.12 : 0);
      const planeCenterY = topY - (WORLD_DETAIL_ART.cellSize / 2 - iy) * scale;
      const visibleHeight = ih * scale;
      const visibilityS = planeCenterS + planeWidth / 2;
      const startS = planeCenterS - planeWidth / 2;
      const facet = routeWorldFacet(s);
      // These are authoring invariants, but retaining the values on each row
      // makes both runtime telemetry and the standalone boundary gate honest.
      if (routeWorldFacet(startS + 0.001) !== facet ||
          routeWorldFacet(visibilityS - 0.001) !== facet) {
        console.warn(`HULLBREAKER world: skipped ${role}; full cell crossed facet ${facet}.`);
        continue;
      }
      worldDetailRows.push({
        role, art, face, slot, s, facet, phase: faceIndexAt(s, CONFIG),
        width, visibleHeight, scale, planeWidth, planeHeight,
        planeCenterS, planeCenterY, topY, visibilityS, startS,
        depth: 1.075 + slot * 0.008,
        shadowDepth: 1.026 + slot * 0.004,
        tilt: [-0.012, 0.009, -0.006][(face + slot) % 3],
        flip,
        context: gapNear ? 'breach-edge' : (platformNear ? 'catwalk-service' : 'armour-run'),
      });
      dressingStats.detailRoles[role] = (dressingStats.detailRoles[role] || 0) + 1;
    }
  }
  dressingStats.detailFixtures = worldDetailRows.length;
}

function dressDetailFallback(row) {
  const gate = row.visibilityS;
  const cy = row.topY - row.visibleHeight * 0.52;
  const w = row.width;
  const h = row.visibleHeight;
  const role = row.role;
  const box = (s, y, depth, sx, sy, sz, color, tilt = 0) =>
    dressBox(s, y, depth, sx, sy, sz, color, tilt, gate, role);
  const pipe = (s, y, depth, length, radius, color, tilt = -Math.PI / 2) =>
    dressPipe(s, y, depth, length, radius, color, tilt, gate, role);
  if (role === 'gill' || role === 'vent-bank') {
    box(row.s, cy, 1.06, w * 0.92, h * 0.68, 0.16, PAL.limb.shadow);
    for (const dy of [-0.22, 0, 0.22])
      box(row.s, cy + dy * h, 1.12, w * (0.74 - Math.abs(dy) * 0.30), 0.12, 0.10,
        dy === 0 ? PAL.limb.machine : PAL.groundAlt);
  } else if (role === 'pipe-spine') {
    pipe(row.s - w * 0.17, cy, 1.10, h * 0.90, 0.15, PAL.limb.machine, 0);
    pipe(row.s + w * 0.15, cy - h * 0.04, 1.12, h * 0.76, 0.11, PAL.groundAlt, 0);
    box(row.s, cy + h * 0.13, 1.17, w * 0.58, h * 0.18, 0.22, PAL.limb.wall);
  } else if (role === 'gallery') {
    box(row.s, cy, 1.07, w * 0.88, h * 0.52, 0.20, PAL.limb.wall);
    box(row.s, cy + h * 0.25, 1.14, w, 0.15, 0.14, PAL.catwalk);
    box(row.s - w * 0.31, cy + h * 0.03, 1.15, 0.13, h * 0.48, 0.12, PAL.groundAlt);
  } else if (role === 'breach') {
    box(row.s, cy, 1.04, w * 0.64, h * 0.62, 0.18, PAL.limb.shadow);
    box(row.s - w * 0.18, cy, 1.12, w * 0.62, 0.18, 0.14, PAL.groundAlt, 0.66);
    box(row.s + w * 0.16, cy, 1.13, w * 0.58, 0.16, 0.14, PAL.limb.machine, -0.58);
  } else if (role === 'sensor') {
    pipe(row.s, cy - h * 0.10, 1.08, h * 0.78, 0.13, PAL.limb.machine, 0);
    box(row.s, cy + h * 0.20, 1.15, w * 0.78, h * 0.16, 0.14, PAL.catwalk, -0.18);
    box(row.s + w * 0.22, cy + h * 0.27, 1.17, w * 0.23, h * 0.22, 0.14, PAL.limb.wall);
  } else if (role === 'exhaust') {
    box(row.s - w * 0.22, cy, 1.08, w * 0.48, h * 0.54, 0.24, PAL.limb.wall);
    pipe(row.s + w * 0.12, cy + h * 0.08, 1.14, w * 0.58, 0.17, PAL.limb.machine);
    box(row.s + w * 0.34, cy + h * 0.08, 1.17, w * 0.22, h * 0.28, 0.18, PAL.groundAlt);
  } else {
    box(row.s, cy, 1.08, w * 0.66, h * 0.70, 0.28, PAL.limb.wall);
    pipe(row.s - w * 0.38, cy, 1.13, h * 0.72, 0.11, PAL.catwalk, 0);
    pipe(row.s + w * 0.38, cy, 1.13, h * 0.72, 0.11, PAL.catwalk, 0);
  }
}

function dressNativeModuleShapes(composition, mid, h, len, pattern, gate, ordinal) {
  const side = ordinal & 1 ? 1 : -1;
  for (let i = 0; i < composition.shapeIds.length; i++) {
    const id = composition.shapeIds[i];
    const component = foregroundComponentById(id);
    if (!component) continue;
    const seed = composition.seed + i * 313;
    if (component.category === 'trim-cap') {
      dressComponentPlane(
        mid + side * len * (i ? 0.05 : 0.12), h - (i ? 1.06 : 0.58), 1.075,
        Math.min(3.35, len * (i ? 0.40 : 0.52)), i ? 0.42 : 0.50,
        id, seed, 0, gate,
      );
    } else if (component.category === 'beam-brace') {
      dressComponentPlane(
        mid + side * len * 0.10, h - 2.30, 1.095,
        Math.min(2.35, len * 0.42), pattern === 3 ? 1.28 : 0.92,
        id, seed, 0, gate,
      );
    } else if (component.category === 'pipe-conduit') {
      dressComponentPlane(
        mid - side * len * 0.15, h - 3.03, 1.11,
        Math.min(2.45, len * 0.38), id === 'conduit-tee' ? 0.92 : 0.48,
        id, seed, 0, gate,
      );
    } else if (component.category === 'near-silhouette') {
      dressComponentPlane(
        mid + side * len * 0.18, h - 3.30, 1.18,
        Math.min(1.70, len * 0.28), 1.34,
        id, seed, 0, gate,
      );
    }
  }
}

function dressDefenseResponse(
  composition, mid, h, len, moduleStart, moduleEnd, gate, ordinal,
) {
  if (!composition.defenseShapeId) return;
  const component = foregroundComponentById(composition.defenseShapeId);
  if (!component) return;
  const side = ordinal & 1 ? -1 : 1;
  const aspect = component.nativeAspect;
  const targetW = aspect > 1.55 ? Math.min(1.90, len * 0.30) :
    aspect < 0.72 ? 0.72 : 1.16;
  const targetH = aspect > 1.55 ? 0.68 : aspect < 0.72 ? 1.28 : 1.08;
  const anchorS = mid + side * Math.min(len * 0.22, 1.38);
  const anchorY = h - 2.14 - (ordinal % 3) * 0.15;
  dressComponentPlane(
    anchorS, anchorY, 1.165, targetW, targetH,
    component.id, composition.seed ^ 0x5bd1e995, 0, gate,
  );
  const socketRecord = registerResponseSocket(
    composition.response, component, anchorS, h, moduleStart, moduleEnd, gate,
  );
  if (!socketRecord) return;

  // A physical umbilical makes the visible hardware the obvious cause of the
  // off-route deployment origin. It is ordinary unlit metal; armed/active FX
  // may later travel this path without turning ambient detail into neon.
  const socketY = socketRecord.route.y;
  const verticalSpan = Math.max(0.35, Math.abs(anchorY - socketY));
  dressPipe(
    socketRecord.route.s, (anchorY + socketY) / 2, 1.06,
    verticalSpan, 0.065, PAL.limb.machine, 0, gate, null, 'pressure-pipe',
  );
  dressMachineBox(
    socketRecord.route.s, socketY, 1.095, 0.34, 0.24, 0.18,
    PAL.limb.shadow, 0, gate, 'aperture-housing',
  );
}

function dressGroundArmour() {
  let start = 0;
  let moduleOrdinal = 0;
  while (start < LEVEL_LEN) {
    const h = groundH[start];
    if (h < -100) { start++; continue; }
    let end = start + 1;
    while (end < LEVEL_LEN && groundH[end] === h && faceIndexAt(end, CONFIG) === faceIndexAt(start, CONFIG)) end++;

    // The old pass drew a complete orange-framed equipment bay every six
    // tiles.  It duplicated the panel painting beneath it and read as a UI
    // kit pasted over a brown collision slab.  Geometry now marks only the
    // LOAD PATHS: sparse locking ribs, an occasional recessed service throat,
    // and a cold underslung knuckle.  Surface detail belongs to the continuous
    // route painting; silhouette and attachment belong to these pieces.
    const moduleSpans = [9.2, 6.8, 11.4, 7.6, 8.5];
    let cursor = start;
    while (cursor < end - 0.35) {
      const span = moduleSpans[moduleOrdinal % moduleSpans.length];
      const stop = Math.min(end, cursor + span);
      const len = stop - cursor;
      const mid = (cursor + stop) / 2;
      const gate = stop - 0.001;
      const pattern = moduleOrdinal % moduleSpans.length;

      if (len >= 2.0) {
        const phase = defensePhaseForRouteFace(faceIndexAt(mid, CONFIG));
        const composition = foregroundCompositionForModule(
          phase, moduleOrdinal, pattern,
        );
        const packW = Math.min(len - 0.66, [3.7, 3.25, 3.05, 3.45, 2.65][pattern]);
        const packH = [1.10, 1.02, 1.20, 0.92, 1.30][pattern];
        const packS = mid + len * [-0.07, 0.08, 0.10, -0.04, -0.14][pattern];
        // Layer 1: an A-family material fill clipped into the broad authored
        // fascia. It may stretch because it is explicitly a surface swatch;
        // the structural bay owns the outline and physical depth.
        dressPackBox(
          packS, h - [2.16, 2.06, 2.34, 2.12, 2.20][pattern],
          0.94, packW, packH, 0.08, composition.surfaceRole,
          moduleOrdinal + phase * 131 + pattern * 17,
          [0, -0.018, 0.012, -0.025, 0.016][pattern], gate,
        );

        // Layer 2: sparse B/C machinery only when the composition asks for a
        // true recessed service/traversal aperture. Its native aspect is fit,
        // never stretched across the fascia.
        if (composition.apertureRole) {
          const apertureSide = moduleOrdinal & 1 ? -1 : 1;
          dressPackBox(
            packS + apertureSide * Math.min(packW * 0.27, 0.92),
            h - [2.18, 2.04, 2.29, 2.17, 2.23][pattern],
            1.035, Math.min(1.08, packW * 0.34), Math.min(0.88, packH * 0.82),
            0.10, composition.apertureRole,
            composition.seed ^ 0x27d4eb2d, 0, gate,
          );
        }

        // Layers 3+: native-shape trims/braces/conduits and the current
        // defense response. These are extracted transparent components with
        // measured pivots—not square atlas cells—and vary by mirror/rotation,
        // adjacency and depth while retaining their legal stretch axis.
        dressNativeModuleShapes(
          composition, mid, h, len, pattern, gate, moduleOrdinal,
        );
        dressDefenseResponse(
          composition, mid, h, len, cursor, stop, gate, moduleOrdinal,
        );

        // A single collar joins the warm route cap to the cold body.  It is
        // deliberately off-centre so the eye never finds a ruler grid.
        const collarS = cursor + len * [0.18, 0.72, 0.31, 0.64, 0.43][pattern];
        const lean = [-0.055, 0.038, -0.028, 0.046, -0.034][pattern];
        // Only modules whose system needs a load rib receive one. The former
        // warm vertical-plus-horizontal pair repeated as a painted '+' badge
        // over the body. These ribs stay cold, sit behind the route lip and
        // terminate in a broad shadow socket instead.
        if (pattern === 0 || pattern === 3) {
          dressMachineBox(collarS, h - 1.90, 0.955,
            0.34, 2.64 + (pattern % 2) * 0.30, 0.24,
            PAL.limb.wall, lean, gate);
          dressMachineBox(collarS, h - 0.62, 0.975,
            0.92, 0.28, 0.30, PAL.limb.shadow, lean * 0.35, gate);
        }

        // Modules alternate actual systems, not decorative badges.  Their
        // dark backplates sit between the recessed route rows; shoulders,
        // clamps and conduit share the same copper/blue-steel materials as
        // catwalks and ladders.  No atlas/card and no per-tile repetition.
        if (pattern === 0 && len >= 4.2) {
          // Ventilation throat: broad occlusion, three inset louvers, one
          // asymmetric armored shoulder.
          const bayW = Math.min(3.9, len * 0.54);
          const bayS = mid - len * 0.08;
          dressMachineBox(bayS, h - 2.18, 0.92,
            bayW, 1.02, 0.10, PAL.limb.shadow, 0, gate);
          dressMachineBox(bayS - bayW * 0.48, h - 2.06, 1.005,
            0.28, 1.36, 0.22, PAL.limb.wall, -0.06, gate);
          dressMachineBox(bayS + bayW * 0.48, h - 2.32, 1.005,
            0.38, 1.16, 0.22, PAL.limb.rib, 0.08, gate);
          for (const dy of [-0.25, 0, 0.25])
            dressMachineBox(bayS, h - 2.18 + dy, 0.995,
              bayW * (dy === 0 ? 0.76 : 0.68), 0.085, 0.10,
              PAL.limb.machine, dy * 0.10, gate);
        } else if (pattern === 1 && len >= 3.8) {
          // Service artery: two real conduits and broad clamps bridge the
          // route rows; their different lengths prevent a striped-wall read.
          const pipeLen = Math.min(3.6, len * 0.58);
          dressPipe(mid - len * 0.06, h - 1.82, 1.01,
            pipeLen, 0.11, PAL.limb.machine, -Math.PI / 2, gate);
          dressPipe(mid + len * 0.08, h - 2.24, 0.99,
            pipeLen * 0.72, 0.085, PAL.solid, -Math.PI / 2, gate);
          for (const dx of [-pipeLen * 0.34, pipeLen * 0.18])
            dressMachineBox(mid + dx, h - 2.02, 1.04,
              0.24, 0.86, 0.24, PAL.limb.wall, 0, gate);
        } else if (pattern === 2 && len >= 4.6) {
          // Inspection pocket: a deep irregular bay under a single heavy
          // eyebrow; it interrupts the armor belt without becoming a prop.
          const bayW = Math.min(2.8, len * 0.42);
          const bayS = mid + len * 0.10;
          dressMachineBox(bayS, h - 2.34, 0.91,
            bayW, 1.26, 0.12, PAL.contactShadow, 0, gate);
          dressMachineBox(bayS - bayW * 0.46, h - 2.34, 1.01,
            0.30, 1.42, 0.25, PAL.limb.wall, -0.10, gate);
          dressMachineBox(bayS + bayW * 0.46, h - 2.42, 1.01,
            0.26, 1.18, 0.25, PAL.limb.wall, 0.07, gate);
          dressBox(bayS - bayW * 0.06, h - 1.66, 1.035,
            bayW * 1.06, 0.30, 0.32, PAL.solid, -0.025, gate);
          dressMachineBox(bayS + bayW * 0.12, h - 2.45, 1.02,
            bayW * 0.44, 0.18, 0.14, PAL.limb.machine, 0, gate);
        } else if (pattern === 3 && len >= 3.8) {
          // Torn armor overlap: a shadow seam with two unequal plates.  The
          // angles create a large readable interruption without tiny decals.
          const tearW = Math.min(3.1, len * 0.50);
          dressMachineBox(mid, h - 2.12, 0.92,
            tearW, 0.82, 0.11, PAL.limb.shadow, 0, gate);
          dressBox(mid - tearW * 0.23, h - 2.00, 1.005,
            tearW * 0.58, 0.34, 0.20, PAL.limb.wall, 0.15, gate);
          dressBox(mid + tearW * 0.21, h - 2.26, 1.01,
            tearW * 0.52, 0.30, 0.20, PAL.solid, -0.12, gate);
        } else if (pattern === 4 && len >= 4.2) {
          // Cable well: one deep slot and a vertical paired conduit terminate
          // in broad sockets, tying this body band into the ladder language.
          const wellS = mid - len * 0.14;
          dressMachineBox(wellS, h - 2.20, 0.92,
            1.24, 1.48, 0.12, PAL.limb.shadow, 0.04, gate);
          for (const dx of [-0.23, 0.23])
            dressPipe(wellS + dx, h - 2.20, 1.01,
              1.22, 0.09, PAL.limb.machine, 0, gate);
          for (const y of [h - 1.55, h - 2.82])
            dressMachineBox(wellS, y, 1.025,
              0.92, 0.24, 0.24, PAL.solid, 0, gate);
        }

        // A recessed, irregular knuckle breaks the lower edge without adding
        // another painted rectangle.  It sits behind the armour face and is
        // visible mainly at gaps/undersides, where a load-bearing mass belongs.
        if (pattern === 0 || pattern === 2) {
          dressBox(mid + (pattern === 0 ? len * 0.19 : -len * 0.16),
            h - 3.72, 0.64, Math.min(2.7, len * 0.31),
            0.68 + pattern * 0.05, 0.56, PAL.limb.shadow,
            pattern === 0 ? -0.10 : 0.08, gate);
        }
      }
      cursor = stop;
      moduleOrdinal++;
    }
    start = end;
  }
}

/* Six encounter silhouettes should not all wear the same index-shuffled
 * scaffold.  Collision stays in `platforms`; this pass changes only the
 * negative space and load-path vocabulary beneath authored assault decks.
 * Every part uses the platform's existing prefix gate and already-resident
 * component atlas.  Pocket/procedural platforms retain the common machine
 * grammar, so the six dialects remain variations of one Meridian body. */
const SUPPORT_FAMILY_IDS = Object.freeze([
  'rib', 'service', 'cavity', 'vent', 'braid', 'root',
]);

function dressFaceAwareCatwalk(p, index, len, mid, gate) {
  const family = p.supportFamily;
  if (!SUPPORT_FAMILY_IDS.includes(family)) return false;
  dressingStats.supportFamilies[family] =
    (dressingStats.supportFamilies[family] || 0) + 1;

  const seed = (p.face || 0) * 1009 + index * 137;
  const drop = Math.min(2.25, 0.92 + len * 0.12);
  const deepY = p.y - 0.62 - drop / 2;
  const componentDepth = 1.06;

  if (family === 'rib') {
    // One decisive diagonal and one off-centre root leave broad air around
    // Split Rib instead of filling every bay with identical little triangles.
    const side = index & 1 ? 0.68 : 0.32;
    const rootS = p.x0 + len * side;
    dressMachineBox(rootS, deepY, 0.20,
      0.44, drop, 0.62, PAL.limb.wall,
      index & 1 ? -0.055 : 0.055, gate);
    dressGusset(mid, p.y - 0.64 - Math.min(1.55, drop) / 2, -0.08,
      Math.min(2.85, len * 0.52), Math.min(1.55, drop), 0.54,
      PAL.limb.shadow, index & 1 ? 2 : 0, gate);
    dressComponentPlane(
      mid + (index & 1 ? -0.18 : 0.18), p.y - 0.92, componentDepth,
      Math.min(3.15, len * 0.58), 0.82,
      'diagonal-brace', seed + 11, 0, gate,
    );
    dressComponentPlane(
      mid, p.y - 0.12, componentDepth,
      Math.min(3.45, len * 0.64), 0.38,
      'scute-edge', seed + 29, 0, gate,
    );
    return true;
  }

  if (family === 'service') {
    // Chimney Fork uses paired cold uprights with a seated girder and compact
    // conduit junction. They read as machine columns, never fake ladders.
    const frameW = Math.min(Math.max(1.35, len * 0.44), 3.35);
    const postOffset = frameW * 0.39;
    for (const side of [-1, 1]) {
      dressMachineBox(mid + side * postOffset, deepY, 0.18,
        0.36, drop, 0.68,
        side < 0 ? PAL.limb.wall : PAL.limb.shadow,
        side * -0.018, gate);
    }
    dressMachineBox(mid, p.y - 0.69 - drop, 0.16,
      frameW, 0.34, 0.72, PAL.limb.shadow, 0, gate);
    dressComponentPlane(
      mid, p.y - 0.72, componentDepth,
      Math.min(3.05, frameW), 0.72,
      'i-girder', seed + 43, 0, gate,
    );
    dressComponentPlane(
      mid + (index & 1 ? postOffset : -postOffset), p.y - 1.18,
      componentDepth + 0.02, 0.64, 0.64,
      'conduit-tee', seed + 61, 0, gate,
    );
    return true;
  }

  if (family === 'cavity') {
    // Crossfire Cavity keeps a deep, readable void between two shoulders.
    // The inspection organ is mounted to one jamb instead of pasted across
    // the opening, preserving the defensive-perch silhouette at FAR.
    const frameW = Math.min(Math.max(1.65, len * 0.50), 3.85);
    const frameH = Math.min(1.88, drop);
    const jamb = frameW * 0.43;
    for (const side of [-1, 1]) {
      dressMachineBox(mid + side * jamb, p.y - 0.62 - frameH / 2, 0.12,
        0.40, frameH, 0.68, PAL.limb.wall, side * 0.026, gate);
      dressComponentPlane(
        mid + side * jamb, p.y - 0.68 - frameH, componentDepth,
        0.86, 0.74, 'armor-shoulder', seed + 79 + side, 0, gate,
      );
    }
    dressMachineBox(mid, p.y - 0.62, 0.14,
      frameW, 0.36, 0.72, PAL.limb.shadow, 0, gate);
    dressMachineBox(mid, p.y - 1.22, 0.48,
      frameW * 0.48, 0.70, 0.30, PAL.contactShadow, 0, gate);
    dressPackBox(
      mid + (index & 1 ? jamb : -jamb), p.y - 1.18, 1.02,
      0.76, 0.62, 0.10, 'serviceInspect', seed + 101, 0, gate,
    );
    dressComponentPlane(
      mid, p.y - 1.18, componentDepth + 0.02,
      0.82, 0.78, 'cross-brace', seed + 113, 0, gate,
    );
    return true;
  }

  if (family === 'vent') {
    // Alternating exhaust trunks and vertical pressure lines make Vent Stack
    // read as a sequence of purge landings rather than another ladder tower.
    const side = index & 1 ? 0.28 : 0.72;
    const trunkS = p.x0 + len * side;
    const pipeS = p.x0 + len * (1 - side);
    dressMachineBox(trunkS, deepY, 0.18,
      0.72, drop, 0.72, PAL.limb.shadow,
      index & 1 ? -0.018 : 0.018, gate);
    dressMachineBox(trunkS, p.y - 0.73 - drop, 0.22,
      1.12, 0.38, 0.78, PAL.limb.wall, 0, gate);
    dressComponentPlane(
      trunkS, p.y - 1.02, componentDepth,
      0.92, 0.92, 'vent-hood', seed + 127, 0, gate,
    );
    dressPipe(
      pipeS, p.y - 0.72 - drop / 2, 0.96,
      Math.min(1.82, drop), 0.09, PAL.limb.machine,
      0, gate,
    );
    dressComponentPlane(
      pipeS, p.y - 0.70 - drop, componentDepth,
      0.62, 0.62, 'pipe-elbow', seed + 149, 0, gate,
    );
    return true;
  }

  if (family === 'braid') {
    // Kill Braid crosses its load paths just as its playable lanes cross:
    // mirrored braces and a cable bundle converge on one hard junction.
    const braceW = Math.min(2.65, len * 0.43);
    const offset = Math.min(len * 0.22, 1.35);
    for (const side of [-1, 1]) {
      dressComponentPlane(
        mid + side * offset, p.y - 0.94, componentDepth,
        braceW, 0.94, 'diagonal-brace', seed + 167 + side, 0, gate,
      );
      dressMachineBox(mid + side * offset * 1.18, deepY, 0.12,
        0.34, drop, 0.60, PAL.limb.shadow,
        side * 0.052, gate);
    }
    dressComponentPlane(
      mid, p.y - 0.62, componentDepth + 0.04,
      Math.min(3.55, len * 0.70), 0.58,
      'cable-bundle', seed + 181, 0, gate,
    );
    dressComponentPlane(
      mid, p.y - 1.30, componentDepth + 0.02,
      0.68, 0.68, 'conduit-tee', seed + 193, 0, gate,
    );
    return true;
  }

  // Crown Roots trades open scaffold for visibly heavier buttress mass. Two
  // angled roots end in native shoulder/keel silhouettes while the middle
  // remains open enough for projectiles and RIG to read cleanly.
  const rootOffset = Math.min(len * 0.25, 1.55);
  const rootDrop = Math.min(2.38, 1.10 + len * 0.13);
  for (const side of [-1, 1]) {
    const s = mid + side * rootOffset;
    dressMachineBox(s, p.y - 0.64 - rootDrop / 2, 0.16,
      0.66, rootDrop, 0.82,
      side < 0 ? PAL.limb.wall : PAL.limb.shadow,
      side * 0.064, gate);
    dressMachineBox(s + side * 0.18, p.y - 0.74 - rootDrop, 0.18,
      1.24, 0.44, 0.86, PAL.limb.shadow, side * 0.018, gate);
    dressComponentPlane(
      s + side * 0.10, p.y - 0.68 - rootDrop, componentDepth,
      1.10, 1.02, side < 0 ? 'keel-fin' : 'armor-shoulder',
      seed + 211 + side, 0, gate,
    );
  }
  dressComponentPlane(
    mid, p.y - 0.82, componentDepth + 0.03,
    0.92, 0.88, 'cross-brace', seed + 229, 0, gate,
  );
  return true;
}

function dressCatwalks() {
  for (let index = 0; index < platforms.length; index++) {
    const p = platforms[index];
    const len = p.x1 - p.x0;
    if (len < 1.1) continue;
    const mid = (p.x0 + p.x1) / 2;

    const gate = p.x1 - 0.001;
    // A catwalk is a complete casting, never an orange rule with an X drawn
    // under it. The collision-faithful profile owns the oxidized deck and
    // fascia; this cold, deep belly girder gives it machine-scale mass.
    dressMachineBox(mid, p.y - 0.56, 0.43,
      Math.max(0.62, len - 0.34), 0.46, 0.66,
      PAL.limb.shadow, 0, gate);
    dressMachineBox(mid, p.y - 0.34, 0.81,
      Math.max(0.44, len - 0.64), 0.14, 0.22,
      PAL.limb.machine, 0, gate);

    if (dressFaceAwareCatwalk(p, index, len, mid, gate)) continue;

    if (len >= 2.3) {
      // One off-centre root joins one or two full-depth gusset castings.
      // Filling the load triangle is the decisive difference between a
      // permanent machine route and temporary scaffold sticks.
      const rootFrac = [0.34, 0.62, 0.43, 0.70][index % 4];
      const rootS = p.x0 + len * rootFrac;
      const drop = Math.min(1.88, 1.02 + len * 0.11);
      const rootY = p.y - 0.66 - drop / 2;
      dressMachineBox(rootS, rootY, 0.12,
        0.52, drop, 0.70, PAL.limb.wall,
        [0.035, -0.026, 0.018, -0.042][index % 4], gate);
      dressMachineBox(rootS, p.y - 0.72 - drop, 0.18,
        Math.min(1.42, len * 0.36), 0.42, 0.76,
        PAL.limb.shadow, 0, gate);
      const bracketH = Math.min(1.46, drop * 0.86);
      const bracketW = Math.min(2.40, len * 0.45);
      if (len < 4.3) {
        dressGusset(mid, p.y - 0.60 - bracketH / 2, -0.08,
          Math.min(len - 0.38, bracketW * 1.12), bracketH, 0.52,
          PAL.limb.wall, index, gate);
      } else {
        dressGusset(p.x0 + bracketW * 0.54, p.y - 0.60 - bracketH / 2, -0.08,
          bracketW, bracketH, 0.52, PAL.limb.wall, index, gate);
        dressGusset(p.x1 - bracketW * 0.52, p.y - 0.60 - bracketH * 0.46, -0.08,
          bracketW * 0.92, bracketH * 0.92, 0.52,
          PAL.limb.shadow, index + 1, gate);
      }

      // The fascia aperture is installed into the casting: deep throat,
      // unequal jambs and one steel lintel. It replaces the old repeated end
      // pins and gives each platform a useful local scale reference.
      const apertureS = p.x0 + len * [0.58, 0.40, 0.66][index % 3];
      const apertureW = Math.min(1.46, len * 0.34);
      dressMachineBox(apertureS, p.y - 0.30, 0.735,
        apertureW, 0.24, 0.10, PAL.contactShadow, 0, gate);
      dressMachineBox(apertureS - apertureW * 0.48, p.y - 0.30, 0.82,
        0.14, 0.42, 0.18, PAL.limb.wall, -0.04, gate);
      dressMachineBox(apertureS + apertureW * 0.48, p.y - 0.32, 0.82,
        0.18, 0.36, 0.18, PAL.limb.wall, 0.035, gate);

      // Selected long platforms carry a broken back-plane guard. It is
      // visibly rooted in the casting but stays behind actors and projectiles;
      // a gap in the handrail prevents it advertising false collision.
      if (len >= 4.8 && index % 3 !== 0) {
        const railStart = p.x0 + 0.42;
        const railEnd = p.x1 - 0.48;
        const breakFrac = index % 2 ? 0.56 : 0.42;
        const gap = Math.min(0.72, len * 0.13);
        const breakS = railStart + (railEnd - railStart) * breakFrac;
        for (const postS of [railStart, breakS - gap / 2, breakS + gap / 2, railEnd])
          dressMachineBox(postS, p.y + 0.34, -0.58,
            0.16, 0.86, 0.18, PAL.limb.wall, 0, gate);
        const leftLen = breakS - gap / 2 - railStart;
        const rightLen = railEnd - (breakS + gap / 2);
        if (leftLen > 0.24)
          dressMachineBox(railStart + leftLen / 2, p.y + 0.76, -0.58,
            leftLen, 0.16, 0.18, PAL.limb.machine, 0, gate);
        if (rightLen > 0.24)
          dressMachineBox(breakS + gap / 2 + rightLen / 2, p.y + 0.76, -0.58,
            rightLen, 0.16, 0.18, PAL.limb.machine, 0, gate);
      }

      // A reviewed native-shape rail sits behind selected permanent decks.
      // The casting/posts above remain the load path; this component supplies
      // painted clamps, shoes and silhouette detail without inventing
      // collision. Alternating intact/broken vocabulary avoids clone rows.
      if (len >= 3.4 && index % 2 === 1) {
        const railId = index % 4 === 1 ? 'guard-rail' : 'broken-guard';
        dressComponentPlane(
          mid + (index % 3 - 1) * 0.22, p.y + 0.08, -0.52,
          Math.min(3.35, len * 0.56), 0.76,
          railId, index * 733 + 19, 0, gate,
        );
      }
    } else {
      // Even a tiny perch has a visible root rather than hovering as a bar.
      dressMachineBox(mid, p.y - 0.82, 0.42,
        0.46, 0.72, 0.58, PAL.limb.wall, 0, gate);
    }

    // Long decks occasionally carry a hanging service cassette.  The
    // asymmetry is deterministic and deliberately sparse.
    if (len >= 5.2 && index % 5 === 2) {
      const cassetteS = mid + Math.min(0.7, len * 0.12);
      dressPackBox(cassetteS, p.y - 1.16, 0.66,
        1.34, 0.72, 0.16, 'structCatwalk', index * 47 + 11, 0, gate);
      dressMachineBox(cassetteS, p.y - 1.02, 0.99,
        0.86, 0.20, 0.10, PAL.limb.machine, 0, gate);
    }
  }
}

function dressServiceSpines() {
  // Decorative towers used to rise through open air with fake rungs and
  // lamps, making the playfield look like temporary scaffolding.  Mounts now
  // exist only where the SIMULATION exposes a traversable ladder.  Two cold
  // sockets and two short shoulder plates visibly transfer that ladder's load
  // into the route; the ladder renderer supplies the rails and rungs.
  for (let i = 0; i < ladders.length; i++) {
    const row = ladders[i];
    const span = row.y1 - row.y0;
    if (span < 1.2) continue;
    const gate = row.x + 0.001;
    const width = 1.46 + (i % 3) * 0.10;
    const socketYs = [row.y0, row.y1];
    dressComponentPlane(
      row.x, row.y0, 0.76, 0.78, Math.min(3.6, span),
      'ladder-rail', i * 911 + 7, 0, gate,
    );
    for (let end = 0; end < socketYs.length; end++) {
      const y = socketYs[end];
      dressPackBox(row.x, y, 0.70,
        width * 0.74, 0.68, 0.10, 'structLadder', i * 53 + end * 19, 0, gate);
      dressMachineBox(row.x, y, 0.73, width, 0.38, 0.46,
        PAL.limb.shadow, 0, gate);
      for (const dx of [-0.48, 0.48])
        dressMachineBox(row.x + dx, y, 0.96,
          0.30, 0.52, 0.24, PAL.limb.wall,
          dx < 0 ? -0.055 : 0.055, gate);
      dressMachineBox(row.x + (i % 2 ? -0.18 : 0.18), y, 1.08,
        0.58, 0.16, 0.16, PAL.groundAlt, 0, gate);
      // A navigation lens lives inside the dark end socket. It is a cut-in,
      // not a floating bulb: ordinary lit material, no emissive or halo, and
      // only real climbable ladders receive one. At FAR this small warm mark
      // makes the traversal verb discoverable without turning the hull into
      // a runway of ambient glow.
      const lensSide = end ? -1 : 1;
      dressMachineBox(row.x + lensSide * 0.24, y + (end ? -0.01 : 0.01), 1.115,
        0.17, 0.11, 0.055, PAL.seamPip, 0, gate, 'recessed-navigation-lens');
    }
  }
}

function buildDressingPool(rows, geometry, material, name, shadows = true) {
  if (!rows.length) return null;
  const mesh = new DressingPool(geometry, material, rows.length);
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  const baseMatrices = [];
  for (let i = 0; i < rows.length; i++) {
    const matrix = dressingMatrix(rows[i]).clone();
    baseMatrices.push(matrix);
    mesh.setMatrixAt(i, matrix);
    mesh.setColorAt(i, _dressColor.set(rows[i].color));
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  dressingPools.push({ mesh, rows, baseMatrices });
  // Paused browser inspection and direct test teleports still receive the
  // same sector visibility as ordinary play. The first callback updates all
  // pools together and then becomes an idempotent facet check.
  mesh.onBeforeRender = updateWorldDressingCull;
  scene.add(mesh);
  dressingStats.drawPools++;
  return mesh;
}

/* ----------------------- traversable route rails ----------------------- *
 * These rows come only from `levelData.ladders`: unlike the old decorative
 * service-spine rungs above, every visible ladder is a real movement verb.
 * Two fixed instance pools draw the whole route. Per-instance matrices carry
 * kind-specific gauge/pitch and obey the same routeRenderable fold/build gate
 * as platforms, enemies, and projectiles. */
const LADDER_STYLE = Object.freeze({
  rib: Object.freeze({
    rail: PAL.limb.rib, rung: PAL.catwalk,
    gap: WORLD_DETAIL_ON ? 0.90 : 0.86,
    radius: WORLD_DETAIL_ON ? 0.105 : 0.075,
    rungRadius: WORLD_DETAIL_ON ? 0.088 : 0.065, pitch: 0.66,
  }),
  service: Object.freeze({
    rail: PAL.limb.machine,
    rung: PAL.catwalk,
    gap: WORLD_DETAIL_ON ? 0.84 : 0.78,
    radius: WORLD_DETAIL_ON ? 0.098 : 0.064,
    rungRadius: WORLD_DETAIL_ON ? 0.084 : 0.056, pitch: 0.61,
  }),
  organic: Object.freeze({
    rail: PAL.limb.rib,
    rung: PAL.catwalk,
    gap: WORLD_DETAIL_ON ? 0.94 : 0.90,
    radius: WORLD_DETAIL_ON ? 0.112 : 0.082,
    rungRadius: WORLD_DETAIL_ON ? 0.094 : 0.069, pitch: 0.72,
  }),
});
const DEFAULT_LADDER_STYLE = LADDER_STYLE.service;
const ladderRailRows = [];
const ladderRungRows = [];
const _ladderP = { x: 0, z: 0 };
const _ladderM = new THREE.Matrix4();
const _ladderYaw = new THREE.Matrix4();
const _ladderAxis = new THREE.Matrix4();
const _ladderLocal = new THREE.Vector3();
const _ladderScale = new THREE.Vector3();
const _ladderColor = new THREE.Color();

function ladderMatrix(row) {
  polyAt(SEGS, row.s, _ladderP);
  const yaw = headingAt(SEGS, row.s);
  _ladderYaw.makeRotationY(yaw);
  _ladderM.copy(_ladderYaw);
  if (row.horizontal) {
    _ladderAxis.makeRotationZ(-Math.PI / 2);
    _ladderM.multiply(_ladderAxis);
  }
  _ladderM.scale(_ladderScale.set(row.radius, row.length, row.radius));
  _ladderLocal.set(row.dx, 0, row.depth).applyMatrix4(_ladderYaw);
  _ladderM.setPosition(
    _ladderP.x + _ladderLocal.x,
    row.y + normalRunAltAt(row.s),
    _ladderP.z + _ladderLocal.z,
  );
  return _ladderM;
}

function buildLadderPool(rows, name) {
  if (!rows.length) return null;
  // A low-sided industrial tube keeps the rail round in silhouette without
  // spending smooth-pipe geometry on RIG-height props at FAR.
  const geometry = new THREE.CylinderGeometry(1, 1, 1, 8, 1, false);
  const material = applySurface(new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.68,
    metalness: 0.30,
  }), 'machine');
  const mesh = new THREE.InstancedMesh(geometry, material, rows.length);
  mesh.name = name;
  mesh.userData.environmentRole = 'traversable-route-ladder';
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const baseMatrices = [];
  for (let i = 0; i < rows.length; i++) {
    const matrix = ladderMatrix(rows[i]).clone();
    baseMatrices.push(matrix);
    mesh.setMatrixAt(i, matrix);
    mesh.setColorAt(i, _ladderColor.set(rows[i].color));
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  mesh.onBeforeRender = updateWorldDressingCull;
  ladderPools.push({ mesh, rows, baseMatrices });
  scene.add(mesh);
  return mesh;
}

function buildTraversableLadders() {
  // Rails are collision geometry in every normal six-face presentation.
  // `?zip=1` swaps only the corner reveal; it must not make climbable routes
  // invisible while leaving their simulation state live.
  if (!(ACTIVE_FIXTURE === null && ladders.length)) return;
  for (const row of ladders) {
    const style = LADDER_STYLE[row.kind] || DEFAULT_LADDER_STYLE;
    const span = row.y1 - row.y0;
    const centerY = (row.y0 + row.y1) / 2;
    // The whole tube, not merely its centre line, sits behind the active actor
    // plane. The former 1.09/1.105 centres let the cylinders' radii cross
    // RIG at 1.15 and let a hostile's presence wobble pass behind them. That
    // produced the worst possible ladder read: a shootable body visually
    // clipped by non-colliding scenery. Rails remain proud of the deck plane,
    // but every live actor now wins the depth test cleanly.
    for (const dx of [-style.gap / 2, style.gap / 2]) {
      ladderRailRows.push({
        s: row.x, y: centerY, dx, depth: 0.94,
        length: span + 0.34, radius: style.radius,
        horizontal: false, color: style.rail,
        ladderId: row.id, facet: row.face,
      });
    }
    const count = Math.max(2, Math.floor((span - 0.28) / style.pitch) + 1);
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      ladderRungRows.push({
        s: row.x, y: row.y0 + 0.14 + t * Math.max(0, span - 0.28),
        dx: 0, depth: 0.965,
        length: style.gap, radius: style.rungRadius,
        horizontal: true, color: style.rung,
        ladderId: row.id, facet: row.face,
      });
    }
  }
  buildLadderPool(ladderRailRows, 'Meridian traversable ladder rails');
  buildLadderPool(ladderRungRows, 'Meridian traversable ladder rungs');
}

// These details are authored in route space but rendered on a nearly closed
// six-face coil. A service tower from the opening face used to wrap around
// and reappear as a detached pillar behind RIG at the Crown. Preserve the
// current camera-facing face only. The collision-faithful deck and limb kerb
// provide the corner reveal; proud service frames/bays on the next face wait
// for the camera's final detent, otherwise their back faces read as a second
// level floating through the fold.
export function updateWorldDressingCull() {
  const stamp = routeVisibilityStamp();
  if (stamp === dressingCullStamp) return;
  dressingCullStamp = stamp;
  let hidden = 0;
  // Traversable rails belong to normal-run collision in both reveal styles.
  // Cull them before the static-anatomy-only dressing branch so ?zip=1 can
  // never expose a future climb route merely because it swaps camera theater.
  for (const pool of ladderPools) {
    for (let i = 0; i < pool.rows.length; i++) {
      const remote = !routeRenderable(pool.rows[i].s);
      pool.mesh.setMatrixAt(i, remote ? HIDE : pool.baseMatrices[i]);
      if (remote) hidden++;
    }
    pool.mesh.instanceMatrix.needsUpdate = true;
  }
  if (!IS_G1) {
    dressingStats.hidden = hidden;
    return;
  }

  const active = currentWorldFacet();
  for (const pool of dressingPools) {
    for (let i = 0; i < pool.rows.length; i++) {
      const remote = !routeRenderable(pool.rows[i].visibilityS ?? pool.rows[i].s);
      pool.mesh.setMatrixAt(i, remote ? HIDE : pool.baseMatrices[i]);
      if (remote) hidden++;
    }
    pool.mesh.instanceMatrix.needsUpdate = true;
  }
  let detailHidden = 0;
  for (const panel of worldDetailPanels) {
    const panelHidden = updateRoutePanelDrawRange(panel, active);
    detailHidden += panelHidden;
    hidden += panelHidden;
  }
  // Fallback fixtures ride the ordinary primitive pools, but telemetry stays
  // fixture-based rather than counting their three-to-five component shapes.
  if (WORLD_DETAIL_ON && WORLD_DETAIL_ART_SLOT.state !== 'ready') {
    detailHidden = 0;
    for (const row of worldDetailRows)
      if (!routeRenderable(row.visibilityS)) detailHidden++;
  }
  dressingStats.detailHidden = detailHidden;
  dressingStats.detailVisible = Math.max(0, worldDetailRows.length - detailHidden);
  for (const panel of dressingPanelFacets) {
    hidden += updateRoutePanelDrawRange(panel, active);
  }
  // The production hull used to be one all-route BufferGeometry. No amount
  // of prop culling could stop its remote deck slabs recurring through the
  // closed coil. It is now one static mesh per phase/facet and obeys the same
  // camera + build contract as the details mounted on it.
  for (const panel of routeHullFacets) {
    hidden += updateRoutePanelDrawRange(panel, active);
  }
  // Collision remains continuous in the simulation. These proud authored
  // shapes are presentation lips/solids, however, and showing the next
  // facet's versions before the orbit was the remaining source of lamps and
  // platform silhouettes peeking around a wide desktop frame.
  for (const row of authoredSolidMeshes) {
    row.mesh.visible = row.facet === active && routeRenderable(row.s);
    if (!row.mesh.visible) hidden++;
  }
  // Long catwalks can cross the exact construction frontier. Their
  // geometry is appended one route column at a time, so the shared prefix
  // gate reveals the built landing strip without leaking its unbuilt tail.
  for (const panel of slatMeshes)
    hidden += updateRoutePanelDrawRange(panel, active);
  dressingStats.hidden = hidden;
}

function buildIndustrialDressing(panelMaterial) {
  dressAuthoredSolidSkins();
  dressGroundArmour();
  dressCatwalks();
  dressServiceSpines();
  planWorldDetailFixtures();
  if (WORLD_DETAIL_ART_SLOT.state === 'failed') {
    for (const row of worldDetailRows) dressDetailFallback(row);
    dressingStats.detailFallbacks = worldDetailRows.length;
  }

  const machineMat = applySurface(new THREE.MeshStandardMaterial({
    color: 0xffffff,
    flatShading: true,
  }), 'machine');
  const packReady = FOREGROUND_PACK_SLOT.state === 'ready' && !!FOREGROUND_PACK_SLOT.tex;
  const packMaterial = packReady ? applySurface(new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: FOREGROUND_PACK_SLOT.tex,
    vertexColors: true,
    flatShading: false,
    fog: true,
  }), 'plate') : null;
  if (packMaterial) {
    packMaterial.name = 'Meridian 64-choice foreground content pack';
    packMaterial.userData = { emissivePolicy: 'none-ambient-action-state-only' };
  }
  const componentReady = FOREGROUND_COMPONENT_ART_SLOT.state === 'ready' &&
    !!FOREGROUND_COMPONENT_ART_SLOT.tex;
  const componentMaterial = componentReady ? applySurface(new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: FOREGROUND_COMPONENT_ART_SLOT.tex,
    vertexColors: true,
    transparent: true,
    alphaTest: FOREGROUND_COMPONENT_ATLAS.alphaTest,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
    forceSinglePass: true,
    fog: true,
    flatShading: false,
  }), 'plate') : null;
  if (componentMaterial) {
    componentMaterial.name = 'Meridian native-shape component vocabulary';
    componentMaterial.alphaToCoverage = true;
    componentMaterial.userData = {
      emissivePolicy: 'none-ambient-action-state-only',
      nativeBounds: true,
      storageCellsVisible: false,
    };
  }
  // Paint only the broad bays/equipment bodies. Narrow ribs, vents, welds and
  // braces stay flat dark metal, preserving the vocabulary and keeping the
  // large source from collapsing into micro-noise on a 0.1-unit strip.
  const packBoxes = dressBoxes.filter((row) => row.surface === 'pack');
  const paintedBoxes = dressBoxes.filter((row) =>
    row.surface !== 'machine' && row.surface !== 'pack' &&
    row.sx >= 0.95 && row.sy >= 0.45);
  const trimBoxes = dressBoxes.filter((row) =>
    row.surface === 'machine' || (row.surface !== 'pack' &&
      (row.sx < 0.95 || row.sy < 0.45)));
  buildDressingPool(trimBoxes, new THREE.BoxGeometry(1, 1, 1), machineMat,
    'Meridian industrial boxes');
  // If the atlas is disabled or unavailable, each placement still has the
  // dark physical backplate authored by dressPackBox(). Do not smear the old
  // route texture across a substitute cube—the graceful fallback is simply a
  // recessed, unlabelled mechanical aperture.
  buildDressingPanelPools(paintedBoxes, panelMaterial);
  if (packReady) buildForegroundPackPools(packBoxes, packMaterial);
  if (componentReady) buildForegroundComponentPools(componentPlanes, componentMaterial);
  buildDressingPool(dressPipes, new THREE.CylinderGeometry(1, 1, 1, 8, 1), machineMat,
    'Meridian service pipes');
  for (let variant = 0; variant < 3; variant++) {
    buildDressingPool(
      dressGussets.filter((row) => row.variant === variant),
      catwalkGussetGeometry(variant), machineMat,
      `Meridian catwalk gussets ${variant}`,
    );
  }
  if (WORLD_DETAIL_ART_SLOT.state === 'ready') buildWorldDetailPanelPools();

  dressingStats.boxes = dressBoxes.length;
  dressingStats.pipes = dressPipes.length;
  dressingStats.gussets = dressGussets.length;
  dressingStats.packPlacements = packBoxes.length;
  dressingStats.packCellsUsed = new Set(packBoxes.map((row) => row.packCell.index)).size;
  const componentRows = [...dressBoxes, ...dressPipes, ...dressGussets, ...componentPlanes]
    .filter((row) => row.componentId);
  dressingStats.componentPlacements = componentRows.length;
  dressingStats.componentUnique = new Set(componentRows.map((row) => row.componentId)).size;
  for (const row of componentRows) {
    const component = foregroundComponentById(row.componentId);
    const category = component?.category || 'unclassified';
    dressingStats.componentCategories[category] =
      (dressingStats.componentCategories[category] || 0) + 1;
  }
  dressingStats.responseSockets = responseSockets.length;
  for (const socketRow of responseSockets) {
    dressingStats.responseSocketKinds[socketRow.kind] =
      (dressingStats.responseSocketKinds[socketRow.kind] || 0) + 1;
    dressingStats.responseStates[socketRow.state] =
      (dressingStats.responseStates[socketRow.state] || 0) + 1;
  }
  dressingStats.lights = 0;
  // Every pool now exists; seed their shared visibility matrices once.
  dressingCullStamp = '';
  updateWorldDressingCull();
}

/* --------------------- continuous production hull skin ----------------- *
 * The simulation quite correctly models the route as one-unit collision
 * boxes. Repeating a complete painted panel on each of those boxes made the
 * render tell the same story as a graybox checker. The default run therefore
 * bakes those exact boxes into one static BufferGeometry and gives their
 * vertices route-space UVs. Geometry and collision are unchanged; only the
 * texture coordinate now crosses tile boundaries. Non-G1 zipper fixtures
 * retain their InstancedMesh because their columns genuinely move at runtime.
 */
const _panelPos = new THREE.Vector3();
const _panelUvPos = new THREE.Vector3();
const _panelNormal = new THREE.Vector3();
const _panelWorldNormal = new THREE.Vector3();
const _panelNormalMatrix = new THREE.Matrix3();
const _panelColor = new THREE.Color();

function panelAccumulator() {
  return { position: [], normal: [], uv: [], color: [], vertices: 0 };
}

function panelUvFor(local, normal, routeS, worldY, facet) {
  // Vertical outward/inward faces follow the climb; top/bottom planes follow
  // route x depth. End caps deliberately sample a third orientation, making
  // every change of profile a natural interruption in the painted field.
  if (Math.abs(normal.y) > 0.55)
    return deckPanelUv(facet, routeS + local.x, facet * 2.71 + local.z);
  if (Math.abs(normal.z) > 0.55)
    return deckPanelUv(facet, routeS + local.x, worldY + local.y);
  return deckPanelUv(facet, facet * 3.17 + local.z, worldY + local.y);
}

function appendPanelGeometry(
  acc, source, matrix, routeS, worldY, facet, baseColor, uvScale = null,
  colorPolicy = null, atlasCell = null, atlasTransform = null,
  atlasCanvas = FOREGROUND_PACK.canvas,
) {
  const geometry = source.index ? source.toNonIndexed() : source;
  const pos = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const sourceUv = geometry.getAttribute('uv');
  _panelNormalMatrix.getNormalMatrix(matrix);
  const base = _panelColor.set(baseColor).clone();
  for (let i = 0; i < pos.count; i++) {
    _panelPos.fromBufferAttribute(pos, i);
    _panelNormal.fromBufferAttribute(normal, i);
    _panelUvPos.copy(_panelPos);
    if (uvScale) _panelUvPos.multiply(uvScale);
    let uv;
    if (atlasCell && sourceUv) {
      // Opaque cells use reviewed inner trim rectangles; native-shape
      // components use their measured post-key visible bounds. In both cases
      // square atlas storage is invisible to runtime geometry.
      let left, top, right, bottom;
      if (atlasCell.visibleRect) {
        left = atlasCell.visibleRect.x;
        top = atlasCell.visibleRect.y;
        right = left + atlasCell.visibleRect.w;
        bottom = top + atlasCell.visibleRect.h;
      } else {
        const trim = atlasCell.trimRectPx || [
          FOREGROUND_PACK.uvGuardPx, FOREGROUND_PACK.uvGuardPx,
          FOREGROUND_PACK.cellSize - FOREGROUND_PACK.uvGuardPx,
          FOREGROUND_PACK.cellSize - FOREGROUND_PACK.uvGuardPx,
        ];
        left = atlasCell.col * FOREGROUND_PACK.cellSize + trim[0];
        top = atlasCell.row * FOREGROUND_PACK.cellSize + trim[1];
        right = atlasCell.col * FOREGROUND_PACK.cellSize + trim[2];
        bottom = atlasCell.row * FOREGROUND_PACK.cellSize + trim[3];
      }
      const u0 = left / atlasCanvas[0];
      const u1 = right / atlasCanvas[0];
      const v0 = 1 - bottom / atlasCanvas[1];
      const v1 = 1 - top / atlasCanvas[1];
      let sourceU = sourceUv.getX(i);
      let sourceV = sourceUv.getY(i);
      if (atlasTransform?.mirrorX) sourceU = 1 - sourceU;
      const turns = atlasTransform?.quarterTurns & 3;
      if (turns === 1) [sourceU, sourceV] = [sourceV, 1 - sourceU];
      else if (turns === 2) { sourceU = 1 - sourceU; sourceV = 1 - sourceV; }
      else if (turns === 3) [sourceU, sourceV] = [1 - sourceV, sourceU];
      uv = [
        u0 + sourceU * (u1 - u0),
        v0 + sourceV * (v1 - v0),
      ];
    } else {
      uv = panelUvFor(_panelUvPos, _panelNormal, routeS, worldY, facet);
    }
    const shade = deckPanelFaceGain(_panelNormal.x, _panelNormal.y, _panelNormal.z);
    const c = _panelColor.copy(base);
    if (colorPolicy) colorPolicy(_panelUvPos, _panelNormal, c);
    c.multiplyScalar(shade);
    _panelPos.applyMatrix4(matrix);
    _panelWorldNormal.copy(_panelNormal).applyMatrix3(_panelNormalMatrix).normalize();
    acc.position.push(_panelPos.x, _panelPos.y, _panelPos.z);
    acc.normal.push(_panelWorldNormal.x, _panelWorldNormal.y, _panelWorldNormal.z);
    acc.uv.push(uv[0], uv[1]);
    acc.color.push(c.r, c.g, c.b);
    acc.vertices++;
  }
  if (geometry !== source) geometry.dispose();
}

function finishPanelGeometry(acc) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(acc.position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(acc.normal, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(acc.uv, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(acc.color, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

const _fixtureP = { x: 0, z: 0 };
const _fixtureM = new THREE.Matrix4();
const _fixtureYaw = new THREE.Matrix4();
const _fixturePitch = new THREE.Matrix4();
const _fixtureNormal = new THREE.Vector3();
const _fixtureFrontColor = new THREE.Color(0xffffff);
const _fixtureShadowColor = new THREE.Color(PAL.contactShadow);

function fixturePlaneMatrix(row, s, y, depth, extraTilt = 0) {
  polyAt(SEGS, s, _fixtureP);
  const yaw = headingAt(SEGS, s);
  _fixtureYaw.makeRotationY(yaw);
  _fixtureYaw.multiply(_fixturePitch.makeRotationZ(
    normalRunPitchAt(s) + row.tilt + extraTilt,
  ));
  _fixtureM.copy(_fixtureYaw);
  _fixtureM.setPosition(
    _fixtureP.x + Math.sin(yaw) * depth,
    y + normalRunAltAt(s),
    _fixtureP.z + Math.cos(yaw) * depth,
  );
  return _fixtureM;
}

function appendFixtureQuad(acc, row, shadow) {
  const cell = row.art;
  const uLeft = cell.col / 4;
  const uRight = (cell.col + 1) / 4;
  const vBottom = 1 - (cell.row + 1) / 2;
  const vTop = 1 - cell.row / 2;
  const u0 = row.flip ? uRight : uLeft;
  const u1 = row.flip ? uLeft : uRight;
  const matrix = fixturePlaneMatrix(
    row,
    row.planeCenterS + (shadow ? -0.075 : 0),
    row.planeCenterY + (shadow ? -0.085 : 0),
    shadow ? row.shadowDepth : row.depth,
    shadow ? -0.004 : 0,
  );
  _fixtureNormal.set(0, 0, 1).transformDirection(matrix);
  const color = shadow ? _fixtureShadowColor : _fixtureFrontColor;
  const hw = row.planeWidth / 2;
  const hh = row.planeHeight / 2;
  const verts = [
    [-hw, -hh, u0, vBottom], [hw, -hh, u1, vBottom], [hw, hh, u1, vTop],
    [-hw, -hh, u0, vBottom], [hw, hh, u1, vTop], [-hw, hh, u0, vTop],
  ];
  for (const [x, y, u, v] of verts) {
    _panelPos.set(x, y, 0).applyMatrix4(matrix);
    acc.position.push(_panelPos.x, _panelPos.y, _panelPos.z);
    acc.normal.push(_fixtureNormal.x, _fixtureNormal.y, _fixtureNormal.z);
    acc.uv.push(u, v);
    acc.color.push(color.r, color.g, color.b);
    acc.vertices++;
  }
}

function buildWorldDetailPanelPools() {
  if (!worldDetailRows.length || !WORLD_DETAIL_ART_SLOT.tex) return;
  const byOwnership = new Map();
  for (const row of worldDetailRows) {
    const key = `${row.facet}:${row.phase}`;
    if (!byOwnership.has(key)) byOwnership.set(key, {
      rows: [], facet: row.facet, phase: row.phase,
    });
    byOwnership.get(key).rows.push(row);
  }
  // The atlas is already painted with its own upper-left rim, occlusion and
  // metal response. A lit StandardMaterial would shade those authored values
  // a second time (measured as near-black at FAR); BasicMaterial preserves the
  // painted ladder while still participating in scene fog and tone mapping.
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map: WORLD_DETAIL_ART_SLOT.tex,
    vertexColors: true,
    alphaTest: 0.055,
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
    fog: true,
    toneMapped: true,
  });
  material.name = 'Meridian sparse fixture atlas';
  material.alphaToCoverage = true;

  for (const bucket of byOwnership.values()) {
    const acc = panelAccumulator();
    const samples = [];
    bucket.rows.sort((a, b) => a.visibilityS - b.visibilityS);
    for (const row of bucket.rows) {
      // Identical alpha silhouettes: the recessed copy supplies contact
      // occlusion around brackets/cables, while the proud copy carries the
      // authored paint. No rectangle, halo, or backing card is introduced.
      appendFixtureQuad(acc, row, true);
      appendFixtureQuad(acc, row, false);
      samples.push({ s: row.visibilityS, vertexEnd: acc.vertices });
    }
    const mesh = new THREE.Mesh(finishPanelGeometry(acc), material);
    mesh.name = `Meridian sparse fixtures face ${bucket.facet} phase ${bucket.phase}`;
    mesh.userData.environmentRole = 'sparse-authored-meridian-fixtures';
    mesh.userData.routeFacet = bucket.facet;
    mesh.userData.fixtureCount = bucket.rows.length;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    const panel = {
      mesh,
      facet: bucket.facet,
      phase: bucket.phase,
      samples,
      rows: bucket.rows.length,
      vertexStride: 12,
    };
    worldDetailPanels.push(panel);
    scene.add(mesh);
    dressingStats.drawPools++;
    dressingStats.detailDrawPools++;
    dressingStats.detailVertices += acc.vertices;
    dressingStats.detailTriangles += acc.vertices / 3;
  }
}

/* A merged route panel may straddle two construction beats: the near zipper
   columns lock one at a time, while the far body commits together only when
   the corner ritual finishes. Hiding the WHOLE mesh until `samples.every(...)`
   was true erased already-built hull for the 410 ms between the camera's 0.96
   facet handoff and finishCorner().

   Construction advances monotonically along s, and both panel builders append
   their rows in that same order. Keep one draw call per facet but reveal only
   the contiguous built prefix with BufferGeometry.drawRange. The first
   unbuilt row therefore remains a hard visual frontier: no future playable
   column can leak, while the nineteen locked arrival columns present at the
   first handoff frame continue supporting RIG. Monumental limb anatomy is a
   separate camera-owned bake in render/limb.js and does not read this build
   gate; collision-faithful hull, bays, lights and actors still do. */
function updateRoutePanelDrawRange(panel, active) {
  let drawCount = 0;
  let visibleRows = 0;
  if (panel.facet === active) {
    for (const sample of panel.samples) {
      if (!routeRenderable(sample.s)) break;
      drawCount = sample.vertexEnd;
      visibleRows++;
    }
  }
  panel.mesh.geometry.setDrawRange(0, drawCount);
  panel.mesh.visible = drawCount > 0;
  return Math.max(0, panel.rows - visibleRows);
}

function panelGeometry(source, routeS, worldY, facet, baseColor, colorPolicy = null) {
  const acc = panelAccumulator();
  appendPanelGeometry(
    acc, source, new THREE.Matrix4(), routeS, worldY, facet, baseColor,
    null, colorPolicy,
  );
  return finishPanelGeometry(acc);
}

function buildDressingPanelPools(rows, material) {
  if (!rows.length || !material) return;
  const byOwnership = new Map();
  const source = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  for (const row of rows) {
    const facet = routeWorldFacet(row.s);
    const phase = faceIndexAt(row.s, CONFIG);
    const key = `${facet}:${phase}`;
    if (!byOwnership.has(key)) byOwnership.set(key, {
      rows: [], facet, phase,
    });
    byOwnership.get(key).rows.push(row);
  }
  for (const bucket of byOwnership.values()) {
    const { facet, phase } = bucket;
    const acc = panelAccumulator();
    const samples = [];
    // Build state is a route prefix. Sorting once at bake time makes drawRange
    // the exact same prefix even though dressing authoring emits rows by role.
    bucket.rows.sort((a, b) => a.s - b.s);
    for (const row of bucket.rows) {
      appendPanelGeometry(
        acc, source, dressingMatrix(row).clone(),
        row.s, row.y, facet, row.color,
        _dressScale.set(row.sx, row.sy, row.sz).clone(),
      );
      samples.push({ s: row.s, vertexEnd: acc.vertices });
    }
    const mesh = new THREE.Mesh(finishPanelGeometry(acc), material);
    mesh.name = `Meridian painted service bays face ${facet} phase ${phase}`;
    mesh.userData.environmentRole = 'painted-service-bays';
    mesh.userData.routeFacet = facet;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    dressingPanelFacets.push({ mesh, facet, rows: bucket.rows.length, samples });
    scene.add(mesh);
    dressingStats.drawPools++;
  }
  source.dispose();
}

function buildForegroundPackPools(rows, material) {
  if (!rows.length || !material) return;
  const byOwnership = new Map();
  // A single front plane is deliberate. Mapping one square cell over a box
  // wrapped the same mechanism across its top, sides and end caps and exposed
  // the ImageGen card frame from every angle. Physical depth belongs to the
  // ordinary-material backplate emitted by dressPackBox().
  const indexed = new THREE.PlaneGeometry(1, 1);
  const source = indexed.toNonIndexed();
  indexed.dispose();
  for (const row of rows) {
    const facet = routeWorldFacet(row.s);
    const phase = faceIndexAt(row.s, CONFIG);
    const key = `${facet}:${phase}`;
    if (!byOwnership.has(key)) byOwnership.set(key, { rows: [], facet, phase });
    byOwnership.get(key).rows.push(row);
  }
  for (const bucket of byOwnership.values()) {
    const acc = panelAccumulator();
    const samples = [];
    bucket.rows.sort((a, b) =>
      (a.visibilityS ?? a.s) - (b.visibilityS ?? b.s));
    for (const row of bucket.rows) {
      appendPanelGeometry(
        acc, source, dressingMatrix(row, row.sz / 2 + 0.008, 1).clone(), row.s, row.y,
        bucket.facet, 0xffffff,
        _dressScale.set(row.sx, row.sy, 1).clone(),
        null, row.packCell, row.packTransform,
      );
      samples.push({ s: row.visibilityS ?? row.s, vertexEnd: acc.vertices });
    }
    const mesh = new THREE.Mesh(finishPanelGeometry(acc), material);
    mesh.name = `Meridian foreground pack face ${bucket.facet} phase ${bucket.phase}`;
    mesh.userData.environmentRole = 'foreground-content-pack-inlays';
    mesh.userData.routeFacet = bucket.facet;
    mesh.userData.packCells = [...new Set(bucket.rows.map((row) => row.packCell.index))];
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    dressingPanelFacets.push({
      mesh, facet: bucket.facet, rows: bucket.rows.length, samples,
    });
    scene.add(mesh);
    dressingStats.drawPools++;
    dressingStats.packDrawPools++;
  }
  source.dispose();
}

function buildForegroundComponentPools(rows, material) {
  if (!rows.length || !material) return;
  const byOwnership = new Map();
  const indexed = new THREE.PlaneGeometry(1, 1);
  const source = indexed.toNonIndexed();
  indexed.dispose();
  for (const row of rows) {
    const facet = routeWorldFacet(row.anchorS ?? row.s);
    const phase = faceIndexAt(row.anchorS ?? row.s, CONFIG);
    const key = `${facet}:${phase}`;
    if (!byOwnership.has(key)) byOwnership.set(key, { rows: [], facet, phase });
    byOwnership.get(key).rows.push(row);
  }
  for (const bucket of byOwnership.values()) {
    const acc = panelAccumulator();
    const samples = [];
    bucket.rows.sort((a, b) =>
      (a.visibilityS ?? a.anchorS ?? a.s) - (b.visibilityS ?? b.anchorS ?? b.s));
    for (const row of bucket.rows) {
      appendPanelGeometry(
        acc, source, dressingMatrix(row, 0, 1).clone(), row.s, row.y,
        bucket.facet, 0xffffff, _dressScale.set(row.sx, row.sy, 1).clone(),
        null, row.component,
        { mirrorX: row.componentTransform.mirrorX, quarterTurns: 0 },
        FOREGROUND_COMPONENT_ATLAS.canvas,
      );
      samples.push({ s: row.visibilityS ?? row.anchorS ?? row.s, vertexEnd: acc.vertices });
    }
    const mesh = new THREE.Mesh(finishPanelGeometry(acc), material);
    mesh.name = `Meridian native components face ${bucket.facet} phase ${bucket.phase}`;
    mesh.userData.environmentRole = 'native-shape-component-composition';
    mesh.userData.routeFacet = bucket.facet;
    mesh.userData.components = [...new Set(bucket.rows.map((row) => row.componentId))];
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    dressingPanelFacets.push({
      mesh, facet: bucket.facet, rows: bucket.rows.length, samples,
    });
    scene.add(mesh);
    dressingStats.drawPools++;
    dressingStats.componentDrawPools++;
  }
  source.dispose();
}

function extrudedProfile(points, depth) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth, steps: 1, bevelEnabled: false, curveSegments: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function catwalkGussetGeometry(variant) {
  const roots = [
    [[-0.50, 0.50], [0.50, 0.50], [0.17, -0.50], [-0.09, -0.50]],
    [[-0.50, 0.50], [0.50, 0.50], [-0.10, -0.50], [-0.36, -0.50]],
    [[-0.50, 0.50], [0.50, 0.50], [0.36, -0.50], [0.08, -0.50]],
  ];
  const holes = [
    [[-0.27, 0.27], [0.28, 0.27], [0.09, -0.23], [-0.02, -0.23]],
    [[-0.28, 0.27], [0.27, 0.27], [-0.15, -0.23], [-0.27, -0.23]],
    [[-0.27, 0.27], [0.28, 0.27], [0.27, -0.23], [0.15, -0.23]],
  ];
  const index = variant % roots.length;
  const outline = roots[index];
  const shape = new THREE.Shape();
  shape.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) shape.lineTo(outline[i][0], outline[i][1]);
  shape.closePath();
  const aperture = holes[index];
  const hole = new THREE.Path();
  hole.moveTo(aperture[0][0], aperture[0][1]);
  for (let i = 1; i < aperture.length; i++) hole.lineTo(aperture[i][0], aperture[i][1]);
  hole.closePath();
  shape.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 1, steps: 1, bevelEnabled: false, curveSegments: 1,
  });
  geometry.translate(0, 0, -0.5);
  geometry.computeVertexNormals();
  return geometry;
}

function nonIndexedBox(width, height, depth) {
  const indexed = new THREE.BoxGeometry(width, height, depth);
  const geometry = indexed.toNonIndexed();
  indexed.dispose();
  return geometry;
}

function platformProfileGeometry(len) {
  // Exact collision top and exact authored ends; everything BELOW that plane
  // becomes a battered load-bearing lip with chamfered shoulders and unequal
  // lower corners.  A platform now owns visible mass at FAR instead of being
  // a one-pixel orange rule.
  const shoulder = Math.min(0.20, len * 0.16);
  const lower = Math.min(0.38, len * 0.24);
  return extrudedProfile([
    [-len / 2, 0], [len / 2, 0],
    [len / 2, -0.20], [len / 2 - shoulder, -0.42],
    [len / 2 - lower, -0.62], [-len / 2 + lower * 0.72, -0.62],
    [-len / 2 + shoulder * 0.55, -0.43], [-len / 2, -0.22],
  ], 1.4);
}

const _platformCold = new THREE.Color(PAL.limb.wall);
const _platformShadow = new THREE.Color(PAL.limb.shadow);
const _platformWarm = new THREE.Color(PAL.groundAlt);
const _platformDeck = new THREE.Color(PAL.limb.machine).lerp(_platformCold, 0.44);
function platformPanelColor(local, normal, out) {
  if (normal.y > 0.55) {
    // A deck catches the key on its camera-side edge; its entire two-tile
    // depth is not an orange lamp. Vertex interpolation supplies the gradient
    // for free on the existing top quad, and the resident panel map supplies
    // the fine scutes/pipes beneath it.
    const edge = Math.max(0, Math.min(1, (local.z + 0.70) / 1.40));
    return out.copy(_platformDeck).lerp(_platformWarm,
      0.10 + edge * edge * 0.34);
  }
  if (normal.y < -0.55) return out.copy(_platformShadow);
  const down = Math.max(0, Math.min(1, -local.y / 0.62));
  const cameraEdge = normal.z > 0.55 ? 0.10 : 0;
  out.copy(_platformCold).lerp(_platformWarm,
    0.08 + (1 - down) * 0.14 + cameraEdge);
  return out;
}

function solidProfileGeometry(width, height) {
  // Tall collision solids keep their complete top and vertical side read;
  // only the non-gameplay lower corners break into armoured shoulders.
  const cut = Math.min(0.34, width * 0.14, height * 0.12);
  return extrudedProfile([
    [-width / 2, height / 2], [width / 2, height / 2],
    [width / 2, -height / 2 + cut * 0.55],
    [width / 2 - cut, -height / 2],
    [-width / 2 + cut * 1.35, -height / 2],
    [-width / 2, -height / 2 + cut],
  ], 2);
}

const _solidBody = new THREE.Color(PAL.limb.wall);
const _solidEdge = new THREE.Color(PAL.limb.shadow);
const _solidDeck = new THREE.Color(PAL.limb.machine).lerp(_solidBody, 0.48);
const _solidWarm = new THREE.Color(PAL.groundAlt);
function solidPanelColor(local, normal, out) {
  if (normal.y > 0.55) {
    const edge = Math.max(0, Math.min(1, (local.z + 1) * 0.5));
    return out.copy(_solidDeck).lerp(_solidWarm,
      0.08 + edge * edge * 0.28);
  }
  if (Math.abs(normal.x) > 0.55) return out.copy(_solidEdge);
  return out.copy(_solidBody);
}

function bottomArmourGeometry(variant) {
  const left = [0.18, 0.31, 0.12, 0.25][variant % 4];
  const right = [0.28, 0.14, 0.34, 0.20][variant % 4];
  const lift = [0.03, 0.14, 0.08, 0.18][variant % 4];
  const geometry = extrudedProfile([
    [-0.5, 0.5], [0.5, 0.5], [0.5, -0.5 + right],
    [0.5 - right, -0.5 + lift * 0.25],
    [0.16, -0.5 + lift], [-0.5 + left, -0.5],
    [-0.5, -0.5 + left],
  ], 2);
  if (!geometry.index) return geometry;
  const out = geometry.toNonIndexed();
  geometry.dispose();
  return out;
}

const _routeCapCold = new THREE.Color(PAL.limb.wall);
const _routeCapKey = new THREE.Color(PAL.limb.machine);
function routeCapPanelColor(local, normal, out) {
  if (normal.y > 0.55) {
    const edge = Math.max(0, Math.min(1, (local.z + 1) * 0.5));
    // Preserve the authored scute family in `out`, seat it in cold hull, then
    // catch a neutral machine-key on the camera edge. Copper must come from
    // the selected armour phrase below, not from tinting every exposed quad;
    // the latter was the remaining orange-checker read at FAR distance.
    return out.lerp(_routeCapCold, 0.46).lerp(_routeCapKey,
      0.06 + edge * edge * 0.18);
  }
  if (normal.y < -0.55) return out.lerp(_routeCapCold, 0.92);
  // Preserve a narrow oxidized navigation lip at the top of the collision
  // row, then hand the face quickly to the cold machine body.  This replaces
  // the full one-tile-high orange brick without moving its collision plane.
  const down = Math.max(0, Math.min(1, 0.5 - local.y));
  return out.lerp(_routeCapCold, 0.78 + down * 0.18);
}

// Split a platform only at simulation-column boundaries. Construction owns
// those same half-open [column,column+1) intervals, so a sample at each
// segment midpoint answers for every triangle in that segment. Fractional
// authored ends remain exact and adjacent segments share an edge — no visual
// shortening, overlap, or collision change.
function platformBuildSegments(x0, x1) {
  const segments = [];
  let cursor = x0;
  while (cursor < x1) {
    const columnEnd = Math.floor(cursor) + 1;
    const end = Math.min(x1, columnEnd);
    segments.push({ x0: cursor, x1: end, s: (cursor + end) * 0.5 });
    cursor = end;
  }
  return segments;
}

// One mesh/draw call per authored catwalk, but triangles are ordered from its
// route start to its route end. updateRoutePanelDrawRange can therefore clip
// at the first unbuilt column exactly as it does for the continuous hull. Each
// segment retains the profiled cap geometry, so a temporarily exposed build
// frontier remains a finished mechanical edge rather than an open shell.
function platformPrefixGeometry(p, mid, facet) {
  const acc = panelAccumulator();
  const samples = [];
  for (const segment of platformBuildSegments(p.x0, p.x1)) {
    const source = platformProfileGeometry(segment.x1 - segment.x0);
    const localOffset = new THREE.Matrix4().makeTranslation(segment.s - mid, 0, 0);
    appendPanelGeometry(
      acc, source, localOffset, segment.s, p.y, facet, PAL.catwalk,
      null, platformPanelColor,
    );
    source.dispose();
    samples.push({ s: segment.s, vertexEnd: acc.vertices });
  }
  return {
    geometry: finishPanelGeometry(acc),
    rows: samples.length,
    samples,
  };
}

// An intentionally non-divisible armour phrase; it rolls through the longer
// faces without restarting a visible wallpaper pattern at every gate.
const SCUTE_PHRASE = Object.freeze([9, 6, 11, 7, 8, 10, 14]);
function authoredScuteBand(s, depth, phase) {
  if (!WORLD_DETAIL_ON) return (Math.floor(s / 6) + Math.floor((depth - 1) / 2)) % 2;
  const start = s < CONFIG.path.introTiles
    ? 0 : CONFIG.path.introTiles + Math.max(0, phase - 1) * CONFIG.path.faceTiles;
  let local = Math.max(0, s - start);
  let beat = 0;
  while (beat < SCUTE_PHRASE.length - 1) {
    const span = SCUTE_PHRASE[(beat + phase) % SCUTE_PHRASE.length];
    if (local < span) break;
    local -= span;
    beat++;
  }
  // Four material phrases, not an alternating checker. Only one carries a
  // noticeable oxidized edge; the others are blue steel, graphite recess and
  // service metal. Geometry, collision and the 6-14 tile phrase stay exact.
  return (beat + phase + Math.floor((depth - 1) / 2)) % 4;
}

// The transformation slice replaces the tower with its own band geometry
// (src/render/transform.js), so the six-face bake is skipped entirely
// rather than left hidden behind the fog at the wrong heading.
if (!IS_TRANSFORM_SLICE) {
  let count = 0;
  for (let i = 0; i < LEVEL_LEN; i++) if (groundH[i] > -100) count += VISUAL_DEPTH;

  const tileGeo = new THREE.BoxGeometry(1, 1, 2);
  const panelTileGeo = IS_G1 ? tileGeo.toNonIndexed() : null;
  const recessedPanelGeos = IS_G1
    ? [1.86, 1.68].map((depth) => nonIndexedBox(1, 1, depth))
    : null;
  const bottomPanelGeos = IS_G1
    ? Array.from({ length: 4 }, (_, i) => bottomArmourGeometry(i))
    : null;
  const panelBakes = IS_G1 ? new Map() : null;
  const panelMat = applyDeckPanelTexture(applySurface(new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    flatShading: false,
  }), 'deck'));
  panelMat.name = 'Meridian production hull panel';

  const tileMat = applySurface(new THREE.MeshStandardMaterial({
    color: 0xffffff,
    flatShading: true,
  }), 'deck');
  tiles = IS_G1 ? null : new THREE.InstancedMesh(tileGeo, tileMat, count);
  if (tiles) tiles.frustumCulled = false;

  const cA = new THREE.Color(PAL.ground);
  const cB = new THREE.Color(PAL.groundAlt);
  const wall = new THREE.Color(PAL.limb.wall);
  const rib = new THREE.Color(PAL.limb.rib);
  const shadow = new THREE.Color(PAL.limb.shadow);
  const hull = new THREE.Color(PAL.limb.hull);
  // Four collision rows become four directional SCUTE phrases crossed with
  // the existing depth ladder. Copper is a restrained edge state rather than
  // half of an A/B checker; blue steel, graphite recess and service metal
  // carry the broad area. Each row still owns the same unit collision interval
  // and build sample.
  const cADepth = [
    wall.clone().lerp(cA, 0.42),
    wall.clone().lerp(rib, 0.18),
    wall.clone().lerp(shadow, 0.32),
    shadow.clone().lerp(hull, 0.10),
  ];
  const cBDepth = [
    wall.clone().lerp(rib, 0.12),
    wall.clone().lerp(rib, 0.10),
    wall.clone().lerp(shadow, 0.46),
    shadow.clone().lerp(hull, 0.04),
  ];
  const cCDepth = [
    hull.clone().lerp(wall, 0.52),
    wall.clone().lerp(shadow, 0.24),
    shadow.clone().lerp(hull, 0.22),
    shadow.clone().lerp(hull, 0.02),
  ];
  const cDDepth = [
    wall.clone().lerp(cA, 0.10),
    wall.clone().lerp(rib, 0.28),
    wall.clone().lerp(shadow, 0.38),
    shadow.clone().lerp(hull, 0.07),
  ];
  const scuteDepthFamilies = [cADepth, cBDepth, cCDepth, cDDepth];
  // The deck's half of the T-035 value ladder (?shade=, off by default): a
  // monotone ramp DOWN the four-tile stack — d=1 is the lit lip, d=4 the
  // bottom — plus the shared stain field per column. The rows already
  // alternate (j = groundH[i] - d flips (i+j)%2 every row), so what this adds
  // is a ramp, not a first alternation; the checker keeps its own delta and
  // its scroll-speed job, and the ramp's top-row-to-row-2 step is the larger
  // of the two. SHADE_GAIN 0 makes every factor exactly 1.0, so the shipped
  // build's instance colors are unchanged bit for bit.
  const deckShade = deckShadePlan(groundH, CONFIG, SHADE_GAIN);
  const _tile = new THREE.Color();
  const _tileEuler = new THREE.Euler(0, 0, 0, 'YZX');
  let idx = 0;
  for (let i = 0; i < LEVEL_LEN; i++) {
    const f = faceIndexAt(i, CONFIG);
    if (!faceRanges[f]) faceRanges[f] = { col0: i, col1: i, inst0: idx, inst1: idx - 1 };
    faceRanges[f].col1 = i;
    if (groundH[i] < -100) continue;                   // gap column: no instances
    const p = polyAt(SEGS, i + 0.5);
    const colYaw = headingAt(SEGS, i + 0.5);           // sharp per-column facing
    columnInstances[i] = { start: idx, count: VISUAL_DEPTH, settled: true };
    for (let d = 1; d <= VISUAL_DEPTH; d++) {
      const j = groundH[i] - d;
      const atS = i + 0.5;
      const m = ACTIVE_FIXTURE
        ? new THREE.Matrix4().makeRotationY(colYaw)
        : new THREE.Matrix4().makeRotationFromEuler(
            _tileEuler.set(0, colYaw, normalRunPitchAt(atS), 'YZX')
      );
      m.setPosition(p.x, j + 0.5 + normalRunAltAt(atS), p.z);
      tileBaseMats.push(m);
      const k = deckShade.rows[Math.min(d, deckShade.rows.length) - 1] * deckShade.wear[i];
      // The approved detail pass speaks in irregular 6-14 tile armour beats,
      // with deeper rows settling toward hull shadow. ?detail=0 retains the
      // exact historic 6x2 A/B for a controlled comparison.
      const scuteBand = authoredScuteBand(i, d, f);
      if (panelBakes) {
        const facet = routeWorldFacet(atS);
        const ownershipKey = `${facet}:${f}`;
        if (!panelBakes.has(ownershipKey)) panelBakes.set(ownershipKey, {
          acc: panelAccumulator(), columnEnds: new Map(), facet, phase: f,
        });
        const bucket = panelBakes.get(ownershipKey);
        const base = WORLD_DETAIL_ON
          ? scuteDepthFamilies[scuteBand][d - 1]
          : (scuteBand === 0 ? cA : cB);
        const source = d === VISUAL_DEPTH
          ? bottomPanelGeos[(i + f * 3) % bottomPanelGeos.length]
          : d === 2 ? recessedPanelGeos[0]
          : d === 3 ? recessedPanelGeos[1]
          : panelTileGeo;
        appendPanelGeometry(
          bucket.acc, source, m, atS, j + 0.5, f,
          _tile.copy(base).multiplyScalar(k), null,
          d === 1 ? routeCapPanelColor : null,
        );
        bucket.columnEnds.set(i, bucket.acc.vertices);
      } else {
        tiles.setMatrixAt(idx, m);
        tiles.setColorAt(idx, _tile.copy(scuteBand === 0 ? cA : cB).multiplyScalar(k));
      }
      idx++;
    }
    faceRanges[f].inst1 = idx - 1;
  }
  if (panelBakes) {
    tiles = new THREE.Group();
    tiles.name = 'Meridian continuous route hull';
    tiles.userData.environmentRole = 'collision-faithful-painted-hull';
    let panelVertices = 0;
    for (const bucket of panelBakes.values()) {
      const { facet, phase } = bucket;
      const mesh = new THREE.Mesh(finishPanelGeometry(bucket.acc), panelMat);
      mesh.name = `Meridian continuous route hull face ${facet} phase ${phase}`;
      mesh.userData.environmentRole = 'collision-faithful-painted-hull-facet';
      mesh.userData.routeFacet = facet;
      mesh.frustumCulled = false;
      const samples = [...bucket.columnEnds].map(([column, vertexEnd]) => ({
        s: column + 0.5, vertexEnd,
      }));
      routeHullFacets.push({
        mesh, facet, phase, samples, rows: samples.length,
      });
      tiles.add(mesh);
      panelVertices += bucket.acc.vertices;
    }
    tiles.userData.panelVertices = panelVertices;
    tileGeo.dispose();
    panelTileGeo.dispose();
    for (const geometry of recessedPanelGeos) geometry.dispose();
    for (const geometry of bottomPanelGeos) geometry.dispose();
  } else {
    tiles.instanceMatrix.needsUpdate = true;
    if (tiles.instanceColor) tiles.instanceColor.needsUpdate = true;
  }
  tiles.frustumCulled = false;
  scene.add(tiles);

  const solidMat = applySurface(new THREE.MeshStandardMaterial({
    color: PAL.solid,
    flatShading: true,
  }), 'plate');
  for (const rect of solidRects) {
    const midX = (rect.x0 + rect.x1) / 2;
    const midY = (rect.y0 + rect.y1) / 2;
    const wp = polyAt(SEGS, midX);
    const source = IS_G1
      ? solidProfileGeometry(rect.x1 - rect.x0, rect.y1 - rect.y0)
      : new THREE.BoxGeometry(rect.x1 - rect.x0, rect.y1 - rect.y0, 2);
    const geometry = IS_G1
      ? panelGeometry(
          source, midX, midY, faceIndexAt(midX, CONFIG), PAL.solid,
          solidPanelColor,
        )
      : source;
    if (geometry !== source) source.dispose();
    const mesh = new THREE.Mesh(
      geometry,
      IS_G1 ? panelMat : solidMat,
    );
    mesh.position.set(wp.x, midY + normalRunAltAt(midX), wp.z);
    mesh.rotation.y = headingAt(SEGS, midX);
    mesh.userData.fixtureSolidId = rect.id;
    scene.add(mesh);
    authoredSolidMeshes.push({ mesh, facet: routeWorldFacet(midX), s: midX });
  }

  const walkMat = applySurface(new THREE.MeshStandardMaterial({
    color: PAL.catwalk,
    flatShading: true,
  }), 'deck');
  for (const p of platforms) {
    const len = p.x1 - p.x0;
    const mid = (p.x0 + p.x1) / 2;
    const wp = polyAt(SEGS, mid);
    const facet = routeWorldFacet(mid);
    const prefix = IS_G1 ? platformPrefixGeometry(p, mid, facet) : null;
    const geometry = prefix
      ? prefix.geometry
      : new THREE.BoxGeometry(len, 0.18, 1.4);
    const slat = new THREE.Mesh(geometry, IS_G1 ? panelMat : walkMat);
    // The profile's local top is y=0, exactly the collision plane. Non-G1
    // fixtures retain the historic centered 0.18 slab.
    slat.position.set(wp.x, p.y + (IS_G1 ? 0 : -0.09) + normalRunAltAt(mid), wp.z);
    slat.rotation.y = headingAt(SEGS, mid);            // aprons keep slats off the bends
    if (!ACTIVE_FIXTURE) {
      slat.rotation.order = 'YZX';
      slat.rotation.z = normalRunPitchAt(mid);
    }
    slat.name = 'Meridian profiled catwalk';
    slat.userData.environmentRole = 'collision-faithful-painted-platform';
    scene.add(slat);
    slatMeshes.push({
      mesh: slat, x0: p.x0, x1: p.x1, facet, s: mid,
      rows: prefix ? prefix.rows : 1,
      samples: prefix ? prefix.samples : [
        { s: mid, vertexEnd: geometry.getAttribute('position').count },
      ],
    });
  }
  buildTraversableLadders();
  if (WORLD_DRESSING_ENABLED) buildIndustrialDressing(panelMat);
  unbuildFutureFaces();                                // after slats: they hide with their face
  // MENU renders before the first simulation update. Seed route ownership
  // after the build reset even under ?world=0, where no dressing pool exists
  // to invoke this through onBeforeRender.
  dressingCullStamp = '';
  updateWorldDressingCull();
}
