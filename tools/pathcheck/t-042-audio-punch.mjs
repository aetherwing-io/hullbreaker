// Domain: T-042: audio punch — static + behavioral guards =================
//
// New domain module (T-037's split post-dates this task's original append to
// the monolith; ported here verbatim on rebase — see reports/tasks/T-042/
// build.md for the merge note). Edit this file to add assertions in this
// domain; order between files is manifest.mjs's business.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG } from '../../src/config.js';
import { crushWarnIntensity, warnPulse } from '../../src/pure/juice.js';
import { ok, srcDir, stripComments } from './_context.mjs';

export const title = 'T-042: audio punch — static + behavioral guards =================';

export async function run(SHARED) {

/* =============== T-042: audio punch — static + behavioral guards ========= *
 * T-042 adds weight to impacts (a hit's OWN damage now nudges its sound the
 * way T-041 already nudges its spark stretch by velocity — decisions.md
 * entry 15), per-weapon distinctness, a dedicated destruction voice for the
 * orbital-lance screen-clear, an audible pursuing-edge pressure curve
 * sharing the visual crush-warning's own pure functions, and two readability
 * mechanisms for pillar 5 ("chaos stays readable"): per-voice load scaling
 * (loadScale()) and a combat-density ambience duck (heat/combatDuck) that
 * composes with the existing state-driven duck. It touches only
 * src/ui/audio.js (plus the ONE-LINE `sLeftEdge` allowlist addition to the
 * T-012 block above, authorized by the team lead for the pressure curve —
 * see reports/tasks/T-042/build.md) — no sim/render/pure file.
 *
 * The static half (regex against source) mirrors the T-012 section's own
 * style. The behavioral half actually DRIVES the shipped module: audio.js
 * needs `window`/`document`/AudioContext to do anything past import, so this
 * stubs the smallest AudioContext surface the module calls (createGain,
 * createOscillator, createBufferSource, createBiquadFilter,
 * createDynamicsCompressor, createBuffer, the AudioParam automation calls)
 * and drives it through the REAL src/sim/bridge.js `view` hooks — the same
 * boundary the game itself calls through, not a reimplementation of the
 * logic under test. This is NOT a claim that anything is audible or sounds
 * good (headless CI cannot hear); it is a claim that the scheduling behavior
 * — voice cap held under a burst, load-scaled peaks shrinking under load
 * while `prio` peaks don't, the lance strike firing exactly once on the
 * frame gameMs crosses L.at and never again for the same L — is real,
 * proven by exercising the code rather than reading it.                   */
{
  const audioSrc = readFileSync(join(srcDir, 'ui', 'audio.js'), 'utf8');
  const audioCode = stripComments(audioSrc);

  function fnBody(name) {
    const m = new RegExp('function ' + name + '\\([^)]*\\)\\s*\\{[^]*?\\}').exec(audioCode);
    return m ? m[0] : null;
  }

  // --- static shape: the new destruction voice and its wiring -----------
  ok(/function sfxLanceStrike\(\)/.test(audioCode),
     'T-042: a dedicated lance-strike destruction sound exists, distinct from ' +
     'sfxKill/sfxBoom — the throttled per-hostile hit/kill sounds would otherwise ' +
     'flatten an 8-hostile screen-clear into one tick');
  ok(/function onLanceTelegraph\(L\)/.test(audioCode) && /gameMs >= L\.at/.test(audioCode),
     'T-042: the lance strike is detected off data the bridge ALREADY hands this ' +
     'hook (L.at) plus the gameMs import audio.js already had — not a new sim read');
  ok(!/from\s+['"]\.\.\/sim\/mods\.js['"]/.test(audioSrc),
     'T-042: the lance-strike detection and the combat-heat duck needed no new ' +
     'sim import at all — both stayed inside the T-012 sanctioned-read surface ' +
     'above');
  ok(/import\s*\{\s*sLeftEdge\s*\}\s*from\s+['"]\.\.\/sim\/edges\.js['"]/.test(audioSrc),
     'T-042: the pursuing-edge pressure curve reads sLeftEdge — the ONE new sim ' +
     'import in this file, added to the T-012 allowlist above with the team ' +
     'lead\'s authorization (task #50; see reports/tasks/T-042/build.md) rather ' +
     'than left undone or silently edited without a paper trail');
  ok(/function updatePressure\(\)/.test(audioCode) &&
     /crushWarnIntensity\(player\.x - player\.hw - sLeftEdge\(\), C\)/.test(audioCode),
     'T-042: the pressure curve reads the EXACT margin expression render/juice.js ' +
     'already drives the visual crush-warning haze with — the two effects cannot ' +
     'read differently for the same distance');
  ok(/warnPulse\(intensity, nowMs\(\), C\)/.test(audioCode),
     'T-042: the ping cadence is edge-detected off warnPulse() itself, not a ' +
     'reimplementation of its period formula — a retune of the visual pulse ' +
     'cadence (CONFIG.juice.crush.pulseSlowMs/pulseFastMs) retunes the ping for ' +
     'free and the two cannot drift apart');

  // --- static shape: readability under load ------------------------------
  ok(/function loadScale\(\)/.test(audioCode),
     'T-042: a voice-load headroom function exists (pillar 5)');
  ok(/function updateCombatHeat\(\)/.test(audioCode) && /function applyAmbienceGain\(/.test(audioCode),
     'T-042: a combat-density ambience duck exists alongside the state-driven one');
  ok(/A\.ambience \* ambDuck \* combatDuck/.test(audioCode),
     'T-042: the two ducks COMPOSE (multiply) rather than one replacing the other — ' +
     'a retry mid-fight and a combat lull easing off must not fight for the last word');

  const PRIO_FNS = ['sfxHurt', 'sfxFall', 'sfxSnap', 'sfxBoom', 'sfxLanceStrike', 'sfxWarn', 'motif'];
  for (const name of PRIO_FNS) {
    const body = fnBody(name);
    ok(!!body && /,\s*true\)/.test(body),
       'T-042: ' + name + ' passes prio=true to its tone/noiseHit calls — a safety ' +
       'or monumental-event cue must cut through load-scaling, not compete for it');
  }
  const LOAD_SCALED_FNS = [
    'sfxHit', 'sfxKill', 'sfxTell', 'sfxCharge', 'sfxWindup', 'sfxJump', 'sfxAirJump', 'sfxLaunch',
  ];
  for (const name of LOAD_SCALED_FNS) {
    const body = fnBody(name);
    ok(!!body && !/,\s*true\)/.test(body),
       'T-042: ' + name + ' does NOT bypass load-scaling — ordinary combat noise is ' +
       'exactly what pillar 5 needs to compress under a crowd, not exempt from it');
  }
  {
    const fireBody = /const FIRE = \{[^]*?\n\};/.exec(audioCode);
    ok(!!fireBody && !/,\s*true\)/.test(fireBody[0]),
       'T-042: none of the five weapon-fire recipes opt out of load-scaling — five ' +
       'guns firing at once should compress together, not each fight for full peak');
  }

  // --- behavioral: drive the real module through a stubbed AudioContext -----
  // Six independent scenarios, each its OWN fresh child process (own module
  // graph, own `voices` counter starting at 0) — simplest way to keep "cap
  // enforcement" and "the lance strike costs 4 voices" from fighting over the
  // same 14-voice budget as "load-scaling needs headroom left to observe".
  const STUB = `
    // FakeParam keeps its OWN automation history (not a shared global log):
    // gain nodes that live for the whole run (master/sfxBus/ambBus, the
    // pressure rumble, each ambience layer) get touched every frame by
    // per-frame code (updatePressure/updateCombatHeat) that has nothing to
    // do with any one SFX call, so a shared "every ramp anywhere" log would
    // mix an unrelated bus's ramp into "the 3 peaks THIS sfxHurt call
    // scheduled." Reading history off newly-created nodes only (see
    // newGainPeaks() in each scenario below) sidesteps that entirely: only
    // envGain() creates a gain node PER CALL, so "gain nodes created during
    // this window" IS "the envelopes this window's calls scheduled."
    class FakeParam {
      constructor(v) { this.value = v; this.history = []; }
      setValueAtTime(v) { this.value = v; this.history.push(['set', v]); }
      linearRampToValueAtTime(v) { this.value = v; this.history.push(['lin', v]); }
      exponentialRampToValueAtTime(v) { this.value = v; this.history.push(['exp', v]); }
      cancelScheduledValues() {}
    }
    class FakeNode { connect(n) { return n; } disconnect() {} }
    class FakeOsc extends FakeNode {
      constructor() { super(); this.frequency = new FakeParam(440); this.type = 'sine'; this.onended = null; }
      start() {} stop() {}
    }
    class FakeGain extends FakeNode {
      constructor() { super(); this.gain = new FakeParam(1); globalThis.GAIN_NODES.push(this); }
    }
    class FakeBiquad extends FakeNode {
      constructor() { super(); this.frequency = new FakeParam(350); this.Q = new FakeParam(1); this.type = 'lowpass'; }
    }
    class FakeBufferSource extends FakeNode {
      constructor() {
        super();
        this.buffer = null; this.loop = false;
        this.playbackRate = new FakeParam(1); this.onended = null;
      }
      start() {} stop() {}
    }
    class FakeBuffer {
      constructor(ch, len) { this._d = new Float32Array(len); }
      getChannelData() { return this._d; }
    }
    class FakeCompressor extends FakeNode {}
    globalThis.VOICE_NODES = [];
    globalThis.GAIN_NODES = [];
    globalThis.CTXS = [];
    class FakeAudioContext {
      constructor() {
        this.currentTime = 0; this.sampleRate = 44100; this.state = 'suspended';
        this.destination = new FakeNode();
        globalThis.CTXS.push(this);
      }
      createGain() { return new FakeGain(); }
      createOscillator() { const o = new FakeOsc(); globalThis.VOICE_NODES.push(o); return o; }
      createBufferSource() { const s = new FakeBufferSource(); globalThis.VOICE_NODES.push(s); return s; }
      createBiquadFilter() { return new FakeBiquad(); }
      createDynamicsCompressor() { return new FakeCompressor(); }
      createBuffer(ch, len) { return new FakeBuffer(ch, len); }
      resume() { this.state = 'running'; return Promise.resolve(); }
      suspend() { this.state = 'suspended'; return Promise.resolve(); }
    }
    globalThis.window = globalThis;
    globalThis.AudioContext = FakeAudioContext;
    const listeners = {};
    globalThis.document = {
      hidden: false,
      addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
    };
    globalThis.addEventListener = (name, fn) => { (listeners[name] ||= []).push(fn); };
    globalThis.__HB_QUERY__ = '';

    const S = ${JSON.stringify('file://' + join(srcDir) + '/')};
    const [BR, TI, PL, ED] = await Promise.all([
      import(S + 'sim/bridge.js'), import(S + 'sim/time.js'), import(S + 'sim/player.js'),
      import(S + 'sim/edges.js'),
    ]);
    const AU = await import(S + 'ui/audio.js');
    const view = BR.view, player = PL.player;

    for (const fn of (listeners.keydown || [])) fn();      // real-gesture unlock
    const ctx0 = globalThis.CTXS[0];
    const results = { unlocked: !!ctx0, contextState: AU.audioSnapshot().contextState };

    // The pursuing-edge pressure curve now runs every onPlayerSync() call
    // (updatePressure()), computed off player.x/hw and sLeftEdge() — pin the
    // player comfortably clear of the crush plane (intensity 0, see
    // pathcheck's own margin-vs-CONFIG.juice.crush.startTiles check below)
    // in every scenario that ISN'T specifically testing the pressure curve,
    // so its per-frame ramp/ping can't contaminate an unrelated measurement.
    player.x = 50; player.hw = 0.35; ED.setEdges(-1000, 1000); TI.setScrollX(0);

    // newGainPeaks(before): the linearRampToValueAtTime value (the peak
    // envGain() schedules) for every gain node CREATED since \`before\` —
    // i.e. exactly the envelopes created by whatever ran in between, not
    // ramps on a pre-existing bus (ambience/pressure/master/sfx).
    function newGainPeaks(before) {
      return globalThis.GAIN_NODES.slice(before).map((g) => {
        const lin = g.gain.history.find((h) => h[0] === 'lin');
        return lin ? lin[1] : null;
      }).filter((v) => v !== null);
    }
  `;

  function runChild(tail) {
    try {
      return JSON.parse(execFileSync(
        process.execPath, ['--input-type=module', '-e', STUB + tail + '\nconsole.log(JSON.stringify(results));'],
        { encoding: 'utf8' },
      ));
    } catch (e) {
      console.error('pathcheck: T-042 audio behavioral child failed: ' + e.message);
      return null;
    }
  }

  // ---- scenario 1: load-scaling — a NON-prio cue (jump) shrinks under
  // moderate voice load; a `prio` cue (hurt) reads identically regardless.
  const load = runChild(`
    player.grounded = true; player.vy = 0; player.hp = 5; player.airJumpsLeft = 1;
    player.traversalState = 'free'; player.iframesUntil = 0;
    view.player.sync();                                   // warm-up: absorbs the one-time
                                                            // activeCorner() idle transition
    let before = globalThis.GAIN_NODES.length;
    player.hp = 4;
    view.player.sync();                                    // sfxHurt() at voices=0
    results.hurtPeaksLow = newGainPeaks(before);

    before = globalThis.GAIN_NODES.length;
    player.grounded = false; player.vy = 10;
    view.player.sync();                                    // sfxJump() at voices=3 (from hurt)
    results.jumpPeakLow = newGainPeaks(before)[0];
    player.grounded = true; player.vy = 0;
    view.player.sync();                                    // reset airborne state, no event

    // moderate load: a small rifle-fire burst (own gate key, cleared by
    // advancing the fake context clock past fireGapMs each shot — gated on
    // real time, not sim gameMs), enough headroom under the cap left that
    // the calls below still create nodes instead of being silently dropped
    for (let i = 0; i < 3; i++) { ctx0.currentTime += 0.1; view.bullets.slotSpawned(0, 'R'); }
    results.voicesAtModerateLoad = AU.audioSnapshot().voices;

    before = globalThis.GAIN_NODES.length;
    player.hp = 3;
    view.player.sync();                                    // sfxHurt() again, at higher load
    results.hurtPeaksHigh = newGainPeaks(before);

    player.grounded = false; player.vy = 10;
    before = globalThis.GAIN_NODES.length;
    view.player.sync();                                    // sfxJump() again, at higher load
    results.jumpPeakHigh = newGainPeaks(before)[0];
  `);
  ok(!!load && load.unlocked && load.contextState === 'running',
     'T-042: a real keydown unlocks audio — AudioContext built and resumed ' +
     (load ? '(' + load.contextState + ')' : '(child failed)'));
  ok(!!load && Array.isArray(load.hurtPeaksLow) && load.hurtPeaksLow.length === 3 &&
     Array.isArray(load.hurtPeaksHigh) && load.hurtPeaksHigh.length === 3,
     'T-042: sfxHurt schedules exactly 3 gain ramps (its 3 layered tone/noiseHit ' +
     'calls) at both zero and moderate voice load — got ' +
     (load ? load.hurtPeaksLow.length + '/' + load.hurtPeaksHigh.length : '?'));
  ok(!!load && JSON.stringify(load.hurtPeaksLow) === JSON.stringify(load.hurtPeaksHigh),
     'T-042: hurt is `prio` — its peaks at moderate load (' +
     (load ? load.hurtPeaksHigh.join(',') : '?') + ') exactly match zero load (' +
     (load ? load.hurtPeaksLow.join(',') : '?') + '), proving it bypasses loadScale()');
  ok(!!load && typeof load.jumpPeakLow === 'number' && typeof load.jumpPeakHigh === 'number' &&
     load.jumpPeakHigh < load.jumpPeakLow && load.jumpPeakHigh > 0,
     'T-042: jump (non-prio) is load-scaled — its peak at ' + (load ? load.voicesAtModerateLoad : '?') +
     ' concurrent voices (' + (load ? load.jumpPeakHigh : '?') + ') is measurably quieter than, but ' +
     'still audible relative to, zero load (' + (load ? load.jumpPeakLow : '?') + ')');

  // ---- scenario 2: the hard voice cap holds under deliberate overload, and
  // the orbital lance strike (measured separately, well under the cap).
  const cap = runChild(`
    for (let i = 0; i < 40; i++) { ctx0.currentTime += 0.1; view.bullets.slotSpawned(0, 'R'); }
    const snap = AU.audioSnapshot();
    results.voicesAfterOverload = snap.voices;
    results.maxVoices = snap.maxVoices;

    // telegraph while armed-not-due fires no strike; the frame gameMs crosses
    // L.at fires exactly one (4 new voice nodes: two tone + two noiseHit
    // calls); a further frame on the SAME L fires none.
    view.mods.lanceTelegraph({ s: 0, at: -1 });            // warm-up: consumes the 'warn'
                                                            // gate (frozen ctx time keeps
                                                            // it closed below) and a
                                                            // sentinel lanceStruckAt — this
                                                            // DOES also resolve (at:-1 is
                                                            // always in the past), which is
                                                            // fine: measured deltas start
                                                            // AFTER it, at the voice cap
    const before = globalThis.VOICE_NODES.length;
    const gmAt = TI.gameMs + 500;
    const L = { s: 5, at: gmAt };
    view.mods.lanceTelegraph(L);                           // armed, not yet due
    results.lanceVoicesWhileArmed = globalThis.VOICE_NODES.length - before;
    TI.advanceGameMs(500);
    view.mods.lanceTelegraph(L);                           // resolving frame
    results.lanceVoicesOnResolve = globalThis.VOICE_NODES.length - before - results.lanceVoicesWhileArmed;
    const afterResolve = globalThis.VOICE_NODES.length;
    view.mods.lanceTelegraph(L);                           // one more frame, same L
    results.lanceVoicesOnRepeat = globalThis.VOICE_NODES.length - afterResolve;
  `);
  ok(!!cap && cap.voicesAfterOverload === cap.maxVoices && cap.maxVoices > 0,
     'T-042: 80 rifle shots fired back-to-back (far more than any legitimate volley, ' +
     'and none ever freed by onended — the worst case) still hold voices at exactly ' +
     'the ' + (cap ? cap.maxVoices : '?') + '-voice cap, not over it — got ' +
     (cap ? cap.voicesAfterOverload : '?'));
  ok(!!cap && cap.lanceVoicesWhileArmed === 0,
     'T-042: the lance telegraph while armed-but-not-due schedules no strike sound ' +
     '(0 new voice nodes beyond the already-full cap), only the (separately ' +
     'throttled, already-fired-once) warn beep');
  ok(!!cap && cap.lanceVoicesOnResolve === 0 && cap.voicesAfterOverload === cap.maxVoices,
     'T-042: even the lance strike respects the hard cap — at a saturated 14 ' +
     'voices it schedules 0 MORE (every one it wanted was already denied by the ' +
     'guard the same way an ordinary sound would be), proving `prio` bypasses ' +
     'loudness scaling but never the hard ceiling');
  ok(!!cap && cap.lanceVoicesOnRepeat === 0,
     'T-042: a further frame on the SAME L (gameMs still past L.at) fires nothing ' +
     'more — the strike is a one-shot event, not a sustained sound');

  // ---- scenario 3: the lance strike's OWN voice count, measured with
  // headroom (nothing else has run in this fresh process) — the complement
  // to scenario 2's cap-saturated measurement above.
  const lance = runChild(`
    view.mods.lanceTelegraph({ s: 0, at: -1 });            // warm-up, see scenario 2's note
    const before = globalThis.VOICE_NODES.length;
    const gmAt = TI.gameMs + 500;
    const L = { s: 5, at: gmAt };
    view.mods.lanceTelegraph(L);
    results.lanceVoicesWhileArmed = globalThis.VOICE_NODES.length - before;
    TI.advanceGameMs(500);
    view.mods.lanceTelegraph(L);
    results.lanceVoicesOnResolve = globalThis.VOICE_NODES.length - before - results.lanceVoicesWhileArmed;
    const afterResolve = globalThis.VOICE_NODES.length;
    view.mods.lanceTelegraph(L);                           // one more frame, same L — WITH
                                                            // headroom, so a dedup regression
                                                            // (unlike scenario 2) can't hide
                                                            // behind the voice cap
    results.lanceVoicesOnRepeat = globalThis.VOICE_NODES.length - afterResolve;
  `);
  ok(!!lance && lance.lanceVoicesWhileArmed === 0,
     'T-042: …and with headroom, the armed-not-due frame really does schedule 0 ' +
     '(not merely 0-because-the-cap-was-full, per scenario 2)');
  ok(!!lance && lance.lanceVoicesOnResolve === 4,
     'T-042: …and the resolving frame schedules exactly the lance-strike\'s 4 ' +
     'layered voices (2 tone + 2 noiseHit) — got ' + (lance ? lance.lanceVoicesOnResolve : '?'));
  ok(!!lance && lance.lanceVoicesOnRepeat === 0,
     'T-042: …and — WITH headroom, so the cap cannot mask a dedup regression — a ' +
     'further frame on the SAME L still schedules 0 more, not another 4');

  // ---- scenario 4: combat-density ambience duck — a burst of hostile hits
  // raises heat and ducks the bed; a lull afterward lets both recover.
  const heat = runChild(`
    let hp = 1000;
    function hitOnce() {
      view.hostiles.spawned({ id: 7, hp: hp + 1, kind: 'wasp', state: 'cruise' });
      ctx0.currentTime += 0.06;                            // clears the 45ms hit gate
      view.hostiles.sync({ id: 7, hp: --hp, kind: 'wasp', state: 'cruise' });
    }
    // Bursts of 4 hits (0.24s of fake-clock time, each adding heat) between
    // single player.sync() calls (each a ~0.29s-apart heat-tick recompute,
    // which also DECAYS heat by elapsed real time): a real busy fight lands
    // several hits per heat-tick window the same way, so bumps must outpace
    // one tick's decay for the duck to read as "busy" at all — one hit per
    // sync (as an earlier version of this test did) decays faster than a
    // single 0.12 bump ever climbs, which is a test-cadence bug, not a
    // product one (an ACTUAL fight lands far more than one hit per 140ms).
    for (let burst = 0; burst < 6; burst++) {
      for (let i = 0; i < 4; i++) hitOnce();
      ctx0.currentTime += 0.05;
      view.player.sync();                                  // runs updateCombatHeat()
    }
    let s = AU.audioSnapshot();
    results.heatBusy = s.heat; results.combatDuckBusy = s.combatDuck;
    ctx0.currentTime += 5;                                 // a long lull
    view.player.sync();
    s = AU.audioSnapshot();
    results.heatIdle = s.heat; results.combatDuckIdle = s.combatDuck;
  `);
  ok(!!heat && heat.heatBusy > 0 && heat.combatDuckBusy < 1,
     'T-042: a burst of hostile hits raises combat heat (' + (heat ? heat.heatBusy.toFixed(3) : '?') +
     ') and ducks the ambience bed below its normal level (combatDuck ' +
     (heat ? heat.combatDuckBusy.toFixed(3) : '?') + ' < 1)');
  ok(!!heat && heat.heatIdle < heat.heatBusy && heat.combatDuckIdle > heat.combatDuckBusy,
     'T-042: …and a lull afterward lets heat decay (' + (heat ? heat.heatIdle.toFixed(3) : '?') +
     ' < ' + (heat ? heat.heatBusy.toFixed(3) : '?') + ') and the ambience recover (' +
     (heat ? heat.combatDuckIdle.toFixed(3) : '?') + ' > ' + (heat ? heat.combatDuckBusy.toFixed(3) : '?') + ')');

  // ---- scenario 5: the pursuing-edge pressure curve — intensity rises as
  // the margin closes, is exactly 0 outside CONFIG.juice.crush.startTiles,
  // and the ping fires MORE OFTEN (shorter warnPulse period) the closer the
  // plane is, at a FIXED wall-clock window so cadence, not just a raw count
  // over an uncontrolled span, is what's being compared.
  const pressure = runChild(`
    ED.setEdges(0, 1000);                               // override the STUB's "stay clear of
                                                          // the plane" default so sLeftEdge()
                                                          // is exactly 0 and marginTiles below
                                                          // is the real distance, not offset by it
    function pressureAt(marginTiles) {
      player.x = player.hw + marginTiles;
      view.player.sync();
      return AU.audioSnapshot().pressure;
    }
    results.pressureFar = pressureAt(10);               // outside startTiles (3.4): must be 0
    results.pressureMid = pressureAt(1.7);              // half the warning band
    results.pressureNear = pressureAt(0.2);             // almost at the plane

    function countPings(marginTiles, windowMs, stepMs) {
      player.x = player.hw + marginTiles;
      view.player.sync();
      const before = globalThis.VOICE_NODES.length;
      for (let t = 0; t < windowMs; t += stepMs) { ctx0.currentTime += stepMs / 1000; view.player.sync(); }
      return globalThis.VOICE_NODES.length - before;
    }
    results.pingsNear = countPings(0.2, 2000, 20);
    results.pingsMid = countPings(1.7, 2000, 20);
  `);
  ok(!!pressure && pressure.pressureFar === 0,
     'T-042: outside the crush plane\'s own warning band, the pressure curve is ' +
     'exactly 0 — no rumble, no ping, nothing to duck against for 99% of a run');
  ok(!!pressure && pressure.pressureMid > 0 && pressure.pressureNear > pressure.pressureMid &&
     pressure.pressureNear <= 1,
     'T-042: intensity rises as the margin closes — 0.20 tiles out (' +
     (pressure ? pressure.pressureNear.toFixed(3) : '?') + ') reads higher than 1.70 tiles out (' +
     (pressure ? pressure.pressureMid.toFixed(3) : '?') + '), matching the visual haze\'s own curve');
  ok(!!pressure && pressure.pingsMid > 0 && pressure.pingsNear > pressure.pingsMid,
     'T-042: the ping fires more often at 0.20 tiles (' + (pressure ? pressure.pingsNear : '?') +
     ' in a fixed 2s window) than at 1.70 tiles (' + (pressure ? pressure.pingsMid : '?') +
     ') — the SAME accelerating cadence as the visual blink, not a fixed-rate beep');

  // ---- scenario 6: the impact/travel pairing (decisions.md entry 15) — a
  // bigger hit (LASER's 2 damage vs everything else's 1) schedules a bigger
  // hit sound, the same way T-041 already scales a spark's OWN stretch by
  // its own velocity.
  const weight = runChild(`
    view.hostiles.spawned({ id: 3, hp: 10, kind: 'wasp', state: 'cruise' });
    let before = globalThis.GAIN_NODES.length;
    view.hostiles.sync({ id: 3, hp: 9, kind: 'wasp', state: 'cruise' });    // 1 damage
    results.dmg1Peaks = newGainPeaks(before);

    ctx0.currentTime += 0.1;                              // clears the 45ms hit gate
    before = globalThis.GAIN_NODES.length;
    view.hostiles.sync({ id: 3, hp: 7, kind: 'wasp', state: 'cruise' });    // 2 damage
    results.dmg2Peaks = newGainPeaks(before);
  `);
  ok(!!weight && weight.dmg1Peaks.length === 3 && weight.dmg2Peaks.length === 3,
     'T-042: sfxHit schedules exactly 3 gain ramps regardless of damage dealt — got ' +
     (weight ? weight.dmg1Peaks.length + '/' + weight.dmg2Peaks.length : '?'));
  ok(!!weight && weight.dmg2Peaks[1] > weight.dmg1Peaks[1] && weight.dmg2Peaks[2] > weight.dmg1Peaks[2],
     'T-042: a 2-damage hit schedules a bigger square/sine peak (' +
     (weight ? weight.dmg2Peaks[1].toFixed(3) + '/' + weight.dmg2Peaks[2].toFixed(3) : '?') +
     ') than a 1-damage hit (' +
     (weight ? weight.dmg1Peaks[1].toFixed(3) + '/' + weight.dmg1Peaks[2].toFixed(3) : '?') +
     ') — a harder hit reads bigger in the mix, pairing with T-041\'s velocity-scaled ' +
     'impact stretch reading bigger on screen (decisions.md entry 15)');
}
}
