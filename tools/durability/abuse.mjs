#!/usr/bin/env node
/* abuse.mjs — HULLBREAKER durability harness (T-032).
 *
 * Drives a real browser through the things a 9-year-old actually does to a
 * game (alt-tab away for a minute, drag the window around, mash keys, spam
 * restart) plus the failures that produced a black page for the operator,
 * and reports what the page did about each one. Dev-only: it touches
 * nothing under src/ and the game cannot tell it is running.
 *
 * What it proves and what it cannot:
 *   - PROVES, empirically: the boot panel appears for a module that fails to
 *     parse; the simulation clock does not catch up after a real suspended
 *     tab; resize / pause / restart / key storms raise no page failure; an
 *     injected fault inside the frame loop ends in a readable panel rather
 *     than a still picture; a lost drawing surface does the same.
 *   - CANNOT prove: that a game which keeps running while quietly doing the
 *     wrong thing is noticed (nothing throws, so nothing fires), or that a
 *     real Chrome on a real laptop throttles exactly like the lifecycle
 *     state used here. Where a scenario could not create the condition it
 *     wanted, it reports SKIP with the reason instead of passing.
 *
 * Usage (never on 8741/8742 — those are the operator's):
 *   node tools/durability/abuse.mjs
 *   node tools/durability/abuse.mjs --port 8747 --background-seconds 60
 *   node tools/durability/abuse.mjs --only boot,background --headed
 *
 * Browser: the installed system Chrome through playwright-core, the same
 * channel tools/playtest uses, so nothing is downloaded. playwright-core is
 * resolved from this directory first, then from tools/playtest's install,
 * then from $HB_PLAYWRIGHT_CORE.
 */

import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, appendFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');

/* ----------------------------- options ---------------------------- */

const args = process.argv.slice(2);
const opt = {
  port: 8747, brokenPort: 8748, root: REPO, headed: false,
  backgroundSeconds: 60, only: null,
  out: join(REPO, 'artifacts', 't032-durability'),
  json: null,
};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--port') opt.port = Number(args[++i]);
  else if (a === '--broken-port') opt.brokenPort = Number(args[++i]);
  else if (a === '--root') opt.root = resolve(args[++i]);
  else if (a === '--headed') opt.headed = true;
  else if (a === '--background-seconds') opt.backgroundSeconds = Number(args[++i]);
  else if (a === '--only') opt.only = args[++i].split(',').map((s) => s.trim());
  else if (a === '--out') opt.out = resolve(args[++i]);
  else if (a === '--json') opt.json = resolve(args[++i]);
  else if (a === '--help' || a === '-h') {
    console.log(`usage: node tools/durability/abuse.mjs [options]

  --port <n>                 dev server port for the healthy tree (default 8747)
  --broken-port <n>          dev server port for the deliberately broken copy (8748)
  --root <path>              tree to serve (default: this worktree)
  --background-seconds <n>   how long the tab is suspended in the background test (60)
  --only a,b                 run just these scenarios
  --headed                   show the browser
  --out <dir>                where screenshots land (artifacts/t032-durability)
  --json <file>              also write the machine-readable result here

  8741 and 8742 belong to the operator: this harness never binds them.`);
    process.exit(0);
  }
}
if (opt.port === 8741 || opt.port === 8742 || opt.brokenPort === 8741 || opt.brokenPort === 8742) {
  console.error('abuse: 8741/8742 are the operator\'s ports — pick another.');
  process.exit(2);
}

/* --------------------------- dependencies -------------------------- */

async function loadChromium() {
  const candidates = [
    'playwright-core',
    pathToFileURL(join(HERE, 'node_modules', 'playwright-core', 'index.js')).href,
    pathToFileURL(join(REPO, 'tools', 'playtest', 'node_modules', 'playwright-core', 'index.js')).href,
    process.env.HB_PLAYWRIGHT_CORE
      ? pathToFileURL(resolve(process.env.HB_PLAYWRIGHT_CORE)).href : null,
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      // playwright-core is CommonJS: through a bare specifier Node hands back
      // named exports, through a file URL it may only hand back `default`
      const mod = await import(c);
      const chromium = mod.chromium || (mod.default && mod.default.chromium);
      if (chromium) return chromium;
    } catch { /* try the next one */ }
  }
  console.error('abuse: playwright-core not found. Run `npm install` in tools/durability,\n' +
                '       or point HB_PLAYWRIGHT_CORE at an existing install.');
  process.exit(2);
}

