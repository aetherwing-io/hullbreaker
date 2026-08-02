// palette-capture.mjs — dev-only evidence script for the T-010 palette pass.
// Captures the same moment in both palettes (concept default vs
// ?palette=classic) across the run modes the operator judges at FAR view,
// then composes labeled side-by-side pairs. Output goes to
// artifacts/palette-v1/ at the repo root this script is run from (the
// harness's own static server serves that root, so a worktree serves
// itself). Reuses the playtest harness's playwright-core dependency and its
// closed-loop policy engine (lib/policy.mjs); not wired into run.mjs because
// it is a screenshot rig, not a scripted bot.
//
// HONESTY NOTE: pairs are matched by identical input schedules + the seeded
// sim rng, not by frame-locked replay — hostile positions can differ by a
// frame or two of timing jitter between the two runs of a pair. Composition
// and palette are exactly comparable; individual sprite positions are
// approximately comparable. Threat-readability judgments should use the
// whole frame, not pixel deltas.
//
// HONESTY NOTE (polyp scenes): polyp-tell/polyp-beam are STATE-triggered,
// not clock-triggered — each side fires on the emplacement's own iris state,
// so the two sides of a pair can be seconds apart in wall-clock time and
// their RIG/hostile positions differ accordingly. Each polyp frame is also
// pixel-VERIFIED before it is kept (measure() + captureIrisCycle below): if
// the captured frame does not actually carry the warm tell or the live beam,
// the rig retries the next iris cycle and finally throws rather than writing
// a frame that does not show what its name claims.
//
// That last sentence is now literally true of the disk, which it was not
// before (I-015): `shot()` captures to MEMORY, and a scene's frames are
// written to artifacts/palette-v1/ only after both of its palette runs have
// returned. A retried frame therefore never overwrites the committed one on
// its way to being superseded, and a scene that never verifies leaves the
// previous evidence exactly where it was.
//
//   node palette-capture.mjs                  — all scenes, both palettes, + pairs
//   node palette-capture.mjs transform-boot   — just the named scene/output tag(s)
//     (used to refresh one pair after a merge reworks only that slice)

import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './lib/server.mjs';
import { compilePolicy, evaluatePolicyTick } from './lib/policy.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const OUT = resolve(repoRoot, 'artifacts', 'palette-v1');
mkdirSync(OUT, { recursive: true });

const PALETTES = [
  { id: 'concept', qs: '' },                    // the shipped default: no flag
  { id: 'classic', qs: '&palette=classic' },    // grey-box baseline
];

// One fixed input schedule per scene (hold right + fire, jump cadence), so
// both palette runs of a pair see the same seeded world at the same age.
async function driveSchedule(page, seq, untilMs, shotAt, shot) {
  const t0 = Date.now();
  let i = 0;
  let shotTaken = false;
  while (Date.now() - t0 < untilMs) {
    const now = Date.now() - t0;
    while (i < seq.length && seq[i][2] <= now) {
      const [type, code] = seq[i];
      try { await page.keyboard[type === 'keydown' ? 'down' : 'up'](code); } catch {}
      i++;
    }
    if (!shotTaken && now >= shotAt) {
      await shot();
      shotTaken = true;
      break;
    }
    await page.waitForTimeout(25);
  }
  if (!shotTaken) await shot();
}

function jumpCadence(from, to, holdMs = 180, everyMs = 800) {
  const seq = [['keydown', 'ArrowRight', 0], ['keydown', 'KeyJ', 80]];
  for (let t = from; t < to; t += everyMs) {
    seq.push(['keydown', 'Space', t], ['keyup', 'Space', t + holdMs]);
  }
  return seq;
}

// Traversal action moment: poll for airborne-near-a-hostile (the threat-
// readability frame), same approach as viewscale-capture.mjs.
async function driveTraversal(page, shot) {
  const seq = jumpCadence(300, 6500);
  const t0 = Date.now();
  let i = 0;
  while (Date.now() - t0 < 7000) {
    const now = Date.now() - t0;
    while (i < seq.length && seq[i][2] <= now) {
      const [type, code] = seq[i];
      try { await page.keyboard[type === 'keydown' ? 'down' : 'up'](code); } catch {}
      i++;
    }
    const st = await page.evaluate(() => {
      const hb = window.HB;
      if (!hb) return null;
      const p = hb.player;
      const hs = (hb.hostiles || []).filter((h) => h.hp > 0);
      return { air: !p.grounded && hs.some((h) => Math.abs(h.x - p.x) < 7 && Math.abs(h.y - p.y) < 6) };
    });
    if (st && st.air && now > 1200) {
      await shot();
      return true;
    }
    await page.waitForTimeout(30);
  }
  await shot();   // fallback: late frame, still evidence
  return false;
}

