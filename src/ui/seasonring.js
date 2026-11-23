// The season in the top bar: a small ring of four quarters (spring, summer, autumn, winter) beside the clock. The
// seasons gone are full, the present one fills as it passes, the ones to come are only drawn. Hover says how long
// is left. A season is 300 game seconds and the year four of them (world.js `season`).
const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'], LEN = 300;
const COLOURS = ['#7fb35a', '#e0b84a', '#d98a3a', '#9ec7e6'];
const R = 7, C = 2 * Math.PI * R, Q = C / 4;

export const seasonOf = time => {
  const t = ((time % (LEN * 4)) + LEN * 4) % (LEN * 4), i = Math.floor(t / LEN), into = t - i * LEN;
  return { i, name: SEASONS[i], next: SEASONS[(i + 1) % 4], into, left: LEN - into, frac: into / LEN };
};
export const leftText = s => (s.left < 60 ? 'under a minute left' : `${Math.round(s.left / 60)} min left`) + `, then ${s.next.toLowerCase()}`;

export function mountSeasonRing(clock) {
  let el = document.getElementById('seasonring');
  if (el) return el;
  el = document.createElement('span');
  el.id = 'seasonring';
  el.innerHTML = `<svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" fill="none" stroke-width="3">${[0, 1, 2, 3].map(i =>
    `<circle cx="9" cy="9" r="${R}" data-q="${i}" transform="rotate(-90 9 9)" stroke="#8a7a5a" stroke-opacity=".35" stroke-dasharray="${Q - 1.4} ${C - Q + 1.4}" stroke-dashoffset="${-i * Q}"/>`
    + `<circle class="fill" cx="9" cy="9" r="${R}" data-f="${i}" transform="rotate(-90 9 9)" stroke="${COLOURS[i]}" stroke-dasharray="0 ${C}" stroke-dashoffset="${-i * Q}"/>`).join('')}</svg>`;
  clock.insertAdjacentElement('beforebegin', el);
  return el;
}

// Redraws the ring for game time `time`, only when it would look different.
export function updateSeasonRing(clock, time) {
  const el = mountSeasonRing(clock), s = seasonOf(time);
  if (el.nextElementSibling !== clock) clock.insertAdjacentElement('beforebegin', el);   // (the day dial is put in later: stay beside the words)
  const key = `${s.i}:${Math.round(s.frac * 40)}`;
  if (el.dataset.key === key) return s;
  el.dataset.key = key;
  for (const c of el.querySelectorAll('[data-f]')) {
    const i = +c.dataset.f, fill = i < s.i ? Q : i === s.i ? Q * s.frac : 0;
    c.setAttribute('stroke-dasharray', fill > 0 ? `${Math.max(0.01, fill - 1.4)} ${C}` : `0 ${C}`);
    c.setAttribute('stroke-opacity', i < s.i ? '.55' : '1');
  }
  el.title = `${s.name}: ${leftText(s)}`;
  clock.title = el.title;
  return s;
}
