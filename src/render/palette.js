/* ============================ PALETTE ============================= */
/* The one color-token table for the render/ui layer (T-010). DESIGN.md's
   Concept section names the game's <=8 color roles:

     1. ENVIRONMENT  deep teal      — sky/fog, hull, deck, body anatomy
     2. METAL        rust-orange    — catwalks, machinery, joints, fixtures
     3. ENEMY        acid green     — hostile bodies and their glow
     4. PICKUP       hot magenta    — weapon capsules (the dare/reward color)
     5. MUZZLE       warm white     — player fire, tracers, the lance
     6. RIG          warm off-white — the player silhouette (muzzle family)
     7. WARN         amber          — telegraphs (hound tell) + mod capsules
     8. INK          near-black     — capsule lettering, seams-as-shadow

   Per-letter shot colors (S/L/H/F) are retained grey-box readability
   accents subordinate to MUZZLE — weapon identity, not world palette.

   Two complete tables ship: CONCEPT (the palette above, now the DEFAULT)
   and CLASSIC (the neutral grey-box, byte-faithful to CONFIG.palette and
   the literals the render files used to carry), selected once from the URL:

     ?palette=classic   — grey-box baseline, for operator side-by-sides
     anything else      — concept palette (docs/decisions.md entry 8's
                          delivery mandate: the palette is documented canon,
                          not an unjudged mechanic, so it ships as default)

   Colors are RENDER-SIDE ONLY, by ruling: they live here, not in CONFIG.
   CONFIG.palette remains as the grey-box source so CLASSIC can never
   drift from it. Values are authored against what the renderer PRODUCES:
   with the light rig + ACES tone mapping a lit face lands at roughly 0.45x
   its albedo while scene.background/fog is drawn raw (see limb.js's
   original calibration note) — so surfaces are brighter than taste says,
   and the deck stays the brightest large surface in every mode.

   FOLLOW-UP CLOSED (T-010 fix-cycle): src/render/hostiles.js was lane-fenced
   to the in-flight hostiles task; that task (T-004, the Iris Polyp) has now
   merged, so hostiles.js reads PAL.wasp/carrier/hound/houndTell/houndCharge
   and PAL.polyp/polypTell/polypBeam/polypVent from here — the acid-green
   ENEMY role now actually lands on the meshes, and pathcheck asserts the
   module carries no CONFIG.palette reads and no raw color literals.
   src/render/hook.js stays exempt (judged-rejected prototype, deliberately
   untouched — it keeps CONFIG.palette.hook*).

   ADDING AN ENEMY: pathcheck asserts every kind in src/sim/hostiles.js's
   ENEMY roster has a body token in BOTH tables — that guard exists because
   T-004's polyp landed while this branch was in flight and the classic
   table silently fell out of byte-fidelity with CONFIG.palette. Author the
   grey-box value in CONFIG.palette, mirror it here in CLASSIC, and give it
   an acid-green CONCEPT value: hostile ecology is one family.             */

import { CONFIG } from '../config.js';
import { QUERY } from '../mode.js';

// Pure resolver, exported for pathcheck: only the exact opt-out selects the
// grey-box; absence, junk, and '' all resolve to the concept default.
export function resolvePaletteId(value) {
  return value === 'classic' ? 'classic' : 'concept';
}

/* CLASSIC — the neutral grey-box, verbatim. Everything that can come from
   CONFIG.palette does (pathcheck asserts the shared keys are identical), and
   the rest are the exact literals the render files carried before T-010. */
