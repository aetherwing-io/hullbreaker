/* sixface-host.mjs — a renderer-free host for the DEFAULT six-face run.
 *
 * Built for SPRINT T-102 (corner turns). It drives the real, unmodified
 * simulation (src/sim/* + src/pure/*) in Node with a fixed timestep and
 * frame-scoped input, exactly the way tools/simlab/t2lab.mjs drives the
 * transform slice — but for the shipped run, with every default verb on
 * (momentum, CHARGE, HULL FALLBACK, aim assist, hit-stop).
 *
 * The frame loop and the run reset are TRANSCRIBED from src/main.js
 * (`update()` and `resetGame()`), because main.js is the composition root and
 * imports three.js. Render/UI calls are dropped, which is legal by the bridge
 * contract (src/sim/bridge.js: uninstalled hooks are no-ops). If main.js's
 * update order changes this file must change with it — the transcription is
 * annotated line-for-line so a diff is mechanical, and
 * tools/pathcheck/t-102-corner-turns.mjs guards the order statically.
 *
 * Three render-side quantities are replicated as PURE math (no THREE), because
 * the turn's player-visible correctness lives partly in them:
 *   - the screen-edge calibration (src/render/camera.js calibrateEdges) —
 *     edgesForViewport() below, cross-checked against the live page's
 *     HB.edges() in the T-102 build report. Since T-107 the lens (FAR, or the
 *     phone lens on a touch phone: src/pure/framing.js) and the actor-plane
 *     right clamp come from the SAME pure module camera.js calls, so a phone
 *     viewport is replayed with `viewport.touch = true` exactly as the page
 *     frames it (re-measured live by tools/playtest/phone-framing-probe.mjs);
 *   - the camera ratchet's yaw and its facing facet (camera.js syncCamera /
 *     cameraFacingFacet), driven by the same bridge hook the renderer uses;
 *   - the camera pose + perspective projection of RIG, for framing checks.
 *
 * Import this module only in a FRESH process: the sim layer owns module
 * singletons and src/mode.js reads globalThis.__HB_QUERY__ once at import.
 * Dev-only. Zero effect on the shipped game.                               */

import { fileURLToPath } from 'node:url';
// Pure, three.js-free and query-free (it imports config.js only), so a static
// import is safe before bootSixFace sets globalThis.__HB_QUERY__.
import * as FRAMING from '../../../src/pure/framing.js';

const SRC = new URL('../../../src/', import.meta.url);

/* ---------------- pure replicas of render/camera.js ------------------- */

// render/camera.js PORTRAIT_SAFE (copied; drift-guarded by pathcheck)
export const PORTRAIT_SAFE = Object.freeze({
  startAspect: 0.9,
  fullAspect: 0.56,
  compactViewDepthMult: 1.15,
  maxInsetPx: 46,
  lookDropTiles: 1.55,
});

function portraitBlend(w, h) {
  const aspect = w / h;
  if (aspect >= PORTRAIT_SAFE.startAspect) return 0;
  return Math.min(1, Math.max(0,
    (PORTRAIT_SAFE.startAspect - aspect) /
    (PORTRAIT_SAFE.startAspect - PORTRAIT_SAFE.fullAspect)));
}

export function portraitRightNdc(w, h) {
  const u = portraitBlend(w, h);
  const insetPx = Math.min(w * 0.18, PORTRAIT_SAFE.maxInsetPx * u);
  return 1 - 2 * insetPx / w;
}

export function portraitLookDrop(w, h) {
  return PORTRAIT_SAFE.lookDropTiles * portraitBlend(w, h);
}

