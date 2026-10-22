#!/usr/bin/env node
// capture.mjs — T-103 live contact sheets + live alignment measurement.
//
//   node tools/rig-grip/capture.mjs --out <dir> [--root <tree>] [--label <text>]
//     [--views desktop,phone] [--guns RSLHF] [--rows stand,run-contact,...]
//     [--aims all|right,up,...] [--facings 1,-1] [--crouch]
//
// Boots the real game (index.html?testapi=1&audio=0&view=far&momentum=0
// &score=0) once per viewport, PAUSES the simulation, and then, for every
// (pose x aim x facing x weapon) cell, writes the staged physical state onto
// the live player row and calls the shipped presentation hook
// (sim/bridge.js view.player.sync — the exact function the frame loop calls)
// before letting the paused render loop draw the frame. Nothing renderer-side
// is forced: the body frame, weapon pose and hands are chosen by player.js
// itself from the staged state. Run cadence is reached the way the real loop
// reaches it — by advancing the game clock and moving RIG — never by poking a
// renderer variable.
//
// For every cell it records, from LIVE mesh geometry and matrixWorld (not
// from the snapshot's own numbers):
//   - the weapon's painted grip centroid and muzzle-face centre, projected;
//   - the T-103 fist centre (if the tree has re-posed arms) or, for an older
//     tree, the nearest PAINTED fist on the body frame (table below);
//   - the simulation's bullet spawn, placed exactly as src/render/bullets.js
//     places a projectile (placeOnTower at the projectile surface depth).
// Then it composes one sheet per (viewport, weapon) at true size and at 4x
// nearest-neighbour (exactly the true-size pixels, magnified).
//
// It works against pre-T-103 trees too (`--root` an exported base commit),
// which is how the BEFORE sheets and numbers in reports/tasks/T-103 were made.
// Honesty limits: SwiftShader is slow (budget minutes per viewport); the hit
// / i-frame row stages a real damagePlayer() and photographs both blink
// phases; "death" is the respawn drop that loseLife() produces (the game has
// no death pose).

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withIsolatedBrowser } from '../playtest/lib/isolated-browser.mjs';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const has = (name) => process.argv.includes(`--${name}`);
const ROOT = resolve(arg('root', resolve(import.meta.dirname, '../..')));
const OUT = resolve(arg('out', 'rig-grip-capture'));
const LABEL = arg('label', 'RIG weapon hold');
const GUNS = arg('guns', 'RSLHF').split('');
const VIEWS = {
  desktop: { viewport: { width: 1280, height: 800 }, dpr: 1 },
  phone: { viewport: { width: 844, height: 390 }, dpr: 2, touch: true },
  portrait: { viewport: { width: 390, height: 844 }, dpr: 2, touch: true },
};
const views = arg('views', 'desktop').split(',');
const ALL_AIMS = ['right', 'up-right', 'up', 'up-left', 'left', 'down-left', 'down', 'down-right'];
const aims = arg('aims', 'all') === 'all' ? ALL_AIMS : arg('aims').split(',');
const facings = arg('facings', '1,-1').split(',').map(Number);
const ALL_ROWS = ['stand', 'run-contact', 'run-pass', 'run-flight', 'air-rise', 'air-fall',
  'climb-0', 'climb-1', 'climb-2', 'climb-3', 'wall', 'hit-iframe', 'respawn'];
const rows = arg('rows', ALL_ROWS.join(',')).split(',');
const IN_SITU = has('in-situ');
const CROP = { x0: -1.45, x1: 1.45, y0: -0.35, y1: 2.75 };   // tiles, rig-local

// PAINTED fists of the PRE-T-103 atlases (absolute atlas px), used only when
// the tree under test has no re-posed arms: "how far was the nearest painted
// fist from the grip the gun was actually drawn with?".
const LEGACY_FISTS = {
  idle: [[305, 212]], contact: [[838, 218]], pass: [[1336, 234]], flight: [[1874, 225]],
  'air-rise': [[328, 722], [210, 728]], 'air-fall': [[868, 686], [726, 762]],
  'aim-right': [[363, 394]], 'aim-up-right': [[878, 303]], 'aim-up': [[1316, 255]],
  'aim-down-right': [[1928, 475]],
  'climb-0': [[345, 398], [345, 232]], 'climb-1': [[830, 354]], 'climb-2': [[1305, 408], [1322, 238]],
  'climb-3': [[1766, 370]],
};

