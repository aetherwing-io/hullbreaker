# Level 1 enemy ecology pack

Status: asset pack, two-quad renderer and authored Level 1 `ecologyId`
encounter score are integrated. Ordinary Level 1 support rows use a separate
`ecologyVisualId` for reviewed art while remaining mechanically inert.

`docs/concept-art/06-enemy-form-language.png` is dated. It remains useful only
as historical evidence for Meridian's oxidized-copper / blue-black machinery,
human-scale contrast and non-humanoid bias. Its exact silhouettes and old
three-by-three family grid are not authoritative. Current production sprites,
the DESIGN movement-role table and normal gameplay scale own this pack.

## Non-negotiable ecology rule

Every variant must change a route, timing, elevation or target-priority
decision. A palette swap, larger health pool or faster copy does not qualify.
Meridian is coherent defense machinery. Bodies are quiet metal at idle;
acid-green or warm-amber light exists only in a physically housed tell,
release, impact or damage response.

## Level 1 roster matrix

| ID | Family / variant | Silhouette and articulated organ | Attack or movement geometry | Player decision / counterplay | First teach |
| --- | --- | --- | --- | --- | --- |
| `hound-railfang` | Floor pursuit — Railfang | Very low scute wedge, long rear piston spine, broad foreclaws | One committed horizontal deck sweep; cannot turn during release | Late jump, drop through, or cross behind after commitment | Intercept A |
| `hound-vaultjaw` | Floor pursuit — Vaultjaw | Tall spring shoulders, tucked hind linkage, short counterweight tail | Predicted parabolic vault to the next higher landing | Short-hop under the arc, ledge hang, or descend instead of taking the predicted upper route | Intercept B |
| `hound-rebound` | Floor pursuit — Rebound | Rear brake fan, asymmetric magnetic heel, longer articulated tail | Low charge into wall/edge followed by one high reverse vault | Continue past rather than panic-reversing; change elevation before the return arc | Quarantine C |
| `wasp-crosswind` | Aerial interception — Crosswind | Wide split stabilizers, narrow body dart, lateral thruster yoke | Horizontal strafe with a short parallel burst across an open crossing | Change elevation before crossing or pass behind the completed burst | Observe A |
| `wasp-diveclaw` | Aerial interception — Diveclaw | Down-canted hooked wings, armored nose clamp, vertical brake vanes | Diagonal body dive through the predicted jump apex, then forced climb-out | Delay launch, use a low hop, or drop beneath the committed diagonal | Observe B |
| `wasp-pincer` | Aerial interception — Pincer Relay | Forked wing crown, paired side projectors, compact relay abdomen | Two instances take mirrored altitude nodes and fire converging lines with a readable center seam | Commit through the seam or kill the visible relay before convergence | Contain C |
| `polyp-needle` | Connector control — Needle Iris | Narrow armored iris in a three-foot rooted cradle | Locks one connector with a thin straight beam after eyelid tell | Use cover, take the alternate connector, or destroy it during the open iris | Contain A |
| `polyp-sweepfan` | Connector control — Sweepfan | Offset gimbal, broad shutter fan, crescent root clamp | One beam sweeps a bounded arc; the safe pocket moves behind it | Follow behind the sweep or cross outside its arc instead of waiting in place | Contain B |
| `polyp-gateweaver` | Connector control — Gateweaver | Twin irises on a Y-yoke with alternating armored shutters | Alternates two diagonal fork exits; never closes both at once | Read the open arm and commit to that branch; target the hub if timing is bad | Sterilize A |
| `mortar-craterpod` | Landing denial — Craterpod | Compact single tube, low tripod, visible pressure bladder | One delayed shell marks the predicted landing point | Redirect in air, land short/long, or choose another connector | Quarantine A |
| `mortar-bracketpod` | Landing denial — Bracketpod | Opposed twin tubes on a sliding recoil saddle | Two staggered patches bracket predicted travel and leave a deliberate center gap | Maintain speed through the gap or reverse before the second lock; do not freeze | Quarantine B |
| `mortar-aircomb` | Landing denial — Aircomb | Three-cell vertical launcher fan with tall folding outriggers | Overhead burst drops a three-tooth vertical comb across a descent corridor | Wall cling, take the low tunnel, or air-brake into the visible tooth gap | Sterilize B |

