/* ===================== ENTITIES: HOSTILES ========================= */
/* Kinds: wasp drone, carrier, houndframe, polyp turret, spore mortar —
   DESIGN's whole enemy-role table, one ENEMY row + one branch each. */

import { CONFIG } from '../config.js';
import { mulberry32 } from '../pure/rng.js';
import { genomeHas, rollEnemyGenome } from '../pure/genome.js';
import { BEND_S, crossesBend } from '../pure/path.js';
import {
  polypBeamHitsRect, polypBeamReach, polypBendClampRange,
} from '../pure/polyp.js';
import { mortarArmed, mortarBlastHitsRect } from '../pure/mortar.js';
import {
  diveVelocity, diveLaunched, squadReady, WASP_DIVE_LOCK_MS, WASP_SQUAD_STAGGER_MS,
} from '../pure/wasp.js';
import { TRANSFORM_BEND_S } from '../pure/transform.js';
import { IS_TRANSFORM_SLICE } from '../mode.js';
import { view } from './bridge.js';
import { gameMs, approach } from './time.js';
import { sLeftEdge, sRightEdge } from './edges.js';
import { builtGroundTopAt, builtSolidAt } from './level.js';
import { player, circleHitsPlayer, damagePlayer } from './player.js';
import { weaponKills } from './weapons.js';
import { dropFromCarrier } from './capsules.js';
import { consumeLaunchShock, scoreKill } from './score.js';
import { activeCorner, gateActive, onHostileRemoved } from './wavegate.js';
import {
  beginCrosswind, beginRebound, ecologyMechanic, enemyHasTactic,
  makeEnemyEcologyFields, markReboundCharge, markReboundRecovery,
  resetReboundCycle, settleRebound,
  updateAircomb, updateCrosswind, updateEnemyTacticHazards, updateRebound,
  updateSweepfan,
} from './ecology-tactics.js';
import { ENEMY_TACTICS, resolveEnemyEcology } from '../pure/enemy-ecology.js';

export const hostiles = [];
export let kills = 0;
let hostileRng = mulberry32(5150);          // seeded: sim randomness is reproducible
let nextWaspId = 1;
let evolutionSerial = 0;                    // alternating pincer side; reset with each roster
let genomeSerial = 0;                       // deterministic spawn identity; reset with each roster
// The whole wasp squad's shared "last dive committed" clock (src/pure/wasp.js
// squadReady) — deliberately NOT per-hostile, so it orders distinct wasps'
// first commitments into a sequence instead of gating any one drone's own
// diveCooldownMs. Reset alongside every other piece of hostile state below.
let lastWaspLockMs = -Infinity;

// Gate-prelude cohorts may finish materializing before every member is free
// to arm its attack. The delay is relative to `enterUntil`, so the elastic
// gate-score pull keeps entrance and readiness together without a second
// mutable deadline. A staged body is still an ordinary shootable hostile.
export function hostileAttackReady(e, nowMs = gameMs) {
  return nowMs >= e.enterUntil + (e.attackReadyDelayMs || 0);
}

function clampLead(value, cap) {
  return Math.max(-cap, Math.min(cap, value));
}

// Per-kind stats resolved once at spawn — the roster pass adds kinds as rows
// here, not as ternaries at every use site. `gating: false` kinds never hold
// a wave gate closed (a slow hauler or future stationary emplacement parked
// near a corner must not deadlock the ritual). The matching geometry and
// colors are a render table in src/render/hostiles.js, keyed by the same kind.
export const ENEMY = {
  wasp:    { hp: CONFIG.wasp.hp,
             hitR: CONFIG.wasp.contactRadius, gating: true },
  carrier: { hp: CONFIG.carrier.hp,
             hitR: CONFIG.carrier.hitRadius, gating: false },
  // A deck unit inside a corner arena is a legitimate gate holder: unlike a
  // slow hauler it cannot drift out of the fight — its prowl is bounded by
  // terrain and its authored patrol span.
  hound:   { hp: CONFIG.hound.hp,
             hitR: CONFIG.hound.hitRadius, gating: true, start: 'prowl' },
  // Ambient rooted emplacements are non-gating: one left behind may never
  // deadlock a later ritual. Gate-authored copies opt in per row and cycle
  // automatically so their vulnerable opening is always available.
  polyp:   { hp: CONFIG.polyp.hp,
             hitR: CONFIG.polyp.hitRadius, gating: false, start: 'closed' },
  // The other rooted emplacement: a tripod bombarding an authored landing
  // zone. Non-gating for the same reason the polyp is — it cannot leave a
  // corner arena, so it must never be able to hold one closed.
  mortar:  { hp: CONFIG.mortar.hp,
             hitR: CONFIG.mortar.hitRadius, gating: false, start: 'aim' },
  // Summit-only Crown machinery. It is rooted to the apron and never holds
  // an ordinary corner gate; finale.js owns whether its destruction clears
  // the encounter.
  warden:  { hp: CONFIG.warden.hp,
             hitR: CONFIG.warden.hitRadius, gating: false, start: 'sealed' },
};

// Rooted kinds: `dir` is a FACING resolved at authoring time, never a patrol
// heading, so the corner gate's patrol box must never re-aim one.
const ROOTED = { polyp: true, mortar: true, warden: true };

// While the iris is shut (closed, and through the dilating tell) shots ping
// off the armour: hp only moves in the two OPEN states, so the polyp dies to
// timing and position — "destroy it during an opening" — never to a bigger
// pool. Kept as a lookup so hitHostile stays branch-light.
const POLYP_OPEN = { fire: true, vent: true };

// A sightline may never cross a facet bend (decisions.md entry 7, the same
// rule projectiles carry) — same source list weapons.js uses.
const BENDS = IS_TRANSFORM_SLICE ? TRANSFORM_BEND_S : BEND_S;

const EVOLUTION_MOBILE = Object.freeze({ wasp: true, hound: true });

// Spawn-site classification keeps escalation deterministic without teaching
// the spawner a second enemy table. Finale packets replay the learned response
// ladder (faces 4/5/6) beside the Warden: familiar genes in new combinations,
// never extra HP, and the player's current hull still trims the genome budget.
function evolutionFaceAt(x, row) {
  if (row && row.finaleWave !== undefined)
    return Math.max(4, Math.min(6, 3 + (Number(row.finaleWave) || 1)));
  if (row && row.gateWave !== undefined) return Number(row.gateWave) || 0;
  const P = CONFIG.path;
  return Math.max(1, Math.min(P.faces,
    1 + Math.floor(Math.max(0, x - P.introTiles) / P.faceTiles)));
}

