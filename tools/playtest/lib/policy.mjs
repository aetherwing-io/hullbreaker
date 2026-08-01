// policy.mjs — closed-loop reactive input. Motivated by two adversarial
// attacks that a fixed-timestamp script structurally cannot answer (report:
// docs/playtests/2026-07-adversarial.md, H3): the column-39 low-route slot is
// one-to-two frames wide *relative to a moving arrival time* — CP1's pace
// tuning changed when the player gets there, so a tap pinned to a literal ms
// value that passed pre-CP1 now misses. The fix is not a better-tuned
// timestamp, it's a rule that reacts to the game's own state.
//
// A policy is:
//   { "rules": [
//     { "when": "pinned",              "do": { "tap": "jump" } },
//     { "when": "houndTell",           "do": { "tap": "jump", "holdMs": 90 } },
//     { "when": "grounded && x>44",     "do": { "hold": "right" } }
//   ] }
//
// Rules are evaluated every sample tick against that tick's already-polled
// snapshot (lib/sampler.mjs) — no extra page.evaluate calls, no lookahead, no
// planning. Two action kinds:
//
//   "tap"  — edge-triggered: fires once when the condition goes false->true,
//            presses the key, releases it after holdMs (default 60ms).
//            Re-triggers only after the condition has gone false and true
//            again — a rule cannot fire on two consecutive true ticks.
//   "hold" — level-triggered: the key is down for exactly as long as the
//            condition is true this tick, synced every tick (not just on the
//            edge). Multiple hold rules targeting the same code combine by
//            OR: any one of them being true keeps the key down.
//
// Condition grammar — deliberately small, deliberately not a general
// expression language, and NOT eval()/new Function() under any
// circumstance: this is a reflex layer reacting to what the snapshot
// exposes, not an AI, and every condition a script can express is meant to
// be readable at a glance in a code review. `a && b && c` only (no ||, no
// parens); each clause is either:
//   - a named predicate, optionally negated with a leading `!`
//     (pinned, airborne, grounded, houndTell, houndCharge, polypTell,
//     polypFire, polypOpen, mortarLob, mortarFuse, mortarBurst,
//     mortarMarked, victory)
//   - a bare sample field, optionally negated, tested for truthiness
//     (e.g. "grounded", "!grounded")
//   - a comparison against a sample field: field OP value, where OP is one
//     of > >= < <= == != (e.g. "x>44", "hp<=1", "transform.eventState=='turning'")
//
// Fields may be dotted paths into nested sample objects (e.g.
// "transform.eventState", once the transform-slice ritual-state hook
// lands) — plain `sample[field]` lookup otherwise, walked one segment at a
// time. Comparison values are numeric unless quoted (or unquoted but not
// parseable as a number, e.g. `turning` in the example above) — string
// comparisons only support ==/!= (no lexicographic ordering).
//
// A field that never appears in any sample this run (wrong name, or a field
// only present in a different slice/fidelity) evaluates its clause to
// false rather than throwing mid-run — but every occurrence is recorded in
// missingFieldWarnings and surfaced in the report, so a typo doesn't fail
// silently forever.

import { resolveCode } from './compile.mjs';
import { isVictorySample } from './sampler.mjs';

// Grounded, nearly stationary, while the script is actively commanding
// horizontal movement (a currently-held direction key). This is the F8/H3
// "jammed against a step/wall while trying to run" signal — the harness's
// own notion of held keys (heldCodes), not a game-side concept.
const PINNED_VX_EPS = 0.3;

