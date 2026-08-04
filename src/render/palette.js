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

   THE 0.45x RULE IS CONFIRMED, AND IT IS ALSO THE PROBLEM (T-035). It was
   measured again in docs/proposals/2026-08-look-direction.md: PAL.ground's
   token luminance 141.6 lands at 63 on screen (0.445x), so the calibration
   above is right. What it did NOT author is a RANGE: because every token is
   authored to land lit, and every instance of every material is drawn at
   ~1.0x its token (CONFIG.limb.tone is +-4%), 99% of playfield pixels sit
   inside a 45-70 window out of 255 and 0.0% exceed 200. The hues here are
   a palette; the values are one note. `shade` below is the second half of
   that authoring — how far BELOW its lit value a given instance of the same
   token sits — and it is a per-table entry precisely because CLASSIC must
   keep every instance at exactly 1.0x to stay a byte-faithful instrument.

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
import { resolveShadeGain } from '../pure/shade.js';

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
  /* ==== T-040 RIG silhouette ==== *
   * Two new value zones for RIG's silhouette (torso+pack, legs), darker
   * ladder steps off the same neutral CONFIG.palette.player rather than a
   * new hue — CLASSIC stays the byte-faithful grey-box, so these are hand
   * -authored neutral greys, not derived from any CONCEPT role. Luminance
   * ladder (bright > mid > dark) and the minimum separation between all
   * three are asserted in tools/pathcheck.mjs's T-040 block. Widened past
   * that floor on purpose: RIG's sprite is a MeshStandardMaterial (lit, so
   * playerDark/playerMid land where the rest of the palette was calibrated
   * to), and ACES tone mapping compresses midtones hard enough that a raw
   * gap just over the floor read as nearly flat once lit and tone-mapped —
   * measured on screen, not assumed (reports/tasks/T-040/build.md). */
  playerDark: 0x5f6266,
  playerMid: 0xb4b7bb,
  /* ==== end T-040 ==== */
  gun: CONFIG.palette.gun,
  wasp: CONFIG.palette.wasp,
  waspDive: 0xb9f0a8,                    // T-003: the committed dive, in the grey-box's
                                         //   own family — see CONCEPT's note
  carrier: CONFIG.palette.carrier,
  hound: CONFIG.palette.hound,
  houndTell: CONFIG.palette.houndTell,
  houndCharge: CONFIG.palette.houndCharge,
  polyp: CONFIG.palette.polyp,           // T-004's rooted turret (merged after this
  polypTell: CONFIG.palette.polypTell,   //   branch forked — see the header note)
  polypBeam: CONFIG.palette.polypBeam,
  polypVent: CONFIG.palette.polypVent,
  mortar: CONFIG.palette.mortar,         // T-014's Seed-Pod Tripod (same story: it
  mortarTell: CONFIG.palette.mortarTell, //   landed while this branch was in flight)
  mortarPod: CONFIG.palette.mortarPod,
  mortarMark: CONFIG.palette.mortarMark,
  mortarBlast: CONFIG.palette.mortarBlast,
  warden: CONFIG.palette.warden,
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
  /* ==== T-039 contact shadows ==== */
  contactShadow: 0x14171c,               // neutral near-black, grey-box family
  /* ==== /T-039 contact shadows ==== */
  // T-035 value ladder: EXACT identity, by requirement. gain 0 makes every
  // multiplier src/pure/shade.js returns exactly 1.0, so ?palette=classic is
  // still the byte-faithful grey-box instrument the queued Palette v1 A/B is
  // judged against — even with ?shade=1 also on the URL. If this ever becomes
  // "nearly" identity, that A/B stops being a controlled comparison.
  shade: { gain: 0 },
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
  /* ==== T-040 RIG silhouette ==== *
   * Three value zones is "about the most a 30 px figure can hold" (S8):
   * bright (unchanged player, above) for head/visor/gun arm, dark for
   * torso+pack, mid for legs. Darker steps down the SAME warm-neutral
   * muzzle family as `player` (a hue change would be a new color role —
   * decisions.md entry first, per the packet's correction) — low channel
   * spread, r >= g >= b, asserted in tools/pathcheck.mjs's T-040 block
   * alongside the luminance ladder and minimum separation between zones.
   * Widened past that floor on purpose: see CLASSIC's note above — a lit
   * MeshStandardMaterial plus ACES tone mapping compresses midtones hard
   * enough that a raw gap just over the floor read as nearly flat once
   * lit and tone-mapped, measured on screen. */
  playerDark: 0x565048,
  playerMid: 0xc3bead,
  /* ==== end T-040 ==== */
  gun: CONFIG.palette.gun,               // already the warm muzzle family
  // ENEMY acid green — now live on the meshes (src/render/hostiles.js);
  // the tell stays warm amber (a telegraph must not read as a body).
  wasp: 0x9ce23e,
  // T-003 (FAR readability): a diving wasp is COMMITTED, so it wears the
  // ecology's commitment language — the hot end of the acid family, like the
  // houndframe's charge glow and the polyp's live beam — never the warm amber
  // the roster reserves for a warning. It is the one cue that reads on a
  // 17px drone at the shipped default view.
  waspDive: 0xbdf03e,
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
  // Spore Mortar (T-014): the acid ecology's third body. Duller and darker
  // than the polyp so a LOBBING emplacement reads apart from a locking one at
  // FAR, where both are rooted silhouettes on the same deck.
  mortar: 0x8cc23a,
  mortarTell: CONFIG.palette.mortarTell, // the one warning language again: warm amber
  mortarPod: 0xe2ff7a,                   // the pod in flight — the brightest acid in
                                         //   the ecology, because the ARC is the read
  mortarMark: CONFIG.palette.mortarMark, // the marked patch is a warning, not a body:
  mortarBlast: CONFIG.palette.mortarBlast, //   warm in both modes, like every tell
  // A Crown mechanism, not part of the acid-grown hostile ecology. The
  // generated body supplies its rust/iron detail; this is its quiet light.
  warden: 0xb66f3d,
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
    hull: 0x68452f, scute: 0x9b6840, scuteAlt: 0xae7548,
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
  /* ==== T-039 contact shadows ==== */
  // A shadow sits ON the lit rust deck, not in the teal atmosphere, so this
  // stays a warm-dark near-black rather than joining the environment family —
  // MultiplyBlending darkens toward this token, never tints toward it, so its
  // hue reads faintly at most even at CONTACT_SHADOW.maxOpacity.
  contactShadow: 0x1c140f,
  /* ==== /T-039 contact shadows ==== */
  // T-035 value ladder, at full weight in the concept table: these tokens were
  // authored to land LIT (see the 0.45x note above), so the range under them is
  // the missing half of the same authoring, not a second palette. The DOSE the
  // operator approved lives in CONFIG.shade.dose, not here.
  shade: { gain: 1 },
};

