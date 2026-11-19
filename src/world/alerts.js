// What needs you, worst first: one list on the map, after Stellaris's outliner. Each
// alert names a place or an army to look at. Worked out fresh from the world's state, so
// an alert goes away by itself when its trouble does.
//
// Levels: 5 a village of yours is being fought in, 4 enemies marching on you or a revolt,
// 3 hunger and pay, 2 grumbling, 1 good to know.
import { FACTIONS, headcount } from './world.js';
import { foodLeft } from './supply.js';
import { living, opinion } from './vassals.js';

const SPEED = 6;   // world.js: road speed

const mins = s => s < 60 ? 'under a minute' : `${Math.round(s / 60)} min`;

// Road distance still to go for an army.
function ahead(a) {
  let d = 0, x = a.x, z = a.z;
  for (const p of a.path) { d += Math.hypot(p.x - x, p.z - z); x = p.x; z = p.z; }
  return d;
}

export function alerts(w) {
  const out = [];
  const add = (level, text, at, icon) => out.push({ level, text, at, icon });

  for (const p of w.pois) {
    const t = p.town;
    if (p.owner !== 0 || !t) continue;
    if (t.underAttack) {
      const n = t.attackers.reduce((k, g) => k + g.regs.reduce((j, r) => j + (r.gone ? 0 : r.alive), 0), 0);
      add(5, `${p.name} is under attack${n ? ` by ${n} men` : ''}`, p, 'siege');
    }
    if (t.revolt) add(4, `${p.name} is in revolt`, p, 'warning');
    else if (t.misery > 30) add(3, `${p.name} is close to revolt (mood ${Math.round(t.mood)})`, p, 'people');
    if (t.hungry) add(3, `${p.name} is running out of food`, p, 'food');
  }

  // Enemy columns you can see, marching on a place of yours.
  for (const a of w.armies) {
    if (a.gone || a.side === 0 || a.wagon || !a.visible || a.retreating) continue;
    const to = a.target;
    if (!to || to.owner !== 0) continue;
    const eta = ahead(a) / SPEED;
    const raid = a.mode === 'raid' || FACTIONS[a.side]?.bandit;
    add(4, `${a.name} (${headcount(a.units)}) ${raid ? 'raiding toward' : 'marching on'} ${to.name}, ${mins(eta)} away`, a, raid ? 'raid' : 'invader');
  }

  // Your own armies: storming, hungry.
  for (const p of w.pois) if (p.town?.hostile) add(3, `Your men are storming ${p.name}`, p, 'castle');
  for (const a of w.armies) {
    if (a.gone || a.side !== 0 || a.wagon) continue;
    const left = foodLeft(w, a);
    if (left <= 0) add(4, `${a.name} is starving: men are deserting`, a, 'food');
    else if (left < 120) add(3, `${a.name} has food for ${mins(left)}`, a, 'food');
  }

  for (const c of w.companies || []) {
    if (c.employer !== 0 || !c.unpaid) continue;
    add(c.grumbled ? 3 : 2, `${c.name[0].toUpperCase()}${c.name.slice(1)} are owed wages`, null, 'gold');
  }

  for (const v of living(w)) {
    const held = w.pois.find(p => p.vassal === v.id);
    if (v.landless) { add(1, `${v.name} waits at your court for land`, null, 'crown'); continue; }
    const foe = v.feud && w.vassals.find(o => o.id === v.feud);
    if (foe && v.id < foe.id) add(2, `${v.name} and ${foe.name} are feuding`, held, 'crown');
    if (v.refusing) add(3, `${v.name} refuses dues and men`, held, 'crown');
    else if (opinion(w, v).total <= -10) add(2, `${v.name} is resentful`, held, 'crown');
  }

  if (w.coalition?.members.length) add(3, `${w.coalition.members.length} houses are leagued against you: ${w.coalition.members.map(h => FACTIONS[h].short).join(', ')}`, null, 'invader');
  if (w.faction?.members.length >= 2) add(3, `${w.faction.members.length} vassals have formed a faction against you`, null, 'warning');

  // Good to know: an army of yours standing idle away from home.
  for (const a of w.armies) {
    if (a.gone || a.side !== 0 || a.wagon || a.path.length || !a.at || a.at.owner === 0) continue;
    add(1, `${a.name} waits for orders at ${a.at.name}`, a, 'map');
  }

  return out.sort((x, y) => y.level - x.level);
}

export const LEVEL_COLOR = ['', '#c9bfa8', '#e8c45a', '#e8904a', '#ff7a5a', '#ff4a3a'];