const PAGE_HELPERS = `
(async () => {
  const [P, W, H, L, I, T, B, S, R, TW, THREE] = await Promise.all([
    import('/src/sim/player.js'), import('/src/sim/weapons.js'), import('/src/sim/hostiles.js'),
    import('/src/sim/level.js'), import('/src/sim/input.js'), import('/src/sim/time.js'),
    import('/src/sim/bridge.js'), import('/src/render/scene.js'), import('/src/pure/rig.js'),
    import('/src/render/tower.js'), import('three')]);
  const rig = S.scene.children.find((c) => c.isGroup && c.userData && 'foldVisibility' in c.userData);
  const q = { P, W, H, L, I, T, B, S, R, TW, THREE, rig };
  q.deck = L.groundTopAt(6);
  q.tmp = new THREE.Vector3();
  q.dummy = new THREE.Object3D();
  q.toScreen = (v) => {
    v.project(S.camera);
    const r = S.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (v.x + 1) * r.width / 2, y: r.top + (1 - v.y) * r.height / 2 };
  };
  q.rigLocalToScreen = (x, y, z = 0) => { q.tmp.set(x, y, z); rig.localToWorld(q.tmp); return q.toScreen(q.tmp); };
  // a point on a mesh's first quad (TL,TR,BL,BR vertices) at (u,v) of that quad
  q.quadPoint = (mesh, u, v, base = 0) => {
    const p = mesh.geometry.getAttribute('position');
    const tl = [p.getX(base), p.getY(base), p.getZ(base)];
    const tr = [p.getX(base + 1), p.getY(base + 1), p.getZ(base + 1)];
    const bl = [p.getX(base + 2), p.getY(base + 2), p.getZ(base + 2)];
    q.tmp.set(tl[0] + u * (tr[0] - tl[0]) + v * (bl[0] - tl[0]),
      tl[1] + u * (tr[1] - tl[1]) + v * (bl[1] - tl[1]),
      tl[2] + u * (tr[2] - tl[2]) + v * (bl[2] - tl[2]));
    mesh.updateWorldMatrix(true, false);
    q.tmp.applyMatrix4(mesh.matrixWorld);
    const world = q.tmp.clone();
    return { world, screen: q.toScreen(q.tmp) };
  };
  q.find = (pred) => { let hit = null; rig.traverse((o) => { if (!hit && pred(o)) hit = o; }); return hit; };
  q.gunMesh = () => q.find((o) => o.isMesh && o.renderOrder === 4);
  q.bodyMesh = () => q.find((o) => o.isMesh && o.parent && o.parent.parent === rig &&
    o.material && o.material.transparent && o.geometry.getAttribute('uv') && o.visible);
  q.frameSpec = (name) => {
    if (R.rigBodyFrameSpec) return R.rigBodyFrameSpec(name);
    if (name === 'idle') return { spec: R.RIG_IDLE_GUNLESS };
    if (R.RIG_RUN_FRAMES[name]) return { spec: R.RIG_RUN_FRAMES[name] };
    if (name.startsWith('air-')) return { spec: R.RIG_AIR_FRAMES[name.slice(4)] };
    if (name.startsWith('aim-')) return { spec: R.RIG_AIM_FRAMES[name.slice(4)] };
    if (name.startsWith('climb-')) return { spec: R.RIG_CLIMB_FRAMES[Number(name.slice(6))] };
    return null;
  };
  q.measure = () => {
    const snap = window.__HB_RIG_VISUAL();
    const out = { frame: snap.bodyFrame, weapon: snap.weapon, gunUsesArt: snap.gunUsesArt,
      rigVisible: snap.rigVisible, hands: snap.hands || null };
    const gun = q.gunMesh();
    const spec = R.RIG_WEAPON_ART[snap.weapon];
    if (gun && gun.visible !== false && spec && snap.gunUsesArt) {
      const grip = spec.grip || [76.2, 136.9];
      out.gripPx = q.quadPoint(gun, grip[0] / spec.trimW, grip[1] / spec.trimH).screen;
      // the painted muzzle face: the vertical middle of the opaque last 8 columns
      const MUZZLE_MID = { R: 59, S: 80.5, L: 71, H: 87, F: 82 };
      out.muzzlePx = q.quadPoint(gun, 1, MUZZLE_MID[snap.weapon] / spec.trimH).screen;
    }
    const p = P.player;
    const sx = p.x + p.aim.x * q.P_BARREL, sy = p.y + p.muzzleY + p.aim.y * q.P_BARREL;
    TW.placeOnTower(q.dummy, sx, sy, 1.15);
    q.dummy.updateMatrixWorld(true);
    q.tmp.copy(q.dummy.position);
    out.spawnPx = q.toScreen(q.tmp.clone());
    // T-103 tree: the fist centre on the live arm mesh that holds the gun
    const role = snap.hands && snap.hands.shown
      ? (snap.hands.nearRole === 'gun' ? 'rig-arm-near' : snap.hands.farRole === 'gun' ? 'rig-arm-far' : null)
      : null;
    if (role && R.RIG_ARM_SEGMENTS) {
      const arm = q.find((o) => o.name === role);
      const seg = R.RIG_ARM_SEGMENTS.fore;
      out.fistPx = q.quadPoint(arm, (seg.to[0] - seg.x) / seg.w, (seg.to[1] - seg.y) / seg.h, 4).screen;
      out.handKind = 'rig-arm';
      out.stretch = snap.hands.stretch;
    } else {
      // older tree: nearest PAINTED fist on the body frame
      const body = q.bodyMesh();
      const fs = q.frameSpec(snap.bodyFrame);
      const fists = (window.__LEGACY_FISTS__ || {})[snap.bodyFrame] || [];
      if (body && fs && fs.spec && fists.length && out.gripPx) {
        const s = fs.spec;
        let best = null;
        for (const [ax, ay] of fists) {
          const u = (ax - (s.atlasX || 0) - s.trimX) / s.trimW, v = (ay - (s.atlasY || 0) - s.trimY) / s.trimH;
          const pt = q.quadPoint(body, u, v).screen;
          const d = Math.hypot(pt.x - out.gripPx.x, pt.y - out.gripPx.y);
          if (!best || d < best.d) best = { d, pt };
        }
        out.fistPx = best.pt;
        out.handKind = 'painted-fist';
      }
    }
    // px per tile at RIG for unit conversion
    const a = q.rigLocalToScreen(0, 0), b = q.rigLocalToScreen(0, 1);
    out.pxPerTile = Math.hypot(b.x - a.x, b.y - a.y);
    out.crop = [q.rigLocalToScreen(${CROP.x0}, ${CROP.y1}), q.rigLocalToScreen(${CROP.x1}, ${CROP.y0})];
    return out;
  };
  // advance the game clock while paused, then run the shipped presentation hook
  q.sync = (ms = 0) => { if (ms) T.advanceGameMs(ms); B.view.player.sync(); };
  window.__RIG_GRIP__ = q;
  return true;
})()`;

