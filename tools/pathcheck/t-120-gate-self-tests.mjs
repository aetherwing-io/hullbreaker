/* T-120 — the gates' own decision logic, against fixtures (DEEP: harness
 * self-tests, like T-018/T-027's). Each rule here decides whether a gate says
 * PASS, REPORT or FAIL, and three of them turn a would-be FAIL into a REPORT on
 * a GPU-less host — a rule like that must be shown to still FAIL on the defect
 * it could hide (review findings 1 and 4, playtest I-C / I-D):
 *
 *   tools/orch/lib/degrade-verdicts.mjs  the PLAY degrade step (slow runs:
 *        safety still judged on both runs, a crawl or a wedge fails, the
 *        comparison only inconclusive when the lagging run reached no checkpoint)
 *   tools/orch/lib/failsafe-check.mjs    the freeze-panel leniency, every branch,
 *        on a fake page
 *   tools/pathcheck/lib/spawn.mjs        a child killed from outside is played
 *        again once, said out loud; twice is a FAIL
 *
 * tools/orch/play-gate.mjs also runs the first two fixture sets at start-up and
 * refuses to judge anything when one fails (`play-gate.mjs --self-test`).     */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ok } from './_context.mjs';
import { DEGRADE_FIXTURES, degradeSelfTest } from '../orch/lib/degrade-verdicts.mjs';
import { FAILSAFE_FIXTURES, failsafeSelfTest } from '../orch/lib/failsafe-check.mjs';
import { externalKills, runChild } from './lib/spawn.mjs';

export const title = 'T-120: the gates\' own verdict rules hold their fixtures (degrade, failsafe, external kills)';

export async function run() {
  const degrade = degradeSelfTest();
  for (const t of degrade)
    ok(t.ok, `T-120 degrade verdicts: ${t.name}` + (t.ok ? '' : ` — missing ${JSON.stringify(t.missing)}, forbidden ${JSON.stringify(t.forbidden)}`));
  ok(degrade.length === DEGRADE_FIXTURES.length && degrade.length >= 10,
    `T-120 degrade verdicts: every fixture ran (${degrade.length} of ${DEGRADE_FIXTURES.length})`);

  const failsafe = await failsafeSelfTest();
  for (const t of failsafe) ok(t.ok, `T-120 failsafe check: ${t.name}` + (t.ok ? '' : ` — got ${t.got}`));
  ok(failsafe.length === FAILSAFE_FIXTURES.length && failsafe.length >= 8,
    `T-120 failsafe check: every fixture ran (${failsafe.length} of ${FAILSAFE_FIXTURES.length})`);

  // a child that SIGTERMs itself on its first run (an "outside" kill: not our
  // timeout's SIGKILL) and succeeds on its second
  const dir = mkdtempSync(join(tmpdir(), 'hullbreaker-t120-spawn-'));
  try {
    const child = join(dir, 'child.mjs');
    writeFileSync(child, `import { existsSync, writeFileSync } from 'node:fs';
      const [mark, mode] = process.argv.slice(2);
      if (mode === 'always' || !existsSync(mark)) { writeFileSync(mark, '1'); process.kill(process.pid, 'SIGTERM'); }
      else console.log(JSON.stringify({ ran: 'again' }));\n`);
    const before = externalKills.length;
    const once = await runChild(child, [join(dir, 'mark-once'), 'once']);
    ok(!once.error && once.ran === 'again' && externalKills.length === before + 1,
      'T-120 spawn: a child killed by SIGTERM from outside is played again once, and counted' +
      (once.error ? ' — ' + once.error : ''));
    const twice = await runChild(child, [join(dir, 'mark-always'), 'always']);
    ok(!!twice.error && /killed from outside twice/.test(twice.error) && externalKills.length === before + 2,
      'T-120 spawn: a child killed from outside twice is an error, not retried again' + (twice.error ? '' : ' — it passed'));
    const timedOut = await runChild(child, [join(dir, 'mark-x'), 'once'], { timeoutMs: 1 });
    ok(!!timedOut.error && /timed out/.test(timedOut.error) && !timedOut.externalSignal && externalKills.length === before + 2,
      'T-120 spawn: our own timeout kill is an error and never mistaken for an outside one (not re-run)');
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
