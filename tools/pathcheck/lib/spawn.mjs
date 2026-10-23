// spawn.mjs — run a child scenario for a pathcheck domain and parse its JSON.
// Asynchronous on purpose: a domain that needs several fresh processes starts
// them all at once (Promise.all), so they share the host instead of queueing.
//
// The child prints ONE JSON line on stdout (its last non-empty line is parsed).
// A child that exits non-zero, prints no JSON, or outlives the timeout resolves
// to { error } — the calling domain turns that into a FAIL, never a pass.

import { spawn } from 'node:child_process';

const SLOW = Number(process.env.HB_HARNESS_SLOWDOWN) > 1 ? 4 : 1;   // GPU-less, loaded hosts
export const CHILD_TIMEOUT_MS = (Number(process.env.HB_GATE_CHILD_TIMEOUT_MS) || 120000) * SLOW;

// A child killed by a signal that did NOT come from here (our timeout sends
// SIGKILL) — SIGTERM, SIGHUP or SIGINT from outside the gate, seen once on the
// shared host (playtest I-D: both retry twins "exit null SIGTERM", a false
// FAIL) — is played again ONCE. Every such re-run is printed and counted
// (externalKills below); a second external kill is a FAIL like any other.
export const externalKills = [];
const EXTERNAL = new Set(['SIGTERM', 'SIGHUP', 'SIGINT']);

export async function runChild(file, args = [], opts = {}) {
  const first = await runChildOnce(file, args, opts);
  if (!first.externalSignal) return first;
  const what = `${file.split('/').pop()} ${JSON.stringify(args).slice(0, 80)}`;
  externalKills.push({ child: what, signal: first.externalSignal });
  console.log(`pathcheck note: child ${what} was killed by ${first.externalSignal} from outside the gate — ` +
    `running it again once (external kills so far: ${externalKills.length})`);
  const second = await runChildOnce(file, args, opts);
  if (second.externalSignal) second.error += ' — killed from outside twice; not retried again';
  return second;
}

function runChildOnce(file, args, { timeoutMs = CHILD_TIMEOUT_MS, env = process.env } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [file, ...args], { stdio: ['ignore', 'pipe', 'pipe'], env });
    let out = '', err = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { err += c; if (err.length > 20000) err = err.slice(-20000); });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const line = out.trim().split('\n').filter(Boolean).pop() || '';
      if (code !== 0 || !line.startsWith('{')) {
        resolve({ error: `child ${file.split('/').pop()} ${JSON.stringify(args).slice(0, 120)} ` +
          `exit ${code}${signal ? ' ' + signal : ''}${timedOut ? ' (timed out)' : ''}: ` +
          `${(err || out).trim().split('\n').slice(-4).join(' | ').slice(0, 600)}`,
          externalSignal: !timedOut && EXTERNAL.has(signal) ? signal : null });
        return;
      }
      try { resolve(JSON.parse(line)); } catch (e) { resolve({ error: 'child printed unparsable JSON: ' + e.message }); }
    });
  });
}

// first frame where two per-frame hash traces differ (-1 = identical over the
// common length), and which named parts of the state differ there
export function firstDivergence(a, b) {
  const n = Math.min(a.hashes.length, b.hashes.length);
  for (let i = 0; i < n; i++) {
    if (a.hashes[i] !== b.hashes[i]) {
      const parts = Object.keys(a.parts[i]).filter((k) => a.parts[i][k] !== b.parts[i][k]);
      return { frame: i, parts };
    }
  }
  return { frame: -1, parts: [] };
}
