// One point of interest as a living town: buildings placed anywhere, villagers who
// build and work them, short production chains, levies raised from the villagers
// themselves, and bandit raids. Fighting is left to battle.js.
//
// Goods are real and sit somewhere: in a woodcutter's yard, a workshop, the barracks,
// a storehouse or the keep. Haulers carry them about in crates, so where things are
// built matters. Workers who are stuck fetch or clear their own goods, more slowly.
import { audio } from './audio.js';

import { thinkTownSiege, thinkSiegeDefence } from './ai.js';
import { TYPES, vetRank, VET_RANKS } from './battle.js';

export const GOODS = {
  wood: { name: 'Wood', icon: 'wood', color: '#c8925a' },
  stone: { name: 'Stone', icon: 'stone', color: '#bdb8ad' },
  food: { name: 'Food', icon: 'food', color: '#e07a5f' },
  flax: { name: 'Flax', icon: 'flax', color: '#9fc46e' },
  feathers: { name: 'Feathers', icon: 'feathers', color: '#ece6d6' },
  ore: { name: 'Iron ore', icon: 'ore', color: '#c47a58' },
  hides: { name: 'Hides', icon: 'hides', color: '#b08560' },
  planks: { name: 'Planks', icon: 'planks', color: '#e0b47a' },
  string: { name: 'String', icon: 'string', color: '#e6d6a6' },
  iron: { name: 'Iron', icon: 'iron', color: '#aeb8c4' },
  leather: { name: 'Leather', icon: 'leather', color: '#9a6a44' },
  flour: { name: 'Flour', icon: 'flour', color: '#efe6cf' },
  bread: { name: 'Bread', icon: 'bread', color: '#e3b26a' },
  shields: { name: 'Shields', icon: 'shields', color: '#d2a05a' },
  bows: { name: 'Bows', icon: 'bows', color: '#c89060' },
  arrows: { name: 'Arrows', icon: 'arrows', color: '#e2d4b0' },
  spears: { name: 'Spears', icon: 'spears', color: '#c4ccd6' },
  swords: { name: 'Swords', icon: 'swords', color: '#dfe4ea' },
  crossbows: { name: 'Crossbows', icon: 'crossbows', color: '#a8b0b8' },
  bolts: { name: 'Bolts', icon: 'bolts', color: '#b8c0c8' },
  lances: { name: 'Lances', icon: 'lances', color: '#e8d8a8' },
  mail: { name: 'Mail', icon: 'mail', color: '#9aa4ae' },
  armour: { name: 'Plate armour', icon: 'armour', color: '#d8dee6' },
  horses: { name: 'Horses', icon: 'horses', color: '#a07850' },
};
export const GOOD_GROUPS = [
  ['Raw', ['wood', 'stone', 'food', 'flax', 'feathers', 'ore', 'hides']],
  ['Made', ['planks', 'string', 'iron', 'leather', 'flour', 'bread']],
  ['Arms', ['shields', 'bows', 'arrows', 'spears', 'swords', 'crossbows', 'bolts', 'lances', 'mail', 'armour', 'horses']],
];

// gather: villagers walk out to a resource and carry it back.
// recipes: villagers work at the building, turning stock into stock. Each workshop can
// switch any of its recipes off; it takes turns between those left on. `keep` stops a
// recipe once that much of its output is stored. Arms have no limit: switch a recipe
// off to stop it.
// Workshops stop asking for wood once the village is down to its last, so construction can go on.
// Goods left for building: workshops don't ask for the last 20 wood, and none turns the last
// 25 planks into shields or arms.
export const RESERVE = { wood: 20, planks: 25 };
export const BUILDINGS = {
  house: { name: 'House', icon: 'house', group: 'Village', cost: { wood: 12 }, radius: 3.5, build: 10, housing: 6, hp: 120,
    desc: 'Room for 6 more villagers.' },
  storehouse: { name: 'Storehouse', icon: 'storehouse', group: 'Village', cost: { wood: 15 }, radius: 4.5, build: 12, jobs: 3, hp: 150,
    haul: true, storage: true, desc: 'Holds any goods. Its three haulers carry goods between the buildings around it.' },
  woodcutter: { name: 'Woodcutter', icon: 'woodcutter', group: 'Gather', cost: { wood: 10 }, radius: 3.5, build: 10, jobs: 3, hp: 120,
    gather: { node: 'tree', range: 40, need: 6, time: 5, out: { wood: 3 } }, desc: 'Fells trees for wood. Build it beside a wood.' },
  quarry: { name: 'Quarry', icon: 'quarry', group: 'Gather', cost: { wood: 12 }, radius: 3.5, build: 12, jobs: 2, hp: 120,
    gather: { node: 'rock', range: 35, need: 1, time: 8, out: { stone: 2 } }, desc: 'Cuts stone from a grey outcrop. Build it close to one.' },
  mine: { name: 'Mine', icon: 'mine', group: 'Gather', cost: { wood: 15, stone: 5 }, radius: 3.5, build: 15, jobs: 2, hp: 150,
    gather: { node: 'ore', range: 30, need: 1, time: 9, out: { ore: 2 } }, desc: 'Digs iron ore from a rust-red deposit. Build it close to one.' },
  hunter: { name: "Hunter's lodge", icon: 'hunter', group: 'Gather', cost: { wood: 10 }, radius: 3.5, build: 10, jobs: 2, hp: 120,
    gather: { node: 'tree', range: 55, need: 8, time: 10, out: { food: 3, feathers: 2, hides: 1 } }, desc: 'Hunts in the woods for food, feathers and hides.' },
  farm: { name: 'Farm', icon: 'farm', group: 'Gather', cost: { wood: 12 }, radius: 9, build: 12, jobs: 2, hp: 100,
    gather: { node: 'field', time: 7, out: { food: 4 } }, desc: 'Grows grain on its own field. Needs open ground.' },
  flax: { name: 'Flax field', icon: 'flaxfield', group: 'Gather', cost: { wood: 10 }, radius: 9, build: 10, jobs: 1, hp: 100,
    gather: { node: 'field', time: 8, out: { flax: 2 } }, desc: 'Grows flax for bowstring.' },
  carpenter: { name: 'Carpenter', icon: 'carpenter', group: 'Craft', cost: { wood: 15 }, radius: 3.5, build: 12, jobs: 1, hp: 120,
    recipes: [{ in: { wood: 2 }, out: { planks: 3 }, time: 7, keep: 40 }, { in: { planks: 2 }, out: { shields: 1 }, time: 6 }],
    desc: 'Saws wood into planks, and planks into shields.' },
  ropemaker: { name: 'Ropemaker', icon: 'ropemaker', group: 'Craft', cost: { wood: 15 }, radius: 4, build: 12, jobs: 1, hp: 120,
    recipes: [{ in: { flax: 2 }, out: { string: 1 }, time: 7, keep: 20 }], desc: 'Twists flax into bowstring.' },
  smelter: { name: 'Smelter', icon: 'smelter', group: 'Craft', cost: { wood: 10, stone: 15 }, radius: 3.5, build: 15, jobs: 1, hp: 150,
    recipes: [{ in: { ore: 2, wood: 1 }, out: { iron: 1 }, time: 9, keep: 20 }], desc: 'Smelts ore into iron, burning wood.' },
  bowyer: { name: 'Bowyer', icon: 'bowyer', group: 'Craft', cost: { planks: 10, stone: 5 }, radius: 3.5, build: 12, jobs: 1, hp: 120,
    recipes: [{ in: { planks: 2, string: 1 }, out: { bows: 1 }, time: 10 }, { in: { planks: 1, feathers: 2 }, out: { arrows: 10 }, time: 8 }],
    desc: 'Makes bows from planks and string, and arrows from planks and feathers.' },
  weaponsmith: { name: 'Weaponsmith', icon: 'weaponsmith', group: 'Craft', cost: { planks: 10, stone: 15 }, radius: 3.5, build: 15, jobs: 1, hp: 150,
    recipes: [{ in: { iron: 1, planks: 1 }, out: { spears: 1 }, time: 9 }, { in: { iron: 2 }, out: { swords: 1 }, time: 12 },
      { in: { planks: 2, iron: 1, string: 1 }, out: { crossbows: 1 }, time: 12, off: true }, { in: { planks: 1, iron: 1 }, out: { bolts: 10 }, time: 8, off: true },
      { in: { planks: 2, iron: 1 }, out: { lances: 1 }, time: 10, off: true }],
    desc: 'Fits iron heads to spear shafts, forges swords, and makes crossbows, bolts and lances.' },
  armourer: { name: 'Armourer', icon: 'armourer', group: 'Craft', cost: { planks: 15, stone: 20 }, radius: 4, build: 18, jobs: 1, hp: 160,
    recipes: [{ in: { iron: 2, leather: 1 }, out: { mail: 1 }, time: 12 }, { in: { mail: 1, iron: 2, leather: 1 }, out: { armour: 1 }, time: 18 }],
    desc: 'Rivets mail shirts from iron and leather, and beats plate from mail, iron and leather.' },
  tanner: { name: 'Tanner', icon: 'tanner', group: 'Craft', cost: { wood: 15 }, radius: 4, build: 12, jobs: 1, hp: 120,
    recipes: [{ in: { hides: 2 }, out: { leather: 1 }, time: 8, keep: 20 }], desc: "Cures the hunters' hides into leather." },
  mill: { name: 'Mill', icon: 'mill', group: 'Craft', cost: { wood: 20, stone: 5 }, radius: 4.5, build: 14, jobs: 1, hp: 140,
    recipes: [{ in: { food: 4 }, out: { flour: 3 }, time: 6, keep: 30 }], desc: 'Grinds grain into flour for the bakery.' },
  bakery: { name: 'Bakery', icon: 'bakery', group: 'Craft', cost: { wood: 15, stone: 10 }, radius: 4, build: 14, jobs: 1, hp: 140,
    recipes: [{ in: { flour: 2, wood: 1 }, out: { bread: 4 }, time: 8, keep: 80 }],
    desc: 'Bakes bread: more meals from the same grain, and a happier village.' },
  barracks: { name: 'Barracks', icon: 'barracks', group: 'Military', cost: { planks: 20, stone: 20 }, radius: 6, build: 20, hp: 250,
    desc: 'Holds the arms, and calls up villagers as soldiers when their kit is here.' },
  stable: { name: 'Stable', icon: 'stable', group: 'Military', cost: { planks: 20, wood: 10 }, radius: 7, build: 18, jobs: 2, hp: 180,
    recipes: [{ in: { food: 6 }, out: { horses: 1 }, time: 24 }], desc: 'Breeds and breaks horses for cavalry and knights, on grain.' },
  siegeworks: { name: 'Siege workshop', icon: 'siegeworks', group: 'Military', cost: { planks: 25, stone: 10 }, radius: 7, build: 20, hp: 200,
    engines: true, desc: 'Builds rams, ladders and stone-throwers from the materials carried here. Villagers go with them as crew.' },
  market: { name: 'Market', icon: 'market', group: 'Village', cost: { planks: 15, stone: 10 }, radius: 6, build: 16, jobs: 1, hp: 150, mood: 6,
    recipes: [
      { in: { wood: 10 }, out: {}, gold: 6, time: 4, above: 150 }, { in: { stone: 10 }, out: {}, gold: 7, time: 4, above: 80 },
      { in: { food: 10 }, out: {}, gold: 7, time: 4, above: 120 }, { in: { planks: 10 }, out: {}, gold: 12, time: 4, above: 60, off: true },
      { in: { iron: 5 }, out: {}, gold: 16, time: 4, above: 20, off: true }, { in: { swords: 2 }, out: {}, gold: 18, time: 4, above: 10, off: true },
    ],
    desc: 'Sells what the village has spare for gold, and lifts the mood. It only sells above a reserve; switch off what you want to keep.' },
  well: { name: 'Well', icon: 'well', group: 'Village', cost: { stone: 10 }, radius: 2.5, build: 8, hp: 150, mood: 3, desc: 'Clean water close by. Lifts the mood a little.' },
  monastery: { name: 'Chapel', icon: 'monastery', group: 'Village', cost: { stone: 30, planks: 10 }, radius: 6, build: 24, hp: 250, mood: 10,
    desc: 'A place to pray, wed and bury. Lifts the mood a good deal.' },
  cathedral: { name: 'Cathedral', icon: 'cathedral', group: 'Village', cost: { stone: 300, planks: 120, iron: 20 }, radius: 10, build: 240, hp: 900, mood: 25, great: true,
    desc: 'The showpiece of a realm: a great stone church, one in all your lands. Lifts the village a great deal, and once it is consecrated every great house and vassal thinks better of you. From the rank of Count, in a village of 100 people.' },
  watchtower: { name: 'Watchtower', icon: 'watchtower', group: 'Military', cost: { wood: 20, stone: 10 }, radius: 3, build: 14, hp: 200, sight: 120,
    desc: 'Lookouts who see far across the realm: armies and places further off show on the map.' },
  hall: { name: "Knights' hall", icon: 'hall', group: 'Military', cost: { planks: 40, stone: 60 }, radius: 7, build: 45, hp: 400, hall: true,
    desc: "Trains veterans into men-at-arms and knights: slow, costly and worth it. From the rank of Count, in a village whose keep is level 3." },
};
// Building upgrades: gold and goods, once the village is big enough. Each level works
// faster, houses hold more and stores keep more haulers.
export const UPGRADES = [null, null,
  { gold: 40, cost: { planks: 10, stone: 10 }, pop: 30 },
  { gold: 120, cost: { planks: 20, stone: 30 }, pop: 60 }];
