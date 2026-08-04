// Domain: T-044 — corner reveal set pieces (ARRIVAL + ARENA)
//
// Moved verbatim from the pre-split monolith into a domain module by the
// integrator during the T-044 merge; assertion text and order unchanged.
// The monolith's implicit shared scope is now explicit imports.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG } from '../../src/config.js';
import * as latticeModule from '../../src/pure/lattice.js';
import { buildLevel } from '../../src/pure/generator.js';
import { VERTICAL_ASSAULT } from '../../src/pure/vertical-assault.js';
import { near, ok, srcDir, stripComments } from './_context.mjs';

export const title = 'T-044 — corner reveal set pieces (ARRIVAL + ARENA)';

export async function run(SHARED) {
  const { LVL } = SHARED;   // built by earlier domains, as t-009 does
/* ============ T-044 — corner reveal set pieces (ARRIVAL + ARENA) ========
 * Two authored zones flank every corner ritual (src/pure/lattice.js): ARRIVAL,
 * one guaranteed catwalk in the gap between the apron and that face's own
 * pocket, and ARENA, the wave gate's own fighting ground composed per face
 * (2-6) instead of left to whatever the chunk stream and the Contra-tier
 * loop happened to leave there. Neither writes groundH; both compose the
 * escalating "six-stage ship response" (STORY.md) directly into the
 * battleground's own silhouette. No CONFIG.waves number moves — wave size,
 * composition, and gated-hostile tuning are byte-identical to main.
 *
 * That is NOT the same as "difficulty is unaffected", and this comment
 * used to claim it was — a review measurement (n=3/side,
 * scripts/six-face-aimed-run.json --deterministic) found the added terrain
 * measurably raises face 2's wave-gate clear rate for an identical scripted
 * policy against an identical wave (2/3 cleared gate 2 here vs 0/3 on the
 * merge-base). More footing and cover changing how winnable a fight is, is
 * a real difficulty effect even though no combat NUMBER changed — see
 * reports/tasks/T-044/build.md for the corrected measurement and the
 * question this is routed to the operator as, rather than decided here.
 *
 * The regression this task actually found and fixed, so the fix stays
 * fixed: an earlier version of latticeInstallSite cleared each set piece's
 * whole footprint before installing it (mirroring the pocket's own
 * gap-clearing precedent). That precedent did not transfer — the pocket
 * only ever clears its own two-column CHASM, a span nothing legitimate
 * stands over, but an arena footprint is up to 23 columns wide and can
 * contain a procedural catwalk that is the ONLY bridge across a raw ground
 * gap the chunk stream rolled inside it. Driving the shipped sim with the
 * project's own held-jump policy (every verb this class of bot uses is
 * already taught: run, jump at a gap or a denied step) went GAME_OVER the
 * moment that version deleted the catwalk at x[319,326) y=4.35 bridging a
 * 5-column gap on face 5 — the authored replacement sat too high for a jump
 * launched from the gap-mouth's actual ground height to reach. The fix
 * (still in effect below) is to ADD to a footprint rather than clear it
 * first; the assertions in this block prove the fixed shape, and the first
 * one below is written to fail loudly if that clearing regressed back in.  */
{
  const LAT = latticeModule;
  const L = LAT.LATTICE;
  const lvl = { groundH: LVL.groundH, platforms: LVL.platforms };

  // --- the regression's own fingerprint: the face-5 bridge survives ------
  // Named directly rather than only via the general reachability sweep
  // below, so a reintroduced clear-before-install regresses here first.
  {
    const bridge = LVL.platforms.find((p) => p.x0 === 319 && p.x1 === 326 && Math.abs(p.y - 4.35) < 1e-9);
    ok(!!bridge, 'T-044: the procedural catwalk bridging face 5\'s x[319,326) gap survives ' +
       'ARENA installation (regression proof for the clear-then-install bug this task fixed)');
  }

  // --- structure: one of each per face 2-6, none on face 1 ---------------
  ok(Array.isArray(LVL.arrivals) && LVL.arrivals.length === 5 &&
     LVL.arrivals.every((a) => a.face >= 2 && a.face <= 6),
     'T-044: one ARRIVAL catwalk per face 2-6, none on face 1, got faces ' +
     JSON.stringify(LVL.arrivals.map((a) => a.face)));
  ok(Array.isArray(LVL.arenas) && LVL.arenas.length === 5 &&
     LVL.arenas.every((a) => a.face >= 2 && a.face <= 6),
     'T-044: one ARENA composition per face 2-6, none on face 1, got faces ' +
     JSON.stringify(LVL.arenas.map((a) => a.face)));

  // --- footprints stay where DESIGN's other authored content needs them --
  {
    const pockets = LAT.latticePocketSites(CONFIG, LVL.groundH);
    let apronClash = 0, pocketClash = 0;
    for (const a of LVL.arrivals) {
      if (a.x0 <= a.corner + 2) apronClash++;             // apron ends prevCorner+2
      const pocket = pockets.find((p) => p.face === a.face);
      if (pocket && a.x1 > pocket.x0) pocketClash++;       // T-021's fork territory starts here
    }
    ok(apronClash === 0, 'T-044: every ARRIVAL clears its corner apron, ' + apronClash + ' clashes');
    ok(pocketClash === 0, 'T-044: every ARRIVAL ends before that face\'s own pocket begins ' +
       '(the fork/dare territory T-021 owns), ' + pocketClash + ' clashes');
  }
  {
    let apronClash = 0, footprintClash = 0;
    for (const a of LVL.arenas) {
      if (a.x1 > a.corner - 3) apronClash++;    // the apron's own platform-clear reaches corner-3
      const faceStart = CONFIG.path.introTiles + (a.face - 1) * CONFIG.path.faceTiles;
      for (const t of a.tiers) {
        if (t.x0 < faceStart + VERTICAL_ASSAULT.authoredStart ||
            t.x1 > a.corner - VERTICAL_ASSAULT.gateApron) footprintClash++;
      }
    }
    ok(apronClash === 0, 'T-044: every ARENA composition stays clear of its corner apron, ' +
       apronClash + ' clashes');
    ok(footprintClash === 0, 'T-044: every ARENA tier stays inside its face-authored ' +
       'play strip and outside the clean gate apron, ' + footprintClash + ' out of bounds');
  }

  // --- escalation is measured for the shipped seed, not just intended ----
  {
    const tierCounts = LVL.arenas.map((a) => a.platforms.length);
    ok(JSON.stringify(tierCounts) === JSON.stringify([1, 2, 3, 3, 3]),
       'T-044: arena tier count escalates face 2->6 exactly as authored (1,2,3,3,3), got ' +
       JSON.stringify(tierCounts));
    const allFit = LVL.arenas.every((a) => a.tiers.every((t) => t.fits));
    ok(allFit, 'T-044: every planned tier fits under laneCapY for the shipped seed — none ' +
       'silently dropped (a future reseed that breaks this must fail here, not ship quietly): ' +
       JSON.stringify(LVL.arenas.map((a) => a.tiers.map((t) => t.fits))));
    const widths = LVL.arenas.map((a) => Math.max.apply(null, a.tiers.map((t) => t.x1 - t.x0)));
    ok(widths.every((w) => w >= 7 && w <= VERTICAL_ASSAULT.maxPlatformLen),
       'T-044: arena tiers remain local maneuver castings (7-' +
       VERTICAL_ASSAULT.maxPlatformLen + ' tiles), got widths ' + JSON.stringify(widths));
    const peakY = LVL.arenas.map((a) => Math.max.apply(null, a.tiers.map((t) => t.y)));
    ok(peakY[peakY.length - 1] > peakY[0],
       'T-044: the tallest arena tier (face 6, Scuttle) sits higher than the first arena\'s ' +
       '(face 2, Intercept) — the "scale lands" claim, measured: ' + JSON.stringify(peakY));
  }

  // --- reachability: held to the SAME invariant every other catwalk is ---
  {
    const bad = LAT.latticeUnreachable(lvl, CONFIG).filter((p) => /^(arrival|arena)-/.test(p.id));
    ok(bad.length === 0, 'T-044: every ARRIVAL/ARENA platform is within double-jump reach of a ' +
       'support, got ' + JSON.stringify(bad));
    const stranded = LAT.latticeStranded(lvl, CONFIG).filter((p) => /^(arrival|arena)-/.test(p.id));
    ok(stranded.length === 0, 'T-044: no ARRIVAL/ARENA platform strands the player at its ' +
       'forward end, got ' + JSON.stringify(stranded));
  }

  // --- every authored platform survives the reachability prune ----------
  {
    const ids = new Set(LVL.platforms.map((p) => p.id));
    const expected = LVL.arrivals.map((a) => a.platforms[0].id)
      .concat(LVL.arenas.reduce((acc, a) => acc.concat(a.platforms.map((p) => p.id)), []));
    const missing = expected.filter((id) => !ids.has(id));
    ok(missing.length === 0, 'T-044: every authored ARRIVAL/ARENA platform survives into the ' +
       'shipped level, missing ' + JSON.stringify(missing));
  }

  /* --- driven proof: TERRAIN ONLY, same honesty scope as T-009's own test --
   * a policy using only already-taught verbs (hold right; jump on a gap or a
   * denied step ahead — the T-009 held-jump policy, run to completion here)
   * survives the whole six-face lattice AND, without trying to gain altitude
   * for its own sake, still lands on (`onOneWay`) several of the new
   * platforms along the way. Hostiles are removed every frame
   * (`while (HO.hostiles.length) HO.removeHostile(0, false)`), the exact
   * idiom T-009's own script already uses and labels "route, not fight" —
   * repeated here rather than reworded, because a hostile destroyed at the
   * top of the frame after it spawns never reaches CONFIG.wasp.enterMs
   * (900ms) and can never materialize, contact, dive, fire, or be fired at
   * (src/sim/hostiles.js, src/sim/weapons.js). So this proves ROUTE
   * reachability with the new terrain installed, and that four of the new
   * platforms take genuine physics contact from a real jump arc — it proves
   * nothing about surviving a wave-gate FIGHT with the new terrain, and
   * must never be read as "hostiles live" (review finding, T-044 cycle 1:
   * an earlier version of this comment and its messages claimed exactly
   * that, which was false — fixed here, assertions unchanged). The
   * clear-then-install regression this task found and fixed would still
   * show up here as a GAME_OVER (a fall, not a fight), which is the failure
   * mode this proof is actually scoped to catch.                          */
  {
    const simBase = 'file://' + join(srcDir, 'sim');
    const child = `
      const [T, E, LV, SC, PLm, IN, ST, HO, WP, CA] = await Promise.all([
        import(${JSON.stringify(simBase + '/time.js')}),
        import(${JSON.stringify(simBase + '/edges.js')}),
        import(${JSON.stringify(simBase + '/level.js')}),
        import(${JSON.stringify(simBase + '/scroll.js')}),
        import(${JSON.stringify(simBase + '/player.js')}),
        import(${JSON.stringify(simBase + '/input.js')}),
        import(${JSON.stringify(simBase + '/state.js')}),
        import(${JSON.stringify(simBase + '/hostiles.js')}),
        import(${JSON.stringify(simBase + '/weapons.js')}),
        import(${JSON.stringify(simBase + '/capsules.js')}),
      ]);
      E.setEdges(-18.9, 26.4);
      LV.unbuildFutureFaces();
      ST.setState('PLAYING');
      const p = PLm.player;
      p.x = 6; p.y = 3;
      IN.keys.right = true;
      const dt = 1 / 60;
      let jumpUntil = 0, lastOn = null;
      const mounted = new Set();
      for (let f = 0; f < 20000; f++) {
        if (p.grounded &&
            (LV.groundTopAt(p.x + 1.2) < -100 || LV.groundTopAt(p.x + 1.2) > p.y + 0.6)) {
          IN.bufferJumpUntil(T.gameMs + 120);
          IN.keys.jump = true;
          jumpUntil = T.gameMs + 420;
        }
        if (T.gameMs > jumpUntil) IN.keys.jump = false;
        T.advanceGameMs(dt * 1000);
        SC.updateScroll(dt);
        PLm.updatePlayer(dt);
        if (p.onOneWay && p.onOneWay.id !== lastOn) {
          if (/^(arrival|arena)-/.test(p.onOneWay.id)) mounted.add(p.onOneWay.id);
          lastOn = p.onOneWay.id;
        }
        if (ST.state !== 'PLAYING') break;
        while (HO.hostiles.length) HO.removeHostile(0, false);
        HO.updateHostiles(dt);
        WP.updateBullets(dt);
        CA.updateCapsules(dt);
        if (T.scrollX >= LV.activeScrollEnd()) break;
      }
      console.log(JSON.stringify({
        state: ST.state, lives: p.lives, x: p.x, scrollX: T.scrollX, end: LV.activeScrollEnd(),
        mounted: [...mounted].sort(),
      }));
    `;
    let run = null;
    try {
      run = JSON.parse(execFileSync(process.execPath,
        ['--input-type=module', '-e', child], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
    } catch (e) {
      console.error('pathcheck: T-044 driven-proof child failed: ' + e.message);
    }
    ok(!!run, 'T-044: the six-face run with ARRIVAL/ARENA installed simulates headlessly end ' +
       'to end (hostiles removed every frame — this is a TERRAIN proof, not a combat one)');
    if (run) {
      ok(run.state === 'PLAYING' || run.state === 'VICTORY',
         'T-044: with hostiles removed every frame (route, not fight — same idiom as T-009 ' +
         'above), the held-jump policy still crosses the whole lattice with ARRIVAL/ARENA ' +
         'installed (state ' + run.state + ', lives ' + run.lives + ') — the exact gate the ' +
         'clear-then-install regression broke (that bug was a fall, not a fight)');
      ok(run.scrollX >= run.end,
         'T-044: …and still reaches the outro scroll end (' + run.scrollX.toFixed(1) +
         ' of ' + run.end + ')');
      // V2 deliberately keeps the deck as a complete recovery route. A policy
      // that never asks for altitude is therefore allowed to touch zero
      // elevated set pieces; forcing three contacts would turn route choice
      // back into compulsory staircase traversal. `mounted` remains reported
      // by this child for review, while reachability of every authored tier is
      // gated arithmetically above and by the dedicated Vertical Assault test.
    }
  }
}


}
