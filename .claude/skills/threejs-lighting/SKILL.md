---
name: threejs-lighting
description: Three.js lighting - light types, shadows, environment lighting. Use when adding lights, configuring shadows, setting up IBL, or optimizing lighting performance. In HULLBREAKER this is reference material for the one fixed hemisphere+sun rig in src/render/scene.js only — shadow maps, IBL/HDR environments, RectAreaLight, light probes, and any tone-mapping change are unshipped here and need a recorded operator decision before they go in.
---

## HULLBREAKER guardrails (read before using anything below)

This repo already has a lighting answer. It is small, calibrated, and load-bearing.
Read this section as law; read the upstream body as a reference manual you may
consult, not a menu of upgrades.

### 1. There is exactly one light rig, in one file

`src/render/scene.js` (26 lines) owns the renderer, scene, camera, fog, and the
whole rig:

- `renderer.toneMapping = THREE.ACESFilmicToneMapping` (line 11)
- `new THREE.HemisphereLight(0xcfd8e3, 0x3a3f46, 1.1)` (line 22)
- `new THREE.DirectionalLight(0xffffff, 1.6)` at `(6, 12, 8)` (lines 24-25)

Nothing else in the tree creates a light. If a change to lighting is sanctioned,
it happens here — never a per-feature light added inside `src/render/level.js`,
`src/render/hostiles.js`, `src/render/transform.js`, or `src/render/player.js`.

**Files that may touch THREE at all:** `src/render/*.js`, `src/ui/*.js`,
`src/main.js`. That is the complete list.

### 2. Layer purity — the guard that will fail you

`tools/pathcheck.mjs` line 107 defines:

```js
const banned = /\b(THREE|document|window|renderer|scene|addEventListener|requestAnimationFrame|innerWidth|innerHeight|devicePixelRatio|performance)\b/;
```

`guardLayer()` (lines 111-138) applies it to `src/config.js`, every file in
`src/pure/`, and every file in `src/sim/`, and additionally rejects imports that
cross a layer. So: no light object, no `scene` import, and no lighting constant
that lives in a sim module. If gameplay must know about a visual state, it
crosses through `src/sim/bridge.js` hooks in the render→sim direction only.
`node tools/pathcheck.mjs` exits 1 on the first violation — it is the fast check
and it is not optional.

### 3. The light values are calibrated against the palette — do not nudge them

`src/render/limb.js` lines 32-39 record the calibration in the code:

> Values are chosen against what the renderer actually PRODUCES, not against the
> hex codes: with this light rig plus ACES tone mapping a lit face lands at
> roughly 0.45x its albedo, while scene.background/fog is drawn raw. The deck
> (palette.ground, ~0.48x) has to stay the brightest large surface…

Every authored color in `src/render/` was picked *through* that 0.45x factor.
Changing `hemi.intensity`, `sun.intensity`, `sun.position`, or `toneMapping`
silently re-ranks the value ladder in `limb.js`, `level.js`, `transform.js`, and
`hostiles.js` at once — the deck can stop being the brightest large surface and
the limb goes to mud. Treat those five numbers like the frozen `CONFIG` movement
constants: a retune is intentional, reasoned in writing, and operator-judged.

### 4. Colors are palette tokens, not literals

Today the token table is `CONFIG.palette` in `src/config.js` (line 482).
`src/render/palette.js` does **not** exist on `main` at the time this skill was
installed — it arrives with task T-010 (branch `task/T-010`, status `review` in
`SPRINT.md` line 177), which centralizes render color and adds a pathcheck guard
that rejects raw `0xRRGGBB`, CSS `#hex`, and `rgb()/rgba()` literals in the
tokenized render files (`scene.js` included; `0xffffff` as an instance/tint
identity base is the one exception) and asserts scene background and fog are
built from the same `PAL.bg` token. The hemisphere sky/ground literals quoted
above are pre-token; once T-010 lands, any light color you touch must come from
the palette module, not a hex you liked.

### 5. Shadow maps are NOT sanctioned — this is the big one

