// Named captains and the lords in the field. Every army of twenty men or more marches
// under a captain: an idle one of its house if there is one, else a new man. He rides
// with its best regiment in battle (battle.js setCaptain), gains levels and traits there
// (captainReport) and keeps a short memory; he can fall. When his army goes into a
// garrison he waits there for the next muster.
//
// A lord can ride too (a.lord = his house's index): yours with the one army you choose,
// a rival's with its great hosts (Dunmore's with every host of his). In battle he is
// battle.js's setLord; on the map the army that carries him shows his banner (Art).
//
// w.captains holds every captain; an army holds its captain's id (a.captain).
import { FACTIONS, headcount } from './world.js';
import { traitName } from '../battle.js';
import { grudge } from './diplomacy.js';

const FIRST = ['Aldric', 'Bennet', 'Corin', 'Dunstan', 'Emeric', 'Garrick', 'Hugh', 'Jory', 'Kester', 'Leofric', 'Merek', 'Osbert',
  'Piers', 'Roland', 'Sewell', 'Tobin', 'Warin', 'Ada', 'Bryony', 'Elswyth', 'Gunnora', 'Hawise', 'Joan', 'Mabel'];
const LAST = ['Hale', 'Brand', 'Ashdown', 'Fletcher', 'Grimsby', 'Holt', 'Kemp', 'Lacy', 'Marsh', 'Norris', 'Oakes', 'Pike',
  'Redmayne', 'Strand', 'Tallis', 'Vance', 'Wolde', 'Yarrow'];
const HEIRS = ['Young Edwin', 'Young Aelis', 'Young Robert', 'Young Isabel', 'Young Geoffrey', 'Young Eleanor'];
const MIN_MEN = 20;
export const HURT = 600;   // seconds your lord stays home after a bad wound

const living = w => (w.captains ||= []).filter(c => c.alive);
export const captainOf = (w, a) => (a?.captain ? (w.captains || []).find(c => c.id === a.captain && c.alive) || null : null);

export function makeCaptain(w, side) {
  const r = () => w.rand();
  const first = FIRST[Math.floor(r() * FIRST.length)];
  const c = { id: (w.captainId = (w.captainId || 0) + 1), side, name: `${first} ${LAST[Math.floor(r() * LAST.length)]}`,
    level: 1, xp: 0, alive: true, battles: 0, traits: [], memory: [], army: null };
  (w.captains ||= []).push(c);
  return c;
}

// A new army takes the best idle captain of its house, or a new one.
export function assignCaptain(w, a) {
  if (a.wagon || a.mode === 'wagon' || headcount(a.units) < MIN_MEN) return;
  const idle = living(w).filter(c => c.side === a.side && !c.army).sort((x, y) => y.xp - x.xp)[0];
  const c = idle || makeCaptain(w, a.side);
  c.army = a.id;
  a.captain = c.id;
  // A rival's lord rides with its great hosts; Dunmore's with every host of his.
  const H = FACTIONS[a.side];
  if (a.side !== 0 && H && !H.bandit && H.lordAlive !== false && !w.armies.some(o => o !== a && !o.gone && o.lord === a.side)
    && (H.trait === 'hothead' ? a.mode !== 'raid' : headcount(a.units) >= 120)) a.lord = a.side;
}

// The army is gone (into a garrison, beaten, scattered): its captain waits for the next.
export function releaseCaptain(w, a) {
  const c = captainOf(w, a);
  if (c) c.army = null;
}

// The name a lord goes by in the field.
export function lordName(w, side) {
  if (side === 0) return `The Lord of ${(FACTIONS[0].seat || w.home)?.name || 'your house'}`;
  return FACTIONS[side]?.lord || 'The enemy lord';
}

