# T-035 — the value ladder (packet items S1 + S2)

Worktree `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-035`,
branch `task/T-035` (fast-forwarded to main's `856a9a3` before work started, so
the packet and `artifacts/look-v1/` were in the tree).

**SHIPPED AT THE OPERATOR'S DOSE.** Verdict 2026-08-02: *"C on the ladder feels
better, shade=0.5 the other is too dark."* Half strength is now the **default**
— the plain URL is the approved build — `?shade=0` is the escape hatch to the
pre-T-035 value range, and `?shade=1` is the full ladder he rejected, kept
reachable and correct for a re-ask. Everything below was re-measured at the
approved dose; numbers describing the rejected dose are labelled as such.

**No aesthetic verdict is claimed anywhere in this report.** The operator made
the only one there is.

**WHAT THIS DOES AND DOES NOT REACH — up front, not in a footnote.** This is
not a whole-game value change. `src/render/limb.js` gates on `IS_G1`, so the
LIMB half of the ladder — the 829-piece body, most of the pixels it moves —
applies to the six-face run **only**. It changes nothing under
`?slice=traversal` or `?slice=transform`. The DECK half (`src/render/level.js`)
reaches the six-face run and the traversal slice; the transform slice bakes no
deck tiles, so `?slice=transform` is unaffected entirely. The S2 haze shift is
`IS_G1`-only too. The last look pass overclaimed by moving hue over
byte-identical geometry, so: every number below is the six-face run unless the
row says "slice".

---

## What changed and why

