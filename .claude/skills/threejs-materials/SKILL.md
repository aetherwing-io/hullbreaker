---
name: threejs-materials
description: Three.js materials - PBR, basic, phong, shader materials, material properties. Use when styling meshes, working with textures, creating custom shaders, or optimizing material performance. In HULLBREAKER, use it for work in src/render/ and src/main.js only — colors must come from src/render/palette.js tokens, never raw hex (pathcheck rejects literals in tokenized render files), the house look is flat-shaded MeshStandardMaterial under the fixed scene.js light rig, and textures/env maps/custom shaders are not sanctioned without an operator decision.
---

## HULLBREAKER guardrails (read before using anything below)

This section outranks everything after it. The upstream reference is generic
three.js written for a project with a bundler, an asset pipeline, and no
operator. This repo has laws. Where the two disagree, the laws win, and the
disagreements are named below rather than left for you to notice.

Everything here was verified against the repo on 2026-08-01. Paths and guard
text can drift as lanes merge — if something below does not match what you
read, trust the repo and say so in your report.

### 1. Where a material may exist at all

**May construct or touch a THREE material:** `src/render/scene.js` (the one
renderer, scene, camera and light rig), `src/render/level.js`,
`src/render/limb.js`, `src/render/transform.js`, `src/render/tower.js`,
`src/render/hostiles.js`, `src/render/player.js`, `src/render/capsules.js`,
`src/render/mods.js`, `src/render/bullets.js`, `src/render/fx.js`,
`src/render/hook.js` (inert prototype — see §7), and `src/main.js`.
`src/ui/hud.js`, `src/ui/overlay.js` and `src/ui/tint.js` are DOM/CSS only and
have no business with materials.

**May never:** anything under `src/pure/` or `src/sim/`, or `src/config.js`.
This is CLAUDE.md's "Layer purity" hard rule, and it is statically enforced.
`guardLayer()` in `tools/pathcheck.mjs` strips comments and then matches

```js
/\b(THREE|document|window|renderer|scene|addEventListener|requestAnimationFrame|innerWidth|innerHeight|devicePixelRatio|performance)\b/
```

against every file in those layers, plus a check that no import reaches
upward. On a hit it prints `pathcheck: forbidden <layer> reference in <file>`
and calls `process.exit(1)` — before any of the 600+ assertions run. Note that
the ban is on the bare words: a local variable named `scene` or a
`performance.now()` call inside `src/sim/` trips it just as hard as an import
of three.

If the simulation needs to influence how something looks, it publishes state
and the render layer reads it through the `src/sim/bridge.js` hooks. There is
no legitimate case where sim code names a material.

### 2. Colors come from tokens — a raw hex literal is a gate failure

`src/render/palette.js` is the render layer's color table (merged 2026-08-01
with T-010). It exports `CLASSIC` (the neutral grey-box, byte-faithful to
`CONFIG.palette` in `src/config.js`), `CONCEPT` (DESIGN's ≤8 color roles — the
shipped default), the resolved `PAL` and `PALETTE_ID`, `resolvePaletteId()`,
and `atmosphereBg()`. `?palette=classic` selects the grey-box baseline.

pathcheck rejects raw color literals — `0xRRGGBB` and CSS
`#rgb`/`#rrggbb`/`#rrggbbaa`/`rgb()`/`rgba()` — in tokenized render files, and
requires every kind in the sim `ENEMY` roster to carry a body token in **both**
tables.
`?palette=classic` selects the grey-box baseline for operator side-by-sides;
everything else resolves to concept.

`tools/pathcheck.mjs`'s palette section defines

```js
const tokenized = ['scene.js', 'level.js', 'capsules.js', 'bullets.js',
  'player.js', 'mods.js', 'limb.js', 'transform.js', 'tower.js', 'fx.js',
  'hostiles.js'];
```

and fails the run if any of those files (comments stripped) contains a
`CONFIG.palette` / `CONFIG.limb.bg` read, or matches

```js
/0x[0-9a-fA-F]{6}\b|#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b|\brgba?\s*\(/g
```

