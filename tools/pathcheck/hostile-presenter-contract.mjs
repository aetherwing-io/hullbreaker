import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ok } from './_context.mjs';

export const title = 'spawn-time hostile presenter registry';
const checker = fileURLToPath(new URL('../hostile-presenter-check.mjs', import.meta.url));

export async function run() {
  const result = spawnSync(process.execPath, [checker], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(result.stdout || '');
    console.error(result.stderr || '');
  }
  ok(result.status === 0,
    'hostile body presentation is selected once and owns its lifecycle');
  ok(/HOSTILE PRESENTERS: 5 lifecycle owners registered/.test(result.stdout || ''),
    'ecology, modular, actor, sprite, and primitive presenters remain explicit');
}
