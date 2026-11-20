// What gold buys besides men: the pay of elite soldiers, and goods at the market towns.
//
// Knights and men-at-arms draw pay every minute, as mercenary companies do, wherever they
// stand: in a village, a garrison or an army in the field. It is the realm's great drain
// on gold, and it grows with the army, for the rivals as for you. Unpaid, they grumble,
// and then stand down a company at a time.
//
// A market town you hold, or whose lord is at peace with you, sells iron, horses, grain,
// mail and swords. Every lot bought there raises its price, which settles back slowly; a cart
// hauls the goods to your nearest village and can be robbed on the way. Rival houses buy
// there too for their own stores, at the going price.
import { FACTIONS } from './world.js';
import { ELITE } from '../economy.js';

const payOf = key => (ELITE[key] ?? ELITE.maa).pay;      // gold per man per minute
const UNPAID_GRUMBLE = 45, UNPAID_STAND_DOWN = 150, STAND_DOWN_EVERY = 30;

// Every elite soldier of `side`, as [holder, count, key, standDown()] rows.
function elitesOf(w, side) {
  const out = [];
  for (const p of w.pois) {
    if (p.owner !== side) continue;
    if (p.town && !p.town.hostile) {
      for (const r of p.town.battle.regs) if (r.side === 0 && r.elite && !r.gone && r.alive > 0)
        out.push({ n: r.alive, key: r.T.key, off: () => p.town.disband(r), where: p.name });
    } else {
      for (const u of p.garrison) if (u.elite) out.push({ n: u.count, key: u.key, off: () => { p.garrison = p.garrison.filter(o => o !== u); }, where: p.name });
    }
  }
  for (const a of w.armies) {
    if (a.side !== side || a.gone) continue;
    for (const u of a.units) if (u.elite) out.push({ n: u.count, key: u.key, off: () => { a.units = a.units.filter(o => o !== u); }, where: a.name });
  }
  return out;
}

// Gold a minute that `side`'s elite soldiers draw.
export const elitePay = (w, side) => elitesOf(w, side).reduce((n, e) => n + e.n * payOf(e.key), 0);

export function payElites(w, dt) {
  w.elitePay ??= {};
  for (const H of FACTIONS) {
    if (!H.alive || H.bandit || H.invader) continue;
    const list = elitesOf(w, H.index);
    if (!list.length) { delete w.elitePay[H.index]; continue; }
    const due = list.reduce((n, e) => n + e.n * payOf(e.key), 0) * dt / 60;
    const S = w.elitePay[H.index] ??= { unpaid: 0, grumbled: false, next: 0 };
    if (H.gold >= due) { H.gold -= due; S.unpaid = 0; S.grumbled = false; continue; }
    H.gold = 0;
    S.unpaid += dt;
    if (H.index === 0 && S.unpaid >= UNPAID_GRUMBLE && !S.grumbled) {
      S.grumbled = true;
      w.log('Your knights and men-at-arms want their pay. Unpaid much longer, they will stand down.', 1);
    }
    if (S.unpaid < UNPAID_STAND_DOWN || w.time < S.next) continue;
    S.next = w.time + STAND_DOWN_EVERY;
    // The smallest company goes first.
    const e = list.sort((a, b) => a.n - b.n)[0];
    e.off();
    if (H.index === 0) w.log(`Unpaid, ${e.n} of your elite men at ${e.where} have stood down and gone home.`, 1);
  }
}

// ---- the markets ----

export const WARES = {
  iron: { lot: 10, price: 80, name: 'iron' },
  horses: { lot: 5, price: 150, name: 'horses' },
  food: { lot: 40, price: 60, name: 'grain' },
  mail: { lot: 5, price: 160, name: 'mail' },
  swords: { lot: 5, price: 70, name: 'swords' },
};
const RISE = 0.15;                         // the price goes up this share for each lot you buy
const SETTLE = 0.0015;                     // and settles back this share of its base a second

export const isMarket = p => p.kind === 'market' || p.kind === 'crown';
const dear = p => (p.dear ??= {});
export const priceAt = (p, g) => Math.round(WARES[g].price * (dear(p)[g] ?? 1));

// Where goods bought at market p go: your nearest village that is not being fought over.
export function marketHome(w, p) {
  return w.pois.filter(q => q.owner === 0 && q.town && !q.town.hostile && !q.town.underAttack)
    .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0] || null;
}

