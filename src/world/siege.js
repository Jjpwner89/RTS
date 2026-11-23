// A house's siege train, on your rules (Orchestrator, 2026-11-22: houses had rams, ladders and
// stone-throwers for nothing, and only against you). To storm a walled place, yours or a
// house's, it raises a siege workshop at the place its host gathers (your workshop's cost, in
// that place's building turn), builds each engine there for your engine's cost (economy.js
// ENGINES), one a building turn, from that place's stores and then its house's other places',
// and crews it from that place's people, who stand by it and go with the host. A walled place stormed
// with no engine counts its defenders ×1.4 (World.bareWalls), so until its train is built the
// house reckons the place so, and once it has one, as it stands.
import { FACTIONS, WALLED, walledPlace } from './world.js';
import { ENGINES, BUILDINGS } from '../economy.js';
import { keepAtWork, feedMen } from './holdings.js';

// What a host takes against walls: a ram and ladders, stone-throwers later on (the minute
// gates the houses always had: you have no rank rule for engines), a trebuchet for a patient
// house. The first it can't build is left out; ladders alone will do.
const KIT = (w, h) => ['ram', 'ladder', ...(w.time > 1500 ? ['mangonel'] : []),
  ...(w.time > 2400 && (h.trait === 'turtler' || h.trait === 'builder') ? ['trebuchet'] : [])];
export const ENGINE_EVERY = 40;   // seconds an engine takes at a workshop (holdings.js BUILD_EVERY, a building turn)

const real = p => p?.eco?.buildings && !p.town;
// Where its engines are built and crewed: the place its host gathers at, or if that is a camp
// or a place with no works of its own, the house's nearest real place to it.
const yardFor = (w, h, S) => real(S) && S.owner === h.index ? S : theirsNear(w, h, S);
const theirsNear = (w, h, S) => w.pois.filter(q => q.owner === h.index && real(q)).map(q => [q, w.route(S, q).length]).filter(([, d]) => d < Infinity).sort((a, b) => a[1] - b[1])[0]?.[0] || null;
const theirs = (w, h, S) => [S, ...w.pois.filter(q => q !== S && q.owner === h.index && real(q)).sort((a, b) => w.route(S, a).length - w.route(S, b).length)];
const have = (w, h, S, g) => theirs(w, h, S).reduce((n, q) => n + (q.eco.stock[g] || 0), 0);
// Paid from the gathering place first, then the house's nearest places.
function pay(w, h, S, cost) {
  if (Object.entries(cost).some(([g, n]) => have(w, h, S, g) < n)) return false;
  const spent = ((h.ai ||= {}).siegeSpent ||= {});
  for (const [g, n] of Object.entries(cost)) {
    let left = n;
    for (const q of theirs(w, h, S)) { const k = Math.min(left, q.eco.stock[g] || 0); if (k) q.eco.stock[g] -= k; left -= k; if (left <= 0) break; }
    spent[g] = (spent[g] || 0) + n;
  }
  return true;
}
// Crews are villagers, as yours are: any of its people down to those a deep draft leaves at
// work (holdings.js keepAtWork), not only those beyond the field share it keeps at home.
const crewFree = S => Math.max(0, Math.floor(S.eco.pop - keepAtWork(S.eco, true)));
const held = S => Object.values(S.eco?.engines || {}).reduce((n, k) => n + k, 0);

// Each think while its host gathers against T at S: works on the train, and says how strong
// T is to it: its walls count ×1.4 (World.defence for a house's place; your village's own
// walls by the same rule) until an engine is ready to go with the host.
export function siegeReady(w, h, T, S) {
  const d = w.defence(T);
  S = yardFor(w, h, S);
  if (!walledPlace(T) || !S) return d;
  prepare(w, h, S);
  const bare = T.town ? d * WALLED : d;
  return yards(w, h).length ? bare / WALLED : bare;
}

