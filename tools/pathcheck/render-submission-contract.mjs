import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ok } from './_context.mjs';

export const title = 'built-scene render submission and idle-upload contract';
const probe = fileURLToPath(new URL('../playtest/perf-probe.mjs', import.meta.url));

export async function run() {
  // A private, fresh output directory per run. This used to be one fixed
  // shared path, so when the probe failed to boot, the assertions below
  // certified whatever result.json another lane's run had left there — a gate
  // reporting green on a scene it never booted (found by T-104, 2026-10-22).
  const out = mkdtempSync(join(tmpdir(), 'hullbreaker-pathcheck-render-submission-'));
  const result = spawnSync(process.execPath, [
    probe, '--seconds', '2', '--idle', '--draw-samples', '1', '--out', out,
  ], { encoding: 'utf8', timeout: Number(process.env.HB_PROBE_SPAWN_MS) || 45000 });
  if (result.status !== 0) {
    console.error(result.stdout || '');
    console.error(result.stderr || '');
  }
  let report = null;
  try { report = JSON.parse(readFileSync(`${out}/result.json`, 'utf8')); }
  catch (error) { console.error(String(error)); }
  const summary = report?.summary || {};
  ok(result.status === 0 && report,
    'the permanent real-browser performance probe boots the shipped scene');
  ok(summary.materialViolations === 0,
    'every built transparent DoubleSide material is single-pass or carries a named exception');
  ok(summary.instanceUploadKbPerFrame === 0,
    'a paused scene uploads zero unchanged instance-matrix bytes');
  ok(report?.runtime?.resources?.context?.samples <= 1,
    'the composed path does not allocate redundant default-framebuffer MSAA');

  rmSync(out, { recursive: true, force: true });

  const source = readFileSync(probe, 'utf8');
  ok(/--throttle/.test(source) && /--profile/.test(source) && /gl\.finish/.test(source),
    'the committed probe retains CPU throttle, V8 profile, and GPU-fenced draw modes');
}
