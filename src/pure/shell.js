/* =========================== SHELL (pure) ========================= *
 * The game shell's deterministic half (T-013): the start-screen
 * composition data, the run-stats row builder, and the key-intent table
 * the composition root consults before it touches gameplay input.
 *
 * Why any of this is pure rather than DOM code in src/ui/shell.js:
 *   1. the start screen is a COMPOSITION STUDY of concept board 05 and
 *      has to obey the same invariants the game does — RIG at 3–5% of
 *      screen height (decisions.md entry 7 / board 13) and DESIGN's ≤8
 *      colour roles — so those invariants can be asserted headlessly
 *      instead of eyeballed (tools/pathcheck.mjs);
 *   2. the key-intent table is the harness-safety contract. The shell
 *      must never SWALLOW a gameplay key, or every committed bot script
 *      and the browser self-test would break. Expressing it as a pure
 *      (code, state) → intent function lets pathcheck prove that
 *      property against src/main.js's own KEYMAP, for every state.
 *
 * No image assets anywhere: every element below is a flat-shaded box,
 * gradient or clip-path silhouette, per the task's "flat-shaded / CSS /
 * three.js-native, no image assets" constraint. Geometry is expressed in
 * percent of the frame so the composition survives any aspect ratio.  */

/* DESIGN's palette, ≤8 roles (docs/DESIGN.md §Concept): deep teal
   environment, rust-orange metal, acid-green enemy glow, hot magenta
   pickups, warm white muzzle light. The start screen is UI, so it owns
   its own copy of the role table rather than importing the render
   layer's; when the palette lane (T-010) lands `src/render/palette.js`,
   these five roles plus the two environment values should repoint at its
   CONCEPT tokens instead of being restated here. */
export const SHELL_ROLES = {
  void: '#07131a',        // deepest background — the fog's far end
  fog: '#12303a',         // deep teal environment
  teal: '#1d5c68',        // lit teal (sky, atmospheric bounce)
  metal: '#7a4020',       // rust-orange metal
  metalLo: '#2b1a11',     // the same metal in shadow
  acid: '#9ce23e',        // acid-green enemy/ship glow
  magenta: '#ff4fd8',     // hot magenta (pickups, Crown transmitter)
  warm: '#ffe9c2',        // warm-white muzzle light
};

/* Concept board 13's scale invariant, restated for the start screen: the
   figure is a human-scale marine on a continent-sized machine, so it may
   never grow into a hero-shot silhouette. Percent of frame height. */
export const RIG_SCREEN_FRACTION = { min: 3, max: 5 };

/* Element vocabulary. Each entry is `{ t, x, y, w, h, rot, tone, o }` in
   percent of the frame, `rot` in degrees, `tone` a role name above and
   `o` an opacity. src/ui/shell.js maps `t` onto one CSS class; nothing
   here knows what a stylesheet is.
     sky   flat atmospheric wash          mass  machinery block
     slab  a moving hull plate            glow  soft light pool
     lamp  a point light                  beam  the Crown's transmitter
     rig   the marine (scale-invariant)   steam vent plume
     bridge  catwalk / gantry             debris  thrown hull chunk
     haze  depth band between layers      vignette  frame falloff
   Draw order is array order, so a later element is nearer the camera —
   that is how the plate tucks back into the body it hinged out of.

   `attach: true` hangs an element off the PREVIOUS one instead of the
   frame: its x/y are percentages of that parent's box and it RIDES the
   parent's transform (a child of a rotated box is already rotated with
   it). Its own `rot` is therefore its angle RELATIVE to that surface —
   absent means "lies flat on it". RIG uses attachment to stand on a
   surface (the tilted plate, a gantry) at any aspect ratio, which a
   frame-relative position cannot do once the surface is rotated. A `rig`
   sizes itself against frame HEIGHT in both axes, so the silhouette
   never stretches. */
const TYPES = ['sky', 'mass', 'slab', 'glow', 'lamp', 'beam', 'rig', 'steam', 'bridge',
  'debris', 'haze', 'vignette'];
