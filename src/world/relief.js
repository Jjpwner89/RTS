// Raiders weigh the danger (creator, 2026-11-22: "oh shit, there's 200 troops... we got to get out of there").
// A raid band that sees a relief force coming, clearly stronger than itself (the power sum auto-resolve uses),
// breaks off and makes for home with what it has taken, a load it carries (a.loot) that whoever catches it
// gets back. One rule for every band: a house's or outlaws' in your village (economy.js checkRelief), and
// your own party in a place you storm, which is warned, not commanded (warnRelief). Whoever sends the relief:
// it is any army friendly to the place that is marching on it (hostsFor).
import { headcount, FACTIONS } from './world.js';
import { armyStep } from './march.js';
import { power, RELIEF } from '../economy.js';
export { RELIEF };

// Armies friendly to `owner`'s place `p` that are marching on it, and near enough to matter.
export function hostsFor(w, p, owner = p.owner) {
  // (and a partner's: its league or the coalition against you, your sworn houses' and allies' for you and them: Battles, 2026-11-23)
  const yours = i => !!(w.dip?.[i]?.vassal || w.dip?.[i]?.allied);
  const pair = (i, j) => (w.leagues || []).some(L => L.members.includes(i) && L.members.includes(j)) || !!(w.coalition?.members?.includes(i) && w.coalition.members.includes(j));
  const friend = a => a.side === owner || (owner === 0 ? yours(a.side) : pair(owner, a.side) || (yours(owner) && (a.side === 0 || yours(a.side))));
  const out = [];
  for (const a of w.armies) {
    if (a.gone || a.wagon || a.retreating || a.halted || !friend(a)) continue;
    const end = a.path.at(-1);
    if (a.target !== p && end !== p) continue;
    let len = 0, at = a;
    for (const q of a.path) { len += Math.hypot(q.x - at.x, q.z - at.z); at = q; }
    const eta = len / armyStep(w, a);   // by what the host is made of (march.js): horse is there sooner
    if (eta <= RELIEF.eta) out.push({ a, eta, men: headcount(a.units), power: power(a.units) });
  }
  return out;
}

export function summary(hosts) {
  const places = [...new Set(hosts.map(h => h.a.last?.name).filter(Boolean))];
  return { hosts, men: hosts.reduce((n, h) => n + h.men, 0), power: hosts.reduce((n, h) => n + h.power, 0), eta: Math.min(...hosts.map(h => h.eta)), places };
}
// A band reaching a place that is not fought in (World.autoRaid, decided at once): does it see a host of the place's
// friends marching on it, within RELIEF.eta, RELIEF.ratio times its own strength? The summary of that host, or null.
export function breaksOff(w, band, p) {
  const hosts = hostsFor(w, p);
  if (!hosts.length) return null;
  const S = summary(hosts);
  return S.power >= power(band.units) * RELIEF.ratio ? S : null;
}
const and = xs => xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0] || 'near by';

// ---- the load a band carries ----
export const emptyLoot = () => ({ goods: {}, gold: 0 });
export function addLoot(L, goods = {}, gold = 0) {
  L ||= emptyLoot();
  for (const [g, n] of Object.entries(goods)) if (n > 0) L.goods[g] = (L.goods[g] || 0) + n;
  L.gold += gold;
  return L;
}
export const lootSize = L => (L ? Object.values(L.goods).reduce((n, k) => n + k, 0) + L.gold : 0);
export const lootWords = L => and([...Object.entries(L?.goods || {}).filter(([, n]) => n >= 1).map(([g, n]) => `${Math.floor(n)} ${g}`), L?.gold >= 1 ? `${Math.floor(L.gold)} gold` : null].filter(Boolean));