// `row` is the optional authored spawn row this hostile came from. Placement
// and encounter-specific behavior ride on it, and nothing else in the sim
// needs to know which:
//   tune — per-spawn stat overrides (hp, cruiseSpeed, diveRange,
//          diveCooldownMs) authored by a traversal pacing variant, so the same
//          kinds can hold a station, guard a pocket mouth, or press a line
//          without new kinds or new branches;
//   dir / patrol — a houndframe's facing and the ground run it paces.
// Wasp rows remain absent and reproduce CONFIG.wasp behavior exactly.
export function spawnHostile(x, y, delayMs, kind, row, visualId = '') {
  kind = kind || 'wasp';
  const K = ENEMY[kind];
  const T = (row && row.tune) || null;
  const patrol = (row && row.patrol) || null;
  const evolutionFace = kind === 'warden' ? 0 : evolutionFaceAt(x, row);
  const serial = genomeSerial++;
  const genome = kind === 'warden' ? null : rollEnemyGenome({
    kind,
    face: evolutionFace,
    serial,
    spawnKey: row?.id || `${kind}:${x.toFixed(2)}:${serial}`,
    cohortKey: row?.cohortKey,
    cohortSlot: row?.cohortSlot,
    cohortPhase: row?.cohortPhase,
    hpRatio: player.hp / Math.max(1, CONFIG.player.maxHealth),
    kills,
    clearEmaMs: row?.pressureClearEmaMs || 0,
    pressureEvolutionTier: row?.pressureEvolutionTier || 0,
  }, CONFIG.genome.seed);
  const ecologyFields = makeEnemyEcologyFields(kind, row, y, genome);
  // A reviewed body may be selected without buying its recipe. An explicit
  // gameplay ecologyId always owns presentation too (and an invalid one fails
  // closed); otherwise callers may request a kind-checked visual-only body.
  // This string is never read by mechanics, tactics, HP, collision or AI.
  const requestedVisualId = row?.ecologyId
    ? ecologyFields.ecologyId : row?.ecologyVisualId || visualId;
  const ecologyVisualId = resolveEnemyEcology(requestedVisualId, kind)?.id || '';
  const hasMechanic = (id) => genomeHas(genome, id) || ecologyMechanic(ecologyFields, id);
  const aegis = hasMechanic('AEGIS');
  const pincer = hasMechanic('PINCER');
  const formationOrder = pincer ? evolutionSerial++ : 0;
  const formationSide = pincer ? (formationOrder % 2 ? 1 : -1) : 0;
  const formationBand = pincer ? Math.floor(formationOrder / 2) % 3 : 0;
  const e = {
    id: nextWaspId++, kind,
    x, y, baseY: y, vx: 0, vy: 0, dir: (row && row.dir) || -1, t: hostileRng() * 6,
    hp: T && T.hp !== undefined ? T.hp : K.hp, hitR: K.hitR,
    maxHp: T && T.hp !== undefined ? T.hp : K.hp,
    genome,
    genomeId: genome?.id || '',
    genomeLabel: genome?.label || kind.toUpperCase(),
    strainId: genome?.strain?.id || '',
    genomeBudget: genome?.expressedBudget || 0,
    wardPolicy: genome?.alleles?.wardPolicy || 'ANCHOR',
    salvoPattern: ecologyFields.ecology?.salvoPattern || genome?.alleles?.salvoPattern || 'LEAD',
    bulwark: hasMechanic('BULWARK'),
    bulwarkOpenUntil: 0,
    bulwarkPingUntil: 0,
    twinstrike: hasMechanic('TWINSTRIKE'),
    twinPassesLeft: 0,
    // Rebound is itself the locomotion decision. A late genome may still
    // carry defense/reactive organs, but VAULT may not silently replace the
    // forward charge whose wall/edge commitment earns the reverse arc.
    vault: hasMechanic('VAULT') &&
      !enemyHasTactic(ecologyFields, ENEMY_TACTICS.REVERSE_VAULT),
    salvo: hasMechanic('SALVO'),
    salvoShotsRemaining: 0,
    relay: hasMechanic('RELAY'),
    relayCycles: 0,
    relayFromDir: (row && row.dir) || -1,
    backlash: hasMechanic('BACKLASH'),
    backlashUntil: 0,
    backlashCoolUntil: 0,
    backlashBurstUntil: 0,
    cruiseSpeed: T && T.cruiseSpeed !== undefined ? T.cruiseSpeed : undefined,
    diveRange: T && T.diveRange !== undefined ? T.diveRange : undefined,
    diveCooldownMs: T && T.diveCooldownMs !== undefined ? T.diveCooldownMs : undefined,
    senseRange: T && T.senseRange !== undefined ? T.senseRange : undefined,
    state: K.start || 'cruise', stateUntil: 0, diveCdUntil: 0,
    // Encounter identity is runtime bookkeeping only. It lets a pre-positioned
    // gate retain its own survivors at the halt while stale ambient bodies are
    // retired, and gives deterministic proofs one stable ownership key.
    encounterKey: row?.encounterKey || '',
    ecologyBeat: Number.isFinite(row?.ecologyBeat) ? row.ecologyBeat : -1,
    ecologyBeatSlot: Number.isFinite(row?.ecologyBeatSlot) ? row.ecologyBeatSlot : -1,
    ecologyStageRole: row?.ecologyStageRole || '',
    ecologyMode: row?.ecologyMode || '',
    ecologyStageResolved: !!row?.ecologyStageResolved,
    ecologyPlacementFallback: !!row?.ecologyPlacementFallback,
    ecologyVisualId,
    attackReadyDelayMs: Math.max(0, Number(row?.attackReadyDelayMs) || 0),
    ...ecologyFields,
    tellLocked: false,
    // Late-route traits stack on the ordinary body and never modify HP.
    // A pincer wasp may also be linked to an Aegis projector; these fields
    // are the complete sim→render/debug contract for that composition.
    evolutionFace,
    aegis,
    aegisActive: false,
    aegisPingUntil: 0,
    pincer,
    formationSide,
    formationBand,
    formationReady: !pincer,
    wardedBy: 0,
    wardSourceX: 0,
    wardSourceY: 0,
    wardPingUntil: 0,
    blockedHits: 0,
    // wasp dive aim-lock: the frame a committed dive may actually start
    // moving (src/pure/wasp.js WASP_DIVE_LOCK_MS). Unused by every other
    // kind — each keeps its own tell inside its own state machine.
    lockUntil: 0,
    // Whether this body holds a corner's wave gate closed. Per KIND by
    // default (the table above), but a row may opt out — and the six-face
    // run's ambient houndframe stations do (T-009, src/pure/lattice.js).
    // The reasoning is the same one that makes the carrier non-gating: a
    // gate is cleared by killing its WAVE, and a straggler may only hold it
    // if it can actually join the fight. A wasp always flies to you; a
    // ground unit bounded by terrain and a 3-column patrol cannot, so a
    // station left alive half a face back would hold the ritual shut with
    // nothing on screen to shoot. Authored gate rows opt in only for bodies
    // deliberately placed inside the held arena; fixture rows stay unchanged.
    gating: row && row.gating !== undefined ? row.gating : K.gating,
    // Gate-authored polyps cycle their warning even if RIG entered above or
    // behind the barrel. Ambient/fixture polyps keep the sightline-triggered
    // behavior; this flag exists only to guarantee a vent opening for a body
    // deliberately allowed to hold a corner ritual shut.
    autoCycle: !!(row && row.autoCycle),
    gateBreakExit: false,
    // Campaign carriers carry a phase-authored reward. Keeping the payload on
    // the body means missing one hauler cannot shift every later face's drop.
    drop: row && row.drop ? { ...row.drop } : null,
    patrolX0: patrol ? patrol.x0 : -Infinity,
    patrolX1: patrol ? patrol.x1 : Infinity,
    // a raised-surface hound rides the top of an authored solid instead of the
    // ground run; cleared if it ever tumbles down onto the deck below
    deckY: row && row.surface === 'solid-top' ? row.deck : undefined,
    // polyp beam state: live reach in tiles (0 unless firing), and the bend
    // clamp on its sightline — a constant per rooted barrel, resolved once
    beamReach: 0,
    sightClamp: kind === 'polyp'
      ? polypBendClampRange(
          x + ((row && row.dir) || -1) * CONFIG.polyp.barrelTiles,
          (row && row.dir) || -1, CONFIG.polyp.sightRange, BENDS)
      : 0,
    // A Relay iris alternates between two authored straight sightlines. Both
    // bend clamps are resolved at spawn; the barrel still never sees or fires
    // around a corner, whichever direction its visible hinge selects.
    sightClampNeg: kind === 'polyp'
      ? polypBendClampRange(x - CONFIG.polyp.barrelTiles,
          -1, CONFIG.polyp.sightRange, BENDS)
      : 0,
    sightClampPos: kind === 'polyp'
      ? polypBendClampRange(x + CONFIG.polyp.barrelTiles,
          1, CONFIG.polyp.sightRange, BENDS)
      : 0,
    // mortar bombardment state: the AUTHORED landing zone it denies (a place,
    // never a moving target — decisions.md entry 6) and the pod's 0…1 flight
    // progress, which the render layer replays through the same pure arc.
    zoneX: row && row.zone ? row.zone.x : 0,
    zoneY: row && row.zone ? row.zone.y : 0,
    zoneHomeX: row && row.zone ? row.zone.x : 0,
    zoneHomeY: row && row.zone ? row.zone.y : 0,
    podU: 0,
    // Crown Warden state. Kept on every row so the hot update/render paths
    // remain shape-stable; only kind=warden reads these values.
    wardenCycle: 0,
    windowDamage: 0,
    earnedDamage: 0,
    openedAt: 0,
    combo: false,
    armorPingUntil: 0,
    coreHitUntil: 0,
    arenaX0: row && row.arena ? row.arena.x0 : 0,
    arenaX1: row && row.arena ? row.arena.x1 : 0,
    // Projectile traits may punch a surviving mobile body briefly out of its
    // authored rhythm. These are separate from vx/vy: a wasp's committed aim
    // vector and a hound's charge velocity must remain immutable promises.
    staggerUntil: 0,
    recoilVx: 0,
    recoilVy: 0,
    enterUntil: gameMs + (delayMs || 0) + CONFIG.wasp.enterMs,
    flashUntil: 0,
  };
  hostiles.push(e);
  view.hostiles.spawned(e);      // render: mesh, hidden until materialization begins
}

