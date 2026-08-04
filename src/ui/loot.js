/* ====================== ROLLED WEAPON REVEAL ====================== */
/* One rare DOM write at the exact pickup edge turns an invisible recipe into
   a readable reward: rolled name, chassis, complete trait stack, and the
   important compiled deltas. It never pauses or captures input. The sim hands
   the immutable recipe outward through view.loot; this module writes nothing
   back and owns no gameplay clock.                                           */

import { CONFIG } from '../config.js';
import { GUN_CHASSIS_NAMES, GUN_TRAITS } from '../pure/gunroll.js';
import { capsuleAtlasWeaponCell } from '../render/capsules.js';
import { installView } from '../sim/bridge.js';

const TIER_WORD = ['', 'TUNED', 'EXOTIC', 'RELIC'];
const ROMAN = ['', 'I', 'II', 'III'];
const TRAIT_NAME = Object.freeze({
  RAPID: 'OVERCLOCK',
  HEAVY: 'GRAVEMAKER',
  FORKED: 'HYDRA',
  SEEKER: 'BLOODHOUND',
  PHASE: 'WRAITH',
  VOLATILE: 'STARFIRE',
});
const CHASSIS_NOUN = Object.freeze({
  R: 'RIVET', S: 'BLOOM', L: 'SPEAR', H: 'ENGINE', F: 'MAW',
});
// The live pickup renderer and this one-shot reward card share one decoded
// browser image. The renderer exports source coordinates, never a second URL.

