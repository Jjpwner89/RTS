// Your dealings with the other houses: what each lord thinks of you, and the treaties
// between you. Peace, alliances, gifts, tribute, marriage and vassals, and in the end
// the great houses backing your claim to the crown, which is a way to win.
//
// Opinion runs from -100 (hatred) to 100 (devotion). It drifts toward what the lord
// feels about the state of things (war, borders, marriage, your strength, their bent)
// and jumps with gifts, victories and broken promises.
import { seatPower, kinWarmth } from './vassals.js';
import { FACTIONS, power, headcount, takeUnits, mergeInto, roughly, unit as unitOf, ARMY_CAP } from './world.js';
import { ARRIERE, houseBan, banCost } from './arriere.js';
import { oddsOn } from './rivals.js';

const SIEGE = new Set(['ram', 'ladder', 'mangonel', 'trebuchet']);

const BASE = { raider: -10, hothead: -5, schemer: 0, merchant: 10, builder: 10, turtler: 5 };
const TRUCE = 600;          // seconds after peace before either side may attack again
const GIFT = 100;
const DOWRY = 150;
// Coalitions, after Europa Universalis: when you hold too much of the realm, the houses
// that don't love you band together, make peace among themselves and come for you, and
// fall apart again when the threat has passed.
const LEAGUE_BORDER = 420;   // a place this near one of theirs: they border you
const LEAGUE_LONG = 2400;    // seconds a coalition holds together at most
const LEAGUE_REST = 1800;    // and before another can form

export function startDiplomacy(w) {
  w.dip = FACTIONS.map(h => ({ opinion: BASE[h.trait] ?? 0, gift: 0, truceUntil: 0, allied: false, married: false,
    backs: false, vassal: false, broken: 0, score: 0, warSince: 0, offerCd: 240 + w.rand() * 200 }));
  w.dipClock = 10;
}

// Grudges: what a lord holds against you, and where. They weigh on his opinion and fade
// slowly (a father's death never), he goes back for what you took, and his taunts come
// from them: "You burned Wick. I have not forgotten."
const GRUDGES = {
  took: { n: 12, fade: 3600, line: p => `You took ${p} from me. I mean to have it back.`, why: p => `You took ${p}` },
  burned: { n: 10, fade: 3000, line: p => `You burned ${p}. I have not forgotten.`, why: p => `You burned ${p}` },
  beaten: { n: 5, fade: 1800, line: p => `You beat me at ${p}. You will not be so lucky twice.`, why: p => `Beaten by you at ${p}` },
  captain: { n: 4, fade: 1800, line: p => `My captain died at ${p}. His widow asks what I mean to do about it.`, why: p => `His captain died at ${p}` },
  father: { n: 30, fade: Infinity, line: p => `You killed my father at ${p}. I will see you in the ground.`, why: p => `You killed his father at ${p}` },
  broke: { n: 6, fade: 4800, line: () => 'You broke your word to me once. You will not have the chance again.', why: () => 'You broke your word' },
};
// A house holds grudges against other houses too (Orchestrator, 2026-11-21: leagues on the
// same reasons for every side): g.by is who did it, you when it is missing.
export function grudge(w, h, kind, place = '', by = 0) {
  const H = FACTIONS[h];
  if (!H || h === 0 || H.bandit || H.invader || !GRUDGES[kind] || by === h || (by && (!FACTIONS[by] || FACTIONS[by].bandit || FACTIONS[by].invader))) return;
  const list = (H.grudges ||= []);
  list.push(by ? { kind, place, at: Math.round(w.time), by } : { kind, place, at: Math.round(w.time) });
  // Ten at most against any one side.
  const theirs = list.filter(g => (g.by ?? 0) === by);
  if (theirs.length > 10) list.splice(list.indexOf(theirs.find(g => g.kind !== 'father')), 1);
}
const live = (w, H, by = 0) => (H.grudges || []).filter(g => (g.by ?? 0) === by && w.time - g.at < GRUDGES[g.kind].fade)
  .map(g => ({ ...g, weight: GRUDGES[g.kind].n * (GRUDGES[g.kind].fade === Infinity ? 1 : 1 - (w.time - g.at) / GRUDGES[g.kind].fade) }));
export const grudgeWeight = (w, H, by = 0) => live(w, H, by).reduce((n, g) => n + g.weight, 0);
export const grudgeLines = (w, H) => live(w, H).sort((a, b) => b.weight - a.weight).map(g => GRUDGES[g.kind].why(g.place));
// A lord still sore over a place he lost goes back for it first, from you or from a house.
export const wantsBack = (w, H, p) => p.owner !== null && live(w, H, p.owner).some(g => g.kind === 'took' && g.place === p.name);
// A taunt: one of his two heaviest grudges more often than not, else one of his house's sayings.
export function tauntFor(w, H) {
  const top = live(w, H).sort((a, b) => b.weight - a.weight).slice(0, 2), g = top[Math.floor(w.rand() * top.length)];
  if (g && w.rand() < 0.75) return GRUDGES[g.kind].line(g.place);
  return H.taunts?.[Math.floor(w.rand() * H.taunts.length)];
}

export const mood = o => (o >= 60 ? 'Devoted' : o >= 30 ? 'Friendly' : o >= 10 ? 'Warm' : o > -10 ? 'Wary' : o > -40 ? 'Cold' : 'Hostile');