function aegisOnline(e) {
  if (!e.aegis || !hostileAttackReady(e) || e.gateBreakExit) return false;
  const age = Math.max(0, gameMs - e.enterUntil);
  return age % CONFIG.evolution.aegisCycleMs < CONFIG.evolution.aegisActiveMs;
}

// Every policy operates inside the same visible radius and link cap. The
// painted projector and its live packet line expose the result before a shot
// is blocked: strains change squad topology, never shield strength.
function wardCandidateScore(anchor, candidate, slot, anchorD2) {
  if (anchor.wardPolicy === 'SPEAR') {
    const dx = candidate.x - player.x;
    const dy = candidate.y - (player.y + player.h * 0.5);
    return dx * dx + dy * dy + anchorD2 * 0.04;
  }
  if (anchor.wardPolicy === 'ECHELON') {
    // Low / high / middle claims make a visible ladder rather than three
    // overlapping rings. Distance remains the tie-break and radius fence.
    const band = slot === 0 ? player.y + 1.1
      : slot === 1 ? player.y + 6.2 : player.y + 3.6;
    const dy = candidate.y - band;
    return dy * dy + anchorD2 * 0.04;
  }
  return anchorD2; // BASTION: tight shell around the priority source
}

// Each active projector claims at most three mobile bodies on its own facet.
// No allocation and no global damage multiplier: destroy the clearly marked
// projector, wait for its recharge gap, or prioritize an unlinked threat.
// Multiple projectors never pile onto the same target.
function syncEvolutionLinks() {
  for (const e of hostiles) {
    e.wardedBy = 0;
    e.aegisActive = aegisOnline(e);
  }
  const E = CONFIG.evolution;
  const radius2 = E.aegisRadius * E.aegisRadius;
  for (const anchor of hostiles) {
    if (!anchor.aegisActive) continue;
    for (let slot = 0; slot < E.aegisMaxLinks; slot++) {
      let best = null;
      let bestScore = Infinity;
      for (const candidate of hostiles) {
        if (candidate === anchor || candidate.wardedBy || !EVOLUTION_MOBILE[candidate.kind] ||
            gameMs < candidate.enterUntil || candidate.gateBreakExit ||
            crossesBend(BENDS, anchor.x, candidate.x)) continue;
        const dx = candidate.x - anchor.x;
        const dy = candidate.y - anchor.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > radius2) continue;
        const score = wardCandidateScore(anchor, candidate, slot, d2);
        if (score >= bestScore) continue;
        best = candidate;
        bestScore = score;
      }
      if (!best) break;
      best.wardedBy = anchor.id;
      best.wardSourceX = anchor.x;
      best.wardSourceY = anchor.y;
    }
  }
}

function activeWardAnchor(e) {
  if (!e?.wardedBy) return null;
  const anchor = hostiles.find((other) => other.id === e.wardedBy);
  if (!anchor || !anchor.aegisActive || crossesBend(BENDS, anchor.x, e.x)) return null;
  const dx = e.x - anchor.x;
  const dy = e.y - anchor.y;
  return dx * dx + dy * dy <= CONFIG.evolution.aegisRadius ** 2 ? anchor : null;
}

function bulwarkFacesImpact(e, approachX) {
  // Projectiles pay the plate they ACTUALLY approach. This matters for a
  // homing dart that loops behind its target and for a phase/fork shot fired
  // while RIG has already crossed past: using player.x made the shield block
  // from the wrong side. Non-projectile damage keeps the prior player-facing
  // answer; a truly vertical projectile bypasses a horizontal face plate.
  const projectile = Number.isFinite(approachX);
  const incomingSide = projectile
    ? -Math.sign(approachX)
    : (Math.sign(player.x - e.x) || -e.dir);
  if (!incomingSide) return false;
  return incomingSide === e.dir;
}

export function removeHostile(idx, fade) {  // single removal path: gates count every exit
  const e = hostiles[idx];
  view.hostiles.removed(e, fade);        // render: dissolve as a corpse, or drop the mesh
  hostiles.splice(idx, 1);
  onHostileRemoved();
}

function destroyHostile(e, idx, weapon) {
  kills++;
  if (weaponKills[weapon] !== undefined) weaponKills[weapon]++;
  // the one death path, so one score event per death however it died
  scoreKill(e.kind, weapon, {
    grounded: player.grounded, vy: player.vy, x: e.x, y: e.y,
  });
  if (e.kind === 'carrier') dropFromCarrier(e.x, e.y, e.drop);
  removeHostile(idx, true);
}

export function hitHostile(e, idx, damage, weapon, approachX = null) {
  // Crown Aegis is a relationship, not bonus HP. The target's own body does
  // not flash as if wounded; its local shield and the source projector flare
  // together, teaching target priority with one honest spatial sentence.
  const ward = activeWardAnchor(e);
  if (ward) {
    e.wardPingUntil = gameMs + CONFIG.evolution.wardPingMs;
    ward.aegisPingUntil = gameMs + CONFIG.evolution.wardPingMs;
    e.blockedHits++;
    return false;
  }
  // A Bulwark is a facing decision, not armour points. The first frontal
  // impact kicks its visible plates apart for a generous opening; crossing
  // behind it avoids the block entirely. An Aegis source can never also roll
  // Bulwark (pure/genome.js), so target-priority answers stay immediate.
  if (e.bulwark && gameMs >= e.bulwarkOpenUntil && bulwarkFacesImpact(e, approachX)) {
    e.bulwarkOpenUntil = gameMs + CONFIG.genome.bulwarkOpenMs;
    e.bulwarkPingUntil = gameMs + CONFIG.genome.bulwarkPingMs;
    e.blockedHits++;
    return false;
  }
  // Iris armour: every damage path (bullets, launch shock, whatever comes
  // later) flows through here, so every one of them respects the shell. The
  // short ping flash is the feedback that a shot bounced rather than wounded.
  // An online Aegis source must remain the immediate answer to the shields it
  // is projecting. The projector forces a Polyp's iris open while online;
  // otherwise the ordinary closed/tell shell would make the priority source
  // invulnerable for most of the same window in which it protects the squad.
  // Its normal armour returns during the Aegis recharge gap.
  if (e.kind === 'polyp' && !POLYP_OPEN[e.state] && !e.aegisActive) {
    e.flashUntil = gameMs + 40;
    return false;
  }
  // The Warden's shutters are spatial attack beats, not an invisible damage
  // reduction. Closed hits spark only at the iris; open hits drain one armour
  // seal, capped so a screenful of homing darts cannot skip the next pattern.
  if (e.kind === 'warden') {
    if (e.state !== 'exposed') {
      e.armorPingUntil = gameMs + 85;
      return false;
    }
    const room = Math.max(0, CONFIG.warden.windowDamage - e.windowDamage);
    const dealt = Math.min(Math.max(0, damage), room, e.hp);
    if (dealt <= 0) {
      e.armorPingUntil = gameMs + 65;
      return false;
    }
    e.hp -= dealt;
    e.windowDamage += dealt;
    e.earnedDamage += dealt;
    e.coreHitUntil = gameMs + 90;         // local iris pop; the body never strobes
  } else {
    e.hp -= damage;
    e.flashUntil = gameMs + 70;
  }
  if (e.hp > 0 && e.backlash && hostileAttackReady(e) &&
      !e.backlashUntil && gameMs >= e.backlashCoolUntil) {
    e.backlashUntil = gameMs + CONFIG.genome.backlashTellMs;
    e.backlashCoolUntil = e.backlashUntil + CONFIG.genome.backlashCooldownMs;
  }
  if (e.hp <= 0) {
    destroyHostile(e, idx, weapon);
  }
  return true;
}

// Child-friendly finale release. The timeout still breaks the SAME target
// through the SAME death path before transmission; it never awards a weapon
// favorite and can never turn survival time directly into victory.
export function forceBreakHostile(e, weapon = 'CROWN') {
  const idx = hostiles.indexOf(e);
  if (idx < 0) return false;
  e.hp = 0;
  e.coreHitUntil = gameMs + 90;
  destroyHostile(e, idx, weapon);
  return true;
}

export function wardenStage(e) {
  if (!e || e.kind !== 'warden') return 0;
  const spent = Math.max(0, e.maxHp - e.hp);
  return Math.min(3, 1 + Math.floor(spent / (e.maxHp / 3)));
}

