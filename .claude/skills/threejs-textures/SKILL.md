---
name: threejs-textures
description: Three.js textures - texture types, UV mapping, environment maps, texture settings. Use when working with images, UV coordinates, cubemaps, HDR environments, or texture optimization. In HULLBREAKER this applies only to src/render/, src/ui/ and src/main.js, where canvas/data/procedural textures and render targets are the sanctioned path and external image, HDR, video or compressed-texture files are not.
---

## HULLBREAKER guardrails (read before using anything below)

This upstream reference assumes a bundled app that loads image files off disk.
This repo is neither. Verified against the tree at install time — re-verify with
`node tools/pathcheck.mjs` and `node tools/assets/check.mjs`, both green at
install time and both required to stay green. Line numbers and assertion counts
below drift as lanes merge; the function and symbol names next to them are the
durable anchors.

**Where texture code may live.** Only `src/render/*.js`, `src/ui/*.js`, and
`src/main.js`. Never `src/pure/` or `src/sim/`. This is statically enforced:
`tools/pathcheck.mjs` (the `guardLayer` block, ~lines 95-138) strips comments
from `src/config.js`, every `src/pure/*.js` and every `src/sim/*.js`, then
matches `/\b(THREE|document|window|renderer|scene|addEventListener|requestAnimationFrame|innerWidth|innerHeight|devicePixelRatio|performance)\b/`
and calls `process.exit(1)` on a hit. Note the identifiers `scene` and
`renderer` are banned outright — not just `THREE` — so a "harmless" helper
parameter named `scene` in a sim file fails the gate. It also rejects any
import that crosses layers upward.

**Texture code that reacts to game state crosses through the bridge.** The
sim never hands a renderer object to anything; render modules register view
hooks via `installView` from `src/sim/bridge.js`. `src/render/capsules.js:62`
is the worked example (`installView({ capsules: { spawned, removed, sync } })`).

**Canvas textures: already solved here — extend, don't reinvent.**
`src/render/capsules.js:16-32` is a working `CanvasTexture` factory:
`document.createElement('canvas')` at 64px, 2D draw, `new THREE.CanvasTexture(cv)`,
memoized in `letterTexCache` keyed by `text + '|' + bg`. Its disposal contract
is deliberate and asymmetric: the shared `BoxGeometry` is "shared: never
disposed" (line 13), per-capsule materials are disposed in `removed()`
(lines 45-51), and the cached textures are intentionally never disposed
because other live capsules share them. Copying the upstream `disposeMaterial()`
helper (see "Dispose Textures") verbatim would dispose those shared cached
textures out from under every other capsule. Do not.

**External image / HDR / video / compressed-texture files are NOT sanctioned.**
The shipped game loads zero binary assets and boots with everything under
`assets/` deleted. `tools/assets/check.mjs` enforces exactly this in
`checkGameIndependence()` (~line 170): it walks every `.js`/`.mjs` under `src/`
and errors on `/^\s*import\s[^\n]*?['"]([^'"]*assets\/[^'"]*)['"]/`, with the
message "the game must boot with every asset file missing (asset-artist
standing orders). Load through the render/ui layer at runtime with a fallback
instead." Today the tree is stricter than the rule — the check reports
"src/ contains no reference to assets/ at all", and `assets/manifest.json`
holds exactly one asset (`capsule-letter-h`) whose own notes record "nothing
loads it." So `TextureLoader`, `CubeTextureLoader`, `RGBELoader`, `EXRLoader`,
`KTX2Loader`, `VideoTexture` and file-backed texture atlases all change what
the product *is*. **That needs an operator decision recorded in
`docs/decisions.md` before you write the loader, not after.** Do not route
around it with a runtime `fetch`, a data-URI blob of a checked-in binary, or a
"temporary" flag. `docs/decisions.md` entry 8 opened an *authoring* lane
(codex-generated sprites under `tools/assets/`); it did not make the game load
them.

Two more hard rules bite here: **no build step and no runtime dependencies**
(root `CLAUDE.md`) — `KTX2Loader.setTranscoderPath()` wants basis transcoder
binaries that do not exist in this repo and are not in the import map.

