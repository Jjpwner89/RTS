// Food for armies in the field. A man eats one food every two minutes; an army sets out
// with four minutes' worth on its carts and fills them again near its own places (yours
// from the village stores, a rival's from its holdings). Out of food, men desert. The
// wounded of a fight walk with the army, eat its food, and rejoin when it rests fed in
// its own lands. Wagons carry food from your villages to an army far from home, and can
// be caught on the road.

import { FACTIONS, power } from './world.js';
import { workDone } from './works.js';

export const EAT = 1 / 120;        // food per man per second
export const CARRY = 2;            // food per man the carts hold: four minutes
const NEAR = 70;                   // this close to one of its own places, an army is fed
const REST = 1 / 45;               // share of the wounded back on their feet each second
const DESERT = 0.04;               // share of a starving army lost every ten seconds
const WAGON_SPEED = 8;

export const fit = a => a.units.reduce((n, u) => n + u.count, 0);
export const hurt = a => (a.wounded || []).reduce((n, u) => n + u.count, 0);
export const mouths = a => fit(a) + hurt(a);
export const capacity = a => Math.ceil(mouths(a) * CARRY);

// Full carts for a new army, or `food` if given.
export function provision(a, food = null) {
  a.food = food ?? capacity(a);
  a.wounded = a.wounded || [];
  a.starving = 0;
}

// Seconds of food left at the army's present size (Infinity when it is being fed).
export function foodLeft(w, a) {
  if (fedAt(w, a)) return Infinity;
  const n = mouths(a);
  return n ? a.food / (n * EAT) : Infinity;
}