// HEAVY rounds and VOLATILE shockwaves use one bounded physical response.
// Rooted denial pieces never slide off their authored lane, and a launched
// dive/charge never loses its commitment. Everything else can be knocked a
// fraction of a tile and held for a readable beat, giving rolled guns a
// mechanical identity without turning common bodies into ragdolls.
export function staggerHostile(e, dirX, dirY, force, stunMs) {
  if (!e || ROOTED[e.kind] || gameMs < e.enterUntil || force <= 0 || stunMs <= 0)
    return false;
  if (activeWardAnchor(e)) return false;
  if ((e.kind === 'hound' && (e.state === 'charge' || e.state === 'vault' ||
        e.state === 'tumble' || e.state === 'reboundTell' || e.state === 'reboundVault')) ||
      (e.kind === 'wasp' && ((e.state === 'dive' && gameMs >= e.lockUntil) ||
        e.state === 'crosswindBurst')))
    return false;
  const n = Math.hypot(dirX, dirY) || 1;
  const cap = 7.5;
  e.recoilVx = Math.max(-cap, Math.min(cap, e.recoilVx + dirX / n * force));
  e.recoilVy = e.kind === 'hound'
    ? 0
    : Math.max(-cap, Math.min(cap, e.recoilVy + dirY / n * force * 0.65));
  const prior = Math.max(gameMs, e.staggerUntil);
  const next = Math.min(gameMs + 180, prior + stunMs);
  if ((e.kind === 'hound' || e.state === 'crosswindTell' || e.state === 'crosswindRecover') &&
      e.stateUntil > gameMs) {
    const extension = next - prior;
    e.stateUntil += extension;
    if (e.tacticUntil > gameMs) e.tacticUntil += extension;
  }
  e.staggerUntil = next;
  return true;
}

/* ------------------------- HOUNDFRAME ------------------------------ *
 * Spatial job: make a floor route temporarily unsafe with a committed
 * charge. It paces its plate (prowl), plants and telegraphs when the player
 * enters its lane (tell), then commits to a charge it cannot re-aim, and
 * pants afterwards (skid) so the lane goes safe again in a readable rhythm.
 *
 * Terrain is honoured on both sides of that commitment, which is what makes
 * topology an answer: a PROWLING hound turns at deck edges, tall steps, and
 * walls — it never walks itself off the level — while a CHARGING one only
 * mounts steps up to stepUpTiles, skids off anything taller, and runs
 * straight off a deck edge into a tumble. Lead a charge at a gap and the
 * hound removes itself. Deck-hugging follow is the flame crawler's pattern
 * (src/sim/weapons.js); like the crawler, hounds ride SOLID surfaces only —
 * one-way catwalks are grating and carry no frames. An authored row may name
 * a raised solid top (`surface: 'solid-top'`) instead of the ground run, which
 * is how a roof becomes a patrolled lane; a roof runner that charges off its
 * edge tumbles to the deck below and hunts on from there.
 *
 * Counterplay is always a movement verb, never a damage race: the charge is
 * faster than any run tune (you cannot retreat), it commits before it can
 * re-aim (you can be somewhere else), and the prowl is slow enough to get
 * behind. Fairness of the telegraph vs. the player's jump physics is
 * asserted in tools/pathcheck.mjs.                                       */

function houndInLane(e, H) {
  const dy = player.y - e.y;
  const sense = e.senseRange !== undefined ? e.senseRange : H.senseRange;
  return Math.abs(player.x - e.x) < sense &&
    dy > -H.laneBelow && dy < H.laneAbove;
}

function houndAimDir(e, H) {
  const lead = clampLead(player.vx * H.predictMs / 1000, H.predictXCap);
  return Math.sign(player.x + lead - e.x) || e.dir;
}

// The surface under a hound. Ground runners read the terrain; a raised-surface
// runner holds its authored plate for exactly as long as there is solid tile
// beneath it, which is what makes a roof a lane with edges rather than a floor.
function houndDeckAt(e, x) {
  if (e.deckY === undefined) return builtGroundTopAt(x);
  return builtSolidAt(x, e.deckY - 0.5) ? e.deckY : -999;
}

// true when the deck ahead cannot be walked onto: no plate, too tall a step,
// or a wall at body height. Shared by the prowl (turns) and the charge (skids).
function houndBlockedAhead(e, H, deckAhead) {
  return deckAhead > e.y - H.rideY + H.stepUpTiles ||
    builtSolidAt(e.x + e.dir * H.probeX, e.y + H.wallProbeY);
}

function houndSkid(e, H, intoWall) {
  e.state = 'skid';
  e.stateUntil = gameMs + H.skidMs;
  e.diveCdUntil = gameMs + H.chargeCooldownMs;   // shared cooldown field: pant window
  if (intoWall) { e.vx = 0; e.dir = -e.dir; }    // impact: stop dead, turn around
  else e.vx = e.dir * H.chargeSpeed;             // run-out: slide to a stop
  markReboundRecovery(e, intoWall ? 'wall-recover' : 'landing-recover');
}

function updateHound(e, dt) {
  const H = CONFIG.hound;
  const G = CONFIG.genome;

  if (e.state === 'tumble') {                    // committed off an edge: no steering
    e.vy = Math.max(H.fallTerminal, e.vy + H.fallGravity * dt);
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    const landing = builtGroundTopAt(e.x);      // always the ground: a roof runner
    if (landing > -100 && e.y <= landing + H.rideY) {  //   that overcommits comes down
      e.y = landing + H.rideY;                 //   and keeps hunting on the deck
      e.vy = 0;
      e.deckY = undefined;
      houndSkid(e, H, true);                     // picks itself up on the lower deck
    }
    return;
  }

  // Rebound pays for its return arc with an ordinary committed charge into a
  // real edge/wall. The new states are opt-in; every unlabelled hound skips
  // this helper and stays on the exact shipped branch below.
  const rebound = updateRebound(e, dt);
  if (rebound) {
    if (rebound === 'wall') houndSkid(e, H, true);
    else if (rebound === 'land') houndSkid(e, H, false);
    else if (rebound === 'tumble') {
      e.state = 'tumble';
      e.diveCdUntil = gameMs + H.chargeCooldownMs;
    }
    return;
  }

  if (e.state === 'vault') {                    // infected locomotion: one frozen arc
    const steps = Math.min(H.substeps, Math.max(1,
      Math.ceil(Math.hypot(e.vx, e.vy) * dt / 0.45)));
    const sdt = dt / steps;
    for (let k = 0; k < steps; k++) {
      e.vy += G.vaultGravity * sdt;
      e.x += e.vx * sdt;
      e.y += e.vy * sdt;
      if (gameMs >= e.enterUntil && circleHitsPlayer(e.x, e.y, e.hitR))
        damagePlayer(1, e.x);
      if (builtSolidAt(e.x + e.dir * H.probeX * 0.35, e.y)) {
        houndSkid(e, H, true);
        return;
      }
      let landing = houndDeckAt(e, e.x);
      if (landing < -100) {
        e.deckY = undefined;
        landing = builtGroundTopAt(e.x);
      }
      if (e.vy <= 0 && landing > -100 && e.y <= landing + H.rideY) {
        e.y = landing + H.rideY;
        e.vy = 0;
        houndSkid(e, H, false);
        return;
      }
    }
    if (gameMs >= e.stateUntil) {
      e.state = 'tumble'; // an absent landing makes the committed vault cost
      e.diveCdUntil = gameMs + H.chargeCooldownMs;
    }
    return;
  }

  const deck = houndDeckAt(e, e.x);
  if (deck > -100) e.y = approach(e.y, deck + H.rideY, H.hugRate * dt);

  if (e.state === 'prowl') {
    const deckAhead = houndDeckAt(e, e.x + e.dir * H.probeX);
    if (deckAhead < -100 || houndBlockedAhead(e, H, deckAhead) ||
        (e.dir < 0 && e.x <= e.patrolX0) || (e.dir > 0 && e.x >= e.patrolX1)) {
      e.dir = -e.dir;                            // pacing turn: never a self-inflicted fall
    } else {
      e.x += e.dir * H.prowlSpeed * dt;
    }
    if (hostileAttackReady(e) && gameMs >= e.diveCdUntil && houndInLane(e, H)) {
      e.dir = houndAimDir(e, H);
      // never telegraph nose-to-wall: a charge with nowhere to go would be an
      // unreadable tell-skid stutter, so it keeps pacing and turns instead
      const facing = houndDeckAt(e, e.x + e.dir * H.probeX);
      if (facing > -100 && !houndBlockedAhead(e, H, facing)) {
        e.state = 'tell';
        e.stateUntil = gameMs + H.tellMs;
        e.tellLocked = false;
        resetReboundCycle(e);
      }
    }
    return;
  }

  if (e.state === 'tell') {                      // planted: the whole window is pre-commitment
    // Track the player's projected ground line during the quiet part of the
    // wind-up, then freeze for the final local coil. Dodging the onset no
    // longer solves the whole attack, but the committed direction is still
    // honest before the hitbox starts moving.
    if (!e.tellLocked) {
      e.dir = houndAimDir(e, H);
      if (e.stateUntil - gameMs <= H.aimLockMs) e.tellLocked = true;
    }
    e.x -= e.dir * (H.tellBackTiles / (H.tellMs / 1000)) * dt;   // rears back, visibly
    if (gameMs >= e.stateUntil) {
      if (e.vault) {
        e.state = 'vault';
        e.stateUntil = gameMs + G.vaultMs;
        e.vx = e.dir * G.vaultSpeed;
        e.vy = G.vaultLift;                       // locked here: one ballistic arc
      } else {
        e.state = 'charge';
        e.stateUntil = gameMs + H.chargeMs;
        e.vx = e.dir * H.chargeSpeed;             // locked here: a charge never re-aims
        markReboundCharge(e);
      }
    }
    return;
  }

  if (e.state === 'charge') {
    // Substepped for the same reason projectiles are: a clamped 50 ms frame
    // moves the charge 0.78 tiles, far enough to skip the terrain probe or
    // tunnel through the player between endpoint tests.
    const steps = Math.min(H.substeps, Math.max(1, Math.ceil(Math.abs(e.vx) * dt / 0.45)));
    const sdt = dt / steps;
    for (let k = 0; k < steps; k++) {
      const priorX = e.x;
      e.x += e.vx * sdt;
      const under = houndDeckAt(e, e.x);
      if (under > -100) e.y = approach(e.y, under + H.rideY, H.hugRate * sdt);
      if (gameMs >= e.enterUntil && circleHitsPlayer(e.x, e.y, e.hitR)) damagePlayer(1, e.x);
      const deckAhead = houndDeckAt(e, e.x + e.dir * H.probeX);
      if (deckAhead < -100) {                    // ran out of deck — commitment costs
        if (beginRebound(e)) { e.x = priorX; return; }
        e.state = 'tumble';
        e.vy = 0;
        e.diveCdUntil = gameMs + H.chargeCooldownMs;
        return;
      }
      if (houndBlockedAhead(e, H, deckAhead)) {
        if (!beginRebound(e)) houndSkid(e, H, true);
        return;
      }
    }
    if (gameMs >= e.stateUntil) houndSkid(e, H, false);
    return;
  }

  e.vx = approach(e.vx, 0, H.chargeSpeed * 4 * dt);   // skid: the lane is briefly safe
  e.x += e.vx * dt;
  if (gameMs >= e.stateUntil) {
    e.state = 'prowl'; e.vx = 0;
    settleRebound(e);
  }
}