// The workshop (in the place's own building turn, holdings.js nextBuild), then its engines.
export function prepare(w, h, S) {
  const e = S.eco;
  if (!e.buildings.siegeworks) { e.wantWorks = true; return; }
  if (e.wantWorks) {   // (raised for this: its cost goes on the house's siege bill)
    e.wantWorks = false;
    const spent = ((h.ai ||= {}).siegeSpent ||= {});
    for (const [g, n] of Object.entries(BUILDINGS.siegeworks.cost)) spent[g] = (spent[g] || 0) + n;
  }
  e.engines ||= {};
  if ((e.wrightAt ?? -1e9) > w.time) return;
  // the first on its list it can crew and pay for; one it can't yet is passed over for the
  // next (one of each for the house: an engine built at another of its places marches too)
  const has = k => yards(w, h).some(q => q.eco.engines[k]);
  const k = KIT(w, h).find(k => !has(k) && crewFree(S) >= ENGINES[k].crew && pay(w, h, S, ENGINES[k].cost));
  if (!k) return;
  // its crew leave their work to stand by it, as yours become its regiment when it is built
  e.engines[k] = 1;
  e.pop -= ENGINES[k].crew;
  e.crews = (e.crews || 0) + ENGINES[k].crew;
  e.wrightAt = w.time + ENGINE_EVERY;
  if (S.visible) w.log(`${h.name} has built a ${ENGINES[k].name.toLowerCase()} at ${S.name}.`, 2);
}

// The house's places with engines built and waiting, nearest the muster first.
const yards = (w, h, S = null) => w.pois.filter(q => q.owner === h.index && real(q) && held(q)).sort((a, b) => (S ? w.route(S, a).length - w.route(S, b).length : 0));

// The host marches: the engines the house has built go with it, each with a full crew of the
// people of the place that built it: those standing by it, and if some have gone back to work,
// others from its people a draft could take.
export function takeTrain(w, h, S, T, name = h.short) {
  if (!walledPlace(T)) return [];
  return yards(w, h, S).flatMap(q => fromYard(h, q, name));
}
function fromYard(h, S, name) {
  const e = S.eco, out = [];
  for (const [k, n] of Object.entries(e.engines)) for (let i = 0; i < n; i++) {
    const by = Math.min(ENGINES[k].crew, Math.floor(e.crews || 0)), more = Math.min(ENGINES[k].crew - by, crewFree(S)), crew = by + more;
    if (crew < ENGINES[k].crew) continue;
    e.crews = (e.crews || 0) - by; e.pop -= more; e.engines[k]--;
    out.push({ key: k, count: crew, name: `${name} ${ENGINES[k].name.toLowerCase()}` });
  }
  for (const k of Object.keys(e.engines)) if (!e.engines[k]) delete e.engines[k];
  return out;
}

// A league against you (diplomacy.js raiseHost): each member keeps a train ready at its place
// nearest your seat while the league stands, and the league's host takes them all.
const nearestTo = (w, h, T) => w.pois.filter(q => q.owner === h.index && real(q)).map(q => [q, w.route(q, T).length]).filter(([, d]) => d < Infinity).sort((a, b) => a[1] - b[1])[0]?.[0];
export function thinkSiege(w, h) {
  const T = w.home;
  if (!w.coalition?.members?.includes(h.index) || !T || !walledPlace(T)) return;
  const S = nearestTo(w, h, T);
  if (S) prepare(w, h, S);
}
export function leagueTrain(w, members, T) {
  if (!walledPlace(T)) return [];
  return w.pois.filter(q => members.includes(q.owner) && real(q) && held(q)).flatMap(q => fromYard(FACTIONS[q.owner], q, 'League'));
}

// A house's host home again (or engines left in a garrison by an older save): each engine goes back
// into the place's yard with its crew, standing by for the next siege; at a camp, with no
// yard, the crew go to its people and the engine is broken up. Crews standing by eat from
// the place's stores as its garrison does; those it can't feed go back to work, six at a
// time as its garrison stands down (world.js tickEconomy).
export function crewsHome(p, dt = 0) {
  const e = p.eco;
  // Yours keeps no house's yard: crews left by its old lord go back to its people, and your
  // own engines stay yours in its garrison.
  if (p.owner === 0) { if (e?.crews) { e.pop += e.crews; e.crews = 0; delete e.engines; } return; }
  if (e?.crews > 0 && dt > 0) {
    const unfed = Math.min(e.crews, feedMen(e, e.crews, dt));
    if (unfed >= 1) { const n = Math.min(Math.ceil(unfed), 6, e.crews); e.crews -= n; e.pop += n; }
  }
  if (!e || !p.garrison?.some(u => ENGINES[u.key])) return;
  for (const u of p.garrison) if (ENGINES[u.key]) {
    if (real(p)) { (e.engines ||= {})[u.key] = (e.engines[u.key] || 0) + 1; e.crews = (e.crews || 0) + u.count; }
    else e.pop += u.count;
  }
  p.garrison = p.garrison.filter(u => !ENGINES[u.key]);
}

export const spentOn = h => ({ ...(h.ai?.siegeSpent || {}) });
export const housesSpent = () => FACTIONS.filter(h => h.ai?.siegeSpent).map(h => [h.short, spentOn(h)]);