`renderer.shadowMap.enabled` appears nowhere in this repo. No light sets
`castShadow`; no mesh sets `receiveShadow`. That is a decision, not an oversight:

- **Perf.** The delivery target is "60fps with 200+ projectiles" (`SPRINT.md`
  line 19; `docs/DESIGN.md` line 556). Almost everything on screen is an
  `InstancedMesh` — level tiles (`src/render/level.js` line 100), the limb bake
  (`src/render/limb.js` line 98, 200+ pieces), bullets and their depart puffs
  (`src/render/bullets.js`), transform vapor (`src/render/transform.js`). A
  shadow-casting light redraws all of them into a depth pass every frame.
- **Style/scale.** FAR is the default view by operator verdict
  (`docs/decisions.md` entry 7 — "far feels right", RIG ≈ 3.7% of screen height;
  `src/mode.js` line 78 resolves any unknown `?view=` to `'far'`). The visible
  band runs out to `CONFIG.fog = { near: 30, far: 74 }` (`src/config.js` line
  13), so one directional shadow would need a frustum spanning the whole visible
  stretch — the exact case where shadow maps get expensive and blocky at once.

**Enabling shadows requires an operator decision recorded in
`docs/decisions.md` first.** Not a screenshot that looks better to you: a
recorded verdict. `CLAUDE.md`: "Machine gates never judge fun… the operator is
the only fun oracle." Post the packet to `SPRINT.md`'s "Operator checkpoint
queue" (line 308) with an exact URL and 3-5 questions, keep the prototype behind
a query flag that is off by default, and keep working on something else.

The same "needs a recorded decision first" bar applies to: IBL / HDR
environment maps (also a new runtime network fetch, and the game has **no build
step and no runtime dependencies**), `RectAreaLight`, light probes,
per-enemy or muzzle-flash point lights, and any change to `toneMapping` /
`toneMappingExposure`.

### 6. Lighting may not fake motion in the anatomy

`docs/decisions.md` entry 3 (CP3 verdict) is law: the creature's anatomy is
**monumental and static** during turns and transitions — RIG and the camera
move, the next stretch pre-exists and is *revealed*, never assembled. pathcheck
enforces the geometry half of that:

- lines 4077-4084: `src/pure/limb.js` may take no time or randomness argument
  ("a body that cannot be animated cannot assemble (CP3 ruling)"), and
  `src/render/limb.js` "installs no view hook at all".
- lines 2065-2069: `src/render/transform.js` may not reference
  `bandSlamOffset`/`zipperOffset` and may not grow a `debris` system.

No grep catches a swinging sun or a pulsing rim light raking across the limb —
and that is precisely the read the operator rejected. Do not use light animation
to make the body appear to move. Only doors, access plates, vent covers,
shutters, traps, and Crown mechanisms move at all.

### 7. Imports: `three/addons/`, never `three/examples/jsm/`

three.js 0.170.0 comes from the CDN import map in `index.html` lines 46-53,
which maps exactly two specifiers: `"three"` and `"three/addons/"`. Every
`three/examples/jsm/...` import in the upstream body below **will fail to
resolve in this repo** — rewrite as `three/addons/...`. There is no bundler, no
`package.json` for the game, and no `npm install` (dev-only deps are allowed
under `tools/*/` with their own manifest, e.g. `tools/playtest/`, and nowhere
else).

### 8. Determinism: don't animate lights off the wall clock

`src/main.js` line 380 drives the frame; `?fixeddt=<ms>` (lines 365-376) exists
so a harness run advances by a constant dt, and `tools/playtest/README.md`
documents `--deterministic` runs whose screenshots gate merges. A light animated
from a free-running `THREE.Clock` makes those screenshots non-reproducible.
Render-side time is allowed, but drive it from the `dt`/gameMs the frame already
carries, and never from `Math.random` (seeded `src/pure/rng.js` only, and that
lives in the pure layer anyway).

### 9. The repo already solved most of what this skill teaches — extend that

