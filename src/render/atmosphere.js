/* ================== MERIDIAN FACET DEPTH VOLUME ==================== */
/* The backdrop is the same mechanical creature RIG is climbing, not a fog
   card behind a platform map.  Every route facet owns four fixed draws:

     far   one direct anatomy painting, gently bowed in world space
     mid   one direct transparent coil/rib painting at a nearer depth
     air   five tapered condensation ribbons merged into one 3-D mesh
     near  four structural atlas cutouts merged into one armour-fragment mesh

   At rest only the current facet is traversed; the existing camera fold gain
   admits only the legitimately arriving facet during a turn.  All geometry
   remains behind the gameplay plane and renders before actors, so this layer
   can produce parallax and occlusion against itself without ever putting RIG
   behind the fold.  Images are mapped directly from the shared preload gate:
   there is no runtime canvas, crop, texture transform or late source swap. */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { normalAscentAltAt } from '../pure/ascent.js';
import { SEGS, headingAt, polyAt } from '../pure/path.js';
import { PAL } from './palette.js';
import { faceMidS } from './backdrop-table.js';
import { cameraFaceBlendGain } from './camera.js';
import {
  MERIDIAN_DEPTH_BUDGET,
  MERIDIAN_DEPTH_LAYERS,
  MERIDIAN_DEPTH_SOURCES,
  meridianCondensationPlan,
  meridianDepthFacePlan,
} from './backdrop-depth-plan.js';

// Kept as a compatibility read for old diagnostics.  The resident direct-map
// composition is now the only production path; there is no hidden legacy
// canvas painter behind a query flag.
export const DEPTH_COMPOSITION_ON = true;

const FACE_COUNT = CONFIG.path.faces + 1;
const layerById = new Map(MERIDIAN_DEPTH_LAYERS.map((entry) => [entry.id, entry]));
const atmosphereFacetMeshes = Array.from({ length: FACE_COUNT + 1 }, () => []);
let visibleAtmosphereFacets = 0;
let visibleAtmosphereMeshes = 0;
let builtTriangles = 0;

function atmosphereFaceS(face) {
  if (face <= CONFIG.path.faces) return faceMidS(face, CONFIG);
  return CONFIG.path.introTiles + CONFIG.path.faceTiles * CONFIG.path.faces +
    CONFIG.path.outroTiles / 2;
}

function registerAtmosphereFacetMesh(mesh) {
  const face = mesh.userData.backdropFace;
  mesh.userData.facetGain = 0;
  mesh.visible = false;
  atmosphereFacetMeshes[face].push(mesh);
}

export function updateAtmosphereFacetVisibility() {
  let visibleFacets = 0;
  let visibleMeshes = 0;
  for (let face = 1; face <= FACE_COUNT; face++) {
    const gain = cameraFaceBlendGain(face);
    const active = gain > 0;
    const meshes = atmosphereFacetMeshes[face];
    if (active && meshes.length) visibleFacets++;
    for (let i = 0; i < meshes.length; i++) {
      const mesh = meshes[i];
      mesh.userData.facetGain = gain;
      mesh.visible = active;
    }
    if (active) visibleMeshes += meshes.length;
  }
  visibleAtmosphereFacets = visibleFacets;
  visibleAtmosphereMeshes = visibleMeshes;
  return visibleMeshes;
}

export function atmosphereFacetVisibilitySnapshot() {
  let totalMeshes = 0;
  for (let face = 1; face <= FACE_COUNT; face++)
    totalMeshes += atmosphereFacetMeshes[face].length;
  return {
    totalFacets: FACE_COUNT,
    visibleFacets: visibleAtmosphereFacets,
    totalMeshes,
    visibleMeshes: visibleAtmosphereMeshes,
    settledDrawCalls: MERIDIAN_DEPTH_BUDGET.settledDrawCalls,
    turnDrawCalls: MERIDIAN_DEPTH_BUDGET.turnDrawCalls,
  };
}

