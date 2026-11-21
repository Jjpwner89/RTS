// The places you don't run yourself (rival holdings and free villages) keep a real
// economy, run on the village's own rules and building table: so many houses, farms,
// workshops and stores; people who work them, eat and settle; goods that pile up; and
// kit that becomes soldiers. It is kept as numbers rather than walking villagers, and a
// lord's steward runs a place less hard than you run a village you watch yourself.
// What a place holds can be spied on, and is what you find when you storm it.
import { BUILDINGS, RESERVE, weaponKit, outfit, outfitKit, GAME, FIREWOOD, REPUTE, settleRate } from '../economy.js';
import { TYPES } from '../battle.js';

const EFF = 0.4;            // share of a hard-driven village's output a steward gets
const EAT = 1 / 60;         // food per person per second, as in your villages
const STEWARD_MOOD = 52;    // a steward's village is middling content, never as eager as one you look after
const WORKING = 0.7;        // share of people who work; the rest are young, old or idle
// Rivals were paced on the gatherers' yields before pace B (2026-11-21). Your villagers now walk at
// half the speed and bring back more a trip (economy.js), but a steward's place counts no walking,
// so it keeps the old yield a second: the share of the new one it gets.
const OLD_YIELD = { woodcutter: 0.5, quarry: 0.5, mine: 4 / 9, hunter: 0.5, farm: 0.6, flax: 2 / 3 };
const BUILD_EVERY = 40;     // seconds between new buildings
const KEEP_HOUSING = 12;

// What a steward builds, in order, for the place's trade. After the list: houses and
// farms as needed, and a little of everything that is short.
const PLANS = {
  farming: ['farm', 'woodcutter', 'house', 'hunter', 'farm', 'house', 'quarry', 'storehouse', 'house', 'farm', 'carpenter', 'house', 'mill', 'farm', 'house', 'bakery', 'well', 'house'],
  military: ['farm', 'woodcutter', 'house', 'carpenter', 'quarry', 'mine', 'smelter', 'house', 'farm', 'weaponsmith', 'barracks', 'house',
    'carpenter', 'hunter', 'flax', 'ropemaker', 'bowyer', 'farm', 'house', 'woodcutter', 'mine', 'smelter', 'house', 'farm', 'weaponsmith', 'house'],
  trade: ['farm', 'woodcutter', 'house', 'market', 'storehouse', 'house', 'carpenter', 'farm', 'house', 'quarry', 'hunter', 'tanner', 'house', 'storehouse', 'farm', 'house', 'well', 'house'],
  production: ['farm', 'woodcutter', 'woodcutter', 'house', 'quarry', 'mine', 'house', 'smelter', 'carpenter', 'farm', 'house', 'storehouse',
    'mine', 'house', 'flax', 'ropemaker', 'farm', 'house', 'bowyer', 'house'],
};
// Once the plan is built, a place keeps adding to what it is known for, a little at a time.
const GROW = {
  farming: ['farm', 'mill', 'bakery', 'farm', 'well'],
  military: ['mine', 'smelter', 'carpenter', 'weaponsmith', 'woodcutter'],
  trade: ['market', 'carpenter', 'storehouse', 'farm', 'woodcutter'],
  production: ['mine', 'smelter', 'woodcutter', 'quarry', 'carpenter'],
};
// How big a place can grow: people and buildings, before its size factor.
const ROOM = { village: [100, 34], seat: [150, 50], crown: [240, 70] };
// How each kind of place leans.
const LEAN = {
  village: ['farming', 'farming', 'production', 'trade', 'military'],
  castle: ['military'], mine: ['production'], ford: ['trade', 'military'], monastery: ['farming'],
  market: ['trade'], crown: ['military', 'trade'],
};
export const WEALTH = [
  { name: 'poor', pop: 0.7, stock: 0.4, built: -3, guard: 0.7 },
  { name: 'modest', pop: 1, stock: 1, built: 0, guard: 1 },
  { name: 'wealthy', pop: 1.25, stock: 2.6, built: 3, guard: 1.1 },
];
export const FOCUS_NAMES = { farming: 'farms and families', military: 'arms and men', trade: 'trade and coin', production: 'timber, stone and iron' };

// Kit for the soldiers a place can raise, best first: the goods each man needs.
const RAISE = ['sword', 'spear', 'archer', 'militia'];
const kitOf = k => (TYPES[k].kit ? weaponKit(k) : {});

// ---- making a place ----

