# OPERATOR PACKET — "Glyph scale at FAR", four directions as artifacts

**Task:** T-036. **Nothing in this packet ships.** No file under `src/` and no
line of `index.html` changed; the game boots byte-identically with every file
under `assets/` deleted (proved below). This exists so the held decision is made
from pictures at true size instead of from prose.

**Nothing here says which one looks good.** Each direction is presented with
what it measures, what it costs, and what it would take to adopt. The choice is
yours; that is the whole reason the asset batch is held.

---

## Look at these four images first

Every one shows candidates at the pixel height they really have on screen at the
shipped FAR view, 1280×800.

| Image | What it answers |
| --- | --- |
| `sheet-A-letters.png` | can a letter still be told from another letter? |
| `sheet-CD-shapecode.png` | can a shape code, and does mark polarity matter? |
| `sheet-bg-teal.png` / `sheet-bg-deck.png` / `sheet-bg-limb.png` | does the answer change with what the capsule is sitting on? (it does) |
| `sheet-B-hud.png` | what the same read costs at a fixed HUD size |
| `sheet-mods.png` | the case none of the directions solves cleanly: `RG` / `GS` / `OL` / `CH` |

`viewer/` holds six single-asset frames in the standard viewer layout (true
size, RIG-height bar, 2×/4×/8×/native ramp) if you want one candidate alone.

---

## The number that changed since the question was filed

The checkpoint entry says a 0.55-tile capsule is **9.6px** and the letter is a
smudge. That was measured before the legibility pass shipped. **Today the drawn
face is 18.2px and the letter ink 13.1px**, because `GLYPH_GAIN` (1.9, exactly
the FAR pull-back) scales the mesh back up — `src/render/legibility.js`,
asserted at `tools/pathcheck.mjs:6084`. The 9.6px row is still in every sheet as
the uncompensated control, but **the row to judge is 18.2px**.

That matters for direction A specifically: the sanctioned fix from entry 7
("scale the tells and glyphs up") **is already spent to its designed maximum.**

---

## A — scale the world-space glyph up

Candidates `capsule-plate-s/l/h/f` (+ `-mod-rg`). Same language as today, redrawn
for minification: stroke 22/128 = 3.1 screen px, cap height exactly
`GLYPH_INK_FILL` 0.72, no rivets and no chamfer (T-015 measured both gone).

**Measured.** At 18.2px the most confusable pair of the four shipped weapon
letters (S/H) differs by **12.3** mean |ΔLuminance| per pixel; the best pair
(L/F) by 20.9. Scaling to 23.4 or 33.1px barely moves those numbers (12.3 →
12.4) — the letters differ over a small share of the face, so *size is not what
separates them*.

**Cost to adopt.**
- More scale is **not a tuning change, it is a rule change.** `SHARE.glyph`
  cannot exceed 1 without breaking pathcheck's "a compensated glyph lands at the
  SAME screen size at every view" (`tools/pathcheck.mjs:6089-6094`) and
  contradicting `legibility.js`'s own stated rule ("restoring near, never
  overshooting"). The alternative is raising `CONFIG.capsules.size`, which is a
  **sim** constant asserted unchanged at `:6100`, and which changes the pickup's
  world footprint, not just its picture.
