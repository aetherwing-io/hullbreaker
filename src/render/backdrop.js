/* ========================== BACKDROP LAYERS ========================== */
/* Five generated 2D plates (assets/generated/backdrops/) replacing the flat
   scene.background/limbBg color with actual creature anatomy receding into
   the haze — decisions.md entry 16 ("sprites are authorized... the shortest
   path from the concept boards to the screen") and entry 17 ("selling the
   scale is the headline art problem"). See src/config.js's BACKDROP_TUNE
   block and src/render/backdrop-table.js for the placement data and the two
   derived fences (play-band clearance, FAR-view frame coverage) this module
   builds meshes from.

   STATIC ANATOMY (decisions.md entry 3), END TO END. Every quad below is
   placed ONCE, from the authored plan, and is never touched again after boot
   — no per-frame hook, no ritual hook, no build hook, exactly the discipline
   src/render/limb.js's own header states for its box tiers. The apparent
   parallax — a near plate sweeping the frame faster than a far one — comes
   entirely from the CAMERA moving along the same polyline it already drives
   through every corner (src/pure/path.js's SEGS); nothing here computes its
   own position from a clock or a lagged state.

   WHY src/main.js IMPORTS THIS MODULE, NOT src/render/scene.js. This module
   needs the shared preload gate (./preload.js), which itself imports
   `renderer` from ./scene.js. Module dependencies fully evaluate before the
   IMPORTING module's own top-level code runs, no matter where in the source
   the import sits — so if scene.js were the one importing this file (a real
   attempt, reverted), scene.js's own `renderer`/`scene` consts could never
   be assigned before this module (and preload.js beneath it) needed them:
   a real cycle, proven three ways (static import, awaited dynamic import,
   deferred dynamic import) to either deadlock the boot outright or leave
   this module permanently unable to call `scene.add()` — the TDZ never
   clears, because scene.js's body cannot start until THIS module finishes,
   and this module cannot finish without reading `scene`. src/render/
   sprites.js sidesteps the same shared dependency on preload.js cleanly
   because it is reached from src/main.js AFTER main.js's own
   `import { camera, renderer, scene } from './render/scene.js'` line — by
   then scene.js has already fully evaluated, so preload.js's read of
   `renderer` is an ordinary forward dependency, not a cycle. This module is
   wired the same way: imported by src/main.js alongside the other
   side-effect render imports, after the scene.js import.

   DEGRADE SAFELY (entry 16's condition). A plate that fails or times out
   simply never gets a mesh — the existing flat/limb background stays
   exactly what it was before this task, visibly and safely. The whole
   registration+build sequence sits behind one try/catch: a bug in this
   module's own arithmetic must never be able to take the renderer, or the
   rest of the boot, down with it.

   ?backdrop=flat — the A/B: no quads are registered, no meshes are built,
   and scene.background/fog are untouched by this module (byte-identical to
   the pre-T-051 tree in that mode). */

import * as THREE from 'three';
import { BACKDROP_TUNE, CONFIG } from '../config.js';
import { SEGS, faceIndexAt, headingAt, polyAt } from '../pure/path.js';
import { IS_TRANSFORM_SLICE, QUERY } from '../mode.js';
import { scrollX } from '../sim/time.js';
import { faceMidS, plateSize, resolveBackdropOn } from './backdrop-table.js';
import { preloadTexture, awaitPreloads } from './preload.js';
import { scene } from './scene.js';
import { PAL } from './palette.js';
import { buildMeridianAtmosphere } from './atmosphere.js';

export const BACKDROP_ON = resolveBackdropOn(QUERY.get('backdrop'), IS_TRANSFORM_SLICE);

// one slot per placement: { placement, state: 'off'|'pending'|'ready'|'failed', tex, error, mesh }
const slots = [];
let built = 0;
let atmosphere = { built: 0, textureCount: 0, depth: null, stages: [] };
let depthMattesBuilt = 0;
const macroBody = { state: BACKDROP_ON ? 'pending' : 'off', tex: null, error: null };

/* Everything below is one try/catch, deliberately: an author bug in this
   module's own arithmetic (a bad lookup, a NaN dimension) must degrade the
   same way a network failure does — no mesh for the affected slot(s), never
   a thrown error escaping this module. `buildPlate` carries its own inner
   try/catch too, so one bad slot cannot cost the others their meshes. */
