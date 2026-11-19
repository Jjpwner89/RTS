// The campaign: one world map, and a zoom into any place on it. Your villages are the
// full village game; meetings on the road and attacks on other places become field
// battles you fight (or auto-resolve). URL option: ?seed=123 for a fixed map.
import { createStage } from './stage.js';
import { makeHeight, drawGround, plantTrees, drawTrees, HOMES } from './terrain.js';
import { Battle, TYPES } from './battle.js';
import { BattleView, keepModel } from './view.js';
import { Controls } from './controls.js';
import { Hud } from './hud.js';
import { TownView } from './townview.js';
import { TownHud } from './townhud.js';
import { thinkAI } from './ai.js';
import { rng } from './noise.js';
import { World, headcount, ownerOf, FACTIONS } from './world/world.js';
import { KINDS } from './world/realm.js';
import { ico } from './icons.js';
import { actions as dipActions, act as dipAct, mood } from './world/diplomacy.js';
import { WorldView } from './world/worldview.js';
import { WorldControls } from './world/worldcontrols.js';
import * as THREE from 'three';

const params = new URLSearchParams(location.search);
const seed = +params.get('seed') || Math.floor(Math.random() * 1e6);

const canvas = document.getElementById('view');
const stage = createStage(canvas);
const $ = id => document.getElementById(id);
const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

let paused = true, speed = 1;
let mode = 'world', current = null;     // current: the village or battle on screen
let selected = null;                    // on the world map: an army or a place
let hud = null, townHud = null;
const asks = [];                        // decisions waiting for the player, oldest first
const bundles = new Map();              // place → its drawn village, made on first visit

const world = new World(seed, {
  watching: () => (mode === 'town' ? current.poi : null),
  ask: enc => { asks.push({ kind: 'encounter', enc }); },
  townAttacked: p => { if (!(mode === 'town' && current.poi === p)) asks.push({ kind: 'alarm', poi: p }); },
  fell: p => {
    if (mode === 'town' && current.poi === p) showWorld();
    dropBundle(p);
  },
  captured: () => {},
  // A place you stormed is won, beaten off, or given up.
  stormEnded: (p, won, chose) => {
    const here = mode === 'town' && current.poi === p;
    if (won) {
      if (here) { setMode('town', townBundle(p)); flash(`${p.name} is yours!`, true); }
      else asks.push({ kind: 'news', title: `${p.name} is taken`, text: 'Your army has stormed it. It is yours now, with whatever is left standing.' });
      return;
    }
    if (here) {
      if (chose) { showWorld(); dropBundle(p); }
      else showResult('The attack has failed', `${p.name} holds. Your survivors fall back.`, 'Back to the map', () => { showWorld(); dropBundle(p); });
    } else dropBundle(p);
  },
  ended: winner => showResult(winner === 0 ? 'You are crowned' : 'Defeat',
    winner === 0 ? 'Kingsbridge is yours and the realm kneels. Long live the king.' : 'Your last village has fallen.', 'New campaign', () => location.reload()),
  herald: msg => herald(msg),
  offer: o => asks.push({ kind: 'offer', ...o }),
});

// A lord's words or big news, shown for a while at the top without stopping the game.
const heraldQueue = [];
function herald(msg) { heraldQueue.push(msg); if (heraldQueue.length === 1) showHerald(); }
function showHerald() {
  const msg = heraldQueue[0];
  if (!msg) return;
  const el = $('herald'), h = msg.house;
  const initials = (h.lord || h.name).split(' ').filter(w => /^[A-Z]/.test(w)).slice(-2).map(w => w[0]).join('');
  el.style.setProperty('--hc', h.color);
  el.innerHTML = `<div class="face"><img src="assets/art/portraits/${h.id}.png" alt="" onerror="this.replaceWith('${initials}')"></div><div><h4>${msg.title}</h4><p>${msg.text}</p></div>`;
  el.classList.add('show');
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => { heraldQueue.shift(); showHerald(); }, 500); }, 7500);
}

