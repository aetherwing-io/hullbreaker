---
name: threejs-animation
description: Three.js animation - keyframe animation, skeletal animation, morph targets, animation mixing. Use when animating objects, playing GLTF animations, creating procedural motion, or blending animations. In HULLBREAKER this is reference-only for the sanctioned moving pieces (camera ratchet curves, hinged plates/vent covers, traps and enemies) — the Meridian's own anatomy is static by operator verdict (docs/decisions.md entry 3) and none of the mixer/skeletal/morph material below may be applied to it.
---

## HULLBREAKER guardrails (read before using anything below)

**The single fact that governs this whole skill:** `docs/decisions.md` **entry 3
(2026-07-30, CP3 verdict)** is law and is never re-litigated. It states that
"the creature's anatomy is monumental and **static** during a transition — RIG
and the camera are what move. The next stretch of world already exists and is
*revealed* ... never *assembled*, slammed, or articulated into place." Its
addendum narrows the rule precisely: "the creature's own body never assembles,
but things the ship *builds* (traps, emplacements, later defenders) may."
`CLAUDE.md` restates it as the **Static-anatomy render rule** and enumerates the
only things allowed to move: "doors, access plates, vent covers, shutters,
traps, and Crown mechanisms."

So: an `AnimationMixer`, a skeleton, or a morph target driving *world anatomy*
(hull, scutes, ribs, facets, joints, the limb, the tower's faces, the Crown's
mass) is a **direct violation of a recorded operator verdict**, not a style
disagreement. Do not do it, do not prototype it behind a flag, do not do it
"just to see." If you believe a case needs it, stop and escalate: it requires a
**new operator decision recorded in `docs/decisions.md`** before any code lands.

### Where motion legitimately lives in this repo (verified paths)