| You want… | Use what already ships |
| --- | --- |
| Directional shading / face separation | Per-facet tone multipliers: `limbFacetTone()` in `src/pure/limb.js`, applied in `src/render/limb.js` lines 107-111, plus `flatShading: true` on the `MeshStandardMaterial`s. Zero extra lights, zero draw calls. |
| Value hierarchy ("what reads brightest") | The authored ladder in `src/render/limb.js` `BASE_COLORS` and `CONFIG.palette` — authored through the 0.45x factor above. |
| Glow / emissive-looking things | `MeshBasicMaterial` + opacity, the shipped idiom: `src/render/bullets.js` line 18, the polyp beam in `src/render/hostiles.js` line 142, the vapor in `src/render/transform.js` line 309. These materials ignore lights entirely, which is the point. |
| Depth cueing, "far reads as haze" | `THREE.Fog` in `src/render/scene.js` line 16 from `CONFIG.fog`, tightened per band by `CONFIG.transform.…fog` (`src/config.js` line 357). |
| Contact/grounding cues | Not solved yet, and not a shadow-map problem by default — bring a proposal, not a `shadowMap.enabled = true`. |

### 10. Process, every time

Anything that changes how the game looks: behind a query flag, off by default;
`node tools/pathcheck.mjs` green; a named playtest script still completes;
screenshots judged against concept boards 13/14 and the invariants in
`docs/concept-art/README.md`; a checkpoint packet queued for the operator; and
never a self-declared "this looks better". Work in your assigned worktree on a
`task/<id>` branch — only the integrator merges, via
`tools/orch/merge-task.sh`.

---

*Everything below is the upstream `cloudai-x/threejs-skills` reference, kept
verbatim except for inline `HULLBREAKER:` annotations and corrections against
three.js 0.170.0 (marked `r170:`). Where an example violates a rule above, the
example is left intact and annotated — read the annotation before copying.*

# Three.js Lighting

## Quick Start

```javascript
import * as THREE from "three";

// Basic lighting setup
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 5, 5);
scene.add(directionalLight);
// HULLBREAKER: this rig already exists once, in src/render/scene.js
// (hemisphere + sun, ACES tone mapping). Do not add a second one, and do not
// add lights from feature modules. Raw 0x literals are also on their way out
// (guardrail 4).
```

## Light Types Overview

| Light            | Description            | Shadow Support | Cost     |
| ---------------- | ---------------------- | -------------- | -------- |
| AmbientLight     | Uniform everywhere     | No             | Very Low |
| HemisphereLight  | Sky/ground gradient    | No             | Very Low |
| DirectionalLight | Parallel rays (sun)    | Yes            | Low      |
| PointLight       | Omnidirectional (bulb) | Yes            | Medium   |
| SpotLight        | Cone-shaped            | Yes            | Medium   |
| RectAreaLight    | Area light (window)    | No\*           | High     |

\*RectAreaLight shadows require custom solutions

> HULLBREAKER: only the two very-low-cost rows ship (HemisphereLight +
> DirectionalLight, neither casting). The "Shadow Support: Yes" column is a
> three.js capability statement, not permission — see guardrail 5.
> Note also that `MeshBasicMaterial` (bullets, beams, vapor, capsule letters,
> mod rings) ignores *all* lights, so a new light only affects the
> `MeshStandardMaterial` surfaces.

## AmbientLight

Illuminates all objects equally. No direction, no shadows.

```javascript
// AmbientLight(color, intensity)
const ambient = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambient);

// Modify at runtime
ambient.color.set(0xffffcc);
ambient.intensity = 0.3;
```

> HULLBREAKER: an ambient fill would flatten the facet-tone read that
> `limbFacetTone()` depends on and lift the whole value ladder off its 0.45x
> calibration (guardrail 3). Not shipped; needs a recorded decision.

## HemisphereLight

Gradient from sky to ground color. Good for outdoor scenes.

```javascript
// HemisphereLight(skyColor, groundColor, intensity)
const hemi = new THREE.HemisphereLight(0x87ceeb, 0x8b4513, 0.6);
hemi.position.set(0, 50, 0);
scene.add(hemi);

// Properties
hemi.color; // Sky color
hemi.groundColor; // Ground color
hemi.intensity;
```

