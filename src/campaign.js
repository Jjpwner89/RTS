// The campaign: one world map, and a zoom into any place on it. Your villages are the
// full village game; meetings on the road and attacks on other places become field
// battles you fight (or auto-resolve). URL option: ?seed=123 for a fixed map.
import { createStage } from './stage.js';
import { TownLabels } from './townlabels.js';
import { RoadView, placeRoad } from './roadview.js';
import { makeHeight, drawGround, plantTrees, drawTrees, HOMES } from './terrain.js';
import { Battle, TYPES } from './battle.js';
import { BattleView, keepModel } from './view.js';
import { Controls } from './controls.js';
import { Hud } from './hud.js';
import { TownView } from './townview.js';
import { TownHud } from './townhud.js';
import { thinkAI, unwatched } from './ai.js';
import { attachSiege } from './siegeui.js';
import { SiegeView } from './siegeview.js';
import { addCopses, makeRiver, carveRiver, pickWeather } from './battlefield.js';
import { landMask, drawCover } from './scenery.js';
import { FieldView } from './fieldview.js';
import { rng } from './noise.js';
import { World, headcount, ownerOf, FACTIONS } from './world/world.js';
import { fedAt, foodLeft, wagonFrom, sendWagon, cartsNear, escort, runCheck, sendRun, loadText, spareFood, CARRY } from './world/supply.js';
import { worksAt, startWork, WORKS } from './world/works.js';
import { WARES, buyCheck, buy, isMarket, priceAt, elitePay } from './world/treasury.js';
import { stageOf } from './world/rivals.js';
import { DECREES, decreeCheck, toggleDecree, canDecree } from './world/decrees.js';
import { canSave, saveGame, readSave, loadGame, clearSave } from './world/save.js';
import { KINDS } from './world/realm.js';
import { BUILDINGS, TEMPLATES, carry } from './economy.js';
const ghostKind = k => k === 'road' ? null : k?.startsWith('tpl:') ? TEMPLATES[k.slice(4)].list[0] : k;
import { worth, FOCUS_NAMES, WEALTH, builtCount } from './world/holdings.js';
import { offer, wage, fullWage, hire as hireCompany, release } from './world/companies.js';
import { vassalOf, holdingsOf, living, prisoners, opinion, DUES, LEVIES, TEMPERS, WANTS, GIFT, RECONCILE, moodWord, moodColor } from './world/vassals.js';
import { GOALS, updateGoals } from './world/goals.js';
import { alerts, LEVEL_COLOR } from './world/alerts.js';
import { captainOf, lordName, ride, afterBattle, captainLine, captainMemory } from './world/captains.js';
import { ico } from './icons.js';
import { actions as dipActions, act as dipAct, mood, grudgeLines } from './world/diplomacy.js';
import { WorldView } from './world/worldview.js';
import { WorldControls } from './world/worldcontrols.js';
import * as THREE from 'three';
import { LOD } from './models.js';
import { audio } from './audio.js';

const params = new URLSearchParams(location.search);
// ?continue picks up the saved campaign; otherwise a new one, on ?seed= if given.
const loaded = params.has('continue') ? readSave() : null;
const seed = loaded ? loaded.seed : +params.get('seed') || Math.floor(Math.random() * 1e6);

const canvas = document.getElementById('view');
const stage = createStage(canvas);
const labels = new TownLabels(canvas);
const $ = id => document.getElementById(id);
const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

let paused = true, speed = 1;
let mode = 'world', current = null;     // current: the village or battle on screen
let selected = null;                    // on the world map: an army or a place
let hud = null, townHud = null;
const asks = [];                        // decisions waiting for the player, oldest first
const bundles = new Map();              // place → its drawn village, made on first visit

const hooks = {
  watching: () => (mode === 'town' ? current.poi : null),
  ask: enc => { asks.push({ kind: 'encounter', enc }); },
  townAttacked: p => { audio.play('horn'); if (!(mode === 'town' && current.poi === p)) asks.push({ kind: 'alarm', poi: p }); }, // audio: horn
  fell: p => {
    if (mode === 'town' && current.poi === p) showWorld();
    dropBundle(p);
  },
  captured: () => {},
  granted: p => {
    if (mode === 'town' && current.poi === p) showWorld();
    dropBundle(p);
    selected = p;
  },
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
  ended: winner => {
    audio.setMood(winner === 0 ? 'victory' : 'defeat'); if (winner === 0) audio.play('bells'); // audio
    if (winner !== 0 && world.options.ironman) clearSave();   // ironman: a lost campaign is gone
    if (winner !== 0) return showResult('Defeat', world.part === 2 ? 'The north has taken all you built. The realm is theirs.' : 'Your last village has fallen.', 'New campaign', () => location.reload(), true);
    if (world.part === 2) return showResult('The north is broken', 'The host of Norrhold is driven back through its gate, and the realm is safe in your hands. Long live the king.', 'New campaign', () => location.reload(), true);
    // Crowned: the end of Part 1. The victory card breaks, and the wall with it.
    const how = world.victory === 'acclaim' ? 'Every great house names you king.' : 'Kingsbridge is yours and the realm kneels.';
    showResult('You are crowned', `${how} Long live the king.`, 'Continue', () => crownedThenNorth(), true);
  },
  herald: msg => herald(msg),
  rankUp: () => { audio.play('drums'); setTimeout(() => audio.play('horn'), 900); },
  sound: name => audio.play(name), // audio: realm news from the world files
  offer: o => asks.push({ kind: 'offer', ...o }),
  choice: ev => { audio.play('scroll'); asks.push({ kind: 'choice', ev }); }, // audio
};
const world = loaded ? loadGame(loaded, hooks) : new World(seed, hooks, { size: params.get('size') || 'normal', aggression: params.get('aggression') || 'normal', ironman: params.get('ironman') === '1' });

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

let worldView = new WorldView(stage, world);
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

// look: a vassal's village to look round (world.viewTown), not kept between visits.
function townBundle(p, look = null) {
  const old = !look && bundles.get(p);
  if (old && old.town === p.town) return old;
  if (old) dropBundle(p);
  const town = look ? look.town : p.town, heightAt = look ? look.heightAt : p.heightAt;
  const scene = stage.newScene();
  // Its roads run out from the keep toward the places they lead to (scenery.js).
  const trees = look ? look.trees : p.trees;
  const land = landMask(p.seed, { homes: [{ x: 0, z: 0 }], roads: (p.roadAngles || []).map(a => ({ pts: [[0, 0], [Math.sin(a) * 400, Math.cos(a) * 400]], width: 6 })), wear: [{ x: 0, z: 0, r: 24 }] });
  drawGround(scene, heightAt, p.seed, { land });
  drawTrees(scene, heightAt, trees);
  drawCover(scene, heightAt, p.seed, { land, trees, avoid: (x, z) => Math.hypot(x, z) < 16 });
  const view = new BattleView(scene, town.battle, heightAt, { capacity: 400, keeps: false });
  const townView = new TownView(scene, town, heightAt, rng(p.seed + 11));
  const st = { placing: null, hoverAt: null, selected: null, roadFrom: null };
  const b = { kind: 'town', poi: p, town, scene, view, townView, roadView: new RoadView(scene, town, heightAt), st, heightAt, look: !!look,
    title: look ? `${p.name} · ${town.readOnly.name}'s village` : null };
  b.hooks = {
    togglePause: () => { paused = !paused; },
    setSpeed: s => { speed = s; paused = false; },
    selectionChanged: sel => { if (sel && sel.size) st.selected = null; },
    selectCard: (r, add) => b.controls.setSelection([r], add),
    focus: r => b.controls.focus([r]),
    startPlacing: kind => { if (look) return; st.placing = kind; st.roadFrom = null; st.selected = null; b.controls.setSelection([]); },
    pullBack: () => world.endStorm(p, true),
    templates: () => world.rank !== 'Reeve',
    companies: () => (world.companies || []).map(c => {
      const o = offer(world, c, 0), boss = c.employer !== null && c.employer !== undefined ? FACTIONS[c.employer] : null;
      const where = world.byId[c.home]?.name;
      return { id: c.id, name: c.name, size: c.size, unit: TYPES[c.key].name.toLowerCase(), wage: c.employer === 0 ? wage(c) : fullWage(c), ok: o.ok, why: o.why,
        status: c.employer === 0 ? 'in your service' : o.ok ? `${o.price} gold${o.outbid ? ` (outbid ${boss.name})` : ''}${where ? ` · at ${where}` : ''}` : o.why };
    }),
    hireCompany: id => { const c = world.companies.find(o => o.id === id); return hireCompany(world, c, 0, p); },
    companyOf: r => { const c = (world.companies || []).find(c => c.employer === 0 && c.name === r.name); return c && { ...c, wage: wage(c) }; },
    dismissCompany: r => { const c = (world.companies || []).find(o => o.employer === 0 && o.name === r.name); if (c) release(world, c, 'dismissed'); },
    findAttackers: () => b.controls.focus(town.attackers.flatMap(g => g.regs).filter(r => !r.gone && !r.routing)),
    place: (g, e) => {
      if (!st.placing) return false;
      if (town.hostile) { st.placing = null; return true; }
      if (!g) return true;
      if (st.placing === 'road') { placeRoad(town, st, g, e, townHud); return true; }
      const res = st.placing.startsWith('tpl:') ? town.placeTemplate(st.placing.slice(4), g.x, g.z) : town.place(st.placing, g.x, g.z);
      if (res.ok && res.of) townHud.flash(res.placed < res.of ? `Laid out ${res.placed} of ${res.of}: no room for the rest` : 'Laid out');
      // The same building stays in hand, to place several; right-click or Esc ends it.
      if (!res.ok) townHud.flash(res.reason);
      return true;
    },
    cancelPlacement: () => { if (!st.placing) return false; if (st.roadFrom) { st.roadFrom = null; return true; } st.placing = null; return true; },
    hover: g => { st.hoverAt = g; },
    pickBuilding: g => { st.selected = g ? townView.buildingAt(g) : null; return !!st.selected; },
    deselect: () => { st.selected = null; b.controls.setSelection([]); },
    selectRegiment: r => { st.selected = null; b.controls.setSelection([r]); },
    moraleLabel: r => town.battle.moraleLabel(r),
  };
  b.controls = new Controls(stage.camera, canvas, town.battle, view, heightAt, b.hooks);
  b.controls.enabled = false;
  Object.assign(b.controls.cam, { x: 0, z: 40, dist: 120 });
  // Storming: start over your own men on the ground they form up on, looking in at the keep.
  if (town.hostile) { const a = town.hostile.entry; Object.assign(b.controls.cam, { x: Math.sin(a) * 115, z: Math.cos(a) * 115, dist: 170, yaw: a }); }
  b.hooks.cancelOtherPlacing = () => { st.placing = null; };
  attachSiege(b, { scene, town, heightAt, flash: t => townHud.flash(t) });      // walls and engines (sets b.siege)
  if (!look) bundles.set(p, b);
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
  if (!p.town && p.vassal && p.owner === 0) return visitVassal(p);
  if (!p.town) { selected = p; return; }
  setMode('town', townBundle(p));
}

