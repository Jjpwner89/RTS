// The campaign map: a handful of places, the roads between them, and armies marching
// along those roads. Places you hold are full villages (economy.js) that keep running
// while you look elsewhere. The rival house and the free villages are kept abstract
// for now: a garrison that grows, and armies sent out from it.
import { Battle, TYPES } from '../battle.js';
import { Town } from '../economy.js';
import { makeHeight, plantTrees } from '../terrain.js';
import { rng } from '../noise.js';
import { thinkAI } from '../ai.js';

export const FACTIONS = [
  { name: 'Your house', color: '#3d6fd6' },
  { name: 'House Varn', color: '#c8423a' },
];
export const NEUTRAL = { name: 'Free folk', color: '#b8ab90' };
export const ownerOf = p => (p.owner === null ? NEUTRAL : FACTIONS[p.owner]);

const VALUE = { spear: 1, sword: 1.25, archer: 0.9, cav: 2.2, militia: 0.7, bandit: 0.7 };
export const power = units => units.reduce((n, u) => n + u.count * (VALUE[u.key] || 1), 0);
export const headcount = units => units.reduce((n, u) => n + u.count, 0);

const SPEED = 6;        // world units a second along a road
const MEET = 14;        // opposing armies this close fight
const GRACE = 360;      // the rival leaves your villages alone for the first six minutes

// The first playtest map: your seat in the south, House Varn's in the north, and two
// free villages between them that both sides will want.
const PLACES = [
  { id: 'ashford', name: 'Ashford', x: 0, z: 330, owner: 0, seat: true },
  { id: 'hollin', name: 'Hollin', x: -310, z: 30, owner: null },
  { id: 'stowe', name: 'Stowe', x: 300, z: -20, owner: null },
  { id: 'blackmoor', name: 'Blackmoor', x: 0, z: -340, owner: 1, seat: true },
];
const ROADS = [['ashford', 'hollin'], ['ashford', 'stowe'], ['hollin', 'blackmoor'], ['stowe', 'blackmoor']];

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Neutral villages come with a few buildings already standing.
function prebuild(town, kinds, rand) {
  for (const kind of kinds) {
    for (let tries = 0; tries < 200; tries++) {
      const a = rand() * Math.PI * 2, r = 25 + rand() * 60;
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      if (!town.canPlace(kind, x, z).ok) continue;
      const res = town.place(kind, x, z);
      const b = res.building;
      for (const [g, n] of Object.entries(b.B.cost)) town.stock[g] += n;
      Object.assign(b, { state: 'active', progress: 1, status: b.B.jobs ? 'Waiting for workers' : '' });
      break;
    }
  }
}

export class World {
  // hooks: watching() → the place on screen, ask(encounter), townAttacked(place, army),
  // fell(place), captured(place), ended(winner)
  constructor(seed, hooks) {
    this.seed = seed;
    this.hooks = hooks;
    this.rand = rng(seed + 3);
    this.time = 0;
    this.events = [];
    this.armies = [];
    this.nextArmy = 1;
    this.encounter = null;
    this.winner = null;
    this.pois = PLACES.map((p, i) => ({ ...p, seed: seed + 1000 * (i + 1), garrison: [], town: null, links: [] }));
    this.byId = Object.fromEntries(this.pois.map(p => [p.id, p]));
    this.roads = ROADS.map(([a, b]) => ({ a: this.byId[a], b: this.byId[b] }));
    for (const r of this.roads) { r.a.links.push(r.b); r.b.links.push(r.a); }
    for (const p of this.pois) {
      if (p.owner === 0) this.makeTown(p, {});
      else if (p.owner === null) p.garrison = [unit('militia', 30, `${p.name} militia`), unit('archer', 10, `${p.name} bowmen`)];
      else p.garrison = [unit('spear', 50, 'Varn spearmen'), unit('sword', 30, 'Varn men-at-arms'), unit('archer', 24, 'Varn archers')];
    }
    this.ai = { recruit: 0, think: 150, cycle: 0 };
  }

  log(text, side = 0) { this.events.push({ time: this.time, side, text }); }

