import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ok } from './_context.mjs';

export const title = 'sustained-frame adaptive fidelity ladder';
const checker = fileURLToPath(new URL('../adaptive-fidelity-check.mjs', import.meta.url));

export async function run() {
  const result = spawnSync(process.execPath, [checker], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(result.stdout || '');
    console.error(result.stderr || '');
  }
  ok(result.status === 0,
    'sustained frame misses step down quality without oscillation');
  ok(/ADAPTIVE FIDELITY: 3 stable degradation rungs/.test(result.stdout || ''),
    'supersample, bloom, and shadow resolution remain ordered and bounded');
}
