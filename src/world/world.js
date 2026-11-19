// The campaign map: a realm of about thirty places, the roads between them, and armies
// marching along those roads. Places you hold are full villages (economy.js) that keep
// running while you look elsewhere. Everyone else's places are holdings run on the same
// rules at a coarser grain: people grow, workshops make arms, and soldiers are raised
// from the people. The rival houses' minds are in rivals.js.
import { Battle, TYPES } from '../battle.js';
import { makeVassal, vassalOf, holdingsOf, living, mark, remember as recall, opinion, share, tickVassals, DUES, LEVIES, COUNCIL, GIFT } from './vassals.js';
import { tickCompanies, companiesIn, MOOD as COMPANY_MOOD } from './companies.js';
import { seedEconomy, runEconomy, housing, kits, arm, fromTown, burn, stores, report, worth, WEALTH } from './holdings.js';
import { Town } from '../economy.js';
import { makeHeight, plantTrees } from '../terrain.js';
import { rng } from '../noise.js';
import { thinkAI, thinkSiegeAttack } from '../ai.js';
import { buildFort } from '../walls.js';
import { generateRealm, generateBeyond, KINDS, BANDITS, INVADER, REALM_RADIUS } from './realm.js';
import { thinkHouses, startHouseMinds, startMind } from './rivals.js';
import { supplyArmies, moveWagon, catchWagons, provision, takeFood, capacity, wound, heal } from './supply.js';
import { govern } from './governor.js';
import { startDiplomacy, thinkDiplomacy, note, strengthOf, backers } from './diplomacy.js';

// The houses of this campaign by index (you are 0), and the bandits last. Filled in by
// the World so drawing code can look owners up without holding the world.
export const FACTIONS = [];
export const NEUTRAL = { name: 'Free folk', short: 'Free', color: '#b8ab90' };
export const ownerOf = p => (p.owner === null ? NEUTRAL : FACTIONS[p.owner]);

const VALUE = { spear: 1, sword: 1.25, archer: 0.9, cav: 2.2, militia: 0.7, bandit: 0.7,
  crossbow: 1.1, lightcav: 1.6, heavycav: 2.6, maa: 1.5, knight: 3.2 };
const value = key => TYPES[key]?.value ?? VALUE[key] ?? 1;
export const power = units => units.reduce((n, u) => n + u.count * value(u.key), 0);
export const headcount = units => units.reduce((n, u) => n + u.count, 0);

const SPEED = 6;        // world units a second along a road
const MEET = 14;        // opposing armies this close fight
// A rival place's smithy makes kit for one man every ninety seconds (yours, run hard, make
// one every twelve), and families settle in its houses as they do in yours.
const SMITHY = 1 / 90, ARRIVALS = 1 / 18;
export const GRACE = 1200;     // rival houses leave your villages, and the free ones beside them, alone for twenty minutes
const SIGHT = { place: 250, army: 190 };

export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// What stands in a place you storm or take: a real village sized to its people. Houses
// line the roads in, workshops round the middle, farms out in the fields; a lord's seat
// has more of everything and the royal city most of all.
function layOut(town, p, lvl, rand, near = 18) {
  const pop = p.eco?.pop ?? 20, seat = p.seat !== undefined, crown = p.kind === 'crown';
  const k = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(n)));
  // A place with a real economy stands as it was built (holdings.js).
  const B = p.eco?.buildings;
  const houses = B ? Math.min(40, B.house || 0) : k(pop / 5, 3, crown ? 36 : 24);
  const farms = B ? Math.min(14, B.farm || 0) : k(pop / 14, 1, crown ? 9 : 7);
  const crafts = B ? Object.entries(B).filter(([kind]) => kind !== 'house' && kind !== 'farm').flatMap(([kind, n]) => Array(Math.min(n, 6)).fill(kind)) : [
    'storehouse', 'woodcutter', 'hunter',
    ...(lvl >= 2 || seat ? ['carpenter', 'quarry', 'storehouse', 'woodcutter', 'flax'] : []),
    ...(lvl >= 3 || seat ? ['ropemaker', 'bowyer', 'smelter', 'mine'] : []),
    ...(seat || crown || p.kind === 'castle' ? ['barracks', 'weaponsmith'] : []),
    ...(crown ? ['storehouse', 'carpenter', 'barracks', 'bowyer'] : []),
  ];
  // A place that already has its streets back (see remember) only gets what it lacks.
  const have = {};
  for (const b of town.buildings) have[b.kind] = (have[b.kind] || 0) + 1;
  const lacking = kind => have[kind] > 0 ? (have[kind]--, false) : true;
  const roads = p.roadAngles?.length ? p.roadAngles : [rand() * Math.PI * 2];
  const at = (kind, spot) => {
    for (let tries = 0; tries < 60; tries++) {
      const { x, z } = spot();
      if (!town.canPlace(kind, x, z, { free: true }).ok) continue;
      town.place(kind, x, z, { ready: true });
      return true;
    }
    return false;
  };
  // Houses either side of a road, thickest near the keep, a few in the lanes between.
  const street = (lo, hi) => () => {
    const a = roads[Math.floor(rand() * roads.length)], along = lo + Math.pow(rand(), 1.4) * (hi - lo);
    const across = (rand() < 0.5 ? -1 : 1) * (8 + rand() * 7);
    return { x: Math.sin(a) * along + Math.cos(a) * across, z: Math.cos(a) * along - Math.sin(a) * across };
  };
  const ring = (lo, hi) => () => { const a = rand() * Math.PI * 2, r = lo + rand() * (hi - lo); return { x: Math.sin(a) * r, z: Math.cos(a) * r }; };
  for (let i = have.house || 0; i < houses; i++) at('house', rand() < 0.75 ? street(near, near + 55) : ring(near, near + 35)) || at('house', ring(near, 95));
  for (const kind of crafts.filter(lacking)) at(kind, ring(near + 4, near + 45)) || at(kind, ring(near, 95));
  for (let i = have.farm || 0; i < farms; i++) at('farm', ring(Math.max(55, near + 25), 95));
}

// What a place's stores hold when you fight in it: its real stores if it keeps them,
// else a rough guess from its size.
function storesOf(p, lvl, base = 30) {
  return p.eco?.stock ? stores(p.eco) : { wood: base + lvl * 20, stone: 10 + lvl * 10, food: 40 + lvl * 20, planks: 10 };
}

function prebuild(town, kinds, rand, near = 25) {
  for (const kind of kinds) {
    for (let tries = 0; tries < 200; tries++) {
      const a = rand() * Math.PI * 2, r = near + rand() * (95 - near);
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      if (!town.canPlace(kind, x, z, { free: true }).ok) continue;
      town.place(kind, x, z, { ready: true });
      break;
    }
  }
}

// A place keeps its streets and walls when it changes hands: what stood is put back up
// the next time anyone fights there. Burned buildings and unfinished sites are gone.
function remember(t, side, time) {
  const W = t.battle.walls, idx = new Map();
  const nodes = W.nodes.filter(n => n.side === side).map((n, i) => {
    idx.set(n, i);
    return { x: n.x, z: n.z, tower: n.tower && n.tower.state !== 'site' ? { material: n.tower.material, broken: n.tower.state === 'broken' } : null };
  });
  const pieces = W.pieces.filter(p => p.side === side && p.state !== 'site' && idx.has(p.a) && idx.has(p.b))
    .map(p => ({ a: idx.get(p.a), b: idx.get(p.b), material: p.material, gate: p.gate, broken: p.state === 'broken' }));
  return { at: time, keepLevel: t.keepLevel, centre: W.centre[side],
    buildings: t.buildings.filter(b => b.state === 'active').map(b => ({ kind: b.kind, x: b.x, z: b.z, level: b.level || 1 })), nodes, pieces };
}