function portraitGain(aspect, floor) {
  if (aspect >= 0.90) return 1;
  if (aspect <= 0.46) return floor;
  const u = (aspect - 0.46) / 0.44;
  return floor + (1 - floor) * u * u * (3 - 2 * u);
}

const cameraForward = new THREE.Vector3();
function angleGain(camera, yaw, exponent) {
  camera.getWorldDirection(cameraForward);
  const length = Math.hypot(cameraForward.x, cameraForward.z) || 1;
  const backX = -cameraForward.x / length;
  const backZ = -cameraForward.z / length;
  const facing = Math.max(0, Math.sin(yaw) * backX + Math.cos(yaw) * backZ);
  return facing ** exponent;
}

function directPlaneGeometry(source, width, curve, mirrorX) {
  const aspect = source.canvas[0] / source.canvas[1];
  const height = width / aspect;
  const geometry = new THREE.PlaneGeometry(width, height, 20, 2);
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  const halfW = width / 2;
  const halfH = height / 2;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i) / halfW;
    const y = position.getY(i) / halfH;
    // Both axes recede: this is a shallow piece of the surrounding body, not
    // a flat billboard.  Mid and far layers carry different curvatures, so
    // the turn produces visible differential parallax.
    position.setZ(i, -curve * (x * x + y * y * 0.18));
    if (mirrorX) uv.setX(i, 1 - uv.getX(i));
  }
  position.needsUpdate = true;
  uv.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function tangentOffset(p, yaw, along, depth, out) {
  out.set(
    p.x + Math.cos(yaw) * along + Math.sin(yaw) * depth,
    0,
    p.z - Math.sin(yaw) * along + Math.cos(yaw) * depth,
  );
  return out;
}

function installOpacityCallback(mesh, layer) {
  mesh.onBeforeRender = (_renderer, _scene, camera, _geometry, material) => {
    material.opacity = layer.opacity * mesh.userData.facetGain *
      angleGain(camera, mesh.userData.facetYaw, layer.facingExponent) *
      portraitGain(camera.aspect, layer.portraitGain);
  };
}

function installDirectEdgeFeather(material, side = 0.11, vertical = 0.13) {
  // MeshBasicMaterial keeps Three's normal sRGB, tone-map and scene-fog path;
  // this tiny compile-time amendment only feathers the direct image at the
  // outer shell boundary. It samples the resident source once and creates no
  // mask texture, crop canvas or per-frame work.
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vDepthUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvDepthUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vDepthUv;')
      .replace('#include <alphatest_fragment>', `
        float depthSide = smoothstep(0.0, ${side.toFixed(4)}, vDepthUv.x) *
          smoothstep(0.0, ${side.toFixed(4)}, 1.0 - vDepthUv.x);
        float depthVertical = smoothstep(0.0, ${vertical.toFixed(4)}, vDepthUv.y) *
          smoothstep(0.0, ${vertical.toFixed(4)}, 1.0 - vDepthUv.y);
        diffuseColor.a *= depthSide * depthVertical;
        #include <alphatest_fragment>
      `);
  };
  material.customProgramCacheKey = () => `meridian-edge-${side}-${vertical}`;
  material.userData.shaderEdgeFeather = true;
}

