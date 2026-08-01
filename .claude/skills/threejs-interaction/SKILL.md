---
name: threejs-interaction
description: Three.js interaction - raycasting, controls, mouse/touch input, object selection. Use when handling user input, implementing click detection, adding camera controls, or creating interactive 3D experiences. In HULLBREAKER this is reference-only for render-side, presentation-only hit-testing and dev-tooling behind an off-by-default query flag — the shipped game's camera pose is frozen, its input is the keyboard buffer in src/sim/input.js, and no raycast may ever feed a gameplay decision.
---

## HULLBREAKER guardrails (read before using anything below)

This is an upstream three.js reference dropped into a repo with a frozen
camera, a strictly 2D deterministic simulation, and a single keyboard input
path. **Most of the material below is unusable in the shipped game as
written.** Read this section, then treat the upstream body as API reference,
not as a recipe.

### 1. Where three.js is allowed to appear at all

*(Citations below are grep anchors, not line numbers: this repo merges several
lanes a day and line numbers drift within hours.)*

Only `src/render/*`, `src/ui/*`, and `src/main.js` may touch THREE, `document`,
or `window`. `src/pure/` and `src/sim/` may not, and this is a machine gate,
not a convention: `tools/pathcheck.mjs` (grep `const banned =`) applies

```js
const banned = /\b(THREE|document|window|renderer|scene|addEventListener|requestAnimationFrame|innerWidth|innerHeight|devicePixelRatio|performance)\b/;
```

via the two `guardLayer(...)` calls just below it — one for `pure` (which also
covers `src/config.js`), one for `sim` — after stripping comments, and calls
`process.exit(1)` on the first hit
(`pathcheck: forbidden pure reference in <file>: window`). The same guard also
enforces import direction — `src/pure/` may import only `../config.js` and
`./<file>.js`; `src/sim/` adds `../mode.js` and `../pure/<file>.js`.

Practical consequence: **every snippet below is a `src/render/` or `src/ui/`
snippet.** Pasting any of them into `src/pure/` or `src/sim/` fails
`node tools/pathcheck.mjs` on the first run.

### 2. Input: there is exactly one input path, and it is keyboard

`src/sim/input.js` owns the intent buffer the simulation reads (`keys`,
`bufferJumpUntil`, `bufferHookUntil`, `releaseAllKeys`). The DOM listeners
that fill it live in `src/main.js` (grep `const KEYMAP` — plus the
`keydown`/`keyup`/`blur`/`visibilitychange` listeners under it). Its own header
states the reason:

> "The DOM key listeners that fill it live in src/main.js, so a bot player or
> a headless harness can drive these fields directly instead of synthesizing
> key events."

The bot harness depends on that shape. `tools/playtest/lib/driver.mjs`
dispatches only `keydown`/`keyup` by `code`, and `--deterministic` keys those
events to the game's own `gameMs` (`tools/playtest/README.md`, "Deterministic
injection mode"). `tools/pathcheck.mjs`'s T-002 block (grep
`T-002: ritual decision trace`) asserts that "byte-identical frame-scoped input
yields a bit-identical simulation trace."