/* ------------------------------ server ----------------------------- */

/* A server that exits immediately (usually: the port is already taken) must
   be fatal. Silently testing against whatever else is listening on that port
   is how a harness reports on a tree nobody asked about. */
function serve(root, port) {
  const child = spawn(process.execPath,
    [join(REPO, 'tools', 'serve.mjs'), String(port), '--root', root, '--quiet'],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr.on('data', (d) => process.stderr.write('[serve ' + port + '] ' + d));
  child.on('exit', (code) => {
    if (child.killed) return;
    console.error('abuse: the dev server on ' + port + ' exited (' + code +
      ') — is something already listening there? Pick another with --port.');
    process.exit(2);
  });
  return child;
}

async function waitForServer(url, timeoutMs = 8000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await sleep(120);
  }
  return false;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------- page bookkeeping ------------------------ */

/* Every scenario gets a fresh page whose console errors and uncaught page
   failures are recorded. Injected failures are expected to appear here —
   the scenario says which ones it planted, and everything else is a
   finding. */
async function openPage(context, url, { waitBoot = true } = {}) {
  const page = await context.newPage();
  const log = { consoleErrors: [], pageErrors: [] };
  page.on('console', (m) => {
    if (m.type() === 'error') log.consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => log.pageErrors.push(String(e && e.message ? e.message : e)));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (waitBoot) {
    await page.waitForFunction(
      () => window.__HB_FAILSAFE && window.__HB_FAILSAFE.isBooted(), null,
      { timeout: 15000 },
    ).catch(() => {});
  }
  return { page, log };
}

const snapshot = (page) => page.evaluate(() => {
  const api = window.__HB_FAILSAFE;
  const hb = window.HB;
  return {
    failsafe: api ? {
      installed: true, booted: api.isBooted(), showing: api.showing(),
      beats: api.beats(), errors: api.errors(),
    } : { installed: false },
    panelVisible: !!document.querySelector('#fail.on'),
    panelText: Array.from(document.querySelectorAll('#fail .fail-plain'))
      .map((el) => el.textContent).join(' | '),
    game: hb ? {
      state: hb.state(), gameMs: hb.gameMs(),
      x: hb.player.x, y: hb.player.y, hp: hb.player.hp,
      attempts: hb.sliceStats.attempts,
      halted: hb.failsafe().halted, faults: hb.failsafe().faults,
      recoveries: hb.failsafe().recoveries,
    } : null,
  };
});

/* ----------------------------- scenarios --------------------------- */

const scenarios = [];
const scenario = (name, what, fn) => scenarios.push({ name, what, fn });

scenario('boot', 'a healthy page boots with the panel down and nothing in the log',
  async ({ context, base }) => {
    const { page, log } = await openPage(context, base + '/index.html');
    await sleep(1500);
    const s = await snapshot(page);
    await page.close();
    // the shipped URL parks on the title screen (MENU) with the run built and
    // frozen behind it; ?testapi=1 / ?selftest=1 auto-start into PLAYING
    return {
      pass: s.failsafe.installed && s.failsafe.booted && !s.panelVisible &&
        s.failsafe.beats > 30 && s.game &&
        (s.game.state === 'MENU' || s.game.state === 'PLAYING') &&
        log.pageErrors.length === 0,
      detail: 'booted=' + s.failsafe.booted + ' beats=' + s.failsafe.beats +
        ' state=' + (s.game && s.game.state) + ' panel=' + s.panelVisible,
      log,
    };
  });

scenario('broken-import', 'a module that will not parse shows the boot panel, not a void',
  async ({ context, brokenBase, out }) => {
    const { page, log } = await openPage(context, brokenBase + '/index.html', { waitBoot: false });
    await page.waitForSelector('#fail.on', { timeout: 15000 }).catch(() => {});
    await sleep(400);
    const s = await snapshot(page);
    const shot = join(out, 'boot-failure.png');
    await page.screenshot({ path: shot });
    const detailShown = await page.evaluate(() => {
      const d = document.querySelector('#fail details');
      if (d) d.open = true;
      const pre = document.getElementById('failDetail');
      return pre ? pre.textContent.slice(0, 400) : '';
    });
    await page.screenshot({ path: join(out, 'boot-failure-detail.png') });
    await page.close();
    return {
      pass: s.panelVisible && /could not start/i.test(s.panelText) &&
        /Try again/.test(s.panelText) && detailShown.length > 0,
      detail: 'panel=' + s.panelVisible + ' text="' + s.panelText.slice(0, 90) +
        '…" operatorDetail=' + JSON.stringify(detailShown.slice(0, 120)) +
        ' shot=' + shot,
      log,
      expectedErrors: true,           // the broken module logs; that is the point
    };
  });

/* HONESTY NOTE, and it is the whole reason this scenario is written the way
   it is: headless Chrome keeps every tab visible. Measured here — a second
   tab brought to the front left the game's own page reporting
   visibilityState 'visible' and still painting 120 frames a second, and
   Page.setWebLifecycleState('frozen') was accepted and did nothing (7200
   frames painted across a 60 s "suspension"); Emulation.setPageVisibility-
   Override no longer exists in the protocol. So the browser's hidden-tab
   behaviour is reproduced INSIDE the page, in the same order Chrome does
   it: visibilityState flips to hidden, visibilitychange fires, rAF stops
   being serviced for the whole minute, and the single frame that lands on
   return carries a timestamp a minute later. That is exactly the sequence
   the clamp, the key release and the freeze watchdog have to survive — but
   it is a reproduction, not the browser doing it, and a real laptop should
   still be alt-tabbed once by a person. */
scenario('background', 'a tab hidden for a minute resumes without a catch-up step',
  async ({ context, base, seconds }) => {
    const { page, log } = await openPage(context, base + '/index.html?testapi=1');
    await sleep(2000);
    await page.keyboard.down('ArrowRight');       // a key held at the moment of alt-tab
    await sleep(400);
    const before = await snapshot(page);
    await page.evaluate(() => {
      const real = window.requestAnimationFrame.bind(window);
      let pending = null;
      window.requestAnimationFrame = (cb) => { pending = cb; return 0; };
      Object.defineProperty(document, 'visibilityState',
        { configurable: true, get: () => 'hidden' });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
      window.__hbResume = () => {
        window.requestAnimationFrame = real;
        delete document.visibilityState;
        delete document.hidden;
        document.dispatchEvent(new Event('visibilitychange'));
        const cb = pending; pending = null;
        if (cb) real(cb);
      };
    });
    const wall0 = Date.now();
    await sleep(Math.min(3000, seconds * 500));
    const hiddenKeys = await page.evaluate(() => ({
      right: window.HB.keys.right, panel: !!document.querySelector('#fail.on'),
    }));
    await sleep(Math.max(0, seconds * 1000 - (Date.now() - wall0)));
    const midway = await snapshot(page);          // still hidden: nothing may have panelled
    await page.evaluate(() => window.__hbResume());
    const wallMs = Date.now() - wall0;
    const after = await snapshot(page);
    await page.keyboard.up('ArrowRight');
    await sleep(1500);                            // …and give the watchdog its chance
    const settled = await snapshot(page);
    await page.close();
    const simJumpMs = after.game.gameMs - before.game.gameMs;
    const moved = Math.hypot(after.game.x - before.game.x, after.game.y - before.game.y);
    const beatsDuring = after.failsafe.beats - before.failsafe.beats;
    return {
      pass: beatsDuring <= 2 && simJumpMs <= 500 && moved <= 1 &&
        hiddenKeys.right === false && !hiddenKeys.panel && !midway.panelVisible &&
        !settled.panelVisible && settled.game.state === 'PLAYING' &&
        log.pageErrors.length === 0,
      detail: (wallMs / 1000).toFixed(1) + 's hidden: ' + beatsDuring + ' frames painted, ' +
        'the simulation advanced ' + simJumpMs.toFixed(1) + ' ms (one clamped step is ' +
        '50 ms), RIG moved ' + moved.toFixed(3) + ' tiles, held key released=' +
        (hiddenKeys.right === false) + ', panel while hidden=' + midway.panelVisible +
        ', panel after=' + settled.panelVisible + ', state=' + settled.game.state,
      log,
    };
  });

scenario('frozen-watchdog', 'a silently dead loop on a live page is reported, not left still',
  async ({ context, base, out }) => {
    const { page, log } = await openPage(context, base + '/index.html?testapi=1');
    await sleep(1200);
    // no exception, no lost surface: the loop simply stops being scheduled —
    // the exact "frozen canvas, live page" defect, and the only thing that can
    // notice it is the heartbeat watchdog
    await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
    const appeared = await page.waitForSelector('#fail.on', { timeout: 12000 })
      .then(() => true).catch(() => false);
    const s = await snapshot(page);
    if (appeared) await page.screenshot({ path: join(out, 'frozen-loop.png') });
    await page.close();
    return {
      pass: appeared && s.panelVisible && /stuck/i.test(s.panelText) &&
        /Play again/.test(s.panelText),
      detail: 'panel=' + s.panelVisible + ' after a dead loop; text="' +
        s.panelText.slice(0, 70) + '…"',
      log,
    };
  });

scenario('resize', 'forty window sizes during play, including absurd ones',
  async ({ context, base }) => {
    const { page, log } = await openPage(context, base + '/index.html?testapi=1');
    await page.keyboard.down('ArrowRight');
    const sizes = [];
    for (let i = 0; i < 40; i++) {
      const w = 320 + ((i * 137) % 1280), h = 200 + ((i * 91) % 760);
      sizes.push(w + 'x' + h);
      await page.setViewportSize({ width: w, height: h });
      await sleep(60);
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await sleep(500);
    await page.keyboard.up('ArrowRight');
    const s = await snapshot(page);
    const aspect = await page.evaluate(() => ({
      ok: Number.isFinite(window.HB.player.x) && Number.isFinite(window.HB.player.y),
      edges: window.HB.edges(),
    }));
    await page.close();
    return {
      pass: log.pageErrors.length === 0 && !s.panelVisible && s.game.state === 'PLAYING' &&
        aspect.ok && s.game.faults === 0 &&
        Number.isFinite(aspect.edges.left) && Number.isFinite(aspect.edges.right),
      detail: sizes.length + ' sizes, last 1280x800; state=' + s.game.state +
        ' faults=' + s.game.faults + ' finite=' + aspect.ok +
        ' edges=[' + aspect.edges.left.toFixed(2) + ',' + aspect.edges.right.toFixed(2) + ']',
      log,
    };
  });

/* HONESTY NOTE. A corner's 1100 ms yaw ritual only starts when its gate wave
   dies, and this harness drives the game with a deliberately stupid policy
   (hold right, auto-fire, hop) — measured over four 90 s runs it reaches the
   GATE every time and never clears it, so the pause below is taken during
   the gate phase (scroll halted, wave live, ritual armed) and never inside
   the yaw snaps themselves. A watcher stays armed for the turn in case the
   wave does die; if it fires the report says so. Pausing INSIDE the 1100 ms
   turn still needs the playtest harness's real policy, or a person.
   Everything else here is reached every run: the fixture retry transition,
   the title handoff, and a hundred pause toggles back to back. */
scenario('pause-transitions', 'pause taken during every transition a bot can reach',
  async ({ context, base }) => {
    const notes = [];
    let bad = null;
    const { page, log } = await openPage(context, base + '/index.html?testapi=1');

    // 1. the title handoff: pause on the frame the run begins
    {
      const title = await context.newPage();
      const errs = [];
      title.on('pageerror', (e) => errs.push(String(e.message)));
      await title.goto(base + '/index.html?shell=title');
      await title.waitForFunction(() => window.HB && window.HB.state() === 'MENU',
        null, { timeout: 10000 }).catch(() => {});
      await title.keyboard.press('Space');            // leave the title…
      await title.keyboard.press('KeyP');             // …and pause immediately
      await sleep(400);
      const st = await title.evaluate(() => window.HB.state());
      await title.keyboard.press('KeyP');
      await sleep(400);
      const back = await title.evaluate(() => window.HB.state());
      notes.push('title handoff: paused into ' + st + ', resumed into ' + back);
      if (st !== 'PAUSED' || back !== 'PLAYING' || errs.length) bad = 'title handoff: ' + errs.join(';');
      await title.close();
    }

    // 2. a fixture retry (the transform slice resets itself on death): P is
    //    pressed while the reset screen is up, which the state machine
    //    ignores by design — what matters is that it neither throws nor
    //    leaves the run stuck behind an invisible pause
    {
      const fx = await context.newPage();
      const errs = [];
      fx.on('pageerror', (e) => errs.push(String(e.message)));
      await fx.goto(base + '/index.html?slice=transform&testapi=1');
      await sleep(1000);
      await fx.keyboard.down('ArrowRight');
      const until = Date.now() + 45000;
      let caught = false;
      while (Date.now() < until) {
        const s = await fx.evaluate(() => window.HB.state());
        if (s === 'SLICE_RETRY') { await fx.keyboard.press('KeyP'); caught = true; break; }
        await sleep(80);
      }
      await sleep(2000);
      let after = await fx.evaluate(() => window.HB.state());
      if (after === 'PAUSED') { await fx.keyboard.press('KeyP'); await sleep(400); }
      after = await fx.evaluate(() => window.HB.state());
      await fx.keyboard.up('ArrowRight');
      notes.push('fixture retry: ' + (caught
        ? 'P pressed during the reset screen, run came back as ' + after
        : 'no retry happened inside 45 s'));
      if (errs.length || (caught && after !== 'PLAYING'))
        bad = 'fixture retry: ' + (errs.join(';') || 'left the run in ' + after);
      await fx.close();
    }

    // 3. a hundred pause toggles back to back, on a healthy run
    {
      const sp = await context.newPage();
      const errs = [];
      sp.on('pageerror', (e) => errs.push(String(e.message)));
      await sp.goto(base + '/index.html?testapi=1');
      await sleep(1200);
      for (let i = 0; i < 100; i++) await sp.keyboard.press('KeyP');
      await sleep(600);
      const st = await sp.evaluate(() => ({
        state: window.HB.state(), faults: window.HB.failsafe().faults,
        panel: !!document.querySelector('#fail.on'),
      }));
      if (st.state === 'PAUSED') { await sp.keyboard.press('KeyP'); await sleep(300); }
      const back = await sp.evaluate(() => window.HB.state());
      notes.push('100 pause toggles: ended ' + st.state + ' (faults ' + st.faults +
        '), resumed into ' + back);
      if (errs.length || st.panel || st.faults > 0 || back !== 'PLAYING')
        bad = 'pause spam: ' + (errs.join(';') || 'state ' + st.state + '/' + back);
      await sp.close();
    }

    // 4. the corner transition, as deep as a stupid policy gets: the gate
    await page.evaluate(() => {
      window.__hbTurnPause = null;
      const watch = () => {
        const c = window.HB.snapshot().corner;
        if (c && c.state === 'turning' && !window.__hbTurnPause) {
          window.__hbTurnPause = { k: c.k, tMs: c.tMs };
          dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP' }));
          dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyP' }));
        }
        requestAnimationFrame(watch);
      };
      requestAnimationFrame(watch);
    });
    await page.keyboard.down('ArrowRight');
    await page.keyboard.down('KeyJ');
    let phase = null;
    const until = Date.now() + 120000;
    let hop = 0;
    while (Date.now() < until && !phase) {
      const st = await page.evaluate(() => ({
        corner: window.HB.snapshot().corner, state: window.HB.state(),
        turn: window.__hbTurnPause,
      }));
      if (st.turn) phase = 'turning';
      else if (st.corner && st.corner.state === 'gate') phase = 'gate';
      else if (st.state === 'GAME_OVER') { await page.keyboard.press('KeyR'); await sleep(250); }
      else if (++hop % 3 === 0) await page.keyboard.press('Space');   // over the lip
      await sleep(120);
    }
    if (phase === 'gate') await page.keyboard.press('KeyP');
    await sleep(2500);
    const held = await page.evaluate(() => ({
      state: window.HB.state(), corner: window.HB.snapshot().corner,
      gameMs: window.HB.gameMs(),
    }));
    await sleep(2500);
    const stillHeld = await page.evaluate(() => ({
      corner: window.HB.snapshot().corner, gameMs: window.HB.gameMs(),
    }));
    await page.keyboard.press('KeyP');
    await sleep(2000);
    const after = await page.evaluate(() => ({
      state: window.HB.state(), corner: window.HB.snapshot().corner,
      gameMs: window.HB.gameMs(),
    }));
    await page.keyboard.up('ArrowRight');
    await page.keyboard.up('KeyJ');
    const frozen = held.gameMs === stillHeld.gameMs;
    notes.push('corner ' + (phase || 'never reached') + ': paused at corner state "' +
      held.corner.state + '", 5 s of pause advanced the clock by ' +
      (stillHeld.gameMs - held.gameMs).toFixed(1) + ' ms, resumed into ' + after.state +
      ' with the corner at "' + after.corner.state + '"');
    if (phase !== 'gate' && phase !== 'turning')
      notes.push('NOT COVERED: no corner transition was reached inside 90 s');
    if (phase && (held.state !== 'PAUSED' || !frozen))
      bad = 'corner pause: state=' + held.state + ' clockFrozen=' + frozen;
    const s = await snapshot(page);
    if (s.panelVisible || s.game.faults > 0) bad = 'the corner pause raised a fault';
    await page.close();
    return {
      pass: !bad && log.pageErrors.length === 0 && (phase === 'gate' || phase === 'turning'),
      detail: notes.join('; '),
      skip: (phase === 'gate' || phase === 'turning') ? null
        : 'no corner transition reached, so only the title handoff, the fixture retry ' +
          'and the toggle spam were actually exercised',
      log,
    };
  });

scenario('restart-spam', 'sixty restarts as fast as the keyboard allows',
  async ({ context, base }) => {
    const { page, log } = await openPage(context, base + '/index.html?testapi=1');
    await sleep(800);
    const before = await snapshot(page);
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('KeyR');
      if (i % 10 === 0) await sleep(30);
    }
    await sleep(800);
    const s = await snapshot(page);
    await page.close();
    return {
      pass: log.pageErrors.length === 0 && !s.panelVisible &&
        s.game.state === 'PLAYING' && s.game.faults === 0 &&
        Number.isFinite(s.game.x) && Number.isFinite(s.game.y),
      detail: 'attempts ' + before.game.attempts + ' → ' + s.game.attempts +
        ', state=' + s.game.state + ', pos=(' + s.game.x.toFixed(2) + ',' +
        s.game.y.toFixed(2) + ')',
      log,
    };
  });

scenario('key-mash', 'a thousand random key events, modifiers included',
  async ({ context, base }) => {
    const { page, log } = await openPage(context, base + '/index.html?testapi=1');
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyJ',
                  'KeyK', 'KeyX', 'KeyL', 'KeyE', 'KeyW', 'KeyA', 'KeyS', 'KeyD',
                  'Shift', 'KeyH', 'KeyQ', 'Digit1', 'Digit2', 'Digit3', 'Tab',
                  'Enter', 'Backspace'];
    const down = new Set();
    let seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < 1000; i++) {
      const k = keys[Math.floor(rnd() * keys.length)];
      if (down.has(k)) { await page.keyboard.up(k); down.delete(k); }
      else { await page.keyboard.down(k); down.add(k); }
      if (i % 50 === 0) await sleep(20);
    }
    for (const k of down) await page.keyboard.up(k);
    await sleep(800);
    const s = await snapshot(page);
    await page.close();
    return {
      pass: log.pageErrors.length === 0 && !s.panelVisible && s.game.faults === 0 &&
        Number.isFinite(s.game.x) && Number.isFinite(s.game.y) &&
        (s.game.state === 'PLAYING' || s.game.state === 'PAUSED' ||
         s.game.state === 'MENU' || s.game.state === 'GAME_OVER'),
      detail: '1000 events; state=' + s.game.state + ' pos=(' + s.game.x.toFixed(2) + ',' +
        s.game.y.toFixed(2) + ') faults=' + s.game.faults,
      log,
    };
  });

