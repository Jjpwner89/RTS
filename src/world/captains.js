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
import { grudge, offerResting, offerDeclined } from './diplomacy.js';

const FIRST = ['Aldric', 'Bennet', 'Corin', 'Dunstan', 'Emeric', 'Garrick', 'Hugh', 'Jory', 'Kester', 'Leofric', 'Merek', 'Osbert',
  'Piers', 'Roland', 'Sewell', 'Tobin', 'Warin', 'Ada', 'Bryony', 'Elswyth', 'Gunnora', 'Hawise', 'Joan', 'Mabel'];
const LAST = ['Hale', 'Brand', 'Ashdown', 'Fletcher', 'Grimsby', 'Holt', 'Kemp', 'Lacy', 'Marsh', 'Norris', 'Oakes', 'Pike',
  'Redmayne', 'Strand', 'Tallis', 'Vance', 'Wolde', 'Yarrow'];
const HEIRS = ['Young Edwin', 'Young Aelis', 'Young Robert', 'Young Isabel', 'Young Geoffrey', 'Young Eleanor'];
const MIN_MEN = 20;
export const HURT = 600;   // seconds your lord stays home after a bad wound

const living = w => (w.captains ||= []).filter(c => c.alive && c.captive === undefined);
export const captainOf = (w, a) => (a?.captain ? (w.captains || []).find(c => c.id === a.captain && c.alive && c.captive === undefined) || null : null);

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
  if (a.side !== 0 && H && !H.bandit && H.lordAlive !== false && H.captive === undefined && !w.armies.some(o => o !== a && !o.gone && o.lord === a.side)
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
  if (w.lordCaptive !== undefined && w.lordCaptive !== null) return { ok: false, why: `You are a prisoner of ${FACTIONS[w.lordCaptive]?.name}` };
  if (w.lordHurt > w.time) return { ok: false, why: `Your lord is mending for ${Math.ceil((w.lordHurt - w.time) / 60)} min` };
  if (a.lord === 0) { a.lord = null; return { ok: true, text: 'Your lord rides home.' } }
  if (!a.at || a.at.owner !== 0) return { ok: false, why: 'Only from one of your own places' };
  for (const o of w.armies) if (o.lord === 0) o.lord = null;
  a.lord = 0;
  return { ok: true, text: `You ride with ${a.name}.` };
}

// After a battle the player was in: captains' reports, and what became of any lord.
// won: whether you won it. The beaten side's captain and lord may be taken prisoner.
export function afterBattle(w, battle, armies, where, won = null) {
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
      } else if (won !== null && won !== mine && w.rand() < CAPTURE) {
        takePrisoner(w, C, mine ? armies[1].side : 0, a, where);
      } else if (mine && (rep.levelled || rep.trait)) {
        w.log(`Captain ${C.name}${rep.levelled ? ` is now level ${C.level}` : ''}${rep.levelled && rep.trait ? ', and' : ''}${rep.trait ? ` ${rep.traitName}` : ''}.`);
      }
    }
    const L = battle.lordReport(side);
    if (!L || a.lord === undefined || a.lord === null) continue;
    if (L.died) lordFell(w, a, where);
    // A wounded lord on the losing side is taken.
    else if (L.wounded && won !== null && won !== (side === 0)) lordTaken(w, a, side === 0 ? armies[1].side : 0, where);
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

// ---- prisoners and ransom ----
// A beaten side's captain may be taken (one time in three), and a lord wounded on the
// losing side always is. Their house offers gold for them now and then; your own are
// held to ransom the same way. c.captive is the side holding a captain; a house's lord
// held prisoner is H.captive (the holding side), and yours is w.lordCaptive.
const CAPTURE = 1 / 3, ASK_EVERY = 240;
const price = c => 60 + c.level * 45;
const LORD_PRICE = 350;

function takePrisoner(w, c, by, a, where) {
  c.captive = by;
  c.army = null;
  c.askedAt = w.time;
  a.captain = null;
  w.log(by === 0 ? `Captain ${c.name} of ${FACTIONS[c.side]?.name} is your prisoner.` : `Your captain ${c.name} was taken prisoner${where ? ` at ${where}` : ''}.`, by === 0 ? 0 : 1);
  w.chron?.(by === 0 ? `Captain ${c.name} of ${FACTIONS[c.side]?.name} was taken prisoner${where ? ` at ${where}` : ''}.` : `Your captain ${c.name} was taken prisoner${where ? ` at ${where}` : ''}.`);
}