function cellLabel(row, aim, facing, gun) {
  return `${row}|${aim}|${facing > 0 ? 'R' : 'L'}|${gun}`;
}

async function stageRow(page, row) {
  return page.evaluate(async (rowName) => {
    const q = window.__RIG_GRIP__;
    const { P, I, H, L } = q;
    const p = P.player;
    H.clearHostiles();
    for (const k of ['left', 'right', 'up', 'down', 'jump', 'fire']) I.keys[k] = false;
    I.keys.strafe = true;
    const base = { x: 6, y: q.deck, vx: 0, vy: 0, grounded: true, onOneWay: null,
      traversalState: 'free', traversalSide: 0, ladderId: null, iframesUntil: 0, hitstunUntil: 0,
      crouched: false, muzzleY: q.HB_MUZZLE_Y, h: q.HB_HEIGHT };
    Object.assign(p, base);
    // settle: not running, landing brace expired
    q.sync(400); q.sync(0);
    const run = (phase) => {      // reach a run phase by real distance travelled
      p.vx = 9.4; p.grounded = true;
      let need = phase * 9.4 * 0.3;   // CONFIG runSpeed * RIG_RUN_CYCLE_MS
      while (need > 1e-6) { const step = Math.min(0.6, need); p.x += step; need -= step; q.sync(60); }
    };
    if (rowName === 'run-contact') run(0.07);
    else if (rowName === 'run-pass') run(0.25);
    else if (rowName === 'run-flight') run(0.5);
    else if (rowName === 'air-rise' || rowName === 'air-fall' || rowName === 'respawn') {
      Object.assign(p, { y: q.deck + 2.5, grounded: false, vy: rowName === 'air-rise' ? 6 : -4 });
      if (rowName === 'respawn') { P.respawn(); p.vy = -4; }
      q.sync(16);
    } else if (rowName.startsWith('climb-')) {
      const wanted = Number(rowName.slice(6));
      // The climb pose is staged on the same column as every other row so all
      // cells share one camera geometry (the presentation reads only the
      // traversal state, not which rail). In-situ ladder shots use a real rail.
      const ladder = L.ladders.filter((r) => r.face === 1 && r.y1 - r.y0 >= 2.8).sort((a, b) => a.x - b.x)[0];
      Object.assign(p, { y: q.deck + 0.4, grounded: false, traversalState: 'ladder', ladderId: ladder.id });
      q.sync(16);
      for (let i = 0; i < 40 && window.__HB_RIG_VISUAL().climbFrame !== wanted; i++) { p.y += 0.12; q.sync(16); }
    } else if (rowName === 'wall') {
      Object.assign(p, { grounded: false, traversalState: 'wall', vy: -0.2 });
      q.sync(16);
    } else if (rowName === 'hit-iframe') {
      P.damagePlayer(0, p.x - 1);
      p.hp = Math.max(p.hp, 1);
      q.sync(16);
    }
    const s = window.__HB_RIG_VISUAL();
    return { frame: s.bodyFrame, x: p.x, y: p.y, state: p.traversalState, climbFrame: s.climbFrame };
  }, row);
}

