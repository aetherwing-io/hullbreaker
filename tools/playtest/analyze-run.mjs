#!/usr/bin/env node
// analyze-run.mjs — per-tick forensics over a finished run's report.json.
//
//   node tools/playtest/analyze-run.mjs /tmp/aimed/report.json [more/report.json …]
//   node tools/playtest/analyze-run.mjs /tmp/aimed            (a run dir works too)
//
// WHY THIS EXISTS (T-019): the T-018 finding was argued from per-tick
// evidence — which hostile was where when a life was spent, how often the gun
// actually pointed at something — reconstructed by hand each time. A bot run
// that is being iterated on needs that same reconstruction to be one command,
// or every claim in the next report is a fresh chance to fool yourself.
//
// Everything here is DERIVED FROM THE TRACE the run already wrote. It polls
// nothing, imports no game source, and cannot change a run's outcome — the
// analysis is downstream of the evidence, exactly like lib/metrics.mjs.
//
// What it reports, in order:
//   1. the run's shape (outcome, how far, kills, lives, wall/sim time);
//   2. every hp loss and every life loss, ATTRIBUTED: airborne or grounded,
//      inside a gate or not, and the hostiles within 3 tiles on the sample
//      before it happened (kind/state/offset) — plus the terrain probe, so a
//      fall reads as a fall instead of as an unexplained hp drop;
//   3. the gate timeline: when each wave gate opened and closed, how long it
//      held the scroll, its peak body count (the HUD's own number) and the
//      kills scored inside it;
//   4. aim coverage per phase, replayed through the same policy engine the
//      run used (lib/policy.mjs is a pure function of rules × sample × held
//      keys, so the replay reproduces the run's own decisions): what fraction
//      of ticks the ACTIVE ray had a materialized hostile within one hit
//      radius, and what fraction some other 8-way ray would have had one;
//   5. where the run's time went — gated vs. scrolling vs. dead.
//
// HONESTY NOTES.
//   - The replay reconstructs held keys from the rules and the sampled state,
//     not from the driver's own keyboard log; taps (jump) are re-derived by
//     the same edge rule the driver uses, but their 420 ms self-release is not
//     modelled, so `jump` presses are not part of the aim reconstruction (they
//     never are: aim reads the direction keys only).
//   - "on target" is corridor occupancy at that instant (lib/threat.mjs's
//     model: a straight line from the standing muzzle), not a hit prediction,
//     and it inherits that module's documented no-bend-awareness limit.
//   - Aim coverage assumes the aim comes from the keys held THIS tick. A
//     policy that holds `strafe` freezes the aim vector at whatever it was
//     (computeAim returns early, src/sim/player.js), so coverage is not
//     modelled for those runs — the report says so out loud rather than
//     printing a number that is quietly wrong.
//   - Attribution names what was NEAR the loss, not what caused it. A hound
//     charging past and a wasp diving in are both listed; the analysis does
//     not adjudicate between them.
//   - "diver killed" in the dive census is inferred the same way: a diver that
//     leaves the hostile roster while still inside the corridor (14 tiles) is
//     counted as killed, because the trace carries no death event. A cull or a
//     despawn at that range would be counted as a kill too. The bias credits
//     the bot with kills it may not have made — conservative for any claim
//     that the bot does not kill ENOUGH, and wrong in the other direction, so
//     never quote this number as a hit rate.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { compilePolicy, evaluatePolicyTick } from './lib/policy.mjs';
import { deriveThreat } from './lib/threat.mjs';

const NEAR_TILES = 3;                    // "what was next to RIG" radius, tiles
const GATE_RE = /^WAVE (\d+)\/(\d+) — (\d+) HOSTILES$/;
const LIVES_RE = /×(\d+)/;

function loadReport(p) {
  const path = p.endsWith('.json') ? p : resolve(p, 'report.json');
  return { path, report: JSON.parse(readFileSync(path, 'utf8')) };
}

