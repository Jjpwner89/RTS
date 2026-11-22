// One point of interest as a living town: buildings placed anywhere, villagers who
// build and work them, short production chains, levies raised from the villagers
// themselves, and bandit raids. Fighting is left to battle.js.
//
// Goods are real and sit somewhere: in a woodcutter's yard, a workshop, the barracks,
// a storehouse or the keep. Haulers carry them about in crates, so where things are
// built matters. Workers who are stuck fetch or clear their own goods, more slowly.
import { audio } from './audio.js';
import { RoadNet } from './roadnet.js';
import { PACE } from './pace.js';

import { thinkTownSiege, thinkSiegeDefence } from './ai.js';
import { TYPES, FORMATIONS, vetRank, VET_RANKS } from './battle.js';
import { driftHome } from './world/militia.js';

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
  leatherarmour: { name: 'Leather armour', icon: 'armour-leather', color: '#b07a4a' },
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
  ['Arms', ['shields', 'leatherarmour', 'bows', 'arrows', 'spears', 'swords', 'crossbows', 'bolts', 'lances', 'mail', 'armour', 'horses']],
];

// gather: villagers walk out to a resource and carry it back. Since pace B (2026-11-21) they walk
// at 1.6 m/s, not 3.4, so each trip brings back more (and hunts take more game) to keep a worker's
// output a minute where it was. Stewards' places (world/holdings.js) keep the old yields.
// recipes: villagers work at the building, turning stock into stock. Each workshop can
// switch any of its recipes off; it takes turns between those left on. A recipe marked
// `off` is off for stewards too; one marked `start: 'off'` starts off only in your villages
// (round 4: the carpenter's shields ate planks, and so wood, unseen). `keep` stops a
// recipe once that much of its output is stored. Arms have no limit (switch a recipe off to
// stop it), save shields and leather armour, which stop at sixty so the planks and leather aren't all made into them.
// Workshops stop asking for wood once the village is down to its last, so construction can go on.
// Goods left for building: workshops don't ask for the last 20 wood, and none turns the last
// 25 planks into shields or arms.
export const RESERVE = { wood: 20, planks: 25 };
// Building sites take wood before workshops do (playtest round 3, 2026-11-21: the carpenter ate the
// opening's wood and houses waited). A workshop that turns wood into something other than bread
// waits until a house or two and a workshop are covered.
export const WOOD_FIRST = 36;
const CLEAR_TIME = 25;
// A village with less than this many minutes of food in its stores puts its hands on the food first (round 4).
const FOOD_FIRST = 3;
const FOOD_HANDS_EVERY = 6;
const CRAFT_SOUND = { carpenter: 'saw', bowyer: 'saw', smelter: 'smith', weaponsmith: 'smith', armourer: 'smith' };   // audio: the rest hammer
// A site nobody comes to build for this long takes a hand from the job the village misses least.
const BUILDER_WAIT = 30;
// The one prioritised site or workplace (creator, 2026-11-21: "priority should be very simple"): a site takes up
// to PRIO_BUILDERS builders, borrowing after PRIO_WAIT seconds; its materials are hauled first.
const PRIO_BUILDERS = 4;
const PRIO_WAIT = 5;
export const BUILDINGS = {
  house: { name: 'House', icon: 'house', group: 'Village', cost: { wood: 12 }, radius: 3.5, build: 10, housing: 6, hp: 120,
    desc: 'Room for 6 more villagers, and a hearth that burns a little wood. Newcomers come for food, a good mood and the village\'s name.' },
  storehouse: { name: 'Storehouse', icon: 'storehouse', group: 'Village', cost: { wood: 15 }, radius: 4.5, build: 12, jobs: 3, hp: 150,
    haul: true, storage: true, desc: 'Holds any goods. Its three haulers carry goods between the buildings around it.' },
  woodcutter: { name: 'Woodcutter', icon: 'woodcutter', group: 'Gather', cost: { wood: 10 }, radius: 3.5, build: 10, jobs: 3, hp: 120,
    gather: { node: 'tree', range: 40, need: 6, time: 5, out: { wood: 4 } }, desc: 'Fells trees for wood. Build it beside a wood.' },
  quarry: { name: 'Quarry', icon: 'quarry', group: 'Gather', cost: { wood: 12 }, radius: 3.5, build: 12, jobs: 2, hp: 120,
    gather: { node: 'rock', range: 35, need: 1, time: 6, out: { stone: 3 } }, desc: 'Cuts stone from a grey outcrop. Build it close to one.' },
  mine: { name: 'Mine', icon: 'mine', group: 'Gather', cost: { wood: 15, stone: 5 }, radius: 3.5, build: 15, jobs: 2, hp: 150,
    gather: { node: 'ore', range: 30, need: 1, time: 8, out: { ore: 4 } }, desc: 'Digs iron ore from a rust-red deposit. Build it close to one.' },
  hunter: { name: "Hunter's lodge", icon: 'hunter', group: 'Gather', cost: { wood: 10 }, radius: 3.5, build: 10, jobs: 2, hp: 120,
    gather: { node: 'tree', range: 55, need: 8, time: 10, out: { food: 6, feathers: 4, hides: 2 }, game: true },
    desc: 'Hunts in the woods for food, feathers and hides. The game near the village runs out and breeds back slowly.' },
  farm: { name: 'Farm', icon: 'farm', group: 'Gather', cost: { wood: 12 }, radius: 9, build: 12, jobs: 2, hp: 100,
    gather: { node: 'field', time: 8, out: { food: 4 }, ripen: 150 }, desc: 'Grows grain on its own field. Needs open ground. The first crop takes a while to come in.' },
  flax: { name: 'Flax field', icon: 'flaxfield', group: 'Gather', cost: { wood: 10 }, radius: 9, build: 10, jobs: 1, hp: 100,
    gather: { node: 'field', time: 8, out: { flax: 3 }, ripen: 120 }, desc: 'Grows flax for bowstring. The first crop takes a while to come in.' },
  carpenter: { name: 'Carpenter', icon: 'carpenter', group: 'Craft', cost: { wood: 15 }, radius: 3.5, build: 12, jobs: 1, hp: 120,
    recipes: [{ in: { wood: 2 }, out: { planks: 3 }, time: 7, keep: 40 }, { in: { planks: 2 }, out: { shields: 1 }, time: 6, keep: 60, start: 'off' }],
    desc: 'Saws wood into planks. Switch shields on in its panel when the barracks needs them: they take planks, and so wood.' },
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
    recipes: [{ in: { hides: 2 }, out: { leather: 1 }, time: 8, keep: 20 }, { in: { leather: 2 }, out: { leatherarmour: 1 }, time: 9, keep: 60 }],
    desc: "Cures the hunters' hides into leather, and stitches leather into armour for levies: plain, but it needs no smith." },
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
  // The northern host's camps are tents and horse lines, not houses (places.js): found there, never built.
  tent: { name: 'Tent', icon: 'house', group: 'Camp', camp: true, cost: { wood: 4 }, radius: 2.6, build: 4, housing: 4, hp: 40,
    desc: 'A soldier\'s tent of the northern host: room for four men.' },
  picket: { name: 'Picket line', icon: 'stable', group: 'Camp', camp: true, cost: { wood: 6 }, radius: 4.5, build: 5, hp: 60,
    desc: 'Stakes and a rope where the host\'s horses are tied, with their hay.' },
};
// Building upgrades (creator, 2026-11-20): an upgraded building is simply better. Each
// level adds as many work places again as the first, and works a little faster, so one
// level 2 woodcutter out-produces two at level 1; stores keep one more hauler a level.
// The catch is the cost: level 2 in stone and planks, level 3 in gold and iron. Houses
// don't level up.
export const UPGRADES = [null, null,
  { gold: 0, cost: { stone: 15, planks: 10 } },
  { gold: 100, cost: { iron: 10, planks: 10 } }];
export const SPEED = [1, 1, 1.15, 1.3];
// The opening (creator, 2026-11-20): enough for a few early choices between woodcutters,
// houses and farms, not all of them, and food for a while.
export const START_STOCK = { wood: 60, stone: 12, food: 60 };
// Game in the woods: each 40 m patch has its own. A hunt takes a share of it, and a patch
// breeds back over about twenty-five minutes; one hunted out yields nothing meanwhile.
export const GAME = { cell: 40, take: 0.24, regrow: 1 / 1500 };
// Hearths: wood each house (and the keep) burns a minute.
export const FIREWOOD = 1.5;
// Newcomers a minute at best, before food, mood and the village's name.
const SETTLE = 1.2;
// Newcomers a minute: the larder (meals a head), the mood and the village's name.
export function settleRate(larder, mood, name) {
  const food = larder < 1 ? 0 : Math.min(1, (larder - 1) / 3);
  return SETTLE * food * (0.4 + Math.max(0, Math.min(1.2, (mood - 30) / 50))) * Math.max(0.3, Math.min(2, name));
}
// Paved roads (creator, 2026-11-20): stone laid between two points; anyone walking on
// one goes half as fast again, so stone matters early and the layout is part of the puzzle.
export const ROAD = { width: 3, perStone: 3, max: 40, speed: 1.5 };
const RCELL = 2, RSPAN = 240, RN = Math.ceil(RSPAN * 2 / RCELL);
// What draws settlers besides food and mood: a name for comfort and safety.
export const REPUTE = { monastery: 0.4, market: 0.25, well: 0.15, safe: 0.2, raided: -0.4, cold: -0.3 };
// A glutted market (Orchestrator, 2026-11-21: one town's market sold 13,700 gold of goods by
// minute 120): every good a market sells lowers what the next brings there, and the price
// mends over a few minutes. It halves once GLUT.half of a good has been sold and not yet
// mended, mends GLUT.mend goods a minute, and below GLUT.floor of the full price the market
// keeps the goods instead. So selling across several markets pays. The same for your
// markets, a house's (holdings.js) and caravans (supply.js), each place its own glut.
export const GLUT = { half: 120, mend: 60, floor: 0.35 };
const glutOf = (G, g, now) => { const o = G?.[g]; return o ? Math.max(0, o.n - GLUT.mend * (now - o.at) / 60) : 0; };
export const priceShare = (G, g, now) => 1 / (1 + glutOf(G, g, now) / GLUT.half);
export function glut(G, g, n, now) { G[g] = { n: glutOf(G, g, now) + n, at: now }; }
export const saleGood = r => Object.keys(r.in)[0];

// Tax rates: gold collected for each villager, and what the village thinks of it.
export const TAXES = [
  { name: 'No taxes', gold: 0, mood: 12 }, { name: 'Low taxes', gold: 0.5, mood: 6 }, { name: 'Fair taxes', gold: 1, mood: 0 },
  { name: 'High taxes', gold: 1.6, mood: -12 }, { name: 'Cruel taxes', gold: 2.3, mood: -26 },
];
// Hired men, paid in gold at the keep. They cost no villagers. The household guard also draws a wage, a little under
// a sellsword's (creator, 2026-11-21): 30 men cost 30 gold a minute from the treasury (world/treasury.js).
// Every wage was scaled by 2.5 the same day (Orchestrator: an army is what gold caps).
export const HOUSEHOLD_PAY = 1;
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
// Leather armour is made at the tanner, like shields at the carpenter's (creator, 2026-11-21); raw leather stays the armourer's input.
export const ARMOUR_GOOD = { leather: 'leatherarmour', mail: 'mail', plate: 'armour' };
export const ARMOUR_NAME = { none: 'No armour', leather: 'Leather', mail: 'Mail', plate: 'Plate' };
// Weight in fights nobody watches, against the armour the type's strength was set for.
const ARMOUR_WEIGHT = { none: 1, leather: 1.1, mail: 1.22, plate: 1.38 };
const BODY = ['shields', 'leather', 'leatherarmour', 'mail', 'armour'];
const fullKit = key => TYPES[key]?.kit || {};
export const weaponKit = key => Object.fromEntries(Object.entries(fullKit(key)).filter(([g]) => !BODY.includes(g)));
// Hired and household men bring their own shields and armour (TYPES shield and armour).
export const canShield = key => !!(fullKit(key).shields || TYPES[key]?.shield);
export const baseArmour = key => TYPES[key]?.armour ?? (fullKit(key).armour ? 'plate' : fullKit(key).mail ? 'mail' : 'none');
export const gearOf = u => ({ armour: u.armour ?? baseArmour(u.key ?? u.T?.key), shield: u.shield ?? canShield(u.key ?? u.T?.key) });
// What a regiment carries between the map and the field: its armour and its battle count
// (r.battles, the short service record on its card).
// An arrière-ban levy also carries the time it goes home (world/arriere.js).
export const carry = u => ({ ...gearOf(u), battles: u.battles || 0, ...(u.until ? { until: u.until } : {}) });
const VALUE = { spear: 1, sword: 1.25, archer: 0.9, cav: 2.2, militia: 0.7, bandit: 0.7,
  crossbow: 1.1, lightcav: 1.6, heavycav: 2.6, maa: 1.5, knight: 3.2 };
export const value = key => TYPES[key]?.value ?? VALUE[key] ?? 1;
export const armourWeight = u => { const g = gearOf(u); return ARMOUR_WEIGHT[g.armour] / ARMOUR_WEIGHT[baseArmour(u.key)] * (canShield(u.key) && !g.shield ? 0.93 : 1); };
// A band's or a garrison's strength, the sum auto-resolve and the attack ask reckon with (world.js).
export const power = units => units.reduce((n, u) => n + u.count * value(u.key) * armourWeight(u), 0);
// Hopeless odds: under a third of the other side's strength. A place's people won't turn
// out against them, and the place may yield on terms (world/militia.js).
export const HOPELESS = 1 / 3;
export const outmatched = (mine, theirs) => power(mine) < power(theirs) * HOPELESS;
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
export const KITS = Object.fromEntries(['spear', 'archer', 'sword', 'crossbow', 'serjeant', 'yeoman', 'maa', 'lightcav', 'cav', 'knight']
  .map(k => [k, { name: TYPES[k].name, kit: weaponKit(k) }]));
// Elite men come only from a knights' hall, trained from veterans: a few at a time, for
// their kit, a fee in gold and minutes of drill per man. A hall keeps so many at most. On
// the campaign they draw pay every minute (gold per man; world/treasury.js). The fees are
// real money (creator, 2026-11-22: the midgame had nothing to spend gold on; they were 8 and 20).
export const ELITE = {
  maa: { fee: 60, drill: 45, pay: 1.5 },
  knight: { fee: 150, drill: 75, pay: 3.75 },
};
export const HALL = { batch: 6, cap: 24, veteran: 1 };   // veteran: the least experience (Blooded)
// Drilled men (creator, 2026-11-22: "i would want more and better troops. you gotta earn
// those"): from the rank of Lord, veterans drill at a barracks into serjeants and yeoman
// archers, the step before the knights' hall. Each takes his kit in the armour of his kind
// (mail for a serjeant, leather for a yeoman, from the armourer and tanner), a fee and drill
// time, and draws more pay than a levy (world/treasury.js). A barracks keeps so many at most.
export const DRILLED = {
  serjeant: { fee: 20, drill: 25, pay: 1.2 },
  yeoman: { fee: 20, drill: 25, pay: 1.2 },
};
export const DRILL = { batch: 10, cap: 40, veteran: 1 };
// What a barracks levies: every kind in KITS but the hall's elites and the drilled men, who
// are trained from veterans, never levied (creator, 2026-11-22: a banner call raised "Levy
// men-at-arms" in no armour). One list for the barracks panel, the banner call and raise().
export const LEVY_KINDS = Object.keys(KITS).filter(k => !ELITE[k] && !DRILLED[k]);
export const levied = key => LEVY_KINDS.includes(key);
// A levy of a trained kind (an old save's) becomes the plain kind with the same weapons,
// keeping its men, armour and experience; what the plain kind does not carry goes to the racks.
const PLAIN = { maa: 'sword', knight: 'cav', serjeant: 'spear', yeoman: 'archer' };
export function plainLevy(u) {
  const key = !u.elite && u.levy && PLAIN[u.key];
  if (!key) return null;
  const was = weaponKit(u.key), now = weaponKit(key);
  const spare = Object.fromEntries(Object.entries(was).map(([g, n]) => [g, n - (now[g] || 0)]).filter(([, n]) => n > 0));
  return { key, name: `Levy ${TYPES[key].name.toLowerCase()}`, armour: u.armour ?? baseArmour(u.key), shield: u.shield ?? canShield(u.key), spare };
}
// What a building trains and how: a knights' hall its elites (mail at the least, plate if
// there is enough), a barracks its drilled men (their kind's armour). One path for both, in
// your villages (Town.train) and a house's places (World.trainAt).
export const trainsAt = b => (b.B?.hall || b === 'hall') ? { kinds: ELITE, ...HALL, elite: true, gain: 2 }
  : (b.kind === 'barracks' || b === 'barracks') ? { kinds: DRILLED, ...DRILL, elite: false, gain: 1 } : null;