async function stageCell(page, row, aim, facing, gun) {
  return page.evaluate(({ row, aim, facing, gun }) => {
    const q = window.__RIG_GRIP__;
    const { P, W } = q;
    const p = P.player;
    const AIM = { right: [1, 0], 'up-right': [1, 1], up: [0, 1], 'up-left': [-1, 1], left: [-1, 0],
      'down-left': [-1, -1], down: [0, -1], 'down-right': [1, -1] }[aim];
    const n = Math.hypot(AIM[0], AIM[1]);
    W.setWeapon(gun);
    p.facing = facing;
    if (row === 'wall') { p.traversalSide = facing; }
    p.aim.set(AIM[0] / n, AIM[1] / n);
    q.sync(0);
    if (row === 'hit-iframe') {
      // keep every cell mid-invulnerability and photograph a VISIBLE blink
      // phase (the hidden phase hides body, arms and weapon together)
      p.iframesUntil = q.T.gameMs + 600;
      for (let i = 0; i < 12 && !q.rig.visible; i++) q.sync(16);
    }
    return q.measure();
  }, { row, aim, facing, gun });
}

const report = { label: LABEL, root: ROOT, views: {}, legacyFistTable: LEGACY_FISTS };
await mkdir(resolve(OUT, 'cells'), { recursive: true });