// Something happened between you and a house: battles won and lost, places taken.
export function note(w, h, kind) {
  if (h === null || h === undefined || h === 0 || h === w.bandits || h === w.invader || !w.dip) return;
  const d = w.dip[h];
  const delta = { wonField: 10, lostField: -8, tookPlace: 25, lostPlace: -20, wonSiege: 15 }[kind] || 0;
  d.score += delta;
  if (kind === 'tookPlace') d.opinion -= 8;
}

function bordering(w, h) {
  const mine = w.pois.filter(p => p.owner === 0), theirs = w.pois.filter(p => p.owner === h);
  return mine.some(p => p.links.some(q => q.owner === h)) || theirs.some(p => mine.some(q => Math.hypot(p.x - q.x, p.z - q.z) < 300));
}

// What a lord thinks you deserve right now.
function target(w, h) {
  const H = FACTIONS[h], d = w.dip[h];
  let t = BASE[H.trait] ?? 0;
  if (d.married) t += 40;
  if (d.allied) t += 20;
  if (d.vassal) t += 10;
  if (w.atWar(0, h)) t -= 40;
  if (w.coalition?.members.includes(h)) t -= 15;
  else if (bordering(w, h) && !d.allied && !d.married) t -= 10;
  t -= d.broken * 15;
  t -= grudgeWeight(w, H);
  t += d.gift;
  t += kinWarmth(w, h);   // your vassals wed into this house
  t += seatPower(w, 'envoy');   // your envoy's smooth words (vassals.js SEATS)
  const ratio = w.strength(0) / Math.max(1, w.strength(h));
  if (ratio > 2) t += H.trait === 'schemer' || H.trait === 'merchant' ? 15 : H.trait === 'hothead' ? -5 : 5;
  // A lord likes you more when you fight the house he hates.
  for (const o of FACTIONS) if (o.index !== h && o.index !== 0 && !o.bandit && w.atWar(h, o.index) && w.atWar(0, o.index)) t += 10;
  return Math.max(-100, Math.min(100, t));
}

export function thinkDiplomacy(w, dt) {
  w.dipClock -= dt;
  if (w.dipClock > 0) return;
  w.dipClock = 10;
  thinkCoalition(w);
  for (const H of FACTIONS) {
    const h = H.index;
    if (h === 0 || H.bandit || H.invader || !H.alive) continue;
    const d = w.dip[h];
    d.gift = Math.max(0, d.gift - 1.5);
    d.opinion += (target(w, h) - d.opinion) * 0.12;
    if (w.atWar(0, h) && !d.warSince) d.warSince = w.time;
    if (!w.atWar(0, h)) { if (d.warSince) d.peaceAt = w.time; d.warSince = 0; }
    // Backing lapses if the friendship goes sour.
    if (d.backs && !d.vassal && (d.opinion < 15 || w.atWar(0, h))) {
      d.backs = false;
      w.log(`${H.lord} no longer backs your claim.`, 1);
    }
    // Allies join your wars.
    if (d.allied || d.vassal) for (const o of FACTIONS) if (o.index !== h && o.index !== 0 && !o.bandit && o.alive && w.atWar(0, o.index) && !w.atWar(h, o.index) && !w.dip[o.index]?.allied) w.declareWar(h, o.index);
    d.offerCd -= 10;
    if (d.offerCd <= 0) { d.offerCd = 150 + w.rand() * 150; offerFrom(w, H, d); }
  }
}

const great = () => FACTIONS.filter(H => H.index !== 0 && !H.bandit && !H.invader && H.alive);
// Why a house would league against a side (Orchestrator, 2026-11-21: on real reasons, never
// on who leads): that side borders it, has made war on it or wronged it, or holds a place it
// claims; and the house is arming and can pay its own arrière-ban. The same for you and for a
// house that runs away with the realm. A border is a reason only when the side over it holds
// more places than the house does (Orchestrator, 2026-11-21: a league against the one that
// borders and threatens): a bigger neighbour, not any neighbour.
// Grudges and claims count against a house as against you (Orchestrator, 2026-11-21), and the
// reasons rank: a war the side started, then a claim, then a wrong, then a bigger neighbour.
// Returns { why, n, d }: the reason as the coalition's herald says it to you, its rank, and
// how near the side's lands are; or nothing.
const LEAGUE_WHY = [null, 'your lands border theirs', 'you have wronged them', 'you hold what they claim', 'you made war on them'];
// A cornered house's call to arms (rivals.js cornered): for its time, a reason to league
// against the side it names, ranked with a wrong, for the caller and any house that answers.
export function callToArms(w, h, R, secs) {
  w.calls = (w.calls || []).filter(c => c.until > w.time && c.by !== h.index);
  w.calls.push({ by: h.index, against: R.index, until: w.time + secs });
  if (R.index === 0 || w.knows(h.index)) w.log(`${h.name} calls on the other houses to rise against ${R.index === 0 ? 'you' : R.name}.`, R.index === 0 ? 1 : 2);
}
const called = (w, side) => (w.calls || []).find(c => c.against === side && c.until > w.time && FACTIONS[c.by]?.alive);
function leagueReason(w, H, side) {
  const theirs = w.pois.filter(p => p.owner === side && p.kind !== 'camp'), mine = w.pois.filter(p => p.owner === H.index && p.kind !== 'camp');
  if (!theirs.length || !mine.length) return null;
  let d = Infinity;
  for (const p of theirs) for (const q of mine) d = Math.min(d, Math.hypot(p.x - q.x, p.z - q.z));
  // A war is a reason when the side started it; one the house started itself is not (a
  // war from a save that didn't record who started it still counts).
  const n = w.atWar(side, H.index) && (w.warBy?.[w.warKey(side, H.index)] ?? side) === side ? 4
    : theirs.some(p => wantsBack(w, H, p)) ? 3
    : grudgeWeight(w, H, side) > 0 ? 2
    : called(w, side) ? -2
    : theirs.length > mine.length && d < LEAGUE_BORDER ? 1 : 0;
  if (n === -2) { const c = called(w, side); return { why: c.by === H.index ? 'they called the houses to arms against you' : `they answer ${FACTIONS[c.by].name}'s call to arms`, n: 2, d }; }
  return n ? { why: LEAGUE_WHY[n], n, d } : null;
}
// Whether a house would answer a call to arms against a side (rivals.js cornered weighs its
// allies so): free of any league, arming and able to pay, and not a friend of yours if the call
// is against you. The call itself is its reason (leagueReason).
const friendlyToYou = (w, H) => { const d = w.dip[H.index]; return d.allied || d.married || d.vassal || d.backs || d.opinion >= 25 || d.paidUntil > w.time; };
export const wouldJoin = (w, H, side) => !leagued(w, H.index) && !(w.leagues || []).some(L => L.members.includes(H.index))
  && leagueReady(w, H) && !(side === 0 && friendlyToYou(w, H));