export const SHELL_ELEMENT_TYPES = TYPES;

/* Board 05, left panel — "The Impossible Climb": human scale, altitude and
   the settlement below. A single unbroken hull wall running off the top of
   the frame, RIG on a gantry at its foot, the Crown's beacon far above. */
const CLIMB = [
  { t: 'sky', x: 0, y: 0, w: 100, h: 100, tone: 'fog', o: 1 },
  { t: 'glow', x: -18, y: -6, w: 76, h: 62, tone: 'teal', o: 0.55 },
  // the Crown's beacon, impossibly far above
  { t: 'glow', x: 4, y: -4, w: 16, h: 14, tone: 'magenta', o: 0.4 },
  { t: 'beam', x: 11.6, y: -2, w: 0.4, h: 10, tone: 'magenta', o: 0.75 },
  // the settlement at the bottom of the world, lost in fog
  { t: 'mass', x: -2, y: 76, w: 10, h: 28, tone: 'void', o: 0.55 },
  { t: 'mass', x: 9, y: 82, w: 7, h: 22, tone: 'void', o: 0.42 },
  { t: 'mass', x: 17, y: 88, w: 6, h: 16, tone: 'void', o: 0.3 },
  { t: 'lamp', x: 4, y: 80, w: 0.3, h: 0.5, tone: 'warm', o: 0.85 },
  { t: 'lamp', x: 12, y: 86, w: 0.28, h: 0.45, tone: 'acid', o: 0.7 },
  { t: 'lamp', x: 19, y: 90, w: 0.26, h: 0.42, tone: 'warm', o: 0.6 },
  { t: 'haze', x: -5, y: 62, w: 110, h: 26, tone: 'fog', o: 0.75 },
  // the hull wall: one unbroken face running off the top of the frame
  { t: 'mass', x: 45, y: -16, w: 68, h: 132, tone: 'metalLo', rot: 1, o: 0.97 },
  { t: 'mass', x: 49, y: -12, w: 15, h: 118, tone: 'metal', o: 0.5 },
  { t: 'mass', x: 68, y: -8, w: 11, h: 112, tone: 'metal', o: 0.3 },
  { t: 'mass', x: 80, y: -6, w: 8, h: 104, tone: 'metal', o: 0.16 },
  { t: 'mass', x: 88, y: -10, w: 20, h: 120, tone: 'void', o: 0.55 },
  { t: 'mass', x: 44.6, y: -14, w: 0.7, h: 128, tone: 'metal', o: 0.95 },
  // catwalks bolted to the face: the only scale reference on a wall this big
  { t: 'bridge', x: 47, y: 22, w: 13, h: 0.7, tone: 'metal', o: 0.8 },
  { t: 'bridge', x: 58, y: 47, w: 16, h: 0.7, tone: 'metal', o: 0.7 },
  { t: 'mass', x: 52, y: 22, w: 0.5, h: 25, tone: 'metal', o: 0.55 },
  { t: 'lamp', x: 57, y: 30, w: 0.4, h: 0.7, tone: 'warm' },
  { t: 'lamp', x: 72, y: 51, w: 0.4, h: 0.7, tone: 'warm' },
  { t: 'lamp', x: 63, y: 67, w: 0.45, h: 0.8, tone: 'acid' },
  { t: 'steam', x: 50, y: 44, w: 13, h: 22, o: 0.5 },
  // cloud layers crossing the face — altitude you can count
  { t: 'haze', x: -5, y: 8, w: 110, h: 16, tone: 'teal', o: 0.3 },
  { t: 'haze', x: -5, y: 34, w: 110, h: 20, tone: 'teal', o: 0.22 },
  // the gantry RIG is standing on, and the drop under it
  { t: 'bridge', x: 27, y: 84, w: 30, h: 1.3, tone: 'metal' },
  { t: 'rig', attach: true, x: 34, y: -290, w: 2.5, h: 3.9, tone: 'warm' },
  { t: 'mass', x: 33, y: 85, w: 1.2, h: 18, tone: 'void', o: 0.7 },
  { t: 'mass', x: 50, y: 85, w: 1.2, h: 18, tone: 'void', o: 0.7 },
  { t: 'haze', x: -5, y: 86, w: 110, h: 22, tone: 'fog', o: 0.6 },
  { t: 'vignette', x: -5, y: -5, w: 110, h: 112, tone: 'void', o: 0.9 },
];

