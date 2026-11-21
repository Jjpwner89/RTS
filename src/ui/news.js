// New things say so, once (DESIGN_NOTES, "An interface that grows with rank"). Whatever just
// unlocked wears a red "New" seal, and the first of them on screen gets its one-line
// introduction pinned beside it. Clicking the line, or the thing itself, marks it seen.
// Screens register where each key lives: watch(key, () => element), one getter per key,
// replaced when a screen rebuilds. A getter may return [element, true] for a stand-in (the
// tab a new building sits on): it wears the seal, but clicking it doesn't count as using the
// thing. tick(world) runs once a frame from the page's loop.
import { UNLOCKS, isFresh, markSeen } from './unlocks.js';

const where = new Map();
let slip = null, shown = null, lastTick = 0;
const sealed = new Set();   // elements wearing a seal, so a stand-in loses it when the thing shows

export function watch(key, find) { where.set(key, find); }

const visible = el => el && el.isConnected && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';

function makeSlip() {
  slip = document.createElement('div');
  slip.id = 'newslip';
  slip.innerHTML = '<span></span><button title="Got it">✓</button>';
  document.body.append(slip);
}

export function tick(w) {
  const now = performance.now();
  if (!w || now - lastTick < 250) return;
  lastTick = now;
  if (!slip) makeSlip();
  let first = null;
  const want = new Set();
  for (const [key, find] of where) {
    const got = find();
    const [el, standIn] = Array.isArray(got) ? got : [got, false];
    if (!el || !isFresh(w, key)) continue;
    want.add(el);
    // Using the thing counts as having read about it.
    const bound = `newBound${key.replace(/\W/g, '')}`;
    if (!standIn && !el.dataset[bound]) { el.dataset[bound] = '1'; el.addEventListener('click', () => markSeen(w, key)); }
    if (!first && visible(el)) first = [key, el];
  }
  for (const el of sealed) if (!want.has(el)) { el.classList.remove('is-new'); sealed.delete(el); }
  for (const el of want) { el.classList.add('is-new'); sealed.add(el); }
  // Never over a decision: while a card, the deploy bar or the help is open, the line waits.
  if (first && [...document.querySelectorAll('#prompt, #result, #end, #deploy, #help, #terms, #duel, #realm')].some(visible)) first = null;
  if (!first) { slip.classList.remove('show'); shown = null; return; }
  const [key, el] = first;
  if (shown !== key) {
    shown = key;
    dispatchEvent(new Event('ui-unlock'));
    slip.querySelector('span').textContent = UNLOCKS[key].intro;
    slip.onclick = () => { markSeen(w, key); el.classList.remove('is-new'); slip.classList.remove('show'); shown = null; };
  }
  slip.classList.add('show');
  if (!place(el)) { slip.classList.remove('show'); shown = null; }
}

// Beside the thing: to its right if there is room, else under, over or left of it, kept on
// screen and off every panel and card that holds buttons (the one the thing sits in included:
// a build button's notice goes above the bar, not over its neighbours) (a notice never covers a choice,
// whichever came first). False when there is nowhere clear: the line waits, the seal stays.
const AVOID = '#wpanel, #info, #build, #stock, #orders, #cards, #alerts, #goals, #defences, #log > div:not(.fade)';
function place(el) {
  const r = el.getBoundingClientRect(), s = slip.getBoundingClientRect(), pad = 8;
  const boxes = [...document.querySelectorAll(AVOID)].filter(b => b.getClientRects().length).map(b => b.getBoundingClientRect());
  const cx = r.left + r.width / 2 - s.width / 2, cy = r.top + r.height / 2 - s.height / 2;
  const cands = [[r.right + 10, cy, 'right'], [cx, r.bottom + 10, 'below'], [cx, r.top - s.height - 10, 'above'], [r.left - s.width - 10, cy, 'left']];
  if (el.closest('#top')) cands.unshift(cands.splice(1, 1)[0]);   // the next button is to the right: go under the bar
  const ok = ([x, y]) => x >= pad && y >= pad && x + s.width <= innerWidth - pad && y + s.height <= innerHeight - pad;
  const clear = ([x, y]) => boxes.every(b => x >= b.right || x + s.width <= b.left || y >= b.bottom || y + s.height <= b.top);
  const pick = cands.find(c => ok(c) && clear(c));
  if (!pick) return false;
  slip.style.left = `${Math.round(pick[0])}px`;
  slip.style.top = `${Math.round(pick[1])}px`;
  slip.dataset.side = pick[2];
  return true;
}
