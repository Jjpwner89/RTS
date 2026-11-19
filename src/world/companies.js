// Mercenary companies: named bands with a captain and a set size, waiting for work at the
// market towns. Hiring one costs a price up front and wages every minute from the
// treasury; unpaid, they grumble, then desert, and deserters may take to the roads as
// bandits. They are not villagers and never work. Each company stationed in a village
// takes a little off its mood. Rival houses hire them on the same terms (the merchant
// house most readily), which gives their gold a use, and you can outbid a rival for one.
//
// A company's men are found by its name: regiments in your villages, units in garrisons
// and armies on the map.
import { FACTIONS, headcount, unit } from './world.js';
import { TYPES } from '../battle.js';

const NAMES = ['the Grey Company', 'the Black Lanterns', 'the Red Hounds', 'the Salt Brothers', 'the White Ash Company', 'the Ninefold',
  'the Hollow Crowns', 'the Iron Wake'];
const CAPTAINS = ['Bors Hale', 'Ysolt of the Marches', 'Cade Ferro', 'Old Garm', 'Wenna Holt', 'Tybalt Crane', 'Ansel Duro', 'Maud Ironside'];
// A company's name at the start of a sentence.
const Name = c => c.name[0].toUpperCase() + c.name.slice(1);
const WAGE = { sellsword: 0.5, hiredxbow: 0.6 };   // gold per man per minute
const UNPAID_GRUMBLE = 45, UNPAID_DESERT = 150;     // seconds behind with their pay
const REFORM = 600;                                  // seconds before a broken company is hiring again
export const MOOD = -4;                              // a village's mood, per company in it

export function makeCompanies(w) {
  const markets = w.pois.filter(p => p.kind === 'market' || p.kind === 'ford' || p.kind === 'crown');
  return NAMES.slice(0, 6).map((name, i) => {
    const key = i % 3 === 2 ? 'hiredxbow' : 'sellsword';
    const size = Math.round((key === 'hiredxbow' ? 36 : 44) + w.rand() * 16);
    return { id: i + 1, name, captain: CAPTAINS[i], key, size, men: size, home: markets[i % Math.max(1, markets.length)]?.id ?? null,
      employer: null, unpaid: 0, grumbled: false, back: 0 };
  });
}

export const hirePrice = c => Math.round(c.size * TYPES[c.key].gold * 0.6);
export const wage = c => Math.round(Math.max(c.men, 1) * WAGE[c.key] * 10) / 10;
// What a company asks to be paid once hired: it joins at full strength (hire, below).
export const fullWage = c => Math.round(c.size * WAGE[c.key] * 10) / 10;
const homeOf = (w, c) => w.byId[c.home] || null;

// Can `side` hire company c now, and for how much?
export function offer(w, c, side) {
  const home = homeOf(w, c);
  if (c.employer === side) return { ok: false, why: 'Already yours' };
  if (w.time < c.back) return { ok: false, why: `Regrouping for ${Math.ceil((c.back - w.time) / 60)} min` };
  if (home && home.owner !== null && home.owner !== side && w.atWar(side, home.owner)) return { ok: false, why: `${home.name} is held by your enemy` };
  const outbid = c.employer !== null && c.employer !== undefined;
  const price = hirePrice(c) * (outbid ? 2 : 1);
  if (FACTIONS[side].gold < price) return { ok: false, why: `Needs ${price} gold`, price, outbid };
  return { ok: true, price, outbid };
}

// Where the company's men are now: [{ at, units?, regs? }].
function find(w, c) {
  const out = [];
  for (const p of w.pois) {
    if (p.town) {
      const regs = p.town.battle.regs.filter(r => !r.gone && r.name === c.name && TYPES[r.T.key]?.merc);
      if (regs.length) out.push({ at: p, regs });
    }
    const units = (p.garrison || []).filter(u => u.name === c.name);
    if (units.length) out.push({ at: p, units, list: p.garrison });
  }
  for (const a of w.armies) {
    const units = a.units.filter(u => u.name === c.name);
    if (units.length) out.push({ at: a, units, list: a.units });
  }
  return out;
}
export function menOf(w, c) {
  return find(w, c).reduce((n, f) => n + (f.regs ? f.regs.reduce((k, r) => k + r.alive, 0) : headcount(f.units)), 0);
}

// Takes all of a company's men off the map; returns where most of them were.
function pull(w, c) {
  let where = null, most = 0;
  for (const f of find(w, c)) {
    const n = f.regs ? f.regs.reduce((k, r) => k + r.alive, 0) : headcount(f.units);
    if (n > most) { most = n; where = f.at; }
    if (f.regs) for (const r of f.regs) f.at.town.battle.disband(r);
    else for (const u of f.units) f.list.splice(f.list.indexOf(u), 1);
    // an army with nobody left in it is gone
    if (f.list && f.at.units === f.list && !f.list.length) w.removeArmy(f.at);
  }
  return { where, men: most };
}

