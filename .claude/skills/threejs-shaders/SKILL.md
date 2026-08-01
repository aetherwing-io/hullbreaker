---
name: threejs-shaders
description: Three.js shaders - GLSL, ShaderMaterial, uniforms, custom effects. Use when creating custom visual effects, modifying vertices, writing fragment shaders, or extending built-in materials. In HULLBREAKER this applies only to `src/render/`, `src/ui/`, and `src/main.js` (three.js 0.170.0 via the CDN import map, no build step, GLSL in template literals), and every shader is bound by the guardrails section below.
---

## HULLBREAKER guardrails (read before using anything below)

Everything after this section is upstream reference material written for a
generic three.js app with a bundler. This repo is not that app. These
constraints are law here, and a green `node tools/pathcheck.mjs` is **not**
evidence that a shader obeys them: nothing in that harness parses GLSL, so
every rule in this section is on you, not on a gate.

### 1. Where shader code may live

`THREE` may only be imported in `src/render/*.js`, `src/ui/*.js`, and
`src/main.js`. Never in `src/pure/`, `src/sim/`, or `src/config.js`:
`tools/pathcheck.mjs:107` bans the bare tokens
`THREE|document|window|renderer|scene|addEventListener|requestAnimationFrame|innerWidth|innerHeight|devicePixelRatio|performance`
in those layers, and the two `guardLayer(...)` calls at
`tools/pathcheck.mjs:128` and `:133` `process.exit(1)` on the first hit (they
also reject imports that cross a layer). Comments are stripped first, so prose
may name three.js; code may not.

- The one renderer, scene, camera, and light rig live in `src/render/scene.js`
  (it exports `renderer`, `scene`, `camera`, `HIDE`). Build materials in the
  render module that owns the mesh, not in a new global.
- `src/render/fx.js` is the deliberately empty "juice pass" landing site — the
  right home for a new effect module that belongs to no existing one.
- Sim→render crossings go through the hooks in `src/sim/bridge.js`
  (`view.player.sync`, `view.hostiles.sync`, `view.transform.frame`, …). A
  per-frame uniform update belongs in an existing hook, not in a fresh
  `requestAnimationFrame` loop.

### 2. Uniforms flow sim → render. Never the reverse.

`src/sim/bridge.js` states the contract verbatim: "hooks are presentation-only.
A hook must never write sim state or the headless run diverges from the played
run." So:

- **Time:** import `gameMs` from `src/sim/time.js` and feed it to your `uTime`
  uniform. That is the deterministic gameplay clock the render layer already
  uses — `src/render/mods.js:64` pulses a material opacity with
  `Math.sin(gameMs / 40)`, and `src/render/hostiles.js` drives every telegraph
  blink off `gameMs`. Do **not** use `THREE.Clock`/`clock.getElapsedTime()`,
  `performance.now()`, or `Date.now()`: pathcheck's banned-token guard does not
  cover `src/render/`, so nothing catches wall-clock drift for you, and
  `tools/playtest/run.mjs --deterministic` replays will stop reproducing.
- **Randomness:** seeded `src/pure/rng.js` only. GLSL hash noise (upstream
  "Noise-Based Effects") is acceptable as pixel dressing that nothing reads
  back, but it must never drive something the player must react to — a tell, a
  telegraph, a hit cue — because the sim cannot see it and a bot run cannot
  reproduce it.
- **No read-back:** no `readRenderTargetPixels`, no GPU picking, no shader
  result ever informing sim state. Uniforms are a one-way pipe.

### 3. Color comes from the palette, not from your fragment shader

Today in `main`, every render color is a token on `CONFIG.palette` in
`src/config.js` (see `src/render/scene.js:15-16`, `src/render/hostiles.js`,
`src/render/level.js:103-104`). A palette-token lane (T-010) is in flight that
adds `src/render/palette.js` plus pathcheck assertions rejecting "raw color
literals — 0xRRGGBB or CSS #hex/rgb() — in tokenized render files"; if
`src/render/palette.js` exists in your checkout, import tokens from it instead
of reading `CONFIG.palette` directly, or that assertion will fail you.

The literal guard is textual: it cannot see `vec3(0.5, 0.8, 1.0)` inside a GLSL
template literal. Discipline substitutes for the gate — declare
`uniform vec3 uColor` and feed it a `new THREE.Color(<palette token>)`. Every
hardcoded color in the upstream examples below is annotated where it appears.

