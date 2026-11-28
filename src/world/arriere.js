// The arrière-ban (ruling, 2026-11-21): from the rank of Lord, every place you hold calls up
// men from its countryside, beyond its village people, so no villager is taken. Gold to call
// them, food to keep them (they eat like any army, supply.js EAT, and are fed in your own
// lands), and home they go after ten minutes. Mass, not quality: spears, no armour, quick
// to break. Each unit carries the time it goes home (u.until, r.until in a village) and the
// place whose countryside it is (src), through joins, garrisons, fights and saves. The houses
// raise them on the same rules (houseBan, houseCall, and the league's levy, diplomacy.js).
// Each place keeps its own ban (specs/MUSTER.md): p.banState = { until, rest }. A call leaves
// the places it does not call ready. A place's levies serve `serve` seconds from the moment
// their column reaches the muster (or its stage), or from `late` seconds after the call,
// whichever comes first (banArrived); then the place rests `rest` seconds.
import { FACTIONS, headcount, unit, mergeInto, roughly, ARMY_CAP } from './world.js';
import { EAT, capacity, takeFood } from './supply.js';
import { takeRoster, returnToRoster, fromReg, armedIn } from './ban.js';
import { callHeard } from './threat.js';
import { stewardSpare } from './holdings.js';

export const ARRIERE = { per: { Lord: 30, Count: 45, Duke: 60, King: 60 }, gold: 3, serve: 800, rest: 300, late: 300, key: 'militia' };
export const isLevy = u => !!u.until;
const due = w => u => u.until && u.until <= w.time;
const mins = s => Math.max(1, Math.ceil(s / 60));

// The places that answer: every place you hold, a vassal's too, that is not fighting.
const answering = w => w.pois.filter(p => p.owner === 0 && p.kind !== 'camp' && !p.town?.hostile && !p.town?.underAttack && !p.town?.revolt);

// A place's ban: 'out' (its men serve: secs until they go home), 'resting' (secs until it
// answers again) or 'ready'.
export function banState(w, p) {
  const S = p.banState;
  if (S?.until > w.time) return { is: 'out', secs: S.until - w.time };
  if (S?.rest > w.time) return { is: 'resting', secs: S.rest - w.time };
  return { is: 'ready', secs: 0 };
}
const setOut = (p, until) => { p.banState = { until, rest: until + ARRIERE.rest }; };

// Levies reaching the muster or its stage: their time starts now, unless it already has.
export function banArrived(w, units) {
  for (const u of units) {
    if (!u.until || u.src === undefined) continue;
    u.until = Math.min(u.until, w.time + ARRIERE.serve);
    const p = w.byId[u.src];
    if (p?.banState && u.until < p.banState.until) setOut(p, u.until);
  }
}

// Who would come and what it costs, without moving anyone: every place that answers and is
// ready, or of those only the ones in `only` (places).
export function arrierePlan(w, dest, only = null) {
  const per = ARRIERE.per[w.rank] || 0, all = answering(w);
  const places = all.filter(p => banState(w, p).is === 'ready' && (!only || only.includes(p)));
  const men = per * places.length;
  const armed = places.reduce((n, p) => n + Math.min(per, armedIn(p)), 0);
  const plan = { dest, per, all, places, men, armed, gold: men * ARRIERE.gold, food: Math.round(men * EAT * 60), mins: ARRIERE.serve / 60, ok: true, why: '' };
  const soonest = is => Math.min(...all.map(p => banState(w, p)).filter(s => s.is === is).map(s => s.secs));
  if (!per) Object.assign(plan, { ok: false, why: 'From the rank of Lord' });
  else if (!dest || dest.owner !== 0) Object.assign(plan, { ok: false, why: 'Call them to a place of yours' });
  else if (!all.length) Object.assign(plan, { ok: false, why: 'No place of yours can answer' });
  else if (!men) {
    const out = soonest('out'), rest = soonest('resting');
    Object.assign(plan, { ok: false, why: Number.isFinite(out) ? `The arrière-ban is out: home in ${mins(out)} min`
      : Number.isFinite(rest) ? `The countryside is back at its fields: again in ${mins(rest)} min` : 'No place of yours can answer' });
  } else if (FACTIONS[0].gold < plan.gold) Object.assign(plan, { ok: false, why: `Needs ${plan.gold} gold` });
  return plan;
}