const f1 = (v) => (typeof v === 'number' ? v.toFixed(1) : '?');
const f2 = (v) => (typeof v === 'number' ? v.toFixed(2) : '?');
const secs = (ms) => (typeof ms === 'number' ? (ms / 1000).toFixed(1) + 's' : '?');

function livesOf(sample) {
  const m = typeof sample.hudTL === 'string' ? sample.hudTL.match(LIVES_RE) : null;
  return m ? Number(m[1]) : null;
}

function gateOf(sample) {
  const m = typeof sample.hudTC === 'string' ? sample.hudTC.match(GATE_RE) : null;
  return m ? { k: Number(m[1]), bodies: Number(m[3]) } : null;
}

// The active 8-way ray, given the direction keys held this tick, and whether a
// materialized hostile sits within one hit radius of it. Mirrors computeAim's
// h/v resolution (src/sim/player.js) exactly the way lib/threat.mjs's corridor
// counts do — level with no `up`, 45° with `up` + a direction, straight up
// with `up` alone.
function aimCoverage(threat, held) {
  const up = held.has('ArrowUp') || held.has('KeyW');
  const h = (held.has('ArrowRight') || held.has('KeyD') ? 1 : 0) -
            (held.has('ArrowLeft') || held.has('KeyA') ? 1 : 0);
  const ray = up ? (h !== 0 ? 'diag' : 'vert') : 'level';
  const onRay = ray === 'diag' ? threat.diagN : ray === 'vert' ? threat.vertN : threat.levelN;
  const anyRay = threat.levelN + threat.diagN + threat.vertN;
  return { ray, on: onRay > 0, anyAvailable: anyRay > 0 };
}

