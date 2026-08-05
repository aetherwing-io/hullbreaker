#!/usr/bin/env node
/* Deterministic regression for the reported HEAVY³ Cindermouth floor-slide.
   It drives real sim bullet rows and real generated surfaces; no renderer or
   synthetic collision predicate can make the contract pass. */

globalThis.__HB_QUERY__ = '';

const [W, H, B, T, C, G, L, P] = await Promise.all([
  import('../src/sim/weapons.js'),
  import('../src/sim/hostiles.js'),
  import('../src/sim/bridge.js'),
  import('../src/sim/time.js'),
  import('../src/config.js'),
  import('../src/pure/gunroll.js'),
  import('../src/sim/level.js'),
  import('../src/pure/path.js'),
]);

let passed = 0;
function ok(value, message) {
  if (!value) throw new Error(`CINDERMOUTH FAIL: ${message}`);
  passed++;
  console.log(`ok ${passed} - ${message}`);
}
function near(actual, expected, epsilon, message) {
  ok(Math.abs(actual - expected) <= epsilon,
    `${message} (${actual.toFixed(6)} vs ${expected.toFixed(6)})`);
}

const emptyCounts = Object.freeze({
  RAPID: 0, HEAVY: 0, FORKED: 0, SEEKER: 0, PHASE: 0, VOLATILE: 0,
});
function gunWith(counts, id) {
  const traits = [];
  for (const [trait, count] of Object.entries(counts))
    for (let i = 0; i < count; i++) traits.push(trait);
  return Object.freeze({
    id, letter: 'F', tier: Math.min(3, traits.length),
    traits: Object.freeze(traits), counts: Object.freeze({ ...emptyCounts, ...counts }),
    visual: Object.freeze({
      tier: Math.min(3, traits.length), traitMask: 0,
      rapid: counts.RAPID || 0, heavy: counts.HEAVY || 0,
      forked: counts.FORKED || 0, seeker: counts.SEEKER || 0,
      phase: counts.PHASE || 0, volatile: counts.VOLATILE || 0,
    }),
  });
}

const heavy3Gun = gunWith({ HEAVY: 3 }, 'repro-cindermouth-heavy3');
const heavy3 = G.compileGunDef(heavy3Gun, C.CONFIG.weapons.F);
near(heavy3.speed / C.CONFIG.weapons.F.speed, 0.88 ** 3, 1e-12,
  'the exact HEAVY³ roll reproduces the −32% airborne speed trade');
near(heavy3.crawlSpeed / C.CONFIG.weapons.F.crawlSpeed, 0.88 ** 3, 1e-12,
  'HEAVY³ slows the authored ground wave too');
ok(heavy3.damage === C.CONFIG.weapons.F.damage + 3,
  'the report’s +3 DAMAGE stack is reproduced');

const ignition = [];
const terminals = [];
const bends = [];
B.installView({ bullets: {
  deckIgnited(i, b, x, surfaceY, reason, kind) {
    ignition.push({ i, x, surfaceY, reason, kind, rowX: b.x, rowY: b.y,
      crawling: b.crawling, at: T.gameMs });
  },
  hideSlot(i, b, reason) {
    if (b && reason) terminals.push({ i, x: b.x, y: b.y, reason, at: T.gameMs });
  },
  bendCulled(i, b, fromX) { bends.push({ i, fromX, x: b.x }); },
} });

const row = W.bulletPool[0];
function clearEvidence() {
  ignition.length = 0; terminals.length = 0; bends.length = 0;
}
function arm(values = {}) {
  W.clearBullets();
  H.clearHostiles();
  clearEvidence();
  Object.assign(row, {
    alive: true, x: 10.25, y: 4.05, vx: heavy3.speed, vy: 0,
    dieAt: T.gameMs + heavy3.lifeMs,
    type: 'F', damage: heavy3.damage, pierce: true,
    pierceLeft: heavy3.pierceBudget, crawling: false, dir: 1,
    crawlUntil: 0, crawlTilesLeft: 0, crawlSurfaceY: -999,
    seekTargetId: 0, seekLocksLeft: 0, seekUntil: 0,
    phaseTilesLeft: 0, def: heavy3, gun: heavy3Gun, meta: heavy3Gun.visual,
  }, values);
  row.hitSet.clear();
  return row;
}
function step(dt = 1 / 120) {
  T.advanceGameMs(dt * 1000);
  W.updateBullets(dt);
}
function until(predicate, maxFrames = 360) {
  for (let i = 0; i < maxFrames; i++) {
    step();
    if (predicate()) return true;
  }
  return false;
}