// Where the arrière-ban gathers when you don't pick a place (Orchestrator, 2026-11-21: not
// always at your seat): the place of yours nearest your biggest army in the field; with none
// out, the one nearest an enemy, place or army; at peace, your seat.
const isLevyHost = a => a.units.length > 0 && a.units.every(isLevy);   // the arrière-ban itself on its way
export function musterPlace(w) {
  const mine = w.pois.filter(p => p.owner === 0 && p.kind !== 'camp' && !p.town?.hostile && !p.town?.underAttack && !p.town?.revolt);
  if (!mine.length) return w.home;
  const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z), nearest = to => mine.reduce((b, p) => (d(p, to) < d(b, to) ? p : b));
  const army = w.armies.filter(a => a.side === 0 && !a.gone && !a.wagon && !isLevyHost(a)).sort((a, b) => headcount(b.units) - headcount(a.units))[0];
  if (army) return nearest(army);
  // Outlaws are not a front.
  const foe = s => s !== null && s !== 0 && s !== w.bandits && w.atWar(0, s);
  const foes = [...w.pois.filter(p => foe(p.owner) && p.kind !== 'camp'), ...w.armies.filter(a => !a.gone && !a.wagon && foe(a.side))];
  if (!foes.length) return w.home?.owner === 0 ? w.home : mine[0];
  let best = mine[0], bd = Infinity;
  for (const p of mine) for (const q of foes) if (d(p, q) < bd) { bd = d(p, q); best = p; }
  return best;
}

// Each place's men march for dest by friendly roads; columns with no such road gather where
// the banners would (World.stageColumns). Those called to dest itself go straight in.
export function callArriere(w, dest, only = null) {
  const plan = arrierePlan(w, dest, only);
  if (!plan.ok) return { ok: false, why: plan.why };
  FACTIONS[0].gold -= plan.gold;
  const safe = w.friendlyRoad(), staged = [];
  let men = 0, from = 0;
  for (const p of plan.places) {
    setOut(p, w.time + (p === dest ? 0 : ARRIERE.late) + ARRIERE.serve);
    const units = banUnits(p, plan.per, `Arrière-ban of ${p.name}`, p.banState.until);
    if (p === dest) { home(w, p, units); men += plan.per; continue; }
    const a = w.spawnArmy(0, units, p, `Arrière-ban of ${p.name}`);
    // Their carts are loaded from the place's stores, as far as they go; a vassal's feeds its own.
    if (p.town) a.food = takeFood(p.town, capacity(a));
    if (!w.order(a, dest, safe)) { staged.push([a, p]); continue; }
    men += plan.per; from++;
  }
  const { stage, there, cut } = w.stageColumns(staged, dest);
  w.log(`The arrière-ban is called for ${plan.gold} gold: ${men} men of the countryside make for ${dest.name}${from ? ` from ${from} place${from > 1 ? 's' : ''}` : ''}. They serve ${plan.mins} minutes from the day they arrive, then go home.`);
  if (there) w.log(`No road through friendly land reaches ${dest.name} from every place: ${there} of the arrière-ban gather at ${stage.name} instead.`, 1);
  if (cut.length) w.log(`No road through friendly land joins ${cut.join(', ')} to ${stage ? stage.name : dest.name}: ${cut.length > 1 ? 'their levies wait' : 'its levies wait'} at home.`, 1);
  w.chron(`You called the arrière-ban: ${plan.men} men of the countryside.`);
  callHeard(w, 0, dest, { kind: 'arriere' });   // the houses around you hear of it (threat.js)
  return { ok: true, men, there, stage };
}

