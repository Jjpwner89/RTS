// The combat sandbox: one fight, played live under a chosen setting of how hard fighting is (battle.js TUNING),
// alone or in two copies side by side, with the numbers that tell the settings apart. It changes nothing in the
// game; the creator picks a setting by eye, and only then does it go to the live game.
// URL options: ?fight=3 (0-4), ?a=B (the left setting), ?b=D (and the right: side by side), ?seed=5.
import * as THREE from 'three';
import { createStage } from './stage.js';
import { drawGround } from './terrain.js';
import { Battle, TUNING, TYPES } from './battle.js';
import { BattleView } from './view.js';
import { SiegeView } from './siegeview.js';
import { buildFort } from './walls.js';
import { Controls } from './controls.js';
import { Hud } from './hud.js';

const params = new URLSearchParams(location.search);
const SETTINGS = Object.values(TUNING);
const find = k => TUNING[k] || TUNING.A;

// ---- the fights ----
// Each side is a list of [kind, x, z, count] on the ground; side 1 stands where side 0 does, mirrored across z = 0
// (blue holds +z facing north, red -z facing south), so counterparts face each other across the field.
const FIGHTS = [
  { name: 'Line against line', note: 'Three foot regiments a side: spear, sword, spear. 60 men each.', gap: 40, runs: 3,
    blue: [['spear', -34, 1, 60], ['sword', 0, 1, 60], ['spear', 34, 1, 60]] },
  { name: 'Knights into men-at-arms', note: 'Two regiments of knights ride 110 m onto two of men-at-arms.', gap: 0, runs: 3,
    blue: [['knight', -16, 110, 24], ['knight', 16, 110, 24]], red: [['maa', -18, 22, 40], ['maa', 18, 22, 40]] },
  { name: 'Spears against swords', note: 'Three of each, 60 men a regiment, spears on the left.', gap: 0, runs: 3,
    blue: [['spear', -34, 22, 60], ['spear', 0, 22, 60], ['spear', 34, 22, 60]], red: [['sword', -34, 22, 60], ['sword', 0, 22, 60], ['sword', 34, 22, 60]] },
  { name: 'Archers behind a line', note: 'Spears with archers behind them against swords with archers behind them.', gap: 0, runs: 3,
    blue: [['spear', -20, 22, 60], ['spear', 20, 22, 60], ['archer', 0, 38, 50]], red: [['sword', -20, 22, 60], ['sword', 20, 22, 60], ['archer', 0, 38, 50]] },
  { name: 'Storm a palisade', note: 'Foot hack their way through a timber wall held by spears and archers, to see how the breach goes.', gap: 0, runs: 2, fort: { z: -45, r: 26 },
    blue: [['sword', -24, 80, 60], ['spear', 0, 80, 60], ['sword', 24, 80, 60], ['maa', 0, 98, 40]],
    red: [['spear', -10, 36, 50], ['spear', 10, 36, 50], ['archer', 0, 52, 40]] },
  { name: 'A big band onto a small one', note: '120 spearmen go for 30 swordsmen: how a crowd closes on a few.', gap: 0, runs: 3,
    blue: [['spear', 0, 40, 120]], red: [['sword', 0, 22, 30]] },
  { name: 'About 300 a side', note: 'A whole army each: five foot regiments, two of bowmen and a knights’ wing. Mirror match.', gap: 0, runs: 2,
    blue: [['spear', -60, 22, 50], ['maa', -30, 22, 40], ['sword', 0, 22, 50], ['maa', 30, 22, 40], ['spear', 60, 22, 50],
      ['archer', -30, 40, 40], ['crossbow', 30, 40, 30], ['knight', 100, 30, 20]] },
];
for (const f of FIGHTS) { f.red ||= f.blue.map(([k, x, z, n]) => [k, x, z, n]); if (f.gap) { f.blue = f.blue.map(([k, x, z, n]) => [k, x, z + f.gap - 22, n]); f.red = f.red.map(([k, x, z, n]) => [k, x, z + f.gap - 22, n]); } }