const style = document.createElement('style');
style.textContent = `
#lootReveal {
  --loot-accent: #ff55dc;
  --loot-hot: #fff0cf;
  position: fixed;
  z-index: 34;
  top: clamp(82px, 15vh, 132px);
  left: max(12px, env(safe-area-inset-left));
  width: min(456px, calc(100vw - 24px));
  box-sizing: border-box;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 142px;
  gap: 0 10px;
  min-height: 154px;
  padding: 13px 13px 13px 19px;
  overflow: hidden;
  color: #f7ead6;
  background:
    linear-gradient(115deg, transparent 0 56%, color-mix(in srgb, var(--loot-accent) 9%, transparent) 56% 58%, transparent 58%),
    repeating-linear-gradient(136deg, transparent 0 16px, rgba(255,255,255,.014) 16px 17px),
    linear-gradient(100deg, rgba(10,24,27,.98) 0%, rgba(13,29,31,.94) 72%, rgba(16,38,40,.86) 100%);
  border: 1px solid color-mix(in srgb, var(--loot-accent) 70%, white 30%);
  border-left: 5px solid var(--loot-accent);
  box-shadow: 0 12px 38px rgba(0,0,0,.42), inset 0 0 28px rgba(255,79,216,.055);
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  text-transform: uppercase;
  pointer-events: none;
  opacity: 0;
  transform: translate3d(-112%,0,0) skewX(-2deg);
  contain: layout paint style;
}
#lootReveal::after {
  content: "";
  position: absolute;
  left: 0; right: 0; top: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--loot-accent), var(--loot-hot), transparent 88%);
  opacity: .88;
}
#lootReveal::before {
  content: "";
  position: absolute;
  z-index: 0;
  right: 9px; bottom: 9px;
  width: 118px; height: 68px;
  background:
    linear-gradient(var(--loot-accent), var(--loot-accent)) right top / 43px 1px no-repeat,
    linear-gradient(var(--loot-accent), var(--loot-accent)) right top / 1px 23px no-repeat,
    linear-gradient(var(--loot-accent), var(--loot-accent)) left bottom / 31px 1px no-repeat,
    linear-gradient(var(--loot-accent), var(--loot-accent)) left bottom / 1px 17px no-repeat,
    repeating-linear-gradient(135deg, transparent 0 14px,
      color-mix(in srgb, var(--loot-accent) 22%, transparent) 14px 15px,
      transparent 15px 27px);
  opacity: .46;
}
#lootReveal.is-live { animation: loot-reveal 3.25s cubic-bezier(.18,.78,.2,1) both; }
#lootReveal.tier-1 { --loot-accent: #ff55dc; }
#lootReveal.tier-2 { --loot-accent: #ff9d45; --loot-hot: #fff0ce; }
#lootReveal.tier-3 {
  --loot-accent: #ffd77a;
  --loot-hot: #fffaf0;
  border-width: 1px 2px 1px 6px;
  background:
    linear-gradient(105deg, rgba(19,24,24,.98), rgba(55,30,43,.92) 64%, rgba(88,52,27,.76));
  box-shadow: 0 14px 52px rgba(0,0,0,.52), 0 0 26px rgba(255,196,82,.22),
              inset 0 0 34px rgba(255,79,216,.11);
}
#lootReveal.tier-3.is-live { animation-duration: 3.85s; }
/* State screens are a different composition, not another combat layer.  A
   pickup immediately before pause/death/victory must never sit over the modal
   copy, and returning to the title must never inherit a stale reward card. */
body.at-title #lootReveal,
body.at-victory #lootReveal,
#overlay[data-state="paused"] ~ #lootReveal,
#overlay[data-state="game_over"] ~ #lootReveal { visibility: hidden; }
/* The objective occupies the same upper visual lane.  If a recovered gun
   arrives during the finale, compose beneath it instead of overprinting it. */
body:has(#finale.on) #lootReveal { top: 124px; }
.loot-copy { position: relative; z-index: 2; min-width: 0; align-self: center; }
.loot-kicker { color: var(--loot-accent); font-size: 10px; font-weight: 850; letter-spacing: .16em; }
.loot-name {
  margin-top: 3px;
  color: var(--loot-hot);
  font-size: clamp(21px, 2.55vw, 29px);
  line-height: 1.02;
  font-weight: 950;
  letter-spacing: .035em;
  text-shadow: 0 0 15px color-mix(in srgb, var(--loot-accent) 38%, transparent);
}
.loot-chassis { margin-top: 4px; color: rgba(225,226,214,.72); font-size: 10px; letter-spacing: .15em; }
.loot-traits, .loot-stats { display: flex; flex-wrap: wrap; gap: 5px; }
.loot-traits { margin-top: 10px; }
.loot-stats { margin-top: 7px; }
.loot-chip {
  padding: 3px 6px 3px 7px;
  color: #fff7e7;
  background: color-mix(in srgb, var(--loot-accent) 17%, rgba(8,20,23,.88));
  border: 1px solid color-mix(in srgb, var(--loot-accent) 58%, transparent);
  font-size: 10px;
  line-height: 1;
  font-weight: 800;
  letter-spacing: .09em;
}
.loot-stat { color: rgba(232,231,213,.82); font-size: 9px; line-height: 1.15; letter-spacing: .08em; }
.loot-stat.good { color: var(--loot-hot); }
.loot-stat.trade { color: #d69d7d; }
.loot-art {
  position: relative;
  z-index: 2;
  display: grid;
  place-items: center;
  align-self: stretch;
  min-width: 0;
  margin: -3px -2px -3px 0;
  border-left: 1px solid color-mix(in srgb, var(--loot-accent) 26%, transparent);
  background:
    radial-gradient(circle at 53% 48%, color-mix(in srgb, var(--loot-accent) 16%, transparent), transparent 58%),
    linear-gradient(90deg, rgba(7,19,26,.18), rgba(7,19,26,.48));
}
.loot-art::before,
.loot-art::after {
  content: "";
  position: absolute;
  left: 50%; top: 50%;
  pointer-events: none;
}
.loot-art::before {
  width: 112px; height: 82px;
  background:
    linear-gradient(var(--loot-accent), var(--loot-accent)) left top / 29px 2px no-repeat,
    linear-gradient(var(--loot-accent), var(--loot-accent)) left top / 2px 22px no-repeat,
    linear-gradient(var(--loot-accent), var(--loot-accent)) right top / 29px 2px no-repeat,
    linear-gradient(var(--loot-accent), var(--loot-accent)) right top / 2px 22px no-repeat,
    linear-gradient(var(--loot-accent), var(--loot-accent)) left bottom / 29px 2px no-repeat,
    linear-gradient(var(--loot-accent), var(--loot-accent)) left bottom / 2px 22px no-repeat,
    linear-gradient(var(--loot-accent), var(--loot-accent)) right bottom / 29px 2px no-repeat,
    linear-gradient(var(--loot-accent), var(--loot-accent)) right bottom / 2px 22px no-repeat;
  transform: translate(-50%, -50%);
  filter: drop-shadow(0 0 7px color-mix(in srgb, var(--loot-accent) 24%, transparent));
  opacity: .66;
}
.loot-art::after {
  width: 76px; height: 3px;
  top: calc(50% + 48px);
  transform: translate(-50%, -50%) skewX(-28deg);
  background: repeating-linear-gradient(90deg,
    transparent 0 7px, var(--loot-accent) 7px 19px, transparent 19px 28px);
  opacity: .50;
}
.loot-atlas-clip {
  position: relative;
  z-index: 2;
  display: block;
  width: 136px;
  max-width: 98%;
  aspect-ratio: 8 / 5;
  overflow: hidden;
  filter: drop-shadow(0 7px 8px rgba(0,0,0,.5))
          drop-shadow(0 0 10px color-mix(in srgb, var(--loot-accent) 24%, transparent));
  transform: rotate(-4deg);
}
.loot-atlas-clip canvas {
  display: block;
  width: 100%;
  height: 100%;
}
.loot-art.no-art .loot-atlas-clip { display: none; }
.loot-art-glyph {
  position: relative;
  z-index: 2;
  display: none;
  color: var(--loot-hot);
  font-size: 62px;
  line-height: 1;
  font-weight: 950;
  text-shadow: 0 0 18px color-mix(in srgb, var(--loot-accent) 44%, transparent);
}
.loot-art.no-art .loot-art-glyph { display: block; }
.loot-art-mark {
  position: absolute;
  z-index: 3;
  top: 2px; right: 4px;
  color: color-mix(in srgb, var(--loot-hot) 72%, transparent);
  font-size: 8px;
  font-weight: 900;
  letter-spacing: .14em;
}
.loot-art-pips {
  position: absolute;
  z-index: 3;
  right: 4px; bottom: 3px;
  display: flex;
  gap: 3px;
}
.loot-art-pips i {
  display: block;
  width: 14px; height: 3px;
  background: var(--loot-hot);
  box-shadow: 0 0 7px color-mix(in srgb, var(--loot-accent) 62%, transparent);
}
.loot-scan {
  position: absolute;
  z-index: 5;
  top: -38%; bottom: -38%;
  left: -22px;
  width: 12px;
  transform: rotate(13deg);
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.72), transparent);
  opacity: 0;
  pointer-events: none;
}
#lootReveal.is-live .loot-scan { animation: loot-scan 760ms 90ms ease-out both; }
#lootReveal.is-live .loot-atlas-clip { animation: loot-art-lock 520ms 130ms cubic-bezier(.18,.78,.2,1) both; }
@keyframes loot-reveal {
  0%   { opacity: 0; transform: translate3d(-112%,0,0) skewX(-2deg); filter: brightness(1.8); }
  7%   { opacity: 1; transform: translate3d(8px,0,0) skewX(-2deg); }
  12%  { transform: translate3d(0,0,0) skewX(-2deg); filter: brightness(1); }
  80%  { opacity: 1; transform: translate3d(0,0,0) skewX(-2deg); }
  100% { opacity: 0; transform: translate3d(0,-8px,0) skewX(-2deg) scale(.985); }
}
@keyframes loot-scan {
  0% { opacity: 0; transform: translateX(0) rotate(13deg); }
  22% { opacity: .7; }
  100% { opacity: 0; transform: translateX(500px) rotate(13deg); }
}
@keyframes loot-art-lock {
  from { opacity: 0; transform: translateX(18px) rotate(-9deg) scale(.82); filter: brightness(2); }
  to { opacity: 1; transform: rotate(-4deg) scale(1); }
}
@media (max-width: 600px) {
  #lootReveal {
    top: 96px;
    left: 8px;
    /* Leave room for the entrance's eight-pixel overshoot and skewed edge. */
    width: calc(100vw - 24px);
    grid-template-columns: minmax(0, 1fr) 92px;
    gap: 0 6px;
    min-height: 128px;
    padding: 10px 8px 10px 14px;
  }
  .loot-kicker { font-size: 8px; letter-spacing: .12em; }
  .loot-name { font-size: clamp(17px, 5.1vw, 22px); }
  .loot-chassis { font-size: 8px; letter-spacing: .1em; }
  .loot-traits { margin-top: 7px; }
  .loot-chip { font-size: 9px; padding: 3px 5px; }
  .loot-stat { font-size: 8px; }
  .loot-art::before { width: 78px; height: 60px; }
  .loot-art::after { width: 58px; top: calc(50% + 35px); }
  .loot-atlas-clip { width: 88px; }
  .loot-art-glyph { font-size: 44px; }
  .loot-art-mark { top: 1px; right: 2px; font-size: 7px; }
  .loot-art-pips { right: 2px; bottom: 2px; }
  .loot-art-pips i { width: 9px; }
  body:has(#finale.on) #lootReveal { top: 142px; }
}
@media (prefers-reduced-motion: reduce) {
  #lootReveal.is-live { animation: loot-reveal-reduced 3.25s ease both; }
  @keyframes loot-reveal-reduced {
    0%, 100% { opacity: 0; transform: translate3d(0,0,0) skewX(-2deg); }
    8%, 82% { opacity: 1; transform: translate3d(0,0,0) skewX(-2deg); }
  }
}`;
document.head.append(style);

