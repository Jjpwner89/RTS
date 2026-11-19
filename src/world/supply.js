// Food for armies in the field. A man eats one food every two minutes; an army sets out
// with four minutes' worth on its carts and fills them again near its own places (yours
// from the village stores, a rival's from its holdings). Out of food, men desert. The
// wounded of a fight walk with the army, eat its food, and rejoin when it rests fed in
// its own lands. Wagons carry food from your villages to an army far from home, and can
// be caught on the road.

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
  return wag;
}

// Wagons drive straight for their army, and home again if it is gone.
export function moveWagon(w, wag, dt) {
  const W = wag.wagon, to = W.to.gone ? W.from : W.to;
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

// Enemy armies that run into a wagon take its food.
export function catchWagons(w, meet) {
  for (const wag of w.armies) {
    if (!wag.wagon || wag.gone) continue;
    const e = w.armies.find(o => !o.gone && !o.wagon && o.side !== wag.side && w.atWar(o.side, wag.side) && Math.hypot(o.x - wag.x, o.z - wag.z) < meet);
    if (!e) continue;
    e.food = (e.food || 0) + wag.wagon.food;
    w.log(`${e.name} caught the ${wag.name.toLowerCase()} on the road and took its food.`, 1);
    w.removeArmy(wag);
  }
}