// The place feeding this army, if it is close enough to one of its own (for you, a
// vassal's or an ally's will do).
export function fedAt(w, a) {
  let best = null, bd = NEAR;
  for (const p of w.pois) {
    if (p.town?.hostile) continue;
    const ours = p.owner === a.side || (a.side === 0 && p.owner !== null && (w.dip?.[p.owner]?.vassal || w.dip?.[p.owner]?.allied));
    if (!ours) continue;
    const d = Math.hypot(p.x - a.x, p.z - a.z);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

// Food in a village's keep and storehouses, keeping back one meal for the villagers.
export function spareFood(town) {
  const have = town.stores().reduce((n, b) => n + (b.store.food || 0), 0);
  return Math.max(0, Math.floor(have - town.population / 2));
}

export function takeFood(town, n) {
  let left = Math.min(n, spareFood(town));
  const got = left;
  for (const b of town.stores()) {
    const k = Math.min(left, b.store.food || 0);
    if (k > 0) { town.put(b, 'food', -k); left -= k; }
    if (left <= 0) break;
  }
  return got;
}

// After a fight: a third of the fallen were only wounded, and follow the army.
export function wound(a, before) {
  a.wounded = a.wounded || [];
  for (const u of before) {
    const now = a.units.filter(o => o.key === u.key && o.name === u.name).reduce((n, o) => n + o.count, 0);
    const lost = Math.max(0, u.count - now), n = Math.round(lost * 0.35);
    if (n < 1) continue;
    const w = a.wounded.find(o => o.key === u.key && o.name === u.name);
    if (w) w.count += n; else a.wounded.push({ ...u, count: n });
  }
}

// The wounded rejoin their companies: `share` of them, all of them at 1.
export function heal(a, share = 1) {
  for (const w of a.wounded || []) {
    const n = share >= 1 ? w.count : Math.min(w.count, Math.ceil(w.count * share));
    if (n < 1) continue;
    w.count -= n;
    const u = a.units.find(o => o.key === w.key && o.name === w.name);
    if (u) u.count += n;
    else { const { count, ...rest } = w; a.units.push({ ...rest, count: n }); }
  }
  a.wounded = (a.wounded || []).filter(w => w.count > 0);
}

// Once a second.
export function supplyArmies(w, dt) {
  for (const a of [...w.armies]) {
    if (a.gone || a.wagon) continue;
    if (a.food === undefined) provision(a);
    const n = mouths(a);
    if (!n) continue;
    const home = fedAt(w, a);
    if (home) {
      const want = capacity(a) - a.food;
      if (want > 0) {
        const rate = Math.ceil(n * 0.25 * dt);
        a.food += home.town && home.owner === 0 ? takeFood(home.town, Math.min(want, rate)) : Math.min(want, rate);
      }
      if (a.food > 0) heal(a, REST * dt);
    } else a.food = Math.max(0, a.food - n * EAT * dt);
    if (a.food > 0) { a.starving = 0; continue; }
    // Starving: the wounded die first, then whole files slip away in the night.
    a.starving = (a.starving || 0) + dt;
    if (a.starving < 10) continue;
    a.starving = 0.001;
    if (!a.warnedHunger) {
      a.warnedHunger = true;
      if (a.side === 0) w.log(`${a.name} has run out of food. Men are deserting.`, 1);
      else if (a.visible) w.log(`${a.name} is starving; its men are deserting.`, 2);
    }
    for (const u of a.wounded || []) u.count = Math.floor(u.count * 0.85);
    a.wounded = (a.wounded || []).filter(u => u.count > 0);
    for (const u of a.units) u.count -= Math.max(1, Math.round(u.count * DESERT));
    a.units = a.units.filter(u => u.count >= 3);
    if (!a.units.length) {
      if (a.side === 0) w.log(`${a.name} has melted away from hunger.`, 1);
      w.removeArmy(a);
    }
  }
}

// ---- wagons ----

// The nearest village of yours with food to spare, and how much it can send.
export function wagonFrom(w, a) {
  const towns = w.pois.filter(p => p.owner === 0 && p.town && !p.town.hostile && !p.town.underAttack && spareFood(p.town) >= 20);
  const p = towns.sort((p, q) => Math.hypot(p.x - a.x, p.z - a.z) - Math.hypot(q.x - a.x, q.z - a.z))[0];
  if (!p) return null;
  return { p, load: Math.min(spareFood(p.town), Math.max(40, capacity(a) - a.food), 600) };
}

export function sendWagon(w, a) {
  const src = wagonFrom(w, a);
  if (!src) return null;
  const food = takeFood(src.p.town, src.load);
  const wag = w.spawnArmy(0, [], src.p, `Supply wagon from ${src.p.name}`, 'wagon');
  wag.wagon = { food, to: a, from: src.p };
  wag.at = null;
  w.log(`A wagon with ${food} food sets out from ${src.p.name} for ${a.name}.`);
  w.hooks.sound?.('cart'); // audio
  return wag;
}

// ---- trade caravans ----
// Every few minutes a market town (and Kingsbridge) sends a caravan of gold to another
// market whose lord is not at war with its own. It pays both lords when it arrives. An
// enemy or outlaw army that meets it on the road takes the gold, unless an escort is
// with it and holds them off. Caravans are wagons with W.gold and W.trade.
const TRADE_EVERY = [240, 380];
const markets = w => w.pois.filter(p => (p.kind === 'market' || p.kind === 'crown') && p.owner !== w.bandits && p.owner !== w.invader && !p.town?.hostile && !p.town?.underAttack);

export function tickTrade(w, dt) {
  for (const p of markets(w)) {
    p.tradeCd = (p.tradeCd ?? TRADE_EVERY[0] * w.rand()) - dt;
    if (p.tradeCd > 0) continue;
    p.tradeCd = TRADE_EVERY[0] + w.rand() * (TRADE_EVERY[1] - TRADE_EVERY[0]);
    const to = markets(w).filter(q => q !== p && !w.atWar(p.owner, q.owner))
      .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)).slice(0, 3);
    const dest = to[Math.floor(w.rand() * to.length)];
    if (!dest) continue;
    const people = p.town ? p.town.population : p.eco?.pop ?? 20;
    const gold = Math.round((20 + people * 0.6) * (p.kind === 'crown' && workDone(w, 'market') ? 2 : 1));
    const side = p.owner;   // free markets have no lord to send a caravan
    if (side === null || side === undefined) continue;
    const cart = w.spawnArmy(side, [], p, `Caravan from ${p.name}`, 'wagon');
    cart.wagon = { gold, to: dest, from: p, trade: true };
    cart.at = null;
    if (side === 0) w.log(`A caravan with ${gold} gold sets out from ${p.name} for ${dest.name}.`);
  }
}

// An army of yours guards a caravan of yours: it rides alongside until the caravan arrives.
export function escort(w, a, cart) {
  if (!(cart?.wagon?.trade || cart?.wagon?.run) || cart.gone || a.side !== 0 || cart.side !== 0) return false;
  a.escort = cart.id;
  a.path = [];
  a.siege = null;
  w.log(`${a.name} rides with the ${cart.name.replace(/^(Caravan|Supply)/, m => m.toLowerCase())}.`);
  return true;
}
export function followCart(w, a) {
  const cart = w.armies.find(o => o.id === a.escort && !o.gone);
  if (!cart) { a.escort = null; return; }
  a.x = cart.x + 3; a.z = cart.z + 3; a.heading = cart.heading; a.at = null;
}
// Caravans of yours on the road within reach of an army, for its panel.
export const cartsNear = (w, a) => w.armies.filter(o => (o.wagon?.trade || o.wagon?.run) && o.side === 0 && !o.gone && Math.hypot(o.x - a.x, o.z - a.z) < 220 && !w.armies.some(e => e.escort === o.id));

