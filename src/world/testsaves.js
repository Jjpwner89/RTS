// Test campaigns at each rank (creator, 2026-11-20): "a test save at each lord level" to
// try templates and diplomacy by playing on from there. Rather than stored files, which
// would go stale whenever the save format changes, each one is made fresh: a seed-7
// campaign is played forward quietly, taking a village every few minutes while the
// governor runs Ashford, then given gold and building stock and handed to the game as a
// loaded save. Test campaigns save to their own slot, never over the real one.
import { World, FACTIONS } from './world.js';
import { updateGoals } from './goals.js';

export const TEST_RANKS = {
  lord: { name: 'Lord', places: 2, minutes: 10, gold: 800, people: 35,
    blurb: 'Two places, at minute 10: vassals, town templates and calling the banners.' },
  count: { name: 'Count', places: 5, minutes: 24, gold: 2000, people: 60, vassals: 1,
    blurb: 'Five places, at minute 24, one held by a vassal: the knights\' hall, and the great houses take notice.' },
  duke: { name: 'Duke', places: 11, minutes: 42, gold: 4000, people: 80, vassals: 3,
    blurb: 'Eleven places, at minute 42, three held by vassals: half the realm, the palace, and the crown within reach.' },
};
const SEED = 7;
const STOCK = { wood: 250, stone: 200, planks: 80, iron: 30, food: 400, flax: 20, string: 20 };
// Arms for the barracks racks: a regiment of spears and one of bows. The hall's kit is on top.
const ARMS = { spears: 24, shields: 24, bows: 12, arrows: 120 };
const HALL_ARMS = { mail: 12, swords: 12, shields: 12, armour: 6, lances: 6, horses: 6 };

// The game quietly answers everything itself: fights are reckoned, offers and news pass,
// and settlers are taken in when there is room.
function quietHooks(w) {
  const known = {
    ask: enc => w.autoResolve(enc),
    choice: ev => { const c = ev.choices.find(o => o.ok) || ev.choices.at(-1); c.run(); },
  };
  return new Proxy(known, { get: (o, k) => (k in o ? o[k] : () => {}) });
}

// The nearest place worth taking: a free village first, then an outlaw camp, then a
// rival's weakly held place (never a seat or Kingsbridge).
function nextTarget(w) {
  const home = w.home;
  const near = list => list.sort((a, b) => w.route(home, a).length - w.route(home, b).length)[0] || null;
  return near(w.pois.filter(p => p.owner === null && p.kind !== 'camp'))
    || near(w.pois.filter(p => p.owner === w.bandits))
    || near(w.pois.filter(p => p.owner !== 0 && p.owner !== null && p.kind !== 'crown' && p.seat === undefined));
}

function take(w, p) {
  const a = w.spawnArmy(0, [{ key: 'spear', count: 24, name: 'Test spears' }, { key: 'archer', count: 12, name: 'Test bows' }], w.home, 'Test host', 'column');
  a.last = w.home;
  w.capture(p, a);
}

// Puts up a finished building near the keep (only to give the test village room to live).
function raise(t, kind) {
  for (let r = 22; r < 120; r += 4) for (let a = 0; a < Math.PI * 2; a += 0.3) {
    const x = t.keep.x + Math.cos(a) * r, z = t.keep.z + Math.sin(a) * r;
    if (t.canPlace(kind, x, z, { free: true }).ok && t.place(kind, x, z, { ready: true, free: true }).ok) return true;
  }
  return false;
}

