// Saving and loading a campaign. The map itself comes back from its seed; what is saved
// is everything that has happened since: who holds what, the armies on the roads, the
// houses' gold, moods and plans, and each of your villages as it stands (buildings,
// goods, people, regiments and walls). A save is made only between fights, so no battle
// is ever half-saved. One slot, kept in the browser, and a second for test campaigns
// (testsaves.js), so trying one never overwrites the real campaign.
import { World, FACTIONS } from './world.js';
import { restoreWorks } from './works.js';
import { relayOld } from './places.js';
import { vassalOf } from './vassals.js';
import { BUILDINGS, plainLevy, setWinter, winterFromUrl } from '../economy.js';

import { KEY, TEST_KEY, VERSION, store, inspect, migrate, keepStorage } from './saveslots.js';
export { TEST_KEY };
const keyOf = test => (test ? TEST_KEY : KEY);

// ---- what can be saved ----

export function canSave(w, { busy = false } = {}) {
  if (w.winner !== null) return { ok: false, reason: 'The campaign is over' };
  if (busy || w.encounter) return { ok: false, reason: 'Finish the fight first' };
  if (w.pois.some(p => p.town && (p.town.hostile || p.town.underAttack))) return { ok: false, reason: 'A village is being fought over' };
  if (w.pois.some(p => p.town?.revolt)) return { ok: false, reason: 'A village is in revolt' };
  return { ok: true };
}