with exactly one exception: `0xffffff`, the identity base color of
instance-coloured and tint-coloured materials. Both spellings count, because
the palette carries string tokens (`capsule`, `capsuleInk`) too and a CSS
string would skip the concept remap just as silently as a number would.

**This means the upstream Quick Start below fails this repo's gate as
written.** `new THREE.MeshStandardMaterial({ color: 0x00ff00 })` becomes
`new THREE.MeshStandardMaterial({ color: PAL.ground, flatShading: true })`.

Adding a color role: author it in **both** tables in `palette.js` — pathcheck
asserts the two tables carry identical token sets (including the nested
`limb`/`transform`/`shots`/`tints` groups), that every enemy kind in
`src/sim/hostiles.js`'s roster has a body token in both, and that the concept
values stay in their hue family (teal atmosphere, rust body/route, acid enemy,
magenta pickup, warm-white muzzle, amber warn). Two tokens are deliberately
mode-independent and must not be remapped: `glowOff` (0x000000) and
`hitFlash` (0xffffff) — hit feedback cannot change with a URL flag.

**Status, verify before relying on it:** T-010 is `review` in `SPRINT.md` and
carries both `src/render/palette.js` and that guard on branch `task/T-010`. On
`main` at the moment this skill was installed, `src/render/palette.js` did not
exist yet and the render modules still read `CONFIG.palette` from
`src/config.js`; the literal guard was not yet in `tools/pathcheck.mjs`
either. The rule for new code is identical either way: **author no new color
literal.** If `palette.js` is present, import `PAL` from it. If it is not, you
are landing alongside T-010 — take the color from `CONFIG.palette` and flag
the token in your report so the integrator can repoint it, exactly the way
inbox item I-004 handled `src/render/hostiles.js`.

The budget itself is `docs/DESIGN.md`: "Palette (≤8 colors): deep teal
environment, rust-orange metal, acid-green enemy glow, hot magenta pickups,
warm white muzzle light. Flat-shaded low-poly, fog matched to background."
On the asset side the same ≤8-role budget is enforced by
`tools/assets/check.mjs`.

### 3. Flat-shaded low-poly is the shipped look, not a placeholder

Every lit surface in the game is `MeshStandardMaterial({ color, flatShading:
true })`; unlit quads and beams are `MeshBasicMaterial`. Nothing uses `map`,
`normalMap`, `aoMap`, `envMap`, clearcoat, transmission, sheen, iridescence,
or anisotropy — the whole second half of the upstream MeshPhysicalMaterial
section is unused here on purpose.

Two reasons, both load-bearing. `docs/concept-art/README.md`'s "Visual
invariants" requires "strong silhouettes and flat-shaded, chunky industrial
geometry". And `docs/decisions.md` entry 7 (view-scale verdict, LAW) makes FAR
the default view, with RIG at ~3.7% of screen height — at that scale
micro-surface detail is sub-pixel, and silhouette plus value separation are
the only channels that survive. A "richer" material is not a free upgrade
here; it is a look change with a readability cost, and therefore an operator
question (§8).

The light rig is fixed and shared: `src/render/scene.js` has exactly one
`HemisphereLight`, one `DirectionalLight`, and `ACESFilmicToneMapping`. Do not
add lights per feature or build a second renderer. `palette.js`'s header
records the calibration this rig produces — a lit face lands at roughly 0.45x
its albedo while `scene.background`/fog draw raw — which is why the tokens are
authored brighter than taste suggests. Changing `roughness`, `metalness`, or
light intensity shifts every token's perceived value at once: that is a
palette-wide change, not a local tweak, and it invalidates the operator's
existing palette judgment.

Keep `fog: true` (the three.js default) on world materials. `scene.js` builds
the background color and the `THREE.Fog` from the same token, and pathcheck
asserts that (`new THREE.Color(PAL.bg)` / `new THREE.Fog(PAL.bg,`). A material
with `fog: false` punches a hole in DESIGN's "fog matched to background".
`ShaderMaterial` is not fogged automatically — see §6.

### 4. Materials may not animate the anatomy into existence

`docs/decisions.md` entry 3 is law: "the creature's anatomy is monumental and
**static** during a transition — RIG and the camera are what move. The next
stretch of world already exists and is *revealed* ... never *assembled*."

