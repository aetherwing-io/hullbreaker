---
name: threejs-postprocessing
description: Three.js post-processing - EffectComposer, bloom, DOF, screen effects. Use when adding visual effects, color grading, blur, glow, or creating custom screen-space shaders. In HULLBREAKER this material applies only to `src/render/`, `src/ui/`, and `src/main.js`, and any EffectComposer pass must ship behind a `src/mode.js` query flag, off by default, with a measured frame-time comparison and an operator checkpoint packet — never enabled on the shipped URL.
---

## HULLBREAKER guardrails (read before using anything below)

Everything below the next heading is upstream reference material written for a
generic three.js app. It is accurate about the three.js API and wrong about this
repo's constraints. Read this section first; it wins on every conflict.

### 1. Where this material may legitimately live

Only these files may import `three` or `three/addons/postprocessing/*`:

- `src/render/scene.js` — owns the single `WebGLRenderer`, `scene`, `camera`,
  and light rig (`renderer` is constructed there at line 8 with
  `{ antialias: true }`, `toneMapping = ACESFilmicToneMapping` at line 11).
- `src/render/camera.js` — owns sizing: `handleResize()` calls
  `renderer.setSize(innerWidth, innerHeight)` and `calibrateEdges()`. It is
  registered exactly once, in `src/main.js:89` (`addEventListener('resize',
  handleResize)`).
- `src/main.js` — owns the one render call in the whole game:
  `renderer.render(scene, camera)` at line 383, inside `frame(t)`.
- other `src/render/*.js` (`bullets.js`, `hostiles.js`, `level.js`, `limb.js`,
  `tower.js`, `transform.js`, `capsules.js`, `player.js`, `mods.js`, `hook.js`,
  `fx.js`) and `src/ui/*.js`.

Never `src/pure/**` or `src/sim/**`. Never `src/config.js` (it is guarded as
part of the pure layer).

### 2. The rules that constrain it

- **Layer purity** (CLAUDE.md, "Hard rules"): `src/pure/` and `src/sim/` never
  reference THREE, `document`, or `window`. A composer, a pass, a uniform, or a
  resolution value must never appear there. Sim↔render crossings go through
  `src/sim/bridge.js` hooks.
- **Prototypes ship behind query flags, off by default** (CLAUDE.md, "Hard
  rules"). A composer is a prototype until an operator verdict says otherwise.
  Resolve the flag in `src/mode.js` next to `IS_G1` / `FLOW_ENABLED` and keep
  every shipped URL byte-identical to today.
- **`decisions.md` entry 7 — "View-scale verdict: FAR is the default"**: RIG
  renders at ≈3.7% of screen height and the entry records that the readability
  cost ("capsule glyphs, wasp tells read smaller at distance") is *accepted for
  now, with a follow-up to scale tells/glyphs up as an art/readability pass*.
  Bloom, DOF, film grain, halftone, chromatic aberration, and vignette all move
  that readability line at 3.7% RIG. That makes them operator feel questions,
  not agent judgments. Verdicts are law; do not re-litigate entry 7 — propose a
  new decision.
- **`decisions.md` entry 3 — static-anatomy render rule**: the creature's
  anatomy is monumental and static during transitions; the next stretch is
  *revealed*, never assembled. A screen-space effect must not be used to fake
  assembly, slam-in, or geometry arrival during a corner ritual or transform.
- **Pillar 5, "Chaos stays readable"** (CLAUDE.md): any pass that reduces
  silhouette or threat-tell legibility conflicts with a pillar. CLAUDE.md says
  stop and escalate to the operator rather than resolving a pillar conflict
  yourself.
- **Performance is a stated acceptance criterion**: `docs/DESIGN.md:556` —
  "60fps target with 200+ projectiles and the target traversal density";
  `SPRINT.md:19` repeats it. Every composer pass is one or more extra
  full-screen draws on top of that budget. `SPRINT.md`'s own T-011 accept line
  reads "60fps holds with 200+ projectiles + effects (**measure, don't
  assume**)". Measure.
- **Machine gates never judge fun** (CLAUDE.md): pathcheck passing says nothing
  about whether a bloom pass looks right. Post the packet, do not self-declare.
