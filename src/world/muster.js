// The Muster (specs/MUSTER.md): one decision, how large a host, from where and at what
// price, that makes one army that stays one army.
//
// musterPlan reckons it row by row without moving anyone: the muster place's garrison, your
// villages' spare men (World.bannerPlan), your vassals' shares, each place's arrière-ban
// (arriere.js) and, from Duke, your armies in the field. musterHost carries out that same plan.
//
// Everything one call raises is one host. Its record is in w.hosts:
//   { id, name, at: the place it gathers or last went into (id), marched: it has left once }
// and every man of it carries marks, through villages, garrisons, armies and saves (economy.js
// marks): hostId; src, the place he was raised from; vas, the vassal whose man he is. An army
// on its way to join (a column) says so itself: a.musterFor. Men going home after a disband
// march as armies with a.parted.
import { FACTIONS, headcount, dist, mergeInto, guardOf, keepRank, BANNER_GUARD } from './world.js';
import { arrierePlan, banState, banColumn, sendBanHome, banArrived, ARRIERE } from './arriere.js';
import { mark, remember as recall } from './vassals.js';
import { armyStep } from './march.js';
import { EAT, heal } from './supply.js';
import { arriveHome } from './relief.js';
import { callHeard } from './threat.js';

const AGAIN = 600;   // a vassal called to arms again within this many seconds minds it (unless they want a war)
const num = n => Math.round(n).toLocaleString('en-GB');
const list = xs => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0]);
const mins = s => Math.max(1, Math.round(s / 60));
const count = u => u.count ?? u.alive ?? 0;
export const hostById = (w, id) => (w.hosts || []).find(h => h.id === id) || null;

// ---- where the men of a host are ----

// Every man of yours: { u (an army's unit, a garrison's or a village's regiment), army | place, town, wounded },
// a village you are storming among them.
export function* yours(w) {
  for (const a of w.armies) {
    if (a.gone || a.side !== 0 || a.wagon) continue;
    for (const u of a.units) yield { u, army: a };
    for (const u of a.wounded || []) yield { u, army: a, wounded: true };
  }
  for (const p of w.pois) {
    if (p.owner === 0) for (const u of p.garrison || []) yield { u, place: p };
    if (p.town) for (const r of p.town.garrison()) yield { u: r, place: p, town: p.town };
  }
}
const ofHost = (w, id) => [...yours(w)].filter(x => x.u.hostId === id);
export const hostMen = (w, id) => ofHost(w, id).reduce((n, x) => n + (x.wounded ? 0 : count(x.u)), 0);
// The hosts with men at a place, or in an army.
export function hostsAt(w, p) {
  const ids = new Set();
  for (const u of [...(p.garrison || []), ...(p.town && !p.town.hostile ? p.town.garrison() : [])]) if (u.hostId !== undefined) ids.add(u.hostId);
  for (const a of w.armies) if (!a.gone && a.side === 0 && a.at === p && !a.path.length) for (const u of a.units) if (u.hostId !== undefined) ids.add(u.hostId);
  return [...ids].map(id => hostById(w, id)).filter(Boolean);
}
export const hostsIn = (w, a) => [...new Set(a.units.map(u => u.hostId).filter(id => id !== undefined))].map(id => hostById(w, id)).filter(Boolean);

