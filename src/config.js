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

  // View-scale experiment (wave 3, viewscale lane): ?view=near|mid|far pulls
  // the camera straight back along its depth axis ONLY — x, y, lookX, lookY
  // (and fov) are untouched — which leaves the anchor's angular position in
  // frame unchanged (composition/follow behavior is preserved to a fraction
  // of a degree) while shrinking RIG's screen-height fraction and widening
  // the calibrated s-strip proportionally. `near` (default/absent) is
  // depthMult 1, i.e. byte-identical to the shipped camera. Applied in
  // src/render/camera.js's activeCameraDepth(), which is the single function
  // both syncCamera (camera pose) and calibrateEdges (setEdges → sim/edges.js)
  // already read — so this table is the only new surface, and the seconds-
  // bounded pursuit clock (src/pure/traversal.js) never has to know views
  // exist, because it never reads EDGE_L/EDGE_R (see traversalMarginCapScroll).
  // Measured RIG screen-height fraction at each (docs/concept-art's "~7%"
  // invariant is `near`): near 7.0%, mid 5.0%, far 3.7%.
  viewScales: {
    near: { id: 'near', label: 'NEAR',  depthMult: 1 },
    mid:  { id: 'mid',  label: 'MID',   depthMult: 1.42 },
    far:  { id: 'far',  label: 'FAR',   depthMult: 1.9 },
  },

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

  // Earned pace escalation (T-022, decisions.md entry 11 — "pace should
  // escalate across the faces, but at the player's momentum"). PACE lever
  // only: nothing here touches the frozen movement/jump block below, and the
  // whole system is inert unless ?momentum=1 (src/mode.js). Math lives in
  // src/pure/momentum.js, the live drive in src/sim/pace.js.
  //
  // The speed band, all multiples of scrollSpeed (4.3 t/s) and all well under
  // the frozen runSpeed (9.4 t/s), which is what keeps escalation from ever
  // becoming a death spiral: even at the hard ceiling RIG out-runs the plane
  // by 2.09 t/s and can re-bank daylight.
  //   drive 0   → 4.30 t/s  the shipped run, EXACTLY. The floor.
  //   drive 1   → 6.02 t/s  escalation's own ceiling (ceilMult).
  //   absolute  → 7.31 t/s  hardCeilMult: the top ANY source may reach,
  //                         including T-023's boosts. The 1.29 t/s between
  //                         the two is the headroom entry 11 asked for.
  momentum: {
    ceilMult: 1.4, hardCeilMult: 1.7,
    // Earn ramp over RIG's position across the visible strip (0 = flush with
    // the pursuing plane, 1 = pinned to the right clamp). A run starts at
    // ~0.45, so nobody is handed drive for booting; the clamp reads 0.97-0.99
    // on every view, so the ceiling is reachable on all of them. Below bankLo
    // the player banks NOTHING — being carried is not an achievement, so
    // nobody is ever escalated at for falling behind.
    bankLo: 0.55, bankHi: 0.92,
    killFull: 4, killDecaySec: 9,   // decaying kill streak: 4 kills saturates,
                                    //   an unfed meter empties in 9 s
    // Independent of the bank, deliberately: a struggling player who still
    // shoots straight earns up to wCombat of the range (x1.12 = 4.82 t/s) and
    // no more. That bound, not "always 4.30", is the floor promise, and it is
    // what pathcheck's WIRING/FLOOR probe and momentum-weak.json gate on.
    wBank: 0.7, wCombat: 0.3,       // must sum to 1 (asserted)
    risePerSec: 0.16,               // 6.25 s of held momentum floor → ceiling
    fallPerSec: 0.45,               // 2.2 s to shed it: relief is faster than
                                    //   escalation, deliberately
    hitDrive: 0.35, hitMercyMs: 1500,  // a hit caps drive here and forbids
                                       //   re-earning for a beat
    tiers: [0.2, 0.5, 0.8],         // HUD/telemetry banding only
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
    muzzleY: 1.05,             // firing line above the feet while standing. It sits ABOVE a
                               //   houndframe's hit circle (deck+0.03..0.87), which is the
                               //   whole reason the crouch/assist prototypes exist — the gap
                               //   is asserted in tools/pathcheck.mjs so it stays honest.
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

  crouch: {                    // ?crouch=1 — A/B prototype for the 8-way aim gap.
                               // A PLANTED stance, not a movement mode: it buys a low firing
                               // line and a low profile, and costs all horizontal speed while
                               // held (momentum doctrine — a crouch that let you keep running
                               // would just be a better default, and the answer to a charge
                               // must stay a movement verb). Jump still leaves instantly.
    height: 1.0,               // profile while crouched (standing 1.7): ducks a skimming dive
    muzzleY: 0.45,             // firing line: dead centre on a houndframe's hit circle
    aimLevel: true,            // crouched aim is horizontal — down means "get low", not "aim
                               //   at the deck", which is what the 8-way diagonal already did
  },

  assist: {                    // ?aim=assist — the other A/B answer to the same gap.
                               // Fire-time only: the shot leaves along a slightly corrected
                               // heading. Deliberately NOT per-frame steering (that is
                               // homing, and homing is a weapon), and hard-clamped so it can
                               // read as generosity rather than autoplay.
    coneDeg: 16,               // half-angle searched around the player's own aim
    maxDeg: 8,                 // hard cap on the correction: a few degrees, never a turn
    range: 12,                 // ignore anything further than this (rifle reach is 28)
    minFixTiles: 5,            // design contract: from here out, the cap is enough to close
                               //   the standing firing-line gap on a houndframe (asserted)
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
    tellCoilMs: 120,           // the COMMIT cue: the last stretch of the tell stops
                               //   blinking and goes solid while the frame coils hard.
                               //   A ramp alone reads as "go"; a ramp that resolves into
                               //   a held glow reads "not yet… NOW", which is the
                               //   difference between a reflex cue and a commit cue —
                               //   and the charge is answered on the commit, not the
                               //   onset (see the ruling in tools/pathcheck.mjs).
    tellCoilSquash: 0.22,      // silhouette drop as it coils: the spring loading
    chargeStretch: 0.35, chargeSquash: 0.12, chargeLean: 0.2,
    gaitFreq: 9, gaitAmp: 0.07, gaitTilt: 0.05,        // prowl stride bob
  },

  polyp: {                     // Iris Polyp (boards 06/07): a ROOTED emplacement that
                               // locks one connector's sightline with a side-facing
                               // beam. It never moves — placement is the whole threat
                               // (decisions.md entry 6) — and its iris armour makes
                               // openings, not hit points, the way it dies (DESIGN's
                               // "destroy it during an opening"). Presence timings
                               // (materialize, dissolve, depth breathing) are shared
                               // with CONFIG.wasp like every kind.
    hp: 6,                     // dies inside ONE vent window of rifle fire (asserted):
                               //   the opening is honest, and never a damage race
    hitRadius: 0.5,            // contact circle, inside the bulb silhouette
    size: 0.55,                // bulb radius (render); barrel + stalk are theater
    barrelSize: [0.9, 0.34, 0.34],   // the side-facing barrel, board 07's model note
    barrelTiles: 0.7,          // beam origin: barrel tip forward of the bulb center
    rootY: 1.05,               // bulb center above the mounted surface — EXACTLY the
                               //   standing firing line (player.muzzleY), asserted:
                               //   a level shot from the polyp's own lane center-
                               //   punches the bulb, so killing it during an opening
                               //   never needs the crouch/assist prototypes (the CP2
                               //   aim-gap lesson, applied at authoring time). The
                               //   beam rides the same line, so the lane it locks is
                               //   the lane you would trade from — you leave it or
                               //   you spend an opening, never duel it
    sightRange: 9.0,           // max beam reach; terrain and facet bends clamp it
    beamHalf: 0.32,            // beam band half-height: one lane, never a tier
    beamStepTiles: 0.35,       // sight march resolution — finer than a 1-tile wall,
                               //   so a beam can enter a wall face but never cross it
    tellMs: 800,               // iris dilate: the WHOLE reaction window sits before
                               //   the beam, and the beam never re-aims (a sightline
                               //   is answered by leaving it, not by outrunning it).
                               //   Sized 2x the SLOWEST escape (the drop-through,
                               //   asserted per player tune), not just the jump
    beamMs: 450,               // the lock: shorter than a full jump stays above the
                               //   band, so going over the beam is always an answer
    ventMs: 900,               // the opening: iris open, spent, vulnerable
    cooldownMs: 1600,          // iris shut, lane free — the same pant-window rhythm
                               //   as the hound's charge cycle
    // pose theater (render-only): the same warning grammar as the hound —
    // an accelerating warm blink that resolves into commitment.
    tellBlinkSlowMs: 170, tellBlinkFastMs: 60,
    tellSwell: 0.3,            // bulb dilates across the tell: silhouette change
    ventSag: 0.12,             // vent: visibly spent, the "shoot me now" beat
    beamPulseFreq: 24, beamPulseAmp: 0.25,
  },

  mortar: {                    // Seed-Pod Tripod (boards 06/07): denies an intended
                               // LANDING ZONE after a readable delay. It never aims at
                               // the player — it bombards an authored patch of floor —
                               // so the threat is entirely where that patch is
                               // (decisions.md entry 6) and the answer is always a
                               // movement verb: land short, land long, take the tier
                               // above, or take the floor below. Presence timings
                               // (materialize, dissolve, depth breathing) are shared
                               // with CONFIG.wasp like every kind.
    hp: 5,                     // ~0.65 s of rifle fire — one reload window kills it
                               //   (asserted): destroying it is a decision about time,
                               //   never a damage race
    hitRadius: 0.5,            // contact circle, inside the tube silhouette
    size: 0.5,                 // launch-tube radius (render); the legs are theater
    legSize: [0.16, 1.05, 0.16],
    bodyY: 1.05,               // tube center above the mounted surface — EXACTLY the
                               //   standing firing line (player.muzzleY), asserted: a
                               //   level shot from its OWN catwalk center-punches it,
                               //   so the reroute that answers the denial is also the
                               //   reroute that lets you shoot back (the CP2 aim-gap
                               //   lesson applied at authoring time)
    armRange: 13,              // horizontal distance from the ZONE at which it starts
                               //   its cycle. Bounded by the fixture's own follow lead
                               //   (asserted), so the first lob always happens on
                               //   screen — the mechanic teaches itself before the
                               //   player has to stand in it
    lobMs: 900,                // pod flight, muzzle → marked zone. The mark appears at
                               //   launch, so this is the FIRST half of the warning
    arcTiles: 2.6,             // parabolic bulge over the muzzle→zone chord: a mortar
                               //   throws OVER things (the readable difference from the
                               //   polyp's sightline)
    fuseMs: 640,               // the planted pod: the second half of the warning, and
                               //   on its own longer than the slowest answer to it
    burstMs: 220,              // the denial itself — a moment, never a state. Shorter
                               //   than a full jump stays above the slab (asserted)
    coolMs: 1500,              // reload: the zone is free and the tripod is a target,
                               //   the same pant-window rhythm as the hound's charge
    blastHalf: 1.5,            // marked patch half-width: 3 tiles of an 8-tile catwalk,
                               //   so landing short or long is always available
    blastHeight: 1.8,          // slab height over the marked surface: taller than a
                               //   standing body (no ducking a spore burst), lower than
                               //   any jump apex (going over it is always an answer)
    podRadius: 0.36,         // the pod in flight has to read at the FAR default, so it
                               //   is drawn larger than a bullet and lit its own color
    // pose theater (render-only): the same warning grammar as the rest of the
    // roster — an accelerating warm blink that resolves into commitment.
    markPulseSlowMs: 200, markPulseFastMs: 70,
    markThickness: 0.18,       // the surface pad: the loudest element at the FAR default
    warnDepth: -0.55,          // the denial volume sits just BEHIND the combat plane, so a
                               //   body standing in it keeps its silhouette (pillar 5)
    recoilTiles: 0.4,          // tube kicks back on launch, settles over the flight
    burstSwell: 0.35,          // the detonation's own silhouette pop
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

  transform: {                 // world transitions (flip inward, breach out) —
                               //   the opt-in ?slice=transform demo. The body is
                               //   static; a transition is the VIEW swinging through
                               //   a bend on the corner ritual's detent curve, ~1s,
                               //   with the player in control the whole way.
    haltOffset: 9,             // scroll halts at seamS - haltOffset (the turn apron):
                               //   close enough that the bend is the focal point and
                               //   the view sweeps a short radius around it
    chamferTiles: 2,           // the two bends of a turn, this many tiles apart
    thresholdTiles: 6,         // columns of the turn RIG rounds while the view swings
    armLookahead: 4,           // the way opens when RIG gets this close
    triggerOffset: 1.0,        // RIG must be this far past the seam to start the turn
    armMaxMs: 2600,            // then the pursuing edge resumes and pushes them in
    pressedOffset: 4,          // …but only to seamS - this, so the turn stays framed
    clampMargin: 0.5,          // right clamp inside the threshold: RIG rounds the bend
                               //   with the view, and never past what it has turned to
    sealInset: 0.4,            // a committed turn is one-way (the cover is behind RIG)
    windUpMs: 90, windUpDeg: -3,               // latch jolt / counter-rotation blink
    snap1Ms: 160, holdMs: 300, snap2Ms: 140, settleMs: 120, resumeMs: 180,
                               // t5 = 810, event total 990 ms
    seamPullTiles: 11,         // from the FIRST detent the view travels the chamfer:
                               //   the bend comes to the player (haltOffset + 2)
    backS: 1.1,                // yaw easeOutBack overshoot (~5%, one settle)
    snapDeg: 45,               // per detent; one turn is 2 × snapDeg = 90°
    panelJoltTiles: 0.18,      // unlatch jolt: the latch throws, the plate shivers
    cover: {                   // the one moving piece of the body (both turns) is a
                               //   MECHANISM — a hinged access plate in, a hinged
                               //   vent cover out. Nothing detaches, tumbles, or
                               //   disappears; every beat lands on a camera detent.
      unlatchMs: 120,          // arm: the latch throw before the swing (clack 1)
      ajarMs: 380,             // arm: one heavy swing to ajar — the way in reads
                               //   before RIG commits. unlatch+ajar stays inside
                               //   the 532 ms worst-case arm window (a full
                               //   sprint from the arming lookahead), asserted
      ajarFrac: 0.8,           // ajar clears the combat lane but is visibly NOT
                               //   seated: the relock still owes a beat
      snapFrac: 0.96,          // snap 1 carries the plate here — it clacks with
                               //   the camera's first detent, a hair short of home
      relockMs: 120,           // hold: the plate is driven home and seats flush
                               //   against the interior wall (G2 "rotates and
                               //   relocks"), well before snap 2
      blowBackS: 2.8,          // breach: overswing past the stop, caught ON the
                               //   detent — one motion, no tumble, no debris
      breachStopDeg: 104,      // breach rest angle: past flush, hanging open
    },
    clearMsgMs: 1400,          // how long a turn's HUD stinger stays up
    // RETIRED FROM TRANSITIONS, RESERVED FOR HOSTILE CONSTRUCTS (FLEET-PLAN
    // July 30 addendum): the staggered assembly drop. The creature's body
    // never assembles; things the ship builds do. Kept whole for a later
    // traps/enemies lane — nothing in the transition path reads it.
    assembly: {
      startMs: 200, chunks: 24, perColMs: 12, dropMs: 130,
      dropTiles: 3.2, dipTiles: 0.06, dipMs: 40,
    },
  },

  limb: {                      // ?g1=1 — the six-face tower READ AS a creature
                               //   limb (docs/proposals/2026-07-meridian-monster-
                               //   greybox-map.md, gate G1). Render-only: the
                               //   simulation, the corner ritual timings and the
                               //   built-column state machine are untouched, so
                               //   every constant here is presentation.
    fog: { near: 24, far: 52 },   // tighter than CONFIG.fog: the facet around the
                                  //   joint has to wash out into haze. The visible
                                  //   route strip (≈26 tiles ahead) stays under
                                  //   ~15% fog; 20 tiles past the joint is ~55%.
    bg: 0x46525f,              // Haze, not void: the shipped bg is darker than the
                               //   grey-box itself, so distance READ AS BLACK and a
                               //   limb has no atmosphere to recede into. A mid-value
                               //   blue-grey lets far armour wash out and silhouette,
                               //   while the deck (palette.ground) stays the
                               //   brightest thing on screen.
    // The protected volume. NOTHING baked outward of the play plane may enter
    // it, so the limb can never hide RIG, a hostile, a bullet or a deck.
    // pathcheck asserts it over every piece of the plan.
    playBand: { y0: -1.0, y1: 12.6 },
    planeHalfDepth: 1.0,       // tile half-depth: "outward" means beyond this
    fallOutwardMax: 2.2,       // outward reach allowed over columns that may be a
                               //   gap — a fall must stay visible to the kill plane
    // The one exception to the play-band rule, and the reason it is safe: a
    // kerb along the deck's outer lip whose TOP sits below the deck surface.
    // The camera looks slightly DOWN at the deck, so a lip lower than the deck
    // cannot occlude anything standing, crawling or flying above it — it only
    // covers the tile faces beneath. Concept board 14 (the switchback ramp
    // spiralling the body) reads as one continuous route precisely because its
    // ramp edge is unbroken around every turn, so this is the piece that keeps
    // RIG landing on the SAME ramp rather than on a new face.
    kerb: { outward: 0.36, h: 0.5, under: 0.3, thickness: 0.9, overlap: 0.06 },
    kerbOutwardMax: 0.4,
    jointOutwardMax: 7.5,      // …and over a joint apron, where the generator
                               //   guarantees flat solid ground (no fall to hide)
    chunkCols: 8,              // dressing granularity along a facet (deck ref step)
    // the mass under the deck: armour skin, then the body running off frame
    hull: { drop: 34, depth: -1.1, thickness: 3.6, ribH: 0.5, ribThickness: 4.6 },
    // overlapping scutes: the limb's skin. They read as shingles at the grazing
    // angle a facet is seen at once it is 20+ tiles away, which is what makes the
    // stretch past the joint read as armour instead of as the next level.
    scute: { every: 5, len: 6.4, h: 2.6, thickness: 1.3, depth: 1.5,
             under: 1.6, stagger: 0.42, ribEvery: 3, ribW: 0.7, ribH: 3.4 },
    // The body rising behind the combat plane, told in HORIZONTAL plate seams
    // and two receding tiers. Nothing vertical: a colonnade of ribs reads as
    // architecture (the macro form the operator rejected in boards 1-5), while
    // stacked plates stepping backwards read as a body curving away.
    // Above the wall's shoulder there is nothing but haze: stacked tiers and
    // light horizontal caps read as ceiling beams and shelves (and compete
    // with the catwalks RIG actually stands on), so the only lines here are
    // DARK seams — shadow, not structure.
    wall: { depth: -6.0, below: 6, above: 6.5, thickness: 0.9,
            capH: 0.5, capThickness: 1.1, capDepth: 0.1,
            seamAt: [2.2], seamH: 0.35, seamThickness: 0.6 },
    // the joint: what the camera orbits. A ridge where two armour facets meet, a
    // tendon-anchor buttress under the deck (outward, so it sweeps the frame in
    // parallax), and a cowl plate over the top of the joint.
    joint: {
      apronBack: 5, apronFwd: 3,          // the generator's flat apron: [cs-5, cs+3)
      ridgeW: 3.2, ridgeThickness: 5.4, ridgeDepth: -5.0, ridgeBelow: 7, ridgeAbove: 9,
      collarW: 5.6, collarH: 2.4, collarThickness: 4.6, collarDepth: -5.6, collarAt: 1.4,
      buttressW: 4.0, buttressH: 11, buttressThickness: 8.0, buttressDepth: 2.6,
      buttressTop: -1.4,                  // …entirely below playBand.y0
      cupW: 3.0, cupH: 3.4, cupThickness: 5.0, cupDepth: 1.4, cupTop: -1.6,
      tendonW: 1.1, tendonThickness: 1.1, tendonDepth: -2.2,   // behind the plane
      // NOTE: an outward cowl plate over the joint was tried and cut. Anything
      // with mass above eye level shows the camera its unlit underside, and a
      // black lid over the route is exactly the "interior warehouse" read the
      // operator rejected for the macro form. The joint carries itself on the
      // ridge, the collar and the buttress.
    },
    // Distant anatomy: the limb continuing up out of frame and the body beyond
    // it, authored at ABSOLUTE height so it stays static like everything else.
    // Placed to clear the wall cap and sit deep in the fog band — silhouettes,
    // never readable surfaces. `atFrac` is a fraction of the facet's length.
    // Thin plates, not blocks: anything with mass above eye level shows the
    // camera its unlit underside, which is what turns distant anatomy into a
    // ceiling. A slab 2.4 deep reads as a silhouette in the haze instead.
    //
    // SUPERSEDED BY `backdrop` BELOW (T-045) AND KEPT AS THE A/B (?scale=0).
    // Both slabs are authored past the haze band's own far plane: at depth -34
    // the fog factor is 1.16 — clamped to 100% haze, i.e. drawn in exactly the
    // background color and INVISIBLE at every shipped view — and at -26 it is
    // 0.875, so that one carries 12.5% of its contrast. Two pieces of distant
    // anatomy, one of which cannot be seen at all and one of which is a faint
    // rectangle: that is the whole population of the fog band, which is why
    // the band measured as one flat token over 29-34% of the frame.
    silhouette: [
      { atFrac: 0.40, y0: 22, h: 46, w: 40, depth: -34, thickness: 2.4 },
      { atFrac: 0.86, y0: 27, h: 40, w: 24, depth: -26, thickness: 2.4 },
    ],
    // Per-facet material tone: weathering, not a state change. Each facet keeps
    // its tone forever, so a joint has two visibly different armour planes.
    tone: [
      [1.00, 1.00, 1.00], [1.04, 1.02, 0.99], [0.96, 0.98, 1.03], [1.02, 1.00, 0.97],
      [0.97, 1.00, 1.04], [1.03, 1.01, 0.98], [0.98, 0.99, 1.02],
    ],
    // ?shade= only (T-035, packet item S2): the haze band re-authored around
    // the depth the limb's mass actually occupies. `fog` above lands at
    // 44.25/72.25 once the FAR pull-back shift (+20.25) is folded in, while
    // the camera sits 42.75 from the play plane — the play plane is at the
    // very START of the ramp, so nothing between RIG's surface and the
    // backdrop grades, and the distant anatomy at depth -34 sits PAST `far`,
    // i.e. it is 100% haze and cannot be seen at all. Both numbers are
    // derived, not taste (three.js fogs on view-space depth, `vFogDepth =
    // -mvPosition.z`, so these are depths along the camera's forward axis):
    //   near 26.5 — the worst-case point of the protected play band (the
    //     screen-edge column at playBand.y0) sits at view depth 45.18 at FAR
    //     and 25.29 at ?view=near, both UNDER this band's start, so a hostile
    //     at the frame edge is never hazed: measured 0.0% at every shipped
    //     view at 16:10 and 16:9, and 0.0-0.3% even at an ultrawide 2.40.
    //     Today's 24 puts that same corner 3.3-9.3% into the ramp, which is
    //     what the note at src/render/camera.js:64-73 was written about.
    //   far 54.5 — a SHIFT, not a stretch: the width stays 28 (see below).
    //     The wall tier then sits at 0.07 (0.16 today) and the -26 silhouette
    //     at 0.73 (0.82 today) — the near air is clearer and the far air is
    //     still air, so what grades between them is the limb's own mass.
    // WHY THE WIDTH IS PINNED, and the follow-up it owes. src/main.js's
    // selftest asserts 'limb haze armed' as
    //   |(scene.fog.far - scene.fog.near) - (limb.fog.far - limb.fog.near)| < 1e-6
    // i.e. it checks the band's WIDTH against this table. Widening the ramp to
    // 37.25 (near 25.75 / far 63.0), which is what it takes to bring the
    // deepest authored slab at depth -34 in at 0.79 instead of the 1.00 —
    // fully erased — it sits at under BOTH bands today, therefore requires
    // that check to compare against the band camera.js actually selected.
    // src/main.js is fenced to another lane this cycle, so the widening is
    // NOT shipped here and the measured numbers for it are recorded above so
    // the follow-up does not have to re-derive them.
    // Asserted in tools/pathcheck.mjs against both bands; `fog` above is the
    // shipped default and is unchanged.
    shadeFog: { near: 26.5, far: 54.5 },

    /* ======================= THE SCALE PASS (T-045) ======================= *
     * decisions.md entry 17: "the 'far' camera is meant to make the play feel
     * like the tiny human scaling a giant monster." FAR is permanent and RIG
     * is 3.74% of frame height on purpose, so the work is not on RIG — it is
     * on giving the frame something that makes 3.74% read as SMALL. Two
     * blocks do it, and they are the two halves of one idea:
     *
     *   `backdrop` — graded anatomy tiers (packet item S4), so distance
     *     separates into layers instead of collapsing into one flat token.
     *   `mark`     — human-scale reference objects (rungs, hatches, doors,
     *     railings) at ONE absolute size, on the limb RIG runs on AND on the
     *     backdrop limb behind it. Scale is comparative: without a known-size
     *     object, big geometry only reads as close geometry.
     *
     * Everything here is static anatomy (entry 3): baked once, never touched,
     * revealed by the camera and never assembled. ?scale=0 restores the
     * `silhouette` pair above, which is the operator's A/B. NOT to be confused
     * with ?view=, which is the camera pull-back (CONFIG.viewScales).
     *
     * TWO DERIVED FENCES GOVERN EVERY NUMBER BELOW. Both are asserted in
     * tools/pathcheck.mjs against this table, at every entry of viewScales.
     *
     * 1. THE HAZE LADDER. three.js fogs on view-space depth, and camera.js
     *    shifts the band by (cameraDepth - camera.z), so a piece's fog factor
     *      f = (|depth| + camera.z - limb.fog.near) / (limb.fog.far - fog.near)
     *    is the same number at near, mid and far — a tier is authored once and
     *    grades identically at every view. Occupied depths today: the play
     *    plane 0.00, the hull 0.00 (clamped), the joint ridge 0.125, the wall
     *    0.161 … and then NOTHING until the sky at 1.0. The three tiers below
     *    land at 0.446 / 0.625 / 0.804: four steps of aerial perspective in
     *    the gap where there was one flat field.
     * 2. THE PLAY-BAND FENCE. A backdrop piece must appear ON SCREEN entirely
     *    above the protected play band, at every view scale — for a pinhole
     *    camera two points at the same screen x order by (y - camera.y) / dist,
     *    so the test is exactly
     *      (yBottom - camera.y) / (camera.z*mult + |depth|)
     *          > (playBand.y1 - camera.y) / (camera.z*mult)
     *    ?view=near is the binding case (its ratio is the largest): it puts
     *    the floor at y = 16.58 / 18.00 / 19.43 for depths 14 / 19 / 24.
     *    Authored floors clear those by ~0.5-1 tile. The consequence is the
     *    one that matters for pillar 5: no hostile, tracer, capsule or falling
     *    RIG is EVER drawn against new backdrop mass — the air where the fight
     *    happens stays exactly as clean as it is today, and the new mass sits
     *    above it. It is also why nothing here can recreate the interior
     *    "warehouse" macro read entry 0b rejected: a lid would have to hang
     *    into the play band to be a lid.                                     */
    backdrop: {
      // Tier 1, f = 0.446 — THE SISTER LIMB. Board 10's signature read: a
      // second arm of the same body crossing behind the one being climbed.
      // It reuses the played limb's own vocabulary (segmented mass, a lip
      // along the top, rings at the segment joints) at ~2.6x its scale, which
      // is what makes two masses read as one CREATURE instead of as scenery —
      // and it is the only tier close enough to carry `mark` objects, so it
      // is the piece that says "that thing is a hundred of him".
      sister: {
        depth: -14, thickness: 1.5,
        segW: 6.6, segH: 7.6, overlap: 0.4,   // ~2.6x the played limb's chunkCols rhythm
        y0: 17.0,                             // floor: clears the near-view fence (16.58)
        yStep: 2.4, ySteps: 4,                // per-facet base offset, hashed
        rise: 20.0,                           // climb across the run: a steep diagonal, so
                                              //   it crosses the frame instead of capping it
        span: 0.45, spanAt: 0.16,             // it covers PART of a facet and leaves sky:
                                              //   a mass that spans the frame edge to edge
                                              //   is a ceiling, which entry 0b rejected
        lipH: 1.0, lipOut: 0.35,              // the kerb line, one scale up
        ringEvery: 3, ringW: 1.7, ringOver: 2.4, ringOut: 0.55,
      },
      // Tier 2, f = 0.625 — VERTEBRAL DRUMS. A spine seen edge-on: barrels
      // linked by a shaft. Boxes, not a prism — at 62% haze a chamfered
      // stack and a 16-gon are the same silhouette, and a box costs no second
      // geometry and therefore no second draw call.
      spine: {
        depth: -19, thickness: 2.2,
        every: 17, y0: 20.0, yStep: 2.4, ySteps: 3,
        drumW: 8.4, drumH: 7.8,
        // barrel profile, bottom to top: [width factor, height factor]. Five
        // chorded slabs read as a drum; three read as a stepped box.
        barrel: [[0.62, 0.18], [0.86, 0.20], [1.0, 0.44], [0.86, 0.20], [0.62, 0.18]],
        linkH: 3.4,                                     // the shaft they thread onto
      },
      // Tier 3, f = 0.804 — THE FAR BODY. One continuous mass with a STEPPED
      // top edge, so something enormous is in frame at every point of the run
      // (asserted), and a crown of spires once per facet: board 14's horizon,
      // told as silhouette only. At 80% haze this tier carries ~20% of its own
      // contrast, which is why it may be continuous without becoming a wall.
      far: {
        depth: -24, thickness: 2.0,
        segW: 21, overlap: 0.6, y0: 20.5,
        tops: [29.0, 33.5, 30.5, 35.5, 31.5, 28.0],     // hashed per segment: broad
                                                        //   steps, not a city skyline
        spireAt: 0.62, spires: 6, spireW: 1.1, spireGap: 2.1,
        spireH: [8, 14.5, 10, 18, 9.5, 12.5],
      },
    },
    /* Human-scale reference objects. THE SIZES ARE THE POINT: RIG is 1.7 tiles
     * tall (CONFIG.player.height, the sim's own body constant), so a 2.9-tile
     * door is 1.7x him, a rung ladder is climbable, a railing is waist-high on
     * a walkway. The same table is emitted twice — on the hull skirt under
     * RIG's feet and on the backdrop sister limb — at IDENTICAL absolute
     * dimensions (asserted), because a reference object that is re-sized to
     * look good at distance is not a reference object.
     *
     * WHERE THEY GO, AND WHY NOT ON THE WALL. The band below the deck lip is
     * bare hull for ~30 tiles (the scutes stop around y = -6.6) and fills the
     * bottom third of the frame; it is outside the protected play band, so
     * detail there cannot compete with a hostile, a tracer or a falling RIG.
     * The wall directly behind the fight is the one surface these deliberately
     * do NOT dress.
     *
     * ONE HONEST COMPROMISE: rung pitch is 0.62 tiles (~0.65 m — a real ladder
     * is nearer 0.3) and a rung is 0.2 tall. At the shipped FAR view one tile
     * is ~2.2% of frame height, so a true-pitch ladder would be a 1 px stripe
     * that aliases into mush. These are authored to RESOLVE at the view the
     * game actually ships: a scale cue that cannot be seen is not a cue. */
    mark: {
      band: { y0: -7.2, y1: -18.0 },   // hull skirt: below the scutes, above the
                                       //   bottom of frame (visible to y = -17.9)
      out: 0.66, thickness: 0.35,      // just proud of the hull face (depth 0.7),
      proud: 0.12,                     //   and a hatch cover proud of its own rim —
                                       //   both still reach <= 0, so no mark is ever
                                       //   outward mass the fall rules have to judge
      ladder: { every: 22, runH: 10.0, pitch: 0.62, rungW: 1.3, rungH: 0.2,
                stileW: 0.18, at: 0.35 },
      hatch: { every: 17, rimW: 2.8, rimH: 2.8, panelW: 2.2, panelH: 2.2 },
      door: { every: 41, rimW: 1.9, rimH: 2.9, panelW: 1.5, panelH: 2.5,
              sillH: 0.25 },
      rail: { len: 13.5, postEvery: 1.7, postH: 1.0, postW: 0.16,
              barH: 0.18, at: 0.55 },    // gantry railing, sister limb only
    },
  },

  /* ---------------------------- VALUE LADDER ---------------------------- *
   * ?shade=<0..1> — T-035, packet item S1 (docs/proposals/2026-08-look-
   * direction.md). Math in src/pure/shade.js; per-palette gain in
   * src/render/palette.js; applied to instance colors in src/render/limb.js
   * and src/render/level.js. OFF by default: the ladder moves value only, and
   * it has to be judgeable independently of the palette's hue pass (Palette
   * v1 is still queued and unjudged), so it gets its own flag rather than
   * riding ?palette=.
   *
   * Every number below is a LINEAR multiplier on the instance color, because
   * that is the space three.js multiplies in (Color.setHex converts sRGB to
   * the linear working space). Display luminance moves as k^(1/2.2), so the
   * ladder's endpoints read as: 0.54 -> 76% of the token's display value,
   * 0.26 -> 53%, 0.115 -> 37%, 0.02 -> 17%. The measured target is board 13's
   * material ramp (52-81 display levels between a material's lit and
   * shadowed instances, against 34.0-34.4 measured on the shipped build).  */
  shade: {
    // THE SHIPPED DOSE, AND IT IS AN OPERATOR VERDICT (2026-08-02): "C on the
    // ladder feels better, shade=0.5 the other is too dark." Half strength is
    // the game's look; full strength is judged and rejected. This is the value
    // the default URL carries — nobody should have to type a query parameter
    // to see the approved build — and every multiplier below is interpolated
    // toward 1.0 by it (1 + dose * (raw - 1)) rather than being folded into
    // the constants, so the frames he approved reproduce bit for bit and the
    // rejected full dose stays reachable at ?shade=1 for a re-ask.
    // ?shade=0 restores the pre-T-035 value range exactly.
    //
    // CONSEQUENCE, STATED HERE BECAUSE IT IS EASY TO MISS: two of the packet's
    // falsifying tests for S1 describe the FULL ladder and are arithmetically
    // out of reach at this dose — no instance can land below 0.55x its token
    // above roughly gain 0.75, and the deck's row-1-to-row-2 step no longer
    // exceeds the checker's own delta. Both are asserted at gain 1 (the model
    // must still be able to produce that range) and separately recorded at the
    // shipped dose in tools/pathcheck.mjs. The verdict outranks the threshold;
    // the numbers are not quietly restated to match.
    dose: 0.5,
    seed: 20350801,            // ladder-only seed: it must not perturb the
                               //   generator's or the spawn tables' streams
    cell: 1,                   // occupancy cell size in tiles (s, y)
    tierAt: [-3, -12],         // depth thresholds -> the three authored planes:
                               //   deck lip/skin, body wall, distant anatomy
    tierWeight: [1, 0.45, 0.15],  // a neighbour one plane back occludes less
    ao: { radius: 3, amount: 0.45 },       // ring AO around a piece's footprint
    sky: { rise: 7, spread: 1, amount: 0.45 },  // mass directly overhead
    rake: { amount: 0.22 },    // lift for a wide top face under open sky
    // Key-light survival by depth behind the combat plane. The breakpoints
    // are the authored tiers: the plane itself (deck lip, scutes, buttress),
    // the wall at 7, the joint mass, and the two silhouette slabs at 27/35.
    // The two silhouette values differ on purpose — one flat backdrop value
    // is exactly the "one token covers a third of the screen" finding.
    extAt: [[0, 1.0], [7, 0.80], [16, 0.55], [27, 0.30], [35, 0.18]],
    lit: 0.70,                 // a fully exposed limb face, relative to its token
    ceil: 0.74,                // …and the hard ceiling with the rake lift folded
                               //   in. Both sit under the deck: the deck's top
                               //   row has to stay the brightest baked instance
                               //   (src/render/palette.js's rule, asserted as
                               //   arithmetic in pathcheck rather than as prose).
    floor: 0.02,               // deep anatomy may go nearly black; the fog band
                               //   above is what lifts it back into the haze
    facet: [1, 0.96, 1.03, 0.98, 1.02, 0.95, 1.0],  // each facet meets the key
                               //   light at its own angle — the value version of
                               //   CONFIG.limb.tone's +-4% hue weathering
    // Coherent stain field, shared with the deck: bands of ~23 and ~7 tiles,
    // never per-piece white noise (which reads as dither at 3.7% RIG height).
    // `contrast` expands the field around its midpoint — a sum of octaves is
    // bell-shaped, and without this a material whose pieces are geometrically
    // identical (56 hull slabs, 6 joint ridges) comes out one value again,
    // which is the defect the pass exists to fix.
    wear: {
      amount: 0.68, contrast: 2.4,
      octaves: [
        { periodS: 23, periodY: 11, weight: 0.65 },
        { periodS: 7, periodY: 5, weight: 0.35 },
      ],
    },
    // The deck stack, four tiles deep: d=1 is the lit lip, d=4 the bottom.
    // The ramp is the ladder; `wear` is the same stain field at an amplitude
    // deliberately UNDER the checker's own value delta (|lum(ground) -
    // lum(groundAlt)| = 11.9% of display luminance), because the checker's
    // job is scroll-speed readability and this may not swamp it. Measured on
    // the shipped bake: the wear swing is 8.2% against the checker's 11.9%,
    // while the row-1-to-row-2 step is 19.4 display levels against the
    // checker's 16.8 — the ramp is the bigger carrier, the checker survives.
    //
    // TWO MEASURED CORRECTIONS ARE BAKED INTO THESE FOUR NUMBERS, and both
    // came out of captures rather than out of taste:
    //   1. The ramp is NOT linear. One hard step under the lip (the contact
    //      shadow a deck edge casts on its own face), then a shallow tail. A
    //      linear ramp to 0.22 was measured first and took the whole deck-face
    //      population down with it: the captured frame's p95 fell 13% and the
    //      traversal slice's slabs sank to within 2 luminance levels of their
    //      own backdrop — a legibility regression, and the "dirty, not lit"
    //      failure this pass is most at risk of.
    //   2. The lip is LIFTED, not just the face lowered (1.35, i.e. 1.13x in
    //      display terms). A ladder that only removes light makes the sky the
    //      brightest thing in the frame, which is the packet's own "nothing
    //      reads as lit" finding pointing the other way. Lifting the top row
    //      keeps the deck the brightest large surface — the rule
    //      src/render/palette.js states in prose and pathcheck now checks as
    //      arithmetic — and keeps a 54-level ramp from lip to stack bottom.
    //      Measured headroom: no channel clips at 1.35 on either checker token.
    deck: { rows: [1.35, 0.70, 0.62, 0.56], wear: 0.17 },
  },

  edges: { margin: 0.4, killY: -7 },

  juice: {                     // Baseline feedback pass (T-011). ONE block: every
                               // effect below has its intensity here, so the whole
                               // pass is retuned (or read) in one place, and
                               // ?juice=0 makes every one of them inert.
                               // Math lives in src/pure/juice.js; the sim owns
                               // hit-stop (it changes gameplay), the renderer owns
                               // everything else. Restrained by ruling, not taste:
                               // pillar 5 (chaos stays readable) and the FAR default
                               // view (decisions.md entry 7) mean RIG is ~3.7% of
                               // screen height — an effect sized for a big sprite
                               // becomes a smear here.
    hitStop: {                 // the one gameplay-affecting effect: the world holds
                               // still for a beat, expressed as a dt SCALE so gameMs
                               // deadlines never drift (the CHRONO convention)
      killMs: 42,              // a kill: shorter than one 60fps frame pair — felt,
                               //   not waited through, even on a spread volley
      hurtMs: 90,              // taking damage: the bigger beat, and rare
      scale: 0.08,             // near-freeze rather than a hard 0: bullets, hostiles
                               //   and RIG all creep, so nothing reads as a hitch
      maxMs: 120,              // hard ceiling on a stack: a crowd kill can never
                               //   stall the run (and the crush plane freezes with
                               //   the world, so a freeze is never a free reprieve
                               //   or an unfair shove)
    },
    shake: {                   // trauma model: amplitude is trauma SQUARED, so only
                               // real beats move the frame
      maxOffset: 0.15,         // world tiles at trauma 1 — ~0.5% of the FAR frame
      maxRollDeg: 0.55,
      freqHz: 22, decayPerSec: 2.0,
      kill: 0.15, hurt: 0.46,  // per-event trauma
      snap1: 0.24, snap2: 0.32,  // ritual yaw detents (corner + transform)
      boom: 0.36,              // a face reveals / a band commits
      rumbleMax: 0.09,         // sustained tremble while a ritual holds the scroll
    },
    // Sizes are in TILES and were set against the shipped FAR view, where RIG
    // is ~3.7% of screen height: anything under ~0.1 tiles is a pixel or two
    // and reads as noise rather than feedback (measured, see the T-011 report).
    muzzle: { ms: 80, size: 0.5, offsetTiles: 0.5, volleyGapMs: 55 },
    impact: { count: 4, speed: 5.5, ms: 240, size: 0.12, gravity: -14, gapMs: 40 },
    death:  { count: 10, speed: 7.5, ms: 420, size: 0.17, gravity: -16,
              flashMs: 130, flashSize: 0.95 },
    hurt:   { count: 9, speed: 6.0, ms: 380, size: 0.16, gravity: -14,
              flashMs: 150, flashSize: 1.3 },
    pickup: { count: 7, speed: 3.6, ms: 320, size: 0.13, gravity: -6,
              flashMs: 190, flashSize: 0.8 },   // measured: bigger than this and
                               //   the reward flash covers RIG at the FAR view
    crush: {                   // the pursuing damage plane, made visible before it
                               // kills — same accelerating-warning grammar as the
                               // hound tell and the polyp iris
      startTiles: 3.4,         // margin at which the warning first reads
      pulseSlowMs: 460, pulseFastMs: 130,
      maxOpacity: 0.55,        // additive haze: it never hides a deck or a hostile
      height: 15, width: 0.8, depth: 2.2, y0: -1.5,
      inset: 1.0,              // the band stands just INSIDE the plane (this
                               //   fraction of its own width), so it marks the
                               //   strip about to be swept instead of hanging
                               //   half off the edge of the screen
    },
    pools: { particles: 224, flashes: 20 },   // fixed pools; a full pool drops the
                                              // newest request rather than allocating
  },

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
    polyp: 0x74a83b,                       // same acid-green ecology, its own value; the rooted
                                           //   bulb-and-barrel SILHOUETTE carries the read
    polypTell: 0xffd0a0,                   // one warning language across the roster: warm blink
    polypBeam: 0xc6ff4f, polypVent: 0xd9a06a,     // hot acid lock / dim spent "opening" glow
    mortar: 0x6d9a4e,                      // same acid-green ecology again, its own value; the
                                           //   tripod-and-tube SILHOUETTE carries the read
    mortarTell: 0xffd0a0,                  // the roster's one warning language: warm blink
    mortarPod: 0xd8ff7a,                   // the spore pod in flight — the arc has to be the
                                           //   most legible thing on screen while it flies
    mortarMark: 0xffa64d, mortarBlast: 0xffe08a,  // the marked landing patch / the detonation
    // snap-hook markers (?hook=1): warm hardware idle, hot when live, pale
    // tether. Never the pickup magenta and never the hostile green — an anchor
    // has to read as grabbable machinery at a glance (DESIGN's aiming rule).
    hookAnchor: 0xc8a04a, hookLive: 0xffd166, hookTether: 0xfff0c2,
    shots: { R: 0xfff0c2, S: 0xffc76a, L: 0x9ff7ff, H: 0xff9adf, F: 0xff8a4a },
    tints: { lance: 'rgba(255,255,255,0.5)', rage: 'rgba(255,50,50,0.14)', chrono: 'rgba(90,200,255,0.12)' },
  },
};

