#!/usr/bin/env node
// current-art.mjs — capture the CURRENT (AI-painted) RIG and wasp exactly as the
// shipped renderer draws them, and measure the true on-screen scale, so the v2
// contact sheets compare against what a player sees rather than a source PNG.
//
//   node tools/art/capture/current-art.mjs [--out <dir>] [--port 8759] [--only desktop|phone]
//                                          [--wasp-only | --climb-only | --bg-only]
//   node tools/art/capture/current-art.mjs --spike [--cam far|mid] [--phone-dpr 2|3] [--only desktop|phone]
//        (T-109 A2 art spike: only the idle aim-right and run-contact crops plus
//         the RIG-free background, at another camera view or device pixel ratio,
//         merged by view name into current-art-spike.json)
//
// Dev-only (decisions.md entry 22). It changes nothing under src/: it loads the
// unmodified game with ?testapi=1 and stages ONLY physical sim state (player
// row, aim, weapon, a spawned wasp), the same way tools/playtest/
// rig-presentation-capture.mjs does, then screenshots tight crops.
//
// Views:
//   desktop  1280x800 @ DPR 1 — the shipped FAR default.
//   phone    RIG at 6% of a 390 px landscape height (entry 20 addendum) @ DPR 2.
//            The game has no phone framing yet (T-107 is todo), so this view is
//            a 16:10 viewport whose HEIGHT puts FAR RIG at 23.4 CSS px. The
//            renderer, materials and minification are the real ones; the crop
//            is the right pixel budget, not a phone composition.
//
// Honesty notes (also in reports/tasks/T-109/build.md):
//   * On a loaded 4-core host the shared 2.5 s boot budget drops slow textures
//     (src/render/preload.js). To give RIG's and the wasp's own atlases a fair
//     chance, large atlases that cannot appear in these crops (Crown, Warden,
//     emplacement, VFX packs, mutation parts, ecology variants, projectile
//     chassis) are aborted at the network layer. Each view records which RIG /
//     wasp art actually rendered; a crop whose art fell back is labelled so.
//   * The `bg-*` crop moves RIG 4 tiles right, out of the clip (the camera
//     follows the scroll cursor, not RIG), and re-shoots the same clip, so v2
//     can be composited onto the identical background.

import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { loadPlaywright, startStaticServer } from '../../assets/lib/browser.mjs';

const ROOT = resolve(import.meta.dirname, '../../..');
const args = process.argv.slice(2);
const argv = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const OUT = resolve(argv('--out', join(ROOT, 'tools/art/build/current')));
const PORT = Number(argv('--port', 8759));
const ONLY = argv('--only', '');
// --wasp-only: skip every RIG crop and write current-art-wasp.json instead
// (re-takes the wasp crops without repeating the slow RIG staging).
const WASP_ONLY = args.includes('--wasp-only');
// --climb-only: re-take just the four ladder phases and merge them into the
// existing current-art.json views (keeps every other crop and the background).
const CLIMB_ONLY = args.includes('--climb-only');
// --bg-only: re-take just the RIG-free background crop of each view (same clip
// as its stand-right-R crop) and merge it into current-art.json.
const BG_ONLY = args.includes('--bg-only');
if ([WASP_ONLY, CLIMB_ONLY, BG_ONLY].filter(Boolean).length > 1)
  throw new Error('--wasp-only, --climb-only and --bg-only are exclusive');
// --spike: the A2 art spike's two poses only (stand-right-R + background,
// run-contact-right-R) for one camera view (--cam) and phone DPR (--phone-dpr).
const SPIKE = args.includes('--spike');
const CAM = argv('--cam', 'far');
const PHONE_DPR = Number(argv('--phone-dpr', 2));
if (!['far', 'mid', 'near'].includes(CAM)) throw new Error(`--cam ${CAM}: far|mid|near`);
if (SPIKE && (WASP_ONLY || CLIMB_ONLY || BG_ONLY)) throw new Error('--spike is its own mode');
const MERGE_PART = CLIMB_ONLY ? 'climb-' : BG_ONLY ? 'bg-' : '';
const REPORT_FILE = WASP_ONLY ? 'current-art-wasp.json' : SPIKE ? 'current-art-spike.json' : 'current-art.json';
// The background crop moves RIG this far right, out of the 4-tile crop box.
// The camera follows the scroll cursor only (src/render/camera.js), so the
// framing is unchanged; 4 tiles stays far inside the fixture's follow lead.
const BG_SHIFT_TILES = 4.0;
await mkdir(OUT, { recursive: true });