/* Board 05, middle panel — "The Ship Wakes": the canon default. A colossal
   rust-orange hull plate hinged out of the body across the whole frame, the
   machine's acid-lit interior exposed beneath it, magenta service lamps in
   the mass behind, and RIG running the plate at human scale. This is the
   one composition that shows the game's signature promise (architecture
   that moves) rather than only its setting. */
const WAKE = [
  { t: 'sky', x: 0, y: 0, w: 100, h: 100, tone: 'fog', o: 1 },
  { t: 'glow', x: -20, y: -4, w: 70, h: 70, tone: 'teal', o: 0.5 },
  // distant body, far side of the fog
  { t: 'mass', x: -6, y: 54, w: 20, h: 52, tone: 'void', o: 0.45 },
  { t: 'mass', x: 12, y: 66, w: 11, h: 40, tone: 'void', o: 0.38 },
  { t: 'mass', x: 21, y: 74, w: 14, h: 32, tone: 'void', o: 0.3 },
  { t: 'haze', x: -5, y: 46, w: 110, h: 34, tone: 'fog', o: 0.7 },
  // THE BODY: a wall of machinery filling the right two thirds
  { t: 'mass', x: 46, y: -10, w: 68, h: 122, tone: 'metalLo', o: 0.97 },
  { t: 'mass', x: 50, y: -6, w: 18, h: 82, tone: 'metal', o: 0.36 },
  { t: 'mass', x: 71, y: 4, w: 13, h: 98, tone: 'metal', o: 0.24 },
  { t: 'mass', x: 45.4, y: -8, w: 0.8, h: 118, tone: 'metal', o: 0.7 },
  // the exposed interior it opened: acid-green, the brightest thing below
  { t: 'glow', x: 44, y: 58, w: 44, h: 46, tone: 'acid', o: 0.3 },
  { t: 'mass', x: 52, y: 68, w: 3.5, h: 28, tone: 'acid', o: 0.22 },
  { t: 'mass', x: 62, y: 74, w: 2.6, h: 24, tone: 'acid', o: 0.18 },
  { t: 'mass', x: 46, y: 84, w: 52, h: 22, tone: 'void', o: 0.85 },
  // THE PLATE — hinged out of the body, crossing the frame corner to corner.
  // Static-anatomy rule (decisions.md entry 3): it is already open when we
  // arrive. Nothing on this screen assembles itself.
  { t: 'slab', x: -8, y: 24, w: 100, h: 11, rot: 37, tone: 'metal' },
  // RIG running the plate, firing — attached, so it stays on the surface at
  // any aspect; 3.8% of frame height, board 13's human-scale rule
  { t: 'rig', attach: true, x: 34, y: -37, w: 2.5, h: 3.8, tone: 'warm' },
  // the near lip of the body: the plate's far end tucks behind it
  { t: 'mass', x: 80, y: -8, w: 30, h: 118, tone: 'metalLo', o: 0.98 },
  { t: 'steam', x: 64, y: 26, w: 18, h: 30, o: 0.75 },
  { t: 'steam', x: 44, y: 60, w: 16, h: 26, o: 0.55 },
  // lamps last: surface lights read on top of the mass they belong to
  { t: 'lamp', x: 59, y: 72, w: 0.5, h: 0.9, tone: 'acid' },
  { t: 'lamp', x: 68, y: 86, w: 0.5, h: 0.9, tone: 'acid' },
  { t: 'lamp', x: 76, y: 20, w: 0.55, h: 1, tone: 'magenta' },
  { t: 'lamp', x: 63, y: 44, w: 0.45, h: 0.8, tone: 'magenta' },
  { t: 'lamp', x: 88, y: 58, w: 0.5, h: 0.9, tone: 'magenta' },
  { t: 'haze', x: -5, y: 84, w: 110, h: 24, tone: 'fog', o: 0.5 },
  { t: 'vignette', x: -5, y: -5, w: 110, h: 112, tone: 'void', o: 0.95 },
];

