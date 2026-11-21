// Your vassals: lords you give a village to, from the rank of Lord. A vassal runs his
// village on the same rules as every place you don't run yourself (holdings.js), pays
// you a share of what it earns and sends a share of its men when you call the banners.
// He has his own mind, after Crusader Kings: an opinion of you made of reasons you can
// read, a temper, and something he wants. Kept as one opinion number, after Crusader
// Kings 2, with the reasons on hover.
//
// w.vassals holds every lord; a place he holds has p.vassal = his id. Each lord keeps a
// short list of what happened to him (memory), for the chronicle and the director later.
//
// Trouble among them, after Crusader Kings: two vassals may fall into a feud (v.feud = the
// other's id) and look to you to judge it; the discontented band into one faction
// (w.faction) with a demand, and rise if you refuse it. A vassal may be imprisoned
// (v.prison) and later pardoned, landless (v.landless) until you give him a village.
import { worksPride } from './works.js';
import { decreeOpinion, decreed } from './decrees.js';
import { PAINTED } from './events.js';

export const DUES = [
  { name: 'Light', share: 0.15, mood: 10 },
  { name: 'Fair', share: 0.3, mood: 0 },
  { name: 'Heavy', share: 0.5, mood: -15 },
];
export const LEVIES = [
  { name: 'Light', share: 0.25, mood: 5 },
  { name: 'Fair', share: 0.45, mood: 0 },
  { name: 'Heavy', share: 0.7, mood: -10 },
];
export const COUNCIL = 3;           // seats at your table
export const GIFT = 100;
export const RECONCILE = 80;        // gold to make two feuding vassals shake hands
const FEUD_EVERY = 1200;            // a pair of vassals falls out about this often, one feud at a time
export const FACTION_ANGER = -10;   // at or below this a vassal joins a faction
export const ULTIMATUM = 180;       // seconds a faction of two or more waits before its demand
export const REFUSE = -25;          // below this they pay nothing and send nobody
export const HONOUR_EVERY = 600;    // a vassal can be honoured before your court this often
export const DEMAND_MIN = 30;       // gold a vassal must hold before you can demand some
export const FAVOURS = 2;                  // a vassal owes you at most this many favours
const WANT_KEPT = 900;              // a want met this long gives way to a new one
const CALL_AGAIN = 600;             // called to arms again sooner than this, they grumble
const PETITION_EVERY = [600, 900];  // seconds between petitions from your vassals
const AHEAD = 300;                  // how far outlook() looks

// What kind of man he is.
export const TEMPERS = {
  loyal: { name: 'loyal', base: 12, about: 'Keeps faith, and expects it kept.' },
  greedy: { name: 'greedy', base: 0, dues: 2, about: 'Counts every coin you take twice over.' },
  proud: { name: 'proud', base: -5, honour: 2, about: 'Lives on honours, and sulks without them.' },
  ambitious: { name: 'ambitious', base: -8, want: 2, about: 'Always wants more, and minds going without.' },
  content: { name: 'content', base: 6, about: 'Asks little and grumbles less.' },
};
// What they want. Each is met or not; unmet, it weighs on them more as time passes. Once
// met for a while (WANT_KEPT) they are grateful for good and want something new. `how`
// says what you can do about it.
export const WANTS = {
  land: { text: 'a second village', how: 'Grant them another of your villages', met: (w, v) => w.pois.filter(p => p.vassal === v.id).length >= 2 },
  seat: { text: 'a seat on your council', how: 'Seat them on your council', met: (w, v) => v.council },
  dues: { text: 'lighter dues', how: 'Set their dues to light', met: (w, v) => v.dues === 0 },
  peace: { text: 'peace with the great houses', how: 'Make peace with every house', met: w => ![...w.wars].some(k => k.startsWith('0:')) },
  glory: { text: 'a war to win glory in', how: 'Call them to arms, then take a place from a rival', met: (w, v, at = w.time) => at - (v.glory ?? -1e9) < 1200 },
  gold: { text: 'a gift of gold', how: 'Send them a gift', met: (w, v, at = w.time) => at - (v.gifted ?? -1e9) < 900 },
};