// Road still to go for an army, in seconds.
function timeLeft(w, a) {
  let d = 0, x = a.x, z = a.z;
  for (const p of a.path) { d += Math.hypot(p.x - x, p.z - z); x = p.x; z = p.z; }
  return d / armyStep(w, a);
}
// How a host stands: the men at its place, those still marching (and when the last comes in), and those anywhere else.
export function hostStatus(w, H) {
  const at = w.byId[H.at];
  const S = { at, here: 0, coming: 0, eta: 0, away: 0, awayAt: new Map(), total: 0, ban: 0, banLeft: Infinity, banFrom: new Set() };
  for (const x of ofHost(w, H.id)) {
    if (x.wounded) continue;
    const n = count(x.u);
    S.total += n;
    if (x.u.until) { S.ban += n; if (!x.army?.musterFor) S.banLeft = Math.min(S.banLeft, x.u.until - w.time); if (x.u.src !== undefined) S.banFrom.add(x.u.src); }
    if (x.army?.musterFor === H.id) { S.coming += n; S.eta = Math.max(S.eta, timeLeft(w, x.army)); }
    else if (x.place === at || (x.army && x.army.at === at && !x.army.path.length)) S.here += n;
    else {
      S.away += n;
      const where = x.place || (x.army.path.length ? null : x.army.at);
      if (where) S.awayAt.set(where, (S.awayAt.get(where) || 0) + n);
    }
  }
  return S;
}

// A host with no men left is a host no longer.
export function pruneHosts(w) {
  if (!w.hosts?.length) return;
  w.hosts = w.hosts.filter(H => ofHost(w, H.id).length > 0);
}

// ---- the plan ----

// The place columns with no friendly road to dest gather at instead: the village of yours that
// most of them can reach through friendly land, nearest dest.
export function stageFor(w, froms, dest) {
  if (!froms.length) return null;
  const safe = w.friendlyRoad(), reach = q => froms.filter(p => p === q || Number.isFinite(w.route(p, q, safe).length)).length;
  return w.pois.filter(q => q.owner === 0 && q !== dest && q.town && !q.town.hostile)
    .map(q => [q, reach(q), w.route(q, dest).length]).filter(x => x[1] > 0).sort((x, y) => y[1] - x[1] || x[2] - y[2])[0]?.[0] || null;
}

// Your armies in the field that may be gathered to dest (from the rank of Duke).
export const gathers = w => ['Duke', 'King'].includes(w.rank);
export const freeArmies = w => w.armies.filter(a => a.side === 0 && !a.gone && !a.wagon && !a.halted && !a.retreating && !a.siege && !a.escort && !a.musterFor && !a.parted && a.units.length);

// The garrison and levies of your village at dest, as "Muster the garrison" takes them.
const standing = p => (p.town && !p.town.hostile ? p.town.garrison().filter(r => r.alive > 0 && !r.routing && !r.regrouping && !r.T.militia) : []);
const unitsOf = regs => regs.map(r => ({ key: r.T.key, count: r.alive }));

// The host already standing at dest, if one is: a call there adds to it.
const hostStanding = (w, dest) => hostsAt(w, dest).find(H => H.at === dest.id) || null;