- Headroom if you do decide to: the drawn box must stay inside the 0.95-tile
  catch circle. The shipped assertion (half-side) allows gain **3.45** = 33.1px;
  a corner-honest reading (the drawn face's diagonal) allows **2.44** = 23.4px.
  Today's is 1.9.
- **No runtime asset loading needed.** `src/render/capsules.js` draws the face
  into a canvas; these letterforms are rectangles, which port straight to that
  canvas. Loading the PNGs instead would need a runtime-asset decision (the
  look-direction packet's §4.4) — nothing here asks for one.
- The two-character mod label is a smudge at 18.2px and still marginal at
  33.1px (`sheet-mods.png`).

## B — move the letter read to the HUD

Candidates `hud-weapon-chip-spread`, `hud-weapon-chip-laser`, judged at 32 and
44 px.

**Measured.** At a fixed 32px chip the letter is ~22px — nearly double the
12px legibility floor, and it never shrinks, never rotates, never sits on a
moving backdrop. There is no discrimination problem here at all.

**Cost to adopt.**
- The HUD **already** does half of this: `src/ui/hud.js` prints `[S] SPREAD` at
  16px. So this direction is really "accept that a capsule's identity is only
  knowable *after* touching it".
- Pickup is on contact, and the swap is automatic. A player who likes his
  current weapon cannot avoid a swap he cannot see coming. Against the player
  model in `SPRINT.md`'s goal-change block — systematic, probing, notices
  inconsistencies — that is the failure mode to weigh.
- Implementation is UI-layer only, and needs **no runtime asset loading**: the
  start screen is already "flat-shaded CSS only: no image assets, no external
  fonts" (`index.html`). Shipping these chips as `<img>` files instead would
  need the runtime-asset decision.

## C — a shape code instead of a letter

Candidates `capsule-mark-spread/laser/homing/flame` (+ `-mod`): fan, bar, ring,
wedge, cut in ink out of the magenta face. Four topologies, not four letterforms.

**Measured.** Worst pair at 18.2px **18.6** vs direction A's 12.3; mean across
pairs 24.8 vs 15.8. It also holds up against the lit rust deck: mean luminance
sits 65–67 levels off the deck, so the object still reads as an object there.

**Cost to adopt.**
- A code has to be **taught**. Nothing in the game says "ring = homing" — which
  is what makes B the natural partner rather than the competitor.
- The literal letter read is gone. `H` is a word the player already knows; a
  ring is a word this game would have to teach.
- The shipped drop table needs **eight** symbols (4 weapons + 4 mods). This set
  has five, and the eighth topology is harder than the fourth.
- **No runtime asset loading needed** — every mark is a canvas primitive.

## D — the lit-cell polarity (argued from boards 01 and 07)

Candidates `capsule-lit-*`: identical geometry to C with the mark in warm-white
on the magenta face, plus the codex-generated `capsule-cell-laser-codex`.

**Why the boards support it.** Board 01's reward pocket and board 07's bottom
-right panel both draw the pickup as a **lit magenta cell with a dark object
inside** — no letter anywhere in either. And the look-direction audit measured
**0.0%** of playfield pixels above luminance 200 in fifteen gameplay captures:
today nothing in the frame reads as light.

**Measured.** Best separation of any direction against the teal field and the
haze: mean luminance 74–92 levels above the backdrop, versus 30–46 for C, and it
does produce pixels above 200. **But** against the lit rust deck — "the
brightest large surface in every mode" by explicit design — the same capsules sit
within **5–8 levels** of the deck, exactly where C keeps 65–67. Neither polarity
wins on every surface a capsule appears on.

**Cost to adopt.**
- Warm-white is the **muzzle / player-fire** family. Giving pickups the frame's
  brightest mark spends that language on pickups; that is a color-role decision
  of the same shape as the look packet's §4.7(a), not an art tweak.
- The mod face is where it is weakest: `capsule-lit-mod` is a warm-white mark on
  amber, and amber-on-deck already measures 5.8 levels of field separation.
- **No runtime asset loading needed** (same canvas primitives as C).

---

## Five questions

1. **Is 18.2px enough?** Compare `sheet-A-letters.png`'s 18.2px row against
   `sheet-CD-shapecode.png`'s. Judged at speed, with a 9-year-old in the chair —
   does the letter survive, or does the identity have to leave the world object?
2. **Letter or code?** Is "ring = homing" something you want the game to teach?
   If yes, C or D is the object read and B is the teaching surface. If no, A is
   the only remaining world direction — and A is already at its ceiling.
3. **Which polarity?** Dark mark (C) keeps the read on the lit deck; bright mark
   (D) is the only candidate that puts light in a frame that currently has none.
   The measured trade is above; the choice is a look verdict.
4. **Does a pickup get to be brighter than the muzzle flash?** D spends the
   warm-white role on pickups. Yes, no, or "only the mark, never the plate"?
5. **Do mods need identity at all?** `RG/GS/OL/CH` cannot be read as text at any
   legal size (`sheet-mods.png`). Is "amber = mod, one mark, find out what it did
   from the HUD" acceptable, or do the four mods need to be distinguishable
   before pickup?

---

## What is NOT being asked here

Not asked, deliberately: whether to load assets at runtime (that is the look
packet's §4.4 and **no** direction here needs it), whether to change the FAR
default (entry 7 is law), and whether the capsule's `CanvasTexture` should set
`colorSpace` (already queued as the look packet's §6 Q5b — though this task
measured what it costs: see `build.md`, "an authored hex is not the pixel the
game draws").