// Exact user repro: a horizontal HEAVY³ Cindermouth shot arcs onto a long,
// flat built hull run. It must announce the transformation BEFORE moving as
// ground fire and preserve exact contact coordinates in that event.
arm({ x: 10.25, y: L.groundH[10] + 1.05, vx: heavy3.speed, vy: heavy3.speed * 0.12 });
ok(until(() => ignition.length === 1), 'HEAVY³ reaches an authored ignition edge');
const hit = ignition[0];
ok(hit.reason === 'deck-ignite' && hit.kind === 'deck',
  'the transition has the closed deck-ignite reason and deck role');
ok(hit.crawling, 'the bridge event observes the new ground-fire state');
near(hit.x, hit.rowX, 1e-12, 'ignition x is the exact swept row endpoint');
near(hit.rowY, hit.surfaceY + heavy3.hugY, 1e-12,
  'ground-fire centre is anchored to the exact contacted top');
ok(terminals.length === 0, 'deck ignition is a transformation, not a fake terminal hit');
const igniteX = hit.x, igniteAt = hit.at;
ok(until(() => !row.alive), 'the transformed wave has a finite endpoint');
ok(terminals.at(-1)?.reason === 'lifetime',
  'flat-run ground fire expires as fuel, not an invented terrain collision');
ok(terminals.at(-1).x - igniteX <= heavy3.crawlTiles + 0.02,
  'ground-fire travel never exceeds its explicit tile budget');
ok(terminals.at(-1).at - igniteAt <= heavy3.crawlLifeMs + 1000 / 120 + 0.01,
  'ground-fire travel never exceeds its explicit time budget');

// A one-way catwalk is a real downward landing surface for non-PHASE F. The
// former groundH-only code visibly passed through this and ignited below.
const platform = L.platforms.find((p) => p.x0 <= 27.5 && p.x1 > 27.5);
ok(!!platform, 'fixture has the real early catwalk used by the platform regression');
let platformEdge = platform.x1;
for (let changed = true; changed;) {
  changed = false;
  for (const p of L.platforms) {
    if (p.y === platform.y && p.x0 <= platformEdge + 1e-9 && p.x1 > platformEdge) {
      platformEdge = p.x1; changed = true;
    }
  }
}
arm({ x: 27.5, y: platform.y + 1.15, vx: 0, vy: -4 });
ok(until(() => ignition.length === 1), 'non-PHASE F ignites on a catwalk top');
near(ignition[0].surfaceY, platform.y, 1e-12,
  'catwalk ignition owns the catwalk top, not the hull below');
ok(ignition[0].kind === 'platform', 'the ignition surface role remains inspectable');

// PHASE alone owns the exception. It spends finite terrain budget at the
// zero-thickness catwalk and remains airborne; HEAVY alone never gets this.
const phaseGun = gunWith({ PHASE: 1 }, 'phase-cindermouth');
const phaseDef = G.compileGunDef(phaseGun, C.CONFIG.weapons.F);
arm({
  x: 27.5, y: platform.y + 0.72, vx: 0, vy: -5,
  def: phaseDef, gun: phaseGun, meta: phaseGun.visual,
  damage: phaseDef.damage, phaseTilesLeft: phaseDef.terrainPhaseTiles,
  dieAt: T.gameMs + phaseDef.lifeMs,
});
const phaseBefore = row.phaseTilesLeft;
ok(until(() => row.y < platform.y + phaseDef.hugY - 0.05, 60),
  'PHASE F crosses the catwalk plane while still airborne');
ok(ignition.length === 0 && !row.crawling,
  'PHASE passage does not emit a false deck transformation');
near(row.phaseTilesLeft, phaseBefore - phaseDef.phaseSurfaceCost, 1e-9,
  'catwalk passage spends the declared PHASE surface budget');

// Ordinary rounds never inherit Cindermouth’s authored transformation.
arm({
  type: 'R', def: C.CONFIG.weapons.R, gun: null, meta: null,
  x: 12.5, y: L.groundH[12] - 0.1, vx: 0, vy: 0,
  damage: 1, pierce: false, pierceLeft: 0,
});
step(0);
ok(ignition.length === 0 && terminals.at(-1)?.reason === 'terrain',
  'ordinary solid contact terminates; it never silently acquires crawl');

