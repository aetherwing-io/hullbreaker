/* turn-proof.mjs — closed-loop policies and per-tick corner-turn invariants
 * for the shipped six-face run (SPRINT T-102).
 *
 * runTurnProof() drives tools/simlab/lib/sixface-host.mjs from boot to
 * VICTORY / GAME_OVER / a tick cap with ONE policy and records every
 * violation of the turn contract the T-102 acceptance names:
 *
 *   envelope   per-tick |ds| and |dy| stay inside the frozen movement envelope
 *              (CONFIG.player, RUN_FALLBACK, the pursuit plane); designed
 *              relocations (respawn, HULL FALLBACK) must land RIG on the owned
 *              side of every corner seal/frontier and never pop afterwards
 *   hinge      RIG never sinks through the solid joint apron; no fall-death
 *              ever happens at a hinge
 *   gateOpen   a corner never stays in `gate` once no gating body of its
 *              encounter survives (bound: the same tick); a halted corner
 *              never stays `idle`
 *   gateLegible while a gate holds, every present gating body is on screen
 *              and on the camera-facing facet, and the HUD names a non-zero
 *              requirement whenever the gate is shut
 *   turnFires  `approach` + RIG at the bend => `turning` on the same tick; a
 *              turn never starts with RIG anywhere but the bend
 *   facet      RIG's facet and the camera's facing facet never decrease on a
 *              forward run; RIG is never culled by the fold (render/player.js
 *              foldVisibility) while PLAYING
 *   ratchet    each corner's camera yaw lands exactly +60 deg (turnSign) and
 *              never leaves [base - windUp - eps, base + 60 + overshoot]
 *   neverWait  (T-201, rolling corners — the default) RIG is never held more
 *              than 0.2 s against a CLOSED joint it presses into; no beat
 *              waits longer than its 6 s bound; every staged or re-entering
 *              body starts condensing inside the projected frame, on the
 *              camera-facing facet (and >= 6 tiles inside the damage plane on
 *              a landscape view); every body carried round a corner re-enters
 *              on the arriving facet before the next turn (none lost); the HUD
 *              line fits its ~28-character slot and never calls a live
 *              encounter broken. These REPLACE the held-gate family
 *              (gateOpen/gateLegible) on rolling runs; that family still
 *              guards the `?gates=legacy` escape hatch.
 *
 * Policies are frame-exact functions of sim state (no wall clock). The
 * "oracle gunner" kills hostiles through the REAL death path
 * (hitHostile/forceBreakHostile -> destroyHostile -> removeHostile ->
 * onHostileRemoved) after a reaction delay; it models a perfect shot, so the
 * proof is about the TURN, not about winning the fight. That assist, and the
 * optional hp top-up ("god"), are reported in every summary.
 *
 * Dev-only; zero effect on the shipped game.                              */

import { bootSixFace } from './sixface-host.mjs';

export const VIEWPORTS = Object.freeze({
  desktop: Object.freeze({ width: 1280, height: 720 }),
  phoneLandscape: Object.freeze({ width: 844, height: 390 }),
  phonePortrait: Object.freeze({ width: 390, height: 844 }),
  // A narrow, tall window (split-screen tablet, a desktop window dragged thin)
  // — the only shipped framing whose right edge sits close enough to the halt
  // that the cleared-gate approach has to dolly the scroll toward the joint.
  narrowTall: Object.freeze({ width: 260, height: 1000 }),
});

export const POLICIES = Object.freeze([
  'run', 'jump', 'jump2', 'idle', 'backtrack', 'backtrack-approach',
  'die-at-hinge', 'die-mid-turn', 'die-after-turn', 'hit-mid-turn',
  'pause-mid-turn', 'resize-mid-turn', 'resize-approach', 'resize-approach-late', 'resize-gate',
  'drop-at-hinge', 'stock-life-at-hinge', 'pop-weapon-at-hinge',
]);

const FRAME_NDC_X = 1.03;

function envelopeFor(CONFIG, RUN_FALLBACK) {
  const P = CONFIG.player;
  const M = CONFIG.momentum || {};
  const plane = CONFIG.scrollSpeed * (M.hardCeilMult || 1);
  const vx = Math.max(P.runSpeed, P.wallJumpX, P.ledgeLaunchX, P.knockbackX,
    RUN_FALLBACK.tossVx, plane);
  const vy = Math.max(P.jumpVel, P.airJumpVel, -P.terminalVel, P.wallJumpY,
    P.ledgeLaunchY, P.knockbackY, Math.abs(RUN_FALLBACK.tossVy));
  // Contextual contact snaps (ledge catch, mantle launch, ladder entry) are
  // part of the frozen verb set; they are allowed only on a tick whose
  // traversal state changed, and bounded by the same CONFIG.player constants.
  const snapX = P.ledgeReachX + P.width + P.ledgeMantleInset + P.ledgeReleaseNudge + 0.6;
  const snapY = P.ledgeGrabHeight + P.ledgeReachY + 0.1;
  return { vx, vy, snapX, snapY, plane };
}

