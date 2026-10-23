#!/usr/bin/env node
/* thumb-overlap.mjs — how often is RIG drawn under the touch deck's thumbs in
 * PLAY? (SPRINT T-107: "frame so RIG and the landing band are never under the
 * cluster or the stick zone in phone landscape".) The T-107 pathcheck domain
 * and vertical-band.mjs answer it for the authored geometry (every reachable
 * surface at every scroll); this answers it for what players do.
 *
 *   node tools/simlab/framing/thumb-overlap.mjs [--viewports phone-landscape,phone-landscape-far]
 *        [--seeds 2] [--max-game-ms 300000] [--jobs 2] [--json out.json]
 *        [--hud-from <tools/playtest/phone-framing-probe.mjs JSON>]
 *
 * Runs the race lab's replica (tools/simlab/race/run-child.mjs, 100 ms trace)
 * for rush / climber / fighter / carried x seeds plus the oracle@0 racer.
 * For every traced frame on a straight face — corner state moving, gate or
 * approach, and not within 4 s after a turn (the post-turn catch-up orbits
 * the halt point, which this replica does not model) — RIG's painted box
 * (feet to RIG_BODY_VISUAL_H, +-0.65 tiles about his x, at his draw depth) is
 * projected through render/camera.js syncCamera() replicated
 * (tools/simlab/framing/veil-need.mjs cameraPose) and tested against
 * src/pure/touch-stick.js touchDeckLayout() — the layout the T-101 deck
 * publishes as __HB_TOUCH().layout:
 *   cluster  the right-thumb cluster box (JUMP/FIRE hit circles + SWAP);
 *   ghost    the resting stick ghost's circle (where an idle left thumb sits).
 * Both without insets (desktop Chrome emulation) and with the iPhone's
 * landscape safe-area insets (left/right 47, bottom 21). Reported per policy:
 * the share of frames RIG's box overlaps each, and the worst overlap in CSS
 * px (how far into the circle / below the cluster's top edge), with the
 * overlapping frames split by where RIG's feet were (below the lowest landing
 * deck = in a pit; on it; above it); and the share of frames RIG's painted
 * head is above the frame's top edge (mid-jump included — the pathcheck's
 * band assertion covers standing only).
 *
 * --hud-from adds the HUD panels a live probe measured at the same viewport
 * (facts.hud: e.g. main's RIG panel and objective panel) as a third target,
 * reported the same way — the HUD is T-105's lane; this only measures it.
 *
 * Honest limits: straight faces only (turn frames: the posed captures); the
 * oracle racer's kills are instrumented (it is a pacing reference, not a
 * player). Dev-only; zero effect on the game.                              */

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const VPS = opt('viewports', 'phone-landscape,phone-landscape-far').split(',');
const SEEDS = +opt('seeds', '2');
const MAX = +opt('max-game-ms', '300000');
const JOBS = +opt('jobs', '2');
const imp = (p) => import('file://' + join(ROOT, p));
const { CONFIG } = await imp('src/config.js');
const FR = await imp('src/pure/framing.js');
const PATH = await imp('src/pure/path.js');
const ASC = await imp('src/pure/ascent.js');
const RIG = await imp('src/pure/rig.js');
const TS = await imp('src/pure/touch-stick.js');
const LV = await imp('src/sim/level.js');            // read-only: the lowest landing deck
const { VIEWPORTS } = await imp('tools/simlab/race/edges.mjs');
const VEIL = await imp('tools/simlab/framing/veil-need.mjs');

const INSETS = {
  none: { top: 0, right: 0, bottom: 0, left: 0 },
  iPhone: { top: 0, right: 47, bottom: 21, left: 47 },
};
const STEP = 2 * CONFIG.path.turnDeg * PATH.DEG * CONFIG.path.turnSign;
const AD = CONFIG.framing.actorDepth;
const STRAIGHT = new Set(['moving', 'gate', 'approach']);
const CATCH_UP_MS = 4000;
const lowestDeck = Math.min(...LV.groundH.filter((g) => g > -100));
const HUD_FROM = opt('hud-from', null);
const HUD = HUD_FROM ? JSON.parse(readFileSync(resolve(HUD_FROM), 'utf8')) : null;
function hudBoxes(w, h) {
  const v = HUD && HUD.viewports.find((q) => q.viewport === `${w}x${h}`);
  if (!v || !v.facts || !v.facts.hud) return [];
  return Object.entries(v.facts.hud)
    .filter(([name, b]) => b && name !== 'thumbDeck' && name !== 'touchDeck' && b.w > 0 && b.h > 0 && b.w < w)
    .map(([name, b]) => ({ name, ...b }));
}
// overlap of two boxes: how far RIG's box reaches up into a top panel where
// they share columns (> 0 = under the panel)
function panelDepth(b, P) {
  if (b[2] <= P.x || b[0] >= P.x + P.w || b[3] <= P.y) return -Infinity;
  return P.y + P.h - b[1];
}

