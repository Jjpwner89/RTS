// What a right-click would do, said at the cursor before you do it (QC round 2: an order aimed
// at Market Elmstrad marched 147 men onto walled Kingsbridge, which was on the way). One slip
// beside the pointer while one of your armies is selected and a place is under it: "March to X"
// or "Attack X", red when the place is free folk, walled or the way there passes one. Pure
// presentation: it asks the world the same questions the order itself will ask.
import { ownerOf } from '../world/world.js';
import { walledPlace } from '../world/places.js';
import { TYPES } from '../battle.js';

let tip = null;
const modalOpen = () => [...document.querySelectorAll('.modal.open, #help.open, #deploy, #realm')].some(e => e.getClientRects().length);
const place = (x, y) => {
  tip.style.left = `${Math.round(Math.min(x + 16, innerWidth - tip.offsetWidth - 8))}px`;
  tip.style.top = `${Math.round(Math.min(y + 20, innerHeight - tip.offsetHeight - 8))}px`;
};

function hostile(w, q) { return w.canAttack(0, q); }
const who = q => (q.owner === null ? 'free folk' : /^House /.test(ownerOf(q).name) ? ownerOf(q).name : ownerOf(q).name.toLowerCase());
const how = q => `${q.name} (${who(q)})${walledPlace(q) ? ', walled' : ''}`;

// {text, warn} for an army sent to place p, or null if there is nothing to say.
export function orderHint(w, a, p) {
  if (!a || !a.units || a.side !== 0 || !p || a.gone) return null;
  if (a.at === p) return null;
  const from = a.at || a.last;
  let path = [];
  try { path = w.route(from, p).path; } catch { /* no route: the order will say so */ }
  const stop = path.find(q => q !== from && hostile(w, q));
  if (stop && stop !== p) return { warn: true, text: `Stops at ${how(stop)} on the way and fights: that is not ${p.name}` };
  if (hostile(w, p)) {
    const risk = p.owner === null || walledPlace(p);
    // A walled place wants engines: say what the army brings, or that it brings none.
    const kit = [...a.units.filter(u => TYPES[u.key]?.engine).reduce((m, u) => m.set(u.name || TYPES[u.key].name, (m.get(u.name || TYPES[u.key].name) || 0) + (u.count || 1)), new Map())].map(([n, c]) => `${c} ${n.toLowerCase()}`);
    const wall = !walledPlace(p) ? '' : kit.length ? `: brings ${kit.join(', ')}` : ': no ram, ladders or engines, so a costly storm';
    return { warn: risk && !(walledPlace(p) && kit.length && p.owner !== null), text: `Attack ${how(p)}${wall}` };
  }
  return { warn: false, text: p.owner === 0 ? `March to ${p.name}` : `March to ${p.name}: ${who(p)} is at peace with you, so the army waits outside until war is declared` };
}

// Called from the map's pointer-move: p is the place under the pointer, or null.
export function showOrderHint(w, a, p, x, y) {
  if (!tip) {
    tip = document.createElement('div'); tip.id = 'ordertip'; document.body.append(tip);
    // Gone on any click, and when the map isn't what you are looking at (a village, a card, the help).
    addEventListener('pointerdown', hideOrderHint, true);
    setInterval(() => { if (tip.classList.contains('show') && (!document.body.classList.contains('mode-world') || modalOpen())) hideOrderHint(); }, 200);
  }
  const h = modalOpen() ? null : orderHint(w, a, p);
  if (!h) { tip.classList.remove('show'); return; }
  if (tip.textContent !== h.text) tip.textContent = h.text;
  tip.classList.toggle('warn', !!h.warn);
  tip.classList.add('show');
  place(x, y);
}
export const hideOrderHint = () => tip?.classList.remove('show');