  // The direction of a road leaving `p` toward `q`, as an angle on p's own village map.
  angle(p, q) { return Math.atan2(q.x - p.x, q.z - p.z); }

  makeTown(p, opts) {
    const heightAt = makeHeight(p.seed, [{ x: 0, z: 0 }]);
    p.roadAngles = p.links.map(q => this.angle(p, q));
    // Roads in from the edge stay clear of trees so armies can march in.
    const onRoad = (x, z) => p.roadAngles.some(a => {
      const along = x * Math.sin(a) + z * Math.cos(a), across = x * Math.cos(a) - z * Math.sin(a);
      return along > 0 && Math.abs(across) < 7;
    });
    const trees = plantTrees(p.seed, (x, z) => Math.hypot(x, z) < 45 || onRoad(x, z), 0.5, 1500);
    const battle = new Battle(heightAt, p.seed, { deploy: false, homes: [{ x: 0, z: 0 }, { x: 0, z: -225 }], disbandAtHome: [false, true] });
    const town = new Town(battle, heightAt, trees, rng(p.seed + 7), opts);
    town.onFall = () => { p.falling = true; };
    Object.assign(p, { town, heightAt, trees, garrison: [], aiClock: 0, pruneClock: 30, onRoad });
    return town;
  }

  // ---- armies ----

  spawnArmy(side, units, at, name) {
    const a = { id: this.nextArmy++, side, units, name: name || (side === 0 ? 'Your army' : 'Varn host'),
      x: at.x, z: at.z, at, last: at, path: [], heading: 0, halted: false, retreating: false, mode: 'assault' };
    this.armies.push(a);
    return a;
  }

  removeArmy(a) { this.armies = this.armies.filter(o => o !== a); a.gone = true; }

  // Shortest way by road from one place to another.
  route(from, to) {
    const d = new Map(this.pois.map(p => [p, Infinity])), prev = new Map();
    d.set(from, 0);
    const open = new Set(this.pois);
    while (open.size) {
      let u = null;
      for (const p of open) if (!u || d.get(p) < d.get(u)) u = p;
      open.delete(u);
      for (const q of u.links) {
        const nd = d.get(u) + dist(u, q);
        if (nd < d.get(q)) { d.set(q, nd); prev.set(q, u); }
      }
    }
    const path = [];
    for (let p = to; p && p !== from; p = prev.get(p)) path.unshift(p);
    return { path, length: d.get(to) };
  }

  // March to a place. An army out on a road turns back or carries on, whichever is shorter.
  order(a, dest) {
    if (a.halted || a.retreating) return false;
    const ends = a.at ? [a.at] : [a.last, a.path[0]].filter(Boolean);
    let best = null;
    for (const e of ends) {
      const r = this.route(e, dest);
      const len = dist(a, e) + r.length;
      if (!best || len < best.len) best = { len, path: e === a.at ? r.path : [e, ...r.path] };
    }
    if (!best || !best.path.length) return false;
    a.path = best.path;
    a.at = null;
    return true;
  }

  moveArmy(a, dt) {
    if (a.halted || !a.path.length) return;
    const to = a.path[0];
    const d = dist(a, to), step = SPEED * dt;
    a.heading = Math.atan2(to.x - a.x, to.z - a.z);
    if (d > step) { a.x += (to.x - a.x) / d * step; a.z += (to.z - a.z) / d * step; a.at = null; return; }
    a.x = to.x; a.z = to.z;
    const came = a.last;
    a.last = to;
    a.path.shift();
    // Marching on through your own place; anywhere else, the army stops and acts.
    if (a.path.length && to.owner === a.side) return;
    a.at = to;
    this.arrive(a, to, came);
  }

  arrive(a, p, came) {
    a.path = [];
    a.retreating = false;
    if (p.owner === a.side) {
      if (a.side === 1) { mergeInto(p.garrison, a.units); this.removeArmy(a); }
      else if (p.town) this.enterTown(a, p, came);
      return;
    }
    if (a.side === 0) { this.ask({ kind: 'assault', army: a, poi: p }); return; }
    // An army of yours waiting outside meets them before they reach the village.
    const guard = this.armies.find(o => o.side === 0 && o.at === p && !o.path.length && !o.halted);
    if (guard) { this.ask({ kind: 'field', army: guard, enemy: a, poi: p, then: () => this.arrive(a, p, came) }); return; }
    if (p.owner === 0) this.attackTown(a, p, came);
    else this.autoAssault(a, p);
  }

