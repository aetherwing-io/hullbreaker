/* ======================= PLAYER RIG (VISUAL) ====================== */
/* RIG's body, gun pose, and i-frame flicker. Driven entirely by sim
   fields on the player row — the rig itself carries no gameplay state.

   T-040, THIRD REWORK. First the operator rejected six boxes ("this is RIG?
   i was hoping for a much higher quality asset in line with the concept
   art") — at RIG's frozen ~30px on-screen height (decisions.md entry 7)
   more geometry cannot read. Second, a plain-shapes canvas sprite (still
   below: HELMET/TORSO/LEG_FRONT/LEG_BACK) replaced the boxes. Third,
   decisions.md entries 16/17 authorized runtime asset loading and confirmed
   FAR stays permanent, so RIG is now a REAL PNG SPRITE loaded through
   THREE.TextureLoader — the plain-shapes canvas version is kept as the
   FALLBACK plane, shown immediately and left showing if the image never
   loads. Entry 16's one attached condition: a failed/missing asset must
   degrade visibly and safely, and the SIM MUST NEVER BRANCH on which one
   rendered — nothing here writes back to src/sim/player.js, and the fallback
   is a fully-working render path on its own, not a placeholder.

   FOURTH FIX (playtest FAIL, same session): the async texture fetch, left to
   land mid-run, measurably broke `--deterministic` mode — three identical
   scripted runs landed at wildly different `gameMs`/`minEdgeMargin` because
   the fetch + image decode + first-use GPU upload competed with the frame
   loop for main-thread time on an unpredictable frame. FIFTH FIX (same
   session): T-049 hit the identical defect loading its own hostile sprites
   and built the shared answer, `src/render/preload.js` — one boot gate, one
   wall-clock budget, every registered texture uploaded during boot or
   abandoned. This module now registers through THAT gate (`preloadTexture`/
   `awaitPreloads`) instead of carrying its own bespoke timeout/lock-in
   machinery, so RIG's sprite and every other lane's runtime art share one
   contract and one measured cost instead of each lane re-deriving it. See
   `src/render/preload.js`'s own header for the full reasoning (residency
   means uploaded, not fetched; a late arrival after the budget closes is
   dropped, never applied mid-run).

   The gun stays the small 3D box it always was through all five fixes —
   untouched, still swept through 8-way aim every frame below. The sprite's
   own art is deliberately body-only (no weapon drawn), so it never doubles
   up against the separately-rotating gun mesh.

   KNOWN LIMITATION, logged after review found it (reports/tasks/T-040/
   build.md has the full account): `preload.js`'s `awaitPreloads()` was found
   unsafe for a SECOND module registering after the first snapshots its
   pending list — a race that needs two callers to exist. This file is
   currently the ONLY caller of preload.js in this codebase, and 10 fresh
   trials confirmed RIG's sprite always reaches 'ready', never a false
   'timeout' — so this single-caller use is not exposed. That is a claim
   about THIS file's usage, not a certification of preload.js's general
   multi-caller safety; re-check this note once a second lane also imports
   preload.js, or once T-049 lands its concurrency fix. */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { QUERY } from '../mode.js';
import { installView } from '../sim/bridge.js';
import { gameMs, blink } from '../sim/time.js';
import { player } from '../sim/player.js';
import { flowSnapshot } from '../sim/flow.js';
import {
  CANVAS_H, CANVAS_W, GUN_BOX, HELMET, LEG_BACK, LEG_FRONT, RIG_SPRITE_H, RIG_SPRITE_PATH,
  RIG_SPRITE_UV, RIG_SPRITE_W, SPRITE_H, SPRITE_W, TORSO, VISOR,
} from '../pure/rig.js';
import { awaitPreloads, preloadTexture } from './preload.js';
import { scene } from './scene.js';
import { placeOnTower } from './tower.js';
import { PAL } from './palette.js';
import { syncContactShadow } from './contact.js';

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

// Traces one of src/pure/rig.js's polygons onto the current 2D context,
// scaled to (w, h). A function rather than a stored path: Canvas2D paths
// are consumed by fill/clip/stroke in ways that are easiest to reason about
// by just re-tracing before each use.
function tracePoly(g, points, w, h) {
  g.beginPath();
  g.moveTo(points[0][0] * w, points[0][1] * h);
  for (let i = 1; i < points.length; i++) g.lineTo(points[i][0] * w, points[i][1] * h);
  g.closePath();
}

function traceEllipse(g, e, w, h) {
  g.beginPath();
  g.ellipse(e.x * w, e.y * h, e.rx * w, e.ry * h, 0, 0, Math.PI * 2);
}

