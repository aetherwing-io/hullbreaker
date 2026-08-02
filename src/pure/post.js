/* ============================ POST (pure) ========================= */
/* The screen pass's flag resolution and its surface families — the parts of
   src/render/post.js and src/render/materials.js that are decisions rather
   than draws, so tools/pathcheck.mjs can run them instead of grepping for
   them. Nothing here touches three, the DOM, or a clock.

   The idiom is the one docs/proposals/2026-08-look-direction.md §4.1 asks for
   ("export a pure resolve…(value) plus a descriptor table"): a static regex
   can prove a flag EXISTS, and only a call can prove that junk in the URL
   resolves to the shipped default instead of to something a nine-year-old
   typed by accident. */

/* ?bloom= — the escape hatch entry 18 requires, plus a strength override for
   side-by-sides. ONLY an explicit opt-out turns the pass off; absence, '' and
   junk all land on the shipped default, because a default that a typo can
   silently disable is not a default. */
export function resolvePost(value, tune) {
  if (value === '0' || value === 'off') return { on: false, strength: 0 };
  const n = Number(value);
  if (value !== null && value !== undefined && value !== '' &&
      Number.isFinite(n) && n > 0)
    return { on: true, strength: Math.min(tune.bloom.strengthMax, n) };
  return { on: true, strength: tune.bloom.strength };
}

/* ?aa= — MSAA samples on the composer's scene buffer, a measurement knob (a
   composer does not inherit the canvas's antialiasing, and buying it back has
   a measured cost). Integers 0..4 only; anything else is the shipped value. */
export function resolveSamples(value, tune) {
  const n = Number(value);
  return value !== null && value !== undefined && value !== '' &&
    Number.isInteger(n) && n >= 0 && n <= 4 ? n : tune.samples;
}

/* Surface families: the roughness/metalness response a material answers the
   light rig with, plus how much of the procedural environment it picks up.

   Before this pass every material in the game was constructed with neither
   property set, so every surface sat at MeshStandardMaterial's defaults
   (roughness 1, metalness 0 — a perfectly matte dielectric) and hue alone had
   to carry "metal" against "carapace". These are broad on purpose: RIG is
   ~30px and a wasp ~17px at the frozen FAR view, so what survives is whether
   a face catches the key differently from the face beside it, not a PBR
   calibration.

   METALNESS WITHOUT AN ENVIRONMENT READS AS BLACK — a metal has no diffuse
   response, so under a rig with nothing to reflect it goes dark except for one
   glint, and entry 14 already ruled the frame too dark. That is why
   src/render/materials.js ships a small generated environment with these, and
   why the metalness numbers stay moderate even so. */
export const SURFACE = {
  // hostile drone shells: shell over mechanism, satin rather than mirror
  carapace: { roughness: 0.55, metalness: 0.20, envMapIntensity: 0.55 },
  // the houndframe: exposed running gear, the most metallic thing on screen
  chassis: { roughness: 0.34, metalness: 0.55, envMapIntensity: 0.85 },
  // rooted emplacements (polyp, mortar): heavier, duller, grown into place
  emplacement: { roughness: 0.66, metalness: 0.28, envMapIntensity: 0.45 },
  // world families, authored for the hull lanes to adopt (see materials.js)
  deck: { roughness: 0.78, metalness: 0.12, envMapIntensity: 0.35 },
  plate: { roughness: 0.62, metalness: 0.24, envMapIntensity: 0.45 },
  machine: { roughness: 0.38, metalness: 0.52, envMapIntensity: 0.80 },
  distant: { roughness: 0.92, metalness: 0.0, envMapIntensity: 0.15 },
};