// Puts a remembered place back up for `side`. Left long enough, its holders mend the walls.
function rebuild(town, mem, side, mended) {
  for (const b of mem.buildings) {
    const r = town.place(b.kind, b.x, b.z, { ready: true });
    if (r.ok && b.level > 1) r.building.level = b.level;
  }
  if (mem.keepLevel) town.keepLevel = mem.keepLevel;
  if (!mem.pieces.length && !mem.nodes.some(n => n.tower)) return false;
  const W = town.battle.walls;
  const nodes = mem.nodes.map(n => W.node(n.x, n.z, side, { snap: false }));
  for (const p of mem.pieces) {
    const q = W.addPiece(nodes[p.a], nodes[p.b], side, p.material, true);
    if (p.gate) W.makeGate(q, { ready: true });
    if (p.broken && !mended) Object.assign(q, { hp: 0, state: 'broken', open: true });
  }
  mem.nodes.forEach((n, i) => {
    if (!n.tower) return;
    const r = W.placeTower(n.x, n.z, side, n.tower.material, { ready: true });
    if (r.ok && n.tower.broken && !mended) Object.assign(r.tower, { hp: 0, state: 'broken' });
  });
  W.centre[side] = mem.centre || { x: 0, z: 0 };
  W.changed();
  return true;
}

export class World {
  // hooks: watching() → the place on screen, ask(encounter), townAttacked(place, army),
  // fell(place), captured(place), ended(winner), herald({ house, title, text })
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
    this.half = REALM_RADIUS + 140;

    const realm = generateRealm(seed);
    FACTIONS.length = 0;
    for (const h of realm.houses) FACTIONS.push({ ...h, gold: 100, arms: 0, alive: true });
    this.bandits = FACTIONS.length;
    FACTIONS.push({ ...BANDITS, index: this.bandits, gold: 0, arms: 0, alive: true });
    this.houses = FACTIONS;
    this.wars = new Set();          // "i:j" with i < j
    this.met = new Set();           // houses that have sent you word
    this.pois = realm.places.map((p, i) => ({ ...p, seed: seed + 1000 * (i + 1), garrison: [], town: null, seen: false, visible: false }));
    const byOld = new Map(realm.places.map((p, i) => [p, this.pois[i]]));
    for (const p of this.pois) p.links = p.links.map(q => byOld.get(q));
    this.roads = realm.roads.map(r => ({ a: byOld.get(r.a), b: byOld.get(r.b) }));
    this.crown = byOld.get(realm.crown);
    for (const h of FACTIONS) if (h.seat) h.seat = byOld.get(h.seat);
    this.home = FACTIONS[0].seat;
    this.byId = Object.fromEntries(this.pois.map(p => [p.id, p]));
    this.byId.ashford = this.home;