scenario('stray-error', 'four unrelated failures over five seconds do NOT cost the run',
  async ({ context, base }) => {
    const { page, log } = await openPage(context, base + '/index.html?testapi=1');
    await sleep(600);
    for (let i = 0; i < 4; i++) {
      await page.evaluate((n) => {
        setTimeout(() => { throw new Error('injected blip ' + n); }, 0);
      }, i);
      await sleep(1200);
    }
    const s = await snapshot(page);
    await page.close();
    return {
      pass: !s.panelVisible && s.game.state === 'PLAYING' && !s.game.halted &&
        s.failsafe.errors >= 4,
      detail: 'saw ' + s.failsafe.errors + ' uncaught failures, panel=' + s.panelVisible +
        ' state=' + s.game.state + ' recoveries=' + s.game.recoveries,
      log,
      expectedErrors: true,
    };
  });

scenario('error-storm', 'a continuous storm of failures ends in a readable panel',
  async ({ context, base, out }) => {
    const { page, log } = await openPage(context, base + '/index.html?testapi=1');
    await sleep(600);
    await page.evaluate(() => {
      let n = 0;
      const id = setInterval(() => {
        if (++n > 200) { clearInterval(id); return; }
        setTimeout(() => { throw new Error('injected storm ' + n); }, 0);
      }, 16);
    });
    const appeared = await page.waitForSelector('#fail.on', { timeout: 8000 })
      .then(() => true).catch(() => false);
    await sleep(300);
    const s = await snapshot(page);
    if (appeared) await page.screenshot({ path: join(out, 'mid-run-failure.png') });
    await page.close();
    return {
      pass: appeared && s.panelVisible && /Play again/.test(s.panelText) &&
        /stopped/i.test(s.panelText),
      detail: 'panel=' + s.panelVisible + ' text="' + s.panelText.slice(0, 90) + '…"',
      log,
      expectedErrors: true,
    };
  });

