/* =========================== FAILSAFE ============================= */
/* The durability policy (T-032): what the game DOES when a frame throws,
   and what the panel a player reads is allowed to SAY.

   Two deliberate splits:
     - this module is the deterministic half — a fault-streak state machine
       and a readability rule. No clock of its own: the caller passes the
       wall time in, so the same fault sequence always produces the same
       decisions and tools/pathcheck.mjs can drive it directly;
     - the DOM half is src/ui/failsafe.js, and the LAST-RESORT half is
       inlined in index.html. The inline copy exists because the incident
       that motivated this task was a stale cached file failing to parse:
       src/main.js never executed at all, so nothing that imports anything
       could have drawn the panel. Where the inline bootstrap needs one of
       the numbers below it carries its own literal and pathcheck asserts
       the two agree — a copy that is gated is not a second source of
       truth.

   The escalation is deliberately SLOW in frames and FAST in seconds: a
   single bad frame is a blip and must not cost a 9-year-old his run, but
   half a second of continuous breakage is not a blip, and by ~1.5 s the
   game has either restarted itself or put a readable panel in front of
   him. A game that keeps painting a dead canvas is the defect. */

export const FAILSAFE = {
  /* fault streak → action, all wall-clock ms. A fault more than
     streakWindowMs after the previous one starts a fresh streak, so an
     occasional hiccup can never accumulate into a shutdown across a long
     session. */
  streakWindowMs: 2000,
  /* how long a streak must persist before the game tries to fix itself */
  recoverAfterMs: 500,
  /* …and how many faults it must contain: at 60 fps that is a tenth of a
     second of solid breakage, and it keeps a nonsense clock from tripping
     a restart on a single fault. */
  minFaults: 5,
  /* restarts we will spend before giving up and showing the panel */
  maxRecoveries: 2,
  /* watchdogs owned by the inline bootstrap in index.html: how long a boot
     may take before the player is told something is wrong, how long the
     frame heartbeat may stall on a VISIBLE page before the game is
     declared stuck, and how often that is sampled. */
  bootWatchdogMs: 10000,
  freezeStallMs: 4000,
  freezeTickMs: 1000,
  /* The freeze watchdog's WARM-UP (T-105). Until the frame loop has beaten
     this many times — until its first frames have actually been drawn — a
     silent heartbeat is most likely the boot still finishing: the first
     draw is where a phone compiles its shaders and uploads its textures,
     and a GPU that is still busy holds animation frames back while the
     page's timers run on time, exactly the signature the 4 s rule reads as
     "stuck". (Measured: at DPR 3 under SwiftShader the 4 s rule raised the
     panel before the title.) The "got stuck" panel never comes down and its
     button reloads into the same first draw, so on such a phone the game
     could never start. So before warm-up the stall limit is warmStallMs,
     timed from the later of boot, the page becoming visible, and the last
     beat; after warm-up the 4 s rule is exactly what it was. NOT blinded: a
     loop that is truly dead during warm-up still gets the same hard panel,
     warmStallMs after it went quiet. Three beats: the first frame plus the
     one or two a browser may already have delivered behind it while the
     GPU works (reasoned, not measured on a phone). */
  warmBeats: 3,
  warmStallMs: 10000,
  /* src/main.js's frame-dt clamp. The literal in the frame loop stays the
     single source of truth (it is what the collision-tunneling budget is
     asserted against); this copy lets the policy state the contract, and
     pathcheck asserts the two are the same number. It is the reason a tab
     backgrounded for a minute resumes with one 50 ms step instead of a
     60-second one. */
  frameDtMaxMs: 50,
};

/* Every panel the player can be shown. The words themselves live in
   index.html (the inline bootstrap has to be able to render one with no
   modules loaded); this list is what pathcheck checks that table against. */
export const FAILSAFE_KINDS = ['boot', 'crash', 'frozen', 'slow'];

/* The keys that mean "put me back in the game" while a panel is up. */
export const FAILSAFE_KEYS = ['KeyR', 'Enter', 'Space'];

export function freshFaultState() {
  return { faults: 0, firstMs: 0, lastMs: -Infinity, recoveries: 0, halted: false };
}

/* One fault arrives. Returns the next state plus the action the caller
   must take: 'ignore' (keep playing), 'recover' (restart the run) or
   'stop' (stand the loop down and show the panel). Halting is sticky. */