await withIsolatedBrowser(ROOT, async ({ baseUrl, newPage }) => {
  for (const viewName of views) {
    const view = VIEWS[viewName];
    const owned = await newPage({ viewport: view.viewport, deviceScaleFactor: view.dpr,
      hasTouch: !!view.touch, isMobile: !!view.touch });
    const { page } = owned;
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    const vr = { viewport: view.viewport, dpr: view.dpr, cells: {}, rows: {}, errors };
    report.views[viewName] = vr;
    try {
      const flags = has('crouch') ? '&crouch=1' : '';
      await page.goto(`${baseUrl}/index.html?testapi=1&audio=0&view=far&momentum=0&score=0${flags}`,
        { waitUntil: 'commit', timeout: 120000 });
      await page.waitForFunction(() => window.HB?.state?.() === 'PLAYING', null,
        { timeout: 300000, polling: 1000 });
      await page.waitForFunction(() => {
        const s = window.__HB_RIG_VISUAL?.();
        return s?.spriteReady && s?.aimReady && s?.climbReady && Object.values(s.artReady).every(Boolean);
      }, null, { timeout: 120000, polling: 1000 });
      await page.keyboard.press('KeyP');
      await page.waitForFunction(() => window.HB.state() === 'PAUSED', null, { timeout: 60000 });
      await page.addStyleTag({ content: 'body > *:not(canvas){visibility:hidden!important}' });
      await page.evaluate((fists) => { window.__LEGACY_FISTS__ = fists; }, LEGACY_FISTS);
      await page.evaluate(PAGE_HELPERS);
      if (!IN_SITU) {
        // Isolate RIG: hide every world object except the rig and the light
        // rig (materials, tone mapping and bloom stay exactly as shipped).
        // SwiftShader draws the full Meridian at <1 fps on a loaded host; the
        // isolated scene draws in ~0.1 s, which is what makes a full matrix
        // of cells affordable. --in-situ keeps the world for context shots.
        vr.isolated = await page.evaluate(async () => {
          const q = window.__RIG_GRIP__;
          const hasLight = (o) => { let l = false; o.traverse((c) => { if (c.isLight) l = true; }); return l; };
          let hidden = 0;
          for (const c of q.S.scene.children) {
            if (c === q.rig || c.isLight) continue;
            if (hasLight(c)) {
              c.traverse((d) => { if (d.isMesh || d.isPoints || d.isLine || d.isSprite) { d.visible = false; hidden++; } });
              continue;
            }
            if (c.visible) { c.visible = false; hidden++; }
          }
          q.S.scene.background = new q.THREE.Color(0x4a565c);
          q.S.scene.fog = null;
          return hidden;
        });
      }
      await page.evaluate(() => {
        const q = window.__RIG_GRIP__;
        q.P_BARREL = window.HB.CONFIG.player.barrelTiles ?? 0.6;
        q.HB_MUZZLE_Y = window.HB.CONFIG.player.muzzleY;
        q.HB_HEIGHT = window.HB.CONFIG.player.height;
      });
      for (const row of rows) {
        const staged = await stageRow(page, row);
        vr.rows[row] = staged;
        for (const gun of GUNS) for (const facing of facings) for (const aim of aims) {
          const m = await stageCell(page, row, aim, facing, gun);
          // let the paused loop draw this exact state, then photograph it
          await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
          const [tl, br] = m.crop;
          const clip = { x: Math.floor(tl.x), y: Math.floor(tl.y),
            width: Math.ceil(br.x - tl.x), height: Math.ceil(br.y - tl.y) };
          const key = cellLabel(row, aim, facing, gun);
          const file = `${viewName}-${gun}-${row}-${aim}-${facing > 0 ? 'R' : 'L'}.png`;
          await page.screenshot({ path: resolve(OUT, 'cells', file), clip, timeout: 180000 });
          const pxToTiles = 1 / m.pxPerTile;
          const fistGrip = m.fistPx && m.gripPx
            ? Math.hypot(m.fistPx.x - m.gripPx.x, m.fistPx.y - m.gripPx.y) : null;
          const muzzleSpawn = m.muzzlePx && m.spawnPx
            ? Math.hypot(m.muzzlePx.x - m.spawnPx.x, m.muzzlePx.y - m.spawnPx.y) : null;
          vr.cells[key] = { file, frame: m.frame, handKind: m.handKind || null, stretch: m.stretch ?? null,
            pxPerTile: +m.pxPerTile.toFixed(3),
            fistToGripCssPx: fistGrip === null ? null : +fistGrip.toFixed(3),
            fistToGripTiles: fistGrip === null ? null : +(fistGrip * pxToTiles).toFixed(4),
            muzzleToSpawnCssPx: muzzleSpawn === null ? null : +muzzleSpawn.toFixed(3),
            rigVisible: m.rigVisible };
        }
        console.log(JSON.stringify({ view: viewName, row, staged }));
      }
    } finally {
      await owned.close();
    }
  }

  // contact sheets: rows x (facing, aim) per (view, gun), true size and 4x
  for (const [viewName, vr] of Object.entries(report.views)) {
    for (const gun of GUNS) {
      for (const scale of [1, 4]) {
        const cols = [];
        for (const facing of facings) for (const aim of aims) cols.push([facing, aim]);
        const head = cols.map(([f, a]) => `<th>${a}<br>${f > 0 ? 'face R' : 'face L'}</th>`).join('');
        const body = [];
        for (const row of rows) {
          const cells = [];
          for (const [facing, aim] of cols) {
            const c = vr.cells[cellLabel(row, aim, facing, gun)];
            if (!c) { cells.push('<td></td>'); continue; }
            const png = await readFile(resolve(OUT, 'cells', c.file));
            cells.push(`<td><img data-s="${scale}" src="data:image/png;base64,${png.toString('base64')}"></td>`);
          }
          body.push(`<tr><th>${row}<br><small>${vr.rows[row]?.frame || ''}</small></th>${cells.join('')}</tr>`);
        }
        const sheetPage = await newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
        try {
          await sheetPage.page.setContent(`<!doctype html><style>
            body{margin:0;padding:8px;background:#10171b;color:#e9d6a8;font:11px/1.2 monospace}
            h1{font-size:14px;margin:0 0 6px} table{border-collapse:collapse}
            td,th{border:1px solid #2c3a40;padding:2px;text-align:center;vertical-align:middle}
            img{display:block;image-rendering:pixelated}
            </style><h1>${LABEL} // ${viewName} ${vr.viewport.width}x${vr.viewport.height} DPR ${vr.dpr}
            // weapon ${gun} // ${scale === 1 ? 'TRUE SIZE (1 css px = 1 px)' : '4x nearest-neighbour of true size'}</h1>
            <table><tr><th></th>${head}</tr>${body.join('')}</table>
            <script>for (const i of document.images) i.onload = () => {
              const s = Number(i.dataset.s); i.style.width = (i.naturalWidth / devicePixelRatio * s) + 'px';
            }; </script>`);
          await sheetPage.page.evaluate(() => Promise.all([...document.images].map((i) =>
            i.complete ? 0 : new Promise((r) => { i.onload = r; }))).then(() => {
            for (const i of document.images) {
              i.style.width = (i.naturalWidth * Number(i.dataset.s)) + 'px';
            }
          }));
          const file = resolve(OUT, `sheet-${viewName}-${gun}-${scale}x.png`);
          await sheetPage.page.screenshot({ path: file, fullPage: true, timeout: 300000 });
          (vr.sheets ||= []).push(file);
        } finally {
          await sheetPage.close();
        }
      }
    }
  }
});

// summary
for (const vr of Object.values(report.views)) {
  const cells = Object.values(vr.cells);
  const fg = cells.map((c) => c.fistToGripCssPx).filter((v) => v !== null);
  const ms = cells.map((c) => c.muzzleToSpawnCssPx).filter((v) => v !== null);
  const st = cells.map((c) => c.stretch).filter((v) => v !== null);
  vr.summary = {
    cells: cells.length,
    fistToGripCssPx: fg.length ? { max: Math.max(...fg), mean: fg.reduce((a, b) => a + b, 0) / fg.length } : null,
    muzzleToSpawnCssPx: ms.length ? { max: Math.max(...ms), mean: ms.reduce((a, b) => a + b, 0) / ms.length } : null,
    stretch: st.length ? { max: Math.max(...st), over1_05: st.filter((v) => v > 1.05).length } : null,
    hidden: cells.filter((c) => !c.rigVisible).length,
  };
}
await writeFile(resolve(OUT, 'capture.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(report.views).map(([k, v]) => [k, v.summary])), null, 2));