// What each is good at, and which seat of your council that suits.
export const KNACKS = {
  figures: { name: 'a head for figures', seat: 'steward' },
  war: { name: "a soldier's eye", seat: 'marshal' },
  tongue: { name: 'a smooth tongue', seat: 'envoy' },
};
// Your council: three seats, each doing one thing for the realm, in full when its holder
// has the knack for it and by half otherwise. A councillor refusing you does nothing.
export const SEATS = {
  steward: { name: 'Steward', knack: 'figures', full: 0.1, half: 0.05, does: n => `+${Math.round(n * 100)}% taxes from the villages you run` },
  marshal: { name: 'Marshal', knack: 'war', full: 0.25, half: 0.1, does: n => `Vassals send ${Math.round(n * 100)}% more men to your banners` },
  envoy: { name: 'Envoy', knack: 'tongue', full: 8, half: 4, does: n => `The great houses think ${n} better of you` },
};
export const seatHolder = (w, k) => living(w).find(v => v.seat === k && v.council);
export function seatPower(w, k) {
  const v = seatHolder(w, k), S = SEATS[k];
  return !v || v.refusing ? 0 : v.knack === S.knack ? S.full : S.half;
}

const FIRST = ['Aldous', 'Bertram', 'Cuthbert', 'Drogo', 'Edmund', 'Fulk', 'Godric', 'Hamon', 'Ivo', 'Jocelin', 'Lambert', 'Miles', 'Nigel',
  'Odo', 'Payn', 'Ralf', 'Simon', 'Turold', 'Walter', 'Alys', 'Beatrix', 'Cecily', 'Edith', 'Isolde', 'Matilda', 'Petronel'];
const LAST = ['Wren', 'Ashby', 'Colet', 'Dane', 'Ferrers', 'Gale', 'Harcourt', 'Lisle', 'Mallory', 'Neville', 'Orme', 'Pell', 'Quincey',
  'Rook', 'Stour', 'Thorne', 'Vane', 'Warrick', 'Bray', 'Crane'];
const COLORS = ['#b5654a', '#4a8fb5', '#8fae4a', '#b58f4a', '#7a5ab5', '#4ab59a', '#b54a7a', '#9a9a4a', '#5a6ab5', '#b5a04a'];

export function makeVassal(w, p) {
  const r = () => w.rand();
  // Names, and first names too, are not shared among the living, so no two read alike.
  const used = new Set(w.vassals.flatMap(v => v.gone ? [v.name] : [v.name, v.name.split(' ')[1]]));
  let name;
  for (let i = 0; i < 40 && (!name || used.has(name) || used.has(name.split(' ')[1])); i++) {
    const first = FIRST[Math.floor(r() * FIRST.length)];
    const lady = FIRST.indexOf(first) >= 19;
    name = `${lady ? 'Lady' : 'Sir'} ${first} ${LAST[Math.floor(r() * LAST.length)]}`;
  }
  const tempers = Object.keys(TEMPERS), wants = Object.keys(WANTS), knacks = Object.keys(KNACKS);
  const v = {
    id: (w.vassalId = (w.vassalId || 0) + 1), name, color: COLORS[(w.vassalId - 1) % COLORS.length],
    temper: tempers[Math.floor(r() * tempers.length)], want: wants[Math.floor(r() * wants.length)], wantSince: w.time,
    knack: knacks[Math.floor(r() * knacks.length)], seat: null, favours: 0,
    dues: 1, levy: 1, council: false, gold: 0, paid: 0, sent: 0, since: w.time, refusing: false,
    marks: [], memory: [],
  };
  w.vassals.push(v);
  remember(w, v, `Given ${p.name} by you`);
  mark(w, v, 20, `Given ${p.name}`, Infinity);
  return v;
}

export const vassalOf = (w, p) => (p?.vassal ? w.vassals.find(v => v.id === p.vassal) : null);
export const holdingsOf = (w, v) => w.pois.filter(p => p.vassal === v.id);
export const living = w => w.vassals.filter(v => !v.gone && !v.prison);
export const prisoners = w => w.vassals.filter(v => !v.gone && v.prison);

// Something he will remember for a while (or for good, with fade = Infinity).
export function mark(w, v, n, text, fade = 900) {
  v.marks.push({ n, text, at: w.time, fade });
}
export function remember(w, v, text) {
  v.memory.push({ at: Math.round(w.time), text });
  if (v.memory.length > 20) v.memory.shift();
}