- **No build step, no runtime dependencies**: `three/addons/` *is* mapped in
  `index.html`'s import map (`https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/`),
  so `three/addons/postprocessing/EffectComposer.js` resolves at runtime with no
  npm and no bundler. Never run `npm install` for the game. Note the cost: each
  addon is an extra CDN module fetched at boot, and the playtest harness fails a
  run with `bootError` if the game does not reach a rendered frame within 8s
  (`tools/playtest/README.md:741`).
- **Determinism**: post-processing output must never feed back into simulation
  state. Drive time-varying uniforms from a render-side clock in `src/render/`
  or `src/main.js` (`performance.now()` is legal there and illegal in
  `src/pure/`/`src/sim/`).

### 3. What actually catches a violation (and what does not)

- **Caught statically**: `tools/pathcheck.mjs:107` defines
  `const banned = /\b(THREE|document|window|renderer|scene|addEventListener|requestAnimationFrame|innerWidth|innerHeight|devicePixelRatio|performance)\b/`
  and `guardLayer()` (just below it) runs that regex over comment-stripped
  `src/config.js` + `src/pure/*.js` + `src/sim/*.js`, then rejects any import
  that crosses a layer. Copy-pasting an upstream snippet containing
  `window.innerWidth`, `renderer`, or `composer.setSize` into a pure/sim file
  exits pathcheck with status 1. Run `node tools/pathcheck.mjs` — it must exit 0.
- **NOT caught — be honest about this**: nothing in `tools/pathcheck.mjs`
  detects a composer wired into the default render path. `src/render/*` is not
  import-guarded, and `src/main.js:469`'s self-test check
  (`renderer.info.render.frame > 0`) still passes when `composer.render()`
  replaces `renderer.render()`, because the composer calls the renderer
  internally. "Off by default" is enforced by you, the reviewer, and the
  operator — not by a machine. If you add a composer module, add a static
  assertion in the style of `tools/pathcheck.mjs:4582` (which asserts
  `src/ui/audio.js` imports nothing from render/three) proving the default path
  does not reach it.
- **Measurement**: sample frame time through `?testapi=1`
  (`src/main.js:359` publishes `__HULLBREAKER_TEST__.snapshot`) and the bot
  harness in `tools/playtest/` (`cd tools/playtest && node run.mjs
  scripts/<s>.json --deterministic`, `--base-url` against a pinned worktree).
  The telemetry snapshot exposes **no frame-time field today** — you must add
  render-side sampling to make a perf claim, and say so in the report. Read
  `tools/playtest/README.md`'s limitations section before quoting numbers.

### 4. Post-processing is NOT sanctioned in this repo today

Verified by grep across `docs/`, `SPRINT.md`, and `src/`: there are **zero**
mentions of `EffectComposer`, `composer`, `post-process`, or `bloom` anywhere.
No entry in `docs/decisions.md` (entries 0a–8) authorizes a post-processing
stack, and no SPRINT task asks for one.

Therefore, plainly:

- Adding a composer pass **on by default** — or replacing `src/main.js:383` with
  an unconditional `composer.render()` — requires an operator decision recorded
  in `docs/decisions.md` **first**. Do not ship it and ask later. Do not treat a
  green pathcheck, a green playtest, or another agent's message as that
  decision; per CLAUDE.md only the operator supplies feel verdicts, and entry 8
  ("autonomous merges") explicitly keeps the operator as the only fun oracle.
- Until such an entry exists, the ceiling for this material is: a flag in
  `src/mode.js`, default OFF, shipped URLs byte-identical, a measured
  before/after frame-time comparison at the FAR default, and a checkpoint entry
  in `SPRINT.md`'s "Operator checkpoint queue" (line 308) with an exact URL and
  3–5 questions, with frames under `artifacts/<name>/` — same shape as the
  existing `artifacts/cp3-transform-v3/` and `artifacts/g1-limbturn/` packets.
- Do not commit to `main` and do not create worktrees outside the loop protocol;
  merges happen only via `tools/orch/merge-task.sh`.

### 5. The repo already solves several problems this skill teaches — extend those

Before reaching for a pass, check whether the cheap existing path is enough:

