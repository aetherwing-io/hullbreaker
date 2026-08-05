# Emplacement motion atlas v2

Generated with the built-in ImageGen tool on 2026-08-03 as a motion-strength
revision of `emplacement-motion-atlas-v1.png`.

## Source files

- Design/input atlas: `assets/generated/sprites/emplacement-motion-atlas-v1.png`
- First ImageGen result (pose revision):
  `/Users/scottmeyer/.codex/generated_images/019fc4d8-9286-7080-8c8a-7edc77ab89ea/exec-a00a0414-e4e1-4886-8827-68273aa1d2e1.png`
- Chroma-key result:
  `/Users/scottmeyer/.codex/generated_images/019fc4d8-9286-7080-8c8a-7edc77ab89ea/exec-d31cf447-033f-4900-bc96-166483e61982.png`
- Final corrected chroma-key result:
  `/Users/scottmeyer/.codex/generated_images/019fc4d8-9286-7080-8c8a-7edc77ab89ea/exec-bac2c796-0738-401e-9859-3a308a9cfcea.png`

## Pose-revision prompt

> Edit this exact 2048x1024 transparent 4-column by 2-row sprite atlas into a
> much more strongly animated production atlas for a side-view action game.
> Preserve the same two enemy identities, rust-orange/blue-black industrial
> machine-creature materials, acid-green infection cores, orthographic 2D
> cutout rendering, transparent background, equal 512x512 cells, generous
> empty margins, common scale per row, and a common planted deck baseline near
> y=476 inside every cell. No text, panels, cards, scenery, floor, cast shadows,
> overlaps, cropping, or pixels touching cell boundaries.
>
> TOP ROW — Iris Polyp turret, four radically readable silhouettes at 40–55
> screen pixels, not four near-identical flowers: (1) sealed/safe: very low
> compact armored bud, petals clamped tightly over the dark iris, three feet
> planted close; (2) aim/tell: body rises and leans hard toward screen-left,
> petals peel backward, one leg reaches forward and rear leg braces, iris and
> barrel visibly extend left; (3) discharge: explosive leftward lunge and
> recoil, long cannon/iris thrust left, petals swept back, front foot
> compressed, rear feet kicked wide, bright acid-green bore; (4)
> recover/vulnerable: body collapsed low and asymmetrical after recoil, iris
> fully open and exposed, petals vented outward, one leg released, small green
> vapor only within the silhouette.
>
> BOTTOM ROW — Spore mortar tripod, four radically readable whole-body
> mechanics: (1) brace/safe: low wide squat, cannon elevated, all articulated
> legs planted far apart; (2) load/tell: rear pod rack and breech open, cannon
> lowered slightly, body rises, one front leg steps forward and another digs
> back; (3) launch/fire: cannon kicks sharply upward/back, chassis recoils down,
> front legs compress, rear legs stretch and claw into deck, acid-green muzzle
> blast confined to cell; (4) recover/vulnerable: cannon droops forward,
> breech/vents visibly open, body canted, one leg unweighted, green vapor from
> opened machinery.
>
> Prioritize big mass/limb/center-of-gravity changes and clean silhouettes over
> tiny surface detail. Each state must be identifiable from silhouette alone at
> thumbnail size while still obviously the same machine. Keep planted feet on
> the identical baseline and body size consistent; never simulate motion by
> uniformly scaling the whole actor.

## Background and correction prompts

The first result contained a baked transparency checkerboard. The second edit
used this prompt:

> Preserve all eight machine sprites, their poses, positions, proportions,
> colors, lighting, and every foreground pixel exactly. Change only the baked
> gray-and-white checkerboard background to one perfectly uniform flat
> chroma-key color #00FF00 across every background pixel and every gap between
> sprites. Do not add transparency preview, checkerboard, floor, shadows,
> outlines, text, dividers, or scenery. The result must be the same 4x2 sprite
> sheet composition on a single solid pure green background, suitable for
> deterministic chroma-key removal.

The long discharge flame still crossed the intended cell. The final surgical
edit used this prompt:

> Preserve the full 4x2 sprite sheet exactly, including every sprite, pose,
> position, scale, lighting, and the perfectly uniform #00FF00 chroma
> background. Make one surgical correction only in the TOP ROW THIRD SPRITE
> (the long lunging Iris Polyp discharge pose): remove the large acid-green
> muzzle flame entirely and reconstruct the complete dark-metal cannon
> muzzle/bore beneath it, ending cleanly with a small bright acid-green bore
> light. Leave clear pure-green empty space to the left of that muzzle so the
> complete actor can be cropped into its own cell with no cutoff. Do not move
> or alter any other sprite. Do not add checkerboard, transparency, scenery,
> floor, dividers, text, shadows, or new effects.

## Deterministic finishing

The final chroma-key source was keyed with the ImageGen skill's
`remove_chroma_key.py` (`#00ff00`, tolerance 75, spill cleanup). The eight
opaque components were extracted, kept at a common 1:1 source scale, and
recomposed into a 2048x1024 RGBA atlas with four 512x512 cells per row. Every
cell is planted at y=476, retains at least 29 horizontal transparent pixels,
and has no boundary alpha.

Integration QA found that this first extraction had a binary alpha edge and
small high-chroma colors between Hullbreaker's declared hue roles. A
deterministic finishing pass preserved each pixel's CIELCh lightness/chroma
while snapping only off-band hue to the nearest legal role boundary, then
rebuilt a three-pixel inward straight-alpha matte from protected interior RGB.
Final measured result: zero off-band/alien palette mass, 2.61% partial alpha,
unchanged 2048x1024 cell geometry, shared y=476 anchor, and no cell-boundary
alpha. No pose, scale, socket feature, or opaque interior detail moved.