Material-side, that rules out: dissolve/build-in shaders on hull, rib, scute,
wall or deck geometry; opacity ramps or clipping-plane wipes that read as body
mass materializing; emissive sweeps that animate anatomy into place. The
entry's own addendum keeps assembly available only for things the ship
*builds* — traps, emplacements, later enemies — because "assembly reads as
hostile activity, not as the world itself".

What may still move or change state: doors, access plates, vent covers,
shutters, traps, and Crown mechanisms. `palette.js` marks this in the token
comments (`transform.panel`: "covers are ship-built mechanisms: metal, may
move").

Anything outside that list needs a **new operator decision recorded in
`docs/decisions.md` before you write it**. Do not re-litigate entry 3, and do
not route around it by calling the effect a fade, a shimmer, or a reveal
shader — the verdict is about what the player sees, not about the technique.

### 5. Textures, environment maps, and HDR are not sanctioned here

The game ships zero binary assets and still boots with every file under
`assets/` deleted. `tools/assets/check.mjs` enforces that as rule 6: no static
ES import of an `assets/` path anywhere in `src/`. So every `map`,
`normalMap`, `aoMap`, `gradientMap`, `envMap`, or `RGBELoader` HDR in the
upstream text below would be a first binary runtime dependency for the shipped
game plus a network fetch on a page that currently has none.

That is **not** yours to decide. It needs an operator decision recorded in
`docs/decisions.md` first, and then the asset itself needs an
`assets/manifest.json` entry, power-of-two dimensions (`check.mjs` rule 4),
and a palette-role pass (rule 5). `decisions.md` entry 8 opened an asset
*generation* lane; it did not decide that the renderer loads textures. The one
generated asset in the tree
(`assets/generated/glyphs/capsule-letter-h.png`) is logged in the manifest as
a style study that "nothing loads".

Related hard rule — "No build step, no runtime dependencies": three.js reaches
the page only through `index.html`'s import map, which maps `three` and
`three/addons/` to jsDelivr's `three@0.170.0`. Upstream's
`three/examples/jsm/...` specifier **does not resolve in this repo** and is
corrected to `three/addons/...` below. Never run `npm install` for the game;
dev-only tooling under `tools/*/` has its own `package.json` and that is the
only place a dependency may live.

### 6. New shader code is unjudged behavior and ships behind a flag

No `ShaderMaterial` or `RawShaderMaterial` exists in the game today. CLAUDE.md:
"Prototypes ship behind query flags, off by default." A custom shader in the
render path must be gated by a `?flag=` that defaults off, must leave the
default-URL frame byte-identical, and must arrive with an operator checkpoint
packet (§8).

Two three.js facts that bite specifically here: (a) a `ShaderMaterial` gets
neither scene fog nor the scene's tone mapping unless you opt in (`fog: true`
plus the fog shader chunks; `toneMapped`), so it will sit outside the value
space every other surface shares — the exact readability failure §3 is about;
(b) its `time` uniform must be driven from the render layer, never by adding a
clock to `src/pure/` or `src/sim/` — `performance` is in §1's banned word
list, and the determinism rule allows randomness only through the seeded
`src/pure/rng.js`.

### 7. Reuse what the repo already solved

- **One renderer/scene/light rig:** `src/render/scene.js`. Import it; do not
  build a second `WebGLRenderer`.
- **Instanced coloring instead of material pooling:** `src/render/level.js`
  (checker tiles), `src/render/limb.js`, `src/render/bullets.js` and
  `src/render/transform.js` all share one material per mesh and vary color via
  `InstancedMesh.setColorAt()` on a `0xffffff` identity base. That is this
  repo's answer to upstream's "Performance Tips → material pooling"; extend it
  rather than minting a material per entity.
- **Emissive state changes:** `src/render/hostiles.js` swaps
  `mat.emissive` between palette tokens for tells, charges and the death pop.
  New hostile emissives get named tokens in `palette.js` (both tables), not a
  generic "enemyGlow" — the module's header explains why a catch-all token is
  coverage the guards cannot certify.