// Their opinion of you, and why: [[points, reason], ...], biggest first. `at` looks ahead:
// marks fade and unmet wants and feuds weigh more as time passes.
export function opinion(w, v, at = w.time) {
  const T = TEMPERS[v.temper], why = [];
  const add = (n, text) => { n = Math.round(n); if (n) why.push([n, text]); };
  add(T.base, `${T.name[0].toUpperCase()}${T.name.slice(1)} by nature`);
  add(DUES[v.dues].mood * (DUES[v.dues].mood < 0 ? T.dues || 1 : 1), `${DUES[v.dues].name} dues`);
  add(LEVIES[v.levy].mood, `${LEVIES[v.levy].name} levies`);
  if (v.council) {
    add(15 * (T.honour || 1), `A seat on your council${v.seat ? ` as ${SEATS[v.seat].name.toLowerCase()}` : ''}`);
    if (v.seat && SEATS[v.seat].knack === v.knack) add(5, 'Trusted with what they do best');
  }
  const want = WANTS[v.want];
  if (want) {
    if (want.met(w, v, at)) add(10, `Has ${want.text}`);
    else add(-Math.min(12, (at - v.wantSince) / 60) * (T.want || 1), `Wants ${want.text}`);
  }
  // A feud you leave unjudged weighs on them more as it goes on.
  const foe = v.feud && w.vassals.find(o => o.id === v.feud);
  if (foe) add(-Math.min(15, (at - v.feudSince) / 60), `Feuding with ${foe.name}, and you do nothing`);
  // The proud and the ambitious mind a peer who holds more than they do.
  if ((T.honour || T.want) && !v.landless) {
    const mine = holdingsOf(w, v).length, rival = living(w).filter(o => o !== v).map(o => [o, holdingsOf(w, o).length]).sort((a, b) => b[1] - a[1])[0];
    if (rival && rival[1] > mine) add(-6, `Envies ${rival[0].name}, who holds more`);
  }
  // A vassal grown strong beside you starts to think themselves your equal.
  const pw = powerOf(w, v);
  if (pw.share >= 0.4) add(-8, 'Strong enough to think themselves your equal');
  // Marks fade evenly to nothing; those of the same reason add up.
  const sum = new Map();
  for (const m of v.marks) {
    const left = m.fade === Infinity ? 1 : Math.max(0, 1 - (at - m.at) / m.fade);
    if (left > 0) sum.set(m.text, (sum.get(m.text) || 0) + m.n * left);
  }
  for (const [text, n] of sum) add(n, text);
  for (const [text, n] of [...worksPride(w), ...decreeOpinion(w)]) add(n, text);
  why.sort((a, b) => Math.abs(b[0]) - Math.abs(a[0]));
  return { total: Math.max(-100, Math.min(100, why.reduce((n, [k]) => n + k, 0))), why };
}

// Their men, people and purse, and their men as a share of yours (for boldness and factions).
// Your men are counted once per moment of game time; it walks every place and army.
let menAt = -1, menMine = 0;
export function yourMen(w) {
  if (menAt === w.time) return menMine;
  menAt = w.time;
  menMine = w.pois.filter(p => p.owner === 0 && !p.vassal).reduce((n, p) => n + (p.town ? p.town.garrison().reduce((k, r) => k + r.alive, 0) : (p.garrison || []).reduce((k, u) => k + u.count, 0)), 0)
    + w.armies.filter(a => a.side === 0 && !a.wagon && !a.gone && !a.vassal).reduce((n, a) => n + a.units.reduce((k, u) => k + u.count, 0), 0);
  return menMine;
}
export function powerOf(w, v) {
  const held = holdingsOf(w, v);
  const men = held.reduce((n, p) => n + (p.garrison || []).reduce((k, u) => k + u.count, 0), 0)
    + w.armies.filter(a => a.vassal === v.id && !a.gone).reduce((n, a) => n + a.units.reduce((k, u) => k + u.count, 0), 0);
  const people = held.reduce((n, p) => n + (p.eco?.pop || 0), 0);
  return { men, people: Math.round(people), gold: Math.floor(v.gold || 0), places: held.length, share: men / Math.max(20, yourMen(w)) };
}

// Five minutes ahead: where their opinion is heading, and the trouble it will bring.
export function outlook(w, v) {
  const now = opinion(w, v).total, soon = opinion(w, v, w.time + AHEAD).total;
  let warn = null;
  if (v.landless) warn = null;
  else if (!v.refusing && now >= REFUSE && soon < REFUSE) warn = 'Will stop paying dues within five minutes';
  else if (now > FACTION_ANGER && soon <= FACTION_ANGER) warn = 'Will be ripe to join a faction within five minutes';
  return { now, soon, trend: soon - now, warn };
}

