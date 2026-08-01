# The first gap (I-021): fair — and the arithmetic that made it look marginal does not apply there

T-020, `lattice-designer` lane, against `main` (worktree `task/T-020`). No game
file changed. The whole deliverable is one finding, one repro, and the guard
whose absence let a 3-tile hole read as a mystery for a whole sprint:
`tools/pathcheck.mjs` now proves, by driving the real `src/sim/player.js` loop,
that every generated gap is crossable **at the slowest speed RIG can ever
have**, not just at run speed.

**Verdict: outcome (i). The gap is authored to be jumped, it is crossable with
real margin, and the bot could not see it.** The geometry stays. The generator
is untouched. `CONFIG`'s jump and movement constants were never a candidate.

---

## 1. The repro, exact to three decimals

Run from the repo root — no browser, no harness, no npm:

```sh
node --input-type=module -e '
globalThis.__HB_QUERY__ = "";
const S = new URL("src/sim/", "file://" + process.cwd() + "/");
const [T, E, LV, P, I] = await Promise.all(
  ["time.js", "edges.js", "level.js", "player.js", "input.js"]
    .map((f) => import(new URL(f, S).href)));
const { CONFIG } = await import(new URL("../config.js", S).href);
const p = P.player;
for (const policy of ["hold-right", "floor-probe"]) {
  T.setScrollX(0); E.setEdges(-27.44, 45.73);        // FAR, 1440x900
  for (const k in I.keys) I.keys[k] = false;
  p.x = 6; p.y = 3; p.vx = 0; p.vy = 0; p.grounded = true; p.onOneWay = null;
  p.hp = 3; p.lives = 3; p.iframesUntil = 0; p.hitstunUntil = 0;
  P.clearPlayerTraversal(0); I.clearJumpBuffer(); I.keys.right = true;
  const t0 = T.gameMs; let until = 0, prev = 6, off = null, done = false;
  for (let f = 0; f < 900 && !done; f++) {
    if (policy === "floor-probe" && p.grounded &&
        (LV.groundTopAt(p.x + 1.7) < -100 || LV.groundTopAt(p.x + 1.2) > p.y + 0.6)) {
      I.bufferJumpUntil(T.gameMs + 120); I.keys.jump = true; until = T.gameMs + 260;
    }
    if (T.gameMs > until) I.keys.jump = false;
    T.advanceGameMs(1000 / 60);
    T.setScrollX(T.scrollX + CONFIG.scrollSpeed / 60);
    P.updatePlayer(1 / 60);
    const t = (T.gameMs - t0) / 1000;
    if (!off && !p.grounded && p.x > 28) off = { t, x: p.x };
    if (p.lives < 3) { console.log(policy, "life lost t=" + t.toFixed(2) + "s at x=" + prev.toFixed(3),
      "| left the lip t=" + off.t.toFixed(2) + "s x=" + off.x.toFixed(3)); done = true; }
    prev = p.x;
    if (p.x > 88) { console.log(policy, "reached the first wave gate x=" + p.x.toFixed(1),
      "t=" + t.toFixed(2) + "s with " + p.lives + " lives"); done = true; }
  }
}'
```

```
hold-right life lost t=3.08s at x=31.649 | left the lip t=2.52s x=29.363
floor-probe reached the first wave gate x=88.1 t=10.02s with 3 lives
```

The first line is I-021, reproduced without a browser: `3.0 s`, `x = 31.649`.
The second line is the same run with one extra clause in the policy — the
terrain lookahead `tools/pathcheck.mjs`'s own headless bot has always used —
and it crosses both face-1 gaps and arrives at the first wave gate with all
three lives.

### What `x = 31.649` is

It is not where RIG fell. It is where he stopped moving sideways:

```
31.649 = 32 − hw − 0.001          hw = CONFIG.player.width / 2 = 0.35
```

that is `player.x = ci - player.hw - 0.001` in `src/sim/player.js`'s
right-moving x-resolution, with `ci = 32`, the first solid column past the gap.
RIG walks off the near lip at `x = 29.363` (`t = 2.52 s`), falls, and slides
down the **far lip's wall face** until `y < CONFIG.edges.killY`. The x is a
constant of the geometry and the collision epsilon, which is exactly why three
different tree states reported it identically to three decimals — the number
was never evidence of anything except "nobody jumped."