const worldView = new WorldView(stage, world);
const worldControls = new WorldControls(stage.camera, canvas, worldView, {
  togglePause: () => { paused = !paused; },
  setSpeed: s => { speed = s; paused = false; },
  select: it => { selected = it; },
  order: p => {
    if (!selected || !selected.units || selected.side !== 0) return;
    if (!world.order(selected, p)) flash(selected.retreating ? 'They are falling back and will not turn yet.' : 'They are already there.');
  },
  enter: p => enterTown(p),
});

// ---- your villages ----

function townBundle(p) {
  const old = bundles.get(p);
  if (old && old.town === p.town) return old;
  if (old) dropBundle(p);
  const town = p.town, heightAt = p.heightAt;
  const scene = stage.newScene();
  drawGround(scene, heightAt, p.seed, { tint: (x, z) => (p.onRoad(x, z) ? 1 : 0) });
  drawTrees(scene, heightAt, p.trees);
  const view = new BattleView(scene, town.battle, heightAt, { capacity: 400, keeps: false });
  const townView = new TownView(scene, town, heightAt, rng(p.seed + 11));
  const st = { placing: null, hoverAt: null, selected: null };
  const b = { kind: 'town', poi: p, town, scene, view, townView, st, heightAt };
  b.hooks = {
    togglePause: () => { paused = !paused; },
    setSpeed: s => { speed = s; paused = false; },
    selectionChanged: sel => { if (sel && sel.size) st.selected = null; },
    selectCard: (r, add) => b.controls.setSelection([r], add),
    focus: r => b.controls.focus([r]),
    startPlacing: kind => { st.placing = kind; st.selected = null; b.controls.setSelection([]); },
    pullBack: () => world.endStorm(p, true),
    place: (g, e) => {
      if (!st.placing) return false;
      if (town.hostile) { st.placing = null; return true; }
      if (!g) return true;
      const res = town.place(st.placing, g.x, g.z);
      if (!res.ok) townHud.flash(res.reason);
      else if (!e.shiftKey) st.placing = null;
      return true;
    },
    cancelPlacement: () => { if (!st.placing) return false; st.placing = null; return true; },
    hover: g => { st.hoverAt = g; },
    pickBuilding: g => { st.selected = g ? townView.buildingAt(g) : null; return !!st.selected; },
    deselect: () => { st.selected = null; b.controls.setSelection([]); },
    selectRegiment: r => { st.selected = null; b.controls.setSelection([r]); },
    moraleLabel: r => town.battle.moraleLabel(r),
  };
  b.controls = new Controls(stage.camera, canvas, town.battle, view, heightAt, b.hooks);
  b.controls.enabled = false;
  Object.assign(b.controls.cam, { x: 0, z: 40, dist: 120 });
  bundles.set(p, b);
  return b;
}

function dropBundle(p) {
  const b = bundles.get(p);
  if (!b) return;
  b.controls.enabled = false;
  stage.dispose(b.scene);
  bundles.delete(p);
}

function enterTown(p) {
  if (!p.town) { selected = p; return; }
  setMode('town', townBundle(p));
}

function showWorld() { setMode('world', null); }

function setMode(m, b) {
  if (current?.controls) current.controls.enabled = false;
  mode = m;
  current = b;
  worldControls.enabled = m === 'world';
  worldView.hideLabels(m !== 'world');
  document.body.className = `campaign mode-${m}`;
  $('cards').innerHTML = '';
  hud = townHud = null;
  if (m === 'world') stage.use(worldView.scene);
  else {
    stage.use(b.scene);
    b.controls.enabled = true;
    hud = new Hud(b.battle || b.town.battle, b.hooks, { endPanel: false, fresh: true });
    if (m === 'town') townHud = new TownHud(b.town, b.hooks);
  }
}

// ---- field battles ----