function child(spec) {
  return new Promise((res, rej) => {
    const c = spawn(process.execPath, [join(ROOT, 'tools', 'simlab', 'race', 'run-child.mjs'), JSON.stringify(spec)], { cwd: ROOT });
    let s = '', e = '';
    c.stdout.on('data', (d) => { s += d; });
    c.stderr.on('data', (d) => { e += d; });
    c.on('close', (code) => code === 0 ? res(JSON.parse(s)) : rej(new Error(e.slice(0, 300))));
  });
}

// RIG's painted box in CSS px for a traced frame (rig-boxes.mjs's projection)
function rigBox(x, y, scrollX, k, lens, w, h) {
  const pose = VEIL.cameraPose({ scrollX, yaw: (k - 1) * STEP, lens });
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const dx of [-0.65, 0.65]) for (const dy of [0, RIG.RIG_BODY_VISUAL_H]) {
    const s = x + dx;
    const q = PATH.polyAt(PATH.SEGS, s, { x: 0, z: 0 });
    const yw = PATH.yawAt(PATH.SEGS, s, CONFIG.path.yawBlendTiles);
    const n = FR.projectNdc(pose.eye, pose.basis, lens.fovDeg, w / h,
      [q.x + Math.sin(yw) * AD, y + dy + ASC.normalAscentAltAt(s, CONFIG.levelLength), q.z + Math.cos(yw) * AD]);
    const px = (n.x + 1) / 2 * w, py = (1 - n.y) / 2 * h;
    x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
  }
  return [x0, y0, x1, y1];
}

// overlap depth (px, > 0 = overlapping) of a box with the cluster box: how far
// RIG's box reaches below the cluster's top edge where they share columns
function clusterDepth(b, C) {
  if (b[2] <= C.x || b[0] >= C.x + C.w) return -Infinity;
  return Math.min(b[3] - C.y, C.y + C.h - b[1]);
}
// overlap depth with a circle: radius minus the distance from the centre to
// the box's nearest point (> 0 = the box enters the circle)
function circleDepth(b, G) {
  const nx = Math.max(b[0], Math.min(G.cx, b[2])), ny = Math.max(b[1], Math.min(G.cy, b[3]));
  return G.r - Math.hypot(nx - G.cx, ny - G.cy);
}

const specs = [];
for (const viewport of VPS) {
  for (const policy of ['rush', 'climber', 'fighter', 'carried'])
    for (let seed = 1; seed <= SEEDS; seed++) specs.push({ group: policy, policy, seed, viewport, maxGameMs: MAX, traceEveryMs: 100 });
  specs.push({ group: 'oracle@0', policy: 'rush', seed: 1, viewport, instrument: 'oracle', oracleLatencyMs: 0, maxGameMs: MAX, traceEveryMs: 100 });
}
const out = new Array(specs.length);
let next = 0;
await Promise.all(Array.from({ length: JOBS }, async () => {
  while (next < specs.length) { const i = next++; const { group, ...spec } = specs[i]; out[i] = { group, spec, run: await child(spec) }; }
}));