The timing matches too: lip at 2.52 s, `y = 2 → −7` under
`gravity × fallGravityMult = −54` is `sqrt(2·9/54) = 0.577 s`, so the life is
spent at 3.08 s. T-018's sampler reported it at 3.0 s.

---

## 2. Where the "3.0 tiles per held jump" arithmetic actually applies

The task handed me an arithmetic to check rather than trust: RIG is clamped to
the right of the screen, so holding right crosses ground at `scrollSpeed` 4.3,
not `runSpeed` 9.4; a held jump therefore travels ≈3.0 tiles; the gap is 3 wide;
so it is exactly marginal.

**Every step of that is true except the premise that it binds at x = 29.** It
describes RIG *when he is jammed against the right screen clamp*, and at the
first gap he is nowhere near it.

RIG's ground speed has a floor and a ceiling:

- **ceiling** = `CONFIG.player.runSpeed` = 9.4 t/s, whenever there is screen
  ahead of him;
- **floor** = `CONFIG.scrollSpeed` = 4.3 t/s, when `player.x + hw` is pinned to
  `sRightEdge() − edges.margin`, because that edge advances with `scrollX`.
  Holding right harder does nothing; the clamp assigns the position.

The run starts with `player.x = 6` and `scrollX = 0` (`src/main.js` `resetGame`),
and the shipped default view is FAR (`decisions.md` entry 7, `VIEW_ID`
resolves to `far`). Reconstructing `render/camera.js`'s edge probe from
`CONFIG.camera` gives the s-strip the player actually gets:

| view | aspect | EDGE_L | EDGE_R | strip | clamp catches an unobstructed held-right RIG at |
| --- | --- | --- | --- | --- | --- |
| **far (shipped)** | 16:9 | −31.11 | 50.23 | 81.3 t | t ≈ 8.6 s, x ≈ 87 |
| **far (shipped)** | 1440×900 | −27.44 | 45.73 | 73.2 t | t ≈ 7.7 s, x ≈ 78 |
| mid | 1440×900 | −18.32 | 36.63 | 55.0 t | t ≈ 5.9 s, x ≈ 62 |
| near (`?view=near`) | 1440×900 | −10.38 | 28.74 | 39.1 t | t ≈ 4.4 s, x ≈ 47 |

The last column is the first-order solve of `6 + 9.4t = EDGE_R − 0.4 + 4.3t`;
terrain pushes it later, because every `+2` step RIG does not clear zeroes his
vx for a frame. Measured on the repro's floor-probe run: FAR/1440×900 catches
him at t = 8.9 s, x = 83.1; `?view=near` at t = 5.2 s, x = 50.5. Both still
well past the first gap.

(Sanity check on the same math: it reproduces `CONFIG.viewScales`' own measured
RIG screen-height fractions, 7.1 % near and 3.74 % far, against the documented
7.0 % / 3.7 %.)

RIG reaches the first gap's lip at **t = 2.52 s, x = 29.36**, at 9.4 t/s, with
the clamp 40-plus tiles ahead of him in the shipped view. The repro confirms it
from the other side: in every calibration above, including the narrowest, the
hold-right run dies at 31.649 having **never touched the right clamp**. A
face-length is 65 tiles and every corner gate hands the next face back with the
plane ~45 tiles behind, so a player who holds right is never clamped on face 1
at all in the shipped view.

So the first gap is met at the **ceiling**, and the honest window there is not
3.0 tiles of reach against a 3-tile hole — it is 4.22 tiles of takeoff
position, 449 ms.

---

## 3. Measured windows, every gap, from the real sim

The probe (now in `tools/pathcheck.mjs`) stands RIG on a gap's left lip at a
swept takeoff position, holds right, presses jump once, and asks whether he
ends up standing, alive, past the gap. Landing on a catwalk that reaches past
the gap counts, because a player standing on one has crossed. "Floor" pins him
against the right clamp so his ground speed is exactly 4.3; "run" lets him move
at 9.4. dt = 1/60.