> HULLBREAKER: this is the shipped fill — `src/render/scene.js` line 22 uses
> `(0xcfd8e3, 0x3a3f46, 1.1)`. Those three values are calibrated; read
> guardrail 3 before changing any of them.

## DirectionalLight

Parallel light rays. Simulates distant light source (sun).

```javascript
// DirectionalLight(color, intensity)
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(5, 10, 5);

// Light points at target (default: 0, 0, 0)
dirLight.target.position.set(0, 0, 0);
scene.add(dirLight.target);

scene.add(dirLight);
```

> HULLBREAKER: shipped as `(0xffffff, 1.6)` at `(6, 12, 8)` with the default
> target — `src/render/scene.js` lines 24-26. Note the sun does **not** follow
> the camera: the world scrolls under a fixed key direction, which is part of
> why the anatomy reads as static (guardrail 6).

### DirectionalLight Shadows

```javascript
// HULLBREAKER: NOT SANCTIONED. Nothing below runs in this repo without an
// operator decision recorded in docs/decisions.md (guardrail 5) — perf against
// the 60fps/200-projectile target and a style change at the FAR default view.
dirLight.castShadow = true;

// Shadow map size (higher = sharper, more expensive)
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;

// Shadow camera (orthographic)
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 50;
dirLight.shadow.camera.left = -10;
dirLight.shadow.camera.right = 10;
dirLight.shadow.camera.top = 10;
dirLight.shadow.camera.bottom = -10;
// HULLBREAKER: a ±10 unit frustum covers ~20 tiles; the visible band runs to
// CONFIG.fog.far = 74 at the FAR default. Sizing this honestly is the whole
// cost argument.

// Shadow softness
dirLight.shadow.radius = 4; // Blur radius (PCFSoftShadowMap only)
// r170 CORRECTION: backwards. `shadow.radius` has NO effect when
// renderer.shadowMap.type is PCFSoftShadowMap — it applies to PCFShadowMap and
// VSMShadowMap (VSM also honours `shadow.blurSamples`). With PCFSoftShadowMap
// you soften by lowering mapSize, not by raising radius.

// Shadow bias (fixes shadow acne)
dirLight.shadow.bias = -0.0001;
dirLight.shadow.normalBias = 0.02;

// Helper to visualize shadow camera
const helper = new THREE.CameraHelper(dirLight.shadow.camera);
scene.add(helper);
```

## PointLight

Emits light in all directions from a point. Like a light bulb.

```javascript
// PointLight(color, intensity, distance, decay)
const pointLight = new THREE.PointLight(0xffffff, 1, 100, 2);
pointLight.position.set(0, 5, 0);
scene.add(pointLight);

// Properties
pointLight.distance; // Maximum range (0 = infinite)
pointLight.decay; // Light falloff (physically correct = 2)
```

> r170 CORRECTION: since r155 lights use physical units by default and
> `WebGLRenderer.useLegacyLights` was removed in r165 — for PointLight and
> SpotLight `intensity` is candela and `decay` defaults to 2, so this
> `intensity: 1` bulb is essentially invisible a few units away. Expect values
> in the tens-to-hundreds for a bulb that reads at gameplay distances, and
> re-check anything copied from a pre-r155 tutorial.
>
> HULLBREAKER: per-light-source effects (muzzle flash, enemy glow, capsule
> beacons) are done with `MeshBasicMaterial` geometry today — see guardrail 9.
> Adding real point lights is a perf and style change: recorded decision first.

### PointLight Shadows

```javascript
// HULLBREAKER: NOT SANCTIONED (guardrail 5) — and a point light's shadow is a
// six-face cube render, the most expensive shadow in the list.
pointLight.castShadow = true;
pointLight.shadow.mapSize.width = 1024;
pointLight.shadow.mapSize.height = 1024;

// Shadow camera (perspective - 6 directions for cube map)
pointLight.shadow.camera.near = 0.5;
pointLight.shadow.camera.far = 50;

pointLight.shadow.bias = -0.005;
```