const PREDICATES = {
  pinned(sample, heldCodes) {
    return sample.grounded === true && Math.abs(sample.vx || 0) < PINNED_VX_EPS &&
      (heldCodes.has('ArrowRight') || heldCodes.has('ArrowLeft'));
  },
  airborne(sample) { return sample.grounded === false; },
  grounded(sample) { return sample.grounded === true; },
  // Houndframe telegraph (prowl -> tell -> charge -> skid/tumble,
  // src/sim/hostiles.js): `tell` is the pre-commitment plant, `charge` is
  // the committed lunge. Requires hostiles telemetry, which both channels
  // now carry: the sampler reads `hostiles` from whichever channel is
  // primary (testapi included, since e7b2952) and falls back to window.HB
  // only when the primary didn't have it (see lib/sampler.mjs).
  houndTell(sample) {
    return Array.isArray(sample.hostiles) &&
      sample.hostiles.some((h) => h.kind === 'hound' && h.state === 'tell');
  },
  houndCharge(sample) {
    return Array.isArray(sample.hostiles) &&
      sample.hostiles.some((h) => h.kind === 'hound' && h.state === 'charge');
  },
  // Iris Polyp iris cycle (closed -> tell -> fire -> vent,
  // src/sim/hostiles.js): `tell` is the dilating pre-beam warning, `fire`
  // is the live beam, `vent`/`polypOpen` is when the armour is down (fire
  // and vent are the two vulnerable states — closed and tell shots ping).
  polypTell(sample) {
    return Array.isArray(sample.hostiles) &&
      sample.hostiles.some((h) => h.kind === 'polyp' && h.state === 'tell');
  },
  polypFire(sample) {
    return Array.isArray(sample.hostiles) &&
      sample.hostiles.some((h) => h.kind === 'polyp' && h.state === 'fire');
  },
  polypOpen(sample) {
    return Array.isArray(sample.hostiles) &&
      sample.hostiles.some((h) => h.kind === 'polyp' &&
        (h.state === 'fire' || h.state === 'vent'));
  },
  // Spore Mortar bombardment cycle (aim -> lob -> fuse -> burst -> cool,
  // src/sim/hostiles.js): `lob` is the pod in flight with the landing zone
  // already marked, `fuse` is the planted pod counting down, `burst` is the
  // live denial. `mortarMarked` is the whole warning — the signal a bot
  // should treat as "that patch of floor is spoken for".
  mortarLob(sample) {
    return Array.isArray(sample.hostiles) &&
      sample.hostiles.some((h) => h.kind === 'mortar' && h.state === 'lob');
  },
  mortarFuse(sample) {
    return Array.isArray(sample.hostiles) &&
      sample.hostiles.some((h) => h.kind === 'mortar' && h.state === 'fuse');
  },
  mortarBurst(sample) {
    return Array.isArray(sample.hostiles) &&
      sample.hostiles.some((h) => h.kind === 'mortar' && h.state === 'burst');
  },
  mortarMarked(sample) {
    return Array.isArray(sample.hostiles) &&
      sample.hostiles.some((h) => h.kind === 'mortar' &&
        (h.state === 'lob' || h.state === 'fuse' || h.state === 'burst'));
  },
  victory(sample) { return isVictorySample(sample); },
};

const COMPARISON_RE = /^([\w.]+)\s*(>=|<=|==|!=|>|<)\s*(.+)$/;
const BOOLEAN_RE = /^(!)?([\w.]+)$/;
const NUMBER_RE = /^-?\d+(?:\.\d+)?$/;

// Dotted-path lookup (e.g. "transform.eventState") — plain property access
// one segment at a time, undefined-safe. Single-segment fields (the common
// case) behave exactly like sample[field] always did.
function getField(sample, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), sample);
}