// Your lord rides with army a, or comes home.
export function ride(w, a) {
  if (w.lordHurt > w.time) return { ok: false, why: `Your lord is mending for ${Math.ceil((w.lordHurt - w.time) / 60)} min` };
  if (a.lord === 0) { a.lord = null; return { ok: true, text: 'Your lord rides home.' } }
  if (!a.at || a.at.owner !== 0) return { ok: false, why: 'Only from one of your own places' };
  for (const o of w.armies) if (o.lord === 0) o.lord = null;
  a.lord = 0;
  return { ok: true, text: `You ride with ${a.name}.` };
}

// After a battle the player was in: captains' reports, and what became of any lord.
export function afterBattle(w, battle, armies, where) {
  for (const side of [0, 1]) {
    const a = armies[side];
    if (!a) continue;
    const foeSide = armies[1 - side]?.side;
    const foe = side === 0 ? FACTIONS[foeSide]?.short : 'you';
    const rep = battle.captainReport(side, { where, foe, at: Math.round(w.time) });
    if (rep) {
      const C = rep.captain, mine = side === 0;
      if (rep.died) {
        C.army = null;
        a.captain = null;
        w.log(mine ? `Your captain ${C.name} fell${where ? ` at ${where}` : ''}.` : `The enemy captain ${C.name} fell${where ? ` at ${where}` : ''}.`, mine ? 1 : 0);
        if (!mine && where) grudge(w, a.side, 'captain', where);
      } else if (mine && (rep.levelled || rep.trait)) {
        w.log(`Captain ${C.name}${rep.levelled ? ` is now level ${C.level}` : ''}${rep.levelled && rep.trait ? ', and' : ''}${rep.trait ? ` ${rep.traitName}` : ''}.`);
      }
    }
    const L = battle.lordReport(side);
    if (!L || a.lord === undefined || a.lord === null) continue;
    if (L.died) lordFell(w, a, where);
    else if (L.wounded && a.lord === 0) { w.lordHurt = w.time + HURT; a.lord = null; w.log('Your lord is wounded and carried home to mend.', 1); }
  }
}

// A lord falls in battle. Yours is carried from the field gravely hurt (you are the
// house; the campaign goes on); a rival's heir takes up the banner, and the house reels.
function lordFell(w, a, where) {
  const side = a.lord;
  a.lord = null;
  if (side === 0) {
    w.lordHurt = w.time + HURT * 2;
    w.log(`You were struck down${where ? ` at ${where}` : ''}, and carried from the field more dead than alive.`, 1);
    w.chron?.(`You were struck down${where ? ` at ${where}` : ''} and carried from the field.`);
    return;
  }
  const H = FACTIONS[side];
  if (!H) return;
  const was = H.lord;
  H.lord = `${HEIRS[Math.floor(w.rand() * HEIRS.length)]} ${H.short}`;
  H.lordAlive = true;
  H.mourning = w.time + 900;
  H.grudges = (H.grudges || []).filter(g => g.kind !== 'father');
  grudge(w, side, 'father', where || 'the battle');
  w.log(`${was} has fallen${where ? ` at ${where}` : ''}! ${H.lord} takes up the banner of ${H.name}.`, 0);
  w.chron?.(`${was} fell${where ? ` at ${where}` : ''}, and ${H.lord} took up the banner of ${H.name}.`);
  w.hooks.herald?.({ house: H, title: `${was} is dead`, text: `Fallen in battle${where ? ` at ${where}` : ''}. ${H.lord} is lord of ${H.name} now, and the house is shaken.` });
}

// A line for the army panel.
export function captainLine(w, a) {
  const c = captainOf(w, a), out = [];
  if (a.lord !== null && a.lord !== undefined) out.push(a.lord === 0 ? 'You ride with this army' : `${lordName(w, a.lord)} rides with it`);
  if (c) out.push(`Captain ${c.name}, level ${c.level}${c.traits.length ? ` · ${c.traits.map(traitName).join(', ')}` : ''}`);
  return out.join('<br>');
}
export const captainMemory = (w, a) => (captainOf(w, a)?.memory || []).map(m => m.text).join('\n');
