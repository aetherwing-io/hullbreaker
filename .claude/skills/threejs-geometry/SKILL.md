---
name: threejs-geometry
description: Three.js geometry creation - built-in shapes, BufferGeometry, custom geometry, instancing. Use when creating 3D shapes, working with vertices, building custom meshes, or optimizing with instanced rendering. In HULLBREAKER this is render-layer material only (src/render/*.js, src/ui/, src/main.js) and it is the reference for the InstancedMesh pools that carry the 60fps-with-200+-projectiles budget - tiles, bullets, the limb bake, and transform weather.
---

# Three.js Geometry

## HULLBREAKER guardrails (read before using anything below)

Everything after this section is upstream reference material written for a
generic three.js app. This repo is not generic. Read these eleven points
first; they override the upstream text wherever they disagree.

### 1. Where this material may legitimately be used

Only these files may contain `THREE`, geometry, or anything else below:

- `src/render/` — `scene.js`, `camera.js`, `tower.js`, `level.js`,
  `bullets.js`, `hostiles.js`, `capsules.js`, `player.js`, `mods.js`,
  `limb.js`, `transform.js`, `fx.js`, `hook.js`
- `src/ui/` — `hud.js`, `overlay.js`, `tint.js`, `audio.js` (DOM, not geometry)
- `src/main.js` — the composition root

**Never** in `src/pure/` or `src/sim/`. `CLAUDE.md`, Hard rules: "`src/pure/`
and `src/sim/` never reference THREE, `document`, or `window`, and never
import upward." A vertex buffer, a `Vector3`, an `InstancedMesh` — none of it
crosses into those two directories, no matter how convenient. Sim-to-render
crossings go through the hooks in `src/sim/bridge.js`, whose contract says
verbatim: "A hook must never write sim state or the headless run diverges
from the played run."

### 2. The guard that catches you

`tools/pathcheck.mjs` line 107 defines

```js
const banned = /\b(THREE|document|window|renderer|scene|addEventListener|requestAnimationFrame|innerWidth|innerHeight|devicePixelRatio|performance)\b/;
```

and `guardLayer()` (lines 111-138) runs it over `src/config.js` +
`src/pure/*.js` (pure) and `src/sim/*.js` (sim), after stripping comments —
so prose may name three.js, code may not. The same function enforces the
import allowlist: pure may import only `../config.js` or `./sibling.js`; sim
may additionally import `../mode.js` and `../pure/*.js`. A hit calls
`process.exit(1)` *before* the 600+ assertion suite even starts, so the
failure is a one-line message, not a FAIL list. Run `node tools/pathcheck.mjs`
(must exit 0) after every change.

### 3. Instancing is already solved here — extend it, do not reinvent it

Four working instanced pools exist. Read the closest one before writing a
fifth:

- `src/render/bullets.js` — two `InstancedMesh` pools (live shots +
  bend-cull departure tracers). The live pool is `BULLET_MAX` (= 256, exported
  by `src/sim/weapons.js`) and is **slot-indexed by the same index as the sim's
  `bulletPool`**, so no lookup and no allocation per shot. Color uploads are
  gated on change (`slotType[i] !== type`), and `setColorAt(0, ...)` runs once
  at module load purely to allocate `instanceColor` up front.
- `src/render/level.js` — one tile `InstancedMesh` for the whole six-face
  tower, baked once with `tileBaseMats` (final matrix per instance),
  `columnInstances` (column to instance range) and `faceRanges`, so the corner
  ritual can move columns without ever rebuilding the mesh.
- `src/render/limb.js` — one `InstancedMesh` per material key, all sharing a
  single `BoxGeometry(1,1,1)`, ~800 armour pieces uploaded once and never
  touched again. Its header comment states the reason: "~800 armour pieces
  would otherwise be ~800 draw calls."
- `src/render/transform.js` — the transform-slice band and vapor pools.

Two shared helpers you must use rather than duplicate:

- **Hiding an instance:** `HIDE` from `src/render/scene.js`
  (`new THREE.Matrix4().makeScale(0, 0, 0)`). Do not `scene.remove()`,
  `dispose()`, or resize a pool at runtime to make something disappear.
- **(s, y) to world:** `towerPose()`, `placeOnTower()`, `placeSharp()` in
  `src/render/tower.js`. That module is "the one place logical (s, y) becomes
  a 3D position." Computing your own curve/offset math is how the rendered
  ribbon and the 2D simulation drift apart.

Note also the convention `mesh.frustumCulled = false` on level-spanning
instanced pools (`bullets.js:21`, `level.js:101`, `limb.js:103`) — a pool full
of HIDE-scaled instances has a degenerate bounding sphere and would vanish.

### 4. Per-frame allocation is the budget, not a style preference

`docs/DESIGN.md`, "Technical acceptance": "60fps target with 200+ projectiles
and the target traversal density." The shipped pattern is module-scope scratch
objects reused every frame — `bullets.js` holds `_bm` (Matrix4), `_bq`
(Quaternion), `_be` (Euler), `_bs`/`_bv` (Vector3), `_shotColor` (Color);
`limb.js` holds `_m/_q/_e/_s/_v/_c/_tint`; `tower.js` holds `_pp`/`_pose`;
`hostiles.js` reuses one `HOUND_POSE` object with the comment "sync runs per
hostile per frame, so no allocation."

Several upstream examples below allocate inside the loop (`new THREE.Object3D()`
per instance, `new THREE.Color(...)` per `setColorAt`, a fresh `Matrix4` per
update). That is fine at **bake time** (`level.js:116` does exactly that once,
at startup) and a GC stutter at **frame time**. Anything reached from a
`view.*` hook in `src/sim/bridge.js` is frame time.

### 5. Determinism: five examples below call `Math.random()`

`CLAUDE.md`: "randomness only via seeded `src/pure/rng.js`. No `Math.random`,
`Date.now`, or `performance.now` in `src/pure/` or `src/sim/`." `Math.random`
currently appears **nowhere** in `src/` except a comment in `src/ui/audio.js:79`
("ui may use `Math.random`, but a seeded source costs nothing"). The seeded
source is `mulberry32()` in `src/pure/rng.js`.

Render-side scatter (point clouds, debris fields, instance jitter) is not
caught by pathcheck, but the bot playtest runs `--deterministic`
(`tools/playtest/run.mjs`) and `index.html?selftest=1` compares runs — a
render layer that reshuffles itself every reload makes screenshot evidence
worthless. Seed it from `mulberry32` at bake time.

### 6. Static-anatomy rule: morph targets and assembly need a decision first

`docs/decisions.md` entry 3 (2026-07-30, CP3 verdict) is law: "the creature's
anatomy is monumental and **static** during a transition — RIG and the camera
are what move. The next stretch of world already exists and is *revealed* ...
never *assembled*, slammed, or articulated into place." Only doors, access
plates, vent covers, shutters, traps, and Crown mechanisms may move.

Concretely, from the material below:

- **Morph targets**, animated `position` attributes, and `computeVertexNormals()`
  in a frame loop applied to the creature's body are exactly the choppy
  "assets thrown together" the operator rejected. They need a **new operator
  decision recorded in `docs/decisions.md`** before shipping — not a flag, not
  a "just prototyping it" merge.
- The same entry's addendum keeps zip-assembly for "traps that assemble or
  different enemies that are presented later." That choreography already exists
  and is deliberately preserved: `zipperColumn()` and `faceRevealed()` in
  `src/render/level.js` (see the block comment at lines 31-38, and the `IS_G1`
  early-returns that make a limb refuse to assemble). Extend those for the
  traps/emplacements lane instead of writing a second assembler.

### 7. No color literals in tokenized render files

Today the color tokens live in the `palette` block of `src/config.js`
(`CONFIG.palette`, from line 482) and `CONFIG.limb.bg`. A palette
centralization (`src/render/palette.js`, task `T-010`, commit `680c21b`) is
in flight and **not yet on `main`**; when it merges, tokenized render files
read `PAL.*` and pathcheck asserts that `scene.js`, `level.js`, `capsules.js`,
`bullets.js`, `player.js`, `mods.js`, `limb.js`, `transform.js`, `tower.js`,
`fx.js` contain **zero** `CONFIG.palette` / `CONFIG.limb.bg` reads
(`hostiles.js` and `hook.js` are explicitly exempt). Either way, the rule for
new geometry is the same: **no raw hex in a render file that a token already
covers**. Every `0x00ff00` in the upstream examples below is placeholder, not
a permitted value. Values are also chosen against what the renderer *produces*
under ACES tone mapping, not against the hex — see the ladder reasoning in
`src/render/limb.js:32-44`.

### 8. Module specifiers: `three` and `three/addons/` only

`index.html` ships an import map with exactly two entries, pinned to 0.170.0:

```json
"three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
"three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"
```

Upstream writes `three/examples/jsm/...`, which is **not mapped** and will
fail to resolve in the browser. Those specifiers are corrected to
`three/addons/...` inline below. There is **no build step and no package
manager for the game** — never run `npm install` for anything under `src/`;
dev-only dependencies are allowed under `tools/*/` with their own
`package.json` (e.g. `tools/playtest/package.json`) and nowhere else. Nothing
in `src/` currently imports an addon at all, so the first addon import is a
new runtime dependency on a second CDN file: raise it with the integrator.

### 9. Raycasting cannot touch the simulation

`CLAUDE.md`: "The simulation stays 2D `(s, y)`; collision, physics, aiming,
and spawning never leave it." The upstream `raycaster.intersectObject(instancedMesh)`
recipe is legitimate only for presentation or debug tooling. Feeding an
`instanceId` back into hit detection, aiming, or spawn logic breaks both the
2D rule and the bridge contract, and would silently desync the headless bot
harness from the played run. `src/render/camera.js` calling
`src/sim/edges.js#setEdges()` is the **one** documented render-to-sim write
(see the "Known exception" note at the top of `src/sim/bridge.js`); do not add
a second.

### 10. Segment counts and silhouettes are judged at the FAR camera

`docs/decisions.md` entry 7 (2026-07-30): FAR is the default view, with RIG at
about 3.7% of screen height, matching concept board 13's 3-5% band
(`docs/concept-art/README.md`, "Visual invariants"). A 64-segment sphere that
reads as a smooth ball at `?view=near` is spending triangles nobody can see at
the shipped default; conversely, detail that only survives as a silhouette
needs to survive *as a silhouette*. Same entry: projectiles must not curve
around bends — the departure tracers in `src/render/bullets.js` (`bendCulled`)
are presentation-only and must stay that way.

### 11. What you may not decide yourself

**Machine gates never judge fun.** Pathcheck passing says nothing about
whether new geometry reads correctly. Anything visual goes to `SPRINT.md`'s
operator checkpoint queue as a packet with an exact URL and 3-5 questions;
never self-declare a look good. Any of the following needs an operator
decision recorded in `docs/decisions.md` **first**, and this skill does not
grant it:

- animated/morphing geometry on the creature's anatomy (entry 3),
- a new runtime dependency, including a second CDN module (`three/addons/*`),
- changing the default view scale or camera framing (entry 7),
- new color roles outside the palette tokens,
- raycast-driven or otherwise 3D-derived gameplay state (2D rule),
- retuning frozen `CONFIG` movement constants to accommodate a visual.

Also standing: work only inside your assigned worktree and task scope, and
never commit or push to `main` — `tools/orch/merge-task.sh` is the only path.

---

*Everything below is the upstream `threejs-geometry` reference, preserved.
Inline `// HULLBREAKER:` comments mark places where an example as written
would violate one of the rules above. API corrections against the pinned
three.js 0.170.0 are marked `// CORRECTED for 0.170.0`.*

## Quick Start

```javascript
import * as THREE from "three";

// Built-in geometry
const box = new THREE.BoxGeometry(1, 1, 1);
const sphere = new THREE.SphereGeometry(0.5, 32, 32);
const plane = new THREE.PlaneGeometry(10, 10);

// Create mesh
// HULLBREAKER: 0x00ff00 is a placeholder. Real surfaces take a palette token
// (CONFIG.palette today, PAL.* once T-010 lands) - guardrail 7.
const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
const mesh = new THREE.Mesh(box, material);
scene.add(mesh);
```

## Built-in Geometries

### Basic Shapes

```javascript
// Box - width, height, depth, widthSegments, heightSegments, depthSegments
new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);

// Sphere - radius, widthSegments, heightSegments, phiStart, phiLength, thetaStart, thetaLength
new THREE.SphereGeometry(1, 32, 32);
new THREE.SphereGeometry(1, 32, 32, 0, Math.PI * 2, 0, Math.PI); // Full sphere
new THREE.SphereGeometry(1, 32, 32, 0, Math.PI); // Hemisphere

// Plane - width, height, widthSegments, heightSegments
new THREE.PlaneGeometry(10, 10, 1, 1);

// Circle - radius, segments, thetaStart, thetaLength
new THREE.CircleGeometry(1, 32);
new THREE.CircleGeometry(1, 32, 0, Math.PI); // Semicircle

// Cylinder - radiusTop, radiusBottom, height, radialSegments, heightSegments, openEnded
new THREE.CylinderGeometry(1, 1, 2, 32, 1, false);
new THREE.CylinderGeometry(0, 1, 2, 32); // Cone
new THREE.CylinderGeometry(1, 1, 2, 6); // Hexagonal prism

// Cone - radius, height, radialSegments, heightSegments, openEnded
new THREE.ConeGeometry(1, 2, 32, 1, false);

// Torus - radius, tube, radialSegments, tubularSegments, arc
new THREE.TorusGeometry(1, 0.4, 16, 100);

// TorusKnot - radius, tube, tubularSegments, radialSegments, p, q
new THREE.TorusKnotGeometry(1, 0.4, 100, 16, 2, 3);

// Ring - innerRadius, outerRadius, thetaSegments, phiSegments
new THREE.RingGeometry(0.5, 1, 32, 1);
```

<!-- HULLBREAKER: the shipped roster uses the low end of these - Sphere(radius,6,6)
     for shots, Octahedron/Dodecahedron/Box for hostiles (src/render/hostiles.js:14-20),
     Box for every tile and armour piece. Flat-shaded chunky industrial geometry is a
     concept-art invariant, not a performance compromise - guardrail 10. -->

### Advanced Shapes

```javascript
// Capsule - radius, length, capSegments, radialSegments
new THREE.CapsuleGeometry(0.5, 1, 4, 8);

// Dodecahedron - radius, detail
new THREE.DodecahedronGeometry(1, 0);

// Icosahedron - radius, detail (0 = 20 faces, higher = smoother)
new THREE.IcosahedronGeometry(1, 0);

// Octahedron - radius, detail
new THREE.OctahedronGeometry(1, 0);

// Tetrahedron - radius, detail
new THREE.TetrahedronGeometry(1, 0);

// Polyhedron - vertices, indices, radius, detail
const vertices = [1, 1, 1, -1, -1, 1, -1, 1, -1, 1, -1, -1];
const indices = [2, 1, 0, 0, 3, 2, 1, 3, 0, 2, 3, 1];
new THREE.PolyhedronGeometry(vertices, indices, 1, 0);
```

### Path-Based Shapes

```javascript
// Lathe - points[], segments, phiStart, phiLength
const points = [
  new THREE.Vector2(0, 0),
  new THREE.Vector2(0.5, 0),
  new THREE.Vector2(0.5, 1),
  new THREE.Vector2(0, 1),
];
new THREE.LatheGeometry(points, 32);

// Extrude - shape, options
const shape = new THREE.Shape();
shape.moveTo(0, 0);
shape.lineTo(1, 0);
shape.lineTo(1, 1);
shape.lineTo(0, 1);
shape.lineTo(0, 0);

const extrudeSettings = {
  steps: 2,
  depth: 1,
  bevelEnabled: true,
  bevelThickness: 0.1,
  bevelSize: 0.1,
  bevelSegments: 3,
};
new THREE.ExtrudeGeometry(shape, extrudeSettings);

// Tube - path, tubularSegments, radius, radialSegments, closed
// HULLBREAKER: a Curve3 through the level is NOT the traversal ribbon. The
// polyline lives in src/pure/path.js and is mapped by src/render/tower.js;
// tube geometry may decorate, never define, where the player can stand.
const curve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(1, 0, 0),
]);
new THREE.TubeGeometry(curve, 64, 0.2, 8, false);
```

### Text Geometry

```javascript
// CORRECTED for 0.170.0: the import map exposes "three/addons/", not
// "three/examples/jsm/" (guardrail 8). Both files are a second CDN fetch -
// clear a new addon import with the integrator first.
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";

const loader = new FontLoader();
// HULLBREAKER: this loads a font file over the network. There is no asset
// pipeline for the game; HUD text is DOM (src/ui/hud.js) and pickup letters
// are a cached CanvasTexture (src/render/capsules.js#letterTexture).
loader.load("fonts/helvetiker_regular.typeface.json", (font) => {
  const geometry = new TextGeometry("Hello", {
    font: font,
    size: 1,
    depth: 0.2, // Was 'height' in older versions ('depth' is correct for 0.170.0)
    curveSegments: 12,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.02,
    bevelSegments: 5,
  });

  // Center text
  geometry.computeBoundingBox();
  geometry.center();

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
});
```

## BufferGeometry

The base class for all geometries. Stores data as typed arrays for GPU efficiency.

### Custom BufferGeometry

```javascript
const geometry = new THREE.BufferGeometry();

// Vertices (3 floats per vertex: x, y, z)
const vertices = new Float32Array([
  -1,
  -1,
  0, // vertex 0
  1,
  -1,
  0, // vertex 1
  1,
  1,
  0, // vertex 2
  -1,
  1,
  0, // vertex 3
]);
geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));

// Indices (for indexed geometry - reuse vertices)
const indices = new Uint16Array([
  0,
  1,
  2, // triangle 1
  0,
  2,
  3, // triangle 2
]);
geometry.setIndex(new THREE.BufferAttribute(indices, 1));

// Normals (required for lighting)
const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));

// UVs (for texturing)
const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));

// Colors (per-vertex colors)
const colors = new Float32Array([
  1,
  0,
  0, // red
  0,
  1,
  0, // green
  0,
  0,
  1, // blue
  1,
  1,
  0, // yellow
]);
geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
// Use with: material.vertexColors = true
```

### BufferAttribute Types

```javascript
// Common attribute types
new THREE.BufferAttribute(array, itemSize);

// Typed array options
new Float32Array(count * itemSize); // Positions, normals, UVs
new Uint16Array(count); // Indices (up to 65535 vertices)
new Uint32Array(count); // Indices (larger meshes)
new Uint8Array(count * itemSize); // Colors (0-255 range)

// Item sizes
// Position: 3 (x, y, z)
// Normal: 3 (x, y, z)
// UV: 2 (u, v)
// Color: 3 (r, g, b) or 4 (r, g, b, a)
// Index: 1
```

### Modifying BufferGeometry

```javascript
const positions = geometry.attributes.position;

// Modify vertex
positions.setXYZ(index, x, y, z);

// Access vertex
const x = positions.getX(index);
const y = positions.getY(index);
const z = positions.getZ(index);

// Flag for GPU update
positions.needsUpdate = true;

// Recompute normals after position changes
// HULLBREAKER: per-frame vertex rewrites + computeVertexNormals() on the
// creature's body are the "assembled, not revealed" motion rejected in
// docs/decisions.md entry 3, and computeVertexNormals allocates. Static bake
// only, unless an operator decision says otherwise - guardrails 4 and 6.
geometry.computeVertexNormals();

// Recompute bounding box/sphere after changes
geometry.computeBoundingBox();
geometry.computeBoundingSphere();
```

### Interleaved Buffers (Advanced)

```javascript
// More efficient memory layout for large meshes
const interleavedBuffer = new THREE.InterleavedBuffer(
  new Float32Array([
    // pos.x, pos.y, pos.z, uv.u, uv.v (repeated per vertex)
    -1, -1, 0, 0, 0, 1, -1, 0, 1, 0, 1, 1, 0, 1, 1, -1, 1, 0, 0, 1,
  ]),
  5, // stride (floats per vertex)
);

geometry.setAttribute(
  "position",
  new THREE.InterleavedBufferAttribute(interleavedBuffer, 3, 0),
); // size 3, offset 0
geometry.setAttribute(
  "uv",
  new THREE.InterleavedBufferAttribute(interleavedBuffer, 2, 3),
); // size 2, offset 3
```

## EdgesGeometry & WireframeGeometry

```javascript
// Edge lines (only hard edges)
const edges = new THREE.EdgesGeometry(boxGeometry, 15); // 15 = threshold angle
const edgeMesh = new THREE.LineSegments(
  edges,
  new THREE.LineBasicMaterial({ color: 0xffffff }),
);

// Wireframe (all triangles)
const wireframe = new THREE.WireframeGeometry(boxGeometry);
const wireMesh = new THREE.LineSegments(
  wireframe,
  new THREE.LineBasicMaterial({ color: 0xffffff }),
);
```

## Points

```javascript
// Create point cloud
const geometry = new THREE.BufferGeometry();
const positions = new Float32Array(1000 * 3);

// HULLBREAKER: Math.random() here. Render-side scatter must be seeded from
// mulberry32() in src/pure/rng.js so playtest runs and screenshots reproduce
// (guardrail 5); Math.random in src/pure or src/sim is a hard-rule violation.
for (let i = 0; i < 1000; i++) {
  positions[i * 3] = (Math.random() - 0.5) * 10;
  positions[i * 3 + 1] = (Math.random() - 0.5) * 10;
  positions[i * 3 + 2] = (Math.random() - 0.5) * 10;
}

geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

const material = new THREE.PointsMaterial({
  size: 0.1,
  sizeAttenuation: true, // Size decreases with distance
  color: 0xffffff,
});

const points = new THREE.Points(geometry, material);
scene.add(points);
```

## Lines

```javascript
// Line (connected points)
const points = [
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(1, 0, 0),
];
const geometry = new THREE.BufferGeometry().setFromPoints(points);
const line = new THREE.Line(
  geometry,
  new THREE.LineBasicMaterial({ color: 0xff0000 }),
);

// LineLoop (closed loop)
const loop = new THREE.LineLoop(geometry, material);

// LineSegments (pairs of points)
const segmentsGeometry = new THREE.BufferGeometry();
segmentsGeometry.setAttribute(
  "position",
  new THREE.BufferAttribute(
    new Float32Array([
      -1,
      0,
      0,
      0,
      1,
      0, // segment 1
      0,
      1,
      0,
      1,
      0,
      0, // segment 2
    ]),
    3,
  ),
);
const segments = new THREE.LineSegments(segmentsGeometry, material);
```

## InstancedMesh

Efficiently render many copies of the same geometry.

```javascript
const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
const count = 1000;

const instancedMesh = new THREE.InstancedMesh(geometry, material, count);

// Set transforms for each instance
// HULLBREAKER: allocate these ONCE at module scope, never per frame or per
// instance - the shipped pools keep _bm/_bq/_be/_bs/_bv scratch in
// src/render/bullets.js and _m/_q/_e/_s/_v in src/render/limb.js (guardrail 4).
const dummy = new THREE.Object3D();
const matrix = new THREE.Matrix4();

for (let i = 0; i < count; i++) {
  // HULLBREAKER: seeded rng only - see guardrail 5.
  dummy.position.set(
    (Math.random() - 0.5) * 20,
    (Math.random() - 0.5) * 20,
    (Math.random() - 0.5) * 20,
  );
  dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
  dummy.scale.setScalar(0.5 + Math.random());
  dummy.updateMatrix();

  instancedMesh.setMatrixAt(i, dummy.matrix);
}

// Flag for GPU update
// HULLBREAKER: set this once per frame after the whole pool is written
// (src/render/bullets.js#flush), not once per instance.
instancedMesh.instanceMatrix.needsUpdate = true;

// Optional: per-instance colors
// HULLBREAKER: the shipped idiom is one setColorAt(0, ...) at load to allocate
// instanceColor, then per-slot writes gated on an actual change
// (src/render/bullets.js#slotSpawned) - a color upload every frame for every
// instance is pure waste at 200+ projectiles.
instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(
  new Float32Array(count * 3),
  3,
);
for (let i = 0; i < count; i++) {
  // HULLBREAKER: allocates a Color per instance; reuse one module-scope
  // THREE.Color (_shotColor / _tint) instead.
  instancedMesh.setColorAt(
    i,
    new THREE.Color(Math.random(), Math.random(), Math.random()),
  );
}
instancedMesh.instanceColor.needsUpdate = true;

// HULLBREAKER: level-spanning pools also set frustumCulled = false, because a
// pool holding HIDE-scaled (zero-scale) instances computes a bounding sphere
// that culls the whole draw. See bullets.js:21, level.js:101, limb.js:103.
scene.add(instancedMesh);
```

### Update Instance at Runtime

```javascript
// Update single instance
const matrix = new THREE.Matrix4();
instancedMesh.getMatrixAt(index, matrix);
// Modify matrix...
instancedMesh.setMatrixAt(index, matrix);
instancedMesh.instanceMatrix.needsUpdate = true;

// Raycasting with instanced mesh
// HULLBREAKER: presentation/debug only. An instanceId must never feed hit
// detection, aiming, or spawning - the sim is strictly 2D (s, y) and the
// bridge contract forbids render-to-sim writes (guardrail 9).
const intersects = raycaster.intersectObject(instancedMesh);
if (intersects.length > 0) {
  const instanceId = intersects[0].instanceId;
}
```

<!-- HULLBREAKER: to hide one instance, write the shared HIDE matrix from
     src/render/scene.js (makeScale(0,0,0)) - see hideSlot() in
     src/render/bullets.js and unbuiltHidden() in src/render/level.js. Never
     rebuild or resize a pool at runtime. -->

## InstancedBufferGeometry (Advanced)

For custom per-instance attributes beyond transform/color.

```javascript
const geometry = new THREE.InstancedBufferGeometry();
geometry.copy(new THREE.BoxGeometry(1, 1, 1));

// Add per-instance attribute
const offsets = new Float32Array(count * 3);
for (let i = 0; i < count; i++) {
  offsets[i * 3] = Math.random() * 10;
  offsets[i * 3 + 1] = Math.random() * 10;
  offsets[i * 3 + 2] = Math.random() * 10;
}
geometry.setAttribute("offset", new THREE.InstancedBufferAttribute(offsets, 3));

// Use in shader
// attribute vec3 offset;
// vec3 transformed = position + offset;
// HULLBREAKER: this path implies a custom ShaderMaterial. Nothing in src/render
// uses one today (MeshStandardMaterial / MeshBasicMaterial only); a shader is a
// new visual system, so it needs a checkpoint packet, not a silent merge.
```

## Geometry Utilities

```javascript
// CORRECTED for 0.170.0: "three/addons/" is the mapped prefix (guardrail 8).
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";

// Merge geometries (must have same attributes)
const merged = BufferGeometryUtils.mergeGeometries([geo1, geo2, geo3]);

// Merge with groups (for multi-material)
// CORRECTED: upstream declared this as `merged` too, which throws on paste.
const mergedWithGroups = BufferGeometryUtils.mergeGeometries([geo1, geo2], true);

// Compute tangents (required for normal maps)
// CORRECTED for 0.170.0: BufferGeometryUtils.computeTangents does NOT exist in
// this build (verified against the pinned CDN module). Use the core method
// geometry.computeTangents() - which needs index + position + normal + uv - or
// BufferGeometryUtils.computeMikkTSpaceTangents(geometry, mikktspace), which
// pulls in a further dependency and is therefore off-limits without a decision.
geometry.computeTangents();

// Interleave attributes for better performance
const interleaved = BufferGeometryUtils.interleaveAttributes([
  geometry.attributes.position,
  geometry.attributes.normal,
  geometry.attributes.uv,
]);
```

<!-- HULLBREAKER: before reaching for mergeGeometries to cut draw calls, check
     whether the case is already instanced - src/render/limb.js merges ~800
     armour pieces into one InstancedMesh per material key precisely to avoid
     ~800 draws, and src/render/level.js bakes the whole tower into one. Merging
     also destroys per-column instance ranges (columnInstances / faceRanges),
     which the corner ritual depends on. -->

## Common Patterns

### Center Geometry

```javascript
geometry.computeBoundingBox();
geometry.center(); // Move vertices so center is at origin
```

### Scale to Fit

```javascript
geometry.computeBoundingBox();
const size = new THREE.Vector3();
geometry.boundingBox.getSize(size);
const maxDim = Math.max(size.x, size.y, size.z);
geometry.scale(1 / maxDim, 1 / maxDim, 1 / maxDim);
```

### Clone and Transform

```javascript
const clone = geometry.clone();
clone.rotateX(Math.PI / 2);
clone.translate(0, 1, 0);
clone.scale(2, 2, 2);
```

### Morph Targets

```javascript
// HULLBREAKER: morph targets animate vertices. On the creature's anatomy that
// is the articulating/assembling motion docs/decisions.md entry 3 rules out -
// "RIG and the camera are what move". Doors, plates, vent covers, shutters,
// traps and Crown mechanisms may move; the body may not. Anything else needs a
// new operator decision recorded in docs/decisions.md before it ships.
// Base geometry
const geometry = new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);

// Create morph target
const morphPositions = geometry.attributes.position.array.slice();
for (let i = 0; i < morphPositions.length; i += 3) {
  morphPositions[i] *= 2; // Scale X
  morphPositions[i + 1] *= 0.5; // Squash Y
}

geometry.morphAttributes.position = [
  new THREE.BufferAttribute(new Float32Array(morphPositions), 3),
];

const mesh = new THREE.Mesh(geometry, material);
mesh.morphTargetInfluences[0] = 0.5; // 50% blend
```

## Performance Tips

1. **Use indexed geometry**: Reuse vertices with indices
2. **Merge static meshes**: Reduce draw calls with `mergeGeometries`
3. **Use InstancedMesh**: For many identical objects
4. **Choose appropriate segment counts**: More segments = smoother but slower
5. **Dispose unused geometry**: `geometry.dispose()`

```javascript
// Good segment counts for common uses
new THREE.SphereGeometry(1, 32, 32); // Good quality
new THREE.SphereGeometry(1, 64, 64); // High quality
new THREE.SphereGeometry(1, 16, 16); // Performance mode
// HULLBREAKER: shots ship at SphereGeometry(radius, 6, 6) and read fine at the
// FAR default (RIG ~3.7% of screen height, docs/decisions.md entry 7). Judge
// segment counts at FAR, not at ?view=near.

// Dispose when done
// HULLBREAKER: dispose per-entity MATERIALS (src/render/hostiles.js:162,168,236,247;
// src/render/capsules.js:50), never the shared geometries - capsuleGeo, tileGeo,
// the limb's single BoxGeometry and the hostile geo table are module-scope and
// live for the process ("shared: never disposed", src/render/capsules.js:13).
geometry.dispose();
```

## See Also

- `threejs-fundamentals` - Scene setup and Object3D
- `threejs-materials` - Material types for meshes
- `threejs-shaders` - Custom vertex manipulation

<!-- HULLBREAKER: those are sibling skills from the same upstream pack; only the
     ones actually installed under .claude/skills/ are available here, and each
     needs the same guardrail treatment before it is trusted. -->