- **Disposal:** `src/render/hostiles.js` and `src/render/capsules.js` already
  `dispose()` per-entity materials on despawn. Match that; a full climb is
  long enough for leaks to matter.
- **Judged-and-rejected code:** `src/render/hook.js` (`?hook=1`) was rejected
  by `docs/decisions.md` entry 5 and is the single file exempted from the
  tokenization guard. Keep it inert. Do not "improve" its materials.

### 8. You cannot declare a look good

CLAUDE.md: "Machine gates never judge fun." `node tools/pathcheck.mjs` exiting
0 is necessary and never sufficient for a material change. Anything that
alters pixels goes to `SPRINT.md`'s Operator checkpoint queue with an exact
URL and 3–5 questions, with screenshots taken at the default FAR view and
judged against `docs/concept-art/13-human-scale-monster-climb-grammar.png`,
`docs/concept-art/14-vertical-assault-level.png`, and the "Visual invariants"
list in `docs/concept-art/README.md`. `?palette=classic` exists to give the
operator that side-by-side — use it in your packet.

### 9. Lane discipline

Reading this skill does not widen your write scope. Work only inside your
assigned worktree on `task/<id>`, never commit or push to `main`, and let the
integrator merge through `tools/orch/merge-task.sh`.

---

*Everything below is the upstream `cloudai-x/threejs-skills` reference,
preserved. API corrections for three.js 0.170.0 and repo-rule annotations are
marked inline with `HULLBREAKER:`.*

# Three.js Materials

## Quick Start

```javascript
import * as THREE from "three";

// PBR material (recommended for realistic rendering)
const material = new THREE.MeshStandardMaterial({
  color: 0x00ff00,    // HULLBREAKER: FAILS the gate — raw 0xRRGGBB in a tokenized
                      // render file (§2). Use `color: PAL.<role>` from
                      // src/render/palette.js. Also add `flatShading: true` (§3).
  roughness: 0.5,     // HULLBREAKER: a global look lever under the fixed scene.js
  metalness: 0.5,     // rig — changing these is a palette-wide change (§3).
});

const mesh = new THREE.Mesh(geometry, material);
```

## Material Types Overview

| Material             | Use Case                              | Lighting           |
| -------------------- | ------------------------------------- | ------------------ |
| MeshBasicMaterial    | Unlit, flat colors, wireframes        | No                 |
| MeshLambertMaterial  | Matte surfaces, performance           | Yes (diffuse only) |
| MeshPhongMaterial    | Shiny surfaces, specular highlights   | Yes                |
| MeshStandardMaterial | PBR, realistic materials              | Yes (PBR)          |
| MeshPhysicalMaterial | Advanced PBR, clearcoat, transmission | Yes (PBR+)         |
| MeshToonMaterial     | Cel-shaded, cartoon look              | Yes (toon)         |
| MeshNormalMaterial   | Debug normals                         | No                 |
| MeshDepthMaterial    | Depth visualization                   | No                 |
| ShaderMaterial       | Custom GLSL shaders                   | Custom             |
| RawShaderMaterial    | Full shader control                   | Custom             |

HULLBREAKER: of this table, only **MeshStandardMaterial** (always with
`flatShading: true`) and **MeshBasicMaterial** are in use. Lambert/Phong/Toon
are a different lighting model than the shipped ACES + hemi/sun rig and would
break value coherence; Physical adds effects that are sub-pixel at the FAR
default view; Normal/Depth are debug-only; Shader/RawShader are §6 (flagged
prototype + operator packet). None of that is a ban on reading the reference —
it is a ban on shipping one without a verdict.

## MeshBasicMaterial

No lighting calculations. Fast, always visible.

```javascript
const material = new THREE.MeshBasicMaterial({
  color: 0xff0000,        // HULLBREAKER: token, not a literal (§2)
  transparent: true,
  opacity: 0.5,
  side: THREE.DoubleSide, // FrontSide, BackSide, DoubleSide
  wireframe: false,
  map: texture,           // HULLBREAKER: any texture is an unsanctioned runtime
  alphaMap: alphaTexture, // asset dependency — operator decision first (§5)
  envMap: envTexture,     // HULLBREAKER: same, and there is no env map in this game
  reflectivity: 1, // Env map intensity
  fog: true, // Affected by scene fog
                   // HULLBREAKER: keep this true on world surfaces — background
                   // and fog share one token (§3).
});
```

