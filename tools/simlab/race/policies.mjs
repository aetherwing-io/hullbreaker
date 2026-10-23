/* policies.mjs — closed-loop bot players for the six-face race lab.
 *
 * A policy is a small, legible reflex player: once per simulation frame it
 * reads the live sim (RIG, hostiles, terrain, the corner gate) and returns the
 * keys it holds. It is NOT an AI and not a skill showcase. The point is to put
 * several recognisable PLAYING STYLES through the shipped run and report the
 * distribution of what the run does to each of them (decisions.md entry 19).
 *
 * Every policy draws its imperfections from a seeded PRNG owned by this file
 * (never src/pure/rng.js, never Math.random): lip-jump timing, jump hold,
 * aim accuracy and dodge reflexes vary per run seed, which is what turns one
 * fixed course into an outcome distribution. Same (policy, seed, viewport) ->
 * byte-identical run.
 *
 *   rush     "race to the top": always holding right, fires, jumps at lips,
 *            aims up-right at anything above, turns back only to shoot a gate
 *            holder behind it. The player entry 20 describes.
 *   climber  rush, plus it takes every higher platform and ladder in reach —
 *            "climb, climb, climb" (entry 10). Measures how much height the
 *            lattice actually offers a player who wants it.
 *   fighter  target-first: keeps mid-screen, walks toward the nearest threat,
 *            aims 8-way, dodges hound tells and marked mortar patches.
 *   carried  a new player being "pushed along while they learn" (entry 11):
 *            moves right only when the damage plane gets close, fires level,
 *            jumps only when blocked, rarely aims up.
 *   skip     T-201: the racer who skips every fight — rush's movement with
 *            the trigger never pulled. Under rolling corners the turn never
 *            waits, so this is the policy that proves no softlock and measures
 *            what skipping costs (pressure: hits and fallbacks).
 *   idle     no input at all — the control.
 *
 * Zero effect on the shipped game: policies only write the same intent
 * booleans a keyboard writes (src/sim/input.js), through the child runner.  */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = (a, b, u) => a + (b - a) * u;

/* Per-run imperfection profile. Ranges are deliberately wide: the operator
   reports "sometimes I clear two or three faces, sometimes I can't pass the
   first" (entry 19), so the lab samples a spread of hands, not one. */
export function profileFor(policyId, seed) {
  const r = mulberry32((seed * 2654435761) ^ hashId(policyId));
  const base = {
    lipProbe: lerp(0.8, 1.6, r()),        // tiles ahead a hole/step triggers a jump
    lipJitter: 0.15,
    jumpHoldMs: [lerp(240, 320, r()), lerp(380, 470, r())],
    aimSkill: lerp(0.6, 0.95, r()),       // chance an aim window picks the right ray
    dodgeSkill: lerp(0.4, 0.9, r()),      // chance a hound tell / mortar mark is answered
    aimWindowMs: lerp(90, 170, r()),      // how often the aim decision is re-taken
    marginTarget: lerp(3, 7, r()),        // carried: how close the plane gets before moving
    screenFrac: lerp(0.38, 0.55, r()),    // fighter: preferred position across the strip
  };
  if (policyId === 'carried') {
    base.aimSkill = lerp(0.25, 0.6, r());
    base.dodgeSkill = lerp(0.15, 0.5, r());
  }
  return base;
}

