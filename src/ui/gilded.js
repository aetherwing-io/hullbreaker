/* ===================== GILDED CHASSIS BANNER ====================== */
/* The one visible acknowledgement that the Konami code landed
   (src/pure/konami.js, wired in src/main.js). A short gold toast, modelled
   on the loot reveal's entrance but far smaller: it never pauses, never
   captures input, and says nothing about gameplay effect — the chassis is
   cosmetic, and the copy stays vague on purpose. DOM-only; nothing here
   writes back to the sim.                                              */

const style = document.createElement('style');
style.textContent = `
#gildedToast {
  position: fixed;
  z-index: 34;
  left: 50%;
  top: clamp(64px, 12vh, 110px);
  transform: translate3d(-50%, -18px, 0);
  padding: 10px 22px 11px;
  color: #ffe9bb;
  background:
    linear-gradient(100deg, rgba(24,20,12,.96), rgba(46,34,16,.94) 60%, rgba(24,20,12,.96));
  border: 1px solid rgba(255,196,94,.55);
  border-top: 2px solid rgba(255,214,130,.8);
  clip-path: polygon(10px 0, calc(100% - 10px) 0, 100% 100%, 0 100%);
  box-shadow: 0 10px 30px rgba(0,0,0,.5), 0 0 26px rgba(255,196,94,.18);
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  text-transform: uppercase;
  text-align: center;
  letter-spacing: .18em;
  font-size: 13px;
  font-weight: 850;
  pointer-events: none;
  opacity: 0;
  contain: layout paint style;
}
#gildedToast small {
  display: block;
  margin-top: 3px;
  color: rgba(255,233,187,.62);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .22em;
}
#gildedToast.is-live { animation: gilded-toast 2.6s cubic-bezier(.18,.78,.2,1) both; }
@keyframes gilded-toast {
  0%   { opacity: 0; transform: translate3d(-50%, -18px, 0); filter: brightness(1.5); }
  8%   { opacity: 1; transform: translate3d(-50%, 2px, 0); }
  13%  { transform: translate3d(-50%, 0, 0); filter: brightness(1); }
  78%  { opacity: 1; transform: translate3d(-50%, 0, 0); }
  100% { opacity: 0; transform: translate3d(-50%, -8px, 0); }
}
@media (prefers-reduced-motion: reduce) {
  #gildedToast.is-live { animation: gilded-toast-reduced 2.6s ease both; }
  @keyframes gilded-toast-reduced {
    0%, 100% { opacity: 0; }
    10%, 80% { opacity: 1; }
  }
}`;
document.head.append(style);

const root = document.createElement('div');
root.id = 'gildedToast';
root.setAttribute('role', 'status');
root.setAttribute('aria-live', 'polite');
root.setAttribute('aria-hidden', 'true');
document.body.append(root);

export function announceGilded(on) {
  root.replaceChildren();
  root.append(document.createTextNode(on
    ? '✦ GILDED CHASSIS ENGAGED ✦'
    : 'GILDED CHASSIS RELEASED'));
  const sub = document.createElement('small');
  sub.textContent = on
    ? 'the meridian recognizes its own. probably.'
    : 'back to standard-issue salvage grey';
  root.append(sub);
  root.setAttribute('aria-hidden', 'false');
  // Restart the entrance on a fast re-entry; one forced style read per
  // announcement, never in the frame loop.
  root.classList.remove('is-live');
  void root.offsetWidth;
  root.classList.add('is-live');
}

root.addEventListener('animationend', (event) => {
  if (event.target !== root) return;
  root.classList.remove('is-live');
  root.setAttribute('aria-hidden', 'true');
});