function analyze({ path, report }) {
  const trace = report.trace || [];
  const rules = report.policy ? compilePolicy({ rules: report.policy.rules.map((r) => ({
    when: r.when,
    do: r.action.kind === 'hold'
      ? { hold: r.action.code }
      : { tap: r.action.code, holdMs: r.action.holdMs },
  })) }) : null;

  const out = [];
  const push = (s) => out.push(s);

  push(`# ${report.meta.scriptName} — ${path}`);
  const m = report.metrics || {};
  push(`outcome ${report.outcome && report.outcome.result} · wall ${secs(report.meta.wallTimeMs)} · ` +
    `kills ${m.finalKills ?? '?'} · lives ${m.lives ? `${m.lives.start}→${m.lives.end} (${m.lives.spent} spent)` : '?'}`);

  // --- walk the trace once, collecting everything -------------------------
  const held = new Set(['KeyJ']);          // the scripts' static fire hold; direction keys come from the replay
  let prev = null;
  const damage = [], lifeLoss = [];
  const gates = [];                        // {k, startMs, endMs, peak, killsAtStart, killsAtEnd}
  let gate = null;
  let onTarget = 0, ticks = 0, anyRay = 0;
  // Rule-conflict census: hold rules OR together per key code, so two rules
  // that disagree about which way to run cancel (h = 0 in computeAim — RIG
  // stands still and keeps its old facing). The grammar has no priority and
  // no arbitration, so this is a structural property of a reflex policy, not
  // a tuning mistake — worth counting rather than arguing about.
  let bothDirs = 0, playingTicks = 0, bothDirsWithThreat = 0;
  const perPhase = { gate: { on: 0, n: 0, any: 0 }, open: { on: 0, n: 0, any: 0 } };
  let airMs = 0, gateMs = 0, playMs = 0, deadMs = 0;
  let maxX = 0, maxScroll = 0, lastGameMs = 0;

  for (const s of trace) {
    if (typeof s.gameMs === 'number') lastGameMs = Math.max(lastGameMs, s.gameMs);
    if (typeof s.x === 'number') maxX = Math.max(maxX, s.x);
    if (typeof s.scrollX === 'number') maxScroll = Math.max(maxScroll, s.scrollX);

    const threat = deriveThreat(s, held);
    const g = gateOf(s);

    if (rules && s.state === 'PLAYING') {
      const tick = evaluatePolicyTick(rules, s, held);
      // rebuild the direction/up holds for the NEXT tick's aim, the way the
      // driver does (level-triggered, synced every tick)
      for (const code of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown']) {
        if (tick.desiredHolds.has(code)) held.add(code); else held.delete(code);
      }
      const cov = aimCoverage(threat, held);
      playingTicks++;
      if (tick.desiredHolds.has('ArrowLeft') && tick.desiredHolds.has('ArrowRight')) {
        bothDirs++;
        if (threat.n > 0) bothDirsWithThreat++;
      }
      if (threat.n > 0) {
        ticks++;
        if (cov.on) onTarget++;
        if (cov.anyAvailable) anyRay++;
        const bucket = g ? perPhase.gate : perPhase.open;
        bucket.n++;
        if (cov.on) bucket.on++;
        if (cov.anyAvailable) bucket.any++;
      }
    }

    if (prev) {
      const dt = (s.gameMs ?? 0) - (prev.gameMs ?? 0);
      if (dt > 0 && dt < 2000) {
        if (prev.state === 'PLAYING') {
          playMs += dt;
          if (prev.grounded === false) airMs += dt;
          if (gateOf(prev)) gateMs += dt;
        } else deadMs += dt;
      }
      // hp / life accounting, attributed against the PREVIOUS sample
      const hpDrop = typeof prev.hp === 'number' && typeof s.hp === 'number' && s.hp < prev.hp;
      const lv0 = livesOf(prev), lv1 = livesOf(s);
      const lifeDrop = lv0 !== null && lv1 !== null && lv1 < lv0;
      if (hpDrop || lifeDrop) {
        const near = (prev.hostiles || [])
          .filter((h) => h.materialized !== false &&
            Math.hypot(h.x - prev.x, h.y - prev.y) <= NEAR_TILES + 2)
          .map((h) => `${h.kind}/${h.state} dx${f1(h.x - prev.x)} dy${f1(h.y - prev.y)} d${f1(Math.hypot(h.x - prev.x, h.y - prev.y))}`);
        const rec = {
          gameMs: prev.gameMs, x: f2(prev.x), y: f2(prev.y), vy: f1(prev.vy),
          grounded: prev.grounded, hp: `${prev.hp}→${s.hp}`,
          gate: gateOf(prev) ? `gate ${gateOf(prev).k} (${gateOf(prev).bodies} bodies)` : 'open route',
          gapDist: prev.terrain ? f1(prev.terrain.gapDist) : '?',
          near,
        };
        if (lifeDrop) lifeLoss.push({ ...rec, lives: `${lv0}→${lv1}` });
        else damage.push(rec);
      }
    }

    // Gate segmentation. The HUD prints `WAVE k/6 — N HOSTILES` only while the
    // gate actually holds the scroll (src/ui/hud.js), so the segment ends the
    // tick that line stops appearing — and `gate` is dropped there, or the
    // next gate's arrival would overwrite the end it already has.
    if (g) {
      if (!gate || gate.k !== g.k) {
        gate = { k: g.k, startMs: s.gameMs, endMs: s.gameMs, peak: g.bodies,
                 killsAtStart: s.kills ?? null, killsAtEnd: s.kills ?? null,
                 scroll: s.scrollX, cleared: false };
        gates.push(gate);
      } else {
        gate.peak = Math.max(gate.peak, g.bodies);
        gate.killsAtEnd = s.kills ?? gate.killsAtEnd;
        gate.endMs = s.gameMs;
      }
    } else if (gate) {
      // `CLEAR` is the corner ritual's own stinger: the wave died rather than
      // the run ending inside it.
      gate.cleared = s.hudTC === 'CLEAR';
      gate = null;
    }

    prev = s;
  }

  push(`reach: maxX ${f1(maxX)} · scroll ${f1(maxScroll)} of 415 · sim clock ${secs(lastGameMs)}`);
  push(`time:  playing ${secs(playMs)} (gated ${secs(gateMs)}, ${(100 * gateMs / Math.max(1, playMs)).toFixed(0)}%; ` +
    `airborne ${secs(airMs)}, ${(100 * airMs / Math.max(1, playMs)).toFixed(0)}%) · not-playing ${secs(deadMs)}`);

  push('');
  push('## life losses');
  if (!lifeLoss.length) push('(none)');
  for (const l of lifeLoss) {
    push(`- ${secs(l.gameMs)} lives ${l.lives} at x ${l.x} y ${l.y} vy ${l.vy} · ` +
      `${l.grounded ? 'GROUNDED' : 'AIRBORNE'} · ${l.gate} · gapDist ${l.gapDist}`);
    push(`    near: ${l.near.length ? l.near.join(' | ') : 'nothing within 5 tiles'}`);
  }
  push('');
  push(`## hp losses (${damage.length})`);
  for (const d of damage) {
    push(`- ${secs(d.gameMs)} hp ${d.hp} at x ${d.x} y ${d.y} vy ${d.vy} · ` +
      `${d.grounded ? 'GROUNDED' : 'AIRBORNE'} · ${d.gate}`);
    push(`    near: ${d.near.length ? d.near.join(' | ') : 'nothing within 5 tiles'}`);
  }
  const air = damage.filter((d) => d.grounded === false).length;
  push(`airborne share of hp losses: ${air}/${damage.length}`);

  push('');
  push('## gates');
  for (const g of gates) {
    push(`- wave ${g.k}: ${secs(g.startMs)} → ${secs(g.endMs)} (${secs((g.endMs ?? 0) - (g.startMs ?? 0))} held, ` +
      `${g.cleared ? 'CLEARED' : 'run ended inside it'}) · ` +
      `peak ${g.peak} bodies · kills ${g.killsAtStart}→${g.killsAtEnd} · scroll ${f1(g.scroll)}`);
  }
  if (!gates.length) push('(no gate ever armed)');

  push('');
  push('## aim coverage (ticks with any materialized hostile in the sample)');
  if (!rules) {
    push('- n/a: this run had no policy, and coverage is reconstructed by replaying the ' +
      'policy over the trace — a static timeline\'s held keys are not in the sample.');
  }
  if ((report.policy ? report.policy.rules : []).some((r) => r.action.code === 'ShiftLeft' || r.action.code === 'ShiftRight')) {
    push('- NOT MODELLED for this run: the policy holds `strafe`, which freezes the aim ' +
      'vector (computeAim returns early) — the numbers below read the aim off the held ' +
      'keys and would be wrong. Treat them as a lower bound at best.');
  }
  const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + '%' : 'n/a');
  push(`- overall: gun on target ${pct(onTarget, ticks)} · some 8-way ray had one ${pct(anyRay, ticks)} (n=${ticks})`);
  push(`- inside a gate: ${pct(perPhase.gate.on, perPhase.gate.n)} on target, ` +
    `${pct(perPhase.gate.any, perPhase.gate.n)} available (n=${perPhase.gate.n})`);
  push(`- open route:    ${pct(perPhase.open.on, perPhase.open.n)} on target, ` +
    `${pct(perPhase.open.any, perPhase.open.n)} available (n=${perPhase.open.n})`);
  push(`- rules cancelling each other (left AND right held → RIG stands still): ` +
    `${pct(bothDirs, playingTicks)} of PLAYING ticks (${pct(bothDirsWithThreat, ticks)} of ticks with a hostile in view)`);

  // --- dive census --------------------------------------------------------
  // The one hostile beat this game aims AT the player, tracked per event
  // rather than per tick: every cruise→dive transition inside the corridor
  // range, what the policy's ray was doing while it fell, and how it ended.
  // "ended in contact" is inferred from RIG's hp dropping inside the dive's
  // own window (the sim gives no per-hit attribution), so a dive that lands on
  // the same frame as another hostile's touch is counted for both — stated
  // plainly because this number is the one a survivability claim rests on.
  {
    const seen = new Map();      // id -> {startMs, ticksOnRay, ticks, minDist, killed, hit}
    const done = [];
    const held2 = new Set(['KeyJ']);
    let prevHp = null;
    for (const s of trace) {
      if (!rules || s.state !== 'PLAYING' || !Array.isArray(s.hostiles)) continue;
      const threat = deriveThreat(s, held2);
      const tick = evaluatePolicyTick(rules, s, held2);
      for (const code of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown']) {
        if (tick.desiredHolds.has(code)) held2.add(code); else held2.delete(code);
      }
      const up = held2.has('ArrowUp');
      const h = (held2.has('ArrowRight') ? 1 : 0) - (held2.has('ArrowLeft') ? 1 : 0);
      const hpDropped = prevHp !== null && typeof s.hp === 'number' && s.hp < prevHp;
      const ids = new Set();
      for (const e of s.hostiles) {
        if (e.state !== 'dive' || e.materialized === false) continue;
        ids.add(e.id);
        const dx = e.x - s.x, dy = e.y - (s.y + 1.05);
        const dist = Math.hypot(dx, dy);
        const slope = Math.abs(dx) < 1e-6 ? 9 : dy / Math.abs(dx);
        let rec = seen.get(e.id);
        if (!rec) {
          rec = { id: e.id, startMs: s.gameMs, startDist: dist, startSlope: slope,
                  ticks: 0, onRay: 0, hit: false, killed: false, minDist: dist };
          seen.set(e.id, rec);
        }
        rec.ticks++;
        rec.minDist = Math.min(rec.minDist, dist);
        // was the ACTIVE ray pointing at this particular diver?
        const side = h !== 0 ? h : (s.facing === -1 ? -1 : 1);
        const fwd = dx * side;
        const onLevel = !up && fwd > 0 && Math.abs(dy) < 0.55;
        const onDiag = up && h !== 0 && fwd > 0 && dy > 0 && Math.abs(fwd - dy) < 0.55 * Math.SQRT2;
        const onVert = up && h === 0 && dy > 0 && Math.abs(dx) < 0.55;
        if (onLevel || onDiag || onVert) rec.onRay++;
        if (hpDropped && dist < 1.8) rec.hit = true;
      }
      // A diver that vanished from the roster while still close is counted as
      // killed; one that left `dive` state (recover) simply finished its dive.
      // INFERENCE, not a measurement: the trace has no death event, so a cull
      // or a despawn inside the corridor lands in the same bucket as a kill
      // (header honesty note). The bias credits the bot.
      for (const [id, rec] of seen) {
        if (ids.has(id)) continue;
        const still = s.hostiles.some((e) => e.id === id);
        rec.killed = !still && rec.minDist < 14;
        done.push(rec);
        seen.delete(id);
      }
      prevHp = typeof s.hp === 'number' ? s.hp : prevHp;
    }
    for (const rec of seen.values()) done.push(rec);
    const inRange = done.filter((d) => d.startDist <= 14);
    const steep = inRange.filter((d) => d.startSlope > 2.2);
    const mid = inRange.filter((d) => d.startSlope <= 2.2 && d.startSlope > 0.5);
    const flat = inRange.filter((d) => d.startSlope <= 0.5);
    const fmt = (label, arr) => {
      if (!arr.length) return `- ${label}: none`;
      const hits = arr.filter((d) => d.hit).length;
      const kills = arr.filter((d) => d.killed).length;
      const ray = arr.reduce((a, d) => a + d.onRay, 0) / Math.max(1, arr.reduce((a, d) => a + d.ticks, 0));
      return `- ${label}: ${arr.length} dives · ended in contact ${hits} (${(100 * hits / arr.length).toFixed(0)}%) · ` +
        `diver killed ${kills} (${(100 * kills / arr.length).toFixed(0)}%) · gun on THAT diver ${(100 * ray).toFixed(0)}% of its dive ticks`;
    };
    push('');
    push('## dive census (every cruise→dive inside the 14-tile corridor)');
    if (!rules) {
      // Same reason aim coverage bows out above: the census needs to know what
      // the gun was doing during each dive, and that is replayed from the
      // policy. With no rules there is nothing to replay — say so, because
      // "none" would read as "this run had no dives".
      push('- n/a: this run had no policy, and the census replays the policy to know which ' +
        'ray the gun was on during each dive — a static timeline\'s held keys are not in the ' +
        'sample. (Not "no dives happened": the dives were not classified.)');
    } else {
      push(fmt('all', inRange));
      push(fmt('shallow (slope ≤ 0.5, level ray)', flat));
      push(fmt('45°-ish (0.5 < slope ≤ 2.2, diag ray)', mid));
      push(fmt('steep (slope > 2.2, vertical ray only)', steep));
    }
  }

  if (report.policy) {
    push('');
    push('## policy rule fire counts (tap rules only)');
    for (const r of report.policy.rules) {
      if (r.action.kind === 'tap') push(`- [${r.index}] ${r.when} → ${r.fireCount} fires`);
    }
  }
  return out.join('\n');
}