## MeshLambertMaterial

Diffuse-only lighting. Fast, no specular highlights.

```javascript
const material = new THREE.MeshLambertMaterial({
  color: 0x00ff00,
  emissive: 0x111111, // Self-illumination color
  emissiveIntensity: 1,
  map: texture,
  emissiveMap: emissiveTexture,
  envMap: envTexture,
  reflectivity: 0.5,
});
```

## MeshPhongMaterial

Specular highlights. Good for shiny, plastic-like surfaces.

```javascript
const material = new THREE.MeshPhongMaterial({
  color: 0x0000ff,
  specular: 0xffffff, // Highlight color
  shininess: 100, // Highlight sharpness (0-1000)
  emissive: 0x000000,
  flatShading: false, // Flat vs smooth shading
  map: texture,
  specularMap: specTexture, // Per-pixel shininess
  normalMap: normalTexture,
  normalScale: new THREE.Vector2(1, 1),
  bumpMap: bumpTexture,
  bumpScale: 1,
  displacementMap: dispTexture,
  displacementScale: 1,
});
```

## MeshStandardMaterial (PBR)

Physically-based rendering. Recommended for realistic results.

```javascript
const material = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.5, // 0 = mirror, 1 = diffuse
  metalness: 0.0, // 0 = dielectric, 1 = metal

  // Textures
  map: colorTexture, // Albedo/base color
  roughnessMap: roughTexture, // Per-pixel roughness
  metalnessMap: metalTexture, // Per-pixel metalness
  normalMap: normalTexture, // Surface detail
  normalScale: new THREE.Vector2(1, 1),
  aoMap: aoTexture, // Ambient occlusion (uses uv2!)
  aoMapIntensity: 1,
  displacementMap: dispTexture, // Vertex displacement
  displacementScale: 0.1,
  displacementBias: 0,

  // Emissive
  emissive: 0x000000,
  emissiveIntensity: 1,
  emissiveMap: emissiveTexture,

  // Environment
  envMap: envTexture,
  envMapIntensity: 1,

  // Other
  flatShading: false,   // HULLBREAKER: ship `true` — flat-shaded low-poly is the
                        // house look (DESIGN.md Concept; visual invariants) (§3)
  wireframe: false,
  fog: true,
});

// Note: aoMap requires second UV channel
// HULLBREAKER / three.js r170 CORRECTION: the attribute was renamed in r151 —
// aoMap and lightMap read `uv1`, not `uv2`. Upstream's line is a no-op on 0.170.0.
geometry.setAttribute("uv1", geometry.attributes.uv);
```

HULLBREAKER: `MeshStandardMaterial` is the game's lit material, but only in its
untextured form — `new THREE.MeshStandardMaterial({ color: PAL.<role>,
flatShading: true })`, as in `src/render/level.js`, `src/render/player.js`,
`src/render/limb.js` and `src/render/hostiles.js`. `color: 0xffffff` is the one
literal the guard permits, and only as the identity base for an `InstancedMesh`
whose per-instance colors come from `setColorAt()` (§7). Every `*Map` property
above is §5 territory.

## MeshPhysicalMaterial (Advanced PBR)

Extends MeshStandardMaterial with advanced features.

HULLBREAKER: nothing below ships today. Clearcoat, transmission, sheen,
iridescence and anisotropy are all sub-pixel effects at the FAR default view
(decisions.md entry 7, RIG ~3.7% of screen height) and most of them want an
environment map to read at all (§5). Treat this whole section as reference for
a future operator-approved art direction, not as an available upgrade — and
note that every color below is written as a literal, which §2's guard rejects.