// Every row of the Muster to dest, whether or not it may be ticked. A row: { key, group
// ('here' | 'villages' | 'vassals' | 'ban' | 'armies'), name, men, gold, food (a minute), eta
// (seconds), to (where they march), ok, why, note }.
export function musterRows(w, dest) {
  const rows = [], safe = w.friendlyRoad();
  if (!dest || dest.owner !== 0 || w.rank === 'Reeve') return rows;
  const reach = (p, q) => (p === q ? 0 : w.route(p, q, safe).length);
  const secs = (len, units) => (len ? len / armyStep(w, { side: 0, units }) : 0);
  const B = w.bannerPlan(dest), per = ARRIERE.per[w.rank] || 0, ban = arrierePlan(w, dest);
  const vassalPlaces = B.vassals.map(x => x.p);
  // Sources with no friendly road to dest gather at one stage (as far as they can).
  const sources = [...B.villages.map(v => v.p), ...vassalPlaces, ...ban.all].filter(p => p !== dest && !Number.isFinite(reach(p, dest)));
  const stage = stageFor(w, [...new Set(sources)], dest);
  const road = p => {
    if (Number.isFinite(reach(p, dest))) return { to: dest, len: reach(p, dest) };
    if (stage && Number.isFinite(reach(p, stage))) return { to: stage, len: reach(p, stage) };
    return null;
  };
  const noRoad = `No friendly road to ${dest.name}: they stay at home`;
  const via = to => (to !== dest ? `Gather at ${to.name}: no friendly road to ${dest.name}` : '');

  const here = standing(dest), n = here.reduce((k, r) => k + r.alive, 0);
  if (n) rows.push({ key: 'here', group: 'here', place: dest, name: `${dest.name}: its garrison and levies`, men: n, eta: 0, to: dest, ok: true, note: '' });

  const list_ = v => list([v.keptLevies && `${v.keptLevies} levies`, v.keep - v.keptLevies && `${v.keep - v.keptLevies} of its garrison`].filter(Boolean));
  for (const v of B.villages) {
    const p = v.p;
    if (p === dest) {
      if (v.raised) rows.push({ key: `v:${p.id}`, group: 'villages', place: p, village: v, name: p.name, men: v.raised, eta: 0, to: dest, ok: true, note: `${v.raised} fresh levies, raised here` });
      continue;
    }
    if (!v.men && !v.keep) continue;
    const R = road(p), units = v.send.map(c => ({ key: c.key, count: c.men }));
    const note = [v.raised ? `raises ${v.raised} fresh levies` : '', v.keep ? `keeps ${list_(v)} as guard` : '', v.retinue ? 'your retinue comes' : ''].filter(Boolean).join(' · ');
    rows.push({ key: `v:${p.id}`, group: 'villages', place: p, village: v, name: p.name, men: v.men, eta: R ? secs(R.len, units) : 0, to: R?.to,
      ok: !!R && v.men > 0, why: !v.men ? 'Nobody to spare past its guard' : !R ? noRoad : '', note: [R ? via(R.to) : '', note].filter(Boolean).join(' · ') });
  }

  const byVassal = new Map();
  for (const x of B.vassals) (byVassal.get(x.v) || byVassal.set(x.v, []).get(x.v)).push(x);
  for (const [v, xs] of byVassal) {
    const kin = xs.find(x => x.kin)?.kin, refusing = xs.some(x => x.refusing);
    const going = [], cut = [];
    for (const x of xs) {
      if (x.refusing || !x.men) continue;
      const R = road(x.p);
      if (R) going.push({ p: x.p, men: x.men, to: R.to, eta: secs(R.len, [{ key: 'spear', count: x.men }]) });
      else cut.push(x.p.name);
    }
    const men = going.reduce((k, g) => k + g.men, 0);
    const why = kin ? `${v.name} won't march against their spouse's kin, ${kin.name}` : refusing ? `${v.name} refuses to send anyone` : cut.length ? noRoad : 'They have too few men to spare';
    const again = v.want !== 'glory' && w.time - (v.calledAt ?? -1e9) < AGAIN;
    rows.push({ key: `vas:${v.id}`, group: 'vassals', vassal: v, going, name: v.name, men, eta: Math.max(0, ...going.map(g => g.eta)), to: going[0]?.to, ok: men > 0, why: men ? '' : why,
      note: men ? [`from ${list(going.map(g => g.p.name))}`, ...[...new Set(going.map(g => g.to))].map(via), again ? 'called lately: they will grumble (−6)' : '', cut.length ? `${list(cut)}: no road` : ''].filter(Boolean).join(' · ') : '' });
  }

  for (const p of ban.all) {
    if (!per) break;
    const S = banState(w, p), R = road(p), units = [{ key: ARRIERE.key, count: per }];
    const outMen = [...yours(w)].filter(x => !x.wounded && x.u.until && x.u.src === p.id).reduce((k, x) => k + count(x.u), 0);
    rows.push({ key: `ban:${p.id}`, group: 'ban', place: p, name: p.name, men: per, gold: per * ARRIERE.gold, food: Math.round(per * EAT * 60), state: S.is, secs: S.secs, out: outMen,
      eta: R ? secs(R.len, units) : 0, to: R?.to, ok: S.is === 'ready' && !!R,
      why: S.is === 'out' ? `Out: home in ${mins(S.secs)} min` : S.is === 'resting' ? `Resting: again in ${mins(S.secs)} min` : !R ? noRoad : '', note: R && S.is === 'ready' ? via(R.to) : '' });
  }

  if (gathers(w)) for (const a of freeArmies(w)) {
    const there = a.at === dest && !a.path.length;
    let len = there ? 0 : Infinity;
    if (!there) for (const e of a.at ? [a.at] : [a.last, a.path[0]].filter(Boolean)) len = Math.min(len, dist(a, e) + reach(e, dest));
    rows.push({ key: `a:${a.id}`, group: 'armies', army: a, name: a.name, men: headcount(a.units), eta: Number.isFinite(len) ? secs(len, a.units) : 0, to: dest, ok: Number.isFinite(len),
      why: Number.isFinite(len) ? '' : `No friendly road to ${dest.name}`, note: a.path.length ? `marching to ${a.path.at(-1).name}` : a.at ? `at ${a.at.name}` : '' });
  }
  return rows;
}