// derived rosters: adding a weapon to CONFIG.weapons wires kills + drops
export const WEAPON_LETTERS = Object.keys(CONFIG.weapons);

/* ==== T-041 impact language ==== */
// S10: the sim collides every bullet as a POINT (src/sim/weapons.js) — no
// bullet has a radius in the sim at all — so a drawn nose reaching ahead of
// that point claims a hit the sim never gave. The shipped laser bolt already
// draws 7 * rifle.radius = 1.12 tiles of nose with pathcheck green; that is
// the existing precedent, not a new number, so nothing this pass adds may
// draw further ahead of a bullet's center than L already does. Derived
// rather than duplicated so a future retune of either value can't drift the
// two apart silently.
export const BULLET_NOSE_CEILING_TILES = CONFIG.rifle.radius * CONFIG.weapons.L.scale[0];
/* ==== end T-041 impact language ==== */

/* ==== T-047 light rig ================================================
 * The numbers behind src/render/lightrig.js (descriptors + math) and
 * src/render/lights.js (the three.js objects). Authorized by
 * docs/decisions.md entry 18: "a real light rig, including shadow maps …
 * raking key, fill, rim. Shadows on the play band," plus tone mapping and
 * exposure. Colors are NOT here — they stay palette tokens
 * (src/render/palette.js: sun / hemiSky / hemiGround), by the ruling that
 * render color lives render-side. Only geometry and dose live here.
 *
 * ANGLES ARE VIEW-RELATIVE, not world-fixed. The tower turns 60 degrees at
 * every corner, so a world-fixed key would light two faces and backlight two
 * others — the deck would stop being the brightest large surface on a third
 * of the run, which is exactly the ranking every CONCEPT token was authored
 * against (src/render/palette.js:28-32). Azimuth is measured in the camera's
 * own frame: 0 = the direction of travel (screen right), +90 = out of the
 * screen toward the camera. Elevation is degrees above the horizon.
 *
 * WHY THE KEY IS NOT LOWER. A true raking key (elevation < 40) makes the
 * vertical faces brighter than the horizontal ones, which inverts the deck's
 * place at the top of the value ladder. 50 degrees keeps tops brightest while
 * still splitting the two vertical families apart — the ladder is asserted
 * over these numbers in tools/pathcheck/t-047-light-rig.mjs, so lowering this
 * without re-authoring the palette turns the gate red rather than the frame
 * to mud.
 *
 * EXPOSURE, AND WHY IT GOES UP RATHER THAN DOWN. decisions.md entry 14: the
 * operator judged the full value ladder "too dark", so drama here comes from
 * DIRECTION and CONTRAST, never from lowering the frame. scene.background and
 * fog are drawn raw (fog is mixed AFTER tone mapping in three.js' fragment
 * chain), so exposure lifts LIT SURFACES relative to the haze and nothing
 * else — which is the direct answer to the audit's measured defect that the
 * backdrop rendered brighter than the deck. */