export const SPEED = [1, 1, 1.35, 1.7];
// Tax rates: gold collected for each villager, and what the village thinks of it.
export const TAXES = [
  { name: 'No taxes', gold: 0, mood: 12 }, { name: 'Low taxes', gold: 0.5, mood: 6 }, { name: 'Fair taxes', gold: 1, mood: 0 },
  { name: 'High taxes', gold: 1.6, mood: -12 }, { name: 'Cruel taxes', gold: 2.3, mood: -26 },
];
// Hired men, paid in gold at the keep. They cost no villagers.
export const HIRES = ['sellsword', 'hiredxbow', 'household'].map(k => ({ key: k, name: TYPES[k].name, count: TYPES[k].count, gold: TYPES[k].gold * TYPES[k].count }));
export const BUILD_GROUPS = ['Village', 'Gather', 'Craft', 'Military'];
// Town templates, from the rank of Lord: a block of buildings laid out at once round the
// spot you pick, the first in the middle. Each has a focus, and a larger size once the
// village has the people for it (at). "Work the land" is different: its gatherers go to the
// woods, rock, ore and open ground nearest the spot, wherever those are.
export const TEMPLATES = {
  hamlet: { name: 'Houses round a well', icon: 'well', focus: 'Homes', list: ['well', 'house', 'house', 'house', 'house', 'house'],
    desc: 'Five houses round a well: room for thirty more people, and a little cheer.' },
  market: { name: 'Market square', icon: 'market', focus: 'Trade', list: ['market', 'well', 'storehouse', 'house', 'house', 'house', 'house'],
    desc: 'A market with a well and a storehouse, ringed by houses: gold and good cheer.' },
  workshops: { name: 'Workshop yard', icon: 'carpenter', focus: 'Production', list: ['storehouse', 'carpenter', 'smelter', 'tanner', 'house', 'house'],
    desc: 'A storehouse with a carpenter, a smelter and a tanner beside it, and homes for their workers.' },
  barracks: { name: 'Barracks yard', icon: 'barracks', focus: 'Military', list: ['barracks', 'weaponsmith', 'carpenter', 'storehouse', 'house', 'house'],
    desc: 'A barracks with the smith and carpenter that arm it, a storehouse, and homes.' },
  land: { name: 'Work the land', icon: 'farm', focus: 'Gathering', gather: true, list: ['woodcutter', 'woodcutter', 'quarry', 'mine', 'farm', 'farm'],
    desc: 'Two woodcutters, a quarry, a mine and two farms, each set by the nearest woods, outcrop, ore or open ground to where you click. Any with nothing to work is left out.' },
  hamlet2: { name: 'Houses round a green', icon: 'well', focus: 'Homes', at: 50, list: ['well', 'house', 'house', 'house', 'house', 'house', 'well', 'house', 'house', 'house', 'house'],
    desc: 'Eight houses and two wells round a green: room for fifty more people.' },
  market2: { name: 'Market town', icon: 'market', focus: 'Trade', at: 60, list: ['market', 'well', 'storehouse', 'mill', 'bakery', 'storehouse', 'house', 'house', 'house', 'house', 'house', 'house'],
    desc: 'A market with its mill and bakery, two storehouses and a ring of houses: gold, bread and cheer.' },
  workshops2: { name: 'Craft quarter', icon: 'carpenter', focus: 'Production', at: 60, list: ['storehouse', 'carpenter', 'smelter', 'tanner', 'ropemaker', 'bowyer', 'storehouse', 'house', 'house', 'house', 'house'],
    desc: 'The long chains in one quarter: carpenter, smelter, tanner, ropemaker and bowyer, with stores and homes.' },
  barracks2: { name: 'Garrison quarter', icon: 'barracks', focus: 'Military', at: 70, list: ['barracks', 'weaponsmith', 'armourer', 'bowyer', 'carpenter', 'storehouse', 'watchtower', 'house', 'house', 'house', 'house'],
    desc: 'A barracks with every smith that arms it, a watchtower over the yard, a storehouse and homes.' },
};
export const templateCost = t => {
  const c = {};
  for (const k of TEMPLATES[t].list) for (const [g, n] of Object.entries(BUILDINGS[k].cost)) c[g] = (c[g] || 0) + n;
  return c;
};

// What each villager needs to become a soldier of that type (battle.js sets the kits).
// Engines are raised at the siege workshop: their cost once, and a full crew.
// Armour is a tier of its own (creator, 2026-11-19): a unit's type sets its weapon, and
// each regiment wears one level of armour, the same for every man, and carries shields
// if its type can. Equipment sets protection; training (the hall, veterans) sets skill and
// nerve, so a plate-armoured levy is hard to kill but still breaks like a levy.
// Regiments and unit entries carry armour ('none' | 'leather' | 'mail' | 'plate') and
// shield (true | false); missing means the type's old kit (baseArmour, canShield).
export const ARMOURS = ['none', 'leather', 'mail', 'plate'];
export const ARMOUR_GOOD = { leather: 'leather', mail: 'mail', plate: 'armour' };
export const ARMOUR_NAME = { none: 'No armour', leather: 'Leather', mail: 'Mail', plate: 'Plate' };
// Weight in fights nobody watches, against the armour the type's strength was set for.
const ARMOUR_WEIGHT = { none: 1, leather: 1.1, mail: 1.22, plate: 1.38 };
const BODY = ['shields', 'leather', 'mail', 'armour'];
const fullKit = key => TYPES[key]?.kit || {};
export const weaponKit = key => Object.fromEntries(Object.entries(fullKit(key)).filter(([g]) => !BODY.includes(g)));
// Hired and household men bring their own shields and armour (TYPES shield and armour).
export const canShield = key => !!(fullKit(key).shields || TYPES[key]?.shield);
export const baseArmour = key => TYPES[key]?.armour ?? (fullKit(key).armour ? 'plate' : fullKit(key).mail ? 'mail' : 'none');
export const gearOf = u => ({ armour: u.armour ?? baseArmour(u.key ?? u.T?.key), shield: u.shield ?? canShield(u.key ?? u.T?.key) });
// What a regiment carries between the map and the field: its armour and its battle count
// (r.battles, the short service record on its card).
export const carry = u => ({ ...gearOf(u), battles: u.battles || 0 });
export const armourWeight = u => { const g = gearOf(u); return ARMOUR_WEIGHT[g.armour] / ARMOUR_WEIGHT[baseArmour(u.key)] * (canShield(u.key) && !g.shield ? 0.93 : 1); };
// A barracks' rule for its racks. Raising picks the armour for the whole regiment from it.
export const POLICIES = {
  best: { name: 'Best available', about: 'Each levy wears the best armour the racks hold enough of for every man, with shields if there are enough.' },
  elites: { name: 'Keep the best for elites', about: 'Levies get leather at most; mail and plate are kept for the knights\' hall.' },
  none: { name: 'None', about: 'Weapons only: no armour and no shields. Cheap and fast.' },
};
// What n men of this type get from these racks (have: good -> count) under this policy.
// One level for all of them: the best the racks hold n of. Elites need mail at least,
// and get plate if there is enough; null if there isn't mail for them.
export function outfit(key, n, have, policy = 'best', elite = false) {
  const levels = elite ? ['plate', 'mail'] : policy === 'none' ? [] : policy === 'elites' ? ['leather'] : ['plate', 'mail', 'leather'];
  const armour = levels.find(l => (have(ARMOUR_GOOD[l]) || 0) >= n) || (elite ? null : 'none');
  if (!armour) return null;
  const shield = canShield(key) && (elite || policy !== 'none') && (have('shields') || 0) >= n;
  return { armour, shield };
}
// The goods n men take: their weapons, and their armour and shields.
export function outfitKit(key, n, fit) {
  const kit = {};
  for (const [g, k] of Object.entries(weaponKit(key))) kit[g] = k * n;
  if (fit?.shield) kit.shields = (kit.shields || 0) + n;
  if (fit && fit.armour !== 'none') kit[ARMOUR_GOOD[fit.armour]] = (kit[ARMOUR_GOOD[fit.armour]] || 0) + n;
  return kit;
}
// Kit a man needs at the least: his weapons (KITS[key].kit), and what he wears by default.
export const KITS = Object.fromEntries(['spear', 'archer', 'sword', 'crossbow', 'maa', 'lightcav', 'cav', 'knight']
  .map(k => [k, { name: TYPES[k].name, kit: weaponKit(k) }]));
// Elite men come only from a knights' hall, trained from veterans: a few at a time, for
// their kit, a fee in gold and minutes of drill per man. A hall keeps so many at most.
export const ELITE = {
  maa: { fee: 8, drill: 45 },
  knight: { fee: 20, drill: 75 },
};
export const HALL = { batch: 6, cap: 24, veteran: 1 };   // veteran: the least experience (Blooded)
const keepLevel = t => t.keepLevel ? Math.max(1, Math.min(5, t.keepLevel)) : t.population >= 150 ? 5 : t.population >= 100 ? 4 : t.population >= 60 ? 3 : t.population >= 30 ? 2 : 1;
export const ENGINES = Object.fromEntries(['ladder', 'ram', 'mangonel', 'trebuchet']
  .map(k => [k, { name: TYPES[k].name, cost: TYPES[k].cost, crew: TYPES[k].count }]));

const KEEP = { name: 'Keep', icon: 'keep', radius: 11, housing: 12, hp: 1500, jobs: 2, haul: true, storage: true };
const LEVY_MAX = 20, LEVY_MIN = 5;
const WALK = 3.4;