The twelve silhouettes are original Level 1 production directions, not a
promise to reproduce any concept-board body verbatim.

## Runtime seam: reuse before invention

Runtime integration binds each silhouette to an already proved
decision whenever that answer exists. Genome names below refer to the shipped
`src/pure/genome.js` mechanic, not a color treatment. `BASE` means the current
kind's ordinary authored behavior. Optional late genes remain optional; they
must never be baked into a base silhouette or simulated with bonus health.

| Variant | Existing mechanic/strain seam | Genuinely new behavior, if any |
| --- | --- | --- |
| `hound-railfang` | `BASE` locked hound charge; its broad face can physically carry the existing `BULWARK` one-hit opening | None |
| `hound-vaultjaw` | `VAULT` frozen ballistic arc and recovery, unchanged | None |
| `hound-rebound` | `BASE` committed charge; late damaged instances may still roll ordinary `BACKLASH` | Reverse vault after a wall/edge commitment; `BACKLASH` is not a substitute for this locomotion branch |
| `wasp-crosswind` | `PINCER` flank station plus `TWINSTRIKE`'s proved second-pass clock | Horizontal strafe release with one short parallel burst |
| `wasp-diveclaw` | `BASE` predictive, aim-locked wasp dive; armored nose can carry the existing `BULWARK` opening | None |
| `wasp-pincer` | `PINCER` mirrored station plus `TWINSTRIKE` pass sequencing | None |
| `polyp-needle` | `BASE` fixed sightline polyp; may become the existing immediately-punishable `AEGIS` priority source | None |
| `polyp-sweepfan` | `BASE` tell/fire/vent cadence; optional `AEGIS` remains the existing command relationship | Bounded beam arc with a moving safe pocket |
| `polyp-gateweaver` | `RELAY` alternating direction/hinge plus optional `AEGIS` source behavior | None; the Y-yoke is a clearer organ for the already-proved alternation |
| `mortar-craterpod` | `BASE` authored landing mark, frozen lob, fuse, burst and cool window | None |
| `mortar-bracketpod` | `SALVO` with the shipped `BASTION` strain's `BRACKET` allele | None |
| `mortar-aircomb` | `SALVO`'s whole extra arc/fuse sequencing; late damaged instances may still roll ordinary `BACKLASH` | Three fixed overhead descent teeth and their visible gap |

Only four branches therefore own new simulation kernels: Rebound's reverse
vault, Crosswind's horizontal burst, Sweepfan's bounded arc, and Aircomb's
descent teeth. Everything else is a new, readable body/action identity over
counterplay that already survived deterministic playtests. `BACKLASH` remains
a late reactive layer and never masquerades as an enemy variety by itself.

## Six-state teaching and recombination

| Meridian response | New lesson | Clean test | Recombination rule |
| --- | --- | --- | --- |
| Observe | Crosswind, then Diveclaw | One aerial geometry at a time over forgiving routes | Existing maintenance wasps may accompany only after each answer is readable |
| Intercept | Railfang, then Vaultjaw | Floor sweep before predicted upper vault | One hound plus one already-learned aerial threat; never both new hounds at once |
| Contain | Needle Iris, Sweepfan, then Pincer Relay | Straight connector lock before moving safe pocket before paired convergence | A rooted controller may force the route that one learned hound/aerial unit contests |
| Quarantine | Craterpod, Bracketpod, then Rebound | Single landing mark before paired gap before reverse-vault punishment | At most one landing-denial variant plus one learned mover in a teach beat |
| Sterilize | Gateweaver, then Aircomb | Alternating fork before descent comb | Mixed two- and three-role cells; at most one member per family unless a paired Pincer teach explicitly requires two |
| Scuttle | No new base rule | Faster recombination, not deleted tells | Readable triads drawn from three different families; damaged/spent visual states communicate escalation without changing the learned answer |

The production score lives in `src/pure/level1-ecology-encounters.js`. It
reuses the existing 4/5/6/7/8/9 gate allocations (39 rows total), resolves
every body and denial target through a current-face Vertical Assault staging
socket, and never changes HP or damage. A teach/remix beat owns at most three
simultaneous bodies and six fixed tactic hazards. Clearing a beat begins the
next body's visible condensation on the same simulation tick; later beats
remain unable to move, collide or attack. Gate ownership and clearing are
scoped to the encounter key, so unrelated ambient bodies cannot block or be
retired by the gate. `tools/level1-ecology-encounter-check.mjs` proves the
score, placement, fallback, sequencing and pressure-director contracts.

