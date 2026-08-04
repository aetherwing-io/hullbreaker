import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ok } from './_context.mjs';

export const title = 'declarative rooted-enemy actor motion';
const checker = fileURLToPath(new URL('../actor-motion-check.mjs', import.meta.url));

export async function run() {
  const result = spawnSync(process.execPath, [checker], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(result.stdout || '');
    console.error(result.stderr || '');
  }
  ok(result.status === 0,
    'the declarative polyp, mortar, and Crown Warden motion contract executes');
  ok(/ACTOR MOTION: \d+\/\d+ contracts passed/.test(result.stdout || ''),
    'atlas geometry, clips, sockets, preload, and death continuity stay registered');
}