// Plays the campaign forward to `key`'s rank; `progress(minute)` is called now and then.
export async function makeTestCampaign(key, progress = () => {}) {
  const T = TEST_RANKS[key];
  const w = new World(SEED, {}, { size: 'normal', aggression: 'normal', test: key });
  w.hooks = quietHooks(w);
  const ash = () => w.home.town;
  for (const [g, n] of Object.entries(STOCK)) ash().put(ash().keep, g, n / 2);
  const end = T.minutes * 60, first = 180, every = (end - first - 60) / Math.max(1, T.places - 1);
  let next = first;
  for (let t = 0; w.time < end; t++) {
    w.update(0.5);
    if (w.encounter) w.autoResolve(w.encounter);
    const owned = w.pois.filter(p => p.owner === 0).length;
    if (w.time >= next && owned < T.places) { next += every; const p = nextTarget(w); if (p) take(w, p); }
    if (t % 240 === 0) { progress(Math.floor(w.time / 60)); await new Promise(r => setTimeout(r, 0)); }
  }
  // Make sure of the rank, whatever the fights on the way did.
  for (let i = 0; i < 20 && w.pois.filter(p => p.owner === 0).length < T.places; i++) { const p = nextTarget(w); if (!p) break; take(w, p); }
  while (w.encounter) w.autoResolve(w.encounter);
  // Gold for diplomacy and hiring, stock for templates, and people for the larger templates.
  FACTIONS[0].gold = Math.max(FACTIONS[0].gold, T.gold);
  const t = ash();
  for (const [g, n] of Object.entries(STOCK)) t.put(t.keep, g, n);
  while (t.housing < T.people + 4 && raise(t, 'house'));
  for (let i = t.population; i < Math.min(T.people, t.housing - 2); i++) { const a = i * 2.4; t.addVillager(t.keep.x + Math.sin(a) * 24, t.keep.z + Math.cos(a) * 24); } // clear of a grown keep
  // Every other place you run gets enough to build with too (Orchestrator, 2026-11-21: the
  // Lord test's Cranholm Castle had 11 people and 1 food, so templates there looked broken).
  for (const p of w.pois) {
    const o = p.town;
    if (p.owner !== 0 || !o || o === t) continue;
    for (const [g, n] of Object.entries(STOCK)) o.put(o.keep, g, Math.max(0, n / 2 - (o.keep.store[g] || 0)));
    while (o.housing < 24 && raise(o, 'house'));
    for (let i = o.population; i < Math.min(20, o.housing - 2); i++) { const a = i * 2.4; o.addVillager(o.keep.x + Math.sin(a) * 24, o.keep.z + Math.cos(a) * 24); }
    o.mood = Math.max(o.mood, 50); o.misery = 0; o.hungry = false;   // fed now: not still sulking over the hungry run-up
  }
  // What the rank opens, ready to try (Manager, 2026-11-21: the Count test had no barracks
  // or hall, so its tools could not be tried and the banners raised no levies). Every rank
  // gets a barracks in Ashford with arms in its racks; Count and Duke also a knights' hall,
  // veterans home from the wars, mail and plate, and the fees.
  if (raise(t, 'barracks')) {
    const b = t.buildings.find(o => o.kind === 'barracks' && o.state === 'active');
    for (const [g, n] of Object.entries(ARMS)) t.put(b, g, n);
  }
  if (T.vassals && raise(t, 'hall')) {
    // The hall's kit sits in the hall itself: it counts as the village's, but nobody hauls it
    // to the barracks racks, where calling the banners would arm levies with it first (QC,
    // 2026-11-21: the Count save's hall was left short of swords, horses and lances).
    const hall = t.buildings.find(o => o.kind === 'hall' && o.state === 'active');
    for (const [g, n] of Object.entries(HALL_ARMS)) t.put(hall, g, n);
    t.keepPeak = Math.max(t.keepPeak || 1, 3);
    for (const v of t.villagers.filter(o => o.state !== 'soldier').slice(0, 12)) v.xp = Math.max(v.xp || 0, 1);
  }
  // Vassals to manage (2026-11-20): the furthest villages go to new lords, the first on
  // your council, so the Realm screen's vassals and council have someone in them.
  const far = w.pois.filter(p => p.owner === 0 && p.town && p.kind === 'village' && p !== w.home && w.canGrant(p).ok)
    .sort((a, b) => Math.hypot(b.x - w.home.x, b.z - w.home.z) - Math.hypot(a.x - w.home.x, a.z - w.home.z));
  for (const p of far.slice(0, T.vassals || 0)) {
    const v = w.grant(p, null);
    if (v && !w.vassals.some(o => o.council)) w.vassalAct(v, 'seat', 'steward');
  }
  w.update(0.5);
  updateGoals(w, {});   // starts on the goal for its rank, the ones before ticked quietly
  return w;
}
