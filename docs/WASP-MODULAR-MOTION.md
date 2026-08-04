# Modular Meridian wasp v2

The Level 1 wasp is one body state plus one independently selected wing phase. Eight bodies × eight wing phases expose 64 readable assemblies without baking 64 complete insects.

## Runtime contract

- Body states: cruise, pitch-up, turn/down-bank, dive-lock, dive-attack, hit-recoil, recover/brake, death-crack.
- Wing phases: eight anatomically adjacent positions at the existing 3.25 Hz flight rate. Geometry swaps; opacity never strobes or crossfades.
- Anchor: every component's detected reactor/wing-root is translated to local `(0,0)`. Body and wings receive the same position, rotation, scale and full-assembly mirror.
- Layering: the wing bank sits 0.015 tiles behind the body. Active minimum wing depth is 0.735; platform fascia ends at 0.70, so the whole insect remains on the action plane.
- Death: body selects `death-crack`; the wing bank performs one bounded 0.64-radian hinge shear through the existing corpse pass. There is no continuous angular velocity or spiral removal.
- Simulation: unchanged. Collision, dive lock, launch timing, damage, AI, targeting and genome sockets remain owned by existing sim rows.

## GPU and draw budget

- One `1024×512` RGBA atlas: 2 MiB estimated resident memory.
- Sixteen shared fixed-UV geometries.
- Two meshes/draw calls per visible wasp: one body and one wing bank, +1 draw over the prior single complete-body card.
- No crossfade and no runtime geometry/texture allocation per phase.

## Evidence

- Static audit: `node tools/wasp-modular-v2-check.mjs`
- Runtime-equivalent 8×8 contact sheet: `node tools/playtest/wasp-modular-v2-contact-sheet.mjs`
- Production six-face face 1/mid-climb, current foreground art, desktop + portrait, combat states, platform overlap and a real removal/death: `node tools/playtest/wasp-modular-v2-live-capture.mjs --production`
- Supplemental controlled fixture proof: `node tools/playtest/wasp-modular-v2-live-capture.mjs`
- Matrix: `artifacts/wasp-modular-v2/wasp-8x8-game-scale.png`
- Production report: `artifacts/wasp-modular-v2/production/report.json`
- Controlled report: `artifacts/wasp-modular-v2/live/report.json`

The source sheets and exact ImageGen prompts/provenance live beside each other under `assets/generated/sprites/wasp-modular-v2/source-sheets/`. The v2 body sheet is explicitly retained as rejected crop evidence; the v3 spacing edit and wing Cycle A are the production inputs.
