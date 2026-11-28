// Makes a new realm: about thirty places of six kinds joined by roads, the royal seat of
// Kingsbridge at the centre, your house and four rival houses around the edge, and a few
// bandit camps in the wild places between.
import { rng } from '../noise.js';

// Every rival house the game knows. Each campaign has House Varn and four of the others.
// Portraits and heraldry live in assets/art/<portraits|heraldry>/<id>.png.
export const HOUSES = [
  { id: 'varn', name: 'House Varn', short: 'Varn', lord: 'Lord Edric Varn', trait: 'raider', color: '#c8423a',
    blurb: 'Lean and scarred. Burns villages and strikes at supply.',
    taunts: ['Your fields burn well, neighbour.', 'I take what I can carry. Next time I bring more carts.', 'Count your villages tonight. Count them again in the morning.'] },
  { id: 'carrow', name: 'House Carrow', short: 'Carrow', lord: 'Lady Aldith Carrow', trait: 'builder', color: '#d9a441',
    blurb: 'Grows great villages and fine stone castles. Slow to war, hard to break.',
    taunts: ['I build for a hundred years. You build for a summer.', 'My masons outnumber your spearmen.', 'War is a poor trade. You will learn the price.'] },
  { id: 'stonemere', name: 'House Stonemere', short: 'Stonemere', lord: 'Lord Osric Stonemere', trait: 'turtler', color: '#6f7f8f',
    blurb: 'Old and patient. Walls, towers and crossbows, and sieges that last.',
    taunts: ['My walls were old when your grandsire was a boy.', 'Come and try them. Bring ladders. Many ladders.', 'I can wait. Can your granaries?'] },
  { id: 'wyndham', name: 'House Wyndham', short: 'Wyndham', lord: 'Lady Rohese Wyndham', trait: 'schemer', color: '#7b4fa0',
    blurb: 'Marriages, bribes and betrayal. Backs whoever is winning.',
    taunts: ['How kind of you to weaken my rivals for me.', 'Every lord has a price. I wonder what yours is.', 'A pity. I had such hopes for you.'] },
  { id: 'penhallow', name: 'House Penhallow', short: 'Penhallow', lord: 'Lord Gervase Penhallow', trait: 'merchant', color: '#2f8f6a',
    blurb: 'Market towns and gold. Fights with hired swords.',
    taunts: ['My sellswords cost less than your harvest.', 'Everything is for sale. Even your keep.', 'I have hired better men than you for less.'] },
  { id: 'dunmore', name: 'House Dunmore', short: 'Dunmore', lord: 'Lord Hal Dunmore', trait: 'hothead', color: '#e07a2f',
    blurb: 'Young and reckless. Knights and cavalry, challenges and charges.',
    taunts: ['Meet me in the open field, if you dare.', 'My knights are bored. You will do.', 'Hide behind your walls, then. I will ride around them.'] },
];
export const PLAYER_HOUSE = { id: 'player', name: 'Your house', short: 'Your', lord: 'You', trait: 'player', color: '#3d6fd6', blurb: '' };
// Part 2: the host that comes down from the north once you are crowned. No terms, no
// marriages: it raids, it burns, and it keeps coming while it holds the pass.
export const INVADER = { id: 'norrhold', name: 'The Norrhold Host', short: 'Norrhold', lord: 'King Askar of Norrhold', trait: 'invader', color: '#9cc3dc',
  blurb: 'From beyond the old wall. Raids without end, and hosts in their thousands.', invader: true,
  taunts: ['Your wall was old. Your kingdom is older. Both fall.', 'We do not take tribute. We take everything.', 'Count your men, little king. We stopped counting ours.'] };
// The faces painted (assets/art/portraits/<id>.png). No other is ever asked for (Norrhold's was a 404 on every one
// of its messages): without one, a lord is his initials on his house's colour.
export const PORTRAITS = new Set(['carrow', 'dunmore', 'penhallow', 'player', 'player-f', 'stonemere', 'varn', 'wyndham']);
export function faceOf(h) {
  const initials = (h.lord || h.name).split(' ').filter(w => /^[A-Z]/.test(w)).slice(-2).map(w => w[0]).join('');
  return h.id && PORTRAITS.has(h.id) ? `<img src="assets/art/portraits/${h.id}.png" alt="" onerror="this.replaceWith('${initials}')">` : initials;
}