  enterTown(a, p, came) {
    p.town.addTroops(a.units, this.angle(p, came === p ? p.links[0] : came));
    this.removeArmy(a);
    this.log(`Your army has marched into ${p.name}.`);
  }

  // Regiments leave a village of yours and become an army on the map.
  muster(p, regs) {
    const units = p.town.takeTroops(regs);
    if (!units.length) return null;
    const a = this.spawnArmy(0, units, p, `Army of ${p.name}`);
    this.log(`${a.name} has mustered: ${headcount(units)} men.`);
    return a;
  }

  // Back to the nearest place the army's side holds; with nowhere to go, it scatters.
  retreat(a) {
    const home = this.pois.filter(p => p.owner === a.side)
      .sort((p, q) => dist(a, p) - dist(a, q))[0];
    if (!home || !a.units.length) { this.removeArmy(a); return; }
    a.halted = false;
    if (a.at === home) { this.arrive(a, home, a.last); return; }
    a.retreating = false;
    this.order(a, home);
    a.retreating = true;
  }

  // ---- fights ----

  ask(enc) {
    this.encounter = enc;
    enc.army.halted = true;
    if (enc.enemy) enc.enemy.halted = true;
    enc.defenders = enc.kind === 'assault' ? enc.poi.garrison : enc.enemy.units;
    this.hooks.ask(enc);
  }

  // The player thinks better of an attack and falls back without a fight.
  pullBack(enc) {
    this.encounter = null;
    enc.army.halted = false;
    this.log(`${enc.army.name} pulls back from ${enc.poi.name}.`);
    this.retreat(enc.army);
  }

  // A quick sum of strength with some luck either way, for fights nobody watches.
  resolve(A, D, bonus = 1) {
    const pa = power(A) * (0.85 + this.rand() * 0.3), pd = power(D) * bonus * (0.85 + this.rand() * 0.3);
    const attackerWins = pa > pd;
    const ratio = Math.min(pa, pd) / Math.max(pa, pd, 1);
    const winLoss = 0.12 + 0.45 * ratio * ratio, loseLoss = 0.55 + 0.3 * ratio;
    const cut = (units, f) => units.map(u => ({ ...u, count: Math.round(u.count * (1 - f)) })).filter(u => u.count >= 3);
    return { attackerWins, A: cut(A, attackerWins ? winLoss : loseLoss), D: cut(D, attackerWins ? loseLoss : winLoss) };
  }

  autoResolve(enc) {
    const r = this.resolve(enc.army.units, enc.defenders, enc.kind === 'assault' ? 1.2 : 1);
    this.settle(enc, r.attackerWins, r.A, r.D);
    return r.attackerWins;
  }

  // The outcome of a fight the player was in, fought or auto-resolved.
  settle(enc, won, mine, theirs) {
    this.encounter = null;
    const a = enc.army;
    a.halted = false;
    a.units = mine;
    const was = enc.poi ? enc.poi.name : 'the road';
    if (enc.kind === 'assault') {
      const p = enc.poi;
      if (won) { this.log(`You have taken ${p.name}!`); this.capture(p, a); }
      else { p.garrison = theirs; this.log(`The attack on ${p.name} failed.`, 1); this.retreat(a); }
    } else {
      const e = enc.enemy;
      e.halted = false;
      e.units = theirs;
      if (won) {
        this.log(`The Varn host was beaten at ${was}.`);
        this.retreat(e);
        if (!a.units.length) this.removeArmy(a);
      } else {
        this.log(`Your army was beaten at ${was}.`, 1);
        this.retreat(a);
        if (!e.units.length) this.removeArmy(e);
        else enc.then?.();
      }
    }
    this.checkEnd();
  }

