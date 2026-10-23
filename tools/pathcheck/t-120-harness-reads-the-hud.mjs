/* T-120 (I-106) — the bot harness reads the HUD the shipped game writes.
 *
 * tools/playtest/analyze-run.mjs segments a recorded run into gates by parsing
 * the HUD objective line (#hudTC). Its pattern was `WAVE k/6 — N HOSTILES`, a
 * line the game had not printed for several releases, so every gate census it
 * produced was silently empty and nothing noticed. A harness self-test (DEEP
 * tier, like the T-018/T-027 harness checks): it builds the held-gate line the
 * way src/ui/hud.js builds it — the template prefix read from hud.js itself,
 * the REAL gateRequirementText and wavePhase from src/pure/waves.js — for every
 * wave and every requirement shape, and asserts that tools/playtest/lib/
 * hud-gate.mjs reads each one back exactly, and reads the objective lines that
 * are not a held gate as no gate.
 *
 * hud.js is read as text only because it is DOM code (it cannot be imported
 * headlessly); if its gate line stops being `template + gateRequirementText(…)`
 * the first assertion fails and names the parser that needs the change.
 * Falsified (T-120 build report): the old pattern restored in hud-gate.mjs ->
 * red; the HUD's ' · ' separator changed to ' — ' -> red.                      */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ok, srcDir, stripComments } from './_context.mjs';
import { CONFIG } from '../../src/config.js';
import { gateRequirementText, wavePhase } from '../../src/pure/waves.js';
import { isGateBrokenLine, parseGateLine } from '../playtest/lib/hud-gate.mjs';

export const title = 'T-120 (I-106): the bot harness parses the HUD line the shipped game writes';

export async function run() {
  const hud = stripComments(readFileSync(join(srcDir, 'ui', 'hud.js'), 'utf8'));
  const tpl = (hud.match(/c\.state === 'gate'\)\s*\{[\s\S]{0,400}?tc = `([^`]*)` \+ gateRequirementText\(/) || [])[1];
  ok(typeof tpl === 'string' && tpl.includes('${c.k}') && tpl.includes('${c.phase}'),
    'I-106: src/ui/hud.js still writes the held-gate line as `WAVE ${c.k}/… · ${c.phase} · ` + ' +
    'gateRequirementText(…) — the shape tools/playtest/lib/hud-gate.mjs parses');
  if (typeof tpl !== 'string') return;
  const faces = CONFIG.path.faces;
  const lineFor = (k, need) => tpl.replace('${c.k}', String(k)).replace('${CONFIG.path.faces}', String(faces))
    .replace('${c.phase}', wavePhase(k, CONFIG)) + gateRequirementText(need);

  // every requirement shape gateRequirementText can print, with what the HUD then tells a reader
  const shapes = [
    [{ gatingLeft: 1, gatingPresent: 1, present: 1, gatingQueued: 0 }, { last: true, present: 1, inbound: 0 }],
    [{ gatingLeft: 1, gatingPresent: 1, present: 3, gatingQueued: 0 }, { last: true, present: 1, inbound: 0 }],
    [{ gatingLeft: 1, gatingPresent: 0, present: 1, gatingQueued: 0 }, { last: false, present: 1, inbound: 0 }],
    [{ gatingLeft: 4, gatingPresent: 4, present: 4, gatingQueued: 0 }, { last: false, present: 4, inbound: 0 }],
    [{ gatingLeft: 3, gatingPresent: 1, present: 1, gatingQueued: 2 }, { last: false, present: 1, inbound: 2 }],
    [{ gatingLeft: 2, gatingPresent: 0, present: 0, gatingQueued: 2 }, { last: false, present: 0, inbound: 2 }],
  ];
  const wrong = [];
  for (let k = 1; k <= faces; k++) {
    for (const [need, want] of shapes) {
      const text = lineFor(k, need);
      const got = parseGateLine(text);
      const ok1 = got && got.k === k && got.faces === faces && got.phase === wavePhase(k, CONFIG) &&
        got.last === want.last && got.present === want.present && got.inbound === want.inbound;
      if (!ok1) wrong.push(`"${text}" -> ${JSON.stringify(got)}`);
    }
  }
  ok(wrong.length === 0,
    `I-106: analyze-run reads every held-gate line the HUD can print (${faces} waves x ${shapes.length} ` +
    `requirement shapes) back to its wave, phase, bodies on screen and bodies inbound` +
    (wrong.length ? ' — ' + wrong.slice(0, 3).join('; ') : ''));

  // objective lines that are NOT a held gate (src/ui/hud.js's other branches)
  const notGate = [
    `WAVE 2/${faces} · ${wavePhase(2, CONFIG)}`,
    `WAVE 2/${faces} · ${wavePhase(2, CONFIG)} · INBOUND`,
    `WAVE 1/${faces} · ${wavePhase(1, CONFIG)} · CONTACT`,
    `WAVE 1/${faces} · ${wavePhase(1, CONFIG)} · MERIDIAN HAS SEEN YOU`,
    `WAVE 2/${faces} BROKEN · RUN TO THE TURN →`,
    `${wavePhase(2, CONFIG)} BROKEN · ${wavePhase(3, CONFIG)}`,
    'SCUTTLE COMPLETE · CROWN ACCESS OPEN',
    '',
  ];
  const misread = notGate.filter((t) => parseGateLine(t) !== null);
  ok(misread.length === 0,
    'I-106: the idle, primed, broken and corner-stinger objective lines are not read as a held gate' +
    (misread.length ? ' — ' + misread.join('; ') : ''));
  const broken = [`WAVE 2/${faces} BROKEN · RUN TO THE TURN →`, `${wavePhase(2, CONFIG)} BROKEN · ${wavePhase(3, CONFIG)}`,
    'SCUTTLE COMPLETE · CROWN ACCESS OPEN'];
  ok(broken.every(isGateBrokenLine) && !isGateBrokenLine(lineFor(2, shapes[0][0])) &&
     !isGateBrokenLine(`WAVE 2/${faces} · ${wavePhase(2, CONFIG)} · INBOUND`),
    'I-106: a gate counts as broken exactly when the line after it is the broken-gate or corner line');
}