export const BANDITS = { id: 'bandits', name: 'Bandits', short: 'Bandit', lord: 'Bandit chiefs', trait: 'bandit', color: '#5a5048', blurb: '', bandit: true };

// What each kind of place is good for, on the map and as a village.
export const KINDS = {
  village: { name: 'Village', icon: 'village', about: 'Farms and families.', pop: 1, gold: 1, arms: 1, defence: 1 },
  castle: { name: 'Castle', icon: 'castle', about: 'Strong walls and a big garrison, few people.', pop: 0.6, gold: 0.8, arms: 1, defence: 1.6, garrison: 1.6 },
  mine: { name: 'Mining village', icon: 'mine', about: 'Rich in stone and iron ore: arms come faster.', pop: 0.8, gold: 1, arms: 1.7, defence: 1 },
  ford: { name: 'Ford', icon: 'ford', about: 'Holds the river crossing: tolls, and a strong place to defend.', pop: 0.8, gold: 1.4, arms: 1, defence: 1.3 },
  monastery: { name: 'Abbey', icon: 'monastery', about: 'Monks, granaries and learning: people grow quickly and stay content.', pop: 1.2, gold: 1.2, arms: 0.5, defence: 1 },
  // Gold 1 (creator, 2026-11-22: a market should pay more, "but not so much passively"; was 1.5,
  // and 2 before 2026-11-21): its tax now rides on the trade done at its market (World.duesOf).
  market: { name: 'Market town', icon: 'market', about: 'Trade and gold.', pop: 1.1, gold: 1, arms: 0.8, defence: 1 },
  crown: { name: 'Royal seat', icon: 'crown', about: 'The old royal city. Hold it, and most of the realm, to be crowned.', pop: 1.5, gold: 2, arms: 1.2, defence: 1.8, garrison: 2 },
  pass: { name: 'Mountain gate', icon: 'pass', about: 'Where the northern host pours through. While they hold it, more keep coming.', pop: 0.5, gold: 0.4, arms: 2, defence: 2, garrison: 3 },
  warcamp: { name: 'War camp', icon: 'warcamp', about: 'A great camp of the northern host: stockades, tents and fighting men.', pop: 0.4, gold: 0.3, arms: 2.5, defence: 1.3, garrison: 2 },
  camp: { name: 'Bandit camp', icon: 'camp', about: 'Outlaws who raid the roads and villages nearby.', pop: 0.3, gold: 0.3, arms: 0.5, defence: 0.9 },
};

const PRE = ['Ash', 'Holl', 'Stow', 'Black', 'Thorn', 'Wen', 'Ald', 'Bram', 'Cran', 'Dun', 'Elm', 'Fen', 'Gar', 'Hal', 'Ive', 'Kel',
  'Lang', 'Mar', 'Nor', 'Ock', 'Raven', 'Sal', 'Thurl', 'Wick', 'Brack', 'Cold', 'Wol', 'Bar', 'Oak', 'Stan', 'Wil', 'Rook', 'Hart',
  'Fox', 'Bec', 'Brad', 'Cal', 'Ember', 'Grey', 'Hay', 'Lin', 'Mill', 'Pell', 'Red', 'Sedge', 'Tun', 'Wether', 'Yar'];
const SUF = ['ford', 'ton', 'by', 'ham', 'wick', 'moor', 'stead', 'bury', 'well', 'dale', 'combe', 'ley', 'holm', 'worth', 'gate', 'mere', 'field', 'thorpe', 'den', 'hurst'];

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export const REALM_RADIUS = 680;

// Campaign sizes: how many places on the same map, how many rival houses, how many outlaw camps.
export const SIZES = {
  small: { name: 'Small', places: 24, gap: 205, rivals: 3, camps: 2, about: 'Three rival houses and about two dozen places' },
  normal: { name: 'Normal', places: 34, gap: 175, rivals: 5, camps: 3, about: 'Five rival houses and thirty-odd places' },
  large: { name: 'Large', places: 42, gap: 158, rivals: 6, camps: 4, about: 'All six rival houses and forty-odd places, closer together' },
};

