// compile.mjs — turns a playtest script (JSON) into a flat, time-sorted list
// of raw key events: { t, type: 'keydown'|'keyup', code }.
//
// `code` values must be real KeyboardEvent.code strings matching the game's
// KEYMAP in index.html (ArrowLeft/KeyA, ArrowRight/KeyD, ArrowUp/KeyW,
// ArrowDown/KeyS, Space/KeyK, KeyJ/KeyX, ShiftLeft/ShiftRight, plus KeyP,
// KeyR, Escape). The harness never invents synthetic input APIs — every
// event here is dispatched as a real CDP key event by the driver.
//
// Scripts may specify events two ways, and both can be mixed in one file:
//
//   "events": raw, low-level, exactly what gets dispatched:
//     { "t": 600, "type": "keydown", "code": "Space" }
//
//   "moves": a thin semantic layer that expands to the same raw events:
//     { "hold": "right", "fromMs": 0, "toMs": 4200 }
//     { "tap": "jump", "atMs": 600 }
//     { "tap": "jump", "atMs": 600, "holdMs": 90 }
//
// The semantic layer is honesty-preserving sugar, not a different execution
// path: compileScript() always resolves to the same flat `events` array that
// the raw form would produce, and the report records the exact codes/times
// actually dispatched.

const ALIAS_TO_CODE = {
  left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown',
  jump: 'Space', fire: 'KeyJ', strafe: 'ShiftLeft', pause: 'KeyP', restart: 'KeyR',
};

const VALID_CODES = new Set([
  'ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD', 'ArrowUp', 'KeyW', 'ArrowDown', 'KeyS',
  'Space', 'KeyK', 'KeyJ', 'KeyX', 'ShiftLeft', 'ShiftRight', 'KeyP', 'KeyR', 'Escape',
]);

export function resolveCode(nameOrCode) {
  const code = ALIAS_TO_CODE[nameOrCode] || nameOrCode;
  if (!VALID_CODES.has(code)) {
    throw new Error(`unknown key/alias "${nameOrCode}" — expected one of the game's real ` +
      `KeyboardEvent.code values or an alias (${Object.keys(ALIAS_TO_CODE).join(', ')})`);
  }
  return code;
}

function expandMoves(moves) {
  const out = [];
  for (const m of moves) {
    if ('hold' in m) {
      const code = resolveCode(m.hold);
      if (typeof m.fromMs !== 'number' || typeof m.toMs !== 'number') {
        throw new Error(`hold "${m.hold}" needs numeric fromMs/toMs`);
      }
      if (m.toMs <= m.fromMs) throw new Error(`hold "${m.hold}" toMs must be after fromMs`);
      out.push({ t: m.fromMs, type: 'keydown', code });
      out.push({ t: m.toMs, type: 'keyup', code });
    } else if ('tap' in m) {
      const code = resolveCode(m.tap);
      if (typeof m.atMs !== 'number') throw new Error(`tap "${m.tap}" needs numeric atMs`);
      const holdMs = typeof m.holdMs === 'number' ? m.holdMs : 60;
      out.push({ t: m.atMs, type: 'keydown', code });
      out.push({ t: m.atMs + holdMs, type: 'keyup', code });
    } else {
      throw new Error('each move needs a "hold" or "tap" key');
    }
  }
  return out;
}

// Same key/code released twice in a row (e.g. two holds overlapping) is a
// script bug, not something the driver should silently paper over — the
// bot's own script honesty depends on the timeline being unambiguous.
function assertNoDoubleEdges(events) {
  const stateByCode = new Map();
  for (const ev of events) {
    const prev = stateByCode.get(ev.code) || 'up';
    if (ev.type === 'keydown' && prev === 'down') {
      throw new Error(`duplicate keydown for ${ev.code} at t=${ev.t}ms without an intervening keyup`);
    }
    if (ev.type === 'keyup' && prev === 'up') {
      throw new Error(`keyup for ${ev.code} at t=${ev.t}ms with no matching keydown`);
    }
    stateByCode.set(ev.code, ev.type === 'keydown' ? 'down' : 'up');
  }
}

export function compileScript(script) {
  const raw = (script.events || []).map((ev) => ({
    t: ev.t, type: ev.type, code: resolveCode(ev.code),
  }));
  const fromMoves = expandMoves(script.moves || []);
  const events = raw.concat(fromMoves).sort((a, b) => a.t - b.t || (a.type === 'keyup' ? -1 : 1));
  assertNoDoubleEdges(events);
  return events;
}

export function scriptEndMs(events, script) {
  const lastEventT = events.reduce((m, e) => Math.max(m, e.t), 0);
  return Math.max(lastEventT, script.durationMs || 0);
}
