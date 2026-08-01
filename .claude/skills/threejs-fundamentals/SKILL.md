---
name: threejs-fundamentals
description: Three.js scene setup, cameras, renderer, Object3D hierarchy, coordinate systems. Use when setting up 3D scenes, creating cameras, configuring renderers, managing object hierarchies, or working with transforms. In HULLBREAKER use it only to extend the one existing rig — `src/render/scene.js` (renderer/scene/camera/lights), `src/render/camera.js` (the operator-frozen FAR camera), `src/main.js` (the single frame loop) — never to stand up a second one.
---

## HULLBREAKER guardrails (read before using anything below)

This repository already owns a renderer, a scene, a camera, a light rig, and a
frame loop. Everything after this section is upstream three.js reference,
written for a blank project. Read it for API detail; apply it only through the
files named here.

**1. The rig exists — extend it, never re-create it.**
`src/render/scene.js` is the only place `new THREE.WebGLRenderer`, `new
THREE.Scene`, the shipped `new THREE.PerspectiveCamera`, and the light rig
(`HemisphereLight` + `DirectionalLight`) are constructed. It exports
`renderer`, `scene`, `camera`, and `HIDE`. Every other render module imports
from it (`src/render/level.js`, `bullets.js`, `hostiles.js`, `limb.js`,
`transform.js`, `player.js`, `capsules.js`, `mods.js`, `hook.js`, `tower.js`).
The single frame loop is `frame()` in `src/main.js` (~line 378): one
`requestAnimationFrame`, one `renderer.render(scene, camera)`, then
`updateHUD()`. A second RAF loop, a second `renderer.render` call, or a second
canvas appended to `document.body` is a defect, not a style choice.
Check yourself with `grep -rn "new THREE.WebGLRenderer" src/` — one hit is correct.

**2. Resize and the sim's screen edges are one operation.**
`src/main.js` (~line 89) registers `addEventListener('resize', handleResize)`;
`handleResize()` lives in `src/render/camera.js` and updates `camera.aspect`,
calls `updateProjectionMatrix()`, resizes the renderer, **and** re-runs
`calibrateEdges()`, which unprojects the frustum edges and pushes them into the
simulation via `setEdges()` (`src/sim/edges.js`). Upstream's "Responsive
Canvas" recipe omits that last step; using it verbatim desynchronizes sim
collision/spawn edges from what the player sees. Change the camera → call
`calibrateEdges()`.