The packet's finding is that the grey-box read is a VALUE range, not a hue:
0.0% of playfield pixels over luminance 200, 99% inside a 45–70 window of 255,
one flat token over 29–34% of the screen. The cause is structural:
`palette.js` authors where a **lit** face lands (~0.45× albedo, re-measured and
confirmed — `PAL.ground`'s token luminance 141.6 renders at 63) and nothing
ever authored where an **occluded** one lands. `CONFIG.limb.tone` is ±4% of
*hue*, so every instance of a material shipped at ~1.0× its token.

- **`src/pure/shade.js` (new, THREE-free, deterministic).** Four terms folded
  into one multiplier per baked piece: key-light extinction by depth behind the
  combat plane; ring occlusion sampled from an occupancy grid built from the
  whole plan (a piece's own footprint is skipped, so a big plate is not dark for
  being big); a top-face rake lift read off the piece's proportions; and a
  coherent two-octave wear field seeded through `mulberry32` on integer lattice
  cells of `(s, y)`. `limbShadePlan(plan, cfg, gain)` is plan-level by
  construction — occlusion is about what is *around* a piece. `deckShadePlan
  (groundH, cfg, gain)` is the deck's half. No time argument, no `Math.random`,
  no `Date.now`/`performance.now`, no upward imports.
- **Dose, not a boolean.** Every export returns `1 + gain * (raw - 1)`, so
  gain 0 is **exactly** 1.0. `CONFIG.shade.dose = 0.5` is the operator-approved
  strength and the default; `resolveShadeGain` falls back to it for absent,
  empty and junk values (the way `resolvePaletteId` falls back to `concept`), so
  a typo cannot serve a look nobody approved.
- **Why the dose stayed a gain instead of being folded into the constants.**
  The interpolation happens on the final clamped multiplier, so half strength is
  *not* reproducible by halving each constant — and the operator judged a
  specific set of pixels. Keeping the gain means the approved frames reproduce
  bit for bit (verified: the default URL and `?shade=0.5` hash identically), the
  rejected dose stays available for a re-ask, and the "off" path stays exact.
- **`src/render/limb.js` / `level.js`** apply it to the existing instance
  colors — still `new THREE.Color(token)`-derived, no literals, one reused
  scratch `Color` on the deck path.
- **`src/config.js`** carries the model and the dose with their reasoning.
- **`src/render/camera.js`** (one line + comment, granted by the integrator)
  selects the S2 haze band when the ladder is armed.
- **`tools/pathcheck.mjs`**: +44 assertions in ONE delimited block
  (`/* ==== T-035 value ladder (S1 + S2) ==== */`) immediately before the
  summary lines, importing dynamically so the shared header is untouched.

---

## Verification — every command and its result

| command | result |
|---|---|
| `node tools/pathcheck.mjs` | **1749 passed, 0 failed** (main baseline 1705 → +44) |
| `index.html?selftest=1` (default = approved dose) | SELFTEST PASS (29 checks) |
| `?selftest=1&shade=0` / `&shade=1` | PASS (29) each |
| `?selftest=1&palette=classic` | PASS (29) |
| `?selftest=1&slice=traversal` | PASS (31) |
| `?selftest=1&shade=1&slice=transform` / `&zip=1` / `&view=near` | PASS (30 / 26 / 29) |
| `six-face-full-run.json --deterministic`, default URL | `died`, 1 death, 0 falls |
| same, `?shade=0` | `died`, 1 death — **summary JSON identical**, life lost at the same x = 31.649 |
| `mid-route.json --deterministic`, `?slice=traversal` | `completed`, 0 deaths |
| draw calls / instanced meshes / instances (live `renderer.info` + scene walk) | 94 / 13 / 2969 at every dose |
| page errors across all capture runs | none |

Playtests ran from the main checkout's harness with `--base-url`/`--url`
against the pinned worktree on port 8749, `--out` into the scratchpad: nothing
written under `tools/playtest/`. Ports 8741/8742 untouched; 8749/8750 killed
after use.

### Byte fidelity, checked across trees (the lead's condition 3)

Instance colors read live out of the running scene and hashed, plus the fog
band and background — `main` (pre-T-035) against this worktree:

| build | hash | fog band | bg |
|---|---|---|---|
| `main` default | `acdfb9bb` | 44.25 / 72.25 | `#2f565e` |
| T-035 `?shade=0` | `acdfb9bb` | 44.25 / 72.25 | `#2f565e` |
| `main` `?palette=classic` | `98b8c4a0` | 44.25 / 72.25 | `#46525f` |
| T-035 `?palette=classic` | `98b8c4a0` | 44.25 / 72.25 | `#46525f` |
| T-035 `?palette=classic&shade=1` | `98b8c4a0` | 44.25 / 72.25 | `#46525f` |
| T-035 **default** | `67d289c6` | 46.75 / 74.75 | `#2f565e` |
| T-035 `?shade=0.5` | `67d289c6` | 46.75 / 74.75 | `#2f565e` |

`?palette=classic` is byte-faithful to the pre-T-035 grey-box whatever
`?shade=` says; `?shade=0` restores the old look exactly; the default is
bit-identical to the dose he approved.

---

## The gates, at full strength and at the shipped dose

Luminance is Rec.709 over **sRGB display bytes** — the space the packet's
evidence is measured in — while the multiplier acts in the renderer's linear
working space, so each instance is taken token → linear → ×tone ×shade → back
to sRGB → luma.

| packet gate | `?shade=0` (today) | **SHIPPED (0.5)** | `?shade=1` (rejected) |
|---|---|---|---|
| (a) instances below 0.55× their token | 0.0% | **0.0%** ✗ | 70.9% ✓ |
| (a) worst per-material normalized spread | 0.000 | **0.069** ✗ | 0.490 ✓ |
| (a) per-material display ramp, levels | 0–3.1 | **4.1–15.4** | 21.8–53.9 |
| (b) checker token delta | 16.77 | **16.77** ✓ | 16.77 ✓ |
| (b) worst-column row-1→row-2 step | −16.8 | **3.0** ✗ | 21.5 ✓ |
| (b) along-s deck wear swing (must stay under 11.9%) | 0% | **4.0%** ✓ | 8.2% ✓ |
| (c) columns where the deck top row is NOT brightest | **404** | **0** ✓ | 0 ✓ |
| (c) dimmest deck top row vs brightest limb instance | 124.8 vs 143.4 ✗ | **129.0 vs 122.2** ✓ | 131.5 vs 98.5 ✓ |
| (e) plan pieces / material buckets / draw calls | 829 / 8 / 94 | 829 / 8 / 94 ✓ | 829 / 8 / 94 ✓ |

**Two of the packet's falsifying tests cannot hold at the approved dose, and I
am not restating them to fit.** Stated plainly, with the arithmetic:

1. **"≥20% of instances below 0.55× their token" is out of reach below about
   gain 0.75** — measured 0.0% at 0.6, 2.3% at 0.75, 48.3% at 0.9, 70.9% at 1.0.
   Every multiplier is interpolated toward 1.0 by the dose, so at 0.5 the
   darkest instance is 0.516× in linear terms, which is 0.76× in display terms.
   The same arithmetic caps the per-material spread at 0.069 against the
   packet's 0.45.
2. **The deck's row-1→row-2 step (3.0 levels) no longer exceeds the checker's
   delta (16.77).** The half of that gate which protects a pillar still holds:
   the checker's own tokens and delta are untouched, so no scroll-speed carrier
   was traded away — the deck lip is simply a second, smaller carrier at this
   dose rather than the bigger one.

Both are asserted at `?shade=1` (the model must still be able to produce the
packet's range) and separately **recorded as limits** at the shipped dose, so a
reader cannot mistake the packet's gates for met. What the shipped dose is
gated on instead, and does hold: every material's display ramp is at least 2×
today's (measured 2.7×–7.3×), the worst per-material spread is >6× today's, and
gate (c) — "the deck stays the brightest surface", the one rule `palette.js`
states in prose — **passes at the shipped dose and fails in the build we have
today, in 404 columns.**

### Captures (pre-registered, `artifacts/shade-v1/`)

- **P1 (the gate) PASSED:** paired-population separation −15.0 → **−35.7** at
  10 s (2.4× wider), with the teal backdrop median unmoved at 78. Direction
  matches board 13 (far body L=78 over near deck L=36).
- **P2 (my own anti-"dirty, not lit" guard) FAILED AS WRITTEN**, at this dose
  too: p95 90 → 78 (−13%, cap −5%). Diagnosis: p95 is a *mid-tone* statistic
  here (the deck stack and hull, one flat value today, are now ramped). The
  highlight statistics held at the shipped dose: share over L100 1.1% → 1.1%,
  over L140 0.11% → 0.10%, rust p99 112 → 112, rust max 222 → 222.
- **P3 (reported):** share under L25.5 goes 0.5% → 4.9% (boards: 24–29%; the
  rejected dose was 51.2%).
- **Traversal slice cost: 3 levels** of separation (33.5 → 30.4) with its top
  end brighter (rust p95 106 → 112). At full strength that number was 14.1.

---

## Open items for the integrator

1. **The verdict deserves a `docs/decisions.md` entry** — it is an operator
   ruling on a shipped default, and the log is the place verdicts live. I did
   not write it: `docs/decisions.md` is not in my lane and the entry number is
   yours to assign. Proposed text: *"The baked value ladder ships ON at half
   strength (`CONFIG.shade.dose = 0.5`). Full strength (`?shade=1`) is judged
   too dark and is kept reachable for comparison only; `?shade=0` restores the
   pre-T-035 value range. Consequence: two of the look packet's S1 falsifying
   tests describe the rejected full dose and are asserted there, not at the
   shipped dose — the verdict outranks the threshold."*
2. **`artifacts/palette-v1/` is now stale** — with the ladder on by default the
   concept side of those pairs moves value *and* hue. The hue-only A/B is
   `?palette=classic` against `?shade=0`. The packet already warned those pairs
   must be re-captured, never inherited.
3. **`window.HB.g1.fog` under-reports.** It hard-reads `CONFIG.limb.fog`, so on
   the default URL the debug handle now names a band the renderer is not using.
   `src/main.js` is fenced to T-032. Worth an Inbox issue.
4. **S2's widening is still blocked** on the same file: `src/main.js`'s selftest
   asserts `limb haze armed` as a band-*width* comparison, so the retune shipped
   as a same-width shift (which does take the play band fully out of the fog
   ramp: 0.0% at every view and aspect, against 3.3–9.3% today). The deepest
   authored slab at depth −34 is still erased at fog 1.00 under both bands; the
   widened numbers are derived and recorded in `config.js`, and a pathcheck
   assertion records the limit.
5. **`src/render/camera.js`** is outside my original file list; the integrator
   checked ownership and granted it. Whole diff: +1 import, +1 expression, +7
   comment lines. With `?shade=` absent, `SHADE_GAIN` is 0 and the expression
   selects exactly `CONFIG.limb.fog`.

---

## What is still an open feel question

The verdict answered *how much*. Two things it did not explicitly rule on, and
neither is worth re-asking on its own — fold them into the next look checkpoint:

- **The traversal slice** (`?slice=traversal`) gets the deck half only, and
  loses 3 levels of deck-vs-void separation. Frame 09 in `artifacts/shade-v1/`.
- **The direction question** (does the haze band stay brighter than the play
  surfaces, board-13 style?) is answered *by adoption* at this dose rather than
  by an explicit ruling. Every downstream look item — backdrop tiers, sky ramp,
  seam pips — calibrates against it, so if it was not a deliberate choice, that
  is the one to re-ask before S3/S4/S5 start.

## Single best next action

Land the merge, then record the verdict in `docs/decisions.md` (item 1) before
any other look item starts — S3/S4/S5 all calibrate against the value range
this task just fixed at 0.5, and a lane that reads the packet's un-annotated
thresholds will build against the rejected dose.