// The rows ticked until you say otherwise: what you already have, but neither the countryside nor your armies.
export const defaultPicks = rows => new Set(rows.filter(r => r.ok && ['here', 'villages', 'vassals'].includes(r.group)).map(r => r.key));

// The plan for the rows in `picks` (a Set of row keys): totals, the cap and whether it may be called.
export function musterPlan(w, dest, picks) {
  const rows = musterRows(w, dest), picked = rows.filter(r => r.ok && picks.has(r.key));
  const sum = f => picked.reduce((n, r) => n + (r[f] || 0), 0);
  const H = dest?.owner === 0 ? hostStanding(w, dest) : null;
  const already = H ? hostStatus(w, H).here + hostStatus(w, H).coming : 0;
  // (the garrison of a host standing there is in that count already)
  const again = H && picked.some(r => r.key === 'here') ? standing(dest).filter(r => r.hostId === H.id).reduce((n, r) => n + r.alive, 0) : 0;
  const men = sum('men'), total = men + already - again, cap = w.armyCap, gold = sum('gold');
  const plan = { dest, rows, picked, host: H, men, total, cap, over: Math.max(0, total - cap), gold, food: Math.round(total * EAT * 60), eta: Math.max(0, ...picked.map(r => r.eta)), ok: true, why: '' };
  if (!dest || dest.owner !== 0) Object.assign(plan, { ok: false, why: 'Muster at a place of yours' });
  else if (w.rank === 'Reeve') Object.assign(plan, { ok: false, why: 'From the rank of Lord' });
  else if (dest.town?.hostile || dest.town?.underAttack || dest.town?.revolt) Object.assign(plan, { ok: false, why: `${dest.name} is being fought over` });
  else if (!men) Object.assign(plan, { ok: false, why: 'Tick who should come' });
  else if (FACTIONS[0].gold < gold) Object.assign(plan, { ok: false, why: `Needs ${num(gold)} gold; you have ${num(Math.floor(FACTIONS[0].gold))}` });
  return plan;
}

// ---- the call ----

const newHost = (w, dest) => {
  const H = { id: (w.nextHost = (w.nextHost || 0) + 1), name: `The host of ${dest.name}`, at: dest.id, marched: false };
  (w.hosts ||= []).push(H);
  return H;
};
// Marks a village's regiment as one of the host, raised from `p` unless he came from somewhere already.
const enrol = (r, H, p) => { r.hostId = H.id; if (r.src === undefined) r.src = p.id; };

// Sends a column on its way to join host H at `to`.
function march(w, a, H, to) {
  a.musterFor = H.id;
  if (!w.order(a, to, w.friendlyRoad())) { console.warn(`[muster] ${a.name} found no road to ${to.name}; it waits where it is`); hostArrive(w, a, a.at); }
}