// A crate holds 10 of most goods; a yard or workshop holds 30 of each before it stops
// for haulers. Arrows are light and go four times as far.
const CRATE = 10, HOLD = 30, BULK = { arrows: 4, bolts: 4 };
const crate = g => CRATE * (BULK[g] || 1);
const holdOf = g => HOLD * (BULK[g] || 1);
const ARMS = GOOD_GROUPS[2][1];

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const gone = b => b.removed || b.state === 'ruined';
const compass = p => ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(((Math.atan2(p.x, -p.z) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8];
const listCost = cost => Object.entries(cost).map(([g, n]) => `${n} ${GOODS[g].name.toLowerCase()}`).join(', ');
export { listCost };

export class Town {
  // timedRaids: bandits turn up on their own (the standalone village); on the world
  // map, attackers are real armies instead.
  // kind: what sort of place this is on the world map (realm.js KINDS); a mining village
  // has more ore and stone about, a castle a stronger keep.
  constructor(battle, heightAt, trees, rand, { timedRaids = false, villagers = 12, retinue = true, stock = null, kind = 'village' } = {}) {
    this.kind = kind;
    this.battle = battle;
    this.heightAt = heightAt;
    this.rand = rand;
    const keepB = kind === 'castle' || kind === 'crown' ? { ...KEEP, name: 'Castle', hp: 2400 } : KEEP;
    this.keep = { kind: 'keep', B: keepB, x: 0, z: 0, angle: 0, hp: keepB.hp, state: 'active', workers: [], status: '',
      store: { ...(stock || { wood: 140, stone: 40, food: 80, planks: 20 }) }, incoming: {}, reserved: {} };
    this.stockCache = null;
    this.buildings = [];
    this.villagers = [];
    this.trees = trees;
    this.nodes = { tree: trees.spots, rock: [], ore: [] };
    this.territory = 175;
    this.time = 0;
    this.nextMeal = 30;
    this.nextArrival = 20;
    this.hungry = false;
    // Gold goes to the lord's purse: the realm's treasury on the world map, the village's own here.
    this.purse = { gold: 0 };
    this.taxes = 2;
    this.mood = 60;
    this.moodWhy = [];
    this.grief = 0;
    this.moodClock = 0;
    this.leaveClock = 40;
    this.misery = 0;
    this.rebelCool = 300;
    this.timedRaids = timedRaids;
    this.raid = { next: 300, wave: 0 };
    this.attackers = [];
    this.lost = false;
    // Siege engines can batter the village's buildings (battle.js); a fallen one is ruined here.
    battle.structures = () => [this.keep, ...this.buildings];
    battle.onRuin = t => this.ruin(t);
    this.placeDeposits();
    for (let i = 0; i < villagers; i++) {
      const a = this.rand() * Math.PI * 2;
      this.addVillager(Math.sin(a) * 16, Math.cos(a) * 16);
    }
    // The lord's own men: professionals, not villagers, so they cost no workers.
    if (retinue) {
      const ret = battle.addRegiment(0, 'sword', 0, -24, Math.PI, { count: 20, name: "Lord's retinue" });
      ret.retinue = true;
    }
  }

  event(text, side = 0) { this.battle.events.push({ time: this.battle.time, side, text }); }

  // Grey stone outcrops and rust-red ore deposits, out in the open around the keep.
  placeDeposits() {
    const put = (kind, n, min, max) => {
      for (let k = 0, tries = 0; k < n && tries < 400; tries++) {
        const a = this.rand() * Math.PI * 2, r = min + this.rand() * (max - min);
        const p = { kind, x: Math.sin(a) * r, z: Math.cos(a) * r };
        if ([...this.nodes.rock, ...this.nodes.ore].some(o => dist(o, p) < 40)) continue;
        for (const t of this.nodes.tree) if (t.standing && dist(t, p) < 9) this.trees.fell(t);
        this.nodes[kind].push(p);
        k++;
      }
    };
    const rich = this.kind === 'mine';
    put('rock', rich ? 7 : 5, 55, 150);
    put('ore', rich ? 6 : 3, 80, 160);
  }

  addVillager(x, z) {
    const v = { id: this.villagers.length, x, z, y: this.heightAt(x, z), yaw: 0, v: 0, phase: this.rand() * 6,
      state: 'idle', job: null, task: null, carry: null, load: null, hidden: false, soldier: null, wander: null, checkCd: this.rand() };
    this.villagers.push(v);
    return v;
  }

  get housing() { return KEEP.housing + this.buildings.filter(b => b.state === 'active' && b.B.housing).reduce((n, b) => n + b.B.housing + 3 * ((b.level || 1) - 1), 0); }
  // Workers a building takes: stores keep one more hauler for each level.
  jobs(b) { return (b.B.jobs || 0) + (b.B.haul ? (b.level || 1) - 1 : 0); }
  speed(b) { return SPEED[b.level || 1]; }
  get population() { return this.villagers.length; }
  get idle() { return this.villagers.filter(v => v.state === 'idle' || v.state === 'haul').length; }
  get hauling() { return this.villagers.filter(v => v.task?.kind === 'haul').length; }

  // ---- where goods are ----

  // Everything that can hold goods: the keep and every standing building or site.
  holders() { return [this.keep, ...this.buildings.filter(b => b.state !== 'ruined')]; }
  stores() { return this.holders().filter(b => b.B.storage && b.state === 'active'); }

  put(b, g, n) {
    b.store[g] = (b.store[g] || 0) + n;
    if (b.store[g] <= 1e-6) delete b.store[g];
    this.stockCache = null;
  }

  // The village's goods wherever they are, crates on the road included. Materials
  // already delivered to a building site are spent.
  get stock() {
    if (this.stockCache) return this.stockCache;
    const s = Object.fromEntries(Object.keys(GOODS).map(g => [g, 0]));
    for (const b of this.holders()) if (b.state === 'active') for (const g in b.store) s[g] += b.store[g];
    for (const v of this.villagers) if (v.load) s[v.load.g] += v.load.n;
    return (this.stockCache = s);
  }

  // What is still to come for building sites, and so not free for anything else.
  owed(g) {
    let n = 0;
    for (const b of this.buildings) if (b.state === 'site') n += Math.max(0, (b.B.cost[g] || 0) - (b.store[g] || 0));
    return n;
  }
  free(g) { return this.stock[g] - this.owed(g); }

  // How much of each good a building is asking for, as a total it wants to hold.
  wants(b) {
    if (b.state === 'site') return b.B.cost;
    if (b.state !== 'active' || b.paused) return {};
    if (b.kind === 'barracks') return Object.fromEntries(ARMS.map(g => [g, Infinity]));
    if (b.B.engines) return { wood: 45, planks: 45, string: 12, iron: 8 };
    if (!b.B.recipes) return {};
    const w = {};
    for (const r of this.wantedRecipes(b)) {
      for (const [g, n] of Object.entries(r.in)) {
        if (this.free(g) < (RESERVE[g] || 0)) continue;
        w[g] = Math.max(w[g] || 0, n * 3);
      }
    }
    return w;
  }

  // Planks are left for building: no workshop turns the last 25 into shields or arms.
  savingPlanks(r) { return 'planks' in r.in && !('planks' in r.out) && this.free('planks') < RESERVE.planks + r.in.planks; }

  // Recipes switched on that the village still wants and the workshop has room for.
  wantedRecipes(b) {
    return b.B.recipes.filter((r, i) => !b.off.has(i)
      && !this.savingPlanks(r)
      && Object.keys(r.out).every(k => this.stock[k] < (r.keep ?? Infinity) && (b.store[k] || 0) < holdOf(k))
      // a market sells only what is spare above its reserve
      && (r.above === undefined || Object.entries(r.in).every(([g, n]) => this.free(g) >= r.above + n)));
  }

  // What may be carried away from a building. Workshops keep what they need themselves;
  // the barracks keeps its arms.
  spare(b, g, wants) {
    if (b.state !== 'active' || b.kind === 'barracks' || !(b.B.storage || b.B.gather || b.B.recipes)) return 0;
    const own = b.B.recipes ? (wants.get(b)[g] || 0) : 0;
    return Math.max(0, (b.store[g] || 0) - own - (b.reserved[g] || 0));
  }

  // Whether a delivery of this good belongs here.
  takes(b, g) {
    if (gone(b)) return false;
    if (b.state === 'site' || b.B.storage) return true;
    if (b.kind === 'barracks') return ARMS.includes(g);
    if (b.B.engines) return g in this.wants(b);
    return !!b.B.recipes?.some(r => g in r.in || g in r.out);
  }

  nearestStore(p, except = null) {
    let best = this.keep, bd = Infinity;
    for (const b of this.stores()) if (b !== except && dist(b, p) < bd) { bd = dist(b, p); best = b; }
    return best;
  }

  // Where arms go when nobody is carrying them: the nearest barracks, or the stores.
  armoury(p) {
    let best = null, bd = Infinity;
    for (const b of this.buildings) if (b.kind === 'barracks' && b.state === 'active' && dist(b, p) < bd) { bd = dist(b, p); best = b; }
    return best || this.nearestStore(p);
  }

  door(b, v) {
    if (b === this.keep) { const a = Math.atan2(v.x, v.z); return { x: Math.sin(a) * (KEEP.radius + 1), z: Math.cos(a) * (KEEP.radius + 1) }; }
    return { x: b.x + Math.sin(b.angle) * (b.B.radius + 1), z: b.z + Math.cos(b.angle) * (b.B.radius + 1) };
  }

  // ---- hauling ----
  // The best crate for a villager to carry next. Building sites are served first, then
  // workshops, then arms for the barracks; then full yards and workshops are cleared
  // into the nearest store. `only` keeps a worker to jobs for their own building.
  planHaul(v, only = null) {
    const holders = this.holders();
    const wants = new Map(holders.map(b => [b, this.wants(b)]));
    const stores = this.stores();
    let best = null, bs = Infinity;
    const consider = (from, to, g, n, rank) => {
      if (n < 1) return;
      const s = rank * 150 + dist(v, from) + dist(from, to);
      if (s < bs) { bs = s; best = { from, to, g, n: Math.min(Math.floor(n), crate(g)) }; }
    };
    for (const to of holders) {
      const w = wants.get(to);
      const rank = to.state === 'site' ? 0 : to.kind === 'barracks' ? 2 : 1;
      for (const g in w) {
        const need = w[g] - (to.store[g] || 0) - (to.incoming[g] || 0);
        if (need < 1) continue;
        for (const from of holders) {
          if (from === to || (only && only !== to && only !== from)) continue;
          consider(from, to, g, Math.min(need, this.spare(from, g, wants)), rank);
        }
      }
    }
    const barracks = this.buildings.some(b => b.kind === 'barracks' && b.state === 'active');
    for (const from of holders) {
      if (from.B.storage || (only && only !== from)) continue;
      for (const g in from.store) {
        if (barracks && ARMS.includes(g)) continue;
        const n = this.spare(from, g, wants);
        if (!only && n < Math.min(crate(g), 5 * (BULK[g] || 1))) continue;
        let to = null, bd = Infinity;
        for (const s of stores) if (dist(s, from) < bd) { bd = dist(s, from); to = s; }
        consider(from, to || this.keep, g, n, 3);
      }
    }
    if (!best) return null;
    best.from.reserved[best.g] = (best.from.reserved[best.g] || 0) + best.n;
    best.to.incoming[best.g] = (best.to.incoming[best.g] || 0) + best.n;
    return { kind: 'haul', phase: 'fetch', ...best };
  }

  doHaul(v, dt) {
    const t = v.task;
    if (t.phase === 'fetch') {
      if (gone(t.from)) { this.cancelHaul(v); return true; }
      const d = this.door(t.from, v);
      if (!this.walk(v, d.x, d.z, dt)) return false;
      t.from.reserved[t.g] -= t.n;
      const n = Math.min(t.n, t.from.store[t.g] || 0);
      t.to.incoming[t.g] -= t.n - n;
      if (n < 1) { t.to.incoming[t.g] -= n; v.task = null; return true; }
      this.put(t.from, t.g, -n);
      t.n = n;
      v.load = { g: t.g, n };
      v.carry = t.g;
      t.phase = 'deliver';
      return false;
    }
    // A building that burned or no longer wants it: take the crate to the nearest store.
    if (!this.takes(t.to, t.g)) {
      t.to.incoming[t.g] -= t.n;
      t.to = this.nearestStore(v, t.from);
      t.to.incoming[t.g] = (t.to.incoming[t.g] || 0) + t.n;
    }
    const d = this.door(t.to, v);
    if (!this.walk(v, d.x, d.z, dt)) return false;
    this.put(t.to, t.g, t.n);
    audio.play('crate', t.to, this.battle); // audio
    t.to.incoming[t.g] -= t.n;
    v.load = null;
    v.carry = null;
    v.task = null;
    return true;
  }

  // Drops a planned trip. A crate already picked up is set down in the nearest store.
  cancelHaul(v) {
    const t = v.task;
    if (t?.kind === 'haul') {
      if (t.phase === 'fetch') t.from.reserved[t.g] -= t.n;
      t.to.incoming[t.g] -= t.n;
    }
    if (v.load) this.put(this.nearestStore(v), v.load.g, v.load.n);
    v.load = null;
    v.carry = null;
    v.task = null;
  }

  // Haulers at the keep and storehouses take crate after crate, and wait by the door
  // when there is nothing to carry.
  doHaulJob(v, dt) {
    if (v.task) { this.doHaul(v, dt); return; }
    v.waitCd = (v.waitCd || 0) - dt;
    if (v.waitCd <= 0) {
      v.waitCd = 1;
      v.task = this.planHaul(v);
      if (v.task) return;
    }
    const d = this.door(v.job, v);
    this.walk(v, d.x, d.z, dt);
  }

  // ---- placing buildings ----

  canAfford(cost) { return Object.entries(cost).every(([g, n]) => this.free(g) >= n); }

  canPlace(kind, x, z, { free = false } = {}) {
    const B = BUILDINGS[kind], p = { x, z };
    if (!free && !this.canAfford(B.cost)) return { ok: false, reason: `Needs ${listCost(B.cost)}` };
    if (B.hall) {
      const why = this.hallRule?.() || (keepLevel(this) < 3 ? 'Needs a keep of level 3 (60 people)' : null);
      if (why) return { ok: false, reason: why };
    }
    if (B.great) {
      const why = this.greatRule?.(kind) || (this.population < 100 ? 'Needs a village of 100 people' : null);
      if (why) return { ok: false, reason: why };
    }
    if (Math.hypot(x, z) > this.territory) return { ok: false, reason: 'Outside your land' };
    if (Math.hypot(x, z) < KEEP.radius + B.radius + 3) return { ok: false, reason: 'Too close to the keep' };
    for (const b of this.buildings) if (dist(b, p) < b.B.radius + B.radius + 1.5) return { ok: false, reason: 'Something is in the way' };
    for (const n of [...this.nodes.rock, ...this.nodes.ore]) if (dist(n, p) < B.radius + 6) return { ok: false, reason: 'Something is in the way' };
    if (this.battle.walls.structureAt(x, z) || this.battle.walls.pieceAt(x, z, null, B.radius)) return { ok: false, reason: 'A wall is in the way' };
    const h = this.heightAt(x, z), r = B.radius;
    for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
      if (Math.abs(this.heightAt(x + dx, z + dz) - h) > (r > 5 ? 3.5 : 2)) return { ok: false, reason: 'Ground too steep' };
    }
    const g = B.gather;
    if (g && g.node !== 'field') {
      const near = this.nodes[g.node].filter(n => (n.standing ?? true) && dist(n, p) < g.range && dist(n, p) > B.radius + 1).length;
      if (near < g.need) return { ok: false, reason: g.node === 'tree' ? 'Needs woods nearby' : g.node === 'rock' ? 'Needs a stone outcrop nearby' : 'Needs an ore deposit nearby' };
    }
    return { ok: true };
  }

  // The cost is set aside at once, and carried to the site before builders can finish.
  // `ready` puts up a finished building for free (villages that start with some).
  place(kind, x, z, { ready = false, free = false } = {}) {
    const check = ready ? { ok: true } : this.canPlace(kind, x, z, { free });
    if (!check.ok) return check;
    const B = BUILDINGS[kind];
    for (const t of this.nodes.tree) if (t.standing && Math.hypot(t.x - x, t.z - z) < B.radius + 2) this.trees.fell(t);
    const b = { id: this.buildings.length + 1, kind, B, x, z, angle: Math.atan2(-x, -z), state: 'site', progress: 0,
      hp: B.hp, workers: [], builders: [], paused: false, recipe: null, timer: 0, status: 'Waiting for builders',
      off: new Set((B.recipes || []).flatMap((r, i) => r.off ? [i] : [])), turn: 0, store: {}, incoming: {}, reserved: {} };
    if (ready) Object.assign(b, { state: 'active', progress: 1, status: B.jobs ? 'Waiting for workers' : '' });
    this.buildings.push(b);
    this.stockCache = null;
    return { ok: true, building: b };
  }

  // Lays out a town template round (x, z): the first building as near the spot as it fits,
  // the rest in rings round it. All of it must be affordable at once.
  placeTemplate(name, x, z) {
    const T = TEMPLATES[name];
    if (!T) return { ok: false, reason: 'No such template' };
    if (T.at && this.population < T.at) return { ok: false, reason: `Needs ${T.at} people` };
    const cost = templateCost(name);
    if (!this.canAfford(cost)) return { ok: false, reason: `Needs ${listCost(cost)}` };
    const placed = [];
    if (T.gather) {
      for (const kind of T.list) { const res = this.placeGatherer(kind, x, z); if (res) placed.push(res); }
      if (!placed.length) return { ok: false, reason: 'Nothing to work near here' };
      return { ok: true, placed: placed.length, of: T.list.length };
    }
    for (const kind of T.list) {
      let done = false;
      for (let r = 0; r <= 48 && !done; r += 3) {
        const steps = r ? Math.max(6, Math.round(r * 0.9)) : 1;
        for (let i = 0; i < steps && !done; i++) {
          const a = (i / steps) * Math.PI * 2 + r * 0.37;
          const res = this.place(kind, x + Math.sin(a) * r, z + Math.cos(a) * r, { free: true });
          if (res.ok) { placed.push(res.building); done = true; }
        }
      }
    }
    if (!placed.length) return { ok: false, reason: 'No room here' };
    return { ok: true, placed: placed.length, of: T.list.length };
  }

  // One gatherer, set beside the resource nearest (x, z) that no other of its kind works
  // yet; a farm on the open ground nearest the spot.
  placeGatherer(kind, x, z) {
    const B = BUILDINGS[kind], g = B.gather, at = { x, z };
    const tries = [];
    if (g.node === 'field') tries.push(at);
    else {
      const worked = this.buildings.filter(b => b.kind === kind);
      const nodes = this.nodes[g.node].filter(n => (n.standing ?? true) && !worked.some(b => dist(b, n) < g.range * 0.5))
        .sort((p, q) => dist(p, at) - dist(q, at)).slice(0, 24);
      tries.push(...nodes);
    }
    for (const c of tries) {
      for (let r = g.node === 'field' ? 12 : B.radius + 7; r <= (g.node === 'field' ? 70 : g.range * 0.7); r += 3) {
        const steps = Math.max(8, Math.round(r * 0.8));
        for (let i = 0; i < steps; i++) {
          const a = (i / steps) * Math.PI * 2 + r * 0.53;
          const res = this.place(kind, c.x + Math.sin(a) * r, c.z + Math.cos(a) * r, { free: true });
          if (res.ok) return res.building;
        }
      }
    }
    return null;
  }

  demolish(b) {
    for (const v of [...b.workers, ...b.builders]) this.release(v);
    // What it held goes to the nearest store, with half the cost if it was standing
    // (all of what reached a site). A ruin returns nothing.
    if (b.state !== 'ruined') {
      const to = this.nearestStore(b, b);
      if (b.state === 'active') for (const [g, n] of Object.entries(b.B.cost)) this.put(to, g, Math.floor(n / 2));
      for (const [g, n] of Object.entries(b.store)) this.put(to, g, n);
    }
    b.store = {};
    this.buildings = this.buildings.filter(o => o !== b);
    b.removed = true;
    this.stockCache = null;
  }

  // Switches one of a workshop's recipes on or off.
  toggleRecipe(b, i) {
    if (b.off.has(i)) b.off.delete(i); else b.off.add(i);
  }

  setPaused(b, paused) {
    b.paused = paused;
    if (paused) for (const v of [...b.workers]) this.release(v);
  }

  release(v) {
    if (v.job) v.job.workers = v.job.workers.filter(o => o !== v);
    for (const b of this.buildings) b.builders = b.builders.filter(o => o !== v);
    this.cancelHaul(v);
    v.job = null;
    v.site = null;
    if (v.state !== 'soldier' && v.state !== 'shelter' && v.state !== 'flee') v.state = 'idle';
  }

  // ---- levies ----

  // Kit is taken from this barracks' own racks, so it has to be carried there first.
  levyCheck(key, barracks) {
    const kit = KITS[key].kit, have = g => Math.floor(barracks.store[g] || 0);
    const byKit = Math.min(...Object.entries(kit).map(([g, n]) => Math.floor(have(g) / n)));
    const free = this.villagers.filter(v => v.state !== 'soldier').length;
    const n = Math.min(LEVY_MAX, byKit, free);
    const short = Object.entries(kit).filter(([g, k]) => have(g) < k * LEVY_MIN)
      .map(([g, k]) => `${k * LEVY_MIN} ${GOODS[g].name.toLowerCase()} here (has ${have(g)})`);
    const reason = byKit < LEVY_MIN ? `Needs ${short.join(' and ')}`
      : free < LEVY_MIN ? `Needs ${LEVY_MIN} villagers` : null;
    const fit = outfit(key, Math.max(1, n), have, barracks.policy || 'best');
    return { n, ok: !reason, reason, fit };
  }

  raise(key, barracks) {
    const check = this.levyCheck(key, barracks);
    if (!check.ok) return check;
    // Idle villagers answer first, then gatherers, then craftsmen; the nearest first within each.
    const rank = v => (v.state === 'idle' ? 0 : v.job && v.job.B.gather ? 1 : 2) * 1000 + dist(v, barracks);
    const men = this.villagers.filter(v => v.state !== 'soldier').sort((a, b) => rank(a) - rank(b)).slice(0, check.n);
    // One level of armour for the whole regiment, by the barracks' rule for its racks.
    const fit = outfit(key, men.length, g => Math.floor(barracks.store[g] || 0), barracks.policy || 'best');
    for (const [g, n] of Object.entries(outfitKit(key, men.length, fit))) this.put(barracks, g, -n);
    const out = Math.atan2(barracks.x, barracks.z);
    const fx = barracks.x + Math.sin(out) * 16, fz = barracks.z + Math.cos(out) * 16;
    for (const v of men) { this.release(v); v.hidden = false; }
    // Veterans come home: men who fought before bring their experience back to the levy.
    const xp = Math.round(men.reduce((n, v) => n + (v.xp || 0), 0) / men.length * 10) / 10;
    const r = this.battle.addRegiment(0, key, fx, fz, out, { count: men.length, from: men, name: `Levy ${KITS[key].name.toLowerCase()}`, xp, ...fit });
    Object.assign(r, fit);
    r.levy = key;
    r.soldiers.forEach((s, i) => { men[i].state = 'soldier'; men[i].soldier = s; s.villager = men[i]; });
    audio.play('drums', barracks, this.battle); // audio: a levy raised
    this.event(`${men.length} villagers took up ${KITS[key].name.toLowerCase() === 'archers' ? 'bows' : 'arms'}.`);
    return { ok: true, reg: r };
  }

  // Survivors hand back their kit at the nearest barracks and go home to work. The
  // lord's retinue can be sent to work too: each man becomes a villager and racks a
  // sword and a shield, so the barracks can arm them again later.
  disband(r) {
    if (r.gone || r.routing) return false;
    const rack = this.armoury({ x: r.cx, z: r.cz });
    if (r.retinue) {
      let n = 0;
      for (const s of r.soldiers) {
        if (!s.alive || s.gone) continue;
        this.addVillager(s.x, s.z);
        for (const [g, k] of Object.entries(KITS.sword.kit)) this.put(rack, g, k);
        n++;
      }
      this.battle.disband(r);
      this.event(`The lord's retinue hung up their swords: ${n} new villagers.`);
      return true;
    }
    if (!r.levy) return false;
    for (const s of r.soldiers) {
      if (!s.alive || s.gone || !s.villager) continue;
      const v = s.villager;
      Object.assign(v, { x: s.x, z: s.z, state: 'idle', soldier: null, xp: Math.max(v.xp || 0, r.xp || 0) });
      if (KITS[r.levy]) for (const [g, n] of Object.entries(outfitKit(r.levy, 1, gearOf(r)))) this.put(rack, g, n);
    }
    this.battle.disband(r);
    this.event(`${r.name} went home to work.`);
    return true;
  }

  // A regiment swaps up its armour and shields at the nearest barracks without standing
  // down: same men, name and experience, better kit. Its old kit goes back on the racks.
  refitCheck(r) {
    if (!r || r.side !== 0 || r.gone || r.routing || !(r.levy || r.elite) || r.T.engine) return { ok: false, reason: 'Only your own levies and elites refit' };
    const rack = this.buildings.filter(b => b.kind === 'barracks' && b.state === 'active').sort((a, b) => dist(a, { x: r.cx, z: r.cz }) - dist(b, { x: r.cx, z: r.cz }))[0];
    if (!rack) return { ok: false, reason: 'Needs a barracks' };
    const was = gearOf(r), n = r.alive;
    // What it wears now counts as on the racks: a refit never leaves men worse off.
    const have = g => Math.floor(rack.store[g] || 0) + (ARMOUR_GOOD[was.armour] === g || (g === 'shields' && was.shield) ? n : 0);
    const fit = outfit(r.T.key, n, have, 'best', !!r.elite);
    if (!fit) return { ok: false, reason: 'Not enough mail or plate for them', rack };
    const better = ARMOURS.indexOf(fit.armour) > ARMOURS.indexOf(was.armour) || (fit.shield && !was.shield);
    if (!better || ARMOURS.indexOf(fit.armour) < ARMOURS.indexOf(was.armour)) return { ok: false, reason: `${rack.B.name}: nothing better for ${n} men`, rack, fit: was };
    return { ok: true, rack, fit, was };
  }

  refit(r) {
    const c = this.refitCheck(r);
    if (!c.ok) return c;
    const n = r.alive, { rack, fit, was } = c;
    for (const [g, k] of Object.entries(outfitKit(r.T.key, n, { armour: was.armour, shield: was.shield }))) if (!(g in weaponKit(r.T.key))) this.put(rack, g, k);
    for (const [g, k] of Object.entries(outfitKit(r.T.key, n, fit))) if (!(g in weaponKit(r.T.key))) this.put(rack, g, -k);
    Object.assign(r, fit);
    this.event(`${r.name} are refitted: ${ARMOUR_NAME[fit.armour].toLowerCase()}${fit.shield ? ' and shields' : ''}.`);
    return { ok: true };
  }

  // When a fight in the village is over, the regiments that fought and lived learn from it
  // (battle.js vetRank): the experience a levy takes home with its men.
  blooded() {
    const up = [];
    for (const r of this.battle.regs) {
      if (r.side !== 0 || r.gone || r.T.engine || !r.fought || r.alive <= 0) continue;
      const kills = r.kills - (r.killsSeen || 0);
      r.killsSeen = r.kills;
      r.fought = false;
      r.xp = Math.round(((r.xp || 0) + 1 + Math.min(1, kills / Math.max(1, r.initial))) * 10) / 10;
      r.battles = (r.battles || 0) + 1;
      const rank = vetRank(r.xp);
      if (rank > (r.vet || 0)) { r.vet = rank; up.push(`${r.name} are ${VET_RANKS[rank].toLowerCase()}`); }
    }
    if (up.length) this.event(`${up.join('; ')}.`);
  }

  // ---- the knights' hall ----

  veterans() { return this.villagers.filter(v => v.state !== 'soldier' && (v.xp || 0) >= HALL.veteran); }
  hallMen(hall) { return this.battle.regs.filter(r => r.hall === hall.id && !r.gone).reduce((n, r) => n + r.alive, 0); }

  trainCheck(key, hall) {
    const E = ELITE[key];
    if (hall.state !== 'active') return { ok: false, reason: 'Not built yet' };
    if (hall.training) return { ok: false, reason: `Training ${hall.training.n} ${KITS[hall.training.key].name.toLowerCase()}` };
    const room = HALL.cap - this.hallMen(hall);
    if (room <= 0) return { ok: false, reason: `The hall holds ${HALL.cap} men` };
    const vets = this.veterans().length;
    if (!vets) return { ok: false, reason: 'Needs veterans: villagers who fought as levies and came home' };
    const kit = KITS[key].kit;
    // Elites wear mail at the least, plate if there is enough for every man.
    const byArmour = Math.max(Math.floor(this.free('mail')), Math.floor(this.free('armour')));
    const byKit = Math.min(byArmour, ...Object.entries(kit).map(([g, n]) => Math.floor(this.free(g) / n)));
    const byGold = Math.floor(this.purse.gold / E.fee);
    const n = Math.min(HALL.batch, room, vets, byKit, byGold);
    const short = Object.entries(kit).filter(([g, k]) => this.free(g) < k).map(([g]) => GOODS[g].name.toLowerCase());
    if (byArmour < 1) short.push('mail or plate');
    if (n < 1) return { ok: false, reason: byKit < 1 ? `Short of ${short.join(', ')}` : `Needs ${E.fee} gold each` };
    return { ok: true, n, fit: outfit(key, n, g => Math.floor(this.free(g)), 'best', true) };
  }

  // Kit and fees are paid now; the veterans drill for minutes before they march out.
  train(key, hall) {
    const c = this.trainCheck(key, hall);
    if (!c.ok) return c;
    const E = ELITE[key];
    this.spend(outfitKit(key, c.n, c.fit));
    this.purse.gold -= E.fee * c.n;
    hall.training = { key, n: c.n, left: E.drill * c.n, total: E.drill * c.n, ...c.fit };
    this.event(`${c.n} veterans have begun their training as ${KITS[key].name.toLowerCase()}.`);
    return { ok: true };
  }

  updateHalls(dt) {
    for (const hall of this.buildings) {
      const T = hall.training;
      if (!T || hall.state !== 'active') continue;
      T.left -= dt;
      hall.status = `Training ${T.n} ${KITS[T.key].name.toLowerCase()}: ${Math.ceil(T.left / 60)} min left`;
      if (T.left > 0) continue;
      hall.training = null;
      hall.status = '';
      const men = this.veterans().sort((a, b) => (b.xp || 0) - (a.xp || 0)).slice(0, T.n);
      // Veterans who died meanwhile: their kit goes back to the stores.
      const fit = { armour: T.armour ?? baseArmour(T.key), shield: T.shield ?? canShield(T.key) };
      if (men.length < T.n) for (const [g, k] of Object.entries(outfitKit(T.key, T.n - men.length, fit))) this.put(this.keep, g, k);
      if (!men.length) { this.event('The veterans in training are gone; their kit is back in the stores.'); continue; }
      for (const v of men) { this.release(v); v.hidden = false; }
      const xp = Math.max(...men.map(v => v.xp || 0)) + 2;
      const out = Math.atan2(hall.x, hall.z);
      const r = this.battle.addRegiment(0, T.key, hall.x + Math.sin(out) * 18, hall.z + Math.cos(out) * 18, out,
        { count: men.length, from: men, name: KITS[T.key].name, xp, ...fit });
      Object.assign(r, { levy: T.key, elite: true, hall: hall.id }, fit);
      r.soldiers.forEach((s, i) => { men[i].state = 'soldier'; men[i].soldier = s; s.villager = men[i]; });
      audio.play('drums', hall, this.battle); // audio
      this.event(`${men.length} ${KITS[T.key].name.toLowerCase()} have finished their training.`);
    }
  }

  // ---- engines, hired men and upgrades ----

  // An engine is built from the materials in this workshop and crewed by villagers.
  engineCheck(key, works) {
    const E = ENGINES[key], have = g => Math.floor(works.store[g] || 0);
    const short = Object.entries(E.cost).filter(([g, n]) => have(g) < n).map(([g, n]) => `${n} ${GOODS[g].name.toLowerCase()} here (has ${have(g)})`);
    const free = this.villagers.filter(v => v.state !== 'soldier').length;
    const reason = short.length ? `Needs ${short.join(' and ')}` : free < E.crew ? `Needs ${E.crew} villagers as crew` : null;
    return { ok: !reason, reason };
  }

  buildEngine(key, works) {
    const check = this.engineCheck(key, works);
    if (!check.ok) return check;
    const E = ENGINES[key];
    const rank = v => (v.state === 'idle' ? 0 : v.job && v.job.B.gather ? 1 : 2) * 1000 + dist(v, works);
    const men = this.villagers.filter(v => v.state !== 'soldier').sort((a, b) => rank(a) - rank(b)).slice(0, E.crew);
    for (const [g, n] of Object.entries(E.cost)) this.put(works, g, -n);
    const out = Math.atan2(works.x, works.z);
    const fx = works.x + Math.sin(out) * 16, fz = works.z + Math.cos(out) * 16;
    for (const v of men) { this.release(v); v.hidden = false; }
    const r = this.battle.addRegiment(0, key, fx, fz, out, { count: men.length, from: men, name: E.name });
    r.levy = key;
    r.soldiers.forEach((s, i) => { men[i].state = 'soldier'; men[i].soldier = s; s.villager = men[i]; });
    audio.play('drums', works, this.battle); // audio: an engine rolled out
    this.event(`A ${E.name.toLowerCase()} is ready, with ${men.length} villagers to work it.`);
    return { ok: true, reg: r };
  }

  hireCheck(key) {
    const H = HIRES.find(h => h.key === key);
    return this.purse.gold >= H.gold ? { ok: true } : { ok: false, reason: `Needs ${H.gold} gold (have ${Math.floor(this.purse.gold)})` };
  }

  // Hired men march in from the road and stand by the keep. They cost no villagers.
  hire(key) {
    const check = this.hireCheck(key);
    if (!check.ok) return check;
    const H = HIRES.find(h => h.key === key);
    this.purse.gold -= H.gold;
    const a = this.rand() * Math.PI * 2;
    const r = this.battle.addRegiment(0, key, Math.sin(a) * 30, Math.cos(a) * 30, a + Math.PI, { count: H.count, name: H.name });
    if (TYPES[key].retinue) r.retinue = true;
    audio.play('drums', this.keep, this.battle); // audio
    this.event(`${H.count} ${H.name.toLowerCase()} have taken your gold.`);
    return { ok: true, reg: r };
  }

  upgradeCheck(b) {
    const U = UPGRADES[(b.level || 1) + 1];
    if (!U || b.state !== 'active' || b.B.hall || b.B.great) return { ok: false, reason: 'Fully upgraded', done: true };
    if (this.population < U.pop) return { ok: false, reason: `Needs a village of ${U.pop} people` };
    if (this.purse.gold < U.gold) return { ok: false, reason: `Needs ${U.gold} gold` };
    if (!this.canAfford(U.cost)) return { ok: false, reason: `Needs ${listCost(U.cost)}` };
    return { ok: true, U };
  }

  upgrade(b) {
    const check = this.upgradeCheck(b);
    if (!check.ok) return check;
    this.purse.gold -= check.U.gold;
    this.spend(check.U.cost);
    b.level = (b.level || 1) + 1;
    this.event(`The ${b.B.name.toLowerCase()} is now level ${b.level}.`);
    return { ok: true };
  }

  // Takes goods out of the stores first, then from anywhere they lie.
  spend(cost) {
    for (const [g, n] of Object.entries(cost)) {
      let left = n;
      for (const b of [...this.stores(), ...this.holders()]) {
        const k = Math.min(left, b.store[g] || 0);
        if (k > 0) { this.put(b, g, -k); left -= k; }
        if (left <= 0) break;
      }
    }
  }

  // ---- mood ----
  // Each village has a mood from its food, its comforts, its taxes and its losses. Mood
  // draws newcomers (or drives families away) and sets how much tax comes in.
  updateMood(dt) {
    this.grief *= Math.exp(-dt / 240);
    this.moodClock -= dt;
    if (this.moodClock <= 0) {
      this.moodClock = 3;
      const why = [];
      const add = (n, text) => { if (n) why.push([n, text]); };
      const meals = this.stores().reduce((n, b) => n + (b.store.food || 0) + (b.store.bread || 0), 0);
      add(this.hungry ? -30 : meals >= this.population * 2 ? 8 : 0, this.hungry ? 'going hungry' : 'full larders');
      add(this.hadBread ? 8 : 0, 'bread on the table');
      const comfort = {};
      for (const b of this.buildings) if (b.state === 'active' && b.B.mood) (comfort[b.kind] = comfort[b.kind] || []).push(b.B.mood * (1 + 0.25 * ((b.level || 1) - 1)));
      for (const [k, list] of Object.entries(comfort)) add(Math.round(list.sort((a, b) => b - a).slice(0, 3).reduce((n, m, i) => n + m / (i + 1), 0)), BUILDINGS[k].name.toLowerCase());
      add(TAXES[this.taxes].mood, TAXES[this.taxes].name.toLowerCase());
      add(this.population >= this.housing ? -5 : 0, 'crowded homes');
      add(-Math.round(Math.min(35, this.grief)), 'mourning the dead');
      for (const f of this.moodHooks || []) add(...f());
      add(this.underAttack ? -10 : 0, 'under attack');
      this.moodWhy = why.sort((a, b) => Math.abs(b[0]) - Math.abs(a[0]));
      this.moodWant = Math.max(0, Math.min(100, 50 + why.reduce((n, [k]) => n + k, 0)));
    }
    this.mood += Math.sign(this.moodWant - this.mood) * Math.min(Math.abs(this.moodWant - this.mood), dt * 0.5);
    // Miserable villages lose families to kinder lords.
    if (this.mood < 20 && !this.underAttack) {
      this.leaveClock -= dt;
      if (this.leaveClock <= 0) {
        this.leaveClock = 40;
        const v = this.villagers.find(o => o.state === 'idle') || this.villagers.find(o => o.state !== 'soldier' && o.state !== 'shelter');
        if (v && this.population > 6) {
          this.release(v);
          this.villagers = this.villagers.filter(o => o !== v);
          this.event('A family has packed up and left for kinder lords.', 1);
        }
      }
    }
    // Kept wretched for two minutes, a big enough village rises: the angriest take up
    // pitchforks, gather in the woods and come back to burn. Afterwards the rest are cowed.
    this.rebelCool -= dt;
    this.misery = this.mood < 15 && !this.underAttack ? this.misery + dt : Math.max(0, this.misery - dt * 2);
    if (this.misery >= 120 && this.rebelCool <= 0 && this.population >= 15 && !this.revolt) this.rebel();
  }

  // The angriest drop their work, gather by the keep, march out to the woods, and come
  // back as a raid by the way they went: you can see it coming the whole time.
  rebel() {
    const n = Math.min(40, Math.max(6, Math.round(this.population * 0.3)));
    const out = this.villagers.filter(v => v.state !== 'soldier' && v.state !== 'shelter').slice(-n);
    const a = this.rand() * Math.PI * 2;
    for (const v of out) {
      this.release(v);
      v.state = 'rebel';
      v.hidden = false;
      v.load = null; v.carry = null;
      v.spot = { x: Math.sin(a) * 26 + (this.rand() - 0.5) * 10, z: Math.cos(a) * 26 + (this.rand() - 0.5) * 10 };
    }
    this.revolt = { a, n: out.length, time: 0, phase: 'gather' };
    this.misery = 0;
    this.rebelCool = 600;
    this.mood = Math.min(100, this.mood + 15);
    this.grief = 0;
    this.event(`${out.length} angry villagers have thrown down their tools and are gathering by the keep!`, 1);
    this.onRebel?.(out.length);
  }

  updateRevolt(dt) {
    const R = this.revolt;
    if (!R) return;
    R.time += dt;
    const rebels = this.villagers.filter(v => v.state === 'rebel');
    if (R.phase === 'gather' && R.time > 14) {
      R.phase = 'leave';
      this.event('The rebels are marching out to the woods. They will be back with torches.', 1);
      for (const v of rebels) v.spot = { x: Math.sin(R.a) * 205 + (this.rand() - 0.5) * 16, z: Math.cos(R.a) * 205 + (this.rand() - 0.5) * 16 };
    }
    if (R.phase === 'leave' && (!rebels.length || R.time > 90)) {
      this.villagers = this.villagers.filter(v => v.state !== 'rebel');
      R.phase = 'away';
      R.time = 0;
    }
    if (R.phase === 'away' && R.time > 25) {
      this.revolt = null;
      this.receiveAttack([{ key: 'militia', count: R.n, name: 'Rebel peasants' }], R.a, { mode: 'raid', name: 'Rebels', house: this.rebelHouse ?? 1 });
    }
  }

  // Gold for each villager each second at this tax rate, weighed by the mood.
  get taxRate() { return 0.012 * TAXES[this.taxes].gold * (0.6 + this.mood / 125); }

  // ---- simulation ----

  update(dt) {
    if (this.lost) return;
    this.time += dt;
    this.stockCache = null;
    // A place you are storming is only a battlefield until it is yours.
    if (this.hostile) { this.updateAttacks(dt); this.updateBurning(dt); return; }
    for (const v of this.villagers) this.updateVillager(v, dt);
    for (const b of this.buildings) if (b.state === 'active') this.updateBuilding(b, dt);
    this.updatePeople(dt);
    this.updateAttacks(dt);
  }

  nearestEnemy(p, radius) {
    let best = null, bd = radius * radius;
    this.battle.forNear(p.x, p.z, radius, s => {
      if (s.reg.side === 0) return;
      const d = (s.x - p.x) ** 2 + (s.z - p.z) ** 2;
      if (d < bd) { bd = d; best = s; }
    });
    return best;
  }

  walk(v, tx, tz, dt, speed = WALK) {
    if (Math.hypot(tx - v.x, tz - v.z) < 0.6) { v.v = 0; return true; }
    // Round any walls, through the gates (battle.js).
    ({ x: tx, z: tz } = this.battle.steerWalker(v, 0, tx, tz, dt));
    const dx = tx - v.x, dz = tz - v.z, d = Math.hypot(dx, dz) || 0.01;
    const step = Math.min(d, speed * dt);
    v.x += dx / d * step; v.z += dz / d * step;
    v.y = this.heightAt(v.x, v.z);
    v.yaw = Math.atan2(dx, dz);
    v.v = speed;
    v.phase += step * 2.2;
    return false;
  }

  updateVillager(v, dt) {
    if (v.state === 'rebel') {
      // out past the trees, they are gone from the village
      if (this.walk(v, v.spot.x, v.spot.z, dt, this.revolt?.phase === 'leave' ? WALK * 1.1 : WALK) && this.revolt?.phase === 'leave') v.gone = true;
      if (v.gone) this.villagers = this.villagers.filter(o => o !== v);
      return;
    }
    if (v.state === 'soldier') {
      // A levy who falls in battle is a villager lost.
      if (!v.soldier.alive) { v.dead = true; this.release(v); this.grief += 3; }
      return;
    }
    v.v = 0;
    v.checkCd -= dt;
    if (v.checkCd <= 0) {
      v.checkCd = 0.6;
      if (v.state === 'shelter') {
        const safeHome = !this.nearestEnemy(this.keep, 70);
        const work = v.job || this.keep;
        if (safeHome && !this.nearestEnemy(work, 45)) { v.state = v.job ? 'work' : 'idle'; v.hidden = false; v.task = null; }
      } else if (this.nearestEnemy(v, 28)) {
        // Run for the keep, still holding any crate; the trip itself is off.
        const load = v.load;
        v.load = null;
        this.cancelHaul(v);
        v.load = load;
        v.carry = load ? load.g : null;
        v.state = 'flee';
      } else if (v.state === 'idle') {
        this.findWork(v);
        // Villagers with no job carry goods.
        if (v.state === 'idle' && (v.task = this.planHaul(v))) v.state = 'haul';
      }
    }
    if (v.state === 'flee') {
      if (this.walk(v, this.keep.x + (this.rand() - 0.5) * 4, this.keep.z + (this.rand() - 0.5) * 4, dt, WALK * 1.5)) {
        v.state = 'shelter';
        v.hidden = true;
        if (v.load) this.put(this.keep, v.load.g, v.load.n);
        v.load = null;
        v.carry = null;
      }
      return;
    }
    if (v.state === 'shelter') return;
    if (v.state === 'haul') { if (this.doHaul(v, dt) && !v.task) v.state = 'idle'; return; }
    if (v.state === 'idle') {
      if (!v.wander || this.walk(v, v.wander.x, v.wander.z, dt, WALK * 0.5)) {
        const a = this.rand() * Math.PI * 2, r = 13 + this.rand() * 8;
        v.wander = this.rand() < 0.02 || !v.wander ? { x: Math.sin(a) * r, z: Math.cos(a) * r } : v.wander;
      }
      return;
    }
    if (v.state === 'build') return this.doBuild(v, dt);
    if (v.state === 'work') return v.job.B.haul ? this.doHaulJob(v, dt) : v.job.B.gather ? this.doGather(v, dt) : this.doCraft(v, dt);
  }

  // A worker who is stuck carries a crate for their own building, then gets back to it.
  selfHaul(v, dt) {
    if (v.task?.kind === 'haul') { this.doHaul(v, dt); return true; }
    v.waitCd = (v.waitCd || 0) - dt;
    if (v.waitCd > 0) return false;
    v.waitCd = 1;
    v.task = this.planHaul(v, v.job || v.site);
    return !!v.task;
  }

  // Sites get builders first, then empty workplaces fill, nearest first.
  findWork(v) {
    let best = null, bd = Infinity;
    for (const b of this.buildings) {
      if (b.state === 'site' && b.builders.length < 2) {
        const d = dist(v, b) - 1000;
        if (d < bd) { bd = d; best = b; }
      }
    }
    if (best) { best.builders.push(v); v.state = 'build'; v.job = null; v.site = best; return; }
    for (const b of [this.keep, ...this.buildings]) {
      if (b.state !== 'active' || b.paused || !b.B.jobs || b.workers.length >= this.jobs(b)) continue;
      const d = dist(v, b);
      if (d < bd) { bd = d; best = b; }
    }
    if (best) { best.workers.push(v); v.job = best; v.state = 'work'; v.task = null; }
  }

  // Builders can only get as far as the materials on site allow. When more are needed
  // and nobody is bringing them, they fetch them themselves.
  delivered(b) {
    const cost = Object.entries(b.B.cost), all = cost.reduce((n, [, k]) => n + k, 0);
    return cost.reduce((n, [g, k]) => n + Math.min(k, b.store[g] || 0), 0) / all;
  }

  doBuild(v, dt) {
    const b = v.site;
    if (!b || b.removed || b.state !== 'site') { this.release(v); return; }
    if (v.task?.kind === 'haul') { this.doHaul(v, dt); return; }
    const ready = this.delivered(b);
    if (b.progress >= ready - 1e-6) {
      const short = Object.entries(b.B.cost).filter(([g, k]) => (b.store[g] || 0) + (b.incoming[g] || 0) < k);
      if (short.length && this.selfHaul(v, dt)) return;
      b.status = short.length ? `Waiting for ${short.map(([g]) => GOODS[g].name.toLowerCase()).join(' and ')}` : 'Materials on the way';
    }
    const a = Math.atan2(v.x - b.x, v.z - b.z);
    if (!this.walk(v, b.x + Math.sin(a) * (b.B.radius + 0.8), b.z + Math.cos(a) * (b.B.radius + 0.8), dt)) return;
    v.yaw = Math.atan2(b.x - v.x, b.z - v.z);
    if (b.progress >= ready - 1e-6) return;
    v.phase += dt * 6;
    b.progress = Math.min(ready, b.progress + dt / b.B.build);
    b.status = 'Under construction';
    audio.tick('hammer', b, dt, 1.5, this.battle); // audio
    if (b.progress >= 1 - 1e-6) {
      b.progress = 1;
      b.store = {};
      this.stockCache = null;
      b.state = 'active';
      b.status = b.B.jobs ? 'Waiting for workers' : '';
      const crew = b.builders;
      b.builders = [];
      for (const o of crew) { o.state = 'idle'; o.site = null; }
      // Builders stay on as the first workers.
      for (const o of crew) if (b.B.jobs && b.workers.length < this.jobs(b)) { b.workers.push(o); o.job = b; o.state = 'work'; o.task = null; }
      this.event(`${b.B.name} finished.`);
      audio.play('built', b, this.battle); // audio
      if (b.B.hall || b.B.great) this.onMilestone?.(b);
    }
  }

  doGather(v, dt) {
    const b = v.job, g = b.B.gather;
    if (v.task?.kind === 'haul') { this.doHaul(v, dt); return; }
    // A full yard stops work until haulers clear it; meanwhile the workers carry crates off themselves.
    if (!v.task && Object.keys(g.out).some(k => (b.store[k] || 0) >= holdOf(k))) {
      if (!this.selfHaul(v, dt)) b.status = 'Yard full: needs haulers';
      return;
    }
    if (!v.task) v.task = { phase: 'out' };
    const t = v.task;
    if (t.phase === 'out') {
      if (!t.spot) t.spot = this.pickSpot(b);
      if (!t.spot) { b.status = 'Nothing left to gather'; return; }
      if (this.walk(v, t.spot.x, t.spot.z, dt)) { t.phase = 'gather'; t.timer = g.time / this.speed(b); }
    } else if (t.phase === 'gather') {
      t.timer -= dt;
      v.phase += dt * 5;
      b.status = 'Working';
      audio.tick(g.node, v, dt, 1.2, this.battle); // audio: chopping or picking
      if (t.timer <= 0) { t.phase = 'back'; v.carry = Object.keys(g.out)[0]; }
    } else if (this.walk(v, b.x + Math.sin(b.angle) * (b.B.radius + 1), b.z + Math.cos(b.angle) * (b.B.radius + 1), dt)) {
      for (const [k, n] of Object.entries(g.out)) this.put(b, k, n);
      v.carry = null;
      v.task = null;
    }
  }

  pickSpot(b) {
    const g = b.B.gather;
    if (g.node === 'field') {
      const a = this.rand() * Math.PI * 2, r = this.rand() * (b.B.radius - 2);
      return { x: b.x + Math.sin(a) * r, z: b.z + Math.cos(a) * r };
    }
    // A random choice among the closest few, so workers spread out.
    const near = this.nodes[g.node].filter(n => (n.standing ?? true) && dist(n, b) < g.range)
      .sort((p, q) => dist(p, b) - dist(q, b)).slice(0, 6);
    if (!near.length) return null;
    const n = near[Math.floor(this.rand() * near.length)];
    const a = this.rand() * Math.PI * 2, off = g.node === 'tree' ? 1.6 : 4.5;
    return { x: n.x + Math.sin(a) * off, z: n.z + Math.cos(a) * off };
  }

  doCraft(v, dt) {
    const b = v.job;
    if (v.task?.kind === 'haul') { this.doHaul(v, dt); return; }
    const door = this.door(b, v);
    if (!this.walk(v, door.x, door.z, dt)) return;
    v.yaw = b.angle + Math.PI;
    if (b.workers[0] !== v) return;           // one craftsman sets the pace
    if (b.recipe) {
      b.timer -= dt;
      v.phase += dt * 4;
      audio.tick('hammer', b, dt, 0.6, this.battle); // audio
      if (b.timer <= 0) {
        for (const [k, n] of Object.entries(b.recipe.out)) this.put(b, k, n);
        if (b.recipe.gold) { this.purse.gold += b.recipe.gold; this.earned = (this.earned || 0) + b.recipe.gold; }
        b.recipe = null;
      }
      return;
    }
    // Take turns among the recipes switched on that the village still wants and whose
    // inputs are here in the workshop.
    const list = b.B.recipes;
    const wanted = this.wantedRecipes(b);
    const can = r => Object.entries(r.in).every(([k, n]) => (b.store[k] || 0) >= n);
    let ready = null;
    for (let k = 0; k < list.length && !ready; k++) {
      const i = (b.turn + k) % list.length;
      if (wanted.includes(list[i]) && can(list[i])) { ready = list[i]; b.turn = i + 1; }
    }
    if (ready) {
      for (const [k, n] of Object.entries(ready.in)) this.put(b, k, -n);
      b.recipe = ready;
      b.timer = ready.time / this.speed(b);
      b.status = ready.gold ? `Selling ${GOODS[Object.keys(ready.in)[0]].name.toLowerCase()}` : `Making ${GOODS[Object.keys(ready.out)[0]].name.toLowerCase()}`;
      return;
    }
    if (b.off.size === list.length) { b.status = 'Nothing switched on'; return; }
    // Stuck: fetch the inputs or clear the finished goods by hand.
    const full = list.some((r, i) => !b.off.has(i) && Object.keys(r.out).some(k => (b.store[k] || 0) >= holdOf(k)));
    if (wanted.length) {
      const missing = Object.keys(wanted[0].in).filter(k => (b.store[k] || 0) < wanted[0].in[k]);
      b.status = `Waiting for ${missing.map(k => GOODS[k].name.toLowerCase()).join(' and ')}`;
    } else {
      b.status = full ? 'Store full: needs haulers'
        : list.some((r, i) => !b.off.has(i) && this.savingPlanks(r)) ? 'Saving planks for building' : 'Village has enough';
    }
    this.selfHaul(v, dt);
  }

  updateBuilding(b, dt) {
    if (b.B.engines) b.status = Object.keys(ENGINES).some(k => this.engineCheck(k, b).ok) ? 'Ready to build an engine' : 'Waiting for materials';
    if (!b.B.jobs) return;
    if (b.paused) b.status = 'Paused';
    else if (!b.workers.length) b.status = 'No workers';
    else if (b.B.haul) b.status = this.haulStatus(b);
    // Damage mends slowly once the raiders are gone.
    if (b.hp < b.B.hp && !this.nearestEnemy(b, 40)) b.hp = Math.min(b.B.hp, b.hp + dt * 2);
  }

  haulStatus(b) {
    const busy = b.workers.filter(v => v.task?.kind === 'haul').length;
    return busy ? `${busy} carrying goods` : 'Haulers waiting for work';
  }

  // Meals, newcomers and the dead.
  updatePeople(dt) {
    if (this.villagers.some(v => v.dead)) this.villagers = this.villagers.filter(v => !v.dead);
    this.nextMeal -= dt;
    if (this.nextMeal <= 0) {
      this.nextMeal = 30;
      // Meals come out of the keep and storehouses, not food still lying at the farms.
      // Bread goes first: a loaf is a meal, and it goes further than the grain it came from.
      let need = Math.ceil(this.population / 2);
      const stores = this.stores();
      this.hungry = stores.reduce((n, b) => n + (b.store.food || 0) + (b.store.bread || 0), 0) < need;
      this.hadBread = stores.some(b => (b.store.bread || 0) >= 1);
      for (const g of ['bread', 'food']) for (const b of stores) {
        const n = Math.min(need, b.store[g] || 0);
        if (n > 0) { this.put(b, g, -n); need -= n; }
      }
      if (this.hungry) this.event('The village is going hungry. Nobody new will settle.', 1);
    }
    this.updateMood(dt);
    this.updateHalls(dt);
    this.updateRevolt(dt);
    this.nextArrival -= dt;
    if (this.nextArrival <= 0) {
      // A happy village draws newcomers faster; a sullen one draws nobody.
      this.nextArrival = this.mood >= 75 ? 11 : 18;
      if (!this.hungry && this.mood >= 35 && this.population < this.housing && !this.underAttack) {
        const a = this.rand() * Math.PI * 2;
        const v = this.addVillager(Math.sin(a) * 120, Math.cos(a) * 120);
        v.wander = { x: Math.sin(a) * 15, z: Math.cos(a) * 15 };
        this.event('A new family has settled in the village.');
      }
    }
    this.keep.status = this.keep.workers.length ? this.haulStatus(this.keep) : 'No haulers';
    if (this.keep.hp < this.keep.B.hp && !this.nearestEnemy(this.keep, 50)) this.keep.hp = Math.min(this.keep.B.hp, this.keep.hp + dt * 5);
  }

  // ---- attackers ----
  // Enemy regiments in the village come in groups. A raid burns a few buildings and
  // leaves by the road it came in on; an assault fights on until the keep falls. A siege
  // camps outside first (g.prepare seconds), fighting only those who come out to it,
  // then assaults. `house` is the attacking house's index on the world map.

  get underAttack() { return this.attackers.length > 0; }

  edgePoint(angle) { return { x: Math.sin(angle) * 215, z: Math.cos(angle) * 215 }; }

  receiveAttack(specs, angle, { mode = 'raid', name = 'Raiders', onLeave = null, house = 1, prepare = 100 } = {}) {
    const b = this.battle, entry = this.edgePoint(angle);
    b.homes[1] = entry;
    const face = Math.atan2(-entry.x, -entry.z);
    const regs = specs.map((sp, i) => {
      const off = (i - (specs.length - 1) / 2) * 30;
      return Object.assign(b.addRegiment(1, sp.key, entry.x + Math.cos(face) * off, entry.z - Math.sin(face) * off, face, { count: sp.count, name: sp.name, ...carry(sp) }), carry(sp));
    });
    this.attackers.push({ regs, mode, entry, time: 0, burned: 0, leaving: false, onLeave, house, prepare: mode === 'siege' ? prepare : 0 });
    this.event(mode === 'siege' ? `${name} has made camp to the ${compass(entry)} and is readying an assault!`
      : `${name} ${mode === 'raid' ? 'are raiding' : 'are attacking'} the village from the ${compass(entry)}!`, 1);
    audio.play('horn', null, this.battle); audio.play('drums', null, this.battle); // audio
  }

  updateAttacks(dt) {
    for (const g of [...this.attackers]) {
      const live = g.regs.filter(r => !r.gone);
      if (!live.length) { this.endAttack(g); continue; }
      g.time += dt;
      if (g.mode === 'siege' && g.time >= g.prepare) {
        g.mode = 'assault';
        this.event('The besiegers are coming! The assault has begun.', 1);
      }
      if (g.mode === 'raid' && !g.leaving && (g.burned >= 3 || g.time > 150)) {
        g.leaving = true;
        this.event('The raiders are making off with their plunder.');
      }
      if (g.leaving || this.hostile) continue;
      // Attackers not fighting set fire to whatever they stand beside.
      for (const r of live) {
        if (r.routing || r.regrouping || !r.raidTarget || r.engaged > 0) continue;
        const t = r.raidTarget;
        if (t.removed || t.state === 'ruined') { r.raidTarget = null; continue; }
        if (Math.hypot(r.cx - t.x, r.cz - t.z) > t.B.radius + 9) continue;
        t.hp -= dt * r.alive * 0.35;
        if (t.hp <= 0) this.ruin(t, g);
      }
    }
    if (this.timedRaids && !this.underAttack) {
      this.raid.next -= dt;
      if (this.raid.next <= 0) this.startRaid();
    }
  }

  endAttack(g) {
    this.attackers = this.attackers.filter(o => o !== g);
    if (!this.underAttack && !this.lost && !this.hostile) this.blooded();
    const survivors = g.regs.map(r => ({ key: r.T.key, name: r.name, count: r.soldiers.filter(s => s.alive).length, ...carry(r) })).filter(sp => sp.count > 0);
    if (!this.lost && g.mode !== 'hold' && !this.hostile) this.event('The attackers are gone. The village breathes again.');
    g.onLeave?.(survivors);
  }

  ruin(t, g) {
    t.hp = 0;
    if (t === this.keep) {
      this.lost = true;
      this.event('The keep has fallen.', 1);
      audio.play('gate', t, this.battle); // audio
      if (this.onFall) this.onFall(); else this.battle.winner = 1;
      return;
    }
    t.state = 'ruined';
    t.status = this.hostile ? 'Burned by your men' : 'Burned by raiders';
    if (!this.hostile) this.grief += 4;
    if (g) g.burned++;
    for (const v of [...t.workers, ...t.builders]) this.release(v);
    // Whatever was kept there is carried off or lost in the fire.
    const lost = Object.values(t.store).reduce((n, k) => n + k, 0);
    t.store = {};
    this.stockCache = null;
    audio.play('burn', t, this.battle); // audio
    if (this.hostile) this.event(`Your men have burned their ${t.B.name.toLowerCase()}.`);
    else this.event(`Raiders burned the ${t.B.name.toLowerCase()}${lost >= 1 ? ` and took ${Math.floor(lost)} goods` : ''}!`, 1);
  }

  // Practice raids for the standalone village, from bandits who come out of nowhere.
  startRaid() {
    const w = ++this.raid.wave;
    this.raid.next = Math.max(150, 260 - w * 15);
    let men = 10 + w * 6;
    const specs = [];
    while (men > 0) { specs.push({ key: 'bandit', count: Math.min(20, men), name: 'Bandit band' }); men -= 20; }
    if (w >= 3) specs.push({ key: 'archer', count: 8 + w * 2, name: 'Bandit archers' });
    this.receiveAttack(specs, this.rand() * Math.PI * 2, { name: 'Bandits' });
  }

  // Attackers fight soldiers who come near; otherwise they make for the nearest building.
  thinkAttackers() {
    const b = this.battle;
    thinkTownSiege(this);      // ai.js: hosts that must get past walls
    if (this.hostile) this.thinkHolders();
    const defenders = b.regs.filter(r => r.side === 0 && !r.gone && !r.routing && !r.regrouping);
    const targets = [...this.buildings.filter(o => o.state !== 'ruined'), this.keep];
    for (const g of this.attackers) {
      for (const r of g.regs) {
        if (r.gone || r.routing || r.regrouping || r.ai === 'siege') continue;
        if (g.mode === 'hold') { if (!g.onWalls) this.holdPost(r, defenders); continue; }
        if (g.leaving) {
          // Back down the road and away; only men who are caught still fight.
          r.targetReg = null;
          r.dest = { x: g.entry.x, z: g.entry.z, angle: Math.atan2(g.entry.x - r.cx, g.entry.z - r.cz) };
          if (Math.hypot(g.entry.x - r.cx, g.entry.z - r.cz) < 20) b.disband(r);
          continue;
        }
        const near = defenders.filter(d => Math.hypot(d.cx - r.cx, d.cz - r.cz) < (r.T.range ? r.T.range : 45))
          .sort((p, q) => Math.hypot(p.cx - r.cx, p.cz - r.cz) - Math.hypot(q.cx - r.cx, q.cz - r.cz))[0];
        if (near) { if (r.targetReg !== near) b.orderAttack([r], near); continue; }
        if (r.targetReg) continue;
        // Besiegers hold their camp a little way in from the road until they are ready.
        if (g.mode === 'siege') {
          const i = g.regs.indexOf(r), side = Math.atan2(g.entry.x, g.entry.z) + Math.PI / 2;
          const off = (i - (g.regs.length - 1) / 2) * 24;
          const cx = g.entry.x * 0.78 + Math.sin(side) * off, cz = g.entry.z * 0.78 + Math.cos(side) * off;
          if (!r.dest || Math.hypot(r.dest.x - cx, r.dest.z - cz) > 3) r.dest = { x: cx, z: cz, angle: Math.atan2(-g.entry.x, -g.entry.z) };
          continue;
        }
        if (!r.raidTarget || r.raidTarget.state === 'ruined' || r.raidTarget.removed) {
          // An assault goes for the keep; raiders for whatever is closest.
          r.raidTarget = g.mode === 'assault' ? this.keep
            : targets.sort((p, q) => Math.hypot(p.x - r.cx, p.z - r.cz) - Math.hypot(q.x - r.cx, q.z - r.cz))[0];
        }
        const t = r.raidTarget;
        const a = Math.atan2(t.x - r.cx, t.z - r.cz);
        const stand = t.B.radius + 4;
        const dx = t.x - Math.sin(a) * stand, dz = t.z - Math.cos(a) * stand;
        if (!r.dest || Math.hypot(r.dest.x - dx, r.dest.z - dz) > 3) r.dest = { x: dx, z: dz, angle: a };
      }
    }
  }

  // ---- storming someone else's village ----
  // When you attack a place on the world map, you fight in the place itself. `hostile`
  // says whose it is; its garrison stands round the keep as a 'hold' group (side 1 is
  // always the village's enemy here, so the defenders are on that side). Nothing is built
  // or worked until it is yours. Your men can put its buildings to the torch.

  holdKeep(specs, entryAngle, { house = 1 } = {}) {
    const b = this.battle, n = specs.length;
    b.homes[0] = this.edgePoint(entryAngle);            // your broken men run back down the road
    b.homes[1] = this.edgePoint(entryAngle + Math.PI);  // theirs out the far side
    const ranged = key => ['archer', 'crossbow', 'hiredxbow'].includes(key);
    const regs = specs.map((sp, i) => {
      const a = entryAngle + (i - (n - 1) / 2) * Math.min(0.55, 2.8 / Math.max(1, n));
      // Inside their walls if they have them, else in a ring out in front of the keep.
      const d = b.walls.any ? (ranged(sp.key) ? 13 : 17) : ranged(sp.key) ? 16 : 32;
      const r = Object.assign(b.addRegiment(1, sp.key, Math.sin(a) * d, Math.cos(a) * d, a, { count: sp.count, name: sp.name, ...carry(sp) }), carry(sp));
      r.post = { x: Math.sin(a) * d, z: Math.cos(a) * d, angle: a };
      return r;
    });
    this.attackers.push({ regs, mode: 'hold', entry: { x: 0, z: 0 }, time: 0, burned: 0, leaving: false, onLeave: null, house, prepare: 0 });
  }

  // Behind walls, the garrison mans them (ai.js); in the open, each regiment keeps a post.
  thinkHolders() {
    const b = this.battle;
    for (const g of this.attackers) {
      if (g.mode !== 'hold') continue;
      g.onWalls = b.walls.structures().some(s => s.side === 1 && s.state === 'up');
      if (g.onWalls) thinkSiegeDefence(b, 1, { regs: g.regs.filter(r => !r.gone && !r.routing) });
    }
  }

  // A defender fights whoever comes near its post, but never chases far from it.
  holdPost(r, foes) {
    const b = this.battle, p = r.post;
    const reach = r.T.range ? r.T.range + 10 : 55;
    const near = foes.filter(d => Math.hypot(d.cx - p.x, d.cz - p.z) < reach)
      .sort((x, y) => Math.hypot(x.cx - r.cx, x.cz - r.cz) - Math.hypot(y.cx - r.cx, y.cz - r.cz))[0];
    if (near) { if (r.targetReg !== near) b.orderAttack([r], near); return; }
    if (r.targetReg) r.targetReg = null;
    if (Math.hypot(r.cx - p.x, r.cz - p.z) > 4 && (!r.dest || Math.hypot(r.dest.x - p.x, r.dest.z - p.z) > 3)) r.dest = { x: p.x, z: p.z, angle: p.angle };
  }

  // Sends the nearest of your free regiments to set a building alight.
  burn(t) {
    if (!this.hostile || t === this.keep || t.state === 'ruined') return null;
    const regs = this.battle.regs.filter(r => r.side === 0 && !r.gone && !r.routing && !r.regrouping);
    const r = regs.sort((x, y) => (x.engaged > 0) - (y.engaged > 0) || Math.hypot(x.cx - t.x, x.cz - t.z) - Math.hypot(y.cx - t.x, y.cz - t.z))[0];
    if (!r) return null;
    const a = Math.atan2(t.x - r.cx, t.z - r.cz), stand = t.B.radius + 4;
    r.targetReg = null;
    r.burnTarget = t;
    r.burnStand = { x: t.x - Math.sin(a) * stand, z: t.z - Math.cos(a) * stand };
    r.dest = { ...r.burnStand, angle: a };
    return r;
  }

  updateBurning(dt) {
    for (const r of this.battle.regs) {
      const t = r.burnTarget;
      if (!t) continue;
      const st = r.burnStand;
      // Given other orders, or the job is done: they stop.
      if (r.gone || r.routing || t.state === 'ruined' || (r.dest && Math.hypot(r.dest.x - st.x, r.dest.z - st.z) > 4)) { r.burnTarget = null; continue; }
      if (r.engaged > 0 || Math.hypot(r.cx - t.x, r.cz - t.z) > t.B.radius + 9) continue;
      t.hp -= dt * r.alive * 0.35;
      if (t.hp <= 0) { this.ruin(t, null); r.burnTarget = null; }
    }
  }

  // The place is yours: its defenders are beaten, its people come out of hiding.
  claim({ villagers = 10, stock = null } = {}) {
    const b = this.battle;
    this.hostile = null;
    b.homes[0] = { x: 0, z: 0 };
    b.homes[1] = { x: 0, z: -225 };
    for (const g of this.attackers.filter(g => g.mode === 'hold')) for (const r of g.regs) if (!r.gone) { b.clearPosts(r); b.disband(r); }
    b.walls.changeSide(1, 0);   // their walls are yours now, broken stretches and all
    this.attackers = this.attackers.filter(g => g.mode !== 'hold');
    for (const r of b.regs) r.burnTarget = null;
    for (let i = 0; i < villagers; i++) {
      const a = this.rand() * Math.PI * 2;
      this.addVillager(Math.sin(a) * 12, Math.cos(a) * 12);
    }
    if (stock) for (const [g, n] of Object.entries(stock)) this.keep.store[g] = (this.keep.store[g] || 0) + n;
    this.stockCache = null;
  }

  // ---- troops coming and going on the world map ----

  // Regiments arriving by road march in from the edge. Levies bring their villagers.
  addTroops(specs, angle, { stand: standAt = 40 } = {}) {
    const entry = this.edgePoint(angle);
    const face = Math.atan2(-entry.x, -entry.z);
    for (const sp of specs) {
      const from = [];
      for (let i = 0; i < sp.count; i++) from.push({ x: entry.x + (this.rand() - 0.5) * 14, z: entry.z + (this.rand() - 0.5) * 14 });
      const fit = carry(sp);
      const r = this.battle.addRegiment(0, sp.key, entry.x, entry.z, face, { count: sp.count, name: sp.name, from, xp: sp.xp || 0, ...fit });
      Object.assign(r, fit);
      r.levy = sp.levy || null;
      r.retinue = !!sp.retinue;
      r.elite = !!sp.elite;
      if (r.levy) {
        r.soldiers.forEach(s => {
          const v = this.addVillager(s.x, s.z);
          v.state = 'soldier'; v.soldier = s; s.villager = v; v.xp = sp.xp || 0;
        });
      }
      const stand = { x: Math.sin(angle) * standAt, z: Math.cos(angle) * standAt };
      r.dest = { x: stand.x, z: stand.z, angle: Math.atan2(stand.x, stand.z) };
    }
  }

  // Regiments leaving for the world map. Levies take their villagers with them.
  takeTroops(regs) {
    const specs = [];
    for (const r of regs) {
      if (r.side !== 0 || r.gone || r.routing) continue;
      const men = r.soldiers.filter(s => s.alive && !s.gone);
      const gone = new Set(men.map(s => s.villager).filter(Boolean));
      this.villagers = this.villagers.filter(v => !gone.has(v));
      this.battle.disband(r);
      specs.push({ key: r.T.key, count: men.length, name: r.name, levy: r.levy || null, retinue: !!r.retinue, xp: r.xp || 0, elite: !!r.elite, ...carry(r) });
    }
    return specs;
  }

  garrison() { return this.battle.regs.filter(r => r.side === 0 && !r.gone); }
}