// Autosave held off for minutes (a village fought over, a revolt) is said on screen, once for each such spell: it used
// to skip in silence. `overdue`: seconds of play past when it should have saved; `at`: wall-clock of the last save.
export const OVERDUE = 180;
export function unsavedNotice(overdue, reason, at) {
  if (overdue < OVERDUE) return null;
  const when = at ? `since ${new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'yet';
  return `Not saved ${when}: ${reason[0].toLowerCase()}${reason.slice(1)}.`;
}

export function hasSave(test = false) {
  try { return !!localStorage.getItem(keyOf(test)); } catch { return false; }
}

export function saveInfo(test = false) {
  try { const s = JSON.parse(localStorage.getItem(keyOf(test))); return s && { at: s.savedAt, time: s.world.time, seed: s.seed, part: s.world.part }; } catch { return null; }
}

export function readSave(test = false) {
  const r = loadSlot(test);
  return r.status === 'ok' ? r.data : null;
}

// The saved campaign ready to load, or why not: { status: 'none' | 'ok' | 'damaged' | 'newer' | 'failed', data?, reason? }.
// A save of an older version is migrated here. Nothing is ever deleted or replaced by looking at it.
export function loadSlot(test = false) {
  let raw = null;
  try { raw = localStorage.getItem(keyOf(test)); } catch { return { status: 'failed', reason: 'The browser would not let the game read its saved data' }; }
  if (raw === null) return { status: 'none' };
  const i = inspect(raw);
  if (i.status === 'damaged' || i.status === 'newer') return { status: i.status, reason: i.reason, raw };
  try { return { status: 'ok', data: migrate(JSON.parse(raw)), raw }; } catch (e) { return { status: 'failed', reason: `it could not be brought up to date (${e.message})`, raw }; }
}

// The campaign as save data, without storing it.
export function snapshot(w) {
  if (!w.campaignId) w.campaignId = Math.random().toString(36).slice(2, 10);
  return { version: VERSION, id: w.campaignId, seed: w.seed, savedAt: Date.now(), boxed: true, ...pack(w) };
}

export function saveGame(w) {
  let raw;
  try { raw = JSON.stringify(snapshot(w)); } catch (e) { console.error('save: the campaign would not turn into a save', e); return { ok: false, reason: "The campaign couldn't be written down (this is a bug: nothing was overwritten)" }; }
  const r = store(raw, { test: !!w.options.test });
  if (r.ok) { markClean(w, Date.now()); keepStorage(); }
  return r;
}

// The campaign as a file's worth of text: now if it can be saved this moment, else the last save in the browser.
// { ok, text, live, info } or { ok: false, reason }.
export function exportCurrent(w, { busy = false } = {}) {
  if (canSave(w, { busy }).ok) { const text = JSON.stringify(snapshot(w)); return { ok: true, text, live: true, info: inspect(text) }; }
  let text = null;
  try { text = localStorage.getItem(keyOf(w.options.test)); } catch { /* nothing */ }
  return text ? { ok: true, text, live: false, info: inspect(text) } : { ok: false, reason: `Nothing to save to a file yet: ${canSave(w, { busy }).reason.toLowerCase()}` };
}

// ---- unsaved progress ----
// What the game menu asks about before it quits (ui/menu.js): is the campaign now any different
// from its last save, or from the moment it was loaded or begun? markClean takes that picture
// (`at`: when it was saved, wall-clock, or null if never); unsaved compares the campaign to it.
const stamp = w => JSON.stringify({ ...snapshot(w), savedAt: 0 });
let clean = null, cleanAt = null;
export function markClean(w, at = null) { clean = stamp(w); cleanAt = at; }
export const lastSaved = () => cleanAt;
export const unsaved = w => clean !== null && stamp(w) !== clean;

export function clearSave(test = false) { try { localStorage.removeItem(keyOf(test)); } catch { /* nothing to clear */ } }

// ---- turning live objects into plain data and back ----

const SKIP_POI = new Set(['town', 'links', 'roadAngles', 'heightAt', 'trees', 'onRoad']);

function encoder(w) {
  const pois = new Map(w.pois.map((p, i) => [p, i]));
  const armies = new Set(w.armies);
  const houses = new Set(FACTIONS);
  const enc = (v, depth = 0) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : { $n: String(v) };
    if (v === null || typeof v !== 'object') return typeof v === 'function' ? undefined : v;
    if (pois.has(v) && depth > 0) return { $p: pois.get(v) };
    if (armies.has(v) && depth > 0) return { $a: v.id };
    if (houses.has(v) && depth > 0) return { $h: v.index };
    if (v instanceof Set) return { $set: [...v].map(x => enc(x, depth + 1)) };
    if (Array.isArray(v)) return v.map(x => enc(x, depth + 1));
    const o = {};
    for (const [k, x] of Object.entries(v)) {
      if (depth === 0 && pois.has(v) && SKIP_POI.has(k)) continue;
      const e = enc(x, depth + 1);
      if (e !== undefined) o[k] = e;
    }
    return o;
  };
  return enc;
}

function decoder(w, armyById) {
  const dec = v => {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(dec);
    if ('$n' in v) return Number(v.$n);
    if ('$p' in v) return w.pois[v.$p];
    if ('$a' in v) return armyById.get(v.$a) || null;
    if ('$h' in v) return FACTIONS[v.$h];
    if ('$set' in v) return new Set(v.$set.map(dec));
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = dec(x);
    return o;
  };
  return dec;
}

const WORLD_KEYS = ['time', 'nextArmy', 'winner', 'victory', 'crowned', 'wars', 'met', 'half', 'dip', 'dipClock', 'ecoClock', 'sightClock', 'supplyClock', 'goals', 'spies', 'vassals', 'vassalId', 'faction', 'coalition', 'eventClock', 'lastEvent', 'banditPeace', 'rankSeen', 'companies', 'captains', 'captainId', 'lordHurt', 'chronicle', 'cairns', 'lordCaptive', 'lordAskedAt', 'works', 'options', 'decrees', 'elitePay', 'settlerClock', 'lastSettlers', 'settlerSeen', 'petitionAt', 'uiSeen', 'outlaws', 'tributeAt', 'seasonSeen', 'leagues', 'warBy', 'eventAt', 'calls', 'fought', 'heard', 'quiet'];

function pack(w) {
  const enc = encoder(w);
  const world = { part: w.part, events: enc(w.events.slice(-200)), wallFallen: w.wall.fallen };
  for (const k of WORLD_KEYS) if (w[k] !== undefined) world[k] = enc(w[k], 1);
  return {
    world,
    houses: FACTIONS.map(h => enc({ ...h }, 1)),
    pois: w.pois.map(p => enc(p)),
    armies: w.armies.filter(a => !a.gone).map(a => enc({ ...a }, 1)),
    towns: w.pois.map((p, i) => p.town ? { i, ...packTown(p.town) } : null).filter(Boolean),
  };
}

// ---- a village ----

function packTown(t) {
  const W = t.battle.walls, idx = new Map();
  const nodes = W.nodes.filter(n => n.side === 0).map((n, i) => { idx.set(n, i); return { x: n.x, z: n.z, tower: n.tower && n.tower.state !== 'site' ? { material: n.tower.material, hp: n.tower.hp } : null }; });
  const pieces = W.pieces.filter(p => p.side === 0 && p.state !== 'site' && idx.has(p.a) && idx.has(p.b))
    .map(p => ({ a: idx.get(p.a), b: idx.get(p.b), material: p.material, gate: p.gate, hp: p.hp, broken: p.state === 'broken' }));
  return {
    kind: t.kind,
    keep: { store: t.keep.store, hp: t.keep.hp },
    buildings: t.buildings.map(b => ({ kind: b.kind, x: b.x, z: b.z, state: b.state, progress: b.progress, level: b.level || 1, style: b.style, angle: b.angle,
      off: [...b.off], nrec: b.B.recipes?.length, paused: b.paused, store: b.store, hp: b.hp, status: b.status, training: b.training || null, policy: b.policy || null, staff: b.staff ?? null, ripeAt: b.ripeAt ?? null, dry: b.dry ? b.dryWhy : null })),
    people: t.villagers.filter(v => v.state !== 'soldier').length,
    vets: t.villagers.filter(v => v.state !== 'soldier' && v.xp).map(v => v.xp),
    regiments: t.battle.regs.filter(r => r.side === 0 && !r.gone && !r.routing).map(r => ({
      key: r.T.key, count: r.soldiers.filter(s => s.alive && !s.gone).length, name: r.name, levy: r.levy || null, retinue: !!r.retinue, x: r.cx, z: r.cz, angle: r.angle,
      xp: r.xp || 0, elite: !!r.elite, hall: r.hall || null, armour: r.armour ?? null, shield: r.shield ?? null, battles: r.battles || 0, askedWeak: !!r.askedWeak, until: r.until || null, home: r.home ?? null, src: r.src ?? null,
    })).filter(r => r.count > 0),
    felled: t.trees.spots.filter(s => !s.standing).map(s => s.i),
    leaving: t.leavingMen(),
    deposits: [...t.nodes.rock, ...t.nodes.ore].map(n => n.left),
    roads: t.roads,
    lanes: t.lanes || null,
    walls: { nodes, pieces, centre: W.centre[0] },
    state: { taxes: t.taxes, mood: t.mood, grief: t.grief, governor: t.governor, hungry: t.hungry, time: t.time, territory: t.territory,
      nextMeal: t.nextMeal, nextArrival: t.nextArrival, earned: t.earned, keepLevel: t.keepLevel, keepPeak: t.keepPeak, keepBought: t.keepBought, feastAt: t.feastAt, feastUntil: t.feastUntil, masonsUntil: t.masonsUntil, flagColor: t.flagColor, misery: t.misery, rebelCool: t.rebelCool,
      settling: t.settling, fled: t.fled, fledBack: t.fledBack, game: t.game, cold: t.cold, lastRaid: t.lastRaid },
  };
}

function unpackTown(w, p, s) {
  const t = w.makeTown(p, { kind: s.kind, villagers: 0, retinue: false, stock: {} });
  Object.assign(t, s.state);
  // Saved before keeps were raised for gold: a keep past level 3 stays as it was.
  if (s.state.keepBought === undefined) t.keepBought = Math.max(0, (s.state.keepPeak || 1) - 3);
  t.keep.store = { ...s.keep.store };
  t.keep.hp = s.keep.hp;
  for (const i of s.felled) { const spot = t.trees.spots[i]; if (spot?.standing) t.trees.fell(spot); }
  for (const r of s.roads || []) { t.roads.push(r); t.pave(r); }
  t.roadsVersion++;
  if (s.lanes) t.lanes = s.lanes;
  // What is left in each outcrop and deposit (saved before they ran out: all of it).
  (s.deposits || []).forEach((left, i) => {
    const n = [...t.nodes.rock, ...t.nodes.ore][i];
    if (n && left !== null && left !== undefined) { n.left = left; if (left <= 0) n.standing = false; }
  });
  for (const b of s.buildings) {
    if (!BUILDINGS[b.kind] && RENAMED[b.kind]) b.kind = RENAMED[b.kind];
    if (!BUILDINGS[b.kind]) { console.warn(`[save] ${p.name}: dropped a '${b.kind}', not a building`); continue; }
    const r = t.place(b.kind, b.x, b.z, { ready: true });
    const nb = r.building;
    if (!nb) continue;
    Object.assign(nb, { state: b.state, progress: b.progress, level: b.level, style: b.style, angle: b.angle ?? nb.angle, off: new Set(b.off), paused: b.paused, store: { ...b.store }, hp: b.hp, status: b.status || '', training: b.training || null, policy: b.policy || undefined });
    // Recipes added since the save (a market's buying) start as the game makes them, not on.
    const first = nb.B.recipes?.findIndex(r => r.buy) ?? -1, had = b.nrec ?? (first < 0 ? Infinity : first);
    nb.B.recipes?.forEach((r, i) => { if (i >= had && (r.off || r.start === 'off')) nb.off.add(i); });
    // Older saves: a barracks' raw leather was its leather armour; it is now the good it is made into (one for one).
    if (nb.kind === 'barracks' && nb.store.leather) { nb.store.leatherarmour = (nb.store.leatherarmour || 0) + nb.store.leather; delete nb.store.leather; }
    if (b.staff !== null && b.staff !== undefined) nb.staff = b.staff;
    if (b.ripeAt) nb.ripeAt = b.ripeAt;
    if (b.dry) { nb.dry = t.time || 1; nb.dryWhy = b.dry; }   // worked out: its people don't go back
  }
  for (let i = 0; i < s.people; i++) {
    const a = t.rand() * Math.PI * 2;
    t.addVillager(Math.sin(a) * 16, Math.cos(a) * 16);
  }
  t.clearVillagers();   // (the ring they stand on at first can cross a building: Town.clearVillagers sets them just outside it)
  (s.vets || []).forEach((xp, i) => { if (t.villagers[i]) t.villagers[i].xp = xp; });
  // Regiments stand where they stood; a levy's men are villagers again if it disbands.
  for (let r of s.regiments) {
    // (an old save's levy of men-at-arms or knights is a plain levy now, its spare kit racked)
    const plain = plainLevy(r);
    if (plain) {
      r = { ...r, key: plain.key, name: plain.name, levy: plain.key, armour: plain.armour, shield: plain.shield };
      const racks = t.buildings.find(b => b.kind === 'barracks' && b.state === 'active') || t.keep;
      for (const [g, n] of Object.entries(plain.spare)) t.put(racks, g, n * r.count);
      w.madePlain = (w.madePlain || 0) + r.count;
    }
    const gear = { ...(r.armour ? { armour: r.armour, shield: !!r.shield } : {}), battles: r.battles || 0 };
    const reg = Object.assign(t.battle.addRegiment(0, r.key, r.x, r.z, r.angle, { count: r.count, name: r.name, xp: r.xp || 0, ...gear }), gear);
    reg.retinue = r.retinue;
    reg.askedWeak = !!r.askedWeak;
    reg.elite = !!r.elite;
    reg.hall = r.hall || null;
    if (r.until) reg.until = r.until;
    if (r.home !== null && r.home !== undefined) reg.home = r.home;
    if (r.src !== null && r.src !== undefined) reg.src = r.src;
    if (r.levy) {
      reg.levy = r.levy;
      for (const sol of reg.soldiers) {
        const v = t.addVillager(sol.x, sol.z);
        v.state = 'soldier'; v.soldier = sol; sol.villager = v; v.xp = r.xp || 0;
      }
    }
  }
  // Walls, towers and gates, as built and as damaged.
  const W = t.battle.walls;
  if (s.walls.pieces.length || s.walls.nodes.some(n => n.tower)) {
    const nodes = s.walls.nodes.map(n => W.node(n.x, n.z, 0, { snap: false }));
    for (const q of s.walls.pieces) {
      const piece = W.addPiece(nodes[q.a], nodes[q.b], 0, q.material, true);
      if (q.gate) W.makeGate(piece, { ready: true });
      if (q.broken) Object.assign(piece, { hp: 0, state: 'broken', open: true });
      else piece.hp = Math.min(piece.maxHp, q.hp);
    }
    s.walls.nodes.forEach(n => {
      if (!n.tower) return;
      const r = W.placeTower(n.x, n.z, 0, n.tower.material, { ready: true });
      if (r.ok) r.tower.hp = n.tower.hp;
    });
    if (s.walls.centre) W.centre[0] = s.walls.centre;
    W.changed();
  }
  t.stockCache = null;
  return t;
}

// ---- loading ----

// A place's building numbers hold BUILDINGS kinds only. Saves from before 2026-11-21 may hold
// a vassal's 'chapel' (the chapel is `monastery`), which froze the map on every frame.
const RENAMED = { chapel: 'monastery' };
export function fixKinds(tally, where) {
  for (const k of Object.keys(tally)) {
    if (BUILDINGS[k]) continue;
    const to = RENAMED[k], n = tally[k];
    delete tally[k];
    if (to) tally[to] = (tally[to] || 0) + n;
    console.warn(`[save] ${where}: building kind '${k}' ${to ? `is now '${to}'` : 'is not a building; dropped'} (${n})`);
  }
}

export function loadGame(data, hooks) {
  // The map from its seed, quietly: no heralds while it is being put back.
  const quiet = { ...hooks, herald: () => {}, offer: () => {}, ask: () => {}, townAttacked: () => {} };
  const w = new World(data.seed, quiet, data.world.options);
  w.campaignId = data.id || `seed${data.seed}`;
  if (data.world.part === 2) w.beginPart2();
  for (const p of w.pois) p.town = null;
  // Armies first as empty shells, so anything pointing at one finds it.
  const armyById = new Map(data.armies.map(a => [a.id, {}]));
  w.armies = [...armyById.values()];
  const dec = decoder(w, armyById);
  // Houses, then places, then armies, then the world's own state.
  data.houses.forEach((h, i) => {
    const live = FACTIONS[i];
    if (!live) return;
    for (const k of Object.keys(live)) if (!(k in h) && k !== 'taunts') delete live[k];
    Object.assign(live, dec(h));
  });
  const DYNAMIC = ['seat', 'mem', 'known', 'falling', 'eco', 'intel', 'vassal', 'epithet', 'free', 'siegeFood'];
  data.pois.forEach((p, i) => {
    const live = w.pois[i];
    if (!live) return;
    for (const k of DYNAMIC) if (!(k in p)) delete live[k];
    Object.assign(live, dec(p));
  });
  for (const p of w.pois) if (p.eco?.buildings) fixKinds(p.eco.buildings, p.name);
  for (const a of data.armies) Object.assign(armyById.get(a.id), dec(a));
  // Fights waiting on a decision are not saved; their armies are free to move again.
  for (const a of w.armies) a.halted = false;
  const W = data.world;
  for (const k of WORLD_KEYS) if (W[k] !== undefined) w[k] = dec(W[k]);
  // The winter (economy.js WINTERS): the address's choice, if it names one, over what the save kept, and then kept in the save.
  w.options.winter = setWinter(winterFromUrl() || w.options?.winter);
  w.part = W.part;
  w.wall.fallen = W.wallFallen;
  w.events = dec(W.events);
  w.home = FACTIONS[0].seat || w.home;
  if (w.works) restoreWorks(w);
  for (const s of data.towns) unpackTown(w, w.pois[s.i], s);
  // places remembered under the old layout rule are laid out anew, once (places.js)
  relayOld(w);
  // A place keeps only its strongbox, as the first tick would leave it: a save made before
  // strongboxes (no `boxed`) may hold thousands. A newer one loads as it was, a few heads'
  // gold over where men were armed after the tick's count, and its next tick settles it.
  if (!data.boxed) for (const p of w.pois) if (p.eco?.buildings && !p.town) w.strongbox(p.eco, p.owner === null ? null : FACTIONS[p.owner], vassalOf(w, p));
  // Levies of trained kinds in armies on the map, as in the villages above: plain levies now,
  // their spare kit sent to the racks at home.
  for (const a of w.armies) for (const u of a.units || []) {
    const plain = plainLevy(u);
    if (!plain) continue;
    const home = w.home?.town;
    if (home) for (const [g, n] of Object.entries(plain.spare)) home.put(home.buildings.find(b => b.kind === 'barracks' && b.state === 'active') || home.keep, g, n * u.count);
    w.madePlain = (w.madePlain || 0) + u.count;
    Object.assign(u, { key: plain.key, name: plain.name, levy: plain.key, armour: plain.armour, shield: plain.shield });
  }
  w.encounter = null;
  w.hooks = hooks;
  // Men who were walking out of a village after a peace are on the road home.
  for (const s of data.towns) for (const l of s.leaving || []) {
    const a = w.spawnArmy(l.house, l.units, w.pois[s.i], l.name);
    if (l.loot) a.loot = l.loot;
    w.retreat(a);
  }
  w.updateVision();
  w.log('Campaign loaded.');
  if (w.madePlain) w.log(`${w.madePlain} levied men-at-arms and knights are plain levies now: those are trained in a knights' hall, from veterans. Their spare kit is in the racks.`);
  delete w.madePlain;
  return w;
}
