---
name: threejs-loaders
description: Three.js asset loading - GLTF, textures, images, models, async patterns. Use when loading 3D models, textures, HDR environments, or managing loading progress. In HULLBREAKER nothing under `src/` loads a file at runtime today — this material applies only to `src/render/`, `src/ui/` and `src/main.js`, the offline pipeline in `tools/assets/` is the sanctioned path, and shipping any runtime loader needs an operator decision recorded in `docs/decisions.md` first, because the game must boot with every file under `assets/` missing.
---

## HULLBREAKER guardrails (read before using anything below)

Everything below the `# Three.js Loaders` heading is upstream reference material
written for a bundled app with an asset pipeline. It is accurate about the
three.js API and wrong about this repo's constraints. Read this section first;
it wins on every conflict.

Verified against the tree at install time with `node tools/pathcheck.mjs` and
`node tools/assets/check.mjs`, both green and both required to stay green. Line
numbers drift as lanes merge; the function and symbol names beside them are the
durable anchors.

### 1. Where this material may legitimately live

Only `src/render/*.js`, `src/ui/*.js`, and `src/main.js` may import `three` or
`three/addons/loaders/*`. Never `src/pure/**`, never `src/sim/**`, never
`src/config.js` (it is guarded as part of the pure layer).

Today the count is **zero**. Grep `src/` for `Loader` and you get nothing; the
same is true of `fetch(`, `async `, `await `, and `Promise`. The only file in the
repo that names `three/addons/` is `index.html:50` — the import map itself.
Every module under `src/` evaluates synchronously and `src/main.js:571` starts
the frame loop (`requestAnimationFrame(frame)`) at module-evaluation time.
**A loader would be the first asynchronous path in the game.**

### 2. The rules that constrain it

- **No build step, no runtime dependencies** (root `CLAUDE.md`, "Hard rules").
  `three/addons/` *is* mapped — `index.html:46-51` maps exactly two specifiers,
  `three` → `…/three@0.170.0/build/three.module.js` and `three/addons/` →
  `…/three@0.170.0/examples/jsm/` — so `three/addons/loaders/GLTFLoader.js`
  resolves at runtime with no bundler. Nothing here is *impossible*; it is
  forbidden by rule and by the gate in the next bullet, which is exactly why
  this section has to be explicit. Note that `DRACOLoader` and `KTX2Loader` go
  further and fetch decoder/transcoder **binaries from URLs that are not in the
  import map at all** — that is a new third-party runtime dependency, not just
  an addon module. Never `npm install` for the game; dev-only deps live under
  `tools/*/` (`tools/assets/package.json`, `tools/playtest/package.json`).
- **Asset independence — the game must boot with every file under `assets/`
  missing.** Enforced by `checkGameIndependence()` in `tools/assets/check.mjs`
  (~line 170): it walks every `.js`/`.mjs` under `src/` (`walkJs`, ~line 159)
  and errors on `/^\s*import\s[^\n]*?['"]([^'"]*assets\/[^'"]*)['"]/gm` with
  "static import of … makes an asset a hard dependency — the game must boot with
  every asset file missing (asset-artist standing orders). Load through the
  render/ui layer at runtime with a fallback instead." Today the tree is
  stricter than the rule: the check prints "game independence: src/ contains no
  reference to assets/ at all", and `assets/manifest.json` holds exactly one
  asset (`capsule-letter-h`) whose own notes record "nothing loads it."
- **Layer purity** (`CLAUDE.md`). `tools/pathcheck.mjs:114` defines
  `const banned = /\b(THREE|document|window|renderer|scene|addEventListener|requestAnimationFrame|innerWidth|innerHeight|devicePixelRatio|performance)\b/`
  and `guardLayer()` (`:118`, invoked at `:135` and `:140`) runs it over
  comment-stripped `src/config.js` + `src/pure/*.js` + `src/sim/*.js`, then
  rejects any import crossing a layer, with `process.exit(1)` before any
  assertion runs. A loader, a texture handle, an asset path, or even a
  `texturesReady` boolean must never appear in those files. Sim↔render crossings
  go through `installView`/`installHost` in `src/sim/bridge.js`.
- **Determinism** (`CLAUDE.md`). Load completion order is wall-clock dependent:
  whether a texture arrives on frame 3 or frame 300 depends on the network. So
  **nothing the sim observes may depend on load timing** — not a spawn, not a
  hitbox, not a wave, not telemetry. The sim stays 2D `(s, y)` and seeded from
  `src/pure/rng.js`; `--deterministic` playtests and `?fixeddt=<ms>`
  (`src/main.js:375`) exist to remove exactly this class of variance.
