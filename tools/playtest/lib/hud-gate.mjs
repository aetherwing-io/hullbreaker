// hud-gate.mjs — read the HUD objective line (#hudTC) the way the shipped game
// writes it (src/ui/hud.js), for tools that segment a recorded run into gates.
//
// While a gate holds the scroll, src/ui/hud.js prints (T-102):
//
//   `WAVE ${k}/${faces} · ${phase} · ` + gateRequirementText(...)
//
// and gateRequirementText (src/pure/waves.js) reads 'LAST SIGNAL · CLOSING'
// (one more kill opens the gate), 'N HOSTILE' / 'N HOSTILES', 'N HOSTILES ·
// +M INBOUND' or '+M INBOUND'. Every other objective line is not a held gate:
// the idle approach (`WAVE k/6 · PHASE`, `… · INBOUND` once primed, `… · CONTACT`
// / `… · MERIDIAN HAS SEEN YOU` at the start), the broken gate
// (`WAVE k/6 BROKEN · RUN TO THE TURN →`) and the corner stinger (`PHASE
// BROKEN · NEXT` / `SCUTTLE COMPLETE · CROWN ACCESS OPEN`).
//
// tools/pathcheck/t-120-harness-reads-the-hud.mjs builds these lines from the
// shipped template and the real gateRequirementText and checks this parser reads
// them back (I-106: the pattern it replaces, `WAVE k/6 — N HOSTILES`, matched
// nothing the game had printed for several releases).
//
// LIMITATION: on the LAST SIGNAL line the HUD says only that ONE gating body is
// left, not how many bodies are on screen, so `present` is a lower bound (1).

export const GATE_RE =
  /^WAVE (\d+)\/(\d+) · ([^·]+?) · (?:(LAST SIGNAL · CLOSING)|(\d+) HOSTILES?(?: · \+(\d+) INBOUND)?|\+(\d+) INBOUND)$/;

// { k, faces, phase, last, present, inbound } for a held-gate line, else null
export function parseGateLine(text) {
  const m = typeof text === 'string' ? text.match(GATE_RE) : null;
  if (!m) return null;
  return {
    k: Number(m[1]), faces: Number(m[2]), phase: m[3],
    last: m[4] !== undefined,
    present: m[4] !== undefined ? 1 : m[5] !== undefined ? Number(m[5]) : 0,
    inbound: Number(m[6] ?? m[7] ?? 0),
  };
}

// the gate broke (the line that follows a cleared gate), as opposed to a run
// that ended inside it
export const GATE_BROKEN_RE = /^WAVE \d+\/\d+ BROKEN · |^[A-Z]+ BROKEN · |^SCUTTLE COMPLETE · /;
export function isGateBrokenLine(text) {
  return typeof text === 'string' && GATE_BROKEN_RE.test(text);
}
