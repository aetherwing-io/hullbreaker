// Domain: T-040 — RIG as a runtime sprite (look packet S8, decisions 15/16/17)
//
// Moved verbatim from the pre-split monolith into a domain module by the
// integrator during the T-040 merge; assertions unchanged in text and order.

import {
  BODY_HALF_WIDTH, BODY_HEIGHT, CANVAS_H, CANVAS_W, GUN_BOX, GUN_INNER_X,
  GUN_OUTER_X, HELMET, LEG_BACK, LEG_FRONT, LIFT_BOTTOM, LIFT_TOP,
  RIG_SPRITE_H, RIG_SPRITE_MAX_OVERRUN, RIG_SPRITE_PATH, RIG_SPRITE_UV,
  RIG_SPRITE_W, SPRITE_H, SPRITE_W, TORSO, VISOR, gunLocalXSpan,
  spriteImageViolations, spriteViolations,
} from '../../src/pure/rig.js';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG } from '../../src/config.js';
import {
  CLASSIC as PAL_CLASSIC, CONCEPT as PAL_CONCEPT,
} from '../../src/render/palette.js';
import { near, ok, srcDir, stripComments } from './_context.mjs';

export const title = 'T-040 — RIG silhouette (pure + guards)';

export async function run(SHARED) {
/* ================= T-040: RIG silhouette (pure + guards) ================ *
 * look-direction packet §3 item S8, REWORKED TWICE. First an operator
 * rejection of the six-box/three-zone pass this block used to gate: "this
 * is RIG? i was hoping for a much higher quality asset in line with the
 * concept art." At RIG's frozen ~30px on-screen height (decisions.md entry
 * 7) more geometry cannot read, so src/pure/rig.js moved to a canvas-
 * rasterized sprite — sanctioned technique per `.claude/skills/threejs-
 * textures/SKILL.md`'s guardrails, precedent at src/render/capsules.js's
 * faceTexture. Second, this file's OWN first attempt at that (a single
 * hand-plotted silhouette polygon, authored blind) painted as an
 * unreadable thin ribbon — see reports/tasks/T-040/build.md's iteration
 * log. RIG is now a small set of PLAIN SHAPES instead: one helmet ellipse,
 * one torso polygon (its own back-side pack bulge baked in), and two
 * independent leg polygons — verified by rendering the exact drawing code
 * standalone (a throwaway page.evaluate() canvas dump) before it ever
 * touched the real scene, not by re-deriving coordinates on paper again.
 *
 * The plane's own footprint is the whole envelope this block can gate
 * headlessly: bound it inside the frozen collision box and every pixel the
 * canvas can ever draw is bound with it, by construction — see src/pure/
 * rig.js's spriteViolations() and its own honesty note (no `document`/
 * canvas exists in src/pure/ or in this plain-Node process, so nothing here
 * can verify the RASTERIZED art — only the shapes feeding it).
 *
 * CARRIED FORWARD FROM THE BOX-LIST VERSION, unchanged: the gun is a small
 * 3D box, untouched by this rework, still swept through 8-way aim every
 * frame and still reaching |x| = 0.825 — more than twice the 0.35 collision
 * half-width. The envelope below is asserted over the BODY plane only; the
 * gun's wider, already-shipped reach is asserted separately, by name.     */
{
  // --- frozen collision constants this table binds to ---------------------
  ok(BODY_HALF_WIDTH === CONFIG.player.width / 2 && BODY_HALF_WIDTH === 0.35,
     'T-040: rig.js\'s body half-width is exactly half the frozen 0.7 collision width');
  ok(BODY_HEIGHT === CONFIG.player.height && BODY_HEIGHT === 1.7,
     'T-040: rig.js\'s body height is exactly the frozen collision height');

  // --- the shipped sprite data is clean ------------------------------------
  const shipped = spriteViolations();
  ok(shipped.length === 0,
     'T-040: the shipped RIG sprite data is inside its own envelope' +
     (shipped.length ? ' — ' + shipped.join('; ') : ''));
  ok(SPRITE_W / 2 <= BODY_HALF_WIDTH && SPRITE_H === BODY_HEIGHT,
     'T-040: the plane itself (not a per-part table) is what bounds every drawn pixel — ' +
     'width ' + SPRITE_W + ' (half ' + (SPRITE_W / 2).toFixed(3) + ' <= ' + BODY_HALF_WIDTH +
     '), height ' + SPRITE_H + ' === ' + BODY_HEIGHT);
  ok(TORSO.length >= 4 && LEG_FRONT.length >= 3 && LEG_BACK.length >= 3,
     'T-040: torso/leg shapes carry enough points to be real poses');

  // --- prove the guard actually rejects (LANE-BRIEF evidence standard: a
  // new assertion must be shown to bind by breaking the thing it guards) ---
  {
    const wideSprite = spriteViolations({ spriteW: 0.9 });
    ok(wideSprite.some((m) => /collision half-width/.test(m)),
       'T-040: the envelope guard rejects a plane wider than the collision half-width');
    const tallSprite = spriteViolations({ spriteH: 2.0 });
    ok(tallSprite.some((m) => /collision height/.test(m)),
       'T-040: the envelope guard rejects a plane taller than the collision height');
    const flatTorso = spriteViolations({ torso: [
      [0.50, 0.50], [0.51, 0.50], [0.51, 0.51], [0.50, 0.51],
    ] });
    ok(flatTorso.some((m) => /too small|too narrow/.test(m)),
       'T-040: the envelope guard rejects a degenerate (near-zero-area) torso');
    const offCanvas = spriteViolations({ torso: [...TORSO, [1.4, 0.5]] });
    ok(offCanvas.some((m) => /outside the \[0,1\] canvas/.test(m)),
       'T-040: the envelope guard rejects a shape point outside the canvas');
    const stretched = spriteViolations({ canvasW: 10, canvasH: 96 });
    ok(stretched.some((m) => /drifted from the plane/.test(m)),
       'T-040: the envelope guard rejects a canvas whose aspect no longer matches the plane');
    const badLift = spriteViolations({ liftTop: 0.8, liftBottom: 0.2 });
    ok(badLift.some((m) => /lift band is not ordered/.test(m)),
       'T-040: the envelope guard rejects an inverted lift-band order');
    const badVisor = spriteViolations({ visor: { x: 0.5, y: 0.1, rx: 0, ry: 0.02 } });
    ok(badVisor.some((m) => /visor accent is not a well-formed/.test(m)),
       'T-040: the envelope guard rejects a degenerate visor accent');
    const lowHelmet = spriteViolations({ helmet: { x: 0.5, y: 0.5, rx: 0.1, ry: 0.05 } });
    ok(lowHelmet.some((m) => /helmet never reaches the top/.test(m)),
       'T-040: the envelope guard rejects a helmet that does not reach the top of the canvas');
    const shortLegs = spriteViolations({ legFront: [[0.5, 0.5], [0.6, 0.5], [0.55, 0.6]],
      legBack: [[0.4, 0.5], [0.3, 0.5], [0.35, 0.6]] });
    ok(shortLegs.some((m) => /legs never reach the bottom/.test(m)),
       'T-040: the envelope guard rejects legs that do not reach the bottom of the canvas');
  }

  // --- the gun's swept reach: documented, not narrowed (unchanged from the
  // box-list version of this file) -----------------------------------------
  const [gLo, gHi] = gunLocalXSpan(GUN_BOX);
  near(gLo, GUN_INNER_X, 1e-9, 'T-040: gun inner x matches the exported constant');
  near(gHi, GUN_OUTER_X, 1e-9, 'T-040: gun outer x matches the exported constant');
  near(GUN_OUTER_X, 0.825, 1e-9,
       'T-040: gun reach at dead-horizontal aim is 0.825 (the packet\'s measured figure)');
  ok(GUN_OUTER_X > 2 * BODY_HALF_WIDTH,
     'T-040: the gun\'s swept reach (' + GUN_OUTER_X.toFixed(3) + ') is documented as MORE ' +
     'than double the body half-width (' + BODY_HALF_WIDTH.toFixed(3) + ') — the plane\'s own ' +
     'envelope guarantee does not extend to the separately-rotating gun mesh');

  // --- the real image sprite: envelope + honesty about the runtime path ---
  // (T-040 third rework, decisions.md entries 16/17: runtime asset loading
  // is authorized and FAR stays permanent — see src/pure/rig.js's header)
  {
    const shippedImg = spriteImageViolations();
    ok(shippedImg.length === 0,
       'T-040: the shipped image-sprite dimensions are inside their documented overrun ceiling' +
       (shippedImg.length ? ' — ' + shippedImg.join('; ') : ''));
    const wideImg = spriteImageViolations({ spriteW: 5 });
    ok(wideImg.some((m) => /collision-half-width ceiling/.test(m)),
       'T-040: the image-sprite guard rejects a plane past its documented overrun ceiling');
    const tallImg = spriteImageViolations({ spriteH: 5 });
    ok(tallImg.some((m) => /collision height/.test(m)),
       'T-040: the image-sprite guard rejects a plane taller than the collision height');
    const badUv = spriteImageViolations({ uv: { u0: 0.5, v0: 0.2, u1: 0.3, v1: 0.8 } });
    ok(badUv.some((m) => /UV crop rectangle/.test(m)),
       'T-040: the image-sprite guard rejects an inverted/malformed UV crop rectangle');
    ok(RIG_SPRITE_W / 2 <= BODY_HALF_WIDTH * RIG_SPRITE_MAX_OVERRUN,
       'T-040: the shipped sprite\'s own half-width clears its documented ' +
       RIG_SPRITE_MAX_OVERRUN + 'x overrun ceiling with no override');
    // the referenced PNG has to actually exist — a dangling path would load
    // silently into the fallback path forever, which is safe but not what
    // this block should quietly certify as fine
    const assetPath = join(srcDir, 'render', RIG_SPRITE_PATH);
    ok(existsSync(assetPath), 'T-040: RIG_SPRITE_PATH resolves to a file that exists on disk (' +
       RIG_SPRITE_PATH + ')');
  }

  // --- player.js paints from rig.js's data, not a parallel literal list ---
  const rigSrc = stripComments(readFileSync(join(srcDir, 'render', 'player.js'), 'utf8'));
  ok(/from\s+'\.\.\/pure\/rig\.js'/.test(rigSrc) && /TORSO/.test(rigSrc) &&
     /LEG_FRONT/.test(rigSrc) && /LEG_BACK/.test(rigSrc) && /HELMET/.test(rigSrc) && /GUN_BOX/.test(rigSrc),
     'T-040: player.js paints RIG from src/pure/rig.js\'s shape data, not a parallel literal list');
  ok(/CanvasTexture/.test(rigSrc) && /PlaneGeometry/.test(rigSrc),
     'T-040: RIG\'s body is a canvas-textured plane (sanctioned technique), not raw box geometry');
  ok(/player\.facing/.test(rigSrc) && /fallbackMesh\.scale\.x/.test(rigSrc) &&
     /spriteMesh\.scale\.x/.test(rigSrc),
     'T-040: the asymmetric (front-leg/pack) silhouette is mirrored by the sim\'s own facing sign, ' +
     'on both the fallback and the real sprite plane');
  ok(/preloadTexture/.test(rigSrc) && /RIG_SPRITE_PATH/.test(rigSrc),
     'T-040: RIG loads a real runtime sprite (decisions.md entry 16), through the shared ' +
     'src/render/preload.js boot gate (preloadTexture), not a bespoke loader');
  ok(/QUERY\.get\('rig'\)/.test(rigSrc) && /RIG_FORCE_CANVAS/.test(rigSrc),
     'T-040: an escape hatch (?rig=canvas) exists back to the fallback — the sprite ships ON by ' +
     'default per entry 16, not behind a flag the operator has to type');
  ok(/onerror|,\s*\(err\)\s*=>/.test(rigSrc) || /console\.warn/.test(rigSrc),
     'T-040: a failed sprite load is handled (logged), not left to throw or silently hang');

  // --- FIFTH FIX: the sprite-vs-fallback decision happens at BOOT, never
  // mid-run, through the ONE SHARED gate (src/render/preload.js, built by
  // T-049 after it hit the identical defect loading hostile sprites). The
  // original fix here was a bespoke per-lane timeout/lock-in
  // (loadRigSpriteBeforeBoot/Promise.race/RIG_SPRITE_BOOT_TIMEOUT_MS/
  // `settled`) — playtest FAIL: the async fetch previously landed on a live
  // frame and broke --deterministic mode, measured ~2s of gameMs drift on 1
  // run in 3 (reports/tasks/T-040/playtest.md). Team direction after T-049
  // shipped the shared gate: use it, do not keep a second mechanism. Gated
  // structurally so a future edit cannot silently reintroduce a bespoke
  // loader and pass every OTHER check in this block. --
  {
    ok(/import\s*\{[^}]*preloadTexture[^}]*\}\s*from\s*'\.\/preload\.js'/.test(rigSrc) &&
       /import\s*\{[^}]*awaitPreloads[^}]*\}\s*from\s*'\.\/preload\.js'/.test(rigSrc),
       'T-040: player.js registers RIG\'s sprite through the SHARED boot gate ' +
       '(preloadTexture/awaitPreloads from src/render/preload.js)');
    ok(/^await\s+awaitPreloads\(\)/m.test(rigSrc),
       'T-040: the shared gate is awaited at top level — every module that imports ' +
       'player.js (in practice src/main.js) cannot reach its own requestAnimationFrame ' +
       'call until every registered asset is resident or the shared budget gives up, so ' +
       'a texture upload can never land mid-run');
    ok(!/Promise\.race/.test(rigSrc) && !/RIG_SPRITE_BOOT_TIMEOUT_MS/.test(rigSrc) &&
       !/renderer\.initTexture\(/.test(rigSrc) && !/\bsettled\b/.test(rigSrc) &&
       !/loadRigSpriteBeforeBoot/.test(rigSrc),
       'T-040: player.js carries no second bespoke boot-timeout/lock-in mechanism ' +
       '(its own Promise.race, timeout constant, manual renderer.initTexture call, or ' +
       '`settled` flag) now that src/render/preload.js is the one shared gate every lane ' +
       'registers art with');
  }
  {
    const simPlayerSrc = stripComments(readFileSync(join(srcDir, 'sim', 'player.js'), 'utf8'));
    ok(!/sprite|fallbackMesh|spriteMesh|TextureLoader|preloadTexture|preload\.js/i.test(simPlayerSrc),
       'T-040: src/sim/player.js carries no reference to the sprite/fallback split or the ' +
       'preload gate — the sim cannot branch on whether the asset loaded (entry 16\'s one condition)');
  }

  // --- palette: the tokens the sprite paints from, in both modes ----------
  // (unchanged from the box-list version: playerDark/playerMid still exist,
  // still inside the muzzle-family value ladder, still keyed to PAL.player)
  const ch = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  const lum = (h) => { const [r, g, b] = ch(h); return r + g + b; };
  const GAP = 100;   // floor out of a 765 max sum — big enough that two
                      // near-identical tones (the packet's "2% apart" failure
                      // mode) cannot pass this the way a height-only gate would
  for (const [name, T] of [['classic', PAL_CLASSIC], ['concept', PAL_CONCEPT]]) {
    ok(T.playerDark !== undefined && T.playerMid !== undefined,
       'T-040: ' + name + ' table carries playerDark and playerMid');
    const bright = lum(T.player), mid = lum(T.playerMid), dark = lum(T.playerDark);
    ok(bright > mid && mid > dark,
       'T-040: ' + name + ' RIG value ladder is bright > mid > dark (' +
       bright + ' > ' + mid + ' > ' + dark + ')');
    ok(bright - mid >= GAP && mid - dark >= GAP,
       'T-040: ' + name + ' RIG zones clear a ' + GAP + '/765 luminance floor between ' +
       'every pair (' + (bright - mid) + ', ' + (mid - dark) + ')');
  }
  {
    const C = PAL_CONCEPT;
    const spread = (h) => { const [r, g, b] = ch(h); return Math.max(r, g, b) - Math.min(r, g, b); };
    ok([C.player, C.playerDark, C.playerMid].every((h) => spread(h) < 40),
       'T-040: concept RIG tones stay desaturated — a value ladder inside the existing ' +
       'muzzle role, not a saturated new hue (a hue change needs a decisions.md entry first)');
    ok([C.playerDark, C.playerMid].every((h) => { const [r, g, b] = ch(h); return r >= g && g >= b; }),
       'T-040: concept RIG tones keep the same warm-neutral channel order as PAL.player');
  }

  // --- draw-call budget: RIG now constructs 3 meshes (the fallback plane,
  // the real sprite plane, and the gun silhouette) — only 2 are ever VISIBLE at
  // once (fallback XOR sprite, plus the gun), so the actual per-frame draw
  // count stays 2, same as the second rework, down from 7 in the rejected
  // six-box/three-zone pass and the ORIGINAL 5 before T-040 ever started.
  // Counted structurally (every `new THREE.Mesh(` call), not a text guess.
  const meshCalls = (rigSrc.match(/new THREE\.Mesh\(/g) || []).length;
  ok(meshCalls === 3,
     'T-040: player.js constructs exactly 3 meshes (fallback plane + sprite plane + gun silhouette), got ' +
     meshCalls + ' — only 2 are ever visible at once (the two body planes toggle exclusively)');
  ok(/new THREE\.PlaneGeometry\(/.test(rigSrc) &&
     (rigSrc.match(/new THREE\.BoxGeometry\(/g) || []).length === 0 &&
     /fallbackGunGeo\s*=\s*GUN_GEOMETRIES\.R/.test(rigSrc),
     'T-040: RIG uses textured/body planes and an authored RIVET silhouette fallback; ' +
     'no featureless rectangular gun path remains');
  ok(CANVAS_W > 0 && CANVAS_H > 0 && LIFT_TOP < LIFT_BOTTOM && VISOR.rx > 0,
     'T-040: sprite data (canvas size, lift bands, visor) is present and sane for player.js to paint from');
}


}
