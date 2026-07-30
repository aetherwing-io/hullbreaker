/* ============================ CONFIG ============================== */
/* Every tuning constant for the shipped six-face run. Pure data: no
   three.js, no DOM, no imports — the headless harness reads this module
   directly, and the opt-in traversal slice overlays its playtest-only
   movement overrides on top of it (src/pure/traversal.js).           */

export const CONFIG = {
  scrollSpeed: 4.3,            // camera advance, units/sec (~10%/s of the wider screen)
  levelLength: 445,            // tiles = 24 intro + 6 faces × 65 + 31 outro

  camera: { fov: 56, x: 5.0, y: 6.2, z: 22.5, lookX: 7.4, lookY: 4.8 }, // pulled back further: more room
                                             // to jump/dodge/shoot; player ~7% of screen height
  fog: { near: 30, far: 74 },  // pushed out with the camera

  path: {                      // hexagonal tower circuit; sim stays in (s, y)
    faces: 6, faceTiles: 65, introTiles: 24, outroTiles: 31,
    chamferTiles: 2,           // two bends per corner, this many tiles apart
    turnDeg: 30,               // per bend; one corner turns 2 × turnDeg
    turnSign: 1,               // +1 bends toward -z, keeping the camera exterior
    yawBlendTiles: 1.0,        // dynamic-entity yaw blend half-width per bend
  },

  gen: {                       // pattern-chunk layout generator (pure, seeded)
    seed: 1337, tierSeed: 777,
    minH: 2, maxH: 4,          // ground height band; adjacent steps stay ≤ 2
    gapMax: 5, landingMin: 3,  // widest gap run / guaranteed landing after it
                               //   (5 demands a committed full jump: 6.64 tiles available)
    tailFlat: 20,              // flat outro tail
    maxReach: 5,               // catwalk support ceiling (double-jump apex 5.07)
    weights: { flat: 12, step: 16, stairs: 12, gapHop: 14, plateau: 14, trench: 12, islandHop: 10, ridge: 16 },
    laneChance: 0.92, hiChance: 0.6, thirdChance: 0.35, laneCapY: 12,
  },

  spawner: {                   // ambient spawn director (gate waves live in waves)
    startS: 28, endFromEnd: 40, seed: 4242,
    faceGapSec: [2.3, 2.0, 1.8, 1.6, 1.45, 1.35],  // gap between spawns in SECONDS of
    jitterSec: 0.6,                              //   scroll — density scales with speed
    pairChance: [0.15, 0.25, 0.35, 0.45, 0.55, 0.65],  // trailing wingman odds per face
    pairGapTiles: 2,
    cornerClearBefore: 10, cornerClearAfter: 20, // before: small, so stragglers reach the
                                                 //   gate; after: post-ritual breather —
                                                 //   updateSpawner also pauses while a
                                                 //   corner holds the scroll, so no aspect
                                                 //   ratio can leak ambient spawns onto
                                                 //   the unbuilt face during a gate
  },

  player: {
    runSpeed: 9.4,
    accelGround: 120, accelAir: 76,
    jumpVel: 14, gravity: -36, fallGravityMult: 1.5, terminalVel: -32,   // FROZEN: apex 2.72 vs +3 tiers
    jumpCutMult: 0.45,         // multiply vy on jump release (variable height)
    airJumps: 1, airJumpVel: 13,
    coyoteMs: 100, jumpBufferMs: 120, dropThroughMs: 260,
    ledgeReachX: 0.28, ledgeReachY: 0.42, ledgeGrabHeight: 1.42,
    ledgeHangMs: 460, ledgeLaunchX: 6.4, ledgeLaunchY: 11.5,
    ledgeMantleInset: 0.03, ledgeReleaseNudge: 0.08,
    wallSlideSpeed: 4.2, wallSlideMs: 520,
    wallJumpX: 11.8, wallJumpY: 12.5,
    traversalRecatchMs: 180, traversalEdgeGuard: 0.5,
    width: 0.7, height: 1.7,
    maxHealth: 3, lives: 3,
    iframesMs: 1200, hitstunMs: 220, knockbackX: 6, knockbackY: 5,
  },

  rifle: { radius: 0.16 },     // shared tracer geometry; rifle stats live in weapons.R

  weapons: {                   // letter weapons — every stat, spawn shape, and look
                               // lives here; fireWeapon reads defs, never branches.
                               // splayDeg = per-shot fan step around the aim.
    R: { name: 'RIFLE',  fireRateMs: 130, speed: 26, damage: 1, lifeMs: 1100,
         scale: [1, 1, 1] },
    S: { name: 'SPREAD', fireRateMs: 240, speed: 23, damage: 1, lifeMs: 900,
         count: 5, splayDeg: 12, scale: [0.8, 0.8, 0.8] },
    L: { name: 'LASER',  fireRateMs: 300, speed: 40, damage: 2, lifeMs: 800,
         pierce: true, scale: [7, 0.45, 0.45] },
    H: { name: 'HOMING', fireRateMs: 260, speed: 18, damage: 1, lifeMs: 1600,
         count: 2, splayDeg: 24, turnRate: 7, seekRange: 14, scale: [0.7, 0.7, 0.7] },
    F: { name: 'FLAME',  fireRateMs: 300, speed: 13, damage: 1, lifeMs: 1500,
         pierce: true, crawlSpeed: 10, dropAccel: -40,
         lobScaleY: 0.6, lobBias: 0.12,          // aims-to-lob conversion at fire time
         hugY: 0.35, hugRate: 30, probeX: 0.4, probeY: 0.4,   // deck-hugging crawl
         scale: [1.1, 1.1, 1.1], crawlScale: [1.5, 0.9, 1.1] },
  },

  capsules: {                  // pickups: letters (magenta) + rare modifiers (gold)
    driftSpeed: 1.6, sinkSpeed: 0.35, bobAmp: 0.5, bobFreq: 2.0, size: 0.55,
    recatchMs: 2200, blinkLastMs: 800,           // dropped-on-hit recatch timer
    popNoCatchMs: 250,           // …during which the pop cannot be re-caught. The
                                 //   capsule spawns inside the player's own AABB,
                                 //   so without this the "recatch it fast" panic
                                 //   DESIGN describes never happened: the same
                                 //   frame's pickup test handed the weapon back.
    popVx: 3.5, popVy: 9, gravity: -22,
    pickupRadius: 0.95,
  },

  carrier: {                   // capsule delivery drone
    hp: 10, speed: 1.1, bobAmp: 0.4, bobFreq: 1.4, hitRadius: 1.0, laneAbove: 4.5,
    rollFreq: 1.3, rollAmp: 0.08, size: [1.7, 0.9, 0.9],
    perFaceFrac: [0.45, 0.4, 0.5, 0.42, 0.55, 0.38],   // one per face, mid-face
  },

  mods: {                      // rare stackable modifiers (carrier drops 5+)
    rageMs: 10000, rageFireMult: 0.5,            // RG: 2× fire rate + red tint
    ghostMs: 12000, ghostDelayMs: [500, 1000],   // GS: two clones replay your shots
    chronoMs: 4000, chronoScale: 0.35,           // CH: world slow, player full speed
    lanceTelegraphMs: 1000, lanceFlashMs: 280,   // OL: telegraph, then screen clear
  },
  wasp: {
    hp: 4, cruiseSpeed: 2.0, bobFreq: 3.0, bobAmp: 0.9,
    diveRange: 6.5, diveSpeed: 10, diveMs: 700, diveCooldownMs: 1800,
    contactRadius: 0.55, visualRadius: 0.5,  // readability bump; hitbox unchanged
    // mock-3D presence: enemies materialize from tower depth and dissolve back.
    // Purely visual — sim stays 2D; collision only while fully materialized.
    enterMs: 900, enterDepth: -12,           // condense in from the foggy interior
    dieMs: 500, dieDepth: -7,                // death: flash, tumble, recede, fade
    wobbleAmp: 0.4, wobbleFreq: 2.2,         // alive: depth breathing
  },

  hound: {                     // houndframe: denies a FLOOR route with a committed charge.
                               // Difficulty is timing and topology, never HP: the answer is
                               // always a movement verb (jump / wall-launch / drop behind).
                               // Presence timings (materialize, dissolve, depth breathing)
                               // are deliberately shared with CONFIG.wasp — that grammar is
                               // global, only the pose theater below is per-kind.
    hp: 6,                     // ~0.8 s of rifle fire; a sponge would punish the wrong thing
    hitRadius: 0.42,           // contact circle, sized to the frame's HEIGHT so it stays
                               //   inside the silhouette: the wide front and back of the
                               //   chassis are theater, and a hit is always explicable
    size: [1.7, 0.9, 1.0],     // low, wide, 2.4x the player's width and half their height —
                               //   the concept-art quadruped read (docs/concept-art), and
                               //   unmistakable against the wasp's small flyer profile
    rideY: 0.45,               // body center over the deck it walks (chassis sits on the plate)
    fallGravity: -46, fallTerminal: -30,       // only while tumbling off a committed charge

    prowlSpeed: 3.4,           // ~1/3 of the run: the player can always get behind it
    senseRange: 8.0,           // tell trigger distance, either side. Tuned against the
                               //   sweep below: threaten only ground a charge can actually
                               //   cover, so the frame stays near the plate it guards
                               //   instead of running off down the level after every dodge.
    laneBelow: 2.8, laneAbove: 1.2,   // "in my lane" band around the body. Below reaches a
                               //   full generator step (2) down, so standing on the step
                               //   below its plate is not a loophole — a charge pours down
                               //   steps. Above stops short of the +2.35 mid catwalk: a
                               //   hound denies the floor, never the tier above it.
    tellMs: 520,               // the whole reaction window sits BEFORE commitment
    tellBackTiles: 0.5,        // visible rear-back across the tell (motion tell at sprint)
    chargeSpeed: 15.5,         // faster than any run tune: retreat is not an answer
    chargeMs: 560,             // 8.7-tile sweep > senseRange: the charge lands where it aimed
    chargeCooldownMs: 1500,    // pant window — the lane goes safe again, rhythmically
    skidMs: 420,
    stepUpTiles: 1.0,          // decks it can mount; a taller wall ends a charge in a skid
    probeX: 0.75, wallProbeY: 0.5,             // deck/wall look-ahead from the body center;
                               //   the wall probe is mid-chassis, so this low frame walks
                               //   under an overhang it fits beneath and stops at real walls
    hugRate: 26,               // deck-hugging follow rate (flame-crawler prior art)
    substeps: 4,               // charge integration: no substep exceeds 0.45 tiles

    tellDepth: 1.3,            // presence: leans out of the plane winding up, snaps back
    tellRise: 0.45, tellNarrow: 0.18, tellRear: 0.42,  // rear-up on a low body: big silhouette
                               //   change, which is what stays readable at full sprint
    tellBlinkSlowMs: 170, tellBlinkFastMs: 60,         // warning light, accelerating
    chargeStretch: 0.35, chargeSquash: 0.12, chargeLean: 0.2,
    gaitFreq: 9, gaitAmp: 0.07, gaitTilt: 0.05,        // prowl stride bob
  },

  waves: {                     // corner wave gates + snap ritual + brick zipper
    haltOffset: 14,            // scroll halts at cornerS - haltOffset
    baseSize: 3, sizePerWave: 1,               // wave k = baseSize + sizePerWave·k
    laneHeights: [2.6, 4.6, 7.2],
    staggerMs: 220,            // gate wave materializes one presence at a time
    comp: [                                    // lane index per slot per wave —
      [0, 0, 1, 0],                            //   altitude mix escalates with k;
      [0, 1, 0, 1, 2],                         //   every wave keeps a low target
      [0, 1, 2, 1, 0, 2],
      [1, 0, 2, 1, 2, 0, 1],
      [1, 2, 1, 0, 2, 1, 2, 0],
      [2, 1, 2, 1, 0, 2, 1, 2, 2],
    ],
    gateDiveCooldownMs: 1100, gateDiveRange: 9.0,   // hotter hostiles while gated
    gateCruiseSpeed: 5.0,      // gated approach speed — fights, not drift-watching
    windUpMs: 70, windUpDeg: -1.5,             // counter-rotation blink
    snap1Ms: 150, holdMs: 420, snap2Ms: 130, settleMs: 130, resumeMs: 200,
                               // hold 420: zipper locks (860 ms) before scroll
                               //   resumes (t5 = 900); event total 1100 ms
    backS: 1.1,                // easeOutBack overshoot (~5%, one settle, no wobble)
    clearMsgMs: 700,
    zipStartMs: 220,           // zipper starts on snap 1's impact frame
    zipCols: 31, zipPerColMs: 16, zipDropMs: 120,
    zipDropTiles: 2.75, zipDipTiles: 0.06, zipDipMs: 40,
  },

  edges: { margin: 0.4, killY: -7 },

  score: {                     // CHARGE/THREAT prototype — docs/proposals/
                               //   2026-07-score-and-setback.md A.4, opt-in via
                               //   ?score=1. CHARGE is sim state (it gates the
                               //   weapon), THREAT is display only.
    max: 100,
    notches: [40, 100],        // A.4 cuts A.3's three-notch ladder to two:
    notchNames: ['COLD', 'WARM', 'BREAKING'],   //   WARM 40, BREAKING 100
    notchMult: [1.0, 1.4, 1.9],                 // THREAT multiplier per notch
    warmFireMult: 0.85,        // WARM: the gun gets hotter, nothing else changes
    shockRadius: 2.4, shockDamage: 4,   // BREAKING: a launch kills a wasp on
                                        //   contact (wasp hp 4; a carrier dents)
    // Gains are A.3's table doubled, per A.4's "scale the constants for the
    // fixture": the slice pass is 4–12 s, not 45, so the meter needs a ~6 s
    // horizon. Drain is doubled by the same factor so the asymmetry that is
    // the whole design (the floor cools you, the air does not) survives the
    // rescale. Neither set carries to the full game.
    gain: {
      airborne_kill: 28, launch_kill: 20, link: 12,
      reclaim: 36, wager: 50, recatch: 40, ground_kill: 6,
    },
    drain: { moving: 14, stopped: 44 },   // per second while grounded
    threat: {
      airborne_kill: 100, launch_kill: 60, link: 25,
      reclaim: 150, wager: 250, recatch: 200, ground_kill: 25,
    },
    launchGraceMs: 600,        // a kill this soon after a launch is a launch_kill
    stallSpeed: 2.0, stallTickMs: 100,    // A.5's one idle definition, shared
                                          //   with the playtest harness
    linkDropTiles: 2,          // a launch only "links" if it went somewhere
    reclaim: { lowTiles: 2.0, highTiles: 8.0, windowMs: 2500 },
    routeRadiusTiles: 2.2,     // connector visit radius (A.5 route coverage)
    routeMinConnectors: 3,
    eventCap: 256,             // A.5 ring buffer
    classification: [          // the ship's own ladder; the slice never crosses
      [0, 'OBSERVE'], [2000, 'INTERCEPT'], [5000, 'CONTAIN'],   //   more than a
      [9000, 'QUARANTINE'], [14000, 'STERILIZE'], [20000, 'SCUTTLE'],  // step
    ],
  },

  palette: {                    // grey-box: neutral + readability hints
    bg: 0x232830, ground: 0x767c85, groundAlt: 0x6a707a, catwalk: 0x8d939c,
    player: 0xd9dde2, gun: 0xffc966, wasp: 0x7cc47c,
    carrier: 0x4e8f5a, capsule: '#ff4fd8', modCapsule: '#ffd75e',
    hound: 0x5f8f3c,                       // same acid-green ecology as the wasp (concept art):
                                           //   heavier value, and the SILHOUETTE carries the read
    houndTell: 0xffd0a0, houndCharge: 0x3d7a1a,   // warm warning blink / lit-up committed glow
    shots: { R: 0xfff0c2, S: 0xffc76a, L: 0x9ff7ff, H: 0xff9adf, F: 0xff8a4a },
    tints: { lance: 'rgba(255,255,255,0.5)', rage: 'rgba(255,50,50,0.14)', chrono: 'rgba(90,200,255,0.12)' },
  },
};

// derived rosters: adding a weapon to CONFIG.weapons wires kills + drops
export const WEAPON_LETTERS = Object.keys(CONFIG.weapons);
