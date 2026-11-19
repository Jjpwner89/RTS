// Captains: one named commander per army. Plain data only, so armies can be saved:
// { name, level, xp, alive, battles }. battle.js gives him a place in a regiment and
// works out his bonus; battle.captainReport() adds the xp a battle earned him.
import { captainLevel } from './battle.js';

const FIRST = ['Aldric', 'Bertram', 'Cedric', 'Edmund', 'Godfrey', 'Hugh', 'Osric', 'Ranulf', 'Roger', 'Walter', 'Gilbert', 'Aymer',
  'Baldwin', 'Conrad', 'Drogo', 'Everard', 'Fulk', 'Geoffrey', 'Hamon', 'Ivo', 'Lambert', 'Odo', 'Reynard', 'Simon', 'Tancred', 'Warin',
  'Agnes', 'Maud', 'Isabel', 'Joan'];
const LAST = ['of Thornbury', 'Ashdown', 'the Grey', 'Marlowe', 'of Holt', 'Redmayne', 'Fitzwalter', 'of the Ford', 'Blackwood', 'Harcourt',
  'Longsword', 'de Vere', 'of Elm Cross', 'Strand', 'Kettering', 'the Younger', 'Ironside', 'of Wyke', 'Pembury', 'Corbet'];

export function makeCaptain(rand = Math.random, { level = 1, name = null } = {}) {
  const pick = list => list[Math.floor(rand() * list.length)];
  const xp = level > 1 ? 40 * (level - 1) ** 2 : 0;
  return { name: name || `${pick(FIRST)} ${pick(LAST)}`, level: captainLevel(xp), xp, alive: true, battles: 0 };
}

// A line for the army panel: "Sir Aldric Ashdown, level 3".
export const captainTitle = c => c ? `${c.name}, level ${c.level}${c.alive ? '' : ' (fallen)'}` : 'No captain';