/* ------------------------- IRIS POLYP SCENES ------------------------ *
 * The enemy-color evidence, and the one scene a timed screenshot cannot
 * produce: src/sim/hostiles.js `updatePolyp` only leaves `closed` while the
 * beam predicate holds on the PLAYER, so a capture that drives no input
 * photographs a dormant bulb forever (the defect the T-010 second gate
 * caught). Two things fix that here:
 *
 *   1. the approach is the JUDGED closed-loop policy from
 *      scripts/polyp-lane-dodge.json, replayed verbatim through the
 *      harness's own lib/policy.mjs — the rig invents no movement, it
 *      replays the acceptance bot that is already measured 8/8 into the
 *      locked lane;
 *   2. both screenshots are keyed to the emplacement's own iris state and
 *      then pixel-verified.
 *
 * A single polyp can never wear the tell and the beam at once — polypPose
 * (src/render/hostiles.js) sets exactly one emissive per state and the beam
 * mesh is visible only in `fire` — so this is two frames of ONE cycle,
 * ~0.8 s apart, not one frame:
 *
 *   polyp-tell — the warm-amber blink on the dilating acid bulb, captured
 *                inside a blink ON phase (the phase is computed from the
 *                same gameMs/tellBlink* math the renderer blinks with).
 *   polyp-beam — the committed hot-acid beam holding the lane, captured
 *                during `fire` with RIG already dropped below the band
 *                (lane-dodge's answer), so the beam is unobstructed.        */

const APPROACH_SCRIPT = resolve(here, 'scripts', 'polyp-lane-dodge.json');
const POLYP_POLL_MS = 30;
const POLYP_RUN_MS = 30000;          // hard ceiling for approach + capture retries
const POLYP_MAX_CYCLES = 4;          // iris cycles we are willing to spend on a verified pair
const BLINK_MIN_LEFT_MS = 55;        // ms of ON phase that must remain when we fire the shutter

// One page read per policy tick: the flat fields lib/policy.mjs's grammar
// expects (x/y/vx/vy/grounded/gameMs) plus the hostile rows its polyp
// predicates read. window.HB is a read-only debug handle; nothing here
// mutates sim state.
const POLYP_PROBE = () => {
  const hb = window.HB;
  if (!hb) return null;
  const p = hb.player;
  return {
    gameMs: hb.gameMs(), state: hb.state(),
    x: p.x, y: p.y, vx: p.vx, vy: p.vy, grounded: p.grounded, hp: p.hp,
    hostiles: (hb.hostiles || []).map((h) => ({ kind: h.kind, state: h.state, x: h.x, y: h.y, hp: h.hp })),
  };
};