export async function runTurnProof(opts = {}) {
  const {
    policy = 'run', viewport = VIEWPORTS.desktop, query = '', dtMs = 1000 / 60,
    maxTicks = 60 * 420, god = true, reactionMs = 350, corners = [1, 2, 3, 4, 5, 6],
    trace = false, stopAfterCorner = null, gunnerMode = 'oracle', paceMs = 1400,
  } = opts;
  const H = await bootSixFace({ query, viewport });
  if (opts.onHost) opts.onHost(H);
  const { M, player: p, CONFIG } = H;
  const SCORE = await import(new URL('../../../src/pure/score.js', import.meta.url).href);
  const ENV = envelopeFor(CONFIG, SCORE.RUN_FALLBACK);
  const dt = dtMs / 1000;
  const { BEND_S, CORNER_S, HALT_S, facetAtBends } = M.PATH;
  const corner = (k) => M.WG.cornerEvents[k - 1];
  const apron = (k) => [CORNER_S[k - 1] - 5, CORNER_S[k - 1] + 2];
  // T-201: rolling corners (the default) vs the `?gates=legacy` held gate.
  const rolling = !!M.MODE.GATES_ROLLING;
  const RG = M.WAVES.ROLLING_GATES || null;
  // Bounds from the design, never from the code under test: the hold after
  // arrival is the acceptance box's 0.2 s; a beat's bound is the stated 6 s
  // (+ one frame); the damage-plane room is T-201's 6 tiles; the HUD slot ~28.
  const HOLD_BOUND_MS = 200;
  const BEAT_BOUND_MS = 6000;
  const PLANE_ROOM_TILES = 6;
  const HUD_MAX_CHARS = 28;
  const landscape = viewport.width >= viewport.height;

  H.resetGame();
  // RIG's NDC when pinned at the right clamp on the flat first face (yaw 0).
  const clampNdc = (() => {
    const sx = 40, x = sx + M.E.EDGE_R - CONFIG.edges.margin - p.hw;
    const saved = M.T.scrollX; M.T.setScrollX(sx);
    const n = H.camera.project(H.camera.worldOf(x, M.LV.groundTopAt(x) + 0.85, 1.15));
    M.T.setScrollX(saved);
    return Math.abs(n.x);
  })();
  const violations = [];
  const counts = Object.create(null);
  const note = (kind, detail) => {
    counts[kind] = (counts[kind] || 0) + 1;
    if (violations.length < 400) violations.push({ kind, tick, gameMs: +M.T.gameMs.toFixed(1), ...detail });
  };
  const perCorner = {};
  for (let k = 1; k <= 6; k++) perCorner[k] = {
    gateAt: null, approachAt: null, turnAt: null, doneAt: null, primedAt: null,
    killMetAt: null, approachX: null, turnX: null, gateHeldTicks: 0,
    gateInvisibleTicks: 0, gateOffFacetTicks: 0, gateHudZeroTicks: 0,
    pinnedTicks: 0, pinnedInputTicks: 0, stalledInputTicks: 0, yawMin: Infinity, yawMax: -Infinity,
    arrivedAtMs: null, heldAfterArrivalMs: 0, pursuers: null, carried: null, carriedEntered: 0,
    staged: 0, beatsReleased: 0, encounterKills: 0, survivorsAtTurn: null, dropped: 0,
    yawAfter: null, minNdcX: Infinity, maxNdcX: -Infinity, minNdcY: Infinity, maxNdcY: -Infinity,
    gateTicks: 0,
  };

  // --------------------------- policy state ----------------------------- //
  let tick = 0;
  let jumpHeldUntil = 0;
  let mode = 'run';                 // run | idle | back | hold
  let modeUntil = 0;
  let paused = 0;                   // remaining paused ticks (sim not stepped)
  let firedFor = new Set();         // per-corner one-shot actions
  let pendingHit = null;            // { amount, fromDx } applied inside the frame
  const hit = (amount, fromDx) => { pendingHit = { amount, fromDx }; };
  const frameHooks = {
    afterPlayer: () => {
      if (!pendingHit) return;
      const h = pendingHit; pendingHit = null;
      M.PL.damagePlayer(h.amount === 'all' ? p.hp : h.amount, p.x + h.fromDx);
    },
    beforeBullets: () => gunner(),
  };
  const press = (name) => H.keyEdge(name, true);
  const release = (name) => H.keyEdge(name, false);
  // T-201: the no-fire gunner never even holds the trigger (a run that never
  // shoots must still take every corner); every other gunner fires throughout
  if (gunnerMode !== 'none') press('fire');
  press('right');

  // Is a body something the player can SEE and SHOOT right now? Materialized,
  // on the camera-facing facet, and inside the projected frame.
  function killable(e, pose = H.camera.pose()) {
    if (M.T.gameMs < e.enterUntil) return false;
    if (facetAtBends(e.x, BEND_S) !== H.camera.facet()) return false;
    const n = H.camera.project(H.camera.worldOf(e.x, e.y, 0), pose);
    return !n.behind && Math.abs(n.x) <= 1 && Math.abs(n.y) <= 1;
  }
  let nextPacedKillAt = 0;
  const countKill = (e) => {
    const k = /^gate:(\d)$/.exec(e.encounterKey || '');
    if (k && perCorner[+k[1]]) perCorner[+k[1]].encounterKills++;
  };
  function gunner() {
    if (gunnerMode === 'none') return;       // T-201: never fires (no-softlock proof)
    if (gunnerMode === 'paced') {
      // A steady human-rate gunner: one kill per `paceMs`, only ever of a body
      // that is killable() — so a body hiding off-screen or past the bend
      // genuinely holds the gate until it comes back.
      if (M.T.gameMs < nextPacedKillAt) return;
      const pose = H.camera.pose();
      for (let i = M.HO.hostiles.length - 1; i >= 0; i--) {
        const e = M.HO.hostiles[i];
        if (e.kind === 'warden' || !killable(e, pose)) continue;
        countKill(e);
        M.HO.forceBreakHostile(e, 'R');
        nextPacedKillAt = M.T.gameMs + paceMs;
        return;
      }
      return;
    }
    // Oracle: a body is shot `reactionMs` after it finishes condensing. Gate
    // bodies use the real death path; ambient bodies likewise. Warded bodies
    // are broken through forceBreakHostile (same destroyHostile path).
    for (let i = M.HO.hostiles.length - 1; i >= 0; i--) {
      const e = M.HO.hostiles[i];
      if (e.kind === 'warden') continue;          // the finale owns its boss
      if (M.T.gameMs < e.enterUntil + reactionMs) continue;
      countKill(e);
      M.HO.forceBreakHostile(e, 'R');
    }
  }

  function gapJumpReflex() {
    if (p.grounded && (M.LV.groundTopAt(p.x + 1.2) < -100 ||
        M.LV.groundTopAt(p.x + 1.2) > p.y + 0.6)) {
      press('jump');
      jumpHeldUntil = M.T.gameMs + 420;
    }
    if (M.T.gameMs > jumpHeldUntil && M.IN.keys.jump) release('jump');
  }

  function setMove(dir) {
    if (dir > 0) { if (!M.IN.keys.right) press('right'); if (M.IN.keys.left) release('left'); }
    else if (dir < 0) { if (!M.IN.keys.left) press('left'); if (M.IN.keys.right) release('right'); }
    else { if (M.IN.keys.right) release('right'); if (M.IN.keys.left) release('left'); }
  }

  const once = (key) => { if (firedFor.has(key)) return false; firedFor.add(key); return true; };
  const altViewport = viewport.width >= viewport.height
    ? (viewport.width > 1000 ? VIEWPORTS.phonePortrait : VIEWPORTS.phonePortrait)
    : VIEWPORTS.phoneLandscape;

  function policyStep() {
    const c = M.WG.activeCorner();
    const k = c ? c.k : 0;
    const now = M.T.gameMs;
    if (mode !== 'run' && now >= modeUntil) mode = 'run';
    if (!c || !corners.includes(k)) { setMove(mode === 'back' ? -1 : mode === 'idle' ? 0 : 1); gapJumpReflex(); return; }
    const tMs = c.state === 'turning' ? now - c.tStart : -1;
    const toBend = BEND_S[k - 1] - p.x;
    switch (policy) {
      case 'jump':
        if (c.state === 'approach' && toBend < 1.6 && p.grounded && once('j' + k)) {
          press('jump'); jumpHeldUntil = now + 420;
        }
        break;
      case 'jump2':
        if (c.state === 'approach' && toBend < 2.4 && p.grounded && once('j' + k)) {
          press('jump'); jumpHeldUntil = now + 2000;
        } else if (firedFor.has('j' + k) && !p.grounded && p.vy < 1 && once('jj' + k)) {
          release('jump'); press('jump'); jumpHeldUntil = now + 420;
        }
        break;
      case 'idle':
        if (c.state === 'approach' && once('i' + k)) { mode = 'idle'; modeUntil = now + 4000; }
        break;
      case 'backtrack':
        if (c.state === 'turning' && once('b' + k)) { mode = 'back'; modeUntil = now + 1100 + 2200; }
        break;
      case 'backtrack-approach':
        if (c.state === 'approach' && once('b' + k)) { mode = 'back'; modeUntil = now + 1500; }
        break;
      case 'die-at-hinge':
        if (c.state === 'turning' && once('d' + k)) hit('all', -1);
        break;
      case 'stock-life-at-hinge':
        // the stock-lives tier: exhaust the fallback streak first, then die
        if (c.state === 'turning' && once('d' + k)) {
          p.fallbackStreak = 99; p.fallbackEarnedTiles = 0;
          hit('all', -1);
        }
        break;
      case 'die-mid-turn':
        if (tMs >= 500 && once('d' + k)) hit('all', -1);
        break;
      case 'die-after-turn':
        if (c.state === 'idle' && k > 1 && corner(k - 1).state === 'done' &&
            now - (perCorner[k - 1].doneAtMs ?? now) >= 300 && once('d' + (k - 1))) {
          hit('all', -1);
        }
        break;
      case 'hit-mid-turn':
        if (tMs >= 300 && once('h' + k)) hit(1, 1);
        break;
      case 'pause-mid-turn':
        if (tMs >= 450 && once('p' + k)) paused = 90;
        break;
      case 'resize-mid-turn':
        if (tMs >= 400 && once('r' + k)) H.setViewport(altViewport.width, altViewport.height);
        if (c.state === 'idle' && k > 1 && firedFor.has('r' + (k - 1)) && once('rb' + (k - 1)))
          H.setViewport(viewport.width, viewport.height);
        break;
      case 'resize-approach':
        if (c.state === 'approach' && once('r' + k)) H.setViewport(altViewport.width, altViewport.height);
        else if (c.state === 'turning' && once('rb' + k)) H.setViewport(viewport.width, viewport.height);
        break;
      case 'resize-approach-late':
        // portrait -> landscape after the narrow-view approach dolly has moved
        if (c.state === 'approach' && now - (perCorner[k].approachAtMs ?? now) >= 250 && once('r' + k))
          H.setViewport(altViewport.width, altViewport.height);
        else if (c.state === 'turning' && firedFor.has('r' + k) && once('rb' + k))
          H.setViewport(viewport.width, viewport.height);
        if (c.state === 'approach' && toBend < 0.5 && !firedFor.has('r' + k)) { mode = 'idle'; modeUntil = now + 50; }
        break;
      case 'resize-gate':
        if (c.state === 'gate' && once('r' + k)) H.setViewport(altViewport.width, altViewport.height);
        else if (c.state === 'approach' && once('rb' + k)) H.setViewport(viewport.width, viewport.height);
        break;
      case 'pop-weapon-at-hinge':
        // A carried gun knocked loose by a hit from the arena side while RIG
        // stands on the joint apron. Arm the gun early, hit once at the
        // frontier (gate) and once on the bend (approach).
        if (c.state !== 'turning' && c.state !== 'done' && toBend < 12 && !M.WP.carriedGun &&
            once('arm' + k)) M.WP.setWeapon('S');
        if (c.state === 'gate' && p.x >= CORNER_S[k - 1] && once('pg' + k)) hit(1, 0.6);
        if (c.state === 'approach' && toBend < 0.15 && once('pa' + k)) {
          if (!M.WP.carriedGun) M.WP.setWeapon('S');
          hit(1, 0.6);
        }
        break;
      case 'drop-at-hinge':
        // hold down through the approach so any one-way plate at the joint is
        // dropped through on the jump that crosses the bend
        if (c.state === 'approach' && toBend < 1.6 && once('dr' + k)) {
          press('down'); press('jump'); jumpHeldUntil = now + 300;
        }
        if (c.state === 'turning' && M.IN.keys.down) release('down');
        break;
      default: break;
    }
    setMove(mode === 'back' ? -1 : mode === 'idle' ? 0 : 1);
    gapJumpReflex();
  }

  // ------------------------------ checks -------------------------------- //
  let prev = null;
  let lastPlayerFacet = 0, lastCamFacet = 0;
  let livesPrev = p.lives, setbacksPrev = M.T.sliceStats.setbacks;
  let relocPending = 0;
  // A shut gate may show nothing for at most one entrance beat (the 900 ms
  // depth-condense every body already owes): beyond that the player is
  // waiting on something they cannot see.
  const blindBoundMs = CONFIG.wasp.enterMs + 1e-6;
  let pausedTicks = 0;
  // The designed snap's steepest per-tick step, derived from the DESIGN
  // constants rather than sampled from the curve under test (a bound read off
  // the implementation moves with any break in it): each snap eases its
  // amplitude with easeOutBack(backS), whose peak slope (at u = 0) is
  // backS + 3 times amplitude / duration.
  const yawStepMax = (() => {
    const W = CONFIG.waves, snap = CONFIG.path.turnDeg;
    const peakDegPerMs = Math.max((snap - W.windUpDeg) / W.snap1Ms, snap / W.snap2Ms) * (W.backS + 3);
    return peakDegPerMs * dtMs + 1e-6;
  })();
  const stateBefore = {};
  let endState = null;

  function gatingRows(c) {
    return M.HO.hostiles.filter((e) => e.encounterKey === c.encounterKey && !e.gateBreakExit && e.gating);
  }
  const condenseSeen = new Set();
  let pressRun = 0;
  // every body carried round corner k must have re-entered by the time the
  // next corner turns (or the run ends): none silently lost
  const checkCarry = (k) => {
    const ck = corner(k);
    if (!rolling || ck.state !== 'done' || ck.pursuers === 0) return;
    if (ck.carried !== ck.pursuers || ck.dropped)
      note('carryLost', { k, pursuers: ck.pursuers, carried: ck.carried, dropped: ck.dropped });
  };
  const hudIn = { k: 1, faces: 6, phase: '', nextPhase: '', primed: false, live: 0, pending: 0,
    following: 0, cleared: false, turning: false, greeting: false };

  for (tick = 0; tick < maxTicks; tick++) {
    if (paused > 0) {                      // PAUSED: the frame loop draws, never updates
      if (M.ST.state === 'PLAYING') M.ST.setState('PAUSED');
      paused--;
      if (paused === 0) M.ST.setState('PLAYING');
      pausedTicks++;
      continue;
    }
    if (M.ST.state !== 'PLAYING') { endState = M.ST.state; break; }
    // opts.shouldAbort: turnlab's child passes "my parent is gone" (checked
    // every 600 ticks — a syscall, so not every frame).
    if (opts.shouldAbort && tick % 600 === 0 && opts.shouldAbort()) { endState = 'ORPHANED'; break; }
    if (god) { p.hp = CONFIG.player.maxHealth; p.lives = Math.max(p.lives, 2); }
    const before = { x: p.x, y: p.y, trav: p.traversalState, gameMs: M.T.gameMs,
      lives: p.lives, setbacks: M.T.sliceStats.setbacks, scroll: M.T.scrollX,
      yaw: H.camera.yaw() };
    for (let k = 1; k <= 6; k++) stateBefore[k] = corner(k).state;
    policyStep();
    H.update(dt, frameHooks);
    if (M.T.scrollX < before.scroll - 1e-9)
      note('scrollBackwards', { from: before.scroll, to: M.T.scrollX,
        corner: M.WG.activeCorner() ? M.WG.activeCorner().k + ':' + M.WG.activeCorner().state : 'none' });
    {
      const dyaw = Math.abs(H.camera.yaw() - before.yaw) / M.PATH.DEG;
      if (dyaw > yawStepMax) note('cameraYawJump', { deg: +dyaw.toFixed(3), bound: +yawStepMax.toFixed(3),
        corner: M.WG.activeCorner() ? M.WG.activeCorner().k + ':' + M.WG.activeCorner().state : 'none' });
    }
    if (M.ST.state !== 'PLAYING') { endState = M.ST.state; }
    const relocated = p.lives < before.lives || M.T.sliceStats.setbacks > before.setbacks;
    const window = M.WG.cornerPlayerRouteWindow(p.hw);

    // -- envelope ------------------------------------------------------------
    if (endState !== 'GAME_OVER') {
      const dx = Math.abs(p.x - before.x), dy = Math.abs(p.y - before.y);
      const snapped = p.traversalState !== before.trav;
      const bx = ENV.vx * dt + (snapped ? ENV.snapX : 0) + 1e-6;
      const by = ENV.vy * dt + (snapped ? ENV.snapY : 0) + 1e-6;
      if (relocated) {
        relocPending = 2;
        if (p.x - p.hw < window.sealLeft - 1e-6 || p.x + p.hw > window.frontierRight + 1e-6)
          note('relocateOutsideOwnedRoute', { x: p.x, sealLeft: window.sealLeft,
            frontierRight: window.frontierRight, from: before.x });
      } else if (dx > bx || dy > by) {
        note(relocPending > 0 ? 'popAfterRelocation' : 'teleport',
          { dx: +dx.toFixed(3), dy: +dy.toFixed(3), x0: before.x, x: p.x, y0: before.y, y: p.y,
            bound: [+bx.toFixed(3), +by.toFixed(3)], trav: [before.trav, p.traversalState] });
      }
      if (relocPending > 0 && !relocated) relocPending--;
    }

    // -- hinge -----------------------------------------------------------------
    for (let k = 1; k <= 6; k++) {
      const [a0, a1] = apron(k);
      if (p.x < a0 || p.x > a1) continue;
      const top = M.LV.groundTopAt(p.x);
      if (top > -100 && before.y >= top - 1e-3 && p.y < top - 0.05 && !relocated)
        note('hingeFallThrough', { k, x: p.x, y0: before.y, y: p.y, top });
    }
    if (p.y < CONFIG.edges.killY + 1 && endState !== 'GAME_OVER') {
      for (let k = 1; k <= 6; k++) {
        const [a0, a1] = apron(k);
        if (before.x >= a0 - 1 && before.x <= a1 + 1) note('hingeFallDeath', { k, x: before.x });
      }
    }

    // -- capsules: a pickup over a solid deck column never sinks through it --
    for (const cap of M.CA.capsules) {
      const top = M.LV.groundTopAt(cap.x);
      if (top > -100 && cap.y < top - 0.05) {
        let near = 0;
        for (let k = 1; k <= 6; k++) if (Math.abs(cap.x - CORNER_S[k - 1]) <= 8) near = k;
        note('capsuleThroughDeck', { nearCorner: near, x: +cap.x.toFixed(2), y: +cap.y.toFixed(2), top,
          built: M.LV.columnBuilt(Math.floor(cap.x)), mode: cap.mode });
      }
    }

    // -- corner state machine ----------------------------------------------------
    for (let k = 1; k <= 6; k++) {
      const c = corner(k), pc = perCorner[k];
      if (c.primed && pc.primedAt === null) pc.primedAt = tick;
      if (c.state !== stateBefore[k]) {
        if (rolling && c.state === 'turning') {
          pc.pursuers = c.pursuers;
          pc.survivorsAtTurn = c.survivorsAtTurn;
          if (k > 1) checkCarry(k - 1);
        }
        if (c.state === 'gate') pc.gateAt = tick;
        if (c.state === 'approach') { pc.approachAt = tick; pc.approachX = p.x; pc.approachAtMs = M.T.gameMs; }
        if (c.state === 'turning') {
          pc.turnAt = tick; pc.turnX = p.x;
          if (Math.abs(p.x - BEND_S[k - 1]) > 1e-5) note('turnWithoutRigAtBend', { k, x: p.x });
          if (stateBefore[k] !== 'approach') note('turnSkippedApproach', { k, from: stateBefore[k] });
        }
        if (c.state === 'done') { pc.doneAt = tick; pc.doneAtMs = M.T.gameMs; }
      }
    }
    const c = M.WG.activeCorner();
    // -- never-wait (rolling corners, T-201) ------------------------------
    if (rolling && M.ST.state === 'PLAYING') {
      if (c && c.state === 'gate') note('gateStateInRolling', { k: c.k });
      // The climb is held only while RIG presses into a CLOSED joint (the
      // corner not yet open: idle, or a held gate): count consecutive such
      // ticks. Once the corner is open RIG walks the last tile to the bend and
      // the turn family checks that it fires there.
      if (c && c.state !== 'turning') {
        const frontier = c.s + 1 - CONFIG.edges.margin;
        const atJoint = p.x + p.hw >= frontier - 0.05;
        const closed = c.state === 'idle' || c.state === 'gate';
        const pressing = M.IN.keys.right && !M.IN.keys.left && atJoint && closed;
        const pc = perCorner[c.k];
        if (atJoint && pc.arrivedAtMs === null) pc.arrivedAtMs = M.T.gameMs;
        pressRun = pressing ? pressRun + 1 : 0;
        pc.heldAfterArrivalMs = Math.max(pc.heldAfterArrivalMs, pressRun * dtMs);
        if (pressRun * dtMs > HOLD_BOUND_MS + 1e-6)
          note('turnWaitedAfterArrival', { k: c.k, ms: +(pressRun * dtMs).toFixed(0), state: c.state, x: p.x });
        // no beat waits longer than its bound for the one before it
        if (c.primed && c.beat < c.beats && M.T.gameMs - c.beatAtMs > BEAT_BOUND_MS + dtMs + 1e-6)
          note('beatOverBound', { k: c.k, beat: c.beat, waitedMs: Math.round(M.T.gameMs - c.beatAtMs) });
        pc.beatsReleased = c.beat;
      } else pressRun = 0;
      // Every encounter body (and every survivor re-entering) starts to
      // condense where the player can see it.
      const pose = H.camera.pose();
      const L = M.E.sLeftEdge(), Rr = M.E.sRightEdge();
      for (const e of M.HO.hostiles) {
        const carriedBody = Number.isFinite(e.pursuitFrom);
        if (e.gateBreakExit || !(carriedBody || String(e.encounterKey || '').startsWith('gate:'))) continue;
        if (M.T.gameMs < e.enterUntil - CONFIG.wasp.enterMs) continue;
        const key = e.id + ':' + Math.round(e.enterUntil);
        if (condenseSeen.has(key)) continue;
        condenseSeen.add(key);
        const n = H.camera.project(H.camera.worldOf(e.x, e.y, 0), pose);
        const onFacet = facetAtBends(e.x, BEND_S) === H.camera.facet();
        const inStrip = e.x >= L + 0.5 && e.x <= Rr - 0.5;
        const inFrame = !n.behind && Math.abs(n.x) <= 1 && Math.abs(n.y) <= 1;
        const room = e.x - L;
        const k = carriedBody ? e.pursuitFrom : Number(String(e.encounterKey).slice(5));
        if (perCorner[k]) {
          if (carriedBody) perCorner[k].carriedEntered++;
          else perCorner[k].staged++;
        }
        if (!onFacet || !inStrip || !inFrame || (landscape && room < PLANE_ROOM_TILES))
          note(carriedBody ? 'carriedInvisible' : 'stagedOutsideView', { k, id: e.id, kind: e.kind,
            x: +e.x.toFixed(2), y: +e.y.toFixed(2), ndc: [+n.x.toFixed(3), +n.y.toFixed(3)],
            onFacet, room: +room.toFixed(2) });
      }
      // The encounter line: fits its slot, never calls a live encounter broken.
      if (c && typeof M.WAVES.rollingEncounterText === 'function' &&
          (c.state !== 'turning' || M.T.gameMs - c.tStart < CONFIG.waves.clearMsgMs)) {
        const st = M.WG.rollingEncounterStatus(c);
        hudIn.k = c.k; hudIn.faces = CONFIG.path.faces; hudIn.phase = c.phase;
        hudIn.nextPhase = c.k < CONFIG.path.faces ? M.WAVES.wavePhase(c.k + 1, CONFIG) : '';
        hudIn.primed = c.primed; hudIn.live = st.live; hudIn.pending = st.pending;
        hudIn.following = c.state === 'turning' ? c.pursuers : st.following;
        hudIn.cleared = c.state === 'turning' ? c.clearedAtTurn : st.cleared;
        hudIn.turning = c.state === 'turning';
        hudIn.greeting = c.k === 1 && M.T.scrollX < 14 && !c.primed;
        const text = M.WAVES.rollingEncounterText(hudIn);
        if (text.length > HUD_MAX_CHARS) note('hudTooLong', { k: c.k, text });
        const liveNow = M.HO.hostiles.some((e) => e.encounterKey === c.encounterKey && !e.gateBreakExit &&
          !Number.isFinite(e.pursuitFrom));
        if (/BROKEN/.test(text) && c.state !== 'turning' && liveNow)
          note('hudBrokenButAlive', { k: c.k, text });
      }
    }
    if (c) {
      const pc = perCorner[c.k];
      if (c.state === 'idle' && M.T.scrollX >= HALT_S[c.k - 1] - 1e-6) note('haltedButIdle', { k: c.k });
      if (c.state === 'gate') {
        pc.gateTicks++;
        const rows = gatingRows(c);
        if (rows.length === 0) { pc.gateHeldTicks++; note('gateShutWithKillConditionMet', { k: c.k }); }
        const present = rows.filter((e) => M.T.gameMs >= e.enterUntil - CONFIG.wasp.enterMs);
        const pose = H.camera.pose();
        let invisible = 0, offFacet = 0;
        for (const e of present) {
          if (facetAtBends(e.x, BEND_S) !== H.camera.facet()) offFacet++;
          const n = H.camera.project(H.camera.worldOf(e.x, e.y, 0), pose);
          if (n.behind || Math.abs(n.x) > 1 || Math.abs(n.y) > 1) invisible++;
        }
        if (offFacet) pc.gateOffFacetTicks++;
        if (invisible) pc.gateInvisibleTicks++;
        // The gate is shut, yet nothing of its encounter is visibly present on
        // the camera-owned screen (condensing counts: a body fading in is a
        // visible promise). That is "waiting without knowing why".
        const visiblePresence = M.HO.hostiles.some((e) =>
          e.encounterKey === c.encounterKey && !e.gateBreakExit &&
          M.T.gameMs >= e.enterUntil - CONFIG.wasp.enterMs &&
          facetAtBends(e.x, BEND_S) === H.camera.facet() &&
          (() => { const n = H.camera.project(H.camera.worldOf(e.x, e.y, 0), pose);
            return !n.behind && Math.abs(n.x) <= 1 && Math.abs(n.y) <= 1; })());
        if (rows.length && !visiblePresence) {
          pc.gateBlindTicks = (pc.gateBlindTicks || 0) + 1;
          pc._blindRun = (pc._blindRun || 0) + 1;
          pc.gateBlindMaxRun = Math.max(pc.gateBlindMaxRun || 0, pc._blindRun);
          if (pc._blindRun * dtMs > blindBoundMs) note('gateBlind', { k: c.k, ms: +(pc._blindRun * dtMs).toFixed(0) });
        } else pc._blindRun = 0;
        const hud = M.WAVES.activeGateThreatCount(M.HO.hostiles, c.encounterKey, M.T.gameMs, CONFIG.wasp.enterMs);
        if (hud === 0) pc.gateHudZeroTicks++;
        // What src/ui/hud.js prints for a held gate (static-guarded wiring),
        // against the harness's own count of surviving gating bodies.
        if (typeof M.WAVES.gateRequirementText === 'function') {
          const text = M.WAVES.gateRequirementText(M.WAVES.gateRequirement(
            M.HO.hostiles, c.encounterKey, M.T.gameMs, CONFIG.wasp.enterMs));
          if (text.startsWith('LAST SIGNAL') && rows.length !== 1)
            note('hudLastButMore', { k: c.k, gatingLeft: rows.length, text });
        } else if (hud === 1 && rows.length !== 1) {
          note('hudLastButMore', { k: c.k, gatingLeft: rows.length, text: 'LAST SIGNAL · CLOSING (pre-T-102 rule)' });
        }
      }
      if (c.state === 'approach' && p.x >= BEND_S[c.k - 1] - 1e-6) note('approachAtBendNoTurn', { k: c.k, x: p.x });
    }
    {
      // camera heading vs SIM truth: k completed corners => k x 60 degrees
      const doneCount = M.WG.cornerEvents.filter((ev) => ev.state === 'done').length;
      const want = doneCount * 2 * CONFIG.path.turnDeg * CONFIG.path.turnSign;
      if (Math.abs(H.camera.base() / M.PATH.DEG - want) > 1e-6)
        note('ratchetBaseMismatch', { doneCount, baseDeg: H.camera.base() / M.PATH.DEG, want });
    }
    for (let k = 1; k <= 6; k++) {
      const ck = corner(k);
      if (ck.state === 'turning') {
        const pc = perCorner[k];
        pc.pinnedTicks++;
        if (M.IN.keys.right || M.IN.keys.left) pc.pinnedInputTicks++;
        // T-201 (R4 A/B): the ticks RIG actually stood still with a direction
        // held — the hinge lock itself, not merely "the ritual was running".
        if ((M.IN.keys.right || M.IN.keys.left) && Math.abs(p.x - before.x) < 1e-9) pc.stalledInputTicks++;
        const rel = (H.camera.yaw() - H.camera.base()) / (M.PATH.DEG * CONFIG.path.turnSign);
        pc.yawMin = Math.min(pc.yawMin, rel); pc.yawMax = Math.max(pc.yawMax, rel);
      }
    }

    // -- facet monotonicity + RIG fold visibility ------------------------------
    if (endState !== 'GAME_OVER') {
      const pf = facetAtBends(p.x, BEND_S), cf = H.camera.facet();
      if (pf < lastPlayerFacet) note('playerFacetBackwards', { from: lastPlayerFacet, to: pf, x: p.x });
      if (cf < lastCamFacet) note('cameraFacetBackwards', { from: lastCamFacet, to: cf });
      lastPlayerFacet = Math.max(lastPlayerFacet, pf);
      lastCamFacet = Math.max(lastCamFacet, cf);
      if (M.ST.state === 'PLAYING' && H.camera.rigFoldVisible() !== 1)
        note('rigCulledByFold', { x: p.x, playerFacet: pf, cameraFacet: cf,
          corner: c ? c.k + ':' + c.state : 'none' });
      // framing (NDC of RIG's chest) — recorded per corner window, judged later
      const k = c ? c.k : 6;
      const pc = perCorner[k];
      const n = H.camera.project(H.camera.worldOf(p.x, p.y + 0.85, 1.15));
      if (!n.behind) {
        pc.minNdcX = Math.min(pc.minNdcX, n.x); pc.maxNdcX = Math.max(pc.maxNdcX, n.x);
        pc.minNdcY = Math.min(pc.minNdcY, n.y); pc.maxNdcY = Math.max(pc.maxNdcY, n.y);
      }
      // Bound: |ndc.x| <= 1.03. On a FLAT face RIG pinned at the calibrated
      // right clamp already renders its chest at |ndc| ~1.012 at 1280x720
      // (edges are calibrated on the z=0 route plane, RIG draws 1.15 toward
      // the camera) — a general framing fact reported separately and recorded
      // per run as clampNdc. The bound is a constant, never derived from the
      // clamp under test, so a looser clamp cannot loosen it.
      if (n.behind || Math.abs(n.x) > FRAME_NDC_X || Math.abs(n.y) > 1)
        note('rigOffScreen', { x: p.x, y: p.y, ndc: [n.x, n.y], clampNdc, corner: c ? c.k + ':' + c.state : 'none' });
    }
    if (opts.onTick) opts.onTick(tick, H);
    if (endState) break;
    if (stopAfterCorner && corner(stopAfterCorner).state === 'done' &&
        M.T.gameMs - perCorner[stopAfterCorner].doneAtMs > 3000) { endState = 'STOPPED'; break; }
  }

  for (let k = 1; k <= 6; k++) {
    const ck = corner(k);
    perCorner[k].carried = ck.carried;
    perCorner[k].dropped = ck.dropped;
  }
  // per-corner ratchet result
  for (let k = 1; k <= 6; k++) {
    const pc = perCorner[k];
    if (pc.doneAt === null) continue;
    const log = H.camera.finishedLog.find((r) => r.k === k);
    pc.yawAfter = log ? k * 2 * CONFIG.path.turnDeg : null;
    const W = CONFIG.waves;
    const over = 2 * CONFIG.path.turnDeg * 0.05 + 1e-9;
    if (pc.yawMin < W.windUpDeg - 1e-9 || pc.yawMax > 2 * CONFIG.path.turnDeg + over)
      note('ratchetOutOfEnvelope', { k, yawMin: pc.yawMin, yawMax: pc.yawMax });
  }
  const finishedCorners = Object.values(perCorner).filter((r) => r.doneAt !== null).length;
  return {
    policy, viewport, query, god, reactionMs, dtMs, gunnerMode, paceMs, rolling,
    endState: endState || (tick >= maxTicks ? 'TICK_CAP' : M.ST.state),
    ticks: tick, gameMs: +M.T.gameMs.toFixed(1), finishedCorners,
    finalX: +p.x.toFixed(3), scrollX: +M.T.scrollX.toFixed(3),
    lives: p.lives, setbacks: M.T.sliceStats.setbacks, pausedTicks,
    kills: M.HO.kills, shotsFired: M.WP.shotsFired,
    envelope: ENV, clampNdc, counts, violations, perCorner,
  };
}