// Send your levies of these places home now (or, `units` given, just those): they go as when
// their time is up (an armed man back into his roster), and the place's rest starts now. Men
// in a village under attack go when the fight is over.
export function sendBanHome(w, places, units = null) {
  const from = new Set(places.map(p => p.id));
  const theirs = u => u.until && from.has(u.src) && (!units || units.includes(u));
  for (const u of yourLevies(w)) if (theirs(u)) u.until = w.time;
  for (const p of places) if (!units || !yourLevies(w).some(u => u.src === p.id && u.until > w.time)) p.banState = { until: w.time, rest: w.time + ARRIERE.rest };
  tickArriere(w, true);
}
// Every unit and village regiment of yours that serves in the arrière-ban.
export function yourLevies(w) {
  const out = [];
  for (const a of w.armies) if (!a.gone && a.side === 0 && !a.wagon) out.push(...a.units.filter(isLevy), ...(a.wounded || []).filter(isLevy));
  for (const p of w.pois) {
    if (p.owner === 0) out.push(...(p.garrison || []).filter(isLevy));
    if (p.town && !p.town.hostile) out.push(...p.town.garrison().filter(isLevy));
  }
  return out;
}

// The men a place sends at a call: its armed roster first (world/ban.js), the best kit first, then plain
// militia to make up `n`. The armed ones carry their place, and go back into its roster when their time is up.
function banUnits(p, n, name, until) {
  const armed = takeRoster(p, n, until).map(u => ({ ...u, src: p.id })), fill = n - armed.reduce((k, u) => k + u.count, 0);
  return fill > 0 ? [...armed, { ...unit(ARRIERE.key, fill, name), until, src: p.id }] : armed;
}

// Levies into a place: into its village, or its garrison if nobody of yours runs it.
function home(w, p, units) {
  if (p.town) p.town.addTroops(units, 0);
  else for (const u of units) p.garrison.push(u);
}

// A rank by places held, the same for you (World.rank) and for a house.
export const rankOf = n => (n >= 11 ? 'Duke' : n >= 5 ? 'Count' : n >= 2 ? 'Lord' : 'Reeve');

// A great house's own arrière-ban, on your rules: from each of its places whose ban is ready,
// the nearest `to` first, its rank's men, as many as its purse pays for at 3 gold a man and
// the host has room for; their carts loaded from its stores as far as they go. They serve from
// `from` at the latest (banArrived starts a column's clock sooner), then the place rests.
// Takes the gold and food; returns who comes: [{ p, n }].
const holdings = (w, h) => w.pois.filter(p => p.owner === h.index && p.kind !== 'camp' && !p.falling);
export const banCost = (w, h) => {
  const n = holdings(w, h).length;
  return (ARRIERE.per[rankOf(n)] || 0) * n * ARRIERE.gold;
};
export function houseBan(w, h, room, from = w.time + ARRIERE.late, to = null) {
  const places = holdings(w, h), per = ARRIERE.per[rankOf(places.length)] || 0;
  const ready = places.filter(p => banState(w, p).is === 'ready');
  if (to) ready.sort((p, q) => Math.hypot(p.x - to.x, p.z - to.z) - Math.hypot(q.x - to.x, q.z - to.z));
  let left = Math.max(0, Math.min(Math.floor(room), Math.floor(h.gold / ARRIERE.gold)));
  const called = [];
  for (const p of ready) {
    const n = Math.min(per, left);
    if (n <= 0) break;
    left -= n;
    called.push({ p, n });
    setOut(p, from + ARRIERE.serve);
  }
  const men = called.reduce((k, c) => k + c.n, 0);
  if (!men) return [];
  h.gold -= men * ARRIERE.gold;
  let food = men * EAT * ARRIERE.serve;
  // (only what leaves each place's people their year, holdings.js stewardSpare)
  for (const { p } of called) {
    let spare = p.eco?.stock ? stewardSpare(p.eco) : 0;
    for (const g of ['bread', 'food']) {
      const st = p.eco?.stock, k = st ? Math.min(food, spare, st[g] || 0) : 0;
      if (k) { st[g] -= k; food -= k; spare -= k; }
    }
  }
  return called;
}