function buildDirectLayer(scene, face, plan, source, texture, id, p, yaw, altitude) {
  const layer = layerById.get(id);
  const offset = id === 'far' ? plan.farOffset : plan.midOffset;
  const mirror = id === 'far' ? plan.mirrorFar : plan.mirrorMid;
  const geometry = directPlaneGeometry(source, layer.width, layer.curve, mirror);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: id === 'far' ? 0xc8cfcc : 0xc2c4b6,
    transparent: true,
    opacity: layer.opacity,
    alphaTest: source.alpha ? 0.012 : 0,
    depthWrite: false,
    depthTest: true,
    side: THREE.FrontSide,
    // Far anatomy carries authored aerial perspective in the painting. Scene
    // fog at this distance used to wash it back into the same flat teal as the
    // clear colour, especially at the exact 30-degree fold detent. Mid anatomy
    // still participates in scene fog, preserving a separate depth response.
    fog: id !== 'far',
    toneMapped: true,
  });
  material.name = `Meridian ${id} direct resident material`;
  material.userData = {
    directResidentMap: true,
    sourceId: source.id,
    idleEmissive: false,
  };
  installDirectEdgeFeather(material, id === 'far' ? 0.12 : 0.09,
    id === 'far' ? 0.14 : 0.10);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `Meridian ${layer.role} F${face}`;
  mesh.userData.environmentRole = 'meridian-depth-composition';
  mesh.userData.depthRole = layer.role;
  mesh.userData.backdropFace = face;
  mesh.userData.facetYaw = yaw;
  mesh.userData.authoredDepth = layer.depth;
  mesh.userData.playerPlaneDepth = MERIDIAN_DEPTH_BUDGET.playerPlaneDepth;
  mesh.userData.sourceAsset = source.file;
  mesh.userData.directResidentMap = true;
  mesh.userData.futureGameplaySemantics = 0;
  mesh.quaternion.setFromEuler(new THREE.Euler(0, yaw, 0));
  tangentOffset(p, yaw, offset, layer.depth, mesh.position);
  mesh.position.y = altitude + (id === 'far' ? 10.5 : 13.0);
  mesh.renderOrder = layer.renderOrder;
  mesh.frustumCulled = true;
  installOpacityCallback(mesh, layer);
  registerAtmosphereFacetMesh(mesh);
  scene.add(mesh);
  builtTriangles += geometry.index.count / 3;
  return mesh;
}

function componentUv(component, canvas, mirrorX) {
  const rect = component.visibleRect;
  let u0 = rect.x / canvas[0];
  let u1 = (rect.x + rect.w) / canvas[0];
  if (mirrorX) [u0, u1] = [u1, u0];
  return {
    u0, u1,
    v0: 1 - (rect.y + rect.h) / canvas[1],
    v1: 1 - rect.y / canvas[1],
  };
}

function nearFragmentGeometry(plan, componentById, canvas) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  for (const row of plan.fragments) {
    const component = componentById.get(row.id);
    if (!component) continue;
    const width = row.h * component.nativeAspect;
    const c = Math.cos(row.angle);
    const s = Math.sin(row.angle);
    const corners = [
      [-width / 2, -row.h / 2], [width / 2, -row.h / 2],
      [width / 2, row.h / 2], [-width / 2, row.h / 2],
    ];
    const base = positions.length / 3;
    for (const [x, y] of corners) {
      positions.push(row.x + x * c - y * s, row.y + x * s + y * c,
        layerById.get('near').depth + row.z);
      normals.push(0, 0, 1);
    }
    const uv = componentUv(component, canvas, row.mirrorX);
    uvs.push(uv.u0, uv.v0, uv.u1, uv.v0, uv.u1, uv.v1, uv.u0, uv.v1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function buildNearFragments(scene, face, plan, componentById, texture, p, yaw, altitude) {
  const layer = layerById.get('near');
  const source = MERIDIAN_DEPTH_SOURCES.near;
  const geometry = nearFragmentGeometry(plan, componentById, source.canvas);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: 0x73827d,
    transparent: true,
    opacity: layer.opacity,
    alphaTest: 0.035,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
    fog: true,
    toneMapped: true,
  });
  material.name = 'Meridian sparse near armour direct atlas material';
  material.alphaToCoverage = true;
  material.userData = {
    directResidentMap: true,
    sourceId: source.id,
    nativeBounds: true,
    storageCellsVisible: false,
    idleEmissive: false,
  };
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `Meridian ${layer.role} F${face}`;
  mesh.userData.environmentRole = 'meridian-depth-composition';
  mesh.userData.depthRole = layer.role;
  mesh.userData.backdropFace = face;
  mesh.userData.facetYaw = yaw;
  mesh.userData.authoredDepth = layer.depth;
  mesh.userData.playerPlaneDepth = MERIDIAN_DEPTH_BUDGET.playerPlaneDepth;
  mesh.userData.sourceAsset = source.file;
  mesh.userData.directResidentMap = true;
  mesh.userData.componentIds = [...new Set(plan.fragments.map((row) => row.id))];
  mesh.userData.futureGameplaySemantics = 0;
  mesh.quaternion.setFromEuler(new THREE.Euler(0, yaw, 0));
  mesh.position.set(p.x, altitude + 10.0, p.z);
  mesh.renderOrder = layer.renderOrder;
  mesh.frustumCulled = true;
  installOpacityCallback(mesh, layer);
  registerAtmosphereFacetMesh(mesh);
  scene.add(mesh);
  builtTriangles += geometry.index.count / 3;
  return mesh;
}

