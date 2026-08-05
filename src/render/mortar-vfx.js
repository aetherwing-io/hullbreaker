/* =================== MORTAR PIXEL PRIMITIVES ===================== */
/* Atlas-independent action shapes for the Seed-Pod Tripod.

   These deliberately use the language of tiny game sprites without paying
   for a texture sheet: orthogonal steps, clipped 45-degree corners, a dark
   chassis around one hot core, and negative space between burst columns.
   Every vertex is authored inside the real mortar envelope. The simulation
   still owns the arc, landing patch, fuse and damaging rectangle; this module
   only makes those facts readable at the shipped camera scale.              */

import * as THREE from 'three';

function quad(out, x0, y0, x1, y1, z = 0) {
  out.push(
    x0, y0, z, x1, y0, z, x1, y1, z,
    x0, y0, z, x1, y1, z, x0, y1, z,
  );
}

function geometryFromTriangles(position, language) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.actionLanguage = language;
  geometry.userData.atlasIndependent = true;
  geometry.userData.pixelPrimitive = true;
  return geometry;
}

/* A broadside bomb silhouette. The shell is not a smooth egg: its rear
   locking block, high/low fins and clipped penetrator remain separate at
   12--20 display pixels. Local +X is the nose and follows the real analytic
   tangent in hostiles.js. */
export function mortarPodShellGeometry(radius) {
  const r = radius;
  const p = [
    // Rear locking block.
    -0.66*r,-0.25*r,0, -0.42*r,-0.25*r,0, -0.42*r, 0.25*r,0,
    -0.66*r,-0.25*r,0, -0.42*r, 0.25*r,0, -0.66*r, 0.25*r,0,
    // Main clipped shell.
    -0.42*r,-0.48*r,0,  0.20*r,-0.48*r,0,  0.52*r,-0.18*r,0,
    -0.42*r,-0.48*r,0,  0.52*r,-0.18*r,0,  0.52*r, 0.18*r,0,
    -0.42*r,-0.48*r,0,  0.52*r, 0.18*r,0,  0.20*r, 0.48*r,0,
    -0.42*r,-0.48*r,0,  0.20*r, 0.48*r,0, -0.42*r, 0.48*r,0,
    // Narrow, blunt-safe nose. It points without becoming a sub-pixel needle.
     0.52*r,-0.18*r,0,  0.78*r,-0.08*r,0,  0.78*r, 0.08*r,0,
     0.52*r,-0.18*r,0,  0.78*r, 0.08*r,0,  0.52*r, 0.18*r,0,
    // Deliberately mismatched fins: rotation still reads in a tiny silhouette.
    -0.28*r, 0.48*r,0,  0.02*r, 0.48*r,0, -0.16*r, 0.82*r,0,
    -0.06*r,-0.48*r,0,  0.20*r,-0.48*r,0,  0.12*r,-0.70*r,0,
  ];
  const geometry = geometryFromTriangles(p, 'mortar-pixel-seed-pod');
  geometry.userData.forwardAxis = '+x';
  return geometry;
}

/* The acid core is an inset stepped diamond, not a halo. It can pulse during
   the planted fuse without turning the complete shell into a white card. */
export function mortarPodCoreGeometry(radius) {
  const r = radius;
  return geometryFromTriangles([
    -0.25*r,-0.18*r,0,  0.20*r,-0.18*r,0,  0.38*r,0,0,
    -0.25*r,-0.18*r,0,  0.38*r,0,0,  0.20*r, 0.18*r,0,
    -0.25*r,-0.18*r,0,  0.20*r, 0.18*r,0, -0.25*r, 0.18*r,0,
  ], 'mortar-pixel-seed-core');
}

/* Four interrupted deck jaws describe the exact marked width while leaving
   most of the floor visible. This replaces the UV-test-looking solid pad. */
export function mortarMarkGeometry(halfWidth, thickness) {
  const p = [];
  const y0 = -thickness * 0.5;
  const y1 = thickness * 0.5;
  const gap = halfWidth * 0.16;
  quad(p, -halfWidth, y0, -halfWidth * 0.52, y1);
  quad(p, -halfWidth * 0.42, y0, -gap, y1);
  quad(p, gap, y0, halfWidth * 0.42, y1);
  quad(p, halfWidth * 0.52, y0, halfWidth, y1);
  return geometryFromTriangles(p, 'mortar-broken-landing-jaws');
}

function column(out, x0, x1, bottom, h, step) {
  // Two stacked rectangles with unequal widths create a hard pixel shoulder.
  quad(out, x0, bottom, x1, bottom + h * step);
  const inset = (x1 - x0) * 0.18;
  quad(out, x0 + inset, bottom + h * step, x1 - inset, bottom + h);
}

/* The live denial still occupies the same width/height contract, but reads as
   a row of violent mechanical exhaust teeth rather than a cream placeholder
   rectangle. Negative gaps preserve actors and the deck inside the danger. */
export function mortarBurstShellGeometry(halfWidth, height) {
  const p = [];
  const bottom = -height * 0.5;
  const w = halfWidth * 2;
  const specs = [
    [-0.50, 0.20, 0.48, 0.64],
    [-0.29, 0.17, 0.76, 0.52],
    [-0.10, 0.20, 1.00, 0.68],
    [ 0.13, 0.18, 0.72, 0.54],
    [ 0.34, 0.16, 0.52, 0.66],
  ];
  for (const [cx, nw, nh, step] of specs) {
    const x = cx * w;
    const width = nw * w;
    column(p, x, x + width, bottom, height * nh, step);
  }
  // Low broken blast feet name the complete hazardous patch without filling it.
  quad(p, -halfWidth, bottom, -halfWidth * 0.56, bottom + height * 0.15);
  quad(p, -halfWidth * 0.46, bottom, -halfWidth * 0.08, bottom + height * 0.11);
  quad(p, halfWidth * 0.08, bottom, halfWidth * 0.50, bottom + height * 0.13);
  quad(p, halfWidth * 0.60, bottom, halfWidth, bottom + height * 0.16);
  return geometryFromTriangles(p, 'mortar-pixel-burst-teeth');
}

/* Three small hot slivers sit inside the orange shell. Warm white is now an
   impact punctuation mark instead of 100% of a three-tile rectangle. */
export function mortarBurstCoreGeometry(halfWidth, height) {
  const p = [];
  const bottom = -height * 0.5 + height * 0.10;
  const w = halfWidth * 2;
  column(p, -0.23*w, -0.15*w, bottom, height * 0.52, 0.62);
  column(p, -0.035*w, 0.045*w, bottom, height * 0.76, 0.70);
  column(p, 0.17*w, 0.24*w, bottom, height * 0.44, 0.58);
  return geometryFromTriangles(p, 'mortar-pixel-burst-core');
}