const PHONE_RIG_CSS_PX = 0.06 * 390;       // entry 20 addendum
const RIG_VISUAL_TILES = 2.0;              // src/pure/rig.js RIG_BODY_VISUAL_H
const RIG_SURFACE_DEPTH = 1.15;            // src/render/player.js (render-only lift)
const T = 180000;                          // generous: boot is ~90 s on a loaded host
// A ladder phase needs 4-10 rendered frames; on a load-40 host a frame took
// 5-25 s, so the old 90 s wait expired before phase 1 (diagnosed T-109).
const CLIMB_WAIT = 600000;

const BLOCK = [
  /crown-/, /warden-motion/, /emplacement-motion/, /meridian-defense-vfx/,
  /action-vfx/, /enemy-parts\//, /enemy-ecology\//, /projectile-chassis/,
  /wasp-modular-v2/, /houndframe/, /hound-gait/, /carrier-hauler/, /iris-polyp/,
  /spore-mortar/, /capsules\//, /glyphs\//,
];

const report = { root: ROOT, blocked: BLOCK.map(String), views: {}, errors: [] };
// An --only run merges into the existing record instead of discarding the
// other view's captures; a --climb-only run keeps everything but the climb rows
// of the views it re-takes.
{
  const prior = join(OUT, REPORT_FILE);
  if (SPIKE && existsSync(prior)) {
    // spike views are keyed by camera and DPR: keep every other one
    const old = JSON.parse(readFileSync(prior, 'utf8'));
    Object.assign(report.views, old.views || {});
    report.errors.push(...(old.errors || []));
  } else if ((ONLY || MERGE_PART) && existsSync(prior)) {
    const old = JSON.parse(readFileSync(prior, 'utf8'));
    const retaken = (name) => !ONLY || name === ONLY;
    for (const [name, view] of Object.entries(old.views || {}))
      if (MERGE_PART || name !== ONLY) report.views[name] = view;
    report.errors.push(...(old.errors || []).filter((e) => {
      const name = e.split('/')[0];
      if (!retaken(name)) return true;
      return MERGE_PART ? !e.startsWith(name + '/' + MERGE_PART) : false;
    }));
  }
}
let baseUrl = '';

// The wasp-only pass needs its three small textures to win the same boot
// budget, so it also aborts the scene's large backdrop / environment /
// texture / VFX sources (the wasp crop's background then shows the game's
// own flat fallbacks — stated in the report).
const WASP_ONLY_BLOCK = [/backdrops\//, /environment\//, /textures\//, /vfx\//, /projectiles\//,
  /foreground/, /sprites\/rig-/, /weapons\//];

async function boot(page) {
  const block = WASP_ONLY ? BLOCK.concat(WASP_ONLY_BLOCK) : BLOCK;
  await page.route('**/assets/generated/**', (route) => {
    const url = route.request().url();
    return block.some((re) => re.test(url)) ? route.abort() : route.continue();
  });
  await page.goto(`${baseUrl}/index.html?testapi=1&audio=0&view=${CAM}&momentum=0&score=0&fixeddt=16`,
    { waitUntil: 'commit', timeout: T });
  await page.waitForFunction(() => !!window.HB, null, { timeout: T, polling: 1000 });
  const st = await page.evaluate(() => window.HB.state());
  if (st === 'MENU') await page.keyboard.press('Enter');
  else if (st !== 'PLAYING') await page.keyboard.press('r');
  await page.waitForFunction(() => window.HB?.state() === 'PLAYING', null, { timeout: T });
  await page.evaluate(async () => {
    const [P, W, H, L, I, S, TW, THREE, TM] = await Promise.all([
      import('/src/sim/player.js'), import('/src/sim/weapons.js'),
      import('/src/sim/hostiles.js'), import('/src/sim/level.js'),
      import('/src/sim/input.js'), import('/src/render/scene.js'),
      import('/src/render/tower.js'), import('three'), import('/src/sim/time.js'),
    ]);
    H.clearHostiles();
    const deck = L.groundTopAt(6);
    Object.assign(P.player, {
      x: 6, y: deck, vx: 0, vy: 0, grounded: true, facing: 1,
      traversalState: 'free', ladderId: null, iframesUntil: 0,
    });
    P.player.aim.set(1, 0);
    W.setWeapon('R');
    window.__ART_QA__ = { P, W, H, L, I, S, TW, THREE, TM, deck };
  });
  await page.waitForTimeout(1500);
  return page.evaluate(() => {
    const s = window.__HB_RIG_VISUAL?.();
    return { spriteReady: !!s?.spriteReady, aimReady: !!s?.aimReady,
      climbReady: !!s?.climbReady, weaponArt: s?.artReady || {},
      hostileSprites: window.HB?.spriteSnapshot ? 'see page' : 'n/a' };
  });
}

// Project RIG's feet and a point RIG_VISUAL_TILES above, at the depth the
// renderer draws RIG, through the live camera: CSS px per tile.
async function measureScale(page) {
  return page.evaluate(({ depth, tiles }) => {
    const { P, S, TW, THREE } = window.__ART_QA__;
    const o = new THREE.Object3D();
    const rect = S.renderer.domElement.getBoundingClientRect();
    const proj = (y) => {
      TW.placeOnTower(o, P.player.x, y, depth);
      o.updateMatrixWorld(true);
      const v = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).project(S.camera);
      return { x: rect.left + (v.x + 1) * rect.width / 2, y: rect.top + (1 - v.y) * rect.height / 2 };
    };
    const a = proj(P.player.y), b = proj(P.player.y + tiles);
    const px = Math.hypot(a.x - b.x, a.y - b.y);
    return { pxPerTile: px / tiles, rigVisualPx: px, feet: a, head: b,
      viewport: [innerWidth, innerHeight], dpr: devicePixelRatio,
      rigFractionOfHeight: px / innerHeight };
  }, { depth: RIG_SURFACE_DEPTH, tiles: RIG_VISUAL_TILES });
}

