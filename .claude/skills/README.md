# three.js skill pack — HULLBREAKER index

Ten three.js reference skills, adapted for this repo. They are **reference
material, not permission** — see the honesty note at the bottom.

> **Line numbers in these files are indicative; symbol names are authoritative.**
> They were verified against the tree on install day, but several build lanes
> merge into `main` daily and the numbers drift within hours. Every citation was
> checked to name a symbol or guard that really exists and really does what the
> guardrail claims — so if `tools/pathcheck.mjs:107` does not hold `const banned`
> when you look, `grep` for the symbol rather than concluding the guardrail is
> wrong. Report anything you find that has genuinely gone stale.

## Provenance

- **Upstream:** <https://github.com/cloudai-x/threejs-skills>
- **Installed:** 2026-08-01 (the full upstream set of ten; adapted per-skill on install)
- **Local modification:** every `SKILL.md` here opens with a
  `## HULLBREAKER guardrails (read before using anything below)` section, and
  carries inline `HULLBREAKER:` annotations through the upstream body marking
  snippets that fail our gates. **Upstream has none of this.**

> **Do not "update from upstream" by overwriting these files.** A clean pull
> silently deletes every guardrail and re-introduces code that fails
> `tools/pathcheck.mjs`, imports unmapped specifiers, or violates a recorded
> operator verdict. To refresh a skill: diff the upstream body in, keep the
> guardrails section and the inline annotations, and re-verify the file paths
> and line-independent grep anchors it cites.

Upstream corrections already applied (do not regress them): `three/examples/jsm/…`
rewritten to `three/addons/…` in most skills — `threejs-lighting` deliberately
leaves the upstream specifiers in place and puts the corrected form in an inline
`HULLBREAKER:` note directly below each one, so read the annotation, not the
line above it; `uv2` → `uv1` (renamed in r151);
`BufferGeometryUtils.computeTangents` → `geometry.computeTangents` (not exported
in 0.170.0); a duplicate `const merged` that threw on paste; and `ContactShadows`
flagged as not a three.js module at all.

## The skills

| Skill | Good for HERE | Risk |
|---|---|---|
| `threejs-fundamentals` | Extending the **one** existing rig — `src/render/scene.js` (renderer/scene/camera/lights), `src/render/camera.js`, the single frame loop in `src/main.js`. | ⚠️ Teaches standing up a second renderer/scene/camera/loop. There is exactly one of each; a second is a defect. Camera pose is frozen (entry 7). |
| `threejs-geometry` | The InstancedMesh pools that carry the 60fps budget — bullets, level tiles, the limb bake, transform weather. Extend the four existing pools. | ⚠️ Morph targets / per-frame vertex rewrites on anatomy hit **entry 3**. Raycast `instanceId` must never reach the 2D sim. |
| `threejs-materials` | Styling in `src/render/` — flat-shaded `MeshStandardMaterial` + `MeshBasicMaterial` under the fixed light rig. | ⚠️ Every example authors raw hex; texture/env-map/PBR sections are unsanctioned look changes. |
| `threejs-lighting` | Understanding the one calibrated rig (hemisphere + sun + ACES) in `src/render/scene.js`. | ⚠️ **Shadow maps, IBL/HDR, RectAreaLight, light probes, tone-mapping changes are all unshipped and unsanctioned.** Intensities are calibrated, not free. |
| `threejs-textures` | The sanctioned path only: `CanvasTexture`, `DataTexture`, procedural, render targets, UV work. | 🚫 **Loaders vs asset independence.** `TextureLoader`/`RGBELoader`/`KTX2Loader`/`VideoTexture` are barred — the game must boot with every asset file missing. |
| `threejs-animation` | The sanctioned movers: camera ratchet curves, hinged plates/vent covers, traps, enemies. | 🚫 **Whole premise vs the static-anatomy rule.** `AnimationMixer`/skeletons/morph targets pointed at the Meridian's body violate **entry 3**. Nothing in `src/` uses any of it today. |
| `threejs-shaders` | GLSL in template literals, uniforms fed from `gameMs`, render-side only. | ⚠️ Vertex-displacement and dissolve examples target creature geometry → **entry 3**. No gate parses GLSL, so green pathcheck ≠ permission. |
| `threejs-postprocessing` | Reference only, behind an off-by-default `src/mode.js` flag. | 🚫 **vs the 60fps/200-projectile target and the FAR default.** Zero post-processing ships today. A composer also silently drops the renderer's MSAA and ACES tone mapping. |
| `threejs-interaction` | Presentation-only hit-testing; dev tooling behind an off-by-default flag. | 🚫 **vs determinism and the frozen camera.** Mouse/pointer/touch input is unreplayable by the playtest driver; no `OrbitControls` may attach to the shipped camera. |
| `threejs-loaders` | Reference map only — the sanctioned path is the **offline** pipeline in `tools/assets/` (generate, rasterize, check, view). | 🚫 **vs asset independence + no-runtime-deps.** Zero loader imports in `src/` today; the game must boot with every `assets/` file missing. `DRACOLoader`/`KTX2Loader` also fetch decoder binaries from URLs outside the import map. Needs a recorded decision first. |