// The keep grows with the village to level 3 and never shrinks back (keepPeak) when levies
// march out. Levels 4 and 5 are raised for gold and stone (KEEP_RAISE, keepBought), once the
// village has the people; each gives homes and lifts the mood.
const byPeople = n => n >= 150 ? 5 : n >= 100 ? 4 : n >= 60 ? 3 : n >= 30 ? 2 : 1;
export const keepCap = t => 3 + (t.keepBought || 0);
export const keepLevel = t => t.keepLevel ? Math.max(1, Math.min(5, t.keepLevel)) : Math.min(keepCap(t), Math.max(t.keepPeak || 1, byPeople(t.population)));
// Tax comes from what a place has built, not from its heads (creator, 2026-11-22: "early taxes
// are too lucrative. think like ck2 taxes"; the starter village paid 24 a minute). Every head
// pays a little and the manor its dues; each building adds to it, the first of its kind in
// full and each more of that kind half as much (an upgraded one counts half again a level);
// the keep raises the whole. A bare village pays little, a built-up one well, and a built-up
// place taken is a prize. A market adds a share of the trade done at it (World.taxOf,
// MARKET_DUES), not a flat bonus. Gold a minute at fair taxes and a middling mood: your
// villages weigh it by their tax rate and mood (Town.taxRate), a house's places pay it as it is.
// It replaces the keep's reach (2026-11-21), which taxed heads.
export const TAX_HEAD = 0.1, TAX_MANOR = 7;
export const DEV_TAX = {
  woodcutter: 0.25, quarry: 0.25, mine: 0.25, hunter: 0.25, farm: 0.25, flax: 0.25, storehouse: 0.3,
  carpenter: 0.8, ropemaker: 0.8, smelter: 0.8, bowyer: 0.8, tanner: 0.8, mill: 0.8, bakery: 0.8,
  weaponsmith: 1.2, armourer: 1.2, stable: 1, market: 2.5, monastery: 1, cathedral: 6,
};
export const KEEP_TAX = [1, 1, 1.05, 1.1, 1.2, 1.3];
export const MARKET_DUES = 0.15;     // the share of a market's trade that comes to its lord as tax
// What each kind of building adds: n of a kind (levels counted) pay as 1 + (n - 1) / 2.
export const devOf = counts => counts.reduce((g, [k, n]) => g + (DEV_TAX[k] || 0) * (n > 1 ? 1 + (n - 1) / 2 : n), 0);
export const devTax = (pop, counts, level) => (TAX_HEAD * pop + TAX_MANOR + devOf(counts)) * KEEP_TAX[Math.max(1, Math.min(5, level))];
// Trade done at a place, in gold a minute, smoothed over a few minutes: sales at its market and
// caravans setting out and arriving (noteTrade as it happens, settleTrade every tick).
const TRADE_SPAN = 240;
export const noteTrade = (p, gold) => { p.tradeNew = (p.tradeNew || 0) + gold; };
export function settleTrade(p, dt) {
  const now = (p.tradeNew || 0) / dt * 60;
  p.tradeRate = (p.tradeRate || 0) + (now - (p.tradeRate || 0)) * Math.min(1, dt / TRADE_SPAN);
  p.tradeNew = 0;
}
// Gold 300 and 720 (from 500 and 1,200) when tax came to follow a place's buildings, so a raise
// takes the same minutes of a template-built seat's tax as before (Orchestrator, 2026-11-22).
export const KEEP_RAISE = [
  { name: 'great keep', pop: 100, gold: 300, cost: { stone: 80, planks: 30 }, housing: 10, mood: 4 },
  { name: 'castle keep', pop: 150, gold: 720, cost: { stone: 160, planks: 40, iron: 10 }, housing: 10, mood: 4 },
];
// A feast: gold for a spell of good feeling, the cure for a village near revolt.
export const FEAST = { perHead: 2, least: 60, mood: 15, secs: 300, again: 600 };
// A militia that beats off an attack lifts the village: proud, fading over five minutes.
export const DEFENDED = { mood: 8, secs: 300 };
// Masons hired for gold: twice the crews on the walls, and damaged walls mended, for a while.
export const MASONS = { gold: 80, secs: 180, mend: 0.01 };
export const ENGINES = Object.fromEntries(['ladder', 'ram', 'mangonel', 'trebuchet']
  .map(k => [k, { name: TYPES[k].name, cost: TYPES[k].cost, crew: TYPES[k].count }]));

const KEEP = { name: 'Keep', icon: 'keep', radius: 11, housing: 12, hp: 1500, jobs: 2, haul: true, storage: true };
const LEVY_MAX = 20, LEVY_MIN = 5;
const ABOUT_TO_BURN = 120;   // m: a band this near the building it has picked is met (thinkDefenders)
const HOME_LAND = 100;   // m from the keep: the village's own land, where raiders are seen and answered (thinkDefenders)
const WALK = PACE.foot;   // pace B: villagers walk (pace.js); a road's bonus makes it a jog