    for (const p of this.pois) {
      if (p.kind === 'camp') p.owner = this.bandits;
      // Your village starts with a couple of family houses, so it can grow from the first minute.
      if (p.owner === 0) { const t = this.makeTown(p, { kind: p.kind }); prebuild(t, ['house', 'house'], t.rand); }
      else this.seedHolding(p);
    }
    // The north, past the old wall: fixed now, opened in Part 2. `wall` is for drawing.
    this.part = 1;
    this.invader = null;
    this.beyond = generateBeyond(seed, this.pois);
    this.wall = { points: this.beyond.wall, fallen: false, breaches: [] };
    this.ecoClock = 0;
    this.spies = [];
    this.vassals = [];
    this.sightClock = 0;
    startHouseMinds(this);
    startDiplomacy(this);
    this.updateVision();
  }

  log(text, side = 0) { this.events.push({ time: this.time, side, text }); }

  // ---- who fights whom ----

  warKey(i, j) { return i < j ? `${i}:${j}` : `${j}:${i}`; }
  atWar(i, j) {
    if (i === j || i === null || j === null) return false;
    if (i === this.bandits || j === this.bandits) return true;
    if (i === this.invader || j === this.invader) return true;
    return this.wars.has(this.warKey(i, j));
  }
  // An army of side `s` may attack place p: free villages and anyone at war with it.
  canAttack(s, p) { return p.owner !== s && (p.owner === null || this.atWar(s, p.owner)); }

  declareWar(i, j) {
    if (i === j || this.atWar(i, j)) return;
    this.wars.add(this.warKey(i, j));
    const a = FACTIONS[i], b = FACTIONS[j];
    if (i === 0) this.meet(j);
    if (j === 0) {
      this.meet(i);
      const line = a.taunts?.[Math.floor(this.rand() * a.taunts.length)];
      this.log(`${a.name} has declared war on you!`, 1);
      this.hooks.herald?.({ house: a, title: `${a.lord} declares war`, text: line ? `“${line}”` : '' });
    } else if (i === 0) {
      this.log(`You have declared war on ${b.name}.`);
    } else if (this.knows(i) || this.knows(j)) {
      this.log(`${a.name} has gone to war with ${b.name}.`, 2);
    }
  }

  makePeace(i, j) {
    if (!this.wars.delete(this.warKey(i, j))) return;
    const a = FACTIONS[i], b = FACTIONS[j];
    if (i === 0 || j === 0) this.log(`Peace is made with ${(i === 0 ? b : a).name}.`);
    else if (this.knows(i) || this.knows(j)) this.log(`${a.name} and ${b.name} have made peace.`, 2);
    for (const army of this.armies) {
      const other = army.side === i ? j : army.side === j ? i : null;
      if (other !== null && army.target && army.target.owner === other && army.side !== 0) this.retreat(army);
    }
  }

  strength(i) { return strengthOf(this, i); }

  // You have met a house once you have seen one of its places.
  // A house you have dealt with (war, heralds, offers) is known even before you find its lands.
  knows(h) { return this.met.has(h) || this.pois.some(p => p.owner === h && p.seen); }
  meet(h) { if (h !== null && h !== undefined && h !== 0) this.met.add(h); }

  // ---- holdings you don't run by hand ----

  seedHolding(p) {
    const K = KINDS[p.kind], g = K.garrison || 1;
    const lvl = p.kind === 'crown' ? 3 : p.seat !== undefined ? 2 : 1;
    // Rival holdings and free villages keep a real economy (holdings.js); camps and the
    // north keep the old rough one.
    const tracked = p.kind !== 'camp' && !FACTIONS[p.owner]?.invader;
    p.eco = tracked ? seedEconomy(p, this.rand, { seat: p.seat !== undefined, crown: p.kind === 'crown', kindPop: K.pop })
      : { pop: Math.round((p.seat !== undefined ? 55 : 32) * K.pop + (p.kind === 'crown' ? 30 : 0)), level: lvl, arms: 0 };
    // No two places keep quite the same guard: poor ones fewer, and a rich trading town
    // trusts to its coin more than its walls.
    const guard = tracked ? WEALTH[p.eco.wealth].guard * (p.eco.focus === 'trade' ? 0.6 : p.eco.focus === 'military' ? 1.25 : 1) : 1;
    const vary = (0.7 + this.rand() * 0.6) * guard;
    const n = k => Math.round(k * g * vary);
    if (p.kind === 'camp') p.garrison = [unit('bandit', 30 + Math.floor(this.rand() * 15), `${p.name.replace(/ Camp$/, '')} outlaws`)];
    else if (FACTIONS[p.owner]?.invader) p.garrison = northGarrison(p, this.rand);
    else if (p.kind === 'crown') p.garrison = [unit('spear', 40, 'Royal guard'), unit('sword', 40, 'Royal men-at-arms'), unit('archer', 30, 'Royal archers'), unit('militia', 40, 'City watch')];
    else if (p.owner === null) p.garrison = [unit('militia', n(26), `${p.name} militia`), unit('archer', n(10), `${p.name} bowmen`)];
    else {
      const h = FACTIONS[p.owner];
      p.garrison = p.seat !== undefined
        ? [unit('spear', 40, `${h.short} spearmen`), unit('sword', 20, `${h.short} men-at-arms`), unit('archer', 20, `${h.short} archers`)]
        : [unit('spear', n(20), `${h.short} spearmen`), unit('archer', n(10), `${h.short} archers`)];
    }
  }

  // How many men a holding keeps at home before sending the rest to its lord.
  keepHome(p) {
    const K = KINDS[p.kind];
    return Math.round((20 + p.eco.level * 8) * (K.garrison || 1) * (p.seat !== undefined ? 1.6 : 1));
  }

  popCap(p) { return p.eco.buildings ? housing(p.eco) : (25 + p.eco.level * 22) * KINDS[p.kind].pop; }

  // Every few seconds: people grow toward what the place can hold, the house collects
  // taxes and arms, and the place keeps its own garrison filled from its people.
  tickHoldings(dt) {
    for (const h of FACTIONS) if (!h.bandit && !h.invader) h.arms = 0;
    for (const p of this.pois) {
      if (p.town || !p.eco) continue;
      const K = KINDS[p.kind], e = p.eco, h = p.owner === null ? null : FACTIONS[p.owner];
      if (e.buildings) { this.tickEconomy(p, dt, K, e, h); continue; }
      // Camps and the northern host: people grow toward what the place holds, and arms
      // come at a rough rate (the north is a war machine and keeps its own pace).
      const cap = this.popCap(p);
      if (e.pop < cap) e.pop = Math.min(cap, e.pop + dt * ARRIVALS * K.pop);
      const arms = h?.invader ? dt * e.pop * 0.0011 * K.arms : dt * SMITHY * K.arms;
      if (h && !h.bandit) { h.gold += dt * e.pop * 0.004 * K.gold; h.arms += arms; }
      else e.arms += arms;
      const pool = h && !h.bandit ? h : e;
      const want = this.keepHome(p), have = headcount(p.garrison);
      if (have < want && pool.arms >= 3 && e.pop > 12) {
        const k = Math.min(Math.floor(pool.arms), want - have, 6);
        pool.arms -= k;
        e.pop -= k;
        const key = h?.bandit ? 'bandit' : h ? pickKind(h, this.rand(), this.time) : 'militia';
        recruit(p.garrison, key, k, h ? `${h.short} ${TYPES[key]?.name?.toLowerCase() || key}` : `${p.name} militia`);
      }
    }
  }

  // A place with a real economy (holdings.js): it works, eats, builds and arms. Its lord
  // takes the taxes and half of what its market earns; it keeps its own garrison filled
  // from its own kit and people.
  tickEconomy(p, dt, K, e, h) {
    const lvl = e.level;
    const pace = h?.trait === 'builder' ? 1.15 : h?.trait === 'raider' || h?.trait === 'hothead' ? 1.05 : 1;
    const traded = runEconomy(p, dt, { pace });
    const v = vassalOf(this, p);
    // A vassal taxes as your own villages do (fair taxes, a middling mood); rival lords'
    // books are kept rougher.
    const taxes = dt * e.pop * K.gold * (v ? 0.012 * 0.9 : 0.004 * (h?.trait === 'merchant' ? 1.5 : 1));
    // A vassal keeps what his village earns, less your dues.
    if (v) FACTIONS[0].gold += share(this, v, taxes + traded);
    else if (h && !h.bandit) { h.gold += taxes + traded / 2; e.gold += traded / 2; }
    else e.gold += taxes * 0.5 + traded;
    const want = this.keepHome(p), have = headcount(p.garrison);
    if (have < want) for (const u of arm(e, Math.min(6, want - have), Math.max(12, housing(e) * 0.4)))
      recruit(p.garrison, u.key, u.count, h && !v ? `${h.short} ${TYPES[u.key].name.toLowerCase()}` : `${p.name} ${TYPES[u.key].name.toLowerCase()}`);
    if (h && !h.bandit && !v) h.arms += kits(e);
    if (e.level > lvl && p.visible) this.log(`${p.name} has grown.`, 2);
  }

  // A house raises men for its field army at its muster place, drawing them from whichever
  // of its places has people to spare.
  raiseFromPeople(h, at, n) {
    let raised = 0;
    // Places with a real economy arm men from their own stores and people.
    for (const p of this.pois.filter(p => p.owner === h.index && p.eco?.buildings).sort((p, q) => kits(q.eco) - kits(p.eco))) {
      if (raised >= n) break;
      for (const u of arm(p.eco, Math.min(n - raised, 6), Math.max(12, housing(p.eco) * 0.45))) {
        recruit(at.garrison, u.key, u.count, null, h);
        raised += u.count;
      }
    }
    if (raised) h.arms = Math.max(0, h.arms - raised);
    while (raised < n && h.arms >= 1) {
      const from = this.pois.filter(p => p.owner === h.index && p.eco && !p.eco.buildings && p.eco.pop > this.popCap(p) * 0.45)
        .sort((p, q) => q.eco.pop / this.popCap(q) - p.eco.pop / this.popCap(p))[0];
      if (!from) break;
      const k = Math.min(n - raised, 6, Math.floor(h.arms));
      from.eco.pop -= k;
      h.arms -= k;
      recruit(at.garrison, pickKind(h, this.rand(), this.time), k, null, h);
      raised += k;
    }
    return raised;
  }

  // ---- your villages ----

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
    const town = new Town(battle, heightAt, trees, rng(p.seed + 7), { kind: p.kind, ...opts });
    town.purse = FACTIONS[0];
    town.onFall = () => { p.falling = true; };
    town.rebelHouse = this.bandits;
    // A knights' hall wants the rank of Count, and its finishing is a moment.
    town.hallRule = () => ['Count', 'Duke', 'King'].includes(this.rank) ? null : 'From the rank of Count';
    town.onMilestone = () => {
      if (p.owner !== 0) return;
      this.log(`A knights' hall stands in ${p.name}. Your veterans may train there as men-at-arms and knights.`, 0);
      this.hooks.herald?.({ house: FACTIONS[0], title: `A knights' hall in ${p.name}`, text: 'Your veterans may train there as men-at-arms and knights: few, costly, slow to replace, and the best men in the realm.' });
      this.hooks.rankUp?.('hall');
    };
    // Hired companies stationed here weigh on the village's mood.
    town.moodHooks = [() => [companiesIn(this, town) * COMPANY_MOOD, 'sellswords in the village']];
    town.onRebel = n => {
      if (p.owner !== 0) return;
      this.log(`${n} villagers of ${p.name} have risen in revolt!`, 1);
      this.hooks.herald?.({ house: FACTIONS[this.bandits], title: `${p.name} rises`, text: `Taxed and hungry and grieving, ${n} of your own people have taken up pitchforks. Put them down, then ease their lot.` });
    };
    Object.assign(p, { town, heightAt, trees, garrison: [], aiClock: 0, pruneClock: 30, onRoad });
    return town;
  }

  // ---- armies ----

  spawnArmy(side, units, at, name, mode = 'march') {
    const h = FACTIONS[side];
    const a = { id: this.nextArmy++, side, units, name: name || (side === 0 ? 'Your army' : `${h.short} host`),
      x: at.x, z: at.z, at, last: at, path: [], heading: 0, halted: false, retreating: false, mode, target: null, visible: side === 0 };
    if (mode !== 'wagon') provision(a);
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
      if (u === to || d.get(u) === Infinity) break;
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
    a.target = dest;
    a.at = null;
    return true;
  }

  moveArmy(a, dt) {
    if (a.halted || !a.path.length) return;
    const to = a.path[0];
    const d = dist(a, to), step = SPEED * dt * (a.retreating ? 1.1 : 1);
    a.heading = Math.atan2(to.x - a.x, to.z - a.z);
    if (d > step) { a.x += (to.x - a.x) / d * step; a.z += (to.z - a.z) / d * step; a.at = null; return; }
    a.x = to.x; a.z = to.z;
    const came = a.last;
    a.last = to;
    a.path.shift();
    // Marching on through friendly or peaceful places; a hostile one stops the army.
    if (a.path.length && !this.canAttack(a.side, to)) return;
    if (a.path.length && a.side !== 0 && to.owner === null && a.target !== to) return;
    a.at = to;
    this.arrive(a, to, came);
  }

  arrive(a, p, came) {
    a.path = [];
    a.retreating = false;
    // A place being stormed: your men join the fight, its own lord's men come to relieve it,
    // and anyone else waits their turn.
    if (p.town?.hostile) {
      const angle = this.angle(p, came === p ? p.links[0] : came);
      if (a.side === 0) { p.town.addTroops(a.units, angle, { stand: 95 }); this.removeArmy(a); this.log(`${a.name} joins the attack on ${p.name}.`); }
      else if (a.side === p.owner) {
        this.removeArmy(a);
        p.town.receiveAttack(a.units, angle, { mode: 'assault', name: a.name, house: a.side,
          onLeave: left => { if (left.length) this.retreat(this.spawnArmy(a.side, left, p, a.name)); } });
        this.log(`${a.name} has come to relieve ${p.name}!`, 1);
      } else this.retreat(a);
      return;
    }
    if (p.owner === a.side) {
      if (a.side !== 0) { mergeInto(p.garrison, a.units); this.removeArmy(a); }
      else if (p.town) this.enterTown(a, p, came);
      return;
    }
    if (!this.canAttack(a.side, p)) { if (a.side !== 0) this.retreat(a); return; }
    if (a.side === 0) { this.ask({ kind: 'assault', army: a, poi: p }); return; }
    // An army of yours waiting outside one of your villages falls back into it and
    // fights there; outside anyone else's, it meets them in the open.
    const guard = this.armies.find(o => o.side === 0 && o.at === p && !o.path.length && !o.halted);
    if (guard && p.owner === 0 && p.town) {
      const other = p.links.find(q => q !== came) || p.links[0];
      p.town.addTroops(guard.units, this.angle(p, other), { stand: 30 });
      this.removeArmy(guard);
      this.log(`${guard.name} falls back into ${p.name} to meet them.`);
    } else if (guard && this.atWar(a.side, 0)) { this.ask({ kind: 'field', army: guard, enemy: a, poi: p, then: () => this.arrive(a, p, came) }); return; }
    if (p.owner === 0 && p.town) this.attackTown(a, p, came);
    else if (a.mode === 'raid') this.autoRaid(a, p);
    else this.autoAssault(a, p);
  }

  enterTown(a, p, came) {
    heal(a);
    if (a.food > 0) p.town.put(p.town.keep, 'food', Math.floor(a.food));
    p.town.addTroops(a.units, this.angle(p, came === p ? p.links[0] : came));
    this.removeArmy(a);
    this.log(`Your army has marched into ${p.name}.`);
  }

  // Call the banners: every village of yours raises what its barracks can arm (keeping
  // half its people at work) and sends its whole garrison, bar the men on its walls, to
  // `dest`. They join that village's garrison there, ready to be mustered as one host.
  callBanners(dest) {
    const BEST = ['knight', 'cav', 'maa', 'crossbow', 'lightcav', 'sword', 'spear', 'archer'];
    let men = 0, from = 0;
    for (const p of this.pois) {
      const t = p.town;
      if (p.owner !== 0 || !t || t.hostile || t.underAttack) continue;
      for (const b of t.buildings) {
        if (b.kind !== 'barracks' || b.state !== 'active') continue;
        for (const key of BEST) {
          while (t.levyCheck(key, b).ok && t.villagers.filter(v => v.state !== 'soldier').length - t.levyCheck(key, b).n >= t.population / 2) t.raise(key, b);
        }
      }
      if (p === dest) continue;
      const regs = t.garrison().filter(r => !r.routing && !r.regrouping && !r.posts);
      if (!regs.length) continue;
      const a = this.muster(p, regs);
      if (!a) continue;
      a.name = `Banners of ${p.name}`;
      men += headcount(a.units);
      from++;
      if (!this.order(a, dest)) this.enterTown(a, p, p);
    }
    // Vassals send their share of their men, unless they are too aggrieved to.
    for (const p of this.pois) {
      const v = vassalOf(this, p);
      if (!v || p === dest || p.owner !== 0) continue;
      if (v.refusing) { this.log(`${v.name} sends nobody from ${p.name}.`, 1); continue; }
      const units = takeUnits(p.garrison, power(p.garrison) * LEVIES[v.levy].share);
      if (!units.length) continue;
      const a = this.spawnArmy(0, units, p, `${v.name}'s men`);
      men += headcount(units);
      from++;
      v.sent += headcount(units);
      recall(this, v, `Sent ${headcount(units)} men to your banners at ${dest.name}`);
      if (!this.order(a, dest)) { mergeInto(p.garrison, units); this.removeArmy(a); }
    }
    const here = dest.town ? dest.town.garrison().reduce((n, r) => n + r.alive, 0) : 0;
    this.log(from ? `The banners are called: ${men} men march for ${dest.name} from ${from} village${from > 1 ? 's' : ''}, to join ${here} there.` : `The banners are called, but no other village has men to send. ${here} stand ready at ${dest.name}.`);
    return { men, from };
  }

  // Two armies of yours waiting at the same place become one.
  join(a, b) {
    for (const u of b.units) {
      const same = a.units.find(o => o.key === u.key && o.name === u.name);
      if (same) same.count += u.count; else a.units.push({ ...u });
    }
    a.wounded = [...(a.wounded || []), ...(b.wounded || [])];
    a.food = (a.food || 0) + (b.food || 0);
    this.log(`${b.name} joins ${a.name}: ${headcount(a.units)} men.`);
    this.removeArmy(b);
  }

  // Regiments leave a village of yours and become an army on the map.
  muster(p, regs) {
    const units = p.town.takeTroops(regs);
    if (!units.length) return null;
    const a = this.spawnArmy(0, units, p, `Army of ${p.name}`);
    // The carts are loaded from the village stores, as far as they go.
    a.food = takeFood(p.town, capacity(a));
    const mins = Math.floor(a.food / Math.max(1, headcount(units)) * 2);
    this.log(`${a.name} has mustered: ${headcount(units)} men, with food for ${mins ? `${mins} minute${mins > 1 ? 's' : ''}` : 'less than a minute'} away from home.`);
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

  defenceBonus(p) { return 1.2 * KINDS[p.kind].defence; }

  autoResolve(enc) {
    const r = this.resolve(enc.army.units, enc.defenders, enc.kind === 'assault' ? this.defenceBonus(enc.poi) : 1);
    this.settle(enc, r.attackerWins, r.A, r.D);
    return r.attackerWins;
  }

  // The outcome of a fight the player was in, fought or auto-resolved.
  settle(enc, won, mine, theirs) {
    this.encounter = null;
    const a = enc.army;
    a.halted = false;
    const before = a.units;
    a.units = mine;
    wound(a, before);
    const was = enc.poi ? enc.poi.name : 'the road';
    if (enc.kind === 'assault') {
      const p = enc.poi;
      if (won) { this.log(`You have taken ${p.name}!`); this.capture(p, a); }
      else { p.garrison = theirs; this.log(`The attack on ${p.name} failed.`, 1); note(this, p.owner, 'lostField'); this.retreat(a); }
    } else {
      const e = enc.enemy;
      e.halted = false;
      const theirsBefore = e.units;
      e.units = theirs;
      wound(e, theirsBefore);
      note(this, e.side, won ? 'wonField' : 'lostField');
      if (won) {
        this.log(`${e.name} was beaten at ${was}.`);
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

  // Coin found in a place you take goes to your purse.
  plunder(p) {
    const g = Math.round(p.eco?.gold || 0);
    if (g < 1) return;
    FACTIONS[0].gold += g;
    this.log(`You found ${g} gold in ${p.name}.`);
  }

  capture(p, a) {
    const was = p.owner;
    note(this, was, 'tookPlace');
    this.takePlace(p, 0);
    const pop = p.eco?.pop ?? 20;
    const lvl = p.eco?.level ?? 1;
    const town = this.makeTown(p, { villagers: Math.max(6, Math.min(40, Math.round(pop * 0.5))), retinue: false,
      stock: storesOf(p, lvl, 60) });
    if (p.mem) rebuild(town, p.mem, 0, true);
    p.mem = null;
    layOut(town, p, lvl, town.rand);
    this.plunder(p);
    p.eco = null;
    town.addTroops(a.units, this.angle(p, a.last === p ? p.links[0] : a.last));
    this.removeArmy(a);
    this.hooks.captured(p, was);
    this.checkBroken(was);
  }

  // A place changes hands. Seats move to the house's next-best place when lost.
  takePlace(p, owner) {
    const was = p.owner;
    p.owner = owner;
    const v = vassalOf(this, p);
    if (v) {
      p.vassal = null;
      recall(this, v, `Lost ${p.name} to ${FACTIONS[owner]?.name || 'free folk'}`);
      this.log(`${v.name} has lost ${p.name}.`, 1);
      for (const o of living(this)) if (o !== v) mark(this, o, -8, `You let ${p.name} fall`, 1200);
    }
    if (owner === 0 && was !== null && was !== 0) for (const o of living(this)) mark(this, o, 4, 'Your victories', 900);
    if (was !== null && FACTIONS[was]?.seat === p) {
      // (you fall back to a village you run yourself, the biggest first)
      const size = q => q.town ? 1000 + q.town.population : q.eco?.pop ?? 0;
      const next = this.pois.filter(q => q.owner === was).sort((q, r) => size(r) - size(q))[0];
      FACTIONS[was].seat = next || null;
      if (next) next.seat = was;
      delete p.seat;
      if (was === 0) {
        if (next) { this.home = next; this.log(`You have lost ${p.name}. Your seat is now ${next.name}.`, 1); }
      } else if (next && (p.visible || this.knows(was))) this.log(`${FACTIONS[was].name} has lost its seat and fallen back to ${next.name}.`, 2);
    }
    // A lord with no seat makes his seat of the first place he takes.
    if (owner === 0 && (!FACTIONS[0].seat || FACTIONS[0].seat.owner !== 0)) { FACTIONS[0].seat = p; p.seat = 0; this.home = p; }
  }

  // A house with no places left is broken; its armies scatter.
  checkBroken(h) {
    if (h === null || h === undefined || h === 0 || h === this.bandits) return;
    const H = FACTIONS[h];
    if (!H.alive || this.pois.some(p => p.owner === h)) return;
    H.alive = false;
    for (const a of [...this.armies]) if (a.side === h) this.removeArmy(a);
    for (const k of [...this.wars]) if (k.split(':').map(Number).includes(h)) this.wars.delete(k);
    this.log(`${H.name} is broken. ${H.lord} has fled the realm.`, 0);
    this.hooks.herald?.({ house: H, title: `${H.name} is broken`, text: `${H.lord} has fled the realm.` });
  }

  // ---- storming a place ----
  // You fight for a place in the place itself: it is laid out as a real village with
  // what its people have built, its garrison holds the keep, and your army marches in by
  // the road it came on. Win and it is yours as it stands, less whatever you burned.

  storm(enc) {
    const p = enc.poi, a = enc.army, owner = p.owner;
    this.encounter = null;
    a.halted = false;
    const lvl = p.eco?.level ?? 1, pop = p.eco?.pop ?? 20;
    const defenders = p.garrison;
    const town = this.makeTown(p, { kind: p.kind, villagers: 0, retinue: false, stock: storesOf(p, lvl) });
    const came = this.angle(p, a.last && a.last !== p ? a.last : p.links[0]);
    // Castles, lords' seats, Kingsbridge and the north's strongholds have walls round the
    // keep, with the gate facing the road you came by. Their buildings stand outside.
    const kept = p.mem && rebuild(town, p.mem, 1, this.time - p.mem.at > 240);
    p.mem = null;
    const walls = p.eco?.walls;
    const walled = kept || (walls ? walls !== 'none' : ['castle', 'crown', 'pass', 'warcamp'].includes(p.kind) || p.seat !== undefined);
    if (walled && !kept) {
      const stone = walls ? walls === 'stone' : p.kind !== 'warcamp' && (lvl >= 2 || p.kind === 'castle' || p.kind === 'crown' || p.kind === 'pass');
      buildFort(town.battle.walls, 1, 0, 0, p.kind === 'crown' ? 30 : 24, { gateAngle: came, material: stone ? 'stone' : 'wood', sides: p.kind === 'crown' ? 8 : 6 });
    }
    layOut(town, p, lvl, town.rand, walled ? (p.kind === 'crown' ? 40 : 33) : 16);
    town.keepLevel = town.keepLevel || Math.min(5, lvl + (p.seat !== undefined || p.kind === 'castle' || p.kind === 'crown' ? 1 : 0));
    const H = owner === null ? NEUTRAL : FACTIONS[owner];
    town.hostile = { owner, pop, eco: p.eco, color: H.color, name: H.name, army: a.name, entry: came };
    town.flagColor = H.color;
    town.holdKeep(defenders, came, { house: owner ?? 1 });
    town.addTroops(a.units, came, { stand: 100 });
    this.removeArmy(a);
    this.log(`${a.name} is storming ${p.name}.`);
  }

  // Called each step while a place is being stormed: is it won or lost yet?
  checkStorm(p) {
    const t = p.town, b = t.battle;
    const standing = r => !r.gone && !r.routing;
    const ours = b.regs.filter(r => r.side === 0 && standing(r));
    const theirs = t.attackers.flatMap(g => g.regs).filter(standing);
    if (!theirs.length) this.wonStorm(p);
    else if (!ours.length) this.endStorm(p, false);
  }

  wonStorm(p) {
    const t = p.town, h = t.hostile, was = h.owner;
    note(this, was, 'tookPlace');
    this.takePlace(p, 0);
    t.claim({ villagers: Math.max(6, Math.min(40, Math.round(h.pop * 0.5))) });
    t.flagColor = null;
    p.eco = h.eco;
    this.plunder(p);
    p.eco = null;
    p.garrison = [];
    this.log(`You have taken ${p.name}!`);
    this.hooks.stormEnded?.(p, true);
    this.hooks.captured(p, was);
    this.checkBroken(was);
    this.checkEnd();
  }

  // The attack is beaten off, or you call it off: the place goes back to its owner as a
  // holding, poorer for whatever burned, and your survivors fall back.
  endStorm(p, chose) {
    const t = p.town, h = t.hostile, b = t.battle;
    const left = r => r.soldiers.filter(s => s.alive && !s.gone).length;
    const mine = b.regs.filter(r => r.side === 0 && !r.gone)
      .map(r => ({ key: r.T.key, count: left(r), name: r.name, levy: r.levy || null, retinue: !!r.retinue })).filter(u => u.count >= 3);
    const theirs = b.regs.filter(r => r.side === 1 && !r.gone).map(r => unit(r.T.key, left(r), r.name)).filter(u => u.count >= 3);
    const ruins = t.buildings.filter(o => o.state === 'ruined'), burned = ruins.length;
    p.mem = remember(t, 1, this.time);
    p.town = null;
    p.garrison = theirs;
    p.eco = h.eco || { pop: h.pop, level: 1, arms: 0 };
    if (burned) {
      p.eco.pop *= Math.max(0.4, 1 - burned * 0.1);
      if (p.eco.buildings) burn(p.eco, ruins.map(o => o.kind));
      else p.eco.level = Math.max(1, p.eco.level - Math.floor(burned / 3));
    }
    if (!chose) note(this, h.owner, 'lostField');
    const fire = burned ? `, leaving ${burned} of its buildings in ashes` : '';
    this.log(chose ? `You pull back from ${p.name}${fire}.` : `The attack on ${p.name} has failed${fire}.`, chose ? 0 : 1);
    if (mine.length) {
      const back = this.spawnArmy(0, mine, p, h.army);
      back.wounded = b.regs.filter(r => r.side === 0 && r.initial > left(r))
        .map(r => ({ key: r.T.key, name: r.name, levy: r.levy || null, retinue: !!r.retinue, count: Math.round((r.initial - left(r)) * 0.35) })).filter(u => u.count > 0);
      this.retreat(back);
    }
    this.hooks.stormEnded?.(p, false, chose);
    this.checkEnd();
  }

  // A rival marches on one of your villages: the fight happens there, in the village itself.
  attackTown(a, p, came) {
    const t = p.town, H = FACTIONS[a.side];
    if (!H.bandit) this.meet(a.side);
    this.removeArmy(a);
    t.receiveAttack(a.units, this.angle(p, came), {
      mode: a.mode === 'march' ? 'assault' : a.mode, name: a.name, house: a.side,
      onLeave: survivors => {
        if (t.lost || !survivors.length) return;
        const back = this.spawnArmy(a.side, survivors, p, a.name);
        this.retreat(back);
      },
    });
    // The village's own message says it when you are there to see it.
    if (this.hooks.watching() !== p) {
      this.log(a.mode === 'raid' ? `${H.short} raiders have reached ${p.name}!`
        : a.mode === 'siege' ? `${a.name} has laid siege to ${p.name}!` : `${a.name} is attacking ${p.name}!`, 1);
    }
    this.hooks.townAttacked(p, a);
  }

  autoAssault(a, p) {
    const was = p.owner, H = FACTIONS[a.side];
    const r = this.resolve(a.units, p.garrison, this.defenceBonus(p));
    a.units = r.A;
    if (r.attackerWins) {
      this.takePlace(p, a.side);
      p.garrison = r.A;
      if (p.eco) {
        p.eco.pop *= 0.8;
        if (p.eco.gold) { H.gold += p.eco.gold * 0.8; p.eco.gold *= 0.2; }
      }
      this.removeArmy(a);
      if (p.visible || was === 0 || (H.invader && was !== null)) this.log(`${H.name} has taken ${p.name}.`, was === 0 || H.invader ? 1 : 2);
      this.checkBroken(was);
      this.checkEnd();
    } else {
      p.garrison = r.D;
      this.retreat(a);
    }
  }

  // Raiders on a holding: if they beat the guard, they burn and steal, then go home.
  autoRaid(a, p) {
    const r = this.resolve(a.units, p.garrison, this.defenceBonus(p) * 0.9);
    a.units = r.A;
    if (r.attackerWins) {
      p.garrison = r.D;
      if (p.eco) {
        const loss = p.eco.pop * 0.18;
        p.eco.pop -= loss;
        if (p.eco.stock) for (const g of Object.keys(p.eco.stock)) p.eco.stock[g] *= 0.75;
        if (p.owner !== null && FACTIONS[p.owner]) FACTIONS[p.owner].gold = Math.max(0, FACTIONS[p.owner].gold - loss * 2);
        FACTIONS[a.side].gold += loss * 2;
      }
      if (p.visible) this.log(`${FACTIONS[a.side].short} raiders burned the edges of ${p.name}.`, p.owner === 0 ? 1 : 2);
      const v = vassalOf(this, p);
      if (v) { mark(this, v, -6, 'Raided while you looked on', 600); recall(this, v, `${p.name} was raided by ${FACTIONS[a.side].name}`); }
    } else p.garrison = r.D;
    this.retreat(a);
  }

  // The keep has fallen: the place goes to the attacker, and your survivors make for home.
  fall(p) {
    const t = p.town;
    p.falling = false;
    const alive = r => r.soldiers.filter(s => s.alive).length;
    const groups = t.attackers.filter(g => g.regs.some(r => !r.disbanded && alive(r) > 0));
    const side = groups[0]?.house ?? 1;
    note(this, side, 'lostPlace');
    const theirs = groups.flatMap(g => g.regs).filter(r => !r.disbanded && alive(r) > 0)
      .map(r => unit(r.T.key, alive(r), r.name));
    const ours = t.garrison().filter(r => alive(r) > 0)
      .map(r => ({ key: r.T.key, count: alive(r), name: r.name, levy: r.levy || null, retinue: !!r.retinue }));
    const pop = t.villagers.filter(v => v.state !== 'soldier').length;
    this.takePlace(p, side);
    p.mem = remember(t, 0, this.time);
    // The north and outlaws keep their rough reckoning; a house runs what it took.
    const eco = FACTIONS[side].invader || FACTIONS[side].bandit ? { pop: Math.max(10, pop * 0.7), level: 1, arms: 0 } : fromTown(t);
    Object.assign(p, { town: null, garrison: theirs.length ? theirs : [unit('spear', 10, `${FACTIONS[side].short} spearmen`)], eco });
    this.log(`${p.name} has fallen to ${FACTIONS[side].name}.`, 1);
    if (ours.length) this.retreat(this.spawnArmy(0, ours, p, `Survivors of ${p.name}`));
    this.hooks.fell(p);
    this.checkEnd();
  }

  checkMeetings() {
    for (const a of this.armies) {
      if (a.halted || a.retreating || a.gone || a.wagon) continue;
      for (const e of this.armies) {
        if (e === a || e.wagon || e.side <= a.side || e.halted || e.retreating || e.gone || !this.atWar(a.side, e.side)) continue;
        if (dist(a, e) >= MEET) continue;
        if (a.side === 0) {
          if (!this.encounter) { this.ask({ kind: 'field', army: a, enemy: e, poi: a.at || e.at }); return; }
          continue;
        }
        this.clash(a, e);
      }
    }
  }

  // Two rival armies meet on the road; nobody is watching, so it is settled by numbers.
  clash(a, e) {
    const r = this.resolve(a.units, e.units);
    const was = [a.units, e.units];
    a.units = r.A;
    e.units = r.D;
    wound(a, was[0]);
    wound(e, was[1]);
    const [win, lose] = r.attackerWins ? [a, e] : [e, a];
    if (a.visible || e.visible) this.log(`${win.name} beat ${lose.name} on the road.`, 2);
    if (lose.units.length) this.retreat(lose); else this.removeArmy(lose);
    if (!win.units.length) this.removeArmy(win);
  }

  // ---- what you can see ----

  updateVision() {
    const eyes = [
      ...this.pois.filter(p => p.owner === 0).map(p => ({ x: p.x, z: p.z, r: SIGHT.place + lookouts(p) })),
      ...this.armies.filter(a => a.side === 0).map(a => ({ x: a.x, z: a.z, r: SIGHT.army })),
    ];
    const sees = o => eyes.some(e => dist(e, o) < e.r);
    for (const p of this.pois) {
      p.visible = p.owner === 0 || sees(p);
      if (p.visible) {
        p.seen = true;
        p.known = { owner: p.owner, men: p.town ? null : headcount(p.garrison), level: p.eco?.level ?? null };
      }
    }
    for (const a of this.armies) a.visible = a.side === 0 || sees(a);
  }

  // ---- the end ----

  // Each rank brings new tools and new trouble, with a moment when you reach it.
  checkRank() {
    const ORDER = ['Reeve', 'Lord', 'Count', 'Duke', 'King'], now = ORDER.indexOf(this.rank);
    const seen = ORDER.indexOf(this.rankSeen || 'Reeve');
    if (now <= seen) return;
    this.rankSeen = this.rank;
    const R = RANKS[this.rank];
    if (!R) return;
    this.log(`You are now ${R.title}. ${R.tools}`, 0);
    this.hooks.herald?.({ house: FACTIONS[0], title: `You are ${R.title}`, text: `${R.tools} ${R.trouble}` });
    this.hooks.rankUp?.(this.rank);
  }

  // Your rank follows how much of the realm you hold.
  get rank() {
    const n = this.pois.filter(p => p.owner === 0).length;
    if (this.crowned) return 'King';
    return n >= 11 ? 'Duke' : n >= 5 ? 'Count' : n >= 2 ? 'Lord' : 'Reeve';
  }

  checkEnd() {
    if (this.winner !== null) return;
    if (this.part === 2) {
      // Part 2 ends when the north is driven out, or when you have nothing left.
      if (!this.pois.some(p => p.owner === this.invader) && !this.armies.some(a => a.side === this.invader)) { this.winner = 0; this.victory = 'north'; }
      else if (!this.pois.some(p => p.owner === 0) && !this.armies.some(a => a.side === 0 && !a.wagon)) this.winner = 1;
      if (this.winner !== null) this.hooks.ended(this.winner);
      return;
    }
    // Crowned by the sword (Kingsbridge and half the realm, counting the places of houses
    // that back you) or by acclaim (every great house still standing backs your claim).
    const real = this.pois.filter(p => p.kind !== 'camp');
    const B = new Set(backers(this).map(h => h.index));
    const mine = real.filter(p => p.owner === 0 || B.has(p.owner)).length;
    const rivals = FACTIONS.slice(1, this.bandits).filter(h => h.alive);
    if (this.crown.owner === 0 && mine >= real.length / 2) { this.crowned = true; this.winner = 0; this.victory = 'sword'; }
    else if (!rivals.length || rivals.every(h => B.has(h.index))) { this.crowned = true; this.winner = 0; this.victory = rivals.length ? 'acclaim' : 'sword'; }
    else if (!this.pois.some(p => p.owner === 0) && !this.armies.some(a => a.side === 0 && !a.wagon)) this.winner = 1;
    if (this.winner !== null) this.hooks.ended(this.winner);
  }

  // ---- Part 2: the wall falls ----
  // You are crowned. Every great house left kneels to you, their wars are ended, and the
  // old wall in the north comes down: a new land opens beyond it, and a host with it.
  beginPart2() {
    if (this.part === 2) return;
    this.part = 2;
    this.winner = null;
    this.wars.clear();
    for (const H of FACTIONS.slice(1, this.bandits)) {
      if (!H.alive) continue;
      const d = this.dip[H.index];
      Object.assign(d, { vassal: true, backs: true, truceUntil: Infinity, opinion: Math.max(d.opinion, 40) });
      H.vassalOf = 0;
      this.meet(H.index);
    }
    // The host of the north.
    const inv = { ...INVADER, index: FACTIONS.length, gold: 2000, arms: 400, alive: true };
    FACTIONS.push(inv);
    this.invader = inv.index;
    this.dip.push({ opinion: -100, gift: 0, truceUntil: 0, allied: false, married: false, backs: false, vassal: false, broken: 0, score: 0, warSince: 0, offerCd: Infinity });
    // Its land joins the map.
    const B = this.beyond, start = this.pois.length;
    const added = B.places.map((p, i) => ({ ...p, owner: inv.index, seed: this.seed + 1000 * (start + i + 1), garrison: [], town: null, seen: false, visible: false }));
    const byOld = new Map(B.places.map((p, i) => [p, added[i]]));
    for (const p of added) p.links = p.links.map(q => byOld.get(q));
    for (const r of B.roads) this.roads.push({ a: byOld.get(r.a), b: byOld.get(r.b) });
    for (const { from, to } of B.breaches) {
      const a = byOld.get(from);
      a.links.push(to); to.links.push(a);
      this.roads.push({ a, b: to });
      this.wall.breaches.push({ x: (a.x + to.x) / 2, z: (a.z + to.z) / 2, from: a, to });
      a.seen = true;   // you can see the camps through the gaps
    }
    this.wall.fallen = true;
    for (const p of added) { this.pois.push(p); this.byId[p.id] = p; }
    const pass = byOld.get(B.pass);
    pass.seat = inv.index;
    inv.seat = pass;
    for (const p of added) this.seedHolding(p);
    this.half = Math.max(this.half, ...added.map(p => Math.max(Math.abs(p.x), Math.abs(p.z)) + 140));
    startMind(this, inv);
    this.updateVision();
    for (const p of added) if (p.seen) p.known = { owner: p.owner, men: headcount(p.garrison), level: p.eco?.level ?? null };
    this.log('The old wall has fallen. The north is coming.', 1);
    this.hooks.herald?.({ house: inv, title: 'The wall has fallen', text: `“${inv.taunts[0]}” ${inv.lord} brings his host down through the north. Drive them back through ${pass.name}, or lose all you have built.` });
  }

  // ---- time ----

  update(dt) {
    if (this.winner !== null) return;
    this.time += dt;
    for (const p of this.pois) if (p.town) this.updateTown(p, dt);
    for (const a of [...this.armies]) if (!a.gone) { if (a.wagon) moveWagon(this, a, dt); else this.moveArmy(a, dt); }
    this.checkMeetings();
    this.supplyClock = (this.supplyClock || 0) - dt;
    if (this.supplyClock <= 0) { this.supplyClock = 1; supplyArmies(this, 1); catchWagons(this, MEET); }
    this.ecoClock -= dt;
    if (this.ecoClock <= 0) { this.ecoClock = 5; this.tickHoldings(5); this.collectTaxes(5); this.tickSpies(); tickVassals(this); tickCompanies(this, 5); this.checkRank(); }
    this.sightClock -= dt;
    if (this.sightClock <= 0) { this.sightClock = 0.5; this.updateVision(); }
    thinkHouses(this, dt);
    thinkDiplomacy(this, dt);
  }

  // ---- vassals ----
  // From the rank of Lord you may give a village to a vassal, who runs it on the same rules
  // as every place you don't run yourself. Its streets and walls are remembered, so if you
  // take it back you find it as you left it, with whatever the vassal built since.

  canGrant(p) {
    if (p.owner !== 0 || !p.town) return { ok: false, why: 'Not a village of yours' };
    if (this.rank === 'Reeve') return { ok: false, why: 'From the rank of Lord' };
    if (p === this.home || FACTIONS[0].seat === p) return { ok: false, why: 'Your seat stays yours' };
    if (p.town.hostile || p.town.underAttack || p.town.revolt) return { ok: false, why: 'Not while it is fighting' };
    return { ok: true };
  }

  // Gives village p to vassal v, or to a new one.
  grant(p, v = null) {
    if (!this.canGrant(p).ok) return null;
    const t = p.town;
    const men = t.garrison().filter(r => r.alive > 0).map(r => unit(r.T.key, r.alive, r.name));
    const people = t.villagers.filter(o => o.state !== 'soldier').length;
    p.mem = remember(t, 0, this.time);
    const eco = fromTown(t, { kept: 1 });
    eco.pop = Math.max(10, people);
    Object.assign(p, { town: null, garrison: men, eco });
    if (v) {
      mark(this, v, 12, `Given ${p.name}`, Infinity);
      recall(this, v, `Given ${p.name} by you`);
    } else v = makeVassal(this, p);
    p.vassal = v.id;
    this.log(`You have given ${p.name} to ${v.name}.`);
    this.hooks.granted?.(p, v);
    return v;
  }

  // Takes a village back from its vassal. It stands as you left it, with what the vassal
  // built since laid out around your streets. The other vassals take note.
  revoke(p) {
    const v = vassalOf(this, p);
    if (!v || p.owner !== 0) return false;
    const e = p.eco, men = p.garrison;
    const town = this.makeTown(p, { villagers: Math.max(6, Math.min(80, Math.round(e.pop))), retinue: false, stock: stores(e) });
    if (p.mem) rebuild(town, p.mem, 0, true);
    p.mem = null;
    layOut(town, p, e.level, town.rand);
    p.eco = null;
    p.vassal = null;
    if (men.length) town.addTroops(men, this.angle(p, p.links[0]));
    recall(this, v, `${p.name} was taken back by you`);
    if (!holdingsOf(this, v).length) v.gone = true;
    else mark(this, v, -30, `You took ${p.name} back`, 2400);
    for (const o of living(this)) if (o !== v) mark(this, o, -12, `You took ${p.name} from ${v.name}`, 1800);
    this.log(`You have taken ${p.name} back from ${v.name}.`, 1);
    return true;
  }

  // What you can do for or to a vassal, from the place panel.
  vassalAct(v, act) {
    if (!v || v.gone) return { ok: false };
    const me = FACTIONS[0];
    if (act === 'dues+' || act === 'dues-' || act === 'levy+' || act === 'levy-') {
      const k = act.startsWith('dues') ? 'dues' : 'levy', up = act.endsWith('+');
      const was = v[k];
      v[k] = Math.max(0, Math.min(2, v[k] + (up ? 1 : -1)));
      if (v[k] === was) return { ok: false };
      // Raising what he owes stings for a while on top of the standing grievance.
      if (up) mark(this, v, -6, 'You raised what is owed', 900);
      recall(this, v, `${k === 'dues' ? 'Dues' : 'Levies'} set to ${(k === 'dues' ? DUES : LEVIES)[v[k]].name.toLowerCase()}`);
      return { ok: true };
    }
    if (act === 'gift') {
      if (me.gold < GIFT) return { ok: false, text: `Needs ${GIFT} gold` };
      me.gold -= GIFT;
      v.gold += GIFT;
      mark(this, v, 15, 'Your gifts', 900);
      recall(this, v, `Received a gift of ${GIFT} gold`);
      return { ok: true, text: `${v.name} thanks you for the gift.` };
    }
    if (act === 'council') {
      if (!v.council && living(this).filter(o => o.council).length >= COUNCIL) return { ok: false, text: `Your council has ${COUNCIL} seats` };
      v.council = !v.council;
      if (!v.council) mark(this, v, -10, 'Put off your council', 1200);
      recall(this, v, v.council ? 'Given a seat on your council' : 'Put off your council');
      return { ok: true };
    }
    return { ok: false };
  }

  // ---- spies ----
  // A spy walks in as a pedlar and comes back with what the place holds: its people,
  // buildings, stores and garrison, as they were that day. Walls and soldiers make it
  // harder; a spy who is caught angers the lord whose place it is.

  spyCost(p) { return 40 + (p.seat !== undefined ? 30 : 0) + (p.kind === 'crown' ? 60 : 0); }
  spyRisk(p) {
    const w = p.eco?.walls;
    return Math.min(0.6, 0.12 + (w === 'stone' ? 0.15 : w === 'wood' ? 0.06 : 0) + (p.eco?.focus === 'military' ? 0.08 : 0) + (p.seat !== undefined ? 0.1 : 0));
  }
  canSpy(p) {
    if (!p.seen || p.owner === 0 || p.town || !p.eco?.buildings) return { ok: false, why: 'Nothing to spy on there' };
    if (this.spies.some(s => s.at === p.id)) return { ok: false, why: 'A spy is on the way' };
    if (FACTIONS[0].gold < this.spyCost(p)) return { ok: false, why: `Needs ${this.spyCost(p)} gold` };
    return { ok: true };
  }
  sendSpy(p) {
    if (!this.canSpy(p).ok) return false;
    FACTIONS[0].gold -= this.spyCost(p);
    const from = this.home && this.home.owner === 0 ? this.home : p;
    this.spies.push({ at: p.id, back: this.time + 25 + Math.hypot(p.x - from.x, p.z - from.z) * 0.25 });
    this.log(`A spy sets out for ${p.name}.`);
    return true;
  }
  tickSpies() {
    for (const s of this.spies.filter(s => s.back <= this.time)) {
      this.spies.splice(this.spies.indexOf(s), 1);
      const p = this.byId[s.at];
      if (!p || !p.eco?.buildings || p.owner === 0) continue;
      if (this.rand() < this.spyRisk(p)) {
        this.log(`Your spy was caught in ${p.name}.`, 1);
        if (p.owner !== null && this.dip?.[p.owner]) { this.dip[p.owner].opinion -= 10; this.meet(p.owner); }
        continue;
      }
      p.intel = report(p, this.time);
      const r = p.intel, rich = ['poor', 'modest', 'rich'][r.wealth];
      this.log(`Your spy is back from ${p.name}: a ${rich} place, stores worth about ${worth(r.stock, r.gold)} gold, ${r.men} men.`);
    }
  }

  // Your taxes: every villager pays a little, more in market towns and fords; vassals
  // send a share of theirs.
  collectTaxes(dt) {
    const me = FACTIONS[0];
    for (const p of this.pois) if (p.owner === 0 && p.town && !p.town.hostile) me.gold += dt * p.town.population * p.town.taxRate * KINDS[p.kind].gold;
    for (const h of FACTIONS) if (this.dip?.[h.index]?.vassal && h.alive) { const n = Math.min(h.gold, dt * 0.6); h.gold -= n; me.gold += n; }
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
      if (t.underAttack && this.hooks.watching() !== p) {
        if (t.hostile && b.walls.structures().some(s => s.side === 1 && s.state === 'up')) thinkSiegeAttack(b, 0);
        else thinkAI(b, 0, { start: 0 });
      }
    }
    p.pruneClock -= dt;
    if (p.pruneClock <= 0) { p.pruneClock = 30; b.prune(); }
    if (p.owner === 0 && this.hooks.watching() !== p) govern(t, dt);
    if (p.falling) this.fall(p);
    if (t.hostile) this.checkStorm(p);
  }

  // How hard a place would be to take, in the same units as power().
  defence(p) {
    if (!p.town) return power(p.garrison) * this.defenceBonus(p);
    const regs = p.town.garrison();
    return regs.reduce((n, r) => n + r.alive * value(r.T.key), 0) + 25 + p.town.population * 0.3;
  }
}

export function unit(key, count, name) { return { key, count, name }; }

// What each rank brings (the crown has its own moment).
const RANKS = {
  Lord: { title: 'a lord', tools: 'You may give villages to vassals to run for you, lay out whole quarters from town templates, and call the banners.',
    trouble: 'Vassals have minds of their own: watch what they think of you.' },
  Count: { title: 'a count', tools: 'Your villages with a strong keep may raise a knights\' hall for elite men.',
    trouble: 'The great houses take you seriously now, and a slighted vassal may stop paying.' },
  Duke: { title: 'a duke', tools: 'Half the realm looks to you; the crown is within reach.',
    trouble: 'Every house measures itself against you now.' },
};

// The north fights in great numbers, with heavy foot and horse when the battle code has them.
function northGarrison(p, rand) {
  const k = { pass: 3.2, warcamp: 2.2, castle: 1.6 }[p.kind] || 0.8;
  const n = x => Math.round(x * k * (0.8 + rand() * 0.4));
  const heavy = TYPES.maa ? 'maa' : 'sword', horse = TYPES.lightcav ? 'lightcav' : 'cav';
  return [unit('spear', n(60), 'Northern spears'), unit(heavy, n(40), 'Northern axemen'), unit('archer', n(30), 'Northern bows'), unit(horse, n(16), 'Northern riders')];
}

// What a house's workshops turn out, by its lord's bent.
function pickKind(h, r, time) {
  const has = k => !!TYPES[k];
  const late = time > 900;
  const mix = {
    raider: ['spear', 'archer', has('lightcav') ? 'lightcav' : 'cav', 'sword'],
    builder: ['spear', 'archer', 'spear', 'sword'],
    turtler: ['spear', has('crossbow') ? 'crossbow' : 'archer', 'archer', 'spear'],
    schemer: ['spear', 'archer', 'sword', 'spear'],
    merchant: ['spear', has('crossbow') ? 'crossbow' : 'archer', has('maa') ? 'maa' : 'sword', 'sword'],
    hothead: ['spear', 'cav', has('knight') && late ? 'knight' : 'cav', 'sword'],
  }[h.trait] || ['spear', 'archer', 'sword', 'spear'];
  const k = mix[Math.floor(r * mix.length)];
  return k === 'cav' && !late && h.trait !== 'hothead' && h.trait !== 'raider' ? 'spear' : k;
}

// Folds arriving units into a garrison, filling regiments of the same kind first.
// How much further a place of yours sees for its watchtowers (only the best three count).
function lookouts(p) {
  if (!p.town) return 0;
  return p.town.buildings.filter(b => b.kind === 'watchtower' && b.state === 'active')
    .map(b => b.B.sight * (1 + 0.3 * ((b.level || 1) - 1))).sort((a, b) => b - a).slice(0, 3)
    .reduce((n, r, i) => n + r / (i + 1), 0);
}

export function mergeInto(garrison, units) {
  for (const u of units) recruit(garrison, u.key, u.count, u.name);
}

export function recruit(garrison, key, n, name, house) {
  const size = TYPES[key]?.count || 40;
  while (n > 0) {
    let g = garrison.find(u => u.key === key && u.count < size);
    if (!g) garrison.push(g = unit(key, 0, name || `${house ? house.short + ' ' : ''}${(TYPES[key]?.name || key).toLowerCase()}`));
    const k = Math.min(n, size - g.count);
    g.count += k;
    n -= k;
  }
}

// Takes roughly `want` strength out of a garrison, a slice of each regiment.
export function takeUnits(garrison, want) {
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