// A vassal's village, to look round but not to run.
function visitVassal(p) {
  const look = world.viewTown(p);
  if (!look) { selected = p; return; }
  setMode('town', townBundle(p, look));
  townHud.flash(`${look.town.readOnly.name} holds ${p.name}: you may look round, but it is his to run.`);
}

function showWorld() { setMode('world', null); }

// ---- the first goals ----
// A short list in the corner of the map, the next step lit; finishing one says so wherever you are.
const goalSeen = { visited: !!loaded };
let goalsShown = -1;
$('goals').onclick = () => { $('goals').classList.toggle('folded'); goalsShown = -1; };
function goals() {
  if (mode === 'town') goalSeen.visited = true;
  for (const g of updateGoals(world, goalSeen)) {
    const next = GOALS[world.goals];
    world.log(`Goal done: ${g.text.split(':')[0].replace(/\.$/, '')}.${next ? ` Next: ${next.text[0].toLowerCase()}${next.text.slice(1)}` : ''}`);
  }
  const key = world.goals + ':' + world.part + ':' + FACTIONS.some(h => h.index && h.ai?.stage);
  if (goalsShown === key) return;
  goalsShown = key;
  const el = $('goals');
  el.hidden = world.goals >= GOALS.length || world.part === 2;
  el.innerHTML = `<h4>Goals <small>${world.goals} of ${GOALS.length} · click for ${el.classList.contains('folded') ? 'all' : 'less'}</small></h4>` + GOALS.map((g, i) =>
    `<div class="${i < world.goals ? 'done' : i === world.goals ? 'now' : 'later'}">${i < world.goals ? '✓' : i === world.goals ? '▸' : '·'} ${g.text}${i === world.goals && g.tip ? `<small>${typeof g.tip === 'function' ? g.tip(world) : g.tip}</small>` : ''}</div>`).join('');
}