const root = document.createElement('section');
root.id = 'lootReveal';
root.setAttribute('role', 'status');
root.setAttribute('aria-live', 'polite');
root.setAttribute('aria-atomic', 'true');
root.setAttribute('aria-hidden', 'true');
document.body.append(root);

function add(parent, className, text) {
  const el = document.createElement('div');
  el.className = className;
  el.textContent = text;
  parent.append(el);
  return el;
}

function distinctTraits(gun) {
  return GUN_TRAITS.filter((trait) => (gun.counts?.[trait] || 0) > 0);
}

function rolledName(gun) {
  const traits = distinctTraits(gun);
  if (!traits.length) return GUN_CHASSIS_NAMES[gun.letter] || 'RIVETGUN';
  const ranked = traits.slice().sort((a, b) =>
    (gun.counts[b] || 0) - (gun.counts[a] || 0) ||
    gun.traits.indexOf(a) - gun.traits.indexOf(b));
  const primary = ranked[0];
  const count = gun.counts[primary] || 1;
  const crown = count >= 3 ? 'APEX ' : count === 2 ? 'TWIN ' : '';
  const secondary = ranked.length > 1 ? TRAIT_NAME[ranked[ranked.length - 1]] + ' ' : '';
  return `${crown}${TRAIT_NAME[primary]} ${secondary}${CHASSIS_NOUN[gun.letter] || 'RIVET'}`;
}