/* Board 05, right panel — "Scuttle the Crown": the summit spectacle. The
   Crown complex lit from within, its transmitter firing straight up,
   hull chunks thrown clear, RIG on the approach gantry underneath. */
const CROWN = [
  { t: 'sky', x: 0, y: 0, w: 100, h: 100, tone: 'fog', o: 1 },
  { t: 'glow', x: 20, y: -26, w: 62, h: 70, tone: 'magenta', o: 0.38 },
  { t: 'beam', x: 49.6, y: -8, w: 0.9, h: 30, tone: 'magenta' },
  // the Crown: a command complex, lit from inside, not a creature head
  { t: 'mass', x: 33, y: 18, w: 34, h: 40, tone: 'metalLo', o: 0.98 },
  { t: 'mass', x: 36, y: 14, w: 6, h: 10, tone: 'metalLo', o: 0.9 },
  { t: 'mass', x: 46, y: 11, w: 8, h: 12, tone: 'metalLo', o: 0.9 },
  { t: 'mass', x: 58, y: 14, w: 6, h: 10, tone: 'metalLo', o: 0.9 },
  { t: 'mass', x: 25, y: 30, w: 10, h: 28, tone: 'metalLo', o: 0.85 },
  { t: 'mass', x: 65, y: 30, w: 10, h: 28, tone: 'metalLo', o: 0.85 },
  { t: 'mass', x: 37, y: 22, w: 5, h: 32, tone: 'metal', o: 0.3 },
  { t: 'mass', x: 55, y: 22, w: 5, h: 32, tone: 'metal', o: 0.22 },
  { t: 'glow', x: 38, y: 26, w: 24, h: 22, tone: 'magenta', o: 0.3 },
  { t: 'lamp', x: 43, y: 30, w: 0.5, h: 0.9, tone: 'acid' },
  { t: 'lamp', x: 56, y: 34, w: 0.5, h: 0.9, tone: 'acid' },
  { t: 'lamp', x: 49, y: 44, w: 0.55, h: 1, tone: 'magenta' },
  { t: 'lamp', x: 29, y: 40, w: 0.4, h: 0.7, tone: 'warm' },
  // hull thrown clear of the summit
  { t: 'debris', x: 18, y: 8, w: 5, h: 2.6, rot: -18, tone: 'metalLo' },
  { t: 'debris', x: 76, y: 12, w: 6, h: 3, rot: 24, tone: 'metalLo' },
  { t: 'debris', x: 84, y: 30, w: 4, h: 2.2, rot: -9, tone: 'metalLo' },
  { t: 'debris', x: 10, y: 26, w: 4.5, h: 2.4, rot: 33, tone: 'metalLo' },
  { t: 'debris', x: 27, y: 4, w: 3, h: 1.8, rot: 12, tone: 'metalLo', o: 0.8 },
  { t: 'haze', x: -5, y: 44, w: 110, h: 26, tone: 'fog', o: 0.65 },
  // the approach gantry, and the drop under it
  { t: 'bridge', x: 4, y: 60, w: 92, h: 1.6, tone: 'metal' },
  { t: 'rig', attach: true, x: 44, y: -240, w: 2.5, h: 3.8, tone: 'warm' },
  { t: 'mass', x: 20, y: 61, w: 1.6, h: 24, tone: 'void', o: 0.75 },
  { t: 'mass', x: 68, y: 61, w: 1.6, h: 24, tone: 'void', o: 0.75 },
  { t: 'haze', x: -5, y: 68, w: 110, h: 40, tone: 'fog', o: 0.55 },
  { t: 'vignette', x: -5, y: -5, w: 110, h: 112, tone: 'void', o: 0.95 },
];

