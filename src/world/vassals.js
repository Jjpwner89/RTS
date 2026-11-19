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
const FACTION_ANGER = -10;          // at or below this a vassal joins a faction
const ULTIMATUM = 180;              // seconds a faction of two or more waits before its demand
const REFUSE = -25;                 // below this he pays nothing and sends nobody

// What kind of man he is.
export const TEMPERS = {
  loyal: { name: 'loyal', base: 12, about: 'Keeps faith, and expects it kept.' },
  greedy: { name: 'greedy', base: 0, dues: 2, about: 'Counts every coin you take twice over.' },
  proud: { name: 'proud', base: -5, honour: 2, about: 'Lives on honours, and sulks without them.' },
  ambitious: { name: 'ambitious', base: -8, want: 2, about: 'Always wants more, and minds going without.' },
  content: { name: 'content', base: 6, about: 'Asks little and grumbles less.' },
};
// What he wants. Each is met or not; unmet, it weighs on him more as time passes.
export const WANTS = {
  land: { text: 'a second village', met: (w, v) => w.pois.filter(p => p.vassal === v.id).length >= 2 },
  seat: { text: 'a seat on your council', met: (w, v) => v.council },
  dues: { text: 'lighter dues', met: (w, v) => v.dues === 0 },
  peace: { text: 'peace in the realm', met: w => !w.wars.size },
};

const FIRST = ['Aldous', 'Bertram', 'Cuthbert', 'Drogo', 'Edmund', 'Fulk', 'Godric', 'Hamon', 'Ivo', 'Jocelin', 'Lambert', 'Miles', 'Nigel',
  'Odo', 'Payn', 'Ralf', 'Simon', 'Turold', 'Walter', 'Alys', 'Beatrix', 'Cecily', 'Edith', 'Isolde', 'Matilda', 'Petronel'];
const LAST = ['Wren', 'Ashby', 'Colet', 'Dane', 'Ferrers', 'Gale', 'Harcourt', 'Lisle', 'Mallory', 'Neville', 'Orme', 'Pell', 'Quincey',
  'Rook', 'Stour', 'Thorne', 'Vane', 'Warrick', 'Bray', 'Crane'];
const COLORS = ['#b5654a', '#4a8fb5', '#8fae4a', '#b58f4a', '#7a5ab5', '#4ab59a', '#b54a7a', '#9a9a4a', '#5a6ab5', '#b5a04a'];

export function makeVassal(w, p) {
  const r = () => w.rand();
  const used = new Set(w.vassals.map(v => v.name));
  let name;
  for (let i = 0; i < 40 && (!name || used.has(name)); i++) {
    const first = FIRST[Math.floor(r() * FIRST.length)];
    const lady = FIRST.indexOf(first) >= 19;
    name = `${lady ? 'Lady' : 'Sir'} ${first} ${LAST[Math.floor(r() * LAST.length)]}`;
  }
  const tempers = Object.keys(TEMPERS), wants = Object.keys(WANTS);
  const v = {
    id: (w.vassalId = (w.vassalId || 0) + 1), name, color: COLORS[(w.vassalId - 1) % COLORS.length],
    temper: tempers[Math.floor(r() * tempers.length)], want: wants[Math.floor(r() * wants.length)], wantSince: w.time,
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

// His opinion of you, and why: [[points, reason], ...], biggest first.
export function opinion(w, v) {
  const T = TEMPERS[v.temper], why = [];
  const add = (n, text) => { n = Math.round(n); if (n) why.push([n, text]); };
  add(T.base, `${T.name[0].toUpperCase()}${T.name.slice(1)} by nature`);
  add(DUES[v.dues].mood * (DUES[v.dues].mood < 0 ? T.dues || 1 : 1), `${DUES[v.dues].name} dues`);
  add(LEVIES[v.levy].mood, `${LEVIES[v.levy].name} levies`);
  if (v.council) add(15 * (T.honour || 1), 'A seat on your council');
  const want = WANTS[v.want];
  if (want) {
    if (want.met(w, v)) add(10, `Has ${want.text}`);
    else add(-Math.min(12, (w.time - v.wantSince) / 60) * (T.want || 1), `Wants ${want.text}`);
  }
  // A feud you leave unjudged weighs on him more as it goes on.
  const foe = v.feud && w.vassals.find(o => o.id === v.feud);
  if (foe) add(-Math.min(15, (w.time - v.feudSince) / 60), `Feuding with ${foe.name}, and you do nothing`);
  // Marks fade evenly to nothing; those of the same reason add up.
  const sum = new Map();
  for (const m of v.marks) {
    const left = m.fade === Infinity ? 1 : Math.max(0, 1 - (w.time - m.at) / m.fade);
    if (left > 0) sum.set(m.text, (sum.get(m.text) || 0) + m.n * left);
  }
  for (const [text, n] of sum) add(n, text);
  for (const [text, n] of worksPride(w)) add(n, text);
  why.sort((a, b) => Math.abs(b[0]) - Math.abs(a[0]));
  return { total: Math.max(-100, Math.min(100, why.reduce((n, [k]) => n + k, 0))), why };
}

// Forgotten marks are dropped, and a vassal who sours enough stops paying. Feuds start
// and burn out, and the discontented gather into a faction. dt: seconds since last time.
export function tickVassals(w, dt = 5) {
  for (const v of living(w)) {
    v.marks = v.marks.filter(m => m.fade === Infinity || w.time - m.at < m.fade);
    if (!holdingsOf(w, v).length && !v.landless) { v.gone = true; continue; }
    if (v.landless) continue;
    const o = opinion(w, v).total;
    if (!v.refusing && o < REFUSE) {
      v.refusing = true;
      remember(w, v, 'Stopped paying dues');
      w.log(`${v.name} is too aggrieved to pay you dues or send men.`, 1);
    } else if (v.refusing && o >= REFUSE + 8) {
      v.refusing = false;
      w.log(`${v.name} pays his dues again.`);
    }
  }
  tickFeuds(w, dt);
  tickFaction(w);
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
  // One feud at a time, and a quiet spell after each.
  if (vs.some(v => v.feud) || vs.length < 2 || w.time - Math.max(0, ...w.vassals.map(v => v.feudSince ?? -1e9)) < FEUD_EVERY) return;
  for (const v of vs) {
    if (v.feud) break;
    const hot = TEMPERS[v.temper].want || TEMPERS[v.temper].honour ? 2 : 1;
    if (w.rand() >= dt / FEUD_EVERY * hot / vs.length) continue;
    const foe = vs.filter(o => o !== v).sort((a, b) => near(w, v, a) - near(w, v, b))[0];
    if (!foe) continue;
    const why = ['a boundary stone moved in the night', 'cattle driven off', 'an insult at your table', 'a marriage refused', 'a mill on a shared stream'][Math.floor(w.rand() * 5)];
    for (const [a, b] of [[v, foe], [foe, v]]) { a.feud = b.id; a.feudSince = w.time; remember(w, a, `Fell into a feud with ${b.name} over ${why}`); }
    w.log(`${v.name} and ${foe.name} are feuding over ${why}. They look to you to judge it.`, 1);
    w.hooks.herald?.({ title: 'A feud among your vassals', text: `${v.name} and ${foe.name} have fallen out over ${why}. Judge between them, or pay to reconcile them, before it sours them both.` });
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