  capture(p, a) {
    const free = p.owner === null;
    p.owner = 0;
    const town = this.makeTown(p, { villagers: free ? 10 : 6, retinue: false, stock: { wood: 60, stone: 10, food: 50, planks: 10 } });
    prebuild(town, free ? ['house', 'farm', 'woodcutter'] : ['farm'], town.rand);
    town.addTroops(a.units, this.angle(p, a.last === p ? p.links[0] : a.last));
    this.removeArmy(a);
    this.hooks.captured(p);
  }

  // The rival marches on one of your villages: the fight happens there, in the village itself.
  attackTown(a, p, came) {
    const t = p.town;
    this.removeArmy(a);
    t.receiveAttack(a.units, this.angle(p, came), {
      mode: a.mode, name: a.name,
      onLeave: survivors => {
        if (t.lost || !survivors.length) return;
        const back = this.spawnArmy(1, survivors, p, a.name);
        this.retreat(back);
      },
    });
    // The village's own message says it when you are there to see it.
    if (this.hooks.watching() !== p) this.log(a.mode === 'raid' ? `Varn raiders have reached ${p.name}!` : `The Varn host is attacking ${p.name}!`, 1);
    this.hooks.townAttacked(p, a);
  }

  autoAssault(a, p) {
    const r = this.resolve(a.units, p.garrison, 1.2);
    a.units = r.A;
    if (r.attackerWins) {
      const was = p.owner === null ? 'free village' : 'village';
      p.owner = 1;
      p.garrison = r.A;
      this.removeArmy(a);
      this.log(`House Varn has taken the ${was} of ${p.name}.`, 1);
    } else {
      p.garrison = r.D;
      this.retreat(a);
    }
  }

  // The keep has fallen: the place goes to the rival, and your survivors make for home.
  fall(p) {
    const t = p.town;
    p.falling = false;
    const alive = r => r.soldiers.filter(s => s.alive).length;
    const theirs = t.attackers.flatMap(g => g.regs).filter(r => !r.disbanded && alive(r) > 0)
      .map(r => unit(r.T.key, alive(r), r.name));
    const ours = t.garrison().filter(r => alive(r) > 0)
      .map(r => ({ key: r.T.key, count: alive(r), name: r.name, levy: r.levy || null, retinue: !!r.retinue }));
    Object.assign(p, { owner: 1, town: null, garrison: theirs.length ? theirs : [unit('spear', 10, 'Varn spearmen')] });
    this.log(`${p.name} has fallen to House Varn.`, 1);
    if (ours.length) this.retreat(this.spawnArmy(0, ours, p, `Survivors of ${p.name}`));
    this.hooks.fell(p);
    this.checkEnd();
  }

  checkMeetings() {
    if (this.encounter) return;
    for (const a of this.armies) {
      if (a.side !== 0 || a.halted || a.retreating) continue;
      for (const e of this.armies) {
        if (e.side !== 1 || e.halted || e.retreating) continue;
        if (dist(a, e) < MEET) { this.ask({ kind: 'field', army: a, enemy: e, poi: a.at || e.at }); return; }
      }
    }
  }

  // ---- the rival ----

  defence(p) {
    if (!p.town) return power(p.garrison) * 1.2;
    const regs = p.town.garrison();
    return regs.reduce((n, r) => n + r.alive * (VALUE[r.T.key] || 1), 0) + 25 + p.town.population * 0.3;
  }