| Sanctioned motion | Curve (pure, deterministic) | Renderer that samples it |
| --- | --- | --- |
| Corner-ritual camera ratchet (two-snap detent yaw) | `src/pure/waves.js` — `easeOutBack(u, s)`, `cornerYawDeltaDeg(tMs, cfg)`, `cornerScrollVel(tMs, cfg)` | `src/render/camera.js` |
| Transform-ritual camera yaw + scroll resume | `src/pure/transform.js` — `transformYawDeltaDeg`, `transformScrollVel` | `src/render/camera.js` |
| The tagged plate beat: hinged access plate, blown vent cover, pressure vapor | `src/pure/transform.js` — `transformPanelState`, `transformCoverAjar`, `transformVapor` | `src/render/transform.js`, section `/* covers that move */` |
| The G1 limb: **static bake, no motion at all** | `src/pure/limb.js` — `limbBakePlan(CONFIG, groundH)` | `src/render/limb.js` (`?g1=1`) |
| Zip-assembly choreography (retired from the world, kept extractable for traps/emplacements per entry 3's addendum) | `src/pure/waves.js` — `zipperOffset(tMs, colIdx, cfg)` | `src/render/level.js` `zipperColumn`, driven from `src/sim/wavegate.js` |

`src/render/limb.js` says it in its own header: "THE LIMB NEVER MOVES. Every box
here is placed once from the pure bake plan (`../pure/limb.js`) ... there is no
per-frame hook, no ritual hook, and no build hook in this module, by
construction." `src/render/transform.js` says the complementary thing: "An
opening in the anatomy pre-exists; its cover is the one piece of the body
allowed to move, and it never leaves the world."

**Extend these, do not reinvent them.** The repo already solved "chunky,
weighted, two-detent motion" — it is `easeOutBack` in `src/pure/waves.js`,
sampled by the camera. A new beat should be a new closed-form function of `tMs`
next to those, asserted in `tools/pathcheck.mjs`, not a new `AnimationClip`.

### The guards that will catch you

1. **Layer purity** — `tools/pathcheck.mjs` (grep it for `const banned =`; the
   file churns, so search rather than trust a line number) runs `guardLayer('pure', …)`
   and `guardLayer('sim', …)` with
   `const banned = /\b(THREE|document|window|renderer|scene|addEventListener|requestAnimationFrame|innerWidth|innerHeight|devicePixelRatio|performance)\b/;`
   over comment-stripped source, and rejects any import that crosses layers
   (pure may import only `../config.js` or `./x.js`; sim adds `../mode.js` and
   `../pure/x.js`). Every `THREE.*` symbol in this document — `Clock`,
   `AnimationMixer`, `AnimationClip`, `KeyframeTrack`, `Quaternion` — is
   therefore illegal in `src/pure/` and `src/sim/`. So is `performance.now()`.
   Only `src/render/`, `src/ui/`, and `src/main.js` may touch THREE.
2. **The anti-animation guard on the limb** — `tools/pathcheck.mjs`, section
   "G1: the limb read of the tower" (grep for `cannot be animated cannot
   assemble`), reads the source files and asserts:
   - `!/\bgameMs\b|\btMs\b|\bdt\b|Math\.random/` over `src/pure/limb.js` —
     *"src/pure/limb.js takes no time or randomness argument: a body that cannot
     be animated cannot assemble (CP3 ruling)"*;
   - `!/installView|view\./` over `src/render/limb.js` — *"src/render/limb.js
     installs no view hook at all: no per-frame, ritual or build callback can
     move the limb."*
   Adding a mixer, a clock, or a bridge hook to either file fails the headless
   gate immediately. Run `node tools/pathcheck.mjs`; it must exit 0.
3. **Determinism** — randomness only via `src/pure/rng.js` (`mulberry32`); no
   `Math.random`, `Date.now`, or `performance.now` in `src/pure/` or `src/sim/`.
   Note honestly: the generic layer regex catches `performance` but **not**
   `Math.random`/`Date.now` outside the limb-specific guard above — the rule
   still binds you where pathcheck cannot see it. The gameplay clock is
   `gameMs` in `src/sim/time.js`, advanced by `advanceGameMs(dt*1000)` from
   `src/main.js`; `?fixeddt=<ms>` in `src/main.js` exists so a run reproduces
   frame-for-frame. A mixer accumulating its own wall-clock time silently breaks
   that contract for anything gameplay-visible.
4. **One loop only** — `src/main.js` owns the single `requestAnimationFrame`
   loop (`frame`) and the single `performance.now()` call. Do not start a second
   loop or a second clock; sample your curve inside the existing frame.
5. **Sim↔render crossings** — presentation is notified through the hook table in
   `src/sim/bridge.js` (`installView({ … })`; groups `player`, `hostiles`,
   `bullets`, `level`, `corner`, `transform`, `mods`, `hook`). "A hook must never
   write sim state or the headless run diverges from the played run." Animation
   driven by a hook is presentation; it may not feed anything back.
6. **No build step, no runtime dependencies** — three.js 0.170.0 arrives via the
   CDN import map in `index.html`, which maps both `three` and `three/addons/`.
   There is no bundler and no package manager for the game (dev-only deps are
   allowed under `tools/*/` only). Upstream `three/examples/jsm/...` specifiers
   **do not resolve here**; use `three/addons/...`. Shipping a `.glb` with baked
   clips also adds a runtime asset fetch — `assets/` staging plus
   `assets/manifest.json` exist (decisions entry 8 opened the asset lane), but a
   loader path for animated models is not currently part of the game and would
   need its own task, not an ad-hoc `GLTFLoader` call.
7. **Machine gates never judge fun** — any motion you add is a feel question.
   It ships behind a query flag, off by default, and goes to `SPRINT.md`'s
   operator checkpoint queue with an exact URL and 3–5 questions. Never
   self-declare motion "good," "juicy," or "chonky."

### Status of the three.js animation system in this repo, today

Nothing in `src/` uses `AnimationMixer`, `AnimationClip`, any `KeyframeTrack`,
`SkinnedMesh`, `Skeleton`, morph targets, or `GLTFLoader` — verified by grep
across `src/`, `tools/`, and `index.html`. All shipped motion is closed-form
`f(tMs) → value` in `src/pure/`, sampled by the renderer. Introducing the mixer
system at all is therefore an architecture change, not a local edit: propose it
as a task, name what it buys, and expect the static-anatomy rule to constrain
where it may point. **Sanctioned targets if it is ever adopted: RIG, enemies,
traps/emplacements, and Crown mechanisms — never the body you are climbing.**

### Reading the rest of this document

The body below is the upstream `cloudai-x/threejs-skills` reference, preserved
for its API detail. Inline `// HULLBREAKER:` comments mark the places where the
example as written would break a rule here. One upstream import specifier was
corrected for this repo's import map (noted at the site). Treat every example
as API documentation, not as a recommended pattern for this codebase.

---

# Three.js Animation

## Quick Start

```javascript
import * as THREE from "three";

// Simple procedural animation
const clock = new THREE.Clock();

function animate() {
  const delta = clock.getDelta();
  const elapsed = clock.getElapsedTime();

  mesh.rotation.y += delta;
  mesh.position.y = Math.sin(elapsed) * 0.5;

  // HULLBREAKER: src/main.js owns the ONLY requestAnimationFrame loop (`frame`)
  // and the only performance.now(). Do not add a second loop or a second clock —
  // sample your curve inside the existing frame instead.
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();
```

## Animation System Overview

Three.js animation system has three main components:

1. **AnimationClip** - Container for keyframe data
2. **AnimationMixer** - Plays animations on a root object
3. **AnimationAction** - Controls playback of a clip

<!-- HULLBREAKER: none of these three exist anywhere in src/ today. Motion here is
     a pure closed-form function of tMs (src/pure/waves.js, src/pure/transform.js)
     sampled by the renderer. Adding the mixer system is an architecture change
     that needs a task and, if it would touch anatomy, an operator decision in
     docs/decisions.md (entry 3). -->

## AnimationClip

Stores keyframe animation data.

```javascript
// Create animation clip
const times = [0, 1, 2]; // Keyframe times (seconds)
const values = [0, 1, 0]; // Values at each keyframe

const track = new THREE.NumberKeyframeTrack(
  ".position[y]", // Property path
  times,
  values,
);

const clip = new THREE.AnimationClip("bounce", 2, [track]);
```

### KeyframeTrack Types

```javascript
// Number track (single value)
new THREE.NumberKeyframeTrack(".opacity", times, [1, 0]);
new THREE.NumberKeyframeTrack(".material.opacity", times, [1, 0]);

// Vector track (position, scale)
new THREE.VectorKeyframeTrack(".position", times, [
  0,
  0,
  0, // t=0
  1,
  2,
  0, // t=1
  0,
  0,
  0, // t=2
]);

// Quaternion track (rotation)
const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0));
const q2 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0));
new THREE.QuaternionKeyframeTrack(
  ".quaternion",
  [0, 1],
  [q1.x, q1.y, q1.z, q1.w, q2.x, q2.y, q2.z, q2.w],
);

// Color track
new THREE.ColorKeyframeTrack(".material.color", times, [
  1,
  0,
  0, // red
  0,
  1,
  0, // green
  0,
  0,
  1, // blue
]);

// Boolean track
new THREE.BooleanKeyframeTrack(".visible", [0, 0.5, 1], [true, false, true]);

// String track (for morph targets)
new THREE.StringKeyframeTrack(
  ".morphTargetInfluences[smile]",
  [0, 1],
  ["0", "1"],
);
```

<!-- HULLBREAKER: a BooleanKeyframeTrack on `.visible` is the closest upstream
     analogue to a reveal. The shipped reveal is NOT this — the next stretch is
     baked at boot and comes into view around a joint's mass and out of the fog
     (src/render/limb.js). Popping anatomy in and out with a visibility track
     reads as assembly and is covered by entry 3. -->

### Interpolation Modes

```javascript
const track = new THREE.VectorKeyframeTrack(".position", times, values);

// Interpolation
track.setInterpolation(THREE.InterpolateLinear); // Default
track.setInterpolation(THREE.InterpolateSmooth); // Cubic spline
track.setInterpolation(THREE.InterpolateDiscrete); // Step function
```

## AnimationMixer

Plays animations on an object and its descendants.

```javascript
const mixer = new THREE.AnimationMixer(model);

// Create action from clip
const action = mixer.clipAction(clip);
action.play();

// Update in animation loop
function animate() {
  const delta = clock.getDelta();
  mixer.update(delta); // Required!

  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
```

<!-- HULLBREAKER: THREE.Clock/AnimationMixer are render-layer-only by layer purity
     (tools/pathcheck.mjs `banned` regex bans THREE and `performance` in src/pure
     and src/sim). A mixer also carries its own accumulated wall-clock time, which
     diverges from gameMs (src/sim/time.js) and breaks ?fixeddt reproducibility for
     anything gameplay-visible. Pointing a mixer at world anatomy violates
     decisions.md entry 3 outright. -->

### Mixer Events

```javascript
mixer.addEventListener("finished", (e) => {
  console.log("Animation finished:", e.action.getClip().name);
});

mixer.addEventListener("loop", (e) => {
  console.log("Animation looped:", e.action.getClip().name);
});
```

<!-- HULLBREAKER: `addEventListener` is in the banned regex for src/pure and
     src/sim. Sim→render notification goes through the installView hook table in
     src/sim/bridge.js, and a hook must never write sim state. -->

## AnimationAction

Controls playback of an animation clip.

```javascript
const action = mixer.clipAction(clip);

// Playback control
action.play();
action.stop();
action.reset();
action.halt(fadeOutDuration);

// Playback state
action.isRunning();
action.isScheduled();

// Time control
action.time = 0.5; // Current time
action.timeScale = 1; // Playback speed (negative = reverse)
action.paused = false;

// Weight (for blending)
action.weight = 1; // 0-1, contribution to final pose
action.setEffectiveWeight(1);

// Loop modes
action.loop = THREE.LoopRepeat; // Default: loop forever
action.loop = THREE.LoopOnce; // Play once and stop
action.loop = THREE.LoopPingPong; // Alternate forward/backward
action.repetitions = 3; // Number of loops (Infinity default)

// Clamping
action.clampWhenFinished = true; // Hold last frame when done

// Blending
action.blendMode = THREE.NormalAnimationBlendMode;
action.blendMode = THREE.AdditiveAnimationBlendMode;
```

<!-- HULLBREAKER: `action.timeScale` is the mixer's answer to CHRONO. This repo
     already has one: gameMs always advances at real time while entity updates
     receive the CHRONO-scaled dt (see the convention comment at the top of
     src/sim/time.js). Reuse that convention rather than introducing a second,
     renderer-side notion of slowed time. -->

### Fade In/Out

```javascript
// Fade in
action.reset().fadeIn(0.5).play();

// Fade out
action.fadeOut(0.5);

// Crossfade between animations
const action1 = mixer.clipAction(clip1);
const action2 = mixer.clipAction(clip2);

action1.play();

// Later, crossfade to action2
action1.crossFadeTo(action2, 0.5, true);
action2.play();
```

## Loading GLTF Animations

Most common source of skeletal animations.

```javascript
// HULLBREAKER: upstream wrote "three/examples/jsm/loaders/GLTFLoader.js". That
// specifier does NOT resolve here — index.html's import map (three.js 0.170.0)
// maps "three" and "three/addons/" only. Corrected below.
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const loader = new GLTFLoader();
loader.load("model.glb", (gltf) => {
  const model = gltf.scene;
  scene.add(model);

  // Create mixer
  const mixer = new THREE.AnimationMixer(model);

  // Get all clips
  const clips = gltf.animations;
  console.log(
    "Available animations:",
    clips.map((c) => c.name),
  );

  // Play first animation
  if (clips.length > 0) {
    const action = mixer.clipAction(clips[0]);
    action.play();
  }

  // Play specific animation by name
  const walkClip = THREE.AnimationClip.findByName(clips, "Walk");
  if (walkClip) {
    mixer.clipAction(walkClip).play();
  }

  // Store mixer for update loop
  // HULLBREAKER: never park state on `window`. There is no loader path for
  // animated models in the shipped game; assets/ + assets/manifest.json stage
  // generated art only. Adding one is a task, not an inline call.
  window.mixer = mixer;
});

// Animation loop
function animate() {
  const delta = clock.getDelta();
  if (window.mixer) window.mixer.update(delta);

  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
```

## Skeletal Animation

<!-- HULLBREAKER: this entire section is off-limits for world anatomy. The
     creature's leg is baked once and never touched again (src/render/limb.js),
     and tools/pathcheck.mjs asserts src/render/limb.js contains no `installView`
     or `view.` at all. A rigged, articulated limb is exactly the "assembled /
     articulated into place" reading decisions.md entry 3 rejected. Skeletal work
     is conceivable for RIG, enemies, or traps — and only with a task and a feel
     checkpoint. -->

### Skeleton and Bones

```javascript
// Access skeleton from skinned mesh
const skinnedMesh = model.getObjectByProperty("type", "SkinnedMesh");
const skeleton = skinnedMesh.skeleton;

// Access bones
skeleton.bones.forEach((bone) => {
  console.log(bone.name, bone.position, bone.rotation);
});

// Find specific bone by name
const headBone = skeleton.bones.find((b) => b.name === "Head");
if (headBone) headBone.rotation.y = Math.PI / 4; // Turn head

// Skeleton helper
const helper = new THREE.SkeletonHelper(model);
scene.add(helper);
```

### Programmatic Bone Animation

```javascript
function animate() {
  const time = clock.getElapsedTime();

  // Animate bone
  // HULLBREAKER: rotating a joint of the Meridian is the canonical entry-3
  // violation — a corner is the CAMERA swinging 60 degrees around a static
  // joint on the two-snap detent curve (src/pure/waves.js cornerYawDeltaDeg,
  // sampled in src/render/camera.js), never the joint bending.
  const headBone = skeleton.bones.find((b) => b.name === "Head");
  if (headBone) {
    headBone.rotation.y = Math.sin(time) * 0.3;
  }

  // Update mixer if also playing clips
  mixer.update(clock.getDelta());
}
```

### Bone Attachments

```javascript
// Attach object to bone
const weapon = new THREE.Mesh(weaponGeometry, weaponMaterial);
const handBone = skeleton.bones.find((b) => b.name === "RightHand");
if (handBone) handBone.add(weapon);

// Offset attachment
weapon.position.set(0, 0, 0.5);
weapon.rotation.set(0, Math.PI / 2, 0);
```

<!-- HULLBREAKER: RIG's gun pose is presentation synced through the
     view.player.sync hook (src/sim/bridge.js, implemented in src/render/player.js).
     Aiming itself is 2D sim state and must stay in (s, y) — never derive an aim
     direction from a bone's world matrix. -->

## Morph Targets

Blend between different mesh shapes.

<!-- HULLBREAKER: morphing world geometry is "the body changing shape," which is
     what entry 3 rules out for anatomy — and unlike a mixer it cannot be argued
     as camera work. Not sanctioned anywhere in the world today. If a case exists
     (a trap unfolding, a later enemy), it needs a new decision recorded in
     docs/decisions.md first. -->

```javascript
// Morph targets are stored in geometry
const geometry = mesh.geometry;
console.log("Morph attributes:", Object.keys(geometry.morphAttributes));

// Access morph target influences
mesh.morphTargetInfluences; // Array of weights
mesh.morphTargetDictionary; // Name -> index mapping

// Set morph target by index
mesh.morphTargetInfluences[0] = 0.5;

// Set by name
const smileIndex = mesh.morphTargetDictionary["smile"];
mesh.morphTargetInfluences[smileIndex] = 1;
```

### Animating Morph Targets

```javascript
// Procedural
function animate() {
  const t = clock.getElapsedTime();
  mesh.morphTargetInfluences[0] = (Math.sin(t) + 1) / 2;
}

// With keyframe animation
const track = new THREE.NumberKeyframeTrack(
  ".morphTargetInfluences[smile]",
  [0, 0.5, 1],
  [0, 1, 0],
);
const clip = new THREE.AnimationClip("smile", 1, [track]);
mixer.clipAction(clip).play();
```

## Animation Blending

Mix multiple animations together.

```javascript
// Setup actions
const idleAction = mixer.clipAction(idleClip);
const walkAction = mixer.clipAction(walkClip);
const runAction = mixer.clipAction(runClip);

// Play all with different weights
idleAction.play();
walkAction.play();
runAction.play();

// Set initial weights
idleAction.setEffectiveWeight(1);
walkAction.setEffectiveWeight(0);
runAction.setEffectiveWeight(0);

// Blend based on speed
function updateAnimations(speed) {
  if (speed < 0.1) {
    idleAction.setEffectiveWeight(1);
    walkAction.setEffectiveWeight(0);
    runAction.setEffectiveWeight(0);
  } else if (speed < 5) {
    const t = speed / 5;
    idleAction.setEffectiveWeight(1 - t);
    walkAction.setEffectiveWeight(t);
    runAction.setEffectiveWeight(0);
  } else {
    const t = Math.min((speed - 5) / 5, 1);
    idleAction.setEffectiveWeight(0);
    walkAction.setEffectiveWeight(1 - t);
    runAction.setEffectiveWeight(t);
  }
}
```

<!-- HULLBREAKER: a speed-driven locomotion blend is an actor concern (RIG,
     hounds, wasps), never a world concern. Note the shipped view scale first:
     decisions.md entry 7 made FAR the default (RIG at ~3.7% of screen height,
     matching concept board 13), and the accepted cost was that "capsule glyphs,
     wasp tells read smaller at distance." Locomotion blending buys little at that
     scale; readability of tells is the judged problem. -->

### Additive Blending

```javascript
// Base pose
const baseAction = mixer.clipAction(baseClip);
baseAction.play();

// Additive layer (e.g., breathing)
const additiveAction = mixer.clipAction(additiveClip);
additiveAction.blendMode = THREE.AdditiveAnimationBlendMode;
additiveAction.play();

// Convert clip to additive
THREE.AnimationUtils.makeClipAdditive(additiveClip);
```

<!-- HULLBREAKER: "breathing" as an additive layer on the Meridian is the exact
     temptation entry 3 forecloses — the creature is alive in fiction and
     monumental and static on screen. Do not add idle breathing, sway, or pulse to
     anatomy without a new operator decision. -->

## Animation Utilities

```javascript
import * as THREE from "three";

// Find clip by name
const clip = THREE.AnimationClip.findByName(clips, "Walk");

// Create subclip
const subclip = THREE.AnimationUtils.subclip(clip, "subclip", 0, 30, 30);

// Convert to additive
THREE.AnimationUtils.makeClipAdditive(clip);
THREE.AnimationUtils.makeClipAdditive(clip, 0, referenceClip);

// Clone clip
const clone = clip.clone();

// Get clip duration
clip.duration;

// Optimize clip (remove redundant keyframes)
clip.optimize();

// Reset clip to first frame
clip.resetDuration();
```

<!-- HULLBREAKER API note (three.js 0.170.0): `clip.resetDuration()` recomputes
     duration from the tracks' keyframe times — it does not "reset to the first
     frame." To rewind an action use `action.reset()` or set `action.time = 0`. -->

## Procedural Animation Patterns

<!-- HULLBREAKER: this is the sanctioned family — but the shape matters. Shipped
     motion is closed-form f(tMs) -> value, living in src/pure/ so pathcheck can
     assert it and the headless bot reproduces it exactly (see cornerYawDeltaDeg
     and easeOutBack in src/pure/waves.js, transformYawDeltaDeg and
     transformCoverAjar in src/pure/transform.js). A stateful integrator that
     accumulates across frames is only acceptable when it is purely cosmetic and
     lives in src/render/ or src/ui/. src/sim/time.js also already exports
     `approach(v, target, step)` and `blink(periodMs)` — prefer those over a new
     smoother. -->

### Smooth Damping

```javascript
// Smooth follow/lerp
const target = new THREE.Vector3();
const current = new THREE.Vector3();
const velocity = new THREE.Vector3();

function smoothDamp(current, target, velocity, smoothTime, deltaTime) {
  const omega = 2 / smoothTime;
  const x = omega * deltaTime;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current.clone().sub(target);
  const temp = velocity
    .clone()
    .add(change.clone().multiplyScalar(omega))
    .multiplyScalar(deltaTime);
  velocity.sub(temp.clone().multiplyScalar(omega)).multiplyScalar(exp);
  return target.clone().add(change.add(temp).multiplyScalar(exp));
}

function animate() {
  current.copy(smoothDamp(current, target, velocity, 0.3, delta));
  mesh.position.copy(current);
}
```

<!-- HULLBREAKER: a frame-rate-dependent smoother on the CAMERA would soften the
     ritual's deliberate two-snap detents, which decisions.md entry 3 explicitly
     preserved ("Chunky two-snap detents stay, but live in the *camera's* ratchet
     curve, not in asset arrival"). If you smooth the camera, you are editing a
     judged feel — flag it as an operator checkpoint, do not slip it in. -->

### Spring Physics

```javascript
class Spring {
  constructor(stiffness = 100, damping = 10) {
    this.stiffness = stiffness;
    this.damping = damping;
    this.position = 0;
    this.velocity = 0;
    this.target = 0;
  }

  update(dt) {
    const force = -this.stiffness * (this.position - this.target);
    const dampingForce = -this.damping * this.velocity;
    this.velocity += (force + dampingForce) * dt;
    this.position += this.velocity * dt;
    return this.position;
  }
}

const spring = new Spring(100, 10);
spring.target = 1;

function animate() {
  mesh.position.y = spring.update(delta);
}
```

<!-- HULLBREAKER: explicit-Euler springs are dt-sensitive and will not reproduce
     across the 30/60 Hz cases pathcheck asserts. Anything that can affect play
     must be closed-form in tMs; jump/movement constants in CONFIG are frozen and
     asserted, and a retune must update the physical reasoning and the pathcheck
     assertions together. -->

### Oscillation

```javascript
function animate() {
  const t = clock.getElapsedTime();

  // Sine wave
  mesh.position.y = Math.sin(t * 2) * 0.5;

  // Bouncing
  mesh.position.y = Math.abs(Math.sin(t * 3)) * 2;

  // Circular motion
  mesh.position.x = Math.cos(t) * 2;
  mesh.position.z = Math.sin(t) * 2;

  // Figure 8
  mesh.position.x = Math.sin(t) * 2;
  mesh.position.z = Math.sin(t * 2) * 1;
}
```

<!-- HULLBREAKER: closed-form and cheap to port — but drive it from gameMs
     (src/sim/time.js), not THREE.Clock, and never apply it to hull, scutes, ribs,
     facets or joints. Sanctioned targets: fixtures the ship built, HUD/UI, vapor
     and other atmosphere (see transformVapor in src/pure/transform.js). -->

## Performance Tips

1. **Share clips**: Same AnimationClip can be used on multiple mixers
2. **Optimize clips**: Call `clip.optimize()` to remove redundant keyframes
3. **Disable when off-screen**: Stop mixer updates for invisible objects
4. **Use LOD for animations**: Simpler rigs for distant characters
5. **Limit active mixers**: Each mixer.update() has a cost

```javascript
// Pause animation when not visible
mesh.onBeforeRender = () => {
  action.paused = false;
};

mesh.onAfterRender = () => {
  // Check if will be visible next frame
  // HULLBREAKER: `isInFrustum` is upstream pseudocode — no such helper exists in
  // this repo. Culling here is screen-edge driven: src/render/camera.js
  // calibrates and calls setEdges() into src/sim/edges.js, and projectiles are
  // bend-culled per decisions.md entry 7.
  if (!isInFrustum(mesh)) {
    action.paused = true;
  }
};

// Cache clips
const clipCache = new Map();
function getClip(name) {
  if (!clipCache.has(name)) {
    clipCache.set(name, loadClip(name));
  }
  return clipCache.get(name);
}
```

## See Also

- `threejs-loaders` - Loading animated GLTF models
- `threejs-fundamentals` - Clock and animation loop
- `threejs-shaders` - Vertex animation in shaders

<!-- HULLBREAKER see-also: docs/decisions.md (entries 3 and 7), CLAUDE.md
     "Hard rules", src/pure/waves.js, src/pure/transform.js, src/render/camera.js,
     src/render/transform.js, src/render/limb.js, src/sim/bridge.js,
     src/sim/time.js, tools/pathcheck.mjs. -->