## SpotLight

Cone-shaped light. Like a flashlight or stage light.

```javascript
// SpotLight(color, intensity, distance, angle, penumbra, decay)
const spotLight = new THREE.SpotLight(0xffffff, 1, 100, Math.PI / 6, 0.5, 2);
spotLight.position.set(0, 10, 0);

// Target (light points at this)
spotLight.target.position.set(0, 0, 0);
scene.add(spotLight.target);

scene.add(spotLight);

// Properties
spotLight.angle; // Cone angle (radians, max Math.PI/2)
spotLight.penumbra; // Soft edge (0-1)
spotLight.distance; // Range
spotLight.decay; // Falloff

// r170: same physical-units note as PointLight — intensity is candela with
// decay 2. r170 SpotLight also supports `map` (projected texture) and
// `iesMap` via addons.
// HULLBREAKER: a moving searchlight raking the hull is exactly the "anatomy
// appears to move / assemble" read decisions.md entry 3 rules against when it
// is the body being animated (guardrail 6). Ship-built hardware (traps,
// emplacements) is the sanctioned home for that kind of activity — and it
// still needs a decision plus a flag.
```

### SpotLight Shadows

```javascript
// HULLBREAKER: NOT SANCTIONED (guardrail 5).
spotLight.castShadow = true;
spotLight.shadow.mapSize.width = 1024;
spotLight.shadow.mapSize.height = 1024;

// Shadow camera (perspective)
spotLight.shadow.camera.near = 0.5;
spotLight.shadow.camera.far = 50;
spotLight.shadow.camera.fov = 30;

spotLight.shadow.bias = -0.0001;

// Focus (affects shadow projection)
spotLight.shadow.focus = 1;
```

## RectAreaLight

Rectangular area light. Great for soft, realistic lighting.

```javascript
import { RectAreaLightHelper } from "three/examples/jsm/helpers/RectAreaLightHelper.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
// HULLBREAKER: these specifiers do not resolve here — the import map only maps
// "three" and "three/addons/". Use:
//   import { RectAreaLightHelper } from "three/addons/helpers/RectAreaLightHelper.js";
//   import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
// (Same rewrite applies to every three/examples/jsm import below.)

// Must initialize uniforms first
RectAreaLightUniformsLib.init();

// RectAreaLight(color, intensity, width, height)
const rectLight = new THREE.RectAreaLight(0xffffff, 5, 4, 2);
rectLight.position.set(0, 5, 0);
rectLight.lookAt(0, 0, 0);
scene.add(rectLight);

// Helper
const helper = new RectAreaLightHelper(rectLight);
rectLight.add(helper);

// Note: Only works with MeshStandardMaterial and MeshPhysicalMaterial
// Does not cast shadows natively
// HULLBREAKER: NOT SANCTIONED — pulls in an addon (a second CDN module fetch),
// costs the most of any light type, and the flat-shaded low-poly direction in
// docs/DESIGN.md is not asking for soft area light. Recorded decision first.
```

## Shadow Setup

### Enable Shadows

```javascript
// HULLBREAKER: this entire block is the thing guardrail 5 forbids without a
// recorded operator decision. `renderer.shadowMap.enabled` appears nowhere in
// src/ today. If you are here because a screenshot looked flat, the answer is a
// checkpoint packet in SPRINT.md, not this line.

// 1. Enable on renderer
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Shadow map types:
// THREE.BasicShadowMap - fastest, low quality
// THREE.PCFShadowMap - default, filtered
// THREE.PCFSoftShadowMap - softer edges
// THREE.VSMShadowMap - variance shadow map

// 2. Enable on light
light.castShadow = true;

// 3. Enable on objects
mesh.castShadow = true;
mesh.receiveShadow = true;
// HULLBREAKER: "objects" here means the InstancedMeshes in level.js (all tiles),
// limb.js (200+ baked pieces), bullets.js and transform.js — the flags are per
// InstancedMesh, so there is no cheap "just the player casts" version without
// splitting meshes or using light layers (see Performance Tips).

// Ground plane
floor.receiveShadow = true;
floor.castShadow = false; // Usually false for floors
```

