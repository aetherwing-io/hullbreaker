#!/usr/bin/env node
/* Focused headless proof for the sim -> projectile-render terminal contract.
   It steps real bullet rows through terrain, hostile, lifetime and bend exits
   and verifies that the presentation hook sees the final substep coordinate
   and the correct closed reason. No renderer is required. */

globalThis.__HB_QUERY__ = '';

const [W, H, B, T, C, P] = await Promise.all([
  import('../src/sim/weapons.js'),
  import('../src/sim/hostiles.js'),
  import('../src/sim/bridge.js'),
  import('../src/sim/time.js'),
  import('../src/config.js'),
  import('../src/pure/path.js'),
]);

let passed = 0;
function ok(value, message) {
  if (!value) throw new Error(`PROJECTILE TERMINAL FAIL: ${message}`);
  passed++;
  console.log(`ok ${passed} - ${message}`);
}

const events = [];
const bends = [];
B.installView({
  bullets: {
    hideSlot(i, b, reason) {
      if (b) events.push({ i, b, reason, x: b.x, y: b.y });
    },
    bendCulled(i, b, fromX) { bends.push({ i, b, fromX, x: b.x, y: b.y }); },
  },
});

function arm(row, values) {
  W.clearBullets();
  H.clearHostiles();
  events.length = 0;
  bends.length = 0;
  Object.assign(row, {
    alive: true, x: 10, y: 7, vx: 0, vy: 0, dieAt: T.gameMs + 1000,
    type: 'R', damage: 1, pierce: false, pierceLeft: 0,
    crawling: false, dir: 1, seekTargetId: 0, seekLocksLeft: 0,
    seekUntil: 0, phaseTilesLeft: 0, def: C.CONFIG.weapons.R,
    gun: null, meta: null,
  }, values);
  row.hitSet.clear();
}

function sole(reason, row, x, y) {
  ok(events.length === 1, `${reason} emits exactly one classified terminal hook`);
  const event = events[0];
  ok(event.reason === reason, `${reason} is preserved as the terminal reason`);
  ok(event.b === row, `${reason} passes the exact live pool row, not a copy`);
  ok(event.x === x && event.y === y,
    `${reason} reports exact final coordinates (${event.x}, ${event.y})`);
}

const row = W.bulletPool[0];

// A stationary point already inside built deck terrain dies at that exact
// point. This exercises the ordinary solid collision branch without relying
// on rendering cadence.
arm(row, { x: 10.25, y: 2.5 });
W.updateBullets(0);
sole('terrain', row, 10.25, 2.5);

// A bullet may expire without moving or ever reaching a render sync. That is
// a fuel/lifetime endpoint, never a collision.
arm(row, { x: 11.375, y: 7.625, dieAt: T.gameMs - 1 });
W.updateBullets(0);
sole('lifetime', row, 11.375, 7.625);

// Materialize one real hostile, overlap its hit circle, and prove the direct
// hit consumes the point at the same coordinate handed to presentation.
arm(row, { x: 12.5, y: 7.25 });
H.spawnHostile(12.5, 7.25, 0, 'wasp');
T.advanceGameMs(C.CONFIG.wasp.enterMs + 1);
W.updateBullets(0);
sole('hostile', row, 12.5, 7.25);

// The projectile's terminal row is the first bend-crossing substep, while
// crossing substep, while bendCulled separately owns the tangent tracer.
const firstBend = P.BEND_S[0];
arm(row, { x: firstBend - 0.1, y: 7, vx: C.CONFIG.weapons.R.speed,
  dieAt: T.gameMs + 1000 });
W.updateBullets(0.02);
ok(bends.length === 1, 'bend exit emits exactly one tangent-tracer hook');
sole('bend', row, bends[0].x, bends[0].y);
ok(events[0].x >= firstBend && bends[0].fromX < firstBend,
  `bend terminal belongs to the crossing substep (${bends[0].fromX} -> ${events[0].x})`);

// Unused pool rows are polled every frame but have no terminal row/reason and
// therefore cannot masquerade as gameplay endpoints.
events.length = 0;
W.updateBullets(0);
ok(events.length === 0, 'inactive pool cleanup emits no classified endpoint');

console.log(`PROJECTILE TERMINAL: ${passed}/${passed} contracts passed`);