export const LIGHT_RIG = {
  /* THE SHIPPED DOSE. Measured at the 6s combat mark on the default run
     (artifacts/lightrig/, tools/playtest/lightrig-capture.mjs), against the
     pre-T-047 rig: frame mean 68.2 -> 72.7 (brighter, per entry 14), p95
     89.9 -> 110.8, share of frame above the backdrop haze 40.0% -> 62.9%.
     Two doses either side of it were captured and rejected here rather than
     shipped: exposure 1.18 held the mean but let the deck fall BELOW the
     backdrop again, and exposure 1.5 (?light=bright, still selectable) is a
     dose question only the operator can answer — entry 14 was itself a dose
     verdict, so this one goes to him with an A/B rather than a claim. */
  exposure: 1.35,             // ACESFilmic exposure; 1.0 was the shipped default
  key:  { intensity: 2.45, azimuthDeg: 40, elevationDeg: 50 },   // warm, high-right, front
  fill: { intensity: 0.62, azimuthDeg: 150, elevationDeg: 78 },  // cool sky/ground wrap, tilted
  rim:  { intensity: 0.75, azimuthDeg: 214, elevationDeg: 12 },  // cool kicker on the key's dark side
  // ?light=bright — the next step up the same ladder, unjudged, for the dose
  // A/B. Angles, rim and shadow are identical; only these two move.
  bright: { exposure: 1.5, keyIntensity: 2.6 },
  shadow: {
    mapSize: 2048,             // one map, one casting light
    // Half-extents of the ortho shadow camera, in tiles, in light space. The
    // calibrated visible strip at the FAR default (CONFIG.camera.z *
    // viewScales.far.depthMult, fov 56, 16:10) is ~36.4 x 22.7 tiles from
    // center, so these cover the frame with a small margin and stop there:
    // a frustum spanning a continent-sized creature would be both useless and
    // slow. Texel footprint = 2*halfWidth/mapSize = 0.039 tiles (~4 cm against
    // RIG's 1.9-tile height), asserted in pathcheck.
    halfWidth: 40, halfHeight: 28,
    distance: 70,              // how far up the key direction the shadow camera sits
    near: 1, far: 170,         // must clear `distance` plus the limb behind the play plane
    bias: -0.0006, normalBias: 0.05,   // flat-shaded instanced boxes acne/peter-pan trim
    // No filter radius: the renderer runs PCFSoftShadowMap, whose kernel is
    // derived from the map's own texel size, so a `radius` here would be an
    // inert number that reads like a tuning knob.
    // The band leads the run rather than centering on the camera's look
    // point: RIG sits left of frame center and the route arrives from the
    // right, so the casters that matter are ahead.
    aheadTiles: 3.0,
    // Texel snapping quantum comes from mapSize/halfWidth; this only turns it
    // on. Off, a moving ortho shadow camera crawls along every edge.
    snapToTexel: true,
  },
};
/* ==== end T-047 light rig ==== */