Mouse position is continuous, non-frame-scoped, and unreplayable by that
harness. **Adding mouse, pointer-lock, drag, or touch input that reaches sim
state is not a coding decision you may make.** It requires an operator
decision recorded in `docs/decisions.md` first. Note that `decisions.md` entry
5 already rejected an added input channel for a movement verb ("the hook
doesn't add anything but an extra button press and confusion"); an added mouse
verb is the same class of change.

### 3. Raycasting must never decide anything the simulation cares about

`CLAUDE.md`, Hard rules: "The simulation stays 2D `(s, y)`; collision,
physics, aiming, and spawning never leave it."

- Hit detection, targeting, pickups, spawn placement, and ledge/wall decisions
  are sim-side and already implemented in `src/sim/player.js`,
  `src/sim/weapons.js`, `src/sim/hostiles.js`, `src/sim/capsules.js`, and
  `src/sim/spawner.js`. A raycast against scene meshes is a *different*
  geometry (the 3D ribbon) than the one the sim decides on (2D `(s, y)`), so
  it will disagree — see `decisions.md` entry 7, which culls projectiles at
  bend boundaries (`view.bullets.bendCulled` in `src/sim/bridge.js`,
  `src/sim/weapons.js`, `src/pure/path.js`) precisely so "sim and visuals
  agree (no cross-corner sniping)." A render raycast would happily hit a mesh
  around a corner the sim says is unreachable.
- The aim complaint the operator actually raised (`decisions.md` entry 4: "8-way
  aim is insufficient against low targets") already has two sanctioned answers
  in the tree — `?crouch=1` (`src/pure/stance.js`) and `?aim=assist`
  (`src/pure/assist.js`), both flagged in `src/mode.js` as `CROUCH_ENABLED` /
  `AIM_ASSIST_ENABLED` and both still undecided per entry 6. **Extend those
  pure modules; do not propose mouse aim or raycast picking as a fix.**

Render-side raycasting that is purely presentational (a hover glow, a debug
probe) is legitimate *only* if it never writes sim state. `src/sim/bridge.js`
states the contract: "hooks are presentation-only. A hook must never write sim
state or the headless run diverges from the played run."

### 4. The camera is frozen; no `*Controls` may attach to it

`tools/pathcheck.mjs` asserts the pose outright (grep
`'camera pull-back pose'`):

```js
ok(CC.fov === 56 && CC.x === 5.0 && CC.y === 6.2 && CC.z === 22.5 &&
   CC.lookX === 7.4 && CC.lookY === 4.8, 'camera pull-back pose');
```

plus `'player under 9 percent of screen height'` immediately after. Depth is
selected by `?view=`, and `decisions.md` entry 7 made FAR the **default**
("far feels right"; RIG ≈ 3.7% of screen height, matching concept board 13's
3–5% range) — that is operator law, not a tunable.

`src/render/camera.js` writes the camera pose every frame from sim state
(`scrollX`, corner-ritual yaw). Any OrbitControls / FlyControls /
FirstPersonControls / PointerLockControls / TrackballControls / MapControls
instance attached to that camera fights that per-frame write *and* invalidates
the screen-edge calibration: `probeXAtNdc()` in `src/render/camera.js` pushes
`setEdges()` into `src/sim/edges.js`, which is the one sanctioned render→sim
write (documented as the "Known exception" in `src/sim/bridge.js`), and which
spawning/despawning reads via `sLeftEdge()` / `sRightEdge()`.

**There is no sanctioned free-look or debug-camera flag today.** Adding one —
even off by default — changes what the operator judges at a checkpoint, so it
needs a `docs/decisions.md` entry first. Do not add one and describe it as
"harmless because it is flagged off".

### 5. If you do build something interactive, it ships behind a flag

`CLAUDE.md`: "Prototypes ship behind query flags, off by default." Flags
resolve in `src/mode.js` from `QUERY` (a headless host sets
`globalThis.__HB_QUERY__`), e.g. `HOOK_ENABLED`, `FLOW_ENABLED`,
`CROUCH_ENABLED`. Two precedents for *proving* a flag is render-only exist in
`tools/pathcheck.mjs`: the `?g1=1` render-only proof (grep `?g1=1 is
render-only, proved at the sim layer`) and the static greps under
`static guards: the rework is render-only by construction`, which scan every
`src/sim/` file for render-choreography identifiers. Copy that
pattern — a new interaction prototype should come with an assertion that no
sim module can see it.

### 6. Dependencies: import map only, never a package manager

`index.html`'s `<script type="importmap">` block maps `"three"` →
three@0.170.0 `three.module.js` and
`"three/addons/"` → `examples/jsm/` from the CDN. There is no build step and
no package manager for the game. Import addons by the mapped specifier
(`three/addons/controls/OrbitControls.js`) and **never** run `npm install` for
anything the game loads — dev-only deps are allowed under `tools/*/` with
their own `package.json` (as `tools/playtest/` has), never for `src/`.

### 7. Colors come from `CONFIG.palette`

The palette lives in `src/config.js` under `CONFIG.palette` (grep `palette: {`
— "grey-box: neutral + readability hints"); render modules read
`CONFIG.palette.*` — see `src/render/hostiles.js`, `src/render/bullets.js`,
`src/render/hook.js`, `src/render/scene.js`. The hover/selection snippets
below hardcode `0xff6600` / `0x444444` / `0xaaaaaa`; route those through a
`CONFIG.palette` entry instead. Honesty note: there is **no** pathcheck guard
rejecting raw color literals in render files today (I searched
`tools/pathcheck.mjs`; the only color assertion is "every weapon letter has a
shot color"), and `src/render/scene.js` still holds raw light colors. This one
is convention plus reviewer judgment, not a machine gate — do not rely on
pathcheck to catch it for you.

### 8. Anything visible is an operator feel question

`CLAUDE.md`: "Machine gates never judge fun." A hover highlight, a selection
glow, a cursor change, or a debug overlay that the operator will see goes to
`SPRINT.md`'s "## Operator checkpoint queue" section with an exact URL and 3–5
questions. Never self-declare an interaction "readable" or "good".

### 9. Problems this repo already solved — extend, don't reinvent

| You were about to… | Use this instead |
| --- | --- |
| Click a mesh to inspect its state | `window.HB` — the read-only debug handle in `src/main.js` (grep `window.HB = Object.freeze(`) exposing live `player`, `hostiles`, `capsules`, `mods`, `sliceStats`, plus `snapshot()`; and `__HULLBREAKER_TEST__`, the playtest harness's frozen telemetry channel in the same file |
| Write a screen↔world projection helper | `probeXAtNdc()` in `src/render/camera.js` (unprojects a probe `PerspectiveCamera`) feeding `setEdges()` in `src/sim/edges.js`, whose header warns that per-frame frustum unprojection "goes invalid the moment the camera yaws" |
| Add a key binding | `KEYMAP` in `src/main.js` → the `keys` buffer in `src/sim/input.js` |
| Drive the game programmatically | `tools/playtest/run.mjs` scripts + `--deterministic`; capture harnesses `tools/playtest/g1-capture.mjs`, `viewscale-capture.mjs`, `transform-capture.mjs` |
| Route a render event back toward the sim | You may not. Use a `src/sim/bridge.js` view hook in the sim→render direction only |

Legitimate uses of everything below, in one line: **render-side presentation-only
hit-testing that never writes sim state; dev tooling behind an off-by-default
`src/mode.js` flag; and standalone capture/inspection tools under `tools/` that
have zero effect on the shipped game.** Everything else needs an operator
decision in `docs/decisions.md` first — propose one, do not improvise.

---

# Three.js Interaction

## Quick Start

> **HULLBREAKER:** this whole block is illegal in `src/pure/` and `src/sim/`
> (layer guard: `THREE`, `window`, `addEventListener`), and the `OrbitControls`
> line is illegal anywhere in the shipped game (frozen camera pose, pathcheck
> `'camera pull-back pose'`). Read it as API reference.

```javascript
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// Camera controls
// HULLBREAKER: forbidden — src/render/camera.js owns the pose every frame and
// pushes setEdges() into the sim. Needs a docs/decisions.md entry, not a flag.
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Raycasting for click detection
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function onClick(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(scene.children);

  if (intersects.length > 0) {
    // HULLBREAKER: whatever you do here must not write sim state
    // (src/sim/bridge.js: "hooks are presentation-only").
    console.log("Clicked:", intersects[0].object);
  }
}

window.addEventListener("click", onClick);
```

## Raycaster

### Basic Raycasting

```javascript
const raycaster = new THREE.Raycaster();

// From camera (mouse picking)
raycaster.setFromCamera(mousePosition, camera);

// From any origin and direction
raycaster.set(origin, direction); // origin: Vector3, direction: normalized Vector3

// Get intersections
const intersects = raycaster.intersectObjects(objects, recursive);

// intersects array contains:
// {
//   distance: number,          // Distance from ray origin
//   point: Vector3,            // Intersection point in world coords
//   face: Object,              // Intersected face { a, b, c, normal, materialIndex }
//                              // (CORRECTED: Face3 was removed in r125; 0.170.0
//                              //  returns a plain object literal)
//   faceIndex: number,         // Face index
//   object: Object3D,          // Intersected object
//   uv: Vector2,               // UV coordinates at intersection
//   uv1: Vector2,              // Second UV channel
//   normal: Vector3,           // Interpolated face normal
//   instanceId: number         // For InstancedMesh
// }
```

> **HULLBREAKER:** the hostiles, bullets, and capsules are `InstancedMesh`
> (`src/render/hostiles.js`, `src/render/bullets.js`, `src/render/capsules.js`),
> so `instanceId` — not `object` — is the only thing that identifies a row, and
> the mapping from instance slot to sim row is render-private. Do not build a
> sim lookup out of it.

### Mouse Position Conversion

```javascript
const mouse = new THREE.Vector2();

function updateMouse(event) {
  // For full window
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

// For specific canvas element
function updateMouseCanvas(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}
```

### Touch Support

```javascript
// HULLBREAKER: a touch/pointer channel that reaches gameplay is a NEW INPUT
// CHANNEL — tools/playtest/lib/driver.mjs can only dispatch keydown/keyup, so
// nothing here is replayable by the bot harness. Operator decision required
// (docs/decisions.md) before any of this touches src/sim/input.js.
function onTouchStart(event) {
  event.preventDefault();

  if (event.touches.length === 1) {
    const touch = event.touches[0];
    mouse.x = (touch.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(touch.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(clickableObjects);

    if (intersects.length > 0) {
      handleSelection(intersects[0]);
    }
  }
}

renderer.domElement.addEventListener("touchstart", onTouchStart);
```

### Raycaster Options

```javascript
const raycaster = new THREE.Raycaster();

// Near/far clipping (default: 0, Infinity)
raycaster.near = 0;
raycaster.far = 100;

// Line/Points precision
raycaster.params.Line.threshold = 0.1;
raycaster.params.Points.threshold = 0.1;

// Layers (only intersect objects on specific layers)
raycaster.layers.set(1);
```

### Efficient Raycasting

```javascript
// Only check specific objects
const clickables = [mesh1, mesh2, mesh3];
const intersects = raycaster.intersectObjects(clickables, false);

// Use layers for filtering
mesh1.layers.set(1); // Clickable layer
raycaster.layers.set(1);

// Throttle raycast for hover effects
let lastRaycast = 0;
function onMouseMove(event) {
  // HULLBREAKER: Date.now() is banned in src/pure/ and src/sim/ (determinism
  // rule; the layer guard also bans `performance`). In render code prefer the
  // sim clock — `gameMs` from src/sim/time.js — so a throttle can never make
  // the played run diverge from a replayed one.
  const now = Date.now();
  if (now - lastRaycast < 50) return; // 20fps max
  lastRaycast = now;

  // Raycast here
}
```

## Camera Controls

> **HULLBREAKER:** every controls class in this section is forbidden on the
> shipped camera. `tools/pathcheck.mjs` asserts the exact pose
> (`'camera pull-back pose'`), `decisions.md` entry 7 fixes FAR as the default
> view, and `src/render/camera.js` rewrites the pose each frame while
> calibrating `src/sim/edges.js`. Keep this section as API reference for
> standalone tools under `tools/` that are not the game.

### OrbitControls

```javascript
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const controls = new OrbitControls(camera, renderer.domElement);

// Damping (smooth movement)
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Rotation limits
controls.minPolarAngle = 0; // Top
controls.maxPolarAngle = Math.PI / 2; // Horizon
controls.minAzimuthAngle = -Math.PI / 4; // Left
controls.maxAzimuthAngle = Math.PI / 4; // Right

// Zoom limits
controls.minDistance = 2;
controls.maxDistance = 50;

// Enable/disable features
controls.enableRotate = true;
controls.enableZoom = true;
controls.enablePan = true;

// Auto-rotate
controls.autoRotate = true;
controls.autoRotateSpeed = 2.0;

// Target (orbit point)
controls.target.set(0, 1, 0);

// Update in animation loop
function animate() {
  controls.update(); // Required for damping and auto-rotate
  renderer.render(scene, camera);
}
```

### FlyControls

```javascript
import { FlyControls } from "three/addons/controls/FlyControls.js";

const controls = new FlyControls(camera, renderer.domElement);
controls.movementSpeed = 10;
controls.rollSpeed = Math.PI / 24;
controls.dragToLook = true;

// Update with delta
function animate() {
  controls.update(clock.getDelta());
  renderer.render(scene, camera);
}
```

### FirstPersonControls

```javascript
import { FirstPersonControls } from "three/addons/controls/FirstPersonControls.js";

const controls = new FirstPersonControls(camera, renderer.domElement);
controls.movementSpeed = 10;
controls.lookSpeed = 0.1;
controls.lookVertical = true;
controls.constrainVertical = true;
controls.verticalMin = Math.PI / 4;
controls.verticalMax = (Math.PI * 3) / 4;

function animate() {
  controls.update(clock.getDelta());
}
```

### PointerLockControls

```javascript
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const controls = new PointerLockControls(camera, document.body);

// Lock pointer on click
document.addEventListener("click", () => {
  controls.lock();
});

controls.addEventListener("lock", () => {
  console.log("Pointer locked");
});

controls.addEventListener("unlock", () => {
  console.log("Pointer unlocked");
});

// Movement
// HULLBREAKER: this is a second movement system. RIG's movement lives in
// src/sim/player.js under frozen CONFIG constants ("Jump/movement constants in
// CONFIG are frozen and asserted"). Never drive the player from here.
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
// CORRECTED (upstream bug): these were declared `const` and then reassigned
// below, which throws TypeError. They must be `let`.
let moveForward = false;
let moveBackward = false;

document.addEventListener("keydown", (event) => {
  switch (event.code) {
    case "KeyW":
      moveForward = true;
      break;
    case "KeyS":
      moveBackward = true;
      break;
  }
});

function animate() {
  if (controls.isLocked) {
    direction.z = Number(moveForward) - Number(moveBackward);
    direction.normalize();

    velocity.z -= direction.z * 0.1;
    velocity.z *= 0.9; // Friction

    controls.moveForward(-velocity.z);
  }
}
```

### TrackballControls

```javascript
import { TrackballControls } from "three/addons/controls/TrackballControls.js";

const controls = new TrackballControls(camera, renderer.domElement);
controls.rotateSpeed = 2.0;
controls.zoomSpeed = 1.2;
controls.panSpeed = 0.8;
controls.staticMoving = true;

function animate() {
  controls.update();
}
```

### MapControls

```javascript
import { MapControls } from "three/addons/controls/MapControls.js";

const controls = new MapControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.screenSpacePanning = false;
controls.maxPolarAngle = Math.PI / 2;
```

## TransformControls

Gizmo for moving/rotating/scaling objects.

> **HULLBREAKER:** an editor gizmo has no place in the shipped page — world
> geometry is generated from `src/pure/` data (`generator.js`, `traversal.js`,
> `limb.js`, `transform.js`) and hand-dragging a mesh would desync render from
> sim. Also note `decisions.md` entry 3: the creature's anatomy is **static**;
> only doors, plates, covers, shutters, traps, and Crown mechanisms move.

```javascript
import { TransformControls } from "three/addons/controls/TransformControls.js";

const transformControls = new TransformControls(camera, renderer.domElement);
// CORRECTED for three 0.170.0: TransformControls extends Controls, not
// Object3D, since r169 — `scene.add(transformControls)` throws. Add its
// helper object instead (verified against the pinned CDN build).
scene.add(transformControls.getHelper());

// Attach to object
transformControls.attach(selectedMesh);

// Switch modes
transformControls.setMode("translate"); // 'translate', 'rotate', 'scale'

// Change space
transformControls.setSpace("local"); // 'local', 'world'

// Size
transformControls.setSize(1);

// Events
transformControls.addEventListener("dragging-changed", (event) => {
  // Disable orbit controls while dragging
  orbitControls.enabled = !event.value;
});

transformControls.addEventListener("change", () => {
  renderer.render(scene, camera);
});

// Keyboard shortcuts
// HULLBREAKER: g/r/s collide with the shipped KEYMAP in src/main.js (KeyS =
// down, KeyR = reset in slices). Any dev tool that binds keys must avoid the
// KEYMAP codes and stay behind an off-by-default src/mode.js flag.
window.addEventListener("keydown", (event) => {
  switch (event.key) {
    case "g":
      transformControls.setMode("translate");
      break;
    case "r":
      transformControls.setMode("rotate");
      break;
    case "s":
      transformControls.setMode("scale");
      break;
    case "Escape":
      transformControls.detach();
      break;
  }
});
```

## DragControls

Drag objects directly.

> **HULLBREAKER:** dragging moves render meshes only; the sim's `(s, y)` state
> would not follow, so the world would render in a place the player cannot
> stand. Tooling-only, never shipped.

```javascript
import { DragControls } from "three/addons/controls/DragControls.js";

const draggableObjects = [mesh1, mesh2, mesh3];
const dragControls = new DragControls(
  draggableObjects,
  camera,
  renderer.domElement,
);

dragControls.addEventListener("dragstart", (event) => {
  orbitControls.enabled = false;
  event.object.material.emissive.set(0xaaaaaa); // HULLBREAKER: use CONFIG.palette
});

dragControls.addEventListener("drag", (event) => {
  // Constrain to ground plane
  event.object.position.y = 0;
});

dragControls.addEventListener("dragend", (event) => {
  orbitControls.enabled = true;
  event.object.material.emissive.set(0x000000);
});
```

## Selection System

### Click to Select

```javascript
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let selectedObject = null;

function onMouseDown(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(selectableObjects);

  // Deselect previous
  if (selectedObject) {
    selectedObject.material.emissive.set(0x000000);
  }

  // Select new
  if (intersects.length > 0) {
    selectedObject = intersects[0].object;
    // HULLBREAKER: color literal — route through CONFIG.palette (src/config.js).
    selectedObject.material.emissive.set(0x444444);
  } else {
    selectedObject = null;
  }
}
```

### Box Selection

```javascript
import { SelectionBox } from "three/addons/interactive/SelectionBox.js";
import { SelectionHelper } from "three/addons/interactive/SelectionHelper.js";

const selectionBox = new SelectionBox(camera, scene);
const selectionHelper = new SelectionHelper(renderer, "selectBox"); // CSS class

document.addEventListener("pointerdown", (event) => {
  selectionBox.startPoint.set(
    (event.clientX / window.innerWidth) * 2 - 1,
    -(event.clientY / window.innerHeight) * 2 + 1,
    0.5,
  );
});

document.addEventListener("pointermove", (event) => {
  if (selectionHelper.isDown) {
    selectionBox.endPoint.set(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1,
      0.5,
    );
  }
});

document.addEventListener("pointerup", (event) => {
  selectionBox.endPoint.set(
    (event.clientX / window.innerWidth) * 2 - 1,
    -(event.clientY / window.innerHeight) * 2 + 1,
    0.5,
  );

  const selected = selectionBox.select();
  console.log("Selected objects:", selected);
});
```

### Hover Effects

> **HULLBREAKER:** a hover highlight is a visible change — it is an operator
> feel question (`SPRINT.md`, "Operator checkpoint queue"), not something a
> machine gate can approve. Also: at the FAR default view RIG is ≈3.7% of
> screen height (`decisions.md` entry 7), so per-object hover cues are near
> unreadable; the recorded follow-up there is scaling tells and glyphs up, not
> adding pointer affordances.

```javascript
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let hoveredObject = null;

function onMouseMove(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(hoverableObjects);

  // Reset previous hover
  if (hoveredObject) {
    hoveredObject.material.color.set(hoveredObject.userData.originalColor);
    document.body.style.cursor = "default";
  }

  // Apply new hover
  if (intersects.length > 0) {
    hoveredObject = intersects[0].object;
    if (!hoveredObject.userData.originalColor) {
      hoveredObject.userData.originalColor =
        hoveredObject.material.color.getHex();
    }
    // HULLBREAKER: color literal — route through CONFIG.palette (src/config.js).
    hoveredObject.material.color.set(0xff6600);
    document.body.style.cursor = "pointer";
  } else {
    hoveredObject = null;
  }
}

window.addEventListener("mousemove", onMouseMove);
```

## Keyboard Input

> **HULLBREAKER:** the repo already does this. `KEYMAP` in `src/main.js` maps
> `event.code` → the intent buffer in `src/sim/input.js`, with jump/hook press
> buffering, `preventDefault`, and `releaseAllKeys` on blur/visibility change.
> Add bindings there; never add a second listener that writes player state, and
> never move the player from a DOM handler — `src/sim/player.js` owns position
> under frozen `CONFIG` constants.

```javascript
const keys = {};

document.addEventListener("keydown", (event) => {
  keys[event.code] = true;
});

document.addEventListener("keyup", (event) => {
  keys[event.code] = false;
});

function update() {
  const speed = 0.1;

  // HULLBREAKER: writing player.position from an input handler bypasses the
  // simulation entirely (layer purity + determinism). Set intent flags only.
  if (keys["KeyW"]) player.position.z -= speed;
  if (keys["KeyS"]) player.position.z += speed;
  if (keys["KeyA"]) player.position.x -= speed;
  if (keys["KeyD"]) player.position.x += speed;
  if (keys["Space"]) player.position.y += speed;
  if (keys["ShiftLeft"]) player.position.y -= speed;
}
```

## World-Screen Coordinate Conversion

> **HULLBREAKER:** there is already one projection path, and it is deliberate.
> `src/render/camera.js`'s `probeXAtNdc()` unprojects a probe
> `PerspectiveCamera` at the local rig pose and pushes the result into
> `src/sim/edges.js` via `setEdges()` — the single sanctioned render→sim write
> (`src/sim/bridge.js`, "Known exception"). `src/sim/edges.js` explains why it
> is calibrated rather than per-frame: per-frame frustum unprojection "goes
> invalid the moment the camera yaws," and corner rituals yaw the camera.
> Extend that path; do not add a second one.

### World to Screen

```javascript
function worldToScreen(position, camera) {
  const vector = position.clone();
  vector.project(camera);

  return {
    x: ((vector.x + 1) / 2) * window.innerWidth,
    y: (-(vector.y - 1) / 2) * window.innerHeight,
  };
}

// Position HTML element over 3D object
const screenPos = worldToScreen(mesh.position, camera);
element.style.left = screenPos.x + "px";
element.style.top = screenPos.y + "px";
```

### Screen to World

```javascript
function screenToWorld(screenX, screenY, camera, targetZ = 0) {
  const vector = new THREE.Vector3(
    (screenX / window.innerWidth) * 2 - 1,
    -(screenY / window.innerHeight) * 2 + 1,
    0.5,
  );

  vector.unproject(camera);

  const dir = vector.sub(camera.position).normalize();
  const distance = (targetZ - camera.position.z) / dir.z;

  return camera.position.clone().add(dir.multiplyScalar(distance));
}
```

### Ray-Plane Intersection

```javascript
function getRayPlaneIntersection(mouse, camera, plane) {
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);

  const intersection = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, intersection);

  return intersection;
}

// Ground plane
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const worldPos = getRayPlaneIntersection(mouse, camera, groundPlane);
```

## Event Handling Best Practices

> **HULLBREAKER:** if a manager like this ever lands here it belongs in
> `src/render/` or `src/ui/`, must be constructed only when an off-by-default
> `src/mode.js` flag is set, and its callbacks must be presentation-only —
> `src/sim/bridge.js`: "A hook must never write sim state or the headless run
> diverges from the played run." Ship it with a pathcheck assertion that no
> `src/sim/` file references it (pattern: `tools/pathcheck.mjs`, grep
> `static guards: the rework is render-only by construction`).

```javascript
class InteractionManager {
  constructor(camera, renderer, scene) {
    this.camera = camera;
    this.renderer = renderer;
    this.scene = scene;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.clickables = [];

    this.bindEvents();
  }

  bindEvents() {
    const canvas = this.renderer.domElement;

    canvas.addEventListener("click", (e) => this.onClick(e));
    canvas.addEventListener("mousemove", (e) => this.onMouseMove(e));
    canvas.addEventListener("touchstart", (e) => this.onTouchStart(e));
  }

  updateMouse(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  getIntersects() {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    return this.raycaster.intersectObjects(this.clickables, true);
  }

  onClick(event) {
    this.updateMouse(event);
    const intersects = this.getIntersects();

    if (intersects.length > 0) {
      const object = intersects[0].object;
      if (object.userData.onClick) {
        object.userData.onClick(intersects[0]);
      }
    }
  }

  addClickable(object, callback) {
    this.clickables.push(object);
    object.userData.onClick = callback;
  }

  dispose() {
    // Remove event listeners
  }
}

// Usage
const interaction = new InteractionManager(camera, renderer, scene);
interaction.addClickable(mesh, (intersect) => {
  console.log("Clicked at:", intersect.point);
});
```

## Performance Tips

1. **Limit raycasts**: Throttle mousemove handlers
2. **Use layers**: Filter raycast targets
3. **Simple collision meshes**: Use invisible simpler geometry for raycasting
4. **Disable controls when not needed**: `controls.enabled = false`
5. **Batch updates**: Group interaction checks

```javascript
// Use simpler geometry for raycasting
const complexMesh = loadedModel;
const collisionMesh = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshBasicMaterial({ visible: false }),
);
collisionMesh.userData.target = complexMesh;
clickables.push(collisionMesh);
```

> **HULLBREAKER:** "collision mesh" here means a *picking* proxy, not gameplay
> collision. Gameplay collision is 2D and lives in `src/sim/player.js` /
> `src/sim/level.js` / `src/pure/traversal.js`; it never consults a mesh.

## See Also

- `threejs-fundamentals` - Camera and scene setup
- `threejs-animation` - Animating interactions
- `threejs-shaders` - Visual feedback effects

> **HULLBREAKER:** `threejs-fundamentals` and `threejs-animation` were installed
> alongside this skill under `.claude/skills/`; other pack skills referenced
> here may not be present. Each installed sibling carries its own guardrails
> section — read it before applying anything from it.