function setMode(m, b) {
  if (current?.controls) current.controls.enabled = false;
  if (current?.look && current !== b) stage.dispose(current.scene);
  mode = m;
  current = b;
  worldControls.enabled = m === 'world';
  worldView.hideLabels(m !== 'world');
  document.body.className = `campaign mode-${m}${b?.look ? ' readonly' : ''}`;
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
    const gear = carry(u);
    const r = Object.assign(battle.addRegiment(side, u.key, cx + cos * lx - sin * back, cz - sin * lx - cos * back, angle, { count: u.count, name: u.name, xp: u.xp || 0, ...gear }), gear);
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

// Lord Hal Dunmore, a hothead, calls out your champion when his host meets yours in the
// open: always when he is outnumbered, and then to settle the battle; otherwise one time
// in two, for honour.
function hotheadChallenge(enc) {
  const e = enc.enemy, H = e && FACTIONS[e.side];
  if (!H?.alive || H.trait !== 'hothead') return null;
  const odds = headcount(e.units) / Math.max(1, headcount(enc.army.units));
  if (odds < 0.75) return { name: H.lord, level: 4, decides: true };
  return world.rand() < 0.5 ? { name: H.lord, level: 4, decides: false } : null;
}
function issueChallenge(b) {
  if (!b.challenge || b.battle.deploying || b.battle.time < 4) return;
  const { decides, ...champion } = b.challenge;
  b.challenge = null;
  b.battle.challenge(1, champion, { decides });
}

// Captains and lords take the field with their armies (world/captains.js): the captain
// with the biggest foot regiment, the lord with the next.
function leaders(battle, side, army) {
  if (!army) return;
  const regs = battle.regs.filter(r => r.side === side && !r.T.range && !r.T.engine).sort((x, y) => y.alive - x.alive);
  const reg = regs[0] || battle.regs.find(r => r.side === side);
  const c = captainOf(world, army);
  if (c) battle.setCaptain(side, c, reg);
  if (army.lord !== null && army.lord !== undefined) battle.setLord(side, { name: lordName(world, army.lord), alive: true }, regs[1] || reg);
}

function startField(enc, { watch = true } = {}) {
  const fseed = seed + 50000 + Math.floor(world.time * 7);
  const assault = enc.kind === 'assault';
  const keepAt = { x: 0, z: -150 };
  const river = makeRiver(fseed, { chance: 0.4 });       // sometimes a river to cross (battlefield.js)
  const heightAt = carveRiver(makeHeight(fseed, assault ? [keepAt, HOMES[0]] : HOMES), river);
  const scene = stage.newScene();
  const homes = [{ x: 0, z: 240 }, assault ? keepAt : { x: 0, z: -240 }];
  const land = landMask(fseed, { homes, river, fields: true });
  drawGround(scene, heightAt, fseed, { land });
  const wet = (x, z) => river && Math.abs(river.across(x, z)) < river.half + 3;
  const trees = plantTrees(fseed, (x, z) => (Math.abs(x) < 120 && Math.abs(z) < 250) || (assault && Math.hypot(x - keepAt.x, z - keepAt.z) < 60) || wet(x, z), 0.56, 900);
  addCopses(trees, fseed, { avoid: (x, z) => (assault && Math.hypot(x - keepAt.x, z - keepAt.z) < 60) || wet(x, z) });   // woods to hide in (battlefield.js)
  drawTrees(scene, heightAt, trees);
  drawCover(scene, heightAt, fseed, { land, trees, avoid: (x, z) => (river && Math.abs(river.across(x, z)) < river.half + 1.5) || (assault && Math.hypot(x - keepAt.x, z - keepAt.z) < 30) });
  // You come from the south; defenders of a place run back to its keep, others leave the field.
  const battle = new Battle(heightAt, fseed, { deploy: false, homes: [{ x: 0, z: 240 }, assault ? keepAt : { x: 0, z: -240 }], disbandAtHome: [true, !assault] });
  battle.setWoods(trees);
  battle.setRiver(river);
  deploy(battle, 0, enc.army.units, 0, 95, Math.PI);
  deploy(battle, 1, enc.defenders, 0, assault ? -95 : -95, 0);
  leaders(battle, 0, enc.army);
  leaders(battle, 1, enc.enemy);
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
  b.controls.enabled = watch;
  Object.assign(b.controls.cam, { x: 0, z: 135, dist: 105, yaw: 0 });
  battle.step(0.001);
  battle.setWeather(pickWeather(fseed));   // clear, rain or fog (battlefield.js)
  b.challenge = hotheadChallenge(enc);
  b.title = assault ? `Battle for ${enc.poi.name}` : `Battle at ${enc.poi ? enc.poi.name : 'the road'}`;
  if (!watch) return b;
  battle.startDeployment(0);        // place the army before the fight (battle.js)
  $('field-title').textContent = b.title;
  setMode('field', b);
  return b;
}

// ---- fights left to the captain ----
// A battle on the road you don't watch is still fought for real, by both captains in
// ai.js's unwatched(), three times as fast as the world goes. One at a time (the world
// holds other meetings back meanwhile). You can take command of it at any moment.
let away = null;   // { b, run }
const standing = (battle, side) => battle.regs.filter(r => r.side === side && !r.gone && !r.routing).reduce((n, r) => n + r.alive, 0);

function leaveToCaptain(enc) {
  const b = startField(enc, { watch: false });
  away = { b, run: unwatched(b.battle) };
  world.log(`${enc.army.name} gives battle to ${enc.enemy.name}; its captain commands.`);
}

function stepAway(dt) {
  if (!away) return;
  const { b, run } = away, bt = b.battle;
  issueChallenge(b);
  // A captain won't stake a battle he is winning on one man; any other challenge he takes up.
  if (bt.duelOffer?.decides && standing(bt, 0) > standing(bt, 1)) bt.refuseDuel();
  // Battle time owed runs ahead of the world's; each run() slice may overshoot a little,
  // and the next frames wait for the debt to catch up.
  away.goal = (away.goal ?? bt.time) + dt * 3;
  const t0 = performance.now();
  let done = bt.winner !== null;
  while (!done && bt.time < away.goal && performance.now() - t0 < 8) done = run.run(1);
  if (done) finishAway();
}

// A live picture of the captain's fight in the bottom-right corner while you are elsewhere;
// click it to take command. Drawn into a corner of the same canvas after the main view.
const awayCam = new THREE.PerspectiveCamera(45, 1.6, 1, 2000);
const CORNER = { w: 340, h: 200, pad: 16 };
function renderAway() {
  const box = $('corner');
  if (!away || mode === 'field') { box.hidden = true; return; }
  const b = away.b, bt = b.battle, r = stage.renderer;
  const live = bt.regs.filter(g => !g.gone && g.alive > 0);
  if (!live.length) return;
  const n = live.reduce((k, g) => k + g.alive, 0);
  const cx = live.reduce((k, g) => k + g.cx * g.alive, 0) / n, cz = live.reduce((k, g) => k + g.cz * g.alive, 0) / n;
  const y = b.heightAt(cx, cz);
  // Close enough to see the regiments: as far back as the fighting is spread out.
  const spread = Math.max(...live.map(g => Math.hypot(g.cx - cx, g.cz - cz)));
  const d = Math.max(40, Math.min(140, spread * 0.95));
  awayCam.position.set(cx + d * 0.25, y + d * 0.75, cz + d);
  awayCam.lookAt(cx, y, cz);
  awayCam.aspect = CORNER.w / CORNER.h;
  awayCam.updateProjectionMatrix();
  const was = LOD.camera;
  LOD.camera = awayCam;
  b.view.update(new Set());
  LOD.camera = was;
  const W = innerWidth, x = W - CORNER.w - CORNER.pad, yb = CORNER.pad;
  r.setScissorTest(true);
  r.setScissor(x, yb, CORNER.w, CORNER.h);
  r.setViewport(x, yb, CORNER.w, CORNER.h);
  r.render(b.scene, awayCam);
  r.setScissorTest(false);
  r.setViewport(0, 0, W, innerHeight);
  box.hidden = false;
  const text = `${b.enc.army.name} against ${b.enc.enemy.name}: ${standing(bt, 0)} to ${standing(bt, 1)} · click to take command`;
  if (box.dataset.text !== text) { box.dataset.text = text; box.querySelector('span').textContent = text; }
}
$('corner').onclick = () => { if (away) takeCommand(); };

function finishAway() {
  const b = away.b, bt = b.battle;
  away = null;
  b.done = true;
  const won = bt.winner !== null ? bt.winner === 0 : standing(bt, 0) > standing(bt, 1);
  const where = b.enc.poi ? b.enc.poi.name : 'the road';
  const mine = survivors(bt, 0), theirs = survivors(bt, 1);
  afterBattle(world, bt, [b.enc.army, b.enc.enemy], b.enc.poi?.name, won);
  world.settle(b.enc, won, mine, theirs);
  flash(`${won ? 'Victory' : 'Defeat'} at ${where}: you lost ${bt.losses[0]}, they lost ${bt.losses[1]}.`, won);
  stage.dispose(b.scene);
}

function takeCommand() {
  if (!away) return;
  const { b } = away;
  away = null;
  $('field-title').textContent = b.title;
  setMode('field', b);
}

const alive = r => r.soldiers.filter(s => s.alive && !s.captain).length;   // captains and lords are not men of the ranks
// Survivors keep the experience they earned (battle.js veterans): xp on each unit.
const survivors = (battle, side) => {
  const xp = new Map(battle.veterans(side).map(v => [v.reg, v.xp]));
  return battle.regs.filter(r => r.side === side)
    .map(r => ({ ...r.spec, ...carry(r), battles: (r.battles || 0) + 1, count: alive(r), xp: xp.get(r) ?? r.spec?.xp ?? 0 })).filter(u => u.count >= 3);
};

function endField(won) {
  const b = current;
  if (b.done) return;
  b.done = true;
  const mine = survivors(b.battle, 0), theirs = survivors(b.battle, 1);
  const lost = [0, 1].map(s => b.battle.losses[s]);
  afterBattle(world, b.battle, [b.enc.army, b.enc.enemy], b.enc.poi?.name, won);
  world.settle(b.enc, won, mine, theirs);
  showResult(won ? 'Victory' : b.retreated ? 'Retreat' : 'Defeat',
    `Your losses: ${lost[0]} · Enemy losses: ${lost[1]}`, 'Back to the map', () => {
      stage.dispose(b.scene);
      showWorld();
    });
}

// ---- the chronicle ----
// The campaign as a book: a chapter a year (twenty minutes of play), a season to each
// five minutes, and what the chronicler wrote down (world.chron).
const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'], YEAR = 1200;
const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
function openChronicle() {
  const box = $('book'), years = new Map();
  for (const e of world.chronicle || []) {
    const y = Math.floor(e.at / YEAR);
    if (!years.has(y)) years.set(y, []);
    years.get(y).push(e);
  }
  const esc = t => t.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  box.querySelector('.pages').innerHTML = years.size ? [...years].map(([y, list]) => `<h4>The ${ORDINALS[y] || `${y + 1}th`} year</h4>`
    + list.map(e => `<p><b>${SEASONS[Math.floor((e.at % YEAR) / (YEAR / 4))]}.</b> ${esc(e.text)}</p>`).join('')).join('')
    : `<p>Nothing worth the ink yet. Your story begins in ${esc(world.home.name)}.</p>`;
  box.querySelector('button').onclick = () => box.classList.remove('open');
  box.classList.add('open');
  const pages = box.querySelector('.pages');
  pages.scrollTop = pages.scrollHeight;
}

// ---- prompts ----

// News, events and houses' proposals wait while you command a fight; alarms and
// encounters on the road do not.
const fighting = () => mode === 'town' && !current?.look && !!(current?.town?.underAttack || current?.town?.hostile);
const WAITS = new Set(['choice', 'offer', 'news']);

// A walled place, and an army with nothing to climb or break the walls with.
function bareHanded(enc) {
  const p = enc.poi, walls = p.eco?.walls;
  const walled = p.mem ? p.mem.pieces.length > 0 : walls ? walls !== 'none' : ['castle', 'crown', 'pass', 'warcamp'].includes(p.kind) || p.seat !== undefined;
  return walled && !enc.army.units.some(u => TYPES[u.key]?.engine);
}

function nextAsk() {
  if (mode === 'field' || $('prompt').classList.contains('open') || $('result').classList.contains('open') || !asks.length) return;
  const i = fighting() ? asks.findIndex(a => !WAITS.has(a.kind)) : 0;
  if (i < 0) return;
  const a = asks.splice(i, 1)[0];
  if (a.kind === 'encounter' && (a.enc.army.gone || world.encounter !== a.enc)) return nextAsk();
  const box = $('prompt');
  const buttons = [];
  const pic = box.querySelector('img');
  pic.hidden = true;
  if (a.kind === 'choice') {
    const ev = a.ev;
    if (ev.at.owner !== 0 || !ev.at.town) { ev.choices.at(-1).run(); return nextAsk(); }
    box.querySelector('h2').textContent = ev.title;
    box.querySelector('p').textContent = ev.text;
    pic.onload = () => { pic.hidden = false; };
    pic.onerror = () => { pic.hidden = true; };
    if (pic.src.endsWith(ev.image) && pic.complete) pic.hidden = !pic.naturalWidth;
    else pic.src = ev.image;
    for (const c of ev.choices) buttons.push([c.label, () => { const r = c.run(); if (r) flash(r, true); }, !c.ok]);
  } else if (a.kind === 'news') {
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
    // The nearest army of yours free to march can be sent to relieve it.
    const help = world.armies.filter(a => a.side === 0 && !a.gone && !a.wagon && !a.halted && !a.retreating)
      .map(a => [a, world.route(a.at || a.last, p).length + Math.hypot(a.x - (a.at || a.last).x, a.z - (a.at || a.last).z)])
      .filter(([, d]) => Number.isFinite(d)).sort((x, y) => x[1] - y[1])[0]?.[0];
    box.querySelector('p').textContent = `Enemy soldiers are in the village. Your garrison will fight on its own if you stay away.`
      + (help ? ` ${help.name} (${headcount(help.units)} men) could march to its relief.` : '');
    buttons.push([`Go to ${p.name}`, () => enterTown(p)]);
    if (help) buttons.push([`Send ${help.name}`, () => { if (world.order(help, p)) { selected = help; flash(`${help.name} marches to relieve ${p.name}.`, true); } }]);
    buttons.push(['Stay here', () => {}]);
  } else {
    const enc = a.enc, army = enc.army;
    const them = headcount(enc.defenders), us = headcount(army.units);
    const where = enc.poi ? enc.poi.name : 'the road';
    box.querySelector('h2').textContent = enc.kind === 'assault' ? `Attack ${enc.poi.name}?` : `Armies meet at ${where}`;
    box.querySelector('p').textContent = enc.kind === 'assault'
      ? `${army.name} (${us} men) stands before ${enc.poi.name}, held by ${ownerOf(enc.poi).name.toLowerCase()} with ${them} men.${bareHanded(enc) ? ' It is walled, and you bring no ladders, ram or engines: storming it by hand will cost you dearly.' : ''}`
      : `${army.name} (${us} men) has met ${enc.enemy.name} (${them} men).`;
    buttons.push([enc.kind === 'assault' ? 'Storm it' : 'Fight it', () => {
      // A place is fought for in the place itself; armies on the road meet in the open.
      if (enc.kind === 'assault') { world.storm(enc); enterTown(enc.poi); } else startField(enc);
    }]);
    if (enc.kind !== 'assault' && !away) buttons.push(['Leave it to the captain', () => leaveToCaptain(enc)]);
    buttons.push(['Auto-resolve', () => {
      const won = world.autoResolve(enc);
      flash(won ? `Victory at ${where}.` : `Defeat at ${where}.`, won);
    }]);
    if (enc.kind === 'assault') {
      buttons.push(['Starve them out', () => world.blockade(enc)]);
      if (enc.poi.eco) buttons.push(['Burn the fields', () => world.burnFields(enc)]);
      buttons.push(['Pull back', () => world.pullBack(enc)]);
    }
  }
  const row = box.querySelector('.row');
  row.innerHTML = '';
  for (const [text, fn, off] of buttons) {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.disabled = !!off;
    btn.onclick = () => { box.classList.remove('open'); fn(); };
    row.append(btn);
  }
  box.classList.add('open');
}

// ---- Part 2: the victory shatters ----

// The crowned screen breaks into shards that fall away; behind it, the wall is down and
// the land beyond it is on the map.
function crownedThenNorth() {
  const shot = snapshot('You are crowned', 'Long live the king.');
  if (mode !== 'world') showWorld();
  world.beginPart2();
  audio.play('collapse'); // audio: the wall falls
  const old = worldView;
  worldView = new WorldView(stage, world);
  worldControls.view = worldView;
  stage.use(worldView.scene);
  stage.dispose(old.scene);
  const b = world.wall.breaches[0];
  if (b) Object.assign(worldControls.cam, { x: b.x, z: b.z + 220, dist: 760 });
  selected = null;
  panelKey = null;
  paused = false;
  shatter(shot);
}

// This frame of the map with the crowned card drawn over it, as an image.
function snapshot(title, text) {
  stage.renderer.render(stage.current(), stage.camera);
  const src = stage.renderer.domElement, c = document.createElement('canvas');
  c.width = innerWidth; c.height = innerHeight;
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0, c.width, c.height);
  const w = Math.min(460, c.width - 40), h = 150, x = (c.width - w) / 2, y = c.height / 2 - h / 2;
  g.fillStyle = 'rgba(28, 23, 18, 0.94)'; g.strokeStyle = '#e0c27a'; g.lineWidth = 2;
  g.beginPath(); g.roundRect(x, y, w, h, 12); g.fill(); g.stroke();
  g.textAlign = 'center'; g.fillStyle = '#f2d98a'; g.font = '600 30px system-ui, sans-serif';
  g.fillText(title, c.width / 2, y + 62);
  g.fillStyle = '#e8dcc0'; g.font = '16px system-ui, sans-serif';
  g.fillText(text, c.width / 2, y + 100);
  return c.toDataURL();
}

