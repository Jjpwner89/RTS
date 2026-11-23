// The march sandbox: how long armies take between places under each setting of the march (world/march.js), and a raid
// band and the relief that answers it, played out side by side. Nothing here touches the game.
import { MARCH, marchClass, marchPace } from './world/march.js';

const SETTINGS = Object.values(MARCH);
const MEET = 14;                       // world.js: opposing armies this close fight
const HOP = 200;                       // about one place along the road
// The road, as distance along it: the raiders' camp, the village, a place one away, a place two away.
const ROAD = { camp: 0, village: 220, one: 430, two: 665 };
const PLACES = [['Camp', 0], ['Village', 220], ['One place away', 430], ['Two places away', 665]];

const ARMIES = [
  ['All foot (spearmen)', [{ key: 'spear', count: 60 }]],
  ['All horse (heavy cavalry)', [{ key: 'cav', count: 40 }]],
  ['Foot and horse together', [{ key: 'spear', count: 60 }, { key: 'knight', count: 24 }]],
  ['A raid band (bandits)', [{ key: 'bandit', count: 20 }]],
  ['Foot with a ram', [{ key: 'spear', count: 60 }, { key: 'ram', count: 10 }]],
];
const RELIEF = { foot: [{ key: 'spear', count: 60 }], horse: [{ key: 'cav', count: 40 }] };
const RAIDERS = [{ key: 'bandit', count: 20 }];

const $ = id => document.getElementById(id);
const fmt = s => s < 60 ? `${Math.round(s)} s` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const both = s => `${Math.round(s)} s <small>(${(s / 60).toFixed(1)} min)</small>`;

// ---- the numbers ----

function describe(S) {
  const bits = [`foot ${S.foot} a second`, `horse ${S.horse}`, `engines ${S.engine}`];
  return bits.join(', ');
}
$('sets').innerHTML = SETTINGS.map(S => `<div class="set"><b>${S.key}</b><span>${S.name}<br><small>${describe(S)} world units a second; an army goes at its slowest unit's pace${S.foot === S.horse ? '' : ' (horse and dogs fastest, foot slower, engines slowest)'}</small></span></div>`).join('');

function times() {
  const head = `<tr><th>March of</th>${SETTINGS.map(S => `<th colspan="2">${S.key}</th>`).join('')}</tr>
    <tr><th></th>${SETTINGS.map(() => '<th>1 place</th><th>2 places</th>').join('')}</tr>`;
  const rows = ARMIES.map(([name, units]) => `<tr><td>${name}<br><small>${marchClass(units)} pace</small></td>${SETTINGS.map(S => {
    const v = marchPace(S, units);
    return `<td>${both(HOP / v)}</td><td>${both(HOP * 2 / v)}</td>`;
  }).join('')}</tr>`).join('');
  $('times').innerHTML = `<table>${head}${rows}</table>`;
}

// Seconds the raiders have at the village before relief is on them: the relief sets out when the raiders are seen to
// leave their camp (after `delay`), the raiders reach the village after their own march.
function raidWindow(S, from, kind, delay) {
  const raid = (ROAD.village - ROAD.camp) / marchPace(S, RAIDERS);
  const dist = (from === 'one' ? ROAD.one : ROAD.two) - ROAD.village;
  const arrive = delay + dist / marchPace(S, RELIEF[kind]);
  return { raid, arrive, window: arrive - raid };
}
function windows() {
  const delay = +$('delay').value || 0;
  const rows = [['one', 'foot', 'From one place away, foot'], ['one', 'horse', 'From one place away, horse'], ['two', 'foot', 'From two places away, foot'], ['two', 'horse', 'From two places away, horse']];
  const head = `<tr><th>Raiders at the village for…</th>${SETTINGS.map(S => `<th>${S.key}</th>`).join('')}</tr>
    <tr><td><small>raiders reach it after</small></td>${SETTINGS.map(S => `<td><small>${fmt((ROAD.village - ROAD.camp) / marchPace(S, RAIDERS))}</small></td>`).join('')}</tr>`;
  const body = rows.map(([from, kind, label]) => `<tr><td>${label}</td>${SETTINGS.map(S => {
    const w = raidWindow(S, from, kind, delay);
    const cls = w.window <= 0 ? 'g' : w.window > 60 ? 'r' : '';
    return `<td class="${cls}" style="background:${w.window <= 0 ? 'rgba(120,160,70,.18)' : w.window > 60 ? 'rgba(180,70,50,.13)' : ''}">${w.window <= 0 ? `met on arrival <small>(relief ${fmt(-w.window)} early)</small>` : `${fmt(w.window)}`}<br><small>relief at ${fmt(w.arrive)}</small></td>`;
  }).join('')}</tr>`).join('');
  $('windows').innerHTML = `<table>${head}${body}</table><p class="lead" style="margin:6px 0 0">Green: the relief gets there first. Red: over a minute to plunder.</p>`;
}