- **`docs/decisions.md` entry 8 — "Delivery mandate: … asset lane opened"**:
  agents may use the **codex CLI** to *generate* sprites/assets. That opened an
  **authoring** lane (`tools/assets/`, `assets/` staging, the `asset-artist`
  role). It did not record a decision that the shipped game loads them. Read
  §4 before assuming otherwise.
- **`docs/decisions.md` entry 7 — FAR is the default view** (RIG ≈ 3.7% of
  screen height). Texture detail dies there, and the number is measured, not
  guessed: `assets/manifest.json`'s one entry records that at FAR a 0.55-tile
  capsule is **~9.6px tall**, "where the rivets and chamfer disappear entirely
  and only the ink letter survives as a smudge." A 1024px albedo for a 10px
  object is wasted memory and a wasted lane.
- **`docs/decisions.md` entry 3 — static-anatomy render rule**: the creature's
  anatomy is monumental and static during turns/transitions; the next stretch is
  *revealed*, never assembled. A loaded GLTF rig driven by `AnimationMixer` and
  pointed at the Meridian's body violates it, and so does swapping a placeholder
  for arriving geometry mid-transition (see the upstream "Progressive loading"
  snippet).
- **Machine gates never judge fun** (`CLAUDE.md`). Any pixel a loaded asset puts
  on screen is a look change, judged by the operator against the concept boards
  (`docs/concept-art/README.md`, boards 10/11/13/14 for environment, 06 for
  enemy form) — never self-declared.

### 3. What actually catches a violation (and what does not)

**Caught statically:**

- A single-line static import of an `assets/` path from anywhere under `src/` —
  `checkGameIndependence()` pushes an error and `node tools/assets/check.mjs`
  exits 1.
- Any `THREE` / `document` / `window` / `scene` / `renderer` / `performance`
  token in `src/config.js`, `src/pure/*.js`, or `src/sim/*.js` — pathcheck
  exits 1 (`tools/pathcheck.mjs:114`).

**NOT caught — be honest about this, do not present the scan as airtight:**

1. **`SPRINT.md` I-014 (line 623, open, severity S3, `bug`)** — a real, filed
   hole in the very gate this section leans on. `checkGameIndependence()` only
   sees an import whose module specifier sits on the **same line** as the
   `import` keyword (`[^\n]*?` never crosses a newline). A specifier pushed onto
   a later line evades the gate completely: on a fixture whose only asset
   reference is that import, `check.mjs` exits **0**, prints PASS, and lists the
   import under "game references to assets/ (**runtime**, not imports)". Confirmed
   pre-existing on `task/T-017 0059363` and `main 59a6501`, documented in
   `tools/assets/README.md` §"Limitation of the import scan, measured" (line
   288). Nothing in `src/` writes that shape today, so the exposure is
   future-shaped — but the gate is evidence, not proof.
2. **Only `src/` is walked.** `index.html` is not scanned by either tool, so a
   `<link>`, an `<img>`, a CSS `url()`, or a third import-map entry added there
   is invisible to both gates.
3. **A path assembled at runtime** (`'assets/' + name + '.png'`, a `fetch` of a
   manifest, a `LoadingManager.setURLModifier` pointing at a CDN) contains no
   `import` keyword and produces at most an informational line.
4. **`tools/pathcheck.mjs` knows nothing about assets.** It contains no mention
   of `assets/`, `index.html`, or the import map. A green pathcheck says exactly
   nothing about asset independence — run `node tools/assets/check.mjs` too.
5. **Boot does not verify arrival.** `?selftest=1` (`src/main.js:464`) checks
   `renderer.info.render.frame > 0` (`:471`) 1.5s in; that passes whether or not
   a texture ever loaded. The bot harness is blunter: no rendered frame within
   8s fails the run as `meta.bootError` (`tools/playtest/README.md:771`, `:868`),
   so a slow or blocked CDN fetch surfaces as a harness failure, not a friendly
   error.

### 4. Runtime asset loading is NOT sanctioned in this repo today

Verified at install time: zero loaders in `src/`; `docs/decisions.md` entries
0a–8 contain no ruling that the shipped game loads a file; `docs/DESIGN.md` never
discusses textures or assets at all (its single "texture" is a metaphor at line
284, "replay texture").