export function musterHost(w, dest, picks) {
  const P = musterPlan(w, dest, picks);
  if (!P.ok) return { ok: false, why: P.why };
  const H = P.host || newHost(w, dest);
  FACTIONS[0].gold -= P.gold;
  const from = new Set(), staged = new Map(), by = {};
  const tally = (r, n, p, to) => {
    by[r.group] = (by[r.group] || 0) + n;
    if (p && p !== dest) from.add(p);
    if (to && to !== dest) staged.set(to, (staged.get(to) || 0) + n);
  };
  // (the standing garrison first: a village's fresh levies are raised after it is counted)
  for (const r of P.picked.filter(r => r.group === 'here')) {
    const regs = standing(dest);
    for (const g of regs) enrol(g, H, dest);
    tally(r, regs.reduce((n, g) => n + g.alive, 0), dest, dest);
  }
  for (const r of P.picked) {
    if (r.group === 'villages') {
      const v = r.village, p = v.p, t = p.town;
      for (const l of v.raise) l.reg = t.raise(l.key, l.b).reg;
      const regs = (p === dest ? v.raise.map(l => l.reg) : v.send.map(c => c.reg || c.levy.reg)).filter(g => g && !g.gone);
      for (const g of regs) enrol(g, H, p);
      tally(r, regs.reduce((n, g) => n + g.alive, 0), p, r.to);
      if (p === r.to || !regs.length) continue;
      const a = w.muster(p, regs, { quiet: true, name: `Banners of ${p.name}` });
      if (a) march(w, a, H, r.to);
    } else if (r.group === 'vassals') {
      const v = r.vassal;
      for (const g of r.going) tally(r, w.vassalMen(v, g.p, g.to, H.id), g.p, g.to);
      if (v.want !== 'glory' && w.time - (v.calledAt ?? -1e9) < AGAIN) mark(w, v, -6, 'Called to arms again so soon', 900);
      v.calledAt = w.time;
      recall(w, v, `Sent men to your host at ${dest.name}`);
    } else if (r.group === 'ban') {
      tally(r, banColumn(w, r.place, ARRIERE.per[w.rank], r.to, H.id), r.place, r.to);
    } else if (r.group === 'armies') {
      const a = r.army;
      // An army stays an army: its men are no longer any village's to take back (a vassal's and the ban's still are).
      for (const u of [...a.units, ...(a.wounded || [])]) { u.hostId = H.id; if (!u.until && u.vas === undefined) delete u.src; }
      tally(r, headcount(a.units), a.at, dest);
      if (a.at === dest && !a.path.length) { a.musterFor = H.id; hostArrive(w, a, dest); }
      else march(w, a, H, dest);
    }
  }
  const men = Object.values(by).reduce((n, k) => n + k, 0);
  const parts = [by.here && `${num(by.here)} of ${dest.name}'s own`, by.villages && `${num(by.villages)} from your villages`, by.vassals && `${num(by.vassals)} of your vassals'`,
    by.ban && `${num(by.ban)} of the countryside for ${num(P.gold)} gold`, by.armies && `${num(by.armies)} from the field`].filter(Boolean);
  const late = P.eta >= 30 ? `all in about ${mins(P.eta)} min` : 'all in now';
  const stage = [...staged].map(([p, n]) => ` ${num(n)} with no friendly road to ${dest.name} gather at ${p.name}.`).join('');
  const no = P.rows.filter(r => r.group === 'vassals' && !r.ok && r.why).map(r => ` ${r.why}.`).join('');
  w.log(`${H.name} is mustered: ${num(men)} men (${list(parts)}); ${late}.${stage}${no}`, stage ? 1 : 0);
  w.hooks.notice?.(`${H.name} is mustering: ${num(men)} men, ${late}.`);
  w.chron(`You mustered a host at ${dest.name}: ${num(men)} men${by.ban ? `, ${num(by.ban)} of them the arrière-ban` : ''}.`);
  callHeard(w, 0, dest, { kind: by.ban === men ? 'arriere' : 'banners' });   // the houses around you hear of it (threat.js)
  return { ok: true, host: H, men, gold: P.gold, by, eta: P.eta };
}

// ---- arrivals ----