// A crate holds 20 of most goods (10 before pace B halved the walk); a yard or workshop
// holds 30 of each before it stops for haulers. Arrows are light and go four times as far.
const CRATE = 20, HOLD = 30, BULK = { arrows: 4, bolts: 4 };
const crate = g => CRATE * (BULK[g] || 1);
const holdOf = g => HOLD * (BULK[g] || 1);
const ARMS = GOOD_GROUPS[2][1];

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// Distance from p to the segment a-b.
const segDist = (p, a, b) => {
  const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2));
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
};
const gone = b => b.removed || b.state === 'ruined';
const compass = p => ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(((Math.atan2(p.x, -p.z) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8];
const listCost = cost => Object.entries(cost).map(([g, n]) => `${n} ${GOODS[g].name.toLowerCase()}`).join(', ');
export { listCost };

// Calls `each(x, z)` at points in widening rings round (x, z), nearest first, the way a
// template lays out, until it returns true.
function inRings(x, z, each, max = 48) {
  for (let r = 0; r <= max; r += 3) {
    const steps = r ? Math.max(6, Math.round(r * 0.9)) : 1;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2 + r * 0.37;
      if (each(x + Math.sin(a) * r, z + Math.cos(a) * r)) return true;
    }
  }
  return false;
}

// "storehouse, house ×2": names in order, repeats counted.
export function countList(names) {
  const n = new Map();
  for (const k of names) n.set(k, (n.get(k) || 0) + 1);
  return [...n].map(([k, c]) => (c > 1 ? `${k} ×${c}` : k)).join(', ');
}

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
      store: { ...(stock || START_STOCK) }, incoming: {}, reserved: {} };
    this.stockCache = null;
    this.buildings = [];
    this.villagers = [];
    this.trees = trees;
    this.nodes = { tree: trees.spots, rock: [], ore: [] };
    this.territory = 175;
    this.time = 0;
    this.nextMeal = 30;
    this.nextArrival = 20;
    this.settling = 0;          // progress toward the next newcomer
    this.game = {};             // game left in each patch of woods: "i,j" -> { v, t }
    this.cold = false;
    this.lastRaid = -1e9;
    this.roads = [];
    this.roadsVersion = 0;
    this.paved = new Uint8Array(RN * RN);
    this.hungry = false;
    // Gold goes to the lord's purse: the realm's treasury on the world map, the village's own here.
    this.purse = { gold: 0 };
    this.taxes = 2;
    this.mood = 60;
    this.moodWhy = [];
    this.grief = 0;
    this.fallen = {};   // villagers lost in the current fight, by how they fell (fell)
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
        // Rich or poor, and worked out in the end (creator, 2026-11-20).
        p.rich = this.rand() < (this.kind === 'mine' ? 0.6 : 0.35);
        p.full = p.left = kind === 'rock' ? (p.rich ? 500 : 220) : (p.rich ? 320 : 140);
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

  get housing() { return KEEP.housing + KEEP_RAISE.slice(0, this.keepBought || 0).reduce((n, K) => n + K.housing, 0) + this.buildings.filter(b => b.state === 'active' && b.B.housing).reduce((n, b) => n + b.B.housing + 3 * ((b.level || 1) - 1), 0); }
  // Work places a building has: as many again for each level, and stores one more hauler.
  jobs(b) { return b.B.haul ? (b.B.jobs || 0) + (b.level || 1) - 1 : (b.B.jobs || 0) * (b.level || 1); }
  // How many of them you want filled (the staffing control); all of them unless you say.
  staffed(b) { return Math.min(this.jobs(b), b.staff ?? Infinity); }
  setStaff(b, n) {
    b.staff = Math.max(0, Math.min(this.jobs(b), n));
    if (b.staff >= this.jobs(b)) delete b.staff;
    while (b.workers.length > this.staffed(b)) this.release(b.workers[b.workers.length - 1]);
  }
  speed(b) { return SPEED[b.level || 1]; }
  get population() { return this.villagers.length; }
  // Villagers at work, and those of them standing in the levies (still counted as people).
  get atWork() { return this.villagers.filter(v => v.state !== 'soldier').length; }
  get underArms() { return this.villagers.filter(v => v.state === 'soldier').length; }
  peopleText() {
    const n = this.underArms;
    return n ? `${this.atWork} at work · ${n} under arms` : `${this.population} villagers`;
  }
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
  savingWood(r) { return 'wood' in r.in && !('bread' in r.out) && !r.gold && this.free('wood') < WOOD_FIRST + r.in.wood; }

  // Recipes switched on that the village still wants and the workshop has room for.
  wantedRecipes(b) {
    return b.B.recipes.filter((r, i) => !b.off.has(i)
      && !this.savingPlanks(r)
      && !this.savingWood(r)
      && Object.keys(r.out).every(k => this.stock[k] < (r.keep ?? Infinity) && (b.store[k] || 0) < holdOf(k))
      // a market sells only what is spare above its reserve, and not into a glut
      && (r.above === undefined || Object.entries(r.in).every(([g, n]) => this.free(g) >= r.above + n))
      && (!r.gold || priceShare(this.glut, saleGood(r), this.time) >= GLUT.floor));
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
    // `least`: a building site short of a fraction (firewood leaves broken logs in store)
    // still gets its last crate, of whatever is needed to finish it.
    const consider = (from, to, g, n, rank, least = 1) => {
      if (n < least) return;
      const s = rank * 150 + dist(v, from) + dist(from, to);
      if (s < bs) { bs = s; best = { from, to, g, n: Math.min(n >= 1 ? Math.floor(n) : n, crate(g)) }; }
    };
    for (const to of holders) {
      const w = wants.get(to);
      const rank = to === this.priority ? -1 : to.state === 'site' ? 0 : to.kind === 'barracks' ? 2 : 1;
      for (const g in w) {
        const need = w[g] - (to.store[g] || 0) - (to.incoming[g] || 0);
        const site = to.state === 'site';
        if (need < (site ? 0.01 : 1)) continue;
        for (const from of holders) {
          if (from === to || (only && only !== to && only !== from)) continue;
          consider(from, to, g, Math.min(site ? Math.ceil(need - 1e-6) : need, this.spare(from, g, wants)), rank, site ? Math.min(1, need) : 1);
        }
      }
    }
    const barracks = this.buildings.some(b => b.kind === 'barracks' && b.state === 'active');
    for (const from of holders) {
      if (from.B.storage || (only && only !== from)) continue;
      let to = null, bd = Infinity;
      for (const s of stores) if (dist(s, from) < bd) { bd = dist(s, from); to = s; }
      for (const g in from.store) {
        if (barracks && ARMS.includes(g)) continue;
        const n = this.spare(from, g, wants);
        // (creator, 2026-11-20) Only food is carried in as it comes, for the meals. Other
        // goods stay in the yard, where workshops, sites and hearths draw on them, until the
        // yard is filling up.
        if (!only && n < (g === 'food' || g === 'bread' ? Math.min(crate(g), 5 * (BULK[g] || 1)) : holdOf(g) * 0.6)) continue;
        consider(from, to || this.keep, g, n, 3);
      }
    }
    if (!best) return null;
    best.from.reserved[best.g] = (best.from.reserved[best.g] || 0) + best.n;
    best.to.incoming[best.g] = (best.to.incoming[best.g] || 0) + best.n;
    return { kind: 'haul', phase: 'fetch', ...best };
  }

  // A walker that has stayed put for 8 s within 9 m of where it is going (a wall's gate or a block
  // between it and the door, playtest round 3: builders circled 5 m short of a knights' hall for ten
  // minutes) is counted as arrived: the crate is handed over, or the work done, from where it stands.
  // `k.t` stays on the villager for checks().
  stuckNear(v, tx, tz, dt) {
    const k = v.stuckK ??= { x: v.x, z: v.z, t: 0 };
    k.t += dt;
    if (Math.hypot(v.x - k.x, v.z - k.z) > 1.5) { k.x = v.x; k.z = v.z; k.t = 0; return false; }
    return k.t > 8 && Math.hypot(tx - v.x, tz - v.z) < 9;
  }
  unstick(v) { v.stuckK = null; }

  doHaul(v, dt) {
    const t = v.task;
    if (t.phase === 'fetch') {
      if (gone(t.from)) { this.cancelHaul(v); return true; }
      const d = this.door(t.from, v);
      if (!this.walk(v, d.x, d.z, dt) && !this.stuckNear(v, d.x, d.z, dt)) return false;
      this.unstick(v);
      t.from.reserved[t.g] -= t.n;
      const n = Math.min(t.n, t.from.store[t.g] || 0);
      t.to.incoming[t.g] -= t.n - n;
      // A part-crate for a site (the broken logs left by firewood) is still carried.
      if (n < Math.min(1, t.n) - 1e-6) { t.to.incoming[t.g] -= n; v.task = null; return true; }
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
    if (!this.walk(v, d.x, d.z, dt)) {
      if (!this.stuckNear(v, d.x, d.z, dt)) return false;
      if (!t.to.cutOff) { t.to.cutOff = true; this.event(`Carriers can't reach the ${t.to.B.name.toLowerCase()}'s door (a wall or a building is in the way): they hand the goods over from where they stand. Clear a way to it.`, 1); }
    }
    this.unstick(v);
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

  // `planned`: buildings not yet placed (a template's layout) to keep clear of as well.
  canPlace(kind, x, z, { free = false, planned = null } = {}) {
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
    if (planned) for (const b of planned) if (dist(b, p) < b.B.radius + B.radius + 1.5) return { ok: false, reason: 'Something is in the way' };
    for (const n of [...this.nodes.rock, ...this.nodes.ore]) if (dist(n, p) < B.radius + 6) return { ok: false, reason: 'Something is in the way' };
    if (this.battle.walls.structureAt(x, z) || this.battle.walls.pieceAt(x, z, null, B.radius)) return { ok: false, reason: 'A wall is in the way' };
    // Standing men aren't moved off a site, so a building can't go up on them (it once walled
    // the lord's retinue inside a governor's house).
    for (const r of this.battle.regs) if (!r.gone && Math.hypot((r.cx ?? r.x) - x, (r.cz ?? r.z) - z) < B.radius + 30
      && r.soldiers.some(s => s.alive && !s.gone && Math.hypot(s.x - x, s.z - z) < B.radius + 1)) return { ok: false, reason: `${r.name} stand there` };
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
      off: new Set((B.recipes || []).flatMap((r, i) => r.off || r.start === 'off' ? [i] : [])), turn: 0, store: {}, incoming: {}, reserved: {} };
    if (ready) Object.assign(b, { state: 'active', progress: 1, status: B.jobs ? 'Waiting for workers' : '' });
    this.buildings.push(b);
    this.stockCache = null;
    return { ok: true, building: b };
  }

  // Whether a template can be laid down now: people enough, and all of it affordable at once.
  templateCheck(name) {
    const T = TEMPLATES[name];
    if (!T) return { ok: false, reason: 'No such template' };
    if (T.at && this.population < T.at) return { ok: false, reason: `Needs ${T.at} people` };
    const cost = templateCost(name);
    if (!this.canAfford(cost)) return { ok: false, reason: `Needs ${listCost(cost)}` };
    return { ok: true };
  }

  // Where each building of a template would go round (x, z), as [{ kind, B, x, z }], without
  // building anything: the first as near the spot as it fits, the rest in rings round it;
  // gatherers beside the resource nearest the spot. What will not fit is in `spots.missed`,
  // at the nearest spot it tried that is clear of the rest: on your land if it can be (steep
  // ground, a wall or rocks being what stopped it), else past it.
  planTemplate(name, x, z) {
    const T = TEMPLATES[name], spots = [];
    spots.missed = [];
    if (!T) return spots;
    let tried = null, past = null;
    const clear = (kind, px, pz) => Math.hypot(px, pz) >= KEEP.radius + BUILDINGS[kind].radius + 3 && ![...this.buildings, ...spots, ...spots.missed].some(b => Math.hypot(b.x - px, b.z - pz) < b.B.radius + BUILDINGS[kind].radius + 1.5);
    const fits = (kind, px, pz) => {
      if (this.canPlace(kind, px, pz, { free: true, planned: spots }).ok) return spots.push({ kind, B: BUILDINGS[kind], x: px, z: pz });
      const inLand = Math.hypot(px, pz) <= this.territory;
      if (!tried && (inLand || !past) && clear(kind, px, pz)) {
        if (inLand) tried = { x: px, z: pz };
        else past = { x: px, z: pz };
      }
      return false;
    };
    // With nowhere clear at all (a packed village), the misses still spread round the cursor
    // as the template would lie, so the size of what won't fit shows.
    const ghostFree = (kind, px, pz) => ![...spots, ...spots.missed].some(b => Math.hypot(b.x - px, b.z - pz) < b.B.radius + BUILDINGS[kind].radius + 1.5);
    const missed = kind => {
      let at = tried || past;
      if (!at) inRings(x, z, (px, pz) => ghostFree(kind, px, pz) && (at = { x: px, z: pz }));
      at ??= { x, z };
      spots.missed.push({ kind, B: BUILDINGS[kind], x: at.x, z: at.z, miss: true });
    };
    for (const kind of T.list) {
      tried = past = null;
      let done = false;
      if (T.gather) done = this.gathererSpot(kind, x, z, spots, fits);
      else done = inRings(x, z, (px, pz) => fits(kind, px, pz));
      if (!done) missed(kind);
    }
    return spots;
  }

  // The template's plan while the cursor hovers: worked out again only when the cursor has
  // moved a little, a tenth of a second has passed, or the village has changed.
  templatePreview(name, at) {
    const c = this.tplPreview, now = performance.now(), n = this.buildings.length;
    if (c && c.name === name && c.n === n && (now - c.when < 100 || dist(c.at, at) < 1)) return c.spots;
    this.tplPreview = { name, n, when: now, at: { x: at.x, z: at.z }, spots: this.planTemplate(name, at.x, at.z) };
    return this.tplPreview.spots;
  }

  // Every ghost to draw for the template under the cursor: the ones that fit, then the misses.
  templateGhosts(name, at) {
    const spots = this.templatePreview(name, at);
    return spots.missed.length ? [...spots, ...spots.missed] : spots;
  }

  // Lays out a town template round (x, z), exactly as planTemplate shows it.
  placeTemplate(name, x, z) {
    const check = this.templateCheck(name);
    if (!check.ok) return check;
    const T = TEMPLATES[name], spots = this.planTemplate(name, x, z);
    if (!spots.length) return { ok: false, reason: T.gather ? 'Nothing to work near here' : 'No room here' };
    let placed = 0;
    const skipped = spots.missed.map(p => p.B.name.toLowerCase());
    for (const p of spots) if (this.place(p.kind, p.x, p.z, { free: true }).ok) placed++; else skipped.push(p.B.name.toLowerCase());
    this.tplPreview = null;
    // What was left out is said, on screen and in the console, never dropped quietly.
    const message = skipped.length ? `Laid out ${placed} of ${T.list.length}: no room for ${countList(skipped)}` : 'Laid out';
    if (skipped.length) console.warn(`${T.name} at (${Math.round(x)}, ${Math.round(z)}): ${message}`);
    return { ok: true, placed, of: T.list.length, message };
  }

  // A spot for one gatherer beside the resource nearest (x, z) that no other of its kind
  // works (or is planned to); a farm on the open ground nearest the spot. `fits(kind, x, z)`
  // takes the spot if it will do.
  gathererSpot(kind, x, z, planned, fits) {
    const B = BUILDINGS[kind], g = B.gather, at = { x, z };
    const tries = [];
    if (g.node === 'field') tries.push(at);
    else {
      const worked = [...this.buildings, ...planned].filter(b => b.kind === kind);
      const nodes = this.nodes[g.node].filter(n => (n.standing ?? true) && !worked.some(b => dist(b, n) < g.range * 0.5))
        .sort((p, q) => dist(p, at) - dist(q, at)).slice(0, 24);
      tries.push(...nodes);
    }
    for (const c of tries) {
      for (let r = g.node === 'field' ? 12 : B.radius + 7; r <= (g.node === 'field' ? 70 : g.range * 0.7); r += 3) {
        const steps = Math.max(8, Math.round(r * 0.8));
        for (let i = 0; i < steps; i++) {
          const a = (i / steps) * Math.PI * 2 + r * 0.53;
          if (fits(kind, c.x + Math.sin(a) * r, c.z + Math.cos(a) * r)) return true;
        }
      }
    }
    return false;
  }

  // One gatherer placed beside its resource (see gathererSpot).
  placeGatherer(kind, x, z) {
    let b = null;
    this.gathererSpot(kind, x, z, [], (k, px, pz) => { const res = this.place(k, px, pz, { free: true }); if (res.ok) b = res.building; return res.ok; });
    return b;
  }

  demolish(b) {
    this.clearPriority(b);
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
    v.lent = null;
    this.cancelHaul(v);
    v.job = null;
    v.site = null;
    if (v.state !== 'soldier' && v.state !== 'shelter' && v.state !== 'flee') v.state = 'idle';
  }

  // ---- levies ----

  // Kit is taken from this barracks' own racks, so it has to be carried there first.
  // `free` lets a plan ask about hands it has already counted out (World.bannerPlan).
  levyCheck(key, barracks, free = this.villagers.filter(v => v.state !== 'soldier').length) {
    if (!levied(key)) return { n: 0, ok: false, reason: `${KITS[key]?.name ?? key} are trained from veterans, not levied`, fit: null };
    const kit = KITS[key].kit, have = g => Math.floor(barracks.store[g] || 0);
    const byKit = Math.min(...Object.entries(kit).map(([g, n]) => Math.floor(have(g) / n)));
    const n = Math.min(this.levyMax?.() || LEVY_MAX, byKit, free);   // a duke's levies come forty strong
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

  // What one man of a regiment hands back when it is stood down: his weapons, his armour, his shield
  // (and his horse): the same function for every disband, so kit out always matches kit in.
  rackKit(r) { return outfitKit(r.levy || r.T.key, 1, gearOf(r)); }

  // Survivors hand back their kit at the nearest barracks and go home to work. The lord's own
  // retinue can be sent to work too (each man becomes a villager and racks what he wore). The household
  // guard can't: they are paid men, who take their leave like a dismissed company (creator, 2026-11-21).
  disband(r, quiet = false) {
    if (r.gone || r.routing) return false;
    if (r.T.key === 'household') {
      const n = r.alive;
      this.battle.disband(r);
      if (!quiet) this.event(`The ${r.name.replace(/^Lord/, 'lord').replace(/^Household/, 'household')} take their leave: ${n} men, and nobody joins the village.`);
      return true;
    }
    if (!r.levy && !r.retinue) return false;
    const rack = this.armoury({ x: r.cx, z: r.cz }), kit = Object.entries(this.rackKit(r));
    let n = 0;
    for (const s of r.soldiers) {
      if (!s.alive || s.gone) continue;
      for (const [g, k] of kit) this.put(rack, g, k);
      n++;
      const v = s.villager;
      if (v) {
        // The militia go back to the work they dropped, and learn nothing a hall would train.
        Object.assign(v, { x: s.x, z: s.z, state: 'idle', soldier: null, xp: r.T.militia ? v.xp || 0 : Math.max(v.xp || 0, r.xp || 0) });
        if (r.T.militia) this.backToWork(v);
      } else if (r.retinue && !r.levy) this.addVillager(s.x, s.z);
    }
    this.battle.disband(r);
    if (!quiet) this.event(r.retinue && !r.levy ? `The ${r.name.replace(/^Lord/, 'lord')} hung up their swords: ${n} new villagers.` : `${r.name} went home to work.`);
    return true;
  }

  // ---- the militia ----
  // When the village is attacked, everyone can be called out: every villager not already
  // under arms takes up what is to hand and forms regiments of village militia (battle.js
  // 'folk'), weak and quick to break. Work stops while they fight. When the attack is over
  // they go back to the jobs they left; the dead are villagers lost, as with levies.

  get militia() { return this.battle.regs.filter(r => r.side === 0 && !r.gone && r.T.militia); }

  musterCheck() {
    if (this.hostile || this.readOnly) return { ok: false, reason: 'Not your village' };
    if (!this.attackers.some(g => g.mode !== 'hold')) return { ok: false, reason: 'Only when the village is attacked' };
    const n = this.villagers.filter(v => v.state !== 'soldier' && v.state !== 'rebel').length;
    if (n < LEVY_MIN) return { ok: false, reason: this.militia.length ? 'Everyone is out already' : `Needs ${LEVY_MIN} villagers` };
    return { ok: true, n };
  }

  // The nearest spot to p where a regiment clears every standing building and the keep by
  // `room` m, so militia bands formed up or posted round a crowded place don't stand inside
  // a house (QC, Foxgate Abbey, 2026-11-21). p itself when nothing near is clear.
  clearSpot(p, room = 9) {
    const blocks = [...this.buildings.filter(b => b.state === 'active' && b.B.radius && b.B.gather?.node !== 'field'), this.keep];
    const ok = (x, z) => blocks.every(b => Math.hypot(x - b.x, z - b.z) > b.B.radius + room);
    if (ok(p.x, p.z)) return p;
    for (let d = 4; d <= 60; d += 4) for (let a = 0; a < 12; a++) {
      const x = p.x + Math.sin(a * Math.PI / 6) * d, z = p.z + Math.cos(a * Math.PI / 6) * d;
      if (ok(x, z)) return { ...p, x, z };
    }
    return p;
  }

  muster() {
    const c = this.musterCheck();
    if (!c.ok) return c;
    const men = this.villagers.filter(v => v.state !== 'soldier' && v.state !== 'rebel');
    // They form up behind your soldiers (or the keep, with none standing), facing the
    // nearest attackers: your soldiers meet the attackers first, and the militia are close
    // enough to follow them in. (Formed in front of the keep, they took the first charge
    // alone whenever the soldiers stayed back; formed behind the keep, they trailed
    // the soldiers by 50 m. Seed 7, 2026-11-21.) Their place to come back to is behind the
    // keep, wherever the soldiers stood when they formed (soldiers left out in the field
    // would otherwise leave the militia's home out there too).
    const foes = this.attackers.flatMap(g => g.regs).filter(r => !r.gone);
    const nearest = (list, o) => list.sort((p, q) => Math.hypot(p.cx - o.x, p.cz - o.z) - Math.hypot(q.cx - o.x, q.cz - o.z))[0];
    const foe = nearest(foes, this.keep);
    const front = foe && nearest(this.battle.regs.filter(r => r.side === 0 && !r.gone && !r.routing && !r.regrouping && !r.T.militia), { x: foe.cx, z: foe.cz });
    const at = front ? { x: front.cx, z: front.cz } : this.keep;
    const face = foe ? Math.atan2(foe.cx - at.x, foe.cz - at.z) : 0;
    const home = foe ? Math.atan2(foe.cx - this.keep.x, foe.cz - this.keep.z) : 0;
    const k = Math.ceil(men.length / TYPES.folk.count), regs = [];
    for (let i = 0; i < k; i++) {
      const band = men.slice(Math.floor(i * men.length / k), Math.floor((i + 1) * men.length / k));
      const off = (i - (k - 1) / 2) * 22;
      const behind = (o, a) => ({ x: o.x - Math.sin(a) * 16 + Math.cos(a) * off, z: o.z - Math.cos(a) * 16 - Math.sin(a) * off });
      const { x, z } = this.clearSpot(behind(at, face));
      for (const v of band) {
        v.musterJob = v.job; v.musterSite = v.site;
        if (v.load) { this.put(this.keep, v.load.g, v.load.n); v.load = null; v.carry = null; }
        if (v.state === 'flee' || v.state === 'shelter') v.state = 'idle';
        this.release(v);
        v.hidden = false;
      }
      const r = this.battle.addRegiment(0, 'folk', x, z, face, { count: band.length, from: band });
      r.levy = 'folk';
      r.post = { ...this.clearSpot(behind(this.keep, home)), angle: home };   // their place by the keep (thinkMilitia)
      r.soldiers.forEach((s, j) => { band[j].state = 'soldier'; band[j].soldier = s; s.villager = band[j]; });
      regs.push(r);
    }
    this.musterAt = this.time;
    audio.play('muster', this.keep, this.battle); // audio: the bell rings and the village turns out
    this.event(`The whole village turns out: ${men.length} villagers took up axes, flails and pitchforks.`, 1);
    return { ok: true, regs };
  }

  // Every militia regiment that is not running goes home; returns how many went.
  standDown() {
    const regs = this.militia.filter(r => !r.routing);
    for (const r of regs) this.disband(r, true);
    if (regs.length) this.event('The militia lay down their tools and go back to work.');
    return regs.length;
  }

  // A villager back from the militia picks up the job or the building site they left.
  backToWork(v) {
    const job = v.musterJob, site = v.musterSite;
    v.musterJob = v.musterSite = null;
    if (site && !site.removed && site.state === 'site') { site.builders.push(v); v.state = 'build'; v.site = site; }
    else if (job && !job.removed && job.state === 'active' && !job.paused && job.workers.length < this.staffed(job)) { job.workers.push(v); v.job = job; v.state = 'work'; v.task = null; }
  }

  // Your soldiers at home (the retinue, a garrison, hired men) don't stand at the keep while
  // raiders burn the village: with no orders they go for raiders on the village's land, and
  // the militia follow them in (thinkMilitia). Hold keeps them where they stand, an order of
  // yours comes first, and bowmen shoot as ever. (The manager's QC, seed 61, 2026-11-21: a
  // retinue stood "Steady" at the keep for a hundred seconds while a house burned.)
  thinkDefenders() {
    if (this.hostile || this.readOnly) return;
    const b = this.battle, foes = this.attackers.filter(g => !g.leaving && g.mode !== 'hold').flatMap(g => g.regs).filter(r => !r.gone && !r.routing && !r.regrouping);
    if (!foes.length) return;
    const d = (a, o) => Math.hypot(a.cx - o.x, a.cz - o.z);
    const mine = b.regs.filter(r => r.side === 0 && !r.gone && r.alive > 0 && !r.T.engine);

    // Outnumbered: if the soldiers alone are weaker than the band (the sum auto-resolve reckons
    // with), the people are called out at once, so soldiers and people go out together instead of
    // the soldiers dying alone (seed 7: 38 raiders killed a retinue of 20 to a man). If even the
    // two together are clearly weaker, they keep to the keep and meet it there, not in the open;
    // they go out when they are on the stronger side again.
    const theirs = this.strength(foes), stand = this.strength(mine.filter(r => !r.T.militia)), total = stand + this.strength(mine.filter(r => r.T.militia));
    // Against hopeless odds (under a third of them, everyone out: HOPELESS) they stay in
    // their homes instead, as a rival's people do (world/militia.js), and the place may yield.
    if (!this.calledOut && stand < theirs * 1.1 && !this.militia.length && this.musterCheck().ok) {
      this.calledOut = true;
      if (this.hopeless()) this.say(`Too many to fight: the people of ${this.placeName || 'the village'} shelter in their homes rather than be cut down.`, 1);
      else {
        this.say('Outnumbered: the whole village is called out.', 1);
        this.muster();
      }
    }
    if (!this.fallingBack && total < theirs * 0.8) this.fallingBack = true;
    else if (this.fallingBack && total > theirs * 1.0) this.fallingBack = false;
    for (const r of mine) if (!r.T.militia) r.fallBack = this.fallingBack;
    if (this.fallingBack) {
      if (!this.fellBackSaid) {
        this.fellBackSaid = true;
        const place = this.placeName || 'the village';
        this.say(`Too many to meet in the open: falling back to ${place}'s ${b.walls.any ? 'walls' : 'keep'}.`, 1);
      }
      // those already out come back to where they stood
      for (const r of mine) if (!r.T.militia && r.homeSpot && !r.hold) {
        const h = r.homeSpot;
        r.homeSpot = r.homeTarget = null;
        b.orderMove([r], h.x, h.z, h.angle);
      }
    }

    // (at the village itself, not out on its land: met in the open, the retinue and the militia behind it
    // fared worse than fighting where the whole village stands)
    // A band is also met on its way to a building it has picked, wherever that stands: the
    // gatherers' sheds out by the woods and rocks burn a hundred metres from the keep, and a
    // retinue that waits until the band is on them arrives to the ashes (playtester round 3b,
    // seed 91, 2026-11-21: 90 s of standing, a quarry and a woodcutter burned, the band away).
    const aimed = f => f.raidTarget && f.raidTarget.state !== 'ruined' && !f.raidTarget.removed && d(f, f.raidTarget) < ABOUT_TO_BURN;
    const onLand = f => d(f, this.keep) < 45 || aimed(f) || this.buildings.some(o => o.state !== 'ruined' && d(f, o) < 25);
    const raiders = foes.filter(onLand);
    if (!raiders.length) return;
    let sent = 0;
    if (!this.fallingBack) for (const r of b.regs) {
      if (r.side !== 0 || !b.usable(r) || r.T.militia || r.T.engine || b.shoots(r) || r.hold || r.posts || r.dest || r.targetReg || r.targetWall || r.burnTarget || r.after || r.ai === 'siege') continue;
      const t = raiders.sort((p, q) => d(p, r) - d(q, r))[0];
      r.homeSpot ??= { x: r.cx, z: r.cz, angle: r.angle };   // where it stood: it comes back there (endAttack)
      r.homeTarget = t;
      b.orderAttack([r], t);
      sent++;
    }
    if (sent && !this.droveSaid) {
      this.droveSaid = true;
      this.say('Your soldiers go out to drive the raiders from the village. (Hold keeps them at the keep.)', 0);
    }
    // Soldiers kept at the keep, by your Hold or because the band is too many, watch it burn:
    // say so once, so it reads as what it is and not a fault (QC, 2026-11-21: a retinue on
    // Hold, a house burned, no word).
    if (!this.holdSaid) {
      const held = b.regs.find(r => r.side === 0 && b.usable(r) && !r.T.militia && !r.T.engine && !b.shoots(r) && (r.hold || r.fallBack));
      const burning = held && raiders.find(f => f.raidTarget && f.raidTarget.state !== 'ruined' && !f.raidTarget.removed && d(f, f.raidTarget) < f.raidTarget.B.radius + 9);
      if (burning) {
        this.holdSaid = true;
        const t = burning.raidTarget, who = held.retinue ? 'Your retinue' : held.name;
        this.say(`${who} ${held.retinue ? 'holds' : 'hold'} its ground (${held.hold ? 'Hold' : 'too many to meet in the open'}) while raiders burn the ${t === this.keep ? 'keep' : t.B.name.toLowerCase()} to the ${compass(t)}.`, 1);
      }
    }
  }

  // A side's strength in the field, reckoned as auto-resolve reckons it (world.js resolve).
  // Would even everyone called out be under a third of an assault (or a raid) on the place?
  hopeless() {
    const foes = this.attackers.filter(g => !g.leaving && g.mode !== 'hold').flatMap(g => g.regs);
    const mine = this.battle.regs.filter(r => r.side === 0 && !r.routing && !r.T.engine), n = this.musterCheck().n || 0;
    return this.strength(mine) + power([{ key: 'folk', count: n }]) < this.strength(foes) * HOPELESS;
  }
  strength(regs) { return power(regs.filter(r => !r.gone && r.alive > 0).map(r => ({ key: r.T.key, count: r.alive, armour: r.armour, shield: r.shield }))); }

  // What the village's defence says: here, and in the world's log if you are not watching.
  say(text, side = 0) { this.event(text, side); this.onNote?.(text, side); }

  // The militia hold by the keep. When your soldiers go for the attackers they follow a
  // little way behind, and once those soldiers are locked in a fight they pile into it,
  // where numbers on a flank count most (not before: alone they break at once and shake
  // the men beside them). When the soldiers they followed stop, they go back to their
  // place by the keep. With no soldiers of yours standing they go at whatever comes for
  // the village. Your own orders come first. A militia that breaks scatters home to the
  // keep as villagers, even in the last moment of an attack. Once it is over they stand down.
  thinkMilitia() {
    const mine = this.militia;
    if (!mine.length) return;
    // First, before anything else: a routing militia left standing would still be soldiers
    // when the attack ends and saving opens, and a save keeps neither.
    for (const r of mine) if (r.routing || r.regrouping) this.hide(r);
    if (!this.underAttack) { this.standDown(); return; }
    const foes = this.attackers.filter(g => !g.leaving).flatMap(g => g.regs).filter(r => !r.gone && !r.routing && !r.regrouping);
    const near = (a, b, d) => Math.hypot(a.cx - b.cx, a.cz - b.cz) < d;
    const soldiers = this.battle.regs.filter(r => r.side === 0 && !r.gone && !r.routing && !r.T.militia);
    const free = [];
    for (const r of this.militia) {
      // (a destination they were not given here is yours)
      if (r.hold || r.posts || (r.dest && r.dest !== r.ownDest) || (r.targetReg && !r.targetReg.gone && !r.targetReg.routing)) continue;
      const fighting = foes.filter(f => f.engaged > 0 && soldiers.some(o => o.engaged > 0 && near(o, f, 20)) && near(f, r, 160));
      // (with no soldiers standing, only what comes at the village: caught out in the field
      // after their soldiers fell, they made for raiders 100 m out and lost half the
      // village; governor-run Ashford, seed 7, 2026-11-21)
      const t = (fighting.length ? fighting : soldiers.length ? foes.filter(f => near(f, r, 15)) : foes.filter(f => near(f, this.keep, 70)))
        .sort((p, q) => Math.hypot(p.cx - r.cx, p.cz - r.cz) - Math.hypot(q.cx - r.cx, q.cz - r.cz))[0];
      if (t) this.battle.orderAttack([r], t);
      else free.push(r);
    }
    for (const r of mine) r.hurry = 1;
    if (!free.length) return;
    const own = regs => { for (const r of regs) r.ownDest = r.dest; };
    // Soldiers on their way to a fight: keep about 14 m behind them, side by side in one
    // line. They aim 14 m behind where the soldiers will be a few seconds on (never past
    // the fight), so they keep walking, and are only re-aimed when that has moved well
    // away: every new order makes a regiment dress its ranks, which slows it.
    const lead = soldiers.find(o => o.targetReg && !o.targetReg.gone && foes.includes(o.targetReg));
    if (lead) {
      const f = lead.targetReg, a = Math.atan2(f.cx - lead.cx, f.cz - lead.cz);
      const on = Math.min(18, Math.max(0, Math.hypot(f.cx - lead.cx, f.cz - lead.cz) - 4)) - 14;
      const x = lead.cx + Math.sin(a) * on, z = lead.cz + Math.cos(a) * on;
      if (free.some(r => !r.followAt || r.dest !== r.ownDest || Math.hypot(r.followAt.x - x, r.followAt.z - z) > 12)) {
        this.battle.orderMove(free, x, z, a);
        own(free);
        for (const r of free) r.followAt = { x, z };
      }
      // Fallen behind (gathering from all over the village, they set off late): they run.
      for (const r of free) if (Math.hypot(r.cx - lead.cx, r.cz - lead.cz) > 18) r.hurry = 1.3;
      return;
    }
    // Nothing to follow: back to their places by the keep, not left out in the field.
    for (const r of free) {
      r.followAt = null;
      const h = r.post;
      if (!h || Math.hypot(r.cx - h.x, r.cz - h.z) < 4 || (r.dest && r.dest === r.ownDest && Math.hypot(r.dest.x - h.x, r.dest.z - h.z) < 1)) continue;
      this.battle.orderMove([r], h.x, h.z, h.angle);
      own([r]);
    }
  }

  // Broken militia throw down their tools and run for the keep to shelter with the rest.
  hide(r) {
    for (const s of r.soldiers) {
      if (!s.alive || s.gone || !s.villager) continue;
      Object.assign(s.villager, { x: s.x, z: s.z, state: 'flee', soldier: null, musterJob: null, musterSite: null });
    }
    this.battle.disband(r);
    this.event(`${r.name} broke: the villagers are running for the keep.`);
  }

  // A regiment swaps up its armour and shields at the nearest barracks without standing
  // down: same men, name and experience, better kit. Its old kit goes back on the racks.
  refitCheck(r) {
    if (!r || r.side !== 0 || r.gone || r.routing || !(r.levy || r.elite) || r.T.engine || r.T.militia) return { ok: false, reason: 'Only your own levies and elites refit' };
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
      // (the militia learn nothing a hall would train: they go home, see disband)
      if (r.side !== 0 || r.gone || r.T.engine || r.T.militia || !r.fought || r.alive <= 0) continue;
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
  // Veterans already promised to a hall or barracks that is training them.
  inTraining() { return this.buildings.reduce((n, b) => n + (b.training?.n || 0), 0); }

  // A knights' hall or a barracks (trainsAt): veterans, kit, a fee each, and room.
  trainCheck(key, hall) {
    const S = trainsAt(hall), E = S?.kinds[key];
    if (!E) return { ok: false, reason: 'Not trained here' };
    if (hall.state !== 'active') return { ok: false, reason: 'Not built yet' };
    const rule = !S.elite && this.drillRule?.();
    if (rule) return { ok: false, reason: rule };
    if (hall.training) return { ok: false, reason: `${S.elite ? 'Training' : 'Drilling'} ${hall.training.n} ${KITS[hall.training.key].name.toLowerCase()}` };
    const room = S.cap - this.hallMen(hall);
    if (room <= 0) return { ok: false, reason: S.elite ? `The hall holds ${S.cap} men` : `A barracks keeps ${S.cap} drilled men` };
    const vets = this.veterans().length - this.inTraining();
    if (vets < 1) return { ok: false, reason: 'Needs veterans: villagers who fought as levies and came home' };
    const kit = KITS[key].kit, T = TYPES[key];
    // Elites wear mail at the least, plate if there is enough for every man; drilled men their kind's armour.
    const byArmour = S.elite ? Math.max(Math.floor(this.free('mail')), Math.floor(this.free('armour'))) : Math.floor(this.free(ARMOUR_GOOD[T.armour]));
    const byKit = Math.min(byArmour, ...Object.entries(kit).map(([g, n]) => Math.floor(this.free(g) / n)));
    const byGold = Math.floor(this.purse.gold / E.fee);
    const n = Math.min(S.batch, room, vets, byKit, byGold);
    const short = Object.entries(kit).filter(([g, k]) => this.free(g) < k).map(([g]) => GOODS[g].name.toLowerCase());
    if (byArmour < 1) short.push(S.elite ? 'mail or plate' : GOODS[ARMOUR_GOOD[T.armour]].name.toLowerCase());
    if (n < 1) return { ok: false, reason: byKit < 1 ? `Short of ${short.join(', ')}` : `Needs ${E.fee} gold each` };
    const fit = S.elite ? outfit(key, n, g => Math.floor(this.free(g)), 'best', true)
      : { armour: T.armour, shield: canShield(key) && this.free('shields') >= n };
    return { ok: true, n, fit };
  }

  // Kit and fees are paid now; the veterans drill for minutes before they march out.
  train(key, hall) {
    const c = this.trainCheck(key, hall);
    if (!c.ok) return c;
    const E = trainsAt(hall).kinds[key];
    this.spend(outfitKit(key, c.n, c.fit));
    this.purse.gold -= E.fee * c.n;
    hall.training = { key, n: c.n, left: E.drill * c.n, total: E.drill * c.n, ...c.fit };
    this.event(`${c.n} veterans have begun their ${hall.B.hall ? 'training' : 'drill'} as ${KITS[key].name.toLowerCase()}.`);
    return { ok: true };
  }

  updateHalls(dt) {
    for (const hall of this.buildings) {
      const T = hall.training, S = T && trainsAt(hall);
      if (!T || !S || hall.state !== 'active') continue;
      T.left -= dt;
      hall.status = `${S.elite ? 'Training' : 'Drilling'} ${T.n} ${KITS[T.key].name.toLowerCase()}: ${Math.max(1, Math.round(T.left / 60))} min left`;
      if (T.left > 0) continue;
      hall.training = null;
      hall.status = '';
      const men = this.veterans().sort((a, b) => (b.xp || 0) - (a.xp || 0)).slice(0, T.n);
      // Veterans who died meanwhile: their kit goes back to the stores.
      const fit = { armour: T.armour ?? baseArmour(T.key), shield: T.shield ?? canShield(T.key) };
      if (men.length < T.n) for (const [g, k] of Object.entries(outfitKit(T.key, T.n - men.length, fit))) this.put(this.keep, g, k);
      if (!men.length) { this.event('The veterans in training are gone; their kit is back in the stores.'); continue; }
      for (const v of men) { this.release(v); v.hidden = false; }
      const xp = Math.max(...men.map(v => v.xp || 0)) + S.gain;
      const out = Math.atan2(hall.x, hall.z);
      const r = this.battle.addRegiment(0, T.key, hall.x + Math.sin(out) * 18, hall.z + Math.cos(out) * 18, out,
        { count: men.length, from: men, name: KITS[T.key].name, xp, ...fit });
      Object.assign(r, { levy: T.key, hall: hall.id }, S.elite ? { elite: true } : {}, fit);
      r.soldiers.forEach((s, i) => { men[i].state = 'soldier'; men[i].soldier = s; s.villager = men[i]; });
      audio.play('drums', hall, this.battle); // audio
      this.event(`${men.length} ${KITS[T.key].name.toLowerCase()} have finished their ${S.elite ? 'training' : 'drill'}.`);
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

  // ---- gold for the village ----

  feastPrice() { return Math.max(FEAST.least, Math.round(this.population * FEAST.perHead)); }
  feastCheck() {
    if (this.time < (this.feastUntil || 0)) return { ok: false, reason: 'The feast is on' };
    if (this.time < (this.feastAt ?? -Infinity) + FEAST.again) return { ok: false, reason: `Another feast in ${Math.ceil(((this.feastAt + FEAST.again) - this.time) / 60)} min` };
    const g = this.feastPrice();
    return this.purse.gold >= g ? { ok: true, gold: g } : { ok: false, reason: `Needs ${g} gold` };
  }
  feast() {
    const c = this.feastCheck();
    if (!c.ok) return c;
    this.purse.gold -= c.gold;
    this.feastAt = this.time;
    this.feastUntil = this.time + FEAST.secs;
    this.moodClock = 0;
    this.event(`A feast for the whole village: roast meat, ale and music by the keep.`);
    audio.play('feast', this.keep, this.battle); // audio
    return { ok: true };
  }

  // The next keep level to raise for gold, and whether it can be raised now.
  keepRaiseCheck() {
    const K = KEEP_RAISE[this.keepBought || 0];
    if (!K || this.keepLevel) return { ok: false, reason: 'The keep is as great as it gets', done: true };
    if (this.population < K.pop) return { ok: false, reason: `Needs a village of ${K.pop} people`, K };
    if (this.purse.gold < K.gold) return { ok: false, reason: `Needs ${K.gold} gold`, K };
    if (!this.canAfford(K.cost)) return { ok: false, reason: `Needs ${listCost(K.cost)}`, K };
    return { ok: true, K };
  }
  raiseKeep() {
    const c = this.keepRaiseCheck();
    if (!c.ok) return c;
    this.purse.gold -= c.K.gold;
    this.spend(c.K.cost);
    this.keepBought = (this.keepBought || 0) + 1;
    this.moodClock = 0;
    this.event(`The masons have raised a ${c.K.name}. It houses ${c.K.housing} more, and the village is proud of it.`);
    return { ok: true };
  }

  masonsCheck() {
    if (this.time < (this.masonsUntil || 0)) return { ok: false, reason: `Hired: ${Math.ceil((this.masonsUntil - this.time) / 60)} min left` };
    return this.purse.gold >= MASONS.gold ? { ok: true } : { ok: false, reason: `Needs ${MASONS.gold} gold` };
  }
  hireMasons() {
    const c = this.masonsCheck();
    if (!c.ok) return c;
    this.purse.gold -= MASONS.gold;
    this.masonsUntil = this.time + MASONS.secs;
    this.event('Hired masons have come to work on the walls.');
    return { ok: true };
  }
  // Hired masons mend damaged walls and towers that stand, away from any fighting.
  mendWalls(dt) {
    if (!(this.time < (this.masonsUntil || 0)) || this.underAttack) return;
    for (const s of this.battle.walls.structures()) if (s.state === 'up' && s.hp < s.maxHp) s.hp = Math.min(s.maxHp, s.hp + s.maxHp * MASONS.mend * dt);
  }

  hireCheck(key) {
    const H = HIRES.find(h => h.key === key);
    const rule = key === 'household' && this.householdRule?.();
    if (rule) return { ok: false, reason: rule };
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
    if (!U || b.state !== 'active' || b.B.hall || b.B.great || b.B.camp || b.kind === 'house') return { ok: false, reason: 'Fully upgraded', done: true };
    if (b.dry) return { ok: false, reason: "Worked out: upgrading won't help" };
    if (U.gold && this.purse.gold < U.gold) return { ok: false, reason: `Needs ${U.gold} gold` };
    if (!this.canAfford(U.cost)) return { ok: false, reason: `Needs ${listCost(U.cost)}` };
    return { ok: true, U };
  }

  upgrade(b) {
    const check = this.upgradeCheck(b);
    if (!check.ok) return check;
    this.purse.gold -= check.U.gold;
    this.spend(check.U.cost);
    b.level = (b.level || 1) + 1;
    this.event(`The ${b.B.name.toLowerCase()} is now level ${b.level}${b.B.jobs && !b.B.haul ? `: work for ${this.jobs(b)}` : ''}.`);
    return { ok: true };
  }

  // Takes goods out of the stores first, then from anywhere they lie.
  spend(cost) {
    for (const [g, n] of Object.entries(cost)) {
      let left = n;
      for (const b of [...this.stores(), ...this.holders()]) {
        if (b.state === 'site') continue;
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
      add(this.time < (this.feastUntil || 0) ? FEAST.mood : 0, 'a feast');
      add(KEEP_RAISE.slice(0, this.keepBought || 0).reduce((n, K) => n + K.mood, 0), 'a great keep');
      add(this.underAttack ? -10 : 0, 'under attack');
      add(this.time - this.defendedAt < DEFENDED.secs ? Math.ceil(DEFENDED.mood * (1 - (this.time - this.defendedAt) / DEFENDED.secs)) : 0, 'they defended their homes');
      add(this.cold ? -12 : 0, 'cold hearths');
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
    audio.play('mob', this.keep, this.battle); // audio
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

  // The tax rate weighed by the mood: what the village's development pays (taxBase) is
  // multiplied by it; 1 at fair taxes and a middling mood.
  get taxRate() { return TAXES[this.taxes].gold * (0.6 + this.mood / 125); }
  // Standing buildings by kind, each upgrade counting half again (economy.js devTax).
  devCounts() {
    const n = {};
    for (const b of this.buildings) if (b.state === 'active' && DEV_TAX[b.kind]) n[b.kind] = (n[b.kind] || 0) + 1 + ((b.level || 1) - 1) / 2;
    return Object.entries(n);
  }
  // Gold a minute from its people, its buildings and its keep, before the rate.
  get taxBase() { return devTax(this.population, this.devCounts(), keepLevel(this)); }

  // ---- simulation ----

  update(dt) {
    if (this.lost) return;
    this.time += dt;
    this.stockCache = null;
    // A place you are storming is only a battlefield until it is yours.
    if (this.hostile) { this.updateAttacks(dt); this.updateBurning(dt); for (const v of this.villagers) this.updateFolk(v, dt); return; }
    this.keepPeak = Math.max(this.keepPeak || 1, byPeople(this.population));
    // Masons: more hands as the village grows, twice as many while hired ones are here.
    this.battle.masons = (1 + Math.floor(this.population / 15)) * (this.time < (this.masonsUntil || 0) ? 2 : 1);
    this.mendWalls(dt);
    for (const v of this.villagers) this.updateVillager(v, dt);
    for (const b of this.buildings) if (b.state === 'active') this.updateBuilding(b, dt);
    this.lendBuilders(dt);
    this.updateFoodHands(dt);
    if ((this.prioClock = (this.prioClock || 0) - dt) <= 0) { this.prioClock = 1; this.prioText = this.prioNote(); }
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

  walk(v, tx, tz, dt, speed = WALK, side = 0) {
    if (Math.hypot(tx - v.x, tz - v.z) < 0.6) { v.v = 0; return true; }
    // By road, when that is quicker: onto it, along it, off it (roadnet.js).
    const r = this.roads.length && this.roadWay(v, tx, tz);
    if (r) {
      if (r.i < r.pts.length && Math.hypot(r.pts[r.i].x - v.x, r.pts[r.i].z - v.z) < 0.8) r.i++;
      if (r.i < r.pts.length) ({ x: tx, z: tz } = r.pts[r.i]);
    }
    // Round any walls, through the gates (battle.js), and round any building in the way.
    ({ x: tx, z: tz } = this.battle.steerWalker(v, side, tx, tz, dt));
    ({ x: tx, z: tz } = this.around(v, tx, tz));
    const dx = tx - v.x, dz = tz - v.z, d = Math.hypot(dx, dz) || 0.01;
    const step = Math.min(d, speed * dt * (this.onRoad(v.x, v.z) ? ROAD.speed : 1));
    v.x += dx / d * step; v.z += dz / d * step;
    v.y = this.heightAt(v.x, v.z);
    v.yaw = Math.atan2(dx, dz);
    v.v = speed;
    v.phase += step * 2.2;
    return false;
  }

  // A walker heading through a building goes round it instead: toward a point beside the
  // nearest one in the way, on the side the straight line passes, until the way is clear.
  // The building being walked to (its door is outside it) and one already stood in the
  // heart of are left alone.
  around(v, tx, tz) {
    const dx = tx - v.x, dz = tz - v.z, len = Math.hypot(dx, dz);
    if (len < 1) return { x: tx, z: tz };
    const ux = dx / len, uz = dz / len;
    let best = null, bt = Infinity;
    for (const b of [this.keep, ...this.buildings]) {
      if (b.state === 'ruined' || b.state === 'site') continue;
      const r = b.B.radius * 0.8 + 0.6, ox = b.x - v.x, oz = b.z - v.z, t = ox * ux + oz * uz;
      if (t <= 0 || t >= len + r || t >= bt) continue;
      const px = ox - ux * t, pz = oz - uz * t;
      // (Only someone well inside, at its heart, is let walk out straight; one who has merely
      // cut the corner of the margin is still steered round.)
      const core = b.B.radius * 0.45;
      if (px * px + pz * pz >= r * r || ox * ox + oz * oz < core * core || Math.hypot(tx - b.x, tz - b.z) < r) continue;
      bt = t; best = { b, r, px, pz };
    }
    if (!best) return { x: tx, z: tz };
    let sx = -best.px, sz = -best.pz, sl = Math.hypot(sx, sz);
    if (sl < 0.01) { sx = -uz; sz = ux; sl = 1; }
    return { x: best.b.x + sx / sl * (best.r + 1.2), z: best.b.z + sz / sl * (best.r + 1.2) };
  }

  // The walker's way to (tx, tz), planned once a leg: again only when the goal moves a few
  // metres, a road is laid or lifted, or the walls change.
  roadWay(v, tx, tz) {
    const r = v.roadWay;
    if (r && r.ver === this.roadsVersion && r.wallsVer === this.battle.nav.version && Math.abs(r.tx - tx) + Math.abs(r.tz - tz) < 3) return r;
    if (this.roadNetVer !== this.roadsVersion) { this.roadNet = new RoadNet(this.roads); this.roadNetVer = this.roadsVersion; }
    let pts = this.roadNet.plan(v, { x: tx, z: tz }) || [];
    // A road through a wall (not a gate) is no way at all: walking it means going round to
    // the gate and back, so the walker goes the plain way instead.
    const nav = this.battle.nav;
    if (pts.length && nav.any) {
      let a = v;
      for (const b of [...pts, { x: tx, z: tz }]) { if (!nav.clear(0, a.x, a.z, b.x, b.z)) { pts = []; break; } a = b; }
    }
    return v.roadWay = { ver: this.roadsVersion, wallsVer: nav.version, tx, tz, i: 0, pts };
  }

  // A levy who falls in battle is a villager lost. How each fell is kept for the word
  // after the fight (endAttack): the early game is meant to be costly, so the cost is said
  // plainly (orchestrator, 2026-11-21).
  fell(v) {
    v.dead = true;
    this.release(v);
    this.grief += 3;
    const r = v.soldier.reg, near = o => Math.hypot(o.cx - r.cx, o.cz - r.cz) < 30;
    const why = !r.T.militia ? 'levy' : r.routing ? 'broke'
      : this.battle.regs.some(o => o.side === 0 && !o.gone && !o.routing && !o.T.militia && near(o)) ? 'beside' : 'alone';
    this.fallen[why] = (this.fallen[why] || 0) + 1;
  }

  // What the last fight cost in villagers, and how, as one line (null if nobody fell).
  fallenWord() {
    const f = this.fallen, n = Object.values(f).reduce((a, b) => a + b, 0);
    if (!n) return null;
    const one = k => f[k] === 1;
    const parts = [
      f.alone && `${f.alone} fought with no soldiers beside them`,
      f.broke && `${f.broke} ${one('broke') ? 'was' : 'were'} cut down when the militia broke`,
      f.beside && `${f.beside} fell beside your soldiers`,
      f.levy && `${f.levy} fell in the levies`,
    ].filter(Boolean);
    return `The fight cost ${n} villager${n === 1 ? '' : 's'}: ${parts.join(', ')}.`;
  }

  updateVillager(v, dt) {
    if (v.state === 'rebel') {
      // out past the trees, they are gone from the village
      if (this.walk(v, v.spot.x, v.spot.z, dt, this.revolt?.phase === 'leave' ? WALK * 1.1 : WALK) && this.revolt?.phase === 'leave') v.gone = true;
      if (v.gone) this.villagers = this.villagers.filter(o => o !== v);
      return;
    }
    if (v.state === 'soldier') {
      if (!v.soldier.alive) this.fell(v);
      return;
    }
    v.v = 0;
    v.checkCd -= dt;
    if (v.checkCd <= 0) {
      v.checkCd = 0.6;
      if (v.state === 'shelter') {
        const safeHome = !this.nearestEnemy(this.keep, 70);
        // Back to the job or the site they left (builders came out idle but still on the site's
        // crew, so a site with all its materials waited for builders for good: creator, 2026-11-21).
        const work = v.job || v.site || this.keep;
        if (safeHome && !this.nearestEnemy(work, 45)) { v.state = v.job ? 'work' : v.site ? 'build' : 'idle'; v.hidden = false; v.task = null; }
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
      if (!v.wander || !this.wanderClear(v.wander) || this.walk(v, v.wander.x, v.wander.z, dt, PACE.wander)) {
        if (this.rand() < 0.02 || !v.wander || !this.wanderClear(v.wander)) v.wander = this.wanderSpot();
      }
      return;
    }
    if (v.state === 'build') return this.doBuild(v, dt);
    if (v.state === 'work') return v.job.B.haul ? this.doHaulJob(v, dt) : v.job.B.gather ? this.doGather(v, dt) : this.doCraft(v, dt);
  }

  // Somewhere for an idle villager to stroll to, clear of every building (walk() lets someone whose
  // goal is inside a footprint straight in: seed Duke, a villager idle in the knights' hall).
  wanderSpot() {
    let p;
    for (let i = 0; i < 8; i++) {
      const a = this.rand() * Math.PI * 2, r = 13 + this.rand() * 8;
      p = { x: Math.sin(a) * r, z: Math.cos(a) * r };
      if (this.wanderClear(p)) break;
    }
    return p;
  }
  wanderClear(p) { return ![this.keep, ...this.buildings].some(b => b.state !== 'ruined' && Math.hypot(p.x - b.x, p.z - b.z) < b.B.radius + 1.5); }

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
    // Someone idle is on no site's crew: a place counted for them would never be filled.
    if (v.site || v.job) this.release(v);
    // The prioritised site or workplace first (up to PRIO_BUILDERS builders).
    const P = this.priority;
    if (P && !P.removed) {
      if (P.state === 'site' && P.builders.length < PRIO_BUILDERS) { P.builders.push(v); v.state = 'build'; v.job = null; v.site = P; return; }
      if (P.state === 'active' && !P.paused && !P.dry && P.B.jobs && P.workers.length < this.staffed(P)) { P.workers.push(v); v.job = P; v.state = 'work'; v.task = null; v.jobEta = this.time + dist(v, P) / WALK + 2; return; }
    }
    let best = null, bd = Infinity;
    for (const b of this.buildings) {
      if (b.state === 'site' && b.builders.length < 2) {
        const d = dist(v, b) - 1000;
        if (d < bd) { bd = d; best = b; }
      }
    }
    if (best) { best.builders.push(v); v.state = 'build'; v.job = null; v.site = best; return; }
    // Idle hands clear the ruins left by fire, one at each, once the raiders are gone.
    if (!this.underAttack && !this.hostile) for (const b of this.buildings) {
      if (b.state !== 'ruined' || b.builders.length) continue;
      const d = dist(v, b);
      if (d < bd) { bd = d; best = b; }
    }
    if (best) { best.builders.push(v); v.state = 'build'; v.job = null; v.site = best; return; }
    // A village short of food fills the farms and lodges first, and only as many haulers as there is
    // food to carry; otherwise the nearest open place gets the hand (round 4: a taken village's few
    // people all took the haulers' places at the keep and nobody worked the farms for half an hour).
    const short = this.foodShort(), food = short ? this.foodHands() : null;
    for (const b of [this.keep, ...this.buildings]) {
      if (b.state !== 'active' || b.paused || !b.B.jobs || b.workers.length >= this.staffed(b)) continue;
      if (b.dry && this.time - b.dry > 30) b.dry = this.pickSpot(b) ? null : this.time;   // game breeds back
      if (b.dry) continue;
      const d = dist(v, b) + (short ? this.foodRank(b, food) * 1e4 : 0);
      if (d < bd) { bd = d; best = b; }
    }
    if (best) { best.workers.push(v); v.job = best; v.state = 'work'; v.task = null; v.jobEta = this.time + dist(v, best) / WALK + 2; }
  }

  // ---- food first ----
  // Under FOOD_FIRST minutes of food in the stores, or hungry.
  foodShort() { return this.hungry || this.larder < FOOD_FIRST; }
  // Meals lying outside the stores: at the farms, waiting for a hauler.
  yardMeals() { return Math.max(0, Math.floor(this.stock.food + this.stock.bread - this.stores().reduce((n, b) => n + (b.store.food || 0) + (b.store.bread || 0), 0))); }
  // Food workplaces with a place for another hand (not worked out, not paused).
  openFood() {
    return this.buildings.reduce((n, b) => n + (b.state === 'active' && !b.paused && !b.dry && b.B.gather?.out?.food ? Math.max(0, this.staffed(b) - b.workers.length) : 0), 0);
  }
  // The yard to clear and the hands already on food: how many haulers the meals lying about call for
  // (one at least while anything lies there, and more as the farms get hands to fill it).
  foodHands() {
    const tillers = this.buildings.reduce((n, b) => n + (b.B.gather?.out?.food ? b.workers.length : 0), 0), yard = this.yardMeals();
    return { yard, tillers, haulers: yard < 1 ? 0 : Math.min(Math.ceil(yard / 15), 1 + Math.floor(tillers / 2)) };
  }
  // 0 for the places a starving village fills first, 1 for the rest, 2 for haulers it has no food to carry for.
  foodRank(b, f) {
    if (b.B.gather?.out?.food) return 0;
    if (b.B.haul) return b.workers.length < f.haulers ? 0 : 2;
    return 1;
  }
  // Every few seconds a village short of food, with a farm or lodge going empty, takes a hand off
  // the job it misses least and sends them to the food: haulers beyond the yard first, then
  // workshops standing idle, then the rest. Said once, with what moved.
  updateFoodHands(dt) {
    this.foodHandCd = (this.foodHandCd || 0) - dt;
    if (this.foodHandCd > 0) return;
    this.foodHandCd = FOOD_HANDS_EVERY;
    if (!this.foodShort() || this.underAttack || this.hostile || !this.openFood()) { if (!this.foodShort()) this.foodHandsTold = false; return; }
    if (this.villagers.some(v => v.state === 'idle')) return;   // idle hands are on their way already
    const f = this.foodHands(), jobs = [this.keep, ...this.buildings].filter(b => b.state === 'active' && b.B.jobs && b.workers.length && !b.B.gather?.out?.food && b !== this.priority);
    const wood = jobs.reduce((n, b) => n + (b.B.gather?.out?.wood ? b.workers.length : 0), 0), haul = jobs.reduce((n, b) => n + (b.B.haul ? b.workers.length : 0), 0);
    let best = null, bs = Infinity;
    for (const b of jobs) {
      let score;
      if (b.B.haul) { if (b.workers.length <= f.haulers || haul <= 1) continue; score = 0; }
      else if (b.B.gather?.out?.wood) { if (wood <= 1) continue; score = 3; }
      else score = !b.B.gather && /^(Waiting|Village has enough|Saving|Store full|Nothing)/.test(b.status || '') ? 1 : 2;
      score += -b.workers.length * 0.1;
      if (score < bs) { bs = score; best = b; }
    }
    if (!best) return;
    this.release(best.workers[best.workers.length - 1]);
    if (!this.foodHandsTold) {
      this.foodHandsTold = true;
      this.event(`Food is short: hands are taken off the ${best.B.name.toLowerCase()} to work the farms.`, 1);
    }
  }

  // One priority per village: a site or a workplace. Setting a new one clears the old; setting the same one clears it.
  setPriority(b) {
    if (!b || b.removed || !(b.state === 'site' || (b.state === 'active' && b.B.jobs))) return false;
    const was = this.priority === b;
    if (this.priority) this.priority.priority = false;
    this.priority = was ? null : b;
    b.priority = !was;
    return !was;
  }
  clearPriority(b) { if (this.priority === b) { this.priority = null; b.priority = false; } }

  // What the prioritised building is doing about it, in a few words (the flag over it and its card's status).
  prioNote() {
    const b = this.priority;
    if (!b || b.removed) return null;
    const idle = this.villagers.some(v => v.state === 'idle'), plural = n => `${n} builder${n === 1 ? '' : 's'}`;
    const waits = /^Waiting for (.+)/.exec(b.status || '');
    if (b.state === 'site') {
      const n = b.builders.length;
      const short = Object.entries(b.B.cost).find(([g, k]) => (b.store[g] || 0) + (b.incoming[g] || 0) < k && (this.stock[g] || 0) < k - (b.store[g] || 0));
      if (b.cutOff) return 'Priority: way blocked';
      if (short) return `Priority: no ${GOODS[short[0]].name.toLowerCase()}`;
      if (waits && n) return `Priority: no ${waits[1]}`;
      // Builders there but the materials haven't come: they wait, they aren't building.
      if (n && b.progress >= this.delivered(b) - 1e-6) {
        const missing = Object.entries(b.B.cost).filter(([g, k]) => (b.store[g] || 0) < k).map(([g]) => GOODS[g].name.toLowerCase());
        // How long until the last missing crate lands: each good's nearest hauler, by the walk they still have
        // (to the pile, then here), at their own pace (the road's speed-up where they stand).
        const left = Object.entries(b.B.cost).filter(([g, k]) => (b.store[g] || 0) < k).map(([g]) => {
          let best = Infinity;
          for (const v of this.villagers) {
            const t = v.task;
            if (t?.kind !== 'haul' || t.to !== b || t.g !== g) continue;
            const way = t.phase === 'fetch' ? dist(v, t.from) + dist(t.from, b) : dist(v, b);
            best = Math.min(best, way / (WALK * (this.onRoad(v.x, v.z) ? ROAD.speed : 1)));
          }
          return best;
        });
        const eta = left.length && left.every(x => x < Infinity) ? Math.max(5, Math.round(Math.max(...left) / 5) * 5) : 0;
        if (missing.length) return `Priority: ${plural(n)} waiting for ${missing.join(' and ')}${eta ? ` (about ${eta} s)` : ''}`;
      }
      if (n >= PRIO_BUILDERS) return `Priority: ${plural(n)} at work`;
      if (idle || this.leastNeeded(b)) return `Priority: ${n ? `${plural(n)}, more` : 'builders'} coming`;
      return n ? `Priority: ${plural(n)}, every hand needed` : 'Priority: every hand needed';
    }
    if (b.paused) return 'Priority: paused';
    if (b.dry) return `Priority: ${(b.dryWhy || 'worked out').toLowerCase()}`;
    const away = b.workers.filter(v => (v.jobEta || 0) > this.time).length;
    if (away) return `Priority: ${away} worker${away === 1 ? '' : 's'} on their way`;
    if (b.workers.length >= this.staffed(b)) return waits ? `Priority: no ${waits[1]}` : 'Priority: fully staffed';
    return idle ? 'Priority: workers coming' : 'Priority: every hand needed';
  }

  // A site nobody has come to build for BUILDER_WAIT seconds takes a hand from the job the village
  // misses least, and gives them back when it is done (playtest round 3b: a carpenter's site waited
  // eleven minutes because every villager had a job). The last farmer, hunter or woodcutter is never taken.
  lendBuilders(dt) {
    for (const s of this.buildings) {
      if (s.state !== 'site' || s.removed) continue;
      const prio = s === this.priority;
      if (s.builders.length >= (prio ? PRIO_BUILDERS : 1)) { s.lacked = 0; continue; }
      s.lacked = (s.lacked || 0) + dt;
      if (s.lacked < (prio ? PRIO_WAIT : BUILDER_WAIT) || this.underAttack || this.hostile) continue;
      if (prio) s.lacked = 0;   // one more hand every PRIO_WAIT seconds, up to four
      const v = this.leastNeeded(s);
      if (!v) continue;
      const from = v.job;
      this.release(v);
      s.builders.push(v); v.state = 'build'; v.job = null; v.site = s; v.lent = from;
      const name = from.B.name.toLowerCase();
      s.lentFrom = name;
      s.status = `Builders taken from the ${name}`;
      this.event(`The ${s.B.name.toLowerCase()} had nobody to build it: a hand was taken from the ${name}, and goes back when it is done.`);
    }
  }

  // The villager whose job matters least to the village now (null when everyone is needed).
  leastNeeded(site) {
    const jobs = [this.keep, ...this.buildings].filter(b => b.state === 'active' && b.B.jobs && b.workers.length);
    const sum = pred => jobs.reduce((n, b) => n + (pred(b) ? b.workers.length : 0), 0);
    const food = sum(b => b.B.gather?.out?.food), wood = sum(b => b.B.gather?.out?.wood), haul = sum(b => b.B.haul);
    let best = null, bs = Infinity;
    for (const b of jobs) {
      const n = b.workers.length, gath = b.B.gather, idleish = !gath && !b.B.haul && /^(Waiting|Village has enough|Saving|Store full)/.test(b.status || '');
      let score;
      if (b.B.haul) { if (haul <= 1) continue; score = 1; }
      else if (gath?.out?.food) { if (food <= 1 || this.hungry) continue; score = 5; }
      else if (gath?.out?.wood) { if (wood <= 1) continue; score = 2; }
      else score = idleish ? 0 : 3;
      // Spare hands at a building first, then the nearest one to the site.
      score += -n * 0.1 + dist(b, site) / 10000;
      if (score < bs) { bs = score; best = b; }
    }
    return best ? best.workers[best.workers.length - 1] : null;
  }

  // Builders can only get as far as the materials on site allow. When more are needed
  // and nobody is bringing them, they fetch them themselves.
  delivered(b) {
    const cost = Object.entries(b.B.cost), all = cost.reduce((n, [, k]) => n + k, 0);
    return cost.reduce((n, [g, k]) => n + Math.min(k, b.store[g] || 0), 0) / all;
  }

  doBuild(v, dt) {
    const b = v.site;
    if (b && !b.removed && b.state === 'ruined') { this.doClear(v, b, dt); return; }
    if (!b || b.removed || b.state !== 'site') { this.release(v); return; }
    if (v.task?.kind === 'haul') { this.doHaul(v, dt); return; }
    const ready = this.delivered(b);
    if (b.progress >= ready - 1e-6) {
      const short = Object.entries(b.B.cost).filter(([g, k]) => (b.store[g] || 0) + (b.incoming[g] || 0) < k);
      if (short.length && this.selfHaul(v, dt)) return;
      b.status = short.length ? `Waiting for ${short.map(([g]) => GOODS[g].name.toLowerCase()).join(' and ')}` : 'Materials on the way';
    }
    const a = Math.atan2(v.x - b.x, v.z - b.z), wx = b.x + Math.sin(a) * (b.B.radius + 0.8), wz = b.z + Math.cos(a) * (b.B.radius + 0.8);
    if (!this.walk(v, wx, wz, dt)) {
      if (!this.stuckNear(v, wx, wz, dt)) return;
      if (!b.cutOff) { b.cutOff = true; this.event(`Builders can't get up to the ${b.B.name.toLowerCase()} (a wall or a building is in the way): they build from where they stand. Clear a way to it.`, 1); }
    }
    this.unstick(v);
    v.yaw = Math.atan2(b.x - v.x, b.z - v.z);
    if (b.progress >= ready - 1e-6) return;
    v.phase += dt * 6;
    b.progress = Math.min(ready, b.progress + dt / b.B.build);
    b.status = b.lentFrom ? `Under construction: builders taken from the ${b.lentFrom}` : 'Under construction';
    audio.tick('hammer', b, dt, 1.5, this.battle); // audio
    if (b.progress >= 1 - 1e-6) {
      b.progress = 1;
      b.store = {};
      this.stockCache = null;
      b.state = 'active';
      b.status = b.B.jobs ? 'Waiting for workers' : '';
      if (b.B.gather?.ripen) b.ripeAt = this.time + b.B.gather.ripen;
      this.clearPriority(b);   // done: the priority is spent
      const crew = b.builders;
      b.builders = [];
      for (const o of crew) { o.state = 'idle'; o.site = null; }
      // Hands taken from their jobs go back first; the rest stay on as the first workers.
      for (const o of crew) {
        const j = o.lent;
        o.lent = null;
        if (j && !j.removed && j.state === 'active' && !j.paused && j.workers.length < this.staffed(j)) { j.workers.push(o); o.job = j; o.state = 'work'; o.task = null; }
      }
      for (const o of crew) if (!o.job && b.B.jobs && b.workers.length < this.staffed(b)) { b.workers.push(o); o.job = b; o.state = 'work'; o.task = null; }
      this.event(`${b.B.name} finished.`);
      this.onBuilt?.(b);
      audio.play('built', b, this.battle); // audio
      if (b.B.hall || b.B.great) this.onMilestone?.(b);
    }
  }

  // A villager clearing a burned-out ruin: it costs nothing but a villager's time (CLEAR_TIME seconds).
  doClear(v, b, dt) {
    if (this.underAttack) { this.release(v); return; }
    const a = Math.atan2(v.x - b.x, v.z - b.z);
    if (!this.walk(v, b.x + Math.sin(a) * (b.B.radius + 0.8), b.z + Math.cos(a) * (b.B.radius + 0.8), dt)) return;
    v.yaw = Math.atan2(b.x - v.x, b.z - v.z);
    v.phase += dt * 5;
    b.clearing = (b.clearing || 0) + dt;
    b.status = `Being cleared: ${Math.max(1, Math.ceil(CLEAR_TIME - b.clearing))} s`;
    audio.tick('hammer', b, dt, 0.8, this.battle); // audio
    if (b.clearing >= CLEAR_TIME) { this.demolish(b); this.event(`The ruined ${b.B.name.toLowerCase()} is cleared away.`); }
  }

  doGather(v, dt) {
    const b = v.job, g = b.B.gather;
    if (v.task?.kind === 'haul') { this.doHaul(v, dt); return; }
    // A full yard stops work until haulers clear it; meanwhile the workers carry crates off themselves.
    if (!v.task && Object.keys(g.out).some(k => (b.store[k] || 0) >= holdOf(k))) {
      if (!this.selfHaul(v, dt)) b.status = 'Yard full: needs haulers';
      return;
    }
    // A new field: the first crop has to come in before there is anything to cut.
    if (b.ripeAt > this.time) {
      b.status = `First crop coming in: ${Math.ceil((b.ripeAt - this.time) / 60 * 2) / 2} min`;
      if (!v.task) v.task = { phase: 'tend', spot: this.pickSpot(b) };
      if (v.task.spot && this.walk(v, v.task.spot.x, v.task.spot.z, dt * 0.5)) v.phase += dt * 2;
      return;
    }
    if (v.task?.phase === 'tend') v.task = null;
    if (!v.task) v.task = { phase: 'out' };
    const t = v.task;
    if (t.phase === 'out') {
      if (!t.spot) t.spot = this.pickSpot(b);
      if (!t.spot) {
        b.status = g.game ? 'Game hunted out: it breeds back slowly' : g.node === 'tree' ? 'No trees left in reach' : 'Deposit worked out';
        // Nothing left to work (playtest, 2026-11-21: a village starved while its people stood at
        // dead mines): its workers go and find other work, and nobody is sent back until there
        // is something to work again (findWork looks every half minute). Said once.
        if (!b.dry) {
          b.dry = this.time; b.dryWhy = b.status;
          const next = this.nextDeposit(b);
          this.event(`The ${b.B.name.toLowerCase()} stands idle: ${b.status.toLowerCase()}. Its workers find other work; ${next ? `the nearest unworked ${next.node.kind === 'rock' ? 'outcrop' : 'deposit'} is ${next.m} m to the ${next.to}: select the ${b.B.name.toLowerCase()} and press Find` : 'no other deposit is left in your land'}.`, 1);
        }
        v.task = null;
        this.release(v);
        return;
      }
      if (this.walk(v, t.spot.x, t.spot.z, dt)) { t.phase = 'gather'; t.timer = g.time / this.speed(b); }
    } else if (t.phase === 'gather') {
      t.timer -= dt;
      v.phase += dt * 5;
      b.status = 'Working';
      audio.tick(g.node, v, dt, 1.2, this.battle); // audio: chopping or picking
      if (t.timer <= 0) { t.phase = 'back'; v.carry = Object.keys(g.out)[0]; }
    } else {
      // Home to the door, or (a door against a town wall, QC at Kingsbridge: two woodcutters walked on
      // the spot for minutes) set down from where they stand, as carriers do.
      const d = this.door(b, v);
      if (!this.walk(v, d.x, d.z, dt)) {
        if (!this.stuckNear(v, d.x, d.z, dt)) return;
        if (!b.cutOff) { b.cutOff = true; this.event(`The ${b.B.name.toLowerCase()}'s workers can't reach its door (a wall or a building is in the way): they set down what they bring from where they stand. Clear a way to it.`, 1); }
      }
      this.unstick(v);
      // A hunt takes from the game of its patch; a deposit gives what it has left.
      let k = 1;
      if (g.game) k = this.huntAt(t.spot) ? 1 : 0;
      const n0 = t.spot.node;
      if (n0?.left !== undefined) {
        const q = Object.values(g.out)[0];
        k = Math.min(1, n0.left / q);
        n0.left = Math.max(0, n0.left - q);
        if (n0.left <= 0 && n0.standing !== false) {
          n0.standing = false;
          this.event(`${n0.kind === 'rock' ? 'A stone outcrop' : 'An ore deposit'} to the ${compass(n0)} is worked out.`, 1);
        }
      }
      if (k > 0) for (const [g2, n] of Object.entries(g.out)) this.put(b, g2, n * k);
      v.carry = null;
      v.task = null;
    }
  }

  // ---- paved roads ----
  roadCost(a, b) { return Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / ROAD.perStone)); }
  roadCheck(a, b) {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 2) return { ok: false, reason: 'Too short' };
    if (len > ROAD.max) return { ok: false, reason: `At most ${ROAD.max} m at a time` };
    if (Math.hypot(a.x, a.z) > this.territory || Math.hypot(b.x, b.z) > this.territory) return { ok: false, reason: 'Outside your land' };
    for (const o of this.buildings) {
      if (o.state === 'ruined') continue;
      const h = segDist(o, a, b);
      if (h < o.B.radius - 0.5) return { ok: false, reason: `The ${o.B.name.toLowerCase()} is in the way` };
    }
    const stone = this.roadCost(a, b);
    if (this.free('stone') < stone) return { ok: false, reason: `Needs ${stone} stone`, stone };
    return { ok: true, stone, len };
  }
  layRoad(a, b) {
    const c = this.roadCheck(a, b);
    if (!c.ok) return c;
    this.spend({ stone: c.stone });
    this.roads.push({ a: { x: a.x, z: a.z }, b: { x: b.x, z: b.z } });
    this.pave(this.roads.at(-1));
    this.roadsVersion++;
    return c;
  }
  pave(r) {
    const w = ROAD.width / 2 + 0.4;
    const x0 = Math.min(r.a.x, r.b.x) - w, x1 = Math.max(r.a.x, r.b.x) + w, z0 = Math.min(r.a.z, r.b.z) - w, z1 = Math.max(r.a.z, r.b.z) + w;
    for (let cz = Math.floor((z0 + RSPAN) / RCELL); cz <= Math.floor((z1 + RSPAN) / RCELL); cz++) {
      for (let cx = Math.floor((x0 + RSPAN) / RCELL); cx <= Math.floor((x1 + RSPAN) / RCELL); cx++) {
        if (cx < 0 || cz < 0 || cx >= RN || cz >= RN) continue;
        if (segDist({ x: (cx + 0.5) * RCELL - RSPAN, z: (cz + 0.5) * RCELL - RSPAN }, r.a, r.b) <= w) this.paved[cz * RN + cx] = 1;
      }
    }
  }
  onRoad(x, z) {
    if (!this.roads.length) return false;
    const cx = Math.floor((x + RSPAN) / RCELL), cz = Math.floor((z + RSPAN) / RCELL);
    return cx >= 0 && cz >= 0 && cx < RN && cz < RN && this.paved[cz * RN + cx] === 1;
  }
  // Lifts the road nearest p (within a few metres): half its stone comes back.
  liftRoad(p) {
    const r = this.roads.find(o => segDist(p, o.a, o.b) < ROAD.width);
    if (!r) return false;
    this.roads = this.roads.filter(o => o !== r);
    this.put(this.keep, 'stone', Math.floor(this.roadCost(r.a, r.b) / 2));
    this.paved.fill(0);
    for (const o of this.roads) this.pave(o);
    this.roadsVersion++;
    return true;
  }

  // ---- game in the woods ----
  gameCell(p) { return `${Math.floor(p.x / GAME.cell)},${Math.floor(p.z / GAME.cell)}`; }
  gameAt(p) {
    const c = this.game[this.gameCell(p)];
    return c ? Math.min(1, c.v + (this.time - c.t) * GAME.regrow) : 1;
  }
  // One hunt in the patch at p: true if there was game to take.
  huntAt(p) {
    const v = this.gameAt(p);
    if (v < GAME.take) return false;
    this.game[this.gameCell(p)] = { v: v - GAME.take, t: this.time };
    return true;
  }
  // How much game is left in reach of a hunter's lodge, 0 to 1.
  gameNear(b) {
    const cells = new Set(this.nodes.tree.filter(n => n.standing && dist(n, b) < b.B.gather.range).map(n => this.gameCell(n)));
    if (!cells.size) return 0;
    let sum = 0;
    for (const k of cells) { const [i, j] = k.split(',').map(Number); sum += this.gameAt({ x: (i + 0.5) * GAME.cell, z: (j + 0.5) * GAME.cell }); }
    return sum / cells.size;
  }

  // The deposits a quarry or mine at (x, z) can reach, and what they hold (placing one says so).
  depositsAt(x, z, g) {
    const list = this.nodes[g.node].filter(n => (n.standing ?? true) && dist(n, { x, z }) < g.range);
    return { list, left: list.reduce((n, d) => n + Math.max(0, d.left ?? 0), 0) };
  }

  // Where to dig next once a quarry or mine has run dry: the nearest deposit out of its reach that
  // no working quarry or mine of the same kind covers already (playtest, 2026-11-21).
  nextDeposit(b) {
    const g = b.B.gather;
    if (!g || !(g.node === 'rock' || g.node === 'ore')) return null;
    const worked = this.buildings.filter(o => o !== b && o.state === 'active' && !o.dry && o.B.gather?.node === g.node);
    const node = this.nodes[g.node].filter(n => (n.standing ?? true) && (n.left ?? 1) > 0 && dist(n, b) >= g.range
      && !worked.some(o => dist(n, o) < o.B.gather.range)).sort((p, q) => dist(p, b) - dist(q, b))[0];
    return node ? { node, m: Math.round(dist(node, b)), to: compass({ x: node.x - b.x, z: node.z - b.z }) } : null;
  }

  pickSpot(b) {
    const g = b.B.gather;
    if (g.node === 'field') {
      const a = this.rand() * Math.PI * 2, r = this.rand() * (b.B.radius - 2);
      return { x: b.x + Math.sin(a) * r, z: b.z + Math.cos(a) * r };
    }
    // A random choice among the closest few, so workers spread out. Hunters go where
    // there is still game.
    const near = this.nodes[g.node].filter(n => (n.standing ?? true) && dist(n, b) < g.range && (!g.game || this.gameAt(n) >= GAME.take))
      .sort((p, q) => dist(p, b) - dist(q, b)).slice(0, 6);
    if (!near.length) return null;
    const n = near[Math.floor(this.rand() * near.length)];
    const a = this.rand() * Math.PI * 2, off = g.node === 'tree' ? 1.6 : 4.5;
    return { x: n.x + Math.sin(a) * off, z: n.z + Math.cos(a) * off, node: n.left !== undefined ? n : null };
  }

  doCraft(v, dt) {
    const b = v.job;
    if (v.task?.kind === 'haul') { this.doHaul(v, dt); return; }
    const door = this.door(b, v);
    v.atDoor = false;
    if (!this.walk(v, door.x, door.z, dt)) return;
    v.atDoor = true;
    v.yaw = b.angle + Math.PI;
    if (b.workers[0] !== v) return;           // one craftsman sets the pace; each other hand at the door adds to it
    if (b.recipe) {
      b.timer -= dt * b.workers.filter(o => o.atDoor && o.job === b).length;
      v.phase += dt * 4;
      audio.tick(CRAFT_SOUND[b.kind] || 'hammer', b, dt, 0.6, this.battle); // audio: a saw or a smith's hammer, else a hammer
      if (b.timer <= 0) {
        for (const [k, n] of Object.entries(b.recipe.out)) this.put(b, k, n);
        if (b.recipe.gold) {
          const g = saleGood(b.recipe), gold = b.recipe.gold * priceShare(this.glut, g, this.time);
          glut(this.glut ??= {}, g, b.recipe.in[g], this.time);
          this.purse.gold += gold; this.earned = (this.earned || 0) + gold;
        }
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
        : list.some((r, i) => !b.off.has(i) && this.savingWood(r)) ? 'Waiting: wood kept for building'
        : list.some((r, i) => !b.off.has(i) && this.savingPlanks(r)) ? 'Saving planks for building' : 'Village has enough';
    }
    this.selfHaul(v, dt);
  }

  updateBuilding(b, dt) {
    if (b.B.engines) b.status = Object.keys(ENGINES).some(k => this.engineCheck(k, b).ok) ? 'Ready to build an engine' : 'Waiting for materials';
    if (!b.B.jobs) return;
    if (b.paused) b.status = 'Paused';
    else if (b.dry) b.status = `${b.dryWhy}: move it or pull it down`;
    else if (!b.workers.length) b.status = 'No workers';
    else if (b.B.haul) b.status = this.haulStatus(b);
    // Damage mends slowly once the raiders are gone.
    if (b.hp < b.B.hp && !this.nearestEnemy(b, 40)) b.hp = Math.min(b.B.hp, b.hp + dt * 2);
  }

  haulStatus(b) {
    const busy = b.workers.filter(v => v.task?.kind === 'haul').length;
    return busy ? `${busy} carrying goods` : 'Haulers waiting for work';
  }

  // Houses with a hearth, and the keep's.
  get hearths() { return 1 + this.buildings.filter(b => b.state === 'active' && b.B.housing).length; }
  // Wood the hearths can draw on: everything held but what sits at building sites.
  hearthWood() { return this.holders().reduce((n, b) => n + (b.state === 'site' ? 0 : b.store.wood || 0), 0); }
  // Cold right now, not as of the last meal (a loaded village shows the flag it was saved with).
  get coldNow() { return this.hearthWood() < this.hearths * FIREWOOD / 2; }

  // Meals in the stores for each person.
  get larder() {
    const meals = this.stores().reduce((n, b) => n + (b.store.food || 0) + (b.store.bread || 0), 0);
    return meals / Math.max(1, this.population);
  }

  // How many people one working farm or lodge feeds: its workers' yield a minute (a trip is about
  // the work time plus 12 s of walking), at a meal a head a minute.
  feeds(B) { const g = B.gather; return Math.floor((B.jobs || 1) * (g.out.food || 0) * 60 / (g.time + 12)); }

  // What is wrong with the food, in a few words, and what to do: nothing growing, nobody at the farms,
  // meals piling at the farms, a first crop still coming, or too few farms for the mouths. (Round 4:
  // a taken village starved for half an hour and said only "hungry".)
  foodCause() {
    const pop = this.population;
    const makers = this.buildings.filter(b => b.state === 'active' && b.B.gather?.out?.food && !b.paused);
    const working = makers.filter(b => b.workers.length && !b.dry);
    const ripening = working.filter(b => b.ripeAt > this.time);
    const yard = this.yardMeals(), open = this.openFood();
    const farm = BUILDINGS.farm, perFarm = this.feeds(farm);
    if (!makers.length) return { why: 'nothing is growing or hunting food', fix: `build a farm (it feeds about ${perFarm}; its first crop takes ${Math.round(farm.gather.ripen / 30) / 2} min)` };
    if (!working.length) {
      const hands = this.villagers.filter(v => v.state !== 'soldier').length;
      return { why: `nobody is working the ${makers.length} farm${makers.length > 1 ? 's' : ''} (${hands} hands, all at other jobs)`, fix: 'hands are taken off other work for the farms; if there are none to spare, build houses once it is fed' };
    }
    if (yard >= Math.max(10, pop / 2)) return { why: `${yard} meals are piling up at the farms, not reaching the stores`, fix: 'add haulers (a second hauler at the keep, or a storehouse near the farms)' };
    if (ripening.length) {
      const soonest = Math.min(...ripening.map(b => b.ripeAt - this.time));
      return { why: `${ripening.length > 1 ? `${ripening.length} farms are` : 'a farm is'} still ripening`, fix: `the first crop comes in ${Math.ceil(soonest / 30) / 2} min; a hunter's lodge feeds sooner, and no new houses until then` };
    }
    const fed = working.reduce((n, b) => n + this.feeds(b.B), 0);
    if (open) return { why: `${pop} people, but only ${working.length} of ${makers.length} food workplaces have hands (about ${fed} fed)`, fix: `${open} places are open: hands come off other work for them, and nothing new settles until the stores fill` };
    return { why: `${pop} people, but ${working.length} working food place${working.length > 1 ? 's' : ''} feed${working.length > 1 ? '' : 's'} about ${fed}`, fix: `build ${Math.max(1, Math.ceil((pop - fed) / perFarm))} more farm${pop - fed > perFarm ? 's' : ''}, and no new houses until they are growing` };
  }

  // Food seen coming, before the village goes hungry (which only shows at under half a minute of meals):
  // minutes in the stores, the trend, and what is to blame, with a fix. Null when all is well.
  foodOutlook() {
    const pop = this.population;
    if (!pop || this.hungry) return null;
    const mins = this.larder, trend = this.foodTrend ?? null;
    if (mins >= 3 || (trend !== null && trend >= 0 && mins >= 1.5)) return null;
    const left = `${mins < 1 ? 'under a minute' : `about ${Math.round(mins * 10) / 10} min`} of food for ${pop}`;
    const { why, fix } = this.foodCause();
    return { mins, level: mins < 1.5 ? 4 : 3, text: `${left}: ${why}`, fix, why };
  }

  // Why the village has gone hungry (the alert, the panel and the realm screen say it).
  hungerWhy() {
    const { why, fix } = this.foodCause();
    return { why: `${this.population} people: ${why}`, fix };
  }

  // Building sites held up for wood or planks, and who is to blame: no woodcutter, a woodcutter with
  // nobody at it, or a workshop turning the wood into something else (round 4: two carpenters sawed
  // shields for fourteen minutes while the houses waited, and nothing said so). Null when no site waits.
  woodOutlook() {
    if (this.underAttack || this.hostile || !(this.woodWait >= 2)) return null;
    const sites = this.buildings.filter(b => b.state === 'site' && !b.removed && /^Waiting for.*(wood|planks)/.test(b.status || ''));
    if (!sites.length) return null;
    const goods = [...new Set(sites.flatMap(b => ['wood', 'planks'].filter(g => (b.status || '').includes(g))))];
    const cutters = this.buildings.filter(b => b.state === 'active' && b.B.gather?.out?.wood && !b.paused);
    const eaters = this.buildings.filter(b => b.state === 'active' && b.B.recipes && b.recipe && ('wood' in b.recipe.in || 'planks' in b.recipe.in));
    let why, fix;
    if (!cutters.length) { why = 'no woodcutter stands'; fix = 'build a woodcutter by the trees'; }
    else if (!cutters.some(b => b.workers.length)) { why = 'the woodcutters have nobody at them'; fix = 'hands come off other work for them once the village is fed'; }
    else if (eaters.length) {
      const what = [...new Set(eaters.map(b => `${b.B.name.toLowerCase()} making ${Object.keys(b.recipe.out).map(g => GOODS[g].name.toLowerCase()).join(' and ')}`))];
      why = `the ${what.join(' and the ')} ${what.length > 1 ? 'are' : 'is'} using it`; fix = 'switch that recipe off in its panel, or build more woodcutters';
    } else { why = 'the woodcutters are not keeping up'; fix = 'build another woodcutter, or find trees nearer'; }
    const n = sites.length, names = [...new Set(sites.map(b => b.B.name.toLowerCase()))].slice(0, 2).join(' and ');
    return { text: `${n > 1 ? `${n} sites (${names}) wait` : `the ${names} waits`} for ${goods.join(' and ')}: ${why}`, fix, why };
  }

  // Hands without a job while the village has none to give: what to build, or why they stand.
  jobsOutlook() {
    const pop = this.population, idle = this.idle;
    if (pop < 8 || idle < Math.max(5, pop * 0.25)) return null;
    const open = this.buildings.concat([this.keep]).reduce((n, b) => n + (b.state === 'active' && !b.paused && !b.dry && b.B.jobs ? Math.max(0, this.staffed(b) - b.workers.length) : 0), 0);
    const s = this.stock, need = [];
    if (this.larder < 4) need.push('a farm');
    if (s.wood < 60) need.push('a woodcutter');
    if (s.stone < 40) need.push('a quarry');
    if (!need.length) need.push('a woodcutter', 'a farm', 'a quarry');
    const list = need.length > 1 ? `${need.slice(0, -1).join(', ')} or ${need.at(-1)}` : need[0];
    return { idle, open, text: `${idle} of ${pop} without work: ${open >= idle ? `${open} places are open, they are on their way` : `build ${list}`}` };
  }

  // The village's name: what draws settlers besides food and mood. [[n, why]], summed.
  repute() {
    const why = [];
    for (const k of ['monastery', 'market', 'well']) if (this.buildings.some(b => b.kind === k && b.state === 'active')) why.push([REPUTE[k], BUILDINGS[k].name.toLowerCase()]);
    if (this.time - this.lastRaid < 300) why.push([REPUTE.raided, 'raided of late']);
    else if (this.time > 600 && this.time - this.lastRaid > 600) why.push([REPUTE.safe, 'safe roads']);
    if (this.cold) why.push([REPUTE.cold, 'cold hearths']);
    return why;
  }

  // How fast newcomers come (a minute) and why: none while hungry, under attack or full.
  settlers() {
    const larder = this.hungry ? 0 : this.larder;
    const food = larder < 1 ? 0 : Math.min(1, (larder - 1) / 3);
    const mood = Math.max(0, Math.min(1.2, (this.mood - 30) / 50));
    const why = this.repute(), name = Math.max(0.3, Math.min(2, 1 + why.reduce((n, [k]) => n + k, 0)));
    const room = this.population < this.housing && !this.underAttack;
    const rate = room ? settleRate(larder, this.mood, name) : 0;
    const block = this.population >= this.housing ? 'no room: build houses' : this.underAttack ? 'under attack' : !food ? 'not enough food to spare' : '';
    return { rate, room, food, mood, name, why, block };
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
      // Food coming up short is said once, early, with what to do about it.
      (this.foodSamples ??= []).push({ t: this.time, meals: this.stock.food + this.stock.bread });
      if (this.foodSamples.length > 6) this.foodSamples.shift();
      const f0 = this.foodSamples[0], f1 = this.foodSamples.at(-1);
      this.foodTrend = f1.t - f0.t >= 60 ? (f1.meals - f0.meals) / ((f1.t - f0.t) / 60) : null;
      // Sites kept waiting for wood or planks (two ticks running, a minute): said once in five minutes.
      this.woodWait = this.buildings.some(b => b.state === 'site' && !b.removed && /^Waiting for.*(wood|planks)/.test(b.status || '')) ? (this.woodWait || 0) + 1 : 0;
      const wo = this.woodOutlook();
      if (wo && this.time - (this.woodSaid ?? -1e9) > 300) { this.woodSaid = this.time; this.event(`Building is held up: ${wo.text}. ${wo.fix[0].toUpperCase()}${wo.fix.slice(1)}.`, 1); }
      const out = this.foodOutlook();
      if (out && !this.foodWarned) { this.foodWarned = true; this.event(`Food is running short: ${out.text}. ${out.fix[0].toUpperCase()}${out.fix.slice(1)}.`, 1); }
      else if (!out && this.foodWarned && this.larder >= 4) this.foodWarned = false;
      // Hearths: each house, and the keep, burns a little wood, fetched from wherever it is.
      const fire = this.hearths * FIREWOOD / 2;
      const wood = this.hearthWood();
      const wasCold = this.cold;
      this.cold = wood < fire;
      this.spend({ wood: Math.min(fire, wood) });
      if (this.cold && !wasCold) this.event('The hearths are going cold: the village needs firewood.', 1);
    }
    this.updateMood(dt);
    this.updateHalls(dt);
    this.updateRevolt(dt);
    // Newcomers, drawn by spare food, a good mood and the village's name; houses only
    // set how many can live here. They come as working adults.
    const draw = this.settlers();
    this.settling = draw.room ? (this.settling || 0) + draw.rate / 60 * dt : 0;
    if (this.settling >= 1) {
      this.settling -= 1;
      const a = this.rand() * Math.PI * 2;
      const v = this.addVillager(Math.sin(a) * 120, Math.cos(a) * 120);
      v.wander = { x: Math.sin(a) * 15, z: Math.cos(a) * 15 };
      this.event('A newcomer has settled in the village.');
    }
    // Those who fled when it changed hands come home while it is fed, safe and has room (world/militia.js).
    if (this.fled) {
      this.fledBack = (this.fledBack || 0) + driftHome(this, dt, !this.hungry && !this.underAttack && this.population < this.housing);
      for (; this.fledBack >= 1; this.fledBack--) {
        const a = this.rand() * Math.PI * 2;
        this.addVillager(Math.sin(a) * 120, Math.cos(a) * 120).wander = { x: Math.sin(a) * 15, z: Math.cos(a) * 15 };
        this.event('One of those who fled has come home.');
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
    if (!this.underAttack) { this.fallen = {}; this.droveSaid = this.holdSaid = this.fellBackSaid = this.fallingBack = this.calledOut = false; }
    // Raiders in the woods are hidden from an enemy's eyes (battle.updateSight), but not on a
    // village's own land: its people see them burn it, and you must be able to order men at
    // them (a band in the trees by the village could not be clicked, nor answered).
    if (!this.hostile) b.openGround = { x: this.keep.x, z: this.keep.z, r: HOME_LAND };
    this.attackers.push({ regs, mode, entry, time: 0, burned: 0, leaving: false, onLeave, house, prepare: mode === 'siege' ? prepare : 0, losses: [...b.losses] });
    this.lastRaid = this.time;
    this.lastRegs = regs;
    this.event(mode === 'siege' ? `${name} has made camp to the ${compass(entry)} and is readying an assault!`
      : `${name} ${mode === 'raid' ? 'are raiding' : 'are attacking'} the village from the ${compass(entry)}!${this.musterCheck().ok ? ' Your people will turn out. Lead them, or lose them.' : ''}`, 1);
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
      // An assault that drew off from a gate it couldn't break (ai.js thinkSiegeAttack) goes home.
      if (g.mode === 'assault' && !g.leaving && this.battle.siegeAI?.drawnOff) {
        g.leaving = true;
        this.event('The besiegers could not break the gate and have drawn off.');
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
    this.fallenSaid = null;
    if (!this.underAttack && !this.lost && !this.hostile) this.blooded();
    const survivors = g.regs.map(r => ({ key: r.T.key, name: r.name, count: r.soldiers.filter(s => s.alive).length, ...carry(r) })).filter(sp => sp.count > 0);
    if (!this.lost && g.mode !== 'hold' && !this.hostile) this.event('The attackers are gone. The village breathes again.');
    // Beaten, not just gone with their plunder, while the militia was out: a proud village.
    if (!this.lost && !this.hostile && g.mode !== 'hold' && !g.leaving && this.musterAt >= this.time - g.time) {
      this.defendedAt = this.time;
      this.event('The militia beat them off. The village is proud: they defended their homes.');
    }
    // What it cost, counting those who fell in its last moments (before the militia go
    // home, so each is counted as the fight left them).
    if (!this.underAttack) for (const v of this.villagers) if (v.state === 'soldier' && !v.soldier.alive) this.fell(v);
    // home at once, not on the next think: a militia standing at peace for that moment
    // would still offer Stand down, and a save made then would keep them under arms
    if (!this.underAttack) this.thinkMilitia();
    // Soldiers who went out against the raiders by themselves go back to where they stood
    // (not left out in the field, with the village open behind them).
    if (!this.underAttack) for (const r of this.battle.regs) {
      const h = r.homeSpot, last = r.homeTarget;
      r.homeSpot = r.homeTarget = null;
      r.fallBack = false;
      // (a chase leaves its last waypoint behind as a dest, where the foe was; an order of yours is somewhere else)
      const theirs = r.targetReg ? r.targetReg.gone : !r.dest || (last && Math.hypot(r.dest.x - last.cx, r.dest.z - last.cz) < 30);
      if (h && r.side === 0 && this.battle.usable(r) && theirs && !r.targetWall && !r.posts && Math.hypot(r.cx - h.x, r.cz - h.z) > 12) this.battle.orderMove([r], h.x, h.z, h.angle);
    }
    if (!this.underAttack && !this.lost && !this.hostile) {
      const word = this.fallenWord();
      if (word) this.event(word, 1);
      this.fallenSaid = word;   // for the world's log, when nobody is watching (world.attackTown)
      this.fallen = {};
    }
    // (leaving: they got away with their plunder; dead: who fell on each side in this attack)
    const dead = this.battle.losses.map((n, i) => n - (g.losses?.[i] ?? n));
    g.onLeave?.(survivors, g.leaving, { ours: dead[0], theirs: dead[1] });
  }

  // Raiders who get away carry off a share of what the stores hold. Returns what they took.
  rob(share) {
    const took = {};
    for (const g of ['food', 'bread', 'wood', 'planks', 'iron']) {
      let n = Math.floor(Math.max(0, this.free(g) || 0) * share);
      if (n < 1) continue;
      took[g] = n;
      for (const b of this.stores()) {
        const k = Math.min(n, b.store[g] || 0);
        if (k > 0) { this.put(b, g, -k); n -= k; }
        if (n <= 0) break;
      }
      took[g] -= n;
    }
    return took;
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
    this.thinkDefenders();
    this.thinkMilitia();
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
        // Only men they can get at: one across a standing wall is the siege's business, and sending
        // them at him anyway failed the way-in search once a second (QC, 2026-11-21: breachFor warnings).
        const near = defenders.filter(d => Math.hypot(d.cx - r.cx, d.cz - r.cz) < (r.T.range ? r.T.range : 45) && (!b.nav.any || b.shoots(r) || b.reaches(r, d)))
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
    const ranged = key => ['archer', 'yeoman', 'crossbow', 'hiredxbow'].includes(key);
    const regs = specs.map((sp, i) => {
      const a = entryAngle + (i - (n - 1) / 2) * Math.min(0.55, 2.8 / Math.max(1, n));
      // Inside their walls if they have them, else in a ring out in front of the keep.
      const d = sp.militia ? 9 : b.walls.any ? (ranged(sp.key) ? 13 : 17) : ranged(sp.key) ? 16 : 32;   // the village's own people by the keep
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

  // The people of a place you are storming: about their houses and workshops until your
  // men come near, then running for the keep, where they hide until it is decided.
  townsfolk(n) {
    const homes = this.buildings.filter(b => b.state === 'active' && (b.kind === 'house' || b.kind === 'tent'));
    const spots = homes.length ? homes : this.buildings.filter(b => b.state === 'active');
    for (let i = 0; i < n; i++) {
      const b = spots[i % Math.max(1, spots.length)], a = this.rand() * Math.PI * 2, r = b ? b.B.radius + 1.5 : 14;
      const v = this.addVillager((b?.x || 0) + Math.sin(a) * r, (b?.z || 0) + Math.cos(a) * r);
      v.folk = { x: v.x, z: v.z };
    }
  }

  updateFolk(v, dt) {
    if (v.hidden) return;
    v.v = 0;
    v.checkCd -= dt;
    if (v.checkCd <= 0) {
      v.checkCd = 0.5;
      if (v.state !== 'flee') {
        let near = false;
        this.battle.forNear(v.x, v.z, 35, s => { if (!near && s.reg.side === 0 && s.alive) near = true; });
        if (near) v.state = 'flee';
      }
    }
    if (v.state === 'flee') {
      if (this.walk(v, this.keep.x + (this.rand() - 0.5) * 4, this.keep.z + (this.rand() - 0.5) * 4, dt, WALK * 1.6, 1)) { v.state = 'shelter'; v.hidden = true; }
      return;
    }
    const home = v.folk || { x: 0, z: 0 };
    if (!v.wander || this.walk(v, v.wander.x, v.wander.z, dt, PACE.wander, 1)) {
      const a = this.rand() * Math.PI * 2, r = 2 + this.rand() * 6;
      v.wander = { x: home.x + Math.sin(a) * r, z: home.z + Math.cos(a) * r };
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
    // Those who hid in the keep come out; the rest are gone from the place.
    this.villagers = this.villagers.filter(v => v.state === 'soldier' || !v.folk).concat(this.villagers.filter(v => v.folk && v.state !== 'soldier').slice(0, villagers));
    for (const v of this.villagers) if (v.folk) Object.assign(v, { folk: null, hidden: false, state: 'idle', wander: null });
    for (let i = this.villagers.filter(v => v.state !== 'soldier').length; i < villagers; i++) {
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
    const added = [];
    for (const sp of specs) {
      const from = [];
      for (let i = 0; i < sp.count; i++) from.push({ x: entry.x + (this.rand() - 0.5) * 14, z: entry.z + (this.rand() - 0.5) * 14 });
      const fit = carry(sp);
      const r = this.battle.addRegiment(0, sp.key, entry.x, entry.z, face, { count: sp.count, name: sp.name, from, xp: sp.xp || 0, ...fit });
      added.push(r);
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
    }
    // up the road toward the keep, to form up together beside it (`formUp`)
    this.formUp(added, angle, standAt);
    return added;
  }

  // A regiment's block standing at (x, z) facing `angle`: half its width, and how far its
  // ranks reach behind the front (battle.js slot), with a man's room round the edge.
  block(r, x, z, angle) {
    const F = FORMATIONS[r.formation] || FORMATIONS.line, n = Math.max(1, r.alive ?? r.count);
    const files = Math.max(1, Math.min(r.files, n));
    return { x, z, angle, w: (files - 1) * r.T.spacing * F.spacing / 2 + 1,
      back: (Math.ceil(n / files) - 1) * (r.T.depth || r.T.spacing) * F.depth + 1 + (r.T.engineLen || 0) };
  }
  // Where a regiment stands, or is going to stand, as a block.
  standing(r) {
    const d = r.dest;
    return d && d.angle != null ? this.block(r, d.x, d.z, d.angle) : this.block(r, r.x, r.z, r.angle);
  }
  // Points over a block, a man's spacing apart, in the world.
  blockPoints(k, pad = 0) {
    const sin = Math.sin(k.angle), cos = Math.cos(k.angle), pts = [];
    const nx = Math.max(1, Math.ceil((k.w + pad) * 2 / 1.5)), nz = Math.max(1, Math.ceil((k.back + 1 + pad * 2) / 1.5));
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
      const lx = -k.w - pad + i * (k.w + pad) * 2 / nx, lz = 1 + pad - j * (k.back + 1 + pad * 2) / nz;
      pts.push({ x: k.x + cos * lx + sin * lz, z: k.z - sin * lx + cos * lz });
    }
    return pts;
  }
  // Whether world point p is inside block k, grown by `pad` all round.
  inBlock(k, p, pad = 0) {
    const dx = p.x - k.x, dz = p.z - k.z, sin = Math.sin(k.angle), cos = Math.cos(k.angle);
    const lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
    return Math.abs(lx) <= k.w + pad && lz <= 1 + pad && lz >= -k.back - pad;
  }
  // The tracks and lanes villagers walk, and the paved roads: (x, z) is on one, give or take `pad`.
  onWay(x, z, pad = 0) {
    for (const a of this.roadAngles || []) {
      const along = x * Math.sin(a) + z * Math.cos(a), across = x * Math.cos(a) - z * Math.sin(a);
      if (along > 0 && Math.abs(across) < 3 + pad) return true;
    }
    for (const l of this.lanes || []) for (let i = 1; i < l.pts.length; i++) {
      const a = { x: l.pts[i - 1][0], z: l.pts[i - 1][1] }, b = { x: l.pts[i][0], z: l.pts[i][1] };
      if (segDist({ x, z }, a, b) < (l.width || 3) / 2 + pad) return true;
    }
    return this.roads.some(o => segDist({ x, z }, o.a, o.b) < ROAD.width / 2 + pad);
  }
  // What standing block k there costs: Infinity unless it is its own ground, clear of
  // buildings, the keep, walls and the blocks in `taken` (a few strides round each), and off
  // the roads and lanes if `roads`; otherwise how many of the standing `trees` it stands
  // among (a wooded village has little else near it, but open ground is better).
  groundCost(k, taken, trees, roads) {
    const GAP = 3, R = k.w + k.back + 4, blds = this.buildings.concat([this.keep]).filter(b => Math.hypot(b.x - k.x, b.z - k.z) < b.B.radius + R);
    const others = taken.filter(o => Math.hypot(o.x - k.x, o.z - k.z) < o.w + o.back + k.w + k.back + GAP * 2);
    const free = this.blockPoints(k, 0.5).every(p => !blds.some(b => Math.hypot(b.x - p.x, b.z - p.z) < b.B.radius + 1)
      && !others.some(o => this.inBlock(o, p, GAP)) && !this.battle.walls.pieceAt(p.x, p.z, null, 1.5) && !(roads && this.onWay(p.x, p.z, 1)));
    if (!free) return Infinity;
    let n = 0;
    for (const t of trees) if (Math.abs(t.x - k.x) < R && Math.abs(t.z - k.z) < R && this.inBlock(k, t, 1)) n++;
    return n;
  }
  // The blocks of your other regiments, standing or on their way.
  takenGround(but) {
    return this.battle.regs.filter(o => !but.includes(o) && o.side === 0 && !o.gone && !o.routing).map(o => this.standing(o));
  }
  // An army arriving by road forms up beside it, facing out along it: its regiments side by
  // side, a few strides apart, in lines of up to ~90 m on one side of the road, the next line
  // further out. The whole block goes where every regiment of it has its own place
  // (`groundCost`), off the road and lanes, as near the stand as it can and out of the
  // trees where it can; later arrivals find theirs the same way round the blocks already
  // there. If there is no such ground, each regiment finds the nearest place of its own
  // (`standSlot`).
  formUp(regs, angle, standAt, taken = this.takenGround(regs)) {
    if (!regs.length) return;
    const sin = Math.sin(angle), cos = Math.cos(angle), GAP = 3, ROW = 90, TREE = 3;
    const trees = this.nodes.tree.filter(t => t.standing);
    // lines across the road: [{ regs, w (the whole line's width), back }]
    const lines = [];
    for (const r of regs) {
      const k = this.block(r, 0, 0, angle), last = lines.at(-1), w = k.w * 2 + GAP * 2;
      if (last && last.w + w <= ROW) { last.regs.push([r, k]); last.w += w; last.back = Math.max(last.back, k.back); }
      else lines.push({ regs: [[r, k]], w, back: k.back });
    }
    // the whole block with its front line `along` the road, `off` metres to one side of it
    const place = (along0, side, off, most) => {
      const plan = [];
      let along = along0, cost = 0;
      for (const [n, l] of lines.entries()) {
        if (n) along += l.back + 1 + GAP * 2;
        let across = side * (3 + 1 + off);
        for (const [r, k] of l.regs) {
          across += side * (k.w + GAP);
          const b = this.block(r, sin * along + cos * across, cos * along - sin * across, angle);
          cost += this.groundCost(b, taken.concat(plan.map(p => p.b)), trees, true) * TREE;
          if (cost >= most) return null;
          plan.push({ r, b });
          across += side * (k.w + GAP);
        }
      }
      return { plan, cost };
    };
    const tries = [];
    for (let d = 0; d <= 80; d += 4) for (const da of d ? [d, -d] : [0]) for (let off = 0; off <= 40; off += 2) for (const side of [1, -1]) {
      const along = standAt + da;
      if (along > 8 && along < 180) tries.push({ along, side, off, cost: off + Math.abs(da) * (da < 0 ? 1.5 : 0.7) });
    }
    tries.sort((a, b) => a.cost - b.cost);
    let best = null;
    for (const t of tries) {
      if (best && t.cost >= best.cost) break;
      const got = place(t.along, t.side, t.off, best ? best.cost - t.cost : Infinity);
      if (got) best = { plan: got.plan, cost: t.cost + got.cost };
    }
    if (best) { for (const { r, b } of best.plan) r.dest = { x: b.x, z: b.z, angle }; return; }
    for (const r of regs) r.dest = this.standSlot(r, angle, standAt, taken.concat(regs.filter(o => o.dest).map(o => this.standing(o))));
  }
  // One regiment's own place near the road it came in by: the nearest free ground off the
  // roads, else the nearest free ground at all, else (with a warning) the nearest open ground.
  standSlot(r, angle, standAt, taken = this.takenGround([r])) {
    const sin = Math.sin(angle), cos = Math.cos(angle), spots = [];
    for (let along = 10; along < 180; along += 3) for (let across = -60; across <= 60; across += 3) {
      spots.push({ x: sin * along + cos * across, z: cos * along - sin * across, cost: Math.abs(across) + Math.abs(along - standAt) * 1.2 });
    }
    spots.sort((a, b) => a.cost - b.cost);
    for (const roads of [true, false]) for (const s of spots) {
      const k = this.block(r, s.x, s.z, angle);
      if (this.groundCost(k, taken, [], roads) < Infinity) return { x: k.x, z: k.z, angle };
    }
    const stand = this.openGround(sin * standAt, cos * standAt, Math.min(22, 5 + Math.sqrt(r.alive) * 1.3));
    console.warn(`standSlot: no free ground for ${r.name}; it stands at the nearest open ground`);
    this.event(`No room left for the ${r.name} to form up on their own: they stand where they can.`);
    return { x: stand.x, z: stand.z, angle };
  }

  // The nearest point to (x, z) with room for a body of men `r` across: clear of buildings,
  // the keep and walls. Falls back to (x, z) itself.
  openGround(x, z, r) {
    const clear = (px, pz) => !this.buildings.some(b => Math.hypot(b.x - px, b.z - pz) < b.B.radius + r)
      && Math.hypot(this.keep.x - px, this.keep.z - pz) > this.keep.B.radius + r && !this.battle.walls.pieceAt(px, pz, null, r);
    for (let d = 0; d <= 60; d += 4) for (let i = 0, n = Math.max(1, Math.round(d / 2)); i < n; i++) {
      const a = i / n * Math.PI * 2, px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d;
      if (clear(px, pz)) return { x: px, z: pz };
    }
    return { x, z };
  }

  // Regiments leaving for the world map. Levies take their villagers with them.
  takeTroops(regs) {
    const specs = [];
    for (const r of regs) {
      // The militia never leave their village.
      if (r.side !== 0 || r.gone || r.routing || r.T.militia) continue;
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