// ---- supply runs ----
// One of your villages sends a wagon of its spare building goods and food, and a few
// families, to another: mostly to put a place back on its feet after it was taken or
// burned. Half of each good stays at home. A raider who meets the wagon seizes it.
const RUN_GOODS = { food: 40, bread: 20, wood: 40, planks: 20, stone: 30, iron: 10 };
const RUN_PEOPLE = 4;
export function runLoad(from) {
  const t = from.town, have = t.stock, goods = {};
  for (const [g, n] of Object.entries(RUN_GOODS)) { const k = Math.min(n, Math.floor((have[g] || 0) / 2)); if (k > 0) goods[g] = k; }
  return { goods, people: t.population > 20 ? RUN_PEOPLE : 0 };
}
export function runCheck(w, from, to) {
  if (!from?.town || !to?.town || from.owner !== 0 || to.owner !== 0 || from === to) return { ok: false, why: 'Both ends must be villages of yours' };
  if (from.town.hostile || from.town.underAttack) return { ok: false, why: `${from.name} is being fought over` };
  if (w.armies.some(a => a.wagon?.run && a.wagon.from === from && !a.gone)) return { ok: false, why: `A wagon from ${from.name} is already on the road` };
  const load = runLoad(from);
  if (!Object.keys(load.goods).length && !load.people) return { ok: false, why: `${from.name} has nothing to spare` };
  return { ok: true, load };
}
export function sendRun(w, from, to) {
  const c = runCheck(w, from, to);
  if (!c.ok) return c;
  const t = from.town;
  t.spend(c.load.goods);
  for (let i = 0; i < c.load.people; i++) {
    const v = t.villagers.find(o => o.state === 'idle') || t.villagers.find(o => o.state !== 'soldier' && o.state !== 'shelter');
    if (!v) { c.load.people = i; break; }
    t.release(v);
    t.villagers = t.villagers.filter(o => o !== v);
  }
  const wag = w.spawnArmy(0, [], from, `Supply run from ${from.name}`, 'wagon');
  wag.wagon = { run: true, goods: c.load.goods, people: c.load.people, to, from };
  wag.at = null;
  w.log(`A supply run sets out from ${from.name} for ${to.name}: ${loadText(wag.wagon)}.`);
  w.hooks.sound?.('cart'); // audio
  return { ok: true, wagon: wag };
}
export const loadText = W => [...Object.entries(W.goods).map(([g, n]) => `${n} ${g}`), W.people ? `${W.people} families` : ''].filter(Boolean).join(', ') || 'nothing';
function unload(w, cart, p) {
  const W = cart.wagon, t = p.town;
  for (const [g, n] of Object.entries(W.goods)) t.put(t.keep, g, n);
  for (let i = 0; i < W.people; i++) { const a = t.rand() * Math.PI * 2; t.addVillager(Math.sin(a) * 14, Math.cos(a) * 14); }
  if (W.bought) { t.event?.(`The goods bought at ${W.from.name} have come in: ${loadText(W)}.`); w.log(`The cart from ${W.from.name} reached ${p.name}: ${loadText(W)}.`); return; }
  t.event?.(`A supply run from ${W.from.name} has come in: ${loadText(W)}.`);
  w.log(p === W.from ? `The supply run came back to ${p.name}.` : `The supply run reached ${p.name}: ${loadText(W)}.`);
}

// Wagons drive straight for their army, and home again if it is gone.
export function moveWagon(w, wag, dt) {
  const W = wag.wagon;
  if (W.trade || W.run) return moveCaravan(w, wag, dt);
  const to = W.to.gone ? W.from : W.to;
  const d = Math.hypot(to.x - wag.x, to.z - wag.z), step = WAGON_SPEED * dt;
  wag.heading = Math.atan2(to.x - wag.x, to.z - wag.z);
  if (d > Math.max(step, 6)) { wag.x += (to.x - wag.x) / d * step; wag.z += (to.z - wag.z) / d * step; return; }
  if (to === W.from) {
    if (W.from.town && W.from.owner === 0) W.from.town.put(W.from.town.keep, 'food', W.food);
  } else {
    W.to.food = (W.to.food || 0) + W.food;
    W.to.warnedHunger = false;
    w.log(`The wagon from ${W.from.name} has reached ${W.to.name} with ${W.food} food.`);
  }
  w.removeArmy(wag);
}

