// Your vassals: lords you give a village to, from the rank of Lord. A vassal runs his
// village on the same rules as every place you don't run yourself (holdings.js), pays
// you a share of what it earns and sends a share of its men when you call the banners.
// He has his own mind, after Crusader Kings: an opinion of you made of reasons you can
// read, a temper, and something he wants. Kept as one opinion number, after Crusader
// Kings 2, with the reasons on hover.
//
// w.vassals holds every lord; a place he holds has p.vassal = his id. Each lord keeps a
// short list of what happened to him (memory), for the chronicle and the director later.

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
export const living = w => w.vassals.filter(v => !v.gone);

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
  // Marks fade evenly to nothing; those of the same reason add up.
  const sum = new Map();
  for (const m of v.marks) {
    const left = m.fade === Infinity ? 1 : Math.max(0, 1 - (w.time - m.at) / m.fade);
    if (left > 0) sum.set(m.text, (sum.get(m.text) || 0) + m.n * left);
  }
  for (const [text, n] of sum) add(n, text);
  why.sort((a, b) => Math.abs(b[0]) - Math.abs(a[0]));
  return { total: Math.max(-100, Math.min(100, why.reduce((n, [k]) => n + k, 0))), why };
}

// Forgotten marks are dropped, and a vassal who sours enough stops paying.
export function tickVassals(w) {
  for (const v of living(w)) {
    v.marks = v.marks.filter(m => m.fade === Infinity || w.time - m.at < m.fade);
    if (!holdingsOf(w, v).length) { v.gone = true; continue; }
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
