// What gold buys besides men: soldiers' wages, and goods at the market towns.
//
// Wages (Orchestrator, 2026-11-21, after M&B: every man under arms is paid; the round 4
// player sat on 6,000 to 14,000 idle gold). Every soldier beyond his place's home guard
// draws a wage every minute, wherever he stands: in a village, a garrison or an army in the
// field. Levies cost least, trained foot more, mail and horse more, and the household,
// sellswords and the elite most. It is the realm's great drain on gold and grows with the
// army, for the rivals as for you, so gold, not people, sets how big an army can be.
// Unpaid, they grumble, and then stand down a company at a time.
//
// A market town you hold, or whose lord is at peace with you, sells iron, horses, grain,
// mail and swords. Every lot bought there raises its price, which settles back slowly; a cart
// hauls the goods to your nearest village and can be robbed on the way. Rival houses buy
// there too for their own stores, at the going price.
import { FACTIONS } from './world.js';
import { ELITE, HOUSEHOLD_PAY } from '../economy.js';
import { TYPES } from '../battle.js';
import { WAGE as HIRED } from './companies.js';

// Gold per man per minute. A sellsword company's wage is its own (companies.js); men hired at
// the keep pay the same rate. The arrière-ban is paid up front when called (arriere.js) and
// the village militia called out to fight is not soldiers at all, so neither draws a wage.
export const WAGES = { levy: 0.2, foot: 0.3, heavy: 0.35 };
// Men in each place, the cheapest first, who are its home guard and draw nothing. The
// household, hired men and the elite always draw pay.
export const HOME_GUARD = 12;
const UNPAID_GRUMBLE = 45, UNPAID_STAND_DOWN = 150, STAND_DOWN_EVERY = 30;

function payOf(key, gear, elite) {
  if (key === 'household') return HOUSEHOLD_PAY;
  if (elite || ELITE[key]) return (ELITE[key] ?? ELITE.maa).pay;
  if (HIRED[key]) return HIRED[key];
  const T = TYPES[key];
  if (!T || T.engine || key === 'folk') return 0;
  if (T.militia) return WAGES.levy;
  const armour = gear ?? T.armour;
  return T.mounted || /cav/.test(key) || armour === 'mail' || armour === 'plate' ? WAGES.heavy : WAGES.foot;
}
const always = (key, elite) => key === 'household' || elite || !!ELITE[key] || !!HIRED[key];

// Every paid soldier of `side`, as { n, key, pay, off(), where } rows: n men beyond the home
// guard at pay a man. Men of a hired company are paid by the company (companies.js).
function paidOf(w, side) {
  const out = [], hired = new Set((w.companies || []).filter(c => c.employer === side && !c.gone).map(c => c.name));
  const add = (list, where, guard) => {
    const rows = list.filter(x => x.n > 0 && x.pay > 0 && !hired.has(x.name)).sort((a, b) => a.pay - b.pay);
    let free = guard;
    for (const x of rows) {
      const k = always(x.key, x.elite) ? 0 : Math.min(free, x.n);
      free -= k;
      if (x.n - k > 0) out.push({ ...x, n: x.n - k, where });
    }
  };
  for (const p of w.pois) {
    if (p.owner !== side || p.vassal) continue;
    if (p.town && !p.town.hostile) {
      add(p.town.battle.regs.filter(r => r.side === 0 && !r.gone && r.alive > 0 && !r.until)
        .map(r => ({ n: r.alive, key: r.T.key, name: r.name, elite: !!r.elite, pay: payOf(r.T.key, r.armour, r.elite), off: () => p.town.disband(r) })), p.name, HOME_GUARD);
    } else {
      add(p.garrison.filter(u => !u.until).map(u => ({ n: u.count, key: u.key, name: u.name, elite: !!u.elite, pay: payOf(u.key, u.armour, u.elite), off: () => { p.garrison = p.garrison.filter(o => o !== u); } })), p.name, HOME_GUARD);
    }
  }
  for (const a of w.armies) {
    if (a.side !== side || a.gone || a.wagon) continue;
    add(a.units.filter(u => !u.until).map(u => ({ n: u.count, key: u.key, name: u.name, elite: !!u.elite, pay: payOf(u.key, u.armour, u.elite), off: () => { a.units = a.units.filter(o => o !== u); } })), a.name, 0);
  }
  return out;
}

// What `side`'s soldiers draw: gold a minute, and the men paid.
export function wagesOf(w, side) {
  const rows = paidOf(w, side);
  return { gold: rows.reduce((n, e) => n + e.n * e.pay, 0), men: rows.reduce((n, e) => n + e.n, 0),
    elite: rows.filter(e => always(e.key, e.elite)).reduce((n, e) => n + e.n * e.pay, 0) };
}
// Gold a minute of wages (it was the elite's pay alone before every soldier was paid).
export const elitePay = (w, side) => wagesOf(w, side).gold;

export function payElites(w, dt) {
  w.elitePay ??= {};
  for (const H of FACTIONS) {
    if (!H.alive || H.bandit || H.invader) continue;
    const list = paidOf(w, H.index);
    if (!list.length) { delete w.elitePay[H.index]; continue; }
    const due = list.reduce((n, e) => n + e.n * e.pay, 0) * dt / 60;
    const S = w.elitePay[H.index] ??= { unpaid: 0, grumbled: false, next: 0 };
    if (H.gold >= due) { H.gold -= due; S.unpaid = 0; S.grumbled = false; continue; }
    H.gold = 0;
    S.unpaid += dt;
    if (H.index === 0 && S.unpaid >= UNPAID_GRUMBLE && !S.grumbled) {
      S.grumbled = true;
      w.log('Your soldiers want their pay. Unpaid much longer, they will stand down a company at a time.', 1);
    }
    if (S.unpaid < UNPAID_STAND_DOWN || w.time < S.next) continue;
    S.next = w.time + STAND_DOWN_EVERY;
    // The smallest company goes first.
    const e = list.sort((a, b) => a.n - b.n)[0];
    e.off();
    if (H.index === 0) w.log(`Unpaid, ${e.n} of your men at ${e.where} have stood down and gone home.`, 1);
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