/* ------------------------- IRIS POLYP ------------------------------ *
 * Spatial job: lock a connector's SIGHTLINE and create target priority. It
 * is rooted — it never moves, never re-aims, and its side-facing barrel
 * owns exactly one lane — so the whole enemy is a rhythm over that lane:
 *
 *   closed — iris shut, armoured, lane free. Senses with the SAME predicate
 *            the beam damages with (pure/polyp.js), so a tell only ever
 *            starts when the beam would already be touching the player:
 *            behind cover, behind the barrel, on the tier above or the deck
 *            below, it stays dormant and is simply bypassed.
 *   tell   — the iris dilates for the whole reaction window, still
 *            armoured. Commitment is total: the beam will fire down the
 *            authored lane whether or not anyone is still standing in it.
 *   fire   — the beam holds the lane. Reach is re-marched every frame so
 *            cover keeps working mid-volley, and it is clamped at facet
 *            bends (entry 7: sightlines do not turn corners).
 *   vent   — open, spent, vulnerable: the authored opening. One vent window
 *            of rifle fire kills it (asserted), so destroying it is a
 *            timing decision, not a damage race.
 *
 * Counterplay is positional, never statistical: leave the lane (jump above
 * the band, drop below it, step behind cover), reroute a tier up or down,
 * or bait the volley and spend the opening. Fairness of the tell versus the
 * player's escape physics is asserted in tools/pathcheck.mjs.            */

function polypReachNow(e, PP) {
  return polypBeamReach(e.x + e.dir * PP.barrelTiles, e.y, e.dir,
    e.sightClamp, builtSolidAt, PP.beamStepTiles);
}

function polypBeamOnPlayer(e, PP, reach) {
  return polypBeamHitsRect(e.x + e.dir * PP.barrelTiles, e.y, e.dir, reach,
    PP.beamHalf, player.x - player.hw, player.x + player.hw,
    player.y, player.y + player.h);
}

function polypBeamOnProjectedPlayer(e, PP, reach) {
  const leadSec = PP.anticipateMs / 1000;
  const dx = clampLead(player.vx * leadSec, PP.predictXCap);
  const dy = clampLead(player.vy * leadSec, PP.predictYCap);
  return polypBeamHitsRect(e.x + e.dir * PP.barrelTiles, e.y, e.dir, reach,
    PP.beamHalf, player.x + dx - player.hw, player.x + dx + player.hw,
    player.y + dy, player.y + dy + player.h);
}

function updatePolyp(e) {
  const PP = CONFIG.polyp;
  if (gameMs < e.enterUntil) return;             // materializing: no senses, no beam
  if (updateSweepfan(e, hostileAttackReady(e))) return;
  if (e.state === 'relay') {
    if (gameMs >= e.stateUntil) {
      e.dir = -e.relayFromDir;
      e.sightClamp = e.dir < 0 ? e.sightClampNeg : e.sightClampPos;
      e.relayCycles++;
      e.state = 'closed';
      e.diveCdUntil = gameMs + PP.cooldownMs;
    }
    return;
  }
  if (e.state === 'closed') {
    if (!hostileAttackReady(e) || gameMs < e.diveCdUntil) return;
                                                // shared cooldown field: iris rearming
    const reach = polypReachNow(e, PP);
    if (e.autoCycle || polypBeamOnPlayer(e, PP, reach) ||
        polypBeamOnProjectedPlayer(e, PP, reach)) {
      e.state = 'tell';
      e.stateUntil = gameMs + PP.tellMs;
    }
    return;
  }
  if (e.state === 'tell') {
    if (gameMs >= e.stateUntil) {                // committed: the lane, not the player
      e.state = 'fire';
      e.stateUntil = gameMs + PP.beamMs;
    }
    return;
  }
  if (e.state === 'fire') {
    e.beamReach = polypReachNow(e, PP);          // live: cover raised mid-volley still blocks
    if (polypBeamOnPlayer(e, PP, e.beamReach)) damagePlayer(1, e.x);
    if (gameMs >= e.stateUntil) {
      e.state = 'vent';
      e.stateUntil = gameMs + PP.ventMs;
      e.beamReach = 0;
    }
    return;
  }
  // vent: the opening — open, vulnerable, not firing
  if (gameMs >= e.stateUntil) {
    if (e.relay) {
      // The renderer turns the painted iris through this harmless state.
      // Direction changes only when the hinge finishes; cooldown and the
      // ordinary full tell are still owed. It alternates, never tracks.
      e.relayFromDir = e.dir;
      e.state = 'relay';
      e.stateUntil = gameMs + CONFIG.genome.relayHingeMs;
      e.beamReach = 0;
    } else {
      e.state = 'closed';
      e.diveCdUntil = gameMs + PP.cooldownMs;
    }
  }
}