// The faction against you, or the makings of one: who is in it, who is close, their men
// against yours, and when they will make their demand.
export function factionView(w) {
  const F = w.faction, ids = F?.members || [];
  const members = ids.map(id => w.vassals.find(o => o.id === id)).filter(Boolean);
  const close = landed(w).filter(v => !ids.includes(v.id) && opinion(w, v).total <= FACTION_ANGER + 8);
  const men = members.reduce((n, v) => n + powerOf(w, v).men, 0);
  return { F, members, close, men, yours: yourMen(w), demandIn: F && !F.asked && members.length >= 2 ? Math.max(0, ULTIMATUM - (w.time - F.since)) : null };
}

// Forgotten marks are dropped, and a vassal who sours enough stops paying. Feuds start
// and burn out, and the discontented gather into a faction. dt: seconds since last time.
export function tickVassals(w, dt = 5) {
  for (const v of living(w)) {
    v.marks = v.marks.filter(m => m.fade === Infinity || w.time - m.at < m.fade);
    // Older saves: a knack, a named seat for a councillor, no favours yet.
    v.knack ??= Object.keys(KNACKS)[v.id % 3];
    v.favours ??= 0;
    if (v.council && !v.seat) v.seat = Object.keys(SEATS).find(k => !seatHolder(w, k)) || null;
    if (!v.council) v.seat = null;
    if (!holdingsOf(w, v).length && !v.landless) { v.gone = true; continue; }
    // A want met long enough is a debt of thanks paid; they find something new to want.
    const want = WANTS[v.want];
    if (want?.met(w, v)) {
      v.wantMet ??= w.time;
      if (w.time - v.wantMet > WANT_KEPT) {
        mark(w, v, 8, `You gave them ${want.text}`, 2400);
        newWant(w, v);
      }
    } else v.wantMet = null;
    if (v.landless) continue;
    const o = opinion(w, v).total;
    if (!v.refusing && o < REFUSE) {
      v.refusing = true;
      remember(w, v, 'Stopped paying dues');
      w.log(`${v.name} is too aggrieved to pay you dues or send men.`, 1);
    } else if (v.refusing && o >= REFUSE + 8) {
      v.refusing = false;
      w.log(`${v.name} pays their dues again.`);
    }
  }
  tickFeuds(w, dt);
  tickFaction(w);
  tickPetitions(w);
}

function newWant(w, v) {
  const left = Object.keys(WANTS).filter(k => k !== v.want && !WANTS[k].met(w, v));
  const pick = left.length ? left : Object.keys(WANTS).filter(k => k !== v.want);
  v.want = pick[Math.floor(w.rand() * pick.length)];
  v.wantSince = w.time;
  v.wantMet = null;
  remember(w, v, `Came to want ${WANTS[v.want].text}`);
  w.log(`${v.name} now wants ${WANTS[v.want].text}.`);
}

// A good turn they will repay: an owed favour lets a demand or a harder bargain pass
// without bad blood.
export function owe(w, v, why) {
  if ((v.favours || 0) >= FAVOURS) return;
  v.favours = (v.favours || 0) + 1;
  remember(w, v, `Owes you a favour for ${why}`);
}

const landed = w => living(w).filter(v => !v.landless && holdingsOf(w, v).length);
const near = (w, a, b) => Math.min(...holdingsOf(w, a).flatMap(p => holdingsOf(w, b).map(q => Math.hypot(p.x - q.x, p.z - q.z))));