function shatter(url) {
  const box = document.createElement('div');
  box.id = 'shatter';
  document.body.append(box);
  const cols = 8, rows = 6, jit = () => (Math.random() - 0.5) * 0.7;
  const pt = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
    const edge = i === 0 || j === 0 || i === cols || j === rows;
    pt.push({ x: (i + (edge ? 0 : jit())) / cols * 100, y: (j + (edge ? 0 : jit())) / rows * 100 });
  }
  const at = (i, j) => pt[j * (cols + 1) + i];
  const tris = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
    if ((i + j) % 2) tris.push([a, b, c], [a, c, d]); else tris.push([a, b, d], [b, c, d]);
  }
  const shards = tris.map(t => {
    const el = document.createElement('div');
    el.className = 'shard';
    el.style.backgroundImage = `url(${url})`;
    el.style.clipPath = `polygon(${t.map(p => `${p.x}% ${p.y}%`).join(',')})`;
    const cx = t.reduce((n, p) => n + p.x, 0) / 3, cy = t.reduce((n, p) => n + p.y, 0) / 3;
    el.style.transformOrigin = `${cx}% ${cy}%`;
    box.append(el);
    return { el, cx, cy };
  });
  document.body.classList.add('quake');
  // A moment of cracks, then everything falls, the middle first.
  setTimeout(() => {
    for (const s of shards) {
      const dx = s.cx - 50, dy = s.cy - 50, far = Math.hypot(dx, dy);
      const delay = far * 9 + Math.random() * 120;
      s.el.style.transition = `transform 1.7s cubic-bezier(.45,.05,.85,.4) ${delay}ms, opacity 1.2s ease-in ${delay + 600}ms`;
      s.el.style.transform = `translate(${dx * 6}px, ${900 + Math.random() * 400}px) rotate(${(Math.random() - 0.5) * 140}deg) scale(${0.85 + Math.random() * 0.3})`;
      s.el.style.opacity = '0';
    }
  }, 450);
  setTimeout(() => document.body.classList.remove('quake'), 1100);
  setTimeout(() => box.remove(), 3600);
}