| gap | w | lips | floor, single jump | floor, w/ air jump | run, single jump | late-press grace at the floor |
| --- | - | ---- | --- | --- | --- | --- |
| **29-31** | 3 | 2→2 | **0.74 t / 172 ms** | 0.74 t / 172 ms | **4.22 t / 449 ms** | 16 f (267 ms) |
| 48-50 | 3 | 2→2 | 0.74 t / 172 ms | 0.74 t / 172 ms | 2.14 t / 228 ms | 16 f (267 ms) |
| 102-104 | 3 | 4→4 | 0.82 t / 191 ms | 0.82 t / 191 ms | 4.22 t / 449 ms | 16 f (267 ms) |
| 263-266 | 4 | 2→2 | **none** | 5.62 t / 1307 ms | 3.22 t / 343 ms | — |
| 294-297 | 4 | 2→2 | 1.82 t / 423 ms † | 1.82 t / 423 ms | 4.20 t / 447 ms | 0 f |
| 321-325 | 5 | 2→2 | 4.82 t / 1121 ms † | 4.82 t / 1121 ms | 6.82 t / 726 ms | 0 f |
| 329-330 | 2 | 2→2 | 1.74 t / 405 ms | 1.74 t / 405 ms | 5.22 t / 555 ms | 16 f (267 ms) |
| 334-335 | 2 | 2→2 | 1.74 t / 405 ms | 1.74 t / 405 ms | 5.22 t / 555 ms | 16 f (267 ms) |
| 357-358 | 2 | 4→4 | 1.74 t / 405 ms | 1.74 t / 405 ms | 5.22 t / 555 ms | 16 f (267 ms) |
| 362-363 | 2 | 4→4 | 1.74 t / 405 ms | 1.74 t / 405 ms | 5.22 t / 555 ms | 16 f (267 ms) |
| 392-393 | 2 | 2→2 | 4.82 t / 1121 ms | 4.82 t / 1121 ms | 7.20 t / 766 ms | 16 f (267 ms) |
| 397-398 | 2 | 2→2 | 1.74 t / 405 ms | 1.74 t / 405 ms | 8.32 t / 885 ms | 16 f (267 ms) |

† crosses only because a mid-lane catwalk sits over the gap and catches RIG
mid-flight (`{294-297: 295..301 @ 4.35}`, `{321-325: 319..326 @ 4.35}`). A real
route, but an incidental one: the tier pass places catwalks without knowing
where the gaps are, and the reachability prune can delete one.

Three things this table says that the old assertions could not:

1. **The first gap is fair at both ends of the speed band.** 449 ms of takeoff
   at the speed RIG actually has there; still 172 ms if he were somehow pinned.
   The takeoff geometry is 2.34 tiles of required travel (RIG stays grounded
   out to `x = 29.33` because `floor(x − hw + 0.02)` still indexes the lip, and
   lands as soon as `floor(x + hw − 0.02)` reaches 32, i.e. `x ≥ 31.67`) against
   3.04 tiles of flight at the floor and 6.64 at the ceiling.
2. **Late presses are forgiven by the air jump, not by coyote time.** Measured
   with the air jump withheld, the grace on every level gap is **0 frames**:
   one frame past the lip RIG's feet are already below the far lip's top, and a
   jump only restores the height it left from, so he arrives at the far wall's
   *face* — the 31.649 slide again. `coyoteMs` buys nothing across a flat gap.
   With the air jump (the shipped vocabulary) a press up to **16 frames /
   267 ms late** still crosses.
3. **One gap in the level is not single-jump crossable at the floor**:
   263-266, 4 wide. A player pinned to the clamp there must spend the air jump
   (window 5.62 t) or arrive with room to run (3.22 t at the ceiling). It is
   past the first wave gate and past several high-lane mounts that already
   require the double jump, so the verb is taught by then — but it is the one
   place in the level where "fall behind and you cannot cross" is literally
   true, and it is flagged, not fixed, by this task (see §6).

The first gap also has a second route, as the lattice doctrine wants: the
mid-lane catwalk `26..35 @ y 6.35` spans it. From the deck a double jump reaches
it — at run speed (`26.5 → catwalk at x 34.96`) and at the scroll floor alike
(`26.0…28.0 → catwalk at x 29.87…31.87`) — and from x ≥ 27 at run speed the
double jump clears the whole thing and lands on the h=4 plateau beyond
(`27.0 → ground y=4 at x 37.18`).

---

## 4. So why did the bot die there, every single run?