function condensationGeometry(rows) {
  const positions = [];
  const alphas = [];
  const indices = [];
  const stations = 5;
  for (const row of rows) {
    const base = positions.length / 3;
    for (let i = 0; i < stations; i++) {
      const u = i / (stations - 1);
      const x = row.x + (u - 0.5) * row.width;
      const centerY = row.y + (u - 0.5) * row.width * row.rake +
        Math.sin(u * Math.PI) * row.height * 0.38;
      const z = row.z + Math.sin(u * Math.PI * 2) * row.twist;
      const taper = Math.sin(u * Math.PI);
      positions.push(x, centerY - row.height * 0.5 * taper, z);
      const alpha = taper * (0.56 + 0.44 * Math.sin(u * Math.PI));
      positions.push(x, centerY, z + row.twist * 0.07);
      positions.push(x, centerY + row.height * 0.5 * taper, z + row.twist * 0.14);
      alphas.push(0, alpha, 0);
    }
    for (let i = 0; i < stations - 1; i++) {
      for (let band = 0; band < 2; band++) {
        const a = base + i * 3 + band;
        const b = base + (i + 1) * 3 + band;
        indices.push(a, a + 1, b + 1, a, b + 1, b);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('mistAlpha', new THREE.Float32BufferAttribute(alphas, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

const condensationVertex = `
  attribute float mistAlpha;
  varying float vMistAlpha;
  void main() {
    vMistAlpha = mistAlpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const condensationFragment = `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vMistAlpha;
  void main() {
    float alpha = uOpacity * vMistAlpha;
    if (alpha < 0.001) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

function buildCondensation(scene, face, rows, p, yaw, altitude) {
  const layer = layerById.get('condensation');
  const geometry = condensationGeometry(rows);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(PAL.vapor) },
      uOpacity: { value: layer.opacity },
    },
    vertexShader: condensationVertex,
    fragmentShader: condensationFragment,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  material.name = 'Meridian world-space condensation ribbons';
  material.userData = { idleEmissive: false, runtimeTexture: false };
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `Meridian ${layer.role} F${face}`;
  mesh.userData.environmentRole = 'meridian-depth-composition';
  mesh.userData.depthRole = layer.role;
  mesh.userData.backdropFace = face;
  mesh.userData.facetYaw = yaw;
  mesh.userData.depthRange = [...layer.depthRange];
  mesh.userData.playerPlaneDepth = MERIDIAN_DEPTH_BUDGET.playerPlaneDepth;
  mesh.userData.fogTransform = 'facet-world-volume';
  mesh.userData.futureGameplaySemantics = 0;
  mesh.quaternion.setFromEuler(new THREE.Euler(0, yaw, 0));
  mesh.position.set(p.x, altitude + 10.0, p.z);
  mesh.renderOrder = layer.renderOrder;
  mesh.frustumCulled = true;
  mesh.onBeforeRender = (_renderer, _scene, camera) => {
    material.uniforms.uOpacity.value = layer.opacity * mesh.userData.facetGain *
      angleGain(camera, mesh.userData.facetYaw, layer.facingExponent) *
      portraitGain(camera.aspect, layer.portraitGain);
  };
  registerAtmosphereFacetMesh(mesh);
  scene.add(mesh);
  builtTriangles += geometry.index.count / 3;
  return mesh;
}

export function buildMeridianAtmosphere(
  scene,
  { farTexture = null, midTexture = null, fragmentTexture = null, fragmentComponents = [] } = {},
) {
  const componentById = new Map(fragmentComponents.map((entry) => [entry.id, entry]));
  const meshes = [];
  builtTriangles = 0;
  for (let face = 1; face <= FACE_COUNT; face++) {
    const plan = meridianDepthFacePlan(face);
    const s = atmosphereFaceS(face);
    const yaw = headingAt(SEGS, s);
    const p = polyAt(SEGS, s);
    const altitude = normalAscentAltAt(s, CONFIG.levelLength);
    if (farTexture)
      meshes.push(buildDirectLayer(
        scene, face, plan, MERIDIAN_DEPTH_SOURCES.far, farTexture, 'far', p, yaw, altitude));
    if (midTexture)
      meshes.push(buildDirectLayer(
        scene, face, plan, MERIDIAN_DEPTH_SOURCES.mid, midTexture, 'mid', p, yaw, altitude));
    meshes.push(buildCondensation(
      scene, face, meridianCondensationPlan(face), p, yaw, altitude));
    if (fragmentTexture && componentById.size)
      meshes.push(buildNearFragments(
        scene, face, plan, componentById, fragmentTexture, p, yaw, altitude));
  }

  updateAtmosphereFacetVisibility();
  const farReady = Boolean(farTexture);
  const midReady = Boolean(midTexture);
  const nearReady = Boolean(fragmentTexture && componentById.size);
  return {
    built: meshes.length,
    triangles: builtTriangles,
    composition: 'facet-anatomy-volume',
    directResidentTextures: [farReady, midReady, nearReady].filter(Boolean).length,
    runtimeCanvases: 0,
    runtimeCrops: 0,
    textureResidency: { requested: 0, warmed: 0, ms: 0, derivedTextures: 0 },
    fixedPool: { ...MERIDIAN_DEPTH_BUDGET },
    bands: MERIDIAN_DEPTH_LAYERS.map((layer) => ({
      id: layer.id,
      role: layer.role,
      depth: layer.depth ?? null,
      depthRange: layer.depthRange ? [...layer.depthRange] : null,
      opacity: layer.opacity,
      facets: FACE_COUNT,
      source: layer.source || null,
    })),
    fog: {
      role: 'world-condensation',
      transform: 'facet-world-volume',
      depthRange: [...layerById.get('condensation').depthRange],
      ribbonsPerFacet: layerById.get('condensation').ribbonsPerFacet,
      runtimeTexture: false,
    },
    anatomy: {
      composited: farReady,
      directMapped: farReady,
      source: farReady ? [...MERIDIAN_DEPTH_SOURCES.far.canvas] : null,
      gpuTextures: farReady ? 1 : 0,
      stagePasses: 0,
      facets: FACE_COUNT,
      runtimeCrop: false,
    },
    midStructure: {
      directMapped: midReady,
      source: midReady ? [...MERIDIAN_DEPTH_SOURCES.mid.canvas] : null,
      gpuTextures: midReady ? 1 : 0,
    },
    nearFragments: {
      directMapped: nearReady,
      source: nearReady ? [...MERIDIAN_DEPTH_SOURCES.near.canvas] : null,
      gpuTextures: nearReady ? 1 : 0,
      componentIds: [...componentById.keys()],
    },
  };
}
