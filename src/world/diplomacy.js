// Your dealings with the other houses: what each lord thinks of you, and the treaties
// between you. Peace, alliances, gifts, tribute, marriage and vassals, and in the end
// the great houses backing your claim to the crown, which is a way to win.
//
// Opinion runs from -100 (hatred) to 100 (devotion). It drifts toward what the lord
// feels about the state of things (war, borders, marriage, your strength, their bent)
// and jumps with gifts, victories and broken promises.
import { FACTIONS } from './world.js';

const BASE = { raider: -10, hothead: -5, schemer: 0, merchant: 10, builder: 10, turtler: 5 };
const TRUCE = 600;          // seconds after peace before either side may attack again
const GIFT = 100;
const DOWRY = 150;
// Coalitions, after Europa Universalis: when you hold too much of the realm, the houses
// that don't love you band together, make peace among themselves and come for you, and
// fall apart again when the threat has passed.
const LEAGUE_SHARE = 0.3;    // of the realm's places, held by you, that alarms them
const LEAGUE_EASE = 0.22;    // ... and below which they feel safe again
const LEAGUE_LONG = 2400;    // seconds a coalition holds together at most
const LEAGUE_REST = 1800;    // and before another can form

export function startDiplomacy(w) {
  w.dip = FACTIONS.map(h => ({ opinion: BASE[h.trait] ?? 0, gift: 0, truceUntil: 0, allied: false, married: false,
    backs: false, vassal: false, broken: 0, score: 0, warSince: 0, offerCd: 240 + w.rand() * 200 }));
  w.dipClock = 10;
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
  t += d.gift;
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
    if (!w.atWar(0, h)) d.warSince = 0;
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
function threat(w) {
  const mine = w.pois.filter(p => p.owner === 0).length / w.pois.length;
  const ratio = w.strength(0) / Math.max(1, ...great().map(H => w.strength(H.index)));
  return { mine, ratio };
}
export const leagued = (w, h) => !!w.coalition?.members.includes(h);

function thinkCoalition(w) {
  const C = w.coalition;
  if (C?.members.length) {
    // A house that makes peace with you, or is broken, has left it.
    C.members = C.members.filter(h => FACTIONS[h].alive && w.atWar(0, h));
    const { mine, ratio } = threat(w);
    const over = C.members.length < 2 ? 'has fallen apart' : mine < LEAGUE_EASE && ratio < 1.2 ? 'breaks up: you no longer frighten them' : w.time - C.since > LEAGUE_LONG ? 'has worn itself out' : null;
    if (over) {
      w.log(`The coalition against you ${over}.`, 1);
      w.coalition = { members: [], since: C.since, rest: w.time + LEAGUE_REST };
    }
    return;
  }
  if (w.crowned || w.time < (C?.rest ?? 1200)) return;
  const { mine, ratio } = threat(w);
  if (mine < LEAGUE_SHARE && !(ratio > 1.8 && mine > 0.2)) return;
  const join = great().filter(H => { const d = w.dip[H.index]; return !d.allied && !d.married && !d.vassal && !d.backs && d.opinion < 25; });
  if (join.length < 2) return;
  const ids = join.map(H => H.index);
  for (const a of ids) for (const b of ids) if (a < b) w.makePeace(a, b);
  for (const h of ids) { w.dip[h].truceUntil = 0; w.declareWar(h, 0, true); }
  w.coalition = { members: ids, since: w.time };
  const names = join.map(H => H.name).join(', ');
  w.log(`${names} have leagued together against you!`, 1);
  w.hooks.herald?.({ house: join[0], title: 'A coalition against you', text: `You hold ${Math.round(mine * 100)}% of the realm, and the lords are afraid. ${names} have made peace among themselves and declared war on you together. It will fall apart if you give back enough, make peace one by one, or simply outlast it.` });
}

// The AI's own proposals, which you accept or turn down.
function offerFrom(w, H, d) {
  const h = H.index, mine = w.strength(0), theirs = w.strength(h);
  const ask = (title, text, accept, decline) => { w.meet(h); w.hooks.offer?.({ house: H, title, text, accept, decline }); };
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
  } else if ((H.trait === 'raider' || H.trait === 'schemer') && theirs > mine * 1.8 && w.time > 600 && FACTIONS[0].gold >= 150 && w.time > (d.demanded ?? 0)) {
    d.demanded = w.time + 900;   // they do not ask again for a long while
    ask(`${H.lord} demands tribute`, `“Pay me 150 gold and my men will stay home.” Refuse, and ${H.lord} may come for it.`,
      () => { FACTIONS[0].gold -= 150; d.opinion += 15; d.truceUntil = Math.max(d.truceUntil, w.time + 400); w.log(`You paid ${H.name} 150 gold.`, 1); },
      () => { d.opinion -= 15; if (w.rand() < 0.5) w.declareWar(h, 0); });
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
    list.push({ id: 'vassal', label: 'Demand they bend the knee', ok: ratio > 2.5 || !H.seat || H.seat.owner !== h, why: 'They are not beaten enough' });
  } else {
    list.push({ id: 'gift', label: `Send a gift (${GIFT} gold)`, ok: gold >= GIFT, why: `Needs ${GIFT} gold` });
    if (!d.allied) list.push({ id: 'ally', label: 'Propose an alliance', ok: d.opinion >= 35, why: 'They are not friendly enough' });
    if (!d.married) list.push({ id: 'marry', label: `Propose a marriage (${DOWRY} gold)`, ok: d.opinion >= 25 && gold >= DOWRY, why: d.opinion < 25 ? 'They are not warm enough' : `Needs ${DOWRY} gold` });
    list.push({ id: 'tribute', label: 'Demand tribute', ok: ratio > 2 && !d.allied && !d.married, why: 'You are not strong enough to demand it' });
    if (!d.backs) list.push({ id: 'claim', label: 'Ask them to back your claim', ok: canBack(w, h), why: 'They need to be devoted, or bound to you and far weaker' });
    list.push({ id: 'war', label: truce ? 'Declare war (breaks the truce)' : d.allied || d.married ? 'Declare war (betrays them)' : 'Declare war', ok: true, warn: true });
  }
  return list;
}