function tickFeuds(w, dt) {
  const vs = landed(w);
  for (const v of vs) {
    const foe = v.feud && w.vassals.find(o => o.id === v.feud);
    if (v.feud && (!foe || foe.gone || foe.prison || foe.landless)) { endFeud(w, v, null); continue; }
    if (foe) {
      // They raid each other's fields: both villages bleed people a little.
      for (const p of holdingsOf(w, v)) if (p.eco) p.eco.pop = Math.max(10, p.eco.pop * (1 - 0.0004 * dt));
      // Left long enough, a feud burns itself out.
      if (w.time - v.feudSince > 1500 && v.id < foe.id && w.rand() < dt / 600) { w.log(`${v.name} and ${foe.name} have tired of their feud.`); endFeud(w, v, foe); }
    }
  }
  // One feud at a time, and a quiet spell after each; none under the king's peace.
  if (decreed(w, 'peace') || vs.some(v => v.feud) || vs.length < 2 || w.time - Math.max(0, ...w.vassals.map(v => v.feudSince ?? -1e9)) < FEUD_EVERY) return;
  for (const v of vs) {
    if (v.feud) break;
    const hot = TEMPERS[v.temper].want || TEMPERS[v.temper].honour ? 2 : 1;
    if (w.rand() >= dt / FEUD_EVERY * hot / vs.length) continue;
    const foe = vs.filter(o => o !== v).sort((a, b) => near(w, v, a) - near(w, v, b))[0];
    if (!foe) continue;
    const why = ['a boundary stone moved in the night', 'cattle driven off', 'an insult at your table', 'a marriage refused', 'a mill on a shared stream'][Math.floor(w.rand() * 5)];
    for (const [a, b] of [[v, foe], [foe, v]]) { a.feud = b.id; a.feudSince = w.time; remember(w, a, `Fell into a feud with ${b.name} over ${why}`); }
    w.log(`${v.name} and ${foe.name} are feuding over ${why}. They look to you to judge it.`, 1);
    w.hooks.herald?.({ house: { name: v.name, color: v.color }, title: 'A feud among your vassals', text: `${v.name} and ${foe.name} have fallen out over ${why}. Judge between them, or pay to reconcile them, before it sours them both.` });
  }
}

export function endFeud(w, v, foe) {
  v.feud = null;
  if (foe) foe.feud = null;
}

// The discontented band together. When two or more have waited long enough, they make a
// demand: lighter dues and levies, or, if those are light already, their freedom.
function tickFaction(w) {
  const F = w.faction;
  const angry = landed(w).filter(v => opinion(w, v).total <= FACTION_ANGER);
  if (F) {
    F.members = F.members.filter(id => { const v = w.vassals.find(o => o.id === id); return v && !v.gone && !v.prison && opinion(w, v).total < FACTION_ANGER + 15; });
    for (const v of angry) if (!F.members.includes(v.id)) { F.members.push(v.id); w.log(`${v.name} has joined the faction against you.`, 1); }
    if (F.members.length < 2) { if (!F.members.length || w.time - F.since > ULTIMATUM * 3) { w.faction = null; w.log('The faction among your vassals has broken up.'); } return; }
    if (!F.asked && w.time - F.since > ULTIMATUM) {
      F.asked = true;
      const vs = F.members.map(id => w.vassals.find(o => o.id === id));
      F.demand = vs.every(v => v.dues === 0 && v.levy === 0) ? 'free' : 'dues';
      w.hooks.offer?.({ house: { alive: true, name: 'Your vassals' }, title: 'Your vassals make a demand',
        text: `${vs.map(v => v.name).join(', ')} ${F.demand === 'free' ? 'demand to hold their villages free of you' : 'demand light dues and light levies for all of them'}. Refuse, and they rise.`,
        accept: () => w.factionAnswer(true), decline: () => w.factionAnswer(false) });
    }
    return;
  }
  if (angry.length >= 2) {
    w.faction = { members: angry.map(v => v.id), since: w.time, asked: false };
    w.log(`${angry.map(v => v.name).join(' and ')} have formed a faction against you.`, 1);
    w.hooks.sound?.('boom'); // audio
  }
}

// What one of a vassal's places earns this step is split between the vassal and you.
export function share(w, v, gold) {
  if (v.refusing) { v.gold += gold; return 0; }
  const yours = gold * DUES[v.dues].share;
  v.gold += gold - yours;
  v.paid += yours;
  return yours;
}

export const moodWord = n => n >= 50 ? 'Devoted' : n >= 25 ? 'Loyal' : n >= 5 ? 'Content' : n > -10 ? 'Wary' : n > REFUSE ? 'Resentful' : 'Defiant';
export const moodColor = n => n >= 25 ? '#8fd16a' : n >= 5 ? '#c9d16a' : n > -10 ? '#e8c45a' : n > REFUSE ? '#e8904a' : '#ff6a5a';

// ---- dealing with a vassal (from the Realm screen and the place panel) ----