// The host's army in the field: not a column still on its way to it.
const fieldHost = (w, id, but = null) => w.armies.find(a => a !== but && !a.gone && a.side === 0 && !a.wagon && !a.musterFor && !a.parted && a.units.some(u => u.hostId === id)) || null;

// A column stays where it is: inside a village of yours, or waiting as one army with the others.
function settle(w, a, p, H) {
  a.musterFor = null;
  if (p.town && p.owner === 0 && !p.town.hostile) { w.enterTown(a, p, a.last, true); return; }
  const o = H && w.armies.find(x => x !== a && !x.gone && x.side === 0 && !x.wagon && x.at === p && !x.path.length && !x.halted && x.units.some(u => u.hostId === H.id));
  if (o) w.join(o, a, true);
  if (!a.gone && H) a.name = H.name;
}

// A column of a host reaches the end of its road. Its levies' time starts; it falls in with the
// host's army if that waits here, follows it if it has gone on through your own or peaceful
// land, and otherwise waits at the muster.
export function hostArrive(w, a, p) {
  a.path = [];
  if (a.loot) arriveHome(w, a, p);
  const H = hostById(w, a.musterFor);
  banArrived(w, a.units);
  if (!H) { settle(w, a, p, null); return; }
  const main = fieldHost(w, H.id, a);
  if (main) {
    const to = main.path.length ? main.path.at(-1) : main.at;
    if (to === p) {
      if (!main.path.length && !main.halted) { w.join(main, a, true); if (a.gone) return; }
      settle(w, a, p, H);
      return;
    }
    if (to && !w.canAttack(0, to) && w.order(a, to, w.friendlyRoad())) return;
  }
  const m = w.byId[H.at];
  if (m && m !== p && m.owner === 0 && w.order(a, m, w.friendlyRoad())) return;
  settle(w, a, p, H);
}

// A host's army comes to a halt: columns of it waiting there fall in with it.
export function gatherIn(w, a) {
  if (a.gone || a.side !== 0 || a.musterFor || a.parted || a.path.length || a.halted || !a.at) return;
  for (const H of hostsIn(w, a)) for (const o of [...w.armies]) {
    if (o !== a && !o.gone && o.side === 0 && !o.wagon && !o.parted && o.at === a.at && !o.path.length && !o.halted && o.units.some(u => u.hostId === H.id)) { o.musterFor = null; w.join(a, o, true); }
  }
}

// The host has gone into a place of yours: that is where it is now.
export function hostEntered(w, units, p) {
  for (const id of new Set(units.map(u => u.hostId))) { const H = hostById(w, id); if (H) H.at = p.id; }
}

// ---- marching out ----

// The regiments that would stay behind at p as a garrison of `want` men: the fewest whole
// regiments of the host that make it up with what stays there anyway, bows and spears first,
// as the banners' guard is reckoned. Your retinue goes with you, and the arrière-ban stays only
// when nobody else can make up the guard: it would go home and leave the place bare.
export function garrisonLeft(w, id, p, want) {
  const all = standing(p), going = all.filter(r => r.hostId === id);
  const need = want - p.town.garrison().filter(r => !going.includes(r) && !r.T.militia && !r.until).reduce((n, r) => n + r.alive, 0);
  if (need <= 0) return [];
  const can = going.filter(r => !r.retinue).map(r => ({ reg: r, men: r.alive, stays: false })).sort((x, y) => keepRank(x.reg) - keepRank(y.reg));
  const sworn = can.filter(c => !c.reg.until);
  return [...guardOf(sworn.reduce((n, c) => n + c.men, 0) >= need ? sworn : can, need)].map(c => c.reg);
}

// The garrison a host leaves unless you choose otherwise: none when first it musters, the
// banners' guard from any place it has marched into.
export const guardDefault = H => (H.marched ? BANNER_GUARD : 0);