/* The three directions, left to right exactly as board 05 presents them.
   `canon: false` on all three — the operator has not judged which brand
   promise the game leads with; the middle one is the shipped DEFAULT
   because it is the most game-specific (concept-art README), not because
   it won anything. `titleBox` is the deliberate title/menu space each
   composition leaves. */
export const START_DIRECTIONS = [
  {
    id: 'climb', n: 1, panel: 'left', label: 'THE IMPOSSIBLE CLIMB',
    promise: 'human scale, altitude, and the settlement below',
    tagline: 'ONE MARINE. ONE CONTINENT-SIZED BODY. CLIMB IT.',
    titleBox: { x: 4, y: 30, w: 40, align: 'left' },
    elements: CLIMB,
  },
  {
    id: 'wake', n: 2, panel: 'middle', label: 'THE SHIP WAKES',
    promise: 'transforming architecture as the signature hook',
    tagline: 'THE MERIDIAN IS AWAKE. THE WORLD TURNS UNDER YOU.',
    titleBox: { x: 4, y: 62, w: 44, align: 'left' },
    elements: WAKE,
  },
  {
    id: 'crown', n: 3, panel: 'right', label: 'SCUTTLE THE CROWN',
    promise: 'the maximal summit spectacle',
    tagline: 'CLIMB THE BEAST. SCUTTLE THE CROWN. SEND THE SIGNAL.',
    titleBox: { x: 28, y: 66, w: 44, align: 'center' },
    elements: CROWN,
  },
];

export const DEFAULT_START_DIRECTION = 'wake';

export const START_DIRECTION_IDS = START_DIRECTIONS.map((d) => d.id);

/* ?title=climb|wake|crown, or 1|2|3 (the panels' left-to-right order).
   Anything unrecognised — including no flag — is the canon default. */
export function resolveStartDirection(raw) {
  if (raw == null) return DEFAULT_START_DIRECTION;
  const key = String(raw).trim().toLowerCase();
  for (const d of START_DIRECTIONS)
    if (key === d.id || key === String(d.n) || key === d.panel) return d.id;
  return DEFAULT_START_DIRECTION;
}

export function startDirection(id) {
  for (const d of START_DIRECTIONS) if (d.id === id) return d;
  for (const d of START_DIRECTIONS) if (d.id === DEFAULT_START_DIRECTION) return d;
  return START_DIRECTIONS[0];
}

export function startDirectionAt(index) {
  const n = START_DIRECTIONS.length;
  return START_DIRECTIONS[((index % n) + n) % n];
}

/* Every custom property the stylesheet reads, resolved for ONE element —
   defaults included, nothing left out.

   This is not cosmetic tidiness: CSS custom properties INHERIT, so an
   element that leaves one unset silently picks up its parent's value.
   For an `attach: true` child that is a rendering bug, because the child
   is already inside the parent's transform: an unset `--rot` re-applies
   the parent's rotation ON TOP of it (RIG on the 37° plate rendered at
   74°, lying across the plate instead of running along it), an unset
   `--o` multiplies into the parent's opacity, and an unset `--c` paints
   the child in the parent's tone. src/ui/shell.js writes the whole set
   on every element, so no value can leak down the tree, and the defaults
   are pinned here where pathcheck can assert them.

   Values are CSS strings; `w`/`h` carry their unit (a `rig` measures
   itself against frame HEIGHT in both axes so the silhouette keeps its
   proportions — and its 3–5% scale — on any aspect ratio). */
export function elementVars(e) {
  const unit = e.t === 'rig' ? 'vh' : '%';
  return {
    '--x': e.x + '%',
    '--y': e.y + '%',
    '--w': e.w + unit,
    '--h': e.h + unit,
    '--rot': (e.rot || 0) + 'deg',
    '--o': String(e.o === undefined ? 1 : e.o),
    // untoned elements (steam) paint from their own rgba literals and must
    // not fall back to whatever tone a parent happens to carry
    '--c': e.tone && SHELL_ROLES[e.tone] ? SHELL_ROLES[e.tone] : 'transparent',
  };
}

