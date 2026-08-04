# Meridian detail atlas v1

Generated with the built-in ImageGen tool on 2026-08-03.

Production-role correction: this atlas depicts coherent Meridian service,
containment and pressure-response machinery. Meridian itself is not corrupted;
humans/RIG are the detected incursion. The eighth fixture must be interpreted
and integrated only as armored defense hardware and mechanical pressure organs,
never as growth on the ship.

- Concept reference: `docs/concept-art/04-six-phase-escalation.png`
- Initial ImageGen source: `/Users/scottmeyer/.codex/generated_images/019fc4d8-9286-7080-8c8a-7edc77ab89ea/exec-886f0993-abde-40ad-80d3-59b43e0c27e3.png`
- Chroma correction source: `/Users/scottmeyer/.codex/generated_images/019fc4d8-9286-7080-8c8a-7edc77ab89ea/exec-fe05be75-8c7e-4cd1-bc37-d9f6b8be116f.png`
- Production asset: `assets/generated/environment/meridian-detail-atlas-v1.png`

## Initial prompt

> Create a production-ready 4-by-2 modular environment-detail sprite atlas for the 2.5D sci-fi action platformer Hullbreaker, visually derived from the supplied six-phase concept art. Exactly eight isolated Meridian hull fixtures, one centered completely inside each equal 512x512 cell on a 2048x1024 canvas, with generous transparent/chroma-key-safe margin and no object touching or crossing a cell edge.
>
> Art direction: the player is climbing the outer skin of one colossal sentient industrial monster/ship. Dark gunmetal and oxidized bronze machinery, oily teal-black recesses, warm work lights, restrained quarantine green and rare magenta containment glow. Painterly high-end game concept art translated into crisp readable game sprites; hard mechanical silhouettes, deep occlusion, believable brackets, bolts, cable bundles, ribbed armor and human-scale service details. Strong upper-left warm rim light consistent across all cells, neutral orthographic-ish side/front presentation, no environmental backdrop, no floor, no cast shadow outside each object, no fog baked into art, no text, labels, UI, borders, panel dividers, repeated icons, or placeholder primitives.
>
> Cell contents left-to-right: Top row: (1) a large armored gill/vent cavity with a thick rust-bronze lip, deep teal-black louvres, broken lower slat, and two tiny maintenance lamps; (2) an asymmetrical vertical cable-and-pipe spine with clamps, junction boxes, bundled hoses, one leaking green pressure valve; (3) a narrow inhabited maintenance gallery bolted to hull plate, tiny warm windows, rail, ladder, antenna mast—reads as human scale; (4) a torn armor breach with curled plate edges, glowing hot inner seams, exposed tendon-like conduits, scorch and a few fixed shards still attached. Bottom row: (5) a wide industrial vent bank with mismatched louvres, fan housing, repair patch and side braces; (6) an antenna/sensor cluster with dish, three unequal masts, guy wires and a magenta containment sensor; (7) a pressure exhaust manifold with a directional nozzle, ribbed hose, valves and a pale vapor source fixture (fixture only; no large cloud); (8) a compact containment/defense machinery cluster with armored canister, coil rails, warning lamps, articulated mounting brackets and mechanical pressure-response shutters and conduits.
>
> Every sprite must have a materially different silhouette and internal rhythm. Optimize for readability when each object is displayed roughly 40-140 pixels wide. Preserve true transparent background if supported; otherwise use perfectly flat #00FF00 chroma green with absolutely no green inside the objects. Output only the atlas.

## Extraction correction prompt

> Production extraction correction only. Preserve the exact eight machinery fixture designs, their colors, lighting, proportions, orientation, and 4-by-2 ordering from the reference. Do not redesign, add, remove, crop, or merge any fixture. Remove the baked gray-and-white transparency checkerboard completely and replace every background pixel with one perfectly uniform flat chroma key color #00FF00, with no shadow, texture, gradient, halo, fog, checkerboard, or off-green variation in the background. Keep all eight fixtures separated and fully inside equal 4-by-2 cells with generous green margin; nothing may touch a cell boundary. Canvas must be a clean 2:1 atlas, intended as 2048x1024. No dividers, frames, labels, text, floor or cast shadows. Output only the corrected chroma-key atlas.

## Production extraction

The correction output arrived as a 1774x887 opaque chroma-key image. It was proportionally resampled to 2048x1024, converted to RGBA with the ImageGen skill's `remove_chroma_key.py` helper (`#00ff00`, soft matte 20–105, spill cleanup), and each detected fixture was centered inside its own 512x512 cell without cropping. Final validation: 2048x1024 RGBA; all eight visible bounds have at least 32 px of cell margin; zero visible pixels occur within five pixels of any internal atlas boundary.