/* Rasterizes RIG from src/pure/rig.js's shapes into a canvas: legs (mid),
   torso (dark, its own back-side pack bulge baked into the shape), helmet
   (mid), one accent visor. FLAT fills only — an earlier pass here tried a
   soft value-lift gradient and a thin rim-light/ink-outline stroke, and
   NEITHER survived the GPU's own minification down to RIG's true ~12px
   width: a stroke or gradient band that is only a couple of canvas texels
   wide is already sub-pixel once minified that far, so it blends away to
   nothing instead of reading as a separate feature (see reports/tasks/
   T-040/build.md's iteration log — caught by sampling actual on-screen
   pixels, not by trusting the flat 2D debug dump). What DOES survive
   minification is a BROAD, single-flat-color region occupying a real
   fraction of the figure's width — so every zone below is one flat fill,
   sized generously, and the shape's own silhouette (helmet dome, the
   pack's back bulge, two independently-posed legs) carries the "crafted"
   read instead of fine linework. Built once at module load — RIG has
   exactly one instance for the whole run (T-039's precedent note on
   src/render/contact.js applies here too), so there is no per-frame or
   per-instance redraw. */
function paintRigTexture() {
  const cv = document.createElement('canvas');
  cv.width = CANVAS_W;
  cv.height = CANVAS_H;
  const g = cv.getContext('2d');
  const w = CANVAS_W, h = CANVAS_H;
  const dark = hex(PAL.playerDark), mid = hex(PAL.playerMid), accent = hex(PAL.gun);

  g.fillStyle = mid;
  tracePoly(g, LEG_BACK, w, h); g.fill();
  tracePoly(g, LEG_FRONT, w, h); g.fill();

  g.fillStyle = dark;
  tracePoly(g, TORSO, w, h); g.fill();

  g.fillStyle = mid;
  traceEllipse(g, HELMET, w, h); g.fill();

  // the one accent: a warm visor glint on the helmet's front-lower face
  g.fillStyle = accent;
  g.beginPath();
  g.ellipse(VISOR.x * w, VISOR.y * h, VISOR.rx * w, VISOR.ry * h, 0, 0, Math.PI * 2);
  g.fill();

  const tex = new THREE.CanvasTexture(cv);
  return tex;
}

const rig = new THREE.Group();

// MeshStandardMaterial (LIT), not Basic, for BOTH planes below: palette.js's
// own header note says every token here is authored against what the light
// rig + ACES tone mapping PRODUCES, not the raw hex — an unlit material
// feeds a texture's raw RGB straight into that tone curve with no lighting
// attenuation first, and at these values ACES's midtone compression washed
// dark and mid almost to the same near-white (measured on screen: confirmed
// with ?view=near, not just the shipped FAR distance, which ruled out a
// minification artifact — see reports/tasks/T-040/build.md's iteration
// log). transparent BLENDING, not an alphaTest cutout: at RIG's tiny
// on-screen size the GPU's own mipmapping blurs a texture's alpha edges
// hard enough that a 0.5 cutoff discarded almost the whole shape, leaving a
// paper-thin sliver (same iteration log).

// FALLBACK plane: the plain-shapes canvas sprite. Built and shown
// immediately (synchronous, cannot fail) so RIG is never absent for even
// one frame while the real sprite is still loading.
const fallbackMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(SPRITE_W, SPRITE_H),
  new THREE.MeshStandardMaterial({ map: paintRigTexture(), transparent: true, side: THREE.DoubleSide }),
);
fallbackMesh.position.set(0, SPRITE_H / 2, 0);
rig.add(fallbackMesh);

// REAL sprite plane: built with no map yet, hidden until (if) the PNG
// finishes loading through the shared boot gate below.
const spriteMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(RIG_SPRITE_W, RIG_SPRITE_H),
  new THREE.MeshStandardMaterial({ transparent: true, side: THREE.DoubleSide }),
);
spriteMesh.position.set(0, RIG_SPRITE_H / 2, 0);
spriteMesh.visible = false;
rig.add(spriteMesh);

// ?rig=canvas is the escape hatch BACK to the plain-shapes fallback, for a
// direct side-by-side comparison — decisions.md entry 16 retired blanket
// off-by-default flags for approved work, so the sprite is the shipped
// DEFAULT and this is the opt-out, not the other way around.
const RIG_FORCE_CANVAS = QUERY.get('rig') === 'canvas';