// `size` is the old headcount the realm was made with; `opts.seat` for a lord's seat.
export function seedEconomy(p, rand, { seat = false, crown = false, kindPop = 1 } = {}) {
  const leans = LEAN[p.kind] || LEAN.village;
  const focus = seat ? 'military' : leans[Math.floor(rand() * leans.length)];
  // Most places are modest; markets lean rich, mining villages and abbeys rarely poor.
  let roll = rand();
  if (p.kind === 'market') roll = 0.35 + roll * 0.65;
  if (seat || crown) roll = Math.max(roll, 0.5);
  const tier = roll < 0.28 ? 0 : roll < 0.8 ? 1 : 2, W = WEALTH[tier];
  const level = crown ? 3 : seat ? 2 : 1;
  const pop = Math.round(((seat ? 55 : 32) * kindPop + (crown ? 30 : 0)) * W.pop * (0.85 + rand() * 0.3));
  const [people, built] = ROOM[crown ? 'crown' : seat ? 'seat' : 'village'];
  const room = kindPop * (0.85 + tier * 0.15);
  const e = { pop, level, focus, wealth: tier, buildings: {}, stock: {}, gold: 0, planAt: 0, grown: 0, buildCd: rand() * BUILD_EVERY, arms: 0,
    raised: 0, maxPop: Math.round(people * room), maxBuilt: Math.round(built * room) };
  // An established place already has the start of its plan built, more if it is rich.
  const plan = PLANS[focus];
  const n = Math.max(3, Math.min(plan.length, 5 + level * 3 + W.built + Math.floor(rand() * 3)));
  for (const k of plan.slice(0, n)) add(e, k);
  e.planAt = n;
  // An abbey has its church, whatever else it has.
  if (p.kind === 'monastery' && !e.buildings.monastery) add(e, 'monastery');
  while (housing(e) < pop + 2) add(e, 'house');
  // Enough fields and hunters to feed them, as any steward would see to.
  const fed = () => ((e.buildings.farm || 0) * 2 * 4 / 7 + (e.buildings.hunter || 0) * 2 * 3 / 10) * EFF * 60;
  while (fed() < pop * 1.15) add(e, 'farm');
  // Goods in its stores: something of everything it makes, much more if it is rich.
  const S = W.stock * (0.8 + rand() * 0.4);
  const put = (g, k) => { e.stock[g] = Math.round((e.stock[g] || 0) + k * S); };
  put('food', 60 + pop * 2); put('wood', 50); put('stone', 20);
  for (const k of Object.keys(e.buildings)) for (const g of outputs(k)) put(g, GOOD_HOARD[g] ?? 10);
  e.gold = Math.round((focus === 'trade' ? 120 : 30) * W.stock * (0.6 + rand() * 0.8) * (crown ? 3 : 1));
  // Walls: seats, castles and the royal city always; wealthy trading towns often go without.
  e.walls = crown || p.kind === 'castle' ? 'stone' : seat ? (tier === 2 ? 'stone' : 'wood')
    : focus === 'military' && rand() < 0.6 ? 'wood' : tier === 2 && focus !== 'trade' && rand() < 0.4 ? 'wood' : 'none';
  return e;
}

// How much of a good a place keeps around per building that makes it, as a start.
const GOOD_HOARD = { food: 40, wood: 40, stone: 30, ore: 20, iron: 10, planks: 20, shields: 8, leatherarmour: 6, spears: 6, swords: 4, bows: 4, arrows: 50,
  string: 10, flax: 15, feathers: 20, hides: 10, leather: 6, flour: 10, bread: 20 };

function add(e, k) { e.buildings[k] = (e.buildings[k] || 0) + 1; }
const B_count = (e, k) => e.buildings[k] || 0;
function outputs(k) {
  const B = BUILDINGS[k];
  if (B?.gather) return Object.keys(B.gather.out);
  if (B?.recipes) return [...new Set(B.recipes.filter(r => !r.off).flatMap(r => Object.keys(r.out)))];
  return [];
}
export const housing = e => KEEP_HOUSING + (e.buildings.house || 0) * BUILDINGS.house.housing;
export const builtCount = e => Object.values(e.buildings).reduce((n, k) => n + k, 0);

// ---- running it ----