// Comparison values are numeric unless they can't be parsed as one, in
// which case they're a string (quotes optional: `=='turning'` and
// `==turning` are the same). String comparisons only support ==/!= — no
// lexicographic ordering, kept deliberately out of the "dumb" grammar.
function parseRhs(raw) {
  const trimmed = raw.trim();
  if (NUMBER_RE.test(trimmed)) return { type: 'number', value: Number(trimmed) };
  const quoted = trimmed.match(/^(['"])(.*)\1$/);
  return { type: 'string', value: quoted ? quoted[2] : trimmed };
}

function evalComparison(field, op, rhs, sample) {
  const actual = getField(sample, field);
  if (actual === undefined) return { result: false, missingField: field };
  if (rhs.type === 'string') {
    return { result: op === '==' ? actual === rhs.value : actual !== rhs.value };
  }
  if (typeof actual !== 'number') return { result: false, missingField: field };
  switch (op) {
    case '>': return { result: actual > rhs.value };
    case '>=': return { result: actual >= rhs.value };
    case '<': return { result: actual < rhs.value };
    case '<=': return { result: actual <= rhs.value };
    case '==': return { result: actual === rhs.value };
    case '!=': return { result: actual !== rhs.value };
    default: return { result: false };
  }
}

function evalBoolean(negate, name, sample, heldCodes) {
  if (name in PREDICATES) {
    const r = PREDICATES[name](sample, heldCodes);
    return { result: negate ? !r : r };
  }
  const actual = getField(sample, name);
  if (actual === undefined) return { result: false, missingField: name };
  return { result: negate ? !actual : !!actual };
}

export function compileCondition(conditionStr) {
  const clauses = conditionStr.split('&&').map((c) => c.trim()).filter(Boolean);
  if (clauses.length === 0) throw new Error(`empty policy condition: "${conditionStr}"`);
  const parsed = clauses.map((clause) => {
    const cmp = clause.match(COMPARISON_RE);
    if (cmp) {
      const [, field, op, rhsRaw] = cmp;
      const rhs = parseRhs(rhsRaw);
      if (rhs.type === 'string' && op !== '==' && op !== '!=') {
        throw new Error(`"${clause}" (in "${conditionStr}") — ordering operators (> >= < <=) ` +
          'need a numeric value, got a string');
      }
      return { kind: 'cmp', field, op, rhs };
    }
    const bool = clause.match(BOOLEAN_RE);
    if (bool) return { kind: 'bool', negate: !!bool[1], name: bool[2] };
    throw new Error(`unparsable policy condition clause: "${clause}" (in "${conditionStr}") — ` +
      'expected "field OP value" or an optionally-!-negated name, joined only by &&');
  });
  return {
    raw: conditionStr,
    evaluate(sample, heldCodes) {
      const missingFields = [];
      let result = true;
      for (const p of parsed) {
        const r = p.kind === 'cmp'
          ? evalComparison(p.field, p.op, p.rhs, sample)
          : evalBoolean(p.negate, p.name, sample, heldCodes);
        if (r.missingField) missingFields.push(r.missingField);
        result = result && r.result;
      }
      return { result, missingFields };
    },
  };
}

export function compilePolicy(policy) {
  if (!policy || !Array.isArray(policy.rules) || policy.rules.length === 0) {
    throw new Error('policy needs a non-empty "rules" array');
  }
  return policy.rules.map((rule, i) => {
    if (typeof rule.when !== 'string') throw new Error(`policy rule ${i}: "when" must be a condition string`);
    if (!rule.do || typeof rule.do !== 'object') throw new Error(`policy rule ${i}: "do" must be an action object`);
    const condition = compileCondition(rule.when);
    let action;
    if ('tap' in rule.do) {
      action = { kind: 'tap', code: resolveCode(rule.do.tap), holdMs: typeof rule.do.holdMs === 'number' ? rule.do.holdMs : 60 };
    } else if ('hold' in rule.do) {
      action = { kind: 'hold', code: resolveCode(rule.do.hold) };
    } else {
      throw new Error(`policy rule ${i}: "do" needs a "tap" or "hold" key`);
    }
    return { index: i, when: rule.when, condition, action, wasTrue: false, fireCount: 0 };
  });
}

// Returns which codes should be held this tick (union of true `hold` rules)
// and which `tap` rules just rose from false to true. Mutates each rule's
// own wasTrue/fireCount bookkeeping — call once per tick, in tick order.
export function evaluatePolicyTick(rules, sample, heldCodes) {
  const desiredHolds = new Set();
  const tapsToFire = [];
  const evaluations = [];
  const missingFieldWarnings = [];
  for (const rule of rules) {
    const { result, missingFields } = rule.condition.evaluate(sample, heldCodes);
    for (const field of missingFields) missingFieldWarnings.push({ rule: rule.index, when: rule.when, field });
    evaluations.push({ rule: rule.index, when: rule.when, result });
    if (rule.action.kind === 'hold') {
      if (result) desiredHolds.add(rule.action.code);
    } else if (result && !rule.wasTrue) {
      tapsToFire.push({ code: rule.action.code, holdMs: rule.action.holdMs, rule: rule.index });
      rule.fireCount++;
    }
    rule.wasTrue = result;
  }
  return { desiredHolds, tapsToFire, evaluations, missingFieldWarnings };
}
