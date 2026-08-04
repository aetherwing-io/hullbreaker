/* Mandatory registration for the five-family projectile presentation. */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ok } from './_context.mjs';

export const title = 'projectile family production presentation';

const checker = fileURLToPath(new URL('../projectile-presentation-check.mjs', import.meta.url));
const terminalChecker = fileURLToPath(new URL('../projectile-terminal-check.mjs', import.meta.url));
const cindermouthChecker = fileURLToPath(
  new URL('../cindermouth-ground-fire-check.mjs', import.meta.url),
);
const destructionChecker = fileURLToPath(
  new URL('../destruction-flourish-check.mjs', import.meta.url),
);

export async function run() {
  const result = spawnSync(process.execPath, [checker], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(result.stdout || '');
    console.error(result.stderr || '');
  }
  ok(result.status === 0,
    'the projectile presentation focused production contract executes successfully');
  ok(/PROJECTILE PRESENTATION: 25\/25 contracts passed/.test(result.stdout || ''),
    'all twenty-five projectile presentation contracts remain registered');

  const terminal = spawnSync(process.execPath, [terminalChecker], { encoding: 'utf8' });
  if (terminal.status !== 0) {
    console.error(terminal.stdout || '');
    console.error(terminal.stderr || '');
  }
  ok(terminal.status === 0,
    'the real bullet loop terminal-reason contract executes successfully');
  ok(/PROJECTILE TERMINAL: 19\/19 contracts passed/.test(terminal.stdout || ''),
    'all nineteen exact endpoint and reason contracts remain registered');

  const cindermouth = spawnSync(process.execPath, [cindermouthChecker], { encoding: 'utf8' });
  if (cindermouth.status !== 0) {
    console.error(cindermouth.stdout || '');
    console.error(cindermouth.stderr || '');
  }
  ok(cindermouth.status === 0,
    'the HEAVY³ Cindermouth deck-transformation regression executes successfully');
  ok(/CINDERMOUTH GROUND FIRE: 36\/36 contracts passed/.test(cindermouth.stdout || ''),
    'all thirty-six ignition, platform, PHASE, bound, lip, stair, bend, and render contracts remain registered');

  const destruction = spawnSync(process.execPath, [destructionChecker], { encoding: 'utf8' });
  if (destruction.status !== 0) {
    console.error(destruction.stdout || '');
    console.error(destruction.stderr || '');
  }
  ok(destruction.status === 0,
    'the bounded role-specific destruction flourish contract executes successfully');
  ok(/DESTRUCTION FLOURISH: 17\/17 contracts passed/.test(destruction.stdout || ''),
    'all seventeen destruction geometry, pool, endpoint, and corpse-continuity contracts remain registered');
}
