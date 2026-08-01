/* ============================= MORTAR ============================== */
/* Seed-Pod Tripod pure logic (boards 06/07, DESIGN's "denies intended
   landing zones after a readable delay"). Everything interesting about a
   mortar is geometry over TIME, so all of it lives here: the lob arc the
   pod flies, the blast slab that stands on the marked landing surface,
   the arming window, the accelerating mark pulse, and the authored trial
   stages. The sim owns only the state machine that walks these; the
   render layer derives the pod and the mark from the SAME functions, so
   what is drawn is what denies.

   No imports outside this layer (CONFIG is the shared pure data root).  */

import { CONFIG } from '../config.js';

/* ------------------------------ the lob ---------------------------- *
 * A fixed-duration parabola from the muzzle to the marked zone: the pod
 * cannot miss, because the denial is AUTHORED (placement-over-stats,
 * decisions.md entry 6) rather than aimed at the player. `arcTiles` is
 * the bulge above the straight muzzle→zone chord, which is what makes a
 * mortar read as a mortar — it throws over things instead of through
 * them. u runs 0→1 across CONFIG.mortar.lobMs. Two scalar functions
 * rather than a point object: the sim calls them every frame and the hot
 * loop stays allocation-free.                                          */
export function mortarArcX(x0, x1, u) {
  return x0 + (x1 - x0) * u;
}

export function mortarArcY(y0, y1, arcTiles, u) {
  return y0 + (y1 - y0) * u + 4 * arcTiles * u * (1 - u);
}

/* Does the whole flight stay out of solid terrain? Catwalks are grating —
   RIG drops through them and so does a pod — so this asks the same
   isSolidAt cell question the rest of the pure layer asks, and nothing
   about platforms. Sampled open at both ends: u=0 is the muzzle (inside
   the tripod) and u=1 is the landing surface itself. */
export function mortarArcClearsTerrain(x0, y0, x1, y1, arcTiles, isSolidAt, steps) {
  for (let k = 1; k < steps; k++) {
    const u = k / steps;
    if (isSolidAt(mortarArcX(x0, x1, u), mortarArcY(y0, y1, arcTiles, u))) return false;
  }
  return true;
}

/* --------------------------- the marked zone ------------------------ *
 * The denial is a SLAB standing on the landing surface: `half` tiles to
 * each side, `height` tiles tall. One predicate, shared by the burst's
 * damage test, the harness, and the render mesh, so they can never
 * disagree about what "in the zone" means — the polyp's beam rule
 * applied to a patch of floor.
 *
 * Height matters as much as width: a standing body is inside it (there
 * is no ducking a spore burst) but a jump clears it, which is what keeps
 * the answer a movement verb (pillar 2). Both bounds are asserted in
 * tools/pathcheck.mjs against every player tune.                       */
export function mortarBlastHitsRect(zx, zy, half, height, rx0, rx1, ry0, ry1) {
  return (zx - half) < rx1 && (zx + half) > rx0 && zy < ry1 && (zy + height) > ry0;
}

/* The trigger is the player approaching the ZONE, never the emplacement:
   a mortar denies a place, so the place is what watches. Once it fires,
   commitment is total (the sim never re-aims a pod), which is what makes
   redirecting in the air a real answer instead of a chase. */
export function mortarArmed(playerX, zoneX, armRange) {
  return Math.abs(playerX - zoneX) <= armRange;
}

/* Total legible warning: the mark appears when the pod leaves the tube,
   so the player reads the denial for the whole flight plus the fuse. */
export function mortarWarningMs(cfg) {
  return cfg.lobMs + cfg.fuseMs;
}

/* The mark's warning blink, in the roster's one warning language (the
   hound's and the polyp's accelerating tell): period shrinks from slow to
   fast as the remaining fuse runs out. Pure so the harness can assert the
   ramp is monotone and actually reaches the fast end. */
export function mortarPulsePeriodMs(remainMs, totalMs, slowMs, fastMs) {
  const u = totalMs > 0 ? Math.max(0, Math.min(1, 1 - remainMs / totalMs)) : 1;
  return slowMs + (fastMs - slowMs) * u;
}