### Optimizing Shadows

```javascript
// Tight shadow camera frustum
const d = 10;
dirLight.shadow.camera.left = -d;
dirLight.shadow.camera.right = d;
dirLight.shadow.camera.top = d;
dirLight.shadow.camera.bottom = -d;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 30;

// Fix shadow acne
dirLight.shadow.bias = -0.0001; // Depth bias
dirLight.shadow.normalBias = 0.02; // Bias along normal

// Shadow map size (balance quality vs performance)
// 512 - low quality
// 1024 - medium quality
// 2048 - high quality
// 4096 - very high quality (expensive)
```

> HULLBREAKER: a "tight frustum" that follows the camera means updating the
> shadow camera every frame from render state. That is fine layer-wise (render
> may read camera state) but must never feed back into the sim —
> `src/sim/bridge.js` is the only crossing, and it runs render←sim, not the
> reverse.

### Contact Shadows (Fake, Fast)

```javascript
import { ContactShadows } from "three/examples/jsm/objects/ContactShadows.js";

const contactShadows = new ContactShadows({
  resolution: 512,
  blur: 2,
  opacity: 0.5,
  scale: 10,
  position: [0, 0, 0],
});
scene.add(contactShadows);
```

> r170 CORRECTION: **this module does not exist in three.js.** There is no
> `examples/jsm/objects/ContactShadows.js` in 0.170.0 (or any release) —
> `ContactShadows` is a `@react-three/drei` component. The vanilla equivalent is
> hand-rolled: render casters from below into a `WebGLRenderTarget` with a depth
> material, blur it, and map it onto a ground plane; or, far cheaper, a soft
> blob texture on a plane under the character.
>
> HULLBREAKER: a blob/decal grounding cue is the only shadow-shaped idea in this
> section that is even plausible at the FAR default (RIG is ~3.7% of screen
> height — see decisions.md entry 7), and it is still an unjudged visual change:
> flag-gated prototype plus a checkpoint packet.

## Light Helpers

```javascript
import { RectAreaLightHelper } from "three/examples/jsm/helpers/RectAreaLightHelper.js";
// HULLBREAKER: → "three/addons/helpers/RectAreaLightHelper.js".

// DirectionalLight helper
const dirHelper = new THREE.DirectionalLightHelper(dirLight, 5);
scene.add(dirHelper);

// PointLight helper
const pointHelper = new THREE.PointLightHelper(pointLight, 1);
scene.add(pointHelper);

// SpotLight helper
const spotHelper = new THREE.SpotLightHelper(spotLight);
scene.add(spotHelper);

// Hemisphere helper
const hemiHelper = new THREE.HemisphereLightHelper(hemiLight, 5);
scene.add(hemiHelper);

// RectAreaLight helper
const rectHelper = new RectAreaLightHelper(rectLight);
rectLight.add(rectHelper);

// Update helpers when light changes
dirHelper.update();
spotHelper.update();
```

