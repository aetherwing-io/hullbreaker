/* Mandatory registration for the production capsule presentation contract.
   The focused checker remains directly runnable for its detailed TAP-like
   output; this domain makes a missing or weakened invocation fail pathcheck. */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ok } from './_context.mjs';

export const title = 'capsule reliquary production presentation';

const checker = fileURLToPath(new URL('../capsule-reliquary-check.mjs', import.meta.url));

export async function run() {
  const result = spawnSync(process.execPath, [checker], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(result.stdout || '');
    console.error(result.stderr || '');
  }
  ok(result.status === 0,
    'the capsule reliquary focused production contract executes successfully');
  ok(/CAPSULE RELIQUARY PASS: 22 focused contracts/.test(result.stdout || ''),
    'all twenty-two capsule reliquary presentation contracts remain registered');
}