## The 8 × 8 composable visual contract

Every variant owns sixteen native layers rather than sixty-four baked full-body
sprites. A body/state layer and an articulated action layer share one invariant
composition pivot. Their Cartesian product supplies exactly 64 visual
combinations per variant and 768 across the twelve-variant Level 1 roster.

Body/state axis:

| Index | State | Required read |
| --- | --- | --- |
| `B0` | quiet-idle | Closed armor, no glow; clearly identifies the base silhouette |
| `B1` | awake/locomotion | Weight transferred into the family-specific movement stance |
| `B2` | acquisition-load | Chassis compresses or braces before the tell |
| `B3` | committed-load | Armor visibly carries force during the irreversible action |
| `B4` | recovery/vent | Open mechanical vents and relaxed load path; safe punish window |
| `B5` | impact-damaged | One localized armor failure, silhouette still whole |
| `B6` | critical-damaged | Exposed ribs/conduit and a clearly weakened silhouette |
| `B7` | death-breakup | Several large readable mechanical pieces separating from the failed core |

Articulated motion/weapon axis:

| Index | Phase | Required read |
| --- | --- | --- |
| `A0` | stowed | Appendage/weapon parked; no light |
| `A1` | acquire | Organ turns/plants toward its authored geometry |
| `A2` | tell | Maximum readable silhouette change; tiny housed amber/green tell only |
| `A3` | release-early | First irreversible movement/recoil pose |
| `A4` | release-peak | Widest action silhouette and exact attack socket |
| `A5` | follow-through | Momentum continues past the strike or discharge |
| `A6` | recover | Organ retracts toward the invariant coupling |
| `A7` | spent/fail | Bent, empty, jammed or detached action organ for death/recovery composition |

The asset checker enumerates every `B0..B7 × A0..A7` pair, verifies no
duplicate component identity, and proves invariant pivot/socket coordinates
within each variant. The renderer selects honest combinations from live state,
damage and tactic fields; the visual vocabulary remains a complete 64-state
product even where Level 1 encounter authoring deliberately uses a smaller
teaching subset.

## Board and atlas plan

Four 48-layer family source sets use a perfectly flat `#FF00FF` extraction
matte. Hunter uses a six-column by eight-row base board plus its approved
action replacements. Aerial uses four explicit three-column by four-row blocks:
body `B0..B3`, body `B4..B7`, action `A0..A3`, and action `A4..A7`.
Connector and denial each use one three-column by eight-row action board plus
two three-column by four-row body blocks (`B0..B3`, `B4..B7`). This is 24
distinct body layers and 24 distinct action layers per family, never padded
rows. The first combined denial attempt was rejected because it repeated whole
launcher/base combatants instead of proving interchangeable layers. Its first
tall body revision was also rejected after the packer proved it contained only
seven actual rows. Connector source generation likewise returned attractive
but false six- and seven-row revisions before the explicit four-row body
blocks solved the counting failure.

Native QA then rejected visually static hunter action phases and weak mortar
damage communication. Hunter `A1..A4` therefore come from one exact 3×4
action-only replacement board with large foot, load and vault changes. Denial
`B5..B6` come from one exact 3×2 body-only replacement board with structural
silhouette loss rather than a damage recolor. These boards replace only the
named rows; they do not pad, interpolate or procedurally deform accepted art.
Railfang receives one further native 1×4 action board because its low shell
occluded the first shared replacement's leg motion. The final denial revision
also collapses critical silhouettes instead of making damaged machines look
taller or upgraded.

Actual 1440×900 play rejected the first aerial board despite its structural
validity: a roughly 32-pixel Crosswind became a dark olive hook while bright
Scatterbloom rounds read more like the enemy. The replacement aerial blocks
use broad cream wing banks, warm copper bodies and charcoal negative-space
gaps with only one small lime sensor. Dedicated FAR and portrait sheets prove
all three aerial silhouettes at a 42-pixel maximum without idle glow.

