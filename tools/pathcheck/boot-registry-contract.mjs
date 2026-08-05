import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ok } from './_context.mjs';

export const title = 'explicit view and run-reset registries';
const checker = fileURLToPath(new URL('../boot-registry-check.mjs', import.meta.url));

export async function run() {
  const result = spawnSync(process.execPath, [checker], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(result.stdout || '');
    console.error(result.stderr || '');
  }
  ok(result.status === 0,
    'boot bridge ownership and run teardown are explicit ordered registries');
  ok(/BOOT REGISTRIES: 13 views, 31 reset owners/.test(result.stdout || ''),
    'registry manifests retain every declared owner');
}