function armCrawler(x, surfaceY, dir = 1) {
  return arm({
    x, y: surfaceY + heavy3.hugY, vx: heavy3.speed * dir, vy: 0, dir,
    crawling: true, crawlSurfaceY: surfaceY,
    crawlUntil: T.gameMs + 1000, crawlTilesLeft: 8,
  });
}

// Gap lip: x=29 starts a real generated gap. The point is clamped to the lip,
// never advanced into empty space and then rendered as a floor slide.
armCrawler(28.82, L.groundH[28]);
step(0.05);
ok(terminals.at(-1)?.reason === 'terrain', 'ground fire extinguishes at a gap');
near(terminals.at(-1).x, 29, 1e-12, 'gap termination is exact at the authored lip');

// Up-step wall: 34→35 rises two tiles. It is a side strike, not a valid
// downward landing, so no teleport-to-top/crawl is allowed.
armCrawler(34.82, L.groundH[34]);
step(0.05);
ok(terminals.at(-1)?.reason === 'terrain', 'ground fire extinguishes at an up-step wall');
near(terminals.at(-1).x, 35, 1e-12, 'up-step termination is exact at the wall plane');

// A two-tile downward stair remains useful ground control: the low wave may
// cascade down, within crawlDropMax, and remains an explicit ground-fire row.
armCrawler(38.82, L.groundH[38]);
step(0.05);
ok(row.alive && row.crawling, 'ground fire follows an authored downward stair');
near(row.crawlSurfaceY, L.groundH[39], 1e-12,
  'down-stair wave re-anchors to the next exact surface');

// Platform edge and facet turn are both clean endpoints. The first terminates
// at the catwalk lip; the second retains the existing bend reason/tracer.
armCrawler(platformEdge - 0.18, platform.y);
step(0.05);
ok(terminals.at(-1)?.reason === 'terrain',
  `ground fire extinguishes at a catwalk edge (alive=${row.alive}, x=${row.x}, ` +
  `surface=${row.crawlSurfaceY}, terminal=${terminals.at(-1)?.reason || 'none'})`);
near(terminals.at(-1).x, platformEdge, 1e-12,
  'catwalk termination is exact at the platform lip');

const firstBend = P.BEND_S[0];
armCrawler(firstBend - 0.18, L.groundH[Math.floor(firstBend - 0.18)]);
step(0.05);
ok(terminals.at(-1)?.reason === 'bend' && bends.length === 1,
  'ground fire cannot crawl around a facet turn');

// Presentation/wiring guards: the deterministic sim edge must stay visibly
// authored. These read the production modules that browser boot consumes.
const { readFileSync } = await import('node:fs');
const weaponsSource = readFileSync(new URL('../src/sim/weapons.js', import.meta.url), 'utf8');
const bulletsSource = readFileSync(new URL('../src/render/bullets.js', import.meta.url), 'utf8');
const lootSource = readFileSync(new URL('../src/ui/loot.js', import.meta.url), 'utf8');
ok(!weaponsSource.includes('builtGroundTopAt') &&
   weaponsSource.includes('sweptAirSurface') && weaponsSource.includes("'platform'"),
  'production landing no longer uses the groundH-only final-position shortcut');
ok(weaponsSource.indexOf('view.bullets.deckIgnited') <
   weaponsSource.indexOf('view.bullets.syncSlot'),
  'deck-ignite reaches presentation before the first ground-fire sync');
ok(bulletsSource.includes('groundFireMesh') &&
   bulletsSource.includes('groundFireCoreMesh') &&
   bulletsSource.includes('function groundTongueGeometry'),
  'ground fire owns two fixed pooled tongue layers and a dedicated silhouette');
const crawlRender = bulletsSource.slice(
  bulletsSource.indexOf('if (crawling) {'),
  bulletsSource.indexOf('const artMesh = artMeshes[visualType]'),
);
ok(/artMeshes\[visualType\].*HIDE/.test(crawlRender) &&
   /groundFireMesh\.setMatrixAt\(i, _bm\)/.test(crawlRender),
  'crawling explicitly retires the airborne atlas chassis before drawing flame');
ok(!/\bnew\s+/.test(weaponsSource.slice(
  weaponsSource.indexOf('function sweptAirSurface'),
  weaponsSource.indexOf('export function updateBullets'),
)), 'surface sweep and support helpers allocate no rows in the hot path');
ok(lootSource.includes('DECK HIT → GROUND-FIRE'),
  'the existing pickup stat line teaches Cindermouth’s deck transformation');

console.log(`CINDERMOUTH GROUND FIRE: ${passed}/${passed} contracts passed`);