// Resolve at the first animation frame where the polyp is telling, the warm
// blink is in the requested phase, and at least `minLeftMs` of that phase is
// left — so the screenshot that follows lands inside it rather than on the
// dark half of the blink. Mirrors polypPose's period math exactly.
const WAIT_BLINK_PHASE = ({ want, minLeftMs, timeoutMs }) => new Promise((res) => {
  const hb = window.HB;
  const started = performance.now();
  function step() {
    const PP = hb.CONFIG.polyp;
    const gm = hb.gameMs();
    const e = (hb.hostiles || []).find((h) => h.kind === 'polyp' && h.state === 'tell');
    if (e) {
      const u = 1 - Math.max(0, Math.min(1, (e.stateUntil - gm) / PP.tellMs));
      const period = PP.tellBlinkSlowMs + (PP.tellBlinkFastMs - PP.tellBlinkSlowMs) * u;
      const on = Math.floor(gm / period) % 2 === 0;
      const leftMs = period - (gm % period);
      if (on === want && leftMs >= minLeftMs) { res(true); return; }
    }
    if (performance.now() - started > timeoutMs) { res(false); return; }
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
});

const WAIT_POLYP_STATE = ({ want, timeoutMs }) => new Promise((res) => {
  const hb = window.HB;
  const started = performance.now();
  function step() {
    if ((hb.hostiles || []).some((h) => h.kind === 'polyp' && h.state === want)) { res(true); return; }
    if (performance.now() - started > timeoutMs) { res(false); return; }
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
});

// RIG blinks through its i-frames (src/render/player.js: visible while
// `gameMs >= iframesUntil || blink()`, the 90 ms duty in src/sim/time.js), so
// a shutter fired blind during the volley can photograph a frame with no RIG
// in it at all. Wait for the rendered half of that duty — mirrored, not
// guessed — with enough of it left for the screenshot to land inside.
const WAIT_RIG_DRAWN = ({ minLeftMs, timeoutMs }) => new Promise((res) => {
  const hb = window.HB;
  const started = performance.now();
  const PERIOD = 90;
  function step() {
    const gm = hb.gameMs();
    const hurt = gm < hb.player.iframesUntil;
    const on = Math.floor(gm / PERIOD) % 2 === 0;
    const leftMs = PERIOD - (gm % PERIOD);
    if (!hurt || (on && leftMs >= minLeftMs)) { res(true); return; }
    if (performance.now() - started > timeoutMs) { res(false); return; }
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
});

// Pixel verification runs in the same Chrome that took the shots: decode the
// two PNG buffers into one canvas and count. Kept deliberately dumb — a
// scalar count against a stated threshold, printed on every run, so the
// evidence claim is measured rather than asserted. Two measurements:
//
//   'tell-blink' — the tell is a BLINK, so the honest proof is differential:
//                  pixels that went distinctly warmer AND brighter between
//                  the ON frame we keep and an OFF frame taken a fraction of
//                  a second later in the same tell. Only the iris emissive
//                  does that; RIG, the deck and the fog are the same in both.
//   'hot-acid'   — the beam is a held bar of the hottest acid in the palette:
//                  count very bright acid pixels in the beam frame and
//                  subtract the same count from the tell frame of the SAME
//                  cycle (same camera, no beam), so acid bodies and HUD text
//                  cannot pay for it.
async function measure(browser, kind, buffers) {
  const page = await browser.newPage({ viewport: { width: 8, height: 8 } });
  try {
    return await page.evaluate(
      async ([srcs, mode]) => {
        const load = (src) => new Promise((ok, no) => {
          const im = new Image();
          im.onload = () => ok(im);
          im.onerror = () => no(new Error('decode failed'));
          im.src = src;
        });
        const imgs = await Promise.all(srcs.map(load));
        const c = document.createElement('canvas');
        c.width = imgs[0].width; c.height = imgs[0].height;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        const planes = imgs.map((im) => {
          ctx.clearRect(0, 0, c.width, c.height);
          ctx.drawImage(im, 0, 0);
          return ctx.getImageData(0, 0, c.width, c.height).data;
        });
        const [a, b] = planes;
        if (mode === 'tell-blink') {
          let warmer = 0;
          for (let i = 0; i < a.length; i += 4) {
            if (a[i] - b[i] >= 35 && a[i + 1] - b[i + 1] >= 20 && a[i + 2] - b[i + 2] >= 25) warmer++;
          }
          return { count: warmer };
        }
        // thresholds sit under the raw token values on purpose: the beam is
        // drawn at 0.65-0.9 opacity THROUGH the scene fog, which lands the
        // shipped bar at ~(184,198,128) rather than its 0xd4ff5c authoring
        // value. Green-dominant and clearly warmer than the teal air is the
        // discriminator; the frame-to-frame delta does the rest.
        const acid = (p) => {
          let n = 0;
          for (let i = 0; i < p.length; i += 4) {
            const r = p[i], g = p[i + 1], bl = p[i + 2];
            if (g >= 150 && g - bl >= 45 && g >= r) n++;
          }
          return n;
        };
        const inFrame = acid(a), inRef = acid(b);
        return { count: inFrame - inRef, inFrame, inRef };
      },
      [buffers.map((buf) => 'data:image/png;base64,' + buf.toString('base64')), kind],
    );
  } finally {
    await page.close();
  }
}

// Floors, not targets: a shipped tell blink measures in the hundreds of
// pixels and a shipped beam bar in the thousands at 1280x800 FAR. These are
// set well under that so a legitimate frame is never rejected, and far over
// the handful of pixels sampling noise can move.
const TELL_MIN_WARMER_PX = 60;
const BEAM_MIN_DELTA_PX = 400;

async function policyTick(page, rules, sample, held, policyHeld) {
  const { desiredHolds, tapsToFire } = evaluatePolicyTick(rules, sample, held);
  for (const code of desiredHolds) {
    if (!policyHeld.has(code)) {
      try { await page.keyboard.down(code); } catch {}
      policyHeld.add(code); held.add(code);
    }
  }
  for (const code of [...policyHeld]) {
    if (!desiredHolds.has(code)) {
      try { await page.keyboard.up(code); } catch {}
      policyHeld.delete(code); held.delete(code);
    }
  }
  for (const t of tapsToFire) {
    try { await page.keyboard.down(t.code); } catch {}
    held.add(t.code);
    setTimeout(() => {
      page.keyboard.up(t.code).then(() => held.delete(t.code)).catch(() => {});
    }, t.holdMs);
  }
}

// One iris cycle's worth of capture, starting from a live `tell`. Returns
// null when the frames it took do not carry what they claim (caller retries
// on the next cycle), or the measurements when they do.
async function captureIrisCycle(page, shot, browser, tag) {
  const onPhase = await page.evaluate(WAIT_BLINK_PHASE,
    { want: true, minLeftMs: BLINK_MIN_LEFT_MS, timeoutMs: 900 });
  if (!onPhase) return null;
  const tellBuf = await shot('polyp-tell');
  const atTell = await page.evaluate(POLYP_PROBE);
  // the dark half of the same blink: the differential reference, never kept
  const offPhase = await page.evaluate(WAIT_BLINK_PHASE,
    { want: false, minLeftMs: 25, timeoutMs: 900 });
  if (!offPhase) return null;
  const offBuf = await page.screenshot();
  const tell = await measure(browser, 'tell-blink', [tellBuf, offBuf]);
  if (tell.count < TELL_MIN_WARMER_PX) {
    console.log(`  ${tag}: tell frame carried ${tell.count}px of warm blink ` +
      `(need ${TELL_MIN_WARMER_PX}) — retrying next iris cycle`);
    return null;
  }
  const fired = await page.evaluate(WAIT_POLYP_STATE, { want: 'fire', timeoutMs: 1600 });
  if (!fired) return null;
  await page.waitForTimeout(60);            // let the beam mesh span its first marched reach
  await page.evaluate(WAIT_RIG_DRAWN, { minLeftMs: 45, timeoutMs: 200 });
  const beamBuf = await shot('polyp-beam');
  const atBeam = await page.evaluate(POLYP_PROBE);
  const beam = await measure(browser, 'hot-acid', [beamBuf, tellBuf]);
  if (beam.count < BEAM_MIN_DELTA_PX) {
    console.log(`  ${tag}: beam frame carried ${beam.count}px of new hot acid ` +
      `(need ${BEAM_MIN_DELTA_PX}) — retrying next iris cycle`);
    return null;
  }
  return { warmerPx: tell.count, beamPx: beam.count, atTell, atBeam };
}

async function driveIrisCycle(page, shot, browser, palId) {
  const script = JSON.parse(readFileSync(APPROACH_SCRIPT, 'utf8'));
  const rules = compilePolicy(script.policy);
  const held = new Set();
  const policyHeld = new Set();
  const t0 = Date.now();
  let cycles = 0;
  while (Date.now() - t0 < POLYP_RUN_MS) {
    const sample = await page.evaluate(POLYP_PROBE);
    if (sample) {
      await policyTick(page, rules, sample, held, policyHeld);
      const telling = sample.hostiles.some((h) => h.kind === 'polyp' && h.state === 'tell');
      if (telling && cycles < POLYP_MAX_CYCLES) {
        cycles++;
        const got = await captureIrisCycle(page, shot, browser, `polyp [${palId}]`);
        if (got) {
          // What the SIM believed at each shutter, printed next to what the
          // PIXELS carry: the two together are the evidence claim.
          const where = (s) => `RIG x${s.x.toFixed(1)} y${s.y.toFixed(1)} hp${s.hp}` +
            (s.grounded ? ' grounded' : ' airborne');
          console.log(`  polyp [${palId}]: verified cycle ${cycles} — ` +
            `tell ${got.warmerPx}px warm blink (${where(got.atTell)}), ` +
            `beam ${got.beamPx}px hot acid (${where(got.atBeam)})`);
          return true;
        }
      }
    }
    await page.waitForTimeout(POLYP_POLL_MS);
  }
  // Never write unverified evidence: the whole point of this scene is that
  // the frames carry the states they are named for.
  throw new Error(`polyp scene [${palId}]: no verified tell+beam cycle in ` +
    `${POLYP_RUN_MS}ms (${cycles} iris cycles attempted) — nothing committed`);
}

const SCENES = [
  { tag: 'sixface-boot', url: '/index.html?view=far',
    run: (page, shot) => page.waitForTimeout(1400).then(() => shot()) },
  { tag: 'sixface-action', url: '/index.html?view=far',
    run: (page, shot) => driveSchedule(page, jumpCadence(300, 5200), 5600, 4600, shot) },
  { tag: 'traversal-action', url: '/index.html?slice=traversal&view=far&testapi=1&enemies=1',
    run: (page, shot) => driveTraversal(page, shot) },
  // T-010 third gate: the enemy-role frames. See the IRIS POLYP SCENES block
  // above — closed-loop approach, state-keyed shutter, pixel-verified frames,
  // and two outputs because one polyp cannot wear both states at once.
  { tag: 'polyp-cycle', outputs: ['polyp-tell', 'polyp-beam'],
    url: '/index.html?slice=traversal&view=far&polyp=1&testapi=1',
    run: (page, shot, ctx) => driveIrisCycle(page, shot, ctx.browser, ctx.palette) },
  { tag: 'g1-limb', url: '/index.html?g1=1&view=far',
    run: (page, shot) => driveSchedule(page, jumpCadence(300, 3600), 4200, 3400, shot) },
  { tag: 'transform-boot', url: '/index.html?slice=transform&view=far&enemies=0',
    run: (page, shot) => page.waitForTimeout(1000).then(() => shot()) },
];

const outputsOf = (scene) => scene.outputs || [scene.tag];

async function composePair(browser, tag) {
  const files = PALETTES.map((p) => resolve(OUT, `${tag}--${p.id}.png`));
  const datas = files.map((f) => 'data:image/png;base64,' + readFileSync(f).toString('base64'));
  const page = await browser.newPage({ viewport: { width: 2600, height: 850 } });
  await page.setContent(`
    <body style="margin:0;background:#000;font:700 22px ui-monospace,monospace;color:#fff">
      <div style="display:flex;gap:8px">
        ${PALETTES.map((p, i) => `
          <figure style="margin:0">
            <figcaption style="padding:6px 10px">${tag} — ${p.id}${p.id === 'concept' ? ' (default)' : ' (?palette=classic)'}</figcaption>
            <img src="${datas[i]}" style="width:1288px;display:block">
          </figure>`).join('')}
      </div>
    </body>`);
  await page.waitForTimeout(250);
  await page.screenshot({ path: resolve(OUT, `${tag}--pair.png`), fullPage: true });
  await page.close();
}

const only = process.argv.slice(2);
const picked = only.length
  ? SCENES.filter((s) => only.includes(s.tag) || outputsOf(s).some((t) => only.includes(t)))
  : SCENES;
if (!picked.length) {
  const tags = SCENES.map((s) => [s.tag, ...outputsOf(s)]).flat();
  console.error(`no scene matches [${only.join(', ')}]; tags: ${[...new Set(tags)].join(', ')}`);
  process.exit(1);
}

const server = await startStaticServer(repoRoot, { port: 0 });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const scene of picked) {
    // Final artifact path -> the PNG bytes that will land there, both palettes
    // of this scene. Nothing is written until the loop below finishes, so an
    // unverified frame cannot be on disk even briefly (I-015).
    const pending = new Map();
    for (const pal of PALETTES) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      await page.goto(`${server.baseUrl}${scene.url}${pal.qs}`, { waitUntil: 'load' });
      await page.waitForTimeout(300);
      // shot(tag) captures <tag>--<palette>.png into `pending` and hands the
      // buffer back, so a scene can verify what it just captured before moving
      // on — and a retry simply replaces the buffer.
      const shot = async (tag = scene.tag) => {
        const buf = await page.screenshot();
        pending.set(resolve(OUT, `${tag}--${pal.id}.png`), buf);
        return buf;
      };
      await scene.run(page, shot, { browser, palette: pal.id });
      console.log(`captured ${scene.tag} [${pal.id}]`);
      await context.close();
    }
    // Both palettes ran to completion (a scene that could not verify threw and
    // never reached here), so every buffer below is a frame its scene kept.
    for (const [file, buf] of pending) writeFileSync(file, buf);
    for (const tag of outputsOf(scene)) {
      await composePair(browser, tag);
      console.log(`  pair -> ${tag}--pair.png`);
    }
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(`done: ${OUT}`);