function hashId(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* --------------------------- shared reflexes --------------------------- */

// A materialized hostile can be hit and can hurt; a condensing one cannot.
// A bot perceives only what a player could see: bodies inside the screen
// edges. (Bullets are not edge-culled, so without this a bot in a 19-tile
// portrait view would fight bodies the player has no way of knowing exist.)
export function liveHostiles(ctx) {
  const lo = ctx.edges.left - 0.5, hi = ctx.edges.right + 0.5;
  return ctx.hostiles.filter((e) => ctx.gameMs >= e.enterUntil && e.hp > 0 &&
    !e.gateBreakExit && e.kind !== 'carrier' && e.x >= lo && e.x <= hi);
}

function nearest(ctx, list, pred = () => true) {
  const p = ctx.player;
  const mx = p.x, my = p.y + p.muzzleY;
  let best = null, bestD = Infinity;
  for (const e of list) {
    if (!pred(e)) continue;
    const d = Math.hypot(e.x - mx, e.y - my);
    if (d < bestD) { best = e; bestD = d; }
  }
  return best ? { e: best, d: bestD, dx: best.x - mx, dy: best.y - my } : null;
}

// One of the eight rays the game fires along (src/sim/player.js computeAim).
function rayFor(dx, dy) {
  const a = Math.atan2(dy, dx);
  const oct = Math.round(a / (Math.PI / 4));
  const ang = oct * (Math.PI / 4);
  return { h: Math.round(Math.cos(ang)), v: Math.round(Math.sin(ang)) };
}

function holeOrStepAhead(ctx, probe) {
  const p = ctx.player;
  const g = ctx.level.groundTopAt(p.x + probe);
  if (g < -100) return 'hole';
  if (g > p.y + 0.6) return 'step';
  // a solid wall at body height directly ahead (cover ribs, wall-launch ribs)
  for (let j = 0.2; j < p.h; j += 0.5)
    if (ctx.level.solidAt(p.x + p.hw + 0.35, p.y + j)) return 'wall';
  return null;
}

function overHole(ctx, ahead) {
  const p = ctx.player;
  for (let d = 0; d <= ahead; d += 0.5)
    if (ctx.level.groundTopAt(p.x + d) > -100) return false;
  return true;
}

function houndThreat(ctx, range) {
  const p = ctx.player;
  return liveHostiles(ctx).some((e) => e.kind === 'hound' &&
    (e.state === 'tell' || e.state === 'charge') &&
    Math.abs(e.x - p.x) < range && Math.abs(e.y - p.y) < 2.2);
}

function mortarZoneUnderfoot(ctx) {
  const p = ctx.player;
  for (const e of liveHostiles(ctx)) {
    if (e.kind !== 'mortar' || !e.zone) continue;
    if (!['lob', 'fuse', 'burst'].includes(e.state)) continue;
    const half = ctx.cfg.mortar.blastHalf + 0.6;
    if (Math.abs(p.x - e.zone.x) < half && Math.abs(p.y - e.zone.y) < 1.2) return e.zone;
  }
  return null;
}

/* ------------------------------ the class ------------------------------ */

export class Policy {
  constructor(id, seed, cfg) {
    if (!POLICY_IDS.includes(id)) throw new Error('unknown policy ' + id);
    this.id = id;
    this.seed = seed;
    this.cfg = cfg;
    this.rng = mulberry32((seed * 40503) ^ hashId(id + ':act'));
    this.prof = profileFor(id, seed);
    this.jumpUntil = 0;         // gameMs a held jump is released
    this.jumpCooldown = 0;      // no new press before this gameMs
    this.aimUntil = 0;          // current aim decision expires
    this.aim = { h: 1, v: 0, ok: true };
    this.dodgeRolled = new Set();
    this.dodgeUntil = 0;
    this.probeNow = this.prof.lipProbe;
    this.spot = null;
    this.spotUntil = 0;
    this.target = null;
    this.spotAccurate = true;
  }

  press(ctx, holdMs) {
    if (ctx.gameMs < this.jumpCooldown) return false;
    this.jumpUntil = ctx.gameMs + holdMs;
    this.jumpCooldown = ctx.gameMs + holdMs + 40;
    this.probeNow = this.prof.lipProbe + (this.rng() * 2 - 1) * this.prof.lipJitter;
    return true;
  }

  holdMs(full) {
    const [lo, hi] = this.prof.jumpHoldMs;
    return full ? hi : lerp(lo, hi, this.rng());
  }

  // Re-take the aim decision on a human cadence; a miss picks the level ray.
  aimDecision(ctx, allowBack) {
    if (ctx.gameMs < this.aimUntil) return this.aim;
    this.aimUntil = ctx.gameMs + this.prof.aimWindowMs;
    const t = nearest(ctx, liveHostiles(ctx), (e) => Math.abs(e.x - ctx.player.x) < 16);
    if (!t) { this.aim = { h: 1, v: 0, ok: false, t: null }; return this.aim; }
    let ray = rayFor(t.dx, t.dy);
    if (!allowBack && ray.h < 0) ray = { h: 1, v: ray.v };
    if (this.rng() > this.prof.aimSkill) ray = { h: ray.h || 1, v: 0 };
    this.aim = { ...ray, ok: true, t };
    return this.aim;
  }

  dodge(ctx) {
    // answer each hound tell / mortar mark once, with this run's reflexes
    if (ctx.gameMs < this.dodgeUntil) return true;
    const p = ctx.player;
    for (const e of liveHostiles(ctx)) {
      const tell = (e.kind === 'hound' && e.state === 'tell') ||
        (e.kind === 'mortar' && e.state === 'lob');
      if (!tell) continue;
      const key = e.id + ':' + e.kind + ':' + Math.floor(ctx.gameMs / 1500);
      if (this.dodgeRolled.has(key)) continue;
      this.dodgeRolled.add(key);
      const near = Math.abs(e.x - p.x) < 9;
      if (near && this.rng() < this.prof.dodgeSkill) {
        this.dodgeUntil = ctx.gameMs + 260;
        return true;
      }
    }
    return false;
  }

  decide(ctx) {
    const fn = BEHAVIOUR[this.id];
    const intent = fn.call(this, ctx) || {};
    intent.jump = !!intent.jump || ctx.gameMs < this.jumpUntil;
    return intent;
  }
}

/* Contact handling shared by the moving policies (same reasoning as
   tools/movement/simrun.mjs contactIntent): a wall contact launches on a jump
   press with the direction released; a ledge catch mantles with right+jump. */
function contactIntent(self, ctx) {
  const p = ctx.player;
  // A rail grabbed (often by holding up to aim) is finished upward: a ladder
  // ignores horizontal input, so a bot that keeps steering would hang there.
  if (p.traversalState === 'ladder') return { up: true, fire: true };
  if (p.traversalState === 'wall') { self.press(ctx, 120); return { jump: true, fire: true }; }
  if (p.traversalState === 'ledge') { self.press(ctx, 120); return { right: true, jump: true, fire: true }; }
  return null;
}

function gateHeld(ctx) {
  return ctx.corner && (ctx.corner.state === 'gate' || ctx.corner.state === 'approach');
}

function forwardJumps(self, ctx, intent) {
  const p = ctx.player;
  if (p.grounded && Math.abs(p.vx) > 0.5) {
    const what = holeOrStepAhead(ctx, self.probeNow);
    if (what) self.press(ctx, self.holdMs(what !== 'step'));
  }
  // pinned against something while commanding forward: hop
  if (p.grounded && intent.right && Math.abs(ctx.dxFrame) < 0.004 && !ctx.pinnedRight)
    self.press(ctx, self.holdMs(true));
  // airborne over a hole and falling: spend the air jump
  if (!p.grounded && p.vy < -2 && p.airJumpsLeft > 0 && p.traversalState === 'free' &&
      overHole(ctx, 2.5))
    self.press(ctx, self.holdMs(true));
}

/* Gate fighting, shared by every policy that intends to clear gates. A gate
   only opens on kills — including the staged teaching bodies (a polyp, a
   mortar, a non-gating hound) that own the current beat — so a bot that
   cannot find a firing position would sit there for ever and the lab would
   be measuring the bot, not the game. This reflex does what a human does:
   pick a target, find the nearest walkable spot from which one of the eight
   rays (plus the shipped fire-time aim assist, CONFIG.assist) reaches it,
   go there, face it and fire. Polyps are approached from behind the barrel,
   hound tells are hopped, marked mortar patches are left. Its ray choice is
   still subject to the run's aimSkill, so a weak hand stays weak.          */
const RAYS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

function rayReach(cfg, mx, my, e, ray) {
  const n = Math.hypot(ray[0], ray[1]);
  const ux = ray[0] / n, uy = ray[1] / n;
  const dx = e.x - mx, dy = e.y - my;
  const along = dx * ux + dy * uy;
  if (along < 1.2 || along > 14) return Infinity;
  const perp = Math.abs(dx * uy - dy * ux);
  const assist = along <= cfg.assist.range ? along * Math.tan(cfg.assist.maxDeg * Math.PI / 180) : 0;
  const slack = (e.shotR || 0.7) + 0.2 + assist * 0.8 - perp;
  return slack >= 0 ? perp : Infinity;
}

function firingSpot(self, ctx, e) {
  const p = ctx.player;
  const L = ctx.level;
  const cfg = ctx.cfg;
  const lo = Math.max(ctx.edges.left + 2.5, e.x - 13), hi = Math.min(ctx.edges.right - 0.8, e.x + 13);
  let best = null;
  const consider = (x, y) => {
    if (x < lo || x > hi) return;
    const mx = x, my = y + p.muzzleY;
    let bestRay = null, bestPerp = Infinity;
    for (const r of RAYS) {
      if (r[1] < 0) continue;                     // down rays only work airborne
      if (r[0] === 0 && r[1] > 0 && Math.abs(e.x - x) > 0.9) continue;
      const perp = rayReach(cfg, mx, my, e, r);
      if (perp < bestPerp) { bestPerp = perp; bestRay = r; }
    }
    if (!bestRay) return;
    let cost = Math.abs(x - p.x) + 1.6 * Math.max(0, y - p.y) + 0.6 * Math.max(0, p.y - y);
    // never stand in front of a polyp's barrel on its firing line
    if (e.kind === 'polyp' && (x - e.x) * (e.dir || -1) > 0 &&
        Math.abs(my - 0.0 - e.y) < 1.4) cost += 40;
    // hound charge lane: prefer a different level
    if (e.kind === 'hound' && Math.abs(y - (e.y - 0.45)) < 0.3 && Math.abs(x - e.x) < 4) cost += 8;
    if (!best || cost < best.cost) best = { x, y, ray: bestRay, cost };
  };
  for (let x = Math.floor(lo); x <= hi; x += 0.5) {
    const g = L.groundTopAt(x);
    if (g > -100 && L.groundTopAt(x + 0.4) === g && L.groundTopAt(x - 0.4) === g) consider(x, g);
  }
  for (const pl of L.platforms) {
    if (pl.x1 < lo || pl.x0 > hi) continue;
    for (let x = Math.max(lo, pl.x0 + 0.45); x <= Math.min(hi, pl.x1 - 0.45); x += 0.5) consider(x, pl.y);
  }
  return best;
}

function pickTarget(ctx) {
  const live = liveHostiles(ctx);
  const own = live.filter((e) => e.encounterKey === 'gate:' + ctx.corner.k);
  const pool = own.length ? own : live;
  return nearest(ctx, pool, () => true);
}

function engage(self, ctx) {
  const p = ctx.player;
  const intent = { fire: true };
  if (ctx.gameMs >= self.spotUntil || !self.spot) {
    self.spotUntil = ctx.gameMs + self.prof.aimWindowMs + 60;
    const t = pickTarget(ctx);
    self.target = t ? t.e : null;
    self.spot = t ? firingSpot(self, ctx, t.e) : null;
    self.spotAccurate = self.rng() < self.prof.aimSkill + 0.05;
  }
  const e = self.target;
  if (!e || !ctx.hostiles.includes(e) || e.hp <= 0) { self.spot = null; return intent; }
  const s = self.spot;
  const dxT = e.x - p.x;
  if (!s) {
    // no clean spot: close the distance and spray toward it
    if (dxT > 1) intent.right = true; else if (dxT < -1) intent.left = true;
    if (e.y > p.y + 2.5) intent.up = true;
  } else {
    const dx = s.x - p.x, dy = s.y - p.y;
    const there = Math.abs(dx) < 0.45 && Math.abs(dy) < 0.35 && p.grounded;
    if (!there) {
      if (dx > 0.3) intent.right = true; else if (dx < -0.3) intent.left = true;
      if (dy > 0.5 && Math.abs(dx) < 3.2) {
        if (p.grounded) self.press(ctx, self.holdMs(true));
        else if (p.vy < 1.2 && p.y < s.y + 0.1 && p.airJumpsLeft > 0) self.press(ctx, self.holdMs(true));
      }
      if (dy < -0.5 && Math.abs(dx) < 1.0 && p.grounded && p.onOneWay) {
        intent.down = true; self.press(ctx, 90);
      }
    } else if (self.spotAccurate) {
      const [rh, rv] = s.ray;
      intent.right = rh > 0; intent.left = rh < 0; intent.up = rv > 0;
      if (rh === 0) { intent.right = false; intent.left = false; }
    } else {
      if (dxT > 0) intent.right = true; else intent.left = true;
    }
    // a held direction with no ray part still faces the right way on arrival
    if (there && !intent.right && !intent.left && s.ray[0] === 0 && !intent.up) intent.up = true;
  }
  const zone = mortarZoneUnderfoot(ctx);
  if (zone && self.rng() < self.prof.dodgeSkill) {
    intent.right = p.x >= zone.x; intent.left = !intent.right; intent.up = false;
  }
  if (self.dodge(ctx)) self.press(ctx, self.holdMs(true));
  if ((intent.right || intent.left) && p.grounded && Math.abs(ctx.dxFrame) < 0.004 && !ctx.pinnedRight &&
      !(s && Math.abs(s.x - p.x) < 0.45))
    self.press(ctx, self.holdMs(true));
  return intent;
}

const BEHAVIOUR = {
  idle() { return {}; },

  skip(ctx) {
    const c = contactIntent(this, ctx);
    if (c) { c.fire = false; return c; }
    const intent = { fire: false, right: true };
    if (this.dodge(ctx)) this.press(ctx, this.holdMs(true));
    forwardJumps(this, ctx, intent);
    return intent;
  },

  rush(ctx) {
    const p = ctx.player;
    const c = contactIntent(this, ctx);
    if (c) return c;
    if (gateHeld(ctx) && ctx.corner.state === 'gate') return engage(this, ctx);
    const aim = this.aimDecision(ctx, false);
    const intent = { fire: true, right: true };
    if (aim.ok && aim.v > 0) intent.up = true;
    if (aim.ok && aim.v < 0 && !p.grounded) intent.down = true;
    if (this.dodge(ctx)) this.press(ctx, this.holdMs(true));
    forwardJumps(this, ctx, intent);
    return intent;
  },

  climber(ctx) {
    const p = ctx.player;
    const c = contactIntent(this, ctx);
    if (c) return c;
    // ladders: a rail under the feet that goes up is always taken
    if (p.traversalState === 'ladder') return { up: true, right: true, fire: true };
    const rail = ctx.level.ladders.find((r) => Math.abs(r.x - p.x) < 0.42 &&
      p.y >= r.y0 - 0.15 && p.y < r.y1 - 0.5);
    const held = gateHeld(ctx);
    if (held && ctx.corner.state === 'gate') return engage(this, ctx);
    const aim = this.aimDecision(ctx, false);
    const intent = { fire: true, right: true };
    if (rail && !held) { intent.up = true; return intent; }
    if (aim.ok && aim.v > 0) intent.up = true;
    // the highest surface ahead that a jump (+ air jump) can reach
    if (p.traversalState === 'free') {
      let best = null;
      for (const pl of ctx.level.platforms) {
        if (pl.x1 < p.x + 1.2 || pl.x0 > p.x + 5.5) continue;
        const rise = pl.y - p.y;
        if (rise < 0.8 || rise > 4.7) continue;
        if (!best || pl.y > best.y) best = pl;
      }
      if (best && p.grounded) this.press(ctx, this.holdMs(true));
      if (best && !p.grounded && p.vy < 1.5 && p.y < best.y + 0.2 && p.airJumpsLeft > 0)
        this.press(ctx, this.holdMs(true));
      // never voluntarily drop: on a platform end, jump toward the next one
      if (p.grounded && p.onOneWay && p.x + 1.2 > p.onOneWay.x1) this.press(ctx, this.holdMs(true));
    }
    if (this.dodge(ctx)) this.press(ctx, this.holdMs(true));
    forwardJumps(this, ctx, intent);
    return intent;
  },

  fighter(ctx) {
    const p = ctx.player;
    const c = contactIntent(this, ctx);
    if (c) return c;
    if (gateHeld(ctx) && ctx.corner.state === 'gate') return engage(this, ctx);
    const aim = this.aimDecision(ctx, true);
    const intent = { fire: true };
    const span = ctx.edges.right - ctx.edges.left;
    const want = ctx.edges.left + span * this.prof.screenFrac;
    let goal = want;
    if (aim.ok && aim.t) goal = Math.max(ctx.edges.left + 5, Math.min(aim.t.e.x - 3, ctx.edges.right - 2));
    if (gateHeld(ctx) && ctx.corner.state === 'approach') goal = ctx.edges.right + 50;
    if (ctx.margin < 4) goal = Math.max(goal, p.x + 3);
    if (goal > p.x + 0.8) intent.right = true;
    else if (goal < p.x - 0.8) intent.left = true;
    // aim: horizontal key IS facing, so align it with the ray when the ray
    // has a horizontal part; a vertical ray stops RIG for the shot
    if (aim.ok) {
      if (aim.h > 0) { intent.right = true; intent.left = false; }
      if (aim.h < 0) { intent.left = true; intent.right = false; }
      if (aim.v > 0) intent.up = true;
      if (aim.v < 0 && !p.grounded) intent.down = true;
    }
    const zone = mortarZoneUnderfoot(ctx);
    if (zone && this.rng() < this.prof.dodgeSkill) {
      intent.right = p.x >= zone.x; intent.left = !intent.right;
    }
    if (this.dodge(ctx)) this.press(ctx, this.holdMs(true));
    forwardJumps(this, ctx, intent);
    return intent;
  },

  carried(ctx) {
    const p = ctx.player;
    const c = contactIntent(this, ctx);
    if (c) return c;
    // a held gate is fought with the same reflex, at this hand's low skill
    if (gateHeld(ctx) && ctx.corner.state === 'gate') return engage(this, ctx);
    const intent = { fire: true };
    if (ctx.margin < this.prof.marginTarget || (gateHeld(ctx) && ctx.corner.state === 'approach'))
      intent.right = true;
    const aim = this.aimDecision(ctx, false);
    if (aim.ok && aim.v > 0 && aim.h >= 0) intent.up = true;
    if (this.dodge(ctx)) this.press(ctx, this.holdMs(true));
    if (intent.right) forwardJumps(this, ctx, intent);
    return intent;
  },
};

export const POLICY_IDS = Object.freeze(Object.keys(BEHAVIOUR));
