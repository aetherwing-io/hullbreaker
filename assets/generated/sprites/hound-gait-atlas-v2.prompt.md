# Hound gait atlas v2 — generation provenance

- Tool: built-in ImageGen (`image_gen`), not the CLI fallback.
- Built-in output: `/Users/scottmeyer/.codex/generated_images/019fc9f6-e1c7-7643-9c68-ca3e8ebb0893/exec-100988ca-77d3-4490-9c4b-aad93534ace6.png`
- Identity/articulation references:
  - `assets/generated/sprites/houndframe-v2.png`
  - `assets/generated/sprites/houndframe-action-v2.png`
- Project output: `assets/generated/sprites/hound-gait-atlas-v2.png`

## Exact prompt

```text
Use case: stylized-concept
Asset type: production 2D game sprite animation atlas for Hullbreaker
Input images: Image 1 and Image 2 are locked identity, material, proportion, and articulation references for the same mechanical hound; preserve that exact creature design.
Primary request: create a coherent eight-pose animation atlas of the SAME right-facing mechanical hound, arranged as exactly four equal cells across by two equal rows. Every cell must show exactly one complete side-view hound and exactly four anatomically connected articulated legs: two forelegs connected beneath the orange shoulder armor and two hind legs connected beneath the rear hip armor. No pose may reuse the same foreleg silhouette.
Top row, left to right — high-speed quadruped run:
1. FRONT CONTACT / COMPRESSION: both forefeet decisively planted well ahead of the shoulder, elbows deeply bent under impact, chest low, hind legs reaching forward.
2. PASSING: forelegs swept backward under the chest with sharply folded elbows, one forefoot leaving the ground; rear legs crossing beneath the pelvis.
3. REAR DRIVE / FORWARD REACH: hind legs fully driving backward while BOTH forelegs extend dramatically straight forward beyond the acid-green face, shoulder-to-paw line nearly horizontal.
4. SUSPENSION: all four feet unmistakably clear of the ground; forelegs folded tightly beneath the chest and rear legs extended backward.
Bottom row, left to right — leap sequence:
5. DEEP LOAD: body compressed very low, both forelegs folded tightly beneath the chest, rear legs coiled deeply underneath the hip.
6. EXPLOSIVE LAUNCH: rear legs fully extended backward from the ground while both forelegs drive forward at a steep rising angle.
7. AIRBORNE REACH / TUCK: body completely airborne, BOTH forelegs fully extended forward beyond the head, BOTH rear legs tucked tightly under the pelvis, all feet clear.
8. HARD LANDING: both forefeet planted far ahead and visibly compressed at elbows, shoulders dropped over the wrists, rear legs still airborne and swinging forward.
Articulation gate: the foreleg shoulder, elbow, wrist, and paw positions must change radically from cell to cell. Between key poses the front-leg long axes must differ by at least 60 degrees. Make the run and leap readable from black silhouettes with no internal color.
Identity invariants: exact armored head shape and acid-green face shell from the references; orange shoulder armor; black/gunmetal torso and limbs; one segmented tail; rigid torso length, head size, material language, and overall scale consistent in all eight cells. The hound always faces right. Keep torso anchors aligned within each cell while allowing honest vertical movement for compression, suspension, launch, and landing.
Style/medium: high-detail hand-painted sci-fi game sprite, crisp readable edges, matching the reference assets exactly; no photorealism.
Composition/framing: 4x2 contact sheet; eight equal unmarked cells; generous internal padding; no hound crosses a cell boundary; align comparable torso anchors.
Scene/backdrop: perfectly flat solid #ff00ff chroma-key background for local removal. The background must be exactly one uniform color with no shadows, gradients, texture, reflections, floor plane, or lighting variation.
Constraints: exactly 8 hounds total; exactly 1 hound per cell; exactly 4 anatomically connected legs per hound; exactly 1 tail per hound; all hounds right-facing; all full bodies visible; crisp silhouette; no #ff00ff anywhere inside the creature; no cast shadow; no contact shadow; no reflection; no glow; no motion blur; no speed streaks; no grid lines; no dividers; no text; no labels; no numbers; no watermark.
Avoid: repeated planted forelegs, decorative detached limbs, missing legs, extra legs, fused legs, ambiguous paws, mirrored poses, perspective changes, scale changes, torso redesign, extra creatures, cropped tails or feet.
```

## Deterministic post-process

The generated source was 1774×887 with a flat magenta field. The installed
ImageGen helper detected `#fb03f9`, removed it with soft matte and despill, and
retained antialiased alpha. The eight disconnected creature silhouettes were
then extracted with eight pixels of safety margin, horizontally flipped to the
required right-facing authoring convention, and composited into eight 512×512
cells on a 2048×1024 transparent POT canvas. Source pixels were never resized
or resampled. The rejected v1 atlas is not a runtime or manifest asset and is
excluded from this checkpoint's commit.

```sh
python /Users/scottmeyer/.codex/skills/.system/imagegen/scripts/remove_chroma_key.py \
  --input /private/tmp/hound-gait-atlas-v2-chroma.png \
  --out /private/tmp/hound-gait-atlas-v2-alpha.png \
  --auto-key border --soft-matte --transparent-threshold 12 \
  --opaque-threshold 220 --despill
```

The first production pack measured 0.6707% alien hue mass and only 0.7638%
partially transparent pixels. A deterministic contract-repair pass changed
only those deficiencies: 6,669 visible pixels across 5,396 off-band RGB values
were progressively neutralized toward equal-channel luma until the existing
eight-role CIELCh classifier accepted them, then three inward-only silhouette
rings (15,246 / 14,888 / 14,426 pixels) were alpha-capped at 112 / 184 / 232.
No frame was translated, cropped, rescaled, resampled, or expanded; all eight
positive-alpha silhouette boxes, torso anchors, cell coordinates, and FAR pose
differences remain identical. The final strict audit measures 0% alien hue
mass and 2.1327% partial alpha.