**Sanctioned without a new decision:** `CanvasTexture`, `DataTexture`,
procedural/generated textures, `WebGLRenderTarget` / depth / MSAA targets,
`WebGLCubeRenderTarget` + `CubeCamera`, UV manipulation, texture settings on
any of the above.

**Import specifiers.** `index.html` (lines 46-53) maps exactly two:
`three` and `three/addons/`, both to three.js **0.170.0** on jsDelivr.
`three/examples/jsm/...` — what upstream writes — does **not** resolve. Every
addon import in the body below has been corrected to `three/addons/...`.

**Randomness.** Root `CLAUDE.md`: randomness only via seeded `src/pure/rng.js`
(`mulberry32`). In `src/pure/` and `src/sim/` the identifier `performance` is
statically banned by the guard above; `Math.random` and `Date.now` are rule-
enforced, not regex-enforced, so review is the gate. Render-layer code may use
`performance.now()` (it already does — `let last = performance.now()` in
`src/main.js`, and `advanceDeparting()` in `src/render/bullets.js`), but a
procedural noise texture seeded from
`Math.random()` makes playtest screenshots irreproducible — `tools/playtest`'s
`--deterministic` mode exists to remove exactly that variance. Seed from
`mulberry32`.

**Colors in texture-drawing code.** Today the palette is `CONFIG.palette`
(`src/config.js:482`, commented "grey-box: neutral + readability hints") and
`docs/DESIGN.md` caps it at ≤8 colors. A palette pass in lane **T-010** is
in flight and unmerged at install time; it adds `src/render/palette.js` and a
pathcheck assertion that forbids raw `0xRRGGBB`, CSS `#hex`, and `rgb()/rgba()`
literals in a tokenized file list that **includes `capsules.js`** — the very
file that draws canvas textures — with `0xffffff` (the identity base color of
tint-colored materials) as the only exemption. That regex matches CSS strings,
so `g.fillStyle = '#14181e'` and `gradient.addColorStop(0, '#...')` are exactly
what it catches. Before writing any color into a canvas or DataTexture: check
whether `src/render/palette.js` exists, and pull tokens from it if it does.

**If you generate an image through the dev pipeline** (`tools/assets/`, opened
by `docs/decisions.md` entry 8), the asset gate is real and specific:
`tools/assets/lib/palette.mjs` defines roles as **hue bands**, ≤8 roles, with a
CIELCh chroma-12 neutral floor; `tools/assets/check.mjs` recomputes compliance
from pixels and fails on any off-palette hue. Power-of-two dimensions are a
**repo rule**, not just the upstream performance tip below: anything not marked
`"gpu": false` in `assets/manifest.json` must be power-of-two. Read
`tools/assets/README.md` first.

**Detail dies at the shipped view scale.** `docs/decisions.md` entry 7 made FAR
the default view (RIG ≈ 3.7% of screen height, per concept board 13). The one
manifest entry records the measured consequence: a 0.55-tile capsule is
**~9.6px tall** at FAR, "where the rivets and chamfer disappear entirely and
only the ink letter survives as a smudge." Before believing a texture works,
look at it at real size: `node tools/assets/view.mjs <png> --tiles <n>`.
A 2048px albedo for something 10px tall is wasted memory and a wasted lane.

**Static-anatomy rule** (`docs/decisions.md` entry 3): the creature's anatomy is
monumental and static during turns and transitions — it is *revealed*, never
assembled. Texture and UV animation is surface shading, not geometry, so it is
not banned — but do not use scrolling UVs, render-target tricks, or
`CubeCamera` reflection updates to make the anatomy read as articulating or
snapping into place during a transition. Only doors, access plates, vent
covers, shutters, traps, and Crown mechanisms may move.

**Background and environment are a judged look, not a knob.**
`src/render/scene.js:15-16` binds `scene.background` and `scene.fog` to the same
`CONFIG.palette.bg`; that pairing is the depth cue at the FAR default, and
`renderer.toneMapping = THREE.ACESFilmicToneMapping` (line 11) already shapes how
any new texture reads. The scene runs 9 `MeshBasicMaterial` and 9
`MeshStandardMaterial` instances, so `scene.environment` would only reach the
Standard half. Any of this changes pixels, and **machine gates never judge
fun** — an unjudged look ships behind a query flag declared in `src/mode.js`
(off by default), with a packet in `SPRINT.md`'s "Operator checkpoint queue"
(line 308): exact URL plus 3-5 questions. Never self-declare it good.

