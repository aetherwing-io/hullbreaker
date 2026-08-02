/* ========================= LIGHT RIG (data) ======================== */
/* The rig DESCRIPTORS and the arithmetic behind them. Deliberately free of
   three.js and of the DOM, exactly like ./palette.js and ./legibility.js, so
   tools/pathcheck.mjs can assert the value ladder, the flag resolution and
   the shadow band in Node — a static regex over ./lights.js could not say
   anything true about "the deck is still the brightest large surface".

   Authorized by docs/decisions.md entry 18 (a real light rig with shadow
   maps, tone mapping and exposure). The numbers live in CONFIG's LIGHT_RIG
   block (src/config.js); the colors stay palette tokens (./palette.js); the
   three.js objects are built in ./lights.js from the tables here.

   THE FRAME. Angles are VIEW-RELATIVE. Every light is placed in the camera's
   own basis and re-derived per frame from the face heading:

       travel  (cos yaw, 0, -sin yaw)   the run direction — screen right
       out     (sin yaw, 0,  cos yaw)   out of the screen, toward the camera
       up      (0, 1, 0)

   azimuth 0 = travel, +90 = out; elevation is degrees above the horizon.
   A world-fixed rig cannot work on a hexagonal tower: the six faces sit at
   60-degree intervals, so any fixed azimuth frontlights two of them and
   backlights two, and the deck — the brightest large surface, the anchor of
   the whole CONCEPT ladder — would change rank as the run turns corners.
   rigIrradiance() below is yaw-invariant for a view-framed rig and is not
   for a world-framed one; both properties are asserted.

   WHAT THIS IS NOT. The rig follows the CAMERA, not the clock. Nothing here
   animates: no light moves unless the view moves, so the creature's anatomy
   stays as static under this rig as it is under the shipped one
   (decisions.md entry 3, and the lighting skill's guardrail 6 — "lighting may
   not fake motion in the anatomy"). Through a corner the key turns WITH the
   view, which is what keeps the newly revealed facet lit the same way the
   old one was; that read is an open question for the operator, and it is why
   ?light=flat and ?light=noshadow exist.                                  */

import { CONFIG, LIGHT_RIG } from '../config.js';
import { DEG } from '../pure/path.js';
import { QUERY } from '../mode.js';
import { PAL } from './palette.js';

/* --------------------------- descriptors --------------------------- */

const KEY = {
  role: 'key', type: 'directional', frame: 'view', color: 'sun',
  intensity: LIGHT_RIG.key.intensity,
  azimuthDeg: LIGHT_RIG.key.azimuthDeg, elevationDeg: LIGHT_RIG.key.elevationDeg,
  casts: true,
};
const FILL = {
  role: 'fill', type: 'hemisphere', frame: 'view', sky: 'hemiSky', ground: 'hemiGround',
  intensity: LIGHT_RIG.fill.intensity,
  azimuthDeg: LIGHT_RIG.fill.azimuthDeg, elevationDeg: LIGHT_RIG.fill.elevationDeg,
  casts: false,
};
const RIM = {
  role: 'rim', type: 'directional', frame: 'view', color: 'hemiSky',
  intensity: LIGHT_RIG.rim.intensity,
  azimuthDeg: LIGHT_RIG.rim.azimuthDeg, elevationDeg: LIGHT_RIG.rim.elevationDeg,
  casts: false,
};
// ?light=bright: the same rig one step up the dose ladder — same angles, same
// rim, same shadow band, only the key and the exposure move.
const KEY_BRIGHT = { ...KEY, intensity: LIGHT_RIG.bright.keyIntensity };

/* The pre-T-047 rig, verbatim, as the A/B escape hatch (decisions.md entry
   16: an approved change ships ON by default, with a way back for
   comparison). These two descriptors reproduce src/render/scene.js's whole
   former rig — HemisphereLight(hemiSky, hemiGround, 1.1) at the default
   (0,1,0) plus DirectionalLight(sun, 1.6) at (6,12,8), no shadows, exposure
   1 — so ?light=flat is the before frame, not an approximation of it. */
const FLAT_FILL = {
  role: 'fill', type: 'hemisphere', frame: 'world', sky: 'hemiSky', ground: 'hemiGround',
  intensity: 1.1, worldPosition: [0, 1, 0], casts: false,
};
const FLAT_KEY = {
  role: 'key', type: 'directional', frame: 'world', color: 'sun',
  intensity: 1.6, worldPosition: [6, 12, 8], casts: false,
};