// How likely a vassal you arrest is to flee to their men and rise instead. One who still
// pays you comes quietly; a defiant one weighs their men against yours at your seat.
export function arrestOdds(w, v) {
  if (v.landless || opinion(w, v).total >= REFUSE) return 0;
  const seat = w.home, mine = seat?.town ? seat.town.garrison().reduce((n, r) => n + r.alive, 0) : 0;
  const theirs = powerOf(w, v).men;
  return Math.max(0.1, Math.min(0.8, theirs / Math.max(1, theirs + mine)));
}

// What you can do for or to a vassal. Returns { ok, text } or null if `act` is not one of
// these (world.vassalAct handles dues, levies and feuds).
export function interact(w, v, act, arg) {
  const me = w.houses[0], T = TEMPERS[v.temper];
  if (act === 'gift') {
    if (me.gold < GIFT) return { ok: false, text: `Needs ${GIFT} gold` };
    me.gold -= GIFT;
    v.gold += GIFT;
    if (v.want === 'gold' && !WANTS.gold.met(w, v)) owe(w, v, 'a gift when they needed it');
    v.gifted = w.time;
    mark(w, v, 15 * (T.dues ? 1.5 : 1), 'Your gifts', 900);
    remember(w, v, `Received a gift of ${GIFT} gold`);
    return { ok: true, text: `${v.name} thanks you for the gift.` };
  }
  if (act === 'honour') {
    const wait = (v.honoured ?? -1e9) + HONOUR_EVERY - w.time;
    if (wait > 0) return { ok: false, text: `Honoured lately: again in ${Math.ceil(wait / 60)} min` };
    v.honoured = w.time;
    mark(w, v, 8 * (T.honour || 1), 'Honoured before your court', 900);
    remember(w, v, 'Honoured before your court');
    // The proud among the rest mind being passed over.
    for (const o of living(w)) if (o !== v && TEMPERS[o.temper].honour) mark(w, o, -3, `You honoured ${v.name} over them`, 600);
    return { ok: true, text: `You raise ${v.name} before your court.` };
  }
  if (act === 'demand') {
    const n = Math.floor((v.gold || 0) / 2);
    if (n < DEMAND_MIN) return { ok: false, text: `Their purse holds too little to ask for (${Math.floor(v.gold || 0)} gold)` };
    if (v.favours > 0) {
      v.favours--;
      v.gold -= n; me.gold += n;
      remember(w, v, `Paid you ${n} gold, as they owed you`);
      return { ok: true, text: `${v.name} pays ${n} gold without a word: they owed you.` };
    }
    if (opinion(w, v).total <= FACTION_ANGER) {
      mark(w, v, -5, 'Asked for more than was owed', 900);
      return { ok: false, text: `${v.name} refuses to pay you a coin more.` };
    }
    v.gold -= n; me.gold += n;
    mark(w, v, -15 * (T.dues ? 1.5 : 1), 'You demanded gold of them', 1800);
    remember(w, v, `Made to pay you ${n} gold`);
    return { ok: true, text: `${v.name} pays ${n} gold, with a sour face.` };
  }
  if (act === 'arms') {
    const r = w.callToArms(v, arg || w.home);
    return r.ok ? { ok: true, text: `${v.name} sends ${r.men} men to ${r.to.name}.` } : { ok: false, text: r.why };
  }
  if (act === 'seat' || act === 'unseat') {
    if (act === 'unseat') {
      if (!v.council) return { ok: false, text: `${v.name} has no seat on your council` };
      v.council = false; v.seat = null;
      mark(w, v, -10, 'Put off your council', 1200);
      remember(w, v, 'Put off your council');
      return { ok: true, text: `${v.name} leaves your council.` };
    }
    if (!SEATS[arg]) return { ok: false, text: `No such council seat: ${arg}` };
    const was = seatHolder(w, arg);
    if (was === v) return { ok: false, text: `${v.name} is your ${SEATS[arg].name.toLowerCase()} already` };
    if (was) { was.council = false; was.seat = null; mark(w, was, -10, 'Put off your council', 1200); remember(w, was, `Put off your council for ${v.name}`); }
    const moved = v.council;
    v.council = true; v.seat = arg;
    remember(w, v, `Made your ${SEATS[arg].name.toLowerCase()}`);
    return { ok: true, text: `${v.name} is your ${SEATS[arg].name.toLowerCase()} now${was ? `, in place of ${was.name}` : moved ? '' : ''}.` };
  }
  if (act === 'grant') {
    const p = arg, c = w.canGrant(p);
    if (!c.ok) return { ok: false, text: c.why };
    w.grant(p, v);
    owe(w, v, `the gift of ${p.name}`);
    return { ok: true, text: `${p.name} is held for you by ${v.name} now.` };
  }
  if (act === 'revoke') {
    if (!arg) return { ok: false, text: 'No such place' };
    if (arg.vassal !== v.id) return { ok: false, text: `${v.name} does not hold ${arg.name}` };
    if (!w.revoke(arg)) return { ok: false, text: `${arg.name} is not yours to take back` };
    return { ok: true, text: `You take ${arg.name} back from ${v.name}.` };
  }
  if (act === 'pardon') {
    if (!w.pardon(v)) return { ok: false, text: `${v.name} is not in your dungeon` };
    owe(w, v, 'their pardon');
    return { ok: true, text: `${v.name} walks free, and waits at your court for land.` };
  }
  if (act === 'banish') {
    if (!v.prison) return { ok: false, text: `${v.name} is not in your dungeon` };
    v.prison = false; v.gone = true; v.banished = true;
    remember(w, v, 'Banished from the realm');
    for (const o of living(w)) mark(w, o, -4, `You banished ${v.name}`, 1200);
    w.log(`${v.name} is put on the road out of the realm, and will not come back.`);
    return { ok: true, text: `${v.name} is banished.` };
  }
  if (act === 'arrest') {
    const odds = arrestOdds(w, v);
    for (const o of living(w)) if (o !== v) mark(w, o, -10, `You imprisoned ${v.name}`, 2400);
    if (odds && w.rand() < odds) {
      // Warned in time: they ride to their men and their villages close their gates to you.
      const held = holdingsOf(w, v);
      for (const p of held) { p.vassal = null; p.owner = null; p.free = v.name; }
      v.gone = true; v.rebel = true; v.council = false; v.seat = null;
      if (v.feud) endFeud(w, v, w.vassals.find(o => o.id === v.feud));
      remember(w, v, 'Fled your guards and rose against you');
      w.log(`${v.name} was warned and fled your guards! ${held.map(p => p.name).join(', ')} stands against you now.`, 1);
      w.chron(`${v.name} fled arrest and rose against you.`);
      w.hooks.herald?.({ house: { name: v.name, color: v.color }, title: `${v.name} rises`, text: `Warned of your guards, ${v.name} rode to their own men. ${held.map(p => p.name).join(', ')} shuts its gates to you; take it back by force.` });
      w.hooks.sound?.('boom'); // audio
      return { ok: false, text: `${v.name} fled and rose against you.` };
    }
    const held = holdingsOf(w, v);
    for (const p of held) w.revoke(p, true);
    v.prison = true; v.council = false; v.seat = null; v.refusing = false;
    if (v.feud) endFeud(w, v, w.vassals.find(o => o.id === v.feud));
    remember(w, v, 'Thrown into your dungeon');
    w.log(`${v.name} is in your dungeon; ${held.map(p => p.name).join(', ') || 'nothing'} is yours again.`, 1);
    return { ok: true, text: `${v.name} is taken to your dungeon.` };
  }
  return null;
}

