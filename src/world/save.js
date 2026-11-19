// Saving and loading a campaign. The map itself comes back from its seed; what is saved
// is everything that has happened since: who holds what, the armies on the roads, the
// houses' gold, moods and plans, and each of your villages as it stands (buildings,
// goods, people, regiments and walls). A save is made only between fights, so no battle
// is ever half-saved. One slot, kept in the browser.
import { World, FACTIONS } from './world.js';

const KEY = 'rts.campaign.save';
const VERSION = 1;

// ---- what can be saved ----

export function canSave(w, { busy = false } = {}) {
  if (w.winner !== null) return { ok: false, reason: 'The campaign is over' };
  if (busy || w.encounter) return { ok: false, reason: 'Finish the fight first' };
  if (w.pois.some(p => p.town && (p.town.hostile || p.town.underAttack))) return { ok: false, reason: 'A village is being fought over' };
  if (w.pois.some(p => p.town?.revolt)) return { ok: false, reason: 'A village is in revolt' };
  return { ok: true };
}

export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}

export function saveInfo() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); return s && { at: s.savedAt, time: s.world.time, seed: s.seed, part: s.world.part }; } catch { return null; }
}

export function readSave() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); return s?.version === VERSION ? s : null; } catch { return null; }
}

export function saveGame(w) {
  const data = { version: VERSION, seed: w.seed, savedAt: Date.now(), ...pack(w) };
  try { localStorage.setItem(KEY, JSON.stringify(data)); return { ok: true }; }
  catch (e) { return { ok: false, reason: 'The browser would not store it' }; }
}

export function clearSave() { try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ } }

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

const WORLD_KEYS = ['time', 'nextArmy', 'winner', 'victory', 'crowned', 'wars', 'met', 'half', 'dip', 'dipClock', 'ecoClock', 'sightClock', 'supplyClock', 'goals', 'spies', 'vassals', 'vassalId', 'faction', 'coalition', 'eventClock', 'lastEvent', 'banditPeace', 'rankSeen', 'companies', 'captains', 'captainId', 'lordHurt', 'chronicle', 'cairns'];

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
    buildings: t.buildings.map(b => ({ kind: b.kind, x: b.x, z: b.z, state: b.state, progress: b.progress, level: b.level || 1, style: b.style,
      off: [...b.off], paused: b.paused, store: b.store, hp: b.hp, status: b.status, training: b.training || null, policy: b.policy || null })),
    people: t.villagers.filter(v => v.state !== 'soldier').length,
    vets: t.villagers.filter(v => v.state !== 'soldier' && v.xp).map(v => v.xp),
    regiments: t.battle.regs.filter(r => r.side === 0 && !r.gone && !r.routing).map(r => ({
      key: r.T.key, count: r.soldiers.filter(s => s.alive && !s.gone).length, name: r.name, levy: r.levy || null, retinue: !!r.retinue, x: r.cx, z: r.cz, angle: r.angle,
      xp: r.xp || 0, elite: !!r.elite, hall: r.hall || null, armour: r.armour ?? null, shield: r.shield ?? null, battles: r.battles || 0,
    })).filter(r => r.count > 0),
    felled: t.trees.spots.filter(s => !s.standing).map(s => s.i),
    walls: { nodes, pieces, centre: W.centre[0] },
    state: { taxes: t.taxes, mood: t.mood, grief: t.grief, governor: t.governor, hungry: t.hungry, time: t.time, territory: t.territory,
      nextMeal: t.nextMeal, nextArrival: t.nextArrival, earned: t.earned, keepLevel: t.keepLevel, flagColor: t.flagColor, misery: t.misery, rebelCool: t.rebelCool },
  };
}

function unpackTown(w, p, s) {
  const t = w.makeTown(p, { kind: s.kind, villagers: 0, retinue: false, stock: {} });
  Object.assign(t, s.state);
  t.keep.store = { ...s.keep.store };
  t.keep.hp = s.keep.hp;
  for (const i of s.felled) { const spot = t.trees.spots[i]; if (spot?.standing) t.trees.fell(spot); }
  for (const b of s.buildings) {
    const r = t.place(b.kind, b.x, b.z, { ready: true });
    const nb = r.building;
    if (!nb) continue;
    Object.assign(nb, { state: b.state, progress: b.progress, level: b.level, style: b.style, off: new Set(b.off), paused: b.paused, store: { ...b.store }, hp: b.hp, status: b.status || '', training: b.training || null, policy: b.policy || undefined });
  }
  for (let i = 0; i < s.people; i++) {
    const a = t.rand() * Math.PI * 2;
    t.addVillager(Math.sin(a) * 16, Math.cos(a) * 16);
  }
  (s.vets || []).forEach((xp, i) => { if (t.villagers[i]) t.villagers[i].xp = xp; });
  // Regiments stand where they stood; a levy's men are villagers again if it disbands.
  for (const r of s.regiments) {
    const gear = { ...(r.armour ? { armour: r.armour, shield: !!r.shield } : {}), battles: r.battles || 0 };
    const reg = Object.assign(t.battle.addRegiment(0, r.key, r.x, r.z, r.angle, { count: r.count, name: r.name, xp: r.xp || 0, ...gear }), gear);
    reg.retinue = r.retinue;
    reg.elite = !!r.elite;
    reg.hall = r.hall || null;
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

export function loadGame(data, hooks) {
  // The map from its seed, quietly: no heralds while it is being put back.
  const quiet = { ...hooks, herald: () => {}, offer: () => {}, ask: () => {}, townAttacked: () => {} };
  const w = new World(data.seed, quiet);
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
  const DYNAMIC = ['seat', 'mem', 'known', 'falling', 'eco', 'intel', 'vassal', 'epithet', 'free'];
  data.pois.forEach((p, i) => {
    const live = w.pois[i];
    if (!live) return;
    for (const k of DYNAMIC) if (!(k in p)) delete live[k];
    Object.assign(live, dec(p));
  });
  for (const a of data.armies) Object.assign(armyById.get(a.id), dec(a));
  // Fights waiting on a decision are not saved; their armies are free to move again.
  for (const a of w.armies) a.halted = false;
  const W = data.world;
  for (const k of WORLD_KEYS) if (W[k] !== undefined) w[k] = dec(W[k]);
  w.part = W.part;
  w.wall.fallen = W.wallFallen;
  w.events = dec(W.events);
  w.home = FACTIONS[0].seat || w.home;
  for (const s of data.towns) unpackTown(w, w.pois[s.i], s);
  w.encounter = null;
  w.hooks = hooks;
  w.updateVision();
  w.log('Campaign loaded.');
  return w;
}