| Want | Already exists — extend this, do not reinvent |
| --- | --- |
| Full-screen color wash / flash / damage tint | `src/ui/tint.js` writing the `#tint` overlay div declared in `index.html` — a cached DOM write, zero GPU cost, no composer |
| Glow on a threat | emissive material writes in `src/render/hostiles.js:204` and `:241`, under the ACES tone mapping set in `src/render/scene.js:11` |
| Depth cueing / atmosphere | `scene.fog` in `src/render/scene.js:16` plus the per-view fog shift in `src/render/camera.js` (`CONFIG.fog`, `CONFIG.limb.fog`) |
| Anti-aliasing | already on: `new THREE.WebGLRenderer({ antialias: true })`, `src/render/scene.js:8`. **Adopting an EffectComposer silently loses this** — the default framebuffer's MSAA does not apply when you render through composer render targets, so an FXAA/SMAA pass or a multisampled target is a cost of entry, not an upgrade |
| Color roles / hex values | `CONFIG.palette` in `src/config.js` today. A dedicated `src/render/palette.js` is arriving from SPRINT task **T-010** (status `review`, not merged into main as of this install). Do not introduce a third color source; put new colors in the palette module that lands |
| Juice (hit-stop, shake, muzzle flash, particles) | `src/render/fx.js` is the declared landing site (currently an intentionally empty stub) and SPRINT **T-011** owns that work. Coordinate through the integrator instead of opening a parallel effects path |
| Screen-space "juice" that changes gameplay timing | must live sim-side behind `src/sim/bridge.js` hooks, never in a pass |

### 6. Query-flag pattern to copy