### 4. Static anatomy is law (`docs/decisions.md` entry 3, CP3 verdict)

Operator verdict, quoted: "the creature's anatomy is monumental and **static**
during a transition — RIG and the camera are what move. The next stretch of
world already exists and is *revealed* … never *assembled*, slammed, or
articulated into place." `CLAUDE.md`'s matching hard rule: only "doors, access
plates, vent covers, shutters, traps, and Crown mechanisms may move."

Consequence for this skill: **vertex-displacement shaders on hull, deck, limb,
or any creature-body geometry are forbidden** — a breathing, rippling, or
assembling hull is exactly the read the operator rejected. That covers upstream's
"Vertex Displacement" section and the `onBeforeCompile` example that writes
`transformed.y += sin(...)`. Fragment-side work (tone, rim, fog blend, sparks on
a moving door) does not move anatomy and is not covered by this ban.

What pathcheck does catch — narrow, textual, and worth knowing:

- `tools/pathcheck.mjs:4083` asserts `src/render/limb.js` "installs no view
  hook at all: no per-frame, ritual or build callback can move the limb", so
  adding a per-frame uniform update to the limb module fails the gate outright.
- The same block asserts `src/pure/limb.js` "takes no time or randomness
  argument: a body that cannot be animated cannot assemble (CP3 ruling)", and
  that the bake plan is deterministic.
- `tools/pathcheck.mjs:2067` and `:2069` assert `src/render/transform.js` never
  calls `bandSlamOffset|zipperOffset` and grows no `debris|tumbl` system.

What it does **not** catch: any GLSL at all. A displacement shader in a template
literal in another render module passes green. Green is not permission.

### 5. Flag-gated, off by default, operator-judged

- `CLAUDE.md` hard rule: "Prototypes ship behind query flags, off by default."
  Add the flag in `src/mode.js` beside `IS_G1` (`?g1=1`, the existing
  render-only flag precedent), not via an ad-hoc `location.search` read in a
  render module. Headless hosts select flags through `globalThis.__HB_QUERY__`,
  which only works if the flag is resolved there.
- "Machine gates never judge fun." A shader is a look change, so it is a feel
  question by definition: post a packet in `SPRINT.md`'s "Operator checkpoint
  queue" (line 308) with the exact URL and 3–5 questions, and never call the
  result good yourself.
- Judge frames against `docs/concept-art/README.md`'s "Visual invariants":
  "strong silhouettes and flat-shaded, chunky industrial geometry", connected
  hull surfaces, and RIG at 3–5% of screen height. `docs/decisions.md` entry 7
  made FAR the default view (RIG ≈ 3.7%) — per-pixel shader detail is invisible
  at that scale. If an effect does not change the silhouette or the value
  ladder, it is costing frame time for nothing. Pillar 5, "chaos stays
  readable", outranks any effect's prettiness.

**Not currently sanctioned — needs a new operator decision recorded in
`docs/decisions.md` before you build it** (do not talk yourself past this; a
decision is proposed to the operator, never assumed):

- any shader that deforms, animates, or dissolves creature anatomy (entry 3);
- a post-processing / `EffectComposer` stack — it changes the whole game's look,
  adds a `three/addons/` runtime surface, and spends the frame budget the FAR
  view already pays for;
- replacing the flat-shaded look with a lit/PBR/stylized shading model, which
  contradicts the visual invariant quoted above;
- anything that alters how an enemy telegraph reads (`src/render/hostiles.js`
  tells are tuned against the fairness assertions in `tools/pathcheck.mjs`).

### 6. three.js 0.170.0 facts in this repo that the upstream text does not know

- **No build step and no runtime dependencies.** GLSL lives in JS template
  literals inside the render module. Never import a `.glsl` file (upstream
  "External Shader Files" assumes vite/webpack — annotated there). Never run
  `npm install` for the game; the only npm surface in the repo is dev-only
  tooling under `tools/*/`.
- **Import map is closed.** `index.html` maps exactly `three` →
  `three@0.170.0/build/three.module.js` and `three/addons/` →
  `three@0.170.0/examples/jsm/`. Adding another CDN entry is a runtime
  dependency and is banned by the hard rule.