// ---- the picture ----

class Strip {
  constructor(S, root) {
    this.S = S;
    root.insertAdjacentHTML('beforeend', `<div class="strip"><h3><b>${S.key}</b> ${S.name} <small id="t${S.key}"></small></h3><canvas id="c${S.key}"></canvas><div class="log" id="l${S.key}"></div></div>`);
    this.canvas = $('c' + S.key);
    this.log = $('l' + S.key);
    this.stamp = $('t' + S.key);
    this.reset();
  }

  reset() {
    const S = this.S, kind = $('relief').value;
    this.t = 0;
    this.events = [];
    this.raid = { s: ROAD.camp, st: 'march', pace: marchPace(S, RAIDERS), at: null, plundered: 0 };
    this.reliefs = [
      { name: 'relief from one place away', from: ROAD.one, colour: '#2c58b8', pace: marchPace(S, RELIEF[kind]), s: ROAD.one, st: 'wait' },
      { name: 'relief from two places away', from: ROAD.two, colour: '#2c8a58', pace: marchPace(S, RELIEF[kind]), s: ROAD.two, st: 'wait' },
    ];
    this.note('The raid band sets out from its camp.');
    this.draw();
  }

  note(text) { this.events.push(`${fmt(this.t)} ${text}`); }

  step(dt) {
    const R = this.raid, delay = +$('delay').value || 0;
    this.t += dt;
    if (this.t >= delay) for (const r of this.reliefs) if (r.st === 'wait') { r.st = 'march'; this.note(`The village sees them and sends ${r.name}.`); }
    if (R.st === 'march') {
      R.s = Math.min(ROAD.village, R.s + R.pace * dt);
      if (R.s >= ROAD.village) { R.st = 'plunder'; R.at = this.t; this.note('The raiders reach the village and fall to plundering.'); }
    } else if (R.st === 'plunder') R.plundered = this.t - R.at;
    else if (R.st === 'flee') {
      R.s = Math.max(ROAD.camp, R.s - R.pace * 1.1 * dt);
      if (R.s <= ROAD.camp) { R.st = 'home'; this.note(`The raiders are back at their camp (${fmt(R.plundered)} at the village).`); }
    }
    for (const r of this.reliefs) {
      if (r.st === 'march') {
        r.s = Math.max(ROAD.village, r.s - r.pace * dt);
        if (r.s <= ROAD.village) { r.st = 'there'; this.note(`${r.name[0].toUpperCase()}${r.name.slice(1)} reaches the village${R.st === 'plunder' ? '.' : R.st === 'march' ? ' before the raiders.' : '.'}`); }
      } else if (r.st === 'chase') r.s = Math.max(ROAD.camp, r.s - r.pace * dt);
      // Relief on the raiders: they break off at once and run; fast horse runs them down on the road.
      if ((r.st === 'march' || r.st === 'there') && R.st === 'plunder' && Math.abs(r.s - R.s) < MEET) { R.st = 'flee'; this.note(`${r.name[0].toUpperCase()}${r.name.slice(1)} is on them after ${fmt(R.plundered)}: the raiders break off and run.`); }
      else if (r.st === 'chase' && R.st === 'flee' && Math.abs(r.s - R.s) < MEET) { R.st = 'caught'; this.note(`${r.name[0].toUpperCase()}${r.name.slice(1)} runs them down on the road, ${Math.round(ROAD.village - R.s)} units from the village: a fight in the open.`); }
      if (R.st === 'flee' && r.st === 'there' && r.pace > R.pace * 1.1) { r.st = 'chase'; this.note(`${r.name[0].toUpperCase()}${r.name.slice(1)} rides after them.`); }
    }
    if (R.st === 'caught') for (const r of this.reliefs) if (r.st === 'chase') r.st = 'done';
    this.draw();
  }