export function generateRealm(seed, size = 'normal') {
  const rand = rng(seed + 91);
  const R = REALM_RADIUS, S = SIZES[size] || SIZES.normal;

  // Places spread out with Poisson-disc sampling inside a circle.
  const pts = [];
  for (let tries = 0; tries < 6000 && pts.length < S.places; tries++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * R;
    const p = { x: Math.sin(a) * r, z: Math.cos(a) * r };
    if (pts.every(q => dist(p, q) > S.gap)) pts.push(p);
  }

  // Roads: the relative neighbourhood graph (two places are joined if no third is closer to
  // both), which is connected and leaves natural chokepoints; plus a few extra short roads.
  const roads = [];
  const has = (i, j) => roads.some(([a, b]) => (a === i && b === j) || (a === j && b === i));
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = dist(pts[i], pts[j]);
      if (!pts.some((k, n) => n !== i && n !== j && Math.max(dist(k, pts[i]), dist(k, pts[j])) < d)) roads.push([i, j]);
    }
  }
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = dist(pts[i], pts[j]);
      if (d < 255 && !has(i, j) && rand() < 0.35) {
        // Skip roads that would cross another.
        if (!roads.some(([a, b]) => a !== i && a !== j && b !== i && b !== j && crosses(pts[i], pts[j], pts[a], pts[b]))) roads.push([i, j]);
      }
    }
  }

  // Names, never twice.
  const used = new Set();
  const base = () => {
    for (;;) {
      const n = PRE[Math.floor(rand() * PRE.length)] + SUF[Math.floor(rand() * SUF.length)];
      if (!used.has(n)) { used.add(n); return n; }
    }
  };

  const places = pts.map((p, i) => ({ id: `p${i}`, x: Math.round(p.x), z: Math.round(p.z), kind: 'village', owner: null, links: [] }));
  for (const [a, b] of roads) { places[a].links.push(places[b]); places[b].links.push(places[a]); }

  // The royal seat in the middle.
  const crown = places.reduce((best, p) => (Math.hypot(p.x, p.z) < Math.hypot(best.x, best.z) ? p : best));
  crown.kind = 'crown';
  crown.name = 'Kingsbridge';
  used.add('Kingsbridge');

  // Six seats evenly round the edge; yours in the south.
  const rivals = [HOUSES[0], ...shuffle(HOUSES.slice(1), rand).slice(0, S.rivals - 1)];
  const houses = [PLAYER_HOUSE, ...rivals].map((h, i) => ({ ...h, index: i }));
  const outer = places.filter(p => Math.hypot(p.x, p.z) > R * 0.55);
  const turn = rand() * 0.3;
  houses.forEach((h, i) => {
    const want = Math.PI * 2 * (i / houses.length + turn / houses.length);   // 0 is south (+z)
    const free = outer.filter(p => p.owner === null);
    const seat = free.reduce((best, p) => (angDiff(Math.atan2(p.x, p.z), want) < angDiff(Math.atan2(best.x, best.z), want) ? p : best), free[0]);
    seat.owner = i;
    seat.seat = i;
    seat.kind = h.trait === 'turtler' ? 'castle' : 'village';
    h.seat = seat;
  });
  // Each rival starts with its seat and its two nearest neighbours by road. You start
  // with one village, like a reeve; your neighbours are free villages to win.
  for (const h of houses.slice(1)) {
    const near = h.seat.links.filter(p => p.owner === null && p !== crown).sort((p, q) => dist(p, h.seat) - dist(q, h.seat)).slice(0, 2);
    for (const p of near) p.owner = h.index;
  }

  // Bandit camps in the wild places farthest from any seat.
  const wild = places.filter(p => p.owner === null && p !== crown)
    .sort((p, q) => Math.min(...houses.map(h => dist(q, h.seat))) - Math.min(...houses.map(h => dist(p, h.seat))));
  for (const p of wild.slice(0, S.camps)) p.kind = 'camp';

  // The rest get a kind.
  const deck = ['village', 'village', 'village', 'village', 'castle', 'mine', 'mine', 'ford', 'monastery', 'market', 'market'];
  for (const p of places) if (p.kind === 'village' && p.seat === undefined) p.kind = deck[Math.floor(rand() * deck.length)];

  for (const p of places) {
    if (p.name) continue;
    const b = base();
    p.name = p.kind === 'castle' ? `${b} Castle` : p.kind === 'monastery' ? `${b} Abbey` : p.kind === 'market' ? `Market ${b}`
      : p.kind === 'camp' ? `${b.replace(/(ford|ton|by|ham|wick|stead|bury|well|thorpe)$/, '')}wood Camp` : b;
  }
  // Your seat keeps its old name.
  houses[0].seat.name = 'Ashford';

  return { places, roads: roads.map(([a, b]) => ({ a: places[a], b: places[b] })), houses, crown };
}