  thinkEnemy(dt) {
    const seat = this.byId.blackmoor;
    if (seat.owner !== 1) return;
    const held = this.pois.filter(p => p.owner === 1);
    // New men come in at the seat, faster the more villages House Varn holds.
    this.ai.recruit += dt * (0.06 + 0.04 * (held.length - 1));
    while (this.ai.recruit >= 6) {
      this.ai.recruit -= 6;
      const kinds = ['spear', 'archer', 'spear', 'sword', this.time > 480 ? 'cav' : 'sword'];
      recruit(seat.garrison, kinds[this.ai.cycle++ % kinds.length], 6);
    }
    this.ai.think -= dt;
    if (this.ai.think > 0) return;
    this.ai.think = 10;

    // Villages hold a garrison of about forty; anyone beyond that goes back to the seat.
    for (const p of held) {
      if (p === seat || headcount(p.garrison) < 60 || this.armies.some(a => a.side === 1 && a.at === p)) continue;
      const extra = takeUnits(p.garrison, power(p.garrison) - 45);
      if (extra.length) this.retreat(Object.assign(this.spawnArmy(1, extra, p, 'Varn column'), { last: p }));
    }

    // One expedition at a time, never leaving the seat bare.
    if (this.armies.some(a => a.side === 1 && !a.retreating) || this.pois.some(p => p.town?.underAttack)) return;
    const spare = power(seat.garrison) - 45;
    if (spare < 30) return;
    const options = this.pois.filter(p => p.owner !== 1 && (p.owner === null || this.time > GRACE))
      .map(p => ({ p, def: this.defence(p), len: this.route(seat, p).length }))
      .sort((x, y) => x.def - y.def || x.len - y.len);
    for (const o of options) {
      let mode = null;
      if (spare >= o.def * 1.35) mode = 'assault';
      else if (o.p.owner === 0 && this.time > GRACE + 120 && spare >= o.def * 0.6) mode = 'raid';
      if (!mode) continue;
      const want = mode === 'assault' ? o.def * 1.6 + 20 : Math.min(spare, o.def * 0.8 + 10);
      const units = takeUnits(seat.garrison, Math.min(spare, want));
      const a = this.spawnArmy(1, units, seat, mode === 'raid' ? 'Varn raiders' : 'Varn host');
      a.mode = mode;
      this.order(a, o.p);
      if (o.p.owner === 0) this.log(`Scouts report ${a.name} marching from Blackmoor: ${headcount(units)} men.`, 1);
      return;
    }
  }

  checkEnd() {
    if (this.winner !== null) return;
    if (this.byId.blackmoor.owner === 0) this.winner = 0;
    else if (!this.pois.some(p => p.owner === 0) && !this.armies.some(a => a.side === 0)) this.winner = 1;
    if (this.winner !== null) this.hooks.ended(this.winner);
  }

  // ---- time ----

  update(dt) {
    if (this.winner !== null) return;
    this.time += dt;
    for (const p of this.pois) if (p.town) this.updateTown(p, dt);
    for (const a of [...this.armies]) if (!a.gone) this.moveArmy(a, dt);
    this.checkMeetings();
    this.thinkEnemy(dt);
  }

  updateTown(p, dt) {
    const t = p.town, b = t.battle;
    b.step(dt);
    t.update(dt);
    p.aiClock -= dt;
    if (p.aiClock <= 0) {
      p.aiClock = 1;
      t.thinkAttackers();
      // With nobody watching, the garrison turns out against attackers by itself.
      if (t.underAttack && this.hooks.watching() !== p) thinkAI(b, 0, { start: 0 });
    }
    p.pruneClock -= dt;
    if (p.pruneClock <= 0) { p.pruneClock = 30; b.prune(); }
    if (p.falling) this.fall(p);
  }
}

function unit(key, count, name) { return { key, count, name }; }

// Folds arriving units into a garrison, filling regiments of the same kind first.
function mergeInto(garrison, units) {
  for (const u of units) recruit(garrison, u.key, u.count, u.name);
}

function recruit(garrison, key, n, name) {
  while (n > 0) {
    let g = garrison.find(u => u.key === key && u.count < TYPES[key].count);
    if (!g) garrison.push(g = unit(key, 0, name || `Varn ${TYPES[key].name.toLowerCase()}`));
    const k = Math.min(n, TYPES[key].count - g.count);
    g.count += k;
    n -= k;
  }
}

// Takes roughly `want` strength out of a garrison, a slice of each regiment.
function takeUnits(garrison, want) {
  const total = power(garrison);
  if (want <= 0 || total <= 0) return [];
  const f = Math.min(1, want / total);
  const out = [];
  for (const g of garrison) {
    const k = Math.round(g.count * f);
    if (k < 3) continue;
    g.count -= k;
    out.push(unit(g.key, k, g.name));
  }
  for (let i = garrison.length - 1; i >= 0; i--) if (garrison[i].count < 3) garrison.splice(i, 1);
  return out;
}