// Runtime-loads the real sprite (decisions.md entry 16) through the SHARED
// boot gate (src/render/preload.js, built by T-049 after it hit this exact
// defect loading its own hostile sprites). Registration only queues the
// fetch; nothing here decides pass/fail until the single `awaitPreloads()`
// below settles it, which is also what forces the GPU upload during boot
// instead of on whichever frame first renders the texture.
//
// On 'ready': crop to just the drawn figure (RIG_SPRITE_UV — the source PNG
// is mostly transparent padding) via texture.offset/repeat, then swap the
// fallback out. On 'failed' or 'timeout': log once and leave the fallback
// showing, exactly as it has been since module load.
//
// This callback is the ONLY place that knows which plane is live; nothing in
// src/sim/ ever reads it, so the sim cannot branch on an asset's fate.
if (!RIG_FORCE_CANVAS) {
  preloadTexture(new URL(RIG_SPRITE_PATH, import.meta.url).href).then((entry) => {
    if (entry.state === 'ready') {
      const tex = entry.tex;
      tex.offset.set(RIG_SPRITE_UV.u0, RIG_SPRITE_UV.v0);
      tex.repeat.set(RIG_SPRITE_UV.u1 - RIG_SPRITE_UV.u0, RIG_SPRITE_UV.v1 - RIG_SPRITE_UV.v0);
      spriteMesh.material.map = tex;
      spriteMesh.material.needsUpdate = true;
      spriteMesh.visible = true;
      fallbackMesh.visible = false;
    } else {
      console.warn('RIG sprite did not load (' + (entry.error || entry.state) +
        '); showing the procedural fallback instead.');
    }
  });
}
// THE BOOT GATE. Top-level await: every module that (transitively) imports
// this one — in practice src/main.js, via its own side-effect `import
// './render/player.js'` — does not resume evaluation past that import, and
// so cannot reach its own `requestAnimationFrame(frame)` call, until every
// asset preload.js knows about (RIG's sprite, and whatever else other lanes
// have registered by this point in the module graph) is resident or the
// shared budget has given up on it. See src/render/preload.js's header for
// why this is a shared gate rather than a per-lane timeout: a second bespoke
// mechanism here would be exactly the thing decisions.md entry 16's
// playtest FAIL taught this lane not to build twice.
await awaitPreloads();

const gunGroup = new THREE.Group();
gunGroup.position.set(0, 1.05, 0.25);
const gun = new THREE.Mesh(
  new THREE.BoxGeometry(GUN_BOX.w, GUN_BOX.h, GUN_BOX.d),
  new THREE.MeshStandardMaterial({ color: PAL.gun, flatShading: true })
);
gun.position.set(GUN_BOX.x, GUN_BOX.y, GUN_BOX.z);
gunGroup.add(gun);
rig.add(gunGroup);
scene.add(rig);

// T-039 (S6, contact shadows): RIG has exactly one row, for its whole
// lifetime — never spawned or removed the way a hostile/capsule is — so a
// stable module-level identity is all `syncContactShadow` needs; there is no
// matching release call (see src/render/contact.js's header note).
const RIG_SHADOW_ID = Symbol('rig-contact-shadow');
const RIG_FOOTPRINT = CONFIG.player.width / 2;

// called at the end of updatePlayer, where the single-file build placed the rig
function sync() {
  placeOnTower(rig, player.x, player.y, 0);
  // crouch (?crouch=1) has to be visible or the lowered firing line is a
  // mystery: the body squashes to the crouched collision height and the gun
  // drops with the muzzle the sim is actually firing from.
  const squash = player.crouched ? CONFIG.crouch.height / CONFIG.player.height : 1;
  rig.scale.y = squash;
  gunGroup.position.y = player.muzzleY / squash;    // rig is squashed: undo it here
  gunGroup.rotation.z = Math.atan2(player.aim.y, player.aim.x);
  // both planes are authored facing +x (see src/pure/rig.js) — mirror
  // whichever is showing when the sim's own facing flips, the same sign
  // CONFIG.player.aim already uses, so the drawn pose (front leg, pack)
  // never points the wrong way while running left. Flipping both costs
  // nothing on the invisible one and means neither plane needs to know
  // which is currently on screen.
  const faceX = player.facing < 0 ? -1 : 1;
  fallbackMesh.scale.x = faceX;
  spriteMesh.scale.x = faceX;
  // A live momentum chain (?flow=1) leans the body into its own speed: the
  // chain has to be visible in the character, not only in the HUD. Presentation
  // only, and exactly zero without the flag.
  const lean = flowSnapshot().mult - 1;
  rig.rotation.z = lean > 0 ? -Math.sign(player.vx || 1) * lean * 1.4 : 0;
  rig.visible = gameMs >= player.iframesUntil || blink();
  syncContactShadow(RIG_SHADOW_ID, player.x, player.y, RIG_FOOTPRINT);
}
installView({ player: { sync } });