/* ==== T-038 seam pips (S5): warm-white route-lip highlights =============
   Two tokens per table, both MUZZLE-family (role 5) per the packet's carried
   correction ("drop the amber" — the board canon this cites names warm-
   WHITE, and amber is the roster's one WARN language already). `seamPip` is
   the small bright core, `seamHalo` the dimmer additive glow around it.
   Ordering is asserted structurally, not just by value: a pip must sit
   below PAL.muzzle and every hostile *Tell* in luminance (it may never
   outshine the player's own fire or a warning telegraph — pillar 5's
   salience hierarchy), and outside the amber WARN hue FAMILY by shape (a
   small channel spread), not merely by differing from one exact hex, or a
   pip tuned to houndTell's hue at a different value would still pass a
   naive check. Additive; kept plainly dimmer than the tokens it must not
   outshine so the halo cannot fake past that ordering at render time. */
CLASSIC.seamPip = 0xc8c0b0;
CLASSIC.seamHalo = 0xa89c88;
CONCEPT.seamPip = 0xa99b82;
CONCEPT.seamHalo = 0x887d6b;
/* ==== end T-038 block ===================================================== */

/* ==== T-051 backdrop layers: near/mid/far atmospheric tint ===============
   Three stops, multiplied onto each plate's own pre-shaded art in
   src/render/backdrop.js (material.color against a textured map). The same
   atmospheric-perspective lever CONFIG.limb.backdrop's box tiers already use
   via PAL.limb's hull->wall->skyline ladder — warm/near, cooling toward the
   far/skyline family — so a textured plate and a box tier agree on which
   direction is "away." CONCEPT.backdropFar is deliberately identical to
   CONCEPT.limb.skyline for that same reason. Read by src/render/backdrop.js
   only. */
CLASSIC.backdropNear = 0x6e7480;
CLASSIC.backdropMid = 0x585e68;
CLASSIC.backdropFar = 0x454b53;
CONCEPT.backdropNear = 0xa8764c;
CONCEPT.backdropMid = 0x5c7a78;
CONCEPT.backdropFar = 0x2f545c;
/* ==== end T-051 block ===================================================== */

export const PALETTE_ID = resolvePaletteId(QUERY.get('palette'));
export const PAL = PALETTE_ID === 'classic' ? CLASSIC : CONCEPT;

/* The value ladder's dial (T-035). ON BY DEFAULT at the operator-approved
   dose (CONFIG.shade.dose = 0.5, verdict 2026-08-02: full strength is too
   dark, half is the look) — the default URL is the approved build, and the
   flag exists to compare against it:

     (absent)  the approved dose        ?shade=0  the pre-T-035 range, exactly
     ?shade=1  the rejected full ladder ?shade=x  anything between

   It is deliberately NOT the palette toggle: that would move hue and value
   together and neither could be judged on its own. With the ladder now on by
   default, the HUE-ONLY A/B the queued Palette v1 packet needs is
   `?palette=classic` against `?shade=0` — both have no ladder, so only the
   hue differs. `?palette=classic` alone stays byte-faithful to the pre-T-035
   grey-box whatever ?shade= says, because SHADE_GAIN folds in the table's
   own gain and CLASSIC.shade.gain is 0. The renderers (./limb.js,
   ./level.js) and the haze band (./camera.js) read this one number. */
export const SHADE_STRENGTH = resolveShadeGain(QUERY.get('shade'), CONFIG.shade.dose);
export const SHADE_GAIN = SHADE_STRENGTH * PAL.shade.gain;

// Transform-slice atmosphere remap (render-side; see CONCEPT.atmos). The
// table argument exists for pathcheck, which asserts both modes' behavior.
export function atmosphereBg(hex, table = PAL) {
  const mapped = table.atmos[hex];
  return mapped === undefined ? hex : mapped;
}

// The page behind the canvas matches the scene bg, so letterboxing and any
// gap around the canvas read as the same air the scene is drawn in.
// Deliberately NOT a pre-boot fix: index.html's CSS paints #232830 (the
// grey-box bg) before any module runs, and this write happens at module
// evaluation, so concept mode still shows one grey-box frame between first
// paint and src/main.js booting. Classic mode writes the same value the CSS
// already carries, so there it is an identity.
if (typeof document !== 'undefined' && document.body) {
  document.body.style.background = '#' + PAL.bg.toString(16).padStart(6, '0');
}