function moveCaravan(w, cart, dt) {
  const W = cart.wagon, to = W.to;
  const d = Math.hypot(to.x - cart.x, to.z - cart.z), step = WAGON_SPEED * 0.8 * dt * (cart.side === 0 && w.decrees?.on?.roads ? 1.2 : 1);
  cart.heading = Math.atan2(to.x - cart.x, to.z - cart.z);
  if (d > Math.max(step, 6)) { cart.x += (to.x - cart.x) / d * step; cart.z += (to.z - cart.z) / d * step; return; }
  if (W.run) {
    // Still yours: unloaded. Lost on the way: it turns for home, and failing that is gone.
    if (to.owner === 0 && to.town) unload(w, cart, to);
    else if (to !== W.from && W.from.owner === 0 && W.from.town) { W.to = W.from; w.log(`${to.name} is lost; the supply run turns back.`); return; }
    else w.log(W.bought ? `The cart from ${W.from.name} had nowhere to go, and its goods were lost.` : `The supply run had nowhere to go, and its people scattered.`);
    return w.removeArmy(cart);
  }
  // Both lords profit: the sender its gold, the market at the other end half as much again.
  const pay = (side, n) => { if (side !== null && side !== undefined && FACTIONS[side]) FACTIONS[side].gold += n; };
  pay(cart.side, W.gold);
  if (to.owner !== cart.side) pay(to.owner, Math.round(W.gold / 2));
  if (cart.side === 0) w.log(`The caravan from ${W.from.name} reached ${to.name}: ${W.gold} gold.`);
  else if (to.owner === 0) w.log(`A caravan from ${W.from.name} trades at ${to.name}: ${Math.round(W.gold / 2)} gold for you.`);
  if (cart.side === 0 || to.owner === 0) w.hooks.sound?.('coins'); // audio
  for (const a of w.armies) if (a.escort === cart.id) { a.escort = null; a.at = to; a.x = to.x; a.z = to.z; a.last = to; }
  w.removeArmy(cart);
}

// Enemy armies that run into a wagon take its food, or a caravan's gold. An escort
// stands in the way: a raider weaker than it is driven off; a stronger one beats it
// (in a fight you are asked about, if the escort is yours) and then takes the cart.
export function catchWagons(w, meet) {
  for (const wag of w.armies) {
    if (!wag.wagon || wag.gone) continue;
    const e = w.armies.find(o => !o.gone && !o.wagon && !o.escort && o.side !== wag.side && w.atWar(o.side, wag.side) && Math.hypot(o.x - wag.x, o.z - wag.z) < meet);
    if (!e) continue;
    const guard = w.armies.find(o => o.escort === wag.id && !o.gone);
    if (guard) {
      if (power(e.units) < power(guard.units) * 0.8) { w.retreat(e); if (guard.side === 0) w.log(`${guard.name} drove ${e.name} off the caravan.`); continue; }
      if (guard.side === 0 && !w.encounter) { guard.escort = null; w.ask({ kind: 'field', army: guard, enemy: e, poi: null }); }
      continue;
    }
    if (wag.wagon.run) {
      w.log(wag.wagon.bought ? `${e.name} robbed the cart of goods you bought at ${wag.wagon.from.name}.` : `${e.name} seized your supply run from ${wag.wagon.from.name}.`, 1);
      w.removeArmy(wag);
      continue;
    }
    if (wag.wagon.trade) {
      if (FACTIONS[e.side]) FACTIONS[e.side].gold += wag.wagon.gold;
      if (wag.side === 0) w.log(`${e.name} robbed your caravan from ${wag.wagon.from.name} of ${wag.wagon.gold} gold.`, 1);
      else if (e.side === 0) w.log(`${e.name} took ${wag.wagon.gold} gold from a ${FACTIONS[wag.side]?.short || ''} caravan.`);
      w.removeArmy(wag);
      continue;
    }
    e.food = (e.food || 0) + wag.wagon.food;
    w.log(`${e.name} caught the ${wag.name.toLowerCase()} on the road and took its food.`, 1);
    w.removeArmy(wag);
  }
}