const FLAT = () => 0;
FLAT.cached = true; FLAT.raw = FLAT;
const HOMES = [{ x: 0, z: 240 }, { x: 0, z: -240 }];

function makeBattle(fight, seed, tuning) {
  const b = new Battle(FLAT, seed, { deploy: false, homes: HOMES });
  b.tuning = tuning;
  b.checkWinner = true;
  for (const [side, list] of [[0, fight.blue], [1, fight.red]]) {
    for (const [key, x, z, count] of list) b.addRegiment(side, key, x, side === 0 ? z : -z, side === 0 ? Math.PI : 0, { count });
  }
  if (fight.fort) {
    buildFort(b.walls, 1, 0, fight.fort.z, fight.fort.r, { material: 'wood', sides: 8, gateAngle: 0 });
    for (const r of b.regs) if (r.side === 1) b.setHold([r], true);
  }
  b.step(0.001);
  return b;
}

// Everyone fights the nearest regiment that still stands; one that has been given an order by hand is left to it
// for 20 s. (The battle's own AI plans and waits; this is plain, so the settings are what differs.)
function autopilot(b) {
  for (const r of b.regs) {
    if (r.gone || r.routing || r.regrouping || r.T.engine || r.hold || (r.hand ?? -1) > b.time) continue;
    const t = r.targetReg;
    if (t && !t.gone && !t.routing && !t.regrouping) continue;
    let best = null, bd = Infinity;
    for (const e of b.regs) {
      if (e.side === r.side || e.gone || e.routing || e.regrouping || e.T.engine) continue;
      const d = Math.hypot(e.cx - r.cx, e.cz - r.cz);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) b.orderAttack([r], best);
  }
}