Because its policy grammar could not express "there is a hole ahead", which is
what T-018 diagnosed and T-019's terrain probe closes. Two specific mechanisms,
both visible in the repro:

- **hop-on-every-landing** takes off wherever the last landing happened to be.
  At run speed a full jump covers 6.6 tiles, so a hop from x ≈ 24.5 lands at
  ≈ 31.1 — inside the hole. The lethal takeoff band is *before* the window, not
  after it: at run speed anything left of x = 25.09 lands short.
- **hold-right-and-never-jump** walks off at 29.363. Nothing in the level is
  wrong with that; it is a pit.

One honest caveat found while measuring, because it is the same class of trap:
with `tools/pathcheck.mjs`'s frozen edge constant (`setEdges(-18.9, 26.4)`,
which predates the FAR default and is fine for the A/B it serves), the clamp
catches RIG at x ≈ 46 — and the 1.7-tile-lookahead hop then takes off at
x = 47.437 for gap 48-50, whose floor window opens at 47.58. It misses by
0.14 tiles, **33 ms**, and dies at 50.649 — the far lip of gap 2, same
signature. That is what a genuinely marginal gap looks like, and it is what
this task was sent to check for. It is a property of that viewport constant,
not of the shipped one.

---

## 4b. A second, unrelated hazard at the same tile — found while measuring

This is **not** I-021 (which recorded full hp and no hostile within 14 tiles),
and it is not fixed here. It is reported because it is the same tile and the
same lane, and it wants an operator verdict rather than an assertion.

`CONFIG.spawner.startS = 28`, so the ambient table's first row is
`{x: 28, type: 'wasp'}` — one column before the first gap's near lip, i.e. on
the takeoff itself:

```
first 6 spawn rows: [{"x":28,"type":"wasp"},{"x":39,...},{"x":50,...},
                     {"x":53,"type":"carrier"},{"x":61,...},{"x":72,...}]
```

Running the full sim (scroll, spawner, hostiles, wave gate; FAR view; the
terrain-probe hop policy; fire off to isolate the question) that wasp reaches
RIG **while he is airborne over the gap**:

```
t=2.67s RIG x=30.72 y=4.38 hp 3->2   nearest hostile 31.50, 5.05
t=3.47s RIG x=2.50  y=7.00 life lost (respawn)
```

`damagePlayer` sets `vx = away * knockbackX` with `away = sign(x − fromX)`, so
a hit taken from ahead throws RIG **backwards, into the pit he is crossing**.
Contact damage over a gap is therefore a life, not a heart — and it lands at
t ≈ 2.7 s, before the player has been taught anything. With fire on the same
run still takes the hit; the bot simply cannot aim (T-018).

Options, none of them taken here because all three are difficulty judgements:
push `spawner.startS` past the first landing strip (a one-number change,
`28 → 33`), keep the row and let the opening teach "shoot before you jump", or
leave it and treat the compound punishment as the point.

---

## 5. The guard that was missing, and what is there now

The generator section already asserted a *width* (`gap runs <= gapMax`) and the
frozen-tune section already asserted a *reach*:

```js
ok((tUp + tDown) * PL.runSpeed > CONFIG.gen.gapMax + 1.5,
   'full jump at run speed clears the widest gap with margin');
```

Both true. Neither asks a player's question, because both use `runSpeed` — the
speed RIG can *never exceed* — and neither one places him anywhere. Same failure
mode as T-009's pocket assertions: true statements about what the generator
intended, silent about what a player can do. That assertion is kept (it is not
wrong) and is now complemented rather than replaced.

New in `tools/pathcheck.mjs`, next to the other generator gap checks, driving
the real `src/sim/player.js` in a child process so it cannot perturb the shared
clock/keys/edges:

- every generated gap is enumerated from the real `groundH`, cross-checked
  against this file's own copy so a probe that saw different terrain trips;
- **every face-1 gap before the first wave gate is crossable from the deck at
  the scroll floor with one held jump**, with a takeoff window at least one
  jump-buffer wide (`jumpBufferMs × scrollSpeed` = 0.52 t) — the threshold is
  derived from `CONFIG`, not a magic number: a window narrower than the input
  buffer means the game's own forgiveness cannot cover a mistimed press;