function showResult(title, text, button, fn, book = false) {
  const box = $('result');
  box.querySelector('h2').textContent = title;
  box.querySelector('p').textContent = text;
  const btn = box.querySelector('button');
  btn.textContent = button;
  btn.onclick = () => { box.classList.remove('open'); fn(); };
  // At the end of a campaign, its story can be read before you go on.
  box.querySelector('.book')?.remove();
  if (book && world.chronicle?.length) {
    const b = document.createElement('button');
    b.className = 'book';
    b.textContent = 'Read the chronicle';
    b.onclick = () => openChronicle();
    btn.after(b);
  }
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

// Great works at a place (works.js): what is being built there, the restored city's
// stages, and what can be started, each with its price and why not.
function worksBox(p) {
  const W = world.works, doing = W?.doing?.p === p.id ? W.doing : null;
  const done = p.kind === 'crown' ? Object.entries(WORKS).filter(([k]) => W?.done?.[k]).map(([, x]) => x.done) : [];
  const open = doing ? [] : worksAt(world, p);
  if (!doing && !done.length && !open.length) return '';
  return `<h4>Great works</h4>`
    + done.map(t => `<p class="note">${ico('crown', '#e8c45a')} ${t}</p>`).join('')
    + (doing ? `<p class="status">${doing.name}: ${Math.round(100 * (1 - doing.left / doing.of))}% · ${clock(doing.left)} left</p>` : '')
    + open.map(o => `<button data-act="work:${o.key}" class="wide" ${o.ok ? '' : 'disabled'} title="${o.ok ? o.W.about : `${o.why}. ${o.W.about}`}">${ico(o.W.icon, '#e8c45a')} ${o.W.name}${o.br ? ` above ${p.name}` : ''} (${o.W.gold} gold)</button>`).join('');
}

// A market town's wares (treasury.js): a lot of each at today's price, carted to your
// nearest village. The price rises with every lot you buy and settles back slowly.
function marketBox(p) {
  if (!isMarket(p) || !p.seen) return '';
  const rows = Object.entries(WARES).map(([g, W]) => {
    const c = buyCheck(world, p, g), price = priceAt(p, g);
    return `<button data-act="buy:${g}" class="wide" ${c.ok ? '' : 'disabled'} title="${c.ok ? (c.to === p ? 'Straight into the stores' : `A cart takes them to ${c.to.name}; raiders can rob it`) : c.why}">${ico(g)} ${W.lot} ${W.name} · ${price} gold${c.ok || !c.to ? '' : `<small>${c.why}</small>`}</button>`;
  }).join('');
  return `<h4>Buy at the market</h4>${rows}`;
}

let panelKey = null;
function worldPanel() {
  const el = $('wpanel'), it = selected;
  const own = it && (it.units ? it.side === 0 : it.owner === 0);
  const waitingAt = it && it.units && it.at && !it.path.length ? it.at : null;
  if (it?.house) return housePanel(el, it.house);
  const company = waitingAt ? world.armies.filter(o => o !== it && o.side === 0 && !o.wagon && o.at === waitingAt && !o.path.length).length : 0;
  const carts = own && it.units && !it.wagon && !it.escort ? cartsNear(world, it) : [];
  const key = !it ? `none:${world.home?.owner}:${world.rank}` : it.units ? `a${it.id}:${!!waitingAt}:${it.retreating}:${company}:${carts.map(c => c.id)}:${it.escort || ''}` : `p${it.id}:${it.owner}:${!!it.town}:${world.rank}:${world.pois.filter(q => q.owner === 0 && q.town).length}:${it.vassal || ''}:${living(world).map(v => v.id).join('.')}`;
  if (key !== panelKey) {
    panelKey = key;
    if (!it) el.innerHTML = `<h3>Your realm</h3><p data-f="rank" class="status"></p><p data-f="realm"></p><p data-f="gold"></p><div class="houses" data-f="houses"></div><div class="vassals" data-f="vassals"></div><div class="decrees" data-f="decrees"></div>`
      + (world.home?.owner === 0 && world.home.town && world.rank !== 'Reeve' ? `<button data-act="banners" class="wide" title="Every village raises what its barracks can arm, keeping half its people at work, and sends its men to ${world.home.name}">${ico('crown')} Call the banners to ${world.home.name}</button>` : '')
      + `<button data-act="chronicle" class="wide">${ico('chronicle')} Read the chronicle</button>`
      + `<p class="note">Click a house to deal with its lord. Click a place or an army to select it; double-click one of your villages to go there.</p>`;
    else if (it.wagon?.trade) el.innerHTML = `<h3>${ico('caravan', '#e8c45a')} ${it.name}</h3><p data-f="men"></p><p class="status" data-f="status"></p><p class="note">Caravans carry gold between market towns. When one arrives, its lord is paid, and the market at the other end takes half as much again. An enemy or outlaw army that meets it takes the gold; one of your armies can ride with it as an escort.</p>`;
    else if (it.wagon?.run) el.innerHTML = `<h3>${ico('village')} ${it.name}</h3><p data-f="men"></p><p class="status" data-f="status"></p><p class="note">Spare goods and a few families for another of your villages. A raider who meets it on the road seizes the lot; one of your armies can ride with it.</p>`;
    else if (it.wagon) el.innerHTML = `<h3>${ico('food')} ${it.name}</h3><p data-f="men"></p><p class="status" data-f="status"></p><p class="note">Wagons drive straight for their army. Enemy armies that meet one on the way take its food.</p>`;
    else if (it.units) el.innerHTML = `<h3 data-f="name"></h3><p data-f="men"></p><p data-f="units" class="units"></p><p data-f="food"></p><p class="note" data-f="captain"></p><p class="status" data-f="status"></p>`
      + (own ? `<button data-act="ride" class="wide" data-f="ride"></button>` : '')
      + (own ? `<button data-act="wagon" class="wide" data-f="wagon"></button>` : '')
      + carts.map(c => `<button data-act="escort:${c.id}" class="wide" title="The army rides beside the cart until it arrives. A raider must beat it first.">${ico('caravan', '#e8c45a')} Escort the ${c.name.replace(/^(Caravan|Supply)/, m => m.toLowerCase())}</button>`).join('')
      + (own && waitingAt ? world.armies.filter(o => o !== it && o.side === 0 && !o.wagon && o.at === waitingAt && !o.path.length).map(o => `<button data-act="join:${o.id}" class="wide">Join with ${o.name} (${headcount(o.units)})</button>`).join('') : '')
      + (own ? `<p class="note">Right-click a place to march there. Your own villages take the army in; any other place means a fight.</p>` : '')
      + (own && waitingAt?.town ? `<button data-act="garrison" class="wide">Enter ${waitingAt.name}</button>` : '');
    else el.innerHTML = `<h3>${ico(KINDS[it.kind].icon)} ${it.name}</h3>${it.epithet ? `<p class="note"><i>${it.name}, ${it.epithet}</i></p>` : ''}<p data-f="owner"></p><p data-f="men"></p><p class="status" data-f="status"></p><p class="note">${KINDS[it.kind].name}: ${KINDS[it.kind].about}</p><div class="works" data-f="works"></div><div class="market" data-f="market"></div>`
      + (it.town ? `<div class="row"><button data-act="enter">Go to ${it.name}</button><button data-act="muster">Muster the garrison</button></div>`
        + (own && world.rank !== 'Reeve' ? `<button data-act="banners" class="wide" title="Every village raises what its barracks can arm, keeping half its people at work, and sends its men here">${ico('crown')} Call the banners here</button>` : '')
        + (own && ['Duke', 'King'].includes(world.rank) ? `<button data-act="gather" class="wide" data-f="gather" title="Every free army of yours in the field marches here and goes inside, to march out again as one host (Muster the garrison)"></button>` : '')
        + (own ? (q => q.length ? `<div class="runs"><p class="note">Send half its spare food and building goods, and four families if it can spare them, to another of your villages.</p>`
          + q.map(o => `<button data-act="run:${o.id}" class="wide" data-f="run${o.id}">${ico('village')} Supply run to ${o.name}</button>`).join('') + '</div>' : '')(world.pois.filter(o => o !== it && o.owner === 0 && o.town).sort((a, b) => Math.hypot(a.x - it.x, a.z - it.z) - Math.hypot(b.x - it.x, b.z - it.z)).slice(0, 4)) : '')
        + (own && world.rank !== 'Reeve' && world.home !== it ? `<div class="grant"><p class="note">Give it to a vassal to run for you: a share of its gold and men, and one less village to watch. You can take it back.</p>`
          + `<button data-act="grant" class="wide" data-f="grant">${ico('crown')} Give it to a new vassal</button>`
          + living(world).map(v => `<button data-act="grant:${v.id}" class="wide">Give it to ${v.name}</button>`).join('')
          + world.knightable().map(c => `<button data-act="knight:${c.id}" class="wide" title="Captain ${c.name} becomes a loyal vassal and leaves the army">${ico('crown', '#e8c45a')} Knight Captain ${c.name} with it</button>`).join('') + '</div>' : '')
        : it.vassal ? `<div data-f="vassal"></div>
          <div class="dues"><span>Dues</span><button data-act="v:dues-" title="Lighter dues please him">−</button><b data-f="dues"></b><button data-act="v:dues+" title="Heavier dues anger him">+</button></div>
          <div class="dues"><span>Levies</span><button data-act="v:levy-" title="Lighter levies please him">−</button><b data-f="levy"></b><button data-act="v:levy+" title="Heavier levies anger him">+</button></div>
          <div class="row"><button data-act="v:gift">${ico('gold', '#e8c45a')} Gift (${GIFT} gold)</button><button data-act="v:council" data-f="council"></button></div>
          <div class="feud" data-f="feud"></div>
          <button data-act="visit" class="wide" title="See his village as it stands. You can look, not build or give orders.">${ico('village')} Look round ${it.name}</button>
          <div class="row"><button data-act="revoke" class="warn" title="You get the village back as it stands. Every other vassal will remember it.">Take it back</button><button data-act="v:imprison" class="warn" title="Every village he holds comes back to you and he goes to your dungeon. The others will remember it; you can pardon him later.">Imprison him</button></div>`
        : `<div data-f="intel" class="intel"></div><button data-act="spy" class="wide" data-f="spy"></button><p class="note">Select one of your armies, then right-click here to march on it.</p>`);
  }
  const set = (f, v) => { const e = el.querySelector(`[data-f="${f}"]`); if (e && e.dataset.was !== v) { e.dataset.was = v; e.innerHTML = v; } };
  if (!it) {
    const held = world.pois.filter(p => p.owner === 0);
    const men = held.reduce((n, p) => n + (p.town ? p.town.garrison().reduce((k, r) => k + r.alive, 0) : headcount(p.garrison)), 0)
      + world.armies.filter(a => a.side === 0).reduce((n, a) => n + headcount(a.units), 0);
    set('rank', world.crowned ? (world.part === 2 ? 'King of the realm · the north is at war with you' : 'King of the realm') : `${world.rank} of ${world.home.owner === 0 ? world.home.name : 'nowhere'}`);
    set('realm', `${held.length} of ${world.pois.length} places held · ${men} soldiers`);
    const backing = FACTIONS.filter(h => world.dip[h.index]?.backs && h.alive).length;
    const pay = elitePay(world, 0);
    set('gold', `${ico('gold', '#e8c45a')} ${Math.floor(FACTIONS[0].gold)} gold${pay ? ` · your elite men draw ${Math.round(pay)} a minute` : ''}${backing ? ` · ${ico('crown', '#e8c45a')} ${backing} house${backing > 1 ? 's' : ''} back your claim` : ''}`);
    const list = el.querySelector('[data-f="houses"]');
    // Houses you have not met share one line; you learn who they are by finding their lands.
    const unmet = FACTIONS.slice(1, world.bandits).filter(h => !world.knows(h.index) && h.alive && !world.atWar(0, h.index));
    const rows = FACTIONS.slice(1, world.bandits).filter(h => !unmet.includes(h)).map(h => {
      const met = world.knows(h.index), war = world.atWar(0, h.index);
      const n = world.pois.filter(p => p.seen && p.known?.owner === h.index).length;
      const d = world.dip[h.index];
      const tie = d.vassal ? 'your vassal' : d.married ? 'married' : d.allied ? 'allied' : war ? (world.coalition?.members.includes(h.index) ? 'in the coalition' : 'at war') : 'peace';
      return `<div class="h${h.alive ? "" : " gone"}${met && h.alive ? ' pick' : ''}" data-house="${h.index}"><i style="background:${met ? h.color : "#8a8478"}"></i><span>${met ? `${h.lord}` : 'An unknown house'}<br><small>${met ? `${h.name} · ${mood(d.opinion).toLowerCase()}` : 'not yet met'}</small></span><small class="${war ? 'war' : ''}">${!h.alive ? 'broken' : tie}</small></div>`;
    }).join('') + (world.invader !== null ? (h => `<div class="h${h.alive ? '' : ' gone'}"><i style="background:${h.color}"></i><span>${h.lord}<br><small>${h.name} · no terms</small></span><small class="war">${h.alive ? 'at war' : 'broken'}</small></div>`)(FACTIONS[world.invader]) : '') + (unmet.length ? `<div class="h unmet"><i style="background:#8a8478"></i><span>${unmet.length === FACTIONS.slice(1, world.bandits).length ? `${unmet.length} great houses` : `${unmet.length} more house${unmet.length > 1 ? 's' : ''}`}<br><small>not yet met: explore to find their lands</small></span><small></small></div>` : '');
    if (list.dataset.html !== rows) { list.dataset.html = rows; list.innerHTML = rows; }
    // Your vassals, after Crusader Kings 2: one opinion number, the reasons on hover.
    const vl = el.querySelector('[data-f="vassals"]'), vs = living(world);
    const vrows = vs.length ? `<h4>Vassals</h4>` + vs.map(v => {
      const o = opinion(world, v), held = holdingsOf(world, v);
      const men = held.reduce((n, p) => n + headcount(p.garrison), 0);
      const initials = v.name.split(' ').slice(1).map(w => w[0]).join('');
      const why = o.why.map(([n, t]) => `${n > 0 ? '+' : ''}${n} ${t}`).join('\n');
      const foe = v.feud && world.vassals.find(x => x.id === v.feud);
      const marks = (world.faction?.members.includes(v.id) ? ' · <b class="war">⚑ faction</b>' : '') + (foe ? ` · <b class="war">feuding with ${foe.name}</b>` : '');
      return `<div class="h pick" data-vassal="${v.id}" title="${moodWord(o.total)}\n${why}"><i class="shield" style="background:${v.color}">${initials}</i><span>${v.name}${v.council ? ` ${ico('crown', '#e8c45a')}` : ''}<br><small>${v.landless ? 'Landless, at your court: give him a village' : `${held.map(p => p.name).join(', ')} · ${men} men · paid ${Math.floor(v.paid)}`}${v.refusing ? ' · <b class="war">refusing</b>' : ''}${marks}</small></span><b class="op" style="color:${moodColor(o.total)}">${o.total > 0 ? '+' : ''}${o.total}</b></div>`;
    }).join('') : '';
    const jail = prisoners(world);
    const prows = vrows + (jail.length ? `<h4>In your dungeon</h4>` + jail.map(v => `<div class="h"><i class="shield" style="background:${v.color}">${v.name.split(' ').slice(1).map(w => w[0]).join('')}</i><span>${v.name}<br><small>${TEMPERS[v.temper].name}</small></span><button data-act="pardon:${v.id}" title="Out, grateful and landless, until you give him a village">Pardon</button></div>`).join('') : '');
    if (vl && vl.dataset.html !== prows) { vl.dataset.html = prows; vl.innerHTML = prows; }
    set('decrees', canDecree(world) ? '<h4>Royal decrees</h4>' + Object.entries(DECREES).map(([k, D]) => { const on = world.decrees?.on?.[k], c = decreeCheck(world, k);
      return `<button data-act="decree:${k}" class="wide${on ? ' on' : ''}" ${c.ok ? '' : 'disabled'} title="${D.good} ${D.bad}${c.ok ? '' : `\n${c.why}`}">${ico(D.icon, on ? '#e8c45a' : undefined)} ${on ? 'In force: ' : 'Decree '}${D.name.toLowerCase()}</button>`; }).join('') : '');
  } else if (it.wagon?.trade) {
    set('men', it.side === 0 || it.visible ? `${it.wagon.gold} gold · ${FACTIONS[it.side]?.name || ''}` : 'A caravan');
    const guard = world.armies.find(o => o.escort === it.id && !o.gone);
    set('status', `On the road to ${it.wagon.to.name}${guard ? `, guarded by ${guard.name}` : ''}`);
  } else if (it.wagon?.run) {
    set('men', loadText(it.wagon));
    const guard = world.armies.find(o => o.escort === it.id && !o.gone);
    set('status', `On the road to ${it.wagon.to.name}${guard ? `, guarded by ${guard.name}` : ''}`);
  } else if (it.wagon) {
    set('men', `${it.wagon.food} food`);
    set('status', it.wagon.to.gone ? `Going back to ${it.wagon.from.name}` : `On the way to ${it.wagon.to.name}`);
  } else if (it.units) {
    const hurt = (it.wounded || []).reduce((n, u) => n + u.count, 0);
    // a rival army is only as clear as your eyes on it (world.updateVision): there, how big, which troops
    const know = it.side === 0 ? 3 : it.know ?? 3, men = headcount(it.units);
    set('name', know >= 2 ? it.name : 'An army in the distance');
    set('men', know < 2 ? 'Too far off to count' : know < 3 ? `About ${men < 100 ? Math.max(10, Math.round(men / 10) * 10) : Math.round(men / 50) * 50} men`
      : `${men} men${hurt ? ` · ${hurt} wounded` : ''}`);
    if (it.side === 0 || it.visible) {
      const home = fedAt(world, it), left = foodLeft(world, it);
      set('food', `${ico('food', it.food > 0 ? '#c9b26a' : '#ff8a5a')} ` + (home ? `Fed from ${home.name}${hurt ? '; the wounded are mending' : ''}`
        : it.food <= 0 ? '<b class="war">Out of food: men are deserting</b>' : `Food for ${clock(left)}${left < 60 ? ' <b class="war">running low</b>' : ''}`));
    }
    if (own) {
      const w = fedAt(world, it) ? null : wagonFrom(world, it), btn = el.querySelector('[data-f="wagon"]');
      const coming = world.armies.some(o => o.wagon?.to === it);
      set('wagon', coming ? `${ico('food')} A wagon is on its way` : w ? `${ico('food')} Send ${w.load} food from ${w.p.name}` : `${ico('food')} No village has food to send`);
      if (btn) btn.disabled = coming || !w || !!fedAt(world, it);
      if (btn) btn.hidden = !!fedAt(world, it);
    }
    set('units', know < 3 ? 'Too far off to make out which troops' : it.units.map(u => `${u.name}: ${u.count}`).join(' · '));
    if (own || it.visible) { set('captain', captainLine(world, it)); const ce = el.querySelector('[data-f="captain"]'); if (ce) ce.title = captainMemory(world, it); }
    if (own) set('ride', it.lord === 0 ? `${ico('crown')} Ride home` : world.lordHurt > world.time ? `${ico('crown')} Your lord is mending` : `${ico('crown')} Ride with this army`);
    const sp = it.siege && world.byId[it.siege.p];
    if (sp) set('status', sp.siegeFood > 0 ? `Besieging ${sp.name}: its stores last about ${clock(sp.siegeFood)}` : `Besieging ${sp.name}: the place is starving`);
    else if (it.escort) set('status', `Riding with the ${world.armies.find(o => o.id === it.escort)?.name.replace(/^(Caravan|Supply)/, m => m.toLowerCase()) || 'caravan'}`);
    else set('status', it.retreating ? `Falling back to ${it.path.at(-1)?.name}` : it.halted ? 'In battle' : it.path.length ? `Marching to ${it.path.at(-1).name}` : waitingAt ? `Waiting at ${waitingAt.name}` : 'Waiting');
  } else {
    const who = it.visible ? it.owner : it.known?.owner;
    const lord = vassalOf(world, it);
    const whoText = !it.seen ? 'Unexplored' : who === null ? (it.free ? `Held free of you by ${it.free}, who rose against you` : 'Free folk with their own militia') : lord ? `Yours, held for you by <b style="color:${lord.color}">${lord.name}</b>` : who === 0 ? 'Yours' : `Held by ${FACTIONS[who].name}${world.atWar(0, who) ? ' (at war with you)' : ''}`;
    set('owner', whoText + (it.visible || !it.seen || who === 0 ? '' : ' (last seen)'));
    set('works', worksBox(it));
    set('market', marketBox(it));
    if (it.owner === 0) { const n = world.gatherable(it).length; set('gather', `${ico('battle')} Gather your armies here${n ? ` (${n})` : ''}`); const gb = el.querySelector('[data-f="gather"]'); if (gb) gb.disabled = !n; }
    if (it.town) {
      const can = world.canGrant(it);
      for (const b of el.querySelectorAll('[data-act^="grant"], [data-act^="knight"]')) { b.disabled = !can.ok; b.title = can.ok ? can.warn || '' : can.why; b.classList.toggle('warn', !!can.warn); }
      for (const b of el.querySelectorAll('[data-act^="run:"]')) { const r = runCheck(world, it, world.byId[b.dataset.act.slice(4)]); b.disabled = !r.ok; b.title = r.ok ? loadText(r.load) : r.why; }
      set('men', `${it.town.atWork} at work · ${it.town.garrison().reduce((n, r) => n + r.alive, 0)} soldiers${it.town.underArms ? `, ${it.town.underArms} of them levies` : ''}`);
      set('status', it.town.underAttack ? `${ico('battle', '#ff8a5a')} Under attack!` : '');
      const mb = el.querySelector('[data-act="muster"]'), men = it.town.garrison().reduce((n, r) => n + r.alive, 0);
      if (mb && men) { const m = Math.floor(Math.min(spareFood(it.town), men * CARRY) / men * 2); mb.title = m ? `${men} men march out with food for ${m} minute${m > 1 ? 's' : ''}` : `${men} men, and no spare food for their carts: they will desert away from home`; mb.classList.toggle('warn', !m); }
    } else {
      set('men', !it.seen ? 'Send an army near to see it' : `About ${it.visible ? headcount(it.garrison) : it.known.men} men in the garrison`);
      set('status', it.seat !== undefined && it.seen ? `Seat of ${FACTIONS[it.seat].name}` : '');
      set('intel', intelText(it));
      if (lord) {
        const o = opinion(world, lord), e = it.eco, T = TEMPERS[lord.temper];
        set('vassal', `<p title="${o.why.map(([n, t]) => `${n > 0 ? '+' : ''}${n} ${t}`).join('\n')}"><b style="color:${moodColor(o.total)}">${moodWord(o.total)} (${o.total > 0 ? '+' : ''}${o.total})</b> · ${T.name}: ${T.about}</p>`
          + `<p class="note">${WANTS[lord.want].met(world, lord) ? "Has" : "Wants"} ${WANTS[lord.want].text}. Hover the opinion for the reasons.</p>`
          + `<p>${Math.round(e.pop)} people · ${builtCount(e)} buildings · stores worth about ${worth(e.stock)} gold</p>`
          + `<p>Has paid you ${Math.floor(lord.paid)} gold and sent ${lord.sent} men${lord.refusing ? ' · <b class="war">refuses dues and levies</b>' : ''}</p>`);
        set('dues', `${DUES[lord.dues].name} (${Math.round(DUES[lord.dues].share * 100)}%)`);
        set('levy', `${LEVIES[lord.levy].name} (${Math.round(LEVIES[lord.levy].share * 100)}%)`);
        set('council', lord.council ? 'Off your council' : `${ico('crown')} Seat on your council`);
        const foe = lord.feud && world.vassals.find(x => x.id === lord.feud);
        set('feud', foe ? `<p><b class="war">Feuding with ${foe.name}</b>: both their villages suffer, and he minds that you do nothing.</p>`
          + `<div class="row"><button data-act="v:judge" title="He is pleased; ${foe.name} is not">Judge for him</button><button data-act="v:reconcile" title="Both a little pleased">${ico('gold', '#e8c45a')} Reconcile (${RECONCILE})</button></div>` : '');
      }
      const btn = el.querySelector('[data-f="spy"]'), can = world.canSpy(it), going = world.spies.some(s => s.at === it.id);
      if (btn) {
        btn.hidden = !it.seen || it.owner === 0 || !it.eco?.buildings;
        btn.disabled = !can.ok;
        set('spy', going ? 'A spy is on the way' : `${ico('watchtower')} Send a spy (${world.spyCost(it)} gold)${can.ok ? `<small>${Math.round(world.spyRisk(it) * 100)}% chance of being caught</small>` : `<small>${can.why}</small>`}`);
      }
    }
  }
}

// What your last spy saw in a place: as it was that day, not as it is now.
function intelText(p) {
  const r = p.intel;
  if (!r) return p.seen && p.owner !== 0 ? '<p class="note">Its stores and buildings are unknown. A spy can find out.</p>' : '';
  const age = world.time - r.at;
  const when = age < 60 ? 'just now' : `${clock(age)} ago`;
  const stock = Object.entries(r.stock).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([g, q]) => `${ico(g)} ${q}`).join(' ');
  const built = Object.entries(r.buildings).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${BUILDINGS[k]?.name || k}${n > 1 ? ` ×${n}` : ''}`).join(', ');
  return `<p class="status">Spy report, ${when}</p>`
    + `<p>A ${WEALTH[r.wealth].name} place of ${r.pop} people, living by ${FOCUS_NAMES[r.focus]}. ${r.walls === 'none' ? 'No walls.' : r.walls === 'stone' ? 'Stone walls.' : 'A wooden palisade.'}</p>`
    + `<p>${r.men} men under arms${r.kits ? `, and kit in store for ${r.kits} more` : ''}.</p>`
    + `<p>${ico('gold', '#e8c45a')} ${r.gold} gold · stores worth about ${worth(r.stock, r.gold)} gold</p>`
    + (stock ? `<p class="units">${stock}</p>` : '') + `<p class="note">${built}</p>`;
}

// A rival lord: what they think of you, and what you can put to them.
// What a house is about (rivals.js STAGES), as the realm would put it.
const AMBITION = ['Settling its own lands', 'Reaching beyond its lands, and eyeing weak neighbours', 'Playing to win the realm'];
function housePanel(el, h) {
  const d = world.dip[h.index], list = dipActions(world, h.index);
  const key = `h${h.index}:${list.map(a => a.id + a.ok).join()}:${d.married}${d.allied}${d.vassal}${d.backs}`;
  if (key !== panelKey) {
    panelKey = key;
    const initials = h.lord.split(' ').filter(w => /^[A-Z]/.test(w)).slice(-2).map(w => w[0]).join('');
    const ties = [d.vassal && 'Your vassal', d.married && 'Joined to you by marriage', d.allied && 'Your ally', d.backs && 'Backs your claim to the crown'].filter(Boolean);
    el.innerHTML = `<div class="lord"><div class="face" style="background:${h.color}"><img src="assets/art/portraits/${h.id}.png" alt="" onerror="this.replaceWith('${initials}')"></div>
      <div><h3 style="color:${h.color}">${h.lord}</h3><small>${h.name} · the ${h.trait}</small></div></div>
      <p class="note">${h.blurb}</p><p data-f="mood" class="status"></p><p data-f="state"></p><p data-f="grudges" class="note"></p>${ties.length ? `<p>${ties.join(' · ')}</p>` : ''}
      <div class="dip">${list.map(a => `<button data-dip="${a.id}" class="wide${a.warn ? ' warn' : ''}" ${a.ok ? '' : 'disabled'} title="${a.ok ? '' : a.why}">${a.label}${a.ok ? '' : `<small>${a.why}</small>`}</button>`).join('')}</div>
      <button data-act="back" class="wide">Back to your realm</button>`;
  }
  const set = (f, v) => { const e = el.querySelector(`[data-f="${f}"]`); if (e && e.dataset.was !== v) { e.dataset.was = v; e.innerHTML = v; } };
  set('mood', `${mood(d.opinion)} toward you (${Math.round(d.opinion)})`);
  const held = grudgeLines(world, h).slice(0, 3);
  set('grudges', held.length ? `Holds against you: ${held.join('; ')}.` : '');
  const n = world.pois.filter(p => p.owner === h.index).length;
  set('state', `${world.atWar(0, h.index) ? 'At war with you' : world.time < d.truceUntil && d.truceUntil < Infinity ? `Truce for ${clock(d.truceUntil - world.time)}` : 'At peace'} · ${n} places · ${ico('gold', '#e8c45a')} ${Math.floor(h.gold)}<br><small>${AMBITION[stageOf(h)]}</small>`);
}

$('wpanel').onclick = e => {
  const vrow = e.target.closest('[data-vassal]');
  if (vrow) { const v = world.vassals.find(o => o.id === +vrow.dataset.vassal); selected = v && holdingsOf(world, v)[0] || null; return; }
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
  if (act === 'chronicle') return openChronicle();
  if (act === 'enter') enterTown(it);
  if (act === 'spy' && it && world.sendSpy(it)) panelKey = null;
  if (act?.startsWith('grant') && it) {
    const to = act.includes(':') ? world.vassals.find(v => v.id === +act.split(':')[1]) : null;
    const v = world.grant(it, to);
    if (v) flash(`${it.name} is now held for you by ${v.name}.`, true);
    panelKey = null;
  }
  if (act?.startsWith('knight:') && it) {
    const v = world.knight(it, world.captains.find(c => c.id === +act.split(':')[1]));
    if (v) flash(`${v.name} holds ${it.name} for you now.`, true);
    panelKey = null;
  }
  if (act?.startsWith('v:') && it) {
    const r = world.vassalAct(vassalOf(world, it), act.slice(2));
    if (r.text) flash(r.text, r.ok);
  }
  if (act === 'revoke' && it && world.revoke(it)) panelKey = null;
  if (act === 'v:imprison') { selected = null; panelKey = null; }
  if (act?.startsWith('pardon:')) { world.pardon(world.vassals.find(v => v.id === +act.split(':')[1])); panelKey = null; }
  if (act === 'visit' && it?.vassal) return visitVassal(it);
  if (act === 'muster') {
    const regs = it.town.garrison().filter(r => !r.routing && !r.regrouping);
    const a = regs.length ? world.muster(it, regs) : null;
    if (a) selected = a; else flash('Nobody fit to march.');
  }
  if (act === 'garrison' && it.at?.town) world.enterTown(it, it.at, it.last);
  if (act === 'banners') { world.callBanners(it && !it.units ? it : world.home); panelKey = null; }
  if (act === 'ride' && it?.units) { const r = ride(world, it); flash(r.ok ? r.text : r.why, r.ok); }
  if (act?.startsWith('join:')) { const o = world.armies.find(a => a.id === +act.slice(5)); if (o && !o.gone) world.join(it, o); panelKey = null; }
  if (act === 'gather' && it && !it.units) { const n = world.gatherAt(it); flash(n ? `${n} ${n > 1 ? 'armies are' : 'army is'} on the way to ${it.name}.` : 'No army of yours is free to come.', !!n); }
  if (act?.startsWith('decree:')) { const r = toggleDecree(world, act.slice(7)); if (!r.ok) flash(r.why); }
  if (act?.startsWith('work:')) { const r = startWork(world, it, act.slice(5)); if (!r.ok) flash(r.why); }
  if (act?.startsWith('buy:') && it) { const r = buy(world, it, act.slice(4)); flash(r.ok ? r.text : r.why, r.ok); }
  if (act?.startsWith('run:')) { const r = sendRun(world, it, world.byId[act.slice(4)]); flash(r.ok ? `The wagon sets out: ${loadText(r.wagon.wagon)}.` : r.why, r.ok); }
  if (act?.startsWith('escort:')) { const c = world.armies.find(a => a.id === +act.slice(7)); if (!escort(world, it, c)) flash('That caravan is gone.'); panelKey = null; }
  if (act === 'wagon' && it.units && !it.wagon && !it.gone) { if (!sendWagon(world, it)) flash('No village has food to spare.'); }
};

// ---- top bar ----

$('pause').onclick = () => { paused = !paused; };
for (const b of document.querySelectorAll('[data-speed]')) b.onclick = () => { speed = +b.dataset.speed; paused = false; };
$('help-toggle').onclick = () => $('help').classList.toggle('open');
$('help-close').onclick = () => { $('help').classList.remove('open'); paused = false; };
$('to-world').onclick = () => showWorld();
$('march').onclick = () => {
  if (current?.look) return;
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

// A loaded campaign shows only what happens from now on.
let seenWorld = loaded ? Math.max(0, world.events.length - 1) : 0;
// ---- what needs you ----
// The ranked alerts in the map's corner; in a village, a count on the World map button.
// Clicking one goes to the map and looks at the place or army.
let alertsAt = -1, alertsKey = '', shownAlerts = [];
function alertList() {
  if (performance.now() - alertsAt < 500) return;
  alertsAt = performance.now();
  const list = world.winner === null ? alerts(world) : [];
  const urgent = list.filter(a => a.level >= 3);
  const btn = $('to-world');
  btn.dataset.alerts = urgent.length || '';
  btn.style.setProperty('--alert', LEVEL_COLOR[urgent[0]?.level || 0] || 'transparent');
  if (away) list.unshift({ level: 5, icon: 'battle', away: true,
    text: `${away.b.title}: ${standing(away.b.battle, 0)} of yours against ${standing(away.b.battle, 1)}. Take command` });
  const shown = list.slice(0, 7), key = shown.map(a => a.level + a.text).join('|') + list.length;
  if (key === alertsKey) return;
  alertsKey = key;
  shownAlerts = shown;
  const el = $('alerts');
  el.hidden = !shown.length;
  el.innerHTML = `<h4>Needs you${list.length > shown.length ? ` <small>and ${list.length - shown.length} more</small>` : ''}</h4>`
    + shown.map((a, i) => `<div data-alert="${i}" class="${a.at || a.away ? 'go' : ''}" style="--c:${LEVEL_COLOR[a.level] || '#9fc46e'}">${ico(a.icon)}<span>${a.text}</span></div>`).join('');
}
$('alerts').onclick = e => {
  const a = shownAlerts[+e.target.closest('[data-alert]')?.dataset.alert];
  if (a?.away) return takeCommand();
  if (!a?.at || a.at.gone) return;
  if (mode === 'town') showWorld();
  selected = a.at;
  worldControls.lookAt(a.at);
};

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
  $('place').textContent = mode === 'world' ? 'World map' : mode === 'town' ? current.title || current.poi.name : $('field-title').textContent;
  if (mode === 'world') {
    $('clock').textContent = `${SEASONS[world.season]} · ${clock(world.time)}`;
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
        issueChallenge(b);
        b.aiClock -= h;
        if (b.aiClock <= 0) { b.aiClock = 1; thinkAI(b.battle, 1, { hold: b.assault }); }
        if (b.battle.winner !== null && !b.endAt) b.endAt = b.battle.time + 2.5;
        if (b.endAt && b.battle.time > b.endAt) { endField(b.battle.winner === 0); break; }
      } else {
        world.update(h);
        // A vassal's village you are looking round lives on its own, a picture thrown away after.
        if (mode === 'town' && current.look) { current.town.battle.step(h); current.town.update(h); }
        stepAway(h);
        autosave();
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
    if (b.siege) b.siege.update(dt);
    else { (b.siegeView ||= new SiegeView(b.scene, b.battle, b.heightAt)).update(dt); (b.fieldView ||= new FieldView(b.scene, b.battle)).update(dt); }
    hud.update(b.controls.selection, paused, speed);
    if (mode === 'town') {
      const st = b.st;
      if (st.selected?.removed) st.selected = null;
      b.townView.update(st.selected);
      const ghost = ghostKind(st.placing);
      b.townView.showGhost(ghost, st.hoverAt, ghost && st.hoverAt && b.town.canPlace(ghost, st.hoverAt.x, st.hoverAt.z, { free: ghost !== st.placing }).ok);
      townHud.update(st.selected, [...b.controls.selection], st.placing);
      b.roadView.update({ from: st.placing === 'road' ? st.roadFrom : null, at: st.hoverAt });
      labels.update(b.town, stage.camera, { hoverAt: st.hoverAt, placing: st.placing === 'road' ? 'road' : ghost, roadFrom: st.roadFrom });
    } else labels.hide();
  }
  if (mode === 'world') labels.hide();
  topBar();
  goals();
  alertList();
  worldLog();
  audio.frame(cam, mode === 'world' ? worldControls.cam : current.controls.cam, mode === 'world' ? { map: true, log: world.events, world } // audio
    : { battle: current.town?.battle || current.battle, town: current.town, field: mode === 'field', siege: current.assault, paused, log: world.events, world });
  stage.renderer.render(stage.current(), cam);
  renderAway();
  requestAnimationFrame(frame);
}

// ---- saving ----
// Every two minutes of play, between fights, the campaign saves itself; the Save button
// saves at once. Continue on the menu (world.html?continue) picks it up.
let savedAt = world.time;
function autosave() {
  if (world.time - savedAt < (world.options.ironman ? 45 : 120) || mode === 'field' || away || !canSave(world).ok) return;
  savedAt = world.time;
  if (saveGame(world).ok) flash('Saved.', true);
}
$('save').onclick = () => {
  const c = canSave(world, { busy: mode === 'field' || !!away });
  if (!c.ok) { flash(`Can't save now: ${c.reason.toLowerCase()}.`); return; }
  const r = saveGame(world);
  savedAt = world.time;
  flash(r.ok ? 'Saved. Continue from the menu any time.' : r.reason, r.ok);
};
if (loaded) { $('help').classList.remove('open'); paused = false; }
// Ironman: no Save button; the campaign saves itself often, and a defeat ends it for good.
if (world.options.ironman) { $('save').hidden = true; saveGame(world); }

setMode('world', null);
worldControls.lookAt(world.home || world.byId.ashford);
requestAnimationFrame(frame);

window.game = { world, get worldView() { return worldView; }, worldControls, crownedThenNorth, bundles, stage, seed, get mode() { return mode; }, get current() { return current; }, get away() { return away; }, enterTown, showWorld, startField };