// Of a house's reasons, the one it acts on: the strongest, and of equals the nearer side.
// The same for you and every house: nobody comes first for being you.
export const strongestReason = rs => rs.filter(Boolean).sort((a, b) => b.n - a.n || a.d - b.d)[0] || null;
const leagueReady = (w, H) => H.ai?.stance === 'war' && !(H.arriere?.rest > w.time) && H.gold >= banCost(w, H);
export const leagued = (w, h) => !!w.coalition?.members.includes(h);

// The league raises one host (Duke batch, 2026-11-21): every member sends two men in five from
// each of its places to the leader's place nearest your best one, it gathers there for a while (strike
// it before it marches), then marches on that place. One big danger with a clear end: the host
// beaten means the league is broken, and its lords sue for peace. A host that takes the place
// stays there as its garrison, and the league gathers another.
const HOST_GATHER = 120;     // seconds the host waits at its muster before it marches
const HOST_AGAIN = 300;      // and after a place taken, before the next host gathers
const HOST_SHARE = 0.4;      // of each member place's garrison (a house's own banners leave half)
const hostOf = w => w.armies.find(a => a.id === w.coalition?.host?.id && !a.gone) || null;
// A host gone into a storm or a blockade of one of your villages is still fighting there.
const atWalls = w => { const P = w.byId[w.coalition?.host?.near]; return P?.owner === 0 && !!(P.town?.underAttack || P.town?.hostile); };
// The league's host is in the field or at your walls.
export const leagueHost = w => !!w.coalition?.host?.id && ((hostOf(w) && !hostOf(w).retreating) || atWalls(w));
// Your best place: your seat if you have one, else your biggest village.
function bestOf(w) {
  const mine = w.pois.filter(p => p.owner === 0 && p.kind !== 'camp');
  const seat = FACTIONS[0].seat;
  if (seat?.owner === 0) return seat;
  return mine.sort((a, b) => (b.town?.population ?? b.eco?.pop ?? 0) - (a.town?.population ?? a.eco?.pop ?? 0))[0] || null;
}
function raiseHost(w) {
  const C = w.coalition, T = bestOf(w);
  if (!T) return;
  // The strongest member with a road to your best place leads it; with none, it tries again later.
  let lead = null, near = null;
  for (const h of C.members.map(h => FACTIONS[h]).sort((a, b) => w.strength(b.index) - w.strength(a.index))) {
    near = w.pois.filter(p => p.owner === h.index).map(p => ({ p, d: w.route(p, T).length })).filter(o => o.d < Infinity).sort((a, b) => a.d - b.d)[0];
    if (near) { lead = h; break; }
  }
  if (!near) { C.host = { id: null, again: w.time + HOST_AGAIN }; return; }
  const S = near.p, units = [], from = [];
  for (const h of C.members) {
    let n = 0;
    for (const p of w.pois.filter(q => q.owner === h)) {
      const got = takeUnits(p.garrison, power(p.garrison) * HOST_SHARE);
      n += headcount(got);
      mergeInto(units, got);
    }
    if (n) from.push(`${FACTIONS[h].short} ${n}`);
  }
  if (headcount(units) < 30) { for (const u of units) S.garrison.push(u); C.host = { id: null, again: w.time + HOST_AGAIN }; return; }
  for (const [key, count] of [['ram', 8], ['ladder', 12], ['mangonel', 6]]) units.push({ ...unitOf(key, count, `League ${key}s`) });
  // Each member calls its own arrière-ban on your rules (Orchestrator, 2026-11-21: no free
  // men): its rank's levy from each of its places, 3 gold a man from its purse, carts from
  // its stores, ten minutes from the march, and not again until its countryside has rested
  // (arriere.js houseBan). A house that cannot pay sends fewer. The host is one army, within
  // a duke's cap, as yours is.
  let room = Math.max(0, ARMY_CAP.Duke - headcount(units)), levy = 0;
  for (const i of C.members) { const n = houseBan(w, FACTIONS[i], room, w.time + HOST_GATHER); levy += n; room -= n; }
  if (levy) { mergeInto(units, [{ ...unitOf(ARRIERE.key, levy, 'League levies'), until: w.time + HOST_GATHER + ARRIERE.serve }]); from.push(`levies ${levy}`); }
  const a = w.spawnArmy(lead.index, units, S, 'The league host', 'siege');
  a.league = true;
  C.host = { id: a.id, at: S.id, target: T.id, marchAt: w.time + HOST_GATHER, men: headcount(units.filter(u => !SIEGE.has(u.key))), lead: lead.index,
    theirs: w.pois.filter(p => C.members.includes(p.owner)).map(p => p.id) };
  w.meet(lead.index);
  S.seen = true;
  w.log(`The league gathers one host at ${S.name}: about ${roughly(C.host.men)} men (${from.join(', ')}). It means to march on ${T.name}.`, 1);
  w.chron(`The league against you gathered its host at ${S.name}, ${C.host.men} strong.`);
  w.hooks.herald?.({ house: lead, title: 'The league raises its host', text: `${C.host.men} men gather at ${S.name} under ${lead.lord}, to march on ${T.name} in two minutes. Strike them there, or meet them on the road: break this host and the league is broken.` });
}
function tickHost(w) {
  const C = w.coalition, H = C.host;
  if (!H) return raiseHost(w);
  if (!H.id) { if (w.time >= H.again) raiseHost(w); return; }
  const a = hostOf(w), T = w.byId[H.target];
  if (a && !a.retreating) {
    H.near = (a.at || a.path[0])?.id ?? H.near;   // where it is, or the next place on its road
    if (H.marchAt && w.time >= H.marchAt && a.at && !a.path.length && !a.halted) {
      const to = T?.owner === 0 ? T : bestOf(w), from = a.at;
      if (to && w.order(a, to)) {
        H.marchAt = 0; H.target = to.id;
        w.log(`The league host marches from ${from.name} on ${to.name}!`, 1);
        w.hooks.sound?.('warcry'); // audio
      }
    }
    return 'alive';
  }
  // Gone: into a storm of one of your villages (still fighting), into the place it took (its
  // garrison now), or beaten.
  if (!a && atWalls(w)) return 'alive';
  const took = [T, w.byId[H.near]].some(p => p && C.members.includes(p.owner) && !H.theirs?.includes(p.id));
  if (!a && took) { C.host = { id: null, again: w.time + HOST_AGAIN }; return; }
  return 'broken';
}
function endLeague(w, C, over) {
  w.log(`The coalition against you ${over}.`, 1);
  w.chron(`The coalition against you ${over}.`);
  w.coalition = { members: [], since: C.since, rest: w.time + LEAGUE_REST };
}