// Lays out an army facing `angle`: foot in the front line, archers behind, horse on the wings.
function deploy(battle, side, units, cx, cz, angle) {
  const sin = Math.sin(angle), cos = Math.cos(angle);
  const width = u => Math.min(TYPES[u.key].files, Math.max(4, Math.ceil(u.count / 2))) * TYPES[u.key].spacing + 6;
  const put = (u, lx, back) => {
    const r = battle.addRegiment(side, u.key, cx + cos * lx - sin * back, cz - sin * lx - cos * back, angle, { count: u.count, name: u.name });
    r.spec = u;
    r.levy = u.levy || null;
    r.retinue = !!u.retinue;
  };
  const row = (list, back) => {
    let x = -list.reduce((n, u) => n + width(u), 0) / 2;
    for (const u of list) { put(u, x + width(u) / 2, back); x += width(u); }
    return -x;
  };
  const foot = units.filter(u => u.key !== 'archer' && u.key !== 'cav');
  const archers = units.filter(u => u.key === 'archer'), horse = units.filter(u => u.key === 'cav');
  const half = foot.length ? row(foot, 0) : 0;
  if (archers.length) row(archers, foot.length ? 24 : 0);
  horse.forEach((u, i) => put(u, (i % 2 ? -1 : 1) * (half + 30 + Math.floor(i / 2) * 50), 8));
}