export const LIGHT_RIGS = {
  // the shipped rig: raking-but-top-dominant warm key, cool wrap, cool kicker
  rig: {
    id: 'rig', label: 'RIG', exposure: LIGHT_RIG.exposure, shadows: true,
    lights: [FILL, KEY, RIM],
  },
  // one dose up, unjudged: the operator's A/B for "how lit is lit enough"
  bright: {
    id: 'bright', label: 'RIG, BRIGHTER DOSE', exposure: LIGHT_RIG.bright.exposure, shadows: true,
    lights: [FILL, KEY_BRIGHT, RIM],
  },
  // the same rig with the shadow map off: isolates what the shadow pass costs
  // and what it hides, so the two questions can be judged apart
  noshadow: {
    id: 'noshadow', label: 'RIG WITHOUT SHADOWS', exposure: LIGHT_RIG.exposure, shadows: false,
    lights: [FILL, KEY, RIM],
  },
  // the pre-T-047 look, for side-by-sides
  flat: {
    id: 'flat', label: 'FLAT (pre-T-047)', exposure: 1, shadows: false,
    lights: [FLAT_FILL, FLAT_KEY],
  },
};

// Only an exact id selects an alternate; absence, '' and junk all resolve to
// the shipped rig. Same shape as resolvePaletteId (./palette.js) and
// resolveStartDirection (../pure/shell.js), and asserted the same way.
export function resolveLightRigId(value) {
  return Object.prototype.hasOwnProperty.call(LIGHT_RIGS, value) &&
    typeof value === 'string' ? value : 'rig';
}

export const LIGHT_RIG_ID = resolveLightRigId(QUERY.get('light'));
export const ACTIVE_RIG = LIGHT_RIGS[LIGHT_RIG_ID];

/* ----------------------------- vectors ----------------------------- */

// unit vector from the lit point TOWARD the light, in world space
export function lightVector(light, yawRad = 0, out = { x: 0, y: 0, z: 0 }) {
  if (light.frame === 'world') {
    const [x, y, z] = light.worldPosition;
    const len = Math.hypot(x, y, z) || 1;
    out.x = x / len; out.y = y / len; out.z = z / len;
    return out;
  }
  const a = light.azimuthDeg * DEG, e = light.elevationDeg * DEG;
  const ce = Math.cos(e);
  // travel * cos(a) + out * sin(a), both rotated by the face heading
  const tx = Math.cos(yawRad), tz = -Math.sin(yawRad);
  const ox = Math.sin(yawRad), oz = Math.cos(yawRad);
  out.x = ce * (tx * Math.cos(a) + ox * Math.sin(a));
  out.y = Math.sin(e);
  out.z = ce * (tz * Math.cos(a) + oz * Math.sin(a));
  return out;
}

/* The five canonical surface families of a box world, named for what they
   are in play rather than for their axis. Every large surface in the frame is
   one of these, which is what makes the value ladder checkable:
     top        the deck, catwalk tops, the top faces of armour plate
     camera     the wall behind the play plane, facing the viewer
     travel     a face looking down the run (the near side of a riser)
     antiTravel a face looking back up the run (the far side of a riser)
     under      the underside of a platform or plate                       */
export function surfaceNormal(kind, yawRad = 0, out = { x: 0, y: 0, z: 0 }) {
  const tx = Math.cos(yawRad), tz = -Math.sin(yawRad);
  const ox = Math.sin(yawRad), oz = Math.cos(yawRad);
  if (kind === 'top') { out.x = 0; out.y = 1; out.z = 0; }
  else if (kind === 'under') { out.x = 0; out.y = -1; out.z = 0; }
  else if (kind === 'camera') { out.x = ox; out.y = 0; out.z = oz; }
  else if (kind === 'travel') { out.x = tx; out.y = 0; out.z = tz; }
  else if (kind === 'antiTravel') { out.x = -tx; out.y = 0; out.z = -tz; }
  else throw new Error('unknown surface kind: ' + kind);
  return out;
}

export const SURFACE_KINDS = ['top', 'camera', 'travel', 'antiTravel', 'under'];

/* ---------------------------- irradiance --------------------------- */