/* ------------------------ SPORE MORTAR ----------------------------- *
 * Spatial job: take an intended LANDING ZONE away for a moment, after a
 * warning long enough to answer. It is rooted and it never aims at the
 * player — it bombards an authored patch of catwalk — so the whole enemy
 * is a rhythm over that patch:
 *
 *   aim   — inert, tube stowed, the zone free. Arms when the player comes
 *           within armRange OF THE ZONE (a mortar guards a place, so the
 *           place is what watches), which is inside the fixture's own
 *           follow lead: the first lob always happens on screen.
 *   lob   — the pod is in the air on its authored arc and the zone is
 *           MARKED from the moment it launches (board 07: "marking the
 *           intended landing surface"). Commitment is total — nothing
 *           re-aims a pod — which is exactly what makes redirecting in
 *           the air a real answer instead of a chase.
 *   fuse  — the pod is planted on the mark and the warning blink
 *           accelerates. On its own this window is longer than the
 *           slowest answer to it (asserted per player tune).
 *   burst — the denial: the slab standing on the marked surface is live.
 *           Short enough that a full jump outlasts it, tall enough that
 *           standing in it is never safe.
 *   cool  — reloading. The zone is free again and the tripod is just a
 *           target — one reload window of rifle fire kills it.
 *
 * Counterplay is positional and never statistical: land short of the
 * mark, land long past it, take the tier above (which is where the tripod
 * itself stands, so going up is also how you shoot back), or take the
 * floor below — which is precisely what the combination stage's hound
 * prices. Fairness of the warning versus the player's escape physics is
 * asserted in tools/pathcheck.mjs.                                      */

function updateMortar(e, boundLeft, boundRight) {
  const M = CONFIG.mortar;
  if (gameMs < e.enterUntil) return;             // materializing: no pod, no blast
  if (updateAircomb(e, hostileAttackReady(e), boundLeft, boundRight)) return;
  if (e.state === 'aim') {
    if (hostileAttackReady(e) && mortarArmed(player.x, e.zoneX, M.armRange)) {
      e.salvoShotsRemaining = e.salvo ? 2 : 1;
      e.zoneX = e.zoneHomeX;
      e.zoneY = e.zoneHomeY;
      e.state = 'lob';
      e.stateUntil = gameMs + M.lobMs;
      e.podU = 0;
    }
    return;
  }
  if (e.state === 'lob') {
    e.podU = 1 - Math.max(0, (e.stateUntil - gameMs) / M.lobMs);
    if (gameMs >= e.stateUntil) {
      e.state = 'fuse';
      e.stateUntil = gameMs + M.fuseMs;
      e.podU = 1;                                // planted on the mark
    }
    return;
  }
  if (e.state === 'fuse') {
    if (gameMs >= e.stateUntil) {
      e.state = 'burst';
      e.stateUntil = gameMs + M.burstMs;
    }
    return;
  }
  if (e.state === 'burst') {
    // the one slab predicate, shared with the render mesh and the harness:
    // what is drawn is what denies
    if (mortarBlastHitsRect(e.zoneX, e.zoneY, M.blastHalf, M.blastHeight,
        player.x - player.hw, player.x + player.hw,
        player.y, player.y + player.h)) {
      damagePlayer(1, e.zoneX);
    }
    if (gameMs >= e.stateUntil) {
      if (e.salvo && e.salvoShotsRemaining > 1) {
        e.salvoShotsRemaining--;
        const travelSide = Math.sign(player.vx) || -e.dir || 1;
        const hand = e.genome?.phenotype?.handedness || 1;
        let zoneX = e.salvoPattern === 'BRACKET'
          ? e.zoneHomeX + hand * CONFIG.genome.salvoOffset
          : e.salvoPattern === 'CUTBACK'
            ? player.x - travelSide * CONFIG.genome.salvoOffset
            : player.x + travelSide * CONFIG.genome.salvoOffset;
        let zoneY = builtGroundTopAt(zoneX);
        if (zoneY < -100 || crossesBend(BENDS, e.x, zoneX)) {
          zoneX = e.zoneHomeX;
          zoneY = e.zoneHomeY;
        }
        e.zoneX = zoneX;
        e.zoneY = zoneY;
        e.state = 'lob';                 // a whole second arc+fuse, never a surprise burst
        e.stateUntil = gameMs + M.lobMs;
        e.podU = 0;
        return;
      }
      e.salvoShotsRemaining = 0;
      e.zoneX = e.zoneHomeX;
      e.zoneY = e.zoneHomeY;
      e.state = 'cool';
      e.stateUntil = gameMs + M.coolMs;
      e.podU = 0;
    }
    return;
  }
  // cool: reloading — the lane is free and the emplacement is a target
  if (gameMs >= e.stateUntil) e.state = 'aim';
}

/* ------------------------ CROWN WARDEN ----------------------------- *
 * The Crown itself pushes one armored interlock into the combat plane. Its
 * broad legs/racks are presentation; the central iris is the honest target.
 *
 *   sweepTell -> sweepFire -> exposed
 *   barrageTell -> barrageBurst -> exposed
 *   late seals chain sweep + barrage before opening
 *
 * Nothing tracks after commitment. The sweep names one horizontal lane and
 * is answered by leaving it; the barrage locks one predicted landing patch
 * and is answered by redirecting. The body never blinks as a warning.       */

function clampWardenZone(e, x) {
  return Math.max(e.arenaX0, Math.min(e.arenaX1, x));
}

function beginWardenBarrage(e) {
  const W = CONFIG.warden;
  const lead = clampLead(player.vx * W.predictMs / 1000, W.predictXCap);
  e.zoneX = clampWardenZone(e, player.x + lead);
  e.zoneY = builtGroundTopAt(e.zoneX);
  e.state = 'barrageTell';
  e.stateUntil = gameMs + W.barrageTellMs;
}

function beginWardenAttack(e) {
  const W = CONFIG.warden;
  // Seal 2 introduces the rack alone; later seals combine both learned
  // answers. Deterministic ordering makes the first read teachable.
  if (e.wardenCycle === 1) {
    e.combo = false;
    beginWardenBarrage(e);
  } else {
    e.combo = e.wardenCycle >= 2;
    e.state = 'sweepTell';
    e.stateUntil = gameMs + W.sweepTellMs;
  }
}

function exposeWarden(e) {
  e.state = 'exposed';
  e.openedAt = gameMs;
  e.stateUntil = gameMs + CONFIG.warden.exposedMs;
  e.windowDamage = 0;
  e.beamReach = 0;
}

function wardenSweepHitsPlayer(e, W) {
  const muzzle = e.x + e.dir * W.emitterTiles;
  const x0 = Math.min(muzzle, muzzle + e.dir * W.beamReach);
  const x1 = Math.max(muzzle, muzzle + e.dir * W.beamReach);
  return player.x + player.hw >= x0 && player.x - player.hw <= x1 &&
    player.y + player.h >= e.y - W.beamHalf && player.y <= e.y + W.beamHalf;
}

function wardenBarrageHitsPlayer(e, W) {
  return player.x + player.hw >= e.zoneX - W.barrageHalf &&
    player.x - player.hw <= e.zoneX + W.barrageHalf &&
    player.y + player.h >= e.zoneY && player.y <= e.zoneY + W.barrageHeight;
}

function updateWarden(e) {
  const W = CONFIG.warden;
  if (gameMs < e.enterUntil) return;
  if (e.state === 'sealed') { beginWardenAttack(e); return; }

  if (e.state === 'sweepTell') {
    if (gameMs >= e.stateUntil) {
      e.state = 'sweepFire';
      e.stateUntil = gameMs + W.sweepMs;
      e.beamReach = W.beamReach;
    }
    return;
  }
  if (e.state === 'sweepFire') {
    if (wardenSweepHitsPlayer(e, W)) damagePlayer(1, e.x);
    if (gameMs >= e.stateUntil) {
      e.beamReach = 0;
      if (e.combo) beginWardenBarrage(e); else exposeWarden(e);
    }
    return;
  }
  if (e.state === 'barrageTell') {
    if (gameMs >= e.stateUntil) {
      e.state = 'barrageBurst';
      e.stateUntil = gameMs + W.barrageMs;
    }
    return;
  }
  if (e.state === 'barrageBurst') {
    if (wardenBarrageHitsPlayer(e, W)) damagePlayer(1, e.zoneX);
    if (gameMs >= e.stateUntil) exposeWarden(e);
    return;
  }

  // exposed: the iris is open. A strong roll may spend the whole seal, but
  // the minimum opening holds long enough to make that power legible.
  const minimumRead = gameMs - e.openedAt >= W.exposedMinMs;
  const sealSpent = e.windowDamage >= W.windowDamage;
  if (gameMs >= e.stateUntil || (minimumRead && sealSpent)) {
    e.wardenCycle++;
    beginWardenAttack(e);
  }
}