function clipAround(view, sx, sy, w, h, lift) {
  const vw = view.viewport.width, vh = view.viewport.height;
  return {
    x: Math.max(0, Math.min(vw - w, Math.round(sx - w / 2))),
    y: Math.max(0, Math.min(vh - h, Math.round(sy - h * lift))),
    width: w, height: h,
  };
}

// Playwright's own screenshot, at device scale. A raw DevTools
// Page.captureScreenshot was tried first and is WRONG here: on the live game
// page its first clipped capture resets the context's device-metrics
// emulation, so devicePixelRatio drops from 2 to 1 and every later "2x" crop
// is an upscaled DPR-1 render (probed: dpr [2] -> [1] after one capture).
// page.screenshot re-applies the emulation; the long timeout covers its
// document.fonts wait on a heavily loaded host.
async function shot(page, path, clip) {
  await page.screenshot({ path, clip, scale: 'device', timeout: 240000, animations: 'allow' });
  return page.evaluate(() => devicePixelRatio);
}

async function saveReport() {
  await writeFile(join(OUT, REPORT_FILE),
    JSON.stringify(report, null, 2) + '\n');
}

// One label failing (a slow host can miss a transient pose) is recorded and
// skipped; it never discards the crops already taken.
async function attempt(view, label, fn) {
  try {
    await fn();
  } catch (err) {
    report.errors.push(`${view.name}/${label}: ${String(err && err.message || err).split('\n')[0]}`);
  }
  await saveReport();
}

async function rigState(page) {
  return page.evaluate(() => ({
    rig: window.__HB_RIG_VISUAL(),
    player: ((p) => ({ x: p.x, y: p.y, vy: p.vy, grounded: p.grounded,
      traversalState: p.traversalState, aim: [p.aim.x, p.aim.y], facing: p.facing }))(
      window.__ART_QA__.P.player),
  }));
}