export function buyCheck(w, p, g) {
  if (!isMarket(p)) return { ok: false, why: 'Not a market town' };
  if (p.owner === w.bandits || (w.invader !== null && p.owner === w.invader) || (p.owner !== 0 && p.owner !== null && w.atWar(0, p.owner))) return { ok: false, why: 'Its lord will not trade with you' };
  if (p.town?.underAttack || p.town?.hostile) return { ok: false, why: `${p.name} is being fought over` };
  const to = marketHome(w, p);
  if (!to) return { ok: false, why: 'You have no village to send the goods to' };
  const price = priceAt(p, g);
  if (FACTIONS[0].gold < price) return { ok: false, why: `Needs ${price} gold`, price, to };
  return { ok: true, price, to };
}

export function buy(w, p, g) {
  const c = buyCheck(w, p, g);
  if (!c.ok) return c;
  const W = WARES[g];
  FACTIONS[0].gold -= c.price;
  if (p.owner !== null && p.owner !== 0) FACTIONS[p.owner].gold += Math.round(c.price / 2);
  dear(p)[g] = (dear(p)[g] ?? 1) + RISE;
  // Bought where you live: no cart, the goods go straight into the stores.
  if (p === c.to) {
    p.town.put(p.town.keep, g, W.lot);
    w.log(`You bought ${W.lot} ${W.name} at ${p.name} for ${c.price} gold.`);
    w.hooks.sound?.('coins'); // audio
    return { ok: true, text: `${W.lot} ${W.name} are in the stores.` };
  }
  const cart = w.spawnArmy(0, [], p, `Goods from ${p.name}`, 'wagon');
  cart.wagon = { run: true, bought: true, goods: { [g]: W.lot }, people: 0, to: c.to, from: p };
  cart.at = null;
  w.hooks.sound?.('coins'); // audio
  w.log(`You bought ${W.lot} ${W.name} at ${p.name} for ${c.price} gold. A cart takes them to ${c.to.name}.`);
  return { ok: true, text: `A cart sets out for ${c.to.name} with ${W.lot} ${W.name}.` };
}

// Every few seconds: prices settle back, and rich rival houses buy for their stores.
export function tickMarkets(w, dt) {
  for (const p of w.pois) {
    if (!p.dear) continue;
    for (const g of Object.keys(p.dear)) p.dear[g] = Math.max(1, p.dear[g] - SETTLE * dt);
  }
  for (const H of FACTIONS) {
    if (!H.alive || H.bandit || H.invader || H.index === 0) continue;
    H.shopAt = (H.shopAt ?? 120 + w.rand() * 120) - dt;
    if (H.shopAt > 0) continue;
    H.shopAt = 60 + w.rand() * 30;
    // The richer the house, the more it buys at once.
    for (let i = Math.min(8, Math.max(1, Math.floor(H.gold / 1000))); i > 0; i--) rivalShop(w, H);
  }
}

// A house with gold to spare buys a lot of what its richest place lacks at the nearest
// market it may trade at; the goods go into that place's stores (its hall first).
function rivalShop(w, H) {
  if (H.gold < 500) return;
  const home = w.pois.filter(p => p.owner === H.index && p.eco?.stock).sort((a, b) => !!b.eco.buildings?.hall - !!a.eco.buildings?.hall || b.eco.pop - a.eco.pop)[0];
  if (!home) return;
  const mart = w.pois.filter(p => isMarket(p) && p.owner !== w.bandits && (w.invader === null || p.owner !== w.invader) && (p.owner === null || p.owner === H.index || !w.atWar(H.index, p.owner)))
    .sort((a, b) => Math.hypot(a.x - home.x, a.z - home.z) - Math.hypot(b.x - home.x, b.z - home.z))[0];
  if (!mart) return;
  const g = ['mail', 'swords', 'iron', 'horses', 'food'].sort((a, b) => (home.eco.stock[a] || 0) / WARES[a].lot - (home.eco.stock[b] || 0) / WARES[b].lot)[0];
  const price = priceAt(mart, g);
  if (H.gold < price + 300) return;
  H.gold -= price;
  if (mart.owner !== null && mart.owner !== H.index && FACTIONS[mart.owner]) FACTIONS[mart.owner].gold += Math.round(price / 2);
  home.eco.stock[g] = (home.eco.stock[g] || 0) + WARES[g].lot;
}