// Evolved wasps do not gain a faster or homing attack. They spend their
// cruise beat visibly taking alternating stations around RIG, then use the
// exact same 190 ms lock and frozen predictive dive as the base drone. The
// answer remains movement, but a single dodge direction no longer solves the
// whole late swarm.
function stagePincer(e, dt, gate, patrolL, patrolR) {
  const E = CONFIG.evolution;
  let targetX = player.x + e.formationSide * E.flankOffsetX;
  if (gate) targetX = Math.max(patrolL + 0.4, Math.min(patrolR - 0.4, targetX));
  const floor = builtGroundTopAt(e.x);
  const safeY = floor > -100 ? floor + E.flankHeight : player.y + E.flankHeight;
  const targetY = Math.max(player.y + E.flankHeight, safeY) +
    e.formationBand * E.flankBandHeight;
  e.x = approach(e.x, targetX, E.flankSpeed * dt);
  e.baseY = approach(e.baseY, targetY, E.flankVerticalSpeed * dt);
  e.dir = Math.sign(player.x - e.x) || e.dir;
  e.formationReady = Math.abs(e.x - targetX) <= E.flankReadyTiles &&
    Math.abs(e.baseY - targetY) <= E.flankReadyTiles;
}

function updateBacklash(e) {
  if (!e.backlashUntil || gameMs < e.backlashUntil) return;
  if (circleHitsPlayer(e.x, e.y, CONFIG.genome.backlashRadius))
    damagePlayer(1, e.x);
  e.backlashUntil = 0;
  e.backlashBurstUntil = gameMs + CONFIG.genome.backlashBurstMs;
}

export function updateHostiles(dt) {
  const W = CONFIG.wasp;
  const GW = CONFIG.waves;
  const gate = gateActive();
  const cullX = sLeftEdge() - 8;
  // BREAKING (CHARGE notch 2): the launch RIG just made is itself a weapon.
  // Armed in sim/score.js by the launch branch, consumed here in the same
  // frame, so neither module has to import the other.
  const shock = consumeLaunchShock();
  const shockR2 = CONFIG.score.shockRadius * CONFIG.score.shockRadius;
  // Patrol right bound: the frozen screen edge reaches ~12 tiles past the
  // corner pivot, so bounding on the edge alone let hostiles drift around
  // the corner onto the next face — foreshortened, clustered, idling. The
  // arena ends at the pivot; nobody fights around a corner that isn't
  // built yet.
  const patrolR = gate ? Math.min(sRightEdge() - 2, activeCorner().s - 1.5) : 0;
  const patrolL = gate ? sLeftEdge() + 2 : 0;
  // New projectile-like ecology hazards are owner-local and stay on the
  // visible current facet. Gate arenas use their stricter patrol box; the
  // ordinary run gets one tile of presentation run-out before hard expiry.
  const tacticBoundL = gate ? patrolL : sLeftEdge() - 1;
  const tacticBoundR = gate ? patrolR : sRightEdge() + 1;

  // Elastic gate score: the authored delays establish entrance order and the
  // intended overlap for an ordinary fight. If a high-output build deletes
  // every body that has begun materializing, keeping the untouched absolute
  // clock creates the exact dead-air failure the combat director exists to
  // avoid. Pull the whole remaining score forward by one delta so ordering
  // and spacing stay intact, while the next body's honest depth-condense tell
  // begins after a 90ms breath. This never adds a body, changes a cooldown, or
  // skips the unshootable entrance; it only removes time in which no threat is
  // present and no decision is possible.
  if (gate && hostiles.length) {
    const gateEncounterKey = activeCorner()?.encounterKey || '';
    let active = false;
    let nextEnterUntil = Infinity;
    for (const e of hostiles) {
      if (e.gateBreakExit || e.encounterKey !== gateEncounterKey) continue;
      if (gameMs >= e.enterUntil - W.enterMs) active = true;
      else if (e.enterUntil < nextEnterUntil) nextEnterUntil = e.enterUntil;
    }
    if (!active && Number.isFinite(nextEnterUntil)) {
      const desiredNext = gameMs + W.enterMs + GW.emptyAdvanceMs;
      const pullMs = Math.max(0, nextEnterUntil - desiredNext);
      if (pullMs > 0) {
        for (const e of hostiles) {
          if (!e.gateBreakExit && e.encounterKey === gateEncounterKey &&
              gameMs < e.enterUntil - W.enterMs)
            e.enterUntil -= pullMs;
        }
      }
    }
  }
  syncEvolutionLinks();
  for (let i = hostiles.length - 1; i >= 0; i--) {
    const e = hostiles[i];
    // A gate break may be triggered from inside the projectile collision
    // loop. It marks denial hazards there and removes them here, one frame
    // later, so no caller has the hostile array shortened under its iterator.
    if (e.gateBreakExit) { removeHostile(i); continue; }
    if (gameMs < e.enterUntil - W.enterMs) {           // staged wave slot: not yet condensing
      view.hostiles.sync(e);                           //   render keeps it hidden
      continue;
    }
    e.t += dt;
    updateEnemyTacticHazards(e, dt, tacticBoundL, tacticBoundR);
    updateBacklash(e);
    // gated hostiles press harder; otherwise a variant's per-enemy tune wins
    const diveRange = gate ? GW.gateDiveRange
      : (e.diveRange !== undefined ? e.diveRange : W.diveRange);
    const diveCooldown = gate ? GW.gateDiveCooldownMs
      : (e.diveCooldownMs !== undefined ? e.diveCooldownMs : W.diveCooldownMs);
    const cruiseSpeed = gate ? GW.gateCruiseSpeed
      : (e.cruiseSpeed !== undefined ? e.cruiseSpeed : W.cruiseSpeed);
    const squadStagger = gate ? GW.gateSquadStaggerMs : WASP_SQUAD_STAGGER_MS;
    // BREAKING launch shock is kind-agnostic on purpose: a chained launch that
    // pops a charging houndframe is exactly the fantasy the notch is selling.
    if (shock && gameMs >= e.enterUntil &&
        (e.x - shock.x) ** 2 + (e.y - shock.y) ** 2 <= shockR2) {
      hitHostile(e, i, CONFIG.score.shockDamage, 'shock');
      continue;
    }
    if (gate && !ROOTED[e.kind] &&                    // a rooted barrel's dir is its FACING:
        e.state !== 'charge' && e.state !== 'vault' && e.state !== 'tumble' &&
        e.state !== 'reboundTell' && e.state !== 'reboundVault' &&
        e.state !== 'crosswindTell' && e.state !== 'crosswindBurst' &&
        e.state !== 'crosswindRecover') {//   the box must never re-aim a commitment
      if (e.x < patrolL) e.dir = 1;                    // patrol box: nobody strands the gate
      else if (e.x > patrolR) e.dir = -1;              //   (a committed charge is exempt)
    }
    const staggered = gameMs < e.staggerUntil && !ROOTED[e.kind];
    if (staggered) {                                   // trait impact: short, bounded recoil
      e.x += e.recoilVx * dt;
      e.y += e.recoilVy * dt;
      if (e.kind === 'wasp' || e.kind === 'carrier') e.baseY += e.recoilVy * dt;
      const damp = Math.exp(-10 * dt);
      e.recoilVx *= damp;
      e.recoilVy *= damp;
    } else {
      // Do not bank a stale impulse forever and add it to some later hit.
      e.recoilVx = 0;
      e.recoilVy = 0;
    }
    if (staggered) {
      // The recoil itself consumed this body's AI beat; the common cull and
      // render sync below still run, but it cannot attack through hit-stun.
    } else if (e.kind === 'warden') {                  // Crown interlock: authored finale target
      updateWarden(e);
    } else if (e.kind === 'hound') {                   // deck unit: floor denial, see above
      updateHound(e, dt);
    } else if (e.kind === 'polyp') {                   // rooted emplacement: sightline denial
      updatePolyp(e);
    } else if (e.kind === 'mortar') {                  // rooted emplacement: landing denial
      updateMortar(e, tacticBoundL, tacticBoundR);
    } else if (updateCrosswind(e, dt, tacticBoundL, tacticBoundR)) {
      // Opt-in aerial release owns this beat; ordinary wasps never enter one
      // of its three named states, so their branch remains immediately below.
    } else if (e.kind === 'carrier') {                 // loot/support body; never dives
      const C = CONFIG.carrier;
      // PINCER reuses the wasp's already-readable split station as support
      // ecology. The carrier never inherits the dive; it simply exposes its
      // loot/projector on a flank instead of drifting through as a clone.
      if (e.pincer) stagePincer(e, dt, gate, patrolL, patrolR);
      else e.x += e.dir * (e.cruiseSpeed !== undefined ? e.cruiseSpeed : C.speed) * dt;
      e.y = e.baseY + Math.sin(e.t * C.bobFreq) * C.bobAmp;
    } else if (e.state === 'cruise') {
      if (e.pincer) stagePincer(e, dt, gate, patrolL, patrolR);
      else e.x += e.dir * cruiseSpeed * dt;
      e.y = e.baseY + Math.sin(e.t * W.bobFreq) * W.bobAmp;
      const crosswindReady = hostileAttackReady(e) &&
        squadReady(gameMs, lastWaspLockMs, squadStagger);
      if (enemyHasTactic(e, ENEMY_TACTICS.HORIZONTAL_BURST)) {
        if (beginCrosswind(e, diveRange, diveCooldown, crosswindReady))
          lastWaspLockMs = gameMs;
      } else if ((!e.pincer || e.formationReady) &&
          Math.abs(e.x - player.x) < diveRange && player.y + 1 < e.y &&
          gameMs > e.diveCdUntil && hostileAttackReady(e) &&
          squadReady(gameMs, lastWaspLockMs, squadStagger)) {
        // commit now: aim is frozen for the whole dive (never re-aimed, same
        // doctrine as the hound's charge and the polyp's beam), but movement
        // is held for WASP_DIVE_LOCK_MS — the aim-lock beat that turns the
        // already-shipped hot-acid dart pose into a real pre-commit tell
        // instead of a dive that starts the instant its own warning would.
        // Lead current motion, capped to a couple of tiles so a reversal can
        // still beat the attack. The vector freezes through the aim-lock and
        // the entire dive: predictive, never homing.
        const leadSec = W.predictMs / 1000;
        const targetX = player.x + clampLead(player.vx * leadSec, W.predictXCap);
        const targetY = player.y + 0.9 + clampLead(player.vy * leadSec, W.predictYCap);
        const v = diveVelocity(e.x, e.y, targetX, targetY, W.diveSpeed);
        e.vx = v.vx; e.vy = v.vy;
        e.state = 'dive';
        if (e.twinstrike && e.twinPassesLeft <= 0) e.twinPassesLeft = 2;
        e.lockUntil = gameMs + WASP_DIVE_LOCK_MS;
        e.stateUntil = e.lockUntil + W.diveMs;
        lastWaspLockMs = gameMs;               // squad clock: next commit waits its turn
      }
    } else if (e.state === 'dive') {
      const launched = diveLaunched(gameMs, e.lockUntil);
      if (launched) { e.x += e.vx * dt; e.y += e.vy * dt; }
      const floor = builtGroundTopAt(e.x);       // hidden faces have no floor yet
      if (gameMs > e.stateUntil || (launched && e.y < floor + 0.4)) {
        e.state = 'recover';
        if (e.twinstrike && e.twinPassesLeft > 1) {
          e.twinPassesLeft--;
          if (e.formationSide) e.formationSide = -e.formationSide;
          e.diveCdUntil = gameMs + CONFIG.genome.twinGapMs;
        } else {
          e.twinPassesLeft = 0;
          e.diveCdUntil = gameMs + diveCooldown;
        }
      }
    } else {                                             // recover: climb back up
      if (e.pincer) stagePincer(e, dt, gate, patrolL, patrolR);
      else {
        e.x -= 1.2 * dt;
        if (gate) e.x = Math.max(e.x, sLeftEdge() + 1);  // no drifting out of the fight
      }
      const recoverRate = e.pincer ? CONFIG.evolution.flankRecoverRate
        : (gate ? GW.gateRecoverRate : 5);
      e.y = approach(e.y, e.baseY, recoverRate * dt);
      if (Math.abs(e.y - e.baseY) < 0.05) { e.state = 'cruise'; e.t = 0; }
    }

    if (e.x < cullX || e.y < CONFIG.edges.killY) {     // off the back, or tumbled out of the world
      removeHostile(i);
      continue;
    }

    // contact damage — only once fully materialized (hitR doubles as contact radius)
    if (!staggered && gameMs >= e.enterUntil && circleHitsPlayer(e.x, e.y, e.hitR))
      damagePlayer(1, e.x);

    // mock-3D presence (materialize in from tower depth, breathe while alive,
    // hit flash) is derived entirely from these sim fields by the render layer
    view.hostiles.sync(e);
  }
}

