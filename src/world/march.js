// How fast an army marches along a road, in world units a second, by what it is made of (creator, 2026-11-23: "marching
// should be slower from village to village … cavalry should march faster, that way you can have a rapid response force
// … this way raiders would have some time to plunder"). An army goes at the pace of its slowest unit's class: horse (and
// war dogs) fastest, foot slower, siege engines slowest. The same rule serves your armies, the houses', Norrhold's and
// the bandits'. The march sandbox (march.html) shows the settings side by side; A is the world as it has marched, one
// pace for everything, and is what the game runs on until one is chosen.
import { TYPES } from '../battle.js';
import { decreed } from './decrees.js';

export const MARCH = {
  A: { key: 'A', name: 'As now: one pace for all', foot: 6, horse: 6, engine: 6 },
  B: { key: 'B', name: 'Slower, horse well ahead', foot: 3.5, horse: 7, engine: 2.5 },
  C: { key: 'C', name: 'Slowest, horse still brisk', foot: 2.4, horse: 6, engine: 1.6 },
};
export const MARCH_LIVE = MARCH.A;

// 'horse', 'foot' or 'engine': the slowest class among an army's units (foot for an army with no units to speak of).
export function marchClass(units) {
  let slow = 'horse', any = false;
  for (const u of units || []) {
    const T = TYPES[u.key];
    if (!T || !(u.count > 0)) continue;
    any = true;
    const c = T.engine ? 'engine' : T.mounted || T.dog ? 'horse' : 'foot';
    if (c === 'engine' || (c === 'foot' && slow === 'horse')) slow = c;
  }
  return any ? slow : 'foot';
}

export const marchPace = (setting, units) => setting[marchClass(units)];

// Road distance an army covers in a second: its pace, the snow, the king's roads (yours), and a rout's haste.
export const armyStep = (w, a, setting = w.march || MARCH_LIVE) =>
  marchPace(setting, a.units) * (a.retreating ? 1.1 : 1) * (w.winter ? 0.85 : 1) * (a.side === 0 && decreed(w, 'roads') ? 1.2 : 1);