/* ==================== SPORE MORTAR TRIAL (opt-in) =================== *
 * DESIGN's last enemy role, reached only through ?mortar= and carrying
 * the hound and polyp placement contract forward: threat comes from
 * WHERE it lands (decisions.md entry 6), never from hp or damage.
 *
 * The denied zone is the post-mid landing strip — the catwalk every
 * mid-line route arrives on after the shared overhang segment, and the
 * one landing in this fixture that has a visible alternative on BOTH
 * sides of it:
 *
 *   land short / land long — the marked patch is 3 tiles of a 8-tile
 *       catwalk, so a jump made off the roof lip clears it entirely.
 *       That is the "redirect in the air" answer, and it costs nothing
 *       but commitment;
 *   post-high (the tier above) — the reroute that also happens to be
 *       where the tripod is standing: going up is the answer that lets
 *       you shoot back (its body sits exactly on the standing firing
 *       line of its own catwalk, asserted, so a level shot from post-high
 *       center-punches it — the CP2 aim-gap lesson applied at authoring
 *       time);
 *   post-low (the floor below) — free in the teach stage, and exactly
 *       what the combination stage prices: DESIGN's combine column for
 *       this enemy is "hound punishes a panicked return to the floor",
 *       so the judged hound-rejoin beat patrols that floor verbatim.
 *
 * The tripod itself stands on the post-high catwalk, five tiles past the
 * zone it bombards: close enough that the pod's whole arc and the mark
 * are on screen together at the FAR default (asserted against the
 * fixture's own follow lead), far enough that a player standing IN the
 * marked zone cannot answer it with a level shot.                      */
const MORTAR_POST_BEAT = {
  id: 'mortar-post', kind: 'mortar', contests: 'mid-catwalk', owns: 'post-mid',
  mount: 'platform:post-high', deck: 8.35, x: 64.6, dir: -1, delayMs: 0,
  // the authored landing denial: the middle of the post-mid strip, with the
  // arrival end and the run-out end both left standing (asserted)
  zone: { x: 59.5, y: 5.35, surface: 'platform:post-mid' },
};

export const MORTAR_TRIAL = {
  id: 'mortar-trial-v1',
  stages: {
    // teach: ONE mortar and nothing else. lob → mark → delay → detonation has
    // to be attributable before anything contests the answers to it, so every
    // point of bot damage in this stage is the blast.
    solo: {
      id: 'solo', label: 'MORTAR SOLO', compose: 'replace',
      enemies: [MORTAR_POST_BEAT],
    },
    // combine (exactly two bodies): DESIGN's own combination for this enemy.
    // The mortar denies the mid landing and the judged hound-2.5 rejoin beat
    // patrols the floor directly beneath it — the panicked drop is the one
    // answer that now costs. The hound row is verbatim from the polyp trial
    // (same station, span, and owned connector), so the combination tests the
    // MORTAR, not a new hound placement.
    combo: {
      id: 'combo', label: 'MORTAR + HOUND', compose: 'replace',
      enemies: [
        MORTAR_POST_BEAT,
        { id: 'hound-rejoin', kind: 'hound', contests: 'lower-service', owns: 'post-low',
          deck: 3, x: 60.2, dir: -1, delayMs: 400, patrol: { x0: 57.8, x1: 60.6 } },
      ],
    },
  },
};

export function mortarTrialStage(name) {
  return (name && MORTAR_TRIAL.stages[name]) || null;
}

// One authored stage's rows with spawn heights derived per kind, the same
// contract the hound and polyp rows use: a hound rides its deck, a tripod
// plants its body on it. Rows without a deck pass through untouched.
function mortarStageRows(stage, cfg) {
  return stage.enemies.map(function (e) {
    if (e.deck === undefined) return { ...e };
    const ride = e.kind === 'mortar' ? cfg.mortar.bodyY : cfg.hound.rideY;
    return { ...e, y: e.deck + ride };
  });
}

/* Composes the mortar stage onto whatever plan already resolved (the pace's
   own list, optionally composed with the hound and polyp trials). With no
   ?mortar= the base array is returned UNCHANGED — same reference, so every
   ordinary URL keeps a byte-identical plan and the existing identity
   assertions still hold. */
export function mortarComposePlan(baseRows, stageName, cfg = CONFIG) {
  const stage = mortarTrialStage(stageName);
  if (!stage) return baseRows;
  const authored = mortarStageRows(stage, cfg);
  return stage.compose === 'add'
    ? (baseRows || []).map(function (e) { return { ...e }; }).concat(authored)
    : authored;
}