/* collectPoses — play the run headlessly (policy `run`, oracle gunner) and
 * record the exact simulation state at each capture milestone of every
 * corner, for tools/playtest/turn-pose-capture.mjs. Milestones:
 *   approach     last approach tick with RIG within 0.7 tiles of the bend
 *   t<ms>        first turning tick whose ritual clock reaches <ms>
 *   done         first tick after the ritual completes
 *   after<ms>    first tick <ms> after `done`                              */
export async function collectPoses(opts = {}) {
  const labels = opts.labels || ['approach', 't0', 't350', 't640', 't680', 't700', 't860', 'done', 'after1500'];
  const poses = [];
  const pending = {};
  for (let k = 1; k <= 6; k++) pending[k] = labels.slice();
  const doneAt = {};
  const snap = (H, k, label, tMs) => {
    const { M, player: p } = H;
    poses.push({
      k, label, tMs, scrollX: M.T.scrollX, gameMs: M.T.gameMs,
      player: { x: p.x, y: p.y, vx: p.vx, vy: p.vy, grounded: p.grounded, facing: p.facing },
      corners: M.WG.cornerEvents.map((c) => ({ k: c.k, state: c.state, sealed: c.sealed })),
      cameraYawDeg: H.camera.yaw() / M.PATH.DEG, cameraFacet: H.camera.facet(),
    });
  };
  let lastApproach = {};
  await runTurnProof({ ...opts, policy: 'run', onTick: (tick, H) => {
    const { M, player: p } = H;
    for (let k = 1; k <= 6; k++) {
      const c = M.WG.cornerEvents[k - 1];
      const want = pending[k];
      if (!want.length) continue;
      const label = want[0];
      if (label === 'approach') {
        if (c.state === 'approach' && p.x >= M.PATH.BEND_S[k - 1] - 0.7) { snap(H, k, label, null); want.shift(); }
        else if (c.state !== 'idle' && c.state !== 'gate' && c.state !== 'approach') want.shift();
        continue;
      }
      if (c.state === 'done' && doneAt[k] === undefined) doneAt[k] = M.T.gameMs;
      if (label.startsWith('t') && c.state === 'turning') {
        const tMs = M.T.gameMs - c.tStart;
        if (tMs >= +label.slice(1)) { snap(H, k, label, tMs); want.shift(); }
      } else if (label.startsWith('t') && c.state === 'done') want.shift();
      else if (label === 'done' && c.state === 'done') { snap(H, k, label, null); want.shift(); }
      else if (label.startsWith('after') && doneAt[k] !== undefined &&
          M.T.gameMs - doneAt[k] >= +label.slice(5)) { snap(H, k, label, null); want.shift(); }
    }
  } });
  return poses;
}