// What happened, as it happens: the first rout, the end, and who fell.
function track(p) {
  const b = p.battle;
  if (p.firstRout == null && b.regs.some(r => r.routedOnce)) p.firstRout = b.time;
  if (p.end == null && b.winner !== null) { p.end = b.time; p.winner = b.winner; }
}
const lossesOf = b => {
  const out = [{}, {}];
  for (const r of b.regs) {
    const dead = r.initial - r.alive;
    if (dead > 0) out[r.side][r.T.key] = (out[r.side][r.T.key] || 0) + dead;
  }
  return out;
};
const sum = o => Object.values(o).reduce((n, v) => n + v, 0);
const typed = o => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${TYPES[k]?.name.split(' ')[0].toLowerCase() || k} ${n}`).join(', ') || '—';
const secs = t => t == null ? '—' : `${Math.round(t)} s`;

// ---- the page ----

const canvas = document.getElementById('view');
const stage = createStage(canvas);
const { renderer, camera } = stage;
const paneEl = [document.getElementById('paneL'), document.getElementById('paneR')];

const ui = {
  fight: Math.max(0, Math.min(FIGHTS.length - 1, +params.get('fight') || 0)),
  seed: +params.get('seed') || 7,
  setL: find(params.get('a') || 'A'),
  setR: find(params.get('b') || 'D'),
  compare: params.has('b'),
};
let paused = false, speed = 1;

const panes = [];     // { scene, battle, view, set, firstRout, end, winner }
let controls = null, hud = null;
const ORDERS = ['orderMove', 'orderAttack', 'orderHalt', 'orderCharge', 'setFormation', 'setHold', 'setFireAtWill'];

// The battle as the controls and the cards see it: an order given on the left is stamped as by hand, and
// copied to the same regiments on the right, so both fights get the same commands.
function handed(left) {
  return new Proxy(left, {
    get(t, k) {
      const v = t[k];
      if (typeof v !== 'function') return v;
      if (!ORDERS.includes(k)) return v.bind(t);
      return (regs, ...rest) => {
        const stamp = b => { if (document.getElementById('hand').checked) for (const r of regs) { const m = b.regs[r.id]; if (m) m.hand = b.time + 20; } };
        stamp(t);
        const R = panes[1]?.battle;
        if (ui.compare && R) {
          stamp(R);
          const of = x => x && typeof x === 'object' && x.soldiers ? R.regs[x.id] : x;
          R[k](regs.map(r => R.regs[r.id]), ...rest.map(of));
        }
        return t[k](regs, ...rest);
      };
    },
  });
}

function build() {
  for (const p of panes) stage.dispose(p.scene);
  panes.length = 0;
  const fight = FIGHTS[ui.fight];
  for (let i = 0; i < 2; i++) {
    const scene = stage.newScene();
    drawGround(scene, FLAT, ui.seed);
    const battle = makeBattle(fight, ui.seed, i === 0 ? ui.setL : ui.setR);
    const view = new BattleView(scene, battle, FLAT, { keeps: false });
    const siege = new SiegeView(scene, battle, FLAT);
    panes.push({ scene, battle, view, siege, set: battle.tuning, firstRout: null, end: null, winner: null, clock: 0 });
  }
  const hooks = {
    togglePause: () => { paused = !paused; },
    setSpeed: s => { speed = s; paused = false; },
    selectionChanged: () => {},
    selectCard: (r, add) => controls.setSelection([r], add),
    focus: r => controls.focus([r]),
  };
  const proxy = handed(panes[0].battle);
  if (controls) { controls.battle = proxy; controls.view = panes[0].view; controls.selection.clear(); }
  else {
    controls = new Controls(camera, paneEl[0], proxy, panes[0].view, FLAT, hooks);
    paneEl[1].addEventListener('wheel', e => controls.onWheel(e), { passive: false });
    Object.assign(controls.cam, { x: 0, z: 0, dist: 130, yaw: Math.PI / 2 });
  }
  hud?.cardsEl && (hud.cardsEl.innerHTML = '');
  hud = new Hud(proxy, hooks, { endPanel: false });
  document.getElementById('tagL').textContent = '';
  window.game = { battle: panes[0].battle, view: panes[0].view, controls, panes, ui, FIGHTS, thinkAI: () => {} };
  renderStats();
}

// ---- the sidebar ----

function panel() {
  const scns = document.getElementById('scns');
  scns.innerHTML = '';
  FIGHTS.forEach((f, i) => {
    const b = document.createElement('button');
    b.className = 'scn' + (i === ui.fight ? ' on' : '');
    b.innerHTML = `${f.name}<small>${f.note}</small>`;
    b.onclick = () => { ui.fight = i; panel(); build(); };
    scns.append(b);
  });
  const sets = document.getElementById('sets');
  sets.innerHTML = SETTINGS.map(s => `<div class="set"><b>${s.key}</b><span>${s.name}<br><small class="dim">${describe(s)}</small></span></div>`).join('');
  const pick = (id, label, key, set) => {
    const el = document.getElementById(id);
    el.innerHTML = `<span>${label}</span>` + SETTINGS.map(s => `<button data-k="${s.key}" class="${s === ui[key] ? 'on' : ''}">${s.key}</button>`).join('');
    for (const b of el.querySelectorAll('button')) b.onclick = () => { ui[key] = find(b.dataset.k); panes[set].battle.tuning = ui[key]; panes[set].set = ui[key]; panel(); renderStats(); };
    el.style.display = set === 0 || ui.compare ? '' : 'none';
  };
  pick('pickL', ui.compare ? 'Left:' : 'Setting:', 'setL', 0);
  pick('pickR', 'Right:', 'setR', 1);
  document.getElementById('cmp').checked = ui.compare;
  document.body.classList.toggle('compare', ui.compare);
}
const describe = s => {
  const bits = [];
  if (s.defStep !== TUNING.A.defStep) bits.push(`each point of defence ${Math.round((s.defStep / TUNING.A.defStep - 1) * 100)}% worth more`);
  if (s.soak) bits.push(`mail turns ${Math.round(s.soak * 200)}% of a blow aside, plate ${Math.round(s.soak * 400)}%`);
  if (s.dmg !== 1) bits.push(`damage ${Math.round((s.dmg - 1) * 100)}%`);
  if (s.room !== 1) bits.push(`${Math.round((s.room - 1) * 100)}% more room between men`);
  if (s.crowd) bits.push(`at most ${s.crowd} on one man`);
  if (s.palisade !== 1) bits.push(`a palisade takes ${Math.round((1 - s.palisade) * 100)}% less from men hacking at it`);
  if (s.shock !== 1) bits.push(`a regiment breaking shakes its neighbours ${Math.round((1 - s.shock) * 100)}% less`);
  if (s.breakAt !== 0.5) bits.push(`the army breaks at ${Math.round(s.breakAt * 100)}% left, not 50%`);
  return bits.join('; ') || 'the numbers as the game has them';
};

document.getElementById('cmp').onchange = e => { ui.compare = e.target.checked; panel(); build(); };
document.getElementById('restart').onclick = () => build();

// ---- the numbers ----

let batch = { running: false, rows: null, note: '' };
function renderStats() {
  const el = document.getElementById('stats');
  const live = panes.slice(0, ui.compare ? 2 : 1).map(p => {
    const L = lossesOf(p.battle);
    const state = p.end != null ? `${p.winner === 0 ? '<span class="blue">blue</span>' : '<span class="red">red</span>'} won` : 'fighting';
    return `<h4>${p === panes[0] && ui.compare ? 'Left' : p === panes[1] ? 'Right' : 'This fight'} · ${p.set.key}: ${p.set.name}</h4>
      <table><tr><th>First rout</th><td class="n">${secs(p.firstRout)}</td><th>End</th><td class="n">${secs(p.end)}</td><td>${state}</td></tr></table>
      <table><tr><td class="blue">Blue lost</td><td class="n">${sum(L[0])}</td><td><small>${typed(L[0])}</small></td></tr>
      <tr><td class="red">Red lost</td><td class="n">${sum(L[1])}</td><td><small>${typed(L[1])}</small></td></tr></table>`;
  }).join('');
  el.innerHTML = `${live}<h4>Every setting, this fight</h4>${batchHtml()}`;
  document.getElementById('batch-go')?.addEventListener('click', runAll);
}
function batchHtml() {
  const go = `<button id="batch-go" ${batch.running ? 'disabled' : ''}>${batch.running ? 'Running…' : 'Run all settings'}</button> <small>${batch.note}</small>`;
  if (!batch.rows) return `${go}<br><small>Plays each setting through unwatched, a few times, and averages.</small>`;
  const best = Math.max(...batch.rows.map(r => r.end));
  return `${go}<table><tr><th></th><th>1st rout</th><th>End</th><th class="blue">Blue lost</th><th class="red">Red lost</th></tr>${batch.rows.map(r => `<tr class="${r.end === best ? 'best' : ''}"><td><b>${r.key}</b></td><td class="n">${secs(r.firstRout)}</td><td class="n">${secs(r.end)}</td><td class="n">${r.blue.toFixed(0)}</td><td class="n">${r.red.toFixed(0)}</td></tr><tr><td></td><td colspan="4"><small class="blue">${r.blueTyped}</small><br><small class="red">${r.redTyped}</small></td></tr>`).join('')}</table>
    <small>Averages of ${batch.rows[0].runs} run${batch.rows[0].runs > 1 ? 's' : ''} each; the longest end is shaded. Blue won ${batch.rows.map(r => `${r.key} ${r.blueWins}/${r.runs}`).join(', ')}.</small>`;
}

// A pause that lets the page draw and answer clicks (setTimeout would wait a second in a background tab).
const breathe = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });

// Every setting played through unwatched (no drawing), a slice at a time so the page stays alive.
async function runAll() {
  if (batch.running) return;
  const fight = FIGHTS[ui.fight], runs = fight.runs;
  batch = { running: true, rows: null, note: '' };
  const rows = [];
  for (const set of SETTINGS) {
    const row = { key: set.key, runs, firstRout: 0, end: 0, blue: 0, red: 0, blueWins: 0, blueT: {}, redT: {} };
    for (let i = 0; i < runs; i++) {
      batch.note = `${set.key}, run ${i + 1} of ${runs}…`;
      renderStats();
      const p = { battle: makeBattle(fight, ui.seed + i * 11, set), firstRout: null, end: null, winner: null };
      let t0 = performance.now(), ai = 0;
      while (p.end == null && p.battle.time < 400) {
        p.battle.step(0.05);
        if ((ai -= 0.05) <= 0) { ai = 1; autopilot(p.battle); }
        track(p);
        if (performance.now() - t0 > 40) { await breathe(); t0 = performance.now(); }
      }
      if (p.end == null) { p.end = p.battle.time; console.warn(`sandbox: ${set.key} run ${i + 1} of "${fight.name}" had not ended by 400 s`); }
      row.firstRout += (p.firstRout ?? p.end) / runs; row.end += p.end / runs;
      const L = lossesOf(p.battle);
      row.blue += sum(L[0]) / runs; row.red += sum(L[1]) / runs;
      if (p.winner === 0) row.blueWins++;
      for (const [k, n] of Object.entries(L[0])) row.blueT[k] = (row.blueT[k] || 0) + n / runs;
      for (const [k, n] of Object.entries(L[1])) row.redT[k] = (row.redT[k] || 0) + n / runs;
    }
    row.blueTyped = typed(Object.fromEntries(Object.entries(row.blueT).map(([k, n]) => [k, Math.round(n)])));
    row.redTyped = typed(Object.fromEntries(Object.entries(row.redT).map(([k, n]) => [k, Math.round(n)])));
    rows.push(row);
  }
  batch = { running: false, rows, note: '' };
  renderStats();
}

// ---- the loop ----

let last = performance.now(), statsAt = 0;

// Everything one frame does but the drawing: the fight advances (unless paused), the camera and the cards follow.
function advance(dt) {
  if (!paused) {
    let left = dt * speed;
    while (left > 1e-4) {
      const h = Math.min(0.05, left);
      for (const p of panes.slice(0, ui.compare ? 2 : 1)) {
        p.battle.step(h);
        if ((p.clock -= h) <= 0) { p.clock = 1; autopilot(p.battle); }
        track(p);
      }
      left -= h;
    }
  }
  controls.update(dt);
  for (const [i, p] of panes.entries()) if (i === 0 || ui.compare) { p.view.update(i === 0 ? controls.selection : new Set()); p.siege.update(dt); }
  hud.update(controls.selection, paused, speed);
  document.body.classList.toggle('paused', paused);
}

function draw() {
  const W = innerWidth, H = innerHeight, n = ui.compare ? 2 : 1, w = W / n;
  camera.aspect = w / H;
  camera.updateProjectionMatrix();
  renderer.setScissorTest(n > 1);
  for (let i = 0; i < n; i++) {
    const p = panes[i];
    stage.use(p.scene);
    stage.placeSun(controls.cam, FLAT);
    if (n > 1) { renderer.setViewport(i * w, 0, w, H); renderer.setScissor(i * w, 0, w, H); }
    else renderer.setViewport(0, 0, W, H);
    renderer.render(p.scene, camera);
  }
  stage.use(panes[0].scene);
}

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  advance(dt);
  draw();
  if (now - statsAt > 400) { statsAt = now; if (!batch.running) renderStats(); document.getElementById('tagL').textContent = `${panes[0].set.key}: ${panes[0].set.name}`; document.getElementById('tagR').textContent = `${panes[1].set.key}: ${panes[1].set.name}`; }
  requestAnimationFrame(frame);
}
window.sandbox = { advance, draw, build, runAll, get batch() { return batch; }, renderStats };

panel();
build();
requestAnimationFrame(frame);