```javascript
const material = new THREE.MeshPhysicalMaterial({
  // All MeshStandardMaterial properties plus:

  // Clearcoat (car paint, lacquer)
  clearcoat: 1.0, // 0-1 clearcoat layer strength
  clearcoatRoughness: 0.1,
  clearcoatMap: ccTexture,
  clearcoatRoughnessMap: ccrTexture,
  clearcoatNormalMap: ccnTexture,
  clearcoatNormalScale: new THREE.Vector2(1, 1),

  // Transmission (glass, water)
  transmission: 1.0, // 0 = opaque, 1 = fully transparent
  transmissionMap: transTexture,
  thickness: 0.5, // Volume thickness for refraction
  thicknessMap: thickTexture,
  attenuationDistance: 1, // Absorption distance
  attenuationColor: new THREE.Color(0xffffff),

  // Refraction
  ior: 1.5, // Index of refraction (1-2.333)

  // Sheen (fabric, velvet)
  sheen: 1.0,
  sheenRoughness: 0.5,
  sheenColor: new THREE.Color(0xffffff),
  sheenColorMap: sheenTexture,
  sheenRoughnessMap: sheenRoughTexture,

  // Iridescence (soap bubbles, oil slicks)
  iridescence: 1.0,
  iridescenceIOR: 1.3,
  iridescenceThicknessRange: [100, 400],
  iridescenceMap: iridTexture,
  iridescenceThicknessMap: iridThickTexture,

  // Anisotropy (brushed metal)
  anisotropy: 1.0,
  anisotropyRotation: 0,
  anisotropyMap: anisoTexture,

  // Specular
  specularIntensity: 1,
  specularColor: new THREE.Color(0xffffff),
  specularIntensityMap: specIntTexture,
  specularColorMap: specColorTexture,
});
```

### Glass Material Example

```javascript
const glass = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  metalness: 0,
  roughness: 0,
  transmission: 1,
  thickness: 0.5,
  ior: 1.5,
  envMapIntensity: 1,
});
```

### Car Paint Example

```javascript
const carPaint = new THREE.MeshPhysicalMaterial({
  color: 0xff0000,
  metalness: 0.9,
  roughness: 0.5,
  clearcoat: 1,
  clearcoatRoughness: 0.1,
});
```

## MeshToonMaterial

Cel-shaded cartoon look.

```javascript
const material = new THREE.MeshToonMaterial({
  color: 0x00ff00,              // HULLBREAKER: literal — §2
  gradientMap: gradientTexture, // Optional: custom shading gradient
                                // HULLBREAKER: a DataTexture built in code is not
                                // an assets/ file, but switching a lit surface to
                                // toon shading is a look change → operator packet
                                // (§8), and it leaves the ACES value space (§3).
});

// Create step gradient texture
const colors = new Uint8Array([0, 128, 255]);
const gradientMap = new THREE.DataTexture(colors, 3, 1, THREE.RedFormat);
gradientMap.minFilter = THREE.NearestFilter;
gradientMap.magFilter = THREE.NearestFilter;
gradientMap.needsUpdate = true;
```

## MeshNormalMaterial

Visualize surface normals. Useful for debugging.

```javascript
const material = new THREE.MeshNormalMaterial({
  flatShading: false,
  wireframe: false,
});
```

## MeshDepthMaterial

Render depth values. Used for shadow maps, DOF effects.

```javascript
const material = new THREE.MeshDepthMaterial({
  depthPacking: THREE.RGBADepthPacking,
});
```

## PointsMaterial

For point clouds.

```javascript
const material = new THREE.PointsMaterial({
  color: 0xffffff,
  size: 0.1,
  sizeAttenuation: true, // Scale with distance
  map: pointTexture,
  alphaMap: alphaTexture,
  transparent: true,
  alphaTest: 0.5, // Discard pixels below threshold
  vertexColors: true, // Use per-vertex colors
});

const points = new THREE.Points(geometry, material);
```

## LineBasicMaterial & LineDashedMaterial

```javascript
// Solid lines
const lineMaterial = new THREE.LineBasicMaterial({
  color: 0xffffff,
  linewidth: 1, // Note: >1 only works on some systems
                // HULLBREAKER / r170: with WebGLRenderer linewidth is ALWAYS 1 —
                // the property is ignored. `linecap`/`linejoin` are ignored too.
                // Thick lines need Line2 from three/addons/lines/.
  linecap: "round",
  linejoin: "round",
});

// Dashed lines
const dashedMaterial = new THREE.LineDashedMaterial({
  color: 0xffffff,
  dashSize: 0.5,
  gapSize: 0.25,
  scale: 1,
});

// Required for dashed lines
const line = new THREE.Line(geometry, dashedMaterial);
line.computeLineDistances();
```

