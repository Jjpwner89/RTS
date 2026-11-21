// The world map's side panels fold to their heading (DESIGN_NOTES, rule 4: the 3D view first).
// Click the heading of Needs you or Your realm; the choice is remembered, and in a small
// window both start folded. The panels' own code rebuilds their insides and never sees this:
// the fold is a class on the panel, which survives a rebuild. Loaded once from world.html.
const pref = (k, d) => { try { const v = localStorage.getItem(`rts.ui.${k}`); return v === null ? d : v === '1'; } catch { return d; } };
const setPref = (k, v) => { try { localStorage.setItem(`rts.ui.${k}`, v ? '1' : '0'); } catch { /* private mode: fine */ } };
const small = () => innerWidth < 1100 || innerHeight < 720;

function wire(id, key, head, mark) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('folded', pref(key, small()));
  el.addEventListener('click', e => {
    const h = e.target.closest(head);
    if (!h || !el.contains(h)) return;
    el.classList.toggle('folded');
    setPref(key, el.classList.contains('folded'));
  });
  new MutationObserver(() => mark?.(el)).observe(el, { childList: true });
  mark?.(el);
}

// Needs you: the count rides on the folded heading.
wire('alerts', 'alerts-folded', 'h4', el => {
  const h = el.querySelector('h4');
  if (h) h.dataset.n = el.querySelectorAll('[data-alert]').length;
});
// Your realm: only when the panel shows the realm (a selected place has its own panel).
wire('wpanel', 'realm-folded', 'h3', el => el.classList.toggle('is-realm', el.firstElementChild?.tagName === 'H3' && el.firstElementChild.textContent === 'Your realm'));

// The help opens short: the campaign and the three things to do first. The rest of how the
// game works is behind "More" (QC round 2: about 1,500 words before the first click).
document.getElementById('help-more')?.addEventListener('click', e => {
  const help = document.getElementById('help'), on = help.classList.toggle('show-more');
  e.currentTarget.textContent = on ? 'Less ▴' : 'More: how everything works ▾';
});

// In a running game the help is help, not the campaign's opening page.
(() => {
  const help = document.getElementById('help');
  if (!help) return;
  const title = help.querySelector('h3'), close = document.getElementById('help-close'), first = title.textContent, start = close.textContent;
  new MutationObserver(() => {
    if (!help.classList.contains('open')) return;
    const running = (window.game?.world?.time ?? 0) > 5;
    title.textContent = running ? 'How to play' : first;
    close.textContent = running ? 'Close' : start;
  }).observe(help, { attributes: true, attributeFilter: ['class'] });
})();
