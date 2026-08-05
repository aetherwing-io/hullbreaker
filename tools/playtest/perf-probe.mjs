#!/usr/bin/env node
// Re-derivable renderer/performance evidence for HULLBREAKER.
// This owns an isolated headless Chrome and ephemeral server; it never touches
// the operator's Chrome profile or the live preview tab.

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withIsolatedBrowser } from './lib/isolated-browser.mjs';

const argv = process.argv.slice(2);
function value(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
}
function number(name, fallback, min = 0) {
  const n = Number(value(name, fallback));
  if (!Number.isFinite(n) || n < min) throw new Error(`${name} must be >= ${min}`);
  return n;
}

const ROOT = resolve(value('--root', resolve(import.meta.dirname, '../..')));
const OUT = resolve(value('--out', '/private/tmp/hullbreaker-perf-probe'));
const WIDTH = number('--width', 1280, 320);
const HEIGHT = number('--height', 800, 240);
const DPR = number('--dpr', 2, 0.5);
const SECONDS = number('--seconds', 12, 2);
const THROTTLE = number('--throttle', 1, 1);
const PROFILE = argv.includes('--profile');
const IDLE = argv.includes('--idle');
const URL_QUERY = value('--query',
  'testapi=1&shell=0&audio=0&adaptive=0&momentum=0&score=0');
const DRAW_SAMPLES = number('--draw-samples', 12, 1);

function rankProfile(profile, limit = 24) {
  if (!profile?.samples?.length) return { byFunction: [], byFile: [] };
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const byFunction = new Map();
  const byFile = new Map();
  for (let i = 0; i < profile.samples.length; i++) {
    const node = nodes.get(profile.samples[i]);
    if (!node) continue;
    const us = profile.timeDeltas?.[i] || 0;
    const frame = node.callFrame || {};
    const file = frame.url || '(native/anonymous)';
    const fn = `${frame.functionName || '(anonymous)'} — ${file}`;
    byFunction.set(fn, (byFunction.get(fn) || 0) + us);
    byFile.set(file, (byFile.get(file) || 0) + us);
  }
  const sorted = (map) => [...map.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, limit)
    .map(([name, microseconds]) => ({
      name, selfMs: +(microseconds / 1000).toFixed(3),
    }));
  return { byFunction: sorted(byFunction), byFile: sorted(byFile) };
}

async function measureDrawPaths(page) {
  return page.evaluate(async (sampleCount) => {
    const S = await import('/src/render/scene.js');
    const P = await import('/src/render/post.js');
    const gl = S.renderer.getContext();
    const run = (name, draw) => {
      const times = [];
      let last = null;
      for (let i = 0; i < sampleCount; i++) {
        S.renderer.info.reset();
        gl.finish();
        const t0 = performance.now();
        draw();
        gl.finish();
        times.push(performance.now() - t0);
        last = { ...S.renderer.info.render };
      }
      times.sort((a, b) => a - b);
      return {
        name,
        medianMs: +times[Math.floor(times.length / 2)].toFixed(3),
        worstMs: +times[times.length - 1].toFixed(3),
        calls: last.calls,
        triangles: last.triangles,
        points: last.points,
        lines: last.lines,
      };
    };
    const direct = run('direct', () => S.renderer.render(S.scene, S.camera));
    const composed = run('composed', () => P.renderFrame());
    const shadows = S.renderer.shadowMap.enabled;
    S.renderer.shadowMap.enabled = false;
    const shadowless = run('direct-shadowless',
      () => S.renderer.render(S.scene, S.camera));
    S.renderer.shadowMap.enabled = shadows;
    P.renderFrame();
    return { direct, composed, shadowless };
  }, DRAW_SAMPLES);
}

await mkdir(OUT, { recursive: true });
const result = {
  measuredAt: new Date().toISOString(),
  tool: 'tools/playtest/perf-probe.mjs',
  root: ROOT,
  viewport: { width: WIDTH, height: HEIGHT, deviceScaleFactor: DPR },
  seconds: SECONDS,
  throttle: THROTTLE,
  profile: PROFILE,
  idle: IDLE,
  query: URL_QUERY,
};

