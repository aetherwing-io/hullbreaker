#!/usr/bin/env node
// Deterministic true-FAR proof for RIG locomotion, airborne/landing continuity,
// aim attachment, and all five held-weapon families. Outputs are deliberately
// tight crops at the real desktop/portrait pixel density—not enlarged renders.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withIsolatedBrowser } from './lib/isolated-browser.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = '/private/tmp/hullbreaker-rig-presentation';
await mkdir(OUT, { recursive: true });
const report = { far: true, views: {}, errors: [] };

const VIEWS = [
  { name: 'desktop', viewport: { width: 1280, height: 800 } },
  { name: 'portrait', viewport: { width: 390, height: 844 } },
];

async function capture(page, view, label, bucket) {
  const path = `${OUT}/${view.name}-${label}.png`;
  const state = await page.evaluate(() => ({
    rig: window.__HB_RIG_VISUAL(),
    player: ((p) => ({
      x: p.x, y: p.y, vx: p.vx, vy: p.vy, grounded: p.grounded,
      traversalState: p.traversalState,
    }))(window.__RIG_QA__.P.player),
  }));
  const width = Math.min(250, view.viewport.width);
  const height = Math.min(230, view.viewport.height);
  const clip = {
    x: Math.max(0, Math.min(view.viewport.width - width,
      Math.round(state.rig.screen.x - width / 2))),
    y: Math.max(0, Math.min(view.viewport.height - height,
      Math.round(state.rig.screen.y - height * 0.70))),
    width, height,
  };
  // The gameplay camera deliberately lets the logical root sit a few pixels
  // beyond its forward clamp while the full body remains visible. Accept that
  // authored 20px overscan, but never an actually off-screen actor.
  const rootNear = state.rig.screen.x >= clip.x - 20 && state.rig.screen.x <= clip.x + width + 20 &&
    state.rig.screen.y >= clip.y - 20 && state.rig.screen.y <= clip.y + height + 20;
  if (!rootNear || !state.rig.rigVisible || !state.rig.spriteVisible) {
    throw new Error(`${view.name}/${label}: RIG is not pixel-visible ` +
      JSON.stringify({ screen: state.rig.screen, clip, rigVisible: state.rig.rigVisible,
        spriteVisible: state.rig.spriteVisible, bodyFrame: state.rig.bodyFrame }));
  }
  await page.screenshot({ path, clip });
  bucket[label] = { path, clip, rig: state.rig, player: state.player };
}