- **Tone mapping and fog are not free.** `src/render/scene.js` sets
  `renderer.toneMapping = THREE.ACESFilmicToneMapping` and `scene.fog`, and
  `src/render/camera.js:64-72` shifts the fog band per view depth. A custom
  `ShaderMaterial` receives **neither** automatically — include
  `<tonemapping_fragment>` / `<colorspace_fragment>` and the fog chunks, or your
  effect will sit outside the value ladder `src/render/limb.js` documents
  ("a lit face lands at roughly 0.45x its albedo"). Fog is also load-bearing
  narratively: entry 3 makes the reveal happen through "natural self-occlusion
  and fog".
- **Instanced meshes are everywhere.** `src/render/bullets.js`,
  `src/render/level.js`, and `src/render/limb.js` use `THREE.InstancedMesh` with
  `setColorAt`. A custom `ShaderMaterial` on one of those must apply
  `instanceMatrix` (and read `instanceColor`) itself — built-in materials do it
  via shader chunks; yours will collapse every instance onto the origin if you
  forget.
- The upstream body carries API drift against 0.170. Corrections are annotated
  inline at each site: `<output_fragment>`, the WebGL1 `extensions` block, the
  instanced-attribute example, `clock.getElapsedTime()`, and `.glsl` imports.

### 7. Where the repo already solved this — extend, don't reinvent

| You want | It already exists at |
|---|---|
| Enemy tells / glow pulses | `src/render/hostiles.js` (`v.mat.emissive.setHex(glow)`, blink off `gameMs`, palette tokens) |
| Full-screen color response | `src/ui/tint.js` (cached DOM overlay) + `src/render/mods.js` — no post-processing pass needed |
| Atmosphere / depth falloff | `scene.fog` in `src/render/scene.js`, per-view band shift in `src/render/camera.js:64-72`, `CONFIG.limb.fog` |
| Per-facet shading of the limb | `limbFacetTone` in `src/pure/limb.js` + instanced `setColorAt` in `src/render/limb.js` — static, deterministic, no shader |
| A landing site for new juice | `src/render/fx.js` (intentionally empty) |

Verification for any change made with this skill: `node tools/pathcheck.mjs`
exits 0, `index.html?selftest=1` reports SELFTEST PASS (`src/main.js:462`), the
new visual is behind an off-by-default flag, and a checkpoint packet is queued
for the operator.

---

*Upstream reference follows, preserved. Inline `NOTE (HULLBREAKER)` comments
mark places where an example violates a rule above or drifts from 0.170.*

# Three.js Shaders

## Quick Start

```javascript
import * as THREE from "three";

const material = new THREE.ShaderMaterial({
  uniforms: {
    time: { value: 0 },
    // NOTE (HULLBREAKER): drive `time` from `gameMs` (src/sim/time.js), never a
    // wall clock — guardrail 2.
    color: { value: new THREE.Color(0xff0000) },
    // NOTE (HULLBREAKER): 0xff0000 is a raw literal. Use a CONFIG.palette token
    // (or src/render/palette.js if the T-010 lane has landed) — guardrail 3.
  },
  vertexShader: `
    void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 color;

    void main() {
      gl_FragColor = vec4(color, 1.0);
    }
  `,
});

// Update in animation loop
material.uniforms.time.value = clock.getElapsedTime();
// NOTE (HULLBREAKER): forbidden pattern here — THREE.Clock reads performance.now(),
// so a --deterministic bot replay stops reproducing. Write instead, from an
// existing src/sim/bridge.js sync hook:
//   import { gameMs } from '../sim/time.js';
//   material.uniforms.time.value = gameMs / 1000;
```

## ShaderMaterial vs RawShaderMaterial

### ShaderMaterial

Three.js provides built-in uniforms and attributes.

```javascript
const material = new THREE.ShaderMaterial({
  vertexShader: `
    // Built-in uniforms available:
    // uniform mat4 modelMatrix;
    // uniform mat4 modelViewMatrix;
    // uniform mat4 projectionMatrix;
    // uniform mat4 viewMatrix;
    // uniform mat3 normalMatrix;
    // uniform vec3 cameraPosition;

    // Built-in attributes available:
    // attribute vec3 position;
    // attribute vec3 normal;
    // attribute vec2 uv;

    void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    void main() {
      gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
    }
  `,
});
```