/* ==== T-048 post pass (docs/decisions.md entry 18) ==== */
// Tuning for the screen pass in src/render/post.js. Kept OUT of the CONFIG
// literal above on purpose: four look lanes are appending at once, and a
// delimited block at the end of the file is a merge the integrator can read.
//
// `threshold` is a LINEAR-LIGHT luminance, not an 8-bit value: the pass runs
// before tone mapping, where the deck's lit rust sits near 0.1 and an unlit
// warm-white quad sits near 1. Above ~0.7 the only things in frame are the
// ones that are meant to BE light, which is what keeps bloom off the hull and
// off enemy bodies (pillar 5 — a bled wasp is a lost wasp).
//
// `emissiveGain` is the HDR headroom the emissive families get so they land
// above that line at all. It applies only while the pass is actually drawing.
export const POST_TUNE = {
  bloom: {
    strength: 0.62,                      // composite gain of the blurred bright pass
    radius: 0.30,                        // mip spread — how far the bleed reaches
    threshold: 0.78,                     // linear luminance a pixel must beat to bleed
    strengthMax: 3,                      // clamp on the ?bloom=<n> override
  },
  // MSAA on the composer's scene buffer (0 = none, ?aa=<n> overrides for A/B).
  // A composer does not inherit the canvas's antialiasing, and RIG is ~30 px
  // at the frozen view, so buying it back matters. 2 rather than 4 because the
  // cost was MEASURED at a retina drawing buffer under the 256-projectile
  // load: +0.7 ms at 0 samples, +1.4 ms at 2, +2.0…4.3 ms at 4. The player's
  // machine is not this one.
  samples: 2,
  emissiveGain: 1.45,                    // flashes/sparks/tell lamps/hit pops
};
/* ==== end T-048 post pass ==== */