// A house calls its arrière-ban as you call yours (Orchestrator, 2026-11-22): when its host
// gathers, to the muster place, or when a foe's host comes near, to the place it threatens
// (answer: to meet a threat, not to make one: threat.js callHeard).
// houseBan takes the gold and food; each place's men march to `dest` as a column and join
// its garrison there (a place with no road keeps its own at home); they go home when their
// time is up (tickArriere). As many as a host of its rank holds, less what stands at `dest`
// and what is already marching there.
export function houseCall(w, h, dest, answer = false) {
  const bound = w.armies.filter(a => a.side === h.index && !a.gone && a.target === dest).reduce((n, a) => n + headcount(a.units.filter(isLevy)), 0);
  const room = (ARMY_CAP[rankOf(holdings(w, h).length)] || 0) - headcount(dest.garrison) - bound;
  const called = houseBan(w, h, room, w.time + ARRIERE.late, dest);
  const men = called.reduce((k, c) => k + c.n, 0);
  if (!men) return 0;
  for (const { p, n } of called) {
    const units = banUnits(p, n, `${h.short} arrière-ban`, p.banState.until);
    const stay = at => { banArrived(w, units); mergeInto(at.garrison, units.map(unmarked)); };
    if (p === dest) { stay(p); continue; }
    const col = w.spawnArmy(h.index, units, p, `${h.short} arrière-ban`, 'column');
    if (!w.order(col, dest, w.roadOf(h.index))) { w.removeArmy(col); stay(p); }   // (not through a foe's or a free place, which would stop it)
  }
  // News to its neighbours and foes, you among them (threat.js); otherwise word only if you know it.
  if (!callHeard(w, h.index, dest, { kind: 'arriere', answer, men }) && (dest.visible || w.knows(h.index))) w.log(`${h.name} calls its arrière-ban to ${dest.name}: about ${roughly(men)} men of the countryside.`, 2);
  return men;
}
// A house's levies in a garrison need no note of their place once their time has started (it
// never sends them home early), so they fall in with their like.
export const unmarked = u => { const { src, ...rest } = u; return rest; };

// Every five seconds: levies whose time is up go home, from armies, garrisons and villages
// (`sent`: you have just sent them). A village under attack keeps its levies until the fight is over.
export function tickArriere(w, sent = false) {
  const gone = due(w);
  let n = 0;
  for (const a of [...w.armies]) {
    if (a.gone || a.wagon || !a.units.some(gone)) continue;
    const left = headcount(a.units.filter(gone));
    for (const u of a.units) if (gone(u)) returnToRoster(w, u);
    a.units = a.units.filter(u => !gone(u));
    a.wounded = (a.wounded || []).filter(u => !gone(u));
    if (a.side === 0) n += left;
    if (!a.units.length) w.removeArmy(a);
  }
  for (const p of w.pois) {
    if (p.garrison?.some(gone)) { if (p.owner === 0) n += headcount(p.garrison.filter(gone)); for (const u of p.garrison) if (gone(u)) returnToRoster(w, u); p.garrison = p.garrison.filter(u => !gone(u)); }
    const t = p.town;
    if (!t || t.underAttack || t.hostile) continue;
    for (const r of t.garrison()) if (gone(r)) { n += r.alive ?? 0; returnToRoster(w, fromReg(r)); if (!t.disband(r, true)) t.battle.disband(r); }   // (an armed man's kit stays with the ban, world/ban.js)
    // Levies in a village eat from its stores, as they would from their carts (a village feeds
    // only its own people). With nothing to spare, a regiment of them goes home hungry.
    const ls = t.garrison().filter(r => r.until);
    if (!ls.length) { t.levyMeal = 0; continue; }
    t.levyMeal = (t.levyMeal || 0) + ls.reduce((k, r) => k + r.alive, 0) * EAT * 5;
    t.levyMeal -= takeFood(t, Math.floor(t.levyMeal));
    if (t.levyMeal > 10) {
      const r = ls.sort((a, b) => a.alive - b.alive)[0];
      w.log(`${p.name} has no food to spare for the arrière-ban: ${r.alive} men go home hungry.`, 1);
      returnToRoster(w, fromReg(r));
      if (!t.disband(r, true)) t.battle.disband(r);
      t.levyMeal = 0;
    }
  }
  if (n) w.log(sent ? `You send the arrière-ban home: ${n} men go back to their fields.` : `The arrière-ban has served its time: ${n} men go home to their fields.`, sent ? 0 : 1);
}
