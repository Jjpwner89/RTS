// One tooltip for the whole interface: a parchment slip in place of the browser's grey box,
// with the hotkey shown when the element names one (data-key). Code keeps writing `title`
// as before; while the pointer rests on an element its title is lifted into the slip (and
// put back when the pointer leaves), so the browser's own tooltip never shows as well. A
// greyed button's reason (data-why, set by ui/why.js) shows under its title.
// Loaded once per page from its HTML.
const tip = document.createElement('div');
tip.id = 'tip';
document.body.append(tip);

let host = null, held = '', timer = 0, mouse = { x: 0, y: 0 };
const DELAY = 280;

// A card, the help or the Realm screen is open: only tips for things inside it show.
const covered = el => [...document.querySelectorAll('.modal.open, #help.open, #realm')].some(m => m.getClientRects().length && !m.contains(el));
const owner = el => el?.closest?.('[title], [data-tip], [data-tip-held], [data-why]');

function lift() {
  if (!host) return;
  if (covered(host)) { tip.classList.remove('show'); return; }
  const t = host.getAttribute('title');
  if (t !== null) { held = t; host.removeAttribute('title'); host.dataset.tipHeld = '1'; }
  const text = host.dataset.tip || held;
  const key = host.dataset.key, why = host.disabled && host.dataset.why;
  const html = (text ? esc(text).replace(/\n/g, '<br>') + (key ? ` <kbd>${esc(key)}</kbd>` : '') : '')
    + (why ? `<span class="why">${esc(why)}</span>` : '');
  if (tip.dataset.was !== html) { tip.dataset.was = html; tip.innerHTML = html; }
  tip.classList.toggle('show', !!html);
  if (html) place();
}

function drop() {
  clearTimeout(timer);
  if (host?.dataset.tipHeld) { if (host.getAttribute('title') === null) host.setAttribute('title', held); delete host.dataset.tipHeld; }
  host = null; held = '';
  tip.classList.remove('show');
}

function place() {
  const s = tip.getBoundingClientRect(), pad = 8;
  let x = mouse.x + 14, y = mouse.y + 18;
  if (x + s.width > innerWidth - pad) x = mouse.x - s.width - 10;
  if (y + s.height > innerHeight - pad) y = mouse.y - s.height - 12;
  tip.style.left = `${Math.round(Math.max(pad, x))}px`;
  tip.style.top = `${Math.round(Math.max(pad, y))}px`;
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

addEventListener('mouseover', e => {
  const el = owner(e.target);
  if (el === host) return;
  drop();
  if (!el) return;
  host = el;
  // Lift the title at once, so the browser's tooltip never starts its own timer.
  const t = el.getAttribute('title');
  if (t !== null) { held = t; el.removeAttribute('title'); el.dataset.tipHeld = '1'; }
  timer = setTimeout(lift, DELAY);
}, true);
addEventListener('mousemove', e => { mouse = { x: e.clientX, y: e.clientY }; if (tip.classList.contains('show')) place(); }, true);
addEventListener('mousedown', () => tip.classList.remove('show'), true);
document.documentElement.addEventListener('mouseleave', drop);
// Code may rewrite a title every frame (a reason that changes): pick that up while shown.
(function follow() {
  if (host && (host.getAttribute('title') !== null || tip.classList.contains('show') || host.dataset.why)) {
    if (!host.isConnected) drop();
    else if (tip.classList.contains('show')) lift();
    else { const t = host.getAttribute('title'); if (t !== null) { held = t; host.removeAttribute('title'); } }
  }
  requestAnimationFrame(follow);
})();