async function freezeScroll(page, scroll) {
  if (scroll === null || scroll === undefined) return;
  await page.evaluate((x) => window.__ART_QA__.TM.setScrollX(x), scroll);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

async function crop(page, view, label, bucket, box, { background = false, scroll = 0 } = {}) {
  await freezeScroll(page, scroll);
  const state = await rigState(page);
  if (!state.rig.rigVisible)
    throw new Error(`${view.name}/${label}: RIG not visible (${state.rig.bodyFrame})`);
  const clip = clipAround(view, state.rig.screen.x, state.rig.screen.y, box.w, box.h, box.lift);
  const path = join(OUT, `${view.name}-${label}.png`);
  const captureScale = await shot(page, path, clip);
  const row = { path, clip, captureScale, bodyFrame: state.rig.bodyFrame, canvasFallback: state.rig.canvasFallback,
    weapon: state.rig.weapon, gunUsesArt: state.rig.gunUsesArt,
    screen: state.rig.screen, player: state.player, muzzle: state.rig.muzzle };
  if (background) await backgroundShot(page, view, label, row, clip, scroll);
  bucket[label] = row;
}

// The RIG-free background for a crop: RIG steps BG_SHIFT_TILES to the right,
// out of the clip, and the same clip is shot again. (The first version hid RIG
// with the game's own i-frame blink; under a slow device-scale page.screenshot
// the blink phase at capture time is random, and the phone background still
// held RIG. Moving RIG does not move the camera: it follows the scroll cursor.)
async function backgroundShot(page, view, label, row, clip, scroll) {
  const home = await page.evaluate((dx) => {
    const { P } = window.__ART_QA__;
    const was = { x: P.player.x, y: P.player.y, grounded: P.player.grounded };
    P.player.x = was.x + dx;
    return was;
  }, BG_SHIFT_TILES);
  try {
    await freezeScroll(page, scroll);
    // clip and screen are both CSS px; the clip is 4 tiles wide, so RIG's
    // anchor a quarter-clip (1 tile) past its right edge leaves RIG outside.
    const s = await page.evaluate(() => window.__HB_RIG_VISUAL().screen);
    if (s.x < clip.x + clip.width * 1.25)
      throw new Error(`${view.name}: RIG still too close to the background clip (screen x ${s.x})`);
    const bgPath = join(OUT, `${view.name}-bg-${label}.png`);
    await shot(page, bgPath, clip);
    row.background = bgPath;
    row.backgroundMethod = `RIG moved ${BG_SHIFT_TILES} tiles right, same clip`;
  } finally {
    await page.evaluate((was) => {
      Object.assign(window.__ART_QA__.P.player, { ...was, vx: 0, vy: 0 });
    }, home);
  }
}

// The camera auto-scrolls with game time, and on this host a capture takes
// minutes; rewind the scroll to the opening deck before every staging so RIG
// (and the crop) stay on the same first-face background. setScrollX is the
// sim's own setter (src/sim/time.js); hostiles are cleared so nothing spawned
// by the rewind can enter a crop or hit RIG.
async function stageGround(page) {
  await page.evaluate(() => {
    const { P, H, TM, deck } = window.__ART_QA__;
    TM.setScrollX(0);
    H.clearHostiles();
    Object.assign(P.player, { x: 6, y: deck, vx: 0, vy: 0, grounded: true,
      traversalState: 'free', onOneWay: null });
  });
}

async function captureView(newPage, view) {
  const owned = await newPage({ viewport: view.viewport, deviceScaleFactor: view.dpr });
  const { page } = owned;
  const prior = MERGE_PART ? report.views[view.name] : null;
  if (MERGE_PART && !prior) throw new Error(`no prior ${view.name} capture to merge ${MERGE_PART}* into`);
  const bucket = prior ? prior.captures : {};
  if (CLIMB_ONLY) for (const k of Object.keys(bucket)) if (k.startsWith('climb-')) delete bucket[k];
  const out = prior || { viewport: view.viewport, dpr: view.dpr, captures: bucket };
  report.views[view.name] = out;
  page.on('pageerror', (e) => report.errors.push(`${view.name} pageerror: ${e.message}`));
  page.on('console', (m) => {
    const t = m.text();
    if (/did not load|still loading/.test(t) && /rig-|wasp-pixel|weapons\//.test(t))
      (out.artWarnings ||= []).push(t.slice(0, 240));
  });
  const wait = (fn, arg, ms = 120000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 100 });
  try {
    const t0 = Date.now();
    const art = await boot(page);
    const bootMs = Date.now() - t0;
    const scale = await measureScale(page);
    if (prior) {
      // Same framing as the pass being merged into, or the crops don't compare.
      const drift = Math.abs(scale.pxPerTile / prior.scale.pxPerTile - 1);
      out[CLIMB_ONLY ? 'climbPass' : 'bgPass'] = { art, bootMs, scale, scaleDrift: drift };
      if (drift > 0.005) throw new Error(`merge pass: px/tile ${scale.pxPerTile} != prior ${prior.scale.pxPerTile}`);
    } else {
      Object.assign(out, { art, bootMs, scale });
    }
    await saveReport();
    const u = out.scale.pxPerTile;
    const box = prior ? prior.box : { w: Math.round(u * 4.0), h: Math.round(u * 3.4), lift: 0.66 };
    out.box = box;

    if (BG_ONLY) {
      await attempt(view, 'bg-stand-right-R', async () => {
        const row = bucket['stand-right-R'];
        if (!row) throw new Error('no stand-right-R crop to take the background for');
        await stageGround(page);
        await backgroundShot(page, view, 'stand-right-R', row, row.clip, 0);
      });
    }

    if (SPIKE) {
      // The A2 spike's two poses: idle aim-right (with the RIG-free background)
      // and the run's contact frame, both gun R.
      await attempt(view, 'stand-right-R', async () => {
        await page.evaluate(() => {
          const { P, H, I, TM, deck } = window.__ART_QA__;
          TM.setScrollX(0); H.clearHostiles();
          Object.assign(P.player, { x: 6, y: deck, vx: 0, vy: 0, grounded: true,
            traversalState: 'free', onOneWay: null, facing: 1 });
          I.keys.strafe = true; P.player.aim.set(1, 0);
        });
        await wait(() => window.__HB_RIG_VISUAL?.().bodyFrame === 'aim-right');
        await crop(page, view, 'stand-right-R', bucket, box, { background: true });
      });
      await page.evaluate(() => { window.__ART_QA__.I.keys.strafe = false; });
      await attempt(view, 'run-contact-right-R', async () => {
        await stageGround(page);
        await page.keyboard.down('ArrowRight');
        try {
          await wait(() => {
            const s = window.__HB_RIG_VISUAL?.();
            return s?.locomotionState === 'run' && s.bodyFrame === 'contact';
          }, null, 240000);
          await crop(page, view, 'run-contact-right-R', bucket, box, { scroll: null });
        } finally {
          await page.keyboard.up('ArrowRight');
        }
      });
    }

    if (!WASP_ONLY && !MERGE_PART && !SPIKE) {
      // Stationary aim, R, the four authored elevations (left = the mirror).
      const aims = {
        right: [1, 0], 'up-right': [Math.SQRT1_2, Math.SQRT1_2], up: [0, 1],
        'down-right': [Math.SQRT1_2, -Math.SQRT1_2],
      };
      for (const [name, [x, y]] of Object.entries(aims)) {
        await attempt(view, `stand-${name}-R`, async () => {
          await page.evaluate(({ x, y }) => {
            const { P, H, I, TM, deck } = window.__ART_QA__;
            TM.setScrollX(0); H.clearHostiles();
            Object.assign(P.player, { x: 6, y: deck, vx: 0, vy: 0, grounded: true,
              traversalState: 'free', onOneWay: null, facing: 1 });
            I.keys.strafe = true; P.player.aim.set(x, y);
          }, { x, y });
          await wait((n) => window.__HB_RIG_VISUAL?.().bodyFrame === `aim-${n}`, name);
          await crop(page, view, `stand-${name}-R`, bucket, box, { background: name === 'right' });
        });
      }
      await page.evaluate(() => {
        const { P, I } = window.__ART_QA__; I.keys.strafe = false; P.player.aim.set(1, 0);
      });

      // R at aim-right is already 'stand-right-R' (with its background); the
      // same label here would overwrite that row.
      for (const letter of ['S', 'L', 'H', 'F']) {
        await attempt(view, `stand-right-${letter}`, async () => {
          await stageGround(page);
          await page.evaluate((l) => window.__ART_QA__.W.setWeapon(l), letter);
          await wait((l) => {
            const s = window.__HB_RIG_VISUAL?.();
            return s?.weapon === l && s.bodyFrame === 'aim-right';
          }, letter);
          await crop(page, view, `stand-right-${letter}`, bucket, box);
        });
      }
      await page.evaluate(() => window.__ART_QA__.W.setWeapon('R'));

      for (const frame of ['contact', 'pass', 'flight']) {
        await attempt(view, `run-${frame}-right-R`, async () => {
          await stageGround(page);
          await page.keyboard.down('ArrowRight');
          try {
            await wait((f) => {
              const s = window.__HB_RIG_VISUAL?.();
              return s?.locomotionState === 'run' && s.bodyFrame === f;
            }, frame);
            await crop(page, view, `run-${frame}-right-R`, bucket, box, { scroll: null });
          } finally {
            await page.keyboard.up('ArrowRight');
          }
        });
      }

      for (const [label, dy, vy] of [['air-rise', 1.2, 9.0], ['air-fall', 3.0, -0.5]]) {
        await attempt(view, `${label}-right-R`, async () => {
          await page.evaluate(({ dy, vy }) => {
            const { P, TM, deck } = window.__ART_QA__;
            TM.setScrollX(0);
            Object.assign(P.player, { x: 6, y: deck + dy, vx: 0, vy, grounded: false,
              traversalState: 'free', onOneWay: null });
          }, { dy, vy });
          await wait((l) => window.__HB_RIG_VISUAL?.().bodyFrame === l, label);
          await crop(page, view, `${label}-right-R`, bucket, box, { scroll: null });
        });
      }
      await page.waitForTimeout(500);
    }

    if (!WASP_ONLY && !BG_ONLY && !SPIKE) {
      const ladder = await page.evaluate(() => {
        const { L } = window.__ART_QA__;
        const row = L.ladders.filter((r) => r.face === 1 && r.y1 - r.y0 >= 2.8)
          .sort((a, b) => a.x - b.x)[0];
        return row ? { id: row.id, x: row.x, y0: row.y0, y1: row.y1 } : null;
      });
      if (ladder) {
        // One continuous climb from the ladder's foot. The renderer derives the
        // phase from distance climbed (src/render/player.js), so RIG climbs
        // with the sim's own climb key, stops in the poll that first sees the
        // wanted phase (key released inside that same page task), is cropped,
        // and climbs on. Aim is UP, as a climbing player's is (holding up aims
        // up); strafe keeps it up while RIG is stopped for the crop.
        await page.evaluate((lad) => {
          const { P, H, I, TM } = window.__ART_QA__;
          H.clearHostiles();
          TM.setScrollX(Math.max(0, lad.x - 8));
          Object.assign(P.player, { x: lad.x, y: lad.y0 + 0.03, vx: 0, vy: 0, grounded: false,
            traversalState: 'ladder', ladderId: lad.id, onOneWay: null, facing: 1 });
          I.keys.up = false; I.keys.strafe = true; P.player.aim.set(0, 1);
        }, ladder);
        await page.waitForTimeout(300);
        for (let want = 0; want < 4; want++) {
          await attempt(view, `climb-${want}-up-R`, async () => {
            await page.evaluate(() => {
              const { H, I } = window.__ART_QA__;
              H.clearHostiles();
              I.keys.up = false; I.keys.strafe = true;
            });
            if (want > 0) await page.evaluate(() => { window.__ART_QA__.I.keys.up = true; });
            try {
              await wait((f) => {
                const s = window.__HB_RIG_VISUAL?.();
                const hit = s?.locomotionState === 'climb' && s.climbFrame === f;
                if (hit) window.__ART_QA__.I.keys.up = false;
                return hit;
              }, want, CLIMB_WAIT);
            } finally {
              await page.evaluate(() => { window.__ART_QA__.I.keys.up = false; });
            }
            const aim = await page.evaluate(() => [window.__ART_QA__.P.player.aim.x, window.__ART_QA__.P.player.aim.y]);
            if (Math.abs(aim[0]) > 1e-6 || Math.abs(aim[1] - 1) > 1e-6)
              throw new Error(`climb-${want}: aim is ${aim}, not up`);
            await crop(page, view, `climb-${want}-up-R`, bucket, box, { scroll: null });
          });
        }
        await page.evaluate(() => {
          const { P, I } = window.__ART_QA__;
          I.keys.up = false; I.keys.strafe = false;
          P.player.aim.set(1, 0);
          Object.assign(P.player, { traversalState: 'free', ladderId: null });
        });
      }
    }

    // Wasp: spawn one out of dive range, let it materialize, crop it cruising.
    if (!MERGE_PART && !SPIKE) await attempt(view, 'wasp', async () => {
      await stageGround(page);
      // Stage the row already condensed (enterUntil in the past), the same way
      // the player row is staged: at fixeddt=16 on a loaded host the 900 ms
      // materialization otherwise outlasts any sane wait.
      const spawned = await page.evaluate(() => {
        const { P, H, TM } = window.__ART_QA__;
        H.clearHostiles();
        H.spawnHostile(P.player.x + 9.5, P.player.y + 3.4, 0, 'wasp', null, '');
        for (const h of H.hostiles) h.enterUntil = TM.gameMs - 1;
        window.__ART_QA__.waspAt = TM.gameMs;
        return H.hostiles.length;
      });
      out.wasp = { spawned, frames: [] };
      if (!spawned) return;
      await wait(() => window.__ART_QA__.TM.gameMs > window.__ART_QA__.waspAt + 160 &&
        window.__ART_QA__.H.hostiles.some((h) => h.kind === 'wasp'), null, 240000);
      for (let k = 0; k < 4; k++) {
        const ws = await page.evaluate(({ depth }) => {
          const { H, S, TW, THREE } = window.__ART_QA__;
          const e = H.hostiles.find((h) => h.kind === 'wasp');
          if (!e) return null;
          const o = new THREE.Object3D();
          TW.placeOnTower(o, e.x, e.y, depth);
          o.updateMatrixWorld(true);
          const v = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).project(S.camera);
          const rect = S.renderer.domElement.getBoundingClientRect();
          return { x: rect.left + (v.x + 1) * rect.width / 2,
            y: rect.top + (1 - v.y) * rect.height / 2, state: e.state, t: e.t, dir: e.dir };
        }, { depth: RIG_SURFACE_DEPTH });
        if (!ws) break;
        const ww = Math.round(u * 3.2), wh = Math.round(u * 2.4);
        const clip = clipAround(view, ws.x, ws.y, ww, wh, 0.5);
        const path = join(OUT, `${view.name}-${WASP_ONLY ? 'wasponly' : 'wasp'}-${k}.png`);
        await shot(page, path, clip);
        out.wasp.frames.push({ path, clip, state: ws.state, t: ws.t, dir: ws.dir, screen: { x: ws.x, y: ws.y } });
        await page.waitForTimeout(700);
      }
    });
  } finally {
    await owned.close();
  }
}