export function faultStep(prev, nowMs, policy = FAILSAFE) {
  const t = Number.isFinite(nowMs)
    ? nowMs
    : (Number.isFinite(prev.lastMs) ? prev.lastMs : 0);
  if (prev.halted) return { ...prev, action: 'stop' };

  const next = {
    faults: (t - prev.lastMs <= policy.streakWindowMs) ? prev.faults + 1 : 1,
    firstMs: (t - prev.lastMs <= policy.streakWindowMs) ? prev.firstMs : t,
    lastMs: t,
    recoveries: prev.recoveries,
    halted: false,
  };
  let action = 'ignore';
  if (next.faults >= policy.minFaults && t - next.firstMs >= policy.recoverAfterMs) {
    if (next.recoveries < policy.maxRecoveries) {
      action = 'recover';
      next.recoveries = prev.recoveries + 1;
      next.faults = 0;                    // the restart gets a clean streak…
      next.firstMs = t;                   // …and its own half-second to prove it worked
    } else {
      action = 'stop';
      next.halted = true;
    }
  }
  return { ...next, action };
}

/* ------------------------- the freeze verdict ---------------------- *
 * One sample of the inline freeze watchdog (index.html), as a decision:
 * 'frozen' (show the "got stuck" panel) or 'ok'. `s` = { booted, showing,
 * slept, visible, beats, bootedAt, visibleSince, lastBeatAt }, all
 * wall-clock ms; lastBeatAt is when the watchdog last SAW the beat count
 * move. Before T-105 this was the 4 s rule alone, timed from the script's
 * start. The inline bootstrap cannot import this module (it must survive
 * every module failing), so it carries a copy written in the same ES5
 * subset; tools/pathcheck runs both over the same seeded states and every
 * threshold edge, and requires every verdict to agree.                  */
export function freezeVerdict(s, now, policy) {
  var P = policy || FAILSAFE;
  if (!s.booted || s.slept || !s.visible || s.showing) return 'ok';
  if (s.beats < P.warmBeats) {
    var since = Math.max(s.bootedAt, s.visibleSince, s.lastBeatAt);
    return now - since >= P.warmStallMs ? 'frozen' : 'ok';
  }
  if (now - s.visibleSince < P.freezeStallMs) return 'ok';
  return now - s.lastBeatAt >= P.freezeStallMs ? 'frozen' : 'ok';
}

/* ------------------------ plain language -------------------------- *
 * The panel is written for a 9-year-old, not for an engineer: the words a
 * player reads carry no jargon, no long words and no long sentences, and
 * the technical detail sits behind a fold for the operator. This rule is
 * enforced twice — pathcheck reads the text table straight out of
 * index.html, and ?selftest=1 reads the text that actually RENDERED, so a
 * panel that says the right thing in the source but paints something else
 * still fails.                                                          */
export const PLAIN = {
  maxWordLetters: 11,
  maxSentenceWords: 14,
  // whole words only; lower-cased before the test
  techWords: [
    'error', 'errors', 'exception', 'undefined', 'null', 'nan', 'stack',
    'syntax', 'javascript', 'js', 'code', 'callback', 'promise', 'fetch',
    'http', 'https', 'url', 'cache', 'uncaught', 'runtime', 'thread',
    'buffer', 'context', 'webgl', 'shader', 'gpu', 'canvas', 'dom',
    'browser', 'debug', 'log', 'trace', 'crash', 'fatal', 'invalid',
  ],
};

export function plainLanguageIssues(text, rules = PLAIN) {
  const issues = [];
  const raw = typeof text === 'string' ? text : String(text == null ? '' : text);
  const low = raw.toLowerCase();
  for (const w of rules.techWords)
    if (new RegExp('\\b' + w + '\\b').test(low)) issues.push('jargon "' + w + '"');
  for (const word of raw.split(/[^A-Za-z']+/))
    if (word.length > rules.maxWordLetters) issues.push('long word "' + word + '"');
  for (const sentence of raw.split(/[.!?…]+/)) {
    const n = sentence.trim().split(/\s+/).filter(Boolean).length;
    if (n > rules.maxSentenceWords) issues.push('long sentence (' + n + ' words)');
  }
  return issues;
}