// A league against a house, on the same reasons: those with one go to war on it together
// and make peace among themselves. There is no one host: each marches its own (rivals.js).
// The league holds LEAGUE_LONG, then the house may be leagued against again after a rest.
function rivalLeague(w, R, join) {
  const ids = join.map(H => H.index);
  for (const a of ids) for (const b of ids) if (a < b && w.atWar(a, b)) w.makePeace(a, b);
  for (const h of ids) if (!w.atWar(h, R.index)) w.declareWar(h, R.index);
  w.leagues.push({ target: R.index, members: ids, since: w.time });
  R.ai.leagueRest = w.time + LEAGUE_LONG + LEAGUE_REST;
  w.log(`${join.map(H => H.name).join(', ')} have leagued together against ${R.name}.`, 2);
}

// Every league that forms this tick, against you or a house, on one rule (Orchestrator,
// 2026-11-21: no player-first order): each free house that is arming and can pay weighs its
// reason against every side it could league against, and joins against the one its
// strongest reason names (strongestReason). A side two or more houses choose is leagued
// against. A house whose choice found no partner tries its next reason.
function formLeagues(w, C) {
  w.leagues = (w.leagues || []).filter(L => w.time - L.since < LEAGUE_LONG && FACTIONS[L.target]?.alive);
  const busy = H => leagued(w, H.index) || w.leagues.some(L => L.members.includes(H.index));
  const you = !C?.members.length && !w.crowned && w.time >= (C?.rest ?? 1200);
  // Peace, a marriage, an alliance or tribute keeps a house out of a league against you, as before.
  const friendly = H => friendlyToYou(w, H);
  const open = R => R.index === 0 ? you : !w.leagues.some(L => L.target === R.index) && (R.ai?.leagueRest ?? 1200) <= w.time;
  const free = great().filter(H => !busy(H) && leagueReady(w, H));
  const sides = [FACTIONS[0], ...great()].filter(open);
  const reasons = new Map(free.map(H => [H, sides.filter(R => R !== H && !(R.index === 0 && friendly(H)))
    .map(R => { const r = leagueReason(w, H, R.index); return r && { ...r, R }; }).filter(Boolean)]));
  for (let round = 0; round < 6; round++) {
    const pick = new Map();
    for (const [H, rs] of reasons) { const r = strongestReason(rs); if (r) (pick.get(r.R) || pick.set(r.R, []).get(r.R)).push([H, r]); }
    let formed = false, dropped = false;
    for (const [R, list] of pick) {
      if (list.length < 2) { const [H, r] = list[0]; reasons.get(H).splice(reasons.get(H).indexOf(r), 1); dropped = true; continue; }
      const join = list.map(([H]) => H);
      if (R.index === 0) leagueAgainstYou(w, join, new Map(list.map(([H, r]) => [H, r.why])));
      else rivalLeague(w, R, join);
      for (const H of join) reasons.delete(H);
      for (const rs of reasons.values()) for (let i = rs.length - 1; i >= 0; i--) if (rs[i].R === R) rs.splice(i, 1);
      formed = true;
    }
    if (!formed && !dropped) break;
  }
}

