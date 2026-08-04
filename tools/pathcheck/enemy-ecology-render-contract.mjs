import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ok } from './_context.mjs';

export const title = 'Level 1 enemy ecology two-layer presentation';
const checker = fileURLToPath(new URL('../enemy-ecology-render-check.mjs', import.meta.url));

export async function run() {
  const result = spawnSync(process.execPath, [checker], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(result.stdout || '');
    console.error(result.stderr || '');
  }
  ok(result.status === 0,
    'manifest, fixed fit, selector, exact tactics and breakup contract execute');
  ok(/"componentGeometries": 192/.test(result.stdout || '') &&
    /"visualStates": 768/.test(result.stdout || '') &&
    /"quadsPerEnemy": 2/.test(result.stdout || ''),
  'one texture supplies 192 independent layers and 768 two-quad combinations');
}