await withIsolatedBrowser(ROOT, async ({ baseUrl, newPage, launch }) => {
  result.browser = launch;
  const { page, context, close } = await newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: DPR,
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  const cdp = await context.newCDPSession(page);
  try {
    if (THROTTLE !== 1) await cdp.send('Emulation.setCPUThrottlingRate', {
      rate: THROTTLE,
    });
    const started = performance.now();
    await page.goto(`${baseUrl}/index.html?${URL_QUERY}`, {
      waitUntil: 'load', timeout: 45000,
    });
    await page.waitForFunction(() => window.HB?.state() === 'PLAYING', null, {
      timeout: 20000,
    });
    result.bootToPlayingMs = +(performance.now() - started).toFixed(1);

    if (IDLE) await page.evaluate(async () => {
      const state = await import('/src/sim/state.js');
      state.setState('PAUSED');
    });

    await page.evaluate(() => {
      globalThis.__HB_PERF_PROBE__ = { active: true };
    });
    if (PROFILE) {
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
      await cdp.send('Profiler.start');
    }

    const tracePromise = page.evaluate(async (durationMs) => {
      const [S, THREE] = await Promise.all([
        import('/src/render/scene.js'), import('three'),
      ]);
      const started = performance.now();
      const frames = [];
      const growth = [];
      const addedGeometries = [];
      const seenAddedGeometry = new Set();
      const originalAdd = THREE.Object3D.prototype.add;
      THREE.Object3D.prototype.add = function (...objects) {
        for (const object of objects) {
          object.traverse?.((child) => {
            const geo = child.geometry;
            if (!geo || seenAddedGeometry.has(geo.uuid)) return;
            seenAddedGeometry.add(geo.uuid);
            addedGeometries.push({
              elapsedMs: +(performance.now() - started).toFixed(1),
              name: child.name || child.type,
              type: geo.type,
              userData: { ...geo.userData },
            });
          });
        }
        return originalAdd.apply(this, objects);
      };
      let programKeys = new Set((S.renderer.info.programs || [])
        .map((program) => program.cacheKey));
      const instanced = [];
      S.scene.traverse((object) => {
        if (!object.isInstancedMesh || !object.instanceMatrix) return;
        instanced.push({
          name: object.name || object.uuid,
          attribute: object.instanceMatrix,
          bytes: object.instanceMatrix.array.byteLength,
          version: object.instanceMatrix.version,
        });
      });
      let last = started;
      let nextGrowth = started;
      let uploadBytes = 0;
      let uploadEvents = 0;
      let uploadFrames = 0;
      await new Promise((resolve) => {
        const frame = (now) => {
          if (!globalThis.__HB_PERF_PROBE__?.active || now - started >= durationMs) {
            resolve(); return;
          }
          const dt = now - last;
          last = now;
          frames.push(dt);
          let frameDirty = false;
          for (const row of instanced) {
            const version = row.attribute.version;
            const delta = version - row.version;
            if (delta > 0) {
              uploadBytes += row.bytes * delta;
              uploadEvents += delta;
              frameDirty = true;
              row.version = version;
            }
          }
          if (frameDirty) uploadFrames++;
          if (now >= nextGrowth) {
            const nextKeys = new Set((S.renderer.info.programs || [])
              .map((program) => program.cacheKey));
            growth.push({
              elapsedMs: +(now - started).toFixed(1),
              geometries: S.renderer.info.memory.geometries,
              programs: S.renderer.info.programs?.length || 0,
              programsAdded: [...nextKeys].filter((key) => !programKeys.has(key)),
            });
            programKeys = nextKeys;
            nextGrowth += 1000;
          }
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      THREE.Object3D.prototype.add = originalAdd;
      frames.sort((a, b) => a - b);
      return {
        frameIntervals: {
          count: frames.length,
          medianMs: +frames[Math.floor(frames.length / 2)].toFixed(3),
          worstMs: +frames[frames.length - 1].toFixed(3),
          over20ms: frames.filter((value) => value > 20).length,
          over33ms: frames.filter((value) => value > 33).length,
        },
        growth,
        addedGeometries,
        instanceUploads: {
          meshCount: instanced.length,
          bytes: uploadBytes,
          kilobytes: +(uploadBytes / 1024).toFixed(2),
          events: uploadEvents,
          dirtyFrames: uploadFrames,
          kbPerFrame: +(uploadBytes / Math.max(1, frames.length) / 1024).toFixed(3),
        },
      };
    }, SECONDS * 1000);

    const trace = await tracePromise;
    let cpuProfile = null;
    if (PROFILE) cpuProfile = (await cdp.send('Profiler.stop')).profile;
    result.trace = trace;
    // Freeze the sim before probe-only alternate draw paths. Otherwise a
    // hostile can legitimately swap pose geometry between the before/after
    // plateau reads and make the measurement accuse the renderer.
    await page.evaluate(async () => {
      const state = await import('/src/sim/state.js');
      state.setState('PAUSED');
    });
    await page.waitForTimeout(50);
    result.drawPaths = await measureDrawPaths(page);
    result.runtime = await page.evaluate(async () => {
      const S = await import('/src/render/scene.js');
      const gl = S.renderer.getContext();
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      const memory = S.renderer.info.memory;
      const first = globalThis.__HB_PERF_PROBE__;
      const before = { geometries: memory.geometries,
        programs: S.renderer.info.programs?.length || 0 };
      await new Promise((resolve) => setTimeout(resolve, 1100));
      const after = { geometries: memory.geometries,
        programs: S.renderer.info.programs?.length || 0 };
      return {
        state: window.HB.state(),
        perf: window.HB.perf(),
        post: window.HB.post(),
        adaptiveFidelity: window.HB.adaptiveFidelity(),
        resources: S.rendererResourceSnapshot(),
        materialSubmission: S.materialSubmissionSnapshot(),
        resourcePlateau: {
          before, after,
          flat: before.geometries === after.geometries &&
            before.programs === after.programs,
        },
        context: {
          glRenderer: debug
            ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
            : gl.getParameter(gl.RENDERER),
          glVendor: debug
            ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)
            : gl.getParameter(gl.VENDOR),
          samples: gl.getParameter(gl.SAMPLES),
          attributes: gl.getContextAttributes(),
        },
        probeActive: !!first?.active,
      };
    });
    result.profileRanking = rankProfile(cpuProfile);
    result.errors = errors;
    await page.evaluate(() => { globalThis.__HB_PERF_PROBE__.active = false; });
  } finally {
    try { await cdp.send('Profiler.disable'); } catch { /* optional */ }
    await close();
  }
});

const growth = result.trace.growth;
result.summary = {
  calls: result.drawPaths.composed.calls,
  triangles: result.drawPaths.composed.triangles,
  composedMs: result.drawPaths.composed.medianMs,
  directMs: result.drawPaths.direct.medianMs,
  shadowCostMs: +(result.drawPaths.direct.medianMs -
    result.drawPaths.shadowless.medianMs).toFixed(3),
  worstFrameMs: result.trace.frameIntervals.worstMs,
  over20ms: result.trace.frameIntervals.over20ms,
  over33ms: result.trace.frameIntervals.over33ms,
  geometryGrowth: growth.length ? growth.at(-1).geometries - growth[0].geometries : 0,
  programGrowth: growth.length ? growth.at(-1).programs - growth[0].programs : 0,
  instanceUploadKbPerFrame: result.trace.instanceUploads.kbPerFrame,
  materialViolations: result.runtime.materialSubmission.violations.length,
  resourcePlateau: result.runtime.resourcePlateau.flat,
  glRenderer: result.runtime.context.glRenderer,
};

await writeFile(resolve(OUT, 'result.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ out: OUT, summary: result.summary, errors: result.errors }, null, 2));
if (result.errors.length || result.summary.materialViolations ||
    !result.summary.resourcePlateau) process.exitCode = 1;