function startField(enc) {
  const fseed = seed + 50000 + Math.floor(world.time * 7);
  const assault = enc.kind === 'assault';
  const keepAt = { x: 0, z: -150 };
  const heightAt = makeHeight(fseed, assault ? [keepAt, HOMES[0]] : HOMES);
  const scene = stage.newScene();
  drawGround(scene, heightAt, fseed);
  const trees = plantTrees(fseed, (x, z) => (Math.abs(x) < 120 && Math.abs(z) < 250) || (assault && Math.hypot(x - keepAt.x, z - keepAt.z) < 60), 0.56, 900);
  drawTrees(scene, heightAt, trees);
  // You come from the south; defenders of a place run back to its keep, others leave the field.
  const battle = new Battle(heightAt, fseed, { deploy: false, homes: [{ x: 0, z: 240 }, assault ? keepAt : { x: 0, z: -240 }], disbandAtHome: [true, !assault] });
  deploy(battle, 0, enc.army.units, 0, 95, Math.PI);
  deploy(battle, 1, enc.defenders, 0, assault ? -95 : -95, 0);
  battle.checkWinner = true;
  if (assault) {
    const keep = new THREE.Mesh(keepModel(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    keep.position.set(keepAt.x, heightAt(keepAt.x, keepAt.z) - 0.5, keepAt.z);
    keep.castShadow = keep.receiveShadow = true;
    scene.add(keep);
  }
  const view = new BattleView(scene, battle, heightAt, { keeps: false });
  const b = { kind: 'field', enc, battle, scene, view, heightAt, assault, aiClock: 0, done: false };
  b.hooks = {
    togglePause: () => { paused = !paused; },
    setSpeed: s => { speed = s; paused = false; },
    selectionChanged: () => {},
    selectCard: (r, add) => b.controls.setSelection([r], add),
    focus: r => b.controls.focus([r]),
  };
  b.controls = new Controls(stage.camera, canvas, battle, view, heightAt, b.hooks);
  Object.assign(b.controls.cam, { x: 0, z: 135, dist: 105, yaw: 0 });
  battle.step(0.001);
  $('field-title').textContent = assault ? `Battle for ${enc.poi.name}` : 'Battle on the road';
  setMode('field', b);
}

const alive = r => r.soldiers.filter(s => s.alive).length;
const survivors = (battle, side) => battle.regs.filter(r => r.side === side)
  .map(r => ({ ...r.spec, count: alive(r) })).filter(u => u.count >= 3);

function endField(won) {
  const b = current;
  if (b.done) return;
  b.done = true;
  const mine = survivors(b.battle, 0), theirs = survivors(b.battle, 1);
  const lost = [0, 1].map(s => b.battle.losses[s]);
  world.settle(b.enc, won, mine, theirs);
  showResult(won ? 'Victory' : b.retreated ? 'Retreat' : 'Defeat',
    `Your losses: ${lost[0]} · Enemy losses: ${lost[1]}`, 'Back to the map', () => {
      stage.dispose(b.scene);
      showWorld();
    });
}

// ---- prompts ----

function nextAsk() {
  if (mode === 'field' || $('prompt').classList.contains('open') || $('result').classList.contains('open') || !asks.length) return;
  const a = asks.shift();
  if (a.kind === 'encounter' && (a.enc.army.gone || world.encounter !== a.enc)) return nextAsk();
  const box = $('prompt');
  const buttons = [];
  if (a.kind === 'news') {
    box.querySelector('h2').textContent = a.title;
    box.querySelector('p').textContent = a.text;
    buttons.push(['Good', () => {}]);
  } else if (a.kind === 'offer') {
    if (!a.house.alive) return nextAsk();
    box.querySelector('h2').textContent = a.title;
    box.querySelector('p').textContent = a.text;
    buttons.push(['Accept', () => { const r = a.accept(); if (r?.text) flash(r.text, true); }], ['Decline', () => a.decline()]);
  } else if (a.kind === 'alarm') {
    const p = a.poi;
    if (!p.town) return nextAsk();
    box.querySelector('h2').textContent = `${p.name} is under attack!`;
    box.querySelector('p').textContent = `Enemy soldiers are in the village. Your garrison will fight on its own if you stay away.`;
    buttons.push([`Go to ${p.name}`, () => enterTown(p)], ['Stay here', () => {}]);
  } else {
    const enc = a.enc, army = enc.army;
    const them = headcount(enc.defenders), us = headcount(army.units);
    const where = enc.poi ? enc.poi.name : 'the road';
    box.querySelector('h2').textContent = enc.kind === 'assault' ? `Attack ${enc.poi.name}?` : `Armies meet at ${where}`;
    box.querySelector('p').textContent = enc.kind === 'assault'
      ? `${army.name} (${us} men) stands before ${enc.poi.name}, held by ${ownerOf(enc.poi).name.toLowerCase()} with ${them} men.`
      : `${army.name} (${us} men) has met ${enc.enemy.name} (${them} men).`;
    buttons.push([enc.kind === 'assault' ? 'Storm it' : 'Fight it', () => {
      // A place is fought for in the place itself; armies on the road meet in the open.
      if (enc.kind === 'assault') { world.storm(enc); enterTown(enc.poi); } else startField(enc);
    }]);
    buttons.push(['Auto-resolve', () => {
      const won = world.autoResolve(enc);
      flash(won ? `Victory at ${where}.` : `Defeat at ${where}.`, won);
    }]);
    if (enc.kind === 'assault') buttons.push(['Pull back', () => world.pullBack(enc)]);
  }
  const row = box.querySelector('.row');
  row.innerHTML = '';
  for (const [text, fn] of buttons) {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.onclick = () => { box.classList.remove('open'); fn(); };
    row.append(btn);
  }
  box.classList.add('open');
}

function showResult(title, text, button, fn) {
  const box = $('result');
  box.querySelector('h2').textContent = title;
  box.querySelector('p').textContent = text;
  const btn = box.querySelector('button');
  btn.textContent = button;
  btn.onclick = () => { box.classList.remove('open'); fn(); };
  box.classList.add('open');
}

function flash(text, good = false) {
  const t = $('toast');
  t.textContent = text;
  t.classList.toggle('good', good);
  t.classList.add('show');
  clearTimeout(flash.timer);
  flash.timer = setTimeout(() => t.classList.remove('show'), 2200);
}

const blocked = () => $('prompt').classList.contains('open') || $('result').classList.contains('open') || $('help').classList.contains('open');

// ---- the world panel ----

let panelKey = null;
function worldPanel() {
  const el = $('wpanel'), it = selected;
  const own = it && (it.units ? it.side === 0 : it.owner === 0);
  const waitingAt = it && it.units && it.at && !it.path.length ? it.at : null;
  if (it?.house) return housePanel(el, it.house);
  const key = !it ? 'none' : it.units ? `a${it.id}:${!!waitingAt}:${it.retreating}` : `p${it.id}:${it.owner}:${!!it.town}`;
  if (key !== panelKey) {
    panelKey = key;
    if (!it) el.innerHTML = `<h3>Your realm</h3><p data-f="rank" class="status"></p><p data-f="realm"></p><p data-f="gold"></p><div class="houses" data-f="houses"></div><p class="note">Click a house to deal with its lord. Click a place or an army to select it; double-click one of your villages to go there.</p>`;
    else if (it.units) el.innerHTML = `<h3>${it.name}</h3><p data-f="men"></p><p data-f="units" class="units"></p><p class="status" data-f="status"></p>`
      + (own ? `<p class="note">Right-click a place to march there. Your own villages take the army in; any other place means a fight.</p>` : '')
      + (own && waitingAt?.town ? `<button data-act="garrison" class="wide">Enter ${waitingAt.name}</button>` : '');
    else el.innerHTML = `<h3>${ico(KINDS[it.kind].icon)} ${it.name}</h3><p data-f="owner"></p><p data-f="men"></p><p class="status" data-f="status"></p><p class="note">${KINDS[it.kind].name}: ${KINDS[it.kind].about}</p>`
      + (it.town ? `<div class="row"><button data-act="enter">Go to ${it.name}</button><button data-act="muster">Muster the garrison</button></div>`
        : `<p class="note">Select one of your armies, then right-click here to march on it.</p>`);
  }
  const set = (f, v) => { const e = el.querySelector(`[data-f="${f}"]`); if (e && e.dataset.was !== v) { e.dataset.was = v; e.innerHTML = v; } };
  if (!it) {
    const held = world.pois.filter(p => p.owner === 0);
    const men = held.reduce((n, p) => n + p.town.garrison().reduce((k, r) => k + r.alive, 0), 0)
      + world.armies.filter(a => a.side === 0).reduce((n, a) => n + headcount(a.units), 0);
    set('rank', `${world.rank} of ${world.home.owner === 0 ? world.home.name : 'nowhere'}`);
    set('realm', `${held.length} of ${world.pois.length} places held · ${men} soldiers`);
    const backing = FACTIONS.filter(h => world.dip[h.index]?.backs && h.alive).length;
    set('gold', `${ico('gold', '#e8c45a')} ${Math.floor(FACTIONS[0].gold)} gold${backing ? ` · ${ico('crown', '#e8c45a')} ${backing} house${backing > 1 ? 's' : ''} back your claim` : ''}`);
    const list = el.querySelector('[data-f="houses"]');
    const rows = FACTIONS.slice(1, world.bandits).map(h => {
      const met = world.knows(h.index), war = world.atWar(0, h.index);
      const n = world.pois.filter(p => p.seen && p.known?.owner === h.index).length;
      const d = world.dip[h.index];
      const tie = d.vassal ? 'your vassal' : d.married ? 'married' : d.allied ? 'allied' : war ? 'at war' : 'peace';
      return `<div class="h${h.alive ? "" : " gone"}${met && h.alive ? ' pick' : ''}" data-house="${h.index}"><i style="background:${met ? h.color : "#8a8478"}"></i><span>${met ? `${h.lord}` : 'An unknown house'}<br><small>${met ? `${h.name} · ${mood(d.opinion).toLowerCase()}` : 'not yet met'}</small></span><small class="${war ? 'war' : ''}">${!h.alive ? 'broken' : tie}</small></div>`;
    }).join('');
    if (list.dataset.html !== rows) { list.dataset.html = rows; list.innerHTML = rows; }
  } else if (it.units) {
    set('men', `${headcount(it.units)} men`);
    set('units', it.units.map(u => `${u.name}: ${u.count}`).join(' · '));
    set('status', it.retreating ? `Falling back to ${it.path.at(-1)?.name}` : it.halted ? 'In battle' : it.path.length ? `Marching to ${it.path.at(-1).name}` : waitingAt ? `Waiting at ${waitingAt.name}` : 'Waiting');
  } else {
    const who = it.visible ? it.owner : it.known?.owner;
    const whoText = !it.seen ? 'Unexplored' : who === null ? 'Free folk with their own militia' : who === 0 ? 'Yours' : `Held by ${FACTIONS[who].name}${world.atWar(0, who) ? ' (at war with you)' : ''}`;
    set('owner', whoText + (it.visible || !it.seen || who === 0 ? '' : ' (last seen)'));
    if (it.town) {
      set('men', `${it.town.population} villagers · ${it.town.garrison().reduce((n, r) => n + r.alive, 0)} soldiers`);
      set('status', it.town.underAttack ? `${ico('battle', '#ff8a5a')} Under attack!` : '');
    } else {
      set('men', !it.seen ? 'Send an army near to see it' : `About ${it.visible ? headcount(it.garrison) : it.known.men} men in the garrison`);
      set('status', it.seat !== undefined && it.seen ? `Seat of ${FACTIONS[it.seat].name}` : '');
    }
  }
}

// A rival lord: what they think of you, and what you can put to them.
function housePanel(el, h) {
  const d = world.dip[h.index], list = dipActions(world, h.index);
  const key = `h${h.index}:${list.map(a => a.id + a.ok).join()}:${d.married}${d.allied}${d.vassal}${d.backs}`;
  if (key !== panelKey) {
    panelKey = key;
    const initials = h.lord.split(' ').filter(w => /^[A-Z]/.test(w)).slice(-2).map(w => w[0]).join('');
    const ties = [d.vassal && 'Your vassal', d.married && 'Joined to you by marriage', d.allied && 'Your ally', d.backs && 'Backs your claim to the crown'].filter(Boolean);
    el.innerHTML = `<div class="lord"><div class="face" style="background:${h.color}"><img src="assets/art/portraits/${h.id}.png" alt="" onerror="this.replaceWith('${initials}')"></div>
      <div><h3 style="color:${h.color}">${h.lord}</h3><small>${h.name} · the ${h.trait}</small></div></div>
      <p class="note">${h.blurb}</p><p data-f="mood" class="status"></p><p data-f="state"></p>${ties.length ? `<p>${ties.join(' · ')}</p>` : ''}
      <div class="dip">${list.map(a => `<button data-dip="${a.id}" class="wide${a.warn ? ' warn' : ''}" ${a.ok ? '' : 'disabled'} title="${a.ok ? '' : a.why}">${a.label}${a.ok ? '' : `<small>${a.why}</small>`}</button>`).join('')}</div>
      <button data-act="back" class="wide">Back to your realm</button>`;
  }
  const set = (f, v) => { const e = el.querySelector(`[data-f="${f}"]`); if (e && e.dataset.was !== v) { e.dataset.was = v; e.innerHTML = v; } };
  set('mood', `${mood(d.opinion)} toward you (${Math.round(d.opinion)})`);
  const n = world.pois.filter(p => p.owner === h.index).length;
  set('state', `${world.atWar(0, h.index) ? 'At war with you' : world.time < d.truceUntil && d.truceUntil < Infinity ? `Truce for ${clock(d.truceUntil - world.time)}` : 'At peace'} · ${n} places · ${ico('gold', '#e8c45a')} ${Math.floor(h.gold)}`);
}

$('wpanel').onclick = e => {
  const row = e.target.closest('[data-house]');
  if (row && row.classList.contains('pick')) { selected = { house: FACTIONS[+row.dataset.house] }; return; }
  const dip = e.target.closest('[data-dip]');
  if (dip && !dip.disabled) {
    const r = dipAct(world, selected.house.index, dip.dataset.dip);
    if (r.text) flash(r.text, r.ok);
    panelKey = null;
    return;
  }
  const act = e.target.closest('[data-act]')?.dataset.act;
  const it = selected;
  if (act === 'back') { selected = null; return; }
  if (act === 'enter') enterTown(it);
  if (act === 'muster') {
    const regs = it.town.garrison().filter(r => !r.routing && !r.regrouping);
    const a = regs.length ? world.muster(it, regs) : null;
    if (a) selected = a; else flash('Nobody fit to march.');
  }
  if (act === 'garrison' && it.at?.town) world.enterTown(it, it.at, it.last);
};

// ---- top bar ----

$('pause').onclick = () => { paused = !paused; };
for (const b of document.querySelectorAll('[data-speed]')) b.onclick = () => { speed = +b.dataset.speed; paused = false; };
$('help-toggle').onclick = () => $('help').classList.toggle('open');
$('help-close').onclick = () => { $('help').classList.remove('open'); paused = false; };
$('to-world').onclick = () => showWorld();
$('march').onclick = () => {
  const regs = [...current.controls.selection];
  const a = world.muster(current.poi, regs);
  if (!a) return;
  const p = current.poi;
  showWorld();
  selected = a;
  worldControls.lookAt(p);
};
$('retreat').onclick = () => { current.retreated = true; endField(false); };
addEventListener('keydown', e => {
  if (e.key.toLowerCase() === 'm' && mode === 'town') showWorld();
});

let seenWorld = 0;
function worldLog() {
  const logEl = $('log');
  while (seenWorld < world.events.length) {
    const ev = world.events[seenWorld++];
    const line = document.createElement('div');
    line.textContent = ev.text;
    line.className = ev.side === 0 ? 'good' : 'bad';
    logEl.prepend(line);
    while (logEl.children.length > 4) logEl.lastChild.remove();
    setTimeout(() => line.classList.add('fade'), 7000);
    setTimeout(() => line.remove(), 8000);
  }
}

function topBar() {
  $('place').textContent = mode === 'world' ? 'World map' : mode === 'town' ? current.poi.name : $('field-title').textContent;
  if (mode === 'world') {
    $('clock').textContent = clock(world.time);
    $('pause').textContent = paused ? '▶ Resume' : '❚❚ Pause';
    document.body.classList.toggle('paused', paused);
    for (const btn of document.querySelectorAll('[data-speed]')) btn.classList.toggle('on', +btn.dataset.speed === speed);
    const foes = world.armies.filter(a => a.side !== 0 && a.visible && !a.retreating && a.mode !== 'column' && world.atWar(0, a.side));
    { const html = foes.length ? `${ico('warning', '#ffb05a')} ${foes.map(a => `${a.name} (${headcount(a.units)})`).join(', ')} on the march` : ''; if ($('strength').dataset.was !== html) { $('strength').dataset.was = html; $('strength').innerHTML = html; } }
  }
  if (mode === 'town') $('clock').textContent = clock(world.time);
  const n = mode === 'town' ? current.controls.selection.size : 0;
  $('march').hidden = !n;
  $('march').textContent = `March out with ${n} regiment${n === 1 ? '' : 's'}`;
}

// ---- the loop ----

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  nextAsk();
  if (!paused && !blocked()) {
    let left = dt * speed;
    while (left > 1e-4) {
      const h = Math.min(0.05, left);
      if (mode === 'field') {
        const b = current;
        b.battle.step(h);
        b.aiClock -= h;
        if (b.aiClock <= 0) { b.aiClock = 1; thinkAI(b.battle, 1, { hold: b.assault }); }
        if (b.battle.winner !== null && !b.endAt) b.endAt = b.battle.time + 2.5;
        if (b.endAt && b.battle.time > b.endAt) { endField(b.battle.winner === 0); break; }
      } else {
        world.update(h);
      }
      left -= h;
      if (blocked() || asks.length) break;
    }
  }
  if (selected?.gone) selected = null;
  const cam = stage.camera;
  if (mode === 'world') {
    worldControls.update(dt);
    stage.placeSun(worldControls.cam, worldView.heightAt, 700);
    worldView.update(cam, selected?.house ? null : selected);
    worldPanel();
  } else {
    const b = current;
    b.controls.update(dt);
    stage.placeSun(b.controls.cam, b.heightAt);
    b.view.update(b.controls.selection);
    hud.update(b.controls.selection, paused, speed);
    if (mode === 'town') {
      const st = b.st;
      if (st.selected?.removed) st.selected = null;
      b.townView.update(st.selected);
      b.townView.showGhost(st.placing, st.hoverAt, st.placing && st.hoverAt && b.town.canPlace(st.placing, st.hoverAt.x, st.hoverAt.z).ok);
      townHud.update(st.selected, [...b.controls.selection], st.placing);
    }
  }
  topBar();
  worldLog();
  stage.renderer.render(stage.current(), cam);
  requestAnimationFrame(frame);
}

setMode('world', null);
worldControls.lookAt(world.byId.ashford);
requestAnimationFrame(frame);

window.game = { world, worldView, worldControls, bundles, stage, seed, get mode() { return mode; }, get current() { return current; }, enterTown, showWorld, startField };