function thinkCoalition(w) {
  const C = w.coalition;
  if (C?.members.length) {
    // A house that makes peace with you, or is broken, has left it.
    C.members = C.members.filter(h => FACTIONS[h].alive && w.atWar(0, h));
    if (C.members.length && tickHost(w) === 'broken') {
      const lords = C.members.map(h => FACTIONS[h]);
      for (const H of lords) { w.makePeace(0, H.index); Object.assign(w.dip[H.index], { truceUntil: w.time + TRUCE, score: 0 }); }
      const a = w.armies.find(x => x.id === C.host.id);
      if (a && !a.gone && a.retreating) a.league = false;
      endLeague(w, C, 'is broken: its host is beaten');
      w.hooks.sound?.('fanfare'); // audio
      w.hooks.herald?.({ house: FACTIONS[0], title: 'The league is broken', text: `With its host beaten, ${lords.map(H => H.lord).join(', ')} sue for peace. None of them may attack you for ten minutes.` });
      return;
    }
    const over = C.members.length < 2 ? 'has fallen apart' : w.time - C.since > LEAGUE_LONG ? 'has worn itself out' : null;
    if (over) {
      // Its host goes home with it.
      const a = hostOf(w);
      if (a && !a.retreating) w.retreat(a);
      endLeague(w, C, over);
      return;
    }
  }
  // Leagues against houses still form while one is against you, from the houses not in it.
  formLeagues(w, w.coalition);
}

// Houses with a reason against you, arming and able to pay, league together (formLeagues).
function leagueAgainstYou(w, join, why) {
  const ids = join.map(H => H.index);
  for (const a of ids) for (const b of ids) if (a < b) w.makePeace(a, b);
  for (const h of ids) { w.dip[h].truceUntil = 0; w.declareWar(h, 0, true); }
  w.coalition = { members: ids, since: w.time };
  const names = join.map(H => H.name).join(', ');
  w.log(`${names} have leagued together against you!`, 1);
  w.hooks.sound?.('boom'); // audio
  w.chron(`${names} leagued together against you.`);
  const quarrels = join.map(H => `${H.short}: ${why.get(H)}.`).join('\n');
  w.hooks.herald?.({ house: join[0], title: 'A coalition against you', text: `Each has a quarrel with you:\n${quarrels}\n\nThey have made peace among themselves, declared war on you together, and will raise one host. Break it and the league is broken; or buy them off, make peace one by one, or outlast it.` });
  raiseHost(w);
}

// The AI's own proposals, which you accept or turn down.
const OFFER_GAP = 120;        // seconds between any two houses' proposals
const TRIBUTE_EVERY = 1800;   // one house's tribute demands, at most this often
const TRIBUTE_PEACE = 900;    // and none this soon after making peace with you
const TRIBUTE_GAP = 600;      // nor this soon after any house's demand
// (120 from 150 when taxes came to follow a place's buildings, 2026-11-22: the opening purse
// fills more slowly, and a demand waits on it.)
export const VASSAL_TRIBUTE = 36;   // gold a minute a vassal house pays you while its coffers last (world.js)
export const TRIBUTE = { gold: 120, buys: 1200 };   // what a demand asks, and the peace paying it buys
function offerFrom(w, H, d) {
  const h = H.index, mine = w.strength(0), theirs = w.strength(h);
  // One house's proposal at a time across the realm: a second waits for its next turn.
  const ask = (title, text, accept, decline) => {
    if (w.time - (w.offerAt ?? -Infinity) < OFFER_GAP) return;
    w.offerAt = w.time;
    w.meet(h); w.hooks.offer?.({ house: H, title, text, accept, decline });
  };
  if (w.atWar(0, h)) {
    const losing = d.score >= 30 || theirs < mine * 0.6;
    if (losing && theirs < mine * 0.35 && !d.vassal) {
      ask(`${H.lord} offers to bend the knee`, `${H.name} is beaten. ${H.lord} will become your vassal: peace, a share of their taxes, and their backing for your claim.`,
        () => act(w, h, 'vassal', true), () => {});
    } else if (losing || (w.time - d.warSince > 1200 && w.rand() < 0.4)) {
      ask(`${H.lord} sues for peace`, `“Enough blood has been spilled. Let there be peace between our houses.”`, () => act(w, h, 'peace', true), () => { d.opinion -= 5; });
    }
    return;
  }
  if (!d.married && d.opinion >= 45 && (H.trait === 'schemer' || w.rand() < 0.5)) {
    ask(`${H.lord} proposes a marriage`, `A match between your houses. It costs no dowry when they ask, and binds ${H.name} to you.`,
      () => act(w, h, 'marry', true), () => { d.opinion -= 5; });
  } else if (!d.allied && d.opinion >= 40) {
    ask(`${H.lord} proposes an alliance`, `${H.name} will join your wars, and you theirs.`, () => act(w, h, 'ally', true), () => { d.opinion -= 3; });
  } else if ((H.trait === 'raider' || H.trait === 'schemer') && theirs > mine * 1.8 && w.time > 600 && FACTIONS[0].gold >= TRIBUTE.gold && w.time > (d.demanded ?? 0)
    && w.time - (d.peaceAt ?? -Infinity) > TRIBUTE_PEACE && w.time - (w.tributeAt ?? -Infinity) > TRIBUTE_GAP) {
    // Paid, they keep the peace they sold: a truce no war choice of theirs breaks, and no
    // league against you takes them in while it lasts.
    const mins = Math.round(TRIBUTE.buys / 60);
    d.demanded = w.time + TRIBUTE_EVERY;   // they do not ask again for a long while
    w.tributeAt = w.time;
    ask(`${H.lord} demands tribute`, `“Pay me ${TRIBUTE.gold} gold and my men will stay home.” Paying buys ${mins} minutes of peace with ${H.name}. Refuse, and ${H.lord} may come for it.`,
      () => {
        if (FACTIONS[0].gold < TRIBUTE.gold) { w.log(`You no longer have ${TRIBUTE.gold} gold for ${H.name}.`, 1); console.warn('tribute: purse too light'); return { ok: false, text: `You have only ${Math.floor(FACTIONS[0].gold)} gold.` }; }
        FACTIONS[0].gold -= TRIBUTE.gold; d.opinion += 15;
        d.truceUntil = d.paidUntil = Math.max(d.truceUntil, w.time + TRIBUTE.buys);
        w.log(`You paid ${H.name} ${TRIBUTE.gold} gold: ${mins} minutes of peace.`, 1);
        return { ok: true, text: `${H.name} will keep the peace for ${mins} minutes.` };
      },
      () => { d.opinion -= 15; if (w.rand() < 0.5) w.declareWar(h, 0, false, `Tribute refused. ${oddsOn(w, H, 0)}`); });
  }
}