let server = null;
let browser = null;
try {
  server = await startStaticServer(ROOT, { port: PORT });
  baseUrl = server.baseUrl;
  // three.js arrives from the CDN import map. This host's egress goes through
  // HTTPS_PROXY (the browser trust store already holds its CA), so hand the
  // same proxy to Chrome; local game files bypass it.
  const { chromium } = await loadPlaywright();
  const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || '';
  browser = await chromium.launch({ channel: 'chrome', headless: true,
    ...(proxyUrl ? { proxy: { server: proxyUrl, bypass: '127.0.0.1,localhost' } } : {}) });
  const newPage = async (opts) => {
    const context = await browser.newContext(opts);
    const page = await context.newPage();
    return { page, close: () => context.close() };
  };
  const camTag = CAM === 'far' ? '' : `-${CAM}`;
  if (!ONLY || ONLY === 'desktop')
    await captureView(newPage, { name: `desktop${SPIKE ? camTag : ''}`,
      viewport: { width: 1280, height: 800 }, dpr: 1 });
  if (!ONLY || ONLY === 'phone') {
    // RIG's CSS height at FAR is proportional to viewport height (fixed vertical
    // FOV), so the desktop measurement fixes the height that yields 23.4 px.
    // A spike pass reuses the main record's desktop measurement so every
    // phone view shares one viewport.
    let farFrac = report.views.desktop?.scale?.rigFractionOfHeight;
    const main = join(OUT, 'current-art.json');
    if (!farFrac && existsSync(main))
      farFrac = JSON.parse(readFileSync(main, 'utf8')).views?.desktop?.scale?.rigFractionOfHeight;
    const frac = farFrac || 0.0434;
    const h = Math.round(PHONE_RIG_CSS_PX / frac);
    const dpr = SPIKE ? PHONE_DPR : 2;
    await captureView(newPage, { name: `phone${SPIKE ? camTag + (dpr === 2 ? '' : `-dpr${dpr}`) : ''}`,
      viewport: { width: Math.round(h * 1.6), height: h }, dpr });
  }
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) await server.close().catch(() => {});
}
await saveReport();
console.log(JSON.stringify({ out: OUT, errors: report.errors,
  views: Object.fromEntries(Object.entries(report.views).map(([k, v]) => [k, {
    bootMs: v.bootMs, art: v.art, scale: v.scale, warnings: v.artWarnings,
    captures: Object.keys(v.captures || {}).length, wasp: v.wasp?.frames?.length }])) }, null, 2));
if (report.errors.length) process.exitCode = 1;