scenario('frame-crash', 'a fault inside the frame loop ends in a panel, not a still picture',
  async ({ context, base }) => {
    const { page, log } = await openPage(context, base + '/index.html?testapi=1');
    await sleep(800);
    // a throwing accessor on the live player row: every step touches it, so
    // this is the "update() throws every frame" case, and it also defeats the
    // restart (resetGame writes x), which is what forces the panel
    await page.evaluate(() => {
      Object.defineProperty(window.HB.player, 'x', {
        get() { throw new Error('injected frame fault'); },
        configurable: true,
      });
    });
    const appeared = await page.waitForSelector('#fail.on', { timeout: 8000 })
      .then(() => true).catch(() => false);
    await sleep(300);
    const s = await page.evaluate(() => ({
      panelVisible: !!document.querySelector('#fail.on'),
      panelText: Array.from(document.querySelectorAll('#fail .fail-plain'))
        .map((el) => el.textContent).join(' | '),
      halted: window.HB.failsafe().halted,
      recoveries: window.HB.failsafe().recoveries,
      beatsA: window.__HB_FAILSAFE.beats(),
    }));
    await sleep(700);
    const beatsB = await page.evaluate(() => window.__HB_FAILSAFE.beats());
    await page.close();
    return {
      pass: appeared && s.panelVisible && s.halted && beatsB === s.beatsA &&
        /Play again/.test(s.panelText),
      detail: 'panel=' + s.panelVisible + ' halted=' + s.halted + ' restarts spent=' +
        s.recoveries + ' loop stood down=' + (beatsB === s.beatsA),
      log,
      expectedErrors: true,
    };
  });