function statDeltas(gun, def) {
  const base = CONFIG.weapons[gun.letter] || CONFIG.weapons.R;
  const rows = [];
  // Cindermouth owns a two-state shot. Put the verb on the existing pickup
  // stat line so its deck transformation is learned as weapon behavior, not
  // mistaken for a slow projectile getting stuck on collision geometry.
  if (gun.letter === 'F') rows.push(['DECK HIT → GROUND-FIRE', 'good']);
  const rapid = Math.round((base.fireRateMs / def.fireRateMs - 1) * 100);
  if (rapid > 0) rows.push([`+${rapid}% FIRE RATE`, 'good']);
  const damage = def.damage - base.damage;
  if (damage > 0) rows.push([`+${damage} DAMAGE`, 'good']);
  const count = def.count - (base.count || 1);
  if (count > 0) rows.push([`+${count} PROJECTILE${count > 1 ? 'S' : ''}`, 'good']);
  if ((gun.counts.SEEKER || 0) > 0)
    rows.push([`TRACK ${def.seekRange.toFixed(1)}T`, 'good']);
  if ((gun.counts.PHASE || 0) > 0)
    rows.push([`PENETRATES ${def.pierceBudget + 1}`, 'good']);
  if ((gun.counts.VOLATILE || 0) > 0)
    rows.push([`BLAST ${def.volatileRadius.toFixed(1)}T`, 'good']);
  const speed = Math.round((1 - def.speed / base.speed) * 100);
  if (speed > 0) rows.push([`−${speed}% SHOT SPEED`, 'trade']);
  return rows;
}