// One markdown table row per run — for comparing a batch of repeats without
// reading five screens of forensics per run.
function brief({ path, report }) {
  const trace = report.trace || [];
  const m = report.metrics || {};
  let lastGameMs = 0, maxScroll = 0, gateMs = 0, playMs = 0, airMs = 0, prev = null;
  let hpEvents = 0;
  for (const s of trace) {
    if (typeof s.gameMs === 'number') lastGameMs = Math.max(lastGameMs, s.gameMs);
    if (typeof s.scrollX === 'number') maxScroll = Math.max(maxScroll, s.scrollX);
    if (prev) {
      const dt = (s.gameMs ?? 0) - (prev.gameMs ?? 0);
      if (dt > 0 && dt < 2000 && prev.state === 'PLAYING') {
        playMs += dt;
        if (gateOf(prev)) gateMs += dt;
        if (prev.grounded === false) airMs += dt;
      }
      // one event per sample, exactly like the detailed pass: the killing hit
      // drops hp AND a life on the same tick and must not count twice
      const lv0 = livesOf(prev), lv1 = livesOf(s);
      const lifeDrop = lv0 !== null && lv1 !== null && lv1 < lv0;
      const hpDrop = typeof prev.hp === 'number' && typeof s.hp === 'number' && s.hp < prev.hp;
      if (lifeDrop || hpDrop) hpEvents++;
    }
    prev = s;
  }
  const gates = new Set(trace.map((s) => (gateOf(s) || {}).k).filter(Boolean));
  const kills = m.finalKills ?? 0;
  return `| ${report.meta.scriptName} | ${secs(lastGameMs)} | ${maxScroll.toFixed(0)} | ` +
    `${[...gates].join(',') || '—'} | ${kills} | ${hpEvents} | ` +
    `${(kills / Math.max(1, hpEvents)).toFixed(1)} | ${(100 * airMs / Math.max(1, playMs)).toFixed(0)}% | ` +
    `${(100 * gateMs / Math.max(1, playMs)).toFixed(0)}% | ${path.replace(/.*\/([^/]+)\/report\.json/, '$1')} |`;
}

const args = process.argv.slice(2);
const briefMode = args.includes('--brief');
const targets = args.filter((a) => a !== '--brief');
if (!targets.length) {
  console.error('usage: node analyze-run.mjs [--brief] <run-dir-or-report.json> [...]');
  process.exit(1);
}
if (briefMode) {
  console.log('| script | survived | scroll | gates seen | kills | damage events | kills/hit | airborne | gated | run |');
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const a of targets) console.log(brief(loadReport(resolve(a))));
} else {
  for (const a of targets) {
    console.log(analyze(loadReport(resolve(a))));
    console.log('');
  }
}