// Strength of a house: its garrisons and armies.
export function strengthOf(w, i) {
  let n = 0;
  for (const p of w.pois) if (p.owner === i) n += w.defence(p);
  for (const a of w.armies) if (a.side === i) n += a.units.reduce((k, u) => k + u.count, 0);
  return n;
}

// What you can propose to a house right now, and why not when you can't.
export function actions(w, h) {
  const H = FACTIONS[h], d = w.dip[h], gold = FACTIONS[0].gold, war = w.atWar(0, h), truce = w.time < d.truceUntil;
  const ratio = w.strength(0) / Math.max(1, w.strength(h));
  const list = [];
  if (war) {
    list.push({ id: 'peace', label: 'Offer peace', ok: true });
    const price = peacePrice(w, h);
    list.push({ id: 'buypeace', label: `Buy peace (${price} gold)`, ok: gold >= price, why: `Needs ${price} gold` });
    if (leagued(w, h)) { const all = leaguePrice(w); list.push({ id: 'buyleague', label: `Buy off the whole coalition (${all} gold)`, ok: gold >= all, why: `Needs ${all} gold` }); }
    list.push({ id: 'vassal', label: 'Demand they bend the knee', ok: ratio > 2.5 || !H.seat || H.seat.owner !== h, why: 'They are not beaten enough' });
  } else {
    list.push({ id: 'gift', label: `Send a gift (${GIFT} gold)`, ok: gold >= GIFT, why: `Needs ${GIFT} gold` });
    if (!d.allied) list.push({ id: 'ally', label: 'Propose an alliance', ok: d.opinion >= 35, why: 'They are not friendly enough' });
    const dowry = dowryFor(w, h);
    if (!d.married) list.push({ id: 'marry', label: `Propose a marriage (${dowry} gold)`, ok: d.opinion >= 25 && gold >= dowry, why: d.opinion < 25 ? 'They are not warm enough' : `Needs ${dowry} gold` });
    list.push({ id: 'tribute', label: 'Demand tribute', ok: ratio > 2 && !d.allied && !d.married, why: 'You are not strong enough to demand it' });
    if (d.vassal && H.alive) { const c = canCall(w, h); list.push({ id: 'host', label: `Call their host to war${c.target ? ` (to ${c.target.name})` : ''}`, ok: c.ok, why: c.why }); }
    if (!d.backs) list.push({ id: 'claim', label: 'Ask them to back your claim', ok: canBack(w, h), why: 'They need to be devoted, or bound to you and far weaker' });
    list.push({ id: 'war', label: truce ? 'Declare war (breaks the truce)' : d.allied || d.married ? 'Declare war (betrays them)' : 'Declare war', ok: true, warn: true });
  }
  return list;
}

// A great house asks a bigger dowry than a small one.
export const dowryFor = (w, h) => Math.round((DOWRY + w.strength(h) * 0.5) / 50) * 50;
// What the whole league asks to go home at once: less than buying each house off.
export const leaguePrice = w => Math.round((w.coalition?.members || []).reduce((n, h) => n + peacePrice(w, h), 0) * 0.75 / 50) * 50;

// What a house at war asks to go home: more the stronger it is.
// A lord asks what you can pay: a twentieth of a purse beyond 2,000 on top of what his men are
// worth (Duke batch: a duke's treasury reached 40,000 with peace at 200 gold a house).
export function peacePrice(w, h) {
  const rich = Math.max(0, (FACTIONS[0].gold || 0) - 2000) * 0.05;
  return Math.min(4000, Math.max(150, Math.round((150 + w.strength(h) * 0.25 + rich) / 50) * 50));
}

function canBack(w, h) {
  const d = w.dip[h], ratio = w.strength(0) / Math.max(1, w.strength(h));
  return !w.atWar(0, h) && (d.vassal || (d.opinion >= 60 && (d.married || d.allied)) || (d.opinion >= 20 && ratio > 2.5));
}