// three.js works in linear space (ColorManagement is on by default in r155+),
// so a token's WEIGHT as a light is its linear relative luminance, not its
// sRGB byte value.
function srgbChannelToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function tokenLuminance(hex) {
  const r = srgbChannelToLinear(((hex >> 16) & 255) / 255);
  const g = srgbChannelToLinear(((hex >> 8) & 255) / 255);
  const b = srgbChannelToLinear((hex & 255) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const _l = { x: 0, y: 0, z: 0 };
const _n = { x: 0, y: 0, z: 0 };

/* The diffuse irradiance a surface family receives from a rig, as a multiple
   of albedo, using three.js' own model: a directional light contributes
   intensity * max(0, n.l) / PI, and a hemisphere light contributes
   mix(ground, sky, 0.5 + 0.5 * n.up_light) * intensity / PI. White light is
   assumed except for the token's luminance, which is what makes the answer a
   VALUE rather than a color — the ladder this exists to protect is a value
   ladder (src/render/palette.js:28-32: the deck stays the brightest large
   surface). Tone mapping and exposure are applied on top of this by the
   renderer and are monotonic, so they cannot reorder the ladder. */
export function rigIrradiance(rig, surfaceKind, yawRad = 0, pal = PAL) {
  const r = typeof rig === 'string' ? LIGHT_RIGS[resolveLightRigId(rig)] : rig;
  surfaceNormal(surfaceKind, yawRad, _n);
  let sum = 0;
  for (const light of r.lights) {
    lightVector(light, yawRad, _l);
    if (light.type === 'hemisphere') {
      const t = 0.5 + 0.5 * (_n.x * _l.x + _n.y * _l.y + _n.z * _l.z);
      const sky = tokenLuminance(pal[light.sky]);
      const ground = tokenLuminance(pal[light.ground]);
      sum += (ground + (sky - ground) * t) * light.intensity / Math.PI;
    } else {
      const d = _n.x * _l.x + _n.y * _l.y + _n.z * _l.z;
      if (d > 0) sum += tokenLuminance(pal[light.color]) * light.intensity * d / Math.PI;
    }
  }
  return sum;
}

/* ------------------------ shadow enrollment ------------------------ */

/* What a mesh does with light, decided from its MATERIALS rather than from
   the module that built it — see ./lights.js's header for why the decision
   cannot live in the lane-owned mesh modules. Kept here, on plain
   descriptors, so the policy is checkable in Node: `lit` is "a material the
   lights reach at all" (Standard/Physical/Lambert/Phong/Toon — everything
   unlit in this codebase is an effect), `opaque` is "not transparent, writes
   depth, blends normally".

   The two answers that matter and are easy to get wrong:
     * an unlit additive quad (bullet, spark, flash, beam, contact shadow)
       casts NOTHING — it is light, not matter;
     * a lit but TRANSPARENT body (a hostile fading in at opacity 0, or
       dissolving on death) receives but does not cast, because three.js'
       depth material ignores opacity: it would throw a full-strength shadow
       for a body that is not on screen yet. */
export function shadowPolicy(materials, override) {
  if (override === 'none') return { cast: false, receive: false, why: 'override' };
  if (override === 'cast') return { cast: true, receive: false, why: 'override' };
  if (override === 'receive') return { cast: false, receive: true, why: 'override' };
  if (override === 'both') return { cast: true, receive: true, why: 'override' };
  const mats = Array.isArray(materials) ? materials : [materials];
  if (!mats.length || mats.some((m) => !m)) return { cast: false, receive: false, why: 'no-material' };
  if (!mats.every((m) => m.lit)) return { cast: false, receive: false, why: 'unlit' };
  if (!mats.every((m) => m.opaque)) return { cast: false, receive: true, why: 'lit-transparent' };
  return { cast: true, receive: true, why: 'lit-solid' };
}

/* ---------------------------- shadow band -------------------------- */

// world tiles per shadow-map texel: the readability bound on a 1.9-tile RIG
export function shadowTexelTiles(shadow = LIGHT_RIG.shadow) {
  return 2 * shadow.halfWidth / shadow.mapSize;
}

/* Half the width of the strip the camera can actually see at the play plane,
   in tiles. The shadow band is fitted to THIS rather than to the world: a
   frustum spanning a continent-sized creature is both useless (no texel
   density) and slow, and one narrower than the frame ends mid-screen in a
   visible line. Mirrors src/render/camera.js's activeCameraDepth() for the
   default (no traversal fixture) case, which is the run the shadow band is
   authored for. */
export function playBandHalfWidthTiles(aspect, viewId = 'far') {
  const view = CONFIG.viewScales[viewId] || CONFIG.viewScales.far;
  const depth = CONFIG.camera.z * view.depthMult;
  return depth * Math.tan(CONFIG.camera.fov * DEG / 2) * aspect;
}

export function playBandHalfHeightTiles(viewId = 'far') {
  const view = CONFIG.viewScales[viewId] || CONFIG.viewScales.far;
  const depth = CONFIG.camera.z * view.depthMult;
  return depth * Math.tan(CONFIG.camera.fov * DEG / 2);
}

// Quantize a light-space coordinate to whole texels. Without it, an ortho
// shadow camera that follows the run makes every shadow edge crawl as the
// sample grid slides under it.
export function snapToTexel(value, texel) {
  return texel > 0 ? Math.round(value / texel) * texel : value;
}