## ShaderMaterial

Custom GLSL shaders with Three.js uniforms.

HULLBREAKER: no shader material ships in this game. Before writing one, re-read
§6: it goes behind a `?flag=` that defaults off, leaves the default-URL frame
unchanged, and needs an operator checkpoint packet. And it opts out of the
scene's fog and tone mapping by default (`fog: true` + the fog chunks,
`toneMapped: true`), so without that it will not share the value space of the
flat-shaded world. The `time` uniform below must be driven render-side —
`performance` is a banned word in `src/pure/` and `src/sim/` (§1).

```javascript
const material = new THREE.ShaderMaterial({
  uniforms: {
    time: { value: 0 },
    color: { value: new THREE.Color(0xff0000) },
    texture1: { value: texture },
  },
  vertexShader: `
    varying vec2 vUv;
    uniform float time;

    void main() {
      vUv = uv;
      vec3 pos = position;
      pos.z += sin(pos.x * 10.0 + time) * 0.1;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  fragmentShader: `
    varying vec2 vUv;
    uniform vec3 color;
    uniform sampler2D texture1;

    void main() {
      // Use texture2D() for GLSL 1.0, texture() for GLSL 3.0 (glslVersion: THREE.GLSL3)
      vec4 texColor = texture2D(texture1, vUv);
      gl_FragColor = vec4(color * texColor.rgb, 1.0);
    }
  `,
  transparent: true,
  side: THREE.DoubleSide,
});

// Update uniform in animation loop
material.uniforms.time.value = clock.getElapsedTime();
```

### Built-in Uniforms (auto-provided)

```glsl
// Vertex shader
uniform mat4 modelMatrix;         // Object to world
uniform mat4 modelViewMatrix;     // Object to camera
uniform mat4 projectionMatrix;    // Camera projection
uniform mat4 viewMatrix;          // World to camera
uniform mat3 normalMatrix;        // For transforming normals
uniform vec3 cameraPosition;      // Camera world position

// Attributes
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
```

## RawShaderMaterial

Full control - no built-in uniforms/attributes.

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

## Common Material Properties

All materials share these base properties:

```javascript
// Visibility
material.visible = true;
material.transparent = false;
material.opacity = 1.0;
material.alphaTest = 0; // Discard pixels with alpha < value

// Rendering
material.side = THREE.FrontSide; // FrontSide, BackSide, DoubleSide
material.depthTest = true;
material.depthWrite = true;
material.colorWrite = true;

// Blending
material.blending = THREE.NormalBlending;
// NormalBlending, AdditiveBlending, SubtractiveBlending, MultiplyBlending, CustomBlending

// Stencil
material.stencilWrite = false;
material.stencilFunc = THREE.AlwaysStencilFunc;
material.stencilRef = 0;
material.stencilMask = 0xff;

// Polygon offset (z-fighting fix)
material.polygonOffset = false;
material.polygonOffsetFactor = 0;
material.polygonOffsetUnits = 0;

// Misc
material.dithering = false;
material.toneMapped = true;
```

## Multiple Materials

```javascript
// Assign different materials to geometry groups
// HULLBREAKER: six literals in a row — the exact shape §2's guard exists to
// catch. Per-face color in this repo comes from palette tokens, and per-copy
// color comes from InstancedMesh.setColorAt (see src/render/level.js).
const geometry = new THREE.BoxGeometry(1, 1, 1);
const materials = [
  new THREE.MeshBasicMaterial({ color: 0xff0000 }), // right
  new THREE.MeshBasicMaterial({ color: 0x00ff00 }), // left
  new THREE.MeshBasicMaterial({ color: 0x0000ff }), // top
  new THREE.MeshBasicMaterial({ color: 0xffff00 }), // bottom
  new THREE.MeshBasicMaterial({ color: 0xff00ff }), // front
  new THREE.MeshBasicMaterial({ color: 0x00ffff }), // back
];
const mesh = new THREE.Mesh(geometry, materials);