// Carries out a proposal. `theirs` is true when the house proposed it and you accepted.
// Returns what happened, as a sentence.
// ---- calling a sworn house to war ----
// A house sworn to you (every house after the crowning) sends half the men of its places,
// under its own banner, against the nearest place of your enemies (in Part 2, the north).
// Once every ten minutes for each house; a house that is cold to you drags its feet.
const CALL_EVERY = 600, CALL_MIN = 30;
function callTarget(w, h) {
  const H = FACTIONS[h], from = H.seat?.owner === h ? H.seat : w.pois.find(p => p.owner === h);
  if (!from) return { from: null, target: null };
  const foes = w.pois.filter(p => p.owner !== null && p.owner !== 0 && p.owner !== h && w.atWar(0, p.owner) && p.owner !== w.bandits && w.atWar(h, p.owner));
  const best = foes.map(p => ({ p, len: w.route(from, p).length })).filter(o => Number.isFinite(o.len)).sort((a, b) => a.len - b.len)[0];
  return { from, target: best?.p || null };
}
const callable = (w, h) => w.pois.filter(p => p.owner === h).reduce((n, p) => n + Math.floor(headcount(p.garrison) / 2), 0);
export function canCall(w, h) {
  const d = w.dip[h];
  if (w.time < (d.calledAt ?? -Infinity) + CALL_EVERY) return { ok: false, why: `Their last host is barely home (${Math.ceil((d.calledAt + CALL_EVERY - w.time) / 60)} min)` };
  const { target } = callTarget(w, h);
  if (!target) return { ok: false, why: 'No enemy of yours within their reach' };
  if (callable(w, h) < CALL_MIN) return { ok: false, why: 'They have too few men to spare', target };
  if (d.opinion < -10) return { ok: false, why: 'They are too cold to you to answer', target };
  return { ok: true, target };
}
export function callHost(w, h) {
  const c = canCall(w, h);
  if (!c.ok) return c;
  const H = FACTIONS[h], d = w.dip[h], { from, target } = callTarget(w, h);
  const units = [];
  for (const p of w.pois.filter(q => q.owner === h)) mergeInto(units, takeUnits(p.garrison, power(p.garrison) * 0.5));
  const a = w.spawnArmy(h, units, from, `${H.short} host, at your call`);
  a.called = true;
  if (!w.order(a, target)) { mergeInto(from.garrison, a.units); w.removeArmy(a); return { ok: false, why: 'They cannot find a road there' }; }
  d.calledAt = w.time;
  d.opinion -= d.opinion > 30 ? 2 : 5;
  w.chron(`${H.lord} answered your call and marched on ${target.name}.`);
  return { ok: true, army: a, text: `${H.lord} sends ${headcount(a.units)} men against ${target.name}.` };
}