export const SHELL_ELEMENT_VARS = ['--x', '--y', '--w', '--h', '--rot', '--o', '--c'];

/* Headless conformance check for one composition. Returns a list of human
   readable violations (empty = clean) so pathcheck can assert the board-05
   studies obey the same invariants the game does. */
export function compositionViolations(dir) {
  const out = [];
  if (!dir || !Array.isArray(dir.elements) || dir.elements.length === 0)
    return ['direction has no elements'];
  let rigs = 0;
  for (let i = 0; i < dir.elements.length; i++) {
    const e = dir.elements[i];
    const at = dir.id + '/' + e.t;
    if (!TYPES.includes(e.t)) out.push(at + ': unknown element type');
    if (e.tone !== undefined && !(e.tone in SHELL_ROLES))
      out.push(at + ': tone "' + e.tone + '" is not one of the declared roles');
    for (const k of ['x', 'y', 'w', 'h'])
      if (!Number.isFinite(e[k])) out.push(at + ': ' + k + ' is not a number');
    if (e.w <= 0 || e.h <= 0) out.push(at + ': zero or negative extent');
    if (e.attach && i === 0) out.push(at + ': attached element has nothing to hang from');
    // an element may bleed off frame (that is how a colossus reads), but it
    // must overlap the frame at all — a fully off-screen box is dead weight.
    // Attached elements are positioned against their parent, not the frame.
    if (!e.attach && (e.x >= 100 || e.y >= 100 || e.x + e.w <= 0 || e.y + e.h <= 0))
      out.push(at + ': lies entirely outside the frame');
    if (e.o !== undefined && !(e.o > 0 && e.o <= 1)) out.push(at + ': opacity out of (0,1]');
    if (e.t === 'rig') {
      rigs++;
      if (e.h < RIG_SCREEN_FRACTION.min || e.h > RIG_SCREEN_FRACTION.max)
        out.push(at + ': RIG is ' + e.h + '% of frame height, outside the ' +
          RIG_SCREEN_FRACTION.min + '–' + RIG_SCREEN_FRACTION.max + '% concept-art range');
    }
  }
  if (rigs !== 1) out.push(dir.id + ': needs exactly one RIG figure, found ' + rigs);
  const tb = dir.titleBox;
  if (!tb || !(tb.x >= 0 && tb.y >= 0 && tb.x + tb.w <= 100 && tb.y <= 100))
    out.push(dir.id + ': title box is off frame');
  return out;
}

/* ------------------------- key intents ---------------------------- *
 * THE HARNESS CONTRACT. The shell owns keys only in the states where the
 * simulation is not running, and even there it consumes only keys that
 * are not part of the game's KEYMAP. In MENU every other key returns
 * 'start', which src/main.js acts on WITHOUT consuming the event — the
 * same press that leaves the title also plays the game, so a bot script
 * (or a player) never loses its first input. pathcheck asserts both
 * halves against main.js's own KEYMAP.                                */

// Keys that must never mean "start the run": the pause pair (they have a
// meaning of their own), and anything that is a bare modifier, a browser
// key, or a key a window manager may deliver on focus. Shift is NOT here —
// it is a gameplay key (strafe-lock), and pressing it at the title should
// behave like every other gameplay key.
const NEVER_STARTS = new Set([
  'Escape', 'KeyP', 'Tab', 'CapsLock', 'ContextMenu', 'PrintScreen',
  'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight',
  'NumLock', 'ScrollLock', 'Pause', 'Insert',
]);

const PICK_CODES = {
  Digit1: 'pick:0', Numpad1: 'pick:0',
  Digit2: 'pick:1', Numpad2: 'pick:1',
  Digit3: 'pick:2', Numpad3: 'pick:2',
};