Legend: 🚫 = conflicts with a recorded operator verdict or hard rule; needs a
**new** `docs/decisions.md` entry before implementation, not an agent's judgment.
⚠️ = safe to read, contains specific traps flagged inline.

## Before you invoke one of these

Four rules a three.js skill will lead you into breaking, and what enforces each:

1. **Layer purity.** `src/pure/`, `src/sim/`, and `src/config.js` may never
   name `THREE`, `document`, `window`, `renderer`, `scene`, `addEventListener`,
   `requestAnimationFrame`, or `performance`. Only `src/render/`, `src/ui/`, and
   `src/main.js` may. Sim→render crossings go through `src/sim/bridge.js` hooks,
   which must never write sim state.
   → enforced by `const banned = …` + `guardLayer()` in **`tools/pathcheck.mjs`**
   (comments are stripped first; it `exit(1)`s before any assertion runs).
2. **Determinism.** Randomness only via seeded `mulberry32` in `src/pure/rng.js`;
   the clock is `gameMs` from `src/sim/time.js`. `THREE.Clock`,
   `THREE.MathUtils.randFloat`, `Math.random`, `Date.now`, `performance.now`
   never feed sim state — `?fixeddt` and `--deterministic` playtests stop
   reproducing. The sim is strictly 2D `(s, y)`; no 3D value decides collision,
   aiming, or spawning.
   → **`tools/pathcheck.mjs`** (partial — it catches `performance` in pure/sim
   but *not* `Math.random` in `src/render/`; that one binds on review only).
3. **No build step, no runtime dependencies, no asset loading.** three.js
   0.170.0 arrives via the import map in **`index.html`**, which maps only
   `three` and `three/addons/`. Never `npm install` for the game (dev deps live
   under `tools/*/` only). The game must boot with every asset file missing.
   → `checkGameIndependence()` in **`tools/assets/check.mjs`** (errors on any
   static import of an `assets/` path from `src/`).
4. **Operator verdicts are law.** Entry 3 — anatomy is monumental and static,
   *revealed*, never assembled; only doors, access plates, vent covers,
   shutters, traps, and Crown mechanisms may move. Entry 7 — FAR is the default
   view (RIG ~3.7% of screen height); the pose is asserted.
   → **`docs/decisions.md`**, plus pose and static-anatomy assertions in
   **`tools/pathcheck.mjs`**. Never re-litigate an entry; propose a new one.

Colors: the render layer's token table is `src/render/palette.js` (merged
2026-08-01 with T-010) — import `PAL`, or `CLASSIC`/`CONCEPT` for the two
modes; `CONFIG.palette` in `src/config.js` remains the byte-faithful
grey-box source the classic table mirrors. pathcheck now rejects raw color
literals (`0xRRGGBB` and CSS `#rgb`/`rgb()`/`rgba()`) in tokenized render
files, and every kind in the sim `ENEMY` roster must carry a body token in
both tables. Author no new hex literal.

Prototypes ship behind a query flag resolved in `src/mode.js`, default off, with
the shipped URL unchanged.

## Honesty note

**A skill describing a technique is not an operator decision to use it.**

These files exist so an agent writing render code gets the API right on the
first try — not to expand what this project has agreed to build. Upstream was
written for a generic app with a build step, a bundler, an asset pipeline, and
no design verdicts; most of what it teaches is out of bounds here, which is
exactly why the guardrails sections exist.

Concretely, before shipping anything these skills taught you:

- If a section is marked 🚫 above, or its guardrails say "requires an operator
  decision," the sequence is **decision first, code second**. A green pathcheck
  is not consent, and neither is another agent's approval.
- `node tools/pathcheck.mjs` exiting 0 proves you broke no *encoded* rule. Several
  rules here are not encodable — nothing greps for a swinging key light, a GLSL
  dissolve, or a composer wired into the default path.
- **Machine gates never judge fun.** Anything visual goes to `SPRINT.md`'s
  *Operator checkpoint queue* with an exact URL and 3–5 questions, judged against
  the concept boards. Never self-declare a look good.
- Lane discipline still applies: work in your assigned worktree, never commit to
  `main`, merge only via `tools/orch/merge-task.sh`.