function crosses(p1, p2, p3, p4) {
  const d = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  return d(p1, p2, p3) * d(p1, p2, p4) < 0 && d(p3, p4, p1) * d(p3, p4, p2) < 0;
}

function angDiff(a, b) {
  const d = Math.abs(((a - b) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
  return d;
}

function shuffle(list, rand) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---- beyond the wall ----
// The old wall runs along the north of the realm. Past it lie a dozen places of the north:
// the mountain gate farthest out, war camps nearest the wall, and northern villages
// between. Made at the start so the land is fixed; only opened in Part 2.
const NPRE = ['Hrim', 'Skar', 'Vald', 'Grim', 'Ulf', 'Thrym', 'Kol', 'Drak', 'Isen', 'Frost', 'Hald', 'Ror', 'Sval', 'Ygg', 'Brun', 'Eld'];
const NSUF = ['heim', 'vik', 'gard', 'stad', 'holt', 'fell', 'mark', 'nes', 'by', 'havn'];
export const WALL_RADIUS = REALM_RADIUS + 70;
export const WALL_SPAN = 1.05;   // radians either side of north

export function generateBeyond(seed, realmPlaces) {
  const rand = rng(seed + 4111);
  const pts = [];
  for (let tries = 0; tries < 8000 && pts.length < 12; tries++) {
    const a = Math.PI + (rand() * 2 - 1) * 0.85, r = WALL_RADIUS + 110 + rand() * 470;
    const p = { x: Math.sin(a) * r, z: Math.cos(a) * r };
    if (pts.every(q => dist(p, q) > 165)) pts.push(p);
  }
  const places = pts.map((p, i) => ({ id: `n${i}`, x: Math.round(p.x), z: Math.round(p.z), kind: 'village', owner: null, links: [], beyond: true }));
  const roads = [];
  const join = (a, b) => { if (!a.links.includes(b)) { a.links.push(b); b.links.push(a); roads.push({ a, b }); } };
  for (let i = 0; i < places.length; i++) {
    for (let j = i + 1; j < places.length; j++) {
      const d = dist(places[i], places[j]);
      if (!places.some((k, n) => n !== i && n !== j && Math.max(dist(k, places[i]), dist(k, places[j])) < d)) join(places[i], places[j]);
    }
  }
  // The gate is the farthest place; the three nearest the wall are war camps.
  const out = p => Math.hypot(p.x, p.z);
  const byOut = [...places].sort((p, q) => out(q) - out(p));
  byOut[0].kind = 'pass';
  const near = [...places].sort((p, q) => out(p) - out(q));
  for (const p of near.slice(0, 3)) p.kind = 'warcamp';
  const deck = ['village', 'village', 'village', 'mine', 'castle', 'market'];
  for (const p of places) if (p.kind === 'village') p.kind = deck[Math.floor(rand() * deck.length)];
  const used = new Set();
  const name = () => { for (;;) { const n = NPRE[Math.floor(rand() * NPRE.length)] + NSUF[Math.floor(rand() * NSUF.length)]; if (!used.has(n)) { used.add(n); return n; } } };
  for (const p of places) {
    const b = name();
    p.name = p.kind === 'pass' ? `The Gate of ${b}` : p.kind === 'warcamp' ? `${b} War Camp` : p.kind === 'castle' ? `${b} Hold` : p.kind === 'market' ? `${b} Market` : b;
  }
  // Breaches: each war camp's road through the wall to the nearest place of the realm.
  const breaches = [];
  for (const c of near.slice(0, 3)) {
    const to = realmPlaces.filter(q => q.z < 0).sort((p, q) => dist(p, c) - dist(q, c))[0];
    if (!to) continue;
    breaches.push({ from: c, to });
  }
  const wall = [];
  for (let i = 0; i <= 40; i++) {
    const a = Math.PI - WALL_SPAN + (i / 40) * WALL_SPAN * 2;
    wall.push({ x: Math.round(Math.sin(a) * WALL_RADIUS), z: Math.round(Math.cos(a) * WALL_RADIUS) });
  }
  return { places, roads, breaches, wall, pass: byOut[0] };
}