// One step of `dt` seconds for place p. Returns gold made for its lord.
export function runEconomy(p, dt, { pace = 1 } = {}) {
  const e = p.eco, s = e.stock, B = e.buildings;
  // Who works: as many jobs as there are hands for.
  let jobs = 0;
  for (const [k, n] of Object.entries(B)) jobs += (BUILDINGS[k]?.jobs || 0) * n;
  const share = jobs ? Math.min(1, e.pop * WORKING / jobs) : 0;
  const work = dt * EFF * share * pace;
  // Gatherers. Hunters thin the game round the place, which breeds back slowly, as in yours.
  for (const [k, n] of Object.entries(B)) {
    const G = BUILDINGS[k]?.gather;
    if (!G) continue;
    let rate = n * BUILDINGS[k].jobs * work / G.time * (OLD_YIELD[k] ?? 1);
    if (G.game) {
      e.game = Math.max(0, Math.min(1, (e.game ?? 1) + dt * GAME.regrow - rate * GAME.take / (6 * n)));
      rate *= Math.min(1, e.game / (GAME.take * (OLD_YIELD[k] ?? 1)));
    }
    for (const [g, q] of Object.entries(G.out)) s[g] = (s[g] || 0) + q * rate;
  }
  // Workshops take turns at whatever they can make that the place still wants.
  let gold = 0;
  for (const [k, n] of Object.entries(B)) {
    const R = BUILDINGS[k]?.recipes;
    if (!R) continue;
    // (as in your villages, planks are kept back for building before they go into kit)
    const list = R.filter(r => !r.off && Object.keys(r.out).every(g => (s[g] || 0) < (r.keep ?? 400))
      && (r.above === undefined || Object.entries(r.in).every(([g, q]) => (s[g] || 0) >= r.above + q))
      && !('planks' in r.in && !('planks' in r.out) && (s.planks || 0) < RESERVE.planks + r.in.planks + (e.wantHall ? BUILDINGS.hall.cost.planks : 0)));
    if (!list.length) continue;
    for (const r of list) {
      let cycles = n * (BUILDINGS[k].jobs || 1) * work / r.time / list.length;
      for (const [g, q] of Object.entries(r.in)) cycles = Math.min(cycles, (s[g] || 0) / q);
      if (cycles <= 0) continue;
      for (const [g, q] of Object.entries(r.in)) s[g] -= q * cycles;
      for (const [g, q] of Object.entries(r.out)) s[g] = (s[g] || 0) + q * cycles;
      if (r.gold) gold += r.gold * cycles;
    }
  }
  // Eating: bread first. Hungry places lose people.
  let need = e.pop * EAT * dt;
  for (const g of ['bread', 'food']) { const k = Math.min(need, s[g] || 0); s[g] = (s[g] || 0) - k; need -= k; }
  e.hungry = need > 0.01;
  // Hearths burn wood, a little for each house.
  const fire = ((B.house || 0) + 1) * FIREWOOD / 60 * dt;
  e.cold = (s.wood || 0) < fire;
  s.wood = Math.max(0, (s.wood || 0) - fire);
  // Newcomers on your villages' rules: spare food, mood and the place's name; houses only make room.
  if (e.hungry) e.pop = Math.max(6, e.pop - dt / 60);
  else if (e.pop < housing(e)) {
    const name = ['monastery', 'market', 'well'].reduce((n, k) => n + (B[k] ? REPUTE[k] : 0), 1 + (e.cold ? REPUTE.cold : 0));
    const larder = ((s.food || 0) + (s.bread || 0)) / Math.max(1, e.pop);
    e.pop = Math.min(housing(e), e.pop + dt / 60 * settleRate(larder, STEWARD_MOOD, name));
  }
  // Building: one thing at a time, from its own goods.
  e.buildCd -= dt;
  if (e.buildCd <= 0) { e.buildCd = BUILD_EVERY; build(e); }
  e.level = Math.min(4, Math.max(e.level, 1 + Math.floor(builtCount(e) / 14)));
  return gold;
}

// A full place clears new ground, as your villages grow outward (Orchestrator, 2026-11-21:
// free villages froze at their caps). It costs the wood and stone of the work, and only a fed
// place does it; the ground is finite, twice what it started with. Room for buildings and for
// people grows together, so its limits are land and food, not a number fixed at the start.
const CLEAR = { wood: 60, stone: 30, built: 2, people: 6, upTo: 2 };
function clear(e) {
  const s = e.stock;
  e.land0 ??= [e.maxBuilt ?? 40, e.maxPop ?? 120];
  if (e.hungry || (s.food || 0) < e.pop * 1.5 || (e.maxBuilt ?? 40) >= e.land0[0] * CLEAR.upTo) return;
  if ((s.wood || 0) < CLEAR.wood || (s.stone || 0) < CLEAR.stone) return;
  s.wood -= CLEAR.wood; s.stone -= CLEAR.stone;
  e.maxBuilt = (e.maxBuilt ?? 40) + CLEAR.built;
  e.maxPop = (e.maxPop ?? 120) + CLEAR.people;
}