// What "March the host" would take from p: { men, stay (men left as garrison), ok, why }.
export function marchPlan(w, H, p, leave = guardDefault(H)) {
  let men = 0, stay = 0;
  if (p.town && !p.town.hostile) {
    const kept = garrisonLeft(w, H.id, p, leave);
    for (const r of standing(p).filter(r => r.hostId === H.id)) if (kept.includes(r)) stay += r.alive; else men += r.alive;
  } else men += headcount((p.garrison || []).filter(u => u.hostId === H.id));
  const waiting = w.armies.filter(a => !a.gone && a.side === 0 && !a.wagon && a.at === p && !a.path.length && !a.halted && a.units.some(u => u.hostId === H.id));
  men += waiting.reduce((n, a) => n + headcount(a.units), 0);
  const fought = p.town && (p.town.underAttack || p.town.hostile);
  return { men, stay, waiting, ok: men > 0 && !fought, why: fought ? `${p.name} is being fought over` : !men ? (stay ? 'All of them are needed as its garrison' : 'None of the host is here') : '' };
}

// Every regiment of the host at p marches out as one army, as many as one army may hold.
export function marchHost(w, id, p, leave) {
  const H = hostById(w, id);
  if (!H) return null;
  const P = marchPlan(w, H, p, leave ?? guardDefault(H));
  if (!P.ok) return null;
  let army = null;
  if (p.town && !p.town.hostile) {
    const kept = garrisonLeft(w, id, p, leave ?? guardDefault(H));
    const regs = standing(p).filter(r => r.hostId === id && !kept.includes(r));
    if (regs.length) army = w.muster(p, regs, { name: H.name });
  } else {
    const units = (p.garrison || []).filter(u => u.hostId === id);
    if (units.length) { p.garrison = p.garrison.filter(u => !units.includes(u)); army = w.spawnArmy(0, units, p, H.name); }
  }
  for (const o of P.waiting) {
    if (o.gone) continue;
    o.musterFor = null;
    if (!army) army = o; else if (o !== army) w.join(army, o, true);
  }
  if (army) { H.marched = true; H.at = p.id; }
  return army;
}

// ---- disbanding ----

// Where men of the host go home to: the place they were raised from while it is yours, else your nearest.
function homeOf(w, src, from) {
  const p = w.byId[src];
  if (p?.owner === 0) return p;
  const mine = w.pois.filter(q => q.owner === 0 && q.kind !== 'camp');
  return mine.sort((a, b) => dist(a, from) - dist(b, from))[0] || null;
}

// Men of yours reach home: levies go back to work, the rest stay in the garrison.
export function partedArrive(w, a, p) {
  heal(a);
  const units = a.units;
  w.removeArmy(a);
  if (p.town && !p.town.hostile) {
    if (a.food > 0) p.town.put(p.town.keep, 'food', Math.floor(a.food));
    const regs = p.town.addTroops(units, 0);
    for (const r of regs) if (r.levy && r.vas === undefined) p.town.disband(r, true);
  } else mergeInto(p.garrison, units);
}

const unmark = u => { delete u.hostId; delete u.vas; if (!u.until) delete u.src; };

// A band of the host at `at` (a place, with `along` the army it was marching in) goes to its home.
function sendBack(w, units, at, src, food, along = null, wounded = []) {
  const home = homeOf(w, src, at);
  const a = w.spawnArmy(0, units, along ? along.at || along.last : at, home ? `Men going home to ${home.name}` : 'Men of the host');
  if (along) Object.assign(a, { x: along.x, z: along.z, at: along.at, last: along.last, path: [...along.path] });
  a.food = food;
  a.wounded = wounded;
  for (const u of [...units, ...wounded]) unmark(u);
  a.parted = true;
  if (home && a.at === home) { partedArrive(w, a, home); return true; }
  if (home && w.order(a, home, w.friendlyRoad())) return true;
  a.parted = false;
  a.name = `Men of ${w.byId[src]?.name || 'the host'}`;
  return false;
}