**One live subtlety, flagged not fixed:** in three.js 0.170 `Texture.colorSpace`
defaults to `NoColorSpace`, and `src/render/capsules.js` does not set it on its
`CanvasTexture`. So the canvas background does not match the same
`CONFIG.palette` hex used as a material color elsewhere (three.js color
management converts the latter). Setting `tex.colorSpace = THREE.SRGBColorSpace`
is arguably correct — and it changes shipped pixels, so it is an operator feel
question, not a drive-by fix.

---

# Three.js Textures

## Quick Start

```javascript
import * as THREE from "three";

// Load texture
// HULLBREAKER: file-backed loading is NOT sanctioned — see guardrails.
// Needs an operator decision in docs/decisions.md first.
const loader = new THREE.TextureLoader();
const texture = loader.load("texture.jpg");

// Apply to material
const material = new THREE.MeshStandardMaterial({
  map: texture,
});
```

## Texture Loading

### Basic Loading

```javascript
// HULLBREAKER: this whole section is reference-only. tools/assets/check.mjs
// fails any static import of an assets/ path, and the game must boot with
// every asset file missing.
const loader = new THREE.TextureLoader();

// Async with callbacks
loader.load(
  "texture.jpg",
  (texture) => console.log("Loaded"),
  (progress) => console.log("Progress"),
  (error) => console.error("Error"),
);

// Synchronous style (loads async internally)
const texture = loader.load("texture.jpg");
material.map = texture;
```

### Promise Wrapper

```javascript
function loadTexture(url) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(url, resolve, undefined, reject);
  });
}

// Usage
const [colorMap, normalMap, roughnessMap] = await Promise.all([
  loadTexture("color.jpg"),
  loadTexture("normal.jpg"),
  loadTexture("roughness.jpg"),
]);
```

## Texture Configuration

### Color Space

Critical for accurate color reproduction.

```javascript
// Color/albedo textures - use sRGB
colorTexture.colorSpace = THREE.SRGBColorSpace;

// Data textures (normal, roughness, metalness, AO) - leave as default
// Do NOT set colorSpace for data textures (NoColorSpace is default)

// HULLBREAKER: src/render/capsules.js's CanvasTexture leaves this unset today.
// Changing it changes shipped pixels -> operator checkpoint, not a fix.
```

### Wrapping Modes

```javascript
texture.wrapS = THREE.RepeatWrapping; // Horizontal
texture.wrapT = THREE.RepeatWrapping; // Vertical

// Options:
// THREE.ClampToEdgeWrapping - Stretches edge pixels (default)
// THREE.RepeatWrapping - Tiles the texture
// THREE.MirroredRepeatWrapping - Tiles with mirror flip
```

### Repeat, Offset, Rotation

```javascript
// Tile texture 4x4
texture.repeat.set(4, 4);
texture.wrapS = THREE.RepeatWrapping;
texture.wrapT = THREE.RepeatWrapping;

// Offset (0-1 range)
texture.offset.set(0.5, 0.5);

// HULLBREAKER: animating .offset per frame is surface shading and is allowed,
// but must not make the creature's anatomy read as assembling or articulating
// during a transition (decisions.md entry 3, static-anatomy render rule).

// Rotation (radians, around center)
texture.rotation = Math.PI / 4;
texture.center.set(0.5, 0.5); // Rotation pivot
```

### Filtering

```javascript
// Minification (texture larger than screen pixels)
texture.minFilter = THREE.LinearMipmapLinearFilter; // Default, smooth
texture.minFilter = THREE.NearestFilter; // Pixelated
texture.minFilter = THREE.LinearFilter; // Smooth, no mipmaps

// Magnification (texture smaller than screen pixels)
texture.magFilter = THREE.LinearFilter; // Smooth (default)
texture.magFilter = THREE.NearestFilter; // Pixelated (retro games)

// Anisotropic filtering (sharper at angles)
texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
```