// ---- petitions ----
// Now and then a vassal comes to your seat to ask something of you (shown as a choice).
const PETITIONS = {
  relief: {
    when: (w, v) => true,
    make: (w, v, p) => {
      const n = 60;
      return { title: `${v.name} asks for help`, text: `A lean year at ${p.name}: the stores are low before the harvest. ${v.name} asks you for ${n} gold to buy grain.`,
        choices: [
          { label: `Send ${n} gold`, ok: w.houses[0].gold >= n, need: () => w.houses[0].gold < n && `You no longer have ${n} gold to send`, run: () => { w.houses[0].gold -= n; v.gold += n; mark(w, v, 12, 'You helped them through a lean year', 1800); owe(w, v, 'your help in a lean year'); remember(w, v, 'Helped by you through a lean year'); return `${p.name} eats, and ${v.name} owes you for it.`; } },
          { label: 'They must manage', run: () => { mark(w, v, -8, 'You left them to go hungry', 1200); remember(w, v, 'Refused help in a lean year'); return `${v.name} goes home with nothing.`; } },
        ] };
    },
  },
  build: {
    when: (w, v) => v.gold >= 80,
    make: (w, v, p) => {
      const k = ['chapel', 'market', 'well'].find(b => !p.eco?.buildings?.[b]) || 'house';
      const what = { chapel: 'a chapel', market: 'a market', well: 'a well', house: 'new houses' }[k];
      return { title: `${v.name} asks leave to build`, text: `${v.name} would raise ${what} at ${p.name} from their own purse, and asks your leave.`,
        choices: [
          { label: 'Give your leave', need: () => v.gold < 60 && `${v.name} no longer has the 60 gold to build with`, run: () => { v.gold -= 60; if (p.eco?.buildings) p.eco.buildings[k] = (p.eco.buildings[k] || 0) + 1; mark(w, v, 6, 'You let them build', 1200); remember(w, v, `Built ${what} at ${p.name}`); return `${v.name} builds ${what} at ${p.name}.`; } },
          { label: 'Forbid it', run: () => { mark(w, v, -6, 'You forbade them to build', 1200); return `${v.name} is told no.`; } },
        ] };
    },
  },
  banner: {
    when: (w, v) => TEMPERS[v.temper].honour || TEMPERS[v.temper].want,
    make: (w, v) => ({ title: `${v.name} asks an honour`, text: `${v.name} asks to carry your banner before the court at the next feast day. The others would see it.`,
      choices: [
        { label: 'Grant it', run: () => { mark(w, v, 10, 'Carried your banner', 1800); for (const o of living(w)) if (o !== v && (TEMPERS[o.temper].honour || TEMPERS[o.temper].want)) mark(w, o, -4, `You favoured ${v.name}`, 900); remember(w, v, 'Carried your banner before the court'); return `${v.name} carries your banner, and the court notices.`; } },
        { label: 'Refuse', run: () => { mark(w, v, -5, 'Refused an honour', 900); return `${v.name} bows stiffly.`; } },
      ] }),
  },
  thanks: {
    when: (w, v) => v.gold >= 120 && opinion(w, v).total >= 25,
    make: (w, v) => {
      const n = Math.round(v.gold / 3 / 10) * 10;
      return { title: `A gift from ${v.name}`, text: `${v.name} has had a good year, and sends you ${n} gold with their thanks.`,
        choices: [
          { label: `Take it gladly (+${n} gold)`, need: () => v.gold < n && `${v.name}'s purse no longer holds ${n} gold`, run: () => { v.gold -= n; w.houses[0].gold += n; mark(w, v, 3, 'You took their gift kindly', 900); return `${n} gold comes in from ${v.name}.`; } },
          { label: 'Send it back with your thanks', run: () => { mark(w, v, 10, 'You returned their gift', 1800); return `${v.name} is touched.`; } },
        ] };
    },
  },
};

