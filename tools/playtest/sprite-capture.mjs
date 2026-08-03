// sprite-capture.mjs — dev-only evidence rig for the hostile sprite path
// (T-049). It answers one question and refuses to answer any other: at the
// size the shipped default camera really draws them, what does each of the five
// hostile roles look like as a generated sprite, next to the primitive body
// it replaces?
//
//   node sprite-capture.mjs                 every mode, every role
//   node sprite-capture.mjs --out <dir>     write somewhere other than
//                                           artifacts/sprites-v1/
//
// Method: boot the traversal slice with its own hostiles off, clear the
// board, and spawn ONE of each of the five kinds through the game's own
// exported spawnHostile() at fixed offsets from RIG. Wait out the 900ms
// materialization in GAME time, project each body's world position through
// the game's own camera, screenshot the frame at 1280x800, and compose
// per-role panels at 1x (the true on-screen size) and 4x (so the read can be
// argued about) from that one frame.
//
// Modes captured, one page each:
//   sprites     the shipped default
//   primitive   ?sprites=0 — the pre-T-049 renderer, the A/B control
//   variant-a   ?spritevar=a — the other candidate of every pair
//
// HONESTY NOTES:
//   * The three modes are three separate page loads. The sim is seeded and
//     the lineup is spawned at fixed offsets, but frame timing is real time,
//     so bodies drift by a few tiles-per-second between modes. Judge the
//     ART; do not diff these frames pixel to pixel.
//   * The lineup is INJECTED. These five never stand in a line in play, and
//     a mortar spawned with a zone under itself is not a mortar doing its
//     job. What the frame proves is size, silhouette and value at the real
//     camera — not composition, and not difficulty.
//   * The 4x panels are nearest-neighbour blow-ups of the 1x frame, not
//     re-renders. They show what the 1x frame contains and nothing more.
//   * No performance claim is made here. Frame cost lives in the stress
//     probe (tools/playtest/juice-stress.mjs), which is a separate run.

import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './lib/server.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const argv = process.argv.slice(2);
const outArg = argv.indexOf('--out');
const OUT = resolve(outArg >= 0 ? argv[outArg + 1] : resolve(repoRoot, 'artifacts', 'sprites-v1'));
mkdirSync(OUT, { recursive: true });

const VIEWPORT = { width: 1280, height: 800 };
const SETTLE_MS = 1400;              // let the run boot and the world settle
const SHOW_MS = 1150;                // game-time wait: CONFIG.wasp.enterMs is 900

const MODES = [
  { id: 'sprites', qs: '', label: 'sprites (shipped default)' },
  { id: 'primitive', qs: '&sprites=0', label: 'primitives (?sprites=0)' },
  { id: 'variant-a', qs: '&spritevar=a', label: 'sprites, variant a (?spritevar=a)' },
];

// Where each body is planted, in tiles from RIG. LEFT of the start, over the
// slice's opening deck: it is flat, open and unoccluded there, which is what
// a size comparison needs. `dy` is the kind's own ride height over that deck
// (hound.rideY, polyp.rootY, mortar.bodyY), so the ground kinds stand on the
// plate instead of half inside it.
// The order is not cosmetic: every kind is planted outside the range that
// would put it into a TELL or a DIVE (hound.senseRange 8, wasp.diveRange
// 6.5, polyp.sightRange 9 — and the polyp faces away), because a body
// mid-telegraph is posed, glowing and half-covered by its own warning lamp,
// which is a fine thing to look at and a useless size comparison.
const LINEUP = [
  { kind: 'carrier', dx: -2.5, dy: 4.2 },
  { kind: 'polyp', dx: -6.0, dy: 1.05, dir: -1 },
  { kind: 'mortar', dx: -9.5, dy: 1.05, dir: -1 },
  // The hound prowls another ~4 tiles during SHOW_MS. Keep its spawn inside
  // the lineup instead of letting the real-scale crop catch only a nose at
  // the viewport edge; the wasp can sit farther left because its higher lane
  // keeps the two silhouettes separate.
  { kind: 'wasp', dx: -16.0, dy: 3.2 },
  { kind: 'hound', dx: -12.5, dy: 0.45 },
];

/* ------------------------------ page work -------------------------------- */

const SPAWN = async (lineup) => {
  const H = await import('/src/sim/hostiles.js');
  const P = await import('/src/sim/player.js');
  const T = await import('/src/sim/time.js');
  H.clearHostiles();
  const px = P.player.x, py = P.player.y;
  const placed = [];
  for (const row of lineup) {
    const x = px + row.dx, y = py + row.dy;
    H.spawnHostile(x, y, 0, row.kind, {
      dir: row.dir || -1,
      // the tripod's zone is planted well outside CONFIG.mortar.armRange of
      // RIG on purpose: an armed mortar throws a pod across the lineup and
      // the frame stops being a size comparison
      zone: row.kind === 'mortar' ? { x: x - 10, y } : undefined,
    });
    placed.push({ kind: row.kind, x, y });
  }
  return { at: T.gameMs, placed };
};

// project each body's LIVE world position through the game's own camera, so
// a crop box is where the thing actually is rather than where it was asked
// to stand
const PROJECT = async () => {
  const [THREE, S, TW, HS] = await Promise.all([
    import('three'),
    import('/src/render/scene.js'),
    import('/src/render/tower.js'),
    import('/src/sim/hostiles.js'),
  ]);
  const v = new THREE.Vector3();
  const pose = { x: 0, y: 0, z: 0, yaw: 0, alt: 0 };
  const out = [];
  for (const e of HS.hostiles) {
    TW.towerPose(e.x, pose);
    v.set(pose.x, e.y + pose.alt, pose.z).project(S.camera);
    out.push({
      kind: e.kind, x: e.x, y: e.y, state: e.state,
      sx: (v.x * 0.5 + 0.5) * innerWidth,
      sy: (-v.y * 0.5 + 0.5) * innerHeight,
    });
  }
  return {
    bodies: out,
    sprites: typeof window.__HB_SPRITES === 'function' ? window.__HB_SPRITES() : null,
  };
};