scenario('context-lost', 'losing the drawing surface fails legibly',
  async ({ context, base }) => {
    const { page, log } = await openPage(context, base + '/index.html?testapi=1');
    await sleep(800);
    const lost = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      const gl = c && (c.getContext('webgl2') || c.getContext('webgl'));
      const ext = gl && gl.getExtension('WEBGL_lose_context');
      if (!ext) return false;
      ext.loseContext();
      return true;
    });
    if (!lost) {
      await page.close();
      return { pass: false, skip: 'this browser exposes no way to drop the surface', log };
    }
    const appeared = await page.waitForSelector('#fail.on', { timeout: 8000 })
      .then(() => true).catch(() => false);
    const s = await snapshot(page);
    await page.close();
    return {
      pass: appeared && s.panelVisible && /stuck/i.test(s.panelText),
      detail: 'panel=' + s.panelVisible + ' text="' + s.panelText.slice(0, 80) + '…"',
      log,
      expectedErrors: true,
    };
  });

/* ------------------------------- main ------------------------------ */

async function makeBrokenTree() {
  const dir = await mkdtemp(join(tmpdir(), 'hb-broken-'));
  await cp(join(opt.root, 'index.html'), join(dir, 'index.html'));
  await cp(join(opt.root, 'src'), join(dir, 'src'), { recursive: true });
  // exactly the 2026-08-02 incident: one module in the graph will not parse,
  // so main.js never executes and nothing inside src/ can report it
  await appendFile(join(dir, 'src', 'pure', 'path.js'),
    '\n// deliberately broken by tools/durability/abuse.mjs\nthis is not javascript;\n');
  return dir;
}