export const CLASSIC = {
  bg: CONFIG.palette.bg,
  ground: CONFIG.palette.ground,
  groundAlt: CONFIG.palette.groundAlt,
  catwalk: CONFIG.palette.catwalk,
  solid: CONFIG.palette.groundAlt,       // authored solid rects shared this
  player: CONFIG.palette.player,
  gun: CONFIG.palette.gun,
  wasp: CONFIG.palette.wasp,
  carrier: CONFIG.palette.carrier,
  hound: CONFIG.palette.hound,
  houndTell: CONFIG.palette.houndTell,
  houndCharge: CONFIG.palette.houndCharge,
  polyp: CONFIG.palette.polyp,           // T-004's rooted turret (merged after this
  polypTell: CONFIG.palette.polypTell,   //   branch forked — see the header note)
  polypBeam: CONFIG.palette.polypBeam,
  polypVent: CONFIG.palette.polypVent,
  capsule: CONFIG.palette.capsule,
  modCapsule: CONFIG.palette.modCapsule,
  capsuleInk: '#14181e',
  muzzle: 0xffffff,                      // lance beam / white flash
  // Two identity tokens, deliberately IDENTICAL in both tables: they are not
  // palette choices, so the concept mode must not remap them. glowOff is the
  // absence of emission; hitFlash is the full-bright damage pop, which has to
  // read the same in every mode or hit feedback would change with a URL flag.
  // They live here so hostiles.js can stay free of raw color literals.
  glowOff: 0x000000,
  hitFlash: 0xffffff,
  shots: CONFIG.palette.shots,
  tints: CONFIG.palette.tints,
  rain: 0x9fb4c6,
  vapor: 0xaebbc6,                       // breach pressure burst (T-001's literal, verbatim)
  hemiSky: 0xcfd8e3, hemiGround: 0x3a3f46, sun: 0xffffff,
  limbBg: CONFIG.limb.bg,
  limb: {                                // ?g1=1 armour ladder (was limb.js BASE_COLORS)
    hull: 0x5f656e, wall: 0x646a73, rib: 0x7b818a, machine: 0x868c95,
    shadow: 0x4b515a, scute: 0x6a707a, scuteAlt: 0x747a84, skyline: 0x505a67,
  },
  transform: {                           // ?slice=transform ladder (was transform.js BASE_COLORS)
    hull: 0x494f57, wall: 0x555b64, ceiling: 0x646a73, rib: 0x7b818a,
    machine: 0x878d96, skyline: 0x333a44, panel: 0x8a9099,
  },
  atmos: {},                             // transform atmosphere bgs pass through untouched
};

/* CONCEPT — DESIGN's palette mapped onto the same token shape, split the way
   boards 01/10/13 split it: everything RIG runs on and every piece of body
   mass is RUST-ORANGE METAL (the Meridian is armored machinery), while the
   DEEP TEAL is the atmosphere — sky/fog, haze, the shadow-steel of backdrop
   structure behind the combat plane, and distant silhouettes. Brightness
   relationships are the grey-box's, recalibrated per hue: the deck stays the
   brightest large surface (~0.45x lit under ACES), backdrop teal sits darker
   so the rust route reads FORWARD out of the haze. Fog is always the bg
   color (scene.js and the transform atmosphere share the token). */