- the same gaps are **strictly** wider at run speed (a probe that quietly lost
  its pin would measure the two as equal, so this is the pin's own guard);
- the first gap is still 29-31 at h=2, and jumpable at both speeds;
- a press one coyote-window late still crosses every face-1 gap;
- **every** gap in the level is crossable at the floor with the taught
  vocabulary (run, jump, air jump);
- no gap that *needs* the air jump at the floor appears before the first wave
  gate — the teaching-order property, derived from the layout rather than
  hard-coded.

**Negative controls** (both run, both reverted):

| mutation | result |
| --- | --- |
| force every `gapHop` chunk to `gapMax` columns | 4 of the new assertions fail, naming `50-54(w5) floor 0.00t/0ms` and the air-jump-only list; the pre-existing generator fingerprint assertions fail too |
| take the pin off the floor probe (`floor: false`) | `the probe really is measuring the floor, not a free run` fails |

`node tools/pathcheck.mjs` → **1527 passed, 0 failed** (was 1517), 1.9 s (was
1.7 s).

### What these assertions deliberately do not claim

- They measure **takeoff position windows**, not human reaction. A 172 ms
  window is not a claim that 172 ms is enough for a player; it is a claim about
  what the geometry permits. Feel is the operator's call (§6).
- They test one held jump (and one air jump), holding right, with no hostiles,
  no knockback, no i-frames and no capsule in the air. A wasp in the takeoff
  frame is a different question and is not covered.
- Two crossings depend on catwalks (†). The probe reports that they cross; it
  does not assert that the catwalk exists.
- `dt = 1/60`. The frame-rate floor is covered by the existing discrete-apex
  assertions; spot-checked here, the first gap's floor window does not shrink
  at lower cadences — 0.750 t at 60 Hz, 0.835 t at 30 Hz, 0.920 t at the 0.05 s
  `src/main.js` clamp floor.

---

## 6. Open for the operator (feel, not machine)

1. The first gap is a **death pit at t = 2.5 s**, before any teaching, any
   enemy, and any wave gate. It is crossable with 449 ms of takeoff and a
   267 ms late-press grace, and the mid catwalk over it is a second route — but
   "the first thing the game does is kill you if you only hold right" is a
   deliberate statement. Contra opens the same way. Keep, or move the first gap
   later and open on a step instead?
2. Falling in costs a whole **life**, not altitude. `?fallback=1` (HULL
   FALLBACK, CP4 promotion) would catch the fall and cost position instead.
   Should the run's default setback for a *fall* be a fallback rather than a
   stock life?
3. Gap **263-266** is the one place a player pinned to the clamp cannot cross
   on the ground jump; the air jump is mandatory there. Fix it in the
   generator (narrow it, or drop a landing lip in its last column — a one-column
   edit that shifts nothing downstream), or leave it as the level's one
   double-jump toll gate?
4. Coyote time buys **zero** frames across a level gap (§3.2) — the recovery is
   always the air jump. Worth a design note, or worth a lip that is one tile
   lower on the far side so coyote can save it?
5. The ambient table's first wasp sits on the first gap's takeoff lip (§4b),
   and a contact hit over a pit is knocked *backwards* into it, so it costs a
   life rather than a heart. Move `spawner.startS` past the landing strip
   (`28 → 33`), or is "shoot before you jump" the intended opening lesson?

---

## 7. Verification

- `node tools/pathcheck.mjs` → **1527 passed, 0 failed** (1517 before this
  task), 1.9 s.
- The §1 repro, terrain only: the terrain-probe policy crosses both face-1 gaps
  and reaches the first wave gate's column with **all three lives**.
- Full sim (scroll + spawner + hostiles + wave gate, FAR view, same policy):
  reaches corner 1's gate at t = 17.4 s with lives left, and **no life is lost
  to either face-1 gap on its own**. The losses it does take are contact
  damage, the first of them the §4b wasp whose knockback throws RIG backwards
  into the first gap — a hostile-placement question, not a terrain one. The
  bot's inability to aim is T-018's documented harness limit, not a difficulty
  measurement.

## 8. Files

- `tools/pathcheck.mjs` — the probe and its assertions (search
  `FAIR-GAP INVARIANT`).
- `docs/playtests/2026-08-gate-fight-harness.md` — T-018, where the anomaly
  surfaced.
- No `src/` file changed by this task.