/* run reset (resetGame in src/main.js): every hostile leaves without
   counting toward a wave gate, and the seeded sim rng rewinds. */
export function clearHostiles() {
  for (const e of hostiles) view.hostiles.removed(e, false);
  hostiles.length = 0;
  lastWaspLockMs = -Infinity;         // squad clock: a fresh run owes nothing to the last one
  evolutionSerial = 0;
  genomeSerial = 0;
}
export function resetKills() { kills = 0; }
export function resetHostileRng() { hostileRng = mulberry32(5150); }

export function hostileEvolutionSnapshot() {
  const rows = hostiles
    .filter((e) => e.aegis || e.pincer || e.wardedBy)
    .map((e) => ({
      id: e.id,
      kind: e.kind,
      face: e.evolutionFace,
      hp: e.hp,
      aegis: e.aegis,
      online: e.aegisActive,
      pincer: e.pincer,
      side: e.formationSide,
      band: e.formationBand,
      ready: e.formationReady,
      wardedBy: e.wardedBy,
      blockedHits: e.blockedHits,
      x: Number(e.x.toFixed(2)),
      y: Number(e.y.toFixed(2)),
      state: e.state,
    }));
  return {
    firstFace: CONFIG.evolution.firstFace,
    anchors: rows.filter((e) => e.aegis).length,
    online: rows.filter((e) => e.aegis && e.online).length,
    pincers: rows.filter((e) => e.pincer).length,
    linked: rows.filter((e) => e.wardedBy).length,
    blockedHits: rows.reduce((n, e) => n + e.blockedHits, 0),
    rows,
  };
}

export function hostileEcologySnapshot() {
  const rows = hostiles.filter((e) => e.ecologyId).map((e) => ({
    id: e.id,
    ecologyId: e.ecologyId,
    family: e.ecologyFamily,
    kind: e.kind,
    face: e.evolutionFace,
    encounterKey: e.encounterKey,
    beat: e.ecologyBeat,
    beatSlot: e.ecologyBeatSlot,
    stageRole: e.ecologyStageRole,
    mode: e.ecologyMode,
    stageResolved: e.ecologyStageResolved,
    placementFallback: e.ecologyPlacementFallback,
    baseMechanics: [...e.ecologyMechanics],
    mechanics: [...e.effectiveMechanics],
    tactics: [...e.tactics],
    state: e.state,
    tacticState: e.tacticState,
    tacticPhase: e.tacticPhase,
    tacticProgress: Number(e.tacticProgress.toFixed(3)),
    hazards: e.tacticHazards ? e.tacticHazards.filter((h) => h.active).map((h) => ({
      kind: h.kind,
      x: Number(h.x.toFixed(2)),
      y: Number(h.y.toFixed(2)),
      radius: h.radius,
    })) : [],
    hp: e.hp,
    gating: e.gating,
    x: Number(e.x.toFixed(2)),
    y: Number(e.y.toFixed(2)),
  }));
  return {
    bodiesAdded: 0,
    maxHazardsPerBody: CONFIG.enemyEcology.maxHazardsPerBody,
    bodies: rows.length,
    hazards: rows.reduce((count, row) => count + row.hazards.length, 0),
    rows,
  };
}

export function hostileGenomeSnapshot() {
  const rows = hostiles.filter((e) => e.genome?.mutated).map((e) => ({
    id: e.id,
    kind: e.kind,
    identity: e.genomeId,
    label: e.genomeLabel,
    response: e.genome.response,
    budget: e.genome.budget,
    expressedBudget: e.genome.expressedBudget,
    strain: e.genome.strain.id,
    wardPolicy: e.wardPolicy,
    salvoPattern: e.salvoPattern,
    genes: [...e.genome.genes],
    state: e.state,
    hp: e.hp,
    x: Number(e.x.toFixed(2)),
    y: Number(e.y.toFixed(2)),
    bulwarkOpen: e.bulwark && gameMs < e.bulwarkOpenUntil,
    twinPassesLeft: e.twinPassesLeft,
    salvoShotsRemaining: e.salvoShotsRemaining,
    relayCycles: e.relayCycles,
    backlashArmed: !!e.backlashUntil,
    wardedBy: e.wardedBy,
    blockedHits: e.blockedHits,
  }));
  return {
    seed: CONFIG.genome.seed,
    mutated: rows.length,
    byResponse: Object.fromEntries([...new Set(rows.map((e) => e.response))]
      .map((response) => [response, rows.filter((e) => e.response === response).length])),
    rows,
  };
}