// What a house at war asks to go home: more the stronger it is.
export function peacePrice(w, h) {
  return Math.min(1000, Math.max(150, Math.round((150 + w.strength(h) * 0.25) / 50) * 50));
}

function canBack(w, h) {
  const d = w.dip[h], ratio = w.strength(0) / Math.max(1, w.strength(h));
  return !w.atWar(0, h) && (d.vassal || (d.opinion >= 60 && (d.married || d.allied)) || (d.opinion >= 20 && ratio > 2.5));
}

// Carries out a proposal. `theirs` is true when the house proposed it and you accepted.
// Returns what happened, as a sentence.
export function act(w, h, id, theirs = false) {
  const H = FACTIONS[h], d = w.dip[h], me = FACTIONS[0];
  const yes = text => { w.log(text); return { ok: true, text }; };
  const no = text => ({ ok: false, text });
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
  if (id === 'vassal') {
    w.makePeace(0, h);
    Object.assign(d, { vassal: true, backs: true, truceUntil: Infinity, score: 0 });
    d.opinion = Math.max(d.opinion, 20);
    H.vassalOf = 0;
    w.hooks.herald?.({ house: H, title: `${H.name} bends the knee`, text: `${H.lord} is now your vassal and backs your claim.` });
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
    d.opinion += 10;
    return yes(`You are now allied with ${H.name}.`);
  }
  if (id === 'marry') {
    if (!theirs) {
      if (me.gold < DOWRY) return no('Not enough gold for the dowry.');
      if (d.opinion < 25) return no(`${H.lord} declines the match.`);
      me.gold -= DOWRY;
    }
    d.married = true;
    d.opinion += 30;
    w.hooks.herald?.({ house: H, title: 'A marriage alliance', text: `Your house and ${H.name} are joined by marriage. The realm takes note.` });
    return yes(`Your house is joined to ${H.name} by marriage.`);
  }
  if (id === 'tribute') {
    const ratio = w.strength(0) / Math.max(1, w.strength(h));
    d.opinion -= 20;
    if (ratio < 2 || w.rand() < (H.trait === 'hothead' ? 0.6 : 0.2)) {
      if (w.rand() < 0.5) w.declareWar(h, 0);
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
    w.hooks.herald?.({ house: H, title: `${H.lord} backs your claim`, text: 'Another great house names you the rightful king.' });
    w.checkEnd();
    return yes(`${H.name} backs your claim to the crown.`);
  }
  if (id === 'war') {
    if (w.time < d.truceUntil || d.allied || d.married) {
      d.broken++;
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