function nextBuild(e) {
  const s = e.stock, plan = PLANS[e.focus] || PLANS.farming;
  // A grown military place raises a knights' hall (as yours need a strong keep: level 3)
  // and trains elites there from its veterans (world.js trainHall). It saves the planks
  // for it, and the hall may stand beyond the usual count of buildings.
  e.wantHall = e.focus === 'military' && e.level >= 3 && !!e.buildings.barracks && !e.buildings.hall;
  const can = k => Object.entries(BUILDINGS[k].cost).every(([g, q]) => (s[g] || 0) >= q);
  if (e.wantHall && can('hall')) return 'hall';
  // With a hall, the kit for its men: leather and mail, and horses.
  if (e.buildings.hall) for (const k of ['tanner', 'armourer', 'stable']) if (!e.buildings[k] && can(k)) return k;
  if (builtCount(e) >= (e.maxBuilt ?? 40)) { clear(e); return null; }
  if (e.hungry || (s.food || 0) < e.pop * 1.5) return 'farm';
  if (e.cold && (B_count(e, 'woodcutter') < 1 + (e.buildings.house || 0) / 8)) return 'woodcutter';
  if (e.pop >= housing(e) - 3 && housing(e) < (e.maxPop ?? 120)) return 'house';
  if (e.planAt < plan.length) return plan[e.planAt];
  if ((s.wood || 0) < 40) return 'woodcutter';
  // a little more of its trade, every other turn
  e.rests = (e.rests || 0) + 1;
  if (e.rests % 2) return null;
  const more = GROW[e.focus] || GROW.farming;
  return more[(e.grown || 0) % more.length];
}

function build(e) {
  const k = nextBuild(e), cost = BUILDINGS[k]?.cost;
  const plan = PLANS[e.focus] || PLANS.farming, more = GROW[e.focus] || GROW.farming;
  if (!cost || !Object.entries(cost).every(([g, q]) => (e.stock[g] || 0) >= q)) {
    // Something it can't pay for yet: when growing, try the next thing on the list instead.
    if (cost && e.planAt >= plan.length && more[(e.grown || 0) % more.length] === k) e.grown = (e.grown || 0) + 1;
    return false;
  }
  for (const [g, q] of Object.entries(cost)) e.stock[g] -= q;
  add(e, k);
  if (e.planAt < plan.length) { if (plan[e.planAt] === k) e.planAt++; }
  else if (more[(e.grown || 0) % more.length] === k) e.grown = (e.grown || 0) + 1;
  return k;
}

// ---- kit and soldiers ----

// How many men the stores can arm, and with what.
export function kits(e) {
  let n = 0;
  const s = { ...e.stock };
  for (const k of RAISE) {
    const kit = kitOf(k);
    const m = Math.floor(Math.min(...Object.entries(kit).map(([g, q]) => (s[g] || 0) / q)));
    if (m > 0) { n += m; for (const [g, q] of Object.entries(kit)) s[g] -= q * m; }
  }
  return n;
}

// Arms up to n men from the stores and the people, best kit first. A place keeps at
// least `keep` people at work. Returns [{ key, count }].
// Men raised from a tracked village take weapons, and armour and shields by their lord's
// rule for the racks (policy: 'best', 'elites' or 'none'), one level to each batch.
export function arm(e, n, keep = 12, policy = 'best') {
  const out = [];
  for (const k of RAISE) {
    if (n <= 0) break;
    const kit = kitOf(k);
    const m = Math.floor(Math.min(n, e.pop - keep, ...Object.entries(kit).map(([g, q]) => (e.stock[g] || 0) / q)));
    if (m <= 0) continue;
    // A level is worn once there is enough for ten men, so small batches match their regiments.
    const fit = outfit(k, Math.max(m, 10), g => Math.floor(e.stock[g] || 0), policy);
    for (const [g, q] of Object.entries(outfitKit(k, m, fit))) e.stock[g] = (e.stock[g] || 0) - q;
    e.pop -= m;
    e.raised = (e.raised || 0) + m;
    n -= m;
    out.push({ key: k, count: m, ...fit });
  }
  return out;
}

// Men under arms eat as they did at work (your soldiers are villagers and eat at the
// hearths): a house's garrison is fed from its place's stores. Returns how many went unfed.
export function feedMen(e, men, dt) {
  let need = men * EAT * dt;
  for (const g of ['bread', 'food']) { const k = Math.min(need, e.stock[g] || 0); e.stock[g] = (e.stock[g] || 0) - k; need -= k; }
  return need / (EAT * dt);
}

