// legibility-capture.mjs — dev-only evidence script for the T-003 FAR-view
// readability pass (docs/decisions.md entry 7's accepted follow-up, plus
// inbox item I-003). It captures the same judged moment twice — once with
// the pass ON (the shipped default) and once with ?legibility=0 (the
// pre-pass look) — and, for the scenes the acceptance names, once per view
// (near / mid / far), then composes labeled panels:
//
//   <scene>--far-before-after.png   before | after, both at the FAR default
//   <scene>--views-after.png        near | mid | far, pass on
//   <scene>--far-detail.png         the same pair, 2.4x center crop, so a
//                                   letter or a lamp can be judged at all
//
// Output goes to artifacts/legibility-v1/ at the repo root the script runs
// from (the harness's static server serves that root, so a worktree serves
// itself). Reuses tools/playtest's playwright-core and its closed-loop
// policy engine (lib/policy.mjs); not wired into run.mjs because it is a
// screenshot rig keyed to sim STATE, not a scripted bot.
//
//   node legibility-capture.mjs                — every scene
//   node legibility-capture.mjs hound-tell     — just the named scene(s)
//
// HONESTY NOTES, in the same spirit as palette-capture.mjs:
//   * The two sides of a pair are two separate runs. They share an input
//     policy and the seeded sim rng, but they are keyed to the emplacement's
//     or the drone's own STATE, so RIG and hostile positions differ between
//     sides. Judge the tell, the glyph and the lamp — not pixel deltas.
//   * A shutter cannot be frame-locked from outside the page. Every frame
//     is therefore VERIFIED after the fact: the rig reads the sim back
//     immediately after the screenshot and keeps the frame only if the
//     state it is named for was still live, retrying the next cycle
//     otherwise. Frames it could not verify are written with a -FALLBACK
//     suffix and logged, never silently passed off as the real moment.
//   * The polyp onset scene is the tightest of these — it is aimed at the
//     first 150ms of an 800ms tell (I-003's dead window) — so its log line
//     prints the measured ms-into-tell of the frame it kept. Read that
//     number before trusting the frame.
//   * The center crop is a fixed rectangle, not a tracked subject. The
//     camera keeps RIG near frame center, and every scene fires its shutter
//     with the subject close to RIG, but a crop can still clip a subject
//     that drifted. The full frame above it is the authority.

import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './lib/server.mjs';
import { compilePolicy, evaluatePolicyTick } from './lib/policy.mjs';
import { compileScript, resolveCode, scriptEndMs } from './lib/compile.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const OUT = resolve(repoRoot, 'artifacts', 'legibility-v1');
mkdirSync(OUT, { recursive: true });

const VIEWPORT = { width: 1280, height: 800 };
const MODES = [
  { id: 'before', qs: '&legibility=0' },   // the pre-pass look, for the A/B
  { id: 'after', qs: '' },                 // the shipped default
];

/* ------------------------------ page probes ------------------------------ */

const PROBE = () => {
  const hb = window.HB;
  if (!hb) return null;
  const p = hb.player;
  return {
    gameMs: hb.gameMs(), state: hb.state(),
    x: p.x, y: p.y, vx: p.vx, vy: p.vy, grounded: p.grounded, hp: p.hp,
    hostiles: (hb.hostiles || []).map((h) => ({
      kind: h.kind, state: h.state, x: h.x, y: h.y, hp: h.hp,
      leftMs: h.stateUntil - hb.gameMs(),
    })),
    capsules: (hb.capsules || []).map((c) => ({ letter: c.letter, kind: c.kind, x: c.x, y: c.y })),
  };
};

