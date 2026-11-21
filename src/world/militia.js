// Rival and free villages call their people out too (creator, 2026-11-20), by the same
// rule as your governor (governor.js): only to save the keep, when an assault outnumbers
// the men standing, never for a raid. Their people are a head count (p.eco.pop), so the
// militia joins the garrison for the fight as units of battle.js 'folk', and its dead come
// off that count afterwards. The survivors go back to work; they never join the garrison.

import { TYPES } from '../battle.js';

const MOST = 160;   // four regiments at most, so a great town's storm stays a fight
const count = units => units.reduce((n, u) => n + u.count, 0);

// The militia a place turns out against `attackers`, as units (none for a raid, a camp of
// outlaws or the north's strongholds). `H` is the owner's house (null for free folk).
export function turnOut(p, attackers, H) {
  const pop = Math.floor(Math.min(MOST, p.eco?.pop || 0));
  if (p.town || pop < 5 || ['camp', 'warcamp', 'pass'].includes(p.kind) || H?.bandit || H?.invader) return [];
  if (count(attackers) <= count(p.garrison)) return [];
  const per = TYPES.folk.count, k = Math.ceil(pop / per);
  return Array.from({ length: k }, (_, i) => ({ key: 'folk', count: Math.floor((i + 1) * pop / k) - Math.floor(i * pop / k), name: `People of ${p.name}`, militia: true }));
}

// After the fight: the dead come off the place's people. `left` is how many still stand;
// `share` is the part of the rest who died rather than scattered.
export function mourn(p, turned, left, share = 1) {
  const dead = Math.round(Math.max(0, count(turned) - left) * share);
  if (dead && p.eco) p.eco.pop = Math.max(5, p.eco.pop - dead);
  return dead;
}

// A garrison reckoned by world.resolve, without its militia. A beaten militia mostly
// scatters to its homes, so half of those the reckoning takes off are dead.
export function sendHome(p, turned, units) {
  if (!turned.length) return units;
  mourn(p, turned, count(units.filter(u => u.militia)), 0.5);
  return units.filter(u => !u.militia);
}
