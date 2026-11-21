// Test campaigns at each rank (creator, 2026-11-20): "a test save at each lord level" to
// try templates and diplomacy by playing on from there. Rather than stored files, which
// would go stale whenever the save format changes, each one is made fresh: a seed-7
// campaign is played forward quietly, taking a village every few minutes while the
// governor runs Ashford, then given gold and building stock and handed to the game as a
// loaded save. Test campaigns save to their own slot, never over the real one.
import { World, FACTIONS } from './world.js';

export const TEST_RANKS = {
  lord: { name: 'Lord', places: 2, minutes: 10, gold: 800, people: 35,
    blurb: 'Two places, at minute 10: vassals, town templates and calling the banners.' },
  count: { name: 'Count', places: 5, minutes: 24, gold: 2000, people: 60,
    blurb: 'Five places, at minute 24: the knights\' hall, and the great houses take notice.' },
  duke: { name: 'Duke', places: 11, minutes: 42, gold: 4000, people: 80,
    blurb: 'Eleven places, at minute 42: half the realm, the palace, and the crown within reach.' },
};
const SEED = 7;
const STOCK = { wood: 250, stone: 200, planks: 80, iron: 30, food: 400, flax: 20, string: 20 };

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
  for (let i = t.population; i < Math.min(T.people, t.housing - 2); i++) { const a = i * 2.4; t.addVillager(t.keep.x + Math.sin(a) * 14, t.keep.z + Math.cos(a) * 14); }
  w.update(0.5);
  return w;
}
