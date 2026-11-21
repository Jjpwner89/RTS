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
  if (!first) { slip.classList.remove('show'); shown = null; return; }
  const [key, el] = first;
  if (shown !== key) {
    shown = key;
    dispatchEvent(new Event('ui-unlock'));
    slip.querySelector('span').textContent = UNLOCKS[key].intro;
    slip.onclick = () => { markSeen(w, key); el.classList.remove('is-new'); slip.classList.remove('show'); shown = null; };
  }
  place(el);
  slip.classList.add('show');
}

// Beside the thing: to its right if there is room, else above it, kept on screen.
function place(el) {
  const r = el.getBoundingClientRect(), s = slip.getBoundingClientRect(), pad = 8;
  let x = r.right + 10, y = r.top + r.height / 2 - s.height / 2, side = 'right';
  if (x + s.width > innerWidth - pad) { x = r.left + r.width / 2 - s.width / 2; y = r.top - s.height - 10; side = 'above'; }
  // Something in the top bar: right of it is the next button or a side panel, so go under it.
  if (el.closest('#top')) { x = r.left + r.width / 2 - s.width / 2; y = r.bottom + 10; side = 'below'; }
  if (y < pad) { y = r.bottom + 10; side = 'below'; }
  x = Math.max(pad, Math.min(innerWidth - s.width - pad, x));
  // Not over the news lines under the top bar: step below them.
  const lines = [...document.querySelectorAll('#log > div:not(.fade)')].map(d => d.getBoundingClientRect());
  for (const b of lines) if (x < b.right && x + s.width > b.left && y < b.bottom && y + s.height > b.top) y = b.bottom + 8;
  slip.style.left = `${Math.round(x)}px`;
  slip.style.top = `${Math.round(Math.max(pad, Math.min(innerHeight - s.height - pad, y)))}px`;
  slip.dataset.side = side;
}