### Generate Mipmaps

```javascript
// Usually true by default
texture.generateMipmaps = true;

// Disable for non-power-of-2 textures or data textures
texture.generateMipmaps = false;
texture.minFilter = THREE.LinearFilter;
```

## Texture Types

### Regular Texture

```javascript
const texture = new THREE.Texture(image);
texture.needsUpdate = true;
```

### Data Texture

Create texture from raw data.

```javascript
// HULLBREAKER: sanctioned — no file, no dependency. Render/ui layer only.
// Create gradient texture
const size = 256;
const data = new Uint8Array(size * size * 4);

for (let i = 0; i < size; i++) {
  for (let j = 0; j < size; j++) {
    const index = (i * size + j) * 4;
    data[index] = i; // R
    data[index + 1] = j; // G
    data[index + 2] = 128; // B
    data[index + 3] = 255; // A
  }
}

const texture = new THREE.DataTexture(data, size, size);
texture.needsUpdate = true;
```

### Canvas Texture

```javascript
// HULLBREAKER: sanctioned, and already implemented — src/render/capsules.js:16
// (letterTexture) caches one CanvasTexture per key and never disposes them
// because meshes share them. Extend that helper rather than adding a second
// uncached one. document.* is render/ui only (pathcheck guardLayer).
const canvas = document.createElement("canvas");
canvas.width = 256;
canvas.height = 256;
const ctx = canvas.getContext("2d");

// Draw on canvas
// HULLBREAKER: once lane T-010's palette pass lands, raw CSS color literals in
// tokenized render files (capsules.js included) fail pathcheck. Pull the color
// from src/render/palette.js / CONFIG.palette instead of writing "red".
ctx.fillStyle = "red";
ctx.fillRect(0, 0, 256, 256);
ctx.fillStyle = "white";
ctx.font = "48px Arial";
ctx.fillText("Hello", 50, 150);

const texture = new THREE.CanvasTexture(canvas);

// Update when canvas changes
texture.needsUpdate = true;
```

### Video Texture

```javascript
// HULLBREAKER: NOT sanctioned — a video file is a shipped binary asset the
// game would hard-depend on. Operator decision in docs/decisions.md first.
const video = document.createElement("video");
video.src = "video.mp4";
video.loop = true;
video.muted = true;
video.play();

const texture = new THREE.VideoTexture(video);
texture.colorSpace = THREE.SRGBColorSpace;

// No need to set needsUpdate - auto-updates
```

### Compressed Textures

```javascript
// HULLBREAKER: corrected import — index.html maps "three/addons/", not
// "three/examples/jsm/". Still NOT usable here: setTranscoderPath() needs
// basis transcoder binaries that this repo does not ship, and "no build step,
// no runtime dependencies" is a hard rule.
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";

const ktx2Loader = new KTX2Loader();
ktx2Loader.setTranscoderPath("path/to/basis/");
ktx2Loader.detectSupport(renderer);

ktx2Loader.load("texture.ktx2", (texture) => {
  material.map = texture;
});
```

## Cube Textures

For environment maps and skyboxes.

### CubeTextureLoader

```javascript
// HULLBREAKER: six image files — not sanctioned. Also note scene.js:15-16 pairs
// scene.background with scene.fog on the same CONFIG.palette.bg; replacing the
// background breaks that depth cue at the FAR default view (decisions.md 7).
const loader = new THREE.CubeTextureLoader();
const cubeTexture = loader.load([
  "px.jpg",
  "nx.jpg", // +X, -X
  "py.jpg",
  "ny.jpg", // +Y, -Y
  "pz.jpg",
  "nz.jpg", // +Z, -Z
]);

// As background
scene.background = cubeTexture;

// As environment map
scene.environment = cubeTexture;
material.envMap = cubeTexture;
```

### Equirectangular to Cubemap

```javascript
// HULLBREAKER: corrected import path (three/addons/). File-backed HDR is not
// sanctioned; PMREMGenerator fed from a render target is.
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader(); // optional warm-up, not required

new RGBELoader().load("environment.hdr", (texture) => {
  const envMap = pmremGenerator.fromEquirectangular(texture).texture;
  scene.environment = envMap;
  scene.background = envMap;

  texture.dispose();
  pmremGenerator.dispose();
});
```