> **NOTE (HULLBREAKER):** a bare `gl_FragColor` write like this bypasses the two
> things `src/render/scene.js` sets up for every other material — ACES tone
> mapping and `scene.fog`. Add `#include <tonemapping_fragment>` and
> `#include <colorspace_fragment>` at the end of `main()`, plus the fog chunks
> (`<fog_pars_fragment>` / `<fog_fragment>`) if the effect sits in the world, or
> the surface will float outside the value ladder documented at the top of
> `src/render/limb.js` and outside the fog that `docs/decisions.md` entry 3
> relies on for the reveal. Guardrail 6.

### RawShaderMaterial

Full control - you define everything.

```javascript
const material = new THREE.RawShaderMaterial({
  uniforms: {
    projectionMatrix: { value: camera.projectionMatrix },
    modelViewMatrix: { value: new THREE.Matrix4() },
  },
  vertexShader: `
    precision highp float;

    attribute vec3 position;
    uniform mat4 projectionMatrix;
    uniform mat4 modelViewMatrix;

    void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    precision highp float;

    void main() {
      gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
    }
  `,
});
```

## Uniforms

### Uniform Types

```javascript
const material = new THREE.ShaderMaterial({
  uniforms: {
    // Numbers
    floatValue: { value: 1.5 },
    intValue: { value: 1 },

    // Vectors
    vec2Value: { value: new THREE.Vector2(1, 2) },
    vec3Value: { value: new THREE.Vector3(1, 2, 3) },
    vec4Value: { value: new THREE.Vector4(1, 2, 3, 4) },

    // Colors (converted to vec3)
    colorValue: { value: new THREE.Color(0xff0000) },

    // Matrices
    mat3Value: { value: new THREE.Matrix3() },
    mat4Value: { value: new THREE.Matrix4() },

    // Textures
    textureValue: { value: texture },
    cubeTextureValue: { value: cubeTexture },

    // Arrays
    floatArray: { value: [1.0, 2.0, 3.0] },
    vec3Array: {
      value: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)],
    },
  },
});
```

### GLSL Declarations

```glsl
// In shader
uniform float floatValue;
uniform int intValue;
uniform vec2 vec2Value;
uniform vec3 vec3Value;
uniform vec3 colorValue;    // Color becomes vec3
uniform vec4 vec4Value;
uniform mat3 mat3Value;
uniform mat4 mat4Value;
uniform sampler2D textureValue;
uniform samplerCube cubeTextureValue;
uniform float floatArray[3];
uniform vec3 vec3Array[2];
```

### Updating Uniforms

```javascript
// Direct assignment
material.uniforms.time.value = clock.getElapsedTime();

// Vector/Color updates
material.uniforms.position.value.set(x, y, z);
material.uniforms.color.value.setHSL(hue, 1, 0.5);

// Matrix updates
material.uniforms.matrix.value.copy(mesh.matrixWorld);
```

## Varyings

Pass data from vertex to fragment shader.

```javascript
const material = new THREE.ShaderMaterial({
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vPosition;

    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);
      vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;

      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vPosition;

    void main() {
      // Use interpolated values
      gl_FragColor = vec4(vNormal * 0.5 + 0.5, 1.0);
    }
  `,
});
```

## Common Shader Patterns

### Texture Sampling

```javascript
const material = new THREE.ShaderMaterial({
  uniforms: {
    map: { value: texture },
  },
  vertexShader: `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D map;
    varying vec2 vUv;

    void main() {
      vec4 texColor = texture2D(map, vUv);
      gl_FragColor = texColor;
    }
  `,
});
```

### Vertex Displacement

> **NOTE (HULLBREAKER) — hard stop.** Applied to hull, deck, limb, or any
> creature-body geometry, this is the exact read `docs/decisions.md` entry 3
> rejected: anatomy is "monumental and **static**", revealed, never assembled or
> articulated. Displacement is available only for the movable set `CLAUDE.md`
> names (doors, access plates, vent covers, shutters, traps, Crown mechanisms) or
> for things the ship *builds*. Anything else needs a new operator decision
> recorded in `docs/decisions.md` first — pathcheck cannot see GLSL, so it will
> not stop you. Guardrail 4.

```javascript
const material = new THREE.ShaderMaterial({
  uniforms: {
    time: { value: 0 },
    amplitude: { value: 0.5 },
  },
  vertexShader: `
    uniform float time;
    uniform float amplitude;

    void main() {
      vec3 pos = position;

      // Wave displacement
      pos.z += sin(pos.x * 5.0 + time) * amplitude;
      pos.z += sin(pos.y * 5.0 + time) * amplitude;

      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  fragmentShader: `
    void main() {
      gl_FragColor = vec4(0.5, 0.8, 1.0, 1.0);
    }
  `,
});
```

### Fresnel Effect

```javascript
const material = new THREE.ShaderMaterial({
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vWorldPosition;

    void main() {
      vNormal = normalize(normalMatrix * normal);
      vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec3 vNormal;
    varying vec3 vWorldPosition;

    void main() {
      // cameraPosition is auto-provided by ShaderMaterial
      vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
      float fresnel = pow(1.0 - dot(viewDirection, vNormal), 3.0);

      // NOTE (HULLBREAKER): hardcoded colors — declare `uniform vec3` and feed
      // palette tokens instead (guardrail 3). Same for the rim/dissolve
      // examples below.
      vec3 baseColor = vec3(0.0, 0.0, 0.5);
      vec3 fresnelColor = vec3(0.5, 0.8, 1.0);

      gl_FragColor = vec4(mix(baseColor, fresnelColor, fresnel), 1.0);
    }
  `,
});
```

### Noise-Based Effects

```glsl
// Simple noise function
float random(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

// Value noise
float noise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);

  float a = random(i);
  float b = random(i + vec2(1.0, 0.0));
  float c = random(i + vec2(0.0, 1.0));
  float d = random(i + vec2(1.0, 1.0));

  vec2 u = f * f * (3.0 - 2.0 * f);

  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