**One honest tension, stated rather than papered over.** The `asset-artist` role
brief that shipped with entry 8 — `.claude/agents/asset-artist.md:27-30` —
describes the *shape* runtime loading would take if it ever happens: "Assets load
at runtime via the render/ui layer only (THREE.TextureLoader / CSS / img). **The
game must still boot and pathcheck must still pass with every asset file
missing** — graceful fallback to the current procedural look, never a hard
dependency. No build step, no new runtime deps." `check.mjs`'s own error text
says the same ("Load through the render/ui layer at runtime with a fallback
instead"). So the pattern is **pre-described, not pre-approved**: an agent brief
and a tool's error string are not operator verdicts, and what a loaded asset
changes — the look at the FAR default — is precisely the class of question
`CLAUDE.md` reserves for the operator. The sibling `threejs-textures` skill
reaches the same conclusion for `TextureLoader`; keep the two consistent.

Therefore, plainly:

- Shipping a loader on the default URL requires an operator decision recorded in
  `docs/decisions.md` **first**. Do not ship it and ask later. Do not treat a
  green pathcheck, a green asset check, a green playtest, another agent's
  approval, or this skill's existence as that decision.
- Until such an entry exists, the ceiling for this material is: a flag resolved
  in `src/mode.js` (follow `IS_G1` / `FLOW_ENABLED`), **default OFF**, shipped
  URLs byte-identical to today, the procedural look untouched and used whenever
  the file is absent or the load fails, and a packet in `SPRINT.md`'s "Operator
  checkpoint queue" (line 308) with an exact URL and 3–5 questions plus
  `?view=far` screenshots judged at real scale.
- Do not route around the rule: no runtime `fetch` of an `assets/` path, no
  data-URI blob of a checked-in binary, no "temporary" default-on, no extra
  import-map entry in `index.html`.
- Lane discipline still applies: work in your assigned worktree, never commit to
  `main`, merge only via `tools/orch/merge-task.sh`.

### 5. The repo already has a sanctioned asset path — extend it, don't reinvent

`tools/assets/` (built by SPRINT **T-015**, status `done`) generates and checks
art **offline**; the shipped game still loads nothing at runtime. Read
`tools/assets/README.md` before touching any of it.

| Want | Use this, not a runtime loader |
| --- | --- |
| Generate a sprite / glyph / icon | `tools/assets/gen.mjs` + `tools/assets/codex/spec-template.md` (`codex exec`, opened by `decisions.md` entry 8) |
| SVG → PNG at an exact pixel size | `node tools/assets/rasterize.mjs <svg> --size <px>` (drives the playtest harness's Chrome) |
| Prove palette + power-of-two compliance | `node tools/assets/check.mjs` — roles are **hue bands**, ≤8, CIELCh chroma-12 neutral floor (`tools/assets/lib/palette.mjs`), recomputed from pixels |
| Judge an asset at the size it will really be | `node tools/assets/view.mjs <png> --tiles <n>` — the measured FAR reference (0.55 tile ≈ 9.6px) came from exactly this |
| Histogram an image's hues | `node tools/assets/probe.mjs <png>` |
| A texture in the shipped game **today** | `THREE.CanvasTexture` drawn procedurally — worked example at `src/render/capsules.js:16-32`, memoized in `letterTexCache`, no file involved |
| Environment / atmosphere / depth cue | `scene.background` + `scene.fog`, both bound to `CONFIG.palette.bg` at `src/render/scene.js:15-16` — not an HDR envmap |
| Anti-aliasing, tone mapping, lighting | already fixed and calibrated: `new THREE.WebGLRenderer({ antialias: true })` (`src/render/scene.js:8`), `ACESFilmicToneMapping` (`:11`), hemisphere + directional rig (`:22-26`). There are **no shadow maps** anywhere in `src/` — `shadowMap`, `castShadow`, `receiveShadow`, and `envMap` appear zero times |
| Stage a generated file | `assets/generated/<category>/` plus a row in `assets/manifest.json`. **Never touch `assets/approved/`** — the operator promotes into it |

### 6. If a loader is ever sanctioned, these are the mechanics

- **Never gate the frame loop on a load.** `src/main.js:571` starts rAF at module
  evaluation and `:385` calls `renderer.render(scene, camera)` every frame. The
  upstream Quick Start's `manager.onLoad = () => startGame()` rewrites that boot
  contract and puts the 8s `bootError` budget on the network's critical path.
- **Swap on arrival over an already-correct procedural look**
  (`material.map = tex; material.needsUpdate = true`). No placeholder pop, no
  layout that depends on a file existing.
- **Callbacks run in render land.** `performance.now()` is legal in
  `src/render/` and `src/main.js` (`src/main.js:379`) and statically banned in
  `src/pure/`/`src/sim/`. Sim-facing time is `gameMs`.
- **Failure is the normal case, not the exception.** Every `onError` path must
  land back on the procedural look, and `?selftest=1` plus a
  `tools/playtest` run must pass with the file deleted. Test that by actually
  deleting it.

---

# Three.js Loaders

## Quick Start

```javascript
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// HULLBREAKER: this exact snippet is what §4 bars — a runtime file load on the
// default path, with no fallback and no decisions.md entry. `scene` is the
// singleton exported by src/render/scene.js; import it, never construct another.
// Load GLTF model
const loader = new GLTFLoader();
loader.load("model.glb", (gltf) => {
  scene.add(gltf.scene);
});

// Load texture
// HULLBREAKER: TextureLoader is the specific API .claude/agents/asset-artist.md
// names — and naming a shape is not an operator verdict (§4). The shipped
// equivalent today is the procedural THREE.CanvasTexture at
// src/render/capsules.js:16-32.
const textureLoader = new THREE.TextureLoader();
const texture = textureLoader.load("texture.jpg");
```

## LoadingManager

Coordinate multiple loaders and track progress.

```javascript
const manager = new THREE.LoadingManager();

// Callbacks
manager.onStart = (url, loaded, total) => {
  console.log(`Started loading: ${url}`);
};

manager.onLoad = () => {
  console.log("All assets loaded!");
  // HULLBREAKER: do NOT adopt this gate. The game has no "start" event — every
  // module under src/ evaluates synchronously and src/main.js:571 begins the
  // frame loop immediately. Deferring the loop until assets arrive puts the
  // playtest harness's 8s bootError budget (tools/playtest/README.md:771) on the
  // network, and makes boot timing observable to anything downstream.
  startGame();
};

manager.onProgress = (url, loaded, total) => {
  const progress = (loaded / total) * 100;
  console.log(`Loading: ${progress.toFixed(1)}%`);
  updateProgressBar(progress);
};

manager.onError = (url) => {
  // HULLBREAKER: this is the branch that matters here. "The game must still
  // boot … with every asset file missing" (.claude/agents/asset-artist.md:28)
  // means onError has to land on the procedural look, not on a console line.
  console.error(`Error loading: ${url}`);
};

// Use manager with loaders
const textureLoader = new THREE.TextureLoader(manager);
const gltfLoader = new GLTFLoader(manager);

// Load assets
textureLoader.load("texture1.jpg");
textureLoader.load("texture2.jpg");
gltfLoader.load("model.glb");
// onLoad fires when ALL are complete
```

## Texture Loading

### TextureLoader

```javascript
const loader = new THREE.TextureLoader();

// Callback style
loader.load(
  "texture.jpg",
  (texture) => {
    // onLoad
    material.map = texture;
    material.needsUpdate = true;
  },
  undefined, // onProgress - not supported for image loading
  (error) => {
    // onError
    console.error("Error loading texture", error);
  },
);

// Synchronous (returns texture, loads async)
const texture = loader.load("texture.jpg");
material.map = texture;
```

### Texture Configuration

```javascript
const texture = loader.load("texture.jpg", (tex) => {
  // Color space (important for color accuracy)
  // API NOTE (three 0.170.0): `Texture.colorSpace` is correct here — the old
  // `.encoding` / `sRGBEncoding` API was removed in r152. The default is
  // THREE.NoColorSpace, so an albedo map MUST set SRGBColorSpace explicitly or
  // it will not match a CONFIG.palette hex used as a material color elsewhere.
  tex.colorSpace = THREE.SRGBColorSpace; // For color/albedo maps
  // tex.colorSpace = THREE.LinearSRGBColorSpace;  // For data maps (normal, roughness)

  // Wrapping
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  // ClampToEdgeWrapping, RepeatWrapping, MirroredRepeatWrapping

  // Repeat/offset
  tex.repeat.set(2, 2);
  tex.offset.set(0.5, 0.5);
  tex.rotation = Math.PI / 4;
  tex.center.set(0.5, 0.5);

  // Filtering
  tex.minFilter = THREE.LinearMipmapLinearFilter; // Default
  tex.magFilter = THREE.LinearFilter; // Default
  // NearestFilter - pixelated
  // LinearFilter - smooth
  // LinearMipmapLinearFilter - smooth with mipmaps

  // Anisotropic filtering (sharper at angles)
  // HULLBREAKER: `renderer` is the singleton from src/render/scene.js:8 —
  // import it. The identifier `renderer` is banned outright in pure/sim by
  // tools/pathcheck.mjs:114, so this line cannot travel down a layer.
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();

  // Flip Y (usually true for standard textures)
  tex.flipY = true;

  tex.needsUpdate = true;
});
```

### CubeTextureLoader

For environment maps and skyboxes.

```javascript
// HULLBREAKER: six more files, and it overwrites judged look state —
// src/render/scene.js:15-16 binds scene.background AND scene.fog to the same
// CONFIG.palette.bg, and that pairing is the depth cue at the FAR default
// (decisions.md entry 7). Replacing the background with a skybox is an
// art-direction change judged against boards 10/11/13/14, not a knob.
const loader = new THREE.CubeTextureLoader();

// Load 6 faces
const cubeTexture = loader.load([
  "px.jpg",
  "nx.jpg", // positive/negative X
  "py.jpg",
  "ny.jpg", // positive/negative Y
  "pz.jpg",
  "nz.jpg", // positive/negative Z
]);

// Use as background
scene.background = cubeTexture;

// Use as environment map
scene.environment = cubeTexture;
material.envMap = cubeTexture;
```

### HDR/EXR Loading

```javascript
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { EXRLoader } from "three/addons/loaders/EXRLoader.js";

// HULLBREAKER: barred twice over. (1) A single .hdr is one of the largest files
// a web build ships, and this game ships zero binary assets — asset
// independence (§2) is the gate. (2) `envMap` appears zero times in src/ and
// the scene is flat-shaded under a fixed hemisphere+sun rig
// (src/render/scene.js:22-26); IBL would only reach the MeshStandardMaterial
// half of the scene (9 Standard vs 9 Basic materials today), so it changes the
// look unevenly. See the sibling threejs-lighting skill: IBL/HDR is unshipped
// and unsanctioned here.

// HDR
const rgbeLoader = new RGBELoader();
rgbeLoader.load("environment.hdr", (texture) => {
  texture.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = texture;
  scene.background = texture;
});

// EXR
const exrLoader = new EXRLoader();
exrLoader.load("environment.exr", (texture) => {
  texture.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = texture;
});
```

### PMREMGenerator

Generate prefiltered environment maps for PBR.

```javascript
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

// HULLBREAKER: `renderer` is the singleton (src/render/scene.js:8) — PMREM
// allocates render targets on it. Same verdict as the HDR block above.
// API NOTE (three 0.170.0): compileEquirectangularShader() still exists and is
// an optional pre-warm; fromEquirectangular() compiles on demand without it.
const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();

new RGBELoader().load("environment.hdr", (texture) => {
  const envMap = pmremGenerator.fromEquirectangular(texture).texture;

  scene.environment = envMap;
  scene.background = envMap;

  texture.dispose();
  pmremGenerator.dispose();
});
```

## GLTF/GLB Loading

The most common 3D format for web.

```javascript
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const loader = new GLTFLoader();

loader.load("model.glb", (gltf) => {
  // The loaded scene
  const model = gltf.scene;
  scene.add(model);

  // Animations
  // HULLBREAKER: AnimationMixer on loaded creature geometry hits decisions.md
  // entry 3 (static-anatomy render rule) — the Meridian's anatomy is monumental
  // and static, revealed rather than assembled; only doors, access plates, vent
  // covers, shutters, traps and Crown mechanisms may move. Nothing in src/ uses
  // AnimationMixer today. See the sibling threejs-animation skill.
  const animations = gltf.animations;
  if (animations.length > 0) {
    const mixer = new THREE.AnimationMixer(model);
    animations.forEach((clip) => {
      mixer.clipAction(clip).play();
    });
  }

  // Cameras (if any)
  // HULLBREAKER: never adopt a camera from a file. There is exactly one camera
  // (src/render/scene.js) and its pose is frozen by decisions.md entry 7 (FAR
  // default, RIG ≈ 3.7% of screen height) with assertions in tools/pathcheck.mjs.
  const cameras = gltf.cameras;

  // Asset info
  console.log(gltf.asset); // Version, generator, etc.

  // User data from Blender/etc
  // API NOTE (three 0.170.0): `gltf.userData` carries loader-level extras
  // (e.g. gltfExtensions); per-node authoring data lands on each object's own
  // `object.userData` after traversal, not here.
  console.log(gltf.userData);
});
```

### GLTF with Draco Compression

```javascript
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

// HULLBREAKER: setDecoderPath points at a **third-party CDN that is not in the
// import map** (index.html:46-51 maps only `three` and `three/addons/`), and
// the decoder is a wasm/js binary fetched at boot. That is a new runtime
// dependency — squarely against CLAUDE.md's "No build step, no runtime
// dependencies", and an extra fetch inside the harness's 8s bootError budget.
// If this ever ships, pin the decoder to the same build as the import map
// (https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/), never
// a floating version.
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath(
  "https://www.gstatic.com/draco/versioned/decoders/1.5.6/",
);
dracoLoader.preload();

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

gltfLoader.load("compressed-model.glb", (gltf) => {
  scene.add(gltf.scene);
});
```

### GLTF with KTX2 Textures

```javascript
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";

// API CORRECTION: upstream pinned the basis transcoder to three@0.160.0 while
// this repo's import map pins three **0.170.0** (index.html:49-50). A
// transcoder from a different build is a real mismatch risk — the path below is
// corrected to 0.170.0. Same runtime-dependency objection as DRACO above: the
// basis binaries exist in neither this repo nor the import map.
const ktx2Loader = new KTX2Loader();
ktx2Loader.setTranscoderPath(
  "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/basis/",
);
// HULLBREAKER: `renderer` is the singleton from src/render/scene.js:8.
ktx2Loader.detectSupport(renderer);

const gltfLoader = new GLTFLoader();
gltfLoader.setKTX2Loader(ktx2Loader);

gltfLoader.load("model-with-ktx2.glb", (gltf) => {
  scene.add(gltf.scene);
});
```

### Process GLTF Content

```javascript
loader.load("model.glb", (gltf) => {
  const model = gltf.scene;

  // Enable shadows
  // HULLBREAKER: no-op here today — `shadowMap`, `castShadow` and
  // `receiveShadow` appear zero times in src/, and renderer.shadowMap is never
  // enabled (src/render/scene.js:8-12). Turning shadow maps on is a separate
  // unsanctioned look-and-perf change; see the sibling threejs-lighting skill.
  model.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  // Find specific mesh
  const head = model.getObjectByName("Head");

  // Adjust materials
  // HULLBREAKER: envMapIntensity does nothing without scene.environment, which
  // this project does not set (see the HDR block above).
  model.traverse((child) => {
    if (child.isMesh && child.material) {
      child.material.envMapIntensity = 0.5;
    }
  });

  // Center and scale
  // HULLBREAKER: normalizing to a unit box discards real-world scale, and scale
  // is load-bearing here — concept board 13's human-scale grammar plus entry 7's
  // RIG ≈ 3.7% of screen height. Place against the existing tile/ribbon units
  // (src/render/tower.js's placeOnTower), not against a normalized bounding box.
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  model.position.sub(center);
  const maxDim = Math.max(size.x, size.y, size.z);
  model.scale.setScalar(1 / maxDim);

  scene.add(model);
});
```

## Other Model Formats

<!-- HULLBREAKER: every loader in this section is under the same §4 bar as GLTF —
     they are file loads on the shipped path. Two extra notes: the geometry in
     src/ is built procedurally today (BoxGeometry/lathe/instanced pools, e.g.
     src/render/capsules.js:13), and the sim never sees any of it; and OBJ/MTL,
     FBX, STL and PLY are all substantially larger on the wire than glTF, so if
     a decision ever opens this door, glTF/GLB is the format to argue for. -->

### OBJ + MTL

```javascript
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";

const mtlLoader = new MTLLoader();
mtlLoader.load("model.mtl", (materials) => {
  materials.preload();

  const objLoader = new OBJLoader();
  objLoader.setMaterials(materials);
  objLoader.load("model.obj", (object) => {
    scene.add(object);
  });
});
```

### FBX

```javascript
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";

const loader = new FBXLoader();
loader.load("model.fbx", (object) => {
  // FBX often has large scale
  object.scale.setScalar(0.01);

  // Animations
  // HULLBREAKER: same entry-3 constraint as the GLTF animation block above.
  const mixer = new THREE.AnimationMixer(object);
  object.animations.forEach((clip) => {
    mixer.clipAction(clip).play();
  });

  scene.add(object);
});
```

### STL

```javascript
import { STLLoader } from "three/addons/loaders/STLLoader.js";

const loader = new STLLoader();
loader.load("model.stl", (geometry) => {
  // HULLBREAKER: raw hex literals are not authored ad hoc here — colors come
  // from CONFIG.palette (src/config.js) today, and from src/render/palette.js
  // once SPRINT T-010 merges. DESIGN caps the palette at ≤8 roles.
  const material = new THREE.MeshStandardMaterial({ color: 0x888888 });
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
});
```

### PLY

```javascript
import { PLYLoader } from "three/addons/loaders/PLYLoader.js";

const loader = new PLYLoader();
loader.load("model.ply", (geometry) => {
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
});
```

## Async/Promise Loading

### Promisified Loader

```javascript
// HULLBREAKER: promises are fine in render land and poison in sim land. `await`
// appears zero times under src/ today. Whatever resolves here must not be
// something the sim reads — load order is wall-clock dependent, and
// --deterministic playtests plus ?fixeddt=<ms> (src/main.js:375) exist to keep
// wall-clock out of outcomes.
function loadModel(url) {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

// Usage
async function init() {
  try {
    const gltf = await loadModel("model.glb");
    scene.add(gltf.scene);
  } catch (error) {
    // HULLBREAKER: a caught-and-logged failure is not a fallback. The catch
    // branch must leave the procedural look in place and the run playable.
    console.error("Failed to load model:", error);
  }
}
```

### Load Multiple Assets

```javascript
async function loadAssets() {
  const [modelGltf, envTexture, colorTexture] = await Promise.all([
    loadGLTF("model.glb"),
    loadRGBE("environment.hdr"),
    loadTexture("color.jpg"),
  ]);

  scene.add(modelGltf.scene);
  scene.environment = envTexture;
  material.map = colorTexture;
}

// Helper functions
function loadGLTF(url) {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(url, resolve, undefined, reject);
  });
}

function loadRGBE(url) {
  return new Promise((resolve, reject) => {
    new RGBELoader().load(
      url,
      (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        resolve(texture);
      },
      undefined,
      reject,
    );
  });
}

function loadTexture(url) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(url, resolve, undefined, reject);
  });
}
```

<!-- HULLBREAKER: Promise.all is all-or-nothing — one missing file rejects the
     whole batch. That is the opposite of the required posture ("the game must
     still boot with every asset file missing"). Promise.allSettled, per-asset
     fallback, and a look that is already correct before any of them resolve. -->

## Caching

### Built-in Cache

```javascript
// HULLBREAKER: THREE.Cache is global mutable state shared by every loader —
// flipping it on from one render module changes behavior for all of them.
// The shipped precedent for memoization is local and explicit: `letterTexCache`
// in src/render/capsules.js:14, keyed by `text + '|' + bg`.
// Enable cache
THREE.Cache.enabled = true;

// Clear cache
THREE.Cache.clear();

// Manual cache management
THREE.Cache.add("key", data);
THREE.Cache.get("key");
THREE.Cache.remove("key");
```

### Custom Asset Manager

```javascript
// HULLBREAKER: do not build this before there is a decisions.md entry — a
// general asset manager is infrastructure for a capability the project has not
// agreed to have (§4). Note also the disposal asymmetry this repo already
// relies on: src/render/capsules.js disposes per-capsule materials but
// deliberately never disposes cached textures, because other live capsules
// share them. A dispose() like the one below, pointed at shared caches, tears
// textures out from under live meshes.
class AssetManager {
  constructor() {
    this.textures = new Map();
    this.models = new Map();
    this.gltfLoader = new GLTFLoader();
    this.textureLoader = new THREE.TextureLoader();
  }

  async loadTexture(key, url) {
    if (this.textures.has(key)) {
      return this.textures.get(key);
    }

    const texture = await new Promise((resolve, reject) => {
      this.textureLoader.load(url, resolve, undefined, reject);
    });

    this.textures.set(key, texture);
    return texture;
  }

  async loadModel(key, url) {
    if (this.models.has(key)) {
      return this.models.get(key).clone();
    }

    const gltf = await new Promise((resolve, reject) => {
      this.gltfLoader.load(url, resolve, undefined, reject);
    });

    this.models.set(key, gltf.scene);
    return gltf.scene.clone();
  }

  dispose() {
    this.textures.forEach((t) => t.dispose());
    this.textures.clear();
    this.models.clear();
  }
}

// Usage
const assets = new AssetManager();
const texture = await assets.loadTexture("brick", "brick.jpg");
const model = await assets.loadModel("tree", "tree.glb");
```

## Loading from Different Sources

### Data URL / Base64

```javascript
// HULLBREAKER: read this one carefully. A data URI does NOT break asset
// independence (there is no file to be missing) and it is invisible to
// checkGameIndependence() by construction — which makes it the obvious way to
// route around §4, and therefore explicitly out of bounds as one. It still
// changes shipped pixels (an operator feel question), still bloats a source
// module with a binary blob that diffs badly, and still bypasses the palette
// and power-of-two gates in tools/assets/check.mjs that a staged file would
// face. If the pixels are worth having, take them through tools/assets/ and a
// decision, not through a base64 string.
const loader = new THREE.TextureLoader();
const texture = loader.load("data:image/png;base64,iVBORw0KGgo...");
```

### Blob URL

```javascript
async function loadFromBlob(blob) {
  const url = URL.createObjectURL(blob);
  const texture = await loadTexture(url);
  URL.revokeObjectURL(url);
  return texture;
}
```

### ArrayBuffer

```javascript
// HULLBREAKER: `fetch(` appears zero times in src/ today. A fetch of an
// `assets/` path is a runtime reference that checkGameIndependence() reports at
// most as an informational line (§3) — the gate will not stop you, the rule
// still does.
// From fetch
const response = await fetch("model.glb");
const buffer = await response.arrayBuffer();

// Parse with loader
const loader = new GLTFLoader();
loader.parse(buffer, "", (gltf) => {
  scene.add(gltf.scene);
});
```

### Custom Path/URL

```javascript
// Set base path
loader.setPath("assets/models/");
loader.load("model.glb"); // Loads from assets/models/model.glb

// Set resource path (for textures referenced in model)
loader.setResourcePath("assets/textures/");

// Custom URL modifier
// HULLBREAKER: pointing the game at an external CDN adds a third-party runtime
// dependency and a boot-time network hop inside the 8s bootError budget. The
// only remote host this project accepts today is the jsDelivr entry in
// index.html's import map for three.js itself. Also note: a path built by
// string concatenation like this is exactly the shape neither gate can see.
manager.setURLModifier((url) => {
  return `https://cdn.example.com/${url}`;
});
```

## Error Handling

<!-- HULLBREAKER: this is the most useful section in the file for this repo —
     "graceful fallback to the current procedural look, never a hard dependency"
     (.claude/agents/asset-artist.md:29) is an error-handling requirement. Two
     amendments: the fallback must be the *procedural* look, not a second file;
     and setTimeout/AbortController are render-side only. -->

```javascript
// Graceful fallback
async function loadWithFallback(primaryUrl, fallbackUrl) {
  try {
    return await loadModel(primaryUrl);
  } catch (error) {
    console.warn(`Primary failed, trying fallback: ${error}`);
    return await loadModel(fallbackUrl);
  }
}

// Retry logic
async function loadWithRetry(url, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await loadModel(url);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

// Timeout
async function loadWithTimeout(url, timeout = 30000) {
  // HULLBREAKER: 30s is longer than the harness's whole boot budget (8s,
  // tools/playtest/README.md:771). Whatever number you pick, the game must be
  // playable during and after the wait — never blocked on it.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Loading timed out");
    }
    throw error;
  }
}
```

## Performance Tips

1. **Use compressed formats**: DRACO for geometry, KTX2/Basis for textures
2. **Load progressively**: Show placeholders while loading
3. **Lazy load**: Only load what's needed
4. **Use CDN**: Faster asset delivery
5. **Enable cache**: `THREE.Cache.enabled = true`

<!-- HULLBREAKER, per item:
     1. DRACO/KTX2 both pull decoder binaries that are in neither this repo nor
        index.html's import map — new runtime dependencies (CLAUDE.md hard rule).
     2. "Placeholder" here is backwards: the procedural look IS the shipped
        product, and an asset would be the enhancement — see the snippet below.
     3. Lazy loading mid-run means new work landing on an arbitrary frame during
        combat; the 60fps target with 200+ projectiles (docs/DESIGN.md) is the
        budget it lands in, and a hitch is a pillar-1 ("Momentum is sacred")
        problem, not just a metric.
     4. A third-party CDN is a runtime dependency and a boot-time network hop
        inside the harness's 8s bootError budget.
     5. THREE.Cache is global mutable state — see the Caching section. -->

```javascript
// Progressive loading with placeholder
// HULLBREAKER: swapping a placeholder for arriving geometry is exactly the
// read decisions.md entry 3 forbids for the creature — anatomy is *revealed*,
// never assembled, and geometry popping in mid-transition reads as assembly.
// Inverted for this repo: keep the procedural mesh, and let a loaded asset
// replace only its material/texture, on a frame where nothing is transitioning.
const placeholder = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshBasicMaterial({ wireframe: true }),
);
scene.add(placeholder);

loadModel("model.glb").then((gltf) => {
  scene.remove(placeholder);
  scene.add(gltf.scene);
});
```

## See Also

<!-- HULLBREAKER: all three siblings are installed under .claude/skills/ in this
     repo. threejs-textures is the closest neighbour and reaches the same
     conclusion about loaders — read its guardrails alongside these. -->

- `threejs-textures` - Texture configuration
- `threejs-animation` - Playing loaded animations
- `threejs-materials` - Material from loaded models