## HDR Textures

### RGBELoader

```javascript
// HULLBREAKER: corrected import path. .hdr file = unsanctioned binary asset.
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

const loader = new RGBELoader();
loader.load("environment.hdr", (texture) => {
  texture.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = texture;
  scene.background = texture;
});
```

### EXRLoader

```javascript
// HULLBREAKER: corrected import path. .exr file = unsanctioned binary asset.
import { EXRLoader } from "three/addons/loaders/EXRLoader.js";

const loader = new EXRLoader();
loader.load("environment.exr", (texture) => {
  texture.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = texture;
});
```

### Background Options

```javascript
scene.background = texture;
scene.backgroundBlurriness = 0.5; // 0-1, blur background
scene.backgroundIntensity = 1.0; // Brightness
scene.backgroundRotation.y = Math.PI; // Rotate background

// HULLBREAKER: all four are visible look changes -> query flag in src/mode.js,
// off by default, plus a SPRINT.md operator checkpoint packet.
```

## Render Targets

Render to texture for effects.

```javascript
// HULLBREAKER: sanctioned — no files, no dependencies. Render layer only.
// Create render target
const renderTarget = new THREE.WebGLRenderTarget(512, 512, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  format: THREE.RGBAFormat,
});

// Render scene to target
renderer.setRenderTarget(renderTarget);
renderer.render(scene, camera);
renderer.setRenderTarget(null); // Back to screen

// Use as texture
material.map = renderTarget.texture;
```

### Depth Texture

```javascript
const renderTarget = new THREE.WebGLRenderTarget(512, 512);
renderTarget.depthTexture = new THREE.DepthTexture(
  512,
  512,
  THREE.UnsignedShortType,
);

// Access depth
const depthTexture = renderTarget.depthTexture;
```

### Multi-Sample Render Target

```javascript
const renderTarget = new THREE.WebGLRenderTarget(512, 512, {
  samples: 4, // MSAA
});
```

## CubeCamera

Dynamic environment maps for reflections.

```javascript
// HULLBREAKER: sanctioned mechanically (no assets), but per-frame cube updates
// are six extra scene renders — measure before shipping, and the reflection
// must not make static anatomy read as moving (decisions.md entry 3).
const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256, {
  generateMipmaps: true,
  minFilter: THREE.LinearMipmapLinearFilter,
});

const cubeCamera = new THREE.CubeCamera(0.1, 1000, cubeRenderTarget);
scene.add(cubeCamera);

// Apply to reflective material
reflectiveMaterial.envMap = cubeRenderTarget.texture;

// Update in animation loop (expensive!)
function animate() {
  // Hide reflective object, update env map, show again
  reflectiveObject.visible = false;
  cubeCamera.position.copy(reflectiveObject.position);
  cubeCamera.update(renderer, scene);
  reflectiveObject.visible = true;
}
```

## UV Mapping

### Accessing UVs

```javascript
const uvs = geometry.attributes.uv;

// Read UV
const u = uvs.getX(vertexIndex);
const v = uvs.getY(vertexIndex);

// Modify UV
uvs.setXY(vertexIndex, newU, newV);
uvs.needsUpdate = true;
```

### Second UV Channel (for AO maps)

```javascript
// CORRECTED for three.js 0.170: the second UV set was renamed uv2 -> uv1 in
// r151, and aoMap now reads channel 0 (attribute "uv") by default. Upstream's
// geometry.setAttribute("uv2", ...) is pre-r151 and does nothing here.

// If aoMap should share the primary UVs, do nothing — that is the default.

// To put aoMap on a dedicated second set:
aoTexture.channel = 1; // 0 -> "uv", 1 -> "uv1", 2 -> "uv2"
geometry.setAttribute("uv1", geometry.attributes.uv);

// Or create custom second UV
const uv1 = new Float32Array(vertexCount * 2);
// ... fill uv1 data
geometry.setAttribute("uv1", new THREE.BufferAttribute(uv1, 2));
```