export function act(w, h, id, theirs = false) {
  const H = FACTIONS[h], d = w.dip[h], me = FACTIONS[0];
  const yes = text => { w.log(text); return { ok: true, text }; };
  const no = text => ({ ok: false, text });
  if (id === 'host') { const r = callHost(w, h); return r.ok ? yes(r.text) : no(r.why); }
  if (id === 'peace') {
    const ratio = w.strength(0) / Math.max(1, w.strength(h));
    if (!theirs && !(d.score >= 25 || ratio > 1.6 || d.opinion > 5 || (w.time - d.warSince > 1500 && w.rand() < 0.5))) return no(`${H.lord} refuses. “Not while I still have men to send.”`);
    w.makePeace(0, h);
    d.truceUntil = w.time + TRUCE;
    d.score = 0;
    return yes(`Peace with ${H.name}. Neither side may attack for ten minutes.`);
  }
  if (id === 'buypeace') {
    const price = peacePrice(w, h);
    if (me.gold < price) return no(`You need ${price} gold.`);
    me.gold -= price;
    H.gold += price;
    w.makePeace(0, h);
    d.truceUntil = w.time + TRUCE;
    d.score = 0;
    return yes(`You paid ${H.name} ${price} gold for peace. Neither side may attack for ten minutes.`);
  }
  if (id === 'buyleague') {
    const price = leaguePrice(w), members = [...(w.coalition?.members || [])];
    if (!members.length) return no('There is no coalition.');
    if (me.gold < price) return no(`You need ${price} gold.`);
    me.gold -= price;
    for (const m of members) {
      FACTIONS[m].gold += Math.round(price / members.length);
      w.makePeace(0, m);
      Object.assign(w.dip[m], { truceUntil: w.time + TRUCE, score: 0 });
    }
    const host = hostOf(w);
    if (host && !host.retreating) w.retreat(host);
    w.coalition = { members: [], since: w.coalition.since, rest: w.time + LEAGUE_REST };
    w.log('The coalition against you is bought off.', 1);
    w.chron('You bought off the coalition against you.');
    return yes(`You paid the coalition ${price} gold. Its lords go home, and none may attack you for ten minutes.`);
  }
  if (id === 'vassal') {
    w.makePeace(0, h);
    Object.assign(d, { vassal: true, backs: true, truceUntil: Infinity, score: 0 });
    w.chron(`${H.lord} bent the knee, and ${H.name} became your vassal.`);
    d.opinion = Math.max(d.opinion, 20);
    H.vassalOf = 0;
    // Said plainly, wherever it shows (creator, 2026-11-22: a fast click on the offer left them unsure it had happened).
    const terms = `${H.name} is now your vassal: peace, a share of its taxes (${VASSAL_TRIBUTE} gold a minute while its coffers last), its backing for your claim, and its lands and host in your sight.`;
    w.log(terms, 1);
    w.hooks.herald?.({ house: H, title: `${H.name} is now your vassal`, text: `${H.lord} has bent the knee. ${terms}` });
    w.checkEnd();
    return yes(`${H.name} is now your vassal.`);
  }
  if (id === 'gift') {
    if (me.gold < GIFT) return no('Not enough gold.');
    me.gold -= GIFT;
    d.gift = Math.min(45, d.gift + 18);
    d.opinion += 12;
    return yes(`${H.lord} accepts your gift.`);
  }
  if (id === 'ally') {
    if (!theirs && d.opinion < 35) return no(`${H.lord} declines. “I do not know you well enough.”`);
    d.allied = true;
    w.chron(`You allied with ${H.name}.`);
    d.opinion += 10;
    return yes(`You are now allied with ${H.name}.`);
  }
  if (id === 'marry') {
    if (!theirs) {
      const dowry = dowryFor(w, h);
      if (me.gold < dowry) return no('Not enough gold for the dowry.');
      if (d.opinion < 25) return no(`${H.lord} declines the match.`);
      me.gold -= dowry;
      H.gold += dowry;
    }
    d.married = true;
    w.chron(`Your house and ${H.name} were joined by marriage.`);
    d.opinion += 30;
    w.hooks.herald?.({ house: H, title: 'A marriage alliance', text: `Your house and ${H.name} are joined by marriage. The realm takes note.` });
    return yes(`Your house is joined to ${H.name} by marriage.`);
  }
  if (id === 'tribute') {
    const ratio = w.strength(0) / Math.max(1, w.strength(h));
    d.opinion -= 20;
    if (ratio < 2 || w.rand() < (H.trait === 'hothead' ? 0.6 : 0.2)) {
      if (w.rand() < 0.5) w.declareWar(h, 0, false, `Tribute refused. ${oddsOn(w, H, 0)}`);
      return no(`${H.lord} refuses to pay. “Come and take it.”`);
    }
    const n = Math.round(Math.min(300, 60 + H.gold * 0.3));
    H.gold = Math.max(0, H.gold - n);
    me.gold += n;
    return yes(`${H.name} pays you ${n} gold in tribute.`);
  }
  if (id === 'claim') {
    if (!canBack(w, h)) return no(`${H.lord} will not back you yet.`);
    d.backs = true;
    w.chron(`${H.lord} named you the rightful king.`);
    w.hooks.herald?.({ house: H, title: `${H.lord} backs your claim`, text: 'Another great house names you the rightful king.' });
    w.checkEnd();
    return yes(`${H.name} backs your claim to the crown.`);
  }
  if (id === 'war') {
    if (w.time < d.truceUntil || d.allied || d.married) {
      d.broken++;
      grudge(w, h, 'broke');
      for (const o of FACTIONS) if (w.dip[o.index] && o.index !== 0) w.dip[o.index].opinion -= 10;
      w.log('The realm marks that you broke your word.', 1);
    }
    Object.assign(d, { allied: false, backs: false, vassal: false, truceUntil: 0, score: 0 });
    H.vassalOf = undefined;
    w.declareWar(0, h);
    return yes(`You are at war with ${H.name}.`);
  }
  return no('');
}

// What declaring war on house h would cost you, said before you do it: a list of plain
// lines (the march-on prompt and anything else that asks first).
export function warCost(w, h) {
  const H = FACTIONS[h], d = w.dip[h], out = [];
  const paid = d.paidUntil > w.time, truce = w.time < d.truceUntil;
  if (paid) out.push(`it breaks the peace you paid them tribute for, and every house will think less of you`);
  else if (truce) out.push(`it breaks your truce with them (${Math.ceil((d.truceUntil - w.time) / 60)} min left), and every house will think less of you`);
  if (d.married) out.push(`it betrays your marriage to ${H.name}, and every house will think less of you`);
  else if (d.allied) out.push(`it betrays your alliance with ${H.name}, and every house will think less of you`);
  if (d.vassal) out.push(`${H.lord} is sworn to you, and will be no longer`);
  if (d.backs && !d.vassal) out.push(`${H.lord} will stop backing your claim to the crown`);
  const friends = FACTIONS.filter(o => o.index !== h && o.index !== 0 && !o.bandit && o.alive && (w.dip[o.index]?.allied || w.dip[o.index]?.vassal) && !w.atWar(h, o.index));
  if (friends.length) out.push(`${friends.map(o => o.name).join(' and ')} will join you against them`);
  out.push(`${H.name} has about ${Math.round(w.strength(h))} men under arms to your ${Math.round(w.strength(0))}`);
  return out;
}

// Houses at peace with you that may not be attacked yet, or that are bound to you.
export function protectedFrom(w, h, by) {
  if (!w.dip) return false;
  const [me, them] = by === 0 ? [0, h] : h === 0 ? [0, by] : [null, null];
  if (me === null) return false;
  const d = w.dip[them];
  return w.time < d.truceUntil || d.allied || d.married || d.vassal || (by !== 0 && d.opinion > 30);
}

// Houses backing your claim, vassals included.
export const backers = w => (w.dip ? FACTIONS.filter(h => w.dip[h.index]?.backs && h.alive) : []);