  get over() { return ['home', 'caught'].includes(this.raid.st); }

  draw() {
    const c = this.canvas, dpr = devicePixelRatio || 1, W = c.clientWidth || 800, H = 130;
    if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const x = s => 40 + (s + 20) / 725 * (W - 80), y = s => 62 + Math.sin(s / 140) * 8;
    g.strokeStyle = '#a8905a'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath();
    for (let s = 0; s <= 665; s += 5) { g[s ? 'lineTo' : 'moveTo'](x(s), y(s)); }
    g.stroke();
    g.font = '12px sans-serif'; g.textAlign = 'center';
    for (const [name, s] of PLACES) {
      g.fillStyle = name === 'Camp' ? '#7a3028' : '#444';
      g.beginPath(); g.arc(x(s), y(s), 9, 0, 7); g.fill();
      g.fillStyle = '#3a2c18'; g.fillText(name, x(s), y(s) + 28);
    }
    const R = this.raid;
    if (R.st === 'plunder') { g.strokeStyle = '#e07020'; g.lineWidth = 3; g.beginPath(); g.arc(x(ROAD.village), y(ROAD.village), 16 + (this.t * 4 % 6), 0, 7); g.stroke(); }
    const dot = (s, colour, label, dy) => { g.fillStyle = colour; g.beginPath(); g.arc(x(s), y(s) + dy, 7, 0, 7); g.fill(); g.fillStyle = '#222'; g.fillText(label, x(s), y(s) + dy - 11); };
    dot(R.s, R.st === 'caught' ? '#6a1a14' : '#b03028', R.st === 'plunder' ? `plundering ${fmt(R.plundered)}` : R.st === 'flee' ? 'fleeing' : R.st === 'caught' ? 'caught' : R.st === 'home' ? 'home' : 'raiders', -16);
    this.reliefs.forEach((r, i) => { if (r.st !== 'wait') dot(r.s, r.colour, i ? 'relief 2' : 'relief 1', 16); });
    this.stamp.textContent = `· ${fmt(this.t)}`;
    this.log.innerHTML = this.events.slice(-4).join('<br>');
  }
}

// ---- the page ----

const strips = SETTINGS.map(S => new Strip(S, $('strips')));
let paused = false, speed = 15, last = performance.now();
function advance(dt) { for (const s of strips) if (!s.over || s.t < 1) s.step(dt); }
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!paused) {
    let left = dt * speed;
    while (left > 1e-4) { const h = Math.min(0.25, left); for (const s of strips) if (!s.over) s.step(h); left -= h; }
  }
  requestAnimationFrame(frame);
}
function again() { for (const s of strips) s.reset(); windows(); }
$('play').onclick = () => { paused = !paused; $('play').textContent = paused ? '▶ Resume' : '❚❚ Pause'; };
for (const b of document.querySelectorAll('[data-speed]')) b.onclick = () => { speed = +b.dataset.speed; for (const o of document.querySelectorAll('[data-speed]')) o.classList.toggle('on', o === b); };
$('restart').onclick = again;
$('relief').onchange = again;
$('delay').onchange = again;
addEventListener('resize', () => strips.forEach(s => s.draw()));

times();
windows();
requestAnimationFrame(frame);
window.marchSim = { strips, advance, again, raidWindow, MARCH };