### UV Transform in Shader

```javascript
const material = new THREE.ShaderMaterial({
  uniforms: {
    map: { value: texture },
    uvOffset: { value: new THREE.Vector2(0, 0) },
    uvScale: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: `
    varying vec2 vUv;
    uniform vec2 uvOffset;
    uniform vec2 uvScale;

    void main() {
      vUv = uv * uvScale + uvOffset;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec2 vUv;
    uniform sampler2D map;

    void main() {
      gl_FragColor = texture2D(map, vUv);
    }
  `,
});
```

## Texture Atlas

Multiple images in one texture.

```javascript
// HULLBREAKER: a file-backed atlas is not sanctioned. The same offset/repeat
// trick over a CanvasTexture or DataTexture you generate at runtime is.
// Atlas with 4 sprites (2x2 grid)
const atlas = loader.load("atlas.png");
atlas.wrapS = THREE.ClampToEdgeWrapping;
atlas.wrapT = THREE.ClampToEdgeWrapping;

// Select sprite by UV offset/scale
function selectSprite(row, col, gridSize = 2) {
  atlas.offset.set(col / gridSize, 1 - (row + 1) / gridSize);
  atlas.repeat.set(1 / gridSize, 1 / gridSize);
}

// Select top-left sprite
selectSprite(0, 0);
```

## Material Texture Maps

### PBR Texture Set

```javascript
// HULLBREAKER: a full PBR set means seven image files. Not sanctioned without
// an operator decision. The scene runs 9 MeshBasicMaterial + 9
// MeshStandardMaterial; only the Standard half responds to PBR maps.
const material = new THREE.MeshStandardMaterial({
  // Base color (sRGB)
  map: colorTexture,

  // Surface detail (Linear)
  normalMap: normalTexture,
  normalScale: new THREE.Vector2(1, 1),

  // Roughness (Linear, grayscale)
  roughnessMap: roughnessTexture,
  roughness: 1, // Multiplier

  // Metalness (Linear, grayscale)
  metalnessMap: metalnessTexture,
  metalness: 1, // Multiplier

  // Ambient occlusion (Linear, uses uv1 in 0.170 when channel = 1)
  aoMap: aoTexture,
  aoMapIntensity: 1,

  // Self-illumination (sRGB)
  emissiveMap: emissiveTexture,
  // HULLBREAKER: 0xffffff is the ONE color literal T-010's pathcheck guard
  // exempts (identity base). Any other 0xRRGGBB here must be a palette token.
  emissive: 0xffffff,
  emissiveIntensity: 1,

  // Vertex displacement (Linear)
  displacementMap: displacementTexture,
  displacementScale: 0.1,
  displacementBias: 0,

  // Alpha (Linear)
  alphaMap: alphaTexture,
  transparent: true,
});

// CORRECTED for 0.170: see "Second UV Channel" above — aoMap defaults to the
// primary "uv" set now; only set a second set if you actually want one.
aoTexture.channel = 1;
geometry.setAttribute("uv1", geometry.attributes.uv);
```

### Normal Map Types

```javascript
// OpenGL style normals (default)
material.normalMapType = THREE.TangentSpaceNormalMap;

// Object space normals
material.normalMapType = THREE.ObjectSpaceNormalMap;
```

## Procedural Textures

### Noise Texture

```javascript
function generateNoiseTexture(size = 256) {
  const data = new Uint8Array(size * size * 4);

  for (let i = 0; i < size * size; i++) {
    // HULLBREAKER: Math.random breaks the determinism rule (root CLAUDE.md:
    // "randomness only via seeded src/pure/rng.js") and makes playtest
    // screenshots irreproducible under tools/playtest --deterministic.
    // Use: import { mulberry32 } from '../pure/rng.js'; const rnd = mulberry32(seed);
    const value = Math.random() * 255;
    data[i * 4] = value;
    data[i * 4 + 1] = value;
    data[i * 4 + 2] = value;
    data[i * 4 + 3] = 255;
  }

  const texture = new THREE.DataTexture(data, size, size);
  texture.needsUpdate = true;
  return texture;
}
```

### Gradient Texture

```javascript
function generateGradientTexture(color1, color2, size = 256) {
  // HULLBREAKER: sanctioned. Pass palette tokens in as color1/color2 rather
  // than hardcoding hex strings — T-010's guard matches CSS literals too.
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, size, 0);
  gradient.addColorStop(0, color1);
  gradient.addColorStop(1, color2);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, 1);

  return new THREE.CanvasTexture(canvas);
}
```

## Texture Memory Management

### Dispose Textures

```javascript
// Single texture
texture.dispose();

// Material textures
// HULLBREAKER: do NOT apply this helper to capsule materials. Their map comes
// from the shared letterTexCache in src/render/capsules.js:14 and is reused by
// every other capsule with the same letter; src/render/capsules.js:45-51
// disposes the material only, and the shared geometry is never disposed at all
// (line 13). Dispose what you own, not what you borrowed from a cache.
function disposeMaterial(material) {
  const maps = [
    "map",
    "normalMap",
    "roughnessMap",
    "metalnessMap",
    "aoMap",
    "emissiveMap",
    "displacementMap",
    "alphaMap",
    "envMap",
    "lightMap",
    "bumpMap",
    "specularMap",
  ];

  maps.forEach((mapName) => {
    if (material[mapName]) {
      material[mapName].dispose();
    }
  });

  material.dispose();
}
```

### Texture Pooling

```javascript
// HULLBREAKER: url-keyed pooling presumes file loading — not sanctioned. The
// key-keyed cache pattern (letterTexCache) is the shipped equivalent for
// generated textures.
class TexturePool {
  constructor() {
    this.textures = new Map();
    this.loader = new THREE.TextureLoader();
  }

  async get(url) {
    if (this.textures.has(url)) {
      return this.textures.get(url);
    }

    const texture = await new Promise((resolve, reject) => {
      this.loader.load(url, resolve, undefined, reject);
    });

    this.textures.set(url, texture);
    return texture;
  }

  dispose(url) {
    const texture = this.textures.get(url);
    if (texture) {
      texture.dispose();
      this.textures.delete(url);
    }
  }

  disposeAll() {
    this.textures.forEach((t) => t.dispose());
    this.textures.clear();
  }
}
```

## Performance Tips

1. **Use power-of-2 dimensions**: 256, 512, 1024, 2048
   — HULLBREAKER: this is a *rule* here, not advice. `tools/assets/check.mjs`
   fails any manifest entry not marked `"gpu": false` whose PNG/SVG dimensions
   are not power-of-two.
2. **Compress textures**: KTX2/Basis for web delivery — not available here (no
   transcoder binaries, no build step).
3. **Use texture atlases**: Reduce texture switches
4. **Enable mipmaps**: For distant objects — relevant at the FAR default view.
5. **Limit texture size**: 2048 usually sufficient for web — and at FAR a
   0.55-tile prop is ~9.6px tall (`assets/manifest.json`), so 2048 is almost
   always far too much. Check with `node tools/assets/view.mjs`.
6. **Reuse textures**: Same texture = better batching

```javascript
// Check texture memory
console.log(renderer.info.memory.textures);

// Optimize for mobile
const maxSize = renderer.capabilities.maxTextureSize;
const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
const textureSize = isMobile ? 1024 : 2048;
```

## See Also

- `threejs-materials` - Applying textures to materials
- `threejs-loaders` - Loading texture files
- `threejs-shaders` - Custom texture sampling

### HULLBREAKER references

- `src/render/capsules.js` — the shipped CanvasTexture + cache + dispose pattern
- `src/render/scene.js` — renderer, tone mapping, background/fog pairing
- `src/sim/bridge.js` — the only sim-to-render crossing (`installView`)
- `tools/pathcheck.mjs` — layer purity guard (`guardLayer`) + the assertion suite
- `tools/assets/check.mjs` + `tools/assets/README.md` — palette, power-of-two,
  and the game-independence rule
- `tools/assets/view.mjs` — look at an asset at its real on-screen size
- `docs/decisions.md` — entries 3 (static anatomy), 7 (FAR default), 8 (asset
  lane). Verdicts are law; propose a new decision rather than re-litigating one.