// Where a load goes: to `side`'s nearest place to `at`, its stores (a village's keep), and its purse.
export function deliver(w, side, L, at) {
  if (!lootSize(L)) return null;
  const near = w.pois.filter(q => q.owner === side && (side === 0 ? q.town : q.eco?.stock)).sort((p, q) => Math.hypot(p.x - at.x, p.z - at.z) - Math.hypot(q.x - at.x, q.z - at.z))[0];
  for (const [g, n] of Object.entries(L.goods)) {
    if (!near || n < 1) continue;
    if (side === 0) near.town.put(near.town.keep, g, Math.floor(n));
    else near.eco.stock[g] = (near.eco.stock[g] || 0) + n;
  }
  if (L.gold) { if (FACTIONS[side]) FACTIONS[side].gold += L.gold; }
  return near;
}

// A band home with its load: the house or outlaws keep it; your own party carries it to your stores.
export function arriveHome(w, a, p) {
  if (!lootSize(a.loot)) { a.loot = null; return; }
  const L = a.loot;
  a.loot = null;
  deliver(w, a.side, L, p);
  if (a.side === 0) w.log(`${a.name} bring home the plunder: ${lootWords(L)}.`);
}

// Your army beat a band that was carrying a load: it is yours.
export function takeBack(w, band, at) {
  const L = band.loot;
  if (!lootSize(L)) return;
  band.loot = null;
  const near = deliver(w, 0, L, at);
  w.log(`You take back the plunder: ${lootWords(L)}${near ? `, carried to ${near.name}` : ''}.`);
}

// ---- your own party, in a place you storm ----
// A host of its owner's coming to relieve it, clearly stronger than what you have there: you are told,
// once for each, with the choice to stay or pull back. Run every few seconds (World.update).
export function warnRelief(w) {
  if (!w.hooks.choice) return;
  for (const p of w.pois) {
    const t = p.town;
    if (!t?.hostile || p.owner === 0) continue;
    const hosts = hostsFor(w, p).filter(h => !(t.reliefWarned ||= new Set()).has(h.a.id));
    if (!hosts.length) continue;
    const ours = t.strength(t.battle.regs.filter(r => r.side === 0 && !r.gone && !r.routing && r.alive > 0));
    const all = summary(hostsFor(w, p));
    if (all.power < ours * RELIEF.ratio) continue;
    for (const h of hosts) t.reliefWarned.add(h.a.id);
    const when = all.eta < 15 ? 'almost here' : all.eta < 60 ? `about ${Math.round(all.eta / 10) * 10} seconds away` : `about ${Math.round(all.eta / 60)} min away`;
    const text = `A large force is coming: about ${Math.round(all.men / 10) * 10} men from ${and(all.places)}, ${when}. They are stronger than your men at ${p.name}. Stay and fight, or pull back?`;
    w.log(`${p.name}: ${text}`, 1);
    w.hooks.choice({ id: `relief-${p.id}-${Math.round(w.time)}`, image: null, at: p, title: `A large force is coming to ${p.name}`, text,
      choices: [
        { label: 'Stay and fight', run: () => 'You hold your ground.' },
        { label: 'Pull back', ok: () => !!p.town?.hostile, why: () => 'The fight is over', run: () => { if (p.town?.hostile) w.endStorm(p, true); return 'You pull back.'; } },
      ] });
  }
}

// ---- the chase ----
// Relieving hosts follow a beaten band home along the roads, if they are the stronger and its home is no
// further than RELIEF.chase: they may meet it in the open, or at its own gate (the creator's loop).
export function chase(w, hunters, prey) {
  const home = prey.target;
  if (!home || !prey.path.length) return 0;
  let n = 0;
  for (const h of hunters) {
    if (h.gone || h.halted || h.retreating || h.wagon || h === prey || h.chasing === prey.id) continue;
    if (power(h.units) < power(prey.units) * 1.2) continue;
    const r = w.route(h.at || h.last, home);
    if (!Number.isFinite(r.length) || r.length > RELIEF.chase) continue;
    if (w.order(h, home)) { h.chasing = prey.id; n++; }
  }
  return n;
}