`src/mode.js` is the single place run-mode flags resolve. Follow the shape of
`IS_G1` (a render-only experiment: "Render-only: it selects the limb bake …
The fixtures own their own transitions, so the flag is a normal-run flag
only.") or `FLOW_ENABLED`. Default OFF, documented in the comment block, and
the absent-flag path byte-identical to today.

---

# Three.js Post-Processing

## Quick Start

```javascript
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

// Setup composer
// HULLBREAKER: `renderer`, `scene`, `camera` are singletons exported from
// src/render/scene.js — import them, never construct a second renderer.
// Constructing the composer at module scope means it exists on every URL;
// build it lazily inside a `if (POST_ENABLED)` branch (flag from src/mode.js)
// so the shipped default path allocates no extra render targets.
const composer = new EffectComposer(renderer);

// Render scene
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// Add bloom
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.5, // strength
  0.4, // radius
  0.85, // threshold
);
composer.addPass(bloomPass);

// Animation loop - use composer instead of renderer
function animate() {
  requestAnimationFrame(animate);
  // HULLBREAKER: the game's one render call is src/main.js:383,
  // `renderer.render(scene, camera)`, inside frame(t). Replacing it
  // unconditionally = on by default = violates CLAUDE.md's "Prototypes ship
  // behind query flags, off by default" and needs a docs/decisions.md entry
  // first. Branch: POST_ENABLED ? composer.render() : renderer.render(scene, camera).
  composer.render(); // NOT renderer.render()
}
```

## EffectComposer Setup

```javascript
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";

const composer = new EffectComposer(renderer);

// First pass: render scene
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// Add more passes...
composer.addPass(effectPass);

// Last pass should render to screen
effectPass.renderToScreen = true; // Default for last pass

// Handle resize
// HULLBREAKER: resize is already owned — handleResize() in src/render/camera.js,
// registered once at src/main.js:89. Add `composer.setSize(...)` inside that
// function; do not add a second window resize listener, and never let
// innerWidth/innerHeight/window reach src/pure or src/sim (tools/pathcheck.mjs:107
// `banned` regex exits 1 on those identifiers there).
function onResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height);
  composer.setSize(width, height);
}
```

## Common Effects

### Bloom (Glow)

```javascript
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

// HULLBREAKER: bloom over the FAR default view (decisions.md entry 7, RIG ≈3.7%
// of screen height) directly trades against the readability cost that entry
// already flagged as accepted-pending-an-art-pass, and against pillar 5 "Chaos
// stays readable". Operator feel question — post a packet, do not self-judge.
// It is also the most expensive common pass (multi-mip blur); measure it against
// docs/DESIGN.md:556's "60fps with 200+ projectiles".
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.5, // strength - intensity of glow
  0.4, // radius - spread of glow
  0.85, // threshold - brightness threshold
);

composer.addPass(bloomPass);

// Adjust at runtime
bloomPass.strength = 2.0;
bloomPass.threshold = 0.5;
bloomPass.radius = 0.8;
```

### Selective Bloom

Apply bloom only to specific objects.

```javascript
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

// Layer setup
const BLOOM_LAYER = 1;
const bloomLayer = new THREE.Layers();
bloomLayer.set(BLOOM_LAYER);

// Mark objects to bloom
glowingMesh.layers.enable(BLOOM_LAYER);

// Dark material for non-blooming objects
// HULLBREAKER: raw hex literals belong in the palette module (CONFIG.palette in
// src/config.js today; src/render/palette.js once SPRINT T-010 merges), not
// scattered through render files — T-010's accept line is "color tokens
// centralized (one palette module, not scattered hex literals)".
const darkMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
const materials = {};

function darkenNonBloomed(obj) {
  if (obj.isMesh && !bloomLayer.test(obj.layers)) {
    materials[obj.uuid] = obj.material;
    obj.material = darkMaterial;
  }
}

function restoreMaterial(obj) {
  if (materials[obj.uuid]) {
    obj.material = materials[obj.uuid];
    delete materials[obj.uuid];
  }
}

// Custom render loop
// HULLBREAKER: this pattern costs TWO full scene draws plus two whole-scene
// traversals per frame, on top of the instanced bullet/hostile updates in
// src/render/bullets.js and src/render/hostiles.js. Against the 200+ projectile
// budget this is the single most likely 60fps regression in this document.
// Measure before proposing it; the cheaper local answer is the emissive writes
// already used at src/render/hostiles.js:204.
function render() {
  // Render bloom pass
  scene.traverse(darkenNonBloomed);
  composer.render();
  scene.traverse(restoreMaterial);

  // Render final scene over bloom
  renderer.render(scene, camera);
}
```

### FXAA (Anti-Aliasing)

```javascript
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";

// HULLBREAKER: this is not an upgrade here — src/render/scene.js:8 already
// creates the renderer with { antialias: true } (MSAA on the default
// framebuffer), which stops applying once you draw through composer render
// targets. An AA pass is the price of admission for any composer, and it must
// be included in the frame-time comparison you show the operator.
const fxaaPass = new ShaderPass(FXAAShader);
fxaaPass.material.uniforms["resolution"].value.set(
  1 / window.innerWidth,
  1 / window.innerHeight,
);

composer.addPass(fxaaPass);

// Update on resize
function onResize() {
  fxaaPass.material.uniforms["resolution"].value.set(
    1 / window.innerWidth,
    1 / window.innerHeight,
  );
}
```

### SMAA (Better Anti-Aliasing)

```javascript
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";

// HULLBREAKER / API NOTE (three 0.170.0, pinned in index.html's import map):
// recent three.js releases simplified SMAAPass to `new SMAAPass()` and size it
// via composer.setSize(); the width/height arguments below are legacy and may
// be ignored. Verify against the pinned 0.170.0 build before relying on them.
const smaaPass = new SMAAPass(
  window.innerWidth * renderer.getPixelRatio(),
  window.innerHeight * renderer.getPixelRatio(),
);

composer.addPass(smaaPass);
```

### SSAO (Ambient Occlusion)

```javascript
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";

// HULLBREAKER: SSAO re-renders the scene into depth+normal buffers — a second
// geometry pass. At the FAR default with heavy instancing this is a large,
// unmeasured cost, and the environment's read is currently carried by fog
// (src/render/scene.js:16) and the limb bake (src/render/limb.js). Prototype
// behind a flag with numbers, or not at all.
const ssaoPass = new SSAOPass(
  scene,
  camera,
  window.innerWidth,
  window.innerHeight,
);
ssaoPass.kernelRadius = 16;
ssaoPass.minDistance = 0.005;
ssaoPass.maxDistance = 0.1;

composer.addPass(ssaoPass);

// Output modes
ssaoPass.output = SSAOPass.OUTPUT.Default;
// SSAOPass.OUTPUT.Default - Final composited output
// SSAOPass.OUTPUT.SSAO - Just the AO
// SSAOPass.OUTPUT.Blur - Blurred AO
// SSAOPass.OUTPUT.Depth - Depth buffer
// SSAOPass.OUTPUT.Normal - Normal buffer
```

### Depth of Field (DOF)

```javascript
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";

// HULLBREAKER: DOF blurs exactly the thing decisions.md entry 7 already
// accepted as harder to read at FAR (wasp tells, capsule glyphs). Blurring
// approaching threats is a pillar-5 ("Chaos stays readable") conflict —
// CLAUDE.md says escalate rather than resolve that yourself.
const bokehPass = new BokehPass(scene, camera, {
  focus: 10.0, // Focus distance
  aperture: 0.025, // Aperture (smaller = more DOF)
  maxblur: 0.01, // Max blur amount
});

composer.addPass(bokehPass);

// Update focus dynamically
// HULLBREAKER: derive focus from render-side camera state (src/render/camera.js),
// never by reading or writing sim rows — the sim stays 2D (s, y) and unaware.
bokehPass.uniforms["focus"].value = distanceToTarget;
```

### Film Grain

```javascript
import { FilmPass } from "three/addons/postprocessing/FilmPass.js";

// API NOTE (three 0.170.0): FilmPass was simplified in recent releases to
// `new FilmPass(intensity, grayscale)` — the scanline arguments below are the
// legacy 4-arg form and may be ignored by the pinned build. Verify before use.
const filmPass = new FilmPass(
  0.35, // noise intensity
  0.5, // scanline intensity
  648, // scanline count
  false, // grayscale
);

composer.addPass(filmPass);
```

### Vignette

```javascript
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { VignetteShader } from "three/addons/shaders/VignetteShader.js";

// HULLBREAKER: a static vignette is one of the cheapest passes here, but the
// repo already has a zero-GPU-cost full-screen overlay — src/ui/tint.js writing
// the #tint div declared in index.html. Prefer extending that (a CSS radial
// gradient) over standing up an EffectComposer for a vignette alone.
const vignettePass = new ShaderPass(VignetteShader);
vignettePass.uniforms["offset"].value = 1.0; // Vignette size
vignettePass.uniforms["darkness"].value = 1.0; // Vignette intensity

composer.addPass(vignettePass);
```

### Color Correction

```javascript
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { ColorCorrectionShader } from "three/addons/shaders/ColorCorrectionShader.js";

// HULLBREAKER: global color grading collides with the palette lane (SPRINT
// T-010: DESIGN's ≤8 color roles, fog matched to background, judged against
// boards 01/10/13 in docs/concept-art/). Grade the palette at the source, not
// with a screen pass that invalidates every board comparison.
const colorPass = new ShaderPass(ColorCorrectionShader);
colorPass.uniforms["powRGB"].value = new THREE.Vector3(1.2, 1.2, 1.2); // Power
colorPass.uniforms["mulRGB"].value = new THREE.Vector3(1.0, 1.0, 1.0); // Multiply

composer.addPass(colorPass);
```

### Gamma Correction

```javascript
import { GammaCorrectionShader } from "three/addons/shaders/GammaCorrectionShader.js";

// API NOTE (three 0.170.0): GammaCorrectionShader is the legacy final pass. The
// current recommendation is `OutputPass` from
// three/addons/postprocessing/OutputPass.js, which applies tone mapping AND
// output color-space conversion. This matters here specifically: src/render/
// scene.js:11 sets renderer.toneMapping = ACESFilmicToneMapping, and that tone
// mapping is NOT applied when the scene renders into a composer target — so a
// naive composer swap changes the shipped look before any effect is added.
// Use OutputPass last, and treat any resulting look change as an operator
// question, not a fix.
const gammaPass = new ShaderPass(GammaCorrectionShader);
composer.addPass(gammaPass);
```

### Pixelation

```javascript
import { RenderPixelatedPass } from "three/addons/postprocessing/RenderPixelatedPass.js";

// HULLBREAKER: RenderPixelatedPass REPLACES RenderPass (it renders the scene
// itself). It is also a whole-game art-direction change — the concept boards
// (docs/concept-art/README.md, boards 10/11/13/14) are the visual ground truth
// and none of them are pixel art. Not an agent decision.
const pixelPass = new RenderPixelatedPass(6, scene, camera); // 6 = pixel size

composer.addPass(pixelPass);
```

### Glitch Effect

```javascript
import { GlitchPass } from "three/addons/postprocessing/GlitchPass.js";

// HULLBREAKER: GlitchPass randomizes internally (its own Math.random-driven
// jitter). That is fine ONLY because it is render-side and never touches sim
// state — the determinism rule bans Math.random in src/pure and src/sim, and a
// pass must never feed back into gameplay. Also: glitch-as-transition would
// read as geometry arriving/failing, which decisions.md entry 3 rules against
// for the creature's own anatomy.
const glitchPass = new GlitchPass();
glitchPass.goWild = false; // Continuous glitching

composer.addPass(glitchPass);
```

### Halftone

```javascript
import { HalftonePass } from "three/addons/postprocessing/HalftonePass.js";

// HULLBREAKER: a full-screen stylization pass — same class of decision as
// pixelation. Boards 10/11/13/14 lead environment form; compare against them,
// "not your taste" (CLAUDE.md, source-of-truth item 5).
const halftonePass = new HalftonePass(window.innerWidth, window.innerHeight, {
  shape: 1, // 1 = dot, 2 = ellipse, 3 = line, 4 = square
  radius: 4, // Dot size
  rotateR: Math.PI / 12,
  rotateB: (Math.PI / 12) * 2,
  rotateG: (Math.PI / 12) * 3,
  scatter: 0,
  blending: 1,
  blendingMode: 1,
  greyscale: false,
});

composer.addPass(halftonePass);
```

### Outline

```javascript
import { OutlinePass } from "three/addons/postprocessing/OutlinePass.js";

// HULLBREAKER: of everything in this file, outlining is the pass most aligned
// with pillar 5 ("Chaos stays readable") and entry 7's open follow-up — "scale
// tells/glyphs up as an art/readability pass" at the FAR default. It is still
// unsanctioned: flag-gated, measured, and packet-judged like the rest. Note
// OutlinePass re-renders selected objects into depth/mask buffers, so cost
// scales with selectedObjects — do not point it at every hostile at once
// without numbers.
const outlinePass = new OutlinePass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  scene,
  camera,
);

outlinePass.edgeStrength = 3;
outlinePass.edgeGlow = 0;
outlinePass.edgeThickness = 1;
outlinePass.pulsePeriod = 0;
// HULLBREAKER: palette tokens, not literals — see CONFIG.palette / T-010.
outlinePass.visibleEdgeColor.set(0xffffff);
outlinePass.hiddenEdgeColor.set(0x190a05);

// Select objects to outline
outlinePass.selectedObjects = [mesh1, mesh2];

composer.addPass(outlinePass);
```

## Custom ShaderPass

Create your own post-processing effects.

```javascript
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

const CustomShader = {
  uniforms: {
    tDiffuse: { value: null }, // Required: input texture
    time: { value: 0 },
    intensity: { value: 1.0 },
  },
  vertexShader: `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float intensity;
    varying vec2 vUv;

    void main() {
      vec2 uv = vUv;

      // Wave distortion
      uv.x += sin(uv.y * 10.0 + time) * 0.01 * intensity;

      vec4 color = texture2D(tDiffuse, uv);
      gl_FragColor = color;
    }
  `,
};

const customPass = new ShaderPass(CustomShader);
composer.addPass(customPass);

// Update in animation loop
// HULLBREAKER: a THREE.Clock / performance.now() source is legal in src/render
// and src/main.js and ILLEGAL in src/pure and src/sim (tools/pathcheck.mjs:107
// bans `performance` there, and CLAUDE.md's determinism rule bans Date.now /
// performance.now outright in those layers). Drive uniforms from the render
// clock; if an effect must follow sim time, read the existing gameMs telemetry
// through a bridge hook rather than sampling wall-clock inside the sim.
customPass.uniforms.time.value = clock.getElapsedTime();
```

### Invert Colors Shader

```javascript
const InvertShader = {
  uniforms: {
    tDiffuse: { value: null },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      gl_FragColor = vec4(1.0 - color.rgb, color.a);
    }
  `,
};
```

### Chromatic Aberration

```javascript
// HULLBREAKER: chromatic aberration at RIG ≈3.7% of screen height (the FAR
// default, decisions.md entry 7) smears exactly the small tells entry 7 already
// flagged as marginal. Readability regression risk — packet it, do not ship it.
const ChromaticAberrationShader = {
  uniforms: {
    tDiffuse: { value: null },
    amount: { value: 0.005 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float amount;
    varying vec2 vUv;

    void main() {
      vec2 dir = vUv - 0.5;
      float dist = length(dir);

      float r = texture2D(tDiffuse, vUv - dir * amount * dist).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv + dir * amount * dist).b;

      gl_FragColor = vec4(r, g, b, 1.0);
    }
  `,
};
```

## Combining Multiple Effects

```javascript
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";
import { VignetteShader } from "three/addons/shaders/VignetteShader.js";
import { GammaCorrectionShader } from "three/addons/shaders/GammaCorrectionShader.js";

// HULLBREAKER: five passes = five extra full-screen draws every frame, judged
// against "60fps with 200+ projectiles" (docs/DESIGN.md:556, SPRINT.md:19).
// A stack this size is not a starting point here; if you propose one, the
// report must carry measured before/after frame times, not an assurance.
const composer = new EffectComposer(renderer);

// 1. Render scene
composer.addPass(new RenderPass(scene, camera));

// 2. Bloom
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.5,
  0.4,
  0.85,
);
composer.addPass(bloomPass);

// 3. Vignette
const vignettePass = new ShaderPass(VignetteShader);
vignettePass.uniforms["offset"].value = 0.95;
vignettePass.uniforms["darkness"].value = 1.0;
composer.addPass(vignettePass);

// 4. Gamma correction
// HULLBREAKER / API NOTE: prefer OutputPass here on three 0.170.0 — it restores
// the ACES tone mapping configured at src/render/scene.js:11, which a composer
// otherwise drops.
composer.addPass(new ShaderPass(GammaCorrectionShader));

// 5. Anti-aliasing (always last before output)
const fxaaPass = new ShaderPass(FXAAShader);
fxaaPass.uniforms["resolution"].value.set(
  1 / window.innerWidth,
  1 / window.innerHeight,
);
composer.addPass(fxaaPass);
```

## Render to Texture

```javascript
// HULLBREAKER: legitimate and composer-free — this is the tool for an in-world
// screen/monitor texture. It still mutates shared renderer state
// (setRenderTarget), so always restore to null in the same frame, as below,
// before src/main.js:383's render call runs.
// Create render target
const renderTarget = new THREE.WebGLRenderTarget(512, 512);

// Render scene to target
renderer.setRenderTarget(renderTarget);
renderer.render(scene, camera);
renderer.setRenderTarget(null);

// Use texture
const texture = renderTarget.texture;
otherMaterial.map = texture;
```

## Multi-Pass Rendering

```javascript
// HULLBREAKER: this pattern flips renderer.autoClear, shared global state on
// the single renderer exported by src/render/scene.js. If it is ever left
// false, unrelated modules (bullets, hostiles, HUD-adjacent render) inherit a
// broken clear. Two composers also doubles the render-target memory. Not a
// starting point for a 2.5D side-scroller with one scene.
// Multiple composers for different scenes/layers
const bgComposer = new EffectComposer(renderer);
bgComposer.addPass(new RenderPass(bgScene, camera));

const fgComposer = new EffectComposer(renderer);
fgComposer.addPass(new RenderPass(fgScene, camera));
fgComposer.addPass(bloomPass);

// Combine in render loop
function animate() {
  // Render background without clearing
  renderer.autoClear = false;
  renderer.clear();

  bgComposer.render();

  // Render foreground over it
  renderer.clearDepth();
  fgComposer.render();
}
```

## WebGPU Post-Processing (Three.js r150+)

```javascript
// HULLBREAKER: UNUSABLE AS WRITTEN — and the API here is wrong for 0.170.0.
// (1) index.html's import map maps only "three" (the WebGL build,
//     three.module.js) and "three/addons/". "three/webgpu" and "three/tsl" are
//     NOT mapped, so these imports fail to resolve; adding them means editing
//     the import map, which changes the shipped page for every URL.
// (2) In 0.170.0 the node-based post-processing stack lives in `three/webgpu`
//     (THREE.PostProcessing, WebGPURenderer) with TSL nodes from `three/tsl` —
//     not in "three/addons/nodes/Nodes.js" as shown.
// (3) It implies swapping the WebGLRenderer constructed at src/render/scene.js:8
//     for a WebGPURenderer. A renderer swap is a whole-project decision with
//     browser-support and determinism consequences: docs/decisions.md entry
//     first, and it is nowhere near any current SPRINT task.
// (4) The snippet also shadows its own `postProcessing` import with a const.
import { postProcessing } from "three/addons/nodes/Nodes.js";
import { pass, bloom, dof } from "three/addons/nodes/Nodes.js";

// Using node-based system
const scenePass = pass(scene, camera);
const bloomNode = bloom(scenePass, 0.5, 0.4, 0.85);

const postProcessing = new THREE.PostProcessing(renderer);
postProcessing.outputNode = bloomNode;

// Render
function animate() {
  postProcessing.render();
}
```

## Performance Tips

1. **Limit passes**: Each pass adds a full-screen render
2. **Lower resolution**: Use smaller render targets for blur passes
3. **Disable unused effects**: Toggle passes on/off
4. **Use FXAA over MSAA**: Less expensive anti-aliasing
5. **Profile with DevTools**: Check GPU usage

<!-- HULLBREAKER: "Profile with DevTools" is not sufficient evidence here.
     SPRINT.md T-011: "60fps holds with 200+ projectiles + effects (measure,
     don't assume)", verified via `?testapi=1` (src/main.js:359) plus the bot
     harness in tools/playtest/ (`node run.mjs scripts/<s>.json --deterministic`,
     `--base-url` against a pinned worktree). The telemetry snapshot has no
     frame-time field today — add render-side sampling and disclose it, per
     CLAUDE.md's "honesty/limitations note for anything approximate". -->

```javascript
// Disable pass
bloomPass.enabled = false;

// Reduce bloom resolution
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2),
  strength,
  radius,
  threshold,
);

// Only apply effects in high-performance scenarios
// HULLBREAKER: a device-sniffed branch is acceptable ONLY render-side and ONLY
// if it cannot change gameplay — the sim must produce identical (s, y) results
// on every device, and navigator/userAgent has no business in src/pure or
// src/sim. Prefer an explicit query flag (src/mode.js) over UA sniffing so a
// playtest run and an operator packet are reproducible.
const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
if (!isMobile) {
  composer.addPass(expensivePass);
}
```

## Handle Resize

```javascript
// HULLBREAKER: do NOT add this listener. src/main.js:89 already registers the
// single resize listener, which calls handleResize() in src/render/camera.js
// (camera.aspect, updateProjectionMatrix, renderer.setSize, calibrateEdges).
// Add composer.setSize() and any pass-resolution updates inside that existing
// function; a second listener double-calibrates the edge probes the sim's
// screen-edge margins depend on.
function onWindowResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const pixelRatio = renderer.getPixelRatio();

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height);
  composer.setSize(width, height);

  // Update pass-specific resolutions
  if (fxaaPass) {
    fxaaPass.material.uniforms["resolution"].value.set(
      1 / (width * pixelRatio),
      1 / (height * pixelRatio),
    );
  }

  if (bloomPass) {
    bloomPass.resolution.set(width, height);
  }
}

window.addEventListener("resize", onWindowResize);
```

## See Also

<!-- HULLBREAKER: these are sibling skills from the upstream pack; only the ones
     actually present under .claude/skills/ in this repo are available. -->

- `threejs-shaders` - Custom shader development
- `threejs-textures` - Render targets
- `threejs-fundamentals` - Renderer setup