> HULLBREAKER: helpers are debug geometry in the shipped scene. If you add one,
> it goes behind a query flag, off by default (`CLAUDE.md`, "Prototypes ship
> behind query flags"), and it must not appear in gate screenshots.

## Environment Lighting (IBL)

Image-Based Lighting using HDR environment maps.

```javascript
// HULLBREAKER: NOT SANCTIONED. An HDR is a runtime asset fetch — the game has
// no build step, no runtime dependencies, and no loader path for .hdr today
// (assets/ staging exists per decisions.md entry 8, but that is sprites, not an
// environment pipeline). It would also override the calibrated 0.45x albedo
// response every render module was authored against (guardrail 3). Recorded
// operator decision first.
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
// → "three/addons/loaders/RGBELoader.js" in this repo.

const rgbeLoader = new RGBELoader();
rgbeLoader.load("environment.hdr", (texture) => {
  texture.mapping = THREE.EquirectangularReflectionMapping;

  // Set as scene environment (affects all PBR materials)
  scene.environment = texture;

  // Optional: also use as background
  scene.background = texture;
  scene.backgroundBlurriness = 0; // 0-1, blur the background
  scene.backgroundIntensity = 1;
  // r170 also has scene.environmentIntensity, scene.environmentRotation and
  // scene.backgroundRotation if you need to trim/orient IBL separately.
  // HULLBREAKER: scene.background is currently a flat CONFIG.palette.bg color
  // matched to the fog (src/render/scene.js lines 15-16) — "fog matched to
  // background" is stated art direction in docs/DESIGN.md. Replacing it with an
  // environment image breaks that match.
});

// PMREMGenerator for better reflections
const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();
// r170: still present, and optional — fromEquirectangular() compiles on demand.
// Call it only to front-load the shader compile away from a gameplay frame.

rgbeLoader.load("environment.hdr", (texture) => {
  const envMap = pmremGenerator.fromEquirectangular(texture).texture;
  scene.environment = envMap;
  texture.dispose();
  pmremGenerator.dispose();
});
```

### Cube Texture Environment

```javascript
const cubeLoader = new THREE.CubeTextureLoader();
const envMap = cubeLoader.load([
  "px.jpg",
  "nx.jpg",
  "py.jpg",
  "ny.jpg",
  "pz.jpg",
  "nz.jpg",
]);

scene.environment = envMap;
scene.background = envMap;
```

> HULLBREAKER: same ruling as the HDR path — six more runtime fetches, and it
> overwrites the palette-matched background/fog pair.

## Light Probes (Advanced)

Capture lighting from a point in space for ambient lighting.

```javascript
import { LightProbeGenerator } from "three/examples/jsm/lights/LightProbeGenerator.js";
// → "three/addons/lights/LightProbeGenerator.js" in this repo.
// r170: verify the return shape against the pinned 0.170.0 build before relying
// on it — this helper's signature has moved across releases (sync vs Promise).

// Generate from cube texture
const lightProbe = new THREE.LightProbe();
scene.add(lightProbe);

lightProbe.copy(LightProbeGenerator.fromCubeTexture(cubeTexture));

// Or from render target
const cubeCamera = new THREE.CubeCamera(
  0.1,
  100,
  new THREE.WebGLCubeRenderTarget(256),
);
cubeCamera.update(renderer, scene);
lightProbe.copy(
  LightProbeGenerator.fromCubeRenderTarget(renderer, cubeCamera.renderTarget),
);
```

> HULLBREAKER: NOT SANCTIONED, and a `CubeCamera.update()` is six extra scene
> renders — straight against the 60fps target. Recorded decision first.

## Common Lighting Setups

### Three-Point Lighting

```javascript
// Key light (main light)
const keyLight = new THREE.DirectionalLight(0xffffff, 1);
keyLight.position.set(5, 5, 5);
scene.add(keyLight);

// Fill light (softer, opposite side)
const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
fillLight.position.set(-5, 3, 5);
scene.add(fillLight);

// Back light (rim lighting)
const backLight = new THREE.DirectionalLight(0xffffff, 0.3);
backLight.position.set(0, 5, -5);
scene.add(backLight);

// Ambient fill
const ambient = new THREE.AmbientLight(0x404040, 0.3);
scene.add(ambient);
```

> HULLBREAKER: four lights instead of two, each adding shader cost on every
> MeshStandardMaterial in the scene, and each re-ranking the value ladder that
> `src/render/limb.js` and `CONFIG.palette` were authored against. If rim light
> is the goal, the cheaper repo-native lever is the per-facet tone table
> (`limbFacetTone()` in `src/pure/limb.js`) — it already separates faces with no
> lights at all.

### Outdoor Daylight

```javascript
// Sun
const sun = new THREE.DirectionalLight(0xffffcc, 1.5);
sun.position.set(50, 100, 50);
sun.castShadow = true; // HULLBREAKER: not here — guardrail 5.
scene.add(sun);

// Sky ambient
const hemi = new THREE.HemisphereLight(0x87ceeb, 0x8b4513, 0.6);
scene.add(hemi);
```

> HULLBREAKER: minus the `castShadow` line, this *is* the shipped shape —
> hemisphere + sun. The repo's version is already tuned (1.1 / 1.6, cool sky,
> cool-dark ground); treat this block as confirmation, not as a patch to apply.

