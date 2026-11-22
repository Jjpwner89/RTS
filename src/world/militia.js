// Rival and free villages call their people out too (creator, 2026-11-20), by the same
// rule as your governor (governor.js): only to save the keep, when an assault outnumbers
// the men standing, never for a raid. Their people are a head count (p.eco.pop), so the
// militia joins the garrison for the fight as units of battle.js 'folk', and its dead come
// off that count afterwards. The survivors go back to work; they never join the garrison.
// Against hopeless odds they don't turn out at all, and the place yields (creator,
// 2026-11-22: "they should run and survive rather than all stay to get massacred").

import { TYPES } from '../battle.js';
import { outmatched } from '../economy.js';

const MOST = 160;   // four regiments at most, so a great town's storm stays a fight
const count = units => units.reduce((n, u) => n + u.count, 0);

// The militia a place turns out against `attackers`, as units (none for a raid, a camp of
// outlaws or the north's strongholds). `H` is the owner's house (null for free folk).
export function turnOut(p, attackers, H) {
  if (!standsOrYields(p, H) || count(attackers) <= count(p.garrison)) return [];
  const folk = people(p);
  return outmatched([...p.garrison, ...folk], attackers) ? [] : folk;
}

// Would the place yield to `attackers` rather than fight? When its garrison and every one
// of its people together are under a third of the attackers' strength (economy.js
// outmatched), walled or not: its men march out under arms and the place changes hands
// whole. The same test for your places, a rival's and the free folk's.
export function yields(p, attackers, H) {
  return standsOrYields(p, H) && outmatched([...p.garrison, ...people(p)], attackers);
}

// (a raid, a camp of outlaws, the north's strongholds and outlaws' or the north's own
// places fight it out as ever)
export const standsOrYields = (p, H) => !p.town && !['camp', 'warcamp', 'pass'].includes(p.kind) && !H?.bandit && !H?.invader;

function people(p) {
  const pop = Math.floor(Math.min(MOST, p.eco?.pop || 0));
  if (pop < 5) return [];
  const per = TYPES.folk.count, k = Math.ceil(pop / per);
  return Array.from({ length: k }, (_, i) => ({ key: 'folk', count: Math.floor((i + 1) * pop / k) - Math.floor(i * pop / k), name: `People of ${p.name}`, militia: true }));
}

// Of a place's people, the share who stay on when it changes hands, for every house and
// for you alike: seven in ten when it is taken by storm, nearly nine in ten when it yields.
// The rest have fled, not died. A house's people (yours too) go to its nearest other place
// and join its people there (world.js leave, takeIn). Free folk, or a house with nowhere
// else, drift home over a few minutes while the place is fed and safe (driftHome), and
// after ten minutes those still away have settled elsewhere.
export const STAY = { storm: 0.7, yielded: 0.88 };
const BACK = 180, GONE = 600;

// How many of `pop` stay when the place is taken `how` ('storm' or 'yielded'), and the
// record of those who fled, for the place (a town's t.fled, a holding's e.fled).
export function handOver(pop, how) {
  const stay = Math.round(pop * STAY[how]), fled = Math.max(0, Math.round(pop) - stay);
  return { stay, fled, away: fled >= 1 ? { n: fled, rate: fled / BACK, left: GONE } : null };
}

// Those who fled a lost place to their house's next one, `holder` (a town or a holding's
// eco): they come in over a few minutes while it is fed and safe, crowded or not (they have
// nowhere else), and join its people.
export function takeIn(holder, n, from) {
  const m = (holder.fled?.n || 0) + n;
  holder.fled = { n: m, rate: m / BACK, left: GONE, from };
}

// Those who fled coming home: how many this step (a fraction; a town counts whole people).
// Only while `ok`, the place fed and no enemy at it.
export function driftHome(holder, dt, ok) {
  const f = holder.fled;
  if (!f) return 0;
  f.left -= dt;
  const back = ok ? Math.min(f.n, f.rate * dt) : 0;
  f.n -= back;
  if (f.n < 0.01 || f.left <= 0) holder.fled = null;
  return back;
}

export const fledWord = (n, where) => `${n} of ${where}'s people fled; they will come back if it is fed and safe.`;

// After the fight: the dead come off the place's people. `left` is how many still stand;
// `share` is the part of the rest who died rather than scattered.
export function mourn(p, turned, left, share = 1) {
  const dead = Math.round(Math.max(0, count(turned) - left) * share);
  if (dead && p.eco) p.eco.pop = Math.max(Math.min(5, p.eco.pop), p.eco.pop - dead);
  return dead;
}

// A garrison reckoned by world.resolve, without its militia. A beaten militia mostly
// scatters to its homes, so half of those the reckoning takes off are dead.
export function sendHome(p, turned, units) {
  if (!turned.length) return units;
  mourn(p, turned, count(units.filter(u => u.militia)), 0.5);
  return units.filter(u => !u.militia);
}