function lordTaken(w, a, by, where) {
  const side = a.lord;
  a.lord = null;
  if (side === 0) {
    w.lordCaptive = by;
    w.lordAskedAt = w.time;
    w.log(`You were taken prisoner by ${FACTIONS[by]?.name}${where ? ` at ${where}` : ''}!`, 1);
    w.chron?.(`You were taken prisoner by ${FACTIONS[by]?.name}${where ? ` at ${where}` : ''}.`);
    return;
  }
  const H = FACTIONS[side];
  if (!H) return;
  H.captive = by;
  H.askedAt = w.time;
  w.log(`${H.lord} is your prisoner!`, 0);
  w.chron?.(`${H.lord} was taken prisoner${where ? ` at ${where}` : ''}.`);
  w.hooks.herald?.({ house: H, title: `${H.lord} is your prisoner`, text: `${H.name} will pay to have its lord back. Until then its great hosts march without him.` });
}

// Every few minutes each house offers ransom for its people you hold, and asks it for
// yours. Accept and the gold changes hands; refuse and they ask again later.
export function tickRansoms(w) {
  const me = FACTIONS[0];
  // (a ransom you turned down is not put to you again for a long while, as any declined offer: diplomacy.js)
  const put = (H, kind, o) => { if (!offerResting(w, H.index, kind)) w.hooks.offer?.({ house: H, ...o, decline: () => offerDeclined(w, H.index, kind) }); };
  for (const c of w.captains || []) {
    if (c.captive === undefined || !c.alive || w.time - (c.askedAt ?? 0) < ASK_EVERY) continue;
    c.askedAt = w.time;
    const H = FACTIONS[c.side === 0 ? c.captive : c.side], gold = price(c);
    if (!H?.alive) { if (c.side === 0) delete c.captive; else c.alive = false; continue; }
    if (c.captive === 0) put(H, `ransom:${c.name}`, { title: `${H.lord} offers ransom`, text: `${gold} gold for Captain ${c.name}, level ${c.level}, whom you hold.`,
      accept: () => { H.gold = Math.max(0, H.gold - gold); me.gold += gold; delete c.captive; w.log(`Captain ${c.name} goes home to ${H.name} for ${gold} gold.`); } });
    else if (c.side === 0) put(H, `ransom:${c.name}`, { title: `${H.lord} holds your captain`, text: `Captain ${c.name} will be sent home for ${gold} gold.`,
      accept: () => { if (me.gold < gold) return { text: `You have only ${Math.floor(me.gold)} gold.` }; me.gold -= gold; H.gold += gold; delete c.captive; w.log(`Captain ${c.name} is home, ransomed for ${gold} gold.`); return { text: `Captain ${c.name} is home.` }; } });
  }
  for (const H of FACTIONS) {
    if (H.captive !== 0 || !H.alive || w.time - (H.askedAt ?? 0) < ASK_EVERY) continue;
    H.askedAt = w.time;
    put(H, 'ransom-lord', { title: `${H.name} offers ransom for its lord`, text: `${LORD_PRICE} gold to send ${H.lord} home.`,
      accept: () => { H.gold = Math.max(0, H.gold - LORD_PRICE); me.gold += LORD_PRICE; delete H.captive; w.log(`${H.lord} goes home for ${LORD_PRICE} gold.`); w.chron?.(`${H.lord} was ransomed for ${LORD_PRICE} gold.`); } });
  }
  if (w.lordCaptive !== undefined && w.lordCaptive !== null && w.time - (w.lordAskedAt ?? 0) >= ASK_EVERY) {
    w.lordAskedAt = w.time;
    const H = FACTIONS[w.lordCaptive];
    if (!H?.alive) { w.lordCaptive = null; w.log('Your gaolers are broken; you walk free.'); return; }
    put(H, 'ransom-you', { title: `${H.lord} holds you`, text: `${LORD_PRICE} gold, and you go home. Until then you can ride with no army.`,
      accept: () => { if (me.gold < LORD_PRICE) return { text: `Your treasury has only ${Math.floor(me.gold)} gold.` }; me.gold -= LORD_PRICE; H.gold += LORD_PRICE; w.lordCaptive = null; w.log('You are ransomed and ride home.'); w.chron?.(`You were ransomed from ${H.name} for ${LORD_PRICE} gold.`); return { text: 'You are home.' }; } });
  }
}

// A line for the army panel.
export function captainLine(w, a) {
  const c = captainOf(w, a), out = [];
  if (a.lord !== null && a.lord !== undefined) out.push(a.lord === 0 ? 'You ride with this army' : `${lordName(w, a.lord)} rides with it`);
  if (c) out.push(`Captain ${c.name}, level ${c.level}${c.traits.length ? ` · ${c.traits.map(traitName).join(', ')}` : ''}`);
  return out.join('<br>');
}
export const captainMemory = (w, a) => (captainOf(w, a)?.memory || []).map(m => m.text).join('\n');