// Usage
float n = noise(vUv * 10.0 + time);
```

### Gradient

```glsl
// Linear gradient
vec3 color = mix(colorA, colorB, vUv.y);

// Radial gradient
float dist = distance(vUv, vec2(0.5));
vec3 color = mix(centerColor, edgeColor, dist * 2.0);

// Smooth gradient with custom curve
float t = smoothstep(0.0, 1.0, vUv.y);
vec3 color = mix(colorA, colorB, t);
```

### Rim Lighting

```javascript
const material = new THREE.ShaderMaterial({
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vViewPosition;

    void main() {
      vNormal = normalize(normalMatrix * normal);
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      vViewPosition = mvPosition.xyz;
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    varying vec3 vNormal;
    varying vec3 vViewPosition;

    void main() {
      vec3 viewDir = normalize(-vViewPosition);
      float rim = 1.0 - max(0.0, dot(viewDir, vNormal));
      rim = pow(rim, 4.0);

      vec3 baseColor = vec3(0.2, 0.2, 0.8);
      vec3 rimColor = vec3(1.0, 0.5, 0.0);

      gl_FragColor = vec4(baseColor + rimColor * rim, 1.0);
    }
  `,
});
```

### Dissolve Effect

> **NOTE (HULLBREAKER):** legitimate for an enemy death or a thing the ship
> builds; forbidden as a way to make hull, deck, or limb appear/disappear —
> that is assembly by another name (`docs/decisions.md` entry 3). The transition
> render is additionally asserted to grow no `debris|tumbl` system
> (`tools/pathcheck.mjs:2069`): "covers stay whole". Guardrail 4.

```glsl
uniform float progress;
uniform sampler2D noiseMap;

void main() {
  float noise = texture2D(noiseMap, vUv).r;

  if (noise < progress) {
    discard;
  }

  // Edge glow
  float edge = smoothstep(progress, progress + 0.1, noise);
  vec3 edgeColor = vec3(1.0, 0.5, 0.0);
  vec3 baseColor = vec3(0.5);

  gl_FragColor = vec4(mix(edgeColor, baseColor, edge), 1.0);
}
```

## Extending Built-in Materials

### onBeforeCompile

Modify existing material shaders.

```javascript
const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });

material.onBeforeCompile = (shader) => {
  // Add custom uniform
  shader.uniforms.time = { value: 0 };

  // Store reference for updates
  material.userData.shader = shader;

  // Modify vertex shader
  shader.vertexShader = shader.vertexShader.replace(
    "#include <begin_vertex>",
    `
    #include <begin_vertex>
    transformed.y += sin(position.x * 10.0 + time) * 0.1;
    // NOTE (HULLBREAKER): this is vertex displacement wearing a different hat —
    // the static-anatomy ban (guardrail 4 / decisions entry 3) applies exactly
    // as it does above. onBeforeCompile is still the preferred tool for
    // fragment-side tweaks to an existing MeshStandardMaterial, since it keeps
    // the repo's lighting, fog, and tone mapping intact.
    `,
  );

  // Add uniform declaration
  shader.vertexShader = "uniform float time;\n" + shader.vertexShader;
};

// Update in animation loop
if (material.userData.shader) {
  material.userData.shader.uniforms.time.value = clock.getElapsedTime();
}
```

### Common Injection Points

```javascript
// Vertex shader chunks
"#include <begin_vertex>"; // After position is calculated
"#include <project_vertex>"; // After gl_Position
"#include <beginnormal_vertex>"; // Normal calculation start

// Fragment shader chunks
"#include <color_fragment>"; // After diffuse color
"#include <output_fragment>"; // Final output
"#include <fog_fragment>"; // After fog applied
```

> **NOTE (HULLBREAKER) — API drift.** `<output_fragment>` was renamed
> `<opaque_fragment>` in three r152; on the pinned 0.170.0 build an unresolvable
> `#include` throws at compile time. Use `<opaque_fragment>`, and verify chunk
> names against the pinned build (`ShaderChunk` keys) rather than trusting this
> list.

## GLSL Built-in Functions

### Math Functions

```glsl
// Basic
abs(x), sign(x), floor(x), ceil(x), fract(x)
mod(x, y), min(x, y), max(x, y), clamp(x, min, max)
mix(a, b, t), step(edge, x), smoothstep(edge0, edge1, x)

// Trigonometry
sin(x), cos(x), tan(x)
asin(x), acos(x), atan(y, x), atan(x)
radians(degrees), degrees(radians)

// Exponential
pow(x, y), exp(x), log(x), exp2(x), log2(x)
sqrt(x), inversesqrt(x)
```

### Vector Functions

```glsl
// Length and distance
length(v), distance(p0, p1), dot(x, y), cross(x, y)

// Normalization
normalize(v)

// Reflection and refraction
reflect(I, N), refract(I, N, eta)

// Component-wise
lessThan(x, y), lessThanEqual(x, y)
greaterThan(x, y), greaterThanEqual(x, y)
equal(x, y), notEqual(x, y)
any(bvec), all(bvec)
```

### Texture Functions

```glsl
// GLSL 1.0 (default) - use texture2D/textureCube
texture2D(sampler, coord)
texture2D(sampler, coord, bias)
textureCube(sampler, coord)

// GLSL 3.0 (glslVersion: THREE.GLSL3) - use texture()
// texture(sampler, coord) replaces texture2D/textureCube
// Also use: out vec4 fragColor instead of gl_FragColor

// Texture size (GLSL 1.30+)
textureSize(sampler, lod)
```

## Common Material Properties

```javascript
const material = new THREE.ShaderMaterial({
  uniforms: {
    /* ... */
  },
  vertexShader: "/* ... */",
  fragmentShader: "/* ... */",

  // Rendering
  transparent: true,
  opacity: 1.0,
  side: THREE.DoubleSide,
  depthTest: true,
  depthWrite: true,

  // Blending
  blending: THREE.NormalBlending,
  // AdditiveBlending, SubtractiveBlending, MultiplyBlending

  // Wireframe
  wireframe: false,
  wireframeLinewidth: 1, // Note: >1 has no effect on most platforms (WebGL limitation)

  // Extensions
  extensions: {
    // NOTE (HULLBREAKER) — API drift: these four are WebGL1-era flags. three
    // 0.170.0 is WebGL2-only (the WebGL1 renderer path was removed in r163), so
    // derivatives (fwidth/dFdx/dFdy), gl_FragDepth, MRT and texture LOD are core
    // and these keys are ignored/deprecated. In 0.170 `extensions` carries only
    // the modern opt-ins (clipCullDistance, multiDraw). Delete the block.
    derivatives: true, // For fwidth, dFdx, dFdy
    fragDepth: true, // gl_FragDepth
    drawBuffers: true, // Multiple render targets
    shaderTextureLOD: true, // texture2DLod
  },

  // GLSL version
  glslVersion: THREE.GLSL3, // For WebGL2 features
});
```

## Shader Includes

### Using Three.js Shader Chunks

```javascript
import { ShaderChunk } from "three";

const fragmentShader = `
  ${ShaderChunk.common}
  ${ShaderChunk.packing}

  uniform sampler2D depthTexture;
  varying vec2 vUv;

  void main() {
    float depth = texture2D(depthTexture, vUv).r;
    float linearDepth = perspectiveDepthToViewZ(depth, 0.1, 1000.0);
    gl_FragColor = vec4(vec3(-linearDepth / 100.0), 1.0);
  }
`;
```

### External Shader Files

> **NOTE (HULLBREAKER) — does not work here, do not attempt.** There is no build
> step and no bundler: `index.html` loads ES modules directly through a CDN
> import map, so a `.glsl` import is a 404 and adding vite/webpack would violate
> the "No build step, no runtime dependencies" hard rule. Keep GLSL in JS
> template literals inside the render module (guardrail 6). If a shader grows
> too large for its module, split it into a `src/render/*.js` module that
> exports the strings.

```javascript
// With vite/webpack
import vertexShader from "./shaders/vertex.glsl";
import fragmentShader from "./shaders/fragment.glsl";

const material = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
});
```

## Instanced Shaders

> **NOTE (HULLBREAKER) — incomplete as written, and this repo is instancing-heavy
> (`src/render/bullets.js`, `src/render/level.js`, `src/render/limb.js` all use
> `THREE.InstancedMesh` + `setColorAt`).** Two corrections: (1) an
> `InstancedBufferAttribute` only draws instanced on a
> `THREE.InstancedBufferGeometry` (or via `InstancedMesh`); (2) a custom
> `ShaderMaterial` on an `InstancedMesh` must apply the instancing itself —
> `gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);`
> — and read `attribute vec3 instanceColor` if the mesh uses `setColorAt`.
> Built-in materials do this through shader chunks; forget it and every instance
> collapses onto the origin.

```javascript
// Instanced attribute
const offsets = new Float32Array(instanceCount * 3);
// Fill offsets...
geometry.setAttribute("offset", new THREE.InstancedBufferAttribute(offsets, 3));

const material = new THREE.ShaderMaterial({
  vertexShader: `
    attribute vec3 offset;

    void main() {
      vec3 pos = position + offset;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  fragmentShader: `
    void main() {
      gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
    }
  `,
});
```

## Debugging Shaders

```javascript
// Check for compile errors
material.onBeforeCompile = (shader) => {
  console.log("Vertex Shader:", shader.vertexShader);
  console.log("Fragment Shader:", shader.fragmentShader);
};

// Visual debugging
fragmentShader: `
  void main() {
    // Debug UV
    gl_FragColor = vec4(vUv, 0.0, 1.0);

    // Debug normals
    gl_FragColor = vec4(vNormal * 0.5 + 0.5, 1.0);

    // Debug position
    gl_FragColor = vec4(vPosition * 0.1 + 0.5, 1.0);
  }
`;

// Check WebGL errors
renderer.debug.checkShaderErrors = true;
```

> **NOTE (HULLBREAKER):** `renderer` is the single instance exported from
> `src/render/scene.js` (import it, never construct a second one), and
> `checkShaderErrors` is already true by default in 0.170. Compile errors surface
> in the browser console — `index.html?selftest=1` (`src/main.js:462`) and
> `tools/playtest/run.mjs` both run a real browser, so a broken shader shows up
> there rather than in `node tools/pathcheck.mjs`, which never touches GLSL.

## Performance Tips

1. **Minimize uniforms**: Group related values into vectors
2. **Avoid conditionals**: Use mix/step instead of if/else
3. **Precalculate**: Move calculations to JS when possible
4. **Use textures**: For complex functions, use lookup tables
5. **Limit overdraw**: Avoid transparent objects when possible

```glsl
// Instead of:
if (value > 0.5) {
  color = colorA;
} else {
  color = colorB;
}

// Use:
color = mix(colorB, colorA, step(0.5, value));
```

## See Also

- `threejs-materials` - Built-in material types
- `threejs-postprocessing` - Full-screen shader effects
- `threejs-textures` - Texture sampling in shaders

> **NOTE (HULLBREAKER):** these sibling skills are upstream references and may
> not be installed under `.claude/skills/` here — check before citing one. In
> particular, a full-screen post-processing stack is **not** sanctioned in this
> repo (guardrail 5): it changes the whole game's look, adds a `three/addons/`
> runtime surface, and needs an operator decision recorded in
> `docs/decisions.md` before any work starts.
