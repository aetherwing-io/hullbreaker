/* ======================== RENDERER / SCENE ======================== */
/* The one renderer, scene, and camera. Every other render module adds meshes
   to this scene; the simulation never sees it.

   The light rig moved to ./lights.js (+ ./lightrig.js for its descriptors and
   arithmetic) when decisions.md entry 18 authorized a real one: a key, a
   fill, a rim, a shadow map fitted to the play band, and exposure. It is
   still exactly one rig, installed from exactly one place — here, one line
   after the scene exists, and before any other module can add a mesh, which
   is what lets it decide what each mesh does with light without reaching
   into a dozen lane-owned files. ?light=flat restores the pre-T-047 rig. */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { QUERY } from '../mode.js';
import { resolveRenderPixelRatio } from '../pure/render-budget.js';
import { PAL } from './palette.js';
import { installLightRig } from './lights.js';

export const renderer = new THREE.WebGLRenderer({ antialias: true });

// `?renderbudget=legacy` is a measurement escape hatch for the previous DPR
// policy. It is intentionally not a quality setting in the UI: the bounded
// path preserves the same ratio on ordinary screens and only reins in very
// large Retina backing stores where the old "budget" was not actually a cap.
export const RENDER_BUDGETED = QUERY.get('renderbudget') !== 'legacy';

// Preserve the authored camera scale while buying actual sub-pixel coverage.
// Making every sprite/world unit larger and pulling the camera back by the
// same ratio produces the identical projection and therefore zero extra
// detail.  Rendering that projection above display resolution and letting
// the browser downsample it does sharpen geometry, alpha cutouts and diagonal
// rails without making RIG look any larger against the Meridian.
export function renderPixelRatio(
  dpr = devicePixelRatio,
  width = innerWidth,
  height = innerHeight,
  budgeted = RENDER_BUDGETED,
) {
  return resolveRenderPixelRatio(dpr, width, height, budgeted);
}

// DPR can change without a reload (dragging between displays, browser zoom,
// phone rotation changing the compact bucket). WebGLRenderer does not follow
// it on its own: setSize() keeps using the ratio captured at boot. Keep the
// one renderer's backing-store policy live, while leaving every authored
// camera/world dimension alone.
export function syncRenderPixelRatio(
  dpr = devicePixelRatio,
  width = innerWidth,
  height = innerHeight,
) {
  const ratio = renderPixelRatio(dpr, width, height);
  if (renderer.getPixelRatio() !== ratio) renderer.setPixelRatio(ratio);
  return ratio;
}

syncRenderPixelRatio();
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

// Registered before camera.js and post.js listeners. A resize therefore
// updates the backing-store ratio first; their normal size/projection work
// then consumes the new value before the next frame.
addEventListener('resize', () => syncRenderPixelRatio());

export const scene = new THREE.Scene();
// fog matched to background, by construction: both come from the one token
scene.background = new THREE.Color(PAL.bg);
scene.fog = new THREE.Fog(PAL.bg, CONFIG.fog.near, CONFIG.fog.far);

export const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, innerWidth / innerHeight, 0.1, 200);

export const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);   // shared "invisible instance" matrix

// Read-only, allocation-only-when-requested telemetry. Captures and perf
// probes use this instead of each publishing their own renderer globals.
// The vectors are retained so repeated snapshots do not manufacture THREE
// objects; returned plain objects are structured-cloneable.
const resourceCssSize = new THREE.Vector2();
const resourceDrawSize = new THREE.Vector2();

export function rendererResourceSnapshot() {
  renderer.getSize(resourceCssSize);
  renderer.getDrawingBufferSize(resourceDrawSize);
  const info = renderer.info;
  return {
    policy: RENDER_BUDGETED ? 'bounded' : 'legacy',
    pixelRatio: renderer.getPixelRatio(),
    css: { width: resourceCssSize.x, height: resourceCssSize.y },
    drawingBuffer: { width: resourceDrawSize.x, height: resourceDrawSize.y },
    drawingPixels: resourceDrawSize.x * resourceDrawSize.y,
    draw: {
      calls: info.render.calls,
      triangles: info.render.triangles,
      points: info.render.points,
      lines: info.render.lines,
    },
    memory: {
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: Array.isArray(info.programs) ? info.programs.length : 0,
    },
  };
}

installLightRig(renderer, scene);