// Custom groups
geometry.clearGroups();
geometry.addGroup(0, 6, 0); // start, count, materialIndex
geometry.addGroup(6, 6, 1);
```

## Environment Maps

HULLBREAKER: **this entire section is out of bounds without an operator
decision in `docs/decisions.md`** (§5). Cube maps and HDRs are binary runtime
assets; the game ships none, boots with `assets/` deleted, and
`tools/assets/check.mjs` enforces that independence. The import specifier is
also corrected below: this repo's import map (`index.html`) provides
`three/addons/`, not `three/examples/jsm/`.

```javascript
// Load cube texture
const cubeLoader = new THREE.CubeTextureLoader();
const envMap = cubeLoader.load([
  "px.jpg",
  "nx.jpg", // positive/negative X
  "py.jpg",
  "ny.jpg", // positive/negative Y
  "pz.jpg",
  "nz.jpg", // positive/negative Z
]);

// Apply to material
material.envMap = envMap;
material.envMapIntensity = 1;

// Or set as scene environment (affects all PBR materials)
scene.environment = envMap;

// HDR environment (recommended)
// HULLBREAKER CORRECTION: upstream's "three/examples/jsm/..." does not resolve
// under this repo's import map. The mapped prefix is "three/addons/".
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
const rgbeLoader = new RGBELoader();
rgbeLoader.load("environment.hdr", (texture) => {
  texture.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = texture;
  scene.background = texture;
});
```

## Material Cloning and Modification

```javascript
// Clone material
const clone = material.clone();
clone.color.set(0x00ff00);      // HULLBREAKER: PAL token (§2). Note cloning also
                                // costs a draw call — prefer setColorAt (§7).

// Modify at runtime
material.color.set(0xff0000);   // HULLBREAKER: PAL token (§2). Runtime recolor of
                                // ANATOMY that reads as the body assembling or
                                // materializing is barred by decisions.md entry 3
                                // (§4); state colors on hostiles are fine and
                                // already tokenized in src/render/hostiles.js.
material.needsUpdate = true; // Only needed for some changes

// When needsUpdate is required:
// - Changing flat shading
// - Changing texture
// - Changing transparent
// - Custom shader code changes
```

## Performance Tips

1. **Reuse materials**: Same material = batched draw calls
2. **Avoid transparent when possible**: Transparent materials require sorting
3. **Use alphaTest instead of transparency**: When applicable, faster
4. **Choose simpler materials**: Basic > Lambert > Phong > Standard > Physical
5. **Limit active lights**: Each light adds shader complexity

```javascript
// Material pooling
// HULLBREAKER: this repo solved the same problem with InstancedMesh +
// setColorAt on a single 0xffffff-base material (src/render/level.js,
// limb.js, bullets.js, transform.js) — one draw call instead of one per color.
// Extend that before introducing a cache. The `color.toString(16)` key below
// would also be authored from literals, which §2 rejects.
const materialCache = new Map();
function getMaterial(color) {
  const key = color.toString(16);
  if (!materialCache.has(key)) {
    materialCache.set(key, new THREE.MeshStandardMaterial({ color }));
  }
  return materialCache.get(key);
}

// Dispose when done
material.dispose();
```

## See Also

- `threejs-textures` - Texture loading and configuration
- `threejs-shaders` - Custom shader development
- `threejs-lighting` - Light interaction with materials

HULLBREAKER: those sibling skills exist in the upstream pack; in this repo only
what has actually been installed under `.claude/skills/` is available, and each
carries its own guardrails section. Their subject matter is constrained here
the same way: textures by §5, shaders by §6, lighting by §3 (one fixed rig in
`src/render/scene.js`).

Repo checks to run before reporting material work:

```sh
node tools/pathcheck.mjs                      # must exit 0 — layer + palette guards
python3 -m http.server 8741                   # then http://127.0.0.1:8741/index.html
                                              # and index.html?selftest=1 (title = PASS)
```