try {
  const BD = BACKDROP_TUNE;

  for (const placement of BD.placements) {
    const plate = BD.plates[placement.plate];
    const slot = {
      placement, state: BACKDROP_ON ? 'pending' : 'off', tex: null, error: null, mesh: null,
    };
    slots.push(slot);
    if (!BACKDROP_ON) continue;
    const url = new URL(BD.root + plate.file, import.meta.url).href;
    preloadTexture(url).then((entry) => {
      if (entry.state === 'ready') { slot.tex = entry.tex; slot.state = 'ready'; return; }
      slot.state = 'failed';
      slot.error = entry.error || entry.state;
      console.warn('HULLBREAKER art: backdrop ' + placement.plate + ' (' + plate.file +
        ') did not load (' + slot.error + ') — the existing flat/limb backdrop stays up there.');
    });
  }

  // One coherent macro-body image is folded into the procedural storm veil
  // after preload. It does not become a separate sticker/draw call: the
  // atmosphere painter composites it into the same canvases it softens.
  if (BACKDROP_ON) {
    const macroUrl = new URL(
      '../../assets/generated/backdrops/backdrop-meridian-coils-v3.png', import.meta.url,
    ).href;
    preloadTexture(macroUrl).then((entry) => {
      if (entry.state === 'ready') {
        macroBody.tex = entry.tex;
        macroBody.state = 'ready';
      } else {
        macroBody.state = 'failed';
        macroBody.error = entry.error || entry.state;
        console.warn('HULLBREAKER art: coherent macro-body plate did not load (' +
          macroBody.error + ') -- keeping the procedural storm depth layer.');
      }
    });
  }

  /* THE BOOT GATE. Same contract as src/render/sprites.js's own top-level
     await: everything registered above is resident (or abandoned) before
     this line returns, so no decode/upload from this module's textures can
     land inside a frame the sim is stepping. Never rejects, never hangs
     past the shared budget. */
  await awaitPreloads();

  const _euler = new THREE.Euler();

  /* The original scale pass still supplies useful parallax and enormous
     forms, but its near/mid/far box chains become literal hanging rectangles
     wherever the camera catches their undersides.  Do not delete that depth:
     grade it through a curved, facet-local aerial-perspective matte before
     the painted coil/storm shells draw.  The matte sits just in front of the
     nearest legacy tier (-14), entirely above the combat band, and shares the
     sky token.  Consequently it reduces contrast rather than introducing a
     new coloured card; the old geometry survives as distant mass while its
     individual box edges stop reading as a ceiling made from greybox slabs.

     A softly irregular lower contour, wide side feathers and a shallow
     world-space curve are all deliberate.  A rectangular alpha ramp on a
     flat PlaneGeometry fixed the settled shot and immediately revealed its
     four edges during a corner. */
  const MATTE_W = CONFIG.path.faceTiles * 1.82;
  const MATTE_H = 56;
  const MATTE_BASE_Y = 11.5;
  const MATTE_DEPTH = -12.55;

  const smoothstep = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  const paintDepthMatte = () => {
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 256;
    const g = cv.getContext('2d');
    const pixels = g.createImageData(cv.width, cv.height);
    for (let y = 0; y < cv.height; y++) {
      const v = 1 - y / (cv.height - 1); // PlaneGeometry UV: 0 is the lower edge
      for (let x = 0; x < cv.width; x++) {
        const u = x / (cv.width - 1);
        // Three broad frequencies make an organic torn/armoured horizon,
        // never per-pixel noise.  Full coverage arrives gradually above it.
        const contour = 0.055 + 0.018 * Math.sin(u * Math.PI * 4.0 + 0.4) +
          0.012 * Math.sin(u * Math.PI * 10.0 + 1.7) +
          0.008 * Math.cos(u * Math.PI * 22.0);
        const lower = smoothstep(contour, contour + 0.19, v);
        // The old matte was fully opaque at its world-space top. An adjacent
        // facet could therefore reveal that upper boundary as one enormous
        // dark wedge at the Crown. Feather it just like the storm veil.
        const upper = smoothstep(0, 0.16, 1 - v);
        const side = smoothstep(0, 0.16, u) * smoothstep(0, 0.16, 1 - u);
        // Two huge bowed pressure channels plus a broad mottled value field:
        // this matte still hides the legacy box undersides, but no longer
        // replaces them with an equally artificial sheet of flat teal.
        const sweepA = Math.exp(-Math.pow(
          (v - (0.34 + 0.075 * Math.sin(u * Math.PI * 2.1 + 0.4))) / 0.075, 2));
        const sweepB = Math.exp(-Math.pow(
          (v - (0.67 + 0.055 * Math.sin(u * Math.PI * 2.8 + 2.1))) / 0.10, 2));
        const broad = 0.5 + 0.5 * Math.sin(u * Math.PI * 3.4 + v * 2.6);
        const value = Math.round(255 * Math.max(0.70, Math.min(1,
          0.90 + broad * 0.075 - sweepA * 0.13 - sweepB * 0.085)));
        const density = 0.97 + 0.025 * Math.sin(u * Math.PI * 6.0 + v * 3.1);
        const a = Math.round(255 * lower * upper * side * density);
        const i = (y * cv.width + x) * 4;
        pixels.data[i] = value;
        pixels.data[i + 1] = value;
        pixels.data[i + 2] = value;
        pixels.data[i + 3] = a;
      }
    }
    g.putImageData(pixels, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    return tex;
  };

  const depthMatteGeometry = () => {
    const geo = new THREE.PlaneGeometry(MATTE_W, MATTE_H, 16, 1);
    const pos = geo.attributes.position;
    const halfW = MATTE_W / 2;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) / halfW;
      // Recede at the feathered sides so adjacent facet mattes meet as a
      // shallow shell, not two intersecting cards during the 60-degree turn.
      pos.setZ(i, -0.9 * u * u);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  };

  const _cameraForward = new THREE.Vector3();
  const backdropFacetGain = (face) => {
    const active = faceIndexAt(scrollX, CONFIG);
    if (active === CONFIG.path.faces + 1) return face === active ? 1 : 0;
    return Math.abs(face - active) <= 1 ? 1 : 0;
  };
  const matteFacingGain = (camera, yaw) => {
    camera.getWorldDirection(_cameraForward);
    const len = Math.hypot(_cameraForward.x, _cameraForward.z) || 1;
    const backX = -_cameraForward.x / len;
    const backZ = -_cameraForward.z / len;
    return Math.max(0, Math.sin(yaw) * backX + Math.cos(yaw) * backZ) ** 4;
  };

  const buildDepthMattes = () => {
    const texture = paintDepthMatte();
    const geometry = depthMatteGeometry();
    for (let face = 1; face <= CONFIG.path.faces + 1; face++) {
      // The Crown/outro is the short seventh visual facet. Giving its final
      // 360-degree heading a local shell prevents the opening facet's matte
      // from reappearing through the closed helix after the last corner.
      const s = face <= CONFIG.path.faces
        ? faceMidS(face, CONFIG)
        : CONFIG.path.introTiles + CONFIG.path.faceTiles * CONFIG.path.faces +
          CONFIG.path.outroTiles / 2;
      const yaw = headingAt(SEGS, s);
      const p = polyAt(SEGS, s);
      const mat = new THREE.MeshBasicMaterial({
        map: texture,
        color: PAL.limbBg,
        transparent: true,
        opacity: 0.94,
        depthWrite: false,
        depthTest: true,
        side: THREE.FrontSide,
        fog: false,
        toneMapped: false,
      });
      mat.userData.baseBackdropMatteOpacity = mat.opacity;
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.name = `Meridian deep-anatomy matte F${face}`;
      mesh.userData.environmentRole = 'backdrop-depth-matte';
      mesh.userData.backdropFace = face;
      mesh.userData.facetYaw = yaw;
      mesh.quaternion.setFromEuler(_euler.set(0, yaw, 0));
      mesh.position.set(
        p.x + Math.sin(yaw) * MATTE_DEPTH,
        MATTE_BASE_Y + MATTE_H / 2,
        p.z + Math.cos(yaw) * MATTE_DEPTH,
      );
      mesh.frustumCulled = true;
      // Legacy plates at -64, this atmospheric grade, then the three storm
      // shells at -52..-48 and finally the playable/Crown layers.
      mesh.renderOrder = -56;
      mesh.onBeforeRender = (_renderer, _scene, camera, _geometry, material) => {
        material.opacity = material.userData.baseBackdropMatteOpacity *
          matteFacingGain(camera, mesh.userData.facetYaw) *
          backdropFacetGain(mesh.userData.backdropFace);
      };
      scene.add(mesh);
      depthMattesBuilt++;
    }
  };

  // One plate, one quad.
  const buildPlate = (slot) => {
    try {
      const placement = slot.placement;
      const plate = BD.plates[placement.plate];
      const tier = BD.tiers[placement.tier];
      const { w, h, cy } = plateSize(tier, plate, CONFIG);
      const s = faceMidS(placement.face, CONFIG);
      const yaw = headingAt(SEGS, s);
      const p = polyAt(SEGS, s);
      const geo = new THREE.PlaneGeometry(w, h);
      const mat = new THREE.MeshBasicMaterial({
        map: slot.tex,
        color: PAL[tier.tint],
        transparent: true,           // the PNG's own alpha cutout
        opacity: plate.opacity ?? 1, // architectural ink recedes; Crown remains full-strength
        alphaTest: 0.02,             // discard the empty margin before it blends
        depthWrite: false,           // several plates + the limb's own backdrop
                                      //   tiers share this depth range; let THREE's
                                      //   back-to-front transparent sort order them
        side: THREE.DoubleSide,      // a corner swing can carry the view well past
                                      //   this plate's own facet heading
        fog: true,                   // dissolve into the same fog band everything
                                      //   else in the scene grades against
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `Meridian backdrop ${placement.plate} F${placement.face}`;
      mesh.userData.environmentRole = 'backdrop-plate';
      mesh.userData.backdropPlate = placement.plate;
      mesh.userData.backdropFace = placement.face;
      mesh.userData.backdropTier = placement.tier;
      mesh.userData.baseBackdropOpacity = mat.opacity;
      mesh.quaternion.setFromEuler(_euler.set(0, yaw, 0));
      mesh.position.set(p.x + Math.sin(yaw) * tier.depth, cy, p.z + Math.cos(yaw) * tier.depth);
      mesh.frustumCulled = false;    // static bake, one upload, same reasoning as limb.js
      // Transparent draw order must agree with authored world depth.  These
      // plates used to inherit renderOrder 0 while the local Crown landmark
      // deliberately renders at -30.  Both materials are transparent and
      // depthWrite=false, so a distant plate from a folded earlier facet was
      // sorted AFTER the Crown and repainted rectangular chunks across it —
      // the teal "missing geometry" visible at the summit.  Put every legacy
      // plate behind the -52..-48 storm shells; those soften it, the Crown
      // then paints at -30, and ordinary actors/effects retain their existing
      // later orders.  Physical depth still sorts plates within this lane.
      mesh.renderOrder = -64;
      mesh.onBeforeRender = (_renderer, _scene, _camera, _geometry, material) => {
        material.opacity = mesh.userData.baseBackdropOpacity *
          backdropFacetGain(mesh.userData.backdropFace);
      };
      scene.add(mesh);
      slot.mesh = mesh;
    } catch (err) {
      console.warn('HULLBREAKER art: backdrop ' + slot.placement.plate + ' failed to build (' +
        ((err && err.message) || err) + ') — the existing flat/limb backdrop stays up there.');
    }
  };

  const replacedByMacroBody = new Set(['limbSegment', 'spineCoil', 'gillCavity']);
  for (const slot of slots) {
    if (slot.state !== 'ready') continue;
    // The coherent coil plate replaces the three old single-object anatomy
    // stickers. Colony scale and the Crown remain useful distant landmarks.
    if (macroBody.tex && replacedByMacroBody.has(slot.placement.plate)) {
      slot.replaced = true;
      continue;
    }
    buildPlate(slot);
    built++;
  }
  // Fill the otherwise-flat combat-band void with a render-only depth veil.
  // It shares this module's ?backdrop=flat A/B and failure boundary.
  if (BACKDROP_ON) {
    buildDepthMattes();
    atmosphere = buildMeridianAtmosphere(scene, macroBody.tex);
  }
} catch (err) {
  console.warn('HULLBREAKER art: the backdrop layer failed to build (' +
    ((err && err.message) || err) + ') — the game continues with its existing background.');
}

/* Read surface for the console and the headless/browser gates: which plates
   are up, which slot failed and why, and whether the whole layer is armed.
   Deliberately not on window.HB (src/main.js owns that handle) — same
   placement as preload.js's __HB_PRELOAD and sprites.js's __HB_SPRITES. */
export function backdropSnapshot() {
  return {
    on: BACKDROP_ON,
    built,
    depthMattesBuilt,
    atmosphere,
    macroBody: { state: macroBody.state, error: macroBody.error },
    plates: slots.map((s) => ({
      face: s.placement.face, plate: s.placement.plate, tier: s.placement.tier,
      state: s.state, error: s.error, replaced: s.replaced === true,
    })),
  };
}
if (typeof window !== 'undefined') window.__HB_BACKDROP = backdropSnapshot;