await withIsolatedBrowser(ROOT, async ({ baseUrl, newPage }) => {
 for (const view of VIEWS) {
  const owned = await newPage({ viewport: view.viewport, deviceScaleFactor: 1 });
  const { page } = owned;
  const bucket = {};
  report.views[view.name] = { viewport: view.viewport, captures: bucket };
  page.on('pageerror', (e) => report.errors.push(`${view.name} pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') report.errors.push(`${view.name} console: ${m.text()}`);
  });
  try {
    await page.goto(`${baseUrl}/index.html?testapi=1&audio=0&view=far&momentum=0&score=0`,
      { waitUntil: 'load', timeout: 15000 });
    try {
      await page.waitForFunction(() => !!window.HB, null, { timeout: 15000 });
    } catch (error) {
      console.error(JSON.stringify({ url: page.url(), title: await page.title(),
        errors: report.errors, body: (await page.locator('body').innerText()).slice(0, 1200) }, null, 2));
      throw error;
    }
    // The fixture can finish its empty enemy plan before a cold headless page
    // finishes shader warmup. Re-enter through the ordinary shell/retry keys;
    // never call a private lifecycle function from the harness.
    let bootState = await page.evaluate(() => window.HB.state());
    if (bootState === 'MENU') await page.keyboard.press('Enter');
    else if (bootState !== 'PLAYING') await page.keyboard.press('r');
    await page.waitForFunction(() => window.HB?.state() === 'PLAYING', null, { timeout: 5000 });
    await page.evaluate(async () => {
      const [P, W, H, L, I, G] = await Promise.all([
        import('/src/sim/player.js'), import('/src/sim/weapons.js'),
        import('/src/sim/hostiles.js'), import('/src/sim/level.js'),
        import('/src/sim/input.js'), import('/src/pure/gunroll.js'),
      ]);
      H.clearHostiles();
      const deck = L.groundTopAt(6);
      Object.assign(P.player, {
        x: 6, y: deck, vx: 0, vy: 0, grounded: true, facing: 1,
        traversalState: 'free', ladderId: null, iframesUntil: 0,
      });
      P.player.aim.set(1, 0);
      W.setWeapon('R');
      window.__RIG_QA__ = { P, W, H, L, I, G, deck };
    });
    await page.waitForFunction(() => {
      const s = window.__HB_RIG_VISUAL?.();
      return s?.spriteReady && s?.aimReady && s?.climbReady &&
        Object.values(s.artReady).every(Boolean);
    }, null, { timeout: 10000 });
    await page.waitForTimeout(180);

    // Distance-driven contact -> pass -> flight cadence at the shipped FAR view.
    await page.keyboard.down('ArrowRight');
    for (const frame of ['contact', 'pass', 'flight']) {
      // Tight evidence crops can take long enough under a loaded workstation
      // for RIG to leave this short fixture deck. Re-center the physical actor
      // between cadence samples; the requested pose is still reached only by
      // ordinary distance-driven movement in the real update loop.
      await page.evaluate(() => {
        const { player } = window.__RIG_QA__.P;
        player.x = 6; player.y = window.__RIG_QA__.deck;
        player.vx = 0; player.vy = 0; player.grounded = true;
        player.traversalState = 'free'; player.onOneWay = null;
      });
      await page.waitForFunction((wanted) => {
        const s = window.__HB_RIG_VISUAL?.();
        return s?.locomotionState === 'run' && s.bodyFrame === wanted && s.travelSpeed > 0.7;
      }, frame, { timeout: 5000 });
      await capture(page, view, `run-${frame}`, bucket);
    }
    await page.keyboard.up('ArrowRight');

    // Every chassis at identical pose/scale, making family silhouette changes
    // judgeable without a pickup card or projectile giving away the answer.
    for (const letter of ['R', 'S', 'L', 'H', 'F']) {
      await page.evaluate((next) => window.__RIG_QA__.W.setWeapon(next), letter);
      await page.waitForFunction((wanted) => {
        const s = window.__HB_RIG_VISUAL?.();
        return s?.weapon === wanted && s.gunUsesArt && s.bodyFrame === 'aim-right';
      }, letter, { timeout: 4000 });
      await capture(page, view, `family-${letter}`, bucket);
    }

    // Three deterministic multi-trait rolls prove that modifiers add physical
    // hardware rather than merely tinting the same five chassis.
    const rolledCombos = [
      { label: 'heavy-volatile', seed: 0, wants: ['heavy', 'volatile'] },
      { label: 'seeker-phase', seed: 5, wants: ['seeker', 'phase'] },
      { label: 'rapid-forked', seed: 2, wants: ['rapid', 'forked'] },
    ];
    for (const combo of rolledCombos) {
      await page.evaluate(({ seed }) => {
        const { W, G } = window.__RIG_QA__;
        W.setGun(G.rollGun('R', 1, seed));
      }, combo);
      await page.waitForFunction(({ wants }) => {
        const s = window.__HB_RIG_VISUAL?.();
        return s?.gunPresentation.visibleTraitCount >= wants.length &&
          wants.every((trait) => s.gunPresentation.traits.includes(`${trait}:`));
      }, combo, { timeout: 4000 });
      await capture(page, view, `roll-${combo.label}`, bucket);
    }
    await page.evaluate(() => window.__RIG_QA__.W.setWeapon('R'));

    // Four authored elevations mirror into eight actual input sectors.
    const aimPoses = {
      right: { aim: [1, 0], frame: 'right', face: 1 },
      'up-right': { aim: [Math.SQRT1_2, Math.SQRT1_2], frame: 'up-right', face: 1 },
      up: { aim: [0, 1], frame: 'up', face: 1 },
      'up-left': { aim: [-Math.SQRT1_2, Math.SQRT1_2], frame: 'up-right', face: -1 },
      left: { aim: [-1, 0], frame: 'right', face: -1 },
      'down-left': { aim: [-Math.SQRT1_2, -Math.SQRT1_2], frame: 'down-right', face: -1 },
      down: { aim: [0, -1], frame: 'down-right', face: 1 },
      'down-right': { aim: [Math.SQRT1_2, -Math.SQRT1_2], frame: 'down-right', face: 1 },
    };
    for (const [pose, spec] of Object.entries(aimPoses)) {
      await page.evaluate(({ aim: [x, y], face }) => {
        const { P, I } = window.__RIG_QA__;
        I.keys.strafe = true;
        P.player.facing = face;
        P.player.aim.set(x, y);
      }, spec);
      await page.waitForFunction(({ pose, frame, face }) => {
        const s = window.__HB_RIG_VISUAL?.();
        return s?.bodyFrame === `aim-${frame}` && s.aimArmAligned && s.aimFixedUv &&
          s.aimSector === pose && s.poseFacing === face;
      }, { pose, ...spec }, { timeout: 4000 });
      await capture(page, view, `aim-${pose}`, bucket);
    }
    await page.evaluate(() => {
      const { P, I } = window.__RIG_QA__;
      I.keys.strafe = false;
      P.player.aim.set(1, 0);
    });

    // The body and gun are dark at rest; firing energizes only the chassis,
    // then returns to zero after recoil.
    await page.waitForFunction(() => {
      const s = window.__HB_RIG_VISUAL?.();
      return s?.recoil === 0 && s.bodyFrame === 'aim-right' &&
        Math.abs(s.aim.angle) < 1e-6;
    });
    await capture(page, view, 'idle', bucket);
    await page.keyboard.down('KeyJ');
    await page.waitForFunction(() => window.__HB_RIG_VISUAL?.().recoil > 0.025,
      null, { timeout: 4000 });
    await capture(page, view, 'fire-recoil', bucket);
    await page.keyboard.up('KeyJ');
    await page.waitForFunction(() => {
      const s = window.__HB_RIG_VISUAL?.();
      return s?.recoil === 0 && s.idleEmission.gun === 0;
    }, null, { timeout: 4000 });
    await capture(page, view, 'fire-decay', bucket);
    await page.evaluate(() => window.__RIG_QA__.W.clearBullets());

    // Force only physical state—not renderer state—then let the real update
    // loop select authored rise/fall silhouettes and resolve deck contact.
    await page.evaluate(() => {
      const { player } = window.__RIG_QA__.P;
      player.y = window.__RIG_QA__.deck + 2.0;
      player.vx = 0; player.vy = 8.0; player.grounded = false;
      player.traversalState = 'free'; player.onOneWay = null;
    });
    await page.waitForFunction(() => {
      const s = window.__HB_RIG_VISUAL?.();
      return s?.locomotionState === 'air-rise' && s.bodyFrame === 'air-rise' &&
        s.airbornePoseContinuous;
    }, null, { timeout: 4000 });
    await capture(page, view, 'air-rise', bucket);
    await page.evaluate(() => {
      const { player } = window.__RIG_QA__.P;
      player.y = window.__RIG_QA__.deck + 7.0;
      player.vx = 0; player.vy = -4.0; player.grounded = false;
      player.traversalState = 'free'; player.onOneWay = null;
    });
    await page.waitForFunction(() => {
      const s = window.__HB_RIG_VISUAL?.();
      return s?.locomotionState === 'air-fall' && s.bodyFrame === 'air-fall' &&
        s.airbornePoseContinuous;
    }, null, { timeout: 4000 });
    await capture(page, view, 'air-fall', bucket);
    await page.waitForFunction(() => {
      const s = window.__HB_RIG_VISUAL?.();
      return s?.landingBraceActive && s.bodyFrame === 'contact';
    }, null, { timeout: 4000 });
    await capture(page, view, 'land-brace', bucket);

    // Freeze at each real distance-driven ladder phase after it is reached.
    // No renderer field is touched: movement advances the atlas, releasing Up
    // leaves the physical actor attached and makes each evidence crop stable.
    const ladder = await page.evaluate(() => {
      const { P, L, I } = window.__RIG_QA__;
      const row = L.ladders.filter((r) => r.face === 1 && r.y1 - r.y0 >= 2.8)
        .sort((a, b) => a.x - b.x)[0];
      if (!row) throw new Error('no first-face proof ladder');
      Object.assign(P.player, {
        x: row.x, y: row.y0 + 0.03, vx: 0, vy: 0, grounded: false,
        traversalState: 'ladder', ladderId: row.id, onOneWay: null,
      });
      I.keys.up = false;
      return row;
    });
    report.views[view.name].ladder = ladder;
    for (let wanted = 0; wanted < 4; wanted++) {
      if (wanted > 0) {
        await page.evaluate(() => { window.__RIG_QA__.I.keys.up = true; });
      }
      await page.waitForFunction((frame) => {
        const s = window.__HB_RIG_VISUAL?.();
        return s?.locomotionState === 'climb' && s.climbFrame === frame &&
          s.bodyFrame === `climb-${frame}`;
      }, wanted, { timeout: 4000 });
      await page.evaluate(() => { window.__RIG_QA__.I.keys.up = false; });
      await capture(page, view, `climb-${wanted}`, bucket);
    }
    await page.evaluate(() => {
      const { P, I } = window.__RIG_QA__;
      I.keys.up = false;
      Object.assign(P.player, { traversalState: 'free', ladderId: null });
    });

    // Hold both sides of the first authored face rib. This is a real solid
    // wall/contact state; only the physical player row is staged, and the live
    // traversal decision keeps it pinned while the renderer chooses the pose.
    for (const side of [1, -1]) {
      await page.evaluate((wallSide) => {
        const { P, L, I } = window.__RIG_QA__;
        let cellX = -1, wallY = 0;
        for (let i = 64; i >= 30 && cellX < 0; i--) for (let j = 2; j < 15; j++) {
          const outside = i - wallSide;
          if (L.solidAt(i + 0.1, j + 0.1) &&
              !L.solidAt(outside + 0.1, j + 0.1) &&
              !L.solidAt(outside + 0.1, j + 1.1)) {
            cellX = i; wallY = j + 0.05; break;
          }
        }
        if (cellX < 0) throw new Error('no first-face wall contact proof cell');
        const snapX = wallSide > 0
          ? cellX - P.player.hw - 0.001
          : cellX + 1 + P.player.hw + 0.001;
        I.keys.left = false; I.keys.right = false; I.keys.down = false; I.keys.jump = false;
        Object.assign(P.player, {
          x: snapX, y: wallY, vx: 0, vy: -0.2,
          grounded: false, onOneWay: null, traversalState: 'wall',
          traversalSide: wallSide, traversalCellX: cellX,
          traversalSnapX: snapX, traversalUntil: window.HB.gameMs() + 5000,
        });
        P.player.facing = wallSide;
        P.player.aim.set(wallSide, 0);
      }, side);
      await page.waitForFunction((wallSide) => {
        const s = window.__HB_RIG_VISUAL?.();
        return s?.locomotionState === 'wall' && s.poseFacing === wallSide &&
          s.bodyFrame === `climb-${wallSide < 0 ? 2 : 0}`;
      }, side, { timeout: 4000 });
      await capture(page, view, `wall-${side > 0 ? 'right' : 'left'}`, bucket);
    }
    await page.evaluate(() => {
      const { P } = window.__RIG_QA__;
      Object.assign(P.player, { traversalState: 'free', traversalSide: 0 });
    });

    // During recoil the painted bore intentionally moves backward along the
    // aim axis. Compensate that presentation-only displacement before testing
    // attachment to the simulation muzzle.
    const muzzleErrors = Object.values(bucket).map(({ rig }) => Math.hypot(
      rig.muzzle.drawnX + rig.aim.x * rig.recoil - rig.muzzle.simX,
      rig.muzzle.drawnY + rig.aim.y * rig.recoil - rig.muzzle.simY,
    ));
    report.views[view.name].maxMuzzleError = Math.max(...muzzleErrors);
 } finally {
    await owned.close();
  }
 }

 // One actual-size contact sheet per viewport makes comparison faster than
 // opening thirty individual evidence crops. This is QA-only HTML composed
 // from finished PNGs; the game itself never creates a runtime canvas/crop.
 for (const [viewName, viewReport] of Object.entries(report.views)) {
   const cards = await Promise.all(Object.entries(viewReport.captures).map(async ([label, row]) => {
     const png = await readFile(row.path);
     return `<figure><img src="data:image/png;base64,${png.toString('base64')}">` +
       `<figcaption>${label}</figcaption></figure>`;
   }));
   const sheetPath = `${OUT}/${viewName}-contact-sheet.png`;
   const sheetOwned = await newPage({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1 });
   try {
     await sheetOwned.page.setContent(`<!doctype html><style>
       *{box-sizing:border-box} body{margin:0;padding:20px;background:#07171d;color:#f2d49b;
       font:14px/1.2 ui-monospace,monospace} h1{margin:0 0 16px;font-size:20px;letter-spacing:.12em}
       main{display:grid;grid-template-columns:repeat(6,1fr);gap:10px} figure{margin:0;padding:6px;
       border:1px solid #38535a;background:#0c222a} img{display:block;width:100%;height:164px;
       object-fit:cover;image-rendering:auto} figcaption{padding-top:5px;text-align:center}
       </style><h1>RIG // ${viewName.toUpperCase()} // SHIPPED SCALE</h1><main>${cards.join('')}</main>`);
     await sheetOwned.page.screenshot({ path: sheetPath, fullPage: true });
     viewReport.contactSheet = sheetPath;
   } finally {
     await sheetOwned.close();
   }
 }
});
await writeFile(`${OUT}/evidence.json`, JSON.stringify(report, null, 2) + '\n');

if (report.errors.length) throw new Error(report.errors.join('\n'));
for (const view of Object.values(report.views)) {
  if (view.maxMuzzleError > 1e-9) throw new Error(`muzzle drift ${view.maxMuzzleError}`);
  const c = view.captures;
  if (c['air-rise'].rig.bodyFrame !== 'air-rise' ||
      c['air-fall'].rig.bodyFrame !== 'air-fall' ||
      !c['land-brace'].rig.landingBraceActive)
    throw new Error('airborne/landing continuity proof failed');
  if (new Set(['R', 'S', 'L', 'H', 'F'].map((l) => c[`family-${l}`].rig.weapon)).size !== 5)
    throw new Error('five-chassis family proof failed');
  const aimFrames = {
    right: 'right', 'up-right': 'up-right', up: 'up', 'up-left': 'up-right',
    left: 'right', 'down-left': 'down-right', down: 'down-right',
    'down-right': 'down-right',
  };
  if (Object.entries(aimFrames).some(([pose, frame]) =>
      c[`aim-${pose}`].rig.bodyFrame !== `aim-${frame}` ||
      !c[`aim-${pose}`].rig.aimArmAligned ||
      !c[`aim-${pose}`].rig.aimFixedUv || c[`aim-${pose}`].rig.aimSector !== pose))
    throw new Error('eight-sector aim proof failed');
  if ([0, 1, 2, 3].some((frame) =>
      c[`climb-${frame}`].rig.bodyFrame !== `climb-${frame}`))
    throw new Error('four-pose climb proof failed');
  if (c['wall-right'].rig.locomotionState !== 'wall' ||
      c['wall-left'].rig.locomotionState !== 'wall')
    throw new Error('wall-contact pose proof failed');
  for (const combo of ['heavy-volatile', 'seeker-phase', 'rapid-forked']) {
    if (c[`roll-${combo}`].rig.gunPresentation.visibleTraitCount < 2)
      throw new Error(`rolled attachment proof failed: ${combo}`);
  }
  const idle = c.idle.rig.idleEmission;
  const firing = c['fire-recoil'].rig.idleEmission;
  const decay = c['fire-decay'].rig.idleEmission;
  if (idle.body !== 0 || idle.gun !== 0 || firing.gun <= 0 ||
      decay.body !== 0 || decay.gun !== 0)
    throw new Error(`action-only emission proof failed: ${JSON.stringify({ idle, firing, decay })}`);
}

console.log(JSON.stringify({ out: OUT, errors: report.errors,
  views: Object.fromEntries(Object.entries(report.views).map(([name, view]) => [name, {
    captures: Object.keys(view.captures), maxMuzzleError: view.maxMuzzleError,
  }])) }, null, 2));
