// The arrière-ban (ruling, 2026-11-21): from the rank of Lord, every place you hold calls up
// men from its countryside, beyond its village people, so no villager is taken. Gold to call
// them, food to keep them (they eat like any army, supply.js EAT, and are fed in your own
// lands), and home they go after ten minutes. Mass, not quality: spears, no armour, quick
// to break. Each unit carries the time it goes home (u.until, r.until in a village), through
// joins, garrisons, fights and saves. The league raises them too (diplomacy.js raiseHost).
// State: w.arriere = { until, rest } while it serves and rests.
import { FACTIONS, headcount, unit } from './world.js';
import { EAT, capacity, takeFood } from './supply.js';

export const ARRIERE = { per: { Lord: 30, Count: 45, Duke: 60, King: 60 }, gold: 3, serve: 600, rest: 300, key: 'militia' };
export const isLevy = u => !!u.until;
const due = w => u => u.until && u.until <= w.time;
const mins = s => Math.max(1, Math.ceil(s / 60));

// The places that answer: every place you hold, a vassal's too, that is not fighting.
const answering = w => w.pois.filter(p => p.owner === 0 && p.kind !== 'camp' && !p.town?.hostile && !p.town?.underAttack && !p.town?.revolt);

// Who would come and what it costs, without moving anyone.
export function arrierePlan(w, dest) {
  const per = ARRIERE.per[w.rank] || 0, places = answering(w);
  const men = per * places.length, S = w.arriere || {};
  const plan = { dest, per, places, men, gold: men * ARRIERE.gold, food: Math.round(men * EAT * 60), mins: ARRIERE.serve / 60, ok: true, why: '' };
  if (!per) Object.assign(plan, { ok: false, why: 'From the rank of Lord' });
  else if (S.until > w.time) Object.assign(plan, { ok: false, why: `The arrière-ban is out: home in ${mins(S.until - w.time)} min` });
  else if (S.rest > w.time) Object.assign(plan, { ok: false, why: `The countryside is back at its fields: again in ${mins(S.rest - w.time)} min` });
  else if (!dest || dest.owner !== 0) Object.assign(plan, { ok: false, why: 'Call them to a place of yours' });
  else if (!men) Object.assign(plan, { ok: false, why: 'No place of yours can answer' });
  else if (FACTIONS[0].gold < plan.gold) Object.assign(plan, { ok: false, why: `Needs ${plan.gold} gold` });
  return plan;
}

// Each place's men march for dest by friendly roads; columns with no such road gather where
// the banners would (World.stageColumns). Those called to dest itself go straight in.
export function callArriere(w, dest) {
  const plan = arrierePlan(w, dest);
  if (!plan.ok) return { ok: false, why: plan.why };
  FACTIONS[0].gold -= plan.gold;
  const until = w.time + ARRIERE.serve, safe = w.friendlyRoad(), staged = [];
  w.arriere = { until, rest: until + ARRIERE.rest };
  let men = 0, from = 0;
  for (const p of plan.places) {
    const units = [{ ...unit(ARRIERE.key, plan.per, `Arrière-ban of ${p.name}`), until }];
    if (p === dest) { home(w, p, units); men += plan.per; continue; }
    const a = w.spawnArmy(0, units, p, `Arrière-ban of ${p.name}`);
    // Their carts are loaded from the place's stores, as far as they go; a vassal's feeds its own.
    if (p.town) a.food = takeFood(p.town, capacity(a));
    if (!w.order(a, dest, safe)) { staged.push([a, p]); continue; }
    men += plan.per; from++;
  }
  const { stage, there, cut } = w.stageColumns(staged, dest);
  w.log(`The arrière-ban is called for ${plan.gold} gold: ${men} men of the countryside make for ${dest.name}${from ? ` from ${from} place${from > 1 ? 's' : ''}` : ''}. They serve ${plan.mins} minutes, then go home.`);
  if (there) w.log(`No road through friendly land reaches ${dest.name} from every place: ${there} of the arrière-ban gather at ${stage.name} instead.`, 1);
  if (cut.length) w.log(`No road through friendly land joins ${cut.join(', ')} to ${stage ? stage.name : dest.name}: ${cut.length > 1 ? 'their levies wait' : 'its levies wait'} at home.`, 1);
  w.chron(`You called the arrière-ban: ${plan.men} men of the countryside.`);
  return { ok: true, men, there, stage };
}

