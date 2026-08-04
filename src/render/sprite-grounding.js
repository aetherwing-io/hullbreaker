/* ================= PAINTED SPRITE GROUNDING ===================== */
/* A tiny neutral value ramp baked into existing sprite geometry.  It gives
   planted feet and mechanical undersides the dark end of the light rig while
   leaving the authored texture, alpha, palette hue and silhouette untouched.
   Callers invoke this only when constructing their immutable quad geometry;
   the live loop allocates nothing and pays no extra draw/material/texture. */

import * as THREE from 'three';

export function applySpriteUnderside(geometry, floor = 0.80) {
  const position = geometry?.getAttribute?.('position');
  if (!position || position.count === 0 || geometry.getAttribute('color')) return geometry;
  floor = Math.max(0.68, Math.min(1, floor));
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const span = Math.max(1e-6, maxY - minY);
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const t = Math.max(0, Math.min(1, (position.getY(i) - minY) / span));
    const gain = floor + (1 - floor) * t;
    colors.set([gain, gain, gain], i * 3);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.userData.spriteUnderside = true;
  geometry.userData.spriteUndersideFloor = floor;
  return geometry;
}