let last = null;
function acquired(gun, def, detail = null) {
  if (!gun || !def || !gun.tier) return;
  const tier = Math.max(1, Math.min(3, gun.tier));
  root.replaceChildren();
  root.className = `tier-${tier}`;
  const copy = add(root, 'loot-copy', '');
  add(copy, 'loot-kicker',
    `${detail?.recatch ? 'WEAPON RECOVERED' : 'WEAPON ACQUIRED'}  //  MARK ${ROMAN[tier]} · ${TIER_WORD[tier]}`);
  const name = rolledName(gun);
  add(copy, 'loot-name', name);
  add(copy, 'loot-chassis', `[${gun.letter}] ${GUN_CHASSIS_NAMES[gun.letter] || 'RIVETGUN'} CHASSIS`);

  const traits = add(copy, 'loot-traits', '');
  for (const trait of distinctTraits(gun)) {
    const n = gun.counts[trait] || 1;
    add(traits, 'loot-chip', `${trait}${n > 1 ? ` ×${n}` : ''}`);
  }
  const stats = add(copy, 'loot-stats', '');
  const deltas = statDeltas(gun, def);
  for (const [text, tone] of deltas) add(stats, `loot-stat ${tone}`, text);

  const art = add(root, 'loot-art', '');
  const atlasCell = capsuleAtlasWeaponCell(gun.letter);
  if (!atlasCell) art.classList.add('no-art');
  const clip = add(art, 'loot-atlas-clip', '');
  if (atlasCell) {
    const canvas = document.createElement('canvas');
    canvas.width = atlasCell.sw;
    canvas.height = atlasCell.sh;
    const context = canvas.getContext('2d', { alpha: true });
    if (context) {
      context.drawImage(atlasCell.image,
        atlasCell.sx, atlasCell.sy, atlasCell.sw, atlasCell.sh,
        0, 0, atlasCell.sw, atlasCell.sh);
      clip.append(canvas);
    } else {
      art.classList.add('no-art');
    }
  }
  add(art, 'loot-art-glyph', gun.letter || 'R');
  add(art, 'loot-art-mark', `MK ${ROMAN[tier]}`);
  const pips = add(art, 'loot-art-pips', '');
  for (let i = 0; i < tier; i++) pips.append(document.createElement('i'));
  add(root, 'loot-scan', '');

  root.setAttribute('aria-hidden', 'false');
  // Restart the entrance if two pickups land close together. This forced
  // style read happens once per reward, never in the frame loop.
  void root.offsetWidth;
  root.classList.add('is-live');
  last = {
    id: gun.id, tier, name, chassis: GUN_CHASSIS_NAMES[gun.letter],
    traits: distinctTraits(gun).map((trait) => [trait, gun.counts[trait]]),
    stats: deltas.map(([text]) => text), recatch: !!detail?.recatch,
  };
}

root.addEventListener('animationend', (event) => {
  // The art lock and acquisition sweep deliberately animate inside the card.
  // Their animationend events bubble; only the card's own lifetime may retire
  // the reveal or a nested flourish would cut a relic pickup short.
  if (event.target !== root) return;
  root.classList.remove('is-live');
  root.setAttribute('aria-hidden', 'true');
});

export function lootRevealSnapshot() {
  const r = root.getBoundingClientRect();
  return {
    active: root.classList.contains('is-live'),
    ariaHidden: root.getAttribute('aria-hidden'),
    rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
    last,
  };
}

if (typeof window !== 'undefined') window.__HB_LOOT_REVEAL = lootRevealSnapshot;
installView({ loot: { acquired } });
