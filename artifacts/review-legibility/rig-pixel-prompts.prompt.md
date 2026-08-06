# RIG pixel-sprite prompt kit (14-frame atlas set)

Method: one generation per frame, every frame reference-chained to the
approved idle frame (`rig-frames/idle.png`) via `--reference-image`.
Transparent background requested; service returns black + a bottom-left
watermark, so each result is flood-keyed from the borders (never a global
threshold — it eats dark costume pixels) and the watermark zone masked.
Judge only at 30px composited on a real gameplay frame.

Driver script: `rig-frames/genall.py.txt` (idempotent, resumable).

## INVARIANT BLOCK (verbatim prefix of every frame's prompt)

16-bit pixel art game sprite, single character full body, side view facing
right: a sci-fi salvage marine in a fitted off-white armor suit. Tall
slender elongated proportions — long legs half of total height, narrow
torso, small rounded helmet one-sixth of height. Masses: rounded helmet,
chest plate, slim backpack unit, long legs, slim rifle. One focal accent:
glowing amber-orange horizontal visor slit, plus small matching amber
details on the backpack vent and rifle core. Dark charcoal underlayer
visible at joints. Clean flat pixel clusters, limited palette of about 10
flat colors, strong elegant readable silhouette, subtle two-tone cel
shading only, lit from upper left. Classic 90s arcade run-and-gun sprite
readability. No anti-aliasing, no gradients, no dithering, no noise
texture, no outline glow, no motion blur, no cast shadow, no background,
no text, no watermark.

## POSE CLAUSES (appended to the invariant block, one per frame)

- idle: standing in a relaxed ready pose, rifle held level pointing right,
  weight slightly on the back foot. (approved = V2 generation)
- contact: mid-stride at the moment the front foot strikes the ground —
  front leg extended forward heel-down, back leg trailing at full push-off,
  torso leaning into the run, rifle held level pointing right.
- pass: mid-stride at the passing position — legs scissored directly
  beneath the body, one knee lifted high, torso at its tallest, rifle held
  level pointing right.
- flight: mid-stride airborne — both feet off the ground, front knee
  driving up, back leg extended behind, maximum forward lean, rifle held
  level pointing right.
- jump-rise: mid-jump ascending — legs tucked beneath the body, torso
  upright, free arm slightly raised, rifle held level pointing right.
- jump-fall: mid-fall descending — legs extended slightly apart preparing
  to land, torso upright, rifle held level pointing right.
- aim-right: standing tall, rifle raised to the shoulder pointing directly
  right, head sighting along the barrel, feet planted shoulder-width.
- aim-up-right: standing, rifle raised pointing up-right at 45 degrees,
  head tilted up sighting along the barrel, slight back-arch.
- aim-up: standing, rifle pointing straight up, head tilted fully back
  sighting along the barrel, torso vertical.
- aim-down-right: standing in a slight crouch, rifle angled down-right at
  45 degrees, head lowered sighting along the barrel.
- climb-left-reach: climbing a vertical surface seen from the side — body
  pressed flat facing right, left arm reaching straight up gripping, right
  arm bent at chest gripping, legs braced apart.
- climb-left-drive: climbing a vertical surface — left arm pulling down
  driving the body upward, right arm reaching up gripping, legs pushing
  from a low brace.
- climb-right-reach: climbing a vertical surface — right arm fully extended
  overhead gripping, left arm bent at chest gripping, legs braced apart.
- climb-right-drive: climbing a vertical surface — right arm pulling down
  driving the body upward, left arm reaching up gripping, legs mid-push.

## ASSEMBLY RULES

1. Reference-chain: pass the approved idle frame as the reference for every
   generation — never the original design art.
2. One prompt per cell; never ask a model for a grid of poses.
3. Align aim frames by muzzle/shoulder, run frames by feet.
4. Reject on silhouette drift at 30px, not on per-frame beauty.
5. Judge the run cycle as a loop at ship speed, composited over the real
   backdrop, before approving any single frame.