const rows = [];
for (const viewport of VPS) {
  const v = VIEWPORTS[viewport];
  const lens = VEIL.lensFor(v.width, v.height, true, v.rigFraction === 'far' ? 'far' : null);
  for (const [insetName, ins] of Object.entries(INSETS)) {
    const Lay = TS.touchDeckLayout(v.width, v.height, ins, 0, CONFIG.touch.layout, CONFIG.touch.stick);
    const panels = hudBoxes(v.width, v.height);
    for (const group of ['rush', 'climber', 'fighter', 'carried', 'oracle@0']) {
      let frames = 0, inCluster = 0, inGhost = 0, worstCluster = -Infinity, worstGhost = -Infinity;
      let atCluster = null, atGhost = null;
      let ghostBelow = 0, ghostOn = 0, ghostAbove = 0, inHud = 0, worstHud = -Infinity, atHud = null;
      let clusterBelow = 0, clusterOn = 0, clusterAbove = 0;
      let offTop = 0, worstTop = -Infinity, atTop = null;
      for (const r of out.filter((o) => o.spec.viewport === viewport && o.group === group)) {
        let lastTurn = -Infinity;
        for (const [ms, x, y, scrollX, seg, k] of r.run.trace || []) {
          if (seg === 'turning') { lastTurn = ms; continue; }
          if (!STRAIGHT.has(seg) || ms - lastTurn < CATCH_UP_MS || k > CONFIG.path.faces) continue;
          const b = rigBox(x, y, scrollX, k, lens, v.width, v.height);
          frames++;
          const dc = clusterDepth(b, Lay.cluster), dg = circleDepth(b, Lay.ghost);
          if (dc > 0) {
            inCluster++;
            if (y < lowestDeck - 0.01) clusterBelow++; else if (y > lowestDeck + 0.01) clusterAbove++; else clusterOn++;
          }
          if (dg > 0) {
            inGhost++;
            if (y < lowestDeck - 0.01) ghostBelow++; else if (y > lowestDeck + 0.01) ghostAbove++; else ghostOn++;
          }
          let dh = -Infinity;
          for (const P of panels) dh = Math.max(dh, panelDepth(b, P));
          if (dh > 0) inHud++;
          const at = { seed: r.spec.seed, ms, x, y, face: k, seg, boxPx: b.map((q) => +q.toFixed(1)) };
          if (dc > worstCluster) { worstCluster = dc; atCluster = at; }
          if (dg > worstGhost) { worstGhost = dg; atGhost = at; }
          if (dh > worstHud) { worstHud = dh; atHud = at; }
          if (b[1] < 0) offTop++;
          if (-b[1] > worstTop) { worstTop = -b[1]; atTop = at; }
        }
      }
      rows.push({ viewport, insets: insetName, group, frames, lens: { fovDeg: +lens.fovDeg.toFixed(3), liftTiles: lens.liftTiles },
        clusterShare: frames ? +(inCluster / frames).toFixed(4) : null,
        ghostShare: frames ? +(inGhost / frames).toFixed(4) : null,
        worstClusterPx: Number.isFinite(worstCluster) ? +worstCluster.toFixed(1) : null,
        worstGhostPx: Number.isFinite(worstGhost) ? +worstGhost.toFixed(1) : null,
        // the ghost frames by where RIG's feet were: below the lowest deck (a
        // pit fall), on it, above it (a higher deck, a platform, a jump)
        ghostFramesByFeet: { belowLowestDeck: ghostBelow, onLowestDeck: ghostOn, above: ghostAbove },
        clusterFramesByFeet: { belowLowestDeck: clusterBelow, onLowestDeck: clusterOn, above: clusterAbove },
        worstClusterAt: atCluster, worstGhostAt: atGhost,
        // RIG's painted head above the frame's top edge (jumps included)
        offTopShare: frames ? +(offTop / frames).toFixed(4) : null,
        worstOffTopPx: Number.isFinite(worstTop) ? +worstTop.toFixed(1) : null, worstOffTopAt: atTop,
        hudPanels: panels.length ? panels : undefined,
        hudShare: panels.length && frames ? +(inHud / frames).toFixed(4) : undefined,
        worstHudPx: panels.length && Number.isFinite(worstHud) ? +worstHud.toFixed(1) : undefined,
        worstHudAt: panels.length ? atHud : undefined,
        ghost: { cx: +Lay.ghost.cx.toFixed(1), cy: +Lay.ghost.cy.toFixed(1), r: +Lay.ghost.r.toFixed(1) },
        cluster: { x: +Lay.cluster.x.toFixed(1), y: +Lay.cluster.y.toFixed(1), w: +Lay.cluster.w.toFixed(1), h: +Lay.cluster.h.toFixed(1) } });
    }
  }
}
for (const r of rows)
  console.log(`${r.viewport.padEnd(20)} ${r.insets.padEnd(6)} ${r.group.padEnd(9)} frames ${String(r.frames).padStart(5)}  ` +
    `under cluster ${(r.clusterShare * 100).toFixed(2).padStart(6)}% (worst ${r.worstClusterPx} px; feet below/on/above the lowest deck ` +
    `${r.clusterFramesByFeet.belowLowestDeck}/${r.clusterFramesByFeet.onLowestDeck}/${r.clusterFramesByFeet.above})  ` +
    `in stick ghost ${(r.ghostShare * 100).toFixed(2).padStart(6)}% (worst ${r.worstGhostPx} px; feet below/on/above the lowest deck ` +
    `${r.ghostFramesByFeet.belowLowestDeck}/${r.ghostFramesByFeet.onLowestDeck}/${r.ghostFramesByFeet.above})` +
    (r.hudShare !== undefined ? `  under a HUD panel ${(r.hudShare * 100).toFixed(2)}% (worst ${r.worstHudPx} px)` : '') +
    `  head off the top ${(r.offTopShare * 100).toFixed(2)}% (worst ${r.worstOffTopPx} px${r.worstOffTopPx > 0 ? ' at ' + JSON.stringify(r.worstOffTopAt) : ''})` +
    (r.worstClusterPx > 0 ? `  cluster worst at ${JSON.stringify(r.worstClusterAt)}` : '') +
    (r.worstGhostPx > 0 ? `  ghost worst at ${JSON.stringify(r.worstGhostAt)}` : ''));
const json = opt('json', null);
if (json) writeFileSync(resolve(json), JSON.stringify({ tool: 'tools/simlab/framing/thumb-overlap.mjs', seeds: SEEDS, maxGameMs: MAX,
  hudFrom: HUD_FROM, rows }, null, 1));
