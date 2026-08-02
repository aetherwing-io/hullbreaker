/* =========================== MATERIALS ============================ */
/* Surface families, and the one thing that makes them mean anything.

   THE MEASUREMENT THIS ANSWERS (docs/decisions.md entry 18): every material
   in the game was `MeshStandardMaterial { color, flatShading }` — `roughness`
   and `metalness` were never set anywhere in `src/`, so every surface sat at
   the class defaults (roughness 1, metalness 0: a perfectly matte dielectric)
   and had nothing with which to respond to light. Value alone had to carry
   metal, carapace and deck, and it cannot.

   WHY A FAMILY TABLE INSTEAD OF NUMBERS AT THE CALL SITE. The same two
   numbers have to mean the same surface everywhere or the world stops being
   one material world, and four render lanes are authoring at once. A call
   site names a FAMILY; the numbers live here, once.

   METALNESS NEEDS SOMETHING TO REFLECT — and this is the trap this file
   exists to avoid. A metal has no diffuse response at all: under a light rig
   with no environment, `metalness: 0.8` does not read as steel, it reads as
   BLACK, with one specular glint where the key happens to line up. Entry 14
   is explicit that the frame must not get darker in the name of drama. So a
   tiny procedural environment ships with the families: a vertical gradient
   between the palette's own sky, air and ground tokens, prefiltered through
   PMREM. It is generated, never fetched, costs one small texture, and if it
   fails to build the families degrade to envMap-free — dimmer specular, not a
   broken frame.

   AUTHORED AT FAR. RIG is ~30px and a wasp ~17px at the frozen default view
   (entry 7/17). Micro-surface detail is invisible there; what survives is
   whether a face catches the key differently from the face next to it. The
   values below are therefore deliberately broad — a roughness step you can
   see at 20px, not a PBR calibration.                                     */

import * as THREE from 'three';
import { SURFACE } from '../pure/post.js';
import { PAL } from './palette.js';
import { renderer } from './scene.js';

// The family table itself is data, so it lives in src/pure/post.js where
// tools/pathcheck.mjs can read it — and where the guard that every family a
// mesh names actually exists can be a real cross-check rather than a grep.
export { SURFACE };

/* ------------------------- procedural environment ------------------------ */

const ENV_W = 32, ENV_H = 16;            // an equirect gradient needs no more
let env;                                  // undefined = not built yet, null = failed

/* Three stops from the palette itself, so the environment can never disagree
   with the light rig or the sky: the hemisphere's own sky color overhead, the
   atmosphere token at the horizon (the same one scene.js paints the sky and
   fog with), and the hemisphere's ground color below. THREE.Color holds
   LINEAR values once it has parsed a token, which is exactly what an
   environment sample must be, so nothing here converts anything. */
function buildEnv() {
  const sky = new THREE.Color(PAL.hemiSky);
  const air = new THREE.Color(PAL.bg);
  const ground = new THREE.Color(PAL.hemiGround);
  const data = new Float32Array(ENV_W * ENV_H * 4);
  const c = new THREE.Color();
  for (let y = 0; y < ENV_H; y++) {
    const v = y / (ENV_H - 1);           // 0 = top of the sphere, 1 = bottom
    if (v < 0.5) c.copy(sky).lerp(air, v * 2);
    else c.copy(air).lerp(ground, (v - 0.5) * 2);
    for (let x = 0; x < ENV_W; x++) {
      const i = (y * ENV_W + x) * 4;
      data[i] = c.r; data[i + 1] = c.g; data[i + 2] = c.b; data[i + 3] = 1;
    }
  }
  const tex = new THREE.DataTexture(data, ENV_W, ENV_H, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.needsUpdate = true;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromEquirectangular(tex);
  pmrem.dispose();
  tex.dispose();                          // the prefiltered target is what is kept
  return target.texture;
}

/* Built on first use rather than at module load: it costs a render, and the
   first frame of the game is worth more than a prefiltered gradient. A
   failure here is survivable by construction — every consumer treats a null
   environment as "no envMap", which is the look this file replaced. */
export function surfaceEnv() {
  if (env === undefined) {
    try {
      env = buildEnv();
    } catch {
      env = null;
    }
  }
  return env;
}

/* -------------------------------- apply --------------------------------- */

/* Give a material a family. Returns the material, so it composes onto a
   constructor call. An unknown family is a no-op rather than a throw: a
   material that lost its surface still draws, and the gate names the typo. */
export function applySurface(material, family) {
  const s = SURFACE[family];
  if (!s || !material) return material;
  material.roughness = s.roughness;
  material.metalness = s.metalness;
  const e = surfaceEnv();
  if (e) {
    material.envMap = e;
    material.envMapIntensity = s.envMapIntensity;
  }
  material.needsUpdate = true;
  return material;
}

/* FOR THE HULL LANES (T-035 value ladder, T-047 light rig): `deck`, `plate`,
   `machine` and `distant` above are authored for src/render/level.js,
   limb.js and transform.js and are deliberately NOT applied from here —
   those files belong to other lanes this cycle and a drive-by edit buys a
   merge conflict worth more than the change. Adopting one is one call:

       applySurface(new THREE.MeshStandardMaterial({ color: PAL.ground,
                                                     flatShading: true }), 'deck');

   The environment is shared and built once, so the second adopter pays
   nothing for it. If the light rig lane wants it scene-wide instead, the
   same texture is what `scene.environment` wants — that assignment belongs
   in scene.js, which is theirs, not here.                                 */