// every intent src/main.js consumes the keystroke for (the rest fall
// through to the ordinary gameplay path)
export const SHELL_CONSUMING_INTENTS = [
  'pick:0', 'pick:1', 'pick:2', 'hud', 'restart', 'title',
];

export function shellKeyIntent(code, state) {
  if (typeof code !== 'string') return null;
  if (state === 'MENU') {
    if (PICK_CODES[code]) return PICK_CODES[code];
    if (code === 'KeyH') return 'hud';
    if (NEVER_STARTS.has(code) || /^F\d{1,2}$/.test(code)) return null;
    return 'start';
  }
  if (state === 'PAUSED') {
    if (code === 'KeyR') return 'restart';
    if (code === 'KeyQ') return 'title';
    if (code === 'KeyH') return 'hud';
    return null;
  }
  // the run is over: R already restarts through src/main.js's own branch,
  // so the shell only adds the way back to the title screen
  if (state === 'GAME_OVER' || state === 'VICTORY') {
    if (code === 'KeyQ') return 'title';
    return null;
  }
  return null;
}

/* --------------------------- run stats ---------------------------- *
 * Formatting only: every number below is read from state the game
 * already keeps (src/sim/time.js's sliceStats, the weapon/kill counters,
 * the score prototype's snapshot). The shell adds no simulation state. */

export function formatClock(ms) {
  const t = Math.max(0, Math.round(Number.isFinite(ms) ? ms : 0));
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const d = Math.floor((t % 1000) / 100);
  return m + ':' + String(s).padStart(2, '0') + '.' + d;
}

export function formatSeconds(ms) {
  return (Math.max(0, Number.isFinite(ms) ? ms : 0) / 1000).toFixed(1) + 's';
}

// kills per 100 shots, the only derived combat number that is honest with
// the counters the game keeps (there is no per-shot hit record).
export function killsPerHundredShots(kills, shots) {
  if (!(shots > 0)) return null;
  return Math.round((kills / shots) * 1000) / 10;
}

/* rows for the end-of-run stats screen. `mode` is 'six-face' | 'traversal'
   | 'transform'; every field is optional and simply omits its row when it
   is not meaningful for that mode. Returns [{ label, value }]. */
export function runStatRows(s) {
  const rows = [];
  const push = (label, value) => { if (value !== null && value !== undefined) rows.push({ label, value }); };
  push('TIME', formatClock(s.elapsedMs));
  if (s.mode === 'transform') {
    push('ALTITUDE', Math.round(s.altitudeTiles || 0) + 'm');
    push('TURNS', (s.bands || 0) + ' / 2');
  } else if (s.mode === 'traversal') {
    push('ATTEMPT', String(s.attempts || 1));
  } else {
    push('DISTANCE', Math.floor(s.distanceM || 0) + 'm');
  }
  push('KILLS', String(s.kills || 0));
  push('SHOTS', String(s.shots || 0));
  const per = killsPerHundredShots(s.kills || 0, s.shots || 0);
  push('KILLS / 100 SHOTS', per === null ? null : per.toFixed(1));
  if (s.bestWeapon && s.bestWeapon.kills > 0)
    push('FAVOURITE WEAPON', s.bestWeapon.name + ' (' + s.bestWeapon.kills + ')');
  if (s.mode === 'six-face') push('DEATHS', String(s.deaths || 0));
  push('FALLS', String(s.falls || 0));
  if (s.setbacks) push('HULL FALLBACKS', String(s.setbacks));
  push('AIR JUMPS', String(s.airJumps || 0));
  if (Number.isFinite(s.minEdgeMargin))
    push('CLOSEST EDGE', Math.max(0, s.minEdgeMargin).toFixed(1) + ' tiles');
  const sc = s.score;
  if (sc && sc.enabled) {
    push('THREAT', sc.threat + (sc.classification ? ' · ' + sc.classification : ''));
    push('CHARGE', sc.notchName || String(sc.notch));
    push('HOT', formatSeconds(sc.hotMs) + ' of ' + formatSeconds(sc.playMs));
  }
  return rows;
}
