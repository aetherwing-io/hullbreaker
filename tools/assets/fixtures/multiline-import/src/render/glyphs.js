/* FIXTURE — not part of the game. tools/assets/check.mjs must REJECT this file.
   The specifier sits two lines below the `import` keyword, which is exactly the
   shape that exited 0 before I-014 was fixed. */

import {
  capsuleGlyph,
  ventPlate,
} from '../../assets/generated/glyphs/capsule-letter-h.png';

export function draw(ctx) {
  ctx.drawImage(capsuleGlyph, 0, 0);
  ctx.drawImage(ventPlate, 0, 0);
}
