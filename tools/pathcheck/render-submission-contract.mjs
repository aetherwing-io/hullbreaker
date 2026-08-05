import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ok } from './_context.mjs';

export const title = 'built-scene render submission and idle-upload contract';
const probe = fileURLToPath(new URL('../playtest/perf-probe.mjs', import.meta.url));
const out = '/private/tmp/hullbreaker-pathcheck-render-submission';

export async function run() {
  const result = spawnSync(process.execPath, [
    probe, '--seconds', '2', '--idle', '--draw-samples', '1', '--out', out,
  ], { encoding: 'utf8', timeout: 45000 });
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

  const source = readFileSync(probe, 'utf8');
  ok(/--throttle/.test(source) && /--profile/.test(source) && /gl\.finish/.test(source),
    'the committed probe retains CPU throttle, V8 profile, and GPU-fenced draw modes');
}