// Company c goes to `side`, at place p (a village of yours, or a rival's muster place).
export function hire(w, c, side, p) {
  const o = offer(w, c, side);
  if (!o.ok) return o;
  FACTIONS[side].gold -= o.price;
  if (o.outbid) {
    const was = c.employer;
    pull(w, c);
    w.log(`${Name(c)} have left ${FACTIONS[was].name} for ${side === 0 ? 'you' : FACTIONS[side].name}: outbid.`, side === 0 || was === 0 ? 1 : 2);
  }
  c.employer = side;
  c.unpaid = 0;
  c.grumbled = false;
  c.men = c.size;
  if (p.town) {
    const a = w.rand() * Math.PI * 2;
    p.town.battle.addRegiment(0, c.key, Math.sin(a) * 30, Math.cos(a) * 30, a + Math.PI, { count: c.size, name: c.name });
    p.town.event?.(`${Name(c)}, ${c.size} ${TYPES[c.key].name.toLowerCase()} under ${c.captain}, have taken your gold.`);
  } else p.garrison.push(unit(c.key, c.size, c.name));
  return { ok: true, price: o.price };
}

// They leave service: dismissed, unpaid or their employer broken. Some take to the roads.
export function release(w, c, why) {
  const { where, men } = pull(w, c);
  const was = c.employer;
  c.employer = null;
  c.back = w.time + REFORM;
  c.men = c.size;
  if ((why === 'unpaid' || why === 'dismissed') && men >= 10 && where && w.rand() < (why === 'unpaid' ? 0.6 : 0.3)) {
    const p = where.links ? where : where.at || where.last;   // a place, or where an army stood
    if (p) {
      const a = w.spawnArmy(w.bandits, [unit('bandit', men, `${Name(c)} deserters`)], p, `${Name(c)} deserters`, 'raid');
      const target = w.pois.filter(q => q.owner === was && q !== p).sort((q, r) => Math.hypot(q.x - p.x, q.z - p.z) - Math.hypot(r.x - p.x, r.z - p.z))[0];
      if (target) w.order(a, target);
      w.log(why === 'unpaid' ? `${Name(c)} have deserted unpaid, and taken to the roads as bandits!` : `${Name(c)} have left your service, and taken to the roads as bandits!`, was === 0 ? 1 : 2);
      return;
    }
  }
  if (was === 0) w.log(why === 'unpaid' ? `${Name(c)} have deserted: you could not pay them.` : `${Name(c)} have left your service.`, why === 'unpaid' ? 1 : 0);
}

// Every few seconds: wages, grumbling, desertion, and companies cut to nothing.
export function tickCompanies(w, dt) {
  w.companies ??= makeCompanies(w);
  for (const c of w.companies) {
    if (c.employer === null || c.employer === undefined) continue;
    const H = FACTIONS[c.employer];
    c.men = menOf(w, c);
    if (!H?.alive || c.men < 3) {
      if (c.employer === 0 && c.men < 3) w.log(`${Name(c)} are no more: too few left to call a company.`, 1);
      c.employer = null; c.back = w.time + REFORM * 2; c.men = c.size;
      continue;
    }
    const due = wage(c) * dt / 60;
    if (H.gold >= due) { H.gold -= due; c.unpaid = Math.max(0, c.unpaid - dt); if (!c.unpaid) c.grumbled = false; }
    else {
      H.gold = 0;
      c.unpaid += dt;
      if (c.unpaid >= UNPAID_GRUMBLE && !c.grumbled && c.employer === 0) { c.grumbled = true; w.log(`${c.captain} of ${c.name} wants paying, or they walk.`, 1); }
      if (c.unpaid >= UNPAID_DESERT) release(w, c, 'unpaid');
    }
  }
}

// A rival with gold to spare, at war, hires a free company (the merchant house even at
// peace, and up to two at once).
export function rivalHire(w, h, muster) {
  w.companies ??= makeCompanies(w);
  const merchant = h.trait === 'merchant', have = w.companies.filter(c => c.employer === h.index).length;
  if (have >= (merchant ? 2 : 1)) return false;
  const atWar = FACTIONS.some(o => o.alive && !o.bandit && o !== h && w.atWar(h.index, o.index));
  if (!atWar && !merchant) return false;
  const free = w.companies.filter(c => c.employer === null && offer(w, c, h.index).ok);
  const c = free.find(c => h.gold > hirePrice(c) + wage(c) * (merchant ? 4 : 8));
  if (!c) return false;
  hire(w, c, h.index, muster);
  if (muster.visible || w.knows(h.index)) w.log(`${h.name} has hired ${c.name} at ${muster.name}.`, 2);
  return true;
}

// Companies stationed in a village, for its mood.
export const companiesIn = (w, t) => (w.companies || []).filter(c => c.employer === 0
  && t.battle.regs.some(r => !r.gone && r.name === c.name && r.side === 0)).length;