**3. The camera pose is law, not taste.**
`docs/decisions.md` entry 7 (2026-07-30, "View-scale verdict: FAR is the
default; bullets don't turn corners") makes FAR the default view — RIG ≈ 3.7%
of screen height, matching concept board 13's 3–5% range — with `?view=near`
required to stay byte-identical to the pre-view-scale camera. The code that
implements it: `VIEW_ID` in `src/mode.js` (line 78, unrecognized/absent
`?view=` resolves to `'far'`), `activeCameraDepth()` / `syncCamera()` in
`src/render/camera.js`, and the `CONFIG.camera` + `CONFIG.viewScales` tables in
`src/config.js` (lines ~11 and ~29). Editing fov, `x/y/z`, `lookX/lookY`, or a
`depthMult` re-tunes the judged default view. That needs a **new** operator
decision recorded in `docs/decisions.md` before you touch it — never a
re-litigation of entry 7. `tools/pathcheck.mjs` also asserts a player
screen-height bound ("player under 9 percent of screen height"), which will
fail loudly on an accidental retune, but passing it is not permission.

**4. Fog is owned, not free-form.**
`scene.fog` is created in `src/render/scene.js` from `CONFIG.palette.bg` +
`CONFIG.fog`, then its `near`/`far` are re-derived **every frame** by
`calibrateEdges()` in `src/render/camera.js` (view pull-back shift, `?g1=1`
limb haze) and by `src/render/transform.js` in the transform slice. Setting
`scene.fog` from a new module is either overwritten next frame or silently
breaks contrast at depth. Add your band to those owners instead.

**5. Layer purity is statically enforced — nothing below may enter `src/pure/` or `src/sim/`.**
`tools/pathcheck.mjs` (lines ~95–138) strips comments and then rejects, in
`src/config.js`, `src/pure/*.js` and `src/sim/*.js`, any match of
`\b(THREE|document|window|renderer|scene|addEventListener|requestAnimationFrame|innerWidth|innerHeight|devicePixelRatio|performance)\b`,
and rejects any import outside the layer allowlist (pure: `../config.js` or
`./x.js`; sim: also `../mode.js` and `../pure/x.js`). So `THREE.Vector3`,
`THREE.MathUtils`, `THREE.Clock`, `window.innerWidth` — all fine in
`src/render/`, `src/ui/`, `src/main.js`; all an instant `process.exit(1)` in
pure/sim. Sim→render crossings go through the `view.*` hooks in
`src/sim/bridge.js`; render modules register with `installView({...})`. The one
documented exception, already in the code, is `src/render/camera.js` calling
`setEdges()` directly (see the contract comment at the top of
`src/sim/bridge.js`). Gate: `node tools/pathcheck.mjs` must exit 0.

**6. Determinism outranks convenience.**
Seeded randomness only, via `mulberry32` in `src/pure/rng.js`.
`THREE.MathUtils.randFloat` / `randInt` are unseeded and must never produce a
value the simulation reads; the same goes for `Math.random`, `Date.now`,
`performance.now`, and `THREE.Clock`. `performance.now()` in `src/main.js`
(line 377) is the host layer and is fine — the sim advances on the `dt` handed
to `update(dt)` plus `gameMs` in `src/sim/time.js`, and `?fixeddt=` exists for
reproducible runs. A `THREE.Clock` driving a purely cosmetic render effect is
legal in `src/render/`, provided nothing sim-side ever reads it. The simulation
is strictly 2D `(s, y)`; `Vector3`/`Matrix4`/`Quaternion` are render-only
tools, and `polyAt()` in `src/pure/path.js` is what maps `(s, y)` onto 3D.

**7. Colors come from the palette table.**
`CONFIG.palette` in `src/config.js` (~line 482) holds `bg`, `ground`,
`catwalk`, `player`, `gun`, the hostile/tell colors, per-weapon `shots`, and
the overlay `tints`; `src/render/scene.js` reads it for the background and fog.
Add a named token there instead of inlining a hex in a render module. Honest
state of the guards as of this install: pathcheck asserts every weapon in
`CONFIG.weapons` has a `CONFIG.palette.shots` entry (`tools/pathcheck.mjs`
~line 2294), but there is **no** general raw-color-literal guard in the main
checkout — this one is discipline plus review, not a machine gate. A palette
token module (`src/render/palette.js`) is in flight in a concurrent lane; if
that file exists when you read this, import from it rather than adding
literals.

**8. Static anatomy: what you may animate is a short list.**
`docs/decisions.md` entry 3 (CP3 verdict, 2026-07-30): the creature's anatomy
is monumental and **static** during turns and transitions — RIG and the camera
move, the next stretch pre-exists and is *revealed*, never assembled. Only
doors, access plates, vent covers, shutters, traps, and Crown mechanisms may
move. So `Object3D` transform animation on hull/limb/anatomy meshes to "bring
in" the next band is a rule violation regardless of how good it looks. The
camera-side reveal is already built: the two-detent yaw ritual in
`syncCamera()` (`src/render/camera.js`) plus `towerPose()`
(`src/render/tower.js`). The zip-assembly choreography
(`view.level.zipperColumn` in `src/sim/bridge.js`, implemented in
`src/render/level.js`) is retained-but-retired for the body per entry 3's
addendum — keep it extractable for traps/emplacements, do not extend it for
anatomy.

**9. No build step, no npm, addons only via `three/addons/`.**
three.js 0.170.0 arrives from the CDN import map in `index.html` (lines 46–53),
which maps exactly two specifiers: `"three"` and `"three/addons/"`. Never run
`npm install` for the game (dev-only deps are allowed under `tools/*/` with
their own `package.json`, e.g. `tools/playtest`). Any upstream snippet
importing `three/examples/jsm/…` will 404 here — it is corrected to
`three/addons/…` below. Nothing in `src/` imports an addon today.

**10. The house pooling pattern already exists.**
Upstream's "object pooling" tip is solved: `src/render/scene.js` exports `HIDE`
(a zero-scale `Matrix4`), and `src/render/bullets.js`, `level.js`, `limb.js`,
and `transform.js` use `THREE.InstancedMesh` + `setMatrixAt(i, HIDE)` +
`instanceMatrix.needsUpdate = true` to park unused instances. Extend that
pattern instead of inventing a pool. Disposal precedent lives in
`src/render/hostiles.js` (`scene.remove(c.mesh)` + `c.mat.dispose()`) and
`src/render/capsules.js`.

**11. Anything not already shipped needs an operator decision first.**
The following are *not* sanctioned in this repo today and are not yours to
introduce on your own judgment: a second camera or render pass
(`ArrayCamera`, `CubeCamera`, render targets), an `OrthographicCamera` view,
shadow maps (`renderer.shadowMap` is untouched — `grep -rn "shadowMap" src/`
returns nothing), tone-mapping or color-space changes (`ACESFilmicToneMapping`
is already set in `src/render/scene.js`; changing it changes every judged
screenshot), new scene lights, asset loaders (`GLTFLoader`/`TextureLoader` — no
loader ships today), and any change to the view scale. Each one needs a
decision recorded in `docs/decisions.md` before implementation. Prototype work
that has been sanctioned ships behind an off-by-default query flag.

**12. You do not get to judge how it looks.**
Machine gates never judge fun. `node tools/pathcheck.mjs` (exit 0),
`index.html?selftest=1` (SELFTEST PASS in the title), and the bot playtest
(`tools/playtest/README.md`) are evidence only. Any visual change — camera,
fog, palette, lighting, silhouette — is a feel question for the operator: post
a checkpoint packet under "Operator checkpoint queue" in `SPRINT.md` (line 308)
with an exact URL and 3–5 questions, and never self-declare the result good.
Judge screenshots against `docs/concept-art/README.md` boards 13/14 and the
visual invariants, not against your taste.

---

# Three.js Fundamentals

## Quick Start

```javascript
// HULLBREAKER: REFERENCE ONLY — do not run this here. It builds a second
// renderer/scene/camera and appends a second canvas. Rule: one rig, owned by
// src/render/scene.js; one loop, owned by src/main.js frame().
import * as THREE from "three";

// Create scene, camera, renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,   // HULLBREAKER: `window`/`innerWidth` are
  // banned in src/pure|sim by the pathcheck layer guard (the `banned` regex feeding
  // guardLayer() in tools/pathcheck.mjs)
  0.1,
  1000,
);
const renderer = new THREE.WebGLRenderer({ antialias: true });

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);   // HULLBREAKER: already done once,
// in src/render/scene.js — a second canvas is a defect

// Add a mesh
const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });  // HULLBREAKER:
// colors come from CONFIG.palette (src/config.js), not inline hex — guardrail 7
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);

// Add light
scene.add(new THREE.AmbientLight(0xffffff, 0.5));   // HULLBREAKER: the light rig is
// fixed (hemisphere + sun) in src/render/scene.js; new lights need an operator
// decision in docs/decisions.md — guardrail 11
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(5, 5, 5);
scene.add(dirLight);

camera.position.z = 5;   // HULLBREAKER: pose is computed per frame by syncCamera()
// in src/render/camera.js and frozen by decisions.md entry 7 (FAR default)

// Animation loop
function animate() {
  requestAnimationFrame(animate);   // HULLBREAKER: exactly one RAF loop exists
  // (src/main.js frame(), ~line 378) — do not add another
  cube.rotation.x += 0.01;
  cube.rotation.y += 0.01;
  renderer.render(scene, camera);
}
animate();

// Handle resize
window.addEventListener("resize", () => {
  // HULLBREAKER: already wired — `addEventListener('resize', handleResize)` in
  // src/main.js, with the implementation in
  // src/render/camera.js, which ALSO calls calibrateEdges() → setEdges().
  // Skipping that desyncs the sim's screen edges — guardrail 2.
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
```

## Core Classes

### Scene

Container for all 3D objects, lights, and cameras.

```javascript
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000); // Solid color
scene.background = texture; // Skybox texture
scene.background = cubeTexture; // Cubemap
scene.environment = envMap; // Environment map for PBR
scene.fog = new THREE.Fog(0xffffff, 1, 100); // Linear fog
scene.fog = new THREE.FogExp2(0xffffff, 0.02); // Exponential fog
// HULLBREAKER: background + linear fog are set once in src/render/scene.js from
// CONFIG.palette.bg / CONFIG.fog, and the fog band is re-derived every frame by
// calibrateEdges() (src/render/camera.js) and src/render/transform.js.
// Assigning scene.fog / scene.background elsewhere is overwritten or breaks
// depth contrast — guardrail 4.
```

### Cameras

**PerspectiveCamera** - Most common, simulates human eye.

```javascript
// PerspectiveCamera(fov, aspect, near, far)
const camera = new THREE.PerspectiveCamera(
  75, // Field of view (degrees)
  window.innerWidth / window.innerHeight, // Aspect ratio
  0.1, // Near clipping plane
  1000, // Far clipping plane
);

camera.position.set(0, 5, 10);
camera.lookAt(0, 0, 0);
camera.updateProjectionMatrix(); // Call after changing fov, aspect, near, far
// HULLBREAKER: the shipped camera is `new THREE.PerspectiveCamera(CONFIG.camera.fov,
// aspect, 0.1, 200)` in src/render/scene.js, posed each frame by syncCamera().
// FOV/pose/view-depth are frozen by decisions.md entry 7 — retuning needs a new
// recorded decision, not an edit. A short-lived off-screen probe camera is an
// accepted pattern (see `_probe` in src/render/camera.js, used only to unproject
// frustum edges); it is never added to the scene and never rendered.
```

**OrthographicCamera** - No perspective distortion, good for 2D/isometric.

```javascript
// HULLBREAKER: not sanctioned. The game's look is the FAR perspective view
// (decisions.md entry 7). Switching to orthographic changes every judged frame
// and needs an operator decision in docs/decisions.md first — guardrail 11.
// OrthographicCamera(left, right, top, bottom, near, far)
const aspect = window.innerWidth / window.innerHeight;
const frustumSize = 10;
const camera = new THREE.OrthographicCamera(
  (frustumSize * aspect) / -2,
  (frustumSize * aspect) / 2,
  frustumSize / 2,
  frustumSize / -2,
  0.1,
  1000,
);
```

**ArrayCamera** - Multiple viewports with sub-cameras.

```javascript
// HULLBREAKER: a second render pass is not sanctioned (guardrail 11) — one
// renderer.render(scene, camera) per frame, in src/main.js.
const cameras = [];
for (let i = 0; i < 4; i++) {
  const subcamera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  subcamera.viewport = new THREE.Vector4(
    Math.floor(i % 2) * 0.5,
    Math.floor(i / 2) * 0.5,
    0.5,
    0.5,
  );
  cameras.push(subcamera);
}
const arrayCamera = new THREE.ArrayCamera(cameras);
```

**CubeCamera** - Renders environment maps for reflections.

```javascript
// HULLBREAKER: render targets + per-frame env updates are extra passes and
// extra cost; not sanctioned today (guardrail 11).
const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256);
const cubeCamera = new THREE.CubeCamera(0.1, 1000, cubeRenderTarget);
scene.add(cubeCamera);

// Use for reflections
material.envMap = cubeRenderTarget.texture;

// Update each frame (expensive!)
cubeCamera.position.copy(reflectiveMesh.position);
cubeCamera.update(renderer, scene);
```

### WebGLRenderer

```javascript
// HULLBREAKER: constructed once, in src/render/scene.js, with { antialias: true },
// setPixelRatio(min(devicePixelRatio, 2)), setSize(innerWidth, innerHeight), and
// toneMapping = ACESFilmicToneMapping. Read this block to understand those
// options; do not construct a second renderer.
const renderer = new THREE.WebGLRenderer({
  canvas: document.querySelector("#canvas"), // Optional existing canvas
  antialias: true, // Smooth edges
  alpha: true, // Transparent background
  powerPreference: "high-performance", // GPU hint
  preserveDrawingBuffer: true, // For screenshots
});

renderer.setSize(width, height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// Tone mapping
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
// HULLBREAKER: tone mapping is already ACESFilmic; changing it or the exposure
// changes every judged screenshot → operator decision first (guardrail 11).

// Color space (Three.js r152+)
renderer.outputColorSpace = THREE.SRGBColorSpace;

// Shadows
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// HULLBREAKER: shadows do not ship (`grep -rn "shadowMap" src/` is empty) and
// enabling them is a look change + a perf change → operator decision first.

// Clear color
renderer.setClearColor(0x000000, 1);

// Render
renderer.render(scene, camera);   // HULLBREAKER: exactly one call site,
// src/main.js frame()
```

### Object3D

Base class for all 3D objects. Mesh, Group, Light, Camera all extend Object3D.

```javascript
const obj = new THREE.Object3D();

// Transform
obj.position.set(x, y, z);
obj.rotation.set(x, y, z); // Euler angles (radians)
obj.quaternion.set(x, y, z, w); // Quaternion rotation
obj.scale.set(x, y, z);
// HULLBREAKER: transforms on hull/limb/anatomy objects are constrained by the
// static-anatomy rule (decisions.md entry 3) — anatomy does not move, assemble,
// or articulate to reveal the next stretch; the camera does. Doors, plates,
// vent covers, shutters, traps and Crown mechanisms may move.

// Local vs World transforms
obj.getWorldPosition(targetVector);
obj.getWorldQuaternion(targetQuaternion);
obj.getWorldDirection(targetVector);

// Hierarchy
obj.add(child);
obj.remove(child);
obj.parent;
obj.children;

// Visibility
obj.visible = false;

// Layers (for selective rendering/raycasting)
obj.layers.set(1);
obj.layers.enable(2);
obj.layers.disable(0);

// Traverse hierarchy
obj.traverse((child) => {
  if (child.isMesh) child.material.color.set(0xff0000);   // HULLBREAKER: palette
  // token from CONFIG.palette, not a literal — guardrail 7
});

// Matrix updates
obj.matrixAutoUpdate = true; // Default: auto-update matrices
obj.updateMatrix(); // Manual matrix update
obj.updateMatrixWorld(true); // Update world matrix recursively
```

### Group

Empty container for organizing objects.

```javascript
const group = new THREE.Group();
group.add(mesh1);
group.add(mesh2);
scene.add(group);

// Transform entire group
group.position.x = 5;
group.rotation.y = Math.PI / 4;
```

### Mesh

Combines geometry and material.

```javascript
const mesh = new THREE.Mesh(geometry, material);

// Multiple materials (one per geometry group)
const mesh = new THREE.Mesh(geometry, [material1, material2]);

// Useful properties
mesh.geometry;
mesh.material;
mesh.castShadow = true;      // HULLBREAKER: no-op today — shadow maps are off
mesh.receiveShadow = true;   // and enabling them needs a decision (guardrail 11)

// Frustum culling
mesh.frustumCulled = true; // Default: skip if outside camera view

// Render order
mesh.renderOrder = 10; // Higher = rendered later
```

## Coordinate System

Three.js uses a **right-handed coordinate system**:

- **+X** points right
- **+Y** points up
- **+Z** points toward viewer (out of screen)

HULLBREAKER: the simulation never lives here. It is strictly 2D in `(s, y)`;
`polyAt()` in `src/pure/path.js` maps the scroll cursor `s` onto the 3D
polyline for rendering only, and `src/render/camera.js` derives the camera's
world position from it. Collision, physics, aiming and spawning stay in
`(s, y)` — see the determinism rule in `CLAUDE.md`.

```javascript
// Axes helper
const axesHelper = new THREE.AxesHelper(5);
scene.add(axesHelper); // Red=X, Green=Y, Blue=Z
// HULLBREAKER: debug helpers must be behind an off-by-default query flag
// (CLAUDE.md, "Prototypes ship behind query flags"), never added unconditionally.
```

## Math Utilities

### Vector3

```javascript
// HULLBREAKER: render-layer only. THREE.* in src/pure/ or src/sim/ fails the
// pathcheck layer guard (guardrail 5). Gameplay math is plain numbers in (s, y).
const v = new THREE.Vector3(x, y, z);
v.set(x, y, z);
v.copy(otherVector);
v.clone();

// Operations (modify in place)
v.add(v2);
v.sub(v2);
v.multiply(v2);
v.multiplyScalar(2);
v.divideScalar(2);
v.normalize();
v.negate();
v.clamp(min, max);
v.lerp(target, alpha);

// Calculations (return new value)
v.length();
v.lengthSq(); // Faster than length()
v.distanceTo(v2);
v.dot(v2);
v.cross(v2); // Modifies v
v.angleTo(v2);

// Transform
v.applyMatrix4(matrix);
v.applyQuaternion(q);
v.project(camera); // World to NDC
v.unproject(camera); // NDC to world
// HULLBREAKER: unproject is exactly how calibrateEdges() derives the sim's
// screen edges (`probeXAtNdc` in src/render/camera.js) — the one sanctioned
// render→sim write, documented in src/sim/bridge.js.
```

### Matrix4

```javascript
const m = new THREE.Matrix4();
m.identity();
m.copy(other);
m.clone();

// Build transforms
m.makeTranslation(x, y, z);
m.makeRotationX(theta);
m.makeRotationY(theta);
m.makeRotationZ(theta);
m.makeRotationFromQuaternion(q);
m.makeScale(x, y, z);   // HULLBREAKER: `HIDE` in src/render/scene.js is exactly
// this — a zero-scale matrix used to park unused InstancedMesh slots

// Compose/decompose
m.compose(position, quaternion, scale);
m.decompose(position, quaternion, scale);

// Operations
m.multiply(m2); // m = m * m2
m.premultiply(m2); // m = m2 * m
m.invert();
m.transpose();

// Camera matrices
m.makePerspective(left, right, top, bottom, near, far);
m.makeOrthographic(left, right, top, bottom, near, far);
m.lookAt(eye, target, up);
```

### Quaternion

```javascript
const q = new THREE.Quaternion();
q.setFromEuler(euler);
q.setFromAxisAngle(axis, angle);
q.setFromRotationMatrix(matrix);

q.multiply(q2);
q.slerp(target, t); // Spherical interpolation
q.normalize();
q.invert();
```

### Euler

```javascript
const euler = new THREE.Euler(x, y, z, "XYZ"); // Order matters!
euler.setFromQuaternion(q);
euler.setFromRotationMatrix(m);

// Rotation orders: 'XYZ', 'YXZ', 'ZXY', 'XZY', 'YZX', 'ZYX'
```

### Color

```javascript
const color = new THREE.Color(0xff0000);
const color = new THREE.Color("red");
const color = new THREE.Color("rgb(255, 0, 0)");
const color = new THREE.Color("#ff0000");
// HULLBREAKER: the argument should be a CONFIG.palette token (src/config.js
// ~line 482), e.g. `new THREE.Color(CONFIG.palette.bg)` as in
// src/render/scene.js. New colors get a named entry in that table — guardrail 7.

color.setHex(0x00ff00);
color.setRGB(r, g, b); // 0-1 range
color.setHSL(h, s, l); // 0-1 range

color.lerp(otherColor, alpha);
color.multiply(otherColor);
color.multiplyScalar(2);
```

### MathUtils

```javascript
THREE.MathUtils.clamp(value, min, max);
THREE.MathUtils.lerp(start, end, alpha);
THREE.MathUtils.mapLinear(value, inMin, inMax, outMin, outMax);
THREE.MathUtils.degToRad(degrees);
THREE.MathUtils.radToDeg(radians);
THREE.MathUtils.randFloat(min, max);   // HULLBREAKER: UNSEEDED — banned as a
THREE.MathUtils.randInt(min, max);     // source of anything the sim reads.
// Seeded randomness only, via mulberry32 in src/pure/rng.js (determinism rule).
THREE.MathUtils.smoothstep(x, min, max);
THREE.MathUtils.smootherstep(x, min, max);
```

## Common Patterns

### Proper Cleanup

```javascript
// HULLBREAKER: precedent in src/render/hostiles.js (corpse fade → scene.remove +
// mat.dispose()) and src/render/capsules.js. Geometries/materials shared across
// instances must not be disposed while another InstancedMesh still uses them.
function dispose() {
  // Dispose geometries
  mesh.geometry.dispose();

  // Dispose materials
  if (Array.isArray(mesh.material)) {
    mesh.material.forEach((m) => m.dispose());
  } else {
    mesh.material.dispose();
  }

  // Dispose textures
  texture.dispose();

  // Remove from scene
  scene.remove(mesh);

  // Dispose renderer
  renderer.dispose();   // HULLBREAKER: never — the renderer is a module-level
  // singleton owned by src/render/scene.js and lives for the page's lifetime
}
```

### Clock for Animation

```javascript
// HULLBREAKER: the game does not use THREE.Clock. Timing comes from the RAF
// timestamp in src/main.js frame() (with ?fixeddt= for reproducible runs) and
// from gameMs in src/sim/time.js. A Clock may drive a purely cosmetic render
// effect, but nothing the sim reads — determinism rule / guardrail 6.
const clock = new THREE.Clock();

function animate() {
  const delta = clock.getDelta(); // Time since last frame (seconds)
  const elapsed = clock.getElapsedTime(); // Total time (seconds)

  mesh.rotation.y += delta * 0.5; // Consistent speed regardless of framerate

  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
```

### Responsive Canvas

```javascript
// HULLBREAKER: this exact function already exists as handleResize() in
// src/render/camera.js, registered by the resize listener in src/main.js — and
// it does one more
// thing this snippet omits: calibrateEdges(), which pushes the new frustum
// edges into the sim (setEdges, src/sim/edges.js). Use the existing one.
function onWindowResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}
window.addEventListener("resize", onWindowResize);
```

### Loading Manager

```javascript
// HULLBREAKER: no runtime asset loading ships today — no GLTFLoader, no
// TextureLoader, no addon import anywhere in src/. Sprites/assets generated for
// the asset lane stage under assets/ (manifest.json). Introducing a loader adds
// a network dependency and a load-order failure mode to a no-build-step game:
// operator decision in docs/decisions.md first (guardrail 11).
const manager = new THREE.LoadingManager();

manager.onStart = (url, loaded, total) => console.log("Started loading");
manager.onLoad = () => console.log("All loaded");
manager.onProgress = (url, loaded, total) => console.log(`${loaded}/${total}`);
manager.onError = (url) => console.error(`Error loading ${url}`);

const textureLoader = new THREE.TextureLoader(manager);
const gltfLoader = new GLTFLoader(manager);
```

## Performance Tips

1. **Limit draw calls**: Merge geometries, use instancing, atlas textures
2. **Frustum culling**: Enabled by default, ensure bounding boxes are correct
3. **LOD (Level of Detail)**: Use `THREE.LOD` for distance-based mesh switching
4. **Object pooling**: Reuse objects instead of creating/destroying
5. **Avoid `getWorldPosition` in loops**: Cache results

HULLBREAKER: instancing and pooling are already the house pattern —
`THREE.InstancedMesh` + `setMatrixAt(i, HIDE)` + `instanceMatrix.needsUpdate`
in `src/render/bullets.js`, `level.js`, `limb.js`, `transform.js`, with `HIDE`
exported from `src/render/scene.js`. Extend those meshes rather than adding new
draw calls. Note that a swept `THREE.LOD` changes silhouette readability at the
FAR default view (decisions.md entry 7), which is an operator feel question,
not a free optimization.

```javascript
// Merge static geometries
// HULLBREAKER: import specifier corrected — the index.html import map exposes
// "three" and "three/addons/" only; "three/examples/jsm/…" is not mapped and
// would fail to resolve at runtime (guardrail 9).
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
const merged = mergeGeometries([geo1, geo2, geo3]);

// LOD
const lod = new THREE.LOD();
lod.addLevel(highDetailMesh, 0);
lod.addLevel(medDetailMesh, 50);
lod.addLevel(lowDetailMesh, 100);
scene.add(lod);
```

## See Also

- `threejs-geometry` - Geometry creation and manipulation
- `threejs-materials` - Material types and properties
- `threejs-lighting` - Light types and shadows

HULLBREAKER: those sibling skills exist in the upstream pack but are only
available here if separately installed under `.claude/skills/`; check that
directory before referring to one. Whatever they say, the guardrails at the top
of this file still bind — `docs/decisions.md` is law, `node tools/pathcheck.mjs`
must exit 0, and the operator is the only judge of how anything looks.