// Levies into a place: into its village, or its garrison if nobody of yours runs it.
function home(w, p, units) {
  if (p.town) p.town.addTroops(units, 0);
  else for (const u of units) p.garrison.push(u);
}

// A rank by places held, the same for you (World.rank) and for a house.
export const rankOf = n => (n >= 11 ? 'Duke' : n >= 5 ? 'Count' : n >= 2 ? 'Lord' : 'Reeve');

// A great house's own arrière-ban, for the league's host (diplomacy.js raiseHost), on your
// rules: its rank's men from each of its places, as many as its purse pays for at 3 gold a
// man and the host has room for; their carts loaded from its stores as far as they go; they
// serve from `from`, then the countryside rests. Takes the gold and food; returns the men.
export const banCost = (w, h) => {
  const n = w.pois.filter(p => p.owner === h.index && p.kind !== 'camp' && !p.falling).length;
  return (ARRIERE.per[rankOf(n)] || 0) * n * ARRIERE.gold;
};
export function houseBan(w, h, room, from = w.time) {
  const S = h.arriere || {};
  if (S.until > w.time || S.rest > w.time) return 0;
  const places = w.pois.filter(p => p.owner === h.index && p.kind !== 'camp' && !p.falling);
  const per = ARRIERE.per[rankOf(places.length)] || 0;
  const men = Math.max(0, Math.min(per * places.length, Math.floor(room), Math.floor(h.gold / ARRIERE.gold)));
  if (!men) return 0;
  h.gold -= men * ARRIERE.gold;
  const until = from + ARRIERE.serve;
  h.arriere = { until, rest: until + ARRIERE.rest };
  let food = men * EAT * ARRIERE.serve;
  for (const p of places) for (const g of ['bread', 'food']) {
    const st = p.eco?.stock, k = st ? Math.min(food, st[g] || 0) : 0;
    if (k) { st[g] -= k; food -= k; }
  }
  return men;
}

// Every five seconds: levies whose time is up go home, from armies, garrisons and villages.
// A village under attack keeps its levies until the fight is over.
export function tickArriere(w) {
  const gone = due(w);
  let n = 0;
  for (const a of [...w.armies]) {
    if (a.gone || a.wagon || !a.units.some(gone)) continue;
    const left = headcount(a.units.filter(gone));
    a.units = a.units.filter(u => !gone(u));
    a.wounded = (a.wounded || []).filter(u => !gone(u));
    if (a.side === 0) n += left;
    if (!a.units.length) w.removeArmy(a);
  }
  for (const p of w.pois) {
    if (p.garrison?.some(gone)) { if (p.owner === 0) n += headcount(p.garrison.filter(gone)); p.garrison = p.garrison.filter(u => !gone(u)); }
    const t = p.town;
    if (!t || t.underAttack || t.hostile) continue;
    for (const r of t.garrison()) if (gone(r)) { n += r.alive ?? 0; if (!t.disband(r, true)) t.battle.disband(r); }   // (kit back to the racks)
    // Levies in a village eat from its stores, as they would from their carts (a village feeds
    // only its own people). With nothing to spare, a regiment of them goes home hungry.
    const ls = t.garrison().filter(r => r.until);
    if (!ls.length) { t.levyMeal = 0; continue; }
    t.levyMeal = (t.levyMeal || 0) + ls.reduce((k, r) => k + r.alive, 0) * EAT * 5;
    t.levyMeal -= takeFood(t, Math.floor(t.levyMeal));
    if (t.levyMeal > 10) {
      const r = ls.sort((a, b) => a.alive - b.alive)[0];
      w.log(`${p.name} has no food to spare for the arrière-ban: ${r.alive} men go home hungry.`, 1);
      if (!t.disband(r, true)) t.battle.disband(r);
      t.levyMeal = 0;
    }
  }
  if (n) w.log(`The arrière-ban has served its time: ${n} men go home to their fields.`, 1);
}