/* ==== T-051 backdrop layers (decisions.md entries 16/17) ================
 * Five generated plates (assets/generated/backdrops/) on a small number of
 * static quads along the six-face route — the counterpart, in TEXTURE, to
 * CONFIG.limb.backdrop's BOX tiers (T-045): those are procedural mass, these
 * are art, and the two are independent systems in independent files
 * (src/render/backdrop.js + src/render/backdrop-table.js only —
 * src/render/limb.js, T-052's lane this cycle, is untouched).
 *
 * WHY THIS READS AS "PARALLAX" WITH NO PER-FRAME CODE. Every quad below is
 * placed ONCE, at a fixed (s, y, depth) on the same polyline camera.js
 * already drives the camera along (src/pure/path.js's SEGS) — baked and
 * never touched again, the same discipline limb.js's own header states ("no
 * per-frame hook, no ritual hook, and no build hook"). The apparent sliding-
 * at-different-rates as the camera scrolls and yaws through a corner IS what
 * "parallax is the camera moving" means: a nearer static plate sweeps the
 * frame faster than a farther one purely from projection, with zero
 * simulated motion of its own. Static anatomy (entry 3) end to end.
 *
 * THE TWO FENCES (arithmetic in src/render/backdrop-table.js, re-derived
 * independently — not inherited — in tools/pathcheck/t-051-backdrop.mjs):
 *
 * 1. PLAY-BAND CLEARANCE. A plate must render, on screen, entirely above
 *    CONFIG.limb.playBand.y1 (the one shared "nothing outward of the play
 *    plane may occlude gameplay" fence CONFIG.limb.backdrop's own tiers
 *    answer to) at every view scale. `?view=near` is the binding case —
 *      yMin(mult) = camera.y + ((playBand.y1-camera.y)/(camera.z*mult)) *
 *                   (camera.z*mult + |depth|)
 *    is LARGEST at mult=1 and only falls as mult grows (same derivation
 *    CONFIG.limb.backdrop's own header comment uses for its three tiers).
 *    Authored floors below clear that near-view minimum by 0.65-0.8 tiles.
 * 2. FRAME COVERAGE, sized at the shipped FAR default only (near/mid are
 *    comparison views, not a safety fence): a tier's height subtends
 *    `frameFraction` of the vertical FOV at its own view-space distance
 *    (dist = camera.z*viewScales.far.depthMult + |depth|), so a plate reads
 *    as filling real screen area instead of sitting on it as a sticker.
 *    Width follows the PNG's own aspect ratio (canvas[0]/canvas[1]) — never
 *    stretched.
 *
 * Depths sit close to, but distinct from, CONFIG.limb.backdrop's own three
 * tiers (-14/-19/-24) so the two systems' geometry does not coincide
 * exactly; both grade the same direction (near warm/large -> far cool/flat),
 * the atmospheric-perspective lever entry 17 asks for ("distance separates
 * into layers instead of collapsing"). */