function tickPetitions(w) {
  if (!w.hooks.choice) return;
  w.petitionAt ??= w.time + PETITION_EVERY[0];
  if (w.time < w.petitionAt) return;
  const seat = w.home;
  const vs = landed(w).filter(v => !v.refusing && w.time - v.since > 180);
  if (!seat?.town || seat.owner !== 0 || !vs.length) { w.petitionAt = w.time + 60; return; }
  w.petitionAt = w.time + PETITION_EVERY[0] + w.rand() * (PETITION_EVERY[1] - PETITION_EVERY[0]);
  const v = vs[Math.floor(w.rand() * vs.length)], p = holdingsOf(w, v)[0];
  const kinds = Object.entries(PETITIONS).filter(([, P]) => P.when(w, v));
  const [id, P] = kinds[Math.floor(w.rand() * kinds.length)];
  const ev = P.make(w, v, p);
  // Checked again when chosen: the purse or the vassal may have changed while it waited.
  const choices = ev.choices.map(c => ({ label: c.label, ok: c.ok ?? true, run: () => {
    const why = v.gone ? `${v.name} is no longer your vassal` : v.prison ? `${v.name} is in your dungeon` : c.need?.();
    if (why) { console.warn(`[vassals] petition ${id} from ${v.name}: ${why}`); w.log(`${why}.`); return `${why}.`; }
    const out = c.run(); w.log(out); return out;
  } }));
  w.hooks.choice({ id: `petition-${id}`, image: PAINTED.has('petition') ? 'assets/art/events/petition.png' : null, at: seat, ...ev, choices });
}