// The polyp/hound tells blink; a shutter fired blind can land on the dark
// half. Mirrors the renderer's own period math (src/render/hostiles.js).
const WAIT_BLINK_ON = ({ kind, minLeftMs, timeoutMs }) => new Promise((res) => {
  const hb = window.HB;
  const started = performance.now();
  const C = kind === 'polyp' ? hb.CONFIG.polyp : hb.CONFIG.hound;
  function step() {
    const gm = hb.gameMs();
    const e = (hb.hostiles || []).find((h) => h.kind === kind && h.state === 'tell');
    if (e) {
      const u = 1 - Math.max(0, Math.min(1, (e.stateUntil - gm) / C.tellMs));
      const period = C.tellBlinkSlowMs + (C.tellBlinkFastMs - C.tellBlinkSlowMs) * u;
      const on = Math.floor(gm / period) % 2 === 0;
      if (on && period - (gm % period) >= minLeftMs) { res(true); return; }
    }
    if (performance.now() - started > timeoutMs) { res(false); return; }
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
});

/* ------------------------------ input driver ----------------------------- */

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

/* Replay a NAMED, already-judged playtest script — whichever form it takes.
   Two forms ship in tools/playtest/scripts: a closed-loop `policy` (the
   polyp approach) and a scripted `moves` timeline (everything else). Both
   are replayed verbatim; this rig invents no movement of its own. When a
   moves timeline runs out before the moment we are waiting for, a plain
   run-fire-jump tail keeps RIG moving rather than leaving it parked — the
   tail is stated here because it is the one input this file authors. */
const TAIL = { right: resolveCode('right'), fire: resolveCode('fire'), jump: resolveCode('jump') };

async function tailCadence(page, now, s) {
  if (!s.on) {
    await page.keyboard.down(TAIL.right).catch(() => {});
    await page.keyboard.down(TAIL.fire).catch(() => {});
    s.on = true; s.next = now;
  }
  if (now >= s.next) {
    await page.keyboard.down(TAIL.jump).catch(() => {});
    setTimeout(() => page.keyboard.up(TAIL.jump).catch(() => {}), 200);
    s.next = now + 800;
  }
}

// Run the script while `want(sample)` decides when to fire the shutter;
// `verify(sampleAfter)` decides whether to keep the frame. Returns the
// accepted sample, or null if the budget ran out.
async function driveUntil(page, scriptName, { want, prepare, verify, budgetMs, tag }) {
  const script = JSON.parse(readFileSync(resolve(here, 'scripts', scriptName), 'utf8'));
  const rules = script.policy ? compilePolicy(script.policy) : null;
  const events = rules ? [] : compileScript(script);
  const endMs = rules ? Infinity : scriptEndMs(events, script);
  const held = new Set();
  const policyHeld = new Set();
  const tail = { on: false, next: 0 };
  const t0 = Date.now();
  let attempts = 0;
  let ei = 0;
  while (Date.now() - t0 < budgetMs) {
    const now = Date.now() - t0;
    const sample = await page.evaluate(PROBE);
    if (sample) {
      if (rules) {
        await policyTick(page, rules, sample, held, policyHeld);
      } else {
        while (ei < events.length && events[ei].t <= now) {
          const ev = events[ei++];
          await page.keyboard[ev.type === 'keydown' ? 'down' : 'up'](ev.code).catch(() => {});
        }
        if (now > endMs) await tailCadence(page, now, tail);
      }
      if (want(sample)) {
        attempts++;
        if (prepare) await prepare(page);
        await page.screenshot({ path: resolve(OUT, `${tag}.png`) });
        const after = await page.evaluate(PROBE);
        if (!verify || verify(after)) return { sample, after, attempts };
        if (attempts >= 6) break;
      }
    }
    await page.waitForTimeout(15);
  }
  return null;
}

/* --------------------------------- scenes -------------------------------- */

const rig = (s) => `RIG x${s.x.toFixed(1)} y${s.y.toFixed(1)}` + (s.grounded ? ' grounded' : ' airborne');

// 1. CAPSULE GLYPH — the dare pocket's authored 'H' reward capsule
//    (src/pure/traversal.js darePocket.reward), the one lettered pickup that
//    exists from the first frame of the run instead of dropping from a kill.
const capsuleScene = {
  tag: 'capsule-glyph',
  url: '/index.html?slice=traversal&view=$VIEW&testapi=1$MODE',
  views: ['near', 'mid', 'far'],
  run: (page, tag) => driveUntil(page, 'dare-pocket.json', {
    tag,
    budgetMs: 26000,
    want: (s) => s.capsules.some((c) => Math.abs(c.x - s.x) < 7 && Math.abs(c.y - s.y) < 5),
    verify: (s) => s.capsules.some((c) => Math.abs(c.x - s.x) < 9),
  }),
  describe: (r) => `${rig(r.sample)}, capsule '${r.sample.capsules[0].letter}'`,
};

// 2. HOUNDFRAME TELL — the wind-up, caught in the back half of the reaction
//    window with the warning light in an ON phase.
const houndScene = {
  tag: 'hound-tell',
  url: '/index.html?slice=traversal&hound=1&view=$VIEW&testapi=1$MODE',
  views: ['near', 'mid', 'far'],
  run: (page, tag) => driveUntil(page, 'hound-facetank-solo.json', {
    tag,
    budgetMs: 30000,
    want: (s) => s.hostiles.some((h) => h.kind === 'hound' && h.state === 'tell' && h.leftMs > 60),
    prepare: (p) => p.evaluate(WAIT_BLINK_ON, { kind: 'hound', minLeftMs: 45, timeoutMs: 400 }),
    verify: (s) => s.hostiles.some((h) => h.kind === 'hound' && h.state === 'tell'),
  }),
  describe: (r) => {
    const h = r.after.hostiles.find((x) => x.kind === 'hound' && x.state === 'tell');
    return `${rig(r.sample)}, hound tell ${h ? Math.round(520 - h.leftMs) : '?'}ms in`;
  },
};

// 3. IRIS POLYP, FIRST BEAT — I-003's window: the opening ~150ms of the
//    800ms tell, which used to be a small dark notch in the bulb.
const polypOnsetScene = {
  tag: 'polyp-onset',
  url: '/index.html?slice=traversal&polyp=1&view=$VIEW&testapi=1$MODE',
  views: ['far'],
  run: (page, tag) => driveUntil(page, 'polyp-lane-dodge.json', {
    tag,
    budgetMs: 40000,
    want: (s) => s.hostiles.some((h) => h.kind === 'polyp' && h.state === 'tell' && h.leftMs > 780),
    // keep it only if the shutter still landed inside the first quarter of
    // the reaction window — the beat I-003 says carries no signal today
    verify: (s) => s.hostiles.some((h) => h.kind === 'polyp' && h.state === 'tell' && h.leftMs > 590),
  }),
  describe: (r) => {
    const p = r.after.hostiles.find((x) => x.kind === 'polyp' && x.state === 'tell');
    return `${rig(r.sample)}, iris tell ${p ? Math.round(800 - p.leftMs) : '?'}ms in (of 800)`;
  },
};

// 4. IRIS POLYP, LATE TELL — the pale open iris that already reads well, kept
//    as the control for scene 3.
const polypLateScene = {
  tag: 'polyp-late-tell',
  url: '/index.html?slice=traversal&polyp=1&view=$VIEW&testapi=1$MODE',
  views: ['far'],
  run: (page, tag) => driveUntil(page, 'polyp-lane-dodge.json', {
    tag,
    budgetMs: 40000,
    want: (s) => s.hostiles.some((h) => h.kind === 'polyp' && h.state === 'tell' &&
      h.leftMs > 90 && h.leftMs < 300),
    prepare: (p) => p.evaluate(WAIT_BLINK_ON, { kind: 'polyp', minLeftMs: 40, timeoutMs: 300 }),
    verify: (s) => s.hostiles.some((h) => h.kind === 'polyp' && h.state === 'tell'),
  }),
  describe: (r) => {
    const p = r.after.hostiles.find((x) => x.kind === 'polyp' && x.state === 'tell');
    return `${rig(r.sample)}, iris tell ${p ? Math.round(800 - p.leftMs) : '?'}ms in (of 800)`;
  },
};

// 5. WASP DIVE — the commitment read: the drone that is coming for you
//    versus the one that is cruising past.
const waspScene = {
  tag: 'wasp-dive',
  url: '/index.html?slice=traversal&view=$VIEW&testapi=1$MODE',
  views: ['far'],
  run: (page, tag) => driveUntil(page, 'mid-route.json', {
    tag,
    budgetMs: 34000,
    want: (s) => s.hostiles.some((h) => h.kind === 'wasp' && h.state === 'dive'),
    verify: (s) => s.hostiles.some((h) => h.kind === 'wasp' && h.state === 'dive'),
  }),
  describe: (r) => `${rig(r.sample)}, ` +
    `${r.after.hostiles.filter((h) => h.kind === 'wasp' && h.state === 'dive').length} wasp(s) diving`,
};

const SCENES = [capsuleScene, houndScene, polypOnsetScene, polypLateScene, waspScene];

/* ------------------------------ composition ------------------------------ */

const dataUrl = (file) => 'data:image/png;base64,' + readFileSync(resolve(OUT, file)).toString('base64');

async function compose(browser, outName, panels, { crop = 0 } = {}) {
  const w = crop ? 900 : 1288;
  const page = await browser.newPage({
    viewport: { width: panels.length * (w + 10) + 20, height: crop ? 640 : 880 },
  });
  const cell = (p) => crop
    // a fixed center crop, magnified: the letter/lamp judgment panel
    ? `<figure style="margin:0">
         <figcaption style="padding:6px 10px">${p.label}</figcaption>
         <div style="width:${w}px;height:540px;overflow:hidden;position:relative">
           <img src="${p.src}" style="position:absolute;left:50%;top:50%;
                transform:translate(-50%,-50%) scale(2.4);image-rendering:pixelated">
         </div>
       </figure>`
    : `<figure style="margin:0">
         <figcaption style="padding:6px 10px">${p.label}</figcaption>
         <img src="${p.src}" style="width:${w}px;display:block">
       </figure>`;
  await page.setContent(`
    <body style="margin:0;background:#000;font:700 20px ui-monospace,monospace;color:#fff">
      <div style="display:flex;gap:10px">${panels.map(cell).join('')}</div>
    </body>`);
  await page.waitForTimeout(250);
  await page.screenshot({ path: resolve(OUT, outName), fullPage: true });
  await page.close();
}

/* --------------------------------- driver -------------------------------- */

const only = process.argv.slice(2);
const picked = only.length ? SCENES.filter((s) => only.includes(s.tag)) : SCENES;
if (!picked.length) {
  console.error(`no scene matches [${only.join(', ')}]; tags: ${SCENES.map((s) => s.tag).join(', ')}`);
  process.exit(1);
}

const server = await startStaticServer(repoRoot, { port: 0 });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const missed = [];
try {
  for (const scene of picked) {
    for (const view of scene.views) {
      for (const mode of MODES) {
        const tag = `${scene.tag}--${view}-${mode.id}`;
        const url = server.baseUrl + scene.url.replace('$VIEW', view).replace('$MODE', mode.qs);
        const context = await browser.newContext({ viewport: VIEWPORT });
        const page = await context.newPage();
        await page.goto(url, { waitUntil: 'load' });
        await page.waitForTimeout(400);
        const got = await scene.run(page, tag);
        if (got) {
          console.log(`captured ${tag} — ${scene.describe(got)} ` +
            `(${got.attempts} shutter${got.attempts > 1 ? 's' : ''})`);
        } else {
          // never pass an unverified frame off as the moment it is named for
          await page.screenshot({ path: resolve(OUT, `${tag}-FALLBACK.png`) });
          missed.push(tag);
          console.log(`MISSED  ${tag} — no verified moment in budget; wrote -FALLBACK`);
        }
        await context.close();
      }
    }
    const has = (v, m) => !missed.includes(`${scene.tag}--${v}-${m}`);
    if (has('far', 'before') && has('far', 'after')) {
      const panels = MODES.map((m) => ({
        label: `${scene.tag} — far, ${m.id === 'before' ? '?legibility=0 (before)' : 'shipped default (after)'}`,
        src: dataUrl(`${scene.tag}--far-${m.id}.png`),
      }));
      await compose(browser, `${scene.tag}--far-before-after.png`, panels);
      await compose(browser, `${scene.tag}--far-detail.png`, panels, { crop: 2.4 });
      console.log(`  pair -> ${scene.tag}--far-before-after.png, ${scene.tag}--far-detail.png`);
    }
    if (scene.views.length > 1 && scene.views.every((v) => has(v, 'after'))) {
      await compose(browser, `${scene.tag}--views-after.png`, scene.views.map((v) => ({
        label: `${scene.tag} — ?view=${v}${v === 'far' ? ' (default)' : ''}, pass on`,
        src: dataUrl(`${scene.tag}--${v}-after.png`),
      })));
      console.log(`  views -> ${scene.tag}--views-after.png`);
    }
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(missed.length ? `done with ${missed.length} MISSED: ${missed.join(', ')}` : 'done');
console.log(OUT);