/* ----------------------------- composition ------------------------------- */

const dataUrl = (file) => 'data:image/png;base64,' +
  readFileSync(resolve(OUT, file)).toString('base64');

// one panel = a window onto a captured frame, centered on (fx, fy) source px
function cell(p, w, h) {
  return `<figure style="margin:0">
    <figcaption style="padding:4px 8px;font:600 13px ui-monospace,monospace;color:#cfd8dc">${p.label}</figcaption>
    <div style="width:${w}px;height:${h}px;overflow:hidden;position:relative;background:#000">
      <img src="${p.src}" style="position:absolute;transform-origin:0 0;
        transform:scale(${p.scale});image-rendering:pixelated;
        left:${(w / 2 - p.fx * p.scale).toFixed(1)}px;
        top:${(h / 2 - p.fy * p.scale).toFixed(1)}px">
    </div>
  </figure>`;
}

async function composeRole(browser, role, rows) {
  const W1 = 150, H1 = 110, W4 = 300, H4 = 220;
  const panels = rows.map((r) => [
    cell({ ...r, scale: 1, label: r.label + ' — 1x (true size)' }, W1, H1),
    cell({ ...r, scale: 4, label: r.label + ' — 4x' }, W4, H4),
  ].join(''));
  const page = await browser.newPage({
    viewport: { width: (W1 + W4) * rows.length + 60, height: H4 + 60 },
  });
  await page.setContent(`<body style="margin:0;background:#101418;
    font:700 15px ui-monospace,monospace;color:#fff">
    <div style="display:flex;gap:12px;padding:8px">${panels.join('')}</div></body>`);
  await page.waitForTimeout(200);
  await page.screenshot({ path: resolve(OUT, `role-${role}.png`), fullPage: true });
  await page.close();
}

// the headline evidence: one wide band of the frame per mode, at 1x, so all
// five roles are judged at the size the camera really draws them, stacked
async function composeStrip(browser, rows) {
  const W = 900, H = 150;
  const page = await browser.newPage({ viewport: { width: W + 16, height: rows.length * (H + 26) + 16 } });
  await page.setContent(`<body style="margin:0;background:#101418;color:#fff">
    <div style="padding:8px;display:flex;flex-direction:column;gap:8px">
      ${rows.map((r) => cell({ ...r, scale: 1 }, W, H)).join('')}
    </div></body>`);
  await page.waitForTimeout(200);
  await page.screenshot({ path: resolve(OUT, 'lineup-true-size.png'), fullPage: true });
  await page.close();
}

/* -------------------------------- driver --------------------------------- */

const server = await startStaticServer(repoRoot);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const frames = {};
const shots = {};

for (const mode of MODES) {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  page.on('console', (m) => {
    if (m.type() === 'warning' || m.type() === 'error') console.log(`  [page:${mode.id}] ${m.text()}`);
  });
  const url = `${server.baseUrl}/index.html?slice=traversal&testapi=1&enemies=0${mode.qs}`;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.HB && window.HB.state() === 'PLAYING', { timeout: 15000 });
  await page.waitForTimeout(SETTLE_MS);
  const spawn = await page.evaluate(SPAWN, LINEUP);
  await page.waitForFunction((t) => window.HB.gameMs() >= t, spawn.at + SHOW_MS, { timeout: 15000 });
  const probe = await page.evaluate(PROJECT);
  const file = `frame-${mode.id}.png`;
  await page.screenshot({ path: resolve(OUT, file) });
  frames[mode.id] = probe;
  shots[mode.id] = file;
  console.log(`[sprite-capture] ${mode.id}: ` +
    probe.bodies.map((b) => `${b.kind}/${b.state}`).join(' ') + ', sprites=' +
    JSON.stringify(probe.sprites && probe.sprites.kinds
      ? Object.fromEntries(Object.entries(probe.sprites.kinds).map(([k, s]) => [k, s.state + ':' + s.variant]))
      : probe.sprites));
  await page.close();
}

await composeStrip(browser, MODES.map((mode) => {
  const bodies = frames[mode.id].bodies;
  const xs = bodies.map((b) => b.sx), ys = bodies.map((b) => b.sy);
  return {
    src: dataUrl(shots[mode.id]), label: mode.label,
    fx: (Math.min(...xs) + Math.max(...xs)) / 2,
    fy: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}));

for (const row of LINEUP) {
  const rows = [];
  for (const mode of MODES) {
    const body = frames[mode.id].bodies.find((b) => b.kind === row.kind);
    if (!body) { console.log(`  (no ${row.kind} in ${mode.id})`); continue; }
    rows.push({ src: dataUrl(shots[mode.id]), fx: body.sx, fy: body.sy, label: mode.label });
  }
  if (rows.length) await composeRole(browser, row.kind, rows);
}

// where every body ended up in every frame, so the panels above can be
// re-measured (contrast, drawn area) without re-running the capture
writeFileSync(resolve(OUT, 'bodies.json'), JSON.stringify({
  viewport: VIEWPORT, lineup: LINEUP,
  modes: Object.fromEntries(MODES.map((m) => [m.id, {
    frame: shots[m.id], label: m.label,
    sprites: frames[m.id].sprites, bodies: frames[m.id].bodies,
  }])),
}, null, 2) + '\n');

console.log('[sprite-capture] wrote ' + OUT);
await browser.close();
await server.close();