// camera.js activeCameraDepth() for the default run (ACTIVE_FIXTURE null)
export function cameraDepthFor(CONFIG, w, h, viewId = 'far') {
  const aspect = w / h;
  const base = CONFIG.camera.z * Math.max(1, CONFIG.camera.portraitMinAspect / aspect);
  const mult = (CONFIG.viewScales[viewId] || CONFIG.viewScales.far).depthMult;
  let viewMult = mult;
  if (aspect < PORTRAIT_SAFE.startAspect) {
    const span = Math.max(1e-6, PORTRAIT_SAFE.startAspect - PORTRAIT_SAFE.fullAspect);
    const u = Math.min(1, Math.max(0, (PORTRAIT_SAFE.startAspect - aspect) / span));
    const target = Math.min(mult, Math.max(1, PORTRAIT_SAFE.compactViewDepthMult));
    viewMult = mult + (target - mult) * u;
  }
  return base * viewMult;
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// THREE.Object3D.lookAt for a camera: local -Z points at the target, +Y up.
export function lookBasis(eye, target) {
  const z = norm(sub(eye, target));
  let x = cross([0, 1, 0], z);
  if (Math.hypot(x[0], x[1], x[2]) < 1e-12) x = [1, 0, 0];
  x = norm(x);
  const y = cross(z, x);
  return { x, y, z };
}

// The lens the page resolves for this viewport (camera.js resolveActiveLens):
// the phone lens on a touch phone, FAR (fov 56, no lift) everywhere else, or
// whatever ?view= forces. `viewRequest` is mode.js VIEW_REQUEST (raw ?view=).
export function lensForViewport(CONFIG, w, h, viewId = 'far', touch = false, viewRequest = null) {
  const depth = cameraDepthFor(CONFIG, w, h, viewId);
  const id = FRAMING.resolveFramingId(viewRequest, w, h, touch, CONFIG);
  const lens = FRAMING.framingLens(id, w, h, depth, CONFIG);
  return { id: lens.id, fovDeg: lens.fovDeg, liftTiles: lens.liftTiles, depth };
}

// camera.js calibrateEdges() for the normal run: the probe camera at the flat
// rig pose through the resolved lens; EDGE_L on the z = 0 route plane, EDGE_R
// on the actor plane inset by RIG's widest drawn half-silhouette (I-104).
export function edgesForViewport(CONFIG, w, h, viewId = 'far', touch = false, viewRequest = null) {
  const L = lensForViewport(CONFIG, w, h, viewId, touch, viewRequest);
  const e = FRAMING.framedEdges({
    width: w, height: h, depth: L.depth, fovDeg: L.fovDeg, liftTiles: L.liftTiles,
    lookDrop: portraitLookDrop(w, h), rightNdc: portraitRightNdc(w, h),
  }, CONFIG);
  return [e.left, e.right];
}

/* --------------------------------- host -------------------------------- */

export async function bootSixFace({ query = '', viewport = { width: 1280, height: 720 },
  viewId = null } = {}) {
  globalThis.__HB_QUERY__ = query;
  const imp = (p) => import(new URL(p, SRC).href);
  const [
    C, B, T, E, IN, ST, LV, PL, WP, HO, CA, MO, SCR, SP, MD, FN, WG, SC, PATH,
    WAVES, ASC, MODE,
  ] = await Promise.all([
    'config.js', 'sim/bridge.js', 'sim/time.js', 'sim/edges.js', 'sim/input.js',
    'sim/state.js', 'sim/level.js', 'sim/player.js', 'sim/weapons.js',
    'sim/hostiles.js', 'sim/capsules.js', 'sim/mods.js', 'sim/score.js',
    'sim/spawner.js', 'sim/meridian-defense.js', 'sim/finale.js',
    'sim/wavegate.js', 'sim/scroll.js', 'pure/path.js', 'pure/waves.js',
    'pure/ascent.js', 'mode.js',
  ].map(imp));
  // Modules the reset touches that the loop does not otherwise import.
  const [PC, HK, FL, XF] = await Promise.all([
    'sim/pace.js', 'sim/hook.js', 'sim/flow.js', 'sim/transform.js',
  ].map(imp));
  const CONFIG = C.CONFIG;
  if (MODE.ACTIVE_FIXTURE) throw new Error('sixface-host drives the default run only');

  // The page's own resolution of ?view= (mode.js), so a replayed query frames
  // exactly as the page would; `viewport.touch` stands in for touch hardware.
  const VIEW = viewId || MODE.VIEW_ID || 'far';
  const VIEW_REQUEST = MODE.VIEW_REQUEST === undefined ? null : MODE.VIEW_REQUEST;
  const touch = !!viewport.touch;
  let width = viewport.width, height = viewport.height;
  let lens = lensForViewport(CONFIG, width, height, VIEW, touch, VIEW_REQUEST);
  const setViewport = (w, h) => {
    width = w; height = h;
    lens = lensForViewport(CONFIG, w, h, VIEW, touch, VIEW_REQUEST);
    const [l, r] = edgesForViewport(CONFIG, w, h, VIEW, touch, VIEW_REQUEST);
    E.setEdges(l, r);                  // the one render->sim write (bridge.js header)
  };
  setViewport(width, height);

  /* camera ratchet replica — render/camera.js camYaw/camYawBase/cornerFinished */
  const DEG = PATH.DEG;
  const STEP = 2 * CONFIG.path.turnDeg * DEG * CONFIG.path.turnSign;
  let camYaw = 0, camYawBase = 0;
  const cornerFinishedLog = [];
  B.installView({ corner: { finished: (c) => {
    camYawBase += STEP;
    camYaw = camYawBase;
    cornerFinishedLog.push({ k: c.k, gameMs: T.gameMs });
  } } });
  function syncCameraYaw() {                       // camera.js syncCamera, yaw half
    const c = WG.activeCorner();
    camYaw = c && c.state === 'turning'
      ? camYawBase + WAVES.cornerYawDeltaDeg(T.gameMs - c.tStart, CONFIG) * DEG * CONFIG.path.turnSign
      : camYawBase;
  }
  const FOLD_HANDOFF_PROGRESS = 0.96;              // camera.js
  function cameraFacingFacet() {
    const base = Math.round(camYawBase / STEP);
    const progress = Math.max(0, Math.min(1, (camYaw - camYawBase) / STEP));
    return Math.max(0, Math.min(CONFIG.path.faces,
      base + (progress >= FOLD_HANDOFF_PROGRESS ? 1 : 0)));
  }
  // render/player.js foldVisibility(): RIG drawn (1) or culled (0)
  function rigFoldVisible() {
    if (WG.turningCornerOwnsJoint(PL.player.x)) return 1;
    return PATH.facetAtBends(PL.player.x, PATH.BEND_S) === cameraFacingFacet() ? 1 : 0;
  }
  // render/route-visibility.js routeRenderable(s) for a route-bound renderable
  function routeRenderable(s) {
    const col = Math.floor(s);
    const built = col < 0 || col >= LV.LEVEL_LEN || LV.columnBuilt(col);
    return PATH.routeRenderOwned(s, built, T.scrollX, cameraFacingFacet(), CONFIG, PATH.BEND_S);
  }

  /* camera pose + projection replica — camera.js syncCamera, tower.js */
  // camera.js jointOrbitAnchorNow() (?orbit=joint, T-107): the anchor's pivot
  // slides along the chamfer with the ritual's yaw progress, and stays on the
  // arriving face's line until the scroll passes the chamfer.
  const JOINT_ORBIT = MODE.TURN_ORBIT === 'joint';
  function anchorNow() {
    const out = { x: 0, z: 0 };
    if (!JOINT_ORBIT) return PATH.polyAt(PATH.SEGS, T.scrollX, out);
    const chamfer = CONFIG.path.chamferTiles;
    const c = WG.activeCorner();
    if (c && c.state === 'turning' && Math.abs(STEP) >= 1e-6)
      return FRAMING.jointOrbitAnchor(PATH.polyAt, PATH.SEGS, T.scrollX, PATH.CORNER_S[c.k - 1],
        chamfer, (camYaw - camYawBase) / STEP, camYaw, out);
    const completed = Math.abs(STEP) >= 1e-6 ? Math.round(camYawBase / STEP) : 0;
    if (completed >= 1 && completed <= PATH.CORNER_S.length &&
        T.scrollX < PATH.CORNER_S[completed - 1] + chamfer)
      return FRAMING.jointOrbitAnchor(PATH.polyAt, PATH.SEGS, T.scrollX, PATH.CORNER_S[completed - 1],
        chamfer, 1, camYaw, out);
    return PATH.polyAt(PATH.SEGS, T.scrollX, out);
  }
  function cameraPose() {
    const Cc = CONFIG.camera;
    const depth = lens.depth;
    const a = anchorNow();
    const alt = ASC.normalAscentAltAt(T.scrollX, CONFIG.levelLength);
    const altAhead = ASC.normalAscentAltAt(T.scrollX + Cc.lookX, CONFIG.levelLength);
    const slope = (altAhead - alt) / Cc.lookX;
    const fx = Math.cos(camYaw), fz = -Math.sin(camYaw);
    const rx = -fz, rz = fx;
    const lift = lens.liftTiles;
    const eye = [a.x + fx * Cc.x + rx * depth, Cc.y + alt + slope * Cc.x + lift, a.z + fz * Cc.x + rz * depth];
    const look = [a.x + fx * Cc.lookX, Cc.lookY + altAhead - portraitLookDrop(width, height) + lift,
      a.z + fz * Cc.lookX];
    return { eye, basis: lookBasis(eye, look) };
  }
  function worldOf(s, y, depth = 0) {             // tower.js placeOnTower
    const p = PATH.polyAt(PATH.SEGS, s, { x: 0, z: 0 });
    const yaw = PATH.yawAt(PATH.SEGS, s, CONFIG.path.yawBlendTiles);
    const alt = ASC.normalAscentAltAt(s, CONFIG.levelLength);
    return [p.x + Math.sin(yaw) * depth, y + alt, p.z + Math.cos(yaw) * depth];
  }
  function project(world, pose = cameraPose()) {   // NDC, THREE convention
    const v = sub(world, pose.eye);
    const cx = dot(v, pose.basis.x), cy = dot(v, pose.basis.y), cz = dot(v, pose.basis.z);
    const tanH = Math.tan(lens.fovDeg * Math.PI / 360);
    const aspect = width / height;
    if (cz >= 0) return { x: NaN, y: NaN, behind: true, dist: -cz };
    return { x: cx / (-cz * tanH * aspect), y: cy / (-cz * tanH), behind: false, dist: -cz };
  }

  /* resetGame — src/main.js resetGame() + the sim rows of boot/run-reset.js */
  const player = PL.player;
  function resetGame() {
    // RUN_RESET_REGISTRY order (src/boot/run-reset.js); render rows dropped:
    PL.cancelSliceRetry();                         // slice-retry
    IN.releaseAllKeys(); IN.clearSwapBuffer();     // input-keys
    HO.clearHostiles();                            // hostiles      (corpses: render)
    WP.clearBullets();                             // projectiles   (tracers: render)
    CA.clearCapsules();                            // capsules
    WP.setWeapon('R');                             // starter-weapon
    WP.resetWeaponKills();                         // weapon-kills
    MO.clearMods();                                // modifiers
    CA.resetCarrierDrops();                        // carrier-drops
    T.setScrollX(0);                               // scroll
    PC.resetPace();                                // pace
    SCR.resetScore();                              // score
    SP.resetSpawner();                             // spawner
    MD.resetMeridianDefense();                     // meridian-defense
    FN.resetFinale();                              // finale
    HO.resetHostileRng();                          // hostile-rng
    HO.resetKills();                               // kill-count
    WP.resetShotsFired();                          // shot-count
    PL.resetPlayerForRun(6, 3);                    // player
    IN.clearHookBuffer();                          // hook-input
    HK.resetHook();                                // hook
    FL.resetFlow();                                // flow
    WG.resetCornerEvents();                        // corner-events
    XF.resetTransform();                           // transform
    T.resetHitStop();                              // hit-stop
    camYaw = 0; camYawBase = 0;                    // camera-yaw (render replica)
    LV.unbuildFutureFaces();                       // future-faces
    T.sliceStats.setbacks = 0;                     // slice-stats
    T.sliceStats.lastSetbackAt = -1e9;
    T.sliceStats.minEdgeMargin = Infinity;
    // resetGame() body after resetRunState():
    for (const p of LV.pockets)
      CA.spawnCapsule(p.reward.kind, p.reward.letter, p.reward.x, p.reward.y, p.reward.mode);
    SCR.scoreRunStart(CONFIG.gen.seed, 'six-face', 'normal');
    SC.updateScroll(0);
    syncCameraYaw();
    ST.setState('PLAYING');
  }
  B.installHost({ resetGame });

  /* update(dt) — src/main.js update(), render/UI calls dropped */
  // `hooks.afterPlayer` (optional) runs exactly where updateHostiles' contact
  // damage would land — after updatePlayer, before updateHostiles — so a policy
  // can inflict a hit through damagePlayer() at a hostile's own point in the
  // frame instead of between frames. `hooks.beforeBullets` runs where a
  // projectile kill would land (immediately before updateBullets).
  function update(dt, hooks = null) {
    T.advanceGameMs(dt * 1000);
    const hScale = T.stepHitStop(HO.kills, player.hp);
    const wScale = (T.gameMs < MO.mods.chronoUntil ? CONFIG.mods.chronoScale : 1) * hScale;
    SC.updateScroll(dt * wScale);
    syncCameraYaw();                               // syncCamera() — yaw replica
    SP.updateSpawner();
    MD.updateMeridianDefense();
    PL.updatePlayer(dt * hScale);
    if (ST.state !== 'PLAYING') return;
    if (hooks && hooks.afterPlayer) hooks.afterPlayer();
    if (ST.state !== 'PLAYING') return;
    HO.updateHostiles(dt * wScale);
    CA.updateCapsules(dt * wScale);
    MO.updateMods();
    if (hooks && hooks.beforeBullets) hooks.beforeBullets();
    WP.updateBullets(dt * hScale);
    SCR.updateScore(dt, {
      grounded: player.grounded, vx: player.vx,
      traversalState: player.traversalState,
      x: player.x, y: player.y,
      margin: player.x - player.hw - E.sLeftEdge(),
    });
    if (T.scrollX >= LV.END_SCROLL && !FN.finaleActive()) FN.startFinale();
    FN.updateFinale();
    if (FN.finaleComplete()) {
      SCR.scoreRunEnd('clear');
      ST.setState('VICTORY');
    }
  }

  // main.js applyGameplayKeyEdge(): the one key-edge path (jump/swap buffers)
  function keyEdge(name, down, repeat = false) {
    if (!down) { IN.keys[name] = false; return; }
    if (name === 'jump' && !repeat) IN.bufferJumpUntil(T.gameMs + CONFIG.player.jumpBufferMs);
    if (name === 'swap' && !repeat) IN.bufferSwapUntil(T.gameMs + 140);
    IN.keys[name] = true;
  }

  return {
    CONFIG, M: { C, B, T, E, IN, ST, LV, PL, WP, HO, CA, MO, SCR, SP, MD, FN, WG, SC, PATH, WAVES, ASC, MODE },
    player, resetGame, update, keyEdge, setViewport,
    viewport: () => ({ width, height, touch }),
    lens: () => ({ ...lens }),
    camera: { yaw: () => camYaw, base: () => camYawBase, facet: cameraFacingFacet,
      pose: cameraPose, project, worldOf, rigFoldVisible, routeRenderable, syncCameraYaw,
      finishedLog: cornerFinishedLog },
    srcDir: fileURLToPath(SRC),
  };
}