### Indoor Studio

```javascript
// Multiple area lights
RectAreaLightUniformsLib.init();

const light1 = new THREE.RectAreaLight(0xffffff, 5, 2, 2);
light1.position.set(3, 3, 3);
light1.lookAt(0, 0, 0);
scene.add(light1);

const light2 = new THREE.RectAreaLight(0xffffff, 3, 2, 2);
light2.position.set(-3, 3, 3);
light2.lookAt(0, 0, 0);
scene.add(light2);

// Ambient fill
const ambient = new THREE.AmbientLight(0x404040, 0.2);
scene.add(ambient);
```

> HULLBREAKER: not applicable — the interior bands (`?slice=transform`) get
> their mood from per-band fog and background (`CONFIG.transform.…fog`,
> `src/config.js` line 357), not from a relit room. Keep it that way unless the
> operator says otherwise.

## Light Animation

```javascript
const clock = new THREE.Clock();

function animate() {
  const time = clock.getElapsedTime();

  // Orbit light around scene
  light.position.x = Math.cos(time) * 5;
  light.position.z = Math.sin(time) * 5;

  // Pulsing intensity
  light.intensity = 1 + Math.sin(time * 2) * 0.5;

  // Color cycling
  light.color.setHSL((time * 0.1) % 1, 1, 0.5);

  // Update helpers if using
  lightHelper.update();
}
```

> HULLBREAKER: two rules land on this block at once.
> (1) **Determinism/harness** — a free-running `THREE.Clock` diverges between
> runs, so `--deterministic` playtest screenshots stop comparing (guardrail 8).
> Drive from the frame's own `dt`/gameMs instead; `?fixeddt=` exists precisely
> so a run reproduces.
> (2) **Static anatomy** — an orbiting key light makes the body look like it is
> turning, which is the read `docs/decisions.md` entry 3 rejected ("it should
> read like the RIG is running up around a monstrous leg"). The camera moves;
> the world does not. Color-cycling the sun would also walk straight out of the
> ≤8-color palette in `docs/DESIGN.md`.

## Performance Tips

1. **Limit light count**: Each light adds shader complexity
2. **Use baked lighting**: For static scenes, bake to textures
3. **Smaller shadow maps**: 512-1024 often sufficient
4. **Tight shadow frustums**: Only cover needed area
5. **Disable unused shadows**: Not all lights need shadows
6. **Use light layers**: Exclude objects from certain lights

```javascript
// Light layers
light.layers.set(1); // Light only affects layer 1
mesh.layers.enable(1); // Mesh is on layer 1
otherMesh.layers.disable(1); // Other mesh not affected

// Selective shadows
mesh.castShadow = true;
mesh.receiveShadow = true;
decorMesh.castShadow = false; // Small objects often don't need to cast
```

> HULLBREAKER: tips 1 and 2 are the house style already — two lights, no
> shadows, and the "bake" is `limbBakePlan()` in `src/pure/limb.js` (a
> deterministic static bake, asserted by pathcheck lines 4072-4084). Tips 3-5
> only matter if shadows are ever approved. Layers are usable but remember the
> camera has its own layer semantics and `src/render/camera.js` owns camera
> state — coordinate before claiming a layer index.

## See Also

- `threejs-materials` - Material light response
- `threejs-textures` - Lightmaps and environment maps
- `threejs-postprocessing` - Bloom and other light effects

> HULLBREAKER: these sibling skills may or may not be installed under
> `.claude/skills/` — check before citing them. And note `threejs-postprocessing`
> is a bigger version of the same question this skill raises: an `EffectComposer`
> pass is a full extra render target per frame against the 60fps target, plus a
> look change over the whole game. Same bar: recorded operator decision in
> `docs/decisions.md`, prototype behind an off-by-default query flag, checkpoint
> packet in `SPRINT.md`.