// Sends each part of the host home by its own road: levies back to their villages as villagers,
// the rest of their garrisons with them, vassals' men to their lords' places, the ban home at
// once (arriere.js). Armies that were gathered stay armies.
export function disbandHost(w, id) {
  const H = hostById(w, id);
  if (!H) return { ok: false, why: 'That host is already gone' };
  const mine = ofHost(w, id);
  const fought = mine.find(x => x.town?.underAttack || x.town?.hostile || x.army?.halted);
  if (fought) return { ok: false, why: fought.army ? `${fought.army.name} is in battle` : `${fought.place.name} is being fought over` };
  const men = hostMen(w, id);

  const ban = mine.filter(x => x.u.until && x.u.src !== undefined);
  if (ban.length) {
    for (const x of ban) delete x.u.hostId;
    sendBanHome(w, [...new Set(ban.map(x => w.byId[x.u.src]).filter(Boolean))], ban.map(x => x.u));
  }
  let stranded = 0;
  const back = (units, at, src, food, along, wounded) => { if (units.length && !sendBack(w, units, at, src, food, along, wounded)) stranded += headcount(units); };
  // (men of no village are picked out before any are sent off: sendBack takes the marks away)
  const comeOut = (units, p) => {
    const field = units.filter(u => u.src === undefined);
    for (const g of groups(units.filter(u => !field.includes(u)))) back(g, p, g[0].src, 0);
    if (field.length) { for (const u of field) unmark(u); w.spawnArmy(0, field, p, `Army of ${p.name}`); }
  };
  const groups = units => {
    const by = new Map();
    for (const u of units) { const k = `${u.vas ?? ''}:${u.src ?? ''}`; (by.get(k) || by.set(k, []).get(k)).push(u); }
    return [...by.values()];
  };

  // Armies: those with a home go to it; the rest stay as they are.
  for (const a of [...w.armies]) {
    if (a.gone || a.side !== 0 || a.wagon) continue;
    const theirs = [...a.units, ...(a.wounded || [])].filter(u => u.hostId === id);
    if (!theirs.length) continue;
    a.musterFor = null;
    const all = headcount(a.units);
    for (const g of groups(theirs.filter(u => u.src !== undefined))) {
      let units = g.filter(u => a.units.includes(u)), hurt = g.filter(u => !units.includes(u));
      if (!units.length) [units, hurt] = [hurt, []];   // (only wounded left of them: they are carried home)
      a.units = a.units.filter(u => !g.includes(u));
      a.wounded = (a.wounded || []).filter(u => !g.includes(u));
      const food = (a.food || 0) * headcount(units) / Math.max(1, all);
      a.food = (a.food || 0) - food;
      back(units, a.at || a.last, units[0].src, food, a, hurt);
    }
    for (const u of [...a.units, ...(a.wounded || [])]) if (u.hostId === id) unmark(u);
    if (!a.units.length) w.removeArmy(a);
  }

  // Villages: levies of the place go back to work where they stand; others set out for home,
  // and men of no village (an army that was gathered) come out as an army again.
  for (const p of w.pois) {
    const t = p.town;
    if (t && !t.hostile) {
      const regs = t.garrison().filter(r => r.hostId === id);
      const home = regs.filter(r => r.src === p.id && r.vas === undefined);
      for (const r of home) { unmark(r); if (r.levy) t.disband(r, true); }
      const away = regs.filter(r => !home.includes(r) && !r.routing);
      for (const r of regs) if (r.routing) unmark(r);
      if (away.length) comeOut(t.takeTroops(away), p);
    }
    const held = (p.garrison || []).filter(u => u.hostId === id);
    if (!held.length) continue;
    const stay = held.filter(u => u.src === p.id);
    for (const u of stay) unmark(u);
    const away = held.filter(u => !stay.includes(u));
    if (!away.length) continue;
    p.garrison = p.garrison.filter(u => !away.includes(u));
    comeOut(away, p);
  }
  w.hosts = w.hosts.filter(h => h !== H);
  w.log(`${H.name} is disbanded: ${num(men)} men go their ways.${stranded ? ` ${num(stranded)} have no friendly road home and wait where they are.` : ''}`, stranded ? 1 : 0);
  return { ok: true, men, stranded };
}