async function main() {
  const chromium = await loadChromium();
  await mkdir(opt.out, { recursive: true });

  const brokenRoot = await makeBrokenTree();
  const servers = [serve(opt.root, opt.port), serve(brokenRoot, opt.brokenPort)];
  const base = 'http://127.0.0.1:' + opt.port;
  const brokenBase = 'http://127.0.0.1:' + opt.brokenPort;
  const up = (await waitForServer(base + '/index.html')) &&
             (await waitForServer(brokenBase + '/index.html'));
  if (!up) {
    for (const s of servers) s.kill();
    console.error('abuse: dev servers did not come up on ' + opt.port + '/' + opt.brokenPort);
    process.exit(2);
  }

  const browser = await chromium.launch({ channel: 'chrome', headless: !opt.headed });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const results = [];
  const chosen = scenarios.filter((s) => !opt.only || opt.only.includes(s.name));

  for (const s of chosen) {
    const t0 = Date.now();
    let r;
    try {
      r = await s.fn({ context, base, brokenBase, out: opt.out, seconds: opt.backgroundSeconds });
    } catch (e) {
      r = { pass: false, detail: 'threw: ' + (e && e.message), log: { consoleErrors: [], pageErrors: [] } };
    }
    const log = r.log || { consoleErrors: [], pageErrors: [] };
    const unexpected = r.expectedErrors ? [] : log.pageErrors;
    const verdict = r.skip ? 'SKIP' : (r.pass && unexpected.length === 0 ? 'PASS' : 'FAIL');
    results.push({
      name: s.name, what: s.what, verdict, ms: Date.now() - t0,
      detail: r.detail || '', skip: r.skip || null,
      consoleErrors: log.consoleErrors.slice(0, 6),
      pageErrors: log.pageErrors.slice(0, 6),
    });
    console.log(verdict.padEnd(4) + ' ' + s.name.padEnd(17) + ' ' + s.what);
    if (r.detail) console.log('       ' + r.detail);
    if (r.skip) console.log('       SKIPPED: ' + r.skip);
    for (const e of log.pageErrors.slice(0, 3)) console.log('       page failure: ' + e);
    for (const e of log.consoleErrors.slice(0, 3)) console.log('       console: ' + e.slice(0, 160));
  }

  await context.close();
  await browser.close();
  for (const s of servers) s.kill();

  const failed = results.filter((r) => r.verdict === 'FAIL');
  const skipped = results.filter((r) => r.verdict === 'SKIP');
  console.log('\nabuse: ' + (results.length - failed.length - skipped.length) + ' passed, ' +
    failed.length + ' failed, ' + skipped.length + ' skipped');
  if (opt.json) await writeFile(opt.json, JSON.stringify({ opt: { ...opt }, results }, null, 2));
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