// Up to n men go home to work: back among the people, their weapons back in the stores
// (armour is kept by the men who wore it). The plainest go first.
export function standDown(e, garrison, n) {
  let left = Math.floor(n);
  for (let i = garrison.length - 1; i >= 0 && left > 0; i--) {
    const u = garrison[i];
    if (u.until || !TYPES[u.key] || TYPES[u.key].engine) continue;
    const k = Math.min(u.count, left);
    u.count -= k; left -= k; e.pop += k;
    for (const [g, q] of Object.entries(kitOf(u.key))) e.stock[g] = (e.stock[g] || 0) + q * k;
  }
  for (let i = garrison.length - 1; i >= 0; i--) if (garrison[i].count <= 0) garrison.splice(i, 1);
  return Math.floor(n) - left;
}

// ---- changing hands ----

// A village you ran becomes a holding as it stands: what was built and not burned, its
// people and what was left in its stores (the victors carry some of it off).
export function fromTown(t, { kept = 0.6 } = {}) {
  const buildings = {};
  for (const b of t.buildings) if (b.state === 'active' && BUILDINGS[b.kind]) buildings[b.kind] = (buildings[b.kind] || 0) + 1;
  const stock = {};
  for (const [g, q] of Object.entries(t.stock || {})) if (q > 0) stock[g] = q * kept;
  const focus = (buildings.weaponsmith || 0) + (buildings.barracks || 0) >= 2 ? 'military' : buildings.market ? 'trade'
    : (buildings.mine || 0) + (buildings.smelter || 0) >= 2 ? 'production' : 'farming';
  const pop = Math.max(10, t.villagers.filter(v => v.state !== 'soldier').length * 0.7);
  const e = { pop, level: 1, focus, wealth: 1, buildings, stock, gold: 0, planAt: PLANS[focus].length, grown: 0, buildCd: BUILD_EVERY, arms: 0,
    raised: 0, maxPop: Math.max(100, Math.round(pop * 1.5)), maxBuilt: Math.max(34, Object.values(buildings).reduce((n, k) => n + k, 0) + 8),
    walls: wallsOf(t.battle.walls, 0) };
  e.level = Math.min(4, 1 + Math.floor(builtCount(e) / 14));
  e.wealth = worth(stock) > 1500 ? 2 : worth(stock) < 250 ? 0 : 1;
  return e;
}

// A town's walls for its numbers: stone if most of its wall is stone, wood if it has any.
function wallsOf(W, side) {
  const mine = [...W.pieces.filter(p => p.side === side), ...W.nodes.filter(n => n.side === side && n.tower).map(n => n.tower)];
  if (!mine.length) return 'none';
  return mine.filter(p => p.material === 'stone').length * 2 > mine.length ? 'stone' : 'wood';
}

// Burned buildings are gone from a place's tally.
export function burn(e, kinds) {
  for (const k of kinds) if (e.buildings[k] > 0) e.buildings[k]--;
}

// What is carried into a stormed or taken village: all its stores, whole.
export function stores(e) {
  return Object.fromEntries(Object.entries(e.stock).map(([g, q]) => [g, Math.floor(q)]).filter(([, q]) => q > 0));
}

// ---- what a spy sees ----

export function report(p, time) {
  const e = p.eco;
  const goods = Object.fromEntries(Object.entries(e.stock).map(([g, q]) => [g, Math.floor(q)]).filter(([, q]) => q >= 1));
  return { at: time, owner: p.owner, pop: Math.round(e.pop), wealth: e.wealth, focus: e.focus, walls: e.walls, buildings: { ...e.buildings },
    stock: goods, gold: Math.round(e.gold || 0), men: p.garrison.reduce((n, u) => n + u.count, 0), kits: kits(e) };
}

// A rough worth of what is in a place's stores, in gold, for comparing places.
const PRICE = { food: 0.6, wood: 0.5, stone: 0.6, ore: 0.8, iron: 3, planks: 1.2, shields: 4, leatherarmour: 4, spears: 4, swords: 8, bows: 5, arrows: 0.4,
  crossbows: 9, bolts: 0.5, mail: 12, armour: 20, horses: 15, lances: 6, string: 1, flax: 0.4, feathers: 0.2, hides: 1, leather: 2, flour: 0.8, bread: 1 };
export function worth(stock, gold = 0) {
  return Math.round(gold + Object.entries(stock).reduce((n, [g, q]) => n + q * (PRICE[g] ?? 1), 0));
}