export const BACKDROP_TUNE = {
  root: '../../assets/generated/backdrops/',
  // near -> far. depth/yBottom/frameFraction are authored; everything else
  // (world w/h, world center y, view-space distance) is DERIVED in
  // src/render/backdrop-table.js — nothing here duplicates a computed number.
  tiers: {
    near: { depth: -13, yBottom: 17.0, frameFraction: 0.28, tint: 'backdropNear' },
    mid:  { depth: -18, yBottom: 18.4, frameFraction: 0.22, tint: 'backdropMid' },
    far:  { depth: -23, yBottom: 19.9, frameFraction: 0.16, tint: 'backdropFar' },
  },
  // `canvas` is MEASURED off the file (tools/assets/lib/png.mjs), not typed —
  // pathcheck re-measures it, so a regenerated plate whose canvas moved fails
  // the gate instead of silently mis-scaling (T-053 owns the assets; report a
  // genuine size change rather than editing this table around it).
  plates: {
    limbSegment:   { file: 'backdrop-limb-segment.png',   canvas: [1024, 512] },
    spineCoil:     { file: 'backdrop-spine-coil.png',     canvas: [512, 512] },
    gillCavity:    { file: 'backdrop-gill-cavity.png',    canvas: [512, 512] },
    colonyCluster: { file: 'backdrop-colony-cluster.png', canvas: [512, 256] },
    crownHorizon:  { file: 'backdrop-crown-horizon.png',  canvas: [1024, 256] },
  },
  // Two per facet (a near piece + a farther one) at the facet's own
  // midpoint s (CONFIG.path.introTiles + faceTiles*(face-1) + faceTiles/2 —
  // 32.5 tiles clear of either of its bends, well outside any wave-gate halt)
  // — 12 quads for the whole run, cycling the five plates so no facet
  // repeats its own pairing.
  placements: [
    { face: 1, plate: 'limbSegment',   tier: 'near' },
    { face: 1, plate: 'crownHorizon',  tier: 'far'  },
    { face: 2, plate: 'spineCoil',     tier: 'mid'  },
    { face: 2, plate: 'colonyCluster', tier: 'far'  },
    { face: 3, plate: 'limbSegment',   tier: 'near' },
    { face: 3, plate: 'gillCavity',    tier: 'mid'  },
    { face: 4, plate: 'spineCoil',     tier: 'mid'  },
    { face: 4, plate: 'crownHorizon',  tier: 'far'  },
    { face: 5, plate: 'limbSegment',   tier: 'near' },
    { face: 5, plate: 'colonyCluster', tier: 'far'  },
    { face: 6, plate: 'gillCavity',    tier: 'mid'  },
    { face: 6, plate: 'crownHorizon',  tier: 'far'  },
  ],
};
/* ==== end T-051 backdrop layers ==== */