In a combined board, each variant owns two adjacent columns: body states on
the left and action phases on the right. In split sets, matching columns share
the same variant and coupling pivot. Conceptual rows remain `0..7`; the
connector body packer maps the two explicit four-row blocks to that sequence.

A cell contains only its native layer, never a square backing card. Body
layers omit articulated attack parts; action layers omit locomotion/body cores
and retain only the coupling shoe plus moving organ. Live `B0..B6` and
`A0..A6` layers must have connected anatomy. `B7` (and, when necessary, `A7`)
may preserve intentional multi-island breakup pieces. Packing restores a
minimum 12-pixel atlas guard even where the source board's final-row artwork
runs close to a cell edge.

The offline packer places all 192 trimmed layers in one 24×8 RGBA atlas at
160 px per cell: 3840×1280, one texture, no emissive map. Source boards never
load at runtime. Target GPU cost is about 25 MiB including mipmaps. A composed
enemy uses exactly two alpha-tested quads (body + action) throughout life and
the frozen `B7/A7` breakup fade. The integration therefore adds one draw over
the ordinary one-quad hostile, keeps one resident texture, and does not create
runtime crops, canvases, crossfades, fragment layers, emissive maps or idle
glow. Optional rolled mechanic hardware and active tactic hazards remain their
existing independent gameplay props; they are not baked into the two atlas
layers. Authored gate mechanics remain exact `ecologyId` contracts. Ambient,
adaptive and finale support rows instead map each base kind to one deterministic
zero-mechanic `ecologyVisualId` (`hound-railfang`, `wasp-diveclaw`,
`polyp-needle`, `mortar-craterpod`). Carrier and Warden retain their dedicated
production art. The presentation-only field never enters HP, collision, AI,
recipe, tactic or hazard allocation.

## Invariant metadata

Every packed component records measured visible bounds, native aspect,
family/variant/axis/index, original source cell, atlas rectangle and an
untrimmed conceptual-cell pivot. The packer transforms these invariant source
coordinates into atlas-local coordinates:

- `compose`: shared body/action coupling;
- `root`: world/collision anchor;
- `tell`: location of the physically housed anticipation cue;
- `attack`: muzzle, jaw, projector or release point;
- `damage`: stable core impact point; and
- family-specific foot, wing, root-clamp or barrel attachment sockets.

Every eight-row body axis and every eight-row action axis uses one uniform
variant-axis scale after source boards are normalized by nominal row height.
Individual states are never independently enlarged to fill their cells. This
prevents locomotion breathing and preserves the authored mass loss from `B0`
through `B5/B6`.

No per-pose pivot may be eyeballed after packing. Atlas review must include the
source boards, keyed alpha atlas, 64-state per-variant contact sheets, contour
edge proof and normal-gameplay-scale composites before any sim/render edit.

## Approved pack and fast gate

The reviewed runtime texture is
`assets/generated/enemy-ecology/level1-enemy-ecology-atlas-v1.png`; its complete
contract is
`assets/generated/enemy-ecology/level1-enemy-ecology-atlas-v1.manifest.json`.
`tools/assets/pack-level1-enemy-ecology.mjs` performs the expensive source-board
extraction and proof rebuild only when art changes. The normal iteration gate is
the fast, read-only command:

```sh
node tools/level1-enemy-ecology-check.mjs
```

The accepted pack passes more than 1,100 structural assertions: 12 variants in four
families, 192 native layers with 192 distinct SHA-256 identities, 768 unique
composed states, 12-pixel minimum atlas guard and 20.5-pixel minimum visible
guard across all 768 full compositions. Fourteen accepted and nine rejected
ImageGen calls retain exact revised prompts and original output references in
`assets/generated/enemy-ecology/level1-enemy-ecology-imagegen-provenance-v1.json`.

Review output includes one master matrix, a three-background edge proof, twelve
complete 64-state contact sheets, two desktop gameplay-scale composites and one
portrait gameplay-scale composite, FAR/portrait hound and damage comparisons,
FAR/portrait 42-pixel aerial readability sheets, and a socket proof under
`assets/generated/enemy-ecology/review/`.
These are definitive asset proofs, not alternate runtime textures. The atlas is
the only resident image and every approved hostile uses exactly one body cell
plus one independent action cell from it.
