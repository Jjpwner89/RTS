// Notices never cover each other (creator, 2026-11-23: "Building is held up" lay over the
// autumn herald, and neither could be read). The paused tag, the deploy and parley bars, the
// herald, the news lines and the toast each keep their own place when alone (style.css). When
// two would meet, the later one in NOTICES moves to the nearest clear spot above or below,
// and goes back as soon as its own place is free.

const NOTICES = ['#paused-tag', '#deploy', '#terms', '#duel', '#herald', '#log', '#toast'];   // first keeps its place
const FIXED = '#top, #prompt.open, #result.open, #end.open, #starthere.open, #help.open';     // never moved, never covered
const GAP = 6;

const zoomOf = el => parseFloat(getComputedStyle(el).zoom) || 1;
const meets = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

// Whether it is on screen saying something. The herald and the toast fade rather than hide.
export function saying(el) {
  if (!el.getClientRects().length) return false;
  const s = getComputedStyle(el);
  if (s.visibility === 'hidden') return false;
  if (el.id === 'herald' || el.id === 'toast') return el.classList.contains('show') || +s.opacity > 0.05;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

// Where it comes to rest: its box without the little slide it arrives by.
export function boxOf(el) {
  const r = el.getBoundingClientRect(), t = getComputedStyle(el).transform;
  const slid = el.id === 'herald' && t !== 'none' ? new DOMMatrix(t).f * zoomOf(el) : 0;
  return { left: r.left, right: r.right, top: r.top - slid, bottom: r.bottom - slid, width: r.width, height: r.height };
}

export function arrange() {
  const taken = [...document.querySelectorAll(FIXED)].filter(saying).map(boxOf);
  for (const sel of NOTICES) {
    const el = document.querySelector(sel);
    if (!el) continue;
    if (el.dataset.moved) { el.style.top = el.style.bottom = ''; delete el.dataset.moved; }
    if (!saying(el)) continue;
    let box = boxOf(el);
    if (taken.some(b => meets(box, b))) {
      const h = box.height;
      const spot = taken.flatMap(b => [b.bottom + GAP, b.top - GAP - h])
        .filter(y => y >= 0 && y + h <= innerHeight && !taken.some(b => meets({ ...box, top: y, bottom: y + h }, b)))
        .sort((a, b) => Math.abs(a - box.top) - Math.abs(b - box.top))[0];
      // (a window too small to hold them all: it stays where it was)
      if (spot !== undefined) {
        el.style.top = `${spot / zoomOf(el)}px`;
        el.style.bottom = 'auto';
        el.dataset.moved = '1';
        box = { ...box, top: spot, bottom: spot + h };
      }
    }
    taken.push(box);
  }
}

// Looked over again whenever one of them appears, goes, or changes size, before it is drawn.
const watched = [...document.querySelectorAll(`${NOTICES.join(', ')}, #top, #prompt, #result, #end, #starthere, #help`)];
const look = new MutationObserver(() => again());
const sizes = new ResizeObserver(() => again());
function again() {
  arrange();
  look.takeRecords();   // our own moves are not news
}
for (const el of watched) {
  const deep = el.id === 'log';
  look.observe(el, { attributes: true, attributeFilter: ['class', 'style', 'hidden'], childList: true, subtree: deep });
  sizes.observe(el);
}
look.observe(document.body, { attributes: true, attributeFilter: ['class'] });
addEventListener('resize', again);
addEventListener('transitionend', e => { if (watched.includes(e.target)) again(); });
again();