export const CONCEPT = {
  bg: 0x143238,                          // deep teal sky/haze, raw draw
  ground: 0xc8834a,                      // deck: lit rust armour, brightest large surface
  groundAlt: 0xb27341,                   // checker partner, same delta feel as grey-box
  catwalk: 0xdf9c50,                     // slats: the bright-orange route lips of board 01
  solid: 0x8a5c38,                       // authored fixtures: darker rust mass
  player: 0xe9e6dd,                      // warm off-white RIG (silhouette first)
  gun: CONFIG.palette.gun,               // already the warm muzzle family
  // ENEMY acid green — now live on the meshes (src/render/hostiles.js);
  // the tell stays warm amber (a telegraph must not read as a body).
  wasp: 0x9ce23e,
  carrier: 0x63b12e,
  hound: 0x84cc30,
  houndTell: CONFIG.palette.houndTell,
  houndCharge: 0x3f9e14,
  // Iris Polyp (T-004): same acid ecology, its own value — heavier and less
  // yellow than the wasp so a ROOTED threat separates from the flying one at
  // FAR (decisions.md entry 7), while the silhouette still carries the read.
  polyp: 0x76bd2c,
  polypTell: CONFIG.palette.polypTell,   // one warning language across the roster:
                                         //   the same warm amber blink as the hound
  polypBeam: 0xd4ff5c,                   // committed lock: the hottest acid in the
                                         //   ecology, so "live" never reads as "arming"
  polypVent: CONFIG.palette.polypVent,   // spent ember: warm, dim, and deliberately
                                         //   OUT of the acid family — the opening
  // NOTE: there is no generic "enemyGlow" token. Every emissive a hostile can
  // wear is a named state color (houndTell/houndCharge/polypTell/polypBeam/
  // polypVent, plus the mode-independent glowOff/hitFlash), so a catch-all
  // would be a color role no mesh reads — coverage the guards can't certify.
  // A new emissive gets its own token here, in BOTH tables, when a mesh needs it.
  capsule: CONFIG.palette.capsule,       // '#ff4fd8' — already the hot magenta role
  modCapsule: CONFIG.palette.modCapsule, // amber WARN family, distinct from weapons
  capsuleInk: '#14181e',
  muzzle: 0xfff2d8,                      // warm white: lance beam + flash family
  glowOff: 0x000000, hitFlash: 0xffffff, // identity tokens — see CLASSIC's note
  shots: CONFIG.palette.shots,           // R is already warm white; letters keep identity
  tints: CONFIG.palette.tints,
  rain: 0xa9cfc8,                        // weather leans teal-white, not steel blue
  vapor: 0xc2ded8,                       // breach burst: brighter of the same teal-white
                                         // atmosphere family, so it clears INTO the haze
  hemiSky: 0xd2e6e2, hemiGround: 0x36453f, sun: 0xfff1dc,   // teal ambient, warm key
  limbBg: 0x2f565e,                      // haze: raw teal, still above the perceived deck
  limb: {
    // body mass = rust; backdrop/seams/distance = teal. The wall is the body
    // rising BEHIND the combat plane — teal shadow-steel, so the rust facet
    // RIG runs on separates from it the way board 13's limbs separate.
    hull: 0x9a6a42, scute: 0x8f6240, scuteAlt: 0x9c6c46,
    rib: 0xb07c4e, machine: 0xbc8654,    // joints/kerb: the landmarks the orbit is about
    wall: 0x44656b, shadow: 0x35504f, skyline: 0x2f545c,
  },
  transform: {
    // same split inside the body: overhead/underfoot mass and machinery rust,
    // the backdrop wall and distant roofline teal
    hull: 0x7c5636, ceiling: 0x6b4a30,
    rib: 0xa5734a, machine: 0xb27c50,
    wall: 0x436a6e, skyline: 0x27484f,
    panel: 0xb08a58,                     // covers are ship-built mechanisms: metal, may move
  },
  // The transform fixture's atmosphere bgs are pure data (src/pure/transform.js)
  // and stay untouched; the render side remaps them by exact value. Unknown
  // values pass through, so a future band degrades to its authored color.
  atmos: {
    0x232830: 0x143238,                  // low exterior → the concept sky
    0x241e26: 0x1c332f,                  // interior plum-dark → dark teal-green
    0x2d3a4a: 0x2a525c,                  // high exterior → lighter, colder teal
  },
};

export const PALETTE_ID = resolvePaletteId(QUERY.get('palette'));
export const PAL = PALETTE_ID === 'classic' ? CLASSIC : CONCEPT;

// Transform-slice atmosphere remap (render-side; see CONCEPT.atmos). The
// table argument exists for pathcheck, which asserts both modes' behavior.
export function atmosphereBg(hex, table = PAL) {
  const mapped = table.atmos[hex];
  return mapped === undefined ? hex : mapped;
}

// The page behind the canvas matches the scene bg (index.html's CSS carries
// the grey-box value; this keeps the pre-boot flash coherent in both modes).
if (typeof document !== 'undefined' && document.body) {
  document.body.style.background = '#' + PAL.bg.toString(16).padStart(6, '0');
}
